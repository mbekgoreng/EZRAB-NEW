/**
 * EZRAB — Universal Construction Template & Estimation Engine Service
 * 
 * Manages:
 * - Multi-sector official construction template library (Rumah, Jalan, Perkerasan, SDA, Gedung, dll)
 * - 3-Tier Detail Level Engine (STANDARD, PROFESSIONAL, COMPREHENSIVE)
 * - Conditional Rules & Optional Works execution
 * - Material Ecosystem integration (Material !== Price)
 * - Dynamic parameter evaluation & deterministic QTO
 * - LocalStorage persistence for user custom templates ("Template Saya")
 * - Immutable official template protection
 * - Audit Trail & Traceability for generated RAB items
 */

import {
  RabTemplate,
  TemplateCategory,
  TemplateParameter,
  ConstructionComponentTemplate,
  GeneratedTemplateRabResult,
  DetailLevel,
  TraceabilityRecord
} from '../types/rabTemplate';
import { RabItem } from '../types';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { MaterialLibraryService } from './materialLibraryService';

const STORAGE_KEY_CUSTOM_TEMPLATES = 'ezrab_custom_rab_templates';

// Verified PUPR AHSP Baseline Price Reference
const VERIFIED_AHSP_PRICES: Record<string, { code: string; name: string; unit: string; price: number }> = {
  // 01. Persiapan
  'A.2.2.1.1': { code: 'A.2.2.1.1', name: 'Pembersihan dan Perataan Lapangan Kerja Proyek', unit: 'm2', price: 18500 },
  'A.2.2.1.4': { code: 'A.2.2.1.4', name: 'Pemasangan Bowplank dan Pengukuran Titik As Bangunan', unit: 'm1', price: 42000 },
  'A.2.2.1.9': { code: 'A.2.2.1.9', name: 'Pembersihan Lapangan Proyek', unit: 'm2', price: 8500 },
  // 02. Tanah & Pondasi
  'A.2.3.1.1': { code: 'A.2.3.1.1', name: 'Galian Tanah Biasa', unit: 'm3', price: 88500 },
  'A.2.3.1.2': { code: 'A.2.3.1.2', name: 'Galian Tanah Keras / Footplate', unit: 'm3', price: 105000 },
  'A.2.3.1.9': { code: 'A.2.3.1.9', name: 'Urugan Tanah Kembali Bekas Galian', unit: 'm3', price: 32000 },
  'A.2.3.1.11': { code: 'A.2.3.1.11', name: 'Urugan Pasir Alas Bawah Pondasi & Lantai', unit: 'm3', price: 185000 },
  'A.3.2.1.1': { code: 'A.3.2.1.1', name: 'Pasangan Batu Kosong (Aanstamping)', unit: 'm3', price: 540000 },
  'A.3.2.1.2': { code: 'A.3.2.1.2', name: 'Pasangan Pondasi Batu Kali Belah 1:5', unit: 'm3', price: 980000 },
  // 03. Struktur Beton Bertulang
  'A.4.1.1.1': { code: 'A.4.1.1.1', name: 'Lantai Kerja Beton Mutu Rendah B-0 (f\'c = 7.4 MPa)', unit: 'm3', price: 890000 },
  'A.4.1.1.2': { code: 'A.4.1.1.2', name: 'Beton Sloof Bertulang K-225 (15/20)', unit: 'm3', price: 4200000 },
  'A.4.1.1.3': { code: 'A.4.1.1.3', name: 'Beton Kolom Praktis Bertulang K-175 (15/15)', unit: 'm3', price: 4400000 },
  'A.4.1.1.4': { code: 'A.4.1.1.4', name: 'Beton Kolom Utama Bertulang K-250 (20/20)', unit: 'm3', price: 4850000 },
  'A.4.1.1.5': { code: 'A.4.1.1.5', name: 'Beton Pondasi Telapak / Footplate K-250', unit: 'm3', price: 4700000 },
  'A.4.1.1.6': { code: 'A.4.1.1.6', name: 'Beton Balok Gantung / Ringbalk Bertulang K-250', unit: 'm3', price: 4950000 },
  'A.4.1.1.7': { code: 'A.4.1.1.7', name: 'Pelat Lantai Beton Bertulang Bondek t=12 cm', unit: 'm3', price: 4650000 },
  'A.4.1.1.8': { code: 'A.4.1.1.8', name: 'Beton Tangga Bertulang K-250', unit: 'm3', price: 4900000 },
  // 04. Dinding & Arsitektur
  'A.4.4.1.1': { code: 'A.4.4.1.1', name: 'Pasangan Dinding Bata Ringan (Hebel) t=10 cm', unit: 'm2', price: 145000 },
  'A.4.4.1.2': { code: 'A.4.4.1.2', name: 'Pasangan Dinding Bata Merah 1:4', unit: 'm2', price: 165000 },
  'A.4.4.2.1': { code: 'A.4.4.2.1', name: 'Plesteran Dinding Mortar 1:4 Tebal 15 mm', unit: 'm2', price: 78000 },
  'A.4.4.2.2': { code: 'A.4.4.2.2', name: 'Acian Dinding Semen Instan / Konvensional', unit: 'm2', price: 42000 },
  'A.4.4.3.1': { code: 'A.4.4.3.1', name: 'Lantai Granit Tile 60x60 cm Polished', unit: 'm2', price: 295000 },
  'A.4.4.3.4': { code: 'A.4.4.3.4', name: 'Lantai Keramik Homogeneous 30x30 cm Anti-Selip KM', unit: 'm2', price: 215000 },
  'A.4.4.3.5': { code: 'A.4.4.3.5', name: 'Keramik Dinding KM 30x60 cm', unit: 'm2', price: 265000 },
  'A.4.4.3.3': { code: 'A.4.4.3.3', name: 'Waterproofing Coating Semen Fleksibel', unit: 'm2', price: 95000 },
  // 05. Atap & Plafon
  'A.4.2.1.1': { code: 'A.4.2.1.1', name: 'Rangka Kuda-Kuda Baja Ringan Kanal C-75 t=0.75 mm', unit: 'm2', price: 195000 },
  'A.4.5.1.1': { code: 'A.4.5.1.1', name: 'Penutup Atap Genteng Metal Berpasir / Keramik', unit: 'm2', price: 165000 },
  'A.4.5.3.1': { code: 'A.4.5.3.1', name: 'Rangka Plafon Besi Hollow Galvanis 40x40 & 20x40', unit: 'm2', price: 95000 },
  'A.4.5.3.2': { code: 'A.4.5.3.2', name: 'Plafon Gypsum Board Tebal 9 mm Lengkap Kompon', unit: 'm2', price: 85000 },
  // 06. Kusen & Pintu
  'A.4.6.1.1': { code: 'A.4.6.1.1', name: 'Kusen Aluminium 4 Inchi Powder Coating', unit: 'm1', price: 165000 },
  'A.4.6.1.2': { code: 'A.4.6.1.2', name: 'Pintu Panel Kayu Solid Pabrikasi', unit: 'unit', price: 1850000 },
  'A.4.6.1.4': { code: 'A.4.6.1.4', name: 'Pintu PVC Kamar Mandi Komplit Kunci & Engsel', unit: 'unit', price: 450000 },
  // 07. Cat & Finishing
  'A.4.7.1.1': { code: 'A.4.7.1.1', name: 'Pengecatan Plafon Interior Emulsi 2 Lapis', unit: 'm2', price: 38000 },
  'A.4.7.1.2': { code: 'A.4.7.1.2', name: 'Pengecatan Dinding Interior Emulsi 2 Lapis', unit: 'm2', price: 42000 },
  'A.4.7.1.3': { code: 'A.4.7.1.3', name: 'Pengecatan Dinding Eksterior Weatherproof', unit: 'm2', price: 68000 },
  // 08. MEP & Sanitair
  'A.5.1.1.1': { code: 'A.5.1.1.1', name: 'Kloset Duduk Monoblok Dual Flush Komplit Aksesoris', unit: 'unit', price: 2450000 },
  'A.5.1.1.3': { code: 'A.5.1.1.3', name: 'Kran & Shower Mandi Set Stainless Steel', unit: 'unit', price: 580000 },
  'A.5.1.1.4': { code: 'A.5.1.1.4', name: 'Floor Drain Stainless Steel Anti Bau & Serangga', unit: 'unit', price: 125000 },
  'A.5.1.1.5': { code: 'A.5.1.1.5', name: 'Kitchen Sink Cuci Piring Stainless 1 Bak + Kran Angsa', unit: 'unit', price: 650000 },
  'A.5.1.3.1': { code: 'A.5.1.3.1', name: 'Bio Septictank Ramah Lingkungan Kapasitas 1000 Liter', unit: 'unit', price: 3200000 },
  'A.6.1.2.1': { code: 'A.6.1.2.1', name: 'Instalasi Titik Lampu Kabel NYM 3x1.5 mm dlm Conduit', unit: 'titik', price: 185000 },
  'A.6.1.3.1': { code: 'A.6.1.3.1', name: 'Instalasi Titik Stop Kontak Kabel NYM 3x2.5 mm', unit: 'titik', price: 195000 },
  // Infrastruktur Jalan, Paving & SDA
  'BM.6.1.1': { code: 'BM.6.1.1', name: 'Lapis Aus Aspal Beton (AC-WC) Tebal 4 cm Padat', unit: 'ton', price: 1350000 },
  'BM.6.1.2': { code: 'BM.6.1.2', name: 'Lapis Antara Aspal Beton (AC-BC) Tebal 6 cm Padat', unit: 'ton', price: 1280000 },
  'BM.7.1.1': { code: 'BM.7.1.1', name: 'Perkerasan Beton Semen (Rigid Pavement) K-350 / FS-45 t=20cm', unit: 'm3', price: 1650000 },
  'BM.5.1.1': { code: 'BM.5.1.1', name: 'Lapis Pondasi Agregat Kelas A (LPA) Tebal 15 cm Padat', unit: 'm3', price: 420000 },
  'BM.5.1.2': { code: 'BM.5.1.2', name: 'Lapis Pondasi Agregat Kelas B (LPB) Tebal 15 cm Padat', unit: 'm3', price: 380000 },
  'BM.6.1.3': { code: 'BM.6.1.3', name: 'Lapis Resap Pengikat (Prime Coat) Aspal Cair 0.8 L/m2', unit: 'm2', price: 18500 },
  'BM.6.1.4': { code: 'BM.6.1.4', name: 'Lapis Perekat (Tack Coat) Aspal Emulsi 0.3 L/m2', unit: 'm2', price: 14500 },
  'A.4.4.3.7': { code: 'A.4.4.3.7', name: 'Paving Block K-300 Tebal 6 cm Pola Bata', unit: 'm2', price: 175000 },
  'A.4.4.3.8': { code: 'A.4.4.3.8', name: 'Kanstin Beton Pengunci Tepi Paving 15x30x40 cm', unit: 'm1', price: 95000 },
  'A.4.4.3.9': { code: 'A.4.4.3.9', name: 'Ubin Pemandu Difabel / Tactile Guiding Block Kuning', unit: 'm2', price: 245000 },
  'SDA.2.1.1': { code: 'SDA.2.1.1', name: 'Saluran Beton Pracetak U-Ditch 40x40 cm Komplit Tutup Heavy Duty', unit: 'm1', price: 680000 },
  'SDA.2.1.2': { code: 'SDA.2.1.2', name: 'Pasangan Batu Kali Saluran Irigasi Mortar 1:4', unit: 'm3', price: 890000 },
  'SDA.2.1.3': { code: 'SDA.2.1.3', name: 'Plesteran Siar Saluran Irigasi 1:2', unit: 'm2', price: 55000 },
  'SDA.2.1.4': { code: 'SDA.2.1.4', name: 'Saluran Box Culvert Precast 200x200 cm K-350 Cross Drain', unit: 'm1', price: 2850000 },
  'BM.6.1.5': { code: 'BM.6.1.5', name: 'Pagar Pengaman Jalan (Guardrail W-Beam Galvanis)', unit: 'm1', price: 485000 },
  'BM.6.1.6': { code: 'BM.6.1.6', name: 'Patok Pengarah (Guide Post) Reflektif per 25 m', unit: 'buah', price: 165000 },
  'STR.WF.1': { code: 'STR.WF.1', name: 'Struktur Rangka Baja WF / Kolom Baja Fabrikasi & Cat Meni', unit: 'kg', price: 36000 },
  'STR.SPAN.1': { code: 'STR.SPAN.1', name: 'Penutup Atap Spandek Zincalume t=0.35 mm', unit: 'm2', price: 115000 },
  'FIN.HARD.1': { code: 'FIN.HARD.1', name: 'Floor Hardener Permukaan Lantai Beton Gudang / Industri', unit: 'm2', price: 48000 },
  'A.4.6.2.1': { code: 'A.4.6.2.1', name: 'Panel Fasad Aluminium Composite Panel (ACP) PVDF 4 mm Rangka Hollow', unit: 'm2', price: 650000 },
  'A.2.1.1.1': { code: 'A.2.1.1.1', name: 'Pembongkaran Dinding / Lantai Keramik Eksisting & Buang Puing', unit: 'm2', price: 35000 },
  'A.8.1.1.1': { code: 'A.8.1.1.1', name: 'Penanaman Rumput Taman Gajah Mini / Jepang & Tanah Subur', unit: 'm2', price: 45000 },
  'A.8.1.2.1': { code: 'A.8.1.2.1', name: 'Pagar Besi Hollow Galvanis Minimalis & Cat Meni', unit: 'm2', price: 450000 },
  'MEP.PV.1': { code: 'MEP.PV.1', name: 'Paket PLTS Solar PV Rooftop On-Grid 550Wp Komplit Inverter', unit: 'kWp', price: 12500000 },
  'A.5.1.2.1': { code: 'A.5.1.2.1', name: 'Pipa Distribusi Air Bersih PVC AW 2 Inchi Komplit Fitting & Valve', unit: 'm1', price: 42000 },
  'A.5.1.2.2': { code: 'A.5.1.2.2', name: 'Pipa Air Buangan & Limbah PVC D 4 Inchi', unit: 'm1', price: 78000 }
};

export class RabTemplateService {
  private static instance: RabTemplateService;
  private officialTemplates: Map<string, RabTemplate> = new Map();

  private constructor() {
    this.seedOfficialTemplates();
  }

  public static getInstance(): RabTemplateService {
    if (!RabTemplateService.instance) {
      RabTemplateService.instance = new RabTemplateService();
    }
    return RabTemplateService.instance;
  }

  // =========================================================================
  // 1. SEED OFFICIAL TEMPLATES (Multi-Sector Library)
  // =========================================================================
  private seedOfficialTemplates(): void {
    // -----------------------------------------------------------------------
    // A. RUMAH TINGGAL (Type 36 s/d Type 300) - 100% Regression Guaranteed
    // -----------------------------------------------------------------------
    const houseConfigs: Array<{
      id: string;
      code: string;
      name: string;
      area: number;
      floors: number;
      bedrooms: number;
      bathrooms: number;
      description: string;
      badge?: string;
    }> = [
      { id: 'HOUSE-T36-1FL', code: 'T36_1FL', name: 'Rumah Type 36 (1 Lantai)', area: 36, floors: 1, bedrooms: 2, bathrooms: 1, description: 'Luas bangunan ±36 m², 1 lantai (2 KT, 1 KM, Dapur, R. Tamu)', badge: 'Populer' },
      { id: 'HOUSE-T36-2FL', code: 'T36_2FL', name: 'Rumah Type 36 (2 Lantai)', area: 36, floors: 2, bedrooms: 2, bathrooms: 2, description: 'Luas bangunan ±36 m² per lantai (total 72 m²), 2 lantai', badge: '2 Lantai' },
      { id: 'HOUSE-T45-1FL', code: 'T45_1FL', name: 'Rumah Type 45', area: 45, floors: 1, bedrooms: 2, bathrooms: 1, description: 'Luas bangunan ±45 m², 1 lantai (2 KT, 1 KM, Carport)' },
      { id: 'HOUSE-T54-1FL', code: 'T54_1FL', name: 'Rumah Type 54', area: 54, floors: 1, bedrooms: 3, bathrooms: 1, description: 'Luas bangunan ±54 m², 1 lantai (3 KT, 1 KM, Carport)' },
      { id: 'HOUSE-T60-1FL', code: 'T60_1FL', name: 'Rumah Type 60', area: 60, floors: 1, bedrooms: 3, bathrooms: 2, description: 'Luas bangunan ±60 m², 1 lantai (3 KT, 2 KM, R. Makan)' },
      { id: 'HOUSE-T70-1FL', code: 'T70_1FL', name: 'Rumah Type 70', area: 70, floors: 1, bedrooms: 3, bathrooms: 2, description: 'Luas bangunan ±70 m², 1 lantai (3 KT, 2 KM, R. Keluarga)' },
      { id: 'HOUSE-T90-2FL', code: 'T90_2FL', name: 'Rumah Type 90 (2 Lantai)', area: 90, floors: 2, bedrooms: 4, bathrooms: 2, description: 'Luas bangunan ±90 m², 2 lantai (3-4 KT, 2 KM, Balkon)', badge: '2 Lantai' },
      { id: 'HOUSE-T100-2FL', code: 'T100_2FL', name: 'Rumah Type 100 (2 Lantai)', area: 100, floors: 2, bedrooms: 4, bathrooms: 3, description: 'Luas bangunan ±100 m², 2 lantai (4 KT, 2-3 KM, Carport)', badge: '2 Lantai' },
      { id: 'HOUSE-T120-2FL', code: 'T120_2FL', name: 'Rumah Type 120 (2 Lantai)', area: 120, floors: 2, bedrooms: 4, bathrooms: 3, description: 'Luas bangunan ±120 m², 2 lantai (4 KT, 3 KM, R. Tamu & R. Keluarga)', badge: '2 Lantai' },
      { id: 'HOUSE-T150-2FL', code: 'T150_2FL', name: 'Rumah Type 150 (2 Lantai)', area: 150, floors: 2, bedrooms: 5, bathrooms: 4, description: 'Luas bangunan ±150 m², 2 lantai (4-5 KT, 3-4 KM, Carport 2 Mobil)', badge: 'Premium' },
      { id: 'HOUSE-T180-2FL', code: 'T180_2FL', name: 'Rumah Type 180 (2 Lantai)', area: 180, floors: 2, bedrooms: 5, bathrooms: 4, description: 'Luas bangunan ±180 m², 2 lantai (4-5 KT, 4 KM, Garasi + Carport)', badge: 'Premium' },
      { id: 'HOUSE-T200-2FL', code: 'T200_2FL', name: 'Rumah Type 200 (2 Lantai)', area: 200, floors: 2, bedrooms: 5, bathrooms: 5, description: 'Luas bangunan ±200 m², 2 lantai (5 KT, 4-5 KM, Taman Belakang, Garasi)', badge: 'Mewah' },
      { id: 'HOUSE-T250-2FL', code: 'T250_2FL', name: 'Rumah Type 250 (2 Lantai)', area: 250, floors: 2, bedrooms: 6, bathrooms: 5, description: 'Luas bangunan ±250 m², 2 lantai (5-6 KT, 5 KM, Ruang Kerja, Garasi 2 Mobil)', badge: 'Mewah' },
      { id: 'HOUSE-T300-2FL', code: 'T300_2FL', name: 'Rumah Type 300 (2 Lantai)', area: 300, floors: 2, bedrooms: 6, bathrooms: 6, description: 'Luas bangunan ±300 m², 2 lantai (6 KT, 5-6 KM, Garasi 2 Mobil + Carport)', badge: 'Eksklusif' }
    ];

    for (const h of houseConfigs) {
      this.officialTemplates.set(h.id, {
        id: h.id,
        name: h.name,
        category: 'RUMAH_TINGGAL',
        subcategory: `${h.floors} Lantai`,
        description: h.description,
        badge: h.badge || 'Standar PUPR',
        icon: 'Home',
        supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
        defaultDetailLevel: 'PROFESSIONAL',
        parameters: [
          { id: 'building_area', key: 'building_area', label: 'Luas Bangunan', type: 'NUMBER', unit: 'm²', required: true, defaultValue: h.area, min: 20, max: 1000, group: 'dimensions' },
          { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: h.floors, min: 1, max: 4, group: 'dimensions' },
          { id: 'num_bedrooms', key: 'num_bedrooms', label: 'Kamar Tidur', type: 'NUMBER', required: false, defaultValue: h.bedrooms, min: 1, max: 10, group: 'general' },
          { id: 'num_bathrooms', key: 'num_bathrooms', label: 'Kamar Mandi', type: 'NUMBER', required: false, defaultValue: h.bathrooms, min: 1, max: 8, group: 'general' },
          { id: 'wall_height', key: 'wall_height', label: 'Tinggi Dinding', type: 'NUMBER', unit: 'm', required: false, defaultValue: 3.5, min: 2.8, max: 4.5, group: 'dimensions' }
        ],
        spaces: [
          { id: 'sp-kt', name: 'Kamar Tidur', category: 'Ruang Privat', quantityRule: 'num_bedrooms', targetArea: 12 },
          { id: 'sp-km', name: 'Kamar Mandi', category: 'Servis', quantityRule: 'num_bathrooms', targetArea: 3.5 },
          { id: 'sp-rt', name: 'Ruang Tamu & Keluarga', category: 'Publik', quantityRule: '1', targetArea: h.area * 0.3 },
          { id: 'sp-dp', name: 'Dapur', category: 'Servis', quantityRule: '1', targetArea: 6 }
        ],
        components: this.buildStandardHouseComponents(h.area, h.floors, h.bathrooms),
        metadata: {
          source: 'EZRAB_OFFICIAL',
          version: '2.1.0',
          author: 'EZRAB Engineering',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-09-25T00:00:00Z'
        },
        generateRabItems: (params, detailLevel, optionalItemIds) => {
          return this.generateDefaultItemsFromComponents(
            this.officialTemplates.get(h.id)!,
            params,
            detailLevel,
            optionalItemIds
          );
        }
      });
    }

    // Rumah Custom
    this.officialTemplates.set('HOUSE-CUSTOM', {
      id: 'HOUSE-CUSTOM',
      name: 'Rumah Custom Parametrik',
      category: 'RUMAH_TINGGAL',
      subcategory: 'Custom Desain',
      description: 'Template fleksibel untuk rumah tinggal dengan luas, denah, lantai, dan spesifikasi bebas.',
      badge: 'Fleksibel',
      icon: 'Home',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Luas Bangunan', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 104.5, min: 20, max: 2000, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 1, min: 1, max: 4, group: 'dimensions' },
        { id: 'num_bedrooms', key: 'num_bedrooms', label: 'Kamar Tidur', type: 'NUMBER', required: false, defaultValue: 3, min: 1, max: 15, group: 'general' },
        { id: 'num_bathrooms', key: 'num_bathrooms', label: 'Kamar Mandi', type: 'NUMBER', required: false, defaultValue: 2, min: 1, max: 10, group: 'general' },
        { id: 'wall_height', key: 'wall_height', label: 'Tinggi Dinding', type: 'NUMBER', unit: 'm', required: false, defaultValue: 3.5, min: 2.8, max: 5.0, group: 'dimensions' }
      ],
      spaces: [
        { id: 'sp-kt', name: 'Kamar Tidur', category: 'Ruang Privat', quantityRule: 'num_bedrooms', targetArea: 12 },
        { id: 'sp-km', name: 'Kamar Mandi', category: 'Servis', quantityRule: 'num_bathrooms', targetArea: 3.5 }
      ],
      components: this.buildStandardHouseComponents(104.5, 1, 2),
      metadata: {
        source: 'EZRAB_OFFICIAL',
        version: '2.1.0',
        author: 'EZRAB Engineering',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-09-25T00:00:00Z'
      },
      generateRabItems: (params, detailLevel, optionalItemIds) => {
        return this.generateDefaultItemsFromComponents(
          this.officialTemplates.get('HOUSE-CUSTOM')!,
          params,
          detailLevel,
          optionalItemIds
        );
      }
    });

