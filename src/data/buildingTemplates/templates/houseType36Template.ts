import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateSpace, TemplateWorkItem, VolumeCalculationResult } from '../schema/types';

/**
 * MASTER TEMPLATE: Rumah Tinggal Sederhana Tipe 36 Satu Lantai
 * Standard Specification: Dinding Hebel 10cm, Atap Rangka Baja Ringan, Keramik 40x40, Plafon Gypsum
 */

const DEFAULT_ASSUMPTIONS_T36: Record<string, TemplateAssumption> = {
  galian_width: {
    assumptionId: 'galian_width',
    label: 'Lebar Galian Pondasi',
    value: 0.8,
    unit: 'm',
    rationale: 'Lebar dasar galian tanah untuk pondasi batu kali standar perumahan 1 lantai.',
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
    rationale: 'Kedalaman tanah keras standar bangunan 1 lantai beban ringan.',
    source: 'SNI',
    confidence: 0.92,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_height: {
    assumptionId: 'pondasi_height',
    label: 'Tinggi Pondasi Batu Kali',
    value: 0.6,
    unit: 'm',
    rationale: 'Tinggi trapesium pasangan batu kali.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_top_width: {
    assumptionId: 'pondasi_top_width',
    label: 'Lebar Atas Pondasi Batu Kali',
    value: 0.3,
    unit: 'm',
    rationale: 'Lebar kepala pondasi penumpu sloof 15/20.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  pondasi_bottom_width: {
    assumptionId: 'pondasi_bottom_width',
    label: 'Lebar Bawah Pondasi Batu Kali',
    value: 0.6,
    unit: 'm',
    rationale: 'Lebar dasar trapesium pondasi.',
    source: 'SNI',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  sloof_width: {
    assumptionId: 'sloof_width',
    label: 'Lebar Penampang Sloof',
    value: 0.15,
    unit: 'm',
    rationale: 'Lebar sloof standar perumahan 15 cm.',
    source: 'PUPR',
    confidence: 0.98,
    editable: true,
    requiresConfirmation: false,
  },
  sloof_height: {
    assumptionId: 'sloof_height',
    label: 'Tinggi Penampang Sloof',
    value: 0.20,
    unit: 'm',
    rationale: 'Tinggi sloof standar perumahan 20 cm.',
    source: 'PUPR',
    confidence: 0.98,
    editable: true,
    requiresConfirmation: false,
  },
  kolom_size: {
    assumptionId: 'kolom_size',
    label: 'Dimensi Kolom Praktis (Persegi)',
    value: 0.15,
    unit: 'm',
    rationale: 'Kolom praktis beton bertulang 15x15 cm.',
    source: 'PUPR',
    confidence: 0.98,
    editable: true,
    requiresConfirmation: false,
  },
  ring_balok_size: {
    assumptionId: 'ring_balok_size',
    label: 'Dimensi Ring Balok',
    value: 0.15,
    unit: 'm',
    rationale: 'Ring balok penutup dinding 15x15 cm.',
    source: 'PUPR',
    confidence: 0.98,
    editable: true,
    requiresConfirmation: false,
  },
  wall_height: {
    assumptionId: 'wall_height',
    label: 'Tinggi Dinding Bersih',
    value: 3.5,
    unit: 'm',
    rationale: 'Tinggi pasangan dinding dari elevasi lantai ke bawah ring balok.',
    source: 'BEST_PRACTICE',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  roof_slope_angle: {
    assumptionId: 'roof_slope_angle',
    label: 'Sudut Kemiringan Atap (Derajat)',
    value: 30,
    unit: 'deg',
    rationale: 'Kemiringan standar atap genteng metal / spandek untuk drainase air hujan tropis.',
    source: 'PUPR',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  roof_overhang: {
    assumptionId: 'roof_overhang',
    label: 'Overstek / Teritisan Atap',
    value: 0.8,
    unit: 'm',
    rationale: 'Panjang tritisan keluar dinding untuk pelindung tampias hujan.',
    source: 'BEST_PRACTICE',
    confidence: 0.92,
    editable: true,
    requiresConfirmation: false,
  },
  waste_factor_general: {
    assumptionId: 'waste_factor_general',
    label: 'Faktor Waste Material Standar',
    value: 1.05,
    unit: 'multiplier',
    rationale: 'Toleransi pemotongan dan susut material 5%.',
    source: 'EMPIRICAL_ESTIMATOR',
    confidence: 0.90,
    editable: true,
    requiresConfirmation: false,
  },
};

const DEFAULT_SPACES_T36: TemplateSpace[] = [
  { id: 'sp-1', name: 'Ruang Tamu & Keluarga', defaultLength: 3.0, defaultWidth: 3.0, defaultArea: 9.0 },
  { id: 'sp-2', name: 'Kamar Tidur Utama', defaultLength: 3.0, defaultWidth: 3.0, defaultArea: 9.0 },
  { id: 'sp-3', name: 'Kamar Tidur Anak', defaultLength: 3.0, defaultWidth: 2.5, defaultArea: 7.5 },
  { id: 'sp-4', name: 'Kamar Mandi / WC', defaultLength: 1.5, defaultWidth: 1.5, defaultArea: 2.25, isWetArea: true },
  { id: 'sp-5', name: 'Dapur & Ruang Makan', defaultLength: 3.0, defaultWidth: 2.0, defaultArea: 6.0 },
  { id: 'sp-6', name: 'Teras Depan', defaultLength: 1.5, defaultWidth: 1.5, defaultArea: 2.25 },
];

const DEFAULT_PARAMETERS_T36: Record<string, TemplateParameter> = {
  buildingArea: {
    name: 'buildingArea',
    label: 'Luas Bangunan',
    type: 'area',
    unit: 'm²',
    required: true,
    defaultValue: 36,
    min: 20,
    max: 60,
    description: 'Luas lantai bersih bangunan rumah tinggal.',
    source: 'template_default',
    confidence: 1.0,
  },
  buildingWidth: {
    name: 'buildingWidth',
    label: 'Lebar Bangunan',
    type: 'length',
    unit: 'm',
    required: true,
    defaultValue: 6.0,
    min: 4.0,
    max: 10.0,
    description: 'Lebar muka bangunan (fasad depan).',
    source: 'template_default',
    confidence: 1.0,
  },
  buildingLength: {
    name: 'buildingLength',
    label: 'Panjang Bangunan',
    type: 'length',
    unit: 'm',
    required: true,
    defaultValue: 6.0,
    min: 4.0,
    max: 15.0,
    description: 'Panjang ke belakang bangunan.',
    source: 'template_default',
    confidence: 1.0,
  },
  floorCount: {
    name: 'floorCount',
    label: 'Jumlah Lantai',
    type: 'integer',
    unit: 'lantai',
    required: true,
    defaultValue: 1,
    min: 1,
    max: 1,
    description: 'Jumlah lantai bangunan.',
    source: 'template_default',
    confidence: 1.0,
  },
  bedroomCount: {
    name: 'bedroomCount',
    label: 'Jumlah Kamar Tidur',
    type: 'count',
    unit: 'ruang',
    required: true,
    defaultValue: 2,
    min: 1,
    max: 3,
    description: 'Jumlah kamar tidur.',
    source: 'template_default',
    confidence: 1.0,
  },
  bathroomCount: {
    name: 'bathroomCount',
    label: 'Jumlah Kamar Mandi',
    type: 'count',
    unit: 'ruang',
    required: true,
    defaultValue: 1,
    min: 1,
    max: 2,
    description: 'Jumlah kamar mandi / toilet.',
    source: 'template_default',
    confidence: 1.0,
  },
  wallMaterial: {
    name: 'wallMaterial',
    label: 'Material Dinding',
    type: 'enum',
    required: true,
    defaultValue: 'BATA_RINGAN',
    allowedValues: ['BATA_RINGAN', 'BATA_MERAH', 'BATAKO'],
    description: 'Jenis material pasangan dinding utama.',
    source: 'template_default',
    confidence: 0.95,
  },
  roofCover: {
    name: 'roofCover',
    label: 'Penutup Atap',
    type: 'enum',
    required: true,
    defaultValue: 'GENTENG_METAL',
    allowedValues: ['GENTENG_METAL', 'SPANDEK', 'GENTENG_BETON', 'GENTENG_KERAMIK'],
    description: 'Jenis penutup atap.',
    source: 'template_default',
    confidence: 0.95,
  },
  floorFinish: {
    name: 'floorFinish',
    label: 'Penutup Lantai Utama',
    type: 'enum',
    required: true,
    defaultValue: 'KERAMIK_40X40',
    allowedValues: ['KERAMIK_40X40', 'KERAMIK_50X50', 'GRANIT_60X60'],
    description: 'Jenis penutup lantai ruangan.',
    source: 'template_default',
    confidence: 0.95,
  },
  doorWindowType: {
    name: 'doorWindowType',
    label: 'Tipe Kusen Pintu & Jendela',
    type: 'enum',
    required: true,
    defaultValue: 'ALUMINIUM_4_INCH',
    allowedValues: ['ALUMINIUM_4_INCH', 'KAYU_KAMPER', 'UPVC'],
    description: 'Material kusen pintu dan jendela.',
    source: 'template_default',
    confidence: 0.95,
  },
};

export const HOUSE_TYPE_36_WORK_ITEMS: TemplateWorkItem[] = [
  // ===========================================================================
  // 01. PEKERJAAN PERSIAPAN
  // ===========================================================================
  {
    stableId: 't36-persiapan-01',
    wbsCode: '01.01',
    name: 'Pembersihan dan Perataan Lapangan Proyek',
    category: '01_PERSIAPAN',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.2.2.1.9',
        name: 'Pembersihan dan perataan lapangan',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 95,
        matchRationale: 'Standar pembersihan lokasi sebelum konstruksi.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.2.2.1.9',
    quantityRule: (params) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      // Area + 1m working buffer around building
      const qty = (w + 2) * (l + 2);
      return {
        quantity: Math.round(qty * 100) / 100,
        unit: 'm²',
        formula: '(Lebar Bangunan + 2m) × (Panjang Bangunan + 2m)',
        formulaInputs: { buildingWidth: w, buildingLength: l, buffer: 2 },
        assumptionsUsed: ['Buffer kerja 1 meter di sekeliling bangunan.'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Area Pembersihan',
            formulaString: '(${w} + 2) * (${l} + 2)',
            substitutedValues: { widthWithBuffer: w + 2, lengthWithBuffer: l + 2 },
            result: qty,
            unit: 'm²',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-persiapan-02',
    wbsCode: '01.02',
    name: 'Pengukuran dan Pemasangan Bouwplank / Bowplank Kayu',
    category: '01_PERSIAPAN',
    unit: 'm\'',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.2.2.1.4',
        name: 'Pemasangan Bouwplank',
        source: 'CIPTA_KARYA_2026',
        unit: 'm\'',
        matchScore: 98,
        matchRationale: 'Bouwplank keliling bangunan + offset 1 meter.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.2.2.1.4',
    quantityRule: (params) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const keliling = 2 * ((w + 2) + (l + 2));
      return {
        quantity: Math.round(keliling * 100) / 100,
        unit: 'm\'',
        formula: '2 × ((Lebar + 2m) + (Panjang + 2m))',
        formulaInputs: { buildingWidth: w, buildingLength: l, offset: 1 },
        assumptionsUsed: ['Bouwplank dipasang 1 meter keluar as dinding luar.'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Keliling Bouwplank',
            formulaString: '2 * ((${w} + 2) + (${l} + 2))',
            substitutedValues: { wOffset: w + 2, lOffset: l + 2 },
            result: keliling,
            unit: 'm\'',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 02. PEKERJAAN TANAH & PONDASI
  // ===========================================================================
  {
    stableId: 't36-tanah-01',
    wbsCode: '02.01',
    name: 'Galian Tanah Pondasi Batu Kali (Kedalaman s.d 1m)',
    category: '02_TANAH',
    unit: 'm³',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.2.3.1.1',
        name: 'Penggalian 1 m3 tanah biasa sedalam 1 m',
        source: 'CIPTA_KARYA_2026',
        unit: 'm³',
        matchScore: 96,
        matchRationale: 'Galian manual pondasi lajur bangunan perumahan.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.2.3.1.1',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      // Total panjang as pondasi: keliling luar + sekat ruangan = 2*(w+l) + 1.5*w + 0.5*l = ~42m
      const totalPanjangPondasi = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const lebarGalian = Number(assumptions.galian_width?.value || 0.8);
      const dalamGalian = Number(assumptions.galian_depth?.value || 0.8);

      const vol = totalPanjangPondasi * lebarGalian * dalamGalian;
      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Total Panjang As Pondasi × Lebar Galian × Kedalaman Galian',
        formulaInputs: { totalPanjangPondasi, lebarGalian, dalamGalian },
        assumptionsUsed: ['Panjang as pondasi mencakup keliling dan partisi ruangan interior.'],
        status: 'calculated',
        confidence: 0.90,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Volume Galian Tanah',
            formulaString: '${totalPanjangPondasi}m * ${lebarGalian}m * ${dalamGalian}m',
            substitutedValues: { totalPanjangPondasi, lebarGalian, dalamGalian },
            result: vol,
            unit: 'm³',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-tanah-02',
    wbsCode: '02.02',
    name: 'Urugan Pasir Bawah Pondasi Tebal 5 cm',
    category: '02_TANAH',
    unit: 'm³',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.2.3.1.11',
        name: 'Pengurugan 1 m3 dengan pasir urug',
        source: 'CIPTA_KARYA_2026',
        unit: 'm³',
        matchScore: 94,
        matchRationale: 'Lapisan perataan pasir urug bawah pondasi.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.2.3.1.11',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjangPondasi = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const lebarGalian = Number(assumptions.galian_width?.value || 0.8);
      const tebalPasir = 0.05;

      const vol = totalPanjangPondasi * lebarGalian * tebalPasir;
      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Panjang Pondasi × Lebar Galian × Tebal Pasir (0.05m)',
        formulaInputs: { totalPanjangPondasi, lebarGalian, tebalPasir },
        assumptionsUsed: ['Tebal urugan pasir 5 cm.'],
        status: 'calculated',
        confidence: 0.92,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Volume Pasir Urug Pondasi',
            formulaString: '${totalPanjangPondasi} * ${lebarGalian} * 0.05',
            substitutedValues: { totalPanjangPondasi, lebarGalian, tebalPasir },
            result: vol,
            unit: 'm³',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-pondasi-01',
    wbsCode: '03.01',
    name: 'Pasangan Pondasi Batu Kali Belah 1:5',
    category: '03_PONDASI',
    unit: 'm³',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.3.2.1.2',
        name: 'Pemasangan 1 m3 pondasi batu belah campuran 1SP : 5PP',
        source: 'CIPTA_KARYA_2026',
        unit: 'm³',
        matchScore: 98,
        matchRationale: 'Pondasi lajur batu belah penumpu dinding 1 lantai.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.3.2.1.2',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjangPondasi = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const a = Number(assumptions.pondasi_top_width?.value || 0.3);
      const b = Number(assumptions.pondasi_bottom_width?.value || 0.6);
      const t = Number(assumptions.pondasi_height?.value || 0.6);

      const luasPenampang = ((a + b) / 2) * t;
      const vol = totalPanjangPondasi * luasPenampang;

      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Panjang Pondasi × [((Lebar Atas + Lebar Bawah) / 2) × Tinggi]',
        formulaInputs: { totalPanjangPondasi, topWidth: a, bottomWidth: b, height: t },
        assumptionsUsed: ['Penampang trapesium batu kali standar.'],
        status: 'calculated',
        confidence: 0.94,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Trapesium Penampang',
            formulaString: '((${a} + ${b}) / 2) * ${t}',
            substitutedValues: { a, b, t },
            result: luasPenampang,
            unit: 'm²',
          },
          {
            step: 'Hitung Volume Total Batu Kali',
            formulaString: '${totalPanjangPondasi} * ${luasPenampang}',
            substitutedValues: { totalPanjangPondasi, luasPenampang },
            result: vol,
            unit: 'm³',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 04. PEKERJAAN STRUKTUR BETON BERTULANG
  // ===========================================================================
  {
    stableId: 't36-struktur-01',
    wbsCode: '04.01',
    name: 'Beton Sloof Praktis 15/20 cm Bertulang K-225',
    category: '04_STRUKTUR_BETON',
    unit: 'm³',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.1.1.28',
        name: 'Pembuatan 1 m3 sloof beton bertulang (200 kg besi + bekisting)',
        source: 'CIPTA_KARYA_2026',
        unit: 'm³',
        matchScore: 96,
        matchRationale: 'Sloof pengikat pondasi dan perata beban dinding.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.1.1.28',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjangSloof = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const b = Number(assumptions.sloof_width?.value || 0.15);
      const h = Number(assumptions.sloof_height?.value || 0.20);
      const vol = totalPanjangSloof * b * h;

      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Panjang Sloof × Lebar Sloof (0.15m) × Tinggi Sloof (0.20m)',
        formulaInputs: { totalPanjangSloof, width: b, height: h },
        assumptionsUsed: ['Dimensi sloof 15x20 cm.'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Volume Beton Sloof',
            formulaString: '${totalPanjangSloof} * ${b} * ${h}',
            substitutedValues: { totalPanjangSloof, b, h },
            result: vol,
            unit: 'm³',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-struktur-02',
    wbsCode: '04.02',
    name: 'Beton Kolom Praktis 15/15 cm Bertulang K-225',
    category: '04_STRUKTUR_BETON',
    unit: 'm³',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.1.1.35',
        name: 'Pembuatan 1 m3 kolom praktis beton bertulang (11x11 sd 15x15)',
        source: 'CIPTA_KARYA_2026',
        unit: 'm³',
        matchScore: 98,
        matchRationale: 'Kolom praktis pengaku dinding setiap pertemuan & sudut.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.1.1.35',
    quantityRule: (_params, assumptions) => {
      // 12 titik kolom pada rumah tipe 36 (sudut luar + pertemuan partisi dalam)
      const jumlahTitik = 12;
      const tinggiKolom = Number(assumptions.wall_height?.value || 3.5);
      const size = Number(assumptions.kolom_size?.value || 0.15);
      const vol = jumlahTitik * (size * size * tinggiKolom);

      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Jumlah Titik Kolom (12) × (0.15m × 0.15m × Tinggi Dinding)',
        formulaInputs: { jumlahTitik, size, tinggiKolom },
        assumptionsUsed: ['Jumlah titik kolom praktis 12 titik untuk denah tipe 36.'],
        status: 'calculated',
        confidence: 0.94,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Volume Total Kolom Praktis',
            formulaString: '12 * (${size} * ${size} * ${tinggiKolom})',
            substitutedValues: { jumlahTitik, size, tinggiKolom },
            result: vol,
            unit: 'm³',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-struktur-03',
    wbsCode: '04.03',
    name: 'Beton Ring Balok 15/15 cm Bertulang K-225',
    category: '04_STRUKTUR_BETON',
    unit: 'm³',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.1.1.36',
        name: 'Pembuatan 1 m3 ring balok beton bertulang (15x15 cm)',
        source: 'CIPTA_KARYA_2026',
        unit: 'm³',
        matchScore: 98,
        matchRationale: 'Ring balok pengikat atas penumpu kuda-kuda.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.1.1.36',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjang = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const size = Number(assumptions.ring_balok_size?.value || 0.15);
      const vol = totalPanjang * size * size;

      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Panjang Ring Balok × 0.15m × 0.15m',
        formulaInputs: { totalPanjang, size },
        assumptionsUsed: ['Dimensi ring balok 15x15 cm.'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Volume Beton Ring Balok',
            formulaString: '${totalPanjang} * ${size} * ${size}',
            substitutedValues: { totalPanjang, size },
            result: vol,
            unit: 'm³',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 05. PEKERJAAN DINDING, PLESTERAN & ACIAN
  // ===========================================================================
  {
    stableId: 't36-dinding-01',
    wbsCode: '05.01',
    name: 'Pasangan Dinding Bata Ringan (Hebel) Tebal 10 cm + Perekat Mortar',
    category: '05_DINDING',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.4.1.1',
        name: 'Pemasangan 1 m2 dinding bata ringan tebal 10 cm dengan mortar siap pakai',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 99,
        matchRationale: 'Dinding bata ringan hebel modern presisi tinggi.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.4.1.1',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjangDinding = (2 * (w + l)) + (1.5 * w) + (0.5 * l); // ~42m
      const tinggiDinding = Number(assumptions.wall_height?.value || 3.5);
      const luasKotor = totalPanjangDinding * tinggiDinding;
      // Kurangi bukaan pintu & jendela (Pintu Utama: 2m², Pintu Kamar: 2x1.8=3.6m², Pintu KM: 1.4m², Jendela: 5m² -> Total Bukaan: ~12m²)
      const luasBukaanPintuJendela = 12.0;
      const luasBersih = Math.max(0, luasKotor - luasBukaanPintuJendela);

      return {
        quantity: Math.round(luasBersih * 100) / 100,
        unit: 'm²',
        formula: '(Total Panjang Dinding × Tinggi Dinding) − Luas Bukaan Pintu Jendela (12m²)',
        formulaInputs: { totalPanjangDinding, tinggiDinding, luasKotor, luasBukaanPintuJendela },
        assumptionsUsed: ['Deduksi bukaan pintu dan jendela sebesar 12 m².'],
        status: 'calculated',
        confidence: 0.94,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Kotor Dinding',
            formulaString: '${totalPanjangDinding} * ${tinggiDinding}',
            substitutedValues: { totalPanjangDinding, tinggiDinding },
            result: luasKotor,
            unit: 'm²',
          },
          {
            step: 'Kurangi Luas Bukaan Pintu & Jendela',
            formulaString: '${luasKotor} - ${luasBukaanPintuJendela}',
            substitutedValues: { luasKotor, luasBukaanPintuJendela },
            result: luasBersih,
            unit: 'm²',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-dinding-02',
    wbsCode: '06.01',
    name: 'Plesteran Dinding Mortar 1:4 Tebal 15 mm (2 Sisi)',
    category: '06_PLESTERAN_ACIAN',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.4.2.4',
        name: 'Pemasangan 1 m2 plesteran 1 SP : 4 PP tebal 15 mm',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 98,
        matchRationale: 'Plesteran dinding bata 2 sisi luar dan dalam.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.4.2.4',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjangDinding = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const tinggiDinding = Number(assumptions.wall_height?.value || 3.5);
      const luasBersih1Sisi = Math.max(0, (totalPanjangDinding * tinggiDinding) - 12.0);
      const luas2Sisi = luasBersih1Sisi * 2;

      return {
        quantity: Math.round(luas2Sisi * 100) / 100,
        unit: 'm²',
        formula: 'Luas Bersih Pasangan Dinding × 2 Sisi',
        formulaInputs: { luasBersih1Sisi, multiplier: 2 },
        assumptionsUsed: ['Plesteran diterapkan pada kedua sisi dinding (interior & eksterior).'],
        status: 'calculated',
        confidence: 0.94,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Plesteran 2 Sisi',
            formulaString: '${luasBersih1Sisi} * 2',
            substitutedValues: { luasBersih1Sisi },
            result: luas2Sisi,
            unit: 'm²',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-dinding-03',
    wbsCode: '06.02',
    name: 'Acian Dinding Semen Instan (2 Sisi)',
    category: '06_PLESTERAN_ACIAN',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.4.2.27',
        name: 'Pemasangan 1 m2 acian',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 98,
        matchRationale: 'Acian halus siap cat.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.4.2.27',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjangDinding = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const tinggiDinding = Number(assumptions.wall_height?.value || 3.5);
      const luasBersih1Sisi = Math.max(0, (totalPanjangDinding * tinggiDinding) - 12.0);
      const luas2Sisi = luasBersih1Sisi * 2;

      return {
        quantity: Math.round(luas2Sisi * 100) / 100,
        unit: 'm²',
        formula: 'Luas Bersih Pasangan Dinding × 2 Sisi',
        formulaInputs: { luasBersih1Sisi, multiplier: 2 },
        assumptionsUsed: ['Acian diterapkan di atas plesteran 2 sisi.'],
        status: 'calculated',
        confidence: 0.94,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Acian 2 Sisi',
            formulaString: '${luasBersih1Sisi} * 2',
            substitutedValues: { luasBersih1Sisi },
            result: luas2Sisi,
            unit: 'm²',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 07. PEKERJAAN LANTAI & PENUTUP LANTAI
  // ===========================================================================
  {
    stableId: 't36-lantai-01',
    wbsCode: '07.01',
    name: 'Rabat Beton Lantai Kerja Tebal 5 cm',
    category: '07_LANTAI',
    unit: 'm²',
    requiredInputs: ['buildingArea'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.1.1.1',
        name: 'Pembuatan 1 m3 lantai kerja beton mutu f\'c = 7,4 MPa (K-100)',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 92,
        matchRationale: 'Lantai kerja perata bawah keramik tebal 5cm.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.1.1.1',
    quantityRule: (params) => {
      const area = Number(params.buildingArea || 36);
      return {
        quantity: area,
        unit: 'm²',
        formula: 'Luas Lantai Bangunan',
        formulaInputs: { buildingArea: area },
        assumptionsUsed: ['Sesuai luas lantai bangunan 36 m².'],
        status: 'calculated',
        confidence: 0.98,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Luas Lantai Kerja',
            formulaString: '${area}',
            substitutedValues: { area },
            result: area,
            unit: 'm²',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-lantai-02',
    wbsCode: '07.02',
    name: 'Pasangan Penutup Lantai Keramik 40x40 cm Standar',
    category: '07_LANTAI',
    unit: 'm²',
    requiredInputs: ['buildingArea'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.4.3.35',
        name: 'Pemasangan 1 m2 lantai keramik ukuran 40 cm x 40 cm',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 98,
        matchRationale: 'Keramik lantai ruangan utama dan kamar tidur.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.4.3.35',
    quantityRule: (params) => {
      const area = Number(params.buildingArea || 36);
      // Ruang kering (36m2 - 2.25m2 KM) = 33.75 m2
      const areaKering = area - 2.25;
      return {
        quantity: Math.round(areaKering * 100) / 100,
        unit: 'm²',
        formula: 'Luas Lantai Bersih Ruang Kering (Luas Total − Luas KM)',
        formulaInputs: { buildingArea: area, kmArea: 2.25 },
        assumptionsUsed: ['Area kamar mandi dipisahkan menggunakan keramik anti-slip.'],
        status: 'calculated',
        confidence: 0.96,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Keramik Ruang Kering',
            formulaString: '${area} - 2.25',
            substitutedValues: { area },
            result: areaKering,
            unit: 'm²',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-lantai-03',
    wbsCode: '07.03',
    name: 'Pasangan Keramik Lantai Kamar Mandi 20x20 cm (Anti Slip)',
    category: '07_LANTAI',
    unit: 'm²',
    requiredInputs: ['bathroomCount'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.4.3.31',
        name: 'Pemasangan 1 m2 lantai keramik ukuran 20 cm x 20 cm',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 98,
        matchRationale: 'Keramik kasar tekstur anti slip kamar mandi.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.4.3.31',
    quantityRule: (params) => {
      const count = Number(params.bathroomCount || 1);
      const areaKM = count * 2.25;
      return {
        quantity: areaKM,
        unit: 'm²',
        formula: 'Jumlah Kamar Mandi × 2.25 m²',
        formulaInputs: { bathroomCount: count, defaultAreaPerKM: 2.25 },
        assumptionsUsed: ['Dimensi kamar mandi standar 1.5 × 1.5 m.'],
        status: 'calculated',
        confidence: 0.98,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Keramik Lantai KM',
            formulaString: '${count} * 2.25',
            substitutedValues: { count },
            result: areaKM,
            unit: 'm²',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 08. PEKERJAAN PLAFON
  // ===========================================================================
  {
    stableId: 't36-plafon-01',
    wbsCode: '08.01',
    name: 'Plafon Gypsum Board 9 mm + Rangka Hollow Galvanis 40x40 & 20x40',
    category: '08_PLAFON',
    unit: 'm²',
    requiredInputs: ['buildingArea'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.5.1.7',
        name: 'Pemasangan 1 m2 langit-langit gypsum board tebal 9 mm rangka hollow',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 99,
        matchRationale: 'Plafon gypsum rangka hollow standar perumahan modern.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.5.1.7',
    quantityRule: (params) => {
      const area = Number(params.buildingArea || 36);
      return {
        quantity: area,
        unit: 'm²',
        formula: 'Luas Lantai Bangunan (36 m²)',
        formulaInputs: { buildingArea: area },
        assumptionsUsed: ['Plafon menutup seluruh denah ruangan horizontal.'],
        status: 'calculated',
        confidence: 0.98,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Plafon',
            formulaString: '${area}',
            substitutedValues: { area },
            result: area,
            unit: 'm²',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 09. PEKERJAAN ATAP
  // ===========================================================================
  {
    stableId: 't36-atap-01',
    wbsCode: '09.01',
    name: 'Rangka Atap Kuda-Kuda Baja Ringan C75.75 + Reng U32',
    category: '09_ATAP',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.2.1.22',
        name: 'Pemasangan 1 m2 rangka atap baja ringan profil C',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 99,
        matchRationale: 'Rangka atap truss baja ringan tahan rayap.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.2.1.22',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const overstek = Number(assumptions.roof_overhang?.value || 0.8);
      const slopeDeg = Number(assumptions.roof_slope_angle?.value || 30);
      const cosSlope = Math.cos((slopeDeg * Math.PI) / 180);

      // Luas proyeksi horizontal atap = (Lebar + 2*overstek) * (Panjang + 2*overstek)
      const luasProyeksi = (w + (2 * overstek)) * (l + (2 * overstek));
      // Luas bidang miring atap = Luas Proyeksi / cos(kemiringan)
      const luasAtapMiring = luasProyeksi / cosSlope;

      return {
        quantity: Math.round(luasAtapMiring * 100) / 100,
        unit: 'm²',
        formula: '((Lebar + 2×Overstek) × (Panjang + 2×Overstek)) / cos(Kemiringan 30°)',
        formulaInputs: { buildingWidth: w, buildingLength: l, overstek, slopeDeg, luasProyeksi },
        assumptionsUsed: ['Kemiringan atap 30 derajat, overstek 0.8 meter keliling.'],
        status: 'calculated',
        confidence: 0.96,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Proyeksi Horizontal Atap',
            formulaString: '(${w} + 1.6) * (${l} + 1.6)',
            substitutedValues: { wProj: w + (2 * overstek), lProj: l + (2 * overstek) },
            result: luasProyeksi,
            unit: 'm²',
          },
          {
            step: 'Hitung Luas Bidang Miring Atap',
            formulaString: '${luasProyeksi} / cos(30°)',
            substitutedValues: { luasProyeksi, cosSlope },
            result: luasAtapMiring,
            unit: 'm²',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-atap-02',
    wbsCode: '09.02',
    name: 'Penutup Atap Genteng Metal Berpasir',
    category: '09_ATAP',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.5.2.32',
        name: 'Pemasangan 1 m2 atap genteng metal',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 99,
        matchRationale: 'Penutup genteng metal pasir warna.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.5.2.32',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const overstek = Number(assumptions.roof_overhang?.value || 0.8);
      const slopeDeg = Number(assumptions.roof_slope_angle?.value || 30);
      const cosSlope = Math.cos((slopeDeg * Math.PI) / 180);

      const luasProyeksi = (w + (2 * overstek)) * (l + (2 * overstek));
      const luasAtapMiring = luasProyeksi / cosSlope;

      return {
        quantity: Math.round(luasAtapMiring * 100) / 100,
        unit: 'm²',
        formula: 'Luas Bidang Miring Atap',
        formulaInputs: { luasAtapMiring },
        assumptionsUsed: ['Sama dengan luas rangka atap.'],
        status: 'calculated',
        confidence: 0.96,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Genteng Metal',
            formulaString: '${luasAtapMiring}',
            substitutedValues: { luasAtapMiring },
            result: luasAtapMiring,
            unit: 'm²',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 10. PEKERJAAN KUSEN, PINTU DAN JENDELA
  // ===========================================================================
  {
    stableId: 't36-kusen-01',
    wbsCode: '10.01',
    name: 'Kusen Pintu dan Jendela Aluminium 4 Inch (Powder Coating)',
    category: '10_KUSEN_PINTU_JENDELA',
    unit: 'm\'',
    requiredInputs: [],
    ahspCandidates: [
      {
        ahspCode: 'A.4.6.1.1',
        name: 'Pemasangan 1 m\' kusen pintu / jendela aluminium 4 inch',
        source: 'CIPTA_KARYA_2026',
        unit: 'm\'',
        matchScore: 98,
        matchRationale: 'Kusen profil aluminium 4 inch standar rumah modern.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.6.1.1',
    quantityRule: () => {
      // 1 Pintu Utama (5.5m'), 2 Pintu Kamar (2 x 5.2m' = 10.4m'), 1 Pintu KM (4.8m'), 4 Jendela (4 x 4.2m' = 16.8m') -> Total ~37.5 m'
      const totalPanjangKusen = 37.5;
      return {
        quantity: totalPanjangKusen,
        unit: 'm\'',
        formula: 'Total Panjang Keliling Kusen Seluruh Pintu & Jendela (37.5 m\')',
        formulaInputs: { pintuUtama: 5.5, pintuKamar: 10.4, pintuKM: 4.8, jendela: 16.8 },
        assumptionsUsed: ['Pintu Utama (1 unit), Pintu Kamar (2 unit), Pintu KM (1 unit), Jendela (4 unit).'],
        status: 'calculated',
        confidence: 0.92,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Total Panjang Kusen Aluminium',
            formulaString: '5.5 + 10.4 + 4.8 + 16.8',
            substitutedValues: { total: totalPanjangKusen },
            result: totalPanjangKusen,
            unit: 'm\'',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-kusen-02',
    wbsCode: '10.02',
    name: 'Daun Pintu Panel Kayu Solid / Engineering (Utama & Kamar)',
    category: '10_KUSEN_PINTU_JENDELA',
    unit: 'unit',
    requiredInputs: ['bedroomCount'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.6.1.5',
        name: 'Pemasangan 1 unit daun pintu panel kayu',
        source: 'CIPTA_KARYA_2026',
        unit: 'unit',
        matchScore: 98,
        matchRationale: 'Pintu utama dan kamar tidur.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.6.1.5',
    quantityRule: (params) => {
      const bedrooms = Number(params.bedroomCount || 2);
      const totalPintuKayu = 1 + bedrooms; // 1 Utama + Kamar
      return {
        quantity: totalPintuKayu,
        unit: 'unit',
        formula: '1 Pintu Utama + Jumlah Kamar Tidur',
        formulaInputs: { pintuUtama: 1, bedroomCount: bedrooms },
        assumptionsUsed: ['Daun pintu kamar mandi menggunakan pintu PVC terpisah.'],
        status: 'calculated',
        confidence: 1.0,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Jumlah Pintu Kayu',
            formulaString: '1 + ${bedrooms}',
            substitutedValues: { bedrooms },
            result: totalPintuKayu,
            unit: 'unit',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 11. PEKERJAAN PENGECATAN
  // ===========================================================================
  {
    stableId: 't36-cat-01',
    wbsCode: '11.01',
    name: 'Pengecatan Dinding Interior Emulsi (1 Lapis Dasar + 2 Lapis Penutup)',
    category: '11_PENGECATAN',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.7.1.10',
        name: 'Pengecatan 1 m2 tembok baru (1 lapis plamir, 1 lapis dasar, 2 lapis penutup)',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 98,
        matchRationale: 'Cat dinding interior emulsi akrilik.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.7.1.10',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const totalPanjangDinding = (2 * (w + l)) + (1.5 * w) + (0.5 * l);
      const tinggiDinding = Number(assumptions.wall_height?.value || 3.5);
      const luasDinding1Sisi = Math.max(0, (totalPanjangDinding * tinggiDinding) - 12.0);
      // Sisi dalam (sekitar 70% dari total 2 sisi)
      const luasInterior = luasDinding1Sisi * 1.35;

      return {
        quantity: Math.round(luasInterior * 100) / 100,
        unit: 'm²',
        formula: 'Luas Dinding Bersih Bagian Dalam Ruangan',
        formulaInputs: { luasInterior },
        assumptionsUsed: ['Dinding interior mencakup seluruh ruang tamu, kamar, dapur, dan lorong.'],
        status: 'calculated',
        confidence: 0.92,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Cat Dinding Interior',
            formulaString: '${luasDinding1Sisi} * 1.35',
            substitutedValues: { luasDinding1Sisi },
            result: luasInterior,
            unit: 'm²',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-cat-02',
    wbsCode: '11.02',
    name: 'Pengecatan Dinding Eksterior Weathershield Tahan Cuaca',
    category: '11_PENGECATAN',
    unit: 'm²',
    requiredInputs: ['buildingWidth', 'buildingLength'],
    ahspCandidates: [
      {
        ahspCode: 'A.4.7.1.11',
        name: 'Pengecatan 1 m2 tembok luar / eksterior weathershield',
        source: 'CIPTA_KARYA_2026',
        unit: 'm²',
        matchScore: 98,
        matchRationale: 'Cat dinding luar tahan lumut dan cuaca tropis.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.4.7.1.11',
    quantityRule: (params, assumptions) => {
      const w = Number(params.buildingWidth || 6);
      const l = Number(params.buildingLength || 6);
      const kelilingLuar = 2 * (w + l);
      const tinggiDinding = Number(assumptions.wall_height?.value || 3.5);
      const luasKotorLuar = kelilingLuar * tinggiDinding;
      // Kurangi bukaan luar ~6m2
      const luasEksterior = Math.max(0, luasKotorLuar - 6.0);

      return {
        quantity: Math.round(luasEksterior * 100) / 100,
        unit: 'm²',
        formula: '(Keliling Luar × Tinggi Dinding) − Luas Bukaan Luar (6m²)',
        formulaInputs: { kelilingLuar, tinggiDinding, luasEksterior },
        assumptionsUsed: ['Cat eksterior diterapkan pada 4 sisi tampak luar bangunan.'],
        status: 'calculated',
        confidence: 0.94,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Luas Cat Eksterior',
            formulaString: '(${kelilingLuar} * ${tinggiDinding}) - 6',
            substitutedValues: { kelilingLuar, tinggiDinding },
            result: luasEksterior,
            unit: 'm²',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 12. PEKERJAAN SANITASI & PLUMBING
  // ===========================================================================
  {
    stableId: 't36-sanitasi-01',
    wbsCode: '12.01',
    name: 'Pemasangan Kloset Jongkok Porselen / Duduk Standar',
    category: '12_SANITASI',
    unit: 'unit',
    requiredInputs: ['bathroomCount'],
    ahspCandidates: [
      {
        ahspCode: 'A.5.1.1.2',
        name: 'Pemasangan 1 unit kloset jongkok porselen',
        source: 'CIPTA_KARYA_2026',
        unit: 'unit',
        matchScore: 98,
        matchRationale: 'Kloset standar perumahan sederhana.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.5.1.1.2',
    quantityRule: (params) => {
      const count = Number(params.bathroomCount || 1);
      return {
        quantity: count,
        unit: 'unit',
        formula: 'Jumlah Kamar Mandi',
        formulaInputs: { bathroomCount: count },
        assumptionsUsed: ['1 kloset per kamar mandi.'],
        status: 'calculated',
        confidence: 1.0,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Jumlah Kloset',
            formulaString: '${count}',
            substitutedValues: { count },
            result: count,
            unit: 'unit',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-sanitasi-02',
    wbsCode: '12.02',
    name: 'Pembuatan Septic Tank Biofil Kapasitas 500 Liter + Resapan',
    category: '12_SANITASI',
    unit: 'unit',
    requiredInputs: [],
    ahspCandidates: [
      {
        ahspCode: 'A.5.1.1.19',
        name: 'Pemasangan 1 unit biofilter septic tank kapasitas 0.5 - 1.0 m3',
        source: 'CIPTA_KARYA_2026',
        unit: 'unit',
        matchScore: 98,
        matchRationale: 'Septic tank ramah lingkungan anti kuras.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.5.1.1.19',
    quantityRule: () => {
      return {
        quantity: 1,
        unit: 'unit',
        formula: '1 Unit per Rumah Tinggal',
        formulaInputs: {},
        assumptionsUsed: ['1 unit septic tank biofil kapasitas 500L untuk rumah 1 keluarga.'],
        status: 'calculated',
        confidence: 1.0,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Jumlah Septic Tank',
            formulaString: '1',
            substitutedValues: {},
            result: 1,
            unit: 'unit',
          },
        ],
      };
    },
  },

  // ===========================================================================
  // 14. PEKERJAAN INSTALASI LISTRIK
  // ===========================================================================
  {
    stableId: 't36-listrik-01',
    wbsCode: '14.01',
    name: 'Pemasangan Titik Instalasi Lampu Penerangan Kabel NYM 2x1.5 mm²',
    category: '14_INSTALASI_LISTRIK',
    unit: 'titik',
    requiredInputs: [],
    ahspCandidates: [
      {
        ahspCode: 'A.6.1.1.1',
        name: 'Pemasangan 1 titik lampu penerangan kabel NYM 2x1.5 mm2',
        source: 'CIPTA_KARYA_2026',
        unit: 'titik',
        matchScore: 99,
        matchRationale: 'Titik lampu interior dan eksterior rumah tipe 36.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.6.1.1.1',
    quantityRule: () => {
      // 2 Teras & Carport, 1 Ruang Tamu, 2 Kamar Tidur, 1 KM, 1 Dapur, 1 Belakang = 8 Titik
      const titikLampu = 8;
      return {
        quantity: titikLampu,
        unit: 'titik',
        formula: 'Total Titik Lampu Standar Rumah Tipe 36 (8 Titik)',
        formulaInputs: { titikLampu },
        assumptionsUsed: ['8 titik lampu mencakup seluruh ruangan dan teras depan/belakang.'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Jumlah Titik Lampu',
            formulaString: '8',
            substitutedValues: {},
            result: titikLampu,
            unit: 'titik',
          },
        ],
      };
    },
  },
  {
    stableId: 't36-listrik-02',
    wbsCode: '14.02',
    name: 'Pemasangan Titik Stop Kontak & Saklar Kabel NYM 3x2.5 mm²',
    category: '14_INSTALASI_LISTRIK',
    unit: 'titik',
    requiredInputs: [],
    ahspCandidates: [
      {
        ahspCode: 'A.6.1.1.2',
        name: 'Pemasangan 1 titik stop kontak kabel NYM 3x2.5 mm2',
        source: 'CIPTA_KARYA_2026',
        unit: 'titik',
        matchScore: 99,
        matchRationale: 'Titik daya stop kontak peralatan elektronik.',
        isRecommended: true,
      },
    ],
    defaultAhspCode: 'A.6.1.1.2',
    quantityRule: () => {
      const titikDaya = 6;
      return {
        quantity: titikDaya,
        unit: 'titik',
        formula: 'Total Titik Stop Kontak Standar (6 Titik)',
        formulaInputs: { titikDaya },
        assumptionsUsed: ['Stop kontak di ruang tamu (2), kamar tidur (2), dapur (1), pompa air (1).'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [
          {
            step: 'Hitung Jumlah Titik Stop Kontak',
            formulaString: '6',
            substitutedValues: {},
            result: titikDaya,
            unit: 'titik',
          },
        ],
      };
    },
  },
];

export const HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-house-type-36-single-floor',
  code: 'HOUSE-T36-1FL',
  name: 'Rumah Tinggal Sederhana Tipe 36 (1 Lantai)',
  category: 'residential',
  version: '2026.1.0',
  status: 'verified',
  description: 'Template master estimasi RAB rumah tinggal 1 lantai tipe 36 m² dengan struktur beton bertulang, dinding hebel, dan atap baja ringan.',
  applicableProjectTypes: ['residential_house', 'rumah_sederhana', 'rumah_subsidi', 'rumah_tipe_36'],
  units: {
    length: 'm',
    area: 'm²',
    volume: 'm³',
  },
  parameters: DEFAULT_PARAMETERS_T36,
  assumptions: DEFAULT_ASSUMPTIONS_T36,
  spaces: DEFAULT_SPACES_T36,
  structuralSystem: {
    foundation: 'Pondasi Batu Kali Belah 1:5 + Urugan Pasir',
    superstructure: 'Sloof 15/20, Kolom Praktis 15/15, Ring Balok 15/15 (Beton K-225)',
    roofStructure: 'Kuda-kuda & Reng Baja Ringan Profil C75.75 & U32.45',
  },
  materialSystem: {
    wall: 'Bata Ringan (Hebel) Tebal 10 cm + Plester Acian Mortar',
    floor: 'Keramik 40x40 cm Standar + Rabat Beton 5 cm',
    ceiling: 'Gypsum Board 9 mm + Rangka Hollow Galvanis',
    roofCover: 'Genteng Metal Berpasir / Spandek 0.30 mm',
  },
  workItems: HOUSE_TYPE_36_WORK_ITEMS,
  limitations: [
    'Template ini adalah estimasi awal parametrik berbasis standar geometri tipikal.',
    'Kondisi tanah lunak, lereng curam, atau struktur gempa khusus memerlukan analisis DED oleh tenaga ahli berwenang.',
    'Harga satuan final bergantung pada survei harga material dan upah di lokasi proyek yang dipilih.',
  ],
  sourceMetadata: {
    standardReference: 'Permen PUPR No. 1/2022 & AHSP Cipta Karya 2026',
    lastUpdated: '2026-09-14',
    author: 'EZRAB Construction Engineering AI Team',
  },
  reviewStatus: {
    isReviewed: true,
    reviewedBy: 'Senior QS & Civil Engineer',
    reviewedDate: '2026-09-14',
  },
};
