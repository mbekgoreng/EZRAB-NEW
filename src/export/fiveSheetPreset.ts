/**
 * P5 FULL REPAIR (2026-11-13) — Preset workbook RAB 5 sheet.
 *
 * Builder preset yang DIIMPOR mesin ekspor yang ada (`excelExportEngine`),
 * BUKAN exporter keempat: tidak ada pustaka Excel ketiga, tidak ada
 * penggantian nama sheet 16-sheet, dan semua konsumen ekspor lama
 * (menu Laporan, modal Export Package, view RAB) tidak berubah perilakunya
 * kecuali bila preset ini dipilih secara eksplisit.
 *
 * Lima sheet (nama ditetapkan):
 *   01_RINGKASAN_RAB   — identitas, tangga biaya kanonis, kesiapan, asumsi
 *   02_RAB_DETAIL      — WBS, item, Status Verifikasi + Keterangan +
 *                        kolom M TRACEABILITAS WBS (S6 §6, P5-O3: node
 *                        paket + status CONFIRMED/PROVISIONAL/UNMAPPED
 *                        dari snapshot — tanpa klasifikasi ulang)
 *   03_AHSP            — analisa harga satuan, WAJIB project-bound
 *   04_DETAIL_VOLUME   — formula/dimensi/bukti, jujur bila tidak ada data
 *   05_SUMBER_ASUMSI   — sumber harga, provenance, tanggal verifikasi +
 *                        status keputusan user (K-A6: 'tidak tercatat'
 *                        bila tidak ada datanya — tidak pernah dikarang)
 *
 * INTEGRITAS (kontrak):
 * - Ekspor membaca SNAPSHOT beku (deep copy seksi + ringkasan finansial
 *   kanonis + metadata revisi), bukan state live. Mutasi proyek sesudah
 *   snapshot tidak mengubah workbook.
 * - Snapshot diikat (projectId, revision, hash konten) — tercantum di
 *   Sheet 1 + defined name workbook `EZRAB_SNAPSHOT_HASH`.
 * - Tangga biaya = ringkasan kanonis `computeCostSummaryFromSections`
 *   (versi ekspor dari mesin kanonis `recalculateCostSummary`, selaras
 *   menurut P3B): langsung → O&P → pajak → grand, ditampilkan eksplisit.
 *   Komponen O&P/pajak ditulis sebagai NILAI kanonis snapshot, bukan
 *   formula sel — basis kanonisnya (pengecualian HSP, basis pajak
 *   proporsional) tidak dapat dinyatakan sebagai formula sel sederhana,
 *   dan formula `direct × %` akan SALAH pada proyek ber-item HSP.
 *   Hanya subtotal-sebelum-pajak & grand total yang memakai formula
 *   live (SUM atas sel tangga), sehingga recalc tetap eksak.
 * - Harga unresolved tetap jujur: 'HARGA BELUM TERSEDIA' / jumlah '–' /
 *   total PARSIAL (pola priceIntegrity yang sudah ada).
 * - Aktor tanpa identitas dinyatakan jujur 'demo/anonim' (pola
 *   ExportHistoryRecord Document Engine: id/dokumen/format/nama/revisi/
 *   waktu/status — tanpa karang aktor).
 * - Idempotent: hash konten deterministik atas isi snapshot (tanpa
 *   createdAt); ekspor ulang atas snapshot yang sama menghasilkan byte
 *   yang sama (tanggal workbook mengikuti snapshot, bukan jam ekspor).
 * - TOLERANSI PEMBULATAN (keputusan owner 2026-11-13: "terima + toleransi"):
 *   grand Sheet 2 (formula live) dapat berbeda dari grand Sheet 1 (komponen
 *   tersimpan yang dibulatkan) sebesar akumulasi pembulatan per baris.
 *   Toleransi yang dinyatakan: Rp1 per baris item — selisih dalam
 *   toleransi dinyatakan di workbook (Sheet 1 + Sheet 5) dan bukan
 *   kesalahan; selisih di luar toleransi tetap gagal verifikasi.
 *   Lihat ROUNDING_TOLERANCE_PER_ROW_IDR di bawah.
 *
 * KEJUJURAN SHEET 3: modul ini TIDAK mengimpor MASTER_AHSP_DATABASE.
 * Analisa hanya dibangun dari `ahspSnapshot`/`ahspCode` item proyek.
 * Perilaku lama `slice(0, 10)` (10 item pertama database master) TIDAK
 * dipakai di preset ini. Sheet legacy `08_AHSP` pada sistem 16-sheet
 * SENGAJA tidak diubah (format lama dipertahankan utuh — lihat
 * LAPORAN-P5.md; mengubahnya butuh keputusan owner).
 */

import ExcelJS from 'exceljs';
import { wbsNodeLabel, isWbsMappingStatus } from '../ai-tools/ezrab-ai/wbsArtifact';
import type { Company, Project, ProjectCostSummary, RABItem, RABSection } from '../types';
import type { ExportSectionsSummary } from './priceIntegrity';
import { exportItemAmount, isExportPriceValid } from './priceIntegrity';
import {
  BORDER_THIN_LIGHT,
  BORDER_THIN_MEDIUM,
  EXCEL_COLORS,
  FONT_HIERARCHY,
  NUMBER_FORMATS,
  applyPrintSetup,
  applySignatureBlock,
  terbilangIndo,
} from './exportDesignSystem';

/** ID preset — anggota `ExportPresetId` sejak P6 (P5-O6 menutup
 *  cast P5: `src/export/types.ts` kini memuat 'FIVE_SHEET_RAB').
 *  Mesin mencegat nilai ini sebelum pemilihan sheet 16-sheet. */
export const FIVE_SHEET_PRESET_ID = 'FIVE_SHEET_RAB' as const;

export const FIVE_SHEET_NAMES = {
  summary: '01_RINGKASAN_RAB',
  detail: '02_RAB_DETAIL',
  ahsp: '03_AHSP',
  volume: '04_DETAIL_VOLUME',
  sources: '05_SUMBER_ASUMSI',
} as const;

export const FIVE_SHEET_ORDER = [
  FIVE_SHEET_NAMES.summary,
  FIVE_SHEET_NAMES.detail,
  FIVE_SHEET_NAMES.ahsp,
  FIVE_SHEET_NAMES.volume,
  FIVE_SHEET_NAMES.sources,
] as const;

/** Nilai jujur untuk data yang tidak ada (K-A6 / F2): tidak pernah karangan. */
export const NOT_RECORDED = 'tidak tercatat';
export const NOT_AVAILABLE = 'Tidak tersedia';
export const UNRESOLVED_PRICE_TEXT = 'HARGA BELUM TERSEDIA';
export const UNRESOLVED_AMOUNT_TEXT = '–';
/** Aktor yang dinyatakan jujur bila ekspor berjalan tanpa identitas. */
export const ANONYMOUS_ACTOR = 'demo/anonim';
export const SNAPSHOT_HASH_DEFINED_NAME = 'EZRAB_SNAPSHOT_HASH';

/**
 * TOLERANSI PEMBULATAN GRAND TOTAL (keputusan owner 2026-11-13: "terima +
 * toleransi"). Sheet 1 grand dihitung dari komponen tersimpan yang sudah
 * dibulatkan ke rupiah bulat (engine memakai Math.round), sedangkan Sheet 2
 * grand dijumlah dari formula live volume × harga satuan per baris. Bila
 * total tersimpan per baris ≠ produk persisnya (dibulatkan saat entri),
 * jumlah live menyimpang sebesar akumulasi pembulatan per baris.
 *
 * Mekanisme memberi batas atas yang berprinsip: tiap baris menyumbang
 * selisih paling banyak ±Rp0,50 (pembulatan ke rupiah terdekat) + noise
 * float yang dapat diabaikan — jadi toleransi Rp1 per baris memberi
 * headroom 2× atas batas teoretis dan berskala dengan ukuran proyek.
 * Kasus nyata pertama: Premium Demo 213 baris, selisih Rp1,55 pasca-recalc
 * LibreOffice (1,4×10⁻⁷ % dari grand Rp1.089.879.733) — di dalam toleransi
 * Rp213. Selisih DALAM toleransi dinyatakan di workbook (Sheet 1 + Sheet 5)
 * dan BUKAN kesalahan; selisih DI LUAR toleransi tetap gagal verifikasi.
 */
export const ROUNDING_TOLERANCE_PER_ROW_IDR = 1;

export function roundingToleranceFor(itemCount: number): number {
  return Math.max(0, Math.floor(itemCount)) * ROUNDING_TOLERANCE_PER_ROW_IDR;
}

