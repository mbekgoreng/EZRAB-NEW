import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';
import { RabItem } from '../../src/types';
import { HouseTypeCatalog } from '../../src/data/houseTypeCatalog';
import { getRegionalFactor, REGIONAL_WIZARD_OPTIONS } from '../../src/data/regionalCostFactors';

export interface AssistantChoice {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  badge?: string;
  value: string;
  nextStep: string;
  templateId?: string;
  disabled?: boolean;
  disabledReason?: string;
  area?: number | null;
  floorOptions?: number[];
  defaultFloorCount?: number;
  readinessStatus?: string;
  categoryGroup?: string;
  displayOrder?: number;
  availability?: boolean;
}

export interface AssistantQuestion {
  id: string;
  type:
    | 'single_select'
    | 'multi_select'
    | 'number'
    | 'text'
    | 'unit_number'
    | 'dropdown'
    | 'location'
    | 'confirmation';
  label: string;
  description?: string;
  required: boolean;
  options?: AssistantChoice[];
  unit?: string;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
    errorMessage?: string;
  };
}

export interface TemplateDefinition {
  templateId: string;
  name: string;
  category: 'BUILDING' | 'ROAD_AND_PAVEMENT' | 'WATER_RESOURCES' | 'CIVIL_STRUCTURE';
  subCategory: string;
  description: string;
  badge?: string;
  requiredParameters: string[];
  optionalParameters: string[];
  defaultValues: Record<string, any>;
  questions: AssistantQuestion[];
  requiresEngineeringReview: boolean;
  generateRabItems: (params: Record<string, any>) => RabItem[];
}

export class TemplateResolver {
  private static templates: Map<string, TemplateDefinition> = new Map();

  static {
    TemplateResolver.registerHouseTemplates();
    TemplateResolver.registerBuildingTemplates();
  }

  private static registerHouseTemplates() {
    // 1. HOUSE TYPE 36 (1 LANTAI) - CANONICAL TEMPLATE FOR VERTICAL SLICE
    TemplateResolver.templates.set('HOUSE-T36-1FL', {
      templateId: 'HOUSE-T36-1FL',
      name: 'Rumah Type 36 (1 Lantai)',
      category: 'BUILDING',
      subCategory: 'HOUSE',
      description: 'Luas bangunan 36 m² (dimensi 6x6 m), 2 Kamar Tidur, 1 Kamar Mandi, Dapur & Ruang Tamu.',
      badge: 'Paling Populer',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
      optionalParameters: ['wall_height', 'location', 'floor_finish'],
      defaultValues: {
        building_area: 36,
        num_floors: 1,
        wall_height: 3.5,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
        floor_finish: 'KERAMIK_40X40',
        location: 'Nasional Rata-Rata'
      },
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Bangunan',
          description: 'Luas lantai dasar bangunan rumah tinggal',
          unit: 'm²',
          required: true,
          defaultValue: 36,
          validation: { min: 21, max: 100 }
        },
        {
          id: 'foundation_type',
          type: 'single_select',
          label: 'Jenis Pondasi Utama',
          description: 'Pondasi struktur bawah penyangga beban dinding & atap',
          required: true,
          defaultValue: 'BATU_KALI',
          options: [
            { id: 'batu_kali', label: 'Pondasi Batu Kali / Menerus', value: 'BATU_KALI', nextStep: 'NEXT', description: 'Standar tanah keras stabil (Kedalaman 70-80cm)' },
            { id: 'footplate', label: 'Pondasi Footplate (Cakar Ayam)', value: 'FOOTPLATE', nextStep: 'NEXT', description: 'Kombinasi footplate beton dan batu kali' }
          ]
        },
        {
          id: 'wall_type',
          type: 'single_select',
          label: 'Jenis Dinding',
          description: 'Material pasangan dinding keliling & sekat',
          required: true,
          defaultValue: 'BATA_RINGAN',
          options: [
            { id: 'bata_ringan', label: 'Bata Ringan (Hebel) 10 cm', value: 'BATA_RINGAN', nextStep: 'NEXT', description: 'Pemasangan cepat, ringan & presisi' },
            { id: 'bata_merah', label: 'Bata Merah Standar Lokal', value: 'BATA_MERAH', nextStep: 'NEXT', description: 'Kuat dan kedap suara alami' }
          ]
        },
        {
          id: 'roof_type',
          type: 'single_select',
          label: 'Rangka & Penutup Atap',
          description: 'Struktur rangka atap utama dan penutup genteng',
          required: true,
          defaultValue: 'BAJA_RINGAN_GENTENG_METAL',
          options: [
            { id: 'genteng_metal', label: 'Rangka Baja Ringan + Genteng Metal Pasir', value: 'BAJA_RINGAN_GENTENG_METAL', nextStep: 'NEXT', description: 'Ekonomis, anti karat & berbobot ringan' },
            { id: 'genteng_keramik', label: 'Rangka Baja Ringan + Genteng Keramik / Beton', value: 'BAJA_RINGAN_GENTENG_KERAMIK', nextStep: 'NEXT', description: 'Tampilan elegan, tahan cuaca ekstrem' },
            { id: 'spandek', label: 'Rangka Baja Ringan + Atap Spandek Zincalume', value: 'BAJA_RINGAN_SPANDEK', nextStep: 'NEXT', description: 'Cocok untuk desain minimalis modern' }
          ]
        },
        {
          id: 'quality_level',
          type: 'single_select',
          label: 'Kelas Kualitas Finishing',
          description: 'Spesifikasi material finishing (lantai, cat, sanitair)',
          required: true,
          defaultValue: 'STANDAR',
          options: [
            { id: 'standar', label: 'Standar / Ekonomis', value: 'STANDAR', nextStep: 'NEXT', description: 'Keramik 40x40, Cat standar, Sanitair standar' },
            { id: 'menengah', label: 'Menengah / Standard Pro', value: 'MENENGAH', nextStep: 'NEXT', description: 'Granit Tile 60x60, Cat premium weather, Kloset duduk TOTO' }
          ]
        },
        {
          id: 'location',
          type: 'single_select',
          label: 'Daerah / Wilayah Proyek',
          description: 'Penyesuaian indeks biaya material & upah (IKK) berdasarkan wilayah',
          required: false,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 36;
        const wallHeight = Number(params.wall_height) || 3.5;
        const quality = params.quality_level || 'STANDAR';
        const foundationType = params.foundation_type || 'BATU_KALI';
        const wallType = params.wall_type || 'BATA_RINGAN';
        const roofType = params.roof_type || 'BAJA_RINGAN_GENTENG_METAL';
        const reg = getRegionalFactor(params.location);
        const regionalMultiplier = reg.factor;
        const isBataMerah = wallType === 'BATA_MERAH';
        const isFootplate = foundationType === 'FOOTPLATE';
        const isGentengKeramik = roofType === 'BAJA_RINGAN_GENTENG_KERAMIK';
        const isSpandek = roofType === 'BAJA_RINGAN_SPANDEK';
        const isPremium = quality === 'MENENGAH';

        // --- GEOMETRIC FORMULA DERIVATIONS (Berdasarkan Denah Type 36 Standard: 6.0 x 6.0 m) ---
        // Rasio skala luas terhadap standar 36 m2
        const scale = SafeDecimalEngine.safeDivide(area, 36, 4);
        const linearScale = Math.sqrt(scale);

        // Dimensi dasar bangunan (P x L)
        const panjangBangunan = SafeDecimalEngine.safeRound(6.0 * linearScale, 2);
        const lebarBangunan = SafeDecimalEngine.safeRound(6.0 * linearScale, 2);

        // Keliling luar & panjang as dinding (luar + sekat kamar/KM/ruang tengah)
        const kelilingLuar = SafeDecimalEngine.safeRound(2 * (panjangBangunan + lebarBangunan), 2);
        // Total panjang as dinding (termasuk sekat ruang tamu, 2 kamar tidur, 1 kamar mandi)
        const panjangAsDinding = SafeDecimalEngine.safeRound(34.0 * linearScale, 2);

        // Bukaan Pintu & Jendela (1 Pintu Utama, 2 Pintu Kamar, 1 Pintu KM, 2 Jendela Ganda, 2 Jendela Tunggal)
        const luasBukaan = SafeDecimalEngine.safeRound(13.5 * linearScale, 2);
        // Luas Segitiga Sop-Sop / Gunungan Atap Pelana
        const luasSopSop = SafeDecimalEngine.safeRound(5.5 * linearScale, 2);

        // Luas Dinding Bersih = (Panjang As * Tinggi Dinding) - Luas Bukaan + Sop-Sop
        const luasDindingGross = SafeDecimalEngine.safeMultiply(panjangAsDinding, wallHeight);
        const luasDindingNetto = SafeDecimalEngine.safeRound(Math.max(10, luasDindingGross - luasBukaan + luasSopSop), 2);
        const luasPlesteranAcian = SafeDecimalEngine.safeRound(luasDindingNetto * 2.0, 2); // 2 sisi plesteran

        // Panjang Pondasi & Balok Sloof / Ringbalk
        const panjangPondasi = SafeDecimalEngine.safeRound(panjangAsDinding, 2);
        const volumeGalianTanah = SafeDecimalEngine.safeRound(panjangPondasi * 0.8 * 0.7, 2); // Lebar 0.8m, dalam 0.7m
        const volumePasirUrug = SafeDecimalEngine.safeRound(panjangPondasi * 0.8 * 0.05, 2); // Tebal 5cm
        const volumePondasiBatu = SafeDecimalEngine.safeRound(panjangPondasi * ((0.30 + 0.65) / 2) * 0.75, 2); // Penampang trapesium

        // Struktur Beton Bertulang (Sloof 15/20, Kolom 15/15 @ 14 titik, Ringbalk 15/15)
        const volumeSloof = SafeDecimalEngine.safeRound(panjangPondasi * 0.15 * 0.20, 2);
        const jumlahTitikKolom = Math.ceil(14 * linearScale);
        const volumeKolom = SafeDecimalEngine.safeRound(jumlahTitikKolom * (0.15 * 0.15 * wallHeight), 2);
        const volumeRingbalk = SafeDecimalEngine.safeRound(panjangPondasi * 0.15 * 0.15, 2);

        // Atap & Plafon (Sudut 30 derajat, overstek 0.8m)
        const rad30 = (30 * Math.PI) / 180;
        const sisiMiringAtap = SafeDecimalEngine.safeRound(((lebarBangunan / 2) + 0.8) / Math.cos(rad30), 2);
        const panjangAtapTotal = SafeDecimalEngine.safeRound(panjangBangunan + 1.6, 2);
        const luasBidangAtap = SafeDecimalEngine.safeRound(2 * sisiMiringAtap * panjangAtapTotal, 2);
        const luasPlafon = SafeDecimalEngine.safeRound(area, 2);

        // Lantai & Cat
        const luasLantai = SafeDecimalEngine.safeRound(area * 0.95, 2); // Netto setelah dinding
        const luasPengecatan = SafeDecimalEngine.safeRound(luasPlesteranAcian + luasPlafon, 2);

        const items: RabItem[] = [
          // 01. PEKERJAAN PERSIAPAN
          {
            id: `RAB-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pembersihan dan Perataan Lapangan Kerja Proyek',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm2',
            volume: SafeDecimalEngine.safeRound(area * 1.25, 2),
            unitPrice: 18500,
            ahspCode: 'A.2.2.1.9',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-02`,
            itemNumber: '1.2',
            wbsCode: '1.2',
            description: 'Pemasangan Bowplank dan Pengukuran Titik As Bangunan',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm1',
            volume: SafeDecimalEngine.safeRound(kelilingLuar + 4.0, 2),
            unitPrice: 42000,
            ahspCode: 'A.2.2.1.4',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-03`,
            itemNumber: '1.3',
            wbsCode: '1.3',
            description: 'Penyediaan Air Kerja, Listrik Proyek, dan Gudang Alat Sementara',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'ls',
            volume: 1,
            unitPrice: 1850000,
            ahspCode: 'A.2.2.1.1',
            status: 'READY'
          },

          // 02. PEKERJAAN TANAH DAN PONDASI
          {
            id: `RAB-${Date.now()}-04`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Galian Tanah Pondasi Menerus / Footplate (Kedalaman 0.8 - 1.0 m)',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: volumeGalianTanah,
            unitPrice: 88500,
            ahspCode: 'A.2.3.1.1',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-05`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: 'Urugan Pasir Bawah Pondasi & Bawah Lantai Tebal 5 cm',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: volumePasirUrug,
            unitPrice: 245000,
            ahspCode: 'A.2.3.1.11',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-06`,
            itemNumber: '2.3',
            wbsCode: '2.3',
            description: isFootplate
              ? 'Pondasi Footplate Beton Bertulang K-225 (Telapak 80x80x25 cm)'
              : 'Pasangan Pondasi Batu Kali Belah Campuran 1SP : 4PP',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: isFootplate ? SafeDecimalEngine.safeRound(jumlahTitikKolom * 0.22, 2) : volumePondasiBatu,
            unitPrice: isFootplate ? 1450000 : 945000,
            ahspCode: isFootplate ? 'A.4.1.1.5' : 'A.3.2.1.2',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-07`,
            itemNumber: '2.4',
            wbsCode: '2.4',
            description: 'Urugan Tanah Kembali dan Pemadatan Sekitar Pondasi',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: SafeDecimalEngine.safeRound(volumeGalianTanah * 0.35, 2),
            unitPrice: 38000,
            ahspCode: 'A.2.3.1.9',
            status: 'READY'
          },

          // 03. PEKERJAAN STRUKTUR
          {
            id: `RAB-${Date.now()}-08`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: 'Sloof Beton Bertulang 15/20 cm (Mutu K-200 / f\'c 17.1 MPa)',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: volumeSloof,
            unitPrice: 4850000,
            ahspCode: 'A.4.1.1.5',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-09`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: 'Kolom Praktis Beton Bertulang 15/15 cm Pembesian 4D10',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: volumeKolom,
            unitPrice: 5100000,
            ahspCode: 'A.4.1.1.6',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-10`,
            itemNumber: '3.3',
            wbsCode: '3.3',
            description: 'Ringbalk Beton Bertulang 15/15 cm',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: volumeRingbalk,
            unitPrice: 4950000,
            ahspCode: 'A.4.1.1.7',
            status: 'READY'
          },

          // 04. PEKERJAAN DINDING
          {
            id: `RAB-${Date.now()}-11`,
            itemNumber: '4.1',
            wbsCode: '4.1',
            description: isBataMerah
              ? 'Pasangan Dinding Bata Merah Tebal 1/2 Batu Campuran 1SP : 4PP'
              : 'Pasangan Dinding Bata Ringan (Hebel) Tebal 10 cm dengan Mortar Siap Pakai',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: luasDindingNetto,
            unitPrice: isBataMerah ? 145000 : 138000,
            ahspCode: isBataMerah ? 'A.4.4.1.9' : 'A.4.4.1.20',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-12`,
            itemNumber: '4.2',
            wbsCode: '4.2',
            description: 'Plesteran Dinding Tebal 15 mm Campuran 1SP : 4PP 2 Sisi',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: luasPlesteranAcian,
            unitPrice: 58000,
            ahspCode: 'A.4.4.2.4',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-13`,
            itemNumber: '4.3',
            wbsCode: '4.3',
            description: 'Acian Dinding Halus Mortar Instan Siap Cat',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: luasPlesteranAcian,
            unitPrice: 36500,
            ahspCode: 'A.4.4.2.27',
            status: 'READY'
          },

          // 05. PEKERJAAN LANTAI
          {
            id: `RAB-${Date.now()}-14`,
            itemNumber: '5.1',
            wbsCode: '5.1',
            description: 'Rabat Beton Dasar Lantai Bawah Keramik Tebal 5 cm',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: luasLantai,
            unitPrice: 62000,
            ahspCode: 'A.4.1.1.4',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-15`,
            itemNumber: '5.2',
            wbsCode: '5.2',
            description: isPremium
              ? 'Pemasangan Lantai Granit Tile 60x60 cm Polish Kualitas Premium'
              : 'Pemasangan Lantai Keramik 40x40 cm Polish Standar Kualitas Utama',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: SafeDecimalEngine.safeRound(luasLantai * 0.90, 2),
            unitPrice: isPremium ? 245000 : 165000,
            ahspCode: isPremium ? 'A.4.4.3.40' : 'A.4.4.3.35',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-16`,
            itemNumber: '5.3',
            wbsCode: '5.3',
            description: 'Pemasangan Keramik Dinding & Lantai Kamar Mandi Anti-Slip 20x20 & 20x40',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: SafeDecimalEngine.safeRound(luasLantai * 0.10, 2),
            unitPrice: 185000,
            ahspCode: 'A.4.4.3.42',
            status: 'READY'
          },

          // 06. PEKERJAAN ATAP
          {
            id: `RAB-${Date.now()}-17`,
            itemNumber: '6.1',
            wbsCode: '6.1',
            description: 'Rangka Kuda-kuda & Reng Baja Ringan Profil C75.75 Standar SNI',
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: luasBidangAtap,
            unitPrice: 185000,
            ahspCode: 'A.4.2.1.21',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-18`,
            itemNumber: '6.2',
            wbsCode: '6.2',
            description: isGentengKeramik
              ? 'Penutup Atap Genteng Keramik Glazur'
              : isSpandek
              ? 'Penutup Atap Spandek Zincalume 0.35 mm'
              : 'Penutup Atap Genteng Metal Berpasir Tebal 0.30 mm',
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: luasBidangAtap,
            unitPrice: isGentengKeramik ? 195000 : isSpandek ? 98000 : 135000,
            ahspCode: 'A.4.5.2.32',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-19`,
            itemNumber: '6.3',
            wbsCode: '6.3',
            description: 'Pemasangan Nok / Bubungan Genteng Metal Berpasir',
            category: '06. PEKERJAAN ATAP',
            unit: 'm1',
            volume: SafeDecimalEngine.safeRound(panjangAtapTotal, 2),
            unitPrice: 95000,
            ahspCode: 'A.4.5.2.38',
            status: 'READY'
          },

          // 07. PEKERJAAN KUSEN, PINTU, DAN JENDELA
          {
            id: `RAB-${Date.now()}-20`,
            itemNumber: '7.1',
            wbsCode: '7.1',
            description: 'Kusen Pintu & Jendela Aluminium 4 Inch Powder Coating Standar',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'm1',
            volume: SafeDecimalEngine.safeRound(area * 0.65, 2),
            unitPrice: 115000,
            ahspCode: 'A.4.6.1.1',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-21`,
            itemNumber: '7.2',
            wbsCode: '7.2',
            description: 'Daun Pintu Utama Panel Solid Wood / Engineering Door Lengkap Kunci & Aksesoris',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: 1,
            unitPrice: isPremium ? 3200000 : 2450000,
            ahspCode: 'A.4.6.2.2',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-22`,
            itemNumber: '7.3',
            wbsCode: '7.3',
            description: 'Daun Pintu Kamar Tidur & Kamar Mandi Lengkap Kunci & Engsel',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: Math.max(2, Math.floor(area / 18)),
            unitPrice: 1350000,
            ahspCode: 'A.4.6.2.5',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-23`,
            itemNumber: '7.4',
            wbsCode: '7.4',
            description: 'Daun Jendela Kaca Bening 5 mm Rangka Aluminium Casement',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: Math.max(4, Math.floor(area / 9)),
            unitPrice: 550000,
            ahspCode: 'A.4.6.2.12',
            status: 'READY'
          },

          // 08. PEKERJAAN PLAFON
          {
            id: `RAB-${Date.now()}-24`,
            itemNumber: '8.1',
            wbsCode: '8.1',
            description: 'Rangka Plafon Hollow Galvanis 40x40 & 20x40 Standar SNI',
            category: '08. PEKERJAAN PLAFON',
            unit: 'm2',
            volume: luasPlafon,
            unitPrice: 68000,
            ahspCode: 'A.4.5.1.5',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-25`,
            itemNumber: '8.2',
            wbsCode: '8.2',
            description: 'Plafon Gypsum Board Tebal 9 mm Finish Sambungan Compound',
            category: '08. PEKERJAAN PLAFON',
            unit: 'm2',
            volume: luasPlafon,
            unitPrice: 58000,
            ahspCode: 'A.4.5.1.7',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-26`,
            itemNumber: '8.3',
            wbsCode: '8.3',
            description: 'Pemasangan List Profil Gypsum Sudut Plafon 7-10 cm',
            category: '08. PEKERJAAN PLAFON',
            unit: 'm1',
            volume: SafeDecimalEngine.safeRound(kelilingLuar * 1.5, 2),
            unitPrice: 25000,
            ahspCode: 'A.4.5.1.9',
            status: 'READY'
          },

          // 09. PEKERJAAN INSTALASI LISTRIK
          {
            id: `RAB-${Date.now()}-27`,
            itemNumber: '9.1',
            wbsCode: '9.1',
            description: 'Titik Instalasi Lampu Penerangan Kabel NYM 3x1.5 mm² dalam Conduit High Impact',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.max(8, Math.round(area * 0.35)),
            unitPrice: 235000,
            ahspCode: 'A.8.1.1.1',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-28`,
            itemNumber: '9.2',
            wbsCode: '9.2',
            description: 'Titik Instalasi Stop Kontak & Saklar Kabel NYM 3x2.5 mm²',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.max(6, Math.round(area * 0.25)),
            unitPrice: 245000,
            ahspCode: 'A.8.1.1.2',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-29`,
            itemNumber: '9.3',
            wbsCode: '9.3',
            description: 'Pemasangan Box Panel MCB 4 Grup Lengkap Pembumian (Grounding Rod)',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'unit',
            volume: 1,
            unitPrice: 1150000,
            ahspCode: 'A.8.1.2.3',
            status: 'READY'
          },

          // 10. PEKERJAAN PLAMBING DAN SANITASI
          {
            id: `RAB-${Date.now()}-30`,
            itemNumber: '10.1',
            wbsCode: '10.1',
            description: 'Instalasi Pipa Air Bersih PVC AW Dia. 1/2" & 3/4"',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'm1',
            volume: SafeDecimalEngine.safeRound(area * 0.65, 2),
            unitPrice: 48000,
            ahspCode: 'A.5.1.1.19',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-31`,
            itemNumber: '10.2',
            wbsCode: '10.2',
            description: 'Instalasi Pipa Air Kotor & Buangan PVC D Dia. 3" & 4"',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'm1',
            volume: SafeDecimalEngine.safeRound(area * 0.55, 2),
            unitPrice: 85000,
            ahspCode: 'A.5.1.1.23',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-32`,
            itemNumber: '10.3',
            wbsCode: '10.3',
            description: isPremium
              ? 'Instalasi Kloset Duduk Keramik TOTO Dual Flush + Jet Washer'
              : 'Instalasi Kloset Duduk / Jongkok Keramik Standar SNI + Kran',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'unit',
            volume: 1,
            unitPrice: isPremium ? 2950000 : 1850000,
            ahspCode: 'A.5.1.1.1',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-33`,
            itemNumber: '10.4',
            wbsCode: '10.4',
            description: 'Pemasangan Floor Drain Stainless Steel & Kran Dinding Stainless',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'set',
            volume: 2,
            unitPrice: 320000,
            ahspCode: 'A.5.1.1.14',
            status: 'READY'
          },

          // 11. PEKERJAAN PENGECATAN
          {
            id: `RAB-${Date.now()}-34`,
            itemNumber: '11.1',
            wbsCode: '11.1',
            description: 'Pengecatan Dinding Interior 1 Lapis Sealer + 2 Lapis Cat Emulsi',
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'm2',
            volume: SafeDecimalEngine.safeRound(luasPlesteranAcian * 0.75, 2),
            unitPrice: isPremium ? 42000 : 36500,
            ahspCode: 'A.4.7.1.10',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-35`,
            itemNumber: '11.2',
            wbsCode: '11.2',
            description: 'Pengecatan Dinding Eksterior Weathershield Tahan Cuaca & Jamur',
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'm2',
            volume: SafeDecimalEngine.safeRound(luasPlesteranAcian * 0.25, 2),
            unitPrice: isPremium ? 58000 : 49500,
            ahspCode: 'A.4.7.1.11',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-36`,
            itemNumber: '11.3',
            wbsCode: '11.3',
            description: 'Pengecatan Plafon Gypsum Warna Putih Khusus Plafon',
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'm2',
            volume: luasPlafon,
            unitPrice: 32000,
            ahspCode: 'A.4.7.1.12',
            status: 'READY'
          },

          // 12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN
          {
            id: `RAB-${Date.now()}-37`,
            itemNumber: '12.1',
            wbsCode: '12.1',
            description: 'Pembuatan Septic Tank Biofill / Pasangan Bata + Bak Resapan Air Kotor',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'unit',
            volume: 1,
            unitPrice: 3850000,
            ahspCode: 'A.5.1.1.30',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-38`,
            itemNumber: '12.2',
            wbsCode: '12.2',
            description: 'Rabat Beton Carport & Selasar Keliling Tebal 7 cm Mutu K-175',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm2',
            volume: SafeDecimalEngine.safeRound(area * 0.35, 2),
            unitPrice: 85000,
            ahspCode: 'A.4.1.1.3',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-39`,
            itemNumber: '12.3',
            wbsCode: '12.3',
            description: 'Saluran Drainase Keliling Pasangan Batu Bata / Saluran U-Ditch Air Hujan',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm1',
            volume: SafeDecimalEngine.safeRound(kelilingLuar * 0.6, 2),
            unitPrice: 95000,
            ahspCode: 'A.2.3.1.15',
            status: 'READY'
          },

          // 13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA
          {
            id: `RAB-${Date.now()}-40`,
            itemNumber: '13.1',
            wbsCode: '13.1',
            description: 'Pembersihan Akhir Sisa Material Konstruksi, Debu & Residu Siap Huni',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 750000,
            ahspCode: 'A.2.2.1.2',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-41`,
            itemNumber: '13.2',
            wbsCode: '13.2',
            description: 'Pengujian, Commissioning Kelistrikan, Plambing & Uji Tekan Air',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 500000,
            ahspCode: 'A.8.1.3.1',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-42`,
            itemNumber: '13.3',
            wbsCode: '13.3',
            description: 'Dokumentasi Proyek, As-Built Drawing Standar & Berita Acara Serah Terima (BAST)',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 650000,
            ahspCode: 'A.1.1.1.1',
            status: 'READY'
          }
        ];

        if (regionalMultiplier !== 1.00) {
          for (const it of items) {
            it.unitPrice = Math.round(SafeDecimalEngine.safeMultiply(it.unitPrice, regionalMultiplier));
          }
        }

        return items;
      }
    });

