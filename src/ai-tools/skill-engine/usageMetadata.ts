/**
 * EZRAB AI — Skill Engine: metadata pemakaian (BARU, Phase 2 Workstream 3).
 *
 * OBSERVABILITAS SAJA (Keputusan B). Modul ini TIDAK punya otoritas billing:
 * tidak ada ledger, tidak ada debit, tidak ada cek saldo, tidak ada gerbang
 * kredit. Satu-satunya angka di sini adalah ESTIMASI dari token yang
 * dilaporkan handler (1 kredit = 200 token, kebijakan kanonis) — dan bila
 * token tidak dilaporkan, estimasinya null (bukan 0, bukan karangan).
 * Pengenaan biaya di masa depan lewat layanan kredit kanonis.
 */

/** Kebijakan kanonis: 1 kredit = 200 token terbobot. */
export const TOKENS_PER_CREDIT = 200;

export type SkillUsageStatus = 'completed' | 'failed' | 'cancelled' | 'awaiting-approval';

export interface SkillUsageRecord {
  runId: string;
  skillId: string;
  requestId: string;
  traceId: string;
  projectId: string | null;
  /**
   * Atribusi pemakaian. Id Supabase asli sesudah flip AUTH (8a03451);
   * null di sesi demo/failsafe. Tanpa userId, agregasi per pengguna
   * tidak mungkin — medan ini yang memungkinkan observabilitas per
   * pengguna tanpa ledger kedua (Keputusan B).
   */
  userId: string | null;
  status: SkillUsageStatus;
  /** Jumlah percobaan yang benar-benar dijalankan (1 = tanpa retry). */
  attempts: number;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Estimasi kredit dari token terukur; null bila token tidak dilaporkan. */
  estimatedCredits: number | null;
  recordedAt: string;
}

/**
 * Estimasi kredit dari token terukur. null masuk -> null keluar (tanpa
 * token terukur, tidak ada estimasi — bukan 0).
 */
export function estimateCreditsFromTokens(tokens: number | null | undefined): number | null {
  if (tokens === null || tokens === undefined) return null;
  if (!Number.isFinite(tokens) || tokens < 0) return null;
  return Math.ceil(tokens / TOKENS_PER_CREDIT);
}

export interface UsageSink {
  record(record: SkillUsageRecord): void;
}

/** Sink in-memory untuk observabilitas sesi (tanpa persistensi, tanpa billing). */
export class InMemoryUsageSink implements UsageSink {
  private readonly records: SkillUsageRecord[] = [];

  record(record: SkillUsageRecord): void {
    this.records.push(record);
  }

  list(): SkillUsageRecord[] {
    return [...this.records];
  }

  listBySkill(skillId: string): SkillUsageRecord[] {
    return this.records.filter((r) => r.skillId === skillId);
  }

  __resetForTests(): void {
    this.records.length = 0;
  }
}
