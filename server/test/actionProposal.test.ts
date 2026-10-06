import assert from 'assert';
import { actionProposalManager } from '../ai/tools/actionProposalManager';
import { aiDbAdapter } from '../database/dbAdapter';

export async function runActionProposalTestSuite(): Promise<void> {
  console.log('--- Running Action Proposal Lifecycle & Project Binding Test Suite ---');

  const ws = 'WS-PROP-TEST';
  const prjA = 'PRJ-PROP-A';
  const prjB = 'PRJ-PROP-B';

  aiDbAdapter.createProject(ws, { id: prjA, name: 'Proyek A', budget: 100000000, status: 'ACTIVE' });
  aiDbAdapter.createProject(ws, { id: prjB, name: 'Proyek B', budget: 100000000, status: 'ACTIVE' });

  // 1. Create Proposal for Project A
  const proposal = actionProposalManager.createProposal({
    toolName: 'create_rab_item',
    projectId: prjA,
    workspaceId: ws,
    userId: 'user-1',
    parameters: {
      name: 'Pekerjaan Pengecatan Eksterior',
      volume: 100,
      unit: 'm2',
      unitPrice: 35000
    }
  });

  assert.ok(proposal.id.startsWith('prop_'));
  assert.strictEqual(proposal.isExecuted, false);
  assert.strictEqual(proposal.requiresConfirmation, true);

  // 2. Cross-Project Execution Forbidden: Attempting to execute Project A proposal on Project B must FAIL
  await assert.rejects(
    async () => {
      await actionProposalManager.executeConfirmedProposal(proposal.id, {
        workspaceId: ws,
        projectId: prjB, // Mismatched target project
        userId: 'user-1'
      });
    },
    (err: any) => err.message.includes('SECURITY_ERROR'),
    'Proposal for Project A must NOT execute on Project B'
  );

  // 3. Execution on matching Project A succeeds
  const execSuccess = await actionProposalManager.executeConfirmedProposal(proposal.id, {
    workspaceId: ws,
    projectId: prjA,
    userId: 'user-1'
  });

  assert.strictEqual(execSuccess.success, true);
  assert.strictEqual(proposal.isExecuted, true);

  // 4. Double confirmation protection: Second execution attempt must fail
  await assert.rejects(
    async () => {
      await actionProposalManager.executeConfirmedProposal(proposal.id, {
        workspaceId: ws,
        projectId: prjA,
        userId: 'user-1'
      });
    },
    (err: any) => err.message.includes('already been executed'),
    'Proposal cannot be executed twice'
  );

  // 5. Invalidation on context switch
  const proposal2 = actionProposalManager.createProposal({
    toolName: 'create_rab_item',
    projectId: prjA,
    workspaceId: ws,
    userId: 'user-1',
    parameters: { name: 'Item Test 2' }
  });

  actionProposalManager.invalidateProjectProposals(ws, prjA);
  assert.strictEqual(proposal2.isInvalidated, true);

  await assert.rejects(
    async () => {
      await actionProposalManager.executeConfirmedProposal(proposal2.id, {
        workspaceId: ws,
        projectId: prjA,
        userId: 'user-1'
      });
    },
    (err: any) => err.message.includes('no longer valid'),
    'Invalidated proposal cannot be executed'
  );

  console.log('✅ All 5 Action Proposal Lifecycle & Project Binding assertions PASSED');
}
