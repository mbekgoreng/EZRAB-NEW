import { MasterBuildingTemplate, TemplateAssumption, TemplateParameter, TemplateWorkItem } from '../schema/types';

/**
 * MASTER TEMPLATE: Infrastruktur Jalan Beton / Rigid Pavement
 * Sourced from: Permen PUPR & AHSP Bina Marga 2026
 */

const DEFAULT_ASSUMPTIONS_ROAD: Record<string, TemplateAssumption> = {
  slab_thickness: { assumptionId: 'slab_thickness', label: 'Tebal Pelat Beton', value: 0.20, unit: 'm', rationale: 'Tebal perkerasan kaku beton 20 cm.', source: 'PUPR', confidence: 0.98, editable: true, requiresConfirmation: false },
  subbase_thickness: { assumptionId: 'subbase_thickness', label: 'Tebal Lapis Pondasi Agregat A', value: 0.15, unit: 'm', rationale: 'Lapis pondasi bawah agregat kelas A tebal 15 cm.', source: 'PUPR', confidence: 0.95, editable: true, requiresConfirmation: false },
  lean_concrete_thickness: { assumptionId: 'lean_concrete_thickness', label: 'Tebal Lantai Kerja Lean Concrete', value: 0.05, unit: 'm', rationale: 'Beton kurus B-0 / K-125 tebal 5 cm.', source: 'PUPR', confidence: 0.95, editable: true, requiresConfirmation: false },
  shoulder_width: { assumptionId: 'shoulder_width', label: 'Lebar Bahu Jalan Kiri & Kanan', value: 1.0, unit: 'm', rationale: 'Bahu jalan agregat kelas B lebar 1 m kiri-kanan.', source: 'PUPR', confidence: 0.90, editable: true, requiresConfirmation: false },
};

const DEFAULT_PARAMETERS_ROAD: Record<string, TemplateParameter> = {
  roadLength: { name: 'roadLength', label: 'Panjang Jalan', type: 'length', unit: 'm', required: true, defaultValue: 500, min: 10, max: 50000, description: 'Panjang trase jalan dalam meter.', source: 'template_default', confidence: 1.0 },
  roadWidth: { name: 'roadWidth', label: 'Lebar Badan Jalan', type: 'length', unit: 'm', required: true, defaultValue: 6.0, min: 3.0, max: 15.0, description: 'Lebar perkerasan beton efektif.', source: 'template_default', confidence: 1.0 },
  slabThickness: { name: 'slabThickness', label: 'Tebal Pelat Beton', type: 'dimension', unit: 'm', required: true, defaultValue: 0.20, min: 0.12, max: 0.35, description: 'Tebal cor beton rigid pavement.', source: 'template_default', confidence: 1.0 },
};

