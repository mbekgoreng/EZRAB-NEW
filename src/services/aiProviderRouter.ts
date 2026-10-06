/**
 * EZRAB Multi-Provider AI Execution Router & Orchestrator (Phase 9.3)
 *
 * Coordinates multi-provider execution, SHA-256 caching, key rotation with cooldown,
 * capability-checked failover, extractor vs reasoner separation, and evidence attribution.
 */

import {
  ModelSelectionCriteria,
  SelectedModelRoute,
  MultiProviderExecutionEvidence,
  AIExecutionUsage,
  ProviderHealthStatus,
  ProviderId,
  AICapability,
} from './aiProviderTypes';
import { aiCostRouter } from './aiCostRouter';
import { aiProviderRegistry } from './aiProviderRegistry';
import { maskAiModelName, maskAiProviderName, sanitizeEvidenceBasis } from './aiModelMasking';

export interface AIExecutionRequest {
  criteria: ModelSelectionCriteria;
  prompt: string;
  systemPrompt?: string;
  sourceHash?: string; // SHA-256 hash of document or image content
  sourceName?: string;
  sourceType?: string;
  imageDataBase64?: string;
  pdfDataBase64?: string;
  structuredContext?: Record<string, any>;
  bypassCache?: boolean;
  maxRetries?: number;
}

export interface AIExecutionResponse {
  success: boolean;
  content: string;
  structuredData?: any;
  route: SelectedModelRoute;
  usage: AIExecutionUsage;
  evidence?: MultiProviderExecutionEvidence;
  cached: boolean;
  error?: string;
  fallbackCount?: number;
  retriesAttempted?: number;
}

export class AIProviderRouter {
  private static instance: AIProviderRouter;

  // Cache: source:{hash}:{task}:{provider}:{model}
  private executionCache: Map<string, { result: any; timestamp: number }> = new Map();
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {}

  public static getInstance(): AIProviderRouter {
    if (!AIProviderRouter.instance) {
      AIProviderRouter.instance = new AIProviderRouter();
    }
    return AIProviderRouter.instance;
  }

  private buildCacheKey(request: AIExecutionRequest, route: SelectedModelRoute): string {
    const hash = request.sourceHash || 'nohash';
    return `source:${hash}:${request.criteria.task}:${route.providerId}:${route.modelId}`;
  }

  /**
   * In the browser, scanEnvironmentKeyPool() sees no env vars, so every client key
   * slot starts DISABLED and routing would fail with AI_NO_SUITABLE_MODEL even though
   * the SERVER gateway holds real keys. This asks the gateway (aliases + counts only,
   * never secrets) which providers have active keys and enables matching client slots
   * so cheap-first routing reflects what the server can actually execute.
   * Node/test environments already have env-visible keys — hydration is skipped there.
   */
  private serverPoolHydratedAt = 0;
  private static readonly SERVER_POOL_TTL_MS = 5 * 60 * 1000;

  private async ensureServerKeyPoolHydrated(): Promise<void> {
    if (typeof window === 'undefined') return; // Node/tests: env-based pool is authoritative
    if (Date.now() - this.serverPoolHydratedAt < AIProviderRouter.SERVER_POOL_TTL_MS) return;
    try {
      const res = await fetch('/api/ai/multi-provider/providers');
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
      if (!payload?.providers) return;
      this.serverPoolHydratedAt = Date.now();
      for (const p of payload.providers as Array<{ providerId: string; activeKeyCount?: number }>) {
        aiProviderRegistry.enableServerConfiguredSlots(p.providerId, p.activeKeyCount || 0);
      }
    } catch {
      // Gateway unreachable — routing will surface a clear provider error downstream.
    }
  }

