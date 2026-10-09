/**
 * EZRAB AI — Intent Router (src/ai-tools/ezrab-ai/intentRouter.ts)
 *
 * Deterministic local intent matching. Runs BEFORE any AI provider call.
 * Order: normalize → slash command → local intent → (no match → AI online).
 *
 * Never fabricates: intents return structured results; actions are executed
 * by the registry, not by string templating.
 */

export type ChatIntent =
  | 'GREETING'
  | 'HELP'
  | 'OPEN_TEMPLATE'
  | 'OPEN_PROJECTS'
  | 'OPEN_PROJECT_CREATE'
  | 'OPEN_RAB'
  | 'OPEN_QTO'
  | 'OPEN_AHSP'
  | 'OPEN_REPORTS'
  | 'OPEN_AI_DOCUMENTS'
  | 'OPEN_DED_ESTIMATE'
  | 'OPEN_SETTINGS'
  | 'OPEN_DASHBOARD'
  | 'SEARCH_AHSP'
  | 'QUERY_PROJECT_TOTAL'
  | 'QUERY_PROJECT_LIST'
  | 'UNKNOWN';

export interface IntentResult {
  intent: ChatIntent;
  confidence: number; // 0..1
  needsClarification: boolean;
  clarificationPrompt?: string;
  /** Raw parameter extracted (e.g. AHSP keyword, project name hint) */
  param?: string;
  /** Whether this intent is safe to run without AI */
  localOnly: boolean;
}

const norm = (s: string): string =>
  s.toLowerCase().trim().replace(/\s+/g, ' ');

// ---- Slash commands: deterministic ----
const SLASH_COMMANDS: Record<string, ChatIntent> = {
  '/template': 'OPEN_TEMPLATE',
  '/templates': 'OPEN_TEMPLATE',
  '/proyek': 'OPEN_PROJECTS',
  '/projects': 'OPEN_PROJECTS',
  '/rab': 'OPEN_RAB',
  '/qto': 'OPEN_QTO',
  '/ahsp': 'OPEN_AHSP',
  '/laporan': 'OPEN_REPORTS',
  '/reports': 'OPEN_REPORTS',
  '/dokumen': 'OPEN_AI_DOCUMENTS',
  '/ded': 'OPEN_DED_ESTIMATE',
  '/pengaturan': 'OPEN_SETTINGS',
  '/settings': 'OPEN_SETTINGS',
  '/dashboard': 'OPEN_DASHBOARD',
  '/help': 'HELP',
  '/bantuan': 'HELP',
};

// ---- Natural-language patterns (Indonesian, incl. informal) ----
interface Pattern {
  intent: ChatIntent;
  re: RegExp;
  /** extract param via capture group 1 */
  paramGroup?: boolean;
}

const PATTERNS: Pattern[] = [
  // Greeting — must come before others to avoid false positives
  { intent: 'GREETING', re: /^(halo+|hai+|hello+|hi+|hei+|pagi|sore|malam|assalamualaikum)[\s!.,]*$/ },
  { intent: 'HELP', re: /\b(bantuan|help|tolong|panduan|cara pakai|perintah)\b/ },

  // Navigation — require explicit navigation verbs to avoid aggressive matching
  // (includes informal variants: bukain, tampilin, liatin)
  { intent: 'OPEN_TEMPLATE', re: /\b(buka|bukain|bukakan|tampilkan|tampilin|lihat|liatin|ke)\b.*\btemplate\b.*\brab\b|\btemplate\b.*\brab\b.*\b(buka|tampilkan|lihat)\b/ },
  { intent: 'OPEN_PROJECTS', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin|daftar)\b.*\bproyek\b/ },
  { intent: 'OPEN_PROJECT_CREATE', re: /\b(buat|bikin|tambah).*\bproyek\b.*\bbaru\b/ },
  { intent: 'OPEN_RAB', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin)\b.*\brab\b/ },
  { intent: 'OPEN_QTO', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\bqto\b/ },
  { intent: 'OPEN_AHSP', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin)\b.*\bahsp\b/ },
  { intent: 'OPEN_REPORTS', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin)\b.*\b(laporan|report)\b/ },
  { intent: 'OPEN_AI_DOCUMENTS', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\b(dokumen|document)\b/ },
  { intent: 'OPEN_DED_ESTIMATE', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\bded\b/ },
  { intent: 'OPEN_DASHBOARD', re: /\b(buka|kembali|ke)\b.*\bdashboard\b/ },

  // AHSP search without keyword → clarification (never silently Rp0)
  { intent: 'SEARCH_AHSP', re: /^(cari|carikan|search)\s+(ahsp|harga satuan)\s*$/ },

  // Queries with params — trigger words are non-capturing so m[1] is always the keyword
  { intent: 'SEARCH_AHSP', re: /\b(?:cari|search|carikan)\b.*\bahsp\b\s+(.+)/, paramGroup: true },
  { intent: 'SEARCH_AHSP', re: /\bahsp\b\s+(.+)/, paramGroup: true },
  { intent: 'QUERY_PROJECT_TOTAL', re: /\b(berapa|total|jumlah)\b.*\b(biaya|total|anggaran)\b.*\bproyek\b/ },
  { intent: 'QUERY_PROJECT_LIST', re: /\b(daftar|list|semua)\b.*\bproyek\b/ },
];

