import { ConstructionProjectTemplate } from '../../types';

export const schoolTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-school',
  name: 'Gedung Sekolah & Sarana Pendidikan',
  code: 'BLD-SCH-001',
  category: 'BUILDING',
  type: 'school',
  version: '2.0.0',
  description: 'Template sarana pendidikan, gedung sekolah, ruang kelas baru (RKB), laboratorium, perpustakaan, lapangan olahraga, dan kantin sesuai standar Kemendikbud.',
  aliases: ['sekolah', 'kampus', 'universitas', 'pesantren', 'madrasah', 'rkb', 'ruang kelas', 'gedung sekolah', 'smk', 'sma', 'smp', 'sd'],
  keywords: ['sekolah', 'kelas', 'rkb', 'laboratorium', 'kampus', 'gedung sekolah', 'pendidikan', 'perpustakaan', 'kantin', 'lapangan', 'mushola'],
  parameters: [
    { id: 'building_area', name: 'Luas Bangunan Total', type: 'NUMBER', required: true, defaultValue: 1200, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 2, unit: 'lantai', group: 'dimensions' },
    { id: 'num_classrooms', name: 'Jumlah Ruang Kelas Belajar (RKB)', type: 'NUMBER', required: true, defaultValue: 8, unit: 'ruang', group: 'general' },
    { id: 'education_level', name: 'Jenjang Pendidikan', type: 'SELECT', required: false, defaultValue: 'smp_sma', options: [{ label: 'SD / Madrasah Ibtidaiyah', value: 'sd' }, { label: 'SMP / MTs', value: 'smp' }, { label: 'SMA / SMK / MA', value: 'sma_smk' }, { label: 'Perguruan Tinggi / Universitas', value: 'kampus' }], group: 'general' },
    { id: 'has_laboratory', name: 'Memiliki Ruang Laboratorium (IPA/Komputer)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_library', name: 'Memiliki Ruang Perpustakaan', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_teacher_room', name: 'Memiliki Ruang Guru & Kepala Sekolah', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_canteen', name: 'Memiliki Kantin Sekolah Higienis', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_sports_field', name: 'Memiliki Lapangan Olahraga / Upacara', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_mushola', name: 'Memiliki Mushola Sekolah', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'num_classrooms',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'Math.round(building_area / 120)',
      confidence: 0.85,
      reasoning: 'Rasio luas per RKB standar beserta selasar sirkulasi adalah sekitar 100-120 m2'
    }
  ],
  validationRules: [
    { id: 'VAL-SCH-1', name: 'Luas Sekolah Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas bangunan sekolah harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '02.01', formula: 'num_classrooms', unit: 'ruang', variables: ['num_classrooms'], description: 'Jumlah unit RKB yang dibangun' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN STRUKTUR PONDASI & RANGKA BETON',
      level: 1,
      children: [
        { code: '01.01', title: 'Pondasi Batu Kali / Footplat Beton Bertulang', level: 2 },
        { code: '01.02', title: 'Struktur Kolom, Balok & Pelat Lantai 2 Sekolah K-250', level: 2 },
        { code: '01.03', title: 'Tangga Akses Lantai 2 Lebar 1.8m Standar Evakuasi', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN RUANG KELAS BELAJAR (RKB)',
      level: 1,
      children: [
        { code: '02.01', title: 'Dinding Bata Ringan Diplester & Acian Halus RKB', level: 2 },
        { code: '02.02', title: 'Lantai Keramik Polished 50x50 Anti Gores', level: 2 },
        { code: '02.03', title: 'Kusen Aluminium, Daun Pintu Kaca & Jendela Sirkulasi Udara Silang', level: 2 },
        { code: '02.04', title: 'Papan Tulis Whiteboard Magnetic Ceramic t=1.2x2.4m', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN LABORATORIUM & PERPUSTAKAAN',
      level: 1,
      children: [
        {
          code: '03.01',
          title: 'Ruang Laboratorium IPA/Komputer Meja Keramik & Instalasi Air/Listrik',
          level: 2,
          conditionalRule: { parameterId: 'has_laboratory', operator: '==', value: true }
        },
        {
          code: '03.02',
          title: 'Ruang Perpustakaan Rak Buku & Karpet / Lantai Vinyl',
          level: 2,
          conditionalRule: { parameterId: 'has_library', operator: '==', value: true }
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN KANTOR GURU & SARANA PENUNJANG',
      level: 1,
      children: [
        {
          code: '04.01',
          title: 'Ruang Guru, Ruang Kepala Sekolah & Ruang Tata Usaha',
          level: 2,
          conditionalRule: { parameterId: 'has_teacher_room', operator: '==', value: true }
        },
        {
          code: '04.02',
          title: 'Mushola Sekolah Tempat Wudhu & Karpet Sholat',
          level: 2,
          conditionalRule: { parameterId: 'has_mushola', operator: '==', value: true }
        },
        {
          code: '04.03',
          title: 'Kantin Sekolah & Wastafel Cuci Tangan Siswa',
          level: 2,
          conditionalRule: { parameterId: 'has_canteen', operator: '==', value: true }
        },
        { code: '04.04', title: 'Toilet Siswa Pria/Wanita Terpisah (Urinoir, Kloset Jongkok/Duduk)', level: 2 }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN LAPANGAN & HALAMAN SEKOLAH',
      level: 1,
      conditionalRule: { parameterId: 'has_sports_field', operator: '==', value: true },
      children: [
        { code: '05.01', title: 'Rabat Beton / Paving Lapangan Upacara & Olahraga (Basket/Voli)', level: 2 },
        { code: '05.02', title: 'Tiang Bendera Stainless Steel & Pagar Keliling Sekolah', level: 2 }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
