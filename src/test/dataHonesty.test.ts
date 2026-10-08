/**
 * P0-B REGRESSION TEST — tidak ada data fiktif yang menyamar sebagai fakta.
 *
 * Mencakup (master prompt):
 *  - empty state proyek tanpa jadwal/progres,
 *  - metadata dokumen ketika identitas belum lengkap,
 *  - identitas perusahaan tidak pernah berisi marker contoh/palsu,
 *  - persistensi data demo setelah penghapusan (tidak respawn).
 *
 * Jalankan: npx tsx src/test/dataHonesty.test.ts
 */

import {
  buildGanttTasks,
  computeScheduleProgress,
  formatScheduleDuration,
  resolveHonestCompany,
  FORBIDDEN_IDENTITY_MARKERS,
} from '../lib/scheduleHonesty';
import { resolveInitialProjects } from '../lib/demoSeed';
import type { ScheduleTask } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function task(over: Partial<ScheduleTask>): ScheduleTask {
  return {
    id: 't1',
    projectId: 'P1',
    name: 'Pekerjaan Contoh',
    category: 'Struktur',
    weightPercent: 50,
    startDate: '2026-01-01',
    endDate: '2026-01-28',
    startWeek: 1,
    endWeek: 4,
    durationWeeks: 4,
    actualProgressPercent: 50,
    status: 'ON_TRACK',
    ...over,
  } as ScheduleTask;
}

// ---------------------------------------------------------------------------
// 1. Empty state: tanpa data jadwal -> tidak ada angka karangan
// ---------------------------------------------------------------------------
console.log('\n[1] Proyek tanpa jadwal/progres:');
check('buildGanttTasks(null) -> []', buildGanttTasks(null).length === 0);
check('buildGanttTasks([]) -> []', buildGanttTasks([]).length === 0);
check('computeScheduleProgress(null) -> null', computeScheduleProgress(null) === null);
check('computeScheduleProgress([]) -> null', computeScheduleProgress([]) === null);
check('formatScheduleDuration(null) -> null', formatScheduleDuration(null) === null);
check('formatScheduleDuration([]) -> null', formatScheduleDuration([]) === null);

// ---------------------------------------------------------------------------
// 2. Data jadwal nyata -> Gantt/progres/durasi dihitung dengan benar
// ---------------------------------------------------------------------------
console.log('\n[2] Data jadwal nyata:');
const realTasks = [
  task({ id: 't1', name: 'Pondasi', startWeek: 1, endWeek: 2, durationWeeks: 2, weightPercent: 30, actualProgressPercent: 100, status: 'COMPLETED' }),
  task({ id: 't2', name: 'Dinding', startWeek: 3, endWeek: 6, durationWeeks: 4, weightPercent: 70, actualProgressPercent: 50, status: 'ON_TRACK' }),
];
const gantt = buildGanttTasks(realTasks);
check('Gantt memakai minggu nyata (W1-W2, W3-W6)', gantt[0].startWeekIdx === 0 && gantt[0].weekSpan === 2 && gantt[1].startWeekIdx === 2 && gantt[1].weekSpan === 4,
  JSON.stringify(gantt.map((g) => [g.startWeekIdx, g.weekSpan])));
check('Gantt TIDAK menaruh semua di minggu 1-2', !(gantt[0].startWeekIdx === 0 && gantt[1].startWeekIdx === 0));
check('Status dipetakan jujur (Selesai/On Progress)', gantt[0].status === 'Selesai' && gantt[1].status === 'On Progress');
const prog = computeScheduleProgress(realTasks);
// (30*100 + 70*50) / 100 = 65
check('Progres = rata-rata berbobot nyata (65%)', prog === 65, `dapat ${prog}`);
check('Durasi dari minggu nyata (6 minggu = 42 hari)', formatScheduleDuration(realTasks) === 'Total Durasi: 42 Hari Kalender (6 Minggu)',
  `${formatScheduleDuration(realTasks)}`);

// ---------------------------------------------------------------------------
// 3. Identitas perusahaan: tidak ada marker palsu
// ---------------------------------------------------------------------------
console.log('\n[3] Identitas dokumen:');
const emptyCompany = resolveHonestCompany(null);
const emptyValues = Object.values(emptyCompany).join(' | ');
const hasForbiddenEmpty = FORBIDDEN_IDENTITY_MARKERS.some((m) => emptyValues.includes(m));
check('Identitas kosong -> tidak ada marker palsu', !hasForbiddenEmpty, emptyValues);
check('Semua field kosong (bukan nama contoh)', Object.values(emptyCompany).every((v) => v === ''));

const partialCompany = resolveHonestCompany({ name: 'PT Maju Jaya Abadi', taxNumber: '12.345.678.9-012.345' });
check('Data nyata dipertahankan', partialCompany.name === 'PT Maju Jaya Abadi' && partialCompany.taxNumber === '12.345.678.9-012.345');
check('Field tak diisi tetap kosong', partialCompany.address === '' && partialCompany.phone === '');
const partialValues = Object.values(partialCompany).join(' | ');
check('Data nyata + kosong -> tidak ada marker palsu',
  !FORBIDDEN_IDENTITY_MARKERS.some((m) => partialValues.includes(m)));

// ---------------------------------------------------------------------------
// 4. Demo tidak respawn setelah dihapus
// ---------------------------------------------------------------------------
console.log('\n[4] Persistensi demo:');
interface P { id: string; name: string }
const defaults: P[] = [{ id: 'demo-1', name: 'Demo A' }, { id: 'demo-2', name: 'Demo B' }];

// Instalasi pertama: belum ada simpanan -> seed default + tandai
const first = resolveInitialProjects(null, false, defaults);
check('Instalasi pertama -> seed default', first.projects.length === 2 && first.shouldMarkSeeded === true);

// Pengguna menghapus SEMUA proyek demo -> tetap kosong, tidak respawn
const afterDeleteAll = resolveInitialProjects('[]', true, defaults);
check('Setelah hapus semua + flag seed -> tetap [] (tidak respawn)', afterDeleteAll.projects.length === 0);

// Pengguna menyimpan proyek nyata -> dihormati
const real: P[] = [{ id: 'real-9', name: 'Proyek Nyata User' }];
const withReal = resolveInitialProjects(JSON.stringify(real), true, defaults);
check('Proyek nyata dipertahankan utuh', withReal.projects.length === 1 && withReal.projects[0].id === 'real-9');

// Pengguna lama (belum ada flag) dengan data sendiri -> data dipertahankan + flag ditandai
const legacy = resolveInitialProjects(JSON.stringify(real), false, defaults);
check('Data pengguna lama tidak ditimpa default', legacy.projects.length === 1 && legacy.projects[0].id === 'real-9'
  && legacy.shouldMarkSeeded === true);

// JSON rusak + sudah seed -> aman (kosong, bukan default)
const corrupt = resolveInitialProjects('{{{', true, defaults);
check('JSON rusak (sudah seed) -> [] aman', corrupt.projects.length === 0);

// ---------------------------------------------------------------------------
console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(' | '));
  process.exit(1);
} else {
  console.log('SEMUA TEST P0-B LOLOS');
}
