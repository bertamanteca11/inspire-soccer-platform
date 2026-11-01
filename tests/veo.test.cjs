const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');
const XLSX = require('xlsx');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);

const { effectiveMinutes, calculateBonus, occurrenceBonusCents, performanceIndex, passingStats,
  VERIFIED_PARAMETERS, excelRound, sumKnown } = require('../src/veo/calculations.ts');
const { parseNumeric, parsePercentage, parseDateValue } = require('../src/veo/values.ts');
const { analyzeWorkbook, parseVeoBuffer } = require('../src/veo/parser.ts');
const { SHEETS, ROSTER_HEADERS, MATCH_HEADERS, PLAYER_HEADERS, SUMMARY_PAIRS, TEAM_PAIRS } = require('../src/veo/schema.ts');
const { METRIC_COLUMNS } = require('../src/veo/types.ts');
const metrics = () => Object.fromEntries(Object.keys(METRIC_COLUMNS).map(key => [key, 0]));
const fixturePath = 'data/BIG DATA EQUIPO.xlsx';
const hasFixture = fs.existsSync(fixturePath);

function put(workbook, sheet, address, value) {
  XLSX.utils.sheet_add_aoa(workbook.Sheets[sheet], [[value]], { origin: address });
}
function syntheticWorkbook(matches = [{ round: 5, goalsFor: 0, goalsAgainst: 0, goals: 0 }]) {
  const wb = XLSX.utils.book_new();
  for (const name of SHEETS) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), name);
  for (const [name, headers] of [['Plantilla', ROSTER_HEADERS], ['Partidos', MATCH_HEADERS], ['Datos por partido', PLAYER_HEADERS]]) {
    XLSX.utils.sheet_add_aoa(wb.Sheets[name], [headers], { origin: 'A1' });
  }
  const columns = (name, headers, row, offset = 0) => headers.forEach((header, i) => put(wb, name, `${XLSX.utils.encode_col(offset + i)}${row}`, header));
  columns('Equipo', ['Jornada', 'Rival', 'Fecha', 'Resultado', 'Marcador'], 3);
  for (const [left, right, label] of TEAM_PAIRS) {
    put(wb, 'Equipo', left+'3', label); put(wb, 'Equipo', left+'4', 'Inspire'); put(wb, 'Equipo', right+'4', 'Rival');
  }
  columns('Equipo', ['Jugadores usados', 'Distancia total (km)', 'Sprints', 'Carreras alta int.', 'Entradas', 'Intercepciones', 'Recuperaciones', 'Duelos', 'Regates'], 3, 29);
  columns('Resumen temporada', ['Nº', 'Jugador', 'Posición habitual', 'Grupo', 'Convocatorias', 'Partidos jugados', 'Titularidades', 'Minutos', 'Min / partido'], 3);
  for (const [left, right, label] of SUMMARY_PAIRS) {
    put(wb, 'Resumen temporada', left+'3', label); put(wb, 'Resumen temporada', left+'4', 'Total'); put(wb, 'Resumen temporada', right+'4', 'Media/partido');
  }
  columns('Resumen temporada', ['Vel. máx (km/h)', '% pase', 'Amarillas', 'Rojas', 'Porterías a cero cobradas', 'Índice medio', '€ Primas acumuladas'], 3, 39);
  put(wb, 'Instrucciones', 'A1', 'Temporada 2026/27');
  const params = [
    [5, 'Prima base por jugador (€)', 10], [6, 'Prima doblada (€)', 20], [7, 'Umbral para doblar (nº)', 8],
    [8, 'Minutos mínimos portería a cero', 65], [9, "Margen 'en la media' (±)", .1],
    [10, 'Minutos/partido mínimos para entrar en la media del equipo', 10],
    ...['Gol', 'Asistencia', 'Ocasión creada', 'Tiro', 'Entrada', 'Intercepción', 'Recuperación', 'Parada', 'Regate', 'Pase exitoso', 'Pase fallido', 'Tarjeta amarilla', 'Tarjeta roja']
      .map((name, i) => [12+i, name, [10,6,3,2,2,2,2,3,1,.2,-.1,-3,-8][i]]),
  ];
  params.forEach(([row, name, value]) => { put(wb, 'Instrucciones', `A${row}`, name); put(wb, 'Instrucciones', `B${row}`, value); });
  XLSX.utils.sheet_add_aoa(wb.Sheets.Plantilla, [[1, 'Ana', 'Ana Test', 'Portero', 'POR', 2000, '1 ene', 'Sí', null]], { origin: 'A2' });
  put(wb, 'Resumen temporada', 'A5', 1);
  matches.forEach((match, index) => {
    const row = index+2;
    XLSX.utils.sheet_add_aoa(wb.Sheets.Partidos, [[match.round, `2026-10-${String(10+index).padStart(2,'0')}`, 'Local', 'Rival de prueba', match.goalsFor, match.goalsAgainst]], { origin: `A${row}` });
    put(wb, 'Datos por partido', `A${row}`, match.round); put(wb, 'Datos por partido', `C${row}`, 1);
    put(wb, 'Datos por partido', `G${row}`, 'Ana Test #1');
    for (const [col, value] of [['H',1],['I',1],['J',90],['K',90]]) put(wb, 'Datos por partido', col+row, value);
    for (const col of Object.values(METRIC_COLUMNS)) put(wb, 'Datos por partido', col+row, 0);
    put(wb, 'Datos por partido', `N${row}`, match.goals);
  });
  return wb;
}

