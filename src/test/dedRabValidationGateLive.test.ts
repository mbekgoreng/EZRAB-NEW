/**
 * DED RAB VALIDATION GATE — LIVE TESTS (Phase B, owner-approved 2026-11-25)
 * ============================================================================
 * Ported gate, run against the NEW live location ONLY
 * (`../ai-tools/ded-ai-estimate/dedRabValidationGate`) — never from v2.
 *
 * Case map (readiness report §6.2): B1–B24, plus B25–B32 for the owner
 * supplement's test minimums (2026-11-25 11:40) that have no §6.2
 * equivalent. Gate numbering is the report's (`gatesBreakdown` array);
 * the supplement's "Gate 7" = quantity determinism = report Gates 3+12.
 *
 * Minimums (supplement §2) → cases:
 * (a) DB-backed valid evidence → B1; (b) DB-backed missing price → B9;
 * (c) AI item no AHSP → B15; (d) AI item estimated price → B15/B16/B17;
 * (e) unknown semantic classification → B19; (f) non-applicable
 * classification → B30; (g) invalid/unknown unit conversion → B7/B31;
 * (h) qty > 0 without formula → B25; (i) qty with verified provenance
 * → B26; (j) grade mismatch via Candidate A → B6; (k) valid grade →
 * B27; (l) invalid breakdown → B28; (m) empty breakdown → B29;
 * (n) missing required evidence → B13; (o) no READY/VERIFIED laundering
 * → B15/B17; (p) no persistence/financial mutation → B32.
 *
 * B22 (the 6 existing v2-gate suites stay green) and B24 (golden totals
 * unchanged) are verified by re-running those suites, not inside this
 * file — see PHASE-B-NOTE.md. B22's in-file case asserts the ported
 * module is independent of v2 (no ded-rab-v2 import) and imports the
 * LIVE classifier (`./semanticClassifier`, owner ACC 2026-11-25).
 *
 * Gate 1 cases (classifier port, 2026-11-25): B19 (work → PASS, UNKNOWN →
 * NOT_EVALUATED), B33–B38 (room/title/symbol → FAIL, concrete → PASS,
 * category hint, Magic AI).
 */

import { readFileSync } from 'node:fs';
import {
  validateDedRabItem,
  validateDedAiItem,
  validateFullAiItem,
  validateMagicAiItem,
  type GateItemInput,
} from '../ai-tools/ded-ai-estimate/dedRabValidationGate';
import { validateDedFinalizeBatch } from '../ai-tools/ded-ai-estimate/dedFinalizeValidation';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';
import type { AiEstimateWorkItem } from '../ai-estimate/types';
import type { CanonicalDedMatch } from '../ai-tools/ded-canonical/canonicalDedPricing';

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

function gate(res: { gates: Array<{ gate: number; status: string; severity: string; reason: string }> }, n: number) {
  const g = res.gates.find((x) => x.gate === n);
  if (!g) throw new Error(`gate ${n} missing from result`);
  return g;
}

// ---------------------------------------------------------------------------
// Fixtures (real catalog code 3.7.4 = "Pemasangan 1 m2 plesteran 1SP : 4PP
// tebal 15 mm", unit m2 — verified official via hasOfficialAhsp).
// ---------------------------------------------------------------------------

function resolvedMatch(over: Partial<CanonicalDedMatch> = {}): CanonicalDedMatch {
  return {
    status: 'RESOLVED',
    matchedCode: '3.7.4',
    matchedName: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm',
    unitPrice: 50000,
    unit: 'm2',
    sourceDocument: 'SE DJBK No. 47/SE/Dk/2026',
    period: '2026',
    candidates: [],
    reason: 'RESOLVED',
    missingComponents: [],
    resolutionPath: ['code'],
    ...over,
  };
}

function baseDedAi(over: Partial<DedAiItem> = {}): DedAiItem {
  return {
    id: 'ded-1',
    name: 'Plesteran dinding 1SP : 4PP tebal 15 mm',
    category: 'Pekerjaan Plesteran',
    specification: 'Plesteran 1SP : 4PP tebal 15 mm',
    units: 'm2',
    quantity: 10,
    quantitySource: 'DED_GEOMETRIC',
    quantityFormula: '10 m2 (dinding 5 m x 2 m)',
    unitPrice: 50000,
    priceSource: 'AHSP_2026',
    ahspCode: '3.7.4',
    ahspMatch: resolvedMatch(),
    subtotal: 500000,
    sourcePages: [1],
    sourceEvidence: 'hal 1, dinding ruang tamu',
    provenance: ['DED'],
    stage: 'CALCULATED',
    ...over,
  };
}

