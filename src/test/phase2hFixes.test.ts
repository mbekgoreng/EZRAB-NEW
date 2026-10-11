/**
 * Phase 2H fix verification: P0-1, P1-1, P1-2, P1-3, P2-5.
 * Run: npx tsx src/test/phase2hFixes.test.ts
 */
import { ahspMatcher } from '../ded-rab-v2/ahsp/ahspMatcher';
import { mapRabRows } from '../document-engine/integrations/rabIntegration';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail: string) => {
  if (cond) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label} — ${detail}`); }
};

console.log('P0-1: Pengecatan tidak boleh dibajak branch Dinding');
{
  const m = ahspMatcher.matchWorkItem({ id: 'x', name: 'Pengecatan dinding', unit: 'm2', category: 'PAINTING' } as any);
  check('bukan 3.6.1.8 (pasangan bata)', m.code !== '3.6.1.8', `dapat ${m.code}`);
  check('adalah item cat (3.8.x) atau NOT_FOUND/AMBIGUOUS',
    m.code.startsWith('3.8.') || m.matchType === 'NOT_FOUND' || m.matchType === 'AMBIGUOUS',
    `dapat ${m.code} ${m.matchType}`);
}

console.log('P1-1: Beton kolom cor-setempat bukan pracetak');
{
  const m = ahspMatcher.matchWorkItem({ id: 'x', name: 'Beton kolom K-250', unit: 'm3', category: 'STRUCTURE_COLUMN' } as any);
  check('bukan 2.4.3.3 (pracetak)', m.code !== '2.4.3.3', `dapat ${m.code}`);
}

console.log('P1-2: Cat kayu/besi harus sadar substrat');
{
  const m = ahspMatcher.matchWorkItem({ id: 'x', name: 'Cat kayu dan besi', unit: 'm2', category: 'PAINTING' } as any);
  check('substrat kayu/besi (bukan cat tembok 3.8.10.1)', m.code !== '3.8.10.1', `dapat ${m.code}`);
}

console.log('P2-5: Pengecatan tembok (sah) tidak diblokir gate');
{
  const m = ahspMatcher.matchWorkItem({ id: 'x', name: 'Pengecatan tembok', unit: 'm2', category: 'PAINTING' } as any);
  check('match ke item cat 3.8.x', m.code.startsWith('3.8.'), `dapat ${m.code} ${m.matchType}`);
}

console.log('P1-3: rabIntegration mempertahankan null');
{
  const rows = mapRabRows([{ code: 'B', description: 'Item null', unit: 'm3', volume: 5, unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' }] as any);
  check('unitPrice tetap null (bukan 0)', rows[0].unitPrice === null, `dapat ${rows[0].unitPrice}`);
  check('amount tetap null (bukan 0)', rows[0].amount === null, `dapat ${rows[0].amount}`);
  check('priceStatus dipertahankan', (rows[0] as any).priceStatus === 'PRICE_UNRESOLVED', `dapat ${(rows[0] as any).priceStatus}`);
}

console.log('Regresi: negative fixtures tetap NOT_FOUND');
{
  for (const n of ['Pekerjaan Tidak Dikenal XYZ', 'Jasa konsultasi manajemen proyek']) {
    const m = ahspMatcher.matchWorkItem({ id: 'x', name: n, unit: 'm3', category: 'SITEWORK' } as any);
    check(`"${n.slice(0, 20)}..." NOT_FOUND`, m.matchType === 'NOT_FOUND', `dapat ${m.code} ${m.matchType}`);
  }
}

console.log(`\nTOTAL: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
