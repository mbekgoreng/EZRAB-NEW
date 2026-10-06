import { aiDbAdapter } from '../database/dbAdapter';
import { toolRegistry } from '../tools/toolRegistry';
import { calculationService } from '../services/calculationService';
import { projectDataService } from '../services/projectDataService';
import { rabDataService } from '../services/rabDataService';
import { curveSDataService } from '../services/curveSDataService';
import { ahspDataService } from '../services/ahspDataService';
import { reportDataService } from '../services/reportDataService';
import { progressDataService } from '../services/progressDataService';
import { aiOrchestrator } from '../orchestrator/aiOrchestrator';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { IsolationGuard } from '../middleware/isolationGuard';

function assert(condition: boolean, testName: string, detail?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✅ PASS: ${testName}`);
}

export async function runAiBackendTestSuite(): Promise<void> {
  console.log('\n=============================================================');
  console.log('🚀 RUNNING EZRAB AI BACKEND TEST SUITE (PHASE 2)');
  console.log('=============================================================\n');

  const WS = 'ws-default-ezrab';
  const PRJ_VALID = 'PRJ-TROPIS-MODERN-01';
  const PRJ_OTHER_WS = 'ws-foreign-workspace';

  // 1. AUTH & PERMISSIONS TEST
  console.log('--- TEST 1: Role Permissions Matrix ---');
  assert(AuthMiddleware.hasPermission('SUPER_ADMIN', 'AI_DELETE'), 'SuperAdmin has AI_DELETE');
  assert(AuthMiddleware.hasPermission('ESTIMATOR', 'AI_CREATE'), 'Estimator has AI_CREATE');
  assert(!AuthMiddleware.hasPermission('CLIENT', 'AI_CREATE'), 'Client does NOT have AI_CREATE');
  assert(!AuthMiddleware.hasPermission('DIREKSI', 'AI_DELETE'), 'Direksi does NOT have AI_DELETE');

  // 2. MULTI-TENANT ISOLATION TEST
  console.log('\n--- TEST 2: Multi-Tenant Workspace Isolation ---');
  assert(IsolationGuard.validateAccess(WS, PRJ_VALID), 'Valid workspace & project access allowed');
  
  let foreignAccessBlocked = false;
  try {
    IsolationGuard.validateAccess(PRJ_OTHER_WS, PRJ_VALID);
  } catch (err: any) {
    foreignAccessBlocked = true;
  }
  assert(foreignAccessBlocked, 'Foreign workspace access strictly rejected with Access Denied');

  // 3. HIGH-PRECISION CALCULATION SERVICE TEST
  console.log('\n--- TEST 3: Safe Decimal Arithmetic Precision ---');
  const subtotal = calculationService.calculateItemSubtotal(12.345, 125050.75);
  assert(typeof subtotal === 'number' && subtotal > 0, 'Decimal subtotal calculated without error');
  // Check no IEEE 754 drift (e.g. 0.1 + 0.2 === 0.3)
  const itemsCalc = calculationService.calculateRabItems([
    { volume: 0.1, unitPrice: 100 },
    { volume: 0.2, unitPrice: 100 }
  ]);
  assert(itemsCalc.totalCost === 30, 'Zero floating point drift on decimal addition');

  const devCalc = calculationService.calculateDeviation(38.5, 42.0);
  assert(devCalc.deviation === -3.5, 'Deviation calculation accurately reports -3.5%');
  assert(devCalc.status === 'BEHIND_SCHEDULE', 'Negative deviation correctly identified as BEHIND_SCHEDULE');

  // 4. TOOL REGISTRY COMPLETENESS TEST
  console.log('\n--- TEST 4: Tool Registry Tools Validation ---');
  const allTools = toolRegistry.getAll();
  assert(allTools.length >= 15, `Tool registry contains all tools (found ${allTools.length})`);

  const expectedToolNames = [
    'get_project_summary',
    'get_rab_summary',
    'search_rab_items',
    'get_ahsp_detail',
    'search_ahsp',
    'get_kurva_s',
    'get_project_progress',
    'calculate_rab',
    'detect_cost_anomalies',
    'get_project_metadata',
    'add_rab_item',
    'update_rab_item',
    'delete_rab_item',
    'update_progress',
    'create_project_report'
  ];

  for (const name of expectedToolNames) {
    const tool = toolRegistry.get(name);
    assert(!!tool, `Tool ${name} is properly registered`);
  }

  // 5. READ TOOLS DATA VERIFICATION
  console.log('\n--- TEST 5: Read Tools Execution ---');
  const prjSummary = await toolRegistry.get('get_project_summary')!.execute({}, { workspaceId: WS, projectId: PRJ_VALID, userId: 'test' });
  assert(prjSummary.projectId === PRJ_VALID, 'get_project_summary returns matching project ID');

  const rabSummary = await toolRegistry.get('get_rab_summary')!.execute({}, { workspaceId: WS, projectId: PRJ_VALID, userId: 'test' });
  assert(rabSummary.totalCost > 0, `get_rab_summary reports totalCost: ${rabSummary.totalCost}`);
  assert(rabSummary.categoryBreakdown.length > 0, 'RAB has structured category breakdown');

  const ahspSearch = await toolRegistry.get('search_ahsp')!.execute({ query: 'beton' }, { workspaceId: WS, projectId: PRJ_VALID, userId: 'test' });
  assert(ahspSearch.items.length > 0, 'search_ahsp finds official PUPR beton items');

  const kurvaResult = await toolRegistry.get('get_kurva_s')!.execute({}, { workspaceId: WS, projectId: PRJ_VALID, userId: 'test' });
  assert(kurvaResult.dataPoints.length > 0, 'get_kurva_s returns weekly Kurva S data points');

  const anomalies = await toolRegistry.get('detect_cost_anomalies')!.execute({ thresholdPercent: 10 }, { workspaceId: WS, projectId: PRJ_VALID, userId: 'test' });
  assert(Array.isArray(anomalies.highConcentrationItems), 'detect_cost_anomalies returns high concentration items');

  // 6. WRITE ACTION CONFIRMATION INTERCEPTOR TEST
  console.log('\n--- TEST 6: Write Action Confirmation Interceptor ---');
  const addTool = toolRegistry.get('add_rab_item')!;
  assert(addTool.requiresConfirmation === true, 'add_rab_item explicitly requires user confirmation');

  const orchestratorResponse = await aiOrchestrator.handleChat({
    workspaceId: WS,
    projectId: PRJ_VALID,
    userId: 'user-estimator-01',
    message: 'Tolong tambahkan item pekerjaan pintu kayu solid ke RAB'
  });

  assert(
    orchestratorResponse.status === 'CONFIRMATION_REQUIRED',
    'Write mutation stopped by interceptor with CONFIRMATION_REQUIRED status'
  );
  assert(
    !!orchestratorResponse.actionProposal,
    'Action proposal returned with clear parameter payload'
  );

  // 7. CONFIRM ACTION EXECUTION & AUDIT LOG TEST
  console.log('\n--- TEST 7: Execute Confirmed Action & Audit Trail ---');
  const confirmed = await aiOrchestrator.executeConfirmedAction(
    WS,
    PRJ_VALID,
    'user-estimator-01',
    'ESTIMATOR',
    orchestratorResponse.actionProposal!
  );

  assert(confirmed.success === true, 'Confirmed action executed successfully');
  
  const auditLogs = await aiDbAdapter.getAuditLogs(WS, PRJ_VALID);
  assert(auditLogs.length > 0, 'Audit log trail contains entry for executed action');
  const latestLog = auditLogs[0];
  assert(latestLog.entity_type === 'RAB_ITEM', `Audit log entityType is RAB_ITEM (got ${latestLog.entity_type})`);

  // 8. REPORT DRAFT GENERATION TEST
  console.log('\n--- TEST 8: Report Draft Generation ---');
  const reportDraft = await reportDataService.generateWeeklyReportDraft(WS, PRJ_VALID, 5, 'EZRAB AI');
  assert(reportDraft.reportId.startsWith('REP-'), 'Report ID properly generated');
  assert(reportDraft.summaryMetrics.totalBudget > 0, 'Report includes total budget metrics');

  console.log('\n=============================================================');
  console.log('🎉 ALL EZRAB AI BACKEND TESTS PASSED SUCCESSFULLY (100%)');
  console.log('=============================================================\n');
}

// Run test if executed directly via Node / tsx
runAiBackendTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
