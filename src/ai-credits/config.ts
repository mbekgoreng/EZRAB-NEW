/**
 * KONFIGURASI TERPUSAT — EZRAB AI Credits
 * ============================================================================
 * TARIF pemakaian didefinisikan di sini. DEFINISI PAKET & jatah kredit
 * TIDAK lagi didefinisikan di sini — sumber kanonisnya adalah
 * src/billing/plans.ts (tabel paket owner-approved); file ini menurunkannya.
 * Jangan hardcode angka kredit di komponen — impor dari sini / modul kanonis.
 *
 * ⚠️  TARIF DI BAWAH ADALAH RANCANGAN PRODUK PRA-PRODUKSI
 *     (pre-production calibration drafts). Bukan hasil pengukuran biaya
 *     backend. WAJIB dikalibrasi ulang sebelum production.
 */
import { getPlanDefinition, type PlanId } from '../billing/plans';
import type { AiFeature, CreditPlan, UsageEstimate } from './types';

export const CREDIT_CONFIG_NOTE =
  'Rancangan pra-produksi — seluruh tarif adalah draft kalibrasi, bukan harga final.';

/** Pemetaan ID paket simulasi (warisan) → ID paket kanonis. */
export const CREDIT_PLAN_TO_PLAN_ID: Record<CreditPlan, PlanId> = {
  free: 'free',
  starter: 'starter',
  pro: 'professional',
  business: 'business',
};

function periodicCreditsFor(plan: CreditPlan): number {
  const allowance = getPlanDefinition(CREDIT_PLAN_TO_PLAN_ID[plan]).credits;
  if (allowance.kind !== 'periodic') {
    throw new Error(`Paket ${plan} tidak memiliki jatah kredit periodik`);
  }
  return allowance.credits;
}

/**
 * Jatah kredit per periode langganan — DITURUNKAN dari definisi paket
 * kanonis (src/billing/plans.ts): Starter 5.000, Professional 10.000,
 * Business 30.000 per periode.
 */
export const PLAN_CREDITS: Record<Exclude<CreditPlan, 'free'>, number> = {
  starter: periodicCreditsFor('starter'),
  pro: periodicCreditsFor('pro'),
  business: periodicCreditsFor('business'),
};

/**
 * Kredit awal paket Free — jatah INITIAL (sekali di awal), BUKAN periodik,
 * dan karena itu TIDAK termasuk PLAN_CREDITS. Diturunkan dari modul kanonis.
 */
export const FREE_INITIAL_CREDITS = ((): number => {
  const allowance = getPlanDefinition('free').credits;
  return allowance.kind === 'initial' ? allowance.credits : 0;
})();

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
