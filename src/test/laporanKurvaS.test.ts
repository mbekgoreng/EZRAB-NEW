/**
 * FASE 4 — AUDIT LAPORAN & EKSPOR: tes perilaku Kurva S jujur + klaim
 * jumlah sheet Excel terhadap workbook AKTUAL.
 *
 * Yang dipastikan:
 *  1. Kurva S Laporan (lib/kurvaSHonesty): tanpa tugas jadwal → TIDAK
 *     tersedia (tidak ada sintesis); dengan tugas + titik engine → kurva
 *     rencana diteruskan apa adanya dan seri realisasi/deviasi SELALU null
 *     (model data tidak menyimpan riwayat realisasi mingguan); bobot nol →
 *     tidak tersedia (NO_WEIGHTS).
 *  2. UnifiedProjectEngine.normalizeSections: proyek tanpa item nyata →
 *     [] (tidak ada lagi divisi/item karangan berharga VERIFIED dari
 *     fallback totalRab/konstanta); item nyata → hanya item itu.
 *  3. Klaim sheet Excel: workbook dihasilkan lewat jalur ekspor repo
 *     dengan opsi PERSIS seperti pemanggilan di LaporanView (flag legacy,
 *     tanpa preset) lalu dibaca ulang — jumlah & nama sheet harus cocok
 *     dengan klaim UI (16 sheet), dan label baseline sheet Kurva S harus
 *     menyatakan sumbernya dengan jujur (bukan "Baseline Terverifikasi").
 *
 * Jalankan: npx tsx src/test/laporanKurvaS.test.ts
 */

import ExcelJS from 'exceljs';
import { buildLaporanKurvaS } from '../lib/kurvaSHonesty';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import type { Company, KurvaSDataPoint, Project, ScheduleTask } from '../types';

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
    projectId: 'p1',
    name: 'Tugas',
    startWeek: 1,
    endWeek: 4,
    durationWeeks: 4,
    weightPercent: 100,
    actualProgressPercent: 0,
    status: 'NOT_STARTED',
    ...over,
  } as ScheduleTask;
}

function point(week: number, weekly: number, cum: number): KurvaSDataPoint {
  return {
    weekIndex: week,
    weekLabel: `M${week}`,
    startDate: '2026-09-01',
    endDate: '2026-09-07',
    plannedWeeklyPercent: weekly,
    cumulativePlannedPercent: cum,
    plannedWeeklyCost: 0,
    cumulativePlannedCost: 0,
  };
}

function sampleCompany(): Company {
  return {
    id: 'comp-1',
    name: 'PT Uji Kurva',
    address: '',
    phone: '',
    email: '',
    website: '',
    taxNumber: '',
    directorName: '',
    leadEstimatorName: '',
    defaultOverheadPercent: 5,
    defaultProfitPercent: 5,
    defaultContingencyPercent: 0,
    defaultTaxPercent: 11,
  } as Company;
}

function sampleProject(withTasks: boolean): Project {
  return {
    id: 'proj-kurva-1',
    projectNumber: 'PRJ-KURVA-001',
    name: 'Proyek Uji Kurva S',
    location: 'Jakarta',
    clientName: 'Klien Uji',
    status: 'draft',
    startDate: '2026-09-01',
    targetDate: '2026-11-30',
    sections: [
      {
        code: 'A',
        name: 'Pekerjaan Persiapan',
        items: [
          {
            id: 'i1',
            projectId: 'proj-kurva-1',
            code: 'A.1',
            description: 'Pembersihan lahan',
            volume: 100,
            unit: 'm2',
            unitPrice: 15000,
            amount: 1500000,
          },
        ],
      },
    ],
    rabItems: [],
    ...(withTasks
      ? {
          scheduleTasks: [
            {
              id: 'st1',
              projectId: 'proj-kurva-1',
              name: 'Persiapan',
              startWeek: 1,
              endWeek: 2,
              durationWeeks: 2,
              weightPercent: 100,
              actualProgressPercent: 0,
              status: 'NOT_STARTED',
            },
          ],
        }
      : {}),
  } as unknown as Project;
}

// Opsi PERSIS seperti pemanggilan exportProjectToExcel di LaporanView
// (flag legacy; tanpa preset, tanpa includeValidation/includeNotes).
const LAPORAN_EXCEL_OPTIONS = {
  includeCover: true,
  includeProjectIdentity: true,
  includeRekap: true,
  includeRABDetail: true,
  includeVolumeBackUp: true,
  includeLabor: true,
  includeMaterial: true,
  includeEquipment: true,
  includeAHSP: true,
  includeSchedule: true,
  includeKurvaS: true,
  includeCashflow: true,
} as const;

const EXPECTED_SHEETS = [
  '00_Validasi',
  '01_Cover',
  '02_Project_Info',
  '03_Estimate_Summary',
  '04_RAB_Recapitulation',
  '05_RAB_Detail',
  '06_BOQ',
  '07_BOQ_MC0',
  '08_AHSP',
  '09_Materials',
  '10_Labor',
  '11_Equipment',
  '12_Schedule',
  '13_Kurva_S',
  '14_Cashflow',
  '15_Notes',
];

