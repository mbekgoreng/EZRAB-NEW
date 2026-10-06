import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateSpace } from '../schema/types';
import { HOUSE_TYPE_36_WORK_ITEMS } from './houseType36Template';

/**
 * MASTER TEMPLATE: Rumah Tinggal Menengah-Atas Tipe 70 Satu Lantai
 * Standard Specification: Luas 70m2 (7x10m), 3 Kamar Tidur, 2 Kamar Mandi, Granit 60x60, Plafon Drop Ceiling
 */

const DEFAULT_ASSUMPTIONS_T70: Record<string, TemplateAssumption> = {
  galian_width: { assumptionId: 'galian_width', label: 'Lebar Galian', value: 0.85, unit: 'm', rationale: 'Lebar galian pondasi', source: 'SNI', confidence: 0.95, editable: true, requiresConfirmation: false },
  galian_depth: { assumptionId: 'galian_depth', label: 'Kedalaman Galian', value: 0.85, unit: 'm', rationale: 'Kedalaman galian tanah keras', source: 'SNI', confidence: 0.92, editable: true, requiresConfirmation: false },
  pondasi_height: { assumptionId: 'pondasi_height', label: 'Tinggi Pondasi', value: 0.7, unit: 'm', rationale: 'Tinggi trapesium batu kali', source: 'SNI', confidence: 0.95, editable: true, requiresConfirmation: false },
  pondasi_top_width: { assumptionId: 'pondasi_top_width', label: 'Lebar Atas Pondasi', value: 0.35, unit: 'm', rationale: 'Lebar kepala pondasi', source: 'SNI', confidence: 0.95, editable: true, requiresConfirmation: false },
  pondasi_bottom_width: { assumptionId: 'pondasi_bottom_width', label: 'Lebar Bawah Pondasi', value: 0.7, unit: 'm', rationale: 'Lebar dasar pondasi', source: 'SNI', confidence: 0.95, editable: true, requiresConfirmation: false },
  sloof_width: { assumptionId: 'sloof_width', label: 'Lebar Sloof', value: 0.15, unit: 'm', rationale: 'Lebar sloof 15 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  sloof_height: { assumptionId: 'sloof_height', label: 'Tinggi Sloof', value: 0.25, unit: 'm', rationale: 'Tinggi sloof 25 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  kolom_size: { assumptionId: 'kolom_size', label: 'Ukuran Kolom Praktis', value: 0.15, unit: 'm', rationale: 'Kolom praktis 15x15 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  ring_balok_size: { assumptionId: 'ring_balok_size', label: 'Ukuran Ring Balok', value: 0.15, unit: 'm', rationale: 'Ring balok 15x15 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  wall_height: { assumptionId: 'wall_height', label: 'Tinggi Dinding', value: 3.8, unit: 'm', rationale: 'Tinggi dinding bersih 3.8 m', source: 'BEST_PRACTICE', confidence: 0.95, editable: true, requiresConfirmation: false },
  roof_slope_angle: { assumptionId: 'roof_slope_angle', label: 'Kemiringan Atap', value: 30, unit: 'deg', rationale: 'Kemiringan atap genteng', source: 'PUPR', confidence: 0.95, editable: true, requiresConfirmation: false },
  roof_overhang: { assumptionId: 'roof_overhang', label: 'Overstek Atap', value: 0.9, unit: 'm', rationale: 'Overstek 0.9 m', source: 'BEST_PRACTICE', confidence: 0.92, editable: true, requiresConfirmation: false },
};

const DEFAULT_SPACES_T70: TemplateSpace[] = [
  { id: 'sp-1', name: 'Ruang Tamu & Foyer', defaultLength: 4.0, defaultWidth: 3.5, defaultArea: 14.0 },
  { id: 'sp-2', name: 'Ruang Keluarga & Makan', defaultLength: 5.0, defaultWidth: 3.5, defaultArea: 17.5 },
  { id: 'sp-3', name: 'Kamar Tidur Utama + KM Dalam', defaultLength: 4.0, defaultWidth: 3.5, defaultArea: 14.0 },
  { id: 'sp-4', name: 'Kamar Tidur Anak 1', defaultLength: 3.5, defaultWidth: 3.0, defaultArea: 10.5 },
  { id: 'sp-5', name: 'Kamar Tidur Anak 2', defaultLength: 3.0, defaultWidth: 3.0, defaultArea: 9.0 },
  { id: 'sp-6', name: 'Kamar Mandi Utama', defaultLength: 2.0, defaultWidth: 1.5, defaultArea: 3.0, isWetArea: true },
  { id: 'sp-7', name: 'Dapur Bersih & Kotor', defaultLength: 3.5, defaultWidth: 2.5, defaultArea: 8.75 },
  { id: 'sp-8', name: 'Teras & Carport', defaultLength: 4.5, defaultWidth: 3.0, defaultArea: 13.5 },
];

const DEFAULT_PARAMETERS_T70: Record<string, TemplateParameter> = {
  buildingArea: { name: 'buildingArea', label: 'Luas Bangunan', type: 'area', unit: 'm²', required: true, defaultValue: 70, min: 55, max: 100, description: 'Luas lantai bersih.', source: 'template_default', confidence: 1.0 },
  buildingWidth: { name: 'buildingWidth', label: 'Lebar Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 7.0, min: 6.0, max: 12.0, description: 'Lebar muka bangunan.', source: 'template_default', confidence: 1.0 },
  buildingLength: { name: 'buildingLength', label: 'Panjang Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 10.0, min: 7.0, max: 18.0, description: 'Panjang ke belakang.', source: 'template_default', confidence: 1.0 },
  floorCount: { name: 'floorCount', label: 'Jumlah Lantai', type: 'integer', unit: 'lantai', required: true, defaultValue: 1, min: 1, max: 1, description: 'Jumlah lantai bangunan.', source: 'template_default', confidence: 1.0 },
  bedroomCount: { name: 'bedroomCount', label: 'Jumlah Kamar Tidur', type: 'count', unit: 'ruang', required: true, defaultValue: 3, min: 2, max: 4, description: 'Jumlah kamar tidur.', source: 'template_default', confidence: 1.0 },
  bathroomCount: { name: 'bathroomCount', label: 'Jumlah Kamar Mandi', type: 'count', unit: 'ruang', required: true, defaultValue: 2, min: 1, max: 3, description: 'Jumlah kamar mandi.', source: 'template_default', confidence: 1.0 },
  wallMaterial: { name: 'wallMaterial', label: 'Material Dinding', type: 'enum', required: true, defaultValue: 'BATA_RINGAN', allowedValues: ['BATA_RINGAN', 'BATA_MERAH'], description: 'Material dinding.', source: 'template_default', confidence: 0.95 },
  roofCover: { name: 'roofCover', label: 'Penutup Atap', type: 'enum', required: true, defaultValue: 'GENTENG_KERAMIK', allowedValues: ['GENTENG_KERAMIK', 'GENTENG_BETON', 'GENTENG_METAL'], description: 'Penutup atap.', source: 'template_default', confidence: 0.95 },
  floorFinish: { name: 'floorFinish', label: 'Penutup Lantai', type: 'enum', required: true, defaultValue: 'GRANIT_60X60', allowedValues: ['GRANIT_60X60', 'KERAMIK_50X50'], description: 'Penutup lantai.', source: 'template_default', confidence: 0.95 },
};

export const HOUSE_TYPE_70_SINGLE_FLOOR_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-house-type-70-single-floor',
  code: 'HOUSE-T70-1FL',
  name: 'Rumah Tinggal Menengah-Atas Tipe 70 (1 Lantai)',
  category: 'residential',
  version: '2026.1.0',
  status: 'verified',
  description: 'Template master estimasi RAB rumah tinggal 1 lantai tipe 70 m² dengan 3 kamar tidur, 2 kamar mandi, lantai granit 60x60, dan atap baja ringan.',
  applicableProjectTypes: ['residential_house', 'rumah_mewah', 'rumah_tipe_70'],
  units: { length: 'm', area: 'm²', volume: 'm³' },
  parameters: DEFAULT_PARAMETERS_T70,
  assumptions: DEFAULT_ASSUMPTIONS_T70,
  spaces: DEFAULT_SPACES_T70,
  structuralSystem: {
    foundation: 'Pondasi Batu Kali Belah 1:5 + Pondasi Tapak / Footplate Setempat',
    superstructure: 'Sloof 15/25, Kolom Praktis 15/15, Ring Balok 15/15 (Beton K-225)',
    roofStructure: 'Kuda-kuda & Reng Baja Ringan C75.75 & U32.45',
  },
  materialSystem: {
    wall: 'Bata Ringan (Hebel) Tebal 10 cm + Plester Acian Mortar',
    floor: 'Granit Homogeneous Tile 60x60 cm Glazed Polished',
    ceiling: 'Gypsum Board 9 mm + Rangka Hollow Galvanis',
    roofCover: 'Genteng Keramik Berglazur / Genteng Metal Pasir',
  },
  workItems: HOUSE_TYPE_36_WORK_ITEMS,
  limitations: [
    'Estimasi awal berbasis spesifikasi standar menengah-atas.',
    'DED arsitektur, struktur, dan MEP definitif tetap disarankan sebelum tender.',
  ],
  sourceMetadata: {
    standardReference: 'Permen PUPR No. 1/2022 & AHSP Cipta Karya 2026',
    lastUpdated: '2026-09-14',
    author: 'EZRAB Construction Engineering AI Team',
  },
  reviewStatus: { isReviewed: true, reviewedBy: 'Senior Estimator', reviewedDate: '2026-09-14' },
};
