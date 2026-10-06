import { AHSP_2026_CANONICAL_RESOURCES } from '../../src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated';
import { classifyResource, looseCode, normalizeCode, normalizeUnitForType, nameSimilarity, normalizeName } from './core';

const res = (AHSP_2026_CANONICAL_RESOURCES as any[]).map((r, i) => ({ ...classifyResource(r), index: i }));
const priceable = res.filter((r) => r.quality !== 'DEFECTIVE' && r.classification !== 'UNKNOWN');

const l01 = res.filter((r) => looseCode(r.code) === 'L01');
console.log('canonical rows with loose code L01:', l01.length);
for (const r of l01) {
  console.log('  ', r.resourceId, '| code=' + r.code, '| unit=' + r.unit, '| quality=' + r.quality, '| name="' + r.name + '"', '| issues=' + r.issues.join(','));
}
const l01p = priceable.filter((r) => looseCode(r.code) === 'L01');
console.log('priceable L01:', l01p.length, '-> units:', [...new Set(l01p.map((r) => r.unit))]);

const groups = new Map<string, any[]>();
for (const r of priceable) {
  const k = looseCode(r.code) + '|' + r.unit;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k)!.push(r);
}
for (const k of ['L01|OJ', 'L01|OH', 'L03|OJ', 'L02|OJ']) {
  const g = groups.get(k);
  console.log(k, '->', g ? g.length + ' rows, names=' + JSON.stringify(g.map((x) => x.name)) : 'MISSING');
}

const srcName = 'Pekerja / Buruh Konstruksi (General Worker)';
const canonName = '1. Pekerja';
console.log('nameSimilarity =', nameSimilarity(srcName, canonName).toFixed(3));
console.log('normalizeName(src) =', normalizeName(srcName));
console.log('normalizeName(canon) =', normalizeName(canonName));
console.log('normalizeCode(L.01) =', normalizeCode('L.01'));
console.log('normalizeUnitForType(OJ,labor) =', normalizeUnitForType('OJ', 'labor'));
