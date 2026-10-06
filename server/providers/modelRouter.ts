import { AIProviderType } from './aiProvider';

export type ModelTaskType =
  | 'DETERMINISTIC_CORE'
  | 'SIMPLE_CHAT'
  | 'INTENT_CLASSIFICATION'
  | 'COMPLEX_PLANNING'
  | 'IMAGE_ANALYSIS'
  | 'STRUCTURED_TOOL_CALLING'
  | 'LOCAL_PRIVATE'
  | 'DOCUMENT_REASONING'
  | 'FALLBACK';

export type EscalationReason =
  | 'LOCAL_UNAVAILABLE'
  | 'LOCAL_TIMEOUT'
  | 'LOW_CONFIDENCE'
  | 'COMPLEX_TASK'
  | 'VISION_REQUIRED'
  | 'LONG_CONTEXT_REQUIRED'
  | 'EXTERNAL_KNOWLEDGE_REQUIRED'
  | 'TOOL_PLANNING_REQUIRED'
  | 'STRUCTURED_OUTPUT_REQUIRED'
  | 'PROVIDER_CAPABILITY_MISMATCH';

export interface RouteTaskInput {
  taskType: ModelTaskType;
  intent?: string;
  complexity?: 'LOW' | 'MEDIUM' | 'HIGH';
  isSensitive?: boolean;
  requiresVision?: boolean;
  requiresTools?: boolean;
  requiresExternalKnowledge?: boolean;
  contextTokens?: number;
  forcedMode?: 'auto' | 'ezrab_core' | 'local' | 'external';
  userSubscription?: 'free' | 'trial' | 'pro' | 'enterprise';
}

export interface RouteDecision {
  taskType: ModelTaskType;
  selectedProvider: AIProviderType;
  selectedModel: string;
  mode: 'auto' | 'ezrab_core' | 'local' | 'external';
  confidence: number;
  escalated: boolean;
  escalationReason?: EscalationReason;
  timeoutMs: number;
  maxRetries: number;
  costClass: 'free' | 'low' | 'medium' | 'high';
}

export interface ProviderCircuitState {
  providerId: string;
  healthy: boolean;
  consecutiveFailures: number;
  circuitOpenUntil?: number;
}

export class ModelRouter {
  private static instance: ModelRouter;
  private circuitStates: Map<string, ProviderCircuitState> = new Map();
  private readonly failureThreshold = 3;
  private readonly circuitBreakerTimeoutMs = 60 * 1000; // 60 seconds

  private constructor() {
    this.initCircuits();
  }

  public static getInstance(): ModelRouter {
    if (!ModelRouter.instance) {
      ModelRouter.instance = new ModelRouter();
    }
    return ModelRouter.instance;
  }

  private initCircuits(): void {
    const defaultProviders = ['ezrab_core', 'local', 'external', 'hermes', 'mock'];
    for (const p of defaultProviders) {
      this.circuitStates.set(p, {
        providerId: p,
        healthy: true,
        consecutiveFailures: 0
      });
    }
  }

  /**
   * Determine whether a provider's circuit is open (unhealthy)
   */
  public isProviderHealthy(providerId: string): boolean {
    const now = Date.now();
    const state = this.circuitStates.get(providerId);
    if (!state) return true;

    if (state.circuitOpenUntil && state.circuitOpenUntil < now) {
      // Cooldown expired, half-open trial
      state.circuitOpenUntil = undefined;
      state.healthy = true;
      state.consecutiveFailures = 0;
      return true;
    }

    return state.healthy;
  }

