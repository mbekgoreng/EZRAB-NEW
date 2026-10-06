/* TEMP — trace the "agregat kasar" match decision */
import { readAllSourceRows } from './normalizePrices';
import { looseCode, normalizeUnitForType, normalizeName, nameTokens, nameBindingScore, nameSimilarity } from './core';
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { PRICE_SOURCES } from './sources.config';

const SOURCE = new Map(PRICE_SOURCES.map((s) => [s.key, s]));
const rows = readAllSourceRows().filter((r) => SOURCE.get(r.sourceKey)?.active);
const hits = rows.filter((r) => /agregat/i.test(r.resourceName));
console.log('source rows containing "agregat":', hits.length);
for (const r of hits.slice(0, 30)) {
  console.log(`  ${r.sourceKey.padEnd(20)} code=${String(r.resourceCode).padEnd(10)} unit=${r.unit.padEnd(5)} type=${r.resourceType.padEnd(8)} "${r.resourceName}"`);
}

// component keys with unit m3
const keys = new Map<string, { code: string; unit: string; names: Map<string, number>; type: string }>();
for (const it of AHSP_2026_CANONICAL as any[]) {
  for (const [type, comps] of [
    ['labor', it.laborComponents || []],
    ['material', it.materialComponents || []],
    ['equipment', it.equipmentComponents || []],
  ] as const) {
    for (const c of comps as any[]) {
      if (!c.code) continue;
      const unit = normalizeUnitForType(String(c.unit || ''), type);
      const key = `${looseCode(c.code)}|${unit}`;
      let e = keys.get(key);
      if (!e) { e = { code: String(c.code), unit, names: new Map(), type }; keys.set(key, e); }
      const n = String(c.name || '').replace(/\s*-\s*$/, '').trim();
      if (n) e.names.set(n, (e.names.get(n) || 0) + 1);
    }
  }
}

const probe = 'Agregat kasar';
console.log(`\n--- candidates for "${probe}" (unit m3, type material) ---`);
const scored: any[] = [];
for (const [key, e] of keys) {
  if (e.unit !== 'm3' || e.type !== 'material') continue;
  // choose best label
  let best = ''; let bestC = -1;
  for (const [n, c] of e.names) if (c > bestC) { best = n; bestC = c; }
  const jac = nameBindingScore(probe, best);
  const sim = nameSimilarity(probe, best);
  if (jac > 0 || sim > 0) scored.push({ key, best, count: [...e.names.values()].reduce((a, b) => a + b, 0), jac, sim });
}
scored.sort((a, b) => b.jac - a.jac);
for (const s of scored.slice(0, 12)) {
  console.log(`  ${s.key.padEnd(12)} count=${String(s.count).padStart(4)} jaccard=${s.jac.toFixed(2)} sim=${s.sim.toFixed(2)}  "${s.best}"`);
}
