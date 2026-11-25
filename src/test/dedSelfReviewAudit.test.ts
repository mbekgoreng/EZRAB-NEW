/**
 * DED SELF-REVIEW AUDIT — LIVE TESTS (Phase C, owner directive 2026-11-25)
 * ===========================================================================
 * Audit run against the NEW live location ONLY
 * (`../ai-tools/ded-ai-estimate/dedSelfReviewAudit`) — never from v2 or v3.
 *
 * Case map (readiness report §6.3): C1–C17, plus the owner supplement's
 * test minimums (a)–(o) that have no §6.3 equivalent. Question
 * numbering is the v2 20-question set (§2 candidate C table).
 *
 * Minimums (supplement §2) → cases:
 * (a) every question returns a valid three-state result → C-A;
 * (b) missing evidence → NOT_EVALUATED → C-B;
 * (c) a genuinely verified condition can return PASS → C1;
 * (d) a genuine contradiction can return FAIL → C2–C6, C13;
 * (e) empty data does not produce false PASS → C-E;
 * (f) no arbitrary 20-item threshold → C9 + C-F;
 * (g) no fabricated schedule codes → C-G;
 * (h) no fabricated page counts → C-H;
 * (i) Q19 with known floor-area context → C-I;
 * (j) Q19 with missing floor-area context → C10;
 * (k) Q19 with room context → C-K;
 * (l) Q19 with insufficient room context → C-L;
 * (m) no hardcoded single-storey floor-area assumption → C-M;
 * (n) no mutation of RAB data (deep-equal before/after) → C16;
 * (o) no automatic correction or persistence → C-O.
 *
 * C15 (pipeline output shape) and the golden totals are verified by
 * re-running those suites, not inside this file — see PHASE-C-NOTE.md.
 * The in-file C15 asserts the report contract itself (two flags replace
 * `overallPassed`; no correction/persistence fields).
 */

