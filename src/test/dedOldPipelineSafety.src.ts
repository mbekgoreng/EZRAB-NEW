/**
 * EZRAB DED-FIX TASK 6 — Old pipeline regression (actual implementation).
 */
import { DuplicateDetector } from '../ded-rab-v3/evidence/duplicateDetector';
import { QuantitySanityGate } from '../ai-estimate/quantitySanityGate';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('DED OLD PIPELINE SAFETY (actual implementation)');

// TASK 5: dedup should NOT merge "Balok lantai 1" vs "Balok lantai 2"
const detector = DuplicateDetector.getInstance();
const items: any[] = [
  { id: 'b1', name: 'Balok lantai 1', category: 'STRUKTUR', sourcePages: [1], dimensions: '4000 x 150 x 200 mm', sourceEvidence: [] },
  { id: 'b2', name: 'Balok lantai 2', category: 'STRUKTUR', sourcePages: [2], dimensions: '4000 x 150 x 200 mm', sourceEvidence: [] },
];
const dedupResult = detector.deduplicate(items);
const mergedIds = new Set<string>();
for (const a of (dedupResult as any).mergeActions || []) mergedIds.add(a.mergedItemId);
check('T5 dedup: lantai 1 vs 2 NOT merged', !mergedIds.has('b1') && !mergedIds.has('b2'), JSON.stringify((dedupResult as any).mergeActions));

// TASK 5: identical items SHOULD merge
const items2: any[] = [
  { id: 'c1', name: 'Balok B1', category: 'STRUKTUR', sourcePages: [1], dimensions: '4000 x 150 x 200 mm', sourceEvidence: [] },
  { id: 'c2', name: 'Balok B1', category: 'STRUKTUR', sourcePages: [1], dimensions: '4000 x 150 x 200 mm', sourceEvidence: [] },
];
const dedupResult2 = detector.deduplicate(items2);
const merged2 = new Set<string>();
for (const a of (dedupResult2 as any).mergeActions || []) merged2.add(a.mergedItemId);
check('T5 dedup: identical items merged', merged2.size > 0);

// TASK 5: sanity gate — large valid infra quantity -> SUSPICIOUS not BLOCKED
const bigItem: any = { id: 'd1', workName: 'Dinding bata', item: 'Dinding bata', unit: 'm²', quantity: 2000, warnings: [], assumptions: [] };
QuantitySanityGate.evaluateItem(bigItem);
check('T5 gate: 2000 m² dinding -> SUSPICIOUS (not BLOCKED)', bigItem.quantityStatus === 'SUSPICIOUS', `got ${bigItem.quantityStatus}`);

// TASK 5: truly absurd -> BLOCKED
const absurdItem: any = { id: 'd2', workName: 'Beton sloof', item: 'Beton sloof', unit: 'm³', quantity: 120000000, warnings: [], assumptions: [] };
QuantitySanityGate.evaluateItem(absurdItem);
check('T5 gate: 1.2e8 m³ -> BLOCKED_FROM_TOTAL', absurdItem.quantityStatus === 'BLOCKED_FROM_TOTAL', `got ${absurdItem.quantityStatus}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
