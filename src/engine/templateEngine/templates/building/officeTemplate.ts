import { ConstructionProjectTemplate } from '../../types';

export const officeTemplate: ConstructionProjectTemplate = {
  id: 'tmpl-building-office',
  name: 'Gedung Perkantoran',
  code: 'BLD-OFC-001',
  category: 'BUILDING',
  type: 'office-building',
  version: '2.0.0',
  description: 'Template gedung kantor komersial modern, kantor cabang, atau kantor instansi dengan curtain wall facade, ruang kerja open-plan, ruang server, dan lantai tinggi.',
  aliases: ['kantor', 'gedung perkantoran', 'ruko', 'office building', 'menara kantor', 'headquarters', 'gedung kantor'],
  keywords: ['kantor', 'office', 'perkantoran', 'ruko', 'lantai kantor', 'meeting room', 'curtain wall', 'downlight', 'server room', 'pantry', 'lift'],
  parameters: [
    { id: 'building_area', name: 'Luas Lantai Total', type: 'NUMBER', required: true, defaultValue: 2500, unit: 'm²', group: 'dimensions' },
    { id: 'num_floors', name: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 4, unit: 'lantai', min: 1, max: 40, group: 'dimensions' },
    { id: 'has_lobby', name: 'Memiliki Main Lobby & Reception Area', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_pantry', name: 'Memiliki Pantry / Breakroom Tiap Lantai', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_server_room', name: 'Memiliki Data Center / Ruang Server Khusus (FM200)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_basement', name: 'Memiliki Lantai Parkir Bawah Tanah (Basement)', type: 'BOOLEAN', required: false, defaultValue: false, group: 'specifications' },
    { id: 'has_lift', name: 'Memiliki Passenger Lift / Elevator', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_curtain_wall', name: 'Memiliki Façade Kaca Curtain Wall & ACP', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_hvac', name: 'Sistem Pendingin HVAC VRV Central', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' },
    { id: 'has_fire_protection', name: 'Sistem Fire Alarm, Sprinkler & Hydrant', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
  ],
  assumptionRules: [
    {
      parameterId: 'has_lift',
      condition: { parameterId: 'num_floors', operator: '>=', value: 4 },
      assumedValue: true,
      confidence: 0.95,
      reasoning: 'Gedung kantor 4 lantai atau lebih disyaratkan memiliki lift'
    }
  ],
  validationRules: [
    { id: 'VAL-OFC-1', name: 'Luas Kantor Positif', severity: 'ERROR', expression: 'building_area > 0', errorMessage: 'Luas kantor harus lebih dari 0 m².' }
  ],
  quantityRules: [
    { wbsCode: '02.01', formula: 'building_area * 0.4', unit: 'm²', variables: ['building_area'], description: 'Luas façade curtain wall kaca low-e' },
    { wbsCode: '03.01', formula: 'building_area * 0.9', unit: 'm²', variables: ['building_area'], description: 'Luas plafon akustik office tile 60x60' }
  ],
  wbsHierarchy: [
    {
      code: '01',
      title: 'PEKERJAAN STRUKTUR BERTINGKAT',
      level: 1,
      children: [
        { code: '01.01', title: 'Pondasi Dalam Tiang Pancang / Bored Pile', level: 2 },
        { code: '01.02', title: 'Struktur Rangka Beton / Baja Kolom & Balok Tinggi Lantai 4m', level: 2 },
        {
          code: '01.03',
          title: 'Struktur Basement & Dinding Penahan Tanah (Retaining Wall)',
          level: 2,
          conditionalRule: { parameterId: 'has_basement', operator: '==', value: true }
        }
      ]
    },
    {
      code: '02',
      title: 'PEKERJAAN FAÇADE EKSTERIOR & KACA',
      level: 1,
      children: [
        {
          code: '02.01',
          title: 'Curtain Wall Kaca Panas Low-E Tempered 8mm & Mullion Aluminium',
          level: 2,
          conditionalRule: { parameterId: 'has_curtain_wall', operator: '==', value: true }
        },
        { code: '02.02', title: 'Cladding Aluminium Composite Panel (ACP) PVDF Seven', level: 2 }
      ]
    },
    {
      code: '03',
      title: 'PEKERJAAN ARSITEKTUR & INTERIOR KANTOR',
      level: 1,
      children: [
        {
          code: '03.01',
          title: 'Main Lobby, Reception Desk Marmer & Access Control Flap Barrier',
          level: 2,
          conditionalRule: { parameterId: 'has_lobby', operator: '==', value: true }
        },
        { code: '03.02', title: 'Partisi Kaca Frameless Tempered 10mm Ruang Rapat & Direksi', level: 2 },
        { code: '03.03', title: 'Plafon Akustik Mineral Fiber Tile 60x60 T-Grid', level: 2 },
        { code: '03.04', title: 'Lantai Karpet Tile Commercial Heavy Duty & Granit Koridor', level: 2 },
        {
          code: '03.05',
          title: 'Pantry Bersih Karyawan Kitchen Set Stainless & Sink',
          level: 2,
          conditionalRule: { parameterId: 'has_pantry', operator: '==', value: true }
        }
      ]
    },
    {
      code: '04',
      title: 'PEKERJAAN DATA CENTER & RUANG SERVER',
      level: 1,
      conditionalRule: { parameterId: 'has_server_room', operator: '==', value: true },
      children: [
        { code: '04.01', title: 'Raised Floor Anti-Static Calium Sulphate t=35mm Tinggi 30cm', level: 2 },
        { code: '04.02', title: 'Fire Suppression System Gas FM200 Otomatis Ruang Server', level: 2 },
        { code: '04.03', title: 'Precision Air Conditioning (PAC) Server & Rak Server 42U', level: 2 }
      ]
    },
    {
      code: '05',
      title: 'PEKERJAAN MEP & TRANSPORTASI VERTIKAL',
      level: 1,
      children: [
        {
          code: '05.01',
          title: 'Lift Penumpang Kecepatan Tinggi 1.5 m/s Kapasitas 15 Orang',
          level: 2,
          conditionalRule: { parameterId: 'has_lift', operator: '==', value: true }
        },
        {
          code: '05.02',
          title: 'HVAC Sentral VRV / VRF dengan Outdoor Rooftop',
          level: 2,
          conditionalRule: { parameterId: 'has_hvac', operator: '==', value: true }
        },
        {
          code: '05.03',
          title: 'Pencahayaan LED Downlight & Pop-up Floor Electrical Outlet',
          level: 2
        }
      ]
    }
  ],
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z'
};
