/**
 * Phase 2 hardening — pure RAB item factory (the official write path).
 *
 * Extracted from ProjectContext.createRabItemDirect / bulkAddRabItems so the
 * price-integrity rules are unit-testable:
 *  - missing/null/NaN unit price  -> priceStatus PRICE_UNRESOLVED,
 *    verificationStatus NEEDS_VERIFICATION (never VERIFIED, never silent Rp0)
 *  - explicit 0                   -> PRICE_RESOLVED (zero is a real price)
 *  - unresolved items carry amount 0 for display but are EXCLUDED from
 *    cost summaries by UnifiedProjectEngine.recalculateCostSummary
 */
import type { RabItem, VolumeSourceType } from '../../types';
import { SafeDecimalEngine } from '../safeDecimalEngine';
import { resolvePriceStatus } from '../pricing/priceStatus';
import type { PriceStatus } from '../../types';
import {
  checkAhspIdentitySafety,
  canonicalAhspCodeExists,
} from '../../data/priceDatabase2026/ahspDisplayPolicy';
import {
  isValidatedWbsCode,
  isKnownWbsNodeId,
  isWbsMappingStatus,
} from '../../ai-tools/ezrab-ai/wbsArtifact';
import type { WbsMappingStatus } from '../../ai-tools/ezrab-ai/wbsArtifact';

export interface RabItemInput extends Partial<RabItem> {
  description: string;
  volume: number;
  unit: string;
  /**
   * S6 (§6, P3D-O4) — tautan node WBS + status asosiasi, field RUNTIME
   * (tidak dideklarasikan di tipe `RabItem` — diteruskan sebagai field
   * runtime mengikuti preseden `priceStatus`/`priceSourceKind` yang
   * diteruskan `normalizeSections` ke `RABItem` lewat spread `any`).
   * Dibaca hilir via cast; persistensi JSON membawanya utuh (tanpa
   * allowlist — `saveVersioned` menyimpan objek apa adanya).
   */
  wbsNodeId?: string;
  wbsMappingStatus?: WbsMappingStatus;
  wbsSuggestedNodeId?: string;
}

