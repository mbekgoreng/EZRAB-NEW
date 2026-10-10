/**
 * DED AI ESTIMATE — Types (src/ai-tools/ded-ai-estimate/types.ts)
 *
 * STANDALONE estimation product. These types are self-contained — they do NOT
 * import AHSP matcher, price resolver, HSD database, masterRegistry, official
 * price database, or project price engine. They define the estimate from scratch.
 *
 * Core contracts (from master prompt):
 * - quantity: null is allowed, never 0.
 * - unitPrice: null is allowed, never 0.
 * - subtotal = quantity × unitPrice, deterministic, code-calculated.
 * - No grand-total from the AI — totals are computed by `calculator.ts`.
 */

export type DedAiProjectType =
  | 'BANGUNAN'
  | 'GEDUNG'
  | 'BANGUNAN AIR'
  | 'JALAN'
  | 'PAVING'
  | (string & {});

export type DedAiMode = 'FAST' | 'DETAIL';

export type DedAiQuantitySource =
  | 'DED_EXPLICIT'   // Nilai dan satuan benar-benar dinyatakan di dokumen sumber dan terverifikasi
  | 'DED_GEOMETRIC'  // Dihitung dari dimensi/geometri yang ditemukan di DED
  | 'DERIVED'        // Hasil rumus deterministik dengan semua input tersedia dan terverifikasi
  | 'USER_INPUT'     // Nilai yang dimasukkan/diubah secara eksplisit oleh pengguna
  | 'AI_INFERENCE'   // Hasil inferensi AI tanpa bukti eksplisit memadai
  | 'ASSUMPTION'     // Nilai asumsi yang perlu disetujui pengguna
  | 'UNRESOLVED';    // Nilai atau satuan belum dapat dipastikan

export type DedAiPriceSource =
  | 'AI_ESTIMATE'  // Estimasi dari model AI — perlu verifikasi, bukan harga resmi
  | 'AHSP_2026'    // Dari database AHSP 2026 terverifikasi (belum aktif — reserved)
  | 'USER_INPUT'   // Dimasukkan/diubah oleh pengguna
  | 'UNRESOLVED';  // Harga belum tersedia — bukan Rp0

export interface DedAiItem {
  id: string;
  name: string;
  category: string;
  specification?: string;
  description?: string;
  units: string;
  quantity: number | null;
  quantitySource: DedAiQuantitySource;
  quantityFormula?: string;
  /** FASE DED-FIX: alasan user-facing bila quantity unresolved/inferensi/asumsi */
  quantityNote?: string;
  /** FASE DED-FIX: dimensi mentah sebagai evidence audit */
  rawDimensions?: string;
  /**
   * PHASE 3C: Jejak derivasi terstruktur untuk kuantitas turunan.
   * Diisi ketika quantitySource = DERIVED atau DED_GEOMETRIC.
   */
  derivation?: {
    formulaType: string;        // mis. "kolom_volume", "dinding_netto", "plester_2_sisi"
    inputs: Array<{             // input dimensi dengan satuan dan sumber
      name: string;             // mis. "jumlah_kolom", "lebar", "tinggi"
      value: number;
      unit: string;             // satuan asli sebelum normalisasi
      source: string;           // "DED" | "USER" | "ASSUMPTION"
    }>;
    normalizedInputs?: Array<{ name: string; value: number; unit: string }>;
    result: number | null;
    resultUnit: string;
    validationStatus: string;   // "ok" | "rejected: <alasan>"
    notes?: string;
  };
  rawAIQuantity?: number | null;
  unitPrice: number | null;
  priceSource: DedAiPriceSource;
  priceAssumptionNote?: string;
  subtotal: number | null;
  sourcePages: number[];
  sourceEvidence?: string;
  provenance: string[];
  stage: 'PARSE' | 'QUANTITY' | 'PRICING' | 'CALCULATED' | 'REJECTED';
}

export interface DedAiCategorySummary {
  category: string;
  subtotal: number;
  itemCount: number;
  resolvedCount: number;
  unresolvedCount: number;
}

export interface DedAiOutput {
  success: boolean;
  jobId: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  projectName: string;
  fileName?: string;
  pageCount: number;
  items: DedAiItem[];
  grandTotal: number;
  categorySummaries: DedAiCategorySummary[];
  coverage: {
    totalItems: number;
    itemsWithQuantity: number;
    itemsWithPrice: number;
    itemsFullyResolved: number;
    itemsUnresolved: number;
  };
}

export type DedAiProgressEvent = {
  stage: string;
  label: string;
  percent: number;
  message: string;
  pagesRead: number;
  totalPages: number;
};

export interface DedAiServiceOptions {
  fileName: string;
  buffer: ArrayBuffer | Uint8Array | Buffer | string;
  mimeType?: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  projectName?: string;
  onProgress?: (event: DedAiProgressEvent) => void;
}
