/* TEMP DIAGNOSTIC — dump component keys + source row samples */
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { looseCode, normalizeUnitForType, normalizeUnit, normalizeName } from './core';
import { readAllSourceRows } from './normalizePrices';

// component keys
const map = new Map<string, { key: string; code: string; unit: string; names: Map<string, number>; type: string }>();
for (const it of AHSP_2026_CANONICAL as any[]) {
  for (const [type, comps] of [
    ['labor', it.laborComponents || []],
    ['material', it.materialComponents || []],
    ['equipment', it.equipmentComponents || []],
  ] as const) {
    for (const c of comps as any[]) {
      const code = String(c.code || '').trim();
      if (!code) continue;
      const unit = normalizeUnitForType(String(c.unit || ''), type);
      const key = `${looseCode(code)}|${unit}`;
      let e = map.get(key);
      if (!e) { e = { key, code, unit, names: new Map(), type }; map.set(key, e); }
      const n = String(c.name || '').replace(/\s*-\s*$/, '').trim();
      if (n) e.names.set(n, (e.names.get(n) || 0) + 1);
    }
  }
}
const keys = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
console.log('TOTAL component keys:', keys.length);
const labor = keys.filter((k) => k.type === 'labor');
console.log('\n--- LABOR component keys (' + labor.length + ') ---');
for (const k of labor.slice(0, 80)) {
  const names = [...k.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}(${c})`).join(' | ');
  console.log(`  ${k.key.padEnd(12)} code=${k.code.padEnd(8)} names: ${names}`);
}

const rows = readAllSourceRows();
console.log('\n--- LABOR_2026 rows (' + rows.filter(r=>r.sourceKey==='LABOR_2026').length + ') ---');
for (const r of rows.filter((r) => r.sourceKey === 'LABOR_2026').slice(0, 12)) {
  console.log(`  code=${String(r.resourceCode).padEnd(8)} unit=${r.unit.padEnd(4)} name="${r.resourceName}" price=${r.price}`);
}

console.log('\n--- HSD_2026 samples ---');
for (const r of rows.filter((r) => r.sourceKey === 'HSD_2026').slice(0, 20)) {
  console.log(`  code=${String(r.resourceCode).padEnd(10)} unit=${r.unit.padEnd(5)} type=${r.resourceType.padEnd(9)} name="${r.resourceName}" price=${r.price}`);
}

console.log('\n--- EQUIPMENT_2026 samples ---');
for (const r of rows.filter((r) => r.sourceKey === 'EQUIPMENT_2026').slice(0, 20)) {
  console.log(`  code=${String(r.resourceCode).padEnd(10)} unit=${r.unit.padEnd(5)} name="${r.resourceName}" price=${r.price}`);
}

console.log('\n--- MATERIAL_MASTER_2026 samples ---');
for (const r of rows.filter((r) => r.sourceKey === 'MATERIAL_MASTER_2026').slice(0, 25)) {
  console.log(`  code=${String(r.resourceCode).padEnd(22)} unit=${r.unit.padEnd(5)} name="${r.resourceName}" price=${r.price}`);
}
