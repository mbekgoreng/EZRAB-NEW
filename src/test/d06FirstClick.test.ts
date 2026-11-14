/**
 * D-06 (Batch G1, P2) — Klik pertama flaky di landing — PARTIAL.
 *
 * Empat mekanisme teridentifikasi di matriks, tanpa satu smoking gun.
 * Batch ini menerapkan mitigasi yang AMAN & DIPAHAMI SAJA:
 * 1. Magnetic DIHAPUS dari tombol CTA (menggeser tombol ±10px di
 *    bawah kursor — mekanisme paling jelas untuk klik yang hilang).
 * 2. Tilt DIHAPUS dari kartu harga (.plan berisi tombol CTA);
 *    tilt tersisa hanya di kartu non-interaktif (.tile/.hcard).
 * 3. Offset reveal .mrv 32px → 12px + blur dihapus; .rv 26px → 12px.
 * 4. Banner cookie tidak lagi muncul otomatis di 800 ms (pernah
 *    menutupi CTA "Mulai Gratis"); kini pada interaksi pertama atau
 *    setelah 8 detik.
 *
 * Yang TIDAK dilakukan: refactor sistem animasi secara membabi buta.
 * Pengukuran INP live + uji reliabilitas klik tetap menjadi tugas
 * fase browser-regression — tes ini hanya mengunci mitigasi di atas.
 *
 * Jalankan: npx tsx src/test/d06FirstClick.test.ts
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
/** Hapus komentar // dan blok (agar penjelasan perbaikan tidak ikut terhitung). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const enhancerSrc = stripComments(read('../components/landing/exact/motionEnhancer.ts'));
const motionCss = stripComments(read('../styles/landing-motion.css'));
const showcaseCss = stripComments(read('../styles/landing-ai-showcase.css'));
const cookieSrc = stripComments(read('../components/landing/CookieConsentBanner.tsx'));

console.log('D-06 — Mitigasi klik pertama (PARTIAL, INP live masih terbuka):');

console.log('\n[1] Magnetic dihapus dari tombol CTA:');
test('tidak ada lagi helper addMagnetic / pemakaian data-magnetic', () => {
  ok(!enhancerSrc.includes('addMagnetic'), 'addMagnetic masih ada');
  ok(!enhancerSrc.includes('data-magnetic'), 'data-magnetic masih dipakai');
  ok(!enhancerSrc.includes('magneticDone'), 'magneticDone masih ada');
});
test('tidak ada lagi aturan CSS [data-magnetic]', () => {
  ok(!motionCss.includes('[data-magnetic]'), 'aturan [data-magnetic] masih ada di CSS');
});
test('tidak ada lagi selektor magnetic .ch-cta-primary / .cta-box .btn', () => {
  ok(
    !enhancerSrc.includes("'.ch-cta-primary, .ezai-scope .cta-box .btn'"),
    'selektor magnetic masih ada'
  );
});

console.log('\n[2] Tilt tidak lagi menyentuh kartu harga:');
test('selektor tilt hanya .tile + .hcard (tanpa .plan)', () => {
  ok(
    enhancerSrc.includes("'.ezai-scope .tile, .ezai-scope .hcard'"),
    'selektor tilt bukan .tile/.hcard'
  );
  ok(!enhancerSrc.includes('.ezai-scope .plan'), '.plan masih di-tilt');
});
test('tilt tetap ada untuk kartu non-interaktif', () => {
  ok(enhancerSrc.includes('addTilt'), 'addTilt hilang seluruhnya — tilt tidak boleh mati total');
});

console.log('\n[3] Offset reveal diperkecil + blur .mrv dihapus:');
test('.mrv: translateY(12px), tanpa blur(5px)', () => {
  const mrvRule = motionCss.match(/\.mrv \{[^}]*\}/);
  ok(mrvRule, 'aturan .mrv tidak ditemukan');
  ok(mrvRule![0].includes('translateY(12px)'), `.mrv bukan 12px: ${mrvRule![0]}`);
  ok(!mrvRule![0].includes('blur(5px)'), '.mrv masih blur(5px)');
  ok(!mrvRule![0].includes('filter:'), '.mrv masih punya filter');
});
test('.rv (AiShowcase): translateY(12px)', () => {
  const rvRule = showcaseCss.match(/\.ezai-scope \.rv \{[^}]*\}/);
  ok(rvRule, 'aturan .rv tidak ditemukan');
  ok(rvRule![0].includes('translateY(12px)'), `.rv bukan 12px: ${rvRule![0]}`);
});
test('.win.rv: translateY(12px)', () => {
  const winRule = showcaseCss.match(/\.ezai-scope \.win\.rv \{[^}]*\}/);
  ok(winRule, 'aturan .win.rv tidak ditemukan');
  ok(winRule![0].includes('translateY(12px)'), `.win.rv bukan 12px: ${winRule![0]}`);
});

console.log('\n[4] Banner cookie tidak lagi muncul di 800 ms:');
test('tidak ada timer 800 ms (pola lama setTimeout(..., 800))', () => {
  ok(!/setTimeout\([^;]*?,\s*800\)/.test(cookieSrc), 'timer 800 ms masih ada');
});
test('muncul pada interaksi pertama (pointerdown/keydown/scroll)', () => {
  ok(cookieSrc.includes("addEventListener('pointerdown'"), 'tanpa pemicu pointerdown');
  ok(cookieSrc.includes("addEventListener('keydown'"), 'tanpa pemicu keydown');
  ok(cookieSrc.includes("addEventListener('scroll'"), 'tanpa pemicu scroll');
});
test('fallback 8 detik bila tanpa interaksi', () => {
  ok(cookieSrc.includes('setTimeout(show, 8000)'), 'fallback 8 detik tidak ada');
});
test('listener dibersihkan saat unmount', () => {
  ok(cookieSrc.includes("removeEventListener('pointerdown'"), 'pointerdown tidak dibersihkan');
  ok(cookieSrc.includes("removeEventListener('scroll'"), 'scroll tidak dibersihkan');
});

console.log(`\nd06FirstClick.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
