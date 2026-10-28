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
 */
import { routeForMenu } from '../../routing/routes';
import { clarifyPickResult, detectClarifyTopic } from './clarifyTopics';

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
const HOWTO =
  /^(bagaimana|gimana)\b.*\b(cara|buka|membuka|masuk|mengakses)\b|\bcara (membuka|buka|mengakses|masuk ke)\b|\b(di mana|dimana)\b.*\b(menu|letak|halaman)\b/;
const INFO_VERBS =
  /\b(jelaskan|apa itu|ceritakan|beritahu|beri tahu|terangkan|uraikan|definisi|pengertian)\b/;

export const normalizeNavText = (s: string): string =>
  (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.!\?…]+$/, '').trim();

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cari alias terpanjang yang muncul sebagai frasa utuh di teks. */
function findAliasMatch(text: string): { entry: NavEntry; alias: string }[] {
  const hits: { entry: NavEntry; alias: string }[] = [];
  for (const entry of NAV_ENTRIES) {
    for (const alias of entry.aliases) {
      const re = new RegExp(`(?<!\\w)${escapeRegExp(alias)}(?!\\w)`);
      if (re.test(text)) hits.push({ entry, alias });
    }
  }
  const maxLen = hits.reduce((m, h) => Math.max(m, h.alias.length), 0);
  return hits.filter((h) => h.alias.length === maxLen);
}

const FALLBACK_SUGGESTIONS = ['spreadsheet-rab', 'ahsp', 'proyek-semua', 'template-rab'];

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

