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
import { isGameQuestion } from '../../game-space/catalog';
import { evaluateCalculation } from './calcIntent';
import { detectClarifyTopic } from './clarifyTopics';
// Pola perintah deterministik kelompok 1–5 (2026-11-17, gap P2–P8 + P12
// audit perintah): pola hidup di modul ./commands/* (satu sumber
// kebenaran dengan yang dites) dan di-spread ke PATTERNS di bawah.
// Cast `as unknown as Pattern[]` karena modul mengetikkan intent sebagai
// string; nama intent diverifikasi runtime oleh chatCommandWiring.
import { QTO_PATTERNS, CREATE_QTO_CLARIFICATION, SYNC_QTO_CLARIFICATION } from './commands/qtoCommands';
import { EXPORT_CREDIT_PATTERNS } from './commands/exportCreditCommands';
import { PROJECT_SETTINGS_PATTERNS, UPDATE_PROJECT_SETTINGS_CLARIFICATION } from './commands/projectSettingsCommands';
import { DED_DOC_PATTERNS } from './commands/dedDocCommands';
import { PROJECT_PATTERNS } from './commands/projectCommands';

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
  | 'GAME_INFO'
  | 'OPEN_SPREADSHEET'
  | 'START_RAB_WIZARD'
  | 'START_HOUSE_DESIGN'
  | 'CREATE_RAB_CLARIFY'
  | 'CREATE_RAB_DIRECT'
  | 'GENERATE_RAB_TEMPLATE'
  | 'CREATE_RAB_SUMMARY'
  | 'RAB_SUBTYPE_SELECT'
  | 'RAB_MATERIAL_SELECT'
  | 'RAB_CONCEPT_SELECT'
  | 'RAB_PROJECT_PREVIEW'
  | 'RAB_INTAKE_OPTION'
  | 'RAB_INTAKE_GENERATE'
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
  | 'EXPLAIN_AHSP_VS_ESTIMATE'
  | 'METHODOLOGY_MISSING_AHSP'
  | 'HOWTO_EXCEL_EXPORT'
  | 'CONCEPTUAL_AHSP'
  | 'QUERY_PROJECT_TOTAL'
  | 'QUERY_PROJECT_LIST'
  | 'QUERY_MOST_EXPENSIVE_ITEMS'
  | 'QUERY_CHEAPEST_ITEMS'
  | 'RENAME_PROJECT'
  | 'UPDATE_ITEM_VOLUME'
  | 'UPDATE_ITEM_PRICE'
  | 'DELETE_ITEM'
  | 'ADD_ITEM'
  | 'UNDO_LAST'
  | 'CREATE_PROJECT'
  | 'DELETE_PROJECT'
  | 'DELETE_PROJECT_CONFIRM'
  | 'ARCHIVE_PROJECT'
  | 'DUPLICATE_PROJECT'
  | 'CREATE_QTO_ITEM'
  | 'SYNC_QTO'
  | 'RUN_DED_ANALYSIS'
  | 'SUMMARIZE_DOCUMENT'
  | 'EXPORT_PROJECT'
  | 'CREATE_REVISION'
  | 'CREDIT_BALANCE'
  | 'TOPUP_CREDIT'
  | 'UPDATE_PROJECT_SETTINGS'
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

// Frasa kualifikator pada kata kunci AHSP ("carikan ahsp yang cocok") —
// penanda kecocokan, bukan kata kunci. "yang pas" ditangani di sini
// (level frasa) karena token "pas" sendiri adalah singkatan "Pasangan"
// pada 163 judul katalog sehingga TIDAK boleh jadi stopword di
// chatSearch.ts. Bila yang tersisa kosong, router mengembalikan
// needsClarification (dan view mencoba fallback topik dari pesan
// sebelumnya sebelum bertanya balik).
const AHSP_QUALIFIER_PHRASE_RE =
  /\byang\s+(cocok|sesuai|pas|tepat|bagus|benar|baik|ideal)\b/gi;

/** Buang frasa kualifikator dari kata kunci pencarian AHSP. */
export function cleanAhspKeyword(raw: string): string {
  return raw.replace(AHSP_QUALIFIER_PHRASE_RE, ' ').replace(/\s+/g, ' ').trim();
}

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
  /** false = intent flows to AI instead of local execution (default true) */
  localOnly?: boolean;
}

