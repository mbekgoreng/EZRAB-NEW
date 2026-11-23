/**
 * pricingFinancialIntegrity — Batch 4 (§7): integritas harga, finansial,
 * & spreadsheet (program Universal Batch 1–5, perintah owner 2026-11-23).
 *
 * Modul DAUN (pola templateSuitability / scopeDiscipline /
 * engineeringSpec): fungsi MURNI/deterministik atas data yang
 * diteruskan pemanggil — tanpa React, tanpa storage, tanpa panggilan
 * provider, tanpa menulis proyek apa pun. Semua total di sini
 * didelegasikan ke mesin kanonis yang SUDAH ADA; modul ini TIDAK
 * membangun engine harga/finansial kedua:
 * - status harga transfer → `transferPriceStatus` /
 *   `transferVerificationStatus` (universalRab.ts, kontrak S2);
 * - total proyek → `recalculateCostSummary`
 *   (UnifiedProjectEngine — SATU-SATUNYA tangga uang yang sah);
 * - gerbang ekspor → `exportItemAmount` / `summarizeExportSections`
 *   (export/priceIntegrity.ts).
 *
 * Isi (§7.1–§7.6):
 * - §7.1 `resolveCanonicalPriceState`: SATU model keadaan harga
 *   kanonis (7 keadaan) untuk SETIAP item — draft, record
 *   spreadsheet, maupun baris ekspor — dengan label §7.6, sumber,
 *   provenance, status verifikasi/asumsi/persetujuan.
 * - §7.3 `reconcileProjectFinancials`: rekonsiliasi sumber-kebenaran-
 *   tunggal — tiap item dihitung TEPAT SATU KALI, harga hilang
 *   dikecualikan (bukan gratis), total parsial ditandai, ember
 *   terverifikasi/database/pasar/manual/estimasi direkonsiliasi,
 *   ringkasan tersimpan dicocokkan dengan rekalkulasi kanonis segar.
 * - §7.3/§7.5 `reconcileScopeSubtotals`: Σ subtotal cakupan ==
 *   total proyek (pembulatan deterministik).
 * - §7.2 `summarizeEstimateApprovals`: status persetujuan estimasi AI
 *   per item (laporan — gerbang persetujuan transfernya sendiri
 *   adalah preview + binding G1/W11 yang SUDAH ADA, bukan di sini).
 * - §8 (handoff Batch 3) `checkEngineeringTransferGate`: gerbang
 *   transfer risiko teknik — murni, menunggu UI review B5 (lihat
 *   dok fungsi: TANPA mekanisme pencatatan review, gerbang ini TIDAK
 *   di-wire ke validateTransfer — pemblokiran tanpa jalan keluar
 *   akan membekukan transfer draft HIGH yang sah).
 * - §7.6 `buildExportIntegrityReport`: kelengkapan + konsistensi
 *   data ekspor (Excel/PDF) — deskripsi, satuan, kuantitas, harga,
 *   subtotal, provenance, label asumsi, peringatan harga hilang /
 *   total parsial, struktur cakupan, rekap finansial.
 *
 * KONTRAK YANG DIPERTAHANKAN (jangan diubah):
 * - `estimatedTotal` (DraftTotals) = jumlah gabungan seluruh ember
 *   harga yang layak (verified + database + market + manual) — BUKAN
 *   ember tersendiri; JANGAN pernah menjumlahkannya lagi dengan
 *   ember-ember komponennya.
 * - Harga hilang tetap hilang (tidak pernah Rp0); sentinel 0 tanpa
 *   status = BELUM TERSEDIA; 0 eksplisit berstatus = harga Rp0 sah.
 * - Estimasi AI TIDAK PERNAH naik kelas menjadi harga resmi AHSP
 *   (persetujuan/verifikasi tidak mengubah asumsi menjadi resmi).
 * - Default proyek baru: overhead 0% / profit 0% / pajak opt-in;
 *   konfigurasi finansial historis TIDAK PERNAH ditulis ulang.
 * - Perilaku `volume = 1.0` TIDAK diubah.
 */

import { recalculateCostSummary, isHspPricedItem } from '../../engine/unifiedProjectEngine';
import {
  exportItemAmount,
  summarizeExportSections,
  exportTotalNote,
} from '../../export/priceIntegrity';
import {
  transferPriceStatus,
  transferVerificationStatus,
  isPriceValidForTotal,
} from './universalRab';
import type {
  DraftEngineeringAssessment,
  EngineeringRiskLevel,
} from './engineeringSpec';
import type { ProjectCostSummary, RabItem } from '../../types';

/* ------------------------------------------------------------------ */
/* §7.1 — Keadaan harga kanonis (7 keadaan)                            */
/* ------------------------------------------------------------------ */

