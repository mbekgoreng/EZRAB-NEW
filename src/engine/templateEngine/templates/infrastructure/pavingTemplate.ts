import { ConstructionProjectTemplate } from '../../types';

export const pavingTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-infra-paving',
  name: 'Paving Block, Trotoar & Pedestrian',
  code: 'INF-PVG-001',
  category: 'INFRASTRUCTURE',
  type: 'paving',
  version: '2.0.0',
  description: 'Pemasangan paving block halaman, jalan lingkungan pemukiman, trotoar pejalan kaki, pedestrian ramah difabel dengan 11 tahapan WBS standar.',
  aliases: ['paving', 'paving block', 'trotoar', 'pedestrian', 'kanstin', 'kansteen', 'halaman kantor', 'conblock'],
  keywords: ['paving', 'paving block', 'trotoar', 'pedestrian', 'kanstin', 'pasir alas', 'conblock', 'guiding block'],
  parameters: [
    { id: 'paving_area', name: 'Luas Area Paving', type: 'NUMBER', required: true, defaultValue: 800, unit: 'm²', min: 10, max: 100000, group: 'dimensions' },
    { id: 'paving_thickness', name: 'Ketebalan Paving', type: 'SELECT', required: true, defaultValue: '8cm', options: [{ label: 'Paving t=6 cm (Trotoar / Pejalan Kaki / Motor)', value: '6cm' }, { label: 'Paving t=8 cm (Mobil / Truk Sedang K-300)', value: '8cm' }, { label: 'Paving t=10 cm (Heavy Duty Container Yard K-400)', value: '10cm' }], group: 'specifications' },
    { id: 'paving_pattern', name: 'Pola Pemasangan', type: 'SELECT', required: false, defaultValue: 'herringbone_45', options: [{ label: 'Anyaman Tulang Ikan (Herringbone 45°/90°)', value: 'herringbone_45' }, { label: 'Susun Bata (Stretcher Bond)', value: 'stretcher' }, { label: 'Kombinasi Warna Geometris', value: 'geometric' }], group: 'specifications' },
    { id: 'has_kanstin', name: 'Pemasangan Kanstin Beton Pengunci', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_guiding_block', name: 'Jalur Pemandu Difabel (Guiding Block Kuning)', type: 'BOOLEAN', required: false, defaultValue: false, group: 'specifications' },
    { id: 'has_drainage', name: 'Saluran Drainase Samping Trotoar', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'paving_thickness',
      assumedValue: '8cm',
      confidence: 0.9,
      reasoning: 'Paving t=8cm adalah standar minimum untuk jalan lingkungan berlalulintas mobil'
    }
  ],
  validationRules: [
    { id: 'VAL-PVG-1', name: 'Luas Paving Positif', severity: 'ERROR', expression: 'paving_area > 0', errorMessage: 'Luas paving harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '07.01', formula: 'paving_area * 0.05', unit: 'm³', variables: ['paving_area'], description: 'Volume pasir bedding sand tebal 5 cm' },
    { wbsCode: '08.01', formula: 'paving_area', unit: 'm²', variables: ['paving_area'], description: 'Luas pasang paving block' }
  ],
  wbsHierarchy: [
    { code: '01', title: 'PEKERJAAN PERSIAPAN', level: 1, children: [{ code: '01.01', title: 'Pembersihan Lokasi & Papan Nama Proyek', level: 2 }] },
    { code: '02', title: 'PEKERJAAN PENGUKURAN DAN ELEVASI', level: 1, children: [{ code: '02.01', title: 'Pengukuran Leveling Waterpass & Pematokan Kemiringan Air 2%', level: 2 }] },
    { code: '03', title: 'PEKERJAAN PEMBERSIHAN DAN STRIPPING', level: 1, children: [{ code: '03.01', title: 'Pengupasan Tanah Humus dan Pembuangan Sampah Organik', level: 2 }] },
    { code: '04', title: 'PEKERJAAN TANAH', level: 1, children: [{ code: '04.01', title: 'Galian Tanah untuk Badan Perkerasan & Penyesuaian Elevasi', level: 2 }] },
    { code: '05', title: 'PEKERJAAN PEMADATAN TANAH DASAR', level: 1, children: [{ code: '05.01', title: 'Pemadatan Tanah Dasar Menggunakan Baby Roller / Stamper Kodok', level: 2 }] },
    { code: '06', title: 'PEKERJAAN BASE / SUB-BASE', level: 1, children: [{ code: '06.01', title: 'Hamparan Sirtu / Makadam / Agregat Kelas B t=10-15cm Dipadatkan', level: 2 }] },
    { code: '07', title: 'PEKERJAAN BEDDING SAND (PASIR ALAS)', level: 1, children: [{ code: '07.01', title: 'Hamparan Pasir Kasar Ekstra t=4-5cm Diratakan dengan Jidar Alumunium', level: 2 }] },
    {
      code: '08',
      title: 'PEKERJAAN PEMASANGAN PAVING BLOCK',
      level: 1,
      children: [
        { code: '08.01', title: 'Pemasangan Paving Block Sesuai Spesifikasi Tebal & Pola Rencana', level: 2 },
        { code: '08.02', title: 'Pengisian Pasir Pengisi Celah (Joint Filler) & Pemadatan Plate Compactor', level: 2 },
        {
          code: '08.03',
          title: 'Pemasangan Guiding Block Difabel Kuning (Tipe Dot & Line)',
          level: 2,
          conditionalRule: { parameterId: 'has_guiding_block', operator: '==', value: true }
        }
      ]
    },
    {
      code: '09',
      title: 'PEKERJAAN KANSTIN / KERB PENGUNCI',
      level: 1,
      conditionalRule: { parameterId: 'has_kanstin', operator: '==', value: true },
      children: [{ code: '09.01', title: 'Pemasangan Kanstin Beton Pracetak Jepit K-250 & Penguncian Beton Rabat Belakang', level: 2 }]
    },
    {
      code: '10',
      title: 'PEKERJAAN DRAINASE SAMPING',
      level: 1,
      conditionalRule: { parameterId: 'has_drainage', operator: '==', value: true },
      children: [{ code: '10.01', title: 'Saluran Pembuangan Air Samping U-Ditch / Tali Air Inlet Air Hujan', level: 2 }]
    },
    { code: '11', title: 'PEKERJAAN FINISHING & PEMBERSIHAN AKHIR', level: 1, children: [{ code: '11.01', title: 'Penyapuan Sisa Pasir Pengisi, Perapihan Pertemuan Paving & BAST', level: 2 }] }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
