/**
 * §3 FINAL INTEGRITY REPAIR (2026-11-13) — VERIFIKASI + PENGERASAN pendekatan
 * TOLERANSI pembulatan ekspor 5 sheet.
 *
 * Kebijakan yang diuji (keputusan owner 2026-11-13 20:04: "terima +
 * toleransi", sudah diimplementasikan di `src/export/fiveSheetPreset.ts`):
 *   |grand Sheet 1 − grand Sheet 2| ≤ jumlah baris item × Rp1
 * Suite ini MEMVERIFIKASI kebijakan itu — BUKAN menggantinya. Tidak ada
 * rekonsiliasi eksak di sini (opsi ROUND per baris / grand Sheet 2 merujuk
 * Sheet 1 ditolak owner); bila toleransi terbukti tidak cukup pada kasus
 * mana pun, itu dilaporkan sebagai TEMUAN TERBUKA, bukan diperbaiki
 * diam-diam dengan mengubah preset.
 *
 * Mekanisme yang direproduksi (akar penyebab selisih Rp1,55 tercatat):
 * Sheet 1 grand dihitung dari komponen tersimpan yang dibulatkan ke rupiah
 * bulat (engine memakai Math.round saat entri), sedangkan Sheet 2 grand
 * dijumlah dari formula live volume × harga satuan per baris. Tiap baris
 * menyumbang selisih paling banyak ±Rp0,50 (pembulatan ke rupiah terdekat).
 *
 * Yang dibuktikan suite ini:
 *  (a) Fixture regresi tingkat workbook yang MEREPRODUKSI selisih Rp1,55
 *      PERSIS dari data (5 baris, bagian fraksional produk eksak
 *      .30/.30/.30/.30/.35 yang semuanya membulat ke bawah):
 *        Σ produk eksak = 445.001,55 ; Σ tersimpan-terbulatkan = 445.000
 *        → selisih +1,55 — dibuktikan PASCA-RECALC LibreOffice, bukan
 *        dari nilai cached ExcelJS (cached menyembunyikan selisih).
 *  (b) Uji tepi: kuantitas desimal, harga satuan fraksional, akumulasi
 *      500 baris (toleransi per-baris tetap menahan), nilai proyek besar,
 *      dan O&P + pajak aktif (selisih tetap 1,55 karena komponen tangga
 *      adalah nilai snapshot di kedua sheet).
 *  (c) Penyesuaian negatif: TIDAK ADA fitur eksplisit di kode (tanpa tipe
 *      item deduksi/kredit, tanpa validasi khusus) — dicatat NOT RUN
 *      sebagai fitur; probe empiris aliran-aritmetika dijalankan terpisah
 *      dan dilaporkan sebagai observasi, BUKAN sebagai dukungan fitur.
 *  (d) Metode recalc dibuktikan dengan probe (sel =2+2 dengan cached 999
 *      yang sengaja salah → 4 sesudah LO), memakai profil
 *      OOXMLRecalcMode=0 (metode P5; profil dibuat ulang di shim-s3
 *      karena shim P5 sudah dibersihkan).
 *
 * Jalankan: npx --yes tsx src/test/p5RoundingTolerance.test.ts
 * (Skrip tsx mandiri dengan assert — pola p5FiveSheetExport.test.ts.)
 * Bukti (workbook fixture pra/pasca-recalc + profil LO) ditulis ke
 *   $S3_OUTDIR (bila diset) atau
 *   ~/workspace/your_files/EZRAB-FINAL-INTEGRITY-REPAIR-2026-11-13/shim-s3/
 * Membutuhkan /usr/bin/soffice (LibreOffice 24.2.7.2 di VM ini).
 * TANPA panggilan provider, TANPA mengubah berkas src selain suite ini.
 */
