/**
 * I5 — Cross-sheet reference graph (spec §7): plain-tsx assertion suite.
 *
 * Fixtures carry hand-verified ground truth: a full chain floor plan →
 * door D1 → door schedule D1 → elevation detail (all CONFIRMED), a
 * probable ref (mark matches, page unknown), a dangling detail ref
 * (target sheet missing → UNRESOLVED), and two conflicting widths for the
 * same mark (CONTRADICTORY, both claims named).
 *
 * NO vitest imports. Run from repo root:
 *   npx --yes tsx src/test/dedVisionReferences.test.ts
 * Prints `PASS n/total` and exits non-zero on any failure.
 */

import {
  addReference,
  createReferenceGraph,
  detectConflicts,
  findConflicts,
  findUnresolved,
  normalizeRefKey,
  resolveGraph,
  resolveReference,
} from '../ai-tools/ded-vision/references';
import type { CrossSheetReference } from '../ai-tools/ded-vision/types';
import type { EvidenceRecord } from '../ded-rab-v2/types';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0;
let total = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  total += 1;
  if (cond) {
    passed += 1;
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// Fixtures (ground truth, hand-verified)
// ---------------------------------------------------------------------------

function ev(id: string, page: number, content: string): EvidenceRecord {
  return {
    id,
    sourceDocumentId: 'DOC-FIXTURE-1',
    sourceFileName: 'rumah-1-lantai.pdf',
    pageNumber: page,
    type: 'NOTE',
    content,
    confidence: 0.9,
  };
}

/**
 * Drawing set (ground truth):
 *   p2  floor plan A-101 — door mark D1 drawn, detail callout DET-A1
 *   p5  door/window schedule — row D1, elevation tag EL-01
 *   p8  elevation detail EL-01
 *   p12 does not exist (dangling detail target)
 */
const KNOWN_TARGETS = [
  { page: 2, ref: 'D1' },
  { page: 5, ref: 'D1' },
  { page: 8, ref: 'EL-01' },
  { page: 5, ref: 'D2' },
];

const refPlanToD1: CrossSheetReference = {
  from: { page: 2, ref: 'A-101' },
  to: { page: 2, ref: 'D1' },
  kind: 'OTHER',
  status: 'UNRESOLVED',
  evidence: [ev('EV-001', 2, 'Denah lantai 1: simbol pintu D1 di ruang tamu')],
};

const refD1ToSchedule: CrossSheetReference = {
  from: { page: 2, ref: 'D1' },
  to: { page: 5, ref: 'D1' },
  kind: 'SCHEDULE',
  status: 'UNRESOLVED',
  evidence: [ev('EV-002', 5, 'Jadwal pintu: baris D1, 900 x 2100 mm')],
};

const refScheduleToElevation: CrossSheetReference = {
  from: { page: 5, ref: 'D1' },
  to: { page: 8, ref: 'EL-01' },
  kind: 'ELEVATION',
  status: 'UNRESOLVED',
  evidence: [ev('EV-003', 8, 'Detail elevasi EL-01: tampak pintu D1')],
};

/** Mark matches a known target (D2 on p5) but the calling page is unknown. */
const refProbablePageUnknown: CrossSheetReference = {
  from: { page: 2, ref: 'A-101' },
  to: { page: null, ref: 'D2' },
  kind: 'SCHEDULE',
  status: 'UNRESOLVED',
  evidence: [ev('EV-004', 2, 'Denah: marka D2 tanpa nomor halaman jadwal')],
};

/** Mark matches, but the claimed page (9) is not where D2 lives (p5). */
const refProbableWrongPage: CrossSheetReference = {
  from: { page: 3, ref: 'A-102' },
  to: { page: 9, ref: 'D2' },
  kind: 'SCHEDULE',
  status: 'UNRESOLVED',
  evidence: [ev('EV-005', 3, 'Denah lt. 2: D2 dirujuk ke halaman 9')],
};

/** Target sheet missing entirely: no known target carries DET-X9. */
const refDanglingDetail: CrossSheetReference = {
  from: { page: 2, ref: 'A-101' },
  to: { page: 12, ref: 'DET-X9' },
  kind: 'DETAIL',
  status: 'UNRESOLVED',
  evidence: [ev('EV-006', 2, 'Callout detail DET-X9, lembar tidak ada di set')],
};

// ---------------------------------------------------------------------------
// 1. createReferenceGraph / addReference
// ---------------------------------------------------------------------------

const empty = createReferenceGraph();
eq('createReferenceGraph returns an empty array', empty.length, 0);

const g1 = addReference(empty, refPlanToD1);
eq('addReference returns a new array (not the input)', g1 === empty, false);
eq('addReference does not mutate the input array', empty.length, 0);
eq('addReference result holds the added ref', g1.length, 1);
check('addReference result contains the exact ref object', g1[0] === refPlanToD1);

const g2 = addReference(g1, refD1ToSchedule);
eq('second addReference does not mutate the previous graph', g1.length, 1);
eq('second addReference result length', g2.length, 2);

// ---------------------------------------------------------------------------
// 2. resolveReference — full chain CONFIRMED
// ---------------------------------------------------------------------------

const chain: CrossSheetReference[] = [
  refPlanToD1,
  refD1ToSchedule,
  refScheduleToElevation,
];
const resolvedChain = resolveGraph(chain, KNOWN_TARGETS);
eq('chain: plan -> D1 is CONFIRMED', resolvedChain[0].status, 'CONFIRMED');
eq('chain: D1 -> schedule D1 is CONFIRMED', resolvedChain[1].status, 'CONFIRMED');
eq('chain: schedule -> elevation EL-01 is CONFIRMED', resolvedChain[2].status, 'CONFIRMED');
eq('resolveGraph does not mutate the input graph', chain[0].status, 'UNRESOLVED');
eq('resolveGraph returns a new array', resolvedChain === chain, false);
eq(
  'resolution preserves evidence (id)',
  resolvedChain[1].evidence[0]?.id,
  'EV-002',
);
eq(
  'resolution preserves evidence (count)',
  resolvedChain[1].evidence.length,
  refD1ToSchedule.evidence.length,
);

// ---------------------------------------------------------------------------
// 3. resolveReference — PROBABLE and UNRESOLVED
// ---------------------------------------------------------------------------

const probableUnknown = resolveReference(refProbablePageUnknown, KNOWN_TARGETS);
eq('mark matches, page unknown -> PROBABLE', probableUnknown.status, 'PROBABLE');

const probableWrong = resolveReference(refProbableWrongPage, KNOWN_TARGETS);
eq('mark matches, page differs -> PROBABLE', probableWrong.status, 'PROBABLE');

const dangling = resolveReference(refDanglingDetail, KNOWN_TARGETS);
eq('no matching target -> UNRESOLVED', dangling.status, 'UNRESOLVED');

const danglingNullPage: CrossSheetReference = {
  from: { page: 2, ref: 'A-101' },
  to: { page: null, ref: 'DET-ZZ' },
  kind: 'DETAIL',
  status: 'UNRESOLVED',
  evidence: [],
};
eq(
  'unknown ref with unknown page -> UNRESOLVED',
  resolveReference(danglingNullPage, KNOWN_TARGETS).status,
  'UNRESOLVED',
);

const emptyRef: CrossSheetReference = {
  from: { page: 2, ref: 'A-101' },
  to: { page: 5, ref: '   ' },
  kind: 'OTHER',
  status: 'UNRESOLVED',
  evidence: [],
};
eq(
  'empty ref never matches -> UNRESOLVED',
  resolveReference(emptyRef, KNOWN_TARGETS).status,
  'UNRESOLVED',
);

// Case/whitespace-insensitive ref matching is deterministic.
const lowerCaseRef: CrossSheetReference = {
  from: { page: 2, ref: 'A-101' },
  to: { page: 2, ref: ' d1 ' },
  kind: 'OTHER',
  status: 'UNRESOLVED',
  evidence: [],
};
eq(
  'ref matching is case/whitespace-insensitive -> CONFIRMED',
  resolveReference(lowerCaseRef, KNOWN_TARGETS).status,
  'CONFIRMED',
);
eq('normalizeRefKey trims and upper-cases', normalizeRefKey(' d1 '), 'D1');

// resolveReference never mutates its input.
const inputBefore = { ...refProbablePageUnknown };
resolveReference(refProbablePageUnknown, KNOWN_TARGETS);
eq('resolveReference does not mutate the input ref', refProbablePageUnknown.status, inputBefore.status);

// ---------------------------------------------------------------------------
// 4. CONTRADICTORY is sticky under resolution
// ---------------------------------------------------------------------------

const alreadyContradictory: CrossSheetReference = {
  from: { page: 2, ref: 'D1' },
  to: { page: 5, ref: 'D1' },
  kind: 'SCHEDULE',
  status: 'CONTRADICTORY',
  evidence: [ev('EV-007', 5, 'Jadwal D1')],
  conflictDetail: 'Conflicting claims for D1: "900 mm" (page 3) vs "1000 mm" (page 7)',
};
const kept = resolveReference(alreadyContradictory, KNOWN_TARGETS);
eq('resolution never clears CONTRADICTORY', kept.status, 'CONTRADICTORY');
eq(
  'resolution keeps the existing conflictDetail',
  kept.conflictDetail,
  alreadyContradictory.conflictDetail,
);

// ---------------------------------------------------------------------------
// 5. detectConflicts — two widths for the same mark
// ---------------------------------------------------------------------------

const graphForConflicts = resolveGraph(
  [refPlanToD1, refD1ToSchedule, refScheduleToElevation, refDanglingDetail],
  KNOWN_TARGETS,
);
const values = new Map<string, { claim: string; page: number }[]>([
  // Ground truth conflict: floor plan says 900 mm (p3), schedule says 1000 mm (p7).
  ['D1', [
    { claim: '900 mm', page: 3 },
    { claim: '1000 mm', page: 7 },
  ]],
  // Same claim twice: NOT a conflict.
  ['D2', [
    { claim: '800 mm', page: 5 },
    { claim: '800 mm', page: 5 },
  ]],
  // Single claim: NOT a conflict.
  ['EL-01', [{ claim: '2100 mm', page: 8 }]],
]);
const conflicted = detectConflicts(graphForConflicts, values);

const d1Refs = conflicted.filter(
  (r) => r.from.ref === 'D1' || r.to.ref === 'D1',
);
check('conflict: all 3 D1 refs marked CONTRADICTORY', d1Refs.length === 3 && d1Refs.every((r) => r.status === 'CONTRADICTORY'));
const detail = d1Refs[0]?.conflictDetail ?? '';
check('conflictDetail names the first claim', detail.includes('"900 mm"'));
check('conflictDetail names the first claim page', detail.includes('(page 3)'));
check('conflictDetail names the second claim', detail.includes('"1000 mm"'));
check('conflictDetail names the second claim page', detail.includes('(page 7)'));
check('conflictDetail names the target key', detail.includes('D1'));
check(
  'conflictDetail is deterministic (page-ascending order)',
  detail.indexOf('900 mm') < detail.indexOf('1000 mm'),
);
check(
  'conflict refs keep their evidence',
  d1Refs.every((r) => r.evidence.length > 0),
);

// The dangling detail ref is untouched by the D1 conflict.
const danglingAfter = conflicted.find((r) => r.to.ref === 'DET-X9');
eq('unrelated ref keeps its UNRESOLVED status', danglingAfter?.status, 'UNRESOLVED');
eq('unrelated ref gains no conflictDetail', danglingAfter?.conflictDetail, undefined);

// Input graph is not mutated.
check(
  'detectConflicts does not mutate the input graph',
  graphForConflicts.every((r) => r.status !== 'CONTRADICTORY'),
);
eq('detectConflicts returns a new array', conflicted === graphForConflicts, false);

// No conflicts at all -> same statuses, new array.
const noConflict = detectConflicts(graphForConflicts, new Map([
  ['D1', [{ claim: '900 mm', page: 3 }]],
]));
check(
  'single distinct claim per key -> no CONTRADICTORY refs',
  noConflict.every((r) => r.status !== 'CONTRADICTORY'),
);

// Three-way conflict names all three claims.
const threeWay = detectConflicts(graphForConflicts, new Map([
  ['D1', [
    { claim: '1000 mm', page: 7 },
    { claim: '900 mm', page: 3 },
    { claim: '850 mm', page: 4 },
  ]],
]));
const threeDetail = threeWay.find((r) => r.to.ref === 'D1')?.conflictDetail ?? '';
check('three-way conflict names all claims', threeDetail.includes('"900 mm"') && threeDetail.includes('"850 mm"') && threeDetail.includes('"1000 mm"'));
check(
  'three-way conflict detail is page-ordered regardless of input order',
  threeDetail.indexOf('900 mm') < threeDetail.indexOf('850 mm') &&
    threeDetail.indexOf('850 mm') < threeDetail.indexOf('1000 mm'),
);

// ---------------------------------------------------------------------------
// 6. findUnresolved / findConflicts
// ---------------------------------------------------------------------------

const unresolved = findUnresolved(conflicted);
eq('findUnresolved returns only the dangling ref', unresolved.length, 1);
eq('findUnresolved finds DET-X9', unresolved[0]?.to.ref, 'DET-X9');

const conflicts = findConflicts(conflicted);
eq('findConflicts returns the 3 D1 refs', conflicts.length, 3);
check('findConflicts only returns CONTRADICTORY refs', conflicts.every((r) => r.status === 'CONTRADICTORY'));

eq('findUnresolved on empty graph', findUnresolved([]).length, 0);
eq('findConflicts on empty graph', findConflicts([]).length, 0);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`PASS ${passed}/${total}`);
if (failures.length > 0) {
  console.error(`FAILED ${failures.length} assertion(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
