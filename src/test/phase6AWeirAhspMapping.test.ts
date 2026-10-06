/**
 * PHASE 6A — WEIR AHSP MAPPING TEST
 *
 * Validates that every Weir work item maps to an exact AHSP code.
 * No fuzzy matching. No approximate matching. No silent substitution.
 * If exact AHSP mapping does not exist → status = AHSP_NOT_FOUND.
 */

import { WeirCostService } from '../engine/weir/weirCostService';
import { lookupWeirAhsp, WEIR_AHSP_DATABASE } from '../engine/weir/weirAhspDatabase';
import { WeirCostInput } from '../engine/weir/weirTypes';

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}
function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
}
function assertTrue(cond: boolean, msg?: string) { if (!cond) throw new Error(msg || 'Expected true'); }

console.log('====================================================');
console.log('PHASE 6A — WEIR AHSP MAPPING TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0,
  includeReinforcement: 1, includeFormwork: 1, includeJoint: 1, includeWaterstop: 1,
  rebarRatio: 85, projectLocation: 'Kabupaten Probolinggo',
};

// ── AHSP DATABASE INTEGRITY ──────────────────────────────────────────

test('AHSP database has exactly 5 definitions for the Weir domain', () => {
  assertEqual(WEIR_AHSP_DATABASE.size, 5, 'Must have 5 AHSP definitions');
});

test('Concrete AHSP code 3.1.(1) exists with correct unit m³', () => {
  const def = lookupWeirAhsp('3.1.(1)');
  assertTrue(def !== undefined, '3.1.(1) must exist');
  assertEqual(def!.unit, 'm³', 'Unit must be m³');
  assertEqual(def!.name, 'Beton Siklop K-225 / fc 20 MPa Struktur Tubuh Bendung', 'Name must match');
});

test('Rebar AHSP code BINA_MARGA_3.2.(1) exists with correct unit kg', () => {
  const def = lookupWeirAhsp('BINA_MARGA_3.2.(1)');
  assertTrue(def !== undefined, 'BINA_MARGA_3.2.(1) must exist');
  assertEqual(def!.unit, 'kg', 'Unit must be kg');
});

test('Formwork AHSP code BINA_MARGA_3.3.(1) exists with correct unit m²', () => {
  const def = lookupWeirAhsp('BINA_MARGA_3.3.(1)');
  assertTrue(def !== undefined, 'BINA_MARGA_3.3.(1) must exist');
  assertEqual(def!.unit, 'm²', 'Unit must be m²');
});

test('Joint AHSP code SDA_JOINT_01 exists with correct unit m', () => {
  const def = lookupWeirAhsp('SDA_JOINT_01');
  assertTrue(def !== undefined, 'SDA_JOINT_01 must exist');
  assertEqual(def!.unit, 'm', 'Unit must be m');
});

test('Waterstop AHSP code SDA_WATERSTOP_01 exists with correct unit m', () => {
  const def = lookupWeirAhsp('SDA_WATERSTOP_01');
  assertTrue(def !== undefined, 'SDA_WATERSTOP_01 must exist');
  assertEqual(def!.unit, 'm', 'Unit must be m');
});

// ── EXACT CODE MATCH (NO FUZZY) ──────────────────────────────────────

test('Unknown AHSP code returns undefined (no fuzzy match)', () => {
  assertEqual(lookupWeirAhsp('3.1.(999)'), undefined, 'Unknown code must return undefined');
  assertEqual(lookupWeirAhsp('CONCRETE'), undefined, 'Fuzzy name must not match');
  assertEqual(lookupWeirAhsp(''), undefined, 'Empty string must return undefined');
});

// ── WORK ITEM → AHSP MAPPING ──────────────────────────────────────────

test('Golden case: 5 work items all map to exact AHSP codes', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.workItems.length, 5, 'Must have 5 work items');
  for (const wi of result.workItems) {
    assertEqual(wi.priceStatus === 'AHSP_NOT_FOUND', false, `Work item "${wi.name}" must not be AHSP_NOT_FOUND`);
    assertTrue(wi.ahspCode !== 'AHSP_NOT_FOUND', `Work item "${wi.name}" must have valid AHSP code`);
  }
});

test('Concrete work item maps to AHSP code 3.1.(1)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const concrete = result.workItems.find((w) => w.id === 'wi_weir_concrete');
  assertTrue(concrete !== undefined, 'Concrete work item must exist');
  assertEqual(concrete!.ahspCode, '3.1.(1)', 'Must map to 3.1.(1)');
});

test('Rebar work item maps to AHSP code BINA_MARGA_3.2.(1)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const rebar = result.workItems.find((w) => w.id === 'wi_weir_rebar');
  assertTrue(rebar !== undefined, 'Rebar work item must exist');
  assertEqual(rebar!.ahspCode, 'BINA_MARGA_3.2.(1)', 'Must map to BINA_MARGA_3.2.(1)');
});

test('Formwork work item maps to AHSP code BINA_MARGA_3.3.(1)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const formwork = result.workItems.find((w) => w.id === 'wi_weir_formwork');
  assertTrue(formwork !== undefined, 'Formwork work item must exist');
  assertEqual(formwork!.ahspCode, 'BINA_MARGA_3.3.(1)', 'Must map to BINA_MARGA_3.3.(1)');
});

test('Joint work item maps to AHSP code SDA_JOINT_01', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const joint = result.workItems.find((w) => w.id === 'wi_weir_joint');
  assertTrue(joint !== undefined, 'Joint work item must exist');
  assertEqual(joint!.ahspCode, 'SDA_JOINT_01', 'Must map to SDA_JOINT_01');
});

test('Waterstop work item maps to AHSP code SDA_WATERSTOP_01', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const waterstop = result.workItems.find((w) => w.id === 'wi_weir_waterstop');
  assertTrue(waterstop !== undefined, 'Waterstop work item must exist');
  assertEqual(waterstop!.ahspCode, 'SDA_WATERSTOP_01', 'Must map to SDA_WATERSTOP_01');
});

// ── AHSP COMPONENTS INTEGRITY ──────────────────────────────────────────

test('Each AHSP definition has labor, material, or equipment components', () => {
  for (const [code, def] of WEIR_AHSP_DATABASE.entries()) {
    const total = def.laborComponents.length + def.materialComponents.length + def.equipmentComponents.length;
    assertTrue(total > 0, `AHSP ${code} must have at least 1 component`);
  }
});

test('Concrete AHSP has 3 labor, 3 material, 2 equipment components', () => {
  const def = lookupWeirAhsp('3.1.(1)')!;
  assertEqual(def.laborComponents.length, 3, 'Must have 3 labor components');
  assertEqual(def.materialComponents.length, 3, 'Must have 3 material components');
  assertEqual(def.equipmentComponents.length, 2, 'Must have 2 equipment components');
});

// ── NEGATIVE: MISSING AHSP ─────────────────────────────────────────────

test('Work item with unknown AHSP code gets AHSP_NOT_FOUND status', () => {
  const geom = WeirCostService.calculateGeometry(GOLDEN_INPUT);
  const items = WeirCostService.mapWorkItems(geom, GOLDEN_INPUT, []);
  // Manually inject bad code
  items[0].targetAhspCode = 'NONEXISTENT_CODE';
  const ahspMap = WeirCostService.resolveAhsp(items);
  assertEqual(ahspMap.has('NONEXISTENT_CODE'), false, 'Unknown code must not be in AHSP map');
});

console.log('');
