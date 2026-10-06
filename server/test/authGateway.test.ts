import http from 'http';
import { handleAiApiRequest } from '../api/aiRoutes';
import { validateReadOnlyProjectContext } from '../api/readOnlyProjectContext';
import { authFoundation } from '../auth/authFoundation';
import type { IdentityResolver, ProjectMembershipRepository, TrustedIdentity } from '../auth/contracts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

async function request(port: number, body: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const encoded = JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/ai/chat', method: 'POST', headers: {
      'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded),
      'x-user-id': 'forged-user', 'x-user-role': 'SUPER_ADMIN', 'x-workspace-id': 'forged-workspace',
    } }, (res) => {
      let response = '';
      res.on('data', (chunk) => { response += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, json: JSON.parse(response) }));
    });
    req.on('error', reject);
    req.end(encoded);
  });
}

export async function runAuthGatewayTests(): Promise<void> {
  const previousMode = process.env.EZRAB_AUTH_MODE;
  process.env.EZRAB_AUTH_MODE = 'trusted';
  let aiCoreCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { aiCoreCalled = true; throw new Error('AI Core must not be called'); }) as typeof fetch;
  const server = http.createServer((req, res) => void handleAiApiRequest(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    assert(address && typeof address !== 'string', 'Test server must have a TCP port');
    const response = await request(address.port, { projectId: 'PRJ-OTHER-1', message: 'baca proyek lain' });
    assert(response.status === 401, 'Unauthenticated trusted-mode request is denied');
    assert(response.json.error.code === 'AUTH_REQUIRED', 'Trusted mode ignores forged header identity');
    assert(typeof response.json.requestId === 'string', 'Gateway error includes requestId');
    assert(!aiCoreCalled, 'AI Core is not called after failed authorization');

    const resolver: IdentityResolver = { async resolve(): Promise<TrustedIdentity> {
      return { userId: 'u-member', workspaceId: 'ws-default-ezrab', role: 'ESTIMATOR', source: 'trusted_session' };
    } };
    const membership: ProjectMembershipRepository = {
      async hasProjectAccess(): Promise<boolean> { return true; },
      async resolveProjectAccess({ projectId }: { projectId: string; userId: string }) {
        return projectId === 'PRJ-OWNED-1'
          ? { status: 'authorized' as const, workspaceId: 'ws-default-ezrab', role: 'ESTIMATOR' as const }
          : { status: 'project_not_found' as const };
      }
    };
    authFoundation.configure({ identityResolver: resolver, membershipRepository: membership });
    const missingProject = await request(address.port, { projectId: 'PRJ-NOT-FOUND', message: 'status proyek' });
    assert(missingProject.status === 404 && missingProject.json.error.code === 'PROJECT_NOT_FOUND', 'Trusted mode rejects unknown project before AI Core');
    assert(!aiCoreCalled, 'AI Core is not called for unknown projects');

    const foreignContext = {
      source: 'frontend_project_context', project: { available: true, id: 'PRJ-OTHER-1', name: 'Other' },
      rab: { available: false, items: [], total: null, item_count: null },
      work_items: { available: false, items: [] }, qto: { available: false, items: [] }, schedule: { available: false, items: [] },
      metadata: { generated_at: '2026-01-01T00:00:00.000Z', is_read_only: true, contract_version: '1.0' },
    };
    let mismatchRejected = false;
    try { validateReadOnlyProjectContext(foreignContext, 'PRJ-OWNED-1'); } catch { mismatchRejected = true; }
    assert(mismatchRejected, 'Project context for another project is rejected');
    console.log('PASS auth gateway: failed auth stops AI Core and foreign context is rejected');
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousMode === undefined) delete process.env.EZRAB_AUTH_MODE;
    else process.env.EZRAB_AUTH_MODE = previousMode;
  }
}

runAuthGatewayTests().catch((error) => { console.error(error); process.exitCode = 1; });
