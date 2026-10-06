/**
 * EZRAB — ROAD & HIGHWAY QUANTITY CALCULATOR PACK (PHASE 6)
 * Complete 39 Calculator Definitions for Civil Infrastructure
 * Strictly typed against CalculatorDefinition & CalculationOutput.
 */

import {
  CalculatorDefinition,
  CalculationContext,
  CalculationInput,
  CalculationOutput,
  FormulaProvenance,
  ValidationSummary,
  CalculationWarning,
} from '../contracts/types';
import { RoadAlignmentEngine } from './engines/roadAlignmentEngine';
import { RoadEarthworkEngine } from './engines/roadEarthworkEngine';
import { RoadPavementLayerEngine } from './engines/roadPavementLayerEngine';
import { RoadSurfaceTreatmentEngine } from './engines/roadSurfaceTreatmentEngine';
import { RoadElementsEngine } from './engines/roadElementsEngine';
import { GeosyntheticQuantityEngine } from './engines/geosyntheticQuantityEngine';
import { RoadSafetyAccessoriesEngine } from './engines/roadSafetyAccessoriesEngine';
import { RoadJointEngine } from './engines/roadJointEngine';
import { RoadHaulingEngine } from './engines/roadHaulingEngine';
import { RoadOwnershipEngine } from './engines/roadOwnershipEngine';
import { SafeDecimalEngine } from '../../safeDecimalEngine';

function toNum(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  return Number.isNaN(num) ? fallback : num;
}

function createRoadOutput(params: {
  calculatorId: string;
  version: string;
  primaryQuantity: number;
  primaryUnit: string;
  primaryLabel: string;
  breakdown: Record<string, number>;
  formulaSource: FormulaProvenance;
  warnings?: CalculationWarning[];
  validation?: ValidationSummary;
}): CalculationOutput {
  return {
    calculatorId: params.calculatorId,
    version: params.version,
    primaryQuantity: params.primaryQuantity,
    primaryUnit: params.primaryUnit,
    primaryLabel: params.primaryLabel,
    breakdown: params.breakdown,
    detailedBreakdown: Object.entries(params.breakdown).map(([code, value]) => ({
      code,
      label: code,
      formulaText: '',
      value,
      unit: params.primaryUnit,
    })),
    materials: [],
    labor: [],
    equipment: [],
    warnings: params.warnings || [],
    provenance: [params.formulaSource],
    status: params.formulaSource.status,
    validation: params.validation || {
      isValid: true,
      errors: [],
      warnings: params.warnings || [],
      sanitizedInputs: {},
    },
    timestamp: new Date().toISOString(),
  };
}

