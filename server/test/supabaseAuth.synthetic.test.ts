import http from 'http';
import { handleAiApiRequest } from '../api/aiRoutes';
import { AuthFoundation, AuthenticationError, ProjectAuthorizationError } from '../auth/authFoundation';
import type { IdentityResolver, ProjectMembershipRepository, TrustedIdentity } from '../auth/contracts';
import type { UserRole } from '../../src/types';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

class MockResolver implements IdentityResolver {
  constructor(private readonly mockIdentity: TrustedIdentity | null) {}
  async resolve(): Promise<TrustedIdentity | null> {
    return this.mockIdentity;
  }
}

class MockMembership implements ProjectMembershipRepository {
  constructor(private readonly allowed: boolean) {}
  async hasProjectAccess(): Promise<boolean> {
    return this.allowed;
  }
}

async function sendRequest(
  port: number,
  headers: Record<string, string>,
  body: unknown
): Promise<{ status: number; json: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const encoded = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/ai/chat',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(encoded),
          ...headers,
        },
      },
      (res) => {
        let response = '';
        res.on('data', (chunk) => {
          response += chunk;
        });
        res.on('end', () => {
          let json: any = null;
          try {
            json = JSON.parse(response);
          } catch {}
          resolve({ status: res.statusCode || 0, json, raw: response });
        });
      }
    );
    req.on('error', reject);
    req.end(encoded);
  });
}

export async function runSyntheticAuthTests(): Promise<void> {
  const previousMode = process.env.EZRAB_AUTH_MODE;
  process.env.EZRAB_AUTH_MODE = 'trusted';

  const foundation = new AuthFoundation();

  console.log('[SYNTHETIC] 1. Verifying denial of spoofed headers (x-user-id, x-user-role) without Bearer token...');
  let deniedWithoutToken = false;
  try {
    await foundation.authenticate({
      'x-user-id': 'forged-super-admin',
      'x-user-role': 'SUPER_ADMIN',
      'x-workspace-id': 'hacked-workspace',
    });
  } catch (err: any) {
    if (err instanceof AuthenticationError && err.code === 'AUTH_REQUIRED') {
      deniedWithoutToken = true;
    }
  }
  assert(deniedWithoutToken, 'Must fail-closed with AUTH_REQUIRED when only spoofed headers are provided');

  console.log('[SYNTHETIC] 2. Verifying rejection of expired identity token...');
  foundation.configure({
    identityResolver: new MockResolver({
      userId: 'u-synth-1',
      workspaceId: 'ws-synth-1',
      role: 'ESTIMATOR',
      source: 'trusted_session',
      expiresAt: new Date(Date.now() - 10_000),
    }),
    membershipRepository: new MockMembership(true),
  });

  let expiredDenied = false;
  try {
    await foundation.authenticate({ authorization: 'Bearer expired.synth.token' });
  } catch (err: any) {
    if (err instanceof AuthenticationError && err.code === 'AUTH_EXPIRED') {
      expiredDenied = true;
    }
  }
  assert(expiredDenied, 'Expired session must fail with AUTH_EXPIRED');

  console.log('[SYNTHETIC] 3. Verifying rejection of invalid user roles...');
  foundation.configure({
    identityResolver: new MockResolver({
      userId: 'u-synth-2',
      workspaceId: 'ws-synth-1',
      role: 'INVALID_HACKER_ROLE' as UserRole,
      source: 'trusted_session',
    }),
    membershipRepository: new MockMembership(true),
  });

  let roleDenied = false;
  try {
    await foundation.authenticate({ authorization: 'Bearer invalid.role.token' });
  } catch (err: any) {
    if (err instanceof AuthenticationError && err.code === 'AUTH_INVALID') {
      roleDenied = true;
    }
  }
  assert(roleDenied, 'Unauthorized/invalid user role must fail with AUTH_INVALID');

  console.log('[SYNTHETIC] 4. Verifying that forged browser headers are ignored when valid session exists...');
  foundation.configure({
    identityResolver: new MockResolver({
      userId: 'genuine-user-id',
      workspaceId: 'genuine-workspace-id',
      role: 'ESTIMATOR',
      source: 'trusted_session',
    }),
    membershipRepository: new MockMembership(true),
  });

  const identity = await foundation.authenticate({
    authorization: 'Bearer valid.mock.token',
    'x-user-id': 'malicious-injected-user',
    'x-user-role': 'SUPER_ADMIN',
  });
  assert(
    identity.userId === 'genuine-user-id' && identity.role === 'ESTIMATOR',
    'Trusted identity must come strictly from resolver, never from x-user-* headers'
  );

  console.log('[SYNTHETIC] 5. Verifying cross-project authorization boundary enforcement...');
  foundation.configure({
    identityResolver: new MockResolver({
      userId: 'genuine-user-id',
      workspaceId: 'workspace-a',
      role: 'ESTIMATOR',
      source: 'trusted_session',
    }),
    membershipRepository: new MockMembership(false),
  });

  let unauthorizedProjectDenied = false;
  try {
    await foundation.assertProjectAccess(identity, 'foreign-project-999');
  } catch (err: any) {
    if (err instanceof ProjectAuthorizationError && err.code === 'PROJECT_NOT_AUTHORIZED') {
      unauthorizedProjectDenied = true;
    }
  }
  assert(unauthorizedProjectDenied, 'Project access outside membership must be denied');

  console.log('[SYNTHETIC] 6. Verifying HTTP API route level boundary in trusted mode...');
  let aiCoreCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    aiCoreCalled = true;
    throw new Error('AI Core must never be invoked on unauthorized calls');
  }) as typeof fetch;

  const server = http.createServer((req, res) => void handleAiApiRequest(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string', 'Server must listen on port');
  const port = address.port;

  try {
    const unauthRes = await sendRequest(
      port,
      {
        'x-user-id': 'forged-attacker',
        'x-user-role': 'SUPER_ADMIN',
        'x-project-id': 'target-project',
      },
      { projectId: 'target-project', message: 'audit data' }
    );
    assert(unauthRes.status === 401, 'Unauthenticated HTTP request must return 401');
    assert(unauthRes.json?.error?.code === 'AUTH_REQUIRED', 'Error code must be AUTH_REQUIRED');
    assert(!aiCoreCalled, 'AI Core backend must NOT be reached when auth fails');

    // Verify no secret leak in response
    assert(!unauthRes.raw.includes('Bearer'), 'Response must never leak Bearer tokens');
    assert(!unauthRes.raw.includes('secret'), 'Response must not contain secret data');
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousMode === undefined) delete process.env.EZRAB_AUTH_MODE;
    else process.env.EZRAB_AUTH_MODE = previousMode;
  }

  console.log('===> PASS: All Synthetic Security Tests Passed Successfully.');
}

runSyntheticAuthTests().catch((err) => {
  console.error('[SYNTHETIC TEST FAILED]', err);
  process.exitCode = 1;
});
