/**
 * EZRAB AI — Skill Engine: router skill (BARU, Phase 2 Workstream 3).
 *
 * Wrapper tipis di atas interpreter yang SUDAH ADA — modul ini TIDAK
 * mengedit intentRouter.ts, coAssistantService.ts, atau actionRegistry.ts,
 * dan TIDAK mengimpornya. Fungsi deteksi intent DIINJEKSI pemanggil
 * (saat cutover: routeIntent kanonis); tipe DetectResult adalah subset
 * struktural IntentResult sehingga routeIntent dapat dipakai langsung.
 *
 * Peran wrapper ini:
 * 1. Memetakan intent yang dikenali -> skill terdaftar (atau null bila
 *    intent bukan milik skill — jalur lama tetap berjalan).
 * 2. Disambiguasi berbasis confidence (murni, dapat diuji): pemenang jelas
 *    -> route; dua kandidat berdekatan -> minta klarifikasi ("A atau B?");
 *    semua rendah -> unknown. CATATAN: routeIntent hari ini mengembalikan
 *    SATU intent (first-match), sehingga disambiguasi multi-kandidat baru
 *    aktif sesudah cutover Tahap 2.4 (router mengembalikan kandidat);
 *    sampai saat itu fungsi ini adalah desain yang teruji, bukan jalur live.
 * 3. Tabel kompatibilitas Copilot: taksonomi detectIntent (14 kode) dipetakan
 *    ke ChatIntent / skill — analisis cutover Tahap 2.1 dalam bentuk kode.
 *    Copilot adalah kanal jawab-saja: pemetaan ke skill mutasi ditandai
 *    channelBlocked (cermin allowlist kanal propose_* di toolRegistry).
 */
import type { SkillRegistry } from './skillRegistry';
import type { SkillDefinition } from './types';

/** Subset struktural IntentResult (intentRouter.ts) — cukup untuk routing. */
export interface DetectResult {
  intent: string;
  confidence: number;
  needsClarification: boolean;
  clarificationPrompt?: string;
  param?: string;
  localOnly: boolean;
}

export type DetectIntentFn = (rawInput: string) => DetectResult;

/**
 * ChatIntent -> skill. HANYA intent perintah deterministik (13 skill +
 * langkah konfirmasi DELETE_PROJECT_CONFIRM). Intent lain (navigasi, RAB
 * wizard, kueri proyek, ...) BUKAN milik skill dan sengaja tidak dipetakan —
 * mereka tetap ditangani jalur yang sudah ada.
 */
export const CHAT_INTENT_TO_SKILL_ID: Record<string, string> = {
  CREATE_PROJECT: 'create-project',
  DELETE_PROJECT: 'delete-project',
  DELETE_PROJECT_CONFIRM: 'delete-project',
  ARCHIVE_PROJECT: 'archive-project',
  DUPLICATE_PROJECT: 'duplicate-project',
  CREATE_QTO_ITEM: 'create-qto-item',
  SYNC_QTO: 'sync-qto',
  RUN_DED_ANALYSIS: 'run-ded-analysis',
  SUMMARIZE_DOCUMENT: 'summarize-document',
  EXPORT_PROJECT: 'export-project',
  CREATE_REVISION: 'create-revision',
  CREDIT_BALANCE: 'credit-balance',
  TOPUP_CREDIT: 'topup-credit',
  UPDATE_PROJECT_SETTINGS: 'update-project-settings',
};

/** Intent Quick Action (kontrak) -> skill. Jalur token Quick Action, bukan routeIntent. */
export const QUICK_ACTION_INTENT_TO_SKILL_ID: Record<string, string> = {
  RAB_ANALYSIS: 'audit-rab',
  VOLUME_CALCULATION: 'hitung-volume',
  AHSP_LOOKUP: 'cari-ahsp',
  PRICE_SEARCH: 'cari-harga',
  DED_ANALYSIS: 'analisis-ded',
  REPORT_GENERATION: 'buat-laporan',
  CURVE_S_GENERATION: 'periksa-kurva-s',
  EXPLAIN_CALCULATION: 'jelaskan-item',
  RECALCULATE_RAB: 'recalculate',
  BASIC_HELP: 'bantuan-fitur',
};

export interface CopilotIntentMapping {
  /** Padanan ChatIntent, atau null bila tidak ada padanan. */
  chatIntent: string | null;
  /** Skill yang memiliki intent ini, atau null. */
  skillId: string | null;
  /**
   * true = pemetaan ini MENULIS (mutasi) sehingga kanal Copilot TIDAK BOLEH
   * mengeksekusinya (Copilot jawab-saja; tanpa permukaan konfirmasi pratinjau).
   */
  channelBlocked: boolean;
  note: string;
}

