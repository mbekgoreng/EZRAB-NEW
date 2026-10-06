/**
 * EZRAB — CIPTA KARYA EXCEL ACCEPTANCE TEST (PHASE 28)
 * ===================================================
 * Verifies that official Cipta Karya AHSP unit prices from SE DJBK No. 47/SE/Dk/2026
 * (ahsp bina kontruksi 2026.xlsx) match exactly.
 */

import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import { OFFICIAL_CK_2026_DHSP_MAP } from '../../src/data/nationalCostDatabase/officialCiptaKaryaDhsp2026';

interface TestCase {
  code: string;
  expectedPrice: number;
  expectedNameSubstring: string;
  expectedUnit: string;
}

const MANDATORY_TESTS: TestCase[] = [
  {
    code: '1.1.1.1',
    expectedPrice: 787397,
    expectedNameSubstring: 'pagar sementara dari kayu',
    expectedUnit: "m'",
  },
  {
    code: '1.1.1.2',
    expectedPrice: 635526,
    expectedNameSubstring: 'seng gelombang rangka kayu',
    expectedUnit: "m'",
  },
  {
    code: '1.1.1.3',
    expectedPrice: 378239,
    expectedNameSubstring: 'kawat duri',
    expectedUnit: "m'",
  },
  {
    code: '1.1.1.4',
    expectedPrice: 428906,
    expectedNameSubstring: 'rangka baja',
    expectedUnit: "m'",
  },
  {
    code: '1.1.1.5',
    expectedPrice: 17431,
    expectedNameSubstring: 'BRC Galvanis',
    expectedUnit: 'm2',
  },
];

console.log('============================================================');
console.log('CIPTA KARYA 2026 EXCEL ACCEPTANCE TESTS (PHASE 28)');
console.log('============================================================\n');

let failedCount = 0;

for (const tc of MANDATORY_TESTS) {
  console.log(`[TEST] Code ${tc.code}`);
  
  // 1. Verify in DHSP Map
  const dhspEntry = OFFICIAL_CK_2026_DHSP_MAP.get(tc.code);
  if (!dhspEntry) {
    console.error(`  [FAIL] ${tc.code} not found in OFFICIAL_CK_2026_DHSP_MAP`);
    failedCount++;
    continue;
  }
  if (dhspEntry.unitPrice !== tc.expectedPrice) {
    console.error(`  [FAIL] DHSP map price: expected ${tc.expectedPrice}, got ${dhspEntry.unitPrice}`);
    failedCount++;
    continue;
  }
  console.log(`  [PASS] DHSP map price: ${dhspEntry.unitPrice.toLocaleString('id-ID')} (Row ${dhspEntry.sourceRow})`);

  // 2. Verify in ALL_OFFICIAL_AHSP_ITEMS
  const canonicalItem = ALL_OFFICIAL_AHSP_ITEMS.find((it) => it.code === tc.code);
  if (!canonicalItem) {
    console.error(`  [FAIL] ${tc.code} not found in ALL_OFFICIAL_AHSP_ITEMS`);
    failedCount++;
    continue;
  }
  if (!canonicalItem.name.toLowerCase().includes(tc.expectedNameSubstring.toLowerCase())) {
    console.error(`  [FAIL] Name does not match: "${canonicalItem.name}" vs substring "${tc.expectedNameSubstring}"`);
    failedCount++;
    continue;
  }
  console.log(`  [PASS] Canonical master item: "${canonicalItem.name}"`);

  // 3. Verify in Price Resolver
  const composition = priceResolver2026.resolveAhspUnitPrice(canonicalItem);
  const resolvedHspPrice = composition.hspPrice ?? composition.unitPrice;

  if (resolvedHspPrice !== tc.expectedPrice) {
    console.error(`  [FAIL] Resolved HSP price: expected ${tc.expectedPrice}, got ${resolvedHspPrice}`);
    failedCount++;
    continue;
  }
  console.log(`  [PASS] Resolved HSP price: Rp ${resolvedHspPrice?.toLocaleString('id-ID')} (status: ${composition.pricingStatus})`);
  console.log(`  [PASS] Components resolved: ${composition.resolvedComponents}/${composition.totalComponents}`);
  console.log();
}

console.log('------------------------------------------------------------');
if (failedCount === 0) {
  console.log(`ALL ${MANDATORY_TESTS.length} CIPTA KARYA EXCEL ACCEPTANCE TESTS PASSED!`);
  console.log('============================================================');
  process.exit(0);
} else {
  console.error(`${failedCount} TESTS FAILED!`);
  console.log('============================================================');
  process.exit(1);
}