/** Teks kebijakan pembulatan yang dinyatakan di workbook. */
export function roundingToleranceNote(itemCount: number): string {
  return (
    `PEMBULATAN: Grand total Sheet 2 dihitung dari formula live (volume × harga satuan per baris) ` +
    `dan dapat berbeda dari grand Sheet 1 akibat pembulatan per baris. ` +
    `Toleransi yang dinyatakan: Rp1 per baris item (maks. Rp${roundingToleranceFor(itemCount).toLocaleString('id-ID')} ` +
    `untuk ${itemCount} baris) — selisih dalam toleransi bukan kesalahan.`
  );
}

/** Koefisien AHSP butuh 4 desimal (format QUANTITY 2 desimal akan
 *  membulatkan 0,035 menjadi 0,04 — menyesatkan). */
const COEFFICIENT_FORMAT = '#,##0.0000';

// ---------------------------------------------------------------------------
// Snapshot beku + hash konten
// ---------------------------------------------------------------------------

export interface RabExportSnapshot {
  version: 1;
  preset: typeof FIVE_SHEET_PRESET_ID;
  projectId: string;
  projectName: string;
  revision: string;
  /** Hash FNV-1a 64-bit (hex 16) atas konten kanonis snapshot — hash
   *  integritas deterministik, BUKAN hash kriptografis. */
  snapshotHash: string;
  /** ISO; SENGAJA dikeluarkan dari hash agar ekspor ulang atas konten
   *  yang sama menghasilkan hash yang sama. */
  createdAt: string;
  actor: string;
  /** Deep copy seksi + item (bukan referensi state live). */
  sections: RABSection[];
  /** Deep copy ringkasan finansial kanonis. */
  costSummary: ProjectCostSummary;
  exportSummary: Pick<
    ExportSectionsSummary,
    | 'pricedCount'
    | 'unpricedCount'
    | 'pricedTotal'
    | 'officialTotal'
    | 'marketTotal'
    | 'manualTotal'
    | 'otherTotal'
    | 'isPartial'
    | 'partialItemCount'
    | 'isMixed'
  >;
  itemCount: number;
}

export interface FreezeSnapshotOptions {
  actor?: string;
  /** ISO; default jam pembekuan. Diinjeksikan tes untuk determinisme byte. */
  createdAt?: string;
}

/** Serialisasi kanonis deterministik: kunci objek diurutkan, array berurut. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * FNV-1a 64-bit murni-TS (tanpa dependensi node/browser) → hex 16 karakter.
 *
 * S9 (P5-O7) — hash NON-KRIPTOGRAFIS, DIPERTAHANKAN sengaja. Tujuannya
 * sidik jari integritas deterministik: mendeteksi perubahan konten
 * snapshot antar-ekspor + mengikat workbook ke snapshotnya (defined
 * name EZRAB_SNAPSHOT_HASH). Ia BUKAN mekanisme keamanan: tidak tahan
 * tabrakan yang direkayasa, dan TIDAK BOLEH dipakai untuk membuktikan
 * keaslian/kepengarangan, anti-rusak, atau identitas. Tidak ada
 * pengganti kriptografis sinkron yang cocok di sisi klien:
 * `sha256hex` (api/_lib/security.js) adalah server-side (node:crypto —
 * tidak dapat diimpor bundle browser); `crypto.subtle.digest`
 * asinkron (freezeRabSnapshot sinkron); satu-satunya hash klien lain
 * (fnv1aHash 32-bit, finalizationKey.ts) berasal dari keluarga yang
 * sama dan lebih lemah. Mengganti algoritma akan mengubah nilai hash
 * SEMUA snapshot lama (ikatan lama tidak lagi cocok) — karena itu
 * dipertahankan + didokumentasikan akurat di sini, bukan diganti.
 * JANGAN tambah dependensi hash demi menggantinya tanpa keputusan
 * owner yang memperhitungkan migrasi ikatan lama.
 */
export function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Bekukan snapshot ekspor dari state proyek saat ini. Deep copy penuh:
 * mutasi `sections`/`costSummary` sesudah pemanggilan ini TIDAK mengubah
 * snapshot. Hash dihitung atas { preset, projectId, revision, sections,
 * costSummary } kanonis — createdAt/actor tidak ikut di-hash.
 * Hash = sidik jari integritas NON-KRIPTOGRAFIS (FNV-1a 64-bit, lihat
 * fnv1a64Hex): mengikat workbook ke konten snapshotnya, bukan bukti
 * keaslian. Ekspor ulang atas konten yang sama menghasilkan hash yang
 * sama (createdAt dikeluarkan dari hash).
 */
export function freezeRabSnapshot(
  project: Project,
  sections: RABSection[],
  costSummary: ProjectCostSummary,
  exportSummary: ExportSectionsSummary,
  options?: FreezeSnapshotOptions
): RabExportSnapshot {
  const clonedSections = deepClone(sections);
  const clonedSummary = deepClone(costSummary);
  const revision = project.currentVersion || 'Rev 00';
  const hashInput = canonicalStringify({
    preset: FIVE_SHEET_PRESET_ID,
    projectId: project.id,
    revision,
    sections: clonedSections,
    costSummary: clonedSummary,
  });
  const itemCount = clonedSections.reduce((n, s) => n + (s.items?.length || 0), 0);
  return {
    version: 1,
    preset: FIVE_SHEET_PRESET_ID,
    projectId: project.id,
    projectName: project.name,
    revision,
    snapshotHash: fnv1a64Hex(hashInput),
    createdAt: options?.createdAt || new Date().toISOString(),
    actor: options?.actor || ANONYMOUS_ACTOR,
    sections: clonedSections,
    costSummary: clonedSummary,
    exportSummary: {
      pricedCount: exportSummary.pricedCount,
      unpricedCount: exportSummary.unpricedCount,
      pricedTotal: exportSummary.pricedTotal,
      officialTotal: exportSummary.officialTotal,
      marketTotal: exportSummary.marketTotal,
      manualTotal: exportSummary.manualTotal,
      otherTotal: exportSummary.otherTotal,
      isPartial: exportSummary.isPartial,
      partialItemCount: exportSummary.partialItemCount,
      isMixed: exportSummary.isMixed,
    },
    itemCount,
  };
}

// ---------------------------------------------------------------------------
// Pembantu tampilan (baca dari RABItem — tanpa karangan)
// ---------------------------------------------------------------------------

/** Item proyek dalam bentuk longgar: `priceStatus`/`priceSourceKind` hidup
 *  di `RabItem`, bukan di `RABItem`, sehingga diakses seperti mesin ekspor
 *  yang ada — lewat cast `any`. */
export type ExportItemLike = RABItem & Record<string, any>;

const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED: 'TERVERIFIKASI',
  NEEDS_VERIFICATION: 'PERLU VERIFIKASI',
  AI_GENERATED: 'AI — BELUM VERIFIKASI',
  ESTIMATED: 'ESTIMASI',
  REJECTED: 'DITOLAK',
  BLOCKED_BY_PROJECT_CONSTRAINT: 'DIBLOKIR KENDALA PROYEK',
  LOCKED: 'TERKUNCI',
};

export function verificationLabel(status: string | undefined | null): string {
  if (!status) return 'TIDAK DIKETAHUI';
  const label = VERIFICATION_LABELS[status];
  return label ? `${label} (${status})` : String(status);
}

/** Teks sumber harga fallback (dipakai bila pemanggil tidak mengumpan
 *  `buildExcelSourceText` mesin). Aturan cermin `buildExcelSourceTextBase`
 *  tanpa jejak konversi satuan: manual/asumsi/pasar/resmi/unresolved. */
export function fallbackSourceText(itm: ExportItemLike): string {
  const status = itm.priceStatus as string | undefined;
  const kind = itm.priceSourceKind as string | undefined;
  if (status === 'PRICE_MANUAL') return 'INPUT MANUAL';
  if (kind === 'EZRAB_ASSUMPTION') return 'ASUMSI — PERLU VERIFIKASI';
  if (kind === 'MARKET_REFERENCE') return 'REFERENSI PASAR';
  if (kind === 'OFFICIAL_AHSP') return itm.volumeSource || itm.ahspCode || 'RESMI AHSP';
  if (status === 'PRICE_UNRESOLVED' || kind === 'UNRESOLVED') return UNRESOLVED_PRICE_TEXT;
  return itm.priceSourceLabel || itm.volumeSource || itm.ahspCode || 'MANUAL';
}

function isAhspItem(itm: ExportItemLike): boolean {
  return Boolean(itm.ahspCode || itm.ahspSnapshot);
}

function itemCode(itm: ExportItemLike, sectionCode: string, idx: number): string {
  return itm.code || `${sectionCode}.${idx + 1}`;
}

