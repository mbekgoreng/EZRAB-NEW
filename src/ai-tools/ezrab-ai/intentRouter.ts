/**
 * EZRAB AI — Intent Router (src/ai-tools/ezrab-ai/intentRouter.ts)
 *
 * Deterministic local intent matching. Runs BEFORE any AI provider call.
 * Order: normalize → slash command → local intent → (no match → AI online).
 *
 * Never fabricates: intents return structured results; actions are executed
 * by the registry, not by string templating.
 */
import { isGameCommand } from '../../game-space/command';

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
  | 'OPEN_GAME_SPACE'
  | 'OPEN_SPREADSHEET'
  | 'START_RAB_WIZARD'
  | 'START_HOUSE_DESIGN'
  | 'CREATE_RAB_CLARIFY'
  | 'CREATE_RAB_DIRECT'
  | 'CREATE_RAB_SUMMARY'
  | 'RAB_NEEDS_REFINE'
  | 'OPEN_DESIGN_WORKSPACE'
  | 'CAPABILITIES'
  | 'SEARCH_AHSP'
  | 'QUERY_PROJECT_TOTAL'
  | 'QUERY_PROJECT_LIST'
  | 'QUERY_MOST_EXPENSIVE_ITEMS'
  | 'QUERY_CHEAPEST_ITEMS'
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
  '/game': 'OPEN_GAME_SPACE',
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
  // "tolong" tidak memicu HELP bila diikuti objek kerja (rab/proyek/ahsp) —
  // "tolong buatkan rab" adalah perintah kerja, bukan minta bantuan.
  { intent: 'HELP', re: /\b(bantuan|help|panduan|cara pakai|perintah)\b|\btolong\b(?!.*\b(rab|proyek|ahsp)\b)/ },

  // "kamu bisa apa?" -> jawaban produk deterministik (keunggulan EZRAB),
  // bukan jawaban umum model AI. Pola mensyaratkan konteks kamu/ezrab agar
  // pertanyaan teknis (mis. "apa keunggulan bata merah") tidak tertangkap.
  { intent: 'CAPABILITIES', re: /\bkamu\b.*\b(bisa|dapat|mampu)\b.*\bapa\b/ },
  { intent: 'CAPABILITIES', re: /\b(bisa apa|bisa ngapain|ngapain aja)\b/ },
  { intent: 'CAPABILITIES', re: /\b(apa|sebutkan|jelaskan|tampilkan)\b.*\b(fitur|kemampuan|keunggulan|kelebihan)\b.*\b(kamu|ezrab|aplikasi ini)\b/ },
  { intent: 'CAPABILITIES', re: /\b(fitur|kemampuan|keunggulan|kelebihan)\b.*\b(ezrab|kamu)\b/ },
  { intent: 'CAPABILITIES', re: /\bezrab\b.*\b(bisa|fitur|keunggulan|kelebihan)\b/ },

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
  // RAB langsung (permintaan user 2026-10-21): perintah RAB rumah DENGAN tipe
  // eksplisit ("buatkan rab rumah type 70 2 lantai") dihitung langsung oleh
  // mesin parametrik dan ditampilkan sebagai tabel — bukan ringkasan/template.
  // Pola ini HARUS sebelum pola CREATE_RAB_SUMMARY rumah di bawah.
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\brumah\b.*\b(type|tipe)\s*\d+/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b.*\brumah\b.*\b(type|tipe)\s*\d+.*\brab\b/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\brab\b.*\brumah\b.*\b(type|tipe)\s*\d+/ },
  // Chat-to-RAB (Fase 2): permintaan RAB/desain yang DITULIS pengguna TIDAK
  // lagi membuka wizard/studio otomatis. Router mengarah ke CREATE_RAB_SUMMARY:
  // chat menampilkan ringkasan kebutuhan yang terekstrak + tombol eksplisit
  // "Buka Workspace Desain & RAB". Wizard/studio hanya terbuka oleh klik tombol
  // tersebut (persetujuan pengguna), bukan oleh teks perintah.
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin| Bikinkan|buat)\b.*\brab\b.*\brumah\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\brab\b.*\brumah\b.*\b(baru|wizard|panduan)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buat|bikin|desain|design)\b.*\b(desain|design)\b.*\brumah\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin)\b.*\brumah\b.*\b(\d+)\s*m/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\b(gedung|ruko|villa|gudang|kantor|jalan|drainase|saluran|paving|renovasi)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\b(ded|gambar kerja)\b/ },
  // "buatkan rab" tanpa objek spesifik -> tanya balik (jangan tumpahkan daftar
  // template). Pola spesifik (rumah/dll) sudah tertangkap di atas; pola umum
  // ini HARUS tetap setelahnya. \brab\b tidak menangkap "rabat beton".
  { intent: 'CREATE_RAB_CLARIFY', re: /\b(buatkan|buatin|bikin|buat|mau buat|ingin buat|pengen buat)\b.*\brab\b/ },
  { intent: 'CREATE_RAB_CLARIFY', re: /^\s*rab\s+baru\s*$/ },
  { intent: 'OPEN_SPREADSHEET', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\bspreadsheet\b/ },
  { intent: 'OPEN_DASHBOARD', re: /\b(buka|kembali|ke)\b.*\bdashboard\b/ },

  // AHSP search without keyword → clarification (never silently Rp0)
  { intent: 'SEARCH_AHSP', re: /^(cari|carikan|search)\s+(ahsp|harga satuan)\s*$/ },

  // Queries with params — trigger words are non-capturing so m[1] is always the keyword
  { intent: 'SEARCH_AHSP', re: /\b(?:cari|search|carikan)\b.*\bahsp\b\s+(.+)/, paramGroup: true },
  { intent: 'SEARCH_AHSP', re: /\bahsp\b\s+(.+)/, paramGroup: true },
  // Item termahal/termurah — deterministik dari snapshot RAB (tanpa AI).
  // Cakup varian: "material paling mahal", "item termahal", "pekerjaan terbesar biayanya", dll.
  // Ditempatkan SEBELUM QUERY_PROJECT_TOTAL agar "berapa material termahal proyek" tidak tersedot ke total.
  { intent: 'QUERY_MOST_EXPENSIVE_ITEMS', re: /\b(material|bahan|item|pekerjaan|komponen)\b.*\b(paling mahal|termahal|tertinggi|terbesar)\b/ },
  { intent: 'QUERY_MOST_EXPENSIVE_ITEMS', re: /\b(paling mahal|termahal|tertinggi|terbesar)\b.*\b(material|bahan|item|pekerjaan|komponen|biaya|harga)\b/ },
  { intent: 'QUERY_CHEAPEST_ITEMS', re: /\b(material|bahan|item|pekerjaan|komponen)\b.*\b(paling murah|termurah|terendah|terkecil)\b/ },
  { intent: 'QUERY_CHEAPEST_ITEMS', re: /\b(paling murah|termurah|terendah|terkecil)\b.*\b(material|bahan|item|pekerjaan|komponen|biaya|harga)\b/ },
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

  // 2. Game Space command — deterministic, runs fully local (no AI call, no credits)
  if (isGameCommand(rawInput)) {
    return { intent: 'OPEN_GAME_SPACE', confidence: 0.95, needsClarification: false, localOnly: true };
  }

  // 3. Pattern matching
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

  // 4. No match → AI online
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
/game — Buka EZRAB Game Space 🎮

🔍 Pencarian:
"cari ahsp [kata kunci]" — Cari harga satuan AHSP 2026

💬 Atau tulis natural, contoh: "buka template rab", "berapa total proyek saya?"`;
