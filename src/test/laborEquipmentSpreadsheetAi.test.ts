import test from 'node:test';
import assert from 'node:assert/strict';
import { LaborDatabaseService } from '../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../domain/equipment/equipmentDatabaseService';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { defaultAiProvider } from '../services/aiProviderEngine';

test('Labor & Equipment Database, Spreadsheet Repository, & AI Integration Suite', async (t) => {
  const laborDb = LaborDatabaseService.getInstance();
  const equipDb = EquipmentDatabaseService.getInstance();
  const priceRepo = PriceRepository.getInstance();

  await t.test('1. LaborDatabaseService provides complete official manpower classifications', () => {
    const laborList = laborDb.getAllLabor();
    assert.ok(laborList.length >= 14, `Expected at least 14 manpower categories, got ${laborList.length}`);

    // Verify Tukang Batu, Mandor, Pekerja
    const tukangBatu = laborDb.getLaborById('L.02');
    assert.ok(tukangBatu, 'L.02 Tukang Batu must exist');
    assert.equal(tukangBatu.unit, 'OH');
    assert.equal(tukangBatu.workHoursPerDay, 7);
    assert.ok(tukangBatu.basePriceOH > 100000, 'Tukang Batu OH should be realistic');
    assert.equal(tukangBatu.basePriceOJ, Math.round(tukangBatu.basePriceOH / 7));

    // Verify regional adjustment
    const jabarRate = laborDb.getAdjustedRate('L.02', 'Jawa Barat');
    assert.ok(jabarRate.priceOH > 0);
    assert.equal(jabarRate.province, 'Jawa Barat');
  });

  await t.test('2. EquipmentDatabaseService provides heavy machinery with operational parameters', () => {
    const equipList = equipDb.getAllEquipment();
    assert.ok(equipList.length >= 16, `Expected at least 16 equipment categories, got ${equipList.length}`);

    const excavator = equipDb.getEquipmentById('E.01');
    assert.ok(excavator, 'E.01 Excavator Standar 0.93 m3 must exist');
    assert.equal(excatorUnit(excavator.unit), 'jam');
    assert.ok(excavator.rentalPricePerHour > 200000, 'Excavator rental rate per hour should be realistic');
    assert.ok(excavator.fuelConsumptionLiterPerHour > 0, 'Fuel consumption must be specified');
    assert.equal(excavator.operatorIncluded, true);
  });

  await t.test('3. PriceRepository unifies Material, Labor, and Equipment ingestion', () => {
    const allItems = priceRepo.getAll();
    assert.ok(allItems.length > 0, 'PriceRepository should contain ingested items');

    const laborItems = allItems.filter((i) => i.category === 'LABOR');
    assert.ok(laborItems.length >= 14, `PriceRepository should ingest all labor items, got ${laborItems.length}`);

    const equipItems = allItems.filter((i) => i.category === 'EQUIPMENT');
    assert.ok(equipItems.length >= 16, `PriceRepository should ingest all equipment items, got ${equipItems.length}`);
  });

  await t.test('4. AI Assistant responds accurately to labor and equipment price questions', async () => {
    const mockContext = {
      project: { id: 'p1', name: 'Rumah Tinggal', totalCost: 500000000, itemsCount: 10, totalVolume: 100 },
      rabItems: [],
      projectDocuments: [],
      recentTransactions: [],
      invoices: [],
      availableTemplates: [],
      clientOverview: null,
      currentView: 'database-upah',
      timestamp: new Date().toISOString(),
    };

    // Query Tukang Batu
    const laborResponse = await defaultAiProvider.chat('Berapa upah tukang batu di Jawa Timur?', mockContext as any);
    assert.ok(laborResponse.content.includes('Tukang Batu') || laborResponse.content.includes('Rp'));
    assert.ok((laborResponse as any).proposals && (laborResponse as any).proposals.length > 0, 'Should propose adding to RAB');

    // Query Excavator
    const equipResponse = await defaultAiProvider.chat('Berapa harga sewa excavator per jam?', mockContext as any);
    assert.ok(equipResponse.content.includes('Excavator') || equipResponse.content.includes('Rp') || equipResponse.content.includes('sewa'));
    assert.ok((equipResponse as any).proposals && (equipResponse as any).proposals.length > 0, 'Should propose adding to RAB');
  });
});

function excatorUnit(unit: string) {
  return unit.toLowerCase();
}
