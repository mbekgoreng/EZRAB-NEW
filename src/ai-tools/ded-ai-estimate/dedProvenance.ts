/**
 * DED-RAB AI DUAL MODE §8 — Pemetaan provenance kanonis DED ↔ RAB (W6).
 *
 * SATU tabel pemetaan untuk kosakata provenance yang tumpang tindih
 * (discovery §6: 7+ kosakata — DedAiPriceSource, FullAiPriceSource,
 * DedPriceClassification, DedPriceSourceKind, RabItem.priceSourceKind,
 * PriceStatus, VerificationStatus). Modul ini murni pemetaan (C5:
 * PETAKAN, jangan ganti enum): tidak ada enum yang diubah di sini —
 * satu-satunya perluasan aditif program ini adalah anggota 'USER_MANUAL'
 * pada RabItem.priceSourceKind (src/types/index.ts, G-PV-3).
 *
 * Label directive §8 (lima) dan padanannya:
 * - AI_GENERATED      — nilai dihasilkan AI. ADA di VerificationStatus.
 * - AI_ESTIMATED      — TIDAK ADA persis; padanan: AI_ESTIMATE (DED) /
 *   PRICE_ESTIMATED (RAB) / ESTIMATED (VerificationStatus). Dipetakan,
 *   bukan ditambah.
 * - USER_PROVIDED     — TIDAK ADA persis; padanan: USER_INPUT (DED) /
 *   USER_MANUAL (DedPriceSourceKind) / MANUAL_PRICE (klasifikasi) /
 *   PRICE_MANUAL (RAB). Kind RAB-nya kini USER_MANUAL (aditif, G-PV-3).
 * - EXTERNALLY_VERIFIED — TIDAK ADA persis; padanan terdekat:
 *   VERIFIED_SUPPLIER (tier supplier — daftar harga yang benar-benar
 *   diambil & dicatat) / MARKET_REFERENCE (RAB). TIDAK ditambah sebagai
 *   anggota enum baru: MARKET_REFERENCE sudah membawa semantik persis
 *   ini di kontrak bukti S2 (hasResolvedPriceEvidence mengakuinya
 *   sebagai bukti resolved), dan VERIFIED_SUPPLIER sudah ada di
 *   DedPriceSourceKind — anggota baru hanya akan menduplikasi keduanya.
 * - UNRESOLVED        — ADA di 4 kosakata + PRICE_UNRESOLVED.
 *
 * Dua keputusan pemetaan yang disengaja (baca sebelum mengubah):
 * 1. Kanonis AHSP_2026 → label EXTERNALLY_VERIFIED (harganya
 *    terverifikasi terhadap katalog resmi eksternal SE 47/2026), TAPI
 *    kind RAB-nya tetap OFFICIAL_AHSP — jalur finalisasi TIDAK
 *    merutekan kanonis lewat tabel label untuk kind (lihat
 *    dedTransferClaim). Akibatnya round-trip label → RAB → label
 *    untuk kanonis bersifat LOSSY pada kind (label menghasilkan
 *    MARKET_REFERENCE, bukan OFFICIAL_AHSP); yang dipertahankan penuh
 *    adalah label + priceStatus + verificationStatus. Ini dicatat
 *    eksplisit, bukan disembunyikan.
 * 2. Item AI_ESTIMATE TIDAK PERNAH naik menjadi EXTERNALLY_VERIFIED
 *    lewat blok penyelesaian: klasifikasi MARKET_REFERENCE pada
 *    penyelesaian selalu UNVERIFIED menurut konstruksi
 *    (priceCompletion.ts — VERIFIED hanya untuk
 *    OFFICIAL_AHSP_VERIFIED, yang hanya distempel bila priceSource
 *    memang AHSP_2026) dan persetujuan user-nya PENDING sampai
 *    diterima. Bukti referensi pasar tetap terbaca di blok
 *    penyelesaian (klasifikasi + sumber + tanggal), bukan di label
 *    item. Kenaikan ke EXTERNALLY_VERIFIED membutuhkan verifikasi
 *    eksplisit — di luar cakupan W6.
 *
 * Modul ini TIDAK mengimpor runtime apa pun (hanya tipe) agar aman
 * diimpor tampilan hasil (DedAiResultView / FullAiResultView) tanpa
 * menarik graf universalRab. Kontrak transfer S2 sendiri dipasang di
 * finalizeMapping.ts (G-PV-2), yang memakai dedTransferClaim dari sini
 * sebagai klaim masukannya.
 */

