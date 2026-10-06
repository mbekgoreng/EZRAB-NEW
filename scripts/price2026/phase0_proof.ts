import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';

console.log('Total AHSP items:', ALL_OFFICIAL_AHSP_ITEMS.length);
console.log('Resolver record count:', priceResolver2026.recordCount);

let fullCount = 0;
let partialCount = 0;
let missingCount = 0;
const samplesFull: Array<{ item: any; res: any }> = [];
const samplesPartial: Array<{ item: any; res: any }> = [];
const samplesMissing: Array<{ item: any; res: any }> = [];

for (const item of ALL_OFFICIAL_AHSP_ITEMS) {
  const res = priceResolver2026.resolveAhspUnitPrice(item);
  if (res.pricingStatus === 'FULL') {
    fullCount++;
    if (samplesFull.length < 3) samplesFull.push({ item, res });
  } else if (res.pricingStatus === 'PARTIAL') {
    partialCount++;
    if (samplesPartial.length < 3) samplesPartial.push({ item, res });
  } else {
    missingCount++;
    if (samplesMissing.length < 3) samplesMissing.push({ item, res });
  }
}

console.log('Summary:', { fullCount, partialCount, missingCount });

if (samplesFull.length > 0) {
  const { item, res } = samplesFull[0];
  console.log('\n========================================');
  console.log('PHASE 0 PROOF: SAMPLE FULL AHSP');
  console.log('========================================');
  console.log('AHSP Code:', item.code);
  console.log('AHSP Description:', item.name);
  console.log('Unit:', item.unit);
  console.log('Resolved Status:', res.pricingStatus);
  console.log('Resolved Unit Price:', res.unitPrice);
  console.log('\nLABOR COMPONENTS:');
  for (const c of res.labor.components) {
    console.log(`  - ${c.itemCode} | ${c.itemName} | ${c.coefficient} ${c.unit} @ Rp${c.unitPrice?.toLocaleString('id-ID')} = Rp${c.subtotalPerUnit?.toLocaleString('id-ID')}`);
  }
  console.log('\nMATERIAL COMPONENTS:');
  for (const c of res.material.components) {
    console.log(`  - ${c.itemCode} | ${c.itemName} | ${c.coefficient} ${c.unit} @ Rp${c.unitPrice?.toLocaleString('id-ID')} = Rp${c.subtotalPerUnit?.toLocaleString('id-ID')}`);
  }
  console.log('\nEQUIPMENT COMPONENTS:');
  for (const c of res.equipment.components) {
    console.log(`  - ${c.itemCode} | ${c.itemName} | ${c.coefficient} ${c.unit} @ Rp${c.unitPrice?.toLocaleString('id-ID')} = Rp${c.subtotalPerUnit?.toLocaleString('id-ID')}`);
  }
}
