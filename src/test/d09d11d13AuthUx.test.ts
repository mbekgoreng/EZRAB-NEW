/**
 * D-09 (Batch G1, P3) — Footer landing tanpa tautan Privacy/Terms
 * (halaman lain punya via ExactFooter).
 * D-11 (Batch G1, P2) — Kontrol nonaktif tampak aktif (sliding-auth
 * tanpa satu pun aturan :disabled; tanpa pola disabled global).
 * D-13 (Batch G1, P3) — Submit kode kosong menampilkan "Kode salah."
 * dan tidak ada jalan keluar dari gerbang.
 *
 * Tes tingkat sumber (tidak ada harness DOM di batch ini).
 *
 * Jalankan: npx tsx src/test/d09d11d13AuthUx.test.ts
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
/** Hapus komentar // dan blok. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const showcaseSrc = stripComments(read('../components/landing/exact/AiShowcase.tsx'));
const footerSrc = stripComments(read('../components/landing/exact/ExactFooter.tsx'));
const slidingCss = stripComments(read('../components/auth/sliding-auth.css'));
const globalCss = stripComments(read('../styles/global.css'));
const gateSrc = stripComments(read('../auth/PasscodeGate.tsx'));

console.log('D-09/D-11/D-13 — Footer legal, disabled, gerbang kode:');

console.log('\n[1] D-09 — Tautan legal di footer landing:');
test('footer landing punya Privacy Policy → /privacy', () => {
  ok(showcaseSrc.includes('href="/privacy"'), 'tautan /privacy tidak ada');
  ok(showcaseSrc.includes('>Privacy Policy</a>'), 'label Privacy Policy tidak ada');
});
test('footer landing punya Terms of Service → /terms', () => {
  ok(showcaseSrc.includes('href="/terms"'), 'tautan /terms tidak ada');
  ok(showcaseSrc.includes('>Terms of Service</a>'), 'label Terms of Service tidak ada');
});
test('tautan memakai navigasi SPA yang sama dengan ExactFooter', () => {
  ok(showcaseSrc.includes("navigateTo('/privacy')"), 'navigateTo(/privacy) tidak ada');
  ok(showcaseSrc.includes("navigateTo('/terms')"), 'navigateTo(/terms) tidak ada');
  ok(footerSrc.includes("navigateTo('/privacy')"), 'ExactFooter berubah — rujukan tidak lagi sama');
  ok(footerSrc.includes("navigateTo('/terms')"), 'ExactFooter berubah — rujukan tidak lagi sama');
});
test('tautan legal berada di dalam <footer>', () => {
  const footerStart = showcaseSrc.indexOf('<footer className="ezai-footer">');
  const footerEnd = showcaseSrc.indexOf('</footer>', footerStart);
  const footer = showcaseSrc.slice(footerStart, footerEnd);
  ok(footer.includes('href="/privacy"'), '/privacy di luar footer');
  ok(footer.includes('href="/terms"'), '/terms di luar footer');
});

console.log('\n[2] D-11 — Aturan :disabled di auth + pola global:');
test('sliding-auth.css punya aturan :disabled (dulu NOL)', () => {
  const count = (slidingCss.match(/:disabled/g) ?? []).length;
  ok(count >= 5, `hanya ${count} kemunculan :disabled di sliding-auth.css`);
});
test('tombol utama + Google nonaktif: redup + not-allowed', () => {
  ok(slidingCss.includes('.sac2-card .primary-btn:disabled'), 'tanpa aturan .primary-btn:disabled');
  ok(slidingCss.includes('.sac2-card .google-btn:disabled'), 'tanpa aturan .google-btn:disabled');
  ok(slidingCss.includes('cursor: not-allowed'), 'tanpa cursor not-allowed');
});
test('tombol nonaktif tanpa efek hover lift', () => {
  ok(
    slidingCss.includes('.sac2-card .primary-btn:disabled:hover'),
    'tanpa override hover tombol utama nonaktif'
  );
  ok(
    slidingCss.includes('.sac2-card .google-btn:disabled:hover'),
    'tanpa override hover tombol Google nonaktif'
  );
});
test('field input nonaktif dibedakan', () => {
  ok(slidingCss.includes('.sac2-card .text-input:disabled'), 'tanpa aturan .text-input:disabled');
});
test('pola disabled global di global.css (spesifisitas rendah)', () => {
  ok(globalCss.includes(':disabled {'), 'tanpa aturan global :disabled');
  ok(globalCss.includes('opacity: 0.55'), 'tanpa opacity global .55');
  ok(globalCss.includes('button:disabled:hover'), 'tanpa penahan hover global');
});

console.log('\n[3] D-13 — Kode kosong + jalan keluar gerbang:');
test('cek kosong sebelum memanggil server', () => {
  const emptyCheck = gateSrc.indexOf('!code.trim()');
  const serverCall = gateSrc.indexOf('submitAccessCode(code)');
  ok(emptyCheck >= 0, 'cek kosong tidak ada');
  ok(serverCall >= 0, 'pemanggilan server tidak ditemukan');
  ok(emptyCheck < serverCall, 'cek kosong harus SEBELUM pemanggilan server');
});
test('pesan kosong jujur ("Masukkan kode akses terlebih dahulu.")', () => {
  ok(
    gateSrc.includes('Masukkan kode akses terlebih dahulu.'),
    'pesan kosong tidak ada'
  );
});
test('pesan kosong bukan "Kode salah."', () => {
  // Pesan "Kode salah" hanya boleh datang dari server (passcode.ts),
  // bukan dari cabang cek-kosong di komponen ini.
  const emptyBranch = gateSrc.slice(
    gateSrc.indexOf('!code.trim()'),
    gateSrc.indexOf('setSubmitting(true)')
  );
  ok(!emptyBranch.includes('Kode salah'), 'cabang kosong masih memakai "Kode salah"');
});
test('ada tautan keluar "Kembali ke Beranda" → /', () => {
  ok(gateSrc.includes('Kembali ke Beranda'), 'tautan keluar tidak ada');
  ok(gateSrc.includes("navigateTo('/')"), 'tautan keluar tidak menavigasi ke /');
});
test('ada baris bantuan soal dari mana kode didapat', () => {
  ok(
    gateSrc.includes('Kode akses diberikan oleh owner EZRAB.'),
    'baris bantuan kode tidak ada'
  );
});

console.log(`\nd09d11d13AuthUx.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
