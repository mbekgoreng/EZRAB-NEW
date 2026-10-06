/**
 * DED -> RAB Central Configuration & Dual Mode Routing
 *
 * User-facing Modes:
 * 1. ⚡ CEPAT (FAST): Fast scan / preliminary screening with shorter processing time.
 * 2. 🔎 ADVANCED: Deep analysis for complex drawings, multi-pass cross-page verification,
 *    and targeted ambiguity resolution.
 *
 * Absolute Rules:
 * - NO AI model names or provider names exposed to regular user UI.
 * - All API keys remain server-side in .env (never hardcoded, never exposed to browser).
 * - Models are configurable via environment variables without code change.
 * - Core calculation is 100% deterministic (no AI guessing, no fabricated quantities or prices).
 */

export type DedProcessingMode = 'FAST' | 'ADVANCED' | 'STANDARD' | 'DETAIL';

export interface DedProcessingConfig {
  mode: DedProcessingMode;
  model: string;
  provider: string;
  /** Safe display label for the selected Vision model; never used as a routing key. */
  modelLabel?: string;
  visionModel?: string;
  textModel?: string;
  reasoningLevel?: 'low' | 'medium' | 'high';
  maxPagesPerBatch: number;
  maxConcurrentPages: number;
  enableCrossPageVerification: boolean;
  enableSecondPass: boolean;
  enableAmbiguityResolution: boolean;
  enableEvidenceExpansion: boolean;
  enableDeepQuantityValidation: boolean;
  enableDeepAhspValidation: boolean;
  enablePriceResolution: boolean;
}

export interface SafeDedModeMetadata {
  mode: 'FAST' | 'ADVANCED';
  label: string;
  badge: string;
  subtitle: string;
  description: string;
  estimatedDepth: 'standard' | 'deep';
  recommended?: boolean;
  icon: 'Zap' | 'Search';
  useCases: string[];
}

/**
 * Safe metadata for Frontend UI.
 * ZERO model names, ZERO provider names, ZERO implementation secrets.
 */
export const DED_MODES: Record<'FAST' | 'ADVANCED', SafeDedModeMetadata> = {
  FAST: {
    mode: 'FAST',
    label: 'Cepat',
    badge: 'Lebih cepat',
    subtitle: 'Analisis lebih cepat untuk mendapatkan hasil awal DED → RAB.',
    description: 'Analisis lebih cepat untuk pemeriksaan awal DED',
    estimatedDepth: 'standard',
    icon: 'Zap',
    useCases: [
      'DED sederhana',
      'Dokumen sedikit',
      'Pemeriksaan awal',
      'Draft estimasi',
    ],
  },
  ADVANCED: {
    mode: 'ADVANCED',
    label: 'Advanced',
    badge: 'Analisis mendalam',
    subtitle: 'Analisis lebih mendalam untuk gambar kompleks, detail teknis, dan referensi antar halaman.',
    description: 'Analisis lebih mendalam dengan verifikasi tambahan',
    estimatedDepth: 'deep',
    recommended: true,
    icon: 'Search',
    useCases: [
      'DED kompleks',
      'Banyak detail & potongan',
      'Banyak halaman',
      'Cross-page references',
      'Dimensi ambigu',
      'Quantity yang perlu verifikasi',
      'Gambar struktur/MEP kompleks',
    ],
  },
};

export const SAFE_DED_MODES = DED_MODES;

/**
 * Returns safe metadata for a processing mode.
 */
export function getSafeDedModeMetadata(mode: DedProcessingMode = 'FAST'): SafeDedModeMetadata {
  const normalized = mode === 'FAST' ? 'FAST' : 'ADVANCED';
  return DED_MODES[normalized];
}

// Backwards compatibility metadata (masked without third-party names)
export interface DedModeMetadata {
  id: DedProcessingMode;
  title: string;
  subtitle: string;
  description: string;
  recommended?: boolean;
  icon: string;
  speedRating: number;
  depthRating: number;
  verificationRating: number;
  providerName?: string;
  modelBadge?: string;
}

