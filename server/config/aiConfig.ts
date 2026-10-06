/**
 * Centralized Normalized AI Configuration for EZRAB Multi-Provider AI (Phase 9.3)
 * Consolidates all environment variables and aliases into a single authoritative source.
 */

export interface AiRuntimeConfig {
  mode: 'auto' | 'ezrab_core' | 'local' | 'external' | 'test';
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;

  core: {
    enabled: boolean;
    timeoutMs: number;
  };

  local: {
    enabled: boolean;
    ollamaBaseUrl: string;
    model: string;
    timeoutMs: number;
    aiCoreUrl: string;
    aiCoreTimeoutMs: number;
    aiCoreServiceToken?: string;
  };

  gemini: {
    enabled: boolean;
    keys: Array<string | undefined>; // Up to 5 keys
    modelFlashLite: string;
    modelFlash: string;
    modelPro: string;
    timeoutMs: number;
  };

  atria: {
    enabled: boolean;
    keys: Array<string | undefined>; // Up to 15 keys
    baseUrl: string;
    openAiBaseUrl: string;
    model: string;
    timeoutMs: number;
  };

  inception: {
    enabled: boolean;
    keys: Array<string | undefined>; // Up to 15 keys
    baseUrl: string;
    openAiBaseUrl: string;
    model: string;
    timeoutMs: number;
  };

  zrouter: {
    enabled: boolean;
    baseUrl: string;
    apiKey?: string;
    model: string;
    timeoutMs: number;
  };

  zyrouter: {
    enabled: boolean;
    baseUrl: string;
    openAiBaseUrl: string;
    apiKey?: string;
    model: string;
    timeoutMs: number;
  };

  dedScan: {
    provider: string;
    model: string;
    baseUrl: string;
    openAiBaseUrl: string;
    apiKey?: string;
  };