/**
 * Taksonomi detectIntent Copilot (coAssistantService.ts, 14 kode) -> kanonis.
 * Analisis kompatibilitas cutover Tahap 2.1 — dibaca pemanggil cutover,
 * bukan dieksekusi di sini.
 */
export const COPILOT_INTENT_MAP: Record<string, CopilotIntentMapping> = {
  CONVERSATIONAL: {
    chatIntent: null,
    skillId: null,
    channelBlocked: false,
    note: 'Obrolan santai — bukan intent skill; dijawab model, bukan di-route.',
  },
  HELP: {
    chatIntent: 'HELP',
    skillId: 'bantuan-fitur',
    channelBlocked: false,
    note: 'HELP kanonis ada; skill bantuan-fitur dapat menjawab dari Copilot.',
  },
  CREATE_RAB: {
    chatIntent: 'CREATE_RAB_CLARIFY',
    skillId: null,
    channelBlocked: true,
    note: 'Pembuatan RAB adalah alur intake Chat AI, bukan skill; Copilot mengarahkan ke Chat AI.',
  },
  ADD_ITEM: {
    chatIntent: 'ADD_ITEM',
    skillId: null,
    channelBlocked: true,
    note: 'Mutasi item — DIBLOKIR dari kanal Copilot (jawab-saja); arahkan ke Chat AI.',
  },
  DELETE_ITEM: {
    chatIntent: 'DELETE_ITEM',
    skillId: null,
    channelBlocked: true,
    note: 'Mutasi item — DIBLOKIR dari kanal Copilot; arahkan ke Chat AI.',
  },
  UPDATE_ITEM: {
    chatIntent: null,
    skillId: null,
    channelBlocked: true,
    note: 'AMBIGU: satu kode Copilot untuk dua intent kanonis (UPDATE_ITEM_VOLUME / UPDATE_ITEM_PRICE) — cutover harus memeriksa parameter sebelum memetakan.',
  },
  TOTAL_QUERY: {
    chatIntent: 'QUERY_PROJECT_TOTAL',
    skillId: null,
    channelBlocked: false,
    note: 'Kueri total proyek — deterministik, dapat dijawab Copilot.',
  },
  SEARCH_QUERY: {
    chatIntent: null,
    skillId: null,
    channelBlocked: false,
    note: 'AMBIGU: bergantung kata kunci — SEARCH_AHSP (bila "ahsp"/"harga satuan") atau pencarian item; cutover memakai kata kunci sebagai penentu.',
  },
  AUDIT: {
    chatIntent: null,
    skillId: 'audit-rab',
    channelBlocked: false,
    note: 'Tidak ada ChatIntent audit; skill audit-rab adalah pemilik barunya (read-only, aman untuk Copilot).',
  },
  KURVA_S: {
    chatIntent: null,
    skillId: 'periksa-kurva-s',
    channelBlocked: false,
    note: 'Tidak ada ChatIntent kurva S; skill periksa-kurva-s adalah pemilik barunya.',
  },
  PROGRESS: {
    chatIntent: null,
    skillId: null,
    channelBlocked: false,
    note: 'KESENJANGAN: tidak ada ChatIntent maupun skill progres — butuh skill/fitur baru (di luar cakupan migrasi).',
  },
  DED_QUERY: {
    chatIntent: 'RUN_DED_ANALYSIS',
    skillId: 'run-ded-analysis',
    channelBlocked: true,
    note: 'Menjalankan analisis DED (POTENTIAL_MUTATION) — DIBLOKIR dari Copilot; pertanyaan TENTANG DED tetap dijawab sebagai kueri.',
  },
  DOCUMENT: {
    chatIntent: 'SUMMARIZE_DOCUMENT',
    skillId: 'summarize-document',
    channelBlocked: false,
    note: 'Padanan sebagian: ringkasan dokumen; operasi dokumen lain (tender/RKS) tetap jalur Document AI.',
  },
  RAB_QUERY: {
    chatIntent: null,
    skillId: null,
    channelBlocked: false,
    note: 'Kueri RAB umum (fallback) — bukan intent skill; dijawab model dari konteks kanonis.',
  },
};

export type IntentSource = 'chat' | 'quick-action' | 'copilot';

/** Petakan satu kode intent ke skillId, atau null bila bukan milik skill. */
export function mapIntentToSkillId(intent: string, source: IntentSource): string | null {
  if (source === 'chat') return CHAT_INTENT_TO_SKILL_ID[intent] ?? null;
  if (source === 'quick-action') return QUICK_ACTION_INTENT_TO_SKILL_ID[intent] ?? null;
  const mapping = COPILOT_INTENT_MAP[intent];
  if (!mapping || mapping.channelBlocked) return null;
  return mapping.skillId;
}

