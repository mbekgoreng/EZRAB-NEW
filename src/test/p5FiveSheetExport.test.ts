/**
 * P5 FULL REPAIR (2026-11-13) — Preset workbook RAB 5 sheet.
 *
 * Yang dibuktikan suite ini (bukan diklaim di laporan saja):
 *  (a) workbook ter-generate + ter-parse ulang (ExcelJS `wb.xlsx.load` nyata)
 *  (b) kelima sheet ada dengan nama yang ditetapkan, dalam urutan itu
 *  (c) Sheet 3 project-bound: hanya analisa item proyek; TIDAK ADA item
 *      master arbitrer (asersi negatif atas `slice(0, 10)` — kode 10 item
 *      pertama MASTER_AHSP_DATABASE tidak muncul kecuali memang dipakai
 *      item proyek, dan fixture sengaja memakai kode non-master)
 *  (d) Sheet 2 memuat Status Verifikasi + Keterangan (dari RABItem)
 *  (e) total Sheet 1 == total snapshot kanonis (tangga langsung → O&P →
 *      pajak → grand, eksplisit; subtotal & grand memakai formula live)
 *  (f) harga unresolved jujur ('HARGA BELUM TERSEDIA', jumlah '–',
 *      total PARSIAL)
 *  (g) Sheet 5 kolom tanggal verifikasi + status keputusan user ada,
 *      bernilai 'tidak tercatat' bila tanpa data (K-A6) dan nilai nyata
 *      bila field terisi
 *  (h) snapshot dibekukan (mutasi state live sesudah snapshot tidak
 *      mengubah workbook; hash berubah bila konten berubah)
 *  (i) ekspor ulang idempotent (hash konten sama; byte sama atas
 *      snapshot yang sama)
 *  (j) format 16-sheet lama tetap berfungsi (tidak regresi)
 *  (+) Sheet 4 jujur soal formula yang tidak ada datanya (P3C-F2)
 *  (+) ikatan artefak: revision ID + hash snapshot di Sheet 1 +
 *      defined name workbook + aktor 'demo/anonim'
 *  (+) toleransi pembulatan grand Sheet 1 vs Sheet 2 dinyatakan di Sheet 1
 *      + Sheet 5 (keputusan owner 2026-11-13: terima + toleransi Rp1/baris;
 *      kasus tercatat Premium Demo 213 baris, selisih Rp1,55)
 *
 * Jalankan: npx --yes tsx src/test/p5FiveSheetExport.test.ts
 * (Skrip tsx mandiri dengan assert — pola exportPriceIntegrity; repo ini
 * tidak punya paket vitest.)
 */