/**
 * S6 (§6, P5-O3) — teks traceabilitas WBS satu baris Sheet 2 (kolom M).
 *
 * HANYA menampilkan field tersimpan di snapshot — TIDAK PERNAH
 * mengklasifikasi ulang di render (tidak ada `classifyToWbs` di sini):
 * - CONFIRMED: status tersimpan CONFIRMED + `wbsNodeId` berscope
 *   dikenal → 'TERPETAKAN — <label scope> (wbs:<scope>)'.
 * - PROVISIONAL: status tersimpan PROVISIONAL + saran berscope dikenal
 *   → 'PERLU KONFIRMASI — <label> (wbs:<scope>) — klasifikasi
 *   heuristik, belum terverifikasi'. TIDAK PERNAH memakai kata
 *   TERPETAKAN/TERVERIFIKASI.
 * - Selain itu (UNMAPPED / legacy tanpa status / data tak konsisten —
 *   mis. status CONFIRMED tanpa node valid): 'Tidak terpetakan'.
 * Item legacy dengan `wbsNodeId` berscope dikenal tapi tanpa status
 * tersimpan diperlakukan CONFIRMED (node yang tersimpan adalah fakta
 * transfer, bukan derivasi render). `wbsCode` (bila ada) ditambahkan
 * sebagai ' • Kode: <kode>' di semua status — kode adalah identitas
 * item, bukan klaim pemetaan.
 */
export function wbsTraceText(itm: ExportItemLike): string {
  const codeSuffix = itm.wbsCode ? ` • Kode: ${itm.wbsCode}` : '';
  const nodeLabel = wbsNodeLabel(itm.wbsNodeId);
  const suggestedLabel = wbsNodeLabel(itm.wbsSuggestedNodeId);
  const status = isWbsMappingStatus(itm.wbsMappingStatus) ? itm.wbsMappingStatus : null;
  if ((status === 'CONFIRMED' || status === null) && nodeLabel && itm.wbsNodeId) {
    return `TERPETAKAN — ${nodeLabel} (${itm.wbsNodeId})${codeSuffix}`;
  }
  if (status === 'PROVISIONAL' && suggestedLabel && itm.wbsSuggestedNodeId) {
    return `PERLU KONFIRMASI — ${suggestedLabel} (${itm.wbsSuggestedNodeId}) — klasifikasi heuristik, belum terverifikasi${codeSuffix}`;
  }
  return `Tidak terpetakan${codeSuffix}`;
}

/** Formula item: P3C-F2 — `calculationFormula` saat ini tidak pernah
 *  terisi di seluruh `src`; fallback ke takeoff/evidence, lalu jujur
 *  'Tidak tersedia'. */
export function volumeFormulaOf(itm: ExportItemLike): string {
  return (
    itm.calculationFormula ||
    itm.takeoffConfig?.formulaExpression ||
    itm.evidenceDetails?.calculation ||
    NOT_AVAILABLE
  );
}

function measurementDescriptionOf(itm: ExportItemLike): string {
  return itm.takeoffConfig?.formulaName || itm.specification || NOT_AVAILABLE;
}

function dimensionsOf(itm: ExportItemLike): string {
  const params = itm.takeoffConfig?.parameters;
  if (params && Object.keys(params).length > 0) {
    return Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  const rows = itm.takeoffConfig?.breakdownRows;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows
      .map((r: any) => `${r.description || ''} (${r.length ?? '?'}×${r.width ?? '?'}×${r.height ?? '?'} → ${r.quantity ?? '?'})`.trim())
      .join('; ');
  }
  const inputs = itm.evidenceDetails?.inputs;
  if (inputs && Object.keys(inputs).length > 0) {
    return Object.entries(inputs)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  return NOT_AVAILABLE;
}

function evidenceOf(itm: ExportItemLike): string {
  const parts: string[] = [];
  if (itm.sourceDocument) {
    parts.push(itm.sourcePage ? `${itm.sourceDocument} (hal. ${itm.sourcePage})` : itm.sourceDocument);
  }
  const ev = itm.evidenceDetails;
  if (ev) {
    if (Array.isArray(ev.sourcePages) && ev.sourcePages.length > 0) {
      parts.push(`hal. sumber: ${ev.sourcePages.join(', ')}`);
    }
    if (ev.sourceType) parts.push(ev.sourceType);
    if (ev.sourceRegion) parts.push(ev.sourceRegion);
  }
  return parts.length > 0 ? parts.join(' · ') : NOT_AVAILABLE;
}

function assumptionTextOf(itm: ExportItemLike): string {
  if (itm.isAssumption) return itm.assumptionNote || 'Asumsi — tanpa catatan';
  return '–';
}

/** Daftar info yang hilang untuk satu item (Sheet 5, kolom INFO HILANG) —
 *  dihitung dari data, bukan karangan. */
export function missingInfoOf(itm: ExportItemLike): string {
  const missing: string[] = [];
  if (!isExportPriceValid(itm as any)) missing.push('harga belum tersedia');
  if (volumeFormulaOf(itm) === NOT_AVAILABLE) missing.push('formula volume tidak tersedia');
  if (evidenceOf(itm) === NOT_AVAILABLE) missing.push('bukti/sumber tidak tersedia');
  if (!itm.verificationDate) missing.push('tanggal verifikasi tidak tercatat');
  if (!itm.userDecisionStatus) missing.push('keputusan user tidak tercatat');
  if (isAhspItem(itm) && !itm.ahspSnapshot) missing.push('snapshot analisa AHSP tidak tersedia');
  return missing.length > 0 ? missing.join('; ') : '–';
}

// ---------------------------------------------------------------------------
// Pembantu styling (token exportDesignSystem yang sama dengan mesin lama)
// ---------------------------------------------------------------------------

function styleHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.height = 24;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = FONT_HIERARCHY.TABLE_HEADER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string, lastColLetter: string): void {
  ws.mergeCells(`A2:${lastColLetter}2`);
  ws.getCell('A2').value = title;
  ws.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;
  ws.mergeCells(`A3:${lastColLetter}3`);
  ws.getCell('A3').value = subtitle;
  ws.getCell('A3').font = FONT_HIERARCHY.DOC_SUBTITLE;
}

function sectionHeaderRow(ws: ExcelJS.Worksheet, row: number, text: string, lastCol: number): void {
  const r = ws.getRow(row);
  r.getCell(1).value = text;
  r.getCell(1).font = FONT_HIERARCHY.SUBSECTION_TITLE;
  for (let c = 1; c <= lastCol; c++) {
    r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
    r.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_LIGHT };
  }
}

function bodyCell(cell: ExcelJS.Cell, bold = false): void {
  cell.font = bold ? FONT_HIERARCHY.BODY_BOLD : FONT_HIERARCHY.BODY;
  cell.border = { bottom: BORDER_THIN_LIGHT };
  cell.alignment = { vertical: 'middle', wrapText: true };
}

// ---------------------------------------------------------------------------
// Manifest builder (dipakai tes + pemanggil untuk menemukan baris kunci)
// ---------------------------------------------------------------------------

export interface FiveSheetManifest {
  snapshotHash: string;
  sheetNames: string[];
  summaryLadderRows: {
    direct: number;
    overhead: number;
    profit: number;
    subtotal: number;
    ppn: number;
    pph: number;
    grand: number;
    hashRow: number;
  };
  detailLadderRows: {
    direct: number;
    overhead: number;
    profit: number;
    subtotal: number;
    ppn: number;
    pph: number;
    grand: number;
  };
  ahspCardRows: Array<{ itemId: string; itemCode: string; headerRow: number }>;
}

export interface BuildFiveSheetOptions {
  useLiveFormulas?: boolean;
  /** Teks sumber harga; default fallback lokal. Mesin mengumpan
   *  `buildExcelSourceText` agar label identik dengan ekspor lama. */
  sourceText?: (itm: ExportItemLike) => string;
}

