/**
 * CANONICAL GRADE GATE TESTS — Candidate A (DED v2 port, owner-approved 2026-11-24)
 * ================================================================================
 * Regression suite for the live Concrete Grade Gate.
 *
 * Imports from the NEW live module (`../ai-tools/ded-canonical/concreteGradeGate`),
 * NOT from the v2 source. The v2 suite (`gradeMismatchGate.test.ts`) still guards
 * the v2 copy used by the orphaned v2 matcher until retirement.
 *
 * Case map (readiness report §6.1): A1–A13. Gate coverage:
 * - Gate A (claimed code) is tested end-to-end via matchDedItemToAhsp with real
 *   catalog codes (A.1.03.1b.1 = fc'20, RESOLVED; 2.2.1.5.11 = ungraded, RESOLVED).
 * - Gate B (exact title) and Gate C (unique margin) are protected by the SAME
 *   insertion point — both call checkSpecCompatibility (exact-title filter and
 *   evaluateGateC). No live Gate B/C fixture is constructible with real catalog
 *   data: any grade difference also breaks exact-title equality (Gate B), and
 *   graded queries never reach Gate C auto-accept (margin/head-token fail first
 *   — verified by probe). The checkSpecCompatibility-level cases below prove the
 *   veto those gates consume; see LEDGER.md for the code-path proof.
 *
 * Known interaction (NOT a regression): dedCanonicalPricing.src.ts Q.10 pins the
 * OLD gap ("K-225 vs f'c 20 = tidak dibandingkan (batas dokumentasi)"). This port
 * closes exactly that documented limitation, so Q.10 now fails in that suite.
 * The Q.10 assertion itself needs an owner-authorized re-pin (that file is
 * outside this program's 3-file scope). Case 33 below asserts the NEW behavior.
 */

import {
  extractConcreteGrade,
  checkGradeCompatibility,
} from '../ai-tools/ded-canonical/concreteGradeGate';
import {
  checkSpecCompatibility,
  matchDedItemToAhsp,
} from '../ai-tools/ded-canonical/canonicalDedPricing';

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

console.log('\n=== 1. EXTRACTION (live module) ===');

test('1. K-250 → K/250', () => {
  const g = extractConcreteGrade('Kolom beton K-250 cor setempat');
  assertTrue(g !== null, 'Should extract grade');
  assertEqual(g!.system, 'K', 'System');
  assertEqual(g!.value, 250, 'Value');
});

test('2. K250 (no dash) → K/250', () => {
  const g = extractConcreteGrade('Beton K250');
  assertEqual(g!.system, 'K', 'System');
  assertEqual(g!.value, 250, 'Value');
});

test('3. K 250 (space) → K/250', () => {
  const g = extractConcreteGrade('Beton K 250');
  assertEqual(g!.system, 'K', 'System');
  assertEqual(g!.value, 250, 'Value');
});

test('4. k-300 (lowercase) → K/300', () => {
  const g = extractConcreteGrade('beton k-300');
  assertEqual(g!.system, 'K', 'System');
  assertEqual(g!.value, 300, 'Value');
});

test("5. fc'21 WITHOUT MPa suffix → FC/21 (A8 — closes the live regex gap)", () => {
  const g = extractConcreteGrade("Beton fc'21");
  assertTrue(g !== null, 'Should extract grade without MPa suffix');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 21, 'Value');
});

test("6. f'c 21 → FC/21", () => {
  const g = extractConcreteGrade("Beton f'c 21");
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 21, 'Value');
});

test('7. fc 35 → FC/35', () => {
  const g = extractConcreteGrade('Beton fc 35');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 35, 'Value');
});

test("8. fc'35 MPa → FC/35", () => {
  const g = extractConcreteGrade("Beton struktur fc'35 MPa untuk kolom");
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 35, 'Value');
});

