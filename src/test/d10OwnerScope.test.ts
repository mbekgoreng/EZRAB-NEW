/**
 * D-10 + NEW-06 (Batch G1, P3) — PIN CAKUPAN OWNER, BUKAN PERBAIKAN.
 *
 * D-10 (testimoni / toggle bulanan-tahunan / video tidak ada) adalah
 * keputusan cakupan owner (OD-04):
 * - Testimoni: TIDAK PERNAH dikarang. Tidak ada testimoni sampai
 *   owner memasok kutipan nyata.
 * - Toggle & video: hanya ada di kode mati (NEW-06). Rekomendasi
 *   rencana (OD-04) adalah mem-port toggle, tetapi revival kode
 *   mati diputuskan owner sebagai tugas terpisah — batch ini TIDAK
 *   membangkitkan atau menghapus kode mati itu.
 *
 * Tes ini MENGUNCI keadaan saat ini agar perubahan di masa depan
 * (port toggle, video nyata, testimoni nyata) terjadi lewat
 * keputusan sadar — bukan lewat kebangkitan diam-diam atau
 * fabrikasi. Bila owner menyetujui revival, tes ini diperbarui
 * bersamaan dengan tugas revival tersebut.
 *
 * Jalankan: npx tsx src/test/d10OwnerScope.test.ts
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
const SRC = path.join(__dirname, '..');

/** Semua importer suatu modul (di luar berkas itu sendiri + tes). */
function findImporters(moduleBase: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(full);
      } else if (/\.(tsx?|mts|cts)$/.test(entry.name)) {
        if (full.endsWith(`${moduleBase}.tsx`) || full.endsWith(`${moduleBase}.ts`)) continue;
        const src = stripComments(fs.readFileSync(full, 'utf8'));
        if (new RegExp(`from ['"][^'"]*${moduleBase}['"]`).test(src)) hits.push(full);
      }
    }
  };
  walk(SRC);
  return hits;
}

console.log('D-10/NEW-06 — Pin cakupan owner (tidak ada fabrikasi, tidak ada revival diam-diam):');

console.log('\n[1] Tidak ada testimoni karangan di copy publik:');
test('featuresContent + advantagesContent tanpa kata testimoni', () => {
  for (const rel of [
    '../components/landing/features/featuresContent.ts',
    '../components/landing/advantages/advantagesContent.ts',
    '../components/landing/features/FeatureSections.tsx',
  ]) {
    const src = stripComments(read(rel));
    ok(!/testimoni/i.test(src), `kata testimoni muncul di ${rel}`);
  }
});
test('AdvantagesPage hanya menyatakan penolakan testimoni fiktif', () => {
  const src = stripComments(read('../components/landing/advantages/AdvantagesPage.tsx'));
  const matches = src.match(/(tanpa )?testimoni[^.\n]*/gi) ?? [];
  ok(
    matches.length <= 1 && matches.every((m) => /tanpa testimoni fiktif/i.test(m)),
    `klaim testimoni lain di AdvantagesPage: ${JSON.stringify(matches)}`
  );
});

console.log('\n[2] NEW-06 — kode mati tetap mati (tanpa importer):');
for (const mod of ['ExactPricing', 'ExactMagicAi', 'ExactRoles', 'ExactStackedShowcase']) {
  test(`${mod} tanpa importer`, () => {
    const importers = findImporters(mod);
    ok(importers.length === 0, `${mod} kini diimpor oleh: ${importers.join(', ')}`);
  });
}
test('toggle bulanan/tahunan TIDAK ada di PricingCards yang live', () => {
  const src = stripComments(read('../components/landing/exact/PricingBlocks.tsx'));
  // 'monthly' saja tidak dihitung — monthlyPriceIdr adalah field
  // harga kanonis. Yang menandakan toggle: penyebutan tahunan.
  ok(!/yearly|tahunan/i.test(src), 'penyebutan tahunan muncul di PricingCards');
});
test('tidak ada <video> di komponen landing yang live', () => {
  const liveFiles = [
    '../components/landing/exact/AiShowcase.tsx',
    '../components/landing/exact/ExactWorkflow.tsx',
    '../components/landing/ExactLandingPage.tsx',
    '../components/landing/exact/PricingBlocks.tsx',
  ];
  for (const rel of liveFiles) {
    const src = stripComments(read(rel));
    ok(!src.includes('<video'), `<video> muncul di ${rel}`);
  }
});

console.log('\n[3] plans.ts tidak punya harga tahunan (toggle butuh data baru):');
test('tidak ada yearlyPriceIdr di plans.ts', () => {
  const src = stripComments(read('../billing/plans.ts'));
  ok(!src.includes('yearlyPriceIdr'), 'yearlyPriceIdr ada — asumsi revival berubah');
});

console.log(`\nd10OwnerScope.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
