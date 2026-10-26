/**
 * P0 — REGRESI INTEGRITAS HARGA JALUR EKSPOR (2026-10-26)
 *
 * Membuktikan wiring helper validitas harga (src/export/priceIntegrity.ts)
 * ke SELURUH jalur ekspor yang dapat diuji tanpa browser/backend live:
 *  1. Gerbang helper: sentinel 0 + total basi item PRICE_UNRESOLVED tidak
 *     pernah valid; harga Rp0 valid (status teresolusi) tetap valid.
 *  2. Subtotal per kategori (resmi/pasar/manual/lainnya/belum-terhitung).
 *  3. Kontrak sentinel rabItemFactory TIDAK berubah (UNRESOLVED -> 0).
 *  4. UnifiedProjectEngine: subtotal rekonstruksi + directCost tidak lagi
 *     percaya subtotal/totalPrice tersimpan mentah.
 *  5. Ringkasan laporan: resolveItemAmount mengecualikan sentinel.
 *  6. Workbook Excel NYATA (exportRABToProfessionalExcel): baris tanpa
 *     harga = teks 'HARGA BELUM TERSEDIA' / '–' (bukan Rp0), total seksi &
 *     grand total mengecualikan total basi, label PARSIAL di cover /
 *     ringkasan / rekap / catatan, sheet validasi membedakan unresolved
 *     dari Rp0 valid.
 *  7. PDF NYATA (exportProjectToPDF): penanda HARGA BELUM TERSEDIA +
 *     peringatan item tanpa harga ada di dokumen.
 *
 * Jalankan: npx --yes tsx src/test/exportPriceIntegrity.test.ts
 * (Skrip tsx mandiri dengan assert — repo ini tidak punya paket vitest.)
 */
