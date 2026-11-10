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
import { isSaneEstimate } from '../ded-ai-estimate/pricing';
import { classifyQuantity } from '../ded-ai-estimate/priceCompletion';
import { referenceSpecConflict, EXTERNAL_PRICE_REFERENCES } from '../ded-ai-estimate/externalPriceReferences';
import type { DedAiItem } from '../ded-ai-estimate/types';

const VALID_QUANTITY_CLASS = [
  'DRAWING_EXTRACTED', 'USER_PROVIDED', 'CALCULATED_FROM_VERIFIED_INPUT',
  'ESTIMATED_FROM_CONTEXT', 'MISSING', 'IMPLAUSIBLE_FRAGMENT',
  'EXPLICIT_ZERO', 'NEEDS_REVIEW',
];
const VALID_APPROVAL_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'NOT_REQUIRED'];
const VALID_VERIFICATION_STATUS = ['VERIFIED', 'UNVERIFIED', 'NEEDS_VERIFICATION'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_PROVENANCE = ['EXPLICIT', 'DERIVED', 'ASSUMPTION', 'NEEDS_CONFIRMATION', 'UNRESOLVED', 'USER_INPUT'];
// AHSP_2026 ditambahkan (HARDENING 2026-11-10): adapter kanonis memang
// menghasilkan sumber itu — daftar lama yang tidak memuatnya membuat
// nilai sah dari adapter terlihat tidak valid oleh validator ini.
const VALID_PRICE_SOURCE = ['VERIFIED_SOURCE', 'USER_INPUT', 'AI_ESTIMATE', 'UNRESOLVED', 'AHSP_2026'];
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

  // SPRINT 4 (paritas, PERINGATAN saja): fragmen kuantitas tak fisik
  // (pelat dak mikro, listplank < 1 m') dikenali diskriminator BERSAMA
  // pipeline standar (classifyQuantity) — validator standar
  // mengklasifikasikannya IMPLAUSIBLE_FRAGMENT; di sini cukup
  // peringatan karena pengisian/penahanannya adalah wewenang pass
  // penyelesaian (completeFullAiQuantities), bukan validator.
  if (typeof q.value === 'number' && Number.isFinite(q.value) && q.value > 0 && typeof q.unit === 'string') {
    const cls = classifyQuantity({ name: itemName, units: q.unit, quantity: q.value } as Pick<DedAiItem, 'name' | 'units' | 'quantity'>);
    if (cls === 'IMPLAUSIBLE_FRAGMENT') {
      warnings.push(`${itemName}: kuantitas ${q.value} ${q.unit} terklasifikasi IMPLAUSIBLE_FRAGMENT oleh diskriminator bersama — kemungkinan fragmen salah-baca spesifikasi, perlu tinjauan`);
    }
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

  // SPRINT 4 (paritas): klaim kanonis AHSP_2026 juga wajib membawa
  // kode — adapter kanonis hanya menghasilkannya bersama kode
  // terverifikasi; tanpa kode, klaimnya tidak dapat ditelusur.
  if (p.source === 'AHSP_2026' && !p.ahspCode) {
    warnings.push(`${itemName}: diklaim AHSP_2026 tapi tanpa kode AHSP`);
  }

  // SPRINT 4 (paritas, PERINGATAN saja): kewajaran harga estimasi AI
  // memakai ambang BERSAMA isSaneEstimate pipeline standar
  // (Rp100 .. Rp50 miliar per satuan). Validator standar MENOLAK harga
  // di luar pita itu di lapisan konversinya; di jalur Full AI keputusan
  // itu berdampak pada finalisasi sehingga di sini hanya peringatan —
  // penolakan kerasnya dicatat sebagai perbedaan yang DITUNDA di
  // dokumen paritas Sprint 4 (perlu keputusan owner).
  if (p.source === 'AI_ESTIMATE' && p.unitPrice != null && !isSaneEstimate(p.unitPrice)) {
    warnings.push(`${itemName}: harga estimasi AI Rp${p.unitPrice} di luar pita kewajaran bersama (isSaneEstimate) — perlu tinjauan`);
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

/**
 * SPRINT 4 (paritas): konsistensi blok penyelesaian terstruktur pada
 * item Full AI (DedPriceCompletion / DedQuantityAudit bersama). Semua
 * temuan berupa PERINGATAN — blok adalah metadata penyelesaian;
 * menegakkannya sebagai error akan mengubah perilaku finalisasi item
 * yang sah (pagar laporan Hardening I-P2-6), jadi validator hanya
 * menandai ketidakkonsistenan agar terlihat:
 * - enum blok (kelas kuantitas, status verifikasi/persetujuan) sah;
 * - harga terisi dari referensi: recommendedPrice blok == harga item;
 * - blok yang menunjuk referensi terkurasi tidak boleh konflik
 *   spesifikasi dengan nama item (referenceSpecConflict bersama —
 *   pertahanan kedua di samping penjaga findExternalReference).
 */
export function validateFullAiCompletionBlocks(raw: any, itemName: string): ValidationResult {
  const warnings: string[] = [];
  const pc = raw?.price?.priceCompletion ?? raw?.priceCompletion;
  const qa = raw?.quantity?.quantityAudit ?? raw?.quantityAudit;

  if (pc) {
    if (pc.userApprovalStatus && !VALID_APPROVAL_STATUS.includes(pc.userApprovalStatus)) {
      warnings.push(`${itemName}: priceCompletion.userApprovalStatus "${pc.userApprovalStatus}" tidak valid`);
    }
    if (pc.verificationStatus && !VALID_VERIFICATION_STATUS.includes(pc.verificationStatus)) {
      warnings.push(`${itemName}: priceCompletion.verificationStatus "${pc.verificationStatus}" tidak valid`);
    }
    if (pc.referenceId && raw?.price?.filledFromExternalRef) {
      if (pc.recommendedPrice != null && raw.price.unitPrice != null && pc.recommendedPrice !== raw.price.unitPrice) {
        warnings.push(`${itemName}: recommendedPrice blok penyelesaian (${pc.recommendedPrice}) tidak sama dengan harga item (${raw.price.unitPrice})`);
      }
      const ref = EXTERNAL_PRICE_REFERENCES.find((r) => r.id === pc.referenceId);
      if (ref) {
        const conflict = referenceSpecConflict(itemName, ref);
        if (conflict) {
          warnings.push(`${itemName}: referensi blok penyelesaian (${ref.id}) konflik spesifikasi dengan item: ${conflict}`);
        }
      }
    }
  }
  if (qa) {
    if (qa.classification && !VALID_QUANTITY_CLASS.includes(qa.classification)) {
      warnings.push(`${itemName}: quantityAudit.classification "${qa.classification}" bukan kelas DedQuantityClass yang sah`);
    }
    if (qa.userApprovalStatus && !VALID_APPROVAL_STATUS.includes(qa.userApprovalStatus)) {
      warnings.push(`${itemName}: quantityAudit.userApprovalStatus "${qa.userApprovalStatus}" tidak valid`);
    }
    if (qa.verificationStatus && !VALID_VERIFICATION_STATUS.includes(qa.verificationStatus)) {
      warnings.push(`${itemName}: quantityAudit.verificationStatus "${qa.verificationStatus}" tidak valid`);
    }
    // Isian konteks tidak pernah boleh terklasifikasi fakta gambar.
    if (qa.method === 'plan-context-estimate' && qa.classification === 'DRAWING_EXTRACTED') {
      warnings.push(`${itemName}: isian konteks terklasifikasi DRAWING_EXTRACTED — isian konteks wajib ESTIMATED_FROM_CONTEXT`);
    }
  }
  return { valid: true, errors: [], warnings };
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

  // Blok penyelesaian terstruktur (bila item membawanya — mis. hasil
  // tersimpan yang divalidasi ulang): konsistensi metadata saja.
  const cResult = validateFullAiCompletionBlocks(raw, name);
  warnings.push(...cResult.warnings);

  return { valid: errors.length === 0, errors, warnings };
}
