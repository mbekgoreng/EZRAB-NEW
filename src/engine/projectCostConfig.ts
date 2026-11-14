/**
 * projectCostConfig — SATU resolver konfigurasi biaya proyek (Batch C, D-77).
 *
 * AKAR MASALAH (audit D-77): tiga permukaan membaca konfigurasi overhead/
 * profit/pajak dari tiga sumber berbeda dan mendapat tiga jawaban untuk
 * proyek yang sama — field proyek (`profitPercent` undefined di demo),
 * `costSummary` (profit 5% hanya di sini), dan default global (10%/10%).
 * Rekapitulasi memakai aturan field → costSummary; Settings memakai
 * field → 0; writer (`recalculateProjectSummary`) memakai field saja
 * untuk overhead. Modul ini adalah SATU-SATUNYA pernyataan aturan
 * resolusi itu; semua pembaca (Rekap, kartu Info Proyek, Settings,
 * skenario, rekonsiliasi, Finance, quote template) WAJIB memakainya.
 *
 * ATURAN (meniru `rekapSummary.ts` Batch 4, sumber yang terbukti benar):
 *   overhead/profit/PPN/PPh  = field proyek → costSummary → default mesin
 *   kontingensi/markup       = costSummary saja (tidak ada field proyek)
 *   flag PPN/PPh             = field proyek, strict `=== true` (opt-in)
 *   default mesin            = overhead 0% / profit 0% (keputusan owner
 *                              2026-11-08), PPN 11%, PPh 0%.
 *
 * CATATAN KESELAMATAN:
 * - Resolver TIDAK PERNAH menulis: ia hanya membaca. Nilai historis tidak
 *   diubah; proyek baru tetap 0%/0% karena tidak punya field maupun
 *   ringkasan yang terisi.
 * - Nilai non-finite (NaN/Infinity) diperlakukan sebagai "tidak ada" dan
 *   jatuh ke sumber berikutnya — tidak pernah diteruskan ke mesin sebagai
 *   NaN (aturan lama `typeof === 'number'` meloloskan NaN).
 * - Writer (`recalculateProjectSummary` di ProjectContext) SENGAJA tidak
 *   diubah di sini: aturan overhead field-saja-nya didokumentasikan
 *   sebagai keputusan sadar (jangan membangkitkan default 5% lama dari
 *   ringkasan). Bila owner memutuskan penyatuan (OD-08), writer-lah yang
 *   harus memakai resolver ini.
 *
 * Modul ini juga memuat aturan jumlah kanonis per item
 * (`canonicalItemAmount`) — dipakai Finance & kartu Info Proyek agar tidak
 * ada lagi rumus Σ volume×harga paralel (D-23).
 */
import type { Project, ProjectCostSummary } from '../types';
import { SafeDecimalEngine } from './safeDecimalEngine';

/** Medan minimal yang dibaca resolver (Project atau record mirip-proyek). */
export interface ProjectCostConfigInput {
  overheadPercent?: number | null;
  profitPercent?: number | null;
  ppnPercent?: number | null;
  pphPercent?: number | null;
  ppnEnabled?: boolean;
  pphEnabled?: boolean;
  costSummary?: Partial<ProjectCostSummary> | null;
}

/** Konfigurasi biaya yang sudah terselesaikan penuh — siap diteruskan ke
 *  `UnifiedProjectEngine.recalculateCostSummary` apa adanya. */
export interface ResolvedProjectCostConfig {
  overheadPercent: number;
  profitPercent: number;
  taxPercent: number;
  pphPercent: number;
  ppnEnabled: boolean;
  pphEnabled: boolean;
  contingencyPercent: number;
  directorMarkupPercent: number;
}

