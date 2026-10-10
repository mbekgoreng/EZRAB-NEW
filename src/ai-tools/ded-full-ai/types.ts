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

export type FullAiPriceSource =
  | 'VERIFIED_SOURCE'    // Dari AHSP/database terverifikasi
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
}

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
  subtotalVerified: boolean;  // Apakah subtotal AI cocok dengan hitungan aplikasi
  subtotalDiscrepancy?: string; // Jika tidak cocok, jelaskan selisihnya
  status: 'READY' | 'NEEDS_CONFIRMATION' | 'UNRESOLVED' | 'EXCLUDED';
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
    model: string;
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
  projectName?: string;
  onProgress?: (stage: string, percent: number, message: string) => void;
}
