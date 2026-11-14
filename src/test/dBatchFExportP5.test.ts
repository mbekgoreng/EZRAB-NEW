/**
 * P5 Batch F — item owner-decision + perbaikan legacy yang terkandung.
 *
 * P5-O1 (OD-10, MASIH TERBUKA): slice(0,10) di Sheet 08_AHSP legacy
 *   SENGAJA dipertahankan — tes ini mengunci keadaan itu agar tidak
 *   berubah diam-diam tanpa keputusan owner.
 * P5-O3 (DIPERBAIKI Batch F): kolom TRACEABILITAS WBS di Sheet 2
 *   legacy 05_RAB_Detail (kolom J) — dibuktikan lewat workbook nyata.
 * P5-O4 (OD-11, MASIH TERBUKA): divergensi kontingensi/markup antara
 *   recalculateCostSummary (aplikasi: termasuk) dan
 *   computeCostSummaryFromSections (ekspor: tidak termasuk) —
 *   dikuantifikasi persis di sini, TIDAK disatukan tanpa OD.
 * P5-O5 (OD-12, MASIH TERBUKA): tidak ada ekspor CSV — dikunci bahwa
 *   ExportFormat tetap 'excel' | 'pdf' | 'both'.
 * P5-O7 (DITUTUP oleh keputusan desain): hash FNV non-kriptografis —
 *   dokumentasi keputusan diverifikasi ada.
 *
 * Jalankan: npx tsx src/test/dBatchFExportP5.test.ts
 */
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import type { Project, Company, RabItem } from '../types';

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

