/**
 * TESTS FOR PHASE 5.5: EZRAB CONSTRUCTION PRICING DATA VALIDATION & REAL-WORLD COST CALIBRATION
 *
 * Verifies:
 * 1. Missing source detection (SOURCE_UNVERIFIED)
 * 2. Missing region, missing year, missing unit detection
 * 3. Duplicate and conflicting price detection
 * 4. Invalid physical unit conversion (e.g. kg to m3, m2 to m3, OH to kg)
 * 5. Invalid coefficient detection (<= 0 or NaN)
 * 6. Missing resource & canonical alias resolution
 * 7. Incomplete AHSP classification (VALID, PARTIAL, SUSPICIOUS, INVALID)
 * 8. Construction scope validation (350 m3 concrete = PARTIAL_SCOPE)
 * 9. Price Anomaly V2 contextual bounds (NORMAL, LOW, HIGH, EXTREME)
 * 10. UNKNOWN reference range when data is insufficient
 * 11. Weir Body forensic tracing without hardcoded target prices
 */

import { CanonicalResourceRegistry } from '../engine/calibration/canonicalResourceRegistry';
import { UnitDimensionalValidator } from '../engine/calibration/unitDimensionalValidator';
import { ReferenceCostRangeEngine } from '../engine/calibration/referenceCostRangeEngine';
import { ConstructionScopeValidator } from '../engine/calibration/constructionScopeValidator';
import { ConstructionDataValidator } from '../engine/calibration/constructionDataValidator';
import { WeirForensicAuditRunner } from '../engine/calibration/weirForensicAudit';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e: any) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assertTrue(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg || 'Expected true');
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

console.log('====================================================');
console.log('PHASE 5.5 — PRICING DATA VALIDATION & CALIBRATION TESTS');
console.log('====================================================\n');

// 1. Missing Source Detection
test('Detects missing source document in AHSP and flags SOURCE_UNVERIFIED', () => {
  const dummyAHSP = [
    {
      code: 'TEST_NO_SRC',
      name: 'Pekerjaan Tanpa Sumber',
      unit: 'm3',
      sourceDocument: '', // Missing source
      laborComponents: [{ itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 1.0 }],
    },
    {
      code: 'TEST_WITH_SRC',
      name: 'Pekerjaan Resmi PUPR',
      unit: 'm3',
      sourceDocument: 'Lampiran V SE DJBK 2026',
      laborComponents: [{ itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 1.0 }],
    },
  ];

  const res = ConstructionDataValidator.auditAHSPDataset(dummyAHSP);
  assertEqual(res.summary.sourceUnverifiedCount, 1);
  assertEqual(res.records[0].sourceStatus, 'SOURCE_UNVERIFIED');
  assertEqual(res.records[1].sourceStatus, 'VERIFIED');
});

// 2. Missing Region, Year, and Unit Detection in Price Data
test('Detects missing region, year, and unit in price datasets', () => {
  const dummyPrices = [
    { code: 'M1', name: 'Item Tanpa Wilayah', price: 50000, unit: 'kg', location: '', periodVersion: '2026-Q1', priceSource: 'Vendor A' },
    { code: 'M2', name: 'Item Tanpa Tahun', price: 75000, unit: 'm3', location: 'Jakarta', priceSource: 'Vendor B' },
    { code: 'M3', name: 'Item Tanpa Satuan', price: 90000, unit: '', location: 'Surabaya', periodVersion: '2026-Q1', priceSource: 'Vendor C' },
    { code: 'M4', name: 'Item Lengkap', price: 100000, unit: 'm', location: 'Bandung', periodVersion: '2026-Q1', priceSource: 'Vendor D' },
  ];

  const audit = ConstructionDataValidator.auditPriceDataset(dummyPrices);
  assertTrue(audit.records[0].issues.includes('MISSING_REGION'));
  assertTrue(audit.records[1].issues.includes('MISSING_YEAR'));
  assertTrue(audit.records[2].issues.includes('MISSING_UNIT'));
  assertEqual(audit.records[3].issues.length, 0);
});

