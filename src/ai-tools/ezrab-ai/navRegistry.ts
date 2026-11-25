/**
 * EZRAB AI — Navigation Registry & Command Resolver
 * (src/ai-tools/ezrab-ai/navRegistry.ts)
 *
 * Registry terpusat untuk navigasi langsung dari Chat AI ke seluruh fitur
 * aplikasi (Command Router, 2026-10-26). Setiap entry dipetakan ke menu
 * workspace NYATA yang sudah dirender WorkspaceView (bukan route karangan):
 * tujuan akhir dihitung lewat routeForMenu() resmi di src/routing/routes.ts,
 * sehingga URL + halaman berubah persis seperti klik Sidebar.
 *
 * Aturan kejujuran registry:
 * - Entry TANPA target terverifikasi tidak boleh masuk sebagai navigasi.
 * - "Database" adalah grup header Sidebar tanpa halaman sendiri: entry-nya
 *   diarahkan ke halaman pertama grup itu (Material & Harga) dan deskripsi
 *   menyebutkannya secara eksplisit.
 * - "Tutorial" bukan halaman: aksinya men-dispatch event
 *   `ezrab:open-onboarding` yang sudah ditangkap useOnboardingTour() di App
 *   (pola yang sama dipakai tombol Tutorial Sidebar).
 * - Filter status proyek (Draft/dll) BUKAN parameter URL — parseWorkspaceRoute
 *   membuang ?status=. Mekanisme resminya adalah state projectFilter di
 *   WorkspaceView (di-set lewat callback Sidebar). Karena itu entry proyek
 *   berfilter membawa `projectFilter` dan view men-dispatch event
 *   `ezrab:set-project-filter` (didengarkan WorkspaceView) SEBELUM navigasi.
 *   ProjectsView menyinkronkan initialFilter lewat useEffect, jadi filter
 *   berlaku baik saat halaman proyek baru di-mount maupun saat sudah dibuka.
 *
 * Resolver ini MURNI (tanpa efek samping, tanpa window/document): ia hanya
 * memutuskan APA yang dimaksud pengguna. Eksekusi navigasi tinggal di view.
 * Modul ini mengimpor clarifyTopics (murni, tanpa siklus) hanya untuk
 * menjaga aturan owner 2026-10-23: topik telanjang tetap ditangani kartu
 * klarifikasi, bukan dibajak menjadi navigasi.
 *
 * KEBIJAKAN SLASH-ONLY (keputusan owner, directive P1 §4.1 / OD-1,
 * 2026-11-24 — MENGGANTIKAN perilaku Command Router 2026-10-26):
 * navigasi chat HANYA lewat perintah slash eksplisit. Bahasa alami
 * ("buka ahsp", "tampilkan database AHSP") TIDAK PERNAH menavigasi —
 * pesan seperti itu dikembalikan 'none' agar sampai ke AI sebagai
 * percakapan biasa. Satu-satunya bentuk non-awal yang masih menavigasi
 * adalah perintah slash yang didahului kesopanan/verba ("tolong buka
 * /ahsp") — isi operatif pesannya tetap perintah slash itu sendiri.
 * Negasi ("jangan buka /ahsp") tidak pernah menavigasi (W-A-01).
 */
import { routeForMenu } from '../../routing/routes';
import { detectClarifyTopic } from './clarifyTopics';

export interface NavEntry {
  /** Identifier stabil, unik, dipakai chip nav-entry + tes. */
  id: string;
  /** Label Indonesia yang tampil di chip/menu. */
  label: string;
  /** Deskripsi singkat untuk menu slash. */
  description: string;
  /** Perintah slash (termasuk garis miring), unik per entry. */
  slash: string;
  /** Menu workspace tujuan (routeForMenu). null hanya untuk aksi khusus. */
  menu: string | null;
  /** Filter status proyek (hanya entry proyek berfilter). */
  projectFilter?: string;
  /** Aksi khusus non-navigasi (saat ini hanya 'tutorial'). */
  special?: 'tutorial';
  /** Frasa bahasa alami (sudah dinormalisasi: huruf kecil, spasi tunggal). */
  aliases: string[];
  /** Kategori untuk pengelompokan menu slash. */
  category: string;
}

