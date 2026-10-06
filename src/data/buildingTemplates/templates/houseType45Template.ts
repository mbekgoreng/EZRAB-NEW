import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateSpace, TemplateWorkItem } from '../schema/types';
import { HOUSE_TYPE_36_WORK_ITEMS } from './houseType36Template';

/**
 * MASTER TEMPLATE: Rumah Tinggal Tipe 45 Satu Lantai
 * Standard Specification: Luas 45m2 (6x7.5m), 2 Kamar Tidur, 1 Kamar Mandi, Ruang Tamu, Dapur, Carport
 */

const DEFAULT_ASSUMPTIONS_T45: Record<string, TemplateAssumption> = {
  galian_width: {
    assumptionId: 'galian_width',
    label: 'Lebar Galian Pondasi',
    value: 0.8,
    unit: 'm',
    rationale: 'Lebar dasar galian tanah pondasi batu kali.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  galian_depth: {
    assumptionId: 'galian_depth',
    label: 'Kedalaman Galian Pondasi',
    value: 0.8,
    unit: 'm',
    rationale: 'Kedalaman pondasi tanah keras standar 1 lantai.',
    source: 'SNI',
    confidence: 0.92,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_height: {
    assumptionId: 'pondasi_height',
    label: 'Tinggi Pondasi Batu Kali',
    value: 0.65,
    unit: 'm',
    rationale: 'Tinggi trapesium batu kali.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_top_width: {
    assumptionId: 'pondasi_top_width',
    label: 'Lebar Atas Pondasi',
    value: 0.3,
    unit: 'm',
    rationale: 'Lebar atas pondasi.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_bottom_width: {
    assumptionId: 'pondasi_bottom_width',
    label: 'Lebar Bawah Pondasi',
    value: 0.65,
    unit: 'm',
    rationale: 'Lebar dasar pondasi.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  sloof_width: { assumptionId: 'sloof_width', label: 'Lebar Sloof', value: 0.15, unit: 'm', rationale: 'Lebar sloof 15 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  sloof_height: { assumptionId: 'sloof_height', label: 'Tinggi Sloof', value: 0.20, unit: 'm', rationale: 'Tinggi sloof 20 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  kolom_size: { assumptionId: 'kolom_size', label: 'Ukuran Kolom Praktis', value: 0.15, unit: 'm', rationale: 'Kolom praktis 15x15 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  ring_balok_size: { assumptionId: 'ring_balok_size', label: 'Ukuran Ring Balok', value: 0.15, unit: 'm', rationale: 'Ring balok 15x15 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  wall_height: { assumptionId: 'wall_height', label: 'Tinggi Dinding', value: 3.6, unit: 'm', rationale: 'Tinggi dinding bersih 3.6 m', source: 'BEST_PRACTICE', confidence: 0.95, editable: true, requiresConfirmation: false },
  roof_slope_angle: { assumptionId: 'roof_slope_angle', label: 'Kemiringan Atap', value: 30, unit: 'deg', rationale: 'Kemiringan atap 30 derajat', source: 'PUPR', confidence: 0.95, editable: true, requiresConfirmation: false },
  roof_overhang: { assumptionId: 'roof_overhang', label: 'Overstek Atap', value: 0.8, unit: 'm', rationale: 'Overstek teritisan 0.8 m', source: 'BEST_PRACTICE', confidence: 0.92, editable: true, requiresConfirmation: false },
};

const DEFAULT_SPACES_T45: TemplateSpace[] = [
  { id: 'sp-1', name: 'Ruang Tamu & Keluarga', defaultLength: 3.5, defaultWidth: 3.5, defaultArea: 12.25 },
  { id: 'sp-2', name: 'Kamar Tidur Utama', defaultLength: 3.5, defaultWidth: 3.0, defaultArea: 10.5 },
  { id: 'sp-3', name: 'Kamar Tidur Anak', defaultLength: 3.0, defaultWidth: 3.0, defaultArea: 9.0 },
  { id: 'sp-4', name: 'Kamar Mandi / WC', defaultLength: 2.0, defaultWidth: 1.5, defaultArea: 3.0, isWetArea: true },
  { id: 'sp-5', name: 'Dapur & Ruang Makan', defaultLength: 3.5, defaultWidth: 2.0, defaultArea: 7.0 },
  { id: 'sp-6', name: 'Teras Depan', defaultLength: 2.0, defaultWidth: 1.5, defaultArea: 3.0 },
];

const DEFAULT_PARAMETERS_T45: Record<string, TemplateParameter> = {
  buildingArea: { name: 'buildingArea', label: 'Luas Bangunan', type: 'area', unit: 'm²', required: true, defaultValue: 45, min: 35, max: 70, description: 'Luas lantai bersih.', source: 'template_default', confidence: 1.0 },
  buildingWidth: { name: 'buildingWidth', label: 'Lebar Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 6.0, min: 5.0, max: 10.0, description: 'Lebar muka bangunan.', source: 'template_default', confidence: 1.0 },
  buildingLength: { name: 'buildingLength', label: 'Panjang Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 7.5, min: 6.0, max: 15.0, description: 'Panjang ke belakang.', source: 'template_default', confidence: 1.0 },
  floorCount: { name: 'floorCount', label: 'Jumlah Lantai', type: 'integer', unit: 'lantai', required: true, defaultValue: 1, min: 1, max: 1, description: 'Jumlah lantai bangunan.', source: 'template_default', confidence: 1.0 },
  bedroomCount: { name: 'bedroomCount', label: 'Jumlah Kamar Tidur', type: 'count', unit: 'ruang', required: true, defaultValue: 2, min: 1, max: 3, description: 'Jumlah kamar tidur.', source: 'template_default', confidence: 1.0 },
  bathroomCount: { name: 'bathroomCount', label: 'Jumlah Kamar Mandi', type: 'count', unit: 'ruang', required: true, defaultValue: 1, min: 1, max: 2, description: 'Jumlah kamar mandi.', source: 'template_default', confidence: 1.0 },
  wallMaterial: { name: 'wallMaterial', label: 'Material Dinding', type: 'enum', required: true, defaultValue: 'BATA_RINGAN', allowedValues: ['BATA_RINGAN', 'BATA_MERAH', 'BATAKO'], description: 'Material dinding utama.', source: 'template_default', confidence: 0.95 },
  roofCover: { name: 'roofCover', label: 'Penutup Atap', type: 'enum', required: true, defaultValue: 'GENTENG_METAL', allowedValues: ['GENTENG_METAL', 'SPANDEK', 'GENTENG_BETON', 'GENTENG_KERAMIK'], description: 'Jenis penutup atap.', source: 'template_default', confidence: 0.95 },
  floorFinish: { name: 'floorFinish', label: 'Penutup Lantai', type: 'enum', required: true, defaultValue: 'KERAMIK_50X50', allowedValues: ['KERAMIK_40X40', 'KERAMIK_50X50', 'GRANIT_60X60'], description: 'Jenis penutup lantai.', source: 'template_default', confidence: 0.95 },
};

export const HOUSE_TYPE_45_SINGLE_FLOOR_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-house-type-45-single-floor',
  code: 'HOUSE-T45-1FL',
  name: 'Rumah Tinggal Menengah Tipe 45 (1 Lantai)',
  category: 'residential',
  version: '2026.1.0',
  status: 'verified',
  description: 'Template master estimasi RAB rumah tinggal 1 lantai tipe 45 m² dengan spesifikasi standar menengah.',
  applicableProjectTypes: ['residential_house', 'rumah_menengah', 'rumah_tipe_45'],
  units: { length: 'm', area: 'm²', volume: 'm³' },
  parameters: DEFAULT_PARAMETERS_T45,
  assumptions: DEFAULT_ASSUMPTIONS_T45,
  spaces: DEFAULT_SPACES_T45,
  structuralSystem: {
    foundation: 'Pondasi Batu Kali Belah 1:5 + Urugan Pasir',
    superstructure: 'Sloof 15/20, Kolom Praktis 15/15, Ring Balok 15/15 (Beton K-225)',
    roofStructure: 'Kuda-kuda & Reng Baja Ringan C75.75 & U32.45',
  },
  materialSystem: {
    wall: 'Bata Ringan (Hebel) Tebal 10 cm + Plester Acian',
    floor: 'Keramik 50x50 cm Polished + Rabat Beton 5 cm',
    ceiling: 'Gypsum Board 9 mm + Rangka Hollow Galvanis',
    roofCover: 'Genteng Metal Berpasir Warna',
  },
  workItems: HOUSE_TYPE_36_WORK_ITEMS,
  limitations: [
    'Estimasi parametrik awal dengan asumsi tanah datar dan daya dukung tanah normal.',
    'DED dan gambar arsitektur definitif tetap diperlukan untuk pelaksanaan lelang konstruksi.',
  ],
  sourceMetadata: {
    standardReference: 'Permen PUPR No. 1/2022 & AHSP Cipta Karya 2026',
    lastUpdated: '2026-09-14',
    author: 'EZRAB Construction Engineering AI Team',
  },
  reviewStatus: { isReviewed: true, reviewedBy: 'Senior QS Engineer', reviewedDate: '2026-09-14' },
};
