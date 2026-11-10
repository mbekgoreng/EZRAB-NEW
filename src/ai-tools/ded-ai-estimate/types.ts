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
  | 'BENDUNGAN'
  | 'IRIGASI'
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
import type { AiToolsUsage } from '../providerClient';

export type DedAiPriceSource =
  | 'AI_ESTIMATE'  // Estimasi dari model AI — perlu verifikasi, bukan harga resmi
  | 'AHSP_2026'    // Harga kanonis EZRAB (SE DJBK 47/2026, biaya langsung) — AKTIF sejak adapter ded-canonical; hanya diproduksi lewat resolveDedPriceWithCanonical
  | 'USER_INPUT'   // Dimasukkan/diubah oleh pengguna
  | 'UNRESOLVED';  // Harga belum tersedia — bukan Rp0

/**
 * Klasifikasi provenans harga untuk lapisan penyelesaian (owner
 * 2026-11-10, master prompt "AI Auto Price Completion"). Memperluas —
 * bukan menggantikan — `priceSource`: harga isian tetap disimpan sebagai
 * AI_ESTIMATE pada `priceSource` (kosakata lama), sedangkan blok
 * `priceCompletion` membawa klasifikasi rinci + bukti sumbernya.
 */
export type DedPriceClassification =
  | 'OFFICIAL_AHSP_VERIFIED'
  | 'OFFICIAL_REGIONAL_REFERENCE'
  | 'MARKET_REFERENCE'
  | 'AI_ESTIMATE'
  | 'MANUAL_PRICE'
  | 'PRICE_UNRESOLVED';

/**
 * Jenis sumber harga dalam kosakata master prompt Unified Credits
 * (2026-11-10) — padanan `DedPriceClassification` yang ada:
 * OFFICIAL_AHSP_VERIFIED→OFFICIAL_AHSP, OFFICIAL_REGIONAL_REFERENCE→
 * OFFICIAL_SSH_HSPK, MARKET_REFERENCE→VERIFIED_SUPPLIER (tier
 * SUPPLIER_MANUFACTURER: daftar harga supplier/manufaktur yang benar-
 * benar diambil & dicatat) atau MARKET_REFERENCE (tier kontraktor),
 * AI_ESTIMATE→AI_ESTIMATE, MANUAL_PRICE→USER_MANUAL,
 * PRICE_UNRESOLVED→UNRESOLVED. Dipetakan oleh
 * `priceSourceKindFor` di priceCompletion.ts — klasifikasi lama tetap
 * sumber kebenaran; field ini turunan, bukan saingan.
 */
export type DedPriceSourceKind =
  | 'OFFICIAL_AHSP'
  | 'OFFICIAL_SSH_HSPK'
  | 'VERIFIED_SUPPLIER'
  | 'MARKET_REFERENCE'
  | 'AI_ESTIMATE'
  | 'USER_MANUAL'
  | 'UNRESOLVED';

export interface DedPriceHistoryEntry {
  unitPrice: number | null;
  classification: DedPriceClassification;
  at: string; // ISO date
  note: string;
}

/**
 * Blok penyelesaian harga terstruktur (per item). Diisi lapisan
 * penyelesaian (priceCompletion.ts) di mode FULL_AI, atau dicatat sebagai
 * penanda klasifikasi untuk harga yang sudah ada. Tidak pernah menimpa
 * harga kanonis AHSP / harga manual terverifikasi.
 */
