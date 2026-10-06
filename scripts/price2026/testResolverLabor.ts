import { PriceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { OFFICIAL_BM_2026_DHSP_MAP } from '../../src/data/nationalCostDatabase/officialBinaMargaDhsp2026';

const resolver = PriceResolver2026.getInstance();

console.log('--- Test L01 query ---');
const q1 = resolver.resolveResourcePrice({ resourceCode: 'L01', resourceType: 'labor', unit: 'jam' });
console.log('L01 unit=jam:', q1.status, q1.price, q1.unit, q1.source?.name);

const q2 = resolver.resolveResourcePrice({ resourceCode: 'L01', resourceType: 'labor', unit: 'OJ' });
console.log('L01 unit=OJ:', q2.status, q2.price, q2.unit, q2.source?.name);

console.log('\n--- Test 2.1.(1) composition ---');
const bmItem = OFFICIAL_BM_2026_DHSP_MAP.get('2.1.(1)');
console.log('BM 2.1.(1) from DHSP Map:', {
  code: bmItem?.code,
  unitPrice: bmItem?.unitPrice,
  directCost: bmItem?.directCost,
  overhead: bmItem?.overheadAmount,
  laborSubtotal: bmItem?.laborSubtotal,
  equipmentSubtotal: bmItem?.equipmentSubtotal,
});

const comp = resolver.resolveAhspUnitPrice({
  code: '2.1.(1)',
  name: 'Galian untuk Selokan Drainase dan Saluran Air',
  unit: 'm3',
  laborComponents: bmItem?.laborComponents,
  equipmentComponents: bmItem?.equipmentComponents,
});

console.log('\nResolver resolveAhspUnitPrice output:');
console.log('hspPrice:', comp.hspPrice);
console.log('unitPrice (Direct Cost):', comp.unitPrice);
console.log('pricingStatus:', comp.pricingStatus);
console.log('Labor components in comp:');
comp.labor.components.forEach(c => {
  console.log(`  ${c.itemCode} ${c.itemName} @ ${c.coefficient} ${c.unit} x ${c.unitPrice} = ${c.subtotalPerUnit} (source: ${c.sourceName})`);
});
console.log('Equipment components in comp:');
comp.equipment.components.forEach(c => {
  console.log(`  ${c.itemCode} ${c.itemName} @ ${c.coefficient} ${c.unit} x ${c.unitPrice} = ${c.subtotalPerUnit} (source: ${c.sourceName})`);
});
