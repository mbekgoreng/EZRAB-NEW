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

export interface RabItemInput extends Partial<RabItem> {
  description: string;
  volume: number;
  unit: string;
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
    verificationStatus: effectiveVerificationStatus,
    ...(ahspIdentityStatus ? { ahspIdentityStatus, ahspIdentityReason } : {}),
    ...(!ahspIdentityStatus && codelessOfficialReason
      ? { ahspIdentityReason: codelessOfficialReason }
      : {}),
  };
}
