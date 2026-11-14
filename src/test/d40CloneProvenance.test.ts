/**
 * D-40 (Batch F, P3) — Item hasil duplikasi kehilangan flag
 * "⚠ Perlu verifikasi".
 *
 * Sebelum perbaikan, jalur duplikat hanya meneruskan `priceStatus` —
 * `verificationStatus` + seluruh provenance hilang di factory
 * (allowlist), sehingga salinan item NEEDS_VERIFICATION/ESTIMATED
 * diam-diam naik kelas menjadi VERIFIED. Kini semua jalur duplikat
 * (menu baris, massal, form SmartAdd) menyebarkan `cloneProvenance`.
 *
 * INVARIAN: ESTIMATED tetap ESTIMATED, NEEDS_VERIFICATION tetap
 * NEEDS_VERIFICATION. Aturan G1 factory tetap berlaku di atasnya
 * (klaim VERIFIED atas identitas UNSAFE tetap diturunkan — penurunan,
 * bukan peningkatan).
 *
 * Jalankan: npx tsx src/test/d40CloneProvenance.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  createRabItemRecord,
  cloneProvenance,
} from '../engine/rab/rabItemFactory';
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

/** Meniru handleDuplicateItem: field dasar + priceStatus + cloneProvenance. */
function duplicateViaFactory(source: RabItem): RabItem {
  return createRabItemRecord(
    {
      sectionName: source.sectionName || source.category || 'Pekerjaan Persiapan & Bowplank',
      category: source.category || source.sectionName || 'Pekerjaan Persiapan & Bowplank',
      code: (source.code || 'ITEM') + '.DUP',
      description: source.description + ' (Salinan)',
      volume: source.volume,
      unit: source.unit,
      unitPrice: source.unitPrice,
      volumeSource: source.volumeSource,
      ahspCode: source.ahspCode,
      priceStatus: source.priceStatus,
      ...cloneProvenance(source),
    } as any,
    'PRJ-T40',
  );
}

console.log('D-40 — Duplikat mewarisi provenance sumber:');

console.log('\n[1] cloneProvenance (helper):');
test('menyalin seluruh field provenance', () => {
  const src = {
    verificationStatus: 'NEEDS_VERIFICATION',
    priceSourceKind: 'MARKET_REFERENCE',
    priceSourceLabel: 'Survei pasar Nov 2026',
    priceSourceExplanation: 'Harga toko X',
    priceCostBasis: 'HSP',
    priceSourceName: 'Toko X',
    priceSourceSupplier: 'Supplier Y',
    priceSourceDate: '2026-11-01',
    priceSourceRegion: 'Jawa Timur',
    ahspMappingStatus: 'NEEDS_MAPPING',
    verificationDate: '2026-11-10T00:00:00.000Z',
    userDecisionStatus: 'DISETUJUI',
    calculationFormula: '2 x 3 x 0.5',
    isPartial: true,
    unresolvedComponentCount: 2,
    priceValidationWarnings: ['satuan tidak standar'],
  } as unknown as RabItem;
  const out = cloneProvenance(src);
  eq(out.verificationStatus, 'NEEDS_VERIFICATION', 'verificationStatus');
  eq(out.priceSourceKind, 'MARKET_REFERENCE', 'priceSourceKind');
  eq(out.priceSourceLabel, 'Survei pasar Nov 2026', 'priceSourceLabel');
  eq(out.priceSourceExplanation, 'Harga toko X', 'priceSourceExplanation');
  eq(out.priceCostBasis, 'HSP', 'priceCostBasis (penanda pengecualian O&P)');
  eq(out.priceSourceName, 'Toko X', 'priceSourceName');
  eq(out.priceSourceSupplier, 'Supplier Y', 'priceSourceSupplier');
  eq(out.priceSourceDate, '2026-11-01', 'priceSourceDate');
  eq(out.priceSourceRegion, 'Jawa Timur', 'priceSourceRegion');
  eq(out.ahspMappingStatus, 'NEEDS_MAPPING', 'ahspMappingStatus');
  eq(out.verificationDate, '2026-11-10T00:00:00.000Z', 'verificationDate');
  eq(out.userDecisionStatus, 'DISETUJUI', 'userDecisionStatus');
  eq(out.calculationFormula, '2 x 3 x 0.5', 'calculationFormula');
  eq(out.isPartial, true, 'isPartial');
  eq(out.unresolvedComponentCount, 2, 'unresolvedComponentCount');
  eq(out.priceValidationWarnings?.[0], 'satuan tidak standar', 'priceValidationWarnings');
});
test('SENGAJA mengecualikan identitas sumber & WBS', () => {
  const src = {
    verificationStatus: 'VERIFIED',
    qtoItemId: 'qto-1',
    calculationRunId: 'run-1',
    calculatorId: 'calc-1',
    wbsCode: '1.1',
    wbsNodeId: 'wbs:struktur',
    wbsMappingStatus: 'CONFIRMED',
    wbsSuggestedNodeId: 'wbs:pondasi',
  } as unknown as RabItem;
  const out = cloneProvenance(src) as any;
  eq(out.qtoItemId, undefined, 'qtoItemId tidak disalin');
  eq(out.calculationRunId, undefined, 'calculationRunId tidak disalin');
  eq(out.calculatorId, undefined, 'calculatorId tidak disalin');
  eq(out.wbsCode, undefined, 'wbsCode tidak disalin');
  eq(out.wbsNodeId, undefined, 'wbsNodeId tidak disalin');
  eq(out.wbsMappingStatus, undefined, 'wbsMappingStatus tidak disalin');
  eq(out.wbsSuggestedNodeId, undefined, 'wbsSuggestedNodeId tidak disalin');
});