import type {
  DedAiPriceSource,
  DedPriceClassification,
  DedPriceSourceKind,
} from './types';
import type { FullAiPriceSource } from '../ded-full-ai/types';
import type { PriceStatus, RabItem, VerificationStatus } from '../../types';

/** Label provenance directive §8 — lima label, tanpa tambahan. */
export type DedProvenanceLabel =
  | 'AI_GENERATED'
  | 'AI_ESTIMATED'
  | 'USER_PROVIDED'
  | 'EXTERNALLY_VERIFIED'
  | 'UNRESOLVED';

export const DED_PROVENANCE_LABELS: readonly DedProvenanceLabel[] = [
  'AI_GENERATED',
  'AI_ESTIMATED',
  'USER_PROVIDED',
  'EXTERNALLY_VERIFIED',
  'UNRESOLVED',
] as const;

export type RabPriceSourceKind = NonNullable<RabItem['priceSourceKind']>;

export interface DedProvenanceMapping {
  label: DedProvenanceLabel;
  /**
   * Sumber harga DED (DedAiPriceSource / FullAiPriceSource). null =
   * tidak ada padanan persis di kosakata DED (hanya
   * EXTERNALLY_VERIFIED; perbedaannya hidup di blok penyelesaian —
   * klasifikasi MARKET_REFERENCE + sourceKind VERIFIED_SUPPLIER).
   */
  dedPriceSource: DedAiPriceSource | null;
  dedPriceSourceKind: DedPriceSourceKind;
  dedClassification: DedPriceClassification;
  rabPriceSourceKind: RabPriceSourceKind;
  priceStatus: PriceStatus;
  verificationStatus: VerificationStatus;
  /** Label UI Bahasa Indonesia (satu sumber — dipakai kedua result view). */
  uiLabel: string;
  /** Penjelasan jujur satu kalimat untuk UI / detail item. */
  explanation: string;
  /** Catatan bila pemetaan memakai nilai terdekat, bukan padanan persis. */
  nearestMatchNote?: string;
}

/**
 * SATU-SATUNYA tabel pemetaan kanonis provenance DED ↔ RAB.
 * AI_GENERATED vs AI_ESTIMATED berbagi sumber DED, kind RAB, dan
 * priceStatus — yang membedakan hanya VerificationStatus (AI_GENERATED
 * = nilai dihasilkan AI; NEEDS_VERIFICATION = estimasi menunggu
 * verifikasi). Itulah yang membuat round-trip keduanya tetap utuh.
 */