test('VEO blank falls back to FCF, explicit zero does not, uncalled always zero', () => {
  assert.equal(effectiveMinutes(true, 73, null), 73);
  assert.equal(effectiveMinutes(true, 73, 0), 0);
  assert.equal(effectiveMinutes(true, 90, 99), 99);
  assert.equal(effectiveMinutes(false, 90, 99), 0);
  assert.equal(effectiveMinutes(true, null, null), 0);
  assert.equal(effectiveMinutes(null, 90, 99), null);
});

test('clean sheet requires eligibility and strictly more than 65 minutes', () => {
  const input = { previousCleanSheets: 0, previousGoals: 0, previousAssists: 0,
    eligible: true, minutes: 65, goalsFor: 0, goalsAgainst: 0, goals: 0, assists: 0 };
  assert.equal(calculateBonus(input).cleanSheetCents, 0);
  assert.equal(calculateBonus({ ...input, minutes: 65.01 }).cleanSheetCents, 1000);
  assert.equal(calculateBonus({ ...input, minutes: 90, eligible: false }).cleanSheetCents, 0);
  assert.equal(calculateBonus({ ...input, minutes: 90, goalsAgainst: 1 }).cleanSheetCents, 0);
});

test('seventh occurrence is base, eighth doubles, crossing threshold counts each event', () => {
  assert.equal(occurrenceBonusCents(6, 1, true), 1000);
  assert.equal(occurrenceBonusCents(7, 1, true), 2000);
  assert.equal(occurrenceBonusCents(6, 3, true), 5000);
  assert.equal(occurrenceBonusCents(100, 2, false), 0);
  assert.throws(() => occurrenceBonusCents(1, -1, true));
});

test('losses advance goals counters without paying; category counters remain independent', () => {
  const preview = analyzeWorkbook(syntheticWorkbook([
    { round: 5, goalsFor: 6, goalsAgainst: 7, goals: 6 },
    { round: 6, goalsFor: 1, goalsAgainst: 1, goals: 1 },
    { round: 7, goalsFor: 1, goalsAgainst: 0, goals: 1 },
  ]));
  assert.equal(preview.bonusesBlocked, false);
  const [first, second, third] = preview.observations;
  assert.equal(first.bonus.goalsCents, 0);
  assert.equal(second.bonus.previousGoals, 6);
  assert.equal(second.bonus.goalsCents, 1000);
  assert.equal(third.bonus.previousGoals, 7);
  assert.equal(third.bonus.goalsCents, 2000);
  assert.equal(third.bonus.assistsCents, 0);
  assert.equal(third.bonus.cleanSheetCents, 1000);
});