import ExcelJS from 'exceljs';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import {
  FIVE_SHEET_NAMES,
  FIVE_SHEET_PRESET_ID,
  ROUNDING_TOLERANCE_PER_ROW_IDR,
  roundingToleranceFor,
  roundingToleranceNote,
} from '../export/fiveSheetPreset';
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
/** Selisih rupiah dalam epsilon float (batas tugas: < 0,01). */
function approxRp(name: string, actual: number | null, expected: number, eps = 0.01): void {
  const ok = actual !== null && Math.abs(actual - expected) < eps;
  check(name, ok, `aktual=${actual} harap=${expected} (eps ${eps})`);
}

// ---------------------------------------------------------------- direktori
const S3_DIR =
  process.env.S3_OUTDIR ||
  path.join(os.homedir(), 'workspace/your_files/EZRAB-FINAL-INTEGRITY-REPAIR-2026-11-13/shim-s3');
const LOG_DIR = path.join(S3_DIR, 'logs');
const RECALC_DIR = path.join(LOG_DIR, 'recalc');
const PROFILE_DIR = path.join(S3_DIR, 'lo-profile-recalc');
const SOFFICE = '/usr/bin/soffice';

// ---------------------------------------------------------------- fixtures
function company(): Company {
  return {
    id: 'comp-s3', name: 'PT Uji S3', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 0, defaultProfitPercent: 0,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

/**
 * Satu baris fixture: volume × unitPrice = produk eksak (bisa fraksional);
 * totalPrice tersimpan = Math.round(produk) — persis mekanisme engine saat
 * entri (pembulatan ke rupiah bulat). Selisih baris = eksak − tersimpan,
 * |selisih| ≤ 0,50.
 */
interface FixtureRow {
  code: string;
  description: string;
  volume: number;
  unit: string;
  unitPrice: number;
}
function rowTotalPrice(r: FixtureRow): number {
  return Math.round(r.volume * r.unitPrice);
}
function rowExact(r: FixtureRow): number {
  return r.volume * r.unitPrice;
}
function fixtureSums(rows: FixtureRow[]): { exact: number; stored: number; diff: number } {
  const exact = rows.reduce((s, r) => s + rowExact(r), 0);
  const stored = rows.reduce((s, r) => s + rowTotalPrice(r), 0);
  return { exact, stored, diff: exact - stored };
}

function makeItem(r: FixtureRow, idx: number): any {
  return {
    sectionId: 'sec-A',
    itemNumber: String(idx + 1),
    code: r.code,
    description: r.description,
    specification: '',
    volume: r.volume,
    unit: r.unit,
    materialPrice: 0,
    laborPrice: 0,
    equipmentPrice: 0,
    unitPrice: r.unitPrice,
    totalPrice: rowTotalPrice(r),
    verificationStatus: 'VERIFIED',
    id: `s3-${r.code}`,
    priceStatus: 'PRICE_RESOLVED',
    priceSourceKind: 'MARKET_REFERENCE',
  };
}

function s3Project(
  rows: FixtureRow[],
  opts: { overheadPercent?: number; profitPercent?: number; ppnEnabled?: boolean; ppnPercent?: number; name?: string }
): Project {
  return {
    id: 'proj-s3',
    projectNumber: 'PRJ-S3-001',
    name: opts.name || 'Proyek Uji S3 Toleransi Pembulatan',
    location: 'Malang',
    clientName: 'Klien Uji S3',
    buildingType: 'Rumah Tinggal',
    buildingArea: 120,
    status: 'draft',
    overheadPercent: opts.overheadPercent ?? 0,
    ppnEnabled: opts.ppnEnabled ?? false,
    ppnPercent: opts.ppnPercent ?? 11,
    currentVersion: 'Rev 01',
    costSummary: { profitPercent: opts.profitPercent ?? 0, taxPercent: 11 } as any,
    sections: [
      {
        id: 'sec-A', code: 'A', name: 'Pekerjaan Uji Toleransi', subtotal: 0,
        items: rows.map((r, i) => makeItem(r, i)),
      },
    ],
    rabItems: [],
  } as unknown as Project;
}

// --- (a) Fixture utama: 5 baris, selisih +Rp1,55 persis --------------------
// R1: 2,5 × 40.000,12   = 100.000,30 → tersimpan 100.000 → +0,30
// R2: 1,25 × 80.000,24  = 100.000,30 → tersimpan 100.000 → +0,30
// R3: 4 × 12.500,075    = 50.000,30  → tersimpan 50.000  → +0,30
// R4: 0,5 × 150.000,60  = 75.000,30  → tersimpan 75.000  → +0,30
// R5: 2 × 60.000,175    = 120.000,35 → tersimpan 120.000 → +0,35
// Σ eksak 445.001,55 − Σ tersimpan 445.000 = +1,55 (toleransi Rp5).
const MAIN_ROWS: FixtureRow[] = [
  { code: 'A.1', description: 'Item uji fraksional 1 (vol desimal 2,5)', volume: 2.5, unit: 'm3', unitPrice: 40000.12 },
  { code: 'A.2', description: 'Item uji fraksional 2 (vol desimal 1,25)', volume: 1.25, unit: 'm2', unitPrice: 80000.24 },
  { code: 'A.3', description: 'Item uji fraksional 3 (harga 3 desimal)', volume: 4, unit: 'm', unitPrice: 12500.075 },
  { code: 'A.4', description: 'Item uji fraksional 4 (vol desimal 0,5)', volume: 0.5, unit: 'ls', unitPrice: 150000.6 },
  { code: 'A.5', description: 'Item uji fraksional 5 (fraksi ,35)', volume: 2, unit: 'bh', unitPrice: 60000.175 },
];

// --- (b1) Kuantitas desimal murni (3 baris, selisih +Rp0,40) ----------------
// 3,75 × 26.666,68 = 100.000,05 → +0,05
// 0,125 × 800.002,40 = 100.000,30 → +0,30
// 7,5 × 13.333,34 = 100.000,05 → +0,05
const DECIMAL_ROWS: FixtureRow[] = [
  { code: 'A.1', description: 'Vol desimal 3,75', volume: 3.75, unit: 'm3', unitPrice: 26666.68 },
  { code: 'A.2', description: 'Vol desimal 0,125', volume: 0.125, unit: 'm2', unitPrice: 800002.4 },
  { code: 'A.3', description: 'Vol desimal 7,5', volume: 7.5, unit: 'm', unitPrice: 13333.34 },
];

// --- (b2) Akumulasi 500 baris: tiap baris +0,49 (dekat batas teoretis +0,50)
// Σ selisih = 500 × 0,49 = +245,00 ; toleransi Rp500 (headroom 2×). ---------
const ACCUM_ROWS: FixtureRow[] = Array.from({ length: 500 }, (_, i) => ({
  code: `A.${i + 1}`,
  description: `Pekerjaan uji akumulasi #${i + 1}`,
  volume: 1,
  unit: 'ls',
  unitPrice: 10000.49,
}));

// --- (b3) PROBE penyesuaian negatif (BUKAN fitur — lihat [6]) ---------------
// +0,30 (normal) − 0,30 (baris negatif: −1 × 50.000,30 = −50.000,30 →
// tersimpan Math.round(−50.000,30) = −50.000) + 0,35 (normal) = +0,35.
const NEGATIVE_ROWS: FixtureRow[] = [
  { code: 'A.1', description: 'Item normal probe negatif', volume: 1, unit: 'ls', unitPrice: 100000.3 },
  { code: 'A.2', description: 'PROBE: baris penyesuaian negatif (vol −1)', volume: -1, unit: 'ls', unitPrice: 50000.3 },
  { code: 'A.3', description: 'Item normal probe negatif 2', volume: 2, unit: 'bh', unitPrice: 60000.175 },
];

// --- (b4) Nilai proyek besar (6 baris, grand ±Rp20 miliar) ------------------
// 5 × (1 × 2.000.000.000,30) = +0,30/baris → +1,50
// 1 × (1234,5 × 8.100.000,25) = 9.999.450.308,625 → tersimpan
//   9.999.450.309 → −0,375. Total +1,125 ; toleransi Rp6.
const LARGE_ROWS: FixtureRow[] = [
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `A.${i + 1}`,
    description: `Item nilai besar #${i + 1} (Rp2 miliar)`,
    volume: 1,
    unit: 'ls',
    unitPrice: 2000000000.3,
  })),
  { code: 'A.6', description: 'Item volume besar × harga besar', volume: 1234.5, unit: 'm3', unitPrice: 8100000.25 },
];

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

