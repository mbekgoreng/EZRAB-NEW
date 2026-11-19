/**
 * EZRAB — T20 (Gelombang 2, Workstream C1) — KEJUJURAN ANGKA IMPOR EXCEL
 *
 * Menguji lapisan deterministik impor (excelImportEngine + pemetaan impor):
 * nilai kosong / tidak terpetakan / tidak dapat dibaca dari file TIDAK
 * PERNAH diisi angka karangan — tetap null/unresolved dengan label yang
 * jelas (anomali), bukan volume 1, bukan satuan 'ls', bukan Rp0 yang
 * valid, dan bukan jumlah hasil kali volume karangan.
 *
 * SEBELUM T20 (difabrikasi engine):
 *  - volume kosong → 1 (lalu jumlah = 1 × harga → total impor fiktif);
 *  - satuan kosong → 'ls' TANPA anomali apa pun;
 *  - harga kosong → 0 yang di-resolve sebagai PRICE_RESOLVED di hilir
 *    (resolvePriceStatus(0) = RESOLVED) — harga hilang mendarat sebagai
 *    Rp0 "resolved";
 *  - kode kosong → `ITEM.N` karangan yang ikut terhitung sebagai referensi
 *    AHSP (mengandung '.');
 *  - detectedResourcesCount = jumlah item × 3 (estimasi karangan).
 *
 * Jalankan: npx --yes tsx src/test/excelImportHonestNumbers.test.ts
 * (HANYA berkas tes ini yang dijalankan pekerja C1 untuk T20.)
 */

import { strict as assert } from 'assert';
import * as XLSX from 'xlsx';
import {
  ExcelImportEngine,
  normalizeIndonesianUnit,
  type ExcelAnalysisResult,
  type ParsedRabRow,
} from '../engine/excelImportEngine';

let passed = 0;
let failed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.deepEqual(actual, expected, `${msg} (dapat ${JSON.stringify(actual)}, harap ${JSON.stringify(expected)})`);
}

const HEADER = ['No', 'Kode', 'Uraian Pekerjaan', 'Volume', 'Satuan', 'Harga Satuan', 'Jumlah Harga'];
const ROWS: unknown[][] = [
  ['', '', 'PEKERJAAN STRUKTUR', '', '', '', ''],
  ['1', 'A.4.1.1.4', 'Beton kolom K-300', 10, 'm3', 4850000, ''],
  ['2', 'A.4.4.1.1', 'Dinding bata ringan', '', 'm2', 145000, ''],
  ['3', 'A.4.4.3.1', 'Lantai granit', 50, 'm2', '', ''],
  ['4', 'A.2.2.1.1', 'Pembersihan lapangan', 100, '', 18500, ''],
  ['5', '', 'Pekerjaan tanpa kode', 5, 'ls', 100000, 500000],
  ['6', 'A.4.7.1.2', 'Pengecatan dinding', 'dua puluh', 'm2', 48000, ''],
  ['7', 'A.5.1.1.1', 'Sanitair kloset', 0, 'bh', 2450000, ''],
  ['8', 'A.6.1.2.1', 'Instalasi listrik', 20, 'titik', 0, ''],
  ['9', 'A.4.1.1.5', 'Pondasi footplat', 2, 'm3', 4700000, 10000000],
  ['', '', 'SUB TOTAL PEKERJAAN STRUKTUR', '', '', '', 58000000],
];

function buildWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...ROWS]);
  XLSX.utils.book_append_sheet(wb, ws, 'RAB');
  return wb;
}

function byDesc(analysis: ExcelAnalysisResult, desc: string): ParsedRabRow {
  const row = analysis.validItems.find((r) => r.description === desc);
  assert(row, `baris "${desc}" harus ada di validItems`);
  return row!;
}

function hasAnomaly(row: ParsedRabRow, type: string): boolean {
  return row.anomalies.some((a) => a.type === type);
}