import { readFileSync } from 'node:fs';
import {
  runSelfReviewAudit,
  unavailableSelfReviewAudit,
  AUDIT_QUESTION_COUNT,
  type SelfReviewAuditReport,
  type SelfReviewInput,
} from '../ai-tools/ded-ai-estimate/dedSelfReviewAudit';
import type { DedAiItem, DedPlanContext, DedQuantityReview } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';
import type { AiEstimateWorkItem } from '../ai-estimate/types';
import type { CanonicalDedMatch } from '../ai-tools/ded-canonical/canonicalDedPricing';
import type { DedContextMemory } from '../ded-rab-v3/types';
import type { LiveGateValidationResult } from '../ai-tools/ded-ai-estimate/dedRabValidationGate';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${(e as Error).message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function assertTrue(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertIncludes(haystack: string, needle: string, msg: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${msg} (expected to include ${JSON.stringify(needle)} in ${JSON.stringify(haystack)})`);
  }
}

function assertNotIncludes(haystack: string, needle: string, msg: string) {
  if (haystack.includes(needle)) {
    throw new Error(`${msg} (must not include ${JSON.stringify(needle)} in ${JSON.stringify(haystack)})`);
  }
}

function q(report: SelfReviewAuditReport, n: number) {
  const found = report.questions.find((x) => x.number === n);
  if (!found) throw new Error(`question ${n} missing from report`);
  return found;
}

function verdictOf(report: SelfReviewAuditReport, n: number) {
  return q(report, n).verdict;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMatch(status: CanonicalDedMatch['status'], unit: string, code = '3.7.4'): CanonicalDedMatch {
  return {
    status,
    matchedCode: code,
    matchedName: 'Pekerjaan contoh katalog',
    unitPrice: 50000,
    unit,
    sourceDocument: 'SE DJBK No. 47/SE/Dk/2026',
    period: '2026',
    candidates: [],
    reason: 'fixture',
    missingComponents: [],
    resolutionPath: [],
  };
}

function makeReview(outcome: DedQuantityReview['outcome'], qty: number, code = 'SCALE_OK'): DedQuantityReview {
  return { outcome, reasonCode: code, explanation: 'fixture', severity: 'NONE', originalQuantity: qty };
}

function makeDedItem(partial: Partial<DedAiItem> & { id: string; name: string }): DedAiItem {
  return {
    category: 'STRUKTUR',
    units: 'm2',
    quantity: 10,
    quantitySource: 'DED_EXPLICIT',
    unitPrice: 50000,
    priceSource: 'AHSP_2026',
    subtotal: 500000,
    sourcePages: [1],
    provenance: ['DED'],
    stage: 'CALCULATED',
    ...partial,
  } as DedAiItem;
}

/** Clean 5-item DED: every question has real evidence to pass on. */
function cleanDedItems(): DedAiItem[] {
  return [
    makeDedItem({
      id: 'd1',
      name: 'Beton kolom',
      category: 'STRUKTUR',
      units: 'm3',
      quantity: 0.81,
      quantitySource: 'DERIVED',
      quantityFormula: '12 × 0.15 × 0.15 × 3',
      unitPrice: 850000,
      subtotal: 688500,
      sourcePages: [2],
      ahspCode: '3.7.4',
      ahspMatch: makeMatch('RESOLVED', 'm3'),
      quantityReview: makeReview('REASONABLE', 0.81),
      derivation: {
        formulaType: 'kolom_volume',
        inputs: [
          { name: 'jumlah_kolom', value: 12, unit: 'bh', source: 'DED' },
          { name: 'lebar', value: 0.15, unit: 'm', source: 'DED' },
          { name: 'panjang', value: 0.15, unit: 'm', source: 'DED' },
          { name: 'tinggi', value: 3, unit: 'm', source: 'DED' },
        ],
        normalizedInputs: [],
        result: 0.81,
        resultUnit: 'm3',
        validationStatus: 'ok',
        notes: '12 × 0.15 × 0.15 × 3 = 0.8100 m³',
      },
    }),
    makeDedItem({
      id: 'd2',
      name: 'Dinding bata merah',
      category: 'ARSITEKTUR',
      units: 'm2',
      quantity: 40,
      quantitySource: 'DED_GEOMETRIC',
      quantityFormula: '20 × 2',
      unitPrice: 75000,
      subtotal: 3000000,
      sourcePages: [3],
      sourceEvidence: 'Denah lantai 1',
      ahspCode: '3.7.4',
      ahspMatch: makeMatch('RESOLVED', 'm2'),
      quantityReview: makeReview('REASONABLE', 40),
    }),
    makeDedItem({
      id: 'd3',
      name: 'Pemasangan lantai keramik',
      category: 'ARSITEKTUR',
      units: 'm2',
      quantity: 120,
      quantitySource: 'DED_EXPLICIT',
      unitPrice: 95000,
      subtotal: 11400000,
      sourcePages: [1],
      sourceEvidence: 'Denah lantai 1: keramik 60x60',
      ahspCode: '3.7.4',
      ahspMatch: makeMatch('RESOLVED', 'm2'),
      quantityReview: makeReview('REASONABLE', 120),
    }),
    makeDedItem({
      id: 'd4',
      name: 'Pintu kayu',
      category: 'DOOR_WINDOW',
      units: 'unit',
      quantity: 2,
      quantitySource: 'DED_EXPLICIT',
      unitPrice: 1500000,
      subtotal: 3000000,
      sourcePages: [4],
      sourceEvidence: 'Jadwal kusen',
      ahspCode: '3.7.4',
      ahspMatch: makeMatch('RESOLVED', 'unit'),
      quantityReview: makeReview('REASONABLE', 2),
    }),
    makeDedItem({
      id: 'd5',
      name: 'Plafon gypsum',
      category: 'ARSITEKTUR',
      units: 'm2',
      quantity: 110,
      quantitySource: 'DED_GEOMETRIC',
      quantityFormula: '11 × 10',
      unitPrice: 65000,
      subtotal: 7150000,
      sourcePages: [1],
      ahspCode: '3.7.4',
      ahspMatch: makeMatch('RESOLVED', 'm2'),
      quantityReview: makeReview('REASONABLE', 110),
    }),
  ];
}

const PLAN_120: DedPlanContext = {
  floorAreaM2: 120,
  ceilingAreaM2: 110,
  buildingPerimeterM: 40,
  doorUnits: 2,
  roomCount: 10,
};

function emptyMemory(queries: Array<{ question: string; resolved: boolean }> = []): DedContextMemory {
  return {
    projectId: 't',
    projectName: 't',
    totalPages: 10,
    pages: new Map(),
    drawings: [],
    dimensions: [],
    rooms: [],
    structural_elements: [],
    architectural_elements: [],
    materials: [],
    specifications: [],
    schedules: [],
    notes: [],
    cross_references: [],
    work_items: new Map(),
    quantity_evidence: new Map(),
    ahsp_evidence: new Map(),
    missing_information_queries: queries.map((qq) => ({ ...qq, searchedPages: [1] })),
  } as unknown as DedContextMemory;
}

function cleanInput(overrides: Partial<SelfReviewInput> = {}): SelfReviewInput {
  return {
    items: cleanDedItems(),
    pagesTotal: 10,
    pagesProcessed: 10,
    planContext: PLAN_120,
    contextMemory: emptyMemory(),
    duplicatesMerged: 2,
    classifyConstructionWork: () => ({ isConstructionWork: true }),
    ...overrides,
  };
}

function makeMagicItem(partial: Partial<AiEstimateWorkItem> & { id: string }): AiEstimateWorkItem {
  return {
    category: 'STRUKTUR',
    workName: 'Beton kolom',
    quantity: 0.81,
    unit: 'm3',
    unitPrice: 850000,
    subtotal: 688500,
    quantitySource: 'DED_GEOMETRIC',
    priceSource: 'AI_ESTIMATE',
    confidence: 'HIGH',
    sourcePages: [2],
    sourceEvidence: 'Potongan A-A',
    formula: '12 × 0.15 × 0.15 × 3',
    assumptions: [],
    warnings: [],
    status: 'VALID',
    quantityStatus: 'ACCEPTED',
    ...partial,
  } as AiEstimateWorkItem;
}

function makeFullAiItem(partial: Partial<FullAiItem> & { id: string }): FullAiItem {
  return {
    no: 1,
    name: 'Pemasangan lantai keramik',
    category: 'ARSITEKTUR',
    quantity: {
      value: 120,
      unit: 'm2',
      formula: '12 × 10',
      provenance: 'EXPLICIT',
      confidence: 'HIGH',
      sourcePages: [1],
    },
    price: {
      unitPrice: 95000,
      unit: 'm2',
      source: 'AHSP_2026',
      ahspCode: '3.7.4',
      ahspMatch: makeMatch('RESOLVED', 'm2'),
    },
    subtotal: 11400000,
    subtotalVerified: true,
    status: 'READY',
    exclusionReason: null,
    sourcePages: [1],
    ...partial,
  } as FullAiItem;
}

const MODULE_SOURCE = readFileSync(
  new URL('../ai-tools/ded-ai-estimate/dedSelfReviewAudit.ts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// §6.3 cases C1–C17
// ---------------------------------------------------------------------------

test('C1 (positive) clean run: all evaluated questions PASS, failedCount 0, complete true', () => {
  const r = runSelfReviewAudit(cleanInput());
  assertEqual(r.questions.length, 20, '20 questions');
  assertEqual(r.failedCount, 0, 'failedCount');
  assertEqual(r.notEvaluatedCount, 0, 'notEvaluatedCount');
  assertEqual(r.complete, true, 'complete');
  assertEqual(r.cleanPass, true, 'cleanPass');
  for (const qq of r.questions) {
    assertEqual(qq.verdict, 'PASS', `Q${qq.number} should PASS`);
    assertTrue(qq.evidence.length > 0, `Q${qq.number} PASS must carry evidence`);
  }
  assertEqual(r.metrics.inventoryCount, 5, 'inventoryCount');
  assertEqual(r.metrics.pagesTotal, 10, 'pagesTotal');
  assertEqual(r.metrics.pagesProcessed, 10, 'pagesProcessed');
});

test('C2 (negative) pagesProcessed < pagesTotal: Q1 FAIL with actual counts', () => {
  const r = runSelfReviewAudit(cleanInput({ pagesProcessed: 7 }));
  assertEqual(verdictOf(r, 1), 'FAIL', 'Q1');
  assertIncludes(q(r, 1).reason, '7 dari 10', 'Q1 reason states actual counts');
  assertEqual(r.cleanPass, false, 'not a clean pass');
});

test('C3 (negative) quantityReview NEEDS_REVIEW: Q19 FAIL listing item id + reason code', () => {
  const items = cleanDedItems();
  items[1].quantityReview = makeReview('NEEDS_REVIEW', 40, 'SCALE_HIGH');
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 19), 'FAIL', 'Q19');
  assertIncludes(q(r, 19).reason, 'd2', 'Q19 lists item id');
  assertIncludes(q(r, 19).reason, 'SCALE_HIGH', 'Q19 lists reason code');
});

test('C4 (negative) AHSP unit != quantity unit: Q15 FAIL via unit safety gate', () => {
  const items = cleanDedItems();
  items[2].ahspMatch = makeMatch('RESOLVED', 'm3');
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 15), 'FAIL', 'Q15');
  assertIncludes(q(r, 15).reason, 'd3', 'Q15 lists item id');
});

test('C5 (negative) unmatched NO_MATCH item: Q14 counts it as review, not PASS', () => {
  const items = cleanDedItems();
  items[2].ahspMatch = makeMatch('NO_MATCH', 'm2');
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 14), 'FAIL', 'Q14');
  assertIncludes(q(r, 14).reason, 'd3', 'Q14 lists item id');
  assertNotIncludes(q(r, 14).reason, '100%', 'Q14 never claims 100% compatible while unmatched items exist');
});

test('C6 (negative) AI-estimate price claimed as verified: Q16 FAIL, never an official-catalog claim', () => {
  const items = cleanDedItems();
  items[0].priceSource = 'AI_ESTIMATE';
  items[0].priceCompletion = {
    classification: 'OFFICIAL_AHSP_VERIFIED',
    verificationStatus: 'VERIFIED',
    recommendedPrice: 850000,
    rangeMin: null,
    rangeMax: null,
    unit: 'm3',
    scope: 'TERPASANG_PENUH',
    accessedAt: '2026-11-25',
    confidence: 'HIGH',
    method: 'fixture',
    ahspRelated: false,
    history: [],
  } as DedAiItem['priceCompletion'];
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 16), 'FAIL', 'Q16');
  for (const qq of r.questions) {
    assertNotIncludes(qq.reason, 'official PUPR database', `Q${qq.number} reason must never attribute AI estimates to an official catalog`);
  }
});

test('C7 (boundary) empty item list: Q11/Q12 NOT_EVALUATED, metrics all 0, not a clean pass', () => {
  const r = runSelfReviewAudit(cleanInput({ items: [] }));
  assertEqual(verdictOf(r, 11), 'NOT_EVALUATED', 'Q11');
  assertEqual(verdictOf(r, 12), 'NOT_EVALUATED', 'Q12');
  assertEqual(r.metrics.inventoryCount, 0, 'inventoryCount');
  assertEqual(r.metrics.quantityResolvedCount, 0, 'quantityResolvedCount');
  assertEqual(r.metrics.priceResolvedCount, 0, 'priceResolvedCount');
  assertEqual(r.metrics.ahspValidatedCount, 0, 'ahspValidatedCount');
  assertEqual(r.cleanPass, false, 'empty run is never a clean pass');
  assertEqual(r.failedCount, 0, 'empty run fails nothing — it cannot be evaluated');
});

test('C8 (boundary) pagesTotal = 0: Q1 NOT_EVALUATED, never vacuous-true', () => {
  const r = runSelfReviewAudit(cleanInput({ pagesTotal: 0, pagesProcessed: 0 }));
  assertEqual(verdictOf(r, 1), 'NOT_EVALUATED', 'Q1');
});

test('C9 (boundary) small legitimate DED (5 items): Q2/Q3 do NOT fail on count', () => {
  const r = runSelfReviewAudit(cleanInput());
  assertEqual(r.metrics.inventoryCount, 5, '5 items');
  assertEqual(verdictOf(r, 2), 'PASS', 'Q2 passes a 5-item DED');
  assertEqual(verdictOf(r, 3), 'PASS', 'Q3 passes a 5-item DED');
});

test('C10 (missing-data) floor area unknown: Q19 NOT_EVALUATED with floor-area reason', () => {
  const items = cleanDedItems().map((it) => {
    const copy = { ...it };
    delete (copy as Partial<DedAiItem>).quantityReview;
    return copy;
  });
  const r = runSelfReviewAudit({
    items,
    pagesTotal: 10,
    pagesProcessed: 10,
  });
  assertEqual(verdictOf(r, 19), 'NOT_EVALUATED', 'Q19');
  assertIncludes(q(r, 19).reason, 'floor area unknown', 'Q19 reason states floor area unknown');
});

test('C11 (Task B 2026-11-25) ded-ai path HAS a conflict source: the recorded dedup dimension conflict — Q17 PASS on clean items, scope stated', () => {
  // Premise overturned by Task B evidence: the live dedup
  // (mergeRawItemsAcrossPasses, service.ts:766-795) deterministically
  // flags same-name+unit items with different dimension signatures
  // across passes and records it on provenance (service.ts:394), so a
  // DED_AI list with no such marker is a list the check ran over and
  // found clean. No contextMemory is needed on this path any more.
  const r = runSelfReviewAudit(cleanInput({ contextMemory: undefined }));
  assertEqual(verdictOf(r, 17), 'PASS', 'Q17');
  assertIncludes(q(r, 17).reason, 'antar-pass', 'Q17 PASS names the check that ran');
  assertIncludes(q(r, 17).reason, 'terbatas pada konflik dimensi antar-pass', 'Q17 PASS states its scope limit');
  assertNotIncludes(q(r, 17).reason, 'Zero', 'Q17 never fabricates a zero-conflicts claim');
  assertTrue(q(r, 17).evidence.includes('dedup-conflicts=0'), 'Q17 evidence carries the conflict count');
});

test('Q17 ded-ai path FAIL: recorded dedup dimension conflict on provenance (live shape: first item unmarked, later kept item marked)', () => {
  const items = cleanDedItems();
  // Live shape (service.ts:790 marks group.slice(1)): the first item of
  // the same name+unit group is unmarked; the kept duplicate carries it.
  items[1] = {
    ...items[1],
    name: 'Dinding bata merah',
    sourcePages: [7],
    provenance: ['DED', 'dedup-conflict: dimensi berbeda antar-pass untuk nama+satuan yang sama'],
  };
  const r = runSelfReviewAudit(cleanInput({ items, contextMemory: undefined }));
  assertEqual(verdictOf(r, 17), 'FAIL', 'Q17');
  assertTrue(q(r, 17).evidence.includes('d2'), 'Q17 evidence names the conflicted item');
  assertIncludes(q(r, 17).reason, 'Dinding bata merah', 'Q17 reason names the conflicted work');
  assertIncludes(q(r, 17).reason, 'antar-pass', 'Q17 reason names the check');
  assertIncludes(q(r, 17).reason, '7', 'Q17 reason shows the conflicted item source page');
  assertEqual(r.metrics.conflictCount, 1, 'metrics.conflictCount counts the dedup conflict');
});

test('Q17 ded-ai path: two conflicted items both counted; clean ded-ai + unresolved query still FAILs on the query source', () => {
  const items = cleanDedItems();
  items[1] = {
    ...items[1],
    provenance: ['DED', 'dedup-conflict: dimensi berbeda antar-pass untuk nama+satuan yang sama'],
  };
  items[2] = {
    ...items[2],
    provenance: ['DED', 'dedup-conflict: dimensi berbeda antar-pass untuk nama+satuan yang sama'],
  };
  const both = runSelfReviewAudit(cleanInput({ items, contextMemory: undefined }));
  assertEqual(verdictOf(both, 17), 'FAIL', 'Q17 two dedup conflicts');
  assertEqual(both.metrics.conflictCount, 2, 'metrics.conflictCount counts both');
  const queryOnly = runSelfReviewAudit(
    cleanInput({ contextMemory: emptyMemory([{ question: 'Dimensi balok lantai 2 belum ditemukan', resolved: false }]) }),
  );
  assertEqual(verdictOf(queryOnly, 17), 'FAIL', 'Q17 clean ded-ai items do not mask an unresolved query');
  assertEqual(queryOnly.metrics.conflictCount, 1, 'metrics.conflictCount counts the query');
});

test('Q17 stays NOT_EVALUATED when neither source exists: Magic AI items only, no contextMemory', () => {
  const items = [makeMagicItem({})];
  const r = runSelfReviewAudit({ items, pagesTotal: 5, pagesProcessed: 5 });
  assertEqual(verdictOf(r, 17), 'NOT_EVALUATED', 'Q17');
  assertNotIncludes(q(r, 17).reason, 'Zero', 'Q17 never fabricates a zero-conflicts claim');
});

test('C12 (classifier port) Q9 uses the ported classifier by default: PASS on clean construction items (no hook supplied)', () => {
  const r = runSelfReviewAudit(cleanInput({ classifyConstructionWork: undefined }));
  assertEqual(verdictOf(r, 9), 'PASS', 'Q9');
  assertIncludes(q(r, 9).reason, 'Seluruh 5 item', 'Q9 states the item count');
});

test('C13 (contradictory) quantitySource ASSUMPTION: Q7 FAIL with the count', () => {
  const items = cleanDedItems();
  items[0].quantitySource = 'ASSUMPTION';
  items[3].quantitySource = 'ASSUMPTION';
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 7), 'FAIL', 'Q7');
  assertIncludes(q(r, 7).reason, '2 dari 5', 'Q7 states the assumed count');
});

test('C14 (contradictory) duplicates: merge count reported; FAIL only if unmerged remain', () => {
  const merged = runSelfReviewAudit(cleanInput({ duplicatesMerged: 3 }));
  assertEqual(verdictOf(merged, 10), 'PASS', 'Q10 passes when deduper merged and none remain');
  assertIncludes(q(merged, 10).reason, '3 duplikat', 'Q10 reports the deduper merge count');
  const items = cleanDedItems();
  items.push(makeDedItem({
    id: 'd1-dup',
    name: 'Beton kolom',
    category: 'STRUKTUR',
    units: 'm3',
    quantity: 0.81,
    quantitySource: 'DERIVED',
    quantityFormula: '12 × 0.15 × 0.15 × 3',
    unitPrice: 850000,
    subtotal: 688500,
    sourcePages: [2],
    ahspCode: '3.7.4',
    ahspMatch: makeMatch('RESOLVED', 'm3'),
    quantityReview: makeReview('REASONABLE', 0.81),
  }));
  const remaining = runSelfReviewAudit(cleanInput({ items, duplicatesMerged: 1 }));
  assertEqual(verdictOf(remaining, 10), 'FAIL', 'Q10 fails when unmerged duplicates remain');
  assertIncludes(q(remaining, 10).reason, 'd1-dup', 'Q10 lists the remaining duplicate');
});

test('C15 (regression) report contract: two flags replace overallPassed, no correction fields', () => {
  const r = runSelfReviewAudit(cleanInput());
  assertTrue(!('overallPassed' in r), 'no overallPassed field (replaced by failedCount/complete)');
  assertTrue('failedCount' in r && 'notEvaluatedCount' in r && 'complete' in r && 'cleanPass' in r, 'two-flag contract present');
  assertTrue(!('correctionsExecuted' in r), 'no correctionsExecuted field');
  assertEqual(AUDIT_QUESTION_COUNT, 20, '20 questions');
});

test('C16 (consumer compat) audit never mutates items: deep-equal before/after', () => {
  const items = cleanDedItems();
  const before = JSON.stringify(items);
  const totalBefore = items.reduce((a, it) => a + (it.subtotal ?? 0), 0);
  runSelfReviewAudit(cleanInput({ items }));
  assertEqual(JSON.stringify(items), before, 'items deep-equal after audit');
  const totalAfter = items.reduce((a, it) => a + (it.subtotal ?? 0), 0);
  assertEqual(totalAfter, totalBefore, 'totals unchanged after audit');
  assertEqual(totalBefore, 688500 + 3000000 + 11400000 + 3000000 + 7150000, 'fixture total sanity');
});

test('C17 (consumer compat) any NOT_EVALUATED: complete false even with failedCount 0', () => {
  const items = cleanDedItems();
  items.push({ ...items[0], id: 'd6', name: 'Xyzq wkwk', category: 'OTHER' });
  const r = runSelfReviewAudit(cleanInput({ items, classifyConstructionWork: undefined }));
  assertEqual(verdictOf(r, 9), 'NOT_EVALUATED', 'Q9 undecidable on the unknown item');
  assertEqual(r.failedCount, 0, 'no failures');
  assertTrue(r.notEvaluatedCount > 0, 'some NOT_EVALUATED');
  assertEqual(r.complete, false, 'complete false');
  assertEqual(r.cleanPass, false, 'cleanPass false');
});

// ---------------------------------------------------------------------------
// Supplement minimums (a)–(o)
// ---------------------------------------------------------------------------

test('C-A (a) every question returns a valid three-state result', () => {
  const runs = [
    runSelfReviewAudit(cleanInput()),
    runSelfReviewAudit(cleanInput({ items: [] })),
    runSelfReviewAudit(cleanInput({ pagesTotal: 0, pagesProcessed: 0 })),
  ];
  for (const r of runs) {
    for (const qq of r.questions) {
      assertTrue(
        qq.verdict === 'PASS' || qq.verdict === 'FAIL' || qq.verdict === 'NOT_EVALUATED',
        `Q${qq.number} verdict must be three-state, got ${String(qq.verdict)}`,
      );
    }
  }
});

test('C-B (b) missing evidence sources → NOT_EVALUATED (Q13 no trails, Q15 no AHSP units)', () => {
  const items = [makeDedItem({
    id: 'b1',
    name: 'Pekerjaan contoh',
    quantity: 5,
    quantitySource: 'DED_EXPLICIT',
    sourceEvidence: 'Denah',
    sourcePages: [1],
  })];
  const r = runSelfReviewAudit({ items, pagesTotal: 3, pagesProcessed: 3 });
  assertEqual(verdictOf(r, 13), 'NOT_EVALUATED', 'Q13 without trails/formulas');
  assertEqual(verdictOf(r, 15), 'NOT_EVALUATED', 'Q15 without AHSP units');
});

test('C-E (e) empty data does not produce false PASS: fully empty run, all 20 NOT_EVALUATED', () => {
  const r = runSelfReviewAudit({ items: [], pagesTotal: 0, pagesProcessed: 0 });
  assertEqual(r.questions.length, 20, '20 questions');
  for (const qq of r.questions) {
    assertEqual(qq.verdict, 'NOT_EVALUATED', `Q${qq.number} must not PASS on empty data`);
  }
  assertEqual(r.cleanPass, false, 'not clean');
  assertEqual(r.complete, false, 'not complete');
});

test('C-F (f) no arbitrary 20-item threshold in the module', () => {
  assertNotIncludes(MODULE_SOURCE, 'totalItems >= 20', 'no >= 20 item-count threshold');
  assertNotIncludes(MODULE_SOURCE, 'items.length >= 20', 'no >= 20 length threshold');
  assertNotIncludes(MODULE_SOURCE, '>= 20', 'no >= 20 threshold anywhere');
});

test('C-G (g) no fabricated schedule codes in the module or in Q5 output', () => {
  assertNotIncludes(MODULE_SOURCE, 'P1, P2', 'no fabricated schedule code list');
  assertNotIncludes(MODULE_SOURCE, 'J1, J2', 'no fabricated schedule code list');
  assertNotIncludes(MODULE_SOURCE, 'BV1', 'no fabricated schedule code');
  const r = runSelfReviewAudit(cleanInput());
  assertTrue(!/[PJ]\d/.test(q(r, 5).reason), 'Q5 reason names no schedule codes');
});

test('C-H (h) no fabricated page counts; Q20 states the actual counts', () => {
  assertNotIncludes(MODULE_SOURCE, '32 pages', 'no fabricated page count');
  assertNotIncludes(MODULE_SOURCE, '32 halaman', 'no fabricated page count');
  const r = runSelfReviewAudit(cleanInput());
  assertIncludes(q(r, 20).reason, '10 dari 10', 'Q20 states actual page counts');
});

test('C-I (i) Q19 with known floor-area context (plan): PASS citing the live area', () => {
  const r = runSelfReviewAudit(cleanInput());
  assertEqual(verdictOf(r, 19), 'PASS', 'Q19');
  assertIncludes(q(r, 19).reason, '120', 'Q19 note cites the live floor area');
});

test('C-K (k) Q19 with room context: PASS citing summed room area', () => {
  const items = cleanDedItems();
  const memory = emptyMemory();
  memory.rooms = [
    { id: 'r1', name: 'Ruang Tamu', pageNumber: 1, lengthM: 6, widthM: 10, areaM2: 60, perimeterM: 32 },
    { id: 'r2', name: 'Kamar Tidur', pageNumber: 1, lengthM: 6, widthM: 10, areaM2: 60, perimeterM: 32 },
  ] as DedContextMemory['rooms'];
  const r = runSelfReviewAudit({ items, pagesTotal: 10, pagesProcessed: 10, contextMemory: memory });
  assertEqual(verdictOf(r, 19), 'PASS', 'Q19');
  assertIncludes(q(r, 19).reason, '120', 'Q19 note cites summed room area');
});

test('C-L (l) Q19 with insufficient room context: NOT_EVALUATED, floor-area-unknown', () => {
  const items = cleanDedItems().map((it) => {
    const copy = { ...it };
    delete (copy as Partial<DedAiItem>).quantityReview;
    return copy;
  });
  const noRooms = runSelfReviewAudit({
    items, pagesTotal: 10, pagesProcessed: 10, rooms: [],
  });
  assertEqual(verdictOf(noRooms, 19), 'NOT_EVALUATED', 'Q19 with zero rooms');
  assertIncludes(q(noRooms, 19).reason, 'floor area unknown', 'Q19 reason');
  const zeroArea = runSelfReviewAudit({
    items,
    pagesTotal: 10,
    pagesProcessed: 10,
    rooms: [{ id: 'r1', name: 'Ruang', pageNumber: 1, lengthM: 0, widthM: 0, areaM2: 0, perimeterM: 0 }],
  });
  assertEqual(verdictOf(zeroArea, 19), 'NOT_EVALUATED', 'Q19 with rooms but no recorded area');
});

test('C-M (m) no hardcoded single-storey floor-area assumption', () => {
  assertTrue(!/54\s*m²|54m2|54 m2/i.test(MODULE_SOURCE), 'no hardcoded floor-area figure in the module');
  const r = runSelfReviewAudit(cleanInput());
  assertNotIncludes(q(r, 19).reason, '54', 'Q19 note never states the forbidden figure');
});

test('C-O (o) no automatic correction or persistence: read-only module', () => {
  const r = runSelfReviewAudit(cleanInput());
  assertTrue(!('correctionsExecuted' in r), 'report carries no corrections');
  assertNotIncludes(MODULE_SOURCE, 'ded-rab-v3/review', 'no v3 engine import');
  assertNotIncludes(MODULE_SOURCE, 'ded-rab-v2/', 'no v2 import');
  assertNotIncludes(MODULE_SOURCE, 'correctionsExecuted', 'no auto-correction vocabulary');
  const items = cleanDedItems();
  const before = JSON.stringify(items);
  runSelfReviewAudit(cleanInput({ items }));
  assertEqual(JSON.stringify(items), before, 'items untouched (read-only proof)');
});

// ---------------------------------------------------------------------------
// Additional real checks per question
// ---------------------------------------------------------------------------

test('Q4 quantified item without dimensional basis: FAIL', () => {
  const items = [makeDedItem({
    id: 'q4',
    name: 'Pekerjaan tanpa dasar',
    quantity: 5,
    quantitySource: 'AI_INFERENCE',
    quantityFormula: undefined,
    sourceEvidence: undefined,
    sourcePages: [1],
    ahspMatch: makeMatch('RESOLVED', 'm2'),
    quantityReview: makeReview('REASONABLE', 5),
  })];
  const r = runSelfReviewAudit({ items, pagesTotal: 1, pagesProcessed: 1 });
  assertEqual(verdictOf(r, 4), 'FAIL', 'Q4');
});

test('Q6 null quantity: unmarked FAILs, explicitly marked PASSes', () => {
  const unmarked = [makeDedItem({
    id: 'q6a', name: 'Tanpa kuantitas', quantity: null, quantitySource: 'DED_EXPLICIT',
    unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [1],
  })];
  assertEqual(verdictOf(runSelfReviewAudit({ items: unmarked, pagesTotal: 1, pagesProcessed: 1 }), 6), 'FAIL', 'Q6 unmarked');
  const marked = [makeDedItem({
    id: 'q6b', name: 'Tanpa kuantitas', quantity: null, quantitySource: 'UNRESOLVED',
    unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [1],
    quantityAudit: { classification: 'MISSING', originalQuantity: null, proposedQuantity: null, unit: 'm2', method: 'fixture', confidence: 'LOW', verificationStatus: 'UNVERIFIED', userApprovalStatus: 'NOT_REQUIRED' },
  })];
  assertEqual(verdictOf(runSelfReviewAudit({ items: marked, pagesTotal: 1, pagesProcessed: 1 }), 6), 'PASS', 'Q6 marked');
});

test('Q8 guessed/default formula marker: FAIL', () => {
  const items = cleanDedItems();
  items[1].quantityFormula = 'Guessed 20 × 2';
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 8), 'FAIL', 'Q8');
});

test('Q11 quantified item without any evidence: FAIL', () => {
  const items = [makeDedItem({
    id: 'q11', name: 'Tanpa bukti', quantity: 5, sourcePages: [],
    sourceEvidence: undefined, ahspMatch: makeMatch('RESOLVED', 'm2'),
    quantityReview: makeReview('REASONABLE', 5),
  })];
  const r = runSelfReviewAudit({ items, pagesTotal: 1, pagesProcessed: 1 });
  assertEqual(verdictOf(r, 11), 'FAIL', 'Q11');
});

test('Q12 blank, unknown, and engineering-invalid units: FAIL', () => {
  const blank = [makeDedItem({ id: 'q12a', name: 'Pekerjaan', units: '' })];
  assertEqual(verdictOf(runSelfReviewAudit({ items: blank, pagesTotal: 1, pagesProcessed: 1 }), 12), 'FAIL', 'Q12 blank');
  const unknown = [makeDedItem({ id: 'q12b', name: 'Pekerjaan', units: 'xyz' })];
  assertEqual(verdictOf(runSelfReviewAudit({ items: unknown, pagesTotal: 1, pagesProcessed: 1 }), 12), 'FAIL', 'Q12 unknown');
  const engInvalid = [makeDedItem({ id: 'q12c', name: 'Pemasangan keramik lantai', units: 'm3', quantity: 5 })];
  assertEqual(verdictOf(runSelfReviewAudit({ items: engInvalid, pagesTotal: 1, pagesProcessed: 1 }), 12), 'FAIL', 'Q12 engineering-invalid');
});

test('Q13 rejected derivation trail and result mismatch: FAIL; live re-derivation agrees on clean trail', () => {
  const clean = runSelfReviewAudit(cleanInput());
  assertEqual(verdictOf(clean, 13), 'PASS', 'Q13 clean trail passes re-derivation');
  const rejected = cleanDedItems();
  if (rejected[0].derivation) rejected[0].derivation = { ...rejected[0].derivation, validationStatus: 'rejected: input kurang (tinggi)' };
  assertEqual(verdictOf(runSelfReviewAudit(cleanInput({ items: rejected })), 13), 'FAIL', 'Q13 rejected trail');
  const mismatch = cleanDedItems();
  if (mismatch[0].derivation) mismatch[0].derivation = { ...mismatch[0].derivation, result: 0.9 };
  assertEqual(verdictOf(runSelfReviewAudit(cleanInput({ items: mismatch })), 13), 'FAIL', 'Q13 result mismatch');
});

test('Q14/Q15 consume Phase B gate results where supplied', () => {
  const gateFail = (gateNo: number): LiveGateValidationResult => ({
    rabEligible: false,
    validationStatus: 'NEEDS_REVIEW',
    confidenceRating: 'LOW',
    confidenceScore: 0.4,
    validationErrors: [],
    gates: [{ gate: gateNo, name: 'fixture', status: 'FAIL', severity: 'BLOCKING', reason: 'gate fixture fail' }],
    blockingFailures: [],
    warningFailures: [],
    assumptionLabeled: false,
    provenance: { workDescription: 'fixture', priceVerification: { verified: false } },
  } as unknown as LiveGateValidationResult);
  const r14 = runSelfReviewAudit(cleanInput({
    gateResults: new Map([['d3', gateFail(5)]]),
  }));
  assertEqual(verdictOf(r14, 14), 'FAIL', 'Q14 follows Gate 5 FAIL');
  const r15 = runSelfReviewAudit(cleanInput({
    gateResults: new Map([['d3', gateFail(4)]]),
  }));
  assertEqual(verdictOf(r15, 15), 'FAIL', 'Q15 follows Gate 4 FAIL');
});

test('Q17 Magic AI path: unresolved information queries FAIL, none PASS', () => {
  const items = [makeMagicItem({})];
  const withQuery = runSelfReviewAudit({
    items, pagesTotal: 5, pagesProcessed: 5,
    contextMemory: emptyMemory([{ question: 'Dimensi balok lantai 2 belum ditemukan', resolved: false }]),
  });
  assertEqual(verdictOf(withQuery, 17), 'FAIL', 'Q17 unresolved query');
  const clean = runSelfReviewAudit({ items, pagesTotal: 5, pagesProcessed: 5, contextMemory: emptyMemory() });
  assertEqual(verdictOf(clean, 17), 'PASS', 'Q17 no unresolved queries');
});

test('Q18 unresolved item without a visible flag: FAIL', () => {
  const items = [makeDedItem({
    id: 'q18', name: 'Item menggantung', quantity: null, quantitySource: 'DED_EXPLICIT',
    unitPrice: 50000, priceSource: 'AHSP_2026', subtotal: null, sourcePages: [1],
    stage: 'QUANTITY',
  })];
  const r = runSelfReviewAudit({ items, pagesTotal: 1, pagesProcessed: 1 });
  assertEqual(verdictOf(r, 18), 'FAIL', 'Q18');
});

test('Q19 Magic AI path: BLOCKED_FROM_TOTAL fails; ACCEPTED passes', () => {
  const blocked = [makeMagicItem({ id: 'm1', quantityStatus: 'BLOCKED_FROM_TOTAL' })];
  assertEqual(
    verdictOf(runSelfReviewAudit({ items: blocked, pagesTotal: 5, pagesProcessed: 5 }), 19),
    'FAIL', 'Q19 blocked',
  );
  const accepted = [makeMagicItem({ id: 'm2', quantityStatus: 'ACCEPTED' })];
  assertEqual(
    verdictOf(runSelfReviewAudit({ items: accepted, pagesTotal: 5, pagesProcessed: 5 }), 19),
    'PASS', 'Q19 accepted',
  );
});

test('Q20 subtotal arithmetic mismatch: FAIL', () => {
  const items = cleanDedItems();
  items[1].subtotal = 2999999;
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 20), 'FAIL', 'Q20');
  assertIncludes(q(r, 20).reason, 'd2', 'Q20 lists the mismatching item');
});

test('Q16 AHSP price without backing code: FAIL; AI estimate honestly labeled: PASS', () => {
  const noCode = cleanDedItems();
  noCode[0].ahspCode = undefined;
  if (noCode[0].ahspMatch) noCode[0].ahspMatch = { ...noCode[0].ahspMatch, matchedCode: undefined };
  assertEqual(verdictOf(runSelfReviewAudit(cleanInput({ items: noCode })), 16), 'FAIL', 'Q16 unbacked AHSP claim');
  const aiLabeled = cleanDedItems();
  aiLabeled[0].priceSource = 'AI_ESTIMATE';
  aiLabeled[0].ahspMatch = makeMatch('NO_MATCH', 'm3');
  const r = runSelfReviewAudit(cleanInput({ items: aiLabeled }));
  assertEqual(verdictOf(r, 16), 'PASS', 'Q16 honestly labeled AI estimate passes');
  assertIncludes(q(r, 16).reason, 'estimasi AI', 'Q16 note labels AI estimates as estimates');
});

test('FullAi shape: Q7/Q13/Q14/Q15/Q16 evaluate on FullAiItem fields', () => {
  const item = makeFullAiItem({});
  const r = runSelfReviewAudit({ items: [item], pagesTotal: 4, pagesProcessed: 4 });
  assertEqual(verdictOf(r, 14), 'PASS', 'Q14 FullAi RESOLVED');
  assertEqual(verdictOf(r, 15), 'PASS', 'Q15 FullAi units match');
  assertEqual(verdictOf(r, 16), 'PASS', 'Q16 FullAi AHSP price');
  assertEqual(verdictOf(r, 7), 'PASS', 'Q7 FullAi EXPLICIT provenance');
  assertEqual(verdictOf(r, 13), 'PASS', 'Q13 FullAi formula present');
  const assumed = makeFullAiItem({
    id: 'f2',
    quantity: { value: 5, unit: 'm2', formula: '5', provenance: 'ASSUMPTION', confidence: 'LOW', sourcePages: [1] },
  });
  assertEqual(
    verdictOf(runSelfReviewAudit({ items: [assumed], pagesTotal: 4, pagesProcessed: 4 }), 7),
    'FAIL', 'Q7 FullAi ASSUMPTION provenance',
  );
});

test('Magic AI shape: Q14/Q15 NOT_EVALUATED (no AHSP on this path)', () => {
  const items = [makeMagicItem({})];
  const r = runSelfReviewAudit({ items, pagesTotal: 5, pagesProcessed: 5, contextMemory: emptyMemory() });
  assertEqual(verdictOf(r, 14), 'NOT_EVALUATED', 'Q14 magic');
  assertEqual(verdictOf(r, 15), 'NOT_EVALUATED', 'Q15 magic');
});

test('unavailableSelfReviewAudit: all 20 NOT_EVALUATED, never a clean pass', () => {
  const r = unavailableSelfReviewAudit(10, 10, 'boom');
  assertEqual(r.questions.length, 20, '20 questions');
  assertEqual(r.notEvaluatedCount, 20, 'all NOT_EVALUATED');
  assertEqual(r.failedCount, 0, 'no failures claimed');
  assertEqual(r.complete, false, 'not complete');
  assertEqual(r.cleanPass, false, 'not clean');
  for (const qq of r.questions) {
    assertEqual(qq.verdict, 'NOT_EVALUATED', `Q${qq.number}`);
    assertIncludes(qq.reason, 'boom', 'reason carries the cause');
  }
});

test('Q2 unnamed/uncategorized items: FAIL (inventory incomplete)', () => {
  const items = [makeDedItem({ id: 'q2', name: '  ', category: '' })];
  const r = runSelfReviewAudit({ items, pagesTotal: 1, pagesProcessed: 1 });
  assertEqual(verdictOf(r, 2), 'FAIL', 'Q2');
});

test('Q5 no schedule items: NOT_EVALUATED, never a fabricated schedule claim', () => {
  const items = cleanDedItems().filter((it) => it.id !== 'd4');
  const r = runSelfReviewAudit(cleanInput({ items }));
  assertEqual(verdictOf(r, 5), 'NOT_EVALUATED', 'Q5');
});

// ---------------------------------------------------------------------------
// Q9 — ported semanticClassifier (owner ACC 2026-11-25, file ke-4)
// ---------------------------------------------------------------------------

test('Q9 room label "Kamar Utama" → FAIL (not construction work)', () => {
  const items = cleanDedItems();
  items[0] = { ...items[0], name: 'Kamar Utama', category: '' };
  const r = runSelfReviewAudit(cleanInput({ items, classifyConstructionWork: undefined }));
  assertEqual(verdictOf(r, 9), 'FAIL', 'Q9');
  assertIncludes(q(r, 9).reason, 'Kamar Utama', 'Q9 names the non-work item');
});

test('Q9 unknown text → NOT_EVALUATED, never a fabricated material/work label', () => {
  const items = cleanDedItems();
  items[0] = { ...items[0], name: 'Xyzq wkwk', category: 'OTHER' };
  const r = runSelfReviewAudit(cleanInput({ items, classifyConstructionWork: undefined }));
  assertEqual(verdictOf(r, 9), 'NOT_EVALUATED', 'Q9');
  assertIncludes(q(r, 9).reason, 'tidak dapat diklasifikasi', 'Q9 states the classifier could not decide');
});

test('Q9 caller hook overrides the default classifier', () => {
  const room = cleanDedItems();
  room[0] = { ...room[0], name: 'Kamar Utama', category: '' };
  const overridden = runSelfReviewAudit(
    cleanInput({ items: room, classifyConstructionWork: () => ({ isConstructionWork: true }) }),
  );
  assertEqual(verdictOf(overridden, 9), 'PASS', 'supplied hook wins over the default');
  const forced = runSelfReviewAudit(
    cleanInput({ classifyConstructionWork: () => ({ isConstructionWork: false }) }),
  );
  assertEqual(verdictOf(forced, 9), 'FAIL', 'supplied hook can fail clean items');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== DED SELF-REVIEW AUDIT LIVE: ${passed} passed, ${failed} failed (total ${passed + failed}) ===`);
if (failed > 0) process.exit(1);
