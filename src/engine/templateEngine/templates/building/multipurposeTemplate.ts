import { ConstructionProjectTemplate } from '../../types';

export const multipurposeTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-multipurpose',
  name: 'Gedung Serba Guna & Convention Hall',
  code: 'BLD-MLT-001',
  category: 'BUILDING',
  type: 'multipurpose-building',
  version: '2.0.0',
  description: 'Gedung serbaguna bentang lebar, auditorium, convention hall, balai pertemuan, dan GOR dengan tata suara akustik, panggung, dan MEP lengkap.',
  aliases: ['gedung serbaguna', 'convention hall', 'auditorium', 'balai pertemuan', 'gor', 'hall', 'gedung serba guna'],
  keywords: ['serbaguna', 'pertemuan', 'auditorium', 'bentang lebar', 'convention', 'baja wf', 'atap space frame', 'hall', 'panggung', 'sound system'],
  parameters: [
    { id: 'building_area', name: 'Luas Bangunan', type: 'NUMBER', required: true, defaultValue: 1800, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai / Mezanin', type: 'NUMBER', required: true, defaultValue: 2, unit: 'lantai', group: 'dimensions' },
    { id: 'capacity_people', name: 'Kapasitas Tampung Orang', type: 'NUMBER', required: false, defaultValue: 1000, unit: 'orang', group: 'general' },
    { id: 'has_auditorium', name: 'Memiliki Ruang Hall Utama / Auditorium', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_stage', name: 'Memiliki Panggung / Stage Permanen', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_backstage', name: 'Memiliki Ruang Backstage / Ruang Ganti Artis', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_meeting_room', name: 'Memiliki Ruang Rapat / Breakout Room', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_kitchen', name: 'Memiliki Dapur Persiapan Katering (Pantry)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_sound_system', name: 'Sistem Tata Suara Profesional & Akustik', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_stage_lighting', name: 'Lighting Panggung & DMX Control System', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_hvac', name: 'Sistem Pendingin Sentral / Split Duct', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_fire_protection', name: 'Sistem Proteksi Kebakaran Hydrant & APAR', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'capacity_people',
      condition: { parameterId: 'building_area', operator: '>', value: 0 },
      assumedValue: 'building_area * 0.7',
      confidence: 0.85,
      reasoning: 'Rasio standar kapasitas auditorium standing/theater sekitar 1.2-1.5 m2 per orang'
    }
  ],
  validationRules: [
    { id: 'VAL-MLT-1', name: 'Luas Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas gedung serbaguna harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '03.01', formula: 'building_area * 0.045', unit: 'ton', variables: ['building_area'], description: 'Estimasi tonase baja WF/space frame' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN PERSIAPAN & PONDASI STRUKTUR',
      level: 1,
      children: [
        { code: '01.01', title: 'Pembersihan Lahan & Pengukuran Theodolite', level: 2 },
        { code: '01.02', title: 'Pondasi Tiang Pancang / Bored Pile & Pedestal Baja', level: 2 }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN STRUKTUR BAJA BENTANG LEBAR',
      level: 1,
      children: [
        { code: '02.01', title: 'Kolom & Kuda-kuda Rangka Baja WF / Pipa Space Frame', level: 2 },
        { code: '02.02', title: 'Gording CNP, Ikatan Angin, & Atap Metal Seam Insulasi Suara', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN HALL AUDITORIUM & PANGGUNG',
      level: 1,
      children: [
        {
          code: '03.01',
          title: 'Konstruksi Panggung Utama (Stage) Cor / Rangka Kayu Jati',
          level: 2,
          conditionalRule: { parameterId: 'has_stage', operator: '==', value: true }
        },
        {
          code: '03.02',
          title: 'Ruang Backstage, Ruang Tunggu VIP & Toilet Artis',
          level: 2,
          conditionalRule: { parameterId: 'has_backstage', operator: '==', value: true }
        },
        {
          code: '03.03',
          title: 'Ruang Rapat (Meeting Room) & Kantor Pengelola',
          level: 2,
          conditionalRule: { parameterId: 'has_meeting_room', operator: '==', value: true }
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN AKUSTIK & TATA SUARA',
      level: 1,
      children: [
        {
          code: '04.01',
          title: 'Panel Dinding Akustik Perforated Wood & Rockwool Peredam Gema',
          level: 2
        },
        {
          code: '04.02',
          title: 'Line Array Speaker, Audio Mixer Digital, & Wiring Panggung',
          level: 2,
          conditionalRule: { parameterId: 'has_sound_system', operator: '==', value: true }
        },
        {
          code: '04.03',
          title: 'Stage Lighting Moving Head, Par LED, & Rigging Truss Panggung',
          level: 2,
          conditionalRule: { parameterId: 'has_stage_lighting', operator: '==', value: true }
        }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN MEP, HVAC & TATA UDARA',
      level: 1,
      children: [
        {
          code: '05.01',
          title: 'Tata Udara Sentral Split Duct / VRV Kapasitas Besar',
          level: 2,
          conditionalRule: { parameterId: 'has_hvac', operator: '==', value: true }
        },
        {
          code: '05.02',
          title: 'Instalasi Fire Hydrant, Box Hydrant & Sprinkler Hall',
          level: 2,
          conditionalRule: { parameterId: 'has_fire_protection', operator: '==', value: true }
        },
        { code: '05.03', title: 'Dapur Pantry Persiapan Katering & Toilet Umum Pengunjung', level: 2 }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
