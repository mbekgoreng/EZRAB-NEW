import { AuthFoundation, ProjectAuthorizationError } from '../auth/authFoundation';
import type { IdentityResolver, ProjectMembershipRepository, TrustedIdentity } from '../auth/contracts';

function assert(v: unknown, m: string): asserts v { if (!v) throw new Error(m); }
class FixtureResolver implements IdentityResolver { constructor(private readonly userId: string) {} async resolve(): Promise<TrustedIdentity> { return { userId: this.userId, workspaceId: '', role: 'ESTIMATOR', source: 'trusted_session' }; } }
class Fixtures implements ProjectMembershipRepository {
  async hasProjectAccess(): Promise<boolean> { return false; }
  async resolveProjectAccess({ userId, projectId }: { userId: string; projectId: string }) {
    if (projectId !== 'project-a') return { status: 'project_not_found' as const };
    if (userId === 'user-a') return { status: 'authorized' as const, workspaceId: 'workspace-a', role: 'ESTIMATOR' as const };
    if (userId === 'user-c') return { status: 'project_membership_required' as const };
    return { status: 'workspace_membership_required' as const };
  }
}
async function expectCode(work: () => Promise<unknown>, code: string) { try { await work(); } catch (e) { assert(e instanceof ProjectAuthorizationError && e.code === code, `expected ${code}`); return; } throw new Error(`expected ${code}`); }
async function run() {
  const old = process.env.EZRAB_AUTH_MODE; process.env.EZRAB_AUTH_MODE = 'trusted';
  try {
    for (const [user, expected] of [['user-a', 'allow'], ['user-b', 'PROJECT_NOT_AUTHORIZED'], ['user-c', 'PROJECT_NOT_AUTHORIZED']] as const) {
      const f = new AuthFoundation(); f.configure({ identityResolver: new FixtureResolver(user), membershipRepository: new Fixtures() }); const identity = await f.authenticate({ authorization: 'Bearer synthetic' });
      if (expected === 'allow') assert((await f.authorizeProject(identity, 'project-a')).workspaceId === 'workspace-a', 'User A has project access'); else await expectCode(() => f.authorizeProject(identity, 'project-a'), expected);
    }
    const f = new AuthFoundation(); f.configure({ identityResolver: new FixtureResolver('user-a'), membershipRepository: new Fixtures() }); const userA = await f.authenticate({ authorization: 'Bearer synthetic' }); await expectCode(() => f.authorizeProject(userA, 'missing'), 'PROJECT_NOT_FOUND'); console.log('PASS membership fixtures: A allowed; B/C denied; missing project distinct');
  } finally { if (old === undefined) delete process.env.EZRAB_AUTH_MODE; else process.env.EZRAB_AUTH_MODE = old; }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