/**
 * Tujuh keadaan harga kanonis. Pemetaan dari (priceStatus,
 * priceSourceKind) record — lihat `resolveCanonicalPriceState`:
 * - OFFICIAL_AHSP: harga resmi AHSP terverifikasi (kind OFFICIAL_AHSP
 *   + status transfer RESOLVED berbukti).
 * - VERIFIED_DATABASE: harga database terverifikasi (harga template /
 *   database EZRAB, bukan resmi, bukan estimasi).
 * - MARKET_REFERENCE: referensi pasar tersimpan (katalog, bukan live).
 * - AI_ESTIMATED: estimasi AI (status PRICE_ESTIMATED — termasuk
 *   plafon jujur S2: klaim RESOLVED tanpa bukti + status hilang).
 * - MANUAL: harga manual pengguna (PRICE_MANUAL / kind USER_MANUAL).
 * - CUSTOM_COMPOSED: harga dirakit dari komponen (kind
 *   CUSTOM_COMPOSED — deterministik dari komponen ter-resolve, BUKAN
 *   estimasi AI; status transfernya tetap ESTIMATED per S2, yang
 *   TIDAK diubah klasifikasi ini).
 * - UNAVAILABLE: tanpa harga yang dapat dipakai (PRICE_UNRESOLVED /
 *   sentinel 0 tanpa status / harga tidak valid).
 */
export type CanonicalPriceState =
  | 'OFFICIAL_AHSP'
  | 'VERIFIED_DATABASE'
  | 'MARKET_REFERENCE'
  | 'AI_ESTIMATED'
  | 'MANUAL'
  | 'CUSTOM_COMPOSED'
  | 'UNAVAILABLE';

/** Label kanonis per keadaan (§7.6 + label mapan yang sudah ada). */
export const PRICE_STATE_LABELS: Record<CanonicalPriceState, string> = {
  OFFICIAL_AHSP: 'RESMI AHSP',
  VERIFIED_DATABASE: 'HARGA DATABASE',
  MARKET_REFERENCE: 'REFERENSI PASAR',
  AI_ESTIMATED: 'ESTIMASI AI',
  MANUAL: 'MANUAL',
  CUSTOM_COMPOSED: 'Harga Komposisi Kustom',
  UNAVAILABLE: 'HARGA BELUM TERSEDIA',
};

/**
 * Penanda asumsi (§7.6): item AI_ESTIMATED membawa penanda ini di
 * samping label 'ESTIMASI AI' (ekspor menuliskannya 'ASUMSI — PERLU
 * VERIFIKASI' pada kolom sumber; label itemnya 'Estimasi AI').
 */
export const ASSUMPTION_LABEL = 'ASUMSI';

/** Mata uang kanonis — nilai tersimpan selalu rupiah (tampil saja yang diformat). */
export const CANONICAL_CURRENCY = 'IDR' as const;

/** Status asumsi harga: hanya estimasi AI yang ber-asumsi (berlabel). */
export type PriceAssumptionStatus = 'NONE' | 'LABELED_ASSUMPTION';

/** Status persetujuan estimasi (dari putusan review per item, P6). */
export type PriceApprovalStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_REVISION';

/** Medan minimal item yang dibutuhkan resolver (DraftItem/RabItem/RABItem kompatibel). */
export interface PriceStateInput {
  volume?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  priceStatus?: string | null;
  priceSourceKind?: string | null;
  priceSourceLabel?: string | null;
  priceSourceExplanation?: string | null;
  priceSourceName?: string | null;
  priceSourceDate?: string | null;
  priceSourceRegion?: string | null;
  verificationStatus?: string | null;
  verificationDate?: string | null;
  userDecisionStatus?: string | null;
  ahspMappingStatus?: string | null;
}

/** Hasil resolusi keadaan harga — SEMUA medan terisi eksplisit (tanpa default karangan). */
export interface CanonicalPriceResolution {
  state: CanonicalPriceState;
  /** Label kanonis keadaan (§7.6). */
  label: string;
  unitPrice: number | null;
  unit: string | null;
  currency: typeof CANONICAL_CURRENCY;
  /** Kind sumber apa adanya (null bila tidak tercatat — bukan ditebak). */
  source: string | null;
  sourceLabel: string | null;
  sourceDate: string | null;
  /** Baris provenance yang dapat diaudit (label + sumber + tanggal + verifikasi). */
  provenance: string;
  explanation: string | null;
  verificationStatus: string;
  assumptionStatus: PriceAssumptionStatus;
  approvalStatus: PriceApprovalStatus;
  /** True bila item ini masuk total (semua keadaan kecuali UNAVAILABLE). */
  priced: boolean;
  /** Jumlah baris (volume × harga, dibulatkan ke rupiah) — null bila tidak berharga. */
  amount: number | null;
}

/** Pembulatan deterministik ke rupiah (tanpa sub-satuan) — SATU definisi di modul ini. */
export function roundRupiah(n: number): number {
  return Math.round(n);
}

function approvalStatusOf(it: PriceStateInput, state: CanonicalPriceState): PriceApprovalStatus {
  const d = it.userDecisionStatus;
  if (d === 'DISETUJUI') return 'APPROVED';
  if (d === 'DITOLAK') return 'REJECTED';
  if (d === 'PERLU_REVISI') return 'NEEDS_REVISION';
  if (state === 'AI_ESTIMATED') return 'PENDING';
  return 'NOT_APPLICABLE';
}

