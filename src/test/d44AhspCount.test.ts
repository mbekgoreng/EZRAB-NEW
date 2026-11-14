/**
 * D-44 (Batch F, P3) — Header "dari N AHSP" tidak konsisten
 * (1 CALCULATOR → "0 AHSP"; 2 CALCULATOR → "1 AHSP";
 * 2 CALCULATOR + 1 AHSP → "3 AHSP").
 *
 * Penyebab: aturan hitung lama (`ahspCode` non-kosong) menghitung
 * `defaultAhspCode` legacy pada item CALCULATOR sebagai AHSP, padahal
 * Batch B membuktikan ke-24 kode default itu TIDAK ADA yang cocok
 * dengan katalog kanonis. Aturan kanonis baru (`hasVerifiedAhspLink`,
 * satu tempat di src/engine/ahsp/ahspCounting.ts):
 *  - flag SAFE → hitung; flag UNSAFE → jangan pernah;
 *  - tanpa flag (legacy/pra-factory) → hitung hanya bila kodenya ada
 *    di katalog kanonis (cek yang sama dengan gerbang G1 factory).
 * `priceSourceKind` sengaja BUKAN kriteria: hanya 131 dari 154 item
 * demo berkode berkind OFFICIAL_AHSP — kind saja akan menghitung
 * terlalu sedikit.
 *
 * Jalankan: npx tsx src/test/d44AhspCount.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import {
  hasVerifiedAhspLink,
  countVerifiedAhspLinks,
} from '../engine/ahsp/ahspCounting';
import { canonicalAhspCodeExists } from '../data/priceDatabase2026/ahspDisplayPolicy';
import { ALL_CONSTRUCTION_CALCULATORS } from '../engine/constructionCalculators/registry';
import { PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import type { RabItem } from '../types';

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

console.log('D-44 — Satu aturan hitung AHSP kanonis:');

console.log('\n[1] Fixture penerimaan (repro D-44):');
test('1 manual + 1 CALCULATOR legacy + 1 AHSP kanonis -> hitung 1', () => {
  const manual = createRabItemRecord(
    { description: 'Item manual', volume: 1, unit: 'ls', unitPrice: 1000 } as any,
    'PRJ-T44',
  );
  // 'A.2.2.1.4' = salah satu dari 24 defaultAhspCode registry kalkulator
  // (terbukti non-kanonis oleh Batch B). PERANGKAP: 'C.37' BUKAN contoh
  // yang valid — itu kode huruf Bina Marga yang MEMANG ada di katalog
  // kanonis (canonicalAhspCodeExists('C.37') === true).
  const calculator = createRabItemRecord(
    {
      description: 'Item kalkulator template',
      volume: 1,
      unit: 'm3',
      unitPrice: 1000,
      ahspCode: 'A.2.2.1.4',
      calculatorId: 'calc-weir',
      volumeSource: 'CALCULATOR',
    } as any,
    'PRJ-T44',
  );
  const ahsp = createRabItemRecord(
    {
      description: 'Item pemilih AHSP',
      volume: 1,
      unit: 'm3',
      unitPrice: 1000,
      ahspCode: '1.1.2.1',
      verificationStatus: 'VERIFIED',
      priceSourceKind: 'OFFICIAL_AHSP',
    } as any,
    'PRJ-T44',
  );
  eq(calculator.ahspIdentityStatus, 'UNSAFE', 'kalkulator legacy ter-flag UNSAFE oleh factory');
  eq(ahsp.ahspIdentityStatus, 'SAFE', 'item AHSP kanonis ter-flag SAFE');
  eq(hasVerifiedAhspLink(manual), false, 'manual tidak dihitung');
  eq(hasVerifiedAhspLink(calculator), false, 'CALCULATOR legacy tidak dihitung');
  eq(hasVerifiedAhspLink(ahsp), true, 'AHSP kanonis dihitung');
  eq(countVerifiedAhspLinks([manual, calculator, ahsp]), 1, 'total fixture = 1');
});

console.log('\n[2] Ke-24 defaultAhspCode kalkulator tidak ada yang terhitung:');
test('semua defaultAhspCode registry bukan kode kanonis', () => {
  const codes = ALL_CONSTRUCTION_CALCULATORS
    .map((c: any) => c.defaultAhspCode as string | undefined)
    .filter((c): c is string => Boolean(c));
  eq(codes.length, 24, 'jumlah defaultAhspCode registry');
  const canonical = codes.filter((c) => canonicalAhspCodeExists(c));
  eq(canonical.length, 0, `kode kanonis di antara default (ditemukan: ${canonical.join(', ')})`);
});
test('item factory dengan tiap defaultAhspCode tidak terhitung', () => {
  const codes = ALL_CONSTRUCTION_CALCULATORS
    .map((c: any) => c.defaultAhspCode as string | undefined)
    .filter((c): c is string => Boolean(c));
  const items = codes.map((code, i) =>
    createRabItemRecord(
      {
        description: `Item kalkulator ${code}`,
        volume: 1,
        unit: 'ls',
        unitPrice: 1000,
        ahspCode: code,
        volumeSource: 'CALCULATOR',
      } as any,
      'PRJ-T44',
      { index: i },
    ),
  );
  eq(countVerifiedAhspLinks(items), 0, '0 dari 24 item legacy terhitung');
});

console.log('\n[3] Aturan baca untuk item tanpa flag (legacy/pra-factory):');
test('item tanpa flag + kode kanonis -> hitung (cek katalog saat baca)', () => {
  const legacy = {
    id: 'legacy-1',
    ahspCode: '1.1.2.1',
    code: '1.1.2.1',
  } as RabItem;
  eq(hasVerifiedAhspLink(legacy), true, 'legacy kanonis dihitung');
});
test('item tanpa flag + kode legacy -> jangan hitung', () => {
  const legacy = {
    id: 'legacy-2',
    ahspCode: 'A.2.2.1.4',
    code: 'A.2.2.1.4',
  } as RabItem;
  eq(hasVerifiedAhspLink(legacy), false, 'legacy non-kanonis tidak dihitung');
});
test('item tanpa flag + tanpa kode -> jangan hitung', () => {
  const legacy = { id: 'legacy-3' } as RabItem;
  eq(hasVerifiedAhspLink(legacy), false, 'tanpa kode tidak dihitung');
});
test('flag UNSAFE tidak pernah dihitung, apa pun kodenya', () => {
  const unsafe = {
    id: 'unsafe-1',
    ahspCode: '1.1.2.1',
    ahspIdentityStatus: 'UNSAFE',
  } as RabItem;
  eq(hasVerifiedAhspLink(unsafe), false, 'UNSAFE mengalahkan kode kanonis');
});

console.log('\n[4] Premium Demo — tidak ada regresi pada data asli:');
test('demo tetap 154 (aturan lama & baru sepakat di data asli)', () => {
  eq(countVerifiedAhspLinks(PREMIUM_DEMO_RAB_ITEMS), 154, 'jumlah AHSP demo');
  const oldRule = PREMIUM_DEMO_RAB_ITEMS.filter((i) => (i.ahspCode || '').trim()).length;
  eq(oldRule, 154, 'aturan lama pada demo (pembanding)');
});
test('kind OFFICIAL_AHSP saja akan menghitung terlalu sedikit (131) — bukti kind bukan kriteria', () => {
  const official = PREMIUM_DEMO_RAB_ITEMS.filter((i) => i.priceSourceKind === 'OFFICIAL_AHSP').length;
  eq(official, 131, 'item demo berkind OFFICIAL_AHSP');
  ok(official < 154, 'kind saja undercount — aturan identitas benar');
});

console.log('\n[5] Wiring (struktural):');
const viewPath = path.join(__dirname, '../components/rab/RabEstimasiView.tsx');
const viewSrc = fs.readFileSync(viewPath, 'utf8');
test('header memakai helper kanonis', () => {
  contains(viewSrc, 'countVerifiedAhspLinks(projectRabItems)', 'ahspLinkedCount dari helper');
  contains(viewSrc, 'countVerifiedAhspLinks', 'import helper');
});
test('aturan inline lama (filter ahspCode non-kosong) hilang dari header', () => {
  notContains(
    viewSrc,
    "projectRabItems.filter((i) => (i.ahspCode || '').trim()).length",
    'filter inline lama',
  );
});

console.log(`\nHasil D-44: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-44 LOLOS');
