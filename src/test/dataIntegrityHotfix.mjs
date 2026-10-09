/**
 * FASE 4A — Data integrity hotfix regression tests.
 *
 * 1. Total fantom Rp660.638.840 tidak boleh muncul di komponen estimator.
 * 2. PRICE_UNRESOLVED dibedakan dari harga nol eksplisit.
 * 3. Volume kosong/tidak valid tidak difabrikasi menjadi 1.
 *
 * Run: node src/test/dataIntegrityHotfix.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const P = process.cwd();
const entry = `
import { createRabItemRecord } from '${P}/src/engine/rab/rabItemFactory.ts';
import { resolvePriceStatus } from '${P}/src/engine/pricing/priceStatus.ts';
import { honestVolume, isValidVolume } from '${P}/src/engine/honestVolume.ts';
export { createRabItemRecord, resolvePriceStatus, honestVolume, isValidVolume };
`;
writeFileSync('/tmp/_diq_entry.mjs', entry);
mkdirSync(`${P}/.tmp_test`, { recursive: true });
buildSync({
  entryPoints: ['/tmp/_diq_entry.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: `${P}/.tmp_test/_diq_bundle.mjs`,
  absWorkingDir: P,
});
const { createRabItemRecord, resolvePriceStatus, honestVolume, isValidVolume } =
  await import(pathToFileURL(`${P}/.tmp_test/_diq_bundle.mjs`).href);

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// --- 1. Total fantom ---
test('tidak ada fallback 660638840 / 7 di komponen estimator', () => {
  for (const f of [
    'src/components/estimator/EstimatorMetrics.tsx',
    'src/components/estimator/SpreadsheetFooter.tsx',
  ]) {
    const src = readFileSync(`${P}/${f}`, 'utf8');
    if (src.includes('660638840')) throw new Error(`${f} masih mengandung 660638840`);
  }
  const m = readFileSync(`${P}/src/components/estimator/EstimatorMetrics.tsx`, 'utf8');
  if (m.includes('|| 7}')) throw new Error('EstimatorMetrics masih mengandung fallback || 7');
});

// --- 2. Status harga ---
test('harga kosong (undefined) -> PRICE_UNRESOLVED + NEEDS_VERIFICATION', () => {
  const it = createRabItemRecord({ description: 'X', volume: 10, unit: 'm3', unitPrice: undefined }, 'p1');
  eq(it.priceStatus, 'PRICE_UNRESOLVED', 'priceStatus');
  eq(it.verificationStatus, 'NEEDS_VERIFICATION', 'verificationStatus');
  eq(it.unitPrice, 0, 'unitPrice display');
  eq(it.amount, 0, 'amount');
});
test('harga NaN (field kosong di form) -> PRICE_UNRESOLVED', () => {
  const it = createRabItemRecord({ description: 'X', volume: 10, unit: 'm3', unitPrice: NaN }, 'p1');
  eq(it.priceStatus, 'PRICE_UNRESOLVED', 'priceStatus');
  eq(it.unitPrice, 0, 'stored as 0, flagged unresolved');
});
test('harga nol eksplisit -> PRICE_RESOLVED (bukan unresolved)', () => {
  const it = createRabItemRecord({ description: 'X', volume: 10, unit: 'm3', unitPrice: 0 }, 'p1');
  eq(it.priceStatus, 'PRICE_RESOLVED', 'priceStatus');
  eq(it.verificationStatus, 'VERIFIED', 'verificationStatus');
});
test('harga valid -> PRICE_RESOLVED + amount benar', () => {
  const it = createRabItemRecord({ description: 'X', volume: 5, unit: 'm3', unitPrice: 800000 }, 'p1');
  eq(it.priceStatus, 'PRICE_RESOLVED', 'priceStatus');
  eq(it.amount, 4000000, 'amount');
});
test('priceStatus eksplisit dari caller dihormati (duplikat)', () => {
  const it = createRabItemRecord(
    { description: 'X (Salinan)', volume: 10, unit: 'm3', unitPrice: 0, priceStatus: 'PRICE_UNRESOLVED' }, 'p1');
  eq(it.priceStatus, 'PRICE_UNRESOLVED', 'priceStatus preserved');
});
test('duplikat via SmartAdd: priceStatus diteruskan (cek kode)', () => {
  const src = readFileSync(`${P}/src/components/estimator/SmartAddWorkItemModal.tsx`, 'utf8');
  if (!src.includes('priceStatus: selectedDuplicateItem.priceStatus')) {
    throw new Error('SmartAdd duplicate tidak mewariskan priceStatus');
  }
});
test('resolvePriceStatus: string kosong/null/undefined/NaN -> UNRESOLVED', () => {
  eq(resolvePriceStatus(''), 'PRICE_UNRESOLVED', 'empty string');
  eq(resolvePriceStatus(null), 'PRICE_UNRESOLVED', 'null');
  eq(resolvePriceStatus(undefined), 'PRICE_UNRESOLVED', 'undefined');
  eq(resolvePriceStatus(NaN), 'PRICE_UNRESOLVED', 'NaN');
  eq(resolvePriceStatus('abc'), 'PRICE_UNRESOLVED', 'non-numeric');
  eq(resolvePriceStatus(0), 'PRICE_RESOLVED', 'explicit 0');
});

// --- 3. Volume jujur ---
test('honestVolume: tidak memfabrikasi 1', () => {
  eq(honestVolume(null), 0, 'null');
  eq(honestVolume(undefined), 0, 'undefined');
  eq(honestVolume(NaN), 0, 'NaN');
  eq(honestVolume(''), 0, 'empty string');
  eq(honestVolume('abc'), 0, 'non-numeric');
  eq(honestVolume(-5), 0, 'negative');
  eq(honestVolume(0), 0, 'zero stays zero');
  eq(honestVolume(10), 10, 'positive preserved');
  eq(honestVolume('7.5'), 7.5, 'numeric string');
});
test('isValidVolume: aturan domain', () => {
  eq(isValidVolume(10), true, 'positive');
  eq(isValidVolume(0), true, 'zero valid (bukan asumsi)');
  eq(isValidVolume(-1), false, 'negative invalid');
  eq(isValidVolume(NaN), false, 'NaN invalid');
  eq(isValidVolume(undefined), false, 'undefined invalid');
});
test('tidak ada pola || 1 tersisa di 5 file target', () => {
  const targets = [
    ['src/components/document/DedRabWorkflowView.tsx', 'volume: honestVolume(it.volume)'],
    ['src/components/estimator/SmartAddWorkItemModal.tsx', 'honestVolume(item.volume)'],
    ['src/components/import/IntelligentExcelImportModal.tsx', 'volume: honestVolume(item.volume)'],
    ['src/components/inspector/WorkItemInspectorDrawer.tsx', 'honestVolume(initialData?.volume)'],
    ['src/components/magic-ai/DedAnalysisDashboard.tsx', 'volume: honestVolume(it.quantity)'],
  ];
  for (const [f, marker] of targets) {
    const src = readFileSync(`${P}/${f}`, 'utf8');
    if (!src.includes(marker)) throw new Error(`${f}: perbaikan honestVolume tidak ditemukan`);
    // Hanya pola volume/quantity — fallback page-count/progress tidak relevan.
    if (/(volume|quantity)\s*:\s*[^,;]*\|\| 1/.test(src)) {
      throw new Error(`${f}: masih ada pola volume||1`);
    }
  }
});

console.log(failures === 0 ? '\nALL DATA INTEGRITY HOTFIX TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
