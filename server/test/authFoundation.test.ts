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
  // B1 2026-11-25 (PE-7): the DEFAULT mode is trusted (fail-closed).
  // Without an explicit EZRAB_AUTH_MODE=legacy-development, forged
  // headers must NOT yield a legacy identity — even in non-production
  // (the old default trusted x-user-id/x-user-role whenever
  // NODE_ENV !== 'production').
  {
    const savedMode = process.env.EZRAB_AUTH_MODE;
    const savedNodeEnv = process.env.NODE_ENV;
    const savedUrl = process.env.SUPABASE_URL;
    const savedSecret = process.env.SUPABASE_SECRET_KEY;
    const savedService = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const savedPub = process.env.SUPABASE_PUBLISHABLE_KEY;
    const savedAnon = process.env.SUPABASE_ANON_KEY;
    delete process.env.EZRAB_AUTH_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.NODE_ENV = 'test';
    try {
      const defaultFoundation = new AuthFoundation();
      await expectCode(
        () => defaultFoundation.authenticate({ 'x-user-id': 'attacker', 'x-user-role': 'SUPER_ADMIN' }),
        'AUTH_REQUIRED'
      );
      // Explicit opt-in still works for local dev (documents the escape hatch).
      process.env.EZRAB_AUTH_MODE = 'legacy-development';
      const legacyFoundation = new AuthFoundation();
      const legacy = await legacyFoundation.authenticate({ 'x-user-id': 'dev-user', 'x-user-role': 'ESTIMATOR' });
      assert(
        legacy.userId === 'dev-user' && legacy.role === 'ESTIMATOR' && legacy.source === 'legacy_development',
        'Explicit legacy opt-in must still resolve headers'
      );
      console.log('PASS auth foundation: default mode is trusted (fail-closed); explicit legacy opt-in still works');
    } finally {
      if (savedMode === undefined) delete process.env.EZRAB_AUTH_MODE;
      else process.env.EZRAB_AUTH_MODE = savedMode;
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
      if (savedUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = savedUrl;
      if (savedSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = savedSecret;
      if (savedService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = savedService;
      if (savedPub === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
      else process.env.SUPABASE_PUBLISHABLE_KEY = savedPub;
      if (savedAnon === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = savedAnon;
    }
  }

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
