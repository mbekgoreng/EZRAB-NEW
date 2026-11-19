/**
 * dedReviewGate.ts — Logika MURNI chip bukti kuantitas + gerbang review
 * sebelum finalisasi (mockup DED v2.3, ACC owner 2026-11-19 04:14).
 *
 * Modul ini TANPA React: taksonomi chip, daftar item tinjau, dan
 * keputusan "boleh finalisasi" — dipakai kedua tampilan hasil
 * (DedAiResultView mode standar + FullAiResultView mode Full AI).
 * Diuji skrip asersi `src/test/dedReviewGate.mjs` (plain-tsx).
 *
 * Keputusan desain (README mockup §"Keputusan desain"):
 * 1. Kuantitas dari DED adalah KLAIM model, bukan fakta — verifier
 *    tidak bisa dipercaya (false-pass/false-negative terbukti) — maka
 *    chip-nya "Klaim: dimensi DED", tanpa kata "terverifikasi" sebagai
 *    klaim kuantitas di mana pun.
 * 2. Item "Klaim" TIDAK masuk gerbang (mayoritas item DED adalah klaim;
 *    memblokir semuanya membuat finalisasi praktis mustahil) — kejujuran
 *    klaim lewat chip + dasar mentah, bukan lewat gerbang.
 * 3. Item "Input user" TIDAK masuk gerbang — user sudah tahu dasarnya.
 * 5. Full AI: padanan AHSP TIDAK bisa dipilih di dalam mode (mode ini
 *    tidak mengakses katalog AHSP) — user mengakui harga Estimasi AI
 *    lewat gerbang, atau menjalankan ulang di mode EZRAB AI.
 * Keputusan owner no. 3 (tombol "Tandai semua sudah ditinjau") masih
 * TERBUKA — default fail-closed: wajib centang satu per satu.
 *
 * Gerbang ini LAPISAN TAMBAHAN di atas validasi fail-closed yang ada
 * (dedFinalizeValidation.ts): item terblokir (tanpa kuantitas/harga)
 * tidak masuk daftar tinjau DAN tidak pernah bisa difinalisasi —
 * saringan savable di bawah adalah CERMIN persis filter validator
 * itu (stage CALCULATED + subtotal + unitPrice; Full AI: status READY
 * + subtotal > 0 + unitPrice). Bila filter validator berubah, cermin
 * ini WAJIB ikut berubah.
 */
import { mapFullAiItemToDedAiItem } from './dedModeUi';
import type { DedAiItem, DedAiQuantitySource } from './types';
import type { FullAiItem } from '../ded-full-ai/types';

/* ------------------------------------------------------------------ */
/* 1. Chip bukti kuantitas                                            */
/* ------------------------------------------------------------------ */

/** Enam chip taksonomi mockup (§1) — warna persis CSS mockup. */
export type QuantityEvidenceChipKind =
  | 'claim'
  | 'deterministic'
  | 'ai-estimate'
  | 'assumption'
  | 'user'
  | 'unclear';

export interface QuantityEvidenceChip {
  kind: QuantityEvidenceChipKind;
  /** Label tampil (Bahasa Indonesia, persis mockup). */
  label: string;
  /** Penjelasan satu kalimat (title/tooltip) — tanpa klaim "terverifikasi". */
  hint: string;
  bg: string;
  fg: string;
  /** Kelas CSS di dedAi.css (blok "DED Hasil + Gerbang Review"). */
  className: string;
}

const CLAIM_LABEL_STANDARD = 'Klaim: dimensi DED';
const CLAIM_LABEL_FULL_AI = 'Klaim: dari DED';

function makeChip(
  kind: QuantityEvidenceChipKind,
  label: string,
  hint: string,
  bg: string,
  fg: string,
): QuantityEvidenceChip {
  return { kind, label, hint, bg, fg, className: `dedai-qchip-${kind}` };
}

/** Taksonomi chip dari `quantitySource` (label klaim versi standar). */
export const QUANTITY_EVIDENCE_CHIPS: Record<DedAiQuantitySource, QuantityEvidenceChip> = {
  DED_EXPLICIT: makeChip('claim', CLAIM_LABEL_STANDARD,
    'Model mengklaim angka ini dari DED — bukan bukti terverifikasi.', '#FEF3C7', '#92400E'),
  DED_GEOMETRIC: makeChip('claim', CLAIM_LABEL_STANDARD,
    'Model mengklaim angka ini dari dimensi DED — bukan bukti terverifikasi.', '#FEF3C7', '#92400E'),
  DERIVED: makeChip('deterministic', 'Hitungan deterministik',
    'Dihitung deterministik dari dimensi yang tersedia.', '#DBEAFE', '#1D4ED8'),
  AI_INFERENCE: makeChip('ai-estimate', 'Perkiraan AI',
    'Perkiraan model AI tanpa bukti eksplisit yang memadai.', '#EDE9FE', '#6D28D9'),
  ASSUMPTION: makeChip('assumption', 'Asumsi',
    'Nilai asumsi yang perlu disetujui pengguna.', '#FFEDD5', '#C2410C'),
  USER_INPUT: makeChip('user', 'Input user',
    'Nilai yang dimasukkan pengguna secara manual.', '#DCFCE7', '#15803D'),
  UNRESOLVED: makeChip('unclear', 'Belum jelas',
    'Dasar kuantitas belum dapat dipastikan.', '#F1F5F9', '#475569'),
};

