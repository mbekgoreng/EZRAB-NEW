/**
 * RUNTIME SMOKE TEST: AHSP 2026 PRICE INTEGRATION
 * ===============================================
 * Verifies that:
 * 1. AhspExplorer data path resolves positive prices for FULL & PARTIAL items.
 * 2. Unpriced items return null/MISSING and NEVER fake Rp0.
 * 3. DED->RAB Priority 4 resolver resolves official AHSP items to non-zero prices.
 * 4. ahspBridge saves non-zero materialCost/laborCost to project scope.
 */

import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { AhspPriceResolver } from '../../src/ded-rab-v2/ahsp/ahspPriceResolver';
import { saveProjectAhspFromCatalog, getProjectAhspRepo } from '../../src/project-data/ahspBridge';

console.log('========================================================');
console.log('RUNNING AHSP 2026 PRICE INTEGRATION RUNTIME SMOKE TEST');
console.log('========================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failCount++;
  }
}

// 1. Check Sample FULL item A.1.01.a.1 (Pembersihan dan pengupasan permukaan tanah)
const itemA1 = ALL_OFFICIAL_AHSP_ITEMS.find((x) => x.code === 'A.1.01.a.1');
assert(!!itemA1, 'Sample item A.1.01.a.1 exists in master registry');

if (itemA1) {
  const comp = priceResolver2026.resolveAhspUnitPrice(itemA1);
  assert(comp.pricingStatus === 'FULL', `A.1.01.a.1 status is FULL (got ${comp.pricingStatus})`);
  assert(comp.unitPrice === 8150, `A.1.01.a.1 resolved unitPrice is exactly 8150 IDR (got ${comp.unitPrice})`);
  assert(comp.labor.subtotalPerUnit === 8150, `A.1.01.a.1 labor subtotal is 8150 (got ${comp.labor.subtotalPerUnit})`);
  assert(comp.missingComponents === 0, `A.1.01.a.1 missing components is 0 (got ${comp.missingComponents})`);
}

// 2. Check Sample FULL item with material: 6.3.(7a) (Aspal Pen.60/70)
const itemAspal = ALL_OFFICIAL_AHSP_ITEMS.find((x) => x.code === '6.3.(7a)');
assert(!!itemAspal, 'Sample item 6.3.(7a) exists in master registry');

if (itemAspal) {
  const comp = priceResolver2026.resolveAhspUnitPrice(itemAspal);
  assert(comp.pricingStatus === 'FULL', `6.3.(7a) status is FULL (got ${comp.pricingStatus})`);
  assert(comp.unitPrice === 12750, `6.3.(7a) resolved unitPrice is 12750 IDR (got ${comp.unitPrice})`);
  assert(comp.material.subtotalPerUnit === 12750, `6.3.(7a) material subtotal is 12750 (got ${comp.material.subtotalPerUnit})`);
}

// 3. Check Overall Catalog Statistics
let fullCount = 0;
let partialCount = 0;
let missingCount = 0;
let zeroPriceCount = 0;

ALL_OFFICIAL_AHSP_ITEMS.forEach((it) => {
  const comp = priceResolver2026.resolveAhspUnitPrice(it);
  if (comp.pricingStatus === 'FULL') fullCount++;
  else if (comp.pricingStatus === 'PARTIAL') partialCount++;
  else missingCount++;

  if (comp.unitPrice === 0) zeroPriceCount++;
});

console.log(`\nCatalog Breakdown: FULL=${fullCount}, PARTIAL=${partialCount}, MISSING=${missingCount}`);
assert(fullCount >= 1200, `At least 1200 items are FULL priced (got ${fullCount})`);
assert(partialCount > 0, `PARTIAL items exist (got ${partialCount})`);
assert(zeroPriceCount === 0, `ZERO items have unitPrice === 0 (got ${zeroPriceCount}) — Missing is strictly NULL`);

// 4. Test DED->RAB Priority 4 Price Resolver
const dedResolver = AhspPriceResolver.getInstance();
const resolvedDed = dedResolver.resolvePrice({
  id: 'test-item-1',
  sectionName: 'Pekerjaan Persiapan',
  category: 'Persiapan',
  code: 'A.1.01.a.1',
  name: '1 m2 Pembersihan dan pengupasan permukaan tanah',
  unit: 'm2',
  quantity: 10,
  ahspMatch: {
    ahspCode: 'A.1.01.a.1',
    name: '1 m2 Pembersihan dan pengupasan permukaan tanah',
    unit: 'm2',
    category: 'Persiapan',
    matchType: 'EXACT',
    similarity: 1.0,
  },
});

assert(resolvedDed.unitPrice === 8150, `DED->RAB Priority 4 unitPrice is 8150 (got ${resolvedDed.unitPrice})`);
assert(resolvedDed.totalPrice === 81500, `DED->RAB Priority 4 totalPrice for 10 m2 is 81500 (got ${resolvedDed.totalPrice})`);
assert(resolvedDed.laborPrice === 8150, `DED->RAB Priority 4 laborPrice is 8150 (got ${resolvedDed.laborPrice})`);
assert(resolvedDed.priceSource === 'OFFICIAL_AHSP', `DED->RAB priceSource is OFFICIAL_AHSP (got ${resolvedDed.priceSource})`);

// 5. Test ahspBridge saveProjectAhspFromCatalog
if (itemA1) {
  const testProjectId = 'test-proj-runtime-smoke';
  const savedEntity = saveProjectAhspFromCatalog(testProjectId, itemA1);
  assert(savedEntity.ahspCode === 'A.1.01.a.1', 'Saved project AHSP code matches');
  assert(savedEntity.laborCost === 8150, `Saved project AHSP laborCost is 8150 (got ${savedEntity.laborCost})`);
  assert(savedEntity.materialCost === 0, `Saved project AHSP materialCost is 0 (got ${savedEntity.materialCost})`);
  
  // Cleanup test repo
  const repo = getProjectAhspRepo(testProjectId);
  repo.list().forEach((x) => repo.remove(x.id));
}

console.log(`\n========================================================`);
console.log(`SMOKE TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log(`========================================================`);

if (failCount > 0) {
  process.exit(1);
}