// ---------------------------------------------------------------------------
// Sheet 1 — RINGKASAN RAB
// ---------------------------------------------------------------------------

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  snapshot: RabExportSnapshot,
  projectMeta: { location?: string; clientName?: string; buildingType?: string; buildingArea?: number },
  useLiveFormulas: boolean
): FiveSheetManifest['summaryLadderRows'] {
  const ws = wb.addWorksheet(FIVE_SHEET_NAMES.summary, { views: [{ showGridLines: false }] });
  applyPrintSetup(ws, {
    orientation: 'portrait',
    projectName: snapshot.projectName,
    documentTitle: 'RINGKASAN RAB',
    revision: snapshot.revision,
  });
  ws.columns = [{ width: 38 }, { width: 26 }, { width: 64 }];
  titleBlock(
    ws,
    'RINGKASAN RENCANA ANGGARAN BIAYA (RAB)',
    `Proyek: ${snapshot.projectName} • Revisi: ${snapshot.revision} • Preset: RAB 5 Sheet (snapshot beku)`,
    'C'
  );

  const cs = snapshot.costSummary;
  const es = snapshot.exportSummary;
  const allItems: ExportItemLike[] = snapshot.sections.flatMap((s) => (s.items || []) as ExportItemLike[]);
  const noPricedTotal = es.pricedCount === 0;
  const estimatedCount = allItems.filter((i) => i.priceStatus === 'PRICE_ESTIMATED').length;
  const assumptionCount = allItems.filter((i) => i.isAssumption).length;
  const verifiedCount = allItems.filter((i) => i.verificationStatus === 'VERIFIED').length;
  const needsVerificationCount = allItems.filter((i) => i.verificationStatus === 'NEEDS_VERIFICATION').length;

  let row = 5;
  const kv = (label: string, value: string | number, note = ''): number => {
    ws.getCell(`A${row}`).value = label;
    bodyCell(ws.getCell(`A${row}`), true);
    ws.getCell(`B${row}`).value = value;
    bodyCell(ws.getCell(`B${row}`));
    // NOTE: kv TIDAK memformat angka sebagai mata uang — nilai di sini
    // adalah hitungan/identitas; nilai uang lewat moneyRow di bawah.
    ws.getCell(`C${row}`).value = note;
    bodyCell(ws.getCell(`C${row}`));
    ws.getCell(`C${row}`).font = FONT_HIERARCHY.BODY_MUTED;
    row++;
    return row - 1;
  };

  sectionHeaderRow(ws, row, 'IDENTITAS PROYEK', 3);
  row++;
  kv('Nama Proyek', snapshot.projectName);
  kv('ID Proyek', snapshot.projectId);
  kv('Lokasi', projectMeta.location || NOT_AVAILABLE);
  kv('Klien / Pemilik', projectMeta.clientName || NOT_AVAILABLE);
  kv('Jenis Bangunan', projectMeta.buildingType || NOT_AVAILABLE);
  kv('Luas Bangunan', projectMeta.buildingArea ? `${projectMeta.buildingArea.toLocaleString('id-ID')} m²` : NOT_AVAILABLE);
  kv('Revisi Dokumen', snapshot.revision);

  row++;
  sectionHeaderRow(ws, row, 'IDENTITAS ARTEFAK EKSPOR (IKATAN SNAPSHOT)', 3);
  row++;
  kv('Preset Ekspor', 'RAB 5 Sheet (FIVE_SHEET_RAB)');
  kv('Revision ID', snapshot.revision);
  const hashRow = kv('Hash Snapshot', snapshot.snapshotHash, 'FNV-1a 64-bit atas konten kanonis snapshot (projectId, revisi, seksi, ringkasan).');
  kv('Jumlah Seksi (WBS)', snapshot.sections.length);
  kv('Jumlah Item RAB', snapshot.itemCount);
  kv('Waktu Pembekuan Snapshot', snapshot.createdAt);
  kv('Aktor Ekspor', snapshot.actor, 'Tanpa identitas login — dinyatakan jujur sebagai demo/anonim.');
  kv('Status Artefak', 'SUCCESS', 'Pola ExportHistoryRecord Document Engine (id/dokumen/format/nama/revisi/waktu/status).');

  row++;
  sectionHeaderRow(ws, row, 'TANGGA BIAYA — SNAPSHOT KANONIS (P3B: PRATINJAU = BIAYA LANGSUNG SAJA)', 3);
  row++;
  // Komponen ditulis sebagai NILAI kanonis snapshot (lihat header modul);
  // subtotal & grand memakai formula live agar recalc eksak.
  const ladder: FiveSheetManifest['summaryLadderRows'] = {
    direct: 0, overhead: 0, profit: 0, subtotal: 0, ppn: 0, pph: 0, grand: 0, hashRow,
  };
  const moneyRow = (label: string, value: number, note = ''): number => {
    ws.getCell(`A${row}`).value = label;
    bodyCell(ws.getCell(`A${row}`), true);
    ws.getCell(`B${row}`).value = value;
    ws.getCell(`B${row}`).numFmt = NUMBER_FORMATS.CURRENCY;
    bodyCell(ws.getCell(`B${row}`), true);
    ws.getCell(`C${row}`).value = note;
    bodyCell(ws.getCell(`C${row}`));
    ws.getCell(`C${row}`).font = FONT_HIERARCHY.BODY_MUTED;
    row++;
    return row - 1;
  };
  ladder.direct = moneyRow(
    es.isPartial ? 'Biaya Langsung (Direct Cost) — PARSIAL' : 'Biaya Langsung (Direct Cost)',
    cs.directCost,
    'Sama dengan total pratinjau draft (kaki biaya langsung, P3B). Item tanpa harga dikecualikan.'
  );
  ladder.overhead = moneyRow(`Overhead (${cs.overheadPercent}%)`, cs.overheadAmount || 0, 'Nilai kanonis snapshot (basis mengecualikan item HSP, §17.1 opsi b).');
  ladder.profit = moneyRow(`Profit (${cs.profitPercent}%)`, cs.profitAmount || 0, 'Nilai kanonis snapshot (basis mengecualikan item HSP, §17.1 opsi b).');
  // Subtotal: formula live SUM(direct:profit).
  ws.getCell(`A${row}`).value = 'SUBTOTAL SEBELUM PAJAK';
  bodyCell(ws.getCell(`A${row}`), true);
  ladder.subtotal = row;
  if (useLiveFormulas) {
    ws.getCell(`B${row}`).value = { formula: `SUM(B${ladder.direct}:B${ladder.profit})`, result: cs.subtotalBeforeTax };
  } else {
    ws.getCell(`B${row}`).value = cs.subtotalBeforeTax;
  }
  ws.getCell(`B${row}`).numFmt = NUMBER_FORMATS.CURRENCY;
  bodyCell(ws.getCell(`B${row}`), true);
  ws.getCell(`C${row}`).value = 'Formula live: jumlah biaya langsung + overhead + profit.';
  bodyCell(ws.getCell(`C${row}`));
  row++;
  ladder.ppn = moneyRow(`PPN (${cs.taxPercent}%)${cs.ppnEnabled ? '' : ' — tidak aktif'}`, cs.taxAmount || 0, cs.ppnEnabled ? 'Nilai kanonis snapshot (basis pajak proporsional).' : 'Pajak opt-in: PPN tidak diaktifkan pada proyek ini.');
  ladder.pph = moneyRow(`PPh (${cs.pphPercent ?? 0}%)${cs.pphEnabled ? '' : ' — tidak aktif'}`, cs.pphAmount || 0, cs.pphEnabled ? 'Nilai kanonis snapshot (basis pajak proporsional).' : 'Pajak opt-in: PPh tidak diaktifkan pada proyek ini.');
  // Grand: formula live subtotal + PPN + PPh (atau teks jujur bila tak ada harga).
  ws.getCell(`A${row}`).value = noPricedTotal
    ? 'GRAND TOTAL — HARGA BELUM TERSEDIA'
    : es.isPartial
      ? 'GRAND TOTAL — PARSIAL'
      : 'GRAND TOTAL';
  ws.getCell(`A${row}`).font = FONT_HIERARCHY.GRAND_TOTAL;
  ws.getCell(`A${row}`).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
  ladder.grand = row;
  if (noPricedTotal) {
    ws.getCell(`B${row}`).value = UNRESOLVED_PRICE_TEXT;
  } else if (useLiveFormulas) {
    ws.getCell(`B${row}`).value = { formula: `B${ladder.subtotal}+B${ladder.ppn}+B${ladder.pph}`, result: cs.grandTotal };
    ws.getCell(`B${row}`).numFmt = NUMBER_FORMATS.CURRENCY;
  } else {
    ws.getCell(`B${row}`).value = cs.grandTotal;
    ws.getCell(`B${row}`).numFmt = NUMBER_FORMATS.CURRENCY;
  }
  ws.getCell(`B${row}`).font = FONT_HIERARCHY.GRAND_TOTAL;
  ws.getCell(`B${row}`).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
  ws.getCell(`C${row}`).value = noPricedTotal
    ? 'Seluruh item tanpa harga — total bukan Rp0.'
    : es.isPartial
      ? `Total PARSIAL: ${es.unpricedCount} item tanpa harga dikecualikan dari total.`
      : 'Formula live: subtotal + PPN + PPh.';
  bodyCell(ws.getCell(`C${row}`));
  row++;
  kv('Terbilang', noPricedTotal ? `Terbilang: ${UNRESOLVED_PRICE_TEXT}` : `Terbilang: ${terbilangIndo(cs.grandTotal)}`);
  // Kontingensi/markup tersimpan TIDAK masuk subtotal/grand ringkasan
  // kanonis ekspor (computeCostSummaryFromSections) — bila nonzero,
  // nyatakan eksplisit agar tidak ada divergensi diam-diam.
  if ((cs.contingencyAmount || 0) !== 0 || (cs.directorMarkupTotal || 0) !== 0) {
    kv(
      'Catatan Kontingensi / Markup',
      'Tersimpan tapi tidak masuk grand total kanonis ekspor',
      `Kontingensi Rp ${(cs.contingencyAmount || 0).toLocaleString('id-ID')}; markup direksi Rp ${(cs.directorMarkupTotal || 0).toLocaleString('id-ID')}.`
    );
  }

  row++;
  sectionHeaderRow(ws, row, 'STATUS KESIAPAN & KELENGKAPAN', 3);
  row++;
  kv('Item Berharga', `${es.pricedCount} dari ${snapshot.itemCount} item`);
  kv('Item Tanpa Harga', `${es.unpricedCount} item`, es.unpricedCount > 0 ? 'Dikecualikan dari total (bukan Rp0).' : '');
  kv('Item Estimasi AI (PRICE_ESTIMATED)', `${estimatedCount} item`, estimatedCount > 0 ? "Label 'Estimasi AI' — bukan harga resmi (P1)." : '');
  kv('Item Asumsi', `${assumptionCount} item`);
  kv('Item Terverifikasi (VERIFIED)', `${verifiedCount} item`);
  kv('Item Perlu Verifikasi', `${needsVerificationCount} item`);
  kv('Status Total Dokumen', es.isPartial ? 'PARSIAL' : 'LENGKAP', es.isPartial ? 'Total tidak mencakup item tanpa harga — bukan total resmi final.' : 'Seluruh item berharga.');
  kv('Perincian per Sumber', `Resmi Rp ${es.officialTotal.toLocaleString('id-ID')} · Pasar Rp ${es.marketTotal.toLocaleString('id-ID')} · Manual Rp ${es.manualTotal.toLocaleString('id-ID')} · Lainnya Rp ${es.otherTotal.toLocaleString('id-ID')}`);

  row++;
  sectionHeaderRow(ws, row, 'ASUMSI & PERINGATAN PENTING', 3);
  row++;
  const warnings: string[] = [];
  allItems.forEach((itm) => {
    if (itm.isAssumption) {
      warnings.push(`ASUMSI [${itm.code || itm.itemNumber || itm.id} — ${itm.description || ''}]: ${itm.assumptionNote || 'tanpa catatan'}`);
    }
  });
  allItems.forEach((itm) => {
    if (!isExportPriceValid(itm as any)) {
      warnings.push(`TANPA HARGA [${itm.code || itm.itemNumber || itm.id} — ${itm.description || ''}]: tidak masuk total.`);
    }
  });
  if (warnings.length === 0) {
    ws.mergeCells(`A${row}:C${row}`);
    ws.getCell(`A${row}`).value = 'Tidak ada asumsi atau peringatan tercatat.';
    bodyCell(ws.getCell(`A${row}`));
    row++;
  } else {
    const shown = warnings.slice(0, 25);
    shown.forEach((w) => {
      ws.mergeCells(`A${row}:C${row}`);
      ws.getCell(`A${row}`).value = `• ${w}`;
      bodyCell(ws.getCell(`A${row}`));
      row++;
    });
    if (warnings.length > 25) {
      ws.mergeCells(`A${row}:C${row}`);
      ws.getCell(`A${row}`).value = `… dan ${warnings.length - 25} peringatan lainnya (lihat Sheet 2 & 5).`;
      bodyCell(ws.getCell(`A${row}`));
      row++;
    }
  }

  // Toleransi pembulatan (keputusan owner 2026-11-13) — selalu dinyatakan
  // bila grand Sheet 2 memakai formula live, terpisah dari peringatan
  // per-item di atas (bukan asumsi proyek, melainkan kebijakan dokumen).
  if (useLiveFormulas) {
    ws.mergeCells(`A${row}:C${row}`);
    ws.getCell(`A${row}`).value = `• ${roundingToleranceNote(snapshot.itemCount)}`;
    bodyCell(ws.getCell(`A${row}`));
    row++;
  }

  row += 2;
  applySignatureBlock(ws, row, 'A', 'B', 'C');
  return ladder;
}

