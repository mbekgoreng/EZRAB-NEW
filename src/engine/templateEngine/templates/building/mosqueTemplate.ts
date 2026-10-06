import { ConstructionProjectTemplate } from '../../types';

export const mosqueTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-mosque',
  name: 'Masjid & Rumah Ibadah',
  code: 'BLD-MSQ-001',
  category: 'BUILDING',
  type: 'mosque',
  version: '2.0.0',
  description: 'Template masjid jami, musholla, dan sarana ibadah dengan kubah enamel, menara adzan, tempat wudhu khusus, mihrab, dan tata suara horn speaker.',
  aliases: ['masjid', 'musholla', 'tajug', 'surau', 'masjid agung', 'masjid jami'],
  keywords: ['masjid', 'kubah', 'menara', 'tempat wudhu', 'mimbar', 'mihrab', 'ornamen krawangan', 'sound system adzan', 'musholla', 'ruang sholat'],
  parameters: [
    { id: 'building_area', name: 'Luas Bangunan Utama', type: 'NUMBER', required: true, defaultValue: 500, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 1, unit: 'lantai', group: 'dimensions' },
    { id: 'capacity_jamaah', name: 'Kapasitas Jamaah', type: 'NUMBER', required: false, defaultValue: 600, unit: 'orang', group: 'general' },
    { id: 'has_dome', name: 'Memiliki Kubah Enamel / Stainless', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_minaret', name: 'Memiliki Menara Adzan Khusus', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_wudhu_area', name: 'Tempat Wudhu Pria/Wanita Terpisah', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_imam_room', name: 'Memiliki Ruang Imam & Khotib', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_dkm_office', name: 'Memiliki Kantor Sekretariat DKM / Pengurus', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'roof_covering_type', name: 'Jenis Penutup Atap Tambahan', type: 'SELECT', required: false, defaultValue: 'genteng_tanah_liat', options: [{ label: 'Genteng Tanah Liat Pres Tradisional', value: 'genteng_tanah_liat' }, { label: 'Genteng Keramik Glazur', value: 'genteng_keramik' }, { label: 'Dak Beton Ekspos', value: 'dak_beton' }], group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'capacity_jamaah',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'Math.round(building_area * 1.2)',
      confidence: 0.9,
      reasoning: 'Rasio standar shaf sholat adalah sekitar 0.8-0.9 m2 per jamaah'
    }
  ],
  validationRules: [
    { id: 'VAL-MSQ-1', name: 'Luas Masjid Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas bangunan masjid harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '01.01', formula: 'building_area * 0.9', unit: 'm²', variables: ['building_area'], description: 'Luas ruang sholat utama' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN STRUKTUR PONDASI & KOLOM UTAMA',
      level: 1,
      children: [
        { code: '01.01', title: 'Pondasi Batu Kali / Footplat Beton Bertulang K-250', level: 2 },
        { code: '01.02', title: 'Kolom Utama Penyangga Atap Bentang Tengah Tanpa Kolom Dalam', level: 2 },
        { code: '01.03', title: 'Balok Ringbalk & Balok Cincin Tumpuan Kubah', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN SPESIFIK KUBAH MASJID',
      level: 1,
      conditionalRule: { parameterId: 'has_dome', operator: '==', value: true },
      children: [
        { code: '02.01', title: 'Rangka Kubah Rangka Space Truss / Pipa Galvanis', level: 2 },
        { code: '02.02', title: 'Panel Kubah Enamel / Galvalum Motif Geometris & Makara Stainless', level: 2 },
        { code: '02.03', title: 'Plafon Interior Kubah Lukisan Awan / Kaligrafi Asmaul Husna', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN MENARA ADZAN MASJID',
      level: 1,
      conditionalRule: { parameterId: 'has_minaret', operator: '==', value: true },
      children: [
        { code: '03.01', title: 'Pondasi Dalam & Struktur Kolom Menara Beton K-300 Tinggi 15-30m', level: 2 },
        { code: '03.02', title: 'Tangga Spiral Putar Besi Menara & Balkon Muadzin', level: 2 },
        { code: '03.03', title: 'Puncak Menara Kubah Kecil & Sound Horn Speaker TOA 50W', level: 2 }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN TEMPAT WUDHU & SANITAIR',
      level: 1,
      conditionalRule: { parameterId: 'has_wudhu_area', operator: '==', value: true },
      children: [
        { code: '04.01', title: 'Area Wudhu Pria Kran Kuningan/Stainless Dudukan Keramik', level: 2 },
        { code: '04.02', title: 'Area Wudhu Wanita Tertutup & Saluran Resapan', level: 2 },
        { code: '04.03', title: 'Toilet Jamaah (Kloset Jongkok & Urinoir Sensor)', level: 2 },
        { code: '04.04', title: 'Tandon Air Bawah & Tandon Atas Kapasitas 2000L', level: 2 }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN ARSITEKTUR, MIHRAB & TATA SUARA',
      level: 1,
      children: [
        { code: '05.01', title: 'Lantai Utama Granit / Marmer 80x80 Polished & Saf Karpet Tebal 12mm', level: 2 },
        { code: '05.02', title: 'Mihrab Pengimaman & Mimbar Kayu Jati Ukir Jepara', level: 2 },
        { code: '05.03', title: 'Ornamen GRC Krawangan Motif Geometris Islami / Bintang Delapan', level: 2 },
        { code: '05.04', title: 'Sistem Audio Masjid: Amplifier Power, Mixer Echo, Column Speaker Dalam', level: 2 }
      ]
    },
    {
      code: '06',
      title: 'PEKERJAAN RUANG PENDUKUNG & EKSTERIOR',
      level: 1,
      children: [
        {
          code: '06.01',
          title: 'Ruang Imam & Ruang Transit Khotib',
          level: 2,
          conditionalRule: { parameterId: 'has_imam_room', operator: '==', value: true }
        },
        {
          code: '06.02',
          title: 'Kantor Sekretariat DKM & Gudang Inventaris',
          level: 2,
          conditionalRule: { parameterId: 'has_dkm_office', operator: '==', value: true }
        },
        { code: '06.03', title: 'Halaman Paving Masjid, Pagar Keliling & Lampu Sorot Fasad', level: 2 }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
