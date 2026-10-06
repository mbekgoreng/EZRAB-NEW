/**
 * EZRAB CALCULATOR CORE — GOLDEN TEST VECTORS
 * Exact, reproducible test vectors for all 19 construction calculators against the master workbook.
 */

import { MASTER_WORKBOOK_SHA256 } from '../provenance/provenanceEngine';

export interface GoldenTestVector {
  vectorId: string;
  calculatorId: string;
  legacyId: string;
  name: string;
  category: 'normal' | 'minimum' | 'large';
  sheet: string;
  workbookHash: string;
  inputs: Record<string, number>;
  expectedPrimaryQuantity: number;
  expectedBreakdown?: Record<string, number>;
  primaryUnit: string;
  sourceCell: string;
  formulaCell: string;
  notes?: string;
}

export const GOLDEN_TEST_VECTORS: GoldenTestVector[] = [
  // ==========================================
  // 01. BOWPLANK
  // Formula: I10 = 2 * (P + L + 2 * C)
  // ==========================================
  {
    vectorId: 'VEC-BOW-01-NORM',
    calculatorId: 'building.persiapan.bowplank',
    legacyId: 'BOWPLANK',
    name: 'Bowplank Normal Case (12x8m, C=0.60m)',
    category: 'normal',
    sheet: 'Bowplank',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 12, L: 8, C: 0.60, H: 1.0, R: 2.0 },
    expectedPrimaryQuantity: 42.40,
    primaryUnit: 'm',
    sourceCell: 'I10',
    formulaCell: 'I10',
    notes: '2 * (12 + 8 + 2 * 0.60) = 42.40 m',
  },
  {
    vectorId: 'VEC-BOW-02-MIN',
    calculatorId: 'building.persiapan.bowplank',
    legacyId: 'BOWPLANK',
    name: 'Bowplank Minimum Boundary Case (3x3m, C=0.30m)',
    category: 'minimum',
    sheet: 'Bowplank',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 3, L: 3, C: 0.30, H: 0.5, R: 1.0 },
    expectedPrimaryQuantity: 13.20,
    primaryUnit: 'm',
    sourceCell: 'I10',
    formulaCell: 'I10',
    notes: '2 * (3 + 3 + 2 * 0.30) = 13.20 m',
  },
  {
    vectorId: 'VEC-BOW-03-LRG',
    calculatorId: 'building.persiapan.bowplank',
    legacyId: 'BOWPLANK',
    name: 'Bowplank Large Commercial Case (50x30m, C=1.0m)',
    category: 'large',
    sheet: 'Bowplank',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 50, L: 30, C: 1.0, H: 1.2, R: 2.5 },
    expectedPrimaryQuantity: 164.00,
    primaryUnit: 'm',
    sourceCell: 'I10',
    formulaCell: 'I10',
    notes: '2 * (50 + 30 + 2 * 1.0) = 164.00 m',
  },

  // ==========================================
  // 02. PONDASI BATU KALI
  // Formula: I10 = ((a2 + b2) / 2) * c2 * P
  // ==========================================
  {
    vectorId: 'VEC-PON-01-NORM',
    calculatorId: 'building.struktur.pondasi',
    legacyId: 'PONDASI',
    name: 'Pondasi Batu Kali Normal (P=45m, Ba=0.3m, Bb=0.7m, H=0.8m)',
    category: 'normal',
    sheet: 'Pondasi',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      a1: 0.9, b1Galian: 0.9, c1: 1.05, P: 45.0, a2: 0.3, b2: 0.7, c2: 0.8,
      d: 0.2, e: 0.05, f: 0.4, urukanSamping: 25, panjangBangunan: 9, lebarBangunan: 6, tipeCampuran: 2,
    },
    expectedPrimaryQuantity: 18.00,
    primaryUnit: 'm³',
    sourceCell: 'I10',
    formulaCell: 'I10',
    notes: '((0.30 + 0.70) / 2) * 0.80 * 45 = 18.00 m³',
  },
  {
    vectorId: 'VEC-PON-02-MIN',
    calculatorId: 'building.struktur.pondasi',
    legacyId: 'PONDASI',
    name: 'Pondasi Minimum Case (P=10m, Ba=0.25m, Bb=0.50m, H=0.6m)',
    category: 'minimum',
    sheet: 'Pondasi',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      a1: 0.6, b1Galian: 0.6, c1: 0.8, P: 10.0, a2: 0.25, b2: 0.50, c2: 0.6,
      d: 0.15, e: 0.05, f: 0.2, urukanSamping: 20, panjangBangunan: 5, lebarBangunan: 4, tipeCampuran: 2,
    },
    expectedPrimaryQuantity: 2.25,
    primaryUnit: 'm³',
    sourceCell: 'I10',
    formulaCell: 'I10',
    notes: '((0.25 + 0.50) / 2) * 0.60 * 10 = 2.25 m³',
  },
  {
    vectorId: 'VEC-PON-03-LRG',
    calculatorId: 'building.struktur.pondasi',
    legacyId: 'PONDASI',
    name: 'Pondasi Large Case (P=120m, Ba=0.35m, Bb=0.85m, H=1.0m)',
    category: 'large',
    sheet: 'Pondasi',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      a1: 1.1, b1Galian: 1.1, c1: 1.2, P: 120.0, a2: 0.35, b2: 0.85, c2: 1.0,
      d: 0.20, e: 0.10, f: 0.5, urukanSamping: 30, panjangBangunan: 20, lebarBangunan: 15, tipeCampuran: 1,
    },
    expectedPrimaryQuantity: 72.00,
    primaryUnit: 'm³',
    sourceCell: 'I10',
    formulaCell: 'I10',
    notes: '((0.35 + 0.85) / 2) * 1.0 * 120 = 72.00 m³',
  },

  // ==========================================
  // 03. FOOT PLATE
  // ==========================================
  {
    vectorId: 'VEC-FTP-01-NORM',
    calculatorId: 'building.struktur.foot_plate',
    legacyId: 'FOOT_PLATE',
    name: 'Foot Plate Normal Case (N=5 titik, 0.7x0.7m tapak)',
    category: 'normal',
    sheet: 'Foot Plate',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      a1: 0.25, a2: 0.25, b1: 0.7, b2: 0.7, h1: 1.5, h2: 0.1, h3: 0.3,
      h4: 0.05, h5: 0.1, N: 5, d1: 16, d2: 16, d3: 10, diaKawat: 1.2,
      nUtama: 3, nSupport: 3, r1: 0.15, pKawat: 0.35, d4: 13, d5: 13,
      d6: 10, r2: 0.15, selimut: 0.03, massaJenis: 7850,
    },
    expectedPrimaryQuantity: 1.33,
    primaryUnit: 'm³',
    sourceCell: 'I20',
    formulaCell: 'I20',
    notes: 'Volume Total Beton Foot Plate = 1.33 m³',
  },

  // ==========================================
  // 04. SLOOF
  // Formula: Volume = b * h * P * n
  // ==========================================
  {
    vectorId: 'VEC-SLF-01-NORM',
    calculatorId: 'building.struktur.sloof',
    legacyId: 'SLOOF',
    name: 'Sloof Normal Case (b=0.20, h=0.30, P=3.0, N=5)',
    category: 'normal',
    sheet: 'Sloof',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      P: 3.0, b: 0.20, h: 0.30, n: 5, diaUtama1: 10, diaUtama2: 8,
      diaSengkang: 6, diaKawat: 1.2, nUtama1: 4, nUtama2: 2,
      sTumpuan: 15, sLapangan: 20, selimut: 2.50, pKait: 0.10,
      pOverstek: 0.30, pKawat: 0.35, massaJenis: 7850,
    },
    expectedPrimaryQuantity: 0.90,
    primaryUnit: 'm³',
    sourceCell: 'I20',
    formulaCell: 'I20',
    notes: '0.20 * 0.30 * 3.0 * 5 = 0.90 m³',
  },

  // ==========================================
  // 05. KOLOM
  // Formula: Volume = L * P * T * Jumlah
  // ==========================================
  {
    vectorId: 'VEC-KLM-01-NORM',
    calculatorId: 'building.struktur.kolom',
    legacyId: 'KOLOM',
    name: 'Kolom Normal Case (L=0.15, P=0.25, T=3.0, Jumlah=5)',
    category: 'normal',
    sheet: 'Kolom',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      T: 3.00, L: 0.15, P: 0.25, Jumlah: 5, diaUtama: 12, diaSupport: 10,
      diaSengkang: 8, diaKawat: 1.2, nUtama: 4, nSupport: 2,
      jarakSengkang: 15, selimut: 2.50, pKaitAtas: 0.12, pKaitBawah: 0.12,
      pKawat: 0.35, massaJenis: 7850,
    },
    expectedPrimaryQuantity: 0.56,
    primaryUnit: 'm³',
    sourceCell: 'I20',
    formulaCell: 'I20',
    notes: '0.15 * 0.25 * 3.00 * 5 = 0.56 m³',
  },

  // ==========================================
  // 06. BALOK
  // Formula: Volume = b * h * L
  // ==========================================
  {
    vectorId: 'VEC-BLK-01-NORM',
    calculatorId: 'building.struktur.balok',
    legacyId: 'BALOK',
    name: 'Balok Normal Case (L=36.0, b=0.20, h=0.35)',
    category: 'normal',
    sheet: 'Balok',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      L: 36.0, b: 0.20, h: 0.35, nUtama: 6, diaUtama: 12,
      diaSengkang: 8, jarakSengkang: 15,
    },
    expectedPrimaryQuantity: 2.52,
    primaryUnit: 'm³',
    sourceCell: 'I20',
    formulaCell: 'I20',
    notes: '0.20 * 0.35 * 36.0 = 2.52 m³',
  },

  // ==========================================
  // 07. BATA RINGAN
  // Formula: (Pi + Pe)*T + Ampig - Bukaan
  // ==========================================
  {
    vectorId: 'VEC-BTR-01-NORM',
    calculatorId: 'building.arsitektur.bata_ringan',
    legacyId: 'BATA_RINGAN',
    name: 'Bata Ringan Normal Case (Pi=36, Pe=39, T=3.8)',
    category: 'normal',
    sheet: 'Bata Ringan',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: {
      Pi: 36.0, Pe: 39.0, T: 3.80, aPintu: 2.10, bPintu: 0.90, jmlPintu: 6,
      mJendela: 1.50, m1Jendela: 0.70, jmlJendela: 7, xBouven: 0.20, yBouven: 0.30, jmlBouven: 26,
      T2Ampig: 2.30, a2Ampig: 9.00, jmlAmpig: 2, tebalPilihan: 1,
    },
    expectedPrimaryQuantity: 285.45,
    primaryUnit: 'm²',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: 'Luas Pasangan Dinding Netto = 285.45 m²',
  },

  // ==========================================
  // 08. BATA MERAH
  // ==========================================
  {
    vectorId: 'VEC-BTM-01-NORM',
    calculatorId: 'building.arsitektur.bata_merah',
    legacyId: 'BATA_MERAH',
    name: 'Bata Merah Normal Case (P=32.0, H=3.50, Abukaan=14.50, Asop=6.0)',
    category: 'normal',
    sheet: 'Bata Merah',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 32.0, H: 3.50, Abukaan: 14.50, Asop: 6.0 },
    expectedPrimaryQuantity: 103.50,
    primaryUnit: 'm²',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: '(32.0 * 3.50) - 14.50 + 6.0 = 103.50 m²',
  },

  // ==========================================
  // 09. BATAKO
  // ==========================================
  {
    vectorId: 'VEC-BTK-01-NORM',
    calculatorId: 'building.arsitektur.batako',
    legacyId: 'BATAKO',
    name: 'Batako Normal Case (P=28.0, H=3.00, Abukaan=8.0, Asop=4.0)',
    category: 'normal',
    sheet: 'Batako',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 28.0, H: 3.00, Abukaan: 8.0, Asop: 4.0 },
    expectedPrimaryQuantity: 80.00,
    primaryUnit: 'm²',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: '(28.0 * 3.00) - 8.0 + 4.0 = 80.00 m²',
  },

  // ==========================================
  // 10. PINTU & JENDELA
  // ==========================================
  {
    vectorId: 'VEC-PJN-01-NORM',
    calculatorId: 'building.arsitektur.pintu_jendela',
    legacyId: 'PINTU_JENDELA',
    name: 'Pintu & Jendela Normal Case (PU=1, PK=4, PKM=2, JG=3, JT=4)',
    category: 'normal',
    sheet: 'Pintu & Jendela',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { nPintuUtama: 1, nPintuKamar: 4, nPintuKM: 2, nJendelaGanda: 3, nJendelaTunggal: 4 },
    expectedPrimaryQuantity: 20.41,
    primaryUnit: 'm²',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: 'Luas Total Daun Pintu & Jendela = 20.41 m²',
  },

  // ==========================================
  // 11. ATAP BAJA RINGAN
  // ==========================================
  {
    vectorId: 'VEC-ATP-01-NORM',
    calculatorId: 'building.arsitektur.atap_baja_ringan',
    legacyId: 'ATAP_BAJA_RINGAN',
    name: 'Atap Baja Ringan Normal Case (12x8m, Ov=0.8m, Sudut=30°)',
    category: 'normal',
    sheet: 'Atap Baja Ringan',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 12.0, L: 8.0, overhang: 0.8, sudutKemiringan: 30 },
    expectedPrimaryQuantity: 150.76,
    primaryUnit: 'm²',
    sourceCell: 'I8',
    formulaCell: 'I8',
    notes: '((12 + 1.6) * (8 + 1.6)) / cos(30°) = 150.76 m²',
  },

  // ==========================================
  // 12. PLESTERAN & ACIAN
  // ==========================================
  {
    vectorId: 'VEC-PLS-01-NORM',
    calculatorId: 'building.finishing.plesteran_acian',
    legacyId: 'PLESTERAN_ACIAN',
    name: 'Plesteran & Acian Normal Case (105 m2 x 2 sisi)',
    category: 'normal',
    sheet: 'Plesteran & Acian',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { luasDinding: 105.0, duaSisi: 1 },
    expectedPrimaryQuantity: 210.00,
    primaryUnit: 'm²',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: '105.0 * 2 = 210.00 m²',
  },

  // ==========================================
  // 13. PENUTUP LANTAI
  // ==========================================
  {
    vectorId: 'VEC-LNT-01-NORM',
    calculatorId: 'building.finishing.penutup_lantai',
    legacyId: 'PENUTUP_LANTAI',
    name: 'Penutup Lantai Normal Case (10x8m)',
    category: 'normal',
    sheet: 'Penutup Lantai',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 10.0, L: 8.0, tipeUbin: 1 },
    expectedPrimaryQuantity: 80.00,
    primaryUnit: 'm²',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: '10.0 * 8.0 = 80.00 m²',
  },

  // ==========================================
  // 14. PENUTUP DINDING
  // ==========================================
  {
    vectorId: 'VEC-DND-01-NORM',
    calculatorId: 'building.finishing.penutup_dinding',
    legacyId: 'PENUTUP_DINDING',
    name: 'Penutup Dinding Keramik Normal Case (K=8m, H=2.4m, Abukaan=1.8m2)',
    category: 'normal',
    sheet: 'Penutup Dinding',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { K: 8.0, H: 2.40, Abukaan: 1.80 },
    expectedPrimaryQuantity: 18.27,
    primaryUnit: 'm²',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: '((8.0 * 2.40) - 1.80) * 1.05 = 18.27 m²',
  },

  // ==========================================
  // 15. PLAFON
  // ==========================================
  {
    vectorId: 'VEC-PLF-01-NORM',
    calculatorId: 'building.finishing.plafon',
    legacyId: 'PLAFON',
    name: 'Plafon Gypsum Normal Case (10x8m)',
    category: 'normal',
    sheet: 'Plafon',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { P: 10.0, L: 8.0, tipePlafon: 1 },
    expectedPrimaryQuantity: 80.00,
    primaryUnit: 'm²',
    sourceCell: 'J8',
    formulaCell: 'J8',
    notes: '10.0 * 8.0 = 80.00 m²',
  },

  // ==========================================
  // 16. PENGECATAN
  // ==========================================
  {
    vectorId: 'VEC-CAT-01-NORM',
    calculatorId: 'building.finishing.pengecatan',
    legacyId: 'PENGECATAN',
    name: 'Pengecatan Normal Case (Lint=140, Leks=70, Lplf=80)',
    category: 'normal',
    sheet: 'Pengecatan',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { luasInterior: 140.0, luasEksterior: 70.0, luasPlafon: 80.0 },
    expectedPrimaryQuantity: 290.00,
    primaryUnit: 'm²',
    sourceCell: 'J20',
    formulaCell: 'J20',
    notes: '140.0 + 70.0 + 80.0 = 290.00 m²',
  },

  // ==========================================
  // 17. KELISTRIKAN
  // ==========================================
  {
    vectorId: 'VEC-ELC-01-NORM',
    calculatorId: 'building.mep.kelistrikan',
    legacyId: 'KELISTRIKAN',
    name: 'Kelistrikan Normal Case (18 Lampu + 12 SK + 6 S1 + 4 S2)',
    category: 'normal',
    sheet: 'Kelistrikan',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { nLampu: 18, nStopKontak: 12, nSaklarTunggal: 6, nSaklarGanda: 4, nMcb: 4 },
    expectedPrimaryQuantity: 40.00,
    primaryUnit: 'titik',
    sourceCell: 'N9',
    formulaCell: 'N9',
    notes: '18 + 12 + 6 + 4 = 40 titik',
  },

  // ==========================================
  // 18. INSTALASI AIR BERSIH
  // ==========================================
  {
    vectorId: 'VEC-AIR-01-NORM',
    calculatorId: 'building.mep.instalasi_air',
    legacyId: 'AIR_BERSIH',
    name: 'Instalasi Air Bersih Normal Case (24m Utama + 32m Cabang)',
    category: 'normal',
    sheet: 'Instalasi Air Bersih',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { pjgPipaUtama: 24.0, pjgPipaCabang: 32.0, nKran: 8 },
    expectedPrimaryQuantity: 56.00,
    primaryUnit: 'm',
    sourceCell: 'M8',
    formulaCell: 'M8',
    notes: '24.0 + 32.0 = 56.00 m',
  },

  // ==========================================
  // 19. SANITAIR
  // ==========================================
  {
    vectorId: 'VEC-SAN-01-NORM',
    calculatorId: 'building.mep.sanitair',
    legacyId: 'SANITAIR',
    name: 'Sanitair Normal Case (2 KD + 0 KJ + 2 W + 3 FD + 2 Shower)',
    category: 'normal',
    sheet: 'Sanitair',
    workbookHash: MASTER_WORKBOOK_SHA256,
    inputs: { nKlosetDuduk: 2, nKlosetJongkok: 0, nWastafel: 2, nFloorDrain: 3, nShowerSet: 2 },
    expectedPrimaryQuantity: 9.00,
    primaryUnit: 'unit',
    sourceCell: 'E14',
    formulaCell: 'E14',
    notes: '2 + 0 + 2 + 3 + 2 = 9 unit',
  },
];
