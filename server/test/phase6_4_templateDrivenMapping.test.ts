/**
 * Phase 6.4 Synthetic Test Suite: Template-Driven Construction Mapping
 *
 * Tests:
 * 1. House 1 floor (Simple foundation, masonry wall, no stairs/lift/pool)
 * 2. House 2 floors (Columns, beams, floor slab, stairs)
 * 3. Hotel (High-rise structure, elevators, HVAC, guestroom finishings)
 * 4. Hospital (Medical gas, sanitary specialties, strict structural zones)
 * 5. School (Classroom layout, standard institutional WBS)
 * 6. Office (Open plan, commercial electrical & data)
 * 7. Road / Jalan (Subgrade, aggregate base, AC-WC asphalt hotmix)
 * 8. Paving (Paving block, sand bedding, kanstin)
 * 9. Bridge / Jembatan (Abutment, pier, prestressed girder, deck slab)
 * 10. Water Structure / SDA (Weir, sluice gate, canal lining)
 * 11. Basement Evidence Trigger (Activates basement excavation & retaining wall)
 * 12. Lift / Elevator Trigger (Activates elevator hoistway & cabin)
 * 13. Swimming Pool Trigger (Activates pool basin concrete & waterproofing)
 * 14. Missing Required Data & Assumption Fallbacks
 * 15. Unmapped Entities & Coverage Calculation (Preserves unmapped status without forcing)
 */

import { TemplateMappingCoordinator } from '../services/templateMappingCoordinator';
import { ParameterExtractionEngine } from '../services/parameterExtractionEngine';
import { AdaptiveWbsEngine } from '../services/adaptiveWbsEngine';
import { TemplateEntityMappingEngine } from '../services/templateEntityMappingEngine';
import { TemplateValidationEngine } from '../services/templateValidationEngine';
import { TemplateRegistry } from '../../src/engine/templateEngine/TemplateRegistry';
import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';