function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function resolveProjectCostConfig(
  project: ProjectCostConfigInput | null | undefined
): ResolvedProjectCostConfig {
  const proj = (project ?? {}) as ProjectCostConfigInput;
  const cs = proj.costSummary ?? {};
  return {
    overheadPercent:
      finiteNumber(proj.overheadPercent) ?? finiteNumber(cs.overheadPercent) ?? 0,
    profitPercent:
      finiteNumber(proj.profitPercent) ?? finiteNumber(cs.profitPercent) ?? 0,
    taxPercent:
      finiteNumber(proj.ppnPercent) ?? finiteNumber(cs.taxPercent) ?? 11,
    pphPercent:
      finiteNumber(proj.pphPercent) ?? finiteNumber(cs.pphPercent) ?? 0,
    ppnEnabled: proj.ppnEnabled === true,
    pphEnabled: proj.pphEnabled === true,
    contingencyPercent: finiteNumber(cs.contingencyPercent) ?? 0,
    directorMarkupPercent: finiteNumber(cs.directorMarkupPercent) ?? 0,
  };
}

/** Enam nilai yang diedit form Pengaturan proyek, terselesaikan kanonis.
 *  Dipakai inisialisasi + sinkronisasi form (NEW-08) agar form menampilkan
 *  nilai yang sama dengan Rekap — bukan `field ?? 0` yang menghilangkan
 *  profit 5% demo. `ppnPercent` di sini = tarif PPN terselesaikan
 *  (field `ppnPercent` proyek atau `taxPercent` ringkasan — dua nama untuk
 *  satu tarif yang sama). */
export function resolveProjectFormConfig(
  project: ProjectCostConfigInput | null | undefined
): {
  overheadPercent: number;
  profitPercent: number;
  ppnPercent: number;
  pphPercent: number;
  ppnEnabled: boolean;
  pphEnabled: boolean;
} {
  const c = resolveProjectCostConfig(project);
  return {
    overheadPercent: c.overheadPercent,
    profitPercent: c.profitPercent,
    ppnPercent: c.taxPercent,
    pphPercent: c.pphPercent,
    ppnEnabled: c.ppnEnabled,
    pphEnabled: c.pphEnabled,
  };
}

/** Medan minimal yang dibaca aturan jumlah kanonis. */
export interface CanonicalAmountItemInput {
  amount?: number | null;
  volume?: number | null;
  unitPrice?: number | null;
  priceStatus?: string | null;
}

/**
 * Jumlah kanonis SATU item RAB — aturan yang sama dengan
 * `UnifiedProjectEngine.recalculateCostSummary` untuk directCost, ditambah
 * fallback untuk item tanpa `amount` tersimpan:
 *
 * - `PRICE_UNRESOLVED` → 0 (tidak pernah masuk total sebagai Rp0 valid
 *   yang disamarkan; item tetap dikecualikan seperti di mesin).
 * - `amount` tersimpan → dipakai apa adanya (jumlah per-baris yang sudah
 *   dibulatkan saat tulis — inilah yang membuat Finance lama menyimpang
 *   Rp2: ia menghitung ulang Σ volume×harga mentah dan membulatkan sekali
 *   di akhir, D-23).
 * - Tanpa `amount` (data lama / item uji) → aturan factory
 *   (`safeMultiply(volume, unitPrice, 0)` — jumlah yang akan dihitung
 *   `createRabItemRecord` bila item itu dibuat ulang).
 */
export function canonicalItemAmount(item: CanonicalAmountItemInput): number {
  if (item.priceStatus === 'PRICE_UNRESOLVED') return 0;
  if (item.amount != null) return Number(item.amount) || 0;
  return SafeDecimalEngine.safeMultiply(
    Number(item.volume) || 0,
    Number(item.unitPrice) || 0,
    0
  );
}

/** Biaya langsung kanonis = Σ `canonicalItemAmount` (sama dengan
 *  `costSummary.directCost` mesin untuk item yang punya `amount`). */
export function canonicalDirectCost(
  items: readonly CanonicalAmountItemInput[]
): number {
  return items.reduce((sum, item) => sum + canonicalItemAmount(item), 0);
}

/** Type guard ringan: apakah record ini membawa konfigurasi finansial
 *  eksplisit di field proyek (dipakai tes + diagnostik, bukan logika baca). */
export function hasExplicitProjectCostFields(
  project: ProjectCostConfigInput | null | undefined
): boolean {
  const proj = (project ?? {}) as ProjectCostConfigInput;
  return (
    finiteNumber(proj.overheadPercent) !== undefined ||
    finiteNumber(proj.profitPercent) !== undefined
  );
}

export type { Project, ProjectCostSummary };
