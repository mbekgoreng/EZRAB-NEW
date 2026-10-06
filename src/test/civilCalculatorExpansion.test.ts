declare const process: any;
declare const require: any;
declare const module: any;

import { CoreCalculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';
import { ALL_CONSTRUCTION_CALCULATORS, getCalculatorById } from '../engine/constructionCalculators/registry';
import { ALL_CIVIL_EXPANSION_CALCULATORS } from '../engine/calculatorCore/civil';
import { QtoAdapter } from '../engine/calculatorCore/adapters/qtoAdapter';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${message}`);
  }
}

export function runCivilCalculatorExpansionTests(): { passCount: number; failCount: number } {
  console.log('========================================================');
  console.log('STARTING CIVIL CALCULATOR EXPANSION TEST SUITE (97 CALCS)');
  console.log('========================================================\n');

  // TEST GROUP 1: Registry Registration & Resolution
  console.log('[TEST GROUP 1] Civil Calculators Registry & Resolution');
  assert(ALL_CIVIL_EXPANSION_CALCULATORS.length === 97, `Total civil expansion calculators is 97 (got ${ALL_CIVIL_EXPANSION_CALCULATORS.length})`);

  for (const calc of ALL_CIVIL_EXPANSION_CALCULATORS) {
    const hasCore = CoreCalculatorRegistry.has(calc.id);
    assert(hasCore, `CoreCalculatorRegistry has ${calc.id}`);

    const resolvedSpec = getCalculatorById(calc.id);
    assert(!!resolvedSpec, `getCalculatorById resolves ${calc.id}`);
  }

  // TEST GROUP 2: Drainage Pack Execution (15 Calculators)
  console.log('\n[TEST GROUP 2] Drainage Pack Deterministic Execution');
  const dChannel = CoreCalculatorRegistry.get('drainage.channel')!.calculate({ length: 100, topWidth: 1.2, bottomWidth: 0.8, depth: 1.0, liningThickness: 0.15 });
  assert(dChannel.primaryQuantity === 100, `Drainage Channel Galian: 100 m³ (got ${dChannel.primaryQuantity})`);

  const dUDitch = CoreCalculatorRegistry.get('drainage.u_ditch')!.calculate({ length: 100, segmentLength: 1.2, width: 0.6, height: 0.6, wallThickness: 0.08, beddingThickness: 0.10 });
  assert(dUDitch.primaryQuantity === 100, `U-Ditch Length: 100 m (got ${dUDitch.primaryQuantity})`);
  assert(dUDitch.breakdown.jumlahUnitBuah === 84, `U-Ditch Count: 84 units (got ${dUDitch.breakdown.jumlahUnitBuah})`);

  const dBox = CoreCalculatorRegistry.get('drainage.box_culvert')!.calculate({ length: 12, span: 2.0, rise: 2.0, topSlabThickness: 0.25, bottomSlabThickness: 0.25, wallThickness: 0.25, numberOfCells: 1 });
  assert(dBox.primaryQuantity === 27, `Box Culvert Concrete: 27 m³ (got ${dBox.primaryQuantity})`);

  const dPipe = CoreCalculatorRegistry.get('drainage.pipe_culvert')!.calculate({ length: 10, diameter: 0.8, wallThickness: 0.08, numberOfLines: 2, trenchDepth: 1.5 });
  assert(dPipe.primaryQuantity === 20, `Pipe Culvert Length: 20 m (got ${dPipe.primaryQuantity})`);

  const dDitch = CoreCalculatorRegistry.get('drainage.ditch')!.calculate({ length: 100, topWidth: 1.0, bottomWidth: 0.5, depth: 0.6 });
  assert(dDitch.primaryQuantity === 45, `Ditch Excavation: 45 m³ (got ${dDitch.primaryQuantity})`);

  const dInlet = CoreCalculatorRegistry.get('drainage.inlet')!.calculate({ count: 5, length: 1.0, width: 0.8, height: 0.8, wallThickness: 0.15 });
  assert(dInlet.primaryQuantity === 5, `Inlet Count: 5 units (got ${dInlet.primaryQuantity})`);

  const dOutlet = CoreCalculatorRegistry.get('drainage.outlet')!.calculate({ count: 2, apronLength: 2.0, apronWidth: 1.5, apronThickness: 0.20 });
  assert(dOutlet.primaryQuantity === 2, `Outlet Count: 2 units (got ${dOutlet.primaryQuantity})`);

  const dManhole = CoreCalculatorRegistry.get('drainage.manhole')!.calculate({ count: 4, internalLength: 0.8, internalWidth: 0.8, depth: 1.2, wallThickness: 0.15 });
  assert(dManhole.primaryQuantity === 4, `Manhole Count: 4 units (got ${dManhole.primaryQuantity})`);

  const dHeadwall = CoreCalculatorRegistry.get('drainage.headwall')!.calculate({ count: 2, width: 3.5, height: 1.5, thickness: 0.35 });
  assert(dHeadwall.primaryQuantity === 3.675, `Headwall Concrete: 3.675 m³ (got ${dHeadwall.primaryQuantity})`);

  const dExc = CoreCalculatorRegistry.get('drainage.excavation')!.calculate({ length: 150, topWidth: 1.4, bottomWidth: 1.0, depth: 1.2 });
  assert(dExc.primaryQuantity === 216, `Drainage Excavation: 216 m³ (got ${dExc.primaryQuantity})`);

  const dBed = CoreCalculatorRegistry.get('drainage.bedding')!.calculate({ length: 100, width: 0.8, thickness: 0.10 });
  assert(dBed.primaryQuantity === 8, `Drainage Bedding: 8 m³ (got ${dBed.primaryQuantity})`);

  const dBack = CoreCalculatorRegistry.get('drainage.backfill')!.calculate({ excavationVolume: 120, structureOccupiedVolume: 45, beddingVolume: 8 });
  assert(dBack.primaryQuantity === 67, `Drainage Backfill: 67 m³ (got ${dBack.primaryQuantity})`);

  const dConc = CoreCalculatorRegistry.get('drainage.concrete_drain')!.calculate({ length: 100, internalWidth: 0.8, internalHeight: 0.8, wallThickness: 0.12 });
  assert(dConc.primaryQuantity === 31.68, `Concrete Drain: 31.68 m³ (got ${dConc.primaryQuantity})`);

  const dLining = CoreCalculatorRegistry.get('drainage.lining')!.calculate({ length: 100, bottomWidth: 0.6, slopeLength: 1.0, liningThickness: 0.15 });
  assert(dLining.primaryQuantity === 260, `Channel Lining Area: 260 m² (got ${dLining.primaryQuantity})`);

  const dCover = CoreCalculatorRegistry.get('drainage.cover')!.calculate({ length: 50, segmentLength: 0.60, width: 0.80, thickness: 0.10 });
  assert(dCover.primaryQuantity === 84, `Cover Slab Count: 84 buah (got ${dCover.primaryQuantity})`);

  // TEST GROUP 3: Bridge Pack Deterministic Execution (16 Calculators)
  console.log('\n[TEST GROUP 3] Bridge Pack Deterministic Execution');
  const bGeom = CoreCalculatorRegistry.get('bridge.geometry')!.calculate({ totalSpan: 30, deckWidth: 9.0, numberOfSpans: 1 });
  assert(bGeom.primaryQuantity === 270, `Bridge Deck Area: 270 m² (got ${bGeom.primaryQuantity})`);

  const bDeck = CoreCalculatorRegistry.get('bridge.deck')!.calculate({ length: 25, width: 9.0, slabThickness: 0.25, rebarRatio: 140 });
  assert(bDeck.primaryQuantity === 56.25, `Bridge Deck Concrete: 56.25 m³ (got ${bDeck.primaryQuantity})`);

  const bGirder = CoreCalculatorRegistry.get('bridge.girder')!.calculate({ girderLength: 25, numberOfGirders: 5, crossSectionArea: 0.65 });
  assert(bGirder.primaryQuantity === 81.25, `Girder Concrete: 81.25 m³ (got ${bGirder.primaryQuantity})`);

  const bAbut = CoreCalculatorRegistry.get('bridge.abutment')!.calculate({ count: 2, width: 9.0, height: 4.5, wallThickness: 1.0, footingWidth: 3.5, footingThickness: 1.2 });
  assert(bAbut.primaryQuantity === 156.6, `Abutment Concrete: 156.6 m³ (got ${bAbut.primaryQuantity})`);

  const bPier = CoreCalculatorRegistry.get('bridge.pier')!.calculate({ count: 1, pierHeadLength: 9.0, pierHeadWidth: 1.5, pierHeadHeight: 1.5, columnDiameter: 1.2, columnHeight: 6.0, columnsPerPier: 2 });
  assert(bPier.primaryQuantity > 30, `Pier Concrete > 30 m³ (got ${bPier.primaryQuantity})`);

  const bFound = CoreCalculatorRegistry.get('bridge.foundation')!.calculate({ pileCapLength: 10, pileCapWidth: 4.0, pileCapThickness: 1.5, pileDiameter: 0.8, pileLength: 18, numberOfPiles: 8, numberOfCaps: 2 });
  assert(bFound.primaryQuantity === 120, `Pile Cap Concrete: 120 m³ (got ${bFound.primaryQuantity})`);

  const bApp = CoreCalculatorRegistry.get('bridge.approach_slab')!.calculate({ length: 6.0, width: 9.0, thickness: 0.25, numberOfSides: 2 });
  assert(bApp.primaryQuantity === 27, `Approach Slab Concrete: 27 m³ (got ${bApp.primaryQuantity})`);

  const bBar = CoreCalculatorRegistry.get('bridge.barrier')!.calculate({ length: 30, crossSectionArea: 0.35, numberOfSides: 2 });
  assert(bBar.primaryQuantity === 21, `Bridge Barrier Concrete: 21 m³ (got ${bBar.primaryQuantity})`);

  const bPar = CoreCalculatorRegistry.get('bridge.parapet')!.calculate({ length: 30, postSpacing: 2.0, numberOfSides: 2 });
  assert(bPar.primaryQuantity === 60, `Bridge Railing Length: 60 m (got ${bPar.primaryQuantity})`);

  const bBear = CoreCalculatorRegistry.get('bridge.bearing')!.calculate({ girdersPerSpan: 5, numberOfSpans: 1, bearingsPerGirderEnd: 2 });
  assert(bBear.primaryQuantity === 20, `Bearing Pads: 20 buah (got ${bBear.primaryQuantity})`);

  const bExp = CoreCalculatorRegistry.get('bridge.expansion_joint')!.calculate({ deckWidth: 9.0, numberOfJoints: 2 });
  assert(bExp.primaryQuantity === 18, `Expansion Joint Length: 18 m (got ${bExp.primaryQuantity})`);

  const bExc = CoreCalculatorRegistry.get('bridge.excavation')!.calculate({ length: 12, width: 5.0, depth: 3.5, numberOfPits: 2 });
  assert(bExc.primaryQuantity === 420, `Bridge Excavation: 420 m³ (got ${bExc.primaryQuantity})`);

  const bBack = CoreCalculatorRegistry.get('bridge.backfill')!.calculate({ opritLength: 25, topWidth: 9.0, bottomWidth: 18.0, height: 4.5, numberOfSides: 2 });
  assert(bBack.primaryQuantity === 1518.75, `Oprit Backfill: 1518.75 m³ (got ${bBack.primaryQuantity})`);

  const bConc = CoreCalculatorRegistry.get('bridge.concrete')!.calculate({ length: 10, width: 2.0, height: 1.0, count: 1 });
  assert(bConc.primaryQuantity === 20, `Bridge Concrete: 20 m³ (got ${bConc.primaryQuantity})`);

  const bForm = CoreCalculatorRegistry.get('bridge.formwork')!.calculate({ contactPerimeter: 6.0, elementLength: 15, count: 1 });
  assert(bForm.primaryQuantity === 90, `Bridge Formwork: 90 m² (got ${bForm.primaryQuantity})`);

  const bReb = CoreCalculatorRegistry.get('bridge.reinforcement')!.calculate({ concreteVolume: 100, rebarRatio: 150 });
  assert(bReb.primaryQuantity === 15000, `Bridge Rebar: 15000 kg (got ${bReb.primaryQuantity})`);

  // TEST GROUP 4: Irrigation Pack Deterministic Execution (11 Calculators)
  console.log('\n[TEST GROUP 4] Irrigation Pack Deterministic Execution');
  const iCanal = CoreCalculatorRegistry.get('irrigation.canal')!.calculate({ length: 500, bottomWidth: 1.5, waterDepth: 1.2, sideSlopeM: 1.0 });
  assert(iCanal.primaryQuantity === 1620, `Canal Excavation: 1620 m³ (got ${iCanal.primaryQuantity})`);

  const iExc = CoreCalculatorRegistry.get('irrigation.excavation')!.calculate({ length: 300, crossSectionArea: 2.5 });
  assert(iExc.primaryQuantity === 750, `Irrigation Excavation: 750 m³ (got ${iExc.primaryQuantity})`);

  const iLining = CoreCalculatorRegistry.get('irrigation.lining')!.calculate({ length: 300, bottomWidth: 1.0, slopeLength: 1.5, liningThickness: 0.20 });
  assert(iLining.primaryQuantity === 240, `Canal Lining Volume: 240 m³ (got ${iLining.primaryQuantity})`);

  const iDyke = CoreCalculatorRegistry.get('irrigation.embankment')!.calculate({ length: 300, crestWidth: 1.5, embankmentHeight: 1.2, sideSlopeM: 1.5, numberOfDykes: 2 });
  assert(iDyke.primaryQuantity === 1728, `Canal Dyke: 1728 m³ (got ${iDyke.primaryQuantity})`);

  const iGate = CoreCalculatorRegistry.get('irrigation.gate')!.calculate({ count: 3, gateWidth: 1.0, gateHeight: 1.2 });
  assert(iGate.primaryQuantity === 3, `Sluice Gate Count: 3 units (got ${iGate.primaryQuantity})`);

  const iIntake = CoreCalculatorRegistry.get('irrigation.intake')!.calculate({ count: 2, concreteVolumePerUnit: 8.5 });
  assert(iIntake.primaryQuantity === 2, `Offtake Count: 2 units (got ${iIntake.primaryQuantity})`);

  const iOutlet = CoreCalculatorRegistry.get('irrigation.outlet')!.calculate({ count: 1, crestLength: 3.0, structureVolume: 6.0 });
  assert(iOutlet.primaryQuantity === 6.0, `Spillway Volume: 6.0 m³ (got ${iOutlet.primaryQuantity})`);

  const iFlume = CoreCalculatorRegistry.get('irrigation.box_channel')!.calculate({ length: 20, internalWidth: 1.2, internalHeight: 1.0, wallThickness: 0.15 });
  assert(iFlume.primaryQuantity === 10.5, `Flume Volume: 10.5 m³ (got ${iFlume.primaryQuantity})`);

  const iConc = CoreCalculatorRegistry.get('irrigation.concrete')!.calculate({ length: 10, width: 2.0, height: 0.5, count: 1 });
  assert(iConc.primaryQuantity === 10, `Irrigation Concrete: 10 m³ (got ${iConc.primaryQuantity})`);

  const iForm = CoreCalculatorRegistry.get('irrigation.formwork')!.calculate({ length: 25, height: 1.5, numberOfSides: 2 });
  assert(iForm.primaryQuantity === 75, `Irrigation Formwork: 75 m² (got ${iForm.primaryQuantity})`);

  const iBack = CoreCalculatorRegistry.get('irrigation.backfill')!.calculate({ length: 50, averageWidth: 0.8, depth: 1.2 });
  assert(iBack.primaryQuantity === 48, `Irrigation Backfill: 48 m³ (got ${iBack.primaryQuantity})`);

  // TEST GROUP 5: River & Flood Protection (9 Calculators)
  console.log('\n[TEST GROUP 5] River & Flood Protection Deterministic Execution');
  const rSeg = CoreCalculatorRegistry.get('river.segment')!.calculate({ length: 200, slopeLength: 6.0, numberOfBanks: 2 });
  assert(rSeg.primaryQuantity === 2400, `River Reach Area: 2400 m² (got ${rSeg.primaryQuantity})`);

  const rRip = CoreCalculatorRegistry.get('river.riprap')!.calculate({ length: 150, slopeLength: 5.0, thickness: 0.50 });
  assert(rRip.primaryQuantity === 375, `Riprap Volume: 375 m³ (got ${rRip.primaryQuantity})`);

  const rGab = CoreCalculatorRegistry.get('river.gabion')!.calculate({ length: 50, boxLength: 2.0, boxWidth: 1.0, boxHeight: 0.5, numberOfLayers: 3, widthLayers: 1 });
  assert(rGab.primaryQuantity === 75, `Gabion Boxes: 75 units (got ${rGab.primaryQuantity})`);

  const rRev = CoreCalculatorRegistry.get('river.revetment')!.calculate({ length: 100, slopeLength: 4.5, thickness: 0.30 });
  assert(rRev.primaryQuantity === 135, `Revetment Volume: 135 m³ (got ${rRev.primaryQuantity})`);

  const rConc = CoreCalculatorRegistry.get('river.protection_concrete')!.calculate({ length: 100, slopeLength: 5.0, slabThickness: 0.15 });
  assert(rConc.primaryQuantity === 75, `Concrete Mattress: 75 m³ (got ${rConc.primaryQuantity})`);

  const rSheet = CoreCalculatorRegistry.get('river.sheet_pile')!.calculate({ wallLength: 100, pileDepth: 12, effectiveWidth: 0.50 });
  assert(rSheet.primaryQuantity === 2400, `Sheet Pile Driving Length: 2400 m (got ${rSheet.primaryQuantity})`);

  const rToe = CoreCalculatorRegistry.get('river.toe_protection')!.calculate({ length: 100, toeWidth: 1.2, toeDepth: 1.0 });
  assert(rToe.primaryQuantity === 120, `Toe Protection: 120 m³ (got ${rToe.primaryQuantity})`);

  const rDredge = CoreCalculatorRegistry.get('river.excavation')!.calculate({ length: 500, averageWidth: 15, dredgeDepth: 1.5 });
  assert(rDredge.primaryQuantity === 11250, `River Dredging: 11250 m³ (got ${rDredge.primaryQuantity})`);

  const rLevee = CoreCalculatorRegistry.get('river.backfill')!.calculate({ length: 500, crestWidth: 3.0, embankmentHeight: 2.5, sideSlopeM: 2.0 });
  assert(rLevee.primaryQuantity === 10000, `Flood Levee Volume: 10000 m³ (got ${rLevee.primaryQuantity})`);

  // TEST GROUP 6: Weir Pack Execution (10 Calculators)
  console.log('\n[TEST GROUP 6] Weir Pack Deterministic Execution');
  const wBody = CoreCalculatorRegistry.get('weir.body')!.calculate({ weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0 });
  assert(wBody.primaryQuantity === 350, `Weir Body Volume: 350 m³ (got ${wBody.primaryQuantity})`);

  const wSpill = CoreCalculatorRegistry.get('weir.spillway')!.calculate({ weirLength: 25, crestArcLength: 4.5, skinThickness: 0.25 });
  assert(wSpill.primaryQuantity === 112.5, `Weir Spillway Area: 112.5 m² (got ${wSpill.primaryQuantity})`);

  const wApron = CoreCalculatorRegistry.get('weir.apron')!.calculate({ width: 25, length: 10, thickness: 0.8 });
  assert(wApron.primaryQuantity === 200, `Apron Volume: 200 m³ (got ${wApron.primaryQuantity})`);

  const wBasin = CoreCalculatorRegistry.get('weir.stilling_basin')!.calculate({ basinWidth: 25, basinLength: 12, slabThickness: 1.0, endSillHeight: 0.8 });
  assert(wBasin.primaryQuantity === 316, `Stilling Basin Volume: 316 m³ (got ${wBasin.primaryQuantity})`);

  const wWing = CoreCalculatorRegistry.get('weir.wing_wall')!.calculate({ length: 15, averageHeight: 4.0, averageThickness: 0.8, numberOfWalls: 4 });
  assert(wWing.primaryQuantity === 192, `Wing Wall Volume: 192 m³ (got ${wWing.primaryQuantity})`);

  const wGate = CoreCalculatorRegistry.get('weir.gate')!.calculate({ count: 2, gateWidth: 1.5, gateHeight: 2.0 });
  assert(wGate.primaryQuantity === 2, `Weir Gate Count: 2 units (got ${wGate.primaryQuantity})`);

  const wExc = CoreCalculatorRegistry.get('weir.excavation')!.calculate({ length: 30, width: 28, depth: 2.5 });
  assert(wExc.primaryQuantity === 2100, `Weir Excavation: 2100 m³ (got ${wExc.primaryQuantity})`);

  const wBack = CoreCalculatorRegistry.get('weir.backfill')!.calculate({ volume: 250 });
  assert(wBack.primaryQuantity === 250, `Weir Backfill: 250 m³ (got ${wBack.primaryQuantity})`);

  const wConc = CoreCalculatorRegistry.get('weir.concrete')!.calculate({ length: 12, width: 1.5, height: 2.5, count: 2 });
  assert(wConc.primaryQuantity === 90, `Weir Concrete: 90 m³ (got ${wConc.primaryQuantity})`);

  const wForm = CoreCalculatorRegistry.get('weir.formwork')!.calculate({ length: 15, height: 3.5, numberOfSides: 2 });
  assert(wForm.primaryQuantity === 105, `Weir Formwork: 105 m² (got ${wForm.primaryQuantity})`);

  // TEST GROUP 7: Embung & Dam Packs (23 Calculators)
  console.log('\n[TEST GROUP 7] Embung & Dam Packs Deterministic Execution');
  const eRes = CoreCalculatorRegistry.get('embung.reservoir')!.calculate({ topArea: 10000, bottomArea: 4000, waterDepth: 4.0 });
  assert(eRes.primaryQuantity > 25000, `Embung Capacity > 25000 m³ (got ${eRes.primaryQuantity})`);

  const eEmb = CoreCalculatorRegistry.get('embung.embankment')!.calculate({ perimeterLength: 300, crestWidth: 3.5, height: 4.5, upstreamSlopeM: 2.5, downstreamSlopeM: 2.0 });
  assert(eEmb.primaryQuantity === 18393.75, `Embung Tanggul: 18393.75 m³ (got ${eEmb.primaryQuantity})`);

  const eCore = CoreCalculatorRegistry.get('embung.core')!.calculate({ length: 200, topWidth: 1.5, bottomWidth: 4.5, height: 4.5 });
  assert(eCore.primaryQuantity === 2700, `Embung Core: 2700 m³ (got ${eCore.primaryQuantity})`);

  const dBody = CoreCalculatorRegistry.get('dam.body')!.calculate({ crestLength: 350, crestWidth: 10, damHeight: 45, upstreamSlopeM: 2.5, downstreamSlopeM: 2.0 });
  assert(dBody.primaryQuantity > 1000000, `Dam Body Volume > 1.000.000 m³ (got ${dBody.primaryQuantity})`);

  const dCore = CoreCalculatorRegistry.get('dam.core')!.calculate({ crestLength: 300, crestCoreWidth: 4.0, damHeight: 45, coreSlopeM: 0.25 });
  assert(dCore.primaryQuantity > 100000, `Dam Clay Core > 100.000 m³ (got ${dCore.primaryQuantity})`);

  const dTunnel = CoreCalculatorRegistry.get('dam.outlet')!.calculate({ tunnelLength: 450, tunnelDiameter: 5.0, liningThickness: 0.50 });
  assert(dTunnel.primaryQuantity === 450, `Dam Tunnel Length: 450 m (got ${dTunnel.primaryQuantity})`);

  // TEST GROUP 8: Water Structure Pack (13 Calculators)
  console.log('\n[TEST GROUP 8] Water Structure Pack Deterministic Execution');
  const wIntake = CoreCalculatorRegistry.get('water.intake')!.calculate({ length: 6.0, width: 4.0, height: 4.5, wallThickness: 0.25 });
  assert(wIntake.primaryQuantity > 20, `SPAM Intake Concrete > 20 m³ (got ${wIntake.primaryQuantity})`);

  const wChamber = CoreCalculatorRegistry.get('water.chamber')!.calculate({ length: 15, width: 5.0, depth: 3.0, wallThickness: 0.25 });
  assert(wChamber.primaryQuantity > 30, `Chamber Concrete > 30 m³ (got ${wChamber.primaryQuantity})`);

  const wRes = CoreCalculatorRegistry.get('water.reservoir')!.calculate({ length: 20, width: 15, waterDepth: 4.0, slabThickness: 0.35, wallThickness: 0.30, roofThickness: 0.20 });
  assert(wRes.primaryQuantity > 200, `Ground Reservoir Concrete > 200 m³ (got ${wRes.primaryQuantity})`);

  const wPipe = CoreCalculatorRegistry.get('water.pipe')!.calculate({ pipeLength: 1000, diameterMm: 150, trenchDepth: 1.2, trenchWidth: 0.6 });
  assert(wPipe.primaryQuantity === 1000, `Water Pipeline Length: 1000 m (got ${wPipe.primaryQuantity})`);

  // TEST GROUP 9: QTO Adapter Integration & Fail-Closed Project Isolation
  console.log('\n[TEST GROUP 9] QTO Adapter & Project Isolation');
  const qtoItem = QtoAdapter.toQtoItem(dChannel, { projectId: 'PRJ-CIVIL-001' });
  assert(qtoItem.projectId === 'PRJ-CIVIL-001', 'QTO Item has authoritative projectId');
  assert(qtoItem.quantity === 100, 'QTO Item matches exact calculated volume');
  assert(qtoItem.unit === 'm³', 'QTO Item has proper unit');

  let failedClosed = false;
  try {
    QtoAdapter.toQtoItem(dChannel, { projectId: '' } as any);
  } catch (err: any) {
    failedClosed = true;
  }
  assert(failedClosed, 'QTO Adapter fails closed on missing projectId');

  console.log('========================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================================');

  if (failCount > 0) {
    process.exit(1);
  }

  return { passCount, failCount };
}

if (typeof require !== 'undefined' && require.main === module) {
  runCivilCalculatorExpansionTests();
}
