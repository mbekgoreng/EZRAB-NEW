/**
 * draftReview.ts — LOGIKA REVIEW DRAFT (P6, FULL REPAIR 2026-11-13,
 * audit Autonomous Estimation §A.5).
 *
 * Kemampuan review yang hilang: edit item draft, remap AHSP
 * pra-approval, harga manual ber-provenance, verifikasi harga
 * eksplisit, putusan asumsi (P5-O2), identifikasi info hilang, dan
 * alur resolve dimensi MISSING (EF-09) — semuanya sebagai fungsi
 * MURNI atas `UniversalDraft` / `DedAttachment` (tanpa React, tanpa
 * storage, tanpa panggilan provider) sehingga dapat diuji langsung
 * dan dipakai panel `DraftReviewPanel`.
 *
 * MODEL PENYIMPANAN (bukan mekanisme baru):
 * - Edit item = mutasi item di `part.generation.items` pada SALINAN
 *   draft (deep copy JSON — draft adalah data JSON polos). Pemanggil
 *   (view.tsx) mengganti singleton + `saveDraft` — persis pola
 *   keputusan koreksi QTO Gate 4. `effectiveItems` / `computeTotals`
 *   / `buildPushPayload` membaca hasil edit tanpa perubahan karena
 *   mereka membaca dari parts yang sama.
 * - Review edit adalah KOREKSI DRAFT KERJA (seperti edit spreadsheet
 *   + keputusan QTO), BUKAN revisi Gate 3: tidak ada bump versi dan
 *   tidak melewati pratinjau aktivasi. Revisi (permintaan chat)
 *   tetap lewat `buildRevisionPreview` + `activateRevision` + guard
 *   P4 — panel hanya MENAMPILKAN pratinjau tertunda + kesiapannya
 *   dan memanggil aktivasi yang sama. Konsekuensi yang dijaga:
 *   edit mengubah `draftFingerprint` (parts) sehingga binding
 *   approval transfer G1 yang tertunda menjadi tidak berlaku
 *   (pengguna wajib pratinjau ulang — benar) dan pratinjau revisi
 *   yang tertunda menjadi stale lewat `baseUpdatedAt` (benar).
 * - Harga manual memakai `part.manualPrices` yang SUDAH ADA
 *   (pola revisi chat) — `effectiveItems` menerapkannya sebagai
 *   PRICE_MANUAL. Harga manual BUKAN PRICE_RESOLVED dan tidak
 *   pernah menjadi resmi tanpa verifikasi eksplisit.
 * - Remap AHSP memakai resolver yang SUDAH ADA
 *   (`officialAhspRepository` → `priceResolver2026`, preseden
 *   `operations.buildAddPlan`): hanya komposisi FULL yang menjadi
 *   PRICE_RESOLVED + OFFICIAL_AHSP; PARTIAL/MISSING → item menjadi
 *   PRICE_UNRESOLVED (harga lama TIDAK dipakai lagi — dicatat di
 *   penjelasan, bukan dipertahankan diam-diam); satuan tak cocok →
 *   DITOLAK (UNIT_MISMATCH memblokir, CON-11); kode tak dikenal →
 *   DITOLAK (tidak ditebak/dipetakan diam-diam).
 * - `verificationDate` HANYA diisi `verifyDraftItemPrice` (aksi
 *   verifikasi eksplisit user). Edit biasa / harga manual / putusan
 *   asumsi TIDAK mengisinya (semantik P5-O2).
 * - `userDecisionStatus` HANYA diisi `decideDraftItemAssumption`
 *   (approve/reject/PERLU_REVISI atas item ber-asumsi/estimasi).
 *   Putusan TIDAK menghapus item — DITOLAK berarti "perlu revisi",
 *   item tetap tampil dengan penanda.
 *
 * TIDAK ADA harga/koefisien/formula/dimensi yang dikarang di sini:
 * harga remap dari resolver, kuantitas MISSING dari
 * `expectedQuantityFromDimensions` (qtoBridge) atas dimensi yang
 * diisi user, sisanya adalah input eksplisit user.
 */

import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { normalizeUnit } from '../../data/priceDatabase2026/normalize';
import { formatRupiah } from '../../engine/formulaEngine';
import type { UserDecisionStatus } from '../../types';
import {
  effectiveItems,
  isPriceValidForTotal,
  itemKey,
  rebuildWbsAttachment,
  type DraftItem,
  type DraftPart,
  type UniversalDraft,
} from './universalRab';
import {
  expectedQuantityFromDimensions,
  type QtoCheck,
  type QtoUserDimensions,
} from './qtoBridge';
import type { DedAttachment, QtoDecision } from './dedQtoIntegration';

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type ReviewResult =
  | { ok: true; draft: UniversalDraft; message: string }
  | { ok: false; message: string };

