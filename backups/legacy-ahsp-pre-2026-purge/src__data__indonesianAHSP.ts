import { AHSPItem } from '../types';

export const MASTER_AHSP_DATABASE: AHSPItem[] = [
  // A. PEKERJAAN PERSIAPAN
  {
    id: 'AHSP-A01',
    code: 'A.2.2.1.1',
    name: '1 m² Pembersihan Lapangan dan Perataan Lahan',
    category: 'PEKERJAAN PERSIAPAN',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-1', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.100, unitPrice: 135000, total: 13500 },
      { id: 'c-2', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.050, unitPrice: 235000, total: 11750 },
    ],
    materialComponents: [],
    equipmentComponents: [],
    totalLabor: 25250,
    totalMaterial: 0,
    totalEquipment: 0,
    unitPrice: 25250,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-A02',
    code: 'A.2.2.1.4',
    name: '1 m¹ Pengukuran dan Pemasangan Bouwplank',
    category: 'PEKERJAAN PERSIAPAN',
    unit: 'm¹',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-3', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.100, unitPrice: 135000, total: 13500 },
      { id: 'c-4', code: 'TK-004', name: 'Tukang Kayu', unit: 'OH', coefficient: 0.100, unitPrice: 180000, total: 18000 },
      { id: 'c-5', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.010, unitPrice: 205000, total: 2050 },
      { id: 'c-6', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.005, unitPrice: 235000, total: 1175 },
    ],
    materialComponents: [
      { id: 'c-7', code: 'MT-012', name: 'Kayu Kaso 5/7 Meranti', unit: 'm³', coefficient: 0.012, unitPrice: 3400000, total: 40800 },
      { id: 'c-8', code: 'MT-009', name: 'Paku 2" - 3"', unit: 'kg', coefficient: 0.020, unitPrice: 25000, total: 500 },
    ],
    equipmentComponents: [],
    totalLabor: 34725,
    totalMaterial: 41300,
    totalEquipment: 0,
    unitPrice: 76025,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-A03',
    code: 'A.2.2.1.2',
    name: '1 Ls Pembuatan Gudang Material & Bedeng Pekerja Sementara',
    category: 'PEKERJAAN PERSIAPAN',
    unit: 'Ls',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-a3-1', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 15.000, unitPrice: 135000, total: 2025000 },
      { id: 'c-a3-2', code: 'TK-004', name: 'Tukang Kayu', unit: 'OH', coefficient: 10.000, unitPrice: 180000, total: 1800000 },
    ],
    materialComponents: [
      { id: 'c-a3-3', code: 'MT-012', name: 'Kayu Kaso, Seng & Plywood', unit: 'Ls', coefficient: 1.000, unitPrice: 3500000, total: 3500000 },
    ],
    equipmentComponents: [],
    totalLabor: 3825000,
    totalMaterial: 3500000,
    totalEquipment: 0,
    unitPrice: 7325000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-A04',
    code: 'A.2.2.1.7',
    name: '1 Ls Penyediaan Air Kerja dan Listrik Kerja Sementara',
    category: 'PEKERJAAN PERSIAPAN',
    unit: 'Ls',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [],
    materialComponents: [
      { id: 'c-a4-1', code: 'MT-090', name: 'Instalasi Pipa, Pompa & Daya PLN Sementara', unit: 'Ls', coefficient: 1.000, unitPrice: 3500000, total: 3500000 }
    ],
    equipmentComponents: [],
    totalLabor: 0,
    totalMaterial: 3500000,
    totalEquipment: 0,
    unitPrice: 3500000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-A05',
    code: 'A.2.2.1.8',
    name: '1 Ls Penerapan SMKK / Keselamatan Konstruksi (K3, APD & Rambu)',
    category: 'PEKERJAAN PERSIAPAN',
    unit: 'Ls',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [],
    materialComponents: [
      { id: 'c-a5-1', code: 'MT-091', name: 'Paket Helm, Rompi, Safety Shoes, P3K & Rambu K3', unit: 'Ls', coefficient: 1.000, unitPrice: 2850000, total: 2850000 }
    ],
    equipmentComponents: [],
    totalLabor: 0,
    totalMaterial: 2850000,
    totalEquipment: 0,
    unitPrice: 2850000,
    lastUpdated: '2026-01-10'
  },

  // B. PEKERJAAN TANAH
  {
    id: 'AHSP-B01',
    code: 'A.2.3.1.1',
    name: '1 m³ Galian Tanah Biasa Sedalam 1 Meter',
    category: 'PEKERJAAN TANAH',
    unit: 'm³',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-9', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.750, unitPrice: 135000, total: 101250 },
      { id: 'c-10', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.025, unitPrice: 235000, total: 5875 },
    ],
    materialComponents: [],
    equipmentComponents: [],
    totalLabor: 107125,
    totalMaterial: 0,
    totalEquipment: 0,
    unitPrice: 107125,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-B02',
    code: 'A.2.3.1.11',
    name: '1 m³ Urugan Pasir Bawah Pondasi & Lantai',
    category: 'PEKERJAAN TANAH',
    unit: 'm³',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-11', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.300, unitPrice: 135000, total: 40500 },
      { id: 'c-12', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.010, unitPrice: 235000, total: 2350 },
    ],
    materialComponents: [
      { id: 'c-13', code: 'MT-002', name: 'Pasir Urug / Pasang', unit: 'm³', coefficient: 1.200, unitPrice: 320000, total: 384000 },
    ],
    equipmentComponents: [
      { id: 'c-14', code: 'AL-003', name: 'Stamper Kuda', unit: 'hari', coefficient: 0.050, unitPrice: 220000, total: 11000 }
    ],
    totalLabor: 42850,
    totalMaterial: 384000,
    totalEquipment: 11000,
    unitPrice: 437850,
    lastUpdated: '2026-01-10'
  },

  // C. PEKERJAAN PONDASI
  {
    id: 'AHSP-C01',
    code: 'A.3.2.1.2',
    name: '1 m³ Pasangan Pondasi Batu Kali 1 SP : 4 PP',
    category: 'PEKERJAAN PONDASI',
    unit: 'm³',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-15', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 1.500, unitPrice: 135000, total: 202500 },
      { id: 'c-16', code: 'TK-002', name: 'Tukang Batu', unit: 'OH', coefficient: 0.750, unitPrice: 175000, total: 131250 },
      { id: 'c-17', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.075, unitPrice: 205000, total: 15375 },
      { id: 'c-18', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.075, unitPrice: 235000, total: 17625 },
    ],
    materialComponents: [
      { id: 'c-19', code: 'MT-004', name: 'Batu Belah 15/20 cm', unit: 'm³', coefficient: 1.200, unitPrice: 290000, total: 348000 },
      { id: 'c-20', code: 'MT-001', name: 'Semen Portland (zak)', unit: 'zak', coefficient: 3.260, unitPrice: 68000, total: 221680 },
      { id: 'c-21', code: 'MT-002', name: 'Pasir Pasang', unit: 'm³', coefficient: 0.520, unitPrice: 320000, total: 166400 },
    ],
    equipmentComponents: [
      { id: 'c-22', code: 'AL-001', name: 'Concrete Molen', unit: 'hari', coefficient: 0.080, unitPrice: 250000, total: 20000 }
    ],
    totalLabor: 366750,
    totalMaterial: 736080,
    totalEquipment: 20000,
    unitPrice: 1122830,
    lastUpdated: '2026-01-10'
  },

  // D. PEKERJAAN STRUKTUR BETON BERTULANG
  {
    id: 'AHSP-D01',
    code: 'A.4.1.1.5',
    name: '1 m³ Beton Mutu K-250 (fc 20.8 MPa) Readymix Slump 12',
    category: 'PEKERJAAN STRUKTUR',
    unit: 'm³',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-23', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 1.200, unitPrice: 135000, total: 162000 },
      { id: 'c-24', code: 'TK-002', name: 'Tukang Batu', unit: 'OH', coefficient: 0.350, unitPrice: 175000, total: 61250 },
      { id: 'c-25', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.035, unitPrice: 205000, total: 7175 },
      { id: 'c-26', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.080, unitPrice: 235000, total: 18800 },
    ],
    materialComponents: [
      { id: 'c-27', code: 'MT-010', name: 'Beton Readymix K-250', unit: 'm³', coefficient: 1.050, unitPrice: 920000, total: 966000 },
    ],
    equipmentComponents: [
      { id: 'c-28', code: 'AL-002', name: 'Concrete Vibrator', unit: 'hari', coefficient: 0.120, unitPrice: 180000, total: 21600 }
    ],
    totalLabor: 249225,
    totalMaterial: 966000,
    totalEquipment: 21600,
    unitPrice: 1236825,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-D02',
    code: 'A.4.1.1.17',
    name: '1 kg Pembesian Tulangan Baja Ulir / Polos Terpasang',
    category: 'PEKERJAAN STRUKTUR',
    unit: 'kg',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-29', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.007, unitPrice: 135000, total: 945 },
      { id: 'c-30', code: 'TK-003', name: 'Tukang Besi', unit: 'OH', coefficient: 0.007, unitPrice: 180000, total: 1260 },
      { id: 'c-31', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.0007, unitPrice: 205000, total: 143.5 },
      { id: 'c-32', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.0004, unitPrice: 235000, total: 94 },
    ],
    materialComponents: [
      { id: 'c-33', code: 'MT-007', name: 'Besi Beton Ulir BjTS 420', unit: 'kg', coefficient: 1.050, unitPrice: 14800, total: 15540 },
      { id: 'c-34', code: 'MT-009', name: 'Kawat Bendrat', unit: 'kg', coefficient: 0.015, unitPrice: 25000, total: 375 },
    ],
    equipmentComponents: [],
    totalLabor: 2442.5,
    totalMaterial: 15915,
    totalEquipment: 0,
    unitPrice: 18358,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-D03',
    code: 'A.4.1.1.20',
    name: '1 m² Pasang Bekisting Balok & Plat Lantai (Plywood 12mm)',
    category: 'PEKERJAAN STRUKTUR',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-35', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.320, unitPrice: 135000, total: 43200 },
      { id: 'c-36', code: 'TK-004', name: 'Tukang Kayu', unit: 'OH', coefficient: 0.330, unitPrice: 180000, total: 59400 },
      { id: 'c-37', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.033, unitPrice: 205000, total: 6765 },
      { id: 'c-38', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.016, unitPrice: 235000, total: 3760 },
    ],
    materialComponents: [
      { id: 'c-39', code: 'MT-011', name: 'Plywood Film 12 mm (3x pakai)', unit: 'lbr', coefficient: 0.120, unitPrice: 235000, total: 28200 },
      { id: 'c-40', code: 'MT-012', name: 'Kayu Kaso 5/7 Meranti', unit: 'm³', coefficient: 0.018, unitPrice: 3400000, total: 61200 },
      { id: 'c-41', code: 'MT-009', name: 'Paku 2" - 4"', unit: 'kg', coefficient: 0.400, unitPrice: 25000, total: 10000 },
    ],
    equipmentComponents: [
      { id: 'c-42', code: 'AL-004', name: 'Scaffolding Perancah Set', unit: 'set/bln', coefficient: 0.450, unitPrice: 45000, total: 20250 }
    ],
    totalLabor: 113125,
    totalMaterial: 99400,
    totalEquipment: 20250,
    unitPrice: 232775,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-D04',
    code: 'A.4.1.1.28',
    name: '1 m¹ Kolom Praktis Beton Bertulang 15 x 15 cm Lengkap',
    category: 'PEKERJAAN STRUKTUR',
    unit: 'm¹',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-43', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.180, unitPrice: 135000, total: 24300 },
      { id: 'c-44', code: 'TK-002', name: 'Tukang Batu', unit: 'OH', coefficient: 0.120, unitPrice: 175000, total: 21000 },
      { id: 'c-45', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.012, unitPrice: 205000, total: 2460 },
      { id: 'c-46', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.009, unitPrice: 235000, total: 2115 },
    ],
    materialComponents: [
      { id: 'c-47', code: 'MT-001', name: 'Semen Portland (zak)', unit: 'zak', coefficient: 0.150, unitPrice: 68000, total: 10200 },
      { id: 'c-48', code: 'MT-003', name: 'Pasir Beton & Split', unit: 'm³', coefficient: 0.035, unitPrice: 375000, total: 13125 },
      { id: 'c-49', code: 'MT-008', name: 'Besi Beton Dia 10mm & 8mm', unit: 'kg', coefficient: 3.200, unitPrice: 13900, total: 44480 },
      { id: 'c-50', code: 'MT-011', name: 'Bekisting Kayu', unit: 'm²', coefficient: 0.400, unitPrice: 45000, total: 18000 },
    ],
    equipmentComponents: [],
    totalLabor: 49875,
    totalMaterial: 85805,
    totalEquipment: 0,
    unitPrice: 135680,
    lastUpdated: '2026-01-10'
  },

  // E. PEKERJAAN DINDING & PLESTERAN
  {
    id: 'AHSP-E01',
    code: 'A.4.4.1.18',
    name: '1 m² Pasangan Dinding Bata Ringan (AAC) Tebal 10 cm Mortar Instan',
    category: 'PEKERJAAN DINDING',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-51', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.200, unitPrice: 135000, total: 27000 },
      { id: 'c-52', code: 'TK-002', name: 'Tukang Batu', unit: 'OH', coefficient: 0.100, unitPrice: 175000, total: 17500 },
      { id: 'c-53', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.010, unitPrice: 205000, total: 2050 },
      { id: 'c-54', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.010, unitPrice: 235000, total: 2350 },
    ],
    materialComponents: [
      { id: 'c-55', code: 'MT-005', name: 'Bata Ringan AAC 10cm', unit: 'm³', coefficient: 0.105, unitPrice: 720000, total: 75600 },
      { id: 'c-56', code: 'MT-006', name: 'Semen Mortar Thinbed MU-380', unit: 'zak', coefficient: 0.125, unitPrice: 95000, total: 11875 },
    ],
    equipmentComponents: [],
    totalLabor: 48900,
    totalMaterial: 87475,
    totalEquipment: 0,
    unitPrice: 136375,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-E02',
    code: 'A.4.4.2.2',
    name: '1 m² Plesteran 1 SP : 4 PP Tebal 15 mm',
    category: 'PEKERJAAN DINDING',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-57', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.300, unitPrice: 135000, total: 40500 },
      { id: 'c-58', code: 'TK-002', name: 'Tukang Batu', unit: 'OH', coefficient: 0.150, unitPrice: 175000, total: 26250 },
      { id: 'c-59', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.015, unitPrice: 205000, total: 3075 },
      { id: 'c-60', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.015, unitPrice: 235000, total: 3525 },
    ],
    materialComponents: [
      { id: 'c-61', code: 'MT-001', name: 'Semen Portland (zak)', unit: 'zak', coefficient: 0.125, unitPrice: 68000, total: 8500 },
      { id: 'c-62', code: 'MT-002', name: 'Pasir Pasang', unit: 'm³', coefficient: 0.024, unitPrice: 320000, total: 7680 },
    ],
    equipmentComponents: [],
    totalLabor: 73350,
    totalMaterial: 16180,
    totalEquipment: 0,
    unitPrice: 89530,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-E03',
    code: 'A.4.4.2.27',
    name: '1 m² Acian Dinding Semen Instan / MU-200',
    category: 'PEKERJAAN DINDING',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-63', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.150, unitPrice: 135000, total: 20250 },
      { id: 'c-64', code: 'TK-002', name: 'Tukang Batu', unit: 'OH', coefficient: 0.100, unitPrice: 175000, total: 17500 },
      { id: 'c-65', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.010, unitPrice: 205000, total: 2050 },
      { id: 'c-66', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.008, unitPrice: 235000, total: 1880 },
    ],
    materialComponents: [
      { id: 'c-67', code: 'MT-006', name: 'Semen Instan Acian MU-200', unit: 'zak', coefficient: 0.080, unitPrice: 95000, total: 7600 },
    ],
    equipmentComponents: [],
    totalLabor: 41680,
    totalMaterial: 7600,
    totalEquipment: 0,
    unitPrice: 49280,
    lastUpdated: '2026-01-10'
  },

  // F. PEKERJAAN LANTAI
  {
    id: 'AHSP-F01',
    code: 'A.4.4.3.35',
    name: '1 m² Pasang Lantai Granit Tile Homogeneous 60 x 60 cm Polished',
    category: 'PEKERJAAN LANTAI',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-68', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.250, unitPrice: 135000, total: 33750 },
      { id: 'c-69', code: 'TK-002', name: 'Tukang Keramik/Batu', unit: 'OH', coefficient: 0.180, unitPrice: 175000, total: 31500 },
      { id: 'c-70', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.018, unitPrice: 205000, total: 3690 },
      { id: 'c-71', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.013, unitPrice: 235000, total: 3055 },
    ],
    materialComponents: [
      { id: 'c-72', code: 'MT-013', name: 'Granite Tile 60x60 Polished', unit: 'm²', coefficient: 1.050, unitPrice: 215000, total: 225750 },
      { id: 'c-73', code: 'MT-006', name: 'Semen Mortar Perekat Granit MU-400', unit: 'zak', coefficient: 0.150, unitPrice: 95000, total: 14250 },
      { id: 'c-74', code: 'MT-001', name: 'Semen Grout Pengisi Nat', unit: 'kg', coefficient: 0.500, unitPrice: 18000, total: 9000 },
    ],
    equipmentComponents: [],
    totalLabor: 71995,
    totalMaterial: 249000,
    totalEquipment: 0,
    unitPrice: 320995,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-F02',
    code: 'A.4.4.3.40',
    name: '1 m¹ Pasang Plint Granit Lantai 10 x 60 cm',
    category: 'PEKERJAAN LANTAI',
    unit: 'm¹',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-75', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.080, unitPrice: 135000, total: 10800 },
      { id: 'c-76', code: 'TK-002', name: 'Tukang Batu', unit: 'OH', coefficient: 0.080, unitPrice: 175000, total: 14000 },
    ],
    materialComponents: [
      { id: 'c-77', code: 'MT-013', name: 'Plint Granit 10x60 cm', unit: 'm¹', coefficient: 1.050, unitPrice: 38000, total: 39900 },
      { id: 'c-78', code: 'MT-006', name: 'Mortar Perekat & Grout', unit: 'kg', coefficient: 0.400, unitPrice: 12000, total: 4800 },
    ],
    equipmentComponents: [],
    totalLabor: 24800,
    totalMaterial: 44700,
    totalEquipment: 0,
    unitPrice: 69500,
    lastUpdated: '2026-01-10'
  },

  // G. PEKERJAAN PLAFON
  {
    id: 'AHSP-G01',
    code: 'A.4.5.1.7',
    name: '1 m² Plafon Gypsum Board 9 mm + Rangka Hollow Galvalum 40x40',
    category: 'PEKERJAAN PLAFON',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-79', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.200, unitPrice: 135000, total: 27000 },
      { id: 'c-80', code: 'TK-004', name: 'Tukang Gypsum/Kayu', unit: 'OH', coefficient: 0.200, unitPrice: 180000, total: 36000 },
      { id: 'c-81', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.020, unitPrice: 205000, total: 4100 },
      { id: 'c-82', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.010, unitPrice: 235000, total: 2350 },
    ],
    materialComponents: [
      { id: 'c-83', code: 'MT-015', name: 'Gypsum Board 9 mm Jayaboard', unit: 'lbr', coefficient: 0.364, unitPrice: 89000, total: 32396 },
      { id: 'c-84', code: 'MT-016', name: 'Rangka Hollow Galvalum 40x40', unit: 'btg', coefficient: 1.100, unitPrice: 32000, total: 35200 },
      { id: 'c-85', code: 'MT-009', name: 'Sekrup Gypsum & Cornice Compound', unit: 'ls', coefficient: 1.000, unitPrice: 12000, total: 12000 },
    ],
    equipmentComponents: [],
    totalLabor: 69450,
    totalMaterial: 79596,
    totalEquipment: 0,
    unitPrice: 149046,
    lastUpdated: '2026-01-10'
  },

  // H. PEKERJAAN ATAP
  {
    id: 'AHSP-H01',
    code: 'A.4.2.1.22',
    name: '1 m² Rangka Atap Baja Ringan Truss C75.75 Terpasang',
    category: 'PEKERJAAN ATAP',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-86', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.150, unitPrice: 135000, total: 20250 },
      { id: 'c-87', code: 'TK-003', name: 'Tukang Baja Ringan', unit: 'OH', coefficient: 0.180, unitPrice: 180000, total: 32400 },
      { id: 'c-88', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.015, unitPrice: 235000, total: 3525 },
    ],
    materialComponents: [
      { id: 'c-89', code: 'MT-016', name: 'Truss Kanal C75.75 & Reng Zincalume SNI', unit: 'm²', coefficient: 1.000, unitPrice: 145000, total: 145000 },
      { id: 'c-90', code: 'MT-009', name: 'Self Drilling Screw & Dynabolt', unit: 'ls', coefficient: 1.000, unitPrice: 15000, total: 15000 },
    ],
    equipmentComponents: [],
    totalLabor: 56175,
    totalMaterial: 160000,
    totalEquipment: 0,
    unitPrice: 216175,
    lastUpdated: '2026-01-10'
  },

  // I. PEKERJAAN KUSEN, PINTU & JENDELA
  {
    id: 'AHSP-I01',
    code: 'A.4.6.1.1',
    name: '1 m¹ Kusen Aluminium 4" Powder Coating Alexindo',
    category: 'PEKERJAAN KUSEN',
    unit: 'm¹',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-91', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.040, unitPrice: 135000, total: 5400 },
      { id: 'c-92', code: 'TK-004', name: 'Tukang Pasang Aluminium', unit: 'OH', coefficient: 0.080, unitPrice: 180000, total: 14400 },
    ],
    materialComponents: [
      { id: 'c-93', code: 'MT-019', name: 'Profil Aluminium 4" Alexindo', unit: 'm¹', coefficient: 1.050, unitPrice: 135000, total: 141750 },
      { id: 'c-94', code: 'MT-009', name: 'Sealant Silicone & Fastener', unit: 'ls', coefficient: 1.000, unitPrice: 8500, total: 8500 },
    ],
    equipmentComponents: [],
    totalLabor: 19800,
    totalMaterial: 150250,
    totalEquipment: 0,
    unitPrice: 170050,
    lastUpdated: '2026-01-10'
  },

  // J. PEKERJAAN PENGECATAN
  {
    id: 'AHSP-J01',
    code: 'A.4.7.1.10',
    name: '1 m² Pengecatan Dinding Interior 1 Lapis Dasar + 2 Lapis Dulux',
    category: 'PEKERJAAN PENGECATAN',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-95', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.070, unitPrice: 135000, total: 9450 },
      { id: 'c-96', code: 'TK-005', name: 'Tukang Cat', unit: 'OH', coefficient: 0.090, unitPrice: 170000, total: 15300 },
      { id: 'c-97', code: 'TK-009', name: 'Mandor', unit: 'OH', coefficient: 0.005, unitPrice: 235000, total: 1175 },
    ],
    materialComponents: [
      { id: 'c-98', code: 'MT-017', name: 'Cat Dasar Alkali Sealer', unit: 'kg', coefficient: 0.100, unitPrice: 55000, total: 5500 },
      { id: 'c-99', code: 'MT-017', name: 'Cat Dinding Dulux Pentalite', unit: 'kg', coefficient: 0.260, unitPrice: 75000, total: 19500 },
      { id: 'c-100', code: 'MT-009', name: 'Plamir & Amplas Dinding', unit: 'ls', coefficient: 1.000, unitPrice: 4000, total: 4000 },
    ],
    equipmentComponents: [],
    totalLabor: 25925,
    totalMaterial: 29000,
    totalEquipment: 0,
    unitPrice: 54925,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-J02',
    code: 'A.4.7.1.12',
    name: '1 m² Pengecatan Dinding Eksterior Weathershield Tahan Cuaca',
    category: 'PEKERJAAN PENGECATAN',
    unit: 'm²',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-101', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.080, unitPrice: 135000, total: 10800 },
      { id: 'c-102', code: 'TK-005', name: 'Tukang Cat', unit: 'OH', coefficient: 0.100, unitPrice: 170000, total: 17000 },
    ],
    materialComponents: [
      { id: 'c-103', code: 'MT-018', name: 'Cat Eksterior Dulux Weathershield', unit: 'kg', coefficient: 0.320, unitPrice: 110000, total: 35200 },
      { id: 'c-104', code: 'MT-017', name: 'Sealer Eksterior', unit: 'kg', coefficient: 0.120, unitPrice: 65000, total: 7800 },
    ],
    equipmentComponents: [],
    totalLabor: 27800,
    totalMaterial: 43000,
    totalEquipment: 0,
    unitPrice: 70800,
    lastUpdated: '2026-01-10'
  },

  // K. PEKERJAAN SANITAIR & PLUMBING
  {
    id: 'AHSP-K01',
    code: 'A.5.1.1.2',
    name: '1 unit Pemasangan Kloset Duduk Monoblok TOTO CW421J Lengkap Aksesoris',
    category: 'PEKERJAAN SANITAIR',
    unit: 'unit',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-105', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 1.000, unitPrice: 135000, total: 135000 },
      { id: 'c-106', code: 'TK-007', name: 'Tukang Pipa/Plumbing', unit: 'OH', coefficient: 1.500, unitPrice: 185000, total: 277500 },
      { id: 'c-107', code: 'TK-008', name: 'Kepala Tukang', unit: 'OH', coefficient: 0.150, unitPrice: 205000, total: 30750 },
    ],
    materialComponents: [
      { id: 'c-108', code: 'MT-020', name: 'Kloset Duduk TOTO CW421J', unit: 'unit', coefficient: 1.000, unitPrice: 2850000, total: 2850000 },
      { id: 'c-109', code: 'MT-009', name: 'Seal Tape, Fleksibel, Stop Kran TOTO', unit: 'set', coefficient: 1.000, unitPrice: 220000, total: 220000 },
    ],
    equipmentComponents: [],
    totalLabor: 443250,
    totalMaterial: 3070000,
    totalEquipment: 0,
    unitPrice: 3513250,
    lastUpdated: '2026-01-10'
  },

  // L. PEKERJAAN ELEKTRIKAL
  {
    id: 'AHSP-L01',
    code: 'A.6.1.1.1',
    name: '1 Titik Instalasi Penerangan Lampu Kabel NYM 3x1.5mm + Pipa Conduit',
    category: 'PEKERJAAN ELEKTRIKAL',
    unit: 'titik',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-110', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.200, unitPrice: 135000, total: 27000 },
      { id: 'c-111', code: 'TK-006', name: 'Tukang Listrik', unit: 'OH', coefficient: 0.350, unitPrice: 190000, total: 66500 },
    ],
    materialComponents: [
      { id: 'c-112', code: 'MT-023', name: 'Kabel NYM 3x1.5mm Supreme', unit: 'm¹', coefficient: 12.000, unitPrice: 16500, total: 198000 },
      { id: 'c-113', code: 'MT-009', name: 'Pipa Conduit PVC High Impact & T-Dos', unit: 'ls', coefficient: 1.000, unitPrice: 35000, total: 35000 },
    ],
    equipmentComponents: [],
    totalLabor: 93500,
    totalMaterial: 233000,
    totalEquipment: 0,
    unitPrice: 326500,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-L02',
    code: 'A.6.1.1.5',
    name: '1 Titik Pemasangan Armature Lampu Downlight LED 12W Philips',
    category: 'PEKERJAAN ELEKTRIKAL',
    unit: 'titik',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-114', code: 'TK-006', name: 'Tukang Listrik', unit: 'OH', coefficient: 0.150, unitPrice: 190000, total: 28500 },
    ],
    materialComponents: [
      { id: 'c-115', code: 'MT-024', name: 'Lampu LED Downlight 12W Philips', unit: 'titik', coefficient: 1.000, unitPrice: 85000, total: 85000 },
    ],
    equipmentComponents: [],
    totalLabor: 28500,
    totalMaterial: 85000,
    totalEquipment: 0,
    unitPrice: 113500,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-L03',
    code: 'A.5.2.1.2',
    name: '1 Titik Instalasi Stop Kontak & Saklar Panasonic / Schneider',
    category: 'PEKERJAAN ELEKTRIKAL',
    unit: 'titik',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-116', code: 'TK-006', name: 'Tukang Listrik', unit: 'OH', coefficient: 0.250, unitPrice: 190000, total: 47500 },
    ],
    materialComponents: [
      { id: 'c-117', code: 'MT-023', name: 'Kabel NYM 3x2.5mm Supreme + Stop Kontak/Saklar', unit: 'ls', coefficient: 1.000, unitPrice: 145000, total: 145000 },
    ],
    equipmentComponents: [],
    totalLabor: 47500,
    totalMaterial: 145000,
    totalEquipment: 0,
    unitPrice: 192500,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-L04',
    code: 'A.5.2.1.3',
    name: '1 Unit Box Panel MCB 6-8 Group + Main Breaker & Arrester Grounding',
    category: 'PEKERJAAN ELEKTRIKAL',
    unit: 'unit',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-118', code: 'TK-006', name: 'Tukang Listrik', unit: 'OH', coefficient: 1.500, unitPrice: 190000, total: 285000 },
    ],
    materialComponents: [
      { id: 'c-119', code: 'MT-025', name: 'Panel Box Presto + MCB Schneider 6 Group + Grounding Rod', unit: 'unit', coefficient: 1.000, unitPrice: 1150000, total: 1150000 },
    ],
    equipmentComponents: [],
    totalLabor: 285000,
    totalMaterial: 1150000,
    totalEquipment: 0,
    unitPrice: 1435000,
    lastUpdated: '2026-01-10'
  },

  // M. PEKERJAAN PLUMBING DRAINAGE & SANITASI TAMBAHAN
  {
    id: 'AHSP-K02',
    code: 'A.5.1.2.2',
    name: '1 m¹ Pipa Pembuangan Air Kotor PVC D 4" & Air Bekas PVC D 3" Rucika',
    category: 'PEKERJAAN SANITAIR',
    unit: 'm¹',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-120', code: 'TK-007', name: 'Tukang Pipa/Plumbing', unit: 'OH', coefficient: 0.150, unitPrice: 185000, total: 27750 },
    ],
    materialComponents: [
      { id: 'c-121', code: 'MT-026', name: 'Pipa PVC D 4" Rucika & Fitting Sambungan', unit: 'm¹', coefficient: 1.050, unitPrice: 88000, total: 92400 },
    ],
    equipmentComponents: [],
    totalLabor: 27750,
    totalMaterial: 92400,
    totalEquipment: 0,
    unitPrice: 120150,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-K03',
    code: 'A.5.1.3.1',
    name: '1 Unit Septic Tank Biofil Biotech 1000 Liter + Sumur Resapan',
    category: 'PEKERJAAN SANITAIR',
    unit: 'unit',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-122', code: 'TK-001', name: 'Pekerja Galian & Setting', unit: 'OH', coefficient: 3.000, unitPrice: 135000, total: 405000 },
    ],
    materialComponents: [
      { id: 'c-123', code: 'MT-027', name: 'Tangki Septic Tank Biofil Biotech 1000L & Pipa Resapan', unit: 'unit', coefficient: 1.000, unitPrice: 3850000, total: 3850000 },
    ],
    equipmentComponents: [],
    totalLabor: 405000,
    totalMaterial: 3850000,
    totalEquipment: 0,
    unitPrice: 4255000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-K04',
    code: 'A.5.1.4.1',
    name: '1 Set Tandon Air Penguin 1000L + Pompa Air Booster Otomatis Shimizu/Wasser',
    category: 'PEKERJAAN SANITAIR',
    unit: 'set',
    regulationSource: 'Permen PUPR No. 1/PRT/M/2022',
    laborComponents: [
      { id: 'c-124', code: 'TK-007', name: 'Tukang Pipa/Plumbing', unit: 'OH', coefficient: 1.500, unitPrice: 185000, total: 277500 },
    ],
    materialComponents: [
      { id: 'c-125', code: 'MT-028', name: 'Toren Air Penguin TB-110 1000L + Pompa Booster Otomatis + Radar', unit: 'set', coefficient: 1.000, unitPrice: 3200000, total: 3200000 },
    ],
    equipmentComponents: [],
    totalLabor: 277500,
    totalMaterial: 3200000,
    totalEquipment: 0,
    unitPrice: 3477500,
    lastUpdated: '2026-01-10'
  },

  // N. PEKERJAAN INTERIOR & CUSTOM FURNITURE
  {
    id: 'AHSP-INT01',
    code: 'A.8.1.1.1',
    name: '1 m² Pemasangan WPC Wall Panel Fluted Dinding & Plafond',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'm²',
    regulationSource: 'Standar Industri Interior & Permen PUPR 2024',
    laborComponents: [
      { id: 'c-int-1', code: 'TK-004', name: 'Tukang Pasang Interior & Panel', unit: 'OH', coefficient: 0.350, unitPrice: 185000, total: 64750 },
      { id: 'c-int-2', code: 'TK-001', name: 'Pekerja Pembantu', unit: 'OH', coefficient: 0.150, unitPrice: 135000, total: 20250 },
    ],
    materialComponents: [
      { id: 'c-int-3', code: 'MT-INT01', name: 'WPC Wall Panel Fluted Premium Woodgrain/Charcoal', unit: 'm²', coefficient: 1.050, unitPrice: 245000, total: 257250 },
      { id: 'c-int-4', code: 'MT-INT02', name: 'Rangka Hollow Galvanis & Klip Stainless + Lem Sealant Maxbond', unit: 'ls', coefficient: 1.000, unitPrice: 45000, total: 45000 },
    ],
    equipmentComponents: [],
    totalLabor: 85000,
    totalMaterial: 302250,
    totalEquipment: 0,
    unitPrice: 387250,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT02',
    code: 'A.8.1.1.2',
    name: '1 m² Pemasangan Backdrop TV / Panel Dinding Multiplek 18mm Finish HPL Taco + Strip LED',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'm²',
    regulationSource: 'Standar Industri Interior & Permen PUPR 2024',
    laborComponents: [
      { id: 'c-int-5', code: 'TK-004', name: 'Tukang Kayu Interior Ahli HPL', unit: 'OH', coefficient: 0.500, unitPrice: 195000, total: 97500 },
      { id: 'c-int-6', code: 'TK-001', name: 'Pekerja', unit: 'OH', coefficient: 0.200, unitPrice: 135000, total: 27000 },
    ],
    materialComponents: [
      { id: 'c-int-7', code: 'MT-INT03', name: 'Multiplek Meranti 18mm Anti Rayap + Rangka Kayu', unit: 'm²', coefficient: 1.080, unitPrice: 220000, total: 237600 },
      { id: 'c-int-8', code: 'MT-INT04', name: 'Finishing HPL Taco Woodgrain/Solid + Lem Fox Kuning', unit: 'm²', coefficient: 1.100, unitPrice: 165000, total: 181500 },
      { id: 'c-int-9', code: 'MT-INT05', name: 'Lampu LED Strip COB Warm White + Trafo Power Supply 12V', unit: 'ls', coefficient: 1.000, unitPrice: 65000, total: 65000 },
    ],
    equipmentComponents: [],
    totalLabor: 124500,
    totalMaterial: 484100,
    totalEquipment: 0,
    unitPrice: 608600,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT03',
    code: 'A.8.1.1.3',
    name: '1 m¹ Kitchen Set Custom Atas & Bawah Multiplek 18mm Finish HPL + Top Table Solid Surface/Granit',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'm¹',
    regulationSource: 'Standar Industri Interior & Permen PUPR 2024',
    laborComponents: [
      { id: 'c-int-10', code: 'TK-004', name: 'Tukang Kayu Master Cabinet Maker', unit: 'OH', coefficient: 1.800, unitPrice: 195000, total: 351000 },
    ],
    materialComponents: [
      { id: 'c-int-11', code: 'MT-INT06', name: 'Kabinet Multiplek 18mm + Melaminto Putih Sisi Dalam', unit: 'm¹', coefficient: 1.000, unitPrice: 1450000, total: 1450000 },
      { id: 'c-int-12', code: 'MT-INT07', name: 'Laminasi HPL Luar Taco + Edging PVC 2mm', unit: 'm¹', coefficient: 1.000, unitPrice: 450000, total: 450000 },
      { id: 'c-int-13', code: 'MT-INT08', name: 'Top Table Solid Surface / Granit Nero Absoluto', unit: 'm¹', coefficient: 1.000, unitPrice: 1250000, total: 1250000 },
      { id: 'c-int-14', code: 'MT-INT09', name: 'Engsel Slow Motion Soft Closing, Rel Laci Double Track & Handle', unit: 'set', coefficient: 1.000, unitPrice: 350000, total: 350000 },
    ],
    equipmentComponents: [],
    totalLabor: 351000,
    totalMaterial: 3500000,
    totalEquipment: 0,
    unitPrice: 3851000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT04',
    code: 'A.8.1.1.4',
    name: '1 m² Lemari Pakaian / Wardrobe Full Height Multiplek 18mm Finish HPL + Cermin + Fitting',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'm²',
    regulationSource: 'Standar Industri Interior & Permen PUPR 2024',
    laborComponents: [
      { id: 'c-int-15', code: 'TK-004', name: 'Tukang Lemari Custom HPL', unit: 'OH', coefficient: 1.200, unitPrice: 195000, total: 234000 },
    ],
    materialComponents: [
      { id: 'c-int-16', code: 'MT-INT10', name: 'Bodi & Rak Multiplek 18mm + Melaminto', unit: 'm²', coefficient: 1.000, unitPrice: 980000, total: 980000 },
      { id: 'c-int-17', code: 'MT-INT11', name: 'Pintu HPL Taco / Cermin Bronze Bevel + Rel Gantung / Engsel', unit: 'm²', coefficient: 1.000, unitPrice: 650000, total: 650000 },
      { id: 'c-int-18', code: 'MT-INT12', name: 'Fitting Gantungan Baju Stainless, Lampu LED Sensor & Kunci', unit: 'ls', coefficient: 1.000, unitPrice: 180000, total: 180000 },
    ],
    equipmentComponents: [],
    totalLabor: 234000,
    totalMaterial: 1810000,
    totalEquipment: 0,
    unitPrice: 2044000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT05',
    code: 'A.8.1.1.5',
    name: '1 Unit Meja Kerja / Meja Makan Custom Multiplek Finish HPL + Rangka Kaki Besi Hollow',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'unit',
    regulationSource: 'Standar Industri Interior & Permen PUPR 2024',
    laborComponents: [
      { id: 'c-int-19', code: 'TK-004', name: 'Tukang Kayu Interior', unit: 'OH', coefficient: 1.500, unitPrice: 195000, total: 292500 },
    ],
    materialComponents: [
      { id: 'c-int-20', code: 'MT-INT13', name: 'Top Table Multiplek 36mm Finish HPL Taco + Rangka Kaki Besi Powder Coating', unit: 'unit', coefficient: 1.000, unitPrice: 2200000, total: 2200000 },
    ],
    equipmentComponents: [],
    totalLabor: 292500,
    totalMaterial: 2200000,
    totalEquipment: 0,
    unitPrice: 2492500,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT06',
    code: 'A.8.1.1.6',
    name: '1 Set Sofa Tamu Living Room 3-Seater / L-Shape Ergonomis Fabric / Kulit Sintetis',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'set',
    regulationSource: 'Standar Industri Interior & Furniture 2024',
    laborComponents: [],
    materialComponents: [
      { id: 'c-int-21', code: 'MT-INT14', name: 'Sofa 3-Seater / L-Shape Rangka Kayu Solid Mahoni, Busa Royal Foam D30, Kain Fabric Midili/Kulit Sintetis MBTech + Meja Tamu (Coffee Table)', unit: 'set', coefficient: 1.000, unitPrice: 7500000, total: 7500000 },
    ],
    equipmentComponents: [],
    totalLabor: 0,
    totalMaterial: 7500000,
    totalEquipment: 0,
    unitPrice: 7500000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT07',
    code: 'A.8.1.1.7',
    name: '1 Set Tempat Tidur / Bed Frame Queen (160x200) + Padded Headboard Custom HPL',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'set',
    regulationSource: 'Standar Industri Interior & Furniture 2024',
    laborComponents: [
      { id: 'c-int-22', code: 'TK-004', name: 'Tukang Kayu Interior', unit: 'OH', coefficient: 2.000, unitPrice: 195000, total: 390000 },
    ],
    materialComponents: [
      { id: 'c-int-23', code: 'MT-INT15', name: 'Dipan Tempat Tidur Multiplek 18mm Finish HPL + Headboard Busa Upholstery Fabric + 2 Meja Nakas', unit: 'set', coefficient: 1.000, unitPrice: 4800000, total: 4800000 },
    ],
    equipmentComponents: [],
    totalLabor: 390000,
    totalMaterial: 4800000,
    totalEquipment: 0,
    unitPrice: 5190000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT08',
    code: 'A.8.1.1.8',
    name: '1 m¹ Credenza / Buffet TV / Rak Display Kisi-kisi Custom Multiplek Finish HPL',
    category: 'PEKERJAAN INTERIOR & CUSTOM FURNITURE',
    unit: 'm¹',
    regulationSource: 'Standar Industri Interior & Furniture 2024',
    laborComponents: [
      { id: 'c-int-24', code: 'TK-004', name: 'Tukang Kayu Interior', unit: 'OH', coefficient: 1.000, unitPrice: 195000, total: 195000 },
    ],
    materialComponents: [
      { id: 'c-int-25', code: 'MT-INT16', name: 'Bodi Credenza Multiplek 18mm Finish HPL + Laci Rel Double Track', unit: 'm¹', coefficient: 1.000, unitPrice: 1650000, total: 1650000 },
    ],
    equipmentComponents: [],
    totalLabor: 195000,
    totalMaterial: 1650000,
    totalEquipment: 0,
    unitPrice: 1845000,
    lastUpdated: '2026-01-10'
  },
  {
    id: 'AHSP-INT09',
    code: 'A.8.1.1.9',
    name: '1 m² Pemasangan Lantai Vinyl 3mm / SPC Flooring 4mm + Underlayer Foam IXPE',
    category: 'PEKERJAAN PENUTUP LANTAI & DINDING',
    unit: 'm²',
    regulationSource: 'Standar Industri Interior & Permen PUPR 2024',
    laborComponents: [
      { id: 'c-int-26', code: 'TK-001', name: 'Tukang Pasang Vinyl / SPC', unit: 'OH', coefficient: 0.150, unitPrice: 180000, total: 27000 },
    ],
    materialComponents: [
      { id: 'c-int-27', code: 'MT-INT17', name: 'Plank SPC Flooring 4mm Click System / Vinyl Tile 3mm + Underlayer + Lem', unit: 'm²', coefficient: 1.050, unitPrice: 195000, total: 204750 },
      { id: 'c-int-28', code: 'MT-INT18', name: 'Plint Skirting PVC 8cm & Adaptasi Pintu', unit: 'm¹', coefficient: 0.500, unitPrice: 35000, total: 17500 },
    ],
    equipmentComponents: [],
    totalLabor: 27000,
    totalMaterial: 222250,
    totalEquipment: 0,
    unitPrice: 249250,
    lastUpdated: '2026-01-10'
  }
];

