import { BINA_MARGA_AHSP_2026_DATASET as R } from '../src/data/nationalCostDatabase/binaMargaAHSPDataset';
const kinds = ['laborComponents', 'materialComponents', 'equipmentComponents'] as const;
for (const k of kinds) {
  const freq = new Map<number, number>();
  const coef = new Map<number, number>();
  let n = 0;
  for (const r of R as any[]) for (const c of r[k] || []) {
    n++;
    freq.set(c.unitPrice, (freq.get(c.unitPrice) || 0) + 1);
    coef.set(c.coefficient, (coef.get(c.coefficient) || 0) + 1);
  }
  const s = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const cs = [...coef.entries()].sort((a, b) => b[1] - a[1]);
  console.log('=== ' + k + ' ===');
  console.log('  baris              :', n);
  console.log('  harga DISTINCT     :', freq.size, '| top:', s.slice(0, 5).map(([p, c]) => p + 'x' + c).join(', '));
  console.log('  koefisien DISTINCT :', coef.size, '| top:', cs.slice(0, 5).map(([p, c]) => p + 'x' + c).join(', '));
  console.log('');
}
// how many distinct (coef,price) pairs overall vs official
const official = JSON.parse(require('fs').readFileSync('docs/_audit/lampiran2-official-items.json', 'utf8')).items as any[];
const offCoef = new Set<number>();
for (const i of official) for (const c of i.components) offCoef.add(c.coefficient);
const repoCoef = new Set<number>();
for (const r of R as any[]) for (const k of kinds) for (const c of r[k] || []) repoCoef.add(c.coefficient);
let overlap = 0;
for (const c of repoCoef) if (offCoef.has(c)) overlap++;
console.log('koefisien resmi distinct :', offCoef.size);
console.log('koefisien repo distinct  :', repoCoef.size);
console.log('koefisien repo yg ada di dokumen resmi:', overlap);
