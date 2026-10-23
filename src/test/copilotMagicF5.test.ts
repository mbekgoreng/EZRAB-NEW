/**
 * KLASTER F5 — Copilot/Magic AI honesty & resilience regressions.
 * Run: npx vitest run src/test/copilotMagicF5.test.ts
 *
 * Covers:
 * 4.1 router evidence is no longer stamped VERIFIED/HIGH by default.
 * 4.2 copilot Kurva S answers never fabricate 0%/placeholder progress.
 * 4.3 router browser path: timeout, structured error mapping, EMPTY_RESPONSE.
 * 4.4 ded-rab-v3 client: retry only network/timeout/429/5xx; no raw body leak;
 *     success-flag + empty checks on HTTP 200.
 * 4.5 pipeline pricing-stage failure becomes a result-level warning.
 * 4.6 modal AI items: missing volume is null + gated; null price needs an
 *     explicit confirmation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  aiProviderRouter,
  mapRouterGatewayError,
  isEmptyProviderContent,
} from '../services/aiProviderRouter';
import {
  defaultAiProvider,
  resolveCurveSProgress,
} from '../services/aiProviderEngine';
import { buildFullAIContext } from '../services/aiContextService';
import {
  aiProviderClient,
  AiProviderClientError,
  shouldRetryAiError,
  mapAiGatewayError,
} from '../ded-rab-v3/ai/aiProviderClient';
import { aiEstimatePipeline } from '../ai-estimate/aiEstimatePipeline';
import {
  mapAiGeneratedItems,
  missingVolumeIndexes,
} from '../components/magic-ai/RabGeneratorModal';
import {
  mapAiGeneratedItem,
  aiItemSaveGate,
} from '../components/estimator/SmartAddWorkItemModal';

const originalFetch = globalThis.fetch;

function stubBrowserFetch(handler: (url: any, init: any) => Promise<Response>) {
  vi.stubGlobal('window', {});
  vi.stubGlobal('fetch', vi.fn(handler));
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ============================================================================
// 4.3 — router error mapping (pure)
// ============================================================================

describe('F5 4.3 — mapRouterGatewayError', () => {
  it('401 / AUTH_REQUIRED → AUTH_REQUIRED with an actionable message (no "login" instruction)', () => {
    const m = mapRouterGatewayError({ status: 401 });
    expect(m.code).toBe('AUTH_REQUIRED');
    expect(m.message).toContain('kode akses');
    expect(m.message.toLowerCase()).not.toContain('login');
    expect(mapRouterGatewayError({ status: 200, serverErrorCode: 'AUTH_REQUIRED' }).code).toBe('AUTH_REQUIRED');
  });

  it('429 → RATE_LIMITED (retryable); 403 → ACCESS_DENIED; 5xx → SERVICE_UNAVAILABLE', () => {
    expect(mapRouterGatewayError({ status: 429 }).code).toBe('RATE_LIMITED');
    expect(mapRouterGatewayError({ status: 429 }).retryable).toBe(true);
    expect(mapRouterGatewayError({ status: 403 }).code).toBe('ACCESS_DENIED');
    expect(mapRouterGatewayError({ status: 503 }).code).toBe('SERVICE_UNAVAILABLE');
    expect(mapRouterGatewayError({ status: 503 }).retryable).toBe(true);
  });

  it('timeout → TIMEOUT; network failure → NETWORK_ERROR; demo → DEMO_RESTRICTED', () => {
    expect(mapRouterGatewayError({ timedOut: true }).code).toBe('TIMEOUT');
    expect(mapRouterGatewayError({ networkFailed: true }).code).toBe('NETWORK_ERROR');
    expect(mapRouterGatewayError({ status: 403, serverErrorCode: 'DEMO_RESTRICTED' }).code).toBe('DEMO_RESTRICTED');
  });

  it('isEmptyProviderContent: blank content without structured data is empty', () => {
    expect(isEmptyProviderContent('')).toBe(true);
    expect(isEmptyProviderContent('   ')).toBe(true);
    expect(isEmptyProviderContent(undefined, null)).toBe(true);
    expect(isEmptyProviderContent('jawaban')).toBe(false);
    expect(isEmptyProviderContent('', { rows: [] })).toBe(false);
  });
});

// ============================================================================
// 4.1 + 4.3 — router browser path (integration, mocked fetch)
// ============================================================================

describe('F5 4.1/4.3 — aiProviderRouter browser path', () => {
  const criteria = { task: 'PROJECT_QA' } as any;

  it('successful response carries HONEST evidence (INFERRED/LOW, no verification claim)', async () => {
    stubBrowserFetch(async () =>
      new Response(
        JSON.stringify({
          success: true,
          content: 'Halo dari provider',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        }),
        { status: 200 }
      )
    );
    const res = await aiProviderRouter.execute({ criteria, prompt: 'halo' });
    expect(res.success).toBe(true);
    expect(res.evidence?.status).toBe('INFERRED');
    expect(res.evidence?.confidence).toBe('LOW');
    expect(res.evidence?.basis || '').not.toContain('Diverifikasi');
  });

  it('server-supplied evidence still wins field-by-field over the honest default', async () => {
    stubBrowserFetch(async () =>
      new Response(
        JSON.stringify({
          success: true,
          content: 'teks terbaca',
          evidence: { status: 'VERIFIED', confidence: 'HIGH', basis: 'Diverifikasi server via OCR ganda' },
        }),
        { status: 200 }
      )
    );
    const res = await aiProviderRouter.execute({ criteria, prompt: 'baca' });
    expect(res.success).toBe(true);
    expect(res.evidence?.status).toBe('VERIFIED');
    expect(res.evidence?.confidence).toBe('HIGH');
  });

  it('401 → structured AUTH_REQUIRED, safe message, no raw payload text', async () => {
    stubBrowserFetch(async () =>
      new Response(JSON.stringify({ success: false, error: 'AUTH_REQUIRED', detail: 'raw internals xyz' }), { status: 401 })
    );
    const res = await aiProviderRouter.execute({ criteria, prompt: 'halo' });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('AUTH_REQUIRED');
    expect(res.error || '').toContain('kode akses');
    expect(res.error || '').not.toContain('raw internals');
    expect(res.content).not.toContain('HTTP_401');
  });

  it('200 success with blank content → EMPTY_RESPONSE failure', async () => {
    stubBrowserFetch(async () =>
      new Response(JSON.stringify({ success: true, content: '   ' }), { status: 200 })
    );
    const res = await aiProviderRouter.execute({ criteria, prompt: 'halo' });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMPTY_RESPONSE');
  });

  it('hanging gateway → TIMEOUT via AbortController (request.timeoutMs)', async () => {
    stubBrowserFetch(async (_url: any, init: any) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted', 'AbortError'))
        );
      }) as Promise<Response>
    );
    const res = await aiProviderRouter.execute({ criteria, prompt: 'halo', timeoutMs: 30 });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('TIMEOUT');
  }, 15000);

  it('network failure → NETWORK_ERROR', async () => {
    stubBrowserFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const res = await aiProviderRouter.execute({ criteria, prompt: 'halo' });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('NETWORK_ERROR');
  });
});

// ============================================================================
// 4.2 — copilot Kurva S honesty
// ============================================================================

describe('F5 4.2 — resolveCurveSProgress', () => {
  it('context built WITHOUT kurva data: placeholder 45.5/42.6 is NOT trusted', () => {
    const ctx = buildFullAIContext({ id: 'p1', name: 'Proyek A' } as any, []);
    const avail = resolveCurveSProgress(ctx);
    expect(avail.hasAny).toBe(false);
    expect(avail.actual).toBeNull();
    expect(avail.planned).toBeNull();
    expect(avail.deviation).toBeNull();
  });

  it('project.progress alone → actual-only availability (no planned, no deviation)', () => {
    const ctx = buildFullAIContext({ id: 'p1', name: 'Proyek B', progress: 42.5 } as any, []);
    const avail = resolveCurveSProgress(ctx);
    expect(avail.hasActual).toBe(true);
    expect(avail.actual).toBe(42.5);
    expect(avail.hasPlanned).toBe(false);
    expect(avail.deviation).toBeNull();
  });

  it('real Kurva S series → both sides + deviation from data', () => {
    const points = [
      {
        weekIndex: 1,
        weekLabel: 'Minggu 1',
        startDate: '2026-01-05',
        endDate: '2026-01-11',
        plannedWeeklyPercent: 50,
        cumulativePlannedPercent: 50,
        plannedWeeklyCost: 1000,
        cumulativePlannedCost: 1000,
        actualProgressPercent: 48,
      },
    ] as any;
    const ctx = buildFullAIContext({ id: 'p1', name: 'Proyek C' } as any, [], [], points);
    const avail = resolveCurveSProgress(ctx);
    expect(avail.hasBoth).toBe(true);
    expect(avail.planned).toBe(50);
    expect(avail.actual).toBe(48);
    expect(avail.deviation).toBe(-2);
    expect(avail.statusLabel).toContain('Terlambat');
  });
});

describe('F5 4.2 — copilot answers', () => {
  it('no data → explicit no-data answer, NO fabricated percentage/verdict', async () => {
    const ctx = buildFullAIContext({ id: 'p1', name: 'Proyek A' } as any, []);
    const res = await defaultAiProvider.chat('Berapa progress sekarang?', ctx);
    expect(res.badge).toBe('KURVA S');
    expect(res.content).toContain('Data Belum Tersedia');
    expect(res.content).not.toContain('Sesuai/Lebih Cepat dari Rencana');
    expect(res.content).not.toContain('tercatat sebesar **0%**');
    expect(res.content).not.toContain('45.5%');
    expect(res.content).not.toContain('42.6%');
    expect(res.stats).toBeUndefined();
  }, 15000);

  it('partial (actual only) → shows actual, states deviation cannot be computed', async () => {
    const ctx = buildFullAIContext({ id: 'p1', name: 'Proyek B', progress: 42.5 } as any, []);
    const res = await defaultAiProvider.chat('Berapa progress sekarang?', ctx);
    expect(res.content).toContain('42.5%');
    expect(res.content).toContain('belum dapat dihitung');
    expect(res.content).not.toContain('Deviasi');
  }, 15000);

  it('full data → real numbers and a behind-schedule verdict from data', async () => {
    const points = [
      {
        weekIndex: 1,
        weekLabel: 'Minggu 1',
        startDate: '2026-01-05',
        endDate: '2026-01-11',
        plannedWeeklyPercent: 50,
        cumulativePlannedPercent: 50,
        plannedWeeklyCost: 1000,
        cumulativePlannedCost: 1000,
        actualProgressPercent: 48,
      },
    ] as any;
    const ctx = buildFullAIContext({ id: 'p1', name: 'Proyek C' } as any, [], [], points);
    const res = await defaultAiProvider.chat('Apakah proyek terlambat?', ctx);
    expect(res.badge).toBe('KURVA S');
    expect(res.content).toContain('48%');
    expect(res.content).toContain('50%');
    expect(res.content).toContain('-2%');
  }, 15000);
});

// ============================================================================
// 4.4 — ded-rab-v3 client retry policy + safe errors
// ============================================================================

describe('F5 4.4 — shouldRetryAiError (pure policy)', () => {
  it('retries only network/timeout/429/5xx; never 401/403/malformed', () => {
    expect(shouldRetryAiError(new AiProviderClientError('RATE_LIMITED', 'x', { retryable: true }))).toBe(true);
    expect(shouldRetryAiError(new AiProviderClientError('AUTH_REQUIRED', 'x'))).toBe(false);
    expect(shouldRetryAiError(new AiProviderClientError('MALFORMED_JSON', 'x'))).toBe(false);
    expect(shouldRetryAiError(new TypeError('fetch failed'))).toBe(true);
    expect(shouldRetryAiError(new Error('HTTP 401: unauthorized'))).toBe(false);
    expect(shouldRetryAiError(new Error('Failed to parse AI JSON response'))).toBe(false);
    expect(shouldRetryAiError(new Error('503 Service Unavailable'))).toBe(true);
    expect(mapAiGatewayError(401).code).toBe('AUTH_REQUIRED');
    expect(mapAiGatewayError(429).retryable).toBe(true);
  });
});

describe('F5 4.4 — aiProviderClient browser path', () => {
  it('401 fails fast: exactly 1 fetch, coded AUTH_REQUIRED', async () => {
    const fetchMock = stubBrowserFetch(async () =>
      new Response(JSON.stringify({ error: 'AUTH_REQUIRED' }), { status: 401 })
    );
    await expect(aiProviderClient.executeChat({ prompt: 'analisis' })).rejects.toMatchObject({
      name: 'AiProviderClientError',
      code: 'AUTH_REQUIRED',
    });
    expect(fetchMock.mock.calls.length).toBe(1);
  }, 15000);

  it('429 twice then success: retried (3 fetches) and resolves', async () => {
    let calls = 0;
    const fetchMock = stubBrowserFetch(async () => {
      calls++;
      if (calls < 3) return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 });
      return new Response(JSON.stringify({ success: true, content: 'hasil analisis' }), { status: 200 });
    });
    const res = await aiProviderClient.executeChat({ prompt: 'analisis' });
    expect(res.content).toBe('hasil analisis');
    expect(fetchMock.mock.calls.length).toBe(3);
  }, 20000);

  it('500 with a raw internal body: message is mapped, raw body NEVER leaks, retried to 3 attempts', async () => {
    const fetchMock = stubBrowserFetch(async () =>
      new Response('SERVER STACK TRACE SECRET-XYZ', { status: 500 })
    );
    const err = await aiProviderClient.executeChat({ prompt: 'analisis' }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderClientError);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(String(err.message)).not.toContain('SECRET-XYZ');
    expect(fetchMock.mock.calls.length).toBe(3);
  }, 20000);

  it('200 with success:false payload (AUTH_REQUIRED) → coded failure, no retry', async () => {
    const fetchMock = stubBrowserFetch(async () =>
      new Response(JSON.stringify({ success: false, errorCode: 'AUTH_REQUIRED', content: '' }), { status: 200 })
    );
    await expect(aiProviderClient.executeChat({ prompt: 'analisis' })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(fetchMock.mock.calls.length).toBe(1);
  }, 15000);

  it('200 with empty content → EMPTY_RESPONSE failure, no retry', async () => {
    const fetchMock = stubBrowserFetch(async () =>
      new Response(JSON.stringify({ success: true, content: '  ' }), { status: 200 })
    );
    await expect(aiProviderClient.executeChat({ prompt: 'analisis' })).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
    });
    expect(fetchMock.mock.calls.length).toBe(1);
  }, 15000);

  it('200 with non-JSON body → MALFORMED_JSON, no retry', async () => {
    const fetchMock = stubBrowserFetch(async () =>
      new Response('this is not json', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    );
    await expect(aiProviderClient.executeChat({ prompt: 'analisis' })).rejects.toMatchObject({
      code: 'MALFORMED_JSON',
    });
    expect(fetchMock.mock.calls.length).toBe(1);
  }, 15000);
});

// ============================================================================
// 4.5 — pipeline pricing-stage failure warning
// ============================================================================

describe('F5 4.5 — aiEstimatePipeline pricing stage', () => {
  const makeItems = () => [
    {
      workName: 'Pondasi Batu Kali',
      category: 'Pondasi',
      unit: 'm3',
      quantity: 10,
      specification: '',
      description: '',
      confidence: 'MEDIUM',
      assumptions: [],
      estimatedUnitPrice: null,
      unitPrice: null,
      status: 'VALID',
    } as any,
  ];
  const synthesis = { buildingType: 'Rumah Tinggal', totalFloorAreaM2: 100 } as any;
  const runStage = (items: any[]) =>
    (aiEstimatePipeline as any).estimatePricesWithAI(items, synthesis, 'Jakarta', 'quick');

  it('total call failure → PRICE_STAGE_FAILED warning carrying the coded cause; items stay null-priced', async () => {
    vi.spyOn(aiProviderClient, 'executeChat').mockRejectedValue(
      new AiProviderClientError('AUTH_REQUIRED', 'Akses AI ditolak oleh gerbang server.')
    );
    const items = makeItems();
    const warning = await runStage(items);
    expect(warning).not.toBeNull();
    expect(warning.type).toBe('PRICE_STAGE_FAILED');
    expect(warning.level).toBe('CRITICAL');
    expect(warning.message).toContain('AUTH_REQUIRED');
    expect(warning.message).toContain('PRICE_UNRESOLVED');
    expect(items[0].unitPrice).toBeNull();
    expect(items[0].priceStatus).toBe('PRICE_UNRESOLVED');
  });

  it('successful pricing → no warning, item priced as AI_ESTIMATE', async () => {
    vi.spyOn(aiProviderClient, 'executeChat').mockResolvedValue({
      content: '[{"idx":0,"estimatedUnitPrice":950000,"confidence":"HIGH","reasoning":"wajar"}]',
    } as any);
    const items = makeItems();
    const warning = await runStage(items);
    expect(warning).toBeNull();
    expect(items[0].unitPrice).toBe(950000);
    expect(items[0].priceStatus).toBe('PRICE_ESTIMATED');
  });

  it('array with all-null prices is a legitimate judgement → NO stage warning', async () => {
    vi.spyOn(aiProviderClient, 'executeChat').mockResolvedValue({
      content: '[{"idx":0,"estimatedUnitPrice":null}]',
    } as any);
    const items = makeItems();
    const warning = await runStage(items);
    expect(warning).toBeNull();
    expect(items[0].unitPrice).toBeNull();
    expect(items[0].priceStatus).toBe('PRICE_UNRESOLVED');
  });

  it('non-JSON answer → PRICE_RESPONSE_INVALID stage warning', async () => {
    vi.spyOn(aiProviderClient, 'executeChat').mockResolvedValue({
      content: 'Maaf, saya tidak dapat memperkirakan harga saat ini.',
    } as any);
    const items = makeItems();
    const warning = await runStage(items);
    expect(warning).not.toBeNull();
    expect(warning.type).toBe('PRICE_STAGE_FAILED');
    expect(warning.message).toContain('PRICE_RESPONSE_INVALID');
  });
});

// ============================================================================
// 4.6 — modal AI item mapping + save gates
// ============================================================================

describe('F5 4.6 — RabGeneratorModal mapping & gate', () => {
  it('missing/string/zero volume → null (never silently 1); valid volume kept', () => {
    const items = mapAiGeneratedItems([
      { description: 'A', volume: 12.5, unit: 'm2', unitPrice: 1000 },
      { description: 'B', unit: 'm3', unitPrice: 2000 },
      { description: 'C', volume: '30', unit: 'm2', unitPrice: 3000 },
      { description: 'D', volume: 0, unit: 'ls', unitPrice: null },
    ]);
    expect(items[0].volume).toBe(12.5);
    expect(items[1].volume).toBeNull();
    expect(items[2].volume).toBeNull();
    expect(items[3].volume).toBeNull();
    expect(items[3].unitPrice).toBeNull();
    expect(missingVolumeIndexes(items)).toEqual([1, 2, 3]);
    expect(mapAiGeneratedItems('bukan array')).toEqual([]);
  });
});

describe('F5 4.6 — SmartAdd AI item mapping & save gate', () => {
  const opts = { fallbackDescription: 'fallback', category: 'Struktur', code: 'AI.01' };

  it('missing volume → null and gate blocks with VOLUME_MISSING', () => {
    const item = mapAiGeneratedItem({ description: 'Kolom', unitPrice: 5000 }, opts);
    expect(item.volume).toBeNull();
    const gate = aiItemSaveGate(item, true);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('VOLUME_MISSING');
  });

  it('null price requires the explicit confirmation (labelled Perlu Verifikasi)', () => {
    const item = mapAiGeneratedItem({ description: 'Kolom', volume: 3, unitPrice: null }, opts);
    const blocked = aiItemSaveGate(item, false);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe('PRICE_NEEDS_CONFIRMATION');
      expect(blocked.message).toContain('Perlu Verifikasi');
    }
    expect(aiItemSaveGate(item, true).ok).toBe(true);
  });

  it('complete item passes the gate without confirmation', () => {
    const item = mapAiGeneratedItem({ description: 'Kolom', volume: 3, unitPrice: 5000 }, opts);
    expect(item.volume).toBe(3);
    expect(item.unitPrice).toBe(5000);
    expect(aiItemSaveGate(item, false).ok).toBe(true);
  });
});