/**
 * Resolusi keadaan harga kanonis (§7.1). Urutan aturan (dibaca dari atas):
 * 1. Tanpa harga valid → UNAVAILABLE (bukan Rp0).
 * 2. PRICE_MANUAL / kind USER_MANUAL → MANUAL.
 * 3. Kind CUSTOM_COMPOSED → CUSTOM_COMPOSED (deterministik dari
 *    komponen ter-resolve — BUKAN estimasi AI; status transfernya
 *    tetap ESTIMATED per S2 dan TIDAK diubah di sini).
 * 4. Kind EZRAB_ASSUMPTION → AI_ESTIMATED.
 * 5. Status transfer ESTIMATED (plafon jujur S2) → AI_ESTIMATED.
 * 6. Kind MARKET_REFERENCE → MARKET_REFERENCE.
 * 7. Kind OFFICIAL_AHSP → OFFICIAL_AHSP (status transfer RESOLVED
 *    sudah dijamin berbukti oleh transferPriceStatus).
 * 8. Selain itu (berharga, tanpa kind yang dikenali) → VERIFIED_DATABASE.
 *
 * Status transfer dihitung lewat `transferPriceStatus` (kontrak S2) —
 * klaim RESOLVED tanpa bukti TIDAK PERNAH menjadi OFFICIAL_AHSP di sini.
 */
export function resolveCanonicalPriceState(it: PriceStateInput): CanonicalPriceResolution {
  const transferStatus = transferPriceStatus(it);
  const priced = transferStatus !== 'PRICE_UNRESOLVED' && isPriceValidForTotal(it);
  let state: CanonicalPriceState;
  if (!priced) {
    state = 'UNAVAILABLE';
  } else if (transferStatus === 'PRICE_MANUAL' || it.priceSourceKind === 'USER_MANUAL') {
    state = 'MANUAL';
  } else if (it.priceSourceKind === 'CUSTOM_COMPOSED') {
    state = 'CUSTOM_COMPOSED';
  } else if (it.priceSourceKind === 'EZRAB_ASSUMPTION') {
    state = 'AI_ESTIMATED';
  } else if (transferStatus === 'PRICE_ESTIMATED') {
    state = 'AI_ESTIMATED';
  } else if (it.priceSourceKind === 'MARKET_REFERENCE') {
    state = 'MARKET_REFERENCE';
  } else if (it.priceSourceKind === 'OFFICIAL_AHSP') {
    state = 'OFFICIAL_AHSP';
  } else {
    state = 'VERIFIED_DATABASE';
  }
  const label = PRICE_STATE_LABELS[state];
  const unitPrice = priced && typeof it.unitPrice === 'number' ? it.unitPrice : null;
  const vol = typeof it.volume === 'number' && Number.isFinite(it.volume) ? it.volume : null;
  const amount =
    priced && unitPrice != null && vol != null ? roundRupiah(vol * unitPrice) : null;
  const verificationStatus = transferVerificationStatus(it, transferStatus);
  const provenanceParts = [label];
  if (it.priceSourceLabel) provenanceParts.push(it.priceSourceLabel);
  if (it.priceSourceName) provenanceParts.push(it.priceSourceName);
  if (it.priceSourceDate) provenanceParts.push(`berlaku ${it.priceSourceDate}`);
  if (it.priceSourceRegion) provenanceParts.push(it.priceSourceRegion);
  provenanceParts.push(verificationStatus);
  return {
    state,
    label,
    unitPrice,
    unit: (it.unit ?? null) || null,
    currency: CANONICAL_CURRENCY,
    source: it.priceSourceKind ?? null,
    sourceLabel: it.priceSourceLabel ?? null,
    sourceDate: it.priceSourceDate ?? null,
    provenance: provenanceParts.join(' · '),
    explanation: it.priceSourceExplanation ?? null,
    verificationStatus,
    assumptionStatus: state === 'AI_ESTIMATED' ? 'LABELED_ASSUMPTION' : 'NONE',
    approvalStatus: approvalStatusOf(it, state),
    priced,
    amount,
  };
}

/* ------------------------------------------------------------------ */
/* §7.3 — Rekonsiliasi finansial (sumber kebenaran tunggal)            */
/* ------------------------------------------------------------------ */

/** Ember per keadaan: hitungan + total (tiap item TEPAT SATU ember). */
export type PriceStateBuckets = Record<
  CanonicalPriceState,
  { count: number; total: number }
>;

export function emptyPriceStateBuckets(): PriceStateBuckets {
  return {
    OFFICIAL_AHSP: { count: 0, total: 0 },
    VERIFIED_DATABASE: { count: 0, total: 0 },
    MARKET_REFERENCE: { count: 0, total: 0 },
    AI_ESTIMATED: { count: 0, total: 0 },
    MANUAL: { count: 0, total: 0 },
    CUSTOM_COMPOSED: { count: 0, total: 0 },
    UNAVAILABLE: { count: 0, total: 0 },
  };
}

