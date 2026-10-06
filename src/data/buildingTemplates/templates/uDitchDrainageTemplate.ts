import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateSpace, TemplateWorkItem } from '../schema/types';

/**
 * MASTER TEMPLATE: Saluran Drainase Beton Pracetak (Precast U-Ditch)
 * Spesifikasi Standard SDA & Bina Marga 2026:
 * - Galian Tanah Saluran
 * - Pembuangan Tanah Sisa
 * - Pasir Urug Bawah Saluran t=10cm
 * - Lantai Kerja Beton f'c 7.4 MPa (Bo) t=5cm
 * - Pemasangan U-Ditch Precast K-350
 * - Pemasangan Cover U-Ditch (Heavy Duty / Light Duty)
 * - Sambungan Mortar & Urugan Kembali
 */

const DEFAULT_ASSUMPTIONS_UDITCH: Record<string, TemplateAssumption> = {
  trench_side_clearance: {
    assumptionId: 'trench_side_clearance',
    label: 'Kelonggaran Sisi Galian',
    value: 0.15,
    unit: 'm',
    rationale: 'Kelonggaran galian kiri dan kanan saluran untuk manuver pemasangan.',
    source: 'PUPR',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  sand_bed_thickness: {
    assumptionId: 'sand_bed_thickness',
    label: 'Tebal Pasir Urug Alas',
    value: 0.10,
    unit: 'm',
    rationale: 'Tebal pasir alas peredam dan leveling U-Ditch.',
    source: 'PUPR',
    confidence: 0.98,
    editable: true,
    requiresConfirmation: false,
  },
  lean_concrete_thickness: {
    assumptionId: 'lean_concrete_thickness',
    label: 'Tebal Lantai Kerja Beton Bo',
    value: 0.05,
    unit: 'm',
    rationale: 'Lantai kerja beton Bo sebelum instalasi.',
    source: 'PUPR',
    confidence: 0.95,
    editable: true,
    requiresConfirmation: false,
  },
  soil_bulking_factor: {
    assumptionId: 'soil_bulking_factor',
    label: 'Faktor Gembur Tanah',
    value: 1.20,
    unit: 'faktor',
    rationale: 'Ekspansi volume tanah saat digali untuk perhitungan angkutan.',
    source: 'PUPR',
    confidence: 0.90,
    editable: true,
    requiresConfirmation: false,
  },
};

const DEFAULT_PARAMETERS_UDITCH: Record<string, TemplateParameter> = {
  drainageLength: { name: 'drainageLength', label: 'Panjang Saluran', type: 'length', unit: 'm', required: true, defaultValue: 100, min: 1, max: 10000, description: 'Total panjang saluran U-Ditch.', source: 'template_default', confidence: 1.0 },
  uDitchWidth: { name: 'uDitchWidth', label: 'Lebar Dalam U-Ditch', type: 'length', unit: 'm', required: true, defaultValue: 0.40, min: 0.30, max: 2.0, description: 'Lebar bersih saluran (contoh: 30cm, 40cm, 60cm, 80cm, 100cm).', source: 'template_default', confidence: 1.0 },
  uDitchHeight: { name: 'uDitchHeight', label: 'Tinggi U-Ditch', type: 'length', unit: 'm', required: true, defaultValue: 0.40, min: 0.30, max: 2.0, description: 'Tinggi bersih saluran U-Ditch.', source: 'template_default', confidence: 1.0 },
  uDitchWallThickness: { name: 'uDitchWallThickness', label: 'Tebal Dinding U-Ditch', type: 'length', unit: 'm', required: true, defaultValue: 0.07, min: 0.05, max: 0.15, description: 'Tebal dinding beton pracetak.', source: 'template_default', confidence: 0.95 },
  coverType: { name: 'coverType', label: 'Tipe Cover U-Ditch', type: 'enum', required: true, defaultValue: 'HEAVY_DUTY', allowedValues: ['HEAVY_DUTY', 'LIGHT_DUTY', 'TANPA_COVER'], description: 'Jenis penutup saluran (bisa dilewati kendaraan atau hanya pedestrian).', source: 'template_default', confidence: 0.95 },
};

export const UDITCH_WORK_ITEMS: TemplateWorkItem[] = [
  {
    stableId: 'wi-uditch-01',
    wbsCode: '01.01',
    name: 'Pengukuran dan Pematokan Saluran (Uitzet)',
    category: '01_PERSIAPAN',
    unit: 'm1',
    requiredInputs: ['drainageLength'],
    ahspCandidates: [
      { ahspCode: 'A.2.2.1.1', name: '1 m Pengukuran dan pemasangan bowplank/patok', source: 'CIPTA_KARYA_2026', unit: 'm1', matchScore: 0.95, matchRationale: 'Standar patok alignment saluran PUPR', isRecommended: true },
    ],
    quantityRule: (params) => {
      const len = Number(params.drainageLength || 100);
      return {
        quantity: Math.round(len * 100) / 100,
        unit: 'm1',
        formula: 'Panjang Saluran',
        formulaInputs: { drainageLength: len },
        assumptionsUsed: [],
        status: 'calculated',
        confidence: 1.0,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Pematokan Saluran', formulaString: 'L', substitutedValues: { L: len }, result: len, unit: 'm1' }],
      };
    },
  },
  {
    stableId: 'wi-uditch-02',
    wbsCode: '02.01',
    name: 'Galian Tanah Saluran Menggunakan Excavator / Manual',
    category: '02_TANAH',
    unit: 'm3',
    requiredInputs: ['drainageLength', 'uDitchWidth', 'uDitchHeight'],
    ahspCandidates: [
      { ahspCode: 'A.2.3.1.1', name: '1 m3 Galian tanah biasa sedalam 1 m', source: 'CIPTA_KARYA_2026', unit: 'm3', matchScore: 0.95, matchRationale: 'Galian tanah saluran drainase', isRecommended: true },
    ],
    quantityRule: (params, assumptions) => {
      const len = Number(params.drainageLength || 100);
      const wInner = Number(params.uDitchWidth || 0.40);
      const hInner = Number(params.uDitchHeight || 0.40);
      const tWall = Number(params.uDitchWallThickness || 0.07);
      const clearance = Number(assumptions.trench_side_clearance?.value || 0.15);
      const sandThick = Number(assumptions.sand_bed_thickness?.value || 0.10);
      const leanThick = Number(assumptions.lean_concrete_thickness?.value || 0.05);

      const totalTrenchWidth = wInner + (2 * tWall) + (2 * clearance);
      const totalTrenchDepth = hInner + tWall + sandThick + leanThick;
      const vol = len * totalTrenchWidth * totalTrenchDepth;
      const rounded = Math.round(vol * 100) / 100;

      return {
        quantity: rounded,
        unit: 'm3',
        formula: 'Panjang x (Lebar U-Ditch Luar + Clearance) x (Tinggi Luar + Pasir + Lantai Kerja)',
        formulaInputs: { len, totalTrenchWidth, totalTrenchDepth },
        assumptionsUsed: ['trench_side_clearance', 'sand_bed_thickness', 'lean_concrete_thickness'],
        status: 'calculated',
        confidence: 0.96,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Volume Galian Saluran', formulaString: 'L * W * H', substitutedValues: { L: len, W: totalTrenchWidth, H: totalTrenchDepth }, result: rounded, unit: 'm3' }],
      };
    },
  },
  {
    stableId: 'wi-uditch-03',
    wbsCode: '02.02',
    name: 'Urugan Pasir Alas Saluran t=10cm',
    category: '02_TANAH',
    unit: 'm3',
    requiredInputs: ['drainageLength', 'uDitchWidth'],
    ahspCandidates: [
      { ahspCode: 'A.2.3.1.11', name: '1 m3 Pengurugan pasir urug padat', source: 'CIPTA_KARYA_2026', unit: 'm3', matchScore: 0.98, matchRationale: 'Pasir urug bedding saluran', isRecommended: true },
    ],
    quantityRule: (params, assumptions) => {
      const len = Number(params.drainageLength || 100);
      const wInner = Number(params.uDitchWidth || 0.40);
      const tWall = Number(params.uDitchWallThickness || 0.07);
      const clearance = Number(assumptions.trench_side_clearance?.value || 0.15);
      const sandThick = Number(assumptions.sand_bed_thickness?.value || 0.10);

      const trenchWidth = wInner + (2 * tWall) + (2 * clearance);
      const vol = len * trenchWidth * sandThick;
      const rounded = Math.round(vol * 100) / 100;

      return {
        quantity: rounded,
        unit: 'm3',
        formula: 'Panjang x Lebar Parit x Tebal Pasir',
        formulaInputs: { len, trenchWidth, sandThick },
        assumptionsUsed: ['sand_bed_thickness'],
        status: 'calculated',
        confidence: 0.98,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Volume Pasir Urug Bedding', formulaString: 'L * W * T', substitutedValues: { L: len, W: trenchWidth, T: sandThick }, result: rounded, unit: 'm3' }],
      };
    },
  },
  {
    stableId: 'wi-uditch-04',
    wbsCode: '04.01',
    name: 'Lantai Kerja Beton Mutu Rendah Bo (f\'c 7.4 MPa) t=5cm',
    category: '04_STRUKTUR_BETON',
    unit: 'm3',
    requiredInputs: ['drainageLength', 'uDitchWidth'],
    ahspCandidates: [
      { ahspCode: 'A.4.1.1.1', name: '1 m3 Membuat beton mutu f\'c = 7,4 MPa (K 100 / Bo)', source: 'CIPTA_KARYA_2026', unit: 'm3', matchScore: 0.98, matchRationale: 'Lantai kerja beton Bo', isRecommended: true },
    ],
    quantityRule: (params, assumptions) => {
      const len = Number(params.drainageLength || 100);
      const wOuter = Number(params.uDitchWidth || 0.40) + (2 * Number(params.uDitchWallThickness || 0.07));
      const leanThick = Number(assumptions.lean_concrete_thickness?.value || 0.05);
      const vol = len * wOuter * leanThick;
      const rounded = Math.round(vol * 100) / 100;

      return {
        quantity: rounded,
        unit: 'm3',
        formula: 'Panjang x Lebar U-Ditch Luar x Tebal Lantai Kerja',
        formulaInputs: { len, wOuter, leanThick },
        assumptionsUsed: ['lean_concrete_thickness'],
        status: 'calculated',
        confidence: 0.98,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Volume Lantai Kerja', formulaString: 'L * W * T', substitutedValues: { L: len, W: wOuter, T: leanThick }, result: rounded, unit: 'm3' }],
      };
    },
  },
  {
    stableId: 'wi-uditch-05',
    wbsCode: '16.01',
    name: 'Pemasangan Saluran Beton Pracetak U-Ditch',
    category: '16_DRAINASE',
    unit: 'm1',
    requiredInputs: ['drainageLength'],
    ahspCandidates: [
      { ahspCode: 'SDA.01.01', name: 'Pemasangan 1 m1 Saluran U-Ditch Pracetak', source: 'SDA_2026', unit: 'm1', matchScore: 0.98, matchRationale: 'Pemasangan U-Ditch SDA/Bina Marga', isRecommended: true },
    ],
    quantityRule: (params) => {
      const len = Number(params.drainageLength || 100);
      return {
        quantity: Math.round(len * 100) / 100,
        unit: 'm1',
        formula: 'Panjang Saluran',
        formulaInputs: { drainageLength: len },
        assumptionsUsed: [],
        status: 'calculated',
        confidence: 1.0,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Pemasangan U-Ditch', formulaString: 'L', substitutedValues: { L: len }, result: len, unit: 'm1' }],
      };
    },
  },
  {
    stableId: 'wi-uditch-06',
    wbsCode: '16.02',
    name: 'Pemasangan Penutup U-Ditch (Cover U-Ditch)',
    category: '16_DRAINASE',
    unit: 'm1',
    requiredInputs: ['drainageLength', 'coverType'],
    ahspCandidates: [
      { ahspCode: 'SDA.01.02', name: 'Pemasangan 1 m1 Tutup / Cover U-Ditch Beton Pracetak', source: 'SDA_2026', unit: 'm1', matchScore: 0.98, matchRationale: 'Pemasangan cover U-Ditch', isRecommended: true },
    ],
    quantityRule: (params) => {
      const len = Number(params.drainageLength || 100);
      const isWithoutCover = params.coverType === 'TANPA_COVER';
      const qty = isWithoutCover ? 0 : len;
      return {
        quantity: Math.round(qty * 100) / 100,
        unit: 'm1',
        formula: isWithoutCover ? '0 (Tanpa Cover)' : 'Panjang Saluran',
        formulaInputs: { drainageLength: len, coverType: params.coverType },
        assumptionsUsed: [],
        status: 'calculated',
        confidence: 1.0,
        requiresReview: false,
        warnings: isWithoutCover ? ['Pekerjaan cover dilewati karena tipe TANPA_COVER'] : [],
        errors: [],
        calculationTrace: [{ step: 'Pemasangan Cover U-Ditch', formulaString: isWithoutCover ? '0' : 'L', substitutedValues: { L: qty }, result: qty, unit: 'm1' }],
      };
    },
  },
  {
    stableId: 'wi-uditch-07',
    wbsCode: '02.03',
    name: 'Urugan Kembali Tanah Saluran & Pemadatan',
    category: '02_TANAH',
    unit: 'm3',
    requiredInputs: ['drainageLength', 'uDitchWidth', 'uDitchHeight'],
    ahspCandidates: [
      { ahspCode: 'A.2.3.1.9', name: '1 m3 Pengurugan kembali galian tanah', source: 'CIPTA_KARYA_2026', unit: 'm3', matchScore: 0.95, matchRationale: 'Urugan kembali sisi parit', isRecommended: true },
    ],
    quantityRule: (params, assumptions) => {
      const len = Number(params.drainageLength || 100);
      const hInner = Number(params.uDitchHeight || 0.40);
      const tWall = Number(params.uDitchWallThickness || 0.07);
      const clearance = Number(assumptions.trench_side_clearance?.value || 0.15);
      const vol = len * (2 * clearance) * (hInner + tWall);
      const rounded = Math.round(vol * 100) / 100;

      return {
        quantity: rounded,
        unit: 'm3',
        formula: 'Panjang x (2 x Clearance Sisi) x Tinggi Saluran',
        formulaInputs: { len, clearance, hInner, tWall },
        assumptionsUsed: ['trench_side_clearance'],
        status: 'calculated',
        confidence: 0.92,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Volume Urugan Kembali', formulaString: 'L * 2W * H', substitutedValues: { L: len, W: clearance, H: hInner + tWall }, result: rounded, unit: 'm3' }],
      };
    },
  },
];

export const UDITCH_DRAINAGE_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-uditch-drainage',
  code: 'DRAIN-UDITCH',
  name: 'Saluran Drainase Beton Pracetak (U-Ditch PUPR/SDA)',
  category: 'drainage',
  version: '2026.1.0',
  status: 'reviewed',
  description: 'Template parametrik saluran drainase U-Ditch beton pracetak lengkap dengan galian tanah, pasir urug alas, lantai kerja Bo, pemasangan cover, dan urugan kembali.',
  applicableProjectTypes: ['Saluran Drainase Jalan', 'Saluran Kawasan Perumahan', 'Saluran Irigasi Tersier'],
  units: { length: 'm', area: 'm²', volume: 'm³' },
  parameters: DEFAULT_PARAMETERS_UDITCH,
  assumptions: DEFAULT_ASSUMPTIONS_UDITCH,
  spaces: [],
  structuralSystem: {
    foundation: 'Pasir Urug t=10cm + Lantai Kerja Beton Mutu Bo t=5cm',
    superstructure: 'U-Ditch Beton Pracetak K-350 Mutu Tinggi',
    roofStructure: 'Cover U-Ditch Beton Pracetak Bertulang HD/LD',
  },
  materialSystem: {
    wall: 'Beton Pracetak K-350 Precast Concrete',
    floor: 'Beton Mutu Bo f\'c 7.4 MPa',
    ceiling: 'N/A',
    roofCover: 'Penutup U-Ditch Heavy/Light Duty',
  },
  workItems: UDITCH_WORK_ITEMS,
  limitations: [
    'Harga belum termasuk sewa crane / mobile lifter jika U-Ditch ukuran besar (> 1.2m).',
    'Mengasumsikan tanah galian adalah tanah biasa (bukan batu cadas / rawa berair deras).',
  ],
  sourceMetadata: {
    standardReference: 'Spesifikasi Umum SDA 2026 & AHSP PUPR Bina Marga 2026',
    lastUpdated: '2026-03-01',
    author: 'EZRAB Civil & Drainage Engineering Group',
  },
  reviewStatus: {
    isReviewed: true,
    reviewedBy: 'Senior Drainage Engineer',
    reviewedDate: '2026-03-01',
  },
};
