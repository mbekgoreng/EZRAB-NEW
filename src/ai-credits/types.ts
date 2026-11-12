/**
 * KONTRAK TYPESCRIPT — EZRAB AI Credits (Phase 1: Frontend Experience Only)
 * ============================================================================
 * Kontrak data untuk handoff backend (Fase 2). Frontend HANYA memakai tipe
 * ini untuk presentasi & simulasi — bukan sumber kebenaran produksi.
 */

/** Jenis saldo kredit. */
export type CreditKind = 'subscription' | 'topup' | 'bonus';

/**
 * Paket langganan pada SIMULASI kredit. ID kanonis paket hidup di
 * src/billing/plans.ts (PlanId) — 'pro' di sini adalah nama warisan
 * simulasi untuk paket kanonis 'professional'; pemetaan resminya ada di
 * CREDIT_PLAN_TO_PLAN_ID (src/ai-credits/config.ts).
 */
export type CreditPlan = 'starter' | 'pro' | 'business' | 'free';

/** Saldo kredit agregat (kontrak backend). */
export interface CreditBalance {
  total: number;
  subscription: number;
  topup: number;
  bonus: number;
  /**
   * Kredit awal Free-once (100, sekali per akun — Amendemen v1.2).
   * Bucket terpisah di ledger server; TIDAK pernah dilebur ke top-up
   * (identitas sumber batch dipertahankan). Simulasi lama tidak
   * memisahkannya (Free 100 masuk `subscription`) sehingga field ini
   * opsional: undefined = tidak diketahui / tidak berlaku.
   */
  freeOnce?: number;
  plan: CreditPlan;
  /** ISO date — akhir masa berlaku kredit langganan (bila ada aturan). */
  validUntil: string | null;
  currency: 'CREDIT';
}

/**
 * Sumber saldo yang sedang ditampilkan (B11/D14, Gelombang 2):
 * - 'server': saldo dari endpoint /api/credits/balance (ledger batch
 *   gen-2) — sumber kebenaran untuk akun nyata.
 * - 'simulation': simulasi frontend localStorage (mode demo — TANPA sesi
 *   nyata). Ditampilkan HANYA dengan label simulasi yang eksplisit.
 * - 'unavailable': akun nyata ADA tetapi server tidak menjawab saldo
 *   (backend belum aktif / jaringan gagal). UI WAJIB menampilkan
 *   "belum terhubung" dan TIDAK menampilkan angka simulasi sebagai
 *   pengganti — angka simulasi yang disamarkan adalah klaim palsu.
 */
export type BalanceSource = 'server' | 'simulation' | 'unavailable';

/** Rentang estimasi pemakaian untuk satu aksi AI. */
export interface UsageEstimate {
  min: number;
  max: number;
  /** Target tunggal bila ada (mis. DED sederhana = 500). */
  target?: number;
  feature: AiFeature;
  model?: string;
  /** true bila angka ini kalibrasi kasar, bukan pengukuran. */
  isCalibratedDraft: boolean;
}

/** Pemakaian aktual yang tercatat (kontrak backend). */
export interface ActualUsage {
  creditsCharged: number;
  feature: AiFeature;
  model?: string;
  jobReference?: string;
  chargedAt: string; // ISO
}

/** Satu baris ledger (kontrak backend). */
export interface LedgerEntry {
  id: string;
  at: string; // ISO
  feature: AiFeature;
  model?: string;
  description: string;
  credits: number; // positif = masuk, negatif = pakai
  status: LedgerStatus;
  /** Referensi pekerjaan AI. Pada lapisan debit simulasi (mockAdapter),
   *  nilai ini berfungsi sebagai KUNCI IDEMPOTENCY pemakaian: consume
   *  kedua dengan jobReference yang sama ditolak (audit FINISH WS-B
   *  2026-11-08). Backend kelak menegakkan hal yang sama via kolom
   *  idempotency_key UNIQUE pada ledger server. */
  jobReference?: string;
  /** Rincian metering token (Amendemen v1.1) — pada simulasi klien ini
   *  ESTIMASI dari teks; pada backend kelak token aktual provider. */
  tokensIn?: number;
  tokensOut?: number;
  weightedTokens?: number;
}

export type LedgerStatus =
  | 'completed'
  | 'pending'
  | 'failed'
  | 'simulated';

/** Fitur AI yang mengonsumsi kredit. */
export type AiFeature = 'chat-ai' | 'ded-ai' | 'ai-document' | 'topup' | 'other';

/** Status reservasi kredit pra-eksekusi (kontrak backend). */
export interface ReservationStatus {
  reservationId: string;
  estimatedCredits: number;
  maxCredits: number;
  status: 'reserved' | 'released' | 'consumed' | 'expired';
  expiresAt: string; // ISO
}

/** Status pekerjaan AI terkait kredit (kontrak backend). */
export interface AiJobStatus {
  jobId: string;
  feature: AiFeature;
  stage: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  estimatedCredits: number;
  actualCredits: number | null;
}

/** Status top-up (kontrak backend). */
export interface TopUpStatus {
  topUpId: string;
  amountIdr: number;
  baseCredits: number;
  bonusCredits: number;
  totalCredits: number;
  status: 'initiated' | 'awaiting_payment' | 'completed' | 'failed' | 'simulated';
  simulated: boolean;
}

/** Ringkasan pemakaian per periode (tampilan). */
export interface UsageSummary {
  periodLabel: string;
  totalUsed: number;
  byFeature: { feature: AiFeature; used: number }[];
}