export const NAV_ENTRIES: NavEntry[] = [
  { id: 'beranda', label: 'Beranda', description: 'Kembali ke dashboard utama', slash: '/beranda', menu: 'dashboard', aliases: ['beranda', 'home', 'dashboard', 'halaman utama'], category: 'Beranda' },
  { id: 'proyek-semua', label: 'Semua Proyek', description: 'Daftar seluruh proyek', slash: '/proyek', menu: 'proyek', projectFilter: 'Semua Proyek', aliases: ['semua proyek', 'daftar proyek', 'proyek'], category: 'Proyek' },
  { id: 'proyek-draft', label: 'Proyek Draft', description: 'Proyek berstatus Draft', slash: '/proyek-draft', menu: 'proyek', projectFilter: 'Draft', aliases: ['proyek draft', 'draft proyek', 'proyek draf'], category: 'Proyek' },
  { id: 'proyek-aktif', label: 'Proyek Sedang Dikerjakan', description: 'Proyek yang sedang dikerjakan', slash: '/proyek-aktif', menu: 'proyek', projectFilter: 'Sedang Dikerjakan', aliases: ['proyek sedang dikerjakan', 'proyek yang sedang dikerjakan', 'proyek aktif', 'proyek berjalan'], category: 'Proyek' },
  { id: 'proyek-selesai', label: 'Proyek Selesai', description: 'Proyek yang sudah selesai', slash: '/proyek-selesai', menu: 'proyek', projectFilter: 'Selesai', aliases: ['proyek selesai', 'proyek sudah selesai'], category: 'Proyek' },
  { id: 'proyek-arsip', label: 'Proyek Arsip', description: 'Proyek yang diarsipkan', slash: '/proyek-arsip', menu: 'proyek', projectFilter: 'Arsip', aliases: ['proyek arsip', 'arsip proyek'], category: 'Proyek' },
  { id: 'kalkulator-volume', label: 'Kalkulator Volume', description: 'Hitung volume pekerjaan', slash: '/kalkulator', menu: 'qto-vc', aliases: ['kalkulator volume', 'kalkulator', 'hitung volume'], category: 'Volume & QTO' },
  { id: 'rekap-qto', label: 'Rekapitulasi QTO', description: 'Rekapitulasi quantity take-off', slash: '/qto', menu: 'qto', aliases: ['rekapitulasi qto', 'rekap qto', 'qto', 'rekapitulasi'], category: 'Volume & QTO' },
  { id: 'jadwal-manajemen', label: 'Jadwal & Manajemen', description: 'Jadwal dan manajemen proyek', slash: '/jadwal-manajemen', menu: 'manajemen-proyek', aliases: ['jadwal dan manajemen', 'jadwal manajemen', 'manajemen proyek'], category: 'Jadwal' },
  { id: 'jadwal', label: 'Jadwal', description: 'Bagian jadwal pelaksanaan', slash: '/jadwal', menu: 'jadwal', aliases: ['jadwal', 'jadwal proyek', 'jadwal pelaksanaan'], category: 'Jadwal' },
  { id: 'rab-estimasi', label: 'RAB & Estimasi', description: 'Halaman RAB & Estimasi', slash: '/rab', menu: 'rab-estimasi', aliases: ['rab dan estimasi', 'rab estimasi', 'rab'], category: 'RAB & Estimasi' },
  { id: 'informasi-proyek', label: 'Informasi Proyek', description: 'Informasi lengkap proyek', slash: '/informasi-proyek', menu: 'rab-informasi-proyek', aliases: ['informasi proyek', 'info proyek', 'data proyek'], category: 'RAB & Estimasi' },
  { id: 'spreadsheet-rab', label: 'Spreadsheet RAB', description: 'Spreadsheet RAB proyek', slash: '/spreadsheet', menu: 'rab-spreadsheet', aliases: ['spreadsheet rab', 'spreadsheet', 'sheet rab'], category: 'RAB & Estimasi' },
  { id: 'rekap-rab', label: 'Rekapitulasi RAB', description: 'Rekapitulasi RAB', slash: '/rekap-rab', menu: 'rab-rekapitulasi', aliases: ['rekapitulasi rab', 'rekap rab', 'rekapitulasi'], category: 'RAB & Estimasi' },
  { id: 'ahsp', label: 'AHSP / Analisa Harga Satuan', description: 'Katalog AHSP 2026', slash: '/ahsp', menu: 'ahsp-2026', aliases: ['ahsp', 'analisa harga satuan', 'analisa harga', 'ahsp 2026', 'katalog ahsp'], category: 'Database' },
  { id: 'rab-analisa-harga', label: 'Analisa Harga RAB', description: 'Analisa harga di dalam RAB proyek', slash: '/analisa-harga', menu: 'rab-analisa-harga', aliases: ['analisa harga rab', 'analisa harga proyek'], category: 'RAB & Estimasi' },
  { id: 'kurva-s', label: 'Kurva S & Jadwal', description: 'Kurva S dan jadwal pelaksanaan', slash: '/kurva-s', menu: 'kurva-s', aliases: ['kurva s dan jadwal', 'kurva s', 'kurva-s', 'kurva jadwal'], category: 'Jadwal' },
  { id: 'catatan-estimasi', label: 'Catatan Estimasi', description: 'Catatan pada estimasi RAB', slash: '/catatan', menu: 'rab-catatan', aliases: ['catatan estimasi', 'catatan rab', 'catatan'], category: 'RAB & Estimasi' },
  { id: 'pengaturan-rab', label: 'Pengaturan RAB', description: 'Pengaturan RAB', slash: '/pengaturan-rab', menu: 'rab-pengaturan', aliases: ['pengaturan rab', 'setting rab', 'setelan rab'], category: 'RAB & Estimasi' },
  { id: 'ezrab-chat-ai', label: 'EZRAB Chat AI', description: 'Kembali ke Chat AI', slash: '/chat-ai', menu: 'ezrab-ai', aliases: ['ezrab chat ai', 'chat ai', 'chat ezrab'], category: 'AI' },
  { id: 'ded-estimate-ai', label: 'DED Estimate AI', description: 'Estimasi dari gambar DED', slash: '/ded', menu: 'ded-ai', aliases: ['ded estimate ai', 'ded', 'ded ai'], category: 'AI' },
  { id: 'ai-document', label: 'AI Document', description: 'Buat dan kelola dokumen AI', slash: '/dokumen-ai', menu: 'dokumen-ai', aliases: ['ai document', 'dokumen ai', 'ai dokumen'], category: 'AI' },
  { id: 'template-rab', label: 'Template RAB', description: 'Katalog template RAB', slash: '/template', menu: 'template-rab', aliases: ['template rab', 'template', 'katalog template'], category: 'AI' },
  { id: 'database', label: 'Database', description: 'Database harga (dibuka di Material & Harga)', slash: '/database', menu: 'database-material', aliases: ['database', 'basis data'], category: 'Database' },
  { id: 'material-harga', label: 'Material & Harga', description: 'Database material dan harga', slash: '/material', menu: 'database-material', aliases: ['material dan harga', 'material harga', 'material', 'harga material', 'database material'], category: 'Database' },
  { id: 'upah', label: 'Upah', description: 'Standar upah tenaga kerja', slash: '/upah', menu: 'database-upah', aliases: ['upah', 'standar upah', 'harga upah', 'database upah'], category: 'Database' },
  { id: 'peralatan', label: 'Peralatan', description: 'Tarif peralatan', slash: '/alat', menu: 'database-alat', aliases: ['peralatan', 'alat', 'tarif peralatan', 'harga alat', 'sewa alat', 'database alat'], category: 'Database' },
  { id: 'harga-proyek', label: 'Harga Proyek', description: 'Harga khusus proyek', slash: '/harga-proyek', menu: 'harga-proyek', aliases: ['harga proyek'], category: 'Database' },
  { id: 'laporan', label: 'Laporan', description: 'Laporan proyek', slash: '/laporan', menu: 'laporan', aliases: ['laporan', 'laporan proyek'], category: 'Laporan & Dokumen' },
  { id: 'dokumen-proyek', label: 'Dokumen Proyek', description: 'Dokumen proyek (tender)', slash: '/dokumen-proyek', menu: 'dokumen-tender', aliases: ['dokumen proyek', 'dokumen tender'], category: 'Laporan & Dokumen' },
  { id: 'keuangan-proyek', label: 'Keuangan Proyek', description: 'Keuangan dan arus kas proyek', slash: '/keuangan', menu: 'keuangan-proyek', aliases: ['keuangan proyek', 'keuangan', 'kas proyek'], category: 'Keuangan' },
  { id: 'pengaturan', label: 'Pengaturan', description: 'Pengaturan aplikasi', slash: '/pengaturan', menu: 'pengaturan', aliases: ['pengaturan', 'setting', 'settings', 'setelan'], category: 'Pengaturan' },
  { id: 'tutorial', label: 'Tutorial', description: 'Buka tur tutorial EZRAB', slash: '/tutorial', menu: null, special: 'tutorial', aliases: ['tutorial', 'panduan', 'tutorial ezrab', 'cara pakai'], category: 'Bantuan' },
];

