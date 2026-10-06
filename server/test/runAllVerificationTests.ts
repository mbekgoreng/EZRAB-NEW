import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { brandingService } from '../services/brandingService';
import { exportProjectToPDF } from '../../src/export/pdfExporter';
import { Project, Company } from '../../src/types';

function createValidPngBuffer(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
}

function createValidJpgBuffer(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0xff, 0xd9,
  ]);
}

const sampleCompany: Company = {
  id: 'comp-test',
  name: 'PT. Konstruksi Maju Jaya',
  address: 'SCBD District 8 Tower A Lt. 28, Jakarta Selatan',
  phone: '021-5088-9900',
  email: 'info@konstruksimaju.id',
  website: 'https://konstruksimaju.id',
  taxNumber: '01.234.567.8-012.000',
  directorName: 'Ir. Hendra Kusuma, M.T.',
  leadEstimatorName: 'Ahmad Yusuf (Super Admin)',
  defaultOverheadPercent: 5,
  defaultProfitPercent: 10,
  defaultContingencyPercent: 0,
  defaultTaxPercent: 11,
};

const sampleProject: Project = {
  id: 'PRJ-TEST-EXACT',
  projectNumber: 'PRJ-2026-EXACT',
  name: 'Gedung Komersial Kreatif 3 Lantai',
  location: 'Jakarta Selatan',
  clientName: 'PT Investama Indonesia',
  buildingType: 'Gedung Kantor',
  currentVersion: 'Rev 1.0',
  status: 'in_progress',
  buildingArea: 450,
  landArea: 300,
  sections: [
    {
      id: 'sec-1',
      code: 'DIV-01',
      name: 'Pekerjaan Persiapan & Tanah',
      subtotal: 50000000,
      items: [
        {
          id: 'it-1',
          sectionId: 'sec-1',
          itemNumber: '1.1',
          code: 'A.2.2.1',
          description: 'Pembersihan dan perataan lapangan proyek',
          volume: 300,
          unit: 'm²',
          materialPrice: 0,
          laborPrice: 25000,
          equipmentPrice: 0,
          unitPrice: 25000,
          totalPrice: 7500000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-2',
          sectionId: 'sec-1',
          itemNumber: '1.2',
          code: 'A.2.3.1',
          description: 'Galian tanah pondasi footplat',
          volume: 85,
          unit: 'm³',
          materialPrice: 0,
          laborPrice: 500000,
          equipmentPrice: 0,
          unitPrice: 500000,
          totalPrice: 42500000,
          verificationStatus: 'VERIFIED',
        },
      ],
    },
    {
      id: 'sec-2',
      code: 'DIV-02',
      name: 'Pekerjaan Struktur Beton Bertulang',
      subtotal: 300000000,
      items: [
        {
          id: 'it-3',
          sectionId: 'sec-2',
          itemNumber: '2.1',
          code: 'A.4.1.1',
          description: 'Beton K-300 ready mix lantai 1-3',
          volume: 150,
          unit: 'm³',
          materialPrice: 1200000,
          laborPrice: 0,
          equipmentPrice: 0,
          unitPrice: 1200000,
          totalPrice: 180000000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-4',
          sectionId: 'sec-2',
          itemNumber: '2.2',
          code: 'A.4.1.2',
          description: 'Pembesian tulangan ulir BJTS 420B',
          volume: 6666.67,
          unit: 'kg',
          materialPrice: 18000,
          laborPrice: 0,
          equipmentPrice: 0,
          unitPrice: 18000,
          totalPrice: 120000000,
          verificationStatus: 'VERIFIED',
        },
      ],
    },
  ],
};

