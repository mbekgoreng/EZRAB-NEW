/**
 * dedModeUi.ts — Logika MURNI pemilih mode UI DED (§3 directive
 * DED-RAB AI DUAL MODE; W2 — G-UI-1 s.d. G-UI-4).
 *
 * Modul ini TANPA React: kartu mode, pemetaan mode → (policy, mesin),
 * resolusi mode sesi, dan pemeta item Full AI → lampiran Chat AI.
 * Dipakai DedAiInputView + view.tsx, dan diuji suite w2DedModeUi
 * (plain-tsx, tanpa render).
 *
 * Mode kanonis + helper pemetaan hidup di ./dedMode.ts (W1, C1) —
 * modul ini TIDAK menduplikasi pemetaan itu, hanya memakainya.
 * Kedalaman FAST/DETAIL (DedAiMode) adalah SUB-PILIHAN di kedua mode,
 * bukan mode (C1) — tidak ada di sini selain dipertahankan apa adanya
 * saat mode berganti.
 */
import {
  DEFAULT_DED_RAB_AI_MODE,
  engineForMode,
  modeFromLegacy,
  policyForMode,
} from './dedMode';
import type { DedEstimationPolicy, DedRabAiMode } from './dedMode';
import type {
  DedAiItem,
  DedAiMode,
  DedAiOutput,
  DedAiPriceSource,
  DedAiProjectType,
  DedAiQuantitySource,
} from './types';
import type {
  FullAiItem,
  FullAiOutput,
  FullAiPriceSource,
  FullAiProvenance,
} from '../ded-full-ai/types';

/** Default sesi DED baru (C2) — sama dengan default kanonis W1. */
export const DEFAULT_DED_AI_MODE: DedRabAiMode = DEFAULT_DED_RAB_AI_MODE;

/* ------------------------------------------------------------------ */
/* G-UI-1 — PERSIS DUA kartu mode                                     */
/* ------------------------------------------------------------------ */

export interface DedModeCard {
  mode: DedRabAiMode;
  title: string;
  subtitle: string;
  bullets: readonly string[];
  /** Catatan keterbukaan (dulu di seksi Kebijakan Harga) — isi utuh. */
  note: string;
  accent: 'blue' | 'violet';
}

/**
 * PERSIS DUA kartu — sumber tunggal isi kartu mode. Urutan tampil:
 * EZRAB AI dulu (default C2), Full AI sesudahnya.
 */
export const DED_MODE_CARDS: readonly DedModeCard[] = [
  {
    mode: 'EZRAB_AI',
    title: 'EZRAB AI MODE',
    subtitle: 'Analisis cerdas dengan referensi EZRAB',
    bullets: [
      'AI membaca DED',
      'Terintegrasi database AHSP EZRAB',
      'Referensi harga + data terstruktur',
      'Calculation engine EZRAB',
      'Cocok untuk RAB berbasis referensi internal',
    ],
    note: 'Harga mengacu pada database AHSP EZRAB; item tanpa harga terverifikasi tetap belum tersedia dan total bisa parsial sampai dilengkapi lewat AHSP picker setelah hasil di-push ke spreadsheet.',
    accent: 'blue',
  },
  {
    mode: 'FULL_AI',
    title: 'FULL AI MODE',
    subtitle: 'AI membangun analisis konstruksi secara mandiri',
    bullets: [
      'AI menyusun WBS + pekerjaan',
      'AI membuat analisis AHSP sendiri',
      'AI menentukan material/tenaga kerja/peralatan',
      'AI menghasilkan koefisien + estimasi harga',
      'AI memeriksa kelengkapan/konsistensi',
      'TIDAK memakai database referensi AHSP internal',
    ],
    note: 'Harga adalah estimasi AI, bukan harga resmi AHSP — validasi sebelum RAB dipakai untuk pengadaan, tender, atau kontrak.',
    accent: 'violet',
  },
];

/* ------------------------------------------------------------------ */
/* Mode ↔ (policy, mesin) + sesi workflow                             */
/* ------------------------------------------------------------------ */

