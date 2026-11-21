/**
 * Document AI run store — generate + analisis yang BERTAHAN melewati
 * pindah menu (perintah owner 2026-11-21 04:19: proses yang belum
 * selesai tidak boleh ke-reset saat pindah menu).
 *
 * MEKANISME RESET YANG TERBUKTI (sebelum perbaikan ini):
 * WorkspaceView meng-unmount DokumenAiView sepenuhnya saat pindah menu.
 * Generate (DocCreator) dan analisis (DocAnalyzer) menyimpan state di
 * useState komponen dan TIDAK punya AbortSignal — promise-nya tetap
 * jalan, tetapi hasilnya ditulis ke setState komponen yang sudah
 * unmount (hilang). Lebih parah: draf hasil generate hanya sampai ke
 * localStorage lewat `useEffect(writeLS, [drafts])` di view.tsx —
 * efek itu tidak pernah jalan sesudah unmount, sehingga DRAF HILANG
 * TOTAL beserta entri riwayatnya.
 *
 * PERBAIKAN (dua lapis, pola yang sama dengan dedRunStore + Chat AI
 * executionRuntime):
 *  1. DURABILITAS LANGSUNG: persistensi hasil TIDAK LAGI bergantung
 *     pada state komponen yang ter-mount — `persistDraftDurable` dan
 *     `recordHistoryDurable` menulis LANGSUNG ke localStorage lewat
 *     draftStore/historyStore (store.ts). Saat komponen ter-mount,
 *     tulisan langsung ini koeksis aman dengan jalur prop+efek lama:
 *     draf di-upsert per id (konten identik), dan efek riwayat view
 *     menulis daftar state-nya (tanpa entri langsung — tanpa duplikat).
 *  2. RUNTIME LARI: status lari generate/analisis tinggal di modul ini
 *     (subscribe/notify). Komponen subscribe saat mount: lari yang
 *     masih berjalan di-attach ulang (tampil busy + progres), lari
 *     yang selesai saat user di menu lain hasilnya dimuat kembali
 *     (draf ke editor / hasil analisis ke modeResults). Unmount =
 *     unsubscribe saja. Lari yang selesai dikonsumsi sekali
 *     (consume*) agar tidak di-attach berulang.
 *
 * BATAS: runtime in-memory — refresh halaman penuh tetap me-reset
 * status lari (draf + riwayat di localStorage TETAP bertahan — itulah
 * gunanya lapis 1). Obrolan QA analyzer bersifat sementara (jawabannya
 * tersimpan di Riwayat lewat lapis 1, tetapi rangkaian chat tidak
 * di-attach ulang).
 *
 * Modul ini MURNI TypeScript (tanpa React, tanpa impor view/komponen).
 * Tidak ada panggilan jaringan; tidak ada akses gateway AI.
 */
import { draftStore, historyStore } from './store';
import type { DraftRecord, HistoryEntry } from './store';

export type DocAiGenerateKind = 'generate' | 'funnel' | 'translate';
export type DocAiRunStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface DocAiGenerateRun {
  requestId: number;
  kind: DocAiGenerateKind;
  status: DocAiRunStatus;
  docName: string;
  /** Id draf hasil (di localStorage) — null bila gagal/dibatalkan. */
  draftId: string | null;
  error: string | null;
  startedAt: number;
  updatedAt: number;
}

export interface DocAiAnalysisResult {
  reply: string;
  /** Objek coverage service (opaque di sini — dikembalikan apa adanya). */
  coverage: unknown;
  truncated: boolean;
}

export interface DocAiAnalysisRun {
  requestId: number;
  docId: string;
  fileName: string;
  /** Tab analisis ('summary' | 'extract' | 'checklist' | 'compare' | 'qa'). */
  tab: string;
  status: DocAiRunStatus;
  percent: number | null;
  statusText: string;
  result: DocAiAnalysisResult | null;
  error: string | null;
  startedAt: number;
  updatedAt: number;
}

export type DocAiGenerateListener = (run: DocAiGenerateRun | null) => void;
export type DocAiAnalysisListener = (run: DocAiAnalysisRun | null) => void;

let generateRun: DocAiGenerateRun | null = null;
let analysisRun: DocAiAnalysisRun | null = null;
let nextRequestId = 1;
const generateListeners = new Set<DocAiGenerateListener>();
const analysisListeners = new Set<DocAiAnalysisListener>();

const notifyGenerate = () => {
  for (const l of [...generateListeners]) {
    try { l(generateRun); } catch { /* satu listener gagal tidak boleh merusak lari */ }
  }
};
const notifyAnalysis = () => {
  for (const l of [...analysisListeners]) {
    try { l(analysisRun); } catch { /* satu listener gagal tidak boleh merusak lari */ }
  }
};

/* ------------------------------------------------------------------ */
/* Lapis 1 — durabilitas langsung (localStorage, tanpa komponen)       */
/* ------------------------------------------------------------------ */

/**
 * Tulis draf LANGSUNG ke localStorage — bertahan walau komponen sudah
 * unmount. Dipanggil berdampingan dengan onUpsertDraft (jalur
 * prop+efek lama tetap jalan saat ter-mount; upsert per id membuat
 * keduanya konvergen ke konten yang sama, tanpa duplikat).
 */
export const persistDraftDurable = (rec: DraftRecord): void => {
  draftStore.upsert(rec);
};

/**
 * Tulis entri riwayat LANGSUNG ke localStorage — bertahan walau
 * komponen sudah unmount. Dipanggil berdampingan dengan onAddHistory;
 * saat ter-mount, efek tulis-ulang view menimpa dengan daftar state
 * (tanpa entri langsung ini) sehingga tidak ada duplikat.
 */
