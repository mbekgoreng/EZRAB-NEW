/**
 * EZRAB Chat AI — Perintah deterministik PROYEK (Kelompok 1, 2026-11-17,
 * matriks A #2–#5 + gap P12 audit perintah Ezrab AI).
 *
 * Modul mandiri (belum ter-wiring): koordinator menyambungkannya ke
 * - intentRouter.ts: tambahkan PROJECT_PATTERNS ke PATTERNS (SEBELUM
 *   OPEN_PROJECT_CREATE), tambahkan intent baru ke union ChatIntent,
 *   tambahkan 'DELETE_PROJECT' ke MUTATION_INTENTS, dan tambahkan
 *   cabang klarifikasi tanpa-param (lihat WIRING SPEC di laporan
 *   kelompok ini).
 * - actionRegistry.ts: tiap case executeIntent memanggil
 *   handleProjectCommand(intent, param, ctx) — ctx registry HARUS
 *   diperluas dengan keempat callback (lihat ProjectCommandContext).
 * - view.tsx: pasang keempat callback di ChatActionContext jalur
 *   submit + tambahkan cabang tombol DELETE_PROJECT_CONFIRM di
 *   handleActionButton (TIDAK ADA dispatch generik kind 'intent' —
 *   tanpa cabang itu tombol jatuh ke submit(label)).
 *
 * Pola mengikuti konvensi yang ada: dicocokkan pada teks ternormalisasi
 * huruf kecil, tanpa flag /i; param diekstrak dari teks ASLI via
 * re-match case-insensitive (pola routeIntent).
 *
 * Fail-closed seperti RENAME_PROJECT: tanpa proyek aktif / tanpa
 * callback / target tak ditemukan / target ambigu / nama tak valid →
 * pesan jujur, TIDAK ADA klaim sukses, TIDAK ADA mutasi.
 */
import type { ActionResult, ChatActionButton } from '../actionRegistry';

/** Batas nama proyek — sama seperti rename (actionRegistry RENAME_PROJECT). */
export const PROJECT_MAX_NAME_LENGTH = 120;

/** Intent yang dimiliki kelompok ini (DELETE_PROJECT_CONFIRM hanya tombol). */
export const PROJECT_COMMAND_INTENTS: ReadonlySet<string> = new Set([
  'CREATE_PROJECT',
  'DELETE_PROJECT',
  'DELETE_PROJECT_CONFIRM',
  'ARCHIVE_PROJECT',
  'DUPLICATE_PROJECT',
]);

export interface ProjectPattern {
  intent: string;
  re: RegExp;
  /** extract param via capture group 1 */
  paramGroup?: boolean;
  /** false = intent flows to AI instead of local execution (default true) */
  localOnly?: boolean;
}

/**
 * Pola router untuk teks ternormalisasi (huruf kecil, tanpa flag /i).
 *
 * Urutan vs pola yang sudah ada (koordinator yang menempel — lihat
 * wiring spec): SELURUH blok ini ditempel SEBELUM OPEN_PROJECT_CREATE
 * (intentRouter.ts:207). Alasannya:
 * - CREATE_PROJECT harus menang atas OPEN_PROJECT_CREATE untuk
 *   "buat proyek Rumah Baru" (mengandung kata "baru" — pola
 *   OPEN_PROJECT_CREATE ikut cocok).
 * - DELETE_PROJECT tidak perlu mendahului DELETE_ITEM: pola DELETE_ITEM
 *   sudah menjaga `(?!proyek\b)` ("hapus proyek ini" saat ini UNKNOWN,
 *   dibuktikan tes B6 chatItemMutations).
 * - CREATE_PROJECT tidak membajak CREATE_RAB_DIRECT: pola ini menuntut
 *   kata "proyek" sesudah kata kerja buat ("buatkan RAB rumah 2 lantai"
 *   tidak mengandung "proyek" sehingga tidak cocok).
 */