import ExcelJS from 'exceljs';
import { strict as assert } from 'node:assert';
import {
  isExportPriceValid,
  exportItemAmount,
  summarizeExportItems,
  summarizeExportSections,
  exportTotalNote,
} from '../export/priceIntegrity';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { resolveItemAmount, computeLaporanSummary } from '../lib/laporanSummary';
import { buildExcelSourceText, exportRABToProfessionalExcel } from '../export/excelExportEngine';
import { exportProjectToPDF } from '../export/pdfExporter';
import { summarizeStoredItems } from '../ai-tools/ezrab-ai/universalRab';
import type { Project, Company } from '../types';

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
const RESMI = { volume: 100, unit: 'm2', unitPrice: 15000, totalPrice: 1500000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' };
const PASAR = { volume: 10, unit: 'm3', unitPrice: 500000, totalPrice: 5000000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE', priceSourceName: null };
const MANUAL = { volume: 2, unit: 'ls', unitPrice: 250000, totalPrice: 500000, priceStatus: 'PRICE_MANUAL' };
const NOL_VALID = { volume: 5, unit: 'm2', unitPrice: 0, totalPrice: 0, priceStatus: 'PRICE_RESOLVED' };
// Sentinel + TOTAL BASI: factory tidak pernah menghasilkan ini, tapi jalur
// tulis non-factory/impor bisa — gerbang ekspor harus membuangnya juga.
const Basi = { volume: 20, unit: 'm2', unitPrice: 0, totalPrice: 999999999, priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'UNRESOLVED' };
const NULL_UNRESOLVED = { volume: 3, unit: 'ls', unitPrice: null, totalPrice: null, priceStatus: 'PRICE_UNRESOLVED' };
const LEGACY = { volume: 4, unit: 'm', unitPrice: 100000, totalPrice: 400000 };

const GATED_TOTAL = 1500000 + 5000000 + 500000 + 0 + 400000; // 7_400_000
const GATED_DIRECT = GATED_TOTAL;
const GATED_GRAND = Math.round((GATED_DIRECT + Math.round(GATED_DIRECT * 0.05) + Math.round(GATED_DIRECT * 0.05)) * 1.11); // 9_035_400

function company(): Company {
  return {
    id: 'comp-1', name: 'PT Uji Ekspor', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: '',
    defaultOverheadPercent: 5, defaultProfitPercent: 5,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

function itemRow(base: any, extra: any): any {
  return {
    id: extra.id, sectionId: 'sec-A', itemNumber: extra.itemNumber, code: extra.code,
    description: extra.description, specification: '', volume: base.volume, unit: base.unit,
    materialPrice: 0, laborPrice: 0, equipmentPrice: 0,
    unitPrice: base.unitPrice, totalPrice: base.totalPrice,
    verificationStatus: 'VERIFIED',
    ...(base.priceStatus ? { priceStatus: base.priceStatus } : {}),
    ...(base.priceSourceKind ? { priceSourceKind: base.priceSourceKind } : {}),
    ...(base.priceSourceName !== undefined ? { priceSourceName: base.priceSourceName } : {}),
  };
}

function mixedProject(): Project {
  return {
    id: 'proj-exp-1', projectNumber: 'PRJ-EXP-001', name: 'Proyek Uji Ekspor',
    location: 'Jakarta', clientName: 'Klien Uji', status: 'draft',
    currentVersion: 'Rev 00',
    costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as any,
    sections: [
      {
        id: 'sec-A', code: 'A', name: 'Pekerjaan Persiapan',
        // Subtotal tersimpan SENGAJA basi/salah — ekspor harus menghitung
        // ulang digating, bukan mempercayainya.
        subtotal: 1000000000,
        items: [
          itemRow(RESMI, { id: 'a1', itemNumber: '1', code: 'A.1', description: 'Pembersihan lahan RESMI' }),
          itemRow(PASAR, { id: 'a2', itemNumber: '2', code: 'A.2', description: 'Urugan pasir PASAR' }),
          itemRow(MANUAL, { id: 'a3', itemNumber: '3', code: 'A.3', description: 'Pekerjaan khusus MANUAL' }),
          itemRow(NOL_VALID, { id: 'a4', itemNumber: '4', code: 'A.4', description: 'Pekerjaan gratis NOLVALID' }),
          itemRow(Basi, { id: 'a5', itemNumber: '5', code: 'A.5', description: 'Pekerjaan belum ada harga BASI' }),
          itemRow(NULL_UNRESOLVED, { id: 'a6', itemNumber: '6', code: 'A.6', description: 'Pekerjaan belum ada harga NULL' }),
        ],
      },
      {
        id: 'sec-B', code: 'B', name: 'Pekerjaan Struktur',
        subtotal: 400000,
        items: [itemRow(LEGACY, { id: 'b1', itemNumber: '1', code: 'B.1', description: 'Beton legacy LEGACY' })],
      },
    ],
    rabItems: [],
  } as unknown as Project;
}

function cellText(cell: any): string {
  const v = cell.value;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'result' in v) return String((v as any).result);
  if (typeof v === 'number') return String(v);
  return '';
}
function cellNum(cell: any): number | null {
  const v = cell.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in v && typeof (v as any).result === 'number') return (v as any).result;
  return null;
}

// ---------------------------------------------------------------- helper gate
function testHelperGate(): void {
  console.log('\n[1] Gerbang helper priceIntegrity:');
  eq('sentinel 0 + UNRESOLVED tidak valid', isExportPriceValid(Basi as any), false);
  eq('total basi UNRESOLVED -> null (bukan 999999999)', exportItemAmount(Basi as any), null);
  eq('harga null + UNRESOLVED -> null', exportItemAmount(NULL_UNRESOLVED as any), null);
  eq('harga Rp0 valid (RESOLVED) tetap valid', isExportPriceValid(NOL_VALID as any), true);
  eq('harga Rp0 valid -> amount 0 (bukan null)', exportItemAmount(NOL_VALID as any), 0);
  eq('resmi valid', exportItemAmount(RESMI as any), 1500000);
  eq('manual valid (override tersimpan menang)', exportItemAmount(MANUAL as any), 500000);
  eq('legacy tanpa status diperlakukan teresolusi', isExportPriceValid(LEGACY as any), true);
  const s = summarizeExportItems([RESMI, PASAR, MANUAL, NOL_VALID, Basi, NULL_UNRESOLVED, LEGACY] as any);
  eq('subtotal resmi', s.officialTotal, 1500000);
  eq('subtotal pasar', s.marketTotal, 5000000);
  eq('subtotal manual', s.manualTotal, 500000);
  eq('subtotal lainnya (legacy)', s.otherTotal, 400000);
  eq('total berharga mengecualikan basi+null', s.pricedTotal, GATED_TOTAL);
  eq('item berharga', s.pricedCount, 5);
  eq('item belum-terhitung', s.unpricedCount, 2);
  eq('isPartial true', s.isPartial, true);
  eq('isMixed true (campur resmi/pasar/manual/lainnya)', s.isMixed, true);
  check('label PARSIAL menyebut 2 item', exportTotalNote(s).includes('2 item'));
  // Konsistensi hitungan dengan helper tahap hardening (basis vol×harga).
  const stored = summarizeStoredItems([RESMI, PASAR, MANUAL, NOL_VALID, Basi, NULL_UNRESOLVED, LEGACY] as any);
  eq('pricedCount selaras summarizeStoredItems', stored.pricedCount, s.pricedCount);
  eq('unpricedCount selaras summarizeStoredItems', stored.unpricedCount, s.unpricedCount);
  // Label sumber pasar: tanpa nama/tanggal/wilayah karangan.
  eq('label pasar tanpa nama karangan', buildExcelSourceText(PASAR as any), 'REFERENSI PASAR');
  eq('label manual', buildExcelSourceText(MANUAL as any), 'INPUT MANUAL');
}

// ---------------------------------------------------------------- engine gate
function testEngineGate(): void {
  console.log('\n[2] UnifiedProjectEngine (subtotal tersimpan basi):');
  const proj = mixedProject();
  const costs = UnifiedProjectEngine.computeCostSummaryFromSections(proj, (proj as any).sections);
  eq('directCost digating (bukan subtotal basi 1.000.000.000)', costs.directCost, GATED_DIRECT);
  eq('grandTotal digating', costs.grandTotal, GATED_GRAND);
  eq('unresolvedItems terhitung', costs.unresolvedItems, 2);

  console.log('\n[3] normalizeSections (rekonstruksi dari item flat):');
  const flatProj = {
    id: 'proj-flat', sections: [], rabItems: [
      { id: 'f1', category: 'Persiapan', description: 'Item resmi flat', volume: 10, unit: 'm2', unitPrice: 10000, amount: 100000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' },
      { id: 'f2', category: 'Persiapan', description: 'Item basi flat', volume: 10, unit: 'm2', unitPrice: 0, totalPrice: 777000, priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'UNRESOLVED' },
    ],
  } as unknown as Project;
  const secs = UnifiedProjectEngine.normalizeSections(flatProj);
  eq('satu seksi hasil rekonstruksi', secs.length, 1);
  eq('subtotal rekonstruksi mengecualikan basi', secs[0].subtotal, 100000);
  eq('priceStatus diteruskan ke item rekonstruksi', (secs[0].items[1] as any).priceStatus, 'PRICE_UNRESOLVED');
  eq('priceSourceKind diteruskan', (secs[0].items[0] as any).priceSourceKind, 'OFFICIAL_AHSP');

  console.log('\n[4] Kontrak sentinel rabItemFactory TIDAK berubah:');
  const unres = createRabItemRecord({ description: 'X', volume: 10, unit: 'm2', unitPrice: 999 as any, priceStatus: 'PRICE_UNRESOLVED' } as any, 'p1');
  eq('UNRESOLVED tetap disimpan unitPrice 0', unres.unitPrice, 0);
  eq('UNRESOLVED tetap disimpan amount 0', unres.amount, 0);
  eq('record UNRESOLVED tidak valid untuk ekspor', isExportPriceValid(unres as any), false);
  const zero = createRabItemRecord({ description: 'Y', volume: 5, unit: 'm2', unitPrice: 0 } as any, 'p1');
  eq('nol eksplisit tetap PRICE_RESOLVED', zero.priceStatus, 'PRICE_RESOLVED');
  eq('nol eksplisit valid untuk ekspor', isExportPriceValid(zero as any), true);

  console.log('\n[5] Ringkasan laporan (laporanSummary):');
  eq('sentinel amount 0 + UNRESOLVED -> null', resolveItemAmount({ amount: 0, priceStatus: 'PRICE_UNRESOLVED' } as any), null);
  eq('amount 0 + RESOLVED -> 0 sah', resolveItemAmount({ amount: 0, priceStatus: 'PRICE_RESOLVED' } as any), 0);
  const lap = computeLaporanSummary([
    { category: 'A', volume: 1, unitPrice: 1000, amount: 1000, priceStatus: 'PRICE_RESOLVED' },
    { category: 'A', volume: 1, unitPrice: 0, amount: 0, priceStatus: 'PRICE_UNRESOLVED' },
  ] as any, []);
  eq('laporan: priced 1', lap.pricedItemCount, 1);
  eq('laporan: unpriced 1', lap.unpricedItemCount, 1);
  eq('laporan: total hanya item berharga', lap.totalRabValue, 1000);
  eq('laporan: state PARTIAL', lap.rabTotalState, 'PARTIAL');
}

// ---------------------------------------------------------------- Excel nyata
async function testRealExcel(): Promise<void> {
  console.log('\n[6] Workbook Excel NYATA:');
  const blob = await exportRABToProfessionalExcel(mixedProject(), company(), { preset: 'COMPLETE_PACKAGE' } as any);
  check('ekspor mengembalikan Blob', blob instanceof Blob && blob.size > 0, `size=${blob.size}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));

  const detail = wb.getWorksheet('05_RAB_Detail');
  assert.ok(detail, 'sheet 05_RAB_Detail ada');
  const rowsByDesc = new Map<string, any>();
  const numericCells: number[] = [];
  detail!.eachRow((row) => {
    row.eachCell((cell) => {
      const n = cellNum(cell);
      if (n !== null) numericCells.push(n);
    });
    const desc = String(row.getCell(3).value || '');
    if (desc) rowsByDesc.set(desc, row);
  });
  check('total basi 999999999 tidak ada di sheet detail', !numericCells.includes(999999999));
  check('subtotal basi 1000000000 tidak ada di sheet detail', !numericCells.includes(1000000000));
  const basiRow = rowsByDesc.get('Pekerjaan belum ada harga BASI');
  assert.ok(basiRow, 'baris BASI ditemukan');
  eq('baris BASI: sel harga = teks (bukan 0)', basiRow!.getCell(6).value, 'HARGA BELUM TERSEDIA');
  eq('baris BASI: sel jumlah = –', basiRow!.getCell(7).value, '–');
  const nullRow = rowsByDesc.get('Pekerjaan belum ada harga NULL');
  assert.ok(nullRow, 'baris NULL ditemukan');
  eq('baris NULL: sel harga = teks', nullRow!.getCell(6).value, 'HARGA BELUM TERSEDIA');
  const nolRow = rowsByDesc.get('Pekerjaan gratis NOLVALID');
  assert.ok(nolRow, 'baris NOLVALID ditemukan');
  eq('baris NOLVALID: harga Rp0 valid tetap angka 0 (tidak jadi teks)', nolRow!.getCell(6).value, 0);
  const resmiRow = rowsByDesc.get('Pembersihan lahan RESMI');
  assert.ok(resmiRow, 'baris RESMI ditemukan');
  eq('baris RESMI: jumlah = 1500000', cellNum(resmiRow!.getCell(7)), 1500000);
  eq('baris RESMI: sumber = RESMI AHSP (bukan karangan)', String(resmiRow!.getCell(9).value || '').includes('RESMI AHSP'), true);

  const recap = wb.getWorksheet('04_RAB_Recapitulation');
  assert.ok(recap, 'sheet rekap ada');
  let recapA: number | null = null;
  let recapB: number | null = null;
  recap!.eachRow((row) => {
    const name = String(row.getCell(4).value || '');
    if (name === 'Pekerjaan Persiapan') recapA = cellNum(row.getCell(5));
    if (name === 'Pekerjaan Struktur') recapB = cellNum(row.getCell(5));
  });
  eq('rekap seksi A digating', recapA, 7000000);
  eq('rekap seksi B', recapB, 400000);

  const sum = wb.getWorksheet('03_Estimate_Summary');
  assert.ok(sum, 'sheet ringkasan ada');
  eq('kartu grand total digating', cellNum(sum!.getCell('E5')), GATED_GRAND);
  check('label kartu grand total PARSIAL', String(sum!.getCell('E4').value || '').includes('PARSIAL'));
  check('label total ringkasan PARSIAL', String(sum!.getCell('D12').value || '').includes('PARSIAL'));
  eq('total seksi A di ringkasan', cellNum(sum!.getCell('E10')), 7000000);

  const cover = wb.getWorksheet('01_Cover');
  assert.ok(cover, 'sheet cover ada');
  check('judul cover PARSIAL', String(cover!.getCell('B19').value || '').includes('PARSIAL'));
  eq('grand total cover digating', cellNum(cover!.getCell('B20')), GATED_GRAND);

  const valWb = new ExcelJS.Workbook();
  // COMPLETE_PACKAGE tidak menyertakan sheet validasi — ekspor kedua
  // dengan peta sheet eksplisit (semua true) untuk menguji sheet itu.
  const valBlob = await exportRABToProfessionalExcel(mixedProject(), company(), {
    sheets: {
      validation: true, cover: true, projectInfo: true, estimateSummary: true,
      rabRecap: true, rabDetail: true, boq: true, boqMc0: true, ahsp: true,
      materials: true, labor: true, equipment: true, schedule: true,
      kurvaS: true, cashflow: true, notes: true,
    },
  } as any);
  await valWb.xlsx.load(Buffer.from(await valBlob.arrayBuffer()));
  const val = valWb.getWorksheet('00_Validasi');
  assert.ok(val, 'sheet validasi ada');
  let valStatus = '';
  let valValue = '';
  val!.eachRow((row) => {
    if (String(row.getCell(3).value || '') === 'Integritas Volume & Harga Satuan') {
      valStatus = String(row.getCell(4).value || '');
      valValue = String(row.getCell(5).value || '');
    }
  });
  eq('validasi: status WARNING (ada unresolved)', valStatus, 'WARNING');
  check('validasi: nilai menyebut HARGA BELUM TERSEDIA', valValue.includes('HARGA BELUM TERSEDIA'), valValue);
  check('validasi: nilai menyebut 2 item', valValue.includes('2 item'), valValue);

  const notes = wb.getWorksheet('15_Notes');
  assert.ok(notes, 'sheet catatan ada');
  let notesAll = '';
  notes!.eachRow((row) => { notesAll += ` ${String(row.getCell(3).value || '')}`; });
  check('catatan: jejak TOTAL PARSIAL', notesAll.includes('TOTAL PARSIAL'), notesAll.slice(0, 200));
  check('catatan: perincian resmi/pasar/manual', notesAll.includes('resmi Rp') && notesAll.includes('referensi pasar Rp'), notesAll.slice(0, 300));

  const boq = wb.getWorksheet('06_BOQ');
  assert.ok(boq, 'sheet BOQ ada');
  let boqBasiPrice: unknown = null;
  let boqBasiTotal: unknown = null;
  boq!.eachRow((row) => {
    if (String(row.getCell(3).value || '') === 'Pekerjaan belum ada harga BASI') {
      boqBasiPrice = row.getCell(6).value;
      boqBasiTotal = row.getCell(7).value;
    }
  });
  eq('BOQ baris BASI: harga teks', boqBasiPrice, 'HARGA BELUM TERSEDIA');
  eq('BOQ baris BASI: jumlah –', boqBasiTotal, '–');
}

// ---------------------------------------------------------------- PDF nyata
async function testRealPdf(): Promise<void> {
  console.log('\n[7] PDF NYATA:');
  const doc: any = await exportProjectToPDF(mixedProject(), company(), { subscriptionPlan: 'free' } as any);
  if (!doc || typeof doc.output !== 'function') {
    console.log('  SKIP (environment): bukan instance jsPDF');
    return;
  }
  const datauri: string = doc.output('datauristring');
  const buf = Buffer.from((datauri.split(',')[1] || ''), 'base64');
  // Stream konten jsPDF terkompresi Flate — teks literal tidak tampak di
  // byte mentah; inflate semua stream lalu cari di teks gabungan.
  const zlib = await import('node:zlib');
  let text = buf.toString('latin1');
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let sm: RegExpExecArray | null;
  while ((sm = streamRe.exec(text)) !== null) {
    try {
      text += '\n' + zlib.inflateSync(Buffer.from(sm[1], 'latin1')).toString('latin1');
    } catch { /* stream bukan Flate — abaikan */ }
  }
  check('PDF memuat HARGA BELUM TERSEDIA', text.includes('HARGA BELUM TERSEDIA'));
  check('PDF memuat PERINGATAN item tanpa harga', text.includes('PERINGATAN'));
  check('PDF memuat label PARSIAL', text.includes('PARSIAL'));
}

async function main(): Promise<void> {
  testHelperGate();
  testEngineGate();
  await testRealExcel();
  await testRealPdf();
  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  } else {
    console.log('SEMUA TEST EXPORT PRICE INTEGRITY LOLOS');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
