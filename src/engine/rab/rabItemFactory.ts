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
  // Fase 4A: caller yang mengetahui kebenaran (mis. duplikat dari item yang
  // memang belum ada harganya, atau baris kosong baru) boleh meneruskan
  // priceStatus eksplisit. Jika tidak, turunkan dari nilai unitPrice.
  // NaN = "tidak ada harga valid yang dimasukkan" -> PRICE_UNRESOLVED.
  const explicitStatus = (itemData as { priceStatus?: PriceStatus }).priceStatus;
  const priceStatus = explicitStatus || resolvePriceStatus((itemData as { unitPrice?: unknown }).unitPrice);
  const up = priceStatus === 'PRICE_RESOLVED' ? Number(itemData.unitPrice) : 0;
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
    verificationStatus:
      itemData.verificationStatus ||
      (priceStatus === 'PRICE_UNRESOLVED' ? 'NEEDS_VERIFICATION' : 'VERIFIED'),
  };
}
