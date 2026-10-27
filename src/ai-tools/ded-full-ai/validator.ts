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
 * Mengembalikan subtotal aplikasi dan status verifikasinya.
 * TIDAK mengganti nilai AI secara diam-diam.
 *
 * F4 (3.7): `verified` true HANYA bila subtotal benar-benar terhitung dari
 * quantity × harga yang keduanya ada dan sah. Bila salah satu null / tidak
 * positif / non-finite, subtotal null dan verified FALSE — tidak ada
 * perhitungan yang terjadi, jadi tidak ada yang boleh diklaim terverifikasi.
 */
export function verifySubtotal(
  quantity: number | null,
  unitPrice: number | null
): { subtotal: number | null; verified: boolean; note?: string } {
  if (quantity === null || quantity === undefined) {
    return { subtotal: null, verified: false, note: 'quantity null — tidak dihitung, tidak terverifikasi' };
  }
  if (unitPrice === null || unitPrice === undefined) {
    return { subtotal: null, verified: false, note: 'harga null — tidak dihitung sebagai Rp0, tidak terverifikasi' };
  }
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return { subtotal: null, verified: false, note: 'nilai non-finite (NaN/Infinity) — ditolak, tidak terverifikasi' };
  }
  if (quantity <= 0 || unitPrice <= 0) {
    return { subtotal: null, verified: false, note: 'nilai tidak positif — tidak dihitung, tidak terverifikasi' };
  }
  const subtotal = Math.round(quantity * unitPrice);
  return { subtotal, verified: true };
}

/**
 * Bandingkan subtotal/total USULAN AI dengan nilai TERVERIFIKASI aplikasi.
 * Mengembalikan null bila tidak bisa dibandingkan (salah satu null /
 * non-finite) atau bila sama setelah pembulatan rupiah. Bila berbeda,
 * mengembalikan penjelasan selisih — nilai terverifikasi TIDAK PERNAH
 * ditimpa usulan AI, dan keduanya TIDAK PERNAH diklaim cocok.
 * Catatan: selisih bisa berasal dari aritmetika AI maupun dari substitusi
 * harga kanonis atas harga AI — pemanggil wajib menyebut sumbernya bila
 * diketahui (lihat service: subtotal memakai finalPrice pasca-adapter).
 */
export function describeProposedDiscrepancy(
  proposed: number | null | undefined,
  verified: number | null | undefined
): string | null {
  if (typeof proposed !== 'number' || !Number.isFinite(proposed)) return null;
  if (typeof verified !== 'number' || !Number.isFinite(verified)) return null;
  if (Math.round(proposed) === Math.round(verified)) return null;
  const diff = Math.round(proposed) - Math.round(verified);
  return `Usulan AI Rp${Math.round(proposed).toLocaleString('id-ID')} berbeda dari nilai terverifikasi aplikasi Rp${Math.round(verified).toLocaleString('id-ID')} (selisih Rp${diff.toLocaleString('id-ID')}); nilai aplikasi yang dipakai.`;
}

/**
 * Bersihkan usulan AI yang basi (per-item): bila kuantitas/satuan/harga/
 * kecocokan kanonis berubah lewat edit atau konfirmasi kandidat, nilai
 * proposedSubtotal dan selisihnya yang lama tidak boleh lagi dibandingkan
 * dengan subtotal baru. Dipakai handler edit/konfirmasi FullAiResultView.
 */
export function clearAiProposal<T extends {
  aiProposedSubtotal?: number | null;
  subtotalDiscrepancy?: string;
}>(item: T): T {
  if (item.aiProposedSubtotal === undefined && item.subtotalDiscrepancy === undefined) return item;
  return { ...item, aiProposedSubtotal: undefined, subtotalDiscrepancy: undefined };
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