/** Grand Sheet 1 (kolom B, label di kolom A) + grand Sheet 2 (kolom H, label kolom C). */
function readGrands(wb: ExcelJS.Workbook): { grand1: number | null; grand2: number | null; direct1: number | null; direct2: number | null } {
  const ws1 = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const ws2 = wb.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  const g1Row = findRowByText(ws1, 'GRAND TOTAL', 1);
  const g2Row = findRowByText(ws2, 'GRAND TOTAL', 3);
  const d1Row = findRowByText(ws1, 'Biaya Langsung', 1);
  const d2Row = findRowByText(ws2, 'TOTAL BIAYA LANGSUNG', 3);
  return {
    grand1: g1Row > 0 ? cellNum(ws1.getCell(`B${g1Row}`)) : null,
    grand2: g2Row > 0 ? cellNum(ws2.getCell(`H${g2Row}`)) : null,
    direct1: d1Row > 0 ? cellNum(ws1.getCell(`B${d1Row}`)) : null,
    direct2: d2Row > 0 ? cellNum(ws2.getCell(`H${d2Row}`)) : null,
  };
}

async function exportToFile(project: Project, fileName: string): Promise<string> {
  const blob = await exportRABToProfessionalExcel(project, company(), {
    preset: FIVE_SHEET_PRESET_ID,
  } as any);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const file = path.join(LOG_DIR, fileName);
  fs.writeFileSync(file, buffer);
  return file;
}

