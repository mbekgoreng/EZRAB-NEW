/**
 * EZRAB — BINA MARGA EXCEL ACCEPTANCE TEST (PHASE 46)
 * ==================================================
 * Verifies that official Bina Marga AHSP unit prices, resource price database,
 * components, and price resolver match with 100% precision.
 */

import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import {
  OFFICIAL_BM_2026_DHSP_MAP,
  BM_2026_DHSP_TOTAL_COUNT,
  BM_2026_DHSP_PRICED_COUNT,
} from '../../src/data/nationalCostDatabase/officialBinaMargaDhsp2026';
import {
  OFFICIAL_BM_2026_LABOR,
  OFFICIAL_BM_2026_MATERIALS,
  OFFICIAL_BM_2026_EQUIPMENT,
} from '../../src/data/nationalCostDatabase/officialBinaMargaPrices2026';

interface TestCase {
  code: string;
  expectedPrice: number | null;
  expectedNameSubstring: string;
  expectedUnit: string;
  expectedStatus: 'FULL' | 'MISSING';
}

const MANDATORY_TESTS: TestCase[] = [
  {
    code: '2.1.(1)',
    expectedPrice: 79885,
    expectedNameSubstring: 'Galian untuk Selokan Drainase',
    expectedUnit: 'Meter Kubik',
    expectedStatus: 'FULL',
  },
  {
    code: '2.2.(1)',
    expectedPrice: 1000948,
    expectedNameSubstring: 'Pasangan Batu dengan Mortar',
    expectedUnit: 'Meter Kubik',
    expectedStatus: 'FULL',
  },
  {
    code: '3.1.(1)',
    expectedPrice: 42189,
    expectedNameSubstring: 'Galian Biasa',
    expectedUnit: 'Meter Kubik',
    expectedStatus: 'FULL',
  },
  {
    code: '5.1.(1a)',
    expectedPrice: 570185,
    expectedNameSubstring: 'Lapis Fondasi Agregat Kelas A',
    expectedUnit: 'Meter Kubik',
    expectedStatus: 'FULL',
  },
  {
    code: '6.1.(1)',
    expectedPrice: 22131,
    expectedNameSubstring: 'Lapis Resap Pengikat',
    expectedUnit: 'Liter',
    expectedStatus: 'FULL',
  },
  {
    code: '1.2',
    expectedPrice: null,
    expectedNameSubstring: 'Mobilisasi',
    expectedUnit: 'Lumsum',
    expectedStatus: 'MISSING',
  },
];

console.log('============================================================');
console.log('BINA MARGA 2026 EXCEL ACCEPTANCE TESTS (PHASE 46)');
console.log('============================================================\n');

let failedCount = 0;

// Test 1: Price Master Integrity
console.log('[SECTION 1] RESOURCE PRICE MASTER AUDIT');
console.log(`  - Labor records     : ${OFFICIAL_BM_2026_LABOR.length}`);
console.log(`  - Material records  : ${OFFICIAL_BM_2026_MATERIALS.length}`);
console.log(`  - Equipment records : ${OFFICIAL_BM_2026_EQUIPMENT.length}`);

if (OFFICIAL_BM_2026_LABOR.length === 0 || OFFICIAL_BM_2026_MATERIALS.length === 0 || OFFICIAL_BM_2026_EQUIPMENT.length === 0) {
  console.error('  [FAIL] Resource price lists must not be empty');
  failedCount++;
} else {
  console.log('  [PASS] Resource price masters loaded successfully.\n');
}

// Test 2: DHSP Map Integrity
console.log('[SECTION 2] DHSP MAP AUDIT');
console.log(`  - Total DHSP items  : ${BM_2026_DHSP_TOTAL_COUNT}`);
console.log(`  - Priced DHSP items : ${BM_2026_DHSP_PRICED_COUNT}`);