function baseFullAi(over: Partial<FullAiItem> = {}): FullAiItem {
  return {
    id: 'full-1',
    no: 1,
    name: 'Plesteran dinding 1SP : 4PP tebal 15 mm',
    category: 'Pekerjaan Plesteran',
    description: 'Plesteran 1SP : 4PP tebal 15 mm',
    quantity: {
      value: 10,
      unit: 'm2',
      formula: '10 m2 (dinding 5 m x 2 m)',
      provenance: 'DERIVED',
      confidence: 'HIGH',
    },
    price: {
      unitPrice: 50000,
      unit: 'm2',
      source: 'AHSP_2026',
      ahspCode: '3.7.4',
      ahspMatch: resolvedMatch(),
    },
    subtotal: 500000,
    subtotalVerified: true,
    status: 'READY',
    exclusionReason: null,
    sourcePages: [1],
    visionEvidence: [
      { page: 1, bbox: { x: 100, y: 100, width: 200, height: 40 }, label: 'plesteran', kind: 'text', confidence: 0.9, status: 'VERIFIED' },
    ],
    ...over,
  };
}

function baseMagic(over: Partial<AiEstimateWorkItem> = {}): AiEstimateWorkItem {
  return {
    id: 'magic-1',
    category: 'Pekerjaan Plesteran',
    workName: 'Plesteran dinding',
    specification: 'Plesteran 1SP : 4PP tebal 15 mm',
    quantity: 10,
    unit: 'm2',
    unitPrice: 45000,
    subtotal: 450000,
    quantitySource: 'DED_GEOMETRIC',
    priceSource: 'AI_ESTIMATE',
    confidence: 'MEDIUM',
    sourcePages: [1],
    sourceEvidence: 'hal 1',
    formula: '10 m2 (dinding 5 m x 2 m)',
    assumptions: [],
    warnings: [],
    ...over,
  };
}

const TARGET = { targetAhspVersion: '2026.1' };

// ---------------------------------------------------------------------------
// B1–B24 (§6.2)
// ---------------------------------------------------------------------------

test('B1 (positive) fully valid official DedAiItem → all evaluated gates PASS, READY', () => {
  const res = validateDedAiItem(baseDedAi(), 'DATABASE', TARGET);
  assertEqual(res.gates.filter((g) => g.status === 'FAIL').length, 0, 'no gate may FAIL');
  assertEqual(res.rabEligible, true, 'rabEligible');
  assertEqual(res.validationStatus, 'READY', 'status');
  assertEqual(res.confidenceRating, 'HIGH', 'confidence');
  assertEqual(res.provenance.priceVerification.verified, true, 'verified for AHSP_2026');
  assertEqual(gate(res, 6).status, 'PASS', 'gate 6');
  assertEqual(gate(res, 8).status, 'PASS', 'gate 8');
  assertEqual(gate(res, 12).status, 'PASS', 'gate 12 (formula present)');
  assertEqual(res.assumptionLabeled, false, 'no assumption flag');
});

test('B1-full (positive) same item as FullAiItem → READY via adapter', () => {
  const res = validateFullAiItem(baseFullAi(), 'DATABASE', TARGET);
  assertEqual(res.gates.filter((g) => g.status === 'FAIL').length, 0, 'no gate may FAIL');
  assertEqual(res.rabEligible, true, 'rabEligible');
  assertEqual(res.validationStatus, 'READY', 'status');
  assertEqual(res.provenance.priceVerification.verified, true, 'verified');
});

