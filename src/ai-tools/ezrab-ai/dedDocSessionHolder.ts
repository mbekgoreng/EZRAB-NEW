/**
 * EZRAB Chat AI — Holder sesi DED & dokumen AI Document (Kelompok 3,
 * 2026-11-17, matriks G #35 + H #37 audit perintah Ezrab AI).
 *
 * Jembatan module-level SATU-SATUNYA antara Chat AI dan kedua view AI:
 * - DED view menulis sesi terakhirnya ke sini — draft layar input
 *   (DedAiInputView → onSessionChange → handleDedSessionChange) dan
 *   sesi berjalan (efek sinkronisasi di ded-ai-estimate/view.tsx);
 *   Chat AI membacanya untuk perintah "jalankan analisis DED", dan DED
 *   view mengonsumsi sinyal autorun saat mount untuk menjalankan
 *   analisis pada sesi yang dipulihkan.
 * - AI Document view menulis deskriptor dokumen aktif ke sini
 *   (document-ai/view.tsx); Chat AI membacanya untuk perintah
 *   "ringkas dokumen ini".
 *
 * KENAPA HOLDER MENYIMPAN OBJEK SESI DED UTUH (bukan hanya deskriptor):
 * WorkspaceView merender SATU cabang ternary per menu
 * (src/components/dashboard/WorkspaceView.tsx:721-737) — pindah menu
 * MENG-UNMOUNT view DED dan memusnahkan state sesinya, termasuk objek
 * File PDF yang diunggah (File tidak bisa dipersist ke localStorage).
 * Holder module-level adalah satu-satunya tempat berkas itu bertahan
 * melewati navigasi chat → DED. Sesi hilang saat reload halaman
 * (holder in-memory) — handler chat menjawab jujur "belum ada sesi"
 * dalam keadaan itu.
 *
 * BATAS KEJUJURAN (diperbarui 2026-11-17, perbaikan susulan draft):
 * holder berisi sesi TERAKHIR yang diketahui — DRAFT (berkas diunggah
 * di DedAiInputView tetapi tombol Jalankan belum ditekan, dipublikasikan
 * lewat prop onSessionChange → setDedSession) MAUPUN sesi yang pernah
 * dimulai (efek sinkronisasi di ded-ai-estimate/view.tsx). Draft
 * berbentuk DedAiSession yang sama (satu builder bersama di
 * dedSessionBuilder.ts) sehingga autorun memperlakukannya sebagai sesi
 * baru yang sah. Sesi hilang saat reload halaman (holder in-memory) —
 * handler chat menjawab jujur "belum ada sesi" dalam keadaan itu.
 * Kepemilikan tulisan: layar input → DedAiInputView (draft); layar
 * progress/result → efek sinkronisasi view (sesi berjalan). Efek
 * publish anak DILARANG menyentuh holder saat sinyal autorun tertunda
 * (cek peekDedAutorun — efek anak jalan sebelum efek induk saat mount).
 *
 * Modul ini MURNI TypeScript (tanpa React, tanpa impor view — sesi
 * disimpan opak sebagai DedSessionSnapshot; view mengembalikannya ke
 * tipenya sendiri lewat getDedSession<T>/consumeDedAutorun<T>).
 * Tidak ada panggilan jaringan; tidak ada akses gateway AI.
 */

/* ------------------------------------------------------------------ */
/* DED — sesi + sinyal autorun                                         */
/* ------------------------------------------------------------------ */

/** Bentuk minimal sesi DED yang dibaca holder (struktural — DedAiSession
 *  asli memiliki field ini ditambah field lain yang diteruskan opak). */
export interface DedSessionSnapshot {
  files: Array<{ file: { name: string; size: number }; id: string; error?: string }>;
  /** null = sesi tidak ditargetkan ke proyek existing. */
  targetProjectId: string | null;
  projectName: string;
}