  hermes: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    apiKey?: string;
  };

  external: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
  };

  budgets: {
    maxCostPerRequestUsd: number;
    maxCostPerTaskUsd: number;
    maxCostPerDayUsd: number;
    maxCostPerProjectUsd: number;
  };

  defaultModels: {
    cheap: string;
    balanced: string;
    premium: string;
    frontier: string;
  };

  safety: {
    maxRetries: number;
    requireConfirmationForMutations: boolean;
    strictProjectIsolation: boolean;
  };

  observability: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export function getAiConfig(): AiRuntimeConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const rawMode = (process.env.AI_ROUTER_MODE || process.env.AI_MODE || process.env.AI_PROVIDER || 'auto').toLowerCase();
  const mode = ['auto', 'ezrab_core', 'local', 'external', 'test'].includes(rawMode)
    ? (rawMode as AiRuntimeConfig['mode'])
    : 'auto';

  // Ollama & Local
  const ollamaBaseUrl = (
    process.env.OLLAMA_BASE_URL ||
    process.env.EZRAB_OLLAMA_URL ||
    'http://127.0.0.1:11434'
  ).replace(/\/$/, '');

  const localModel = process.env.OLLAMA_MODEL || process.env.EZRAB_OLLAMA_MODEL || 'qwen3:8b';
  const localTimeoutMs = parseInt(
    process.env.LOCAL_AI_TIMEOUT_MS ||
    String(Number(process.env.EZRAB_OLLAMA_TIMEOUT_SECONDS || 60) * 1000),
    10
  );

  const aiCoreUrl = (process.env.EZRAB_AI_CORE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const aiCoreTimeoutMs = parseInt(process.env.EZRAB_AI_CORE_TIMEOUT_MS || '40000', 10);
  const aiCoreServiceToken = process.env.EZRAB_AI_CORE_SERVICE_TOKEN || undefined;

  // 1. Gemini (5 Keys supported)
  const geminiKeys: Array<string | undefined> = [
    process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
  ];
  const geminiConfiguredKeys = geminiKeys.filter((k) => k && k.length > 5);
  const geminiEnabled = geminiConfiguredKeys.length > 0 && process.env.GEMINI_ENABLED !== 'false';
  const geminiModelFlashLite = process.env.GEMINI_FAST_MODEL || process.env.DED_FAST_MODEL || process.env.GEMINI_MODEL_FLASH_LITE || 'gemini-3.5-flash-lite';
  const geminiModelFlash = process.env.GEMINI_MODEL_FLASH || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const geminiModelPro = process.env.GEMINI_MODEL_PRO || 'gemini-1.5-pro';
  const geminiTimeoutMs = parseInt(process.env.GEMINI_TIMEOUT_MS || '35000', 10);

  // 2. Atria (15 Keys supported)
  const atriaKeys: Array<string | undefined> = [];
  for (let i = 1; i <= 15; i++) {
    atriaKeys.push(process.env[`ATRIA_API_KEY_${i}`] || (i === 1 ? process.env.ATRIA_API_KEY : undefined));
  }
  const atriaConfiguredKeys = atriaKeys.filter((k) => k && k.length > 5);
  const atriaEnabled = atriaConfiguredKeys.length > 0 && process.env.ATRIA_ENABLED !== 'false';
  const atriaBaseUrl = (process.env.ATRIA_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/$/, '');
  const atriaOpenAiBaseUrl = (process.env.ATRIA_OPENAI_BASE_URL || 'https://api.atria-asi.ai').replace(/\/$/, '');
  const atriaModel = process.env.ATRIA_MODEL || 'Atria-Dawn-Preview';
  const atriaTimeoutMs = parseInt(process.env.ATRIA_TIMEOUT_MS || '35000', 10);

  // 3. Inception / Mercury (15 Keys supported)
  const inceptionKeys: Array<string | undefined> = [];
  for (let i = 1; i <= 15; i++) {
    inceptionKeys.push(process.env[`INCEPTION_API_KEY_${i}`] || (i === 1 ? process.env.INCEPTION_API_KEY : undefined));
  }
  const inceptionConfiguredKeys = inceptionKeys.filter((k) => k && k.length > 5);
  const inceptionEnabled = inceptionConfiguredKeys.length > 0 && process.env.INCEPTION_ENABLED !== 'false';
  const inceptionBaseUrl = (process.env.INCEPTION_BASE_URL || 'https://api.inceptionlabs.ai/v1').replace(/\/$/, '');
  const inceptionOpenAiBaseUrl = (process.env.INCEPTION_OPENAI_BASE_URL || 'https://api.inceptionlabs.ai').replace(/\/$/, '');
  const inceptionModel = process.env.INCEPTION_MODEL || 'mercury-2.5';
  const inceptionTimeoutMs = parseInt(process.env.INCEPTION_TIMEOUT_MS || '35000', 10);

  // 4. zrouter / zyrouter (1 Key + optional pool)
  const zyrouterApiKey = process.env.ZYROUTER_API_KEY || process.env.DED_SCAN_API_KEY || process.env.ZROUTER_API_KEY || undefined;
  const zyrouterBaseUrl = (process.env.ZYROUTER_BASE_URL || process.env.DED_SCAN_BASE_URL || process.env.ZROUTER_BASE_URL || 'https://api.zyrouter.com/v1').replace(/\/$/, '');
  const zyrouterOpenAiBaseUrl = (process.env.ZYROUTER_OPENAI_BASE_URL || process.env.DED_SCAN_OPENAI_BASE_URL || 'https://api.zyrouter.com').replace(/\/$/, '');
  const zyrouterModel = process.env.ZYROUTER_MODEL || process.env.DED_SCAN_AI_MODEL || (process.env.ZROUTER_MODEL && !process.env.ZROUTER_MODEL.includes('://') ? process.env.ZROUTER_MODEL : 'gpt-6-luna');
  const zyrouterEnabled = Boolean(zyrouterApiKey && zyrouterApiKey.length > 5 && process.env.ZYROUTER_ENABLED !== 'false');
  const zyrouterTimeoutMs = parseInt(process.env.ZYROUTER_TIMEOUT_MS || process.env.ZROUTER_TIMEOUT_MS || '45000', 10);

  const zrouterApiKey = zyrouterApiKey;
  const zrouterBaseUrl = zyrouterBaseUrl;
  const zrouterModel = zyrouterModel;
  const zrouterEnabled = zyrouterEnabled;
  const zrouterTimeoutMs = zyrouterTimeoutMs;

  const dedScan = {
    provider: process.env.DED_SCAN_AI_PROVIDER || 'zyrouter',
    model: process.env.DED_SCAN_AI_MODEL || 'gpt-6-luna',
    baseUrl: zyrouterBaseUrl,
    openAiBaseUrl: zyrouterOpenAiBaseUrl,
    apiKey: zyrouterApiKey,
  };

  // Hermes (Legacy fallback)
  const hermesBaseUrl = (process.env.HERMES_BASE_URL || process.env.HERMES_URL || '').replace(/\/$/, '');
  const hermesEnabled = Boolean(hermesBaseUrl && process.env.HERMES_ENABLED !== 'false');
  const hermesModel = process.env.HERMES_MODEL || 'hermes-3-llama-3.1-8b';
  const hermesTimeoutMs = parseInt(process.env.HERMES_TIMEOUT_MS || '15000', 10);
  const hermesApiKey = process.env.HERMES_API_KEY || undefined;

  // External / Generic Gateway / VLEEE DeepSeek Orchestrator
  const externalBaseUrl = (
    process.env.VLEEE_BASE_URL ||
    process.env.AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.ROUTER_BASE_URL ||
    'https://api.vleee.net/v1'
  ).replace(/\/$/, '');
  const externalApiKey = process.env.VLEEE_API_KEY || process.env.VLEEE_API_KEY_1 || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.ROUTER_API_KEY || 'vleee-a9dad3bc24b62467333d2f81125c54a08f09dbbb061b9d11';
  const externalModel = process.env.VLEEE_DEEPSEEK_MODEL || process.env.AI_ORCHESTRATOR_MODEL || process.env.EXTERNAL_AI_MODEL || process.env.AI_MODEL || 'cbcn/deepseek-v4.1-flash';
  const externalTimeoutMs = parseInt(process.env.EXTERNAL_AI_TIMEOUT_MS || '45000', 10);
  const externalEnabled = process.env.EXTERNAL_AI_ENABLED !== 'false';

  // Budgets
  const maxCostPerRequestUsd = parseFloat(process.env.AI_MAX_COST_PER_REQUEST || process.env.MAX_AI_COST_PER_REQUEST || '0.50');
  const maxCostPerTaskUsd = parseFloat(process.env.AI_MAX_COST_PER_TASK || '1.00');
  const maxCostPerDayUsd = parseFloat(process.env.MAX_AI_COST_PER_DAY || '10.00');
  const maxCostPerProjectUsd = parseFloat(process.env.MAX_AI_COST_PER_PROJECT || '50.00');

  // Default models
  const cheapModel = process.env.AI_DEFAULT_CHEAP_MODEL || 'gpt-5.4-mini';
  const balancedModel = process.env.AI_DEFAULT_BALANCED_MODEL || 'mercury-2.5';
  const premiumModel = process.env.AI_DEFAULT_PREMIUM_MODEL || 'gemini-1.5-pro';
  const frontierModel = process.env.AI_DEFAULT_FRONTIER_MODEL || 'gpt-6-astra';

  const maxRetries = parseInt(process.env.AI_MAX_RETRIES || '2', 10);

  return {
    mode,
    nodeEnv,
    isProduction,
    isTest,
    core: {
      enabled: process.env.EZRAB_CORE_ENABLED !== 'false',
      timeoutMs: parseInt(process.env.CORE_TIMEOUT_MS || '5000', 10),
    },
    local: {
      enabled: process.env.LOCAL_AI_ENABLED !== 'false',
      ollamaBaseUrl,
      model: localModel,
      timeoutMs: localTimeoutMs,
      aiCoreUrl,
      aiCoreTimeoutMs,
      aiCoreServiceToken,
    },
    gemini: {
      enabled: geminiEnabled,
      keys: geminiKeys,
      modelFlashLite: geminiModelFlashLite,
      modelFlash: geminiModelFlash,
      modelPro: geminiModelPro,
      timeoutMs: geminiTimeoutMs,
    },
    atria: {
      enabled: atriaEnabled,
      keys: atriaKeys,
      baseUrl: atriaBaseUrl,
      openAiBaseUrl: atriaOpenAiBaseUrl,
      model: atriaModel,
      timeoutMs: atriaTimeoutMs,
    },
    inception: {
      enabled: inceptionEnabled,
      keys: inceptionKeys,
      baseUrl: inceptionBaseUrl,
      openAiBaseUrl: inceptionOpenAiBaseUrl,
      model: inceptionModel,
      timeoutMs: inceptionTimeoutMs,
    },
    zrouter: {
      enabled: zrouterEnabled,
      baseUrl: zrouterBaseUrl,
      apiKey: zrouterApiKey,
      model: zrouterModel,
      timeoutMs: zrouterTimeoutMs,
    },
    zyrouter: {
      enabled: zyrouterEnabled,
      baseUrl: zyrouterBaseUrl,
      openAiBaseUrl: zyrouterOpenAiBaseUrl,
      apiKey: zyrouterApiKey,
      model: zyrouterModel,
      timeoutMs: zyrouterTimeoutMs,
    },
    dedScan,
    hermes: {
      enabled: hermesEnabled,
      baseUrl: hermesBaseUrl,
      model: hermesModel,
      timeoutMs: hermesTimeoutMs,
      apiKey: hermesApiKey,
    },
    external: {
      enabled: externalEnabled,
      baseUrl: externalBaseUrl,
      apiKey: externalApiKey,
      model: externalModel,
      timeoutMs: externalTimeoutMs,
    },
    budgets: {
      maxCostPerRequestUsd,
      maxCostPerTaskUsd,
      maxCostPerDayUsd,
      maxCostPerProjectUsd,
    },
    defaultModels: {
      cheap: cheapModel,
      balanced: balancedModel,
      premium: premiumModel,
      frontier: frontierModel,
    },
    safety: {
      maxRetries,
      requireConfirmationForMutations: process.env.AI_REQUIRE_CONFIRMATION !== 'false',
      strictProjectIsolation: true,
    },
    observability: {
      logLevel: (process.env.AI_LOG_LEVEL as any) || 'info',
    },
  };
}

