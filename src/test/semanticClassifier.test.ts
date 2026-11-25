/**
 * SEMANTIC CLASSIFIER — LIVE TESTS (owner ACC 2026-11-25, file ke-4)
 * ============================================================================
 * Ported classifier, run against the NEW live location ONLY
 * (`../ai-tools/ded-ai-estimate/semanticClassifier`) — never from v2.
 *
 * The classifier is deterministic/local (keyword sets + regexes; no
 * network, no LLM). The only v2 dependency was the `DedFact` /
 * `DedEntityType` type import, replaced by local live types.
 *
 * Case map:
 * S1 construction work → CONSTRUCTION_WORK; S2 room labels → ROOM_LABEL;
 * S3 titles → TITLE_HEADER; S4 notes/annotations; S5 reference symbols;
 * S6 unknown text → UNKNOWN (confidence 0.50); S7 empty/whitespace input
 * never crashes; S8 category-hint path; S9 precedence (title beats
 * keyword); S10 K/fc concrete names still route through Candidate A;
 * S11 singleton; S12 reference-type granularity; S13 isConstructionWork
 * helper; S14 classification is deterministic apart from fact IDs
 * (readiness R9 — IDs are Date.now()+random and must never be persisted
 * or compared).
 */

import {
  SemanticClassifier,
  semanticClassifier,
  type SemanticClassificationResult,
} from '../ai-tools/ded-ai-estimate/semanticClassifier';
import { checkGradeCompatibility } from '../ai-tools/ded-canonical/concreteGradeGate';

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

function classify(text: string, category?: string): SemanticClassificationResult {
  return semanticClassifier.classify(text, category);
}

test('S1 construction work keywords → CONSTRUCTION_WORK, RAB-eligible', () => {
  const cases: Array<[string, string?]> = [
    ['Beton kolom K-250'],
    ['Pasangan bata merah'],
    ['Plesteran dinding 1SP : 4PP tebal 15 mm'],
    ['Pemasangan lantai keramik 60x60'],
    ['Pintu kayu panel'],
    ['Plafon gypsum rangka hollow'],
    ['Galian tanah pondasi'],
    ['Bekisting kolom'],
  ];
  for (const [name, category] of cases) {
    const r = classify(name, category);
    assertEqual(r.fact.entityType, 'CONSTRUCTION_WORK', `"${name}" entity`);
    assertEqual(r.isRabEligible, true, `"${name}" eligible`);
    assertEqual(r.rejectReason, undefined, `"${name}" no reject reason`);
  }
});

test('S2 room labels → ROOM_LABEL, never RAB items, contextRoom set', () => {
  for (const name of ['Kamar Utama', 'Kamar Anak', 'KM/WC', 'Ruang Tamu', 'Dapur', 'Teras Depan', 'KM']) {
    const r = classify(name);
    assertEqual(r.fact.entityType, 'ROOM_LABEL', `"${name}" entity`);
    assertEqual(r.isRabEligible, false, `"${name}" not eligible`);
    assertEqual(r.contextRoom, name, `"${name}" context room`);
    assertIncludes(r.rejectReason ?? '', 'ruangan', `"${name}" reason names the room`);
  }
});

test('S3 titles / headers → TITLE_HEADER, never RAB items', () => {
  for (const name of ['Denah Lantai 1', 'Tampak Depan', 'Potongan A-A', 'Rencana Pondasi']) {
    const r = classify(name);
    assertEqual(r.fact.entityType, 'TITLE_HEADER', `"${name}" entity`);
    assertEqual(r.isRabEligible, false, `"${name}" not eligible`);
  }
});

test('S4 notes / annotations → NOTE / ELEVATION / GRID_AXIS, never RAB items', () => {
  assertEqual(classify('Skala 1:100').fact.entityType, 'NOTE', 'scale');
  assertEqual(classify('Catatan: semua ukuran dalam mm').fact.entityType, 'NOTE', 'note');
  assertEqual(classify('Elevasi ±0.00').fact.entityType, 'ELEVATION', 'elevation');
  assertEqual(classify('As A-1').fact.entityType, 'GRID_AXIS', 'grid axis');
});

test('S5 reference symbols → DOOR/WINDOW/STRUCTURAL/DETAIL references, never RAB items', () => {
  assertEqual(classify('P1').fact.entityType, 'DOOR_REFERENCE', 'P1');
  assertEqual(classify('J1').fact.entityType, 'WINDOW_REFERENCE', 'J1');
  assertEqual(classify('K1').fact.entityType, 'STRUCTURAL_REFERENCE', 'K1');
  assertEqual(classify('B1').fact.entityType, 'STRUCTURAL_REFERENCE', 'B1');
  assertEqual(classify('D1').fact.entityType, 'DETAIL_REFERENCE', 'D1');
  for (const sym of ['P1', 'J1', 'K1', 'B1']) {
    assertEqual(classify(sym).isRabEligible, false, `"${sym}" not eligible`);
    assertIncludes(classify(sym).rejectReason ?? '', 'schedule', `"${sym}" reason demands a schedule`);
  }
});

test('S6 unknown text → UNKNOWN, confidence 0.50, never a fabricated label', () => {
  const r = classify('Xyzq wkwk', 'OTHER');
  assertEqual(r.fact.entityType, 'UNKNOWN', 'entity');
  assertEqual(r.isRabEligible, false, 'not eligible');
  assertEqual(r.fact.confidence, 0.5, 'confidence');
  assertIncludes(r.rejectReason ?? '', 'tidak teridentifikasi', 'reason states undecidability');
});