export const DED_PROVENANCE_MAP: Record<DedProvenanceLabel, DedProvenanceMapping> = {
  AI_GENERATED: {
    label: 'AI_GENERATED',
    dedPriceSource: 'AI_ESTIMATE',
    dedPriceSourceKind: 'AI_ESTIMATE',
    dedClassification: 'AI_ESTIMATE',
    rabPriceSourceKind: 'EZRAB_ASSUMPTION',
    priceStatus: 'PRICE_ESTIMATED',
    verificationStatus: 'AI_GENERATED',
    uiLabel: 'Dihasilkan AI',
    explanation:
      'Nilai dihasilkan AI — bukan harga database; perlu verifikasi sebelum dipakai untuk pengadaan, tender, atau kontrak.',
  },
  AI_ESTIMATED: {
    label: 'AI_ESTIMATED',
    dedPriceSource: 'AI_ESTIMATE',
    dedPriceSourceKind: 'AI_ESTIMATE',
    dedClassification: 'AI_ESTIMATE',
    rabPriceSourceKind: 'EZRAB_ASSUMPTION',
    priceStatus: 'PRICE_ESTIMATED',
    verificationStatus: 'NEEDS_VERIFICATION',
    uiLabel: 'Estimasi AI',
    explanation:
      'Estimasi AI — perkiraan model, bukan harga database AHSP EZRAB; perlu verifikasi.',
  },
  USER_PROVIDED: {
    label: 'USER_PROVIDED',
    dedPriceSource: 'USER_INPUT',
    dedPriceSourceKind: 'USER_MANUAL',
    dedClassification: 'MANUAL_PRICE',
    rabPriceSourceKind: 'USER_MANUAL',
    priceStatus: 'PRICE_MANUAL',
    verificationStatus: 'NEEDS_VERIFICATION',
    uiLabel: 'Input User',
    explanation:
      'Harga dimasukkan pengguna secara manual — bukan harga database AHSP; perlu verifikasi.',
  },
  EXTERNALLY_VERIFIED: {
    label: 'EXTERNALLY_VERIFIED',
    dedPriceSource: null,
    dedPriceSourceKind: 'VERIFIED_SUPPLIER',
    dedClassification: 'MARKET_REFERENCE',
    rabPriceSourceKind: 'MARKET_REFERENCE',
    priceStatus: 'PRICE_RESOLVED',
    verificationStatus: 'VERIFIED',
    uiLabel: 'Terverifikasi Eksternal',
    explanation:
      'Harga terverifikasi terhadap referensi eksternal (daftar harga supplier/pasar yang dicatat) — bukan estimasi AI.',
    nearestMatchNote:
      'Tidak ada anggota enum EXTERNALLY_VERIFIED: VERIFIED_SUPPLIER ' +
      '(DED) / MARKET_REFERENCE (RAB) sudah membawa semantik ini, dan ' +
      'MARKET_REFERENCE diakui kontrak bukti S2 sebagai bukti resolved.',
  },
  UNRESOLVED: {
    label: 'UNRESOLVED',
    dedPriceSource: 'UNRESOLVED',
    dedPriceSourceKind: 'UNRESOLVED',
    dedClassification: 'PRICE_UNRESOLVED',
    rabPriceSourceKind: 'UNRESOLVED',
    priceStatus: 'PRICE_UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
    uiLabel: 'Belum Ada Harga',
    explanation:
      'Harga belum tersedia — bukan Rp0; item tidak masuk total sampai harganya dilengkapi.',
  },
};

/** Label → provenance sisi RAB (dipakai round-trip + konsumen label). */
export function labelToRabProvenance(label: DedProvenanceLabel): {
  priceSourceKind: RabPriceSourceKind;
  priceStatus: PriceStatus;
  verificationStatus: VerificationStatus;
} {
  const m = DED_PROVENANCE_MAP[label];
  return {
    priceSourceKind: m.rabPriceSourceKind,
    priceStatus: m.priceStatus,
    verificationStatus: m.verificationStatus,
  };
}

/**
 * Sumber harga DED → label directive §8.
 * - AHSP_2026 → EXTERNALLY_VERIFIED (terverifikasi terhadap katalog
 *   resmi eksternal SE 47/2026; kind RAB OFFICIAL_AHSP dipertahankan
 *   terpisah oleh dedTransferClaim, bukan lewat tabel label).
 * - VERIFIED_SOURCE (warisan Full AI) → AI_ESTIMATED: klaim lama yang
 *   belum dikonfirmasi database — plafon jujur, TIDAK PERNAH
 *   EXTERNALLY_VERIFIED tanpa bukti.
 * - Sumber tak dikenal → UNRESOLVED (fail-closed).
 */