export interface DedPriceCompletion {
  classification: DedPriceClassification;
  /** Turunan klasifikasi dalam kosakata Unified Credits (lihat DedPriceSourceKind). */
  sourceKind?: DedPriceSourceKind;
  /**
   * Status verifikasi harga: VERIFIED hanya untuk harga kanonis AHSP
   * terverifikasi; NEEDS_VERIFICATION bila ada konflik spesifikasi/
   * cakupan yang harus dilihat manusia; selain itu UNVERIFIED.
   */
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'NEEDS_VERIFICATION';
  /** Status persetujuan user atas isian penyelesaian (default PENDING untuk isian AI). */
  userApprovalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';
  /** Harga rekomendasi yang diterapkan (Rp per satuan item). */
  recommendedPrice: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  unit: string;
  /** Cakupan harga: terpasang penuh atau material saja. */
  scope: 'TERPASANG_PENUH' | 'MATERIAL_SAJA' | 'TIDAK_DINYATAKAN';
  sourceName?: string;
  sourceUrl?: string;
  /** Tanggal publikasi/data sumber (bila dinyatakan sumbernya). */
  sourceDate?: string;
  /** Tanggal referensi diambil/diteliti. */
  accessedAt: string;
  region?: string;
  specAssumption?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  method: string;
  /** true bila item punya kaitan AHSP (kode/match) — isian tetap non-AHSP. */
  ahspRelated: boolean;
  /** Id referensi eksternal yang dipakai (untuk idempotensi). */
  referenceId?: string;
  /** true bila referensi sudah melewati masa segarnya saat diterapkan. */
  sourceStale?: boolean;
  /** Dasar pengisian kuantitas (bila kuantitas juga dilengkapi jalur DED). */
  quantityBasis?: string;
  /** Nilai sebelum penyelesaian — agar penolakan pengguna bisa memulihkan. */
  originalUnitPrice?: number | null;
  originalQuantity?: number | null;
  /** Riwayat penggantian harga (kebijakan penggantian transparan). */
  history: DedPriceHistoryEntry[];
}

/** Laporan satu putaran penyelesaian batch (untuk panel ringkasan UI). */
export interface DedCompletionReport {
  scanned: number;
  filledMarketReference: number;
  filledAiEstimate: number;
  quantityFilled: number;
  officialPreserved: number;
  existingKept: number;
  needsQuantity: number;
  needsClarification: number;
  unresolved: number;
  failures: number;
  generatedAt: string;
}

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
  /**
   * Sprint 3.1: hasil evaluator kewajaran kuantitas deterministik
   * (reasonableness.ts). ANOTASI MURNI — tidak pernah mengubah quantity,
   * subtotal, harga, status, atau provenance. Diisi service untuk item
   * berkuantitas; undefined bila kuantitas null (tidak ada yang dinilai).
   */
  quantityReview?: DedQuantityReview;
  unitPrice: number | null;
  priceSource: DedAiPriceSource;
  /**
   * Blok penyelesaian harga terstruktur (lapisan penyelesaian Full AI,
   * priceCompletion.ts) — klasifikasi provenans rinci + bukti sumber.
   * Opsional: item lama/hasil mode DATABASE tidak membawanya.
   */
  priceCompletion?: DedPriceCompletion;
  /**
   * HARDENING 2026-11-10 (Tahap 1): blok audit kuantitas — klasifikasi
   * eksplisit + jejak estimasi (nilai asli/usulan, metode, dasar,
   * persetujuan). Opsional: hanya item yang melewati lapisan
   * penyelesaian atau dibangun eksplisit yang membawanya.
   */
  quantityAudit?: DedQuantityAudit;
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

/**
 * Sprint 3.1 — Hasil evaluator kewajaran kuantitas (reasonableness.ts).
 * Tiga sumbu yang SENGAJA dipisah (jangan dilebur):
 * - validitas bukti sumber (Sprint 3 B2, verifyItemQuantityEvidence),
 * - validitas derivasi matematis (quantity.ts / derivation.ts),
 * - kewajaran fisik/teknik (evaluator ini).
 * Outcome evaluator tidak pernah menimpa ketiga sumbu lain, harga, atau
 * identitas AHSP.
 */
export type DedQuantityReviewOutcome =
  | 'REASONABLE'          // skala & konteks konsisten; tidak ada pemicu review
  | 'NEEDS_REVIEW'        // ada ketidakkonsistenan skala yang harus dilihat manusia
  | 'INSUFFICIENT_CONTEXT'; // konteks tidak cukup untuk menilai — BUKAN "wajar"