export interface LocatedDraftItem {
  part: DraftPart;
  partIndex: number;
  /** Item GENERATION (bukan item efektif — edit menarget ini). */
  item: DraftItem;
  itemIndex: number;
  /** Item efektif terkait (harga manual sudah diterapkan). */
  effective: DraftItem;
}

/**
 * Cari item draft dari ID efektif (`templateId::id` — skema yang
 * SAMA dengan `effectiveItems`). Item yang sudah dihapus (removedKeys)
 * tidak dapat ditemukan (sudah tidak ada di draft). Bila dua part
 * memakai template yang sama (multi-gedung), ID efektif bertabrakan —
 * `buildingId` (dari `__buildingId` item efektif) dipakai untuk
 * mendisambiguasi; tanpa petunjuk yang cukup, pencarian gagal jujur
 * daripada mengedit gedung yang salah.
 */
export function locateDraftItem(
  draft: UniversalDraft,
  itemId: string,
  hint?: { buildingId?: string | null },
): LocatedDraftItem | null {
  const effective = effectiveItems(draft).find((i) => i.id === itemId);
  if (!effective) return null;
  const candidates: LocatedDraftItem[] = [];
  draft.parts.forEach((part, partIndex) => {
    part.generation.items.forEach((raw, itemIndex) => {
      if (`${part.template.id}::${raw.id}` !== itemId) return;
      if (part.removedKeys.includes(itemKey(raw))) return;
      candidates.push({ part, partIndex, item: raw as DraftItem, itemIndex, effective });
    });
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const wanted = hint?.buildingId ?? effective.__buildingId ?? null;
  const disambiguated = candidates.filter(
    (c) => (c.part.buildingId ?? null) === wanted,
  );
  if (disambiguated.length === 1) return disambiguated[0];
  return null;
}

/** Keterangan perubahan untuk `draft.changes` (log versi berjalan). */
function recordChange(draft: UniversalDraft, entry: string): void {
  draft.changes = [...(draft.changes ?? []), entry];
}

/* ------------------------------------------------------------------ */
/* Edit item: deskripsi / catatan (spek) / volume                      */
/*                                                                     */
/* RabItem tidak punya field `specification` (itu milik RABItem) —     */
/* "spek" item draft hidup di `notes` (jejak hitung / catatan spek     */
/* dari generator), jadi edit spek = edit `notes`.                     */
/* ------------------------------------------------------------------ */

export interface DraftItemEditPatch {
  description?: string;
  /** Catatan/spek item (`notes` — termasuk jejak formula generator). */
  notes?: string;
  volume?: number;
}

export function editDraftItem(
  draft: UniversalDraft,
  itemId: string,
  patch: DraftItemEditPatch,
  hint?: { buildingId?: string | null },
): ReviewResult {
  const next = deepCopy(draft);
  const loc = locateDraftItem(next, itemId, hint);
  if (!loc) {
    return { ok: false, message: `Item tidak ditemukan di draft ini (id ${itemId}) — mungkin sudah dihapus atau ada di gedung lain. Tidak ada yang berubah.` };
  }
  const { part, item } = loc;
  const changed: string[] = [];

  if (patch.description !== undefined) {
    const desc = patch.description.trim();
    if (!desc) {
      return { ok: false, message: 'Uraian item tidak boleh kosong. Tidak ada yang berubah.' };
    }
    if (desc !== item.description) {
      // Harga manual dikunci itemKey(uraian+satuan) — uraian berubah
      // berarti kuncinya berubah: PINDAHKAN entri manual ke kunci
      // baru agar harga manual tidak hilang senyap.
      const oldKey = itemKey(item);
      const newKey = itemKey({ description: desc, unit: item.unit });
      const manual = part.manualPrices[oldKey];
      if (manual && oldKey !== newKey) {
        delete part.manualPrices[oldKey];
        part.manualPrices[newKey] = manual;
      }
      changed.push(`uraian "${item.description}" → "${desc}"`);
      item.description = desc;
    }
  }
  if (patch.notes !== undefined) {
    const notes = patch.notes.trim();
    if (notes !== (item.notes ?? '')) {
      changed.push(notes ? 'catatan/spek diubah' : 'catatan/spek dikosongkan');
      item.notes = notes;
    }
  }
  if (patch.volume !== undefined) {
    const v = patch.volume;
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, message: `Volume baru (${String(v)}) tidak valid — volume harus angka lebih dari 0. Tidak ada yang berubah.` };
    }
    if (v !== item.volume) {
      changed.push(`volume ${item.volume} → ${v} ${item.unit}`);
      item.volume = v;
      // Jumlah dihitung ulang dari harga generasi (bila ada); bila
      // item memakai harga manual, effectiveItems menghitung ulang
      // jumlahnya dari manual — nilai generasi di sini tetap konsisten.
      item.amount = item.unitPrice != null ? v * item.unitPrice : null;
      item.totalPrice = item.amount;
    }
  }
  if (changed.length === 0) {
    return { ok: false, message: 'Tidak ada perubahan (nilai yang dimasukkan sama dengan yang sudah ada).' };
  }
  recordChange(next, `Review: item "${item.description}" diubah (${changed.join('; ')})`);
  // Uraian memengaruhi klasifikasi WBS (kata kunci scope) — bangun
  // ulang artefak + laporan agar tidak basi; pengecualian/catatan
  // user dipertahankan via previousArtifact.
  rebuildWbsAttachment(next, draft.wbsArtifact ?? null);
  return {
    ok: true,
    draft: next,
    message: `Item "${item.description}" diperbarui (${changed.join('; ')}).`,
  };
}

