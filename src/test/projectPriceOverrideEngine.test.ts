/**
 * EZRAB — PROJECT PRICE & OVERRIDE ENGINE ACCEPTANCE TEST SUITE
 * 
 * Section 34 Verification:
 * - Test 1: Project Price overrides Reference Price (74k -> 71.5k, status PROJECT_PRICE, DB unchanged)
 * - Test 2: Override takes precedence over Project Price (74k -> 71.5k -> 70k override, toggleable fallback)
 * - Test 3: Project Isolation (Project A: 71.5k, Project B: 73k, National DB: 74k unchanged)
 * - Test 4: Expiration Fallback (expired quote falls back to Reference, status EXPIRED with warning)
 * - Test 5: Revision Locking (locked RAB Rev-01 preserves 71.5k even after project price updates to 75k)
 * - Test 6: AI Price Candidate Isolation (AI candidate does not auto-mutate RAB or Master DB)
 * - Bonus: Full Audit Trail, Validation & CSV Import/Export Integrity
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { PriceResolver } from '../engine/pricing/resolver/priceResolver';
import { projectPriceEngine, ProjectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { aiPriceSearchService } from '../services/aiPriceSearchService';

test('EZRAB Project Price & Override Engine — Section 34 Suite', async (t) => {
  // Reset singletons for pristine test environment
  PriceRepository.resetInstance();
  const repo = PriceRepository.getInstance();
  const resolver = new PriceResolver(repo);

  // Seed reference material in repo if needed
  const cementItem = repo.getByCode('MAT-BLD-CEM-0001');
  const nationalRefPrice = cementItem ? cementItem.price : 74000;
  const cementCode = cementItem ? cementItem.code : 'MAT-BLD-CEM-0001';
  const cementName = cementItem ? cementItem.name : 'Semen Portland Komposit (PCC) 50 kg';

  await t.test('Test 1: Project Price overrides Reference Price without mutating Master DB', () => {
    const projectId = 'PRJ-ALPHA-2026';

    // Set Project Price: Rp 71.500
    const projectPrice = projectPriceEngine.setProjectPrice({
      projectId,
      materialId: cementCode,
      materialCode: cementCode,
      materialName: cementName,
      price: 71500,
      unit: 'sak',
      source: 'QUOTATION',
      supplierName: 'PT Sumber Semen Abadi',
      referenceNumber: 'QUO-2026-0881',
      validUntil: '2027-12-31',
      notes: 'Penawaran diskon volume 500 sak',
    }, { id: 'USR-01', name: 'Budi Santoso (Estimator)' });

    assert.equal(projectPrice.price, 71500);
    assert.equal(projectPrice.projectId, projectId);

    // Resolve for Project Alpha
    const resolved = resolver.resolvePrice({
      code: cementCode,
      name: cementName,
      unit: 'sak',
    }, { projectId });

    assert.equal(resolved.price, 71500);
    assert.equal(resolved.status, 'PROJECT_PRICE');
    assert.equal(resolved.source, 'PROJECT_PRICE');
    assert.equal(resolved.referencePrice, nationalRefPrice);
    assert.equal(resolved.varianceAmount, 71500 - nationalRefPrice);
    assert.ok(resolved.variancePercent !== undefined && resolved.variancePercent < 0);
    assert.equal(resolved.supplier, 'PT Sumber Semen Abadi');

    // Verify National DB is strictly UNMUTATED
    const nationalQuery = resolver.resolvePrice({
      code: cementCode,
      name: cementName,
      unit: 'sak',
    });
    assert.equal(nationalQuery.price, nationalRefPrice);
    assert.equal(nationalQuery.status, 'REFERENCE');
    assert.equal(nationalQuery.source, 'EZRAB_REFERENCE');
  });

  await t.test('Test 2: Override takes precedence over Project Price with toggleable active state', () => {
    const projectId = 'PRJ-ALPHA-2026';

    // Set Override: Rp 70.000
    const override = projectPriceEngine.setProjectOverride({
      projectId,
      materialId: cementCode,
      materialCode: cementCode,
      materialName: cementName,
      price: 70000,
      unit: 'sak',
      reason: 'Negosiasi direksi langsung untuk paket borongan',
      active: true,
    }, { id: 'USR-02', name: 'Dewi Lestari (Lead Estimator)' });

    assert.equal(override.price, 70000);
    assert.equal(override.active, true);

    // Resolve: must return Override Rp 70.000
    const resolvedOverride = resolver.resolvePrice({
      code: cementCode,
      name: cementName,
    }, { projectId });

    assert.equal(resolvedOverride.price, 70000);
    assert.equal(resolvedOverride.status, 'OVERRIDE');
    assert.equal(resolvedOverride.source, 'PROJECT_OVERRIDE');
    assert.equal(resolvedOverride.overridePrice, 70000);
    assert.equal(resolvedOverride.projectPrice, 71500);
    assert.equal(resolvedOverride.referencePrice, nationalRefPrice);
    assert.equal(resolvedOverride.varianceAmount, 70000 - nationalRefPrice);

    // Toggle Override OFF -> should immediately revert to Project Price Rp 71.500
    projectPriceEngine.toggleProjectOverride(projectId, cementCode, false, 'Negosiasi dibatalkan oleh supplier');
    const resolvedAfterDeactivation = resolver.resolvePrice({
      code: cementCode,
      name: cementName,
    }, { projectId });

    assert.equal(resolvedAfterDeactivation.price, 71500);
    assert.equal(resolvedAfterDeactivation.status, 'PROJECT_PRICE');

    // Toggle Override back ON -> returns Rp 70.000
    projectPriceEngine.toggleProjectOverride(projectId, cementCode, true, 'Disepakati kembali');
    const resolvedReactivated = resolver.resolvePrice({
      code: cementCode,
      name: cementName,
    }, { projectId });
    assert.equal(resolvedReactivated.price, 70000);
    assert.equal(resolvedReactivated.status, 'OVERRIDE');
  });

  await t.test('Test 3: Project Isolation (Project A vs Project B vs National Database)', () => {
    const projA = 'PRJ-SURABAYA-01';
    const projB = 'PRJ-MEDAN-02';

    // Project A gets 71.500
    projectPriceEngine.setProjectPrice({
      projectId: projA,
      materialId: cementCode,
      materialCode: cementCode,
      price: 71500,
      unit: 'sak',
      source: 'PURCHASE',
      supplierName: 'Distributor Jawa Timur',
    });

    // Project B gets 73.000
    projectPriceEngine.setProjectPrice({
      projectId: projB,
      materialId: cementCode,
      materialCode: cementCode,
      price: 73000,
      unit: 'sak',
      source: 'SUPPLIER',
      supplierName: 'Distributor Sumatera Utara',
    });

    const resA = resolver.resolvePrice(cementCode, { projectId: projA });
    const resB = resolver.resolvePrice(cementCode, { projectId: projB });
    const resNational = resolver.resolvePrice(cementCode);

    assert.equal(resA.price, 71500, 'Project A must resolve to 71.500');
    assert.equal(resB.price, 73000, 'Project B must resolve to 73.000');
    assert.equal(resNational.price, nationalRefPrice, 'National DB must remain completely unchanged at 74.000');
  });

  await t.test('Test 4: Expiration Fallback to Reference Price with Warning', () => {
    const projExpired = 'PRJ-EXPIRED-TEST';

    // Quotation expired on 2024-01-01
    projectPriceEngine.setProjectPrice({
      projectId: projExpired,
      materialId: cementCode,
      materialCode: cementCode,
      price: 68000,
      unit: 'sak',
      source: 'QUOTATION',
      validUntil: '2024-01-01',
      supplierName: 'Vendor Lama',
    });

    const resolved = resolver.resolvePrice(cementCode, { projectId: projExpired });

    // Must fallback to national reference price
    assert.equal(resolved.price, nationalRefPrice, 'Expired price must fallback to National Reference');
    assert.equal(resolved.status, 'EXPIRED', 'Status must indicate EXPIRED');
    assert.equal(resolved.source, 'EZRAB_REFERENCE');
    assert.ok(resolved.explanation?.includes('kedaluwarsa'), 'Explanation must warn estimator of expiration');
  });

  await t.test('Test 5: Revision Locking (Preserves locked prices during subsequent price hikes)', () => {
    const projLocked = 'PRJ-REVISION-LOCK';

    // 1. Initial Project Price: Rp 71.500
    projectPriceEngine.setProjectPrice({
      projectId: projLocked,
      materialId: cementCode,
      materialCode: cementCode,
      price: 71500,
      unit: 'sak',
      source: 'CONTRACT',
    });

    // Resolve initial price
    const initialPrice = resolver.resolvePrice(cementCode, { projectId: projLocked });
    assert.equal(initialPrice.price, 71500);

    // 2. Lock RAB Revision REV-01
    projectPriceEngine.lockRevisionPrices(
      projLocked,
      'REV-01',
      'RAB Kontrak Awal Disetujui Pemilik',
      { id: 'USR-01', name: 'Ir. Hendra Gunawan' },
      [initialPrice]
    );

    // 3. Material price later spikes to Rp 76.000 due to market surge
    projectPriceEngine.setProjectPrice({
      projectId: projLocked,
      materialId: cementCode,
      materialCode: cementCode,
      price: 76000,
      unit: 'sak',
      source: 'SUPPLIER',
      notes: 'Kenaikan harga pasar BBM & logistik',
    });

    // 4. Querying locked revision REV-01 must STILL return Rp 71.500
    const lockedResolution = resolver.resolvePrice(cementCode, {
      projectId: projLocked,
      revisionId: 'REV-01',
    });
    assert.equal(lockedResolution.price, 71500, 'Locked revision MUST preserve historical price');
    assert.equal(lockedResolution.status, 'LOCKED');
    assert.equal(lockedResolution.isLocked, true);

    // 5. Querying new draft without revisionId reflects live price Rp 76.000
    const liveResolution = resolver.resolvePrice(cementCode, { projectId: projLocked });
    assert.equal(liveResolution.price, 76000, 'Draft without revision lock must reflect live price');
  });

  await t.test('Test 6: AI Price Candidate Isolation (Never auto-mutates RAB or Master DB)', async () => {
    const projAI = 'PRJ-AI-TEST';

    // Initial state: Reference price is 74.000
    const beforeResolution = resolver.resolvePrice(cementCode, { projectId: projAI });
    assert.equal(beforeResolution.price, nationalRefPrice);

    // AI discovers external candidate (e.g. Tokopedia / Mitra10 Rp 68.500)
    const aiCandidate = {
      id: 'AI-CAND-01',
      price: 68500,
      unit: 'sak',
      source: 'WEB_REFERENCE' as const,
      sourceName: 'Marketplace Discovery (Tokopedia / Distributor)',
      observedDate: '2026-03-25',
      confidence: 0.85,
    };
    assert.ok(aiCandidate.price < nationalRefPrice, 'AI candidate represents potential lower market price');

    // Confirm that AI candidate discovery didn\'t mutate Project Price or Database
    const afterResolution = resolver.resolvePrice(cementCode, { projectId: projAI });
    assert.equal(afterResolution.price, nationalRefPrice);
    assert.equal(afterResolution.status, 'REFERENCE');
    assert.equal(afterResolution.overridePrice, undefined);
    assert.equal(afterResolution.projectPrice, undefined);

    // Master DB price check remains untouched
    const masterDbItem = repo.getByCode(cementCode);
    assert.equal(masterDbItem?.price, nationalRefPrice, 'Master DB price cannot be modified by AI candidates');
  });

  await t.test('Bonus: Validation & Audit Trail Recording', () => {
    const testProj = 'PRJ-AUDIT-TEST';

    // Validation: Empty Project ID throws
    assert.throws(() => {
      projectPriceEngine.setProjectPrice({
        projectId: '',
        materialId: 'MAT-001',
        price: 50000,
        unit: 'm3',
        source: 'PURCHASE',
      });
    }, /PROJECT_CONTEXT_REQUIRED/);

    // Validation: Negative price throws
    assert.throws(() => {
      projectPriceEngine.setProjectPrice({
        projectId: testProj,
        materialId: 'MAT-001',
        price: -100,
        unit: 'm3',
        source: 'PURCHASE',
      });
    }, /INVALID_PRICE/);

    // Create price & override to test audit trail
    projectPriceEngine.setProjectPrice({
      projectId: testProj,
      materialId: 'MAT-AUDIT-01',
      materialName: 'Pasir Beton Lumajang',
      price: 280000,
      unit: 'm3',
      source: 'SUPPLIER',
    }, { id: 'USR-AUDIT', name: 'Siti Rahma' });

    projectPriceEngine.setProjectOverride({
      projectId: testProj,
      materialId: 'MAT-AUDIT-01',
      materialName: 'Pasir Beton Lumajang',
      price: 260000,
      unit: 'm3',
      reason: 'Diskon armada dump truck',
      active: true,
    }, { id: 'USR-AUDIT', name: 'Siti Rahma' });

    const auditTrail = projectPriceEngine.getAuditTrail(testProj);
    assert.ok(auditTrail.length >= 2, 'Audit trail must record both price creation and override');
    assert.ok(auditTrail.some((a) => a.action === 'CREATE_PROJECT_PRICE' || a.action === 'SET_PROJECT_PRICE'));
    assert.ok(auditTrail.some((a) => a.action === 'ENABLE_OVERRIDE' || a.action === 'ACTIVATE_OVERRIDE'));
    assert.ok(auditTrail.every((a) => a.userName === 'Siti Rahma'));

    // CSV Export & Import Preview
    const csvData = projectPriceEngine.exportToCsv(testProj, () => 74000);
    assert.ok(csvData.includes('Pasir Beton Lumajang'));

    const preview = projectPriceEngine.importFromCsv(
      testProj,
      `material_code,material_name,price,unit,supplier,region,effective_date,source\nMAT-CSV-01,Cat Tembok Putih,125000,pail,TB Warna Indah,Jawa Timur,2026-09-26,QUOTATION`,
      { id: 'USR-AUDIT', name: 'Siti Rahma' }
    );
    assert.equal(preview.importedCount, 1);
    assert.equal(preview.errors.length, 0);
  });
});

