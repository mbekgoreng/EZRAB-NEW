import { AuthFoundation, AuthenticationError, ProjectAuthorizationError } from '../auth/authFoundation';
import type { IdentityResolver, ProjectMembershipRepository, TrustedIdentity } from '../auth/contracts';
import type { UserRole } from '../../src/types';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

class Resolver implements IdentityResolver {
  constructor(private readonly identity: TrustedIdentity | null) {}
  async resolve(): Promise<TrustedIdentity | null> { return this.identity; }
}

class Memberships implements ProjectMembershipRepository {
  constructor(private readonly allowed: boolean) {}
  async hasProjectAccess(): Promise<boolean> { return this.allowed; }
}

async function expectCode(work: () => Promise<unknown>, code: string): Promise<void> {
  try { await work(); } catch (error) { assert(error instanceof Error && error.message === code, `Expected ${code}`); return; }
  throw new Error(`Expected ${code}`);
}

export async function runAuthFoundationTests(): Promise<void> {
  const previousMode = process.env.EZRAB_AUTH_MODE;
  process.env.EZRAB_AUTH_MODE = 'trusted';
  try {
    const foundation = new AuthFoundation();
    await expectCode(() => foundation.authenticate({ 'x-user-id': 'forged-user', 'x-user-role': 'SUPER_ADMIN' }), 'AUTH_REQUIRED');

    foundation.configure({
      identityResolver: new Resolver({ userId: 'u-1', workspaceId: 'ws-1', role: 'ESTIMATOR', source: 'trusted_session', expiresAt: new Date(Date.now() - 1) }),
      membershipRepository: new Memberships(true),
    });
    await expectCode(() => foundation.authenticate({}), 'AUTH_EXPIRED');

    foundation.configure({
      identityResolver: new Resolver({ userId: 'u-1', workspaceId: 'ws-1', role: 'NOT_A_ROLE' as UserRole, source: 'trusted_session' }),
      membershipRepository: new Memberships(true),
    });
    await expectCode(() => foundation.authenticate({}), 'AUTH_INVALID');

    foundation.configure({
      identityResolver: new Resolver({ userId: 'u-1', workspaceId: 'ws-1', role: 'ESTIMATOR', source: 'trusted_session' }),
      membershipRepository: new Memberships(false),
    });
    const identity = await foundation.authenticate({ 'x-user-id': 'attacker', 'x-user-role': 'SUPER_ADMIN' });
    assert(identity.userId === 'u-1' && identity.role === 'ESTIMATOR', 'Forged browser identity headers are ignored in trusted mode');
    await expectCode(() => foundation.assertProjectAccess(identity, 'PRJ-OTHER-1'), 'PROJECT_NOT_AUTHORIZED');

    foundation.configure({
      identityResolver: new Resolver({ userId: 'u-1', workspaceId: 'ws-1', role: 'ESTIMATOR', source: 'trusted_session' }),
      membershipRepository: new Memberships(true),
    });
    await foundation.assertProjectAccess(await foundation.authenticate({}), 'PRJ-OWNED-1');
    console.log('PASS auth foundation: trusted identity, expiry, role, forged headers, and membership checks');
  } finally {
    if (previousMode === undefined) delete process.env.EZRAB_AUTH_MODE;
    else process.env.EZRAB_AUTH_MODE = previousMode;
  }
}

runAuthFoundationTests().catch((error) => { console.error(error); process.exitCode = 1; });
