/**
 * EZRAB PHASE 2C — INTEGRITY REGRESSION GATE
 * Snapshot test capturing the audit baseline. No data changes were made in Phase 2C.
 * This test FAILS if the canonical database changes unintentionally.
 *
 * When approved changes are applied (artifact removal, alias normalization, etc.),
 * this test must be updated with the new expected values.
 */

declare const process: any;

import { AHSP_2026_CANONICAL } from '../data/nationalCostDatabase/ahsp2026Canonical.generated';

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const checks: CheckResult[] = [];
function check(name: string, passed: boolean, detail: string = ''): void {
  checks.push({ name, passed, detail });
}

const CK = AHSP_2026_CANONICAL.filter((i: any) => i.domain === 'CIPTA_KARYA');
const byCode = new Map<string, any>(CK.map((i: any) => [String(i.code), i]));

// 1. Item/component counts (Phase 2B baseline)
check('CK item count = 2859', CK.length === 2859, `got ${CK.length}`);
let compCount = 0, priced = 0, nullCount = 0, zeroCount = 0;
for (const it of CK) {
  for (const g of ['laborComponents', 'materialComponents', 'equipmentComponents']) {
    const arr = (it as any)[g] || [];
    compCount += arr.length;
    for (const c of arr) {
      if (c.unitPrice === null || c.unitPrice === undefined) nullCount++;
      else if (typeof c.unitPrice === 'number' && c.unitPrice > 0) priced++;
      else if (c.unitPrice === 0) zeroCount++;
    }
  }
}
check('CK component count = 16506', compCount === 16506, `got ${compCount}`);
check('priced components = 14516', priced === 14516, `got ${priced}`);
check('null components = 1990', nullCount === 1990, `got ${nullCount}`);
check('no zero-priced components', zeroCount === 0, `got ${zeroCount}`);

// 2. Artifact codes still present (removal needs separate approval)
check('artifact 1.000 still quarantined (not silently fixed)', byCode.has('1.000'));
check('artifact 1.250 still quarantined (not silently fixed)', byCode.has('1.250'));
check('artifact 2.000 still quarantined (not silently fixed)', byCode.has('2.000'));
check('artifact 5.4.8.5 still present', byCode.has('5.4.8.5'));

// 3. Variant pairs identical (10 pairs + 2 orphans)
const pairs: Array<[string, string]> = [
  ['2.2.1.1.1a', '2.2.1.1.1.a'], ['2.2.1.1.2a', '2.2.1.1.2.a'],
  ['2.2.1.1.3a', '2.2.1.1.3.a'], ['2.2.1.1.5a', '2.2.1.1.5.a'],
  ['2.2.1.1.5b', '2.2.1.1.5.b'], ['2.2.1.1.5c', '2.2.1.1.5.c'],
  ['2.2.1.1.5d', '2.2.1.1.5.d'], ['2.2.1.1.6a', '2.2.1.1.6.a'],
  ['2.2.1.1.6b', '2.2.1.1.6.b'], ['2.2.1.1.6c', '2.2.1.1.6.c'],
];
let pairsOk = 0;
for (const [a, b] of pairs) {
  const ia = byCode.get(a), ib = byCode.get(b);
  if (ia && ib && ia.description === ib.description && ia.unit === ib.unit) pairsOk++;
}
check('10 variant pairs present and identical', pairsOk === 10, `got ${pairsOk}/10`);
check('orphan 2.2.1.1.6d present', byCode.has('2.2.1.1.6d'));
check('orphan 2.2.1.1.4.a present', byCode.has('2.2.1.1.4.a'));

// 4. Missing items NOT silently added (Phase 2C: read-only audit, additions need approval)
const genuinelyMissing = ['2.2.1.1.4a', '5.3.4.17', '6.1.3.6', '7.3.1', '7.3.2'];
let stillMissing = 0;
for (const code of genuinelyMissing) {
  if (!byCode.get(code)) stillMissing++;
}
check('genuinely missing items not silently added', stillMissing === 5, `got ${stillMissing}/5 absent`);

// 5. Price integrity from Phase 2B preserved
const item1111 = byCode.get('1.1.1.1');
check('item 1.1.1.1 exists with components', !!item1111 && (item1111.laborComponents || []).length > 0);
const l01 = (item1111?.laborComponents || []).find((c: any) => c.code === 'L.01');
check('1.1.1.1 L.01 = 100000', l01?.unitPrice === 100000, `got ${l01?.unitPrice}`);

// 6. No duplicate codes
const codeSet = new Set<string>();
let dupes = 0;
for (const i of CK) {
  const c = String((i as any).code);
  if (codeSet.has(c)) dupes++;
  codeSet.add(c);
}
check('no duplicate codes', dupes === 0, `got ${dupes} dupes`);

// Report
const failed = checks.filter(c => !c.passed);
console.log(`\nPHASE 2C INTEGRITY GATE: ${checks.length - failed.length} PASSED, ${failed.length} FAILED\n`);
for (const c of checks) {
  console.log(`  ${c.passed ? 'PASS' : 'FAIL'} — ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
}
if (failed.length > 0) {
  console.log('\nBaseline changed — if this is an approved change, update this test.');
  process.exit(1);
}
console.log('\nBaseline intact.');