import ExcelJS from 'exceljs';
import { strict as assert } from 'node:assert';
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import {
  FIVE_SHEET_NAMES,
  FIVE_SHEET_ORDER,
  FIVE_SHEET_PRESET_ID,
  NOT_RECORDED,
  NOT_AVAILABLE,
  SNAPSHOT_HASH_DEFINED_NAME,
  ROUNDING_TOLERANCE_PER_ROW_IDR,
  roundingToleranceFor,
  roundingToleranceNote,
  buildFiveSheetWorkbook,
  freezeRabSnapshot,
  type RabExportSnapshot,
} from '../export/fiveSheetPreset';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { MASTER_AHSP_DATABASE } from '../data/indonesianAHSP';
import type { Company, Project } from '../types';

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
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `aktual=${JSON.stringify(actual)} harap=${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------- fixtures
function company(): Company {
  return {
    id: 'comp-p5', name: 'PT Uji P5', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 10, defaultProfitPercent: 5,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

function baseItem(extra: any): any {
  return {
    sectionId: extra.sectionId || 'sec-A',
    itemNumber: extra.itemNumber,
    code: extra.code,
    description: extra.description,
    specification: extra.specification || '',
    volume: extra.volume,
    unit: extra.unit,
    materialPrice: extra.materialPrice || 0,
    laborPrice: extra.laborPrice || 0,
    equipmentPrice: extra.equipmentPrice || 0,
    unitPrice: extra.unitPrice,
    totalPrice: extra.totalPrice,
    verificationStatus: extra.verificationStatus || 'NEEDS_VERIFICATION',
    ...extra.rest,
  };
}

function p5Project(): Project {
  return {
    id: 'proj-p5',
    projectNumber: 'PRJ-P5-001',
    name: 'Proyek Uji P5',
    location: 'Malang',
    clientName: 'Klien Uji P5',
    buildingType: 'Rumah Tinggal',
    buildingArea: 120,
    status: 'draft',
    overheadPercent: 10,
    ppnEnabled: true,
    ppnPercent: 11,
    currentVersion: 'Rev 01',
    costSummary: { profitPercent: 5, taxPercent: 11 } as any,
    sections: [
      {
        id: 'sec-A', code: 'A', name: 'Pekerjaan Struktur', subtotal: 0,
        items: [
          baseItem({
            sectionId: 'sec-A', itemNumber: '1', code: 'A.1',
            description: 'Beton bertulang K-300 (uji)',
            specification: 'Beton K-300, tulangan D13',
            volume: 10, unit: 'm3', unitPrice: 750000, totalPrice: 7500000,
            verificationStatus: 'VERIFIED',
            rest: {
              id: 'a1',
              priceStatus: 'PRICE_RESOLVED',
              priceSourceKind: 'OFFICIAL_AHSP',
              ahspCode: 'P5-AHSP-01',
              calculationFormula: '10 × 1 × 0,5',
              evidenceDetails: { sourcePages: [12], sourceType: 'DED', calculation: '10 × 1 × 0,5' },
              ahspSnapshot: {
                ahspId: 'snap-a1',
                code: 'P5-AHSP-01',
                version: 'AHSP 2026',
                name: 'Beton Bertulang K-300 (Uji)',
                unit: 'm3',
                laborComponents: [
                  { id: 'c1', code: 'L-P5-01', name: 'Pekerja P5', unit: 'OH', coefficient: 2, unitPrice: 100000, total: 200000, resourceType: 'LABOR' },
                  { id: 'c2', code: 'L-P5-02', name: 'Tukang P5', unit: 'OH', coefficient: 0.5, unitPrice: 150000, total: 75000, resourceType: 'LABOR' },
                ],
                materialComponents: [
                  { id: 'c3', code: 'M-P5-01', name: 'Semen P5', unit: 'kg', coefficient: 300, unitPrice: 1500, total: 450000, resourceType: 'MATERIAL' },
                  // Komponen tanpa harga (unitPrice null) — wajib jujur, bukan Rp0.
                  { id: 'c4', code: 'M-P5-02', name: 'Pasir P5 Tanpa Harga', unit: 'm3', coefficient: 0.5, unitPrice: null, total: null, resourceType: 'MATERIAL' },
                ],
                equipmentComponents: [
                  { id: 'c5', code: 'E-P5-01', name: 'Vibrator P5', unit: 'jam', coefficient: 0.1, unitPrice: 250000, total: 25000, resourceType: 'EQUIPMENT' },
                ],
                unitPrice: 750000,
                sourceDocument: 'Lampiran Uji P5',
                snapshotTimestamp: '2026-11-13T00:00:00.000Z',
              },
            },
          }),
          baseItem({
            sectionId: 'sec-A', itemNumber: '2', code: 'A.2',
            description: 'Dinding bata ringan (uji)',
            specification: 'Bata ringan 7,5 cm',
            volume: 5, unit: 'm2', unitPrice: 200000, totalPrice: 1000000,
            verificationStatus: 'NEEDS_VERIFICATION',
            rest: {
              id: 'a2',
              priceStatus: 'PRICE_RESOLVED',
              priceSourceKind: 'MARKET_REFERENCE',
              ahspCode: 'P5-AHSP-02',
              // SENGAJA tanpa ahspSnapshot + tanpa formula (uji kejujuran).
            },
          }),
          baseItem({
            sectionId: 'sec-A', itemNumber: '3', code: 'A.3',
            description: 'Pekerjaan khusus estimasi AI (uji)',
            volume: 2, unit: 'ls', unitPrice: 500000, totalPrice: 1000000,
            verificationStatus: 'ESTIMATED',
            rest: {
              id: 'a3',
              priceStatus: 'PRICE_ESTIMATED',
              priceSourceKind: 'EZRAB_ASSUMPTION',
              isAssumption: true,
              assumptionNote: 'Harga perkiraan AI — perlu verifikasi pasar',
              takeoffConfig: {
                method: 'MANUAL',
                formulaName: 'Hitung manual P5',
                formulaExpression: '2 × 1',
                parameters: { jumlah: 2 },
                calculatedVolume: 2,
                finalVolume: 2,
              },
            },
          }),
        ],
      },
      {
        id: 'sec-B', code: 'B', name: 'Pekerjaan Arsitektur', subtotal: 0,
        items: [
          baseItem({
            sectionId: 'sec-B', itemNumber: '1', code: 'B.1',
            description: 'Cat dinding (harga belum tersedia)',
            volume: 20, unit: 'm2', unitPrice: 0, totalPrice: 0,
            verificationStatus: 'NEEDS_VERIFICATION',
            rest: { id: 'b1', priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'UNRESOLVED' },
          }),
          baseItem({
            sectionId: 'sec-B', itemNumber: '2', code: 'B.2',
            description: 'Kusen pintu kayu (uji)',
            volume: 4, unit: 'm', unitPrice: 100000, totalPrice: 400000,
            verificationStatus: 'VERIFIED',
            rest: {
              id: 'b2',
              // Legacy: tanpa priceStatus — diperlakukan teresolusi.
              calculationFormula: '4 × 1',
              verificationDate: '2026-11-12',
              userDecisionStatus: 'DISETUJUI',
            },
          }),
        ],
      },
    ],
    rabItems: [],
  } as unknown as Project;
}

// Total kanonis fixture (hitung tangan, pin silang terhadap engine):
// direct = 7.500.000 + 1.000.000 + 1.000.000 + 400.000 = 9.900.000
// OH 10% = 990.000; profit 5% = 495.000; subtotal = 11.385.000
// PPN 11% = 1.252.350; PPh 0; grand = 12.637.350
const EXPECTED = {
  direct: 9900000,
  overhead: 990000,
  profit: 495000,
  subtotal: 11385000,
  ppn: 1252350,
  pph: 0,
  grand: 12637350,
};

// ---------------------------------------------------------------- helpers
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as any;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'result' in v) return String(v.result);
  if (typeof v === 'number') return String(v);
  return '';
}
function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value as any;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result;
  return null;
}
function cellFormula(cell: ExcelJS.Cell): string | null {
  const v = cell.value as any;
  if (v && typeof v === 'object' && typeof v.formula === 'string') return v.formula;
  return null;
}
function findRowByText(ws: ExcelJS.Worksheet, needle: string, col?: number): number {
  let found = -1;
  ws.eachRow((row, rowNumber) => {
    if (found !== -1) return;
    if (col !== undefined) {
      if (cellText(row.getCell(col)).includes(needle)) found = rowNumber;
      return;
    }
    row.eachCell((cell) => {
      if (found === -1 && cellText(cell).includes(needle)) found = rowNumber;
    });
  });
  return found;
}
function sheetAllText(ws: ExcelJS.Worksheet): string {
  const parts: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const t = cellText(cell);
      if (t) parts.push(t);
    });
  });
  return parts.join('\n');
}
async function exportFiveSheet(project: Project, options?: any): Promise<{ blob: Blob; buffer: Buffer; wb: ExcelJS.Workbook }> {
  const blob = await exportRABToProfessionalExcel(project, company(), {
    preset: FIVE_SHEET_PRESET_ID,
    ...(options || {}),
  } as any);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return { blob, buffer, wb };
}

// ---------------------------------------------------------------- tests
async function testGenerateAndParse(): Promise<ExcelJS.Workbook> {
  console.log('\n[1] Generate + parse ulang + nama sheet (a, b):');
  const { blob, wb } = await exportFiveSheet(p5Project());
  check('ekspor mengembalikan Blob tak kosong', blob instanceof Blob && blob.size > 0, `size=${blob.size}`);
  const names = wb.worksheets.map((ws) => ws.name);
  eq('tepat 5 sheet', names.length, 5);
  eq('nama + urutan sheet sesuai ketetapan', JSON.stringify(names), JSON.stringify([...FIVE_SHEET_ORDER]));
  check('tidak ada sheet 16-sheet lama', !names.some((n) => /^(00_Validasi|05_RAB_Detail|08_AHSP|15_Notes)$/.test(n)));
  return wb;
}

function testSummaryTotals(wb: ExcelJS.Workbook): void {
  console.log('\n[2] Sheet 1: total == snapshot kanonis + tangga eksplisit (e):');
  const proj = p5Project();
  const expected = UnifiedProjectEngine.computeCostSummaryFromSections(proj, (proj as any).sections);
  eq('engine: directCost hitung tangan', expected.directCost, EXPECTED.direct);
  eq('engine: overhead hitung tangan', expected.overheadAmount, EXPECTED.overhead);
  eq('engine: profit hitung tangan', expected.profitAmount, EXPECTED.profit);
  eq('engine: subtotal hitung tangan', expected.subtotalBeforeTax, EXPECTED.subtotal);
  eq('engine: PPN hitung tangan', expected.taxAmount, EXPECTED.ppn);
  eq('engine: grand hitung tangan', expected.grandTotal, EXPECTED.grand);

  const ws = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const rowOf = (label: string): number => findRowByText(ws, label, 1);
  const directRow = rowOf('Biaya Langsung');
  const ohRow = rowOf('Overhead');
  const profitRow = rowOf('Profit');
  const subRow = rowOf('SUBTOTAL SEBELUM PAJAK');
  const ppnRow = rowOf('PPN (11%)');
  const pphRow = rowOf('PPh (0%)');
  const grandRow = rowOf('GRAND TOTAL');
  check('baris tangga ditemukan semua', [directRow, ohRow, profitRow, subRow, ppnRow, pphRow, grandRow].every((r) => r > 0),
    `rows=${[directRow, ohRow, profitRow, subRow, ppnRow, pphRow, grandRow].join(',')}`);
  eq('Sheet 1 direct == kanonis', cellNum(ws.getCell(`B${directRow}`)), EXPECTED.direct);
  eq('Sheet 1 overhead == kanonis', cellNum(ws.getCell(`B${ohRow}`)), EXPECTED.overhead);
  eq('Sheet 1 profit == kanonis', cellNum(ws.getCell(`B${profitRow}`)), EXPECTED.profit);
  eq('Sheet 1 subtotal == kanonis', cellNum(ws.getCell(`B${subRow}`)), EXPECTED.subtotal);
  eq('Sheet 1 PPN == kanonis', cellNum(ws.getCell(`B${ppnRow}`)), EXPECTED.ppn);
  eq('Sheet 1 PPh == kanonis', cellNum(ws.getCell(`B${pphRow}`)), EXPECTED.pph);
  eq('Sheet 1 grand == kanonis', cellNum(ws.getCell(`B${grandRow}`)), EXPECTED.grand);
  check('subtotal memakai formula live', (cellFormula(ws.getCell(`B${subRow}`)) || '').includes('SUM('));
  check('grand memakai formula live', (cellFormula(ws.getCell(`B${grandRow}`)) || '').includes('+'));
  check('label PARSIAL pada direct (ada item tanpa harga)', cellText(ws.getCell(`A${directRow}`)).includes('PARSIAL'));
  check('label PARSIAL pada grand', cellText(ws.getCell(`A${grandRow}`)).includes('PARSIAL'));
  const terbilangRow = rowOf('Terbilang');
  check('terbilang menyebut Dua Belas Juta', cellText(ws.getCell(`B${terbilangRow}`)).includes('Dua Belas Juta'));
}

function testSheet1Binding(wb: ExcelJS.Workbook): void {
  console.log('\n[3] Sheet 1: ikatan artefak (revision + hash + aktor):');
  const ws = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const hashRow = findRowByText(ws, 'Hash Snapshot', 1);
  const hash = cellText(ws.getCell(`B${hashRow}`));
  check('hash snapshot 16 hex', /^[0-9a-f]{16}$/.test(hash), `hash=${hash}`);
  const revRow = findRowByText(ws, 'Revision ID', 1);
  eq('revision ID tercantum', cellText(ws.getCell(`B${revRow}`)), 'Rev 01');
  const actorRow = findRowByText(ws, 'Aktor Ekspor', 1);
  eq('aktor jujur demo/anonim', cellText(ws.getCell(`B${actorRow}`)), 'demo/anonim');
  const projRow = findRowByText(ws, 'ID Proyek', 1);
  eq('projectId tercantum', cellText(ws.getCell(`B${projRow}`)), 'proj-p5');
  // Defined name workbook → sel hash (ExcelJS: getNames(locStr)).
  const namesOnHashCell = (wb as any).definedNames?.getNames?.(`'${FIVE_SHEET_NAMES.summary}'!$B$${hashRow}`) || [];
  check('defined name EZRAB_SNAPSHOT_HASH menunjuk sel hash', namesOnHashCell.includes(SNAPSHOT_HASH_DEFINED_NAME),
    `names=${JSON.stringify(namesOnHashCell)}`);
  const statusRow = findRowByText(ws, 'Status Total Dokumen', 1);
  eq('status total PARSIAL', cellText(ws.getCell(`B${statusRow}`)), 'PARSIAL');
  const estRow = findRowByText(ws, 'Item Estimasi AI', 1);
  check('1 item Estimasi AI tercatat', cellText(ws.getCell(`B${estRow}`)) === '1 item', cellText(ws.getCell(`B${estRow}`)));
}

function testDetailSheet(wb: ExcelJS.Workbook): void {
  console.log('\n[4] Sheet 2: Status Verifikasi + Keterangan + kejujuran harga (d, f):');
  const ws = wb.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  const head = ws.getRow(5);
  const headers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => cellText(head.getCell(c)));
  check('kolom STATUS VERIFIKASI ada', headers.includes('STATUS VERIFIKASI'), headers.join(' | '));
  check('kolom KETERANGAN ada', headers.includes('KETERANGAN'));
  check('kolom KLASIFIKASI ada', headers.includes('KLASIFIKASI'));
  // Baris item A.3 (asumsi AI): status ESTIMATED + keterangan = assumptionNote.
  const a3Row = findRowByText(ws, 'A.3', 2);
  check('baris A.3 ditemukan', a3Row > 0);
  check('A.3 status ESTIMATED', cellText(ws.getCell(`K${a3Row}`)).includes('ESTIMATED'), cellText(ws.getCell(`K${a3Row}`)));
  check('A.3 keterangan = assumptionNote', cellText(ws.getCell(`L${a3Row}`)).includes('perlu verifikasi pasar'), cellText(ws.getCell(`L${a3Row}`)));
  check('A.3 klasifikasi NON-AHSP', cellText(ws.getCell(`I${a3Row}`)) === 'NON-AHSP', cellText(ws.getCell(`I${a3Row}`)));
  check('A.3 sumber = asumsi (P1)', cellText(ws.getCell(`J${a3Row}`)).includes('ASUMSI'), cellText(ws.getCell(`J${a3Row}`)));
  // Baris item A.1 (AHSP, terverifikasi).
  const a1Row = findRowByText(ws, 'A.1', 2);
  check('A.1 status VERIFIED', cellText(ws.getCell(`K${a1Row}`)).includes('VERIFIED'));
  check('A.1 klasifikasi AHSP + kode', cellText(ws.getCell(`I${a1Row}`)).includes('P5-AHSP-01'), cellText(ws.getCell(`I${a1Row}`)));
  eq('A.1 jumlah = 7.500.000', cellNum(ws.getCell(`H${a1Row}`)), 7500000);
  check('A.1 jumlah memakai formula live', (cellFormula(ws.getCell(`H${a1Row}`)) || '').includes('F'));
  // Baris item B.1 (unresolved): harga teks, jumlah '–'.
  const b1Row = findRowByText(ws, 'B.1', 2);
  eq('B.1 harga = HARGA BELUM TERSEDIA', cellText(ws.getCell(`G${b1Row}`)), 'HARGA BELUM TERSEDIA');
  eq("B.1 jumlah = '–'", cellText(ws.getCell(`H${b1Row}`)), '–');
  // Subtotal seksi A = 9.500.000 (7,5 + 1 + 1 jt); seksi B = 400.000.
  const subA = findRowByText(ws, 'SUBTOTAL PEKERJAAN STRUKTUR', 3);
  eq('subtotal seksi A', cellNum(ws.getCell(`H${subA}`)), 9500000);
  const subB = findRowByText(ws, 'SUBTOTAL PEKERJAAN ARSITEKTUR', 3);
  eq('subtotal seksi B', cellNum(ws.getCell(`H${subB}`)), 400000);
  // Tangga kaki sheet == kanonis.
  const grandRow = findRowByText(ws, 'GRAND TOTAL', 3);
  eq('Sheet 2 grand == kanonis', cellNum(ws.getCell(`H${grandRow}`)), EXPECTED.grand);
  const directRow = findRowByText(ws, 'TOTAL BIAYA LANGSUNG', 3);
  eq('Sheet 2 direct == kanonis', cellNum(ws.getCell(`H${directRow}`)), EXPECTED.direct);
}

function testAhspSheetProjectBound(wb: ExcelJS.Workbook): void {
  console.log('\n[5] Sheet 3: project-bound, tanpa item master arbitrer (c):');
  const ws = wb.getWorksheet(FIVE_SHEET_NAMES.ahsp)!;
  const text = sheetAllText(ws);
  // Kartu item proyek ADA.
  check('kartu A.1 (snapshot) ada', text.includes('[P5-AHSP-01]'));
  check('komponen snapshot A.1 ada (Pekerja P5)', text.includes('Pekerja P5'));
  check('komponen snapshot A.1 ada (Semen P5)', text.includes('Semen P5'));
  check('komponen tanpa harga jujur (HARGA BELUM TERSEDIA)', text.includes('Pasir P5 Tanpa Harga') && text.includes('HARGA BELUM TERSEDIA'));
  check('total kartu A.1 = 750.000', text.includes('TOTAL HARGA SATUAN [P5-AHSP-01]'));
  // Cari sel total kartu A.1 dan cek nilainya.
  const totalRow = findRowByText(ws, 'TOTAL HARGA SATUAN [P5-AHSP-01]', 4);
  eq('total kartu A.1 (200.000+75.000+450.000+25.000)', cellNum(ws.getCell(`H${totalRow}`)), 750000);
  // Item A.2: kode tercatat, snapshot kosong → 'Analisa tidak tersedia'.
  check('A.2 analisa tidak tersedia (jujur)', text.includes('P5-AHSP-02') && text.includes('Analisa tidak tersedia'));
  // Item non-AHSP: tampil sebagai NON-AHSP, bukan dihilangkan.
  check('A.3 tampil NON-AHSP', text.includes('NON-AHSP'));
  check('B.1 tampil NON-AHSP', text.includes('Cat dinding (harga belum tersedia)'));
  // ASERSI NEGATIF atas slice(0,10): tidak satu pun dari 10 item pertama
  // database master boleh muncul (fixture memakai kode P5-* non-master).
  const masterFirst10 = (MASTER_AHSP_DATABASE || []).slice(0, 10);
  check('database master punya ≥10 item (asersi bermakna)', masterFirst10.length === 10, `n=${masterFirst10.length}`);
  const leaked = masterFirst10.filter((m: any) => {
    const code = String(m.code || '');
    const name = String(m.name || '');
    return (code && text.includes(`[${code}]`)) || (name && name.length > 6 && text.includes(name.toUpperCase()));
  });
  check('TIDAK ADA item master arbitrer di Sheet 3', leaked.length === 0,
    leaked.length > 0 ? `bocor: ${leaked.map((m: any) => m.code).join(', ')}` : '');
  // Provenance kartu A.1.
  check('provenance kartu A.1 (dokumen + versi + timestamp)', text.includes('Lampiran Uji P5') && text.includes('AHSP 2026') && text.includes('2026-11-13T00:00:00.000Z'));
}

function testVolumeSheet(wb: ExcelJS.Workbook): void {
  console.log('\n[6] Sheet 4: detail volume, jujur bila tanpa data (F2):');
  const ws = wb.getWorksheet(FIVE_SHEET_NAMES.volume)!;
  const head = ws.getRow(5);
  const headers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((c) => cellText(head.getCell(c)));
  check('kolom FORMULA ada', headers.includes('FORMULA'));
  check('kolom DIMENSI / PARAMETER ada', headers.includes('DIMENSI / PARAMETER'));
  check('kolom SUMBER / BUKTI ada', headers.includes('SUMBER / BUKTI'));
  const a1Row = findRowByText(ws, 'A.1', 2);
  eq('A.1 formula dari calculationFormula', cellText(ws.getCell(`E${a1Row}`)), '10 × 1 × 0,5');
  check('A.1 bukti menyebut hal. 12 + DED', cellText(ws.getCell(`I${a1Row}`)).includes('12') && cellText(ws.getCell(`I${a1Row}`)).includes('DED'));
  // A.2: tanpa formula/dimensi/bukti → 'Tidak tersedia' (F2).
  const a2Row = findRowByText(ws, 'A.2', 2);
  eq('A.2 formula = Tidak tersedia', cellText(ws.getCell(`E${a2Row}`)), NOT_AVAILABLE);
  eq('A.2 dimensi = Tidak tersedia', cellText(ws.getCell(`F${a2Row}`)), NOT_AVAILABLE);
  eq('A.2 bukti = Tidak tersedia', cellText(ws.getCell(`I${a2Row}`)), NOT_AVAILABLE);
  // A.3: formula + parameter dari takeoffConfig.
  const a3Row = findRowByText(ws, 'A.3', 2);
  eq('A.3 formula dari takeoffConfig', cellText(ws.getCell(`E${a3Row}`)), '2 × 1');
  check('A.3 parameter tampil', cellText(ws.getCell(`F${a3Row}`)).includes('jumlah=2'));
  check('A.3 asumsi tampil', cellText(ws.getCell(`K${a3Row}`)).includes('perlu verifikasi pasar'));
  // B.2: formula dari calculationFormula.
  const b2Row = findRowByText(ws, 'B.2', 2);
  eq('B.2 formula dari calculationFormula', cellText(ws.getCell(`E${b2Row}`)), '4 × 1');
}

function testSourcesSheet(wb: ExcelJS.Workbook): void {
  console.log('\n[7] Sheet 5: sumber & asumsi + kolom K-A6 (g):');
  const ws = wb.getWorksheet(FIVE_SHEET_NAMES.sources)!;
  const head = ws.getRow(5);
  const headers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => cellText(head.getCell(c)));
  check('kolom TANGGAL VERIFIKASI ada', headers.includes('TANGGAL VERIFIKASI'), headers.join(' | '));
  check('kolom STATUS KEPUTUSAN USER ada', headers.includes('STATUS KEPUTUSAN USER'));
  check('kolom INFO HILANG ada', headers.includes('INFO HILANG'));
  check('kolom IDENTITAS SUMBER AHSP ada', headers.includes('IDENTITAS SUMBER AHSP'));
  // A.1: tanpa tanggal/keputusan → 'tidak tercatat'.
  const a1Row = findRowByText(ws, 'A.1', 2);
  eq('A.1 tanggal verifikasi = tidak tercatat', cellText(ws.getCell(`K${a1Row}`)), NOT_RECORDED);
  eq('A.1 keputusan user = tidak tercatat', cellText(ws.getCell(`L${a1Row}`)), NOT_RECORDED);
  check('A.1 identitas AHSP tercantum', cellText(ws.getCell(`E${a1Row}`)).includes('P5-AHSP-01'));
  check('A.1 info hilang menyebut tanggal + keputusan', cellText(ws.getCell(`J${a1Row}`)).includes('tanggal verifikasi tidak tercatat'));
  // B.2: field K-A6 terisi → nilai nyata tampil.
  const b2Row = findRowByText(ws, 'B.2', 2);
  eq('B.2 tanggal verifikasi nyata', cellText(ws.getCell(`K${b2Row}`)), '2026-11-12');
  eq('B.2 keputusan user nyata', cellText(ws.getCell(`L${b2Row}`)), 'DISETUJUI');
  // B.1: info hilang menyebut harga belum tersedia.
  const b1Row = findRowByText(ws, 'B.1', 2);
  check('B.1 info hilang menyebut harga', cellText(ws.getCell(`J${b1Row}`)).includes('harga belum tersedia'));
  // A.3: penjelasan asumsi + status manual '-' (bukan manual).
  const a3Row = findRowByText(ws, 'A.3', 2);
  check('A.3 penjelasan asumsi tampil', cellText(ws.getCell(`H${a3Row}`)).includes('perlu verifikasi pasar'));
  check('A.3 sumber = asumsi', cellText(ws.getCell(`D${a3Row}`)).includes('ASUMSI'));
}

function testRoundingTolerance(wb: ExcelJS.Workbook): void {
  console.log('\n[7b] Toleransi pembulatan grand Sheet 1 vs Sheet 2 (keputusan owner 2026-11-13):');
  eq('konstanta toleransi Rp1 per baris', ROUNDING_TOLERANCE_PER_ROW_IDR, 1);
  eq('toleransi 5 baris = Rp5', roundingToleranceFor(5), 5);
  eq('toleransi 213 baris = Rp213', roundingToleranceFor(213), 213);
  eq('toleransi 0 baris = Rp0', roundingToleranceFor(0), 0);
  // Kasus tercatat (verifikasi akhir P0–P6, export-verify-e2e-post.log):
  // workbook E2E Premium Demo pasca-recalc LibreOffice — grand Sheet 1
  // 1.089.879.733 vs grand Sheet 2 1.089.879.734,55 (selisih Rp1,55).
  const recordedDiff = Math.abs(1089879733 - 1089879734.55);
  check('kasus tercatat Rp1,55 DI DALAM toleransi Rp213 (213 baris)',
    recordedDiff <= roundingToleranceFor(213), `selisih=${recordedDiff}`);
  check('toleransi punya gigi: Rp1,55 DI LUAR toleransi proyek 1 baris',
    recordedDiff > roundingToleranceFor(1), `selisih=${recordedDiff} toleransi=1`);
  // Catatan dinyatakan di workbook fixture (5 baris → maks. Rp5).
  const ws1 = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const text1 = sheetAllText(ws1);
  check('Sheet 1 memuat catatan pembulatan', text1.includes('PEMBULATAN') && text1.includes('Toleransi yang dinyatakan: Rp1 per baris item'));
  check('Sheet 1 menyebut maks. Rp5 untuk 5 baris', text1.includes('maks. Rp5') && text1.includes('untuk 5 baris'));
  check('teks catatan = roundingToleranceNote(5)', text1.includes(roundingToleranceNote(5)));
  const ws5 = wb.getWorksheet(FIVE_SHEET_NAMES.sources)!;
  const text5 = sheetAllText(ws5);
  check('Sheet 5 memuat baris kebijakan pembulatan', text5.includes('Toleransi yang dinyatakan: Rp1 per baris item'));
}

async function testSnapshotFrozen(): Promise<void> {
  console.log('\n[8] Snapshot dibekukan (h):');
  const proj = p5Project();
  const sections = UnifiedProjectEngine.normalizeSections(proj);
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(proj, sections);
  const { summarizeExportSections } = await import('../export/priceIntegrity');
  const summary = summarizeExportSections(sections as any);
  const snapshot = freezeRabSnapshot(proj, sections, costs, summary, {
    actor: 'demo/anonim',
    createdAt: '2026-11-13T10:00:00.000Z',
  });
  const hashBefore = snapshot.snapshotHash;
  // Mutasi state live BESAR-BESARAN sesudah snapshot.
  (proj as any).sections[0].items[0].unitPrice = 1;
  (proj as any).sections[0].items[0].totalPrice = 10;
  (proj as any).sections[0].items.push(baseItem({
    sectionId: 'sec-A', itemNumber: '99', code: 'A.99',
    description: 'Item susulan sesudah snapshot', volume: 100, unit: 'm2',
    unitPrice: 999999, totalPrice: 99999900, verificationStatus: 'VERIFIED',
    rest: { id: 'a99', priceStatus: 'PRICE_RESOLVED' },
  }));
  (proj as any).name = 'Proyek Diubah Sesudah Snapshot';
  eq('hash snapshot tidak berubah oleh mutasi live', snapshot.snapshotHash, hashBefore);
  eq('item snapshot tetap 5 (bukan 6)', snapshot.itemCount, 5);
  eq('direct snapshot tetap 9.900.000', snapshot.costSummary.directCost, EXPECTED.direct);
  // Bangun workbook dari snapshot beku → nilai lama, tanpa item susulan.
  const wb = new ExcelJS.Workbook();
  buildFiveSheetWorkbook(wb, snapshot, company(), {});
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as any);
  const ws1 = wb2.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const grandRow = findRowByText(ws1, 'GRAND TOTAL', 1);
  eq('workbook dari snapshot beku: grand tetap kanonis', cellNum(ws1.getCell(`B${grandRow}`)), EXPECTED.grand);
  const ws2 = wb2.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  check('item susulan TIDAK masuk workbook beku', findRowByText(ws2, 'A.99', 2) === -1);
  check('nama proyek lama (snapshot) di Sheet 1', cellText(ws1.getCell('A3')).includes('Proyek Uji P5'));
  // Hash mengikat konten: snapshot atas proyek yang sudah dimutasi → hash beda.
  const sections2 = UnifiedProjectEngine.normalizeSections(proj);
  const costs2 = UnifiedProjectEngine.computeCostSummaryFromSections(proj, sections2);
  const summary2 = summarizeExportSections(sections2 as any);
  const snapshot2 = freezeRabSnapshot(proj, sections2, costs2, summary2, { createdAt: '2026-11-13T10:00:00.000Z' });
  check('hash berubah bila konten berubah', snapshot2.snapshotHash !== hashBefore,
    `${hashBefore} vs ${snapshot2.snapshotHash}`);
}

async function testIdempotent(): Promise<void> {
  console.log('\n[9] Ekspor ulang idempotent (i):');
  const proj = p5Project();
  const sections = UnifiedProjectEngine.normalizeSections(proj);
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(proj, sections);
  const { summarizeExportSections } = await import('../export/priceIntegrity');
  const summary = summarizeExportSections(sections as any);
  const snapshot: RabExportSnapshot = freezeRabSnapshot(proj, sections, costs, summary, {
    createdAt: '2026-11-13T10:00:00.000Z',
  });
  const first = await exportFiveSheet(proj, { snapshot });
  const second = await exportFiveSheet(proj, { snapshot });
  check('byte identik atas snapshot yang sama', first.buffer.equals(second.buffer),
    `len ${first.buffer.length} vs ${second.buffer.length}`);
  // Tanpa snapshot pasokan (beku baru tiap ekspor): hash konten sama.
  const third = await exportFiveSheet(p5Project());
  const fourth = await exportFiveSheet(p5Project());
  const hashOf = (wb: ExcelJS.Workbook): string => {
    const ws = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
    return cellText(ws.getCell(`B${findRowByText(ws, 'Hash Snapshot', 1)}`));
  };
  eq('hash konten sama pada ekspor segar berulang', hashOf(third.wb), hashOf(fourth.wb));
  eq('hash ekspor segar == hash snapshot beku', hashOf(third.wb), snapshot.snapshotHash);
}

async function testLegacy16Sheet(): Promise<void> {
  console.log('\n[10] Format 16-sheet lama tidak regresi (j):');
  const blob = await exportRABToProfessionalExcel(p5Project(), company(), { preset: 'COMPLETE_PACKAGE' } as any);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const names = wb.worksheets.map((ws) => ws.name);
  // COMPLETE_PACKAGE memang 15 sheet (badge 'All-In-One (15 Lembar)';
  // daftar presetnya tidak memuat 'validation') — 16 sheet hanya pada
  // jalur tanpa preset (fallback legacy). Keduanya dipin di sini.
  eq('COMPLETE_PACKAGE tetap 15 sheet', names.length, 15);
  check('sheet 05_RAB_Detail ada', names.includes('05_RAB_Detail'));
  check('sheet 08_AHSP legacy dipertahankan', names.includes('08_AHSP'));
  check('sheet 15_Notes ada', names.includes('15_Notes'));
  check('tidak ada sheet 5-sheet di workbook lama', !names.some((n) => n === FIVE_SHEET_NAMES.summary));
  // Spot-check grand total lama == kanonis (sheet rekap).
  const recap = wb.getWorksheet('04_RAB_Recapitulation');
  if (recap) {
    const text = sheetAllText(recap);
    check('rekap lama menyebut grand 12.637.350', text.includes('12.637.350') || text.replace(/\./g, '').includes('12637350'),
      'teks rekap tidak memuat angka grand (cek manual bila gagal)');
  } else {
    check('sheet rekap ada', false);
  }
  // Jalur tanpa preset (default) tetap 16-sheet.
  const blob2 = await exportRABToProfessionalExcel(p5Project(), company());
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(Buffer.from(await blob2.arrayBuffer()));
  eq('tanpa opsi preset → 16 sheet (default COMPLETE_PACKAGE)', wb2.worksheets.length, 16);
  check('jalur default memuat 00_Validasi', wb2.worksheets.some((ws) => ws.name === '00_Validasi'));
}

async function main(): Promise<void> {
  console.log('P5 — Preset workbook RAB 5 sheet (snapshot beku, project-bound)');
  // Sanity impor: fail cepat bila modul tidak termuat.
  assert.ok(FIVE_SHEET_PRESET_ID === 'FIVE_SHEET_RAB');
  const wb = await testGenerateAndParse();
  testSummaryTotals(wb);
  testSheet1Binding(wb);
  testDetailSheet(wb);
  testAhspSheetProjectBound(wb);
  testVolumeSheet(wb);
  testSourcesSheet(wb);
  testRoundingTolerance(wb);
  await testSnapshotFrozen();
  await testIdempotent();
  await testLegacy16Sheet();
  console.log(`\nP5: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Gagal:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('P5 run error:', err);
  process.exit(1);
});