export interface DedQuantityReview {
  outcome: DedQuantityReviewOutcome;
  /** Kode alasan deterministik (lihat reasonableness.ts untuk tabelnya). */
  reasonCode: string;
  /** Penjelasan bahasa Indonesia yang dapat dibaca estimator. */
  explanation: string;
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  /** Kuantitas item apa adanya (tidak pernah diubah evaluator). */
  originalQuantity: number;
  /**
   * Kuantitas hasil hitung-ulang deterministik dari dimensi item, bila
   * dapat dihitung (basis perbandingan mismatch/mikro/skala). null bila
   * dimensi tidak cukup / tidak terparse.
   */
  derivedQuantity?: number | null;
  /**
   * Sprint 3.2 — label kategori pekerjaan dari profil skala yang cocok
   * dengan item (mis. "Elemen beton struktural"), null bila tidak ada
   * profil skala yang berlaku untuk kategori/satuan item.
   */
  category?: string | null;
  /**
   * Sprint 3.2 — id profil skala total-item yang diterapkan (mis.
   * 'STRUCTURAL_CONCRETE_M3'), null bila kategori tidak terprofil.
   */
  scaleProfile?: string | null;
  /**
   * Sprint 3.2 — basis skala tekstual: amplop profil + posisi total
   * item terhadap amplop itu. Hanya ada bila profil diterapkan.
   */
  scaleBasis?: string;
  /**
   * Sprint 3.2 — konteks yang benar-benar dipakai evaluator (tipe
   * proyek bila diberikan pemanggil; ketiadaannya dicatat apa adanya
   * sebagai PROJECT_CONTEXT_MISSING, tidak pernah dikarang).
   */
  contextUsed?: string;
  /**
   * Sprint 3.2 — kode alasan sumbu DERIVASI, dicatat bila alasan utama
   * hasil berasal dari sumbu skala (kedua sumbu tidak saling menimpa).
   */
  derivationReasonCode?: string | null;
  /**
   * Sprint 3.2 — kode alasan sumbu SKALA, dicatat bila alasan utama
   * hasil berasal dari sumbu derivasi tetapi sumbu skala juga terpicu.
   */
  scaleReasonCode?: string | null;
}

/**
 * HARDENING 2026-11-10 (Tahap 1) — Klasifikasi kuantitas eksplisit
 * (kosakata master prompt DED Final Hardening). SATU kelas per item,
 * dengan urutan precedence yang didokumentasikan di
 * `classifyQuantityProvenance` (priceCompletion.ts):
 * keadaan (MISSING / EXPLICIT_ZERO / IMPLAUSIBLE_FRAGMENT) → penanda
 * kewajaran (NEEDS_REVIEW) → asal-usul (DRAWING_EXTRACTED /
 * USER_PROVIDED / CALCULATED_FROM_VERIFIED_INPUT /
 * ESTIMATED_FROM_CONTEXT). Kuantitas hasil AI TIDAK PERNAH naik kelas
 * menjadi DRAWING_EXTRACTED.
 */
export type DedQuantityClass =
  | 'DRAWING_EXTRACTED'
  | 'USER_PROVIDED'
  | 'CALCULATED_FROM_VERIFIED_INPUT'
  | 'ESTIMATED_FROM_CONTEXT'
  | 'MISSING'
  | 'IMPLAUSIBLE_FRAGMENT'
  | 'EXPLICIT_ZERO'
  | 'NEEDS_REVIEW';

/**
 * Blok audit kuantitas per item: nilai asli vs usulan, metode, variabel
 * input, rumus/dasar, asumsi, keyakinan, status verifikasi, status
 * persetujuan user. Diisi lapisan penyelesaian (priceCompletion.ts)
 * untuk item yang kuantitasnya dilengkapi/diklasifikasi di sana, dan
 * dapat dibangun untuk item mana pun lewat `buildQuantityAudit`.
 */
export interface DedQuantityAudit {
  classification: DedQuantityClass;
  /** Kuantitas sebelum penyelesaian (null = memang hilang). */
  originalQuantity: number | null;
  /** Kuantitas yang berlaku/usulan sesudah penyelesaian. */
  proposedQuantity: number | null;
  unit: string;
  /** Metode pengisian/penurunan (mis. 'plan-context-estimate', 'drawing-explicit'). */
  method: string;
  /** Variabel konteks yang dipakai metode (nama + nilai), bila ada. */
  inputs: Array<{ name: string; value: number | null }>;
  /** Rumus/dasar terbaca (sama dengan quantityFormula bila ada). */
  formula?: string;
  /** Asumsi yang dipakai (dasar estimasi), bila ada. */
  assumptions?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'NEEDS_VERIFICATION';
  /** Persetujuan user: wajib PENDING untuk estimasi konteks; NOT_REQUIRED untuk fakta gambar/user/hitungan terverifikasi. */
  userApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';
}

