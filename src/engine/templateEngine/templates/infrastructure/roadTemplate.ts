import { ConstructionProjectTemplate } from '../../types';

export const roadTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-infra-road',
  name: 'Jalan Raya Aspal & Beton',
  code: 'INF-ROD-001',
  category: 'INFRASTRUCTURE',
  type: 'road',
  version: '2.0.0',
  description: 'Pembangunan atau peningkatan jalan standar Bina Marga / Dinas PU dengan 20 divisi WBS lengkap mencakup perkerasan aspal (AC-WC/AC-BC) atau perkerasan kaku beton (rigid pavement).',
  aliases: ['jalan', 'jalan aspal', 'jalan beton', 'rigid pavement', 'hotmix', 'jalan desa', 'pelebaran jalan', 'jalan lingkungan', 'jalan kawasan'],
  keywords: ['jalan', 'aspal', 'beton', 'hotmix', 'perkerasan', 'subgrade', 'lpa', 'lpb', 'rigid', 'marka', 'rambu', 'bahu jalan', 'kerb'],
  parameters: [
    { id: 'road_length', name: 'Panjang Jalan', type: 'NUMBER', required: true, defaultValue: 1000, unit: 'm', min: 10, max: 100000, group: 'dimensions' },
    { id: 'road_width', name: 'Lebar Perkerasan Efektif', type: 'NUMBER', required: true, defaultValue: 6, unit: 'm', min: 2, max: 50, group: 'dimensions' },
    { id: 'shoulder_width', name: 'Lebar Bahu Jalan Kiri & Kanan', type: 'NUMBER', required: false, defaultValue: 1.5, unit: 'm', group: 'dimensions' },
    { id: 'pavement_type', name: 'Jenis Perkerasan Utama', type: 'SELECT', required: true, defaultValue: 'asphalt', options: [{ label: 'Aspal Hotmix (Flexible Pavement)', value: 'asphalt' }, { label: 'Beton Semen K-350 (Rigid Pavement)', value: 'concrete' }], group: 'specifications' },
    { id: 'road_variant', name: 'Varian Klasifikasi Jalan', type: 'SELECT', required: false, defaultValue: 'standard', options: [{ label: 'Jalan Kolektor / Arteri', value: 'standard' }, { label: 'Jalan Lingkungan Pemukiman', value: 'jalan_lingkungan' }, { label: 'Jalan Kawasan Industri', value: 'jalan_kawasan' }], group: 'general' },
    { id: 'pavement_thickness_cm', name: 'Tebal Lapis Permukaan', type: 'NUMBER', required: false, defaultValue: 8, unit: 'cm', group: 'specifications' },
    { id: 'has_drainage', name: 'Memiliki Saluran Drainase Tepi (U-Ditch/Pasangan Batu)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_kerb', name: 'Memiliki Kerb / Kanstin Pembatas Jalan', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_markings', name: 'Marka Garis Jalan Termoplastik', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_signs', name: 'Rambu Petunjuk & Peringatan Jalan', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'pavement_thickness_cm',
      condition: { parameterId: 'pavement_type', operator: '==', value: 'concrete' },
      assumedValue: 20,
      confidence: 0.95,
      reasoning: 'Tebal rigid pavement beton standar Bina Marga rata-rata 20 cm'
    }
  ],
  validationRules: [
    { id: 'VAL-ROD-1', name: 'Panjang Jalan Positif', severity: 'ERROR', expression: 'road_length > 0', errorMessage: 'Panjang jalan harus lebih dari 0 meter.' },
    { id: 'VAL-ROD-2', name: 'Lebar Jalan Positif', severity: 'ERROR', expression: 'road_width > 0', errorMessage: 'Lebar jalan harus lebih dari 0 meter.' }
  ],
  quantityRules: [
    { wbsCode: '11.01.01', formula: 'road_length * road_width', unit: 'm²', variables: ['road_length', 'road_width'], description: 'Luas hamparan perkerasan jalan' },
    { wbsCode: '12.01.01', formula: 'road_length * road_width * 0.1', unit: 'ton', variables: ['road_length', 'road_width'], description: 'Estimasi tonase aspal hotmix' },
    { wbsCode: '12.02.01', formula: 'road_length * road_width * 0.2', unit: 'm³', variables: ['road_length', 'road_width'], description: 'Estimasi volume rigid beton' }
  ],
  wbsHierarchy: [
    { code: '01', title: 'PEKERJAAN PERSIAPAN', level: 1, children: [{ code: '01.01', title: 'Mobilisasi & Demobilisasi Alat Berat (Vibro Roller, Motor Grader, Finisher)', level: 2 }, { code: '01.02', title: 'Manajemen Rekayasa Lalu Lintas & Keselamatan K3 Konstruksi', level: 2 }] },
    { code: '02', title: 'PEKERJAAN SURVEY DAN REKAYASA LAPANGAN', level: 1, children: [{ code: '02.01', title: 'Pengukuran Topografi, Pemetaan Trase & Patok Sta Jalan', level: 2 }] },
    { code: '03', title: 'PEKERJAAN PEMBERSIHAN LAHAN', level: 1, children: [{ code: '03.01', title: 'Pembersihan Rumput, Semak Belukar & Stripping Humus (Clearing & Grubbing)', level: 2 }] },
    { code: '04', title: 'PEKERJAAN TANAH', level: 1, children: [{ code: '04.01', title: 'Perataan Kontur Badan Jalan Sesuai Elevasi Rencana', level: 2 }] },
    { code: '05', title: 'PEKERJAAN GALIAN', level: 1, children: [{ code: '05.01', title: 'Galian Tanah Biasa Badan Jalan & Pembuangan Sisa', level: 2 }] },
    { code: '06', title: 'PEKERJAAN TIMBUNAN', level: 1, children: [{ code: '06.01', title: 'Timbunan Pilihan / Berbutir Penstabil Tanah Dasar', level: 2 }] },
    { code: '07', title: 'PEKERJAAN PEMADATAN', level: 1, children: [{ code: '07.01', title: 'Pemadatan Tanah Dasar Menggunakan Vibro Roller 10-12 Ton', level: 2 }] },
    { code: '08', title: 'PEKERJAAN SUBGRADE (TANAH DASAR)', level: 1, children: [{ code: '08.01', title: 'Penyiapan Badan Jalan Subgrade Nilai CBR Min 6%', level: 2 }] },
    { code: '09', title: 'PEKERJAAN SUBBASE (LAPIS PONDASI BAWAH)', level: 1, children: [{ code: '09.01', title: 'Hamparan & Pemadatan Lapis Pondasi Agregat Kelas B (LPB) Tebal 15 cm', level: 2 }] },
    { code: '10', title: 'PEKERJAAN BASE (LAPIS PONDASI ATAS)', level: 1, children: [{ code: '10.01', title: 'Hamparan & Pemadatan Lapis Pondasi Agregat Kelas A (LPA) Tebal 15 cm', level: 2 }] },
    { code: '11', title: 'PEKERJAAN PERKERASAN (PRIME/TACK COAT)', level: 1, children: [{ code: '11.01', title: 'Lapis Resap Pengikat (Prime Coat) 0.8 L/m² Aspal Cair', level: 2 }, { code: '11.02', title: 'Lapis Perekat (Tack Coat) Aspal Emulsi 0.3 L/m²', level: 2 }] },
    {
      code: '12',
      title: 'PEKERJAAN LAPIS PERMUKAAN (ASPAL / BETON)',
      level: 1,
      children: [
        {
          code: '12.01',
          title: 'Perkerasan Lentur: Aspal Hotmix AC-BC t=6cm & AC-WC t=4cm',
          level: 2,
          conditionalRule: { parameterId: 'pavement_type', operator: '==', value: 'asphalt' }
        },
        {
          code: '12.02',
          title: 'Perkerasan Kaku: Beton Semen Rigid Pavement K-350 t=20cm + Tie Bar & Dowel',
          level: 2,
          conditionalRule: { parameterId: 'pavement_type', operator: '==', value: 'concrete' }
        }
      ]
    },
    { code: '13', title: 'PEKERJAAN BAHU JALAN', level: 1, children: [{ code: '13.01', title: 'Bahu Jalan Agregat Kelas S / Rabat Beton Samping', level: 2 }] },
    {
      code: '14',
      title: 'PEKERJAAN DRAINASE JALAN',
      level: 1,
      conditionalRule: { parameterId: 'has_drainage', operator: '==', value: true },
      children: [{ code: '14.01', title: 'Saluran Samping U-Ditch Precast 40x40 / Pasangan Batu Kali', level: 2 }]
    },
    {
      code: '15',
      title: 'PEKERJAAN KERB / KANSTIN',
      level: 1,
      conditionalRule: { parameterId: 'has_kerb', operator: '==', value: true },
      children: [{ code: '15.01', title: 'Pemasangan Kerb Beton Pracetak Tepi Jalan K-250', level: 2 }]
    },
    {
      code: '16',
      title: 'PEKERJAAN MARKA JALAN',
      level: 1,
      conditionalRule: { parameterId: 'has_markings', operator: '==', value: true },
      children: [{ code: '16.01', title: 'Marka Garis Jalan Termoplastik Putih & Kuning Reflektif Glass Beads', level: 2 }]
    },
    {
      code: '17',
      title: 'PEKERJAAN RAMBU LALU LINTAS',
      level: 1,
      conditionalRule: { parameterId: 'has_signs', operator: '==', value: true },
      children: [{ code: '17.01', title: 'Rambu Petunjuk, Larangan & Peringatan Plat Aluminium Standar Dishub', level: 2 }]
    },
    { code: '18', title: 'PEKERJAAN BANGUNAN PELENGKAP JALAN', level: 1, children: [{ code: '18.01', title: 'Pagar Pengaman Jalan (Guardrail W-Beam) & Delineator Reflektor', level: 2 }] },
    { code: '19', title: 'PEKERJAAN FINISHING & PERAPIHAN', level: 1, children: [{ code: '19.01', title: 'Pembersihan Ceceran Aspal / Agregat & Perapihan Talud Samping', level: 2 }] },
    { code: '20', title: 'TESTING, PENGUJIAN & SERAH TERIMA', level: 1, children: [{ code: '20.01', title: 'Core Drill Ketebalan Aspal / Kuat Tekan Beton Silinder', level: 2 }, { code: '20.02', title: 'Uji Kerataan Permukaan (IRI Test) & Berita Acara PHO/FHO', level: 2 }] }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