/** Legenda enam chip (urutan tampil mockup) untuk baris legenda hasil. */
export const QUANTITY_EVIDENCE_LEGEND: readonly QuantityEvidenceChip[] = [
  QUANTITY_EVIDENCE_CHIPS.DED_EXPLICIT,
  QUANTITY_EVIDENCE_CHIPS.DERIVED,
  QUANTITY_EVIDENCE_CHIPS.AI_INFERENCE,
  QUANTITY_EVIDENCE_CHIPS.ASSUMPTION,
  QUANTITY_EVIDENCE_CHIPS.USER_INPUT,
  QUANTITY_EVIDENCE_CHIPS.UNRESOLVED,
];

/**
 * Chip untuk satu sumber kuantitas. Fail-closed: sumber tak dikenal /
 * kosong → "Belum jelas" (tidak pernah diklaim sebagai klaim DED).
 * `claimLabel` memungkinkan varian Full AI ("Klaim: dari DED",
 * mockup §1) tanpa menduplikasi tabel.
 */
export function quantityEvidenceChipFor(
  source: DedAiQuantitySource | string | null | undefined,
  claimLabel: string = CLAIM_LABEL_STANDARD,
): QuantityEvidenceChip {
  const chip = (source != null && source in QUANTITY_EVIDENCE_CHIPS)
    ? QUANTITY_EVIDENCE_CHIPS[source as DedAiQuantitySource]
    : QUANTITY_EVIDENCE_CHIPS.UNRESOLVED;
  if (chip.kind === 'claim' && claimLabel !== CLAIM_LABEL_STANDARD) {
    return { ...chip, label: claimLabel };
  }
  return chip;
}

/**
 * Chip untuk satu item Full AI: provenance dipetakan dulu lewat
 * `mapFullAiItemToDedAiItem` (yang memakai FULL_AI_QUANTITY_SOURCE di
 * dedModeUi.ts — EXPLICIT→DED_EXPLICIT, DERIVED→DERIVED,
 * ASSUMPTION→ASSUMPTION, NEEDS_CONFIRMATION→AI_INFERENCE,
 * USER_INPUT→USER_INPUT, UNRESOLVED→UNRESOLVED), lalu taksonomi chip
 * yang sama — dengan label klaim versi Full AI ("Klaim: dari DED").
 */
export function quantityEvidenceChipForFullAiItem(item: FullAiItem): QuantityEvidenceChip {
  const mapped = mapFullAiItemToDedAiItem(item);
  return quantityEvidenceChipFor(mapped.quantitySource, CLAIM_LABEL_FULL_AI);
}

/* ------------------------------------------------------------------ */
/* 2. Gerbang review sebelum finalisasi                               */
/* ------------------------------------------------------------------ */

/** Alasan satu item masuk daftar tinjau (satu item bisa punya >1). */
export type ReviewReasonKind = 'QUANTITY_ESTIMATE' | 'PRICE_ESTIMATE' | 'AHSP_CONFIRM';

export interface ReviewGateTag {
  kind: ReviewReasonKind;
  /** Label tag tampil (persis gaya mockup: "Kuantitas: …"). */
  label: string;
  /** Kelas chip di dedAi.css. */
  chipClass: string;
}

export interface ReviewGateItem {
  itemId: string;
  itemName: string;
  reasons: ReviewReasonKind[];
  tags: ReviewGateTag[];
  /**
   * Deskripsi jujur per item, disusun dari catatan data yang ADA
   * (quantityNote / priceAssumptionNote / ahspMatch.reason) + kalimat
   * generik per alasan bila catatannya kosong. TIDAK PERNAH mengarang
   * angka/bukti — kalimat generik hanya menyatakan apa yang harus
   * diperiksa, bukan nilai.
   */
  description: string;
}

