/**
 * DED run store — state lari DED yang BERTAHAN melewati pindah menu
 * (perintah owner 2026-11-21 04:19: proses yang belum selesai tidak
 * boleh ke-reset saat pindah menu).
 *
 * MEKANISME RESET YANG TERBUKTI (sebelum perbaikan ini):
 * WorkspaceView merender satu cabang ternary per menu + `<div
 * key={activeMenu}>` (src/components/dashboard/WorkspaceView.tsx:650)
 * sehingga pindah menu MENG-UNMOUNT DedAiEstimateView sepenuhnya.
 * View itu menyimpan SELURUH state lari di useState komponen (layar,
 * tahap, persen, hasil) DAN punya cleanup unmount yang membatalkan
 * lari (`useEffect(() => () => { cancelRef.current = true; }, [])`).
 * Akibatnya: lari dibatalkan di checkpoint berikutnya, hasil yang
 * sempat dihitung ditulis ke setState komponen yang sudah unmount
 * (hilang), dan kembali ke menu DED menampilkan layar input segar.
 *
 * PERBAIKAN: state lari tinggal di store module-level ini (satu-satunya
 * sumber kebenaran lari — preseden: dedDocSessionHolder.ts untuk sesi,
 * executionRuntime.ts untuk eksekusi Chat AI). Loop lari menulis ke
 * store, BUKAN ke setState komponen; komponen hanya MIRROR snapshot
 * lewat subscribe. Unmount = unsubscribe saja — lari terus berjalan,
 * dan mount kembali menghidrasi dari snapshot (progres terkini, atau
 * hasil bila lari sudah selesai saat user di menu lain).
 *
 * Pembatalan HANYA eksplisit (tombol Kembali/Batal di layar progress)
 * lewat cancelDedRun, atau supersede (lari baru dimulai — tulisan lari
 * lama ditolak penjaga runId).
 *
 * BATAS: store in-memory — refresh halaman penuh tetap me-reset lari
 * (File PDF tidak bisa dipersist ke localStorage). Draft input yang
 * BELUM dimulai bukan cakupan store ini (tetap di DedAiInputView +
 * dedDocSessionHolder).
 *
 * Modul ini MURNI TypeScript (tanpa React, tanpa impor view). Tidak ada
 * panggilan jaringan; tidak ada akses gateway AI.
 */
import type { DedAiStage, ProgressSummary } from './DedAiProgressView';
import type { DedAiOutput } from './types';
import type { FullAiOutput } from '../ded-full-ai/types';
import type { DedAiSession } from './DedAiInputView';
import type { DedRabAiMode } from './dedMode';

export type DedRunScreen = 'input' | 'progress' | 'result';
export type DedRunStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export interface DedRunError {
  message: string;
  errorCode?: string;
  stage?: string;
  retryable?: boolean;
}

/** Snapshot lengkap satu lari DED — persis state lari di view. */
export interface DedRunSnapshot {
  runId: number;
  status: DedRunStatus;
  screen: DedRunScreen;
  session: DedAiSession | null;
  runMode: DedRabAiMode;
  stages: DedAiStage[];
  percent: number;
  statusLine: string;
  summary: ProgressSummary;
  error: DedRunError | null;
  result: DedAiOutput | null;
  fullAiOutput: FullAiOutput | null;
  resultReady: boolean;
  draftSaved: boolean;
  finalized: boolean;
  startedAt: number;
  updatedAt: number;
}

/** Patch parsial — runId/startedAt/updatedAt dikelola store. */
export type DedRunPatch = Partial<
  Omit<DedRunSnapshot, 'runId' | 'startedAt' | 'updatedAt'>
>;

export type DedRunListener = (snap: DedRunSnapshot | null) => void;

let current: DedRunSnapshot | null = null;
let nextRunId = 1;
const listeners = new Set<DedRunListener>();

const notify = () => {
  for (const l of [...listeners]) {
    try {
      l(current);
    } catch {
      /* satu listener gagal tidak boleh merusak lari */
    }
  }
};

/** Snapshot lari terakhir (null = belum pernah ada lari). */
export const getDedRunSnapshot = (): DedRunSnapshot | null => current;

/** True bila ada lari yang sedang berjalan sekarang. */
export const isDedRunActive = (): boolean => current?.status === 'running';