/**
 * HARDENING 2026-11-10 (Tahap 6) — Metadata usage satu workflow DED
 * (satu batch analisis = satu workflow terlacak), selaras kosakata
 * Unified Credits (api/_lib/featureBillingMatrix.js: fitur
 * 'ded-ai/simple|medium|complex' = AI_METERED FLAT_DRAFT;
 * 'ded-ai/full-ai' = AI_METERED TOKEN). Field yang tidak dilaporkan
 * sumbernya (mis. token dari gateway) bernilai null — tidak ditebak.
 * Operasi deterministik (hitung kuantitas, hitung ulang kanonis,
 * lookup AHSP, ambil referensi cache, tampil provenans, tinjau user)
 * TIDAK tercatat sebagai operasi berbayar di sini.
 */
/**
 * SPRINT 4 (Tugas E) — Alasan eksplisit bukti usage hilang. Dipakai
 * sebagai field, BUKAN tebakan: bila sebuah angka null, field ini
 * menyatakan MENGAPA ia null agar konsumen lifecycle (recordEvidence)
 * tidak perlu menebak apakah bukti memang tidak ada atau hilang di
 * tengah jalan.
 * - GATEWAY_DOES_NOT_REPORT_TOKENS: panggilan terkirim, tetapi respons
 *   yang sampai ke klien (AiToolsSuccess di providerClient) tidak
 *   membawa field usage/token apa pun — lihat audit observabilitas
 *   docs/audits/EZRAB_AI_PROVIDER_USAGE_OBSERVABILITY.md.
 * - PROVIDER_COST_NOT_REPORTED: tidak ada jalur biaya provider aktual
 *   ke klien; biaya TIDAK PERNAH diturunkan dari ID model.
 * - CALL_NOT_SENT: panggilan tidak pernah dikirim (dilewati anggaran /
 *   tidak didukung) — tidak ada usage yang mungkin ada.
 */
export type DedMissingEvidenceReason =
  | 'GATEWAY_DOES_NOT_REPORT_TOKENS'
  | 'PROVIDER_COST_NOT_REPORTED'
  | 'CALL_NOT_SENT';

/**
 * SPRINT 4 (Tugas E) — Catatan SATU panggilan model di dalam workflow,
 * berbentuk bukti (evidence) yang kelak dapat diserahkan ke langkah
 * recordEvidence pada lifecycle Unified Credits
 * (createOperation → reserve → execute → recordEvidence → settle |
 * release; kontrak Sprint 3 di api/_lib/aiMetering.js menerima bukti
 * per panggilan { provider, model, usage: { tokensIn, tokensOut,
 * tokensCached } }). Record ini TIDAK menagih apa pun hari ini.
 *
 * Kejujuran: token per panggilan null selama gateway tidak
 * melaporkannya ke klien; `attempts`/`retries` dihitung dari eksekusi
 * pipeline yang nyata (bukan dari riwayat failover gateway — riwayat
 * itu tidak diteruskan ke klien, lihat audit Tugas F).
 */
export interface DedUsageCallRecord {
  /** Identitas panggilan di dalam workflow: 'pass-<index>' | 'full-ai-main'. */
  callId: string;
  kind: 'PASS' | 'FULL_AI_MAIN';
  /** Label pass (clusterLabel) atau nama berkas (Full AI). */
  label: string;
  /** Nama berkas sumber bila diketahui; null = pipeline tidak mencatatnya per panggilan. */
  sourceFile: string | null;
  /** Halaman yang dicakup panggilan ini (pass); [] untuk Full AI (dokumen utuh per panggilan). */
  pages: number[];
  /** Produk gateway yang DIMINTA (DED_AI_FAST / DED_AI_DETAIL) — bukan identitas provider penagih. */
  productId: string | null;
  /** Provider yang DIMINTA menurut registri produk; pipeline DED tidak membacanya — null jujur. */
  requestedProvider: string | null;
  /** Model yang DIMINTA menurut registri produk; pipeline DED tidak membacanya — null jujur. */
  requestedModel: string | null;
  /** Provider AKTUAL dari respons gateway bila diteruskan klien; null = tidak diteruskan/tidak ada. */
  provider: string | null;
  /** Model AKTUAL dari respons gateway bila diteruskan klien; null = tidak diteruskan/tidak ada. */
  model: string | null;
  /**
   * SPRINT 5 (X3): requestId gateway untuk panggilan AKTUAL ini
   * (AiToolsSuccess.requestId percobaan final) — kunci korelasi persis
   * ke catatan meter/log gateway. Opsional & aditif: catatan lama
   * tanpa field ini tetap sah. null = gateway/klien tidak
   * menyediakannya (jalur Node adapter mengembalikan '' → dinormalkan
   * null); TIDAK PERNAH difabrikasi atau dibagi antar panggilan.
   */
  requestId?: string | null;
  /** Jumlah percobaan eksekusi panggilan ini di lapisan pipeline (1 + retries). */
  attempts: number;
  /** Retry yang dilakukan lapisan pipeline untuk panggilan ini (retry MALFORMED terbatas). */
  retries: number;
  /** Sukses/gagal per panggilan (kosakata status pass pipeline; Full AI: SUCCESS | ERROR). */
  status: string;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  /** Alasan token panggilan ini null; null hanya bila token benar-benar tercatat. */
  missingEvidenceReason: DedMissingEvidenceReason | null;
  /** Pipeline tidak menangkap waktu per panggilan hari ini — null jujur (waktu operasi ada di DedWorkflowUsage). */
  startedAt: string | null;
  finishedAt: string | null;
}