// ---------------------------------------------------------------------------
// Sheet 2 — RAB DETAIL
// ---------------------------------------------------------------------------

function buildDetailSheet(
  wb: ExcelJS.Workbook,
  snapshot: RabExportSnapshot,
  useLiveFormulas: boolean,
  sourceText: (itm: ExportItemLike) => string
): FiveSheetManifest['detailLadderRows'] {
  const ws = wb.addWorksheet(FIVE_SHEET_NAMES.detail, {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
  });
  applyPrintSetup(ws, {
    orientation: 'landscape',
    projectName: snapshot.projectName,
    documentTitle: 'RAB DETAIL',
    revision: snapshot.revision,
    printTitlesRow: '5:5',
  });
  ws.columns = [
    { width: 6 },  // A NO
    { width: 14 }, // B WBS/KODE
    { width: 40 }, // C URAIAN PEKERJAAN
    { width: 30 }, // D SPESIFIKASI
    { width: 8 },  // E SAT
    { width: 12 }, // F VOLUME
    { width: 18 }, // G HARGA SATUAN
    { width: 20 }, // H JUMLAH HARGA
    { width: 16 }, // I KLASIFIKASI AHSP
    { width: 26 }, // J SUMBER HARGA
    { width: 22 }, // K STATUS VERIFIKASI
    { width: 36 }, // L KETERANGAN
    { width: 42 }, // M TRACEABILITAS WBS (S6 §6, P5-O3)
  ];
  titleBlock(
    ws,
    'RINCIAN RENCANA ANGGARAN BIAYA (RAB) DETAIL',
    `Proyek: ${snapshot.projectName} • Revisi: ${snapshot.revision} • Hierarki WBS per seksi • Traceabilitas WBS per item di kolom M • Hash snapshot: ${snapshot.snapshotHash}`,
    'M'
  );

  const dHead = ws.getRow(5);
  dHead.values = [
    'NO', 'WBS / KODE', 'URAIAN PEKERJAAN', 'SPESIFIKASI', 'SAT', 'VOLUME',
    'HARGA SATUAN (RP)', 'JUMLAH HARGA (RP)', 'KLASIFIKASI', 'SUMBER HARGA',
    'STATUS VERIFIKASI', 'KETERANGAN', 'TRACEABILITAS WBS',
  ];
  styleHeaderRow(dHead, 13);

  const cs = snapshot.costSummary;
  const es = snapshot.exportSummary;
  let curRow = 6;
  const sectionSubtotalCells: string[] = [];

  snapshot.sections.forEach((sec) => {
    // Baris header seksi (hierarki WBS).
    const sHRow = ws.getRow(curRow);
    sHRow.values = [sec.code, '', sec.name.toUpperCase(), '', '', '', '', '', '', '', '', '', ''];
    sHRow.height = 22;
    for (let c = 1; c <= 13; c++) {
      const cell = sHRow.getCell(c);
      cell.font = FONT_HIERARCHY.WBS_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
      cell.border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
    }
    curRow++;

    const items = (sec.items || []) as ExportItemLike[];
    const itmStart = curRow;
    items.forEach((itm, idx) => {
      const iRow = ws.getRow(curRow);
      const code = itemCode(itm, sec.code, idx);
      const valid = isExportPriceValid(itm as any);
      const amount = valid ? exportItemAmount(itm as any) : null;
      iRow.getCell(1).value = idx + 1;
      iRow.getCell(2).value = itm.wbsNumber ? `${itm.wbsNumber} / ${code}` : code;
      iRow.getCell(3).value = itm.description || (itm as any).name || '';
      iRow.getCell(4).value = itm.specification || '–';
      iRow.getCell(5).value = itm.unit || '';
      iRow.getCell(6).value = Number(itm.volume) || 0;
      iRow.getCell(6).numFmt = NUMBER_FORMATS.QUANTITY;
      if (valid) {
        iRow.getCell(7).value = Number(itm.unitPrice) || 0;
        iRow.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
      } else {
        iRow.getCell(7).value = UNRESOLVED_PRICE_TEXT;
      }
      if (!valid) {
        iRow.getCell(8).value = UNRESOLVED_AMOUNT_TEXT;
      } else if (useLiveFormulas) {
        // Formula volume × harga satuan; sel teks '–' baris tanpa harga
        // diabaikan SUM Excel pada subtotal seksi.
        iRow.getCell(8).value = { formula: `IFERROR(F${curRow}*G${curRow},0)`, result: amount ?? 0 };
        iRow.getCell(8).numFmt = NUMBER_FORMATS.CURRENCY;
      } else {
        iRow.getCell(8).value = amount ?? 0;
        iRow.getCell(8).numFmt = NUMBER_FORMATS.CURRENCY;
      }
      iRow.getCell(9).value = isAhspItem(itm) ? `AHSP (${itm.ahspCode || itm.ahspSnapshot?.code || 'tanpa kode'})` : 'NON-AHSP';
      iRow.getCell(10).value = sourceText(itm);
      iRow.getCell(11).value = verificationLabel(itm.verificationStatus);
      const keterangan = itm.assumptionNote || itm.notes || (Array.isArray(itm.conflicts) && itm.conflicts.length > 0 ? itm.conflicts.join('; ') : '–');
      iRow.getCell(12).value = keterangan;
      // S6 (§6, P5-O3): traceabilitas WBS dari snapshot (tanpa klasifikasi ulang).
      iRow.getCell(13).value = wbsTraceText(itm);
      for (let c = 1; c <= 13; c++) bodyCell(iRow.getCell(c));
      iRow.getCell(3).alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
      iRow.getCell(13).alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
      curRow++;
    });

    const itmEnd = curRow - 1;
    const subRow = ws.getRow(curRow);
    subRow.getCell(3).value = `SUBTOTAL ${sec.name.toUpperCase()}`;
    subRow.getCell(3).font = FONT_HIERARCHY.SUBTOTAL;
    const secSubtotalVal = items.reduce((s, itm) => s + (exportItemAmount(itm as any) ?? 0), 0);
    if (useLiveFormulas && items.length > 0) {
      subRow.getCell(8).value = { formula: `SUM(H${itmStart}:H${itmEnd})`, result: secSubtotalVal };
    } else {
      subRow.getCell(8).value = secSubtotalVal;
    }
    subRow.getCell(8).numFmt = NUMBER_FORMATS.CURRENCY;
    subRow.getCell(8).font = FONT_HIERARCHY.SUBTOTAL;
    for (let c = 1; c <= 13; c++) {
      subRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
      subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
    }
    sectionSubtotalCells.push(`H${curRow}`);
    curRow += 2; // subtotal + baris kosong pemisah
  });

  // Tangga biaya di kaki sheet — komponen = nilai kanonis snapshot,
  // subtotal & grand = formula live (alasan: lihat header modul).
  const ladder: FiveSheetManifest['detailLadderRows'] = {
    direct: 0, overhead: 0, profit: 0, subtotal: 0, ppn: 0, pph: 0, grand: 0,
  };
  const noPricedTotal = es.pricedCount === 0;
  const ladderRow = (label: string, valueCell: ExcelJS.CellValue, isGrand = false): number => {
    const r = ws.getRow(curRow);
    ws.mergeCells(`C${curRow}:G${curRow}`);
    r.getCell(3).value = label;
    r.getCell(3).font = isGrand ? FONT_HIERARCHY.GRAND_TOTAL : FONT_HIERARCHY.SUBTOTAL;
    r.getCell(8).value = valueCell as any;
    if (typeof valueCell === 'number' || (valueCell && typeof valueCell === 'object')) {
      r.getCell(8).numFmt = NUMBER_FORMATS.CURRENCY;
    }
    r.getCell(8).font = isGrand ? FONT_HIERARCHY.GRAND_TOTAL : FONT_HIERARCHY.SUBTOTAL;
    for (let c = 1; c <= 13; c++) {
      r.getCell(c).border = isGrand
        ? { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM }
        : { bottom: BORDER_THIN_LIGHT };
    }
    curRow++;
    return curRow - 1;
  };
  const directFormula = sectionSubtotalCells.length > 0 ? `SUM(${sectionSubtotalCells.join(',')})` : '0';
  ladder.direct = ladderRow(
    es.isPartial ? 'TOTAL BIAYA LANGSUNG (DIRECT COST) — PARSIAL' : 'TOTAL BIAYA LANGSUNG (DIRECT COST)',
    useLiveFormulas ? { formula: directFormula, result: cs.directCost } : cs.directCost
  );
  ladder.overhead = ladderRow(`Overhead Cost (${cs.overheadPercent}%) — nilai kanonis snapshot`, cs.overheadAmount || 0);
  ladder.profit = ladderRow(`Profit Margin (${cs.profitPercent}%) — nilai kanonis snapshot`, cs.profitAmount || 0);
  ladder.subtotal = ladderRow(
    'SUBTOTAL SEBELUM PAJAK',
    useLiveFormulas
      ? { formula: `SUM(H${ladder.direct}:H${ladder.profit})`, result: cs.subtotalBeforeTax }
      : cs.subtotalBeforeTax
  );
  ladder.ppn = ladderRow(`PPN (${cs.taxPercent}%)${cs.ppnEnabled ? '' : ' — tidak aktif'} — nilai kanonis snapshot`, cs.taxAmount || 0);
  ladder.pph = ladderRow(`PPh (${cs.pphPercent ?? 0}%)${cs.pphEnabled ? '' : ' — tidak aktif'} — nilai kanonis snapshot`, cs.pphAmount || 0);
  ladder.grand = ladderRow(
    noPricedTotal ? 'GRAND TOTAL — HARGA BELUM TERSEDIA' : es.isPartial ? 'GRAND TOTAL — PARSIAL' : 'GRAND TOTAL',
    noPricedTotal
      ? UNRESOLVED_PRICE_TEXT
      : useLiveFormulas
        ? { formula: `H${ladder.subtotal}+H${ladder.ppn}+H${ladder.pph}`, result: cs.grandTotal }
        : cs.grandTotal,
    true
  );
  if (es.isPartial) {
    const r = ws.getRow(curRow);
    ws.mergeCells(`A${curRow}:M${curRow}`);
    r.getCell(1).value = `PERINGATAN: total PARSIAL — ${es.unpricedCount} item tanpa harga dikecualikan dari total (bukan Rp0).`;
    r.getCell(1).font = FONT_HIERARCHY.BODY_BOLD;
  }
  return ladder;
}

