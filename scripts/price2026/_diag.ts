/**
 * PHASE 1 DIAGNOSTIC — root-cause probe for Rp0 in EZRAB.
 * Read-only. Measures price coverage of the 5801 canonical AHSP items.
 */
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { AHSP_2026_CANONICAL_RESOURCES } from '../../src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated';
import { OFFICIAL_HSD_2026_ITEMS } from '../../src/data/nationalCostDatabase/officialHSD2026';
import { MASTER_PRICE_ITEMS } from '../../src/data/indonesianPrices';
import { MASTER_AHSP_DATABASE } from '../../src/data/indonesianAHSP';
import { PriceRepository } from '../../src/engine/pricing/repository/priceRepository';
import { PriceNormalizationEngine } from '../../src/engine/pricing/normalization/priceNormalization';

const items = AHSP_2026_CANONICAL as any[];
const resources = AHSP_2026_CANONICAL_RESOURCES as any[];
const repo = PriceRepository.getInstance();

console.log('=== SOURCE SIZES ===');
console.log('OFFICIAL_HSD_2026_ITEMS :', OFFICIAL_HSD_2026_ITEMS.length);
console.log('MASTER_PRICE_ITEMS      :', MASTER_PRICE_ITEMS.length);
console.log('MASTER_AHSP_DATABASE    :', MASTER_AHSP_DATABASE.length);
console.log('canonical AHSP items    :', items.length);
console.log('canonical resources     :', resources.length);
console.log('PriceRepository total   :', repo.count());

console.log('\n=== RESOURCE CODE SHAPE (canonical) ===');
const sample = resources.slice(0, 12);
for (const r of sample) console.log(' ', r.type, '|', r.code, '|', r.unit, '|', (r.name || '').slice(0, 40));

console.log('\n=== RESOURCE CODE PREFIX HISTOGRAM ===');
const prefix = new Map<string, number>();
for (const r of resources) {
  const p = String(r.code || '').split(/[.\-_\s]/)[0] || '(none)';
  prefix.set(p, (prefix.get(p) || 0) + 1);
}
const top = [...prefix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log(top.map(([k, v]) => `${k}=${v}`).join('  '));

console.log('\n=== COMPONENT CODE RESOLUTION (canonical) ===');
let total = 0, byCode = 0, byCodeUnit = 0;
const unresolvedSample: string[] = [];
const codeCount = new Map<string, { n: number; unit: string; name: string; type: string }>();
for (const it of items) {
  for (const [type, comps] of [
    ['labor', it.laborComponents || []],
    ['material', it.materialComponents || []],
    ['equipment', it.equipmentComponents || []],
  ] as const) {
    for (const c of comps as any[]) {
      total++;
      const code = c.code || '';
      const unit = c.unit || '';
      if (!code) continue;
      const key = `${code}|${unit}`;
      if (!codeCount.has(key)) codeCount.set(key, { n: 0, unit, name: c.name || '', type });
      codeCount.get(key)!.n++;
      const hit = repo.getByCode(PriceNormalizationEngine.normalizeCode(code));
      if (hit) {
        byCode++;
        if (PriceNormalizationEngine.normalizeUnit(hit.unit) === PriceNormalizationEngine.normalizeUnit(unit)) byCodeUnit++;
        else if (unresolvedSample.length < 15) unresolvedSample.push(`UNIT-DIFF ${type} ${code} want=${unit} got=${hit.unit}`);
      } else if (unresolvedSample.length < 15) {
        unresolvedSample.push(`NO-PRICE ${type} ${code} (${c.name}) unit=${unit}`);
      }
    }
  }
}
console.log('component rows          :', total);
console.log('distinct code|unit keys :', codeCount.size);
console.log('resolved by code        :', byCode, `(${((byCode / total) * 100).toFixed(1)}%)`);
console.log('resolved by code+unit   :', byCodeUnit, `(${((byCodeUnit / total) * 100).toFixed(1)}%)`);
console.log('sample unresolved:');
for (const s of unresolvedSample) console.log('   ', s);

console.log('\n=== TOP UNRESOLVED CODES (by frequency) ===');
const unresolvedFreq: { key: string; n: number; unit: string; name: string; type: string }[] = [];
for (const [key, v] of codeCount) {
  const [code, unit] = key.split('|');
  const hit = repo.getByCode(PriceNormalizationEngine.normalizeCode(code));
  if (!hit) unresolvedFreq.push({ key, n: v.n, unit, name: v.name, type: v.type });
}
unresolvedFreq.sort((a, b) => b.n - a.n);
for (const u of unresolvedFreq.slice(0, 25)) console.log(`  ${u.n.toString().padStart(5)}  ${u.type.padEnd(9)} ${u.key}  ${u.name.slice(0, 35)}`);

console.log('\n=== AHSP ITEM PRICING STATUS ===');
let full = 0, partial = 0, missing = 0, noComp = 0;
for (const it of items) {
  const comps = [...(it.laborComponents || []), ...(it.materialComponents || []), ...(it.equipmentComponents || [])];
  if (comps.length === 0) { noComp++; continue; }
  let resolved = 0;
  for (const c of comps) {
    if (!c.code) continue;
    if (repo.getByCode(PriceNormalizationEngine.normalizeCode(c.code))) resolved++;
  }
  if (resolved === 0) missing++;
  else if (resolved === comps.length) full++;
  else partial++;
}
console.log(`FULL    : ${full}`);
console.log(`PARTIAL : ${partial}`);
console.log(`MISSING : ${missing}`);
console.log(`NO-COMP : ${noComp}`);