    // 2. HOUSE TYPE 45
    TemplateResolver.templates.set('HOUSE-T45-1FL', {
      templateId: 'HOUSE-T45-1FL',
      name: 'Rumah Type 45 (1 Lantai)',
      category: 'BUILDING',
      subCategory: 'HOUSE',
      description: 'Luas 45 m² (dimensi 6x7.5 m), 2 Kamar Tidur lega, Dapur, Carport & Taman Depan.',
      badge: 'Menengah',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
      optionalParameters: ['wall_height', 'location', 'floor_finish'],
      defaultValues: {
        building_area: 45,
        num_floors: 1,
        wall_height: 3.6,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
        floor_finish: 'KERAMIK_40X40',
        location: 'Nasional Rata-Rata'
      },
      questions: TemplateResolver.templates.get('HOUSE-T36-1FL')!.questions,
      generateRabItems: (params) => {
        return TemplateResolver.templates.get('HOUSE-T36-1FL')!.generateRabItems({
          ...params,
          building_area: Number(params.building_area) || 45,
          wall_height: Number(params.wall_height) || 3.6
        });
      }
    });

    // 3. HOUSE TYPE 70
    TemplateResolver.templates.set('HOUSE-T70-1FL', {
      templateId: 'HOUSE-T70-1FL',
      name: 'Rumah Type 70 (1 Lantai)',
      category: 'BUILDING',
      subCategory: 'HOUSE',
      description: 'Luas 70 m² (dimensi 7x10 m), 3 Kamar Tidur, 2 Kamar Mandi, Ruang Keluarga Luas.',
      badge: 'Keluarga',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
      optionalParameters: ['wall_height', 'location', 'floor_finish'],
      defaultValues: {
        building_area: 70,
        num_floors: 1,
        wall_height: 3.8,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_KERAMIK',
        quality_level: 'MENENGAH',
        floor_finish: 'GRANIT_60X60',
        location: 'Nasional Rata-Rata'
      },
      questions: TemplateResolver.templates.get('HOUSE-T36-1FL')!.questions,
      generateRabItems: (params) => {
        const baseItems = TemplateResolver.templates.get('HOUSE-T36-1FL')!.generateRabItems({
          ...params,
          building_area: Number(params.building_area) || 70,
          wall_height: Number(params.wall_height) || 3.8,
          quality_level: params.quality_level || 'MENENGAH'
        });
        // Add 2nd bathroom sanitair item for Type 70
        const sanitairItem = baseItems.find(i => i.itemNumber === '10.3' || i.itemNumber === '6.3' || i.category.includes('PLAMBING'));
        if (sanitairItem) {
          sanitairItem.volume = 2;
          sanitairItem.description = 'Instalasi Sanitair 2 Unit Kamar Mandi (Kloset Duduk + Shower Set + Floor Drain)';
        }
        return baseItems;
      }
    });

