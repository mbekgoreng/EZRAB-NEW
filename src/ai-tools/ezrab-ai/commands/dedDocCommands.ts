/**
 * EZRAB Chat AI — Perintah deterministik DED & AI DOCUMENT (Kelompok 3,
 * 2026-11-17, matriks G #35–#36 + H #37–#38 audit perintah Ezrab AI).
 *
 * Modul mandiri (belum ter-wiring): koordinator menyambungkannya ke
 * - intentRouter.ts: tambahkan DED_DOC_PATTERNS ke PATTERNS (SEBELUM
 *   HELP — "tolong jalankan …" tertelan HELP bila pola ini di bawahnya;
 *   lihat WIRING SPEC di laporan kelompok ini), tambahkan kedua intent
 *   ke union ChatIntent.
 * - actionRegistry.ts: dua case executeIntent memanggil
 *   handleDedDocCommand(intent, param, ctx) — ctx registry HARUS
 *   diperluas dengan field gerbang + callback (lihat
 *   DedDocCommandContext).
 * - view.tsx (ezrab-ai): pasang field gerbang + callback
 *   requestDocSummary di ChatActionContext jalur submit.
 * - ded-ai-estimate/view.tsx + document-ai/view.tsx: SUDAH diubah
 *   kelompok ini (holder sinkron + konsumsi sinyal saat mount).
 *
 * Pola mengikuti konvensi yang ada: dicocokkan pada teks ternormalisasi
 * huruf kecil, tanpa flag /i; param diekstrak dari teks ASLI via
 * re-match case-insensitive (pola routeIntent).
 *
 * Fail-closed seperti RENAME_PROJECT: gerbang paket menolak / gerbang
 * tak diketahui / tanpa sesi / target tak ditemukan / target ambigu /
 * dokumen belum siap → pesan jujur, TIDAK ADA klaim sukses, TIDAK ADA
 * sinyal yang dipasang, TIDAK ADA navigasi (kecuali tombol yang
 * ditawarkan).
 *
 * KEJUJURAN — apa yang benar-benar bisa modul ini (temuan kode):
 * - DED: jalankan dari chat bisa untuk sesi yang PERNAH dimulai
 *   MAUPUN untuk DRAFT (berkas diunggah di menu DED tetapi tombol
 *   Jalankan belum ditekan — draft dipublikasikan DedAiInputView ke
 *   holder lewat onSessionChange, 2026-11-17). Mekanisme sama:
 *   sinyal autorun + pulihkan sesi dari holder + runAnalysis di view.
 *   Tanpa sesi apa pun di holder (belum pernah upload di halaman ini,
 *   berkas dihapus, atau sesudah reload), handler menjawab jujur
 *   "belum ada sesi" dan TIDAK memasang sinyal.
 * - AI DOCUMENT: ringkas headless BISA — DokumenAiService.chat hanya
 *   butuh {documentText, fileName, mode} dan teks dokumen tersedia di
 *   localStorage library. Eksekusinya ASYNC sehingga TIDAK di handler
 *   sinkron ini: handler memicu callback ctx.requestDocSummary milik
 *   view, dan view yang menampilkan hasilnya di chat sesudah selesai.
 *   Tanpa callback → handoff ke AI Document (dokumen dibuka di tab
 *   Ringkasan; pengguna menekan tombol analisis di sana).
 */
import type { ActionResult, ChatActionButton } from '../actionRegistry';
import {
  getActiveDocDescriptor,
  getDedSessionDescriptor,
  isDedRunFresh,
  readDocLibraryFromStorage,
  requestDedAutorun,
  requestDocAnalyzeHandoff,
  type ActiveDocDescriptor,
  type DedSessionDescriptor,
  type StoredDocRecord,
} from '../dedDocSessionHolder';

/** Intent yang dimiliki kelompok ini. */
export const DED_DOC_COMMAND_INTENTS: ReadonlySet<string> = new Set([
  'RUN_DED_ANALYSIS',
  'SUMMARIZE_DOCUMENT',
]);

