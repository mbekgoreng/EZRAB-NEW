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
import { checkAhspIdentitySafety } from '../../data/priceDatabase2026/ahspDisplayPolicy';

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
  let ahspIdentityStatus: 'SAFE' | 'UNSAFE' | undefined;
  let ahspIdentityReason: string | undefined;
  const claimedAhspCode = itemData.ahspCode || '';
  if (claimedAhspCode) {
    const idCheck = checkAhspIdentitySafety({
      code: claimedAhspCode,
      name: itemData.description || '',
    });
    ahspIdentityStatus = idCheck.safe ? 'SAFE' : 'UNSAFE';
    if (!idCheck.safe) ahspIdentityReason = idCheck.reason;
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
    ...(itemData.priceSourceKind ? { priceSourceKind: itemData.priceSourceKind } : {}),
    ...(itemData.priceSourceLabel ? { priceSourceLabel: itemData.priceSourceLabel } : {}),
    ...(itemData.priceSourceExplanation ? { priceSourceExplanation: itemData.priceSourceExplanation } : {}),
    ...(itemData.priceSourceName !== undefined ? { priceSourceName: itemData.priceSourceName } : {}),
    ...(itemData.priceSourceSupplier !== undefined ? { priceSourceSupplier: itemData.priceSourceSupplier } : {}),
    ...(itemData.priceSourceDate !== undefined ? { priceSourceDate: itemData.priceSourceDate } : {}),
    ...(itemData.priceSourceRegion !== undefined ? { priceSourceRegion: itemData.priceSourceRegion } : {}),
    ...(itemData.ahspMappingStatus ? { ahspMappingStatus: itemData.ahspMappingStatus } : {}),
    verificationStatus:
      itemData.verificationStatus ||
      (priceStatus === 'PRICE_UNRESOLVED' ? 'NEEDS_VERIFICATION' : 'VERIFIED'),
    ...(ahspIdentityStatus ? { ahspIdentityStatus, ahspIdentityReason } : {}),
  };
}
