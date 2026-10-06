import { describe, it, expect } from 'vitest';
import { masterBuildingTemplateRegistry } from '../../src/data/buildingTemplates/masterTemplateRegistry';
import { parametricVolumeEngine } from '../../src/engine/parametricVolumeEngine/parametricVolumeEngine';
import { HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE } from '../../src/data/buildingTemplates/templates/houseType36Template';
import { HOUSE_TYPE_45_SINGLE_FLOOR_TEMPLATE } from '../../src/data/buildingTemplates/templates/houseType45Template';
import { HOUSE_TYPE_70_SINGLE_FLOOR_TEMPLATE } from '../../src/data/buildingTemplates/templates/houseType70Template';
import { HOUSE_TYPE_36_TWO_FLOOR_TEMPLATE } from '../../src/data/buildingTemplates/templates/houseType36TwoFloorTemplate';
import { SHOPHOUSE_2_FLOOR_TEMPLATE } from '../../src/data/buildingTemplates/templates/shophouse2FloorTemplate';
import { CONCRETE_ROAD_TEMPLATE } from '../../src/data/buildingTemplates/templates/concreteRoadTemplate';
import { UDITCH_DRAINAGE_TEMPLATE } from '../../src/data/buildingTemplates/templates/uDitchDrainageTemplate';