async function readWorkbook(file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

// ---------------------------------------------------------------- tests
function testFixtureArithmetic(): void {
  console.log('\n[0] Aritmetika fixture di JS (sebelum workbook):');
  // Tabel per baris fixture utama — perhitungan ditampilkan, bukan diklaim.
  MAIN_ROWS.forEach((r, i) => {
    const exact = rowExact(r);
    const stored = rowTotalPrice(r);
    console.log(
      `      R${i + 1}: ${r.volume} × ${r.unitPrice} = ${exact} → tersimpan ${stored} → selisih +${(exact - stored).toFixed(2)}`
    );
    check(`R${i + 1} |selisih baris| ≤ Rp0,50 (batas teoretis)`, Math.abs(exact - stored) <= 0.5 + 1e-9,
      `selisih=${exact - stored}`);
  });
  const m = fixtureSums(MAIN_ROWS);
  console.log(`      Σ eksak ${m.exact} − Σ tersimpan ${m.stored} = ${m.diff}`);
  approxRp('fixture utama: selisih == Rp1,55 (JS)', m.diff, 1.55, 1e-6);
  eq('fixture utama: Σ tersimpan == Rp445.000', m.stored, 445000);
  check('fixture utama: selisih ≤ toleransi Rp5 (5 baris)', m.diff <= roundingToleranceFor(5));
  check('batas teoretis: 5 × Rp0,50 = Rp2,50 ≤ toleransi Rp5 (headroom 2×)',
    5 * 0.5 <= roundingToleranceFor(5));

  const d = fixtureSums(DECIMAL_ROWS);
  approxRp('tepi desimal: selisih == Rp0,40 (JS)', d.diff, 0.4, 1e-6);
  const a = fixtureSums(ACCUM_ROWS);
  approxRp('tepi akumulasi 500 baris: selisih == Rp245,00 (JS)', a.diff, 245, 1e-6);
  check('tepi akumulasi: Rp245 ≤ toleransi Rp500', a.diff <= roundingToleranceFor(500));
  const n = fixtureSums(NEGATIVE_ROWS);
  approxRp('probe negatif: selisih == Rp0,35 (JS)', n.diff, 0.35, 1e-6);
  const l = fixtureSums(LARGE_ROWS);
  approxRp('tepi nilai besar: selisih == Rp1,125 (JS)', l.diff, 1.125, 1e-6);
  eq('tepi nilai besar: Σ tersimpan == Rp19.999.450.309', l.stored, 19999450309);
  // Campuran tanda (JS saja): 250×+0,49 + 250×−0,49 → net ≈ 0.
  let mixed = 0;
  for (let i = 0; i < 250; i++) mixed += 10000.49 - Math.round(10000.49);
  for (let i = 0; i < 250; i++) mixed += 10000.51 - Math.round(10000.51);
  approxRp('campuran tanda 500 baris (JS): net ≈ Rp0', mixed, 0, 1e-6);
}

async function testGenerateMainFixture(): Promise<{ preFile: string; wb: ExcelJS.Workbook }> {
  console.log('\n[1] Generate fixture utama via preset (pra-recalc):');
  const preFile = await exportToFile(s3Project(MAIN_ROWS, {}), 'fixture-155-5baris.xlsx');
  const stat = fs.statSync(preFile);
  check('workbook fixture utama tertulis', stat.size > 0, `size=${stat.size}`);
  const wb = await readWorkbook(preFile);
  eq('tepat 5 sheet', wb.worksheets.length, 5);
  const ws2 = wb.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  const a1Row = findRowByText(ws2, 'A.1', 2);
  check('baris A.1 ditemukan di Sheet 2', a1Row > 0);
  check('A.1 jumlah memakai formula live F*G', (cellFormula(ws2.getCell(`H${a1Row}`)) || '').includes('F'));
  eq('A.1 volume tertulis 2,5', cellNum(ws2.getCell(`F${a1Row}`)), 2.5);
  eq('A.1 harga satuan fraksional tertulis', cellNum(ws2.getCell(`G${a1Row}`)), 40000.12);
  // Nilai CACHED ExcelJS menyembunyikan selisih (result = amount tersimpan)
  // — inilah alasan recalc LO wajib: tanpa recalc, selisih tak terlihat.
  const g = readGrands(wb);
  eq('pra-recalc (cached): grand Sheet 1 == Rp445.000', g.grand1, 445000);
  eq('pra-recalc (cached): grand Sheet 2 == Rp445.000 (selisih tersembunyi)', g.grand2, 445000);
  check('pra-recalc (cached): selisih tampak 0 — recalc LO WAJIB untuk membuktikan',
    g.grand1 !== null && g.grand2 !== null && Math.abs(g.grand1 - g.grand2) === 0);
  // Catatan toleransi dinyatakan di workbook fixture (5 baris → maks. Rp5).
  const ws1 = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  const text1 = sheetAllText(ws1);
  check('Sheet 1 memuat catatan pembulatan', text1.includes(roundingToleranceNote(5)));
  const ws5 = wb.getWorksheet(FIVE_SHEET_NAMES.sources)!;
  check('Sheet 5 memuat baris kebijakan pembulatan', sheetAllText(ws5).includes('Toleransi yang dinyatakan: Rp1 per baris item'));
  return { preFile, wb };
}

function writeLoProfile(): void {
  // Profil LO paksa-recalc (metode P5 §5; profil P5 sudah dibersihkan
  // bersama shim P5 — dibuat ulang di sini, di shim-s3).
  // OOXMLRecalcMode=0 → selalu hitung ulang formula saat memuat OOXML.
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROFILE_DIR, 'user'), { recursive: true });
  const xcu = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n` +
    ` <item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>\n` +
    `</oor:items>\n`;
  fs.writeFileSync(path.join(PROFILE_DIR, 'user', 'registrymodifications.xcu'), xcu);
}

async function buildProbeWorkbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Probe');
  // Cached result SENGAJA SALAH (999/111) — hanya recalc nyata yang
  // memperbaikinya menjadi 4/14.
  ws.getCell('A1').value = { formula: '2+2', result: 999 } as any;
  ws.getCell('A2').value = { formula: 'SUM(A1,10)', result: 111 } as any;
  const file = path.join(LOG_DIR, 'probe-recalc.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

function runLoRecalc(files: string[]): string {
  fs.mkdirSync(RECALC_DIR, { recursive: true });
  for (const f of fs.readdirSync(RECALC_DIR)) fs.rmSync(path.join(RECALC_DIR, f), { force: true });
  const args = [
    '--headless', '--norestore',
    `-env:UserInstallation=file://${PROFILE_DIR}`,
    '--convert-to', 'xlsx',
    '--outdir', RECALC_DIR,
    ...files,
  ];
  const out = execFileSync(SOFFICE, args, { timeout: 180000, encoding: 'utf-8' });
  return out;
}