export interface RabItemFactoryOpts {
  /** default when itemData.volumeSource is absent */
  defaultVolumeSource?: VolumeSourceType;
  /** index for bulk inserts (drives id suffix + default `no`) */
  index?: number;
  /** default unit when itemData.unit is absent */
  defaultUnit?: string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function createRabItemRecord(
  itemData: RabItemInput,
  projectId: string,
  opts: RabItemFactoryOpts = {}
): RabItem {
  const idx = opts.index;
  const newItemId =
    (itemData as { id?: string }).id ||
    `rab-${Date.now().toString().slice(-6)}${idx !== undefined ? `-${idx}` : ''}-${randomSuffix()}`;

  const vol = Number(itemData.volume) || 0;
  // AHSP identity safety (audit 2026-10-18): item yang mengklaim sumber AHSP
  // (ahspCode terisi) diperiksa identitasnya di boundary engine, sehingga
  // semua jalur masuk RAB (UI, QTO, AI, template, impor) tidak bisa melewati.
  // UNSAFE = tidak boleh diperlakukan sebagai AHSP valid; data tidak diubah.
  //
  // G1 (Sprint 3, menutup temuan Sprint 2): aman-parsing saja TIDAK cukup.
  // Kode juga WAJIB ada di katalog AHSP kanonis 2026 (canonicalAhspCodeExists
  // -> officialAhspRepository, sumber yang sama dengan gerbang harga kanonis
  // DED). Kode yang tidak ada di katalog -> UNSAFE, dan (di bawah) status
  // VERIFIED diturunkan serta provenance OFFICIAL_AHSP dicabut. Kode asli
  // tetap dipertahankan sebagai klaim yang belum terverifikasi — data
  // pemanggil tidak dihapus.
  let ahspIdentityStatus: 'SAFE' | 'UNSAFE' | undefined;
  let ahspIdentityReason: string | undefined;
  const claimedAhspCode = itemData.ahspCode || '';
  if (claimedAhspCode) {
    const idCheck = checkAhspIdentitySafety({
      code: claimedAhspCode,
      name: itemData.description || '',
    });
    if (!idCheck.safe) {
      ahspIdentityStatus = 'UNSAFE';
      ahspIdentityReason = idCheck.reason;
    } else if (!canonicalAhspCodeExists(claimedAhspCode)) {
      ahspIdentityStatus = 'UNSAFE';
      ahspIdentityReason =
        `Kode AHSP "${claimedAhspCode}" tidak ditemukan di katalog AHSP kanonis 2026 — ` +
        'identitas belum terverifikasi.';
    } else {
      ahspIdentityStatus = 'SAFE';
    }
  }
  // Fase 4A: caller yang mengetahui kebenaran (mis. duplikat dari item yang
  // memang belum ada harganya, atau baris kosong baru) boleh meneruskan
  // priceStatus eksplisit. Jika tidak, turunkan dari nilai unitPrice.
  // NaN = "tidak ada harga valid yang dimasukkan" -> PRICE_UNRESOLVED.
  const explicitStatus = (itemData as { priceStatus?: PriceStatus }).priceStatus;
  const priceStatus = explicitStatus || resolvePriceStatus((itemData as { unitPrice?: unknown }).unitPrice);
  // Bug fix (audit 2026-10-18): harga manual/estimasi/asumsi harus dipertahankan.
  // Hanya PRICE_UNRESOLVED yang di-nol-kan (tidak ada harga valid).
  const rawPrice = Number(itemData.unitPrice);
  const up = priceStatus === 'PRICE_UNRESOLVED' ? 0 : (Number.isFinite(rawPrice) ? rawPrice : 0);
  const amt = SafeDecimalEngine.safeMultiply(vol, up, 0);

  // G1: provenance harga resmi tidak boleh menempel pada identitas AHSP yang
  // terbukti tidak sah. Bila pemanggil MENGKLAIM kode AHSP dan identitas itu
  // UNSAFE (artefak parsing atau kode tidak ada di katalog), klaim
  // OFFICIAL_AHSP diturunkan ke UNRESOLVED (klaim sumber tidak terbukti).
  // Nilai harga & priceStatus TIDAK diubah — sumbu harga tetap independen.
  //
  // Sprint 3.1 (Keputusan B owner): provenance OFFICIAL_AHSP kini mensyaratkan
  // identitas SAFE (kode kanonis terverifikasi) — BUKAN sekadar "tidak
  // UNSAFE". Record TANPA kode sama sekali yang mengklaim OFFICIAL_AHSP juga
  // diturunkan ke UNRESOLVED: klaim resmi tanpa kode bukan bukti resmi yang
  // genuine. Ini TIDAK menghukum ketiadaan kode itu sendiri — item tanpa
  // kode tetap sah penuh (identitasnya tetap tak berflag, kind non-resmi
  // seperti MARKET_REFERENCE/EZRAB_ASSUMPTION dan label manual tidak
  // disentuh); yang dicabut hanya klaim RESMI yang tak berdasar. Alasan
  // penurunan jalur tanpa-kode dicatat di ahspIdentityReason (tanpa
  // menetapkan status UNSAFE — ketiadaan kode bukan ketidakamanan).
  const officialClaimRejected =
    itemData.priceSourceKind === 'OFFICIAL_AHSP' && ahspIdentityStatus !== 'SAFE';
  const effectivePriceSourceKind = officialClaimRejected
    ? 'UNRESOLVED'
    : itemData.priceSourceKind;
  const codelessOfficialReason =
    officialClaimRejected && !claimedAhspCode
      ? 'Klaim harga OFFICIAL_AHSP tanpa kode AHSP — provenance resmi ' +
        'mensyaratkan kode kanonis terverifikasi; diturunkan ke UNRESOLVED.'
      : undefined;

  // G1: status VERIFIED tidak boleh melebihi bukti identitas. Bila identitas
  // AHSP UNSAFE (artefak parsing ATAU kode tak dikenal), klaim VERIFIED —
  // eksplisit dari pemanggil maupun default harga-resolved — diturunkan ke
  // NEEDS_VERIFICATION. Status lain (AI_GENERATED, ESTIMATED, dst.) tidak
  // disentuh.
  const claimedVerificationStatus =
    itemData.verificationStatus ||
    (priceStatus === 'PRICE_UNRESOLVED' ? 'NEEDS_VERIFICATION' : 'VERIFIED');
  const effectiveVerificationStatus =
    claimedVerificationStatus === 'VERIFIED' && ahspIdentityStatus === 'UNSAFE'
      ? 'NEEDS_VERIFICATION'
      : claimedVerificationStatus;

  return {
    id: newItemId,
    projectId,
    no: itemData.no || (idx !== undefined ? idx + 1 : 1),
    code: itemData.code || (itemData as { wbsCode?: string }).wbsCode || '',
    category: itemData.category || itemData.sectionName || '01. PEKERJAAN PERSIAPAN',
    sectionName: itemData.sectionName || itemData.category || '01. PEKERJAAN PERSIAPAN',
    description: itemData.description,
    volume: vol,
    unit: itemData.unit || opts.defaultUnit || 'ls',
    materialPrice: itemData.materialPrice || 0,
    laborPrice: itemData.laborPrice || 0,
    equipmentPrice: itemData.equipmentPrice || 0,
    unitPrice: up,
    amount: amt,
    totalPrice: amt,
    priceStatus,
    volumeSource:
      itemData.volumeSource || opts.defaultVolumeSource || ('MANUAL' as VolumeSourceType),
    ahspCode: itemData.ahspCode || '',
    // Provenance harga (Universal Direct RAB 2026-10-26): field-field ini
    // sudah ada di tipe RabItem tetapi sebelumnya DIBUANG factory — item
    // yang di-push dari chat/katalog kehilangan status sumbernya di
    // Spreadsheet. Diteruskan apa adanya bila pemanggil mengisinya; bila
    // tidak diisi, field tetap tidak ada (tidak ada default karangan).
    ...(effectivePriceSourceKind ? { priceSourceKind: effectivePriceSourceKind } : {}),
    ...(itemData.priceSourceLabel ? { priceSourceLabel: itemData.priceSourceLabel } : {}),
    ...(itemData.priceSourceExplanation ? { priceSourceExplanation: itemData.priceSourceExplanation } : {}),
    // Basis biaya harga satuan (§17.1, Gelombang 2 2026-11-13): penanda
    // ini adalah SATU-SATUNYA bukti pengecualian O&P di engine — bila
    // tidak diteruskan di sini, penanda dari produsen mana pun (gerbang
    // template 'HSP', DED/QTO/chat 'DIRECT_COST') HILANG saat kreasi
    // item. Sumbu harga, bukan sumbu provenance: TIDAK diturunkan bila
    // klaim OFFICIAL_AHSP ditolak di atas (nilai harga tidak berubah).
    ...(itemData.priceCostBasis ? { priceCostBasis: itemData.priceCostBasis } : {}),
    ...(itemData.priceSourceName !== undefined ? { priceSourceName: itemData.priceSourceName } : {}),
    ...(itemData.priceSourceSupplier !== undefined ? { priceSourceSupplier: itemData.priceSourceSupplier } : {}),
    ...(itemData.priceSourceDate !== undefined ? { priceSourceDate: itemData.priceSourceDate } : {}),
    ...(itemData.priceSourceRegion !== undefined ? { priceSourceRegion: itemData.priceSourceRegion } : {}),
    ...(itemData.ahspMappingStatus ? { ahspMappingStatus: itemData.ahspMappingStatus } : {}),
    // Price Integrity Gate 2026-11-06: identitas sumber kalkulator/QTO
    // diteruskan apa adanya. Sebelumnya factory membuang ketiga field ini
    // yang diberikan jalur sinkron QTO (ProjectContext), sehingga item RAB
    // hasil sinkronisasi kehilangan identitas sumbernya di record item
    // (tautan hanya bertahan di tabel mapping terpisah).
    ...(itemData.qtoItemId ? { qtoItemId: itemData.qtoItemId } : {}),
    ...(itemData.calculationRunId ? { calculationRunId: itemData.calculationRunId } : {}),
    ...(itemData.calculatorId ? { calculatorId: itemData.calculatorId } : {}),
    // Master Repair Fase 9: tanda harga parsial diteruskan apa adanya —
    // factory adalah allowlist, field yang tidak diteruskan di sini hilang
    // senyap saat kreasi item.
    ...(itemData.isPartial ? { isPartial: true } : {}),
    ...(typeof itemData.unresolvedComponentCount === 'number'
      ? { unresolvedComponentCount: itemData.unresolvedComponentCount }
      : {}),
    ...(itemData.priceValidationWarnings && itemData.priceValidationWarnings.length > 0
      ? { priceValidationWarnings: [...itemData.priceValidationWarnings] }
      : {}),
    // S4 (§4, menutup P6-O1): keputusan review diteruskan apa adanya —
    // factory adalah allowlist; tanpa ini verificationDate +
    // userDecisionStatus yang dibawa buildPushPayload hilang senyap dan
    // Sheet 5 ekspor tetap menampilkan 'tidak tercatat'. Tanpa nilai =
    // field absen (tidak ada default karangan); hanya aksi verifikasi
    // eksplisit yang pernah mengisi verificationDate (draftReview.ts).
    ...(itemData.verificationDate ? { verificationDate: itemData.verificationDate } : {}),
    ...(itemData.userDecisionStatus ? { userDecisionStatus: itemData.userDecisionStatus } : {}),
    // F2 (lanjutan §5): rumus/dasar hitung kuantitas dari pemetaan
    // finalisasi DED→RAB (finalizeMapping.ts) — hanya terisi bila rumus
    // nyata ada; tanpa ini rumus berhenti di DedFinalizeRabInput dan
    // Sheet 4 menampilkan 'Tidak tersedia'.
    ...(itemData.calculationFormula ? { calculationFormula: itemData.calculationFormula } : {}),
    // S6 (§6, menutup P3D-O4): traceabilitas WBS diteruskan apa adanya —
    // factory adalah allowlist; tanpa ini `wbsCode` + tautan node yang
    // dibawa `buildPushPayload` hilang senyap (sebelum S6, `wbsCode`
    // hanya dipakai sebagai fallback `code` di atas dan tidak pernah
    // tersimpan sebagai field sendiri). HANYA nilai tervalidasi yang
    // diteruskan: `wbsCode` wajib lolos `isValidatedWbsCode` (kode
    // numerik dotted atau kode katalog DED hidup — nomor urut '1' dan
    // kode AHSP 'B.38' DITOLAK); node wajib `wbs:<scope dikenal>`;
    // status wajib salah satu dari tiga literal. Factory TIDAK PERNAH
    // menurunkan `wbsCode` dari `code` — code bisa berupa fallback
    // AHSP/nomor urut, dan pin `dedWbsReadiness` mengunci "factory
    // TIDAK menulis wbsCode" untuk input tanpa wbsCode eksplisit.
    ...(isValidatedWbsCode(itemData.wbsCode) ? { wbsCode: (itemData.wbsCode as string).trim() } : {}),
    ...(isKnownWbsNodeId(itemData.wbsNodeId) ? { wbsNodeId: itemData.wbsNodeId } : {}),
    ...(isWbsMappingStatus(itemData.wbsMappingStatus) ? { wbsMappingStatus: itemData.wbsMappingStatus } : {}),
    ...(isKnownWbsNodeId(itemData.wbsSuggestedNodeId) ? { wbsSuggestedNodeId: itemData.wbsSuggestedNodeId } : {}),
    verificationStatus: effectiveVerificationStatus,
    ...(ahspIdentityStatus ? { ahspIdentityStatus, ahspIdentityReason } : {}),
    ...(!ahspIdentityStatus && codelessOfficialReason
      ? { ahspIdentityReason: codelessOfficialReason }
      : {}),
  };
}

/**
 * D-40 (Batch F) — himpunan provenance yang WAJIB selamat saat duplikasi.
 *
 * Factory adalah allowlist: field yang tidak diteruskan pemanggil hilang
 * senyap. Jalur duplikat baris (`handleDuplicateItem`) dulu hanya
 * meneruskan `priceStatus` — `verificationStatus` + seluruh provenance
 * hilang, sehingga salinan item NEEDS_VERIFICATION/ESTIMATED diam-diam
 * naik kelas menjadi VERIFIED (flag "⚠ Perlu verifikasi" hilang).
 *
 * INVARIAN: provenance selamat saat duplikat — ESTIMATED tetap ESTIMATED,
 * NEEDS_VERIFICATION tetap NEEDS_VERIFICATION, kind/label sumber tidak
 * berubah. Semua jalur duplikat (menu baris, massal, form SmartAdd)
 * WAJIB menyebarkan helper ini. Aturan G1 factory tetap berlaku di
 * atasnya: klaim VERIFIED atas identitas UNSAFE tetap diturunkan
 * (penurunan, bukan peningkatan — invarian tidak dilanggar).
 *
 * SENGAJA DIKECUALIKAN (identitas, bukan provenance):
 * - `qtoItemId` / `calculationRunId` / `calculatorId`: salinan BUKAN
 *   produk run kalkulasi sumber; menyalinnya akan menautkan salinan
 *   secara palsu ke item QTO sumber.
 * - `wbsCode` / `wbsNodeId` / `wbsMappingStatus` / `wbsSuggestedNodeId`:
 *   pemetaan WBS adalah identitas per baris; salinan mulai belum
 *   terpetakan dan dipetakan ulang pada siklusnya sendiri (factory
 *   tidak pernah menurunkan `wbsCode` — lihat S6 di atas).
 * - `priceStatus` bukan bagian helper ini: pemanggil sudah meneruskannya
 *   sendiri (Fase 4A) di semua jalur duplikat.
 */
export function cloneProvenance(item: RabItem): Partial<RabItem> {
  return {
    ...(item.verificationStatus ? { verificationStatus: item.verificationStatus } : {}),
    ...(item.priceSourceKind ? { priceSourceKind: item.priceSourceKind } : {}),
    ...(item.priceSourceLabel ? { priceSourceLabel: item.priceSourceLabel } : {}),
    ...(item.priceSourceExplanation ? { priceSourceExplanation: item.priceSourceExplanation } : {}),
    ...(item.priceCostBasis ? { priceCostBasis: item.priceCostBasis } : {}),
    ...(item.priceSourceName !== undefined ? { priceSourceName: item.priceSourceName } : {}),
    ...(item.priceSourceSupplier !== undefined ? { priceSourceSupplier: item.priceSourceSupplier } : {}),
    ...(item.priceSourceDate !== undefined ? { priceSourceDate: item.priceSourceDate } : {}),
    ...(item.priceSourceRegion !== undefined ? { priceSourceRegion: item.priceSourceRegion } : {}),
    ...(item.ahspMappingStatus ? { ahspMappingStatus: item.ahspMappingStatus } : {}),
    ...(item.verificationDate ? { verificationDate: item.verificationDate } : {}),
    ...(item.userDecisionStatus ? { userDecisionStatus: item.userDecisionStatus } : {}),
    ...(item.calculationFormula ? { calculationFormula: item.calculationFormula } : {}),
    ...(item.isPartial ? { isPartial: true } : {}),
    ...(typeof item.unresolvedComponentCount === 'number'
      ? { unresolvedComponentCount: item.unresolvedComponentCount }
      : {}),
    ...(item.priceValidationWarnings && item.priceValidationWarnings.length > 0
      ? { priceValidationWarnings: [...item.priceValidationWarnings] }
      : {}),
  };
}