describe('EZRAB AI CORE — PHASE 2 & 3: MASTER TEMPLATES & PARAMETRIC VOLUME ENGINE', () => {
  // =========================================================================
  // 1. MASTER TEMPLATE REGISTRY & SCHEMA VALIDITY
  // =========================================================================
  describe('Master Template Registry', () => {
    it('should register all priority templates with complete schemas', () => {
      const templates = masterBuildingTemplateRegistry.getAllTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(7);

      const templateIds = templates.map((t) => t.id);
      expect(templateIds).toContain('template-house-type-36-single-floor');
      expect(templateIds).toContain('template-house-type-45-single-floor');
      expect(templateIds).toContain('template-house-type-70-single-floor');
      expect(templateIds).toContain('template-house-type-36-two-floor');
      expect(templateIds).toContain('template-shophouse-2-floor');
      expect(templateIds).toContain('template-concrete-road-rigid-pavement');
      expect(templateIds).toContain('template-uditch-drainage');
    });

    it('should retrieve template by exact ID or code case-insensitively', () => {
      const byId = masterBuildingTemplateRegistry.getTemplateById('template-house-type-36-single-floor');
      const byCode = masterBuildingTemplateRegistry.getTemplateById('HOUSE-T36-1FL');
      const byCodeLower = masterBuildingTemplateRegistry.getTemplateById('house-t36-1fl');

      expect(byId).toBeDefined();
      expect(byCode).toBeDefined();
      expect(byCodeLower).toBeDefined();
      expect(byId?.id).toBe(byCode?.id);
    });

    it('should correctly filter templates by category and search term', () => {
      const residential = masterBuildingTemplateRegistry.getTemplatesByCategory('residential');
      expect(residential.length).toBeGreaterThanOrEqual(4);

      const roads = masterBuildingTemplateRegistry.getTemplatesByCategory('road');
      expect(roads.length).toBeGreaterThanOrEqual(1);

      const searchHouse = masterBuildingTemplateRegistry.searchTemplates('rumah');
      expect(searchHouse.length).toBeGreaterThanOrEqual(4);
    });
  });

  // =========================================================================
  // 2. PARAMETER VALIDATION & BOUNDARY TESTING
  // =========================================================================
  describe('Parameter Validation & Error Handling', () => {
    const template = HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE;

    it('should accept valid standard parameters', () => {
      const val = parametricVolumeEngine.validateParameters(template, {
        buildingArea: 36,
        buildingWidth: 6,
        buildingLength: 6,
        floorCount: 1,
        bedroomCount: 2,
        bathroomCount: 1,
        wallMaterial: 'BATA_RINGAN',
        roofCover: 'GENTENG_METAL',
        floorFinish: 'KERAMIK_40X40',
      });

      expect(val.valid).toBe(true);
      expect(val.errors).toHaveLength(0);
      expect(val.sanitizedParameters.buildingArea).toBe(36);
    });

    it('should use default values when optional/unspecified params are omitted', () => {
      const val = parametricVolumeEngine.validateParameters(template, {});
      expect(val.valid).toBe(true);
      expect(val.sanitizedParameters.buildingArea).toBe(36);
      expect(val.sanitizedParameters.wallMaterial).toBe('BATA_RINGAN');
    });

    it('should reject negative values for dimensions and counts', () => {
      const val = parametricVolumeEngine.validateParameters(template, {
        buildingArea: -36,
        buildingWidth: -6,
      });

      expect(val.valid).toBe(false);
      expect(val.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid enum values', () => {
      const val = parametricVolumeEngine.validateParameters(template, {
        wallMaterial: 'TITANIUM_GOLD_WALL',
      });

      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.includes('TITANIUM_GOLD_WALL'))).toBe(true);
    });

    it('should reject NaN and Infinity values', () => {
      const valNaN = parametricVolumeEngine.validateParameters(template, {
        buildingArea: NaN,
      });
      const valInf = parametricVolumeEngine.validateParameters(template, {
        buildingArea: Infinity,
      });

      expect(valNaN.valid).toBe(false);
      expect(valInf.valid).toBe(false);
    });
  });

  // =========================================================================
  // 3. VERTICAL SLICE: RUMAH TIPE 36 SATU LANTAI
  // =========================================================================
  describe('Vertical Slice: Rumah Tipe 36 Satu Lantai Deterministic Calculation', () => {
    it('should generate complete, non-negative, non-NaN work items with full traces', () => {
      const result = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-single-floor',
        parameters: {
          buildingArea: 36,
          buildingWidth: 6,
          buildingLength: 6,
          bedroomCount: 2,
          bathroomCount: 1,
        },
        region: 'DKI Jakarta',
      });

      expect(result.templateId).toBe('template-house-type-36-single-floor');
      expect(result.workItems.length).toBeGreaterThan(15);
      expect(result.totalDirectCost).toBeGreaterThan(50_000_000);
      expect(result.totalRabCost).toBeGreaterThan(result.totalDirectCost);
      expect(result.isReadyForSpreadsheet).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify every work item is safe, non-negative, and has formula traces
      for (const wi of result.workItems) {
        expect(wi.quantity).toBeGreaterThanOrEqual(0);
        expect(isNaN(wi.quantity)).toBe(false);
        expect(isFinite(wi.quantity)).toBe(true);
        expect(wi.unitPrice).toBeGreaterThan(0);
        expect(wi.totalPrice).toBe(Math.round(wi.quantity * wi.unitPrice));
        expect(wi.formula).toBeDefined();
        expect(wi.calculationTrace.length).toBeGreaterThan(0);
      }
    });

    it('should correctly deduct wall openings (doors and windows) from wall area', () => {
      const result = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-single-floor',
        parameters: { buildingArea: 36, buildingWidth: 6, buildingLength: 6 },
      });

      const wallItem = result.workItems.find((w) => w.workItemId === 't36-dinding-01');
      expect(wallItem).toBeDefined();
      expect(wallItem?.quantity).toBeGreaterThan(50);
      expect(wallItem?.quantity).toBeLessThan(150);
      expect(wallItem?.formulaInputs.luasKotor).toBeDefined();
      expect(wallItem?.formulaInputs.luasBukaanPintuJendela).toBeGreaterThan(0);
    });

    it('should apply trigonometric cosine factor for roof slope calculation', () => {
      const result = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-single-floor',
        parameters: { buildingArea: 36, buildingWidth: 6, buildingLength: 6 },
      });

      const roofCover = result.workItems.find((w) => w.workItemId === 't36-atap-01');
      expect(roofCover).toBeDefined();
      expect(roofCover?.formulaInputs.luasProyeksi).toBeDefined();
      expect(roofCover?.quantity).toBeGreaterThan(36); // Roof area > floor area due to pitch & overhang
    });


    it('should adjust unit prices and total RAB based on regional price indices', () => {
      const jktResult = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-single-floor',
        region: 'DKI Jakarta',
      });

      const papuaResult = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-single-floor',
        region: 'Papua',
      });

      const jatengResult = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-single-floor',
        region: 'Jawa Tengah',
      });

      expect(papuaResult.totalRabCost).toBeGreaterThan(jktResult.totalRabCost);
      expect(jktResult.totalRabCost).toBeGreaterThan(jatengResult.totalRabCost);
    });
  });

  // =========================================================================
  // 4. MULTI-TEMPLATE RECALCULATION & EXTENSION
  // =========================================================================
  describe('Multi-Template Verification (T45, T70, 2-Floor, Ruko, Road, U-Ditch)', () => {
    it('should calculate Rumah Tipe 45 Satu Lantai with realistic cost per m2', () => {
      const res = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-45-single-floor',
        region: 'Jawa Barat',
      });

      expect(res.workItems.length).toBeGreaterThan(15);
      expect(res.costPerM2).toBeGreaterThan(3_000_000);
      expect(res.costPerM2).toBeLessThan(8_000_000);
    });

    it('should calculate Rumah Tipe 70 Satu Lantai', () => {
      const res = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-70-single-floor',
      });

      expect(res.totalDirectCost).toBeGreaterThan(100_000_000);
    });

    it('should calculate Rumah Tipe 36 Dua Lantai with upper floor structure', () => {
      const res = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-two-floor',
      });

      expect(res.workItems.length).toBeGreaterThan(15);
      expect(res.totalRabCost).toBeGreaterThan(150_000_000);
    });

    it('should calculate Shophouse 2-Floor (Ruko)', () => {
      const res = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-shophouse-2-floor',
      });

      expect(res.workItems.length).toBeGreaterThan(15);
      expect(res.category).toBe('commercial');
    });

    it('should calculate Concrete Road (Rigid Pavement Bina Marga)', () => {
      const res = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-concrete-road-rigid-pavement',
        parameters: {
          roadLength: 200,
          roadWidth: 4.0,
          slabThickness: 0.20,
        },
      });

      expect(res.workItems.length).toBeGreaterThanOrEqual(5);
      const rigidSlab = res.workItems.find((w) => w.workItemId === 'road-beton-01');
      expect(rigidSlab?.quantity).toBe(160); // 200 * 4.0 * 0.20 = 160 m3
    });



    it('should calculate U-Ditch Precast Drainage (PUPR SDA)', () => {
      const res = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-uditch-drainage',
        parameters: {
          drainageLength: 150,
          uDitchWidth: 0.40,
          uDitchHeight: 0.40,
        },
      });

      expect(res.workItems.length).toBe(7);
      const uditchItem = res.workItems.find((w) => w.workItemId === 'wi-uditch-05');
      expect(uditchItem?.quantity).toBe(150);
    });
  });

  // =========================================================================
  // 5. SPREADSHEET COMPATIBILITY & AUDIT TRAIL
  // =========================================================================
  describe('Spreadsheet Compatibility & Audit Trail', () => {
    it('should export generated work items to standard EZRAB spreadsheet items', () => {
      const res = parametricVolumeEngine.generateRABFromTemplate({
        templateId: 'template-house-type-36-single-floor',
      });

      const spreadsheetItems = parametricVolumeEngine.toRabItems(res);
      expect(spreadsheetItems.length).toBe(res.workItems.length);

      const first = spreadsheetItems[0];
      expect(first.id).toBeDefined();
      expect(first.wbsCode).toBeDefined();
      expect(first.name).toBeDefined();
      expect(first.volume).toBeGreaterThan(0);
      expect(first.unitPrice).toBeGreaterThan(0);
      expect(first.totalPrice).toBe(Math.round(first.volume * first.unitPrice));
      expect(first.calculationTrace).toBeDefined();
    });
  });
});
