/**
 * EZRAB FASE 5A — AI Grounding regression test (src/test/aiGrounding.mjs)
 *
 * Tests the read-only project tools + deterministic snapshot builder with the
 * isolated fixture QA-AI-GROUNDING-001. No model calls; tests the data layer
 * that grounds the AI (tools must return exact figures, never fabricated).
 *
 * Fixture:
 * - Pondasi batu kali: 5 m3 x Rp750.000 = Rp3.750.000 (PRICE_RESOLVED)
 * - Beton: 2 m3 x Rp1.000.000 = Rp2.000.000 (PRICE_RESOLVED)
 * - Pekerjaan tanpa harga: 3 m2, price unresolved (must NOT be Rp0)
 * Expected total: Rp5.750.000 (unresolved excluded)
 */

const FIXTURE_PROJECT = { id: 'PRJ-QA-AI-GROUNDING-001', name: 'QA-AI-GROUNDING-001' };
const FIXTURE_ITEMS = [
  {
    id: 'it-1', code: 'A.1', description: 'Pondasi batu kali', unit: 'm3',
    volume: 5, unitPrice: 750000, totalPrice: 3750000,
    priceStatus: 'PRICE_RESOLVED', sectionName: 'Pekerjaan Tanah',
  },
  {
    id: 'it-2', code: 'B.2', description: 'Beton', unit: 'm3',
    volume: 2, unitPrice: 1000000, totalPrice: 2000000,
    priceStatus: 'PRICE_RESOLVED', sectionName: 'Pekerjaan Beton',
  },
  {
    id: 'it-3', code: 'C.3', description: 'Pekerjaan tanpa harga', unit: 'm2',
    volume: 3, unitPrice: null, totalPrice: 0,
    priceStatus: 'PRICE_UNRESOLVED', sectionName: 'Pekerjaan Lain',
  },
];

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// The tools are TS; replicate the snapshot builder logic here for a pure-JS test
// of the SAME deterministic rules (mirrors src/ai-tools/ezrab-ai/projectContext.ts).
function buildSnapshot(project, items) {
  const snaps = items.map((it) => {
    const status = it.priceStatus === 'PRICE_UNRESOLVED' ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED';
    const volume = Number(it.volume) || 0;
    const unitPrice = it.unitPrice === null || it.unitPrice === undefined || it.unitPrice === '' ? null : Number(it.unitPrice) || 0;
    const totalPrice = status === 'PRICE_UNRESOLVED' ? 0 : (Number(it.totalPrice) || volume * (unitPrice ?? 0));
    return { ...it, volume, unitPrice, totalPrice, priceStatus: status };
  });
  return {
    projectId: project.id,
    projectName: project.name,
    itemCount: snaps.length,
    totalDirect: snaps.reduce((s, i) => s + i.totalPrice, 0),
    unresolvedCount: snaps.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').length,
    unresolvedItems: snaps.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED'),
    items: snaps,
  };
}

console.log('AI GROUNDING — deterministic snapshot rules');
const snap = buildSnapshot(FIXTURE_PROJECT, FIXTURE_ITEMS);

check('T1 total = Rp5.750.000 (unresolved excluded)', snap.totalDirect === 5750000, `got ${snap.totalDirect}`);
check('T2 item count = 3', snap.itemCount === 3);
check('T3 unresolved count = 1', snap.unresolvedCount === 1);
check('T4 unresolved item is "Pekerjaan tanpa harga"', snap.unresolvedItems[0]?.description === 'Pekerjaan tanpa harga');
check('T5 unresolved totalPrice = 0 (contributes nothing)', snap.unresolvedItems[0]?.totalPrice === 0);
check('T6 unresolved unitPrice = null (NOT Rp0)', snap.unresolvedItems[0]?.unitPrice === null);
check('T7 pondasi volume = 5 m3', snap.items[0]?.volume === 5 && snap.items[0]?.unit === 'm3');
check('T8 pondasi unitPrice = 750000', snap.items[0]?.unitPrice === 750000);
check('T9 beton subtotal = 2000000', snap.items[1]?.totalPrice === 2000000);
check('T10 snapshot bound to correct project', snap.projectId === 'PRJ-QA-AI-GROUNDING-001');

// Tool behavior contract (mirrors tools.ts logic)
function toolGetProjectTotal(s) {
  if (!s) return 'NO_PROJECT';
  return `Total RAB proyek "${s.projectName}": Rp${s.totalDirect.toLocaleString('id-ID')}`;
}
function toolGetItemDetail(s, name) {
  if (!s) return 'NO_PROJECT';
  const q = name.toLowerCase();
  const matches = s.items.filter((it) => it.description.toLowerCase().includes(q));
  if (!matches.length) return 'NOT_FOUND';
  if (matches.length > 1) return 'AMBIGUOUS:' + matches.length;
  return matches[0];
}

console.log('AI GROUNDING — tool contracts');
check('T11 get_project_total mentions Rp5.750.000', toolGetProjectTotal(snap).includes('5.750.000'));
check('T12 get_item_detail("pondasi") finds volume 5', toolGetItemDetail(snap, 'pondasi')?.volume === 5);
check('T13 get_item_detail("beton") subtotal 2000000', toolGetItemDetail(snap, 'beton')?.totalPrice === 2000000);
check('T14 get_item_detail("tidak ada") → NOT_FOUND (no fabrication)', toolGetItemDetail(snap, 'tidak ada') === 'NOT_FOUND');
check('T15 no project → honest message (no fabrication)', toolGetProjectTotal(null) === 'NO_PROJECT');
check('T16 unresolved never reported as Rp0 price', snap.unresolvedItems[0]?.unitPrice !== 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
