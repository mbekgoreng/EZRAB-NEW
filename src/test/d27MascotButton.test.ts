/**
 * D-27 (Batch G1, P3) — Tombol tak bernama & tak terlihat di atas
 * maskot hero dashboard: root maskot selalu role="button" +
 * tabIndex={0} + onClick, tapi tanpa aria-label dan tanpa onKeyDown;
 * hero dashboard tidak mengoper onClick, jadi klik hanya memicu
 * animasi pantul 600 ms.
 *
 * Perbaikan: maskot HANYA menjadi tombol bila benar-benar punya
 * aksi (onClick) — dengan nama aksesibel + keyboard (Enter/Spasi).
 * Tanpa aksi ia dekoratif: tanpa role/tabIndex, aria-hidden.
 * Artwork maskot TIDAK diubah.
 *
 * Tes tingkat sumber (tidak ada harness DOM di batch ini).
 *
 * Jalankan: npx tsx src/test/d27MascotButton.test.ts
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
const mascotSrc = stripComments(read('../components/mascot/EZRABMascotLucu.tsx'));
const bridgeSrc = stripComments(read('../components/magic-ai/EzrabEyesMascot.tsx'));
const typesSrc = stripComments(read('../components/mascot/mascot.types.ts'));
const dashSrc = stripComments(read('../components/dashboard/EzrabAiDashboardView.tsx'));

console.log('D-27 — Maskot dekoratif vs tombol beraksi:');

console.log('\n[1] Tanpa onClick → dekoratif (bukan tombol):');
test('role="button" hanya di cabang ber-aksi (spread kondisional)', () => {
  ok(mascotSrc.includes('hasAction'), 'penanda hasAction tidak ada');
  ok(mascotSrc.includes("role: 'button'"), 'role button kondisional tidak ada');
  ok(!mascotSrc.includes('role="button"'), 'role="button" tanpa syarat masih ada');
});
test('tabIndex hanya di cabang ber-aksi', () => {
  ok(mascotSrc.includes('tabIndex: 0'), 'tabIndex kondisional tidak ada');
  ok(!mascotSrc.includes('tabIndex={0}'), 'tabIndex={0} tanpa syarat masih ada');
});
test('cabang dekoratif memakai aria-hidden', () => {
  ok(mascotSrc.includes("'aria-hidden': true"), 'aria-hidden dekoratif tidak ada');
});
test('hasAction diturunkan dari onClick', () => {
  ok(
    mascotSrc.includes("typeof onClick === 'function'"),
    'hasAction tidak diturunkan dari onClick'
  );
});

console.log('\n[2] Dengan onClick → tombol bernama + keyboard:');
test('ada aria-label (prop ariaLabel + baku "Maskot EZRAB")', () => {
  ok(mascotSrc.includes('ariaLabel?: string'), 'prop ariaLabel tidak ada');
  ok(mascotSrc.includes("'aria-label': ariaLabel ?? 'Maskot EZRAB'"), 'aria-label tidak dipasang');
});
test('ada onKeyDown Enter/Spasi', () => {
  ok(mascotSrc.includes('onKeyDown: handleKeyDown'), 'onKeyDown tidak dipasang');
  ok(mascotSrc.includes("e.key === 'Enter'"), 'Enter tidak ditangani');
  ok(mascotSrc.includes("e.key === ' '"), 'Spasi tidak ditangani');
  ok(mascotSrc.includes('e.preventDefault()'), 'preventDefault (anti-scroll Spasi) tidak ada');
});

console.log('\n[3] Bridge EzrabEyesMascot meneruskan ariaLabel:');
test('mascot.types punya ariaLabel; bridge meneruskannya', () => {
  ok(typesSrc.includes('ariaLabel?: string'), 'ariaLabel tidak ada di EZRABMascotProps');
  ok(bridgeSrc.includes('ariaLabel={ariaLabel}'), 'bridge tidak meneruskan ariaLabel');
});

console.log('\n[4] Hero dashboard (kasus audit) tidak mengoper onClick:');
test('pemakaian maskot di EzrabAiDashboardView tanpa onClick', () => {
  const idx = dashSrc.indexOf('<EZRABMascotLucu');
  ok(idx >= 0, 'maskot tidak ditemukan di dashboard');
  const usage = dashSrc.slice(idx, dashSrc.indexOf('/>', idx));
  ok(!usage.includes('onClick'), 'hero dashboard kini mengoper onClick — periksa niatnya');
});

console.log(`\nd27MascotButton.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