/** Deskriptor ringan sesi DED untuk keputusan handler chat. */
export interface DedSessionDescriptor {
  projectId: string | null;
  projectName: string;
  fileNames: string[];
  fileCount: number;
  totalSize: number;
  /** Identitas berkas (nama + ukuran) — sinyal autorun hanya berlaku
   *  untuk sesi yang sidik jarinya sama persis. */
  fingerprint: string;
  /** true bila layar DED terakhir terlihat di 'progress' tanpa error
   *  (analisis sedang berjalan saat pengguna meninggalkan menu). */
  running: boolean;
  /** Epoch ms saat running pertama teramati true (null bila tidak running). */
  runningSince: number | null;
  updatedAt: number;
}

/** Sinyal sekali-pakai "jalankan analisis saat DED view mount". */
export interface DedAutorunSignal {
  fingerprint: string;
  projectId: string | null;
  requestedAt: number;
}

/** Sinyal autorun kedaluwarsa sesudah 60 detik (cermin entry aiNavigation). */
export const DED_AUTORUN_TTL_MS = 60_000;
/** Penanda "sedang berjalan" dianggap basi sesudah 15 menit tanpa
 *  pembaruan (view DED ter-unmount tidak bisa memperbaruinya; lari yang
 *  sudah selesai di latar tidak boleh memblokir jalankan-ulang selamanya). */
export const DED_RUNNING_STALE_MS = 15 * 60 * 1000;

let heldDedSession: DedSessionSnapshot | null = null;
let heldDedDescriptor: DedSessionDescriptor | null = null;
let dedAutorun: DedAutorunSignal | null = null;

/** Sidik jari berkas sesi: nama + ukuran per berkas, urutan dipertahankan. */
export function dedSessionFingerprint(
  files: DedSessionSnapshot['files'],
): string {
  return files.map((f) => `${f.file.name}:${f.file.size}`).join('|');
}

function buildDedDescriptor(
  session: DedSessionSnapshot,
  running: boolean,
  prev: DedSessionDescriptor | null,
  nowMs: number,
): DedSessionDescriptor {
  return {
    projectId: session.targetProjectId,
    projectName: session.projectName,
    fileNames: session.files.map((f) => f.file.name),
    fileCount: session.files.length,
    totalSize: session.files.reduce((a, f) => a + f.file.size, 0),
    fingerprint: dedSessionFingerprint(session.files),
    running,
    // runningSince dipertahankan selama running tetap true; di-nol-kan
    // saat running false (selesai/gagal/kembali ke input).
    runningSince: running ? (prev?.runningSince ?? nowMs) : null,
    updatedAt: nowMs,
  };
}

/**
 * Tulis sesi DED terakhir — dipanggil DED view lewat efek sinkronisasi
 * (sesi berjalan, pada setiap perubahan session/screen/error) dan lewat
 * handleDedSessionChange (draft layar input, running=false).
 * `running` = analisis sedang berjalan di view (screen 'progress' tanpa
 * error). Draft SELALU ditulis dengan running=false.
 */
export function setDedSession(
  session: DedSessionSnapshot | null,
  running: boolean,
  nowMs: number = Date.now(),
): void {
  if (!session) {
    heldDedSession = null;
    heldDedDescriptor = null;
    return;
  }
  heldDedSession = session;
  heldDedDescriptor = buildDedDescriptor(session, running, heldDedDescriptor, nowMs);
}

/** Deskriptor sesi DED terakhir (null bila belum pernah ada sesi). */
export function getDedSessionDescriptor(): DedSessionDescriptor | null {
  return heldDedDescriptor;
}

/**
 * Sesi DED utuh yang tersimpan (objek yang sama dengan yang ditulis
 * view — termasuk referensi File). Dipakai DED view untuk memulihkan
 * sesi saat mengonsumsi sinyal autorun. T = tipe sesi view pemanggil.
 */
export function getDedSession<T = DedSessionSnapshot>(): T | null {
  return (heldDedSession as unknown as T | null) ?? null;
}

/** Bebaskan sesi DED tersimpan (dipanggil DED view saat mount biasa
 *  tanpa sinyal — referensi File tidak perlu dipertahankan). */
export function clearDedSession(): void {
  heldDedSession = null;
  heldDedDescriptor = null;
}

/** true bila penanda running masih segar (bukan sisa lari lama yang
 *  sudah selesai/gagal di latar sesudah view ter-unmount). */
