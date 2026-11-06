/**
 * progressHistory — riwayat progres berkala (laporan mingguan) per proyek.
 *
 * LATAR: Kurva S standar membutuhkan seri REALISASI per periode. Model
 * data lama hanya menyimpan progres aktual TERKINI per tugas
 * (`ScheduleTask.actualProgressPercent`) — snapshot tanpa riwayat — jadi
 * kurva realisasi & deviasi tidak dapat dihitung secara jujur (lihat
 * lib/kurvaSHonesty). Modul ini menambahkan model riwayatnya:
 *
 * - Setiap "laporan mingguan" adalah snapshot: untuk SATU minggu, persen
 *   selesai aktual SELURUH tugas pada akhir minggu itu.
 * - Snapshot dicatat eksplisit oleh pengguna dari Tab Kurva S Laporan
 *   (tombol "Catat Progres") — tidak pernah disintesis diam-diam dari
 *   snapshot terkini, karena menyebar nilai hari ini ke minggu-minggu
 *   lalu adalah fabrikasi seri waktu.
 * - Seri realisasi dihitung murni dari snapshot tersimpan: minggu sebelum
 *   laporan pertama = belum dilaporkan (null), BUKAN 0 karangan.
 *
 * Penyimpanan mengikuti pola store per-proyek repo: satu kunci
 * localStorage `ezrab_prod_progress_history` berisi array datar dengan
 * projectId per entri, dibungkus envelope berversi.
 */

import type { KurvaSDataPoint, ScheduleTask } from '../types';

export interface ProgressHistoryEntry {
  projectId: string;
  taskId: string;
  /** Indeks minggu 1-based, sejajar KurvaSDataPoint.weekIndex. */
  weekIndex: number;
  /** Persen selesai aktual tugas (0..100) pada akhir minggu itu. */
  progressPercent: number;
  /** ISO timestamp pencatatan. */
  recordedAt: string;
}

const STORAGE_KEY = 'ezrab_prod_progress_history';

interface Envelope {
  v: 1;
  savedAt: string;
  data: ProgressHistoryEntry[];
}

function readAll(): ProgressHistoryEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Envelope;
    return Array.isArray(parsed?.data) ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeAll(entries: ProgressHistoryEntry[]): void {
  try {
    const env: Envelope = { v: 1, savedAt: new Date().toISOString(), data: entries };
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    /* penyimpanan tidak tersedia (mode privat dsb.) — pencatatan gagal
       secara senyap di lapisan simpan; pemanggil membaca ulang hasil. */
  }
}

const clampPercent = (v: number): number =>
  Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;

/** Seluruh entri riwayat milik satu proyek, terurut minggu lalu tugas. */
export function loadProgressHistory(projectId: string): ProgressHistoryEntry[] {
  if (!projectId) return [];
  return readAll()
    .filter((e) => e.projectId === projectId)
    .sort((a, b) => a.weekIndex - b.weekIndex || a.taskId.localeCompare(b.taskId));
}

/**
 * Catat snapshot laporan mingguan: persen aktual TERKINI seluruh tugas
 * dibekukan sebagai laporan akhir `weekIndex`. Mencatat ulang minggu yang
 * sama MENIMPA laporan minggu itu (koreksi laporan), bukan menduplikasi.
 * Mengembalikan riwayat proyek sesudah pencatatan.
 */
export function recordProgressSnapshot(
  projectId: string,
  tasks: readonly ScheduleTask[],
  weekIndex: number,
  now: Date = new Date()
): ProgressHistoryEntry[] {
  if (!projectId || tasks.length === 0 || !(weekIndex >= 1)) {
    return loadProgressHistory(projectId);
  }
  const recordedAt = now.toISOString();
  const fresh: ProgressHistoryEntry[] = tasks.map((t) => ({
    projectId,
    taskId: t.id,
    weekIndex,
    progressPercent: clampPercent(t.actualProgressPercent),
    recordedAt,
  }));
  const kept = readAll().filter(
    (e) => !(e.projectId === projectId && e.weekIndex === weekIndex)
  );
  writeAll([...kept, ...fresh]);
  return loadProgressHistory(projectId);
}

/** Hapus seluruh riwayat satu proyek (mis. proyek dihapus). */
export function clearProgressHistory(projectId: string): void {
  writeAll(readAll().filter((e) => e.projectId !== projectId));
}

export interface RealisasiPoint {
  actCum: number;
  actWeekly: number;
  dev: number;
}

/**
 * Hitung seri realisasi + deviasi per minggu dari snapshot tersimpan.
 *
 * - Mengembalikan null bila TIDAK ada snapshot sama sekali (seri belum
 *   dapat dihitung — pemanggil menampilkan status belum tersedia).
 * - Minggu sebelum minggu laporan pertama tidak ada di hasil (belum
 *   dilaporkan); pemanggil memperlakukannya sebagai null.
 * - Bobot memakai `ScheduleTask.weightPercent` — basis yang sama dengan
 *   distribusi rencana engine, jadi deviasi sebanding apel-ke-apel:
 *   actCum(w) = Σ bobot_i × progres_i(w) / 100, progres_i(w) adalah
 *   laporan terakhir tugas i pada atau sebelum minggu w.
 * - dev(w) = actCum(w) − planCum(w) (positif = di depan rencana).
 */
export function computeRealisasiSeries(
  tasks: readonly ScheduleTask[],
  points: readonly KurvaSDataPoint[],
  history: readonly ProgressHistoryEntry[]
): Map<number, RealisasiPoint> | null {
  if (history.length === 0 || tasks.length === 0 || points.length === 0) return null;

  const totalWeight = tasks.reduce((s, t) => s + (t.weightPercent || 0), 0);
  if (!(totalWeight > 0)) return null;

  const byTask = new Map<string, ProgressHistoryEntry[]>();
  for (const e of history) {
    const list = byTask.get(e.taskId) ?? [];
    list.push(e);
    byTask.set(e.taskId, list);
  }
  for (const list of byTask.values()) list.sort((a, b) => a.weekIndex - b.weekIndex);

  const firstWeek = Math.min(...history.map((e) => e.weekIndex));
  const progressAt = (taskId: string, week: number): number | null => {
    const list = byTask.get(taskId);
    if (!list) return null;
    let v: number | null = null;
    for (const e of list) {
      if (e.weekIndex <= week) v = e.progressPercent;
      else break;
    }
    return v;
  };

  const series = new Map<number, RealisasiPoint>();
  let prevActCum = 0;
  const ordered = [...points].sort((a, b) => a.weekIndex - b.weekIndex);
  for (const p of ordered) {
    if (p.weekIndex < firstWeek) continue;
    let actCum = 0;
    for (const t of tasks) {
      const prog = progressAt(t.id, p.weekIndex);
      actCum += ((t.weightPercent || 0) * (prog ?? 0)) / 100;
    }
    series.set(p.weekIndex, {
      actCum,
      actWeekly: actCum - prevActCum,
      dev: actCum - p.cumulativePlannedPercent,
    });
    prevActCum = actCum;
  }
  return series.size > 0 ? series : null;
}