export interface DisambiguationCandidate {
  skillId: string;
  confidence: number;
}

export interface DisambiguationResult {
  decision: 'route' | 'clarify' | 'unknown';
  /** Skill pemenang bila decision 'route'. */
  skillId: string | null;
  /** Dua kandidat teratas untuk kartu klarifikasi. */
  options: DisambiguationCandidate[];
  /** Pertanyaan klarifikasi ("Maksud Anda A atau B?"), bila decision 'clarify'. */
  question: string | null;
}

export interface DisambiguationOptions {
  /** Confidence minimum untuk route langsung (default 0.85). */
  routeConfidence?: number;
  /** Selisih minimum juara 1 vs 2 untuk route langsung (default 0.15). */
  margin?: number;
  /** Di bawah ini = tidak dikenali (default 0.6). */
  minConfidence?: number;
}

/**
 * Disambiguasi berbasis confidence (murni, K-08).
 * - Pemenang >= routeConfidence DAN unggul >= margin -> route.
 * - Pemenang < minConfidence -> unknown (jangan menebak).
 * - Selain itu -> clarify dengan dua kandidat teratas.
 */
export function disambiguate(
  candidates: DisambiguationCandidate[],
  opts: DisambiguationOptions = {},
  displayName?: (skillId: string) => string,
): DisambiguationResult {
  const routeConfidence = opts.routeConfidence ?? 0.85;
  const margin = opts.margin ?? 0.15;
  const minConfidence = opts.minConfidence ?? 0.6;
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  const second = sorted[1];
  const options = sorted.slice(0, 2);
  if (!top || top.confidence < minConfidence) {
    return { decision: 'unknown', skillId: null, options, question: null };
  }
  if (top.confidence >= routeConfidence && (!second || top.confidence - second.confidence >= margin)) {
    return { decision: 'route', skillId: top.skillId, options, question: null };
  }
  const name = (id: string) => (displayName ? displayName(id) : id);
  const question =
    second != null
      ? `Maksud Anda "${name(top.skillId)}" atau "${name(second.skillId)}"?`
      : `Apakah maksud Anda "${name(top.skillId)}"?`;
  return { decision: 'clarify', skillId: null, options, question };
}

export interface SkillRouteResult {
  /** Skill yang memiliki intent ini, atau null (bukan milik skill). */
  skillId: string | null;
  skill: SkillDefinition | null;
  intent: string;
  confidence: number;
  needsClarification: boolean;
  clarificationPrompt: string | null;
  param: string | null;
}

export interface SkillRouter {
  /** Route satu pesan mentah lewat fungsi deteksi yang diinjeksikan. */
  route(rawInput: string, detect: DetectIntentFn): SkillRouteResult;
  /** Route satu Quick Action berdasarkan actionId kontrak. */
  routeQuickAction(actionId: string): SkillRouteResult | null;
  /** Disambiguasi multi-kandidat (lihat catatan di disambiguate). */
  disambiguate(
    candidates: DisambiguationCandidate[],
    opts?: DisambiguationOptions,
  ): DisambiguationResult;
}

export function createSkillRouter(registry: SkillRegistry): SkillRouter {
  const displayName = (skillId: string): string =>
    registry.get(skillId)?.displayName ?? skillId;

  return {
    route(rawInput: string, detect: DetectIntentFn): SkillRouteResult {
      const detected = detect(rawInput);
      const base = {
        intent: detected.intent,
        confidence: detected.confidence,
        needsClarification: detected.needsClarification,
        clarificationPrompt: detected.clarificationPrompt ?? null,
        param: detected.param ?? null,
      };
      // Router kanonis sendiri sudah meminta klarifikasi — teruskan apa adanya.
      if (detected.needsClarification || detected.intent === 'UNKNOWN') {
        return { ...base, skillId: null, skill: null };
      }
      const skillId = mapIntentToSkillId(detected.intent, 'chat');
      if (!skillId) return { ...base, skillId: null, skill: null };
      const skill = registry.get(skillId);
      if (!skill || !skill.enabled) return { ...base, skillId: null, skill: null };
      return { ...base, skillId, skill };
    },

    routeQuickAction(actionId: string): SkillRouteResult | null {
      const found = registry.findByTrigger('quick-action', actionId);
      const skill = found.find((d) => d.enabled) ?? null;
      if (!skill) return null;
      return {
        skillId: skill.id,
        skill,
        intent: skill.triggers.find((t) => t.kind === 'intent')?.value ?? actionId,
        confidence: 1,
        needsClarification: false,
        clarificationPrompt: null,
        param: null,
      };
    },

    disambiguate(candidates: DisambiguationCandidate[], opts?: DisambiguationOptions) {
      return disambiguate(candidates, opts, displayName);
    },
  };
}