export interface DedDocPattern {
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
 * Penempatan (koordinator): SELURUH blok ini ditempel di AWAL PATTERNS,
 * sesudah blok mutasi item RAB dan SEBELUM GREETING/HELP. Alasannya:
 * - Pola HELP menelan "tolong + kata kerja" ("tolong jalankan analisis
 *   ded", "tolong ringkas dokumen ini") bila tidak ada kata
 *   rab/proyek/ahsp — persis alasan blok mutasi ditempatkan di awal.
 * - Pola OPEN_DED_ESTIMATE / OPEN_AI_DOCUMENTS tidak beririsan: mereka
 *   menuntut verba navigasi (buka/tampilkan) yang tidak ada di pola ini.
 * - navRegistry TIDAK membajak perintah ini: NAV_VERBS tidak memuat
 *   jalankan/mulai/proses/ringkas/buat (navRegistry.ts), sehingga
 *   resolveNavCommand mengembalikan 'none' dan pesan sampai ke
 *   routeIntent (dibuktikan tes C chatDedDocCommands).
 *
 * Non-hijack yang dijaga pola ini:
 * - "buka ded ai" / "buka ai document" → tetap navigasi OPEN_* (tanpa
 *   verba jalankan/ringkas).
 * - "apa itu ded" / "jelaskan ded" → bukan perintah jalankan.
 * - "bagaimana cara menjalankan analisis ded" → pertanyaan how-to,
 *   BUKAN perintah: \bjalankan\b tidak cocok di dalam "menjalankan"
 *   (tanpa word boundary), dan pola analisis+ded menuntut kata
 *   pdf/dokumen/gambar/file sesudahnya.
 * - "buat dokumen perjanjian" → bukan ringkasan (menuntut kata
 *   ringkasan/resume atau verba ringkas/rangkum).
 * - "apa ringkasan dokumen ini" → pertanyaan, bukan perintah (pola
 *   frasa telanjang dijangkar awal + menolak kata "apa").
 */
export const DED_DOC_PATTERNS: DedDocPattern[] = [
  // RUN_DED_ANALYSIS — verba perintah + ded ("jalankan analisis ded",
  // "mulai ded", "proses pdf ded ini", "jalankan estimasi ded").
  { intent: 'RUN_DED_ANALYSIS', re: /\b(?:jalankan|jalankanlah|mulai|mulailah|proses|eksekusi|lakukan)\b.*\bded\b/ },
  // "analisis ded dari pdf ini" / "estimasi ded dokumen ini" (tanpa
  // verba perintah — frasa "dari pdf/dokumen" yang menandakan perintah).
  { intent: 'RUN_DED_ANALYSIS', re: /\b(?:analisis|analisa|estimasi)\b.*\bded\b.*\b(?:pdf|dokumen|gambar|file)\b/ },
  { intent: 'RUN_DED_ANALYSIS', re: /\b(?:analisis|analisa|estimasi)\b.*\b(?:pdf|dokumen|gambar|file)\b.*\bded\b/ },
  // "ded-nya jalankan" (objek dulu, verba kemudian).
  { intent: 'RUN_DED_ANALYSIS', re: /\bded\b.*\b(?:jalankan|jalankanlah|mulai|mulailah|proses|eksekusi)\b/ },
  // "ulangi analisis ded" / "analisis ulang ded".
  { intent: 'RUN_DED_ANALYSIS', re: /\b(?:ulangi|ulang|analisis ulang|analisa ulang)\b.*\bded\b/ },

  // SUMMARIZE_DOCUMENT — param grup 1 = ekor sesudah kata "dokumen"
  // ("ini" / nama dokumen / kosong). Handler membersihkannya lewat
  // cleanDocNameHint: kosong/"ini" → dokumen aktif; nama → resolusi
  // nama di library.
  { intent: 'SUMMARIZE_DOCUMENT', re: /\b(?:ringkas|ringkaskan|ringkasin|rangkum|rangkumkan|summarize)\b.*\bdokumen\b\s*(.+)?$/, paramGroup: true },
  { intent: 'SUMMARIZE_DOCUMENT', re: /\b(?:buat|buatkan|buatin|bikin)\b.*\b(?:ringkasan|resume)\b.*\bdokumen\b\s*(.+)?$/, paramGroup: true },
  // Frasa telanjang "ringkasan dokumen ini" (tanpa verba) — dijangkar
  // awal + menolak kata "apa" agar pertanyaan tidak terbajak.
  { intent: 'SUMMARIZE_DOCUMENT', re: /^\s*(?:tolong\s+)?(?!.*\bapa\b)(?:ringkasan|resume)\b.*\bdokumen\b\s*(.+)?$/, paramGroup: true },
];

/**
 * Konteks lokal kelompok ini — SENGAJA tidak mengimpor ChatActionContext
 * untuk signature handler (field gerbang + callback belum ada di sana;
 * koordinator menambahkannya ke ChatActionContext dan meneruskan ctx
 * yang sama). Handler TIDAK mengimpor view DED/doc atau ProjectContext
 * — semua akses sesi/dokumen lewat holder + callback ctx (pola rename).
 */
export interface DedDocCommandContext {
  /** Navigasi ke menu (WorkspaceView.setActiveMenu). */
  navigate: (menu: string) => void;
  /** Proyek aktif saat ini (null bila tidak ada). */
  activeProject: { id: string; name: string } | null;
  /** Semua proyek (untuk menyebut nama proyek target sesi DED). */
  projects?: Array<{ id: string; name: string }>;
  /**
   * Gerbang paket DED (WAJIB diisi view dari planAllowsAiFeature(plan,
   * 'ded-ai') — gerbang yang sama dengan DedAiInputView). undefined =
   * fail-closed: handler menolak dengan pesan "belum bisa memastikan"
   * (autorun melewati tombol Jalankan sehingga TIDAK BOLEH jalan tanpa
   * bukti gerbang lolos).
   */
  dedAiAvailable?: boolean;
  /** Pesan penolakan gerbang DED (aiFeatureLockedMessage). */
  dedAiLockedMessage?: string;
  /**
   * Gerbang paket AI Document (WAJIB diisi view dari
   * planAllowsAiFeature(plan, 'ai-document') — gerbang yang sama dengan
   * DocAnalyzer). undefined = fail-closed seperti DED.
   */
  docAiAvailable?: boolean;
  /** Pesan penolakan gerbang AI Document (aiFeatureLockedMessage). */
  docAiLockedMessage?: string;
  /**
   * Callback ASYNC ringkasan headless (diisi view; bila tidak ada,
   * handler memakai jalur handoff). View memanggil
   * dokumenAiService.chat({documentText, fileName, mode:'SUMMARY'})
   * dengan teks dari getDocFromLibrary(docId), mencatat kredit simulasi
   * seperti DocAnalyzer, lalu MENAMPILKAN hasilnya sebagai pesan chat
   * baru (sukses maupun gagal — lihat sketch di WIRING SPEC).
   * Handler TIDAK await callback ini (executeIntent sinkron) — pesan
   * balasan handler selalu "memproses…", tidak pernah mengklaim hasil.
   */
  requestDocSummary?: (docId: string, fileName: string) => void;
}

const navButton = (label: string, menu: string): ChatActionButton => ({
  label,
  action: { kind: 'navigate', menu },
});

const DED_NAV_BUTTON = (): ChatActionButton => navButton('Buka DED AI', 'ded-ai');
const DOC_NAV_BUTTON = (): ChatActionButton => navButton('Buka AI Document', 'dokumen-ai');

/** Daftar nama berkas untuk pesan ("A.pdf, B.pdf"). */
function fileList(names: string[]): string {
  return names.map((n) => `"${n}"`).join(', ');
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* Matcher lokal (cermin routeIntent untuk pola kelompok ini — tes)     */
/* ------------------------------------------------------------------ */

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Cocokkan teks mentah terhadap DED_DOC_PATTERNS dengan semantik yang
 * sama seperti routeIntent: deteksi pada teks ternormalisasi huruf
 * kecil; param diekstrak dari teks ASLI via re-match case-insensitive
 * (huruf besar/kecil nama dokumen terjaga). Dipakai tes; koordinator
 * memakai PATTERNS yang sama di routeIntent (bukan fungsi ini).
 */
export function matchDedDocPatterns(
  rawInput: string,
): { intent: string; param?: string } | null {
  const input = norm(rawInput);
  for (const p of DED_DOC_PATTERNS) {
    const m = input.match(p.re);
    if (!m) continue;
    let param: string | undefined;
    if (p.paramGroup) {
      const rawRe = new RegExp(p.re.source, 'i');
      const rawM = rawInput.match(rawRe);
      param = (rawM?.[1] ?? m[1] ?? '').trim() || undefined;
    }
    return { intent: p.intent, param };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Helper dokumen (diekspor untuk tes)                                 */
/* ------------------------------------------------------------------ */

/**
 * Bersihkan ekor param "dokumen …" menjadi petunjuk nama:
 * - "ini" / "ini dong" / kosong → '' (dokumen aktif).
 * - "kontrak ini" → 'kontrak' (buang penunjuk akhir).
 * - "Kontrak Kerja." → 'kontrak kerja' (huruf kecil + tanpa titik).
 * Sisa non-kosong adalah NAMA dokumen yang dicari di library.
 */
export function cleanDocNameHint(raw: string | undefined): string {
  let s = (raw ?? '').trim().toLowerCase();
  s = s.replace(/[.!\?…]+$/g, '').trim();
  s = s.replace(/^ini\b\s*/g, '').trim();
  s = s.replace(/\b(dong|ya|yah|tolong|please|plis)\b\s*$/g, '').trim();
  s = s.replace(/\s*\bini$/g, '').trim();
  return s;
}

export type DocNameResolution =
  | { kind: 'found'; doc: StoredDocRecord }
  | { kind: 'not-found' }
  | { kind: 'ambiguous'; matches: StoredDocRecord[] };

/**
 * Cari dokumen di library berdasarkan petunjuk nama (substring pada
 * nama berkas, tanpa memedulikan huruf besar/kecil dan ekstensi).
 * Kecocokan persis (nama dasar == petunjuk) menang atas substring.
 */
export function resolveDocByName(
  library: StoredDocRecord[],
  hint: string,
): DocNameResolution {
  const q = hint.toLowerCase().trim();
  if (!q) return { kind: 'not-found' };
  const baseOf = (name: string): string => name.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  const matches = library.filter((d) => {
    const name = d.fileName.toLowerCase();
    return name.includes(q) || baseOf(d.fileName).includes(q);
  });
  if (matches.length === 0) return { kind: 'not-found' };
  const exact = matches.filter(
    (d) => baseOf(d.fileName) === q || d.fileName.toLowerCase() === q,
  );
  if (exact.length === 1) return { kind: 'found', doc: exact[0] };
  if (matches.length === 1) return { kind: 'found', doc: matches[0] };
  return { kind: 'ambiguous', matches };
}

/** Label status dokumen untuk pesan pengguna. */
function docStatusLabel(status: ActiveDocDescriptor['status']): string {
  switch (status) {
    case 'processing': return 'masih diproses';
    case 'failed': return 'gagal diproses';
    case 'needs_review': return 'perlu ditinjau';
    default: return 'siap';
  }
}

/* ------------------------------------------------------------------ */
/* Handler utama                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tangani intent kelompok ini. Mengembalikan null bila intent bukan
 * milik kelompok ini (koordinator memanggil dari case executeIntent
 * setelah case lain tidak cocok — atau langsung dari case baru).
 */
export function handleDedDocCommand(
  intent: string,
  param: string | undefined,
  ctx: DedDocCommandContext,
): ActionResult | null {
  if (intent === 'RUN_DED_ANALYSIS') return handleRunDedAnalysis(ctx);
  if (intent === 'SUMMARIZE_DOCUMENT') return handleSummarizeDocument(param, ctx);
  return null;
}

/* ------------------------- DED ------------------------------------ */

function handleRunDedAnalysis(ctx: DedDocCommandContext): ActionResult {
  // 1. Gerbang paket — DED tertutup untuk Free (gerbang yang sama
  //    dengan tombol Jalankan di DedAiInputView). Tanpa bukti gerbang
  //    lolos, autorun TIDAK BOLEH dipasang (ia melewati tombol itu).
  if (ctx.dedAiAvailable === false) {
    return {
      ok: false,
      message:
        ctx.dedAiLockedMessage ??
        'DED AI tidak tersedia untuk paketmu. Fitur ini tersedia mulai paket Starter.',
      actions: [DED_NAV_BUTTON()],
    };
  }
  if (ctx.dedAiAvailable === undefined) {
    return {
      ok: false,
      message:
        'Saya belum bisa memastikan paketmu mengizinkan DED AI dari chat. Buka DED AI untuk menjalankan analisis langsung dari sana.',
      actions: [DED_NAV_BUTTON()],
    };
  }

  // 2. Sesi DED tersimpan (holder) — ada bila DRAFT (berkas diunggah di
  //    menu DED, belum ditekan Jalankan) atau sesi yang pernah dimulai
  //    (lihat header holder). Holder kosong = belum pernah ada unggahan
  //    di halaman ini / berkas dihapus / sesudah reload.
  const desc: DedSessionDescriptor | null = getDedSessionDescriptor();
  if (!desc || desc.fileCount === 0) {
    return {
      ok: true,
      message:
        'Belum ada sesi DED dengan berkas di halaman ini. Buka DED AI, upload PDF, lalu klik Jalankan Analisis — atau upload di sana lalu ulangi perintah ini dari chat.',
      actions: [DED_NAV_BUTTON()],
    };
  }

  // 3. Analisis masih berjalan — jangan menjalankan yang kedua.
  if (isDedRunFresh(desc)) {
    const since = desc.runningSince ? fmtTime(desc.runningSince) : '';
    return {
      ok: true,
      message:
        `Analisis DED untuk ${fileList(desc.fileNames)} masih berjalan` +
        (since ? ` (dimulai ${since})` : '') +
        '. Saya tidak menjalankan analisis kedua selagi yang pertama berjalan.',
      actions: [DED_NAV_BUTTON()],
    };
  }

  // 4. Sesi ditujukan ke proyek lain — sebutkan dengan jujur.
  if (desc.projectId && ctx.activeProject && desc.projectId !== ctx.activeProject.id) {
    const otherName =
      ctx.projects?.find((p) => p.id === desc.projectId)?.name ?? 'proyek lain';
    return {
      ok: true,
      message:
        `Sesi DED yang tersimpan (${fileList(desc.fileNames)}) ditujukan ke proyek "${otherName}" — bukan proyek aktif "${ctx.activeProject.name}". ` +
        'Buka DED AI untuk memeriksa sesi itu, atau mulai sesi baru dari menu DED untuk proyek ini.',
      actions: [DED_NAV_BUTTON()],
    };
  }

  // 5. Semua gerbang lolos: pasang sinyal autorun, lalu navigasi.
  //    DED view mengonsumsi sinyal saat mount, memulihkan sesi dari
  //    holder, dan menjalankan runAnalysis pada sesi itu.
  requestDedAutorun(desc.fingerprint, desc.projectId);
  ctx.navigate('ded-ai');
  return {
    ok: true,
    navigated: true,
    message:
      `Membuka DED AI dan menjalankan analisis untuk ${desc.fileCount} dokumen (${fileList(desc.fileNames)}) ` +
      'dengan pengaturan terakhir dari menu DED.',
  };
}

/* ------------------------- AI DOCUMENT ----------------------------- */

function handleSummarizeDocument(
  param: string | undefined,
  ctx: DedDocCommandContext,
): ActionResult {
  // 1. Gerbang paket — AI Document tertutup untuk Free & Starter
  //    (gerbang yang sama dengan DocAnalyzer.runMode).
  if (ctx.docAiAvailable === false) {
    return {
      ok: false,
      message:
        ctx.docAiLockedMessage ??
        'AI Document tidak tersedia untuk paketmu. Fitur ini tersedia mulai paket Professional.',
      actions: [DOC_NAV_BUTTON()],
    };
  }
  if (ctx.docAiAvailable === undefined) {
    return {
      ok: false,
      message:
        'Saya belum bisa memastikan paketmu mengizinkan AI Document dari chat. Buka AI Document untuk membuat ringkasan langsung dari sana.',
      actions: [DOC_NAV_BUTTON()],
    };
  }

  // 2. Tentukan dokumen target.
  const hint = cleanDocNameHint(param);
  const library = readDocLibraryFromStorage();
  let target: { id: string; fileName: string; status: ActiveDocDescriptor['status']; charCount: number } | null = null;

  if (hint) {
    // Nama disebut eksplisit → resolusi nama di library.
    const resolved = resolveDocByName(library, hint);
    if (resolved.kind === 'not-found') {
      return {
        ok: true,
        message: `Tidak menemukan dokumen bernama "${hint}" di library AI Document. Periksa namanya, atau buka dulu dokumennya di AI Document.`,
        actions: [DOC_NAV_BUTTON()],
      };
    }
    if (resolved.kind === 'ambiguous') {
      const names = resolved.matches.slice(0, 5).map((d) => `"${d.fileName}"`).join(', ');
      return {
        ok: true,
        message: `Ada beberapa dokumen yang cocok dengan "${hint}": ${names}. Sebutkan namanya lebih lengkap, atau buka dulu dokumennya di AI Document.`,
        actions: [DOC_NAV_BUTTON()],
      };
    }
    target = resolved.doc;
  } else {
    // "dokumen ini" → dokumen aktif; bila tidak ada yang aktif,
    // fallback ke satu-satunya dokumen di library (tak ambigu).
    const active = getActiveDocDescriptor();
    if (active) {
      target = active;
    } else if (library.length === 0) {
      return {
        ok: true,
        message:
          'Belum ada dokumen di AI Document. Upload dulu dokumennya di sana, lalu ulangi perintah ini.',
        actions: [DOC_NAV_BUTTON()],
      };
    } else if (library.length === 1) {
      target = library[0];
    } else {
      const names = library.slice(0, 5).map((d) => `"${d.fileName}"`).join(', ');
      return {
        ok: true,
        message:
          `Ada ${library.length} dokumen di library — buka dulu yang mau diringkas di AI Document, lalu ulangi perintahnya. ` +
          `Dokumen di library: ${names}.`,
        actions: [DOC_NAV_BUTTON()],
      };
    }
  }

  // 3. Status dokumen harus bisa dianalisis.
  if (target.status === 'processing') {
    return {
      ok: true,
      message: `Dokumen "${target.fileName}" ${docStatusLabel(target.status)} — tunggu sampai siap, lalu ulangi perintahnya.`,
      actions: [DOC_NAV_BUTTON()],
    };
  }
  if (target.status === 'failed') {
    return {
      ok: true,
      message: `Dokumen "${target.fileName}" ${docStatusLabel(target.status)} dan tidak punya teks yang bisa diringkas. Coba upload ulang di AI Document.`,
      actions: [DOC_NAV_BUTTON()],
    };
  }
  if (target.charCount === 0) {
    return {
      ok: true,
      message: `Dokumen "${target.fileName}" tidak punya teks yang bisa diringkas (mungkin hasil pindai tanpa teks). Coba dokumen lain.`,
      actions: [DOC_NAV_BUTTON()],
    };
  }

  // 4a. Jalur headless (utama): picu callback async view. Pesan SELALU
  //     "memproses…" — hasil (atau kegagalan) disampaikan view sebagai
  //     pesan chat baru; handler tidak pernah mengklaim hasil.
  if (ctx.requestDocSummary) {
    try {
      ctx.requestDocSummary(target.id, target.fileName);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'kesalahan tak dikenal';
      return {
        ok: false,
        message: `Ringkasan "${target.fileName}" gagal dimulai (${detail}). Coba lewat AI Document.`,
        actions: [DOC_NAV_BUTTON()],
      };
    }
    return {
      ok: true,
      message: `Memproses ringkasan "${target.fileName}" — hasilnya akan muncul di chat ini setelah selesai.`,
    };
  }

  // 4b. Fallback handoff (callback belum ter-wiring): navigasi +
  //     sinyal agar AI Document view membuka dokumen ini di tab
  //     Ringkasan. Jujur: ringkasan BELUM berjalan — pengguna menekan
  //     tombol analisis di sana.
  requestDocAnalyzeHandoff(target.id, target.fileName);
  ctx.navigate('dokumen-ai');
  return {
    ok: true,
    navigated: true,
    message:
      `Membuka AI Document dengan "${target.fileName}" di tab Ringkasan — ` +
      'klik tombol analisis di sana untuk membuat ringkasan.',
  };
}
