/**
 * MOCK ADAPTER — EZRAB AI Credits (SIMULASI FRONTEND SAJA)
 * ============================================================================
 * ⚠️  INI ADALAH MOCK. Bukan koneksi backend.
 *
 * - Menyediakan saldo & riwayat SIMULASI untuk demonstrasi interaksi UI.
 * - State hidup di memori modul ini selama sesi browser; BUKAN sumber
 *   kebenaran produksi. Jangan pakai untuk penagihan nyata.
 * - Sejak perbaikan audit 2026-10-28, state simulasi juga dipersist ke
 *   localStorage (kunci di bawah) agar saldo tidak me-reset ke 10.000 setiap
 *   reload halaman penuh — sebelumnya saldo hanya hidup di memori modul
 *   sehingga pulang-pergi ke beranda (navigasi langsung) mengembalikannya ke
 *   default. Persistensi ini HANYA untuk demo; tetap bukan penagihan nyata.
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
import { FREE_INITIAL_CREDITS, PLAN_CREDITS, TOPUP_OFFERS, topUpOfferFor } from './config';
import { planAllowsAiFeature } from './featureGate';

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

// --- persistensi simulasi (localStorage; aman bila tak tersedia, mis. Node) ---
const STORAGE_KEY = 'ezrab-credit-sim-v1';

function saveState(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Abaikan: simulasi tetap jalan di memori.
  }
}

function loadState(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<MockState>;
    if (parsed.plan === 'free' || parsed.plan === 'starter' || parsed.plan === 'pro' || parsed.plan === 'business') {
      state.plan = parsed.plan;
    }
    if (Number.isFinite(parsed.subscription)) state.subscription = parsed.subscription as number;
    if (Number.isFinite(parsed.topup)) state.topup = parsed.topup as number;
    if (Number.isFinite(parsed.bonus)) state.bonus = parsed.bonus as number;
    if (Array.isArray(parsed.ledger)) state.ledger = parsed.ledger as LedgerEntry[];
    if (Number.isFinite(parsed.seq)) state.seq = parsed.seq as number;
  } catch {
    // Data tersimpan rusak: pakai default.
  }
}

loadState();

function nextId(prefix: string): string {
  state.seq += 1;
  return `${prefix}_sim_${Date.now().toString(36)}_${state.seq}`;
}

/**
 * Catat pemakaian SIMULASI (mengurangi saldo mock). Mengembalikan false bila:
 * - fitur AI tidak termasuk paket aktif (gerbang kanonis plans.ts via
 *   featureGate — ditegakkan di lapisan debit ini, bukan hanya di UI;
 *   audit FINISH WS-B 2026-11-08: sebelumnya consume menerima fitur apa
 *   pun selama saldo cukup, jadi panggilan UI yang terlewat/baru bisa
 *   memotong kredit untuk fitur yang dikunci paket, mis. DED/Dokumen
 *   untuk Free yang masih punya sisa 100 kredit),
 * - jumlah kredit tidak sah (<= 0 / bukan bilangan bulat), atau
 * - kunci idempotency `jobReference` sudah pernah tercatat sebagai
 *   pemakaian (satu pekerjaan AI tidak terpotong dua kali — retry/klik
 *   ganda pada referensi yang sama adalah no-op yang melaporkan false;
 *   audit FINISH WS-B: sebelumnya dua consume dengan jobReference sama
 *   memotong dua kali),
 * - saldo tidak cukup.
 * Pemanggil wajib menampilkan konfirmasi/penolakan. Pemakaian tanpa
 * jobReference tetap diizinkan (jalur lama) tetapi tidak terlindungi
 * idempotency — pemanggil baru WAJIB mengisinya.
 */
