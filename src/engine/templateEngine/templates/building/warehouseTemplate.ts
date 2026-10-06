import { ConstructionProjectTemplate } from '../../types';

export const warehouseTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-warehouse',
  name: 'Gudang & Workshop Baja WF',
  code: 'BLD-WRH-001',
  category: 'BUILDING',
  type: 'warehouse',
  version: '2.0.0',
  description: 'Gudang logistik, pabrik, dan bengkel konstruksi baja WF bentang lebar, lantai cor k-300 floor hardener heavy duty, rangka hollow/gording, atap spandek insulasi, dan loading dock.',
  aliases: ['gudang', 'warehouse', 'pabrik', 'workshop', 'hangar', 'storage', 'depot logistik'],
  keywords: ['gudang', 'warehouse', 'baja wf', 'hollow', 'atap spandek', 'cladding', 'floor hardener', 'loading dock', 'pabrik', 'gording cnp', 'insulasi'],
  parameters: [
    { id: 'building_area', name: 'Luas Lantai Gudang', type: 'NUMBER', required: true, defaultValue: 1500, unit: 'm²', group: 'dimensions' },
    { id: 'clear_height', name: 'Tinggi Bebas Kolom', type: 'NUMBER', required: false, defaultValue: 8, unit: 'm', group: 'dimensions' },
    { id: 'span_width', name: 'Bentang Bebas Rafter WF', type: 'NUMBER', required: false, defaultValue: 24, unit: 'm', group: 'dimensions' },
    { id: 'floor_capacity_ton', name: 'Kekuatan Beban Lantai', type: 'NUMBER', required: false, defaultValue: 5, unit: 'ton/m²', group: 'specifications' },
    { id: 'has_loading_dock', name: 'Memiliki Fasilitas Loading Dock Truk Kontainer', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_office', name: 'Memiliki Kantor Administrasi Gudang Mezanin', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_security_post', name: 'Memiliki Pos Security & Gerbang Timbangan', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_fire_protection', name: 'Sistem Hydrant Gudang & Smoke Heat Detector', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'clear_height',
      assumedValue: 7,
      confidence: 0.9,
      reasoning: 'Tinggi standar kolom gudang logistik modern adalah 7-8 meter untuk manuver forklift'
    }
  ],
  validationRules: [
    { id: 'VAL-WRH-1', name: 'Luas Gudang Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas gudang harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '02.01', formula: 'building_area * 0.04', unit: 'ton', variables: ['building_area'], description: 'Estimasi berat struktur baja WF kolom & rafter' },
    { wbsCode: '04.01', formula: 'building_area', unit: 'm²', variables: ['building_area'], description: 'Luas cor lantai k-300 t=15cm + floor hardener' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN PONDASI FOOTPLAT & PEDESTAL BETON',
      level: 1,
      children: [
        { code: '01.01', title: 'Pondasi Footplat / Strauss Pile Kedalaman 4-8m', level: 2 },
        { code: '01.02', title: 'Pedestal Beton Bertulang K-300 Angkur Baut Baja Grade 8.8', level: 2 },
        { code: '01.03', title: 'Tie Beam / Sloof Beton Pengikat Antar Kolom', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN RANGKA STRUKTUR BAJA WF',
      level: 1,
      children: [
        { code: '02.01', title: 'Kolom Utama Baja IWF 300x150 / 350x175 Hot Rolled', level: 2 },
        { code: '02.02', title: 'Rafter Kuda-Kuda Baja IWF & Honeycomb Bentang Lebar', level: 2 },
        { code: '02.03', title: 'Rangka Gording Besi Hollow Galvanis / CNP 150x50x20x2.3mm', level: 2 },
        { code: '02.04', title: 'Bracing / Ikatan Angin Besi Bulat D16-19mm & Turnbuckle Jarum Keras', level: 2 },
        { code: '02.05', title: 'Cat Dasar Anti Karat Epoxy Primer Zinc Chromate 2 Lapis', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN ATAP & CLADDING DINDING',
      level: 1,
      children: [
        { code: '03.01', title: 'Atap Spandek Zincalume Tebal 0.45mm + Insulasi Glasswool Peredam Panas', level: 2 },
        { code: '03.02', title: 'Dinding Bawah Pasangan Bata Plester T=2.5m + Cladding Spandek Atas', level: 2 },
        { code: '03.03', title: 'Talang Air Plat Galvanis / Stainless Steel & Pipa Buang PVC 4-6 Inch', level: 2 },
        { code: '03.04', title: 'Roof Louver & Turbin Ventilator Stainless Steel Sirkulasi Udara Alami', level: 2 }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN LANTAI HEAVY DUTY COR K-300 & FLOOR HARDENER',
      level: 1,
      children: [
        { code: '04.01', title: 'Plastik Cor Polietilen Penahan Uap Air Tanah', level: 2 },
        { code: '04.02', title: 'Pengecoran Lantai Beton K-300 Tebal 15-20cm Tulangan Wiremesh M8 2 Lapis', level: 2 },
        { code: '04.03', title: 'Finishing Trowel + Floor Hardener Metallic / Non-Metallic Sika 5 kg/m²', level: 2 },
        { code: '04.04', title: 'Pemotongan Expansion Joint Cutter t=5cm & Pengisian Sealant Elastis', level: 2 }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN LOADING DOCK & FASILITAS PENDUKUNG',
      level: 1,
      children: [
        {
          code: '05.01',
          title: 'Area Loading Dock Ketinggian 1.2m Truk & Dock Leveler Hidrolik',
          level: 2,
          conditionalRule: { parameterId: 'has_loading_dock', operator: '==', value: true }
        },
        { code: '05.02', title: 'Pintu Rolling Door Industri / Sliding Door Rangka Hollow Plat Galvanis', level: 2 },
        {
          code: '05.03',
          title: 'Kantor Administrasi Gudang Mezanin / Lantai 1 & Toilet Karyawan',
          level: 2,
          conditionalRule: { parameterId: 'has_office', operator: '==', value: true }
        },
        {
          code: '05.04',
          title: 'Pos Keamanan / Security & Lampu Sorot Keliling Gudang LED 100W',
          level: 2,
          conditionalRule: { parameterId: 'has_security_post', operator: '==', value: true }
        },
        {
          code: '05.05',
          title: 'Instalasi Fire Hydrant Pillar Luar & Box Hydrant Dalam Gudang',
          level: 2,
          conditionalRule: { parameterId: 'has_fire_protection', operator: '==', value: true }
        }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
