import { read, utils, type WorkBook, type WorkSheet } from 'xlsx';
import { VERIFIED_PARAMETERS } from './calculations';
import { cachedNumber, isBlank, parseDateValue, parseNumeric, parsePercentage } from './values';
import { MATCH_HEADERS, MAX_FILE_BYTES, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, normalizeIdentity,
  PLAYER_HEADERS, PLAYER_SOURCE_COLUMNS, ROSTER_HEADERS, SHEETS, SUMMARY_PAIRS, TEAM_PAIRS } from './schema';
import { METRIC_COLUMNS, type Issue, type Match, type Metric, type Observation, type Parameters,
  type Preview, type RosterPlayer, type Scalar, type SourceCell, type SourceRow, type TeamStats } from './types';
import { buildPreview } from './preview';

export function parseVeoBuffer(buffer: ArrayBuffer | Uint8Array): Preview {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error('Selecciona un .xlsx de hasta 10 MB.');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) throw new Error('El archivo no es un contenedor .xlsx válido.');
  const workbook = read(bytes, { type: 'array', cellFormula: true, cellNF: true,
    cellHTML: false, bookVBA: true, sheetRows: MAX_SHEET_ROWS + 1 });
  if (workbook.vbaraw) throw new Error('No se admiten libros con macros.');
  return analyzeWorkbook(workbook);
}