export const CONCRETE_ROAD_WORK_ITEMS: TemplateWorkItem[] = [
  {
    stableId: 'road-persiapan-01',
    wbsCode: '01.01',
    name: 'Pembersihan dan Pengupasan Lahan Trase Jalan',
    category: '15_INFRASTRUKTUR_JALAN',
    unit: 'm²',
    requiredInputs: ['roadLength', 'roadWidth'],
    ahspCandidates: [
      { ahspCode: 'BM.3.4.1.1', name: 'Pembersihan dan pengupasan lahan', source: 'BINA_MARGA_2026', unit: 'm²', matchScore: 98, matchRationale: 'Pembersihan trase jalan.', isRecommended: true },
    ],
    defaultAhspCode: 'BM.3.4.1.1',
    quantityRule: (params) => {
      const l = Number(params.roadLength || 500);
      const w = Number(params.roadWidth || 6);
      // Lebar badan + 2m bahu
      const totalWidth = w + 2.0;
      const area = l * totalWidth;
      return {
        quantity: Math.round(area * 100) / 100,
        unit: 'm²',
        formula: 'Panjang Jalan × (Lebar Jalan + 2m Bahu Jalan)',
        formulaInputs: { roadLength: l, roadWidth: w, totalWidth },
        assumptionsUsed: ['Pembersihan mencakup badan jalan dan 2 bahu jalan.'],
        status: 'calculated',
        confidence: 0.98,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Hitung Luas Pembersihan Trase', formulaString: '${l} * (${w} + 2)', substitutedValues: { l, totalWidth }, result: area, unit: 'm²' }],
      };
    },
  },
  {
    stableId: 'road-agregat-01',
    wbsCode: '02.01',
    name: 'Lapis Pondasi Agregat Kelas A (Tebal 15 cm)',
    category: '15_INFRASTRUKTUR_JALAN',
    unit: 'm³',
    requiredInputs: ['roadLength', 'roadWidth'],
    ahspCandidates: [
      { ahspCode: 'BM.5.1.1.1', name: 'Lapis Pondasi Agregat Kelas A', source: 'BINA_MARGA_2026', unit: 'm³', matchScore: 99, matchRationale: 'Lapis pondasi bawah perkerasan beton.', isRecommended: true },
    ],
    defaultAhspCode: 'BM.5.1.1.1',
    quantityRule: (params, assumptions) => {
      const l = Number(params.roadLength || 500);
      const w = Number(params.roadWidth || 6);
      const t = Number(assumptions.subbase_thickness?.value || 0.15);
      const vol = l * w * t;
      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Panjang Jalan × Lebar Jalan × Tebal Agregat (0.15m)',
        formulaInputs: { roadLength: l, roadWidth: w, tebal: t },
        assumptionsUsed: ['Tebal hamparan padat lapis pondasi agregat kelas A 15 cm.'],
        status: 'calculated',
        confidence: 0.98,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Hitung Volume Agregat Kelas A', formulaString: '${l} * ${w} * ${t}', substitutedValues: { l, w, t }, result: vol, unit: 'm³' }],
      };
    },
  },
  {
    stableId: 'road-beton-01',
    wbsCode: '03.01',
    name: 'Perkerasan Beton Semen / Rigid Pavement (Mutu fs 4.5 MPa / K-300)',
    category: '15_INFRASTRUKTUR_JALAN',
    unit: 'm³',
    requiredInputs: ['roadLength', 'roadWidth', 'slabThickness'],
    ahspCandidates: [
      { ahspCode: 'BM.5.3.1.1', name: 'Perkerasan Beton Semen (Rigid Pavement)', source: 'BINA_MARGA_2026', unit: 'm³', matchScore: 99, matchRationale: 'Pelat beton jalan rigid mutu tinggi.', isRecommended: true },
    ],
    defaultAhspCode: 'BM.5.3.1.1',
    quantityRule: (params) => {
      const l = Number(params.roadLength || 500);
      const w = Number(params.roadWidth || 6);
      const t = Number(params.slabThickness || 0.20);
      const vol = l * w * t;
      return {
        quantity: Math.round(vol * 100) / 100,
        unit: 'm³',
        formula: 'Panjang Jalan × Lebar Jalan × Tebal Pelat Beton',
        formulaInputs: { roadLength: l, roadWidth: w, slabThickness: t },
        assumptionsUsed: ['Cor beton ready mix fs 4.5 MPa / K-300.'],
        status: 'calculated',
        confidence: 0.99,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Hitung Volume Beton Jalan', formulaString: '${l} * ${w} * ${t}', substitutedValues: { l, w, t }, result: vol, unit: 'm³' }],
      };
    },
  },
  {
    stableId: 'road-wiremesh-01',
    wbsCode: '03.02',
    name: 'Pembesian Wiremesh Ulir M8 1 Lapis',
    category: '15_INFRASTRUKTUR_JALAN',
    unit: 'kg',
    requiredInputs: ['roadLength', 'roadWidth'],
    ahspCandidates: [
      { ahspCode: 'BM.5.3.1.5', name: 'Baja Tulangan untuk Perkerasan Beton (Wiremesh)', source: 'BINA_MARGA_2026', unit: 'kg', matchScore: 98, matchRationale: 'Tulangan susut dan lentur pelat beton.', isRecommended: true },
    ],
    defaultAhspCode: 'BM.5.3.1.5',
    quantityRule: (params) => {
      const l = Number(params.roadLength || 500);
      const w = Number(params.roadWidth || 6);
      const luas = l * w;
      // Berat wiremesh M8 per m2 = 4.44 kg/m2 + overlap 10% = ~4.88 kg/m2
      const kg = luas * 4.88;
      return {
        quantity: Math.round(kg * 100) / 100,
        unit: 'kg',
        formula: 'Luas Pelat Beton × Berat Wiremesh M8 (4.88 kg/m² incl. overlap)',
        formulaInputs: { roadLength: l, roadWidth: w, luas, unitWeight: 4.88 },
        assumptionsUsed: ['Wiremesh M8 single layer dengan overlap sambungan 15 cm.'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Hitung Total Berat Wiremesh', formulaString: '${luas} * 4.88', substitutedValues: { luas }, result: kg, unit: 'kg' }],
      };
    },
  },
  {
    stableId: 'road-joint-01',
    wbsCode: '03.03',
    name: 'Pemotongan & Pengisian Sambungan Contraction Joint (Sealant)',
    category: '15_INFRASTRUKTUR_JALAN',
    unit: 'm\'',
    requiredInputs: ['roadLength', 'roadWidth'],
    ahspCandidates: [
      { ahspCode: 'BM.5.3.1.8', name: 'Sambungan Contraction Joint dan Sealant', source: 'BINA_MARGA_2026', unit: 'm\'', matchScore: 98, matchRationale: 'Joint cutting interval 5 meter.', isRecommended: true },
    ],
    defaultAhspCode: 'BM.5.3.1.8',
    quantityRule: (params) => {
      const l = Number(params.roadLength || 500);
      const w = Number(params.roadWidth || 6);
      // Interval joint melintang setiap 5 meter
      const jumlahPotongan = Math.floor(l / 5);
      const panjangMelintang = jumlahPotongan * w;
      // Joint memanjang di as tengah jalan
      const panjangMemanjang = l;
      const totalJoint = panjangMelintang + panjangMemanjang;
      return {
        quantity: Math.round(totalJoint * 100) / 100,
        unit: 'm\'',
        formula: '(Jumlah Joint Melintang × Lebar) + Panjang Trase Memanjang',
        formulaInputs: { roadLength: l, roadWidth: w, jumlahPotongan, totalJoint },
        assumptionsUsed: ['Joint melintang setiap interval 5 meter + 1 joint memanjang tengah.'],
        status: 'calculated',
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        errors: [],
        calculationTrace: [{ step: 'Hitung Total Panjang Joint Cutting', formulaString: '(${jumlahPotongan} * ${w}) + ${l}', substitutedValues: { jumlahPotongan, w, l }, result: totalJoint, unit: 'm\'' }],
      };
    },
  },
];