test('historical counters follow round ordering rather than row or date order', () => {
  const preview = analyzeWorkbook(syntheticWorkbook([
    { round: 7, goalsFor: 1, goalsAgainst: 0, goals: 1 },
    { round: 5, goalsFor: 7, goalsAgainst: 8, goals: 7 },
  ]));
  assert.equal(preview.observations[0].bonus.goalsCents, 2000);
  assert.equal(preview.observations[1].bonus.goalsCents, 0);
});

test('numeric values, explicit units and dates are parsed strictly', () => {
  assert.equal(parseNumeric(null), null);
  assert.equal(parseNumeric('  '), null);
  assert.equal(parseNumeric(0), 0);
  assert.equal(parseNumeric('7,1 km', 'km'), 7.1);
  assert.equal(parseNumeric('28.3 km/h', 'km/h'), 28.3);
  assert.throws(() => parseNumeric('7 km/h', 'km'));
  assert.throws(() => parseNumeric('1,234'));
  assert.throws(() => parseNumeric(Infinity));
  assert.throws(() => parseNumeric(true));
  assert.equal(parsePercentage('69%'), .69);
  assert.equal(parsePercentage(.52), .52);
  assert.throws(() => parsePercentage(52));
  assert.equal(parseDateValue('18/10/2026'), '2026-10-18');
  assert.equal(parseDateValue('2026-10-18'), '2026-10-18');
  assert.equal(parseDateValue(1, true), '1904-01-02');
  assert.throws(() => parseDateValue('31/02/2026'));
  assert.throws(() => parseDateValue(60));
});

test('passing statistics, Excel rounding and missing sums retain their semantics', () => {
  assert.deepEqual(passingStats(49, 38), { failedPasses: 11, passingRate: 38/49 });
  assert.equal(passingStats(0, 0).passingRate, null);
  assert.equal(passingStats(49, null).failedPasses, null);
  assert.equal(excelRound(-1.25, 1), -1.3);
  assert.equal(excelRound(1.25, 1), 1.3);
  assert.equal(sumKnown([null, null]), null);
  assert.equal(sumKnown([null, 0]), 0);
});

test('index preserves missing inputs and is absent for nonparticipants', () => {
  const data = { ...metrics(), goals: 1, chances: null, passes: 10, successfulPasses: null };
  const original = JSON.stringify(data);
  assert.equal(performanceIndex(data, true, VERIFIED_PARAMETERS), 12);
  assert.equal(performanceIndex(data, false, VERIFIED_PARAMETERS), null);
  assert.equal(performanceIndex(data, null, VERIFIED_PARAMETERS), null);
  assert.equal(JSON.stringify(data), original);
});

test('duplicate match/player observations are surfaced and disable bonuses', () => {
  const wb = syntheticWorkbook();
  const ws = wb.Sheets['Datos por partido'];
  for (const col of ['A','C','G','H','I','J','K',...Object.values(METRIC_COLUMNS)]) put(wb, 'Datos por partido', col+'3', ws[col+'2'].v);
  const result = analyzeWorkbook(wb);
  assert.ok(result.issues.some(i => i.code === 'duplicate-observation'));
  assert.equal(result.observations.length, 2);
  assert.equal(result.bonusesBlocked, true);
  assert.ok(result.observations.every(p => p.bonus === null));
  const duplicateMatch = analyzeWorkbook(syntheticWorkbook([
    { round: 1, goalsFor: 0, goalsAgainst: 0, goals: 0 }, { round: 1, goalsFor: 0, goalsAgainst: 0, goals: 0 },
  ]));
  assert.ok(duplicateMatch.issues.some(i => i.code === 'duplicate-match'));
});

test('ambiguous profiles are flagged and no identities acquire UUIDs', () => {
  const wb = syntheticWorkbook();
  put(wb, 'Datos por partido', 'G2', 'Pol Pariente #11 (perfil)');
  const result = analyzeWorkbook(wb);
  assert.equal(result.observations[0].identity.status, 'ambiguous');
  assert.equal(result.observations[0].identity.supabasePlayerId, null);
  assert.equal(result.matches[0].match.supabaseSessionId, null);
  assert.ok(result.issues.some(i => i.code === 'ambiguous-identity'));
});