async function main(): Promise<void> {
  console.log('\n[1] Kurva S jujur — ketidaktersediaan tanpa tugas jadwal:');
  const noTasks = buildLaporanKurvaS([point(1, 50, 50), point(2, 50, 100)], []);
  check('tanpa tugas → available=false', noTasks.available === false);
  check('tanpa tugas → reason NO_TASKS', noTasks.reason === 'NO_TASKS');
  check('tanpa tugas → weeks kosong (tidak ada kurva sintetis)', noTasks.weeks.length === 0);
  check('tanpa tugas → finalPlanCum null', noTasks.finalPlanCum === null);

  const noPoints = buildLaporanKurvaS([], [task({})]);
  check('tugas ada, titik engine kosong → NO_POINTS', noPoints.available === false && noPoints.reason === 'NO_POINTS');

  const noWeights = buildLaporanKurvaS([point(1, 0, 0), point(2, 0, 0)], [task({})]);
  check('bobot rencana nol → NO_WEIGHTS', noWeights.available === false && noWeights.reason === 'NO_WEIGHTS');

  console.log('\n[2] Kurva S jujur — rencana dari data nyata, realisasi tidak disintesis:');
  const pts = [point(1, 25, 25), point(2, 50, 75), point(3, 25, 100)];
  const ok = buildLaporanKurvaS(pts, [task({})]);
  check('tugas + titik valid → available', ok.available === true && ok.reason === null);
  check('jumlah minggu diteruskan apa adanya', ok.totalWeeks === 3 && ok.weeks.length === 3);
  check(
    'persen rencana diteruskan persis dari engine',
    ok.weeks.map((w) => w.planCum).join(',') === '25,75,100' &&
      ok.weeks.map((w) => w.planWeekly).join(',') === '25,50,25'
  );
  check('finalPlanCum = kumulatif minggu terakhir', ok.finalPlanCum === 100);
  check(
    'actWeekly/actCum/dev SELALU null (tidak ada seri realisasi karangan)',
    ok.weeks.every((w) => w.actWeekly === null && w.actCum === null && w.dev === null)
  );

  console.log('\n[3] normalizeSections — proyek kosong tidak lagi difabrikasi:');
  const emptySections = UnifiedProjectEngine.normalizeSections({
    id: 'proj-empty',
    name: 'Proyek Kosong',
    sections: [],
    rabItems: [],
    items: [],
  } as unknown as Project);
  check('proyek tanpa item → sections []', Array.isArray(emptySections) && emptySections.length === 0);

  const realSections = UnifiedProjectEngine.normalizeSections({
    id: 'proj-real',
    name: 'Proyek Berisi',
    sections: [],
    rabItems: [
      {
        id: 'r1',
        projectId: 'proj-real',
        category: 'Pekerjaan Tanah',
        description: 'Galian tanah',
        volume: 10,
        unit: 'm3',
        unitPrice: 50000,
        amount: 500000,
      },
    ],
    items: [],
  } as unknown as Project);
  check(
    'item nyata → tepat 1 seksi berisi item itu',
    realSections.length === 1 && realSections[0].items.length === 1 && realSections[0].items[0].description === 'Galian tanah'
  );

  console.log('\n[4] Klaim sheet Excel — workbook aktual dengan opsi LaporanView:');
  const blob = await exportRABToProfessionalExcel(sampleProject(false), sampleCompany(), { ...LAPORAN_EXCEL_OPTIONS } as any);
  check('ekspor mengembalikan Blob non-kosong', blob instanceof Blob && blob.size > 0, `size=${blob.size}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const names = wb.worksheets.map((ws) => ws.name);
  check(`jumlah sheet aktual = ${EXPECTED_SHEETS.length}`, names.length === EXPECTED_SHEETS.length, `aktual: ${names.join(', ')}`);
  check(
    'nama & urutan sheet cocok dengan klaim UI',
    JSON.stringify(names) === JSON.stringify(EXPECTED_SHEETS),
    `aktual: ${names.join(', ')}`
  );

  const kurvaSheet = wb.getWorksheet('13_Kurva_S');
  const a3 = String(kurvaSheet?.getCell('A3').value ?? '');
  check('sheet Kurva S: label baseline BUKAN "Terverifikasi"', !a3.includes('Terverifikasi'), `A3="${a3}"`);
  check(
    'sheet Kurva S: tanpa tugas jadwal → label estimasi jujur',
    a3.includes('Baseline estimasi dari distribusi bobot seksi RAB'),
    `A3="${a3}"`
  );

  const blob2 = await exportRABToProfessionalExcel(sampleProject(true), sampleCompany(), { ...LAPORAN_EXCEL_OPTIONS } as any);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(Buffer.from(await blob2.arrayBuffer()));
  const a3b = String(wb2.getWorksheet('13_Kurva_S')?.getCell('A3').value ?? '');
  check(
    'sheet Kurva S: dengan tugas jadwal → label sumber jadwal',
    a3b.includes('Baseline dari tugas jadwal tersimpan'),
    `A3="${a3b}"`
  );
  check('jumlah sheet konsisten pada varian bertugas', wb2.worksheets.length === EXPECTED_SHEETS.length);

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  }
  console.log('SEMUA TES LAPORAN KURVA S & SHEET EXCEL LOLOS');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