const PATTERNS: Pattern[] = [
  // Perintah QTO + ekspor/revisi/kredit (2026-11-17, kelompok 2 & 4):
  // PALING ATAS, sebelum blok mutasi item RAB — "tambah item QTO …"
  // ditelan pola ADD_ITEM, "tambah kredit 1500" ditelan ADD_ITEM, dan
  // "tolong ekspor/buat revisi/top up …" ditelan pola HELP bila blok
  // ini diletakkan sesudahnya. Urutan di dalam tiap modul BERARTI
  // (mis. SYNC "semua" sebelum SYNC bernama) — jangan diurut-ulang.
  ...(QTO_PATTERNS as unknown as Pattern[]),
  ...(EXPORT_CREDIT_PATTERNS as unknown as Pattern[]),
  // Mutasi item RAB deterministik (2026-11-17, gap P1 audit perintah):
  // tambah/hapus/ubah volume/ubah harga/undo dijawab lapisan
  // deterministik (pratinjau + Konfirmasi Eksekusi) tanpa LLM dan tanpa
  // kredit. Diletakkan di AWAL pola, SEBELUM HELP — pola HELP menelan
  // "tolong + kata kerja" ("tolong ubah volume…") bila tidak ada kata
  // rab/proyek/ahsp, padahal itu perintah kerja, bukan minta daftar
  // perintah. (GREETING berjangkar ^…$ sehingga urutan terhadapnya
  // tidak berpengaruh.) Pola bernilai mensyaratkan struktur
  // "jadi/menjadi/ke + angka" sehingga pertanyaan ("berapa volume
  // plesteran?") tidak tertangkap; pola tanpa nilai dijangkar ke awal
  // pesan (opsional "tolong") agar "cara ubah volume" tidak tertangkap.
  // Param = ekor perintah setelah kata kerja; registry yang mem-parsing
  // nama + nilai (routeIntent hanya memakai grup tangkap pertama).
  { intent: 'UPDATE_ITEM_VOLUME', re: /\b(?:ubah|ubahin|ganti|gantiin|rubah)\b.*\bvolume\b\s+(.+\s+(?:jadi|menjadi|ke)\s+[\d.,]+.*)/, paramGroup: true },
  { intent: 'UPDATE_ITEM_VOLUME', re: /\bvolume\b\s+(.+\s+(?:jadi|menjadi)\s+[\d.,]+.*)/, paramGroup: true },
  { intent: 'UPDATE_ITEM_VOLUME', re: /^\s*(?:tolong\s+)?(?:ubah|ubahin|ganti|gantiin|rubah)\b.*\bvolume\b/ },
  { intent: 'UPDATE_ITEM_PRICE', re: /\b(?:ubah|ubahin|ganti|gantiin|rubah)\b.*\bharga\b\s+(.+\s+(?:jadi|menjadi|ke)\s+(?:rp\s*)?[\d.,]+.*)/, paramGroup: true },
  { intent: 'UPDATE_ITEM_PRICE', re: /\bharga\b\s+(.+\s+(?:jadi|menjadi)\s+(?:rp\s*)?[\d.,]+.*)/, paramGroup: true },
  { intent: 'UPDATE_ITEM_PRICE', re: /^\s*(?:tolong\s+)?(?:ubah|ubahin|ganti|gantiin|rubah)\b.*\bharga\b/ },
  // Pengaturan proyek (2026-11-17, kelompok 5): SETELAH keenam pola
  // UPDATE_ITEM_* (pola ini juga cocok pada "ubah volume overhead jadi
  // 10 m2" dan "ubah harga overhead jadi 10%" — kedua rute item itu
  // harus menang) dan SEBELUM DELETE_ITEM.
  ...(PROJECT_SETTINGS_PATTERNS as unknown as Pattern[]),
  { intent: 'DELETE_ITEM', re: /\b(?:hapus|hapuskan|delete|buang)\b.*\b(?:item|pekerjaan)\b\s+(.+)/, paramGroup: true },
  { intent: 'DELETE_ITEM', re: /\b(?:hapus|hapuskan|delete|buang)\b\s+(?!proyek\b)(.+)/, paramGroup: true },
  { intent: 'DELETE_ITEM', re: /^\s*(?:tolong\s+)?(?:hapus|hapuskan|delete|buang)\b\s*(?:item|pekerjaan)?\s*$/ },
  { intent: 'ADD_ITEM', re: /\b(?:tambah|tambahkan|tambahin|add)\b.*\bitem\b\s+(.+)/, paramGroup: true },
  { intent: 'ADD_ITEM', re: /\b(?:tambah|tambahkan|tambahin)\b\s+(?!proyek\b|volume\b)(.+)/, paramGroup: true },
  { intent: 'ADD_ITEM', re: /^\s*(?:tolong\s+)?(?:tambah|tambahkan|tambahin)\b\s*(?:item)?\s*$/ },
  { intent: 'UNDO_LAST', re: /\bundo\b/ },
  { intent: 'UNDO_LAST', re: /\b(?:batalkan|urungkan)\b(?:\s+(?:perubahan|operasi|tindakan))?(?:\s+(?:terakhir|yang terakhir|tadi|barusan))?\s*$/ },
  // DED & AI Document (2026-11-17, kelompok 3): sesudah blok mutasi dan
  // SEBELUM GREETING/HELP — pola HELP menelan "tolong jalankan/ringkas
  // …" bila blok ini di bawahnya. Tidak beririsan dengan OPEN_DED_ESTIMATE
  // / OPEN_AI_DOCUMENTS (mereka menuntut verba buka/tampilkan).
  ...(DED_DOC_PATTERNS as unknown as Pattern[]),
  // Greeting — must come before others to avoid false positives.
  // Jangkar ^...$ dipertahankan (sapaan + perintah kerja dalam satu pesan
  // TIDAK tertelan), tetapi kini menerima "selamat pagi/siang/sore/malam"
  // dan sapaan panggilan singkat ("halo kak") — audit routing 2026-10-23:
  // kedua bentuk umum ini sebelumnya jatuh UNKNOWN ke AI.
  { intent: 'GREETING', re: /^(selamat\s+(pagi|siang|sore|malam)|halo+|hai+|hello+|hi+|hei+|pagi|sore|malam|assalamualaikum)([\s!.,]+(kak|bang|gan|bro|sis|ezrab|semua))?[\s!.,]*$/ },
  // "tolong" tidak memicu HELP bila diikuti objek kerja (rab/proyek/ahsp) —
  // "tolong buatkan rab" adalah perintah kerja, bukan minta bantuan.
  // Audit 2026-10-31 (uji dinamis E0): penjaga diperluas — "tolong" yang
  // diikuti kata tanya/kata kerja penjelasan (jelaskan/hitung/apa/
  // bagaimana/berapa/...) adalah PERTANYAAN untuk AI, bukan minta daftar
  // perintah; sebelumnya semua pesan berawalan "Tolong…" yang sopan
  // tertelan HELP dan tak pernah sampai ke gateway.
  { intent: 'HELP', re: /\b(bantuan|help|panduan|cara pakai|perintah)\b|\btolong\b(?!.*\b(rab|proyek|ahsp)\b)(?!.*\b(jelaskan|hitung|apa|mengapa|kenapa|bagaimana|berapa|kapan|siapa|dimana|di mana))/ },

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
  // Bentuk "-mu" ("kelebihanmu apa saja", "apa kelebihanmu", "fiturmu apa
  // aja"): akhiran -mu adalah penanda rujukan ke AI — pola lama gagal
  // karena \bkelebihan\b tidak cocok dengan "kelebihanmu" dan "apa"
  // datang sesudahnya. Pertanyaan teknis ("apa kelebihan beton
  // pracetak?") tidak punya akhiran -mu sehingga tetap lolos ke LLM.
  { intent: 'CAPABILITIES', re: /\b(kelebihanmu|keunggulanmu|kemampuanmu|fiturmu)\b/ },
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
  // "Gunakan/pakai template RAB" = permintaan eksplisit memakai template
  // (skenario J master prompt Conversational Intelligence 2026-11-10) —
  // kata kerja PENGGUNAAN, bukan navigasi: tetap menuju alur template
  // (OPEN_TEMPLATE membuka katalog template), bukan menu generik dan
  // bukan klarifikasi topik.
  { intent: 'OPEN_TEMPLATE', re: /\b(gunakan|pakai|memakai|menggunakan|pilih)\b.*\btemplate\b/ },
  // Penjaga laporan: "lihat laporan proyek" adalah LAPORAN, bukan daftar
  // proyek — tanpa lookahead ini pola proyek yang rakus (.*proyek) menelan
  // frasa laporan lebih dulu (audit routing 2026-10-23).
  { intent: 'OPEN_PROJECTS', re: /\b(buka|bukain|tampilkan|tampilin|lihat|liatin|daftar)\b(?!.*\b(laporan|report)\b).*\bproyek\b/ },
  // Perintah proyek (2026-11-17, kelompok 1): SEBELUM OPEN_PROJECT_CREATE
  // — "buat proyek Rumah Baru" cocok dengan keduanya (mengandung "baru")
  // dan nama yang disebut harus menang (membuat proyek, bukan navigasi).
  ...(PROJECT_PATTERNS as unknown as Pattern[]),
  { intent: 'OPEN_PROJECT_CREATE', re: /\b(buat|bikin|tambah).*\bproyek\b.*\bbaru\b/ },
  // Ganti nama proyek (2026-11-17): perintah deterministik lokal —
  // sebelumnya jatuh UNKNOWN ke LLM, yang lalu mengklaim rename berhasil
  // tanpa tool apa pun. Urutan: pola "menjadi/jadi/ke" dulu (nama = grup
  // 1), lalu pola tanpa kata penghubung (lookahead mengecualikan
  // "menjadi/jadi/ke" supaya tidak tertelan sebagai nama), lalu bentuk
  // tanpa nama → klarifikasi. Nama diambil verbatim — "sekarang" di akhir
  // kalimat ("...sekarang") TIDAK dipotong: itu bagian dari nama yang
  // ditulis pengguna, dan balasan konfirmasi mengutip nama persisnya
  // sehingga pengguna bisa mengoreksi bila bukan itu maksudnya.
  { intent: 'RENAME_PROJECT', re: /\b(?:ubah|ubahin|ganti|gantiin|rubah|rename)\b.*\bnama\b.*\bproyek\b.*\b(?:menjadi|jadi|ke)\b\s+(.+)/, paramGroup: true },
  { intent: 'RENAME_PROJECT', re: /\b(?:ubah|ubahin|ganti|gantiin|rubah)\b.*\bnama\b.*\bproyek\b\s+(?!menjadi\b|jadi\b|ke\b)(.+)/, paramGroup: true },
  { intent: 'RENAME_PROJECT', re: /\brename\b.*\bproject\b.*\bto\b\s+(.+)/, paramGroup: true },
  { intent: 'RENAME_PROJECT', re: /\b(?:ubah|ubahin|ganti|gantiin|rubah|rename)\b.*\bnama\b.*\bproyek\b\s*$/ },
  { intent: 'RENAME_PROJECT', re: /\b(?:ubah|ubahin|ganti|gantiin|rubah|rename)\b.*\bnama\b.*\bproyek\b.*\b(?:menjadi|jadi|ke)\s*$/ },
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
  // Perbaikan 2026-10-27 (prompt user "rab rumah di probolinggo luas
  // bangunan 70m2" jatuh ke UNKNOWN → agen LLM hanya menampilkan daftar
  // template, bukan tabel): perintah RAB rumah TANPA kata kerja
  // "buatkan/bikin" pun perintah generate — cerminan dua pola di atas
  // tanpa verba. Ditempatkan di kelompok DIRECT, sebelum checklist,
  // agar tidak tertelan CREATE_RAB_SUMMARY. Prompt checklist ("buat
  // checklist ...") tidak cocok karena tanpa luas/Nm2.
  { intent: 'CREATE_RAB_DIRECT', re: /\brab\b.*\brumah\b.*(?:luas(?:\s+bangunan)?|lb)\s*(?:=|sekitar)?\s*\d+/ },
  { intent: 'CREATE_RAB_DIRECT', re: /\brab\b.*\brumah\b.*\d+\s*m(?:2|²)/ },
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
  // Cakupan universal (2026-10-26): kata kunci cakupan lain yang sebelumnya
  // jatuh ke CLARIFY/UNKNOWN — irigasi, pondasi, struktur, atap, finishing,
  // MEP, lanskap, demolisi, dan bangunan khusus. Tetap SETELAH pola spesifik
  // di atas dan SEBELUM pola CLARIFY umum; actionRegistry memutuskan
  // apakah draft universal bisa dibuat atau tetap ringkasan kebutuhan.
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\b(irigasi|pondasi|struktur|atap|finishing|mekanikal|elektrikal|plumbing|mep|lanskap|pagar|pembongkaran|demolisi|sekolah|rumah sakit|klinik|puskesmas|pelabuhan|dermaga|olahraga|lapangan|pertanian|beton|trotoar|kanstin|kolom|balok|sloof|genteng|keramik|plafon|sanitasi|bendung|bendungan|embung|dinding penahan|tembok penahan|turap|retaining|waterproofing|hvac|lift|eskalator|fasad|interior|gorong|u-?ditch|hotel|mall|apartemen|gudang|pabrik)\b/ },
  // Frasa keinginan tanpa kata "rab" ("Saya ingin membuat drainase
  // lingkungan sepanjang 500 meter") — kategori teridentifikasi, jadi
  // ringkasan/intake yang menanganinya, BUKAN "Perintah tidak dikenali"
  // (Universal Intake 2026-11-10). HARUS sebelum CREATE_RAB_CLARIFY.
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(ingin|mau|pengen|hendak)\s+(membuat|buat|bikin|membangun|bangun|dibangun|dibuat|merenovasi|renovasi)\b[^.]{0,60}\b(drainase|saluran|jalan|jembatan|irigasi|gedung|kantor|sekolah|rumah sakit|rumah|hunian|kandang|peternakan|kolam renang|kolam|villa|gudang|bangunan|taman|landscape|lanskap|pagar|pondasi|renovasi|instalasi|plumbing|hvac|dinding penahan|gorong)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\b(ded|gambar kerja)\b/ },
  // Landscape/taman & ruang publik (Conversational Intelligence Upgrade,
  // master prompt owner 2026-11-10): permintaan RAB landscape yang sudah
  // menyebut kategori TIDAK PERNAH jatuh ke menu generik CREATE_RAB_CLARIFY
  // di bawah — ia masuk jalur intake percakapan (konteks proyek terstruktur
  // + pertanyaan konsep), ditangani executeIntent CREATE_RAB_SUMMARY lewat
  // gerbang konteks proyek di actionRegistry. Pola "rab"-dulu juga ditangkap
  // ("rab landscape 1 hektar dong") agar tidak tertelan pola jalan/umum.
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\b(landscape|lanskap)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\brab\b.*\b(landscape|lanskap)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\b(taman kota|taman publik|taman umum|ruang terbuka hijau)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\btaman\b.*\b(hektar|ha\b|m2|m²|meter persegi|surabaya|jakarta|bandung|semarang|medan|makassar|denpasar|yogyakarta|malang|bogor|depok|bekasi|tangerang|palembang|pekanbaru|batam|samarinda|balikpapan|pontianak|manado|solo|surakarta|jogja)\b/ },
  // Gelombang A Fase 2 (2026-11-11): pesan pertama dengan SINYAL PROYEK
  // terbaca tidak boleh jatuh ke menu generik/UNKNOWN hanya karena verba
  // atau sinonimnya di luar daftar lama. Kategori non-katalog & sinonim
  // (kandang/peternakan/lembu, warehouse, hunian, kolam renang) + verba
  // perlu/minta/hitungkan/perbaikan → jalur percakapan kontekstual
  // (CREATE_RAB_SUMMARY → gerbang intake universal). Umum, bukan
  // hardcode contoh: pola = verba RAB × keluarga kategori.
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat|tolong|minta|perlu|ingin|mau|pengen|hendak|hitungkan|hitung)\b[^.]{0,40}\brab\b[^.]{0,60}\b(kandang|peternakan|lembu|warehouse|kolam renang|jembatan|gudang)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\brab\b[^.]{0,60}\b(kandang|peternakan|warehouse|kolam renang)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(buatkan|buatin|bikin|buat)\b.*\brab\b.*\b(hunian)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\brab\b.*\b(perbaikan|renovasi)\b.*\b(dapur|kamar mandi|toilet|atap|rumah)\b/ },
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(perlu|minta|tolong)\b[^.]{0,30}\brab\b[^.]{0,60}\b(jembatan|drainase|pagar|kolam|jalan|gedung|kantor|sekolah)\b/ },
  // Gelombang B (2026-11-11): verba "hitungkan/hitung + estimasi" tanpa
  // kata "rab" ("Hitungkan estimasi pembangunan gudang baja 20 × 40")
  // adalah permintaan estimasi yang sama — sebelumnya UNKNOWN padahal
  // kategori + ukurannya lengkap dan mesin katalog bisa menyusunnya.
  { intent: 'CREATE_RAB_SUMMARY', re: /\b(hitungkan|hitung|estimasikan)\b[^.]{0,30}\b(estimasi|perhitungan)\b[^.]{0,60}\b(gudang|kandang|peternakan|jembatan|gedung|kantor|sekolah|kolam renang|warehouse|jalan|drainase|rumah|villa)\b/ },
  // "buatkan rab" tanpa objek spesifik -> tanya balik (jangan tumpahkan daftar
  // template). Pola spesifik (rumah/dll) sudah tertangkap di atas; pola umum
  // ini HARUS tetap setelahnya. \brab\b tidak menangkap "rabat beton".
  { intent: 'CREATE_RAB_CLARIFY', re: /\b(buatkan|buatin|bikin|buat|mau buat|ingin buat|pengen buat)\b.*\brab\b/ },
  { intent: 'CREATE_RAB_CLARIFY', re: /^\s*rab\s+baru\s*$/ },
  { intent: 'OPEN_SPREADSHEET', re: /\b(buka|bukain|tampilkan|tampilin)\b.*\bspreadsheet\b/ },
  { intent: 'OPEN_DASHBOARD', re: /\b(buka|kembali|ke)\b.*\bdashboard\b/ },

  // Remediasi Batch 1 (2026-10-28): pertanyaan konseptual / metodologi /
  // how-to HARUS sebelum pola SEARCH_AHSP yang rakus — kata "ahsp" di
  // dalamnya bukan perintah pencarian item. Urutan di dalam kelompok ini:
  // how-to spesifik dulu, lalu penjelasan spesifik, lalu metodologi, lalu
  // konseptual umum (yang mengalir ke AI sebagai prosa model, tanpa
  // pencarian item lokal).
  { intent: 'HOWTO_EXCEL_EXPORT', re: /\bcara\b.*\b(mengekspor|mengekspor|ekspor|export|mengunduh|unduh|download)\b.*\b(excel|xlsx)\b/ },
  { intent: 'HOWTO_EXCEL_EXPORT', re: /\b(bagaimana|gimana)\b.*\b(ekspor|export|unduh|download)\b.*\b(excel|xlsx)\b/ },
  { intent: 'EXPLAIN_AHSP_VS_ESTIMATE', re: /\bbeda.*\bahsp\b.*\bestimasi\b/ },
  { intent: 'EXPLAIN_AHSP_VS_ESTIMATE', re: /\bestimasi\b.*\bbeda.*\bahsp\b/ },
  { intent: 'METHODOLOGY_MISSING_AHSP', re: /\b(kalau|jika|apabila)\b.*\b(tidak ada|tidak tersedia|tidak ditemukan|kosong)\b.*\bahsp\b/ },
  { intent: 'METHODOLOGY_MISSING_AHSP', re: /\bahsp\b.*\b(tidak ada|tidak tersedia|tidak ditemukan)\b.*\b(bagaimana|gimana|terus|kemudian|apa yang)\b/ },
  { intent: 'METHODOLOGY_MISSING_AHSP', re: /\b(tidak ada|tidak tersedia|tidak ditemukan)\b.*\bahsp\b.*\b(bagaimana|gimana)\b/ },
  // Konseptual AHSP umum -> jalur AI (prosa model, tanpa pencarian item).
  // Bentuk telanjang ("apa itu ahsp 2026") sudah ditangani detectClarifyTopic
  // sebelum pola; pola ini menangkap redaksi berkalimat yang lolos dari sana.
  { intent: 'CONCEPTUAL_AHSP', re: /\b(apa itu|jelaskan|terangkan|mengapa|kenapa)\b.*\bahsp\b/, localOnly: false },
  { intent: 'CONCEPTUAL_AHSP', re: /\bapa\b.*\bbeda\b.*\bahsp\b/, localOnly: false },
  { intent: 'CONCEPTUAL_AHSP', re: /\bahsp\b.*\b(artinya|maksudnya|definisi|pengertian)\b/, localOnly: false },

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
  { intent: 'QUERY_PROJECT_LIST', re: /^(?!.*\b(?:hapus|hapuskan|delete|buang)\b).*\b(daftar|list|semua)\b.*\bproyek\b/ },
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

  // 2a. Pertanyaan TENTANG game ("game apa saja?", "ada game apa?",
  // "game bongkar rumah tentang apa?") — BUKAN perintah membuka panel.
  // Dijawab deterministik dari katalog nyata (game-space/catalog.ts):
  // perintah owner 2026-11-01 — chat wajib menjawab ADA + menjelaskan
  // semua game dan isinya, bukan "tidak tahu" dari model yang memang
  // tidak punya data game. Lokal penuh, tanpa kredit.
  if (isGameQuestion(input)) {
    return { intent: 'GAME_INFO', confidence: 0.9, needsClarification: false, param: rawInput, localOnly: true };
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
  // Penanda perintah MASSAL (kasus C11): kelima intent mutasi item hanya
  // menangani SATU item bernama — "ganti semua harga kosong jadi Rp1"
  // bukan mutasi satu item dan tidak boleh mendapat jalur deterministik
  // (tidak ada jalur eksekusi pemalsuan). Bila teks memuat penanda massal,
  // pola mutasi dilewati agar permintaan jatuh ke UNKNOWN / jalur AI.
  const bulkMutationFramed = /\b(semua|seluruh|setiap)\b/.test(input);
  const MUTATION_INTENTS: ReadonlySet<string> = new Set([
    'UPDATE_ITEM_VOLUME',
    'UPDATE_ITEM_PRICE',
    'DELETE_ITEM',
    'ADD_ITEM',
    'UNDO_LAST',
    // Hapus proyek ikut dipagari (2026-11-17, kelompok 1): "hapus semua
    // proyek" tidak boleh mendapat jalur deterministik. Intent lain
    // kelompok 1–5 TIDAK masuk set ini (bukan destruktif massal —
    // SYNC_QTO "semua" justru perilaku yang diminta).
    'DELETE_PROJECT',
  ]);
  for (const p of PATTERNS) {
    if (fictionFramed && RAB_CREATE_INTENTS.has(p.intent)) continue;
    if (bulkMutationFramed && MUTATION_INTENTS.has(p.intent)) continue;
    const m = input.match(p.re);
    if (m) {
      // Param diambil dari teks ASLI (rawInput) dengan pola yang sama
      // dalam mode case-insensitive — supaya huruf besar/kecil yang
      // diketik pengguna terjaga (nama proyek "Rumah Impian" tidak
      // berubah menjadi "rumah impian"). Deteksi intent tetap memakai
      // teks ternormalisasi; bila pencocokan ulang gagal (tidak mungkin
      // terjadi — pola yang sama, superset case), pakai param
      // ternormalisasi sebagai cadangan.
      let param: string | undefined;
      if (p.paramGroup) {
        const rawRe = new RegExp(p.re.source, p.re.flags.includes('i') ? p.re.flags : `${p.re.flags}i`);
        const rawM = rawInput.match(rawRe);
        param = (rawM?.[1] ?? m[1] ?? '').trim() || undefined;
        // SEARCH_AHSP: buang frasa kualifikator ("yang cocok") dari kata
        // kunci — bila yang tersisa kosong, param dianggap tidak ada dan
        // cabang klarifikasi di bawah yang berjalan (temuan live
        // 2026-11-17: "carikan ahsp yang cocok" mencari "yang cocok"
        // harfiah dan gagal NOT_FOUND).
        if (p.intent === 'SEARCH_AHSP' && param) {
          param = cleanAhspKeyword(param) || undefined;
        }
      }
      // SEARCH_AHSP without keyword needs clarification
      if (p.intent === 'SEARCH_AHSP' && !param) {
        return {
          intent: 'SEARCH_AHSP', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Mau cari AHSP apa? Contoh: "cari ahsp pondasi batu kali".',
          localOnly: true,
        };
      }
      // RENAME_PROJECT without a new name needs clarification
      if (p.intent === 'RENAME_PROJECT' && !param) {
        return {
          intent: 'RENAME_PROJECT', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Mau diganti jadi nama apa? Contoh: "ubah nama proyek menjadi Rumah Impian".',
          localOnly: true,
        };
      }
      // Mutasi item tanpa nilai/nama → klarifikasi dengan contoh
      // (registry tidak pernah menebak nilai atau nama item).
      if (p.intent === 'UPDATE_ITEM_VOLUME' && !param) {
        return {
          intent: 'UPDATE_ITEM_VOLUME', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Ubah volume item apa, jadi berapa? Contoh: "ubah volume plesteran jadi 25 m2".',
          localOnly: true,
        };
      }
      if (p.intent === 'UPDATE_ITEM_PRICE' && !param) {
        return {
          intent: 'UPDATE_ITEM_PRICE', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Ubah harga item apa, jadi berapa? Contoh: "ubah harga plesteran jadi Rp 50.000". Harga yang diubah adalah harga item di proyek ini, bukan harga master database.',
          localOnly: true,
        };
      }
      if (p.intent === 'DELETE_ITEM' && !param) {
        return {
          intent: 'DELETE_ITEM', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Hapus item apa? Contoh: "hapus item plesteran".',
          localOnly: true,
        };
      }
      if (p.intent === 'ADD_ITEM' && !param) {
        return {
          intent: 'ADD_ITEM', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Tambah item apa? Contoh: "tambah item plesteran 10 m2".',
          localOnly: true,
        };
      }
      // Perintah proyek/QTO/pengaturan tanpa target (2026-11-17,
      // kelompok 1/2/5): tanya balik dengan contoh, jangan tebak.
      if (p.intent === 'DELETE_PROJECT' && !param) {
        return {
          intent: 'DELETE_PROJECT', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Hapus proyek yang mana? Contoh: "hapus proyek ini" atau "hapus proyek Rumah Impian".',
          localOnly: true,
        };
      }
      if (p.intent === 'ARCHIVE_PROJECT' && !param) {
        return {
          intent: 'ARCHIVE_PROJECT', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Arsipkan proyek yang mana? Contoh: "arsipkan proyek ini".',
          localOnly: true,
        };
      }
      if (p.intent === 'DUPLICATE_PROJECT' && !param) {
        return {
          intent: 'DUPLICATE_PROJECT', confidence: 0.7, needsClarification: true,
          clarificationPrompt: 'Duplikat proyek yang mana? Contoh: "duplikat proyek ini".',
          localOnly: true,
        };
      }
      if (p.intent === 'CREATE_QTO_ITEM' && !param) {
        return {
          intent: 'CREATE_QTO_ITEM', confidence: 0.7, needsClarification: true,
          clarificationPrompt: CREATE_QTO_CLARIFICATION,
          localOnly: true,
        };
      }
      if (p.intent === 'SYNC_QTO' && !param) {
        return {
          intent: 'SYNC_QTO', confidence: 0.7, needsClarification: true,
          clarificationPrompt: SYNC_QTO_CLARIFICATION,
          localOnly: true,
        };
      }
      if (p.intent === 'UPDATE_PROJECT_SETTINGS' && !param) {
        return {
          intent: 'UPDATE_PROJECT_SETTINGS', confidence: 0.7, needsClarification: true,
          clarificationPrompt: UPDATE_PROJECT_SETTINGS_CLARIFICATION,
          localOnly: true,
        };
      }
      return { intent: p.intent, confidence: 0.85, needsClarification: false, param, localOnly: p.localOnly ?? true };
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

/**
 * Teks bantuan /help — dijaga RINGKAS (< 1200 karakter, dipin
 * chatAiContextAware #19): perintah yang namanya sudah menjelaskan
 * diri tidak diberi deskripsi (deskripsi hanya bila menambah arti di
 * luar nama perintah); daftar lengkap selalu tersedia lewat "/" di
 * composer. Semua perintah tetap tercantum — tidak ada yang dihapus.
 */
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
(+ slash lainnya — ketik "/" di composer untuk daftar lengkap)

🔍 Pencarian:
"cari ahsp [kata kunci]" — Cari harga satuan AHSP 2026

✏️ Ubah item RAB (pratinjau + konfirmasi):
ubah volume/harga [item] jadi … · hapus item … · tambah item … · undo

📁 Proyek: buat proyek [nama] · hapus/arsipkan/duplikat proyek ini
🧮 QTO: buat item qto [uraian] [volume] [satuan] · sinkronkan qto … ke rab
🗂️ DED & Dokumen: "jalankan analisis ded" (sesi terakhir) · "ringkas dokumen ini"
📦 Ekspor & kredit: "ekspor ke Excel/PDF" · "buat revisi baru" · "sisa kredit saya" · "top up 500 kredit"
⚙️ Pengaturan proyek: ubah overhead/profit/PPN/PPh jadi …% (contoh: "PPN 11%")

💬 Atau tulis natural, contoh: "buka template rab", "berapa total proyek saya?"`;