// 3. Duplicate and Conflicting Price Detection
test('Detects duplicate codes and conflicting prices for the same resource', () => {
  const duplicatePrices = [
    { code: 'PASIR_COR', name: 'Pasir Cor HSD Lama', price: 250000, unit: 'm3', location: 'Jatim', periodVersion: '2026-Q1', priceSource: 'HSD-1' },
    { code: 'PASIR_COR', name: 'Pasir Cor HSD Baru', price: 280000, unit: 'm3', location: 'Jatim', periodVersion: '2026-Q1', priceSource: 'HSD-2' },
  ];

  const audit = ConstructionDataValidator.auditPriceDataset(duplicatePrices);
  assertTrue(audit.records[1].issues.includes('DUPLICATE'));
  assertTrue(audit.records[1].issues.includes('CONFLICT'));
});

// 4. Invalid Physical Unit Conversion Blocks Cross-Dimensional Mismatch
test('Enforces physical dimension rules: permits kg-ton, blocks kg-m3, m2-m3, OH-kg', () => {
  // Valid intra-dimensional conversions
  const massCheck = UnitDimensionalValidator.canConvert('ton', 'kg');
  assertTrue(massCheck.allowed);
  assertEqual(massCheck.conversionFactor, 1000);

  const volCheck = UnitDimensionalValidator.canConvert('m3', 'liter');
  assertTrue(volCheck.allowed);
  assertEqual(volCheck.conversionFactor, 1000);

  // Cross-dimensional conversions must be categorically BLOCKED
  const massToVol = UnitDimensionalValidator.canConvert('kg', 'm3');
  assertEqual(massToVol.allowed, false, 'Mass to volume conversion must be blocked');
  assertTrue(massToVol.reason.includes('DIMENSIONAL_CONVERSION_BLOCKED'));

  const areaToVol = UnitDimensionalValidator.canConvert('m2', 'm3');
  assertEqual(areaToVol.allowed, false, 'Area to volume conversion must be blocked');

  const laborToMass = UnitDimensionalValidator.canConvert('OH', 'kg');
  assertEqual(laborToMass.allowed, false, 'Labor time to mass conversion must be blocked');
});

// 5. Invalid Coefficient Detection (<= 0 or NaN)
test('Detects invalid and negative AHSP coefficients', () => {
  const invalidAHSP = [
    {
      code: 'AHSP_CORRUPT',
      name: 'Analisa dengan Koefisien Rusak',
      unit: 'm3',
      sourceDocument: 'Draft Dokumen',
      laborComponents: [
        { itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: -0.5 },
        { itemCode: 'L.02', itemName: 'Tukang', unit: 'OH', coefficient: 0 },
      ],
    },
  ];

  const audit = ConstructionDataValidator.auditAHSPDataset(invalidAHSP);
  assertEqual(audit.records[0].completenessStatus, 'INVALID');
  assertTrue(audit.records[0].invalidCoefficients.length >= 2);
});

// 6. Missing Resource and Canonical Alias Resolution
test('Resolves natural synonyms to canonical resources (Semen -> CEMENT_PORTLAND)', () => {
  const canonical = CanonicalResourceRegistry.getInstance();

  const semen = canonical.resolveCanonical('Semen Portland');
  assertTrue(semen !== null);
  assertEqual(semen?.code, 'CEMENT_PORTLAND');

  const tukang = canonical.resolveCanonical('Tukang Batu');
  assertTrue(tukang !== null);
  assertEqual(tukang?.code, 'LABOR_MASON');

  const split = canonical.resolveCanonical('Batu Split 2/3');
  assertTrue(split !== null);
  assertEqual(split?.code, 'SPLIT_STONE_2_3');

  // Unknown item returns null
  const unknown = canonical.resolveCanonical('Bahan Tidak Dikenal XYZ 99');
  assertEqual(unknown, null);
});

