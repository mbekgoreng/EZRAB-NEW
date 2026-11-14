/**
 * D-73 (Batch F, P3) — Reports Analisa 155 item vs estimasi 154.
 *
 * Penyebab: estimasi menghitung 154 BARIS RAB berkode, sedangkan
 * Reports menghitung 116 kode berbeda + 39 item master legacy
 * Permen 2022 = 155. Aturan kanonis bersama (didokumentasikan di
 * src/engine/ahsp/ahspCounting.ts): satuan hitung = BARIS RAB
 * berkode proyek (154) — kedua permukaan memakai
 * `getProjectAhspRows` yang sama; Reports tidak lagi menambah
 * item master legacy dan tidak lagi mendedup per kode.
 *
 * Jalankan: npx tsx src/test/d73ReportAhspCount.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { getProjectAhspRows } from '../engine/ahsp/ahspCounting';
import { buildReportAhspDetails } from '../engine/ahsp/reportAhspDetail';
import { PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import type { RabItem } from '../types';

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}
function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function contains(haystack: string, needle: string, msg: string): void {
  ok(haystack.includes(needle), `${msg} — tidak ditemukan: ${JSON.stringify(needle)}`);
}
function notContains(haystack: string, needle: string, msg: string): void {
  ok(!haystack.includes(needle), `${msg} — seharusnya tidak ada: ${JSON.stringify(needle)}`);
}

console.log('D-73 — Estimasi & Reports memakai satu aturan hitung AHSP:');

console.log('\n[1] Premium Demo — kedua permukaan = 154 baris:');
test('getProjectAhspRows(demo) = 154', () => {
  eq(getProjectAhspRows(PREMIUM_DEMO_RAB_ITEMS).length, 154, 'baris AHSP proyek demo');
});
test('buildReportAhspDetails(demo) = 154 entri (tanpa tambahan master)', () => {
  const details = buildReportAhspDetails(PREMIUM_DEMO_RAB_ITEMS);
  eq(details.length, 154, 'entri detail Reports demo');
});
test('semua entri Reports berasal dari baris proyek (id proj-…)', () => {
  const details = buildReportAhspDetails(PREMIUM_DEMO_RAB_ITEMS);
  const nonProject = details.filter((d) => !d.id.startsWith('proj-'));
  eq(nonProject.length, 0, 'entri non-proyek (master legacy)');
});
test('id entri Reports unik per baris', () => {
  const details = buildReportAhspDetails(PREMIUM_DEMO_RAB_ITEMS);
  const ids = new Set(details.map((d) => d.id));
  eq(ids.size, details.length, 'id unik');
});

console.log('\n[2] Semantik aturan (fixture kecil):');
test('dua baris dengan kode sama = dua entri (tanpa dedup per kode)', () => {
  const items = [
    { id: 'r1', ahspCode: '1.1.2.1', description: 'A', volume: 1, unit: 'm3', unitPrice: 100, amount: 100 },
    { id: 'r2', ahspCode: '1.1.2.1', description: 'B', volume: 2, unit: 'm3', unitPrice: 100, amount: 200 },
  ] as RabItem[];
  eq(getProjectAhspRows(items).length, 2, 'baris proyek');
  const details = buildReportAhspDetails(items);
  eq(details.length, 2, 'entri Reports');
  ok(details[0].id !== details[1].id, 'id berbeda untuk dua baris berkode sama');
});
test('baris snapshot-only (tanpa kode) ikut terhitung — paritas dengan estimasi', () => {
  const items = [
    {
      id: 'r3',
      description: 'Snapshot saja',
      volume: 1,
      unit: 'ls',
      unitPrice: 100,
      amount: 100,
      ahspSnapshot: { code: 'X.1', name: 'Analisa snapshot' },
    },
  ] as unknown as RabItem[];
  eq(getProjectAhspRows(items).length, 1, 'baris snapshot-only');
  eq(buildReportAhspDetails(items).length, 1, 'entri snapshot-only');
});
test('baris tanpa kode/snapshot tidak terhitung', () => {
  const items = [
    { id: 'r4', description: 'Manual', volume: 1, unit: 'ls', unitPrice: 100, amount: 100 },
  ] as RabItem[];
  eq(getProjectAhspRows(items).length, 0, 'baris manual');
  eq(buildReportAhspDetails(items).length, 0, 'entri manual');
});

console.log('\n[3] Wiring (struktural):');
const ahspViewPath = path.join(__dirname, '../components/estimator/EstimatorAhspView.tsx');
const ahspViewSrc = fs.readFileSync(ahspViewPath, 'utf8');
const laporanPath = path.join(__dirname, '../components/reports/LaporanView.tsx');
const laporanSrc = fs.readFileSync(laporanPath, 'utf8');
const helperPath = path.join(__dirname, '../engine/ahsp/reportAhspDetail.ts');
const helperSrc = fs.readFileSync(helperPath, 'utf8');
test('EstimatorAhspView memakai getProjectAhspRows', () => {
  contains(ahspViewSrc, 'getProjectAhspRows(items)', 'populasi AHSP estimasi');
});
test('LaporanView memakai buildReportAhspDetails', () => {
  contains(laporanSrc, 'buildReportAhspDetails(initialRabItems)', 'populasi AHSP Reports');
  contains(laporanSrc, "from '../../engine/ahsp/reportAhspDetail'", 'import builder');
});
test('builder Reports memakai helper populasi yang sama', () => {
  contains(helperSrc, "import { getProjectAhspRows } from './ahspCounting';", 'builder mengimpor helper bersama');
  contains(helperSrc, 'getProjectAhspRows(rabItems)', 'builder memanggil helper bersama');
});
test('Reports tidak lagi mengimpor master AHSP / mendedup / menambah legacy', () => {
  notContains(laporanSrc, 'MASTER_AHSP_DATABASE', 'import master legacy');
  notContains(laporanSrc, 'seenCodes', 'dedup per kode');
  notContains(laporanSrc, '(197 items)', 'komentar jumlah lama');
});

console.log(`\nHasil D-73: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-73 LOLOS');
