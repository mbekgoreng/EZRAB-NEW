import { describe, it, expect } from 'vitest';
import { HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE } from '../../src/data/buildingTemplates/templates/houseType36Template';
import { BuildingGeometryAdapter } from '../../src/viewer3d/geometry/buildingGeometryAdapter';
import { GeometryValidator } from '../../src/viewer3d/geometry/geometryValidation';
import { SpaceGridPacker } from '../../src/viewer3d/geometry/spaceGridPacker';
import { MasterGeometryResolver } from '../../src/viewer3d/geometry/masterGeometryResolver';

describe('EZRAB AI CORE — PHASE 4: 3D PARAMETRIC WIREFRAME VIEWER & GEOMETRY ADAPTERS', () => {
  // =========================================================================
  // 1. VERTICAL SLICE: HOUSE-T36-1FL GEOMETRY ADAPTER
  // =========================================================================
  describe('Vertical Slice: Rumah Tipe 36 Satu Lantai 3D Model', () => {
    const template = HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE;

    it('should generate valid 3D model with complete BIM layers for House T36', () => {
      const model = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 6.0,
        buildingLength: 6.0,
      });

      expect(model).toBeDefined();
      expect(model.templateCode).toBe('HOUSE-T36-1FL');
      expect(model.elements.length).toBeGreaterThan(20);
      expect(model.isDeterministic).toBe(true);

      // Verify Bounding Box
      expect(model.boundingBox.size.width).toBeGreaterThanOrEqual(6.0);
      expect(model.boundingBox.size.depth).toBeGreaterThanOrEqual(6.0);
      expect(model.boundingBox.size.height).toBeGreaterThan(3.5); // Walls + Roof
    });

    it('should have 100% unique and deterministic stable IDs for every 3D element', () => {
      const model = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 6.0,
        buildingLength: 6.0,
      });

      const stableIds = model.elements.map((el) => el.stableId);
      const uniqueIds = new Set(stableIds);
      expect(uniqueIds.size).toBe(stableIds.length);

      // Verify key stable IDs exist
      expect(stableIds).toContain('HOUSE-T36-1FL-FND-FRONT');
      expect(stableIds).toContain('HOUSE-T36-1FL-SLOOF-FRONT');
      expect(stableIds).toContain('HOUSE-T36-1FL-COL-1');
      expect(stableIds).toContain('HOUSE-T36-1FL-WALL-FRONT-1');
      expect(stableIds).toContain('HOUSE-T36-1FL-DOOR-MAIN');
      expect(stableIds).toContain('HOUSE-T36-1FL-RING-FRONT');
      expect(stableIds).toContain('HOUSE-T36-1FL-ROOF-SLOPE-LEFT');
      expect(stableIds).toContain('HOUSE-T36-1FL-CEILING');
    });

    it('should produce 100% identical and reproducible output on consecutive runs (Determinism)', () => {
      const run1 = BuildingGeometryAdapter.generateBuildingModel(template, { buildingWidth: 6.0, buildingLength: 6.0 });
      const run2 = BuildingGeometryAdapter.generateBuildingModel(template, { buildingWidth: 6.0, buildingLength: 6.0 });

      expect(run1.elements.length).toBe(run2.elements.length);
      expect(run1.boundingBox.size).toEqual(run2.boundingBox.size);

      for (let i = 0; i < run1.elements.length; i++) {
        const el1 = run1.elements[i];
        const el2 = run2.elements[i];
        expect(el1.stableId).toBe(el2.stableId);
        expect(el1.position).toEqual(el2.position);
        expect(el1.dimensions).toEqual(el2.dimensions);
        expect(el1.layer).toBe(el2.layer);
      }
    });

    it('should reject NaN, Infinity, and negative dimensions across all elements', () => {
      const model = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 6.0,
        buildingLength: 6.0,
      });

      for (const el of model.elements) {
        const valDim = GeometryValidator.validateDimensions(el.dimensions, el.name);
        expect(valDim.valid).toBe(true);
        expect(valDim.errors).toHaveLength(0);

        const valPos = GeometryValidator.validatePosition(el.position, el.name);
        expect(valPos.valid).toBe(true);
        expect(valPos.errors).toHaveLength(0);
      }
    });

    it('should accurately categorize elements into distinct BIM layers', () => {
      const model = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 6.0,
        buildingLength: 6.0,
      });

      expect(model.layerCounts.FOUNDATION).toBeGreaterThanOrEqual(4);
      expect(model.layerCounts.STRUCTURE).toBeGreaterThanOrEqual(16); // Sloof + 12 Kolom + Ring Balok
      expect(model.layerCounts.WALLS).toBeGreaterThanOrEqual(4);
      expect(model.layerCounts.OPENINGS).toBeGreaterThanOrEqual(2);
      expect(model.layerCounts.ROOF).toBeGreaterThanOrEqual(2);
      expect(model.layerCounts.FINISHES).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 2. SPACE GRID PACKER TESTS
  // =========================================================================
  describe('Space Grid Packer', () => {
    it('should pack 6 residential rooms into structured architectural bounds', () => {
      const spaces = HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE.spaces;
      const packed = SpaceGridPacker.packResidentialSpaces(6.0, 6.0, spaces);

      expect(packed.length).toBe(6);
      for (const room of packed) {
        expect(room.width).toBeGreaterThan(0);
        expect(room.length).toBeGreaterThan(0);
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.z).toBeGreaterThanOrEqual(0);
        expect(room.x + room.width).toBeLessThanOrEqual(6.01);
        expect(room.z + room.length).toBeLessThanOrEqual(6.01);
      }
    });
  });

  // =========================================================================
  // 3. MASTER GEOMETRY RESOLVER TESTS
  // =========================================================================
  describe('Master Geometry Resolver', () => {
    it('should resolve HOUSE-T36-1FL via ID and code', () => {
      const modelById = MasterGeometryResolver.resolve({
        templateIdOrCode: 'template-house-type-36-single-floor',
      });
      const modelByCode = MasterGeometryResolver.resolve({
        templateIdOrCode: 'HOUSE-T36-1FL',
      });

      expect(modelById.templateId).toBe('template-house-type-36-single-floor');
      expect(modelByCode.templateCode).toBe('HOUSE-T36-1FL');
    });

    it('should throw clear error when resolving non-existent template ID', () => {
      expect(() => {
        MasterGeometryResolver.resolve({ templateIdOrCode: 'non-existent-template-id' });
      }).toThrow(/tidak ditemukan/);
    });
  });

  // =========================================================================
  // 4. GEOMETRY VALIDATOR SANITY TESTS
  // =========================================================================
  describe('Geometry Validator Sanity Checks', () => {
    it('should catch negative and NaN dimensions', () => {
      const negDim = GeometryValidator.validateDimensions({ width: -5, height: 3, depth: 3 });
      expect(negDim.valid).toBe(false);
      expect(negDim.errors.some((e) => e.includes('negatif'))).toBe(true);

      const nanDim = GeometryValidator.validateDimensions({ width: NaN, height: 3, depth: 3 });
      expect(nanDim.valid).toBe(false);
      expect(nanDim.errors.some((e) => e.includes('NaN'))).toBe(true);
    });
  });

  // =========================================================================
  // 5. EXHAUSTIVE GEOMETRY & COLUMN TRACEABILITY AUDIT
  // =========================================================================
  describe('Exhaustive Geometry Traceability & Column Audit', () => {

    const template = HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE;

    it('should verify exact 41 elements breakdown for House T36', () => {
      const model = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 6.0,
        buildingLength: 6.0,
      });

      expect(model.elements.length).toBe(41);
      expect(model.layerCounts.FOUNDATION).toBe(7); // 4 perimeter + 3 interior
      expect(model.layerCounts.STRUCTURE).toBe(20);  // 4 sloof + 12 kolom + 4 ring balok
      expect(model.layerCounts.WALLS).toBe(8);      // 5 perimeter panels + 3 interior partitions
      expect(model.layerCounts.OPENINGS).toBe(2);   // 1 main door + 1 window
      expect(model.layerCounts.FINISHES).toBe(1);   // 1 ceiling
      expect(model.layerCounts.ROOF).toBe(3);       // 2 slope planes + 1 ridge truss
    });

    it('should verify all 12 columns are positioned at structural junctions and rest on sloof elevation', () => {
      const model = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 6.0,
        buildingLength: 6.0,
      });

      const columns = model.elements.filter((el) => el.elementType === 'KOLOM');
      expect(columns.length).toBe(12);

      // Verify each column
      for (const col of columns) {
        expect(col.dimensions.width).toBe(0.15); // 15 cm
        expect(col.dimensions.depth).toBe(0.15); // 15 cm
        expect(col.dimensions.height).toBe(3.50); // 3.5 m
        expect(col.position.y).toBe(0.20 + (3.50 / 2)); // Exactly 1.95m center elevation
        expect(col.wbsCode).toBe('04.02');
        expect(col.sourceParameterKeys).toContain('kolom_size');
        expect(col.sourceParameterKeys).toContain('wall_height');
        expect(col.confidence).toBe('VERIFIED');
      }

      // Check corner columns coordinates
      const cornerCoords = columns.map((c) => ({ x: Math.round(c.position.x * 100) / 100, z: Math.round(c.position.z * 100) / 100 }));
      expect(cornerCoords).toContainEqual({ x: 0, z: 0 });
      expect(cornerCoords).toContainEqual({ x: 6, z: 0 });
      expect(cornerCoords).toContainEqual({ x: 0, z: 6 });
      expect(cornerCoords).toContainEqual({ x: 6, z: 6 });
    });

    it('should verify roof ridge height and 30 degree slope geometry', () => {
      const model = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 6.0,
        buildingLength: 6.0,
      });

      const ridgeTruss = model.elements.find((el) => el.stableId === 'HOUSE-T36-1FL-ROOF-TRUSS-RIDGE');
      expect(ridgeTruss).toBeDefined();

      // Ridge height: sloofH (0.20) + wallH (3.50) + ringH (0.15) + (3.0 + 0.8)*tan(30 deg) = 3.85 + 2.1939 = ~6.04m
      expect(ridgeTruss?.position.x).toBe(3.0); // center
      expect(ridgeTruss?.position.y).toBeCloseTo(6.044, 2);

      // Roof slope panels
      const leftSlope = model.elements.find((el) => el.stableId === 'HOUSE-T36-1FL-ROOF-SLOPE-LEFT');
      const rightSlope = model.elements.find((el) => el.stableId === 'HOUSE-T36-1FL-ROOF-SLOPE-RIGHT');
      expect(leftSlope).toBeDefined();
      expect(rightSlope).toBeDefined();
      expect(leftSlope?.rotation.z).toBeCloseTo((30 * Math.PI) / 180, 4);
      expect(rightSlope?.rotation.z).toBeCloseTo(-(30 * Math.PI) / 180, 4);
    });

    it('should dynamically adapt coordinates when parameters are modified', () => {
      const modelCustom = BuildingGeometryAdapter.generateBuildingModel(template, {
        buildingWidth: 7.0,
        buildingLength: 8.0,
      });

      expect(modelCustom.boundingBox.size.width).toBeGreaterThanOrEqual(7.0);
      expect(modelCustom.boundingBox.size.depth).toBeGreaterThanOrEqual(8.0);

      const colCorner = modelCustom.elements.find((el) => el.stableId === 'HOUSE-T36-1FL-COL-4');
      expect(colCorner?.position.x).toBe(7.0);
      expect(colCorner?.position.z).toBe(8.0);
    });

    it('should verify viewer model generation does not mutate template or registry', () => {
      const origParams = { ...template.parameters };
      BuildingGeometryAdapter.generateBuildingModel(template, { buildingWidth: 6.0 });
      expect(template.parameters).toEqual(origParams);
    });
  });

  // =========================================================================
  // 6. ALL 7 MASTER TEMPLATES 3D GEOMETRY VERIFICATION
  // =========================================================================
  describe('All 7 Master Templates 3D Models Verification', () => {
    const allTemplates = [
      { code: 'HOUSE-T36-1FL', category: 'residential', minElements: 30 },
      { code: 'HOUSE-T45-1FL', category: 'residential', minElements: 30 },
      { code: 'HOUSE-T70-1FL', category: 'residential', minElements: 30 },
      { code: 'HOUSE-T36-2FL', category: 'residential', minElements: 35 },
      { code: 'RUKO-2FL', category: 'commercial', minElements: 35 },
      { code: 'INFRA-ROAD-CONCRETE', category: 'road', minElements: 10 },
      { code: 'DRAIN-UDITCH', category: 'drainage', minElements: 15 },
    ];

    allTemplates.forEach((tmpl) => {
      it(`should generate valid 3D model for ${tmpl.code} (${tmpl.category})`, () => {
        const model = MasterGeometryResolver.resolve({
          templateIdOrCode: tmpl.code,
        });

        expect(model).toBeDefined();
        expect(model.templateCode).toBe(tmpl.code);
        expect(model.elements.length).toBeGreaterThanOrEqual(tmpl.minElements);
        expect(model.isDeterministic).toBe(true);

        // Verify bounding box sanity
        expect(model.boundingBox.size.width).toBeGreaterThan(0);
        expect(model.boundingBox.size.height).toBeGreaterThan(0);
        expect(model.boundingBox.size.depth).toBeGreaterThan(0);
        expect(Number.isFinite(model.boundingBox.size.width)).toBe(true);
        expect(Number.isFinite(model.boundingBox.size.height)).toBe(true);
        expect(Number.isFinite(model.boundingBox.size.depth)).toBe(true);

        // Verify all element dimensions and positions are non-negative and finite
        for (const el of model.elements) {
          const dimVal = GeometryValidator.validateDimensions(el.dimensions, el.name);
          expect(dimVal.valid).toBe(true);
          const posVal = GeometryValidator.validatePosition(el.position, el.name);
          expect(posVal.valid).toBe(true);
          expect(el.stableId).toBeDefined();
          expect(el.layer).toBeDefined();
        }

        // Verify Stable ID uniqueness
        const ids = model.elements.map((e) => e.stableId);
        const uniqueSet = new Set(ids);
        expect(uniqueSet.size).toBe(ids.length);
      });
    });

    it('should generate concrete road model with accurate layers (Subbase, Lean, Slabs, Joints, Markings)', () => {
      const roadModel = MasterGeometryResolver.resolve({
        templateIdOrCode: 'INFRA-ROAD-CONCRETE',
        parameters: { roadLength: 100, roadWidth: 7.0 },
      });

      expect(roadModel.templateCode).toBe('INFRA-ROAD-CONCRETE');
      expect(roadModel.layerCounts.FOUNDATION).toBeGreaterThanOrEqual(1); // Subbase
      expect(roadModel.layerCounts.STRUCTURE).toBeGreaterThanOrEqual(5);  // Lean + Rigid panels
      expect(roadModel.layerCounts.INFRASTRUCTURE).toBeGreaterThanOrEqual(1); // Joint sealant
      expect(roadModel.layerCounts.FINISHES).toBeGreaterThanOrEqual(3);  // Bahu jalan + Markings
    });

    it('should generate precast U-Ditch drainage model with accurate U-channel segments & covers', () => {
      const drainModel = MasterGeometryResolver.resolve({
        templateIdOrCode: 'DRAIN-UDITCH',
        parameters: { drainageLength: 24, uDitchWidth: 0.60, uDitchHeight: 0.60, coverType: 'HEAVY_DUTY' },
      });

      expect(drainModel.templateCode).toBe('DRAIN-UDITCH');
      expect(drainModel.layerCounts.FOUNDATION).toBeGreaterThanOrEqual(2); // Pasir urug + Lean concrete
      expect(drainModel.layerCounts.DRAINAGE).toBeGreaterThanOrEqual(15);  // U-Ditch precast units + backfill
      expect(drainModel.layerCounts.OPENINGS).toBeGreaterThanOrEqual(10);  // Heavy duty covers
    });

    it('should generate multi-floor elements for 2-floor templates (HOUSE-T36-2FL & RUKO-2FL)', () => {
      const house2Fl = MasterGeometryResolver.resolve({ templateIdOrCode: 'HOUSE-T36-2FL' });
      const ruko2Fl = MasterGeometryResolver.resolve({ templateIdOrCode: 'RUKO-2FL' });

      // Check Floor 2 Slab exists
      expect(house2Fl.elements.some((e) => e.elementType === 'PELAT_LANTAI')).toBe(true);
      expect(ruko2Fl.elements.some((e) => e.elementType === 'PELAT_LANTAI')).toBe(true);

      // Check Stairs exists
      expect(house2Fl.elements.some((e) => e.elementType === 'TANGGA')).toBe(true);
      expect(ruko2Fl.elements.some((e) => e.elementType === 'TANGGA')).toBe(true);

      // Check Floor 2 Columns exist
      expect(house2Fl.elements.some((e) => e.stableId.includes('COL-FL2'))).toBe(true);
      expect(ruko2Fl.elements.some((e) => e.stableId.includes('COL-FL2'))).toBe(true);
    });
  });
});