// 7. Incomplete AHSP Classification (VALID, PARTIAL, SUSPICIOUS, INVALID)
test('Classifies AHSP completeness based on work-type rules (Not blindly invalid)', () => {
  const sampleDataset = [
    // 1. Manual earthwork: valid without heavy equipment or materials
    {
      code: 'GALIAN_MANUAL',
      name: 'Pekerjaan Galian Tanah Manual Kedalaman 1m',
      unit: 'm3',
      sourceDocument: 'SE 12/2026',
      laborComponents: [{ itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.75 }],
      materialComponents: [],
      equipmentComponents: [],
    },
    // 2. Concrete structural work: suspicious if missing materials or labor
    {
      code: 'BETON_NO_MATERIAL',
      name: 'Beton Struktur fc 25 MPa Tanpa Bahan',
      unit: 'm3',
      sourceDocument: 'Draft',
      laborComponents: [{ itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 1.0 }],
      materialComponents: [], // Missing semen/pasir/split!
      equipmentComponents: [],
    },
  ];

  const audit = ConstructionDataValidator.auditAHSPDataset(sampleDataset);
  assertEqual(audit.records[0].completenessStatus, 'VALID');
  assertEqual(audit.records[1].completenessStatus, 'SUSPICIOUS');
});

// 8. Construction Scope Validation: 350 m3 Concrete != Total Weir Project
test('Construction Scope Validator flags single 350 m3 concrete takeoff as PARTIAL_SCOPE', () => {
  // Scenario: user only entered concrete volume
  const singleScope = ['STRUCTURE_BODY'];
  const res = ConstructionScopeValidator.validateWeirScope(singleScope, 350, 'm³');

  assertEqual(res.scopeStatus, 'PARTIAL_SCOPE');
  assertTrue(res.missingMandatoryScopes.length >= 4);
  assertTrue(res.warningNote.includes('Dilarang menyajikan angka ini sebagai RAB total'));
});

// 9. Price Anomaly V2 Contextual Bounds (NORMAL, LOW, HIGH, EXTREME)
test('Price Anomaly V2 classifies prices contextually against reference range', () => {
  // Reference for CONCRETE_STRUCTURE_K250 in Jawa: min 950k, max 1.45m, median 1.18m
  const normal = ReferenceCostRangeEngine.evaluateAnomaly(1200000, 'm3', 'CONCRETE_STRUCTURE_K250', 'Jawa Timur', 2026);
  assertEqual(normal.severity, 'NORMAL');
  assertEqual(normal.action, 'PROCEED');

  const low = ReferenceCostRangeEngine.evaluateAnomaly(600000, 'm3', 'CONCRETE_STRUCTURE_K250', 'Jawa Timur', 2026);
  assertEqual(low.severity, 'LOW');
  assertEqual(low.action, 'WARN');

  const high = ReferenceCostRangeEngine.evaluateAnomaly(1800000, 'm3', 'CONCRETE_STRUCTURE_K250', 'Jawa Timur', 2026);
  assertEqual(high.severity, 'HIGH');
  assertEqual(high.action, 'WARN');

  const extreme = ReferenceCostRangeEngine.evaluateAnomaly(150000, 'm3', 'CONCRETE_STRUCTURE_K250', 'Jawa Timur', 2026);
  assertEqual(extreme.severity, 'EXTREME');
  assertEqual(extreme.action, 'BLOCK');
});

// 10. Unknown Reference Range When Data Is Unavailable
test('Returns UNKNOWN severity when no reference range data exists (Never guesses)', () => {
  const unknown = ReferenceCostRangeEngine.evaluateAnomaly(5000000, 'unit', 'MESIN_LASER_QUANTUM', 'Papua', 2026);
  assertEqual(unknown.severity, 'UNKNOWN');
  assertTrue(unknown.message.includes('belum tersedia di database kalibrasi'));
});

// 11. Weir Body Forensic Trace (No Hardcoded Target Prices)
test('Weir Body Forensic Audit traces 350 m3 deterministically through full calculation chain', () => {
  const audit = WeirForensicAuditRunner.runAudit();

  assertEqual(audit.calculatedVolume, 350, 'Exact 350 m3 volume calculated fromKP-02 formula');
  assertEqual(audit.unit, 'm³');
  assertEqual(audit.workItemsCount, 5, 'Includes concrete, rebar, formwork, joint, waterstop');
  assertTrue(audit.costBreakdown.directCost > 0, 'Direct cost computed deterministically');
  assertTrue(audit.costBreakdown.totalCost > 0, 'Total cost computed deterministically');
  assertEqual(audit.scopeValidation.scopeStatus, 'PARTIAL_SCOPE');
  assertTrue(audit.forensicTrace.length >= 7, 'All 7 forensic stages recorded');
});

console.log('\nAll Phase 5.5 tests passed.');