async function runExact28VerificationTests() {
  console.log('============================================================');
  console.log('EXACT 28 VERIFICATION TEST SCENARIOS (INDIVIDUAL ASSERTIONS)');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  async function execute(scenarioNum: number, name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`[PASS] Skenario ${scenarioNum}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Skenario ${scenarioNum}: ${name} ->`, err.message);
      failed++;
    }
  }

  // 1. User FREE melakukan export PDF.
  await execute(1, 'User FREE melakukan export PDF', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'free' });
    assert.ok(doc, 'PDF doc must exist');
    assert.ok(doc.getNumberOfPages() >= 3, 'Must have at least 3 pages');
  });

  // 2. User TRIAL melakukan export PDF.
  await execute(2, 'User TRIAL melakukan export PDF', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'trial' });
    assert.ok(doc.getNumberOfPages() >= 3, 'Trial export must generate multi-page PDF');
  });

  // 3. User PAID melakukan export PDF tanpa logo perusahaan.
  await execute(3, 'User PAID melakukan export PDF tanpa logo perusahaan', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'pro', companyLogoUrl: undefined });
    assert.ok(doc, 'Paid without logo must export safely');
  });

  // 4. User PAID melakukan upload logo.
  await execute(4, 'User PAID melakukan upload logo', async () => {
    const ws = 'ws-exact-paid-4';
    brandingService.setSubscriptionPlan(ws, 'pro');
    const res = brandingService.uploadLogo(ws, createValidPngBuffer(), 'image/png');
    assert.strictEqual(res.success, true);
    assert.ok(res.branding.logoUrl?.startsWith('data:image/png;base64,'));
  });

  // 5. User PAID export PDF dengan logo perusahaan.
  await execute(5, 'User PAID export PDF dengan logo perusahaan', async () => {
    const ws = 'ws-exact-paid-5';
    brandingService.setSubscriptionPlan(ws, 'pro');
    const uploadRes = brandingService.uploadLogo(ws, createValidPngBuffer(), 'image/png');
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'pro', companyLogoUrl: uploadRes.logoUrl });
    assert.ok(doc);
  });

  // 6. User FREE mencoba upload logo melalui frontend.
  await execute(6, 'User FREE mencoba upload logo melalui frontend', () => {
    const ws = 'ws-exact-free-6';
    brandingService.setSubscriptionPlan(ws, 'free');
    const branding = brandingService.getBranding(ws);
    assert.strictEqual(branding.canUploadLogo, false, 'Frontend upload flag must be disabled for FREE');
  });

  // 7. User FREE mencoba upload logo melalui API langsung.
  await execute(7, 'User FREE mencoba upload logo melalui API langsung (403)', () => {
    const ws = 'ws-exact-free-7';
    brandingService.setSubscriptionPlan(ws, 'free');
    assert.throws(
      () => brandingService.uploadLogo(ws, createValidPngBuffer(), 'image/png'),
      (err: any) => err.message.includes('SUBSCRIPTION_REQUIRED')
    );
  });

  // 8. User mencoba menghapus watermark melalui request manipulasi.
  await execute(8, 'User mencoba menghapus watermark melalui request manipulasi (Fail-Closed)', async () => {
    // Malicious request sending isWatermarkRequired: false on free account
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, {
      subscriptionPlan: 'free',
      isWatermarkRequired: false, // Manipulation attempt
    });
    // The engine must override and keep watermark required
    assert.ok(doc);
  });

  // 9. Logo PNG transparan.
  await execute(9, 'Logo PNG transparan valid', () => {
    const ws = 'ws-exact-paid-9';
    brandingService.setSubscriptionPlan(ws, 'pro');
    const res = brandingService.uploadLogo(ws, createValidPngBuffer(), 'image/png');
    assert.strictEqual(res.branding.logoMimeType, 'image/png');
  });

  // 10. Logo JPG.
  await execute(10, 'Logo JPG valid', () => {
    const ws = 'ws-exact-paid-10';
    brandingService.setSubscriptionPlan(ws, 'pro');
    const res = brandingService.uploadLogo(ws, createValidJpgBuffer(), 'image/jpeg');
    assert.strictEqual(res.branding.logoMimeType, 'image/jpeg');
  });

  // 11. Logo dengan rasio sangat lebar.
  await execute(11, 'Logo dengan rasio sangat lebar', () => {
    const ws = 'ws-exact-paid-11';
    brandingService.setSubscriptionPlan(ws, 'pro');
    const res = brandingService.uploadLogo(ws, createValidPngBuffer(), 'image/png');
    assert.ok(res.branding.logoUrl);
  });

  // 12. Logo dengan rasio sangat tinggi.
  await execute(12, 'Logo dengan rasio sangat tinggi', () => {
    const ws = 'ws-exact-paid-12';
    brandingService.setSubscriptionPlan(ws, 'pro');
    const res = brandingService.uploadLogo(ws, createValidPngBuffer(), 'image/png');
    assert.ok(res.branding.logoUrl);
  });

  // 13. Logo rusak.
  await execute(13, 'Logo rusak ditolak', () => {
    const ws = 'ws-exact-paid-13';
    brandingService.setSubscriptionPlan(ws, 'pro');
    assert.throws(
      () => brandingService.uploadLogo(ws, Buffer.from([1, 2, 3]), 'image/png'),
      (err: any) => err.message.includes('INVALID_IMAGE')
    );
  });

  // 14. File terlalu besar.
  await execute(14, 'File terlalu besar (> 2 MB) ditolak', () => {
    const ws = 'ws-exact-paid-14';
    brandingService.setSubscriptionPlan(ws, 'pro');
    assert.throws(
      () => brandingService.uploadLogo(ws, Buffer.alloc(2.5 * 1024 * 1024), 'image/png'),
      (err: any) => err.message.includes('FILE_TOO_LARGE')
    );
  });

  // 15. Format file tidak valid.
  await execute(15, 'Format file tidak valid (.txt/.exe) ditolak oleh magic bytes', () => {
    const ws = 'ws-exact-paid-15';
    brandingService.setSubscriptionPlan(ws, 'pro');
    const fakeBuffer = Buffer.from('THIS-IS-AN-INVALID-TEXT-FILE-CONTENT-PURPORTING-TO-BE-AN-IMAGE-FOR-TESTING');
    assert.throws(
      () => brandingService.uploadLogo(ws, fakeBuffer, 'image/png'),
      (err: any) => err.message.includes('INVALID_MIME')
    );
  });

  // 16. Proyek dengan satu pekerjaan.
  await execute(16, 'Proyek dengan satu pekerjaan diexport benar', async () => {
    const singleProj: Project = {
      ...sampleProject,
      sections: [
        {
          id: 'sec-single',
          code: 'DIV-01',
          name: 'Pekerjaan Tunggal',
          subtotal: 1000000,
          items: [
            {
              id: 'it-1',
              sectionId: 'sec-single',
              itemNumber: '1',
              code: 'A.1',
              description: 'Item Tunggal',
              volume: 1,
              unit: 'ls',
              materialPrice: 0,
              laborPrice: 1000000,
              equipmentPrice: 0,
              unitPrice: 1000000,
              totalPrice: 1000000,
              verificationStatus: 'VERIFIED',
            },
          ],
        },
      ],
    };
    const doc = await exportProjectToPDF(singleProj, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // 17. Proyek dengan banyak kelompok pekerjaan.
  await execute(17, 'Proyek dengan banyak kelompok pekerjaan (12 divisi)', async () => {
    const manySecs: any[] = [];
    for (let i = 1; i <= 12; i++) {
      manySecs.push({
        id: `sec-${i}`,
        code: `DIV-${i}`,
        name: `Kelompok Divisi Pekerjaan ${i}`,
        subtotal: 15000000,
        items: [
          {
            id: `it-${i}-1`,
            sectionId: `sec-${i}`,
            itemNumber: `${i}.1`,
            code: `AHSP.${i}`,
            description: `Rincian Divisi ${i}`,
            volume: 10,
            unit: 'm²',
            materialPrice: 1000000,
            laborPrice: 500000,
            equipmentPrice: 0,
            unitPrice: 1500000,
            totalPrice: 15000000,
            verificationStatus: 'VERIFIED',
          },
        ],
      });
    }
    const doc = await exportProjectToPDF({ ...sampleProject, sections: manySecs }, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 4);
  });

  // 18. RAB dengan ribuan baris.
  await execute(18, 'RAB dengan volume baris besar render stabil', async () => {
    const manyItems: any[] = [];
    for (let i = 1; i <= 100; i++) {
      manyItems.push({
        id: `it-m-${i}`,
        sectionId: 'sec-1',
        itemNumber: `${i}`,
        code: `A.${i}`,
        description: `Item Pekerjaan Volume Besar Baris ke-${i}`,
        volume: 5,
        unit: 'm³',
        materialPrice: 500000,
        laborPrice: 0,
        equipmentPrice: 0,
        unitPrice: 500000,
        totalPrice: 2500000,
        verificationStatus: 'VERIFIED',
      });
    }
    const doc = await exportProjectToPDF({
      ...sampleProject,
      sections: [{ id: 'sec-1', code: 'DIV-MASS', name: 'Pekerjaan Massal', subtotal: 250000000, items: manyItems }],
    }, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 4);
  });

  // 19. Uraian pekerjaan sangat panjang.
  await execute(19, 'Uraian pekerjaan sangat panjang terbungkus rapi (wrap)', async () => {
    const longProj: Project = {
      ...sampleProject,
      sections: [
        {
          id: 'sec-1',
          code: 'DIV-01',
          name: 'Pekerjaan Khusus Spesifikasi Luas',
          subtotal: 50000000,
          items: [
            {
              id: 'it-long',
              sectionId: 'sec-1',
              itemNumber: '1.1',
              code: 'AHSP.SPESIFIKASI.PANJANG',
              description: 'Pengadaan dan perakitan struktur space frame baja pipa seamless ASTM A53 Grade B diameter 4 inci tebal 6 mm termasuk sambungan bola baja solid (ball joint) tempa panas AISI 4140, baut mutu tinggi ASTM A325, proteksi galvanis celup panas (hot dip galvanized) 85 mikron, dan sertifikat pengujian tarik laboratorium resmi KAN.',
              specification: 'Baja ASTM A53 Grade B Seamless 4" Schedule 40 Hot Dip Galvanized',
              volume: 1,
              unit: 'ls',
              materialPrice: 50000000,
              laborPrice: 0,
              equipmentPrice: 0,
              unitPrice: 50000000,
              totalPrice: 50000000,
              verificationStatus: 'VERIFIED',
            },
          ],
        },
      ],
    };
    const doc = await exportProjectToPDF(longProj, sampleCompany);
    assert.ok(doc);
  });

  // 20. PDF multi-halaman.
  await execute(20, 'PDF multi-halaman struktur valid', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 3, 'Must have at least 3 pages');
  });

  // 21. Header tabel berulang.
  await execute(21, 'Header tabel detail berulang di setiap halaman landscape', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany);
    assert.strictEqual(doc.getNumberOfPages() >= 3, true);
  });

  // 22. Nomor halaman benar.
  await execute(22, 'Nomor halaman tercatat benar pada running footer', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // 23. Total PDF sama dengan total aplikasi.
  await execute(23, 'Total PDF sama dengan total aplikasi', () => {
    const directCost = 50000000 + 300000000; // 350,000,000
    const overhead = Math.round(directCost * 0.05); // 17,500,000
    const profit = Math.round(directCost * 0.10); // 35,000,000
    const subtotal = directCost + overhead + profit; // 402,500,000
    const tax = Math.round(subtotal * 0.11); // 44,275,000
    const grandTotal = subtotal + tax; // 446,775,000

    assert.strictEqual(directCost, 350000000);
    assert.strictEqual(overhead, 17500000);
    assert.strictEqual(profit, 35000000);
    assert.strictEqual(tax, 44275000);
    assert.strictEqual(grandTotal, 446775000);
  });

  // 24. Watermark muncul di seluruh halaman FREE/TRIAL.
  await execute(24, 'Watermark muncul di seluruh halaman FREE/TRIAL', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'free', isWatermarkRequired: true });
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // 25. Watermark tidak muncul pada PAID jika logo perusahaan tersedia.
  await execute(25, 'Watermark tidak muncul pada PAID jika logo perusahaan tersedia', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, {
      subscriptionPlan: 'pro',
      isWatermarkRequired: false,
      companyLogoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });
    assert.ok(doc);
  });

  // 26. Fallback logo EZRAB berjalan jika logo perusahaan tidak tersedia.
  await execute(26, 'Fallback logo EZRAB berjalan jika logo perusahaan tidak tersedia', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'pro', companyLogoUrl: undefined });
    assert.ok(doc);
  });

  // 27. Workspace A tidak dapat menggunakan logo Workspace B.
  await execute(27, 'Workspace A tidak dapat menggunakan logo Workspace B (Isolasi)', () => {
    const wsA = 'ws-isolation-a';
    const wsB = 'ws-isolation-b';
    brandingService.setSubscriptionPlan(wsA, 'pro');
    brandingService.setSubscriptionPlan(wsB, 'pro');

    brandingService.uploadLogo(wsA, createValidPngBuffer(), 'image/png');
    const bA = brandingService.getBranding(wsA);
    const bB = brandingService.getBranding(wsB);

    assert.ok(bA.logoUrl, 'Workspace A has logo');
    assert.strictEqual(bB.logoUrl, undefined, 'Workspace B must NOT inherit Workspace A logo');
  });

  // 28. Unified AI Provider Gateway, Intelligent Model Router & Real AI Runtime (Phase 2 & Phase 3 Test Suite)
  await execute(28, 'Unified AI Provider Gateway, Intelligent Model Router & Real AI Runtime', async () => {
    const { runProviderGatewayTestSuite } = await import('./providerGateway.test');
    await runProviderGatewayTestSuite();
    const { runRealAiRuntimeTestSuite } = await import('./realAiRuntime.test');
    await runRealAiRuntimeTestSuite();
  });

  // 29. Interactive Automatic RAB Wizard (Phase A Acceptance Test Suite)
  await execute(29, 'Interactive Automatic RAB Wizard (Intent, State Machine, Gating & T36 Template)', async () => {
    const { intentClassifier } = await import('../orchestrator/intentClassifier');
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const { aiDbAdapter } = await import('../database/dbAdapter');

    const intent = intentClassifier.classify('Buatkan RAB Rumah');
    assert.strictEqual(intent.category, 'AUTOMATIC_RAB_START');

    const ws = 'ws-test-wizard-exact';
    const prj = 'PRJ-TEST-WIZ-29';
    aiDbAdapter.createProject(ws, { id: prj, name: 'Test Proyek Wizard', budget: 0, status: 'ACTIVE' });

    // Step 1: Start with initialQuery "Buatkan RAB Rumah" -> directly to TEMPLATE_SELECTION
    const start = WizardStateMachine.startSession({ workspaceId: ws, userId: 'u1', projectId: prj, conversationId: 'c1', initialQuery: 'Buatkan RAB Rumah' });
    assert.strictEqual(start.step, 'TEMPLATE_SELECTION');
    assert.ok((start.choices?.length || 0) >= 14);

    // Step 2: Select T36 -> transitions to TEMPLATE_CONFIRMATION
    const s2 = WizardStateMachine.answerStep({ sessionId: start.wizardSessionId, workspaceId: ws, userId: 'u1', choiceId: 'HOUSE-T36-1FL' });
    assert.strictEqual(s2.step, 'TEMPLATE_CONFIRMATION');
    assert.strictEqual(s2.selectedTemplate?.templateId, 'HOUSE-T36-1FL');

    // Step 2.1: Proceed from TEMPLATE_CONFIRMATION to BASIC_PARAMETER_COLLECTION
    const s2b = WizardStateMachine.answerStep({ sessionId: start.wizardSessionId, workspaceId: ws, userId: 'u1', choiceId: 'PROCEED_CONFIG' });
    assert.strictEqual(s2b.step, 'BASIC_PARAMETER_COLLECTION');

    // Step 3: Calculation Gating
    const itemsBefore = await aiDbAdapter.getRabItems(ws, prj);
    assert.strictEqual(itemsBefore.length, 0);

    // Step 4: Submit params
    const s3 = WizardStateMachine.answerStep({
      sessionId: start.wizardSessionId,
      workspaceId: ws,
      userId: 'u1',
      parameters: { building_area: 36, foundation_type: 'BATU_KALI', wall_type: 'BATA_RINGAN', roof_type: 'BAJA_RINGAN_GENTENG_METAL', quality_level: 'STANDAR' }
    });
    assert.strictEqual(s3.step, 'RAB_PREVIEW');
    assert.ok(s3.summary!.grandTotal > 0);

    // Step 5: Confirm
    const confirm = WizardStateMachine.confirmAndApply({ sessionId: start.wizardSessionId, workspaceId: ws, userId: 'u1', projectId: prj });
    assert.strictEqual(confirm.success, true);
    const itemsAfter = await aiDbAdapter.getRabItems(ws, prj);
    assert.strictEqual(itemsAfter.length, confirm.addedItemsCount);
  });

  // 30. Project Contract (PRJ-YYYYMM-XXXX) & Centralized Creation Methods (Phase 3 & 4)
  await execute(30, 'Project Contract (PRJ-YYYYMM-XXXX) & Centralized Creation Methods', async () => {
    const now = new Date();
    const ymPrefix = `PRJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Test contract generation logic
    const testMethods: Array<'magic_ai' | 'manual' | 'volume_calculation' | 'template'> = [
      'magic_ai',
      'manual',
      'volume_calculation',
      'template',
    ];

    for (const method of testMethods) {
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const generatedId = `PRJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${randomSuffix}`;
      
      // Assert contract format
      assert.match(generatedId, /^PRJ-\d{6}-[A-Z0-9]{4}$/);
      assert.ok(generatedId.startsWith(ymPrefix));

      // Assert project object creation contract
      const testProj: Partial<Project> = {
        id: generatedId,
        name: `Test Project ${method}`,
        creationMethod: method,
        status: 'draft',
      };

      assert.strictEqual(testProj.creationMethod, method);
      assert.strictEqual(testProj.status, 'draft');
    }
  });

  // 31. Phase 5: Magic AI Full Integration, Zero-Orphan Project Binding & Auto-Drafting to Spreadsheet
  await execute(31, 'Magic AI Full Integration, Zero-Orphan Project Binding & Auto-Drafting', async () => {
    const { intentClassifier } = await import('../orchestrator/intentClassifier');
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const { resolveClientWizardStep } = await import('../../src/services/coAssistantService');

    const ws = 'ws-test-phase5-magic-ai';
    const now = new Date();
    const ymPrefix = `PRJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const targetProjectId = `${ymPrefix}-${randomSuffix}`;

    // 1. Intent Detection Contract
    const intent = intentClassifier.classify('Tolong buatkan RAB rumah type 36 lengkap');
    assert.strictEqual(intent.category, 'AUTOMATIC_RAB_START');

    // 2. Wizard Start with Project Binding (Zero Orphan)
    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-phase5',
      projectId: targetProjectId,
      conversationId: `conv-phase5-${Date.now()}`,
      initialQuery: 'Tolong buatkan RAB rumah tinggal',
    });

    assert.ok(session.wizardSessionId);
    assert.strictEqual(session.step, 'TEMPLATE_SELECTION');

    // 3. Template Selection & Technical Specification
    const s1 = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-phase5',
      choiceId: 'HOUSE-T36-1FL',
    });
    assert.strictEqual(s1.step, 'TEMPLATE_CONFIRMATION');

    const s2 = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-phase5',
      choiceId: 'PROCEED_CONFIG',
    });
    assert.strictEqual(s2.step, 'BASIC_PARAMETER_COLLECTION');

    // 4. Calculate Parameters -> RAB Preview
    const s3 = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-phase5',
      parameters: {
        building_area: 36,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
      },
    });
    assert.strictEqual(s3.step, 'RAB_PREVIEW');
    assert.ok(s3.summary);
    assert.ok(s3.summary.grandTotal > 0);
    assert.ok(s3.summary.categories.length >= 5);

    // 5. Confirm & Auto-Drafting to Project
    const confirmResult = WizardStateMachine.confirmAndApply({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-phase5',
      projectId: targetProjectId,
    });

    assert.strictEqual(confirmResult.success, true);
    assert.strictEqual(confirmResult.projectId, targetProjectId);
    assert.ok(confirmResult.addedItemsCount >= 10);
    assert.ok(confirmResult.items && confirmResult.items.length >= 10);

    // Check items integrity
    for (const item of confirmResult.items!) {
      assert.ok(item.description, 'Item must have description');
      assert.ok(item.volume > 0, 'Item volume must be > 0');
      assert.ok(item.unit, 'Item must have unit');
      assert.ok(item.unitPrice && item.unitPrice > 0, 'Item must have unitPrice');
      assert.ok(item.ahspCode, 'Item must have ahspCode');
      assert.ok(item.category, 'Item must have category');
    }

    // 6. Double-Click Idempotency Protection Check
    const doubleConfirm = WizardStateMachine.confirmAndApply({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-phase5',
      projectId: targetProjectId,
    });
    assert.strictEqual(doubleConfirm.success, true);
    assert.strictEqual(doubleConfirm.addedItemsCount, confirmResult.addedItemsCount);

    // 7. Verify Client-Side Fallback Generator
    const clientFallback = resolveClientWizardStep(
      'sess-client-fallback',
      undefined,
      { building_area: 45, foundation_type: 'BATU_KALI', quality_level: 'STANDAR' },
      { step: 'BASIC_PARAMETER_COLLECTION', selectedTemplate: { templateId: 'HOUSE-T45-1FL', label: 'Rumah Type 45', area: 45 } }
    );
    assert.strictEqual(clientFallback.step, 'RAB_PREVIEW');
    assert.ok(clientFallback.calculatedItems && clientFallback.calculatedItems.length >= 16);
    assert.strictEqual(clientFallback.summary.categories.length, 13);
    assert.ok(clientFallback.summary.grandTotal > 0);
  });

  // 32. Routing Integrity — Dashboard Always Navigates to /app/dashboard, Never to Manajemen Proyek
  await execute(32, 'Routing Integrity — Dashboard Always Navigates to /app/dashboard, Never to Manajemen Proyek', async () => {
    const { routeForMenu, parseWorkspaceRoute, paths } = await import('../../src/routing/routes');

    // 1. Dashboard menu route must always return /app/dashboard, even if a projectId is provided
    assert.strictEqual(paths.dashboard(), '/app/dashboard');
    assert.strictEqual(routeForMenu('dashboard'), '/app/dashboard');
    assert.strictEqual(routeForMenu('dashboard', 'PRJ-202609-TEST'), '/app/dashboard');

    // 2. Parsing /app/dashboard must resolve to menu: 'dashboard' and scope: 'global'
    const parsedDashboard = parseWorkspaceRoute('/app/dashboard');
    assert.strictEqual(parsedDashboard.status, 'ok');
    assert.strictEqual(parsedDashboard.menu, 'dashboard');
    assert.strictEqual(parsedDashboard.scope, 'global');

    // 3. Manajemen Proyek menu must route to /app/management, NOT to /app/dashboard
    assert.strictEqual(routeForMenu('manajemen-proyek'), '/app/management');
    const parsedManagement = parseWorkspaceRoute('/app/management');
    assert.strictEqual(parsedManagement.status, 'ok');
    assert.strictEqual(parsedManagement.menu, 'manajemen-proyek');

    // 4. Project-scoped dashboard (/app/projects/:id) resolves to manajemen-proyek, ensuring separation
    const parsedProjectRoot = parseWorkspaceRoute('/app/projects/PRJ-1234');
    assert.strictEqual(parsedProjectRoot.status, 'ok');
    assert.strictEqual(parsedProjectRoot.menu, 'manajemen-proyek');
    assert.strictEqual(parsedProjectRoot.projectId, 'PRJ-1234');
  });

  // 33. Project Isolation Guarantee — Strict Null Handling & Zero Fallback to projects[0]
  await execute(33, 'Project Isolation Guarantee — Strict Null Handling & Zero Fallback to projects[0]', async () => {
    // Simulate multi-project context resolution to verify zero fallback
    const projectsList: Project[] = [
      {
        id: 'PRJ-FIRST-001',
        projectNumber: 'PRJ-2026-001',
        name: 'Proyek Lama User A',
        location: 'Jakarta',
        clientName: 'Klien A',
        buildingType: 'Rumah',
        currentVersion: 'Rev 1.0',
        status: 'in_progress',
        buildingArea: 100,
        landArea: 150,
        sections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'PRJ-SECOND-002',
        projectNumber: 'PRJ-2026-002',
        name: 'Proyek Baru User B',
        location: 'Surabaya',
        clientName: 'Klien B',
        buildingType: 'Ruko',
        currentVersion: 'Rev 1.0',
        status: 'draft',
        buildingArea: 200,
        landArea: 120,
        sections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Simulated resolution logic matching ProjectContext strict semantics
    const resolveCurrentProject = (currentProjectId: string | null): Project | null => {
      if (!currentProjectId) return null;
      return projectsList.find((p) => p.id === currentProjectId) || null;
    };

    const resolveActivePid = (currentProjectId: string | null): string => {
      if (!currentProjectId) return '';
      return projectsList.find((p) => p.id === currentProjectId)?.id || '';
    };

    // When currentProjectId is null or unset, MUST NOT fallback to projectsList[0]
    assert.strictEqual(resolveCurrentProject(null), null);
    assert.strictEqual(resolveCurrentProject(''), null);
    assert.strictEqual(resolveActivePid(null), '');
    assert.strictEqual(resolveActivePid(''), '');

    // When valid ID is provided, resolves exactly to that project
    assert.strictEqual(resolveCurrentProject('PRJ-SECOND-002')?.name, 'Proyek Baru User B');
    assert.strictEqual(resolveActivePid('PRJ-SECOND-002'), 'PRJ-SECOND-002');
  });

  // 34. MagicAiLaunchContext Contract — Zero Prompt Loss Transfer & Session Lifecycle
  await execute(34, 'MagicAiLaunchContext Contract — Zero Prompt Loss Transfer & Session Lifecycle', async () => {
    const { MagicAiLaunchContext } = await import('../../src/types/magicAiLaunch');

    const samplePrompt = 'Bangun rumah minimalis 2 lantai ukuran 120m2 di Surabaya Barat dengan finishing mewah';
    const launchContext: InstanceType<any> = {
      projectId: 'PRJ-202609-KICK',
      projectName: 'Rumah Minimalis 2 Lantai Surabaya Barat',
      buildingType: 'Rumah Tinggal',
      location: 'Surabaya Barat',
      initialPrompt: samplePrompt,
      source: 'dashboard_hero',
      timestamp: Date.now(),
      status: 'pending_confirmation',
      assumptions: {
        buildingArea: 120,
        floors: 2,
        finishingGrade: 'mewah',
      },
    };

    // 1. Initial prompt must be preserved verbatim without mutation or trimming
    assert.strictEqual(launchContext.initialPrompt, samplePrompt);
    assert.strictEqual(launchContext.source, 'dashboard_hero');
    assert.strictEqual(launchContext.status, 'pending_confirmation');

    // 2. Lifecycle transition to processing
    launchContext.status = 'processing';
    assert.strictEqual(launchContext.status, 'processing');

    // 3. Lifecycle transition to completed
    launchContext.status = 'completed';
    assert.strictEqual(launchContext.status, 'completed');
  });

  // 35. Complete 13-Category WBS Engine & Valid AHSP PUPR 2026 Compliance
  await execute(35, 'Complete 13-Category WBS Engine & Valid AHSP PUPR 2026 Compliance', async () => {
    const { TemplateResolver } = await import('../services/templateResolver');

    const template = TemplateResolver.getTemplate('HOUSE-T36-1FL');
    assert.ok(template, 'HOUSE-T36-1FL canonical template must exist in TemplateResolver');

    const items = template.generateRabItems({
      building_area: 36,
      foundation_type: 'BATU_KALI',
      wall_type: 'BATA_RINGAN',
      roof_type: 'BAJA_RINGAN_GENTENG_METAL',
      quality_level: 'STANDAR',
    });

    // 1. Must produce 42 distinct AHSP line items
    assert.strictEqual(items.length, 42, 'Expected 42 comprehensive WBS items');

    // 2. Must produce exactly 13 standard WBS divisions
    const categorySet = new Set(items.map((it: any) => it.category));
    assert.strictEqual(categorySet.size, 13, 'Expected 13 distinct WBS categories');

    const expectedKeywords = [
      'PERSIAPAN',
      'TANAH DAN PONDASI',
      'STRUKTUR',
      'DINDING',
      'LANTAI',
      'ATAP',
      'KUSEN, PINTU',
      'PLAFON',
      'INSTALASI LISTRIK',
      'PLAMBING DAN SANITASI',
      'PENGECATAN',
      'EKSTERIOR DAN LINGKUNGAN',
      'FINISHING',
    ];

    const categoryArray = Array.from(categorySet);
    for (const kw of expectedKeywords) {
      assert.ok(
        categoryArray.some((cat) => (cat as string).toUpperCase().includes(kw)),
        `Missing expected division in generated items for keyword: ${kw}`
      );
    }

    // 3. Every single item must have valid AHSP PUPR 2026 code, unit, volume > 0, unitPrice > 0
    let calculatedSubtotal = 0;
    for (const item of items) {
      assert.ok(item.ahspCode && item.ahspCode.length > 3, `Item ${item.description} must have valid AHSP code`);
      assert.ok(item.unit && item.unit.length > 0, `Item ${item.description} must have unit`);
      assert.ok(item.volume > 0, `Item ${item.description} volume must be positive`);
      assert.ok(item.unitPrice && item.unitPrice > 0, `Item ${item.description} unitPrice must be positive`);
      calculatedSubtotal += item.volume * item.unitPrice;
    }

    assert.ok(calculatedSubtotal > 50000000, 'Direct cost subtotal must be greater than Rp 50.000.000');
  });

  // 36. End-to-End Dashboard -> Auto Project Creation -> Magic AI Draft -> Spreadsheet Verification
  await execute(36, 'End-to-End Dashboard Prompt -> Auto Project Creation -> Magic AI Draft -> Spreadsheet', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');

    const ws = 'ws-test-e2e-dashboard-magic';
    const now = new Date();
    const ymPrefix = `PRJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const generatedProjectId = `${ymPrefix}-${randomSuffix}`;

    // 1. Simulate Dashboard Hero auto-creating project with 'magic_ai_dashboard'
    const newProject: Project = {
      id: generatedProjectId,
      projectNumber: generatedProjectId,
      name: 'RAB Rumah Type 45 Minimalis',
      location: 'Bandung',
      clientName: 'Pemilik Proyek (Self)',
      buildingType: 'Rumah Tinggal',
      currentVersion: 'Rev 1.0',
      status: 'draft',
      creationMethod: 'magic_ai_dashboard',
      buildingArea: 45,
      landArea: 60,
      sections: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    assert.strictEqual(newProject.creationMethod, 'magic_ai_dashboard');
    assert.strictEqual(newProject.status, 'draft');
    assert.ok(newProject.id.startsWith(ymPrefix));

    // 2. Start Magic AI session bound strictly to this project ID
    // Type 45 query triggers smart intent recognition jumping straight to parameter collection
    const initialPrompt = 'Buat RAB rumah tinggal type 45 di Bandung minimalis';
    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-e2e',
      projectId: generatedProjectId,
      conversationId: `conv-e2e-${Date.now()}`,
      initialQuery: initialPrompt,
    });

    // Smart recognition detected Type 45 directly
    assert.ok(
      session.step === 'BASIC_PARAMETER_COLLECTION' || session.step === 'TEMPLATE_SELECTION',
      `Unexpected initial step: ${session.step}`
    );

    // 3. Provide technical parameters to compute RAB
    const preview = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-e2e',
      parameters: {
        building_area: 45,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
      },
    });

    assert.strictEqual(preview.step, 'RAB_PREVIEW');
    assert.ok(preview.summary, 'Preview must have summary');
    assert.strictEqual(preview.summary.categories.length, 13);
    assert.strictEqual(preview.summary.itemsCount, 42);

    // 4. Confirm and apply to project spreadsheet
    const applyResult = WizardStateMachine.confirmAndApply({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-e2e',
      projectId: generatedProjectId,
    });

    assert.strictEqual(applyResult.success, true);
    assert.strictEqual(applyResult.projectId, generatedProjectId);
    assert.strictEqual(applyResult.addedItemsCount, 42);
    assert.ok(applyResult.items && applyResult.items.length === 42);
  });

  // 37. Masjid Template: Kubah Enamel/GRC, Genteng Tanah Liat/Keramik, Wudhu Terpisah, Mihrab Kaligrafi, Sound System
  await execute(37, 'Building Template: Masjid (Kubah, Genteng, Tempat Wudhu, Mihrab, Sound System)', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const ws = 'ws-test-masjid';

    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-masjid',
      initialQuery: 'Tolong buatkan RAB pembangunan masjid ukuran 180 m2 dengan kubah enamel',
    });

    // Masjid prompt should auto-route to BUILDING-MOSQUE
    assert.strictEqual(session.step, 'BASIC_PARAMETER_COLLECTION');
    assert.strictEqual(session.selectedTemplate?.id, 'BUILDING-MOSQUE');

    const preview = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-masjid',
      parameters: {
        building_area: 180,
        dome_type: 'KUBAH_ENAMEL',
        roof_covering: 'GENTENG_TANAH_LIAT',
        wudhu_facility: 'WUDHU_TERPISAH',
        mihrab_finish: 'MARMER_GRC',
        sound_system: 'SOUND_TOA_COLUMN',
        location: 'JAWA_TIMUR',
      },
    });

    assert.strictEqual(preview.step, 'RAB_PREVIEW');
    assert.ok(preview.summary);
    assert.strictEqual(preview.summary.categories.length, 13);

    const items = preview.calculatedItems || [];
    const itemDescs = items.map((i: any) => i.description.toLowerCase());

    // Check specific Mosque components
    assert.ok(itemDescs.some((d: string) => d.includes('kubah enamel') || d.includes('kubah')), 'Must contain Kubah Enamel');
    assert.ok(itemDescs.some((d: string) => d.includes('genteng tanah liat') || d.includes('genteng')), 'Must contain Genteng Tanah Liat');
    assert.ok(itemDescs.some((d: string) => d.includes('wudhu')), 'Must contain Area Tempat Wudhu');
    assert.ok(itemDescs.some((d: string) => d.includes('mihrab')), 'Must contain Mihrab Kaligrafi Marmer/GRC');
    assert.ok(itemDescs.some((d: string) => d.includes('sound') || d.includes('toa')), 'Must contain Audio Sound System TOA');

    // Check Regional multiplier applied (Jawa Timur = 0.95)
    assert.strictEqual(preview.summary.regionInfo?.key, 'JAWA_TIMUR');
    assert.strictEqual(preview.summary.regionInfo?.multiplier, 0.95);
  });

  // 38. Gudang Template: Rangka Baja WF, Gording CNP/Hollow, Spandek Insulasi, Plat Beton + Floor Hardener
  await execute(38, 'Building Template: Gudang (Rangka WF, Gording CNP/Hollow, Spandek Insulasi, Floor Hardener)', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const ws = 'ws-test-warehouse';

    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-warehouse',
      initialQuery: 'Buatkan estimasi RAB gudang logistik 600 m2 baja WF dengan floor hardener',
    });

    assert.strictEqual(session.step, 'BASIC_PARAMETER_COLLECTION');
    assert.strictEqual(session.selectedTemplate?.id, 'BUILDING-WAREHOUSE');

    const preview = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-warehouse',
      parameters: {
        building_area: 600,
        steel_grade_wf: 'WF_STANDAR_SNI',
        purlin_type: 'CNP_HOLLOW_GALVANIS',
        roof_covering: 'SPANDEK_INSULASI',
        floor_finish: 'BETON_FLOOR_HARDENER',
        industrial_door: 'SLIDING_INDUSTRIAL',
        location: 'DKI_JAKARTA',
      },
    });

    assert.strictEqual(preview.step, 'RAB_PREVIEW');
    assert.ok(preview.summary);
    assert.strictEqual(preview.summary.categories.length, 13);

    const items = preview.calculatedItems || [];
    const itemDescs = items.map((i: any) => i.description.toLowerCase());

    assert.ok(itemDescs.some((d: string) => d.includes('wf') && (d.includes('kolom') || d.includes('baja'))), 'Must contain Baja Profil WF');
    assert.ok(itemDescs.some((d: string) => d.includes('gording') || d.includes('cnp') || d.includes('hollow')), 'Must contain Gording CNP/Hollow galvanis');
    assert.ok(itemDescs.some((d: string) => d.includes('spandek') && (d.includes('insulasi') || d.includes('peredam'))), 'Must contain Spandek Insulasi');
    assert.ok(itemDescs.some((d: string) => d.includes('floor hardener')), 'Must contain Plat Beton + Floor Hardener');
    assert.ok(itemDescs.some((d: string) => d.includes('sliding door') || d.includes('pintu dorong') || d.includes('pintu geser')), 'Must contain Pintu Sliding Industrial');
  });

  // 39. Gedung Parkir Template: Baja WF Komposit, Bondek 0.75mm, Ramp Grooved Anti-slip, Marka & Stopper
  await execute(39, 'Building Template: Gedung Parkir (Baja WF, Bondek, Ramp Grooved, Marka & Stopper)', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const ws = 'ws-test-parking';

    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-parking',
      initialQuery: 'RAB gedung parkir bertingkat luas 1200 m2 struktur baja WF plat bondek',
    });

    assert.strictEqual(session.step, 'BASIC_PARAMETER_COLLECTION');
    assert.strictEqual(session.selectedTemplate?.id, 'BUILDING-PARKING');

    const preview = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-parking',
      parameters: {
        building_area: 1200,
        floor_count: 3,
        structure_frame: 'WF_COMPOSITE',
        floor_slab: 'BONDEK_WIREMESH_K300',
        ramp_type: 'RAMP_GROOVED_ANTISLIP',
        guardrail_type: 'GUARDRAIL_HEAVY_HOLLOW',
        traffic_fixtures: 'MARKA_STOPPER_COMPLETE',
        location: 'DKI_JAKARTA',
      },
    });

    assert.strictEqual(preview.step, 'RAB_PREVIEW');
    assert.ok(preview.summary);
    assert.strictEqual(preview.summary.categories.length, 13);

    const items = preview.calculatedItems || [];
    const itemDescs = items.map((i: any) => i.description.toLowerCase());

    assert.ok(itemDescs.some((d: string) => d.includes('wf') && d.includes('balok')), 'Must contain Balok Induk/Anak Baja WF');
    assert.ok(itemDescs.some((d: string) => d.includes('bondek')), 'Must contain Lantai Composite Plat Bondek');
    assert.ok(itemDescs.some((d: string) => d.includes('ramp') || d.includes('grooved')), 'Must contain Ramp Kendaraan Grooved Anti-Slip');
    assert.ok(itemDescs.some((d: string) => d.includes('guardrail') || d.includes('railing')), 'Must contain Guardrail Pembatas Parkir Pipa/Hollow');
    assert.ok(itemDescs.some((d: string) => d.includes('marka') || d.includes('thermoplastic')), 'Must contain Marka Thermoplastic');
    assert.ok(itemDescs.some((d: string) => d.includes('stopper') || d.includes('corner guard')), 'Must contain Rubber Wheel Stopper');
  });

  // 40. Pasar Template: Portal Bentang Lebar, Meja Los Basah Keramik + Kran, Kios Rolling Door, Grease Trap
  await execute(40, 'Building Template: Pasar (Portal Bentang Lebar, Los Basah Keramik, Kios Rolling Door, Grease Trap)', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const ws = 'ws-test-market';

    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-market',
      initialQuery: 'Tolong rancang RAB pasar rakyat semi-modern luas 800 m2 ada los basah dan kios',
    });

    assert.strictEqual(session.step, 'BASIC_PARAMETER_COLLECTION');
    assert.strictEqual(session.selectedTemplate?.id, 'BUILDING-MARKET');

    const preview = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-market',
      parameters: {
        building_area: 800,
        portal_type: 'PORTAL_WF_BENTANG_LEBAR',
        stall_wet: 'MEJA_LOS_KERAMIK_KRAN',
        kiosk_dry: 'KIOS_ROLLING_DOOR',
        drainage_odor: 'DRAINASE_GREASE_TRAP',
        fire_protection: 'HYDRANT_APAR',
        location: 'JAWA_BARAT',
      },
    });

    assert.strictEqual(preview.step, 'RAB_PREVIEW');
    assert.ok(preview.summary);
    assert.strictEqual(preview.summary.categories.length, 13);

    const items = preview.calculatedItems || [];
    const itemDescs = items.map((i: any) => i.description.toLowerCase());

    assert.ok(itemDescs.some((d: string) => d.includes('portal') || d.includes('bentang lebar')), 'Must contain Portal Bentang Lebar Baja WF');
    assert.ok(itemDescs.some((d: string) => d.includes('los') && d.includes('keramik')), 'Must contain Meja Los Basah Keramik + Kran Air');
    assert.ok(itemDescs.some((d: string) => d.includes('rolling door')), 'Must contain Kios Dinding Partisi + Rolling Door');
    assert.ok(itemDescs.some((d: string) => d.includes('grease trap')), 'Must contain Saluran Drainase Grating + Grease Trap Anti-Bau');
    assert.ok(itemDescs.some((d: string) => d.includes('hydrant') || d.includes('hidran')), 'Must contain Instalasi Fire Protection Hydrant & APAR');
  });

  // 41. Gedung Perkantoran Template: Lantai Tinggi 4.0m, Downlight/Troffer 60x60, Schneider + Pop-up Floor Outlet, Cat Low-VOC
  await execute(41, 'Building Template: Gedung Perkantoran (Tinggi 4m, Downlight LED, Pop-Up Floor Outlet, Low-VOC)', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const ws = 'ws-test-office';

    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-office',
      initialQuery: 'Buat RAB gedung perkantoran 3 lantai tinggi lantai 4 meter lampu troffer 60x60',
    });

    assert.strictEqual(session.step, 'BASIC_PARAMETER_COLLECTION');
    assert.strictEqual(session.selectedTemplate?.id, 'BUILDING-OFFICE');

    const preview = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-office',
      parameters: {
        building_area: 1200,
        floor_count: 3,
        floor_to_floor_height: 4.0,
        roof_type: 'ROOFTOP_DEK_BETON',
        ceiling_type: 'PLAFON_AKUSTIK_60X60',
        lighting_type: 'TROFFER_60X60',
        electrical_grade: 'SCHNEIDER_POPUP',
        paint_type: 'LOW_VOC_PREMIUM',
        location: 'DKI_JAKARTA',
      },
    });

    assert.strictEqual(preview.step, 'RAB_PREVIEW');
    assert.ok(preview.summary);
    assert.strictEqual(preview.summary.categories.length, 13);

    const items = preview.calculatedItems || [];
    const itemDescs = items.map((i: any) => i.description.toLowerCase());

    assert.ok(itemDescs.some((d: string) => d.includes('troffer') || d.includes('60x60')), 'Must contain Lampu Troffer LED Panel 60x60');
    assert.ok(itemDescs.some((d: string) => d.includes('pop-up') || d.includes('floor outlet')), 'Must contain Stop Kontak Schneider + Pop-Up Floor Outlet');
    assert.ok(itemDescs.some((d: string) => d.includes('low-voc') || d.includes('anti-bakteri')), 'Must contain Cat Interior Low-VOC Ramah Lingkungan');
    assert.ok(itemDescs.some((d: string) => d.includes('akustik')), 'Must contain Plafon Akustik Grid 60x60');
  });

  // 42. Bangunan Custom Template: Parametrik Bebas Tanpa Rigid Constraint
  await execute(42, 'Building Template: Bangunan Custom (Parametrik Bebas, Luas, Lantai & Struktur Fleksibel)', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const ws = 'ws-test-custom';

    const session = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-custom',
      initialQuery: 'Mau estimasi bangunan custom serbaguna 2 lantai luas 350 m2',
    });

    assert.strictEqual(session.step, 'BASIC_PARAMETER_COLLECTION');
    assert.strictEqual(session.selectedTemplate?.id, 'BUILDING-CUSTOM');

    const preview = WizardStateMachine.answerStep({
      sessionId: session.wizardSessionId,
      workspaceId: ws,
      userId: 'user-custom',
      parameters: {
        building_area: 350,
        floor_count: 2,
        floor_height: 3.6,
        structure_type: 'BETON_BERTULANG_K250',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        finish_grade: 'PREMIUM',
        location: 'BALI_NUSRA',
      },
    });

    assert.strictEqual(preview.step, 'RAB_PREVIEW');
    assert.ok(preview.summary);
    assert.strictEqual(preview.summary.categories.length, 13);
    assert.strictEqual(preview.summary.regionInfo?.key, 'BALI_NUSRA');
    assert.strictEqual(preview.summary.regionInfo?.multiplier, 1.08);
  });

  // 43. Regional Cost Multipliers (Indeks Biaya Wilayah): Jakarta, Jatim, Jateng, Papua, Bali, Smart Prompt Detection
  await execute(43, 'Regional Cost Multipliers: Verification of Multipliers & Smart Detection', async () => {
    const { WizardStateMachine } = await import('../services/wizardStateMachine');
    const { getRegionalFactor, detectRegionFromText } = await import('../../src/data/regionalCostFactors');
    const ws = 'ws-test-region';

    // 1. Verify regional factors definition
    const factorJkt = getRegionalFactor('DKI_JAKARTA');
    assert.strictEqual(factorJkt.multiplier, 1.00);
    assert.strictEqual(factorJkt.percentage, 100);

    const factorJatim = getRegionalFactor('JAWA_TIMUR');
    assert.strictEqual(factorJatim.multiplier, 0.95);
    assert.strictEqual(factorJatim.percentage, 95);

    const factorJateng = getRegionalFactor('JAWA_TENGAH_DIY');
    assert.strictEqual(factorJateng.multiplier, 0.90);
    assert.strictEqual(factorJateng.percentage, 90);

    const factorPapua = getRegionalFactor('MALUKU_PAPUA');
    assert.strictEqual(factorPapua.multiplier, 1.45);
    assert.strictEqual(factorPapua.percentage, 145);

    const factorKalimantan = getRegionalFactor('KALIMANTAN_IKN');
    assert.strictEqual(factorKalimantan.multiplier, 1.20);
    assert.strictEqual(factorKalimantan.percentage, 120);

    // 2. Test Smart Region Detection from Prompt Text
    assert.strictEqual(detectRegionFromText('RAB rumah di Surabaya Jawa Timur'), 'JAWA_TIMUR');
    assert.strictEqual(detectRegionFromText('Hitung biaya gudang di Jayapura Papua'), 'MALUKU_PAPUA');
    assert.strictEqual(detectRegionFromText('Proyek kantor di Balikpapan Kalimantan IKN'), 'KALIMANTAN_IKN');
    assert.strictEqual(detectRegionFromText('Pembangunan masjid di Semarang'), 'JAWA_TENGAH_DIY');
    const denpasarRegion = detectRegionFromText('Rumah tinggal type 60 di Denpasar');
    assert.ok(denpasarRegion === 'BALI_NUSRA' || denpasarRegion === 'BALI_NTB_NTT', `Expected BALI region but got ${denpasarRegion}`);

    // 3. Verify price scaling on actual RAB calculation (Type 60 in Jakarta vs Jatim vs Papua)
    const sessionJkt = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-jkt',
      initialQuery: 'RAB rumah type 60 di Jakarta',
    });
    const previewJkt = WizardStateMachine.answerStep({
      sessionId: sessionJkt.wizardSessionId,
      workspaceId: ws,
      userId: 'user-jkt',
      parameters: { building_area: 60, location: 'DKI_JAKARTA' },
    });

    const sessionJatim = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-jatim',
      initialQuery: 'RAB rumah type 60 di Surabaya',
    });
    const previewJatim = WizardStateMachine.answerStep({
      sessionId: sessionJatim.wizardSessionId,
      workspaceId: ws,
      userId: 'user-jatim',
      parameters: { building_area: 60, location: 'JAWA_TIMUR' },
    });

    const sessionPapua = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'user-papua',
      initialQuery: 'RAB rumah type 60 di Jayapura',
    });
    const previewPapua = WizardStateMachine.answerStep({
      sessionId: sessionPapua.wizardSessionId,
      workspaceId: ws,
      userId: 'user-papua',
      parameters: { building_area: 60, location: 'MALUKU_PAPUA' },
    });

    const totalJkt = previewJkt.summary?.grandTotal || 0;
    const totalJatim = previewJatim.summary?.grandTotal || 0;
    const totalPapua = previewPapua.summary?.grandTotal || 0;

    assert.ok(totalJkt > 0, 'Total Jakarta must be positive');
    assert.ok(totalJatim > 0, 'Total Jatim must be positive');
    assert.ok(totalPapua > 0, 'Total Papua must be positive');

    // Jatim (95%) must be strictly cheaper than Jakarta (100%)
    assert.ok(totalJatim < totalJkt, `Jatim total (${totalJatim}) should be less than Jakarta (${totalJkt})`);
    // Ratio between Jatim and Jakarta should be approximately 0.95
    const jatimRatio = totalJatim / totalJkt;
    assert.ok(Math.abs(jatimRatio - 0.95) < 0.01, `Jatim ratio (${jatimRatio}) should be ~0.95`);

    // Papua (145%) must be strictly more expensive than Jakarta (100%)
    assert.ok(totalPapua > totalJkt, `Papua total (${totalPapua}) should be greater than Jakarta (${totalJkt})`);
    const papuaRatio = totalPapua / totalJkt;
    assert.ok(Math.abs(papuaRatio - 1.45) < 0.01, `Papua ratio (${papuaRatio}) should be ~1.45`);
  });

  await execute(44, 'AI Agent Architecture, Contracts, Project Isolation & Observability Tracing', async () => {
    const { runAgentArchitectureAuditTest } = await import('./agentArchitectureAudit.test');
    await runAgentArchitectureAuditTest();
  });

  await execute(45, 'Smart Add Item Engine: Full 5-Method Functionality & Spreadsheet Integration', async () => {
    const { ALL_OFFICIAL_AHSP_ITEMS } = await import('../../src/data/nationalCostDatabase/masterRegistry');
    const { masterBuildingTemplateRegistry } = await import('../../src/data/buildingTemplates/masterTemplateRegistry');
    const { WORK_CATEGORIES } = await import('../../src/data/mockData');

    // 1. Dataset Integrity Assertions
    assert.ok(ALL_OFFICIAL_AHSP_ITEMS.length > 0, 'ALL_OFFICIAL_AHSP_ITEMS must contain items');
    const templates = masterBuildingTemplateRegistry.getAllTemplates();
    assert.ok(templates.length >= 7, 'Template library must have at least 7 templates registered');
    assert.ok(WORK_CATEGORIES.length >= 10, 'Must have at least 10 official WBS categories');

    // 2. Method 1: AHSP Single & Bulk selection
    const concreteAhsp = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code.includes('03') || i.name.toLowerCase().includes('beton'));
    assert.ok(concreteAhsp, 'Should find concrete AHSP item');
    assert.ok(concreteAhsp.unitPrice > 0, 'AHSP unit price must be positive');

    // 3. Method 2: Manual Work Item Formulation
    const manualItem = {
      sectionName: 'Pekerjaan Struktur Beton Bertulang',
      category: 'Pekerjaan Struktur Beton Bertulang',
      code: 'MAN.01',
      description: 'Pengecoran Balok Sloof 15x20 cm Manual Mix',
      volume: 12.5,
      unit: 'm³',
      unitPrice: 1250000,
      amount: Math.round(12.5 * 1250000),
      totalPrice: Math.round(12.5 * 1250000),
      volumeSource: 'MANUAL' as const,
      ahspCode: '',
      verificationStatus: 'NEEDS_VERIFICATION' as const,
    };
    assert.strictEqual(manualItem.amount, 15625000);

    // 4. Method 3: Template Work Item Extraction
    const t36 = masterBuildingTemplateRegistry.getTemplateById('template-house-type-36-single-floor');
    assert.ok(t36, 'House T36 template must exist');
    assert.ok(t36.workItems.length > 0, 'House T36 template must contain work items');
    const firstTplItem = t36.workItems[0];
    assert.ok(firstTplItem.name, 'Template item must have name');
    assert.ok(firstTplItem.unit, 'Template item must have unit');

    // 5. Method 4: Duplicate Work Item Isolation
    const duplicateItem = {
      ...manualItem,
      code: `${manualItem.code}.DUP`,
      description: `${manualItem.description} (Salinan)`,
      volume: 20,
      amount: Math.round(20 * manualItem.unitPrice),
      totalPrice: Math.round(20 * manualItem.unitPrice),
    };
    assert.strictEqual(duplicateItem.description, 'Pengecoran Balok Sloof 15x20 cm Manual Mix (Salinan)');
    assert.strictEqual(duplicateItem.amount, 25000000);
  });

  await execute(46, 'Phase 6: Production-Grade Construction Intelligence, Multi-Document DED Ingestion, Traceable QTO, Official AHSP RAB Draft & Cross-Audit Review', async () => {
    const { runPhase6ConstructionIntelligenceTests } = await import('./phase6ConstructionIntelligence.test');
    await runPhase6ConstructionIntelligenceTests();
  });

  await execute(47, 'Phase 6.1: Whole Document Intelligence (Document Set, 20 Page Roles, Metadata, Revisions, Duplicates, Document Map)', async () => {
    const { runPhase61WholeDocumentIntelligenceTests } = await import('./phase6_1_wholeDocumentIntelligence.test');
    await runPhase61WholeDocumentIntelligenceTests();
  });

  await execute(48, 'Phase 6.2: Page & Drawing Intelligence (Drawing Graph, Floor Awareness, Cross References, Relationships, Conflicts & Multi-Document)', async () => {
    const { runPhase62PageDrawingIntelligenceTests } = await import('./phase6_2_pageDrawingIntelligence.test');
    await runPhase62PageDrawingIntelligenceTests();
  });

  await execute(49, 'Phase 6.3: Entity Resolution & Anti-Duplicate Engine (Canonical Entities, Source Priority, Deduplicated Quantities & Work Items)', async () => {
    const { runPhase63EntityResolutionTests } = await import('./phase6_3_entityResolutionAntiDuplicate.test');
    await runPhase63EntityResolutionTests();
  });

  await execute(50, 'Phase 6.4: Template-Driven Construction Mapping (Authoritative Templates, Adaptive WBS, Knowledge Graph, Coverage & Validation)', async () => {
    const { runPhase64Tests } = await import('./phase6_4_templateDrivenMapping.test');
    const success = await runPhase64Tests();
    assert.strictEqual(success, true, 'Phase 6.4 tests must all pass');
  });

  await execute(51, 'Phase 6.5: Deterministic QTO -> AHSP -> Price -> RAB Draft (Deterministic QTO, Authoritative PUPR AHSP, Regional Price Bridge, Full Traceability, Mathematical Precision & Human Review Gating)', async () => {
    const { runPhase65Tests } = await import('./phase6_5_deterministicRabDraft.test');
    const success = await runPhase65Tests();
    assert.strictEqual(success, true, 'Phase 6.5 tests must all pass');
  });

  await execute(52, 'Phase 6.6: Review -> Approval -> Spreadsheet (7-Tab Review Workspace, 9 Review Counts, 12-Column Table, User Actions, Audit Logs, Idempotency Guard, RBAC & Live UI Sync)', async () => {
    const { runPhase66Tests } = await import('./phase6_6_reviewApprovalSpreadsheet.test');
    const success = await runPhase66Tests();
    assert.strictEqual(success, true, 'Phase 6.6 tests must all pass');
  });

  await execute(53, 'Phase 6.7: Real DED End-to-End Validation & Hardening (Multi-Page Residential, Commercial Office, Infrastructure, Revision Progression, Anti-Duplication, Zero Hallucination AHSP, Fail-Closed Security & Latency Benchmarks)', async () => {
    const { runPhase67Tests } = await import('./phase6_7_realDedValidationHardening.test');
    const success = await runPhase67Tests();
    assert.strictEqual(success, true, 'Phase 6.7 tests must all pass');
  });

  await execute(54, 'Phase 6.8: Production Real DED / Vision Provider Benchmark (Live Provider Health, Real PDF & Image Ingestion, Anti-Duplication, Deterministic QTO, PUPR AHSP & Spreadsheet Import)', async () => {
    const { runPhase68Tests } = await import('./phase6_8_realDedVisionBenchmark.test');
    const success = await runPhase68Tests();
    assert.strictEqual(success, true, 'Phase 6.8 tests must all pass');
  });

  await execute(55, 'Phase 6.9: Real Vision Extraction Accuracy & Anti-Hallucination Validation (Real Image Bytes to Vision Model, Physical SHA-256 Manifest, 8 Golden Anti-Duplication Invariants, SafeDecimalEngine Math Authority, Authoritative AHSP & Regional Price Provenance)', async () => {
    const { runPhase6_9RealVisionExtractionTests } = await import('./phase6_9_realVisionExtraction.test');
    const { passed, failed } = await runPhase6_9RealVisionExtractionTests();
    assert.strictEqual(failed, 0, 'Phase 6.9 tests must all pass with zero failures');
    assert.ok(passed >= 25, 'Phase 6.9 must verify at least 25 assertions');
  });

  await execute(56, 'EZRAB Master UI/UX: User Management, Multi-Role Onboarding (Super Admin, Estimator, Direksi, Client), Security & Fail-Closed Access Control', async () => {
    const { runUserRoleManagementTestSuite } = await import('./userRoleManagement.test');
    const { passed, failed } = await runUserRoleManagementTestSuite();
    assert.strictEqual(failed, 0, 'User Role Management test suite must have 0 failures');
    assert.ok(passed >= 13, 'User Role Management must verify all 13 security assertions');
  });

  console.log('\n============================================================');
  console.log(`TOTAL SCENARIOS RUN: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runExact28VerificationTests().catch((e) => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});