/* ------------------------------------------------------------------ */
/* Harga manual (mekanisme manualPrices yang sudah ada)                */
/* ------------------------------------------------------------------ */

export function setDraftItemManualPrice(
  draft: UniversalDraft,
  itemId: string,
  unitPrice: number,
  note?: string,
  hint?: { buildingId?: string | null },
): ReviewResult {
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { ok: false, message: `Harga manual (${String(unitPrice)}) tidak valid — harus angka 0 atau lebih. Tidak ada yang berubah.` };
  }
  const next = deepCopy(draft);
  const loc = locateDraftItem(next, itemId, hint);
  if (!loc) {
    return { ok: false, message: `Item tidak ditemukan di draft ini (id ${itemId}). Tidak ada yang berubah.` };
  }
  const { part, item } = loc;
  const cleanNote = (note ?? '').trim();
  part.manualPrices[itemKey(item)] = {
    unitPrice,
    note: cleanNote || `Harga manual dari review (${formatRupiah(unitPrice)} per ${item.unit})`,
  };
  // Harga manual BUKAN harga terverifikasi: tandai NEEDS_VERIFICATION
  // (generasi template tidak pernah mengisi verificationStatus, jadi
  // tidak ada nilai asli yang hilang — clear mengembalikan ke absen).
  // BUKAN PRICE_RESOLVED dan TIDAK mengisi verificationDate — tanggal
  // verifikasi hanya dari aksi verifikasi eksplisit.
  item.verificationStatus = 'NEEDS_VERIFICATION';
  recordChange(
    next,
    `Review: harga manual ${formatRupiah(unitPrice)} per ${item.unit} ditetapkan untuk "${item.description}" (perlu verifikasi)`,
  );
  return {
    ok: true,
    draft: next,
    message:
      `Harga manual ${formatRupiah(unitPrice)} per ${item.unit} ditetapkan untuk "${item.description}" — ` +
      `status HARGA MANUAL (bukan harga resmi) dan perlu verifikasi.`,
  };
}

/** Hapus harga manual — item kembali memakai harga generasi/resolver. */
export function clearDraftItemManualPrice(
  draft: UniversalDraft,
  itemId: string,
  hint?: { buildingId?: string | null },
): ReviewResult {
  const next = deepCopy(draft);
  const loc = locateDraftItem(next, itemId, hint);
  if (!loc) {
    return { ok: false, message: `Item tidak ditemukan di draft ini (id ${itemId}). Tidak ada yang berubah.` };
  }
  const { part, item } = loc;
  const key = itemKey(item);
  if (!part.manualPrices[key]) {
    return { ok: false, message: `Item "${item.description}" tidak memakai harga manual — tidak ada yang dihapus.` };
  }
  delete part.manualPrices[key];
  // Kembalikan status verifikasi ke keadaan generasi (absen — factory
  // menurunkan dari harga saat transfer, seperti item lain).
  delete item.verificationStatus;
  recordChange(next, `Review: harga manual item "${item.description}" dihapus (kembali ke harga generasi)`);
  return {
    ok: true,
    draft: next,
    message: `Harga manual "${item.description}" dihapus — item kembali memakai harga generasi.`,
  };
}

/* ------------------------------------------------------------------ */
/* Remap AHSP pra-approval (EF-06)                                     */
/*                                                                     */
/* Preseden: operations.buildAddPlan — getOfficialAhsp(code) lalu      */
/* resolveAhspUnitPrice; hanya FULL yang berharga. Bukan mekanisme     */
/* kedua: lookup default memakai resolver yang sama; injeksi           */
/* `priceLookup` HANYA untuk tes stub (tanpa data master 16 MB).       */
/* ------------------------------------------------------------------ */

export interface AhspPriceLookupResult {
  /** Kode ada di katalog resmi. */
  found: boolean;
  /** Satuan katalog (bila ditemukan). */
  catalogUnit?: string;
  /** Status komposisi resolver (FULL / PARTIAL / MISSING). */
  pricingStatus?: string;
  resolvedComponents?: number;
  totalComponents?: number;
  /** Harga satuan resolver bila FULL; null bila bukan FULL / gagal. */
  unitPrice?: number | null;
  /** Pesan kegagalan resolver (bukan "tidak ditemukan"). */
  error?: string;
}

