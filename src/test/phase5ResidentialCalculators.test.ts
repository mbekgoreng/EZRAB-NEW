/**
 * EZRAB PHASE 5 & 5.1 — RESIDENTIAL BUILDING QUANTITY TAKEOFF TEST SUITE
 * Complete test suite covering all 30 residential capabilities, 8 shared generic engines,
 * forensic idempotency, fail-closed project isolation, and quantity chaining.
 */

declare const process: any;

import { CoreCalculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';
import { CalculationContext } from '../engine/calculatorCore/contracts/types';
import { QtoAdapter, QtoAdapterError } from '../engine/calculatorCore/adapters/qtoAdapter';
import { EarthworkEngine } from '../engine/calculatorCore/residential/engines/earthworkEngine';
import { FillLayerEngine } from '../engine/calculatorCore/residential/engines/fillLayerEngine';
import { ConcreteQuantityEngine } from '../engine/calculatorCore/residential/engines/concreteQuantityEngine';
import { ReinforcementQuantityEngine } from '../engine/calculatorCore/residential/engines/reinforcementQuantityEngine';
import { FormworkQuantityEngine } from '../engine/calculatorCore/residential/engines/formworkQuantityEngine';
import { OpeningEngine } from '../engine/calculatorCore/residential/engines/openingEngine';
import { WallQuantityEngine } from '../engine/calculatorCore/residential/engines/wallQuantityEngine';
import { RoofGeometryEngine } from '../engine/calculatorCore/residential/engines/roofGeometryEngine';
import { MEPQuantityEngine } from '../engine/calculatorCore/residential/engines/mepQuantityEngine';

export function runPhase5ResidentialTestSuite(): { success: boolean; passedCount: number; logs: string[] } {
  const logs: string[] = [];
  let passedCount = 0;

  function assert(condition: boolean, message: string) {
    if (!condition) {
      logs.push(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passedCount++;
    logs.push(`  [PASS] ${message}`);
  }

  logs.push('========================================================');
  logs.push('STARTING PHASE 5.1 RESIDENTIAL QUANTITY FORENSIC TESTS');
  logs.push('========================================================');

  const mockContext: CalculationContext = {
    projectId: 'PRJ-RESIDENTIAL-TEST',
    workspaceId: 'WS-RES-01',
    precisionPolicy: 'DECIMAL_2',
  };

  // [TEST GROUP 1] Earthwork & Fill Layer Engines
  logs.push('\n[TEST GROUP 1] Earthwork & Fill Layer Engines (01, 02, 03, 04, 06)');
  {
    // 01. Cut & Fill
    const cf = EarthworkEngine.calculateCutAndFill({ length: 20, width: 10, existingLevel: 1.0, proposedLevel: 0.5 });
    assert(cf.cutVolume === 100, 'Cut & Fill: 20x10m lower by 0.5m -> 100 m³ cut');
    assert(cf.fillVolume === 0, 'Cut & Fill: fill volume is 0');
    assert(cf.netVolume === -100, 'Cut & Fill: net volume is -100 m³');

    // 02. Excavation
    const exc = EarthworkEngine.calculateExcavation({ length: 45, depth: 1.0, topWidth: 0.90, bottomWidth: 0.70 });
    assert(exc.totalVolume === 36.0, 'Trapezoid Trench: ((0.9+0.7)/2)*1.0*45 = 36.0 m³');

    // 03. Backfill
    const bf = EarthworkEngine.calculateBackfill({ area: 60, thickness: 0.20 });
    assert(bf.totalVolume === 12.0, 'Backfill: 60 m² * 0.20 m = 12.0 m³');

    // 04 & 06. Fill Layers
    const sand = FillLayerEngine.calculate({ length: 45, width: 0.80, thickness: 0.05, materialType: 'sand' });
    assert(sand.volume === 1.80, 'Sand bedding: 45 * 0.80 * 0.05 = 1.80 m³');

    const lean = FillLayerEngine.calculate({ length: 12, width: 8, thickness: 0.05, materialType: 'lean_concrete' });
    assert(lean.volume === 4.80, 'Lean concrete: 12 * 8 * 0.05 = 4.80 m³');
  }

  // [TEST GROUP 2] Generic Concrete & Foundation Engines (05, 07, 25, 26, 27, 28, 29, 30)
  logs.push('\n[TEST GROUP 2] Concrete & Foundation Engines (05, 07, 25, 26, 27, 28, 29, 30)');
  {
    // 05. Pondasi Batu Kali
    const pon = ConcreteQuantityEngine.calculateTrapezoidStrip({ topWidth: 0.30, bottomWidth: 0.70, height: 0.80, length: 45.0 });
    assert(pon.totalVolume === 18.0, 'Pondasi Batu Kali: ((0.3+0.7)/2)*0.8*45 = 18.0 m³');

    // 07. Generic Prism (Beam / Column / Solid)
    const prism = ConcreteQuantityEngine.calculatePrism({ length: 6.0, width: 0.20, height: 0.30, quantity: 4 });
    assert(prism.totalVolume === 1.44, 'Concrete Prism: 6.0 * 0.20 * 0.30 * 4 = 1.44 m³');

    // 28. Concrete Slab with void deduction
    const slab = ConcreteQuantityEngine.calculateSlab({ length: 10.0, width: 8.0, thickness: 0.12, voidArea: 6.0 });
    assert(slab.totalVolume === 8.88, 'Concrete Slab: (80 - 6) * 0.12 = 8.88 m³');

    // 29. Concrete Stair
    const stair = ConcreteQuantityEngine.calculateStair({
      stairWidth: 1.0,
      waistThickness: 0.15,
      riserHeight: 0.18,
      treadDepth: 0.28,
      stepCount: 16,
      landingLength: 1.0,
      landingWidth: 1.0,
      landingThickness: 0.15,
    });
    assert(stair.totalVolume > 0, `Concrete Stair total volume: ${stair.totalVolume} m³`);
    assert(stair.details?.volSteps !== undefined, 'Step wedges volume calculated');
    assert(stair.details?.volWaist !== undefined, 'Waist slab volume calculated');

    // 30. Footing (Foot Plate)
    const ftp = ConcreteQuantityEngine.calculateFooting({
      pedestalWidth: 0.25,
      pedestalLength: 0.25,
      pedestalHeight: 1.50,
      padWidth: 0.70,
      padLength: 0.70,
      padThickness: 0.30,
      slopedHeight: 0.10,
      quantity: 5,
    });
    assert(ftp.totalVolume === 1.33, 'Footing: 5 units evaluate to 1.33 m³');
  }

  // [TEST GROUP 3] Reinforcement & Formwork Engines (08, 09)
  logs.push('\n[TEST GROUP 3] Reinforcement & Formwork Engines (08, 09)');
  {
    // 08. Reinforcement Schedule
    const rebar = ReinforcementQuantityEngine.calculate({
      bars: [
        { barMark: 'D16', diameterMm: 16, cutLengthM: 4.0, quantity: 20 },
        { barMark: 'D10', diameterMm: 10, cutLengthM: 1.2, quantity: 50 },
      ],
      wastePercentage: 5.0,
    });
    assert(rebar.totalLengthM === 140.0, 'Total rebar length: 20*4 + 50*1.2 = 140 m');
    assert(rebar.totalWeightKg > 0, `Total rebar weight with 5% waste: ${rebar.totalWeightKg} kg`);
    assert(rebar.weightByDiameter[16] > 0, 'Weight by diameter 16mm tracked');
    assert(rebar.weightByDiameter[10] > 0, 'Weight by diameter 10mm tracked');

    // 09. Formwork Active Face Selection
    const beamFw = FormworkQuantityEngine.calculateBeam({ length: 6.0, width: 0.20, height: 0.35, quantity: 2 });
    assert(beamFw.totalArea === 10.8, 'Beam formwork (2 sides + soffit): (2*0.35 + 0.20)*6*2 = 10.8 m²');

    const colFw = FormworkQuantityEngine.calculateColumn({ height: 3.0, width: 0.25, depth: 0.15, quantity: 4 });
    assert(colFw.totalArea === 9.6, 'Column 4-face formwork: 2*(0.25+0.15)*3*4 = 9.6 m²');
  }

  // [TEST GROUP 4] Wall, Opening & Finishing Engines (10, 11, 12, 13, 14, 15, 18)
  logs.push('\n[TEST GROUP 4] Wall, Opening & Finishing Engines (10, 11, 12, 13, 14, 15, 18)');
  {
    // 18. Openings Schedule
    const openings = OpeningEngine.calculate({
      openings: [
        { type: 'door', widthM: 0.9, heightM: 2.1, quantity: 2 },
        { type: 'window', widthM: 1.2, heightM: 1.5, quantity: 4 },
      ],
    });
    assert(openings.totalCount === 6, 'Total openings count: 6');
    assert(openings.totalOpeningAreaM2 === 10.98, 'Total opening area: 2*(0.9*2.1) + 4*(1.2*1.5) = 10.98 m²');

    // 10. Wall with opening deduction
    const wall = WallQuantityEngine.calculateWall({
      length: 32.0,
      height: 3.50,
      openingAreaM2: openings.totalOpeningAreaM2,
      gableWidthM: 6.0,
      gableHeightM: 2.0,
      gableCount: 1,
    });
    assert(wall.grossAreaM2 === 112.0, 'Gross wall area: 32 * 3.5 = 112 m²');
    assert(wall.gableAreaM2 === 6.0, 'Gable sopi-sopi area: 0.5 * 6 * 2 = 6 m²');
    assert(wall.netWallAreaM2 === 107.02, 'Net wall area: 112 + 6 - 10.98 = 107.02 m²');

    // 11. Plaster & Acian
    const plaster = WallQuantityEngine.calculatePlasterAcian({ netWallAreaM2: 100.0, twoSides: true });
    assert(plaster.plasterAreaM2 === 200.0, '2-sided plaster area: 200 m²');
    assert(plaster.acianAreaM2 === 200.0, '2-sided acian area: 200 m²');

    // 12. Floor Finish
    const floor = WallQuantityEngine.calculateTileFinish({ areaM2: 80.0, tileLengthCm: 60, tileWidthCm: 60 });
    assert(floor.netAreaM2 === 80.0, 'Floor tile net area: 80 m²');
    assert(floor.tileCount === 223, 'Tile count 60x60: 80 / 0.36 = 223 pcs');

    // 15. Paint
    const paint = WallQuantityEngine.calculatePaint({ surfaceAreaM2: 290.0, coats: 2, coverageRateM2PerLiter: 10 });
    assert(paint.totalVolumeLiters === 58.0, 'Paint volume: 290 * 2 / 10 = 58.0 Liters');
  }

  // [TEST GROUP 5] Roof Geometry & Cladding Engines (16, 17, 19)
  logs.push('\n[TEST GROUP 5] Roof Geometry & Cladding Engines (16, 17, 19)');
  {
    const roof = RoofGeometryEngine.calculate({
      buildingLengthM: 12.0,
      buildingWidthM: 8.0,
      overhangM: 0.80,
      pitchAngleDegrees: 30,
      effectiveCoverPieceAreaM2: 0.10,
    });
    assert(roof.totalSlopedRoofAreaM2 === 150.76, '3D Sloped roof area at 30°: 150.76 m²');
    assert(roof.ridgeLengthM === 13.6, 'Ridge length: 12 + 2*0.8 = 13.6 m');
    assert(roof.fasciaBoardLengthM === 46.4, 'Fascia board (lisplank): 2*(13.6 + 9.6) = 46.4 m');
    assert(roof.estimatedCoverPieceCount! > 0, 'Roof cover count evaluated');
  }

  // [TEST GROUP 6] MEP & Drainage Engine (20, 21, 22, 23, 24)
  logs.push('\n[TEST GROUP 6] MEP & Drainage Engine (20, 21, 22, 23, 24)');
  {
    // 20. Electrical
    const elc = MEPQuantityEngine.calculateElectrical({
      lightingPointsCount: 18,
      singleSwitchCount: 6,
      doubleSwitchCount: 4,
      socketOutletsCount: 12,
    });
    assert(elc.totalPoints === 40, 'Total electrical points: 18 + 6 + 4 + 12 = 40');
    assert(elc.cableLengthM === 320.0, 'Cable length: 40 * 8 = 320 m');

    // 21 & 22. Plumbing
    const plmb = MEPQuantityEngine.calculatePlumbing({
      segments: [
        { pipeType: 'clean_water', lengthM: 56.0 },
        { pipeType: 'soil', lengthM: 18.0 },
        { pipeType: 'waste', lengthM: 24.0 },
      ],
    });
    assert(plmb.totalLengthM === 98.0, 'Total plumbing pipe length: 56 + 18 + 24 = 98 m');

    // 23. Sanitary
    const san = MEPQuantityEngine.calculateSanitary({
      waterClosetDudukCount: 2,
      washBasinCount: 2,
      showerSetCount: 2,
      floorDrainCount: 3,
    });
    assert(san.totalUnits === 9, 'Total sanitary units: 2 + 2 + 2 + 3 = 9');

    // 24. Drainage
    const drain = MEPQuantityEngine.calculateDrainage({ lengthM: 30.0, topWidthM: 0.40, depthM: 0.40 });
    assert(drain.excavationVolumeM3 === 4.80, 'Drainage excavation: 30 * 0.40 * 0.40 = 4.80 m³');
  }

  // [TEST GROUP 7] Registry Invocation & QTO Compatibility for all 30 capabilities
  logs.push('\n[TEST GROUP 7] Registry Invocation & QTO Integration for 30 Capabilities');
  {
    const capabilityIds = [
      'residential.cut_and_fill',
      'residential.galian_tanah',
      'residential.urugan_tanah',
      'residential.pasir_batu_urug',
      'residential.pondasi_batu_kali',
      'residential.lantai_kerja',
      'residential.beton',
      'residential.pembesian',
      'residential.bekisting',
      'residential.dinding',
      'residential.plester_acian',
      'residential.penutup_lantai',
      'residential.penutup_dinding',
      'residential.plafon',
      'residential.pengecatan',
      'residential.atap_baja_ringan',
      'residential.penutup_atap',
      'residential.pintu_jendela',
      'residential.talang_lisplank',
      'residential.instalasi_listrik_basic',
      'residential.instalasi_air_bersih',
      'residential.air_kotor_bekas',
      'residential.sanitair',
      'residential.drainase',
      'residential.sloof',
      'residential.kolom',
      'residential.balok',
      'residential.plat_lantai',
      'residential.tangga_beton',
      'residential.pondasi_beton_footing',
    ];

    for (const id of capabilityIds) {
      assert(CoreCalculatorRegistry.has(id), `Calculator "${id}" is registered in CoreCalculatorRegistry`);
      const output = CoreCalculatorRegistry.calculate(id, {}, mockContext);
      assert(output.primaryQuantity >= 0, `Execution of "${id}" yielded non-negative primary quantity (${output.primaryQuantity} ${output.primaryUnit})`);

      // QTO Adapter compatibility test
      const qto = QtoAdapter.toQtoItem(output, mockContext);
      assert(qto.projectId === mockContext.projectId, `QTO Item for "${id}" has authoritative projectId`);
      assert(qto.quantity === output.primaryQuantity, `QTO Item for "${id}" has matching quantity`);
    }
  }

  // [TEST GROUP 8] Forensic Idempotency Verification
  logs.push('\n[TEST GROUP 8] Forensic Idempotency Verification');
  {
    const inputSample = { length: 30.0, topWidth: 0.90, bottomWidth: 0.70, depth: 1.20 };
    const run1 = CoreCalculatorRegistry.calculate('residential.galian_tanah', inputSample, mockContext);
    const run2 = CoreCalculatorRegistry.calculate('residential.galian_tanah', inputSample, mockContext);
    const run3 = CoreCalculatorRegistry.calculate('residential.galian_tanah', inputSample, mockContext);

    assert(run1.primaryQuantity === run2.primaryQuantity && run2.primaryQuantity === run3.primaryQuantity, 'Galian Tanah: Primary quantity is exactly identical across repeated executions');
    assert(JSON.stringify(run1.breakdown) === JSON.stringify(run2.breakdown), 'Galian Tanah: Breakdown payload is identical across executions');
  }

  // [TEST GROUP 9] Forensic Project Isolation (Fail Closed)
  logs.push('\n[TEST GROUP 9] Forensic Project Isolation Fail-Closed Verification');
  {
    const output = CoreCalculatorRegistry.calculate('residential.beton', { length: 6, width: 0.2, height: 0.3 }, mockContext);
    
    // Attempt with empty projectId
    let caughtEmpty = false;
    try {
      QtoAdapter.toQtoItem(output, { projectId: '' } as any);
    } catch (e: any) {
      if (e instanceof QtoAdapterError || e.message.includes('Project ID is required')) {
        caughtEmpty = true;
      }
    }
    assert(caughtEmpty, 'QtoAdapter strictly throws error on empty projectId (Fail-Closed)');

    // Attempt with null projectId
    let caughtNull = false;
    try {
      QtoAdapter.toQtoItem(output, { projectId: null } as any);
    } catch (e: any) {
      if (e instanceof QtoAdapterError || e.message.includes('Project ID is required')) {
        caughtNull = true;
      }
    }
    assert(caughtNull, 'QtoAdapter strictly throws error on null projectId (Fail-Closed)');
  }

  // [TEST GROUP 10] Forensic Single Quantity Chaining (Opening Deduction Integrity)
  logs.push('\n[TEST GROUP 10] Single Quantity Chaining (Opening Deduction Integrity)');
  {
    // Upstream Openings Producer
    const openings = OpeningEngine.calculate({
      openings: [{ type: 'door', widthM: 0.9, heightM: 2.1, quantity: 2 }],
    });
    assert(openings.totalOpeningAreaM2 === 3.78, 'OpeningEngine produced 3.78 m² opening area');

    // Wall Producer deducts opening once
    const wall = WallQuantityEngine.calculateWall({
      length: 20.0,
      height: 3.0,
      openingAreaM2: openings.totalOpeningAreaM2,
    });
    assert(wall.grossAreaM2 === 60.0, 'Gross wall: 60.0 m²');
    assert(wall.netWallAreaM2 === 56.22, 'Net wall after single opening deduction: 56.22 m²');

    // Downstream Plaster consumes Net Wall directly without re-deducting
    const plaster = WallQuantityEngine.calculatePlasterAcian({
      netWallAreaM2: wall.netWallAreaM2,
      twoSides: false,
    });
    assert(plaster.plasterAreaM2 === 56.22, 'Plaster consumes Net Wall Area directly (no double deduction)');
  }

  logs.push('\n========================================================');
  logs.push(`PHASE 5.1 TEST SUMMARY: ${passedCount} PASSED, 0 FAILED`);
  logs.push('========================================================\n');

  return {
    success: true,
    passedCount,
    logs,
  };
}

if (process.argv[1]?.endsWith('phase5ResidentialCalculators.test.ts') || process.argv[1]?.endsWith('phase5ResidentialCalculators.test.js')) {
  try {
    const res = runPhase5ResidentialTestSuite();
    console.log(res.logs.join('\n'));
    if (!res.success) process.exit(1);
  } catch (err: any) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}