/** Medan mode pada sesi workflow (DedAiSession) — ketiganya selalu konsisten. */
export interface DedModeFields {
  dedMode: DedRabAiMode;
  policy: DedEstimationPolicy;
  fullAi: boolean;
}

/** Masukan sesi-ish untuk resolusi mode (field mode boleh absen — sesi lama). */
export interface DedModeInput {
  dedMode?: DedRabAiMode | null;
  policy?: DedEstimationPolicy | null;
  fullAi?: boolean | null;
}

/**
 * Mode → (policy, mesin). Pemetaan C1 lewat helper kanonis W1:
 * EZRAB_AI → (DATABASE, standar); FULL_AI → (FULL_AI, Full AI).
 */
export function dedModeFieldsFor(mode: DedRabAiMode): DedModeFields {
  return {
    dedMode: mode,
    policy: policyForMode(mode),
    fullAi: engineForMode(mode) === 'FULL_AI',
  };
}

/**
 * Mode kanonis dari sesi: `dedMode` tersimpan menang bila valid;
 * bila tidak ada (sesi/draft lama) diturunkan dari {policy, fullAi}
 * via modeFromLegacy (mesin menang; tanpa sinyal → default C2).
 */
export function resolveDedAiMode(input: DedModeInput): DedRabAiMode {
  if (input.dedMode === 'EZRAB_AI' || input.dedMode === 'FULL_AI') return input.dedMode;
  return modeFromLegacy({ policy: input.policy, fullAi: input.fullAi });
}

/**
 * Terapkan mode ke sesi: medan mode DITURUNKAN ULANG dari mode yang
 * dipilih — policy/fullAi lama TIDAK pernah terbawa (ganti mode tidak
 * membocorkan konfigurasi eksekusi). Semua medan lain (kedalaman,
 * kompleksitas, berkas, cakupan, preferensi) dipertahankan apa adanya.
 *
 * Constraint sengaja `object`, bukan `DedModeInput`: fungsi ini tidak
 * MEMBACA satu pun medan sesi (hanya spread) — constraint `DedModeInput`
 * menolak literal sesi lengkap (TS2353 pada `files`/…) dan menyempitkan
 * T sehingga hasilnya bukan DedAiSession (TS2345). Perbaikan tsc
 * koordinator 2026-11-14 atas temuan verifikator akhir.
 */
export function withDedMode<T extends object>(session: T, mode: DedRabAiMode): T & DedModeFields {
  return { ...session, ...dedModeFieldsFor(mode) };
}

/* ------------------------------------------------------------------ */
/* G-UI-3 — Hasil Full AI → lampiran Chat AI                          */
/*                                                                     */
/* Pemetaan nilai-ke-nilai (tanpa fabrikasi): kuantitas, harga, dan   */
/* subtotal dipertahankan apa adanya; null tetap null. Hanya          */
/* kosakata provenance yang dipetakan ke kosakata DedAiItem —        */
/* pemetaan tercantum eksplisit di bawah agar dapat diaudit.          */
/* ------------------------------------------------------------------ */

const FULL_AI_QUANTITY_SOURCE: Record<FullAiProvenance, DedAiQuantitySource> = {
  EXPLICIT: 'DED_EXPLICIT',
  DERIVED: 'DERIVED',
  ASSUMPTION: 'ASSUMPTION',
  USER_INPUT: 'USER_INPUT',
  // NEEDS_CONFIRMATION = nilai inferensi yang belum jelas — kosakata
  // standar terdekat yang jujur (bukan klaim eksplisit, bukan asumsi
  // yang disetujui).
  NEEDS_CONFIRMATION: 'AI_INFERENCE',
  UNRESOLVED: 'UNRESOLVED',
};

/**
 * Sumber harga Full AI → DedAiPriceSource. Kosakata sama kecuali
 * VERIFIED_SOURCE warisan (klaim model lama yang belum dikonfirmasi
 * database — service menurunkannya ke AI_ESTIMATE/UNRESOLVED;
 * finalizeMapping tidak pernah menaikkannya jadi kanonis): di sini
 * diturunkan ke AI_ESTIMATE — tidak pernah jadi AHSP_2026.
 */
