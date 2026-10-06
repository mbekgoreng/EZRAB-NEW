/**
 * EZRAB — MASTER EQUIPMENT & PERALATAN KONSTRUKSI INDONESIA 2026
 * Construction Machinery, Heavy Equipment & Tooling Intelligence System
 * 
 * Complies with:
 * - Permen PUPR No. 1 Tahun 2022 (Pedoman AHSP Bidang Peralatan)
 * - SE DJBK No. 12/SE/Db/2026 tentang Harga Satuan Dasar Peralatan Konstruksi
 * - Kepmen ESDM No. 1827 K/30/MEM/2018 (Standar Operasional Alat Pertambangan)
 * - Standar Konsumsi BBM Solar Industri / Dexlite & Pelumas Alat Berat Nasional
 * - 38 Indonesian Provinces with Regional Multiplier & Availability Index
 */

export type EquipmentCategory =
  | 'EARTHMOVING'        // Excavator, Bulldozer, Wheel Loader, Motor Grader
  | 'TRANSPORTATION'     // Dump Truck, Flatbed, Water Tanker, Fuel Tanker, Lowbed
  | 'COMPACTION'         // Tandem Roller, Pneumatic Tire Roller, Baby Roller, Plate Compactor
  | 'CONCRETE_EQUIPMENT' // Batching Plant, Concrete Mixer / Molen, Concrete Pump, Truck Mixer, Vibrator
  | 'FABRICATION'        // Bar Bender, Bar Cutter, Mesin Las Genset, Inverter, Plasma Cutter
  | 'LIFTING'            // Mobile Crane, Tower Crane, Crawler Crane, Scaffolding / Perancah
  | 'ROAD_PAVEMENT'      // Asphalt Mixing Plant, Asphalt Paver, Cold Milling, Bitumen Sprayer
  | 'FOUNDATION_PILING'  // Bored Pile Rig, Pile Driver, Vibro Hammer, Sheet Pile Installer, Grout Pump
  | 'BRIDGE_PRECAST'     // Girder Launcher, Strand Jack, Stressing Jack, Post-Tensioning Pump
  | 'SDA_DREDGING'       // Amphibious Excavator, Cutter Suction Dredger, Dewatering Pump, Sludge Pump
  | 'MINING_QUARRY'      // Jaw Crusher, Cone Crusher, Vibrating Screen, Conveyor, Jumbo Drill, LHD
  | 'DRILLING_BLASTING'  // Rotary Drill, DTH Drill, Exploration Core Drill, Blast Monitoring
  | 'GEOTECHNICAL_TEST'  // CPT/Sondir Machine, SPT Drill, Sand Cone, Plate Load Test
  | 'SURVEY_GEODESY'     // Total Station Robotic, GNSS RTK GPS, LiDAR Drone, Auto Level, Echo Sounder
  | 'LABORATORY'         // Compression Test Machine, Marshall Test, Sieve Shaker, Soil Triaxial
  | 'MEP_TOOLS'          // Megger Tester, Pipe Fusion HDPE Machine, Hydrostatic Pump, HVAC Manifold
  | 'SAFETY_EQUIPMENT'   // Multi Gas Detector, Fall Arrest System, Traffic Barrier, Safety Net
  | 'GENERAL_TOOLS'      // Jack Hammer, Rotary Hammer, Cut-off Saw, Pressure Washer, Chainsaw
  | 'UTILITY_POWER';     // Genset Silent, Kompresor Udara, Penerangan Proyek (Tower Light)

export type EquipmentOwnershipMode = 'OWNED' | 'RENTED' | 'SUBCONTRACTED';

export type EquipmentPriceSourceStatus =
  | 'VERIFIED'
  | 'MARKET_REFERENCE'
  | 'VENDOR_QUOTE'
  | 'USER_INPUT'
  | 'ESTIMATE'
  | 'UNVERIFIED';

export interface EquipmentAhspMapping {
  ahspCode: string;
  ahspRole: string;
  coefficient: number;
  unit: string; // e.g. 'Jam/m³', 'Jam/m²', 'Jam/ton'
  productivityRate?: number;
}

export interface EquipmentProductivityProfile {
  standardOutputPerHour: number; // e.g. 45 m³/jam
  unit: string;                  // 'm3/jam', 'm2/jam', 'ton/jam', 'm/jam'
  cycleTimeSeconds?: number;     // e.g. 24 detik per cycle
  bucketCapacityM3?: number;     // e.g. 0.93 m³
  efficiencyFactor?: number;     // e.g. 0.83 (Kondisi Kerja Baik)
  description: string;
}

export interface EquipmentOperatingCostBreakdown {
  fuelCostPerHour: number;       // Rp/jam BBM Solar Industri
  lubricantCostPerHour: number;  // Rp/jam Pelumas (Mesin, Transmisi, Hidrolik, Gemuk)
  operatorCostPerHour: number;   // Rp/jam Operator Alat Berat
  maintenanceCostPerHour: number;// Rp/jam Sparepart & Workshop
  totalOperatingCostPerHour: number;
}

export interface EquipmentPriceHistory {
  year: number;
  rentalPricePerHour: number;
  source: string;
}

export interface EquipmentRecord {
  id: string;
  code: string;               // e.g. 'E.01', 'E.02', 'HSD-E-01'
  name: string;               // e.g. 'Excavator Standard 20 Ton (Bucket 0.8 - 0.93 m³)'
  aliases: string[];          // e.g. ['Bego', 'Digger', 'Excavator 200', 'PC200', 'Kobelco SK200']
  englishName?: string;       // e.g. 'Hydraulic Excavator 20T'
  category: EquipmentCategory;
  subcategory: string;        // e.g. 'Heavy Earthmoving', 'Dewatering', 'Road Compaction'
  equipmentType?: string;     // e.g. 'Crawler Excavator'
  brand?: string;             // e.g. 'Komatsu / Kobelco / CAT'
  model?: string;             // e.g. 'PC200-8 / SK200-10'
  capacity: string;           // 'Bucket 0.93 m³', '10 Ton', '500 Liter'
  enginePowerHP: number;      // Tenaga mesin (HP / kW)
  unit: 'jam' | 'hari' | 'bulan' | 'unit' | 'shift';
  ownershipMode: EquipmentOwnershipMode;
  
  // Pricing Fields
  purchasePrice?: number;     // Harga Beli Unit Baru (Rp)
  rentalPricePerHour: number; // Tarif sewa per jam (Rp/jam)
  rentalPricePerDay: number;  // Standar 8 jam shift (Rp/hari)
  rentalPricePerMonth?: number; // Tarif bulanan (200 jam minimum)
  
  // Fuel & Operating
  fuelType: 'SOLAR_INDUSTRI' | 'DEXLITE' | 'BENSIN' | 'LISTRIK' | 'MANUAL';
  fuelConsumptionLiterPerHour: number; // Konsumsi BBM Solar Industri (L/jam)
  lubricantCostPerHour?: number;       // Biaya oli pelumas per jam
  operatorCostPerHour?: number;        // Biaya operator per jam
  operatorIncluded: boolean;           // Apakah tarif include operator & BBM dasar
  maintenanceFactor: number;           // Faktor biaya pemeliharaan per jam (0.05 - 0.20)
  mobDemobEstimate: number;            // Estimasi biaya mobilisasi-demobilisasi wilayah Jawa
  
  // Technical Specifications & Breakdown
  specification: string;
  recommendedBrands: string[];         // Komatsu, CAT, Kobelco, Hitachi, Sany, Sakai, dll.
  compatibleWorkItems?: string[];      // Pekerjaan yang didukung
  requiredCrew?: string[];             // Tenaga kerja pendukung e.g. ['Operator Excavator', 'Helper']
  productivity?: EquipmentProductivityProfile;
  operatingCosts?: EquipmentOperatingCostBreakdown;
  ahspMappings?: EquipmentAhspMapping[];
  priceHistory?: EquipmentPriceHistory[];
  
  // Status & Verification
  provenance: {
    sourceName: string;
    effectiveDate: string;
    confidenceScore: number;
    sourceStatus?: EquipmentPriceSourceStatus;
  };
  status: 'VERIFIED' | 'REVIEWED' | 'UNVERIFIED' | 'ARCHIVED';
}

