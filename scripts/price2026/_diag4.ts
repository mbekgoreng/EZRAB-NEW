import { MASTER_AHSP_DATABASE } from '../../src/data/indonesianAHSP';
import { EquipmentDatabaseService } from '../../src/domain/equipment/equipmentDatabaseService';
import { OFFICIAL_HSD_2026_ITEMS } from '../../src/data/nationalCostDatabase/officialHSD2026';

console.log('=== MASTER_AHSP_DATABASE component codes (legacy 2022) ===');
const seen = new Map<string, any>();
for (const a of MASTER_AHSP_DATABASE as any[]) {
  for (const [t, comps] of [['L', a.laborComponents||[]],['M', a.materialComponents||[]],['E', a.equipmentComponents||[]]] as const) {
    for (const c of comps as any[]) {
      if (!c.code) continue;
      if (!seen.has(c.code)) seen.set(c.code, { t, code: c.code, name: c.name, unit: c.unit, price: c.unitPrice });
    }
  }
}
console.log('distinct legacy component codes:', seen.size);
for (const v of [...seen.values()].slice(0, 25)) console.log('  ', v.t, '|', String(v.code).padEnd(10), '|', String(v.unit).padEnd(6), '|', v.price, '|', String(v.name).slice(0,35));

console.log('\n=== EquipmentDatabaseService codes ===');
const eq = EquipmentDatabaseService.getInstance().getAllEquipment() as any[];
console.log(eq.map(e => e.code).join(', '));

console.log('\n=== HSD codes by category ===');
const hsd = OFFICIAL_HSD_2026_ITEMS as any[];
for (const cat of ['MATERIAL','LABOR','EQUIPMENT']) {
  const rows = hsd.filter(h => h.category === cat);
  console.log(cat, rows.length, '->', rows.slice(0,8).map(r=>`${r.code}(${r.unit})`).join(' '));
}