console.log('\n[2] Alur duplikat penuh lewat factory:');
test('NEEDS_VERIFICATION + harga resolved tetap NEEDS_VERIFICATION', () => {
  const source = createRabItemRecord(
    {
      description: 'Pekerjaan galian',
      volume: 10,
      unit: 'm3',
      unitPrice: 100000,
      verificationStatus: 'NEEDS_VERIFICATION',
      priceSourceKind: 'MARKET_REFERENCE',
      priceSourceLabel: 'Survei pasar Nov 2026',
      priceCostBasis: 'HSP',
      verificationDate: '2026-11-10T00:00:00.000Z',
      userDecisionStatus: 'DISETUJUI',
    } as any,
    'PRJ-T40',
  );
  eq(source.verificationStatus, 'NEEDS_VERIFICATION', 'sumber');
  const clone = duplicateViaFactory(source);
  eq(clone.verificationStatus, 'NEEDS_VERIFICATION', 'salinan TIDAK naik ke VERIFIED');
  eq(clone.priceSourceKind, 'MARKET_REFERENCE', 'kind salinan');
  eq(clone.priceSourceLabel, 'Survei pasar Nov 2026', 'label salinan');
  eq(clone.priceCostBasis, 'HSP', 'basis HSP salinan (O&P tidak ditagih dua kali)');
  eq(clone.verificationDate, '2026-11-10T00:00:00.000Z', 'verificationDate salinan');
  eq(clone.userDecisionStatus, 'DISETUJUI', 'userDecisionStatus salinan');
});
test('ESTIMATED tetap ESTIMATED', () => {
  const source = createRabItemRecord(
    {
      description: 'Estimasi kasar',
      volume: 1,
      unit: 'ls',
      unitPrice: 500000,
      verificationStatus: 'ESTIMATED',
      priceSourceKind: 'EZRAB_ASSUMPTION',
    } as any,
    'PRJ-T40',
  );
  const clone = duplicateViaFactory(source);
  eq(clone.verificationStatus, 'ESTIMATED', 'salinan tetap ESTIMATED');
  eq(clone.priceSourceKind, 'EZRAB_ASSUMPTION', 'kind salinan');
});
test('VERIFIED + kode kanonis tetap VERIFIED + OFFICIAL_AHSP', () => {
  const source = createRabItemRecord(
    {
      description: 'Item AHSP resmi',
      volume: 2,
      unit: 'm3',
      unitPrice: 250000,
      ahspCode: '1.1.2.1',
      verificationStatus: 'VERIFIED',
      priceSourceKind: 'OFFICIAL_AHSP',
    } as any,
    'PRJ-T40',
  );
  eq(source.ahspIdentityStatus, 'SAFE', 'identitas sumber SAFE');
  const clone = duplicateViaFactory(source);
  eq(clone.verificationStatus, 'VERIFIED', 'salinan tetap VERIFIED');
  eq(clone.priceSourceKind, 'OFFICIAL_AHSP', 'salinan tetap OFFICIAL_AHSP');
  eq(clone.ahspIdentityStatus, 'SAFE', 'salinan tetap SAFE');
});
test('G1 tetap berlaku: klaim VERIFIED atas kode legacy tetap diturunkan', () => {
  // 'A.2.2.1.4' = salah satu dari 24 defaultAhspCode registry kalkulator
  // (terbukti non-kanonis oleh Batch B + tes D-44). PERANGKAP: 'C.37'
  // BUKAN contoh yang valid — itu kode huruf Bina Marga yang MEMANG
  // ada di katalog kanonis (canonicalAhspCodeExists('C.37') === true).
  const source = createRabItemRecord(
    {
      description: 'Item kode legacy',
      volume: 1,
      unit: 'ls',
      unitPrice: 100000,
      ahspCode: 'A.2.2.1.4',
      verificationStatus: 'VERIFIED',
      priceSourceKind: 'OFFICIAL_AHSP',
    } as any,
    'PRJ-T40',
  );
  eq(source.verificationStatus, 'NEEDS_VERIFICATION', 'sumber diturunkan G1');
  eq(source.priceSourceKind, 'UNRESOLVED', 'klaim resmi sumber dicabut G1');
  const clone = duplicateViaFactory(source);
  eq(clone.verificationStatus, 'NEEDS_VERIFICATION', 'salinan tidak membangkitkan VERIFIED');
  eq(clone.priceSourceKind, 'UNRESOLVED', 'salinan tidak membangkitkan OFFICIAL_AHSP');
});
test('salinan tidak mewarisi identitas QTO/WBS sumber', () => {
  const source = createRabItemRecord(
    {
      description: 'Item dari QTO terpetakan',
      volume: 1,
      unit: 'ls',
      unitPrice: 100000,
      qtoItemId: 'qto-1',
      calculationRunId: 'run-1',
      calculatorId: 'calc-1',
      wbsCode: '1.1',
      wbsNodeId: 'wbs:struktur',
      wbsMappingStatus: 'CONFIRMED',
    } as any,
    'PRJ-T40',
  );
  eq((source as any).qtoItemId, 'qto-1', 'sumber punya qtoItemId');
  eq((source as any).wbsNodeId, 'wbs:struktur', 'sumber terpetakan');
  const clone = duplicateViaFactory(source) as any;
  eq(clone.qtoItemId, undefined, 'salinan tanpa qtoItemId');
  eq(clone.calculationRunId, undefined, 'salinan tanpa calculationRunId');
  eq(clone.calculatorId, undefined, 'salinan tanpa calculatorId');
  eq(clone.wbsCode, undefined, 'salinan tanpa wbsCode');
  eq(clone.wbsNodeId, undefined, 'salinan tanpa wbsNodeId');
  eq(clone.wbsMappingStatus, undefined, 'salinan tanpa wbsMappingStatus');
});

