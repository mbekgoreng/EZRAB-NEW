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
  /** WBS: kode klasifikasi (diisi oleh wbsClassifier, tidak mengubah data asli) */
  wbsCode?: string;
  wbsName?: string;
  wbsStatus?: 'IDENTIFIED' | 'DERIVED' | 'NEEDS_CONFIRM' | 'OPTIONAL';
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
  /**
   * FASE P0: cakupan 12 divisi rumah (diisi service untuk proyek
   * BANGUNAN/GEDUNG; opsional agar konsumen lama tidak berubah).
   */
  divisionCoverage?: DedDivisionCoverage[];
  /**
   * FASE P0: jejak analisis per halaman & per pass — tidak ada halaman
   * yang hilang diam-diam karena budget/kegagalan pass.
   */
  analysisTrace?: DedAnalysisTrace;
}

/**
 * FASE P0 — Kontrak cakupan 12 divisi rumah.
 * Status per divisi (enum tertutup, bukan string bebas):
 * - IDENTIFIED: ada item dari DED (kuantitas terverifikasi/turunan deterministik).
 * - ASSUMPTION_REQUIRES_CONFIRMATION: hanya ada item inferensi/asumsi, atau
 *   divisi hanya didukung scaffold template (kandidat asumsi terlabel).
 * - INSUFFICIENT_DATA: divisi relevan tetapi bukti DED tidak cukup
 *   (mis. halaman ada, item tidak terekstrak; atau tidak ada scaffold).
 * - NOT_APPLICABLE: divisi rumah tidak berlaku untuk tipe proyek ini.
 */
export type DedDivisionCoverageStatus =
  | 'IDENTIFIED'
  | 'ASSUMPTION_REQUIRES_CONFIRMATION'
  | 'INSUFFICIENT_DATA'
  | 'NOT_APPLICABLE';

/** Kandidat asumsi dari scaffold template — TANPA volume/harga (tidak pernah difabrikasi). */
export interface DedDivisionAssumptionCandidate {
  name: string;
  unit: string;
  /** Kode WBS template asal (houseType36), mis. "10.01" — bukan kode AHSP. */
  templateWbsCode: string;
  source: 'TEMPLATE_RUMAH_TIPE36';
  note: string;
}

export interface DedDivisionCoverage {
  divisionCode: string; // "DIV-01" .. "DIV-12"
  divisionName: string;
  order: number;
  status: DedDivisionCoverageStatus;
  itemCount: number;
  identifiedItemCount: number;
  needsConfirmItemCount: number;
  itemIds: string[];
  /** Halaman yang jenisnya menjadi bukti pendukung divisi ini. */
  evidencePages: number[];
  assumptionCandidates: DedDivisionAssumptionCandidate[];
  note: string;
}

/** FASE P0 — Jejak per halaman: dikirim / terlewat budget, selalu dengan alasan. */
export interface DedPageTraceEntry {
  page: number;
  title: string;
  pageType: string;
  totalChars: number;
  sentChars: number;
  status: 'SENT' | 'SKIPPED_BUDGET' | 'NO_TEXT';
  reason?: string;
  passIndex?: number;
  clusterLabel?: string;
  /**
   * FINAL REVIEW (Tugas A) — nama file sumber pada hasil gabungan multi-file.
   * Nomor `page` pada hasil gabungan sudah dioffset global; field ini membuat
   * asal file setiap halaman/pass eksplisit, bukan tebakan.
   */
  sourceFile?: string;
}

/** FASE P0 — Jejak per pass analisis (kelompok halaman → satu panggilan model). */
export interface DedPassTraceEntry {
  passIndex: number;
  clusterLabel: string;
  pageTypes: string[];
  pages: number[];
  /** Produk gateway yang dipakai (DED_AI_FAST / DED_AI_DETAIL) — bukan nama model final. */
  productId: string;
  mode: DedAiMode;
  maxTokens: number;
  status: 'OK' | 'FAILED' | 'EMPTY_RESPONSE' | 'MALFORMED_RESPONSE';
  errorCode?: string;
  itemCount: number;
  /** FINAL REVIEW (Tugas A) — nama file sumber pada hasil gabungan multi-file. */
  sourceFile?: string;
}

export interface DedAnalysisTrace {
  totalPages: number;
  selectedPageCount: number;
  skippedPageCount: number;
  totalCharsBudget: number;
  totalCharsSent: number;
  pages: DedPageTraceEntry[];
  passes: DedPassTraceEntry[];
  warnings: string[];
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