/** Saran untuk slash tak dikenal: prefix → substring → kemiripan → fallback. */
export function suggestSlash(token: string): NavEntry[] {
  const q = token.replace(/^\//, '').toLowerCase();
  if (!q) return [...NAV_ENTRIES];
  const byPrefix = NAV_ENTRIES.filter((e) => e.slash.slice(1).startsWith(q));
  if (byPrefix.length > 0) return byPrefix;
  const bySub = NAV_ENTRIES.filter(
    (e) => e.slash.slice(1).includes(q) || e.label.toLowerCase().includes(q),
  );
  if (bySub.length > 0) return bySub;
  const byEdit = NAV_ENTRIES.filter((e) => levenshtein(e.slash.slice(1), q) <= 3);
  if (byEdit.length > 0) return byEdit;
  return FALLBACK_SUGGESTIONS.map((id) => NAV_BY_ID[id]);
}

export type NavResolution =
  | { mode: 'none' }
  | { mode: 'direct'; entry: NavEntry; ahspQuery?: string }
  | { mode: 'suggest'; entry: NavEntry; message: string; candidates: NavEntry[] }
  | { mode: 'ambiguous'; candidates: NavEntry[]; message: string };

/**
 * Resolver deterministik. Berjalan SEBELUM request AI (view memanggilnya di
 * submit) dan MURNI — tidak menavigasi, tidak mengubah state.
 *
 * Urutan: topik telanjang (klarifikasi, jangan dibajak) → slash → cara
 * membuka (saran, bukan auto-nav) → campuran info+perintah (saran + jawaban
 * singkat untuk AHSP) → pesan sangat panjang (saran, anti false-positive
 * dari teks dokumen tempelan) → perintah eksplisit (langsung) → nama
 * target telanjang (ambigu, pilihan chip) → bukan navigasi.
 */
export function resolveNavCommand(rawInput: string): NavResolution {
  const text = normalizeNavText(rawInput);
  if (!text) return { mode: 'none' };

  // Topik telanjang tetap milik kartu klarifikasi (aturan owner 2026-10-23).
  if (detectClarifyTopic(text)) return { mode: 'none' };

  // ---- Slash command ----
  if (text.startsWith('/')) {
    const token = text.split(' ')[0];
    const bySlash = NAV_ENTRIES.find((e) => e.slash === token);
    if (bySlash) return { mode: 'direct', entry: bySlash };
    if (LEGACY_SLASH.has(token)) return { mode: 'none' };
    const candidates = suggestSlash(token);
    return {
      mode: 'suggest',
      entry: candidates[0],
      message: `Perintah ${token} tidak dikenal. Mungkin maksudmu:`,
      candidates,
    };
  }

  const hasVerb = NAV_VERBS.test(text) || LEADING_KE.test(text);
  const aliasHits = findAliasMatch(text);

  // Remediasi Batch 1 (2026-10-28): pertanyaan prosedural "cara mengekspor
  // ke file" BUKAN permintaan navigasi — jangan diubah menjadi kartu
  // "Buka …" (itulah yang terjadi pada Q18). Kembalikan 'none' agar
  // routeIntent menjawab dengan langkah how-to deterministik. Perintah
  // navigasi ("cara membuka …") tetap ditangani cabang HOWTO di bawah,
  // karena ia tidak mengandung verba ekspor.
  const EXPORT_VERBS = /\b(mengekspor|mengekspor|ekspor|export|mengunduh|unduh|download)\b/;
  const FILE_FORMATS = /\b(excel|xlsx|pdf)\b/;
  if (EXPORT_VERBS.test(text) && FILE_FORMATS.test(text) && !NAV_VERBS.test(text)) {
    return { mode: 'none' };
  }

  // ---- "Bagaimana cara membuka X" / "di mana menu X" → saran, bukan auto-nav.
  if (HOWTO.test(text) && aliasHits.length > 0) {
    const entry = aliasHits[0].entry;
    return {
      mode: 'suggest',
      entry,
      message: `Berikut shortcut ke ${entry.label} — klik untuk membuka.`,
      candidates: [entry],
    };
  }

  // ---- Campuran: penjelasan + perintah ("jelaskan AHSP dan buka halaman AHSP").
  // Auto-navigasi akan menyembunyikan jawabannya (chat ter-unmount), jadi
  // kembalikan jawaban singkat + chip, bukan navigasi langsung.
  if (INFO_VERBS.test(text) && hasVerb && aliasHits.length > 0) {
    const entry = aliasHits[0].entry;
    if (entry.id === 'ahsp') {
      return {
        mode: 'suggest',
        entry,
        message: `${clarifyPickResult('ahsp:explain').message}\n\nKlik shortcut ini untuk membuka katalognya:`,
        candidates: [entry],
      };
    }
    return {
      mode: 'suggest',
      entry,
      message: `Berikut shortcut ke ${entry.label} — klik untuk membuka.`,
      candidates: [entry],
    };
  }

  // ---- Pesan sangat panjang (tempelan dokumen): jangan auto-navigasi dari
  // frasa yang kebetulan muncul di dalamnya; cukup tawarkan chip.
  if (text.length > 160 && hasVerb && aliasHits.length > 0) {
    const entry = aliasHits[0].entry;
    return {
      mode: 'suggest',
      entry,
      message: `Kutemukan perintah navigasi di pesanmu — klik shortcut ini untuk membuka ${entry.label}:`,
      candidates: [entry],
    };
  }

  // ---- Perintah eksplisit: submenu spesifik menang (alias terpanjang).
  if (hasVerb && aliasHits.length > 0) {
    const distinct = [...new Map(aliasHits.map((h) => [h.entry.id, h.entry])).values()];
    if (distinct.length === 1) {
      const entry = distinct[0];
      // F-06: kata kunci sisa untuk AHSP ("buka ahsp beton" → q=beton).
      // Hanya cabang eksplisit AHSP; slash /ahsp tanpa kata kunci tetap tanpa q.
      if (entry.id === 'ahsp') {
        const alias = aliasHits[0].alias;
        const rest = text
          .replace(new RegExp(`(?<!\\w)${escapeRegExp(alias)}(?!\\w)`, 'g'), ' ')
          .replace(new RegExp(NAV_VERBS.source, 'g'), ' ')
          .replace(LEADING_KE, ' ')
          .replace(/\b(menu|halaman|katalog)\b/g, ' ')
          // Tahun edisi katalog ("2026") bukan kata kunci isi — buang agar
          // "buka katalog ahsp 2026 beton" menjadi q=beton, bukan q="2026 beton".
          .replace(/\b(19|20)\d{2}\b/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (rest) return { mode: 'direct', entry, ahspQuery: rest };
      }
      return { mode: 'direct', entry };
    }
    // Satu frasa dipakai beberapa entry (mis. "rekapitulasi" untuk RAB & QTO)
    // → ambigu, jangan tebak.
    return {
      mode: 'ambiguous',
      candidates: distinct,
      message: 'Maksudmu yang mana? Pilih tujuannya:',
    };
  }

  // ---- Nama target telanjang tanpa kata kerja → pilihan, bukan auto-nav.
  // Khusus "proyek": tampilkan kelima filter sebagai pilihan.
  if (!hasVerb) {
    if (text === 'proyek') {
      const candidates = NAV_ENTRIES.filter((e) => e.category === 'Proyek');
      return { mode: 'ambiguous', candidates, message: 'Proyek yang mana? Pilih filternya:' };
    }
    const exact = NAV_ENTRIES.filter((e) =>
      e.aliases.some((a) => a === text) || e.label.toLowerCase() === text,
    );
    if (exact.length === 1) {
      return {
        mode: 'ambiguous',
        candidates: exact,
        message: `Mau membuka ${exact[0].label}?`,
      };
    }
    if (exact.length > 1) {
      return { mode: 'ambiguous', candidates: exact, message: 'Maksudmu yang mana? Pilih tujuannya:' };
    }
  }

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
