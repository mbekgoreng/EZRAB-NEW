/**
 * D-74 (Batch F, P3) — Ekspor di halaman Reports tanpa toast/
 * konfirmasi (ekspor spreadsheet MENAMPILKAN toast).
 *
 * Sebelum perbaikan: ekspor PDF Reports diam total (sukses maupun
 * gagal), ekspor Excel memakai alert() pemblokir, dan modal paket
 * ekspor tidak mendapat onToast. Kini ketiga jalur memakai toast
 * yang sama dengan spreadsheet (sukses + gagal), tanpa alert().
 *
 * Struktural (pola d68d84DeleteConfirm.test.ts): perilaku toast React
 * tidak dapat diuji tanpa browser, jadi tes ini mengunci wiring-nya
 * di sumber.
 *
 * Jalankan: npx tsx src/test/d74ReportExportToast.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const laporanPath = path.join(__dirname, '../components/reports/LaporanView.tsx');
const src = fs.readFileSync(laporanPath, 'utf8');

console.log('D-74 — Ekspor Reports memakai toast (bukan diam/alert):');

test('showToast ada + auto-dismiss', () => {
  contains(src, 'const [toastMessage, setToastMessage] = useState<string | null>(null);', 'state toast');
  contains(src, 'const showToast = (msg: string) => {', 'helper showToast');
  const toastHelper = src.slice(
    src.indexOf('const showToast = (msg: string) => {'),
    src.indexOf('const handleExportPdf'),
  );
  contains(toastHelper, 'setTimeout(() => {', 'auto-dismiss memakai timeout');
  contains(toastHelper, '}, 3200);', 'auto-dismiss 3,2 detik');
});

test('UI toast dirender (di trailingModals — desktop & mobile)', () => {
  contains(src, '{toastMessage && (', 'kondisi render toast');
  contains(src, 'className="ez-toast"', 'kelas toast');
});

test('modal paket ekspor mendapat onToast', () => {
  contains(src, 'onToast={showToast}', 'prop onToast ke modal');
});

// Komentar boleh menyebut alert() (mendokumentasikan penghapusannya) —
// yang dilarang adalah pemanggilan hidup. Hapus baris komentar penuh
// sebelum memeriksa handler.
const stripFullLineComments = (s: string): string =>
  s
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

test('ekspor PDF: toast sukses + toast gagal', () => {
  const pdf = src.slice(
    src.indexOf('const handleExportPdf'),
    src.indexOf('const handleExportExcel'),
  );
  ok(pdf.length > 0, 'handleExportPdf ditemukan');
  contains(pdf, "showToast('Dokumen PDF Laporan berhasil dibuat dan diunduh!')", 'toast sukses PDF');
  contains(pdf, "showToast('Gagal membuat PDF. '", 'toast gagal PDF');
  notContains(stripFullLineComments(pdf), 'alert(', 'tanpa alert di handler PDF');
});

test('ekspor Excel: toast sukses + toast gagal', () => {
  const excel = src.slice(
    src.indexOf('const handleExportExcel'),
    src.indexOf('const trailingModals'),
  );
  ok(excel.length > 0, 'handleExportExcel ditemukan');
  contains(excel, 'showToast(settingsOverride', 'toast sukses Excel (teks dinamis)');
  contains(excel, "showToast('Gagal mengunduh berkas Excel.')", 'toast gagal Excel');
  notContains(stripFullLineComments(excel), 'alert(', 'tanpa alert di handler Excel');
});

test('tidak ada pemanggilan alert() hidup di seluruh berkas (hanya komentar)', () => {
  const occurrences = src.split('\n').filter((line) => line.includes('alert('));
  eq(occurrences.length, 2, 'baris yang menyebut alert()');
  for (const line of occurrences) {
    ok(line.includes('//'), `penyebutan alert() harus di komentar: ${line.trim()}`);
  }
});

console.log(`\nHasil D-74: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-74 LOLOS');