function fullAiPriceSourceToDed(source: FullAiPriceSource): DedAiPriceSource {
  if (source === 'VERIFIED_SOURCE') return 'AI_ESTIMATE';
  return source;
}

export function mapFullAiItemToDedAiItem(item: FullAiItem): DedAiItem {
  const priceSource = fullAiPriceSourceToDed(item.price.source);
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    units: item.quantity.unit,
    quantity: item.quantity.value,
    quantitySource: FULL_AI_QUANTITY_SOURCE[item.quantity.provenance] ?? 'UNRESOLVED',
    quantityFormula: item.quantity.formula,
    quantityNote: item.quantity.notes,
    rawDimensions: item.quantity.dimensions,
    unitPrice: item.price.unitPrice,
    priceSource,
    priceCompletion: item.priceCompletion,
    quantityAudit: item.quantityAudit,
    // ahspCode hanya diteruskan bila sumber benar-benar AHSP_2026
    // (kontrak DedAiItem) — klaim warisan tanpa sumber kanonis tidak
    // membawa kode.
    ...(priceSource === 'AHSP_2026' && item.price.ahspCode
      ? { ahspCode: item.price.ahspCode }
      : {}),
    ahspMatch: item.price.ahspMatch,
    subtotal: item.subtotal,
    aiProposedSubtotal: item.aiProposedSubtotal,
    sourcePages: item.sourcePages ?? item.quantity.sourcePages ?? [],
    provenance: [`FULL_AI:${item.quantity.provenance}`, `HARGA:${item.price.source}`],
    // Stage lampiran: CALCULATED hanya bila subtotal terhitung;
    // selebihnya PRICING (belum lengkap) — tidak pernah REJECTED
    // diam-diam (item tetap terkirim agar Chat AI melihatnya).
    stage: item.subtotal != null ? 'CALCULATED' : 'PRICING',
    wbsCode: item.wbsCode,
    wbsName: item.wbsGroup,
  };
}

/**
 * Bentuk DedAiOutput untuk attachDedToProject dari hasil Full AI.
 * Cakupan + total dihitung dari item yang DITERUSKAN (hasil edit
 * user di layar hasil), bukan dari ringkasan output yang bisa basi.
 */
export function buildFullAiAttachmentOutput(
  output: FullAiOutput,
  items: FullAiItem[],
  meta: {
    projectName: string;
    projectType: DedAiProjectType;
    mode: DedAiMode;
    fileName?: string;
  },
): DedAiOutput {
  const dedItems = items.map(mapFullAiItemToDedAiItem);
  const grandTotal = dedItems
    .filter((it) => it.subtotal != null && it.subtotal > 0)
    .reduce((sum, it) => sum + (it.subtotal ?? 0), 0);
  return {
    success: true,
    jobId: `fullai-chat-${Date.now().toString(36)}`,
    projectType: meta.projectType,
    mode: meta.mode,
    policy: output.policy,
    projectName: meta.projectName,
    fileName: meta.fileName,
    pageCount: output.provenance.documentPages,
    items: dedItems,
    grandTotal,
    aiProposedGrandTotal: output.aiProposedGrandTotal ?? null,
    categorySummaries: [],
    coverage: {
      totalItems: dedItems.length,
      itemsWithQuantity: dedItems.filter((i) => i.quantity != null).length,
      itemsWithPrice: dedItems.filter((i) => i.unitPrice != null).length,
      itemsFullyResolved: dedItems.filter((i) => i.quantity != null && i.unitPrice != null).length,
      itemsUnresolved: dedItems.filter((i) => i.quantity == null || i.unitPrice == null).length,
      itemsWithAssumption: dedItems.filter((i) => i.quantitySource === 'ASSUMPTION').length,
    },
    partial: dedItems.some((i) => i.subtotal == null),
  };
}
