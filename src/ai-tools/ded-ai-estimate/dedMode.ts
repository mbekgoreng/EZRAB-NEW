/**
 * dedMode.ts — TIPE MODE KANONIS DED-RAB AI DUAL MODE
 * (Program EZRAB DED-RAB AI DUAL MODE, directive owner 2026-11-13 23:04;
 *  keputusan koordinator C1/C2; menutup G-ST-3 + G-KN-1.)
 *
 * SATU-SATUNYA sumber kebenaran tipe mode DED-RAB AI. Modul ini TANPA
 * IMPOR dari `src` (murni tipe + fungsi deterministik) agar dapat
 * diimpor siapa pun — DED standar, mesin Full AI, Chat AI
 * (canonicalContext/dedUnderstanding/dedQtoIntegration), prompt —
 * tanpa risiko impor siklik.
 *
 * DUA mode user-facing (C1):
 * - 'EZRAB_AI' → policy DATABASE + mesin standar (STANDARD).
 *   Mode referensi = default sesi baru (C2). Terintegrasi katalog
 *   AHSP kanonis EZRAB lewat adapter ded-canonical.
 * - 'FULL_AI'  → policy FULL_AI + mesin Full AI (FULL_AI).
 *   Opt-in eksplisit. Analisis mandiri; terisolasi dari katalog
 *   AHSP + harga internal EZRAB (batas isolasi C3).
 *
 * Kedalaman FAST/DETAIL (DedAiMode) adalah SUB-PILIHAN di kedua mode,
 * bukan mode (C1) — modul ini tidak mendefinisikan ulang DedAiMode.
 *
 * NILAI STRING TIDAK BERUBAH (backward compat): policy tetap
 * 'FULL_AI' | 'DATABASE', engine tetap 'STANDARD' | 'FULL_AI'.
 * `DedEstimationPolicy` yang dulu didefinisikan 3× (types.ts
 * ded-ai-estimate + types.ts ded-full-ai + DedPromptPricingPolicy di
 * prompts/policy.ts) kini hidup DI SINI; ketiga tempat itu hanya
 * re-export/alias. `DedAiMode` v3 ('quick'|'advanced'|'vision'|
 * 'internal', ded-rab-v3) adalah tipe BERBEDA di luar cakupan —
 * sengaja tidak disentuh (C7).
 *
 * MIGRASI LEGASI (modeFromLegacy): data lama hanya membawa
 * {policy, fullAi} — dua sumbu ortogonal, bukan satu mode. Aturan
 * migrasi: MESIN menentukan mode (fullAi=true → FULL_AI; selebihnya
 * → EZRAB_AI). Alasannya: mesin menentukan bentuk hasil
 * (FullAiOutput vs DedAiOutput) sehingga mode adalah identitas
 * struktural hasil itu. Kombinasi hibrida lama (mesin standar +
 * policy FULL_AI — default lama) bermigrasi ke EZRAB_AI sebagai
 * LABEL, tetapi policy tersimpannya TIDAK ditulis ulang (C2:
 * "jangan tulis ulang riwayat") — policy tetap dibawa sebagai
 * field tersendiri di lampiran/draft/seksi konteks, sehingga tidak
 * ada informasi yang hilang. Kombinasi hibrida lain (mesin Full AI
 * + policy DATABASE) bermigrasi ke FULL_AI dengan alasan yang sama.
 *
 * ATURAN KANONIK §4 A–D (directive): teks directive tidak tersedia
 * sebagai berkas di folder program (caveat discovery §10 Q1);
 * rumusan di bawah mengikuti ringkasan koordinator + perilaku kode
 * yang sudah terbukti (discovery §9). Dinyatakan sebagai DATA
 * (DED_KNOWLEDGE_RULES) + GUARD deterministik di modul ini:
 * - A mode awareness — setiap permukaan pengetahuan menyatakan
 *   mode asalnya (describeModeForContext; dipakai canonicalContext
 *   + dedUnderstanding).
 * - B isolasi — FULL_AI tidak membaca katalog AHSP kanonis /
 *   harga internal (canUseCanonicalCatalog / canUseInternalPriceData
 *   = guard yang dipakai W5 di titik panggil adapter).
 * - C kontrak output — total dihitung aplikasi, usulan AI hanya
 *   perbandingan, unresolved = null, estimasi berlabel
 *   (outputContractForMode).
 * - D engine finansial kanonis — kedua mode memakai engine yang
 *   sama, recalculateCostSummary (financialEngineForMode).
 */