export const NAV_BY_ID: Record<string, NavEntry> = Object.fromEntries(
  NAV_ENTRIES.map((e) => [e.id, e]),
);

/** Filter status proyek yang diakui WorkspaceView (allowlist event bridge). */
export const PROJECT_FILTERS = ['Semua Proyek', 'Draft', 'Sedang Dikerjakan', 'Selesai', 'Arsip'] as const;

/**
 * Jalur URL resmi untuk satu entry (dipakai tes validasi route; view sendiri
 * menavigasi lewat menu + navigateChat agar konteks proyek dipertahankan).
 * null hanya untuk aksi khusus (tutorial: event, bukan route).
 */
export function navPathForEntry(entry: NavEntry, projectId?: string | null): string | null {
  if (entry.special === 'tutorial' || !entry.menu) return null;
  return routeForMenu(entry.menu, projectId ?? null);
}

/** Slash legacy yang tetap ditangani routeIntent lama (jangan dibajak). */
const LEGACY_SLASH = new Set([
  '/dokumen', '/dashboard', '/help', '/bantuan', '/game',
  '/projects', '/reports', '/settings', '/templates',
]);

const NAV_VERBS =
  /\b(buka|bukain|bukakan|pergi ke|masuk ke|tampilkan|tampilin|tunjukin|tunjukkan|lihat|liatin|pindah ke|antarkan ke|bawa ke)\b/;