    // -----------------------------------------------------------------------
    // B. JALAN & TRANSPORTASI
    // -----------------------------------------------------------------------
    this.officialTemplates.set('INFRA-ROAD-RIGID', {
      id: 'INFRA-ROAD-RIGID',
      name: 'Jalan Beton Semen (Rigid Pavement)',
      category: 'JALAN_TRANSPORTASI',
      subcategory: 'Perkerasan Kaku',
      description: 'Pembangunan jalan perkerasan kaku beton K-350 / FS-45 t=20cm, Lean Concrete t=5cm, Tie Bar & Dowel standar Bina Marga.',
      badge: 'Bina Marga',
      icon: 'Milestone',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'road_length', key: 'road_length', label: 'Panjang Jalan', type: 'NUMBER', unit: 'm', required: true, defaultValue: 1000, min: 10, max: 50000, group: 'dimensions' },
        { id: 'road_width', key: 'road_width', label: 'Lebar Perkerasan', type: 'NUMBER', unit: 'm', required: true, defaultValue: 6.0, min: 2.5, max: 25, group: 'dimensions' },
        { id: 'concrete_thickness_m', key: 'concrete_thickness_m', label: 'Tebal Plat Beton', type: 'NUMBER', unit: 'm', required: true, defaultValue: 0.20, min: 0.15, max: 0.35, group: 'specifications' },
        { id: 'shoulder_width', key: 'shoulder_width', label: 'Lebar Bahu Jalan Kiri & Kanan', type: 'NUMBER', unit: 'm', required: false, defaultValue: 1.0, min: 0.5, max: 3.0, group: 'dimensions' },
        { id: 'has_drainage', key: 'has_drainage', label: 'Drainase Samping (U-Ditch)', type: 'BOOLEAN', required: false, defaultValue: true, group: 'specifications' }
      ],
      components: [
        { id: 'c-clearing', name: 'Pembersihan & Pengupasan Lahan Badan Jalan (Clearing & Grubbing)', category: '01. PEKERJAAN PERSIAPAN', unit: 'm2', calculationRule: 'road_length * (road_width + (shoulder_width * 2) + 2)', variables: ['road_length', 'road_width', 'shoulder_width'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-subgrade', name: 'Penyiapan Badan Jalan Subgrade Nilai CBR Min 6%', category: '02. PEKERJAAN TANAH', unit: 'm2', calculationRule: 'road_length * road_width', variables: ['road_length', 'road_width'], ahspCode: 'BM.5.1.2', unitPrice: 18500, detailLevel: 'STANDARD' },
        { id: 'c-lpb', name: 'Hamparan Lapis Pondasi Bawah Agregat Kelas B (LPB) t=15 cm', category: '03. LAPIS PONDASI', unit: 'm3', calculationRule: 'road_length * (road_width + 0.4) * 0.15', variables: ['road_length', 'road_width'], ahspCode: 'BM.5.1.2', unitPrice: 380000, detailLevel: 'STANDARD' },
        { id: 'c-lc', name: 'Lantai Kerja Lean Concrete (LC) Tebal 5 cm (f\'c = 10 MPa)', category: '03. LAPIS PONDASI', unit: 'm3', calculationRule: 'road_length * road_width * 0.05', variables: ['road_length', 'road_width'], ahspCode: 'A.4.1.1.1', unitPrice: 890000, detailLevel: 'STANDARD', materialCategory: 'BETON', defaultMaterialId: 'MAT-BETON-K250' },
        { id: 'c-rigid', name: 'Perkerasan Beton Semen FS-45 / K-350 t=20 cm Komplit Wiremesh & Joint Sealant', category: '04. PERKERASAN BETON', unit: 'm3', calculationRule: 'road_length * road_width * concrete_thickness_m', variables: ['road_length', 'road_width', 'concrete_thickness_m'], ahspCode: 'BM.7.1.1', unitPrice: 1650000, detailLevel: 'STANDARD', materialCategory: 'BETON', defaultMaterialId: 'MAT-BETON-K350' },
        { id: 'c-shoulder', name: 'Bahu Jalan Agregat Kelas S Dipadatkan', category: '05. BAHU JALAN', unit: 'm3', calculationRule: 'road_length * (shoulder_width * 2) * 0.15', variables: ['road_length', 'shoulder_width'], ahspCode: 'BM.5.1.2', unitPrice: 380000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-kerb-rigid', name: 'Kanstin Beton Pembatas Tepi K-250 15x30x40 cm', category: '05. BAHU JALAN & KERB', unit: 'm1', calculationRule: 'road_length * 2', variables: ['road_length'], ahspCode: 'A.4.4.3.8', unitPrice: 95000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-drain-rigid', name: 'Saluran Drainase Samping Saluran Terbuka Pasangan Batu', category: '05. BAHU JALAN & KERB', unit: 'm1', calculationRule: 'road_length * 2', variables: ['road_length'], ahspCode: 'SDA.2.1.2', unitPrice: 185000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-marka-road', name: 'Marka Jalan Garis Putih Termoplastik 12 cm', category: '06. PERLENGKAPAN JALAN', unit: 'm1', calculationRule: 'road_length', variables: ['road_length'], ahspCode: 'BM.6.1.4', unitPrice: 35000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-pju-road', name: 'Penerangan Jalan Umum (PJU) Solar Cell per 50 m', category: '06. PERLENGKAPAN JALAN', unit: 'titik', calculationRule: 'Math.ceil(road_length / 50)', variables: ['road_length'], ahspCode: 'A.6.1.2.1', unitPrice: 4500000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-guardrail-rigid', name: 'Pagar Pengaman Jalan (Guardrail W-Beam Galvanis)', category: '06. PERLENGKAPAN JALAN', unit: 'm1', calculationRule: 'road_length * 0.2', variables: ['road_length'], ahspCode: 'BM.6.1.5', unitPrice: 485000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', author: 'Bina Marga Division', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('INFRA-ROAD-ASPHALT', {
      id: 'INFRA-ROAD-ASPHALT',
      name: 'Jalan Aspal Hotmix (Flexible Pavement)',
      category: 'JALAN_TRANSPORTASI',
      subcategory: 'Perkerasan Lentur',
      description: 'Pembangunan jalan aspal fleksibel dengan Lapis Aus AC-WC t=4cm, Lapis Antara AC-BC t=6cm, LPA & LPB.',
      badge: 'Bina Marga',
      icon: 'Milestone',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'road_length', key: 'road_length', label: 'Panjang Jalan', type: 'NUMBER', unit: 'm', required: true, defaultValue: 1000, min: 10, max: 50000, group: 'dimensions' },
        { id: 'road_width', key: 'road_width', label: 'Lebar Perkerasan', type: 'NUMBER', unit: 'm', required: true, defaultValue: 6.0, min: 2.5, max: 25, group: 'dimensions' },
        { id: 'asphalt_thickness_cm', key: 'asphalt_thickness_cm', label: 'Tebal Aspal Total', type: 'NUMBER', unit: 'cm', required: true, defaultValue: 10, min: 4, max: 15, group: 'specifications' }
      ],
      components: [
        { id: 'c-prep', name: 'Pembersihan dan Penyiapan Badan Jalan', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'road_length * road_width', variables: ['road_length', 'road_width'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-lpa', name: 'Lapis Pondasi Agregat Kelas A (LPA) t=15 cm', category: '02. PONDASI AGREGAT', unit: 'm3', calculationRule: 'road_length * road_width * 0.15', variables: ['road_length', 'road_width'], ahspCode: 'BM.5.1.1', unitPrice: 420000, detailLevel: 'STANDARD' },
        { id: 'c-prime', name: 'Lapis Resap Pengikat (Prime Coat) 0.8 L/m²', category: '03. PERKERASAN ASPAL', unit: 'm2', calculationRule: 'road_length * road_width', variables: ['road_length', 'road_width'], ahspCode: 'BM.6.1.3', unitPrice: 18500, detailLevel: 'STANDARD' },
        { id: 'c-acbc', name: 'Lapis Antara Aspal Beton AC-BC t=6 cm Padat', category: '03. PERKERASAN ASPAL', unit: 'ton', calculationRule: 'road_length * road_width * 0.06 * 2.3', variables: ['road_length', 'road_width'], ahspCode: 'BM.6.1.2', unitPrice: 1280000, detailLevel: 'STANDARD' },
        { id: 'c-tack', name: 'Lapis Perekat (Tack Coat) 0.3 L/m²', category: '03. PERKERASAN ASPAL', unit: 'm2', calculationRule: 'road_length * road_width', variables: ['road_length', 'road_width'], ahspCode: 'BM.6.1.4', unitPrice: 14500, detailLevel: 'STANDARD' },
        { id: 'c-acwc', name: 'Lapis Aus Aspal Beton AC-WC t=4 cm Padat', category: '03. PERKERASAN ASPAL', unit: 'ton', calculationRule: 'road_length * road_width * 0.04 * 2.3', variables: ['road_length', 'road_width'], ahspCode: 'BM.6.1.1', unitPrice: 1350000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-asph-bahu', name: 'Bahu Jalan Agregat Kelas S Dipadatkan t=15 cm', category: '04. BAHU JALAN', unit: 'm3', calculationRule: 'road_length * 2 * 0.15', variables: ['road_length'], ahspCode: 'BM.5.1.2', unitPrice: 380000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-asph-kerb', name: 'Kanstin Trotoar & Saluran Tepi Beton K-250', category: '04. BAHU JALAN', unit: 'm1', calculationRule: 'road_length * 2', variables: ['road_length'], ahspCode: 'A.4.4.3.8', unitPrice: 95000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-asph-marka', name: 'Marka Jalan Garis Putih Termoplastik 12 cm', category: '05. PERLENGKAPAN JALAN', unit: 'm1', calculationRule: 'road_length', variables: ['road_length'], ahspCode: 'BM.6.1.4', unitPrice: 35000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-asph-patok', name: 'Patok Pengarah (Guide Post) Reflektif per 25 m', category: '05. PERLENGKAPAN JALAN', unit: 'buah', calculationRule: 'Math.ceil(road_length / 25)', variables: ['road_length'], ahspCode: 'BM.6.1.6', unitPrice: 165000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // C. PERKERASAN (PAVING & TROTOAR)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('PAV-KOMPLEK-6CM', {
      id: 'PAV-KOMPLEK-6CM',
      name: 'Paving Block Halaman & Parkir Kompleks t=6 cm',
      category: 'PERKERASAN',
      subcategory: 'Paving Ringan - Sedang',
      description: 'Pemasangan paving block press hidrolik K-300 tebal 6 cm model bata, pasir alas t=5cm, kanstin beton 15x30x40cm, dan subbase agregat B.',
      badge: 'Paving K-300',
      icon: 'Grid',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'paving_area', key: 'paving_area', label: 'Luas Pemasangan Paving', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 600, min: 20, max: 50000, group: 'dimensions' },
        { id: 'curb_length', key: 'curb_length', label: 'Panjang Kanstin Pembatas Tepi', type: 'NUMBER', unit: 'm', required: false, defaultValue: 200, min: 0, group: 'dimensions' }
      ],
      components: [
        { id: 'c-leveling', name: 'Perataan & Pemadatan Tanah Dasar Subgrade', category: '01. TANAH', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-sand', name: 'Urugan Pasir Alas Tebal 5 cm', category: '02. PASIR ALAS', unit: 'm3', calculationRule: 'paving_area * 0.05', variables: ['paving_area'], ahspCode: 'A.2.3.1.11', unitPrice: 185000, detailLevel: 'STANDARD' },
        { id: 'c-paving', name: 'Pemasangan Paving Block K-300 Komplit Pasir Pengisi (Abu Batu)', category: '03. PAVING', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.4.4.3.7', unitPrice: 175000, detailLevel: 'STANDARD', materialCategory: 'PAVING', defaultMaterialId: 'MAT-PAV-BATA-6' },
        { id: 'c-kanstin', name: 'Pemasangan Kanstin Beton Pengunci Tepi 15x30x40 cm', category: '04. KANSTIN', unit: 'm1', calculationRule: 'curb_length', variables: ['curb_length'], ahspCode: 'A.4.4.3.8', unitPrice: 95000, detailLevel: 'STANDARD', materialCategory: 'PAVING', defaultMaterialId: 'MAT-KANSTIN-1530' },
        // Professional additions
        { id: 'c-subbase-paving', name: 'Lapis Pondasi Bawah Agregat Kelas B t=10 cm', category: '02. PASIR ALAS & SUBBASE', unit: 'm3', calculationRule: 'paving_area * 0.10', variables: ['paving_area'], ahspCode: 'BM.5.1.2', unitPrice: 380000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-drain-paving', name: 'Tali Air Saluran Terbuka Tepi Paving Pasangan Batu t=10 cm', category: '04. KANSTIN & DRAINASE', unit: 'm1', calculationRule: 'curb_length', variables: ['curb_length'], ahspCode: 'A.3.2.1.2', unitPrice: 125000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-opt-coating', name: 'Coating Water Repellent Permukaan Paving', category: '03. PAVING', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.4.4.3.3', unitPrice: 35000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-opt-sumur', name: 'Sumur Resapan Air Hujan Kawasan Paving', category: '04. KANSTIN & DRAINASE', unit: 'titik', calculationRule: 'Math.ceil(paving_area / 200)', variables: ['paving_area'], ahspCode: 'A.5.1.3.1', unitPrice: 2850000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('PAV-INDUSTRI-8CM', {
      id: 'PAV-INDUSTRI-8CM',
      name: 'Paving Block Heavy Duty Pelabuhan & Industri t=8 cm',
      category: 'PERKERASAN',
      subcategory: 'Paving Beban Berat',
      description: 'Pemasangan paving block heavy duty mutu K-350 tebal 8 cm model segi enam khusus jalur kontainer, truk berat, dan pergudangan.',
      badge: 'Heavy Duty K-350',
      icon: 'Grid',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'paving_area', key: 'paving_area', label: 'Luas Area Paving', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 2500, min: 100, max: 100000, group: 'dimensions' },
        { id: 'curb_length', key: 'curb_length', label: 'Panjang Kanstin Heavy Duty', type: 'NUMBER', unit: 'm', required: false, defaultValue: 300, group: 'dimensions' }
      ],
      components: [
        { id: 'c-ind-subgrade', name: 'Penyiapan Tanah Dasar Subgrade CBR Min 6%', category: '01. TANAH DASAR', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.2.2.1.9', unitPrice: 18500, detailLevel: 'STANDARD' },
        { id: 'c-ind-lpa', name: 'Lapis Pondasi Agregat Kelas A (LPA) Tebal 20 cm Padat', category: '02. PONDASI AGREGAT', unit: 'm3', calculationRule: 'paving_area * 0.20', variables: ['paving_area'], ahspCode: 'BM.5.1.1', unitPrice: 420000, detailLevel: 'STANDARD' },
        { id: 'c-ind-sand', name: 'Hamparan Pasir Alas / Bedding Sand t=5 cm Padat', category: '03. PASIR ALAS', unit: 'm3', calculationRule: 'paving_area * 0.05', variables: ['paving_area'], ahspCode: 'A.2.3.1.11', unitPrice: 185000, detailLevel: 'STANDARD' },
        { id: 'c-ind-paving', name: 'Pemasangan Paving Block Segi Enam K-350 t=8 cm Heavy Duty', category: '04. PERKERASAN PAVING', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.4.4.3.7', unitPrice: 215000, detailLevel: 'STANDARD', materialCategory: 'PAVING', defaultMaterialId: 'MAT-PAV-HEXA-8' },
        { id: 'c-ind-kanstin', name: 'Kanstin Beton Pengunci Tepi Pracetak K-300 Heavy Duty', category: '05. KANSTIN', unit: 'm1', calculationRule: 'curb_length', variables: ['curb_length'], ahspCode: 'A.4.4.3.8', unitPrice: 125000, detailLevel: 'STANDARD' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // D. SDA & IRIGASI
    // -----------------------------------------------------------------------
    this.officialTemplates.set('SDA-DRAIN-UDITCH', {
      id: 'SDA-DRAIN-UDITCH',
      name: 'Saluran Drainase U-Ditch Beton Pracetak',
      category: 'SDA_IRIGASI',
      subcategory: 'Drainase',
      description: 'Pemasangan saluran drainase beton precast U-Ditch komplit Tutup Cover Heavy/Light Duty dan pasir alas.',
      badge: 'SDA PUPR',
      icon: 'Droplets',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'channel_length', key: 'channel_length', label: 'Panjang Saluran', type: 'NUMBER', unit: 'm', required: true, defaultValue: 250, min: 10, max: 10000, group: 'dimensions' },
        { id: 'uditch_width', key: 'uditch_width', label: 'Dimensi U-Ditch (Lebar x Tinggi)', type: 'SELECT', required: true, defaultValue: '40x40', options: [{ label: 'U-Ditch 30x30 cm', value: '30x30' }, { label: 'U-Ditch 40x40 cm', value: '40x40' }, { label: 'U-Ditch 60x60 cm', value: '60x60' }], group: 'specifications' }
      ],
      components: [
        { id: 'c-excav', name: 'Galian Tanah Saluran Drainase', category: '01. GALIAN TANAH', unit: 'm3', calculationRule: 'channel_length * 0.8 * 0.8', variables: ['channel_length'], ahspCode: 'A.2.3.1.1', unitPrice: 88500, detailLevel: 'STANDARD' },
        { id: 'c-sandbed', name: 'Urugan Pasir Alas Bawah U-Ditch t=5 cm', category: '02. PASIR ALAS', unit: 'm3', calculationRule: 'channel_length * 0.6 * 0.05', variables: ['channel_length'], ahspCode: 'A.2.3.1.11', unitPrice: 185000, detailLevel: 'STANDARD' },
        { id: 'c-uditch', name: 'Pemasangan Saluran Beton Precast U-Ditch Komplit Joint Mortar', category: '03. PEMASANGAN U-DITCH', unit: 'm1', calculationRule: 'channel_length', variables: ['channel_length'], ahspCode: 'SDA.2.1.1', unitPrice: 680000, detailLevel: 'STANDARD' },
        { id: 'c-backfill', name: 'Urugan Tanah Kembali Samping Saluran & Pemadatan', category: '04. URUGAN KEMBALI', unit: 'm3', calculationRule: 'channel_length * 0.3 * 0.6', variables: ['channel_length'], ahspCode: 'A.2.3.1.9', unitPrice: 32000, detailLevel: 'STANDARD' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('SDA-IRRIGATION-STONE', {
      id: 'SDA-IRRIGATION-STONE',
      name: 'Saluran Irigasi Pasangan Batu Kali',
      category: 'SDA_IRIGASI',
      subcategory: 'Irigasi',
      description: 'Pembangunan atau rehabilitasi dinding saluran irigasi pertanian menggunakan pasangan batu kali belah 1:4 dan plesteran siar 1:2.',
      badge: 'Irigasi',
      icon: 'Droplets',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'channel_length', key: 'channel_length', label: 'Panjang Saluran', type: 'NUMBER', unit: 'm', required: true, defaultValue: 500, min: 20, max: 10000, group: 'dimensions' },
        { id: 'channel_height', key: 'channel_height', label: 'Tinggi Tebing Saluran', type: 'NUMBER', unit: 'm', required: true, defaultValue: 1.2, min: 0.5, max: 3.0, group: 'dimensions' },
        { id: 'wall_thickness', key: 'wall_thickness', label: 'Tebal Pasangan Rata-Rata', type: 'NUMBER', unit: 'm', required: false, defaultValue: 0.30, min: 0.20, max: 0.50, group: 'specifications' }
      ],
      components: [
        { id: 'c-galian', name: 'Galian Tanah Pembentukan Profil Saluran', category: '01. GALIAN TANAH', unit: 'm3', calculationRule: 'channel_length * channel_height * 0.8', variables: ['channel_length', 'channel_height'], ahspCode: 'A.2.3.1.1', unitPrice: 88500, detailLevel: 'STANDARD' },
        { id: 'c-batu', name: 'Pasangan Batu Kali Belah 1:4 Saluran Irigasi (2 Sisi Tebing)', category: '02. PASANGAN BATU', unit: 'm3', calculationRule: 'channel_length * channel_height * wall_thickness * 2', variables: ['channel_length', 'channel_height', 'wall_thickness'], ahspCode: 'SDA.2.1.2', unitPrice: 890000, detailLevel: 'STANDARD' },
        { id: 'c-siar', name: 'Plesteran Siar Saluran Mortar 1:2', category: '03. PLESTERAN SIAR', unit: 'm2', calculationRule: 'channel_length * channel_height * 2', variables: ['channel_length', 'channel_height'], ahspCode: 'SDA.2.1.3', unitPrice: 55000, detailLevel: 'STANDARD' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // E. GEDUNG & KOMERSIAL
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-OFFICE-MULTI', {
      id: 'BLD-OFFICE-MULTI',
      name: 'Gedung Perkantoran Bertingkat',
      category: 'GEDUNG',
      subcategory: 'Perkantoran',
      description: 'Pembangunan gedung kantor representatif bertingkat dengan struktur beton bertulang K-300, partisi gypsum, drop ceiling, dan MEP komplit.',
      badge: 'Komersial',
      icon: 'Building2',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Total Luas Bangunan', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 600, min: 100, max: 20000, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 3, min: 2, max: 10, group: 'dimensions' }
      ],
      components: [
        { id: 'c-prep', name: 'Pembersihan Lapangan & Bowplank Gedung', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'building_area / num_floors * 1.3', variables: ['building_area', 'num_floors'], ahspCode: 'A.2.2.1.1', unitPrice: 18500, detailLevel: 'STANDARD' },
        { id: 'c-pondasi', name: 'Pondasi Footplate & Bored Pile Beton K-300', category: '02. PONDASI & STRUKTUR BAWAH', unit: 'm3', calculationRule: 'building_area * 0.12', variables: ['building_area'], ahspCode: 'A.4.1.1.5', unitPrice: 4700000, detailLevel: 'STANDARD' },
        { id: 'c-kolom', name: 'Beton Kolom & Balok Bertulang K-300', category: '03. STRUKTUR UTAMA', unit: 'm3', calculationRule: 'building_area * 0.22', variables: ['building_area'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-plat', name: 'Pelat Lantai Beton Bondek t=12 cm', category: '03. STRUKTUR UTAMA', unit: 'm3', calculationRule: 'building_area * ((num_floors - 1) / num_floors) * 0.12', variables: ['building_area', 'num_floors'], ahspCode: 'A.4.1.1.7', unitPrice: 4650000, detailLevel: 'STANDARD' },
        { id: 'c-facade', name: 'Dinding Bata Ringan & Curtain Wall Aluminium Kaca', category: '04. ARSITEKTUR & FASAD', unit: 'm2', calculationRule: 'building_area * 1.1', variables: ['building_area'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-floor', name: 'Lantai Granit Homogeneous 60x60 cm High Traffic', category: '04. ARSITEKTUR & FASAD', unit: 'm2', calculationRule: 'building_area * 0.85', variables: ['building_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        { id: 'c-mep', name: 'Instalasi Listrik, Penerangan LED Troffer & Data LAN', category: '05. MEKANIKAL & ELEKTRIKAL', unit: 'titik', calculationRule: 'building_area * 0.25', variables: ['building_area'], ahspCode: 'A.6.1.2.1', unitPrice: 185000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-plafon', name: 'Plafon Gypsum Akustik / Drop Ceiling Kantor', category: '04. ARSITEKTUR & FASAD', unit: 'm2', calculationRule: 'building_area * 0.90', variables: ['building_area'], ahspCode: 'A.4.5.3.2', unitPrice: 85000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-paint-bld', name: 'Pengecatan Dinding Interior & Eksterior Weathercoat', category: '04. ARSITEKTUR & FASAD', unit: 'm2', calculationRule: 'building_area * 2.2', variables: ['building_area'], ahspCode: 'A.4.7.1.2', unitPrice: 48000, detailLevel: 'PROFESSIONAL', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
        { id: 'c-sanitary-bld', name: 'Sanitair Kloset Duduk & Wastafel Kantor per Lantai', category: '05. MEKANIKAL & ELEKTRIKAL', unit: 'unit', calculationRule: 'num_floors * 4', variables: ['num_floors'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'PROFESSIONAL', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        { id: 'c-doors-bld', name: 'Pintu Kaca Frameless Tempered 12 mm & Kusen Aluminium', category: '04. ARSITEKTUR & FASAD', unit: 'unit', calculationRule: 'num_floors * 3', variables: ['num_floors'], ahspCode: 'A.4.6.1.1', unitPrice: 3850000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-waterproof-roof', name: 'Waterproofing Coating Membran Bakar Dak Beton Atap', category: '04. ARSITEKTUR & FASAD', unit: 'm2', calculationRule: 'building_area / num_floors', variables: ['building_area', 'num_floors'], ahspCode: 'A.4.4.3.3', unitPrice: 95000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-fire-alarm', name: 'Instalasi Fire Alarm Smoke Detector & Heat Detector', category: '05. MEKANIKAL & ELEKTRIKAL', unit: 'titik', calculationRule: 'building_area * 0.15', variables: ['building_area'], ahspCode: 'A.6.1.2.1', unitPrice: 450000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-hvac-vrv', name: 'Instalasi Tata Udara HVAC Central VRV Kantor', category: '05. MEKANIKAL & ELEKTRIKAL', unit: 'titik', calculationRule: 'num_floors * 4', variables: ['num_floors'], ahspCode: 'A.6.1.3.1', unitPrice: 6500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // F. BANGUNAN TINGGI
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-HIGHRISE-TOWER', {
      id: 'BLD-HIGHRISE-TOWER',
      name: 'Bangunan Tinggi (Tower & Podium)',
      category: 'BANGUNAN_TINGGI',
      subcategory: 'High-Rise',
      description: 'Template estimasi struktur dan arsitektur gedung bertingkat tinggi dengan podium komersial, tower tipikal, core lift, dan basement.',
      badge: 'High-Rise',
      icon: 'Building',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'total_floors', key: 'total_floors', label: 'Total Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 12, min: 5, max: 60, group: 'dimensions' },
        { id: 'basement_floors', key: 'basement_floors', label: 'Jumlah Lantai Basement', type: 'NUMBER', required: false, defaultValue: 2, min: 0, max: 5, group: 'dimensions' },
        { id: 'typical_floor_area', key: 'typical_floor_area', label: 'Luas Lantai Tipikal', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 800, min: 200, max: 5000, group: 'dimensions' }
      ],
      components: [
        { id: 'c-diaphragm', name: 'Dinding Diafragma & Pekerjaan Tanah Basement', category: '01. SUBSTRUCTURE', unit: 'm3', calculationRule: 'typical_floor_area * basement_floors * 3.5', variables: ['typical_floor_area', 'basement_floors'], ahspCode: 'A.2.3.1.2', unitPrice: 105000, detailLevel: 'STANDARD' },
        { id: 'c-raft', name: 'Raft Foundation Beton Mutu Tinggi K-400', category: '01. SUBSTRUCTURE', unit: 'm3', calculationRule: 'typical_floor_area * 1.2', variables: ['typical_floor_area'], ahspCode: 'A.4.1.1.5', unitPrice: 4700000, detailLevel: 'STANDARD' },
        { id: 'c-core', name: 'Shear Wall & Core Area Lift Beton Bertulang K-400', category: '02. SUPERSTRUCTURE', unit: 'm3', calculationRule: 'total_floors * 45', variables: ['total_floors'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-tower-slab', name: 'Pelat Lantai Tipikal Beton Bondek t=13 cm', category: '02. SUPERSTRUCTURE', unit: 'm3', calculationRule: 'typical_floor_area * total_floors * 0.13', variables: ['typical_floor_area', 'total_floors'], ahspCode: 'A.4.1.1.7', unitPrice: 4650000, detailLevel: 'STANDARD' },
        { id: 'c-curtain', name: 'Facade Curtain Wall Unitized Kaca Low-E', category: '03. FACADE', unit: 'm2', calculationRule: 'typical_floor_area * total_floors * 0.45', variables: ['typical_floor_area', 'total_floors'], ahspCode: 'A.4.6.1.1', unitPrice: 165000, detailLevel: 'STANDARD' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // G. HOTEL & HOSPITALITY
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-HOTEL-RESORT', {
      id: 'BLD-HOTEL-RESORT',
      name: 'Hotel Berbintang & Resort',
      category: 'HOTEL_HOSPITALITY',
      subcategory: 'Hospitality',
      description: 'Template estimasi pembangunan hotel standar bintang 3-4 dengan fasilitas kamar, lobby, restoran, meeting room, dan kolam renang.',
      badge: 'Bintang 3-4',
      icon: 'Hotel',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'num_rooms', key: 'num_rooms', label: 'Total Jumlah Kamar', type: 'NUMBER', required: true, defaultValue: 80, min: 10, max: 500, group: 'general' },
        { id: 'room_area_m2', key: 'room_area_m2', label: 'Luas Kamar Rata-Rata', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 28, min: 20, max: 60, group: 'dimensions' }
      ],
      components: [
        { id: 'c-structure', name: 'Struktur Beton Bertulang K-300 Gedung Hotel', category: '01. STRUKTUR', unit: 'm3', calculationRule: 'num_rooms * room_area_m2 * 1.5 * 0.28', variables: ['num_rooms', 'room_area_m2'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-room-wall', name: 'Partisi Dinding Kamar Kedap Suara (Rockwool Gypsum ganda)', category: '02. ARSITEKTUR KAMAR', unit: 'm2', calculationRule: 'num_rooms * 45', variables: ['num_rooms'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-bathroom', name: 'Finishing Keramik & Sanitair Lengkap Kamar Mandi Hotel', category: '03. SANITAIR & PLAMBING', unit: 'unit', calculationRule: 'num_rooms', variables: ['num_rooms'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'STANDARD', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        { id: 'c-floor', name: 'Lantai Granit & Karpet Kamar Hotel', category: '02. ARSITEKTUR KAMAR', unit: 'm2', calculationRule: 'num_rooms * room_area_m2', variables: ['num_rooms', 'room_area_m2'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // H. KESEHATAN
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-HEALTH-HOSPITAL', {
      id: 'BLD-HEALTH-HOSPITAL',
      name: 'Rumah Sakit & Fasilitas Kesehatan',
      category: 'KESEHATAN',
      subcategory: 'Fasilitas Medis',
      description: 'Template estimasi gedung rumah sakit / klinik rawat inap dengan ruang IGD, poliklinik, rawat inap, farmasi, dan standar sanitasi medis.',
      badge: 'Standar Kemenkes',
      icon: 'HeartPulse',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'num_beds', key: 'num_beds', label: 'Kapasitas Tempat Tidur (Bed)', type: 'NUMBER', required: true, defaultValue: 50, min: 10, max: 500, group: 'general' },
        { id: 'building_area', key: 'building_area', label: 'Estimasi Luas Bangunan Total', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 1800, min: 200, max: 20000, group: 'dimensions' }
      ],
      components: [
        { id: 'c-struct', name: 'Struktur Beton Bertulang K-300 Tahan Gempa Rumah Sakit', category: '01. STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.25', variables: ['building_area'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-vinyl', name: 'Lantai Vinyl Antibakteri Seamless Khusus Medis', category: '02. FINISHING MEDIS', unit: 'm2', calculationRule: 'building_area * 0.75', variables: ['building_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD' },
        { id: 'c-wall-med', name: 'Dinding Bata Ringan & Pengecatan Cat Antibakteri Mudah Dibersihkan', category: '02. FINISHING MEDIS', unit: 'm2', calculationRule: 'building_area * 1.8', variables: ['building_area'], ahspCode: 'A.4.7.1.2', unitPrice: 42000, detailLevel: 'STANDARD', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
        { id: 'c-gas-med', name: 'Instalasi Sanitair & Plambing Medis', category: '03. PLAMBING & SANITASI', unit: 'titik', calculationRule: 'num_beds * 2.5', variables: ['num_beds'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'STANDARD' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // I. PENDIDIKAN
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-EDU-SCHOOL', {
      id: 'BLD-EDU-SCHOOL',
      name: 'Gedung Sekolah & Fasilitas Pendidikan',
      category: 'PENDIDIKAN',
      subcategory: 'Pendidikan',
      description: 'Template estimasi pembangunan gedung sekolah / ruang kelas belajar bertingkat dengan selasar koridor, toilet siswa, dan atap baja ringan.',
      badge: 'Fasilitas Pendidikan',
      icon: 'GraduationCap',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'num_classrooms', key: 'num_classrooms', label: 'Jumlah Ruang Kelas', type: 'NUMBER', required: true, defaultValue: 6, min: 2, max: 40, group: 'general' },
        { id: 'classroom_area', key: 'classroom_area', label: 'Luas per Ruang Kelas', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 63, min: 40, max: 100, group: 'dimensions' }
      ],
      components: [
        { id: 'c-edu-struct', name: 'Struktur Beton Bertulang Kolom & Balok Gedung Sekolah', category: '01. STRUKTUR', unit: 'm3', calculationRule: 'num_classrooms * classroom_area * 1.35 * 0.16', variables: ['num_classrooms', 'classroom_area'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-edu-wall', name: 'Pasangan Dinding Bata Ringan t=10 cm & Plester Aci', category: '02. ARSITEKTUR', unit: 'm2', calculationRule: 'num_classrooms * 75', variables: ['num_classrooms'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-edu-floor', name: 'Lantai Keramik Polished 40x40 cm Ruang Kelas', category: '02. ARSITEKTUR', unit: 'm2', calculationRule: 'num_classrooms * classroom_area', variables: ['num_classrooms', 'classroom_area'], ahspCode: 'A.4.4.3.4', unitPrice: 215000, detailLevel: 'STANDARD', materialCategory: 'KERAMIK', defaultMaterialId: 'MAT-KER-ROM-60' },
        { id: 'c-edu-roof', name: 'Rangka Kuda-kuda Baja Ringan & Atap Spandek Zincalume', category: '03. ATAP', unit: 'm2', calculationRule: 'num_classrooms * classroom_area * 1.25', variables: ['num_classrooms', 'classroom_area'], ahspCode: 'A.4.2.1.1', unitPrice: 195000, detailLevel: 'STANDARD', materialCategory: 'SPANDEK', defaultMaterialId: 'MAT-ATP-SPANDEK-35' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // J. INDUSTRI
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-IND-WAREHOUSE', {
      id: 'BLD-IND-WAREHOUSE',
      name: 'Gudang Rangka Baja WF & Pabrik',
      category: 'INDUSTRI',
      subcategory: 'Gudang & Logistik',
      description: 'Template estimasi pembangunan gedung gudang logistik / pabrik struktur baja WF bentang lebar (clear span) dan lantai floor hardener.',
      badge: 'Baja WF',
      icon: 'Factory',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'warehouse_area', key: 'warehouse_area', label: 'Luas Lantai Gudang', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 1200, min: 100, max: 50000, group: 'dimensions' },
        { id: 'clear_height', key: 'clear_height', label: 'Tinggi Bebas Kolom (Clear Height)', type: 'NUMBER', unit: 'm', required: true, defaultValue: 7.0, min: 4.0, max: 15.0, group: 'dimensions' }
      ],
      components: [
        { id: 'c-pedestal', name: 'Pondasi Telapak & Kolom Pedestal Beton Bertulang K-300', category: '01. SUBSTRUCTURE', unit: 'm3', calculationRule: 'warehouse_area * 0.04', variables: ['warehouse_area'], ahspCode: 'A.4.1.1.5', unitPrice: 4700000, detailLevel: 'STANDARD' },
        { id: 'c-wf-steel', name: 'Fabrikasi & Ereksi Struktur Rangka Baja Profil WF 200/250/300', category: '02. STRUKTUR BAJA', unit: 'kg', calculationRule: 'warehouse_area * 26.5', variables: ['warehouse_area'], ahspCode: 'STR.WF.1', unitPrice: 36000, detailLevel: 'STANDARD', materialCategory: 'BAJA_WF', defaultMaterialId: 'MAT-BAJ-WF-GG' },
        { id: 'c-slab-hardener', name: 'Lantai Beton Tebal 15 cm Tulangan Wiremesh M8 + Floor Hardener', category: '03. LANTAI GUDANG', unit: 'm2', calculationRule: 'warehouse_area', variables: ['warehouse_area'], ahspCode: 'FIN.HARD.1', unitPrice: 48000, detailLevel: 'STANDARD' },
        { id: 'c-cladding', name: 'Penutup Atap & Dinding Cladding Spandek Zincalume 0.35 mm', category: '04. ATAP & CLADDING', unit: 'm2', calculationRule: 'warehouse_area * 1.35', variables: ['warehouse_area'], ahspCode: 'STR.SPAN.1', unitPrice: 115000, detailLevel: 'STANDARD', materialCategory: 'SPANDEK', defaultMaterialId: 'MAT-ATP-SPANDEK-35' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // K. UTILITAS
    // -----------------------------------------------------------------------
    this.officialTemplates.set('UTIL-PLUMBING-ELEC', {
      id: 'UTIL-PLUMBING-ELEC',
      name: 'Utilitas Kawasan: Penerangan PJU & Jaringan Listrik',
      category: 'UTILITAS',
      subcategory: 'Jaringan Elektrikal & PJU',
      description: 'Pekerjaan jaringan instalasi kabel tanah, tiang PJU kawasan, panel distribusi daya, dan lampu penerangan hemat energi.',
      badge: 'Utilitas',
      icon: 'Zap',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'network_length', key: 'network_length', label: 'Panjang Jaringan Distribusi Utama', type: 'NUMBER', unit: 'm', required: true, defaultValue: 400, min: 20, max: 5000, group: 'dimensions' },
        { id: 'num_pju_poles', key: 'num_pju_poles', label: 'Jumlah Titik Lampu PJU Kawasan', type: 'NUMBER', required: false, defaultValue: 20, min: 2, max: 100, group: 'mep' }
      ],
      components: [
        { id: 'c-water-pipe', name: 'Pipa Distribusi Air Bersih PVC AW 2 Inchi Komplit Fitting & Valve', category: '01. JARINGAN AIR BERSIH', unit: 'm1', calculationRule: 'network_length', variables: ['network_length'], ahspCode: 'A.5.1.2.1', unitPrice: 42000, detailLevel: 'STANDARD', materialCategory: 'PIPA', defaultMaterialId: 'MAT-PIP-RUCIKA-AW-05' },
        { id: 'c-drain-pipe', name: 'Pipa Air Kotor & Buangan PVC D 4 Inchi', category: '02. JARINGAN AIR KOTOR', unit: 'm1', calculationRule: 'network_length * 0.7', variables: ['network_length'], ahspCode: 'A.5.1.2.2', unitPrice: 78000, detailLevel: 'STANDARD', materialCategory: 'PIPA', defaultMaterialId: 'MAT-PIP-RUCIKA-D-4' },
        { id: 'c-pju-pole', name: 'Pemasangan Tiang PJU Octagonal 7m & Lampu LED 60 Watt', category: '03. ELEKTRIKAL KAWASAN', unit: 'titik', calculationRule: 'num_pju_poles', variables: ['num_pju_poles'], ahspCode: 'A.6.1.2.1', unitPrice: 185000, detailLevel: 'STANDARD' }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // A2. RUMAH TINGGAL (Tambahan: Villa, Townhouse, Kost, Renovasi)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('HOUSE-VILLA-MODERN', {
      id: 'HOUSE-VILLA-MODERN',
      name: 'Villa Tropis Modern (Private Pool)',
      category: 'RUMAH_TINGGAL',
      subcategory: 'Villa & Resort',
      description: 'Pembangunan villa tropis modern 2 lantai dengan private swimming pool, decking kayu bengkirai, dan ruang terbuka asri.',
      badge: 'Villa Mewah',
      icon: 'Home',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Luas Bangunan Villa', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 180, min: 80, max: 1000, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 2, min: 1, max: 3, group: 'dimensions' },
        { id: 'num_bedrooms', key: 'num_bedrooms', label: 'Jumlah Kamar Tidur', type: 'NUMBER', required: false, defaultValue: 3, min: 1, max: 8, group: 'general' },
        { id: 'pool_area', key: 'pool_area', label: 'Luas Kolam Renang', type: 'NUMBER', unit: 'm²', required: false, defaultValue: 24, min: 10, max: 100, group: 'dimensions' }
      ],
      components: [
        { id: 'c-v-prep', name: 'Pembersihan Lapangan & Bowplank Presisi', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'building_area * 1.3', variables: ['building_area'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-v-struct', name: 'Struktur Beton Bertulang K-250 Kolom, Balok & Plat Bondek', category: '02. STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.26', variables: ['building_area'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-v-wall', name: 'Dinding Bata Ringan Plester Aci & Cat Weatherproof', category: '03. ARSITEKTUR', unit: 'm2', calculationRule: 'building_area * 2.2', variables: ['building_area'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-v-floor', name: 'Lantai Granit Homogeneous 60x60 cm & Decking Kayu', category: '03. ARSITEKTUR', unit: 'm2', calculationRule: 'building_area * 0.85', variables: ['building_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        { id: 'c-v-roof', name: 'Atap Baja Ringan & Genteng Metal Sand Coated', category: '04. ATAP', unit: 'm2', calculationRule: 'building_area * 0.65', variables: ['building_area'], ahspCode: 'A.4.2.1.1', unitPrice: 195000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-v-plafon', name: 'Plafon Gypsum Board Drop Ceiling & Rangka Hollow', category: '03. ARSITEKTUR', unit: 'm2', calculationRule: 'building_area * 0.9', variables: ['building_area'], ahspCode: 'A.4.5.3.2', unitPrice: 85000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-v-mep', name: 'Instalasi Listrik, Penerangan Warm White LED & Stop Kontak', category: '05. MEP', unit: 'titik', calculationRule: 'building_area * 0.25', variables: ['building_area'], ahspCode: 'A.6.1.2.1', unitPrice: 185000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-v-sanitary', name: 'Sanitair Kloset Monoblok & Shower Tiang Stainless Steel', category: '05. MEP', unit: 'unit', calculationRule: 'num_bedrooms + 1', variables: ['num_bedrooms'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'PROFESSIONAL', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        // Comprehensive additions
        { id: 'c-v-pool', name: 'Konstruksi Kolam Renang Beton K-300 Waterproofing + Mosaik', category: '06. FASILITAS VILLA', unit: 'm2', calculationRule: 'pool_area', variables: ['pool_area'], ahspCode: 'A.4.1.1.5', unitPrice: 3200000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-v-waterheater', name: 'Water Heater Central Tenaga Surya 200 Liter', category: '05. MEP', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.5.1.1.3', unitPrice: 14500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('HOUSE-TOWNHOUSE', {
      id: 'HOUSE-TOWNHOUSE',
      name: 'Townhouse Minimalis 2 Lantai',
      category: 'RUMAH_TINGGAL',
      subcategory: 'Townhouse & Cluster',
      description: 'Pembangunan townhouse 2 lantai desain efisien kompak dengan carport 2 mobil dan fasad modern minimalis.',
      badge: 'Townhouse',
      icon: 'Home',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Luas Bangunan Total', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 110, min: 50, max: 300, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 2, min: 2, max: 3, group: 'dimensions' },
        { id: 'num_bedrooms', key: 'num_bedrooms', label: 'Kamar Tidur', type: 'NUMBER', required: false, defaultValue: 3, min: 2, max: 5, group: 'general' }
      ],
      components: this.buildStandardHouseComponents(110, 2, 2),
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('HOUSE-KOST-RESIDENCE', {
      id: 'HOUSE-KOST-RESIDENCE',
      name: 'Rumah Kost Eksklusif 2 Lantai (12 Kamar)',
      category: 'RUMAH_TINGGAL',
      subcategory: 'Kost & Hunian Sewa',
      description: 'Estimasi pembangunan rumah kost 2 lantai 12 kamar lengkap kamar mandi dalam, koridor, dan ruang pengelola.',
      badge: 'Investasi Kost',
      icon: 'Home',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'num_rooms', key: 'num_rooms', label: 'Jumlah Kamar Kost', type: 'NUMBER', required: true, defaultValue: 12, min: 4, max: 40, group: 'general' },
        { id: 'room_area_m2', key: 'room_area_m2', label: 'Luas per Kamar', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 16, min: 10, max: 30, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 2, min: 1, max: 4, group: 'dimensions' }
      ],
      components: [
        { id: 'c-k-prep', name: 'Pembersihan & Pengukuran Lahan', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'num_rooms * room_area_m2 * 1.35 / num_floors', variables: ['num_rooms', 'room_area_m2', 'num_floors'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-k-struct', name: 'Struktur Beton Bertulang K-250 & Bondek t=12cm', category: '02. STRUKTUR', unit: 'm3', calculationRule: 'num_rooms * room_area_m2 * 1.35 * 0.22', variables: ['num_rooms', 'room_area_m2'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-k-wall', name: 'Dinding Bata Ringan Kedap Suara antar Kamar', category: '03. DINDING', unit: 'm2', calculationRule: 'num_rooms * 45', variables: ['num_rooms'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-k-floor', name: 'Lantai Granit Tile 60x60 cm Kamar & Koridor', category: '04. LANTAI', unit: 'm2', calculationRule: 'num_rooms * room_area_m2 * 1.2', variables: ['num_rooms', 'room_area_m2'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        { id: 'c-k-km', name: 'Kamar Mandi Komplit Kloset Duduk & Shower Tiap Kamar', category: '05. SANITAIR', unit: 'unit', calculationRule: 'num_rooms', variables: ['num_rooms'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'STANDARD', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        // Professional additions
        { id: 'c-k-doors', name: 'Pintu Kamar Kost Panel HPL & Handle Kunci Silinder', category: '03. DINDING', unit: 'unit', calculationRule: 'num_rooms', variables: ['num_rooms'], ahspCode: 'A.4.6.1.2', unitPrice: 1250000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-k-paint', name: 'Pengecatan Dinding & Plafon Interior', category: '06. FINISHING', unit: 'm2', calculationRule: 'num_rooms * 60', variables: ['num_rooms'], ahspCode: 'A.4.7.1.2', unitPrice: 42000, detailLevel: 'PROFESSIONAL', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
        { id: 'c-k-token', name: 'Instalasi Listrik Titik Token per Kamar', category: '07. LISTRIK', unit: 'titik', calculationRule: 'num_rooms * 4', variables: ['num_rooms'], ahspCode: 'A.6.1.3.1', unitPrice: 195000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-k-ac', name: 'Instalasi Pipa AC Split per Kamar', category: '07. LISTRIK', unit: 'titik', calculationRule: 'num_rooms', variables: ['num_rooms'], ahspCode: 'A.6.1.3.1', unitPrice: 850000, detailLevel: 'COMPREHENSIVE', isOptional: true },
        { id: 'c-k-cctv', name: 'Instalasi Kamera Keamanan CCTV Koridor & Parkir', category: '07. LISTRIK', unit: 'titik', calculationRule: '6', variables: [], ahspCode: 'A.6.1.2.1', unitPrice: 1250000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // B2. JALAN & TRANSPORTASI (Tambahan: Jalan Lingkungan, Pedestrian, Maintenance)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('INFRA-ROAD-RESIDENTIAL', {
      id: 'INFRA-ROAD-RESIDENTIAL',
      name: 'Jalan Lingkungan Pemukiman / Desa t=15 cm',
      category: 'JALAN_TRANSPORTASI',
      subcategory: 'Jalan Lingkungan & Desa',
      description: 'Perkerasan jalan beton mutu K-250 tebal 15 cm lebar 4.0 m untuk jalan lingkungan perumahan atau jalan desa.',
      badge: 'Jalan Desa',
      icon: 'Milestone',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'road_length', key: 'road_length', label: 'Panjang Jalan', type: 'NUMBER', unit: 'm', required: true, defaultValue: 500, min: 10, max: 20000, group: 'dimensions' },
        { id: 'road_width', key: 'road_width', label: 'Lebar Jalan', type: 'NUMBER', unit: 'm', required: true, defaultValue: 4.0, min: 2.5, max: 6.0, group: 'dimensions' },
        { id: 'concrete_thickness_m', key: 'concrete_thickness_m', label: 'Tebal Plat Beton', type: 'NUMBER', unit: 'm', required: false, defaultValue: 0.15, min: 0.12, max: 0.20, group: 'specifications' }
      ],
      components: [
        { id: 'c-r-prep', name: 'Pembersihan & Perataan Permukaan Tanah Dasar', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'road_length * road_width', variables: ['road_length', 'road_width'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-r-subbase', name: 'Lapis Pondasi Bawah Agregat Kelas B t=10 cm', category: '02. PONDASI', unit: 'm3', calculationRule: 'road_length * road_width * 0.10', variables: ['road_length', 'road_width'], ahspCode: 'BM.5.1.2', unitPrice: 380000, detailLevel: 'STANDARD' },
        { id: 'c-r-concrete', name: 'Perkerasan Beton Bertulang Wiremesh M6 K-250 t=15 cm', category: '03. BETON', unit: 'm3', calculationRule: 'road_length * road_width * concrete_thickness_m', variables: ['road_length', 'road_width', 'concrete_thickness_m'], ahspCode: 'BM.7.1.1', unitPrice: 1450000, detailLevel: 'STANDARD', materialCategory: 'BETON', defaultMaterialId: 'MAT-BETON-K250' },
        // Professional additions
        { id: 'c-r-bahu', name: 'Bahu Jalan Kiri & Kanan Tanah Urug Dipadatkan', category: '04. BAHU JALAN', unit: 'm3', calculationRule: 'road_length * 1.0 * 0.15', variables: ['road_length'], ahspCode: 'A.2.3.1.9', unitPrice: 32000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-r-drain', name: 'Saluran Tanah Drainase Samping Saluran Terbuka', category: '05. DRAINASE', unit: 'm1', calculationRule: 'road_length * 2', variables: ['road_length'], ahspCode: 'A.2.3.1.1', unitPrice: 45000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-r-pracetak', name: 'Pemasangan Saluran Pracetak U-Ditch 30x30 cm Tepi Jalan', category: '05. DRAINASE', unit: 'm1', calculationRule: 'road_length', variables: ['road_length'], ahspCode: 'SDA.2.1.1', unitPrice: 480000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('INFRA-ROAD-PEDESTRIAN', {
      id: 'INFRA-ROAD-PEDESTRIAN',
      name: 'Jalur Pedestrian & Trotoar Ramah Difabel',
      category: 'JALAN_TRANSPORTASI',
      subcategory: 'Pedestrian & Trotoar',
      description: 'Pembangunan trotoar pejalan kaki komplit ubin pemandu (guiding block) difabel, kanstin pengunci, dan bollard pengaman.',
      badge: 'Pedestrian',
      icon: 'Milestone',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'walkway_length', key: 'walkway_length', label: 'Panjang Jalur Pedestrian', type: 'NUMBER', unit: 'm', required: true, defaultValue: 800, min: 10, max: 20000, group: 'dimensions' },
        { id: 'walkway_width', key: 'walkway_width', label: 'Lebar Trotoar', type: 'NUMBER', unit: 'm', required: true, defaultValue: 2.0, min: 1.2, max: 6.0, group: 'dimensions' }
      ],
      components: [
        { id: 'c-p-prep', name: 'Galian Tanah & Perataan Badan Trotoar', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'walkway_length * walkway_width', variables: ['walkway_length', 'walkway_width'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-p-sand', name: 'Urugan Pasir Alas Tebal 5 cm', category: '02. PASIR ALAS', unit: 'm3', calculationRule: 'walkway_length * walkway_width * 0.05', variables: ['walkway_length', 'walkway_width'], ahspCode: 'A.2.3.1.11', unitPrice: 185000, detailLevel: 'STANDARD' },
        { id: 'c-p-paving', name: 'Pemasangan Paving Trotoar K-300 Motif Bata', category: '03. FINISHING TROTOAR', unit: 'm2', calculationRule: 'walkway_length * (walkway_width - 0.3)', variables: ['walkway_length', 'walkway_width'], ahspCode: 'A.4.4.3.7', unitPrice: 175000, detailLevel: 'STANDARD', materialCategory: 'PAVING', defaultMaterialId: 'MAT-PAV-BATA-6' },
        { id: 'c-p-kanstin', name: 'Pemasangan Kanstin Beton Tepi Trotoar 15x30x40 cm', category: '04. KANSTIN', unit: 'm1', calculationRule: 'walkway_length', variables: ['walkway_length'], ahspCode: 'A.4.4.3.8', unitPrice: 95000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-p-guiding', name: 'Ubin Pemandu Difabel / Tactile Guiding Block Kuning', category: '03. FINISHING TROTOAR', unit: 'm2', calculationRule: 'walkway_length * 0.3', variables: ['walkway_length'], ahspCode: 'A.4.4.3.9', unitPrice: 245000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-p-bollard', name: 'Bollard Pembatas Pejalan Kaki Pipa Stainless Steel per 10m', category: '05. PERLENGKAPAN', unit: 'titik', calculationRule: 'Math.ceil(walkway_length / 10)', variables: ['walkway_length'], ahspCode: 'BM.6.1.6', unitPrice: 450000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('INFRA-ROAD-MAINTENANCE', {
      id: 'INFRA-ROAD-MAINTENANCE',
      name: 'Rehabilitasi & Pemeliharaan Berkala Jalan Aspal',
      category: 'JALAN_TRANSPORTASI',
      subcategory: 'Rehabilitasi & Pemeliharaan',
      description: 'Pekerjaan overlay aspal AC-WC t=4cm, patching penambalan lubang AC-BC, dan cold milling aspal rusak.',
      badge: 'Maintenance',
      icon: 'Milestone',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'overlay_length', key: 'overlay_length', label: 'Panjang Jalan yang Direhabilitasi', type: 'NUMBER', unit: 'm', required: true, defaultValue: 1000, min: 50, max: 50000, group: 'dimensions' },
        { id: 'overlay_width', key: 'overlay_width', label: 'Lebar Perkerasan', type: 'NUMBER', unit: 'm', required: true, defaultValue: 6.0, min: 3.0, max: 20, group: 'dimensions' },
        { id: 'patching_area_m2', key: 'patching_area_m2', label: 'Luas Penambalan Lubang (Patching)', type: 'NUMBER', unit: 'm²', required: false, defaultValue: 250, min: 10, max: 5000, group: 'specifications' }
      ],
      components: [
        { id: 'c-m-milling', name: 'Pembersihan & Cold Milling Pengupasan Aspal Lama', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'patching_area_m2', variables: ['patching_area_m2'], ahspCode: 'A.2.1.1.1', unitPrice: 35000, detailLevel: 'STANDARD' },
        { id: 'c-m-patching', name: 'Penambalan Lubang Aspal AC-BC t=6 cm Padat', category: '02. PATCHING', unit: 'ton', calculationRule: 'patching_area_m2 * 0.06 * 2.3', variables: ['patching_area_m2'], ahspCode: 'BM.6.1.2', unitPrice: 1280000, detailLevel: 'STANDARD' },
        { id: 'c-m-tack', name: 'Lapis Perekat (Tack Coat) Aspal Emulsi 0.3 L/m²', category: '03. OVERLAY', unit: 'm2', calculationRule: 'overlay_length * overlay_width', variables: ['overlay_length', 'overlay_width'], ahspCode: 'BM.6.1.4', unitPrice: 14500, detailLevel: 'STANDARD' },
        { id: 'c-m-acwc', name: 'Lapis Aus Aspal Beton AC-WC t=4 cm Padat', category: '03. OVERLAY', unit: 'ton', calculationRule: 'overlay_length * overlay_width * 0.04 * 2.3', variables: ['overlay_length', 'overlay_width'], ahspCode: 'BM.6.1.1', unitPrice: 1350000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-m-marka', name: 'Marka Garis Tepi & Tengah Jalan Termoplastik 12 cm', category: '04. MARKA', unit: 'm1', calculationRule: 'overlay_length * 2', variables: ['overlay_length'], ahspCode: 'BM.6.1.4', unitPrice: 35000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-m-patok', name: 'Penggantian Patok Pengarah / Delineator Reflektif', category: '05. PERLENGKAPAN', unit: 'buah', calculationRule: 'Math.ceil(overlay_length / 25)', variables: ['overlay_length'], ahspCode: 'BM.6.1.6', unitPrice: 165000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // C2. PERKERASAN (PAVING) (Tambahan: Paving Pedestrian Interlock)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('PAV-PEDESTRIAN-INTERLOCK', {
      id: 'PAV-PEDESTRIAN-INTERLOCK',
      name: 'Paving Interlocking & Trotoar Kawasan t=6 cm',
      category: 'PERKERASAN',
      subcategory: 'Pedestrian & Plaza',
      description: 'Pemasangan paving block model trihex / interlocking warna-warni untuk trotoar dan plaza pejalan kaki.',
      badge: 'Interlock',
      icon: 'Grid',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'paving_area', key: 'paving_area', label: 'Luas Area Plaza / Paving', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 800, min: 50, max: 20000, group: 'dimensions' },
        { id: 'curb_length', key: 'curb_length', label: 'Panjang Kanstin Pembatas', type: 'NUMBER', unit: 'm', required: false, defaultValue: 250, min: 0, group: 'dimensions' }
      ],
      components: [
        { id: 'c-pi-prep', name: 'Perataan & Pemadatan Tanah Dasar Subgrade', category: '01. TANAH', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-pi-sand', name: 'Urugan Pasir Alas Tebal 5 cm', category: '02. PASIR ALAS', unit: 'm3', calculationRule: 'paving_area * 0.05', variables: ['paving_area'], ahspCode: 'A.2.3.1.11', unitPrice: 185000, detailLevel: 'STANDARD' },
        { id: 'c-pi-paver', name: 'Pemasangan Paving Interlocking K-300 Pola Dekoratif', category: '03. PERKERASAN', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.4.4.3.7', unitPrice: 185000, detailLevel: 'STANDARD', materialCategory: 'PAVING', defaultMaterialId: 'MAT-PAV-BATA-6' },
        { id: 'c-pi-kanstin', name: 'Kanstin Beton Pengunci Tepi 15x30x40 cm', category: '04. KANSTIN', unit: 'm1', calculationRule: 'curb_length', variables: ['curb_length'], ahspCode: 'A.4.4.3.8', unitPrice: 95000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-pi-subbase', name: 'Lapis Pondasi Agregat Kelas B t=10 cm', category: '02. PASIR ALAS', unit: 'm3', calculationRule: 'paving_area * 0.10', variables: ['paving_area'], ahspCode: 'BM.5.1.2', unitPrice: 380000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-pi-coating', name: 'Coating Water Repellent Pelindung Warna Paving', category: '03. PERKERASAN', unit: 'm2', calculationRule: 'paving_area', variables: ['paving_area'], ahspCode: 'A.4.4.3.3', unitPrice: 35000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // D2. SDA & IRIGASI (Tambahan: Box Culvert, Retention Pond)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('SDA-BOX-CULVERT', {
      id: 'SDA-BOX-CULVERT',
      name: 'Gorong-gorong Box Culvert Beton Precast',
      category: 'SDA_IRIGASI',
      subcategory: 'Drainase Perkotaan',
      description: 'Pemasangan saluran drainase silang (cross-drain) box culvert beton precast 200x200 cm K-350 komplit sayap wingwall.',
      badge: 'Box Culvert',
      icon: 'Droplets',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'culvert_length', key: 'culvert_length', label: 'Panjang Gorong-gorong Box', type: 'NUMBER', unit: 'm', required: true, defaultValue: 24, min: 4, max: 200, group: 'dimensions' },
        { id: 'culvert_span_m', key: 'culvert_span_m', label: 'Bentang Dalam (Span)', type: 'NUMBER', unit: 'm', required: false, defaultValue: 2.0, min: 1.0, max: 4.0, group: 'dimensions' }
      ],
      components: [
        { id: 'c-bc-galian', name: 'Galian Tanah Struktur Gorong-gorong Kedalaman s/d 3m', category: '01. GALIAN TANAH', unit: 'm3', calculationRule: 'culvert_length * 3.5 * 2.5', variables: ['culvert_length'], ahspCode: 'A.2.3.1.1', unitPrice: 88500, detailLevel: 'STANDARD' },
        { id: 'c-bc-lc', name: 'Lantai Kerja Lean Concrete t=10 cm', category: '02. LANTAI KERJA', unit: 'm3', calculationRule: 'culvert_length * 3.0 * 0.10', variables: ['culvert_length'], ahspCode: 'A.4.1.1.1', unitPrice: 890000, detailLevel: 'STANDARD' },
        { id: 'c-bc-box', name: 'Pemasangan Box Culvert Precast 200x200 cm K-350 Komplit Joint', category: '03. PEMASANGAN BOX', unit: 'm1', calculationRule: 'culvert_length', variables: ['culvert_length'], ahspCode: 'SDA.2.1.4', unitPrice: 2850000, detailLevel: 'STANDARD' },
        { id: 'c-bc-urugan', name: 'Urugan Pasir / Agregat Pilihan & Pemadatan Lapislapis', category: '04. URUGAN KEMBALI', unit: 'm3', calculationRule: 'culvert_length * 2.5 * 1.5', variables: ['culvert_length'], ahspCode: 'A.2.3.1.9', unitPrice: 85000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-bc-wingwall', name: 'Dinding Sayap (Wingwall) & Headwall Pasangan Batu Kali', category: '05. SAYAP WINGWALL', unit: 'm3', calculationRule: '18.0', variables: [], ahspCode: 'SDA.2.1.2', unitPrice: 890000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-bc-guard', name: 'Pagar Pengaman Pipa Besi Galvanis Headwall', category: '05. SAYAP WINGWALL', unit: 'm1', calculationRule: '16.0', variables: [], ahspCode: 'A.8.1.2.1', unitPrice: 450000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('SDA-RETENTION-POND', {
      id: 'SDA-RETENTION-POND',
      name: 'Kolam Retensi Pengendali Banjir & Tanggul',
      category: 'SDA_IRIGASI',
      subcategory: 'Pengendali Banjir & Bangunan Air',
      description: 'Pengerukan kolam retensi penampung air hujan kapasitas 5000 m³ komplit tanggul tanah dipadatkan dan pintu air.',
      badge: 'Kolam Retensi',
      icon: 'Droplets',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'pond_volume_m3', key: 'pond_volume_m3', label: 'Volume Tampungan Kolam', type: 'NUMBER', unit: 'm³', required: true, defaultValue: 5000, min: 500, max: 100000, group: 'dimensions' },
        { id: 'dyke_length', key: 'dyke_length', label: 'Panjang Tanggul Keliling', type: 'NUMBER', unit: 'm', required: false, defaultValue: 300, min: 50, group: 'dimensions' }
      ],
      components: [
        { id: 'c-rp-excav', name: 'Galian Tanah Kolam Retensi Menggunakan Excavator', category: '01. GALIAN TANAH', unit: 'm3', calculationRule: 'pond_volume_m3', variables: ['pond_volume_m3'], ahspCode: 'A.2.3.1.1', unitPrice: 48500, detailLevel: 'STANDARD' },
        { id: 'c-rp-dyke', name: 'Tanggul Tanah Dipadatkan Menggunakan Vibro Roller', category: '02. TANGGUL', unit: 'm3', calculationRule: 'dyke_length * 4.0 * 2.0', variables: ['dyke_length'], ahspCode: 'A.2.3.1.9', unitPrice: 38000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-rp-stone', name: 'Pasangan Batu Kali Penguat Lereng Tanggul Mortar 1:4', category: '03. PERKUATAN TEBING', unit: 'm3', calculationRule: 'dyke_length * 2.5 * 0.3', variables: ['dyke_length'], ahspCode: 'SDA.2.1.2', unitPrice: 890000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-rp-fence', name: 'Pagar Keliling Pengaman Kolam BRC Galvanis', category: '04. PENGAMAN', unit: 'm1', calculationRule: 'dyke_length', variables: ['dyke_length'], ahspCode: 'A.8.1.2.1', unitPrice: 350000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // E2. GEDUNG (Tambahan: Serbaguna & Renovasi Kantor)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-HALL-SERBAGUNA', {
      id: 'BLD-HALL-SERBAGUNA',
      name: 'Gedung Pertemuan & Serbaguna Bentang Lebar',
      category: 'GEDUNG',
      subcategory: 'Fasilitas Umum & Serbaguna',
      description: 'Pembangunan gedung serbaguna berkapasitas 500-1000 orang dengan struktur baja bentang bebas (clear span 24m) dan fasilitas lengkap.',
      badge: 'Serbaguna',
      icon: 'Building2',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Luas Lantai Total', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 800, min: 200, max: 10000, group: 'dimensions' },
        { id: 'span_width', key: 'span_width', label: 'Bentang Bebas Rangka Baja (Span)', type: 'NUMBER', unit: 'm', required: false, defaultValue: 24, min: 12, max: 50, group: 'dimensions' }
      ],
      components: [
        { id: 'c-h-prep', name: 'Pembersihan Lapangan & Bowplank Gedung', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'building_area * 1.2', variables: ['building_area'], ahspCode: 'A.2.2.1.1', unitPrice: 18500, detailLevel: 'STANDARD' },
        { id: 'c-h-pondasi', name: 'Pondasi Footplate & Pedestal Beton K-300', category: '02. PONDASI', unit: 'm3', calculationRule: 'building_area * 0.08', variables: ['building_area'], ahspCode: 'A.4.1.1.5', unitPrice: 4700000, detailLevel: 'STANDARD' },
        { id: 'c-h-steel', name: 'Struktur Rangka Baja WF Kuda-Kuda Bentang 24 m', category: '03. STRUKTUR BAJA', unit: 'kg', calculationRule: 'building_area * 28.0', variables: ['building_area'], ahspCode: 'STR.WF.1', unitPrice: 36000, detailLevel: 'STANDARD', materialCategory: 'BAJA_WF', defaultMaterialId: 'MAT-BAJ-WF-GG' },
        { id: 'c-h-roof', name: 'Atap Spandek Zincalume 0.35 mm & Peredam Panas Foil', category: '04. ATAP', unit: 'm2', calculationRule: 'building_area * 1.25', variables: ['building_area'], ahspCode: 'STR.SPAN.1', unitPrice: 115000, detailLevel: 'STANDARD', materialCategory: 'SPANDEK', defaultMaterialId: 'MAT-ATP-SPANDEK-35' },
        { id: 'c-h-floor', name: 'Lantai Granit Tile 60x60 cm High Traffic', category: '05. FINISHING', unit: 'm2', calculationRule: 'building_area * 0.9', variables: ['building_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        // Professional additions
        { id: 'c-h-acoustic', name: 'Plafon Akustik & Dinding Peredam Suara Hall', category: '05. FINISHING', unit: 'm2', calculationRule: 'building_area * 0.85', variables: ['building_area'], ahspCode: 'A.4.5.3.2', unitPrice: 125000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-h-toilet', name: 'Sanitair Toilet Pria & Wanita (Kloset, Urinoir, Wastafel)', category: '06. SANITAIR', unit: 'unit', calculationRule: '8', variables: [], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'PROFESSIONAL', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        // Comprehensive additions
        { id: 'c-h-ac', name: 'Instalasi AC Cassette Standing Floor 5 PK', category: '07. MEP', unit: 'titik', calculationRule: '6', variables: [], ahspCode: 'A.6.1.3.1', unitPrice: 16500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('BLD-RENOV-OFFICE', {
      id: 'BLD-RENOV-OFFICE',
      name: 'Renovasi Fit-Out Interior Ruang Kantor',
      category: 'GEDUNG',
      subcategory: 'Renovasi Gedung',
      description: 'Renovasi dan interior fit-out ruang kantor: partisi kaca aluminium, karpet tile, drop ceiling, tata udara HVAC, dan data LAN.',
      badge: 'Fit-Out',
      icon: 'Building2',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'floor_area', key: 'floor_area', label: 'Luas Lantai yang Direnovasi', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 400, min: 50, max: 5000, group: 'dimensions' },
        { id: 'num_workstations', key: 'num_workstations', label: 'Jumlah Titik Workstation', type: 'NUMBER', required: false, defaultValue: 30, min: 5, max: 200, group: 'general' }
      ],
      components: [
        { id: 'c-ro-demo', name: 'Pembongkaran Partisi & Karpet Lama serta Pembersihan Puing', category: '01. PEMBONGKARAN', unit: 'm2', calculationRule: 'floor_area', variables: ['floor_area'], ahspCode: 'A.2.1.1.1', unitPrice: 35000, detailLevel: 'STANDARD' },
        { id: 'c-ro-glass', name: 'Partisi Kaca Frameless Tempered 12 mm & Kusen Aluminium', category: '02. PARTISI RUANGAN', unit: 'm2', calculationRule: 'floor_area * 0.4', variables: ['floor_area'], ahspCode: 'A.4.6.1.1', unitPrice: 450000, detailLevel: 'STANDARD' },
        { id: 'c-ro-floor', name: 'Pemasangan Karpet Tile Heavy Traffic 50x50 cm Komplit Lem', category: '03. FINISHING LANTAI', unit: 'm2', calculationRule: 'floor_area * 0.9', variables: ['floor_area'], ahspCode: 'A.4.4.3.1', unitPrice: 285000, detailLevel: 'STANDARD' },
        { id: 'c-ro-ceiling', name: 'Plafon Gypsum Drop Ceiling & LED Strip Lighting', category: '04. PLAFON', unit: 'm2', calculationRule: 'floor_area * 0.9', variables: ['floor_area'], ahspCode: 'A.4.5.3.2', unitPrice: 95000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-ro-paint', name: 'Pengecatan Dinding Interior 2 Lapis Warna Desain', category: '05. FINISHING CAT', unit: 'm2', calculationRule: 'floor_area * 1.5', variables: ['floor_area'], ahspCode: 'A.4.7.1.2', unitPrice: 42000, detailLevel: 'PROFESSIONAL', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
        { id: 'c-ro-lan', name: 'Instalasi Titik Data LAN Cat6 & Stop Kontak Workstation', category: '06. MEP & DATA', unit: 'titik', calculationRule: 'num_workstations * 2', variables: ['num_workstations'], ahspCode: 'A.6.1.3.1', unitPrice: 285000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-ro-card', name: 'Access Control Door RFID & Face Recognition Pintu Masuk', category: '06. MEP & DATA', unit: 'titik', calculationRule: '2', variables: [], ahspCode: 'A.6.1.2.1', unitPrice: 6500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // F2. BANGUNAN TINGGI (Tambahan: Apartemen Mid-Rise)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-APARTMENT-MIDRISE', {
      id: 'BLD-APARTMENT-MIDRISE',
      name: 'Apartemen Mid-Rise 6 Lantai',
      category: 'BANGUNAN_TINGGI',
      subcategory: 'Apartemen Mid-Rise',
      description: 'Estimasi struktur dan arsitektur gedung hunian apartemen 6 lantai dengan 60 unit tipikal studio/2BR dan 2 unit lift.',
      badge: 'Apartemen',
      icon: 'Building',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'total_floors', key: 'total_floors', label: 'Jumlah Lantai Hunian', type: 'NUMBER', required: true, defaultValue: 6, min: 4, max: 12, group: 'dimensions' },
        { id: 'units_per_floor', key: 'units_per_floor', label: 'Jumlah Unit per Lantai', type: 'NUMBER', required: true, defaultValue: 10, min: 4, max: 30, group: 'general' },
        { id: 'unit_area_m2', key: 'unit_area_m2', label: 'Luas Rata-Rata per Unit', type: 'NUMBER', unit: 'm²', required: false, defaultValue: 36, min: 21, max: 80, group: 'dimensions' }
      ],
      components: [
        { id: 'c-ap-sub', name: 'Pondasi Bored Pile & Pile Cap Beton K-350', category: '01. STRUKTUR BAWAH', unit: 'm3', calculationRule: 'total_floors * units_per_floor * unit_area_m2 * 0.12', variables: ['total_floors', 'units_per_floor', 'unit_area_m2'], ahspCode: 'A.4.1.1.5', unitPrice: 4700000, detailLevel: 'STANDARD' },
        { id: 'c-ap-super', name: 'Kolom Balok & Pelat Lantai Beton Bondek K-300', category: '02. STRUKTUR UTAMA', unit: 'm3', calculationRule: 'total_floors * units_per_floor * unit_area_m2 * 0.28', variables: ['total_floors', 'units_per_floor', 'unit_area_m2'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-ap-wall', name: 'Dinding Bata Ringan Kedap Suara & Fasad Luar', category: '03. ARSITEKTUR', unit: 'm2', calculationRule: 'total_floors * units_per_floor * 50', variables: ['total_floors', 'units_per_floor'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-ap-floor', name: 'Lantai Granit Tile Homogeneous 60x60 cm Unit & Koridor', category: '04. FINISHING', unit: 'm2', calculationRule: 'total_floors * units_per_floor * unit_area_m2 * 1.15', variables: ['total_floors', 'units_per_floor', 'unit_area_m2'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        // Professional additions
        { id: 'c-ap-sanitary', name: 'Paket Sanitair Kloset & Shower Kamar Mandi tiap Unit', category: '05. SANITAIR & MEP', unit: 'unit', calculationRule: 'total_floors * units_per_floor', variables: ['total_floors', 'units_per_floor'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'PROFESSIONAL', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        // Comprehensive additions
        { id: 'c-ap-lift', name: 'Pengadaan & Pemasangan Lift Penumpang Passenger Elevator 8 Pax', category: '06. MEKANIKAL KHUSUS', unit: 'unit', calculationRule: '2', variables: [], ahspCode: 'A.6.1.2.1', unitPrice: 420000000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // G2. HOTEL & HOSPITALITY (Tambahan: Boutique Villa, Guest House)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-BOUTIQUE-VILLA', {
      id: 'BLD-BOUTIQUE-VILLA',
      name: 'Boutique Villa Resort Kompak (8 Unit)',
      category: 'HOTEL_HOSPITALITY',
      subcategory: 'Resort & Villa',
      description: 'Pengembangan kawasan boutique resort 8 unit villa privat komplit clubhouse, kolam renang sentral, dan restaurant.',
      badge: 'Boutique Villa',
      icon: 'Hotel',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'num_villas', key: 'num_villas', label: 'Jumlah Unit Villa', type: 'NUMBER', required: true, defaultValue: 8, min: 2, max: 30, group: 'general' },
        { id: 'villa_area_m2', key: 'villa_area_m2', label: 'Luas Bangunan per Unit', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 65, min: 40, max: 150, group: 'dimensions' }
      ],
      components: [
        { id: 'c-bv-prep', name: 'Pembersihan Kawasan Lahan & Bowplank', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'num_villas * villa_area_m2 * 2.0', variables: ['num_villas', 'villa_area_m2'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-bv-struct', name: 'Struktur Beton Bertulang K-250 Villa', category: '02. STRUKTUR', unit: 'm3', calculationRule: 'num_villas * villa_area_m2 * 0.22', variables: ['num_villas', 'villa_area_m2'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-bv-wall', name: 'Dinding Bata Ringan Fasad Batu Alam & Plester Aci', category: '03. ARSITEKTUR', unit: 'm2', calculationRule: 'num_villas * 90', variables: ['num_villas'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-bv-floor', name: 'Lantai Granit Tile Homogeneous 60x60 cm & Teras', category: '04. FINISHING', unit: 'm2', calculationRule: 'num_villas * villa_area_m2', variables: ['num_villas', 'villa_area_m2'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        // Professional additions
        { id: 'c-bv-sanitary', name: 'Sanitair Kamar Mandi Semi-Terbuka Villa Tropis', category: '05. SANITAIR', unit: 'unit', calculationRule: 'num_villas', variables: ['num_villas'], ahspCode: 'A.5.1.1.1', unitPrice: 3850000, detailLevel: 'PROFESSIONAL', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        // Comprehensive additions
        { id: 'c-bv-pool', name: 'Kolam Renang Sentral Resort Luas 60 m²', category: '06. FASILITAS RESORT', unit: 'm2', calculationRule: '60.0', variables: [], ahspCode: 'A.4.1.1.5', unitPrice: 3200000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // H2. KESEHATAN (Tambahan: Klinik Pratama 2 Lantai)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-HEALTH-CLINIC', {
      id: 'BLD-HEALTH-CLINIC',
      name: 'Klinik Pratama & Rawat Jalan 2 Lantai',
      category: 'KESEHATAN',
      subcategory: 'Klinik Pratama & Puskesmas',
      description: 'Pembangunan gedung klinik pratama 2 lantai dengan ruang poli umum, gigi, tindakan, farmasi, dan laboratorium mini.',
      badge: 'Klinik',
      icon: 'HeartPulse',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Luas Bangunan Total', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 450, min: 100, max: 2000, group: 'dimensions' },
        { id: 'num_exam_rooms', key: 'num_exam_rooms', label: 'Jumlah Ruang Pemeriksaan (Poli)', type: 'NUMBER', required: false, defaultValue: 6, min: 2, max: 20, group: 'general' }
      ],
      components: [
        { id: 'c-cl-prep', name: 'Pembersihan Lapangan & Bowplank Gedung', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'building_area * 0.7', variables: ['building_area'], ahspCode: 'A.2.2.1.1', unitPrice: 18500, detailLevel: 'STANDARD' },
        { id: 'c-cl-struct', name: 'Struktur Beton Bertulang K-300 Tahan Gempa', category: '02. STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.24', variables: ['building_area'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-cl-wall', name: 'Pasangan Dinding Bata Ringan t=10cm Plester Aci', category: '03. ARSITEKTUR', unit: 'm2', calculationRule: 'building_area * 1.8', variables: ['building_area'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-cl-vinyl', name: 'Lantai Vinyl Antibakteri Standar Medis', category: '04. FINISHING MEDIS', unit: 'm2', calculationRule: 'building_area * 0.85', variables: ['building_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-cl-paint', name: 'Pengecatan Cat Antibakteri Mudah Dicuci', category: '04. FINISHING MEDIS', unit: 'm2', calculationRule: 'building_area * 2.2', variables: ['building_area'], ahspCode: 'A.4.7.1.2', unitPrice: 42000, detailLevel: 'PROFESSIONAL', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
        { id: 'c-cl-sanitary', name: 'Wastafel Cuci Tangan Sensor Medis & Sanitair', category: '05. SANITAIR', unit: 'unit', calculationRule: 'num_exam_rooms + 2', variables: ['num_exam_rooms'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'PROFESSIONAL', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        // Comprehensive additions
        { id: 'c-cl-ac', name: 'Instalasi Tata Udara Hepa Filter / HVAC Ruang Tindakan', category: '06. MEP KHUSUS', unit: 'titik', calculationRule: '4', variables: [], ahspCode: 'A.6.1.3.1', unitPrice: 8500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // I2. PENDIDIKAN (Tambahan: Gedung Perkuliahan Kampus)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-EDU-CAMPUS', {
      id: 'BLD-EDU-CAMPUS',
      name: 'Gedung Perkuliahan & Laboratorium Kampus',
      category: 'PENDIDIKAN',
      subcategory: 'Fasilitas Kampus',
      description: 'Pembangunan gedung perkuliahan 3 lantai mencakup ruang kuliah teater, laboratorium komputer/sains, dan ruang dosen.',
      badge: 'Kampus',
      icon: 'GraduationCap',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Luas Bangunan Total', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 1800, min: 500, max: 20000, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 3, min: 2, max: 6, group: 'dimensions' },
        { id: 'num_lecture_halls', key: 'num_lecture_halls', label: 'Jumlah Ruang Kuliah', type: 'NUMBER', required: false, defaultValue: 8, min: 2, max: 30, group: 'general' }
      ],
      components: [
        { id: 'c-cp-prep', name: 'Pembersihan Lapangan & Pengukuran', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'building_area / num_floors * 1.3', variables: ['building_area', 'num_floors'], ahspCode: 'A.2.2.1.1', unitPrice: 18500, detailLevel: 'STANDARD' },
        { id: 'c-cp-struct', name: 'Struktur Beton Bertulang K-300 Balok, Kolom & Plat Bondek', category: '02. STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.25', variables: ['building_area'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
        { id: 'c-cp-wall', name: 'Dinding Bata Ringan t=10cm & Plester Aci', category: '03. ARSITEKTUR', unit: 'm2', calculationRule: 'building_area * 1.6', variables: ['building_area'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
        { id: 'c-cp-floor', name: 'Lantai Granit Homogeneous 60x60 cm Ruang Kuliah & Selasar', category: '04. FINISHING', unit: 'm2', calculationRule: 'building_area * 0.85', variables: ['building_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        // Professional additions
        { id: 'c-cp-ceiling', name: 'Plafon Akustik Gypsum Board Ruang Kelas', category: '04. FINISHING', unit: 'm2', calculationRule: 'building_area * 0.85', variables: ['building_area'], ahspCode: 'A.4.5.3.2', unitPrice: 95000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-cp-mep', name: 'Instalasi Listrik LED Troffer & Data LAN tiap Kelas', category: '05. MEP', unit: 'titik', calculationRule: 'building_area * 0.2', variables: ['building_area'], ahspCode: 'A.6.1.2.1', unitPrice: 185000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-cp-projector', name: 'Instalasi Sound System & Projector Bracket Ruang Kuliah', category: '05. MEP', unit: 'titik', calculationRule: 'num_lecture_halls', variables: ['num_lecture_halls'], ahspCode: 'A.6.1.3.1', unitPrice: 6500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // J2. INDUSTRI (Tambahan: Workshop Fabrikasi dengan Crane)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('BLD-IND-WORKSHOP', {
      id: 'BLD-IND-WORKSHOP',
      name: 'Workshop Fabrikasi & Maintenance dengan Jalur Crane',
      category: 'INDUSTRI',
      subcategory: 'Workshop & Fabrikasi',
      description: 'Gedung workshop industri rangka baja WF bentang 20 m komplit konsol crane runway 5 ton dan lantai heavy duty.',
      badge: 'Workshop',
      icon: 'Factory',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'workshop_area', key: 'workshop_area', label: 'Luas Bangunan Workshop', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 800, min: 200, max: 10000, group: 'dimensions' },
        { id: 'clear_height', key: 'clear_height', label: 'Tinggi Bebas Kolom', type: 'NUMBER', unit: 'm', required: false, defaultValue: 8.0, min: 5.0, max: 15.0, group: 'dimensions' }
      ],
      components: [
        { id: 'c-ws-pedestal', name: 'Pondasi Telapak & Kolom Pedestal Beton K-350', category: '01. STRUKTUR BAWAH', unit: 'm3', calculationRule: 'workshop_area * 0.05', variables: ['workshop_area'], ahspCode: 'A.4.1.1.5', unitPrice: 4700000, detailLevel: 'STANDARD' },
        { id: 'c-ws-steel', name: 'Rangka Baja Profil WF 300/350 & Runway Crane Beam', category: '02. STRUKTUR BAJA', unit: 'kg', calculationRule: 'workshop_area * 32.0', variables: ['workshop_area'], ahspCode: 'STR.WF.1', unitPrice: 36000, detailLevel: 'STANDARD', materialCategory: 'BAJA_WF', defaultMaterialId: 'MAT-BAJ-WF-GG' },
        { id: 'c-ws-slab', name: 'Lantai Beton K-300 Tebal 20 cm Tulangan M10 + Hardener', category: '03. LANTAI HEAVY DUTY', unit: 'm2', calculationRule: 'workshop_area', variables: ['workshop_area'], ahspCode: 'FIN.HARD.1', unitPrice: 48000, detailLevel: 'STANDARD' },
        { id: 'c-ws-roof', name: 'Atap & Cladding Spandek Zincalume 0.40 mm', category: '04. PENUTUP ATAP', unit: 'm2', calculationRule: 'workshop_area * 1.4', variables: ['workshop_area'], ahspCode: 'STR.SPAN.1', unitPrice: 115000, detailLevel: 'STANDARD', materialCategory: 'SPANDEK', defaultMaterialId: 'MAT-ATP-SPANDEK-35' },
        // Professional additions
        { id: 'c-ws-door', name: 'Pintu Dorong Geser Baja Plat Industri Lebar 6m', category: '05. PINTU WORKSHOP', unit: 'unit', calculationRule: '2', variables: [], ahspCode: 'STR.WF.1', unitPrice: 18500000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-ws-crane', name: 'Overhead Crane Gantry System Kapasitas 5 Ton', category: '06. PERALATAN INDUSTRI', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'STR.WF.1', unitPrice: 285000000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // K2. UTILITAS (Tambahan: Air Bersih HDPE & IPAL Komunal)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('UTIL-PLUMBING-WATER', {
      id: 'UTIL-PLUMBING-WATER',
      name: 'Jaringan Distribusi Air Bersih HDPE & Ground Tank',
      category: 'UTILITAS',
      subcategory: 'Jaringan Air Bersih',
      description: 'Pemasangan pipa distribusi air bersih pipa HDPE/PVC AW komplit bak kontrol valve, tandon ground tank beton 50 m³, dan pompa booster.',
      badge: 'Air Bersih',
      icon: 'Zap',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'pipe_length', key: 'pipe_length', label: 'Panjang Jaringan Pipa Utama', type: 'NUMBER', unit: 'm', required: true, defaultValue: 1200, min: 50, max: 20000, group: 'dimensions' },
        { id: 'tank_capacity_m3', key: 'tank_capacity_m3', label: 'Kapasitas Ground Reservoir', type: 'NUMBER', unit: 'm³', required: false, defaultValue: 50, min: 10, max: 500, group: 'specifications' }
      ],
      components: [
        { id: 'c-uw-galian', name: 'Galian Tanah Jalur Pipa Distribusi & Urugan Pasir', category: '01. PEKERJAAN TANAH', unit: 'm3', calculationRule: 'pipe_length * 0.4 * 0.8', variables: ['pipe_length'], ahspCode: 'A.2.3.1.1', unitPrice: 88500, detailLevel: 'STANDARD' },
        { id: 'c-uw-pipe', name: 'Pemasangan Pipa Air Bersih HDPE SDR-17 Dia 3 Inchi Butt Fusion', category: '02. PEMASANGAN PIPA', unit: 'm1', calculationRule: 'pipe_length', variables: ['pipe_length'], ahspCode: 'A.5.1.2.1', unitPrice: 95000, detailLevel: 'STANDARD', materialCategory: 'PIPA', defaultMaterialId: 'MAT-PIP-RUCIKA-AW-05' },
        // Professional additions
        { id: 'c-uw-tank', name: 'Konstruksi Ground Water Tank Beton K-300 Kedap Air 50 m³', category: '03. RESERVOIR', unit: 'm3', calculationRule: 'tank_capacity_m3', variables: ['tank_capacity_m3'], ahspCode: 'A.4.1.1.5', unitPrice: 1850000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-uw-pump', name: 'Paket Pompa Booster Inverter Duplex Komplit Panel Kontrol', category: '04. PERPOMPAAN', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.6.1.2.1', unitPrice: 45000000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('UTIL-IPAL-WASTE', {
      id: 'UTIL-IPAL-WASTE',
      name: 'Instalasi Pengolahan Air Limbah (IPAL) Komunal',
      category: 'UTILITAS',
      subcategory: 'Pengolahan Air Limbah (IPAL)',
      description: 'Pembangunan bak sedimentasi dan pengolahan limbah cair komunal beton kedap air K-300 komplit blower aerasi dan pipa inlet/outlet.',
      badge: 'IPAL',
      icon: 'Zap',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'capacity_m3_per_day', key: 'capacity_m3_per_day', label: 'Kapasitas Pengolahan Harian', type: 'NUMBER', unit: 'm³/hari', required: true, defaultValue: 100, min: 20, max: 2000, group: 'specifications' }
      ],
      components: [
        { id: 'c-ip-galian', name: 'Galian Tanah Bak Penampung & Pengolahan IPAL', category: '01. TANAH', unit: 'm3', calculationRule: 'capacity_m3_per_day * 1.5', variables: ['capacity_m3_per_day'], ahspCode: 'A.2.3.1.1', unitPrice: 88500, detailLevel: 'STANDARD' },
        { id: 'c-ip-beton', name: 'Bak Pengolahan Beton Bertulang K-300 Waterproofing Integral', category: '02. STRUKTUR BAK', unit: 'm3', calculationRule: 'capacity_m3_per_day * 0.45', variables: ['capacity_m3_per_day'], ahspCode: 'A.4.1.1.5', unitPrice: 4700000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-ip-pipa', name: 'Pipa Distribusi Limbah PVC D Dia 4-6 Inchi & Valve Kontrol', category: '03. PLAMBING IPAL', unit: 'm1', calculationRule: '120.0', variables: [], ahspCode: 'A.5.1.2.2', unitPrice: 78000, detailLevel: 'PROFESSIONAL', materialCategory: 'PIPA', defaultMaterialId: 'MAT-PIP-RUCIKA-D-4' },
        // Comprehensive additions
        { id: 'c-ip-blower', name: 'Blower Aerator & Media Biofilter Sarang Tawon Komplit', category: '04. SISTEM AERASI', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.6.1.2.1', unitPrice: 38000000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // L. LANDSCAPE & SITE DEVELOPMENT (BARU)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('LAND-PARK-RESIDENCE', {
      id: 'LAND-PARK-RESIDENCE',
      name: 'Taman Kawasan & Plaza Publik (Hardscape & Softscape)',
      category: 'LANDSCAPE_SITE',
      subcategory: 'Landscape & Taman',
      description: 'Pekerjaan lansekap taman hijau perumahan/kawasan: tanah subur, rumput gajah mini, plaza paving sikat, jogging track, dan pohon tabebuya.',
      badge: 'Lansekap',
      icon: 'Trees',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'park_area', key: 'park_area', label: 'Luas Total Area Taman', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 1500, min: 100, max: 50000, group: 'dimensions' },
        { id: 'plaza_hardscape_area', key: 'plaza_hardscape_area', label: 'Luas Hardscape / Plaza Paving', type: 'NUMBER', unit: 'm²', required: false, defaultValue: 400, min: 20, max: 10000, group: 'dimensions' }
      ],
      components: [
        { id: 'c-lp-prep', name: 'Pembersihan & Pembentukan Kontur Tanah Taman', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'park_area', variables: ['park_area'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
        { id: 'c-lp-grass', name: 'Penanaman Rumput Taman Gajah Mini Komplit Tanah Humus t=10cm', category: '02. SOFTSCAPE', unit: 'm2', calculationRule: 'park_area - plaza_hardscape_area', variables: ['park_area', 'plaza_hardscape_area'], ahspCode: 'A.8.1.1.1', unitPrice: 45000, detailLevel: 'STANDARD' },
        { id: 'c-lp-paving', name: 'Pemasangan Paving Dekoratif Plaza Pejalan Kaki', category: '03. HARDSCAPE', unit: 'm2', calculationRule: 'plaza_hardscape_area', variables: ['plaza_hardscape_area'], ahspCode: 'A.4.4.3.7', unitPrice: 175000, detailLevel: 'STANDARD', materialCategory: 'PAVING', defaultMaterialId: 'MAT-PAV-BATA-6' },
        // Professional additions
        { id: 'c-lp-trees', name: 'Penanaman Pohon Peneduh Tabebuya Kuning / Sakura Tinggi 3m', category: '02. SOFTSCAPE', unit: 'pohon', calculationRule: 'Math.ceil(park_area / 75)', variables: ['park_area'], ahspCode: 'A.8.1.1.1', unitPrice: 350000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-lp-curb', name: 'Kanstin Pembatas Taman & Rumput', category: '03. HARDSCAPE', unit: 'm1', calculationRule: 'Math.sqrt(plaza_hardscape_area) * 4', variables: ['plaza_hardscape_area'], ahspCode: 'A.4.4.3.8', unitPrice: 95000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-lp-light', name: 'Lampu Taman Bollard LED Tenaga Surya 20 Watt per 15m', category: '04. PENERANGAN TAMAN', unit: 'titik', calculationRule: 'Math.ceil(park_area / 150)', variables: ['park_area'], ahspCode: 'A.6.1.2.1', unitPrice: 850000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('LAND-FENCE-GATE', {
      id: 'LAND-FENCE-GATE',
      name: 'Pagar Keliling Kawasan & Gerbang Satpam',
      category: 'LANDSCAPE_SITE',
      subcategory: 'Pagar & Pengamanan Site',
      description: 'Pemasangan pagar batas keliling panel besi hollow galvanis, pondasi batu kali, pos satpam 3x3m, dan pintu gerbang dorong otomatis.',
      badge: 'Pengamanan',
      icon: 'Trees',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'fence_length', key: 'fence_length', label: 'Panjang Total Pagar Keliling', type: 'NUMBER', unit: 'm', required: true, defaultValue: 350, min: 20, max: 10000, group: 'dimensions' },
        { id: 'fence_height', key: 'fence_height', label: 'Tinggi Pagar', type: 'NUMBER', unit: 'm', required: false, defaultValue: 2.0, min: 1.5, max: 4.0, group: 'dimensions' }
      ],
      components: [
        { id: 'c-fg-pondasi', name: 'Pondasi Batu Kali Belah Bawah Pagar', category: '01. STRUKTUR BAWAH', unit: 'm3', calculationRule: 'fence_length * 0.4 * 0.6', variables: ['fence_length'], ahspCode: 'A.3.2.1.2', unitPrice: 980000, detailLevel: 'STANDARD' },
        { id: 'c-fg-sloof', name: 'Beton Sloof Praktis & Kolom Praktis K-225', category: '01. STRUKTUR BAWAH', unit: 'm3', calculationRule: 'fence_length * 0.03', variables: ['fence_length'], ahspCode: 'A.4.1.1.2', unitPrice: 4200000, detailLevel: 'STANDARD' },
        { id: 'c-fg-fence', name: 'Pagar Besi Hollow Galvanis Minimalis Tinggi 2m', category: '02. PAGAR', unit: 'm2', calculationRule: 'fence_length * fence_height', variables: ['fence_length', 'fence_height'], ahspCode: 'A.8.1.2.1', unitPrice: 450000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-fg-gate', name: 'Pintu Gerbang Utama Rangka Besi Hollow Dorong Lebar 6m', category: '03. GERBANG & POS', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.8.1.2.1', unitPrice: 12500000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-fg-post', name: 'Pos Jaga Satpam Minimalis 3x3m Komplit Toilet', category: '03. GERBANG & POS', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.4.1.1.4', unitPrice: 35000000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // M. MEP SYSTEM (BARU)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('MEP-COMPLETE-PKG', {
      id: 'MEP-COMPLETE-PKG',
      name: 'Paket Terpadu MEP Gedung Komersial',
      category: 'MEP_SYSTEM',
      subcategory: 'MEP Terintegrasi',
      description: 'Paket komprehensif mekanikal elektrikal gedung: panel distribusi daya utama, tata udara VRV, plambing air bersih/kotor, fire alarm, dan data.',
      badge: 'MEP Komplit',
      icon: 'Cpu',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'building_area', key: 'building_area', label: 'Total Luas Bangunan yang Dilayani', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 1000, min: 100, max: 20000, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai', type: 'NUMBER', required: true, defaultValue: 3, min: 1, max: 10, group: 'dimensions' }
      ],
      components: [
        { id: 'c-mp-panel', name: 'Panel Utama Distribusi Listrik (LVMDP) & Sub-Panel tiap Lantai', category: '01. ELEKTRIKAL', unit: 'unit', calculationRule: 'num_floors + 1', variables: ['num_floors'], ahspCode: 'A.6.1.2.1', unitPrice: 18500000, detailLevel: 'STANDARD' },
        { id: 'c-mp-light', name: 'Instalasi Penerangan LED Troffer & Stop Kontak Kantor', category: '01. ELEKTRIKAL', unit: 'titik', calculationRule: 'building_area * 0.25', variables: ['building_area'], ahspCode: 'A.6.1.2.1', unitPrice: 185000, detailLevel: 'STANDARD' },
        { id: 'c-mp-pipe', name: 'Jaringan Pipa Distribusi Air Bersih & Kotor antar Lantai', category: '02. PLAMBING', unit: 'm1', calculationRule: 'building_area * 0.35', variables: ['building_area'], ahspCode: 'A.5.1.2.1', unitPrice: 75000, detailLevel: 'STANDARD', materialCategory: 'PIPA', defaultMaterialId: 'MAT-PIP-RUCIKA-AW-05' },
        // Professional additions
        { id: 'c-mp-fire', name: 'Sistem Deteksi Fire Alarm Smoke Detector & Hydrant Box', category: '03. PROTEKSI KEBAKARAN', unit: 'titik', calculationRule: 'building_area * 0.15', variables: ['building_area'], ahspCode: 'A.6.1.2.1', unitPrice: 450000, detailLevel: 'PROFESSIONAL' },
        { id: 'c-mp-lan', name: 'Jaringan Kabel Data LAN Cat6 & Rack Server Komunikasi', category: '04. DATA & IT', unit: 'titik', calculationRule: 'building_area * 0.12', variables: ['building_area'], ahspCode: 'A.6.1.3.1', unitPrice: 320000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-mp-vrv', name: 'Sistem Tata Udara AC Central VRV Hemat Energi', category: '05. HVAC', unit: 'titik', calculationRule: 'num_floors * 4', variables: ['num_floors'], ahspCode: 'A.6.1.3.1', unitPrice: 7500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('MEP-SOLAR-PV', {
      id: 'MEP-SOLAR-PV',
      name: 'Sistem PLTS Solar PV Rooftop On-Grid (20 kWp)',
      category: 'MEP_SYSTEM',
      subcategory: 'Pembangkit Surya Solar PV',
      description: 'Pemasangan pembangkit listrik tenaga surya rooftop on-grid: modul surya monocrystalline 550Wp, inverter on-grid 20 kW, dan panel proteksi DC/AC.',
      badge: 'Green Energy',
      icon: 'Cpu',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'installed_capacity_kwp', key: 'installed_capacity_kwp', label: 'Kapasitas Terpasang (kWp)', type: 'NUMBER', unit: 'kWp', required: true, defaultValue: 20, min: 3, max: 500, group: 'specifications' }
      ],
      components: [
        { id: 'c-sp-pv', name: 'Modul Surya Monocrystalline 550Wp Komplit Rangka Mounting Roof', category: '01. SOLAR ARRAY', unit: 'kWp', calculationRule: 'installed_capacity_kwp', variables: ['installed_capacity_kwp'], ahspCode: 'MEP.PV.1', unitPrice: 12500000, detailLevel: 'STANDARD' },
        { id: 'c-sp-inverter', name: 'Inverter On-Grid Tiga Phasa & Monitoring WiFi Smart Meter', category: '02. INVERTER & ELEKTRIKAL', unit: 'unit', calculationRule: 'Math.ceil(installed_capacity_kwp / 20)', variables: ['installed_capacity_kwp'], ahspCode: 'A.6.1.2.1', unitPrice: 32000000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-sp-panel', name: 'Panel Proteksi AC/DC Combiner Box Komplit Surge Arrester', category: '02. INVERTER & ELEKTRIKAL', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.6.1.2.1', unitPrice: 8500000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-sp-grounding', name: 'Sistem Grounding Khusus & Penangkal Petir Eksternal PLTS', category: '03. PROTEKSI PETIR', unit: 'titik', calculationRule: '2', variables: [], ahspCode: 'A.6.1.2.1', unitPrice: 4500000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    // -----------------------------------------------------------------------
    // N. RENOVASI & MAINTENANCE (BARU)
    // -----------------------------------------------------------------------
    this.officialTemplates.set('RENOV-HOUSE-FULL', {
      id: 'RENOV-HOUSE-FULL',
      name: 'Renovasi Menyeluruh Rumah Tinggal (Full Overhaul)',
      category: 'RENOVASI_MAINTENANCE',
      subcategory: 'Renovasi Hunian',
      description: 'Paket renovasi menyeluruh: pembongkaran keramik & kusen lama, perbaikan kebocoran atap, penggantian lantai granit baru, plafon gypsum baru, dan cat ulang.',
      badge: 'Renovasi',
      icon: 'RefreshCw',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'renov_area', key: 'renov_area', label: 'Luas Bangunan yang Direnovasi', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 90, min: 30, max: 600, group: 'dimensions' },
        { id: 'num_bathrooms_renov', key: 'num_bathrooms_renov', label: 'Jumlah Kamar Mandi yang Diganti', type: 'NUMBER', required: false, defaultValue: 2, min: 1, max: 6, group: 'general' }
      ],
      components: [
        { id: 'c-rf-demo', name: 'Pembongkaran Lantai Keramik, Plafon Lama & Buang Puing Keluar', category: '01. PEMBONGKARAN', unit: 'm2', calculationRule: 'renov_area * 1.5', variables: ['renov_area'], ahspCode: 'A.2.1.1.1', unitPrice: 35000, detailLevel: 'STANDARD' },
        { id: 'c-rf-floor', name: 'Penggantian Lantai Granit Tile 60x60 cm Baru', category: '02. PERBAIKAN LANTAI', unit: 'm2', calculationRule: 'renov_area * 0.88', variables: ['renov_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
        { id: 'c-rf-ceiling', name: 'Penggantian Plafon Gypsum 9mm Rangka Hollow Baru', category: '03. PERBAIKAN PLAFON', unit: 'm2', calculationRule: 'renov_area * 0.95', variables: ['renov_area'], ahspCode: 'A.4.5.3.2', unitPrice: 85000, detailLevel: 'STANDARD', materialCategory: 'PLAFON', defaultMaterialId: 'MAT-PLA-JAYABOARD-9' },
        { id: 'c-rf-paint', name: 'Pengecatan Ulang Seluruh Dinding Interior & Eksterior', category: '04. PENGECATAN ULANG', unit: 'm2', calculationRule: 'renov_area * 3.5', variables: ['renov_area'], ahspCode: 'A.4.7.1.2', unitPrice: 42000, detailLevel: 'STANDARD', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
        // Professional additions
        { id: 'c-rf-km', name: 'Renovasi Total Kamar Mandi Keramik Dinding & Kloset Duduk Baru', category: '05. KAMAR MANDI', unit: 'unit', calculationRule: 'num_bathrooms_renov', variables: ['num_bathrooms_renov'], ahspCode: 'A.5.1.1.1', unitPrice: 3850000, detailLevel: 'PROFESSIONAL', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
        // Comprehensive additions
        { id: 'c-rf-roof', name: 'Penggantian Rangka Kuda-Kuda Baja Ringan & Atap Baru Anti Bocor', category: '06. ATAP BARU', unit: 'm2', calculationRule: 'renov_area * 1.15', variables: ['renov_area'], ahspCode: 'A.4.2.1.1', unitPrice: 195000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });

    this.officialTemplates.set('RENOV-COMMERCIAL-FACADE', {
      id: 'RENOV-COMMERCIAL-FACADE',
      name: 'Retrofit & Modernisasi Fasad Gedung ACP & Kaca',
      category: 'RENOVASI_MAINTENANCE',
      subcategory: 'Retrofit Fasad Komersial',
      description: 'Penggantian dan peremajaan fasad gedung lama menggunakan panel Aluminium Composite Panel (ACP) PVDF Seven dan kaca stopsol.',
      badge: 'Fasad Modern',
      icon: 'RefreshCw',
      supportedDetailLevels: ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'],
      defaultDetailLevel: 'PROFESSIONAL',
      parameters: [
        { id: 'facade_area', key: 'facade_area', label: 'Luas Bidang Fasad yang Di-retrofit', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 500, min: 50, max: 10000, group: 'dimensions' },
        { id: 'num_floors', key: 'num_floors', label: 'Jumlah Lantai Gedung', type: 'NUMBER', required: false, defaultValue: 3, min: 1, max: 15, group: 'dimensions' }
      ],
      components: [
        { id: 'c-fa-scaffolding', name: 'Pemasangan Scaffolding Kerja & Pengupasan Fasad Lama', category: '01. PERSIAPAN', unit: 'm2', calculationRule: 'facade_area', variables: ['facade_area'], ahspCode: 'A.2.1.1.1', unitPrice: 35000, detailLevel: 'STANDARD' },
        { id: 'c-fa-acp', name: 'Pemasangan Rangka Hollow & Panel ACP Seven PVDF 4 mm', category: '02. FASAD ACP', unit: 'm2', calculationRule: 'facade_area * 0.75', variables: ['facade_area'], ahspCode: 'A.4.6.2.1', unitPrice: 650000, detailLevel: 'STANDARD' },
        { id: 'c-fa-glass', name: 'Pemasangan Kaca Stopsol Panas 8 mm & Kusen Aluminium 4 Inchi', category: '03. KACA & KUSEN', unit: 'm2', calculationRule: 'facade_area * 0.25', variables: ['facade_area'], ahspCode: 'A.4.6.1.1', unitPrice: 485000, detailLevel: 'STANDARD' },
        // Professional additions
        { id: 'c-fa-sealant', name: 'Aplikasi Silicone Weatherseal Joint Sealant Seluruh Sambungan', category: '02. FASAD ACP', unit: 'm1', calculationRule: 'facade_area * 2.5', variables: ['facade_area'], ahspCode: 'A.4.4.3.3', unitPrice: 35000, detailLevel: 'PROFESSIONAL' },
        // Comprehensive additions
        { id: 'c-fa-lighting', name: 'Instalasi Lampu Fasad Wall Washer LED IP67 & Timer Kontrol', category: '04. LIGHTING FASAD', unit: 'titik', calculationRule: 'Math.ceil(facade_area / 25)', variables: ['facade_area'], ahspCode: 'A.6.1.2.1', unitPrice: 1250000, detailLevel: 'COMPREHENSIVE', isOptional: true }
      ],
      metadata: { source: 'EZRAB_OFFICIAL', version: '2.1.0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' }
    });
  }

  // =========================================================================
  // 2. HELPER: Build standard house components with Detail Levels
  // =========================================================================
  private buildStandardHouseComponents(area: number, floors: number, bathrooms: number): ConstructionComponentTemplate[] {
    const isMultiFloor = floors > 1;
    return [
      // STANDARD (Core Essential Structure & Envelope)
      { id: 'c-prep-1', name: 'Pembersihan dan Perataan Lapangan Kerja Proyek', category: '01. PEKERJAAN PERSIAPAN', unit: 'm2', calculationRule: 'building_area * 1.25', variables: ['building_area'], ahspCode: 'A.2.2.1.9', unitPrice: 8500, detailLevel: 'STANDARD' },
      { id: 'c-prep-2', name: 'Pemasangan Bowplank dan Pengukuran Titik As Bangunan', category: '01. PEKERJAAN PERSIAPAN', unit: 'm1', calculationRule: 'Math.sqrt(building_area) * 4 + 4', variables: ['building_area'], ahspCode: 'A.2.2.1.4', unitPrice: 42000, detailLevel: 'STANDARD' },
      { id: 'c-tanah-1', name: 'Galian Tanah Pondasi Menerus / Footplate', category: '02. PEKERJAAN TANAH DAN PONDASI', unit: 'm3', calculationRule: 'building_area * 0.45', variables: ['building_area'], ahspCode: 'A.2.3.1.1', unitPrice: 88500, detailLevel: 'STANDARD' },
      { id: 'c-tanah-2', name: 'Urugan Pasir Alas Bawah Pondasi & Lantai t=5 cm', category: '02. PEKERJAAN TANAH DAN PONDASI', unit: 'm3', calculationRule: 'building_area * 0.08', variables: ['building_area'], ahspCode: 'A.2.3.1.11', unitPrice: 185000, detailLevel: 'PROFESSIONAL' },
      { id: 'c-pondasi', name: isMultiFloor ? 'Pondasi Footplate Beton Bertulang K-250' : 'Pondasi Batu Kali Belah 1:5', category: '02. PEKERJAAN TANAH DAN PONDASI', unit: 'm3', calculationRule: isMultiFloor ? 'building_area * 0.10' : 'building_area * 0.35', variables: ['building_area'], ahspCode: isMultiFloor ? 'A.4.1.1.5' : 'A.3.2.1.2', unitPrice: isMultiFloor ? 4700000 : 980000, detailLevel: 'STANDARD' },
      { id: 'c-sloof', name: 'Beton Sloof Bertulang K-225 (15/20)', category: '03. PEKERJAAN STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.055', variables: ['building_area'], ahspCode: 'A.4.1.1.2', unitPrice: 4200000, detailLevel: 'STANDARD' },
      { id: 'c-kolom', name: 'Beton Kolom Bertulang K-225', category: '03. PEKERJAAN STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.065', variables: ['building_area'], ahspCode: 'A.4.1.1.4', unitPrice: 4850000, detailLevel: 'STANDARD' },
      { id: 'c-ringbalk', name: 'Beton Balok Gantung & Ringbalk Bertulang', category: '03. PEKERJAAN STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.045', variables: ['building_area'], ahspCode: 'A.4.1.1.6', unitPrice: 4950000, detailLevel: 'STANDARD' },
      { id: 'c-plat-lantai', name: 'Pelat Lantai Beton Bondek t=12 cm Lantai 2', category: '03. PEKERJAAN STRUKTUR', unit: 'm3', calculationRule: 'building_area * 0.45 * 0.12', variables: ['building_area'], ahspCode: 'A.4.1.1.7', unitPrice: 4650000, detailLevel: 'STANDARD', condition: 'num_floors >= 2' },
      { id: 'c-tangga', name: 'Beton Tangga Bertulang K-250', category: '03. PEKERJAAN STRUKTUR', unit: 'm3', calculationRule: '2.5', variables: [], ahspCode: 'A.4.1.1.8', unitPrice: 4900000, detailLevel: 'STANDARD', condition: 'num_floors >= 2' },
      { id: 'c-dinding', name: 'Pasangan Dinding Bata Ringan t=10 cm', category: '04. PEKERJAAN DINDING', unit: 'm2', calculationRule: 'building_area * 2.2', variables: ['building_area'], ahspCode: 'A.4.4.1.1', unitPrice: 145000, detailLevel: 'STANDARD' },
      { id: 'c-plester', name: 'Plesteran Dinding Mortar 1:4 Tebal 15 mm (2 Sisi)', category: '04. PEKERJAAN DINDING', unit: 'm2', calculationRule: 'building_area * 4.4', variables: ['building_area'], ahspCode: 'A.4.4.2.1', unitPrice: 78000, detailLevel: 'STANDARD' },
      { id: 'c-aci', name: 'Acian Dinding Semen Instan Halus (2 Sisi)', category: '04. PEKERJAAN DINDING', unit: 'm2', calculationRule: 'building_area * 4.4', variables: ['building_area'], ahspCode: 'A.4.4.2.2', unitPrice: 42000, detailLevel: 'PROFESSIONAL' },
      { id: 'c-keramik', name: 'Lantai Granit Tile 60x60 cm Polished', category: '05. PEKERJAAN LANTAI', unit: 'm2', calculationRule: 'building_area * 0.88', variables: ['building_area'], ahspCode: 'A.4.4.3.1', unitPrice: 295000, detailLevel: 'STANDARD', materialCategory: 'GRANIT', defaultMaterialId: 'MAT-GRA-GRN-60' },
      { id: 'c-plafon', name: 'Plafon Gypsum Board Tebal 9 mm & Rangka Hollow', category: '08. PEKERJAAN PLAFON', unit: 'm2', calculationRule: 'building_area * 0.95', variables: ['building_area'], ahspCode: 'A.4.5.3.2', unitPrice: 85000, detailLevel: 'PROFESSIONAL', materialCategory: 'PLAFON', defaultMaterialId: 'MAT-PLA-JAYABOARD-9' },
      { id: 'c-atap-kuda', name: 'Rangka Kuda-Kuda Baja Ringan C-75 t=0.75 mm', category: '06. PEKERJAAN ATAP', unit: 'm2', calculationRule: 'building_area * 1.15', variables: ['building_area'], ahspCode: 'A.4.2.1.1', unitPrice: 195000, detailLevel: 'STANDARD', materialCategory: 'BAJA_RINGAN', defaultMaterialId: 'MAT-KCD-KENCANA-C75' },
      { id: 'c-atap-genteng', name: 'Penutup Atap Genteng Metal Berpasir', category: '06. PEKERJAAN ATAP', unit: 'm2', calculationRule: 'building_area * 1.15', variables: ['building_area'], ahspCode: 'A.4.5.1.1', unitPrice: 165000, detailLevel: 'STANDARD', materialCategory: 'GENTENG', defaultMaterialId: 'MAT-ATP-SAKURA-ROOF' },
      { id: 'c-pintu-utama', name: 'Pintu Panel Kayu Solid Pabrikasi Pintu Utama', category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.4.6.1.2', unitPrice: 1850000, detailLevel: 'STANDARD' },
      { id: 'c-pintu-kamar', name: 'Pintu Panel HPL Kamar Tidur', category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA', unit: 'unit', calculationRule: 'num_bedrooms', variables: ['num_bedrooms'], ahspCode: 'A.4.6.1.2', unitPrice: 1250000, detailLevel: 'PROFESSIONAL' },
      { id: 'c-pintu-km', name: 'Pintu PVC Kamar Mandi Komplit Kunci & Engsel', category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA', unit: 'unit', calculationRule: 'num_bathrooms', variables: ['num_bathrooms'], ahspCode: 'A.4.6.1.4', unitPrice: 450000, detailLevel: 'STANDARD' },
      { id: 'c-cat-interior', name: 'Pengecatan Dinding Interior Emulsi 2 Lapis', category: '11. PEKERJAAN PENGECATAN', unit: 'm2', calculationRule: 'building_area * 3.2', variables: ['building_area'], ahspCode: 'A.4.7.1.2', unitPrice: 42000, detailLevel: 'PROFESSIONAL', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
      { id: 'c-cat-plafon', name: 'Pengecatan Plafon Interior Emulsi 2 Lapis', category: '11. PEKERJAAN PENGECATAN', unit: 'm2', calculationRule: 'building_area * 0.95', variables: ['building_area'], ahspCode: 'A.4.7.1.1', unitPrice: 38000, detailLevel: 'PROFESSIONAL', materialCategory: 'CAT_INTERIOR', defaultMaterialId: 'MAT-CAT-NIP-INT' },
      { id: 'c-kloset', name: 'Kloset Duduk Monoblok Dual Flush Komplit Aksesoris', category: '10. PEKERJAAN PLAMBING DAN SANITASI', unit: 'unit', calculationRule: 'num_bathrooms', variables: ['num_bathrooms'], ahspCode: 'A.5.1.1.1', unitPrice: 2450000, detailLevel: 'STANDARD', materialCategory: 'SANITARY', defaultMaterialId: 'MAT-SAN-TOTO-CW420' },
      { id: 'c-shower', name: 'Shower Mandi Set Stainless Steel', category: '10. PEKERJAAN PLAMBING DAN SANITASI', unit: 'unit', calculationRule: 'num_bathrooms', variables: ['num_bathrooms'], ahspCode: 'A.5.1.1.3', unitPrice: 580000, detailLevel: 'PROFESSIONAL' },
      { id: 'c-sink', name: 'Kitchen Sink Cuci Piring Stainless 1 Bak + Kran Angsa', category: '10. PEKERJAAN PLAMBING DAN SANITASI', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.5.1.1.5', unitPrice: 650000, detailLevel: 'PROFESSIONAL' },
      { id: 'c-septic', name: 'Bio Septictank Ramah Lingkungan Kapasitas 1000 Liter', category: '10. PEKERJAAN PLAMBING DAN SANITASI', unit: 'unit', calculationRule: '1', variables: [], ahspCode: 'A.5.1.3.1', unitPrice: 3200000, detailLevel: 'STANDARD' },
      { id: 'c-titik-lampu', name: 'Instalasi Titik Lampu Kabel NYM 3x1.5 mm dlm Conduit', category: '09. PEKERJAAN INSTALASI LISTRIK', unit: 'titik', calculationRule: 'Math.ceil(building_area / 4) + 4', variables: ['building_area'], ahspCode: 'A.6.1.2.1', unitPrice: 185000, detailLevel: 'STANDARD' },
      { id: 'c-stop-kontak', name: 'Instalasi Titik Stop Kontak Kabel NYM 3x2.5 mm', category: '09. PEKERJAAN INSTALASI LISTRIK', unit: 'titik', calculationRule: 'Math.ceil(building_area / 6) + 2', variables: ['building_area'], ahspCode: 'A.6.1.3.1', unitPrice: 195000, detailLevel: 'PROFESSIONAL' },
      // Optional & Comprehensive Works
      { id: 'c-opt-water-heater', name: 'Pemasangan Water Heater Listrik 15 Liter + Kran Panas Dingin', category: '10. PEKERJAAN PLAMBING DAN SANITASI', unit: 'unit', calculationRule: 'num_bathrooms', variables: ['num_bathrooms'], ahspCode: 'A.5.1.1.3', unitPrice: 2850000, detailLevel: 'COMPREHENSIVE', isOptional: true },
      { id: 'c-opt-ac', name: 'Instalasi Titik AC Split 1 PK & Pipa Tembaga Freon R32', category: '09. PEKERJAAN INSTALASI LISTRIK', unit: 'titik', calculationRule: 'num_bedrooms', variables: ['num_bedrooms'], ahspCode: 'A.6.1.3.1', unitPrice: 850000, detailLevel: 'COMPREHENSIVE', isOptional: true },
      { id: 'c-opt-canopy', name: 'Kanopi Carport Rangka Hollow Besi Galvanis Atap Polikarbonat', category: '12. PEKERJAAN TAMBAHAN EKSTERIOR', unit: 'm2', calculationRule: '15.0', variables: [], ahspCode: 'A.4.2.1.1', unitPrice: 450000, detailLevel: 'COMPREHENSIVE', isOptional: true },
      { id: 'c-opt-pagar', name: 'Pagar Depan Minimalis Besi Hollow Galvanis & Pintu Dorong', category: '12. PEKERJAAN TAMBAHAN EKSTERIOR', unit: 'm2', calculationRule: '12.0', variables: [], ahspCode: 'A.4.2.1.1', unitPrice: 650000, detailLevel: 'COMPREHENSIVE', isOptional: true }
    ];
  }

  // =========================================================================
  // 3. STORAGE & CRUD FOR USER TEMPLATES ("Template Saya")
  // =========================================================================
  public getCustomTemplates(): RabTemplate[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_TEMPLATES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public saveCustomTemplate(template: Omit<RabTemplate, 'id' | 'metadata'> & { id?: string }): RabTemplate {
    const existingList = this.getCustomTemplates();
    const isNew = !template.id || template.id.startsWith('draft-');
    const now = new Date().toISOString();

    const templateId = isNew ? `USER-TMPL-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6)}` : template.id!;

    const savedTemplate: RabTemplate = {
      ...template,
      id: templateId,
      metadata: {
        source: 'USER_TEMPLATE',
        version: '1.0.0',
        createdAt: isNew ? now : (existingList.find(t => t.id === templateId)?.metadata.createdAt || now),
        updatedAt: now
      }
    };

    let updatedList: RabTemplate[];
    if (isNew) {
      updatedList = [savedTemplate, ...existingList];
    } else {
      updatedList = existingList.map(t => (t.id === templateId ? savedTemplate : t));
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(updatedList));
    }

    return savedTemplate;
  }

  public duplicateTemplate(templateId: string, customName?: string): RabTemplate {
    const template = this.getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template dengan ID "${templateId}" tidak ditemukan.`);
    }

    const { id: _ignoredId, metadata: _ignoredMeta, ...tplData } = template;
    const duplicated = this.saveCustomTemplate({
      ...tplData,
      name: customName || `${template.name} (Salinan)`,
      category: 'TEMPLATE_SAYA',
      badge: 'Template Saya',
    });

    return duplicated;
  }

  public deleteCustomTemplate(templateId: string): boolean {
    const template = this.getTemplateById(templateId);
    if (template?.metadata.source === 'EZRAB_OFFICIAL') {
      throw new Error('Template resmi EZRAB bersifat read-only dan tidak dapat dihapus.');
    }

    const existingList = this.getCustomTemplates();
    const filtered = existingList.filter(t => t.id !== templateId);

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(filtered));
    }
    return true;
  }

  // =========================================================================
  // 4. RETRIEVAL & QUERYING
  // =========================================================================
  public getAllTemplates(): RabTemplate[] {
    const officials = Array.from(this.officialTemplates.values());
    const customs = this.getCustomTemplates();
    return [...customs, ...officials];
  }

  public getTemplatesByCategory(category: TemplateCategory | 'ALL'): RabTemplate[] {
    const all = this.getAllTemplates();
    if (category === 'ALL') return all;
    if (category === 'TEMPLATE_SAYA') {
      return all.filter(t => t.metadata.source === 'USER_TEMPLATE' || t.category === 'TEMPLATE_SAYA');
    }
    return all.filter(t => t.category === category);
  }

  public getTemplateById(templateId: string): RabTemplate | undefined {
    if (this.officialTemplates.has(templateId)) {
      return this.officialTemplates.get(templateId);
    }
    const customs = this.getCustomTemplates();
    return customs.find(t => t.id === templateId);
  }

  // =========================================================================
  // 5. DETERMINISTIC RAB GENERATION ENGINE
  // =========================================================================
  public generateRabFromTemplate(
    template: RabTemplate,
    userParams: Record<string, any>,
    targetProjectId?: string,
    detailLevel: DetailLevel = 'PROFESSIONAL',
    selectedOptionalItemIds: string[] = []
  ): GeneratedTemplateRabResult {
    // 1. Merge default parameter values with user parameters
    const evaluatedParams: Record<string, any> = {};
    for (const p of template.parameters) {
      const val = userParams[p.key] !== undefined && userParams[p.key] !== ''
        ? userParams[p.key]
        : (p.defaultValue !== undefined ? p.defaultValue : 0);

      if (p.type === 'NUMBER') {
        evaluatedParams[p.key] = Number(val) || 0;
      } else if (p.type === 'BOOLEAN') {
        evaluatedParams[p.key] = val === true || val === 'true';
      } else {
        evaluatedParams[p.key] = val;
      }
    }

    // Include other passed variables
    for (const [k, v] of Object.entries(userParams)) {
      if (evaluatedParams[k] === undefined) {
        evaluatedParams[k] = !isNaN(Number(v)) ? Number(v) : v;
      }
    }

    // 2. Generate items via dedicated or universal generator
    let items: RabItem[] = [];
    if (typeof template.generateRabItems === 'function') {
      try {
        items = template.generateRabItems(evaluatedParams, detailLevel, selectedOptionalItemIds);
      } catch (err) {
        console.warn(`Template ${template.id} generator failed, falling back to components:`, err);
        items = this.generateDefaultItemsFromComponents(template, evaluatedParams, detailLevel, selectedOptionalItemIds, targetProjectId);
      }
    } else {
      items = this.generateDefaultItemsFromComponents(template, evaluatedParams, detailLevel, selectedOptionalItemIds, targetProjectId);
    }

    // 3. Attach projectId & assign IDs if missing
    const now = Date.now();
    const pid = targetProjectId || 'PROJ-DEFAULT';
    const finalItems: RabItem[] = items.map((item, idx) => ({
      ...item,
      id: item.id || `rab-${now}-${idx + 1}-${Math.random().toString(36).substr(2, 4)}`,
      projectId: pid,
      no: idx + 1
    }));

    // 4. Calculate total & summary
    let totalEstimate = 0;
    const categorySummaries: Record<string, number> = {};
    const traceability: TraceabilityRecord[] = [];

    for (const item of finalItems) {
      const amt = SafeDecimalEngine.safeMultiply(item.volume, item.unitPrice || 0, 0);
      totalEstimate = SafeDecimalEngine.safeAdd(totalEstimate, amt);
      const cat = item.category || '01. PEKERJAAN PERSIAPAN';
      categorySummaries[cat] = SafeDecimalEngine.safeAdd(categorySummaries[cat] || 0, amt);

      traceability.push({
        itemId: item.id,
        itemNo: item.no,
        wbsCode: item.code,
        description: item.description,
        volume: item.volume,
        unit: item.unit,
        calculationTrace: item.notes || `Volume: ${item.volume} ${item.unit}`,
        ahspCode: item.ahspCode,
        unitPrice: item.unitPrice,
        amount: amt,
        priceSource: item.ahspCode ? 'OFFICIAL_AHSP' : 'REFERENCE_PRICE'
      });
    }

    return {
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.metadata.version,
      detailLevel,
      evaluatedParameters: evaluatedParams,
      selectedOptionalItemIds,
      items: finalItems,
      totalEstimate,
      itemCount: finalItems.length,
      categorySummaries,
      traceability,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Universal Component Evaluator with Detail Level, Condition, and Optional Filter
   */
  private generateDefaultItemsFromComponents(
    template: RabTemplate,
    params: Record<string, any>,
    detailLevel: DetailLevel = 'PROFESSIONAL',
    selectedOptionalItemIds: string[] = [],
    projectId?: string
  ): RabItem[] {
    const rabItems: RabItem[] = [];
    const components = template.components || [];
    const materialService = MaterialLibraryService.getInstance();
    const projectSpec = projectId ? materialService.getProjectSpec(projectId) : null;

    // Context dictionary for formula variable substitutions
    const context: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'number') {
        context[k] = v;
      } else if (!isNaN(Number(v))) {
        context[k] = Number(v);
      } else {
        context[k] = v;
      }
    }

    // Evaluate space quantities if present
    if (template.spaces && template.spaces.length > 0) {
      for (const sp of template.spaces) {
        let count = 1;
        if (!isNaN(Number(sp.quantityRule))) {
          count = Number(sp.quantityRule);
        } else if (context[sp.quantityRule] !== undefined) {
          count = Number(context[sp.quantityRule]) || 1;
        }
        context[`space_count_${sp.id}`] = count;
        if (sp.targetArea) {
          context[`space_area_${sp.id}`] = SafeDecimalEngine.safeMultiply(count, sp.targetArea);
        }
      }
    }

    let itemIndex = 1;
    for (const comp of components) {
      // 1. DETAIL LEVEL FILTER
      // STANDARD: only STANDARD items
      // PROFESSIONAL: STANDARD + PROFESSIONAL items
      // COMPREHENSIVE: all items
      const compLevel: DetailLevel = comp.detailLevel || 'PROFESSIONAL';
      if (detailLevel === 'STANDARD' && compLevel !== 'STANDARD') {
        continue;
      }
      if (detailLevel === 'PROFESSIONAL' && compLevel === 'COMPREHENSIVE' && !comp.isOptional) {
        continue;
      }

      // 2. OPTIONAL WORKS FILTER
      if (comp.isOptional) {
        const isIncluded = selectedOptionalItemIds.includes(comp.id);
        // In COMPREHENSIVE mode, include optional works by default unless explicitly excluded
        if (!isIncluded && detailLevel !== 'COMPREHENSIVE') {
          continue;
        }
      }

      // 3. CONDITIONAL RULES EVALUATION
      if (comp.condition && comp.condition.trim() !== '') {
        const conditionPasses = this.evaluateCondition(comp.condition, context);
        if (!conditionPasses) {
          continue;
        }
      }

      // 4. DETERMINISTIC VOLUME EVALUATION
      let volume = 1.0;
      let formulaUsed = comp.calculationRule;

      try {
        if (!comp.calculationRule || comp.calculationRule.trim() === '') {
          volume = 1.0;
        } else {
          volume = this.evaluateFormula(comp.calculationRule, context);
        }
      } catch {
        volume = 1.0;
      }

      // Safe rounding to 2 decimal places
      volume = SafeDecimalEngine.safeRound(Math.max(0.01, volume), 2);

      // 5. HONEST AHSP & MATERIAL PRICING RESOLUTION
      let ahspCode = comp.ahspCode || '';
      let unitPrice = comp.unitPrice || 0;
      let materialName = '';

      // Check Material Linkage
      let targetMaterialId = comp.defaultMaterialId;
      if (projectSpec && comp.materialCategory) {
        const defaultForCategory = projectSpec.categoryDefaults[comp.materialCategory.toUpperCase()];
        if (defaultForCategory) {
          targetMaterialId = defaultForCategory;
        }
      }
      if (projectSpec?.itemOverrides[comp.id]) {
        targetMaterialId = projectSpec.itemOverrides[comp.id].materialId;
      }

      if (targetMaterialId) {
        const mat = materialService.getMaterialById(targetMaterialId);
        if (mat) {
          materialName = mat.name;
          // If component price is not explicitly set, resolve from material ecosystem
          if (!comp.unitPrice) {
            const matPriceRes = materialService.getMaterialPrice(targetMaterialId);
            if (matPriceRes.unitPrice > 0) {
              unitPrice = matPriceRes.unitPrice;
            }
          }
        }
      }

      if (ahspCode && VERIFIED_AHSP_PRICES[ahspCode]) {
        const ref = VERIFIED_AHSP_PRICES[ahspCode];
        unitPrice = unitPrice || ref.price;
      } else if (!unitPrice) {
        unitPrice = 150000; // Baseline fallback without fake AHSP
      }

      const total = SafeDecimalEngine.safeMultiply(volume, unitPrice, 0);

      rabItems.push({
        id: `rab-${Date.now()}-${itemIndex}`,
        projectId: projectId || '',
        no: itemIndex,
        code: comp.wbsCode || `${itemIndex}`,
        category: comp.category,
        sectionName: comp.category,
        description: comp.name,
        volume,
        unit: comp.unit,
        materialPrice: Math.round(unitPrice * 0.7),
        laborPrice: Math.round(unitPrice * 0.25),
        equipmentPrice: Math.round(unitPrice * 0.05),
        unitPrice,
        amount: total,
        totalPrice: total,
        ahspCode: ahspCode || undefined,
        notes: `Rule: ${formulaUsed} | Detail: ${compLevel}${materialName ? ` | Material: ${materialName}` : ''}`
      });

      itemIndex++;
    }

    return rabItems;
  }

  /**
   * Deterministic boolean condition evaluator
   * Supports: >, <, >=, <=, ===, !==, true, false
   */
  public evaluateCondition(condition: string, context: Record<string, any>): boolean {
    let expr = condition.trim();

    for (const [key, val] of Object.entries(context)) {
      const reg = new RegExp(`\\b${key}\\b`, 'g');
      if (typeof val === 'string') {
        expr = expr.replace(reg, `'${val}'`);
      } else {
        expr = expr.replace(reg, String(val));
      }
    }

    try {
      // Evaluate comparison expression safely
      const fn = new Function(`return Boolean(${expr});`);
      return Boolean(fn());
    } catch {
      return true; // Default to true if condition expression cannot be resolved
    }
  }

  /**
   * Safe arithmetic formula evaluator
   */
  private evaluateFormula(formula: string, context: Record<string, any>): number {
    let expr = formula;

    // Substitute context variables (e.g. building_area, road_length, etc.)
    for (const [key, val] of Object.entries(context)) {
      if (typeof val === 'number') {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
      }
    }

    // Handle Math.sqrt(x) and Math.ceil(x)
    if (expr.includes('Math.sqrt')) {
      expr = expr.replace(/Math\.sqrt\(([^)]+)\)/g, (_, inner) => {
        const num = this.evaluateFormula(inner, context);
        return String(Math.sqrt(num));
      });
    }
    if (expr.includes('Math.ceil')) {
      expr = expr.replace(/Math\.ceil\(([^)]+)\)/g, (_, inner) => {
        const num = this.evaluateFormula(inner, context);
        return String(Math.ceil(num));
      });
    }

    // Safely evaluate simple arithmetic expressions (+, -, *, /, parentheses)
    const sanitized = expr.replace(/[^0-9+\-*/(). ]/g, '');
    if (!sanitized.trim()) return 1.0;

    try {
      const fn = new Function(`return (${sanitized});`);
      const val = Number(fn());
      return isNaN(val) ? 1.0 : val;
    } catch {
      return 1.0;
    }
  }
}