/**
 * Returns a sanitized configuration object safe to expose in APIs or client diagnostics.
 * Never includes API keys, tokens, or private secrets.
 */
export function getSanitizedAiConfig(): Record<string, any> {
  const cfg = getAiConfig();
  return {
    mode: cfg.mode,
    nodeEnv: cfg.nodeEnv,
    core: {
      enabled: cfg.core.enabled,
      timeoutMs: cfg.core.timeoutMs,
    },
    local: {
      enabled: cfg.local.enabled,
      ollamaBaseUrl: cfg.local.ollamaBaseUrl,
      model: cfg.local.model,
      timeoutMs: cfg.local.timeoutMs,
      aiCoreConfigured: Boolean(cfg.local.aiCoreUrl),
    },
    gemini: {
      configured: cfg.gemini.enabled,
      activeKeyCount: cfg.gemini.keys.filter((k) => k && k.length > 5).length,
      modelFlashLite: cfg.gemini.modelFlashLite,
      modelFlash: cfg.gemini.modelFlash,
      modelPro: cfg.gemini.modelPro,
    },
    atria: {
      configured: cfg.atria.enabled,
      activeKeyCount: cfg.atria.keys.filter((k) => k && k.length > 5).length,
      baseUrl: cfg.atria.baseUrl,
      model: cfg.atria.model,
    },
    inception: {
      configured: cfg.inception.enabled,
      activeKeyCount: cfg.inception.keys.filter((k) => k && k.length > 5).length,
      baseUrl: cfg.inception.baseUrl,
      model: cfg.inception.model,
    },
    zrouter: {
      configured: cfg.zrouter.enabled,
      baseUrl: cfg.zrouter.baseUrl,
      model: cfg.zrouter.model,
    },
    hermes: {
      configured: cfg.hermes.enabled,
      model: cfg.hermes.enabled ? cfg.hermes.model : null,
    },
    external: {
      configured: Boolean(cfg.external.apiKey && cfg.external.apiKey.length > 5),
      baseUrl: cfg.external.baseUrl,
      model: cfg.external.model,
      timeoutMs: cfg.external.timeoutMs,
    },
    budgets: cfg.budgets,
    defaultModels: cfg.defaultModels,
    safety: cfg.safety,
  };
}