/**
 * True bila lari runId SUDAH TIDAK BOLEH lanjut: dibatalkan eksplisit,
 * ATAU digantikan lari baru (supersede), ATAU tidak ada snapshot.
 * Loop lari memakai ini sebagai SATU-SATUNYA cek pembatalan — unmount
 * komponen TIDAK pernah membuatnya true.
 */
export const isDedRunCancelled = (runId: number): boolean => {
  if (!current) return true;
  if (current.runId !== runId) return true;
  return current.status === 'cancelled';
};

/**
 * Mulai lari baru: snapshot di-reset (layar progress, status running)
 * dengan runId baru. Lari lama — bila masih berjalan — otomatis
 * tersupersede: tulisannya ditolak patchDedRun dan cek
 * isDedRunCancelled-nya menjadi true.
 */
export const startDedRun = (init: {
  session: DedAiSession;
  runMode: DedRabAiMode;
  stages: DedAiStage[];
  percent: number;
  statusLine: string;
  summary: ProgressSummary;
}): DedRunSnapshot => {
  const now = Date.now();
  current = {
    runId: nextRunId++,
    status: 'running',
    screen: 'progress',
    session: init.session,
    runMode: init.runMode,
    stages: init.stages,
    percent: init.percent,
    statusLine: init.statusLine,
    summary: init.summary,
    error: null,
    result: null,
    fullAiOutput: null,
    resultReady: false,
    draftSaved: false,
    finalized: false,
    startedAt: now,
    updatedAt: now,
  };
  notify();
  return current;
};

/**
 * Tulis loop lari — DITOLAK bila runId bukan lari aktif (lari basi
 * sesudah supersede tidak boleh menimpa snapshot lari baru) ATAU lari
 * sudah dibatalkan (patch yang berpacu sesudah batal tidak boleh
 * menghidupkan kembali lari yang dibatalkan). Tulis sesudah 'done' /
 * 'failed' tetap diterima — setTimeout 900 mdtk yang memindah layar ke
 * 'result' jalan sesudah status 'done'. Mengembalikan false bila
 * ditolak.
 */
export const patchDedRun = (
  runId: number,
  patch: DedRunPatch,
): boolean => {
  if (!current || current.runId !== runId) return false;
  if (current.status === 'cancelled') return false;
  current = { ...current, ...patch, updatedAt: Date.now() };
  notify();
  return true;
};

/**
 * Tulis aksi UI saat komponen ter-mount (pindah layar, draftSaved,
 * finalized) — tanpa penjaga runId karena aksi selalu menargetkan lari
 * TERKINI. No-op bila belum ada snapshot (pemanggil tetap menulis state
 * lokalnya sendiri). Mengembalikan false bila tidak ada snapshot.
 */
export const publishDedRun = (patch: DedRunPatch): boolean => {
  if (!current) return false;
  current = { ...current, ...patch, updatedAt: Date.now() };
  notify();
  return true;
};

/**
 * Ganti snapshot secara utuh (load draft: hasil dari penyimpanan
 * ditampilkan sebagai layar hasil). runId baru ditetapkan store;
 * startedAt dibawa pemanggil.
 */
export const publishDedRunSnapshot = (
  snap: Omit<DedRunSnapshot, 'runId' | 'updatedAt'>,
): DedRunSnapshot => {
  current = { ...snap, runId: nextRunId++, updatedAt: Date.now() };
  notify();
  return current;
};

/**
 * Pembatalan eksplisit (tombol Kembali/Batal). Lari yang sedang
 * berjalan ditandai 'cancelled' + layar kembali ke 'input'; lari yang
 * sudah selesai/gagal hanya pindah layar (statusnya dipertahankan).
 * No-op bila runId bukan lari aktif. Mengembalikan false bila no-op.
 */
export const cancelDedRun = (runId: number): boolean => {
  if (!current || current.runId !== runId) return false;
  current = {
    ...current,
    status: current.status === 'running' ? 'cancelled' : current.status,
    screen: 'input',
    updatedAt: Date.now(),
  };
  notify();
  return true;
};

/**
 * Langganan snapshot. Cleanup = unsubscribe SAJA — berlangganan tidak
 * pernah meng-abort lari (pola executionRuntime Chat AI).
 */
export const subscribeDedRun = (listener: DedRunListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Reset store — HANYA UNTUK TES (mengosongkan snapshot + listener). */
export const __resetDedRunStore = (): void => {
  current = null;
  nextRunId = 1;
  listeners.clear();
};
