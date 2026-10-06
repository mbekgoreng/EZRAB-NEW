import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import { formatCurrencyIDR } from '../../src/calculations/decimalEngine';

console.log('============================================================');
console.log('RAB INTEGRATION SIMULATION (PHASE 30)');
console.log('============================================================\n');

const item1 = ALL_OFFICIAL_AHSP_ITEMS.find((x) => x.code === '1.1.1.1')!;
const comp1 = priceResolver2026.resolveAhspUnitPrice(item1);
const hsp1 = comp1.hspPrice ?? comp1.unitPrice;

console.log('Item Code       :', item1.code);
console.log('Item Name       :', item1.name);
console.log('Unit            :', item1.unit);
console.log('HSP Unit Price  :', formatCurrencyIDR(hsp1));
console.log('Pricing Status  :', comp1.pricingStatus);
console.log('Components Res  :', `${comp1.resolvedComponents}/${comp1.totalComponents}`);

const volume = 10;
const subtotal = (hsp1 || 0) * volume;

console.log('\n--- + RAB Modal Addition Simulation ---');
console.log('Input Volume    :', volume, item1.unit);
console.log('Calculated Subtotal:', formatCurrencyIDR(subtotal));

if (subtotal === 7873970) {
  console.log('\n[PASS] Subtotal matches expected Rp 7.873.970 exactly (787.397 × 10)!');
  console.log('[PASS] Value is strictly positive and non-zero.');
  process.exit(0);
} else {
  console.error(`\n[FAIL] Expected 7873970, got ${subtotal}`);
  process.exit(1);
}
