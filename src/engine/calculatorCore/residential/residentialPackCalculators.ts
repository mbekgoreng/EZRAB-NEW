/**
 * EZRAB RESIDENTIAL PACK — 30 CALCULATOR CAPABILITIES
 * Unified registry definitions wrapping the 8 generic engines for residential construction takeoff.
 * Strictly typed against CalculatorDefinition & CalculationOutput.
 */

import {
  CalculatorDefinition,
  CalculationContext,
  CalculationInput,
  CalculationOutput,
  FormulaProvenance,
  ValidationSummary,
} from '../contracts/types';
import { EarthworkEngine } from './engines/earthworkEngine';
import { FillLayerEngine } from './engines/fillLayerEngine';
import { ConcreteQuantityEngine } from './engines/concreteQuantityEngine';
import { ReinforcementQuantityEngine } from './engines/reinforcementQuantityEngine';
import { FormworkQuantityEngine } from './engines/formworkQuantityEngine';
import { OpeningEngine } from './engines/openingEngine';
import { WallQuantityEngine } from './engines/wallQuantityEngine';
import { RoofGeometryEngine } from './engines/roofGeometryEngine';
import { MEPQuantityEngine } from './engines/mepQuantityEngine';
import { ProvenanceEngine } from '../provenance/provenanceEngine';

function toNum(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  return Number.isNaN(num) ? fallback : num;
}

function createResidentialOutput(params: {
  calculatorId: string;
  version: string;
  primaryQuantity: number;
  primaryUnit: string;
  primaryLabel: string;
  breakdown: Record<string, number>;
  formulaSource: FormulaProvenance;
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
    warnings: [],
    provenance: [params.formulaSource],
    status: params.formulaSource.status,
    validation: params.validation || {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedInputs: {},
    },
    timestamp: new Date().toISOString(),
  };
}