export function dedSourceToLabel(
  source: DedAiPriceSource | FullAiPriceSource | string | null | undefined,
): DedProvenanceLabel {
  switch (source) {
    case 'AHSP_2026':
      return 'EXTERNALLY_VERIFIED';
    case 'USER_INPUT':
      return 'USER_PROVIDED';
    case 'AI_ESTIMATE':
    case 'VERIFIED_SOURCE':
      return 'AI_ESTIMATED';
    case 'UNRESOLVED':
    default:
      return 'UNRESOLVED';
  }
}

/**
 * RAB → label directive §8 (arah balik round-trip). Precedence
 * didokumentasikan agar tidak ambigu:
 *  1. PRICE_UNRESOLVED → UNRESOLVED (tanpa harga = tanpa provenance);
 *  2. PRICE_MANUAL / kind USER_MANUAL → USER_PROVIDED;
 *  3. kind OFFICIAL_AHSP / MARKET_REFERENCE → EXTERNALLY_VERIFIED
 *     (keduanya bukti resolved menurut kontrak S2);
 *  4. PRICE_RESOLVED → EXTERNALLY_VERIFIED (resolved menyiratkan bukti,
 *     karena S2 menurunkan klaim tanpa bukti ke ESTIMATED);
 *  5. verificationStatus AI_GENERATED → AI_GENERATED;
 *  6. PRICE_ESTIMATED / kind EZRAB_ASSUMPTION → AI_ESTIMATED;
 *  7. kind UNRESOLVED → UNRESOLVED;
 *  8. selain itu → UNRESOLVED (fail-closed — jangan simpulkan
 *     provenance dari data yang tidak menyebutkannya).
 */
export function rabProvenanceToLabel(input: {
  priceStatus?: string | null;
  priceSourceKind?: string | null;
  verificationStatus?: string | null;
}): DedProvenanceLabel {
  if (input.priceStatus === 'PRICE_UNRESOLVED') return 'UNRESOLVED';
  if (input.priceStatus === 'PRICE_MANUAL' || input.priceSourceKind === 'USER_MANUAL') {
    return 'USER_PROVIDED';
  }
  if (input.priceSourceKind === 'OFFICIAL_AHSP' || input.priceSourceKind === 'MARKET_REFERENCE') {
    return 'EXTERNALLY_VERIFIED';
  }
  if (input.priceStatus === 'PRICE_RESOLVED') return 'EXTERNALLY_VERIFIED';
  if (input.verificationStatus === 'AI_GENERATED') return 'AI_GENERATED';
  if (input.priceStatus === 'PRICE_ESTIMATED' || input.priceSourceKind === 'EZRAB_ASSUMPTION') {
    return 'AI_ESTIMATED';
  }
  if (input.priceSourceKind === 'UNRESOLVED') return 'UNRESOLVED';
  return 'UNRESOLVED';
}

/**
 * Klaim provenance DED untuk kontrak transfer S2 (G-PV-2). finalizeMapping
 * memakai ini sebagai MASUKAN transferPriceStatus /
 * transferVerificationStatus — klaim di sini adalah klaim, BUKAN hasil
 * akhir: S2 yang memutuskan status akhir (klaim RESOLVED tanpa bukti
 * diturunkan ke ESTIMATED; status tak dikenal + harga valid → ESTIMATED).
 *
 * - Kanonis: klaim PRICE_RESOLVED + kind OFFICIAL_AHSP (bukti menurut
 *   S2) + VERIFIED — satu-satunya cabang yang boleh RESOLVED/VERIFIED.
 * - AI: klaim PRICE_ESTIMATED + EZRAB_ASSUMPTION + NEEDS_VERIFICATION.
 * - Manual: klaim PRICE_MANUAL + USER_MANUAL (G-PV-3) +
 *   NEEDS_VERIFICATION.
 * - Warisan VERIFIED_SOURCE / tak dikenal: TANPA klaim status & kind —
 *   S2 memberi plafon jujur PRICE_ESTIMATED untuk harga valid.
 */
export interface DedTransferClaim {
  label: DedProvenanceLabel;
  claimedPriceStatus?: PriceStatus;
  priceSourceKind?: RabPriceSourceKind;
  claimedVerificationStatus: VerificationStatus;
}