/** Item rekonsiliasi: keadaan harga + jumlah tersimpan (bila ada) + basis O&P. */
export interface ReconciliationItem extends PriceStateInput {
  id?: string;
  description?: string;
  /** Jumlah baris tersimpan (record factory) — menang atas vol × harga bila finite. */
  amount?: number | null;
  totalPrice?: number | null;
  priceCostBasis?: 'HSP' | 'DIRECT_COST';
}

/**
 * Jumlah baris satu item untuk rekonsiliasi — aturan yang SAMA dengan
 * gerbang ekspor (`exportItemAmount`): UNRESOLVED tidak pernah
 * berharga; jumlah tersimpan (amount, lalu totalPrice) dipakai MENTAH
 * (persis seperti `recalculateCostSummary` menjumlah `amount` — tanpa
 * pembulatan ulang, agar Σ ember == directCost); draft tanpa jumlah
 * tersimpan memakai vol × harga yang DIBULATKAN deterministik ke
 * rupiah (paritas factory: `SafeDecimalEngine.safeMultiply(..., 0)`).
 */
export function reconciliationLineAmount(it: ReconciliationItem): number | null {
  if (!isPriceValidForTotal(it)) return null;
  if (transferPriceStatus(it) === 'PRICE_UNRESOLVED') return null;
  if (typeof it.amount === 'number' && Number.isFinite(it.amount)) return it.amount;
  if (typeof it.totalPrice === 'number' && Number.isFinite(it.totalPrice)) return it.totalPrice;
  const vol = typeof it.volume === 'number' && Number.isFinite(it.volume) ? it.volume : null;
  const price = typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) ? it.unitPrice : null;
  if (vol == null || price == null) return null;
  return roundRupiah(vol * price);
}

export interface FinancialReconciliation {
  buckets: PriceStateBuckets;
  pricedCount: number;
  unpricedCount: number;
  /** Σ seluruh ember berharga — SAMA dengan estimatedTotal draft dan directCost engine. */
  pricedTotal: number;
  /** True bila ada item tanpa harga (total PARSIAL — bukan total final). */
  isPartial: boolean;
  /** Estimasi AI yang belum diputuskan (PENDING) — masuk total hanya lewat approval transfer. */
  pendingEstimateCount: number;
  /** Estimasi AI yang ditolak (REJECTED) — tetap tercatat, nilainya TIDAK pernah menimpa harga asli. */
  rejectedEstimateCount: number;
  /** Jumlah biaya langsung item ber-basis HSP (sudah mengandung O&P — dikeluarkan dari basis O&P). */
  hspExemptDirect: number;
  /** Ringkasan kanonis SEGAR (recalculateCostSummary atas item yang sama). */
  summary: ProjectCostSummary;
  /** True bila ringkasan tersimpan (bila diberikan) SAMA PERSIS dengan rekalkulasi segar. */
  storedSummaryAgrees: boolean;
  summaryDiscrepancies: string[];
  warnings: string[];
}

/** Medan ringkasan yang dibandingkan antara tersimpan vs rekalkulasi segar. */
const SUMMARY_COMPARE_FIELDS: Array<keyof ProjectCostSummary> = [
  'directCost',
  'overheadAmount',
  'profitAmount',
  'contingencyAmount',
  'directorMarkupTotal',
  'subtotalBeforeTax',
  'taxAmount',
  'pphAmount',
  'grandTotal',
  'unresolvedItems',
];

/**
 * Rekonsiliasi finansial proyek (§7.3) — SATU pass atas item:
 * - tiap item masuk TEPAT SATU ember keadaan (tidak ada yang dihitung
 *   dua kali, tidak ada yang hilang);
 * - harga hilang dikecualikan dari total (BUKAN Rp0) + total ditandai PARSIAL;
 * - estimasi AI dihitung per status persetujuannya (PENDING/APPROVED/
 *   REJECTED dilaporkan terpisah — ketiganya MASUK total seperti
 *   RESOLVED karena status transfernya ESTIMATED; yang membedakan
 *   hanyalah label + kewajiban review, BUKAN angka);
 * - ringkasan dihitung ulang lewat `recalculateCostSummary` (mesin
 *   kanonis) atas item yang SAMA — bila ringkasan tersimpan diberikan,
 *   keduanya dibandingkan medan-per-medan (sumber kebenaran tunggal:
 *   selisih apa pun adalah diskrepansi, bukan pembulatan).
 *
 * `config` = konfigurasi finansial proyek (overhead/profit/pajak);
 * absen = default proyek baru (0%/0%, pajak mati — keputusan owner).
 * Konfigurasi historis yang diberikan DITERUSKAN apa adanya —
 * fungsi ini TIDAK PERNAH menulis ulang persen tersimpan.
 */