export const RESIDENTIAL_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 01. CUT_AND_FILL
  {
    id: 'residential.cut_and_fill',
    name: 'Cut & Fill Tanah Lahan',
    shortName: 'Cut & Fill',
    category: 'site',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume galian (cut) dan timbunan (fill) berdasarkan elevasi eksisting dan rencana.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Netto Tanah',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Lahan', unit: 'm', defaultValue: 20, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Lahan', unit: 'm', defaultValue: 10, min: 0.1, required: true },
      { id: 'existingLevel', label: 'Elevasi Eksisting', unit: 'm', defaultValue: 0.0, required: true },
      { id: 'proposedLevel', label: 'Elevasi Rencana', unit: 'm', defaultValue: 0.50, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.cut_and_fill',
      calculatorVersion: '1.0.0',
      formulaId: 'CUT_AND_FILL_UNIFORM',
      mathematicalExpression: 'Area * (proposedLevel - existingLevel)',
      referenceName: 'Standard Earthwork Geometric Survey',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = EarthworkEngine.calculateCutAndFill({
        length: toNum(inputs.length, 20),
        width: toNum(inputs.width, 10),
        existingLevel: toNum(inputs.existingLevel, 0.0),
        proposedLevel: toNum(inputs.proposedLevel, 0.50),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.cut_and_fill',
        calculatorVersion: '1.0.0',
        formulaId: 'CUT_AND_FILL_UNIFORM',
        mathematicalExpression: 'Area * (proposedLevel - existingLevel)',
        referenceName: 'Standard Earthwork Geometric Survey',
      });
      return createResidentialOutput({
        calculatorId: 'residential.cut_and_fill',
        version: '1.0.0',
        primaryQuantity: Math.abs(res.netVolume),
        primaryUnit: 'm³',
        primaryLabel: res.netVolume >= 0 ? 'Volume Timbunan (Fill)' : 'Volume Galian (Cut)',
        breakdown: {
          luasLahanM2: res.area,
          bedaTinggiM: res.depthDifference,
          volumeCutM3: res.cutVolume,
          volumeFillM3: res.fillVolume,
          volumeNettoM3: res.netVolume,
        },
        formulaSource,
      });
    },
  },

  // 02. GALIAN_TANAH
  {
    id: 'residential.galian_tanah',
    name: 'Galian Tanah Pondasi & Saluran',
    shortName: 'Galian Tanah',
    category: 'site',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume galian tanah trapesium atau persegi untuk pondasi dan saluran.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Tanah',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Galian', unit: 'm', defaultValue: 45.0, min: 0.1, required: true },
      { id: 'depth', label: 'Kedalaman Galian', unit: 'm', defaultValue: 1.0, min: 0.1, required: true },
      { id: 'topWidth', label: 'Lebar Atas', unit: 'm', defaultValue: 0.90, min: 0.1, required: true },
      { id: 'bottomWidth', label: 'Lebar Bawah', unit: 'm', defaultValue: 0.70, min: 0.1 },
      { id: 'quantity', label: 'Jumlah Segmen', unit: 'unit', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.galian_tanah',
      calculatorVersion: '1.0.0',
      formulaId: 'EXCAVATION_TRAPEZOID',
      mathematicalExpression: '((topWidth + bottomWidth) / 2) * depth * length * qty',
      referenceName: 'Standard Trench Geometry',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = EarthworkEngine.calculateExcavation({
        length: toNum(inputs.length, 45.0),
        depth: toNum(inputs.depth, 1.0),
        topWidth: toNum(inputs.topWidth, 0.90),
        bottomWidth: inputs.bottomWidth !== undefined ? toNum(inputs.bottomWidth, 0.70) : undefined,
        quantity: toNum(inputs.quantity, 1),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.galian_tanah',
        calculatorVersion: '1.0.0',
        formulaId: 'EXCAVATION_TRAPEZOID',
        mathematicalExpression: '((topWidth + bottomWidth) / 2) * depth * length * qty',
        referenceName: 'Standard Trench Geometry',
      });
      return createResidentialOutput({
        calculatorId: 'residential.galian_tanah',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Tanah',
        breakdown: {
          luasPenampangM2: res.sectionArea,
          volumePerUnitM3: res.volumePerUnit,
          volumeTotalM3: res.totalVolume,
        },
        formulaSource,
      });
    },
  },

  // 03. URUGAN_TANAH
  {
    id: 'residential.urugan_tanah',
    name: 'Urugan Tanah Kembali / Peninggian Lahan',
    shortName: 'Urugan Tanah',
    category: 'site',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume urugan tanah lapis per lapis.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Urugan Tanah',
    status: 'VERIFIED',
    parameters: [
      { id: 'area', label: 'Luas Area Urugan', unit: 'm²', defaultValue: 60.0, min: 0.1, required: true },
      { id: 'thickness', label: 'Ketebalan Urugan', unit: 'm', defaultValue: 0.20, min: 0.01, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.urugan_tanah',
      calculatorVersion: '1.0.0',
      formulaId: 'BACKFILL_LAYER',
      mathematicalExpression: 'Area * thickness',
      referenceName: 'Standard Soil Backfill Formula',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = EarthworkEngine.calculateBackfill({
        area: toNum(inputs.area, 60.0),
        thickness: toNum(inputs.thickness, 0.20),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.urugan_tanah',
        calculatorVersion: '1.0.0',
        formulaId: 'BACKFILL_LAYER',
        mathematicalExpression: 'Area * thickness',
        referenceName: 'Standard Soil Backfill Formula',
      });
      return createResidentialOutput({
        calculatorId: 'residential.urugan_tanah',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Urugan Tanah',
        breakdown: {
          luasAreaM2: res.area,
          tebalUruganM: res.thickness,
          volumeTotalM3: res.totalVolume,
        },
        formulaSource,
      });
    },
  },

  // 04. PASIR_BATU_URUG
  {
    id: 'residential.pasir_batu_urug',
    name: 'Lapisan Pasir / Batu Urug',
    shortName: 'Pasir Batu Urug',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume lapisan pasir urug bawah pondasi/lantai dan anstamping batu kosong.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Lapisan Urug',
    status: 'VERIFIED',
    parameters: [
      { id: 'area', label: 'Luas Area', unit: 'm²', defaultValue: 45.0, min: 0.1 },
      { id: 'length', label: 'Panjang Lajur', unit: 'm', defaultValue: 45.0 },
      { id: 'width', label: 'Lebar Lajur', unit: 'm', defaultValue: 0.80 },
      { id: 'thickness', label: 'Ketebalan Lapisan', unit: 'm', defaultValue: 0.05, min: 0.01, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.pasir_batu_urug',
      calculatorVersion: '1.0.0',
      formulaId: 'FILL_LAYER_VOLUME',
      mathematicalExpression: 'Length * Width * Thickness',
      referenceName: 'Bedding Layer Geometric Standard',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = FillLayerEngine.calculate({
        area: inputs.area !== undefined ? toNum(inputs.area, 45.0) : undefined,
        length: inputs.length !== undefined ? toNum(inputs.length, 45.0) : undefined,
        width: inputs.width !== undefined ? toNum(inputs.width, 0.80) : undefined,
        thickness: toNum(inputs.thickness, 0.05),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.pasir_batu_urug',
        calculatorVersion: '1.0.0',
        formulaId: 'FILL_LAYER_VOLUME',
        mathematicalExpression: 'Length * Width * Thickness',
        referenceName: 'Bedding Layer Geometric Standard',
      });
      return createResidentialOutput({
        calculatorId: 'residential.pasir_batu_urug',
        version: '1.0.0',
        primaryQuantity: res.volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Lapisan Urug',
        breakdown: {
          luasM2: res.area,
          tebalM: res.thickness,
          volumeM3: res.volume,
        },
        formulaSource,
      });
    },
  },

  // 05. PONDASI_BATU_KALI
  {
    id: 'residential.pondasi_batu_kali',
    name: 'Pondasi Batu Kali',
    shortName: 'Batu Kali',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume pasangan pondasi batu kali trapesium.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pondasi Batu Kali',
    status: 'VERIFIED',
    parameters: [
      { id: 'topWidth', label: 'Lebar Atas Pondasi (Ba)', unit: 'm', defaultValue: 0.30, min: 0.1, required: true },
      { id: 'bottomWidth', label: 'Lebar Bawah Pondasi (Bb)', unit: 'm', defaultValue: 0.70, min: 0.1, required: true },
      { id: 'height', label: 'Tinggi Pondasi (H)', unit: 'm', defaultValue: 0.80, min: 0.1, required: true },
      { id: 'length', label: 'Panjang Total Pondasi (P)', unit: 'm', defaultValue: 45.0, min: 0.1, required: true },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.pondasi_batu_kali',
      calculatorVersion: '1.0.0',
      formulaId: 'PONDASI_BATU_KALI',
      mathematicalExpression: '((topWidth + bottomWidth) / 2) * height * length',
      sheet: 'Pondasi',
      cell: 'I10',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = ConcreteQuantityEngine.calculateTrapezoidStrip({
        topWidth: toNum(inputs.topWidth, 0.30),
        bottomWidth: toNum(inputs.bottomWidth, 0.70),
        height: toNum(inputs.height, 0.80),
        length: toNum(inputs.length, 45.0),
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.pondasi_batu_kali',
        calculatorVersion: '1.0.0',
        formulaId: 'PONDASI_BATU_KALI',
        mathematicalExpression: '((topWidth + bottomWidth) / 2) * height * length',
        sheet: 'Pondasi',
        cell: 'I10',
      });
      return createResidentialOutput({
        calculatorId: 'residential.pondasi_batu_kali',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasangan Batu Kali',
        breakdown: {
          luasPenampangM2: res.details?.sectionArea || 0,
          volumeTotalM3: res.totalVolume,
        },
        formulaSource,
      });
    },
  },

  // 06. LANTAI_KERJA
  {
    id: 'residential.lantai_kerja',
    name: 'Lantai Kerja Beton (Lean Concrete)',
    shortName: 'Lantai Kerja',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume rabat beton / lantai kerja (blinding) tebal 5-10 cm.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Lantai Kerja',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Area', unit: 'm', defaultValue: 12.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Area', unit: 'm', defaultValue: 8.0, min: 0.1, required: true },
      { id: 'thickness', label: 'Ketebalan Beton', unit: 'm', defaultValue: 0.05, min: 0.01, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.lantai_kerja',
      calculatorVersion: '1.0.0',
      formulaId: 'LEAN_CONCRETE_VOLUME',
      mathematicalExpression: 'Length * Width * Thickness',
      referenceName: 'Lean Concrete Layer Geometry',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = FillLayerEngine.calculate({
        length: toNum(inputs.length, 12.0),
        width: toNum(inputs.width, 8.0),
        thickness: toNum(inputs.thickness, 0.05),
        materialType: 'lean_concrete',
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.lantai_kerja',
        calculatorVersion: '1.0.0',
        formulaId: 'LEAN_CONCRETE_VOLUME',
        mathematicalExpression: 'Length * Width * Thickness',
        referenceName: 'Lean Concrete Layer Geometry',
      });
      return createResidentialOutput({
        calculatorId: 'residential.lantai_kerja',
        version: '1.0.0',
        primaryQuantity: res.volume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Lantai Kerja',
        breakdown: {
          luasM2: res.area,
          tebalM: res.thickness,
          volumeM3: res.volume,
        },
        formulaSource,
      });
    },
  },

  // 07. BETON
  {
    id: 'residential.beton',
    name: 'Generic Beton Cor Konstruksi',
    shortName: 'Beton Cor',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume cor beton murni untuk elemen struktural prismatik.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Beton',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang (L)', unit: 'm', defaultValue: 6.0, min: 0.01, required: true },
      { id: 'width', label: 'Lebar (b)', unit: 'm', defaultValue: 0.20, min: 0.01, required: true },
      { id: 'height', label: 'Tinggi (h)', unit: 'm', defaultValue: 0.30, min: 0.01, required: true },
      { id: 'quantity', label: 'Jumlah Elemen (n)', unit: 'unit', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.beton',
      calculatorVersion: '1.0.0',
      formulaId: 'CONCRETE_PRISM_VOLUME',
      mathematicalExpression: 'L * b * h * qty',
      referenceName: 'Solid Geometry Formulation',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = ConcreteQuantityEngine.calculatePrism({
        length: toNum(inputs.length, 6.0),
        width: toNum(inputs.width, 0.20),
        height: toNum(inputs.height, 0.30),
        quantity: toNum(inputs.quantity, 1),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.beton',
        calculatorVersion: '1.0.0',
        formulaId: 'CONCRETE_PRISM_VOLUME',
        mathematicalExpression: 'L * b * h * qty',
        referenceName: 'Solid Geometry Formulation',
      });
      return createResidentialOutput({
        calculatorId: 'residential.beton',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Beton',
        breakdown: {
          volumePerUnitM3: res.volumePerUnit,
          volumeTotalM3: res.totalVolume,
        },
        formulaSource,
      });
    },
  },

  // 08. PEMBESIAN
  {
    id: 'residential.pembesian',
    name: 'Pembesian Besi Beton Bertulang',
    shortName: 'Pembesian Rebar',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung total panjang dan berat besi tulangan beton berdasarkan schedule pemotongan.',
    primaryUnit: 'kg',
    primaryQuantityLabel: 'Berat Besi Tulangan',
    status: 'VERIFIED',
    parameters: [
      { id: 'diameterMm', label: 'Diameter Besi', unit: 'mm', defaultValue: 12, min: 4, max: 50, required: true },
      { id: 'cutLengthM', label: 'Panjang Potong per Batang', unit: 'm', defaultValue: 4.0, min: 0.1, required: true },
      { id: 'quantity', label: 'Jumlah Batang', unit: 'btg', defaultValue: 20, min: 1, required: true },
      { id: 'wastePercentage', label: 'Faktor Waste Pembesian', unit: '%', defaultValue: 5.0, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.pembesian',
      calculatorVersion: '1.0.0',
      formulaId: 'REINFORCEMENT_WEIGHT',
      mathematicalExpression: 'Length * Quantity * ((d^2)/162.2) * (1 + waste%)',
      referenceName: 'SNI 2052:2017 Steel Rebar Specification',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = ReinforcementQuantityEngine.calculate({
        bars: [{
          diameterMm: toNum(inputs.diameterMm, 12),
          cutLengthM: toNum(inputs.cutLengthM, 4.0),
          quantity: toNum(inputs.quantity, 20),
        }],
        wastePercentage: toNum(inputs.wastePercentage, 5.0),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.pembesian',
        calculatorVersion: '1.0.0',
        formulaId: 'REINFORCEMENT_WEIGHT',
        mathematicalExpression: 'Length * Quantity * ((d^2)/162.2) * (1 + waste%)',
        referenceName: 'SNI 2052:2017 Steel Rebar Specification',
      });
      return createResidentialOutput({
        calculatorId: 'residential.pembesian',
        version: '1.0.0',
        primaryQuantity: res.totalWeightKg,
        primaryUnit: 'kg',
        primaryLabel: 'Berat Total Besi Beton',
        breakdown: {
          totalPanjangM: res.totalLengthM,
          beratKg: res.totalWeightKg,
          beratTon: res.totalWeightTon,
          unitWeightKgPerM: res.barDetails[0]?.unitWeightKgPerM || 0,
        },
        formulaSource,
      });
    },
  },

  // 09. BEKISTING
  {
    id: 'residential.bekisting',
    name: 'Bekisting Struktur Beton',
    shortName: 'Bekisting',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas permukaan kontak bekisting untuk balok, kolom, plat, atau footing.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Permukaan Bekisting',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Elemen', unit: 'm', defaultValue: 6.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Elemen', unit: 'm', defaultValue: 0.20, min: 0.05, required: true },
      { id: 'height', label: 'Tinggi Elemen', unit: 'm', defaultValue: 0.35, min: 0.05, required: true },
      { id: 'quantity', label: 'Jumlah Elemen', unit: 'unit', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.bekisting',
      calculatorVersion: '1.0.0',
      formulaId: 'FORMWORK_CONTACT_AREA',
      mathematicalExpression: '(2*h + w) * L * qty',
      referenceName: 'Formwork Contact Geometry',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = FormworkQuantityEngine.calculateBeam({
        length: toNum(inputs.length, 6.0),
        width: toNum(inputs.width, 0.20),
        height: toNum(inputs.height, 0.35),
        quantity: toNum(inputs.quantity, 1),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.bekisting',
        calculatorVersion: '1.0.0',
        formulaId: 'FORMWORK_CONTACT_AREA',
        mathematicalExpression: '(2*h + w) * L * qty',
        referenceName: 'Formwork Contact Geometry',
      });
      return createResidentialOutput({
        calculatorId: 'residential.bekisting',
        version: '1.0.0',
        primaryQuantity: res.totalArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Bekisting',
        breakdown: {
          luasPerUnitM2: res.areaPerUnit,
          luasTotalM2: res.totalArea,
        },
        formulaSource,
      });
    },
  },

  // 10. DINDING
  {
    id: 'residential.dinding',
    name: 'Dinding Pasangan Bata / Hebel',
    shortName: 'Dinding Bata',
    category: 'architecture',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas bersih pasangan dinding dengan deduksi bukaan dan tambahan sopi-sopi.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Netto Dinding',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Total Dinding (P)', unit: 'm', defaultValue: 32.0, min: 0.1, required: true },
      { id: 'height', label: 'Tinggi Dinding (H)', unit: 'm', defaultValue: 3.50, min: 0.1, required: true },
      { id: 'openingArea', label: 'Luas Bukaan (Pintu/Jendela)', unit: 'm²', defaultValue: 14.50, min: 0 },
      { id: 'gableArea', label: 'Luas Sopi-sopi Segitiga', unit: 'm²', defaultValue: 6.0, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.dinding',
      calculatorVersion: '1.0.0',
      formulaId: 'WALL_NET_AREA',
      mathematicalExpression: '(P * H) + GableArea - OpeningArea',
      referenceName: 'Masonry Net Area Formulation',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const gArea = toNum(inputs.gableArea, 6.0);
      const res = WallQuantityEngine.calculateWall({
        length: toNum(inputs.length, 32.0),
        height: toNum(inputs.height, 3.50),
        openingAreaM2: toNum(inputs.openingArea, 14.50),
        gableWidthM: gArea > 0 ? Math.sqrt(gArea * 2) : 0,
        gableHeightM: gArea > 0 ? Math.sqrt(gArea * 2) : 0,
        gableCount: 1,
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.dinding',
        calculatorVersion: '1.0.0',
        formulaId: 'WALL_NET_AREA',
        mathematicalExpression: '(P * H) + GableArea - OpeningArea',
        referenceName: 'Masonry Net Area Formulation',
      });
      return createResidentialOutput({
        calculatorId: 'residential.dinding',
        version: '1.0.0',
        primaryQuantity: res.netWallAreaM2,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Netto Pasangan Dinding',
        breakdown: {
          luasKotorM2: res.grossAreaM2,
          luasBukaanM2: res.openingAreaM2,
          luasNettoM2: res.netWallAreaM2,
          volumeDindingM3: res.wallVolumeM3,
        },
        formulaSource,
      });
    },
  },

  // 11. PLESTER_ACIAN
  {
    id: 'residential.plester_acian',
    name: 'Plesteran & Acian Dinding',
    shortName: 'Plester Acian',
    category: 'finishing',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas plesteran dan acian dinding 1 atau 2 sisi.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Plesteran & Acian',
    status: 'VERIFIED',
    parameters: [
      { id: 'netWallArea', label: 'Luas Netto Dinding', unit: 'm²', defaultValue: 105.0, min: 0.1, required: true },
      { id: 'twoSides', label: 'Aplikasi 2 Sisi (1=Ya, 0=Tidak)', unit: 'bool', defaultValue: 1 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.plester_acian',
      calculatorVersion: '1.0.0',
      formulaId: 'PLESTERAN_ACIAN',
      mathematicalExpression: 'NetWallArea * (twoSides ? 2 : 1)',
      sheet: 'Plesteran & Acian',
      cell: 'N9',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = WallQuantityEngine.calculatePlasterAcian({
        netWallAreaM2: toNum(inputs.netWallArea, 105.0),
        twoSides: inputs.twoSides !== undefined ? inputs.twoSides !== 0 && inputs.twoSides !== '0' && inputs.twoSides !== false : true,
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.plester_acian',
        calculatorVersion: '1.0.0',
        formulaId: 'PLESTERAN_ACIAN',
        mathematicalExpression: 'NetWallArea * (twoSides ? 2 : 1)',
        sheet: 'Plesteran & Acian',
        cell: 'N9',
      });
      return createResidentialOutput({
        calculatorId: 'residential.plester_acian',
        version: '1.0.0',
        primaryQuantity: res.plasterAreaM2,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Plesteran & Acian',
        breakdown: {
          luasPlesteranM2: res.plasterAreaM2,
          volumePlesteranM3: res.plasterVolumeM3,
          luasAcianM2: res.acianAreaM2,
        },
        formulaSource,
      });
    },
  },

  // 12. PENUTUP_LANTAI
  {
    id: 'residential.penutup_lantai',
    name: 'Penutup Lantai Keramik / Granit',
    shortName: 'Lantai Keramik',
    category: 'finishing',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas lantai dan kebutuhan ubin keramik/granit.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasangan Lantai',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Ruangan', unit: 'm', defaultValue: 10.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Ruangan', unit: 'm', defaultValue: 8.0, min: 0.1, required: true },
      { id: 'tileLengthCm', label: 'Panjang Ubin', unit: 'cm', defaultValue: 60 },
      { id: 'tileWidthCm', label: 'Lebar Ubin', unit: 'cm', defaultValue: 60 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.penutup_lantai',
      calculatorVersion: '1.0.0',
      formulaId: 'PENUTUP_LANTAI',
      mathematicalExpression: 'Length * Width',
      sheet: 'Penutup Lantai',
      cell: 'N9',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const l = toNum(inputs.length, 10.0);
      const w = toNum(inputs.width, 8.0);
      const area = l * w;
      const res = WallQuantityEngine.calculateTileFinish({
        areaM2: area,
        tileLengthCm: toNum(inputs.tileLengthCm, 60),
        tileWidthCm: toNum(inputs.tileWidthCm, 60),
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.penutup_lantai',
        calculatorVersion: '1.0.0',
        formulaId: 'PENUTUP_LANTAI',
        mathematicalExpression: 'Length * Width',
        sheet: 'Penutup Lantai',
        cell: 'N9',
      });
      return createResidentialOutput({
        calculatorId: 'residential.penutup_lantai',
        version: '1.0.0',
        primaryQuantity: res.netAreaM2,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pasangan Lantai',
        breakdown: {
          luasNettoM2: res.netAreaM2,
          estimasiKepingUbin: res.tileCount || 0,
          estimasiDus: res.boxCount || 0,
        },
        formulaSource,
      });
    },
  },

  // 13. PENUTUP_DINDING
  {
    id: 'residential.penutup_dinding',
    name: 'Penutup Dinding Keramik',
    shortName: 'Dinding Keramik',
    category: 'finishing',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas pasangan keramik dinding kamar mandi / dapur.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Keramik Dinding',
    status: 'VERIFIED',
    parameters: [
      { id: 'perimeter', label: 'Keliling Dinding', unit: 'm', defaultValue: 8.0, min: 0.1, required: true },
      { id: 'height', label: 'Tinggi Pasangan', unit: 'm', defaultValue: 2.40, min: 0.1, required: true },
      { id: 'openingArea', label: 'Luas Bukaan (Pintu)', unit: 'm²', defaultValue: 1.80, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.penutup_dinding',
      calculatorVersion: '1.0.0',
      formulaId: 'PENUTUP_DINDING',
      mathematicalExpression: '((Perimeter * Height) - OpeningArea) * 1.05',
      sheet: 'Penutup Dinding',
      cell: 'N9',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const p = toNum(inputs.perimeter, 8.0);
      const h = toNum(inputs.height, 2.40);
      const op = toNum(inputs.openingArea, 1.80);
      const grossArea = p * h;
      const netArea = Math.max(0, grossArea - op);
      const withWaste = Math.round(netArea * 1.05 * 100) / 100;
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.penutup_dinding',
        calculatorVersion: '1.0.0',
        formulaId: 'PENUTUP_DINDING',
        mathematicalExpression: '((Perimeter * Height) - OpeningArea) * 1.05',
        sheet: 'Penutup Dinding',
        cell: 'N9',
      });
      return createResidentialOutput({
        calculatorId: 'residential.penutup_dinding',
        version: '1.0.0',
        primaryQuantity: withWaste,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Keramik Dinding',
        breakdown: {
          luasKotorM2: grossArea,
          luasBukaanM2: op,
          luasNettoM2: netArea,
          luasDenganWasteM2: withWaste,
        },
        formulaSource,
      });
    },
  },

  // 14. PLAFON
  {
    id: 'residential.plafon',
    name: 'Plafon Gypsum / PVC',
    shortName: 'Plafon',
    category: 'finishing',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas penutup langit-langit (plafon).',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Plafon',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Ruangan', unit: 'm', defaultValue: 10.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Ruangan', unit: 'm', defaultValue: 8.0, min: 0.1, required: true },
      { id: 'voidArea', label: 'Luas Void / Lubang', unit: 'm²', defaultValue: 0, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.plafon',
      calculatorVersion: '1.0.0',
      formulaId: 'PLAFON',
      mathematicalExpression: '(Length * Width) - VoidArea',
      sheet: 'Plafon',
      cell: 'J8',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const l = toNum(inputs.length, 10.0);
      const w = toNum(inputs.width, 8.0);
      const v = toNum(inputs.voidArea, 0);
      const area = Math.max(0, (l * w) - v);
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.plafon',
        calculatorVersion: '1.0.0',
        formulaId: 'PLAFON',
        mathematicalExpression: '(Length * Width) - VoidArea',
        sheet: 'Plafon',
        cell: 'J8',
      });
      return createResidentialOutput({
        calculatorId: 'residential.plafon',
        version: '1.0.0',
        primaryQuantity: area,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Plafon',
        breakdown: {
          luasKotorM2: l * w,
          luasVoidM2: v,
          luasNettoM2: area,
        },
        formulaSource,
      });
    },
  },

  // 15. PENGECATAN
  {
    id: 'residential.pengecatan',
    name: 'Pengecatan Dinding & Plafon',
    shortName: 'Pengecatan',
    category: 'finishing',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung total luas permukaan cat interior, eksterior, dan plafon.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Total Pengecatan',
    status: 'VERIFIED',
    parameters: [
      { id: 'interiorArea', label: 'Luas Dinding Interior', unit: 'm²', defaultValue: 140.0, min: 0 },
      { id: 'exteriorArea', label: 'Luas Dinding Eksterior', unit: 'm²', defaultValue: 70.0, min: 0 },
      { id: 'ceilingArea', label: 'Luas Plafon', unit: 'm²', defaultValue: 80.0, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.pengecatan',
      calculatorVersion: '1.0.0',
      formulaId: 'PENGECATAN',
      mathematicalExpression: 'interiorArea + exteriorArea + ceilingArea',
      sheet: 'Pengecatan',
      cell: 'J20',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const intArea = toNum(inputs.interiorArea, 140.0);
      const extArea = toNum(inputs.exteriorArea, 70.0);
      const ceilArea = toNum(inputs.ceilingArea, 80.0);
      const total = intArea + extArea + ceilArea;
      const paintCalc = WallQuantityEngine.calculatePaint({ surfaceAreaM2: total, coats: 2, coverageRateM2PerLiter: 10 });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.pengecatan',
        calculatorVersion: '1.0.0',
        formulaId: 'PENGECATAN',
        mathematicalExpression: 'interiorArea + exteriorArea + ceilingArea',
        sheet: 'Pengecatan',
        cell: 'J20',
      });
      return createResidentialOutput({
        calculatorId: 'residential.pengecatan',
        version: '1.0.0',
        primaryQuantity: total,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Total Pengecatan',
        breakdown: {
          luasInteriorM2: intArea,
          luasEksteriorM2: extArea,
          luasPlafonM2: ceilArea,
          estimasiKebutuhanCatLiter: paintCalc.totalVolumeLiters,
        },
        formulaSource,
      });
    },
  },

  // 16. ATAP_BAJA_RINGAN
  {
    id: 'residential.atap_baja_ringan',
    name: 'Rangka Atap Baja Ringan (Truss)',
    shortName: 'Baja Ringan',
    category: 'roof',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas bidang miring 3D rangka atap baja ringan.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Bidang Atap 3D',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Bangunan', unit: 'm', defaultValue: 12.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Bangunan', unit: 'm', defaultValue: 8.0, min: 0.1, required: true },
      { id: 'overhang', label: 'Overhang / Teritisan', unit: 'm', defaultValue: 0.80, min: 0 },
      { id: 'pitchAngle', label: 'Sudut Kemiringan Atap', unit: 'derajat', defaultValue: 30, min: 5, max: 60, required: true },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.atap_baja_ringan',
      calculatorVersion: '1.0.0',
      formulaId: 'ATAP_BAJA_RINGAN',
      mathematicalExpression: '((Length + 2*Overhang) * (Width + 2*Overhang)) / cos(PitchAngle)',
      sheet: 'Atap Baja Ringan',
      cell: 'I8',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = RoofGeometryEngine.calculate({
        buildingLengthM: toNum(inputs.length, 12.0),
        buildingWidthM: toNum(inputs.width, 8.0),
        overhangM: toNum(inputs.overhang, 0.80),
        pitchAngleDegrees: toNum(inputs.pitchAngle, 30),
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.atap_baja_ringan',
        calculatorVersion: '1.0.0',
        formulaId: 'ATAP_BAJA_RINGAN',
        mathematicalExpression: '((Length + 2*Overhang) * (Width + 2*Overhang)) / cos(PitchAngle)',
        sheet: 'Atap Baja Ringan',
        cell: 'I8',
      });
      return createResidentialOutput({
        calculatorId: 'residential.atap_baja_ringan',
        version: '1.0.0',
        primaryQuantity: res.totalSlopedRoofAreaM2,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Bidang Miring Rangka Atap',
        breakdown: {
          luasDenahM2: res.footprintAreaM2,
          bentangSetengahM: res.halfSpanM,
          tinggiKudaKudaM: res.riseM,
          panjangKemiringanM: res.slopeLengthM,
          luasAtap3DM2: res.totalSlopedRoofAreaM2,
        },
        formulaSource,
      });
    },
  },

  // 17. PENUTUP_ATAP
  {
    id: 'residential.penutup_atap',
    name: 'Penutup Atap (Genteng / Spandek)',
    shortName: 'Penutup Atap',
    category: 'roof',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung kebutuhan penutup atap genteng atau lembaran spandek.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasangan Penutup Atap',
    status: 'VERIFIED',
    parameters: [
      { id: 'slopedArea', label: 'Luas Bidang Atap 3D', unit: 'm²', defaultValue: 150.76, min: 0.1, required: true },
      { id: 'tileCoverArea', label: 'Luas Efektif per Keping', unit: 'm²', defaultValue: 0.10, min: 0.01 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.penutup_atap',
      calculatorVersion: '1.0.0',
      formulaId: 'ROOF_COVER_CALCULATION',
      mathematicalExpression: 'SlopedArea / TileCoverArea',
      referenceName: 'Roof Cladding Geometry',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const area = toNum(inputs.slopedArea, 150.76);
      const tileArea = toNum(inputs.tileCoverArea, 0.10);
      const count = tileArea > 0 ? Math.ceil(area / tileArea) : undefined;
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.penutup_atap',
        calculatorVersion: '1.0.0',
        formulaId: 'ROOF_COVER_CALCULATION',
        mathematicalExpression: 'SlopedArea / TileCoverArea',
        referenceName: 'Roof Cladding Geometry',
      });
      return createResidentialOutput({
        calculatorId: 'residential.penutup_atap',
        version: '1.0.0',
        primaryQuantity: area,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Penutup Atap',
        breakdown: {
          luasAtapM2: area,
          estimasiKepingGenteng: count || 0,
        },
        formulaSource,
      });
    },
  },

  // 18. PINTU_JENDELA
  {
    id: 'residential.pintu_jendela',
    name: 'Kusen, Daun Pintu & Jendela',
    shortName: 'Pintu & Jendela',
    category: 'openings',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung luas daun pintu/jendela dan panjang keliling kusen.',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Total Luas Daun Pintu & Jendela',
    status: 'VERIFIED',
    parameters: [
      { id: 'nPintuUtama', label: 'Jumlah Pintu Utama', unit: 'unit', defaultValue: 1, min: 0 },
      { id: 'nPintuKamar', label: 'Jumlah Pintu Kamar', unit: 'unit', defaultValue: 4, min: 0 },
      { id: 'nPintuKM', label: 'Jumlah Pintu Kamar Mandi', unit: 'unit', defaultValue: 2, min: 0 },
      { id: 'nJendelaGanda', label: 'Jumlah Jendela Ganda', unit: 'unit', defaultValue: 3, min: 0 },
      { id: 'nJendelaTunggal', label: 'Jumlah Jendela Tunggal', unit: 'unit', defaultValue: 4, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.pintu_jendela',
      calculatorVersion: '1.0.0',
      formulaId: 'PINTU_JENDELA',
      mathematicalExpression: 'Σ(Pintu Area) + Σ(Jendela Area)',
      sheet: 'Pintu & Jendela',
      cell: 'N9',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = OpeningEngine.calculate({
        openings: [
          { type: 'door', name: 'Pintu Utama', widthM: 0.9, heightM: 2.1, quantity: toNum(inputs.nPintuUtama, 1) },
          { type: 'door', name: 'Pintu Kamar', widthM: 0.8, heightM: 2.1, quantity: toNum(inputs.nPintuKamar, 4) },
          { type: 'door', name: 'Pintu KM', widthM: 0.7, heightM: 2.0, quantity: toNum(inputs.nPintuKM, 2) },
          { type: 'window', name: 'Jendela Ganda', widthM: 1.2, heightM: 1.5, quantity: toNum(inputs.nJendelaGanda, 3) },
          { type: 'window', name: 'Jendela Tunggal', widthM: 0.6, heightM: 1.5, quantity: toNum(inputs.nJendelaTunggal, 4) },
        ],
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.pintu_jendela',
        calculatorVersion: '1.0.0',
        formulaId: 'PINTU_JENDELA',
        mathematicalExpression: 'Σ(Pintu Area) + Σ(Jendela Area)',
        sheet: 'Pintu & Jendela',
        cell: 'N9',
      });
      return createResidentialOutput({
        calculatorId: 'residential.pintu_jendela',
        version: '1.0.0',
        primaryQuantity: res.totalOpeningAreaM2,
        primaryUnit: 'm²',
        primaryLabel: 'Total Luas Daun Pintu & Jendela',
        breakdown: {
          totalUnit: res.totalCount,
          luasBukaanM2: res.totalOpeningAreaM2,
          kelilingKusenM: res.totalFramePerimeterM,
        },
        formulaSource,
      });
    },
  },

  // 19. TALANG_LISPLANK
  {
    id: 'residential.talang_lisplank',
    name: 'Talang Juray & Lisplank Atap',
    shortName: 'Talang & Lisplank',
    category: 'roof',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung panjang talang air dan papan lisplank keliling atap.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Lisplank Keliling',
    status: 'VERIFIED',
    parameters: [
      { id: 'buildingLength', label: 'Panjang Bangunan', unit: 'm', defaultValue: 12.0, min: 0.1, required: true },
      { id: 'buildingWidth', label: 'Lebar Bangunan', unit: 'm', defaultValue: 8.0, min: 0.1, required: true },
      { id: 'overhang', label: 'Overhang', unit: 'm', defaultValue: 0.80, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.talang_lisplank',
      calculatorVersion: '1.0.0',
      formulaId: 'ROOF_EDGES_LENGTH',
      mathematicalExpression: '2 * (L + 2*Ov + W + 2*Ov)',
      referenceName: 'Roof Edge Formulation',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = RoofGeometryEngine.calculate({
        buildingLengthM: toNum(inputs.buildingLength, 12.0),
        buildingWidthM: toNum(inputs.buildingWidth, 8.0),
        overhangM: toNum(inputs.overhang, 0.80),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.talang_lisplank',
        calculatorVersion: '1.0.0',
        formulaId: 'ROOF_EDGES_LENGTH',
        mathematicalExpression: '2 * (L + 2*Ov + W + 2*Ov)',
        referenceName: 'Roof Edge Formulation',
      });
      return createResidentialOutput({
        calculatorId: 'residential.talang_lisplank',
        version: '1.0.0',
        primaryQuantity: res.fasciaBoardLengthM,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Lisplank Keliling',
        breakdown: {
          panjangLisplankM: res.fasciaBoardLengthM,
          panjangTalangM: res.gutterLengthM,
          panjangNokM: res.ridgeLengthM,
        },
        formulaSource,
      });
    },
  },

  // 20. INSTALASI_LISTRIK_BASIC
  {
    id: 'residential.instalasi_listrik_basic',
    name: 'Instalasi Listrik Titik Lampu & Stop Kontak',
    shortName: 'Listrik Titik',
    category: 'mep',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung titik lampu, stop kontak, saklar, dan panjang jalur konduit/kabel.',
    primaryUnit: 'titik',
    primaryQuantityLabel: 'Total Titik Kelistrikan',
    status: 'VERIFIED',
    parameters: [
      { id: 'nLampu', label: 'Titik Lampu', unit: 'titik', defaultValue: 18, min: 0 },
      { id: 'nStopKontak', label: 'Stop Kontak', unit: 'titik', defaultValue: 12, min: 0 },
      { id: 'nSaklarTunggal', label: 'Saklar Tunggal', unit: 'titik', defaultValue: 6, min: 0 },
      { id: 'nSaklarGanda', label: 'Saklar Ganda', unit: 'titik', defaultValue: 4, min: 0 },
      { id: 'nMcb', label: 'Jumlah Grup MCB', unit: 'unit', defaultValue: 4, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.instalasi_listrik_basic',
      calculatorVersion: '1.0.0',
      formulaId: 'KELISTRIKAN',
      mathematicalExpression: 'nLampu + nStopKontak + nSaklarTunggal + nSaklarGanda',
      sheet: 'Kelistrikan',
      cell: 'N9',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = MEPQuantityEngine.calculateElectrical({
        lightingPointsCount: toNum(inputs.nLampu, 18),
        socketOutletsCount: toNum(inputs.nStopKontak, 12),
        singleSwitchCount: toNum(inputs.nSaklarTunggal, 6),
        doubleSwitchCount: toNum(inputs.nSaklarGanda, 4),
        mcbCount: toNum(inputs.nMcb, 4),
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.instalasi_listrik_basic',
        calculatorVersion: '1.0.0',
        formulaId: 'KELISTRIKAN',
        mathematicalExpression: 'nLampu + nStopKontak + nSaklarTunggal + nSaklarGanda',
        sheet: 'Kelistrikan',
        cell: 'N9',
      });
      return createResidentialOutput({
        calculatorId: 'residential.instalasi_listrik_basic',
        version: '1.0.0',
        primaryQuantity: res.totalPoints,
        primaryUnit: 'titik',
        primaryLabel: 'Total Titik Kelistrikan',
        breakdown: {
          titikLampu: res.lightingPoints,
          stopKontak: res.socketsCount,
          saklar: res.switchesCount,
          mcb: res.mcbCount,
          panjangKabelM: res.cableLengthM,
          panjangKonduitM: res.conduitLengthM,
        },
        formulaSource,
      });
    },
  },

  // 21. INSTALASI_AIR_BERSIH
  {
    id: 'residential.instalasi_air_bersih',
    name: 'Instalasi Perpipaan Air Bersih',
    shortName: 'Pipa Air Bersih',
    category: 'mep',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung panjang pipa utama, cabang, dan fitting instalasi air bersih.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Pipa Air Bersih',
    status: 'VERIFIED',
    parameters: [
      { id: 'pjgPipaUtama', label: 'Panjang Pipa Utama (3/4")', unit: 'm', defaultValue: 24.0, min: 0 },
      { id: 'pjgPipaCabang', label: 'Panjang Pipa Cabang (1/2")', unit: 'm', defaultValue: 32.0, min: 0 },
      { id: 'nKran', label: 'Jumlah Kran Air', unit: 'unit', defaultValue: 8, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.instalasi_air_bersih',
      calculatorVersion: '1.0.0',
      formulaId: 'AIR_BERSIH',
      mathematicalExpression: 'pjgPipaUtama + pjgPipaCabang',
      sheet: 'Instalasi Air Bersih',
      cell: 'M8',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const pUtama = toNum(inputs.pjgPipaUtama, 24.0);
      const pCabang = toNum(inputs.pjgPipaCabang, 32.0);
      const totalLen = pUtama + pCabang;
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.instalasi_air_bersih',
        calculatorVersion: '1.0.0',
        formulaId: 'AIR_BERSIH',
        mathematicalExpression: 'pjgPipaUtama + pjgPipaCabang',
        sheet: 'Instalasi Air Bersih',
        cell: 'M8',
      });
      return createResidentialOutput({
        calculatorId: 'residential.instalasi_air_bersih',
        version: '1.0.0',
        primaryQuantity: totalLen,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Pipa Air Bersih',
        breakdown: {
          pipaUtamaM: pUtama,
          pipaCabangM: pCabang,
          totalPanjangM: totalLen,
          jumlahKran: toNum(inputs.nKran, 8),
        },
        formulaSource,
      });
    },
  },

  // 22. AIR_KOTOR_BEKAS
  {
    id: 'residential.air_kotor_bekas',
    name: 'Instalasi Pipa Air Kotor, Bekas & Vent',
    shortName: 'Pipa Air Kotor',
    category: 'mep',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung panjang pipa air kotor (blackwater), air bekas (greywater), dan pipa vent.',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Total Panjang Pipa Limbah',
    status: 'VERIFIED',
    parameters: [
      { id: 'soilPipeLength', label: 'Panjang Pipa Air Kotor 4"', unit: 'm', defaultValue: 18.0, min: 0 },
      { id: 'wastePipeLength', label: 'Panjang Pipa Air Bekas 3"', unit: 'm', defaultValue: 24.0, min: 0 },
      { id: 'ventPipeLength', label: 'Panjang Pipa Hawa/Vent 1.5"', unit: 'm', defaultValue: 8.0, min: 0 },
      { id: 'floorDrains', label: 'Jumlah Floor Drain', unit: 'unit', defaultValue: 3, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.air_kotor_bekas',
      calculatorVersion: '1.0.0',
      formulaId: 'WASTEWATER_PIPE_LENGTH',
      mathematicalExpression: 'soilPipeLength + wastePipeLength + ventPipeLength',
      referenceName: 'Standard Drainage & Vent Piping',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const sLen = toNum(inputs.soilPipeLength, 18.0);
      const wLen = toNum(inputs.wastePipeLength, 24.0);
      const vLen = toNum(inputs.ventPipeLength, 8.0);
      const res = MEPQuantityEngine.calculatePlumbing({
        segments: [
          { pipeType: 'soil', diameterInch: '4', lengthM: sLen },
          { pipeType: 'waste', diameterInch: '3', lengthM: wLen },
          { pipeType: 'vent', diameterInch: '1.5', lengthM: vLen },
        ],
        floorDrainsCount: toNum(inputs.floorDrains, 3),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.air_kotor_bekas',
        calculatorVersion: '1.0.0',
        formulaId: 'WASTEWATER_PIPE_LENGTH',
        mathematicalExpression: 'soilPipeLength + wastePipeLength + ventPipeLength',
        referenceName: 'Standard Drainage & Vent Piping',
      });
      return createResidentialOutput({
        calculatorId: 'residential.air_kotor_bekas',
        version: '1.0.0',
        primaryQuantity: res.totalLengthM,
        primaryUnit: 'm',
        primaryLabel: 'Total Panjang Pipa Limbah',
        breakdown: {
          pipaAirKotorM: sLen,
          pipaAirBekasM: wLen,
          pipaVentM: vLen,
          totalPanjangM: res.totalLengthM,
          floorDrain: res.floorDrainsCount,
        },
        formulaSource,
      });
    },
  },

  // 23. SANITAIR
  {
    id: 'residential.sanitair',
    name: 'Sanitair & Perlengkapan Kamar Mandi',
    shortName: 'Sanitair',
    category: 'mep',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung total unit fixture sanitair (kloset, wastafel, shower set, floor drain).',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Total Unit Sanitair',
    status: 'VERIFIED',
    parameters: [
      { id: 'nKlosetDuduk', label: 'Kloset Duduk', unit: 'unit', defaultValue: 2, min: 0 },
      { id: 'nKlosetJongkok', label: 'Kloset Jongkok', unit: 'unit', defaultValue: 0, min: 0 },
      { id: 'nWastafel', label: 'Wastafel', unit: 'unit', defaultValue: 2, min: 0 },
      { id: 'nFloorDrain', label: 'Floor Drain', unit: 'unit', defaultValue: 3, min: 0 },
      { id: 'nShowerSet', label: 'Shower Set', unit: 'unit', defaultValue: 2, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.sanitair',
      calculatorVersion: '1.0.0',
      formulaId: 'SANITAIR',
      mathematicalExpression: 'Σ(Sanitary Units)',
      sheet: 'Sanitair',
      cell: 'E14',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = MEPQuantityEngine.calculateSanitary({
        waterClosetDudukCount: toNum(inputs.nKlosetDuduk, 2),
        waterClosetJongkokCount: toNum(inputs.nKlosetJongkok, 0),
        washBasinCount: toNum(inputs.nWastafel, 2),
        floorDrainCount: toNum(inputs.nFloorDrain, 3),
        showerSetCount: toNum(inputs.nShowerSet, 2),
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.sanitair',
        calculatorVersion: '1.0.0',
        formulaId: 'SANITAIR',
        mathematicalExpression: 'Σ(Sanitary Units)',
        sheet: 'Sanitair',
        cell: 'E14',
      });
      return createResidentialOutput({
        calculatorId: 'residential.sanitair',
        version: '1.0.0',
        primaryQuantity: res.totalUnits,
        primaryUnit: 'unit',
        primaryLabel: 'Total Unit Sanitair',
        breakdown: res.breakdown,
        formulaSource,
      });
    },
  },

  // 24. DRAINASE
  {
    id: 'residential.drainase',
    name: 'Saluran Drainase Keliling Rumah',
    shortName: 'Drainase',
    category: 'site',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume galian, pasangan dinding saluran, dan plat tutup drainase.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Drainase',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Saluran', unit: 'm', defaultValue: 30.0, min: 0.1, required: true },
      { id: 'topWidth', label: 'Lebar Saluran', unit: 'm', defaultValue: 0.40, min: 0.1, required: true },
      { id: 'depth', label: 'Kedalaman Saluran', unit: 'm', defaultValue: 0.40, min: 0.1, required: true },
      { id: 'wallThickness', label: 'Tebal Dinding', unit: 'm', defaultValue: 0.10, min: 0.05 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.drainase',
      calculatorVersion: '1.0.0',
      formulaId: 'DRAINAGE_CHANNEL',
      mathematicalExpression: 'Length * Width * Depth',
      referenceName: 'Drainage Channel Geometry',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = MEPQuantityEngine.calculateDrainage({
        lengthM: toNum(inputs.length, 30.0),
        topWidthM: toNum(inputs.topWidth, 0.40),
        depthM: toNum(inputs.depth, 0.40),
        wallThicknessM: toNum(inputs.wallThickness, 0.10),
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.drainase',
        calculatorVersion: '1.0.0',
        formulaId: 'DRAINAGE_CHANNEL',
        mathematicalExpression: 'Length * Width * Depth',
        referenceName: 'Drainage Channel Geometry',
      });
      return createResidentialOutput({
        calculatorId: 'residential.drainase',
        version: '1.0.0',
        primaryQuantity: res.excavationVolumeM3,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Drainase',
        breakdown: {
          volumeGalianM3: res.excavationVolumeM3,
          volumeDasarSaluranM3: res.channelBedVolumeM3,
          volumeDindingSaluranM3: res.channelWallVolumeM3,
          luasTutupSaluranM2: res.coverSlabAreaM2,
        },
        formulaSource,
      });
    },
  },

  // 25. SLOOF
  {
    id: 'residential.sloof',
    name: 'Sloof Beton Bertulang',
    shortName: 'Sloof Beton',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume cor beton sloof pengikat pondasi.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Beton Sloof',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Balok Sloof (P)', unit: 'm', defaultValue: 3.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Sloof (b)', unit: 'm', defaultValue: 0.20, min: 0.05, required: true },
      { id: 'height', label: 'Tinggi Sloof (h)', unit: 'm', defaultValue: 0.30, min: 0.05, required: true },
      { id: 'quantity', label: 'Jumlah Titik / Segmen (n)', unit: 'unit', defaultValue: 5, min: 1, required: true },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.sloof',
      calculatorVersion: '1.0.0',
      formulaId: 'SLOOF',
      mathematicalExpression: 'b * h * P * n',
      sheet: 'Sloof',
      cell: 'I20',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const l = toNum(inputs.length, 3.0);
      const w = toNum(inputs.width, 0.20);
      const h = toNum(inputs.height, 0.30);
      const qty = toNum(inputs.quantity, 5);
      const res = ConcreteQuantityEngine.calculatePrism({
        length: l,
        width: w,
        height: h,
        quantity: qty,
      });
      const formwork = FormworkQuantityEngine.calculateBeam({
        length: l,
        width: w,
        height: h,
        quantity: qty,
        includeSoffit: false, // Sloof rests on ground/bedding
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.sloof',
        calculatorVersion: '1.0.0',
        formulaId: 'SLOOF',
        mathematicalExpression: 'b * h * P * n',
        sheet: 'Sloof',
        cell: 'I20',
      });
      return createResidentialOutput({
        calculatorId: 'residential.sloof',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Beton Sloof',
        breakdown: {
          volumePerUnitM3: res.volumePerUnit,
          volumeTotalM3: res.totalVolume,
          luasBekistingSampingM2: formwork.totalArea,
        },
        formulaSource,
      });
    },
  },

  // 26. KOLOM
  {
    id: 'residential.kolom',
    name: 'Kolom Struktur Beton Bertulang',
    shortName: 'Kolom Beton',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume cor beton kolom struktural / praktis.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Beton Kolom',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Penampang (P)', unit: 'm', defaultValue: 0.25, min: 0.05, required: true },
      { id: 'width', label: 'Lebar Penampang (L)', unit: 'm', defaultValue: 0.15, min: 0.05, required: true },
      { id: 'height', label: 'Tinggi Kolom (T)', unit: 'm', defaultValue: 3.00, min: 0.1, required: true },
      { id: 'quantity', label: 'Jumlah Kolom', unit: 'unit', defaultValue: 5, min: 1, required: true },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.kolom',
      calculatorVersion: '1.0.0',
      formulaId: 'KOLOM',
      mathematicalExpression: 'L * P * T * Jumlah',
      sheet: 'Kolom',
      cell: 'I20',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const l = toNum(inputs.length, 0.25);
      const w = toNum(inputs.width, 0.15);
      const h = toNum(inputs.height, 3.00);
      const qty = toNum(inputs.quantity, 5);
      const res = ConcreteQuantityEngine.calculatePrism({
        length: l,
        width: w,
        height: h,
        quantity: qty,
      });
      const formwork = FormworkQuantityEngine.calculateColumn({
        height: h,
        width: l,
        depth: w,
        quantity: qty,
        facesCount: 4,
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.kolom',
        calculatorVersion: '1.0.0',
        formulaId: 'KOLOM',
        mathematicalExpression: 'L * P * T * Jumlah',
        sheet: 'Kolom',
        cell: 'I20',
      });
      return createResidentialOutput({
        calculatorId: 'residential.kolom',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Beton Kolom',
        breakdown: {
          volumePerUnitM3: res.volumePerUnit,
          volumeTotalM3: res.totalVolume,
          luasBekistingM2: formwork.totalArea,
        },
        formulaSource,
      });
    },
  },

  // 27. BALOK
  {
    id: 'residential.balok',
    name: 'Balok Struktur Beton Bertulang',
    shortName: 'Balok Beton',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume cor beton balok lantai dan balok ring.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Beton Balok',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Balok (L)', unit: 'm', defaultValue: 36.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Balok (b)', unit: 'm', defaultValue: 0.20, min: 0.05, required: true },
      { id: 'height', label: 'Tinggi Balok (h)', unit: 'm', defaultValue: 0.35, min: 0.05, required: true },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.balok',
      calculatorVersion: '1.0.0',
      formulaId: 'BALOK',
      mathematicalExpression: 'b * h * L',
      sheet: 'Balok',
      cell: 'I20',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const l = toNum(inputs.length, 36.0);
      const w = toNum(inputs.width, 0.20);
      const h = toNum(inputs.height, 0.35);
      const res = ConcreteQuantityEngine.calculatePrism({
        length: l,
        width: w,
        height: h,
        quantity: 1,
      });
      const formwork = FormworkQuantityEngine.calculateBeam({
        length: l,
        width: w,
        height: h,
        quantity: 1,
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.balok',
        calculatorVersion: '1.0.0',
        formulaId: 'BALOK',
        mathematicalExpression: 'b * h * L',
        sheet: 'Balok',
        cell: 'I20',
      });
      return createResidentialOutput({
        calculatorId: 'residential.balok',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Beton Balok',
        breakdown: {
          volumeTotalM3: res.totalVolume,
          luasBekistingM2: formwork.totalArea,
        },
        formulaSource,
      });
    },
  },

  // 28. PLAT_LANTAI
  {
    id: 'residential.plat_lantai',
    name: 'Plat Lantai Beton Bertulang',
    shortName: 'Plat Lantai',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume cor beton plat lantai dengan deduksi void tangga.',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Plat Lantai',
    status: 'VERIFIED',
    parameters: [
      { id: 'length', label: 'Panjang Plat Lantai', unit: 'm', defaultValue: 10.0, min: 0.1, required: true },
      { id: 'width', label: 'Lebar Plat Lantai', unit: 'm', defaultValue: 8.0, min: 0.1, required: true },
      { id: 'thickness', label: 'Tebal Plat Lantai', unit: 'm', defaultValue: 0.12, min: 0.08, max: 0.50, required: true },
      { id: 'voidArea', label: 'Luas Void (Lubang Tangga)', unit: 'm²', defaultValue: 6.0, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.plat_lantai',
      calculatorVersion: '1.0.0',
      formulaId: 'SLAB_VOLUME',
      mathematicalExpression: '((Length * Width) - VoidArea) * Thickness',
      referenceName: 'Concrete Slab Geometry Standard',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const th = toNum(inputs.thickness, 0.12);
      const res = ConcreteQuantityEngine.calculateSlab({
        length: toNum(inputs.length, 10.0),
        width: toNum(inputs.width, 8.0),
        thickness: th,
        voidArea: toNum(inputs.voidArea, 6.0),
      });
      const formwork = FormworkQuantityEngine.calculateSlab({
        grossArea: (res.details?.netArea || 0),
        thickness: th,
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.plat_lantai',
        calculatorVersion: '1.0.0',
        formulaId: 'SLAB_VOLUME',
        mathematicalExpression: '((Length * Width) - VoidArea) * Thickness',
        referenceName: 'Concrete Slab Geometry Standard',
      });
      return createResidentialOutput({
        calculatorId: 'residential.plat_lantai',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Plat Lantai',
        breakdown: {
          luasKotorM2: res.details?.grossArea || 0,
          luasVoidM2: res.details?.voidArea || 0,
          luasNettoM2: res.details?.netArea || 0,
          volumeTotalM3: res.totalVolume,
          luasBekistingSoffitM2: formwork.totalArea,
        },
        formulaSource,
      });
    },
  },

  // 29. TANGGA_BETON
  {
    id: 'residential.tangga_beton',
    name: 'Tangga Beton Bertulang',
    shortName: 'Tangga Beton',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume cor beton tangga (waist slab, anak tangga, bordes).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Tangga Beton',
    status: 'VERIFIED',
    parameters: [
      { id: 'stairWidth', label: 'Lebar Tangga', unit: 'm', defaultValue: 1.0, min: 0.5, required: true },
      { id: 'waistThickness', label: 'Tebal Plat Tangga (Waist)', unit: 'm', defaultValue: 0.15, min: 0.1, required: true },
      { id: 'riserHeight', label: 'Tinggi Tanjakan (Optrade)', unit: 'm', defaultValue: 0.18, min: 0.1, max: 0.25, required: true },
      { id: 'treadDepth', label: 'Lebar Injakan (Antrade)', unit: 'm', defaultValue: 0.28, min: 0.2, max: 0.35, required: true },
      { id: 'stepCount', label: 'Jumlah Anak Tangga', unit: 'unit', defaultValue: 16, min: 1, required: true },
      { id: 'landingLength', label: 'Panjang Bordes', unit: 'm', defaultValue: 1.0, min: 0 },
      { id: 'landingWidth', label: 'Lebar Bordes', unit: 'm', defaultValue: 1.0, min: 0 },
      { id: 'landingThickness', label: 'Tebal Bordes', unit: 'm', defaultValue: 0.15, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'residential.tangga_beton',
      calculatorVersion: '1.0.0',
      formulaId: 'CONCRETE_STAIR_VOLUME',
      mathematicalExpression: 'VolWaist + VolSteps + VolLanding',
      referenceName: 'Concrete Stair Geometric Formulation',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = ConcreteQuantityEngine.calculateStair({
        stairWidth: toNum(inputs.stairWidth, 1.0),
        waistThickness: toNum(inputs.waistThickness, 0.15),
        riserHeight: toNum(inputs.riserHeight, 0.18),
        treadDepth: toNum(inputs.treadDepth, 0.28),
        stepCount: toNum(inputs.stepCount, 16),
        landingLength: inputs.landingLength !== undefined ? toNum(inputs.landingLength, 1.0) : undefined,
        landingWidth: inputs.landingWidth !== undefined ? toNum(inputs.landingWidth, 1.0) : undefined,
        landingThickness: inputs.landingThickness !== undefined ? toNum(inputs.landingThickness, 0.15) : undefined,
      });
      const formulaSource = ProvenanceEngine.createVerifiedReferenceProvenance({
        calculatorId: 'residential.tangga_beton',
        calculatorVersion: '1.0.0',
        formulaId: 'CONCRETE_STAIR_VOLUME',
        mathematicalExpression: 'VolWaist + VolSteps + VolLanding',
        referenceName: 'Concrete Stair Geometric Formulation',
      });
      return createResidentialOutput({
        calculatorId: 'residential.tangga_beton',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Tangga Beton',
        breakdown: {
          volumeAnakTanggaM3: res.details?.volSteps || 0,
          volumePlatTanggaM3: res.details?.volWaist || 0,
          volumeBordesM3: res.details?.volLanding || 0,
          panjangKemiringanM: res.details?.flightLength || 0,
          volumeTotalM3: res.totalVolume,
        },
        formulaSource,
      });
    },
  },

  // 30. PONDASI_BETON_FOOTING
  {
    id: 'residential.pondasi_beton_footing',
    name: 'Pondasi Telapak / Foot Plate',
    shortName: 'Foot Plate',
    category: 'structure',
    version: '1.0.0',
    pack: 'building',
    description: 'Menghitung volume cor beton pondasi telapak (pedestal kolom + plat tapak).',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Foot Plate',
    status: 'VERIFIED',
    parameters: [
      { id: 'pedestalWidth', label: 'Lebar Kolom Pedestal (a1)', unit: 'm', defaultValue: 0.25, min: 0.1, required: true },
      { id: 'pedestalLength', label: 'Panjang Kolom Pedestal (a2)', unit: 'm', defaultValue: 0.25, min: 0.1, required: true },
      { id: 'pedestalHeight', label: 'Tinggi Kolom Pedestal (h1)', unit: 'm', defaultValue: 1.50, min: 0.1, required: true },
      { id: 'padWidth', label: 'Lebar Tapak (b1)', unit: 'm', defaultValue: 0.70, min: 0.2, required: true },
      { id: 'padLength', label: 'Panjang Tapak (b2)', unit: 'm', defaultValue: 0.70, min: 0.2, required: true },
      { id: 'padThickness', label: 'Tebal Tapak Bawah (h3)', unit: 'm', defaultValue: 0.30, min: 0.1, required: true },
      { id: 'slopedHeight', label: 'Tinggi Kemiringan Tapak (h2)', unit: 'm', defaultValue: 0.10, min: 0 },
      { id: 'quantity', label: 'Jumlah Titik Pondasi (N)', unit: 'unit', defaultValue: 5, min: 1, required: true },
    ],
    formulaSource: ProvenanceEngine.createExcelProvenance({
      calculatorId: 'residential.pondasi_beton_footing',
      calculatorVersion: '1.0.0',
      formulaId: 'FOOT_PLATE',
      mathematicalExpression: '(a1*a2*h1 + b1*b2*h3 + b1*b2*h2*0.5)*N',
      sheet: 'Foot Plate',
      cell: 'I20',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const res = ConcreteQuantityEngine.calculateFooting({
        pedestalWidth: toNum(inputs.pedestalWidth, 0.25),
        pedestalLength: toNum(inputs.pedestalLength, 0.25),
        pedestalHeight: toNum(inputs.pedestalHeight, 1.50),
        padWidth: toNum(inputs.padWidth, 0.70),
        padLength: toNum(inputs.padLength, 0.70),
        padThickness: toNum(inputs.padThickness, 0.30),
        slopedHeight: toNum(inputs.slopedHeight, 0.10),
        quantity: toNum(inputs.quantity, 5),
      });
      const formulaSource = ProvenanceEngine.createExcelProvenance({
        calculatorId: 'residential.pondasi_beton_footing',
        calculatorVersion: '1.0.0',
        formulaId: 'FOOT_PLATE',
        mathematicalExpression: '(a1*a2*h1 + b1*b2*h3 + b1*b2*h2*0.5)*N',
        sheet: 'Foot Plate',
        cell: 'I20',
      });
      return createResidentialOutput({
        calculatorId: 'residential.pondasi_beton_footing',
        version: '1.0.0',
        primaryQuantity: res.totalVolume,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Foot Plate',
        breakdown: {
          volumePerTitikM3: res.volumePerUnit,
          volumeTotalM3: res.totalVolume,
          volPedestalM3: res.details?.volPedestal || 0,
          volPadM3: res.details?.volPad || 0,
        },
        formulaSource,
      });
    },
  },
];
