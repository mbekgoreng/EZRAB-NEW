import fs from 'fs';
import path from 'path';
import { exportProjectToPDF } from '../../src/export/pdfExporter';
import { Project, Company } from '../../src/types';

// Real-world multi-division construction project
const sampleCompany: Company = {
  id: 'comp-ezrab',
  name: 'PT NUSA KONSTRUKSI PERSADA',
  address: 'Grand Slipi Tower Lt. 15, Jl. S. Parman, Jakarta Barat',
  phone: '+62 21 5366-8899',
  email: 'tender@nusakonstruksi.co.id',
  website: 'https://nusakonstruksi.co.id',
  taxNumber: '01.345.678.9-085.000',
  directorName: 'Ir. M. Bambang Sugito, M.T.',
  leadEstimatorName: 'Ahmad Yusuf, S.T. (Lead QS)',
  defaultOverheadPercent: 5,
  defaultProfitPercent: 10,
  defaultContingencyPercent: 0,
  defaultTaxPercent: 11,
};

const flagshipProject: Project = {
  id: 'PRJ-FLAGSHIP-2026',
  projectNumber: 'RAB-2026-NKP-001',
  name: 'Pembangunan Gedung Laboratorium & Workshop Teknik 4 Lantai',
  location: 'Kawasan Industri Cikarang, Jawa Barat',
  clientName: 'Kementerian Riset & Perindustrian RI',
  buildingType: 'Gedung Kantor',
  currentVersion: 'Rev 2.1 (FINAL)',
  status: 'approved',
  buildingArea: 1450,
  landArea: 2200,
  sections: [
    {
      id: 'sec-1',
      code: 'DIV-01',
      name: 'Pekerjaan Persiapan & Sistem Manajemen K3 Konstruksi',
      subtotal: 48500000,
      items: [
        {
          id: 'it-1',
          sectionId: 'sec-1',
          itemNumber: '1.1',
          code: 'A.2.2.1.1',
          description: 'Pembersihan dan perataan lahan kerja dengan bulldozer 120 HP',
          volume: 2200,
          unit: 'm²',
          materialPrice: 0,
          laborPrice: 12500,
          equipmentPrice: 0,
          unitPrice: 12500,
          totalPrice: 27500000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-2',
          sectionId: 'sec-1',
          itemNumber: '1.2',
          code: 'A.2.2.1.9',
          description: 'Pengukuran dan pemasangan bouwplank kayu meranti kaso 5/7 waterpass',
          volume: 280,
          unit: 'm¹',
          materialPrice: 45000,
          laborPrice: 30000,
          equipmentPrice: 0,
          unitPrice: 75000,
          totalPrice: 21000000,
          verificationStatus: 'VERIFIED',
        },
      ],
    },
    {
      id: 'sec-2',
      code: 'DIV-02',
      name: 'Pekerjaan Tanah, Galian & Pondasi Bored Pile',
      subtotal: 382000000,
      items: [
        {
          id: 'it-3',
          sectionId: 'sec-2',
          itemNumber: '2.1',
          code: 'A.2.3.1.2',
          description: 'Galian tanah basement & pile cap kedalaman s/d 3 meter dengan excavator',
          volume: 1850,
          unit: 'm³',
          materialPrice: 0,
          laborPrice: 65000,
          equipmentPrice: 0,
          unitPrice: 65000,
          totalPrice: 120250000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-4',
          sectionId: 'sec-2',
          itemNumber: '2.2',
          code: 'A.2.3.2.5',
          description: 'Pondasi tiang bor (Bored Pile) diameter 60 cm kedalaman 18 m mutu f\'c 30 MPa',
          volume: 48,
          unit: 'titik',
          materialPrice: 3800000,
          laborPrice: 1653125,
          equipmentPrice: 0,
          unitPrice: 5453125,
          totalPrice: 261750000,
          verificationStatus: 'VERIFIED',
        },
      ],
    },
    {
      id: 'sec-3',
      code: 'DIV-03',
      name: 'Pekerjaan Struktur Beton Bertulang (Substructure & Upperstructure)',
      subtotal: 945000000,
      items: [
        {
          id: 'it-5',
          sectionId: 'sec-3',
          itemNumber: '3.1',
          code: 'A.4.1.1.8',
          description: 'Beton ready mix f\'c 30 MPa (K-350) slump 12±2 cm untuk Pile Cap & Tie Beam',
          volume: 240,
          unit: 'm³',
          materialPrice: 1180000,
          laborPrice: 170000,
          equipmentPrice: 0,
          unitPrice: 1350000,
          totalPrice: 324000000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-6',
          sectionId: 'sec-3',
          itemNumber: '3.2',
          code: 'A.4.1.1.17',
          description: 'Baja tulangan ulir sirip BJTS 420B diameter D13, D16, D19, D25 terpasang',
          volume: 25000,
          unit: 'kg',
          materialPrice: 15500,
          laborPrice: 3500,
          equipmentPrice: 0,
          unitPrice: 19000,
          totalPrice: 475000000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-7',
          sectionId: 'sec-3',
          itemNumber: '3.3',
          code: 'A.4.1.1.22',
          description: 'Bekisting balok dan plat lantai 2-4 menggunakan plywood film-faced 15 mm + scaffolding',
          volume: 820,
          unit: 'm²',
          materialPrice: 110000,
          laborPrice: 68048,
          equipmentPrice: 0,
          unitPrice: 178048,
          totalPrice: 146000000,
          verificationStatus: 'VERIFIED',
        },
      ],
    },
    {
      id: 'sec-4',
      code: 'DIV-04',
      name: 'Pekerjaan Arsitektur, Dinding & Finishing Eksterior',
      subtotal: 412500000,
      items: [
        {
          id: 'it-8',
          sectionId: 'sec-4',
          itemNumber: '4.1',
          code: 'A.4.4.1.2',
          description: 'Pasangan dinding bata ringan aerasi (AAC Hebel) tebal 10 cm dengan perekat thin bed mortar',
          volume: 1250,
          unit: 'm²',
          materialPrice: 98000,
          laborPrice: 42000,
          equipmentPrice: 0,
          unitPrice: 140000,
          totalPrice: 175000000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-9',
          sectionId: 'sec-4',
          itemNumber: '4.2',
          code: 'A.4.4.3.5',
          description: 'Pemasangan lantai homogeneous tile 60×60 cm unpolished anti-slip koridor & workshop',
          volume: 850,
          unit: 'm²',
          materialPrice: 185000,
          laborPrice: 65000,
          equipmentPrice: 0,
          unitPrice: 250000,
          totalPrice: 212500000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-10',
          sectionId: 'sec-4',
          itemNumber: '4.3',
          code: 'A.4.7.1.1',
          description: 'Pengecatan dinding eksterior dengan cat weatherproof tahan alkali 3 lapis',
          volume: 500,
          unit: 'm²',
          materialPrice: 32000,
          laborPrice: 18000,
          equipmentPrice: 0,
          unitPrice: 50000,
          totalPrice: 25000000,
          verificationStatus: 'VERIFIED',
        },
      ],
    },
    {
      id: 'sec-5',
      code: 'DIV-05',
      name: 'Pekerjaan Mekanikal, Elektrikal & Plumbing (MEP)',
      subtotal: 295000000,
      items: [
        {
          id: 'it-11',
          sectionId: 'sec-5',
          itemNumber: '5.1',
          code: 'MEP.EL.01',
          description: 'Instalasi panel utama LVMDP 3 Phasa 400 kVA + penyalur petir elektrostatis radius 100 m',
          volume: 1,
          unit: 'unit',
          materialPrice: 125000000,
          laborPrice: 25000000,
          equipmentPrice: 0,
          unitPrice: 150000000,
          totalPrice: 150000000,
          verificationStatus: 'VERIFIED',
        },
        {
          id: 'it-12',
          sectionId: 'sec-5',
          itemNumber: '5.2',
          code: 'MEP.PL.03',
          description: 'Instalasi pipa air bersih PPR PN-10 diameter 1" s/d 3" dan sistem pompa booster otomatis',
          volume: 1,
          unit: 'ls',
          materialPrice: 110000000,
          laborPrice: 35000000,
          equipmentPrice: 0,
          unitPrice: 145000000,
          totalPrice: 145000000,
          verificationStatus: 'VERIFIED',
        },
      ],
    },
  ],
};