export type AhspPriceLookup = (
  code: string,
  itemUnit: string,
) => AhspPriceLookupResult;

/** Lookup produksi: katalog resmi + resolver (tanpa tebakan). */
export function defaultAhspPriceLookup(code: string, itemUnit: string): AhspPriceLookupResult {
  let rec: ReturnType<typeof officialAhspRepository.getOfficialAhsp>;
  try {
    rec = officialAhspRepository.getOfficialAhsp(code);
  } catch (e) {
    return { found: false, error: `Katalog AHSP tidak dapat dibaca (${e instanceof Error ? e.message : String(e)}).` };
  }
  if (!rec) return { found: false };
  if (normalizeUnit(rec.unit) !== normalizeUnit(itemUnit)) {
    return { found: true, catalogUnit: rec.unit };
  }
  let comp: ReturnType<typeof priceResolver2026.resolveAhspUnitPrice>;
  try {
    comp = priceResolver2026.resolveAhspUnitPrice(rec);
  } catch (e) {
    return { found: true, catalogUnit: rec.unit, error: `Resolver AHSP gagal untuk kode ${code} (${e instanceof Error ? e.message : String(e)}).` };
  }
  return {
    found: true,
    catalogUnit: rec.unit,
    pricingStatus: comp.pricingStatus,
    resolvedComponents: comp.resolvedComponents,
    totalComponents: comp.totalComponents,
    unitPrice: comp.pricingStatus === 'FULL' && comp.unitPrice != null ? comp.unitPrice : null,
  };
}

export type RemapOutcome = 'RESOLVED' | 'UNPRICED';

export type RemapResult =
  | { ok: true; draft: UniversalDraft; message: string; outcome: RemapOutcome; unitPrice: number | null }
  | { ok: false; message: string };

/** Bersihkan provenance harga lama yang tidak lagi berlaku sesudah remap. */
function clearStalePriceProvenance(item: DraftItem): void {
  delete item.priceCostBasis;
  delete item.priceSourceName;
  delete item.priceSourceSupplier;
  delete item.priceSourceDate;
  delete item.priceSourceRegion;
  delete item.ahspSnapshot;
  delete item.isPartial;
  delete item.unresolvedComponentCount;
  delete item.priceValidationWarnings;
}