const TAG_QUANTITY_AI: ReviewGateTag = {
  kind: 'QUANTITY_ESTIMATE', label: 'Kuantitas: Perkiraan AI', chipClass: 'dedai-qchip-ai-estimate',
};
const TAG_QUANTITY_ASSUMPTION: ReviewGateTag = {
  kind: 'QUANTITY_ESTIMATE', label: 'Kuantitas: Asumsi', chipClass: 'dedai-qchip-assumption',
};
const TAG_PRICE_ESTIMATE: ReviewGateTag = {
  kind: 'PRICE_ESTIMATE', label: 'Harga: Estimasi AI', chipClass: 'dedai-qchip-ai-estimate',
};
const TAG_AHSP: ReviewGateTag = {
  kind: 'AHSP_CONFIRM', label: 'Padanan AHSP belum dikonfirmasi', chipClass: 'dedai-qchip-confirm',
};

/**
 * Saringan savable jalur STANDAR — CERMIN persis filter
 * `validateDedFinalizeBatch` (dedFinalizeValidation.ts): stage
 * CALCULATED + subtotal + unitPrice terisi. Item di luar saringan ini
 * TIDAK masuk gerbang (tidak ada yang bisa "ditinjau sampai lolos" —
 * mereka tetap tidak bisa difinalisasi oleh validator).
 */
export function isSavableDedItem(it: DedAiItem): boolean {
  return it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null;
}

/**
 * Saringan savable jalur FULL AI — CERMIN persis filter
 * `validateFullAiFinalizeBatch`: status READY + subtotal > 0 +
 * unitPrice terisi.
 */
export function isSavableFullAiItem(it: FullAiItem): boolean {
  return it.status === 'READY' && it.subtotal != null && it.subtotal > 0 && it.price.unitPrice != null;
}

export function countSavableDed(items: DedAiItem[]): number {
  return items.filter(isSavableDedItem).length;
}

export function countSavableFullAi(items: FullAiItem[]): number {
  return items.filter(isSavableFullAiItem).length;
}

/**
 * Padanan AHSP perlu konfirmasi ⟺ match berstatus NEEDS_REVIEW dengan
 * ≥1 kandidat (keadaan yang sama dengan pemilih "Pilih" di detail
 * item). Catatan nama: CanonicalMatchStatus memakai NEEDS_REVIEW —
 * itulah status yang dimaksud brief ("berkandidat / status
 * NEEDS_CONFIRMATION"); NEEDS_REVIEW tanpa kandidat tidak bisa dipilih
 * sehingga tidak digerbang sebagai AHSP.
 */
export function needsAhspConfirmation(
  ahspMatch: DedAiItem['ahspMatch'],
): boolean {
  return (
    ahspMatch?.status === 'NEEDS_REVIEW' &&
    Array.isArray(ahspMatch.candidates) &&
    ahspMatch.candidates.length > 0
  );
}

interface GateItemInput {
  id: string;
  name: string;
  quantitySource: DedAiQuantitySource;
  priceSource: string;
  quantityNote?: string;
  priceAssumptionNote?: string;
  ahspMatch?: DedAiItem['ahspMatch'];
}

/** Inti pembangunan satu entri gerbang (dipakai kedua jalur). */
function buildGateItem(input: GateItemInput): ReviewGateItem | null {
  const reasons: ReviewReasonKind[] = [];
  const tags: ReviewGateTag[] = [];
  const descParts: string[] = [];

  if (input.quantitySource === 'AI_INFERENCE' || input.quantitySource === 'ASSUMPTION') {
    reasons.push('QUANTITY_ESTIMATE');
    tags.push(input.quantitySource === 'ASSUMPTION' ? TAG_QUANTITY_ASSUMPTION : TAG_QUANTITY_AI);
    descParts.push(
      input.quantityNote?.trim()
        ? input.quantityNote.trim()
        : input.quantitySource === 'ASSUMPTION'
          ? 'Kuantitas ini asumsi — periksa dasarnya di detail item sebelum menerima.'
          : 'Kuantitas ini perkiraan AI — periksa dasarnya di detail item sebelum menerima.',
    );
  }
  if (input.priceSource === 'AI_ESTIMATE') {
    reasons.push('PRICE_ESTIMATE');
    tags.push(TAG_PRICE_ESTIMATE);
    descParts.push(
      input.priceAssumptionNote?.trim()
        ? input.priceAssumptionNote.trim()
        : 'Harga ini estimasi AI, bukan AHSP kanonis — centang bila Anda menerima harga ini.',
    );
  }
  if (needsAhspConfirmation(input.ahspMatch)) {
    reasons.push('AHSP_CONFIRM');
    tags.push(TAG_AHSP);
    descParts.push(
      input.ahspMatch?.reason?.trim()
        ? `${input.ahspMatch.reason.trim()} Pilih padanan di detail item, atau centang untuk menerima harga yang berlaku.`
        : 'Padanan AHSP belum dikonfirmasi — pilih padanan di detail item, atau centang untuk menerima harga yang berlaku.',
    );
  }

  if (reasons.length === 0) return null;
  return {
    itemId: input.id,
    itemName: input.name,
    reasons,
    tags,
    description: descParts.join(' '),
  };
}

