import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateSpace, TemplateWorkItem } from '../schema/types';
import { HOUSE_TYPE_36_WORK_ITEMS } from './houseType36Template';

/**
 * MASTER TEMPLATE: Rumah Tinggal Tipe 90 Dua Lantai (Luas Bangunan Total 180m2)
 * Standard Specification:
 * - Pondasi Batu Kali + Footplat Beton Bertulang
 * - Struktur Beton Bertulang K-225 (Kolom 20x20, Balok 20x30, Pelat Lantai 12 cm)
 * - Tangga Beton Bertulang
 * - Dinding Bata Ringan / Merah 2 Lantai
 * - Rangka Atap Baja Ringan + Genteng Metal / Spandek
 *
 * GELOMBANG 2 §17.11 (2026-11-13): tipe 90 sudah ada di HouseTypeCatalog
 * (HOUSE-T90-2FL, 90 m² per lantai, 2 lantai, 4 KT/2 KM) dan di
 * konfigurasi rumah RabTemplateService, tetapi BELUM ada di master
 * registry — jalur direct tidak dapat memilihnya. Template ini mengikuti
 * pola T36-2FL persis (asumsi 2 lantai, struktur, material, dan daftar
 * kerja HOUSE_TYPE_36_WORK_ITEMS yang sama); yang berbeda hanya
 * parameter (luas/tapak/ruang) sesuai katalog. Tapak 9×10 m = 90 m²
 * (angka tipe = luas per lantai, konvensi EZRAB; total 180 m²).
 * Jumlah titik footplat 16 mengikuti grid kolom ±3 m pada tapak 9×10 m
 * (4 baris × 4 kolom) — T36-2FL memakai 10 pada tapak 6×6 m.
 * Profil harga diwarisi dari daftar kerja bersama (24 ber-harga: 22
 * benchmark + 2 official; kloset A.5.1.1.2 jujur tanpa harga) — tidak ada
 * harga baru yang dikarang dan tidak ada kode yang dipakai ulang secara
 * salah (keputusan katalog owner 2026-11-12 03:41).
 */