import { CostDatabaseEngine, ALL_OFFICIAL_AHSP_ITEMS } from './nationalCostDatabase/masterRegistry';

const STORAGE_KEY_CUSTOM_AHSP = 'yfarch_master_ahsp_v2026';

export function getAHSPDatabase(): AHSPItem[] {
  const officialLegacy = ALL_OFFICIAL_AHSP_ITEMS.map(item => CostDatabaseEngine.toLegacyAHSPItem(item));
  const combinedMap = new Map<string, AHSPItem>();
  
  // Seed with legacy base
  for (const itm of MASTER_AHSP_DATABASE) {
    combinedMap.set(itm.code.toLowerCase(), itm);
  }
  // Overlay official national dataset
  for (const itm of officialLegacy) {
    combinedMap.set(itm.code.toLowerCase(), itm);
  }

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function') {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_AHSP);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          for (const itm of parsed) {
            combinedMap.set(itm.code.toLowerCase(), itm);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Gagal membaca database AHSP dari localStorage:', e);
  }

  return Array.from(combinedMap.values());
}

export function saveAHSPDatabase(items: AHSPItem[]): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage?.setItem === 'function') {
      localStorage.setItem(STORAGE_KEY_CUSTOM_AHSP, JSON.stringify(items));
    }
  } catch (e) {
    console.error('Gagal menyimpan database AHSP:', e);
  }
}

export function addAHSPItem(itemData: Omit<AHSPItem, 'id'> & { id?: string }): AHSPItem {
  const current = getAHSPDatabase();
  const newItem: AHSPItem = {
    ...itemData,
    id: itemData.id || `AHSP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    lastUpdated: itemData.lastUpdated || new Date().toISOString().substring(0, 10),
  };
  const updated = [newItem, ...current];
  saveAHSPDatabase(updated);
  return newItem;
}

export function updateAHSPItem(id: string, updates: Partial<AHSPItem>): AHSPItem[] {
  const current = getAHSPDatabase();
  const updated = current.map(item => item.id === id ? { ...item, ...updates, lastUpdated: new Date().toISOString().substring(0, 10) } : item);
  saveAHSPDatabase(updated);
  return updated;
}

export function deleteAHSPItem(id: string): AHSPItem[] {
  const current = getAHSPDatabase();
  const updated = current.filter(item => item.id !== id);
  saveAHSPDatabase(updated);
  return updated;
}