export const PROJECT_PATTERNS: ProjectPattern[] = [
  // CREATE_PROJECT — menuntut nama. "buat proyek" (tanpa nama) TIDAK
  // cocok (grup .+ wajib ada). "buat proyek baru" TIDAK cocok di sini:
  // lookahead (?!baru\s*$) memblokir param yang hanya "baru" sehingga
  // perintah itu jatuh ke OPEN_PROJECT_CREATE yang sudah ada (navigasi).
  // "(?:baru\s+)?" mengonsumsi kata sifat "baru" di depan nama
  // ("buat proyek baru Rumah Impian" → param "Rumah Impian").
  // TRADE-OFF yang disengaja: nama proyek yang diawali kata "Baru"
  // ("Baru Jaya") ikut terpotong menjadi "Jaya" — pesan konfirmasi
  // mengutip nama yang dibuat sehingga pengguna bisa mengoreksi.
  { intent: 'CREATE_PROJECT', re: /\b(?:buat|buatkan|bikin|bikinin|tambah)\b.*\bproyek\b\s+(?!baru\s*$)(?:baru\s+)?(.+)/, paramGroup: true },

  // DELETE_PROJECT — langkah 1 (minta konfirmasi dua tombol).
  // Dijangkar ke awal pesan (opsional "tolong") agar afirmasi bebas
  // ("ya, hapus proyek" — label tombol bila cabang view belum ada)
  // TIDAK memicu ulang langkah 1. "hapus semua proyek" TIDAK cocok:
  // sesudah "hapus" harus langsung kata "proyek" ("semua" menggagalkannya).
  // "hapus proyek semua" TETAP cocok (param "semua") — pertahanan
  // massalnya adalah gerbang MUTATION_INTENTS di router + penolakan
  // bulk di handler (resolveProjectTarget → 'bulk').
  { intent: 'DELETE_PROJECT', re: /^\s*(?:tolong\s+)?(?:hapus|hapuskan|delete|buang)\b\s+\bproyek\b\s+(.+)/, paramGroup: true },
  // Bentuk tanpa target → klarifikasi ("hapus proyek yang mana?").
  { intent: 'DELETE_PROJECT', re: /^\s*(?:tolong\s+)?(?:hapus|hapuskan|delete|buang)\b\s+\bproyek\b\s*$/ },

  // ARCHIVE_PROJECT — "arsipkan proyek ini" / "arsip proyek X" /
  // "pindahkan proyek X ke arsip".
  { intent: 'ARCHIVE_PROJECT', re: /^\s*(?:tolong\s+)?(?:arsipkan|arsip)\b\s+\bproyek\b\s+(.+)/, paramGroup: true },
  { intent: 'ARCHIVE_PROJECT', re: /^\s*(?:tolong\s+)?(?:pindahkan|pindah)\b.*\bproyek\b\s+(.+?)\s+\bke\b\s+\barsip\b/, paramGroup: true },
  { intent: 'ARCHIVE_PROJECT', re: /^\s*(?:tolong\s+)?(?:arsipkan|arsip)\b\s+\bproyek\b\s*$/ },

  // DUPLICATE_PROJECT — "duplikat proyek ini" / "gandakan proyek X" /
  // "salin proyek ini".
  { intent: 'DUPLICATE_PROJECT', re: /^\s*(?:tolong\s+)?(?:duplikat|duplikatkan|duplikasi|gandakan|salin|copy)\b\s+\bproyek\b\s+(.+)/, paramGroup: true },
  { intent: 'DUPLICATE_PROJECT', re: /^\s*(?:tolong\s+)?(?:duplikat|duplikatkan|duplikasi|gandakan|salin|copy)\b\s+\bproyek\b\s*$/ },

  // DELETE_PROJECT_CONFIRM TIDAK punya pola router: intent ini hanya
  // berasal dari tombol konfirmasi (param = id proyek), tidak pernah
  // dari teks pengguna — afirmasi teks ("ya", "ya hapus") tidak boleh
  // menghapus proyek.
];