export function remapDraftItemAhsp(
  draft: UniversalDraft,
  itemId: string,
  newCode: string,
  opts?: { priceLookup?: AhspPriceLookup; buildingId?: string | null },
): RemapResult {
  const code = (newCode ?? '').trim();
  if (!code) {
    return { ok: false, message: 'Kode AHSP baru kosong — pilih kode dari katalog resmi. Tidak ada yang berubah.' };
  }
  const next = deepCopy(draft);
  const loc = locateDraftItem(next, itemId, { buildingId: opts?.buildingId });
  if (!loc) {
    return { ok: false, message: `Item tidak ditemukan di draft ini (id ${itemId}). Tidak ada yang berubah.` };
  }
  const { part, item, effective } = loc;
  const oldCode = item.ahspCode ?? '';
  if (code === oldCode) {
    return { ok: false, message: `Item "${item.description}" sudah memakai kode ${code || '(tanpa kode)'} — tidak ada yang berubah.` };
  }
  const lookup = opts?.priceLookup ?? defaultAhspPriceLookup;
  const res = lookup(code, item.unit);
  if (res.error) {
    return { ok: false, message: `${res.error} Remap dibatalkan — tidak ada yang berubah.` };
  }
  if (!res.found) {
    return {
      ok: false,
      message: `Kode ${code} tidak ditemukan di katalog AHSP resmi 2026 — remap dibatalkan. Kode tidak ditebak dan tidak dipetakan diam-diam; cari kode yang benar lewat pencarian AHSP.`,
    };
  }
  if (res.catalogUnit != null && normalizeUnit(res.catalogUnit) !== normalizeUnit(item.unit)) {
    return {
      ok: false,
      message:
        `Kode ${code} bersatuan "${res.catalogUnit}", sedangkan item "${item.description}" bersatuan "${item.unit}" — ` +
        `UNIT_MISMATCH: remap DIBLOKIR (harga per satuan yang berbeda tidak dapat dipakai). Pilih kode dengan satuan ${item.unit}.`,
    };
  }
  const oldPriceText = isPriceValidForTotal(effective)
    ? formatRupiah(effective.unitPrice as number)
    : 'belum tersedia';
  // Harga manual menutupi (shadow) harga generasi di effectiveItems —
  // remap HARUS menghapusnya, kalau tidak harga baru tidak pernah tampil.
  const hadManual = Boolean(part.manualPrices[itemKey(item)]);
  if (hadManual) delete part.manualPrices[itemKey(item)];

  item.ahspCode = code;
  clearStalePriceProvenance(item);
  if (res.unitPrice != null && res.pricingStatus === 'FULL') {
    item.unitPrice = res.unitPrice;
    item.amount = item.volume * res.unitPrice;
    item.totalPrice = item.amount;
    item.priceStatus = 'PRICE_RESOLVED';
    item.priceSourceKind = 'OFFICIAL_AHSP';
    item.priceSourceLabel = 'Harga Resmi AHSP 2026';
    item.priceSourceExplanation =
      `Kode AHSP diubah dari ${oldCode || '(tanpa kode)'} menjadi ${code} saat review; ` +
      `harga dari komposisi resmi AHSP 2026 (resolver, status FULL).`;
    item.ahspMappingStatus = 'VERIFIED';
    recordChange(
      next,
      `Review: kode AHSP "${item.description}" ${oldCode || '(tanpa kode)'} → ${code} (harga resmi ${formatRupiah(res.unitPrice)} per ${item.unit}${hadManual ? '; harga manual lama dihapus' : ''})`,
    );
    return {
      ok: true,
      draft: next,
      message:
        `Kode AHSP "${item.description}" diubah menjadi ${code} — harga resmi ${formatRupiah(res.unitPrice)} per ${item.unit} ` +
        `(komposisi FULL).${hadManual ? ' Harga manual lama dihapus karena sudah diganti harga resmi.' : ''}`,
      outcome: 'RESOLVED',
      unitPrice: res.unitPrice,
    };
  }
  // Bukan FULL: TIDAK ADA harga resmi yang dapat dipakai — item menjadi
  // UNRESOLVED jujur (harga lama tidak dipertahankan: harga itu milik
  // kode lama). Penjelasan mencatat harga lama sebagai TEKS (bukan
  // sebagai harga) agar tidak hilang tanpa jejak.
  const statusText =
    res.pricingStatus === 'PARTIAL' && res.resolvedComponents != null && res.totalComponents != null
      ? `status PARTIAL — ${res.resolvedComponents}/${res.totalComponents} komponen terisi`
      : `status ${res.pricingStatus ?? 'tidak diketahui'}`;
  item.unitPrice = null;
  item.amount = null;
  item.totalPrice = null;
  item.priceStatus = 'PRICE_UNRESOLVED';
  item.priceSourceKind = 'UNRESOLVED';
  item.priceSourceLabel = 'Belum ada harga';
  item.priceSourceExplanation =
    `Kode AHSP diubah dari ${oldCode || '(tanpa kode)'} menjadi ${code} saat review; ` +
    `${code} belum punya harga resmi lengkap (${statusText}) — harga lama ${oldPriceText} (kode ${oldCode || '(tanpa kode)'}) ` +
    `tidak dipakai lagi. Tetapkan harga manual bila perlu.`;
  item.ahspMappingStatus = 'MAPPED_UNPRICED';
  item.verificationStatus = 'NEEDS_VERIFICATION';
  recordChange(
    next,
    `Review: kode AHSP "${item.description}" ${oldCode || '(tanpa kode)'} → ${code} (belum punya harga resmi lengkap — item menjadi BELUM TERSEDIA${hadManual ? '; harga manual lama dihapus' : ''})`,
  );
  return {
    ok: true,
    draft: next,
    message:
      `Kode AHSP "${item.description}" diubah menjadi ${code}, tetapi kode itu belum punya harga resmi lengkap (${statusText}) — ` +
      `item kini BELUM TERSEDIA (harga lama ${oldPriceText} tidak dipakai lagi). Tetapkan harga manual bila perlu.`,
    outcome: 'UNPRICED',
    unitPrice: null,
  };
}

/* ------------------------------------------------------------------ */
/* Verifikasi harga eksplisit + putusan asumsi (P5-O2)                 */
/*                                                                     */
/* SEMANTIK (dicatat, bukan diam-diam):                                */
/* - verificationDate = stempel aksi verifikasi harga EKSPILISIT      */
/*   oleh user (tombol "Verifikasi harga" di panel review). Edit      */
/*   biasa, harga manual, dan putusan asumsi TIDAK mengisinya.         */
/*   Verifikasi ulang memperbarui tanggalnya (aksi terbaru menang).    */
/* - userDecisionStatus = putusan user atas ASUMSI/ESTIMASI item      */
/*   (DISETUJUI / DITOLAK / PERLU_REVISI). Hanya untuk item yang      */
/*   memang membawa asumsi (PRICE_ESTIMATED / EZRAB_ASSUMPTION) —     */
/*   item resmi penuh tidak punya asumsi untuk diputuskan.             */
/* - Verifikasi harga TIDAK mengisi userDecisionStatus dan putusan     */
/*   asumsi TIDAK mengisi verificationDate: keduanya sumbu berbeda    */
/*   (harga terverifikasi vs asumsi disetujui).                        */
/* ------------------------------------------------------------------ */

