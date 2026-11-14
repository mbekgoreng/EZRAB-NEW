/**
 * D-37 (Batch F, P2) — Hapus item RAB tanpa konfirmasi.
 *
 * Sebelum perbaikan, handleDeleteItem di RabEstimasiView langsung
 * memanggil deleteRabItem — satu klik salah menghapus item tanpa
 * kesempatan membatalkan. Kini handler membuka dialog konfirmasi
 * in-app (pola yang sama dengan dialog D-84 / Sloof reset), dan
 * penghapusan hanya terjadi setelah tombol konfirmasi ditekan.
 * Undo tetap tersedia (catatan jujur di dialog).
 *
 * Struktural (pola d68d84DeleteConfirm.test.ts): perilaku dialog React
 * tidak dapat diuji tanpa browser, jadi tes ini mengunci wiring-nya
 * di sumber.
 *
 * Jalankan: npx tsx src/test/d37DeleteConfirm.test.ts
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
function contains(haystack: string, needle: string, msg: string): void {
  ok(haystack.includes(needle), `${msg} — tidak ditemukan: ${JSON.stringify(needle)}`);
}
function notContains(haystack: string, needle: string, msg: string): void {
  ok(!haystack.includes(needle), `${msg} — seharusnya tidak ada: ${JSON.stringify(needle)}`);
}

const viewPath = path.join(__dirname, '../components/rab/RabEstimasiView.tsx');
const src = fs.readFileSync(viewPath, 'utf8');

console.log('D-37 — Hapus item RAB memakai konfirmasi:');

test('state item yang menunggu hapus ada', () => {
  contains(src, 'const [pendingDeleteItem, setPendingDeleteItem] = useState<RabItem | null>(null);', 'state pendingDeleteItem');
});

test('handleDeleteItem membuka dialog, tidak langsung menghapus', () => {
  const handler = src.slice(
    src.indexOf('const handleDeleteItem'),
    src.indexOf('const handleConfirmDeleteItem'),
  );
  ok(handler.length > 0, 'handleDeleteItem ditemukan');
  contains(handler, 'setPendingDeleteItem(item)', 'handler menandai item untuk dihapus');
  notContains(handler, 'deleteRabItem', 'handler tidak boleh memanggil deleteRabItem langsung');
});

test('dialog konfirmasi dirender saat ada item tertunda', () => {
  contains(src, '{pendingDeleteItem && (', 'kondisi render dialog');
  contains(src, 'Hapus item ini?', 'judul dialog');
  contains(src, 'pendingDeleteItem.description', 'dialog menampilkan deskripsi item');
});

test('dialog jujur soal Undo', () => {
  contains(src, 'Dapat diurungkan dengan Undo (Ctrl+Z)', 'catatan undo di dialog');
});

test('konfirmasi menghapus item yang tertunda + toast', () => {
  const confirm = src.slice(
    src.indexOf('const handleConfirmDeleteItem'),
    src.indexOf('const buildInsertedRow'),
  );
  ok(confirm.length > 0, 'handleConfirmDeleteItem ditemukan');
  contains(confirm, 'deleteRabItem(pendingDeleteItem.id)', 'konfirmasi memanggil deleteRabItem');
  contains(confirm, 'setPendingDeleteItem(null)', 'konfirmasi membersihkan state');
  contains(confirm, "showToast('Item berhasil dihapus')", 'konfirmasi menampilkan toast');
});

test('tombol batal hanya menutup dialog', () => {
  const dialog = src.slice(
    src.indexOf('{pendingDeleteItem && ('),
    src.indexOf('1. SMART ADD WORK ITEM MODAL'),
  );
  ok(dialog.length > 0, 'blok dialog ditemukan');
  contains(dialog, 'onClick={() => setPendingDeleteItem(null)}', 'tombol batal menutup dialog');
  contains(dialog, 'onClick={handleConfirmDeleteItem}', 'tombol konfirmasi terhubung ke handler');
});

test('menu baris tetap memakai handleDeleteItem', () => {
  contains(src, 'onDeleteItem={handleDeleteItem}', 'wiring menu baris ke handler berdialog');
});

console.log(`\nHasil D-37: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-37 LOLOS');
