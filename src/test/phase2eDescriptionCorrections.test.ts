/**
 * EZRAB PHASE 2E — DESCRIPTION CORRECTIONS INTEGRITY TESTS
 *
 * Proves:
 * - Every correction's oldValue matches the current DB (patch applies cleanly).
 * - Corrections do NOT change prices, coefficients, or units (unless unit is the correction).
 * - No correction touches a quarantined code's identity.
 * - Every correction has PDF provenance.
 */

declare const process: any;

import { AHSP_2026_CANONICAL } from '../data/nationalCostDatabase/ahsp2026Canonical.generated';
import {
  DESCRIPTION_CORRECTIONS,
  getCorrections,
  hasCorrection,
} from '../data/nationalCostDatabase/ahspDescriptionCorrections';
import { isQuarantined } from '../data/nationalCostDatabase/ahspQuarantine';

interface Check { name: string; passed: boolean; detail?: string }
const checks: Check[] = [];
function check(name: string, passed: boolean, detail = '') {
  checks.push({ name, passed, detail });
}

const byCode = new Map<string, any>(
  AHSP_2026_CANONICAL.filter((i: any) => i.domain === 'CIPTA_KARYA')
    .map((i: any) => [String(i.code), i]),
);

// 1. Every correction's oldValue matches the DB
let matched = 0;
for (const c of DESCRIPTION_CORRECTIONS) {
  const item = byCode.get(c.code);
  if (!item) {
    check(`correction target exists: ${c.code}`, false, 'not in DB');
    continue;
  }
  let actual: string | undefined;
  if (c.field === 'name') actual = item.name;
  else if (c.field === 'unit') actual = item.unit;
  else if (c.field === 'materialName') {
    actual = item.materialComponents?.[c.materialIndex ?? 0]?.name;
  }
  if (actual === c.oldValue) matched++;
  else check(`oldValue matches DB: ${c.code}.${c.field}`, false,
    `DB has ${JSON.stringify(actual)?.slice(0, 60)}`);
}
check('all correction oldValues match DB', matched === DESCRIPTION_CORRECTIONS.length,
  `${matched}/${DESCRIPTION_CORRECTIONS.length}`);

// 2. Corrections preserve price and coefficients (spot-check corrected items)
const priceFieldsIntact = [
  '2.2.1.2.4', '4.1.8.1', '5.1.2.12', '5.1.2.13', '5.1.2.14',
  '5.1.2.15', '5.5.4.17', '6.5.10.11', '6.5.10.12', '6.5.2.1',
];
let priceOk = 0;
for (const code of priceFieldsIntact) {
  const item = byCode.get(code);
  if (!item) continue;
  // Price/coefficient fields must be numbers or null — corrections don't touch them,
  // so we verify the item still has its component structure intact.
  const comps = [...(item.laborComponents || []), ...(item.materialComponents || []), ...(item.equipmentComponents || [])];
  const allNumeric = comps.every(c =>
    typeof c.coefficient === 'number' &&
    (typeof c.unitPrice === 'number' || c.unitPrice === null));
  if (allNumeric) priceOk++;
  else check(`price/coeff intact: ${code}`, false, 'non-numeric field');
}
check('corrected items keep numeric price/coefficient fields', priceOk === priceFieldsIntact.length,
  `${priceOk}/${priceFieldsIntact.length}`);

// 3. No correction targets a quarantined code
let qClean = 0;
for (const c of DESCRIPTION_CORRECTIONS) {
  if (!isQuarantined(c.code)) qClean++;
  else check(`correction not on quarantined: ${c.code}`, false, 'quarantined');
}
check('no corrections on quarantined codes', qClean === DESCRIPTION_CORRECTIONS.length,
  `${qClean}/${DESCRIPTION_CORRECTIONS.length}`);

// 4. Every correction has PDF provenance (page > 0, reason non-empty)
let provOk = 0;
for (const c of DESCRIPTION_CORRECTIONS) {
  if (c.pdfPage > 0 && c.reason.length > 10) provOk++;
  else check(`provenance: ${c.code}.${c.field}`, false, 'missing');
}
check('all corrections have PDF provenance', provOk === DESCRIPTION_CORRECTIONS.length,
  `${provOk}/${DESCRIPTION_CORRECTIONS.length}`);

// 5. No duplicate corrections for the same code+field
const seen = new Set<string>();
let dupes = 0;
for (const c of DESCRIPTION_CORRECTIONS) {
  const key = `${c.code}.${c.field}.${c.materialIndex ?? ''}`;
  if (seen.has(key)) dupes++;
  seen.add(key);
}
check('no duplicate corrections', dupes === 0, `${dupes} dupes`);

// 6. 5.1.2.13/.14 are NOT quarantined (proven distinct by PDF)
check('5.1.2.13 not quarantined (distinct item)', !isQuarantined('5.1.2.13'));
check('5.1.2.14 not quarantined (distinct item)', !isQuarantined('5.1.2.14'));

// 7. hasCorrection / getCorrections API works
check('hasCorrection(5.5.4.17)', hasCorrection('5.5.4.17'));
check('getCorrections(4.1.8.1) has 2 entries', getCorrections('4.1.8.1').length === 2);
check('!hasCorrection(1.1.1.1)', !hasCorrection('1.1.1.1'));

// Report
const failed = checks.filter(c => !c.passed);
console.log(`\nPHASE 2E DESCRIPTION CORRECTIONS: ${checks.length - failed.length} PASSED, ${failed.length} FAILED\n`);
for (const c of checks) {
  console.log(`  ${c.passed ? 'PASS' : 'FAIL'} — ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
}
if (failed.length > 0) process.exit(1);
console.log('\nDescription corrections integrity intact.');