export function mockConsume(
  feature: AiFeature,
  credits: number,
  description: string,
  opts: { model?: string; jobReference?: string; tokensIn?: number; tokensOut?: number; weightedTokens?: number } = {}
): boolean {
  if (
    (feature === 'chat-ai' || feature === 'ded-ai' || feature === 'ai-document') &&
    !planAllowsAiFeature(state.plan, feature)
  ) {
    return false;
  }
  if (!Number.isInteger(credits) || credits <= 0) return false;
  if (
    opts.jobReference &&
    state.ledger.some((e) => e.jobReference === opts.jobReference && e.credits < 0)
  ) {
    return false;
  }
  const total = state.subscription + state.topup + state.bonus;
  if (credits > total) return false;
  // Urutan konsumsi KANONIS server (Phase 5.1 Policy Lock,
  // api/_lib/creditAllocation.js — K5 Gelombang 2): langganan →
  // bonus → top-up. Urutan lama (bonus → topup → langganan)
  // berlawanan dengan server dan sudah diganti.
  let rest = credits;
  for (const k of ['subscription', 'bonus', 'topup'] as const) {
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
    tokensIn: opts.tokensIn,
    tokensOut: opts.tokensOut,
    weightedTokens: opts.weightedTokens,
  });
  notify();
  return true;
}

/**
 * Simulasi top-up: menambah saldo mock + entri ledger. BUKAN pembayaran nyata.
 * Top-up TIDAK tersedia untuk paket Free (kebijakan billing) — pada paket
 * Free fungsi ini menolak tanpa mengubah state dan melaporkan status
 * 'failed'; permukaan UI (modal top-up) menampilkan alasannya ke pengguna.
 *
 * Tier mengikuti penawaran kanonis Spec v1.0 §7.2 (K6): `itemId` wajib
 * salah satu dari TOPUP_OFFERS; itemId tak dikenal ditolak tanpa mengubah
 * state (tidak pernah menebak tier). Tanpa argumen → tier terkecil
 * (topup-500), agar pemanggil lama tetap bermakna.
 * Tier Spec tanpa bonus: seluruh kredit masuk bucket top-up
 * (bonusCredits selalu 0 — bukan penawaran interim 3.000+600 lagi).
 */
export function mockTopUp(itemId: string = TOPUP_OFFERS[0].itemId): TopUpStatus {
  const offer = topUpOfferFor(itemId);
  if (!offer) {
    return {
      topUpId: '',
      amountIdr: 0,
      baseCredits: 0,
      bonusCredits: 0,
      totalCredits: 0,
      status: 'failed',
      simulated: true,
    };
  }
  if (state.plan === 'free') {
    return {
      topUpId: '',
      amountIdr: offer.priceIdr,
      baseCredits: 0,
      bonusCredits: 0,
      totalCredits: 0,
      status: 'failed',
      simulated: true,
    };
  }
  state.topup += offer.credits;
  const id = nextId('topup');
  state.ledger.unshift({
    id,
    at: nowIso(),
    feature: 'topup',
    description: `Top-up simulasi Rp${offer.priceIdr.toLocaleString('id-ID')} → ${offer.credits.toLocaleString('id-ID')} kredit`,
    credits: offer.credits,
    status: 'simulated',
  });
  notify();
  return {
    topUpId: id,
    amountIdr: offer.priceIdr,
    baseCredits: offer.credits,
    bonusCredits: 0,
    totalCredits: offer.credits,
    status: 'simulated',
    simulated: true,
  };
}

/**
 * Ganti paket simulasi (untuk demo). Berpindah paket = memulai keadaan
 * demo paket tujuan dari awal: jatah paket tujuan diberikan penuh dan
 * bucket top-up/bonus dari paket sebelumnya dibersihkan (riwayat ledger
 * dipertahankan sebagai jejak audit simulasi).
 *
 * Free: jatahnya adalah kredit AWAL 100 (FREE_INITIAL_CREDITS, sekali) —
 * BUKAN 0 dan bukan jatah periodik (Keputusan Owner 2026-11-07 /
 * Amendemen Spec v1.2). Perbaikan bug: sebelumnya Free diberi 0 sehingga
 * saldo Free selalu kosong dan Chat AI Free selalu tertahan dialog
 * "saldo tidak cukup", bertentangan dengan teks paketnya sendiri.
 */
export function mockSetPlan(plan: CreditPlan): void {
  state.plan = plan;
  state.topup = 0;
  state.bonus = 0;
  if (plan === 'starter') state.subscription = PLAN_CREDITS.starter;
  else if (plan === 'pro') state.subscription = PLAN_CREDITS.pro;
  else if (plan === 'business') state.subscription = PLAN_CREDITS.business;
  else state.subscription = FREE_INITIAL_CREDITS;
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
  saveState();
  listeners.forEach((l) => l());
}
export function subscribeMock(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
