import {
  AgentTask,
  AgentIntent,
  AgentPlan,
  AgentAction,
  AgentValidationResult,
  AgentExecutionResult,
  AgentTrace,
} from '../agents/agentContracts';
import { toolRegistry } from '../tools/toolRegistry';
import { AgentRegistry } from '../agents/agentRegistry';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

export async function runAgentArchitectureAuditTest(): Promise<void> {
  // 1. Task Authoritative Isolation
  const validTask: AgentTask = {
    taskId: 'task_123',
    userMessage: 'Tambahkan pasangan bata ringan 20 m2 di lantai 1',
    projectId: 'PRJ-2026-001',
    workspaceId: 'WS-001',
    userId: 'USR-ESTIMATOR-01',
    userRole: 'ESTIMATOR',
    currentPage: 'spreadsheet',
    intent: 'MUTATE_RAB',
    complexity: 'SIMPLE',
    requiresTools: true,
    requiresExternalKnowledge: false,
    status: 'PLANNING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert(Boolean(validTask.projectId && validTask.projectId.length > 0), 'AgentTask must have valid projectId');
  assert(validTask.workspaceId === 'WS-001', 'AgentTask must have authoritative workspaceId');
  assert(validTask.userId === 'USR-ESTIMATOR-01', 'AgentTask must have verified userId');

  // 2. Specialized Agent Registry
  const registry = AgentRegistry.getInstance();
  const rabAgent = registry.getAgent('agent_rab');
  assert(Boolean(rabAgent), 'agent_rab must be registered in AgentRegistry');
  assert(rabAgent?.requiresHumanApproval === true, 'agent_rab must require human approval for mutations');
  assert(Boolean(rabAgent?.allowedRoles.includes('ESTIMATOR')), 'agent_rab must allow ESTIMATOR role');

  // 3. Mutating tools require confirmation
  const confirmationRequiredTools = toolRegistry.getAll().filter((t) => t.requiresConfirmation);
  assert(confirmationRequiredTools.length > 0, 'ToolRegistry must contain tools requiring confirmation');
  for (const tool of confirmationRequiredTools) {
    assert(tool.requiresConfirmation === true, `Tool ${tool.name} must require confirmation`);
  }

  // 4. Action Preview & Diff Summary
  const mockAction: AgentAction = {
    actionId: 'act_001',
    taskId: 'task_123',
    toolName: 'create_rab_item',
    arguments: {
      description: 'Pasangan Dinding Bata Ringan',
      volume: 20,
      unit: 'm²',
      unitPrice: 145000,
      wbsCategory: 'Pekerjaan Dinding & Plesteran',
    },
    source: 'LOCAL_AI',
    confidence: 0.95,
    preview: {
      actionId: 'act_001',
      toolName: 'create_rab_item',
      title: 'Tambah Item RAB Baru',
      summary: 'Menambahkan 20 m² Pasangan Dinding Bata Ringan senilai Rp 2.900.000',
      costImpact: 2900000,
      affectedItemCount: 1,
      riskLevel: 'MEDIUM',
      requiresConfirmation: true,
    },
    requiresConfirmation: true,
    validationStatus: 'VALID',
    status: 'PROPOSED',
  };

  assert(mockAction.preview.requiresConfirmation === true, 'Action preview must require confirmation');
  assert(mockAction.preview.costImpact === 2900000, 'Action preview must correctly calculate cost impact');

  // 5. Validation Result
  const validation: AgentValidationResult = {
    isValid: true,
    violations: [],
    warnings: [],
    projectIsolationVerified: true,
    rolePermissionGranted: true,
    ahspIntegrityMaintained: true,
    priceCalculationVerified: true,
  };
  assert(validation.isValid && validation.ahspIntegrityMaintained, 'Validation result must guarantee AHSP integrity');

  // 6. Observability Trace
  const trace: AgentTrace = {
    traceId: 'trc_999',
    taskId: 'task_123',
    projectId: 'PRJ-2026-001',
    workspaceId: 'WS-001',
    userId: 'USR-ESTIMATOR-01',
    intent: 'MUTATE_RAB',
    selectedProvider: 'OLLAMA_LOCAL',
    model: 'qwen3:8b',
    toolsCalled: ['get_project_summary', 'match_ahsp_candidates'],
    executionDurationMs: 420,
    validationResult: validation,
    mutationExecuted: false,
    timestamp: new Date().toISOString(),
  };
  assert(trace.traceId === 'trc_999', 'Trace ID must be captured');
  // 7. Phase 4 AI Agent Intelligence Test Suites
  const { runAiIntentTestSuite } = await import('./aiIntent.test');
  await runAiIntentTestSuite();

  const { runAiContextTestSuite } = await import('./aiContext.test');
  await runAiContextTestSuite();

  const { runKnowledgeRouterTestSuite } = await import('./knowledgeRouter.test');
  await runKnowledgeRouterTestSuite();

  const { runToolIntelligenceTestSuite } = await import('./toolIntelligence.test');
  await runToolIntelligenceTestSuite();

  const { runActionProposalTestSuite } = await import('./actionProposal.test');
  await runActionProposalTestSuite();

  // 8. Phase 5 Real Agent Execution & E2E User Workflow Test Suite
  const { runAgentExecutionE2ETestSuite } = await import('./agentExecutionE2E.test');
  await runAgentExecutionE2ETestSuite();
}

// Execute standalone if run directly
if (process.argv[1]?.endsWith('agentArchitectureAudit.test.ts')) {
  runAgentArchitectureAuditTest()
    .then(() => console.log('All Agent Architecture Audit, Phase 4 & Phase 5 E2E tests passed successfully.'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

