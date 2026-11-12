/**
 * budgetFeasibility.ts — CEK KELAYAKAN BUDGET (AI Intelligence
 * Overhaul Fase 4 — Construction Intelligence, CHAT-02).
 *
 * Akar CHAT-02: konflik kelayakan tak ditandai + anggaran tak tampil
 * di ringkasan. Penilaian kelayakan di sini MURNI & deterministik:
 * total (yang SUDAH berharga) vs cap budget. Cap diambil dari nilai
 * budget TERKINI (bukan kemunculan pertama) — selaras rantai spek
 * Fase 2 (cap benar = last-match budgetHistory).
 *
 * Verdict:
 *  - UNDER — total berharga ≤ cap.
 *  - OVER  — total berharga > cap.
 *  - CANNOT_ASSESS — total parsial (ada item belum berharga) sehingga
 *    perbandingan tidak dapat diputuskan, ATAU cap/total tak tersedia;
 *    ALASAN selalu dinyatakan (bukan diam).
 *  - NO_BUDGET — budget belum disebutkan pengguna sama sekali.
 *
 * Modul ini TIDAK mengubah total, TIDAK memangkas lingkup, dan TIDAK
 * mengarang harga. Total parsial tetap dilaporkan sebagai parsial.
 */

export type BudgetVerdict = 'UNDER' | 'OVER' | 'CANNOT_ASSESS' | 'NO_BUDGET';

export interface BudgetFeasibilityInput {
  /** Total item yang SUDAH berharga (tanpa item belum berharga). */
  totalPriced: number | null;
  /** Jumlah item belum berharga (unitPrice null / PRICE_UNRESOLVED). */
  unpricedCount: number;
  /** Cap budget (nilai terkini). null = budget belum disebutkan. */
  budgetCap: number | null;
}

export interface BudgetFeasibility {
  verdict: BudgetVerdict;
  totalPriced: number | null;
  unpricedCount: number;
  budgetCap: number | null;
  /** Selisih cap − total (positif = di bawah). null bila tak dapat dihitung. */
  diff: number | null;
  /**
   * true bila verdict UNDER/OVER didasarkan pada total PARSIAL (ada
   * item belum berharga): verdict bersifat SEMENTARA — total final
   * dapat berubah. Selaras semantik rantai spek Fase 2 (verdict atas
   * total berharga; CANNOT_ASSESS hanya bila tak ada item berharga).
   */
  provisional: boolean;
  /** Alasan verdict — SELALU ada bila CANNOT_ASSESS / NO_BUDGET / provisional. */
  reason: string | null;
}

export function formatRupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

/**
 * Cap budget dari konteks intake: nilai `budget` terkini; bila
 * `budget` kosong tetapi ada riwayat, pakai entri TERAKHIR riwayat
 * (last-match — selaras rantai spek Fase 2). Nilai pertama riwayat
 * TIDAK PERNAH dipakai sebagai cap (itu cap basi, cacat CHAT-02 lama).
 */
export function budgetCapFromContext(ctx: {
  budget?: { amount: number } | null;
  budgetHistory?: Array<{ amount: number }>;
}): number | null {
  if (ctx.budget != null && Number.isFinite(ctx.budget.amount) && ctx.budget.amount > 0) {
    return ctx.budget.amount;
  }
  const hist = ctx.budgetHistory ?? [];
  if (hist.length > 0) {
    const last = hist[hist.length - 1];
    if (last && Number.isFinite(last.amount) && last.amount > 0) return last.amount;
  }
  return null;
}

