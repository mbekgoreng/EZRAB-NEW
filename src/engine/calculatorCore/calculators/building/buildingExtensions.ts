/**
 * EZRAB CALCULATOR PACK: BUILDING EXTENSIONS
 * Deterministic geometric calculators for excavation & perimeter fencing.
 */

import {
  CalculatorDefinition,
  CalculationContext,
  CalculationInput,
  CalculationOutput,
} from '../../contracts/types';
import { PrecisionEngine } from '../../precision/precisionEngine';
import { ValidationEngine } from '../../validation/validationEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { ExecutionTraceBuilder } from '../../trace/executionTrace';

export const EarthworkGalianCalculator: CalculatorDefinition = {
  id: 'building.earthwork.galian',
  name: 'Galian Tanah Saluran & Pondasi',
  shortName: 'Galian Tanah',
  category: 'persiapan',
  pack: 'building',
  version: '1.0.0',
  description: 'Menghitung volume kubikasi galian tanah trapesium / persegi dan perkiraan volume buangan sisa tanah.',
  primaryUnit: 'm3',
  primaryQuantityLabel: 'Volume Galian Tanah',
  status: 'PARTIALLY_VERIFIED',
  parameters: [
    {
      id: 'panjang',
      label: 'Panjang Galian (P)',
      description: 'Panjang total galian tanah',
      unit: 'm',
      required: true,
      defaultValue: 25,
      min: 0.5,
      max: 5000,
      step: 0.5,
      category: 'dimensi',
    },
    {
      id: 'lebarAtas',
      label: 'Lebar Atas Galian (La)',
      description: 'Lebar galian di permukaan tanah (dengan kemiringan lereng)',
      unit: 'm',
      required: true,
      defaultValue: 0.90,
      min: 0.2,
      max: 20.0,
      step: 0.05,
      category: 'dimensi',
    },
    {
      id: 'lebarBawah',
      label: 'Lebar Bawah Galian (Lb)',
      description: 'Lebar dasar galian tanah',
      unit: 'm',
      required: true,
      defaultValue: 0.70,
      min: 0.2,
      max: 20.0,
      step: 0.05,
      category: 'dimensi',
    },
    {
      id: 'kedalaman',
      label: 'Kedalaman Galian (H)',
      description: 'Kedalaman galian rata-rata dari permukaan tanah',
      unit: 'm',
      required: true,
      defaultValue: 0.80,
      min: 0.1,
      max: 15.0,
      step: 0.05,
      category: 'dimensi',
    },
  ],
  formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
    calculatorId: 'building.earthwork.galian',
    calculatorVersion: '1.0.0',
    formulaId: 'earthwork.trench.volume',
    mathematicalExpression: 'LuasPenampang = ((La + Lb) / 2) × H; VolumeGalian = LuasPenampang × P',
    referenceName: 'Pedoman Estimasi Pekerjaan Tanah SNI 2835:2008',
    sectionOrClause: 'Perhitungan Volume Galian Tanah',
    status: 'PARTIALLY_VERIFIED',
    notes: 'Volume dihitung murni kubikasi geometris padat (bank volume).',
  }),
  dependencies: [],
  calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
    const valSummary = ValidationEngine.validate(inputs, EarthworkGalianCalculator.parameters);
    if (!valSummary.isValid) {
      throw new Error(`Validasi gagal untuk "${EarthworkGalianCalculator.name}": ${valSummary.errors.map((e) => e.message).join('; ')}`);
    }

    const P = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.panjang, { fieldName: 'panjang', min: 0.5 });
    const La = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.lebarAtas, { fieldName: 'lebarAtas', min: 0.2 });
    const Lb = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.lebarBawah, { fieldName: 'lebarBawah', min: 0.2 });
    const H = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.kedalaman, { fieldName: 'kedalaman', min: 0.1 });

    const luasPenampang = PrecisionEngine.applyPolicy(
      PrecisionEngine.multiply(PrecisionEngine.divide(PrecisionEngine.add(La, Lb), 2), H),
      'DECIMAL_4'
    );
    const volumeGalian = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(luasPenampang, P), 'DECIMAL_4');

    const trace = new ExecutionTraceBuilder('building.earthwork.galian', '1.0.0')
      .setInputs({ panjang: P, lebarAtas: La, lebarBawah: Lb, kedalaman: H })
      .addStep({
        code: 'LUAS_PENAMPANG',
        description: 'Luas Penampang Trapesium Galian',
        formulaText: `((${La} + ${Lb}) / 2) × ${H}`,
        evaluatedExpression: `((${La} + ${Lb}) / 2) * ${H}`,
        calculatedValue: luasPenampang,
        unit: 'm²',
      })
      .addStep({
        code: 'VOL_GALIAN',
        description: 'Volume Total Kubikasi Galian Tanah',
        formulaText: `${luasPenampang} m² × ${P} m`,
        evaluatedExpression: `${luasPenampang} * ${P}`,
        calculatedValue: volumeGalian,
        unit: 'm³',
      })
      .setPrimaryResult(volumeGalian, 'm3', 'Volume Galian Tanah')
      .build();

    return {
      calculatorId: 'building.earthwork.galian',
      version: '1.0.0',
      primaryQuantity: volumeGalian,
      primaryUnit: 'm3',
      primaryLabel: 'Volume Galian Tanah',
      breakdown: {
        panjangGalian: P,
        lebarRataRata: PrecisionEngine.applyPolicy(PrecisionEngine.divide(PrecisionEngine.add(La, Lb), 2), 'DECIMAL_2'),
        luasPenampang,
        volumeGalian,
      },
      detailedBreakdown: [
        {
          code: 'VOL_GALIAN',
          label: 'Volume Galian Tanah',
          formulaText: 'Luas Penampang × P',
          value: volumeGalian,
          unit: 'm³',
          ownership: 'produced',
        },
      ],
      materials: [],
      labor: [],
      equipment: [],
      warnings: valSummary.warnings,
      provenance: [EarthworkGalianCalculator.formulaSource],
      trace,
      status: 'PARTIALLY_VERIFIED',
      validation: valSummary,
      timestamp: new Date().toISOString(),
    };
  },
};

