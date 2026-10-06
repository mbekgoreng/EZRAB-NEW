import test from 'node:test';
import assert from 'node:assert/strict';
import { laborDatabaseService, MASTER_LABOR_ROSTER } from '../domain/labor/laborDatabaseService';
import { equipmentDatabaseService, MASTER_EQUIPMENT_ROSTER } from '../domain/equipment/equipmentDatabaseService';
import { resourceIntelligenceService } from '../services/resourceIntelligenceService';

test('EZRAB Master Construction Resource Intelligence System 2026', async (t) => {
  await t.test('1. Master Tenaga Kerja Database Roster & Categorization', () => {
    const allLabor = laborDatabaseService.getAllLabor();
    assert.ok(allLabor.length >= 20, `Labor roster must contain comprehensive roles, got ${allLabor.length}`);

    // Verify presence of core roles
    const mason = laborDatabaseService.getLaborById('LAB-002');
    assert.ok(mason, 'Tukang Batu must exist in database');
    assert.equal(mason?.name.includes('Tukang Batu'), true);
    assert.ok(mason?.aliases.includes('Mason') || mason?.aliases.includes('Tukang Pasang Bata'), 'Aliases must include Mason/Bata');
    assert.equal(mason?.unit, 'OH');
    assert.ok(mason?.basePriceOH && mason.basePriceOH > 100000, 'Base price OH must be valid');

    // Verify specialized roles
    const surveyor = laborDatabaseService.getLaborById('LAB-SRV-001');
    assert.ok(surveyor, 'Juru Ukur / Surveyor must exist');
    assert.equal(surveyor?.skillLevel, 'SPECIALIST');

    const qs = laborDatabaseService.getLaborById('LAB-QS-001');
    assert.ok(qs, 'Quantity Surveyor must exist');
    assert.equal(qs?.skillLevel, 'ENGINEER');

    const pm = laborDatabaseService.getLaborById('LAB-MAN-001');
    assert.ok(pm, 'Project Manager must exist');
    assert.equal(pm?.skillLevel, 'MANAGEMENT');
  });

  await t.test('2. Labor Regional Wage Multiplier (38 Indonesian Provinces)', () => {
    const dki = laborDatabaseService.getAdjustedRate('LAB-002', 'DKI Jakarta');
    const jabar = laborDatabaseService.getAdjustedRate('LAB-002', 'Jawa Barat');
    const papua = laborDatabaseService.getAdjustedRate('LAB-002', 'Papua');
    const ikn = laborDatabaseService.getAdjustedRate('LAB-002', 'Nusantara (IKN)');

    assert.equal(dki.factor, 1.0);
    assert.ok(jabar.factor < 1.0, 'Jawa Barat index factor should be slightly below DKI');
    assert.ok(papua.factor > 1.4, 'Papua wage factor should reflect remote logistics index');
    assert.ok(ikn.factor >= 1.25, 'IKN wage factor should reflect strategic development index');
    assert.ok(papua.priceOH > dki.priceOH, 'Papua wage must be higher than DKI');
  });

  await t.test('3. Labor Multi-Field Search with Aliases & Duplicate Prevention', () => {
    // Search by Indonesian name
    const res1 = laborDatabaseService.searchLabor('batu');
    assert.ok(res1.length > 0, 'Search for "batu" should return results');

    // Search by English alias
    const res2 = laborDatabaseService.searchLabor('mason');
    assert.ok(res2.length > 0, 'Search for English alias "mason" should return Tukang Batu');
    assert.ok(res2.some((l) => l.name.includes('Tukang Batu')));

    // Duplicate prevention
    const dupRes = laborDatabaseService.addLabor({
      code: 'L.02',
      name: 'Tukang Batu',
      aliases: ['Mason'],
      category: 'Dinding',
      subcategory: 'Plesteran',
      roleCategory: 'Tukang',
      skillLevel: 'SKILLED',
      unit: 'OH',
      basePriceOH: 160000,
      basePriceOJ: 22857,
      workHoursPerDay: 7,
      overtimeHourlyRate: 34000,
      regionalFactor: 1.0,
      effectiveDate: '2026-01-15',
      regulationSource: 'Test',
      sourceStatus: 'USER_INPUT',
      status: 'UNVERIFIED',
      duties: ['Test'],
      safetyRequirements: ['Helm'],
    });

    assert.equal(dupRes.success, false, 'Adding existing code/canonical name must fail duplicate validation');
  });

  await t.test('4. Master Peralatan Database Roster & Machine Capabilities', () => {
    const allEquip = equipmentDatabaseService.getAllEquipment();
    assert.ok(allEquip.length >= 20, `Equipment roster must contain comprehensive machinery, got ${allEquip.length}`);

    // Excavator 20 Ton
    const exc = equipmentDatabaseService.getEquipmentById('EQP-001');
    assert.ok(exc, 'Excavator 20 Ton must exist in database');
    assert.equal(exc?.category, 'EARTHMOVING');
    assert.equal(exc?.unit, 'jam');
    assert.ok(exc?.rentalPricePerHour && exc.rentalPricePerHour >= 400000);
    assert.ok(exc?.fuelConsumptionLiterPerHour && exc.fuelConsumptionLiterPerHour > 15);
    assert.ok(exc?.operatingCosts, 'Excavator must have operating cost breakdown');
    assert.ok(exc?.productivity, 'Excavator must have productivity profile');

    // Batching plant & cranes
    const batching = equipmentDatabaseService.getEquipmentById('EQP-016');
    assert.ok(batching, 'Batching Plant must exist');
    assert.equal(batching?.category, 'CONCRETE_EQUIPMENT');

    const crane = equipmentDatabaseService.getEquipmentById('EQP-022');
    assert.ok(crane, 'Mobile Crane must exist');
    assert.equal(crane?.category, 'LIFTING');

    const totalStation = equipmentDatabaseService.getEquipmentById('EQP-033');
    assert.ok(totalStation, 'Total Station Robotic must exist');
    assert.equal(totalStation?.category, 'SURVEY_GEODESY');
  });

  await t.test('5. Equipment Regional Multiplier & Operating Costs', () => {
    const dki = equipmentDatabaseService.getAdjustedRate('EQP-001', 'DKI Jakarta');
    const papua = equipmentDatabaseService.getAdjustedRate('EQP-001', 'Papua');
    const ikn = equipmentDatabaseService.getAdjustedRate('EQP-001', 'Nusantara (IKN)');

    assert.equal(dki.factor, 1.0);
    assert.ok(papua.pricePerHour > dki.pricePerHour, 'Papua equipment rate must reflect remote transport factor');
    assert.ok(ikn.pricePerHour >= dki.pricePerHour * 1.25, 'IKN equipment rate must reflect IKN index factor');
  });

  await t.test('6. AI Resource Suggestion Engine (Labor & Equipment)', () => {
    // Test Masonry suggestion
    const masonryLabor = resourceIntelligenceService.suggestLaborForWorkItem('Pasangan dinding bata ringan hebel 10cm');
    assert.ok(masonryLabor.primary.length > 0, 'Should suggest primary labor for masonry');
    assert.ok(masonryLabor.primary.some((l) => l.name.includes('Tukang Batu')));
    assert.ok(masonryLabor.supporting.some((l) => l.name.includes('Pekerja')));
    assert.equal(masonryLabor.requires_review, true, 'AI suggestions must require user review');

    // Test Earthmoving Equipment suggestion
    const earthEquip = resourceIntelligenceService.suggestEquipmentForWorkItem('Galian tanah biasa dan pematangan lahan');
    assert.ok(earthEquip.primary.length > 0, 'Should suggest primary machinery for excavation');
    assert.ok(earthEquip.primary.some((e) => e.name.includes('Excavator')));
    assert.ok(earthEquip.supporting.some((e) => e.name.includes('Dump Truck') || e.name.includes('Water Tanker')));
    assert.equal(earthEquip.requires_review, true, 'AI suggestions must require user review');

    // Test Complete Resource Breakdown Calculation
    const breakdown = resourceIntelligenceService.getCompleteResourceBreakdown({
      workItemName: 'Pekerjaan Pasangan Dinding Bata Ringan Hebel',
      volume: 120,
      unit: 'm²',
      targetDurationDays: 6,
      province: 'DKI Jakarta',
    });

    assert.ok(breakdown.labor.primary.length > 0, 'Breakdown must have primary labor');
    assert.ok(breakdown.totalEstimatedLaborCost > 0, 'Labor cost must be calculated');
    assert.equal(breakdown.requires_review, true, 'User review gate must be preserved');
  });

  await t.test('7. Data Export to JSON and CSV', () => {
    const laborJson = laborDatabaseService.exportData('JSON');
    assert.ok(laborJson.startsWith('['), 'Labor JSON export must be valid array');

    const laborCsv = laborDatabaseService.exportData('CSV');
    assert.ok(laborCsv.includes('Kode,Nama,Kategori'), 'Labor CSV export must contain header');

    const equipJson = equipmentDatabaseService.exportData('JSON');
    assert.ok(equipJson.startsWith('['), 'Equipment JSON export must be valid array');

    const equipCsv = equipmentDatabaseService.exportData('CSV');
    assert.ok(equipCsv.includes('Kode,Nama Peralatan,Kategori'), 'Equipment CSV export must contain header');
  });
});
