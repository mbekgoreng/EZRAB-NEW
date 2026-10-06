import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateSpace, TemplateWorkItem } from '../schema/types';
import { HOUSE_TYPE_36_WORK_ITEMS } from './houseType36Template';

/**
 * MASTER TEMPLATE: Rumah Tinggal Tipe 36 Dua Lantai (Luas Bangunan Total ~60-72m2)
 * Standard Specification:
 * - Pondasi Batu Kali + Footplat Beton Bertulang
 * - Struktur Beton Bertulang K-225 (Kolom 20x20, Balok 20x30, Pelat Lantai 12 cm)
 * - Tangga Beton Bertulang
 * - Dinding Bata Ringan / Merah 2 Lantai
 * - Rangka Atap Baja Ringan + Genteng Metal / Spandek
 */

const DEFAULT_ASSUMPTIONS_T36_2FL: Record<string, TemplateAssumption> = {
  galian_width: {
    assumptionId: 'galian_width',
    label: 'Lebar Galian Pondasi',
    value: 0.85,
    unit: 'm',
    rationale: 'Lebar galian pondasi untuk beban 2 lantai.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  galian_depth: {
    assumptionId: 'galian_depth',
    label: 'Kedalaman Galian Pondasi',
    value: 1.0,
    unit: 'm',
    rationale: 'Kedalaman pondasi struktur 2 lantai (footplat + batu kali).',
    source: 'SNI',
    confidence: 0.92,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_height: {
    assumptionId: 'pondasi_height',
    label: 'Tinggi Pondasi Batu Kali',
    value: 0.75,
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
    value: 0.30,
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
    value: 0.70,
    unit: 'm',
    rationale: 'Lebar dasar pondasi.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  footplat_count: {
    assumptionId: 'footplat_count',
    label: 'Jumlah Titik Pondasi Footplat',
    value: 10,
    unit: 'titik',
    rationale: 'Jumlah titik kolom utama penopang lantai 2.',
    source: 'EMPIRICAL_ESTIMATOR',
    confidence: 0.90,
    editable: true,
    requiresConfirmation: false,
  },
  footplat_size: {
    assumptionId: 'footplat_size',
    label: 'Dimensi Footplat (P x L x T)',
    value: '0.8 x 0.8 x 0.25',
    unit: 'm',
    rationale: 'Dimensi standar telapak pondasi 2 lantai.',
    source: 'SNI',
    confidence: 0.92,
    editable: true,
    requiresConfirmation: false,
  },
  floor_height_1: {
    assumptionId: 'floor_height_1',
    label: 'Tinggi Lantai 1',
    value: 3.5,
    unit: 'm',
    rationale: 'Tinggi ceiling lantai 1',
    source: 'PUPR',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  floor_height_2: {
    assumptionId: 'floor_height_2',
    label: 'Tinggi Lantai 2',
    value: 3.2,
    unit: 'm',
    rationale: 'Tinggi ceiling lantai 2',
    source: 'PUPR',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  slab_thickness: {
    assumptionId: 'slab_thickness',
    label: 'Tebal Pelat Lantai 2',
    value: 0.12,
    unit: 'm',
    rationale: 'Tebal pelat beton bertulang SNI 2847.',
    source: 'SNI',
    confidence: 0.98,
    editable: true,
    requiresConfirmation: false,
  },
  sloof_width: { assumptionId: 'sloof_width', label: 'Lebar Sloof', value: 0.15, unit: 'm', rationale: 'Lebar sloof', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  sloof_height: { assumptionId: 'sloof_height', label: 'Tinggi Sloof', value: 0.25, unit: 'm', rationale: 'Tinggi sloof 25 cm untuk 2 lantai', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  kolom_size: { assumptionId: 'kolom_size', label: 'Ukuran Kolom Utama', value: 0.20, unit: 'm', rationale: 'Kolom struktur 20x20 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  ring_balok_size: { assumptionId: 'ring_balok_size', label: 'Ukuran Ring Balok', value: 0.15, unit: 'm', rationale: 'Ring balok 15x20 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  roof_slope_angle: { assumptionId: 'roof_slope_angle', label: 'Kemiringan Atap', value: 30, unit: 'deg', rationale: 'Kemiringan atap 30 derajat', source: 'PUPR', confidence: 0.95, editable: true, requiresConfirmation: false },
  roof_overhang: { assumptionId: 'roof_overhang', label: 'Overstek Atap', value: 0.7, unit: 'm', rationale: 'Overstek 0.7 m', source: 'BEST_PRACTICE', confidence: 0.92, editable: true, requiresConfirmation: false },
};

const DEFAULT_SPACES_T36_2FL: TemplateSpace[] = [
  { id: 'sp-1-1', name: 'Lantai 1 - Ruang Tamu & Makan', defaultLength: 5.0, defaultWidth: 3.0, defaultArea: 15.0 },
  { id: 'sp-1-2', name: 'Lantai 1 - Dapur', defaultLength: 3.0, defaultWidth: 2.0, defaultArea: 6.0 },
  { id: 'sp-1-3', name: 'Lantai 1 - Kamar Mandi', defaultLength: 1.5, defaultWidth: 1.5, defaultArea: 2.25, isWetArea: true },
  { id: 'sp-1-4', name: 'Lantai 1 - Area Tangga', defaultLength: 3.0, defaultWidth: 1.0, defaultArea: 3.0 },
  { id: 'sp-1-5', name: 'Lantai 1 - Teras & Carport', defaultLength: 4.0, defaultWidth: 3.0, defaultArea: 12.0 },
  { id: 'sp-2-1', name: 'Lantai 2 - Kamar Tidur Utama', defaultLength: 3.5, defaultWidth: 3.0, defaultArea: 10.5 },
  { id: 'sp-2-2', name: 'Lantai 2 - Kamar Tidur Anak', defaultLength: 3.0, defaultWidth: 3.0, defaultArea: 9.0 },
  { id: 'sp-2-3', name: 'Lantai 2 - Kamar Mandi 2', defaultLength: 1.5, defaultWidth: 1.5, defaultArea: 2.25, isWetArea: true },
  { id: 'sp-2-4', name: 'Lantai 2 - Balkon / Hall', defaultLength: 3.0, defaultWidth: 2.0, defaultArea: 6.0 },
];

const DEFAULT_PARAMETERS_T36_2FL: Record<string, TemplateParameter> = {
  buildingArea: { name: 'buildingArea', label: 'Total Luas Bangunan', type: 'area', unit: 'm²', required: true, defaultValue: 65, min: 50, max: 100, description: 'Total luas lantai 1 + lantai 2.', source: 'template_default', confidence: 1.0 },
  groundFloorArea: { name: 'groundFloorArea', label: 'Luas Lantai 1', type: 'area', unit: 'm²', required: true, defaultValue: 35, min: 25, max: 50, description: 'Luas tapak bangunan lantai 1.', source: 'template_default', confidence: 1.0 },
  upperFloorArea: { name: 'upperFloorArea', label: 'Luas Lantai 2', type: 'area', unit: 'm²', required: true, defaultValue: 30, min: 20, max: 50, description: 'Luas lantai atas.', source: 'template_default', confidence: 1.0 },
  buildingWidth: { name: 'buildingWidth', label: 'Lebar Muka Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 6.0, min: 4.5, max: 8.0, description: 'Lebar muka kavling/bangunan.', source: 'template_default', confidence: 1.0 },
  buildingLength: { name: 'buildingLength', label: 'Panjang Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 6.0, min: 5.0, max: 12.0, description: 'Panjang tapak bangunan.', source: 'template_default', confidence: 1.0 },
  floorCount: { name: 'floorCount', label: 'Jumlah Lantai', type: 'integer', unit: 'lantai', required: true, defaultValue: 2, min: 2, max: 2, description: 'Bangunan 2 lantai.', source: 'template_default', confidence: 1.0 },
  bedroomCount: { name: 'bedroomCount', label: 'Jumlah Kamar Tidur', type: 'count', unit: 'ruang', required: true, defaultValue: 2, min: 2, max: 4, description: 'Jumlah kamar tidur total.', source: 'template_default', confidence: 1.0 },
  bathroomCount: { name: 'bathroomCount', label: 'Jumlah Kamar Mandi', type: 'count', unit: 'ruang', required: true, defaultValue: 2, min: 1, max: 3, description: 'Jumlah kamar mandi total.', source: 'template_default', confidence: 1.0 },
  wallMaterial: { name: 'wallMaterial', label: 'Material Dinding', type: 'enum', required: true, defaultValue: 'BATA_RINGAN', allowedValues: ['BATA_RINGAN', 'BATA_MERAH'], description: 'Material dinding utama.', source: 'template_default', confidence: 0.95 },
  roofCover: { name: 'roofCover', label: 'Penutup Atap', type: 'enum', required: true, defaultValue: 'GENTENG_METAL', allowedValues: ['GENTENG_METAL', 'SPANDEK', 'GENTENG_BETON'], description: 'Jenis penutup atap.', source: 'template_default', confidence: 0.95 },
  floorFinish: { name: 'floorFinish', label: 'Penutup Lantai', type: 'enum', required: true, defaultValue: 'KERAMIK_50X50', allowedValues: ['KERAMIK_40X40', 'KERAMIK_50X50', 'GRANIT_60X60'], description: 'Jenis penutup lantai.', source: 'template_default', confidence: 0.95 },
};

export const HOUSE_TYPE_36_TWO_FLOOR_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-house-type-36-two-floor',
  code: 'HOUSE-T36-2FL',
  name: 'Rumah Tinggal Tipe 36/60 (2 Lantai)',
  category: 'residential',
  version: '2026.1.0',
  status: 'reviewed',
  description: 'Template parametrik rumah tinggal kompak 2 lantai dengan struktur beton bertulang, pelat lantai 2, dan atap baja ringan.',
  applicableProjectTypes: ['Rumah Tinggal', 'Townhouse Kompak', 'Perumahan 2 Lantai'],
  units: { length: 'm', area: 'm²', volume: 'm³' },
  parameters: DEFAULT_PARAMETERS_T36_2FL,
  assumptions: DEFAULT_ASSUMPTIONS_T36_2FL,
  spaces: DEFAULT_SPACES_T36_2FL,
  structuralSystem: {
    foundation: 'Pondasi Batu Kali + Footplat Beton Bertulang K-225',
    superstructure: 'Beton Bertulang K-225 (Kolom 20x20, Balok 20x30, Pelat t=12cm)',
    roofStructure: 'Rangka Baja Ringan Profil C75 / Reng 32',
  },
  materialSystem: {
    wall: 'Bata Ringan Hebel t=10cm + Plester Acian Mortar',
    floor: 'Homogeneous Tile / Keramik 50x50 cm',
    ceiling: 'Gypsum Board 9mm + Rangka Hollow Galvalum 40x40',
    roofCover: 'Genteng Metal Pasir / Spandek 0.35mm',
  },
  workItems: HOUSE_TYPE_36_WORK_ITEMS,
  limitations: [
    'Perhitungan struktur mengasumsikan daya dukung tanah normal (qa >= 1.0 kg/cm2).',
    'Tidak mencakup pekerjaan tiang pancang / bore pile jika tanah berlumpur / rawa.',
    'Beban gempa standar zona gempa Indonesia sedang (SNI 1726).',
  ],
  sourceMetadata: {
    standardReference: 'SNI 2847-2019 (Beton), SNI 1726-2019 (Gempa), PUPR AHSP Cipta Karya 2026',
    lastUpdated: '2026-03-01',
    author: 'EZRAB Quantity Surveying & Structural Team',
  },
  reviewStatus: {
    isReviewed: true,
    reviewedBy: 'Senior QS & Structural Engineer',
    reviewedDate: '2026-03-01',
  },
};
