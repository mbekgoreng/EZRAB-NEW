/**
 * api/_lib/featureBillingMatrix.js — Matriks penagihan fitur (Unified Credits §7)
 * ============================================================================
 * DORMANT: file ini TIDAK diimpor oleh handler/UI mana pun. Ia mencatat
 * klasifikasi penagihan SETIAP fitur secara eksplisit agar tidak ada fitur
 * AI yang diam-diam gratis (bypass) dan tidak ada operasi deterministik
 * yang diam-diam ditagih:
 *
 * - AI_METERED: fitur AI yang SEHARUSNYA ditagih kredit (metering TOKEN
 *   atau tarif FLAT_DRAFT selama metering token belum tersambung untuk
 *   fitur itu).
 * - DETERMINISTIC_FREE: operasi deterministik/lokal — selalu gratis
 *   (credits 0), selamanya bukan kandidat metering.
 *
 * integrationStatus JUJUR terhadap keadaan kode saat matriks ini ditulis:
 * - WIRED_SIMULATION: jalur kredit simulasi tersambung untuk fitur ini.
 * - WIRED_SIMULATION_PARTIAL: tersambung SEBAGIAN (mis. hasil consume
 *   diabaikan pemanggil) — belum penegakan penuh.
 * - NOT_WIRED: BELUM tersambung sama sekali → fitur berjalan sebagai
 *   bypass penuh (listBypassedAiFeatures). Ini utang integrasi yang
 *   tercatat, bukan keadaan yang boleh diklaim sebagai "sudah ditagih".
 * - NOT_APPLICABLE: hanya untuk DETERMINISTIC_FREE.
 *
 * Kunci fitur mengikuti kunci tarif yang sudah ada (creditPricing.js:
 * 'chat-ai/fast', 'ded-ai/simple', ...) ditambah kunci fitur AI lain yang
 * dikenal master prompt §7.
 */

function aiMetered(metering, integrationStatus, note) {
  return Object.freeze({ billingClass: 'AI_METERED', metering, integrationStatus, note });
}

function deterministicFree(note) {
  return Object.freeze({
    billingClass: 'DETERMINISTIC_FREE',
    metering: 'NONE',
    integrationStatus: 'NOT_APPLICABLE',
    note,
  });
}

export const FEATURE_BILLING_MATRIX = Object.freeze({
  // --- Chat AI -------------------------------------------------------------
  'chat-ai/fast': aiMetered('TOKEN', 'WIRED_SIMULATION', 'Chat AI jalur cepat; metering token v1.1 tersambung pada simulasi.'),
  'chat-ai/advanced': aiMetered('TOKEN', 'WIRED_SIMULATION', 'Chat AI jalur lanjutan; metering token v1.1 tersambung pada simulasi.'),

  // --- Magic AI -------------------------------------------------------------
  'magic-ai/co-assistant': aiMetered('TOKEN', 'NOT_WIRED', 'Bypass penuh: co-assistant belum melewati gerbang kredit apa pun.'),
  'magic-ai-rab': aiMetered('TOKEN', 'NOT_WIRED', 'Bypass penuh: Magic AI RAB belum melewati gerbang kredit apa pun.'),

  // --- DED AI ---------------------------------------------------------------
  'ded-ai/simple': aiMetered('FLAT_DRAFT', 'WIRED_SIMULATION_PARTIAL', 'Tarif flat draft; hasil consume diabaikan pemanggil — penegakan belum penuh.'),
  'ded-ai/medium': aiMetered('FLAT_DRAFT', 'WIRED_SIMULATION_PARTIAL', 'Tarif flat draft; hasil consume diabaikan pemanggil — penegakan belum penuh.'),
  'ded-ai/complex': aiMetered('FLAT_DRAFT', 'WIRED_SIMULATION_PARTIAL', 'Tarif flat draft; hasil consume diabaikan pemanggil — penegakan belum penuh.'),
  'ded-ai/full-ai': aiMetered('TOKEN', 'NOT_WIRED', 'DED Full AI belum tersambung ke metering token.'),
  'ded-ai/revision': aiMetered('TOKEN', 'NOT_WIRED', 'Tarif yatim: ada di draft tarif tetapi tidak ada jalur penagihan yang memakainya.'),

  // --- AI Document ----------------------------------------------------------
  'ai-document/analysis': aiMetered('FLAT_DRAFT', 'WIRED_SIMULATION_PARTIAL', 'Tarif flat draft; hasil consume diabaikan pemanggil — penegakan belum penuh.'),
  'ai-document/qa': aiMetered('TOKEN', 'NOT_WIRED', 'Tanya-jawab dokumen belum tersambung ke metering.'),
  'ai-document/create': aiMetered('TOKEN', 'NOT_WIRED', 'Pembuatan dokumen AI belum tersambung ke metering.'),
  'ai-document/revision': aiMetered('TOKEN', 'NOT_WIRED', 'Revisi dokumen AI belum tersambung ke metering.'),
  'ai-document/enhance': aiMetered('TOKEN', 'NOT_WIRED', 'Enhance dokumen AI belum tersambung ke metering.'),
  'ai-document/translate': aiMetered('TOKEN', 'NOT_WIRED', 'Terjemahan dokumen AI belum tersambung ke metering.'),

  // --- Fitur AI lain ----------------------------------------------------------
  'ai-receipt/scan': aiMetered('TOKEN', 'NOT_WIRED', 'Scan kuitansi AI belum tersambung ke metering.'),
  'ai-price-search': aiMetered('TOKEN', 'NOT_WIRED', 'Pencarian harga AI belum tersambung ke metering.'),
  'ai-rab-review': aiMetered('TOKEN', 'NOT_WIRED', 'Review RAB AI belum tersambung ke metering.'),
  'ai-drawing-reader': aiMetered('TOKEN', 'NOT_WIRED', 'Pembaca gambar kerja AI belum tersambung ke metering.'),

  // --- Deterministik: selalu gratis -----------------------------------------
  'volume-calculation': deterministicFree('Kalkulator volume deterministik lokal.'),
  'rab-arithmetic': deterministicFree('Aritmetika RAB deterministik lokal.'),
  'ahsp-lookup': deterministicFree('Lookup AHSP dari data resmi lokal.'),
  'ahsp-candidate-search': deterministicFree('Pencarian kandidat AHSP deterministik lokal.'),
  'price-resolution': deterministicFree('Resolusi harga deterministik dari sumber tercatat.'),
  'recalculation': deterministicFree('Hitung ulang deterministik lokal.'),
  'export-pdf': deterministicFree('Ekspor PDF lokal.'),
  'export-excel': deterministicFree('Ekspor Excel lokal.'),
  'project-open': deterministicFree('Membuka proyek — operasi data lokal/workspace.'),
  'project-edit': deterministicFree('Mengedit proyek — operasi data lokal/workspace.'),
  'document-review-local': deterministicFree('Review dokumen lokal tanpa pemanggilan AI.'),
});