/**
 * Daftar tinjau jalur STANDAR. Klaim (DED_EXPLICIT/DED_GEOMETRIC),
 * hitungan deterministik, input user, dan "Belum jelas" TIDAK masuk
 * lewat kuantitasnya; item terblokir tidak masuk sama sekali.
 */
export function reviewGateItemsForDed(items: DedAiItem[]): ReviewGateItem[] {
  const out: ReviewGateItem[] = [];
  for (const it of items) {
    if (!isSavableDedItem(it)) continue;
    const entry = buildGateItem({
      id: it.id,
      name: it.name,
      quantitySource: it.quantitySource,
      priceSource: it.priceSource,
      quantityNote: it.quantityNote,
      priceAssumptionNote: it.priceAssumptionNote,
      ahspMatch: it.ahspMatch,
    });
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * Daftar tinjau jalur FULL AI. Provenance kuantitas + sumber harga
 * dipetakan lewat `mapFullAiItemToDedAiItem` (FULL_AI_QUANTITY_SOURCE +
 * penurunan VERIFIED_SOURCE warisan → AI_ESTIMATE — plafon jujur yang
 * sama dengan dedProvenance.ts, sehingga harga warisan yang belum
 * terverifikasi ikut digerbang sebagai estimasi). AHSP dibaca dari
 * `price.ahspMatch` (bukan dari hasil pemetaan — nilainya sama).
 * Kandidat AHSP TIDAK bisa dipilih di mode ini (keputusan 5) — gerbang
 * hanya meminta pengakuan harga Estimasi AI.
 */
export function reviewGateItemsForFullAi(items: FullAiItem[]): ReviewGateItem[] {
  const out: ReviewGateItem[] = [];
  for (const it of items) {
    if (!isSavableFullAiItem(it)) continue;
    const mapped = mapFullAiItemToDedAiItem(it);
    const entry = buildGateItem({
      id: it.id,
      name: it.name,
      quantitySource: mapped.quantitySource,
      priceSource: mapped.priceSource,
      quantityNote: it.quantity.notes,
      priceAssumptionNote: it.price.notes,
      ahspMatch: it.price.ahspMatch,
    });
    if (entry) out.push(entry);
  }
  return out;
}

export interface ReviewGateSummary {
  /** Jumlah item dalam daftar tinjau. */
  total: number;
  /** Item dengan alasan kuantitas estimasi/asumsi. */
  quantityCount: number;
  /** Item dengan alasan harga Estimasi AI. */
  priceCount: number;
  /** Item dengan alasan padanan AHSP. */
  ahspCount: number;
}

/** Hitungan per alasan untuk baris ringkasan panel gerbang. */
export function reviewGateSummary(gateItems: ReviewGateItem[]): ReviewGateSummary {
  return {
    total: gateItems.length,
    quantityCount: gateItems.filter((g) => g.reasons.includes('QUANTITY_ESTIMATE')).length,
    priceCount: gateItems.filter((g) => g.reasons.includes('PRICE_ESTIMATE')).length,
    ahspCount: gateItems.filter((g) => g.reasons.includes('AHSP_CONFIRM')).length,
  };
}

/** Jumlah entri gerbang yang sudah dicentang. */
export function reviewedCount(
  gateItems: ReviewGateItem[],
  checkedIds: ReadonlySet<string>,
): number {
  return gateItems.filter((g) => checkedIds.has(g.itemId)).length;
}

/**
 * Gerbang lengkap ⟺ SEMUA entri tinjau dicentang. Daftar kosong
 * (tidak ada yang perlu ditinjau) = lengkap — finalisasi tidak
 * dikunci oleh gerbang yang kosong.
 */
export function isReviewGateComplete(
  gateItems: ReviewGateItem[],
  checkedIds: ReadonlySet<string>,
): boolean {
  return gateItems.every((g) => checkedIds.has(g.itemId));
}

/**
 * Finalisasi diizinkan ⟺ gerbang lengkap DAN ada ≥1 item savable.
 * Batch yang seluruh itemnya terblokir (savableCount 0) TIDAK bisa
 * difinalisasi walau gerbangnya kosong — fail-closed dipertahankan.
 * Ini pertahanan lapis kedua di result view; validator
 * `dedFinalizeValidation` di handler tetap menjadi gerbang akhir.
 */
export function canFinalizeWithGate(args: {
  gateItems: ReviewGateItem[];
  checkedIds: ReadonlySet<string>;
  savableCount: number;
}): boolean {
  if (args.savableCount <= 0) return false;
  return isReviewGateComplete(args.gateItems, args.checkedIds);
}
