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
import type { AiEstimateWorkItem } from '../../ai-estimate/types';
import { honestVolume } from '../../engine/honestVolume';
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

/**
 * P0-A (D-02, persetujuan owner 2026-10-31) — mapper finalisasi untuk
 * jalur Magic AI (`DedAnalysisDashboard.handleCommitToProject`).
 *
 * Jalur ini dulu memetakan harga dengan `unitPrice || estimatedUnitPrice
 * || 0`, sehingga item yang harganya TIDAK TERSEDIA masuk RAB sebagai
 * baris Rp0 berstatus resolved/VERIFIED. Mapper ini menutup jalur itu
 * dengan kosakata yang sama seperti dua mapper di atas:
 *
 * - Pipeline Magic TIDAK PERNAH menghasilkan harga kanonis — sumber
 *   harganya hanya 'AI_ESTIMATE' | 'UNRESOLVED'
 *   (src/ai-estimate/types.ts). Karena itu item yang lolos selalu
 *   'EZRAB_ASSUMPTION' + label 'Estimasi AI' + NEEDS_VERIFICATION, dan
 *   `ahspCode` TIDAK PERNAH diteruskan dari jalur ini (meneruskannya
 *   akan mengesankan kaitan resmi yang tidak pernah tervalidasi).
 * - Item ditahan (null) bila: status BLOCKED (total pipeline sendiri
 *   mengecualikannya), priceSource 'UNRESOLVED', priceStatus
 *   'PRICE_UNRESOLVED', atau harga efektif tidak ada/tidak valid.
 *   Harga efektif dibaca nullish (`??`), bukan truthiness.
 * - Harga <= 0 ditahan mengikuti aturan domain pipeline sendiri
 *   (aiEstimateCalculator: harga <= 0 tidak pernah masuk total) — di
 *   jalur AI ini nol bukan harga sah; aturan factory "nol eksplisit =
 *   resolved" berlaku untuk entri manual spreadsheet, bukan jalur ini.
 */
export function mapMagicAiItemToRabInput(
  item: AiEstimateWorkItem
): DedFinalizeRabInput | null {
  if (item.status === 'BLOCKED') return null;
  if (item.priceSource === 'UNRESOLVED' || item.priceStatus === 'PRICE_UNRESOLVED') return null;
  const effectivePrice = item.unitPrice ?? item.estimatedUnitPrice ?? null;
  if (effectivePrice === null || !Number.isFinite(effectivePrice) || effectivePrice <= 0) return null;
  return {
    description: item.item || item.workName,
    volume: honestVolume(item.quantity),
    unit: item.unit || 'ls',
    unitPrice: effectivePrice,
    category: item.category,
    priceSourceKind: 'EZRAB_ASSUMPTION',
    priceSourceLabel: 'Estimasi AI',
    priceSourceExplanation:
      'Estimasi AI (Magic AI) — perkiraan, bukan harga database AHSP EZRAB.',
    verificationStatus: 'NEEDS_VERIFICATION',
  };
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