export const ROAD_PACK_CALCULATORS: CalculatorDefinition[] = [
  // =========================================================================
  // CORE ROAD (1 - 11)
  // =========================================================================

  // 1. road.alignment
  {
    id: 'road.alignment',
    name: 'Road Alignment (Trase & Geometri Jalan)',
    shortName: 'Road Alignment',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung panjang total trase jalan, panjang bagian lurus (tangent), dan panjang lengkung horizontal (curve).',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Trase Jalan',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Trase (L)', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'tangentLength', label: 'Panjang Lurus Tangent', unit: 'm', defaultValue: 850, min: 0 },
      { id: 'curveLength', label: 'Panjang Lengkung Curve', unit: 'm', defaultValue: 150, min: 0 },
      { id: 'pavementWidth', label: 'Lebar Perkerasan', unit: 'm', defaultValue: 7.0, min: 1.0 },
    ],
    formulaSource: {
      calculatorId: 'road.alignment',
      calculatorVersion: '1.0.0',
      formulaId: 'ROAD_ALIGNMENT_SUM',
      mathematicalExpression: 'L_total = L_tangent + L_curve',
      sourceType: 'verified_reference',
      workbook: 'BINA_MARGA_2024',
      sheet: 'Geometri',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length || inputs.lengthMeters, 1000);
      const tangent = toNum(inputs.tangentLength, 850);
      const curve = toNum(inputs.curveLength, 150);
      const width = toNum(inputs.pavementWidth, 7.0);

      const totalL = L > 0 ? L : SafeDecimalEngine.safeAdd(tangent, curve);
      const area = SafeDecimalEngine.safeMultiply(totalL, width, 3);

      return createRoadOutput({
        calculatorId: 'road.alignment',
        version: '1.0.0',
        primaryQuantity: totalL,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Trase Jalan',
        breakdown: {
          panjangTotalM: totalL,
          panjangTangentM: tangent,
          panjangCurveM: curve,
          lebarPerkerasanM: width,
          luasPermukaanM2: area,
        },
        formulaSource: {
          calculatorId: 'road.alignment',
          calculatorVersion: '1.0.0',
          formulaId: 'ROAD_ALIGNMENT_SUM',
          mathematicalExpression: 'L_total = L_tangent + L_curve',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 2. road.stationing
  {
    id: 'road.stationing',
    name: 'Road Stationing (Penomoran Titik Stasiun Jalan)',
    shortName: 'Road Stationing',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung interval stasiun, jumlah titik patok stasiun (STA), dan penomoran stasioning.',
    primaryUnit: 'titik',
    primaryQuantityLabel: 'Jumlah Patok Stasiun (STA)',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Trase Jalan', unit: 'm', defaultValue: 1000, min: 1, required: true },
      { id: 'interval', label: 'Interval Antar Stasiun', unit: 'm', defaultValue: 25, min: 1, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.stationing',
      calculatorVersion: '1.0.0',
      formulaId: 'STATION_COUNT',
      mathematicalExpression: 'N_sta = floor(L / interval) + 1',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length || inputs.lengthMeters, 1000);
      const interval = Math.max(1, toNum(inputs.interval || inputs.stationIntervalMeters, 25));
      const count = Math.floor(L / interval) + 1;

      return createRoadOutput({
        calculatorId: 'road.stationing',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'titik',
        primaryLabel: 'Jumlah Patok Stasiun (STA)',
        breakdown: {
          jumlahTitikStasiun: count,
          intervalStasiunM: interval,
          panjangTotalM: L,
        },
        formulaSource: {
          calculatorId: 'road.stationing',
          calculatorVersion: '1.0.0',
          formulaId: 'STATION_COUNT',
          mathematicalExpression: 'N_sta = floor(L / interval) + 1',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 3. road.chainage
  {
    id: 'road.chainage',
    name: 'Road Chainage Segment (Segmentasi Trase)',
    shortName: 'Road Chainage',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung segmentasi panjang jalan berdasarkan stationing STA awal dan STA akhir.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Segmen Chainage',
    status: 'VERIFIED',
    parameters: [
      { id: 'startChainage', label: 'STA Awal (misal: 0 atau 0+000)', unit: 'm', defaultValue: 0, required: true },
      { id: 'endChainage', label: 'STA Akhir (misal: 1000 atau 1+000)', unit: 'm', defaultValue: 1000, required: true },
      { id: 'pavementWidth', label: 'Lebar Perkerasan', unit: 'm', defaultValue: 7.0, min: 1.0 },
    ],
    formulaSource: {
      calculatorId: 'road.chainage',
      calculatorVersion: '1.0.0',
      formulaId: 'CHAINAGE_DELTA',
      mathematicalExpression: 'L = STA_end - STA_start',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const start = RoadAlignmentEngine.parseStation(inputs.startChainage as string | number, 0);
      const end = RoadAlignmentEngine.parseStation(inputs.endChainage as string | number, 1000);
      const width = toNum(inputs.pavementWidth, 7.0);
      const length = Math.max(0, SafeDecimalEngine.safeSubtract(end, start));
      const area = SafeDecimalEngine.safeMultiply(length, width, 3);

      return createRoadOutput({
        calculatorId: 'road.chainage',
        version: '1.0.0',
        primaryQuantity: length,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Segmen Chainage',
        breakdown: {
          panjangSegmenM: length,
          staAwalM: start,
          staAkhirM: end,
          luasSegmenM2: area,
        },
        formulaSource: {
          calculatorId: 'road.chainage',
          calculatorVersion: '1.0.0',
          formulaId: 'CHAINAGE_DELTA',
          mathematicalExpression: 'L = STA_end - STA_start',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 4. road.cross_section
  {
    id: 'road.cross_section',
    name: 'Road Cross Section (Penampang Melintang Jalan)',
    shortName: 'Road Cross Section',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung lebar badan jalan (formation width), lebar jalur lalu lintas, bahu jalan, dan median.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Penampang Badan Jalan',
    status: 'VERIFIED',
    parameters: [
      { id: 'laneWidth', label: 'Lebar per Lajur (Lane Width)', unit: 'm', defaultValue: 3.5, min: 2.0, required: true },
      { id: 'numberOfLanes', label: 'Jumlah Lajur (Lanes)', unit: 'lajur', defaultValue: 2, min: 1, required: true },
      { id: 'leftShoulderWidth', label: 'Lebar Bahu Kiri', unit: 'm', defaultValue: 1.5, min: 0 },
      { id: 'rightShoulderWidth', label: 'Lebar Bahu Kanan', unit: 'm', defaultValue: 1.5, min: 0 },
      { id: 'medianWidth', label: 'Lebar Median Tengah', unit: 'm', defaultValue: 0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.cross_section',
      calculatorVersion: '1.0.0',
      formulaId: 'CROSS_SECTION_FORMATION',
      mathematicalExpression: 'W_formation = (N_lanes * W_lane) + W_leftShoulder + W_rightShoulder + W_median',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = RoadElementsEngine.calculateCrossSectionArea({
        laneWidth: toNum(inputs.laneWidth, 3.5),
        numberOfLanes: toNum(inputs.numberOfLanes, 2),
        leftShoulderWidth: toNum(inputs.leftShoulderWidth, 1.5),
        rightShoulderWidth: toNum(inputs.rightShoulderWidth, 1.5),
        medianWidth: toNum(inputs.medianWidth, 0),
      });

      return createRoadOutput({
        calculatorId: 'road.cross_section',
        version: '1.0.0',
        primaryQuantity: res.formationWidth,
        primaryUnit: 'm',
        primaryLabel: 'Total Lebar Badan Jalan (Formation Width)',
        breakdown: {
          lebarFormationM: res.formationWidth,
          lebarJalurCarriagewayM: res.carriagewayWidth,
          totalLebarBahuM: res.totalShoulderWidth,
          lebarMedianM: res.medianWidth,
        },
        formulaSource: {
          calculatorId: 'road.cross_section',
          calculatorVersion: '1.0.0',
          formulaId: 'CROSS_SECTION_FORMATION',
          mathematicalExpression: 'W_formation = (N_lanes * W_lane) + W_leftShoulder + W_rightShoulder + W_median',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 5. road.earthwork
  {
    id: 'road.earthwork',
    name: 'Road Earthwork (Average End Area Cut & Fill)',
    shortName: 'Road Earthwork',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume galian (cut) dan timbunan (fill) badan jalan dengan metode Average End Area.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Total Volume Tanah (Cut + Fill)',
    status: 'VERIFIED',
    parameters: [
      { id: 'area1Cut', label: 'Luas Cut Penampang 1 (A1)', unit: 'm²', defaultValue: 10, min: 0 },
      { id: 'area2Cut', label: 'Luas Cut Penampang 2 (A2)', unit: 'm²', defaultValue: 20, min: 0 },
      { id: 'area1Fill', label: 'Luas Fill Penampang 1 (A1)', unit: 'm²', defaultValue: 2, min: 0 },
      { id: 'area2Fill', label: 'Luas Fill Penampang 2 (A2)', unit: 'm²', defaultValue: 6, min: 0 },
      { id: 'segmentLength', label: 'Jarak Antar Penampang (L)', unit: 'm', defaultValue: 50, min: 0.1, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.earthwork',
      calculatorVersion: '1.0.0',
      formulaId: 'AVERAGE_END_AREA',
      mathematicalExpression: 'V = ((A1 + A2) / 2) * L',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const a1Cut = toNum(inputs.area1Cut, 10);
      const a2Cut = toNum(inputs.area2Cut, 20);
      const a1Fill = toNum(inputs.area1Fill, 2);
      const a2Fill = toNum(inputs.area2Fill, 6);
      const L = toNum(inputs.segmentLength || inputs.length, 50);

      const cutVol = RoadEarthworkEngine.calculateAverageEndArea(a1Cut, a2Cut, L);
      const fillVol = RoadEarthworkEngine.calculateAverageEndArea(a1Fill, a2Fill, L);
      const net = SafeDecimalEngine.safeSubtract(cutVol, fillVol);
      const disposal = net > 0 ? net : 0;
      const borrow = net < 0 ? Math.abs(net) : 0;

      return createRoadOutput({
        calculatorId: 'road.earthwork',
        version: '1.0.0',
        primaryQuantity: SafeDecimalEngine.safeAdd(cutVol, fillVol),
        primaryUnit: 'm³',
        primaryLabel: 'Total Pekerjaan Tanah (Cut + Fill)',
        breakdown: {
          volumeCutM3: cutVol,
          volumeFillM3: fillVol,
          netBalanceM3: net,
          surplusDisposalM3: disposal,
          deficitBorrowM3: borrow,
        },
        formulaSource: {
          calculatorId: 'road.earthwork',
          calculatorVersion: '1.0.0',
          formulaId: 'AVERAGE_END_AREA',
          mathematicalExpression: 'V = ((A1 + A2) / 2) * L',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 6. road.cut
  {
    id: 'road.cut',
    name: 'Road Cut (Galian Trase Jalan)',
    shortName: 'Road Cut',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume galian tanah trase jalan berdasarkan penampang trapesium/rata-rata.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Trase (Cut)',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Segmen Galian', unit: 'm', defaultValue: 100, min: 0.1, required: true },
      { id: 'formationWidth', label: 'Lebar Dasar Galian', unit: 'm', defaultValue: 8.0, min: 1.0, required: true },
      { id: 'cutDepth', label: 'Kedalaman Rata-rata Galian', unit: 'm', defaultValue: 1.5, min: 0, required: true },
      { id: 'cutSideSlope', label: 'Kemiringan Lereng Galian (H:V)', unit: 'rasio', defaultValue: 1.0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.cut',
      calculatorVersion: '1.0.0',
      formulaId: 'TRAPEZOIDAL_CUT',
      mathematicalExpression: 'V_cut = (b * h + z * h^2) * L',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const b = toNum(inputs.formationWidth, 8.0);
      const h = toNum(inputs.cutDepth, 1.5);
      const z = toNum(inputs.cutSideSlope, 1.0);

      const sectionArea = RoadEarthworkEngine.calculateTrapezoidSectionArea(b, h, z);
      const volume = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);

      return createRoadOutput({
        calculatorId: 'road.cut',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Trase (Cut)',
        breakdown: {
          volumeCutM3: volume,
          luasPenampangCutM2: sectionArea,
          panjangGalianM: L,
        },
        formulaSource: {
          calculatorId: 'road.cut',
          calculatorVersion: '1.0.0',
          formulaId: 'TRAPEZOIDAL_CUT',
          mathematicalExpression: 'V_cut = (b * h + z * h^2) * L',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 7. road.fill
  {
    id: 'road.fill',
    name: 'Road Fill (Timbunan Trase Jalan)',
    shortName: 'Road Fill',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume timbunan tanah badan jalan berdasarkan penampang trapesium/rata-rata.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Trase (Fill)',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Segmen Timbunan', unit: 'm', defaultValue: 100, min: 0.1, required: true },
      { id: 'formationWidth', label: 'Lebar Atas Timbunan', unit: 'm', defaultValue: 8.0, min: 1.0, required: true },
      { id: 'fillHeight', label: 'Tinggi Rata-rata Timbunan', unit: 'm', defaultValue: 1.2, min: 0, required: true },
      { id: 'fillSideSlope', label: 'Kemiringan Lereng Timbunan (H:V)', unit: 'rasio', defaultValue: 1.5, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.fill',
      calculatorVersion: '1.0.0',
      formulaId: 'TRAPEZOIDAL_FILL',
      mathematicalExpression: 'V_fill = (b * h + z * h^2) * L',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const b = toNum(inputs.formationWidth, 8.0);
      const h = toNum(inputs.fillHeight, 1.2);
      const z = toNum(inputs.fillSideSlope, 1.5);

      const sectionArea = RoadEarthworkEngine.calculateTrapezoidSectionArea(b, h, z);
      const volume = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);

      return createRoadOutput({
        calculatorId: 'road.fill',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Trase (Fill)',
        breakdown: {
          volumeFillM3: volume,
          luasPenampangFillM2: sectionArea,
          panjangTimbunanM: L,
        },
        formulaSource: {
          calculatorId: 'road.fill',
          calculatorVersion: '1.0.0',
          formulaId: 'TRAPEZOIDAL_FILL',
          mathematicalExpression: 'V_fill = (b * h + z * h^2) * L',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 8. road.embankment
  {
    id: 'road.embankment',
    name: 'Road Embankment (Timbunan Badan Jalan)',
    shortName: 'Road Embankment',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume timbunan peninggian badan jalan (embankment).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Embankment',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Embankment', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'averageWidth', label: 'Lebar Rata-rata', unit: 'm', defaultValue: 10.0, min: 1.0, required: true },
      { id: 'averageHeight', label: 'Tinggi Rata-rata', unit: 'm', defaultValue: 1.5, min: 0.05, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.embankment',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBANKMENT_SOLID',
      mathematicalExpression: 'V = L * W_avg * H_avg',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.averageWidth, 10.0);
      const H = toNum(inputs.averageHeight, 1.5);
      const volume = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(L, W, 3), H, 3);

      return createRoadOutput({
        calculatorId: 'road.embankment',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Embankment',
        breakdown: {
          volumeEmbankmentM3: volume,
          panjangM: L,
          lebarRataM: W,
          tinggiRataM: H,
        },
        formulaSource: {
          calculatorId: 'road.embankment',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBANKMENT_SOLID',
          mathematicalExpression: 'V = L * W_avg * H_avg',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 9. road.excavation
  {
    id: 'road.excavation',
    name: 'Road Excavation (Galian Badan Jalan)',
    shortName: 'Road Excavation',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume galian badan jalan dan saluran samping.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Badan Jalan',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Galian', unit: 'm', defaultValue: 200, min: 0.1, required: true },
      { id: 'averageWidth', label: 'Lebar Galian', unit: 'm', defaultValue: 8.0, min: 0.5, required: true },
      { id: 'averageDepth', label: 'Kedalaman Galian', unit: 'm', defaultValue: 2.0, min: 0.1, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'EXCAVATION_SOLID',
      mathematicalExpression: 'V = L * W * D',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 200);
      const W = toNum(inputs.averageWidth, 8.0);
      const D = toNum(inputs.averageDepth, 2.0);
      const volume = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(L, W, 3), D, 3);

      return createRoadOutput({
        calculatorId: 'road.excavation',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Badan Jalan',
        breakdown: {
          volumeGalianM3: volume,
          panjangM: L,
          lebarM: W,
          kedalamanM: D,
        },
        formulaSource: {
          calculatorId: 'road.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'EXCAVATION_SOLID',
          mathematicalExpression: 'V = L * W * D',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 10. road.disposal
  {
    id: 'road.disposal',
    name: 'Road Disposal (Pembuangan Tanah Sisa Galian)',
    shortName: 'Road Disposal',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume tanah sisa galian yang harus dibuang ke disposal area.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Tanah Buangan (Disposal)',
    status: 'VERIFIED',
    parameters: [
      { id: 'surplusVolume', label: 'Volume Surplus Tanah Galian', unit: 'm³', defaultValue: 550, min: 0.1, required: true },
      { id: 'haulDistanceKm', label: 'Jarak ke Disposal Area', unit: 'km', defaultValue: 5.0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.disposal',
      calculatorVersion: '1.0.0',
      formulaId: 'DISPOSAL_VOLUME',
      mathematicalExpression: 'V_disposal = V_surplus',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const vol = toNum(inputs.surplusVolume || inputs.disposalVolume || inputs.volume, 550);
      const dist = toNum(inputs.haulDistanceKm, 5.0);
      const volDist = SafeDecimalEngine.safeMultiply(vol, dist, 2);

      return createRoadOutput({
        calculatorId: 'road.disposal',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Tanah Buangan (Disposal)',
        breakdown: {
          volumeBuanganM3: vol,
          jarakDisposalKm: dist,
          volumeJarakM3Km: volDist,
        },
        formulaSource: {
          calculatorId: 'road.disposal',
          calculatorVersion: '1.0.0',
          formulaId: 'DISPOSAL_VOLUME',
          mathematicalExpression: 'V_disposal = V_surplus',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 11. road.borrow_material
  {
    id: 'road.borrow_material',
    name: 'Road Borrow Material (Tanah Datang dari Borrow Pit)',
    shortName: 'Road Borrow Material',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume defisit timbunan tanah yang harus didatangkan dari borrow pit.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Borrow Material',
    status: 'VERIFIED',
    parameters: [
      { id: 'deficitVolume', label: 'Volume Defisit Timbunan', unit: 'm³', defaultValue: 1200, min: 0.1, required: true },
      { id: 'haulDistanceKm', label: 'Jarak dari Borrow Pit', unit: 'km', defaultValue: 8.0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.borrow_material',
      calculatorVersion: '1.0.0',
      formulaId: 'BORROW_VOLUME',
      mathematicalExpression: 'V_borrow = V_deficit',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const vol = toNum(inputs.deficitVolume || inputs.borrowVolume || inputs.volume, 1200);
      const dist = toNum(inputs.haulDistanceKm, 8.0);
      const volDist = SafeDecimalEngine.safeMultiply(vol, dist, 2);

      return createRoadOutput({
        calculatorId: 'road.borrow_material',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Borrow Material',
        breakdown: {
          volumeBorrowM3: vol,
          jarakBorrowKm: dist,
          volumeJarakM3Km: volDist,
        },
        formulaSource: {
          calculatorId: 'road.borrow_material',
          calculatorVersion: '1.0.0',
          formulaId: 'BORROW_VOLUME',
          mathematicalExpression: 'V_borrow = V_deficit',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // =========================================================================
  // PAVEMENT (12 - 18)
  // =========================================================================

  // 12. road.subgrade
  {
    id: 'road.subgrade',
    name: 'Road Subgrade (Penyiapan Badan Jalan)',
    shortName: 'Road Subgrade',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas pemadatan dan penyiapan tanah dasar (subgrade).',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Penyiapan Subgrade',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Subgrade', unit: 'm', defaultValue: 8.0, min: 1.0, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.subgrade',
      calculatorVersion: '1.0.0',
      formulaId: 'SUBGRADE_AREA',
      mathematicalExpression: 'Area = L * W',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 1000);
      const W = toNum(inputs.width, 8.0);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);

      return createRoadOutput({
        calculatorId: 'road.subgrade',
        version: '1.0.0',
        primaryQuantity: area,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Penyiapan Subgrade',
        breakdown: {
          luasSubgradeM2: area,
          panjangM: L,
          lebarM: W,
        },
        formulaSource: {
          calculatorId: 'road.subgrade',
          calculatorVersion: '1.0.0',
          formulaId: 'SUBGRADE_AREA',
          mathematicalExpression: 'Area = L * W',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 13. road.selected_material
  {
    id: 'road.selected_material',
    name: 'Selected Material (Timbunan Pilihan)',
    shortName: 'Selected Material',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume lapisan timbunan pilihan penopang perkerasan jalan.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Pilihan',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Lapisan', unit: 'm', defaultValue: 8.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal Lapisan', unit: 'm', defaultValue: 0.20, min: 0.05, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.selected_material',
      calculatorVersion: '1.0.0',
      formulaId: 'LAYER_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.width, 8.0);
      const t = toNum(inputs.thickness, 0.20);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.selected_material',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Pilihan',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.selected_material',
          calculatorVersion: '1.0.0',
          formulaId: 'LAYER_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 14. road.granular_subbase
  {
    id: 'road.granular_subbase',
    name: 'Granular Subbase (Lapis Pondasi Bawah / Agregat Kelas B)',
    shortName: 'Granular Subbase',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume agregat kelas B untuk lapis pondasi bawah (subbase).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Agregat Subbase Kelas B',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Subbase', unit: 'm', defaultValue: 7.5, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal Lapisan', unit: 'm', defaultValue: 0.15, min: 0.05, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.granular_subbase',
      calculatorVersion: '1.0.0',
      formulaId: 'LAYER_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.width, 7.5);
      const t = toNum(inputs.thickness, 0.15);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.granular_subbase',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Agregat Subbase Kelas B',
        breakdown: {
          volumeM3: volume,
          area: area,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.granular_subbase',
          calculatorVersion: '1.0.0',
          formulaId: 'LAYER_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 15. road.aggregate_base
  {
    id: 'road.aggregate_base',
    name: 'Aggregate Base Class A (Lapis Pondasi Atas / LPA)',
    shortName: 'Aggregate Base LPA',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume lapis pondasi agregat kelas A (LPA).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Agregat Kelas A (LPA)',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar LPA', unit: 'm', defaultValue: 7.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal LPA', unit: 'm', defaultValue: 0.20, min: 0.05, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.aggregate_base',
      calculatorVersion: '1.0.0',
      formulaId: 'LAYER_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 1000);
      const W = toNum(inputs.width, 7.0);
      const t = toNum(inputs.thickness, 0.20);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.aggregate_base',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Agregat Kelas A (LPA)',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.aggregate_base',
          calculatorVersion: '1.0.0',
          formulaId: 'LAYER_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 16. road.cement_treated_base
  {
    id: 'road.cement_treated_base',
    name: 'Cement Treated Base (CTB)',
    shortName: 'CTB Base',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume lapis pondasi semen (Cement Treated Base).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume CTB Base',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 400, min: 0.1, required: true },
      { id: 'width', label: 'Lebar CTB', unit: 'm', defaultValue: 7.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal CTB', unit: 'm', defaultValue: 0.15, min: 0.05, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.cement_treated_base',
      calculatorVersion: '1.0.0',
      formulaId: 'LAYER_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 400);
      const W = toNum(inputs.width, 7.0);
      const t = toNum(inputs.thickness, 0.15);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.cement_treated_base',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume CTB Base',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.cement_treated_base',
          calculatorVersion: '1.0.0',
          formulaId: 'LAYER_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 17. road.lean_concrete
  {
    id: 'road.lean_concrete',
    name: 'Lean Concrete / LC Lantai Kerja',
    shortName: 'Lean Concrete',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume lantai kerja beton kurus (Lean Concrete / B0 / K125) untuk perkerasan kaku.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Lean Concrete (LC)',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 600, min: 0.1, required: true },
      { id: 'width', label: 'Lebar LC', unit: 'm', defaultValue: 7.2, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal LC', unit: 'm', defaultValue: 0.10, min: 0.05, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.lean_concrete',
      calculatorVersion: '1.0.0',
      formulaId: 'LAYER_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 600);
      const W = toNum(inputs.width, 7.2);
      const t = toNum(inputs.thickness, 0.10);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.lean_concrete',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Lean Concrete (LC)',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.lean_concrete',
          calculatorVersion: '1.0.0',
          formulaId: 'LAYER_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 18. road.rigid_pavement
  {
    id: 'road.rigid_pavement',
    name: 'Rigid Pavement (Perkerasan Kaku Beton Semen)',
    shortName: 'Rigid Pavement',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume pelat beton semen perkerasan kaku (Rigid Pavement Fs45).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Rigid Pavement',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Pelat Perkerasan', unit: 'm', defaultValue: 7.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal Pelat Beton', unit: 'm', defaultValue: 0.25, min: 0.10, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.rigid_pavement',
      calculatorVersion: '1.0.0',
      formulaId: 'RIGID_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.width, 7.0);
      const t = toNum(inputs.thickness, 0.25);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.rigid_pavement',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Rigid Pavement',
        breakdown: {
          volumeM3: volume,
          surfaceArea: area,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.rigid_pavement',
          calculatorVersion: '1.0.0',
          formulaId: 'RIGID_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // =========================================================================
  // ASPHALT (19 - 24)
  // =========================================================================

  // 19. road.asphalt_base
  {
    id: 'road.asphalt_base',
    name: 'Asphalt Concrete - Base (AC-Base)',
    shortName: 'AC-Base',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas dan volume lapis pondasi aspal beton (AC-Base).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Aspal AC-Base',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Lapisan', unit: 'm', defaultValue: 7.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal Padat (t)', unit: 'm', defaultValue: 0.08, min: 0.03, required: true },
      { id: 'densityTonM3', label: 'Kepadatan Aspal Padat (ton/m³)', unit: 'ton/m³', defaultValue: 0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.asphalt_base',
      calculatorVersion: '1.0.0',
      formulaId: 'ASPHALT_VOLUME',
      mathematicalExpression: 'V = L * W * t; W_ton = V * density',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 1000);
      const W = toNum(inputs.width, 7.0);
      const t = toNum(inputs.thickness, 0.08);
      const density = toNum(inputs.densityTonM3, 0);

      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);
      const warnings: CalculationWarning[] = [];
      let weightTon: number | undefined = undefined;

      if (density > 0) {
        weightTon = SafeDecimalEngine.safeMultiply(volume, density, 2);
      } else {
        warnings.push({
          code: 'REQUIRES_AUTHORITATIVE_SOURCE',
          message: 'NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Kepadatan aspal (density ton/m³) harus ditentukan dari JMF spesifikasi lapangan.',
          severity: 'warning',
        });
      }

      return createRoadOutput({
        calculatorId: 'road.asphalt_base',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Aspal AC-Base',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
          weightTon: weightTon || 0,
        },
        formulaSource: {
          calculatorId: 'road.asphalt_base',
          calculatorVersion: '1.0.0',
          formulaId: 'ASPHALT_VOLUME',
          mathematicalExpression: 'V = L * W * t; W_ton = V * density',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
        warnings,
      });
    },
  },

  // 20. road.asphalt_binder
  {
    id: 'road.asphalt_binder',
    name: 'Asphalt Concrete - Binder Course (AC-BC)',
    shortName: 'AC-BC Binder',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas dan volume lapis antara aspal beton (AC-BC).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Aspal AC-BC',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Lapisan', unit: 'm', defaultValue: 7.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal Padat (t)', unit: 'm', defaultValue: 0.06, min: 0.03, required: true },
      { id: 'densityTonM3', label: 'Kepadatan Aspal Padat (ton/m³)', unit: 'ton/m³', defaultValue: 0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.asphalt_binder',
      calculatorVersion: '1.0.0',
      formulaId: 'ASPHALT_VOLUME',
      mathematicalExpression: 'V = L * W * t; W_ton = V * density',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 1000);
      const W = toNum(inputs.width, 7.0);
      const t = toNum(inputs.thickness, 0.06);
      const density = toNum(inputs.densityTonM3, 0);

      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);
      const warnings: CalculationWarning[] = [];
      let weightTon: number | undefined = undefined;

      if (density > 0) {
        weightTon = SafeDecimalEngine.safeMultiply(volume, density, 2);
      } else {
        warnings.push({
          code: 'REQUIRES_AUTHORITATIVE_SOURCE',
          message: 'NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Kepadatan aspal (density ton/m³) harus ditentukan dari JMF spesifikasi lapangan.',
          severity: 'warning',
        });
      }

      return createRoadOutput({
        calculatorId: 'road.asphalt_binder',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Aspal AC-BC',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
          weightTon: weightTon || 0,
        },
        formulaSource: {
          calculatorId: 'road.asphalt_binder',
          calculatorVersion: '1.0.0',
          formulaId: 'ASPHALT_VOLUME',
          mathematicalExpression: 'V = L * W * t; W_ton = V * density',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
        warnings,
      });
    },
  },

  // 21. road.asphalt_wearing_course
  {
    id: 'road.asphalt_wearing_course',
    name: 'Asphalt Concrete - Wearing Course (AC-WC)',
    shortName: 'AC-WC Wearing',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas dan volume lapis aus aspal beton permukaan (AC-WC / HRS-WC).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Aspal AC-WC',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Lapisan', unit: 'm', defaultValue: 7.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal Padat (t)', unit: 'm', defaultValue: 0.04, min: 0.02, required: true },
      { id: 'densityTonM3', label: 'Kepadatan Aspal Padat (ton/m³)', unit: 'ton/m³', defaultValue: 0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.asphalt_wearing_course',
      calculatorVersion: '1.0.0',
      formulaId: 'ASPHALT_VOLUME',
      mathematicalExpression: 'V = L * W * t; W_ton = V * density',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 1000);
      const W = toNum(inputs.width, 7.0);
      const t = toNum(inputs.thickness, 0.04);
      const density = toNum(inputs.densityTonM3, 0);

      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);
      const warnings: CalculationWarning[] = [];
      let weightTon: number | undefined = undefined;

      if (density > 0) {
        weightTon = SafeDecimalEngine.safeMultiply(volume, density, 2);
      } else {
        warnings.push({
          code: 'REQUIRES_AUTHORITATIVE_SOURCE',
          message: 'NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Kepadatan aspal (density ton/m³) harus ditentukan dari JMF spesifikasi lapangan.',
          severity: 'warning',
        });
      }

      return createRoadOutput({
        calculatorId: 'road.asphalt_wearing_course',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Aspal AC-WC',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
          weightTon: weightTon || 0,
        },
        formulaSource: {
          calculatorId: 'road.asphalt_wearing_course',
          calculatorVersion: '1.0.0',
          formulaId: 'ASPHALT_VOLUME',
          mathematicalExpression: 'V = L * W * t; W_ton = V * density',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
        warnings,
      });
    },
  },

  // 22. road.prime_coat
  {
    id: 'road.prime_coat',
    name: 'Prime Coat (Lapis Resap Pengikat)',
    shortName: 'Prime Coat',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas semprotan dan volume aspal cair lapis resap pengikat (Prime Coat) di atas pondasi agregat.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Semprotan Prime Coat',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Area Semprot', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Area Semprot', unit: 'm', defaultValue: 7.0, min: 0.5, required: true },
      { id: 'applicationRateLiterM2', label: 'Kadar Semprotan (Liter/m²)', unit: 'L/m²', defaultValue: 0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.prime_coat',
      calculatorVersion: '1.0.0',
      formulaId: 'PRIME_COAT_AREA',
      mathematicalExpression: 'Area = L * W; Vol_liter = Area * applicationRate',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = RoadSurfaceTreatmentEngine.calculate({
        treatmentType: 'PRIME_COAT',
        lengthMeters: toNum(inputs.length, 1000),
        widthMeters: toNum(inputs.width, 7.0),
        applicationRateLiterM2: inputs.applicationRateLiterM2 !== undefined && toNum(inputs.applicationRateLiterM2, 0) > 0 ? toNum(inputs.applicationRateLiterM2, 0) : undefined,
      });

      const warnings: CalculationWarning[] = res.warnings.map((w) => ({
        code: 'REQUIRES_AUTHORITATIVE_SOURCE',
        message: w,
        severity: 'warning',
      }));

      return createRoadOutput({
        calculatorId: 'road.prime_coat',
        version: '1.0.0',
        primaryQuantity: res.surfaceAreaM2,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Semprotan Prime Coat',
        breakdown: {
          luasSemprotM2: res.surfaceAreaM2,
          emulsionVolumeLiter: res.totalVolumeLiters || 0,
          totalMassKg: res.totalMassKg || 0,
        },
        formulaSource: {
          calculatorId: 'road.prime_coat',
          calculatorVersion: '1.0.0',
          formulaId: 'PRIME_COAT_AREA',
          mathematicalExpression: 'Area = L * W; Vol_liter = Area * applicationRate',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
        warnings,
      });
    },
  },

  // 23. road.tack_coat
  {
    id: 'road.tack_coat',
    name: 'Tack Coat (Lapis Perekat)',
    shortName: 'Tack Coat',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas semprotan dan volume aspal emulsi lapis perekat (Tack Coat) antar lapisan aspal/beton.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Semprotan Tack Coat',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Area Semprot', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Area Semprot', unit: 'm', defaultValue: 7.0, min: 0.5, required: true },
      { id: 'applicationRateLiterM2', label: 'Kadar Semprotan (Liter/m²)', unit: 'L/m²', defaultValue: 0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.tack_coat',
      calculatorVersion: '1.0.0',
      formulaId: 'TACK_COAT_AREA',
      mathematicalExpression: 'Area = L * W; Vol_liter = Area * applicationRate',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = RoadSurfaceTreatmentEngine.calculate({
        treatmentType: 'TACK_COAT',
        lengthMeters: toNum(inputs.length, 1000),
        widthMeters: toNum(inputs.width, 7.0),
        applicationRateLiterM2: inputs.applicationRateLiterM2 !== undefined && toNum(inputs.applicationRateLiterM2, 0) > 0 ? toNum(inputs.applicationRateLiterM2, 0) : undefined,
      });

      const warnings: CalculationWarning[] = res.warnings.map((w) => ({
        code: 'REQUIRES_AUTHORITATIVE_SOURCE',
        message: w,
        severity: 'warning',
      }));

      return createRoadOutput({
        calculatorId: 'road.tack_coat',
        version: '1.0.0',
        primaryQuantity: res.surfaceAreaM2,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Semprotan Tack Coat',
        breakdown: {
          luasSemprotM2: res.surfaceAreaM2,
          emulsionVolumeLiter: res.totalVolumeLiters || 0,
          totalMassKg: res.totalMassKg || 0,
        },
        formulaSource: {
          calculatorId: 'road.tack_coat',
          calculatorVersion: '1.0.0',
          formulaId: 'TACK_COAT_AREA',
          mathematicalExpression: 'Area = L * W; Vol_liter = Area * applicationRate',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
        warnings,
      });
    },
  },

  // 24. road.asphalt_surface
  {
    id: 'road.asphalt_surface',
    name: 'Asphalt Surface (HRS / Lataston / Burtu / Burda)',
    shortName: 'Asphalt Surface',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas dan volume lapisan penutup aspal tipis seperti Hot Rolled Sheet (HRS) atau Lataston.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Aspal Surface',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Permukaan', unit: 'm', defaultValue: 6.0, min: 1.0, required: true },
      { id: 'thickness', label: 'Tebal Padat (t)', unit: 'm', defaultValue: 0.03, min: 0.015, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.asphalt_surface',
      calculatorVersion: '1.0.0',
      formulaId: 'SURFACE_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.width, 6.0);
      const t = toNum(inputs.thickness, 0.03);
      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.asphalt_surface',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Aspal Surface',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.asphalt_surface',
          calculatorVersion: '1.0.0',
          formulaId: 'SURFACE_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // =========================================================================
  // ROAD ELEMENTS (25 - 29)
  // =========================================================================

  // 25. road.shoulder
  {
    id: 'road.shoulder',
    name: 'Road Shoulder (Bahu Jalan)',
    shortName: 'Road Shoulder',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume dan luas bahu jalan berbutir / diperkeras pada kedua sisi jalan.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Bahu Jalan',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Jalan', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'shoulderWidthPerSide', label: 'Lebar Bahu per Sisi', unit: 'm', defaultValue: 1.5, min: 0.2, required: true },
      { id: 'numberOfSides', label: 'Jumlah Sisi Bahu (1 atau 2)', unit: 'sisi', defaultValue: 2, min: 1, required: true },
      { id: 'thickness', label: 'Tebal Bahu Jalan', unit: 'm', defaultValue: 0.15, min: 0.05, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.shoulder',
      calculatorVersion: '1.0.0',
      formulaId: 'SHOULDER_VOLUME',
      mathematicalExpression: 'V = L * W_side * N_sides * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 1000);
      const wSide = toNum(inputs.shoulderWidthPerSide || inputs.width, 1.5);
      const sides = toNum(inputs.numberOfSides || inputs.sidesCount, 2);
      const t = toNum(inputs.thickness, 0.15);

      const totalW = SafeDecimalEngine.safeMultiply(wSide, sides, 3);
      const area = SafeDecimalEngine.safeMultiply(L, totalW, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createRoadOutput({
        calculatorId: 'road.shoulder',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Bahu Jalan',
        breakdown: {
          volumeM3: volume,
          totalShoulderArea: area,
          panjangM: L,
          lebarPerSisiM: wSide,
          jumlahSisi: sides,
          tebalM: t,
        },
        formulaSource: {
          calculatorId: 'road.shoulder',
          calculatorVersion: '1.0.0',
          formulaId: 'SHOULDER_VOLUME',
          mathematicalExpression: 'V = L * W_side * N_sides * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 26. road.median
  {
    id: 'road.median',
    name: 'Road Median (Median Jalan)',
    shortName: 'Road Median',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume struktur median pemisah jalur jalan.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Struktur Median',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Median', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Median', unit: 'm', defaultValue: 2.0, min: 0.5, required: true },
      { id: 'thickness', label: 'Tinggi / Tebal Struktur', unit: 'm', defaultValue: 0.20, min: 0.05, required: true },
      { id: 'soilFillDepth', label: 'Kedalaman Tanah Isian Taman', unit: 'm', defaultValue: 0, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.median',
      calculatorVersion: '1.0.0',
      formulaId: 'MEDIAN_VOLUME',
      mathematicalExpression: 'V = L * W * t',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.width, 2.0);
      const t = toNum(inputs.thickness || inputs.height, 0.20);
      const soilDepth = toNum(inputs.soilFillDepth, 0);

      const area = SafeDecimalEngine.safeMultiply(L, W, 3);
      const volume = SafeDecimalEngine.safeMultiply(area, t, 3);
      const soilVol = soilDepth > 0 ? SafeDecimalEngine.safeMultiply(area, soilDepth, 3) : 0;

      return createRoadOutput({
        calculatorId: 'road.median',
        version: '1.0.0',
        primaryQuantity: volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Struktur Median',
        breakdown: {
          volumeM3: volume,
          luasM2: area,
          volumeTanahTamanM3: soilVol,
        },
        formulaSource: {
          calculatorId: 'road.median',
          calculatorVersion: '1.0.0',
          formulaId: 'MEDIAN_VOLUME',
          mathematicalExpression: 'V = L * W * t',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 27. road.kerb
  {
    id: 'road.kerb',
    name: 'Road Kerb / Curb (Kerb Pembatas Jalan Pracetak/Cor)',
    shortName: 'Road Kerb',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung panjang, volume beton, dan jumlah modul pracetak kerb pembatas jalan.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Kerb Pembatas',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Trase Kerb', unit: 'm', defaultValue: 800, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Kerb (b)', unit: 'm', defaultValue: 0.15, min: 0.05, required: true },
      { id: 'height', label: 'Tinggi Kerb (h)', unit: 'm', defaultValue: 0.30, min: 0.10, required: true },
      { id: 'moduleLength', label: 'Panjang per Modul Pracetak', unit: 'm', defaultValue: 0.50, min: 0.1 },
    ],
    formulaSource: {
      calculatorId: 'road.kerb',
      calculatorVersion: '1.0.0',
      formulaId: 'KERB_TAKEOFF',
      mathematicalExpression: 'L_total = L; V = L * b * h; N_pcs = L / L_module',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 800);
      const b = toNum(inputs.width, 0.15);
      const h = toNum(inputs.height, 0.30);
      const moduleLen = toNum(inputs.moduleLength, 0.50);

      const sectionArea = SafeDecimalEngine.safeMultiply(b, h, 4);
      const volume = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);
      const pieces = moduleLen > 0 ? Math.ceil(L / moduleLen) : 0;

      return createRoadOutput({
        calculatorId: 'road.kerb',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Kerb Pembatas',
        breakdown: {
          panjangM: L,
          concreteVolume: volume,
          precastPieces: pieces,
          luasPenampangM2: sectionArea,
        },
        formulaSource: {
          calculatorId: 'road.kerb',
          calculatorVersion: '1.0.0',
          formulaId: 'KERB_TAKEOFF',
          mathematicalExpression: 'L_total = L; V = L * b * h; N_pcs = L / L_module',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 28. road.side_ditch
  {
    id: 'road.side_ditch',
    name: 'Road Side Ditch (Saluran Samping Jalan Trapesium)',
    shortName: 'Road Side Ditch',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume galian tanah dan pasangan batu saluran samping jalan bentuk trapesium.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Saluran Samping',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Saluran', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'topWidth', label: 'Lebar Atas Saluran (B)', unit: 'm', defaultValue: 1.2, min: 0.3, required: true },
      { id: 'bottomWidth', label: 'Lebar Dasar Saluran (b)', unit: 'm', defaultValue: 0.6, min: 0.2, required: true },
      { id: 'depth', label: 'Kedalaman Saluran (d)', unit: 'm', defaultValue: 0.8, min: 0.2, required: true },
      { id: 'liningThickness', label: 'Tebal Pasangan Batu / Lining', unit: 'm', defaultValue: 0.10, min: 0.05 },
    ],
    formulaSource: {
      calculatorId: 'road.side_ditch',
      calculatorVersion: '1.0.0',
      formulaId: 'SIDE_DITCH_TRAPEZOID',
      mathematicalExpression: 'A_sec = ((B + b) / 2) * d; V_galian = A_sec * L',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const topW = toNum(inputs.topWidth, 1.2);
      const botW = toNum(inputs.bottomWidth, 0.6);
      const d = toNum(inputs.depth, 0.8);
      const liningT = toNum(inputs.liningThickness, 0.10);

      const meanW = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(topW, botW), 2, 4);
      const sectionArea = SafeDecimalEngine.safeMultiply(meanW, d, 4);
      const excavationVol = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);

      const slopeWidth = Math.abs(topW - botW) / 2;
      const slopeLen = Math.sqrt(Math.pow(d, 2) + Math.pow(slopeWidth, 2));
      const wetPerimeter = SafeDecimalEngine.safeAdd(botW, 2 * slopeLen);
      const liningArea = SafeDecimalEngine.safeMultiply(wetPerimeter, L, 3);
      const liningVol = SafeDecimalEngine.safeMultiply(liningArea, liningT, 3);

      return createRoadOutput({
        calculatorId: 'road.side_ditch',
        version: '1.0.0',
        primaryQuantity: excavationVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Saluran Samping',
        breakdown: {
          volumeGalianM3: excavationVol,
          crossSectionArea: sectionArea,
          masonryLiningVolume: liningVol,
          liningSurfaceAreaM2: liningArea,
          panjangSaluranM: L,
        },
        formulaSource: {
          calculatorId: 'road.side_ditch',
          calculatorVersion: '1.0.0',
          formulaId: 'SIDE_DITCH_TRAPEZOID',
          mathematicalExpression: 'A_sec = ((B + b) / 2) * d; V_galian = A_sec * L',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 29. road.road_drainage
  {
    id: 'road.road_drainage',
    name: 'Road Drainage (Drainase Permukaan & Gorong-Gorong)',
    shortName: 'Road Drainage',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung panjang jalur dan volume struktur drainase jalan raya.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Jalur Drainase Jalan',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Saluran Drainase', unit: 'm', defaultValue: 250, min: 0.1, required: true },
      { id: 'internalWidth', label: 'Lebar Bersih Saluran', unit: 'm', defaultValue: 0.8, min: 0.3, required: true },
      { id: 'depth', label: 'Tinggi Bersih Saluran', unit: 'm', defaultValue: 0.8, min: 0.3, required: true },
      { id: 'wallThickness', label: 'Tebal Dinding / Plat Beton', unit: 'm', defaultValue: 0.12, min: 0.08 },
    ],
    formulaSource: {
      calculatorId: 'road.road_drainage',
      calculatorVersion: '1.0.0',
      formulaId: 'DRAINAGE_LENGTH',
      mathematicalExpression: 'L_drainage = L',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 250);
      const w = toNum(inputs.internalWidth, 0.8);
      const d = toNum(inputs.depth, 0.8);
      const t = toNum(inputs.wallThickness, 0.12);

      const outerW = SafeDecimalEngine.safeAdd(w, 2 * t);
      const outerD = SafeDecimalEngine.safeAdd(d, t);
      const grossArea = SafeDecimalEngine.safeMultiply(outerW, outerD, 4);
      const voidArea = SafeDecimalEngine.safeMultiply(w, d, 4);
      const concreteSection = SafeDecimalEngine.safeSubtract(grossArea, voidArea);
      const concreteVol = SafeDecimalEngine.safeMultiply(concreteSection, L, 3);

      return createRoadOutput({
        calculatorId: 'road.road_drainage',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Jalur Drainase Jalan',
        breakdown: {
          panjangSaluranM: L,
          concreteVolumeM3: concreteVol,
          luasPenampangBetonM2: concreteSection,
        },
        formulaSource: {
          calculatorId: 'road.road_drainage',
          calculatorVersion: '1.0.0',
          formulaId: 'DRAINAGE_LENGTH',
          mathematicalExpression: 'L_drainage = L',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // =========================================================================
  // GEOSYNTHETICS (30 - 31)
  // =========================================================================

  // 30. road.geotextile
  {
    id: 'road.geotextile',
    name: 'Geotextile (Woven / Non-Woven Separator & Stabilisasi)',
    shortName: 'Geotextile',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas lembaran geotekstil terpasang dengan faktor overlap sambungan.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Geotextile Bruto (Termasuk Overlap)',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Hamparan', unit: 'm', defaultValue: 1000, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Hamparan', unit: 'm', defaultValue: 8.0, min: 0.5, required: true },
      { id: 'overlapPercentage', label: 'Persentase Overlap Sambungan (%)', unit: '%', defaultValue: 10, min: 0, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.geotextile',
      calculatorVersion: '1.0.0',
      formulaId: 'GEOTEXTILE_AREA',
      mathematicalExpression: 'A_gross = (L * W) * (1 + overlap% / 100)',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 1000);
      const W = toNum(inputs.width, 8.0);
      const overlapPct = toNum(inputs.overlapPercentage, 10);

      const netArea = SafeDecimalEngine.safeMultiply(L, W, 3);
      const factor = SafeDecimalEngine.safeAdd(1, overlapPct / 100);
      const grossArea = SafeDecimalEngine.safeMultiply(netArea, factor, 2);

      return createRoadOutput({
        calculatorId: 'road.geotextile',
        version: '1.0.0',
        primaryQuantity: grossArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Geotextile Bruto',
        breakdown: {
          luasBrutoM2: grossArea,
          netArea: netArea,
          persenOverlap: overlapPct,
        },
        formulaSource: {
          calculatorId: 'road.geotextile',
          calculatorVersion: '1.0.0',
          formulaId: 'GEOTEXTILE_AREA',
          mathematicalExpression: 'A_gross = (L * W) * (1 + overlap% / 100)',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 31. road.geogrid
  {
    id: 'road.geogrid',
    name: 'Geogrid (Biaxial / Triaxial Reinforcement)',
    shortName: 'Geogrid',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas lembaran geogrid perkuatan lapis pondasi jalan.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Geogrid Bruto (Termasuk Overlap)',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Hamparan', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Hamparan', unit: 'm', defaultValue: 7.0, min: 0.5, required: true },
      { id: 'overlapPercentage', label: 'Persentase Overlap Sambungan (%)', unit: '%', defaultValue: 15, min: 0, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.geogrid',
      calculatorVersion: '1.0.0',
      formulaId: 'GEOGRID_AREA',
      mathematicalExpression: 'A_gross = (L * W) * (1 + overlap% / 100)',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.width, 7.0);
      const overlapPct = toNum(inputs.overlapPercentage, 15);

      const netArea = SafeDecimalEngine.safeMultiply(L, W, 3);
      const factor = SafeDecimalEngine.safeAdd(1, overlapPct / 100);
      const grossArea = SafeDecimalEngine.safeMultiply(netArea, factor, 2);

      return createRoadOutput({
        calculatorId: 'road.geogrid',
        version: '1.0.0',
        primaryQuantity: grossArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Geogrid Bruto',
        breakdown: {
          luasBrutoM2: grossArea,
          netArea: netArea,
          persenOverlap: overlapPct,
        },
        formulaSource: {
          calculatorId: 'road.geogrid',
          calculatorVersion: '1.0.0',
          formulaId: 'GEOGRID_AREA',
          mathematicalExpression: 'A_gross = (L * W) * (1 + overlap% / 100)',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // =========================================================================
  // ROAD SAFETY (32 - 36)
  // =========================================================================

  // 32. road.road_marking
  {
    id: 'road.road_marking',
    name: 'Road Marking (Marka Jalan Termoplastik)',
    shortName: 'Road Marking',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung luas pengecatan marka jalan garis utuh, garis putus-putus, dan zebra cross.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pengecatan Marka Jalan',
    status: 'VERIFIED',
    parameters: [
      { id: 'solidLineLength', label: 'Panjang Garis Utuh (Solid)', unit: 'm', defaultValue: 2000, min: 0 },
      { id: 'solidLineWidth', label: 'Lebar Garis Utuh', unit: 'm', defaultValue: 0.12, min: 0.05 },
      { id: 'brokenLineLength', label: 'Panjang Garis Putus (Broken)', unit: 'm', defaultValue: 333, min: 0 },
      { id: 'brokenLineWidth', label: 'Lebar Garis Putus', unit: 'm', defaultValue: 0.12, min: 0.05 },
    ],
    formulaSource: {
      calculatorId: 'road.road_marking',
      calculatorVersion: '1.0.0',
      formulaId: 'MARKING_AREA',
      mathematicalExpression: 'Area = (L_solid * W_solid) + (L_broken * W_broken)',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const solidL = toNum(inputs.solidLineLength, 2000);
      const solidW = toNum(inputs.solidLineWidth, 0.12);
      const brokenL = toNum(inputs.brokenLineLength, 333);
      const brokenW = toNum(inputs.brokenLineWidth, 0.12);

      const solidArea = SafeDecimalEngine.safeMultiply(solidL, solidW, 3);
      const brokenArea = SafeDecimalEngine.safeMultiply(brokenL, brokenW, 3);
      const totalArea = SafeDecimalEngine.safeAdd(solidArea, brokenArea);

      return createRoadOutput({
        calculatorId: 'road.road_marking',
        version: '1.0.0',
        primaryQuantity: totalArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pengecatan Marka Jalan',
        breakdown: {
          luasMarkaM2: totalArea,
          luasSolidM2: solidArea,
          luasBrokenM2: brokenArea,
        },
        formulaSource: {
          calculatorId: 'road.road_marking',
          calculatorVersion: '1.0.0',
          formulaId: 'MARKING_AREA',
          mathematicalExpression: 'Area = (L_solid * W_solid) + (L_broken * W_broken)',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 33. road.guardrail
  {
    id: 'road.guardrail',
    name: 'Guardrail (Pagar Pengaman Jalan Baja Galvanis W-Beam)',
    shortName: 'Guardrail',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung panjang bentang guardrail W-beam, jumlah tiang post, dan terminal ends.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Bentang Guardrail',
    status: 'VERIFIED',
    parameters: [
      { id: 'routeLength', label: 'Panjang Bentang Guardrail', unit: 'm', defaultValue: 400, min: 0.1, required: true },
      { id: 'postSpacing', label: 'Spasi Antar Tiang Post', unit: 'm', defaultValue: 2.0, min: 1.0, required: true },
      { id: 'terminalEndCount', label: 'Jumlah Ujung Terminal End', unit: 'buah', defaultValue: 2, min: 0 },
    ],
    formulaSource: {
      calculatorId: 'road.guardrail',
      calculatorVersion: '1.0.0',
      formulaId: 'GUARDRAIL_POSTS',
      mathematicalExpression: 'L = routeLength; N_post = floor(L / postSpacing) + 1',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.routeLength || inputs.length, 400);
      const spacing = Math.max(1, toNum(inputs.postSpacing, 2.0));
      const terminals = toNum(inputs.terminalEndCount, 2);
      const posts = Math.floor(L / spacing) + 1;

      return createRoadOutput({
        calculatorId: 'road.guardrail',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Bentang Guardrail',
        breakdown: {
          panjangGuardrailM: L,
          postCount: posts,
          terminalEnds: terminals,
          spasiTiangM: spacing,
        },
        formulaSource: {
          calculatorId: 'road.guardrail',
          calculatorVersion: '1.0.0',
          formulaId: 'GUARDRAIL_POSTS',
          mathematicalExpression: 'L = routeLength; N_post = floor(L / postSpacing) + 1',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 34. road.traffic_barrier
  {
    id: 'road.traffic_barrier',
    name: 'Traffic Barrier (Barrier Beton Pembatas Jalan)',
    shortName: 'Traffic Barrier',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung panjang dan volume beton struktur traffic barrier / median barrier.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Barrier Beton',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Barrier', unit: 'm', defaultValue: 300, min: 0.1, required: true },
      { id: 'crossSectionArea', label: 'Luas Penampang Barrier (A)', unit: 'm²', defaultValue: 0.35, min: 0.05, required: true },
      { id: 'moduleLength', label: 'Panjang per Modul Pracetak', unit: 'm', defaultValue: 3.0, min: 0.5 },
    ],
    formulaSource: {
      calculatorId: 'road.traffic_barrier',
      calculatorVersion: '1.0.0',
      formulaId: 'BARRIER_VOLUME',
      mathematicalExpression: 'L_total = L; V = L * A_sec; N_mod = L / L_mod',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 300);
      const aSec = toNum(inputs.crossSectionArea, 0.35);
      const modLen = toNum(inputs.moduleLength, 3.0);

      const volume = SafeDecimalEngine.safeMultiply(L, aSec, 3);
      const modules = modLen > 0 ? Math.ceil(L / modLen) : 0;

      return createRoadOutput({
        calculatorId: 'road.traffic_barrier',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Barrier Beton',
        breakdown: {
          panjangBarrierM: L,
          concreteVolume: volume,
          moduleCount: modules,
        },
        formulaSource: {
          calculatorId: 'road.traffic_barrier',
          calculatorVersion: '1.0.0',
          formulaId: 'BARRIER_VOLUME',
          mathematicalExpression: 'L_total = L; V = L * A_sec; N_mod = L / L_mod',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 35. road.road_delineator
  {
    id: 'road.road_delineator',
    name: 'Road Delineator (Patok Pengarah Jalan)',
    shortName: 'Road Delineator',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung jumlah unit patok pengarah jalan (delineator post) pada tikungan/jalur berbahaya.',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Patok Delineator',
    status: 'VERIFIED',
    parameters: [
      { id: 'count', label: 'Jumlah Patok Pengarah', unit: 'unit', defaultValue: 85, min: 1, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.road_delineator',
      calculatorVersion: '1.0.0',
      formulaId: 'DELINEATOR_COUNT',
      mathematicalExpression: 'Count = count (Explicit Count Only)',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = toNum(inputs.count || inputs.quantity, 85);

      return createRoadOutput({
        calculatorId: 'road.road_delineator',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Patok Delineator',
        breakdown: {
          jumlahUnit: count,
        },
        formulaSource: {
          calculatorId: 'road.road_delineator',
          calculatorVersion: '1.0.0',
          formulaId: 'DELINEATOR_COUNT',
          mathematicalExpression: 'Count = count (Explicit Count Only)',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 36. road.road_sign_foundation
  {
    id: 'road.road_sign_foundation',
    name: 'Road Sign Foundation (Pondasi Rambu Petunjuk Jalan)',
    shortName: 'Sign Foundation',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung volume beton pondasi tiang rambu lalu lintas dan portal RPPJ.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Pondasi Rambu',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Pondasi (L)', unit: 'm', defaultValue: 0.80, min: 0.2, required: true },
      { id: 'width', label: 'Lebar Pondasi (W)', unit: 'm', defaultValue: 0.80, min: 0.2, required: true },
      { id: 'depth', label: 'Kedalaman Pondasi (D)', unit: 'm', defaultValue: 1.20, min: 0.2, required: true },
      { id: 'quantity', label: 'Jumlah Titik Pondasi', unit: 'titik', defaultValue: 10, min: 1, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.road_sign_foundation',
      calculatorVersion: '1.0.0',
      formulaId: 'SIGN_FOUNDATION_VOL',
      mathematicalExpression: 'V = L * W * D * Quantity',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 0.80);
      const W = toNum(inputs.width, 0.80);
      const D = toNum(inputs.depth, 1.20);
      const qty = toNum(inputs.quantity || inputs.count, 10);

      const volPerPoint = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(L, W, 4), D, 4);
      const totalVolume = SafeDecimalEngine.safeMultiply(volPerPoint, qty, 3);

      return createRoadOutput({
        calculatorId: 'road.road_sign_foundation',
        version: '1.0.0',
        primaryQuantity: totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Pondasi Rambu',
        breakdown: {
          volumeTotalM3: totalVolume,
          volumePerTitikM3: volPerPoint,
          jumlahTitik: qty,
        },
        formulaSource: {
          calculatorId: 'road.road_sign_foundation',
          calculatorVersion: '1.0.0',
          formulaId: 'SIGN_FOUNDATION_VOL',
          mathematicalExpression: 'V = L * W * D * Quantity',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // =========================================================================
  // JOINTS & SPECIAL (37 - 38)
  // =========================================================================

  // 37. road.pavement_joint
  {
    id: 'road.pavement_joint',
    name: 'Rigid Pavement Joint (Sambungan Melintang & Memanjang Perkerasan Kaku)',
    shortName: 'Pavement Joint',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung total panjang sambungan susut (contraction joint), jumlah dowel bar, dan tie bar perkerasan kaku.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Total Panjang Sambungan Melintang & Memanjang',
    status: 'VERIFIED',
    parameters: [
      { id: 'roadLength', label: 'Panjang Jalan', unit: 'm', defaultValue: 500, min: 0.1, required: true },
      { id: 'pavementWidth', label: 'Lebar Perkerasan', unit: 'm', defaultValue: 7.0, min: 1.0, required: true },
      { id: 'transverseSpacing', label: 'Spasi Sambungan Melintang', unit: 'm', defaultValue: 5.0, min: 2.0, required: true },
      { id: 'dowelSpacing', label: 'Spasi Antar Dowel Bar', unit: 'm', defaultValue: 0.30, min: 0.15 },
    ],
    formulaSource: {
      calculatorId: 'road.pavement_joint',
      calculatorVersion: '1.0.0',
      formulaId: 'RIGID_JOINT_TAKEOFF',
      mathematicalExpression: 'L_trans = (L_road / spacing) * W; L_total = L_trans + L_long; N_dowel = (W / dowel_sp) * N_joints',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const roadL = toNum(inputs.roadLength || inputs.length, 500);
      const width = toNum(inputs.pavementWidth || inputs.width, 7.0);
      const transSpacing = Math.max(1, toNum(inputs.transverseSpacing, 5.0));
      const dowelSpacing = Math.max(0.1, toNum(inputs.dowelSpacing, 0.30));

      const numTransJoints = Math.floor(roadL / transSpacing);
      const transJointLength = SafeDecimalEngine.safeMultiply(numTransJoints, width, 3);
      const longJointLength = roadL;
      const totalJointLength = SafeDecimalEngine.safeAdd(transJointLength, longJointLength);

      const dowelsPerJoint = Math.floor(width / dowelSpacing);
      const totalDowels = numTransJoints * dowelsPerJoint;

      return createRoadOutput({
        calculatorId: 'road.pavement_joint',
        version: '1.0.0',
        primaryQuantity: totalJointLength,
        primaryUnit: 'm',
        primaryLabel: 'Total Panjang Sambungan',
        breakdown: {
          totalJointLengthM: totalJointLength,
          totalTransverseJointLength: transJointLength,
          longitudinalJointLengthM: longJointLength,
          jumlahJointMelintang: numTransJoints,
          totalDowelCount: totalDowels,
        },
        formulaSource: {
          calculatorId: 'road.pavement_joint',
          calculatorVersion: '1.0.0',
          formulaId: 'RIGID_JOINT_TAKEOFF',
          mathematicalExpression: 'L_trans = (L_road / spacing) * W; L_total = L_trans + L_long; N_dowel = (W / dowel_sp) * N_joints',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // 38. road.expansion_joint
  {
    id: 'road.expansion_joint',
    name: 'Road Expansion Joint (Sambungan Muai Perkerasan/Jembatan)',
    shortName: 'Expansion Joint',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung total panjang sambungan muai (expansion joint) perkerasan kaku dan jembatan.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Total Sambungan Muai',
    status: 'VERIFIED',
    parameters: [
      { id: 'jointLength', label: 'Panjang per Sambungan', unit: 'm', defaultValue: 7.0, min: 0.5, required: true },
      { id: 'jointCount', label: 'Jumlah Sambungan Muai', unit: 'titik', defaultValue: 4, min: 1, required: true },
      { id: 'jointGapMm', label: 'Lebar Celah Muai (Gap)', unit: 'mm', defaultValue: 20, min: 5 },
    ],
    formulaSource: {
      calculatorId: 'road.expansion_joint',
      calculatorVersion: '1.0.0',
      formulaId: 'EXPANSION_JOINT_LENGTH',
      mathematicalExpression: 'L_total = jointLength * jointCount',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const jointL = toNum(inputs.jointLength || inputs.length, 7.0);
      const count = toNum(inputs.jointCount || inputs.quantity, 4);
      const totalL = SafeDecimalEngine.safeMultiply(jointL, count, 3);

      return createRoadOutput({
        calculatorId: 'road.expansion_joint',
        version: '1.0.0',
        primaryQuantity: totalL,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Total Sambungan Muai',
        breakdown: {
          panjangTotalM: totalL,
          panjangPerJointM: jointL,
          jumlahJoint: count,
        },
        formulaSource: {
          calculatorId: 'road.expansion_joint',
          calculatorVersion: '1.0.0',
          formulaId: 'EXPANSION_JOINT_LENGTH',
          mathematicalExpression: 'L_total = jointLength * jointCount',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },

  // =========================================================================
  // HAULING (39)
  // =========================================================================

  // 39. road.material_hauling
  {
    id: 'road.material_hauling',
    name: 'Material Hauling (Pengangkutan Material Jalan)',
    shortName: 'Material Hauling',
    category: 'ROAD',
    pack: 'ROAD',
    version: '1.0.0',
    description: 'Menghitung besaran pengangkutan material konstruksi jalan berdasarkan volume dan jarak angkut (m³·km).',
    primaryUnit: 'm³·km',
    primaryQuantityLabel: 'Volume-Jarak Pengangkutan (m³·km)',
    status: 'VERIFIED',
    parameters: [
      { id: 'materialVolume', label: 'Volume Material', unit: 'm³', defaultValue: 1500, min: 0.1, required: true },
      { id: 'haulDistanceKm', label: 'Jarak Angkut', unit: 'km', defaultValue: 12.5, min: 0.1, required: true },
    ],
    formulaSource: {
      calculatorId: 'road.material_hauling',
      calculatorVersion: '1.0.0',
      formulaId: 'HAULING_VOL_DIST',
      mathematicalExpression: 'Takeoff = Volume * Distance (m3 * km)',
      sourceType: 'verified_reference',
      status: 'VERIFIED',
    },
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const vol = toNum(inputs.materialVolume || inputs.volume, 1500);
      const dist = toNum(inputs.haulDistanceKm || inputs.distance, 12.5);
      const volDist = SafeDecimalEngine.safeMultiply(vol, dist, 2);

      return createRoadOutput({
        calculatorId: 'road.material_hauling',
        version: '1.0.0',
        primaryQuantity: volDist,
        primaryUnit: 'm³·km',
        primaryLabel: 'Volume-Jarak Pengangkutan (m³·km)',
        breakdown: {
          volumeJarakM3Km: volDist,
          materialVolume: vol,
          haulDistanceKm: dist,
        },
        formulaSource: {
          calculatorId: 'road.material_hauling',
          calculatorVersion: '1.0.0',
          formulaId: 'HAULING_VOL_DIST',
          mathematicalExpression: 'Takeoff = Volume * Distance (m3 * km)',
          sourceType: 'verified_reference',
          status: 'VERIFIED',
        },
      });
    },
  },
];
