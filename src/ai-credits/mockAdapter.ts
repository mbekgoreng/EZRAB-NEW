/**
 * MOCK ADAPTER — EZRAB AI Credits (SIMULASI FRONTEND SAJA)
 * ============================================================================
 * ⚠️  INI ADALAH MOCK. Bukan koneksi backend.
 *
 * - Menyediakan saldo & riwayat SIMULASI untuk demonstrasi interaksi UI.
 * - State hidup di memori modul ini selama sesi browser; BUKAN sumber
 *   kebenaran produksi. Jangan pakai untuk penagihan nyata.
 * - Setiap entri riwayat diberi status 'simulated' dan label "Simulasi".
 * - Pada Fase 2, ganti modul ini dengan adapter yang memanggil endpoint
 *   backend sungguhan (lihat daftar endpoint di docs fase 2).
 */
import type {
  AiFeature,
  CreditBalance,
  CreditPlan,
  LedgerEntry,
  TopUpStatus,
} from './types';
import { PLAN_CREDITS, TOPUP_OFFER } from './config';

const nowIso = () => new Date().toISOString();

interface MockState {
  plan: CreditPlan;
  subscription: number;
  topup: number;
  bonus: number;
  ledger: LedgerEntry[];
  seq: number;
}

const state: MockState = {
  plan: 'starter',
  subscription: PLAN_CREDITS.starter,
  topup: 0,
  bonus: 0,
  ledger: [],
  seq: 0,
};

function nextId(prefix: string): string {
  state.seq += 1;
  return `${prefix}_sim_${Date.now().toString(36)}_${state.seq}`;
}

/**
 * Catat pemakaian SIMULASI (mengurangi saldo mock). Mengembalikan false bila
 * saldo tidak cukup — pemanggil wajib menampilkan konfirmasi/penolakan.
 */
export function mockConsume(
  feature: AiFeature,
  credits: number,
  description: string,
  opts: { model?: string; jobReference?: string } = {}
): boolean {
  const total = state.subscription + state.topup + state.bonus;
  if (credits <= 0 || credits > total) return false;
  // Kurangi dengan urutan: bonus → topup → langganan.
  let rest = credits;
  for (const k of ['bonus', 'topup', 'subscription'] as const) {
    const take = Math.min(state[k], rest);
    state[k] -= take;
    rest -= take;
    if (rest <= 0) break;
  }
  state.ledger.unshift({
    id: nextId('use'),
    at: nowIso(),
    feature,
    model: opts.model,
    description,
    credits: -credits,
    status: 'simulated',
    jobReference: opts.jobReference,
  });
  notify();
  return true;
}

/** Simulasi top-up: menambah saldo mock + entri ledger. BUKAN pembayaran nyata. */
export function mockTopUp(): TopUpStatus {
  state.topup += TOPUP_OFFER.baseCredits;
  state.bonus += TOPUP_OFFER.bonusCredits;
  const id = nextId('topup');
  state.ledger.unshift({
    id,
    at: nowIso(),
    feature: 'topup',
    description: `Top-up simulasi Rp${TOPUP_OFFER.priceIdr.toLocaleString('id-ID')} → ${TOPUP_OFFER.totalCredits.toLocaleString('id-ID')} kredit`,
    credits: TOPUP_OFFER.totalCredits,
    status: 'simulated',
  });
  notify();
  return {
    topUpId: id,
    amountIdr: TOPUP_OFFER.priceIdr,
    baseCredits: TOPUP_OFFER.baseCredits,
    bonusCredits: TOPUP_OFFER.bonusCredits,
    totalCredits: TOPUP_OFFER.totalCredits,
    status: 'simulated',
    simulated: true,
  };
}

/** Ganti paket simulasi (untuk demo). */
export function mockSetPlan(plan: CreditPlan): void {
  state.plan = plan;
  if (plan === 'starter') state.subscription = PLAN_CREDITS.starter;
  else if (plan === 'pro') state.subscription = PLAN_CREDITS.pro;
  else state.subscription = 0;
  notify();
}

export function mockGetBalance(): CreditBalance {
  return {
    total: state.subscription + state.topup + state.bonus,
    subscription: state.subscription,
    topup: state.topup,
    bonus: state.bonus,
    plan: state.plan,
    validUntil: null, // belum ada aturan masa berlaku di Fase 1
    currency: 'CREDIT',
  };
}

export function mockGetLedger(): LedgerEntry[] {
  return [...state.ledger];
}

/** Reset seluruh state simulasi (untuk demo/testing). */
export function mockReset(): void {
  state.plan = 'starter';
  state.subscription = PLAN_CREDITS.starter;
  state.topup = 0;
  state.bonus = 0;
  state.ledger = [];
  state.seq = 0;
  notify();
}

// --- langganan perubahan (untuk hook React) ---
type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  listeners.forEach((l) => l());
}
export function subscribeMock(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
