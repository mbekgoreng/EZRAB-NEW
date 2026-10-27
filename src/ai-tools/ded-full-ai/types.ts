/**
 * FULL AI DED ESTIMATE — Types
 *
 * Terisolasi dari pipeline lama (src/ai-tools/ded-ai-estimate/).
 * AI adalah mesin estimasi utama. Aplikasi memvalidasi struktur,
 * memeriksa aritmetika, menampilkan hasil — TIDAK me-recalculate
 * kuantitas AI secara diam-diam.
 */

export type FullAiProvenance =
  | 'EXPLICIT'           // Langsung teridentifikasi dalam DED
  | 'DERIVED'            // Turunan dari dimensi/informasi tersedia
  | 'ASSUMPTION'         // Estimasi berdasarkan asumsi
  | 'NEEDS_CONFIRMATION' // Informasi penting belum jelas
  | 'UNRESOLVED'         // Belum dapat ditentukan
  | 'USER_INPUT';        // Diedit/dimasukkan oleh pengguna

/**
 * Kebijakan harga DED-to-RAB — konsep yang sama dengan DedEstimationPolicy
 * mesin standar, diduplikasi di sini agar modul ini tetap terisolasi
 * (tidak mengimpor pipeline lama). FULL_AI = estimasi AI boleh dipakai
 * (perilaku lama); DATABASE = estimasi AI ditolak di service layer,
 * hanya VERIFIED_SOURCE (dengan ahspCode) dan USER_INPUT yang lolos.
 */
export type DedEstimationPolicy = 'FULL_AI' | 'DATABASE';

import type { CanonicalDedMatch } from '../ded-canonical/canonicalDedPricing';

export type FullAiPriceSource =
  | 'AHSP_2026'          // Harga kanonis EZRAB (SE DJBK 47/2026, biaya langsung) — SATU-SATUNYA nilai yang berarti "terverifikasi database" untuk hasil baru; hanya diproduksi lewat resolveDedPriceWithCanonical
  | 'VERIFIED_SOURCE'    // LEGASI — klaim model lama yang belum dikonfirmasi database. TIDAK LAGI diproduksi (service menurunkannya ke AI_ESTIMATE/UNRESOLVED); dipertahankan di union agar draft & riwayat lama tetap terbaca, dan UI menampilkannya sebagai "belum terverifikasi independen", bukan "Terverifikasi"
  | 'USER_INPUT'         // Dari pengguna
  | 'AI_ESTIMATE'        // Estimasi AI
  | 'UNRESOLVED';        // Belum tersedia (bukan Rp0)

export interface FullAiQuantityDetail {
  value: number | null;
  unit: string;
  formula?: string;           // Rumus yang dapat diaudit
  steps?: string[];           // Langkah perhitungan
  dimensions?: string;        // Dimensi dasar
  sourcePages?: number[];
  provenance: FullAiProvenance;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  assumptions?: string[];     // Asumsi yang digunakan
  notes?: string;             // Catatan ketidakpastian
}

export interface FullAiPriceDetail {
  unitPrice: number | null;
  unit: string;               // Satuan harga (harus cocok dengan satuan quantity)
  source: FullAiPriceSource;
  region?: string;
  period?: string;            // Mis. "2026"
  ahspCode?: string;
  notes?: string;
  /** Hasil resolusi kanonis terakhir (status, kandidat review, alasan). */
  ahspMatch?: CanonicalDedMatch;
}

export type FullAiExclusionReason =
  | 'MISSING_QUANTITY'       // quantity.value null
  | 'INVALID_QUANTITY'       // quantity negatif, NaN, atau non-finite
  | 'MISSING_UNIT'           // satuan quantity kosong
  | 'MISSING_UNIT_PRICE'     // unitPrice null
  | 'INVALID_UNIT_PRICE'     // unitPrice negatif, NaN, atau non-finite
  | 'INVALID_PRICE_UNIT'     // satuan harga tidak cocok dengan satuan quantity
  | 'UNRESOLVED_PROVENANCE'  // provenance UNRESOLVED
  | 'NEEDS_CONFIRMATION'     // butuh konfirmasi eksplisit
  | 'PRICE_UNRESOLVED'       // sumber harga UNRESOLVED
  | null;                    // null = tidak ada alasan eksklusi (masuk total)

export interface FullAiItem {
  id: string;
  no: number;
  wbsCode?: string;           // Kode WBS (dari katalog dinamis)
  wbsGroup?: string;          // Nama kelompok
  name: string;
  description?: string;
  category: string;
  quantity: FullAiQuantityDetail;
  price: FullAiPriceDetail;
  subtotal: number | null;    // Dihitung aplikasi: qty × price (verifikasi saja)
  subtotalVerified: boolean;  // true HANYA bila subtotal benar-benar dihitung aplikasi dari qty × harga yang keduanya ada; false bila subtotal null (tidak ada yang diverifikasi)
  subtotalDiscrepancy?: string; // Jika tidak cocok, jelaskan selisihnya
  status: 'READY' | 'NEEDS_CONFIRMATION' | 'UNRESOLVED' | 'EXCLUDED';
  exclusionReason: FullAiExclusionReason; // Alasan spesifik tidak masuk total
  sourcePages?: number[];
}

export interface FullAiProjectInfo {
  projectType: string;
  buildingFunction?: string;
  floorCount?: number;
  mainDimensions?: string;
  structuralSystem?: string;
  scopeSummary: string;
  missingInfo?: string[];     // Informasi yang belum tersedia
  ambiguities?: string[];     // Hal yang masih ambigu
}

export interface FullAiSummary {
  totalItems: number;
  itemsWithQuantity: number;
  itemsWithAssumption: number;
  itemsNeedConfirmation: number;
  itemsWithAiPrice: number;
  itemsWithVerifiedPrice: number;
  itemsUnresolved: number;
  excludedFromTotal: number;
  excludedValue?: string;     // Nilai yang dikecualikan dari total
}

export interface FullAiOutput {
  success: boolean;
  mode: 'FAST' | 'ADVANCED';
  /** Kebijakan harga yang dipakai estimasi ini (tersimpan bersama hasil). */
  policy: DedEstimationPolicy;
  projectInfo: FullAiProjectInfo;
  items: FullAiItem[];
  grandTotal: number | null;
  grandTotalNote?: string;    // Peringatan jika ada item yang dikecualikan
  summary: FullAiSummary;
  warnings: string[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  provenance: {
    /** Provider yang BENAR-BENAR melayani respons (dari gateway); null = respons tidak membawa identitas — jangan ditebak. */
    provider: string | null;
    /** Model yang BENAR-BENAR melayani respons (dari gateway); null = tidak diketahui. */
    model: string | null;
    /** Batas waktu pemrosesan per panggilan AI yang diterapkan (ms) — dinyatakan terbuka, bukan plafon diam-diam. */
    timeoutLimitMs: number;
    timestamp: string;
    documentPages: number;
    documentChars: number;
  };
}

export interface FullAiServiceOptions {
  fileName: string;
  buffer: ArrayBuffer | Uint8Array | Buffer | string;
  projectType: string;
  mode: 'FAST' | 'ADVANCED';
  /** Kebijakan harga (default 'FULL_AI' bila tidak diisi — perilaku lama). */
  policy?: DedEstimationPolicy;
  projectName?: string;
  onProgress?: (stage: string, percent: number, message: string) => void;
}
