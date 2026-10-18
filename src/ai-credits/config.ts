/**
 * KONFIGURASI TERPUSAT — EZRAB AI Credits
 * ============================================================================
 * SATU-SATUNYA tempat angka tarif & paket didefinisikan. Jangan hardcode
 * angka kredit di komponen — impor dari sini.
 *
 * ⚠️  SEMUA ANGKA DI BAWAH ADALAH RANCANGAN PRODUK PRA-PRODUKSI
 *     (pre-production calibration drafts). Bukan hasil pengukuran biaya
 *     backend. WAJIB dikalibrasi ulang sebelum production.
 */
import type { AiFeature, CreditPlan, UsageEstimate } from './types';

export const CREDIT_CONFIG_NOTE =
  'Rancangan pra-produksi — seluruh tarif adalah draft kalibrasi, bukan harga final.';

/** Jatah kredit per periode langganan. */
export const PLAN_CREDITS: Record<Exclude<CreditPlan, 'free'>, number> = {
  starter: 10_000,
  pro: 20_000,
};

/** Satu-satunya paket top-up yang didukung di Fase 1. */
export const TOPUP_OFFER = {
  priceIdr: 5_000,
  baseCredits: 3_000,
  bonusRate: 0.2,
  get bonusCredits() {
    return Math.round(this.baseCredits * this.bonusRate);
  },
  get totalCredits() {
    return this.baseCredits + this.bonusCredits;
  },
};

/** Tarif pemakaian (rentang/target — tidak pernah ditampilkan sebagai angka pasti). */
export const TARIFFS: Record<string, UsageEstimate> = {
  'chat-ai/fast': {
    min: 5, max: 20, feature: 'chat-ai', model: 'FAST', isCalibratedDraft: true,
  },
  'chat-ai/advanced': {
    min: 20, max: 50, feature: 'chat-ai', model: 'ADVANCED', isCalibratedDraft: true,
  },
  'ai-document/simple': {
    min: 50, max: 100, feature: 'ai-document', isCalibratedDraft: true,
  },
  'ai-document/complex': {
    min: 100, max: 250, feature: 'ai-document', isCalibratedDraft: true,
  },
  'ded-ai/simple': {
    min: 500, max: 500, target: 500, feature: 'ded-ai', isCalibratedDraft: true,
  },
  'ded-ai/medium': {
    min: 650, max: 650, target: 650, feature: 'ded-ai', isCalibratedDraft: true,
  },
  'ded-ai/complex': {
    min: 800, max: 800, target: 800, feature: 'ded-ai', isCalibratedDraft: true,
  },
  'ded-ai/revision': {
    min: 100, max: 300, feature: 'ded-ai', isCalibratedDraft: true,
  },
};

export function tariffFor(key: string): UsageEstimate {
  const t = TARIFFS[key];
  if (!t) throw new Error(`Tarif tidak dikenal: ${key}`);
  return t;
}

/** Ambang saldo rendah (peringatan). */
export const LOW_BALANCE_THRESHOLD = 500;

/** Label fitur untuk tampilan. */
export const FEATURE_LABELS: Record<AiFeature, string> = {
  'chat-ai': 'Chat AI',
  'ded-ai': 'DED AI',
  'ai-document': 'AI Document',
  topup: 'Top-up',
  other: 'Lainnya',
};
