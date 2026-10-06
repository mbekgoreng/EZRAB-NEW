import { AHSP_2026_CANONICAL_RESOURCES } from '../../src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated';
import { EquipmentDatabaseService } from '../../src/domain/equipment/equipmentDatabaseService';
import { LaborDatabaseService } from '../../src/domain/labor/laborDatabaseService';

const res = AHSP_2026_CANONICAL_RESOURCES as any[];
const eq = EquipmentDatabaseService.getInstance().getAllEquipment() as any[];
const lab = LaborDatabaseService.getInstance().getAllLabor() as any[];

console.log('=== EQUIPMENT: same code -> same machine? ===');
for (const code of ['E.01', 'E.02', 'E.05', 'E.08', 'E.11', 'E.12', 'E.15', 'E.19', 'E.23', 'E.35']) {
  const c = res.find((r) => r.type === 'equipment' && r.code === code);
  const s = eq.find((e) => e.code === code);
  console.log(code.padEnd(6), 'canon="' + (c ? String(c.name || '').slice(0, 45) : '-') + '"');
  console.log('       src  ="' + (s ? String(s.name || '').slice(0, 45) : '-') + '"');
}

console.log('\n=== LABOR: same code -> same role? ===');
for (const code of ['L.01', 'L.02', 'L.03', 'L.04']) {
  const c = res.find((r) => r.type === 'labor' && r.code === code);
  const s = lab.find((l) => l.code === code);
  console.log(code.padEnd(6), 'canon="' + (c ? String(c.name || '').slice(0, 45) : '-') + '" unit=' + (c ? c.unit : '-'));
  console.log('       src  ="' + (s ? String(s.name || '').slice(0, 45) : '-') + '" unit=' + (s ? s.unit : '-'));
}

console.log('\n=== canonical labor sample (first 25) ===');
for (const r of res.filter((x) => x.type === 'labor').slice(0, 25)) {
  console.log('  ' + String(r.code || '(none)').padEnd(9) + ' | ' + String(r.unit || '').padEnd(5) + ' | ' + String(r.name || '').slice(0, 45));
}

console.log('\n=== canonical material sample (first 20) ===');
for (const r of res.filter((x) => x.type === 'material').slice(0, 20)) {
  console.log('  ' + String(r.code || '(none)').padEnd(9) + ' | ' + String(r.unit || '').padEnd(5) + ' | ' + String(r.name || '').slice(0, 45));
}