export const DED_MODE_METADATA: Record<DedProcessingMode, DedModeMetadata> = {
  FAST: {
    id: 'FAST',
    title: '⚡ CEPAT',
    subtitle: 'Hasil awal lebih cepat',
    description: 'Untuk screening cepat dan estimasi awal volume DED dengan latensi minimal.',
    icon: 'Zap',
    speedRating: 5,
    depthRating: 3,
    verificationRating: 2,
    providerName: 'EZRAB Fast Engine',
    modelBadge: 'Cepat',
  },
  ADVANCED: {
    id: 'ADVANCED',
    title: '🔎 ADVANCED',
    subtitle: 'Analisis mendalam',
    description: 'Analisis lebih mendalam untuk gambar kompleks, detail teknis, dan referensi antar halaman.',
    recommended: true,
    icon: 'Search',
    speedRating: 3,
    depthRating: 5,
    verificationRating: 5,
    providerName: 'EZRAB Advanced Engine',
    modelBadge: 'Advanced',
  },
  STANDARD: {
    id: 'STANDARD',
    title: '◉ STANDARD',
    subtitle: 'Analisis seimbang',
    description: 'Untuk pekerjaan estimasi standar dengan verifikasi lintas-halaman.',
    icon: 'CheckCircle2',
    speedRating: 4,
    depthRating: 4,
    verificationRating: 4,
    providerName: 'EZRAB Core Engine',
    modelBadge: 'Standard',
  },
  DETAIL: {
    id: 'DETAIL',
    title: '🔎 DETAIL',
    subtitle: 'Analisis mendalam',
    description: 'Analisis paling mendalam dengan multi-pass cross-page reasoning.',
    icon: 'Search',
    speedRating: 2,
    depthRating: 5,
    verificationRating: 5,
    providerName: 'EZRAB Deep Engine',
    modelBadge: 'Detail',
  },
};

function getEnv(name: string, fallback: string): string {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name]!;
  }
  return fallback;
}

/**
 * Resolves the provider and model IDs for a given mode from environment variables.
 * SERVER-SIDE ONLY - NEVER EXPOSE TO CLIENT BROWSER.
 */
export function getDedModel(mode: DedProcessingMode): {
  provider: string;
  model: string;
  modelLabel: string;
  visionModel?: string;
  textModel?: string;
  reasoningLevel?: 'low' | 'medium' | 'high';
} {
  switch (mode) {
    case 'FAST': {
      const defaultProvider =
        getEnv('GEMINI_API_KEY_1', '') || getEnv('GEMINI_API_KEY', '') ? 'gemini' : 'zyrouter';
      const provider = getEnv('DED_FAST_PROVIDER', defaultProvider);

      const fastModel =
        getEnv('DED_FAST_MODEL', '') ||
        getEnv('GEMINI_FAST_MODEL', '') ||
        getEnv('GEMINI_MODEL_FLASH_LITE', '') ||
        (provider === 'zyrouter' ? 'geminiflash-3.8' : 'gemini-3.5-flash-lite');

      return {
        provider,
        model: fastModel,
        modelLabel: provider === 'zyrouter' ? 'Gemini Flash 3.8' : 'Gemini 3.5 Flash Lite',
        visionModel: fastModel,
        textModel: fastModel,
        reasoningLevel: 'low',
      };
    }
    case 'STANDARD': {
      const textModel = getEnv('DED_STANDARD_TEXT_MODEL', 'ali/qwen3.8-flash');
      const visionModel = getEnv('DED_STANDARD_VISION_MODEL', 'ali/qwen3.8-omni-flash');

      return {
        provider: 'vleee',
        model: visionModel,
        modelLabel: 'EZRAB Standard Vision',
        visionModel,
        textModel,
        reasoningLevel: 'medium',
      };
    }
    case 'DETAIL':
    case 'ADVANCED': {
      // ZyRouter expects its own model id `geminiflash-3.8` (see aiProviderRegistry,
      // provider `zyrouter`). `gemini-3.8-flash` is the NATIVE Google id and would not
      // resolve on the ZyRouter gateway.
      const detailModel =
        getEnv('DED_ADVANCED_MODEL', '') ||
        getEnv('DED_DETAIL_MODEL', '') ||
        getEnv('ZYROUTER_MODEL', '') ||
        getEnv('DED_SCAN_AI_MODEL', '') ||
        'geminiflash-3.8';

      return {
        provider: 'zyrouter',
        model: detailModel,
        modelLabel: 'Gemini Flash 3.8',
        visionModel: detailModel,
        textModel: detailModel,
        reasoningLevel: 'medium',
      };
    }
    default:
      return getDedModel('FAST');
  }
}

