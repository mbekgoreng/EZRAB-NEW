/**
 * EZRAB CALCULATOR CORE — COMPREHENSIVE TEST SUITE
 * Unit and integration tests for all Core Calculator Engine modules.
 */

import {
  calculatorRegistry,
  UnitEngine,
  UnitConversionError,
  PrecisionEngine,
  NumericValidationError,
  ValidationEngine,
  DependencyEngine,
  DependencyGraphError,
  ProvenanceEngine,
  ExecutionTraceBuilder,
  PackRegistry,
  QtoAdapter,
  QtoAdapterError,
  RabAdapter,
  CalculationContext,
  MASTER_WORKBOOK_SHA256,
} from '../engine/calculatorCore';

export function runCoreCalculatorTestSuite(): {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  logs: string[];
} {
  const logs: string[] = [];
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail = '') {
    if (condition) {
      passedTests++;
      logs.push(`  [PASS] ${testName}`);
    } else {
      failedTests++;
      logs.push(`  [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      console.error(`FAILED: ${testName}`, detail);
    }
  }

  logs.push('========================================================');
  logs.push('STARTING EZRAB CORE CALCULATOR ENGINE TEST SUITE');
  logs.push('========================================================');

  const mockContext: CalculationContext = {
    projectId: 'PRJ-TEST-2026',
    workspaceId: 'WS-TEST-001',
    precisionPolicy: 'DECIMAL_2',
  };

  // ----------------------------------------------------
  // TEST GROUP 1: UNIT ENGINE
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 1] Unit Engine Tests');
  try {
    // Length conversions
    assert(UnitEngine.convert(100, 'cm', 'm') === 1, '100 cm -> 1 m');
    assert(UnitEngine.convert(1000, 'mm', 'm') === 1, '1000 mm -> 1 m');
    assert(UnitEngine.convert(2.5, 'm', 'cm') === 250, '2.5 m -> 250 cm');
    assert(UnitEngine.convert(5, 'm', 'mm') === 5000, '5 m -> 5000 mm');

    // Mass conversions
    assert(UnitEngine.convert(1000, 'kg', 'ton') === 1, '1000 kg -> 1 ton');
    assert(UnitEngine.convert(2.5, 'ton', 'kg') === 2500, '2.5 ton -> 2500 kg');
    assert(UnitEngine.convert(500, 'g', 'kg') === 0.5, '500 g -> 0.5 kg');

    // Area & Volume conversions
    assert(UnitEngine.convert(10000, 'cm2', 'm2') === 1, '10000 cm2 -> 1 m2');
    assert(UnitEngine.convert(1000, 'liter', 'm3') === 1, '1000 liter -> 1 m3');

    // Incompatible conversions must throw
    let threwIncompatible = false;
    try {
      UnitEngine.convert(10, 'm', 'kg');
    } catch (e) {
      if (e instanceof UnitConversionError) threwIncompatible = true;
    }
    assert(threwIncompatible, 'Incompatible conversion (m -> kg) throws UnitConversionError');

    // Unknown unit must throw
    let threwUnknown = false;
    try {
      UnitEngine.convert(10, 'unknown_unit', 'm');
    } catch (e) {
      if (e instanceof UnitConversionError) threwUnknown = true;
    }
    assert(threwUnknown, 'Unknown unit throws UnitConversionError');
  } catch (err: any) {
    assert(false, 'Unit Engine unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 2: PRECISION & NUMERIC ENGINE
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 2] Precision & Numeric Engine Tests');
  try {
    // Safe arithmetic
    assert(PrecisionEngine.multiply(100000, 0.125) === 12500, 'Exact multiplication (100000 * 0.125 = 12500)');
    assert(PrecisionEngine.add(0.1, 0.2) === 0.3, 'Exact addition (0.1 + 0.2 = 0.3 without floating drift)');
    assert(PrecisionEngine.subtract(10.5, 3.2) === 7.3, 'Exact subtraction (10.5 - 3.2 = 7.3)');
    assert(PrecisionEngine.divide(10, 4) === 2.5, 'Exact division (10 / 4 = 2.5)');

    // Division by zero guard
    let threwDivZero = false;
    try {
      PrecisionEngine.divide(10, 0);
    } catch (e) {
      if (e instanceof NumericValidationError) threwDivZero = true;
    }
    assert(threwDivZero, 'Division by zero throws NumericValidationError');

    // Validation checks
    assert(PrecisionEngine.validateNumber(10, { min: 1, max: 100 }) === 10, 'Valid number validation');
    assert(PrecisionEngine.validateNumber(0, { allowZero: true }) === 0, 'Zero preservation when allowed');

    // Invalid negative guard
    let threwNegative = false;
    try {
      PrecisionEngine.validateNumber(-5, { allowNegative: false });
    } catch (e) {
      if (e instanceof NumericValidationError) threwNegative = true;
    }
    assert(threwNegative, 'Negative value rejected when allowNegative is false');

    // NaN / non-numeric guard
    let threwNaN = false;
    try {
      PrecisionEngine.validateNumber('abc', { fieldName: 'testField' });
    } catch (e) {
      if (e instanceof NumericValidationError) threwNaN = true;
    }
    assert(threwNaN, 'Non-numeric string rejected explicitly without silent zero fallback');

    // Precision policies
    assert(PrecisionEngine.applyPolicy(12.34567, 'DECIMAL_2') === 12.35, 'Policy DECIMAL_2 round half-up');
    assert(PrecisionEngine.applyPolicy(12.34567, 'DECIMAL_4') === 12.3457, 'Policy DECIMAL_4');
    assert(PrecisionEngine.applyPolicy(12.1, 'INTEGER_CEIL') === 13, 'Policy INTEGER_CEIL');
  } catch (err: any) {
    assert(false, 'Precision Engine unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 3: VALIDATION ENGINE
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 3] Validation Engine Tests');
  try {
    const rules = [
      { id: 'length', label: 'Panjang', unit: 'm', required: true, min: 1, max: 100 },
      { id: 'count', label: 'Jumlah', unit: 'bh', required: false, integerOnly: true, defaultValue: 5 },
      { id: 'zeroAllowed', label: 'Offset', unit: 'm', required: true, allowZero: true },
    ];

    // Valid inputs
    const valGood = ValidationEngine.validate({ length: 20, count: 4, zeroAllowed: 0 }, rules);
    assert(valGood.isValid, 'Validation passes with compliant inputs');
    assert(valGood.sanitizedInputs.count === 4, 'Sanitized input preserved');

    // Missing required field
    const valMissing = ValidationEngine.validate({ count: 4, zeroAllowed: 0 }, rules);
    assert(!valMissing.isValid, 'Validation fails when required field is missing');
    assert(valMissing.errors[0].code === 'ERR_REQUIRED_FIELD_MISSING', 'Error code ERR_REQUIRED_FIELD_MISSING');

    // Default value used when optional field missing
    const valDefault = ValidationEngine.validate({ length: 15, zeroAllowed: 0 }, rules);
    assert(valDefault.isValid, 'Validation passes using optional defaultValue');
    assert(valDefault.sanitizedInputs.count === 5, 'Optional field defaulted correctly');

    // Non-integer rejected for integerOnly
    const valFloat = ValidationEngine.validate({ length: 15, count: 3.5, zeroAllowed: 0 }, rules);
    assert(!valFloat.isValid, 'Integer only constraint rejects decimals');
  } catch (err: any) {
    assert(false, 'Validation Engine unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 4: DEPENDENCY DAG ENGINE
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 4] Dependency DAG Engine Tests');
  try {
    const dag = new DependencyEngine();

    // Node A (Wall)
    dag.registerNode('building.wall', '1.0.0', []);

    // Node B (Plaster) depends on Wall
    dag.registerNode('building.plaster', '1.0.0', [
      {
        sourceCalculatorId: 'building.wall',
        sourceOutputField: 'primaryQuantity',
        targetParameter: 'wallArea',
        status: 'active',
        policy: 'USE_NET',
      },
    ]);

    // Node C (Paint) depends on Plaster
    dag.registerNode('building.paint', '1.0.0', [
      {
        sourceCalculatorId: 'building.plaster',
        sourceOutputField: 'primaryQuantity',
        targetParameter: 'plasterArea',
        status: 'active',
        policy: 'USE_NET',
      },
    ]);

    // Check no cycle
    assert(dag.detectCycle() === null, 'Linear DAG detects no cycle');

    // Topological execution order
    const plan = dag.getExecutionPlan(['building.paint']);
    assert(
      plan.length === 3 && plan[0] === 'building.wall' && plan[1] === 'building.plaster' && plan[2] === 'building.paint',
      'Topological execution order: Wall -> Plaster -> Paint'
    );

    // Cycle detection test
    const cyclicDag = new DependencyEngine();
    cyclicDag.registerNode('nodeA', '1.0', [
      { sourceCalculatorId: 'nodeB', sourceOutputField: 'primary', targetParameter: 'x', status: 'active', policy: 'USE_NET' },
    ]);
    cyclicDag.registerNode('nodeB', '1.0', [
      { sourceCalculatorId: 'nodeA', sourceOutputField: 'primary', targetParameter: 'y', status: 'active', policy: 'USE_NET' },
    ]);

    const cyclePath = cyclicDag.detectCycle();
    assert(cyclePath !== null && cyclePath.length > 0, 'Cyclic graph correctly detected by DFS cycle detector');
  } catch (err: any) {
    assert(false, 'Dependency DAG Engine unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 5: PROVENANCE & EXECUTION TRACE
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 5] Provenance & Execution Trace Tests');
  try {
    const prov = ProvenanceEngine.createExcelProvenance({
      calculatorId: 'BOWPLANK',
      calculatorVersion: '1.0',
      formulaId: 'QTO.01.BOW',
      mathematicalExpression: '2*(P+L+2*C)',
      sheet: 'Bowplank',
      cell: 'I10',
    });

    assert(prov.sourceHash === MASTER_WORKBOOK_SHA256, 'Workbook SHA256 hash matched in provenance');
    assert(prov.sourceType === 'excel_reference', 'Source type is excel_reference');
    assert(prov.status === 'PARTIALLY_VERIFIED', 'Initial provenance status is PARTIALLY_VERIFIED');

    const trace = new ExecutionTraceBuilder('TEST_CALC', '1.0.0')
      .setInputs({ P: 10, L: 5 })
      .addStep({
        code: 'STEP_1',
        description: 'Luas Bidang',
        formulaText: '10 × 5',
        evaluatedExpression: '10 * 5',
        calculatedValue: 50,
        unit: 'm²',
      })
      .setPrimaryResult(50, 'm2', 'Luas Total')
      .build();

    assert(trace.formulaSteps.length === 1, 'Trace recorded 1 step');
    assert(trace.primaryResult.quantity === 50, 'Trace recorded primary result');
    assert(trace.narrativeExplanation.includes('50 m2'), 'Trace built narrative explanation for AI/UI');
  } catch (err: any) {
    assert(false, 'Provenance & Trace unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 6: CALCULATOR PACKS & CORE REGISTRY
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 6] Calculator Packs & Core Registry Tests');
  try {
    // Verify Packs
    const packs = PackRegistry.listPacks();
    assert(packs.length >= 6, `Found ${packs.length} packs (Building, Road, Paving, Water-Structure, Bridge, Steel)`);
    assert(PackRegistry.hasPack('building'), 'Pack "building" exists');
    assert(PackRegistry.hasPack('road'), 'Pack "road" exists');
    assert(PackRegistry.hasPack('paving'), 'Pack "paving" exists');
    assert(PackRegistry.hasPack('steel'), 'Pack "steel" exists');

    // Verify Calculators in Registry
    assert(calculatorRegistry.has('BOWPLANK'), 'Registry has legacy BOWPLANK');
    assert(calculatorRegistry.has('PONDASI_BATU_KALI'), 'Registry has legacy PONDASI_BATU_KALI');
    assert(calculatorRegistry.has('road.geometry'), 'Registry has road.geometry');
    assert(calculatorRegistry.has('paving.geometry'), 'Registry has paving.geometry');
    assert(calculatorRegistry.has('building.earthwork.galian'), 'Registry has building.earthwork.galian');
    assert(calculatorRegistry.has('building.fence'), 'Registry has building.fence');

    // Alias resolution
    assert(calculatorRegistry.has('road.area'), 'Alias "road.area" resolved');
    assert(calculatorRegistry.has('paving.area'), 'Alias "paving.area" resolved');

    // Calculator by pack
    const roadCalcs = calculatorRegistry.getByPack('road');
    assert(roadCalcs.length >= 1, `Found ${roadCalcs.length} calculators in "road" pack`);
  } catch (err: any) {
    assert(false, 'Registry & Packs unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 7: ROAD & PAVING CALCULATORS EXECUTION
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 7] Road & Paving Calculators Execution');
  try {
    // Road Geometry: P=100m, L=6m, T=0.05m
    const roadOutput = calculatorRegistry.calculate(
      'road.geometry',
      { panjang: 100, lebar: 6.0, tebalPerkerasan: 0.05, lebarBahu: 1.0 },
      mockContext
    );
    // Luas = 100 * 6 = 600 m2
    // Volume = 600 * 0.05 = 30 m3
    assert(roadOutput.primaryQuantity === 600, `Road area = 600 m2 (got ${roadOutput.primaryQuantity})`);
    assert(roadOutput.breakdown.volumePerkerasan === 30, `Road volume = 30 m3 (got ${roadOutput.breakdown.volumePerkerasan})`);
    assert(roadOutput.provenance.length > 0, 'Road output has provenance');
    assert(roadOutput.trace !== undefined, 'Road output has execution trace');

    // Paving Geometry: P=20m, L=10m, Tb=0.05m, Tp=0.15m
    const pavingOutput = calculatorRegistry.calculate(
      'paving.geometry',
      { panjang: 20, lebar: 10, tebalBedding: 0.05, tebalBase: 0.15 },
      mockContext
    );
    // Luas = 200 m2
    // Vol Bedding = 200 * 0.05 = 10 m3
    // Vol Base = 200 * 0.15 = 30 m3
    assert(pavingOutput.primaryQuantity === 200, `Paving area = 200 m2 (got ${pavingOutput.primaryQuantity})`);
    assert(pavingOutput.breakdown.volumePasirBedding === 10, `Paving bedding vol = 10 m3 (got ${pavingOutput.breakdown.volumePasirBedding})`);
    assert(pavingOutput.breakdown.volumeLapisPondasiBase === 30, `Paving base vol = 30 m3 (got ${pavingOutput.breakdown.volumeLapisPondasiBase})`);
  } catch (err: any) {
    assert(false, 'Road & Paving execution unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 8: 19 LEGACY CALCULATORS INTEGRITY
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 8] Legacy 19 Calculators Execution via Core Adapter');
  try {
    // 1. Bowplank (P=12, L=8, C=0.6, H=1, R=2) -> Perimeter = 42.40 m
    const bowplankRes = calculatorRegistry.calculate(
      'BOWPLANK',
      { P: 12, L: 8, C: 0.6, H: 1.0, R: 2.0 },
      mockContext
    );
    assert(bowplankRes.primaryQuantity === 42.4, `Bowplank perimeter = 42.40 m (got ${bowplankRes.primaryQuantity})`);
    assert(bowplankRes.detailedBreakdown.length > 0, 'Bowplank generated detailed breakdown lines');

    // 2. Pondasi Batu Kali
    const pondasiRes = calculatorRegistry.calculate(
      'PONDASI',
      {
        a1: 0.9,
        b1Galian: 0.9,
        c1: 1.05,
        P: 45.0,
        a2: 0.3,
        b2: 0.7,
        c2: 0.8,
        d: 0.2,
        e: 0.05,
        f: 0.4,
        urukanSamping: 25,
        panjangBangunan: 9,
        lebarBangunan: 6,
        tipeCampuran: 2,
      },
      mockContext
    );
    assert(pondasiRes.primaryQuantity > 0, `Pondasi Batu Kali calculated quantity: ${pondasiRes.primaryQuantity} ${pondasiRes.primaryUnit}`);

    // 3. Foot Plate
    const footPlateRes = calculatorRegistry.calculate(
      'FOOT_PLATE',
      {
        a1: 0.25,
        a2: 0.25,
        b1: 0.7,
        b2: 0.7,
        h1: 1.5,
        h2: 0.1,
        h3: 0.3,
        h4: 0.05,
        h5: 0.1,
        N: 5,
        d1: 16,
        d2: 16,
        d3: 10,
        diaKawat: 1.2,
        nUtama: 3,
        nSupport: 3,
        r1: 0.15,
        pKawat: 0.35,
        d4: 13,
        d5: 13,
        d6: 10,
        r2: 0.15,
        selimut: 0.03,
        massaJenis: 7850,
      },
      mockContext
    );
    assert(footPlateRes.primaryQuantity > 0, `Foot Plate volume: ${footPlateRes.primaryQuantity} ${footPlateRes.primaryUnit}`);

    // 4. Sloof
    const sloofRes = calculatorRegistry.calculate(
      'SLOOF',
      {
        P: 3.0,
        b: 0.2,
        h: 0.3,
        N: 4,
        d1: 12,
        d2: 8,
        r: 0.15,
        diaKawat: 1.2,
        pKawat: 0.35,
        selimut: 2.5,
        massaJenis: 7850,
        faktorKait: 1.05,
      },
      mockContext
    );
    assert(sloofRes.primaryQuantity > 0, `Sloof volume: ${sloofRes.primaryQuantity} ${sloofRes.primaryUnit}`);
  } catch (err: any) {
    assert(false, 'Legacy calculators execution unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 9: QTO ADAPTER & PROJECT ISOLATION
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 9] QTO Adapter & Project Isolation (Fail-Closed)');
  try {
    const calcOutput = calculatorRegistry.calculate(
      'BOWPLANK',
      { P: 12, L: 8, C: 0.6, H: 1.0, R: 2.0 },
      mockContext
    );

    // A. Valid QTO Conversion
    const qtoItem = QtoAdapter.toQtoItem(calcOutput, mockContext, {
      customUraian: 'Pengukuran & Pemasangan Bowplank Proyek A',
    });
    assert(qtoItem.projectId === mockContext.projectId, 'QTO Item has authoritative projectId');
    assert(qtoItem.quantity === 42.4, 'QTO Item has exact calculated quantity');
    assert(qtoItem.status === 'CALCULATED', 'QTO Item status is CALCULATED');

    // B. Fail-Closed on missing projectId
    let threwFailClosed = false;
    try {
      QtoAdapter.toQtoItem(calcOutput, { projectId: '' });
    } catch (e) {
      if (e instanceof QtoAdapterError) threwFailClosed = true;
    }
    assert(threwFailClosed, 'QTO Adapter fails closed on empty/missing projectId');
  } catch (err: any) {
    assert(false, 'QTO Adapter unhandled error', err.message);
  }

  // ----------------------------------------------------
  // TEST GROUP 10: RAB ADAPTER & PRICING LOOKUP
  // ----------------------------------------------------
  logs.push('\n[TEST GROUP 10] RAB Adapter & Authoritative Pricing Lookup');
  try {
    const mockQto = {
      id: 'QTO-TEST-001',
      projectId: 'PRJ-TEST-2026',
      calculatorId: 'BOWPLANK',
      formulaId: 'QTO.01.BOW',
      formulaVersion: '1.0',
      kode: 'QTO.01.BOW.01',
      uraian: 'Bowplank',
      quantity: 42.4,
      unit: 'm',
      status: 'CALCULATED' as const,
      source: 'CALCULATOR' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Successful sync with authoritative price
    const mockPricingResolver = (ahspCode: string, projectId: string) => {
      if (ahspCode === 'A.2.2.1.4') {
        return {
          found: true,
          ahspCode: 'A.2.2.1.4',
          ahspName: 'Pengukuran dan Pemasangan 1 m\' Bouwplank',
          unitPrice: 95400,
          priceSource: 'SNI_2026_AUTHORITATIVE',
        };
      }
      return { found: false };
    };

    const rabSuccess = RabAdapter.syncToRabItem(mockQto, mockPricingResolver, {
      ahspCode: 'A.2.2.1.4',
      targetSectionName: 'Pekerjaan Persiapan',
    });

    assert(rabSuccess.status === 'SUCCESS', 'RAB sync succeeded with authoritative AHSP');
    assert(rabSuccess.rabItem !== undefined, 'RAB item generated');
    // 42.40 * 95400 = 4,044,960
    assert(rabSuccess.rabItem?.amount === 4044960, `RAB Amount = Rp 4.044.960 (got ${rabSuccess.rabItem?.amount})`);

    // 2. AHSP not found fails explicitly
    const rabMissingAhsp = RabAdapter.syncToRabItem(mockQto, mockPricingResolver, {
      ahspCode: 'NON_EXISTENT_AHSP',
    });
    assert(rabMissingAhsp.status === 'AHSP_NOT_FOUND', 'Missing AHSP returns status AHSP_NOT_FOUND without fallback guessing');

    // 3. Price not found fails explicitly
    const mockResolverNoPrice = () => ({
      found: true,
      ahspCode: 'A.2.2.1.4',
      unitPrice: undefined,
    });
    const rabMissingPrice = RabAdapter.syncToRabItem(mockQto, mockResolverNoPrice, {
      ahspCode: 'A.2.2.1.4',
    });
    assert(rabMissingPrice.status === 'PRICE_NOT_FOUND', 'Missing price returns status PRICE_NOT_FOUND without silent default');
  } catch (err: any) {
    assert(false, 'RAB Adapter unhandled error', err.message);
  }

  logs.push('\n========================================================');
  logs.push(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${passedTests + failedTests} tests`);
  logs.push('========================================================');

  return {
    success: failedTests === 0,
    totalTests: passedTests + failedTests,
    passedTests,
    failedTests,
    logs,
  };
}

// Direct runner if executed via node / tsx
const runtimeProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
if (runtimeProcess?.argv && runtimeProcess.argv[1]?.includes('coreCalculatorEngine.test')) {
  const result = runCoreCalculatorTestSuite();
  console.log(result.logs.join('\n'));
  if (!result.success) {
    runtimeProcess.exit(1);
  }
}
