/**
 * KONTRAK TYPESCRIPT — EZRAB AI Credits (Phase 1: Frontend Experience Only)
 * ============================================================================
 * Kontrak data untuk handoff backend (Fase 2). Frontend HANYA memakai tipe
 * ini untuk presentasi & simulasi — bukan sumber kebenaran produksi.
 */

/** Jenis saldo kredit. */
export type CreditKind = 'subscription' | 'topup' | 'bonus';

/** Paket langganan yang memberi jatah kredit per periode. */
export type CreditPlan = 'starter' | 'pro' | 'free';

/** Saldo kredit agregat (kontrak backend). */
export interface CreditBalance {
  total: number;
  subscription: number;
  topup: number;
  bonus: number;
  plan: CreditPlan;
  /** ISO date — akhir masa berlaku kredit langganan (bila ada aturan). */
  validUntil: string | null;
  currency: 'CREDIT';
}

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
  jobReference?: string;
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