test('9. fc’ 35 MPa (Unicode prime U+2019) → FC/35', () => {
  const g = extractConcreteGrade('Beton fc’ 35 MPa');
  assertTrue(g !== null, 'Should extract grade with Unicode prime');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 35, 'Value');
});

test('10. Empty/whitespace input → null, no crash (A10)', () => {
  assertEqual(extractConcreteGrade(''), null, 'Empty string');
  assertEqual(extractConcreteGrade('   '), null, 'Whitespace');
  const r = checkGradeCompatibility('', '');
  assertEqual(r.compatible, true, 'Empty vs empty is compatible');
});

test('11. Both K-250 and fc′21 present → K wins (A11, documented precedence)', () => {
  const g = extractConcreteGrade("Beton K-250 fc'21");
  assertEqual(g!.system, 'K', 'K-first precedence');
  assertEqual(g!.value, 250, 'Value');
});

test('12. Non-concrete items → null (A13)', () => {
  assertEqual(extractConcreteGrade('pasang bata merah'), null, 'Bata merah');
  assertEqual(extractConcreteGrade('cat dinding'), null, 'Cat dinding');
});

console.log('\n=== 2. COMPATIBILITY (standalone helper) ===');

test('13. K-250 vs K-250 → COMPATIBLE', () => {
  const r = checkGradeCompatibility('Kolom beton K-250', 'Beton K-250 untuk kolom');
  assertEqual(r.compatible, true, 'Should be compatible');
});

test('14. Ungraded vs ungraded → COMPATIBLE (rule 1)', () => {
  const r = checkGradeCompatibility('Galian tanah', 'Galian biasa');
  assertEqual(r.compatible, true, 'Should be compatible');
});

test('15. Ungraded DED vs graded catalog → COMPATIBLE (rule 5)', () => {
  // LIMITATION (documented, v2 rule-5 semantics preserved): a DED that does
  // not specify a grade can match a graded catalog item — the candidate is
  // "more specific". The user still reviews the match; the gate only vetoes
  // CONTRADICTIONS, it does not force the DED to state a grade.
  const r = checkGradeCompatibility('Beton untuk kolom', "Beton fc'35");
  assertEqual(r.compatible, true, 'Should be compatible');
});

