import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';

const fullWithMaterial = ALL_OFFICIAL_AHSP_ITEMS.map(it => ({ it, res: priceResolver2026.resolveAhspUnitPrice(it) }))
  .filter(x => x.res.pricingStatus === 'FULL' && x.res.material.components.length > 0);

console.log('FULL with material count:', fullWithMaterial.length);
if (fullWithMaterial.length > 0) {
  const sample = fullWithMaterial[0];
  console.log('\n--- FULL AHSP WITH MATERIAL ---');
  console.log('Code:', sample.it.code);
  console.log('Name:', sample.it.name);
  console.log('Domain:', sample.it.domain);
  console.log('Unit:', sample.it.unit);
  console.log('Price:', sample.res.unitPrice);
  console.log('Labor components:', sample.res.labor.components);
  console.log('Material components:', sample.res.material.components);
  console.log('Equipment components:', sample.res.equipment.components);
}

const fullWithAll = ALL_OFFICIAL_AHSP_ITEMS.map(it => ({ it, res: priceResolver2026.resolveAhspUnitPrice(it) }))
  .filter(x => x.res.pricingStatus === 'FULL' && x.res.material.components.length > 0 && x.res.equipment.components.length > 0);

console.log('FULL with all 3 categories count:', fullWithAll.length);
if (fullWithAll.length > 0) {
  const sample = fullWithAll[0];
  console.log('\n--- FULL AHSP WITH ALL 3 CATEGORIES ---');
  console.log('Code:', sample.it.code);
  console.log('Name:', sample.it.name);
  console.log('Price:', sample.res.unitPrice);
}
