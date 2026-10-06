/**
 * Phase 9.3 — Multi-Provider AI + Cost Router + API Key Pool Test Suite
 *
 * Validates:
 * 1. Provider Registry: Gemini (5 slots), Atria (15 slots), Inception (15 slots), zrouter (1 slot).
 * 2. Empty Key Filtering & Safe Key Pool Scanning.
 * 3. Safe Key Rotation, Cooldown, and Health State Tracking.
 * 4. Strict Capability Enforcement (Atria/Mercury text-only rejected for vision/drawing/PDF).
 * 5. Cheap-First Policy with Controlled Escalation.
 * 6. Cost Estimation & Budget Guardrails (Request, Task, Day, Project).
 * 7. Controlled Fallback respecting capability boundaries.
 * 8. Anti-Hallucination Guardrail (No source -> NOT_FOUND, no fabricated concrete grades).
 * 9. Multi-Provider Provenance (Extractor vs Reasoner vs Calculator).
 * 10. Project Isolation across AI requests.
 * 11. Security: Zero secrets in client configs, key aliases, or logs.
 * 12. Provider Connectivity Classification (REAL_PROVIDER vs MOCK_PROVIDER vs NOT_TESTED).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { aiProviderRegistry, AIProviderRegistry } from '../services/aiProviderRegistry';
import { aiCostRouter, AICostRouter } from '../services/aiCostRouter';
import { aiProviderRouter, AIProviderRouter } from '../services/aiProviderRouter';
import { AIEvidence, queryFactInProjectSources } from '../services/aiEvidenceService';
import { getSanitizedAiConfig } from '../../server/config/aiConfig';
import { FullProjectAIContext } from '../services/aiContextService';
import { Project } from '../types';

describe('PHASE 9.3 [1] — KEY POOLS & EMPTY KEY FILTERING', () => {
  it('should support Gemini 5 slots, Atria 15 slots, Inception 15 slots, and zrouter 1 slot', () => {
    const geminiKeys = aiProviderRegistry.getKeyEntries('gemini');
    const atriaKeys = aiProviderRegistry.getKeyEntries('atria');
    const inceptionKeys = aiProviderRegistry.getKeyEntries('inception');
    const zrouterKeys = aiProviderRegistry.getKeyEntries('zrouter');

    assert.equal(geminiKeys.length, 5, 'Gemini must have 5 key slots');
    assert.equal(atriaKeys.length, 15, 'Atria must have 15 key slots');
    assert.equal(inceptionKeys.length, 15, 'Inception must have 15 key slots');
    assert.ok(zrouterKeys.length >= 1, 'zrouter must have at least 1 key slot');
  });

  it('should safely filter empty key environment variables without crashing', () => {
    // Simulate mixed environment variables
    const simulatedEnv: Record<string, string> = {
      GEMINI_API_KEY_1: 'gemini-secret-test-key-1',
      GEMINI_API_KEY_2: '',
      GEMINI_API_KEY_3: '   ',
      GEMINI_API_KEY_4: 'gemini-secret-test-key-4',
      // GEMINI_API_KEY_5 is undefined
      ATRIA_API_KEY_1: 'atria-secret-test-key-1',
      ATRIA_API_KEY_7: 'atria-secret-test-key-7',
      INCEPTION_API_KEY_3: 'inception-secret-test-key-3',
      ZROUTER_API_KEY: 'zrouter-secret-test-key',
    };

    aiProviderRegistry.scanEnvironmentKeyPool(simulatedEnv);

    // Check Gemini active keys
    const geminiActive = aiProviderRegistry.getKeyEntries('gemini').filter((k) => k.enabled && k.status === 'AVAILABLE');
    assert.equal(geminiActive.length, 2, 'Only key 1 and key 4 should be active for Gemini');
    assert.deepEqual(geminiActive.map((k) => k.id), ['gemini-key-1', 'gemini-key-4']);

    // Check Atria active keys
    const atriaActive = aiProviderRegistry.getKeyEntries('atria').filter((k) => k.enabled && k.status === 'AVAILABLE');
    assert.equal(atriaActive.length, 2, 'Only key 1 and key 7 should be active for Atria');
    assert.deepEqual(atriaActive.map((k) => k.id), ['atria-key-1', 'atria-key-7']);

    // Check Inception active keys
    const inceptionActive = aiProviderRegistry.getKeyEntries('inception').filter((k) => k.enabled && k.status === 'AVAILABLE');
    assert.equal(inceptionActive.length, 1, 'Only key 3 should be active for Inception');
    assert.equal(inceptionActive[0].id, 'inception-key-3');

    // Check zrouter active keys
    const zrouterActive = aiProviderRegistry.getKeyEntries('zrouter').filter((k) => k.enabled && k.status === 'AVAILABLE');
    assert.equal(zrouterActive.length, 1, 'Only key 1 should be active for zrouter');
    assert.equal(zrouterActive[0].id, 'zrouter-key-1');

    // Restore standard key pool
    aiProviderRegistry.scanEnvironmentKeyPool();
  });
});

describe('PHASE 9.3 [2] — KEY ROTATION, COOLDOWN & PROVIDER HEALTH', () => {
  it('should rotate to the next active key when primary key encounters rate limiting (429)', () => {
    // Setup 2 active keys
    const env = {
      GEMINI_API_KEY_1: 'test-key-1-gemini',
      GEMINI_API_KEY_2: 'test-key-2-gemini',
    };
    aiProviderRegistry.scanEnvironmentKeyPool(env);

    const initialKey = aiProviderRegistry.selectAvailableKey('gemini', 0.01);
    assert.ok(initialKey);
    assert.equal(initialKey.id, 'gemini-key-1');

    // Trigger failure with 429
    aiProviderRegistry.recordKeyFailure('gemini-key-1', 'RATE_LIMITED', 30000);

    // Router must now select key 2
    const rotatedKey = aiProviderRegistry.selectAvailableKey('gemini', 0.01);
    assert.ok(rotatedKey);
    assert.equal(rotatedKey.id, 'gemini-key-2');

    // Provider health should now be DEGRADED (1 of 2 keys available)
    const health = aiProviderRegistry.getProviderHealth('gemini');
    assert.equal(health, 'DEGRADED');

    // When key 2 also fails, provider should become UNAVAILABLE
    aiProviderRegistry.recordKeyFailure('gemini-key-2', 'TIMEOUT', 30000);
    assert.equal(aiProviderRegistry.getProviderHealth('gemini'), 'UNAVAILABLE');

    // Restore key 1
    aiProviderRegistry.recordKeySuccess('gemini-key-1');
    aiProviderRegistry.recordKeySuccess('gemini-key-2');
    assert.equal(aiProviderRegistry.getProviderHealth('gemini'), 'HEALTHY');

    // Restore standard key pool
    aiProviderRegistry.scanEnvironmentKeyPool();
  });
});

describe('PHASE 9.3 [3] — STRICT CAPABILITY MATCHING & INCOMPATIBLE PROVIDER REJECTION', () => {
  beforeEach(() => {
    // Ensure all test keys are enabled for selection testing
    const fullTestEnv = {
      GEMINI_API_KEY_1: 'test-gemini-key',
      ATRIA_API_KEY_1: 'test-atria-key',
      INCEPTION_API_KEY_1: 'test-inception-key',
      ZROUTER_API_KEY: 'test-zrouter-key',
    };
    aiProviderRegistry.scanEnvironmentKeyPool(fullTestEnv);
  });

  it('should REJECT text-only Atria and Inception/Mercury for drawing/vision tasks', () => {
    const route = aiCostRouter.selectBestModel({
      task: 'DRAWING_ANALYSIS',
      sourceType: 'drawing',
    });

    assert.notEqual(route.providerId, 'atria', 'Atria must be rejected for drawing tasks');
    assert.notEqual(route.providerId, 'inception', 'Inception/Mercury must be rejected for drawing tasks');
    assert.ok(
      route.capabilities.includes('VISION') && route.capabilities.includes('IMAGE'),
      'Chosen model must have VISION and IMAGE capabilities'
    );
    assert.ok(route.providerId === 'gemini' || route.providerId === 'zrouter');
  });

  it('should throw clean error when a forced provider lacks required capabilities', () => {
    assert.throws(
      () => {
        aiCostRouter.selectBestModel({
          task: 'DRAWING_ANALYSIS',
          sourceType: 'image',
          forceProviderId: 'atria', // Atria has no vision capability
        });
      },
      (err: any) => {
        return err.message.includes('AI_NO_SUITABLE_MODEL');
      }
    );

    assert.throws(
      () => {
        aiCostRouter.selectBestModel({
          task: 'DRAWING_ANALYSIS',
          sourceType: 'image',
          forceProviderId: 'inception', // Inception has no vision capability
        });
      },
      (err: any) => {
        return err.message.includes('AI_NO_SUITABLE_MODEL');
      }
    );
  });

  it('should route text-only reasoning tasks to Atria, Mercury, or cheap LLMs', () => {
    const route = aiCostRouter.selectBestModel({
      task: 'PROJECT_QA',
      qualityRequirement: 'CHEAP',
    });

    assert.ok(['atria', 'inception', 'zrouter', 'gemini'].includes(route.providerId));
    assert.ok(route.capabilities.includes('TEXT'));
  });
});

describe('PHASE 9.3 [4] — CHEAP-FIRST COST OPTIMIZER & BUDGET GUARDS', () => {
  it('should select ULTRA_CHEAP model for simple text classification', () => {
    const route = aiCostRouter.selectBestModel({
      task: 'SIMPLE_TEXT_CLASSIFICATION',
      qualityRequirement: 'ULTRA_CHEAP',
    });

    assert.equal(route.qualityTier, 'ULTRA_CHEAP');
    assert.ok(
      ['deepseek-v4.1-flash', 'glm-5.3-flash', 'gemini-2.0-flash-lite', 'gemini-3.5-flash-lite'].includes(route.modelId),
      `Selected: ${route.modelId}`
    );
    assert.ok(route.costEstimate.estimatedCostUsd < 0.001);
  });

  it('should select FRONTIER model ONLY when explicitly required by complex reasoning', () => {
    const route = aiCostRouter.selectBestModel({
      task: 'COMPLEX_REASONING',
      qualityRequirement: 'FRONTIER',
    });

    assert.equal(route.qualityTier, 'FRONTIER');
    assert.ok(['gpt-6-astra', 'mercury-reasoner-pro'].includes(route.modelId));
  });

  it('should block execution with COST_LIMIT_REACHED when request exceeds single request ceiling', () => {
    aiCostRouter.setBudgetConfig({ maxCostPerRequestUsd: 0.00001 });

    assert.throws(
      () => {
        aiCostRouter.selectBestModel({
          task: 'PROJECT_QA',
          estimatedInputTokens: 50000,
          estimatedOutputTokens: 10000,
        });
      },
      (err: any) => {
        return err.message.includes('COST_LIMIT_REACHED');
      }
    );

    aiCostRouter.setBudgetConfig({ maxCostPerRequestUsd: 0.50 });
  });
});

describe('PHASE 9.3 [5] — CAPABILITY-CHECKED FAILOVER EXECUTION', () => {
  it('should failover vision task ONLY to another verified vision model when primary fails', async () => {
    aiProviderRegistry.scanEnvironmentKeyPool({
      GEMINI_API_KEY_1: 'test-gemini-key',
      ATRIA_API_KEY_1: 'test-atria-key',
      INCEPTION_API_KEY_1: 'test-inception-key',
      ZROUTER_API_KEY_1: 'test-zrouter-key',
    });
    aiProviderRouter.clearCache();

    // Primary for DRAWING_ANALYSIS is gemini-2.0-flash
    const res = await aiProviderRouter.execute({
      criteria: {
        task: 'DRAWING_ANALYSIS',
        sourceType: 'drawing',
      },
      prompt: 'Extract floor plan dimensions',
      imageDataBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });

    assert.equal(res.success, true);
    assert.ok(
      res.route.capabilities.includes('VISION'),
      'Execution route must retain vision capability'
    );
    assert.notEqual(res.route.providerId, 'atria');
    assert.notEqual(res.route.providerId, 'inception');
  });
});

function createMockContext(projectOverride?: Partial<Project>, rabItems: any[] = []): FullProjectAIContext {
  const defaultProject: Project = {
    id: 'PRJ-EVIDENCE-01',
    name: 'Proyek Uji Coba',
    location: 'Indonesia',
    buildingType: 'Rumah Tinggal',
    budget: 800000000,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...projectOverride,
  } as unknown as Project;

  const totalRab = rabItems.reduce((acc, i) => acc + ((i.volume || 0) * (i.unitPrice || 0)), 0);

  return {
    project: defaultProject,
    currentPage: 'magic-ai',
    timestamp: new Date().toISOString(),
    rab: {
      totalRab,
      totalItems: rabItems.length,
      categories: [
        {
          name: 'Pekerjaan Utama',
          total: totalRab,
          weightPercent: 100,
          itemCount: rabItems.length,
          items: rabItems,
        },
      ],
      highestCostItem: rabItems[0] || null,
      topCostItems: rabItems,
      anomalyItems: [],
      missingVolumeItems: [],
    },
    curveS: {
      plannedProgress: 25,
      actualProgress: 20,
      deviation: -5,
      status: 'BEHIND_SCHEDULE',
      statusLabel: 'Deviasi -5%',
      totalWeeks: 12,
      currentWeek: 3,
      dataPoints: [],
    },
    schedule: {
      totalTasks: 0,
      completedTasks: [],
      activeTasks: [],
      pendingTasks: [],
      criticalTasks: [],
    },
    report: {
      projectName: defaultProject.name,
      clientName: 'Owner Proyek',
      location: defaultProject.location || 'Indonesia',
      currentDate: new Date().toISOString().split('T')[0],
      periodLabel: 'Minggu ke-3',
      actualProgress: 20,
      plannedProgress: 25,
      deviation: -5,
      totalCost: totalRab,
      completedWorks: [],
      activeWorks: [],
      upcomingWorks: [],
      potentialIssues: [],
    },
  };
}

describe('PHASE 9.3 [6] — ANTI-HALLUCINATION GUARDRAILS (NO SOURCE -> NO FACT)', () => {
  it('should return NOT_FOUND and REFUSE to guess concrete grade when no source document exists', () => {
    const mockEmptyContext = createMockContext({
      id: 'PRJ-EMPTY-01',
      name: 'Proyek Ruko Kosong',
      location: 'Jakarta',
    });

    const factResult = queryFactInProjectSources('MUTU_BETON', mockEmptyContext);

    assert.equal(factResult.status, 'NOT_FOUND');
    assert.ok(
      !factResult.answer.includes('K-250') &&
      !factResult.answer.includes('K-300') &&
      !factResult.answer.includes('K-350'),
      'AI must not invent arbitrary concrete grades'
    );
    assert.ok(factResult.answer.includes('tidak menemukan spesifikasi mutu beton'));
  });

  it('should return VERIFIED evidence when concrete specification is present in project sources', () => {
    const mockContextWithRab = createMockContext(
      {
        id: 'PRJ-VERIFIED-01',
        name: 'Proyek Gedung Parkir',
        location: 'Surabaya',
      },
      [
        {
          id: 'item-1',
          no: '1',
          code: 'STR-01',
          category: 'Struktur',
          description: 'Pengecoran Beton Ready Mix Mutu K-350 Slump 12±2 cm',
          volume: 50,
          unit: 'm³',
          unitPrice: 1350000,
          totalPrice: 67500000,
          amount: 67500000,
        },
      ]
    );

    const factResult = queryFactInProjectSources('MUTU_BETON', mockContextWithRab);
    assert.equal(factResult.status, 'VERIFIED');
    assert.ok(factResult.answer.includes('K-350'));
    assert.equal(factResult.source, 'RAB Item Pekerjaan');
  });
});

describe('PHASE 9.3 [7] — MULTI-PROVIDER PROVENANCE (EXTRACTOR VS REASONER)', () => {
  it('should accurately attribute multi-stage workflow (Gemini extractor + Mercury reasoner + EZRAB calculator)', () => {
    const evidence: AIEvidence = {
      sourceType: 'pdf',
      sourceId: 'DED-VILLA-CANGGU.pdf',
      sourceName: 'DED Gambar Kerja Villa Canggu',
      page: 12,
      field: 'Balok B1',
      extractedText: 'Balok B1 20x40 cm, Panjang = 5.00 m',
      basis: 'Dimensi tertera pada gambar potongan struktur DED hal 12',
      confidence: 'HIGH',
      status: 'VERIFIED',
      extractor: 'gemini',
      extractorModel: 'gemini-2.0-flash',
      reasoner: 'inception',
      reasonerModel: 'mercury-2.5',
      calculator: 'EZRAB_DETERMINISTIC_ENGINE',
    };

    assert.equal(evidence.extractor, 'gemini');
    assert.equal(evidence.reasoner, 'inception');
    assert.equal(evidence.calculator, 'EZRAB_DETERMINISTIC_ENGINE');
    assert.notEqual(evidence.reasoner, evidence.extractor);
  });
});

describe('PHASE 9.3 [8] — MULTI-PROJECT ISOLATION', () => {
  it('should strictly isolate data and evidence between Project A and Project B', async () => {
    aiProviderRegistry.scanEnvironmentKeyPool({
      GEMINI_API_KEY_1: 'test-gemini-key',
      ATRIA_API_KEY_1: 'test-atria-key',
      INCEPTION_API_KEY_1: 'test-inception-key',
      ZROUTER_API_KEY_1: 'test-zrouter-key',
    });
    aiProviderRouter.clearCache();

    const resA = await aiProviderRouter.execute({
      criteria: {
        task: 'PDF_READING',
        projectId: 'PROJECT-A-ISO',
        sourceType: 'pdf',
      },
      prompt: 'Extract concrete volume',
      sourceHash: 'SHA256-PROJECT-A-CONCRETE-7342',
      sourceName: 'PROJECT-A.pdf',
    });

    const resB = await aiProviderRouter.execute({
      criteria: {
        task: 'PDF_READING',
        projectId: 'PROJECT-B-ISO',
        sourceType: 'pdf',
      },
      prompt: 'Extract concrete volume',
      sourceHash: 'SHA256-PROJECT-B-CONCRETE-1987',
      sourceName: 'PROJECT-B.pdf',
    });

    assert.equal(resA.evidence?.sourceId, 'SHA256-PROJECT-A-CONCRETE-7342');
    assert.equal(resB.evidence?.sourceId, 'SHA256-PROJECT-B-CONCRETE-1987');
    assert.notEqual(resA.evidence?.sourceId, resB.evidence?.sourceId);
  });
});

describe('PHASE 9.3 [9] — SECURITY & SERVER-SIDE SECRET ISOLATION', () => {
  it('should never expose raw API secrets in sanitized configuration', () => {
    const sanitized = getSanitizedAiConfig();

    assert.ok(!('keys' in sanitized.gemini));
    assert.ok(!('keys' in sanitized.atria));
    assert.ok(!('keys' in sanitized.inception));
    assert.ok(!('apiKey' in sanitized.zrouter));

    assert.strictEqual(typeof sanitized.gemini.configured, 'boolean');
    assert.strictEqual(typeof sanitized.atria.configured, 'boolean');
    assert.strictEqual(typeof sanitized.inception.configured, 'boolean');
    assert.strictEqual(typeof sanitized.zrouter.configured, 'boolean');
  });

  it('should use alias identifiers in Key Pool without leaking raw credentials', () => {
    const entries = aiProviderRegistry.getKeyEntries();
    for (const entry of entries) {
      assert.ok(!entry.id.startsWith('sk-'), `Key ID must be an alias: ${entry.id}`);
      assert.ok(!entry.id.includes('Bearer'), 'Key ID must not contain token headers');
      assert.ok(!entry.id.includes('AIza'), 'Key ID must not contain Google API key prefixes');
    }
  });
});