export const MASTER_EQUIPMENT_ROSTER: EquipmentRecord[] = [
  // =========================================================================
  // 1. EARTHMOVING & EXCAVATION (ALAT BERAT TANAH)
  // =========================================================================
  {
    id: 'EQP-001',
    code: 'E.01',
    name: 'Excavator Standard 20 Ton (Bucket 0.8 - 0.93 m³)',
    aliases: ['Bego', 'Digger', 'Excavator PC200', 'Kobelco SK200', 'CAT 320', 'Excavator 20 Ton'],
    englishName: 'Hydraulic Crawler Excavator 20T',
    category: 'EARTHMOVING',
    subcategory: 'Excavation & Loading',
    equipmentType: 'Crawler Hydraulic Excavator',
    capacity: 'Bucket 0.93 m³ (Operating Weight 20.5 Ton)',
    enginePowerHP: 148,
    unit: 'jam',
    ownershipMode: 'RENTED',
    purchasePrice: 1850000000,
    rentalPricePerHour: 450000,
    rentalPricePerDay: 3600000,
    rentalPricePerMonth: 72000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 18.5,
    lubricantCostPerHour: 28000,
    operatorCostPerHour: 35000,
    operatorIncluded: true,
    maintenanceFactor: 0.12,
    mobDemobEstimate: 4500000,
    specification: 'Galian tanah keras/biasa, loading dump truck, penataan lereng cut & fill. Standard Boom 5.7m, Arm 2.9m.',
    recommendedBrands: ['Komatsu PC200-8', 'Kobelco SK200-10', 'Caterpillar 320D', 'Hitachi ZX200', 'Sany SY215C'],
    compatibleWorkItems: ['Galian Tanah Biasa', 'Galian Tanah Keras', 'Loading Dump Truck', 'Pematangan Lahan', 'Cut and Fill'],
    requiredCrew: ['Operator Excavator', 'Helper / Rigger'],
    productivity: {
      standardOutputPerHour: 65,
      unit: 'm3/jam',
      cycleTimeSeconds: 22,
      bucketCapacityM3: 0.93,
      efficiencyFactor: 0.83,
      description: 'Galian tanah biasa swing 90° loading ke dump truck',
    },
    operatingCosts: {
      fuelCostPerHour: 277500, // 18.5 L * 15.000 (Solar Industri)
      lubricantCostPerHour: 28000,
      operatorCostPerHour: 35000,
      maintenanceCostPerHour: 54000,
      totalOperatingCostPerHour: 394500,
    },
    ahspMappings: [
      { ahspCode: 'A.2.2.1.9', ahspRole: 'Excavator 80-140 HP', coefficient: 0.0154, unit: 'Jam/m³', productivityRate: 65 },
    ],
    priceHistory: [
      { year: 2024, rentalPricePerHour: 410000, source: 'Survei Pasar Alat Berat 2024' },
      { year: 2025, rentalPricePerHour: 435000, source: 'SE DJBK 2025' },
      { year: 2026, rentalPricePerHour: 450000, source: 'SE DJBK No. 12/SE/Db/2026' },
    ],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026 & Asosiasi Rental Alat Berat',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-002',
    code: 'E.02',
    name: 'Mini Excavator 5 Ton (Bucket 0.20 - 0.35 m³)',
    aliases: ['Excavator Mini', 'PC50', 'Kubota U50', 'Mini Digger', 'Bego Kecil'],
    englishName: 'Mini Hydraulic Excavator 5T',
    category: 'EARTHMOVING',
    subcategory: 'Compact Excavation',
    equipmentType: 'Mini Excavator Rubber/Steel Track',
    capacity: 'Bucket 0.22 m³ (Operating Weight 5.5 Ton)',
    enginePowerHP: 48,
    unit: 'jam',
    ownershipMode: 'RENTED',
    purchasePrice: 680000000,
    rentalPricePerHour: 300000,
    rentalPricePerDay: 2400000,
    rentalPricePerMonth: 48000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 7.5,
    lubricantCostPerHour: 14000,
    operatorCostPerHour: 30000,
    operatorIncluded: true,
    maintenanceFactor: 0.10,
    mobDemobEstimate: 2500000,
    specification: 'Galian saluran drainase perkotaan sempit, pondasi perumahan, lansekap taman dan galian basement terbatas.',
    recommendedBrands: ['Komatsu PC50MR-2', 'Kubota U50-5', 'Yanmar ViO55', 'Hitachi ZX50U', 'Kobelco SK50SR'],
    compatibleWorkItems: ['Galian Parit Saluran U-Ditch', 'Galian Pondasi Tiang Pancang Mini', 'Galian Pipa Air'],
    requiredCrew: ['Operator Mini Excavator', 'Helper'],
    productivity: {
      standardOutputPerHour: 22,
      unit: 'm3/jam',
      cycleTimeSeconds: 18,
      bucketCapacityM3: 0.22,
      efficiencyFactor: 0.80,
      description: 'Galian parit drainase kedalaman 1.5m tanah biasa',
    },
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-003',
    code: 'E.03',
    name: 'Excavator Long Reach / Long Arm (Boom 15 - 18 m)',
    aliases: ['Excavator Belalai Panjang', 'Long Arm Digger', 'PC210 Long Reach', 'Excavator Pengerukan Sungai'],
    englishName: 'Long Reach Hydraulic Excavator',
    category: 'EARTHMOVING',
    subcategory: 'River & Deep Slope Excavation',
    equipmentType: 'Super Long Reach Excavator',
    capacity: 'Bucket 0.45 m³ (Jangkauan Maksimum 16.5 m)',
    enginePowerHP: 160,
    unit: 'jam',
    ownershipMode: 'RENTED',
    purchasePrice: 2400000000,
    rentalPricePerHour: 550000,
    rentalPricePerDay: 4400000,
    rentalPricePerMonth: 88000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 22.0,
    operatorIncluded: true,
    maintenanceFactor: 0.15,
    mobDemobEstimate: 5500000,
    specification: 'Pengerukan sedimentasi sungai, normalisasi saluran irigasi primer, pembersihan waduk, dan lereng galian dalam.',
    recommendedBrands: ['Komatsu PC210-LC Super Long', 'Kobelco SK210 Long Reach', 'Caterpillar 320 Long Arm'],
    compatibleWorkItems: ['Normalisasi Sungai', 'Pengerukan Waduk', 'Galian Saluran Primer', 'Pembersihan Embung'],
    requiredCrew: ['Operator Excavator Long Arm', 'Helper / Rigger'],
    provenance: {
      sourceName: 'Ditjen SDA PUPR & SE DJBK 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-004',
    code: 'E.04',
    name: 'Bulldozer 130 - 165 HP (Blade Semi-U / Tilt)',
    aliases: ['Dozer', 'Buldoser', 'Komatsu D65', 'CAT D6', 'Crawler Tractor Dozer'],
    englishName: 'Crawler Bulldozer 140HP',
    category: 'EARTHMOVING',
    subcategory: 'Dozing & Land Clearing',
    equipmentType: 'Crawler Bulldozer',
    capacity: 'Blade Capacity 3.4 m³ (Operating Weight 15.5 Ton)',
    enginePowerHP: 140,
    unit: 'jam',
    ownershipMode: 'RENTED',
    purchasePrice: 2100000000,
    rentalPricePerHour: 550000,
    rentalPricePerDay: 4400000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 20.0,
    operatorIncluded: true,
    maintenanceFactor: 0.14,
    mobDemobEstimate: 5000000,
    specification: 'Land clearing (pembabatan lahan), pengupasan top soil (stripping), perataan tanah timbunan, perintisan jalan.',
    recommendedBrands: ['Komatsu D65P-12', 'Caterpillar D6R', 'Shantui SD16', 'Liugong CLGB160'],
    compatibleWorkItems: ['Land Clearing', 'Stripping Top Soil tebal 20 cm', 'Perataan Timbunan Tanah', 'Pembukaan Trase Jalan'],
    requiredCrew: ['Operator Bulldozer', 'Flagman / Helper'],
    productivity: {
      standardOutputPerHour: 90,
      unit: 'm3/jam',
      cycleTimeSeconds: 45,
      efficiencyFactor: 0.80,
      description: 'Pendorongan dan perataan tanah timbunan jarak dorong 30m',
    },
    provenance: {
      sourceName: 'Permen PUPR 1/2022 & SE DJBK 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-005',
    code: 'E.05',
    name: 'Wheel Loader (Bucket 1.8 - 2.5 m³)',
    aliases: ['Payloader', 'Loader', 'Front End Loader', 'Komatsu WA200', 'CAT 924'],
    englishName: 'Wheel Loader 2.1m³',
    category: 'EARTHMOVING',
    subcategory: 'Material Loading & Stockpiling',
    equipmentType: 'Articulated Wheel Loader',
    capacity: 'Bucket 2.1 m³ (Payload 3.5 Ton)',
    enginePowerHP: 130,
    unit: 'jam',
    ownershipMode: 'RENTED',
    purchasePrice: 1250000000,
    rentalPricePerHour: 420000,
    rentalPricePerDay: 3360000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 16.0,
    operatorIncluded: true,
    maintenanceFactor: 0.11,
    mobDemobEstimate: 4000000,
    specification: 'Pemuatan material agregat pasir, batu pecah di Batching Plant, Asphalt Plant, atau stockpile tambang/quarry.',
    recommendedBrands: ['Komatsu WA200-5', 'Caterpillar 924K', 'Liugong CLG835H', 'SDLG L936F'],
    compatibleWorkItems: ['Loading Agregat ke Hopper Batching Plant', 'Pemuatan Pasir & Batu ke Dump Truck', 'Penataan Stockpile'],
    requiredCrew: ['Operator Wheel Loader'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-006',
    code: 'E.06',
    name: 'Motor Grader 135 HP (Moldboard Blade 3.7 m)',
    aliases: ['Grader', 'Mesin Perata Jalan', 'Komatsu GD511', 'CAT 120K', 'Road Grader'],
    englishName: 'Motor Grader 135HP',
    category: 'EARTHMOVING',
    subcategory: 'Grading & Leveling',
    equipmentType: 'Articulated Motor Grader',
    capacity: 'Moldboard Blade 3.71 m (Operating Weight 12.8 Ton)',
    enginePowerHP: 135,
    unit: 'jam',
    ownershipMode: 'RENTED',
    purchasePrice: 1750000000,
    rentalPricePerHour: 480000,
    rentalPricePerDay: 3840000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 17.5,
    operatorIncluded: true,
    maintenanceFactor: 0.12,
    mobDemobEstimate: 4500000,
    specification: 'Perataan, pembentukan kemiringan lereng jalan (camber/crossfall), penyebaran lapis pondasi agregat LPA/LPB.',
    recommendedBrands: ['Komatsu GD511A-1', 'Caterpillar 120K', 'Mitsubishi MG330', 'Liugong 4180D'],
    compatibleWorkItems: ['Penyebaran Agregat Kelas A/B', 'Pembentukan Badan Jalan Tol', 'Pemeliharaan Jalan Tambang'],
    requiredCrew: ['Operator Motor Grader', 'Helper Juru Ukur'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 2. COMPACTION (PEMADATAN JALAN & TANAH)
  // =========================================================================
  {
    id: 'EQP-007',
    code: 'E.07',
    name: 'Vibratory Single Drum Roller 10 - 12 Ton (Vibro Roller)',
    aliases: ['Vibro Roller', 'Mesin Gilas Getar', 'Sakai SV520', 'Bomag BW211', 'Dynapac CA250', 'Compactor 10 Ton'],
    englishName: 'Single Drum Vibratory Roller 10T',
    category: 'COMPACTION',
    subcategory: 'Soil & Subgrade Compaction',
    equipmentType: 'Vibratory Single Drum Compactor',
    capacity: 'Operating Weight 10.5 Ton (Kekuatan Getar Dinamis 280 kN)',
    enginePowerHP: 120,
    unit: 'jam',
    ownershipMode: 'RENTED',
    purchasePrice: 1350000000,
    rentalPricePerHour: 350000,
    rentalPricePerDay: 2800000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 14.5,
    operatorIncluded: true,
    maintenanceFactor: 0.11,
    mobDemobEstimate: 3500000,
    specification: 'Pemadatan tanah dasar (subgrade), lapis pondasi agregat kelas A/B, tanggul bendungan, dan urugan granular.',
    recommendedBrands: ['Sakai SV520D', 'Dynapac CA250D', 'Bomag BW211D-40', 'Hamm 3411'],
    compatibleWorkItems: ['Pemadatan Tanah Timbunan Pilihan', 'Pemadatan Lapis Pondasi Agregat Kelas A', 'Pemadatan Tubuh Bendungan'],
    requiredCrew: ['Operator Vibro Roller'],
    productivity: {
      standardOutputPerHour: 120,
      unit: 'm3/jam',
      efficiencyFactor: 0.85,
      description: 'Pemadatan lapis agregat tebal gembur 20cm dengan 6-8 lintasan (pass)',
    },
    provenance: {
      sourceName: 'Permen PUPR 1/2022 & SE DJBK 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-008',
    code: 'E.08',
    name: 'Tandem Steel Roller 6 - 8 Ton (Aspal)',
    aliases: ['Tandem Roller', 'Mesin Gilas Aspal', 'Sakai SW652', 'Gilas Besi Ganda'],
    englishName: 'Tandem Vibratory Roller 8T',
    category: 'COMPACTION',
    subcategory: 'Asphalt Pavement Compaction',
    equipmentType: 'Double Drum Tandem Roller',
    capacity: 'Operating Weight 7.8 Ton (Dual Drum Vibration)',
    enginePowerHP: 75,
    unit: 'jam',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 320000,
    rentalPricePerDay: 2560000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 11.0,
    operatorIncluded: true,
    maintenanceFactor: 0.10,
    mobDemobEstimate: 3000000,
    specification: 'Pemadatan awal (breakdown) dan akhir (finishing) lapis aspal hotmix AC-WC / AC-BC bebas jejak roda.',
    recommendedBrands: ['Sakai SW652-1', 'Bomag BW151AD', 'Dynapac CC2200', 'Hamm HD70'],
    compatibleWorkItems: ['Pemadatan Lapis Aus Aspal AC-WC', 'Pemadatan Lapis Antara AC-BC'],
    requiredCrew: ['Operator Tandem Roller'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-009',
    code: 'E.09',
    name: 'Pneumatic Tire Roller (PTR) 10 - 15 Ton',
    aliases: ['PTR', 'Mesin Gilas Ban Karet', 'Sakai TS200', 'Multi-Tire Roller'],
    englishName: 'Pneumatic Tire Roller 12T',
    category: 'COMPACTION',
    subcategory: 'Asphalt Intermediate Compaction',
    equipmentType: 'Multi-Pneumatic Tire Compactor',
    capacity: 'Operating Weight 12.0 Ton (9 Roda Ban Karet Tekanan Tinggi)',
    enginePowerHP: 90,
    unit: 'jam',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 340000,
    rentalPricePerDay: 2720000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 12.5,
    operatorIncluded: true,
    maintenanceFactor: 0.10,
    mobDemobEstimate: 3200000,
    specification: 'Pemadatan antara (intermediate rolling) lapis aspal untuk mencapai interlocking agregat dan kekedapan optimal.',
    recommendedBrands: ['Sakai TS200', 'Bomag BW24RH', 'Dynapac CP1200', 'Hamm GRW180'],
    compatibleWorkItems: ['Pemadatan Antara Aspal Hotmix AC-WC & AC-BC'],
    requiredCrew: ['Operator PTR'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-010',
    code: 'E.10',
    name: 'Baby Roller / Walk-Behind Compactor 1 - 2 Ton',
    aliases: ['Baby Roller', 'Stamper Gilas', 'Gilas Mini 1 Ton', 'Mikasa MDR', 'Sakai HV68'],
    englishName: 'Walk-Behind Baby Roller 1.2T',
    category: 'COMPACTION',
    subcategory: 'Narrow Compaction',
    equipmentType: 'Pedestrian Walk-Behind Roller',
    capacity: 'Operating Weight 1.2 Ton (Drum Width 650 mm)',
    enginePowerHP: 11,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 95000,
    rentalPricePerDay: 750000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 2.5,
    operatorIncluded: true,
    maintenanceFactor: 0.05,
    mobDemobEstimate: 800000,
    specification: 'Pemadatan bahu jalan, trotoar pedestrian, parit u-ditch drainase, dan pelataran parkir ruko.',
    recommendedBrands: ['Sakai HV68', 'Mikasa MDR-9D', 'Takarra VR-100', 'Tamping Roller 1T'],
    compatibleWorkItems: ['Pemadatan Bahu Jalan Sempit', 'Pemadatan Belakang U-Ditch', 'Paving Block Bedding'],
    requiredCrew: ['Operator Baby Roller'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-011',
    code: 'E.11',
    name: 'Plate Compactor & Tamping Rammer (Stamper Kuda)',
    aliases: ['Stamper Kuda', 'Stamper Kodok', 'Plate Compactor', 'Tamping Rammer'],
    englishName: 'Tamping Rammer & Vibratory Plate',
    category: 'COMPACTION',
    subcategory: 'Trench & Spot Compaction',
    equipmentType: 'Handheld Compactor Engine',
    capacity: 'Gaya Tumbuk 14 kN (Berat 75 kg)',
    enginePowerHP: 5.5,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 25000,
    rentalPricePerDay: 200000,
    fuelType: 'BENSIN',
    fuelConsumptionLiterPerHour: 1.2,
    operatorIncluded: false,
    maintenanceFactor: 0.03,
    mobDemobEstimate: 200000,
    specification: 'Pemadatan dasar galian pondasi telapak, timbunan kembali (backfill) pipa perpipaan, dan sudut sempit.',
    recommendedBrands: ['Mikasa MT-74F', 'Honda GX160 Plate', 'Wacker Neuson BS60'],
    compatibleWorkItems: ['Pemadatan Kembali Bekas Galian Tanah Pondasi', 'Pemadatan Bawah Lantai'],
    requiredCrew: ['Pekerja / Tukang Pemadatan'],
    provenance: {
      sourceName: 'Standar Rental Alat Konstruksi Sipil 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 3. TRANSPORTATION & HAULING (ARMADA ANGKUTAN KONSTRUKSI)
  // =========================================================================
  {
    id: 'EQP-012',
    code: 'E.12',
    name: 'Dump Truck Indeks 4 - 5 m³ (Engkel 6 Roda)',
    aliases: ['Truk Engkel', 'Dump Truck 4m3', 'Fuso Canter Dump', 'Hino Dutro Dump', 'Colt Diesel Dump'],
    englishName: 'Light Dump Truck 6-Wheeler 5m³',
    category: 'TRANSPORTATION',
    subcategory: 'Material Hauling',
    equipmentType: 'Medium Duty Dump Truck',
    capacity: 'Kapasitas Bak 4 - 5 m³ (Payload 8.5 Ton)',
    enginePowerHP: 110,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 175000,
    rentalPricePerDay: 1400000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 8.0,
    operatorIncluded: true,
    maintenanceFactor: 0.08,
    mobDemobEstimate: 1200000,
    specification: 'Angkutan tanah galian, pasir cor, batu split, dan puing proyek di jalan kota/pemukiman berdimensi sedang.',
    recommendedBrands: ['Mitsubishi Fuso Canter FE 74 HD', 'Hino Dutro 130 HD', 'Isuzu Elf NMR 71 HD'],
    compatibleWorkItems: ['Pembuangan Tanah Galian Proyek', 'Pengangkutan Pasir Cor', 'Suplai Batu Kali Pondasi'],
    requiredCrew: ['Driver Dump Truck Operasional'],
    provenance: {
      sourceName: 'Asosiasi Angkutan Konstruksi Indonesia 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-013',
    code: 'E.13',
    name: 'Dump Truck Tronton Indeks 8 - 12 m³ (10 Roda)',
    aliases: ['Truk Tronton', 'Dump Truck 10 Roda', 'Fuso FN', 'Hino 500 FM', 'Heavy Dump Truck'],
    englishName: 'Heavy Dump Truck 10-Wheeler 10m³',
    category: 'TRANSPORTATION',
    subcategory: 'Heavy Material Hauling',
    equipmentType: 'Heavy Duty 6x4 Dump Truck',
    capacity: 'Kapasitas Bak 10 m³ (Payload 20.0 Ton)',
    enginePowerHP: 260,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 250000,
    rentalPricePerDay: 2000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 14.0,
    operatorIncluded: true,
    maintenanceFactor: 0.10,
    mobDemobEstimate: 1800000,
    specification: 'Angkutan material massal proyek jalan tol, timbunan bendungan, reklamasi pantai, dan disposal tambang.',
    recommendedBrands: ['Hino 500 FM 260 JD', 'Mitsubishi Fuso Fighter FN 62 F', 'Nissan UD Quester CKE'],
    compatibleWorkItems: ['Hauling Overburden & Tanah Galian Massal', 'Suplai Agregat LPA/LPB Jarak Jauh'],
    requiredCrew: ['Driver Tronton Bersertifikasi'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-014',
    code: 'E.14',
    name: 'Water Tanker Truck 4000 - 5000 Liter',
    aliases: ['Truk Tangki Air', 'Water Tank Truck', 'Truk Siram Aspal/Tanah'],
    englishName: 'Water Tanker Truck 5000L',
    category: 'TRANSPORTATION',
    subcategory: 'Dust & Compaction Water Supply',
    equipmentType: 'Tanker Truck with Water Spray Pump',
    capacity: 'Tangki 5.000 Liter (Dilengkapi Pompa & Nozzle Sprayer)',
    enginePowerHP: 110,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 160000,
    rentalPricePerDay: 1300000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 7.5,
    operatorIncluded: true,
    maintenanceFactor: 0.07,
    mobDemobEstimate: 1000000,
    specification: 'Penyiraman air kadar optimum pemadatan lapis pondasi agregat, pencucian ban armada, dan dust control.',
    recommendedBrands: ['Hino Dutro Tanker', 'Mitsubishi Canter Tanker 5000L'],
    compatibleWorkItems: ['Penyiraman Air Pemadatan Agregat', 'Pembersihan Debu Jalan Proyek'],
    requiredCrew: ['Driver Water Tanker'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-015',
    code: 'E.15',
    name: 'Lowbed Trailer Truck 40 - 60 Ton (Mob/Demob Alat Berat)',
    aliases: ['Truk Lowbed', 'Trailer Angkut Alat Berat', 'Dolly Lowbed', 'Selfloader'],
    englishName: 'Heavy Equipment Lowbed Transport Trailer',
    category: 'TRANSPORTATION',
    subcategory: 'Heavy Equipment Logistics',
    equipmentType: 'Multi-Axle Lowbed Transport',
    capacity: 'Payload 50.0 Ton (Panjang Bed 12 Meter)',
    enginePowerHP: 380,
    unit: 'shift',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 500000,
    rentalPricePerDay: 4000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 24.0,
    operatorIncluded: true,
    maintenanceFactor: 0.12,
    mobDemobEstimate: 6000000,
    specification: 'Mobilisasi dan demobilisasi excavator, bulldozer, roller, crane antar lokasi proyek atau antar pulau.',
    recommendedBrands: ['Scania R440 Tractor Head', 'Volvo FH16 Lowbed', 'Hino Profia 6x4'],
    compatibleWorkItems: ['Mobilisasi Alat Berat ke Site Proyek', 'Demobilisasi Alat Berat'],
    requiredCrew: ['Driver Trailer Khusus', 'Kru Pengawal Escort'],
    provenance: {
      sourceName: 'Asosiasi Logistik & Angkutan Berat Indonesia 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 4. CONCRETE EQUIPMENT (ALAT PENGOLAHAN & PENGECORAN BETON)
  // =========================================================================
  {
    id: 'EQP-016',
    code: 'E.16',
    name: 'Concrete Batching Plant Wet Mix 60 m³/jam',
    aliases: ['Batching Plant Beton', 'Pabrik Cor Beton', 'Wet Mix Plant 60m3', 'Twin Shaft Mixer Plant'],
    englishName: 'Automated Concrete Batching Plant 60m³/h',
    category: 'CONCRETE_EQUIPMENT',
    subcategory: 'Concrete Production',
    equipmentType: 'Stationary Twin-Shaft Batching Plant',
    capacity: 'Output Produksi 60 m³/jam (4 Silo Semen 100 Ton, 4 Aggregate Hopper)',
    enginePowerHP: 180,
    unit: 'bulan',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 1200000,
    rentalPricePerDay: 9600000,
    rentalPricePerMonth: 180000000,
    fuelType: 'LISTRIK',
    fuelConsumptionLiterPerHour: 0,
    operatorIncluded: true,
    maintenanceFactor: 0.15,
    mobDemobEstimate: 45000000,
    specification: 'Produksi beton ready mix mutu tinggi K-250 s/d K-500 dengan sistem dosing timbangan digital terkomputerisasi.',
    recommendedBrands: ['Sany HZS60', 'Lintec CSD 1500', 'BHS Sonthofen Twin Shaft', 'Sicoma Batching'],
    compatibleWorkItems: ['Produksi Beton Cor Ready Mix Gedung & Jembatan'],
    requiredCrew: ['Batching Plant Operator', 'Laboratorium Beton Inspector', 'Wheel Loader Operator'],
    provenance: {
      sourceName: 'Asosiasi Perusahaan Readymix Indonesia (APBI) 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-017',
    code: 'E.17',
    name: 'Concrete Mixer / Molen Beton Lapangan (Kapasitas 350 - 500 L)',
    aliases: ['Molen Beton', 'Concrete Mixer', 'Molen Yanmar Diesel', 'Pengaduk Cor'],
    englishName: 'Site Concrete Mixer 500L',
    category: 'CONCRETE_EQUIPMENT',
    subcategory: 'Site Concrete Mixing',
    equipmentType: 'Tilting Drum Diesel Mixer',
    capacity: 'Kapasitas Drum 500 L (Output Bersih 350 L / batch cor)',
    enginePowerHP: 8.5,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 45000,
    rentalPricePerDay: 350000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 1.8,
    operatorIncluded: false,
    maintenanceFactor: 0.04,
    mobDemobEstimate: 400000,
    specification: 'Pencampuran beton cor struktural manual di lokasi (site mix) untuk kolom praktis, balok, pondasi batu kali.',
    recommendedBrands: ['Hercules 500L Diesel Yanmar', 'Tiger Molen 500L', 'Dongfeng Mixer'],
    compatibleWorkItems: ['Pengecoran Beton Manual K-175 / K-225', 'Adukan Spesi Pasangan Batu'],
    requiredCrew: ['Tukang Cor Beton', 'Pekerja Adukan'],
    productivity: {
      standardOutputPerHour: 3.5,
      unit: 'm3/jam',
      efficiencyFactor: 0.75,
      description: 'Pencampuran adukan beton per batch 5-6 menit',
    },
    provenance: {
      sourceName: 'Standar Persewaan Alat Sipil 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-018',
    code: 'E.18',
    name: 'Concrete Boom Pump 24 - 36 Meter',
    aliases: ['Pompa Beton Belalai', 'Concrete Pump Boom', 'Putzmeister Pompa', 'Mobil Cor Pompa'],
    englishName: 'Truck-Mounted Concrete Boom Pump 32m',
    category: 'CONCRETE_EQUIPMENT',
    subcategory: 'Concrete Placement',
    equipmentType: 'Truck Mounted Boom Pump',
    capacity: 'Output 90 m³/jam (Jangkauan Boom Vertikal 32 m)',
    enginePowerHP: 260,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 750000,
    rentalPricePerDay: 6000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 25.0,
    operatorIncluded: true,
    maintenanceFactor: 0.15,
    mobDemobEstimate: 2000000,
    specification: 'Pemompaan beton ready mix ke plat lantai 2 hingga lantai 7 gedung bertingkat, pier jembatan, dan abutment.',
    recommendedBrands: ['Putzmeister BSF 36', 'Schwing S 32 X', 'Sany SYG5310', 'Zoomlion 38X'],
    compatibleWorkItems: ['Pengecoran Plat Lantai Gedung', 'Pengecoran Balok & Kolom Bertingkat'],
    requiredCrew: ['Operator Concrete Pump', 'Kru Pipa Cor / Nozzleman'],
    provenance: {
      sourceName: 'Asosiasi Ready Mix & Pompa Beton Indonesia 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-019',
    code: 'E.19',
    name: 'Truck Mixer Ready Mix (Kapasitas 7 m³)',
    aliases: ['Truk Molen Ready Mix', 'Mixer Truck 7m3', 'Truk Cor Hino', 'Agitator Truck'],
    englishName: 'Transit Concrete Mixer Truck 7m³',
    category: 'CONCRETE_EQUIPMENT',
    subcategory: 'Concrete Transport',
    equipmentType: '6x4 Transit Mixer Truck',
    capacity: 'Kapasitas Drum Cor 7 m³ (Slump Retaining System)',
    enginePowerHP: 280,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 350000,
    rentalPricePerDay: 2800000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 16.0,
    operatorIncluded: true,
    maintenanceFactor: 0.12,
    mobDemobEstimate: 1500000,
    specification: 'Pengiriman beton segar homogen dari batching plant ke lokasi proyek dengan putaran drum konstan.',
    recommendedBrands: ['Hino Ranger FM 280 JM', 'Mitsubishi Fuso FN 62 F', 'Scania P360 Mixer'],
    compatibleWorkItems: ['Distribusi Beton Segar Ready Mix ke Site'],
    requiredCrew: ['Driver Truk Mixer Terlatih'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-020',
    code: 'E.20',
    name: 'Concrete Vibrator Engine / Elektrik (Selang Jarum Ø38 - 50 mm)',
    aliases: ['Vibrator Cor', 'Jarum Penggetar Beton', 'Mikasa Vibrator', 'Concrete Poker'],
    englishName: 'Concrete Poker Vibrator Engine',
    category: 'CONCRETE_EQUIPMENT',
    subcategory: 'Concrete Compaction',
    equipmentType: 'Flexible Shaft Concrete Vibrator',
    capacity: 'Diameter Jarum 45 mm (Panjang Selang Fleksibel 5 Meter)',
    enginePowerHP: 5.5,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 20000,
    rentalPricePerDay: 150000,
    fuelType: 'BENSIN',
    fuelConsumptionLiterPerHour: 1.0,
    operatorIncluded: false,
    maintenanceFactor: 0.03,
    mobDemobEstimate: 150000,
    specification: 'Pemadatan getar beton basah saat pengecoran untuk mengeliminasi rongga udara dan sarang kerikil (honeycomb).',
    recommendedBrands: ['Mikasa MGX-38 / FX-38', 'Robin EY-20 Vibrator', 'Honda GX160 Poker'],
    compatibleWorkItems: ['Pemadatan Pengecoran Kolom, Balok, Plat, Dinding Retaining'],
    requiredCrew: ['Operator Vibrator Cor'],
    provenance: {
      sourceName: 'Permen PUPR 1/2022 & Standar K3 Cor',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-021',
    code: 'E.21',
    name: 'Power Trowel Finishing Lantai Beton (Helikopter Cor)',
    aliases: ['Helikopter Cor', 'Mesin Trowel Beton', 'Power Trowel Finisher'],
    englishName: 'Power Trowel Concrete Floor Finisher',
    category: 'CONCRETE_EQUIPMENT',
    subcategory: 'Concrete Floor Finishing',
    equipmentType: 'Walk-Behind Concrete Power Trowel',
    capacity: 'Rotor Diameter 900 mm (4 Blade Baja Pegas)',
    enginePowerHP: 6.5,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 35000,
    rentalPricePerDay: 280000,
    fuelType: 'BENSIN',
    fuelConsumptionLiterPerHour: 1.5,
    operatorIncluded: false,
    maintenanceFactor: 0.04,
    mobDemobEstimate: 200000,
    specification: 'Finishing permukaan lantai beton, floor hardener gudang/pabrik, dan plat atap beton kedap air.',
    recommendedBrands: ['Mikasa MPT-36B', 'Dynamic Trowel 36 Inch', 'Honda GX200 Trowel'],
    compatibleWorkItems: ['Finishing Lantai Floor Hardener', 'Poles Lantai Beton Gudang'],
    requiredCrew: ['Tukang Finishing Lantai'],
    provenance: {
      sourceName: 'Standar Finishing Lantai Industri 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 5. CRANE & LIFTING (ALAT ANGKAT & EREKSI)
  // =========================================================================
  {
    id: 'EQP-022',
    code: 'E.22',
    name: 'Mobile Crane Telescopic 25 - 50 Ton (Rough Terrain / Truck Crane)',
    aliases: ['Mobile Crane', 'Telescopic Crane 25 Ton', 'Kato Crane', 'Tadano Crane', 'Truck Crane'],
    englishName: 'Hydraulic Mobile Crane 35T',
    category: 'LIFTING',
    subcategory: 'Heavy Lifting & Erection',
    equipmentType: 'Rough Terrain Hydraulic Mobile Crane',
    capacity: 'Kapasitas Angkat Maksimum 35 Ton (Panjang Boom Utama 34 Meter)',
    enginePowerHP: 240,
    unit: 'jam',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 750000,
    rentalPricePerDay: 6000000,
    rentalPricePerMonth: 120000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 20.0,
    operatorIncluded: true,
    maintenanceFactor: 0.14,
    mobDemobEstimate: 5000000,
    specification: 'Ereksi rangka baja WF/H-Beam, pemasangan balok girder jembatan pendek, pemancangan tiang, dan relokasi kontainer.',
    recommendedBrands: ['Tadano GR-350N', 'Kato CR-350Ri', 'Sany STC250', 'Zoomlion ZTC300'],
    compatibleWorkItems: ['Ereksi Struktur Baja Gudang', 'Pemasangan Precast Balok', 'Lifting Material Ketinggian'],
    requiredCrew: ['Operator Crane Berlisensi Kemenaker SIO Kelas 1', 'Rigger Bersertifikat', 'Signalman'],
    provenance: {
      sourceName: 'Permen Tenaga Kerja No. 8/2020 & SE DJBK 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-023',
    code: 'E.23',
    name: 'Tower Crane Topless / Hammerhead (Jib 50 - 60 m, Tip Load 1.5 - 2.5 Ton)',
    aliases: ['Tower Crane', 'TC Proyek Gedung', 'Potain Tower Crane', 'Liebherr TC'],
    englishName: 'Stationary Topless Tower Crane 60m Jib',
    category: 'LIFTING',
    subcategory: 'High-Rise Construction Lifting',
    equipmentType: 'Stationary High-Rise Tower Crane',
    capacity: 'Max Load 8.0 Ton (Tip Load pada Radius 55m = 1.8 Ton)',
    enginePowerHP: 75,
    unit: 'bulan',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 350000,
    rentalPricePerDay: 2800000,
    rentalPricePerMonth: 85000000,
    fuelType: 'LISTRIK',
    fuelConsumptionLiterPerHour: 0,
    operatorIncluded: true,
    maintenanceFactor: 0.12,
    mobDemobEstimate: 65000000, // Termasuk ereksi, testing beban Disnaker, dan dismantling
    specification: 'Pengangkatan bekisting kolom, besi tulangan, bucket cor beton, dan kaca fasad pada gedung tinggi 10-40 lantai.',
    recommendedBrands: ['Potain MCT 88', 'Liebherr 85 EC-B', 'Zoomlion TC6013', 'Yongmao ST5515'],
    compatibleWorkItems: ['Lifting Material Struktur Proyek Gedung Bertingkat Tinggi'],
    requiredCrew: ['Operator Tower Crane SIO Kelas 1', 'Rigger Ketinggian', 'Signalman Radio'],
    provenance: {
      sourceName: 'Standar Rental Alat Berat Gedung Tinggi APBI 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-024',
    code: 'E.24',
    name: 'Crawler Crane 50 - 80 Ton (Lattice Boom)',
    aliases: ['Crawler Crane', 'Crane Rantai Baja', 'Kobelco CKE', 'Sumitomo Crane'],
    englishName: 'Lattice Boom Crawler Crane 55T',
    category: 'LIFTING',
    subcategory: 'Heavy Infrastructure Lifting',
    equipmentType: 'Crawler Mounted Lattice Boom Crane',
    capacity: 'Max Load 55 Ton (Lattice Boom 40 Meter)',
    enginePowerHP: 200,
    unit: 'jam',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 850000,
    rentalPricePerDay: 6800000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 22.0,
    operatorIncluded: true,
    maintenanceFactor: 0.15,
    mobDemobEstimate: 18000000,
    specification: 'Pekerjaan pondasi dalam (bored pile casing handling), pemasangan sheet pile pelabuhan, dan konstruksi jembatan bentang panjang.',
    recommendedBrands: ['Kobelco CKE800', 'Hitachi Sumitomo SCX550', 'Sany SCC550A'],
    compatibleWorkItems: ['Pekerjaan Bored Pile & Casing', 'Ereksi Girder Jembatan Sungai'],
    requiredCrew: ['Operator Crawler Crane', 'Rigger Senior', 'Signalman'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 6. ROAD & PAVEMENT (ALAT PERKERASAN JALAN & ASPAL)
  // =========================================================================
  {
    id: 'EQP-025',
    code: 'E.25',
    name: 'Asphalt Finisher / Paver (Lebar Gelar 2.5 - 4.5 m)',
    aliases: ['Asphalt Paver', 'Finisher Aspal', 'Vogele Super', 'Mesin Gelar Aspal Hotmix'],
    englishName: 'Tracked Asphalt Paver / Finisher',
    category: 'ROAD_PAVEMENT',
    subcategory: 'Asphalt Paving',
    equipmentType: 'Tracked Asphalt Paving Machine',
    capacity: 'Output Gelar 250 Ton/jam (Screed Width 2.5 - 4.5 m)',
    enginePowerHP: 125,
    unit: 'jam',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 650000,
    rentalPricePerDay: 5200000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 18.0,
    operatorIncluded: true,
    maintenanceFactor: 0.15,
    mobDemobEstimate: 5000000,
    specification: 'Penghamparan aspal panas (hotmix AC-WC / AC-BC) dengan kontrol elevasi sensor level ultrasonik otomatis.',
    recommendedBrands: ['Vogele Super 1600-3', 'Sumitomo HA60W', 'Dynapac F1200C', 'CAT AP555E'],
    compatibleWorkItems: ['Penghamparan Aspal Hotmix AC-WC', 'Penghamparan Aspal AC-BC'],
    requiredCrew: ['Operator Asphalt Paver', 'Screed Operator', 'Tukang Aspal Pinggir'],
    productivity: {
      standardOutputPerHour: 60,
      unit: 'ton/jam',
      efficiencyFactor: 0.80,
      description: 'Penghamparan lapis aus aspal tebal 4 cm',
    },
    provenance: {
      sourceName: 'Pedoman Bina Marga & SE DJBK 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-026',
    code: 'E.26',
    name: 'Cold Milling Machine (Lebar Pemotongan Aspal 1.0 - 2.0 m)',
    aliases: ['Cold Milling', 'Mesin Keruk Aspal Rusak', 'Wirtgen W100', 'Road Milling'],
    englishName: 'Cold Milling Road Recycler',
    category: 'ROAD_PAVEMENT',
    subcategory: 'Road Rehabilitation & Milling',
    equipmentType: 'Tracked Cold Milling Machine',
    capacity: 'Milling Width 1.0 - 2.0 m (Kedalaman Maksimal 30 cm)',
    enginePowerHP: 220,
    unit: 'jam',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 1100000,
    rentalPricePerDay: 8800000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 32.0,
    operatorIncluded: true,
    maintenanceFactor: 0.18,
    mobDemobEstimate: 6000000,
    specification: 'Pengupasan lapisan aspal lama yang rusak, bergelombang, atau retak buaya sebelum pelapisan ulang (overlay).',
    recommendedBrands: ['Wirtgen W 100 Fi / W 2000', 'Dynapac PL1000', 'CAT PM620'],
    compatibleWorkItems: ['Pengupasan Aspal Rusak Kedalaman 5-10 cm'],
    requiredCrew: ['Operator Cold Milling', 'Helper / Dump Truck Coordinator'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-027',
    code: 'E.27',
    name: 'Bitumen Sprayer / Asphalt Distributor (Tangki 3000 - 4000 L)',
    aliases: ['Asphalt Distributor', 'Semprotan Aspal Emulsi', 'Bitumen Sprayer Prime Coat'],
    englishName: 'Truck Mounted Bitumen Asphalt Distributor',
    category: 'ROAD_PAVEMENT',
    subcategory: 'Tack & Prime Coat Application',
    equipmentType: 'Truck Mounted Insulated Bitumen Sprayer',
    capacity: 'Tangki 4000 Liter (Heating Burner & Spraybar Width 3.6m)',
    enginePowerHP: 110,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 220000,
    rentalPricePerDay: 1760000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 9.0,
    operatorIncluded: true,
    maintenanceFactor: 0.08,
    mobDemobEstimate: 1500000,
    specification: 'Penyemprotan lapis resap pengikat (Prime Coat) dan lapis perekat (Tack Coat) emulsi dengan debit semprot seragam.',
    recommendedBrands: ['Marini Bitumen Sprayer', 'Nippon Sharyo Distributor', 'Hino Sprayer 4000L'],
    compatibleWorkItems: ['Lapis Resap Pengikat (Prime Coat)', 'Lapis Perekat (Tack Coat)'],
    requiredCrew: ['Operator Bitumen Sprayer'],
    provenance: {
      sourceName: 'Permen PUPR 1/2022 & SE DJBK 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 7. FOUNDATION & PILING (PONDASI DALAM & PENGEBORAN)
  // =========================================================================
  {
    id: 'EQP-028',
    code: 'E.28',
    name: 'Bored Pile Drilling Rig (Diameter Ø600 - 1500 mm, Kedalaman 30 - 50 m)',
    aliases: ['Mesin Bored Pile', 'Rotary Drilling Rig', 'Bauer Drilling Rig', 'Sany SR285', 'Mesin Bor Pondasi'],
    englishName: 'Hydraulic Rotary Bored Pile Drilling Rig',
    category: 'FOUNDATION_PILING',
    subcategory: 'Deep Foundation Drilling',
    equipmentType: 'Tracked Hydraulic Rotary Drill Rig',
    capacity: 'Diameter Pengeboran Maksimal Ø1800 mm (Kedalaman s/d 55 Meter)',
    enginePowerHP: 280,
    unit: 'jam',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 1450000,
    rentalPricePerDay: 11600000,
    rentalPricePerMonth: 230000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 38.0,
    operatorIncluded: true,
    maintenanceFactor: 0.18,
    mobDemobEstimate: 22000000,
    specification: 'Pengeboran pondasi bored pile gedung bertingkat, pier jembatan, dan tiang pancang bor di tanah keras/bebatuan.',
    recommendedBrands: ['Bauer BG 24 / BG 28', 'Sany SR220 / SR285', 'Soilmec SR-60', 'Sunward SWDM220'],
    compatibleWorkItems: ['Pengeboran Bored Pile Ø800 - 1200 mm', 'Pemasangan Temporary Casing'],
    requiredCrew: ['Operator Bored Pile Rig Utama', 'Teknisi Boring Rig', 'Helper'],
    provenance: {
      sourceName: 'Asosiasi Kontraktor Pondasi Indonesia (HAKI) 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-029',
    code: 'E.29',
    name: 'Vibratory Hammer Sheet Pile (Crane / Excavator Mounted)',
    aliases: ['Vibro Hammer', 'Mesin Pasang Sheet Pile', 'Vibro Tiang Pancang', 'Hammer Getar Baja'],
    englishName: 'Hydraulic Sheet Pile Vibratory Hammer',
    category: 'FOUNDATION_PILING',
    subcategory: 'Sheet Piling & Shoring',
    equipmentType: 'Hydraulic High-Frequency Vibratory Driver',
    capacity: 'Gaya Getar Dinamis 350 kN (Penjepit Profil Sheet Pile Baja / Pipa)',
    enginePowerHP: 180,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 650000,
    rentalPricePerDay: 5200000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 20.0,
    operatorIncluded: true,
    maintenanceFactor: 0.14,
    mobDemobEstimate: 4500000,
    specification: 'Pemancangan dan pencabutan sheet pile baja (Corrugated Steel Sheet Pile) untuk turap tebing, tanggul sungai, dan cofferdam.',
    recommendedBrands: ['ICE 1412 / 815C', 'Tomen Vibro Hammer', 'Müller Vibrator', 'Dieseko Group'],
    compatibleWorkItems: ['Pemancangan Sheet Pile Baja FSP III / IV', 'Pemasangan Cofferdam'],
    requiredCrew: ['Operator Vibro Hammer', 'Rigger Pengarah Tiang'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-030',
    code: 'E.30',
    name: 'Grouting Pump & Colloidal High-Speed Mixer System',
    aliases: ['Mesin Grouting', 'Pompa Injeksi Semen', 'Grout Plant', 'Rock Grouting Pump'],
    englishName: 'Colloidal Grout Mixer & High-Pressure Injection Pump',
    category: 'FOUNDATION_PILING',
    subcategory: 'Grouting & Soil Improvement',
    equipmentType: 'Hydraulic Plunger Grout Pump',
    capacity: 'Tekanan Injeksi 0 - 60 Bar (Output Aliran 80 L/menit)',
    enginePowerHP: 22,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 150000,
    rentalPricePerDay: 1200000,
    fuelType: 'LISTRIK',
    fuelConsumptionLiterPerHour: 0,
    operatorIncluded: true,
    maintenanceFactor: 0.08,
    mobDemobEstimate: 1800000,
    specification: 'Injeksi semen tirai (curtain grouting) bendungan, konsolidasi batuan terowongan, perkuatan ground anchor, dan micropile.',
    recommendedBrands: ['Hany Grouttec', 'Obermann Grouting', 'ChemGrout CG-500', 'Atlas Copco Unigrout'],
    compatibleWorkItems: ['Curtain Grouting Bendungan', 'Injeksi Ground Anchor', 'Grouting Tiang Micropile'],
    requiredCrew: ['Operator Grouting', 'Teknisi Tekanan Grout'],
    provenance: {
      sourceName: 'Ditjen SDA PUPR & Komisi Keamanan Bendungan 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 8. FABRICATION & WORKSHOP (FABRIKASI BESI & BAJA)
  // =========================================================================
  {
    id: 'EQP-031',
    code: 'E.31',
    name: 'Mesin Bar Bender & Bar Cutter Listrik (Besi Ø10 - 36 mm)',
    aliases: ['Bar Bender', 'Bar Cutter', 'Mesin Tekuk Besi', 'Mesin Potong Besi Beton'],
    englishName: 'Electric Automatic Rebar Bender & Cutter',
    category: 'FABRICATION',
    subcategory: 'Rebar Fabrication',
    equipmentType: 'Stationary Dual Electric Rebar Machine',
    capacity: 'Diameter Besi Max Ø36 mm Ulir (Kapasitas Tekuk & Potong 3 Batang Sekaligus)',
    enginePowerHP: 7.5,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 35000,
    rentalPricePerDay: 280000,
    rentalPricePerMonth: 5500000,
    fuelType: 'LISTRIK',
    fuelConsumptionLiterPerHour: 0,
    operatorIncluded: false,
    maintenanceFactor: 0.03,
    mobDemobEstimate: 400000,
    specification: 'Pemotongan presisi dan pembengkokan sengkang/begel serta tulangan utama balok, kolom, dan bore pile.',
    recommendedBrands: ['Toyo Bar Bender B-36', 'Taeyon Diamond Korea TYB-D35', 'Strong Bending Machine'],
    compatibleWorkItems: ['Fabrikasi Pembesian Besi Beton Ulir Ø13 - Ø32 mm'],
    requiredCrew: ['Tukang Besi Fabrikator'],
    provenance: {
      sourceName: 'Standar Persewaan Alat Konstruksi Gedung 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-032',
    code: 'E.32',
    name: 'Mesin Las Diesel Genset 300 - 400 Ampere (Welding Machine)',
    aliases: ['Mesin Las Diesel', 'Welder Engine Driven', 'Mesin Las Genset Miller', 'Lincoln Welder'],
    englishName: 'Engine-Driven Diesel Welder 400A',
    category: 'FABRICATION',
    subcategory: 'Field Structural Welding',
    equipmentType: 'Engine Driven DC Inverter Welder',
    capacity: 'Output Pengelasan 400 Ampere (Duty Cycle 100% pada 300A)',
    enginePowerHP: 24,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 75000,
    rentalPricePerDay: 600000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 4.5,
    operatorIncluded: false,
    maintenanceFactor: 0.05,
    mobDemobEstimate: 600000,
    specification: 'Pengelasan struktur baja berat WF, tiang pancang pipa baja, rel kereta api, dan sambungan jembatan di site tanpa listrik.',
    recommendedBrands: ['Miller Big Blue 400X', 'Lincoln Electric Vantage 400', 'Denyo Diesel Welder DLW-400'],
    compatibleWorkItems: ['Pengelasan Sambungan Tiang Pancang Pipa Baja', 'Penyambungan Rangka Baja Gudang'],
    requiredCrew: ['Welder 3G / 4G / 6G Bersertifikat'],
    provenance: {
      sourceName: 'Standar Fabrikasi Baja Konstruksi 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 9. SURVEY & GEODESY INSTRUMENTS (ALAT UKUR PRESISI & DRONE)
  // =========================================================================
  {
    id: 'EQP-033',
    code: 'E.33',
    name: 'Total Station Robotic Reflectorless 1" & Digital Auto Level',
    aliases: ['Total Station', 'TS Robotic', 'Topcon Total Station', 'Leica TS', 'Alat Ukur Tanah'],
    englishName: 'Robotic Total Station & Digital Precision Level',
    category: 'SURVEY_GEODESY',
    subcategory: 'Land & Structural Surveying',
    equipmentType: 'High-Precision Electronic Total Station',
    capacity: 'Akurasi Sudut 1 Detik (Jangkauan EDM Prisma 5.000 Meter, Reflectorless 1.000 Meter)',
    enginePowerHP: 0,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 60000,
    rentalPricePerDay: 480000,
    rentalPricePerMonth: 9500000,
    fuelType: 'LISTRIK',
    fuelConsumptionLiterPerHour: 0,
    operatorIncluded: false,
    maintenanceFactor: 0.04,
    mobDemobEstimate: 300000,
    specification: 'Stake-out as bangunan, pengukuran topografi poligon tertutup, monitoring deformasi gedung dan lereng galian.',
    recommendedBrands: ['Leica TS16 / TS07', 'Topcon GM-101 / GT-1200', 'Sokkia iX-1200', 'Trimble S7'],
    compatibleWorkItems: ['Pengukuran & Bowplank As Bangunan', 'Survey Topografi Jalan & Saluran'],
    requiredCrew: ['Juru Ukur / Surveyor', 'Asisten Surveyor (Prisma Holder)'],
    provenance: {
      sourceName: 'Ikatan Surveyor Indonesia (ISI) & Permen PUPR 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-034',
    code: 'E.34',
    name: 'GNSS RTK Geodetic GPS Base + Rover Dual Frequency',
    aliases: ['GPS Geodetik', 'GNSS RTK', 'GPS Geodesi', 'Trimble GPS RTK', 'CHCNAV i73'],
    englishName: 'Multi-Frequency GNSS RTK Base & Rover System',
    category: 'SURVEY_GEODESY',
    subcategory: 'Geodetic Positioning & Boundary',
    equipmentType: 'Multi-Constellation GNSS Receiver',
    capacity: 'Akurasi RTK Horisontal 8mm + 1ppm, Vertikal 15mm + 1ppm (1408 Channels)',
    enginePowerHP: 0,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 75000,
    rentalPricePerDay: 600000,
    fuelType: 'LISTRIK',
    fuelConsumptionLiterPerHour: 0,
    operatorIncluded: false,
    maintenanceFactor: 0.04,
    mobDemobEstimate: 350000,
    specification: 'Pengukuran batas lahan skala besar, trase jalan tol, benchmark BM PUPR, dan survei penambangan terbuka.',
    recommendedBrands: ['Trimble R12i', 'CHCNAV i89 / i73+', 'South Galaxy G7', 'ComNav SinoGNSS'],
    compatibleWorkItems: ['Pengukuran Benchmark BM', 'Survei Batas Kawasan Lahan Proyek'],
    requiredCrew: ['Surveyor Geodesi'],
    provenance: {
      sourceName: 'Badan Informasi Geospasial (BIG) & PUPR 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-035',
    code: 'E.35',
    name: 'Enterprise LiDAR Mapping Drone UAV with RTK Module',
    aliases: ['Drone LiDAR', 'Drone Pemetaan', 'DJI Matrice LiDAR', 'UAV Photogrammetry'],
    englishName: 'Enterprise LiDAR & Photogrammetry Drone UAV',
    category: 'SURVEY_GEODESY',
    subcategory: 'Aerial Survey & Digital Elevation Model',
    equipmentType: 'Hexacopter Enterprise UAV with LiDAR Sensor',
    capacity: 'Cakupan 200 Hektar per Hari (Point Cloud Density > 200 pts/m²)',
    enginePowerHP: 0,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 150000,
    rentalPricePerDay: 1200000,
    fuelType: 'LISTRIK',
    fuelConsumptionLiterPerHour: 0,
    operatorIncluded: false,
    maintenanceFactor: 0.06,
    mobDemobEstimate: 500000,
    specification: 'Pemetaan kontur tanah terobosan vegetasi rapat, perhitungan volume cut & fill masif, dan monitoring progres 3D.',
    recommendedBrands: ['DJI Matrice 350 RTK + Zenmuse L2 LiDAR', 'WingtraOne GEN II', 'Yuneec H850'],
    compatibleWorkItems: ['Pemetaan Topografi 3D Proyek Jalan Tol / Bendungan', 'Perhitungan Volume Stockpile'],
    requiredCrew: ['Pilot Drone UAV Bersertifikasi FASI/DKPPU', 'GIS Specialist'],
    provenance: {
      sourceName: 'Standar Pemetaan Udara DKPPU & PUPR 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },

  // =========================================================================
  // 10. UTILITY & POWER GENERATION (GENSET & KOMPRESOR PROYEK)
  // =========================================================================
  {
    id: 'EQP-036',
    code: 'E.36',
    name: 'Generator Set / Genset Silent 100 - 150 kVA',
    aliases: ['Genset Proyek 100 kVA', 'Genset Silent Perkins', 'Cummins 100kVA', 'Pembangkit Listrik Proyek'],
    englishName: 'Silent Diesel Generator Set 100kVA',
    category: 'UTILITY_POWER',
    subcategory: 'Site Electrical Power',
    equipmentType: 'Soundproof Silent Diesel Generator',
    capacity: 'Daya 100 kVA / 80 kW (3 Phase 380V / 50 Hz)',
    enginePowerHP: 145,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 140000,
    rentalPricePerDay: 1100000,
    rentalPricePerMonth: 22000000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 15.0,
    operatorIncluded: false,
    maintenanceFactor: 0.06,
    mobDemobEstimate: 1200000,
    specification: 'Catu daya listrik utama untuk tower crane, bar bender, mesin las, batching plant, penerangan malam, dan direksi keet.',
    recommendedBrands: ['Perkins 100 kVA Silent', 'Cummins 6BT 100 kVA', 'Yanmar Genset Silent', 'Denyo DCA-100'],
    compatibleWorkItems: ['Suplai Daya Tower Crane & Alat Fabrikasi', 'Penerangan Kerja Malam Proyek'],
    requiredCrew: ['Teknisi Listrik & Genset Proyek'],
    provenance: {
      sourceName: 'SE DJBK No. 12/SE/Db/2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  },
  {
    id: 'EQP-037',
    code: 'E.37',
    name: 'Air Compressor Portable Diesel 175 - 250 CFM (High Pressure)',
    aliases: ['Kompresor Angin Proyek', 'Air Compressor Diesel', 'Airman Compressor', 'Atlas Copco Kompresor'],
    englishName: 'Portable Diesel Air Compressor 250 CFM',
    category: 'UTILITY_POWER',
    subcategory: 'Pneumatic Power Supply',
    equipmentType: 'Rotary Screw Trailer Air Compressor',
    capacity: 'Debit Udara 250 CFM (Tekanan Operasi 7.0 - 10.0 Bar)',
    enginePowerHP: 75,
    unit: 'hari',
    ownershipMode: 'RENTED',
    rentalPricePerHour: 110000,
    rentalPricePerDay: 880000,
    fuelType: 'SOLAR_INDUSTRI',
    fuelConsumptionLiterPerHour: 10.5,
    operatorIncluded: false,
    maintenanceFactor: 0.05,
    mobDemobEstimate: 900000,
    specification: 'Penyedia udara bertekanan untuk jack hammer pembobol beton, sandblasting baja, pembersihan celah sambungan aspal, dan shotcrete.',
    recommendedBrands: ['Airman PDS185S / PDS265S', 'Atlas Copco XAS 97', 'Doosan Portable Power 185'],
    compatibleWorkItems: ['Pembobokan Beton Jack Hammer', 'Sandblasting Cat Struktur Baja', 'Pembersihan Celah Aspal'],
    requiredCrew: ['Operator Kompresor'],
    provenance: {
      sourceName: 'Standar Rental Alat Pneumatik Nasional 2026',
      effectiveDate: '2026-01-15',
      confidenceScore: 0.95,
      sourceStatus: 'VERIFIED',
    },
    status: 'VERIFIED',
  }
];

export class EquipmentDatabaseService {
  private static instance: EquipmentDatabaseService;
  private equipmentList: EquipmentRecord[] = [];

  private constructor() {
    this.equipmentList = [...MASTER_EQUIPMENT_ROSTER];
  }

  public static getInstance(): EquipmentDatabaseService {
    if (!EquipmentDatabaseService.instance) {
      EquipmentDatabaseService.instance = new EquipmentDatabaseService();
    }
    return EquipmentDatabaseService.instance;
  }

  public getAllEquipment(): EquipmentRecord[] {
    return [...this.equipmentList];
  }

  public getEquipmentById(id: string): EquipmentRecord | undefined {
    return this.equipmentList.find((e) => e.id === id || e.code === id);
  }

  public getEquipmentByCategory(category: EquipmentCategory): EquipmentRecord[] {
    return this.equipmentList.filter((e) => e.category === category);
  }

  /**
   * Multi-field search supporting Indonesian names, English terms, aliases, specs, and brand names.
   */
  public searchEquipment(query: string): EquipmentRecord[] {
    if (!query || !query.trim()) return this.getAllEquipment();
    const q = query.toLowerCase().trim();
    return this.equipmentList.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.englishName && e.englishName.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q) ||
        e.subcategory.toLowerCase().includes(q) ||
        e.capacity.toLowerCase().includes(q) ||
        e.specification.toLowerCase().includes(q) ||
        (e.aliases && e.aliases.some((a) => a.toLowerCase().includes(q))) ||
        (e.compatibleWorkItems && e.compatibleWorkItems.some((w) => w.toLowerCase().includes(q))) ||
        e.recommendedBrands.some((b) => b.toLowerCase().includes(q))
    );
  }

  /**
   * Calculates regional adjusted rental rate across 38 Indonesian provinces.
   */
  public getAdjustedRate(codeOrId: string, provinceName?: string): {
    pricePerHour: number;
    pricePerDay: number;
    pricePerMonth: number;
    factor: number;
    province: string;
  } {
    const item = this.getEquipmentById(codeOrId);
    if (!item) {
      return { pricePerHour: 0, pricePerDay: 0, pricePerMonth: 0, factor: 1.0, province: provinceName || 'Nasional' };
    }

    const factorMap: Record<string, number> = {
      'DKI Jakarta': 1.0,
      'Jawa Barat': 0.98,
      'Jawa Tengah': 0.95,
      'DI Yogyakarta': 0.95,
      'Jawa Timur': 0.97,
      'Banten': 1.0,
      'Bali': 1.05,
      'Nusa Tenggara Barat': 1.12,
      'Nusa Tenggara Timur': 1.25,
      'Sumatera Utara': 1.08,
      'Sumatera Barat': 1.05,
      'Riau': 1.15,
      'Kepulauan Riau': 1.20,
      'Jambi': 1.08,
      'Sumatera Selatan': 1.06,
      'Bangka Belitung': 1.15,
      'Bengkulu': 1.10,
      'Lampung': 1.04,
      'Kalimantan Barat': 1.20,
      'Kalimantan Tengah': 1.22,
      'Kalimantan Selatan': 1.18,
      'Kalimantan Timur': 1.25,
      'Kalimantan Utara': 1.30,
      'Nusantara (IKN)': 1.30,
      'Sulawesi Utara': 1.15,
      'Sulawesi Tengah': 1.18,
      'Sulawesi Selatan': 1.08,
      'Sulawesi Tenggara': 1.20,
      'Gorontalo': 1.15,
      'Sulawesi Barat': 1.16,
      'Maluku': 1.35,
      'Maluku Utara': 1.38,
      'Papua': 1.55,
      'Papua Barat': 1.50,
      'Papua Selatan': 1.55,
      'Papua Tengah': 1.60,
      'Papua Pegunungan': 1.75,
      'Papua Barat Daya': 1.48,
    };

    const factor = provinceName && factorMap[provinceName] ? factorMap[provinceName] : 1.0;
    const adjustedHour = Math.round((item.rentalPricePerHour * factor) / 1000) * 1000;
    const adjustedDay = Math.round((item.rentalPricePerDay * factor) / 5000) * 5000;
    const monthlyBase = item.rentalPricePerMonth || item.rentalPricePerDay * 25;
    const adjustedMonth = Math.round((monthlyBase * factor) / 100000) * 100000;

    return {
      pricePerHour: adjustedHour,
      pricePerDay: adjustedDay,
      pricePerMonth: adjustedMonth,
      factor,
      province: provinceName || 'DKI Jakarta / Acuan Standar 2026',
    };
  }

  /**
   * Adds a new equipment with duplicate prevention by normalized canonical name and code.
   */
  public addEquipment(record: Omit<EquipmentRecord, 'id'>): { success: boolean; data?: EquipmentRecord; error?: string } {
    const cleanName = record.name.trim().toLowerCase();
    const cleanCode = record.code.trim().toUpperCase();

    const existing = this.equipmentList.find(
      (e) => e.code.toUpperCase() === cleanCode || e.name.toLowerCase().trim() === cleanName
    );

    if (existing) {
      return {
        success: false,
        error: `Peralatan dengan kode "${record.code}" atau nama "${record.name}" sudah ada dalam database.`,
      };
    }

    const newRecord: EquipmentRecord = {
      ...record,
      id: `EQP-CUSTOM-${Date.now()}`,
      aliases: record.aliases || [],
      recommendedBrands: record.recommendedBrands || [],
      ownershipMode: record.ownershipMode || 'RENTED',
      fuelType: record.fuelType || 'SOLAR_INDUSTRI',
      status: record.status || 'UNVERIFIED',
    };

    this.equipmentList.unshift(newRecord);
    return { success: true, data: newRecord };
  }

  /**
   * Updates an existing equipment record.
   */
  public updateEquipment(id: string, updates: Partial<EquipmentRecord>): { success: boolean; data?: EquipmentRecord; error?: string } {
    const index = this.equipmentList.findIndex((e) => e.id === id || e.code === id);
    if (index === -1) {
      return { success: false, error: 'Peralatan tidak ditemukan.' };
    }

    const updated = {
      ...this.equipmentList[index],
      ...updates,
      id: this.equipmentList[index].id,
    };

    this.equipmentList[index] = updated;
    return { success: true, data: updated };
  }

  /**
   * Archives an equipment record.
   */
  public archiveEquipment(id: string): boolean {
    const item = this.getEquipmentById(id);
    if (!item) return false;
    item.status = 'ARCHIVED';
    return true;
  }

  /**
   * Exports equipment dataset as JSON string or formatted CSV.
   */
  public exportData(format: 'JSON' | 'CSV' = 'JSON'): string {
    if (format === 'JSON') {
      return JSON.stringify(this.equipmentList, null, 2);
    }

    const headers = [
      'Kode',
      'Nama Peralatan',
      'Kategori',
      'Subkategori',
      'Kapasitas',
      'Tenaga (HP)',
      'Satuan',
      'Sewa / Jam (Rp)',
      'Sewa / Hari (Rp)',
      'Konsumsi BBM (L/jam)',
      'Include Operator',
      'Sumber Regulasi',
      'Status',
    ];

    const rows = this.equipmentList.map((e) => [
      `"${e.code}"`,
      `"${e.name.replace(/"/g, '""')}"`,
      `"${e.category}"`,
      `"${e.subcategory}"`,
      `"${e.capacity.replace(/"/g, '""')}"`,
      e.enginePowerHP,
      `"${e.unit}"`,
      e.rentalPricePerHour,
      e.rentalPricePerDay,
      e.fuelConsumptionLiterPerHour,
      e.operatorIncluded ? 'Ya' : 'Tidak',
      `"${e.provenance.sourceName}"`,
      `"${e.status}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const equipmentDatabaseService = EquipmentDatabaseService.getInstance();