export function reconcileProjectFinancials(
  items: ReconciliationItem[],
  config?: Partial<ProjectCostSummary>,
  storedSummary?: ProjectCostSummary | null,
): FinancialReconciliation {
  const buckets = emptyPriceStateBuckets();
  let pricedCount = 0;
  let unpricedCount = 0;
  let pricedTotal = 0;
  let pendingEstimateCount = 0;
  let rejectedEstimateCount = 0;
  let hspExemptDirect = 0;
  const unpricedDescriptions: string[] = [];
  const engineItems: RabItem[] = [];
  for (const it of items) {
    const res = resolveCanonicalPriceState(it);
    const amt = reconciliationLineAmount(it);
    if (!res.priced || amt == null) {
      buckets.UNAVAILABLE.count += 1;
      unpricedCount += 1;
      if (it.description) unpricedDescriptions.push(it.description);
      engineItems.push({ ...(it as unknown as RabItem), amount: 0, priceStatus: 'PRICE_UNRESOLVED' });
      continue;
    }
    buckets[res.state].count += 1;
    buckets[res.state].total += amt;
    pricedCount += 1;
    pricedTotal += amt;
    if (res.state === 'AI_ESTIMATED') {
      if (res.approvalStatus === 'PENDING') pendingEstimateCount += 1;
      if (res.approvalStatus === 'REJECTED') rejectedEstimateCount += 1;
    }
    if (isHspPricedItem(it)) hspExemptDirect += amt;
    engineItems.push({ ...(it as unknown as RabItem), amount: amt });
  }
  const summary = recalculateCostSummary(engineItems, config);
  const warnings: string[] = [];
  const isPartial = unpricedCount > 0;
  if (isPartial) {
    warnings.push(
      `TOTAL PARSIAL — ${unpricedCount} item belum memiliki harga dan tidak termasuk dalam total` +
        (unpricedDescriptions.length > 0 ? `: ${unpricedDescriptions.slice(0, 5).join('; ')}${unpricedDescriptions.length > 5 ? `; …dan ${unpricedDescriptions.length - 5} item lainnya` : ''}` : ''),
    );
  }
  if (pendingEstimateCount > 0) {
    warnings.push(
      `${pendingEstimateCount} estimasi AI belum diputuskan (menunggu review) — nilainya masuk total sebagai ESTIMASI AI, bukan harga resmi.`,
    );
  }
  // Invarian internal: Σ ember berharga HARUS SAMA dengan directCost
  // mesin kanonis (keduanya menjumlah jumlah baris yang sama). Bila
  // tidak sama, ada bug penghitungan — laporkan, jangan diamkan.
  if (pricedTotal !== summary.directCost) {
    warnings.push(
      `DISKREPANSI INTERNAL — Σ ember berharga (${pricedTotal}) ≠ directCost kanonis (${summary.directCost}).`,
    );
  }
  const summaryDiscrepancies: string[] = [];
  let storedSummaryAgrees = true;
  if (storedSummary) {
    for (const f of SUMMARY_COMPARE_FIELDS) {
      if ((storedSummary as unknown as Record<string, unknown>)[f] !== (summary as unknown as Record<string, unknown>)[f]) {
        storedSummaryAgrees = false;
        summaryDiscrepancies.push(
          `${f}: tersimpan ${String((storedSummary as unknown as Record<string, unknown>)[f])} ≠ rekalkulasi kanonis ${String((summary as unknown as Record<string, unknown>)[f])}`,
        );
      }
    }
  }
  return {
    buckets,
    pricedCount,
    unpricedCount,
    pricedTotal,
    isPartial,
    pendingEstimateCount,
    rejectedEstimateCount,
    hspExemptDirect,
    summary,
    storedSummaryAgrees,
    summaryDiscrepancies,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* §7.3/§7.5 — Rekonsiliasi subtotal cakupan                           */
/* ------------------------------------------------------------------ */

export interface ScopeSubtotalInput {
  scopeId: string;
  label: string;
  subtotal: number;
  itemCount: number;
  unpricedCount: number;
}

export interface ScopeReconciliation {
  agrees: boolean;
  sumOfScopes: number;
  projectTotal: number;
  /** Selisih (Σ cakupan − total proyek) — 0 bila rekonsiliasi. */
  difference: number;
  scopeCount: number;
  itemCount: number;
  unpricedCount: number;
}

/**
 * Σ subtotal cakupan HARUS SAMA dengan total proyek (pembulatan
 * deterministik ke rupiah — kedua sisi dibulatkan dulu agar debu
 * float tidak pernah dilaporkan sebagai selisih).
 */
export function reconcileScopeSubtotals(
  scopes: ScopeSubtotalInput[],
  projectTotal: number,
): ScopeReconciliation {
  let sum = 0;
  let itemCount = 0;
  let unpricedCount = 0;
  for (const s of scopes) {
    sum += s.subtotal;
    itemCount += s.itemCount;
    unpricedCount += s.unpricedCount;
  }
  const roundedSum = roundRupiah(sum);
  const roundedTotal = roundRupiah(projectTotal);
  return {
    agrees: roundedSum === roundedTotal,
    sumOfScopes: sum,
    projectTotal,
    difference: sum - projectTotal,
    scopeCount: scopes.length,
    itemCount,
    unpricedCount,
  };
}

/* ------------------------------------------------------------------ */
/* §7.2 — Ringkasan persetujuan estimasi AI (laporan, bukan gerbang)   */
/* ------------------------------------------------------------------ */

export interface EstimateApprovalSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  needsRevision: number;
  /** Σ jumlah baris estimasi per status persetujuan. */
  totalsByStatus: Record<'APPROVED' | 'PENDING' | 'REJECTED' | 'NEEDS_REVISION', number>;
  /** Deskripsi estimasi yang DITOLAK (nilainya tidak menimpa harga asli — lihat §7.2(10)). */
  rejectedDescriptions: string[];
}

/**
 * Status persetujuan estimasi AI per item — LAPORAN untuk pratinjau /
 * audit. Gerbang persetujuan transfernya sendiri adalah preview +
 * binding G1/W11 (draft-level, terikat sidik isi + TTL) — fungsi ini
 * TIDAK memblokir transfer apa pun.
 */
export function summarizeEstimateApprovals(items: ReconciliationItem[]): EstimateApprovalSummary {
  const out: EstimateApprovalSummary = {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    needsRevision: 0,
    totalsByStatus: { APPROVED: 0, PENDING: 0, REJECTED: 0, NEEDS_REVISION: 0 },
    rejectedDescriptions: [],
  };
  for (const it of items) {
    const res = resolveCanonicalPriceState(it);
    if (res.state !== 'AI_ESTIMATED') continue;
    out.total += 1;
    const amt = res.amount ?? 0;
    switch (res.approvalStatus) {
      case 'APPROVED':
        out.approved += 1;
        out.totalsByStatus.APPROVED += amt;
        break;
      case 'REJECTED':
        out.rejected += 1;
        out.totalsByStatus.REJECTED += amt;
        if (it.description) out.rejectedDescriptions.push(it.description);
        break;
      case 'NEEDS_REVISION':
        out.needsRevision += 1;
        out.totalsByStatus.NEEDS_REVISION += amt;
        break;
      default:
        out.pending += 1;
        out.totalsByStatus.PENDING += amt;
        break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* §8 (handoff Batch 3) — Gerbang transfer risiko teknik               */
/* ------------------------------------------------------------------ */

/**
 * Catatan review teknik oleh perencana — SATU-SATUNYA bukti yang
 * membuka gerbang transfer draft HIGH/CRITICAL. Terikat pada keadaan
 * draft PERSIS yang ditinjau (versi + sidik isi — sidik yang SAMA
 * dengan binding approval transfer G1, `draftFingerprint` di
 * draftPersistence.ts): revisi apa pun sesudah review membuat catatan
 * ini basi dan gerbang menutup lagi.
 *
 * CATATAN KETIADAAN (evidence, bukan asumsi): sampai Batch 4, TIDAK
 * ADA aksi UI / field draft / record persistence apa pun yang
 * menghasilkan catatan ini (`decideDraftItemAssumption` adalah
 * putusan per item HARGA, bukan review teknik draft; `verifyDraftItem
 * Price` memverifikasi harga, bukan desain). Karena itu gerbang ini
 * SENGAJA TIDAK di-wire ke `validateTransfer` / `buildPushPayload`:
 * pemblokiran tanpa jalan keluar akan membekukan transfer draft HIGH
 * yang sah — mis. dinding penahan 100 m tanpa tinggi yang disebut
 * (HIGH by design, B3 §6.2) termasuk draft campuran W13 yang
 * transfernya di-pin matriks. Penegakan pemblokiran adalah wilayah
 * Batch 5 (UI review + persistensi catatan ini); modul ini
 * menyediakan penilaiannya (pure, teruji) + pratinjau transfer
 * sudah membawa `engineeringRisk` (advisory).
 */
export interface EngineeringReviewRecord {
  /** ISO timestamp review. */
  reviewedAt: string;
  reviewedBy?: string | null;
  /** UniversalDraft.version saat review dilakukan. */
  draftVersion: number;
  /** draftFingerprint(draft) saat review dilakukan. */
  draftFingerprint: string;
}

export interface EngineeringGateCheck {
  allowed: boolean;
  /** True bila penilaian ini MEWAJIBKAN review (level HIGH/CRITICAL + humanReviewRequired). */
  requiresReview: boolean;
  level: EngineeringRiskLevel;
  reasons: string[];
  /** Catatan review yang dipakai membuka gerbang (bila ada yang sah). */
  reviewApplied?: { reviewedAt: string; reviewedBy: string | null };
}

/**
 * Gerbang transfer risiko teknik (murni — tanpa membaca draft/storage):
 * - LOW/MODERATE → diizinkan, tanpa review.
 * - HIGH/CRITICAL → WAJIB ada catatan review yang terikat pada versi +
 *   sidik draft SAAT INI; tanpa itu (atau catatan basi — versi/sidik
 *   berbeda) → DITOLAK dengan alasan per-part yang dapat
 *   ditindaklanjuti.
 *
 * Syaratnya adalah LEVEL (HIGH/CRITICAL), BUKAN semata
 * `humanReviewRequired` — cabang NEEDS_CLARIFICATION di
 * classifyEngineeringRisk mengembalikan HIGH dengan
 * humanReviewRequired=false ("minta klarifikasi, bukan review"),
 * tetapi draft yang SUDAH ADA dan hendak ditransfer tetap tidak
 * boleh lolos tanpa pengesahan perencana: basis hitungnya belum ada.
 * Catatan review yang sah adalah pengesahan perencana atas keadaan
 * draft itu (termasuk basisnya) — itulah yang membuka gerbang.
 * Gerbang ini TIDAK menilai teknik — ia hanya memastikan review
 * manusia yang diwajibkan B3 benar-benar ada dan berlaku untuk
 * keadaan draft yang hendak ditransfer.
 */
export function checkEngineeringTransferGate(
  assessment: DraftEngineeringAssessment,
  review: EngineeringReviewRecord | null,
  current: { version: number; fingerprint: string },
): EngineeringGateCheck {
  const requiresReview =
    assessment.level === 'HIGH' ||
    assessment.level === 'CRITICAL' ||
    assessment.humanReviewRequired;
  if (!requiresReview) {
    return { allowed: true, requiresReview: false, level: assessment.level, reasons: [] };
  }
  const partReasons = assessment.perPart
    .filter((p) => p.level === 'HIGH' || p.level === 'CRITICAL')
    .map((p) => `[${p.scopeLabel}] risiko ${p.level}${p.warningText ? ` — ${p.warningText}` : ''}`);
  if (!review) {
    return {
      allowed: false,
      requiresReview: true,
      level: assessment.level,
      reasons: [
        `Draft berisiko teknik ${assessment.level} — wajib review perencana sebelum nilainya ditransfer.`,
        ...partReasons,
      ],
    };
  }
  if (review.draftVersion !== current.version || review.draftFingerprint !== current.fingerprint) {
    return {
      allowed: false,
      requiresReview: true,
      level: assessment.level,
      reasons: [
        `Review teknik tercatat untuk keadaan draft yang berbeda (versi ${review.draftVersion}, sidik berbeda) — draft berubah sesudah review; minta review ulang sebelum transfer.`,
        ...partReasons,
      ],
    };
  }
  return {
    allowed: true,
    requiresReview: true,
    level: assessment.level,
    reasons: [],
    reviewApplied: { reviewedAt: review.reviewedAt, reviewedBy: review.reviewedBy ?? null },
  };
}

/* ------------------------------------------------------------------ */
/* §7.6 — Integritas ekspor (Excel/PDF)                                */
/* ------------------------------------------------------------------ */

export interface ExportSectionInput {
  code: string;
  name: string;
  items: ReconciliationItem[];
}

export interface ExportIntegrityReport {
  itemCount: number;
  pricedCount: number;
  unpricedCount: number;
  pricedTotal: number;
  buckets: PriceStateBuckets;
  /** True bila ada item tanpa harga (atau berflag parsial) — total PARSIAL. */
  isPartial: boolean;
  /** True bila total mencampur sumber harga (bukan total resmi murni). */
  isMixed: boolean;
  /** Label penjelas total (exportTotalNote — PARSIAL/campuran). */
  totalNote: string;
  /** Peringatan yang WAJIB tampil di ekspor (harga hilang / total parsial / estimasi menunggu verifikasi). */
  warnings: string[];
  /** Item yang kehilangan medan wajib ekspor (deskripsi/satuan/volume). */
  missingFields: string[];
  /** Estimasi AI tanpa label/penjelasan asumsi apa pun (provenance hilang di ekspor). */
  unlabeledEstimates: string[];
  sections: Array<{
    code: string;
    name: string;
    itemCount: number;
    subtotal: number;
    unpricedCount: number;
  }>;
  /** True bila Σ seksi == directCost ringkasan (rekap konsisten dengan rincian). */
  sectionsAgreeWithSummary: boolean;
  discrepancies: string[];
  /** True bila dokumen BOLEH diklaim sebagai anggaran final (tidak parsial). */
  mayClaimFinal: boolean;
  /** True bila dokumen BOLEH diklaim sepenuhnya resmi (semua item berharga resmi AHSP). */
  mayClaimFullyOfficial: boolean;
}

/**
 * Laporan integritas ekspor (§7.6) atas seksi snapshot (hasil
 * `normalizeSections` → `freezeRabSnapshot`) + ringkasan proyek:
 * - tiap item: deskripsi/satuan/kuantitas/harga/subtotal + provenance
 *   + label asumsi (estimasi AI tanpa label apa pun dilaporkan);
 * - harga hilang → peringatan wajib + total PARSIAL (tidak pernah
 *   tampil sebagai anggaran final);
 * - struktur cakupan (seksi) dipertahankan + Σ subtotal seksi ==
 *   directCost ringkasan;
 * - `mayClaimFinal` / `mayClaimFullyOfficial` adalah gerbang klaim:
 *   RAB tak lengkap TIDAK BOLEH tampil sebagai anggaran final, dan
 *   campuran sumber TIDAK BOLEH tampil sebagai resmi murni.
 *
 * Laporan ini memverifikasi DATA ekspor, bukan merender workbook —
 * render workbook sudah di-pin suite S2/S4/P5.
 */
export function buildExportIntegrityReport(
  sections: ExportSectionInput[],
  costSummary: ProjectCostSummary,
): ExportIntegrityReport {
  const exportSummary = summarizeExportSections(
    sections.map((s) => ({ code: s.code, name: s.name, items: s.items })),
  );
  const buckets = emptyPriceStateBuckets();
  const warnings: string[] = [];
  const missingFields: string[] = [];
  const unlabeledEstimates: string[] = [];
  const sectionRows: ExportIntegrityReport['sections'] = [];
  let aiEstimatedCount = 0;
  let pendingEstimateCount = 0;
  for (const sec of sections) {
    let subtotal = 0;
    let secUnpriced = 0;
    for (const it of sec.items) {
      const res = resolveCanonicalPriceState(it);
      const amt = exportItemAmount(it);
      if (amt != null) {
        buckets[res.state].count += 1;
        buckets[res.state].total += amt;
        subtotal += amt;
      } else {
        buckets.UNAVAILABLE.count += 1;
        secUnpriced += 1;
      }
      if (res.state === 'AI_ESTIMATED') {
        aiEstimatedCount += 1;
        if (res.approvalStatus === 'PENDING') pendingEstimateCount += 1;
        const labeled =
          it.priceSourceKind === 'EZRAB_ASSUMPTION' ||
          (typeof it.priceSourceLabel === 'string' && it.priceSourceLabel.trim() !== '') ||
          (typeof it.priceSourceExplanation === 'string' && it.priceSourceExplanation.trim() !== '');
        if (!labeled) {
          unlabeledEstimates.push(
            (it as { description?: string }).description ?? it.id ?? '(tanpa deskripsi)',
          );
        }
      }
      const desc = (it as { description?: string }).description;
      if (!desc || desc.trim() === '') missingFields.push(`[${sec.code}] item tanpa deskripsi`);
      if (!it.unit || String(it.unit).trim() === '') {
        missingFields.push(`[${sec.code}] "${desc ?? it.id ?? '?'}" tanpa satuan`);
      }
      if (typeof it.volume !== 'number' || !Number.isFinite(it.volume)) {
        missingFields.push(`[${sec.code}] "${desc ?? it.id ?? '?'}" tanpa volume valid`);
      }
    }
    sectionRows.push({
      code: sec.code,
      name: sec.name,
      itemCount: sec.items.length,
      subtotal,
      unpricedCount: secUnpriced,
    });
  }
  const totalNote = exportTotalNote(exportSummary);
  const isPartial = exportSummary.isPartial;
  if (exportSummary.unpricedCount > 0) {
    warnings.push(
      `PERINGATAN: ${exportSummary.unpricedCount} item belum memiliki harga (HARGA BELUM TERSEDIA) dan tidak termasuk dalam total. Estimasi ini belum final.`,
    );
  }
  if (exportSummary.partialItemCount > 0) {
    warnings.push(
      `PERINGATAN: ${exportSummary.partialItemCount} item memiliki rincian komponen yang belum lengkap (${exportSummary.unresolvedComponentTotal} komponen belum berharga).`,
    );
  }
  if (pendingEstimateCount > 0) {
    warnings.push(
      `${pendingEstimateCount} estimasi AI menunggu verifikasi — bukan harga resmi AHSP.`,
    );
  }
  if (unlabeledEstimates.length > 0) {
    warnings.push(
      `${unlabeledEstimates.length} estimasi AI tanpa label asumsi di ekspor — provenance hilang.`,
    );
  }
  const sectionsTotal = sectionRows.reduce((s, r) => s + r.subtotal, 0);
  const discrepancies: string[] = [];
  const sectionsAgreeWithSummary = roundRupiah(sectionsTotal) === roundRupiah(costSummary.directCost);
  if (!sectionsAgreeWithSummary) {
    discrepancies.push(
      `Σ subtotal seksi (${sectionsTotal}) ≠ directCost ringkasan (${costSummary.directCost})`,
    );
  }
  if (roundRupiah(exportSummary.pricedTotal) !== roundRupiah(sectionsTotal)) {
    discrepancies.push(
      `pricedTotal ekspor (${exportSummary.pricedTotal}) ≠ Σ subtotal seksi (${sectionsTotal})`,
    );
  }
  const mayClaimFinal = !isPartial;
  const mayClaimFullyOfficial =
    !isPartial &&
    exportSummary.pricedCount > 0 &&
    roundRupiah(buckets.OFFICIAL_AHSP.total) === roundRupiah(exportSummary.pricedTotal) &&
    aiEstimatedCount === 0;
  return {
    itemCount: exportSummary.pricedCount + exportSummary.unpricedCount,
    pricedCount: exportSummary.pricedCount,
    unpricedCount: exportSummary.unpricedCount,
    pricedTotal: exportSummary.pricedTotal,
    buckets,
    isPartial,
    isMixed: exportSummary.isMixed,
    totalNote,
    warnings,
    missingFields,
    unlabeledEstimates,
    sections: sectionRows,
    sectionsAgreeWithSummary,
    discrepancies,
    mayClaimFinal,
    mayClaimFullyOfficial,
  };
}
