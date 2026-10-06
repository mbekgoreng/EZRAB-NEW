import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateSpace, TemplateWorkItem } from '../schema/types';
import { HOUSE_TYPE_36_WORK_ITEMS } from './houseType36Template';

/**
 * MASTER TEMPLATE: Ruko / Rumah Toko Dua Lantai (Standar 4.5m x 12m, Luas Bangunan ~108 m2)
 * Standard Specification:
 * - Pondasi Telapak Beton Bertulang (Footplat) + Pondasi Batu Kali
 * - Struktur Portal Beton Bertulang K-250 (Kolom 25x25 / 20x30, Balok 20x40)
 * - Lantai 1: Area Usaha / Komersial, Kamar Mandi, Pintu Rolling Door / Folding Gate
 * - Lantai 2: Kantor / Hunian, 2 Kamar, 1 Kamar Mandi, Balkon
 * - Fasade Kaca Kusen Aluminium & Finishing Weatherproof
 */

const DEFAULT_ASSUMPTIONS_RUKO_2FL: Record<string, TemplateAssumption> = {
  galian_width: {
    assumptionId: 'galian_width',
    label: 'Lebar Galian Pondasi',
    value: 0.90,
    unit: 'm',
    rationale: 'Lebar galian pondasi untuk beban ruko 2 lantai.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  galian_depth: {
    assumptionId: 'galian_depth',
    label: 'Kedalaman Galian Pondasi',
    value: 1.20,
    unit: 'm',
    rationale: 'Kedalaman pondasi ruko 2 lantai.',
    source: 'SNI',
    confidence: 0.92,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_height: {
    assumptionId: 'pondasi_height',
    label: 'Tinggi Pondasi Batu Kali',
    value: 0.80,
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
    value: 0.35,
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
    value: 0.80,
    unit: 'm',
    rationale: 'Lebar dasar pondasi.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  footplat_count: {
    assumptionId: 'footplat_count',
    label: 'Jumlah Pondasi Footplat',
    value: 12,
    unit: 'titik',
    rationale: 'Jumlah titik kolom portal struktur ruko.',
    source: 'EMPIRICAL_ESTIMATOR',
    confidence: 0.92,
    editable: true,
    requiresConfirmation: false,
  },
  floor_height_1: {
    assumptionId: 'floor_height_1',
    label: 'Tinggi Lantai 1 (Komersial)',
    value: 3.8,
    unit: 'm',
    rationale: 'Tinggi langit-langit lantai 1 toko.',
    source: 'PUPR',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  floor_height_2: {
    assumptionId: 'floor_height_2',
    label: 'Tinggi Lantai 2 (Kantor/Hunian)',
    value: 3.5,
    unit: 'm',
    rationale: 'Tinggi langit-langit lantai 2.',
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
    rationale: 'Tebal pelat lantai beton bertulang SNI 2847.',
    source: 'SNI',
    confidence: 0.98,
    editable: true,
    requiresConfirmation: false,
  },
  sloof_width: { assumptionId: 'sloof_width', label: 'Lebar Sloof', value: 0.20, unit: 'm', rationale: 'Lebar sloof', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  sloof_height: { assumptionId: 'sloof_height', label: 'Tinggi Sloof', value: 0.30, unit: 'm', rationale: 'Tinggi sloof 30 cm untuk ruko', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  kolom_size: { assumptionId: 'kolom_size', label: 'Ukuran Kolom Utama', value: 0.25, unit: 'm', rationale: 'Kolom struktur 25x25 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  ring_balok_size: { assumptionId: 'ring_balok_size', label: 'Ukuran Balok Lantai 2', value: 0.20, unit: 'm', rationale: 'Balok 20x35 cm', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  roof_slope_angle: { assumptionId: 'roof_slope_angle', label: 'Kemiringan Atap Ruko', value: 15, unit: 'deg', rationale: 'Atap miring spandek/dak beton tersembunyi parapet', source: 'PUPR', confidence: 0.95, editable: true, requiresConfirmation: false },
};

const DEFAULT_SPACES_RUKO_2FL: TemplateSpace[] = [
  { id: 'sp-r1-1', name: 'Lantai 1 - Hall Toko / Showroom', defaultLength: 8.0, defaultWidth: 4.5, defaultArea: 36.0 },
  { id: 'sp-r1-2', name: 'Lantai 1 - Gudang / Pantry', defaultLength: 2.5, defaultWidth: 4.5, defaultArea: 11.25 },
  { id: 'sp-r1-3', name: 'Lantai 1 - Toilet Pengunjung', defaultLength: 1.5, defaultWidth: 1.5, defaultArea: 2.25, isWetArea: true },
  { id: 'sp-r1-4', name: 'Lantai 1 - Tangga Beton', defaultLength: 3.5, defaultWidth: 1.2, defaultArea: 4.2 },
  { id: 'sp-r2-1', name: 'Lantai 2 - Ruang Kantor / Meeting', defaultLength: 5.5, defaultWidth: 4.5, defaultArea: 24.75 },
  { id: 'sp-r2-2', name: 'Lantai 2 - Kamar Istirahat', defaultLength: 3.5, defaultWidth: 3.0, defaultArea: 10.5 },
  { id: 'sp-r2-3', name: 'Lantai 2 - Toilet Lantai 2', defaultLength: 1.5, defaultWidth: 1.5, defaultArea: 2.25, isWetArea: true },
  { id: 'sp-r2-4', name: 'Lantai 2 - Balkon Depan', defaultLength: 1.2, defaultWidth: 4.5, defaultArea: 5.4 },
];

const DEFAULT_PARAMETERS_RUKO_2FL: Record<string, TemplateParameter> = {
  buildingArea: { name: 'buildingArea', label: 'Total Luas Bangunan', type: 'area', unit: 'm²', required: true, defaultValue: 108, min: 70, max: 250, description: 'Total luas ruko 2 lantai.', source: 'template_default', confidence: 1.0 },
  buildingWidth: { name: 'buildingWidth', label: 'Lebar Muka Ruko', type: 'length', unit: 'm', required: true, defaultValue: 4.5, min: 4.0, max: 10.0, description: 'Lebar ruko tampak depan.', source: 'template_default', confidence: 1.0 },
  buildingLength: { name: 'buildingLength', label: 'Panjang Ruko', type: 'length', unit: 'm', required: true, defaultValue: 12.0, min: 8.0, max: 25.0, description: 'Panjang ke belakang.', source: 'template_default', confidence: 1.0 },
  floorCount: { name: 'floorCount', label: 'Jumlah Lantai', type: 'integer', unit: 'lantai', required: true, defaultValue: 2, min: 2, max: 3, description: 'Jumlah lantai ruko.', source: 'template_default', confidence: 1.0 },
  wallMaterial: { name: 'wallMaterial', label: 'Material Dinding', type: 'enum', required: true, defaultValue: 'BATA_RINGAN', allowedValues: ['BATA_RINGAN', 'BATA_MERAH'], description: 'Material dinding utama.', source: 'template_default', confidence: 0.95 },
  floorFinish: { name: 'floorFinish', label: 'Penutup Lantai', type: 'enum', required: true, defaultValue: 'GRANIT_60X60', allowedValues: ['KERAMIK_50X50', 'GRANIT_60X60', 'GRANIT_80X80'], description: 'Jenis penutup lantai komersial.', source: 'template_default', confidence: 0.95 },
  frontDoorType: { name: 'frontDoorType', label: 'Pintu Utama Depan', type: 'enum', required: true, defaultValue: 'ROLLING_DOOR_ALUMINIUM', allowedValues: ['ROLLING_DOOR_ALUMINIUM', 'FOLDING_GATE_HARMONIKA', 'KACA_TEMPERED'], description: 'Pintu depan ruko.', source: 'template_default', confidence: 0.95 },
};

export const SHOPHOUSE_2_FLOOR_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-shophouse-2-floor',
  code: 'RUKO-2FL',
  name: 'Rumah Toko (Ruko) Komersial 2 Lantai (4.5x12m)',
  category: 'commercial',
  version: '2026.1.0',
  status: 'reviewed',
  description: 'Template parametrik ruko komersial 2 lantai dengan struktur portal beton K-250, pintu rolling door aluminium, lantai granit 60x60, dan fasade modern.',
  applicableProjectTypes: ['Ruko Komersial', 'Kantor Toko', 'Rukan Perkantoran'],
  units: { length: 'm', area: 'm²', volume: 'm³' },
  parameters: DEFAULT_PARAMETERS_RUKO_2FL,
  assumptions: DEFAULT_ASSUMPTIONS_RUKO_2FL,
  spaces: DEFAULT_SPACES_RUKO_2FL,
  structuralSystem: {
    foundation: 'Pondasi Footplat 100x100x30 cm + Batu Kali Belah 15/20',
    superstructure: 'Struktur Beton Bertulang K-250 (Kolom 25x25, Balok 20x40, Pelat Lantai t=12cm)',
    roofStructure: 'Rangka Atap Baja Ringan Spandek 0.40mm / Dak Beton Parapet',
  },
  materialSystem: {
    wall: 'Bata Ringan Hebel t=10cm + Plester Acian Mortar Instan',
    floor: 'Homogeneous Tile Granit 60x60 cm Polished',
    ceiling: 'Gypsum Board 9mm Rangka Hollow Galvalum 40x40',
    roofCover: 'Atap Spandek Zincalume 0.40mm + Insulasi Aluminium Foil',
  },
  workItems: HOUSE_TYPE_36_WORK_ITEMS,
  limitations: [
    'Beban hidup lantai 2 dirancang maksimum 250 kg/m2 (SNI 1727).',
    'Tidak diperuntukkan untuk gudang logistik beban berat (> 500 kg/m2).',
  ],
  sourceMetadata: {
    standardReference: 'SNI 2847-2019, SNI 1727-2013 (Beban Desain), PUPR Cipta Karya 2026',
    lastUpdated: '2026-03-01',
    author: 'EZRAB Commercial Architecture & Estimating Division',
  },
  reviewStatus: {
    isReviewed: true,
    reviewedBy: 'Senior Commercial QS',
    reviewedDate: '2026-03-01',
  },
};
