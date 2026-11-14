/**
 * D-31 (Batch G1, P3) — /fitur mengiklankan "5.792 item" AHSP vs
 * 5.725 di dalam aplikasi.
 *
 * Kanonis (dipin juga di ahspCategoryGroups.test.ts): backing 5.742,
 * karantina 17, AKTIF 5.725. Halaman publik memakai jumlah aktif —
 * angka yang sama dengan modal Audit AHSP ("Aktif ditampilkan:
 * 5.725 item").
 *
 * Halaman publik TIDAK mengimpor officialAhspRepository (menarik
 * dataset 16 MB ke chunk publik); jumlah dipin di
 * src/data/ahspPublicCounts.ts dan tes ini menguncinya terhadap
 * dataset kanonis pada setiap jalan.
 *
 * Jalankan: npx tsx src/test/d31AhspPublicCount.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  AHSP_ACTIVE_ITEM_COUNT,
  AHSP_ACTIVE_ITEM_COUNT_FORMATTED,
} from '../data/ahspPublicCounts';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

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

console.log('D-31 — Jumlah AHSP publik = jumlah aktif kanonis (5.725):');

console.log('\n[1] Konstanta publik dipin terhadap dataset kanonis:');
test('AHSP_ACTIVE_ITEM_COUNT = 5725', () => {
  eq(AHSP_ACTIVE_ITEM_COUNT, 5725, 'konstanta');
});
test('format id-ID = "5.725"', () => {
  eq(AHSP_ACTIVE_ITEM_COUNT_FORMATTED, '5.725', 'format');
});
test('dataset kanonis aktif == konstanta (pin hidup)', () => {
  const active = officialAhspRepository.getActiveOfficialAhsp();
  eq(active.length, AHSP_ACTIVE_ITEM_COUNT, 'getActiveOfficialAhsp().length');
});
test('backing 5742 (sanity: aktif = backing − karantina 17)', () => {
  const all = officialAhspRepository.getAllOfficialAhsp();
  eq(all.length, 5742, 'getAllOfficialAhsp().length');
  eq(all.length - officialAhspRepository.getActiveOfficialAhsp().length, 17, 'karantina');
});

console.log('\n[2] Ketiga situs copy memakai konstanta (tanpa 5.792):');
const sites: Array<[string, string]> = [
  ['FeatureSections.tsx', '../components/landing/features/FeatureSections.tsx'],
  ['featuresContent.ts', '../components/landing/features/featuresContent.ts'],
  ['advantagesContent.ts', '../components/landing/advantages/advantagesContent.ts'],
];
for (const [label, rel] of sites) {
  test(`${label}: tanpa "5.792"`, () => {
    const src = stripComments(read(rel));
    ok(!src.includes('5.792'), `"5.792" masih ada di ${label}`);
  });
  test(`${label}: memakai AHSP_ACTIVE_ITEM_COUNT_FORMATTED`, () => {
    const src = stripComments(read(rel));
    ok(
      src.includes('AHSP_ACTIVE_ITEM_COUNT_FORMATTED'),
      `${label} tidak memakai konstanta kanonis`
    );
  });
}

console.log(`\nd31AhspPublicCount.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
