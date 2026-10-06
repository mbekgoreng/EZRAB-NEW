import { ConstructionProjectTemplate } from '../../types';

export const hospitalTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-hospital',
  name: 'Rumah Sakit & Fasilitas Kesehatan',
  code: 'BLD-HSP-001',
  category: 'BUILDING',
  type: 'hospital',
  version: '2.0.0',
  description: 'Template fasilitas kesehatan dan rumah sakit tipe C/B/A sesuai standar Kemenkes & Permenkes dengan sistem ruang steril, gas medis, HEPA filter, dan ruang operasi.',
  aliases: ['rumah sakit', 'rsud', 'rsia', 'klinik rawat inap', 'puskesmas', 'medical center', 'hospital'],
  keywords: ['rumah sakit', 'hospital', 'igd', 'rawat inap', 'icu', 'operasi', 'radiologi', 'laboratorium', 'farmasi', 'gas medis', 'hepa', 'timbal'],
  parameters: [
    { id: 'building_area', name: 'Luas Bangunan Total', type: 'NUMBER', required: true, defaultValue: 6000, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 4, unit: 'lantai', min: 1, max: 20, group: 'dimensions' },
    { id: 'bed_capacity', name: 'Kapasitas Tempat Tidur', type: 'NUMBER', required: false, defaultValue: 120, unit: 'bed', group: 'general' },
    { id: 'has_igd', name: 'Memiliki Ruang IGD & Trauma Center', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_icu', name: 'Memiliki Fasilitas ICU / ICCU / PICU', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_operating_room', name: 'Memiliki Kamar Operasi (OK) Bedah Sentral', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_radiology', name: 'Memiliki Ruang Radiologi & X-Ray (Lead Lined)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_laboratory', name: 'Memiliki Laboratorium Patologi & Darah', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_pharmacy', name: 'Memiliki Instalasi Farmasi & Gudang Obat', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_medical_gas', name: 'Instalasi Central Gas Medis (O2, N2O, Vacuum)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_hepa_filter', name: 'Sistem HVAC Tekanan Positif / Negatif + HEPA Filter', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_bed_lift', name: 'Memiliki Bed Elevator Khusus Pasien Brankar', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_ipal_medis', name: 'Instalasi Pengolahan Air Limbah Medis (IPAL/B3)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'bed_capacity',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'building_area * 0.02',
      confidence: 0.85,
      reasoning: 'Rasio standar luasan rumah sakit per bed rawat inap rata-rata 50 m2/bed sesuai standar Kemenkes'
    }
  ],
  validationRules: [
    { id: 'VAL-HSP-1', name: 'Luas RS Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas bangunan RS harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '01.01', formula: 'building_area * 0.35', unit: 'm³', variables: ['building_area'], description: 'Volume galian & pondasi RS' },
    { wbsCode: '03.01', formula: 'building_area * 0.8', unit: 'm²', variables: ['building_area'], description: 'Luas lantai vinyl anti-bakteri' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN STRUKTUR UTAMA TAHAN GEMPA',
      level: 1,
      children: [
        { code: '01.01', title: 'Pondasi Bored Pile & Pile Cap', level: 2 },
        { code: '01.02', title: 'Struktur Rangka Beton Tahan Gempa K-350', level: 2 },
        { code: '01.03', title: 'Ramp Akses Pasien Evakuasi', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN ARSITEKTUR & FINISHING HYGIENIC',
      level: 1,
      children: [
        { code: '02.01', title: 'Lantai Vinyl Antibakteri Homogeneous Medis', level: 2 },
        { code: '02.02', title: 'Dinding Cat Epoksi / Anti Mikroba Mudah Dibersihkan', level: 2 },
        { code: '02.03', title: 'Pintu Hermetic Otomatis & Kusen Sanitair Ruang Khusus', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN RUANG MEDIS KHUSUS',
      level: 1,
      children: [
        {
          code: '03.01',
          title: 'Ruang IGD, Ruang Resusitasi & Triage',
          level: 2,
          conditionalRule: { parameterId: 'has_igd', operator: '==', value: true }
        },
        {
          code: '03.02',
          title: 'Kamar Operasi (OK) Dinding Modular Panel & Lampu Bedah',
          level: 2,
          conditionalRule: { parameterId: 'has_operating_room', operator: '==', value: true }
        },
        {
          code: '03.03',
          title: 'Ruang ICU / ICCU / HCU & Monitoring Pasien',
          level: 2,
          conditionalRule: { parameterId: 'has_icu', operator: '==', value: true }
        },
        {
          code: '03.04',
          title: 'Ruang Radiologi Pelapisan Timbal (Pb) 2-3 mm Proteksi Radiasi',
          level: 2,
          conditionalRule: { parameterId: 'has_radiology', operator: '==', value: true }
        },
        {
          code: '03.05',
          title: 'Laboratorium Medis Biosafety & Ruang Farmasi',
          level: 2,
          conditionalRule: { parameterId: 'has_laboratory', operator: '==', value: true }
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN INSTALASI GAS MEDIS & SISTEM SENTRAL',
      level: 1,
      conditionalRule: { parameterId: 'has_medical_gas', operator: '==', value: true },
      children: [
        { code: '04.01', title: 'Sentral Manifold Tabung Oksigen & Medis O2, N2O, Compressed Air', level: 2 },
        { code: '04.02', title: 'Pipa Tembaga Standar Medis ASTM B819 & Bed Head Unit Ruang Pasien', level: 2 }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN HVAC SENTRAL & HEPA FILTER RUANG STERIL',
      level: 1,
      conditionalRule: { parameterId: 'has_hepa_filter', operator: '==', value: true },
      children: [
        { code: '05.01', title: 'Air Handling Unit (AHU) Bersih & Ducting Insulasi', level: 2 },
        { code: '05.02', title: 'HEPA Filter Kelas H14 Tekanan Positif (OK/ICU) & Negatif (Isolasi)', level: 2 }
      ]
    },
    {
      code: '06',
      title: 'PEKERJAAN TRANSPORTASI VERTIKAL (BED LIFT)',
      level: 1,
      conditionalRule: { parameterId: 'has_bed_lift', operator: '==', value: true },
      children: [
        { code: '06.01', title: 'Lift Khusus Bed / Pasien Kapasitas 1600kg Kecepatan 1 m/s', level: 2 },
        { code: '06.02', title: 'Lift Penumpang Biasa & Lift Barang Service', level: 2 }
      ]
    },
    {
      code: '07',
      title: 'PEKERJAAN PENGOLAHAN LIMBAH & UTILITAS RS',
      level: 1,
      children: [
        {
          code: '07.01',
          title: 'Unit IPAL Medis Sistem Aerob/Anaerob & Klorinasi',
          level: 2,
          conditionalRule: { parameterId: 'has_ipal_medis', operator: '==', value: true }
        },
        { code: '07.02', title: 'TPS Limbah B3 Medis & Insenerator/Autoclave Limbah Padat', level: 2 },
        { code: '07.03', title: 'Sistem Kelistrikan UPS Medical Grade & Dual Backup Genset', level: 2 }
      ]
    },
    {
      code: '08',
      title: 'PEKERJAAN TESTING & COMMISSIONING & SERTIFIKASI BAPETEN',
      level: 1,
      children: [
        { code: '08.01', title: 'Uji Kalibrasi Gas Medis & Particle Count Ruang Bersih', level: 2 },
        { code: '08.02', title: 'Uji Kebocoran Radiasi (Bapeten) & Sertifikasi Kelayakan', level: 2 }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