export interface DedWorkflowUsage {
  workflowId: string;
  featureKey: string;
  pipeline: 'STANDARD' | 'FULL_AI';
  policy: DedEstimationPolicy;
  projectId?: string;
  workspaceId?: string;
  actorUserId?: string;
  /** Identitas AKTUAL dari gateway; null = tidak dilaporkan. */
  provider: string | null;
  model: string | null;
  /** Panggilan model yang benar-benar dikirim (pass terkirim; bukan yang dilewati anggaran). */
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  /** Pengisian harga dari referensi eksternal terkurasi (deterministik lokal — bukan panggilan berbayar). */
  externalResearchApplications: number;
  /** Hit cache riset pada workflow ini; null = tidak terinstrumentasi. */
  cacheHits: number | null;
  /** Biaya provider aktual (Rp) bila dilaporkan; null = tidak tersedia. */
  providerCostIdr: number | null;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  retries: number;
  errors: string[];
  generatedAt: string;
  // --- SPRINT 4 (Tugas E): kelengkapan bukti untuk lifecycle masa depan.
  // Semua field ADITIF & opsional agar catatan lama tetap terbaca;
  // builder usageMetadata selalu mengisinya.
  /** Provider yang DIMINTA (registri produk); tidak dibaca pipeline — null jujur. */
  requestedProvider?: string | null;
  /** Model yang DIMINTA (registri produk); tidak dibaca pipeline — null jujur. */
  requestedModel?: string | null;
  /** Bukti per panggilan model dalam workflow ini (satu entri per pass / panggilan Full AI). */
  calls?: DedUsageCallRecord[];
  /** Alasan token workflow null; terisi PERSIS bila inputTokens/outputTokens/cachedTokens null. */
  missingEvidenceReason?: DedMissingEvidenceReason | null;
  /** Alasan biaya provider null; terisi PERSIS bila providerCostIdr null. */
  providerCostMissingReason?: DedMissingEvidenceReason | null;
  /**
   * Versi kebijakan tarif yang TERIKAT pada catatan ini. Hari ini null:
   * pricingPolicy v1.1 (api/_lib/pricingPolicy.js, LOCKED_OWNER) ada di
   * sisi server, tetapi tidak ada per-panggilan/per-workflow yang
   * mengikat versi itu ke metadata DED — mengklaimnya akan mengarang
   * ikatan yang tidak ada.
   */
  pricingPolicyVersion?: string | null;
  /** Waktu mulai operasi (ISO) bila service menangkapnya; null = tidak tersedia. */
  startedAt?: string | null;
  /** Waktu selesai operasi (ISO) bila service menangkapnya; null = tidak tersedia. */
  finishedAt?: string | null;
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
   * Laporan lapisan penyelesaian harga/kuantitas (mode FULL_AI; diisi
   * service sesudah konversi item, sebelum kalkulator). Opsional agar
   * konstruktor lama tidak berubah.
   */
  completionReport?: DedCompletionReport;
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
    /**
     * Sprint 3 (G2 Opsi A): jumlah item yang kuantitasnya berasal dari
     * ASSUMPTION dan terisi — asumsi tetap masuk Total Estimasi tunggal,
     * tetapi WAJIB teridentifikasi lewat penghitung ini. Opsional agar
     * konstruktor lama tidak berubah; buildOutput selalu mengisinya.
     */
    itemsWithAssumption?: number;
  };
  /**
   * Sprint 3 (B1): true bila satu atau lebih pass gagal/dilewati sehingga
   * hasil TIDAK lengkap — hasil parsial tidak boleh dibaca sebagai sukses
   * penuh. Opsional agar konstruktor lama tidak berubah; service selalu
   * mengisinya pada envelope hasil analisis.
   */
  partial?: boolean;
  /** Sprint 3 (B1): ringkasan status pass yang membentuk `partial`. */
  passSummary?: DedPassSummary;
  /**
   * FASE P0: cakupan 12 divisi rumah (diisi service untuk proyek
   * BANGUNAN/GEDUNG; opsional agar konsumen lama tidak berubah).
   */
  divisionCoverage?: DedDivisionCoverage[];
  /**
   * HARDENING 2026-11-10 (Tahap 6): metadata usage satu workflow DED
   * untuk kesiapan Unified Credits — dibangun usageMetadata.ts dari
   * jejak analisis + laporan penyelesaian. BUKAN tagihan: tidak ada
   * potongan kredit yang diaktifkan oleh field ini.
   */
  usage?: DedWorkflowUsage;
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

