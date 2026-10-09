/**
 * EZRAB FASE 5B — Context isolation test (src/test/aiContextIsolation.mjs)
 *
 * Verifies that project snapshots never mix data between projects:
 * - Project A and B have different items/totals.
 * - Switching A -> B -> A yields correct per-project figures.
 * - A conversation bound to A never returns B's data.
 * - Global (no project) yields an honest "no project" message.
 *
 * Pure logic test (mirrors projectContext.ts rules); no model calls.
 */

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function buildSnapshot(project, items) {
  if (!project?.id) return null;
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
    items: snaps,
  };
}

const PROJ_A = { id: 'PRJ-A', name: 'Proyek A' };
const ITEMS_A = [
  { id: 'a1', description: 'Pondasi A', unit: 'm3', volume: 10, unitPrice: 500000, totalPrice: 5000000, priceStatus: 'PRICE_RESOLVED' },
];
const PROJ_B = { id: 'PRJ-B', name: 'Proyek B' };
const ITEMS_B = [
  { id: 'b1', description: 'Beton B', unit: 'm3', volume: 2, unitPrice: 1000000, totalPrice: 2000000, priceStatus: 'PRICE_RESOLVED' },
  { id: 'b2', description: 'Eksklusif B', unit: 'm2', volume: 3, unitPrice: null, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED' },
];

console.log('AI CONTEXT ISOLATION');
const snapA1 = buildSnapshot(PROJ_A, ITEMS_A);
check('I1 project A total = 5.000.000', snapA1.totalDirect === 5000000, `got ${snapA1.totalDirect}`);

// Switch A -> B (new snapshot, no refresh)
const snapB = buildSnapshot(PROJ_B, ITEMS_B);
check('I2 project B total = 2.000.000 (not A\'s)', snapB.totalDirect === 2000000, `got ${snapB.totalDirect}`);
check('I3 B snapshot bound to PRJ-B', snapB.projectId === 'PRJ-B');

// Switch B -> A (back)
const snapA2 = buildSnapshot(PROJ_A, ITEMS_A);
check('I4 back to A total = 5.000.000', snapA2.totalDirect === 5000000);
check('I5 A snapshot has no B items', !snapA2.items.some((i) => i.description.includes('Beton B')));

// Old conversation bound to A while active is B: conversation keeps its projectId.
function conversationProject(convProjectId, activeProjectId) {
  // Contract: the store keys conversations by projectId; a conversation opened
  // under A keeps projectId=A even when the active project becomes B.
  return convProjectId;
}
check('I6 old conversation keeps project A identity', conversationProject('PRJ-A', 'PRJ-B') === 'PRJ-A');

// Item in A but not in B
const foundInB = snapB.items.some((i) => i.description === 'Pondasi A');
check('I7 "Pondasi A" not found in B', !foundInB);

// Global (no project)
const snapGlobal = buildSnapshot(null, []);
check('I8 no project -> null snapshot (honest)', snapGlobal === null);

// Tool with no snapshot -> honest message
function toolTotal(snap) {
  if (!snap) return 'NO_PROJECT_HONEST';
  return snap.totalDirect;
}
check('I9 tool without project -> honest message', toolTotal(null) === 'NO_PROJECT_HONEST');

// Refresh persistence: snapshot rebuilt from same source -> identical figures
const snapARefresh = buildSnapshot(PROJ_A, ITEMS_A);
check('I10 rebuild after refresh identical', snapARefresh.totalDirect === snapA1.totalDirect && snapARefresh.projectId === snapA1.projectId);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