export function analyzeWorkbook(workbook: WorkBook): Preview {
  const issues: Issue[] = [];
  const sourceCells: SourceCell[] = [];
  const issue = (severity: Issue['severity'], code: string, sheet: string, cell: string, message: string) => {
    issues.push({ severity, code, sheet, cell, message });
  };
  const cell = (sheet: string, address: string): SourceCell => {
    const original = workbook.Sheets[sheet]?.[address];
    const raw: unknown = original?.v;
    const value: Scalar = raw == null ? null : typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? raw : String(raw);
    return { sheet, address, value, formatted: original?.w ?? null, formula: original?.f ?? null, type: original?.t ?? null };
  };
  const get = (sheet: string, address: string) => cell(sheet, address).value;
  const rowSource = (sheet: string, row: number, last: number): SourceRow => ({ sheet, row,
    cells: Object.fromEntries(Array.from({ length: last }, (_, index) => {
      const col = utils.encode_col(index); return [col, cell(sheet, `${col}${row}`)];
    })),
  });
  const text = (sheet: string, address: string, required = false): string | null => {
    const value = get(sheet, address);
    if (isBlank(value)) {
      if (required) issue('error', 'required', sheet, address, 'Falta un texto obligatorio para identificar el registro.');
      return null;
    }
    if (typeof value !== 'string') {
      issue('error', 'invalid-text', sheet, address, 'Se esperaba texto.'); return null;
    }
    return value.trim();
  };
  const number = (sheet: string, address: string, options: { required?: boolean; integer?: boolean; unit?: 'km' | 'km/h'; signed?: boolean; percentage?: boolean } = {}) => {
    try {
      const result = options.percentage ? parsePercentage(get(sheet, address)) : parseNumeric(get(sheet, address), options.unit);
      if (result === null) {
        if (options.required) issue('error', 'required', sheet, address, 'Falta un número obligatorio.');
        return null;
      }
      if ((!options.signed && result < 0) || (options.integer && !Number.isSafeInteger(result)) || Math.abs(result) > 1e9) throw new Error('Valor negativo, no entero o fuera del rango admitido.');
      return result;
    } catch (error) {
      issue('error', 'invalid-number', sheet, address, error instanceof Error ? error.message : 'Número no válido.');
      return null;
    }
  };
  const flag = (sheet: string, address: string, binary = false): boolean | null => {
    const value = get(sheet, address);
    if (binary && (value === 0 || value === 1)) return value === 1;
    if (!binary && typeof value === 'string') {
      const normalized = normalizeIdentity(value);
      if (normalized === 'si' || normalized === 'no') return normalized === 'si';
    }
    issue('error', 'invalid-flag', sheet, address, binary ? 'Convocado/Titular debe ser un 0 o 1 numérico.' : 'La elegibilidad debe ser Sí o No.');
    return null;
  };
  const literal = (sheet: string, row: number, columns: readonly string[]) => {
    for (const col of columns) {
      const original = cell(sheet, `${col}${row}`);
      if (original.formula) issue('error', 'formula-in-source', sheet, original.address,
        'Hay una fórmula en una entrada manual. Se conserva para inspección; no se ejecuta ni se usa como fuente fiable.');
    }
  };
  const realRows = (sheet: string, start: number, columns: readonly string[]) => {
    const ws = workbook.Sheets[sheet];
    if (!ws?.['!ref']) return [];
    const last = utils.decode_range(ws['!ref']).e.r + 1;
    const result: number[] = [];
    for (let row = start; row <= last; row++) {
      // Formula-only template rows and formatted blanks are not observations.
      if (columns.some(col => { const c = cell(sheet, `${col}${row}`); return !c.formula && !isBlank(c.value); })) result.push(row);
    }
    return result;
  };
  const expectHeader = (sheet: string, address: string, expected: string) => {
    if (normalizeIdentity(String(get(sheet, address) ?? '')) !== normalizeIdentity(expected)) {
      issue('error', 'invalid-header', sheet, address, `Cabecera esperada: «${expected}». No se interpreta una columna desconocida por posición.`);
    }
  };
  for (const name of SHEETS) {
    if (!workbook.Sheets[name]) issue('error', 'missing-sheet', name, '', `Falta la hoja «${name}».`);
  }
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const fullRange = (ws as WorkSheet & { '!fullref'?: string })['!fullref'] || ws['!ref'];
    if (fullRange) {
      const range = utils.decode_range(fullRange);
      if (range.e.r >= MAX_SHEET_ROWS || range.e.c >= MAX_SHEET_COLUMNS) throw new Error(`La hoja «${name}» excede el límite de 5.000 filas o 64 columnas. No se aceptan lecturas truncadas.`);
    }
    if (!SHEETS.includes(name as typeof SHEETS[number])) issue('warning', 'extra-sheet', name, '', 'Hoja adicional conservada como fuente; no se importa como datos VEO.');
    for (const address of Object.keys(ws).filter(key => /^[A-Z]+\d+$/.test(key))) {
      const source = cell(name, address);
      if (!isBlank(source.value) || source.formula) sourceCells.push(source);
      if (source.type === 'e') issue('error', 'excel-error', name, address, `Error Excel: ${String(source.value)}.`);
      if (source.formula && (/\[[^\]]*\]/.test(source.formula) || /https?:/i.test(source.formula))) issue('error', 'external-formula', name, address, 'Referencia externa no admitida; no se ejecuta.');
    }
    if (sourceCells.length > 100000) throw new Error('Demasiadas celdas con contenido para esta previsualización local.');
  }
  const metadata = workbook.SheetNames.map(name => ({ name, range: workbook.Sheets[name]?.['!ref'] || '', realRecords: 0 }));
  const empty = (): Preview => ({ version: 'veo-preview-v1', sheets: metadata, sourceCells,
    roster: [], matches: [], observations: [], parameters: null, parameterCells: [], issues, bonusesBlocked: true });
  if (issues.some(i => i.code === 'missing-sheet')) return empty();

  for (const [sheet, headers] of [['Plantilla', ROSTER_HEADERS], ['Partidos', MATCH_HEADERS], ['Datos por partido', PLAYER_HEADERS]] as const) {
    headers.forEach((header, index) => expectHeader(sheet, `${utils.encode_col(index)}1`, header));
  }
  ['Jornada', 'Rival', 'Fecha', 'Resultado', 'Marcador'].forEach((header, i) => expectHeader('Equipo', `${utils.encode_col(i)}3`, header));
  for (const [left, right, label] of TEAM_PAIRS) {
    expectHeader('Equipo', `${left}3`, label);
    expectHeader('Equipo', `${left}4`, 'Inspire'); expectHeader('Equipo', `${right}4`, 'Rival');
  }
  ['Jugadores usados', 'Distancia total (km)', 'Sprints', 'Carreras alta int.', 'Entradas', 'Intercepciones', 'Recuperaciones', 'Duelos', 'Regates']
    .forEach((header, i) => expectHeader('Equipo', `${utils.encode_col(29 + i)}3`, header));
  ['Nº', 'Jugador', 'Posición habitual', 'Grupo', 'Convocatorias', 'Partidos jugados', 'Titularidades', 'Minutos', 'Min / partido']
    .forEach((header, i) => expectHeader('Resumen temporada', `${utils.encode_col(i)}3`, header));
  for (const [left, right, label] of SUMMARY_PAIRS) {
    expectHeader('Resumen temporada', `${left}3`, label);
    expectHeader('Resumen temporada', `${left}4`, 'Total'); expectHeader('Resumen temporada', `${right}4`, 'Media/partido');
  }
  ['Vel. máx (km/h)', '% pase', 'Amarillas', 'Rojas', 'Porterías a cero cobradas', 'Índice medio', '€ Primas acumuladas']
    .forEach((header, i) => expectHeader('Resumen temporada', `${utils.encode_col(39 + i)}3`, header));
  if (issues.some(i => i.code === 'invalid-header')) return empty();

  const parameterCells: SourceCell[] = [];
  const parameterSpecifications = [
    [5, 'Prima base por jugador (€)', 10], [6, 'Prima doblada (€)', 20],
    [7, 'Umbral para doblar (nº)', 8], [8, 'Minutos mínimos portería a cero', 65],
    [9, "Margen 'en la media' (±)", 0.1], [10, 'Minutos/partido mínimos para entrar en la media del equipo', 10],
    [12, 'Gol', 10], [13, 'Asistencia', 6], [14, 'Ocasión creada', 3], [15, 'Tiro', 2],
    [16, 'Entrada', 2], [17, 'Intercepción', 2], [18, 'Recuperación', 2], [19, 'Parada', 3],
    [20, 'Regate', 1], [21, 'Pase exitoso', 0.2], [22, 'Pase fallido', -0.1],
    [23, 'Tarjeta amarilla', -3], [24, 'Tarjeta roja', -8],
  ] as const;
  for (const [r, label, expected] of parameterSpecifications) {
    expectHeader('Instrucciones', `A${r}`, label);
    parameterCells.push(cell('Instrucciones', `B${r}`));
    literal('Instrucciones', r, ['B']);
    const actual = number('Instrucciones', `B${r}`, { required: true, signed: true });
    if (actual !== null && actual !== expected) issue('error', 'unsupported-parameters', 'Instrucciones', `B${r}`, `Regla distinta de la versión verificada (${expected}). Requiere revisar la metodología antes de calcular índices o primas.`);
  }
  const parameters: Parameters | null = issues.some(i => i.severity === 'error' && i.sheet === 'Instrucciones') ? null
    : { ...VERIFIED_PARAMETERS, weights: { ...VERIFIED_PARAMETERS.weights } };

  const rosterRows = realRows('Plantilla', 2, ROSTER_HEADERS.map((_, i) => utils.encode_col(i)));
  const roster: RosterPlayer[] = rosterRows.map(row => {
    const s = 'Plantilla'; literal(s, row, ROSTER_HEADERS.map((_, i) => utils.encode_col(i)));
    const jersey = number(s, `A${row}`, { required: true, integer: true });
    if (jersey === 0) issue('error', 'invalid-jersey', s, `A${row}`, 'El dorsal debe ser mayor que cero.');
    const group = text(s, `E${row}`, true);
    if (group && !['POR', 'DEF', 'MED', 'ATA'].includes(group)) issue('error', 'invalid-group', s, `E${row}`, 'Grupo desconocido.');
    return { row, jersey, name: text(s, `B${row}`, true), fullName: text(s, `C${row}`, true),
      position: text(s, `D${row}`), group, birthYear: number(s, `F${row}`, { integer: true }),
      birthday: text(s, `G${row}`), cleanSheetEligible: flag(s, `H${row}`), notes: text(s, `I${row}`), source: rowSource(s, row, 9) };
  });
  const duplicate = <T,>(rows: T[], key: (row: T) => string | null, sheet: string, address: (row: T) => string, code: string) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) { const id = key(row); if (id !== null) grouped.set(id, [...(grouped.get(id) || []), row]); }
    for (const [id, group] of grouped) if (group.length > 1) for (const row of group) issue('error', code, sheet, address(row), `Identificador duplicado «${id}». No se elige ni combina una fila automáticamente.`);
  };
  duplicate(roster, p => p.jersey === null ? null : String(p.jersey), 'Plantilla', p => `A${p.row}`, 'duplicate-roster');
  duplicate(roster, p => p.fullName ? normalizeIdentity(p.fullName) : null, 'Plantilla', p => `C${p.row}`, 'duplicate-name');

  const matchRows = realRows('Partidos', 2, ['A', 'B', 'C', 'D', 'E', 'F', 'J', 'K', 'L', 'M', 'N', 'O']);
  const matches: Match[] = matchRows.map(row => {
    const s = 'Partidos'; literal(s, row, ['A', 'B', 'C', 'D', 'E', 'F', 'J', 'K', 'L', 'M', 'N', 'O']);
    let date: string | null = null;
    try { date = parseDateValue(get(s, `B${row}`), !!workbook.Workbook?.WBProps?.date1904); }
    catch (error) { issue('error', 'invalid-date', s, `B${row}`, error instanceof Error ? error.message : 'Fecha inválida.'); }
    if (!date) issue('error', 'required', s, `B${row}`, 'El partido necesita una fecha válida.');
    const round = number(s, `A${row}`, { required: true, integer: true });
    if (round === 0) issue('error', 'invalid-round', s, `A${row}`, 'La jornada debe ser mayor que cero.');
    const venue = text(s, `C${row}`, true);
    if (venue && !['local', 'visitante', 'neutral'].includes(normalizeIdentity(venue))) issue('error', 'invalid-venue', s, `C${row}`, 'Localía desconocida.');
    return { row, round, date, venue, opponent: text(s, `D${row}`, true),
      goalsFor: number(s, `E${row}`, { integer: true }), goalsAgainst: number(s, `F${row}`, { integer: true }),
      field: text(s, `J${row}`), fcfReference: text(s, `K${row}`), coach: text(s, `L${row}`),
      manualMvp: text(s, `M${row}`), manualMvpReason: text(s, `N${row}`), notes: text(s, `O${row}`),
      supabaseSessionId: null, source: rowSource(s, row, 16) };
  });
  duplicate(matches, m => m.round === null ? null : String(m.round), 'Partidos', m => `A${m.row}`, 'duplicate-match');
  duplicate(matches, m => m.date && m.opponent ? `${m.date}/${normalizeIdentity(m.opponent)}/${normalizeIdentity(m.venue || '')}` : null,
    'Partidos', m => `B${m.row}`, 'duplicate-match-date');

  const observationRows = realRows('Datos por partido', 2, PLAYER_SOURCE_COLUMNS).filter(row => {
    if (!isBlank(get('Datos por partido', `A${row}`)) || !isBlank(get('Datos por partido', `C${row}`))) return true;
    // A zero-filled template without either identity is not a real observation.
    // Partial rows containing a name, note or a nonzero value remain inspectable errors.
    return PLAYER_SOURCE_COLUMNS.some(col => {
      const source = cell('Datos por partido', `${col}${row}`);
      return !source.formula && !isBlank(source.value) && source.value !== 0;
    });
  });
  const observations: Observation[] = observationRows.map(row => {
    const s = 'Datos por partido'; literal(s, row, PLAYER_SOURCE_COLUMNS);
    const round = number(s, `A${row}`, { required: true, integer: true });
    const jersey = number(s, `C${row}`, { required: true, integer: true });
    const candidates = roster.filter(p => p.jersey === jersey && jersey !== null);
    const linkedRoster = candidates.length === 1 ? candidates[0] : null;
    if (!linkedRoster) issue('error', 'unresolved-roster', s, `C${row}`, 'Dorsal sin correspondencia única en Plantilla.');
    if (matches.filter(m => m.round === round && round !== null).length !== 1) issue('error', 'unresolved-match', s, `A${row}`, 'Jornada sin correspondencia única en Partidos.');
    const profile = text(s, `G${row}`), notes = text(s, `BA${row}`);
    const reasons: string[] = ['No se ha confirmado ningún UUID de Supabase.'];
    const profileName = normalizeIdentity((profile || '').replace(/#\s*\d+.*/, ''));
    const rosterTokens = normalizeIdentity(`${linkedRoster?.name || ''} ${linkedRoster?.fullName || ''}`).split(' ');
    const profileTokens = profileName.split(' ').filter(t => t.length > 2);
    const profileJersey = /#\s*(\d+)/.exec(profile || '');
    const ambiguous = candidates.length !== 1 || !profile || profileName === 'jersey'
      || !!(profileJersey && Number(profileJersey[1]) !== jersey)
      || !profileTokens.some(t => rosterTokens.includes(t))
      || /perfil|confirmar|asignado/i.test(`${profile || ''} ${notes || ''}`);
    if (ambiguous) {
      reasons.push('Perfil ausente, genérico, reutilizado o sin coincidencia inequívoca. Requiere confirmación humana.');
      issue('warning', 'ambiguous-identity', s, `G${row}`, `${linkedRoster?.name || 'Jugador'}: ${reasons[1]}`);
    }
    const metrics = Object.fromEntries(Object.entries(METRIC_COLUMNS).map(([key, col]) => {
      const unit = key === 'distanceKm' ? 'km' : key.endsWith('Kmh') ? 'km/h' : undefined;
      return [key, number(s, `${col}${row}`, { integer: !unit, unit })];
    })) as Observation['metrics'];
    if (metrics.successfulPasses !== null && metrics.passes !== null && metrics.successfulPasses > metrics.passes) issue('error', 'invalid-passes', s, `AH${row}`, 'Los pases exitosos superan los pases totales.');
    if (metrics.successfulPasses !== null && metrics.passes === null) issue('error', 'missing-passes', s, `AG${row}`, 'Hay pases exitosos sin un total de pases.');
    const calledUp = flag(s, `H${row}`, true), starter = flag(s, `I${row}`, true);
    const fcfMinutes = number(s, `J${row}`), veoMinutes = number(s, `K${row}`);
    if (starter && calledUp === false) issue('error', 'invalid-participation', s, `I${row}`, 'Titular sin convocatoria en el libro.');
    if (calledUp === false && ((fcfMinutes ?? 0) > 0 || (veoMinutes ?? 0) > 0)) issue('warning', 'uncalled-minutes', s, `H${row}`, 'Hay minutos sin convocatoria: la fórmula del libro usa cero; conserva y revisa las entradas.');
    if (calledUp && fcfMinutes === null && veoMinutes === null) issue('warning', 'missing-minutes', s, `J${row}`, 'Faltan ambas fuentes de minutos. La fórmula usa cero; esto no demuestra una ausencia.');
    return { row, round, jersey, roster: linkedRoster, name: linkedRoster?.name || null, profile,
      calledUp, starter, fcfMinutes, veoMinutes, metrics, notes, source: rowSource(s, row, 53), valid: true,
      identity: { status: ambiguous ? 'ambiguous' : 'unresolved', reasons, supabasePlayerId: null } };
  });
  duplicate(observations, p => p.round !== null && p.jersey !== null ? `${p.round}/${p.jersey}` : null,
    'Datos por partido', p => `C${p.row}`, 'duplicate-observation');
  for (const row of observations) row.valid = !issues.some(i => i.severity === 'error' && i.sheet === 'Datos por partido' && /\d+$/.exec(i.cell)?.[0] === String(row.row));

  const teams: TeamStats[] = [];
  const teamRows = realRows('Equipo', 5, ['A', ...TEAM_PAIRS.filter(pair => !['goals', 'conversion', 'passingRate'].includes(pair[3])).flatMap(pair => [pair[0], pair[1]])]);
  for (const row of teamRows) {
    // Narrative analysis below the table is text in column A, not a match row.
    const key = get('Equipo', `A${row}`);
    if (typeof key === 'string' && !/^\s*\d+(?:[.,]0+)?\s*$/.test(key)) {
      if (TEAM_PAIRS.some(([left, right]) => !isBlank(get('Equipo', `${left}${row}`)) || !isBlank(get('Equipo', `${right}${row}`)))) issue('error', 'invalid-team-row', 'Equipo', `A${row}`, 'Estadísticas de equipo sin jornada numérica.');
      continue;
    }
    const round = number('Equipo', `A${row}`, { required: true, integer: true });
    const sides = { inspire: {} as Record<string, number | null>, opponent: {} as Record<string, number | null> };
    for (const [left, right, , metric] of TEAM_PAIRS) {
      if (['goals', 'conversion', 'passingRate'].includes(metric)) continue;
      literal('Equipo', row, [left, right]);
      sides.inspire[metric] = number('Equipo', `${left}${row}`, { percentage: metric === 'possession', integer: metric !== 'possession' });
      sides.opponent[metric] = number('Equipo', `${right}${row}`, { percentage: metric === 'possession', integer: metric !== 'possession' });
    }
    if (matches.filter(m => m.round === round).length !== 1) issue('error', 'unresolved-team-match', 'Equipo', `A${row}`, 'Equipo no se puede vincular a un partido único.');
    teams.push({ row, round, ...sides, source: rowSource('Equipo', row, 38) });
  }
  duplicate(teams, t => t.round === null ? null : String(t.round), 'Equipo', t => `A${t.row}`, 'duplicate-team');
  if (!roster.length || !matches.length || !observations.length) issue('error', 'empty-data', '', '', 'El libro no contiene plantilla, partidos y observaciones reales suficientes.');
  for (const match of matches) {
    const missing = roster.filter(player => !observations.some(row => row.round === match.round && row.jersey === player.jersey));
    if (missing.length) issue('warning', 'missing-observations', 'Partidos', `A${match.row}`, `${missing.length} jugadores de Plantilla sin observación para este partido. No se inventan filas.`);
  }
  const counts: Record<string, number> = { Plantilla: roster.length, Partidos: matches.length,
    'Datos por partido': observations.length, Equipo: teams.length,
    'Resumen temporada': realRows('Resumen temporada', 5, ['A']).filter(row => cachedNumber(get('Resumen temporada', `A${row}`)) !== null).length,
    Instrucciones: parameterCells.length };
  metadata.forEach(sheet => { sheet.realRecords = counts[sheet.name] || 0; });
  return buildPreview({ roster, matches, observations, teams, parameters, parameterCells, sourceCells, sheets: metadata, issues });
}