  /**
   * Main entry point to execute an AI task with automatic cost optimization,
   * safe key rotation, capability-checked failover, and evidence provenance.
   */
  public async execute(request: AIExecutionRequest): Promise<AIExecutionResponse> {
    const startMs = Date.now();
    const maxRetries = request.maxRetries !== undefined ? request.maxRetries : 2;

    // In browser runtime, NEVER select raw providers/models or expose routing details.
    // Forward capability request to the server-side AI abstraction gateway directly.
    if (typeof window !== 'undefined') {
      try {
        const mode: 'quick' | 'advanced' | 'vision' =
          request.imageDataBase64 ||
          request.pdfDataBase64 ||
          (request.criteria?.task && /denah|nota|pdf|ded|vision|image/i.test(request.criteria.task))
            ? 'vision'
            : request.criteria?.qualityRequirement === 'PREMIUM' ||
              request.criteria?.qualityRequirement === 'FRONTIER' ||
              (request.criteria?.task && /complex|rab/i.test(request.criteria.task))
            ? 'advanced'
            : 'quick';

        const jsonMode = [
          'BACA_DENAH',
          'DRAWING_ANALYSIS',
          'BACA_NOTA',
          'RECEIPT_READING',
          'BACA_PDF_DED',
          'PDF_READING',
          'DED_READING',
        ].includes(request.criteria?.task);

        const response = await fetch('/api/ai/multi-provider/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode,
            prompt: request.prompt,
            systemPrompt: request.systemPrompt,
            imageDataBase64: request.imageDataBase64,
            pdfDataBase64: request.pdfDataBase64,
            jsonMode,
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!payload?.success) {
          throw new Error(payload?.error || `HTTP_${response.status}`);
        }

        const assistant =
          payload.assistant ||
          (mode === 'vision' ? 'EZRAB Vision' : mode === 'advanced' ? 'EZRAB AI Pro' : 'EZRAB AI 1.3');

        const maskedRoute: SelectedModelRoute = {
          providerId: 'EZRAB Cloud Engine',
          modelId: assistant,
          qualityTier: mode === 'advanced' ? 'PREMIUM' : 'CHEAP',
          keyAlias: 'ezrab-neural-key',
          capabilities: mode === 'vision' ? ['VISION', 'PDF'] : ['TEXT'],
          costEstimate: {
            providerId: 'ezrab_core',
            modelId: assistant,
            qualityTier: 'CHEAP',
            estimatedInputTokens: payload.usage?.promptTokens || 0,
            estimatedOutputTokens: payload.usage?.completionTokens || 0,
            estimatedCostUsd: payload.usage?.actualCostUsd || 0,
            isUnknown: false,
          },
          reason: `Diproses secara optimal via ${assistant}`,
          capabilityMatch: true,
          escalated: false,
        };

        const evidence: MultiProviderExecutionEvidence = {
          sourceId: request.sourceHash || 'SOURCE-STREAM',
          sourceName: request.sourceName || 'Project Source',
          sourceType: (request.sourceType as any) || 'text',
          status: 'VERIFIED',
          confidence: 'HIGH',
          extractorProvider: 'EZRAB Cloud Engine',
          extractorModel: assistant,
          calculatorEngine: 'EZRAB_DETERMINISTIC_ENGINE',
          basis: `Diverifikasi melalui EZRAB Cloud Engine (${assistant})`,
          ...payload.evidence,
        };

        return {
          success: true,
          content: payload.content,
          structuredData: payload.structuredData,
          route: maskedRoute,
          usage: payload.usage || {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            actualCostUsd: 0,
            durationMs: Date.now() - startMs,
          },
          evidence,
          cached: false,
          fallbackCount: 0,
          retriesAttempted: 0,
        };
      } catch (err: any) {
        return {
          success: false,
          content: `Gagal memproses permintaan AI: ${err.message || 'Layanan tidak tersedia'}.`,
          route: {
            providerId: 'EZRAB Cloud Engine',
            modelId: 'EZRAB AI Pro',
            qualityTier: 'CHEAP',
            keyAlias: 'ezrab-neural-key',
            capabilities: ['TEXT'],
            costEstimate: {
              providerId: 'ezrab_core',
              modelId: 'EZRAB AI Pro',
              qualityTier: 'CHEAP',
              estimatedInputTokens: 0,
              estimatedOutputTokens: 0,
              estimatedCostUsd: 0,
              isUnknown: false,
            },
            reason: 'Layanan fallback',
            capabilityMatch: true,
            escalated: false,
          },
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            actualCostUsd: 0,
            durationMs: Date.now() - startMs,
          },
          cached: false,
          error: err.message || 'EXECUTION_FAILED',
          fallbackCount: 0,
          retriesAttempted: 0,
        };
      }
    }

    // 0. Hydrate client key slots from the server key pool (Node/tests only).
    await this.ensureServerKeyPoolHydrated();

    // 1. Select the cheapest suitable model
    let route = aiCostRouter.selectBestModel(request.criteria);

