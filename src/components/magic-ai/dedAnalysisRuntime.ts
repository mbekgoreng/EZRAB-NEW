/**
 * Runtime analisis DED (Magic AI) — module-level.
 *
 * Perintah owner 2026-11-21 04:19: proses yang belum selesai TIDAK BOLEH
 * ke-reset saat user pindah menu.
 *
 * Mekanisme reset yang terbukti: WorkspaceView me-render menu dengan
 * `<div key={activeMenu}>` sehingga pindah menu = UNMOUNT total
 * DedAnalysisDashboard; seluruh state lari (file terunggah, buffer,
 * progres, hasil) tinggal di useState komponen sehingga hilang, dan
 * `aiEstimatePipeline.execute` yang sedang berjalan menulis ke setState
 * komponen yang sudah ter-unmount (no-op) — hasilnya hilang. Lebih
 * parah: mount baru menganggap belum ada file lalu AUTO-LOAD dokumen
 * CONTOH, jadi user harus mengunggah ulang PDF-nya.
 *
 * Perbaikan: state lari diangkat ke runtime module-level ini. Dashboard
 * hanya MIRROR snapshot (subscribe + hidratasi awal); unmount =
 * unsubscribe saja. Pipeline menulis ke runtime, bukan ke setState,
 * sehingga lari terus berjalan dan hasilnya tetap ada saat kembali.
 *
 * Yang DIPERTAHANKAN: file terunggah + buffer (bahkan sebelum lari
 * dimulai), mode analisis, status/progres/stage/pesan, log eksekusi,
 * hasil analisis, dan status commit ke spreadsheet. Yang TIDAK
 * dipertahankan (UI sementara, reset saat remount itu wajar): filter/
 * pencarian/kategori, state edit item, pesan error file.
 *
 * Batasan jujur: runtime ini in-memory — refresh halaman penuh tetap
 * me-reset semuanya (file PDF tidak bisa disimpan ke localStorage).
 */
import type { AiEstimateOutput, AiEstimateAnalysisMode } from '../../ai-estimate';

export type DedAnalysisStatus = 'idle' | 'running' | 'done' | 'failed';

export interface DedAnalysisLogEntry {
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN';
  message: string;
  stage?: string;
}

export interface DedAnalysisSnapshot {
  requestId: number;
  status: DedAnalysisStatus;
  file: File | null;
  fileBuffer: ArrayBuffer | null;
  isSample: boolean;
  mode: AiEstimateAnalysisMode;
  progress: number;
  stageId: string;
  statusMessage: string;
  logs: DedAnalysisLogEntry[];
  result: AiEstimateOutput | null;
  startTime: number | null;
  error: string | null;
  committedSuccess: boolean;
  commitReport: { added: number; held: number } | null;
  startedAt: number;
  updatedAt: number;
}

export type DedAnalysisPatch = Partial<
  Omit<DedAnalysisSnapshot, 'requestId' | 'startedAt' | 'updatedAt'>
>;

const IDLE_STAGE = 'READING_DED';
const IDLE_MESSAGE = 'Menunggu analisis dimulai...';

let current: DedAnalysisSnapshot | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // Listener yang throw tidak boleh merusak runtime.
    }
  }
}

function makeIdleSnapshot(): DedAnalysisSnapshot {
  const now = Date.now();
  return {
    requestId: 0,
    status: 'idle',
    file: null,
    fileBuffer: null,
    isSample: false,
    mode: 'FAST',
    progress: 0,
    stageId: IDLE_STAGE,
    statusMessage: IDLE_MESSAGE,
    logs: [],
    result: null,
    startTime: null,
    error: null,
    committedSuccess: false,
    commitReport: null,
    startedAt: now,
    updatedAt: now,
  };
}

/** Snapshot terkini (null bila belum ada file/lari sama sekali). */
export function getDedAnalysisSnapshot(): DedAnalysisSnapshot | null {
  return current;
}

/** True bila ada lari yang sedang berjalan. */
export function isDedAnalysisRunning(): boolean {
  return current != null && current.status === 'running';
}

/**
 * Stage file (unggahan user / dokumen contoh) ke runtime TANPA memulai
 * lari — file yang sudah di-stage bertahan melewati pindah menu, dan
 * mount baru tidak lagi auto-load dokumen contoh.
 * Mereset hasil lari lama (file baru = hasil lama tidak berlaku) tapi
 * MEMPERTAHANKAN log + status commit, mengikuti perilaku dashboard
 * sebelumnya (handleFileChange hanya mengosongkan outputResult).
 */
export function stageDedAnalysisFile(
  file: File,
  buffer: ArrayBuffer,
  isSample: boolean,
): DedAnalysisSnapshot {
  const base = current ?? makeIdleSnapshot();
  const now = Date.now();
  current = {
    ...base,
    requestId: base.requestId,
    status: 'idle',
    file,
    fileBuffer: buffer,
    isSample,
    progress: 0,
    stageId: IDLE_STAGE,
    statusMessage: IDLE_MESSAGE,
    result: null,
    startTime: null,
    error: null,
    updatedAt: now,
  };
  notify();
  return current;
}

/** Mulai lari analisis baru — menggantikan lari sebelumnya. */
export function startDedAnalysisRun(init: {
  file: File;
  buffer: ArrayBuffer;
  isSample: boolean;
  mode: AiEstimateAnalysisMode;
}): DedAnalysisSnapshot {
  const now = Date.now();
  current = {
    requestId: ++seq,
    status: 'running',
    file: init.file,
    fileBuffer: init.buffer,
    isSample: init.isSample,
    mode: init.mode,
    progress: 5,
    stageId: 'READING_DED',
    statusMessage: 'Memulai pemrosesan dokumen DED...',
    // Log dikosongkan di awal lari, mengikuti perilaku dashboard
    // sebelumnya (setExecutionLogs([]) di awal runAnalysisPipeline).
    logs: [],
    result: null,
    startTime: now,
    error: null,
    committedSuccess: false,
    commitReport: null,
    startedAt: now,
    updatedAt: now,
  };
  notify();
  return current;
}

/**
 * Tulis patch ke lari yang sedang berjalan — DITOLAK bila requestId
 * tidak cocok dengan lari terkini (lari usang tidak boleh menimpa
 * lari baru) atau bila lari sudah tidak 'running'.
 */
export function patchDedAnalysisRun(
  requestId: number,
  patch: DedAnalysisPatch,
): boolean {
  if (current == null || current.requestId !== requestId) return false;
  if (current.status !== 'running') return false;
  current = { ...current, ...patch, updatedAt: Date.now() };
  notify();
  return true;
}

/**
 * Tulis patch tanpa kunci requestId — untuk aksi UI pada lari terkini
 * (commit ke spreadsheet). No-op bila belum ada snapshot.
 */
export function publishDedAnalysis(patch: DedAnalysisPatch): boolean {
  if (current == null) return false;
  current = { ...current, ...patch, updatedAt: Date.now() };
  notify();
  return true;
}

/** Tambah satu entri log ke lari terkini (no-op bila belum ada snapshot). */
export function appendDedAnalysisLog(entry: DedAnalysisLogEntry): void {
  if (current == null) return;
  current = {
    ...current,
    logs: [...current.logs, entry],
    updatedAt: Date.now(),
  };
  notify();
}

/** Subscribe perubahan snapshot. Mengembalikan fungsi unsubscribe. */
export function subscribeDedAnalysis(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: reset total runtime. */
export function __resetDedAnalysisRuntime(): void {
  current = null;
  seq = 0;
  listeners.clear();
}
