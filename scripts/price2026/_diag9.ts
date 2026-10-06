/* TEMP VERIFICATION — is the FULL count real? */
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { looseCode, normalizeUnitForType } from './core';
import * as fs from 'fs';
import * as path from 'path';

const master = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/price2026/validated/price_master.json'), 'utf8'));
const pricedByLoose = new Set<string>(master.records.map((r: any) => `${looseCode(r.resourceCode)}|${r.unit}`));
const keyCount = new Map<string, number>();
for (const r of master.records as any[]) {
  const k = `${looseCode(r.resourceCode)}|${r.unit}`;
  keyCount.set(k, (keyCount.get(k) || 0) + 1);
}
console.log('distinct priced keys:', keyCount.size);
console.log('--- priced keys (by record count) ---');
for (const [k, c] of [...keyCount.entries()].sort((a, b) => b[1] - a[1])) {
  const sample = master.records.find((r: any) => `${looseCode(r.resourceCode)}|${r.unit}` === k);
  console.log(`  ${k.padEnd(14)} records=${String(c).padStart(5)}  name="${sample.resourceName}"  method=${sample.matchMethod}  status=${sample.verificationStatus}`);
}

// Verify FULL items
function compsOf(it: any) {
  const out: any[] = [];
  for (const [type, list] of [
    ['labor', it.laborComponents || []],
    ['material', it.materialComponents || []],
    ['equipment', it.equipmentComponents || []],
  ] as const) {
    for (const c of list as any[]) {
      if (!c.code) continue;
      out.push({ code: c.code, unit: normalizeUnitForType(String(c.unit || ''), type), type, name: c.name });
    }
  }
  return out;
}

let full = 0, partial = 0, missing = 0, noComp = 0;
const fullSamples: any[] = [];
for (const it of AHSP_2026_CANONICAL as any[]) {
  const comps = compsOf(it);
  if (comps.length === 0) { noComp++; continue; }
  const ok = comps.filter((c) => pricedByLoose.has(`${looseCode(c.code)}|${c.unit}`));
  if (ok.length === 0) missing++;
  else if (ok.length === comps.length) { full++; if (fullSamples.length < 4) fullSamples.push({ it, comps }); }
  else partial++;
}
console.log('\nRECOMPUTED: FULL', full, 'PARTIAL', partial, 'MISSING', missing, 'NO-COMP', noComp, 'TOTAL', full + partial + missing + noComp);

for (const s of fullSamples) {
  console.log(`\n--- FULL sample: ${s.it.code} "${s.it.name}" ---`);
  for (const c of s.comps) {
    const k = `${looseCode(c.code)}|${c.unit}`;
    console.log(`   ${c.type.padEnd(9)} ${String(c.code).padEnd(8)} ${c.unit.padEnd(5)} priced=${pricedByLoose.has(k)}  "${String(c.name).slice(0, 60)}"`);
  }
}
