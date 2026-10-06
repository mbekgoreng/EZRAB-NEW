import { ConstructionProjectTemplate } from '../../types';

export const hotelTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-hotel',
  name: 'Hotel & Hospitality',
  code: 'BLD-HTL-001',
  category: 'BUILDING',
  type: 'hotel',
  version: '2.0.0',
  description: 'Template gedung perhotelan komersial multi-lantai dengan fasilitas kamar, lobby, ballroom, kolam renang, dan MEP/HVAC sentral.',
  aliases: ['hotel', 'resort', 'penginapan', 'motel', 'kondominium hotel', 'condotel', 'guest house', 'boutique hotel'],
  keywords: ['hotel', 'resort', 'penginapan', 'bintang', 'kamar tamu', 'lobby', 'ballroom', 'lift', 'kolam renang', 'basement', 'hvac'],
  parameters: [
    { id: 'building_area', name: 'Luas Lantai Total', type: 'NUMBER', required: true, defaultValue: 4500, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 6, unit: 'lantai', min: 2, max: 50, group: 'dimensions' },
    { id: 'num_rooms', name: 'Jumlah Kamar Hotel', type: 'NUMBER', required: true, defaultValue: 60, unit: 'kamar', group: 'general' },
    { id: 'has_lobby', name: 'Memiliki Grand Lobby & Reception', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_restaurant', name: 'Memiliki Restoran / Coffee Shop', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_kitchen', name: 'Memiliki Central Kitchen Industrial', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_service_area', name: 'Memiliki Laundry & Service Area', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_lift', name: 'Memiliki Lift Penumpang / Service', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_basement', name: 'Memiliki Basement Parkir', type: 'BOOLEAN', required: false, defaultValue: false, group: 'specifications' },
    { id: 'has_pool', name: 'Memiliki Kolam Renang (Swimming Pool)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_ballroom', name: 'Memiliki Grand Ballroom / Function Hall', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_hvac', name: 'Sistem Pendingin HVAC VRV/Chiller Central', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_fire_protection', name: 'Sistem Fire Hydrant & Sprinkler', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'num_rooms',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'building_area * 0.013',
      confidence: 0.8,
      reasoning: 'Rasio standar luasan kamar hotel termasuk koridor sekitar 35-40 m2 per unit'
    },
    {
      parameterId: 'has_lift',
      condition: { parameterId: 'num_floors', operator: '>=', value: 4 },
      assumedValue: true,
      confidence: 0.95,
      reasoning: 'Bangunan hotel >= 4 lantai wajib menyediakan transportasi vertikal lift sesuai Permen PUPR'
    }
  ],
  validationRules: [
    { id: 'VAL-HTL-1', name: 'Luas Hotel Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas bangunan hotel harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '01.01.01', formula: 'building_area * 0.3', unit: 'm²', variables: ['building_area'], description: 'Area site perataan' },
    { wbsCode: '04.01.01', formula: 'building_area * 0.32', unit: 'm³', variables: ['building_area'], description: 'Total volume beton struktur hotel' },
    { wbsCode: '05.01.01', formula: 'num_rooms', unit: 'unit', variables: ['num_rooms'], description: 'Finishing kamar hotel' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN PERSIAPAN & MANAJEMEN K3',
      level: 1,
      children: [
        { code: '01.01', title: 'Pembersihan Lahan & Pagar Proyek', level: 2 },
        { code: '01.02', title: 'Tower Crane & Mobilisasi Alat Berat', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN TANAH & BASEMENT',
      level: 1,
      children: [
        { code: '02.01', title: 'Galian Tanah Umum Pondasi', level: 2 },
        {
          code: '02.02',
          title: 'Galian Struktur Basement & Dewatering',
          level: 2,
          conditionalRule: { parameterId: 'has_basement', operator: '==', value: true }
        }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN PONDASI (BORED PILE / PILE CAP)',
      level: 1,
      children: [
        { code: '03.01', title: 'Bored Pile D60-80cm Kedalaman 18-24m', level: 2 },
        { code: '03.02', title: 'Pile Cap & Tie Beam Beton Bertulang K-350', level: 2 }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN STRUKTUR ATAS',
      level: 1,
      children: [
        { code: '04.01', title: 'Kolom & Shearwall Core Lift Beton K-400', level: 2 },
        { code: '04.02', title: 'Balok & Pelat Lantai Post-Tension / Bondek K-350', level: 2 },
        { code: '04.03', title: 'Tangga Darurat & Fire Escape', level: 2 }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN ARSITEKTUR & KAMAR HOTEL',
      level: 1,
      children: [
        { code: '05.01', title: 'Finishing Interior Kamar Tamu (Standard, Deluxe, Suite)', level: 2 },
        { code: '05.02', title: 'Toilet Kamar Tamu (Sanitair Toto, Tempered Glass Shower)', level: 2 },
        { code: '05.03', title: 'Koridor Tamu Acoustic Carpet & Lighting Hotel', level: 2 }
      ]
    },
    {
      code: '06',
      title: 'PEKERJAAN LOBBY & RESTORAN',
      level: 1,
      children: [
        {
          code: '06.01',
          title: 'Finishing Grand Lobby, Receptionist & Lounge Marmer',
          level: 2,
          conditionalRule: { parameterId: 'has_lobby', operator: '==', value: true }
        },
        {
          code: '06.02',
          title: 'Restoran All-Day Dining & Buffet Counter',
          level: 2,
          conditionalRule: { parameterId: 'has_restaurant', operator: '==', value: true }
        }
      ]
    },
    {
      code: '07',
      title: 'PEKERJAAN KITCHEN & SERVICE AREA',
      level: 1,
      children: [
        {
          code: '07.01',
          title: 'Central Commercial Kitchen Stainless Steel & Exhaust Hood',
          level: 2,
          conditionalRule: { parameterId: 'has_kitchen', operator: '==', value: true }
        },
        {
          code: '07.02',
          title: 'Laundry Room, Linen Chute, & Ruang Karyawan',
          level: 2,
          conditionalRule: { parameterId: 'has_service_area', operator: '==', value: true }
        }
      ]
    },
    {
      code: '08',
      title: 'PEKERJAAN GRAND BALLROOM & MEETING ROOM',
      level: 1,
      conditionalRule: { parameterId: 'has_ballroom', operator: '==', value: true },
      children: [
        { code: '08.01', title: 'Ballroom Partisi Movable Operable Wall Acoustic STC 50', level: 2 },
        { code: '08.02', title: 'Chandelier, Stage Lighting & Sound System Ballroom', level: 2 }
      ]
    },
    {
      code: '09',
      title: 'PEKERJAAN SWIMMING POOL & FASILITAS REKREASI',
      level: 1,
      conditionalRule: { parameterId: 'has_pool', operator: '==', value: true },
      children: [
        { code: '09.01', title: 'Struktur Kolam Renang Beton Waterproofing K-350 & Mosaik', level: 2 },
        { code: '09.02', title: 'Pompa Sirkulasi, Sand Filter, Balancing Tank & Pool Deck', level: 2 }
      ]
    },
    {
      code: '10',
      title: 'PEKERJAAN MEP & HVAC SENTRAL',
      level: 1,
      children: [
        {
          code: '10.01',
          title: 'HVAC Sentral Chiller / VRV System & Fresh Air Ducting',
          level: 2,
          conditionalRule: { parameterId: 'has_hvac', operator: '==', value: true }
        },
        {
          code: '10.02',
          title: 'Fire Fighting: Sprinkler, Hydrant, Smoke Detector, FM200',
          level: 2,
          conditionalRule: { parameterId: 'has_fire_protection', operator: '==', value: true }
        },
        {
          code: '10.03',
          title: 'Lift Penumpang & Service Lift Hotel 1000kg',
          level: 2,
          conditionalRule: { parameterId: 'has_lift', operator: '==', value: true }
        },
        { code: '10.04', title: 'Genset Silent Standby Emergency 500-1000 kVA', level: 2 }
      ]
    },
    {
      code: '11',
      title: 'PEKERJAAN TESTING & COMMISSIONING & SERAH TERIMA',
      level: 1,
      children: [
        { code: '11.01', title: 'Testing Commissioning HVAC, Lift, Genset, Fire Alarm', level: 2 },
        { code: '11.02', title: 'Sertifikat Laik Fungsi (SLF) & Dokumen BAST', level: 2 }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