export const CONCRETE_ROAD_TEMPLATE: MasterBuildingTemplate = {
  id: 'template-concrete-road-rigid-pavement',
  code: 'INFRA-ROAD-CONCRETE',
  name: 'Infrastruktur Jalan Beton (Rigid Pavement)',
  category: 'road',
  version: '2026.1.0',
  status: 'verified',
  description: 'Template master estimasi RAB pekerjaan perkerasan kaku beton semen (rigid pavement) standar Bina Marga 2026.',
  applicableProjectTypes: ['concrete_road', 'jalan_beton', 'rigid_pavement', 'jalan_desa', 'jalan_kawasan'],
  units: { length: 'm', area: 'm²', volume: 'm³' },
  parameters: DEFAULT_PARAMETERS_ROAD,
  assumptions: DEFAULT_ASSUMPTIONS_ROAD,
  spaces: [],
  structuralSystem: {
    foundation: 'Lapis Pondasi Agregat Kelas A Tebal 15 cm',
    superstructure: 'Pelat Beton Semen fs 4.5 MPa / K-300 Tebal 20 cm',
    roofStructure: 'None (Perkerasan Jalan)',
  },
  materialSystem: {
    wall: 'None',
    floor: 'Beton K-300 + Wiremesh M8 + Sealant Joint',
    ceiling: 'None',
    roofCover: 'None',
  },
  workItems: CONCRETE_ROAD_WORK_ITEMS,
  limitations: [
    'Estimasi perkerasan rigid tipikal tanpa perbaikan tanah khusus (geotekstil / cerucuk).',
    'Jarak angkut batching plant dan kondisi lalu lintas eksisting mempengaruhi biaya mobilisasi.',
  ],
  sourceMetadata: {
    standardReference: 'Spesifikasi Umum Bina Marga 2018 Rev. 2 & AHSP Bina Marga 2026',
    lastUpdated: '2026-09-14',
    author: 'EZRAB Infrastructure Engineering Team',
  },
  reviewStatus: { isReviewed: true, reviewedBy: 'Highway & Pavement Specialist', reviewedDate: '2026-09-14' },
};
