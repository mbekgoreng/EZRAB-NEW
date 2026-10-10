/**
 * FULL AI DED ESTIMATE — Validator
 *
 * Memvalidasi STRUKTUR output AI, bukan me-recalculate kuantitas.
 * Aplikasi memverifikasi aritmetika (subtotal = qty × price).
 * Jika tidak cocok, TAMPILKAN selisih — jangan diam-diam ganti.
 */
import {
  FullAiOutput, FullAiItem, FullAiQuantityDetail, FullAiPriceDetail,
} from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_PROVENANCE = ['EXPLICIT', 'DERIVED', 'ASSUMPTION', 'NEEDS_CONFIRMATION', 'UNRESOLVED', 'USER_INPUT'];
const VALID_PRICE_SOURCE = ['VERIFIED_SOURCE', 'USER_INPUT', 'AI_ESTIMATE', 'UNRESOLVED'];
const VALID_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'];

export function validateQuantityDetail(q: any, itemName: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!q || typeof q !== 'object') {
    return { valid: false, errors: [`${itemName}: quantity bukan object`], warnings };
  }

  // value boleh null (UNRESOLVED), tapi jika ada harus number positif
  if (q.value !== null && q.value !== undefined) {
    if (typeof q.value !== 'number' || !Number.isFinite(q.value)) {
      errors.push(`${itemName}: quantity.value bukan angka valid`);
    } else if (q.value < 0) {
      errors.push(`${itemName}: quantity.value negatif`);
    } else if (q.value === 0) {
      warnings.push(`${itemName}: quantity 0 — pastikan bukan data kosong yang disamarkan`);
    }
  }

  if (!q.unit || typeof q.unit !== 'string') {
    errors.push(`${itemName}: quantity.unit hilang`);
  }

  if (!VALID_PROVENANCE.includes(q.provenance)) {
    errors.push(`${itemName}: provenance "${q.provenance}" tidak valid`);
  }

  // Jika provenance EXPLICIT tapi tidak ada sourcePages atau formula → turunkan
  if (q.provenance === 'EXPLICIT' && !q.formula && !q.dimensions) {
    warnings.push(`${itemName}: diklaim EXPLICIT tapi tanpa formula/dimensi — perlu verifikasi`);
  }

  if (q.confidence && !VALID_CONFIDENCE.includes(q.confidence)) {
    errors.push(`${itemName}: confidence "${q.confidence}" tidak valid`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validatePriceDetail(p: any, qUnit: string, itemName: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!p || typeof p !== 'object') {
    return { valid: false, errors: [`${itemName}: price bukan object`], warnings };
  }

  if (p.unitPrice !== null && p.unitPrice !== undefined) {
    if (typeof p.unitPrice !== 'number' || !Number.isFinite(p.unitPrice)) {
      errors.push(`${itemName}: price.unitPrice bukan angka valid`);
    } else if (p.unitPrice < 0) {
      errors.push(`${itemName}: price.unitPrice negatif`);
    }
  }

  if (!VALID_PRICE_SOURCE.includes(p.source)) {
    errors.push(`${itemName}: price.source "${p.source}" tidak valid`);
  }

  // Satuan harga harus cocok dengan satuan quantity
  if (p.unit && qUnit && p.unitPrice != null) {
    const normalize = (u: string) => u.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalize(p.unit) !== normalize(qUnit)) {
      errors.push(
        `${itemName}: satuan harga (${p.unit}) tidak cocok dengan satuan quantity (${qUnit})`
      );
    }
  }

  // Jangan klaim VERIFIED_SOURCE tanpa ahspCode
  if (p.source === 'VERIFIED_SOURCE' && !p.ahspCode) {
    warnings.push(`${itemName}: diklaim VERIFIED_SOURCE tapi tanpa kode AHSP`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Verifikasi aritmetika: subtotal = quantity × price.
 * Mengembalikan subtotal aplikasi dan apakah cocok dengan ekspektasi.
 * TIDAK mengganti nilai AI secara diam-diam.
 */
export function verifySubtotal(
  quantity: number | null,
  unitPrice: number | null
): { subtotal: number | null; verified: boolean; note?: string } {
  if (quantity === null || quantity === undefined) {
    return { subtotal: null, verified: true, note: 'quantity null — tidak dihitung' };
  }
  if (unitPrice === null || unitPrice === undefined) {
    return { subtotal: null, verified: true, note: 'harga null — tidak dihitung sebagai Rp0' };
  }
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return { subtotal: null, verified: true, note: 'nilai non-finite (NaN/Infinity) — ditolak' };
  }
  if (quantity <= 0 || unitPrice <= 0) {
    return { subtotal: null, verified: true, note: 'nilai tidak positif' };
  }
  const subtotal = Math.round(quantity * unitPrice);
  return { subtotal, verified: true };
}

export function validateFullAiItem(raw: any, index: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = raw?.name || `Item ${index + 1}`;

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: [`Item ${index + 1}: bukan object`], warnings };
  }

  if (!raw.name || typeof raw.name !== 'string') {
    errors.push(`Item ${index + 1}: nama hilang`);
  }

  const qResult = validateQuantityDetail(raw.quantity, name);
  errors.push(...qResult.errors);
  warnings.push(...qResult.warnings);

  const qUnit = raw.quantity?.unit || '';
  const pResult = validatePriceDetail(raw.price, qUnit, name);
  errors.push(...pResult.errors);
  warnings.push(...pResult.warnings);

  return { valid: errors.length === 0, errors, warnings };
}