test('16. K-250 vs fc′21 → GRADE_MISMATCH (no assumed conversion)', () => {
  const r = checkGradeCompatibility('Beton K-250', "Beton fc'21");
  assertEqual(r.compatible, false, 'Should be incompatible (different systems)');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('17. fc′35 vs K-300 → GRADE_MISMATCH', () => {
  const r = checkGradeCompatibility("Beton fc'35", 'Beton K-300');
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('18. K-250 vs K-300 → GRADE_MISMATCH (same-system difference)', () => {
  const r = checkGradeCompatibility('Beton K-250', 'Beton K-300');
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('19. K-250 vs ungraded catalog → NEEDS_REVIEW (rule 4)', () => {
  const r = checkGradeCompatibility('Beton K-250', 'Beton untuk kolom');
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('NEEDS_REVIEW'), 'Reason should mention NEEDS_REVIEW');
});

test("20. fc'21 vs fc'21 → COMPATIBLE", () => {
  const r = checkGradeCompatibility("Beton fc'21", "Beton fc'21 MPa");
  assertEqual(r.compatible, true, 'Should be compatible');
});

test('21. K-250 vs fc′35 → GRADE_MISMATCH (v2 parity)', () => {
  const r = checkGradeCompatibility(
    'Kolom beton K-250 cor setempat',
    "Beton struktur, fc'35 MPa untuk Kolom",
  );
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

console.log('\n=== 3. checkSpecCompatibility INTEGRATION (the gate all three auto-accept paths consume) ===');

test('22. K-250 vs fc′21 → GRADE_MISMATCH: (A4)', () => {
  const c = checkSpecCompatibility('beton K-250', "beton fc'21");
  assertTrue(c !== null, 'Should be a conflict');
  assertTrue(c!.startsWith('GRADE_MISMATCH:'), `Reason should start with GRADE_MISMATCH:, got: ${c}`);
});

test('23. fc′35 vs K-300 → GRADE_MISMATCH: (A5)', () => {
  const c = checkSpecCompatibility("beton fc'35", 'beton K-300');
  assertTrue(c !== null, 'Should be a conflict');
  assertTrue(c!.startsWith('GRADE_MISMATCH:'), `Reason should start with GRADE_MISMATCH:, got: ${c}`);
});

test('24. K-250 vs K-300 → GRADE_MISMATCH: (A6)', () => {
  const c = checkSpecCompatibility('beton K-250', 'beton K-300');
  assertTrue(c !== null, 'Should be a conflict');
  assertTrue(c!.startsWith('GRADE_MISMATCH:'), `Reason should start with GRADE_MISMATCH:, got: ${c}`);
});

test('25. K-250 vs ungraded catalog → NEEDS_REVIEW: (A7)', () => {
  const c = checkSpecCompatibility('beton K-250', 'beton untuk kolom');
  assertTrue(c !== null, 'Should be a conflict');
  assertTrue(c!.startsWith('NEEDS_REVIEW:'), `Reason should start with NEEDS_REVIEW:, got: ${c}`);
});

test("26. fc'21 (no MPa) vs fc'20 MPa → GRADE_MISMATCH: (A8)", () => {
  const c = checkSpecCompatibility("beton fc'21", "beton fc'20 MPa");
  assertTrue(c !== null, 'Should be a conflict');
  assertTrue(c!.startsWith('GRADE_MISMATCH:'), `Reason should start with GRADE_MISMATCH:, got: ${c}`);
});

test('27. K-250 vs K-250 → null (A1)', () => {
  assertEqual(checkSpecCompatibility('beton K-250', 'beton K-250'), null, 'Same grade passes');
});

test('28. Ungraded vs ungraded → null (A2)', () => {
  assertEqual(checkSpecCompatibility('galian tanah', 'galian biasa'), null, 'No grades, no conflict');
});

test('29. Ungraded DED vs K-250 catalog → null (A3, rule 5)', () => {
  assertEqual(checkSpecCompatibility('beton untuk kolom', 'beton K-250'), null, 'Candidate more specific');
});

test('30. Non-concrete → null (A13)', () => {
  assertEqual(checkSpecCompatibility('pasang bata merah', 'pasang bata merah'), null, 'Unaffected');
});

test('31. Empty/whitespace inputs → defined outcome, no crash (A10)', () => {
  assertEqual(checkSpecCompatibility('', ''), null, 'Empty vs empty (rule 1)');
  assertEqual(checkSpecCompatibility('   ', 'beton K-250'), null, 'Whitespace DED vs graded catalog (rule 5)');
  // Graded DED vs empty catalog is rule 4, not a silent pass: the candidate
  // states no grade, so the match needs review. (First draft of this case
  // wrongly expected null here; the rule-4 outcome is the specified one.)
  const c = checkSpecCompatibility('beton K-250', '   ');
  assertTrue(c !== null && c.startsWith('NEEDS_REVIEW:'), `Graded DED vs empty catalog must be NEEDS_REVIEW, got: ${c}`);
});

test('32. Both grades present → K precedence holds at integration level (A11)', () => {
  assertEqual(
    checkSpecCompatibility("beton K-250 fc'21", 'beton K-250'),
    null,
    'K-250 (winning grade) matches K-250 catalog',
  );
  const c = checkSpecCompatibility("beton K-250 fc'21", "beton fc'21");
  assertTrue(c !== null && c.startsWith('GRADE_MISMATCH:'), 'K-250 (winning grade) mismatches fc′21 catalog');
});

test("33. Q.10 SUPERSEDED: K-225 vs f'c 20 → GRADE_MISMATCH (the gap this port closes)", () => {
  const c = checkSpecCompatibility('beton K-225', "beton f'c 20 MPa");
  assertTrue(c !== null, 'Cross-system grades are now compared');
  assertTrue(c!.startsWith('GRADE_MISMATCH:'), `Reason should start with GRADE_MISMATCH:, got: ${c}`);
});

test('34. Existing spec checks preserved (ratio + thickness still fire)', () => {
  const ratio = checkSpecCompatibility('plesteran 1:6', 'plesteran 1SP : 4PP');
  assertTrue(ratio !== null && ratio.includes('rasio'), `Ratio conflict must still fire, got: ${ratio}`);
  const thick = checkSpecCompatibility('plesteran tebal 15 mm', 'plesteran tebal 15 cm');
  assertTrue(thick !== null && thick.includes('tebal'), `Thickness conflict must still fire, got: ${thick}`);
});

console.log('\n=== 4. GATE A END-TO-END (matchDedItemToAhsp, real catalog codes) ===');

test("35. Gate A positive: fc'20 DED + claimed A.1.03.1b.1 (fc'20) → RESOLVED (A1)", () => {
  const m = matchDedItemToAhsp({ name: "beton fc' 20 MPa", unit: 'm3', claimedAhspCode: 'A.1.03.1b.1' });
  assertEqual(m.status, 'RESOLVED', 'Matching grade must still auto-accept');
  assertEqual(m.matchedCode, 'A.1.03.1b.1', 'Matched code');
});

test('36. Gate A veto: K-250 DED + claimed A.1.03.1b.1 (fc′20) → NEEDS_REVIEW + GRADE_MISMATCH (A4)', () => {
  const m = matchDedItemToAhsp({ name: 'beton K-250', unit: 'm3', claimedAhspCode: 'A.1.03.1b.1' });
  assertEqual(m.status, 'NEEDS_REVIEW', 'Cross-system claim must NOT auto-accept');
  assertTrue(m.reason.includes('GRADE_MISMATCH'), `Reason must cite GRADE_MISMATCH, got: ${m.reason}`);
  assertEqual(m.candidates[0]?.code, 'A.1.03.1b.1', 'Claimed code stays first in the review list');
});

test("37. Gate A veto: fc'21 (no MPa) + claimed A.1.03.1b.1 (fc'20) → NEEDS_REVIEW (A8)", () => {
  const m = matchDedItemToAhsp({ name: "beton fc'21", unit: 'm3', claimedAhspCode: 'A.1.03.1b.1' });
  assertEqual(m.status, 'NEEDS_REVIEW', '21 vs 20 must NOT auto-accept');
  assertTrue(m.reason.includes('GRADE_MISMATCH'), `Reason must cite GRADE_MISMATCH, got: ${m.reason}`);
});

test('38. Gate A veto (rule 4): K-250 DED + claimed 2.2.1.5.11 (ungraded) → NEEDS_REVIEW (A7)', () => {
  const m = matchDedItemToAhsp({ name: 'beton K-250', unit: 'm3', claimedAhspCode: '2.2.1.5.11' });
  assertEqual(m.status, 'NEEDS_REVIEW', 'Graded claim on ungraded catalog must NOT auto-accept');
  assertTrue(m.reason.includes('NEEDS_REVIEW'), `Reason must cite NEEDS_REVIEW, got: ${m.reason}`);
  assertEqual(m.candidates[0]?.code, '2.2.1.5.11', 'Claimed code stays first in the review list');
});

test("39. Gate A veto: fc'35 DED + claimed A.1.03.1b.1 (fc'20) → NEEDS_REVIEW (fc'-spelling gap)", () => {
  // Pre-change this SILENTLY RESOLVED: the live fc regex only matches the
  // f'c spelling, not the catalog's dominant fc' spelling.
  const m = matchDedItemToAhsp({ name: "beton fc' 35 MPa", unit: 'm3', claimedAhspCode: 'A.1.03.1b.1' });
  assertEqual(m.status, 'NEEDS_REVIEW', '35 vs 20 must NOT auto-accept');
  assertTrue(m.reason.includes('GRADE_MISMATCH'), `Reason must cite GRADE_MISMATCH, got: ${m.reason}`);
});

console.log('\n=== 5. CANDIDATE VISIBILITY (manual review stays possible) ===');

test('40. Vetoed Gate A match keeps the FULL review list (claimed code first + name candidates)', () => {
  const m = matchDedItemToAhsp({ name: 'beton K-250', unit: 'm3', claimedAhspCode: 'A.1.03.1b.1' });
  assertTrue(m.candidates.length > 1, `Review list must not be filtered, got ${m.candidates.length} candidates`);
  assertEqual(m.candidates[0]?.code, 'A.1.03.1b.1', 'Claimed code first');
});

test('41. Search is unaffected: graded query without a code still lists candidates', () => {
  const m = matchDedItemToAhsp({ name: 'beton K-300', unit: 'm3' });
  assertEqual(m.status, 'NEEDS_REVIEW', 'No auto-accept without a code');
  assertTrue(m.candidates.length > 0, 'Candidates must still be listed for manual review');
});

console.log('\n=== 6. NON-CONCRETE REGRESSION ===');

test('42. Non-concrete match unaffected (no grade mention, no crash)', () => {
  const m = matchDedItemToAhsp({ name: 'pasang keramik lantai', unit: 'm2' });
  assertTrue(m.status === 'RESOLVED' || m.status === 'NEEDS_REVIEW', `Unexpected status: ${m.status}`);
  assertTrue(!m.reason.includes('GRADE_MISMATCH'), 'No grade veto on non-concrete work');
});

test('43. Nonsense query still NO_MATCH (gate invents nothing)', () => {
  const m = matchDedItemToAhsp({ name: 'pekerjaan fiktif tidak ada xyz', unit: 'm2' });
  assertEqual(m.status, 'NO_MATCH', 'Unknown work must not match');
});

console.log('\n=== 7. UNICODE PRIME U+2032 (Task A, Final DED Completion Sprint 2026-11-25) ===');
// NOTE: input strings below use the explicit '\u2032' escape (PRIME) so the
// file unambiguously contains U+2032, not U+2019 (already handled) or ASCII '.
// Before this fix every prime input extracted to null and every prime-vs-prime
// or prime-vs-ASCII comparison silently passed rule 1 ("neither has grade").

test('44. fc\u203235 MPa (Unicode prime) → FC/35', () => {
  const g = extractConcreteGrade('Beton fc\u203235 MPa untuk kolom');
  assertTrue(g !== null, 'Should extract grade with Unicode prime');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 35, 'Value');
});

test('45. f\u2032c21 (prime before c) → FC/21', () => {
  const g = extractConcreteGrade('Beton f\u2032c21');
  assertTrue(g !== null, 'Should extract grade with prime before c');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 21, 'Value');
});

test('46. fc\u2032 35 MPa (prime + space) → FC/35', () => {
  const g = extractConcreteGrade('Beton fc\u2032 35 MPa');
  assertTrue(g !== null, 'Should extract grade with prime + space');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 35, 'Value');
});

test('47. fc\u203221 (prime, no space, no MPa) → FC/21', () => {
  const g = extractConcreteGrade('Beton fc\u203221');
  assertTrue(g !== null, 'Should extract grade without MPa suffix');
  assertEqual(g!.system, 'FC', 'System');
  assertEqual(g!.value, 21, 'Value');
});

test('48. fc\u203235 vs fc\'20 → GRADE_MISMATCH (prime no longer invisible)', () => {
  const r = checkGradeCompatibility('Beton fc\u203235', "Beton fc'20");
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('49. fc\u203221 vs fc\'21 → COMPATIBLE (same value, prime = apostrophe)', () => {
  const r = checkGradeCompatibility('Beton fc\u203221', "Beton fc'21 MPa");
  assertEqual(r.compatible, true, 'Same grade in different spellings must match');
});

test('50. fc\u203221 vs fc\u203221 → COMPATIBLE (prime vs prime)', () => {
  const r = checkGradeCompatibility('Beton fc\u203221', 'Beton fc\u203221 MPa');
  assertEqual(r.compatible, true, 'Same prime grade must match');
});

test('51. Whitespace variants: fc\'  21 (double space) and fc\u2032\t35 (tab) → extracted', () => {
  const g1 = extractConcreteGrade("Beton fc'  21");
  assertTrue(g1 !== null, 'Double space after apostrophe');
  assertEqual(g1!.value, 21, 'Value');
  const g2 = extractConcreteGrade('Beton fc\u2032\t35 MPa');
  assertTrue(g2 !== null, 'Tab after prime');
  assertEqual(g2!.value, 35, 'Value');
});

test('52. ASCII apostrophe pinned: fc\'21 vs fc\'35 → GRADE_MISMATCH (behavior unchanged)', () => {
  const r = checkGradeCompatibility("Beton fc'21", "Beton fc'35");
  assertEqual(r.compatible, false, 'Should be incompatible');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('53. Missing grade on both sides → compatible, no invented grade', () => {
  assertEqual(extractConcreteGrade('pasang bata merah'), null, 'No grade in DED text');
  assertEqual(extractConcreteGrade('beton untuk kolom'), null, 'No grade in catalog text');
  const r = checkGradeCompatibility('pasang bata merah', 'beton untuk kolom');
  assertEqual(r.compatible, true, 'Neither side has a grade (rule 1)');
});

test('54. K-250 vs fc\u203235 → GRADE_MISMATCH (cross-system, prime side)', () => {
  const r = checkGradeCompatibility('Beton K-250', 'Beton fc\u203235');
  assertEqual(r.compatible, false, 'Should be incompatible (different systems)');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('55. K-350 vs fc\u203220 → GRADE_MISMATCH (cross-system, prime side)', () => {
  const r = checkGradeCompatibility('Beton K-350', 'Beton fc\u203220 MPa');
  assertEqual(r.compatible, false, 'Should be incompatible (different systems)');
  assertTrue(r.reason.includes('GRADE_MISMATCH'), 'Reason should mention GRADE_MISMATCH');
});

test('56. checkSpecCompatibility: fc\u203235 vs fc\'20 → GRADE_MISMATCH:', () => {
  const c = checkSpecCompatibility('beton fc\u203235', "beton fc'20 MPa");
  assertTrue(c !== null, 'Should be a conflict');
  assertTrue(c!.startsWith('GRADE_MISMATCH:'), `Reason should start with GRADE_MISMATCH:, got: ${c}`);
});

test('57. checkSpecCompatibility: fc\u203221 vs fc\'21 → null (same grade, mixed spelling)', () => {
  assertEqual(checkSpecCompatibility('beton fc\u203221', "beton fc'21 MPa"), null, 'Same grade passes');
});

test('58. Gate A end-to-end: fc\u2032 35 MPa DED + claimed A.1.03.1b.1 (fc\'20) → NEEDS_REVIEW + GRADE_MISMATCH', () => {
  const m = matchDedItemToAhsp({ name: 'beton fc\u2032 35 MPa', unit: 'm3', claimedAhspCode: 'A.1.03.1b.1' });
  assertEqual(m.status, 'NEEDS_REVIEW', '35 vs 20 must NOT auto-accept');
  assertTrue(m.reason.includes('GRADE_MISMATCH'), `Reason must cite GRADE_MISMATCH, got: ${m.reason}`);
});

console.log(`\n=== CANONICAL GRADE GATE: ${passed} passed, ${failed} failed (total ${passed + failed}) ===`);
if (failed > 0) process.exit(1);
