const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Test-only TS loader: no dependencies, emitted files or production config changes.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}

const { isOfficialPerformanceSession, OFFICIAL_PERFORMANCE_START } = require('../src/utils/performance.ts');
const { evaluationTotal, fieldScore, SCORE_FIELDS } = require('../src/utils/evaluationScores.ts');
const { sortPlayersByJersey } = require('../src/utils/playerOrder.ts');
const { attendanceStats, isUnjustifiedAbsence, uniqueAttendanceRecords,
  attendanceRanking, readAttendancePages } = require('../src/utils/attendance.ts');

test('official cutoff is October 14 inclusive, independent of timezone', () => {
  assert.equal(OFFICIAL_PERFORMANCE_START, '2026-10-14');
  assert.equal(isOfficialPerformanceSession({ session_date: '2026-10-13' }), false);
  assert.equal(isOfficialPerformanceSession({ session_date: '2026-10-14' }), true);
  assert.equal(isOfficialPerformanceSession({ session_date: '2026-10-21' }), true);
  assert.equal(isOfficialPerformanceSession(null), false);
  assert.equal(isOfficialPerformanceSession({}), false);
});

test('Records Only is excluded, null/false follow the existing view semantics', () => {
  for (const records_only_confirmed of [null, false, undefined]) {
    assert.equal(isOfficialPerformanceSession({ session_date: '2026-10-14', records_only_confirmed }), true);
  }
  assert.equal(isOfficialPerformanceSession({ session_date: '2026-10-21', records_only_confirmed: true }), false);
});

test('N/A and missing scores are excluded without replacing them with zero', () => {
  const row = { tactical_discipline: 5, effort_commitment: 1, decision_making: null,
    na_fields: { effort_commitment: true } };
  assert.equal(evaluationTotal(row), 5);
  assert.equal(fieldScore(row, 'decision_making'), null);
  assert.equal(evaluationTotal({ ...row, not_applicable: true }), null);
  assert.equal(evaluationTotal({}), null);
  assert.equal(evaluationTotal(null), null);
});

test('Susan-approved current methodology averages four qualities and excludes the retired fifth', () => {
  assert.equal(SCORE_FIELDS.length, 4);
  const row = {...Object.fromEntries(SCORE_FIELDS.map(field => [field, 5])),coachability:1};
  assert.equal(evaluationTotal(row), 5);
  assert.equal(row.coachability,1);
});

test('jerseys sort numerically, missing last, duplicate numbers alphabetically, without mutation', () => {
  const players = [
    { shirt_number: null, display_name: 'Zulu' },
    { shirt_number: 10, display_name: 'Zulu' },
    { shirt_number: '2', display_name: 'Bruno' },
    { shirt_number: 10, display_name: 'Ana' },
    { shirt_number: undefined, display_name: 'Ana' },
    { shirt_number: 1, display_name: 'Carlos' },
  ];
  const original = [...players];
  assert.deepEqual(sortPlayersByJersey(players).map(p => p.display_name),
    ['Carlos', 'Bruno', 'Ana', 'Zulu', 'Ana', 'Zulu']);
  assert.deepEqual(players, original);
});

test('equal jersey/name keys retain stable input order', () => {
  const players = [{ id: 'first', shirt_number: 7, display_name: 'Ana' },
    { id: 'second', shirt_number: 7, display_name: 'Ana' }];
  assert.deepEqual(sortPlayersByJersey(players).map(p => p.id), ['first', 'second']);
});

test('chart uses the same N/A-aware total as the profile, never stored total_score', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { MiniLineChart } = require('../src/components/MiniLineChart.tsx');
  const html = renderToStaticMarkup(React.createElement(MiniLineChart, { data: [
    { tactical_discipline: 5, effort_commitment: 1, total_score: 1,
      na_fields: { effort_commitment: true } },
    { total_score: 0, not_applicable: true },
  ] }));
  assert.equal((html.match(/<circle /g) || []).length, 1);
  assert.match(html, /cy="0"/);
  assert.match(html, /media: 5/);
});