    // 4. HOUSE TYPE 36 2 LANTAI
    TemplateResolver.templates.set('HOUSE-T36-2FL', {
      templateId: 'HOUSE-T36-2FL',
      name: 'Rumah Type 36 (2 Lantai)',
      category: 'BUILDING',
      subCategory: 'HOUSE',
      description: 'Luas total 60 m² (Lantai 1: 36m², Lantai 2: 24m²), Struktur Footplate + Plat Beton.',
      badge: 'Bertingkat',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
      optionalParameters: ['wall_height', 'location', 'floor_finish'],
      defaultValues: {
        building_area: 60,
        num_floors: 2,
        wall_height: 3.4,
        foundation_type: 'FOOTPLATE',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
        floor_finish: 'KERAMIK_40X40',
        location: 'Nasional Rata-Rata'
      },
      questions: TemplateResolver.templates.get('HOUSE-T36-1FL')!.questions,
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 60;
        const quality = params.quality_level || 'STANDAR';
        const isPremium = quality === 'MENENGAH';

        const baseItems = TemplateResolver.templates.get('HOUSE-T36-1FL')!.generateRabItems({
          ...params,
          building_area: area,
          foundation_type: 'FOOTPLATE'
        });

        // Add 2-floor specific structural items: Plat Lantai Beton & Tangga Beton
        const platLantaiArea = SafeDecimalEngine.safeRound(area * 0.40, 2); // Plat lantai 2 ~24 m2
        const volPlatBeton = SafeDecimalEngine.safeRound(platLantaiArea * 0.12, 2); // Tebal 12 cm

        const items2Fl: RabItem[] = [
          ...baseItems,
          {
            id: `RAB-${Date.now()}-17`,
            itemNumber: '3.4',
            wbsCode: '3.4',
            description: 'Plat Lantai Beton Bertulang Tebal 12 cm (K-250, Wiremesh M8 + Bekisting Bondek)',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: volPlatBeton,
            unitPrice: 5350000,
            ahspCode: 'A.4.1.1.8',
            status: 'READY'
          },
          {
            id: `RAB-${Date.now()}-18`,
            itemNumber: '3.5',
            wbsCode: '3.5',
            description: 'Konstruksi Tangga Beton Bertulang + Reiling Besi Hollow Minimalis',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'unit',
            volume: 1,
            unitPrice: isPremium ? 8500000 : 5800000,
            ahspCode: 'A.4.1.1.9',
            status: 'READY'
          }
        ];

        return items2Fl;
      }
    });

    // 5. HOUSE TYPE 54 (1 LANTAI)
    TemplateResolver.templates.set('HOUSE-T54-1FL', {
      templateId: 'HOUSE-T54-1FL',
      name: 'Rumah Type 54 (1 Lantai)',
      category: 'BUILDING',
      subCategory: 'HOUSE',
      description: 'Luas bangunan 54 m² (dimensi 6x9 m), 3 Kamar Tidur, 1 Kamar Mandi, Ruang Tamu & Carport.',
      badge: 'Populer',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
      optionalParameters: ['wall_height', 'location', 'floor_finish'],
      defaultValues: {
        building_area: 54,
        num_floors: 1,
        wall_height: 3.6,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
        floor_finish: 'KERAMIK_40X40',
        location: 'Nasional Rata-Rata'
      },
      questions: TemplateResolver.templates.get('HOUSE-T36-1FL')!.questions,
      generateRabItems: (params) => {
        return TemplateResolver.templates.get('HOUSE-T36-1FL')!.generateRabItems({
          ...params,
          building_area: Number(params.building_area) || 54,
          wall_height: Number(params.wall_height) || 3.6
        });
      }
    });

    // 6. HOUSE TYPE 60 (1 LANTAI)
    TemplateResolver.templates.set('HOUSE-T60-1FL', {
      templateId: 'HOUSE-T60-1FL',
      name: 'Rumah Type 60 (1 Lantai)',
      category: 'BUILDING',
      subCategory: 'HOUSE',
      description: 'Luas bangunan 60 m² (dimensi 6x10 m), 3 Kamar Tidur, 2 Kamar Mandi, Dapur & R. Makan.',
      badge: 'Keluarga',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
      optionalParameters: ['wall_height', 'location', 'floor_finish'],
      defaultValues: {
        building_area: 60,
        num_floors: 1,
        wall_height: 3.7,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
        floor_finish: 'KERAMIK_40X40',
        location: 'Nasional Rata-Rata'
      },
      questions: TemplateResolver.templates.get('HOUSE-T36-1FL')!.questions,
      generateRabItems: (params) => {
        const baseItems = TemplateResolver.templates.get('HOUSE-T36-1FL')!.generateRabItems({
          ...params,
          building_area: Number(params.building_area) || 60,
          wall_height: Number(params.wall_height) || 3.7
        });
        const sanitairItem = baseItems.find(i => i.itemNumber === '6.3');
        if (sanitairItem) {
          sanitairItem.volume = 2;
          sanitairItem.description = 'Instalasi Sanitair 2 Unit Kamar Mandi (Kloset + Shower Set + Floor Drain)';
        }
        return baseItems;
      }
    });

    // Helper to register 2-floor house templates (T90 through T300)
    const register2FlHouse = (
      tplId: string,
      name: string,
      area: number,
      bathCount: number,
      desc: string,
      badge = '2 Lantai'
    ) => {
      TemplateResolver.templates.set(tplId, {
        templateId: tplId,
        name,
        category: 'BUILDING',
        subCategory: 'HOUSE',
        description: desc,
        badge,
        requiresEngineeringReview: false,
        requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
        optionalParameters: ['wall_height', 'location', 'floor_finish'],
        defaultValues: {
          building_area: area,
          num_floors: 2,
          wall_height: 3.6,
          foundation_type: 'FOOTPLATE',
          wall_type: 'BATA_RINGAN',
          roof_type: area >= 150 ? 'BAJA_RINGAN_GENTENG_KERAMIK' : 'BAJA_RINGAN_GENTENG_METAL',
          quality_level: area >= 150 ? 'MENENGAH' : 'STANDAR',
          floor_finish: area >= 150 ? 'GRANIT_60X60' : 'KERAMIK_40X40',
          location: 'Nasional Rata-Rata'
        },
        questions: TemplateResolver.templates.get('HOUSE-T36-1FL')!.questions,
        generateRabItems: (params) => {
          const effectiveArea = Number(params.building_area) || area;
          const quality = params.quality_level || (effectiveArea >= 150 ? 'MENENGAH' : 'STANDAR');
          const isPremium = quality === 'MENENGAH';

          const baseItems = TemplateResolver.templates.get('HOUSE-T36-1FL')!.generateRabItems({
            ...params,
            building_area: effectiveArea,
            foundation_type: 'FOOTPLATE',
            quality_level: quality
          });

          // Plat lantai 2 & Tangga Beton Bertulang
          const platArea = SafeDecimalEngine.safeRound(effectiveArea * 0.45, 2);
          const volPlat = SafeDecimalEngine.safeRound(platArea * 0.12, 2);

          const sanitairItem = baseItems.find(i => i.itemNumber === '6.3');
          if (sanitairItem) {
            sanitairItem.volume = bathCount;
            sanitairItem.description = `Instalasi Sanitair ${bathCount} Unit Kamar Mandi (Kloset ${isPremium ? 'Duduk TOTO' : 'Standar'} + Shower + Floor Drain)`;
          }

          return [
            ...baseItems,
            {
              id: `RAB-${Date.now()}-17`,
              itemNumber: '3.4',
              wbsCode: '3.4',
              description: `Plat Lantai 2 Beton Bertulang Tebal 12 cm (Mutu K-250, Wiremesh M8 + Bondek) - Luas ${platArea} m2`,
              category: 'III. PEKERJAAN STRUKTUR BETON',
              unit: 'm3',
              volume: volPlat,
              unitPrice: 5350000,
              ahspCode: 'A.4.1.1.8',
              status: 'READY'
            },
            {
              id: `RAB-${Date.now()}-18`,
              itemNumber: '3.5',
              wbsCode: '3.5',
              description: `Konstruksi Tangga Beton Bertulang + Railling Minimalis Hollow`,
              category: 'III. PEKERJAAN STRUKTUR BETON',
              unit: 'unit',
              volume: effectiveArea >= 250 ? 2 : 1,
              unitPrice: isPremium ? 8500000 : 5800000,
              ahspCode: 'A.4.1.1.9',
              status: 'READY'
            }
          ];
        }
      });
    };

    // 7. HOUSE TYPE 90 (2 LANTAI)
    register2FlHouse('HOUSE-T90-2FL', 'Rumah Type 90 (2 Lantai)', 90, 2, 'Luas bangunan ±90 m², 2 lantai, 3-4 Kamar Tidur, 2 Kamar Mandi, Balkon.');
    // 8. HOUSE TYPE 100 (2 LANTAI)
    register2FlHouse('HOUSE-T100-2FL', 'Rumah Type 100 (2 Lantai)', 100, 2, 'Luas bangunan ±100 m², 2 lantai, 4 Kamar Tidur, 2 Kamar Mandi, Carport.');
    // 9. HOUSE TYPE 120 (2 LANTAI)
    register2FlHouse('HOUSE-T120-2FL', 'Rumah Type 120 (2 Lantai)', 120, 3, 'Luas bangunan ±120 m², 2 lantai, 4 Kamar Tidur, 3 Kamar Mandi, R. Tamu & R. Keluarga luas.');
    // 10. HOUSE TYPE 150 (2 LANTAI)
    register2FlHouse('HOUSE-T150-2FL', 'Rumah Type 150 (2 Lantai)', 150, 3, 'Luas bangunan ±150 m², 2 lantai, 4-5 Kamar Tidur, 3-4 Kamar Mandi, Carport 2 Mobil, Finishing Granit.', 'Mewah');
    // 11. HOUSE TYPE 180 (2 LANTAI)
    register2FlHouse('HOUSE-T180-2FL', 'Rumah Type 180 (2 Lantai)', 180, 4, 'Luas bangunan ±180 m², 2 lantai, 4-5 Kamar Tidur, 4 Kamar Mandi, Garasi + Carport, Finishing Granit.', 'Mewah');
    // 12. HOUSE TYPE 200 (2 LANTAI)
    register2FlHouse('HOUSE-T200-2FL', 'Rumah Type 200 (2 Lantai)', 200, 4, 'Luas bangunan ±200 m², 2 lantai, 5 Kamar Tidur, 4-5 Kamar Mandi, Garasi Dalam & Taman Belakang.', 'Mewah');
    // 13. HOUSE TYPE 250 (2 LANTAI)
    register2FlHouse('HOUSE-T250-2FL', 'Rumah Type 250 (2 Lantai)', 250, 5, 'Luas bangunan ±250 m², 2-3 lantai, 5-6 Kamar Tidur, 5 Kamar Mandi, R. Kerja, Garasi 2 Mobil.', 'Premium');
    // 14. HOUSE TYPE 300 (2 LANTAI)
    register2FlHouse('HOUSE-T300-2FL', 'Rumah Type 300 (2 Lantai)', 300, 6, 'Luas bangunan ±300 m², 2-3 lantai, 6 Kamar Tidur, 5-6 Kamar Mandi, Garasi 2 Mobil + Carport.', 'Prestise');

    // 15. CUSTOM HOUSE
    const customHouseDef: TemplateDefinition = {
      templateId: 'CUSTOM_HOUSE',
      name: 'Rumah Custom (Parameter Bebas)',
      category: 'BUILDING',
      subCategory: 'HOUSE',
      description: 'Tentukan luas, jumlah lantai, jenis pondasi, atap, dan finishing bebas sendiri.',
      badge: 'Custom',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
      optionalParameters: ['wall_height', 'location', 'floor_finish'],
      defaultValues: {
        building_area: 50,
        num_floors: 1,
        wall_height: 3.5,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR',
        floor_finish: 'KERAMIK_40X40',
        location: 'Nasional Rata-Rata'
      },
      questions: TemplateResolver.templates.get('HOUSE-T36-1FL')!.questions,
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 50;
        const numFloors = Number(params.num_floors) || (area > 80 ? 2 : 1);
        if (numFloors > 1) {
          const t90 = TemplateResolver.templates.get('HOUSE-T90-2FL');
          if (t90) return t90.generateRabItems(params);
        }
        return TemplateResolver.templates.get('HOUSE-T36-1FL')!.generateRabItems(params);
      }
    };
    TemplateResolver.templates.set('CUSTOM_HOUSE', customHouseDef);
    TemplateResolver.templates.set('HOUSE-CUSTOM', { ...customHouseDef, templateId: 'HOUSE-CUSTOM' });

    // =========================================================================
    // PHASE B: ROAD & DRAINAGE TEMPLATES
    // =========================================================================
    TemplateResolver.registerRoadTemplates();
  }

  private static registerRoadTemplates() {
    // 1. PAVING BLOCK STANDARD
    TemplateResolver.templates.set('PAVING-BLOCK-STANDARD', {
      templateId: 'PAVING-BLOCK-STANDARD',
      name: 'Jalan Paving Block (K-300)',
      category: 'ROAD_AND_PAVEMENT',
      subCategory: 'PAVEMENT',
      description: 'Paving block mutu K-300 tebal 6/8 cm, pasir bedding 5 cm, kanstin beton pengunci sisi, dan pengisi abu batu.',
      badge: 'Populer',
      requiresEngineeringReview: false,
      requiredParameters: ['length', 'width', 'paving_thickness', 'use_curb'],
      optionalParameters: ['sand_thickness', 'location'],
      defaultValues: {
        length: 100,
        width: 4.0,
        paving_thickness: 6,
        sand_thickness: 5,
        use_curb: 'YES',
        location: 'Nasional Rata-Rata'
      },
      questions: [
        {
          id: 'length',
          type: 'unit_number',
          label: 'Panjang Jalan',
          description: 'Panjang total bentang jalan paving',
          unit: 'm',
          required: true,
          defaultValue: 100,
          validation: { min: 5, max: 10000 }
        },
        {
          id: 'width',
          type: 'unit_number',
          label: 'Lebar Jalan',
          description: 'Lebar bersih perkerasan jalan',
          unit: 'm',
          required: true,
          defaultValue: 4.0,
          validation: { min: 1.0, max: 30.0 }
        },
        {
          id: 'paving_thickness',
          type: 'single_select',
          label: 'Tebal & Mutu Paving Block',
          description: 'Ketebalan blok beton pracetak',
          required: true,
          defaultValue: '6',
          options: [
            { id: 'paving_6cm', label: 'Tebal 6 cm (K-300) — Mobil Ringan & Lingkungan', value: '6', nextStep: 'NEXT' },
            { id: 'paving_8cm', label: 'Tebal 8 cm (K-300/K-400) — Beban Truk & Industri', value: '8', nextStep: 'NEXT' }
          ]
        },
        {
          id: 'use_curb',
          type: 'single_select',
          label: 'Kanstin Beton Pengunci Sisi',
          description: 'Pemasangan kanstin pracetak pembatas di kedua sisi jalan',
          required: true,
          defaultValue: 'YES',
          options: [
            { id: 'curb_yes', label: 'Gunakan Kanstin Beton (2 Sisi Kiri & Kanan)', value: 'YES', nextStep: 'NEXT' },
            { id: 'curb_no', label: 'Tanpa Kanstin (Terkunci Dinding / Tanah)', value: 'NO', nextStep: 'NEXT' }
          ]
        }
      ],
      generateRabItems: (params) => {
        const P = Number(params.length) || 100;
        const L = Number(params.width) || 4.0;
        const tebal = Number(params.paving_thickness) || 6;
        const is8cm = tebal === 8;
        const pakaiKanstin = params.use_curb !== 'NO';

        const luas = SafeDecimalEngine.safeRound(P * L, 2);
        const volPasir = SafeDecimalEngine.safeRound(luas * 0.05 * 1.15, 2);
        const pjgKanstin = pakaiKanstin ? SafeDecimalEngine.safeRound(2 * P, 2) : 0;
        const volGalianPerataan = SafeDecimalEngine.safeRound(luas * 0.15, 2);

        return [
          {
            id: `RAB-PVG-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pengukuran, Pematokan dan Penyiapan Badan Jalan (Subgrade)',
            category: 'I. PEKERJAAN PERSIAPAN & TANAH',
            unit: 'm2',
            volume: luas,
            unitPrice: 12500,
            ahspCode: 'B.01.1.1',
            status: 'READY'
          },
          {
            id: `RAB-PVG-${Date.now()}-02`,
            itemNumber: '1.2',
            wbsCode: '1.2',
            description: 'Galian Tanah dan Perataan Tanah Dasar Badan Jalan',
            category: 'I. PEKERJAAN PERSIAPAN & TANAH',
            unit: 'm3',
            volume: volGalianPerataan,
            unitPrice: 65000,
            ahspCode: 'B.01.1.2',
            status: 'READY'
          },
          {
            id: `RAB-PVG-${Date.now()}-03`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Hamparan Pasir Alas Bedding Tebal 5 cm (Dipadatkan)',
            category: 'II. PEKERJAAN PERKERASAN PAVING',
            unit: 'm3',
            volume: volPasir,
            unitPrice: 245000,
            ahspCode: 'A.2.3.1.11',
            status: 'READY'
          },
          {
            id: `RAB-PVG-${Date.now()}-04`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: `Pemasangan Paving Block Bata K-300 Tebal ${tebal} cm + Pengisian Abu Batu`,
            category: 'II. PEKERJAAN PERKERASAN PAVING',
            unit: 'm2',
            volume: luas,
            unitPrice: is8cm ? 185000 : 155000,
            ahspCode: 'A.4.4.3.60',
            status: 'READY'
          },
          ...(pakaiKanstin
            ? [
                {
                  id: `RAB-PVG-${Date.now()}-05`,
                  itemNumber: '3.1',
                  wbsCode: '3.1',
                  description: 'Pemasangan Kanstin Beton Pracetak 15x30x40 cm Pengunci Sisi',
                  category: 'III. PEKERJAAN KANSTIN & PELENGKAP',
                  unit: 'm1',
                  volume: pjgKanstin,
                  unitPrice: 95000,
                  ahspCode: 'B.08.1.1',
                  status: 'READY' as const
                }
              ]
            : [])
        ];
      }
    });

    // 2. ASPHALT ROAD LIGHT
    TemplateResolver.templates.set('ASPHALT-ROAD-LIGHT', {
      templateId: 'ASPHALT-ROAD-LIGHT',
      name: 'Jalan Aspal Hotmix (Lapis Aus AC-WC)',
      category: 'ROAD_AND_PAVEMENT',
      subCategory: 'ROAD',
      description: 'Lapis Pondasi Agregat Kelas A & B, Lapis Resap Ikat (Prime Coat), dan Aspal Hotmix Laston AC-WC tebal 4-5 cm.',
      badge: 'Bina Marga',
      requiresEngineeringReview: false,
      requiredParameters: ['length', 'width', 'asphalt_thickness'],
      optionalParameters: ['base_a_thickness', 'base_b_thickness', 'location'],
      defaultValues: {
        length: 200,
        width: 5.0,
        asphalt_thickness: 4,
        base_a_thickness: 15,
        base_b_thickness: 15,
        location: 'Nasional Rata-Rata'
      },
      questions: [
        {
          id: 'length',
          type: 'unit_number',
          label: 'Panjang Ruas Jalan',
          description: 'Panjang total jalan yang akan diaspal',
          unit: 'm',
          required: true,
          defaultValue: 200,
          validation: { min: 10, max: 100000 }
        },
        {
          id: 'width',
          type: 'unit_number',
          label: 'Lebar Jalur Aspal',
          description: 'Lebar efektif lajur kendaraan',
          unit: 'm',
          required: true,
          defaultValue: 5.0,
          validation: { min: 2.0, max: 30.0 }
        },
        {
          id: 'asphalt_thickness',
          type: 'single_select',
          label: 'Tebal Aspal Hotmix (AC-WC)',
          description: 'Ketebalan hamparan padat laston',
          required: true,
          defaultValue: '4',
          options: [
            { id: 'acwc_4cm', label: 'Tebal Padat 4 cm (Standar Jalan Lingkungan / Kolektor)', value: '4', nextStep: 'NEXT' },
            { id: 'acwc_5cm', label: 'Tebal Padat 5 cm (Jalan Akses Truk / Beban Sedang)', value: '5', nextStep: 'NEXT' }
          ]
        }
      ],
      generateRabItems: (params) => {
        const P = Number(params.length) || 200;
        const L = Number(params.width) || 5.0;
        const tebalAspal = (Number(params.asphalt_thickness) || 4) / 100;

        const luas = SafeDecimalEngine.safeRound(P * L, 2);
        const volAgregatB = SafeDecimalEngine.safeRound(luas * 0.15 * 1.2, 2); // 15cm tebal
        const volAgregatA = SafeDecimalEngine.safeRound(luas * 0.15 * 1.2, 2);
        const primeCoatLiter = SafeDecimalEngine.safeRound(luas * 0.8, 1);
        const tonaseAspal = SafeDecimalEngine.safeRound(luas * tebalAspal * 2.3, 2);

        return [
          {
            id: `RAB-ASP-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Penyiapan Badan Jalan dan Pemadatan Subgrade',
            category: 'I. PEKERJAAN TANAH & SUBGRADE',
            unit: 'm2',
            volume: luas,
            unitPrice: 14500,
            ahspCode: 'B.01.1.1',
            status: 'READY'
          },
          {
            id: `RAB-ASP-${Date.now()}-02`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Lapis Pondasi Agregat Kelas B (Tebal Padat 15 cm)',
            category: 'II. PEKERJAAN LAPIS PONDASI AGREGAT',
            unit: 'm3',
            volume: volAgregatB,
            unitPrice: 310000,
            ahspCode: 'B.05.1.2',
            status: 'READY'
          },
          {
            id: `RAB-ASP-${Date.now()}-03`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: 'Lapis Pondasi Agregat Kelas A (Tebal Padat 15 cm)',
            category: 'II. PEKERJAAN LAPIS PONDASI AGREGAT',
            unit: 'm3',
            volume: volAgregatA,
            unitPrice: 345000,
            ahspCode: 'B.05.1.1',
            status: 'READY'
          },
          {
            id: `RAB-ASP-${Date.now()}-04`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: 'Lapis Resap Pengikat (Prime Coat Emulsi Aspal 0.8 Liter/m²)',
            category: 'III. PEKERJAAN PENGASPALAN HOTMIX',
            unit: 'liter',
            volume: primeCoatLiter,
            unitPrice: 24500,
            ahspCode: 'B.06.1.4',
            status: 'READY'
          },
          {
            id: `RAB-ASP-${Date.now()}-05`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: `Penghamparan Laston Lapis Aus (AC-WC) Tebal Padat ${(tebalAspal * 100).toFixed(0)} cm`,
            category: 'III. PEKERJAAN PENGASPALAN HOTMIX',
            unit: 'ton',
            volume: tonaseAspal,
            unitPrice: 1750000,
            ahspCode: 'B.06.1.1',
            status: 'READY'
          }
        ];
      }
    });

    // 3. RIGID CONCRETE ROAD
    TemplateResolver.templates.set('RIGID-CONCRETE-ROAD', {
      templateId: 'RIGID-CONCRETE-ROAD',
      name: 'Jalan Beton Semen (Rigid Pavement)',
      category: 'ROAD_AND_PAVEMENT',
      subCategory: 'ROAD',
      description: 'Perkerasan kaku beton mutu FS-45 / K-300 tebal 15-20 cm, Lean Concrete B0 5 cm, Wiremesh M8, Dowel, dan Sealant.',
      badge: 'Tahan Beban Berat',
      requiresEngineeringReview: false,
      requiredParameters: ['length', 'width', 'concrete_thickness', 'use_wiremesh'],
      optionalParameters: ['lc_thickness', 'location'],
      defaultValues: {
        length: 100,
        width: 4.0,
        concrete_thickness: 15,
        lc_thickness: 5,
        use_wiremesh: 'YES',
        location: 'Nasional Rata-Rata'
      },
      questions: [
        {
          id: 'length',
          type: 'unit_number',
          label: 'Panjang Ruas Jalan Beton',
          description: 'Panjang total segmen rigid pavement',
          unit: 'm',
          required: true,
          defaultValue: 100,
          validation: { min: 10, max: 100000 }
        },
        {
          id: 'width',
          type: 'unit_number',
          label: 'Lebar Lajur Beton',
          description: 'Lebar efektif perkerasan kaku',
          unit: 'm',
          required: true,
          defaultValue: 4.0,
          validation: { min: 2.0, max: 30.0 }
        },
        {
          id: 'concrete_thickness',
          type: 'single_select',
          label: 'Ketebalan Plat Beton Rigid',
          description: 'Tebal cor beton mutu FS-45 / K-300',
          required: true,
          defaultValue: '15',
          options: [
            { id: 'rigid_15cm', label: 'Tebal 15 cm (FS-45 / K-300) — Beban Sedang & Lingkungan', value: '15', nextStep: 'NEXT' },
            { id: 'rigid_20cm', label: 'Tebal 20 cm (FS-45 / K-350) — Beban Truk Muatan Penuh', value: '20', nextStep: 'NEXT' }
          ]
        },
        {
          id: 'use_wiremesh',
          type: 'single_select',
          label: 'Pembesian Wiremesh',
          description: 'Penggunaan tulangan susut wiremesh M8',
          required: true,
          defaultValue: 'YES',
          options: [
            { id: 'wm_yes', label: 'Gunakan Wiremesh M8 (1 Lapis Standar)', value: 'YES', nextStep: 'NEXT' },
            { id: 'wm_no', label: 'Tanpa Wiremesh (Beton Polos / Dowel Saja)', value: 'NO', nextStep: 'NEXT' }
          ]
        }
      ],
      generateRabItems: (params) => {
        const P = Number(params.length) || 100;
        const L = Number(params.width) || 4.0;
        const tRigid = (Number(params.concrete_thickness) || 15) / 100;
        const pakaiWm = params.use_wiremesh !== 'NO';

        const luas = SafeDecimalEngine.safeRound(P * L, 2);
        const volBetonRigid = SafeDecimalEngine.safeRound(luas * tRigid, 2);
        const volLeanConcrete = SafeDecimalEngine.safeRound(luas * 0.05, 2);
        const luasPlastik = SafeDecimalEngine.safeRound(luas * 1.10, 2);
        const lembarWm = pakaiWm ? Math.ceil((luas * 1.08) / 11.34) : 0;
        const pjgJoint = SafeDecimalEngine.safeRound(Math.floor(P / 5) * L, 2);

        return [
          {
            id: `RAB-RGD-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Penyiapan Badan Jalan dan Pemadatan Tanah Dasar',
            category: 'I. PEKERJAAN TANAH & SUBGRADE',
            unit: 'm2',
            volume: luas,
            unitPrice: 14500,
            ahspCode: 'B.01.1.1',
            status: 'READY'
          },
          {
            id: `RAB-RGD-${Date.now()}-02`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Lantai Kerja Beton Kurus Lean Concrete (B-0 / f\'c 10 MPa) Tebal 5 cm',
            category: 'II. PEKERJAAN LANTAI KERJA & MEMBRAN',
            unit: 'm3',
            volume: volLeanConcrete,
            unitPrice: 985000,
            ahspCode: 'B.05.1.3',
            status: 'READY'
          },
          {
            id: `RAB-RGD-${Date.now()}-03`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: 'Pemasangan Plastik Cor Pemisah (Polyethylene Sheet)',
            category: 'II. PEKERJAAN LANTAI KERJA & MEMBRAN',
            unit: 'm2',
            volume: luasPlastik,
            unitPrice: 8500,
            ahspCode: 'B.05.1.4',
            status: 'READY'
          },
          ...(pakaiWm
            ? [
                {
                  id: `RAB-RGD-${Date.now()}-04`,
                  itemNumber: '3.1',
                  wbsCode: '3.1',
                  description: 'Pemasangan Wiremesh Ulir M8 Standar SNI',
                  category: 'III. PEKERJAAN STRUKTUR BETON RIGID',
                  unit: 'lembar',
                  volume: lembarWm,
                  unitPrice: 425000,
                  ahspCode: 'B.05.1.5',
                  status: 'READY' as const
                }
              ]
            : []),
          {
            id: `RAB-RGD-${Date.now()}-05`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: `Pengecoran Perkerasan Jalan Beton Semen Mutu FS-45 / f'c 25 MPa Tebal ${(tRigid * 100).toFixed(0)} cm`,
            category: 'III. PEKERJAAN STRUKTUR BETON RIGID',
            unit: 'm3',
            volume: volBetonRigid,
            unitPrice: 1650000,
            ahspCode: 'B.05.1.1',
            status: 'READY'
          },
          {
            id: `RAB-RGD-${Date.now()}-06`,
            itemNumber: '4.1',
            wbsCode: '4.1',
            description: 'Pemotongan Sambungan Melintang (Joint Cutting) & Pengisian Sealant Aspal',
            category: 'IV. PEKERJAAN FINISHING & SAMBUNGAN',
            unit: 'm1',
            volume: pjgJoint,
            unitPrice: 38500,
            ahspCode: 'B.05.1.6',
            status: 'READY'
          }
        ];
      }
    });

    // 4. DRAIN OPEN UDITCH
    TemplateResolver.templates.set('DRAIN-OPEN-UDITCH', {
      templateId: 'DRAIN-OPEN-UDITCH',
      name: 'Saluran Drainase Precast U-Ditch',
      category: 'ROAD_AND_PAVEMENT',
      subCategory: 'DRAINAGE',
      description: 'Saluran drainase pracetak U-Ditch komplit galian, pasir alas 10 cm, tutup cover beton, dan perekat semen mortar.',
      badge: 'Drainase Standar',
      requiresEngineeringReview: false,
      requiredParameters: ['length', 'uditch_size', 'cover_type'],
      optionalParameters: ['location'],
      defaultValues: {
        length: 50,
        uditch_size: '40x40',
        cover_type: 'LIGHT_DUTY',
        location: 'Nasional Rata-Rata'
      },
      questions: [
        {
          id: 'length',
          type: 'unit_number',
          label: 'Panjang Saluran Drainase',
          description: 'Panjang total jalur saluran drainase',
          unit: 'm',
          required: true,
          defaultValue: 50,
          validation: { min: 2, max: 10000 }
        },
        {
          id: 'uditch_size',
          type: 'single_select',
          label: 'Ukuran Dimensi U-Ditch',
          description: 'Lebar x Tinggi penampang bersih saluran',
          required: true,
          defaultValue: '40x40',
          options: [
            { id: 'ud_30x30', label: 'U-Ditch 30x30 cm — Drainase Lingkungan Sempit', value: '30x30', nextStep: 'NEXT' },
            { id: 'ud_40x40', label: 'U-Ditch 40x40 cm — Standar Drainase Pemukiman & Jalan', value: '40x40', nextStep: 'NEXT' },
            { id: 'ud_60x60', label: 'U-Ditch 60x60 cm — Drainase Kolektor / Volume Sedang', value: '60x60', nextStep: 'NEXT' },
            { id: 'ud_80x80', label: 'U-Ditch 80x80 cm — Saluran Induk Debit Besar', value: '80x80', nextStep: 'NEXT' }
          ]
        },
        {
          id: 'cover_type',
          type: 'single_select',
          label: 'Tipe Penutup Cover',
          description: 'Jenis tutup beton pracetak di atas U-Ditch',
          required: true,
          defaultValue: 'LIGHT_DUTY',
          options: [
            { id: 'cov_light', label: 'Cover Light Duty (Trotoar / Pejalan Kaki & Motor)', value: 'LIGHT_DUTY', nextStep: 'NEXT' },
            { id: 'cov_heavy', label: 'Cover Heavy Duty (Beban Truk / Penyeberangan Mobil)', value: 'HEAVY_DUTY', nextStep: 'NEXT' },
            { id: 'cov_none', label: 'Saluran Terbuka (Tanpa Tutup Cover)', value: 'NONE', nextStep: 'NEXT' }
          ]
        }
      ],
      generateRabItems: (params) => {
        const P = Number(params.length) || 50;
        const size = params.uditch_size || '40x40';
        const coverType = params.cover_type || 'LIGHT_DUTY';

        let unitPriceBox = 345000;
        let unitPriceCover = 145000;
        let lebarLuar = 0.54;
        let tinggiLuar = 0.50;

        if (size === '30x30') {
          unitPriceBox = 275000;
          unitPriceCover = 115000;
          lebarLuar = 0.44;
          tinggiLuar = 0.40;
        } else if (size === '60x60') {
          unitPriceBox = 525000;
          unitPriceCover = 210000;
          lebarLuar = 0.76;
          tinggiLuar = 0.72;
        } else if (size === '80x80') {
          unitPriceBox = 785000;
          unitPriceCover = 325000;
          lebarLuar = 0.98;
          tinggiLuar = 0.94;
        }

        if (coverType === 'HEAVY_DUTY') {
          unitPriceCover = Math.round(unitPriceCover * 1.4);
        }

        const volGalian = SafeDecimalEngine.safeRound((lebarLuar + 0.3) * (tinggiLuar + 0.1) * P, 2);
        const volPasir = SafeDecimalEngine.safeRound((lebarLuar + 0.3) * 0.1 * P, 2);
        const jmlBox = Math.ceil(P / 1.20);
        const jmlCover = coverType !== 'NONE' ? Math.ceil(P / 0.60) : 0;

        return [
          {
            id: `RAB-UDT-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pengukuran dan Pembersihan Trase Saluran Drainase',
            category: 'I. PEKERJAAN PERSIAPAN & GALIAN',
            unit: 'm1',
            volume: P,
            unitPrice: 15000,
            ahspCode: 'B.01.1.1',
            status: 'READY'
          },
          {
            id: `RAB-UDT-${Date.now()}-02`,
            itemNumber: '1.2',
            wbsCode: '1.2',
            description: 'Galian Tanah Saluran Drainase & Perapian Dasar Galian',
            category: 'I. PEKERJAAN PERSIAPAN & GALIAN',
            unit: 'm3',
            volume: volGalian,
            unitPrice: 72500,
            ahspCode: 'B.01.1.2',
            status: 'READY'
          },
          {
            id: `RAB-UDT-${Date.now()}-03`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Hamparan Pasir Urug Alas Saluran Tebal 10 cm',
            category: 'II. PEKERJAAN DRAINASE PRECAST',
            unit: 'm3',
            volume: volPasir,
            unitPrice: 245000,
            ahspCode: 'A.2.3.1.11',
            status: 'READY'
          },
          {
            id: `RAB-UDT-${Date.now()}-04`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: `Pemasangan Box U-Ditch Precast ${size} cm (Panjang 1.20 m) + Spesi Nat Mortar`,
            category: 'II. PEKERJAAN DRAINASE PRECAST',
            unit: 'unit',
            volume: jmlBox,
            unitPrice: unitPriceBox,
            ahspCode: 'B.07.1.1',
            status: 'READY'
          },
          ...(coverType !== 'NONE'
            ? [
                {
                  id: `RAB-UDT-${Date.now()}-05`,
                  itemNumber: '2.3',
                  wbsCode: '2.3',
                  description: `Pemasangan Tutup Cover U-Ditch ${size} cm ${coverType === 'HEAVY_DUTY' ? 'Heavy Duty' : 'Light Duty'} (Panjang 0.60 m)`,
                  category: 'II. PEKERJAAN DRAINASE PRECAST',
                  unit: 'unit',
                  volume: jmlCover,
                  unitPrice: unitPriceCover,
                  ahspCode: 'B.07.1.2',
                  status: 'READY' as const
                }
              ]
            : [])
        ];
      }
    });
  }

  private static registerBuildingTemplates() {
    // =========================================================================
    // 1. TEMPLATE MASJID (BUILDING-MOSQUE)
    // =========================================================================
    const mosqueDef: TemplateDefinition = {
      templateId: 'BUILDING-MOSQUE',
      name: 'Masjid & Sarana Ibadah',
      category: 'BUILDING',
      subCategory: 'BUILDING_MOSQUE',
      description: 'Masjid dengan ruang sholat utama, serambi, fasilitas tempat wudhu terpisah, mihrab kaligrafi, dan pilihan kubah/atap.',
      badge: 'Sarana Ibadah',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'dome_type', 'roof_type', 'wudhu_facility', 'interior_mihrab'],
      optionalParameters: ['sound_system', 'location'],
      defaultValues: {
        building_area: 200,
        dome_type: 'KUBAH_ENAMEL',
        roof_type: 'GENTENG_TANAH_LIAT',
        wudhu_facility: 'WUDHU_LENGKAP',
        interior_mihrab: 'MIHRAB_GRC_MARMER',
        sound_system: 'SOUND_MASJID_LENGKAP',
        location: 'DKI_JAKARTA'
      },
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Bangunan Masjid',
          description: 'Luas total lantai ruang sholat dan serambi masjid',
          unit: 'm²',
          required: true,
          defaultValue: 200,
          validation: { min: 50, max: 3000 }
        },
        {
          id: 'dome_type',
          type: 'single_select',
          label: 'Tipe & Spesifikasi Kubah',
          description: 'Pilihan konstruksi dan material kubah utama masjid',
          required: true,
          defaultValue: 'KUBAH_ENAMEL',
          options: [
            { id: 'enamel', label: 'Kubah Panel Enamel Teflon Dekoratif', value: 'KUBAH_ENAMEL', nextStep: 'NEXT', description: 'Warna cerah tahan cuaca 20+ tahun, anti pudar, motif geometris islami' },
            { id: 'grc', label: 'Kubah GRC Cetak Krawangan Kaligrafi', value: 'KUBAH_GRC', nextStep: 'NEXT', description: 'Panel GRC bertulang dengan relief ornamen kaligrafi timbul' },
            { id: 'stainless', label: 'Kubah Stainless Steel Tradisional', value: 'KUBAH_STAINLESS', nextStep: 'NEXT', description: 'Ekonomis, anti karat, dan berbobot ringan' },
            { id: 'tanpa_kubah', label: 'Tanpa Kubah (Dak Beton Minimalis)', value: 'TANPA_KUBAH', nextStep: 'NEXT', description: 'Desain arsitektur masjid kontemporer modern / atap datar' }
          ]
        },
        {
          id: 'roof_type',
          type: 'single_select',
          label: 'Penutup Atap Masjid',
          description: 'Material penutup atap utama di luar area kubah',
          required: true,
          defaultValue: 'GENTENG_TANAH_LIAT',
          options: [
            { id: 'tanah_liat', label: 'Genteng Keramik / Tanah Liat Glasur Sejuk', value: 'GENTENG_TANAH_LIAT', nextStep: 'NEXT', description: 'Isolasi panas tinggi, membuat ruangan sholat lebih sejuk' },
            { id: 'dak_beton', label: 'Dak Beton Bertulang + Waterproofing Membran', value: 'DAK_BETON', nextStep: 'NEXT', description: 'Kuat, modern, dan dapat difungsikan untuk area outdoor serbaguna' },
            { id: 'genteng_metal', label: 'Rangka Baja Ringan + Genteng Metal Pasir', value: 'GENTENG_METAL', nextStep: 'NEXT', description: 'Ekonomis, bobot ringan, dan pemasangan cepat' }
          ]
        },
        {
          id: 'wudhu_facility',
          type: 'single_select',
          label: 'Fasilitas Tempat Wudhu & Sanitasi',
          description: 'Spesifikasi tempat wudhu pria, wanita, dan toilet',
          required: true,
          defaultValue: 'WUDHU_LENGKAP',
          options: [
            { id: 'wudhu_lengkap', label: 'Tempat Wudhu Terpisah Pria/Wanita + Keran Stainless + Bak Tandon', value: 'WUDHU_LENGKAP', nextStep: 'NEXT', description: 'Zonasi wudhu terpisah, keran wudhu stainless 1/2", bak penampung & drainase khusus' },
            { id: 'wudhu_standar', label: 'Tempat Wudhu Keramik Standar', value: 'WUDHU_STANDAR', nextStep: 'NEXT', description: 'Area wudhu standar keramik dinding dan lantai anti-selip' }
          ]
        },
        {
          id: 'interior_mihrab',
          type: 'single_select',
          label: 'Mihrab & Karpet Sajadah',
          description: 'Spesifikasi ornamen ruang imam & alas sholat',
          required: true,
          defaultValue: 'MIHRAB_GRC_MARMER',
          options: [
            { id: 'mihrab_mewah', label: 'Mihrab Marmer & Kaligrafi GRC + Karpet Sajadah Grade A (14mm)', value: 'MIHRAB_GRC_MARMER', nextStep: 'NEXT', description: 'Dinding mihrab marmer, ornamen kaligrafi GRC, dan karpet sajadah rajut tebal' },
            { id: 'mihrab_standar', label: 'Mihrab Cat Dekoratif & Karpet Sajadah Standar', value: 'MIHRAB_STANDAR', nextStep: 'NEXT', description: 'Dinding mihrab cat tekstur islami dan karpet roll standar' }
          ]
        },
        {
          id: 'sound_system',
          type: 'single_select',
          label: 'Sistem Pengeras Suara (Audio Sound)',
          description: 'Instalasi audio indoor & outdoor untuk adzan dan kajian',
          required: false,
          defaultValue: 'SOUND_MASJID_LENGKAP',
          options: [
            { id: 'sound_lengkap', label: '4 Horn Speaker Menara Luar TOA + 6 Column Speaker Akustik Indoor', value: 'SOUND_MASJID_LENGKAP', nextStep: 'NEXT', description: 'Amplifier mixer 240W, mic wireless imam, kabel audio anti-noise' },
            { id: 'sound_standar', label: '2 Horn Speaker Luar + 4 Column Speaker Dalam', value: 'SOUND_STANDAR', nextStep: 'NEXT', description: 'Sistem audio standar masjid' }
          ]
        },
        {
          id: 'location',
          type: 'single_select',
          label: 'Daerah / Wilayah Proyek',
          description: 'Penyesuaian indeks biaya material & upah (IKK) berdasarkan wilayah',
          required: false,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 200;
        const domeType = params.dome_type || 'KUBAH_ENAMEL';
        const roofType = params.roof_type || 'GENTENG_TANAH_LIAT';
        const reg = getRegionalFactor(params.location);
        const regionalMultiplier = reg.factor;

        const scale = area / 200;
        const linearScale = Math.sqrt(scale);
        const domeDiameter = Math.round(Math.max(3.0, 4.5 * linearScale) * 10) / 10;
        const luasAtap = Math.round(area * 1.35 * 10) / 10;
        const jumlahKeran = Math.max(8, Math.round(16 * scale));
        const luasKarpet = Math.round(area * 0.70 * 10) / 10;

        const items: RabItem[] = [
          // 01. PERSIAAPAN
          {
            id: `RAB-MSJ-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pembersihan Lahan dan Perataan Tapak Bangunan Masjid',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm2',
            volume: Math.round(area * 1.3),
            unitPrice: 18500,
            ahspCode: 'A.2.2.1.9',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-02`,
            itemNumber: '1.2',
            wbsCode: '1.2',
            description: 'Pengukuran dan Pemasangan Bowplank Penentuan Arah Kiblat & As Bangunan',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm1',
            volume: Math.round(linearScale * 65),
            unitPrice: 42000,
            ahspCode: 'A.2.2.1.4',
            status: 'READY'
          },
          // 02. TANAH DAN PONDASI
          {
            id: `RAB-MSJ-${Date.now()}-03`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Galian Tanah Pondasi Footplate (Cakar Ayam) & Pondasi Menerus Batu Kali',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.45 * 10) / 10,
            unitPrice: 85000,
            ahspCode: 'A.2.3.1.1',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-04`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: 'Pasangan Pondasi Batu Kali Campuran 1SP : 4PP Penyangga Dinding Keliling',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.28 * 10) / 10,
            unitPrice: 980000,
            ahspCode: 'A.3.2.1.2',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-05`,
            itemNumber: '2.3',
            wbsCode: '2.3',
            description: 'Pondasi Telapak Beton Bertulang Footplate K-250 Penopang Kolom Utama Kubah',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.12 * 10) / 10,
            unitPrice: 4200000,
            ahspCode: 'A.4.1.1.foot',
            status: 'READY'
          },
          // 03. STRUKTUR
          {
            id: `RAB-MSJ-${Date.now()}-06`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: 'Struktur Balok Sloof Beton Bertulang 20/30 Mutu K-250',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.08 * 10) / 10,
            unitPrice: 4850000,
            ahspCode: 'A.4.1.1.sloof',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-07`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: 'Kolom Utama Struktur Masjid 40/40 Mutu K-250 (Clear Height 5.0m)',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.14 * 10) / 10,
            unitPrice: 5600000,
            ahspCode: 'A.4.1.1.kolom',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-08`,
            itemNumber: '3.3',
            wbsCode: '3.3',
            description: 'Balok Ringbalk dan Balok Cincin Lingkar Penumpu Beban Kubah (Ring Dome)',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.09 * 10) / 10,
            unitPrice: 5350000,
            ahspCode: 'A.4.1.1.ring',
            status: 'READY'
          },
          // 04. DINDING
          {
            id: `RAB-MSJ-${Date.now()}-09`,
            itemNumber: '4.1',
            wbsCode: '4.1',
            description: 'Pasangan Dinding Bata Ringan (Hebel) Tebal 10cm Mortar Presisi',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(area * 1.8),
            unitPrice: 145000,
            ahspCode: 'A.4.4.1.1',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-10`,
            itemNumber: '4.2',
            wbsCode: '4.2',
            description: 'Plesteran Tebal 15mm Campuran 1SP:4PP dan Acian Semen Halus 2 Sisi',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(area * 3.6),
            unitPrice: 78000,
            ahspCode: 'A.4.4.2.1',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-11`,
            itemNumber: '4.3',
            wbsCode: '4.3',
            description: 'Ornamen Kaligrafi Dinding GRC Krawangan dan Marmer Area Mihrab Imam',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(18 * linearScale),
            unitPrice: 950000,
            ahspCode: 'A.4.4.3.GRC',
            status: 'READY'
          },
          // 05. LANTAI
          {
            id: `RAB-MSJ-${Date.now()}-12`,
            itemNumber: '5.1',
            wbsCode: '5.1',
            description: 'Pasang Lantai Granit Tile 60x60 cm Polished Ruang Utama Sholat',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: Math.round(area * 0.85),
            unitPrice: 285000,
            ahspCode: 'A.4.4.3.granit',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-13`,
            itemNumber: '5.2',
            wbsCode: '5.2',
            description: 'Pasang Lantai Keramik Anti-Slip 40x40 cm Area Wudhu dan Selasar',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: Math.round(area * 0.35),
            unitPrice: 195000,
            ahspCode: 'A.4.4.3.wudhu',
            status: 'READY'
          },
          // 06. ATAP & KUBAH
          {
            id: `RAB-MSJ-${Date.now()}-14`,
            itemNumber: '6.1',
            wbsCode: '6.1',
            description: `Pengadaan dan Pemasangan Kubah Utama Masjid (${domeType === 'KUBAH_ENAMEL' ? 'Panel Enamel Teflon Geometris' : domeType === 'KUBAH_GRC' ? 'Panel GRC Krawangan Kaligrafi' : 'Stainless Steel Tradisional'} D=${domeDiameter}m)`,
            category: '06. PEKERJAAN ATAP',
            unit: 'unit',
            volume: 1,
            unitPrice: domeType === 'KUBAH_ENAMEL' ? 45000000 * scale : domeType === 'KUBAH_GRC' ? 38000000 * scale : 22000000 * scale,
            ahspCode: 'A.4.2.KUB.01',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-15`,
            itemNumber: '6.2',
            wbsCode: '6.2',
            description: `Konstruksi Rangka Atap Baja Ringan & Penutup ${roofType === 'GENTENG_TANAH_LIAT' ? 'Genteng Keramik Tanah Liat Glasur Sejuk' : roofType === 'DAK_BETON' ? 'Dak Beton Waterproofing Membran' : 'Genteng Metal Pasir'}`,
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: luasAtap,
            unitPrice: roofType === 'GENTENG_TANAH_LIAT' ? 265000 : roofType === 'DAK_BETON' ? 320000 : 195000,
            ahspCode: 'A.4.2.1.atap',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-16`,
            itemNumber: '6.3',
            wbsCode: '6.3',
            description: 'Pasangan Nok Bubungan dan Talang Jurai Plat Seng BJLS 30 Anti Bocor',
            category: '06. PEKERJAAN ATAP',
            unit: 'm1',
            volume: Math.round(linearScale * 35),
            unitPrice: 125000,
            ahspCode: 'A.4.5.2.nok',
            status: 'READY'
          },
          // 07. KUSEN, PINTU, DAN JENDELA
          {
            id: `RAB-MSJ-${Date.now()}-17`,
            itemNumber: '7.1',
            wbsCode: '7.1',
            description: 'Pintu Utama Masjid Double Swing Kayu Jati Solid Ukir Kaligrafi Islami',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: 2,
            unitPrice: 6500000,
            ahspCode: 'A.4.6.1.pintu',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-18`,
            itemNumber: '7.2',
            wbsCode: '7.2',
            description: 'Kusen Aluminium 4 Inch Coklat / Hitam Anodized dan Jendela Kaca Bening 6mm',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'm1',
            volume: Math.round(linearScale * 48),
            unitPrice: 175000,
            ahspCode: 'A.4.6.2.jendela',
            status: 'READY'
          },
          // 08. PLAFON
          {
            id: `RAB-MSJ-${Date.now()}-19`,
            itemNumber: '8.1',
            wbsCode: '8.1',
            description: 'Plafon Gypsum Board 9mm Rangka Hollow Galvanis Drop Ceiling Dome Cove',
            category: '08. PEKERJAAN PLAFON',
            unit: 'm2',
            volume: Math.round(area * 0.9),
            unitPrice: 135000,
            ahspCode: 'A.4.5.1.plafon',
            status: 'READY'
          },
          // 09. INSTALASI LISTRIK & SOUND
          {
            id: `RAB-MSJ-${Date.now()}-20`,
            itemNumber: '9.1',
            wbsCode: '9.1',
            description: 'Lampu Gantung Utama Hias Kubah Masjid Desain Moroccan / Madinah',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'unit',
            volume: 1,
            unitPrice: 12500000,
            ahspCode: 'A.6.1.1.lampu_kubah',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-21`,
            itemNumber: '9.2',
            wbsCode: '9.2',
            description: 'Titik Lampu Downlight LED Recessed 18W Philips Ruang Sholat & Serambi',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.round(area * 0.18),
            unitPrice: 245000,
            ahspCode: 'A.6.1.1.downlight',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-22`,
            itemNumber: '9.3',
            wbsCode: '9.3',
            description: 'Paket Sound System Masjid (4 Horn Speaker Menara Luar TOA + 6 Column Speaker Indoor)',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'ls',
            volume: 1,
            unitPrice: 18500000,
            ahspCode: 'A.6.2.1.sound',
            status: 'READY'
          },
          // 10. SANITASI DAN WUDHU
          {
            id: `RAB-MSJ-${Date.now()}-23`,
            itemNumber: '10.1',
            wbsCode: '10.1',
            description: 'Kran Wudhu Stainless Steel 1/2 Inch Heavy Duty Anti Bocor',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'buah',
            volume: jumlahKeran,
            unitPrice: 125000,
            ahspCode: 'A.5.1.1.keran',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-24`,
            itemNumber: '10.2',
            wbsCode: '10.2',
            description: 'Instalasi Pipa Air Bersih PVC AW 3/4" & Saluran Pembuangan Air Wudhu PVC 3"',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'm1',
            volume: Math.round(linearScale * 55),
            unitPrice: 65000,
            ahspCode: 'A.5.1.1.pipa',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-25`,
            itemNumber: '10.3',
            wbsCode: '10.3',
            description: 'Kloset Jongkok & Duduk Keramik Standar TOTO pada Toilet Pria & Wanita',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'unit',
            volume: 4,
            unitPrice: 1850000,
            ahspCode: 'A.5.1.1.kloset',
            status: 'READY'
          },
          // 11. PENGECATAN
          {
            id: `RAB-MSJ-${Date.now()}-26`,
            itemNumber: '11.1',
            wbsCode: '11.1',
            description: 'Cat Dinding Interior Low-VOC Ramah Lingkungan dan Cat Luar Weathershield',
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'm2',
            volume: Math.round(area * 3.6),
            unitPrice: 48000,
            ahspCode: 'A.4.7.1.cat',
            status: 'READY'
          },
          // 12. EKSTERIOR
          {
            id: `RAB-MSJ-${Date.now()}-27`,
            itemNumber: '12.1',
            wbsCode: '12.1',
            description: 'Selasar Keliling Masjid, Paving Halaman Parkir K-300, dan Rak Penitipan Alas Kaki',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm2',
            volume: Math.round(area * 0.4),
            unitPrice: 175000,
            ahspCode: 'A.2.2.1.paving',
            status: 'READY'
          },
          // 13. FINISHING
          {
            id: `RAB-MSJ-${Date.now()}-28`,
            itemNumber: '13.1',
            wbsCode: '13.1',
            description: 'Pengadaan dan Pemasangan Karpet Sajadah Masjid Rajut Tebal 14mm Grade A',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'm2',
            volume: luasKarpet,
            unitPrice: 425000,
            ahspCode: 'A.8.1.1.karpet',
            status: 'READY'
          },
          {
            id: `RAB-MSJ-${Date.now()}-29`,
            itemNumber: '13.2',
            wbsCode: '13.2',
            description: 'Pembersihan Total Pasca Konstruksi dan Berita Acara Serah Terima (BAST)',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 1500000,
            ahspCode: 'A.8.1.3.1',
            status: 'READY'
          }
        ];

        if (regionalMultiplier !== 1.00) {
          for (const it of items) {
            it.unitPrice = Math.round(SafeDecimalEngine.safeMultiply(it.unitPrice, regionalMultiplier));
          }
        }

        return items;
      }
    };
    TemplateResolver.templates.set('BUILDING-MOSQUE', mosqueDef);
    TemplateResolver.templates.set('BUILDING_MOSQUE', mosqueDef);

    // =========================================================================
    // 2. TEMPLATE GUDANG STRUKTUR BAJA WF (BUILDING-WAREHOUSE)
    // =========================================================================
    const warehouseDef: TemplateDefinition = {
      templateId: 'BUILDING-WAREHOUSE',
      name: 'Gudang Struktur Baja WF',
      category: 'BUILDING',
      subCategory: 'BUILDING_WAREHOUSE',
      description: 'Gudang penyimpanan industri dengan portal Rangka Baja Wide Flange (WF), gording CNP / hollow galvanis, atap spandek insulasi, dan pelat lantai beton bertulang Finish Floor Hardener.',
      badge: 'Industri & Logistik',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'column_height', 'steel_structure', 'roof_type', 'floor_type'],
      optionalParameters: ['purlin_type', 'door_type', 'location'],
      defaultValues: {
        building_area: 500,
        column_height: 7,
        steel_structure: 'BAJA_WF_STANDARD',
        purlin_type: 'GORDING_CNP_HOLLOW',
        roof_type: 'SPANDEK_INSULASI',
        floor_type: 'BETON_WIRE_HARDENER',
        door_type: 'PINTU_SLIDING_HOLLOW',
        location: 'DKI_JAKARTA'
      },
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Bangunan Gudang',
          description: 'Luas total lantai area gudang logistik / workshop',
          unit: 'm²',
          required: true,
          defaultValue: 500,
          validation: { min: 100, max: 10000 }
        },
        {
          id: 'column_height',
          type: 'unit_number',
          label: 'Tinggi Kolom Bebas (Clear Height)',
          description: 'Tinggi tiang kolom baja dari lantai hingga dasar rafter kuda-kuda',
          unit: 'm',
          required: true,
          defaultValue: 7,
          validation: { min: 4, max: 15 }
        },
        {
          id: 'steel_structure',
          type: 'single_select',
          label: 'Rangka Struktur Baja Utama',
          description: 'Spesifikasi profil baja WF untuk kolom dan rafter kuda-kuda',
          required: true,
          defaultValue: 'BAJA_WF_STANDARD',
          options: [
            { id: 'wf_std', label: 'Kolom & Kuda-Kuda Baja WF 250 / WF 300 Standar SNI', value: 'BAJA_WF_STANDARD', nextStep: 'NEXT', description: 'Profil Baja Wide Flange SS400, baseplate tebal 16-20mm, baut HTB grade 8.8' },
            { id: 'wf_heavy', label: 'Kolom & Kuda-Kuda Baja WF 350 / WF 400 Heavy Duty Bentang Lebar', value: 'BAJA_WF_HEAVY', nextStep: 'NEXT', description: 'Profil Baja WF bentang lebar bebas kolom tengah > 20 meter' }
          ]
        },
        {
          id: 'purlin_type',
          type: 'single_select',
          label: 'Rangka Gording Atap & Dinding',
          description: 'Material gording atap dan pengaku rangka dinding',
          required: true,
          defaultValue: 'GORDING_CNP_HOLLOW',
          options: [
            { id: 'cnp_hollow', label: 'Gording Baja CNP Kanal C 150 & Rangka Hollow Galvanis 40x40 + Sagrod', value: 'GORDING_CNP_HOLLOW', nextStep: 'NEXT', description: 'Baja CNP 150x50x20x2.3 mm, rangka hollow pelindung cladding dinding, jarum keras tie rod' },
            { id: 'cnp_double', label: 'Gording Double CNP 150 Heavy Wind Load', value: 'GORDING_CNP_DOUBLE', nextStep: 'NEXT', description: 'Tahan terpaan angin kencang kawasan industri terbuka' }
          ]
        },
        {
          id: 'roof_type',
          type: 'single_select',
          label: 'Penutup Atap Gudang',
          description: 'Material atap spandek zincalume dan insulasi peredam',
          required: true,
          defaultValue: 'SPANDEK_INSULASI',
          options: [
            { id: 'spandek_insul', label: 'Atap Spandek Zincalume 0.40mm + Double Aluminium Foil / Glasswool', value: 'SPANDEK_INSULASI', nextStep: 'NEXT', description: 'Meredam panas terik matahari dan kebisingan hujan lebat di dalam gudang' },
            { id: 'spandek_std', label: 'Atap Spandek Zincalume 0.40mm Standar', value: 'SPANDEK_STANDAR', nextStep: 'NEXT', description: 'Atap zincalume standar tanpa insulasi termal' }
          ]
        },
        {
          id: 'floor_type',
          type: 'single_select',
          label: 'Lantai Kerja Beban Berat (Heavy Duty Floor)',
          description: 'Kapasitas daya dukung lantai beton terhadap lalu lintas forklift & armada truk',
          required: true,
          defaultValue: 'BETON_WIRE_HARDENER',
          options: [
            { id: 'hardener', label: 'Plat Beton K-300 Tebal 15cm + Wiremesh M8 2 Lapis + Finish Floor Hardener', value: 'BETON_WIRE_HARDENER', nextStep: 'NEXT', description: 'Permukaan anti-debu dan tahan gesekan roda forklift/truk muatan 10-20 ton' },
            { id: 'trowel', label: 'Plat Beton K-250 Tebal 12cm + Wiremesh M6 Trowel Finish', value: 'BETON_STANDAR', nextStep: 'NEXT', description: 'Untuk gudang barang ringan / packaging' }
          ]
        },
        {
          id: 'door_type',
          type: 'single_select',
          label: 'Pintu Masuk Armada Gudang',
          description: 'Tipe pintu akses truk tronton / kontainer',
          required: true,
          defaultValue: 'PINTU_SLIDING_HOLLOW',
          options: [
            { id: 'sliding_hollow', label: 'Pintu Geser Baja Rangka Hollow Cladding Spandek (Lebar 4m x Tinggi 5m)', value: 'PINTU_SLIDING_HOLLOW', nextStep: 'NEXT', description: 'Rangka hollow tebal 2.0mm, rel gantung industrial, kokoh dan minim perawatan' },
            { id: 'rolling_door', label: 'Rolling Door Baja Chain Block Heavy Duty', value: 'ROLLING_DOOR', nextStep: 'NEXT', description: 'Bahan slat baja galvanis sistem manual takel chain block' }
          ]
        },
        {
          id: 'location',
          type: 'single_select',
          label: 'Daerah / Wilayah Proyek',
          description: 'Penyesuaian indeks biaya material & upah (IKK) berdasarkan wilayah',
          required: false,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 500;
        const colHeight = Number(params.column_height) || 7;
        const reg = getRegionalFactor(params.location);
        const regionalMultiplier = reg.factor;

        const tonaseWfKg = Math.round(area * (colHeight > 8 ? 32 : 28));
        const gordingHollowKg = Math.round(area * 11);
        const tieRodKg = Math.round(area * 2.2);
        const luasAtapGudang = Math.round(area * 1.15 * 10) / 10;
        const volumeBetonLantai = Math.round(area * 0.15 * 10) / 10;
        const luasWiremesh = Math.round(area * 2);

        const items: RabItem[] = [
          // 01. PERSIAPAN
          {
            id: `RAB-GDG-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pembersihan dan Perataan Lahan Area Gudang dan Akses Manuver Truk',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm2',
            volume: Math.round(area * 1.4),
            unitPrice: 18500,
            ahspCode: 'A.2.2.1.9',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-02`,
            itemNumber: '1.2',
            wbsCode: '1.2',
            description: 'Pengukuran Theodolite, Patok As Kolom WF, dan Pemasangan Bowplank Presisi',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm1',
            volume: Math.round(Math.sqrt(area) * 8),
            unitPrice: 45000,
            ahspCode: 'A.2.2.1.4',
            status: 'READY'
          },
          // 02. TANAH DAN PONDASI
          {
            id: `RAB-GDG-${Date.now()}-03`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Galian Tanah Pondasi Telapak Pedestal Kolom Baja WF & Tie Beam',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.22 * 10) / 10,
            unitPrice: 85000,
            ahspCode: 'A.2.3.1.1',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-04`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: 'Urugan Pasir Bawah Pondasi dan Urugan Tanah Kembali Dipadatkan',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.12 * 10) / 10,
            unitPrice: 165000,
            ahspCode: 'A.2.3.1.11',
            status: 'READY'
          },
          // 03. STRUKTUR PEDESTAL
          {
            id: `RAB-GDG-${Date.now()}-05`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: 'Pondasi Telapak Beton Bertulang Footplate K-300 Penopang Kolom Baja WF',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.08 * 10) / 10,
            unitPrice: 4650000,
            ahspCode: 'A.4.1.1.foot',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-06`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: 'Kolom Pedestal Beton K-300 Lengkap dengan Angkur Baut Baja HTB Grade 8.8 Dia 22mm',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.05 * 10) / 10,
            unitPrice: 5200000,
            ahspCode: 'A.4.1.1.pedestal',
            status: 'READY'
          },
          // 04. DINDING & CLADDING
          {
            id: `RAB-GDG-${Date.now()}-07`,
            itemNumber: '4.1',
            wbsCode: '4.1',
            description: 'Pasangan Dinding Bata Ringan Bagian Bawah Setinggi 2.5m Plester dan Aci 2 Sisi',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(Math.sqrt(area) * 4 * 2.5),
            unitPrice: 220000,
            ahspCode: 'A.4.4.1.1',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-08`,
            itemNumber: '4.2',
            wbsCode: '4.2',
            description: 'Cladding Dinding Atas Lembar Zincalume Spandek 0.35mm Rangka Reng/Hollow',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(Math.sqrt(area) * 4 * (colHeight - 2.5)),
            unitPrice: 165000,
            ahspCode: 'A.4.4.3.clad',
            status: 'READY'
          },
          // 05. LANTAI BEBAN BERAT
          {
            id: `RAB-GDG-${Date.now()}-09`,
            itemNumber: '5.1',
            wbsCode: '5.1',
            description: 'Urugan Sirtu / Base Course Tebal 20 cm Dipadatkan Mesin Roller Tandem',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm3',
            volume: Math.round(area * 0.2),
            unitPrice: 245000,
            ahspCode: 'A.2.3.1.sirtu',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-10`,
            itemNumber: '5.2',
            wbsCode: '5.2',
            description: 'Plastik Cor Bawah Plat Lantai dan Pemasangan Wiremesh M8 Dua Lapis',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: luasWiremesh,
            unitPrice: 68000,
            ahspCode: 'A.4.1.1.wiremesh',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-11`,
            itemNumber: '5.3',
            wbsCode: '5.3',
            description: 'Pengecoran Plat Beton Lantai Mutu K-300 Tebal 15cm Menggunakan Concrete Pump',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm3',
            volume: volumeBetonLantai,
            unitPrice: 1450000,
            ahspCode: 'A.4.1.1.beton_k300',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-12`,
            itemNumber: '5.4',
            wbsCode: '5.4',
            description: 'Finishing Permukaan Lantai Floor Hardener Non-Metallic Konsumsi 5kg/m2 Trowel Finish',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: area,
            unitPrice: 58000,
            ahspCode: 'A.4.4.3.hardener',
            status: 'READY'
          },
          // 06. RANGKA BAJA WF & ATAP
          {
            id: `RAB-GDG-${Date.now()}-13`,
            itemNumber: '6.1',
            wbsCode: '6.1',
            description: 'Pengadaan, Fabrikasi, Erection, dan Pemasangan Struktur Baja Profil WF (Wide Flange)',
            category: '06. PEKERJAAN ATAP',
            unit: 'kg',
            volume: tonaseWfKg,
            unitPrice: 38500,
            ahspCode: 'A.4.2.1.WF',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-14`,
            itemNumber: '6.2',
            wbsCode: '6.2',
            description: 'Pemasangan Gording Baja CNP 150x50x20 dan Rangka Hollow Galvanis 40x40 Pengaku Rangka',
            category: '06. PEKERJAAN ATAP',
            unit: 'kg',
            volume: gordingHollowKg,
            unitPrice: 34500,
            ahspCode: 'A.4.2.1.CNP',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-15`,
            itemNumber: '6.3',
            wbsCode: '6.3',
            description: 'Ikatan Angin Batang Baja Tie Rod, Sagrod, Jarum Keras (Turnbuckle), dan Baut HTB',
            category: '06. PEKERJAAN ATAP',
            unit: 'kg',
            volume: tieRodKg,
            unitPrice: 42000,
            ahspCode: 'A.4.2.1.tierod',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-16`,
            itemNumber: '6.4',
            wbsCode: '6.4',
            description: 'Pemasangan Atap Spandek Zincalume 0.40mm Lengkap Double Aluminium Foil Insulasi',
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: luasAtapGudang,
            unitPrice: 185000,
            ahspCode: 'A.4.2.1.spandek',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-17`,
            itemNumber: '6.5',
            wbsCode: '6.5',
            description: 'Talang Jurai Air Hujan Plat Baja Galvanis Tebal 1.2mm Bentuk U Lebar 40cm',
            category: '06. PEKERJAAN ATAP',
            unit: 'm1',
            volume: Math.round(Math.sqrt(area) * 2),
            unitPrice: 225000,
            ahspCode: 'A.4.5.2.talang',
            status: 'READY'
          },
          // 07. PINTU SLIDING & VENTILASI
          {
            id: `RAB-GDG-${Date.now()}-18`,
            itemNumber: '7.1',
            wbsCode: '7.1',
            description: 'Pintu Geser Baja Industrial Rangka Hollow 50x100 Cladding Spandek (4.0m x 5.0m)',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: 2,
            unitPrice: 14500000,
            ahspCode: 'A.4.6.1.sliding',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-19`,
            itemNumber: '7.2',
            wbsCode: '7.2',
            description: 'Kisi-Kisi Ventilasi Udara Louver Aluminium Dinding Gudang Anti Air Hujan',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'm2',
            volume: Math.round(area * 0.05),
            unitPrice: 380000,
            ahspCode: 'A.4.6.2.louver',
            status: 'READY'
          },
          // 09. INSTALASI LISTRIK
          {
            id: `RAB-GDG-${Date.now()}-20`,
            itemNumber: '9.1',
            wbsCode: '9.1',
            description: 'Pemasangan Lampu High Bay LED Industrial Warehouse 100W IP65 Gantung',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.max(8, Math.round(area / 35)),
            unitPrice: 850000,
            ahspCode: 'A.6.1.1.highbay',
            status: 'READY'
          },
          {
            id: `RAB-GDG-${Date.now()}-21`,
            itemNumber: '9.2',
            wbsCode: '9.2',
            description: 'Panel Distribusi Daya 3 Phase, MCB Schneider, Stop Kontak Industrial & Pengkabelan',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'ls',
            volume: 1,
            unitPrice: 16500000,
            ahspCode: 'A.6.1.1.panel_gdg',
            status: 'READY'
          },
          // 10. PLAMBING
          {
            id: `RAB-GDG-${Date.now()}-22`,
            itemNumber: '10.1',
            wbsCode: '10.1',
            description: 'Pipa Talang Vertikal Air Hujan PVC AW 6 Inch dan Saluran Pembuangan ke Drainase',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'm1',
            volume: Math.round(colHeight * 8),
            unitPrice: 145000,
            ahspCode: 'A.5.1.1.talang_pvc',
            status: 'READY'
          },
          // 11. PENGECATAN ANTI KARAT
          {
            id: `RAB-GDG-${Date.now()}-23`,
            itemNumber: '11.1',
            wbsCode: '11.1',
            description: 'Pengecatan Primer Anti-Karat Zinkromate dan Cat Finishing Struktur Baja WF & Hollow',
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'kg',
            volume: tonaseWfKg + gordingHollowKg,
            unitPrice: 6500,
            ahspCode: 'A.4.7.1.cat_baja',
            status: 'READY'
          },
          // 12. EKSTERIOR & DRAINASE
          {
            id: `RAB-GDG-${Date.now()}-24`,
            itemNumber: '12.1',
            wbsCode: '12.1',
            description: 'Perkerasan Beton Tebal 20 cm Area Loading Dock Manuver Truk dan Saluran Drainase U-Ditch',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm2',
            volume: Math.round(area * 0.35),
            unitPrice: 385000,
            ahspCode: 'A.2.2.1.loading_dock',
            status: 'READY'
          },
          // 13. FINISHING
          {
            id: `RAB-GDG-${Date.now()}-25`,
            itemNumber: '13.1',
            wbsCode: '13.1',
            description: 'Pembersihan Puing Bekas Fabrikasi Baja, Uji Beban Lantai, dan BAST Proyek',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 2500000,
            ahspCode: 'A.8.1.3.1',
            status: 'READY'
          }
        ];

        if (regionalMultiplier !== 1.00) {
          for (const it of items) {
            it.unitPrice = Math.round(SafeDecimalEngine.safeMultiply(it.unitPrice, regionalMultiplier));
          }
        }

        return items;
      }
    };
    TemplateResolver.templates.set('BUILDING-WAREHOUSE', warehouseDef);
    TemplateResolver.templates.set('BUILDING_WAREHOUSE', warehouseDef);

    // =========================================================================
    // 3. TEMPLATE GEDUNG PARKIR KOMPOSIT BAJA WF (BUILDING-PARKING)
    // =========================================================================
    const parkingDef: TemplateDefinition = {
      templateId: 'BUILDING-PARKING',
      name: 'Gedung Parkir Bertingkat Baja WF',
      category: 'BUILDING',
      subCategory: 'BUILDING_PARKING',
      description: 'Gedung parkir bertingkat dengan sistem struktur komposit Baja Wide Flange (WF), pelat lantai Bondek beton K-300, ramp kendaraan anti-selip grooved, railing guardrail pengaman, dan marka slot parkir.',
      badge: 'Fasilitas Parkir',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'num_floors', 'steel_structure', 'ramp_type', 'parking_facilities'],
      optionalParameters: ['location'],
      defaultValues: {
        building_area: 1200,
        num_floors: 3,
        steel_structure: 'BAJA_WF_BONDEK',
        ramp_type: 'RAMP_GROOVED_SAFETY',
        parking_facilities: 'PARKING_FULL_FACILITY',
        location: 'DKI_JAKARTA'
      },
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Total Lantai Gedung Parkir',
          description: 'Akumulasi total luas lantai seluruh tingkat parkir',
          unit: 'm²',
          required: true,
          defaultValue: 1200,
          validation: { min: 300, max: 25000 }
        },
        {
          id: 'num_floors',
          type: 'unit_number',
          label: 'Jumlah Lantai Parkir',
          description: 'Jumlah tingkat lantai gedung parkir',
          required: true,
          defaultValue: 3,
          validation: { min: 2, max: 8 }
        },
        {
          id: 'steel_structure',
          type: 'single_select',
          label: 'Struktur Komposit Baja Utama',
          description: 'Sistem balok dan kolom baja komposit penahan beban kendaraan dinamis',
          required: true,
          defaultValue: 'BAJA_WF_BONDEK',
          options: [
            { id: 'wf_bondek', label: 'Kolom & Balok Baja WF + Shear Stud + Pelat Bondek 0.75mm + Wiremesh M8 Cor K-300', value: 'BAJA_WF_BONDEK', nextStep: 'NEXT', description: 'Struktur komposit baja WF mutu tinggi, bentang lebar tanpa banyak tiang' }
          ]
        },
        {
          id: 'ramp_type',
          type: 'single_select',
          label: 'Ramp Sirkulasi Kendaraan',
          description: 'Spesifikasi ramp antar lantai dan proteksi keamanan',
          required: true,
          defaultValue: 'RAMP_GROOVED_SAFETY',
          options: [
            { id: 'ramp_grooved', label: 'Ramp Beton Bertulang Alur Grooved Anti-Selip + Guardrail Railing Pipa Baja & Hollow', value: 'RAMP_GROOVED_SAFETY', nextStep: 'NEXT', description: 'Alur herringbone/grooved anti-tergelincir saat hujan, railing pipa baja dia 3" kokoh' }
          ]
        },
        {
          id: 'parking_facilities',
          type: 'single_select',
          label: 'Marka, Stopper & Proteksi Keselamatan',
          description: 'Kelengkapan rambu, marka jalan, dan proteksi benturan',
          required: true,
          defaultValue: 'PARKING_FULL_FACILITY',
          options: [
            { id: 'park_full', label: 'Marka Thermoplastic + Rubber Wheel Stopper + Rubber Corner Guard Kolom + Sprinkler', value: 'PARKING_FULL_FACILITY', nextStep: 'NEXT', description: 'Marka jalur & nomor lot parkir tahan gesekan ban, pengganjal roda karet, dan pelindung tiang reflektif' },
            { id: 'park_std', label: 'Marka Cat Biasa + Stopper Beton Standar', value: 'PARKING_STANDAR', nextStep: 'NEXT', description: 'Fasilitas standar ekonomis' }
          ]
        },
        {
          id: 'location',
          type: 'single_select',
          label: 'Daerah / Wilayah Proyek',
          description: 'Penyesuaian indeks biaya material & upah (IKK) berdasarkan wilayah',
          required: false,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 1200;
        const floors = Number(params.num_floors) || 3;
        const reg = getRegionalFactor(params.location);
        const regionalMultiplier = reg.factor;

        const tonaseWfParkir = Math.round(area * 38);
        const luasBondek = Math.round(area * ((floors - 1) / floors));
        const volumeCorLantai = Math.round(luasBondek * 0.12 * 10) / 10;
        const totalSlotParkir = Math.round(area / 28);

        const items: RabItem[] = [
          // 01. PERSIAPAN
          {
            id: `RAB-PRK-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pembersihan Lahan, Pengukuran Elevasi Topografi, dan Manajemen K3 Proyek Gedung',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm2',
            volume: Math.round(area / floors * 1.2),
            unitPrice: 22000,
            ahspCode: 'A.2.2.1.9',
            status: 'READY'
          },
          // 02. TANAH DAN PONDASI
          {
            id: `RAB-PRK-${Date.now()}-02`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Pondasi Bore Pile / Strauss Pile Dia 50cm & Pile Cap Beton Bertulang K-350',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.18 * 10) / 10,
            unitPrice: 5200000,
            ahspCode: 'A.4.1.1.borepile',
            status: 'READY'
          },
          // 03. STRUKTUR BAJA KOMPOSIT WF
          {
            id: `RAB-PRK-${Date.now()}-03`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: 'Pengadaan, Fabrikasi dan Erection Rangka Struktur Komposit Kolom dan Balok Baja WF',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'kg',
            volume: tonaseWfParkir,
            unitPrice: 39500,
            ahspCode: 'A.4.2.1.WF',
            status: 'READY'
          },
          {
            id: `RAB-PRK-${Date.now()}-04`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: 'Pemasangan Stud Shear Connector Dia 19mm Pengikat Balok Baja WF dan Pelat Lantai Beton',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'titik',
            volume: Math.round(area * 1.5),
            unitPrice: 32000,
            ahspCode: 'A.4.2.1.stud',
            status: 'READY'
          },
          // 05. LANTAI BONDEK
          {
            id: `RAB-PRK-${Date.now()}-05`,
            itemNumber: '5.1',
            wbsCode: '5.1',
            description: 'Pemasangan Floor Deck (Bondek) Galvanis Tebal 0.75mm Lantai Parkir Bertingkat',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: luasBondek,
            unitPrice: 175000,
            ahspCode: 'A.4.1.1.bondek',
            status: 'READY'
          },
          {
            id: `RAB-PRK-${Date.now()}-06`,
            itemNumber: '5.2',
            wbsCode: '5.2',
            description: 'Pemasangan Pembesian Wiremesh M8 Dua Lapis dan Pengecoran Plat Beton K-300 Tebal 12cm',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm3',
            volume: volumeCorLantai,
            unitPrice: 1950000,
            ahspCode: 'A.4.1.1.plat_parkir',
            status: 'READY'
          },
          // 06. RAMP SIRKULASI MOBIL
          {
            id: `RAB-PRK-${Date.now()}-07`,
            itemNumber: '6.1',
            wbsCode: '6.1',
            description: 'Konstruksi Ramp Sirkulasi Kendaraan Beton Bertulang K-350 Finishing Alur Grooved Anti-Selip',
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: (floors - 1) * 85,
            unitPrice: 780000,
            ahspCode: 'A.4.1.1.ramp',
            status: 'READY'
          },
          // 07. GUARDRAIL RAILING PENGAMAN
          {
            id: `RAB-PRK-${Date.now()}-08`,
            itemNumber: '7.1',
            wbsCode: '7.1',
            description: 'Pemasangan Guardrail Railing Pengaman Kendaraan Keliling Gedung Pipa Baja Dia 3" & Hollow Galvanis',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'm1',
            volume: Math.round(Math.sqrt(area / floors) * 4 * (floors - 1)),
            unitPrice: 650000,
            ahspCode: 'A.4.6.1.guardrail',
            status: 'READY'
          },
          // 09. PENERANGAN LAMPU & LISTRIK
          {
            id: `RAB-PRK-${Date.now()}-09`,
            itemNumber: '9.1',
            wbsCode: '9.1',
            description: 'Pemasangan Lampu Batten LED Weatherproof IP65 Hemat Energi 36W Nyala 24 Jam & Emergency Light',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.round(area / 20),
            unitPrice: 380000,
            ahspCode: 'A.6.1.1.batten_led',
            status: 'READY'
          },
          // 10. PROTEKSI KEBAKARAN
          {
            id: `RAB-PRK-${Date.now()}-10`,
            itemNumber: '10.1',
            wbsCode: '10.1',
            description: 'Instalasi Sistem Pemadam Kebakaran Pipa Sprinkler Baja Black Steel Sch 40 & Box Hydrant Gedung',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'titik',
            volume: Math.round(area / 25),
            unitPrice: 580000,
            ahspCode: 'A.5.1.1.sprinkler',
            status: 'READY'
          },
          // 11. PENGECATAN STRUKTUR BAJA
          {
            id: `RAB-PRK-${Date.now()}-11`,
            itemNumber: '11.1',
            wbsCode: '11.1',
            description: 'Pengecatan Proteksi Korosi Baja WF Primer Zinkromate & Topcoat Gloss Weather Resistant',
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'kg',
            volume: tonaseWfParkir,
            unitPrice: 6800,
            ahspCode: 'A.4.7.1.cat_wf',
            status: 'READY'
          },
          // 12. FASILITAS MARKA & STOPPER
          {
            id: `RAB-PRK-${Date.now()}-12`,
            itemNumber: '12.1',
            wbsCode: '12.1',
            description: 'Pengecatan Garis Marka Jalur dan Panah Arah Parkir Cat Thermoplastic Putih/Kuning Reflektif',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm2',
            volume: Math.round(totalSlotParkir * 5),
            unitPrice: 125000,
            ahspCode: 'A.2.2.1.marka_thermo',
            status: 'READY'
          },
          {
            id: `RAB-PRK-${Date.now()}-13`,
            itemNumber: '12.2',
            wbsCode: '12.2',
            description: 'Pemasangan Rubber Wheel Stopper Pengganjal Roda Mobil & Corner Guard Karet Pelindung Sudut Kolom',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'titik',
            volume: totalSlotParkir,
            unitPrice: 285000,
            ahspCode: 'A.2.2.1.stopper',
            status: 'READY'
          },
          // 13. FINISHING
          {
            id: `RAB-PRK-${Date.now()}-14`,
            itemNumber: '13.1',
            wbsCode: '13.1',
            description: 'Pembersihan Total Lantai Parkir, Uji Beban Kendaraan, dan BAST Serah Terima',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 3500000,
            ahspCode: 'A.8.1.3.1',
            status: 'READY'
          }
        ];

        if (regionalMultiplier !== 1.00) {
          for (const it of items) {
            it.unitPrice = Math.round(SafeDecimalEngine.safeMultiply(it.unitPrice, regionalMultiplier));
          }
        }

        return items;
      }
    };
    TemplateResolver.templates.set('BUILDING-PARKING', parkingDef);
    TemplateResolver.templates.set('BUILDING_PARKING', parkingDef);

    // =========================================================================
    // 4. TEMPLATE PASAR TRADISIONAL & MODERN (BUILDING-MARKET)
    // =========================================================================
    const marketDef: TemplateDefinition = {
      templateId: 'BUILDING-MARKET',
      name: 'Pasar Tradisional & Modern',
      category: 'BUILDING',
      subCategory: 'BUILDING_MARKET',
      description: 'Pasar rakyat / pasar modern dengan konstruksi portal rangka baja bentang lebar, los basah meja keramik dengan kran air tiap lapak, kios kering rolling door, serta drainase anti-bau dan perangkap lemak (grease trap).',
      badge: 'Pasar Komersial',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'market_structure', 'stall_type', 'drainage_type'],
      optionalParameters: ['location'],
      defaultValues: {
        building_area: 800,
        market_structure: 'PORTAL_BAJA_BENTANG_LEBAR',
        stall_type: 'LOS_BASAH_KERAMIK_KIOS',
        drainage_type: 'DRAINASE_GREASE_TRAP',
        location: 'DKI_JAKARTA'
      },
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Bangunan Pasar',
          description: 'Luas total lantai area perdagangan los dan kios pasar',
          unit: 'm²',
          required: true,
          defaultValue: 800,
          validation: { min: 200, max: 15000 }
        },
        {
          id: 'market_structure',
          type: 'single_select',
          label: 'Rangka Portal Struktur Pasar',
          description: 'Konstruksi portal atap bentang lebar untuk sirkulasi leluasa pedagang',
          required: true,
          defaultValue: 'PORTAL_BAJA_BENTANG_LEBAR',
          options: [
            { id: 'portal_baja', label: 'Portal Rangka Baja WF Bentang Lebar + Atap Spandek & Skylight Fiber', value: 'PORTAL_BAJA_BENTANG_LEBAR', nextStep: 'NEXT', description: 'Baja WF kokoh, minim tiang tengah, pencahayaan alami hemat listrik siang hari' }
          ]
        },
        {
          id: 'stall_type',
          type: 'single_select',
          label: 'Konfigurasi Meja Los & Kios Pedagang',
          description: 'Spesifikasi meja dagang los basah dan kios kering',
          required: true,
          defaultValue: 'LOS_BASAH_KERAMIK_KIOS',
          options: [
            { id: 'los_kios_lengkap', label: 'Meja Los Basah Pasangan Bata Meja Keramik + Kran Air + Kios Kering Rolling Door', value: 'LOS_BASAH_KERAMIK_KIOS', nextStep: 'NEXT', description: 'Meja beton lapis keramik higienis mudah dicuci, kran air leher angsa tiap los, kios rolling door' },
            { id: 'los_kering_only', label: 'Dominan Kios Kering Rolling Door & Partisi Rangka Baja', value: 'LOS_KERING_DOMINAN', nextStep: 'NEXT', description: 'Untuk pasar pakaian, elektronik, atau bahan kering' }
          ]
        },
        {
          id: 'drainage_type',
          type: 'single_select',
          label: 'Sistem Drainase & Pengolahan Limbah',
          description: 'Saluran pembuangan air kotor, pencegah bau, dan proteksi kebakaran',
          required: true,
          defaultValue: 'DRAINASE_GREASE_TRAP',
          options: [
            { id: 'drain_trap', label: 'Saluran Got Grill Besi Cor + Bak Perangkap Lemak (Grease Trap) & Hidran Pasar', value: 'DRAINASE_GREASE_TRAP', nextStep: 'NEXT', description: 'Got tertutup grill besi siku aman diinjak pembeli, penyaring lemak limbah ikan/daging, hidran pemadam' },
            { id: 'drain_std', label: 'Saluran Got Terbuka Plesteran Semen Standar', value: 'DRAINASE_STANDAR', nextStep: 'NEXT', description: 'Saluran drainase standar' }
          ]
        },
        {
          id: 'location',
          type: 'single_select',
          label: 'Daerah / Wilayah Proyek',
          description: 'Penyesuaian indeks biaya material & upah (IKK) berdasarkan wilayah',
          required: false,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 800;
        const reg = getRegionalFactor(params.location);
        const regionalMultiplier = reg.factor;

        const tonasePortalWf = Math.round(area * 26);
        const jumlahMejaLos = Math.round((area * 0.40) / 3.5);
        const jumlahKios = Math.round((area * 0.35) / 12);
        const panjangGot = Math.round(Math.sqrt(area) * 8);

        const items: RabItem[] = [
          // 01. PERSIAPAN
          {
            id: `RAB-PSR-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pembersihan Lahan, Pengukuran As Los & Kios Pasar, dan Pengadaan Air Kerja',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm2',
            volume: Math.round(area * 1.25),
            unitPrice: 18500,
            ahspCode: 'A.2.2.1.9',
            status: 'READY'
          },
          // 02. TANAH DAN PONDASI
          {
            id: `RAB-PSR-${Date.now()}-02`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Galian Tanah Pondasi Telapak Kolom Portal Baja dan Saluran Drainase Pasar',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.25 * 10) / 10,
            unitPrice: 85000,
            ahspCode: 'A.2.3.1.1',
            status: 'READY'
          },
          // 03. STRUKTUR PORTAL BAJA
          {
            id: `RAB-PSR-${Date.now()}-03`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: 'Pondasi Telapak Beton K-250 dan Kolom Pedestal Pengikat Portal Baja Bentang Lebar',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.07 * 10) / 10,
            unitPrice: 4850000,
            ahspCode: 'A.4.1.1.pedestal',
            status: 'READY'
          },
          {
            id: `RAB-PSR-${Date.now()}-04`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: 'Pengadaan dan Erection Portal Rangka Baja WF Bentang Lebar Bebas Tiang Tengah',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'kg',
            volume: tonasePortalWf,
            unitPrice: 38500,
            ahspCode: 'A.4.2.1.WF',
            status: 'READY'
          },
          // 04. MEJA LOS BASAH & KIOS
          {
            id: `RAB-PSR-${Date.now()}-05`,
            itemNumber: '4.1',
            wbsCode: '4.1',
            description: 'Pekerjaan Pasangan Meja Los Basah Beton Bertulang Lapis Keramik Meja Putih Higienis',
            category: '04. PEKERJAAN DINDING',
            unit: 'unit',
            volume: jumlahMejaLos,
            unitPrice: 1450000,
            ahspCode: 'A.4.4.3.meja_los',
            status: 'READY'
          },
          {
            id: `RAB-PSR-${Date.now()}-06`,
            itemNumber: '4.2',
            wbsCode: '4.2',
            description: 'Pasangan Dinding Bata Ringan Pembagi Kios Pedagang Plester dan Aci Halus',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(jumlahKios * 16),
            unitPrice: 195000,
            ahspCode: 'A.4.4.1.1',
            status: 'READY'
          },
          // 05. LANTAI PASAR
          {
            id: `RAB-PSR-${Date.now()}-07`,
            itemNumber: '5.1',
            wbsCode: '5.1',
            description: 'Pemasangan Keramik Lantai Heavy Duty Anti-Slip 40x40 cm Koridor Sirkulasi Pembeli',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: Math.round(area * 0.65),
            unitPrice: 195000,
            ahspCode: 'A.4.4.3.lantai_psr',
            status: 'READY'
          },
          // 06. ATAP & SKYLIGHT
          {
            id: `RAB-PSR-${Date.now()}-08`,
            itemNumber: '6.1',
            wbsCode: '6.1',
            description: 'Penutup Atap Spandek Zincalume 0.40mm dan Lembar Skylight Fiber Transparan Penerangan Alami',
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: Math.round(area * 1.15),
            unitPrice: 195000,
            ahspCode: 'A.4.2.1.spandek_skylight',
            status: 'READY'
          },
          // 07. ROLLING DOOR KIOS
          {
            id: `RAB-PSR-${Date.now()}-09`,
            itemNumber: '7.1',
            wbsCode: '7.1',
            description: 'Pengadaan dan Pemasangan Rolling Door Besi Harmonika / Slat Baja Kios Pedagang',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: jumlahKios,
            unitPrice: 2850000,
            ahspCode: 'A.4.6.1.rolling_psr',
            status: 'READY'
          },
          // 09. PENERANGAN LISTRIK
          {
            id: `RAB-PSR-${Date.now()}-10`,
            itemNumber: '9.1',
            wbsCode: '9.1',
            description: 'Titik Lampu Floodlight LED Gantung 50W Penerangan Pasar & Titik Daya Tiap Kios',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.round(area / 20),
            unitPrice: 320000,
            ahspCode: 'A.6.1.1.floodlight',
            status: 'READY'
          },
          // 10. SANITASI AIR LOS & GREASE TRAP
          {
            id: `RAB-PSR-${Date.now()}-11`,
            itemNumber: '10.1',
            wbsCode: '10.1',
            description: 'Pemasangan Kran Air Leher Angsa Stainless pada Setiap Meja Los Basah',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'buah',
            volume: jumlahMejaLos,
            unitPrice: 135000,
            ahspCode: 'A.5.1.1.kran_los',
            status: 'READY'
          },
          {
            id: `RAB-PSR-${Date.now()}-12`,
            itemNumber: '10.2',
            wbsCode: '10.2',
            description: 'Pekerjaan Bak Sedimentasi Pasir dan Grease Trap (Perangkap Lemak) Limbah Pasar',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'unit',
            volume: 2,
            unitPrice: 8500000,
            ahspCode: 'A.5.1.1.grease_trap',
            status: 'READY'
          },
          // 12. DRAINASE GRILL BESI & HIDRAN
          {
            id: `RAB-PSR-${Date.now()}-13`,
            itemNumber: '12.1',
            wbsCode: '12.1',
            description: 'Saluran Got Pasangan Bata Aci Kedap Air dengan Penutup Grating / Grill Besi Siku & Strip',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm1',
            volume: panjangGot,
            unitPrice: 285000,
            ahspCode: 'A.2.2.1.grating_got',
            status: 'READY'
          },
          {
            id: `RAB-PSR-${Date.now()}-14`,
            itemNumber: '12.2',
            wbsCode: '12.2',
            description: 'Pemasangan Pilar Hidran Kebakaran Pasar 2 Arah Lengkap Selang dan Nozzle',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'unit',
            volume: 2,
            unitPrice: 7500000,
            ahspCode: 'A.2.2.1.hidran',
            status: 'READY'
          },
          // 13. FINISHING
          {
            id: `RAB-PSR-${Date.now()}-15`,
            itemNumber: '13.1',
            wbsCode: '13.1',
            description: 'Pembersihan Akhir Proyek, Desinfeksi Sanitasi Pasar, dan BAST Serah Terima',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 2000000,
            ahspCode: 'A.8.1.3.1',
            status: 'READY'
          }
        ];

        if (regionalMultiplier !== 1.00) {
          for (const it of items) {
            it.unitPrice = Math.round(SafeDecimalEngine.safeMultiply(it.unitPrice, regionalMultiplier));
          }
        }

        return items;
      }
    };
    TemplateResolver.templates.set('BUILDING-MARKET', marketDef);
    TemplateResolver.templates.set('BUILDING_MARKET', marketDef);

    // =========================================================================
    // 5. TEMPLATE GEDUNG PERKANTORAN MODERN (BUILDING-OFFICE)
    // =========================================================================
    const officeDef: TemplateDefinition = {
      templateId: 'BUILDING-OFFICE',
      name: 'Gedung Perkantoran Modern',
      category: 'BUILDING',
      subCategory: 'BUILDING_OFFICE',
      description: 'Gedung perkantoran bertingkat dengan lantai tinggi (floor-to-floor 4.0m), pilihan material lampu LED downlight / troffer panel, stop kontak Schneider & pop-up floor outlet lantai, serta opsi cat interior premium low-VOC.',
      badge: 'Komersial & Bisnis',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'num_floors', 'floor_height', 'lighting_type', 'electrical_outlet', 'paint_type'],
      optionalParameters: ['roof_type', 'partition_type', 'location'],
      defaultValues: {
        building_area: 600,
        num_floors: 3,
        floor_height: 4.0,
        roof_type: 'DAK_BETON_ROOFTOP',
        lighting_type: 'DOWNLIGHT_LED',
        electrical_outlet: 'SCHNEIDER_FLOOR_OUTLET',
        paint_type: 'CAT_PREMIUM_LOW_VOC',
        partition_type: 'GYPSUM_KACA_TEMPERED',
        location: 'DKI_JAKARTA'
      },
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Total Bangunan Kantor',
          description: 'Akumulasi total luas seluruh lantai gedung perkantoran',
          unit: 'm²',
          required: true,
          defaultValue: 600,
          validation: { min: 150, max: 20000 }
        },
        {
          id: 'num_floors',
          type: 'unit_number',
          label: 'Jumlah Lantai Kantor',
          description: 'Jumlah tingkat lantai gedung',
          required: true,
          defaultValue: 3,
          validation: { min: 2, max: 12 }
        },
        {
          id: 'floor_height',
          type: 'unit_number',
          label: 'Tinggi Antar Lantai (Floor-to-Floor Height)',
          description: 'Karakteristik gedung kantor (typical 3.8m - 4.2m) untuk ruang ducting ME & plafon',
          unit: 'm',
          required: true,
          defaultValue: 4.0,
          validation: { min: 3.5, max: 5.0, step: 0.1 }
        },
        {
          id: 'roof_type',
          type: 'single_select',
          label: 'Konstruksi Atap Gedung Kantor',
          description: 'Pilihan atap fleksibel sesuai kebutuhan fungsional rooftop',
          required: true,
          defaultValue: 'DAK_BETON_ROOFTOP',
          options: [
            { id: 'dak_rooftop', label: 'Dak Beton Bertulang + Waterproofing Membran Bakar (Area Rooftop / AC Chiller)', value: 'DAK_BETON_ROOFTOP', nextStep: 'NEXT', description: 'Kuat untuk dudukan unit chiller AC outdoor & area gathering karyawan' },
            { id: 'spandek_parapet', label: 'Atap Spandek Rangka Baja Ringan Tersembunyi Dinding Parapet', value: 'SPANDEK_PARAPET', nextStep: 'NEXT', description: 'Ekonomis, tidak tampak dari jalan karena tertutup dinding parapet' },
            { id: 'genteng_keramik', label: 'Rangka Baja Ringan + Genteng Keramik Glazur Tropis', value: 'GENTENG_KERAMIK', nextStep: 'NEXT', description: 'Bernuansa arsitektur tropis elegan' }
          ]
        },
        {
          id: 'lighting_type',
          type: 'single_select',
          label: 'Pilihan Material Lampu & Pencahayaan',
          description: 'Tipe fixture lampu hemat energi untuk ruang kerja kantor',
          required: true,
          defaultValue: 'DOWNLIGHT_LED',
          options: [
            { id: 'downlight', label: 'Lampu Downlight LED Recessed 15W-18W Philips / Panasonic (Elegan & Modern)', value: 'DOWNLIGHT_LED', nextStep: 'NEXT', description: 'Pencahayaan rata, glare-free, tampilan plafon minimalis modern' },
            { id: 'troffer', label: 'Lampu Panel LED Troffer 60x60 cm 36W (Standar Ruang Plafon Akustik Grid)', value: 'TROFFER_PANEL_60X60', nextStep: 'NEXT', description: 'Sangat cocok untuk plafon akustik Armstrong, pencahayaan kerja optimal' },
            { id: 'tube_linear', label: 'Lampu Tube LED Linear Hanging T5/T8 (Desain Kreatif Industrial)', value: 'TUBE_LED_LINEAR', nextStep: 'NEXT', description: 'Aksen gantung modern untuk ruang kerja startup / creative agency' }
          ]
        },
        {
          id: 'electrical_outlet',
          type: 'single_select',
          label: 'Pilihan Stop Kontak & Distribusi Daya',
          description: 'Material stop kontak dinding dan lantai ruang kerja meja open-plan',
          required: true,
          defaultValue: 'SCHNEIDER_FLOOR_OUTLET',
          options: [
            { id: 'schneider_floor', label: 'Stop Kontak Dinding Schneider + Pop-Up Floor Outlet (Stop Kontak Lantai Baja) & Cable Tray', value: 'SCHNEIDER_FLOOR_OUTLET', nextStep: 'NEXT', description: 'Stop kontak dinding Schneider AvatarOn/Vivace + outlet lantai pop-up meja kerja & kabel tray' },
            { id: 'standar_wall', label: 'Stop Kontak Dinding Standar Panasonic Pro', value: 'STANDAR_WALL_OUTLET', nextStep: 'NEXT', description: 'Stop kontak dinding standar tanpa floor outlet' }
          ]
        },
        {
          id: 'paint_type',
          type: 'single_select',
          label: 'Pilihan Spesifikasi Cat',
          description: 'Standar kualitas cat interior dan eksterior gedung kantor',
          required: true,
          defaultValue: 'CAT_PREMIUM_LOW_VOC',
          options: [
            { id: 'cat_low_voc', label: 'Cat Interior Ramah Lingkungan Low-VOC (Dulux Pentalite / Mowilex) + Exterior Weathershield', value: 'CAT_PREMIUM_LOW_VOC', nextStep: 'NEXT', description: 'Tidak berbau tajam, aman kesehatan karyawan, exterior tahan cuaca 8-10 tahun' },
            { id: 'cat_standar', label: 'Cat Interior Kantor Standar Pro (Catylac / Vinilex Pro)', value: 'CAT_STANDAR_INTERIOR', nextStep: 'NEXT', description: 'Standar ekonomis proyek komersial' }
          ]
        },
        {
          id: 'partition_type',
          type: 'single_select',
          label: 'Partisi Ruangan & Plafon',
          description: 'Material sekat ruangan kantor dan plafon peredam suara',
          required: false,
          defaultValue: 'GYPSUM_KACA_TEMPERED',
          options: [
            { id: 'partisi_kaca', label: 'Plafon Gypsum/Akustik + Partisi Gypsum Hollow 2 Sisi + Partisi Kaca Tempered 10mm Ruang Meeting', value: 'GYPSUM_KACA_TEMPERED', nextStep: 'NEXT', description: 'Partisi gypsum peredam suara double side + kaca tempered frameless modern untuk ruang meeting' },
            { id: 'partisi_std', label: 'Partisi Gypsum Standar Rangka Hollow Galvanis', value: 'GYPSUM_STANDAR', nextStep: 'NEXT', description: 'Partisi gypsum standar' }
          ]
        },
        {
          id: 'location',
          type: 'single_select',
          label: 'Daerah / Wilayah Proyek',
          description: 'Penyesuaian indeks biaya material & upah (IKK) berdasarkan wilayah',
          required: false,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 600;
        const floors = Number(params.num_floors) || 3;
        const floorHeight = Number(params.floor_height) || 4.0;
        const lighting = params.lighting_type || 'DOWNLIGHT_LED';
        const hasFloorOutlet = params.electrical_outlet === 'SCHNEIDER_FLOOR_OUTLET';
        const isLowVoc = params.paint_type === 'CAT_PREMIUM_LOW_VOC';
        const reg = getRegionalFactor(params.location);
        const regionalMultiplier = reg.factor;

        const luasPerLantai = area / floors;
        const volumeBetonStruktur = Math.round(area * 0.32 * 10) / 10;
        const luasPartisiGypsum = Math.round(area * 0.75);
        const luasPartisiKaca = Math.round(area * 0.08);
        const jumlahLampu = Math.round(area / 8);
        const jumlahStopKontakLantai = hasFloorOutlet ? Math.round(area / 18) : 0;

        const items: RabItem[] = [
          // 01. PERSIAPAN
          {
            id: `RAB-OFC-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pembersihan Lahan, Pemagaran Seng Proyek, dan Fasilitas Kantor Direksi Keet K3',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm2',
            volume: Math.round(luasPerLantai * 1.3),
            unitPrice: 28000,
            ahspCode: 'A.2.2.1.9',
            status: 'READY'
          },
          // 02. TANAH DAN PONDASI
          {
            id: `RAB-OFC-${Date.now()}-02`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Pondasi Tiang Pancang / Bore Pile Dia 40cm Kedalaman 12m & Pile Cap Beton K-350',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.16 * 10) / 10,
            unitPrice: 5400000,
            ahspCode: 'A.4.1.1.borepile',
            status: 'READY'
          },
          // 03. STRUKTUR BETON BERTULANG LANTAI TINGGI
          {
            id: `RAB-OFC-${Date.now()}-03`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: `Kolom Beton Bertulang 40/40 Mutu K-300 Floor-to-Floor Height ${floorHeight}m`,
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.11 * (floorHeight / 3.5) * 10) / 10,
            unitPrice: 5850000,
            ahspCode: 'A.4.1.1.kolom_kantor',
            status: 'READY'
          },
          {
            id: `RAB-OFC-${Date.now()}-04`,
            itemNumber: '3.2',
            wbsCode: '3.2',
            description: 'Balok Induk 30/60 dan Balok Anak 25/40 Beton Bertulang K-300',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.12 * 10) / 10,
            unitPrice: 5650000,
            ahspCode: 'A.4.1.1.balok',
            status: 'READY'
          },
          {
            id: `RAB-OFC-${Date.now()}-05`,
            itemNumber: '3.3',
            wbsCode: '3.3',
            description: 'Plat Lantai Beton Bertulang Tebal 12cm Mutu K-300 Lantai Bertingkat',
            category: '03. PEKERJAAN STRUKTUR',
            unit: 'm3',
            volume: Math.round(area * 0.12 * ((floors - 1) / floors) * 10) / 10,
            unitPrice: 5200000,
            ahspCode: 'A.4.1.1.plat_lantai',
            status: 'READY'
          },
          // 04. DINDING & PARTISI KANTOR
          {
            id: `RAB-OFC-${Date.now()}-06`,
            itemNumber: '4.1',
            wbsCode: '4.1',
            description: 'Dinding Keliling Bata Ringan Hebel 10cm Plester Aci 2 Sisi Cat Finishing',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(Math.sqrt(luasPerLantai) * 4 * floorHeight * floors * 0.7),
            unitPrice: 215000,
            ahspCode: 'A.4.4.1.1',
            status: 'READY'
          },
          {
            id: `RAB-OFC-${Date.now()}-07`,
            itemNumber: '4.2',
            wbsCode: '4.2',
            description: 'Partisi Gypsum Board 9mm Rangka Hollow Galvanis Double Side Peredam Suara Ruang Kerja',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: luasPartisiGypsum,
            unitPrice: 195000,
            ahspCode: 'A.4.4.3.partisi_gyp',
            status: 'READY'
          },
          {
            id: `RAB-OFC-${Date.now()}-08`,
            itemNumber: '4.3',
            wbsCode: '4.3',
            description: 'Partisi Kaca Tempered 10mm Frameless Ruang Meeting & Ruang Pimpinan',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: luasPartisiKaca,
            unitPrice: 850000,
            ahspCode: 'A.4.6.2.kaca_tempered',
            status: 'READY'
          },
          // 05. LANTAI KANTOR
          {
            id: `RAB-OFC-${Date.now()}-09`,
            itemNumber: '5.1',
            wbsCode: '5.1',
            description: 'Pasang Lantai Granit Homogeneous Tile 60x60 cm Polished Nano Anti-Gores Ruang Kantor',
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: Math.round(area * 0.9),
            unitPrice: 295000,
            ahspCode: 'A.4.4.3.granit_ht',
            status: 'READY'
          },
          // 06. ATAP DAK BETON ROOFTOP
          {
            id: `RAB-OFC-${Date.now()}-10`,
            itemNumber: '6.1',
            wbsCode: '6.1',
            description: 'Plat Dak Beton Rooftop K-300 Tebal 12cm + Waterproofing Membran Bakar Torching System 3mm',
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: Math.round(luasPerLantai),
            unitPrice: 385000,
            ahspCode: 'A.4.5.2.dak_waterproofing',
            status: 'READY'
          },
          // 07. PINTU KACA & KUSEN
          {
            id: `RAB-OFC-${Date.now()}-11`,
            itemNumber: '7.1',
            wbsCode: '7.1',
            description: 'Pintu Kaca Tempered 12mm Frameless Floor Hinge Dorong Dorma + Handle Stainless 40cm',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: Math.max(4, Math.round(floors * 2)),
            unitPrice: 5800000,
            ahspCode: 'A.4.6.1.pintu_kaca',
            status: 'READY'
          },
          // 08. PLAFON KANTOR
          {
            id: `RAB-OFC-${Date.now()}-12`,
            itemNumber: '8.1',
            wbsCode: '8.1',
            description: 'Plafon Akustik Mineral Fiber Board Grid 60x60 / Plafon Gypsum Rangka Hollow Galvanis',
            category: '08. PEKERJAAN PLAFON',
            unit: 'm2',
            volume: Math.round(area * 0.9),
            unitPrice: 165000,
            ahspCode: 'A.4.5.1.plafon_akustik',
            status: 'READY'
          },
          // 09. INSTALASI LISTRIK, LAMPU & STOP KONTAK
          {
            id: `RAB-OFC-${Date.now()}-13`,
            itemNumber: '9.1',
            wbsCode: '9.1',
            description: `Pemasangan ${lighting === 'DOWNLIGHT_LED' ? 'Lampu Downlight LED Recessed 18W Philips / Panasonic' : lighting === 'TROFFER_PANEL_60X60' ? 'Lampu Panel LED Troffer 60x60 cm 36W Plafon Akustik' : 'Lampu Tube LED Linear Hanging T5/T8 Modern'}`,
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: jumlahLampu,
            unitPrice: lighting === 'TROFFER_PANEL_60X60' ? 385000 : 265000,
            ahspCode: 'A.6.1.1.lampu_kantor',
            status: 'READY'
          },
          {
            id: `RAB-OFC-${Date.now()}-14`,
            itemNumber: '9.2',
            wbsCode: '9.2',
            description: 'Pemasangan Stop Kontak Dinding Merk Schneider / Panasonic & Saklar Listrik Standard Pro',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.round(area / 12),
            unitPrice: 195000,
            ahspCode: 'A.6.1.1.stopkontak_schneider',
            status: 'READY'
          },
          ...(hasFloorOutlet
            ? [
                {
                  id: `RAB-OFC-${Date.now()}-15`,
                  itemNumber: '9.3',
                  wbsCode: '9.3',
                  description: 'Pemasangan Pop-Up Floor Outlet (Stop Kontak Lantai Kuningan/Stainless) Meja Open-Plan & Kabel Tray Bawah Lantai',
                  category: '09. PEKERJAAN INSTALASI LISTRIK',
                  unit: 'titik',
                  volume: jumlahStopKontakLantai,
                  unitPrice: 580000,
                  ahspCode: 'A.6.1.1.floor_outlet',
                  status: 'READY' as const
                }
              ]
            : []),
          // 10. SANITASI TOILET EKSEKUTIF
          {
            id: `RAB-OFC-${Date.now()}-16`,
            itemNumber: '10.1',
            wbsCode: '10.1',
            description: 'Toilet Kantor Lengkap (Kloset Duduk Eco Washer TOTO, Wastafel Meja Marmer & Partisi Cubicle)',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'unit',
            volume: floors * 2,
            unitPrice: 5500000,
            ahspCode: 'A.5.1.1.toilet_kantor',
            status: 'READY'
          },
          // 11. PENGECATAN PREMIUM
          {
            id: `RAB-OFC-${Date.now()}-17`,
            itemNumber: '11.1',
            wbsCode: '11.1',
            description: `Pengecatan ${isLowVoc ? 'Interior Cat Premium Ramah Lingkungan Low-VOC (Dulux Pentalite / Mowilex) + Exterior Weathershield Tahan Cuaca' : 'Interior Cat Standar Pro Vinilex / Catylac'}`,
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'm2',
            volume: Math.round(area * 2.8),
            unitPrice: isLowVoc ? 58000 : 42000,
            ahspCode: 'A.4.7.1.cat_low_voc',
            status: 'READY'
          },
          // 12. FASILITAS LUAR
          {
            id: `RAB-OFC-${Date.now()}-18`,
            itemNumber: '12.1',
            wbsCode: '12.1',
            description: 'Selasar Lobby Masuk Kaca Frameless, Drop-Off Kendaraan Paving K-350, dan Taman Tropis',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm2',
            volume: Math.round(luasPerLantai * 0.35),
            unitPrice: 285000,
            ahspCode: 'A.2.2.1.lobby_ext',
            status: 'READY'
          },
          // 13. FINISHING
          {
            id: `RAB-OFC-${Date.now()}-19`,
            itemNumber: '13.1',
            wbsCode: '13.1',
            description: 'Deep Cleaning Pasca Konstruksi, Testing & Commissioning Kelistrikan, dan BAST Serah Terima',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 4000000,
            ahspCode: 'A.8.1.3.1',
            status: 'READY'
          }
        ];

        if (regionalMultiplier !== 1.00) {
          for (const it of items) {
            it.unitPrice = Math.round(SafeDecimalEngine.safeMultiply(it.unitPrice, regionalMultiplier));
          }
        }

        return items;
      }
    };
    TemplateResolver.templates.set('BUILDING-OFFICE', officeDef);
    TemplateResolver.templates.set('BUILDING_OFFICE', officeDef);

    // =========================================================================
    // 6. TEMPLATE BANGUNAN CUSTOM (BUILDING-CUSTOM)
    // =========================================================================
    const customBuildingDef: TemplateDefinition = {
      templateId: 'BUILDING-CUSTOM',
      name: 'Bangunan Custom (Spesifikasi Bebas)',
      category: 'BUILDING',
      subCategory: 'BUILDING_CUSTOM',
      description: 'Gedung dengan spesifikasi bebas tanpa terikat template baku. Pengguna dapat menentukan luas, lantai, tinggi, tipe struktur, atap, finishing, dan lokasi daerah.',
      badge: 'Bebas Kustom',
      requiresEngineeringReview: false,
      requiredParameters: ['building_area', 'num_floors', 'structure_type', 'roof_type', 'quality_level'],
      optionalParameters: ['floor_height', 'location'],
      defaultValues: {
        building_area: 100,
        num_floors: 1,
        floor_height: 3.5,
        structure_type: 'BETON_BERTULANG',
        roof_type: 'SPANDEK_GENTENG',
        quality_level: 'MENENGAH',
        location: 'DKI_JAKARTA'
      },
      questions: [
        {
          id: 'building_area',
          type: 'unit_number',
          label: 'Luas Bangunan Total',
          description: 'Luas lantai akumulatif yang direncanakan',
          unit: 'm²',
          required: true,
          defaultValue: 100,
          validation: { min: 20, max: 50000 }
        },
        {
          id: 'num_floors',
          type: 'unit_number',
          label: 'Jumlah Lantai Bangunan',
          description: 'Jumlah tingkat lantai gedung',
          required: true,
          defaultValue: 1,
          validation: { min: 1, max: 20 }
        },
        {
          id: 'floor_height',
          type: 'unit_number',
          label: 'Tinggi per Lantai (Floor Height)',
          description: 'Tinggi lantai ke plafon / balok atas',
          unit: 'm',
          required: false,
          defaultValue: 3.5,
          validation: { min: 2.8, max: 6.0, step: 0.1 }
        },
        {
          id: 'structure_type',
          type: 'single_select',
          label: 'Tipe Struktur Utama',
          description: 'Pilihan material penahan beban struktur',
          required: true,
          defaultValue: 'BETON_BERTULANG',
          options: [
            { id: 'beton', label: 'Struktur Beton Bertulang Konvensional SNI', value: 'BETON_BERTULANG', nextStep: 'NEXT', description: 'Kombinasi footplate/tiang pancang, sloof, kolom & balok beton K-250/K-300' },
            { id: 'wf', label: 'Struktur Rangka Baja Profil Wide Flange (WF)', value: 'BAJA_WF', nextStep: 'NEXT', description: 'Rangka portal baja WF cepat bangun untuk bentang leluasa' },
            { id: 'ringan', label: 'Struktur Rangka Baja Ringan / Prefab', value: 'BAJA_RINGAN', nextStep: 'NEXT', description: 'Ekonomis dan cocok untuk bangunan ringan 1 lantai' }
          ]
        },
        {
          id: 'roof_type',
          type: 'single_select',
          label: 'Tipe Penutup Atap',
          description: 'Material pelindung atap bangunan',
          required: true,
          defaultValue: 'SPANDEK_GENTENG',
          options: [
            { id: 'atap_spandek', label: 'Rangka Baja Ringan + Atap Genteng Metal / Spandek Zincalume', value: 'SPANDEK_GENTENG', nextStep: 'NEXT', description: 'Paling populer, ekonomis dan anti bocor' },
            { id: 'atap_dak', label: 'Dak Beton Bertulang + Waterproofing Membran Bakar', value: 'DAK_BETON', nextStep: 'NEXT', description: 'Bisa difungsikan untuk rooftop outdoor' }
          ]
        },
        {
          id: 'quality_level',
          type: 'single_select',
          label: 'Kelas Kualitas Finishing',
          description: 'Standar material lantai, cat dinding, dan sanitair',
          required: true,
          defaultValue: 'MENENGAH',
          options: [
            { id: 'standar', label: 'Ekonomis / Standar', value: 'STANDAR', nextStep: 'NEXT', description: 'Keramik 40x40, Cat standar, Sanitair standar' },
            { id: 'menengah', label: 'Menengah / Standard Pro', value: 'MENENGAH', nextStep: 'NEXT', description: 'Granit Tile 60x60, Cat premium weather, Sanitair TOTO' },
            { id: 'mewah', label: 'Mewah / High-End Premium', value: 'MEWAH', nextStep: 'NEXT', description: 'Granit Tile 80x80 / Marmer, Cat low-VOC, Sanitair smart Kohler/TOTO' }
          ]
        },
        {
          id: 'location',
          type: 'single_select',
          label: 'Daerah / Wilayah Proyek',
          description: 'Penyesuaian indeks biaya material & upah (IKK) berdasarkan wilayah',
          required: false,
          defaultValue: 'DKI_JAKARTA',
          options: REGIONAL_WIZARD_OPTIONS
        }
      ],
      generateRabItems: (params) => {
        const area = Number(params.building_area) || 100;
        const floors = Number(params.num_floors) || 1;
        const structure = params.structure_type || 'BETON_BERTULANG';
        const isBajaWf = structure === 'BAJA_WF';
        const quality = params.quality_level || 'MENENGAH';
        const qualityMult = quality === 'MEWAH' ? 1.35 : quality === 'MENENGAH' ? 1.05 : 0.90;
        const reg = getRegionalFactor(params.location);
        const regionalMultiplier = reg.factor;

        const items: RabItem[] = [
          // 01. PERSIAPAN
          {
            id: `RAB-CST-${Date.now()}-01`,
            itemNumber: '1.1',
            wbsCode: '1.1',
            description: 'Pembersihan Lahan dan Pengukuran Bowplank Proyek Custom',
            category: '01. PEKERJAAN PERSIAPAN',
            unit: 'm2',
            volume: Math.round(area * 1.2),
            unitPrice: Math.round(20000 * qualityMult),
            ahspCode: 'A.2.2.1.9',
            status: 'READY'
          },
          // 02. TANAH DAN PONDASI
          {
            id: `RAB-CST-${Date.now()}-02`,
            itemNumber: '2.1',
            wbsCode: '2.1',
            description: 'Galian Tanah Pondasi dan Pemadatan Tanah Bawah Bangunan',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.35 * 10) / 10,
            unitPrice: 85000,
            ahspCode: 'A.2.3.1.1',
            status: 'READY'
          },
          {
            id: `RAB-CST-${Date.now()}-03`,
            itemNumber: '2.2',
            wbsCode: '2.2',
            description: floors > 1 ? 'Pondasi Footplate Beton Bertulang K-250 & Batu Kali' : 'Pondasi Batu Kali Menerus Campuran 1:4',
            category: '02. PEKERJAAN TANAH DAN PONDASI',
            unit: 'm3',
            volume: Math.round(area * 0.25 * 10) / 10,
            unitPrice: floors > 1 ? 2850000 : 980000,
            ahspCode: floors > 1 ? 'A.4.1.1.foot' : 'A.3.2.1.2',
            status: 'READY'
          },
          // 03. STRUKTUR
          {
            id: `RAB-CST-${Date.now()}-04`,
            itemNumber: '3.1',
            wbsCode: '3.1',
            description: isBajaWf
              ? 'Pengadaan dan Erection Rangka Struktur Baja WF (Wide Flange) Bangunan Custom'
              : 'Struktur Balok Sloof, Kolom, dan Ringbalk Beton Bertulang K-250',
            category: '03. PEKERJAAN STRUKTUR',
            unit: isBajaWf ? 'kg' : 'm3',
            volume: isBajaWf ? Math.round(area * 28) : Math.round(area * 0.22 * 10) / 10,
            unitPrice: isBajaWf ? 38500 : 5250000,
            ahspCode: isBajaWf ? 'A.4.2.1.WF' : 'A.4.1.1.struktur',
            status: 'READY'
          },
          // 04. DINDING
          {
            id: `RAB-CST-${Date.now()}-05`,
            itemNumber: '4.1',
            wbsCode: '4.1',
            description: 'Pasangan Dinding Bata Ringan Hebel 10cm Plester Aci 2 Sisi Halus',
            category: '04. PEKERJAAN DINDING',
            unit: 'm2',
            volume: Math.round(area * 2.5),
            unitPrice: Math.round(210000 * qualityMult),
            ahspCode: 'A.4.4.1.1',
            status: 'READY'
          },
          // 05. LANTAI
          {
            id: `RAB-CST-${Date.now()}-06`,
            itemNumber: '5.1',
            wbsCode: '5.1',
            description: `Pasang Penutup Lantai ${quality === 'MEWAH' ? 'Granit Tile 80x80 cm / Marmer' : quality === 'MENENGAH' ? 'Granit Tile 60x60 cm Polished' : 'Keramik 40x40 cm Standar'}`,
            category: '05. PEKERJAAN LANTAI',
            unit: 'm2',
            volume: Math.round(area * 0.9),
            unitPrice: Math.round(250000 * qualityMult),
            ahspCode: 'A.4.4.3.lantai',
            status: 'READY'
          },
          // 06. ATAP
          {
            id: `RAB-CST-${Date.now()}-07`,
            itemNumber: '6.1',
            wbsCode: '6.1',
            description: params.roof_type === 'DAK_BETON'
              ? 'Dak Beton Bertulang K-250 Tebal 12cm Waterproofing Membran'
              : 'Konstruksi Rangka Atap Baja Ringan & Penutup Genteng / Spandek Zincalume',
            category: '06. PEKERJAAN ATAP',
            unit: 'm2',
            volume: Math.round(area * 1.15),
            unitPrice: params.roof_type === 'DAK_BETON' ? 380000 : 195000,
            ahspCode: 'A.4.2.1.atap',
            status: 'READY'
          },
          // 07. KUSEN PINTU JENDELA
          {
            id: `RAB-CST-${Date.now()}-08`,
            itemNumber: '7.1',
            wbsCode: '7.1',
            description: 'Kusen Aluminium 4 Inch, Daun Pintu Panel Kayu Solid, dan Jendela Kaca Bening 5mm',
            category: '07. PEKERJAAN KUSEN, PINTU, DAN JENDELA',
            unit: 'unit',
            volume: Math.max(2, Math.round(area / 30)),
            unitPrice: Math.round(2400000 * qualityMult),
            ahspCode: 'A.4.6.1.pintu',
            status: 'READY'
          },
          // 08. PLAFON
          {
            id: `RAB-CST-${Date.now()}-09`,
            itemNumber: '8.1',
            wbsCode: '8.1',
            description: 'Plafon Gypsum Board 9mm Rangka Hollow Galvanis 40x40 dan List Profil',
            category: '08. PEKERJAAN PLAFON',
            unit: 'm2',
            volume: Math.round(area * 0.9),
            unitPrice: 135000,
            ahspCode: 'A.4.5.1.plafon',
            status: 'READY'
          },
          // 09. INSTALASI LISTRIK
          {
            id: `RAB-CST-${Date.now()}-10`,
            itemNumber: '9.1',
            wbsCode: '9.1',
            description: 'Instalasi Titik Lampu LED, Saklar, Stop Kontak Daya, dan Box Sekering MCB',
            category: '09. PEKERJAAN INSTALASI LISTRIK',
            unit: 'titik',
            volume: Math.round(area / 10),
            unitPrice: 245000,
            ahspCode: 'A.6.1.1.listrik',
            status: 'READY'
          },
          // 10. PLAMBING DAN SANITASI
          {
            id: `RAB-CST-${Date.now()}-11`,
            itemNumber: '10.1',
            wbsCode: '10.1',
            description: 'Instalasi Pipa Air Bersih, Pipa Air Kotor, Kloset Duduk, dan Wastafel',
            category: '10. PEKERJAAN PLAMBING DAN SANITASI',
            unit: 'unit',
            volume: Math.max(1, Math.round(area / 60)),
            unitPrice: Math.round(3200000 * qualityMult),
            ahspCode: 'A.5.1.1.sanitair',
            status: 'READY'
          },
          // 11. PENGECATAN
          {
            id: `RAB-CST-${Date.now()}-12`,
            itemNumber: '11.1',
            wbsCode: '11.1',
            description: 'Pengecatan Tembok Interior dan Eksterior Tahan Cuaca 2 Lapis',
            category: '11. PEKERJAAN PENGECATAN',
            unit: 'm2',
            volume: Math.round(area * 2.8),
            unitPrice: Math.round(45000 * qualityMult),
            ahspCode: 'A.4.7.1.cat',
            status: 'READY'
          },
          // 12. EKSTERIOR
          {
            id: `RAB-CST-${Date.now()}-13`,
            itemNumber: '12.1',
            wbsCode: '12.1',
            description: 'Saluran Drainase Keliling, Rabat Beton Teras, dan Septic Tank Biofil Resapan',
            category: '12. PEKERJAAN EKSTERIOR DAN LINGKUNGAN',
            unit: 'm2',
            volume: Math.round(area * 0.25),
            unitPrice: 195000,
            ahspCode: 'A.2.2.1.ext',
            status: 'READY'
          },
          // 13. FINISHING
          {
            id: `RAB-CST-${Date.now()}-14`,
            itemNumber: '13.1',
            wbsCode: '13.1',
            description: 'Pembersihan Akhir Bangunan dan BAST Serah Terima Pekerjaan Proyek Custom',
            category: '13. PEKERJAAN FINISHING, PEMBERSIHAN, DAN SERAH TERIMA',
            unit: 'ls',
            volume: 1,
            unitPrice: 1500000,
            ahspCode: 'A.8.1.3.1',
            status: 'READY'
          }
        ];

        if (regionalMultiplier !== 1.00) {
          for (const it of items) {
            it.unitPrice = Math.round(SafeDecimalEngine.safeMultiply(it.unitPrice, regionalMultiplier));
          }
        }

        return items;
      }
    };
    TemplateResolver.templates.set('BUILDING-CUSTOM', customBuildingDef);
    TemplateResolver.templates.set('BUILDING_CUSTOM', customBuildingDef);
  }

  public static getTemplate(templateId: string): TemplateDefinition | undefined {
    return TemplateResolver.templates.get(templateId);
  }

  public static getCategoryChoices(): AssistantChoice[] {
    return [
      {
        id: 'BUILDING',
        label: 'Bangunan Gedung',
        description: 'Rumah, hotel, rumah sakit, kantor, sekolah, dan gedung lainnya',
        value: 'BUILDING',
        nextStep: 'PROJECT_TYPE_SELECTION'
      },
      {
        id: 'ROAD_AND_PAVEMENT',
        label: 'Jalan dan Perkerasan',
        description: 'Jalan aspal, jalan beton, paving block, trotoar, dan rehabilitasi jalan',
        value: 'ROAD_AND_PAVEMENT',
        nextStep: 'PROJECT_TYPE_SELECTION'
      },
      {
        id: 'WATER_RESOURCES',
        label: 'Bangunan Air',
        description: 'Saluran irigasi, drainase, embung, bendungan, intake, dan reservoir',
        value: 'WATER_RESOURCES',
        nextStep: 'PROJECT_TYPE_SELECTION'
      },
      {
        id: 'CIVIL_STRUCTURE',
        label: 'Struktur Sipil',
        description: 'Jembatan, retaining wall, bronjong, riprap, dan pekerjaan tanah',
        value: 'CIVIL_STRUCTURE',
        nextStep: 'PROJECT_TYPE_SELECTION'
      },
      {
        id: 'CUSTOM_PROJECT',
        label: 'Proyek Custom',
        description: 'Proyek lain dengan spesifikasi yang dapat ditentukan sendiri',
        value: 'CUSTOM_PROJECT',
        nextStep: 'CUSTOM_PROJECT_PARAMETER_COLLECTION'
      }
    ];
  }

  public static getBuildingChoices(): AssistantChoice[] {
    return [
      {
        id: 'HOUSE_RESIDENTIAL',
        label: 'Rumah Tinggal',
        description: 'Rumah Type 36, Type 45, Type 70, Rumah 2 Lantai, dan Rumah Custom',
        value: 'HOUSE_RESIDENTIAL',
        nextStep: 'TEMPLATE_SELECTION'
      },
      {
        id: 'BUILDING_HOTEL',
        label: 'Hotel',
        description: 'Hotel bertingkat, resort, boutique hotel, dan penginapan',
        value: 'BUILDING_HOTEL',
        nextStep: 'TEMPLATE_SELECTION'
      },
      {
        id: 'BUILDING_HOSPITAL',
        label: 'Rumah Sakit',
        description: 'Gedung rumah sakit umum, klinik terpadu, dan fasilitas medis',
        value: 'BUILDING_HOSPITAL',
        nextStep: 'TEMPLATE_SELECTION'
      },
      {
        id: 'BUILDING_HALL',
        label: 'Gedung Serbaguna',
        description: 'Convention hall, auditorium, dan gedung pertemuan',
        value: 'BUILDING_HALL',
        nextStep: 'TEMPLATE_SELECTION'
      },
      {
        id: 'BUILDING_OFFICE',
        label: 'Gedung Perkantoran',
        description: 'Kantor bertingkat dengan lantai tinggi (4m), lampu downlight/troffer, dan floor outlet',
        value: 'BUILDING-OFFICE',
        templateId: 'BUILDING-OFFICE',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'BUILDING_SCHOOL',
        label: 'Sekolah',
        description: 'Gedung ruang kelas, laboratorium, dan gedung pendidikan',
        value: 'BUILDING_SCHOOL',
        nextStep: 'TEMPLATE_SELECTION'
      },
      {
        id: 'BUILDING_MOSQUE',
        label: 'Masjid',
        description: 'Masjid & sarana ibadah dengan pilihan kubah, tempat wudhu, dan penutup atap',
        value: 'BUILDING-MOSQUE',
        templateId: 'BUILDING-MOSQUE',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'BUILDING_WAREHOUSE',
        label: 'Gudang',
        description: 'Gudang struktur rangka baja WF, gording CNP/hollow, atap spandek, dan floor hardener',
        value: 'BUILDING-WAREHOUSE',
        templateId: 'BUILDING-WAREHOUSE',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'BUILDING_MARKET',
        label: 'Pasar',
        description: 'Pasar tradisional modern dengan portal baja, los basah keramik, dan drainase grease trap',
        value: 'BUILDING-MARKET',
        templateId: 'BUILDING-MARKET',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'BUILDING_PARKING',
        label: 'Gedung Parkir',
        description: 'Gedung parkir komposit baja WF, pelat bondek, ramp anti-selip, dan marka',
        value: 'BUILDING-PARKING',
        templateId: 'BUILDING-PARKING',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'BUILDING_CUSTOM',
        label: 'Bangunan Custom',
        description: 'Gedung dengan spesifikasi bebas (luas, lantai, struktur, atap, finishing, lokasi)',
        value: 'BUILDING-CUSTOM',
        templateId: 'BUILDING-CUSTOM',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      }
    ];
  }

  public static getHouseTemplateChoices(): AssistantChoice[] {
    return HouseTypeCatalog.getAll().map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      badge: item.badge || (item.readinessStatus === 'READY' ? 'Template Tersedia' : 'Coming Soon'),
      value: item.value,
      nextStep: item.nextStep,
      templateId: item.templateId || undefined,
      disabled: item.disabled,
      disabledReason: item.disabledReason,
      area: item.area,
      floorOptions: item.floorOptions,
      defaultFloorCount: item.defaultFloorCount,
      readinessStatus: item.readinessStatus,
      categoryGroup: item.categoryGroup,
      displayOrder: item.displayOrder,
      availability: item.availability,
    }));
  }

  public static getRoadTemplateChoices(): AssistantChoice[] {
    return [
      {
        id: 'asphalt_road_light',
        label: 'Jalan Aspal',
        description: 'Lapis Aus Laston AC-WC, Agregat Pondasi A & B, Prime Coat',
        badge: 'Bina Marga',
        value: 'ASPHALT-ROAD-LIGHT',
        templateId: 'ASPHALT-ROAD-LIGHT',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'rigid_concrete_road',
        label: 'Jalan Beton',
        description: 'Plat Beton Semen FS-45 / K-300, Lean Concrete 5 cm, Wiremesh M8',
        badge: 'Beban Berat',
        value: 'RIGID-CONCRETE-ROAD',
        templateId: 'RIGID-CONCRETE-ROAD',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'paving_block_std',
        label: 'Paving Block',
        description: 'Paving block K-300 tebal 6/8 cm, Kanstin beton pengunci, Pasir alas',
        badge: 'Populer',
        value: 'PAVING-BLOCK-STANDARD',
        templateId: 'PAVING-BLOCK-STANDARD',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'road_macadam',
        label: 'Jalan Makadam',
        description: 'Lapis penetrasi makadam (Lapen) & perkerasan batu belah/pecah',
        value: 'ROAD_MACADAM',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'road_sidewalk',
        label: 'Trotoar',
        description: 'Trotoar pejalan kaki, kerb beton, dan ubin pemandu (guiding block)',
        value: 'ROAD_SIDEWALK',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'road_rehab',
        label: 'Rehabilitasi Jalan',
        description: 'Patching, perataan lapis aus, overlay aspal, dan perbaikan perkerasan',
        value: 'ROAD_REHABILITATION',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'road_custom',
        label: 'Pekerjaan Jalan Custom',
        description: 'Pekerjaan prasarana jalan dengan kriteria dan dimensi teknis kustom',
        badge: 'Custom',
        value: 'ROAD_CUSTOM',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      }
    ];
  }

  public static getWaterTemplateChoices(): AssistantChoice[] {
    return [
      {
        id: 'water_irrigation',
        label: 'Saluran Irigasi',
        description: 'Pasangan batu belah saluran primer/sekunder/tersier & pintu air',
        value: 'WATER_IRRIGATION',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'drain_open_uditch',
        label: 'Saluran Drainase',
        description: 'Saluran U-Ditch beton pracetak komplit Tutup Cover & Pasir Alas',
        badge: 'Drainase',
        value: 'DRAIN-OPEN-UDITCH',
        templateId: 'DRAIN-OPEN-UDITCH',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'water_retention',
        label: 'Embung',
        description: 'Kolam retensi penampung air hujan, perkuatan tanggul, dan resapan air',
        value: 'WATER_RETENTION_BASIN',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'water_dam',
        label: 'Bendungan',
        description: 'Struktur bendungan air (Memerlukan review teknis engineering)',
        badge: 'ENGINEERING_REVIEW_REQUIRED',
        value: 'WATER_DAM',
        nextStep: 'ENGINEERING_REVIEW_REQUIRED'
      },
      {
        id: 'water_intake',
        label: 'Bangunan Intake',
        description: 'Bangunan penangkap/penyadap air baku dari sungai atau danau',
        value: 'WATER_INTAKE',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'water_spillway',
        label: 'Spillway',
        description: 'Bangunan pelimpah pelindung debit banjir dan saluran transisi',
        value: 'WATER_SPILLWAY',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'water_box_culvert',
        label: 'Box Culvert',
        description: 'Gorong-gorong beton pracetak penyeberangan aliran drainase/sungai',
        value: 'WATER_BOX_CULVERT',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'water_reservoir',
        label: 'Reservoir',
        description: 'Bak penampung dan tendon air bersih beton bertulang (ground/elevated)',
        value: 'WATER_RESERVOIR',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'water_embankment',
        label: 'Tanggul',
        description: 'Tanggul penahan banjir tanah dipadatkan atau pasangan batu',
        value: 'WATER_EMBANKMENT',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'water_custom',
        label: 'Bangunan Air Custom',
        description: 'Struktur bangunan keairan dengan spesifikasi teknis khusus',
        badge: 'Custom',
        value: 'WATER_CUSTOM',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      }
    ];
  }

  public static getCivilTemplateChoices(): AssistantChoice[] {
    return [
      {
        id: 'civil_bridge',
        label: 'Jembatan',
        description: 'Konstruksi jembatan girder beton bertulang atau jembatan komposit',
        value: 'CIVIL_BRIDGE',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'civil_retaining_wall',
        label: 'Retaining Wall',
        description: 'Dinding penahan tanah gravitasi pasangan batu atau kantilever beton',
        value: 'CIVIL_RETAINING_WALL',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'civil_gabion',
        label: 'Bronjong',
        description: 'Anyaman kawat bronjong galvanis isi batu belah penstabil tebing/lereng',
        value: 'CIVIL_GABION',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'civil_riprap',
        label: 'Riprap',
        description: 'Perkuatan tebing batu belah penahan gerusan erosi sungai/pantai',
        value: 'CIVIL_RIPRAP',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      },
      {
        id: 'civil_earthwork',
        label: 'Pekerjaan Tanah',
        description: 'Galian tanah massal, timbunan, pemadatan tanah, dan cut & fill',
        value: 'CIVIL_EARTHWORK',
        nextStep: 'BASIC_PARAMETER_COLLECTION'
      }
    ];
  }
}
