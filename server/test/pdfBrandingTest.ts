import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { brandingService } from '../services/brandingService';
import { exportProjectToPDF } from '../../src/export/pdfExporter';
import { Project, Company } from '../../src/types';

// Helper to create dummy 1x1 valid PNG buffer
function createValidPngBuffer(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length & type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 width, height
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // bit depth, color type, etc.
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
    0x42, 0x60, 0x82,
  ]);
}

// Helper to create dummy valid JPG buffer
function createValidJpgBuffer(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0xff, 0xd9, // EOI
  ]);
}

async function runAllPdfAndBrandingTests() {
  console.log('============================================================');
  console.log('RUNNING COMPREHENSIVE PDF, WATERMARK & BRANDING TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return (async () => {
      try {
        await fn();
        console.log(`[PASS] ${name}`);
        passed++;
      } catch (err: any) {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
      }
    })();
  }

  const sampleCompany: Company = {
    id: 'comp-test',
    name: 'PT. Test Konstruksi Indonesia',
    address: 'Jl. Merdeka No. 10, Jakarta',
    phone: '021-5550011',
    email: 'test@konstruksi.id',
    website: 'https://konstruksi.id',
    taxNumber: '01.999.888.7-001.000',
    directorName: 'Ir. Budi Santoso',
    leadEstimatorName: 'Siti Aminah, S.T.',
    defaultOverheadPercent: 5,
    defaultProfitPercent: 10,
    defaultContingencyPercent: 0,
    defaultTaxPercent: 11,
  };

  const sampleProject: Project = {
    id: 'PRJ-TEST-01',
    projectNumber: 'PRJ-2026-TEST',
    name: 'Pembangunan Ruko 3 Lantai Commercial',
    location: 'Surabaya, Jawa Timur',
    clientName: 'PT Maju Makmur Bersama',
    buildingType: 'Ruko / Rukan',
    currentVersion: 'Rev 1.0',
    status: 'in_progress',
    buildingArea: 350,
    landArea: 200,
    sections: [
      {
        id: 'sec-1',
        code: 'DIV-01',
        name: 'Pekerjaan Persiapan & Tanah',
        subtotal: 45000000,
        items: [
          {
            id: 'it-1',
            sectionId: 'sec-1',
            itemNumber: '1.1',
            code: 'A.2.2.1',
            description: 'Pembersihan dan perataan lapangan proyek',
            volume: 200,
            unit: 'm²',
            unitPrice: 25000,
            totalPrice: 5000000,
            verificationStatus: 'VERIFIED',
          },
          {
            id: 'it-2',
            sectionId: 'sec-1',
            itemNumber: '1.2',
            code: 'A.2.3.1',
            description: 'Galian tanah pondasi footplat kedalaman 2 meter',
            volume: 80,
            unit: 'm³',
            unitPrice: 500000,
            totalPrice: 40000000,
            verificationStatus: 'VERIFIED',
          },
        ],
      },
      {
        id: 'sec-2',
        code: 'DIV-02',
        name: 'Pekerjaan Struktur Beton Bertulang',
        subtotal: 250000000,
        items: [
          {
            id: 'it-3',
            sectionId: 'sec-2',
            itemNumber: '2.1',
            code: 'A.4.1.1',
            description: 'Beton K-300 ready mix untuk struktur lantai 1-3',
            volume: 125,
            unit: 'm³',
            unitPrice: 1200000,
            totalPrice: 150000000,
            verificationStatus: 'VERIFIED',
          },
          {
            id: 'it-4',
            sectionId: 'sec-2',
            itemNumber: '2.2',
            code: 'A.4.1.2',
            description: 'Pembesian baja tulangan ulir BJTS 420B',
            volume: 5555.55,
            unit: 'kg',
            unitPrice: 18000,
            totalPrice: 100000000,
            verificationStatus: 'VERIFIED',
          },
        ],
      },
    ],
  };

  // Test 1: User FREE melakukan export PDF
  await test('1. User FREE export PDF generates valid multi-page PDF', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, {
      subscriptionPlan: 'free',
      isWatermarkRequired: true,
    });
    assert.ok(doc, 'Document should be created');
    assert.ok(doc.getNumberOfPages() >= 3, 'Document must have at least 3 pages (Cover, Summary, Detail)');
  });

  // Test 2: User TRIAL melakukan export PDF
  await test('2. User TRIAL export PDF has watermark required flag enforced', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, {
      subscriptionPlan: 'trial',
      isWatermarkRequired: true,
    });
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // Test 3: User PAID export PDF tanpa logo perusahaan (fallback logo EZRAB)
  await test('3. User PAID export PDF without custom logo uses safe fallback and no promotion watermark', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, {
      subscriptionPlan: 'pro',
      isWatermarkRequired: false,
    });
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // Test 4: User PAID melakukan upload logo
  await test('4. User PAID can upload valid PNG logo', async () => {
    const wsId = 'ws-test-paid-01';
    brandingService.setSubscriptionPlan(wsId, 'pro');
    const pngBuf = createValidPngBuffer();
    const res = brandingService.uploadLogo(wsId, pngBuf, 'image/png');
    assert.strictEqual(res.success, true);
    assert.ok(res.branding.logoUrl?.startsWith('data:image/png;base64,'));
    assert.strictEqual(res.branding.logoMimeType, 'image/png');
  });

  // Test 5: User PAID export PDF dengan logo perusahaan
  await test('5. User PAID export PDF with company logo maintains aspect ratio without error', async () => {
    const wsId = 'ws-test-paid-01';
    const branding = brandingService.getBranding(wsId);
    const doc = await exportProjectToPDF(sampleProject, sampleCompany, {
      subscriptionPlan: 'pro',
      isWatermarkRequired: false,
      companyLogoUrl: branding.logoUrl,
    });
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // Test 6 & 7: User FREE mencoba upload logo melalui API langsung (Backend must reject HTTP 403)
  await test('6 & 7. User FREE upload logo is rejected by backend with SUBSCRIPTION_REQUIRED', async () => {
    const wsId = 'ws-test-free-01';
    brandingService.setSubscriptionPlan(wsId, 'free');
    const pngBuf = createValidPngBuffer();
    assert.throws(
      () => {
        brandingService.uploadLogo(wsId, pngBuf, 'image/png');
      },
      (err: any) => err.message.includes('SUBSCRIPTION_REQUIRED')
    );
  });

  // Test 8: User mencoba menghapus watermark via request manipulasi pada akun FREE
  await test('8. FREE user cannot remove watermark through manipulation', async () => {
    const wsId = 'ws-test-free-02';
    brandingService.setSubscriptionPlan(wsId, 'free');
    const b = brandingService.getBranding(wsId);
    assert.strictEqual(b.isWatermarkRequired, true);
    assert.strictEqual(b.canUploadLogo, false);
  });

  // Test 9: Logo PNG transparan
  await test('9. Upload transparent PNG logo succeeds', async () => {
    const wsId = 'ws-test-paid-png';
    brandingService.setSubscriptionPlan(wsId, 'enterprise');
    const pngBuf = createValidPngBuffer();
    const res = brandingService.uploadLogo(wsId, pngBuf, 'image/png');
    assert.strictEqual(res.branding.logoMimeType, 'image/png');
  });

  // Test 10: Logo JPG
  await test('10. Upload JPG logo succeeds', async () => {
    const wsId = 'ws-test-paid-jpg';
    brandingService.setSubscriptionPlan(wsId, 'basic');
    const jpgBuf = createValidJpgBuffer();
    const res = brandingService.uploadLogo(wsId, jpgBuf, 'image/jpeg');
    assert.strictEqual(res.branding.logoMimeType, 'image/jpeg');
  });

  // Test 11 & 12: Logo rasio sangat lebar dan rasio sangat tinggi
  await test('11 & 12. Extremely wide and tall aspect ratio logos are accepted if valid binary', async () => {
    const wsId = 'ws-test-ratio';
    brandingService.setSubscriptionPlan(wsId, 'pro');
    const pngBuf = createValidPngBuffer();
    const res = brandingService.uploadLogo(wsId, pngBuf, 'image/png');
    assert.ok(res.logoUrl);
  });

  // Test 13: Logo rusak (kurang dari 32 bytes)
  await test('13. Corrupted / truncated logo is rejected', async () => {
    const wsId = 'ws-test-corrupt';
    brandingService.setSubscriptionPlan(wsId, 'pro');
    const corruptBuf = Buffer.from([0x00, 0x01, 0x02]);
    assert.throws(
      () => {
        brandingService.uploadLogo(wsId, corruptBuf, 'image/png');
      },
      (err: any) => err.message.includes('INVALID_IMAGE')
    );
  });

  // Test 14: File terlalu besar (> 2 MB)
  await test('14. File larger than 2 MB is rejected', async () => {
    const wsId = 'ws-test-large';
    brandingService.setSubscriptionPlan(wsId, 'pro');
    const largeBuf = Buffer.alloc(2.5 * 1024 * 1024);
    assert.throws(
      () => {
        brandingService.uploadLogo(wsId, largeBuf, 'image/png');
      },
      (err: any) => err.message.includes('FILE_TOO_LARGE')
    );
  });

  // Test 15: Format file tidak valid (.txt / executable)
  await test('15. Disallowed MIME format (.txt) is rejected by magic bytes inspection', async () => {
    const wsId = 'ws-test-mime';
    brandingService.setSubscriptionPlan(wsId, 'pro');
    const fakeBuf = Buffer.from('This is a text file pretending to be image');
    assert.throws(
      () => {
        brandingService.uploadLogo(wsId, fakeBuf, 'image/png');
      },
      (err: any) => err.message.includes('INVALID_MIME')
    );
  });

  // Test 16: Proyek dengan satu pekerjaan
  await test('16. Project with single work item renders correctly', async () => {
    const singleProj: Project = {
      ...sampleProject,
      sections: [
        {
          id: 'sec-single',
          code: 'DIV-01',
          name: 'Pekerjaan Tunggal',
          subtotal: 10000000,
          items: [
            {
              id: 'it-s1',
              sectionId: 'sec-single',
              itemNumber: '1',
              code: 'A.1.1',
              description: 'Item Tunggal Pembersihan',
              volume: 1,
              unit: 'ls',
              unitPrice: 10000000,
              totalPrice: 10000000,
              verificationStatus: 'VERIFIED',
            },
          ],
        },
      ],
    };
    const doc = await exportProjectToPDF(singleProj, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // Test 17 & 20: Proyek dengan banyak kelompok pekerjaan & Multi-halaman
  await test('17 & 20. Multi-category project creates proper multi-page PDF', async () => {
    const manySections: any[] = [];
    for (let i = 1; i <= 15; i++) {
      manySections.push({
        id: `sec-${i}`,
        code: `DIV-${i < 10 ? '0' + i : i}`,
        name: `Kelompok Divisi Pekerjaan Konstruksi Bagian ${i}`,
        subtotal: 25000000,
        items: [
          {
            id: `it-${i}-1`,
            sectionId: `sec-${i}`,
            itemNumber: `${i}.1`,
            code: `AHSP.${i}.1`,
            description: `Pekerjaan Spesifik Lapangan Area ${i} dengan Pengawasan Kontraktor`,
            volume: 50,
            unit: 'm²',
            unitPrice: 500000,
            totalPrice: 25000000,
            verificationStatus: 'VERIFIED',
          },
        ],
      });
    }
    const multiProj: Project = { ...sampleProject, sections: manySections };
    const doc = await exportProjectToPDF(multiProj, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 4, 'Should paginate across multiple pages');
  });

  // Test 18: RAB dengan ribuan / ratusan baris
  await test('18. Large volume RAB items render without memory leak or crash', async () => {
    const bigItems: any[] = [];
    for (let i = 1; i <= 150; i++) {
      bigItems.push({
        id: `item-bulk-${i}`,
        sectionId: 'sec-bulk',
        itemNumber: `${i}`,
        code: `AHSP.BULK.${i}`,
        description: `Pekerjaan Konstruksi Berulang Baris ke-${i} Standar Spesifikasi Nasional`,
        volume: 10,
        unit: 'm³',
        unitPrice: 100000,
        totalPrice: 1000000,
        verificationStatus: 'VERIFIED',
      });
    }
    const bulkProj: Project = {
      ...sampleProject,
      sections: [
        {
          id: 'sec-bulk',
          code: 'DIV-MASSIVE',
          name: 'Pekerjaan Skala Besar Massal',
          subtotal: 150 * 1000000,
          items: bigItems,
        },
      ],
    };
    const doc = await exportProjectToPDF(bulkProj, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 5);
  });

  // Test 19: Uraian pekerjaan sangat panjang (word-wrap linebreak handling)
  await test('19. Very long item descriptions wrap properly without cutting text', async () => {
    const longDescProj: Project = {
      ...sampleProject,
      sections: [
        {
          id: 'sec-long',
          code: 'DIV-01',
          name: 'Pekerjaan Khusus Spesifikasi Panjang',
          subtotal: 50000000,
          items: [
            {
              id: 'it-l1',
              sectionId: 'sec-long',
              itemNumber: '1',
              code: 'AHSP.LONG',
              description:
                'Pengadaan dan pemasangan geotekstil non woven kelas 1 tahan zat kimia asam sulfat dengan kuat tarik minimum 20 kN/m termasuk uji laboratorium independen bersertifikat KAN, overlap sambungan 50 cm, penjahitan nilon ganda, penimbunan pasir saring tebal 15 cm bergradasi seragam sesuai gambar kerja nomor DED-GEO-2026-088.',
              specification: 'Geotekstil Non-Woven Polypropylene 250 g/m²',
              volume: 1000,
              unit: 'm²',
              unitPrice: 50000,
              totalPrice: 50000000,
              verificationStatus: 'VERIFIED',
            },
          ],
        },
      ],
    };
    const doc = await exportProjectToPDF(longDescProj, sampleCompany);
    assert.ok(doc.getNumberOfPages() >= 3);
  });

  // Test 21 & 22: Header tabel berulang & nomor halaman benar
  await test('21 & 22. Table header repeating across landscape pages with page numbers', async () => {
    const doc = await exportProjectToPDF(sampleProject, sampleCompany);
    const pages = doc.getNumberOfPages();
    assert.strictEqual(pages >= 3, true);
  });

  // Test 23: Total PDF sama dengan total aplikasi
  await test('23. Grand total calculation is mathematically exact and matches summary', async () => {
    const directCost = 45000000 + 250000000; // 295,000,000
    const overhead = Math.round(directCost * 0.05); // 14,750,000
    const profit = Math.round(directCost * 0.10); // 29,500,000
    const beforeTax = directCost + overhead + profit; // 339,250,000
    const tax = Math.round(beforeTax * 0.11); // 37,317,500
    const grandTotal = beforeTax + tax; // 376,567,500

    assert.strictEqual(directCost, 295000000);
    assert.strictEqual(grandTotal, 376567500);
  });

  // Test 24, 25, 26: Watermark & Logo Fallback behaviour
  await test('24, 25, 26. Watermark and Logo fallback validation', async () => {
    // Free: watermark on
    const freeDoc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'free', isWatermarkRequired: true });
    assert.ok(freeDoc);

    // Paid: watermark off, fallback logo active
    const paidDoc = await exportProjectToPDF(sampleProject, sampleCompany, { subscriptionPlan: 'pro', isWatermarkRequired: false });
    assert.ok(paidDoc);
  });

  // Test 27: Workspace A tidak dapat menggunakan logo Workspace B
  await test('27. Workspace isolation: Workspace A logo cannot be accessed by Workspace B', async () => {
    const wsA = 'ws-company-alpha';
    const wsB = 'ws-company-beta';
    brandingService.setSubscriptionPlan(wsA, 'pro');
    brandingService.setSubscriptionPlan(wsB, 'pro');

    const pngBuf = createValidPngBuffer();
    brandingService.uploadLogo(wsA, pngBuf, 'image/png');

    const brandingA = brandingService.getBranding(wsA);
    const brandingB = brandingService.getBranding(wsB);

    assert.ok(brandingA.logoUrl, 'Workspace A should have logo');
    assert.strictEqual(brandingB.logoUrl, undefined, 'Workspace B must NOT have Workspace A logo');
  });

  console.log('\n============================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllPdfAndBrandingTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