test('S7 empty / whitespace / undefined input → UNKNOWN, never a crash', () => {
  for (const input of ['', '   ', undefined as unknown as string]) {
    const r = classify(input);
    assertEqual(r.fact.entityType, 'UNKNOWN', `input ${JSON.stringify(input)}`);
    assertEqual(r.isRabEligible, false, 'not eligible');
  }
});

test('S8 category hint: unknown text + STRUKTUR → work; + OTHER/UNKNOWN → UNKNOWN', () => {
  assertEqual(classify('Sesuatu tak dikenal', 'STRUKTUR').fact.entityType, 'CONSTRUCTION_WORK', 'hint STRUKTUR');
  assertEqual(classify('Sesuatu tak dikenal', 'OTHER').fact.entityType, 'UNKNOWN', 'hint OTHER decides nothing');
  assertEqual(classify('Sesuatu tak dikenal', 'UNKNOWN').fact.entityType, 'UNKNOWN', 'hint UNKNOWN decides nothing');
  assertEqual(classify('Sesuatu tak dikenal').fact.entityType, 'UNKNOWN', 'no hint decides nothing');
});

test('S9 precedence: title beats keyword ("Detail Pintu" is a header, not work)', () => {
  const r = classify('Detail Pintu');
  assertEqual(r.fact.entityType, 'TITLE_HEADER', 'title precedence');
  assertEqual(r.isRabEligible, false, 'not eligible');
});

test('S10 K/fc concrete names still route through Candidate A unchanged', () => {
  assertEqual(classify('Beton K-250').fact.entityType, 'CONSTRUCTION_WORK', 'K-250 is work');
  assertEqual(classify('Beton fc\' 20 MPa').fact.entityType, 'CONSTRUCTION_WORK', 'fc′20 is work');
  const mismatch = checkGradeCompatibility('beton K-250', 'beton fc\' 20 MPa');
  assertEqual(mismatch.compatible, false, 'K-250 vs fc′20 still mismatches via Candidate A');
  if (mismatch.compatible === false) {
    assertIncludes(mismatch.reason, 'GRADE_MISMATCH', 'mismatch reason');
  }
  assertEqual(checkGradeCompatibility('beton K-250', 'beton K-250').compatible, true, 'same grade still compatible');
});

test('S11 singleton: getInstance() returns the same instance as the export', () => {
  assertTrue(SemanticClassifier.getInstance() === semanticClassifier, 'same instance');
  assertTrue(SemanticClassifier.getInstance() === SemanticClassifier.getInstance(), 'stable across calls');
});

test('S12 reference-type granularity + isRawSymbol semantics', () => {
  assertEqual(semanticClassifier.getReferenceType('P1'), 'DOOR_REFERENCE', 'P1');
  assertEqual(semanticClassifier.getReferenceType('PJ2'), 'DOOR_REFERENCE', 'PJ2');
  assertEqual(semanticClassifier.getReferenceType('BV1'), 'WINDOW_REFERENCE', 'BV1');
  assertEqual(semanticClassifier.getReferenceType('KP3'), 'STRUCTURAL_REFERENCE', 'KP3');
  assertEqual(semanticClassifier.getReferenceType('SL2'), 'STRUCTURAL_REFERENCE', 'SL2');
  assertEqual(semanticClassifier.getReferenceType('X9'), null, 'X9 is not a symbol');
  assertEqual(semanticClassifier.getReferenceType('Beton kolom'), null, 'work text is not a symbol');
  assertTrue(semanticClassifier.isRawSymbol('P1'), 'P1 is a raw symbol');
  assertTrue(semanticClassifier.isRawSymbol('K12a'), 'K12a is a raw symbol');
  assertTrue(!semanticClassifier.isRawSymbol('Beton kolom'), 'work text is not a raw symbol');
  assertTrue(!semanticClassifier.isRawSymbol('Kamar Utama'), 'room label is not a raw symbol');
});

test('S13 isConstructionWork helper: keywords yes, room/title/symbol no', () => {
  assertTrue(semanticClassifier.isConstructionWork('pasangan bata merah'), 'keyword');
  assertTrue(semanticClassifier.isConstructionWork('pintu kayu'), 'keyword');
  assertTrue(!semanticClassifier.isConstructionWork('kamar utama'), 'room label');
  assertTrue(!semanticClassifier.isConstructionWork('denah lantai 1'), 'title');
  assertTrue(!semanticClassifier.isConstructionWork('p1'), 'raw symbol');
  assertTrue(!semanticClassifier.isConstructionWork('xyzq wkwk'), 'unknown text');
});

test('S14 classification is deterministic apart from fact IDs (R9)', () => {
  const a = classify('Beton kolom K-250');
  const b = classify('Beton kolom K-250');
  assertEqual(a.fact.entityType, b.fact.entityType, 'same entity');
  assertEqual(a.isRabEligible, b.isRabEligible, 'same eligibility');
  assertEqual(a.rejectReason, b.rejectReason, 'same reason');
  assertTrue(typeof a.fact.id === 'string' && a.fact.id.length > 0, 'fact id present');
  assertTrue(a.fact.id!.startsWith('FACT-WORK-'), 'fact id prefix');
  // IDs are Date.now()+random by design — never persisted or compared.
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== SEMANTIC CLASSIFIER LIVE: ${passed} passed, ${failed} failed (total ${passed + failed}) ===`);
if (failed > 0) process.exitCode = 1;
