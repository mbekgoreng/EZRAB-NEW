/**
 * Tests for Phase 2: AHSP Engine & Pipeline
 */

import { AHSPImportPipeline, RawDocumentInput } from '../engine/ahsp/pipeline/ahspImportPipeline';
import { AHSPResolver } from '../engine/ahsp/resolver/ahspResolver';
import { AHSPRepository } from '../engine/ahsp/repository/ahspRepository';
import { AHSPNormalizationEngine } from '../engine/ahsp/normalization/ahspNormalization';
import { UnitEngine } from '../engine/calculatorCore/unit/unitEngine';

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
console.log('PHASE 2 — AHSP ENGINE & IMPORT PIPELINE TEST SUITE');
console.log('====================================================\n');

// 1. Pipeline Test: Document -> Normalizer -> Validator -> Master & Resource
test('Import Pipeline processes document and generates resource master', () => {
  const sampleDoc: RawDocumentInput = {
    documentId: 'SE-DJBK-47-2026',
    documentTitle: 'SE DJBK 47/SE/Dk/2026 Lampiran V',
    standardVersion: '2026.1',
    domain: 'BINA_MARGA',
    items: [
      {
        rawCode: '3.1.(1a)',
        rawName: 'Beton Struktur fc 30 MPa (K-350)',
        rawUnit: 'm3',
        components: [
          { type: 'labor', rawName: 'Pekerja', rawUnit: 'OH', coefficient: 1.2 },
          { type: 'labor', rawName: 'Tukang Batu', rawUnit: 'OH', coefficient: 0.35 },
          { type: 'material', rawName: 'Semen Portland', rawUnit: 'kg', coefficient: 415 },
          { type: 'material', rawName: 'Pasir Beton', rawUnit: 'm3', coefficient: 0.45 },
          { type: 'material', rawName: 'Batu Pecah / Split', rawUnit: 'm3', coefficient: 0.65 },
          { type: 'equipment', rawName: 'Concrete Mixer', rawUnit: 'jam', coefficient: 0.25 },
        ],
      },
      {
        rawCode: '2.1.(1)',
        rawName: 'Galian Biasa',
        rawUnit: 'm3',
        components: [
          { type: 'labor', rawName: 'Pekerja', rawUnit: 'OH', coefficient: 0.75 },
          { type: 'labor', rawName: 'Mandor', rawUnit: 'OH', coefficient: 0.025 },
        ],
      },
      // Invalid item that must be rejected by validator
      {
        rawCode: '',
        rawName: 'Invalid item missing code',
        rawUnit: 'm3',
        components: [],
      },
    ],
  };

  const res = AHSPImportPipeline.processDocument(sampleDoc);

  assertEqual(res.masterDefinitions.length, 2, 'Should accept 2 valid definitions');
  assertEqual(res.report.totalValid, 2, 'Report should show 2 valid');
  assertEqual(res.report.totalRejected, 1, 'Report should show 1 rejected');
  assertTrue(res.resourceMaster.length >= 6, 'Should generate resource master entries');

  const betonDef = res.masterDefinitions.find((d) => d.codeNormalized === '3.1.(1A)');
  assertTrue(!!betonDef, 'Beton definition must exist with normalized code');
  assertEqual(betonDef!.unit, 'm³', 'Unit m3 normalized to m³');
  assertEqual(betonDef!.laborComponents.length, 2);
  assertEqual(betonDef!.materialComponents.length, 3);
  assertEqual(betonDef!.equipmentComponents.length, 1);
});

// 2. Resolver Test: Exact Code
test('AHSP Resolver finds exact match by code', () => {
  const repo = AHSPRepository.getInstance();
  const resolver = new AHSPResolver(repo);

  const res = resolver.resolve({ code: '3.1.(1)' });
  assertTrue(res.status === 'EXACT_MATCH' || res.status === 'NORMALIZED_MATCH', `Status should match, got ${res.status}`);
  assertTrue(!!res.resolvedAHSP, 'Must resolve AHSP item');
});

// 3. Ambiguity Handler: Multiple matches trigger AMBIGUOUS_AHSP
test('AHSP Resolver flags ambiguous query as AMBIGUOUS_AHSP with candidates', () => {
  const repo = AHSPRepository.getInstance();
  const resolver = new AHSPResolver(repo);

  const res = resolver.resolve({ name: 'Beton' });
  assertEqual(res.status, 'AMBIGUOUS_AHSP', 'Query "Beton" must be flagged as ambiguous');
  assertTrue(Array.isArray(res.candidates) && res.candidates.length > 1, 'Must provide candidate list');
});

// 4. Resource Matching & Unit Compatibility
test('Unit compatibility engine correctly compares AHSP component dimensions', () => {
  assertTrue(UnitEngine.areCompatible('m', 'cm'), 'm and cm are compatible');
  assertTrue(UnitEngine.areCompatible('kg', 'ton'), 'kg and ton are compatible');
  assertTrue(UnitEngine.areCompatible('m3', 'liter'), 'm3 and liter are compatible');
  assertTrue(!UnitEngine.areCompatible('m3', 'kg'), 'm3 and kg are incompatible without density');
  assertTrue(!UnitEngine.areCompatible('OH', 'm2'), 'OH and m2 are incompatible');
});

console.log('\nAll Phase 2 tests passed.');
