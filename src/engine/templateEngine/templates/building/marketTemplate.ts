import { ConstructionProjectTemplate } from '../../types';

export const marketTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-market',
  name: 'Pasar Tradisional & Modern',
  code: 'BLD-MKT-001',
  category: 'BUILDING',
  type: 'market',
  version: '2.0.0',
  description: 'Pasar rakyat modern higienis dengan zona los basah (ikan, daging, sayur lapis keramik), kios tertutup rolling door, saluran drainase khusus grease trap, dan TPS terpadu.',
  aliases: ['pasar', 'pasar tradisional', 'pasar modern', 'pasar rakyat', 'los pasar', 'pusat kuliner', 'pasar daerah'],
  keywords: ['pasar', 'kios', 'los', 'lapak', 'pasar basah', 'pasar kering', 'meja beton keramik', 'drainase pasar', 'grease trap', 'tps sampah'],
  parameters: [
    { id: 'building_area', name: 'Luas Lantai Pasar', type: 'NUMBER', required: true, defaultValue: 2000, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 2, unit: 'lantai', group: 'dimensions' },
    { id: 'num_kiosks', name: 'Jumlah Kios Tertutup', type: 'NUMBER', required: false, defaultValue: 50, unit: 'unit', group: 'general' },
    { id: 'num_los', name: 'Jumlah Meja Los Basah / Kering', type: 'NUMBER', required: false, defaultValue: 120, unit: 'unit', group: 'general' },
    { id: 'has_wet_market', name: 'Memiliki Zona Los Basah (Ikan/Daging/Unggas)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_grease_trap', name: 'Memiliki Saluran Drainase Khusus & Grease Trap', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_waste_station', name: 'Memiliki Tempat Penampungan Sampah (TPS) Pasar', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_loading_area', name: 'Memiliki Area Bongkar Muat Barang (Loading)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'num_los',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'Math.round(building_area * 0.05)',
      confidence: 0.85,
      reasoning: 'Rasio standar luasan los pasar tradisional per unit meja los'
    }
  ],
  validationRules: [
    { id: 'VAL-MKT-1', name: 'Luas Pasar Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas pasar harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '02.01', formula: 'num_los', unit: 'unit', variables: ['num_los'], description: 'Jumlah meja los beton lapis keramik' },
    { wbsCode: '02.02', formula: 'num_kiosks', unit: 'unit', variables: ['num_kiosks'], description: 'Jumlah unit kios rolling door' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN STRUKTUR UTAMA PORTAL WF / BETON',
      level: 1,
      children: [
        { code: '01.01', title: 'Pondasi Struktur & Pelat Lantai Rabat Beton Pasar', level: 2 },
        { code: '01.02', title: 'Portal Rangka Baja WF / Kolom Beton Tahan Kelembaban Tinggi', level: 2 },
        { code: '01.03', title: 'Atap Pelindung Ventilasi Alami Model Monitor / Jack Roof', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN ZONASI LOS DAN KIOS PASAR',
      level: 1,
      children: [
        {
          code: '02.01',
          title: 'Meja Los Basah Cor Beton Lapis Keramik Putih 20x20 + Kran Air Bersih Tiap Los',
          level: 2,
          conditionalRule: { parameterId: 'has_wet_market', operator: '==', value: true }
        },
        { code: '02.02', title: 'Kios Kering Dinding Bata / Partisi Bata Ringan + Rolling Door Aluminium', level: 2 },
        { code: '02.03', title: 'Papan Nama / Signage Blok Zonasi Pasar (Zona Basah, Kering, Pakaian)', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN DRAINASE KHUSUS & PENGOLAHAN LIMBAH PASAR',
      level: 1,
      children: [
        {
          code: '03.01',
          title: 'Saluran Terbuka Keramik Grating Besi Galvanis Anti Bau',
          level: 2
        },
        {
          code: '03.02',
          title: 'Bak Penjebak Lemak & Saringan Darah/Sisik (Grease Trap Komunal)',
          level: 2,
          conditionalRule: { parameterId: 'has_grease_trap', operator: '==', value: true }
        },
        {
          code: '03.03',
          title: 'Tempat Penampungan Sampah Sementara (TPS) Pemilah Organik/Anorganik',
          level: 2,
          conditionalRule: { parameterId: 'has_waste_station', operator: '==', value: true }
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN UTILITAS & BONGKAR MUAT (LOADING)',
      level: 1,
      children: [
        {
          code: '04.01',
          title: 'Pelataran Bongkar Muat Barang Sayur & Daging (Loading Bay)',
          level: 2,
          conditionalRule: { parameterId: 'has_loading_area', operator: '==', value: true }
        },
        { code: '04.02', title: 'Kantor Pengelola Pasar, Ruang Tera Ulang Timbangan & Toilet Umum', level: 2 },
        { code: '04.03', title: 'Sistem Hydrant Pemadam Kebakaran & Penerangan Pasar Hemat Energi', level: 2 }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