// ---------------------------------------------------------------------------
// Sheet 3 — ANALISA HARGA SATUAN (WAJIB project-bound)
// ---------------------------------------------------------------------------

function buildAhspSheet(
  wb: ExcelJS.Workbook,
  snapshot: RabExportSnapshot,
  useLiveFormulas: boolean,
  sourceText: (itm: ExportItemLike) => string
): FiveSheetManifest['ahspCardRows'] {
  const ws = wb.addWorksheet(FIVE_SHEET_NAMES.ahsp, { views: [{ showGridLines: true }] });
  applyPrintSetup(ws, {
    orientation: 'portrait',
    projectName: snapshot.projectName,
    documentTitle: 'ANALISA HARGA SATUAN PEKERJAAN (AHSP) — PROJECT-BOUND',
    revision: snapshot.revision,
  });
  ws.columns = [
    { width: 4 },  // A margin
    { width: 6 },  // B NO
    { width: 14 }, // C KODE ITEM
    { width: 38 }, // D URAIAN KOMPONEN
    { width: 12 }, // E KOEFISIEN
    { width: 8 },  // F SAT
    { width: 18 }, // G HARGA SATUAN
    { width: 20 }, // H JUMLAH
    { width: 36 }, // I PROVENANCE / STATUS
  ];
  titleBlock(
    ws,
    'ANALISA HARGA SATUAN PEKERJAAN (AHSP) — HANYA ITEM PROYEK INI',
    `Proyek: ${snapshot.projectName} • Revisi: ${snapshot.revision} • Setiap kartu berasal dari ahspSnapshot item proyek; tidak ada item database master.`,
    'I'
  );

  const cards: FiveSheetManifest['ahspCardRows'] = [];
  let row = 5;
  let cardNo = 0;

  snapshot.sections.forEach((sec) => {
    (sec.items || []).forEach((rawItem, idx) => {
      const itm = rawItem as ExportItemLike;
      const code = itemCode(itm, sec.code, idx);
      cardNo++;
      const headerRow = row;
      cards.push({ itemId: itm.id, itemCode: code, headerRow });
      // Kartu header
      ws.mergeCells(`B${row}:I${row}`);
      const snap = itm.ahspSnapshot;
      ws.getCell(`B${row}`).value = snap
        ? `${cardNo}. [${snap.code}] ${snap.name.toUpperCase()} — item ${code} ${itm.description || ''} (Satuan: 1 ${snap.unit || itm.unit || ''})`
        : isAhspItem(itm)
          ? `${cardNo}. [${itm.ahspCode}] ${itm.description || ''} — item ${code} (Satuan: 1 ${itm.unit || ''})`
          : `${cardNo}. ${itm.description || ''} — item ${code} — NON-AHSP (Satuan: 1 ${itm.unit || ''})`;
      ws.getCell(`B${row}`).font = FONT_HIERARCHY.WBS_HEADER;
      ws.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
      ws.getCell(`B${row}`).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_LIGHT };
      row++;

      if (!snap) {
        // Jujur: tanpa snapshot komponen, tidak ada analisa yang bisa ditulis.
        ws.mergeCells(`B${row}:I${row}`);
        ws.getCell(`B${row}`).value = isAhspItem(itm)
          ? `Analisa tidak tersedia — kode AHSP ${itm.ahspCode} tercatat pada item, tetapi snapshot komponen (material/upah/alat) tidak tersedia. Kode tidak dikarang dan komponen tidak ditebak.`
          : `NON-AHSP — tidak ada analisa AHSP untuk item ini; harga dari: ${sourceText(itm)}.`;
        ws.getCell(`B${row}`).font = FONT_HIERARCHY.BODY;
        ws.getCell(`B${row}`).alignment = { wrapText: true, vertical: 'middle' };
        row++;
        // Rincian harga tersimpan per komponen (bila ada) — nilai, bukan karangan.
        const storedParts: Array<[string, number]> = [];
        if (Number(itm.materialPrice) > 0) storedParts.push(['Material (tersimpan)', Number(itm.materialPrice)]);
        if (Number(itm.laborPrice) > 0) storedParts.push(['Upah (tersimpan)', Number(itm.laborPrice)]);
        if (Number(itm.equipmentPrice) > 0) storedParts.push(['Alat (tersimpan)', Number(itm.equipmentPrice)]);
        storedParts.forEach(([label, val], i) => {
          const r = ws.getRow(row);
          r.getCell(2).value = i + 1;
          r.getCell(3).value = code;
          r.getCell(4).value = label;
          r.getCell(7).value = val;
          r.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
          r.getCell(9).value = 'Nilai tersimpan pada item (bukan hasil analisa AHSP).';
          for (let c = 2; c <= 9; c++) bodyCell(r.getCell(c));
          row++;
        });
        ws.mergeCells(`B${row}:I${row}`);
        ws.getCell(`B${row}`).value = `Status verifikasi item: ${verificationLabel(itm.verificationStatus)}${itm.isAssumption ? ` • ASUMSI: ${itm.assumptionNote || 'tanpa catatan'}` : ''}`;
        ws.getCell(`B${row}`).font = FONT_HIERARCHY.BODY_MUTED;
        row += 2;
        return;
      }

      // Header tabel komponen
      const hRow = ws.getRow(row);
      hRow.values = ['', 'NO', 'KODE ITEM', 'URAIAN KOMPONEN', 'KOEFISIEN', 'SAT', 'HARGA SATUAN (RP)', 'JUMLAH (RP)', 'PROVENANCE / STATUS'];
      hRow.height = 20;
      for (let c = 2; c <= 9; c++) {
        hRow.getCell(c).font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: EXCEL_COLORS.WHITE } };
        hRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_HEADER } };
      }
      row++;

      const groupSubtotalCells: string[] = [];
      const groups: Array<{ label: string; list: any[] }> = [
        { label: 'TENAGA KERJA', list: snap.laborComponents || [] },
        { label: 'MATERIAL / BAHAN', list: snap.materialComponents || [] },
        { label: 'PERALATAN', list: snap.equipmentComponents || [] },
      ];
      groups.forEach(({ label, list }) => {
        if (list.length === 0) return;
        const gRow = ws.getRow(row);
        ws.mergeCells(`B${row}:I${row}`);
        gRow.getCell(2).value = label;
        gRow.getCell(2).font = FONT_HIERARCHY.BODY_BOLD;
        gRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
        row++;
        const compStart = row;
        list.forEach((comp: any, cIdx: number) => {
          const r = ws.getRow(row);
          const coef = Number(comp.coefficient) || 0;
          // AHSPComponent.unitPrice null = harga belum tersedia (BUKAN 0).
          const price = comp.unitPrice === null || comp.unitPrice === undefined ? null : Number(comp.unitPrice);
          const storedTotal = comp.total === null || comp.total === undefined ? null : Number(comp.total);
          r.getCell(2).value = cIdx + 1;
          r.getCell(3).value = comp.code || '';
          r.getCell(4).value = comp.name || 'Komponen';
          r.getCell(5).value = coef;
          r.getCell(5).numFmt = COEFFICIENT_FORMAT;
          r.getCell(6).value = comp.unit || '';
          if (price === null) {
            r.getCell(7).value = UNRESOLVED_PRICE_TEXT;
            r.getCell(8).value = UNRESOLVED_AMOUNT_TEXT;
          } else {
            r.getCell(7).value = price;
            r.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
            if (storedTotal !== null) {
              // Total tersimpan snapshot menang (nilai, bukan formula) —
              // formula hanya bila total tersimpan tidak ada.
              r.getCell(8).value = storedTotal;
            } else if (useLiveFormulas) {
              r.getCell(8).value = { formula: `E${row}*G${row}`, result: coef * price };
            } else {
              r.getCell(8).value = coef * price;
            }
            r.getCell(8).numFmt = NUMBER_FORMATS.CURRENCY;
          }
          r.getCell(9).value = comp.resourceType || '';
          for (let c = 2; c <= 9; c++) bodyCell(r.getCell(c));
          row++;
        });
        const compEnd = row - 1;
        const subRow = ws.getRow(row);
        subRow.getCell(4).value = `SUBTOTAL ${label}`;
        subRow.getCell(4).font = FONT_HIERARCHY.SUBTOTAL;
        const groupTotal = list.reduce((s: number, comp: any) => {
          if (comp.unitPrice === null || comp.unitPrice === undefined) return s;
          if (comp.total !== null && comp.total !== undefined) return s + Number(comp.total);
          return s + (Number(comp.coefficient) || 0) * Number(comp.unitPrice);
        }, 0);
        if (useLiveFormulas) {
          subRow.getCell(8).value = { formula: `SUM(H${compStart}:H${compEnd})`, result: groupTotal };
        } else {
          subRow.getCell(8).value = groupTotal;
        }
        subRow.getCell(8).numFmt = NUMBER_FORMATS.CURRENCY;
        subRow.getCell(8).font = FONT_HIERARCHY.SUBTOTAL;
        for (let c = 2; c <= 9; c++) {
          subRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
          subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
        }
        groupSubtotalCells.push(`H${row}`);
        row++;
      });

      // Total kartu
      const totalRow = ws.getRow(row);
      totalRow.getCell(4).value = `TOTAL HARGA SATUAN [${snap.code}]`;
      totalRow.getCell(4).font = FONT_HIERARCHY.BODY_BOLD;
      const cardTotal = groups.reduce((s, { list }) => s + list.reduce((a: number, comp: any) => {
        if (comp.unitPrice === null || comp.unitPrice === undefined) return a;
        if (comp.total !== null && comp.total !== undefined) return a + Number(comp.total);
        return a + (Number(comp.coefficient) || 0) * Number(comp.unitPrice);
      }, 0), 0);
      if (useLiveFormulas && groupSubtotalCells.length > 0) {
        totalRow.getCell(8).value = { formula: `SUM(${groupSubtotalCells.join(',')})`, result: cardTotal };
      } else {
        totalRow.getCell(8).value = cardTotal;
      }
      totalRow.getCell(8).numFmt = NUMBER_FORMATS.CURRENCY;
      totalRow.getCell(8).font = FONT_HIERARCHY.BODY_BOLD;
      totalRow.getCell(9).value = `Harga satuan snapshot: Rp ${Number(snap.unitPrice || 0).toLocaleString('id-ID')}`;
      for (let c = 2; c <= 9; c++) {
        totalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
        totalRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
      }
      row++;

      // Baris provenance kartu
      const provParts: string[] = [];
      if (snap.sourceDocument) provParts.push(`Dokumen: ${snap.sourceDocument}`);
      if (snap.version) provParts.push(`Versi AHSP: ${snap.version}`);
      if (snap.snapshotTimestamp) provParts.push(`Snapshot: ${snap.snapshotTimestamp}`);
      if (snap.isCustomModified) provParts.push('Snapshot dimodifikasi manual (custom)');
      provParts.push(`Status verifikasi item: ${verificationLabel(itm.verificationStatus)}`);
      if (itm.isAssumption) provParts.push(`ASUMSI: ${itm.assumptionNote || 'tanpa catatan'}`);
      ws.mergeCells(`B${row}:I${row}`);
      ws.getCell(`B${row}`).value = provParts.join(' • ');
      ws.getCell(`B${row}`).font = FONT_HIERARCHY.BODY_MUTED;
      ws.getCell(`B${row}`).alignment = { wrapText: true, vertical: 'middle' };
      row += 2;
    });
  });
  return cards;
}