export function assessBudgetFeasibility(input: BudgetFeasibilityInput): BudgetFeasibility {
  const { totalPriced, unpricedCount, budgetCap } = input;
  if (budgetCap == null) {
    return {
      verdict: 'NO_BUDGET',
      totalPriced,
      unpricedCount,
      budgetCap: null,
      diff: null,
      provisional: false,
      reason: 'Budget belum disebutkan — kelayakan tidak dapat dinilai. Sebutkan budget agar total dapat dibandingkan.',
    };
  }
  if (totalPriced == null || !Number.isFinite(totalPriced)) {
    return {
      verdict: 'CANNOT_ASSESS',
      totalPriced,
      unpricedCount,
      budgetCap,
      diff: null,
      provisional: false,
      reason: 'Total belum dapat dihitung (belum ada item berharga) — kelayakan tidak dapat dinilai.',
    };
  }
  // Selaras rantai spek Fase 2: verdict diputuskan atas total
  // BERHARGA; item belum berharga membuat verdict SEMENTARA (provisional),
  // bukan membatalkannya — total final dapat berubah sesudah harga manual masuk.
  const provisional = unpricedCount > 0;
  const provisionalReason = provisional
    ? `${unpricedCount} item belum berharga — total ${formatRupiah(totalPriced)} masih PARSIAL; verdict ini sementara, total final dapat berubah sesudah harga manual masuk.`
    : null;
  const diff = budgetCap - totalPriced;
  if (diff >= 0) {
    return {
      verdict: 'UNDER',
      totalPriced,
      unpricedCount,
      budgetCap,
      diff,
      provisional,
      reason: provisionalReason,
    };
  }
  return {
    verdict: 'OVER',
    totalPriced,
    unpricedCount,
    budgetCap,
    diff,
    provisional,
    reason: provisionalReason,
  };
}

/**
 * Baris penilaian kelayakan untuk pesan draft / jawaban — SELALU
 * tampil bila draft memakai budget (termasuk NO_BUDGET dan
 * CANNOT_ASSESS dengan alasannya). Inilah penutup CHAT-02 di jalur
 * percakapan: penilaian tidak hilang dari jawaban.
 */
export function formatBudgetFeasibilityLine(a: BudgetFeasibility): string {
  const provisionalNote = a.provisional ? ' (SEMENTARA — total PARSIAL, ada item belum berharga)' : '';
  switch (a.verdict) {
    case 'UNDER':
      return `• Penilaian kelayakan budget: total estimasi ${formatRupiah(a.totalPriced as number)} vs anggaran ${formatRupiah(a.budgetCap as number)} — DI BAWAH anggaran sebesar ${formatRupiah(Math.abs(a.diff ?? 0))}${provisionalNote}.`;
    case 'OVER':
      return `• Penilaian kelayakan budget: total estimasi ${formatRupiah(a.totalPriced as number)} vs anggaran ${formatRupiah(a.budgetCap as number)} — MELEBIHI anggaran sebesar ${formatRupiah(Math.abs(a.diff ?? 0))}${provisionalNote}. Lingkup perlu dikurangi atau budget ditambah — tidak dipangkas diam-diam.`;
    case 'CANNOT_ASSESS':
      return `• Penilaian kelayakan budget: TIDAK DAPAT DINILAI — ${a.reason ?? 'alasan tidak tercatat.'}`;
    case 'NO_BUDGET':
      return `• Penilaian kelayakan budget: TIDAK DAPAT DINILAI — ${a.reason ?? 'budget belum disebutkan.'}`;
    default:
      return '• Penilaian kelayakan budget: tidak dapat dinilai.';
  }
}

/** Seksi ringkas untuk builder kanonis (FAKTA PROYEK): cap + sumbernya. */
export function formatBudgetContextLines(ctx: {
  budget?: { amount: number; kind?: string } | null;
  budgetHistory?: Array<{ amount: number; kind?: string }>;
}): string[] {
  const cap = budgetCapFromContext(ctx);
  if (cap == null) return ['Budget: belum disebutkan (kelayakan belum dapat dinilai).'];
  const lines = [`Budget (cap berlaku, nilai terkini): ${formatRupiah(cap)}`];
  const hist = ctx.budgetHistory ?? [];
  if (hist.length > 0) {
    lines.push(`Budget sebelumnya (dikoreksi, BUKAN cap): ${hist.map((h) => formatRupiah(h.amount)).join(' → ')}`);
  }
  return lines;
}
