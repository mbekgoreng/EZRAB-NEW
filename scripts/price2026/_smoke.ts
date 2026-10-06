/* TEMP smoke test of the runtime resolver */
import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';

console.log('records:', priceResolver2026.recordCount);

for (const [code, unit] of [
  ['L.01', 'OJ'],
  ['L.01', 'OH'],
  ['L.04', 'OH'],
  ['M03', 'm3'],
  ['E10', 'jam'],
  ['M99.999', 'kg'],
] as const) {
  const r = priceResolver2026.resolveResourcePrice({ resourceCode: code, unit, resourceType: 'unknown' });
  console.log(`\n${code} @ ${unit} -> status=${r.status} price=${r.price} unit=${r.unit} source=${r.source?.name ?? '-'} method=${r.matchMethod}`);
  console.log('   ', r.explanation);
}

// pick a FULL item and a PARTIAL item
let fullItem: any = null, partialItem: any = null, missingItem: any = null;
for (const it of AHSP_2026_CANONICAL as any[]) {
  const comp = priceResolver2026.resolveAhspUnitPrice(it);
  if (comp.pricingStatus === 'FULL' && !fullItem) fullItem = { it, comp };
  if (comp.pricingStatus === 'PARTIAL' && !partialItem) partialItem = { it, comp };
  if (comp.pricingStatus === 'MISSING' && !missingItem) missingItem = { it, comp };
  if (fullItem && partialItem && missingItem) break;
}

for (const s of [fullItem, partialItem, missingItem]) {
  if (!s) continue;
  console.log(`\n=== ${s.comp.pricingStatus}  ${s.it.code} "${String(s.it.name).slice(0, 60)}" unitPrice=${s.comp.unitPrice} resolved=${s.comp.resolvedComponents}/${s.comp.totalComponents}`);
  for (const c of s.comp.labor.components) console.log(`   labor  ${c.itemCode.padEnd(8)} ${String(c.unit).padEnd(5)} coef=${c.coefficient} price=${c.unitPrice} sub=${c.subtotalPerUnit} ${c.resolved ? '' : 'MISSING'}`);
  for (const c of s.comp.material.components.slice(0, 4)) console.log(`   mat    ${c.itemCode.padEnd(8)} ${String(c.unit).padEnd(5)} coef=${c.coefficient} price=${c.unitPrice} sub=${c.subtotalPerUnit} ${c.resolved ? '' : 'MISSING'}`);
  for (const c of s.comp.equipment.components.slice(0, 3)) console.log(`   equip  ${c.itemCode.padEnd(8)} ${String(c.unit).padEnd(5)} coef=${c.coefficient} price=${c.unitPrice} sub=${c.subtotalPerUnit} ${c.resolved ? '' : 'MISSING'}`);
}