export function dedTransferClaim(
  source: DedAiPriceSource | FullAiPriceSource | string | null | undefined,
): DedTransferClaim {
  switch (source) {
    case 'AHSP_2026':
      return {
        label: 'EXTERNALLY_VERIFIED',
        claimedPriceStatus: 'PRICE_RESOLVED',
        priceSourceKind: 'OFFICIAL_AHSP',
        claimedVerificationStatus: 'VERIFIED',
      };
    case 'AI_ESTIMATE':
      return {
        label: 'AI_ESTIMATED',
        claimedPriceStatus: 'PRICE_ESTIMATED',
        priceSourceKind: 'EZRAB_ASSUMPTION',
        claimedVerificationStatus: 'NEEDS_VERIFICATION',
      };
    case 'USER_INPUT':
      return {
        label: 'USER_PROVIDED',
        claimedPriceStatus: 'PRICE_MANUAL',
        priceSourceKind: 'USER_MANUAL',
        claimedVerificationStatus: 'NEEDS_VERIFICATION',
      };
    case 'VERIFIED_SOURCE':
    case 'UNRESOLVED':
    default:
      return {
        label: source === 'VERIFIED_SOURCE' ? 'AI_ESTIMATED' : 'UNRESOLVED',
        claimedVerificationStatus: 'NEEDS_VERIFICATION',
      };
  }
}

/** Warna chip provenance UI (satu sumber — dipakai kedua result view). */
export interface ProvenanceBadgeProps {
  text: string;
  bg: string;
  fg: string;
}

const LABEL_BADGES: Record<DedProvenanceLabel, ProvenanceBadgeProps> = {
  AI_GENERATED: { text: 'Dihasilkan AI', bg: '#FEF3C7', fg: '#92400E' },
  AI_ESTIMATED: { text: 'Estimasi AI', bg: '#FEF3C7', fg: '#92400E' },
  USER_PROVIDED: { text: 'Input User', bg: '#F3E8FF', fg: '#6B21A8' },
  EXTERNALLY_VERIFIED: { text: 'Terverifikasi', bg: '#DCFCE7', fg: '#166534' },
  UNRESOLVED: { text: 'Tanpa Harga', bg: '#F3F4F6', fg: '#6B7280' },
};

export function provenanceBadgeForLabel(label: DedProvenanceLabel): ProvenanceBadgeProps {
  return LABEL_BADGES[label] ?? LABEL_BADGES.UNRESOLVED;
}

/**
 * Chip provenance untuk satu item DED, dari sumber harganya. Kanonis
 * memakai teks spesifik 'AHSP Kanonis' (bukan 'Terverifikasi' generik)
 * agar selaras dengan label yang sudah dipakai UI selama ini.
 */
export function provenanceBadgeForDedSource(
  source: DedAiPriceSource | FullAiPriceSource | string | null | undefined,
): ProvenanceBadgeProps {
  if (source === 'AHSP_2026') {
    return { text: 'AHSP Kanonis', bg: '#DCFCE7', fg: '#166534' };
  }
  if (source === 'VERIFIED_SOURCE') {
    return { text: 'Belum terverifikasi', bg: '#F3F4F6', fg: '#6B7280' };
  }
  return provenanceBadgeForLabel(dedSourceToLabel(source));
}

/** Penjelasan satu kalimat untuk satu item DED, dari sumber harganya. */
export function provenanceExplanationForDedSource(
  source: DedAiPriceSource | FullAiPriceSource | string | null | undefined,
): string {
  if (source === 'AHSP_2026') {
    return 'Harga AHSP kanonis (SE 47/2026, biaya langsung) — tervalidasi database EZRAB.';
  }
  if (source === 'VERIFIED_SOURCE') {
    return 'Sumber harga lama yang belum terverifikasi independen — bukan harga kanonis AHSP.';
  }
  return DED_PROVENANCE_MAP[dedSourceToLabel(source)].explanation;
}