export const FenceCalculator: CalculatorDefinition = {
  id: 'building.fence',
  name: 'Pagar Keliling & Dinding Pembatas',
  shortName: 'Pagar Keliling',
  category: 'arsitektur',
  pack: 'building',
  version: '1.0.0',
  description: 'Menghitung luas bidang pagar keliling, panjang sloof/ringbalk pagar, dan jumlah kolom praktis.',
  primaryUnit: 'm2',
  primaryQuantityLabel: 'Luas Dinding Pagar',
  status: 'PARTIALLY_VERIFIED',
  parameters: [
    {
      id: 'panjang',
      label: 'Panjang Total Pagar (P)',
      description: 'Panjang bentang keliling pagar',
      unit: 'm',
      required: true,
      defaultValue: 40,
      min: 1,
      max: 5000,
      step: 1,
      category: 'dimensi',
    },
    {
      id: 'tinggi',
      label: 'Tinggi Dinding Pagar (H)',
      description: 'Tinggi bidang dinding pagar dari atas sloof',
      unit: 'm',
      required: true,
      defaultValue: 2.0,
      min: 0.5,
      max: 6.0,
      step: 0.1,
      category: 'dimensi',
    },
    {
      id: 'jarakKolom',
      label: 'Jarak Spasi Antar Kolom (S)',
      description: 'Spasi pemasangan kolom praktis pengaku pagar (standar 2.5 - 3.0 m)',
      unit: 'm',
      required: false,
      defaultValue: 2.5,
      min: 1.0,
      max: 5.0,
      step: 0.25,
      category: 'dimensi',
    },
  ],
  formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
    calculatorId: 'building.fence',
    calculatorVersion: '1.0.0',
    formulaId: 'fence.geometry',
    mathematicalExpression: 'LuasDinding = P × H; JmlKolom = Ceil(P / S) + 1; PanjangStrukturBalok = 2 × P',
    referenceName: 'Pedoman SNI Konstruksi Dinding Pagar',
    sectionOrClause: 'Geometri Dinding Pembatas',
    status: 'PARTIALLY_VERIFIED',
  }),
  dependencies: [],
  calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
    const valSummary = ValidationEngine.validate(inputs, FenceCalculator.parameters);
    if (!valSummary.isValid) {
      throw new Error(`Validasi gagal untuk "${FenceCalculator.name}": ${valSummary.errors.map((e) => e.message).join('; ')}`);
    }

    const P = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.panjang, { fieldName: 'panjang', min: 1 });
    const H = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.tinggi, { fieldName: 'tinggi', min: 0.5 });
    const S = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.jarakKolom ?? 2.5, { fieldName: 'jarakKolom', min: 1.0 });

    const luasDinding = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(P, H), 'DECIMAL_2');
    const jmlKolom = Math.ceil(P / S) + 1;
    const totalTinggiKolom = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(jmlKolom, H), 'DECIMAL_2');

    const trace = new ExecutionTraceBuilder('building.fence', '1.0.0')
      .setInputs({ panjang: P, tinggi: H, jarakKolom: S })
      .addStep({
        code: 'LUAS_DINDING',
        description: 'Luas Permukaan Bidang Dinding Pagar',
        formulaText: `${P} m × ${H} m`,
        evaluatedExpression: `${P} * ${H}`,
        calculatedValue: luasDinding,
        unit: 'm²',
      })
      .addStep({
        code: 'JML_KOLOM',
        description: 'Jumlah Titik Kolom Praktis Pengaku Pagar',
        formulaText: `Ceil(${P} / ${S}) + 1`,
        evaluatedExpression: `Math.ceil(${P} / ${S}) + 1`,
        calculatedValue: jmlKolom,
        unit: 'titik',
      })
      .setPrimaryResult(luasDinding, 'm2', 'Luas Dinding Pagar')
      .build();

    return {
      calculatorId: 'building.fence',
      version: '1.0.0',
      primaryQuantity: luasDinding,
      primaryUnit: 'm2',
      primaryLabel: 'Luas Dinding Pagar',
      breakdown: {
        panjangPagar: P,
        tinggiPagar: H,
        luasDindingPagar: luasDinding,
        jumlahKolomPraktis: jmlKolom,
        totalPanjangKolom: totalTinggiKolom,
      },
      detailedBreakdown: [
        {
          code: 'LUAS_DINDING',
          label: 'Luas Bidang Dinding Pagar',
          formulaText: 'P × H',
          value: luasDinding,
          unit: 'm²',
          ownership: 'produced',
        },
        {
          code: 'JML_KOLOM',
          label: 'Jumlah Kolom Praktis Pengaku',
          formulaText: 'Ceil(P / S) + 1',
          value: jmlKolom,
          unit: 'titik',
          ownership: 'produced',
        },
      ],
      materials: [],
      labor: [],
      equipment: [],
      warnings: valSummary.warnings,
      provenance: [FenceCalculator.formulaSource],
      trace,
      status: 'PARTIALLY_VERIFIED',
      validation: valSummary,
      timestamp: new Date().toISOString(),
    };
  },
};
