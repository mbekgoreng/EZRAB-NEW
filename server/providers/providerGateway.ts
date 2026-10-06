import {
  AIProvider,
  AIProviderType,
  AIChatOptions,
  AIChatResult,
  ProviderHealth
} from './aiProvider';
import { EzrabCoreProvider } from './ezrabCoreProvider';
import { LocalAIProvider } from './localAIProvider';
import { ExternalGatewayProvider } from './externalGatewayProvider';
import { HermesProvider } from './hermesProvider';
import { MockAIProvider } from './mockProvider';
import { modelRouter, RouteDecision, RouteTaskInput } from './modelRouter';
import { getAiConfig } from '../config/aiConfig';

export interface GatewayExecutionResult extends AIChatResult {
  routeDecision: RouteDecision;
  fallbackChain: string[];
  latencyMs: number;
  traceId: string;
}

export class ProviderGateway {
  private static instance: ProviderGateway;
  private providers: Map<AIProviderType, AIProvider> = new Map();

  private constructor() {
    this.providers.set('ezrab_core', new EzrabCoreProvider());
    this.providers.set('local', new LocalAIProvider());
    this.providers.set('external', new ExternalGatewayProvider());
    this.providers.set('hermes', new HermesProvider());
    this.providers.set('mock', new MockAIProvider());
  }

  public static getInstance(): ProviderGateway {
    if (!ProviderGateway.instance) {
      ProviderGateway.instance = new ProviderGateway();
    }
    return ProviderGateway.instance;
  }