test('performance queries are centralized; input and historical detail keep evaluations', () => {
  const read = file => fs.readFileSync(file, 'utf8');
  assert.match(read('src/lib/performance.ts'), /from\('official_evaluations'\)/);
  for (const name of ['HomePage', 'PlayersPage', 'ReportsPage', 'IntelligencePage']) {
    const source = read(`src/pages/${name}.tsx`);
    assert.match(source, /loadPerformanceData\(\)/, name);
    assert.doesNotMatch(source, /from\('evaluations'\)/, name);
  }
  assert.match(read('src/pages/SummaryPage.tsx'), /loadSummaryData\(\)/);
  assert.match(read('src/lib/summary.ts'), /loadPerformanceData\(\)/);
  assert.doesNotMatch(read('src/lib/summary.ts'), /from\('evaluations'\)/);
  assert.match(read('src/pages/HistoryPage.tsx'), /from\('evaluations'\)/);
  assert.match(read('src/pages/EvaluationPage.tsx'), /from\('evaluations'\)/);
  assert.match(read('src/App.tsx'), /from\('evaluations'\)/);
  assert.doesNotMatch(read('src/pages/AttendancePage.tsx'), /OFFICIAL_PERFORMANCE_START/);
});

test('both explicit unjustified statuses count regardless of callup; legacy injured does not', () => {
  assert.equal(isUnjustifiedAbsence('unjustified_absence'), true);
  assert.equal(isUnjustifiedAbsence('injured_unjustified_absence'), true);
  for (const status of ['present', 'late', 'justified_late', 'justified_absence',
    'injured_present', 'injured_justified_absence', 'injured', undefined, null, 'unknown']) {
    assert.equal(isUnjustifiedAbsence(status), false, String(status));
  }
  const stats = attendanceStats([
    { id: '1', status: 'unjustified_absence', callup: 'not_called' },
    { id: '2', status: 'injured_unjustified_absence', callup: 'called_up' },
  ]);
  assert.equal(stats.unjustifiedAbsences, 2);
  assert.equal(stats.injuredUnjustifiedAbsences, 1);
  assert.equal(stats.absences, 2);
});

test('confirmed October attendance retains pre-cutoff rows and does not infer October 18', () => {
  // Regression fixture supplied by the user, never used in production logic.
  const rows = ['04', '07', '11', '14'].map(day => ({
    id: `absence-${day}`, player_id: 'fixture-player', session_id: `session-${day}`,
    session_date: `2026-10-${day}`, status: 'unjustified_absence',
  }));
  rows.push({ id: 'justified-21', player_id: 'fixture-player', session_id: 'session-21',
    session_date: '2026-10-21', status: 'justified_absence' });
  rows.push({ id: 'present-23', player_id: 'fixture-player', session_id: 'session-23',
    session_date: '2026-10-23', status: 'present' });
  const original = JSON.stringify(rows);
  const stats = attendanceStats(rows);
  assert.equal(stats.unjustifiedAbsences, 4);
  assert.equal(stats.justifiedAbsences, 1);
  assert.equal(stats.present, 1);
  assert.equal(stats.recorded, 6);
  assert.equal(stats.absences, 5);
  assert.equal(JSON.stringify(rows), original);
  assert.equal(attendanceStats([]).unjustifiedAbsences, 0);
});

test('attendance breakdown separates late, justified, injury and legacy states', () => {
  const statuses = ['present', 'late', 'justified_late', 'justified_absence',
    'unjustified_absence', 'injured_present', 'injured_justified_absence',
    'injured_unjustified_absence', 'injured', null, 'unrecognized'];
  const stats = attendanceStats(statuses.map((status, i) => ({ id: String(i), status })));
  assert.equal(stats.present, 1);
  assert.equal(stats.late, 1);
  assert.equal(stats.justifiedLate, 1);
  assert.equal(stats.lateTotal, 2);
  assert.equal(stats.justifiedAbsences, 2);
  assert.equal(stats.unjustifiedAbsences, 2);
  assert.equal(stats.absences, 4);
  assert.equal(stats.injuredPresent, 1);
  assert.equal(stats.injuredJustifiedAbsences, 1);
  assert.equal(stats.injuredUnjustifiedAbsences, 1);
  assert.equal(stats.legacyInjured, 1);
  assert.equal(stats.unrecorded, 1);
  assert.equal(stats.unknown, 1);
});