async function testLoRecalcMethod(probePre: string): Promise<void> {
  console.log('\n[2] Metode recalc LO dibuktikan dengan probe:');
  check('soffice tersedia', fs.existsSync(SOFFICE));
  const probePost = path.join(RECALC_DIR, 'probe-recalc.xlsx');
  check('probe pasca-recalc tertulis', fs.existsSync(probePost));
  const wb = await readWorkbook(probePost);
  const ws = wb.getWorksheet('Probe')!;
  eq('probe A1 (=2+2, cached 999) → 4 sesudah LO recalc', cellNum(ws.getCell('A1')), 4);
  eq('probe A2 (=SUM(A1,10)) → 14', cellNum(ws.getCell('A2')), 14);
}

async function testMainFixtureRecalc(): Promise<void> {
  console.log('\n[3] Fixture utama PASCA-RECALC: selisih Rp1,55 direproduksi:');
  const post = path.join(RECALC_DIR, 'fixture-155-5baris.xlsx');
  check('fixture utama pasca-recalc tertulis', fs.existsSync(post));
  const wb = await readWorkbook(post);
  eq('5 sheet bertahan sesudah LO', wb.worksheets.length, 5);
  const g = readGrands(wb);
  console.log(`      Sheet 1 grand (pasca-recalc): ${g.grand1} | Sheet 2 grand: ${g.grand2}`);
  eq('Sheet 1 grand tetap Rp445.000 (komponen tersimpan, tak berubah recalc)', g.grand1, 445000);
  approxRp('Sheet 2 grand == Rp445.001,55 (formula live)', g.grand2, 445001.55);
  const diff = g.grand1 !== null && g.grand2 !== null ? g.grand2 - g.grand1 : null;
  console.log(`      selisih (Sheet 2 − Sheet 1): ${diff}`);
  approxRp('SELISIH == Rp1,55 PERSIS (pasca-recalc)', diff, 1.55);
  check('selisih ≤ toleransi Rp5 (5 baris × Rp1)', diff !== null && diff <= roundingToleranceFor(5),
    `selisih=${diff} toleransi=${roundingToleranceFor(5)}`);
  approxRp('Sheet 2 direct == Rp445.001,55 (selisih berasal dari kaki langsung)', g.direct2, 445001.55);
  eq('Sheet 1 direct == Rp445.000', g.direct1, 445000);
  // Per baris: jumlah live == produk eksak.
  const ws2 = wb.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  MAIN_ROWS.forEach((r) => {
    const row = findRowByText(ws2, r.code, 2);
    approxRp(`baris ${r.code} jumlah live == produk eksak ${rowExact(r)}`, row > 0 ? cellNum(ws2.getCell(`H${row}`)) : null, rowExact(r));
  });
  // Subtotal seksi == Σ produk eksak.
  const subRow = findRowByText(ws2, 'SUBTOTAL PEKERJAAN UJI TOLERANSI', 3);
  approxRp('subtotal seksi == Rp445.001,55', subRow > 0 ? cellNum(ws2.getCell(`H${subRow}`)) : null, 445001.55);
  // Kasus tercatat E2E yang direproduksi fixture ini (log verifikasi P0–P6).
  const recordedDiff = Math.abs(1089879733 - 1089879734.55);
  check('kasus tercatat E2E (213 baris, Rp1,55) tetap DI DALAM toleransi Rp213',
    recordedDiff <= roundingToleranceFor(213), `selisih tercatat=${recordedDiff}`);
}

