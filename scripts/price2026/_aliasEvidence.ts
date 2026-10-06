/**
 * Evidence gatherer for the PHASE 13 alias table.
 * Prints the highest-frequency canonical AHSP component keys that currently have NO
 * price, next to the best price-source candidates, so aliases can be authored from
 * evidence instead of guesswork.
 */
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { AHSP_2026_CANONICAL_RESOURCES } from '../../src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated';
import { readAllSourceRows } from './normalizePrices';
import { PRICE_SOURCES } from './sources.config';
import { looseCode, normalizeUnit, normalizeName, nameSimilarity } from './core';

const SOURCE = new Map(PRICE_SOURCES.map((s) => [s.key, s]));
const rows = readAllSourceRows().filter((r) => SOURCE.get(r.sourceKey)?.active);
const resources = AHSP_2026_CANONICAL_RESOURCES as any[];

// ---- distinct component keys ------------------------------------------------
interface Key {
  type: string;
  code: string;
  unit: string;
  name: string;
  count: number;
}
const keys = new Map<string, Key>();
for (const it of AHSP_2026_CANONICAL as any[]) {
  for (const [type, comps] of [
    ['labor', it.laborComponents || []],
    ['material', it.materialComponents || []],
    ['equipment', it.equipmentComponents || []],
  ] as const) {
    for (const c of comps as any[]) {
      const code = String(c.code || '');
      if (!code) continue;
      const unit = normalizeUnit(String(c.unit || ''));
      const k = `${looseCode(code)}|${unit}`;
      const name = String(c.name || '').replace(/\s*-\s*$/, '').trim();
      const prev = keys.get(k);
      if (prev) {
        prev.count++;
        if (name.length > prev.name.length && name.length < 80) prev.name = name;
      } else {
        keys.set(k, { type, code, unit, name, count: 1 });
      }
    }
  }
}

const all = [...keys.values()].sort((a, b) => b.count - a.count);

// ---- index price rows -------------------------------------------------------
const byLoose = new Map<string, any[]>();
const byNameUnit = new Map<string, any[]>();
for (const r of rows) {
  const lc = looseCode(r.resourceCode);
  if (lc) {
    if (!byLoose.has(lc)) byLoose.set(lc, []);
    byLoose.get(lc)!.push(r);
  }
  const nu = normalizeName(r.resourceName) + '|' + r.unit;
  if (normalizeName(r.resourceName)) {
    if (!byNameUnit.has(nu)) byNameUnit.set(nu, []);
    byNameUnit.get(nu)!.push(r);
  }
}

function bestCandidates(k: Key, limit = 3) {
  const out: { row: any; sim: number; how: string }[] = [];

  // exact loose code + unit
  for (const r of byLoose.get(looseCode(k.code)) || []) {
    if (r.unit === k.unit) out.push({ row: r, sim: 1, how: 'LOOSE_CODE+UNIT' });
  }
  // name similarity across all price rows with the same unit
  if (k.name) {
    const candidates = rows.filter((r) => r.unit === k.unit);
    const scored = candidates
      .map((r) => ({ row: r, sim: nameSimilarity(k.name, r.resourceName), how: 'NAME' }))
      .filter((x) => x.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
    out.push(...scored);
  }
  // dedupe by row id
  const seen = new Set<string>();
  const dedup: typeof out = [];
  for (const o of out) {
    if (seen.has(o.row.id)) continue;
    seen.add(o.row.id);
    dedup.push(o);
  }
  return dedup.sort((a, b) => b.sim - a.sim).slice(0, limit);
}

const mode = process.argv[2] || 'unmatched';
const limit = parseInt(process.argv[3] || '60', 10);

console.log(`=== COMPONENT KEYS (${all.length} distinct) — mode=${mode} ===\n`);
let printed = 0;
for (const k of all) {
  const cands = bestCandidates(k);
  const hasExact = cands.some((c) => c.sim >= 0.99);
  const hasName = cands.some((c) => c.sim >= 0.6);
  const flag = hasExact ? 'CODE' : hasName ? 'NAME' : 'NONE';
  if (mode === 'unmatched' && flag !== 'NONE') continue;
  if (mode === 'nameonly' && flag !== 'NAME') continue;
  if (mode === 'codeonly' && flag !== 'CODE') continue;

  console.log(`${String(k.count).padStart(5)}  ${k.type.padEnd(9)} ${(k.code + '|' + k.unit).padEnd(14)} "${k.name.slice(0, 42)}"  [${flag}]`);
  for (const c of cands) {
    console.log(`          -> ${c.how.padEnd(14)} sim=${c.sim.toFixed(2)}  ${c.row.sourceKey}  ${c.row.resourceCode.padEnd(18)} ${c.row.unit.padEnd(6)} Rp${c.row.price}  "${String(c.row.resourceName).slice(0, 40)}"`);
  }
  if (++printed >= limit) break;
}
console.log(`\nprinted ${printed}`);