/**
 * Klasifikasi satu fitur → entri matriks + key, atau null bila kunci tidak
 * dikenal (tidak pernah menebak kelas fitur asing).
 */
export function classifyFeature(key) {
  if (typeof key !== 'string') return null;
  const entry = FEATURE_BILLING_MATRIX[key];
  if (!entry) return null;
  return { key, ...entry };
}

/**
 * Keputusan penagihan untuk satu fitur:
 * - tak dikenal → { chargeable:false, error:'UNKNOWN_FEATURE' }
 *   (pola {ok/error} yang sama dengan creditPricing.js: fitur asing tidak
 *   ditagih dan tidak pula dianggap gratis secara diam-diam — ia error).
 * - DETERMINISTIC_FREE → { chargeable:false, credits:0, billingClass }.
 * - AI_METERED → { chargeable:true, metering, integrationStatus,
 *   billingClass } — chargeable berarti SEHARUSNYA ditagih menurut
 *   kebijakan; integrationStatus mencatat apakah penagihan itu sudah
 *   benar-benar tersambung hari ini.
 */
export function chargeDecision(key) {
  const entry = classifyFeature(key);
  if (!entry) return { chargeable: false, error: 'UNKNOWN_FEATURE' };
  if (entry.billingClass === 'DETERMINISTIC_FREE') {
    return { chargeable: false, credits: 0, billingClass: entry.billingClass, key: entry.key };
  }
  return {
    chargeable: true,
    metering: entry.metering,
    integrationStatus: entry.integrationStatus,
    billingClass: entry.billingClass,
    key: entry.key,
  };
}

/** Daftar kunci fitur untuk satu kelas penagihan ('AI_METERED' | 'DETERMINISTIC_FREE'); kelas asing → []. */
export function listFeaturesByClass(billingClass) {
  return Object.keys(FEATURE_BILLING_MATRIX).filter(
    (key) => FEATURE_BILLING_MATRIX[key].billingClass === billingClass,
  );
}

/**
 * Fitur AI yang SEHARUSNYA ditagih tetapi hari ini bypass penuh
 * (AI_METERED berstatus NOT_WIRED) — daftar utang integrasi §7.
 */
export function listBypassedAiFeatures() {
  return Object.keys(FEATURE_BILLING_MATRIX).filter((key) => {
    const entry = FEATURE_BILLING_MATRIX[key];
    return entry.billingClass === 'AI_METERED' && entry.integrationStatus === 'NOT_WIRED';
  });
}
