import { SupabaseProjectMembershipRepository } from '../auth/supabaseIdentityResolver';
import { OfficialProjectContextRepository } from '../services/officialProjectContext';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

function fakeClient(mode: 'member' | 'no-workspace' | 'no-project-member' | 'missing-project'): any {
  return { from(table: string) {
    const result = table === 'projects'
      ? (mode === 'missing-project' ? { data: null, error: null } : { data: { id: 'p-1', workspace_id: 'w-1', name: 'Official', status: 'active', progress: 10 }, error: null })
      : table === 'workspace_members'
        ? (mode === 'no-workspace' ? { data: null, error: null } : { data: { role: 'ESTIMATOR' }, error: null })
        : (mode === 'no-project-member' ? { data: null, error: null } : { data: { project_id: 'p-1' }, error: null });
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => result };
    return chain;
  }};
}

async function run(): Promise<void> {
  const member = new SupabaseProjectMembershipRepository({ client: fakeClient('member') });
  assert((await member.resolveProjectAccess!({ userId: 'u-1', projectId: 'p-1' })).status === 'authorized', 'member is authorized');
  const noWorkspace = new SupabaseProjectMembershipRepository({ client: fakeClient('no-workspace') });
  assert((await noWorkspace.resolveProjectAccess!({ userId: 'u-1', projectId: 'p-1' })).status === 'workspace_membership_required', 'workspace membership is required');
  const noProject = new SupabaseProjectMembershipRepository({ client: fakeClient('no-project-member') });
  assert((await noProject.resolveProjectAccess!({ userId: 'u-1', projectId: 'p-1' })).status === 'project_membership_required', 'project membership is required');
  const missing = new SupabaseProjectMembershipRepository({ client: fakeClient('missing-project') });
  assert((await missing.resolveProjectAccess!({ userId: 'u-1', projectId: 'p-1' })).status === 'project_not_found', 'unknown project is distinguished');
  const context = await new OfficialProjectContextRepository({ client: fakeClient('member') }).build({ projectId: 'p-1', workspaceId: 'w-1' });
  assert(context?.source === 'server_official_context' && context.project.name === 'Official', 'context is constructed from database row');
  assert(context?.rab.available === false && context.rab.items.length === 0, 'browser or Map RAB data is never substituted');
  console.log('PASS Supabase membership: durable query contract and official context');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
