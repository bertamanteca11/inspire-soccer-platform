// Synthetic full-App client. Never connects to Supabase or uses real identities.
type Result = { data: any; error: any };
const session: any = { id: 'session-nov6', name: 'Entrenamiento viernes 6', session_date: '2026-11-06',
  type: 'training', status: 'planned', callup_confirmed: true, attendance_confirmed: false,
  evaluation_confirmed: false, records_only_confirmed: false, draft_defaults_version: null,
  high_rating_limit: 6, low_rating_limit: 3 };
const player = { id: 'player', name: 'Synthetic Player', display_name: 'Synthetic', shirt_number: 18, active: true };
const requests: any[] = [];
let selectedError = false;
let holdSelected = false;
let releaseSelected: (() => void) | undefined;
function query(table: string) {
  const filters: ((row: any) => boolean)[] = [];
  let start = 0, end = Infinity, one = false;
  const builder: any = {};
  for (const method of ['select', 'order']) builder[method] = () => builder;
  builder.eq = (key: string, value: any) => { filters.push(row => row[key] === value); return builder; };
  builder.neq = (key: string, value: any) => { filters.push(row => row[key] !== value); return builder; };
  builder.in = (key: string, values: any[]) => { filters.push(row => values.includes(row[key])); return builder; };
  builder.gte = (key: string, value: any) => { filters.push(row => row[key] >= value); return builder; };
  builder.range = (from: number, to: number) => { start = from; end = to + 1; return builder; };
  builder.limit = (count: number) => { end = count; return builder; };
  builder.maybeSingle = builder.single = () => { one = true; return builder; };
  for (const method of ['update', 'insert', 'upsert', 'delete']) builder[method] = (body: any) => {
    requests.push({ table, method, body }); throw new Error('Opening a workflow must never write');
  };
  builder.then = (resolve: any, reject: any) => (async (): Promise<Result> => {
    requests.push({ table, method: 'select', one });
    if (table === 'sessions' && one && holdSelected) await new Promise<void>(done => { releaseSelected = done; });
    if (table === 'sessions' && one && selectedError) return { data: null, error: { message: 'Session read unavailable' } };
    const rows = table === 'sessions' ? [{ ...session }] : table === 'players' ? [player]
      : table === 'callups' ? [{ id: 'call', session_id: session.id, player_id: player.id, status: 'called_up', evaluable: true }]
      : table === 'attendance' ? [{ id: 'visit', session_id: session.id, player_id: player.id, status: 'present', notes: null }] : [];
    const data = rows.filter(row => filters.every(filter => filter(row))).slice(start, end);
    return { data: one ? data[0] || null : data, error: null };
  })().then(resolve, reject);
  return builder;
}
export const supabase = { from: query, rpc: async (name: string, args: any) => {
  requests.push({ table: name, method: 'rpc', args });
  if (name === 'app_access') return { data: { allowed: true, role: 'admin', private_staff: false }, error: null };
  if (name === 'batch4_workflow_access') return { data: args.p_workflow === 'evaluation' ? session.attendance_confirmed && !session.evaluation_confirmed : true, error: null };
  if (name === 'veo_status') return { data: null, error: { code: 'PGRST202', message: 'Synthetic VEO unavailable' } };
  throw new Error('Unexpected write RPC: ' + name);
}, auth: {
  getSession: async () => ({ data: { session: { user: { id: 'synthetic-admin' } } }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({ error: null }),
} };
(window as any).workflowFixture = { requests,
  patch: (patch: any) => Object.assign(session, patch),
  failSelected: () => { selectedError = true; },
  holdSelected: () => { holdSelected = true; },
  pendingSelected: () => !!releaseSelected,
  releaseSelected: () => { holdSelected = false; releaseSelected?.(); releaseSelected = undefined; },
};