async function testEdgeRecalc(
  label: string,
  fileName: string,
  rows: FixtureRow[],
  expectedDiff: number,
  expectedGrand1: number
): Promise<void> {
  console.log(`\n${label}`);
  const post = path.join(RECALC_DIR, fileName);
  check('workbook pasca-recalc tertulis', fs.existsSync(post));
  const wb = await readWorkbook(post);
  const g = readGrands(wb);
  const diff = g.grand1 !== null && g.grand2 !== null ? g.grand2 - g.grand1 : null;
  console.log(`      grand1=${g.grand1} grand2=${g.grand2} selisih=${diff} toleransi=Rp${roundingToleranceFor(rows.length)}`);
  eq('grand Sheet 1 == Σ tersimpan', g.grand1, expectedGrand1);
  approxRp(`selisih == Rp${expectedDiff} (pasca-recalc)`, diff, expectedDiff);
  check(`selisih ≤ toleransi Rp${roundingToleranceFor(rows.length)} (${rows.length} baris)`,
    diff !== null && Math.abs(diff) <= roundingToleranceFor(rows.length),
    `selisih=${diff}`);
}

async function main(): Promise<void> {
  console.log('S3 — Verifikasi + pengerasan toleransi pembulatan ekspor 5 sheet (keputusan owner: terima + toleransi Rp1/baris)');
  assert.ok(FIVE_SHEET_PRESET_ID === 'FIVE_SHEET_RAB');
  assert.ok(ROUNDING_TOLERANCE_PER_ROW_IDR === 1);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(RECALC_DIR, { recursive: true });
  if (!fs.existsSync(SOFFICE)) {
    console.error(`FATAL: ${SOFFICE} tidak ditemukan — recalc LibreOffice adalah inti suite ini, bukan opsional.`);
    process.exit(1);
  }

  // [0] Aritmetika murni.
  testFixtureArithmetic();

  // [1] Generate semua workbook fixture (jalur engine yang sama dengan E2E).
  const { preFile: mainPre } = await testGenerateMainFixture();
  console.log('\n[1b] Generate workbook tepi (pra-recalc):');
  const decimalPre = await exportToFile(s3Project(DECIMAL_ROWS, { name: 'Proyek Uji S3 Desimal' }), 'fixture-desimal-3baris.xlsx');
  const accumPre = await exportToFile(s3Project(ACCUM_ROWS, { name: 'Proyek Uji S3 Akumulasi 500 Baris' }), 'fixture-akumulasi-500baris.xlsx');
  const negPre = await exportToFile(s3Project(NEGATIVE_ROWS, { name: 'Proyek Uji S3 Probe Negatif' }), 'fixture-negatif-probe-3baris.xlsx');
  const largePre = await exportToFile(s3Project(LARGE_ROWS, { name: 'Proyek Uji S3 Nilai Besar' }), 'fixture-besar-6baris.xlsx');
  const taxPre = await exportToFile(
    s3Project(MAIN_ROWS, { overheadPercent: 10, profitPercent: 5, ppnEnabled: true, ppnPercent: 11, name: 'Proyek Uji S3 O&P+Pajak' }),
    'fixture-155-pajak-5baris.xlsx'
  );
  const probePre = await buildProbeWorkbook();
  for (const [label, f] of [
    ['desimal', decimalPre], ['akumulasi 500', accumPre], ['negatif probe', negPre],
    ['nilai besar', largePre], ['O&P+pajak', taxPre], ['probe', probePre],
  ] as const) {
    check(`workbook ${label} tertulis`, fs.existsSync(f) && fs.statSync(f).size > 0, f);
  }
  // Sanity pra-recalc workbook tepi: cached grand == Σ tersimpan.
  const accumCached = await readWorkbook(accumPre);
  eq('akumulasi 500 pra-recalc: grand cached == Rp5.000.000', readGrands(accumCached).grand1, 5000000);
  const taxCached = await readWorkbook(taxPre);
  eq('O&P+pajak pra-recalc: grand cached == Rp568.043 (445.000+44.500+22.250+56.293)', readGrands(taxCached).grand1, 568043);

  // [2] Recalc SEMUA workbook dalam satu panggilan LO (profil OOXMLRecalcMode=0).
  console.log('\n[2] Recalc LibreOffice (profil OOXMLRecalcMode=0, satu batch):');
  writeLoProfile();
  const loOut = runLoRecalc([probePre, mainPre, decimalPre, accumPre, negPre, largePre, taxPre]);
  console.log(loOut.split('\n').filter((l) => l.trim()).map((l) => `      LO: ${l}`).join('\n'));
  await testLoRecalcMethod(probePre);

  // [3] Fixture utama pasca-recalc.
  await testMainFixtureRecalc();

  // [4] Uji tepi pasca-recalc.
  await testEdgeRecalc('[4a] Tepi: kuantitas desimal (3 baris)', 'fixture-desimal-3baris.xlsx', DECIMAL_ROWS, 0.4, 300000);
  await testEdgeRecalc('[4b] Tepi: akumulasi 500 baris', 'fixture-akumulasi-500baris.xlsx', ACCUM_ROWS, 245, 5000000);
  // [4c] PROBE negatif — BUKAN klaim dukungan fitur (lihat [6] di bawah).
  await testEdgeRecalc('[4c] PROBE: penyesuaian negatif (3 baris, aliran aritmetika)', 'fixture-negatif-probe-3baris.xlsx', NEGATIVE_ROWS, 0.35, 170000);
  await testEdgeRecalc('[4d] Tepi: nilai proyek besar (6 baris, grand ±Rp20 M)', 'fixture-besar-6baris.xlsx', LARGE_ROWS, 1.125, 19999450309);
  await testEdgeRecalc('[4e] Tepi: O&P 10/5% + PPN 11% aktif (selisih tetap 1,55)', 'fixture-155-pajak-5baris.xlsx', MAIN_ROWS, 1.55, 568043);

  // [5] Penegasan batas: toleransi punya gigi (kasus 1 baris).
  console.log('\n[5] Toleransi punya gigi:');
  check('Rp1,55 DI LUAR toleransi proyek 1 baris (Rp1) — toleransi bukan cek kosong',
    1.55 > roundingToleranceFor(1));
  check('Rp245 DI LUAR toleransi proyek 100 baris (Rp100) — skala per-baris bermakna',
    245 > roundingToleranceFor(100));

  // [6] Status fitur penyesuaian negatif — dicatat, bukan diklaim.
  console.log('\n[6] Status dukungan penyesuaian negatif (audit kode, 2026-11-13):');
  console.log('      NOT RUN sebagai fitur: tidak ada tipe item deduksi/kredit,');
  console.log('      tanpa validasi/penanganan khusus di jalur ekspor 5 sheet.');
  console.log('      Bukti: grep priceIntegrity.ts + unifiedProjectEngine.ts +');
  console.log('      fiveSheetPreset.ts → 0 penanganan tanda/negatif; satu-satunya');
  console.log('      jejak adalah catatan validasi sheet legacy (excelExportEngine');
  console.log('      :320, hasZeroCostItems) yang hanya menandai volume/harga ≤ 0.');
  console.log('      Probe [4c] membuktikan aliran aritmetika melewatkan baris');
  console.log('      negatif utuh (selisih −0,30 pada baris itu, dalam ±0,50) —');
  console.log('      itu OBSERVASI, bukan dukungan fitur.');
  check('status negatif dicatat NOT RUN sebagai fitur (probe terpisah di [4c])', true);

  console.log(`\nS3: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Gagal:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('S3 run error:', err);
  process.exit(1);
});
