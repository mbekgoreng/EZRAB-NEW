import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPriceEngine, ProjectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { MaterialDatabaseService } from '../domain/material/materialDatabaseService';

test('EZRAB Project Price & Override Engine 2026 — Master Acceptance Suite', async (t) => {
  const matDb = MaterialDatabaseService.getInstance();

  await t.test('Acceptance Test 1: National Reference vs Project Price', () => {
    const matCode = 'MAT-BLD-CEM-0001';
    const projId = 'PROJ-TEST-01';

    // Verify National Database reference price
    const referenceMat = matDb.getMaterialByCode(matCode);
    assert.ok(referenceMat, 'Material Semen PCC 50kg must exist in national database');
    const nationalPrices = matDb.getPricesByMaterialId(referenceMat!.id);
    const nationalBasePrice = nationalPrices[0]?.price || 74000;
    assert.equal(nationalBasePrice, 74000, 'National reference price must be Rp 74.000');

    // Set Project Price
    projectPriceEngine.setProjectPrice({
      projectId: projId,
      materialId: referenceMat!.id,
      materialCode: matCode,
      price: 71500,
      unit: 'sak',
      supplierName: 'PT Semen Indonesia Distributor',
      source: 'QUOTATION',
      referenceNumber: 'Q-2026-0912',
      status: 'ACTIVE',
      createdBy: 'Ahmad Yusuf',
    });

    // Resolve Final Price for Project 1
    const resolved = projectPriceEngine.resolveFinalPrice({
      materialIdOrCode: matCode,
      projectId: projId,
    });

    assert.equal(resolved.price, 71500, 'Resolved final price must be Project Price (Rp 71.500)');
    assert.equal(resolved.source, 'PROJECT_PRICE');
    assert.equal(resolved.referencePrice, 74000);
    assert.equal(resolved.varianceAmount, -2500, 'Variance must be -Rp 2.500');
    assert.equal(resolved.variancePercent, -3.38, 'Variance percent must be -3.38%');
    assert.equal(resolved.status, 'PROJECT_PRICE');
  });

  await t.test('Acceptance Test 2: Project Price with Explicit User Override', () => {
    const matCode = 'MAT-BLD-CEM-0001';
    const projId = 'PROJ-TEST-01';

    // Set explicit override
    projectPriceEngine.setProjectOverride({
      projectId: projId,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 70000,
      unit: 'sak',
      reason: 'Diskon negosiasi supplier khusus volume besar',
      createdBy: 'Estimator Proyek',
      active: true,
    });

    const resolved = projectPriceEngine.resolveFinalPrice({
      materialIdOrCode: matCode,
      projectId: projId,
    });

    assert.equal(resolved.price, 70000, 'Resolved final price with active override must be Rp 70.000');
    assert.equal(resolved.source, 'PROJECT_OVERRIDE');
    assert.equal(resolved.status, 'OVERRIDE');
    assert.equal(resolved.varianceAmount, -4000, 'Variance vs national reference must be -Rp 4.000');
  });

  await t.test('Acceptance Test 3: Strict Project Isolation (Project A vs Project B vs National Database)', () => {
    const matCode = 'MAT-BLD-CEM-0001';
    const projA = 'PROJ-ISOLATION-A';
    const projB = 'PROJ-ISOLATION-B';

    // Project A sets Rp 71.500
    projectPriceEngine.setProjectPrice({
      projectId: projA,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 71500,
      unit: 'sak',
      supplierName: 'PT Supplier A',
      source: 'QUOTATION',
      status: 'ACTIVE',
      createdBy: 'User A',
    });

    // Project B sets Rp 73.000
    projectPriceEngine.setProjectPrice({
      projectId: projB,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 73000,
      unit: 'sak',
      supplierName: 'PT Supplier B',
      source: 'CONTRACT',
      status: 'ACTIVE',
      createdBy: 'User B',
    });

    const resolvedA = projectPriceEngine.resolveFinalPrice({ materialIdOrCode: matCode, projectId: projA });
    const resolvedB = projectPriceEngine.resolveFinalPrice({ materialIdOrCode: matCode, projectId: projB });
    const resolvedGlobal = projectPriceEngine.resolveFinalPrice({ materialIdOrCode: matCode });

    assert.equal(resolvedA.price, 71500, 'Project A must resolve to Rp 71.500');
    assert.equal(resolvedB.price, 73000, 'Project B must resolve to Rp 73.000');
    assert.equal(resolvedGlobal.price, 74000, 'Global query without project must resolve to National Reference (Rp 74.000)');

    // Verify national database remains completely uncontaminated
    const nationalPrices = matDb.getPricesByMaterialId('MAT-BLD-CEM-0001');
    assert.equal(nationalPrices[0].price, 74000, 'National database price must remain unchanged at Rp 74.000');
  });

  await t.test('Acceptance Test 4: Expired Project Price Resolution Fallback', () => {
    const matCode = 'MAT-BLD-CEM-0001';
    const projExpired = 'PROJ-EXPIRED-TEST';

    // Set expired project price (valid until 2025-01-01)
    projectPriceEngine.setProjectPrice({
      projectId: projExpired,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 68000,
      unit: 'sak',
      supplierName: 'Old Supplier',
      effectiveDate: '2024-01-01',
      validUntil: '2025-01-01', // Expired
      source: 'QUOTATION',
      status: 'ACTIVE',
      createdBy: 'Old Estimator',
    });

    // Resolver should detect expiration and fall back to active national reference
    const resolved = projectPriceEngine.resolveFinalPrice({
      materialIdOrCode: matCode,
      projectId: projExpired,
      asOfDate: '2026-09-26',
    });

    assert.equal(resolved.price, 74000, 'Expired project price must fallback to active national reference (Rp 74.000)');
    assert.equal(resolved.source, 'EZRAB_REFERENCE');
  });

  await t.test('Acceptance Test 5: Price Locking to RAB Revision', () => {
    const projId = 'PROJ-LOCK-TEST';
    const revisionId = 'RAB-REV-04';
    const matCode = 'MAT-BLD-CEM-0001';

    // Set Project Price
    projectPriceEngine.setProjectPrice({
      projectId: projId,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 71500,
      unit: 'sak',
      source: 'QUOTATION',
      status: 'ACTIVE',
      createdBy: 'Estimator',
    });

    // Lock price to RAB Rev. 04
    const locked = projectPriceEngine.lockProjectPrices(projId, revisionId, [matCode]);
    assert.equal(locked, true);

    const lockedPrices = projectPriceEngine.getLockedRevisionPrices(projId, revisionId);
    assert.equal(lockedPrices.length, 1);
    assert.equal(lockedPrices[0].price, 71500);
    assert.equal(lockedPrices[0].isLocked, true);
    assert.equal(lockedPrices[0].lockedRevisionId, 'RAB-REV-04');

    // Mutate live project price for future work
    projectPriceEngine.setProjectPrice({
      projectId: projId,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 75000,
      unit: 'sak',
      source: 'PURCHASE',
      status: 'ACTIVE',
      createdBy: 'Estimator',
    });

    // Verify locked revision 04 snapshot remains untouched at Rp 71.500
    const snapshotAfterUpdate = projectPriceEngine.getLockedRevisionPrices(projId, revisionId);
    assert.equal(snapshotAfterUpdate[0].price, 71500, 'Locked revision price must remain frozen at Rp 71.500');

    // But live resolution reflects the new price
    const liveResolved = projectPriceEngine.resolveFinalPrice({ materialIdOrCode: matCode, projectId: projId });
    assert.equal(liveResolved.price, 75000, 'Live resolution must reflect new price Rp 75.000');
  });

  await t.test('Acceptance Test 6: Audit Trail & Provenance Verification', () => {
    const projId = 'PROJ-AUDIT-TEST';
    const matCode = 'MAT-BLD-CEM-0001';

    projectPriceEngine.setProjectPrice({
      projectId: projId,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 72000,
      unit: 'sak',
      source: 'QUOTATION',
      status: 'ACTIVE',
      createdBy: 'Ahmad Yusuf',
    });

    projectPriceEngine.setProjectOverride({
      projectId: projId,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: matCode,
      price: 70000,
      unit: 'sak',
      reason: 'Hasil negosiasi final',
      createdBy: 'Ahmad Yusuf',
      active: true,
    });

    const logs = projectPriceEngine.getAuditLogs(projId, matCode);
    assert.ok(logs.length >= 2, 'Audit logs must record price setting and override activation');
    assert.equal(logs[0].action, 'ACTIVATE_OVERRIDE');
    assert.equal(logs[0].newPrice, 70000);
    assert.equal(logs[1].action, 'SET_PROJECT_PRICE');
    assert.equal(logs[1].newPrice, 72000);
  });

  await t.test('Acceptance Test 7: CSV & JSON Import / Export', () => {
    const projId = 'PROJ-EXPORT-TEST';

    projectPriceEngine.setProjectPrice({
      projectId: projId,
      materialId: 'MAT-BLD-CEM-0001',
      materialCode: 'MAT-BLD-CEM-0001',
      materialName: 'Semen PCC 50kg',
      price: 71500,
      unit: 'sak',
      supplierName: 'PT XYZ',
      region: 'Tangerang Selatan',
      effectiveDate: '2026-09-25',
      source: 'QUOTATION',
      referenceNumber: 'Q-2026-0912',
      status: 'ACTIVE',
      createdBy: 'QS Test',
    });

    // Export CSV
    const csv = projectPriceEngine.exportProjectPrices(projId, 'CSV');
    assert.ok(csv.includes('material_code,material_name,price'), 'CSV header must be present');
    assert.ok(csv.includes('MAT-BLD-CEM-0001') && csv.includes('71500'), 'CSV row must contain data');

    // Import into new project
    const targetProj = 'PROJ-IMPORT-DEST';
    const importRes = projectPriceEngine.importProjectPrices(targetProj, [
      {
        material_code: 'MAT-BLD-STN-0001',
        price: 230000,
        unit: 'm3',
        supplier: 'Quarry Merapi',
        region: 'Jawa Barat',
        source: 'QUOTATION',
        notes: 'Bulk import test',
      },
    ]);

    assert.equal(importRes.successCount, 1, 'Import should succeed for 1 item');
    const importedPrice = projectPriceEngine.getProjectPrice(targetProj, 'MAT-BLD-STN-0001');
    assert.equal(importedPrice?.price, 230000);
  });
});