export function isDedRunFresh(
  desc: DedSessionDescriptor | null,
  nowMs: number = Date.now(),
): boolean {
  if (!desc || !desc.running || desc.runningSince === null) return false;
  return nowMs - desc.runningSince < DED_RUNNING_STALE_MS;
}

/** Pasang sinyal autorun (dipanggil handler chat sesudah semua gerbang
 *  lolos). Sinyal mengikat sidik jari sesi saat perintah diberikan. */
export function requestDedAutorun(
  fingerprint: string,
  projectId: string | null,
  nowMs: number = Date.now(),
): void {
  dedAutorun = { fingerprint, projectId, requestedAt: nowMs };
}

/** Intip sinyal autorun tanpa mengonsumsinya (untuk tes). */
export function peekDedAutorun(): DedAutorunSignal | null {
  return dedAutorun;
}

export type DedAutorunConsume<T = DedSessionSnapshot> =
  | { ok: true; session: T; descriptor: DedSessionDescriptor }
  | {
      ok: false;
      reason: 'none' | 'expired' | 'mismatch' | 'no-session' | 'no-files';
    };

/**
 * Konsumsi sinyal autorun (dipanggil DED view saat mount). Sekali-pakai:
 * sinyal dihapus pada KALI PERTAMA dipanggil dengan sinyal tersedia —
 * pemanggilan berikutnya mengembalikan 'none'. 'mismatch' berarti sesi
 * di holder berubah sejak perintah chat diberikan (berkas diganti) —
 * view TIDAK boleh menjalankan analisis pada sesi yang berbeda dari
 * yang diperintahkan.
 */
export function consumeDedAutorun<T = DedSessionSnapshot>(
  nowMs: number = Date.now(),
): DedAutorunConsume<T> {
  const signal = dedAutorun;
  if (!signal) return { ok: false, reason: 'none' };
  dedAutorun = null;
  if (nowMs - signal.requestedAt > DED_AUTORUN_TTL_MS) {
    return { ok: false, reason: 'expired' };
  }
  if (!heldDedSession || !heldDedDescriptor) {
    return { ok: false, reason: 'no-session' };
  }
  if (heldDedDescriptor.fingerprint !== signal.fingerprint) {
    return { ok: false, reason: 'mismatch' };
  }
  if (heldDedDescriptor.fileCount === 0) {
    return { ok: false, reason: 'no-files' };
  }
  return {
    ok: true,
    session: heldDedSession as unknown as T,
    descriptor: heldDedDescriptor,
  };
}

/* ------------------------------------------------------------------ */
/* AI DOCUMENT — dokumen aktif + handoff analisis + library            */
/* ------------------------------------------------------------------ */

/** Status dokumen — cermin DocStatus di document-ai/view.tsx. */
export type DocAiStatus = 'ready' | 'processing' | 'failed' | 'needs_review';

/** Deskriptor ringan dokumen aktif AI Document (tanpa teks — teks
 *  dibaca dari library localStorage saat eksekusi, agar tidak basi). */
export interface ActiveDocDescriptor {
  id: string;
  fileName: string;
  status: DocAiStatus;
  charCount: number;
  updatedAt: number;
}

