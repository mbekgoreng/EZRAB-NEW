import http from 'http';
import { handleAiApiRequest } from '../api/aiRoutes';
import { authFoundation } from '../auth/authFoundation';
import type { IdentityResolver, ProjectMembershipRepository, TrustedIdentity } from '../auth/contracts';
import { configureOfficialProjectContextRepository, resetOfficialProjectContextRepository } from '../services/officialProjectContext';

function assert(v: unknown, m: string): asserts v { if (!v) throw new Error(m); }
function request(port: number, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => { const raw = JSON.stringify(body); const req = http.request({ hostname: '127.0.0.1', port, path: '/api/ai/chat', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw), ...headers } }, res => { let out = ''; res.on('data', c => out += c); res.on('end', () => resolve({ status: res.statusCode || 0, json: JSON.parse(out) })); }); req.on('error', reject); req.end(raw); });
}
async function run(): Promise<void> {
  const previous = process.env.EZRAB_AUTH_MODE; process.env.EZRAB_AUTH_MODE = 'trusted'; const originalFetch = globalThis.fetch; let aiCalls = 0; let context: any;
  const resolver: IdentityResolver = { async resolve(h): Promise<TrustedIdentity | null> { return h.authorization === 'Bearer test-session' ? { userId: 'user-a', workspaceId: '', role: 'ESTIMATOR', source: 'trusted_session' } : null; } };
  const members: ProjectMembershipRepository = { async hasProjectAccess() { return true; }, async resolveProjectAccess({ projectId }) { return projectId === 'project-a' ? { status: 'authorized' as const, workspaceId: 'workspace-a', role: 'ESTIMATOR' as const } : { status: 'project_not_found' as const }; } };
  authFoundation.configure({ identityResolver: resolver, membershipRepository: members });
  configureOfficialProjectContextRepository({ async build({ projectId, workspaceId }) { return projectId === 'project-a' && workspaceId === 'workspace-a' ? { source: 'server_official_context', project: { available: true, id: 'project-a', name: 'Official' }, rab: { available: false, items: [], total: null, item_count: null }, work_items: { available: false, items: [] }, qto: { available: false, items: [] }, schedule: { available: false, items: [] }, metadata: { generated_at: '2026-01-01T00:00:00.000Z', is_read_only: true, contract_version: '1.0' } } : null; } });
  globalThis.fetch = (async (_url, init: any) => { aiCalls++; context = JSON.parse(init.body).project_context; return new Response(JSON.stringify({ success: true, message: 'safe response', request_id: 'test-request' }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  const server = http.createServer((req, res) => void handleAiApiRequest(req, res)); await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); const a = server.address(); assert(a && typeof a !== 'string', 'server starts');
  try {
    const forged = await request(a.port, { 'x-user-id': 'forged', 'x-user-role': 'SUPER_ADMIN' }, { projectId: 'project-a', message: 'status proyek' }); assert(forged.status === 401 && aiCalls === 0, 'forged headers are denied before AI');
    const allowed = await request(a.port, { authorization: 'Bearer test-session' }, { projectId: 'project-a', message: 'status proyek' }); assert(allowed.status === 200 && aiCalls === 1 && context.source === 'server_official_context', 'authorized request uses official context');
    const missing = await request(a.port, { authorization: 'Bearer test-session' }, { projectId: 'project-missing', message: 'status proyek' }); assert(missing.status === 404 && aiCalls === 1, 'missing project never reaches AI'); console.log('PASS API endpoints: trusted auth, official context, no Map fallback');
  } finally { globalThis.fetch = originalFetch; resetOfficialProjectContextRepository(); authFoundation.resetToDefault(); await new Promise<void>(ok => server.close(() => ok())); if (previous === undefined) delete process.env.EZRAB_AUTH_MODE; else process.env.EZRAB_AUTH_MODE = previous; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