/**
 * Konteks lokal kelompok ini — SENGAJA tidak mengimpor ChatActionContext
 * untuk signature handler (keempat callback belum ada di sana; koordinator
 * menambahkannya ke ChatActionContext dan meneruskan ctx yang sama).
 * Handler TIDAK mengimpor ProjectContext — semua aksi aplikasi lewat
 * callback ctx (pola renameProject).
 */
export interface ProjectCommandContext {
  activeProject: { id: string; name: string } | null;
  projects: Array<{ id: string; name: string }>;
  /** Navigasi ke menu (untuk perilaku "buat proyek baru" = OPEN_PROJECT_CREATE). */
  navigate?: (menu: string) => void;
  /** Membuat proyek baru; null bila gagal. */
  createProject?: (name: string) => { id: string; name: string } | null;
  /** Menghapus proyek; false bila proyek tidak ditemukan. */
  deleteProject?: (id: string) => boolean;
  /** Mengarsipkan proyek; false bila proyek tidak ditemukan. */
  archiveProject?: (id: string) => boolean;
  /** Menduplikat proyek; null bila proyek sumber tidak ditemukan. */
  duplicateProject?: (id: string) => { id: string; name: string } | null;
}

/** Pesan + navigasi persis case OPEN_PROJECT_CREATE (actionRegistry.ts:2444). */
const OPEN_PROJECT_CREATE_MESSAGE =
  'Membuka Daftar Proyek — klik "Proyek Baru" untuk membuat proyek.';

/* ------------------------------------------------------------------ */
/* Pencocokan pola (cermin routeIntent — untuk tes + dokumentasi)      */
/* ------------------------------------------------------------------ */

export interface ProjectPatternMatch {
  intent: string;
  param?: string;
}

/**
 * Jalankan PROJECT_PATTERNS pada satu pesan, meniru routeIntent:
 * deteksi pada teks ternormalisasi, param dari teks ASLI (huruf
 * besar/kecil terjaga). Mengembalikan null bila tidak ada pola yang
 * cocok. TIDAK menggantikan routeIntent — urutan terhadap pola lain
 * (DELETE_ITEM, OPEN_PROJECT_CREATE, CREATE_RAB_DIRECT) ditentukan
 * penempatan blok ini di PATTERNS oleh koordinator.
 */