  /**
   * Record failure and trigger circuit breaker if threshold reached
   */
  public recordFailure(providerId: string): void {
    let state = this.circuitStates.get(providerId);
    if (!state) {
      state = { providerId, healthy: true, consecutiveFailures: 0 };
      this.circuitStates.set(providerId, state);
    }

    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.failureThreshold) {
      state.healthy = false;
      state.circuitOpenUntil = Date.now() + this.circuitBreakerTimeoutMs;
      console.warn(`[ModelRouter] Circuit OPEN for provider ${providerId} for 60s.`);
    }
  }

  /**
   * Record success to restore health
   */
  public recordSuccess(providerId: string): void {
    const state = this.circuitStates.get(providerId);
    if (state) {
      state.consecutiveFailures = 0;
      state.healthy = true;
      state.circuitOpenUntil = undefined;
    }
  }

  /**
   * Intelligently routes tasks to the best execution path
   */
  public routeTask(input: RouteTaskInput): RouteDecision {
    const {
      taskType,
      intent = '',
      complexity = 'LOW',
      isSensitive = false,
      requiresVision = false,
      requiresTools = false,
      requiresExternalKnowledge = false,
      contextTokens = 2000,
      forcedMode = 'auto'
    } = input;

    // 1. Explicit Mode Overrides (if specified and valid)
    if (forcedMode === 'ezrab_core') {
      return {
        taskType: 'DETERMINISTIC_CORE',
        selectedProvider: 'ezrab_core',
        selectedModel: 'ezrab-core-engine',
        mode: 'ezrab_core',
        confidence: 0.99,
        escalated: false,
        timeoutMs: 5000,
        maxRetries: 1,
        costClass: 'free'
      };
    }

    // 2. CATEGORY A — EZRAB CORE (Authoritative calculations, lookups, rules)
    const isDeterministicCoreIntent = [
      'RAB_LOOKUP',
      'RAB_TOTAL',
      'QTO_LOOKUP',
      'AHSP_LOOKUP',
      'PRICE_LOOKUP',
      'WBS_OPERATION',
      'TOTAL_CALCULATION',
      'VALIDATION',
      'RULES_LOOKUP'
    ].includes(intent) || taskType === 'DETERMINISTIC_CORE';

    if (isDeterministicCoreIntent) {
      return {
        taskType: 'DETERMINISTIC_CORE',
        selectedProvider: 'ezrab_core',
        selectedModel: 'ezrab-core-engine',
        mode: forcedMode,
        confidence: 0.98,
        escalated: false,
        timeoutMs: 5000,
        maxRetries: 1,
        costClass: 'free'
      };
    }

    // 3. Vision Requirement Escalation
    if (requiresVision || taskType === 'IMAGE_ANALYSIS') {
      const isExternalHealthy = this.isProviderHealthy('external');
      return {
        taskType: 'IMAGE_ANALYSIS',
        selectedProvider: isExternalHealthy ? 'external' : 'mock',
        selectedModel: isExternalHealthy ? (process.env.AI_MODEL || 'gpt-4o') : 'mock-model',
        mode: forcedMode,
        confidence: 0.95,
        escalated: true,
        escalationReason: 'VISION_REQUIRED',
        timeoutMs: 40000,
        maxRetries: 2,
        costClass: 'medium'
      };
    }

    // 4. Complex Reasoning / DED Multi-Step Planning Escalation
    const isHighComplexity =
      complexity === 'HIGH' ||
      taskType === 'COMPLEX_PLANNING' ||
      taskType === 'DOCUMENT_REASONING' ||
      requiresExternalKnowledge ||
      contextTokens > 16000;

    if (isHighComplexity && !isSensitive) {
      const isExternalHealthy = this.isProviderHealthy('external');
      if (isExternalHealthy) {
        let reason: EscalationReason = 'COMPLEX_TASK';
        if (requiresExternalKnowledge) reason = 'EXTERNAL_KNOWLEDGE_REQUIRED';
        else if (contextTokens > 16000) reason = 'LONG_CONTEXT_REQUIRED';

        return {
          taskType: 'COMPLEX_PLANNING',
          selectedProvider: 'external',
          selectedModel: process.env.AI_MODEL || 'gpt-4o',
          mode: forcedMode,
          confidence: 0.94,
          escalated: true,
          escalationReason: reason,
          timeoutMs: 35000,
          maxRetries: 2,
          costClass: 'medium'
        };
      }
    }

    // 5. CATEGORY B — LOCAL AI (Ollama / Local Gateway)
    // Check if local is healthy
    const isLocalHealthy = this.isProviderHealthy('local');
    if (isLocalHealthy && !requiresVision) {
      return {
        taskType: taskType || 'SIMPLE_CHAT',
        selectedProvider: 'local',
        selectedModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
        mode: forcedMode,
        confidence: 0.90,
        escalated: false,
        timeoutMs: 15000,
        maxRetries: 1,
        costClass: 'free'
      };
    }

    // 6. Escalation fallback when local is unavailable/unhealthy
    const isExternalHealthy = this.isProviderHealthy('external');
    if (isExternalHealthy) {
      return {
        taskType: taskType || 'FALLBACK',
        selectedProvider: 'external',
        selectedModel: process.env.AI_MODEL || 'gpt-4o-mini',
        mode: forcedMode,
        confidence: 0.88,
        escalated: true,
        escalationReason: 'LOCAL_UNAVAILABLE',
        timeoutMs: 25000,
        maxRetries: 1,
        costClass: 'low'
      };
    }

    // 7. Deterministic Mock Fallback for Offline / Dev
    return {
      taskType: 'FALLBACK',
      selectedProvider: 'mock',
      selectedModel: 'mock-deterministic',
      mode: forcedMode,
      confidence: 0.85,
      escalated: true,
      escalationReason: 'LOCAL_UNAVAILABLE',
      timeoutMs: 5000,
      maxRetries: 1,
      costClass: 'free'
    };
  }
}

export const modelRouter = ModelRouter.getInstance();