async function generateVerificationPdfs() {
  const outputDir = path.resolve(process.cwd(), 'tmp', 'pdf_verification');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating Real Verification PDFs...');

  // 1. FREE TIER PDF
  const freeDoc = await exportProjectToPDF(flagshipProject, sampleCompany, {
    subscriptionPlan: 'free',
    isWatermarkRequired: true,
  });
  const freePath = path.join(outputDir, 'flagship_project_free_tier.pdf');
  const freeBytes = freeDoc.output('arraybuffer');
  fs.writeFileSync(freePath, Buffer.from(freeBytes));
  console.log(`[SAVED] Free Tier PDF: ${freePath} (${freeDoc.getNumberOfPages()} halaman)`);

  // 2. PAID TIER PDF (with custom company logo)
  const paidDoc = await exportProjectToPDF(flagshipProject, sampleCompany, {
    subscriptionPlan: 'pro',
    isWatermarkRequired: false,
    companyLogoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  });
  const paidPath = path.join(outputDir, 'flagship_project_paid_tier.pdf');
  const paidBytes = paidDoc.output('arraybuffer');
  fs.writeFileSync(paidPath, Buffer.from(paidBytes));
  console.log(`[SAVED] Paid Tier PDF: ${paidPath} (${paidDoc.getNumberOfPages()} halaman)`);
}

generateVerificationPdfs().catch(console.error);