export const recordHistoryDurable = (
  entry: Omit<HistoryEntry, 'id' | 'at'>,
): void => {
  historyStore.add(entry);
};

/** Baca draf hasil dari localStorage (untuk re-attach ke editor). */
export const readDraftDurable = (id: string): DraftRecord | undefined =>
  draftStore.get(id);

/* ------------------------------------------------------------------ */
/* Lapis 2 — runtime generate (DocCreator)                             */
/* ------------------------------------------------------------------ */

export const getDocAiGenerateRun = (): DocAiGenerateRun | null => generateRun;

export const isDocAiGenerateActive = (): boolean =>
  generateRun?.status === 'running';

export const startDocAiGenerate = (
  kind: DocAiGenerateKind,
  docName: string,
): DocAiGenerateRun => {
  const now = Date.now();
  generateRun = {
    requestId: nextRequestId++,
    kind,
    status: 'running',
    docName,
    draftId: null,
    error: null,
    startedAt: now,
    updatedAt: now,
  };
  notifyGenerate();
  return generateRun;
};

const patchGenerate = (
  requestId: number,
  patch: Partial<Omit<DocAiGenerateRun, 'requestId' | 'startedAt' | 'updatedAt'>>,
): boolean => {
  if (!generateRun || generateRun.requestId !== requestId) return false;
  if (generateRun.status === 'cancelled') return false;
  generateRun = { ...generateRun, ...patch, updatedAt: Date.now() };
  notifyGenerate();
  return true;
};

export const finishDocAiGenerate = (
  requestId: number,
  draftId: string,
): boolean => patchGenerate(requestId, { status: 'done', draftId });

export const failDocAiGenerate = (
  requestId: number,
  error: string,
): boolean => patchGenerate(requestId, { status: 'failed', error });

export const cancelDocAiGenerate = (requestId: number): boolean =>
  patchGenerate(requestId, { status: 'cancelled' });

/**
 * Konsumsi lari terminal (done/failed/cancelled) — dibaca sekali oleh
 * mount yang me-attach, lalu dibersihkan agar mount berikutnya tidak
 * mengulang attach yang sama. Mengembalikan lari yang dikonsumsi, atau
 * null bila tidak cocok / masih berjalan.
 */
export const consumeDocAiGenerateRun = (
  requestId: number,
): DocAiGenerateRun | null => {
  if (!generateRun || generateRun.requestId !== requestId) return null;
  if (generateRun.status === 'running') return null;
  const run = generateRun;
  generateRun = null;
  notifyGenerate();
  return run;
};

export const subscribeDocAiGenerate = (
  listener: DocAiGenerateListener,
): (() => void) => {
  generateListeners.add(listener);
  return () => { generateListeners.delete(listener); };
};

/* ------------------------------------------------------------------ */
/* Lapis 2 — runtime analisis (DocAnalyzer)                            */
/* ------------------------------------------------------------------ */

export const getDocAiAnalysisRun = (): DocAiAnalysisRun | null => analysisRun;

export const isDocAiAnalysisActive = (docId: string): boolean =>
  analysisRun?.status === 'running' && analysisRun.docId === docId;

export const startDocAiAnalysis = (
  docId: string,
  fileName: string,
  tab: string,
): DocAiAnalysisRun => {
  const now = Date.now();
  analysisRun = {
    requestId: nextRequestId++,
    docId,
    fileName,
    tab,
    status: 'running',
    percent: null,
    statusText: 'Menyiapkan analisis…',
    result: null,
    error: null,
    startedAt: now,
    updatedAt: now,
  };
  notifyAnalysis();
  return analysisRun;
};

const patchAnalysis = (
  requestId: number,
  patch: Partial<Omit<DocAiAnalysisRun, 'requestId' | 'startedAt' | 'updatedAt'>>,
): boolean => {
  if (!analysisRun || analysisRun.requestId !== requestId) return false;
  if (analysisRun.status === 'cancelled') return false;
  analysisRun = { ...analysisRun, ...patch, updatedAt: Date.now() };
  notifyAnalysis();
  return true;
};

export const patchDocAiAnalysisProgress = (
  requestId: number,
  percent: number | null,
  statusText: string,
): boolean => patchAnalysis(requestId, { percent, statusText });

export const finishDocAiAnalysis = (
  requestId: number,
  result: DocAiAnalysisResult,
): boolean => patchAnalysis(requestId, { status: 'done', result });

export const failDocAiAnalysis = (
  requestId: number,
  error: string,
): boolean => patchAnalysis(requestId, { status: 'failed', error });

export const cancelDocAiAnalysis = (requestId: number): boolean =>
  patchAnalysis(requestId, { status: 'cancelled' });

/** Konsumsi lari analisis terminal — pola yang sama dengan generate. */
export const consumeDocAiAnalysisRun = (
  requestId: number,
): DocAiAnalysisRun | null => {
  if (!analysisRun || analysisRun.requestId !== requestId) return null;
  if (analysisRun.status === 'running') return null;
  const run = analysisRun;
  analysisRun = null;
  notifyAnalysis();
  return run;
};

export const subscribeDocAiAnalysis = (
  listener: DocAiAnalysisListener,
): (() => void) => {
  analysisListeners.add(listener);
  return () => { analysisListeners.delete(listener); };
};

/** Reset runtime — HANYA UNTUK TES. */
export const __resetDocAiRunStore = (): void => {
  generateRun = null;
  analysisRun = null;
  nextRequestId = 1;
  generateListeners.clear();
  analysisListeners.clear();
};