export function verifyDraftItemPrice(
  draft: UniversalDraft,
  itemId: string,
  opts?: { at?: string; buildingId?: string | null },
): ReviewResult {
  const next = deepCopy(draft);
  const loc = locateDraftItem(next, itemId, { buildingId: opts?.buildingId });
  if (!loc) {
    return { ok: false, message: `Item tidak ditemukan di draft ini (id ${itemId}). Tidak ada yang berubah.` };
  }
  const { item, effective } = loc;
  if (!isPriceValidForTotal(effective)) {
    return {
      ok: false,
      message: `Item "${item.description}" belum punya harga — tidak ada yang dapat diverifikasi. Tetapkan harganya dulu (remap AHSP / harga manual).`,
    };
  }
  const at = opts?.at ?? new Date().toISOString();
  const wasVerified = item.verificationStatus === 'VERIFIED' && !!item.verificationDate;
  item.verificationStatus = 'VERIFIED';
  item.verificationDate = at;
  return {
    ok: true,
    draft: next,
    message: wasVerified
      ? `Harga "${item.description}" diverifikasi ulang oleh Anda (${at.slice(0, 10)}).`
      : `Harga "${item.description}" (${formatRupiah(effective.unitPrice as number)} per ${item.unit}) diverifikasi oleh Anda — tanggal verifikasi tercatat.`,
  };
}

export type AssumptionDecision = 'DISETUJUI' | 'DITOLAK' | 'PERLU_REVISI';

/** Apakah item efektif membawa asumsi/estimasi yang dapat diputuskan. */
export function itemHasDecidableAssumption(item: DraftItem): boolean {
  return item.priceStatus === 'PRICE_ESTIMATED' || item.priceSourceKind === 'EZRAB_ASSUMPTION';
}

export function decideDraftItemAssumption(
  draft: UniversalDraft,
  itemId: string,
  decision: AssumptionDecision,
  hint?: { buildingId?: string | null },
): ReviewResult {
  const next = deepCopy(draft);
  const loc = locateDraftItem(next, itemId, hint);
  if (!loc) {
    return { ok: false, message: `Item tidak ditemukan di draft ini (id ${itemId}). Tidak ada yang berubah.` };
  }
  const { item, effective } = loc;
  if (!itemHasDecidableAssumption(effective)) {
    return {
      ok: false,
      message: `Item "${item.description}" tidak membawa asumsi/estimasi (harganya ${effective.priceStatus === 'PRICE_MANUAL' ? 'manual' : 'resmi/terverifikasi'}) — tidak ada asumsi untuk diputuskan.`,
    };
  }
  item.userDecisionStatus = decision;
  const verb =
    decision === 'DISETUJUI'
      ? 'disetujui — asumsi/estimasi ini dipakai'
      : decision === 'DITOLAK'
        ? 'ditolak — item ditandai perlu revisi (item TIDAK dihapus)'
        : 'ditandai perlu revisi';
  return {
    ok: true,
    draft: next,
    message: `Asumsi/estimasi "${item.description}" ${verb}. Keputusan tercatat.`,
  };
}

/* ------------------------------------------------------------------ */
/* Identifikasi info hilang (agregasi murni untuk panel)               */
/* ------------------------------------------------------------------ */

export interface MissingInfoSummary {
  unpriced: DraftItem[];
  needsMapping: DraftItem[];
  estimated: DraftItem[];
  /** Item yang asumsinya DITOLAK / PERLU_REVISI (menunggu tindak lanjut). */
  rejected: DraftItem[];
  /** Check DED/QTO berverdict MISSING (dimensi hilang — alur C). */
  missingDims: QtoCheck[];
  /** Masalah kelengkapan WBS/spek (dari laporan tersimpan). */
  wbsIssues: string[];
  totalIssues: number;
}

export function identifyMissingInfo(draft: UniversalDraft): MissingInfoSummary {
  const items = effectiveItems(draft);
  const unpriced = items.filter((i) => !isPriceValidForTotal(i));
  const needsMapping = items.filter((i) => i.ahspMappingStatus === 'NEEDS_MAPPING');
  const estimated = items.filter((i) => itemHasDecidableAssumption(i));
  const rejected = items.filter(
    (i) => i.userDecisionStatus === 'DITOLAK' || i.userDecisionStatus === 'PERLU_REVISI',
  );
  const missingDims = (draft.dedQto?.checks ?? []).filter((c) => c.verdict === 'MISSING');
  const wbsIssues = draft.wbsCompleteness?.issues ?? [];
  return {
    unpriced,
    needsMapping,
    estimated,
    rejected,
    missingDims,
    wbsIssues,
    totalIssues:
      unpriced.length + needsMapping.length + rejected.length + missingDims.length + wbsIssues.length,
  };
}

