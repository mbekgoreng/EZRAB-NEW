import { SupabaseProjectRabRepository } from '../repositories/supabaseProjectRabRepository';

function assert(v: unknown, m: string): asserts v { if (!v) throw new Error(m); }
function fakeClient(): any {
  const rows: Record<string, any[]> = {
    workspace_members: [{ workspace_id: 'w-1', user_id: 'u-1', role: 'ESTIMATOR' }],
    projects: [], rab_documents: [], rab_items: [], audit_logs: [],
  };
  return { from(table: string) {
    const state: any = { filters: [], payload: null, mode: 'select' }; const chain: any = {
      select: () => chain, eq: (key: string, value: unknown) => { state.filters.push([key, value]); return chain; },
      in: (key: string, values: unknown[]) => { state.filters.push([key, values]); return chain; }, limit: () => chain, order: () => chain,
      maybeSingle: async () => { const found = rows[table].filter(row => state.filters.every(([k, v]: any) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v)); if (state.mode === 'update' && found[0]) Object.assign(found[0], state.payload); return { data: found[0] || null, error: null }; },
      single: async () => { const value = state.payload || rows[table][rows[table].length - 1]; return { data: value, error: null }; },
      insert: (payload: any) => { state.payload = { id: `${table}-${rows[table].length + 1}`, updated_at: 'v1', created_at: 'now', ...payload }; rows[table].push(state.payload); return chain; },
      update: (payload: any) => { state.mode = 'update'; state.payload = payload; return chain; },
    };
    const execute = async () => { const found = rows[table].filter(row => state.filters.every(([k, v]: any) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v)); if (state.mode === 'update') { Object.assign(found[0] || {}, state.payload); return { data: found[0] || null, error: null }; } return { data: found, error: null }; };
    chain.then = (resolve: any) => execute().then(resolve); return chain;
  }};
}
async function run() {
  const repository = new SupabaseProjectRabRepository({ client: fakeClient(), membership: { async hasProjectAccess() { return true; }, async resolveProjectAccess() { return { status: 'authorized' as const, workspaceId: 'w-1', role: 'ESTIMATOR' as const }; } } });
  const project = await repository.createProject('u-1', { name: 'Project durable', legacy_id: 'PRJ-OLD-1' }); assert(project.workspace_id === 'w-1', 'workspace derived from membership');
  const item = await repository.createRabItem('u-1', project.id, { code: 'A.01', description: 'Pekerjaan', volume: 2, unit: 'm2', unit_price: 100 }); assert(item.amount === 200, 'RAB amount is calculated from source fields');
  assert((await repository.listRabItems('u-1', project.id)).length === 1, 'RAB item can be read');
  const updated = await repository.updateRabItem('u-1', project.id, item.id, 'v1', { volume: 3 }); assert(updated?.amount === 300, 'optimistic update recalculates amount');
  assert((await repository.updateRabItem('u-1', project.id, item.id, 'stale', { volume: 4 })) === null, 'stale version is rejected');
  console.log('PASS durable project/RAB repository: create, read, update, and concurrency');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
