import assert from 'assert';
import { toolIntelligence } from '../ai/tools/toolIntelligence';
import { constructionIntentClassifier } from '../ai/intent/intentClassifier';
import { aiDbAdapter } from '../database/dbAdapter';

export async function runToolIntelligenceTestSuite(): Promise<void> {
  console.log('--- Running Tool Intelligence & READ/WRITE Policy Test Suite ---');

  const ws = 'WS-TOOL-INTEL';
  const prj = 'PRJ-TOOL-INTEL-1';

  aiDbAdapter.createProject(ws, {
    id: prj,
    name: 'Proyek Tool Intelligence',
    budget: 200000000,
    status: 'ACTIVE'
  });

  // 1. READ Tool: RAB Total executed directly without mutation proposal
  const intentTotal = constructionIntentClassifier.classify('Berapa total RAB?');
  const decisionTotal = await toolIntelligence.evaluateAndDispatch(intentTotal, {
    workspaceId: ws,
    projectId: prj,
    userId: 'u1'
  });

  assert.strictEqual(decisionTotal.isMutating, false);
  assert.strictEqual(decisionTotal.requiresConfirmation, false);
  assert.strictEqual(decisionTotal.canExecuteDirectly, true);
  assert.ok(decisionTotal.directExecutionResult !== undefined);

  // 2. WRITE Tool: Item creation generates ActionProposal with confirmation required
  const intentCreate = constructionIntentClassifier.classify('Tambahkan plesteran dinding 45 m2');
  const decisionCreate = await toolIntelligence.evaluateAndDispatch(intentCreate, {
    workspaceId: ws,
    projectId: prj,
    userId: 'u1'
  });

  assert.strictEqual(decisionCreate.isMutating, true);
  assert.strictEqual(decisionCreate.requiresConfirmation, true);
  assert.strictEqual(decisionCreate.canExecuteDirectly, false);
  assert.ok(decisionCreate.actionProposal);
  assert.strictEqual(decisionCreate.actionProposal.toolName, 'create_rab_item');
  assert.strictEqual(decisionCreate.actionProposal.parameters.volume, 45);

  // 3. DELETE Tool: Delete item requires confirmation
  const intentDelete = constructionIntentClassifier.classify('Hapus pekerjaan plesteran');
  const decisionDelete = await toolIntelligence.evaluateAndDispatch(intentDelete, {
    workspaceId: ws,
    projectId: prj,
    userId: 'u1'
  });

  assert.strictEqual(decisionDelete.isMutating, true);
  assert.strictEqual(decisionDelete.requiresConfirmation, true);
  assert.strictEqual(decisionDelete.actionProposal?.preview.riskLevel, 'HIGH');

  console.log('✅ All 3 Tool Intelligence & READ/WRITE Policy assertions PASSED');
}