/** Baris ringkasan info hilang siap tampil di chat (Bahasa Indonesia). */
export function formatMissingInfoLines(draft: UniversalDraft): string[] {
  const s = identifyMissingInfo(draft);
  if (s.totalIssues === 0) {
    return ['**Info hilang:** tidak ada — semua item berharga, terpetakan, dan WBS lengkap.'];
  }
  const lines = [`**Info hilang (${s.totalIssues} masalah):**`];
  if (s.unpriced.length > 0) {
    lines.push(`• Belum berharga (${s.unpriced.length}): ${s.unpriced.slice(0, 5).map((i) => i.description).join('; ')}${s.unpriced.length > 5 ? ` (+${s.unpriced.length - 5} lagi)` : ''}`);
  }
  if (s.needsMapping.length > 0) {
    lines.push(`• Perlu pemetaan AHSP (${s.needsMapping.length}): ${s.needsMapping.slice(0, 5).map((i) => i.description).join('; ')}${s.needsMapping.length > 5 ? ` (+${s.needsMapping.length - 5} lagi)` : ''}`);
  }
  if (s.estimated.length > 0) {
    lines.push(`• Asumsi/estimasi menunggu putusan (${s.estimated.length} item) — setujui/tolak di panel Review.`);
  }
  if (s.rejected.length > 0) {
    lines.push(`• Asumsi ditolak / perlu revisi (${s.rejected.length}): ${s.rejected.map((i) => i.description).join('; ')}`);
  }
  if (s.missingDims.length > 0) {
    lines.push(`• Dimensi DED hilang (${s.missingDims.length}): ${s.missingDims.map((c) => c.description).join('; ')} — lengkapi dimensinya di panel Review.`);
  }
  for (const issue of s.wbsIssues.slice(0, 5)) lines.push(`• WBS: ${issue}`);
  if (s.wbsIssues.length > 5) lines.push(`• (+${s.wbsIssues.length - 5} masalah WBS lainnya)`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Alur resolve dimensi MISSING (EF-09)                                */
/*                                                                     */
/* Koreksi QTO yang ADA hanya untuk MISMATCH (proposeQtoCorrections    */
/* menolak MISSING: "tidak ada angka untuk dikoreksi"). Alur ini      */
/* melengkapinya: user mengisi DIMENSI yang hilang, kuantitas          */
/* dihitung ulang lewat `expectedQuantityFromDimensions` (qtoBridge —  */
/* kalkulator QTO yang ada, bukan rumus baru), dan hasilnya dicatat    */
/* sebagai keputusan USER_INPUT di lampiran (pola applyQtoCorrection:  */
/* kuantitas DED asli — di sini null/MISSING — tidak pernah hilang     */
/* dari jejak; keputusan append-only per item+angka, idempotent).      */
/*                                                                     */
/* CATATAN F1 (P3C): `quantityFormula` + `derivation.notes` DED       */
/* dibuang `projectItem` sehingga proposal MISSING tidak membawa       */
/* rumus (formula: null) — hitung ulang TIDAK membutuhkannya (berbasis */
/* dimensi via qtoBridge), jadi F1 tidak menghalangi alur ini;        */
/* rumus tampil sesudah F1 ditutup.                                    */
/* ------------------------------------------------------------------ */

export interface MissingDimensionProposal {
  /** Id stabil: `missing:<itemId>` — sama di tiap rekomputasi. */
  id: string;
  itemId: string;
  description: string;
  unit: string;
  quantityNote: string | null;
  /** Rumus DED bila tersedia (saat ini selalu null — F1, lihat atas). */
  formula: string | null;
  checkDetail: string;
}

/** Item DED berverdict MISSING yang menunggu dimensi dari user. */
export function listMissingDimensionItems(
  attachment: DedAttachment,
  checks: QtoCheck[],
): MissingDimensionProposal[] {
  const out: MissingDimensionProposal[] = [];
  for (const c of checks) {
    if (c.verdict !== 'MISSING') continue;
    const item = attachment.items.find((it) => it.name === c.description);
    if (!item) continue;
    // Sudah diputuskan (dimensi sudah dilengkapi dengan angka yang
    // sama) tidak ditawarkan lagi — keputusan append-only.
    const decided = attachment.decisions.some(
      (d) => d.itemId === item.id && d.verdict === 'MISSING' && d.action === 'confirmed',
    );
    if (decided) continue;
    out.push({
      id: `missing:${item.id}`,
      itemId: item.id,
      description: c.description,
      unit: c.unit,
      quantityNote: item.quantityNote ?? null,
      formula: null,
      checkDetail: c.detail,
    });
  }
  return out;
}

export type MissingResolutionResult =
  | { ok: true; attachment: DedAttachment; message: string; expectedQuantity: number; basis: string; alreadyApplied?: boolean }
  | { ok: false; message: string };

/** Petunjuk dimensi yang dibutuhkan (dari cabang qtoBridge — bukan karangan). */
export function missingDimsHint(unit: string): string {
  const u = normalizeUnit(unit);
  if (u === 'm3') return 'butuh panjang × lebar × kedalaman/tebal, atau luas bangunan × tebal';
  if (u === 'm2') return 'butuh panjang × lebar, atau luas bangunan';
  return 'kuantitas item ini tidak dapat diturunkan dari dimensi (bukan volume/luas) — isi kuantitasnya lewat koreksi volume item draft';
}

function validateDims(dims: QtoUserDimensions): string | null {
  const labels: Array<[keyof QtoUserDimensions, string]> = [
    ['lengthM', 'panjang'],
    ['widthM', 'lebar'],
    ['depthM', 'kedalaman'],
    ['heightM', 'tinggi'],
    ['buildingAreaM2', 'luas bangunan'],
    ['landAreaM2', 'luas lahan'],
    ['thicknessM', 'tebal'],
    ['floors', 'jumlah lantai'],
  ];
  let filled = 0;
  for (const [key, label] of labels) {
    const v = dims[key];
    if (v == null) continue;
    filled++;
    if (!Number.isFinite(v) || (v as number) <= 0) {
      return `Dimensi "${label}" tidak valid (${String(v)}) — harus angka lebih dari 0.`;
    }
  }
  if (filled === 0) return 'Belum ada dimensi yang diisi — isi minimal satu dimensi.';
  return null;
}

/**
 * Terapkan resolve MISSING sesudah user mengisi dimensi.
 * `dims` = himpunan dimensi LENGKAP yang dipakai hitung (panel
 * menggabungkan dims tersimpan dedQto + isian user). Pertahanan
 * berlapis (pola applyQtoCorrection): check SAAT INI harus MISSING;
 * dimensi divalidasi; hitung ulang HARUS menghasilkan angka lewat
 * qtoBridge (bila null → ditolak jujur, bukan ditebak); keputusan
 * yang sama tidak diterapkan dua kali.
 */
export function resolveMissingDimensions(
  attachment: DedAttachment,
  itemId: string,
  dims: QtoUserDimensions,
  currentChecks: QtoCheck[],
  opts?: { decidedAt?: string },
): MissingResolutionResult {
  const item = attachment.items.find((it) => it.id === itemId);
  if (!item) {
    return { ok: false, message: 'Item DED tidak ditemukan di lampiran — tidak ada yang berubah.' };
  }
  const current = currentChecks.find((c) => c.description === item.name);
  if (!current || current.verdict !== 'MISSING') {
    return {
      ok: false,
      message: `Item "${item.name}" TIDAK dapat di-resolve: pemeriksaan QTO saat ini berverdict ${current?.verdict ?? 'tidak ditemukan'} (bukan MISSING) — hanya item MISSING yang menunggu dimensi.`,
    };
  }
  const dimsError = validateDims(dims);
  if (dimsError) {
    return { ok: false, message: `${dimsError} Tidak ada yang berubah.` };
  }
  const { expected, basis } = expectedQuantityFromDimensions(
    { description: item.name, quantity: null, unit: item.units },
    dims,
  );
  if (expected == null || !Number.isFinite(expected) || expected <= 0) {
    return {
      ok: false,
      message:
        `Dimensi yang diisi belum cukup untuk menghitung "${item.name}" (${missingDimsHint(item.units)}). ` +
        `Lengkapi dimensinya — kuantitas tidak ditebak.`,
    };
  }
  const existing = attachment.decisions.find(
    (d) => d.itemId === itemId && d.verdict === 'MISSING' && d.correctedQuantity === expected,
  );
  if (existing) {
    return {
      ok: true,
      attachment,
      alreadyApplied: true,
      expectedQuantity: expected,
      basis: basis ?? '',
      message: `Dimensi "${item.name}" sudah dilengkapi sebelumnya (${expected} ${item.units}) — tidak diterapkan dua kali.`,
    };
  }
  const decidedAt = opts?.decidedAt ?? new Date().toISOString();
  const next: DedAttachment = {
    ...attachment,
    items: attachment.items.map((it) =>
      it.id === itemId
        ? {
            ...it,
            quantity: expected,
            quantitySource: 'USER_INPUT',
            quantityNote:
              `Dimensi dilengkapi pengguna saat review (${basis ?? 'dimensi pengguna'} → ${expected} ${it.units}). ` +
              `Kuantitas DED asli: tidak ada (MISSING).`,
          }
        : it,
    ),
    decisions: [
      ...attachment.decisions,
      {
        itemId,
        description: item.name,
        verdict: 'MISSING',
        action: 'confirmed',
        originalQuantity: null,
        correctedQuantity: expected,
        unit: item.units,
        decidedAt,
      } satisfies QtoDecision,
    ],
  };
  return {
    ok: true,
    attachment: next,
    expectedQuantity: expected,
    basis: basis ?? '',
    message:
      `Dimensi "${item.name}" dilengkapi: kuantitas ${expected} ${item.units} ` +
      `(${basis ?? 'dihitung dari dimensi pengguna'}) — tercatat sebagai kuantitas Anda (sumber: USER_INPUT).`,
  };
}