// ---------------------------------------------------------------------------
// Sheet 4 — DETAIL VOLUME
// ---------------------------------------------------------------------------

function buildVolumeSheet(wb: ExcelJS.Workbook, snapshot: RabExportSnapshot): void {
  const ws = wb.addWorksheet(FIVE_SHEET_NAMES.volume, {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
  });
  applyPrintSetup(ws, {
    orientation: 'landscape',
    projectName: snapshot.projectName,
    documentTitle: 'DETAIL VOLUME (BACK-UP PERHITUNGAN)',
    revision: snapshot.revision,
    printTitlesRow: '5:5',
  });
  ws.columns = [
    { width: 6 },  // A NO
    { width: 14 }, // B KODE
    { width: 36 }, // C URAIAN
    { width: 34 }, // D DESKRIPSI PENGUKURAN
    { width: 36 }, // E FORMULA
    { width: 30 }, // F DIMENSI / PARAMETER
    { width: 12 }, // G KUANTITAS
    { width: 8 },  // H SAT
    { width: 30 }, // I SUMBER / BUKTI
    { width: 22 }, // J STATUS VERIFIKASI
    { width: 30 }, // K ASUMSI
  ];
  titleBlock(
    ws,
    'DETAIL VOLUME — BACK-UP PERHITUNGAN KUANTITAS',
    `Proyek: ${snapshot.projectName} • Revisi: ${snapshot.revision} • Formula/dimensi yang tidak ada datanya ditulis '${NOT_AVAILABLE}' (tidak dikarang).`,
    'K'
  );
  const head = ws.getRow(5);
  head.values = [
    'NO', 'KODE', 'URAIAN', 'DESKRIPSI PENGUKURAN', 'FORMULA', 'DIMENSI / PARAMETER',
    'KUANTITAS', 'SAT', 'SUMBER / BUKTI', 'STATUS VERIFIKASI', 'ASUMSI',
  ];
  styleHeaderRow(head, 11);

  let row = 6;
  let no = 0;
  snapshot.sections.forEach((sec) => {
    (sec.items || []).forEach((rawItem, idx) => {
      const itm = rawItem as ExportItemLike;
      no++;
      const r = ws.getRow(row);
      r.getCell(1).value = no;
      r.getCell(2).value = itemCode(itm, sec.code, idx);
      r.getCell(3).value = itm.description || (itm as any).name || '';
      r.getCell(4).value = measurementDescriptionOf(itm);
      r.getCell(5).value = volumeFormulaOf(itm);
      r.getCell(6).value = dimensionsOf(itm);
      r.getCell(7).value = Number(itm.volume) || 0;
      r.getCell(7).numFmt = NUMBER_FORMATS.QUANTITY;
      r.getCell(8).value = itm.unit || '';
      r.getCell(9).value = evidenceOf(itm);
      r.getCell(10).value = verificationLabel(itm.verificationStatus);
      r.getCell(11).value = assumptionTextOf(itm);
      for (let c = 1; c <= 11; c++) bodyCell(r.getCell(c));
      row++;
    });
  });
}