async function main(): Promise<void> {
  const wb = buildWorkbook();
  const analysis = ExcelImportEngine.analyzeSheet(wb, 'RAB');

  console.log('== T20-1 — struktur & metrik jujur ==');
  await check('T20-1.01 klasifikasi baris: 9 item, 1 header grup, 1 subtotal', () => {
    eq(analysis.validItems.length, 9, 'item valid');
    eq(analysis.groupHeaders.length, 1, 'header grup');
    eq(analysis.subtotalRows.length, 1, 'baris subtotal');
    eq(analysis.detectedGroupsCount, 1, 'grup terdeteksi');
    eq(analysis.detectedWorkItemsCount, 9, 'item terdeteksi');
  });
  await check('T20-1.02 hitungan AHSP hanya kode file (8) — tanpa ITEM.N karangan', () => {
    eq(analysis.detectedAhspReferencesCount, 8, 'referensi AHSP dari kode file saja');
    const noCode = byDesc(analysis, 'Pekerjaan tanpa kode');
    eq(noCode.code, '', 'kode kosong dibiarkan kosong (bukan ITEM.N)');
  });
  await check('T20-1.03 detectedResourcesCount = 0 (bukan item × 3 karangan)', () => {
    eq(analysis.detectedResourcesCount, 0, 'tidak ada sumber daya yang terdeteksi');
  });
  await check('T20-1.04 baris struktural bernilai null (bukan 0)', () => {
    const grp = analysis.groupHeaders[0];
    eq(grp.volume, null, 'header grup: volume null');
    eq(grp.unitPrice, null, 'header grup: harga null');
    eq(grp.amount, null, 'header grup: jumlah null');
    const sub = analysis.subtotalRows[0];
    eq(sub.amount, 58000000, 'subtotal: jumlah file dipertahankan');
    eq(sub.volume, null, 'subtotal: volume null');
  });

  console.log('== T20-2 — baris lengkap dipertahankan ==');
  await check('T20-2.01 baris lengkap: nilai file utuh + jumlah terhitung', () => {
    const r = byDesc(analysis, 'Beton kolom K-300');
    eq(r.volume, 10, 'volume');
    eq(r.unit, 'm³', 'satuan ternormalisasi');
    eq(r.unitPrice, 4850000, 'harga satuan');
    eq(r.calculatedAmount, 48500000, 'jumlah terhitung 10 × 4.850.000');
    eq(r.amount, 48500000, 'jumlah = hasil hitung (file kosong)');
    eq(r.anomalies.length, 0, 'tanpa anomali');
  });
  await check('T20-2.02 jumlah file dipertahankan + MATH_MISMATCH bila berselisih', () => {
    const r = byDesc(analysis, 'Pondasi footplat');
    eq(r.amount, 10000000, 'jumlah file menang atas hitung');
    eq(r.calculatedAmount, 9400000, 'jumlah hitung 2 × 4.700.000');
    assert(hasAnomaly(r, 'MATH_MISMATCH'), 'anomali MATH_MISMATCH hadir');
  });
  await check('T20-2.03 jumlah file = hitung → tanpa MATH_MISMATCH', () => {
    const r = byDesc(analysis, 'Pekerjaan tanpa kode');
    eq(r.amount, 500000, 'jumlah file');
    eq(r.calculatedAmount, 500000, 'jumlah hitung sama');
    assert(!hasAnomaly(r, 'MATH_MISMATCH'), 'tanpa MATH_MISMATCH');
  });

  console.log('== T20-3 — sel kosong / tak terbaca tetap null (BUKAN karangan) ==');
  await check('T20-3.01 volume kosong → null + MISSING_VOLUME, jumlah null (bukan 1 × harga)', () => {
    const r = byDesc(analysis, 'Dinding bata ringan');
    eq(r.volume, null, 'volume null (bukan 1)');
    eq(r.calculatedAmount, null, 'jumlah terhitung null');
    eq(r.amount, null, 'jumlah null (bukan Rp145.000 fiktif)');
    assert(hasAnomaly(r, 'MISSING_VOLUME'), 'anomali MISSING_VOLUME hadir');
    assert(
      r.anomalies.some((a) => a.type === 'MISSING_VOLUME' && a.message.includes('tidak diisi otomatis')),
      'pesan anomali menyebut tidak diisi otomatis',
    );
  });
  await check('T20-3.02 harga kosong → null + MISSING_PRICE, jumlah null (bukan Rp0)', () => {
    const r = byDesc(analysis, 'Lantai granit');
    eq(r.unitPrice, null, 'harga null (bukan 0)');
    eq(r.amount, null, 'jumlah null');
    assert(hasAnomaly(r, 'MISSING_PRICE'), 'anomali MISSING_PRICE hadir');
    assert(
      r.anomalies.some((a) => a.type === 'MISSING_PRICE' && a.message.includes('bukan Rp 0')),
      'pesan anomali menyebut bukan Rp 0',
    );
  });
  await check('T20-3.03 satuan kosong → "" + MISSING_UNIT (bukan "ls" diam-diam)', () => {
    const r = byDesc(analysis, 'Pembersihan lapangan');
    eq(r.unit, '', 'satuan kosong (bukan ls)');
    assert(hasAnomaly(r, 'MISSING_UNIT'), 'anomali MISSING_UNIT hadir');
    // Jumlah tetap dapat dihitung dari volume × harga yang diketahui.
    eq(r.amount, 1850000, 'jumlah 100 × 18.500 tetap terhitung');
  });
  await check('T20-3.04 volume tak-terbaca ("dua puluh") → null + MISSING_VOLUME', () => {
    const r = byDesc(analysis, 'Pengecatan dinding');
    eq(r.volume, null, 'teks bukan angka → null');
    eq(r.amount, null, 'jumlah null');
    assert(hasAnomaly(r, 'MISSING_VOLUME'), 'anomali MISSING_VOLUME hadir');
  });
  await check('T20-3.05 nilai 0 EKSPLISIT dari file dipertahankan (0 ≠ kekosongan)', () => {
    const v0 = byDesc(analysis, 'Sanitair kloset');
    eq(v0.volume, 0, 'volume 0 eksplisit dipertahankan');
    assert(hasAnomaly(v0, 'MISSING_VOLUME'), 'volume 0 tetap dianomalikan');
    eq(v0.amount, null, 'jumlah null (hitung butuh volume > 0)');
    const p0 = byDesc(analysis, 'Instalasi listrik');
    eq(p0.unitPrice, 0, 'harga 0 eksplisit dipertahankan');
    assert(hasAnomaly(p0, 'MISSING_PRICE'), 'harga 0 tetap dianomalikan');
    eq(p0.amount, null, 'jumlah null (hitung butuh harga > 0)');
  });

  console.log('== T20-4 — kolom tidak terpetakan ==');
  await check('T20-4.01 volumeCol tidak terpetakan → semua volume null + anomali', () => {
    const a = ExcelImportEngine.analyzeSheet(wb, 'RAB', undefined, { volumeCol: null });
    assert(a.validItems.length > 0, 'item tetap terurai');
    for (const r of a.validItems) {
      eq(r.volume, null, `"${r.description}": volume null`);
      assert(hasAnomaly(r, 'MISSING_VOLUME'), `"${r.description}": MISSING_VOLUME hadir`);
      eq(r.calculatedAmount, null, `"${r.description}": jumlah terhitung null`);
    }
  });
  await check('T20-4.02 unitPriceCol tidak terpetakan → semua harga null; jumlah file tetap dipakai', () => {
    const a = ExcelImportEngine.analyzeSheet(wb, 'RAB', undefined, { unitPriceCol: null });
    for (const r of a.validItems) {
      eq(r.unitPrice, null, `"${r.description}": harga null`);
      assert(hasAnomaly(r, 'MISSING_PRICE'), `"${r.description}": MISSING_PRICE hadir`);
    }
    // Jumlah FILE adalah angka file (bukan karangan) — tetap dipakai.
    eq(byDesc(a, 'Pekerjaan tanpa kode').amount, 500000, 'jumlah file dipertahankan');
    eq(byDesc(a, 'Pondasi footplat').amount, 10000000, 'jumlah file dipertahankan');
    eq(byDesc(a, 'Beton kolom K-300').amount, null, 'tanpa jumlah file & tanpa harga → null');
  });

  console.log('== T20-5 — normalisasi satuan ==');
  await check('T20-5.01 normalizeIndonesianUnit: kosong → "", dikenal → kanonis, asing → apa adanya', () => {
    eq(normalizeIndonesianUnit(''), { unit: '', isValid: false }, 'kosong → "" (bukan ls)');
    eq(normalizeIndonesianUnit('m3'), { unit: 'm³', isValid: true }, 'm3 → m³');
    eq(normalizeIndonesianUnit('M2'), { unit: 'm²', isValid: true }, 'M2 → m²');
    eq(normalizeIndonesianUnit('xyz'), { unit: 'xyz', isValid: false }, 'asing dipertahankan apa adanya');
  });

  console.log('== T20-6 — pemetaan impor (mapParsedRowsToImportItems + sumImportTotal) ==');
  const items = ExcelImportEngine.mapParsedRowsToImportItems(analysis.validItems);
  const byItemDesc = (desc: string) => {
    const it = items.find((i) => i.description === desc);
    assert(it, `item impor "${desc}" harus ada`);
    return it!;
  };
  await check('T20-6.01 baris lengkap → RESOLVED + nilai utuh', () => {
    const it = byItemDesc('Beton kolom K-300');
    eq(it.unitPrice, 4850000, 'harga');
    eq(it.priceStatus, 'PRICE_RESOLVED', 'status resolved');
    eq(it.amount, 48500000, 'jumlah');
    eq(it.volume, 10, 'volume');
    eq(it.volumeSource, 'IMPORT', 'sumber IMPORT');
  });
  await check('T20-6.02 volume hilang → volume 0 (honestVolume), harga tetap RESOLVED, jumlah null', () => {
    const it = byItemDesc('Dinding bata ringan');
    eq(it.volume, 0, 'volume 0 (bukan 1)');
    eq(it.unitPrice, 145000, 'harga dari file');
    eq(it.priceStatus, 'PRICE_RESOLVED', 'harga diketahui → resolved');
    eq(it.amount, null, 'jumlah null (bukan 1 × 145.000)');
    assert(it.notes?.includes('Volume pekerjaan belum terisi'), 'catatan membawa anomali volume');
  });
  await check('T20-6.03 harga hilang/0 → unitPrice null + PRICE_UNRESOLVED (bukan Rp0 resolved)', () => {
    const missing = byItemDesc('Lantai granit');
    eq(missing.unitPrice, null, 'harga kosong → null');
    eq(missing.priceStatus, 'PRICE_UNRESOLVED', 'status unresolved');
    const zero = byItemDesc('Instalasi listrik');
    eq(zero.unitPrice, null, 'harga 0 eksplisit → null di impor');
    eq(zero.priceStatus, 'PRICE_UNRESOLVED', 'status unresolved');
  });
  await check('T20-6.04 satuan hilang → "" (bukan "ls"); kode hilang → kunci lokal ITEM.n', () => {
    eq(byItemDesc('Pembersihan lapangan').unit, '', 'satuan ""');
    eq(byItemDesc('Pekerjaan tanpa kode').code, 'ITEM.5', 'kunci lokal ITEM.5 (bukan klaim AHSP)');
  });
  await check('T20-6.05 sumImportTotal hanya menjumlahkan yang diketahui: Rp60.850.000', () => {
    // Beton 48.500.000 + Pembersihan 1.850.000 + TanpaKode 500.000 +
    // Pondasi 10.000.000; lima baris lain null (dikecualikan, bukan 0).
    eq(ExcelImportEngine.sumImportTotal(items), 60850000, 'total impor jujur');
  });

  console.log(`\nexcelImportHonestNumbers.test: ${passed} PASS, ${failed} FAIL`);
  if (failures.length) {
    console.log(`Gagal: ${failures.join(' | ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