export type DedRabAiMode = 'EZRAB_AI' | 'FULL_AI';

/** Kebijakan harga DED-to-RAB — SATU definisi kanonis (G-ST-3). */
export type DedEstimationPolicy = 'FULL_AI' | 'DATABASE';

/** Mesin estimasi — nilai sama dengan DedWorkflowUsage['pipeline']. */
export type DedEngineKind = 'STANDARD' | 'FULL_AI';

export const DED_RAB_AI_MODES: readonly DedRabAiMode[] = ['EZRAB_AI', 'FULL_AI'];

/** Default sesi DED baru (C2): EZRAB AI MODE — default yang aman. */
export const DEFAULT_DED_RAB_AI_MODE: DedRabAiMode = 'EZRAB_AI';

export function isDedRabAiMode(value: unknown): value is DedRabAiMode {
  return value === 'EZRAB_AI' || value === 'FULL_AI';
}

export function isDedEstimationPolicy(value: unknown): value is DedEstimationPolicy {
  return value === 'FULL_AI' || value === 'DATABASE';
}

/**
 * Normalisasi policy dari data tak tepercaya (lampiran/draft lama,
 * output tanpa policy): hanya 'DATABASE' yang dipertahankan; yang
 * lain → 'FULL_AI' (default lama; sama dengan normalizePromptPolicy).
 */
export function normalizePolicy(policy: unknown): DedEstimationPolicy {
  return policy === 'DATABASE' ? 'DATABASE' : 'FULL_AI';
}

/** Normalisasi mode: hanya 'FULL_AI' yang dipertahankan; lain → default C2. */
export function normalizeMode(mode: unknown): DedRabAiMode {
  return mode === 'FULL_AI' ? 'FULL_AI' : 'EZRAB_AI';
}

/** C1: EZRAB_AI → DATABASE, FULL_AI → FULL_AI. */
export function policyForMode(mode: DedRabAiMode): DedEstimationPolicy {
  return mode === 'EZRAB_AI' ? 'DATABASE' : 'FULL_AI';
}

/** C1: EZRAB_AI → STANDARD, FULL_AI → FULL_AI. */
export function engineForMode(mode: DedRabAiMode): DedEngineKind {
  return mode === 'EZRAB_AI' ? 'STANDARD' : 'FULL_AI';
}

/** Kebalikan engineForMode: mesin menentukan mode (dipakai migrasi). */
export function modeForEngine(engine: DedEngineKind): DedRabAiMode {
  return engine === 'FULL_AI' ? 'FULL_AI' : 'EZRAB_AI';
}

/** Label user-facing mode (tanpa kata "Estimasi" — lihat G-UI-2). */
export function modeLabel(mode: DedRabAiMode): string {
  return mode === 'EZRAB_AI' ? 'EZRAB AI' : 'Full AI';
}

/** Label kebijakan harga → nama tampilan mode kanonis (G-UI-2: label lama
 *  "Estimasi Full AI"/"Estimasi Database EZRAB" dipensiunkan 2026-11-13). */
export function policyLabel(policy: DedEstimationPolicy): string {
  return policy === 'DATABASE' ? 'EZRAB AI MODE' : 'FULL AI MODE';
}

/**
 * Migrasi sesi/draft/lampiran lama {policy, fullAi} → satu mode
 * kanonis. Mesin menang (lihat header: hibrida lama). Tanpa sinyal
 * apa pun → default C2 (EZRAB_AI).
 */
