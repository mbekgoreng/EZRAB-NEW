import assert from 'assert';
import { providerGateway } from '../providers/providerGateway';
import { modelRouter } from '../providers/modelRouter';
import { EzrabCoreProvider } from '../providers/ezrabCoreProvider';
import { LocalAIProvider } from '../providers/localAIProvider';
import { ExternalGatewayProvider } from '../providers/externalGatewayProvider';
import { HermesProvider } from '../providers/hermesProvider';
import { MockAIProvider } from '../providers/mockProvider';
import { subscriptionDataService } from '../services/extendedDataServices';

export async function runProviderGatewayTestSuite(): Promise<void> {
  console.log('--- Running Unified AI Provider Gateway & Model Router Test Suite ---');

  // ==========================================
  // A. PROVIDER AVAILABILITY & HEALTH TESTS
  // ==========================================
  
  // 1. EZRAB Core Available
  const coreProvider = new EzrabCoreProvider();
  const coreHealth = await coreProvider.healthCheck();
  assert.strictEqual(coreHealth.status, 'AVAILABLE', 'EZRAB Core must always be AVAILABLE');
  assert.strictEqual(coreProvider.capabilities.estimatedCostClass, 'free');
  assert.strictEqual(coreProvider.capabilities.latencyClass, 'fast');

  // 2. Mock Provider Available
  const mockProvider = new MockAIProvider();
  const mockHealth = await mockProvider.healthCheck();
  assert.strictEqual(mockHealth.status, 'AVAILABLE', 'Mock Provider must be AVAILABLE');

  // 3. Local AI Provider contract
  const localProvider = new LocalAIProvider();
  assert.strictEqual(localProvider.type, 'local');
  assert.strictEqual(localProvider.capabilities.supportsStructuredOutput, true);

  // 4. External Gateway Provider contract
  const externalProvider = new ExternalGatewayProvider();
  assert.strictEqual(externalProvider.type, 'external');
  assert.strictEqual(externalProvider.capabilities.supportsVision, true);

  // 5. Hermes Provider contract
  const hermesProvider = new HermesProvider();
  assert.strictEqual(hermesProvider.type, 'hermes');
  const hermesHealth = await hermesProvider.healthCheck();
  assert.ok(
    hermesHealth.status === 'NOT_CONFIGURED' || hermesHealth.status === 'AVAILABLE',
    'Hermes health must be safely reportable'
  );

  // 6. Provider Gateway registry returns proper instances
  assert.ok(providerGateway.getProvider('ezrab_core') instanceof EzrabCoreProvider);
  assert.ok(providerGateway.getProvider('mock') instanceof MockAIProvider);
  assert.ok(providerGateway.getProvider('local') instanceof LocalAIProvider);
  assert.ok(providerGateway.getProvider('external') instanceof ExternalGatewayProvider);

  // 7. Health API returns list without leaking secret keys
  const allHealth = await providerGateway.getAllProviderHealth();
  const healthList = Array.isArray(allHealth) ? allHealth : Object.values(allHealth);
  assert.ok(healthList.length >= 4);
  for (const h of healthList) {
    assert.ok(h.providerId);
    assert.ok(h.status);
    assert.strictEqual((h as any).apiKey, undefined, 'API key must never be exposed');
    assert.strictEqual((h as any).secret, undefined, 'Secret must never be exposed');
  }

  // ==========================================
  // B. INTELLIGENT ROUTING & ESCALATION TESTS
  // ==========================================

  // 8. Deterministic RAB Total -> EZRAB Core
  const rabTotalDecision = modelRouter.routeTask({
    taskType: 'DETERMINISTIC_CORE',
    intent: 'RAB_TOTAL'
  });
  assert.strictEqual(rabTotalDecision.selectedProvider, 'ezrab_core');
  assert.strictEqual(rabTotalDecision.escalated, false);
  assert.strictEqual(rabTotalDecision.costClass, 'free');

  // 9. AHSP Lookup -> EZRAB Core
  const ahspDecision = modelRouter.routeTask({
    taskType: 'DETERMINISTIC_CORE',
    intent: 'AHSP_LOOKUP'
  });
  assert.strictEqual(ahspDecision.selectedProvider, 'ezrab_core');
  assert.strictEqual(ahspDecision.costClass, 'free');

  // 10. QTO Lookup -> EZRAB Core
  const qtoDecision = modelRouter.routeTask({
    taskType: 'DETERMINISTIC_CORE',
    intent: 'QTO_LOOKUP'
  });
  assert.strictEqual(qtoDecision.selectedProvider, 'ezrab_core');
  assert.strictEqual(qtoDecision.costClass, 'free');

  // 11. Simple Explanation -> Local AI
  const chatDecision = modelRouter.routeTask({
    taskType: 'SIMPLE_CHAT',
    complexity: 'LOW'
  });
  assert.strictEqual(chatDecision.selectedProvider, 'local');
  assert.strictEqual(chatDecision.escalated, false);

  // 12. Complex Multi-Step Planning -> External AI
  const planningDecision = modelRouter.routeTask({
    taskType: 'COMPLEX_PLANNING',
    complexity: 'HIGH'
  });
  assert.strictEqual(planningDecision.selectedProvider, 'external');
  assert.strictEqual(planningDecision.escalated, true);
  assert.strictEqual(planningDecision.escalationReason, 'COMPLEX_TASK');

  // 13. Vision / Image Analysis Task -> External AI
  const visionDecision = modelRouter.routeTask({
    taskType: 'IMAGE_ANALYSIS',
    requiresVision: true
  });
  assert.strictEqual(visionDecision.selectedProvider, 'external');
  assert.strictEqual(visionDecision.escalated, true);
  assert.strictEqual(visionDecision.escalationReason, 'VISION_REQUIRED');

  // ==========================================
  // C. CIRCUIT BREAKER & FALLBACK TESTS
  // ==========================================

  // 14. Circuit Breaker triggers after consecutive failures
  modelRouter.recordFailure('external');
  modelRouter.recordFailure('external');
  modelRouter.recordFailure('external');
  assert.strictEqual(modelRouter.isProviderHealthy('external'), false, 'Circuit must open after 3 failures');

  // 15. Routing when external is unhealthy falls back to mock/local
  const fallbackVisionDecision = modelRouter.routeTask({
    taskType: 'IMAGE_ANALYSIS',
    requiresVision: true
  });
  assert.strictEqual(fallbackVisionDecision.selectedProvider, 'mock', 'Must fallback to mock when external unhealthy');

  // 16. Record success restores health
  modelRouter.recordSuccess('external');
  assert.strictEqual(modelRouter.isProviderHealthy('external'), true, 'Circuit must restore after success');

  // ==========================================
  // D. SECURITY & PROJECT ISOLATION TESTS
  // ==========================================

  // 17. Unauthorized project context is rejected immediately
  await assert.rejects(
    async () => {
      await providerGateway.executeChat(
        { taskType: 'SIMPLE_CHAT' },
        {
          messages: [{ id: '1', role: 'user', content: 'Test prompt', createdAt: new Date().toISOString() }],
          projectId: 'UNAUTHORIZED_PROJECT_ATTEMPT'
        }
      );
    },
    (err: any) => err.message.includes('SECURITY_ERROR')
  );

  // ==========================================
  // E. END-TO-END GATEWAY EXECUTION
  // ==========================================

  // 18. Execution with EZRAB Core provider for total RAB
  const coreResult = await providerGateway.executeChat(
    { taskType: 'DETERMINISTIC_CORE', intent: 'RAB_TOTAL' },
    {
      messages: [{ id: '1', role: 'user', content: 'Berapa total RAB proyek ini?', createdAt: new Date().toISOString() }],
      projectId: 'PRJ-TEST-GATEWAY',
      workspaceId: 'WS-TEST-GATEWAY',
      userId: 'USER-TEST'
    }
  );
  assert.ok(coreResult.content.length > 0);
  assert.strictEqual(coreResult.routeDecision.selectedProvider, 'ezrab_core');
  assert.ok(coreResult.toolCalls && coreResult.toolCalls.length > 0);
  assert.strictEqual(coreResult.toolCalls[0].name, 'get_rab_summary');

  // 19. Execution with Mock Provider for general tool action
  const actionResult = await providerGateway.executeChat(
    { taskType: 'STRUCTURED_TOOL_CALLING', forcedMode: 'auto' },
    {
      messages: [{ id: '2', role: 'user', content: 'Tolong tambahkan pekerjaan pintu kayu', createdAt: new Date().toISOString() }],
      projectId: 'PRJ-TEST-GATEWAY',
      workspaceId: 'WS-TEST-GATEWAY',
      userId: 'USER-TEST'
    }
  );
  assert.ok(actionResult.content.length > 0);
  assert.ok(actionResult.toolCalls && actionResult.toolCalls.length > 0);
  assert.strictEqual(actionResult.toolCalls[0].name, 'add_rab_item');

  // ==========================================
  // F. USAGE & QUOTA NON-DUPLICATION
  // ==========================================

  // 20. Free / EZRAB Core calls do not consume subscription quota
  const initialCredit = subscriptionDataService.getSubscription('WS-TEST-GATEWAY').aiTokensRemaining;
  // Core chat execution
  await providerGateway.executeChat(
    { taskType: 'DETERMINISTIC_CORE', intent: 'AHSP_LOOKUP' },
    {
      messages: [{ id: '3', role: 'user', content: 'Cari AHSP beton K-250', createdAt: new Date().toISOString() }],
      projectId: 'PRJ-TEST-GATEWAY',
      workspaceId: 'WS-TEST-GATEWAY',
      userId: 'USER-TEST'
    }
  );
  const creditAfterCore = subscriptionDataService.getSubscription('WS-TEST-GATEWAY').aiTokensRemaining;
  assert.strictEqual(initialCredit, creditAfterCore, 'Core operations must not consume external credit');

  console.log('✅ All 20 Unified AI Provider Gateway & Model Router assertions PASSED');
}
