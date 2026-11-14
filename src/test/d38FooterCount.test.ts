/**
 * D-38 (Batch F, P2 per audit) — Footer "Menampilkan semua N item"
 * mengabaikan filter aktif.
 *
 * Sebelum perbaikan, SpreadsheetFooter selalu menulis "Menampilkan
 * semua {totalItemsCount} item" walau daftar sedang difilter. Kini
 * footer menerima jumlah terfilter dan memakai aturan berbasis panjang:
 * "Menampilkan semua N item" hanya bila yang tampil == total, bila tidak
 * "Menampilkan X dari N item".
 *
 * Jalankan: npx tsx src/test/d38FooterCount.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { footerItemCountText } from '../components/estimator/SpreadsheetFooter';

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

const footerPath = path.join(__dirname, '../components/estimator/SpreadsheetFooter.tsx');
const footerSrc = fs.readFileSync(footerPath, 'utf8');
const viewPath = path.join(__dirname, '../components/rab/RabEstimasiView.tsx');
const viewSrc = fs.readFileSync(viewPath, 'utf8');

console.log('D-38 — Footer menghitung item terfilter:');

console.log('\n[1] footerItemCountText:');
test('tanpa filter: "Menampilkan semua N item"', () => {
  eq(footerItemCountText(154, 154), 'Menampilkan semua 154 item', '154/154');
  eq(footerItemCountText(1, 1), 'Menampilkan semua 1 item', '1/1');
});
test('filter aktif: "Menampilkan X dari N item"', () => {
  eq(footerItemCountText(2, 3), 'Menampilkan 2 dari 3 item', '2/3');
  eq(footerItemCountText(0, 2), 'Menampilkan 0 dari 2 item', '0/2');
});
test('filter yang cocok semua tetap jujur "semua"', () => {
  eq(footerItemCountText(213, 213), 'Menampilkan semua 213 item', '213/213');
});
test('daftar kosong: "Menampilkan semua 0 item"', () => {
  eq(footerItemCountText(0, 0), 'Menampilkan semua 0 item', '0/0');
});

console.log('\n[2] Wiring:');
test('SpreadsheetFooter punya prop filteredItemsCount (fallback = total)', () => {
  contains(footerSrc, 'filteredItemsCount?: number;', 'prop opsional di interface');
  contains(footerSrc, 'filteredItemsCount ?? totalItemsCount', 'fallback ke total bila prop tidak diberikan');
});
test('baris "Menampilkan" memakai helper, bukan teks hardcoded', () => {
  contains(footerSrc, '{footerItemCountText(filteredItemsCount ?? totalItemsCount, totalItemsCount)}', 'render memakai helper');
  notContains(footerSrc, 'Menampilkan semua {totalItemsCount} item', 'teks hardcoded lama');
});
test('RabEstimasiView mengoper jumlah terfilter ke footer', () => {
  contains(viewSrc, 'filteredItemsCount={filteredItems.length}', 'prop dari filteredItems');
});

console.log(`\nHasil D-38: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-38 LOLOS');
