import { ConstructionProjectTemplate } from '../../types';

export const parkingTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-parking',
  name: 'Gedung Parkir Multi-Lantai',
  code: 'BLD-PRK-001',
  category: 'BUILDING',
  type: 'parking-building',
  version: '2.0.0',
  description: 'Gedung parkir multi-lantai struktur baja WF & pelat lantai bondek composite, dilengkapi ramp melingkar bertekstur grooved anti-slip, marka cat epoxy, wheel stopper, dan exhaust jet fan.',
  aliases: ['gedung parkir', 'parkiran', 'fasilitas parkir', 'multistorey parking', 'carpark building', 'gedung parkir mobil'],
  keywords: ['gedung parkir', 'parkir', 'ramp', 'baja wf', 'composite slab', 'marking marka jalan', 'wheel stopper', 'jet fan', 'barrier gate'],
  parameters: [
    { id: 'building_area', name: 'Total Luas Lantai Parkir', type: 'NUMBER', required: true, defaultValue: 4000, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai / Tingkat Parkir', type: 'NUMBER', required: true, defaultValue: 4, unit: 'lantai', min: 2, max: 12, group: 'dimensions' },
    { id: 'vehicle_capacity', name: 'Kapasitas Kendaraan (Slot Mobil)', type: 'NUMBER', required: false, defaultValue: 160, unit: 'mobil', group: 'general' },
    { id: 'has_ramp', name: 'Memiliki Ramp Sirkulasi Naik/Turun Kendaraan', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_lift', name: 'Memiliki Lift Penumpang Pengguna Parkir', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_jet_fan', name: 'Sistem Ventilasi Induksi Exhaust Jet Fan CO Sensor', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_barrier_gate', name: 'Sistem Tiket Otomatis & Barrier Gate Parkir', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_fire_sprinkler', name: 'Sistem Sprinkler Otomatis & Hydrant Gedung Parkir', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'vehicle_capacity',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'Math.round(building_area / 25)',
      confidence: 0.9,
      reasoning: 'Rasio standar ruang parkir termasuk sirkulasi manuver adalah 25 m2 per lot mobil'
    }
  ],
  validationRules: [
    { id: 'VAL-PRK-1', name: 'Luas Gedung Parkir Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas gedung parkir harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '02.01', formula: 'building_area * 0.05', unit: 'ton', variables: ['building_area'], description: 'Estimasi tonase baja WF kolom dan balok gedung parkir' },
    { wbsCode: '04.01', formula: 'building_area', unit: 'm²', variables: ['building_area'], description: 'Luas cat lantai epoxy coating + marka lot parkir' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN PONDASI DAN STRUKTUR BAJA WF',
      level: 1,
      children: [
        { code: '01.01', title: 'Pondasi Bored Pile D60cm & Pile Cap Beban Berat', level: 2 },
        { code: '01.02', title: 'Kolom & Balok Utama Rangka Baja WF 400-500 Hot Rolled', level: 2 },
        { code: '01.03', title: 'Pelat Lantai Bondek Galvanis t=0.75mm Cor Beton K-350 Wiremesh M10', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN RAMP SIRKULASI KENDARAAN',
      level: 1,
      conditionalRule: { parameterId: 'has_ramp', operator: '==', value: true },
      children: [
        { code: '02.01', title: 'Struktur Ramp Melingkar / Lurus Beton Bertulang Kemiringan Maks 15%', level: 2 },
        { code: '02.02', title: 'Finishing Permukaan Ramp Grooving Tali Air Anti Selip / Texture Coating', level: 2 },
        { code: '02.03', title: 'Pagar Pengaman Parapet Dinding Beton Crash Barrier', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN SAFETY BARRIER, MARKA & PENGATUR LALU LINTAS',
      level: 1,
      children: [
        { code: '03.01', title: 'Lantai Cat Epoxy Polyurethane Anti Slip & Penomoran Lot Parkir', level: 2 },
        { code: '03.02', title: 'Rubber Wheel Stopper Penahan Ban & Rubber Corner Guard Pelindung Kolom', level: 2 },
        { code: '03.03', title: 'Cermin Tikungan Convex Mirror & Rambu Petunjuk Arah / Tinggi Maksimal', level: 2 },
        {
          code: '03.04',
          title: 'Portal Tiket Otomatis, Boom Barrier Gate & Ruang Pos Kasir',
          level: 2,
          conditionalRule: { parameterId: 'has_barrier_gate', operator: '==', value: true }
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN MEP, VENTILASI & PEMADAM KEBAKARAN',
      level: 1,
      children: [
        {
          code: '04.01',
          title: 'Sistem Ventilasi Induksi Jet Fan Pendorong Asap & Sensor Karbon Monoksida (CO)',
          level: 2,
          conditionalRule: { parameterId: 'has_jet_fan', operator: '==', value: true }
        },
        {
          code: '04.02',
          title: 'Sistem Sprinkler Otomatis Suhu Tinggi & Pilar Hydrant Setiap Lantai',
          level: 2,
          conditionalRule: { parameterId: 'has_fire_sprinkler', operator: '==', value: true }
        },
        {
          code: '04.03',
          title: 'Lift Penumpang Kapasitas 10 Orang Menghubungkan Lantai Parkir',
          level: 2,
          conditionalRule: { parameterId: 'has_lift', operator: '==', value: true }
        },
        { code: '04.04', title: 'Tangga Darurat Dilengkapi Pintu Tahan Api 2 Jam', level: 2 }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