export function matchProjectCommand(rawInput: string): ProjectPatternMatch | null {
  const input = rawInput.toLowerCase().trim().replace(/\s+/g, ' ');
  for (const p of PROJECT_PATTERNS) {
    const m = input.match(p.re);
    if (!m) continue;
    let param: string | undefined;
    if (p.paramGroup) {
      const rawRe = new RegExp(p.re.source, p.re.flags.includes('i') ? p.re.flags : `${p.re.flags}i`);
      const rawM = rawInput.match(rawRe);
      param = (rawM?.[1] ?? m[1] ?? '').trim() || undefined;
    }
    return { intent: p.intent, param };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Resolusi target proyek (dipakai hapus / arsip / duplikat)           */
/* ------------------------------------------------------------------ */

export type ProjectTargetResolution =
  | { kind: 'found'; project: { id: string; name: string } }
  | { kind: 'ambiguous'; name: string; candidates: Array<{ id: string; name: string }> }
  | { kind: 'not-found'; name: string }
  | { kind: 'no-active' }
  | { kind: 'need-target' }
  | { kind: 'bulk' };

/**
 * Bersihkan target dari param: pangkas spasi, buang tanda baca akhir
 * kalimat ("ini." → "ini"), buang satu partikel wacana akhir
 * ("ini dong/ya" → "ini"). TIDAK memotong isi nama selain itu.
 */
export function cleanProjectTarget(raw: string): string {
  let s = (raw ?? '').trim().replace(/[?.!…]+$/u, '').trim();
  s = s.replace(/\s+(dong|deh|nih|sih|kok|ya)$/i, '').trim();
  return s.replace(/\s+/g, ' ');
}

const BULK_WORD_RE = /\b(semua|seluruh|setiap)\b/i;

/**
 * Resolusi target proyek dari param:
 * - kosong → 'need-target' (tanya nama)
 * - mengandung kata massal (semua/seluruh/setiap) → 'bulk' (ditolak)
 * - "ini" / "yang ini" → proyek aktif ('no-active' bila tidak ada)
 * - nama: cocok persis (case-insensitive) dulu, lalu cocok sebagian
 *   yang unik; >1 kandidat → 'ambiguous' (maks 5 kandidat); 0 → 'not-found'.
 */
export function resolveProjectTarget(
  param: string | undefined,
  ctx: ProjectCommandContext,
): ProjectTargetResolution {
  const name = cleanProjectTarget(param ?? '');
  if (!name) return { kind: 'need-target' };
  if (BULK_WORD_RE.test(name)) return { kind: 'bulk' };
  const lower = name.toLowerCase();
  if (lower === 'ini' || lower === 'yang ini') {
    return ctx.activeProject
      ? { kind: 'found', project: ctx.activeProject }
      : { kind: 'no-active' };
  }
  const exact = ctx.projects.find((p) => p.name.toLowerCase() === lower);
  if (exact) return { kind: 'found', project: exact };
  const partial = ctx.projects.filter((p) => p.name.toLowerCase().includes(lower));
  if (partial.length === 1) return { kind: 'found', project: partial[0] };
  if (partial.length > 1) {
    return { kind: 'ambiguous', name, candidates: partial.slice(0, 5) };
  }
  return { kind: 'not-found', name };
}

/** Pesan kegagalan resolusi yang dipakai bersama hapus/arsip/duplikat. */
function resolutionFailureMessage(
  res: Extract<ProjectTargetResolution, { kind: 'need-target' | 'no-active' | 'not-found' | 'ambiguous' | 'bulk' }>,
  verb: string,
  example: string,
  bulkAction: string,
): ActionResult {
  switch (res.kind) {
    case 'need-target':
      return { ok: true, message: `${verb} proyek yang mana? Contoh: "${example}".` };
    case 'no-active':
      return {
        ok: true,
        message: `Tidak ada proyek aktif. Sebutkan nama proyeknya ("${example}") atau buka dulu proyeknya di Daftar Proyek.`,
      };
    case 'not-found':
      return {
        ok: false,
        message: `Proyek "${res.name}" tidak ditemukan di daftar proyek. Periksa namanya di Daftar Proyek, lalu ulangi perintahnya.`,
      };
    case 'ambiguous':
      return {
        ok: false,
        message: `Nama "${res.name}" cocok dengan beberapa proyek:\n${res.candidates.map((c) => `• ${c.name}`).join('\n')}\nSebutkan nama lengkapnya.`,
      };
    case 'bulk':
      return {
        ok: false,
        message: `Saya tidak bisa ${bulkAction} banyak proyek sekaligus dari chat. Lakukan satu per satu dari Daftar Proyek.`,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Tombol konfirmasi hapus                                             */
/* ------------------------------------------------------------------ */

/**
 * Dua tombol langkah 1 DELETE_PROJECT.
 * - "Ya, hapus proyek": kind 'intent', intent DELETE_PROJECT_CONFIRM,
 *   param = id proyek. PERHATIAN: view.tsx TIDAK punya dispatch generik
 *   kind 'intent' → koordinator WAJIB menambah cabang
 *   `btn.action.intent === 'DELETE_PROJECT_CONFIRM'` di
 *   handleActionButton (tanpa itu tombol jatuh ke submit(label)).
 * - "Batal": kind 'navigate' ke 'proyek'. TIDAK ADA pola batal generik
 *   di kode: 'revision-cancel' khusus pratinjau revisi (mengosongkan
 *   pendingRevisionRef — salah dipakai di sini), dan tidak ada intent
 *   batal. Navigasi ke daftar proyek membuktikan proyek masih ada.
 */
export function buildDeleteConfirmActions(projectId: string): ChatActionButton[] {
  return [
    { label: 'Ya, hapus proyek', action: { kind: 'intent', intent: 'DELETE_PROJECT_CONFIRM', param: projectId } },
    { label: 'Batal', action: { kind: 'navigate', menu: 'proyek' } },
  ];
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

function handleCreateProject(param: string | undefined, ctx: ProjectCommandContext): ActionResult {
  // Param berjalan sampai akhir pesan sehingga tanda baca akhir kalimat
  // (".", "?") hampir pasti pungtuasi, bukan nama — dipangkas di sini
  // (beda dari rename yang verbatim karena dibatasi kata "menjadi").
  const name = (param ?? '').trim().replace(/[?.!…]+$/u, '').trim();
  if (!name) {
    return { ok: true, message: 'Buat proyek dengan nama apa? Contoh: "buat proyek Rumah Impian".' };
  }
  // JEBAKAN: "buat proyek baru" — "baru" BUKAN nama. Pola router sudah
  // memblokirnya (lookahead) sehingga normalnya tidak sampai ke sini;
  // penjaga ini menahan pemanggilan langsung / variasi pola koordinator.
  // Perilaku = case OPEN_PROJECT_CREATE persis (navigasi + pesan sama).
  if (name.toLowerCase() === 'baru') {
    if (ctx.navigate) {
      ctx.navigate('proyek');
      return { ok: true, message: OPEN_PROJECT_CREATE_MESSAGE, navigated: true };
    }
    return { ok: true, message: 'Untuk membuat proyek baru, buka Daftar Proyek lalu klik "Proyek Baru".' };
  }
  if (name.length > PROJECT_MAX_NAME_LENGTH) {
    return {
      ok: false,
      message: `Nama proyek maksimal ${PROJECT_MAX_NAME_LENGTH} karakter — yang diminta ${name.length} karakter. Coba nama yang lebih pendek.`,
    };
  }
  if (!ctx.createProject) {
    return {
      ok: false,
      message: 'Saya belum bisa membuat proyek dari chat ini. Buat lewat Daftar Proyek (tombol "Proyek Baru").',
    };
  }
  const created = ctx.createProject(name);
  if (!created) {
    return {
      ok: false,
      message: `Proyek "${name}" belum dibuat — coba lagi dari Daftar Proyek.`,
    };
  }
  return {
    ok: true,
    message: `Proyek "${created.name}" dibuat (ID: ${created.id}). Buka di Daftar Proyek untuk mulai mengisi RAB-nya.`,
  };
}

function handleDeleteProjectStep1(param: string | undefined, ctx: ProjectCommandContext): ActionResult {
  const res = resolveProjectTarget(param, ctx);
  if (res.kind !== 'found') {
    return resolutionFailureMessage(res, 'Hapus', 'hapus proyek ini', 'menghapus');
  }
  // DUA LANGKAH: langkah 1 HANYA bertanya — tidak ada pemanggilan
  // deleteProject di sini. Daftar yang ikut terhapus diambil dari
  // cascade deleteProject (ProjectContext.tsx:1364).
  return {
    ok: true,
    message: `Yakin ingin menghapus proyek "${res.project.name}"?\n\nProyek beserta seluruh item RAB, QTO, dan jadwalnya akan ikut terhapus.\n\nTekan "Ya, hapus proyek" untuk melanjutkan, atau "Batal" bila tidak jadi.`,
    actions: buildDeleteConfirmActions(res.project.id),
  };
}

function handleDeleteProjectConfirm(param: string | undefined, ctx: ProjectCommandContext): ActionResult {
  const id = (param ?? '').trim();
  if (!id) {
    return {
      ok: false,
      message: 'Konfirmasi hapus tidak membawa id proyek — tidak ada yang dihapus. Ulangi perintah hapusnya bila masih diperlukan.',
    };
  }
  // Validasi ulang: proyek harus MASIH ADA di daftar (tombol pada pesan
  // lama / proyek sudah dihapus dari tempat lain → jawab jujur).
  const target = ctx.projects.find((p) => p.id === id);
  if (!target) {
    return {
      ok: false,
      message: 'Proyek yang dimaksud sudah tidak ada di daftar — mungkin sudah dihapus sebelumnya. Tidak ada yang berubah.',
    };
  }
  if (!ctx.deleteProject) {
    return {
      ok: false,
      message: 'Saya belum bisa menghapus proyek dari chat ini. Hapus lewat Daftar Proyek.',
    };
  }
  const deleted = ctx.deleteProject(id);
  if (!deleted) {
    return {
      ok: false,
      message: `Proyek "${target.name}" belum terhapus — proyek tidak ditemukan di daftar aktif. Coba pilih ulang proyeknya di Daftar Proyek, lalu ulangi perintahnya.`,
    };
  }
  return { ok: true, message: `Proyek "${target.name}" sudah dihapus.` };
}

function handleArchiveProject(param: string | undefined, ctx: ProjectCommandContext): ActionResult {
  const res = resolveProjectTarget(param, ctx);
  if (res.kind !== 'found') {
    return resolutionFailureMessage(res, 'Arsipkan', 'arsipkan proyek ini', 'mengarsipkan');
  }
  if (!ctx.archiveProject) {
    return {
      ok: false,
      message: 'Saya belum bisa mengarsipkan proyek dari chat ini. Arsipkan lewat Daftar Proyek (tab Selesai → Arsipkan).',
    };
  }
  const archived = ctx.archiveProject(res.project.id);
  if (!archived) {
    return {
      ok: false,
      message: `Proyek "${res.project.name}" belum diarsipkan — proyek tidak ditemukan di daftar aktif. Coba pilih ulang proyeknya di Daftar Proyek, lalu ulangi perintahnya.`,
    };
  }
  return {
    ok: true,
    message: `Proyek "${res.project.name}" sudah diarsipkan dan dipindahkan ke daftar arsip.`,
  };
}

function handleDuplicateProject(param: string | undefined, ctx: ProjectCommandContext): ActionResult {
  const res = resolveProjectTarget(param, ctx);
  if (res.kind !== 'found') {
    return resolutionFailureMessage(res, 'Duplikat', 'duplikat proyek ini', 'menduplikat');
  }
  if (!ctx.duplicateProject) {
    return {
      ok: false,
      message: 'Saya belum bisa menduplikat proyek dari chat ini. Duplikat lewat Daftar Proyek (tab Draft → Duplikat).',
    };
  }
  const copy = ctx.duplicateProject(res.project.id);
  if (!copy) {
    return {
      ok: false,
      message: `Proyek "${res.project.name}" belum diduplikat — proyek tidak ditemukan di daftar aktif. Coba pilih ulang proyeknya di Daftar Proyek, lalu ulangi perintahnya.`,
    };
  }
  return {
    ok: true,
    message: `Proyek "${copy.name}" dibuat sebagai duplikat dari "${res.project.name}" (ID: ${copy.id}).`,
  };
}

/**
 * Dispatcher kelompok 1. Mengembalikan null bila intent bukan milik
 * kelompok ini (koordinator meneruskan ke case lain / default).
 */
export function handleProjectCommand(
  intent: string,
  param: string | undefined,
  ctx: ProjectCommandContext,
): ActionResult | null {
  switch (intent) {
    case 'CREATE_PROJECT':
      return handleCreateProject(param, ctx);
    case 'DELETE_PROJECT':
      return handleDeleteProjectStep1(param, ctx);
    case 'DELETE_PROJECT_CONFIRM':
      return handleDeleteProjectConfirm(param, ctx);
    case 'ARCHIVE_PROJECT':
      return handleArchiveProject(param, ctx);
    case 'DUPLICATE_PROJECT':
      return handleDuplicateProject(param, ctx);
    default:
      return null;
  }
}
