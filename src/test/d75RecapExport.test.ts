/**
 * D-75 (Batch F, P3) — "Ekspor Rekap" membuka modal paket lengkap
 * 15 sheet (selalu COMPLETE_PACKAGE; tidak ada prop preset).
 *
 * Perbaikan: preset RECAP_ONLY yang asli (Ringkasan Eksekutif +
 * Rekapitulasi RAB, 2 lembar) + prop `initialPreset` pada modal +
 * tombol "Ekspor Rekap" desktop membukanya dengan preset itu.
 * Lembar Rekap mandiri: rumus lintas sheet ke 05_RAB_Detail hanya
 * ditulis bila Detail ikut dipilih, jadi workbook 2 lembar tetap
 * valid dengan nilai statis + formula internal.
 *
 * Tes ini menghasilkan workbook NYATA lewat mesin ekspor dan membaca
 * kembali isinya (pola exportPriceIntegrity.test.ts).
 *
 * Jalankan: npx tsx src/test/d75RecapExport.test.ts
 */
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import {
  EXPORT_PRESETS,
  ALL_EXPORT_SHEETS,
  type ExportSheetKey,
} from '../export/types';
import { generateExportFileName } from '../export/exportDesignSystem';
import {
  PREMIUM_DEMO_PROJECT,
  PREMIUM_DEMO_RAB_ITEMS,
} from '../data/premiumDemoData';
import type { Project, Company } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function contains(haystack: string, needle: string, msg: string): void {
  check(msg, haystack.includes(needle), `tidak ditemukan: ${JSON.stringify(needle)}`);
}

const DEMO_GRAND = 1089879733;