export function routeIntent(rawInput: string): IntentResult {
  const input = norm(rawInput);
  if (!input) {
    return { intent: 'UNKNOWN', confidence: 0, needsClarification: true, clarificationPrompt: 'Pesan kosong. Ketik /help untuk daftar perintah.', localOnly: true };
  }

  // 1. Slash command (deterministic, highest confidence)
  const firstToken = input.split(' ')[0];
  if (firstToken.startsWith('/')) {
    const mapped = SLASH_COMMANDS[firstToken];
    if (mapped) {
      return { intent: mapped, confidence: 1, needsClarification: false, localOnly: true };
    }
    return {
      intent: 'UNKNOWN', confidence: 0.9, needsClarification: true,
      clarificationPrompt: `Perintah ${firstToken} tidak dikenal. Ketik /help untuk daftar perintah.`,
      localOnly: true,
    };
  }

  // 2. Pattern matching
  for (const p of PATTERNS) {
    const m = input.match(p.re);
    if (m) {
      const param = p.paramGroup && m[1] ? m[1].trim() : undefined;
      // SEARCH_AHSP without keyword needs clarification
      if (p.intent === 'SEARCH_AHSP' && !param) {
        return {
          intent: 'SEARCH_AHSP', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Mau cari AHSP apa? Contoh: "cari ahsp pondasi batu kali".',
          localOnly: true,
        };
      }
      return { intent: p.intent, confidence: 0.85, needsClarification: false, param, localOnly: true };
    }
  }

  // 3. No match → AI online
  return { intent: 'UNKNOWN', confidence: 0, needsClarification: false, localOnly: false };
}

/** Local greeting responses (no AI call). */
const GREETING_RESPONSES = [
  'Halo! Saya EZRAB, siap membantu pekerjaan proyek dan RAB Anda. Mau mulai dari mana?',
  'Hai! Ada yang bisa saya bantu soal proyek atau RAB hari ini?',
  'Halo! Silakan tanya soal RAB, AHSP, atau ketik /help untuk daftar perintah.',
];

export function localGreeting(): string {
  return GREETING_RESPONSES[Math.floor(Math.random() * GREETING_RESPONSES.length)];
}

export const HELP_TEXT = `Perintah yang tersedia:

🧭 Navigasi:
/template — Buka Template RAB
/proyek — Daftar proyek
/rab — Buka RAB & Estimasi
/qto — Buka QTO
/ahsp — Buka AHSP 2026
/dokumen — Buka AI Document
/ded — Buka DED Estimate AI
/dashboard — Kembali ke dashboard

🔍 Pencarian:
"cari ahsp [kata kunci]" — Cari harga satuan AHSP 2026

💬 Atau tulis natural, contoh: "buka template rab", "berapa total proyek saya?"`;