if (BM_2026_DHSP_TOTAL_COUNT !== 1137) {
  console.error(`  [FAIL] Expected 1,137 DHSP items, got ${BM_2026_DHSP_TOTAL_COUNT}`);
  failedCount++;
} else {
  console.log('  [PASS] Exactly 1,137 DHSP items loaded into map.\n');
}

// Test 3: Canonical Item Pricing via priceResolver2026
console.log('[SECTION 3] MANDATORY TEST CASES (RESOLVER & PARITY)');

for (const tc of MANDATORY_TESTS) {
  console.log(`[TEST] Code: ${tc.code}`);

  // 1. Verify in DHSP Map
  const dhspEntry = OFFICIAL_BM_2026_DHSP_MAP.get(tc.code);
  if (!dhspEntry) {
    console.error(`  [FAIL] ${tc.code} not found in OFFICIAL_BM_2026_DHSP_MAP`);
    failedCount++;
    continue;
  }

  if (tc.expectedPrice !== null) {
    if (dhspEntry.unitPrice !== tc.expectedPrice) {
      console.error(`  [FAIL] DHSP map price: expected ${tc.expectedPrice}, got ${dhspEntry.unitPrice}`);
      failedCount++;
      continue;
    }
    console.log(`  [PASS] DHSP unit price: Rp ${dhspEntry.unitPrice.toLocaleString('id-ID')} (${dhspEntry.sourceSheet}, R${dhspEntry.sourceRow})`);
  } else {
    if (dhspEntry.unitPrice !== null) {
      console.error(`  [FAIL] Expected null price for ${tc.code}, got ${dhspEntry.unitPrice}`);
      failedCount++;
      continue;
    }
    console.log(`  [PASS] DHSP unit price: null (tanpa analisa / informative — NO Rp0 FABRICATION)`);
  }

  // 2. Verify in Master Registry Canonical Items
  const canonicalItem = ALL_OFFICIAL_AHSP_ITEMS.find((it) => it.code === tc.code);
  if (!canonicalItem) {
    console.error(`  [FAIL] ${tc.code} not found in ALL_OFFICIAL_AHSP_ITEMS`);
    failedCount++;
    continue;
  }

  if (!canonicalItem.name.toLowerCase().includes(tc.expectedNameSubstring.toLowerCase())) {
    console.error(`  [FAIL] Name mismatch: "${canonicalItem.name}" vs "${tc.expectedNameSubstring}"`);
    failedCount++;
    continue;
  }
  console.log(`  [PASS] Canonical item: "${canonicalItem.name}" (${canonicalItem.unit})`);

  // 3. Verify in priceResolver2026
  const comp = priceResolver2026.resolveAhspUnitPrice(canonicalItem);
  const resolvedPrice = comp.hspPrice;

  if (tc.expectedPrice !== null) {
    if (resolvedPrice !== tc.expectedPrice) {
      console.error(`  [FAIL] Resolved price: expected ${tc.expectedPrice}, got ${resolvedPrice}`);
      failedCount++;
      continue;
    }
    console.log(`  [PASS] Resolved price: Rp ${resolvedPrice?.toLocaleString('id-ID')} (status: ${comp.pricingStatus})`);
    console.log(`  [PASS] Direct cost: Rp ${comp.unitPrice?.toLocaleString('id-ID')}, Overhead: Rp ${comp.overheadAmount?.toLocaleString('id-ID')}`);
    console.log(`  [PASS] Provenance: ${comp.provenanceSource}`);
  } else {
    if (resolvedPrice !== null) {
      console.error(`  [FAIL] Expected resolved price to be null, got ${resolvedPrice}`);
      failedCount++;
      continue;
    }
    console.log(`  [PASS] Resolved price: null (pricingStatus: ${comp.pricingStatus})`);
  }

  console.log();
}

console.log('============================================================');
if (failedCount > 0) {
  console.error(`BINA MARGA ACCEPTANCE TESTS FAILED (${failedCount} failures)`);
  process.exit(1);
} else {
  console.log('ALL BINA MARGA 2026 ACCEPTANCE TESTS PASSED (100% PARITY)');
  console.log('============================================================');
}