const LEADING_KE = /^ke\s+/;

/**
 * Penanda penolakan navigasi (W-A-01, directive P1 §4.1). Bila pesan
 * memuat salah satunya, pesan TIDAK PERNAH menavigasi — termasuk bentuk
 * "jangan buka /ahsp" yang memuat perintah slash. \b di kedua ujung
 * menjaga "batalkan" (UNDO_LAST) tidak tertangkap "batal".
 */
export const NAV_NEGATION_RE =
  /\b(jangan|tidak mau|nggak mau|gak mau|tidak usah|jangan dulu|batal|tidak jadi|nggak jadi|gak jadi|tidak ingin|nggak ingin|do not|don't|dont|never|not want)\b/;

export const hasNavNegation = (text: string): boolean => NAV_NEGATION_RE.test(text ?? '');

/**
 * Awalan yang boleh mendahului perintah slash di tengah pesan ("tolong
 * buka /ahsp"): partikel kesopanan + verba navigasi + "ke". Hanya awalan
 * ini yang dilucuti — kata lain ("jelaskan", "explain") menghentikan
 * pelucutan sehingga "/ahsp" di tengah kalimat penjelasan TIDAK
 * dieksekusi ("Explain the /ahsp command" → AI).
 */
const SLASH_PREFIX_RE =
  /^(?:tolong|mohon|please|coba|bisakah|bisa|ayo|yuk|buka|bukain|bukakan|pergi ke|masuk ke|tampilkan|tampilin|tunjukin|tunjukkan|lihat|liatin|pindah ke|antarkan ke|bawa ke|open|show|go to|ke)\b\s*/;

export const normalizeNavText = (s: string): string =>
  (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.!\?…]+$/, '').trim();

