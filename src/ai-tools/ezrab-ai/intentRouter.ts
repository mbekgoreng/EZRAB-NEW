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
import { evaluateCalculation } from './calcIntent';
import { detectClarifyTopic } from './clarifyTopics';

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
  | 'GENERATE_RAB_TEMPLATE'
  | 'CREATE_RAB_SUMMARY'
  | 'RAB_SUBTYPE_SELECT'
  | 'RAB_PATH_TEMPLATE'
  | 'RAB_FULL_AI'
  | 'RAB_NEEDS_REFINE'
  | 'OPEN_DESIGN_WORKSPACE'
  | 'CAPABILITIES'
  | 'CALCULATE'
  | 'RAB_DATA_CHECKLIST'
  | 'CLARIFY_TOPIC'
  | 'CLARIFY_PICK'
  | 'CLARIFY_QUERY'
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
  // Greeting — must come before others to avoid false positives.
  // Jangkar ^...$ dipertahankan (sapaan + perintah kerja dalam satu pesan
  // TIDAK tertelan), tetapi kini menerima "selamat pagi/siang/sore/malam"
  // dan sapaan panggilan singkat ("halo kak") — audit routing 2026-10-23:
  // kedua bentuk umum ini sebelumnya jatuh UNKNOWN ke AI.
  { intent: 'GREETING', re: /^(selamat\s+(pagi|siang|sore|malam)|halo+|hai+|hello+|hi+|hei+|pagi|sore|malam|assalamualaikum)([\s!.,]+(kak|bang|gan|bro|sis|ezrab|semua))?[\s!.,]*$/ },
  // "tolong" tidak memicu HELP bila diikuti objek kerja (rab/proyek/ahsp) —
  // "tolong buatkan rab" adalah perintah kerja, bukan minta bantuan.
  { intent: 'HELP', re: /\b(bantuan|help|panduan|cara pakai|perintah)\b|\btolong\b(?!.*\b(rab|proyek|ahsp)\b)/ },

  // "kamu bisa apa?" -> jawaban produk deterministik (keunggulan EZRAB),
  // bukan jawaban umum model AI. Pola mensyaratkan konteks kamu/ezrab agar
  // pertanyaan teknis (mis. "apa keunggulan bata merah") tidak tertangkap.
  { intent: 'CAPABILITIES', re: /\bkamu\b.*\b(bisa|dapat|mampu)\b.*\bapa\b/ },
  { intent: 'CAPABILITIES', re: /\b(bisa apa|bisa ngapain|ngapain aja)\b/ },
  // Urutan apa→bisa→kamu→bantu ("Apa saja yang bisa kamu bantu untuk proyek
  // konstruksi?" — kasus A1): pola lama mensyaratkan kamu…bisa…apa sehingga
  // redaksi paling umum ini lolos ke LLM. Tetap mensyaratkan konteks
  // kamu/ezrab + kata bantu/fitur agar pertanyaan teknis tidak terbajak.
  { intent: 'CAPABILITIES', re: /\bapa\b.*\b(bisa|dapat|mampu)\b.*\b(kamu|ezrab)\b.*\b(bantu|membantu|dibantu)\b/ },
  { intent: 'CAPABILITIES', re: /\bapa saja\b.*\b(kamu|ezrab)\b.*\b(bantu|membantu|fitur|kemampuan)\b/ },
  { intent: 'CAPABILITIES', re: /\b(bisa|dapat)\s+(bantu|membantu)\s+apa\b/ },
  { intent: 'CAPABILITIES', re: /\b(apa|sebutkan|jelaskan|tampilkan)\b.*\b(fitur|kemampuan|keunggulan|kelebihan)\b.*\b(kamu|ezrab|aplikasi ini)\b/ },
  { intent: 'CAPABILITIES', re: /\b(fitur|kemampuan|keunggulan|kelebihan)\b.*\b(ezrab|kamu)\b/ },
  { intent: 'CAPABILITIES', re: /\bezrab\b.*\b(bisa|fitur|keunggulan|kelebihan)\b/ },

  // Navigation — require explicit navigation verbs to avoid aggressive matching
  // (includes informal variants: bukain, tampilin, liatin)
  { intent: 'OPEN_TEMPLATE', re: /\b(buka|bukain|bukakan|tampilkan|tampilin|lihat|liatin|ke)\b.*\btemplate\b.*\brab\b|\btemplate\b.*\brab\b.*\b(buka|tampilkan|lihat)\b/ },
  // "lihat template" tanpa kata "rab" tetap navigasi katalog (audit routing
  // 2026-10-23). Kata "template" telanjang tetap CLARIFY_TOPIC karena
  // deteksi klarifikasi berjalan sebelum pola.
  { intent: 'OPEN_TEMPLATE', re: /\b(buka|bukain|bukakan|tampilkan|tampilin|lihat|liatin|ke)\b.*\btemplate\b/ },
  // Penjaga laporan: "lihat laporan proyek" adalah LAPORAN, bukan daftar
  // proyek — tanpa lookahead ini pola proyek yang rakus (.*proyek) menelan
  // frasa laporan lebih dulu (audit routing 2026-10-23).
  { intent: 'OPEN_PROJECTS', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin|daftar)\b(?!.*\b(laporan|report)\b).*\bproyek\b/ },
  { intent: 'OPEN_PROJECT_CREATE', re: /\b(buat|bikin|tambah).*\bproyek\b.*\bbaru\b/ },
  { intent: 'OPEN_RAB', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin)\b.*\brab\b/ },
  { intent: 'OPEN_QTO', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\bqto\b/ },
  { intent: 'OPEN_AHSP', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin)\b.*\bahsp\b/ },
  { intent: 'OPEN_REPORTS', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin)\b.*\b(laporan|report)\b/ },
  { intent: 'OPEN_AI_DOCUMENTS', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\b(dokumen|document)\b/ },
  { intent: 'OPEN_DED_ESTIMATE', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\bded\b/ },
  // "buka pengaturan" sebelumnya tanpa pola natural (hanya slash /pengaturan)
  // -> UNKNOWN. Guard (?!\s+rab) menjaga "pengaturan rab" tidak salah masuk
  // pengaturan global (audit routing 2026-10-23).
  { intent: 'OPEN_SETTINGS', re: /\b(buka|bukain|bukakan|tampilkan|tampilin|lihat|liatin|ke)\b.*\b(pengaturan|setting|settings)\b(?!\s+rab\b)/ },
  // RAB langsung (permintaan user 2026-10-21): perintah RAB rumah DENGAN tipe
  // eksplisit ("buatkan rab rumah type 70 2 lantai") dihitung langsung oleh
  // mesin parametrik dan ditampilkan sebagai tabel — bukan ringkasan/template.
  // Pola ini HARUS sebelum pola CREATE_RAB_SUMMARY rumah di bawah.
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\brumah\b.*\b(type|tipe)\s*\d+/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b.*\brumah\b.*\b(type|tipe)\s*\d+.*\brab\b/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\brab\b.*\brumah\b.*\b(type|tipe)\s*\d+/ },
  // RAB langsung SPESIFIKASI BEBAS (perluasan 2026-10-22): perintah RAB rumah
  // dengan spesifikasi terukur TANPA tipe terdaftar — dimensi ("rumah 5x10"),
  // luas bangunan eksplisit ("luas bangunan 50 m2" / "rumah 90 m2") — juga
  // masuk CREATE_RAB_DIRECT; actionRegistry/specRab yang memutuskan generate
  // parametrik vs jatuh ke ringkasan. Pola dimensi tanpa kata "rab" memakai
  // penjaga anti-"desain" agar "buatkan desain rumah 5x10" tetap ringkasan.
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\brumah\b.*\d+\s*[x×]\s*\d+/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\brab\b.*\brumah\b.*\d+\s*[x×]\s*\d+/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b(?!.*\bdesain\b)(?!.*\bdesign\b).*\brumah\b.*\d+\s*[x×]\s*\d+/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\brumah\b.*(?:luas(?:\s+bangunan)?|lb)\s*(?:=|sekitar)?\s*\d+/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\brumah\b.*\d+\s*m(?:2|²)/ },
  // Checklist data persiapan RAB (kasus A3): permintaan DOKUMEN/PENGETAHUAN
  // ("Buat checklist data sebelum menyusun RAB rumah…") BUKAN intake
  // pembuatan RAB — pola CREATE_RAB_* di bawah hanya mensyaratkan
  // buat+rab+rumah sehingga kalimat ini tersedot ke ringkasan kebutuhan.
  // Pola checklist HARUS sebelum pola CREATE_RAB_SUMMARY.
  { intent: 'RAB_DATA_CHECKLIST', re: /\b(checklist|ceklist|cek lis|daftar periksa)\b.*\brab\b/ },
  { intent: 'RAB_DATA_CHECKLIST', re: /\b(checklist|ceklist)\b.*\b(rumah|gedung|proyek|bangunan)\b/ },
  { intent: 'RAB_DATA_CHECKLIST', re: /\bdata\b.*\b(disiapkan|diperlukan|dibutuhkan)\b.*\b(rab|menyusun)\b/ },

  // Chat-to-RAB (Fase 2): permintaan RAB/desain yang DITULIS pengguna TIDAK
  // lagi membuka wizard/studio otomatis. Router mengarah ke CREATE_RAB_SUMMARY:
  // chat menampilkan ringkasan kebutuhan yang terekstrak + tombol eksplisit
  // "Buka Workspace Desain & RAB". Wizard/studio hanya terbuka oleh klik tombol
  // tersebut (persetujuan pengguna), bukan oleh teks perintah.
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin| Bikinkan|buat)\b.*\brab\b.*\brumah\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\brab\b.*\brumah\b.*\b(baru|wizard|panduan)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buat|bikin|desain|design)\b.*\b(desain|design)\b.*\brumah\b/ },
  // "buatkan desain rumah 5x10" sebelumnya lolos dari semua pola (kata kerja
  // "buatkan" tidak cocok dengan pola desain lama, penjaga anti-desain
  // memblokir DIRECT) -> UNKNOWN, padahal maksudnya intake desain/ringkasan.
  // Tetap BUKAN direct — ringkasan kebutuhan yang menawari workspace desain
  // (audit routing 2026-10-23).
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\b(desain|design)\b.*\brumah\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(desain|design)\b.*\brumah\b.*\d+\s*[x×]\s*\d+/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin)\b.*\brumah\b.*\b(\d+)\s*m/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\b(gedung|ruko|villa|gudang|kantor|jalan|drainase|saluran|paving|renovasi|jembatan)\b/ },
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
  // "cari harga satuan beton k225" adalah pencarian AHSP yang sama, hanya
  // tanpa kata "ahsp" — sebelumnya UNKNOWN (audit routing 2026-10-23).
  // Bentuk telanjang "cari harga satuan" tetap tertangkap pola klarifikasi
  // SEARCH_AHSP di atas (tanpa kata kunci) karena \s+(.+) tidak cocok.
  { intent: 'SEARCH_AHSP', re: /\b(?:cari|search|carikan)\b.*\bharga satuan\b\s+(.+)/, paramGroup: true },
  { intent: 'SEARCH_AHSP', re: /\bharga satuan\b\s+(.+)/, paramGroup: true },
  // Item termahal/termurah — deterministik dari snapshot RAB (tanpa AI).
  // Cakup varian: "material paling mahal", "item termahal", "pekerjaan terbesar biayanya", dll.
  // Ditempatkan SEBELUM QUERY_PROJECT_TOTAL agar "berapa material termahal proyek" tidak tersedot ke total.
  { intent: 'QUERY_MOST_EXPENSIVE_ITEMS', re: /\b(material|bahan|item|pekerjaan|komponen)\b.*\b(paling mahal|termahal|tertinggi|terbesar)\b/ },
  { intent: 'QUERY_MOST_EXPENSIVE_ITEMS', re: /\b(paling mahal|termahal|tertinggi|terbesar)\b.*\b(material|bahan|item|pekerjaan|komponen|biaya|harga)\b/ },
  { intent: 'QUERY_CHEAPEST_ITEMS', re: /\b(material|bahan|item|pekerjaan|komponen)\b.*\b(paling murah|termurah|terendah|terkecil)\b/ },
  { intent: 'QUERY_CHEAPEST_ITEMS', re: /\b(paling murah|termurah|terendah|terkecil)\b.*\b(material|bahan|item|pekerjaan|komponen|biaya|harga)\b/ },
  // 'rab' masuk kelompok tengah: "total rab proyek ini berapa?" sebelumnya
  // UNKNOWN karena kata tengah yang dikenal hanya biaya/total/anggaran
  // (audit routing 2026-10-23).
  { intent: 'QUERY_PROJECT_TOTAL', re: /\b(berapa|total|jumlah)\b.*\b(biaya|total|anggaran|rab)\b.*\bproyek\b/ },
  { intent: 'QUERY_PROJECT_LIST', re: /\b(daftar|list|semua)\b.*\bproyek\b/ },
  // "proyek saya apa saja?" — tanpa kata daftar/list/semua dan tanpa kata
  // kerja navigasi, sebelumnya UNKNOWN (audit routing 2026-10-23).
  { intent: 'QUERY_PROJECT_LIST', re: /\bproyek\b.*\b(apa saja|mana saja)\b/ },
  { intent: 'QUERY_PROJECT_LIST', re: /\b(apa saja|mana saja)\b.*\bproyek\b/ },
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

  // 2b. Klarifikasi topik telanjang (peraturan owner 2026-10-23): pesan
  // yang HANYA menyebut topik tanpa objek ("ahsp", "cek harga",
  // "template", "apa itu ahsp 2026") TIDAK diteruskan ke LLM untuk
  // ditebak — chat bertanya balik dengan kartu pilihan. Deteksi di sini
  // (sebelum pola) khusus topik ahsp/harga/template agar bentuk tanya
  // seperti "apa itu ahsp 2026" tidak tertelan pola SEARCH_AHSP
  // (\bahsp\b\s+(.+) akan mem-parse "2026" sebagai kata kunci).
  // Topik 'rab' dicek SETELAH pola (langkah 3b) agar perintah yang
  // sudah tertangani deterministik — CREATE_RAB_CLARIFY untuk
  // "buatkan rab", CREATE_RAB_* spesifik — tidak berubah perilaku.
  const clarifyTopic = detectClarifyTopic(input);
  if (clarifyTopic && clarifyTopic !== 'rab') {
    return { intent: 'CLARIFY_TOPIC', confidence: 0.9, needsClarification: false, param: clarifyTopic, localOnly: true };
  }

  // 3. Pattern matching
  // Penanda fiksi/khayal (kasus G3): permintaan berbingkai fiksi ("Buat RAB
  // rumah di Mars … tandai sebagai fiksi") TIDAK boleh masuk intake RAB
  // sungguhan — pola CREATE_RAB_* dilewati agar pesan diteruskan utuh ke
  // jalur AI dengan bingkai fiksinya.
  const fictionFramed =
    /\b(fiksi|khayalan|khayal|fantasi|dongeng|seandainya|andaikan)\b|\bdi\s+mars\b|\bplanet\b|\bberandai\b/.test(input);
  const RAB_CREATE_INTENTS: ReadonlySet<string> = new Set([
    'CREATE_RAB_DIRECT',
    'CREATE_RAB_SUMMARY',
    'CREATE_RAB_CLARIFY',
  ]);
  for (const p of PATTERNS) {
    if (fictionFramed && RAB_CREATE_INTENTS.has(p.intent)) continue;
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

  // 3b. Topik 'rab' telanjang ("rab", "minta rab"): pola spesifik di
  // atas tidak menangkapnya — tanya balik dengan pilihan jenis
  // pekerjaan (kartu CLARIFY_TOPIC topik 'rab').
  if (clarifyTopic === 'rab') {
    return { intent: 'CLARIFY_TOPIC', confidence: 0.9, needsClarification: false, param: 'rab', localOnly: true };
  }

  // 4. Intent CALCULATE deterministik (Fase 4 QA kategori B): hitungan
  // konstruksi yang polanya terparse PENUH dijawab evaluator lokal tanpa
  // LLM. Pola tak lengkap → null → jatuh ke AI seperti biasa. Pertanyaan
  // konseptual (mengapa/apakah boleh) tidak memuat hitungan konkret
  // sehingga tidak tertangkap di sini.
  if (evaluateCalculation(rawInput) !== null) {
    return { intent: 'CALCULATE', confidence: 0.95, needsClarification: false, param: rawInput, localOnly: true };
  }

  // 5. No match → AI online
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
