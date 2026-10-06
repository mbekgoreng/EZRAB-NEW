import assert from 'assert';
import { providerGateway } from '../providers/providerGateway';
import { modelRouter } from '../providers/modelRouter';
import { EzrabCoreProvider } from '../providers/ezrabCoreProvider';
import { LocalAIProvider } from '../providers/localAIProvider';
import { ExternalGatewayProvider } from '../providers/externalGatewayProvider';
import { HermesProvider } from '../providers/hermesProvider';
import { getAiConfig, getSanitizedAiConfig } from '../config/aiConfig';
import { subscriptionDataService } from '../services/extendedDataServices';

export async function runRealAiRuntimeTestSuite(): Promise<void> {
  console.log('============================================================');
  console.log('EZRAB REAL AI RUNTIME & PROVIDER VALIDATION SUITE (PHASE 3)');
  console.log('============================================================\n');

  const cfg = getAiConfig();
  const sanitized = getSanitizedAiConfig();

  // ------------------------------------------------------------
  // 1. CONFIGURATION SANITIZATION & NO LEAKAGE
  // ------------------------------------------------------------
  assert.strictEqual(sanitized.external.apiKey, undefined, 'Sanitized config must NEVER contain apiKey');
  assert.strictEqual((sanitized as any).SUPABASE_SECRET_KEY, undefined, 'Sanitized config must NEVER contain secret keys');

  // ------------------------------------------------------------
  // 2. EZRAB CORE RUNTIME VALIDATION
  // ------------------------------------------------------------
  const coreProvider = new EzrabCoreProvider();
  const coreHealth = await coreProvider.healthCheck();
  assert.strictEqual(coreHealth.status, 'AVAILABLE', 'EZRAB Core must be AVAILABLE');
  assert.strictEqual(coreProvider.capabilities.estimatedCostClass, 'free');

  // Test deterministic routing & execution
  const coreRabRes = await providerGateway.executeChat(
    { taskType: 'DETERMINISTIC_CORE', intent: 'RAB_TOTAL' },
    {
      messages: [{ id: '1', role: 'user', content: 'Berapa total RAB?', createdAt: new Date().toISOString() }],
      projectId: 'PRJ-PHASE3-CORE',
      workspaceId: 'WS-PHASE3',
      userId: 'USER-1'
    }
  );
  assert.strictEqual(coreRabRes.routeDecision.selectedProvider, 'ezrab_core');
  assert.ok(coreRabRes.traceId.startsWith('AI-'));
  assert.ok(coreRabRes.latencyMs >= 0);

  // ------------------------------------------------------------
  // 3. LOCAL AI / OLLAMA RUNTIME DIAGNOSTIC
  // ------------------------------------------------------------
  const localProvider = new LocalAIProvider();
  const localHealth = await localProvider.healthCheck();
  console.log(`[Diagnostic] Local AI Health: ${localHealth.status} (${localHealth.message})`);

  const discoveredLocalModels = await localProvider.discoverModels();
  console.log(`[Diagnostic] Local Models Discovered: [${discoveredLocalModels.join(', ') || 'none'}]`);

  const localInference = await localProvider.testInference();
  if (localInference.success) {
    console.log(`[Diagnostic] Real Local Inference: PASS (${localInference.latencyMs}ms) -> "${localInference.answer?.slice(0, 60)}..."`);
  } else {
    console.log(`[Diagnostic] Real Local Inference: SKIPPED/FAIL -> ${localInference.error}`);
  }

  // ------------------------------------------------------------
  // 4. HERMES RUNTIME DIAGNOSTIC
  // ------------------------------------------------------------
  const hermesProvider = new HermesProvider();
  const hermesHealth = await hermesProvider.healthCheck();
  console.log(`[Diagnostic] Hermes Gateway Status: ${hermesHealth.status}`);
  if (!cfg.hermes.enabled) {
    assert.strictEqual(hermesHealth.status, 'NOT_CONFIGURED', 'Hermes must report NOT_CONFIGURED when unset');
  }

  // ------------------------------------------------------------
  // 5. EXTERNAL AI / 9ROUTER RUNTIME DIAGNOSTIC
  // ------------------------------------------------------------
  const externalProvider = new ExternalGatewayProvider();
  const externalHealth = await externalProvider.healthCheck();
  console.log(`[Diagnostic] External Gateway Status: ${externalHealth.status}`);

  const externalInference = await externalProvider.testInference();
  if (externalInference.success) {
    console.log(`[Diagnostic] Real External Inference: PASS (${externalInference.latencyMs}ms)`);
  } else {
    console.log(`[Diagnostic] Real External Inference: SKIPPED -> ${externalInference.error}`);
  }

  // ------------------------------------------------------------
  // 6. ROUTING MATRIX VALIDATION
  // ------------------------------------------------------------
  // A. Total RAB -> Core
  const d1 = modelRouter.routeTask({ taskType: 'DETERMINISTIC_CORE', intent: 'RAB_TOTAL' });
  assert.strictEqual(d1.selectedProvider, 'ezrab_core');

  // B. Volume calculation -> Core
  const d2 = modelRouter.routeTask({ taskType: 'DETERMINISTIC_CORE', intent: 'QTO_LOOKUP' });
  assert.strictEqual(d2.selectedProvider, 'ezrab_core');

  // C. AHSP PUPR lookup -> Core
  const d3 = modelRouter.routeTask({ taskType: 'DETERMINISTIC_CORE', intent: 'AHSP_LOOKUP' });
  assert.strictEqual(d3.selectedProvider, 'ezrab_core');

  // D. General explanation -> Local AI
  const d4 = modelRouter.routeTask({ taskType: 'SIMPLE_CHAT', complexity: 'LOW' });
  assert.strictEqual(d4.selectedProvider, 'local');

  // E. Vision / Image DED task -> External AI (or mock in test fallback)
  const d5 = modelRouter.routeTask({ taskType: 'IMAGE_ANALYSIS', requiresVision: true });
  assert.ok(d5.selectedProvider === 'external' || d5.selectedProvider === 'mock');
  assert.strictEqual(d5.escalated, true);
  assert.strictEqual(d5.escalationReason, 'VISION_REQUIRED');

  // F. Complex multi-step reasoning -> External AI
  const d6 = modelRouter.routeTask({ taskType: 'COMPLEX_PLANNING', complexity: 'HIGH' });
  assert.ok(d6.selectedProvider === 'external' || d6.selectedProvider === 'mock');
  assert.strictEqual(d6.escalated, true);

  // ------------------------------------------------------------
  // 7. SECURITY & ISOLATION (FAIL-CLOSED NEGATIVE TESTS)
  // ------------------------------------------------------------
  // Forged project ID must be rejected without fallback
  await assert.rejects(
    async () => {
      await providerGateway.executeChat(
        { taskType: 'SIMPLE_CHAT' },
        {
          messages: [{ id: '1', role: 'user', content: 'Hack attempt', createdAt: new Date().toISOString() }],
          projectId: 'UNAUTHORIZED_CROSS_PROJECT'
        }
      );
    },
    (err: any) => err.message.includes('AI_SECURITY_ERROR'),
    'Forged projectId must throw AI_SECURITY_ERROR'
  );

  // ------------------------------------------------------------
  // 8. OBSERVABILITY & TRACE ID INTEGRITY
  // ------------------------------------------------------------
  const healthList = await providerGateway.getAllProviderHealth();
  assert.ok(healthList.ezrab_core);
  assert.ok(healthList.local);
  assert.ok(healthList.external);
  assert.ok(healthList.hermes);

  // ------------------------------------------------------------
  // 9. QUOTA INTEGRITY
  // ------------------------------------------------------------
  const ws = 'WS-PHASE3-QUOTA-TEST';
  const initialCredit = subscriptionDataService.getSubscription(ws).aiTokensRemaining;
  // Execute deterministic core call
  await providerGateway.executeChat(
    { taskType: 'DETERMINISTIC_CORE', intent: 'RAB_TOTAL' },
    {
      messages: [{ id: '1', role: 'user', content: 'Cek total RAB', createdAt: new Date().toISOString() }],
      projectId: 'PRJ-PHASE3-QUOTA',
      workspaceId: ws,
      userId: 'USER-1'
    }
  );
  const finalCredit = subscriptionDataService.getSubscription(ws).aiTokensRemaining;
  assert.strictEqual(initialCredit, finalCredit, 'Core queries must NOT consume quota');

  console.log('\n✅ All Phase 3 Real AI Runtime & Security Isolation checks PASSED');
}