test('malformed source values, formulas in inputs and unsupported parameters block calculations', () => {
  const wb = syntheticWorkbook();
  put(wb, 'Datos por partido', 'K2', 'many minutes');
  let result = analyzeWorkbook(wb);
  assert.ok(result.issues.some(i => i.code === 'invalid-number' && i.cell === 'K2'));
  assert.equal(result.bonusesBlocked, true);
  assert.equal(result.observations[0].effectiveMinutes, null);
  const changed = syntheticWorkbook(); put(changed, 'Instrucciones', 'B5', 50);
  result = analyzeWorkbook(changed);
  assert.equal(result.parameters, null);
  assert.equal(result.observations[0].index, null);
  assert.equal(result.observations[0].bonus, null);
  const formula = syntheticWorkbook(); formula.Sheets['Datos por partido'].N2 = { t: 'n', v: 7, f: 'SUM(7)' };
  assert.ok(analyzeWorkbook(formula).issues.some(i => i.code === 'formula-in-source'));
});

test('missing sheets/headers and non-XLSX files produce inspectable failures', () => {
  const wb = syntheticWorkbook(); delete wb.Sheets.Equipo;
  assert.ok(analyzeWorkbook(wb).issues.some(i => i.code === 'missing-sheet'));
  const bad = syntheticWorkbook(); put(bad, 'Datos por partido', 'J1', 'Wrong header');
  assert.ok(analyzeWorkbook(bad).issues.some(i => i.code === 'invalid-header'));
  assert.throws(() => parseVeoBuffer(new Uint8Array([1,2,3,4])));
  assert.throws(() => parseVeoBuffer(new Uint8Array(0)));
});

test('formula-only template rows are excluded while genuine nonparticipants remain', () => {
  const wb = syntheticWorkbook();
  wb.Sheets['Datos por partido'].L100 = { t: 'n', v: 0, f: 'IF(H100=0,0,K100)' };
  wb.Sheets['Datos por partido']['!ref'] = 'A1:BA100';
  assert.equal(analyzeWorkbook(wb).observations.length, 1);
  put(wb, 'Datos por partido', 'H2', 0); put(wb, 'Datos por partido', 'I2', 0);
  put(wb, 'Datos por partido', 'J2', 0); put(wb, 'Datos por partido', 'K2', 0);
  const result = analyzeWorkbook(wb);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].participated, false);
});

test('zero-filled rows without identity are templates; partial named rows are errors', () => {
  const wb = syntheticWorkbook();
  for (const col of ['H', 'I', 'J', 'K', ...Object.values(METRIC_COLUMNS)]) put(wb, 'Datos por partido', col+'50', 0);
  assert.equal(analyzeWorkbook(wb).observations.length, 1);
  put(wb, 'Datos por partido', 'G50', 'Unknown person');
  const result = analyzeWorkbook(wb);
  assert.equal(result.observations.length, 2);
  assert.ok(result.issues.some(i => i.code === 'required' && i.cell === 'A50'));
});

test('oversized ranges, oversized files and external formulas are rejected safely', () => {
  const wb = syntheticWorkbook();
  wb.Sheets['Datos por partido']['!fullref'] = 'A1:BA6000';
  assert.throws(() => analyzeWorkbook(wb), /truncadas/);
  assert.throws(() => parseVeoBuffer(new Uint8Array(10 * 1024 * 1024 + 1)), /10 MB/);
  const external = syntheticWorkbook();
  external.Sheets['Datos por partido'].N2 = { t: 'n', v: 100, f: "'[remote.xlsx]Sheet1'!A1" };
  const result = analyzeWorkbook(external);
  assert.ok(result.issues.some(i => i.code === 'external-formula'));
  assert.equal(result.bonusesBlocked, true);
});

test('pilot references flag changed inputs instead of replacing calculated output', { skip: !hasFixture && 'Private source workbook not present locally' }, () => {
  const wb = XLSX.read(fs.readFileSync(fixturePath));
  put(wb, 'Datos por partido', 'N11', 2);
  const result = analyzeWorkbook(wb);
  assert.equal(result.matches[0].totals.goals, 4);
  assert.equal(result.matches[0].totals.bonusCents, 4000);
  assert.ok(result.matches[0].pilot.some(check => !check.matches));
});