function company(): Company {
  return {
    id: 'comp-1', name: 'PT Uji Ekspor', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: '',
    defaultOverheadPercent: 5, defaultProfitPercent: 5,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

function demoProject(): Project {
  // PREMIUM_DEMO_PROJECT punya sections: [] sehingga normalizeSections
  // membangun seksi dari rabItems (jalur yang sama dengan aplikasi).
  return { ...PREMIUM_DEMO_PROJECT, rabItems: PREMIUM_DEMO_RAB_ITEMS } as unknown as Project;
}

/** Lembar gaya modal: semua kunci false kecuali yang ada di preset. */
function modalStyleSheets(presetId: 'RECAP_ONLY' | 'COMPLETE_PACKAGE'): Record<ExportSheetKey, boolean> {
  const preset = EXPORT_PRESETS[presetId];
  const out = {} as Record<ExportSheetKey, boolean>;
  ALL_EXPORT_SHEETS.forEach((s) => {
    out[s.key] = preset.sheets.includes(s.key);
  });
  return out;
}

async function exportWorkbook(
  options: Record<string, unknown>,
): Promise<ExcelJS.Workbook> {
  const blob = await exportRABToProfessionalExcel(demoProject(), company(), options as any);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  return wb;
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v: any = cell.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result;
  return null;
}

/** Cari baris yang labelnya mengandung teks, kembalikan nilai numerik pertama di baris itu. */
function findLabeledValue(ws: ExcelJS.Worksheet, labelPart: string): number | null {
  let found: number | null = null;
  ws.eachRow((row) => {
    let hasLabel = false;
    row.eachCell((cell) => {
      if (String(cell.value ?? '').includes(labelPart)) hasLabel = true;
    });
    if (hasLabel) {
      row.eachCell((cell) => {
        const n = cellNum(cell);
        if (n !== null && found === null) found = n;
      });
    }
  });
  return found;
}

async function main(): Promise<void> {
  console.log('D-75 — Preset RECAP_ONLY yang asli:');

  console.log('\n[1] Definisi preset:');
  eq('RECAP_ONLY berisi persis 2 lembar', JSON.stringify(EXPORT_PRESETS.RECAP_ONLY.sheets), JSON.stringify(['estimateSummary', 'rabRecap']));
  check('nama berkas memakai awalan REKAP', generateExportFileName('RECAP_ONLY', 'Proyek Uji', 'Rev00', '2026-11-14').startsWith('EZRAB_REKAP_'), generateExportFileName('RECAP_ONLY', 'Proyek Uji', 'Rev00', '2026-11-14'));

  console.log('\n[2] Workbook RECAP_ONLY (opsi preset saja):');
  const wbPreset = await exportWorkbook({ preset: 'RECAP_ONLY' });
  const namesPreset = wbPreset.worksheets.map((w) => w.name);
  eq('tepat 2 lembar', JSON.stringify(namesPreset), JSON.stringify(['03_Estimate_Summary', '04_RAB_Recapitulation']));
  const recapPreset = wbPreset.getWorksheet('04_RAB_Recapitulation')!;
  eq(
    'grand total rekap = total emas demo',
    findLabeledValue(recapPreset, 'TOTAL ESTIMASI ANGGARAN BIAYA (GRAND TOTAL)'),
    DEMO_GRAND,
  );
  const summaryPreset = wbPreset.getWorksheet('03_Estimate_Summary')!;
  // Grand total ringkasan adalah kartu metrik ke-4: label E4, nilai E5.
  eq('label kartu grand total ringkasan', String(summaryPreset.getCell('E4').value || ''), 'GRAND TOTAL RAB');
  eq('grand total ringkasan = total emas demo', cellNum(summaryPreset.getCell('E5')), DEMO_GRAND);

  console.log('\n[3] Workbook RECAP_ONLY (peta sheet gaya modal):');
  const wbModal = await exportWorkbook({ preset: 'RECAP_ONLY', sheets: modalStyleSheets('RECAP_ONLY') });
  const namesModal = wbModal.worksheets.map((w) => w.name);
  eq('tepat 2 lembar (gaya modal)', JSON.stringify(namesModal), JSON.stringify(['03_Estimate_Summary', '04_RAB_Recapitulation']));
  const recapModal = wbModal.getWorksheet('04_RAB_Recapitulation')!;
  eq(
    'grand total rekap (gaya modal) = total emas demo',
    findLabeledValue(recapModal, 'TOTAL ESTIMASI ANGGARAN BIAYA (GRAND TOTAL)'),
    DEMO_GRAND,
  );

  console.log('\n[4] Regresi: COMPLETE_PACKAGE tetap paket penuh:');
  const wbFull = await exportWorkbook({ preset: 'COMPLETE_PACKAGE' });
  eq('COMPLETE_PACKAGE tetap 15 lembar', wbFull.worksheets.length, 15);
  check('COMPLETE_PACKAGE memuat 05_RAB_Detail', wbFull.worksheets.some((w) => w.name === '05_RAB_Detail'));

  console.log('\n[5] Wiring (struktural):');
  const modalPath = path.join(__dirname, '../components/export/ExportProjectPackageModal.tsx');
  const modalSrc = fs.readFileSync(modalPath, 'utf8');
  const viewPath = path.join(__dirname, '../components/rab/RabEstimasiView.tsx');
  const viewSrc = fs.readFileSync(viewPath, 'utf8');
  contains(modalSrc, 'initialPreset?: ExportPresetId;', 'modal punya prop initialPreset');
  contains(modalSrc, 'prevIsOpenRef', 'modal melacak transisi buka');
  contains(modalSrc, "handleSelectPreset(initialPreset ?? 'COMPLETE_PACKAGE')", 'modal menerapkan preset saat dibuka');
  contains(viewSrc, "openExportModal('RECAP_ONLY')", 'pembuka Rekap memakai RECAP_ONLY');
  contains(viewSrc, 'initialPreset={exportModalInitialPreset}', 'modal menerima initialPreset dari view');
  contains(viewSrc, 'exportModalInitialPreset', 'state preset awal di view');

  console.log(`\nHasil D-75: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  }
  console.log('SEMUA TEST D-75 LOLOS');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