/**
 * Ekstraksi kata kunci sisa AHSP (F-06, diperketat W-A-03, directive
 * P1 §4.1): lucuti partikel kesopanan, token "/", tanda kutip, verba
 * navigasi, kata "menu/halaman/katalog", dan tahun edisi — lalu hanya
 * kembalikan sisa bila memuat SATU token kata kunci alfanumerik
 * (panjang ≥ 2). Tanpa itu, ahspQuery TIDAK PERNAH di-set (tanpa q
 * sampah seperti "tolong /" atau "/"). Dipakai pada jalur slash
 * tengah-pesan, yang residunya (awalan kesopanan/verba) selalu
 * terluncuti habis — sehingga dalam praktik q tidak pernah ter-set
 * dari sana; helper ini adalah penjaga defense-in-depth + penanda
 * aturan W-A-03 sebagai kode yang bisa dites.
 */
export function extractAhspResidual(text: string): string | undefined {
  const rest = (text ?? '')
    .replace(/["'«»„“”]/g, ' ')
    .replace(/\//g, ' ')
    .replace(/\b(tolong|mohon|please|coba|bisakah|bisa|ayo|yuk)\b/g, ' ')
    .replace(new RegExp(NAV_VERBS.source, 'g'), ' ')
    .replace(LEADING_KE, ' ')
    .replace(/\b(menu|halaman|katalog)\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rest) return undefined;
  const hasKeyword = rest.split(' ').some((t) => /[a-z0-9]{2,}/i.test(t));
  return hasKeyword ? rest : undefined;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

/**
 * Saran untuk slash tak dikenal: prefix → substring → kemiripan.
 * W-A-05 (directive P1 §4.1): TANPA fallback tetap — bila tidak ada
 * entri yang mirip, kembalikan [] dan pemanggil mengarahkan ke /help,
 * bukan menampilkan chip yang tidak berhubungan.
 * W-A-06: token kosong ("/" telanjang) → [] — pemanggil menampilkan
 * petunjuk /help, bukan 33 chip "tidak dikenal".
 */
export function suggestSlash(token: string): NavEntry[] {
  const q = token.replace(/^\//, '').toLowerCase();
  if (!q) return [];
  const byPrefix = NAV_ENTRIES.filter((e) => e.slash.slice(1).startsWith(q));
  if (byPrefix.length > 0) return byPrefix;
  const bySub = NAV_ENTRIES.filter(
    (e) => e.slash.slice(1).includes(q) || e.label.toLowerCase().includes(q),
  );
  if (bySub.length > 0) return bySub;
  const byEdit = NAV_ENTRIES.filter((e) => levenshtein(e.slash.slice(1), q) <= 3);
  if (byEdit.length > 0) return byEdit;
  return [];
}

export type NavResolution =
  | { mode: 'none' }
  | { mode: 'direct'; entry: NavEntry; ahspQuery?: string }
  | { mode: 'suggest'; entry?: NavEntry; message: string; candidates: NavEntry[] }
  | { mode: 'ambiguous'; candidates: NavEntry[]; message: string };

/** Resolusi satu token slash (dipakai cabang slash awal + tengah-pesan). */
function resolveSlashToken(token: string): NavResolution {
  // W-A-06: "/" telanjang → petunjuk /help, tanpa kata "tidak dikenal"
  // dan tanpa chip (menu slash lengkap sudah ada di composer).
  if (token === '/') {
    return {
      mode: 'suggest',
      message: 'Ketik /help untuk daftar perintah — atau ketik "/" diikuti nama perintah.',
      candidates: [],
    };
  }
  const bySlash = NAV_ENTRIES.find((e) => e.slash === token);
  if (bySlash) return { mode: 'direct', entry: bySlash };
  if (LEGACY_SLASH.has(token)) return { mode: 'none' };
  const candidates = suggestSlash(token);
  if (candidates.length > 0) {
    return {
      mode: 'suggest',
      entry: candidates[0],
      message: `Perintah ${token} tidak dikenal. Mungkin maksudmu:`,
      candidates,
    };
  }
  // W-A-05: tidak ada entri mirip → arahkan ke /help, bukan chip acak.
  return {
    mode: 'suggest',
    message: `Perintah ${token} tidak dikenal. Ketik /help untuk daftar perintah.`,
    candidates: [],
  };
}

/**
 * Resolver deterministik. Berjalan SEBELUM request AI (view memanggilnya di
 * submit) dan MURNI — tidak menavigasi, tidak mengubah state.
 *
 * Urutan (slash-only, directive P1 §4.1 / OD-1): topik telanjang
 * (klarifikasi, jangan dibajak) → perintah slash di awal pesan →
 * penjaga negasi (W-A-01) → perintah slash tengah-pesan sesudah awalan
 * kesopanan/verba ("tolong buka /ahsp") → SELAIN ITU 'none' (pesan
 * sampai ke AI sebagai percakapan biasa).
 *
 * DIHAPUS oleh §4.1 (perubahan perilaku yang disengaja, bukan pelemahan):
 * cabang perintah eksplisit bahasa alami ("buka ahsp" → direct), cabang
 * saran "cara membuka" / campuran info+perintah / pesan panjang, dan
 * cabang nama target telanjang ("database" → chip ambigu). Semua bentuk
 * itu kini 'none' — view tidak lagi mencegatnya dari AI. Ekstraksi
 * F-06 ikut terhapus bersama cabang eksplisitnya; aturan scrubbing
 * W-A-03 hidup di extractAhspResidual() dan dipakai jalur slash
 * tengah-pesan (yang dalam praktik tidak pernah menghasilkan q).
 */
export function resolveNavCommand(rawInput: string): NavResolution {
  const text = normalizeNavText(rawInput);
  if (!text) return { mode: 'none' };

  // Topik telanjang tetap milik kartu klarifikasi (aturan owner 2026-10-23).
  if (detectClarifyTopic(text)) return { mode: 'none' };

  // ---- Slash command di awal pesan (sesudah spasi opsional) ----
  if (text.startsWith('/')) {
    const token = text.split(' ')[0];
    return resolveSlashToken(token);
  }

  // ---- Penjaga negasi (W-A-01): penolakan tidak pernah menavigasi. ----
  // Ditempatkan sesudah cabang slash awal — perintah slash eksplisit
  // yang diketik pengguna (/ahsp) tidak ambigu — dan sebelum cabang
  // slash tengah-pesan ("jangan buka /ahsp" → none).
  if (hasNavNegation(text)) return { mode: 'none' };

  // ---- Slash tengah-pesan: awalan kesopanan/verba + perintah slash. ----
  // "tolong buka /ahsp" → navigasi (tanpa q); "Explain the /ahsp
  // command" → none ("explain" menghentikan pelucutan); slash dalam
  // tanda kutip ("buka \"/ahsp\"") → none (kutip bukan awalan).
  let rest = text;
  let stripped = false;
  for (;;) {
    const m = rest.match(SLASH_PREFIX_RE);
    if (!m || m[0].length === 0) break;
    rest = rest.slice(m[0].length);
    stripped = true;
  }
  if (stripped && rest.startsWith('/')) {
    const token = rest.split(' ')[0];
    const prefix = text.slice(0, text.length - rest.length);
    const res = resolveSlashToken(token);
    if (res.mode === 'direct' && res.entry.id === 'ahsp') {
      // W-A-03: q hanya bila awalan menyisakan kata kunci nyata —
      // awalan kesopanan/verba selalu terluncuti habis ("tolong buka"
      // → tanpa q), sehingga ini penjaga, bukan jalur q baru.
      const q = extractAhspResidual(prefix);
      if (q) return { ...res, ahspQuery: q };
    }
    return res;
  }

  // Bahasa alami — termasuk verba navigasi + nama target — BUKAN
  // perintah navigasi (§4.1): kembalikan 'none' agar pesan sampai ke AI.
  return { mode: 'none' };
}

/* ------------------------------------------------------------------ */
/* Slash menu composer (pure helpers — bisa dites tanpa React).       */
/* ------------------------------------------------------------------ */

/** Token slash yang sedang diketik sebelum kursor, atau null. */
export function extractSlashToken(value: string, cursor: number | null): string | null {
  const before = cursor == null ? value : value.slice(0, cursor);
  const m = before.match(/(?:^|\s)\/([A-Za-z0-9_-]*)$/);
  return m ? m[1] : null;
}

/** Daftar menu slash yang difilter query (kosong = semua). */
export function filterSlashEntries(query: string): NavEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...NAV_ENTRIES];
  return NAV_ENTRIES.filter(
    (e) => e.slash.slice(1).startsWith(q) || e.slash.slice(1).includes(q) || e.label.toLowerCase().includes(q),
  );
}