const DEFAULT_ASSUMPTIONS_T90_2FL: Record<string, TemplateAssumption> = {
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
    value: 16,
    unit: 'titik',
    rationale: 'Jumlah titik kolom utama penopang lantai 2 (denah 9×10 m, grid ±3 m).',
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

const DEFAULT_SPACES_T90_2FL: TemplateSpace[] = [
  { id: 'sp-1-1', name: 'Lantai 1 - Ruang Tamu & Makan', defaultLength: 6.0, defaultWidth: 4.0, defaultArea: 24.0 },
  { id: 'sp-1-2', name: 'Lantai 1 - Dapur', defaultLength: 4.0, defaultWidth: 3.0, defaultArea: 12.0 },
  { id: 'sp-1-3', name: 'Lantai 1 - Kamar Tidur 1', defaultLength: 4.0, defaultWidth: 3.5, defaultArea: 14.0 },
  { id: 'sp-1-4', name: 'Lantai 1 - Kamar Mandi 1', defaultLength: 2.0, defaultWidth: 2.0, defaultArea: 4.0, isWetArea: true },
  { id: 'sp-1-5', name: 'Lantai 1 - Area Tangga', defaultLength: 3.0, defaultWidth: 1.5, defaultArea: 4.5 },
  { id: 'sp-1-6', name: 'Lantai 1 - Teras & Carport', defaultLength: 6.0, defaultWidth: 3.0, defaultArea: 18.0 },
  { id: 'sp-1-7', name: 'Lantai 1 - Ruang Keluarga', defaultLength: 4.5, defaultWidth: 3.0, defaultArea: 13.5 },
  { id: 'sp-2-1', name: 'Lantai 2 - Kamar Tidur Utama', defaultLength: 5.0, defaultWidth: 4.0, defaultArea: 20.0 },
  { id: 'sp-2-2', name: 'Lantai 2 - Kamar Tidur Anak 1', defaultLength: 4.0, defaultWidth: 3.5, defaultArea: 14.0 },
  { id: 'sp-2-3', name: 'Lantai 2 - Kamar Tidur Anak 2', defaultLength: 4.0, defaultWidth: 3.0, defaultArea: 12.0 },
  { id: 'sp-2-4', name: 'Lantai 2 - Kamar Mandi 2', defaultLength: 2.0, defaultWidth: 2.0, defaultArea: 4.0, isWetArea: true },
  { id: 'sp-2-5', name: 'Lantai 2 - Ruang Keluarga Atas', defaultLength: 5.0, defaultWidth: 4.0, defaultArea: 20.0 },
  { id: 'sp-2-6', name: 'Lantai 2 - Balkon / Hall', defaultLength: 4.0, defaultWidth: 3.0, defaultArea: 12.0 },
  { id: 'sp-2-7', name: 'Lantai 2 - Ruang Kerja', defaultLength: 4.0, defaultWidth: 2.0, defaultArea: 8.0 },
];

const DEFAULT_PARAMETERS_T90_2FL: Record<string, TemplateParameter> = {
  buildingArea: { name: 'buildingArea', label: 'Total Luas Bangunan', type: 'area', unit: 'm²', required: true, defaultValue: 180, min: 140, max: 240, description: 'Total luas lantai 1 + lantai 2.', source: 'template_default', confidence: 1.0 },
  groundFloorArea: { name: 'groundFloorArea', label: 'Luas Lantai 1', type: 'area', unit: 'm²', required: true, defaultValue: 90, min: 70, max: 120, description: 'Luas tapak bangunan lantai 1.', source: 'template_default', confidence: 1.0 },
  upperFloorArea: { name: 'upperFloorArea', label: 'Luas Lantai 2', type: 'area', unit: 'm²', required: true, defaultValue: 90, min: 70, max: 120, description: 'Luas lantai atas.', source: 'template_default', confidence: 1.0 },
  buildingWidth: { name: 'buildingWidth', label: 'Lebar Muka Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 9.0, min: 7.0, max: 12.0, description: 'Lebar muka kavling/bangunan.', source: 'template_default', confidence: 1.0 },
  buildingLength: { name: 'buildingLength', label: 'Panjang Bangunan', type: 'length', unit: 'm', required: true, defaultValue: 10.0, min: 8.0, max: 15.0, description: 'Panjang tapak bangunan.', source: 'template_default', confidence: 1.0 },
  floorCount: { name: 'floorCount', label: 'Jumlah Lantai', type: 'integer', unit: 'lantai', required: true, defaultValue: 2, min: 2, max: 2, description: 'Bangunan 2 lantai.', source: 'template_default', confidence: 1.0 },
  bedroomCount: { name: 'bedroomCount', label: 'Jumlah Kamar Tidur', type: 'count', unit: 'ruang', required: true, defaultValue: 4, min: 3, max: 5, description: 'Jumlah kamar tidur total.', source: 'template_default', confidence: 1.0 },
  bathroomCount: { name: 'bathroomCount', label: 'Jumlah Kamar Mandi', type: 'count', unit: 'ruang', required: true, defaultValue: 2, min: 2, max: 3, description: 'Jumlah kamar mandi total.', source: 'template_default', confidence: 1.0 },
  wallMaterial: { name: 'wallMaterial', label: 'Material Dinding', type: 'enum', required: true, defaultValue: 'BATA_RINGAN', allowedValues: ['BATA_RINGAN', 'BATA_MERAH'], description: 'Material dinding utama.', source: 'template_default', confidence: 0.95 },
  roofCover: { name: 'roofCover', label: 'Penutup Atap', type: 'enum', required: true, defaultValue: 'GENTENG_METAL', allowedValues: ['GENTENG_METAL', 'SPANDEK', 'GENTENG_BETON'], description: 'Jenis penutup atap.', source: 'template_default', confidence: 0.95 },
  floorFinish: { name: 'floorFinish', label: 'Penutup Lantai', type: 'enum', required: true, defaultValue: 'KERAMIK_50X50', allowedValues: ['KERAMIK_40X40', 'KERAMIK_50X50', 'GRANIT_60X60'], description: 'Jenis penutup lantai.', source: 'template_default', confidence: 0.95 },
};

export const HOUSE_TYPE_90_TWO_FLOOR_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-house-type-90-two-floor',
  code: 'HOUSE-T90-2FL',
  name: 'Rumah Tinggal Menengah Tipe 90 (2 Lantai)',
  category: 'residential',
  version: '2026.1.0',
  status: 'draft',
  description: 'Template parametrik rumah tinggal menengah 2 lantai (tapak 90 m², total 180 m²) dengan struktur beton bertulang, pelat lantai 2, dan atap baja ringan.',
  applicableProjectTypes: ['residential_house', 'rumah_menengah', 'rumah_tipe_90'],
  units: { length: 'm', area: 'm²', volume: 'm³' },
  parameters: DEFAULT_PARAMETERS_T90_2FL,
  assumptions: DEFAULT_ASSUMPTIONS_T90_2FL,
  spaces: DEFAULT_SPACES_T90_2FL,
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
    'Beberapa parameter adalah konstanta tetap template yang BELUM diskalakan ke ukuran bangunan pengguna: panjang kusen 37,5 m\', titik kolom praktis 12, titik lampu 8, titik stop kontak 6 (blocker FORMULA_UNVERIFIED S6 — lihat asumsi per item).',
  ],
  sourceMetadata: {
    standardReference: 'SNI 2847-2019 (Beton), SNI 1726-2019 (Gempa), PUPR AHSP Cipta Karya 2026',
    lastUpdated: '2026-11-13',
    author: 'EZRAB Construction Engineering AI Team',
  },
  reviewStatus: { isReviewed: false },
};
