/**
 * D-02 (Batch G1, P1) — Harga Starter tidak konsisten.
 *
 * Akar: string hardcode 'Starter Rp 59.999/bln' di FeatureSections.tsx
 * vs kanonis plans.ts (starter.monthlyPriceIdr = 54_999). Kini teks
 * harga di halaman /fitur diturunkan dari getPlanDefinition — tidak
 * ada lagi harga paket hardcode di copy landing.
 *
 * Bagian transien (49.999/149.999 sesaat di first load) TIDAK
 * TEREPRODUKSI di kode (tidak ada animasi count-up; nilai tidak
 * pernah ada di repo) — tes ini hanya menegaskan nilai-nilai itu
 * memang tidak ada di copy landing; re-check live first-load tetap
 * menjadi tugas fase browser-regression (OD-13).
 *
 * Jalankan: npx tsx src/test/d02StarterPrice.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { getPlanDefinition } from '../billing/plans';

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
/** Hapus komentar // dan blok (agar penjelasan perbaikan di komentar tidak ikut terhitung). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const featureSectionsPath = path.join(
  __dirname,
  '../components/landing/features/FeatureSections.tsx'
);
const featureSectionsSrc = stripComments(fs.readFileSync(featureSectionsPath, 'utf8'));

console.log('D-02 — Harga Starter dari plans.ts (kanonis):');

console.log('\n[1] Nilai kanonis plans.ts:');
test('starter.monthlyPriceIdr = 54_999', () => {
  eq(getPlanDefinition('starter').monthlyPriceIdr, 54999, 'starter');
});
test('professional.monthlyPriceIdr = 79_999', () => {
  eq(getPlanDefinition('professional').monthlyPriceIdr, 79999, 'professional');
});

console.log('\n[2] FeatureSections.tsx tidak lagi hardcode harga:');
test('tidak ada string 59.999 di kode (bukan komentar)', () => {
  ok(!featureSectionsSrc.includes('59.999'), '59.999 masih ada di FeatureSections.tsx');
});
test('tidak ada string harga paket hardcode lain (Rp 54.999 / Rp 79.999 literal)', () => {
  ok(!featureSectionsSrc.includes('Rp 54.999'), 'literal Rp 54.999 masih ada');
  ok(!featureSectionsSrc.includes('Rp 79.999'), 'literal Rp 79.999 masih ada');
  ok(!featureSectionsSrc.includes('Rp54.999'), 'literal Rp54.999 masih ada');
  ok(!featureSectionsSrc.includes('Rp79.999'), 'literal Rp79.999 masih ada');
});
test('teks harga diturunkan dari getPlanDefinition (starter + professional)', () => {
  ok(
    featureSectionsSrc.includes("getPlanDefinition('starter').monthlyPriceIdr"),
    'tidak memakai getPlanDefinition(starter)'
  );
  ok(
    featureSectionsSrc.includes("getPlanDefinition('professional').monthlyPriceIdr"),
    'tidak memakai getPlanDefinition(professional)'
  );
  ok(
    featureSectionsSrc.includes("from '../../../billing/plans'"),
    'tidak mengimpor plans.ts'
  );
});
test('teks hasil turunan sama dengan string lama yang benar', () => {
  const fmt = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
  const desc =
    `Free untuk mencoba · Starter ${fmt(getPlanDefinition('starter').monthlyPriceIdr)}/bln · ` +
    `Pro ${fmt(getPlanDefinition('professional').monthlyPriceIdr)}/bln.`;
  eq(
    desc,
    'Free untuk mencoba · Starter Rp 54.999/bln · Pro Rp 79.999/bln.',
    'teks turunan'
  );
});

console.log('\n[3] Nilai transien audit (49.999/149.999) tidak ada di copy landing:');
test('49.999 / 149.999 tidak muncul di FeatureSections', () => {
  ok(!featureSectionsSrc.includes('49.999'), '49.999 ada di FeatureSections.tsx');
  ok(!featureSectionsSrc.includes('149.999'), '149.999 ada di FeatureSections.tsx');
});
test('49.999 / 149.999 tidak muncul di PricingBlocks (render /harga)', () => {
  const pricingSrc = stripComments(
    fs.readFileSync(
      path.join(__dirname, '../components/landing/exact/PricingBlocks.tsx'),
      'utf8'
    )
  );
  ok(!pricingSrc.includes('49.999'), '49.999 ada di PricingBlocks.tsx');
  ok(!pricingSrc.includes('149.999'), '149.999 ada di PricingBlocks.tsx');
});

console.log(`\nd02StarterPrice.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
