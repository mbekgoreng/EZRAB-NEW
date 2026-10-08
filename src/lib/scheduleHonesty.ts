/**
 * scheduleHonesty — logika murni untuk P0-B.
 *
 * Aturan: JANGAN menampilkan nilai fiktif sebagai fakta.
 * - Jadwal/Gantt/progres/durasi hanya dari data tersimpan (ScheduleTask).
 * - Tanpa data -> null/kosong -> UI menampilkan empty state jujur.
 * - Identitas perusahaan: tidak ada fallback nama/NPWP/telepon/kota contoh.
 *   Field kosong berarti kosong; lapisan tampilan memakai '-' (bukan nama palsu).
 */

import type { ScheduleTask } from '../types';

export interface GanttTask {
  id: number;
  wbs: string;
  name: string;
  duration: number; // hari
  start: string;
  end: string;
  startWeekIdx: number;
  weekSpan: number;
  weight: number;
  progress: number;
  status: 'Selesai' | 'On Progress' | 'Terlambat' | 'Pending';
  color: string;
}

/** Bangun task Gantt HANYA dari jadwal tersimpan. Kosong bila tanpa data. */
export function buildGanttTasks(
  scheduleTasks: ScheduleTask[] | null | undefined
): GanttTask[] {
  if (!scheduleTasks || scheduleTasks.length === 0) return [];
  return scheduleTasks.map((t, idx) => {
    const startWeek = Math.max(1, t.startWeek || 1);
    const endWeek = Math.max(startWeek, t.endWeek || startWeek);
    return {
      id: idx + 1,
      wbs: `${idx + 1}.0`,
      name: t.name,
      duration: Math.max(1, t.durationWeeks || endWeek - startWeek + 1) * 7,
      start: `W${startWeek}`,
      end: `W${endWeek}`,
      startWeekIdx: startWeek - 1,
      weekSpan: endWeek - startWeek + 1,
      weight: t.weightPercent || 0,
      progress: t.actualProgressPercent || 0,
      status:
        t.status === 'COMPLETED'
          ? 'Selesai'
          : t.status === 'ON_TRACK'
            ? 'On Progress'
            : t.status === 'DELAYED'
              ? 'Terlambat'
              : 'Pending',
      color: '#2563EB',
    } as GanttTask;
  });
}

/** Progres keseluruhan (rata-rata berbobot). null = tidak ada data valid. */
export function computeScheduleProgress(
  scheduleTasks: ScheduleTask[] | null | undefined
): number | null {
  if (!scheduleTasks || scheduleTasks.length === 0) return null;
  const totalW = scheduleTasks.reduce((s, t) => s + (t.weightPercent || 0), 0);
  if (totalW <= 0) return null;
  const wsum = scheduleTasks.reduce(
    (s, t) => s + (t.actualProgressPercent || 0) * (t.weightPercent || 0),
    0
  );
  return Math.round(wsum / totalW);
}

/** Label durasi dari jadwal nyata. null = belum dijadwalkan. */
export function formatScheduleDuration(
  scheduleTasks: ScheduleTask[] | null | undefined
): string | null {
  if (!scheduleTasks || scheduleTasks.length === 0) return null;
  const starts = scheduleTasks.map((t) => t.startWeek || 1);
  const ends = scheduleTasks.map((t) => t.endWeek || t.startWeek || 1);
  const weeks = Math.max(...ends) - Math.min(...starts) + 1;
  return `Total Durasi: ${weeks * 7} Hari Kalender (${weeks} Minggu)`;
}

export interface HonestCompanyInput {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxNumber?: string;
  directorName?: string;
  leadEstimatorName?: string;
}

export interface HonestCompany {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  directorName: string;
  leadEstimatorName: string;
}

/**
 * Normalisasi identitas perusahaan untuk dokumen resmi.
 * TIDAK PERNAH mengarang: field yang tidak diisi tetap string kosong.
 * Lapisan tampilan/export memakai '-' untuk field kosong.
 */
export function resolveHonestCompany(
  input: HonestCompanyInput | null | undefined
): HonestCompany {
  const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return {
    name: s(input?.name),
    address: s(input?.address),
    phone: s(input?.phone),
    email: s(input?.email),
    website: s(input?.website),
    taxNumber: s(input?.taxNumber),
    directorName: s(input?.directorName),
    leadEstimatorName: s(input?.leadEstimatorName),
  };
}

/** Nilai-nilai yang dilarang tampil sebagai fakta (dipakai test). */
export const FORBIDDEN_IDENTITY_MARKERS = [
  'EZRAB Construction',
  'EZRAB CONSTRUCTION MANAGEMENT',
  'PT. EZRAB KONSTRUKSI INDONESIA',
  'Jakarta, Indonesia',
  'Equity Tower',
  '+62 21 555-',
  '01.234.567.8-',
  '001/PNH-EZRAB/2026',
  'Ahmad Yusuf',
  'Ir. Hendra Kusuma',
  'PRJ-2026-001',
];