export function modeFromLegacy(input: {
  policy?: DedEstimationPolicy | null;
  fullAi?: boolean | null;
}): DedRabAiMode {
  if (input.fullAi === true) return 'FULL_AI';
  return 'EZRAB_AI';
}

/** True bila kombinasi lama bukan pasangan kanonis C1 (hibrida lama). */
export function isLegacyHybrid(input: {
  policy?: DedEstimationPolicy | null;
  fullAi?: boolean | null;
}): boolean {
  const policy = normalizePolicy(input.policy);
  const fullAi = input.fullAi === true;
  // Pasangan kanonis: (DATABASE, standar) dan (FULL_AI, Full AI).
  return (policy === 'FULL_AI' && !fullAi) || (policy === 'DATABASE' && fullAi);
}

/* ------------------------------------------------------------------ */
/* Aturan kanonik §4 A–D — sebagai data                               */
/* ------------------------------------------------------------------ */

export type DedKnowledgeRuleId = 'A' | 'B' | 'C' | 'D';

export interface DedKnowledgeRule {
  id: DedKnowledgeRuleId;
  title: string;
  statement: string;
}

export const DED_KNOWLEDGE_RULES: readonly DedKnowledgeRule[] = [
  {
    id: 'A',
    title: 'Mode awareness',
    statement:
      'Setiap permukaan pengetahuan DED (prompt, seksi konteks Chat AI, lampiran, draft, memori) menyatakan mode asalnya; tidak ada pengetahuan DED tanpa mode.',
  },
  {
    id: 'B',
    title: 'Isolasi FULL AI MODE',
    statement:
      'FULL AI MODE tidak membaca katalog AHSP kanonis, harga internal EZRAB, atau referensi harga internal; EZRAB AI MODE membaca katalog kanonis lewat adapter ded-canonical (batas isolasi C3).',
  },
  {
    id: 'C',
    title: 'Kontrak output',
    statement:
      'Subtotal/total selalu dihitung aplikasi dari kuantitas × harga satuan yang keduanya ada; total usulan AI hanya perbandingan dan tidak pernah dipakai sebagai total resmi; unresolved = null, bukan Rp0; estimasi selalu berlabel.',
  },
  {
    id: 'D',
    title: 'Engine finansial kanonis',
    statement:
      'Kedua mode memakai engine finansial kanonis yang sama (recalculateCostSummary); tidak ada engine total kedua per mode.',
  },
];