/** Record dokumen dari library localStorage (bentuk DocRecord). */
export interface StoredDocRecord {
  id: string;
  fileName: string;
  kind: string;
  sizeBytes: number;
  text: string;
  pages?: number;
  sourcePages?: number;
  charCount: number;
  status: DocAiStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Kunci library dokumen — CERMINAN LS_DOCS ('ezrab_docai_library_v1')
 * di document-ai/view.tsx (konstanta itu tidak diekspor; bila kuncinya
 * berubah di sana, ubah juga di sini — lihat WIRING SPEC Kelompok 3).
 */
export const DOC_LIBRARY_STORAGE_KEY = 'ezrab_docai_library_v1';

let heldActiveDoc: ActiveDocDescriptor | null = null;

/** Tulis deskriptor dokumen aktif (dipanggil AI Document view lewat
 *  efek pada setiap perubahan activeDoc; null saat tidak ada dokumen
 *  aktif — mis. sesudah dokumen dihapus). */
export function setActiveDocDescriptor(doc: ActiveDocDescriptor | null): void {
  heldActiveDoc = doc;
}

/** Deskriptor dokumen aktif terakhir (null bila belum pernah dibuka
 *  dokumen di halaman ini — mis. sesudah reload). */
export function getActiveDocDescriptor(): ActiveDocDescriptor | null {
  return heldActiveDoc;
}

function readStorage(): Pick<Storage, 'getItem'> | null {
  try {
    const ls = (globalThis as { localStorage?: Pick<Storage, 'getItem'> }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

const DOC_STATUSES: readonly string[] = ['ready', 'processing', 'failed', 'needs_review'];

/**
 * Baca library dokumen dari localStorage (sumber yang sama dengan state
 * `docs` AI Document view — view menulis-balik setiap perubahan).
 * Aman di luar browser (tanpa localStorage → []) dan pada data rusak
 * (record tak valid dilewati, bukan crash). Dipakai handler chat untuk
 * resolusi nama dokumen + fallback satu-dokumen, dan dipakai callback
 * view untuk mengambil TEKS dokumen saat eksekusi headless.
 */
export function readDocLibraryFromStorage(): StoredDocRecord[] {
  const storage = readStorage();
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(DOC_LIBRARY_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: StoredDocRecord[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) continue;
    if (typeof r.fileName !== 'string' || !r.fileName) continue;
    if (typeof r.text !== 'string') continue;
    const status = typeof r.status === 'string' && DOC_STATUSES.includes(r.status)
      ? (r.status as DocAiStatus)
      : 'failed';
    out.push({
      id: r.id,
      fileName: r.fileName,
      kind: typeof r.kind === 'string' ? r.kind : 'unknown',
      sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : 0,
      text: r.text,
      pages: typeof r.pages === 'number' ? r.pages : undefined,
      sourcePages: typeof r.sourcePages === 'number' ? r.sourcePages : undefined,
      charCount: typeof r.charCount === 'number' ? r.charCount : r.text.length,
      status,
      error: typeof r.error === 'string' ? r.error : undefined,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
    });
  }
  return out;
}

/** Ambil satu dokumen dari library berdasarkan id (null bila tidak ada). */
export function getDocFromLibrary(docId: string): StoredDocRecord | null {
  return readDocLibraryFromStorage().find((d) => d.id === docId) ?? null;
}

/** Sinyal handoff sekali-pakai "buka dokumen ini di tab analisis". */
export interface DocAnalyzeHandoff {
  docId: string;
  fileName: string;
  tab: 'summary';
  requestedAt: number;
}

let docHandoff: DocAnalyzeHandoff | null = null;

/** Pasang sinyal handoff (dipanggil handler chat saat jalur headless
 *  tidak tersedia — view AI Document mengonsumsinya saat mount dan
 *  membuka dokumen itu di tab Ringkasan). */
export function requestDocAnalyzeHandoff(
  docId: string,
  fileName: string,
  nowMs: number = Date.now(),
): void {
  docHandoff = { docId, fileName, tab: 'summary', requestedAt: nowMs };
}

/** Intip sinyal handoff tanpa mengonsumsinya (untuk tes). */
export function peekDocAnalyzeHandoff(): DocAnalyzeHandoff | null {
  return docHandoff;
}

/**
 * Konsumsi sinyal handoff (dipanggil AI Document view saat mount).
 * Kedaluwarsa 60 detik seperti sinyal DED; sekali-pakai.
 */
export function consumeDocAnalyzeHandoff(
  nowMs: number = Date.now(),
): DocAnalyzeHandoff | null {
  const h = docHandoff;
  if (!h) return null;
  docHandoff = null;
  if (nowMs - h.requestedAt > DED_AUTORUN_TTL_MS) return null;
  return h;
}

/** Reset seluruh state holder (untuk tes). */
export function clearAllDedDocHolderState(): void {
  heldDedSession = null;
  heldDedDescriptor = null;
  dedAutorun = null;
  heldActiveDoc = null;
  docHandoff = null;
}
