/**
 * D-12b (Nightly 2026-11-20, tindak lanjut D-12) — copy publik yang
 * menjanjikan akses terbuka padahal workspace terkunci kode akses (D-03).
 *
 * Temuan browser langsung pada Preview 4740854 (2026-11-20 04:08 WIB):
 * - Banner fail-safe di semua halaman publik mengklaim "semua fitur
 *   terbuka tanpa login", padahal /app/dashboard menuntut kode akses
 *   (PasscodeGate) — banner tampil karena mode 'failsafe-demo'
 *   (AUTH_ENABLED=true + Supabase belum valid), tetapi gerbang kode
 *   akses adalah lapisan terpisah yang tetap mengunci.
 * - /daftar & /masuk (AuthNoticePage) mengklaim "Tanpa akun pun
 *   seluruh fitur dapat dibuka dari tombol di bawah", padahal tombol
 *   "Buka Aplikasi" bermuara ke layar kunci kode akses.
 *
 * Perbaikan HANYA copy (gerbang D-01/D-03 TIDAK disentuh):
 * - Banner: "semua fitur terbuka tanpa login" -> "workspace tetap
 *   dilindungi kode akses".
 * - AuthNoticePage: "seluruh fitur dapat dibuka dari tombol di bawah"
 *   -> "workspace dapat dibuka dari tombol di bawah dengan kode akses".
 *   Frasa "peran demo" dipertahankan (di-pin phaseAContentIntegrity).
 *
 * Teks JSX terpotong baris di sumber, jadi semua asersi memakai sumber
 * yang dinormalisasi (whitespace ciut jadi satu spasi).
 *
 * Jalankan: npx tsx src/test/d12bFailsafeBannerCopy.test.ts
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

/** Baca berkas sumber dan ciutkan semua whitespace jadi satu spasi. */
const readNorm = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/\s+/g, ' ');

const appSrc = readNorm('../App.tsx');
const infoPagesSrc = readNorm('../components/public/PublicInfoPages.tsx');

console.log('D-12b — Copy jujur soal akses (banner fail-safe + /masuk & /daftar):');

console.log('\n[1] Banner fail-safe (App.tsx):');
test('tanpa janji "semua fitur terbuka tanpa login"', () => {
  ok(
    !appSrc.includes('semua fitur terbuka tanpa login'),
    'janji akses terbuka masih ada di banner fail-safe'
  );
});
test('banner menyebut workspace dilindungi kode akses', () => {
  ok(
    appSrc.includes('workspace tetap dilindungi kode akses'),
    'banner tidak menyebut gerbang kode akses'
  );
});
test('banner tetap memperingatkan konfigurasi login belum lengkap', () => {
  ok(
    appSrc.includes('konfigurasi login (Supabase) belum lengkap'),
    'peringatan konfigurasi login hilang dari banner'
  );
});
test('banner tetap hanya tampil di mode failsafe-demo (tidak dihapus)', () => {
  ok(
    appSrc.includes("AUTH_MODE === 'failsafe-demo' && <AuthFailsafeBanner />"),
    'render bersyarat banner berubah — di luar cakupan D-12b'
  );
});

console.log('\n[2] AuthNoticePage (/masuk & /daftar):');
test('tanpa janji "seluruh fitur dapat dibuka dari tombol di bawah"', () => {
  ok(
    !infoPagesSrc.includes('seluruh fitur dapat dibuka dari tombol di bawah'),
    'janji akses terbuka masih ada di AuthNoticePage'
  );
});
test('kalimat tombol menyebut pembukaan dengan kode akses', () => {
  ok(
    infoPagesSrc.includes('workspace dapat dibuka dari tombol di bawah dengan kode akses'),
    'kalimat tombol tidak menyebut kode akses'
  );
});
test('penjelasan peran demo tetap ada (pin phaseA)', () => {
  ok(infoPagesSrc.includes('peran demo'), 'penjelasan peran demo hilang');
});
test('paragraf gerbang kode akses tetap ada', () => {
  ok(
    infoPagesSrc.includes('Akses ke area aplikasi sementara dilindungi kode akses'),
    'paragraf gerbang kode akses hilang'
  );
});

console.log(`\nd12bFailsafeBannerCopy.test: ${passes} PASS, ${failures} FAIL`);
if (failures > 0) process.exit(1);