export function knowledgeRule(id: DedKnowledgeRuleId): DedKnowledgeRule {
  const found = DED_KNOWLEDGE_RULES.find((r) => r.id === id);
  if (!found) throw new Error(`Aturan knowledge DED tak dikenal: ${String(id)}`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Guard §4 B — isolasi (dipakai W5 di titik panggil adapter)         */
/* ------------------------------------------------------------------ */

/** B: hanya EZRAB_AI yang boleh memanggil adapter kanonis AHSP. */
export function canUseCanonicalCatalog(mode: DedRabAiMode): boolean {
  return mode === 'EZRAB_AI';
}

/** B: hanya EZRAB_AI yang boleh memakai data harga internal EZRAB. */
export function canUseInternalPriceData(mode: DedRabAiMode): boolean {
  return mode === 'EZRAB_AI';
}

/* ------------------------------------------------------------------ */
/* Guard §4 C — kontrak output                                        */
/* ------------------------------------------------------------------ */

export interface DedOutputContract {
  /** Siapa yang menghitung subtotal/total resmi. */
  totalsComputedBy: 'canonical-engine';
  /** Peran total usulan AI. */
  aiTotalsRole: 'comparison-only';
  /** Nilai kuantitas/harga yang belum ter-resolver. */
  unresolvedValue: null;
  /** Estimasi harga AI selalu berlabel (tidak pernah menyamar resmi). */
  estimatesLabelled: true;
  /** Apakah harga kanonis AHSP boleh muncul di hasil mode ini. */
  allowsCanonicalPrices: boolean;
}

/** C: kontrak output — sama di kedua mode kecuali harga kanonis (B). */
export function outputContractForMode(mode: DedRabAiMode): DedOutputContract {
  return {
    totalsComputedBy: 'canonical-engine',
    aiTotalsRole: 'comparison-only',
    unresolvedValue: null,
    estimatesLabelled: true,
    allowsCanonicalPrices: mode === 'EZRAB_AI',
  };
}

/* ------------------------------------------------------------------ */
/* Guard §4 D — engine finansial kanonis                              */
/* ------------------------------------------------------------------ */

/** D: satu-satunya engine finansial — kedua mode memakai yang sama. */
export const CANONICAL_FINANCIAL_ENGINE = 'canonical' as const;

export function financialEngineForMode(_mode: DedRabAiMode): typeof CANONICAL_FINANCIAL_ENGINE {
  return CANONICAL_FINANCIAL_ENGINE;
}

export function isCanonicalFinancialEngine(engine: unknown): boolean {
  return engine === CANONICAL_FINANCIAL_ENGINE;
}

/* ------------------------------------------------------------------ */
/* §4 A — mode awareness: baris mode untuk seksi konteks              */
/* ------------------------------------------------------------------ */

/**
 * Satu baris mode untuk seksi konteks (canonicalContext +
 * dedUnderstanding). Selalu menyebut ketiganya — mode, policy, mesin
 * — agar hibrida lama tetap jujur (mode EZRAB_AI + policy FULL_AI
 * ditulis apa adanya, bukan disamarkan menjadi pasangan kanonis).
 * Policy yang tidak diisi diambil dari mode (C1).
 */
export function describeModeForContext(
  mode: DedRabAiMode,
  policy?: DedEstimationPolicy | null,
): string {
  const effectivePolicy = policy == null ? policyForMode(mode) : normalizePolicy(policy);
  const engine = engineForMode(mode);
  const policyNote =
    effectivePolicy === 'DATABASE'
      ? 'harga AHSP kanonis EZRAB'
      : 'estimasi AI (bukan harga resmi AHSP)';
  const engineNote = engine === 'STANDARD' ? 'mesin standar' : 'mesin Full AI';
  return `Mode DED: ${modeLabel(mode)} • Kebijakan harga: ${effectivePolicy} (${policyNote}) • ${engineNote}.`;
}

/* ------------------------------------------------------------------ */
/* Draft/sesi — resolusi mode tersimpan (G-ST-2)                      */
/* ------------------------------------------------------------------ */

/**
 * Resolusi SATU-SATUNYA untuk memulihkan mode dari draft/lampiran
 * tersimpan (dipakai handleLoadDraft — jangan duplikasi logikanya):
 * mode tersimpan menang bila valid; bila tidak ada (draft lama),
 * diturunkan dari {policy, fullAi} via modeFromLegacy; policy
 * dinormalisasi (default FULL_AI = perilaku lama); fullAi default
 * false (mesin standar).
 */
export function resolveDraftMode(record: {
  policy?: DedEstimationPolicy | null;
  fullAi?: boolean | null;
  dedMode?: DedRabAiMode | null;
}): { mode: DedRabAiMode; policy: DedEstimationPolicy; fullAi: boolean } {
  const fullAi = record.fullAi === true;
  const policy = normalizePolicy(record.policy);
  const mode = isDedRabAiMode(record.dedMode)
    ? record.dedMode
    : modeFromLegacy({ policy, fullAi });
  return { mode, policy, fullAi };
}

/**
 * Kedalaman hasil Full AI ('FAST' | 'ADVANCED') → kedalaman sesi
 * ('FAST' | 'DETAIL'). Dipakai saat menyimpan draft Full AI agar
 * field `mode` DraftRecord tetap dalam kosakata DedAiMode.
 */
export function depthModeFromFullAi(fullAiMode: 'FAST' | 'ADVANCED'): 'FAST' | 'DETAIL' {
  return fullAiMode === 'ADVANCED' ? 'DETAIL' : 'FAST';
}
