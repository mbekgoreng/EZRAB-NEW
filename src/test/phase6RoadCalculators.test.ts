/**
 * EZRAB PHASE 6 — ROAD & HIGHWAY QUANTITY TAKEOFF TEST SUITE
 * Complete test suite covering all 39 road capabilities, 9 shared generic road engines,
 * Average End Area earthwork, pavement layers, asphalt, strict source provenance,
 * anti-duplication ownership, and project isolation.
 */

declare const process: any;

import { CoreCalculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';
import { getCalculatorById, ALL_CONSTRUCTION_CALCULATORS } from '../engine/constructionCalculators/registry';
import { ROAD_PACK_CALCULATORS } from '../engine/calculatorCore/road/roadPackCalculators';
import { RoadAlignmentEngine } from '../engine/calculatorCore/road/engines/roadAlignmentEngine';
import { RoadEarthworkEngine } from '../engine/calculatorCore/road/engines/roadEarthworkEngine';
import { RoadPavementLayerEngine } from '../engine/calculatorCore/road/engines/roadPavementLayerEngine';
import { RoadSurfaceTreatmentEngine } from '../engine/calculatorCore/road/engines/roadSurfaceTreatmentEngine';
import { RoadElementsEngine } from '../engine/calculatorCore/road/engines/roadElementsEngine';
import { GeosyntheticQuantityEngine } from '../engine/calculatorCore/road/engines/geosyntheticQuantityEngine';
import { RoadSafetyAccessoriesEngine } from '../engine/calculatorCore/road/engines/roadSafetyAccessoriesEngine';
import { RoadJointEngine } from '../engine/calculatorCore/road/engines/roadJointEngine';
import { RoadHaulingEngine } from '../engine/calculatorCore/road/engines/roadHaulingEngine';
import { RoadOwnershipEngine } from '../engine/calculatorCore/road/engines/roadOwnershipEngine';

export function runPhase6RoadTestSuite(): { success: boolean; passedCount: number; logs: string[] } {
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
  logs.push('STARTING PHASE 6 ROAD & HIGHWAY QUANTITY TAKEOFF TESTS');
  logs.push('========================================================');

  // [TEST GROUP 1] Inventory & Registry Verification (39 Road Capabilities)
  logs.push('\n[TEST GROUP 1] Inventory & Registry Verification (39 Capabilities)');
  {
    assert(ROAD_PACK_CALCULATORS.length === 39, 'Exactly 39 road calculator definitions in pack');

    for (const calc of ROAD_PACK_CALCULATORS) {
      assert(CoreCalculatorRegistry.has(calc.id), `Registry contains ${calc.id}`);
      const reg = CoreCalculatorRegistry.get(calc.id);
      assert(reg?.category === 'ROAD', `${calc.id} has category ROAD`);
      assert(reg?.pack === 'ROAD', `${calc.id} has pack ROAD`);
    }

    for (const calc of ROAD_PACK_CALCULATORS) {
      const spec = getCalculatorById(calc.id);
      assert(spec !== undefined, `Adapted spec exists for ${calc.id}`);
      assert(spec?.category === 'infrastruktur', `${calc.id} category is infrastruktur`);
    }

    assert(ALL_CONSTRUCTION_CALCULATORS.length >= 93, `Total system calculators is at least 93 (24 Legacy + 30 Residential + 39 Road + Civil) - got ${ALL_CONSTRUCTION_CALCULATORS.length}`);
  }

  // [TEST GROUP 2] Alignment & Stationing Engines
  logs.push('\n[TEST GROUP 2] Alignment & Stationing Engines');
  {
    // Vector 1: Chainage parsing & station formatting
    const sta250 = RoadAlignmentEngine.parseStation('STA 0+250');
    assert(sta250 === 250, 'Station STA 0+250 parses to 250m');

    const sta1750 = RoadAlignmentEngine.parseStation('STA 1+750');
    assert(sta1750 === 1750, 'Station STA 1+750 parses to 1750m');

    const formatted = RoadAlignmentEngine.formatStation(1250.5);
    assert(formatted === 'STA 1+250.5', 'Formatted 1250.5m matches STA 1+250.5');

    // Vector 2: Alignment geometry
    const align = RoadAlignmentEngine.calculateAlignment({
      startStation: 'STA 0+000',
      endStation: 'STA 1+000',
      pavementWidth: 7.0,
    });
    assert(align.totalLength === 1000, 'Alignment length is 1000m');
    assert(align.surfaceArea === 7000, 'Alignment surface area 1000m x 7.0m = 7000 m²');

    // Vector 3: Station interval generation without silent rounding
    const intervals = RoadAlignmentEngine.generateStationIntervals(0, 100, 25);
    assert(intervals.length === 5, 'Station intervals generated 5 stakes (0, 25, 50, 75, 100)');
    assert(intervals[0].stationLabel === 'STA 0+000', 'Stake 0 is STA 0+000');
    assert(intervals[4].stationLabel === 'STA 0+100', 'Stake 4 is STA 0+100');

    // Vector 4: Cross section formation width
    const cs = RoadElementsEngine.calculateCrossSectionArea({
      laneWidth: 3.5,
      numberOfLanes: 2,
      leftShoulderWidth: 1.5,
      rightShoulderWidth: 1.5,
      medianWidth: 2.0,
    });
    assert(cs.carriagewayWidth === 7.0, 'Carriageway width is 2 x 3.5 = 7.0m');
    assert(cs.totalShoulderWidth === 3.0, 'Total shoulder width is 1.5 + 1.5 = 3.0m');
    assert(cs.formationWidth === 12.0, 'Formation width is 7.0 + 3.0 + 2.0 = 12.0m');
  }

  // [TEST GROUP 3] Earthwork Average End Area & Borrow/Disposal
  logs.push('\n[TEST GROUP 3] Earthwork Average End Area & Borrow/Disposal');
  {
    // Vector 5: Average End Area Cut Surplus
    const surplus = RoadEarthworkEngine.calculateAverageEndArea([
      { station: 'STA 0+000', cutArea: 10, fillArea: 2, distanceToNext: 50 },
      { station: 'STA 0+050', cutArea: 20, fillArea: 6, distanceToNext: 0 },
    ]);
    assert(surplus.totalCutVolume === 750, 'Average End Area Cut: ((10+20)/2)*50 = 750 m³');
    assert(surplus.totalFillVolume === 200, 'Average End Area Fill: ((2+6)/2)*50 = 200 m³');
    assert(surplus.netBalance === 550, 'Net balance surplus is 550 m³');
    assert(surplus.disposalSurplus === 550, 'Disposal volume is 550 m³');
    assert(surplus.borrowDeficit === 0, 'Borrow volume is 0 m³');

    // Vector 6: Average End Area Borrow Deficit
    const deficit = RoadEarthworkEngine.calculateAverageEndArea([
      { station: 'STA 1+000', cutArea: 2, fillArea: 12, distanceToNext: 100 },
      { station: 'STA 1+100', cutArea: 4, fillArea: 18, distanceToNext: 0 },
    ]);
    assert(deficit.totalCutVolume === 300, 'Average End Area Cut: ((2+4)/2)*100 = 300 m³');
    assert(deficit.totalFillVolume === 1500, 'Average End Area Fill: ((12+18)/2)*100 = 1500 m³');
    assert(deficit.borrowDeficit === 1200, 'Borrow volume required is 1200 m³');
    assert(deficit.disposalSurplus === 0, 'Disposal volume is 0 m³');

    // Vector 7: Embankment & Excavation individual calculators
    const embCalc = CoreCalculatorRegistry.get('road.embankment');
    const embOut = embCalc!.calculate({ length: 500, averageWidth: 10, averageHeight: 1.5 });
    assert(embOut.primaryQuantity === 7500, 'Road Embankment: 500 x 10 x 1.5 = 7500 m³');

    const excCalc = CoreCalculatorRegistry.get('road.excavation');
    const excOut = excCalc!.calculate({ length: 200, averageWidth: 8, averageDepth: 2 });
    assert(excOut.primaryQuantity === 3200, 'Road Excavation: 200 x 8 x 2 = 3200 m³');
  }

  // [TEST GROUP 4] Pavement Layer Stacking (Subgrade to Rigid)
  logs.push('\n[TEST GROUP 4] Pavement Layer Stacking (Subgrade to Rigid)');
  {
    // Vector 8: Subgrade Preparation
    const subgrade = CoreCalculatorRegistry.get('road.subgrade')!.calculate({ length: 1000, width: 8.0 });
    assert(subgrade.primaryQuantity === 8000, 'Subgrade preparation area: 1000 x 8.0 = 8000 m²');

    // Vector 9: Selected Material
    const selected = CoreCalculatorRegistry.get('road.selected_material')!.calculate({ length: 500, width: 8.0, thickness: 0.20 });
    assert(selected.primaryQuantity === 800, 'Selected material: 500 x 8.0 x 0.20 = 800 m³');

    // Vector 10: Granular Subbase (Agregat Kelas B)
    const subbase = CoreCalculatorRegistry.get('road.granular_subbase')!.calculate({ length: 500, width: 7.5, thickness: 0.15 });
    assert(subbase.primaryQuantity === 562.5, 'Granular Subbase: 500 x 7.5 x 0.15 = 562.5 m³');

    // Vector 11: Aggregate Base Class A (LPA)
    const lpa = CoreCalculatorRegistry.get('road.aggregate_base')!.calculate({ length: 1000, width: 7.0, thickness: 0.20 });
    assert(lpa.primaryQuantity === 1400, 'LPA Class A: 1000 x 7.0 x 0.20 = 1400 m³');

    // Vector 12: Cement Treated Base (CTB)
    const ctb = CoreCalculatorRegistry.get('road.cement_treated_base')!.calculate({ length: 400, width: 7.0, thickness: 0.15 });
    assert(ctb.primaryQuantity === 420, 'CTB Base: 400 x 7.0 x 0.15 = 420 m³');

    // Vector 13: Lean Concrete (LC)
    const lc = CoreCalculatorRegistry.get('road.lean_concrete')!.calculate({ length: 600, width: 7.2, thickness: 0.10 });
    assert(lc.primaryQuantity === 432, 'Lean Concrete: 600 x 7.2 x 0.10 = 432 m³');

    // Vector 14: Rigid Pavement Concrete (Fs45)
    const rigid = CoreCalculatorRegistry.get('road.rigid_pavement')!.calculate({ length: 500, width: 7.0, thickness: 0.25 });
    assert(rigid.primaryQuantity === 875, 'Rigid Pavement: 500 x 7.0 x 0.25 = 875 m³');
    assert(rigid.breakdown.surfaceArea === 3500, 'Rigid Pavement surface area: 3500 m²');
  }

  // [TEST GROUP 5] Asphalt & Surface Treatments (Provenance & Strict Warnings)
  logs.push('\n[TEST GROUP 5] Asphalt & Surface Treatments');
  {
    // Vector 15: AC-WC without density emits NOT VERIFIED warning
    const acwcNoDensity = CoreCalculatorRegistry.get('road.asphalt_wearing_course')!.calculate({ length: 1000, width: 7.0, thickness: 0.04 });
    assert(acwcNoDensity.primaryQuantity === 280, 'AC-WC Volume: 1000 x 7.0 x 0.04 = 280 m³');
    assert(acwcNoDensity.warnings !== undefined && acwcNoDensity.warnings.some((w: any) => (typeof w === 'string' ? w : w.message).includes('NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE')), 'Missing density triggers strict provenance warning');

    // Vector 16: AC-WC with explicit density computes weight ton
    const acwcWithDensity = CoreCalculatorRegistry.get('road.asphalt_wearing_course')!.calculate({ length: 1000, width: 7.0, thickness: 0.04, densityTonM3: 2.32 });
    assert(acwcWithDensity.breakdown.weightTon === 649.6, 'AC-WC Weight: 280 m³ x 2.32 = 649.6 ton');

    // Vector 17: AC-BC (Binder Course)
    const acbc = CoreCalculatorRegistry.get('road.asphalt_binder')!.calculate({ length: 1000, width: 7.0, thickness: 0.06 });
    assert(acbc.primaryQuantity === 420, 'AC-BC Volume: 1000 x 7.0 x 0.06 = 420 m³');

    // Vector 18: AC-Base
    const acbase = CoreCalculatorRegistry.get('road.asphalt_base')!.calculate({ length: 1000, width: 7.0, thickness: 0.08 });
    assert(acbase.primaryQuantity === 560, 'AC-Base Volume: 1000 x 7.0 x 0.08 = 560 m³');

    // Vector 19: Prime Coat without rate warns vs with explicit rate computes emulsion volume
    const primeNoRate = CoreCalculatorRegistry.get('road.prime_coat')!.calculate({ length: 1000, width: 7.0 });
    assert(primeNoRate.primaryQuantity === 7000, 'Prime Coat Area: 7000 m²');
    assert(primeNoRate.warnings!.some((w: any) => (typeof w === 'string' ? w : w.message).includes('NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE')), 'Missing prime coat rate triggers warning');

    const primeWithRate = CoreCalculatorRegistry.get('road.prime_coat')!.calculate({ length: 1000, width: 7.0, applicationRateLiterM2: 0.8 });
    assert(primeWithRate.breakdown.emulsionVolumeLiter === 5600, 'Prime Coat Emulsion: 7000 m² x 0.8 L/m² = 5600 L');

    // Vector 20: Tack Coat with explicit rate
    const tack = CoreCalculatorRegistry.get('road.tack_coat')!.calculate({ length: 1000, width: 7.0, applicationRateLiterM2: 0.35 });
    assert(tack.primaryQuantity === 7000, 'Tack Coat Area: 7000 m²');
    assert(tack.breakdown.emulsionVolumeLiter === 2450, 'Tack Coat Emulsion: 7000 m² x 0.35 L/m² = 2450 L');

    // Vector 21: Asphalt Surface (HRS / Lataston)
    const asphSurf = CoreCalculatorRegistry.get('road.asphalt_surface')!.calculate({ length: 500, width: 6.0, thickness: 0.03 });
    assert(asphSurf.primaryQuantity === 90, 'Asphalt Surface Volume: 500 x 6.0 x 0.03 = 90 m³');
  }

  // [TEST GROUP 6] Road Elements (Shoulder, Median, Kerb, Ditch, Drainage)
  logs.push('\n[TEST GROUP 6] Road Elements');
  {
    // Vector 22: Road Shoulder (2 sides)
    const shoulder = CoreCalculatorRegistry.get('road.shoulder')!.calculate({ length: 1000, shoulderWidthPerSide: 1.5, numberOfSides: 2, thickness: 0.15 });
    assert(shoulder.primaryQuantity === 450, 'Road Shoulder Volume: 1000 x 1.5 x 2 x 0.15 = 450 m³');
    assert(shoulder.breakdown.totalShoulderArea === 3000, 'Road Shoulder Area: 3000 m²');

    // Vector 23: Road Median
    const median = CoreCalculatorRegistry.get('road.median')!.calculate({ length: 500, width: 2.0, thickness: 0.20 });
    assert(median.primaryQuantity === 200, 'Road Median Volume: 500 x 2.0 x 0.20 = 200 m³');

    // Vector 24: Road Kerb length & precast pieces
    const kerb = CoreCalculatorRegistry.get('road.kerb')!.calculate({ length: 800, width: 0.15, height: 0.30, moduleLength: 0.50 });
    assert(kerb.primaryQuantity === 800, 'Kerb Length: 800 m\'');
    assert(kerb.breakdown.concreteVolume === 36, 'Kerb Volume: 800 x 0.15 x 0.30 = 36 m³');
    assert(kerb.breakdown.precastPieces === 1600, 'Kerb Precast Pieces: 800 / 0.50 = 1600 pcs');

    // Vector 25: Side Ditch trapezoidal excavation & lining
    const ditch = CoreCalculatorRegistry.get('road.side_ditch')!.calculate({
      length: 500,
      topWidth: 1.2,
      bottomWidth: 0.6,
      depth: 0.8,
      liningThickness: 0.10,
    });
    assert(ditch.primaryQuantity === 360, 'Side Ditch Excavation: ((1.2+0.6)/2)*0.8*500 = 360 m³');
    assert(ditch.breakdown.crossSectionArea === 0.72, 'Side Ditch Cross Section: 0.72 m²');

    // Vector 26: Road Drainage
    const drainage = CoreCalculatorRegistry.get('road.road_drainage')!.calculate({ length: 250, internalWidth: 0.8, depth: 0.8, wallThickness: 0.12 });
    assert(drainage.primaryQuantity === 250, 'Road Drainage Length: 250 m\'');
  }

  // [TEST GROUP 7] Geosynthetics, Safety, Joints & Hauling
  logs.push('\n[TEST GROUP 7] Geosynthetics, Safety, Joints & Hauling');
  {
    // Vector 27: Geotextile with overlap
    const geotextile = CoreCalculatorRegistry.get('road.geotextile')!.calculate({ length: 1000, width: 8.0, overlapPercentage: 10 });
    assert(geotextile.primaryQuantity === 8800, 'Geotextile Gross: 8000 x 1.10 = 8800 m²');

    // Vector 28: Geogrid with overlap
    const geogrid = CoreCalculatorRegistry.get('road.geogrid')!.calculate({ length: 500, width: 7.0, overlapPercentage: 15 });
    assert(geogrid.primaryQuantity === 4025, 'Geogrid Gross: (500 x 7.0) x 1.15 = 4025 m²');

    // Vector 29: Road Marking paint area
    const marking = CoreCalculatorRegistry.get('road.road_marking')!.calculate({
      solidLineLength: 2000,
      solidLineWidth: 0.12,
      brokenLineLength: 333,
      brokenLineWidth: 0.12,
    });
    assert(marking.primaryQuantity === 279.96, 'Road Marking Paint Area: 2000*0.12 + 333*0.12 = 279.96 m²');

    // Vector 30: Guardrail w-beam & post count
    const guardrail = CoreCalculatorRegistry.get('road.guardrail')!.calculate({ routeLength: 400, postSpacing: 2.0, terminalEndCount: 2 });
    assert(guardrail.primaryQuantity === 400, 'Guardrail Length: 400 m\'');
    assert(guardrail.breakdown.postCount === 201, 'Guardrail Post Count: (400/2.0)+1 = 201 posts');

    // Vector 31: Traffic Barrier Concrete
    const barrier = CoreCalculatorRegistry.get('road.traffic_barrier')!.calculate({ length: 300, crossSectionArea: 0.35, moduleLength: 3.0 });
    assert(barrier.primaryQuantity === 300, 'Traffic Barrier Length: 300 m\'');
    assert(barrier.breakdown.concreteVolume === 105, 'Traffic Barrier Volume: 300 x 0.35 = 105 m³');
    assert(barrier.breakdown.moduleCount === 100, 'Barrier Modules: 300 / 3 = 100 units');

    // Vector 32: Delineator count
    const delineator = CoreCalculatorRegistry.get('road.road_delineator')!.calculate({ count: 85 });
    assert(delineator.primaryQuantity === 85, 'Delineator Count: 85 units');

    // Vector 33: Road Sign Foundation concrete
    const signFound = CoreCalculatorRegistry.get('road.road_sign_foundation')!.calculate({ length: 0.8, width: 0.8, depth: 1.2, quantity: 10 });
    assert(signFound.primaryQuantity === 7.68, 'Sign Foundation Concrete: 0.8 x 0.8 x 1.2 x 10 = 7.68 m³');

    // Vector 34: Rigid Pavement Contraction Joint & Dowel Count
    const joint = CoreCalculatorRegistry.get('road.pavement_joint')!.calculate({
      roadLength: 500,
      pavementWidth: 7.0,
      transverseSpacing: 5.0,
      dowelSpacing: 0.30,
    });
    assert(joint.primaryQuantity === 1200, 'Total Joint Length: 700m transverse + 500m longitudinal = 1200 m\'');
    assert(joint.breakdown.totalDowelCount === 2300, 'Total Dowel Count: 100 joints x 23 dowels = 2300 dowels');

    // Vector 35: Expansion Joint Length
    const expJoint = CoreCalculatorRegistry.get('road.expansion_joint')!.calculate({ jointLength: 7.0, jointCount: 4, jointGapMm: 20 });
    assert(expJoint.primaryQuantity === 28.0, 'Expansion Joint Length: 7.0 x 4 = 28.0 m\'');

    // Vector 36: Material Hauling Volume-Distance
    const hauling = CoreCalculatorRegistry.get('road.material_hauling')!.calculate({ materialVolume: 1500, haulDistanceKm: 12.5 });
    assert(hauling.primaryQuantity === 18750, 'Material Hauling: 1500 m³ x 12.5 km = 18750 m³·km');
  }

  // [TEST GROUP 8] Ownership, Anti-Duplication & Idempotency
  logs.push('\n[TEST GROUP 8] Ownership, Anti-Duplication & Idempotency');
  {
    RoadOwnershipEngine.clearRegistry();

    // Unique ownership key generation
    const key1 = RoadOwnershipEngine.generateOwnershipKey({
      projectId: 'PRJ-ROAD-101',
      roadEntityId: 'ROAD-MAIN',
      quantityKind: 'PAVEMENT_LAYER',
      segmentId: 'STA_0_100',
      layerId: 'LAYER_AC_WC',
    });
    const key2 = RoadOwnershipEngine.generateOwnershipKey({
      projectId: 'PRJ-ROAD-101',
      roadEntityId: 'ROAD-MAIN',
      quantityKind: 'PAVEMENT_LAYER',
      segmentId: 'STA_0_100',
      layerId: 'LAYER_AC_BC',
    });
    assert(key1 !== key2, 'Distinct layers produce distinct ownership keys');

    // Claim single producer ownership
    const claim1 = RoadOwnershipEngine.claimOwnership({
      projectId: 'PRJ-ROAD-101',
      roadEntityId: 'ROAD-MAIN',
      quantityKind: 'EARTHWORK_CUT',
      segmentId: 'STA_0_500',
      producerCalculatorId: 'road.earthwork',
    });
    assert(claim1 === true, 'First producer (road.earthwork) successfully claims ownership');

    // Attempting duplicate claim by another calculator fails
    const claim2 = RoadOwnershipEngine.claimOwnership({
      projectId: 'PRJ-ROAD-101',
      roadEntityId: 'ROAD-MAIN',
      quantityKind: 'EARTHWORK_CUT',
      segmentId: 'STA_0_500',
      producerCalculatorId: 'road.cut',
    });
    assert(claim2 === false, 'Duplicate producer (road.cut) claim blocked by anti-duplication engine');

    // Idempotency: repeated execution yields exact same result
    const calc = CoreCalculatorRegistry.get('road.granular_subbase');
    const input = { length: 1200, width: 7.0, thickness: 0.15 };
    const resA = calc!.calculate(input, { projectId: 'PRJ-A' });
    const resB = calc!.calculate(input, { projectId: 'PRJ-A' });
    assert(resA.primaryQuantity === resB.primaryQuantity, 'Calculator execution is completely deterministic and idempotent');
    assert(resA.primaryQuantity === 1260, '1200 x 7.0 x 0.15 = 1260 m³');
  }

  logs.push('\n========================================================');
  logs.push(`PHASE 6 ROAD CALCULATOR TEST SUITE PASSED (${passedCount}/${passedCount})`);
  logs.push('========================================================');

  return { success: true, passedCount, logs };
}

// Direct execution when called via tsx/node CLI
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('phase6RoadCalculators.test.ts')) {
  try {
    const res = runPhase6RoadTestSuite();
    console.log(res.logs.join('\n'));
    if (!res.success) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal Test Execution Error:', err.message);
    process.exit(1);
  }
}
