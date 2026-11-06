/**
 * Test riwayat progres mingguan + seri realisasi/deviasi Kurva S
 * (perbaikan standar Kurva S, 2026-11-06).
 *
 * Cakupan: hitung seri dari snapshot (bobot sama dengan basis rencana),
 * minggu sebelum laporan pertama tetap null, snapshot menimpa per minggu
 * (koreksi laporan), tanpa riwayat seri tetap null (kejujuran lama), dan
 * integrasi buildLaporanKurvaS. Dijalankan via tsx (pola tes rumah repo).
 */
import {
  loadProgressHistory,
  recordProgressSnapshot,
  computeRealisasiSeries,
} from '../lib/progressHistory';
import type { ProgressHistoryEntry } from '../lib/progressHistory';
import { buildLaporanKurvaS } from '../lib/kurvaSHonesty';
import type { KurvaSDataPoint, ScheduleTask } from '../types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}`); }
}
const near = (a: number | null | undefined, b: number) =>
  typeof a === 'number' && Math.abs(a - b) < 1e-9;

/* localStorage stub (Node tidak punya localStorage). */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const tasks: ScheduleTask[] = [
  { id: 'A', projectId: 'P1', name: 'Pondasi', category: 'STRUKTUR', weightPercent: 60, startDate: '', endDate: '', startWeek: 1, endWeek: 2, durationWeeks: 2, actualProgressPercent: 50, status: 'ON_TRACK' },
  { id: 'B', projectId: 'P1', name: 'Dinding', category: 'ARSITEKTUR', weightPercent: 40, startDate: '', endDate: '', startWeek: 2, endWeek: 4, durationWeeks: 3, actualProgressPercent: 25, status: 'ON_TRACK' },
];
const points: KurvaSDataPoint[] = [10, 35, 70, 100].map((cum, i) => ({
  weekIndex: i + 1,
  weekLabel: `Minggu ${i + 1}`,
  startDate: '',
  endDate: '',
  plannedWeeklyPercent: [10, 25, 35, 30][i],
  cumulativePlannedPercent: cum,
  plannedWeeklyCost: 0,
  cumulativePlannedCost: 0,
}));

console.log('== Pencatatan snapshot ==');
check('riwayat awal kosong', loadProgressHistory('P1').length === 0);
recordProgressSnapshot('P1', tasks, 2, new Date('2026-11-02T00:00:00Z'));
let hist = loadProgressHistory('P1');
check('snapshot minggu 2 mencatat seluruh tugas', hist.length === 2 && hist.every((e) => e.weekIndex === 2));
check('nilai snapshot = progres aktual tugas', hist.find((e) => e.taskId === 'A')?.progressPercent === 50);
/* Koreksi laporan minggu yang sama menimpa, bukan duplikasi. */
const corrected = tasks.map((t) => t.id === 'A' ? { ...t, actualProgressPercent: 80 } : t);
recordProgressSnapshot('P1', corrected, 2, new Date('2026-11-03T00:00:00Z'));
hist = loadProgressHistory('P1');
check('catat ulang minggu sama = timpa (tetap 2 entri)', hist.length === 2);
check('nilai koreksi yang berlaku', hist.find((e) => e.taskId === 'A')?.progressPercent === 80);
/* Kembalikan ke nilai awal untuk hitungan seri di bawah. */
recordProgressSnapshot('P1', tasks, 2, new Date('2026-11-02T00:00:00Z'));
const done = tasks.map((t) => ({ ...t, actualProgressPercent: 100 }));
recordProgressSnapshot('P1', done, 4, new Date('2026-11-23T00:00:00Z'));
hist = loadProgressHistory('P1');
check('dua minggu laporan tersimpan', hist.length === 4);

console.log('== Seri realisasi & deviasi ==');
const series = computeRealisasiSeries(tasks, points, hist);
check('seri tersedia bila ada riwayat', series !== null);
check('minggu 1 (sebelum laporan pertama) tidak ada di seri', series?.has(1) === false);
check('actCum minggu 2 = 60×50% + 40×25% = 40', near(series?.get(2)?.actCum, 40));
check('deviasi minggu 2 = 40 − 35 = +5 (di depan rencana)', near(series?.get(2)?.dev, 5));
check('minggu 3 meneruskan laporan terakhir (carry-forward) = 40', near(series?.get(3)?.actCum, 40));
check('actWeekly minggu 3 = 0 (tidak ada kemajuan tercatat)', near(series?.get(3)?.actWeekly, 0));
check('actCum minggu 4 = 100 (semua tugas selesai)', near(series?.get(4)?.actCum, 100));
check('deviasi minggu 4 = 0', near(series?.get(4)?.dev, 0));
check('tanpa riwayat → seri null', computeRealisasiSeries(tasks, points, []) === null);
check('tanpa bobot → seri null', computeRealisasiSeries(tasks.map((t) => ({ ...t, weightPercent: 0 })), points, hist) === null);

console.log('== Integrasi buildLaporanKurvaS ==');
const withHist = buildLaporanKurvaS(points, tasks, hist);
check('hasActuals true', withHist.hasActuals === true);
check('minggu 1 actCum tetap null (belum dilaporkan)', withHist.weeks[0].actCum === null);
check('minggu 2 actCum 40 & dev +5', near(withHist.weeks[1].actCum, 40) && near(withHist.weeks[1].dev, 5));
check('finalDev dari minggu laporan terakhir = 0', near(withHist.finalDev, 0));
check('lastReportedWeek = 4', withHist.lastReportedWeek === 4);
const noHist = buildLaporanKurvaS(points, tasks);
check('tanpa riwayat: perilaku lama persis (actCum/dev null, hasActuals false)',
  noHist.weeks.every((w) => w.actCum === null && w.dev === null) && noHist.hasActuals === false && noHist.finalDev === null);
const emptyHist = buildLaporanKurvaS(points, tasks, [] as ProgressHistoryEntry[]);
check('riwayat kosong [] sama dengan tanpa riwayat', emptyHist.hasActuals === false);

console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
