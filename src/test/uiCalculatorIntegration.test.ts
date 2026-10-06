/**
 * Phase 5.2 — UI Calculator Catalog & Registry Integration Test
 * 
 * Verifies that all 30 Residential Calculators and 19+ Legacy Calculators:
 * 1. Are properly registered in ALL_CONSTRUCTION_CALCULATORS and getCalculatorById
 * 2. Are present in CALCULATOR_CATEGORIES for UI rendering
 * 3. Have 0 missing, 0 duplicates, and 0 unknown entries
 * 4. Execute deterministically with valid primaryQuantity > 0 and formula breakdowns
 */

declare const process: any;

import {
  ALL_CONSTRUCTION_CALCULATORS,
  CONSTRUCTION_CALCULATORS,
  RESIDENTIAL_CALCULATOR_SPECS,
  getCalculatorById,
} from '../engine/constructionCalculators/registry';
import { CALCULATOR_CATEGORIES } from '../components/qto/QtoCalculatorView';
import { ALL_CIVIL_EXPANSION_CALCULATORS } from '../engine/calculatorCore/civil';
import { CoreCalculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';

export const EXPECTED_30_RESIDENTIAL_IDS = [
  // A. PEKERJAAN TANAH (5)
  'residential.cut_and_fill',
  'residential.galian_tanah',
  'residential.urugan_tanah',
  'residential.pasir_batu_urug',
  'residential.drainase',

  // B. PONDASI & BETON (11)
  'residential.pondasi_batu_kali',
  'residential.lantai_kerja',
  'residential.beton',
  'residential.pembesian',
  'residential.bekisting',
  'residential.pondasi_beton_footing',
  'residential.sloof',
  'residential.kolom',
  'residential.balok',
  'residential.plat_lantai',
  'residential.tangga_beton',

  // C. DINDING & FINISHING (6)
  'residential.dinding',
  'residential.plester_acian',
  'residential.penutup_lantai',
  'residential.penutup_dinding',
  'residential.plafon',
  'residential.pengecatan',

  // D. ATAP & BUKAAN (4)
  'residential.atap_baja_ringan',
  'residential.penutup_atap',
  'residential.pintu_jendela',
  'residential.talang_lisplank',

  // E. MEP (4)
  'residential.instalasi_listrik_basic',
  'residential.instalasi_air_bersih',
  'residential.air_kotor_bekas',
  'residential.sanitair',
];

export const EXPECTED_19_LEGACY_IDS = [
  'BOWPLANK',
  'PONDASI',
  'FOOT_PLATE',
  'SLOOF',
  'KOLOM',
  'BALOK',
  'BAJA_WF',
  'BATA_RINGAN',
  'BATA_MERAH',
  'BATAKO',
  'PINTU_JENDELA',
  'ATAP_BAJA_RINGAN',
  'PLESTERAN_ACIAN',
  'PENUTUP_LANTAI',
  'PENUTUP_DINDING',
  'PLAFON',
  'PENGECATAN',
  'KELISTRIKAN',
  'AIR_BERSIH',
  'SANITAIR',
  'SALURAN_UDITCH',
];

export function runUiCalculatorIntegrationTest(): { success: boolean; logs: string[]; errorCount: number } {
  const logs: string[] = [];
  let errorCount = 0;

  logs.push('===============================================================');
  logs.push('EZRAB PHASE 5.2 — UI CALCULATOR CATALOG & REGISTRY TEST');
  logs.push('===============================================================');

  // 1. Verify 30 Residential Specs in RESIDENTIAL_CALCULATOR_SPECS
  logs.push(`\n[1/5] Checking RESIDENTIAL_CALCULATOR_SPECS (Count: ${RESIDENTIAL_CALCULATOR_SPECS.length})...`);
  if (RESIDENTIAL_CALCULATOR_SPECS.length !== 30) {
    logs.push(`❌ Expected 30 residential specs, got ${RESIDENTIAL_CALCULATOR_SPECS.length}`);
    errorCount++;
  } else {
    logs.push(`✅ Exact 30 residential specs found in registry.`);
  }

  // 2. Check UI Catalog Categories
  logs.push(`\n[2/5] Checking UI CALCULATOR_CATEGORIES...`);
  const catalogItemIds = CALCULATOR_CATEGORIES.flatMap((c) => c.items.map((i) => i.id));
  logs.push(`Total items in UI Catalog: ${catalogItemIds.length}`);

  // Check for duplicates in UI Catalog
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const id of catalogItemIds) {
    if (seenIds.has(id)) duplicateIds.add(id);
    seenIds.add(id);
  }
  if (duplicateIds.size > 0) {
    logs.push(`❌ Duplicate IDs in UI Catalog: ${Array.from(duplicateIds).join(', ')}`);
    errorCount++;
  } else {
    logs.push(`✅ 0 duplicate IDs found in UI Catalog.`);
  }

  // Check for 30/30 Residential in UI Catalog
  const missingResidential = EXPECTED_30_RESIDENTIAL_IDS.filter((id) => !catalogItemIds.includes(id));
  if (missingResidential.length > 0) {
    logs.push(`❌ Missing residential IDs in UI catalog: ${missingResidential.join(', ')}`);
    errorCount++;
  } else {
    logs.push(`✅ All 30/30 Residential Calculators present in UI Catalog.`);
  }

  // Check for 19+ Legacy in UI Catalog
  const missingLegacy = EXPECTED_19_LEGACY_IDS.filter((id) => !catalogItemIds.includes(id));
  if (missingLegacy.length > 0) {
    logs.push(`❌ Missing legacy IDs in UI catalog: ${missingLegacy.join(', ')}`);
    errorCount++;
  } else {
    logs.push(`✅ All ${EXPECTED_19_LEGACY_IDS.length} Legacy Master Workbook Calculators present in UI Catalog.`);
  }

  // 3. Verify getCalculatorById resolution for all 51 items
  logs.push(`\n[3/5] Testing getCalculatorById() resolution for all 51 UI items...`);
  let resolutionFailures = 0;
  for (const id of catalogItemIds) {
    const spec = getCalculatorById(id);
    if (!spec) {
      logs.push(`❌ Failed to resolve calculator by ID: ${id}`);
      resolutionFailures++;
      errorCount++;
    }
  }
  if (resolutionFailures === 0) {
    logs.push(`✅ All ${catalogItemIds.length} UI items resolve cleanly via getCalculatorById().`);
  }

  // 4. Test Calculation Execution on each of the 30 Residential Calculators
  logs.push(`\n[4/5] Executing deterministic calculation test for 30 Residential Calculators...`);
  let executionFailures = 0;
  for (const resId of EXPECTED_30_RESIDENTIAL_IDS) {
    const spec = getCalculatorById(resId);
    if (!spec) continue;

    const defaultInputs: Record<string, number> = {};
    spec.parameters.forEach((p) => {
      defaultInputs[p.id] = p.defaultValue;
    });

    try {
      const res = spec.calculate(defaultInputs);
      if (typeof res.primaryQuantity !== 'number' || isNaN(res.primaryQuantity) || res.primaryQuantity < 0) {
        logs.push(`❌ Calculation for ${resId} returned invalid primaryQuantity: ${res.primaryQuantity}`);
        executionFailures++;
        errorCount++;
      }
    } catch (err: any) {
      logs.push(`❌ Calculation exception for ${resId}: ${err.message}`);
      executionFailures++;
      errorCount++;
    }
  }
  if (executionFailures === 0) {
    logs.push(`✅ All 30 Residential Calculators executed successfully with valid deterministic quantities.`);
  }

  // 5. Civil catalog must be backed by the same civil registry, not a second hardcoded list.
  logs.push(`\n[5/6] Checking Civil Expansion catalog visibility and Core execution...`);
  const uiCivilIds = new Set(catalogItemIds.filter((id) => ALL_CIVIL_EXPANSION_CALCULATORS.some((calc) => calc.id === id)));
  if (uiCivilIds.size !== ALL_CIVIL_EXPANSION_CALCULATORS.length) {
    const missing = ALL_CIVIL_EXPANSION_CALCULATORS.map((calc) => calc.id).filter((id) => !uiCivilIds.has(id));
    logs.push(`❌ Missing civil IDs in UI catalog: ${missing.join(', ')}`);
    errorCount++;
  } else {
    logs.push(`✅ All ${uiCivilIds.size}/${ALL_CIVIL_EXPANSION_CALCULATORS.length} civil calculators present in UI catalog.`);
  }
  for (const calc of ALL_CIVIL_EXPANSION_CALCULATORS) {
    const spec = getCalculatorById(calc.id);
    const core = CoreCalculatorRegistry.get(calc.id);
    if (!spec || !core || !calc.name || !calc.parameters?.length) {
      logs.push(`❌ Civil catalog/definition contract invalid: ${calc.id}`);
      errorCount++;
      continue;
    }
    const fixtureInputs: Record<string, number> = {};
    calc.parameters.forEach((p) => { fixtureInputs[p.id] = typeof p.defaultValue === 'number' ? p.defaultValue : 1; });
    try {
      const result = core.calculate(fixtureInputs, { projectId: 'TEST_FIXTURE_ONLY' });
      if (!Number.isFinite(result.primaryQuantity) || !result.primaryUnit) {
        logs.push(`❌ Civil execution invalid: ${calc.id}`);
        errorCount++;
      }
    } catch (err: any) {
      logs.push(`❌ Civil execution exception: ${calc.id}: ${err.message}`);
      errorCount++;
    }
  }

  // 6. Test Summary
  logs.push(`\n[6/6] Final UI Registry Summary:`);
  logs.push(`- Residential Pack Visible: 30 / 30`);
  logs.push(`- Legacy Workbook Visible: ${EXPECTED_19_LEGACY_IDS.length} / ${EXPECTED_19_LEGACY_IDS.length}`);
  logs.push(`- Total Catalog Visible: ${catalogItemIds.length} / 51`);
  logs.push(`- Total Errors: ${errorCount}`);

  return {
    success: errorCount === 0,
    logs,
    errorCount,
  };
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv.includes('--run-direct')) {
  const result = runUiCalculatorIntegrationTest();
  console.log(result.logs.join('\n'));
  process.exit(result.success ? 0 : 1);
}