/**
 * Returns complete DedProcessingConfig for the selected mode.
 */
export function getDedProcessingConfig(
  mode: DedProcessingMode = 'FAST',
  overrides?: Partial<DedProcessingConfig>
): DedProcessingConfig {
  const modelInfo = getDedModel(mode);

  const baseConfig: Record<DedProcessingMode, DedProcessingConfig> = {
    FAST: {
      mode: 'FAST',
      provider: modelInfo.provider,
      model: modelInfo.model,
      modelLabel: modelInfo.modelLabel,
      visionModel: modelInfo.visionModel,
      textModel: modelInfo.textModel,
      reasoningLevel: 'low',
      maxPagesPerBatch: 10,
      maxConcurrentPages: 6,
      enableCrossPageVerification: false,
      enableSecondPass: false,
      enableAmbiguityResolution: false,
      enableEvidenceExpansion: false,
      enableDeepQuantityValidation: false,
      enableDeepAhspValidation: false,
      enablePriceResolution: true, // Deterministic project/database lookup only
    },
    ADVANCED: {
      mode: 'ADVANCED',
      provider: modelInfo.provider,
      model: modelInfo.model,
      modelLabel: modelInfo.modelLabel,
      visionModel: modelInfo.visionModel,
      textModel: modelInfo.textModel,
      reasoningLevel: 'medium',
      maxPagesPerBatch: 4,
      maxConcurrentPages: 4,
      enableCrossPageVerification: true,
      enableSecondPass: true,
      enableAmbiguityResolution: true,
      enableEvidenceExpansion: true,
      enableDeepQuantityValidation: true,
      enableDeepAhspValidation: true,
      enablePriceResolution: true,
    },
    STANDARD: {
      mode: 'STANDARD',
      provider: modelInfo.provider,
      model: modelInfo.model,
      modelLabel: modelInfo.modelLabel,
      visionModel: modelInfo.visionModel,
      textModel: modelInfo.textModel,
      reasoningLevel: 'medium',
      maxPagesPerBatch: 6,
      maxConcurrentPages: 4,
      enableCrossPageVerification: true,
      enableSecondPass: true,
      enableAmbiguityResolution: true,
      enableEvidenceExpansion: true,
      enableDeepQuantityValidation: true,
      enableDeepAhspValidation: true,
      enablePriceResolution: true,
    },
    DETAIL: {
      mode: 'DETAIL',
      provider: modelInfo.provider,
      model: modelInfo.model,
      modelLabel: modelInfo.modelLabel,
      visionModel: modelInfo.visionModel,
      textModel: modelInfo.textModel,
      reasoningLevel: 'medium',
      maxPagesPerBatch: 4,
      maxConcurrentPages: 3,
      enableCrossPageVerification: true,
      enableSecondPass: true,
      enableAmbiguityResolution: true,
      enableEvidenceExpansion: true,
      enableDeepQuantityValidation: true,
      enableDeepAhspValidation: true,
      enablePriceResolution: true,
    },
  };

  const selected = baseConfig[mode] || baseConfig.FAST;
  return {
    ...selected,
    ...overrides,
  };
}
