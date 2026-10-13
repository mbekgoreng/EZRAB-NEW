/**
 * GRADE MISMATCH GATE TESTS
 * =========================
 * Verifies that concrete grade mismatches are rejected, not silently matched.
 *
 * Rules:
 * - K-250 must NOT auto-match fc'35 (different grade, different system)
 * - K-250 must NOT auto-match other known different grades
 * - Same grade CAN match if other relevance criteria met
 * - No grade on both sides → previous behavior (allowed)
 * - Non-concrete work unaffected
 */

import { extractConcreteGrade, checkGradeCompatibility } from '../ded-rab-v2/ahsp/concreteGradeGate';

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

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg} (expected ${expected}, got ${actual})`);
  }
}

function assertTrue(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log('\n=== GRADE EXTRACTION ===');

test('Extract K-250', () => {
  const g = extractConcreteGrade('Kolom beton K-250 cor setempat');
  assertTrue(g !== null, 'Should extract grade');
  assertEqual(g!.system, 'K', 'System');
  assertEqual(g!.value, 250, 'Value');
});

test('Extract K250 (no dash)', () => {
  const g = extractConcreteGrade('Beton K250');
  assertEqual(g!.system, 'K', 'System');
  assertEqual(g!.value, 250, 'Value');
});

test("Extract fc'35", () => {
  const g = extractConcreteGrade("Beton struktur fc'35 MPa untuk kolom");
  assertTrue(g !== null, 'Should extract grade');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 35, 'Value');
});

test("Extract fc' 21 with space", () => {
  const g = extractConcreteGrade("Beton fc' 21 MPa");
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 21, 'Value');
});

test('No grade returns null', () => {
  const g = extractConcreteGrade('Galian tanah biasa');
  assertEqual(g, null, 'Should be null');
});

console.log('\n=== GRADE COMPATIBILITY ===');

test('K-250 vs fc35 → MISMATCH', () => {
  const r = checkGradeCompatibility(
    'Kolom beton K-250 cor setempat',
    "Beton struktur, fc'35 MPa untuk Kolom"
  );
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('K-250 vs K-300 → MISMATCH', () => {
  const r = checkGradeCompatibility('Beton K-250', 'Beton K-300');
  assertEqual(r.compatible, false, 'Should be incompatible');
});

test('K-250 vs K-250 → COMPATIBLE', () => {
  const r = checkGradeCompatibility('Kolom beton K-250', 'Beton K-250 untuk kolom');
  assertEqual(r.compatible, true, 'Should be compatible');
});

test("fc'21 vs fc'21 → COMPATIBLE", () => {
  const r = checkGradeCompatibility("Beton fc'21", "Beton fc'21 MPa");
  assertEqual(r.compatible, true, 'Should be compatible');
});

test('K-250 vs fc21 → MISMATCH (no assumed conversion)', () => {
  // Per user decision: K-250 NOT assumed equivalent to fc'21
  const r = checkGradeCompatibility('Beton K-250', "Beton fc'21");
  assertEqual(r.compatible, false, 'Should be incompatible (different systems)');
});

test('No grade both sides → COMPATIBLE', () => {
  const r = checkGradeCompatibility('Galian tanah', 'Galian biasa');
  assertEqual(r.compatible, true, 'Should be compatible');
});

test('Input has grade, candidate none → NEEDS_REVIEW', () => {
  const r = checkGradeCompatibility('Beton K-250', 'Beton untuk kolom');
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('NEEDS_REVIEW'), 'Reason should mention NEEDS_REVIEW');
});

test('Input no grade, candidate has grade → COMPATIBLE', () => {
  const r = checkGradeCompatibility('Beton untuk kolom', "Beton fc'35");
  assertEqual(r.compatible, true, 'Should be compatible');
});

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
