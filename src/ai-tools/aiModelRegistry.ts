/**
 * EZRAB AI TOOLS — Central Model Registry (aiModelRegistry.ts)
 *
 * Single source of truth for which model each AI product must send to the provider.
 * BRANDED GATE: `requestedModel === actuallySentModel`. No silent substitution.
 *
 * Model decisions (from the master prompt):
 * - DED AI Estimate FAST   → gemini-3.5-flash-lite (native Google)
 * - DED AI Estimate DETAIL → geminiflash-3.8 (ZyRouter gateway id, NOT native)
 * - Dokumen AI             → from env (repository shares provider)
 * - EZRAB AI              → from env via helper
 */

export type AIProductId =
  | 'EZRAB_AI'
  | 'DED_AI_FAST'
  | 'DED_AI_DETAIL'
  | 'DOKUMEN_AI_EXTRACT' // placeholder to keep union useful; never actually used
  | 'DOKUMEN_AI'
  | 'DOKUMEN_AI_EXTRACT_PLAIN'; // internal sub-task: pure text extraction (never sent)

export interface ModelTarget {
  productId: AIProductId;
  provider: string;
  model: string;
  label: string;
  resolveSource: string;
}

function env(name: string): string {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    typeof process.env[name] === 'string' &&
    process.env[name]!.trim().length > 0
  ) {
    return process.env[name]!.trim();
  }
  return '';
}

function envFirst(...names: string[]): string {
  for (const n of names) {
    const v = env(n);
    if (v) return v;
  }
  return '';
}

const DED_AI_FAST = 'gemini-3.5-flash-lite';
const DED_AI_DETAIL = 'geminiflash-3.8';
const DED_AI_DETAIL_PROVIDER = 'zyrouter';

function normaliseModelId(raw: string): string {
  return raw.trim().split(',')[0].trim();
}

export function getModelTarget(productId: AIProductId): ModelTarget {
  switch (productId) {
    case 'DED_AI_FAST': {
      const source = envFirst('DED_FAST_MODEL', 'GEMINI_FAST_MODEL', 'GEMINI_MODEL_FLASH_LITE');
      const fallback = source || DED_AI_FAST;
      return {
        productId: 'DED_AI_FAST',
        provider: 'gemini',
        model: normaliseModelId(fallback),
        label: 'EZRAB Fast Engine',
        resolveSource: source ? 'env(FAST_GROUP)' : 'registry-default',
      };
    }
    case 'DED_AI_DETAIL': {
      const source = envFirst('DED_ADVANCED_MODEL'); // never set
      const detail = envFirst('DED_DETAIL_MODEL', 'ZYROUTER_MODEL', 'DED_SCAN_AI_MODEL') || DED_AI_DETAIL;
      const detailResolved = normaliseModelId(detail);
      return {
        productId: 'DED_AI_DETAIL',
        provider: DED_AI_DETAIL_PROVIDER,
        model: detailResolved,
        label: 'EZRAB Deep Engine',
        resolveSource: source ? 'env(DED_ADVANCED_MODEL)' : 'env(DED_DETAIL_MODEL|ZYROUTER_MODEL|DED_SCAN_AI_MODEL)||registry-default',
      };
    }
    case 'DOKUMEN_AI': {
      const docSource = envFirst('DED_DETAIL_MODEL', 'DED_SCAN_AI_MODEL', 'ZYROUTER_MODEL', 'GEMINI_MODEL_FLASH');
      const model = normaliseModelId(docSource || DED_AI_DETAIL);
      return {
        productId: 'DOKUMEN_AI',
        provider: 'zyrouter',
        model,
        label: 'EZRAB Dokumen AI',
        resolveSource: docSource ? 'env(DED_DETAIL_MODEL|DED_SCAN_AI_MODEL|ZYROUTER_MODEL|GEMINI_MODEL_FLASH)' : 'registry-default',
      };
    }
    case 'DOKUMEN_AI_EXTRACT_PLAIN':
      return {
        productId: 'DOKUMEN_AI_EXTRACT_PLAIN',
        provider: 'none',
        model: 'n/a',
        label: 'Deterministic Extractor',
        resolveSource: 'local-document-parser (no provider call)',
      };
    case 'EZRAB_AI':
    default: {
      const source = envFirst('DED_ADVANCED_MODEL', 'DED_DETAIL_MODEL', 'AI_ORCHESTRATOR_MODEL', 'GEMINI_MODEL_PRO');
      const providerSource = envFirst('AI_ORCHESTRATOR_PROVIDER', 'DED_AI_PROVIDER');
      const provider = providerSource || (source.includes('geminiflash') ? 'zyrouter' : source.includes('/') ? 'external' : 'gemini');
      const model = normaliseModelId(source || 'gemini-3.8-flash');
      return {
        productId: 'EZRAB_AI',
        provider,
        model,
        label: 'EZRAB AI Pro',
        resolveSource: source ? 'env(EZRAB_AI_MODEL_GROUP)' : 'registry-default',
      };
    }
  }
}

export const aiModelRegistry = {
  get: getModelTarget,
  projectTypeLabel(type: string): string {
    const map: Record<string, string> = {
      BANGUNAN: 'Bangunan',
      GEDUNG: 'Gedung',
      'BANGUNAN AIR': 'Bangunan Air',
      JALAN: 'Jalan',
      PAVING: 'Paving',
    };
    return map[type] || type;
  },
} as const;