test('B2 (negative) AI-CUSTOM code → Gate 5 BLOCKING FAIL, not eligible', () => {
  const item = baseDedAi({
    ahspCode: 'AI-CUSTOM-123',
    ahspMatch: resolvedMatch({ matchedCode: 'AI-CUSTOM-123', matchedName: 'Sintetis AI' }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 5).status, 'FAIL', 'gate 5');
  assertEqual(gate(res, 5).severity, 'BLOCKING', 'gate 5 severity');
  assertEqual(res.rabEligible, false, 'rabEligible');
});

test('B3 (negative) AMBIGUOUS multiple candidates → Gate 5 BLOCKING FAIL, AMBIGUOUS', () => {
  const item = baseDedAi({
    ahspCode: undefined,
    ahspMatch: resolvedMatch({
      status: 'NEEDS_REVIEW',
      matchedCode: undefined,
      matchedName: undefined,
      candidates: [
        { code: '3.7.4', name: 'Plesteran A', unit: 'm2', score: 90, unitExact: true, canonicalPrice: 50000, priceStatus: 'FULL', missingComponents: [] },
        { code: '3.7.5', name: 'Plesteran B', unit: 'm2', score: 88, unitExact: true, canonicalPrice: 52000, priceStatus: 'FULL', missingComponents: [] },
      ],
    }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 5).status, 'FAIL', 'gate 5');
  assertEqual(gate(res, 5).severity, 'BLOCKING', 'gate 5 severity');
  assertEqual(res.validationStatus, 'AMBIGUOUS', 'status');
  assertEqual(res.rabEligible, false, 'rabEligible');
});

test('B4 (negative) code not in official catalog → Gate 6 BLOCKING FAIL', () => {
  const item = baseDedAi({
    ahspCode: '9.9.9.9',
    ahspMatch: resolvedMatch({ matchedCode: '9.9.9.9', matchedName: 'Pekerjaan fiktif' }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 6).status, 'FAIL', 'gate 6');
  assertEqual(gate(res, 6).severity, 'BLOCKING', 'gate 6 severity');
  assertEqual(res.validationStatus, 'MISSING_AHSP', 'status');
  assertEqual(res.rabEligible, false, 'rabEligible');
  assertEqual(res.provenance.priceVerification.verified, false, 'not verified');
});

test('B5 (negative) bata merah vs bata ringan → Gate 8 BLOCKING FAIL', () => {
  const item = baseDedAi({
    name: 'Pasangan dinding bata merah',
    specification: 'Dinding bata merah 1/2 bata',
    ahspMatch: resolvedMatch({ matchedName: 'Pemasangan 1 m2 pasangan bata ringan' }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 8).status, 'FAIL', 'gate 8');
  assertEqual(gate(res, 8).severity, 'BLOCKING', 'gate 8 severity');
  assertTrue(gate(res, 8).reason.includes('Bata Merah'), 'reason names bata merah');
  assertEqual(res.validationStatus, 'SPECIFICATION_MISMATCH', 'status');
});

test('B6 (negative) K-250 vs K-350 via Candidate A → Gate 8 BLOCKING FAIL, GRADE_MISMATCH', () => {
  const item = baseDedAi({
    name: 'Beton bertulang K-250',
    specification: 'Beton K-250',
    units: 'm3',
    quantity: 5,
    quantityFormula: '5 m3',
    unitPrice: 1000000,
    subtotal: 5000000,
    ahspMatch: resolvedMatch({
      matchedCode: '3.7.4',
      matchedName: 'Beton bertulang K-350',
      unit: 'm3',
    }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 8).status, 'FAIL', 'gate 8');
  assertEqual(gate(res, 8).severity, 'BLOCKING', 'gate 8 severity');
  assertTrue(gate(res, 8).reason.includes('GRADE_MISMATCH'), 'reason is GRADE_MISMATCH');
  assertEqual(res.rabEligible, false, 'rabEligible');
});

test('B7 (negative) unit m3 vs AHSP m2 → Gate 4 BLOCKING FAIL', () => {
  const item = baseDedAi({
    name: 'Beton sloof',
    units: 'm3',
    quantity: 5,
    quantityFormula: '5 m3',
    unitPrice: 1000000,
    subtotal: 5000000,
    ahspMatch: resolvedMatch({ unit: 'm2' }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 4).status, 'FAIL', 'gate 4');
  assertEqual(gate(res, 4).severity, 'BLOCKING', 'gate 4 severity');
  assertEqual(res.validationStatus, 'UNIT_MISMATCH', 'status');
});

test('B8 (negative) quantity null / 0 / negative → Gate 3 FAIL, BLOCKING in DATABASE', () => {
  for (const q of [null, 0, -5]) {
    const res = validateDedAiItem(baseDedAi({ quantity: q, subtotal: q == null ? null : 0 }), 'DATABASE', TARGET);
    assertEqual(gate(res, 3).status, 'FAIL', `gate 3 qty=${q}`);
    assertEqual(gate(res, 3).severity, 'BLOCKING', `gate 3 severity qty=${q}`);
    assertEqual(res.rabEligible, false, `rabEligible qty=${q}`);
    assertEqual(res.validationStatus, 'MISSING_QUANTITY', `status qty=${q}`);
  }
  const fullAi = validateDedAiItem(baseDedAi({ quantity: null, subtotal: null }), 'FULL_AI', TARGET);
  assertEqual(gate(fullAi, 3).status, 'FAIL', 'FULL_AI gate 3 still FAIL');
  assertEqual(gate(fullAi, 3).severity, 'WARNING', 'FULL_AI gate 3 is WARNING, not BLOCKING');
});

test('B9 (negative) unitPrice null / 0 / negative → Gate 11 BLOCKING FAIL, Gate 12 FAIL', () => {
  for (const p of [null, 0, -100]) {
    const res = validateDedAiItem(baseDedAi({ unitPrice: p, subtotal: null }), 'DATABASE', TARGET);
    assertEqual(gate(res, 11).status, 'FAIL', `gate 11 price=${p}`);
    assertEqual(gate(res, 11).severity, 'BLOCKING', `gate 11 severity price=${p}`);
    assertEqual(gate(res, 12).status, 'FAIL', `gate 12 price=${p}`);
    assertEqual(res.validationStatus, 'MISSING_PRICE', `status price=${p}`);
  }
});

test('B10 (negative) stale subtotal (qty x price mismatch) → Gate 12 FAIL', () => {
  const res = validateDedAiItem(baseDedAi({ subtotal: 400000 }), 'DATABASE', TARGET);
  assertEqual(gate(res, 12).status, 'FAIL', 'gate 12');
  assertTrue(gate(res, 12).reason.includes('tidak konsisten'), 'reason notes inconsistency');
});

test('B11 (boundary) quantity 0.001 → Gate 3 PASS (positivity only)', () => {
  const res = validateDedAiItem(
    baseDedAi({ quantity: 0.001, subtotal: 50, quantityFormula: '0.001 m2' }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(res, 3).status, 'PASS', 'gate 3');
});

test('B12 (boundary) price exactly Rp100 → Gate 11 PASS', () => {
  const res = validateDedAiItem(
    baseDedAi({ unitPrice: 100, subtotal: 1000 }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(res, 11).status, 'PASS', 'gate 11');
});

test('B13 (missing-data) no sourcePages / no evidence → Gate 2 WARNING FAIL, still eligible', () => {
  const res = validateDedAiItem(
    baseDedAi({ sourcePages: [], sourceEvidence: undefined }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(res, 2).status, 'FAIL', 'gate 2');
  assertEqual(gate(res, 2).severity, 'WARNING', 'gate 2 severity');
  assertEqual(res.rabEligible, true, 'WARNING does not block eligibility');
  assertEqual(res.validationStatus, 'NEEDS_REVIEW', 'status');
});

test('B14 (missing-data) official item with missingComponents → Gates 9/10 WARNING FAIL', () => {
  const item = baseDedAi({
    ahspMatch: resolvedMatch({
      missingComponents: [{ type: 'material', code: 'M-SEMEN', name: 'Semen Portland', unit: 'kg' }],
    }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 9).status, 'FAIL', 'gate 9');
  assertEqual(gate(res, 9).severity, 'WARNING', 'gate 9 severity');
  assertEqual(gate(res, 10).status, 'FAIL', 'gate 10');
  assertEqual(gate(res, 10).severity, 'WARNING', 'gate 10 severity');
  assertEqual(res.rabEligible, true, 'WARNING does not block eligibility');
  assertEqual(res.validationStatus, 'COMPONENT_MISSING', 'status');
});

test('B15 (contradictory) AI price + no AHSP, DATABASE → Gate 6 BLOCKING FAIL, no laundering', () => {
  const item = baseDedAi({
    priceSource: 'AI_ESTIMATE',
    ahspCode: undefined,
    ahspMatch: undefined,
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 6).status, 'FAIL', 'gate 6');
  assertEqual(gate(res, 6).severity, 'BLOCKING', 'gate 6 severity');
  assertEqual(res.validationStatus, 'MISSING_AHSP', 'status');
  assertEqual(res.rabEligible, false, 'rabEligible');
  assertEqual(res.provenance.priceVerification.verified, false, 'never verified');
  assertEqual(res.assumptionLabeled, false, 'no assumption flag in DATABASE mode');
});

test('B16 (contradictory) same item, FULL_AI → labeled assumption only, never plain READY', () => {
  const item = baseDedAi({
    priceSource: 'AI_ESTIMATE',
    ahspCode: undefined,
    ahspMatch: undefined,
  });
  const res = validateDedAiItem(item, 'FULL_AI', TARGET);
  assertEqual(gate(res, 6).status, 'PASS', 'gate 6 passes in FULL_AI');
  assertEqual(res.assumptionLabeled, true, 'assumption flag set');
  assertTrue((res.assumptionNote ?? '').includes('ASUMSI'), 'assumption note present');
  assertEqual(res.provenance.priceVerification.verified, false, 'verified stays false');
  assertEqual(res.rabEligible, true, 'rabEligible true with assumption');
  assertEqual(res.validationStatus, 'READY', 'status READY only together with the flag');
  assertEqual(res.confidenceRating, 'MEDIUM', 'assumption caps confidence at MEDIUM');
});

test('B17 (contradictory) verified=false for AI-estimate price; true only for AHSP_2026', () => {
  const ai = validateDedAiItem(
    baseDedAi({ priceSource: 'AI_ESTIMATE', ahspCode: undefined, ahspMatch: undefined }),
    'FULL_AI',
    TARGET,
  );
  assertEqual(ai.provenance.priceVerification.verified, false, 'AI_ESTIMATE never verified');
  const official = validateDedAiItem(baseDedAi(), 'DATABASE', TARGET);
  assertEqual(official.provenance.priceVerification.verified, true, 'AHSP_2026 verified');
  const user = validateDedAiItem(baseDedAi({ priceSource: 'USER_INPUT' }), 'DATABASE', TARGET);
  assertEqual(user.provenance.priceVerification.verified, false, 'USER_INPUT never verified');
});

test('B18 (missing-data) Magic AI item → AHSP gates NOT_APPLICABLE, others still evaluate', () => {
  const res = validateMagicAiItem(baseMagic(), 'FULL_AI', TARGET);
  for (const n of [5, 6, 7, 9, 10]) {
    assertEqual(gate(res, n).status, 'NOT_APPLICABLE', `gate ${n} NOT_APPLICABLE`);
  }
  for (const n of [1, 2, 3, 4, 11, 12, 13]) {
    assertTrue(
      gate(res, n).status !== 'NOT_APPLICABLE',
      `gate ${n} must still evaluate (got ${gate(res, n).status})`,
    );
  }
  assertEqual(gate(res, 3).status, 'PASS', 'gate 3 PASS');
  assertEqual(gate(res, 11).status, 'PASS', 'gate 11 PASS');
  assertEqual(gate(res, 13).status, 'PASS', 'gate 13 PASS (warnings present, none critical)');
  assertEqual(res.provenance.priceVerification.verified, false, 'AI price never verified');
});

test('B19 (missing-data) Gate 1 with ported classifier: work → PASS; UNKNOWN → NOT_EVALUATED', () => {
  const clean = validateDedAiItem(baseDedAi(), 'DATABASE', TARGET);
  assertEqual(gate(clean, 1).status, 'PASS', 'construction work passes gate 1');
  assertTrue(gate(clean, 1).reason.includes('CONSTRUCTION_WORK'), 'reason names the entity type');
  const unknown = validateDedAiItem(
    baseDedAi({ name: 'Xyzq wkwk', category: 'OTHER' }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(unknown, 1).status, 'NOT_EVALUATED', 'undecidable input is NOT_EVALUATED, never fabricated');
  assertTrue(gate(unknown, 1).reason.includes('tidak teridentifikasi'), 'reason is the classifier’s own uncertainty');
});

test('B20 (missing-data) Gate 7 with no target version → NOT_EVALUATED, never PASS', () => {
  const noTarget = validateDedAiItem(baseDedAi(), 'DATABASE');
  assertEqual(gate(noTarget, 7).status, 'NOT_EVALUATED', 'gate 7 without target');
  const withTarget = validateDedAiItem(baseDedAi(), 'DATABASE', TARGET);
  assertEqual(gate(withTarget, 7).status, 'PASS', 'gate 7 passes with matching target');
  const mismatch = validateDedAiItem(
    baseDedAi({ ahspMatch: resolvedMatch({ period: '2020' }) }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(mismatch, 7).status, 'FAIL', 'gate 7 fails on version mismatch');
});

test('B21 (missing-data) Gate 13 on DedAiItem maps to quantityReview / stage', () => {
  const none = validateDedAiItem(baseDedAi(), 'DATABASE', TARGET);
  assertEqual(gate(none, 13).status, 'NOT_EVALUATED', 'no signal → NOT_EVALUATED');
  const high = validateDedAiItem(
    baseDedAi({ quantityReview: { outcome: 'NEEDS_REVIEW', reasonCode: 'SCALE', explanation: 'x', severity: 'HIGH', originalQuantity: 10 } }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(high, 13).status, 'FAIL', 'HIGH severity → FAIL');
  const rejected = validateDedAiItem(baseDedAi({ stage: 'REJECTED' }), 'DATABASE', TARGET);
  assertEqual(gate(rejected, 13).status, 'FAIL', 'REJECTED stage → FAIL');
});

test('B22 (regression) ported gate is independent of v2 — no ded-rab-v2 import; imports the LIVE classifier', () => {
  const src = readFileSync(new URL('../ai-tools/ded-ai-estimate/dedRabValidationGate.ts', import.meta.url), 'utf8');
  const importLines = src.split('\n').filter((l) => /^\s*import[\s(]/.test(l));
  assertTrue(!importLines.some((l) => l.includes('ded-rab-v2')), 'must not import from ded-rab-v2');
  assertTrue(importLines.some((l) => l.includes('./semanticClassifier')), 'must import the LIVE semanticClassifier');
  assertTrue(!importLines.some((l) => l.includes('ded-rab-v2/semantic') || l.includes('ded-rab-v3/semantic')), 'must not import a v2/v3 classifier');
  assertTrue(src.includes('checkGradeCompatibility'), 'must delegate grade checks to Candidate A');
  // The 6 existing v2-gate suites are re-run outside this file; see PHASE-B-NOTE.md.
});

test('B23 (consumer compat) validateDedFinalizeBatch: shape unchanged + additive gate counts only', () => {
  const clean = validateDedFinalizeBatch([baseDedAi()], 'DATABASE');
  assertEqual(clean.ok, true, 'clean batch still ok');
  assertEqual(clean.savable.length, 1, 'savable');
  assertEqual(clean.gateBlockingItemCount, 0, 'no blocking gate items');
  assertEqual(clean.gateBlockingItems.length, 0, 'empty blocking list');
  const aiItem = baseDedAi({
    id: 'ded-ai',
    priceSource: 'AI_ESTIMATE',
    ahspCode: undefined,
    ahspMatch: undefined,
  });
  const mixed = validateDedFinalizeBatch([baseDedAi(), aiItem], 'DATABASE');
  assertEqual(mixed.ok, true, 'advisory gate does NOT change ok (savable semantics untouched)');
  assertEqual(mixed.gateBlockingItemCount, 1, 'one blocking gate item listed');
  assertEqual(mixed.gateBlockingItems[0].itemId, 'ded-ai', 'blocking item id');
  assertTrue(mixed.gateBlockingItems[0].failures.length > 0, 'blocking reasons listed');
  assertTrue(mixed.gateBlockingItems[0].failures[0].includes('Gate 6'), 'reason names Gate 6');
  assertEqual(mixed.savable.length, 2, 'savable list unchanged');
});

test('B24 (consumer compat) gate annotations never change finalize mapping or totals', () => {
  const items = [baseDedAi(), baseDedAi({ id: 'ded-2', quantity: 2, subtotal: 100000 })];
  const before = JSON.stringify(items.map((it) => it.subtotal));
  const v = validateDedFinalizeBatch(items, 'DATABASE');
  const total = v.mapped.reduce((s, r) => s + r.volume * r.unitPrice, 0);
  assertEqual(total, 600000, 'mapped total unchanged by gate');
  assertEqual(JSON.stringify(items.map((it) => it.subtotal)), before, 'items untouched');
  // Golden totals are re-run outside this file; see PHASE-B-NOTE.md.
});

// ---------------------------------------------------------------------------
// B25–B32 (supplement minimums without a §6.2 equivalent)
// ---------------------------------------------------------------------------

test('B25 (h) quantity > 0 without formula evidence → Gate 3 PASS, Gate 12 NOT_EVALUATED', () => {
  const res = validateDedAiItem(
    baseDedAi({ quantityFormula: undefined, derivation: undefined }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(res, 3).status, 'PASS', 'gate 3 positivity only');
  assertEqual(gate(res, 12).status, 'NOT_EVALUATED', 'gate 12 needs provenance, not just >0');
  assertTrue(gate(res, 12).reason.includes('provenance'), 'reason names provenance');
});

test('B26 (i) quantity with verified calculation provenance → Gate 12 PASS; rejected derivation → FAIL', () => {
  const ok = validateDedAiItem(
    baseDedAi({
      derivation: {
        formulaType: 'kolom_volume',
        inputs: [{ name: 'lebar', value: 5, unit: 'm', source: 'DED' }],
        result: 10,
        resultUnit: 'm2',
        validationStatus: 'ok',
      },
    }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(ok, 12).status, 'PASS', 'gate 12 with verified derivation');
  const rejected = validateDedAiItem(
    baseDedAi({
      derivation: {
        formulaType: 'kolom_volume',
        inputs: [],
        result: null,
        resultUnit: 'm2',
        validationStatus: 'rejected: dimensi tidak lengkap',
      },
    }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(rejected, 12).status, 'FAIL', 'rejected derivation → FAIL');
});

test('B27 (k) valid concrete grade K-250 vs K-250 → Gate 8 PASS', () => {
  const item = baseDedAi({
    name: 'Beton bertulang K-250',
    specification: 'Beton K-250',
    units: 'm3',
    quantity: 5,
    quantityFormula: '5 m3',
    unitPrice: 1000000,
    subtotal: 5000000,
    ahspMatch: resolvedMatch({ matchedName: 'Beton bertulang K-250', unit: 'm3' }),
  });
  const res = validateDedAiItem(item, 'DATABASE', TARGET);
  assertEqual(gate(res, 8).status, 'PASS', 'gate 8');
});

test('B28 (l) invalid breakdown → Gate 9 FAIL (malformed entries; RESOLVED + missing = inconsistent)', () => {
  const malformed = validateDedAiItem(
    baseDedAi({
      ahspMatch: resolvedMatch({
        missingComponents: [{ type: 'material', code: '', name: '', unit: 'kg' }],
      }),
    }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(malformed, 9).status, 'FAIL', 'malformed breakdown → FAIL');
  assertTrue(gate(malformed, 9).reason.includes('tidak valid'), 'reason flags invalid data');
  const inconsistent = validateDedAiItem(
    baseDedAi({
      ahspMatch: resolvedMatch({
        missingComponents: [{ type: 'material', code: 'M-SEMEN', name: 'Semen Portland', unit: 'kg' }],
      }),
    }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(inconsistent, 9).status, 'FAIL', 'RESOLVED + missing → FAIL');
  assertTrue(gate(inconsistent, 9).reason.includes('tidak konsisten'), 'reason flags inconsistency');
});

test('B29 (m) empty breakdown (match without breakdown data) → Gate 9 NOT_EVALUATED, never invented', () => {
  const input: GateItemInput = {
    name: 'Plesteran dinding',
    category: 'Pekerjaan Plesteran',
    unit: 'm2',
    quantity: 10,
    quantitySource: 'DED_GEOMETRIC',
    ahspCode: '3.7.4',
    ahspMatch: resolvedMatch(),
    unitPrice: 50000,
    priceSource: 'AHSP_2026',
    subtotal: 500000,
    sourcePages: [1],
    evidence: ['hal 1'],
    missingComponents: undefined,
    policy: 'DATABASE',
    hasAhspFields: true,
    quantityFormula: '10 m2',
  };
  const res = validateDedRabItem(input, TARGET);
  assertEqual(gate(res, 9).status, 'NOT_EVALUATED', 'gate 9');
  assertEqual(gate(res, 10).status, 'NOT_EVALUATED', 'gate 10');
});

test('B30 (f) non-applicable classification (blank name) → Gate 1 NOT_APPLICABLE', () => {
  const input: GateItemInput = {
    name: '',
    category: '',
    unit: 'm2',
    quantity: 1,
    quantitySource: 'DED_EXPLICIT',
    unitPrice: 100,
    priceSource: 'UNRESOLVED',
    subtotal: 100,
    sourcePages: [],
    evidence: [],
    policy: 'DATABASE',
    hasAhspFields: true,
  };
  const res = validateDedRabItem(input, TARGET);
  assertEqual(gate(res, 1).status, 'NOT_APPLICABLE', 'gate 1');
});

test('B31 (g) invalid/unknown unit conversion → m2 vs m FAIL (allowance dropped); blank unit NOT_EVALUATED', () => {
  const cross = validateDedAiItem(
    baseDedAi({ ahspMatch: resolvedMatch({ unit: 'm' }) }),
    'DATABASE',
    TARGET,
  );
  assertEqual(gate(cross, 4).status, 'FAIL', 'm2 vs m must FAIL — no m²↔m allowance');
  assertEqual(gate(cross, 4).severity, 'BLOCKING', 'blocking');
  const blank = validateDedAiItem(baseDedAi({ units: '' }), 'DATABASE', TARGET);
  assertEqual(gate(blank, 4).status, 'NOT_EVALUATED', 'blank unit → NOT_EVALUATED');
});

test('B32 (p) gate run changes no stored data and no totals (no persistence/financial mutation)', () => {
  const ded = baseDedAi();
  const full = baseFullAi();
  const magic = baseMagic();
  const before = JSON.stringify([ded, full, magic]);
  const totalBefore = (ded.subtotal ?? 0) + (full.subtotal ?? 0) + (magic.subtotal ?? 0);
  validateDedAiItem(ded, 'DATABASE', TARGET);
  validateFullAiItem(full, 'DATABASE', TARGET);
  validateMagicAiItem(magic, 'FULL_AI', TARGET);
  validateDedFinalizeBatch([ded], 'DATABASE');
  assertEqual(JSON.stringify([ded, full, magic]), before, 'items deep-equal before/after');
  const totalAfter = (ded.subtotal ?? 0) + (full.subtotal ?? 0) + (magic.subtotal ?? 0);
  assertEqual(totalAfter, totalBefore, 'totals unchanged');
  assertEqual(totalBefore, 1450000, 'fixture total sanity');
});

// ---------------------------------------------------------------------------
// Gate 1 — ported semanticClassifier (owner ACC 2026-11-25, file ke-4)
// ---------------------------------------------------------------------------

test('B33 (Gate 1) room label "Kamar Utama" → BLOCKING FAIL, never a RAB item', () => {
  const res = validateDedAiItem(baseDedAi({ name: 'Kamar Utama', category: '' }), 'DATABASE', TARGET);
  assertEqual(gate(res, 1).status, 'FAIL', 'gate 1');
  assertEqual(gate(res, 1).severity, 'BLOCKING', 'blocking');
  assertTrue(gate(res, 1).reason.includes('ruangan'), 'reason names the room label');
  assertEqual(res.rabEligible, false, 'room label is not RAB-eligible');
});

test('B34 (Gate 1) title "Denah Lantai 1" → BLOCKING FAIL', () => {
  const res = validateDedAiItem(baseDedAi({ name: 'Denah Lantai 1', category: '' }), 'DATABASE', TARGET);
  assertEqual(gate(res, 1).status, 'FAIL', 'gate 1');
  assertEqual(gate(res, 1).severity, 'BLOCKING', 'blocking');
});

test('B35 (Gate 1) raw symbol "P1" → BLOCKING FAIL (DOOR_REFERENCE needs a schedule)', () => {
  const res = validateDedAiItem(baseDedAi({ name: 'P1', category: '' }), 'DATABASE', TARGET);
  assertEqual(gate(res, 1).status, 'FAIL', 'gate 1');
  assertTrue(gate(res, 1).reason.includes('referensi'), 'reason names the reference code');
});

test('B36 (Gate 1) concrete "Beton K-250" → PASS (keyword route); grade still via Candidate A', () => {
  const res = validateDedAiItem(baseDedAi({ name: 'Beton K-250', category: 'STRUKTUR' }), 'DATABASE', TARGET);
  assertEqual(gate(res, 1).status, 'PASS', 'gate 1 passes construction work');
});

test('B37 (Gate 1) category hint: unknown text + STRUKTUR → PASS; + OTHER → NOT_EVALUATED', () => {
  const hinted = validateDedAiItem(baseDedAi({ name: 'Sesuatu tak dikenal', category: 'STRUKTUR' }), 'DATABASE', TARGET);
  assertEqual(gate(hinted, 1).status, 'PASS', 'category hint is v2 behavior');
  const other = validateDedAiItem(baseDedAi({ name: 'Sesuatu tak dikenal', category: 'OTHER' }), 'DATABASE', TARGET);
  assertEqual(gate(other, 1).status, 'NOT_EVALUATED', 'OTHER hint decides nothing');
});

test('B38 (Gate 1) Magic AI work name → PASS (adapters carry the name through)', () => {
  const res = validateMagicAiItem(baseMagic(), 'FULL_AI', TARGET);
  assertEqual(gate(res, 1).status, 'PASS', 'gate 1');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== DED RAB VALIDATION GATE LIVE: ${passed} passed, ${failed} failed (total ${passed + failed}) ===`);
if (failed > 0) process.exitCode = 1;
