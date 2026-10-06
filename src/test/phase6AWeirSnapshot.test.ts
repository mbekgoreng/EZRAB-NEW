/**
 * PHASE 6A — WEIR GOLDEN CASE SNAPSHOT TEST
 *
 * Validates that the golden case (L=25, H=3.5, Wc=2, Wb=6) produces
 * deterministic, reproducible output across runs.
 *
 * Snapshot includes:
 *   - Geometry (Area=14, Volume=350)
 *   - Work item count and names
 *   - AHSP codes
 *   - Cost summary structure
 *   - Audit trail step names
 *   - Pareto analysis presence
 *   - Data confidence grade
 */

import { WeirCostService } from '../engine/weir/weirCostService';
import { WeirCostInput } from '../engine/weir/weirTypes';

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  \u2713 ${name}`); }
  catch (e: any) { console.error(`  \u2717 ${name}: ${e.message}`); process.exitCode = 1; }
}
function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
}
function assertTrue(cond: boolean, msg?: string) { if (!cond) throw new Error(msg || 'Expected true'); }

console.log('====================================================');
console.log('PHASE 6A — WEIR GOLDEN CASE SNAPSHOT TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0,
  includeReinforcement: 1, includeFormwork: 1, includeJoint: 1, includeWaterstop: 1,
  rebarRatio: 85, projectLocation: 'Kabupaten Probolinggo',
};

// ── GEOMETRY SNAPSHOT ────────────────────────────────────────────────

test('Geometry snapshot: Area=14, Volume=350, Unit=m³', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.geometry.crossSectionArea, 14, 'Area must be 14');
  assertEqual(result.geometry.volume, 350, 'Volume must be 350');
  assertEqual(result.geometry.unit, 'm³', 'Unit must be m³');
});

test('Geometry goldenCaseMatch is true', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.geometry.goldenCaseMatch, 'Golden case must match');
});

test('Geometry formula steps are present', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.geometry.formulaSteps.length, 2, 'Must have 2 formula steps');
  assertTrue(result.geometry.formulaSteps[0].includes('Area'), 'Step 1 must mention Area');
  assertTrue(result.geometry.formulaSteps[1].includes('Volume'), 'Step 2 must mention Volume');
});

// ── WORK ITEMS SNAPSHOT ──────────────────────────────────────────────

test('Work items snapshot: 5 items', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.workItems.length, 5, 'Must have 5 work items');
});

test('Work item IDs snapshot', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const expectedIds = ['wi_weir_concrete', 'wi_weir_rebar', 'wi_weir_formwork', 'wi_weir_joint', 'wi_weir_waterstop'];
  for (const expected of expectedIds) {
    assertTrue(
      result.workItems.some((w) => w.id === expected),
      `Must have work item with id ${expected}`,
    );
  }
});

test('Work item AHSP codes snapshot', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const expectedCodes = ['3.1.(1)', 'BINA_MARGA_3.2.(1)', 'BINA_MARGA_3.3.(1)', 'SDA_JOINT_01', 'SDA_WATERSTOP_01'];
  for (const expected of expectedCodes) {
    assertTrue(
      result.workItems.some((w) => w.targetAhspCode === expected),
      `Must have work item targeting AHSP ${expected}`,
    );
  }
});

test('Work item units snapshot', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const concrete = result.workItems.find((w) => w.id === 'wi_weir_concrete')!;
  const rebar = result.workItems.find((w) => w.id === 'wi_weir_rebar')!;
  const formwork = result.workItems.find((w) => w.id === 'wi_weir_formwork')!;
  const joint = result.workItems.find((w) => w.id === 'wi_weir_joint')!;
  const waterstop = result.workItems.find((w) => w.id === 'wi_weir_waterstop')!;
  assertEqual(concrete.unit, 'm³', 'Concrete unit must be m³');
  assertEqual(rebar.unit, 'kg', 'Rebar unit must be kg');
  assertEqual(formwork.unit, 'm²', 'Formwork unit must be m²');
  assertEqual(joint.unit, 'm', 'Joint unit must be m');
  assertEqual(waterstop.unit, 'm', 'Waterstop unit must be m');
});

test('Work item quantity sources snapshot', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const concrete = result.workItems.find((w) => w.id === 'wi_weir_concrete')!;
  const rebar = result.workItems.find((w) => w.id === 'wi_weir_rebar')!;
  assertEqual(concrete.quantitySource, 'DESIGN_DERIVED', 'Concrete must be DESIGN_DERIVED');
  assertEqual(rebar.quantitySource, 'REFERENCE_ESTIMATE', 'Rebar must be REFERENCE_ESTIMATE');
});

// ── COST SUMMARY SNAPSHOT ────────────────────────────────────────────

test('Cost summary volume is 350 m³', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.costSummary.volume, 350, 'Volume must be 350');
  assertEqual(result.costSummary.unit, 'm³', 'Unit must be m³');
});

test('Cost summary has non-zero direct cost', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.costSummary.directCost > 0, 'Direct cost must be > 0');
  assertTrue(result.costSummary.directCost > 17500000, 'Direct cost must exceed old 17.5M fallback');
});

test('Cost summary has non-zero final cost', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.costSummary.finalCost > 0, 'Final cost must be > 0');
  assertTrue(result.costSummary.finalCost > result.costSummary.directCost, 'Final must exceed direct (includes markups)');
});

test('Cost summary workItemsResolved > 0', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.costSummary.workItemsResolved > 0, 'At least one item must be resolved');
});

test('Cost summary workItemsBlocked is 0 for golden case', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.costSummary.workItemsBlocked, 0, 'No items should be blocked for golden case');
});

// ── AUDIT TRAIL SNAPSHOT ─────────────────────────────────────────────

test('Audit trail snapshot: 14 steps with correct names', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const expectedNames = [
    'Geometry', 'Quantity', 'Work Item', 'AHSP Mapping', 'Coefficient',
    'Resource', 'Unit Validation', 'Price Resolution', 'Direct Cost',
    'SMKK', 'Overhead', 'Profit', 'Tax', 'Final Cost',
  ];
  assertEqual(result.auditTrail.length, 14, 'Must have 14 steps');
  for (let i = 0; i < 14; i++) {
    assertEqual(result.auditTrail[i].stepIndex, i + 1, `Step ${i + 1} index must match`);
    assertEqual(result.auditTrail[i].stageName, expectedNames[i], `Step ${i + 1} name must match`);
  }
});

// ── PARETO SNAPSHOT ──────────────────────────────────────────────────

test('Pareto analysis snapshot: non-empty, sorted descending', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.paretoAnalysis.length > 0, 'Pareto must have entries');
  for (let i = 1; i < result.paretoAnalysis.length; i++) {
    assertTrue(
      result.paretoAnalysis[i - 1].totalExpense >= result.paretoAnalysis[i].totalExpense,
      'Pareto must be sorted by expense descending',
    );
  }
});

test('Pareto top entry is the most expensive resource', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const top = result.paretoAnalysis[0];
  assertTrue(top.contributionPercent > 0, 'Top Pareto entry must have positive contribution');
  assertTrue(top.totalExpense > 0, 'Top Pareto entry must have positive expense');
});

// ── DATA CONFIDENCE SNAPSHOT ─────────────────────────────────────────

test('Data confidence is not BLOCKED for golden case', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.dataConfidence !== 'BLOCKED', 'Golden case must not be BLOCKED');
});

test('Data confidence is B or better (at most 1 reference estimate)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const validGrades = ['A', 'B'];
  assertTrue(
    validGrades.includes(result.dataConfidence),
    `Data confidence must be A or B (got ${result.dataConfidence})`,
  );
});

// ── ASSUMPTIONS SNAPSHOT ─────────────────────────────────────────────

test('Assumptions include rebar ratio as REFERENCE_ESTIMATE', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const rebarAssumption = result.assumptions.find((a) => a.field === 'rebarRatio');
  assertTrue(rebarAssumption !== undefined, 'Must have rebarRatio assumption');
  assertEqual(rebarAssumption!.type, 'REFERENCE_ESTIMATE', 'Rebar ratio must be REFERENCE_ESTIMATE');
  assertTrue(rebarAssumption!.note.length > 0, 'Must have explanatory note');
});

// ── LOCATION SNAPSHOT ────────────────────────────────────────────────

test('Location info snapshot: Probolinggo → Jawa Timur', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.locationInfo.projectLocation, 'Kabupaten Probolinggo', 'Location must match input');
  assertTrue(
    result.locationInfo.resolvedRegion.includes('Probolinggo'),
    'Resolved region must include Probolinggo',
  );
  assertEqual(result.locationInfo.priceSource, 'SE 12/SE/Db/2026', 'Price source must be SE 12/SE/Db/2026');
});

// ── DETERMINISM: SAME INPUT → SAME OUTPUT ────────────────────────────

test('Determinism: same input produces same direct cost', () => {
  const r1 = WeirCostService.calculate(GOLDEN_INPUT);
  const r2 = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(r1.costSummary.directCost, r2.costSummary.directCost, 'Direct cost must be deterministic');
  assertEqual(r1.costSummary.finalCost, r2.costSummary.finalCost, 'Final cost must be deterministic');
});

test('Determinism: same input produces same audit trail length', () => {
  const r1 = WeirCostService.calculate(GOLDEN_INPUT);
  const r2 = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(r1.auditTrail.length, r2.auditTrail.length, 'Audit trail length must be deterministic');
});

console.log('');