test('duplicate returned copies count once; distinct explicitly stored IDs are preserved', () => {
  const row = { id: 'attendance-1', player_id: 'p', session_id: 's', status: 'unjustified_absence' };
  assert.equal(attendanceStats([row, { ...row }]).unjustifiedAbsences, 1);
  assert.equal(uniqueAttendanceRecords([row, { ...row }]).length, 1);
  // A data correction or deciding which of two stored rows is authoritative is
  // not authorized. These are not silently deleted/merged by the frontend.
  assert.equal(attendanceStats([row, { ...row, id: 'attendance-2' }]).unjustifiedAbsences, 2);
  assert.equal(attendanceStats([{ status: 'unjustified_absence' },
    { status: 'unjustified_absence' }]).unjustifiedAbsences, 2);
});

test('attendance rankings use UUIDs, not shared display names', () => {
  const rows = [
    { id: '1', player_id: 'a', status: 'unjustified_absence', players: { display_name: 'Alex' } },
    { id: '2', player_id: 'b', status: 'injured_unjustified_absence', players: { display_name: 'Alex' } },
    { id: '3', player_id: 'b', status: 'unjustified_absence', players: { display_name: 'Alex' } },
  ];
  assert.deepEqual(attendanceRanking(rows, 'unjustifiedAbsences'), [
    { playerId: 'b', name: 'Alex', count: 2 }, { playerId: 'a', name: 'Alex', count: 1 },
  ]);
});

test('pagination reads the entire season even when server caps each page below requested size', async () => {
  const rows = Array.from({ length: 1103 }, (_, i) => ({ id: String(i), status: 'unjustified_absence' }));
  const offsets = [];
  const result = await readAttendancePages(async (from, to) => {
    offsets.push(from);
    assert.equal(to - from, 499);
    return { data: rows.slice(from, from + 200), error: null };
  });
  assert.equal(result.error, null);
  assert.equal(attendanceStats(result.data).unjustifiedAbsences, 1103);
  assert.deepEqual(offsets, [0, 200, 400, 600, 800, 1000, 1103]);
});

test('failed attendance page discards partial totals and surfaces the error', async () => {
  const error = { message: 'Read denied' };
  const result = await readAttendancePages(async from => from === 0
    ? { data: [{ id: '1', status: 'unjustified_absence' }], error: null }
    : { data: null, error });
  assert.equal(result.error, error);
  assert.deepEqual(result.data, []);
});

test('attendance component renders the shared unjustified total and shows read errors', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { AttendanceBreakdown } = require('../src/components/AttendanceBreakdown.tsx');
  const html = renderToStaticMarkup(React.createElement(AttendanceBreakdown, { rows: [
    { id: '1', status: 'unjustified_absence' }, { id: '2', status: 'injured_unjustified_absence' },
  ] }));
  assert.match(html, /Ausencias injustificadas.*?<strong>2<\/strong>/);
  const failure = renderToStaticMarkup(React.createElement(AttendanceBreakdown,
    { rows: [], error: 'Read denied' }));
  assert.match(failure, /role="alert"/);
  assert.doesNotMatch(failure, /<strong>0<\/strong>/);
});

test('statistics pages share classification and attendance reads have no performance cutoff', () => {
  const read = file => fs.readFileSync(file, 'utf8');
  for (const page of ['PlayersPage', 'SummaryPage', 'ReportsPage', 'HomePage', 'HistoryPage']) {
    const source = read(`src/pages/${page}.tsx`);
    assert.match(source, /attendanceStats\(/, page);
    assert.doesNotMatch(source, /includes\('absence'\)/, page);
  }
  assert.match(read('src/pages/IntelligencePage.tsx'), /isUnjustifiedAbsence\(a.status\)/);
  const loader = read('src/lib/attendance.ts');
  assert.doesNotMatch(loader, /official_evaluations|OFFICIAL_PERFORMANCE|callups|\.gte\(/);
  for (const page of ['PlayersPage', 'HistoryPage']) {
    assert.match(read(`src/pages/${page}.tsx`), /loadAttendanceStatistics\(/, page);
  }
  assert.match(read('src/lib/performance.ts'), /loadAttendanceStatistics\(\)/);
});