    // 2. Check Cache
    if (!request.bypassCache && request.sourceHash) {
      const cacheKey = this.buildCacheKey(request, route);
      const cachedEntry = this.executionCache.get(cacheKey);
      if (cachedEntry && Date.now() - cachedEntry.timestamp < this.cacheTtlMs) {
        return {
          success: true,
          content: cachedEntry.result.content,
          structuredData: cachedEntry.result.structuredData,
          route,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            actualCostUsd: 0.0,
            durationMs: Date.now() - startMs,
          },
          evidence: cachedEntry.result.evidence,
          cached: true,
          retriesAttempted: 0,
        };
      }
    }

    // 3. Execution with Compatibility Failover & Key Rotation
    let attempts = 0;
    const maxAttempts = maxRetries + 1;
    let lastError: any = null;
    let fallbackCount = 0;

    const excludedKeys = new Set<string>();
    const excludedProviders = new Set<ProviderId>();

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const executionResult = await this.dispatchToProvider(route, request);

        // Record key & model success
        aiProviderRegistry.recordKeySuccess(route.keyAlias);
        aiProviderRegistry.recordKeyUsage(route.keyAlias, executionResult.usage.actualCostUsd);
        aiCostRouter.recordUsage(executionResult.usage.actualCostUsd, request.criteria.projectId);

        // Multi-Provider Attribution with Proprietary Masking (Hide 3rd-party vendor details)
        const maskedModel = maskAiModelName(route.modelId);
        const maskedProvider = maskAiProviderName(route.providerId);
        const evidence: MultiProviderExecutionEvidence = {
          sourceId: request.sourceHash || 'SOURCE-STREAM',
          sourceName: request.sourceName || 'Project Source',
          sourceType: request.sourceType || 'text',
          status: 'VERIFIED',
          confidence: 'HIGH',
          extractorProvider: maskedProvider,
          extractorModel: maskedModel,
          calculatorEngine: 'EZRAB_DETERMINISTIC_ENGINE',
          basis: sanitizeEvidenceBasis(executionResult.evidence?.basis, route.modelId),
          ...executionResult.evidence,
        };

        const maskedRoute: SelectedModelRoute = {
          ...route,
          providerId: maskedProvider,
          modelId: maskedModel,
          keyAlias: 'ezrab-neural-key',
          reason: `Diproses secara optimal via ${maskedModel}`,
        };

        const finalResponse: AIExecutionResponse = {
          success: true,
          content: executionResult.content,
          structuredData: executionResult.structuredData,
          route: maskedRoute,
          usage: executionResult.usage,
          evidence,
          cached: false,
          fallbackCount,
          retriesAttempted: attempts - 1,
        };

        // Cache successful response
        if (request.sourceHash) {
          const cacheKey = this.buildCacheKey(request, route);
          this.executionCache.set(cacheKey, {
            result: finalResponse,
            timestamp: Date.now(),
          });
        }

        return finalResponse;
      } catch (err: any) {
        lastError = err;
        fallbackCount++;
        const errMsg = err.message || '';
        console.warn(`[AIProviderRouter] Provider ${route.providerId} (${route.modelId}, Key: ${route.keyAlias}) failed: ${errMsg}`);

        let healthStatus: ProviderHealthStatus = 'SERVER_ERROR';
        if (errMsg.includes('429') || errMsg.includes('RATE_LIMITED') || errMsg.includes('rate limit')) {
          healthStatus = 'RATE_LIMITED';
        } else if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('AUTH_ERROR')) {
          healthStatus = 'AUTH_ERROR';
        } else if (errMsg.includes('TIMEOUT') || errMsg.includes('timeout')) {
          healthStatus = 'TIMEOUT';
        }

        aiProviderRegistry.recordKeyFailure(route.keyAlias, healthStatus);
        excludedKeys.add(route.keyAlias);

        // Check if other keys are available for this provider
        const nextKey = aiProviderRegistry.selectAvailableKey(route.providerId, route.costEstimate.estimatedCostUsd);
        if (nextKey && !excludedKeys.has(nextKey.id)) {
          route = {
            ...route,
            keyAlias: nextKey.id,
            reason: `Rotated to key ${nextKey.id} after failure on previous key`,
          };
          continue;
        }

        // All keys for this provider exhausted -> exclude provider and failover to next compatible provider
        excludedProviders.add(route.providerId);

        try {
          const alternativeCriteria: ModelSelectionCriteria = {
            ...request.criteria,
            forceProviderId: undefined, // Clear forced provider to allow compatible failover
          };

          // Find candidate that is NOT in excludedProviders
          const allProviders = aiProviderRegistry.getAllProviders().filter((p) => !excludedProviders.has(p.id) && p.enabled);
          if (allProviders.length === 0) {
            break;
          }

          route = aiCostRouter.selectBestModel(alternativeCriteria);
        } catch (failoverErr) {
          // No more compatible providers available
          break;
        }
      }
    }

    const maskedErrorRoute: SelectedModelRoute = {
      ...route,
      providerId: maskAiProviderName(route.providerId),
      modelId: maskAiModelName(route.modelId),
      keyAlias: 'ezrab-neural-key',
    };

    return {
      success: false,
      content: `Gagal memproses permintaan AI: ${lastError?.message || 'Layanan tidak tersedia'}.`,
      route: maskedErrorRoute,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        actualCostUsd: 0.0,
        durationMs: Date.now() - startMs,
      },
      cached: false,
      error: lastError?.message || 'EXECUTION_FAILED',
      fallbackCount,
      retriesAttempted: attempts - 1,
    };
  }

  /**
   * Dispatches request to the REAL provider via the server-side multi-provider
   * gateway (/api/ai/multi-provider/execute). API keys NEVER touch the browser —
   * the server resolves key aliases to secrets internally.
   */
  private async dispatchToProvider(
    route: SelectedModelRoute,
    request: AIExecutionRequest
  ): Promise<{ content: string; structuredData?: any; usage: AIExecutionUsage; evidence?: Partial<MultiProviderExecutionEvidence> }> {
    const start = Date.now();

    // STRICT CAPABILITY VALIDATION (client-side pre-check, enforced again server-side):
    // Never allow raw image/PDF to Atria, Mercury or zrouter text models without VISION.
    if (request.imageDataBase64 && !route.capabilities.includes('VISION')) {
      throw new Error(`INCOMPATIBLE_PROVIDER: Model ${route.modelId} (${route.providerId}) does not support VISION/IMAGE inputs.`);
    }
    if (request.pdfDataBase64 && !route.capabilities.includes('PDF')) {
      throw new Error(`INCOMPATIBLE_PROVIDER: Model ${route.modelId} (${route.providerId}) does not support PDF inputs.`);
    }

    const jsonMode = [
      'BACA_DENAH',
      'DRAWING_ANALYSIS',
      'BACA_NOTA',
      'RECEIPT_READING',
      'BACA_PDF_DED',
      'PDF_READING',
      'DED_READING',
    ].includes(request.criteria.task);

    let response: Response | undefined;
    let payload: any = null;

    // In Node.js / test / server environments, execute adapters directly for speed & reliability
    if (typeof window === 'undefined') {
      try {
        const adapterMod = ['..', '..', 'server', 'providers', 'multiProvider', 'adapters'].join('/');
        const { chatGemini, chatOpenAiCompatible } = await import(/* @vite-ignore */ adapterMod);
        const reqPayload = {
          providerId: route.providerId,
          modelId: route.modelId,
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          imageDataBase64: request.imageDataBase64,
          pdfDataBase64: request.pdfDataBase64,
          jsonMode,
        };
        const res = route.providerId === 'gemini'
          ? await chatGemini(reqPayload)
          : await chatOpenAiCompatible(reqPayload);
        payload = { success: true, ...res };
      } catch (adapterErr: any) {
        throw adapterErr;
      }
    }

    if (!payload) {
      try {
        response = await fetch('/api/ai/multi-provider/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-workspace-id': 'ws-default',
            'x-user-role': 'ESTIMATOR',
            'x-user-id': 'usr-default',
          },
          body: JSON.stringify({
            providerId: route.providerId,
            modelId: route.modelId,
            prompt: request.prompt,
            systemPrompt: request.systemPrompt,
            imageDataBase64: request.imageDataBase64,
            pdfDataBase64: request.pdfDataBase64,
            jsonMode,
          }),
        });
        payload = await response.json().catch(() => null);
      } catch (netErr: any) {
        throw new Error(`AI_GATEWAY_ERROR: Tidak dapat terhubung ke server AI (${netErr.message || 'fetch failed'})`);
      }
    }

    if (!payload?.success) {
      const kind = payload?.error || `HTTP_${response?.status || '500'}`;
      throw new Error(`${kind}: ${String(payload?.message || payload?.error || 'Provider execution failed').slice(0, 300)}`);
    }

    // Compute actual cost from server-reported real token usage (never estimated-only)
    const model = aiProviderRegistry.getModel(route.providerId, route.modelId);
    const actualCost = model
      ? (payload.promptTokens / 1_000_000) * model.inputCostPerMillion +
        (payload.completionTokens / 1_000_000) * model.outputCostPerMillion
      : 0;

    const usage: AIExecutionUsage = {
      promptTokens: payload.promptTokens || 0,
      completionTokens: payload.completionTokens || 0,
      totalTokens: payload.totalTokens || 0,
      actualCostUsd: Number(actualCost.toFixed(6)),
      durationMs: payload.latencyMs || Date.now() - start,
    };

    return {
      content: payload.content,
      structuredData: payload.structuredData,
      usage,
      // Server tells us the real key alias it used (never the secret).
      evidence: { basis: `Executed via ${payload.providerId} (${payload.modelId}) [Key: ${payload.keyAlias}]` },
    };
  }

  /**
   * Clear cache for testing or manual re-analysis.
   */
  public clearCache(): void {
    this.executionCache.clear();
  }
}

export const aiProviderRouter = AIProviderRouter.getInstance();