console.log('\n[3] Wiring jalur duplikat (struktural):');
const viewPath = path.join(__dirname, '../components/rab/RabEstimasiView.tsx');
const viewSrc = fs.readFileSync(viewPath, 'utf8');
const smartAddPath = path.join(__dirname, '../components/estimator/SmartAddWorkItemModal.tsx');
const smartAddSrc = fs.readFileSync(smartAddPath, 'utf8');
test('handleDuplicateItem menyebarkan cloneProvenance', () => {
  const handler = viewSrc.slice(
    viewSrc.indexOf('const handleDuplicateItem'),
    viewSrc.indexOf('const handleDeleteItem'),
  );
  contains(handler, '...cloneProvenance(item)', 'spread di handler duplikat');
});
test('duplikat massal memakai handler yang sama', () => {
  contains(viewSrc, 'handleDuplicateItem', 'bulk path merujuk handler');
  const bulk = viewSrc.slice(viewSrc.indexOf('onBulkDuplicate'), viewSrc.indexOf('onBulkDuplicate') + 400);
  contains(bulk, 'handleDuplicateItem', 'onBulkDuplicate memanggil handleDuplicateItem');
});
test('form duplikat SmartAdd menyebarkan cloneProvenance', () => {
  contains(smartAddSrc, '...cloneProvenance(selectedDuplicateItem)', 'spread di form duplikat');
});
test("fallback `|| 'VERIFIED'` yang menaikkan status sudah dihapus dari form duplikat", () => {
  // Satu-satunya penyebutan yang tersisa adalah komentar yang
  // mendokumentasikan penghapusannya — hapus baris komentar penuh
  // sebelum memeriksa kode.
  const codeOnly = smartAddSrc
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  notContains(codeOnly, "|| 'VERIFIED'", 'fallback upgrade VERIFIED di kode');
});

console.log(`\nHasil D-40: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-40 LOLOS');