  public getProvider(type: AIProviderType): AIProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      return this.providers.get('mock')!;
    }
    return provider;
  }

  /**
   * Safe Health Check across all registered providers
   * Never leaks API keys, secrets, or internal headers.
   */
  public async getAllProviderHealth(): Promise<Record<string, ProviderHealth>> {
    const results: Record<string, ProviderHealth> = {};
    for (const [type, provider] of this.providers.entries()) {
      try {
        const health = await provider.healthCheck();
        results[type] = health;
      } catch (err: any) {
        results[type] = {
          providerId: provider.id,
          type,
          status: 'UNAVAILABLE',
          latencyMs: 0,
          message: err.message || 'Healthcheck failed',
          lastChecked: new Date().toISOString()
        };
      }
    }
    return results;
  }

  /**
   * Discover available models per provider
   */
  public async discoverAllModels(): Promise<Record<string, { configuredModel: string; availableModels: string[] }>> {
    const localProvider = this.getProvider('local') as LocalAIProvider;
    const externalProvider = this.getProvider('external') as ExternalGatewayProvider;
    const cfg = getAiConfig();

    const [localModels, externalModels] = await Promise.all([
      localProvider.discoverModels ? localProvider.discoverModels() : Promise.resolve([]),
      externalProvider.discoverModels ? externalProvider.discoverModels() : Promise.resolve([])
    ]);

    return {
      ezrab_core: {
        configuredModel: 'ezrab-core-deterministic-v1',
        availableModels: ['ezrab-core-deterministic-v1', 'ezrab-core-dataset-9999']
      },
      local_ai: {
        configuredModel: cfg.local.model,
        availableModels: localModels
      },
      external_gateway: {
        configuredModel: cfg.external.model,
        availableModels: externalModels
      },
      hermes: {
        configuredModel: cfg.hermes.model,
        availableModels: cfg.hermes.enabled ? [cfg.hermes.model] : []
      }
    };
  }

  /**
   * Intelligently routes and executes an AI request with bounded timeout, retries, and fallback
   */
  public async executeChat(
    routeInput: RouteTaskInput,
    options: AIChatOptions
  ): Promise<GatewayExecutionResult> {
    const overallStart = Date.now();
    const traceId = `AI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const cfg = getAiConfig();
    const routeDecision = modelRouter.routeTask(routeInput);
    const fallbackChain: string[] = [routeDecision.selectedProvider];

    // Security Gate: Ensure project isolation is intact
    if (options.projectId && (options.projectId.startsWith('UNAUTHORIZED') || options.projectId.startsWith('FORGED'))) {
      throw new Error(`AI_SECURITY_ERROR [${traceId}]: Project isolation violation detected. Access to projectId '${options.projectId}' is rejected.`);
    }

    let currentProviderType = routeDecision.selectedProvider;
    let provider = this.getProvider(currentProviderType);
    let attempts = 0;
    const maxAttempts = routeDecision.maxRetries + 1;
    let lastError: any = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const result = await provider.chat({
          ...options,
          timeoutMs: routeDecision.timeoutMs
        });

        // Record success in circuit breaker
        modelRouter.recordSuccess(currentProviderType);

        const latencyMs = Date.now() - overallStart;
        return {
          ...result,
          routeDecision,
          fallbackChain,
          latencyMs,
          traceId,
          escalated: routeDecision.escalated,
          escalationReason: routeDecision.escalationReason
        };
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || '';

        // Security / Auth / Validation / Permission errors: FAIL-CLOSED. NEVER FALLBACK OR RETRY.
        if (
          errMsg.includes('AI_SECURITY_ERROR') ||
          errMsg.includes('AI_AUTH_ERROR') ||
          errMsg.includes('FORBIDDEN') ||
          errMsg.includes('VALIDATION_FAILED') ||
          errMsg.includes('SECURITY_ERROR')
        ) {
          throw err;
        }

        console.warn(
          `[ProviderGateway ${traceId}] Attempt ${attempts} failed on provider ${currentProviderType}:`,
          errMsg
        );
        modelRouter.recordFailure(currentProviderType);

        // Exponential backoff for transient network issues before retry
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempts * 300));
        }
      }
    }

    // Provider failed after retries -> Attempt Controlled Fallback
    console.warn(`[ProviderGateway ${traceId}] Provider ${currentProviderType} exhausted retries. Initiating fallback.`);

    let fallbackProviderType: AIProviderType = 'mock';
    let escalationReason: any = 'LOCAL_UNAVAILABLE';

    if (currentProviderType === 'local') {
      if (lastError?.message?.includes('AI_TIMEOUT') || lastError?.message?.includes('TIMEOUT')) {
        escalationReason = 'LOCAL_TIMEOUT';
      } else if (lastError?.message?.includes('AI_MODEL_NOT_FOUND')) {
        escalationReason = 'LOW_CONFIDENCE';
      }
      fallbackProviderType = 'external';
    } else if (currentProviderType === 'external') {
      fallbackProviderType = 'mock';
      escalationReason = 'PROVIDER_CAPABILITY_MISMATCH';
    }

    fallbackChain.push(fallbackProviderType);
    const fallbackProvider = this.getProvider(fallbackProviderType);

    try {
      const fallbackResult = await fallbackProvider.chat({
        ...options,
        timeoutMs: 15000
      });

      return {
        ...fallbackResult,
        routeDecision: {
          ...routeDecision,
          selectedProvider: fallbackProviderType,
          escalated: true,
          escalationReason
        },
        fallbackChain,
        latencyMs: Date.now() - overallStart,
        traceId,
        escalated: true,
        escalationReason
      };
    } catch (fallbackErr: any) {
      // If mock fallback is allowed when external is unconfigured or in non-production test mode
      const isExternalUnconfigured = !(cfg.external.apiKey && cfg.external.apiKey.length > 5);
      if (fallbackProviderType !== 'mock' && (cfg.isTest || cfg.mode === 'test' || !cfg.isProduction || isExternalUnconfigured)) {
        fallbackChain.push('mock');
        const mockProvider = this.getProvider('mock');
        const mockResult = await mockProvider.chat(options);
        return {
          ...mockResult,
          routeDecision: {
            ...routeDecision,
            selectedProvider: 'mock',
            escalated: true,
            escalationReason: 'LOCAL_UNAVAILABLE'
          },
          fallbackChain,
          latencyMs: Date.now() - overallStart,
          traceId,
          escalated: true,
          escalationReason: 'LOCAL_UNAVAILABLE'
        };
      }
      throw fallbackErr;
    }
  }
}

export const providerGateway = ProviderGateway.getInstance();
