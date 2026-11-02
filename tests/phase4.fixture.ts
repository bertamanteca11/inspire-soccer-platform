// Verified production identities/statuses; attendance row IDs and completed
// session flags are local fixtures, not assertions about production metadata.
export const marcos = '80d9034b-7e15-4db7-9dd7-a80743d47141';
export const intendedIds = ['5ccc3321-0a90-43f6-a237-01d2fbda923e', 'ca55937e-090a-4d15-bd81-3b70b7082989', '6c39fb9d-3e4c-458d-8b80-88275062d8af'];
export const players = [{ id: marcos, name: 'Marcos Zamora', display_name: 'Marcos Zamora', status: 'active', shirt_number: 9 }];
export const sessions = [
  ...['04', '07', '11', '14'].map(day => ({ id: 'history-' + day, name: 'Histórico ' + day, session_date: '2026-10-' + day, type: 'training', status: 'completed' })),
  ...intendedIds.map((id, i) => ({ id, name: ['Alzamora 3–3', 'Entrenamiento miércoles', 'Entrenamiento viernes'][i], session_date: ['2026-10-18','2026-10-21','2026-10-23'][i], type: i ? 'training' : 'league_match', status: 'completed' })),
  { id: 'planned', name: 'Planificada', session_date: '2026-10-22', type: 'training', status: 'planned' },
  { id: 'archived', name: 'Archivada', session_date: '2026-10-22', type: 'training', status: 'archived' },
  { id: 'test', name: 'Prueba de sistema', session_date: '2026-10-22', type: 'training', status: 'completed', is_test: true },
];
export const attendance = [
  ...['04','07','11','14'].map(day => ({ id: 'absence-' + day, player_id: marcos, session_id: 'history-' + day, status: 'unjustified_absence', notes: null, players: { display_name: 'Marcos Zamora' } })),
  { id: 'justified-21', player_id: marcos, session_id: intendedIds[1], status: 'justified_absence', notes: 'Transferencia desde Guineueta', players: { display_name: 'Marcos Zamora' } },
  { id: 'present-23', player_id: marcos, session_id: intendedIds[2], status: 'present', notes: null, players: { display_name: 'Marcos Zamora' } },
];
