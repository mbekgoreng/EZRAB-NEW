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

/**
 * Kebijakan harga DED-to-RAB (owner 2026-10-27; dua mode):
 * - 'FULL_AI': estimasi harga AI BOLEH dipakai bila harga terverifikasi
 *   tidak tersedia (perilaku lama mesin standar — semua harga adalah
 *   AI_ESTIMATE atau UNRESOLVED). Estimasi selalu dilabel AI_ESTIMATE,
 *   divalidasi isSaneEstimate, dan TIDAK PERNAH menimpa data master.
 * - 'DATABASE': harga diutamakan dari database AHSP kanonis lewat adapter
 *   ded-canonical (kanonis RESOLVED menang). Bila item tidak ada di
 *   database, estimasi AI dipakai sebagai FALLBACK berlabel jelas
 *   AI_ESTIMATE (keputusan owner 2026-10-27 malam, dikonfirmasi
 *   2026-10-27 23:33 saat misi pemisahan mode DED-to-RAB — fallback ini
 *   dipertahankan atas perintah eksplisit owner, bukan harga database).
 *   Estimasi hilang/tidak wajar tetap UNRESOLVED (null, bukan Rp0) dan
 *   total yang memakai item unresolved menjadi parsial. Prompt mode
 *   DATABASE melarang AI menulis kode/koefisien/harga resmi (lihat
 *   prompts/policy.ts); gerbang ini + adapter yang menegakkannya.
 * Default: 'FULL_AI' (mempertahankan perilaku lama bila pengguna tidak
 * memilih; mode DATABASE adalah opt-in eksplisit).
 */
export type DedEstimationPolicy = 'FULL_AI' | 'DATABASE';

export type DedAiQuantitySource =
  | 'DED_EXPLICIT'   // Nilai dan satuan benar-benar dinyatakan di dokumen sumber dan terverifikasi
  | 'DED_GEOMETRIC'  // Dihitung dari dimensi/geometri yang ditemukan di DED
  | 'DERIVED'        // Hasil rumus deterministik dengan semua input tersedia dan terverifikasi
  | 'USER_INPUT'     // Nilai yang dimasukkan/diubah secara eksplisit oleh pengguna
  | 'AI_INFERENCE'   // Hasil inferensi AI tanpa bukti eksplisit memadai
  | 'ASSUMPTION'     // Nilai asumsi yang perlu disetujui pengguna
  | 'UNRESOLVED';    // Nilai atau satuan belum dapat dipastikan

import type { CanonicalDedMatch } from '../ded-canonical/canonicalDedPricing';

export type DedAiPriceSource =
  | 'AI_ESTIMATE'  // Estimasi dari model AI — perlu verifikasi, bukan harga resmi
  | 'AHSP_2026'    // Harga kanonis EZRAB (SE DJBK 47/2026, biaya langsung) — AKTIF sejak adapter ded-canonical; hanya diproduksi lewat resolveDedPriceWithCanonical
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
  /** Kode AHSP kanonis yang terverifikasi (hanya bila priceSource AHSP_2026). */
  ahspCode?: string;
  /** Hasil resolusi kanonis terakhir (status, kandidat review, alasan) — tersimpan bersama item agar review bisa dilanjutkan tanpa analisis ulang. */
  ahspMatch?: CanonicalDedMatch;
  priceAssumptionNote?: string;
  subtotal: number | null;
  /**
   * Usulan AI (mode FULL_AI saja, dari field proposedSubtotal model):
   * quantity × estimatedUnitPrice versi AI. TIDAK PERNAH dipakai sebagai
   * subtotal resmi — subtotal resmi selalu dihitung aplikasi (calcSubtotal).
   * Disimpan agar selisih dengan subtotal terverifikasi bisa ditandai.
   */
  aiProposedSubtotal?: number | null;
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
  /** Kebijakan harga yang dipakai estimasi ini (tersimpan bersama hasil). */
  policy: DedEstimationPolicy;
  projectName: string;
  fileName?: string;
  pageCount: number;
  items: DedAiItem[];
  grandTotal: number;
  /**
   * Total usulan AI (mode FULL_AI saja): jumlah aiProposedSubtotal item;
   * null bila tidak satu pun item membawa usulan. Bukan total resmi.
   */
  aiProposedGrandTotal?: number | null;
  /**
   * Bila aiProposedGrandTotal ada dan berbeda dari grandTotal terverifikasi,
   * berisi penjelasan selisihnya. GrandTotal aplikasi yang dipakai.
   */
  totalDiscrepancyNote?: string;
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
  /** Kebijakan harga (default 'FULL_AI' bila tidak diisi — perilaku lama). */
  policy?: DedEstimationPolicy;
  projectName?: string;
  onProgress?: (event: DedAiProgressEvent) => void;
}