export async function runPhase64Tests(): Promise<boolean> {
  console.log('============================================================');
  console.log('EZRAB PHASE 6.4: TEMPLATE-DRIVEN CONSTRUCTION MAPPING TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  -> PASS: ${message}`);
      passed++;
    } else {
      console.error(`  -> FAIL: ${message}`);
      failed++;
    }
  }

  const coordinator = TemplateMappingCoordinator.getInstance();
  const registry = TemplateRegistry.getInstance();

  // Helper to create mock canonical entities
  function createEntity(
    id: string,
    name: string,
    elementType: string,
    floor: string,
    dimensions?: string,
    material?: string,
    quantity: number = 1
  ): CanonicalEntity {
    return {
      entityId: `ent_${id}`,
      projectId: 'proj_test',
      buildingId: 'bld_main',
      floorId: floor,
      zoneId: null,
      discipline: 'STRUCTURAL',
      elementType,
      name,
      identifier: id,
      drawingReferences: ['DWG-001'],
      evidenceIds: [`ev_${id}`],
      evidences: [],
      location: { floor, building: 'Main' },
      dimensions,
      material,
      quantityCandidates: [],
      canonicalQuantity: {
        quantity,
        unit: 'unit',
        source: 'DWG-001',
        confidence: 0.95,
        isDeduplicated: true
      },
      identityConfidence: 0.95,
      resolutionStatus: 'SAME_ENTITY',
      isDuplicate: false,
      isSuperseded: false,
      provenance: {
        sourceDrawings: ['DWG-001'],
        sourcePages: ['page_1'],
        detectedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  try {
    // -------------------------------------------------------------
    // [CASE 1] House 1 Floor
    // -------------------------------------------------------------
    console.log('[CASE 1] House 1 Floor Template Mapping');
    {
      const entities: CanonicalEntity[] = [
        createEntity('P1', 'Pondasi Batu Kali', 'FOUNDATION_STONE', 'Lantai 1', '0.80x0.60 m', 'Batu Kali', 1),
        createEntity('SL1', 'Sloof Beton 15x20', 'SLOOF', 'Lantai 1', '15x20 cm', 'Beton Bertulang', 1),
        createEntity('K1', 'Kolom Praktis 15x15', 'COLUMN', 'Lantai 1', '15x15 cm', 'Beton Bertulang', 4),
        createEntity('D1', 'Dinding Bata Ringan', 'WALL', 'Lantai 1', 't=10 cm', 'Bata Ringan', 1),
        createEntity('PJ1', 'Pintu Utama Aluminium', 'DOOR', 'Lantai 1', '90x210 cm', 'Aluminium', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_house_1f',
        templateId: 'tmpl-building-residential',
        entities,
        userParameters: { floors: 1, building_area: 70 }
      });

      assert(res.templateSnapshot.templateId === 'tmpl-building-residential', 'Template snapshot preserved');
      assert(res.parameterSet['floors']?.value === 1, 'Floor count parameter is 1');
      assert(res.coverage.mappedCount === 5, 'All 5 entities mapped to standard residential WBS');
      assert(res.coverage.coveragePercentage === 100, 'Coverage percentage is 100%');
      assert(res.conditionalWorkActivated.length === 0, 'Zero conditional branches activated for simple 1F house');
    }

    // -------------------------------------------------------------
    // [CASE 2] House 2 Floors
    // -------------------------------------------------------------
    console.log('\n[CASE 2] House 2 Floors Template Mapping (Stairs & Beams)');
    {
      const entities: CanonicalEntity[] = [
        createEntity('P1', 'Pondasi Telapak P1', 'FOUNDATION_FOOTING', 'Lantai 1', '1.0x1.0 m', 'Beton Bertulang', 4),
        createEntity('K1_F1', 'Kolom Struktur K1 Lt 1', 'COLUMN', 'Lantai 1', '30x30 cm', 'Beton Bertulang', 8),
        createEntity('B1_F1', 'Balok Induk B1', 'BEAM', 'Lantai 1', '25x40 cm', 'Beton Bertulang', 6),
        createEntity('S1_F2', 'Pelat Lantai 2', 'SLAB', 'Lantai 2', 't=12 cm', 'Beton Bertulang', 1),
        createEntity('TG1', 'Tangga Beton Utama', 'STAIRS', 'Lantai 1', 'L=1.2 m', 'Beton Bertulang', 1),
        createEntity('K1_F2', 'Kolom Struktur K1 Lt 2', 'COLUMN', 'Lantai 2', '25x25 cm', 'Beton Bertulang', 8)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_house_2f',
        templateId: 'tmpl-building-residential',
        entities,
        userParameters: { floors: 2, building_area: 160 }
      });

      assert(res.parameterSet['floors']?.value === 2, 'Floor count parameter is 2');
      assert(res.coverage.mappedCount === 6, 'All 6 entities mapped across both floors');
      const stairsMapping = res.mappedEntities.find(m => m.elementType === 'STAIRS');
      assert(Boolean(stairsMapping && stairsMapping.wbsCode?.includes('03')), 'Stairs mapped to structural WBS');
    }

    // -------------------------------------------------------------
    // [CASE 3] Hotel Template
    // -------------------------------------------------------------
    console.log('\n[CASE 3] Hotel Template Mapping (High-Rise & Elevators)');
    {
      const entities: CanonicalEntity[] = [
        createEntity('BP1', 'Bored Pile Dia 80cm', 'BORED_PILE', 'Basement 1', 'D=80 cm', 'Beton Bertulang', 20),
        createEntity('KC1', 'Kolom Komposit KC1', 'COLUMN', 'Lantai 1', '60x60 cm', 'Beton Bertulang', 16),
        createEntity('LFT1', 'Passenger Lift 1000kg', 'ELEVATOR', 'Lantai 1', '15 Orang', 'Traction Machine', 2),
        createEntity('GR1', 'Granit Tile Lobby 80x80', 'FLOOR_FINISH', 'Lantai 1', '80x80 cm', 'Granit', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_hotel',
        templateId: 'tmpl-building-hotel',
        entities,
        userParameters: { floors: 8, room_count: 120 }
      });

      assert(res.templateSnapshot.templateId === 'tmpl-building-hotel', 'Hotel template selected');
      assert(res.coverage.mappedCount === 4, 'Hotel entities mapped successfully');
      const liftMapping = res.mappedEntities.find(m => m.elementType === 'ELEVATOR');
      assert(Boolean(liftMapping && liftMapping.status === 'MAPPED'), 'Passenger lift mapped to MEP Lift category');
    }

    // -------------------------------------------------------------
    // [CASE 4] Hospital Template
    // -------------------------------------------------------------
    console.log('\n[CASE 4] Hospital Template Mapping (Medical Gas & Specialties)');
    {
      const entities: CanonicalEntity[] = [
        createEntity('K1', 'Kolom Struktur Bedah', 'COLUMN', 'Lantai 1', '40x40 cm', 'Beton Bertulang', 10),
        createEntity('MEDGAS1', 'Instalasi Gas Medis O2 & N2O', 'MEDICAL_GAS', 'Lantai 1', 'Pipa Tembaga', 'Tembaga Medis', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_hospital',
        templateId: 'tmpl-building-hospital',
        entities,
        userParameters: { bed_count: 200 }
      });

      assert(res.templateSnapshot.templateId === 'tmpl-building-hospital', 'Hospital template active');
      const gasMapping = res.mappedEntities.find(m => m.elementType === 'MEDICAL_GAS');
      assert(Boolean(gasMapping && gasMapping.workCategory.includes('GAS_MEDIS')), 'Medical gas correctly categorized in hospital WBS');
    }

    // -------------------------------------------------------------
    // [CASE 5] School Template
    // -------------------------------------------------------------
    console.log('\n[CASE 5] School Template Mapping (Classroom Layout)');
    {
      const entities: CanonicalEntity[] = [
        createEntity('P1', 'Pondasi Batu Kali', 'FOUNDATION_STONE', 'Lantai 1', '0.70x0.60 m', 'Batu Kali', 1),
        createEntity('K1', 'Kolom Struktur 20x20', 'COLUMN', 'Lantai 1', '20x20 cm', 'Beton Bertulang', 12),
        createEntity('D1', 'Dinding Kelas Bata Merah', 'WALL', 'Lantai 1', 't=15 cm', 'Bata Merah', 1),
        createEntity('J1', 'Jendela Kaca Kelas', 'WINDOW', 'Lantai 1', '120x150 cm', 'Aluminium Kaca', 8)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_school',
        templateId: 'tmpl-building-school',
        entities,
        userParameters: { classroom_count: 6 }
      });

      assert(res.templateSnapshot.templateId === 'tmpl-building-school', 'School template active');
      assert(res.coverage.mappedCount === 4, 'All classroom elements mapped');
    }

    // -------------------------------------------------------------
    // [CASE 6] Office Template
    // -------------------------------------------------------------
    console.log('\n[CASE 6] Office Template Mapping (Commercial Space)');
    {
      const entities: CanonicalEntity[] = [
        createEntity('K1', 'Kolom Struktur Kantor', 'COLUMN', 'Lantai 1', '50x50 cm', 'Beton Bertulang', 8),
        createEntity('GYP1', 'Plafon Gypsum Akustik', 'CEILING', 'Lantai 1', '9mm Hollow', 'Gypsum Board', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_office',
        templateId: 'tmpl-building-office',
        entities
      });

      assert(res.templateSnapshot.templateId === 'tmpl-building-office', 'Office template active');
      assert(res.coverage.mappedCount === 2, 'Office entities mapped');
    }

    // -------------------------------------------------------------
    // [CASE 7] Road Infrastructure (Bina Marga)
    // -------------------------------------------------------------
    console.log('\n[CASE 7] Road Infrastructure Template (Hotmix Asphalt)');
    {
      const entities: CanonicalEntity[] = [
        createEntity('ASP1', 'Laston Lapis Aus AC-WC', 'ROAD_PAVEMENT_ASPHALT', 'Section 1', 't=4 cm', 'Asphalt Hotmix', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_road',
        templateId: 'tmpl-infra-road',
        entities,
        userParameters: { road_length: 2500, road_width: 7 }
      });

      assert(res.templateSnapshot.category === 'INFRASTRUCTURE', 'Infrastructure category identified');
      assert(res.coverage.mappedCount === 1, 'Asphalt pavement mapped to Bina Marga WBS');
    }

    // -------------------------------------------------------------
    // [CASE 8] Paving Infrastructure
    // -------------------------------------------------------------
    console.log('\n[CASE 8] Paving Block Infrastructure Template');
    {
      const entities: CanonicalEntity[] = [
        createEntity('PV1', 'Paving Block K-300 t=8cm', 'PAVING_BLOCK', 'Area Parkir', 't=8 cm', 'Beton K-300', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_paving',
        templateId: 'tmpl-infra-paving',
        entities,
        userParameters: { paving_area: 1200 }
      });

      assert(res.templateSnapshot.templateId === 'tmpl-infra-paving', 'Paving template active');
      assert(res.coverage.mappedCount === 1, 'Paving block mapped');
    }

    // -------------------------------------------------------------
    // [CASE 9] Bridge Infrastructure (Bina Marga)
    // -------------------------------------------------------------
    console.log('\n[CASE 9] Bridge Infrastructure Template');
    {
      const entities: CanonicalEntity[] = [
        createEntity('AB1', 'Abutment Beton Bertulang', 'BRIDGE_ABUTMENT', 'Pier 1', 'Mass Concrete', 'Beton Bertulang', 2),
        createEntity('GIR1', 'Girder Pratekan PCI Span 30m', 'BRIDGE_GIRDER', 'Superstructure', 'L=30 m', 'Prestressed Concrete', 4)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_bridge',
        templateId: 'tmpl-infra-bridge',
        entities,
        userParameters: { bridge_span: 30 }
      });

      assert(res.templateSnapshot.templateId === 'tmpl-infra-bridge', 'Bridge template active');
      assert(res.coverage.mappedCount === 2, 'Bridge substructure and girder mapped');
    }

    // -------------------------------------------------------------
    // [CASE 10] Water Structure / SDA Template
    // -------------------------------------------------------------
    console.log('\n[CASE 10] Water Structure / SDA Template (Weir & Sluice Gate)');
    {
      const entities: CanonicalEntity[] = [
        createEntity('LIN1', 'Pasangan Batu Saluran Irigasi', 'CANAL_LINING', 'Saluran Primer', '1:3 Mortar', 'Batu Kali', 1),
        createEntity('PA1', 'Pintu Air Sorong Baja', 'SLUICE_GATE', 'Bangunan Bagi', 'B=1.5 m', 'Baja Profil', 2)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_sda',
        templateId: 'tmpl-infra-water',
        entities,
        userParameters: { canal_length: 800 }
      });

      assert(res.templateSnapshot.templateId === 'tmpl-infra-water', 'Water structure SDA template active');
      assert(res.coverage.mappedCount === 2, 'SDA canal lining & sluice gate mapped');
    }

    // -------------------------------------------------------------
    // [CASE 11] Basement Evidence Dynamic Trigger
    // -------------------------------------------------------------
    console.log('\n[CASE 11] Basement Evidence Dynamic Activation');
    {
      const entities: CanonicalEntity[] = [
        createEntity('DPT1', 'Dinding Penahan Tanah Basement DPT1', 'BASEMENT_WALL', 'Basement 1', 't=30 cm', 'Beton Bertulang', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_basement',
        templateId: 'tmpl-building-residential',
        entities
      });

      assert(res.parameterSet['has_basement']?.value === true, 'Basement parameter extracted as true');
      const basementWork = res.conditionalWorkActivated.find(w => w.wbsTitle.toLowerCase().includes('basement'));
      assert(Boolean(basementWork), 'Basement conditional WBS branch dynamically activated');
    }

    // -------------------------------------------------------------
    // [CASE 12] Lift / Elevator Evidence Dynamic Trigger
    // -------------------------------------------------------------
    console.log('\n[CASE 12] Lift / Elevator Dynamic Activation');
    {
      const entities: CanonicalEntity[] = [
        createEntity('LFT1', 'Elevator Penumpang 8 Orang', 'ELEVATOR', 'Lantai 1', '8 Passenger', 'Traction', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_lift',
        templateId: 'tmpl-building-residential',
        entities
      });

      assert(res.parameterSet['has_lift']?.value === true, 'Lift parameter extracted as true');
      const liftWork = res.conditionalWorkActivated.find(w => w.wbsTitle.toLowerCase().includes('lift'));
      assert(Boolean(liftWork), 'Lift conditional WBS branch dynamically activated');
    }

    // -------------------------------------------------------------
    // [CASE 13] Swimming Pool Evidence Dynamic Trigger
    // -------------------------------------------------------------
    console.log('\n[CASE 13] Swimming Pool Dynamic Activation');
    {
      const entities: CanonicalEntity[] = [
        createEntity('POOL1', 'Kolam Renang Overflow', 'SWIMMING_POOL', 'Ground', '8x4 m', 'Beton Kedap Air', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_pool',
        templateId: 'tmpl-building-residential',
        entities
      });

      assert(res.parameterSet['has_pool']?.value === true, 'Pool parameter extracted as true');
      const poolWork = res.conditionalWorkActivated.find(w => w.wbsTitle.toLowerCase().includes('kolam') || w.wbsTitle.toLowerCase().includes('pool'));
      assert(Boolean(poolWork), 'Swimming pool conditional WBS branch dynamically activated');
    }

    // -------------------------------------------------------------
    // [CASE 14] Missing Data & Assumptions
    // -------------------------------------------------------------
    console.log('\n[CASE 14] Missing Required Data Handling & Assumptions');
    {
      const entities: CanonicalEntity[] = [];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_missing',
        templateId: 'tmpl-building-residential',
        entities
      });

      assert(Object.keys(res.assumptionsApplied).length > 0, 'Standard template assumptions applied for missing data');
      assert(res.validationFindings.length > 0, 'Validation findings flagged for review');
    }

    // -------------------------------------------------------------
    // [CASE 15] Unmapped Entity & Coverage Calculation (Not Accuracy)
    // -------------------------------------------------------------
    console.log('\n[CASE 15] Unmapped Entity Integrity & Coverage Calculation');
    {
      const entities: CanonicalEntity[] = [
        createEntity('K1', 'Kolom Praktis 15x15', 'COLUMN', 'Lantai 1', '15x15 cm', 'Beton', 4),
        createEntity('UNK1', 'Custom Alien Specialty Structure XYZ', 'UNKNOWN_SPECIALTY_DEVICE', 'Lantai 1', 'N/A', 'Titanium', 1)
      ];

      const res = await coordinator.processProjectTemplateMapping({
        projectId: 'proj_unmapped',
        templateId: 'tmpl-building-residential',
        entities
      });

      assert(res.coverage.mappedCount === 1, '1 valid entity mapped');
      assert(res.coverage.unmappedCount === 1, '1 unknown entity left UNMAPPED (not forced)');
      assert(res.coverage.coveragePercentage === 50.0, 'Coverage percentage calculated as 50.0% (labeled as coverage, not accuracy)');
      const unmappedFinding = res.validationFindings.find(f => f.category === 'UNMAPPED_ENTITY');
      assert(Boolean(unmappedFinding), 'Alert generated: 1 construction entities belum terpetakan');
    }

    console.log('\n============================================================');
    console.log(`EZRAB PHASE 6.4 TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('============================================================\n');

    return failed === 0;
  } catch (error) {
    console.error('Fatal error in Phase 6.4 test suite:', error);
    return false;
  }
}

// Direct execution
if (process.argv[1] && process.argv[1].includes('phase6_4_templateDrivenMapping')) {
  runPhase64Tests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