test('missing goal/assist inputs keep raw nulls and disable unreliable financial totals', () => {
  const wb = syntheticWorkbook(); delete wb.Sheets['Datos por partido'].O2;
  const result = analyzeWorkbook(wb);
  assert.equal(result.observations[0].metrics.assists, null);
  assert.equal(result.observations[0].index, 0);
  assert.equal(result.bonusesBlocked, true);
  assert.equal(result.matches[0].totals.bonusCents, null);
});

test('reimport preview is deterministic and does not mutate source workbook', () => {
  const wb = syntheticWorkbook(); const before = JSON.stringify(wb);
  assert.deepEqual(analyzeWorkbook(wb), analyzeWorkbook(wb));
  assert.equal(JSON.stringify(wb), before);
});

test('real workbook pilot reproduces all independently verified references', { skip: !hasFixture && 'Private source workbook not present locally' }, () => {
  const buffer = fs.readFileSync(fixturePath);
  const before = crypto.createHash('sha256').update(buffer).digest('hex');
  const result = parseVeoBuffer(buffer);
  assert.equal(result.issues.filter(i => i.severity === 'error').length, 0);
  assert.equal(result.matches.length, 1);
  assert.equal(result.observations.length, 23);
  assert.equal(result.roster.length, 23);
  assert.equal(result.matches[0].pilot.length, 14);
  assert.ok(result.matches[0].pilot.every(check => check.matches));
  assert.equal(result.matches[0].totals.bonusCents, 3000);
  assert.equal(result.sourceCells.find(c => c.sheet === 'Datos por partido' && c.address === 'AP14').formula.includes('ROUND'), true);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex'), before);
  assert.deepEqual(parseVeoBuffer(buffer), result);
});

test('real workbook corrections, source separation and discrepancies remain visible', { skip: !hasFixture && 'Private source workbook not present locally' }, () => {
  const result = parseVeoBuffer(fs.readFileSync(fixturePath));
  const montoro = result.observations.find(p => p.jersey === 10);
  const eloy = result.observations.find(p => p.jersey === 13);
  assert.equal(montoro.metrics.goals, 1);
  assert.equal(montoro.metrics.shots, 2);
  assert.match(montoro.notes, /\+1 gol/);
  assert.equal(eloy.metrics.saves, 16);
  assert.equal(eloy.metrics.interceptions, 0);
  assert.equal(eloy.index, 61.1);
  assert.ok(result.observations.every(p => p.metrics.chances === null));
  assert.equal(result.matches[0].teams[0].inspire.attempts, 14);
  assert.equal(sumKnown(result.observations.map(p => p.metrics.shots)), 15);
  assert.ok(result.issues.some(i => i.code === 'manual-ranking' && i.cell === 'N2'));
  assert.equal(result.observations.find(p => p.jersey === 11).identity.status, 'ambiguous');
  assert.equal(result.observations.find(p => p.jersey === 18).identity.status, 'ambiguous');
  assert.ok(result.issues.some(i => i.code === 'imported-history-only'));
  assert.ok(!result.issues.some(i => i.code === 'reconciliation'));
});

test('preview modules have no Supabase or network-write dependency and no bundled source workbook', () => {
  for (const file of ['parser.ts', 'preview.ts', 'calculations.ts', 'values.ts', 'schema.ts', 'client.ts', 'worker.ts']) {
    const source = fs.readFileSync(`src/veo/${file}`, 'utf8');
    assert.doesNotMatch(source, /from ['"].*supabase|supabase\.|fetch\(|XMLHttpRequest|localStorage/);
    assert.doesNotMatch(source, /import .*\.xlsx|readFile.*BIG DATA/);
  }
  const page = fs.readFileSync('src/pages/VeoPreviewPage.tsx', 'utf8');
  assert.doesNotMatch(page, /supabase\.|fetch\(|localStorage|dangerouslySetInnerHTML/);
  assert.match(page, /role !== 'admin'/);
  assert.equal(fs.existsSync('public/BIG DATA EQUIPO.xlsx'), false);
});
