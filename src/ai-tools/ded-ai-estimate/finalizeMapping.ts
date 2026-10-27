/**
 * DED-to-RAB — Pemetaan finalisasi ke baris RAB spreadsheet.
 *
 * Latar (temuan audit 2026-10-27): kedua handler finalisasi di view.tsx
 * dulu hanya mengemas provenance ke string `notes`, padahal
 * `createRabItemRecord` TIDAK menyimpan `notes` — sehingga baris fallback
 * "Estimasi AI" mendarat di spreadsheet tanpa penanda apa pun dan
 * mendapat `verificationStatus` default 'VERIFIED' dari factory.
 *
 * Helper murni ini adalah SATU-SATUNYA tempat pemetaan provenance
 * finalisasi DED (standar + Full AI), agar kedua jalur tidak bisa
 * menyimpang diam-diam. Handler hanya memanggil helper ini.
 *
 * Kosakata yang dipakai semuanya sudah didukung factory/tipe RabItem
 * (tidak ada taksonomi status baru):
 * - priceSourceKind: 'OFFICIAL_AHSP' | 'MARKET_REFERENCE' |
 *   'EZRAB_ASSUMPTION' | 'UNRESOLVED' (src/types/index.ts). Tidak ada
 *   kind 'AI_ESTIMATE'/'MANUAL' di union itu, jadi:
 *   - kanonis tervalidasi → 'OFFICIAL_AHSP'
 *   - estimasi AI → 'EZRAB_ASSUMPTION' (perkiraan/asumsi, bukan data
 *     pasar maupun resmi) + label 'Estimasi AI' yang eksplisit
 *   - manual → kind tidak diisi (tidak ada kind yang jujur untuknya),
 *     label 'Input User' yang eksplisit
 * - verificationStatus: 'VERIFIED' HANYA untuk kanonis tervalidasi;
 *   estimasi AI dan manual → 'NEEDS_VERIFICATION' (bukan verifikasi
 *   independen, dan bukan pula klaim kanonis).
 * - ahspCode HANYA diteruskan bila priceSource benar-benar AHSP_2026
 *   (kecocokan tervalidasi). Fallback AI tidak pernah membawa kode AHSP,
 *   meski itemnya punya ahspMatch NEEDS_REVIEW/INCOMPLETE.
 *
 * Item tanpa unitPrice mengembalikan null (tidak boleh menjadi baris
 * RAB berharga). Handler sudah menyaringnya, ini pertahanan kedua.
 */

import type { DedAiItem, DedEstimationPolicy } from './types';
import type { FullAiItem } from '../ded-full-ai/types';
import type { VerificationStatus } from '../../types';

export interface DedFinalizeRabInput {
  description: string;
  volume: number;
  unit: string;
  unitPrice: number;
  category: string;
  ahspCode?: string;
  priceSourceKind?: 'OFFICIAL_AHSP' | 'MARKET_REFERENCE' | 'EZRAB_ASSUMPTION' | 'UNRESOLVED';
  priceSourceLabel: string;
  priceSourceExplanation: string;
  verificationStatus: VerificationStatus;
}

function baseExplanation(policy: DedEstimationPolicy, detail: string): string {
  return `${detail} · Mode: ${policy}`;
}

export function mapDedAiItemToRabInput(
  item: DedAiItem,
  policy: DedEstimationPolicy
): DedFinalizeRabInput | null {
  if (item.unitPrice == null || item.quantity == null) return null;
  const common = {
    description: item.name,
    volume: item.quantity,
    unit: item.units,
    unitPrice: item.unitPrice,
    category: item.category,
  };
  if (item.priceSource === 'AHSP_2026' && item.ahspCode) {
    return {
      ...common,
      ahspCode: item.ahspCode,
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: 'AHSP Kanonis (SE 47/2026)',
      priceSourceExplanation: baseExplanation(
        policy,
        item.priceAssumptionNote || `AHSP kanonis ${item.ahspCode} — harga tervalidasi database EZRAB.`
      ),
      verificationStatus: 'VERIFIED',
    };
  }
  if (item.priceSource === 'AI_ESTIMATE') {
    return {
      ...common,
      priceSourceKind: 'EZRAB_ASSUMPTION',
      priceSourceLabel: 'Estimasi AI',
      priceSourceExplanation: baseExplanation(
        policy,
        item.priceAssumptionNote ||
          'Estimasi AI — perkiraan, bukan harga database AHSP EZRAB.'
      ),
      verificationStatus: 'NEEDS_VERIFICATION',
    };
  }
  if (item.priceSource === 'USER_INPUT') {
    return {
      ...common,
      priceSourceLabel: 'Input User',
      priceSourceExplanation: baseExplanation(
        policy,
        'Harga dimasukkan pengguna secara manual (bukan harga database AHSP).'
      ),
      verificationStatus: 'NEEDS_VERIFICATION',
    };
  }
  // UNRESOLVED / sumber tak dikenal: tidak boleh jadi baris berharga.
  // (Cabang ini tidak terjangkau dari handler yang sudah menyaring
  // unitPrice null, tapi dipertahankan sebagai pertahanan eksplisit.)
  return null;
}

export function mapFullAiItemToRabInput(
  item: FullAiItem,
  policy: DedEstimationPolicy
): DedFinalizeRabInput | null {
  if (item.price.unitPrice == null || item.quantity.value == null) return null;
  const common = {
    description: item.name,
    volume: item.quantity.value,
    unit: item.quantity.unit,
    unitPrice: item.price.unitPrice,
    category: item.category,
  };
  if (item.price.source === 'AHSP_2026' && item.price.ahspCode) {
    return {
      ...common,
      ahspCode: item.price.ahspCode,
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: 'AHSP Kanonis (SE 47/2026)',
      priceSourceExplanation: baseExplanation(
        policy,
        item.price.notes || `AHSP kanonis ${item.price.ahspCode} — harga tervalidasi database EZRAB.`
      ),
      verificationStatus: 'VERIFIED',
    };
  }
  if (item.price.source === 'AI_ESTIMATE') {
    return {
      ...common,
      priceSourceKind: 'EZRAB_ASSUMPTION',
      priceSourceLabel: 'Estimasi AI',
      priceSourceExplanation: baseExplanation(
        policy,
        item.price.notes ||
          'Estimasi AI — perkiraan, bukan harga database AHSP EZRAB.'
      ),
      verificationStatus: 'NEEDS_VERIFICATION',
    };
  }
  if (item.price.source === 'USER_INPUT') {
    return {
      ...common,
      priceSourceLabel: 'Input User',
      priceSourceExplanation: baseExplanation(
        policy,
        'Harga dimasukkan pengguna secara manual (bukan harga database AHSP).'
      ),
      verificationStatus: 'NEEDS_VERIFICATION',
    };
  }
  // VERIFIED_SOURCE warisan (label netral di adapter) maupun sumber tak
  // dikenal: jangan pernah naik jadi kanonis; tandai perlu verifikasi.
  // Catatan: item seperti ini hanya lolos ke sini bila harganya terisi;
  // handler tetap menyaring status READY + subtotal > 0.
  return {
    ...common,
    // Label netral yang sama dengan DED_PRICE_SOURCE_LABELS untuk
    // VERIFIED_SOURCE warisan ("belum terverifikasi independen").
    priceSourceLabel: 'Belum terverifikasi independen (data lama)',
    priceSourceExplanation: baseExplanation(
      policy,
      'Sumber harga belum terverifikasi independen — bukan harga kanonis AHSP.'
    ),
    verificationStatus: 'NEEDS_VERIFICATION',
  };
}