/**
 * Sprint 3 (B1) — status pass semantik di samping `status` teknis lama:
 * - SUCCESS: pass terkirim dan responsnya dapat dipakai (termasuk kosong).
 * - PARTIAL: pass terkirim tetapi responsnya tidak dapat dipakai
 *   (MALFORMED) — cakupan kelompok ini hilang sebagian.
 * - FAILED: panggilan provider/gateway gagal.
 * - SKIPPED_BUDGET: tidak dikirim karena anggaran request (halaman tunggal
 *   terlalu besar) — selalu dengan alasan eksplisit.
 * - SKIPPED_UNSUPPORTED: kelompok tidak didukung (dicadangkan; gerbang
 *   tipe proyek menolak lebih awal sehingga status ini jarang terpakai).
 */
export type DedPassStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED_BUDGET'
  | 'SKIPPED_UNSUPPORTED';

/** Sprint 3 (B1) — ringkasan pass pada envelope hasil. */
export interface DedPassSummary {
  totalPasses: number;
  succeededPasses: number;
  failedPasses: number;
  skippedPasses: number;
  partial: boolean;
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
  status: 'OK' | 'FAILED' | 'EMPTY_RESPONSE' | 'MALFORMED_RESPONSE' | 'SKIPPED_BUDGET' | 'SKIPPED_UNSUPPORTED';
  /** Sprint 3 (B1): status semantik (lihat DedPassStatus). */
  passStatus?: DedPassStatus;
  /** Sprint 3 (B1): ukuran request terukur (system + prompt, karakter). */
  requestChars?: number;
  /** Sprint 3 (B1): alasan eksplisit bila pass dilewati (SKIPPED_*). */
  reason?: string;
  /**
   * Sprint 3.1: jumlah percobaan ulang yang dilakukan untuk pass ini
   * (maksimum 1, hanya untuk outcome MALFORMED — lihat
   * executeDedPassAttempt di service.ts). 0/undefined = tanpa retry.
   */
  retryCount?: number;
  errorCode?: string;
  /**
   * SPRINT 4 (Tugas E/F): identitas AKTUAL provider/model dari respons
   * gateway (AiToolsSuccess.provider/model) untuk percobaan FINAL pass
   * ini, ditangkap aditif di executeDedPassAttempt. null = respons
   * tidak membawanya / pass gagal di lapisan provider. Sebelumnya
   * identitas ini dibuang — pass hanya menyimpan productId yang diminta.
   */
  provider?: string | null;
  model?: string | null;
  /**
   * SPRINT 5 (X3 + plumbing X1/X2): requestId gateway percobaan FINAL
   * pass ini (korelasi ke meter/log gateway) dan usage ternormalisasi
   * attempt final bila gateway melaporkannya lewat AiToolsSuccess.
   * Keduanya aditif; null = tidak dilaporkan — bukan nol, bukan tebakan.
   */
  requestId?: string | null;
  usage?: AiToolsUsage | null;
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
  /** HARDENING Tahap 6: konteks identitas untuk metadata usage (opsional; diteruskan apa adanya ke DedWorkflowUsage). */
  projectId?: string;
  workspaceId?: string;
  actorUserId?: string;
}