function company(): Company {
  return {
    id: 'comp-1', name: 'PT Uji Ekspor', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: '',
    defaultOverheadPercent: 0, defaultProfitPercent: 0,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

async function main(): Promise<void> {
  console.log('P5 Batch F — status OD + perbaikan legacy:');

  const enginePath = path.join(__dirname, '../export/excelExportEngine.ts');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');
  const presetPath = path.join(__dirname, '../export/fiveSheetPreset.ts');
  const presetSrc = fs.readFileSync(presetPath, 'utf8');
  const typesPath = path.join(__dirname, '../export/types.ts');
  const typesSrc = fs.readFileSync(typesPath, 'utf8');

  console.log('\n[P5-O1] slice(0,10) legacy — SENGAJA dipertahankan (OD-10 terbuka):');
  contains(engineSrc, 'allAhspList.slice(0, 10)', 'slice(0,10) masih ada di Sheet 08_AHSP legacy');
  contains(presetSrc, 'SENGAJA tidak diubah (format lama dipertahankan utuh', 'docstring 5-sheet mencatat keputusan');
  contains(presetSrc, 'mengubahnya butuh keputusan owner', 'docstring menunjuk OD');

  console.log('\n[P5-O3] Kolom TRACEABILITAS WBS di 05_RAB_Detail legacy:');
  const mappedItem = createRabItemRecord(
    {
      description: 'Beton bertulang terpetakan',
      volume: 2,
      unit: 'm3',
      unitPrice: 1500000,
      priceSourceKind: 'MARKET_REFERENCE',
      wbsCode: '1.1',
      wbsNodeId: 'wbs:struktur',
      wbsMappingStatus: 'CONFIRMED',
    } as any,
    'PRJ-TP5',
  );
  const unmappedItem = createRabItemRecord(
    {
      description: 'Item tanpa pemetaan WBS',
      volume: 1,
      unit: 'ls',
      unitPrice: 500000,
      priceSourceKind: 'MARKET_REFERENCE',
    } as any,
    'PRJ-TP5',
  );
  const project: Project = {
    id: 'PRJ-TP5',
    projectNumber: 'PRJ-T-P5',
    name: 'Proyek Uji P5-O3',
    location: 'Jakarta',
    clientName: 'Klien Uji',
    status: 'draft',
    overheadPercent: 0,
    currentVersion: 'Rev 00',
    costSummary: { overheadPercent: 0, profitPercent: 0, taxPercent: 11 } as any,
    sections: [
      {
        id: 'sec-A',
        code: 'A',
        name: 'Pekerjaan Struktur',
        subtotal: 3500000,
        items: [mappedItem, unmappedItem],
      },
    ],
  } as unknown as Project;
  const blob = await exportRABToProfessionalExcel(project, company(), { preset: 'COMPLETE_PACKAGE' } as any);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const detail = wb.getWorksheet('05_RAB_Detail');
  check('sheet 05_RAB_Detail ada', detail !== undefined);
  if (detail) {
    eq('header kolom J = TRACEABILITAS WBS', String(detail.getCell('J5').value || ''), 'TRACEABILITAS WBS');
    let mappedTrace: string | null = null;
    let unmappedTrace: string | null = null;
    detail.eachRow((row) => {
      const desc = String(row.getCell(3).value || '');
      if (desc.includes('Beton bertulang terpetakan')) mappedTrace = String(row.getCell(10).value || '');
      if (desc.includes('Item tanpa pemetaan WBS')) unmappedTrace = String(row.getCell(10).value || '');
    });
    eq(
      'item terpetakan menampilkan trace WBS',
      mappedTrace,
      'TERPETAKAN — Struktur Beton & Baja (wbs:struktur) • Kode: 1.1',
    );
    eq('item tanpa pemetaan menampilkan "Tidak terpetakan"', unmappedTrace, 'Tidak terpetakan');
  }

  console.log('\n[P5-O4] Divergensi kontingensi/markup — dikuantifikasi (OD-11 terbuka, TIDAK disatukan):');
  const probeItem = createRabItemRecord(
    {
      description: 'Item probe P5-O4',
      volume: 1,
      unit: 'ls',
      unitPrice: 1000000,
      priceSourceKind: 'MARKET_REFERENCE',
    } as any,
    'PRJ-TP5',
  );
  const appSummary = UnifiedProjectEngine.recalculateCostSummary(
    [probeItem],
    { contingencyPercent: 5, directorMarkupPercent: 2, overheadPercent: 0, profitPercent: 0 } as any,
  );
  const sectionsProject: Project = {
    id: 'PRJ-TP5',
    name: 'Proyek Probe P5-O4',
    status: 'draft',
    overheadPercent: 0,
    costSummary: {
      profitPercent: 0,
      contingencyPercent: 5,
      contingencyAmount: 50000,
      directorMarkupPercent: 2,
    } as any,
  } as unknown as Project;
  const sections = UnifiedProjectEngine.normalizeSections(
    { ...sectionsProject, rabItems: [probeItem] } as unknown as Project,
  );
  const exportSummary = UnifiedProjectEngine.computeCostSummaryFromSections(sectionsProject, sections);
  eq('jalur aplikasi: directCost', appSummary.directCost, 1000000);
  eq('jalur aplikasi: contingencyAmount 5%', appSummary.contingencyAmount, 50000);
  eq('jalur aplikasi: directorMarkupTotal 2%', appSummary.directorMarkupTotal, 20000);
  eq('jalur aplikasi: subtotalBeforeTax termasuk keduanya', appSummary.subtotalBeforeTax, 1070000);
  eq('jalur aplikasi: grandTotal', appSummary.grandTotal, 1070000);
  eq('jalur ekspor: directCost', exportSummary.directCost, 1000000);
  eq('jalur ekspor: contingencyAmount HANYA digemakan (tersimpan)', exportSummary.contingencyAmount, 50000);
  eq('jalur ekspor: directorMarkupTotal di-hardcode 0', exportSummary.directorMarkupTotal, 0);
  eq('jalur ekspor: subtotalBeforeTax MENGECUALIKAN keduanya', exportSummary.subtotalBeforeTax, 1000000);
  eq('jalur ekspor: grandTotal', exportSummary.grandTotal, 1000000);
  eq(
    'DIVERGENSI grand total = Rp70.000 (kontingensi 50.000 + markup 20.000)',
    appSummary.grandTotal - exportSummary.grandTotal,
    70000,
  );
  check(
    'inkonsistensi internal jalur ekspor: contingencyAmount 50.000 tidak masuk subtotal-nya sendiri',
    exportSummary.contingencyAmount === 50000 && exportSummary.subtotalBeforeTax === 1000000,
  );

  console.log('\n[P5-O5] Tanpa ekspor CSV (OD-12 terbuka):');
  contains(typesSrc, "export type ExportFormat = 'excel' | 'pdf' | 'both';", 'ExportFormat tetap tanpa csv');

  console.log('\n[P5-O7] Hash FNV non-kriptografis — keputusan desain terdokumentasi:');
  contains(presetSrc, 'hash NON-KRIPTOGRAFIS, DIPERTAHANKAN sengaja', 'docstring S9 P5-O7 ada');
  contains(presetSrc, 'Ia BUKAN mekanisme keamanan', 'batasan keamanan didokumentasikan');

  console.log(`\nHasil P5 Batch F: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  }
  console.log('SEMUA TEST P5 BATCH F LOLOS');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