// ---------------------------------------------------------------------------
// Sheet 5 — SUMBER DAN ASUMSI
// ---------------------------------------------------------------------------

function buildSourcesSheet(
  wb: ExcelJS.Workbook,
  snapshot: RabExportSnapshot,
  sourceText: (itm: ExportItemLike) => string,
  useLiveFormulas: boolean
): void {
  const ws = wb.addWorksheet(FIVE_SHEET_NAMES.sources, {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
  });
  applyPrintSetup(ws, {
    orientation: 'landscape',
    projectName: snapshot.projectName,
    documentTitle: 'SUMBER DAN ASUMSI',
    revision: snapshot.revision,
    printTitlesRow: '5:5',
  });
  ws.columns = [
    { width: 6 },  // A NO
    { width: 14 }, // B KODE
    { width: 34 }, // C URAIAN
    { width: 26 }, // D SUMBER HARGA
    { width: 24 }, // E IDENTITAS SUMBER AHSP
    { width: 26 }, // F REFERENSI
    { width: 22 }, // G STATUS VERIFIKASI
    { width: 34 }, // H PENJELASAN ASUMSI
    { width: 16 }, // I STATUS MANUAL
    { width: 30 }, // J INFO HILANG
    { width: 16 }, // K TANGGAL VERIFIKASI
    { width: 18 }, // L STATUS KEPUTUSAN USER
  ];
  titleBlock(
    ws,
    'SUMBER HARGA DAN ASUMSI',
    `Proyek: ${snapshot.projectName} • Revisi: ${snapshot.revision} • Tanggal verifikasi & status keputusan user: '${NOT_RECORDED}' bila belum ada datanya (K-A6).`,
    'L'
  );
  const head = ws.getRow(5);
  head.values = [
    'NO', 'KODE', 'URAIAN', 'SUMBER HARGA', 'IDENTITAS SUMBER AHSP', 'REFERENSI',
    'STATUS VERIFIKASI', 'PENJELASAN ASUMSI', 'STATUS MANUAL', 'INFO HILANG',
    'TANGGAL VERIFIKASI', 'STATUS KEPUTUSAN USER',
  ];
  styleHeaderRow(head, 12);

  let row = 6;
  let no = 0;
  snapshot.sections.forEach((sec) => {
    (sec.items || []).forEach((rawItem, idx) => {
      const itm = rawItem as ExportItemLike;
      no++;
      const r = ws.getRow(row);
      const snap = itm.ahspSnapshot;
      r.getCell(1).value = no;
      r.getCell(2).value = itemCode(itm, sec.code, idx);
      r.getCell(3).value = itm.description || (itm as any).name || '';
      r.getCell(4).value = sourceText(itm);
      r.getCell(5).value = snap
        ? `${snap.code} — ${snap.name}${snap.version ? ` (v${snap.version})` : ''}`
        : itm.ahspCode || '–';
      r.getCell(6).value = itm.sourceDocument
        ? itm.sourcePage ? `${itm.sourceDocument} (hal. ${itm.sourcePage})` : itm.sourceDocument
        : itm.priceSourceLabel || '–';
      r.getCell(7).value = verificationLabel(itm.verificationStatus);
      r.getCell(8).value = itm.isAssumption ? itm.assumptionNote || 'Asumsi — tanpa catatan' : '–';
      r.getCell(9).value = itm.priceStatus === 'PRICE_MANUAL' ? 'MANUAL' : itm.originType || '–';
      r.getCell(10).value = missingInfoOf(itm);
      // K-A6: kedua kolom ini TIDAK ADA DATANYA di sebagian besar item —
      // tampilkan 'tidak tercatat' dengan jujur, jangan karang tanggal/keputusan.
      r.getCell(11).value = itm.verificationDate || NOT_RECORDED;
      r.getCell(12).value = itm.userDecisionStatus || NOT_RECORDED;
      for (let c = 1; c <= 12; c++) bodyCell(r.getCell(c));
      row++;
    });
  });

  // Kebijakan pembulatan (keputusan owner 2026-11-13) — dicatat di ledger
  // sumber/asumsi sebagai baris kebijakan, bukan baris item.
  if (useLiveFormulas) {
    row++;
    ws.mergeCells(`A${row}:L${row}`);
    ws.getCell(`A${row}`).value = roundingToleranceNote(snapshot.itemCount);
    bodyCell(ws.getCell(`A${row}`));
    row++;
  }
}

// ---------------------------------------------------------------------------
// Entry point preset
// ---------------------------------------------------------------------------

/**
 * Bangun kelima sheet dari SNAPSHOT SAJA (tidak pernah membaca state live).
 * `projectMeta` hanya membawa field identitas proyek yang tidak masuk
 * snapshot (lokasi/klien/jenis/luas) — dipasok mesin dari proyek yang
 * sama pada saat pembekuan; tidak dibaca ulang sesudahnya.
 *
 * Mengikat hash snapshot ke workbook lewat defined name
 * `EZRAB_SNAPSHOT_HASH` → sel hash di Sheet 1.
 */
export function buildFiveSheetWorkbook(
  wb: ExcelJS.Workbook,
  snapshot: RabExportSnapshot,
  company: Company,
  options?: BuildFiveSheetOptions & {
    projectMeta?: { location?: string; clientName?: string; buildingType?: string; buildingArea?: number };
  }
): FiveSheetManifest {
  const useLiveFormulas = options?.useLiveFormulas !== false;
  const sourceText = options?.sourceText || fallbackSourceText;
  const summaryLadderRows = buildSummarySheet(wb, snapshot, options?.projectMeta || {}, useLiveFormulas);
  const detailLadderRows = buildDetailSheet(wb, snapshot, useLiveFormulas, sourceText);
  const ahspCardRows = buildAhspSheet(wb, snapshot, useLiveFormulas, sourceText);
  buildVolumeSheet(wb, snapshot);
  buildSourcesSheet(wb, snapshot, sourceText, useLiveFormulas);

  // Ikatan hash di metadata workbook (selain tercantum di Sheet 1).
  // ExcelJS: definedNames.add(locStr, name) — urutan argumen terbalik
  // dari dugaan umum; locStr dikutip karena nama sheet diawali angka.
  try {
    wb.definedNames.add(
      `'${FIVE_SHEET_NAMES.summary}'!$B$${summaryLadderRows.hashRow}`,
      SNAPSHOT_HASH_DEFINED_NAME
    );
  } catch {
    // Defined name gagal (lingkungan ExcelJS berbeda) — ikatan Sheet 1
    // tetap berlaku; kegagalan ini tidak boleh menggagalkan ekspor.
  }
  if (company?.name) {
    try {
      (wb as any).company = company.name;
    } catch {
      // Properti opsional — abaikan bila tidak didukung.
    }
  }

  return {
    snapshotHash: snapshot.snapshotHash,
    sheetNames: [...FIVE_SHEET_ORDER],
    summaryLadderRows,
    detailLadderRows,
    ahspCardRows,
  };
}
