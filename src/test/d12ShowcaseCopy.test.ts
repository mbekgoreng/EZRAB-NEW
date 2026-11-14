/**
 * D-12 (Batch G1, P1) — /fitur menjanjikan "langsung masuk ke
 * workspace" + tutorial terpandu, padahal pintu masuknya /daftar
 * yang dinonaktifkan (D-01) dan workspace terkunci kode (D-03).
 *
 * Perbaikan HANYA copy (gerbang D-01/D-03 TIDAK disentuh):
 * - Langkah 2 memakai wording draf OD-05 dari rencana perbaikan:
 *   "Minta akses demo — workspace dibuka dengan kode akses selama
 *   masa pratinjau".
 * - Langkah 3 dikualifikasi: tutorial berjalan di dalam workspace
 *   SETELAH akses diberikan.
 * - Catatan wayfinding "Mode demo langsung bisa dicoba" diganti
 *   wording berkode-akses yang sama.
 * - Sub-copy kotak CTA landing AiShowcase juga diperbaiki (janji
 *   "Masuk sebagai peran demo dan coba..." yang sama).
 *
 * Catatan OD-05: wording final masih menunggu persetujuan owner —
 * tes ini mengunci wording draf rencana agar tidak kembali ke janji
 * lama tanpa keputusan sadar.
 *
 * Jalankan: npx tsx src/test/d12ShowcaseCopy.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { START_STEPS } from '../components/landing/features/featuresContent';

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
/** Hapus komentar // dan blok. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const featuresContentSrc = stripComments(read('../components/landing/features/featuresContent.ts'));
const featureSectionsSrc = stripComments(read('../components/landing/features/FeatureSections.tsx'));
const aiShowcaseSrc = stripComments(read('../components/landing/exact/AiShowcase.tsx'));
const appSrc = read('../App.tsx');

console.log('D-12 — Copy showcase jujur soal akses (gerbang tidak disentuh):');

console.log('\n[1] START_STEPS (nilai runtime, bukan sekadar teks sumber):');
test('langkah 2 memakai wording berkode-akses OD-05', () => {
  const step2 = START_STEPS.find((s) => s.no === '2');
  ok(step2, 'langkah 2 tidak ditemukan');
  eq(
    step2!.desc,
    'Minta akses demo — workspace dibuka dengan kode akses selama masa pratinjau.',
    'desc langkah 2'
  );
});
test('langkah 3 mengualifikasi tutorial: sesudah akses diberikan', () => {
  const step3 = START_STEPS.find((s) => s.no === '3');
  ok(step3, 'langkah 3 tidak ditemukan');
  ok(
    step3!.desc.includes('Setelah akses diberikan'),
    `langkah 3 tidak terkualifikasi: ${JSON.stringify(step3!.desc)}`
  );
  ok(
    step3!.desc.includes('tutorial terpandu'),
    'langkah 3 kehilangan penyebutan tutorial'
  );
});

console.log('\n[2] Janji lama tidak ada lagi di copy:');
test('featuresContent: tanpa "langsung masuk ke workspace"', () => {
  ok(
    !featuresContentSrc.includes('langsung masuk ke workspace'),
    'janji lama masih ada di featuresContent.ts'
  );
});
test('FeatureSections: tanpa "langsung bisa dicoba"', () => {
  ok(
    !featureSectionsSrc.includes('langsung bisa dicoba'),
    'janji lama masih ada di FeatureSections.tsx'
  );
});
test('FeatureSections: catatan wayfinding memakai wording berkode-akses', () => {
  ok(
    featureSectionsSrc.includes('Demo dibuka dengan kode akses selama masa pratinjau'),
    'catatan wayfinding tidak memakai wording berkode-akses'
  );
});
test('AiShowcase: sub-copy CTA tanpa janji masuk demo instan', () => {
  ok(
    !aiShowcaseSrc.includes('Masuk sebagai peran demo dan coba'),
    'janji masuk demo instan masih ada di AiShowcase.tsx'
  );
  ok(
    aiShowcaseSrc.includes('Demo dibuka dengan kode akses selama masa pratinjau'),
    'sub-copy CTA AiShowcase tidak memakai wording berkode-akses'
  );
});

console.log('\n[3] Gerbang D-01/D-03 TIDAK disentuh (penjaga regresi):');
test('App.tsx: AUTH_ENABLED tetap false', () => {
  ok(appSrc.includes('const AUTH_ENABLED = false;'), 'AUTH_ENABLED berubah dari false');
});
test('App.tsx: CTA workspace /fitur tetap ke /daftar (tujuan tidak diubah)', () => {
  ok(
    appSrc.includes("onOpenWorkspace={() => handleOpenAuth('daftar')}"),
    'tujuan CTA /fitur berubah — di luar cakupan D-12'
  );
});
test('PasscodeGate tetap memvalidasi via server (submitAccessCode)', () => {
  const gateSrc = read('../auth/PasscodeGate.tsx');
  ok(gateSrc.includes('submitAccessCode(code)'), 'PasscodeGate tidak lagi memvalidasi via server');
});

console.log(`\nd12ShowcaseCopy.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
