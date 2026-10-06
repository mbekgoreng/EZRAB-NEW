import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { PriceResolver } from '../engine/pricing/resolver/priceResolver';
import { projectPriceEngine, ProjectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { MaterialDatabaseService } from '../domain/material/materialDatabaseService';
import { LaborDatabaseService } from '../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../domain/equipment/equipmentDatabaseService';

test('EZRAB — Project Price Override Full Cycle & Architectural Invariants Suite', async (t) => {
  // Fresh singleton state
  ProjectPriceEngine.resetInstance();
  PriceRepository.resetInstance();

  const repo = PriceRepository.getInstance();
  const resolver = new PriceResolver(repo);
  const matDb = MaterialDatabaseService.getInstance();
  const laborDb = LaborDatabaseService.getInstance();
  const equipDb = EquipmentDatabaseService.getInstance();

  const projA = 'PRJ-REWORK-ALPHA';
  const projB = 'PRJ-REWORK-BETA';

  await t.test('1. Universal Resource Support: Material, Labor, and Equipment Overrides', () => {
    // 1A. Override Material
    const matCode = 'MAT-CEM-PCC-01';
    const matMasterPrice = 74000;
    const matOverride = projectPriceEngine.setProjectOverride({
      projectId: projA,
      materialId: matCode,
      materialCode: matCode,
      materialName: 'Semen PCC 50kg Khusus Proyek',
      category: 'MATERIAL',
      price: 71000,
      unit: 'sak',
      reason: 'Diskon borongan supplier semen',
      masterPrice: matMasterPrice,
      active: true,
    });
    assert.equal(matOverride.price, 71000);
    assert.equal(matOverride.category, 'MATERIAL');

    // 1B. Override Labor
    const laborCode = 'L.01';
    const laborMasterPrice = 120000;
    const laborOverride = projectPriceEngine.setProjectOverride({
      projectId: projA,
      materialId: laborCode,
      materialCode: laborCode,
      materialName: 'Pekerja Standar Lapangan',
      category: 'LABOR',
      price: 135000,
      unit: 'OH',
      reason: 'Penyesuaian upah lembur lapangan',
      masterPrice: laborMasterPrice,
      active: true,
    });
    assert.equal(laborOverride.price, 135000);
    assert.equal(laborOverride.category, 'LABOR');

    // 1C. Override Equipment
    const equipCode = 'EQ-EXC-01';
    const equipMasterPrice = 450000;
    const equipOverride = projectPriceEngine.setProjectOverride({
      projectId: projA,
      materialId: equipCode,
      materialCode: equipCode,
      materialName: 'Excavator PC200 Sewa',
      category: 'EQUIPMENT',
      price: 420000,
      unit: 'jam',
      reason: 'Kontrak sewa bulanan langsung pemilik alat',
      masterPrice: equipMasterPrice,
      active: true,
    });
    assert.equal(equipOverride.price, 420000);
    assert.equal(equipOverride.category, 'EQUIPMENT');

    // Verify all 3 overrides are stored for Project A
    const allOverrides = projectPriceEngine.getProjectOverrides(projA);
    assert.equal(allOverrides.length, 3);
  });

  await t.test('2. Difference & Percentage Formulas (Deterministic Math)', () => {
    // Check Material: 71.000 vs 74.000 -> Diff = -3.000, -4.05%
    const effMat = projectPriceEngine.getEffectiveProjectPrice(projA, 'MAT-CEM-PCC-01', 74000);
    assert.equal(effMat.price, 71000);
    assert.equal(effMat.isOverride, true);
    assert.equal(effMat.varianceAmount, -3000);
    assert.ok(Math.abs(effMat.variancePercent - (-4.054)) < 0.01);

    // Check Labor: 135.000 vs 120.000 -> Diff = +15.000, +12.5%
    const effLab = projectPriceEngine.getEffectiveProjectPrice(projA, 'L.01', 120000);
    assert.equal(effLab.price, 135000);
    assert.equal(effLab.isOverride, true);
    assert.equal(effLab.varianceAmount, 15000);
    assert.equal(effLab.variancePercent, 12.5);

    // Check Equipment: 420.000 vs 450.000 -> Diff = -30.000, -6.67%
    const effEq = projectPriceEngine.getEffectiveProjectPrice(projA, 'EQ-EXC-01', 450000);
    assert.equal(effEq.price, 420000);
    assert.equal(effEq.isOverride, true);
    assert.equal(effEq.varianceAmount, -30000);
    assert.ok(Math.abs(effEq.variancePercent - (-6.666)) < 0.01);
  });

  await t.test('3. Master Price Immutability Guarantee', () => {
    // Ensure that setting overrides above NEVER altered standard national/regional databases
    const defMat = repo.getByCode('MAT-BLD-CEM-0001');
    if (defMat) {
      assert.ok(defMat.price > 0);
      assert.notEqual(defMat.price, 71000, 'Master price in repository was not overwritten');
    }

    // Checking Labor Master Data
    const laborList = laborDb.getAllLabor();
    assert.ok(laborList.length > 0);
    const worker = laborList.find((l) => l.code === 'L.01' || l.name.toLowerCase().includes('pekerja'));
    if (worker) {
      assert.notEqual(worker.basePriceOH, 135000, 'Master labor rate was not altered');
    }
  });

  await t.test('4. Strict Project Isolation (Project A vs Project B)', () => {
    // Project A has override: 71.000
    const resA = projectPriceEngine.getEffectiveProjectPrice(projA, 'MAT-CEM-PCC-01', 74000);
    assert.equal(resA.price, 71000);
    assert.equal(resA.isOverride, true);

    // Project B has NO override: must return fallback master 74.000
    const resB = projectPriceEngine.getEffectiveProjectPrice(projB, 'MAT-CEM-PCC-01', 74000);
    assert.equal(resB.price, 74000);
    assert.equal(resB.isOverride, false);
    assert.equal(resB.status, 'REFERENCE');
  });

  await t.test('5. Reset Override Reversion to Master Price', () => {
    // Reset Labor override for Project A
    const removed = projectPriceEngine.removeProjectOverride(projA, 'L.01');
    assert.equal(removed, true);

    // Now resolving Labor for Project A should fall back to reference rate 120.000
    const reverted = projectPriceEngine.getEffectiveProjectPrice(projA, 'L.01', 120000);
    assert.equal(reverted.price, 120000);
    assert.equal(reverted.isOverride, false);
    assert.equal(reverted.status, 'REFERENCE');

    // Remaining overrides in Project A should now be 2
    const remaining = projectPriceEngine.getProjectOverrides(projA);
    assert.equal(remaining.length, 2);
  });

  await t.test('6. PriceRepository Integration & Unified getProjectPrices', () => {
    // PriceRepository.getProjectPrices(projA) must return active overrides
    const repoPrices = repo.getProjectPrices(projA);
    assert.ok(repoPrices.length >= 2, 'Repository includes project overrides');

    const cementInRepo = repoPrices.find((p) => p.codeNormalized.includes('CEM'));
    assert.ok(cementInRepo !== undefined, 'Cement override is discoverable in repo prices');
    assert.equal(cementInRepo?.price, 71000);
    assert.equal(cementInRepo?.priceSource, 'PROJECT_OVERRIDE');
  });
});
