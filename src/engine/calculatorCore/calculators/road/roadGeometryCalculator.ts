/**
 * EZRAB CALCULATOR PACK: ROAD INFRASTRUCTURE
 * Basic Road Geometry & Pavement Volume Calculator (road.geometry)
 * 
 * Deterministic geometric calculation:
 * - Luas Perkerasan (Area) = Panjang × Lebar
 * - Volume Lapisan (Volume) = Luas × Tebal
 * - Panjang Bahu Jalan (Perimeter) = 2 × Panjang
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

export const RoadGeometryCalculator: CalculatorDefinition = {
  id: 'road.geometry',
  name: 'Geometri & Volume Perkerasan Jalan',
  shortName: 'Perkerasan Jalan',
  category: 'infrastruktur',
  pack: 'road',
  version: '1.0.0',
  description: 'Menghitung luas permukaan perkerasan jalan, volume material perkerasan (aspal/beton/agregat), dan panjang bahu jalan.',
  primaryUnit: 'm2',
  primaryQuantityLabel: 'Luas Permukaan Jalan',
  status: 'PARTIALLY_VERIFIED',
  parameters: [
    {
      id: 'panjang',
      label: 'Panjang Ruas Jalan (P)',
      description: 'Panjang segmen ruas jalan yang akan dikerjakan',
      unit: 'm',
      required: true,
      defaultValue: 100,
      min: 1,
      max: 100000,
      step: 1,
      category: 'dimensi',
    },
    {
      id: 'lebar',
      label: 'Lebar Badan Jalan (L)',
      description: 'Lebar bersih badan jalan (perkerasan)',
      unit: 'm',
      required: true,
      defaultValue: 6.0,
      min: 1.0,
      max: 50.0,
      step: 0.25,
      category: 'dimensi',
    },
    {
      id: 'tebalPerkerasan',
      label: 'Tebal Lapisan Perkerasan (T)',
      description: 'Tebal rencana lapisan perkerasan (misal AC-WC atau Rigid Pavement)',
      unit: 'm',
      required: true,
      defaultValue: 0.05,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      category: 'dimensi',
    },
    {
      id: 'lebarBahu',
      label: 'Lebar Bahu Jalan Kiri & Kanan (Lb)',
      description: 'Lebar bahu jalan per sisi',
      unit: 'm',
      required: false,
      defaultValue: 1.0,
      min: 0,
      max: 10.0,
      step: 0.25,
      category: 'dimensi',
    },
  ],
  formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
    calculatorId: 'road.geometry',
    calculatorVersion: '1.0.0',
    formulaId: 'road.geom.area_volume',
    mathematicalExpression: 'Luas = P × L; Volume = P × L × T; LuasBahu = 2 × P × Lb',
    referenceName: 'Pedoman Perancangan Geometri Jalan (Bina Marga)',
    sectionOrClause: 'Standard Pavement Surface Geometry',
    status: 'PARTIALLY_VERIFIED',
    notes: 'Pure deterministic geometric equations. Asphalt mix specific density & compaction coefficients remain decoupled until authoritative AHSP mapping is applied.',
  }),
  dependencies: [],
  calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
    // 1. Validation
    const valSummary = ValidationEngine.validate(inputs, RoadGeometryCalculator.parameters);
    if (!valSummary.isValid) {
      const errMessages = valSummary.errors.map((e) => e.message).join('; ');
      throw new Error(`Validasi input gagal untuk "${RoadGeometryCalculator.name}": ${errMessages}`);
    }

    const P = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.panjang, { fieldName: 'panjang', min: 1 });
    const L = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.lebar, { fieldName: 'lebar', min: 1 });
    const T = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.tebalPerkerasan, { fieldName: 'tebalPerkerasan', min: 0.01 });
    const Lb = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.lebarBahu ?? 1.0, { fieldName: 'lebarBahu', allowZero: true });

    // 2. Exact Deterministic Formulas
    // Luas Jalan = P * L
    const luasJalan = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(P, L), 'DECIMAL_2');
    // Volume Lapisan = Luas Jalan * T
    const volumeLapisan = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(luasJalan, T), 'DECIMAL_4');
    // Luas Bahu Jalan (2 Sisi) = 2 * P * Lb
    const luasBahu = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(2, P, Lb), 'DECIMAL_2');
    // Keliling / Panjang Total Sisi Jalan = 2 * P
    const panjangSisi = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(2, P), 'DECIMAL_2');

    // 3. Trace Builder
    const trace = new ExecutionTraceBuilder('road.geometry', '1.0.0')
      .setInputs({ panjang: P, lebar: L, tebalPerkerasan: T, lebarBahu: Lb })
      .addStep({
        code: 'LUAS_JALAN',
        description: 'Luas Permukaan Badan Jalan',
        formulaText: `${P} m × ${L} m`,
        evaluatedExpression: `${P} * ${L}`,
        calculatedValue: luasJalan,
        unit: 'm²',
      })
      .addStep({
        code: 'VOL_PERKERASAN',
        description: 'Volume Kubikasi Lapisan Perkerasan',
        formulaText: `${luasJalan} m² × ${T} m`,
        evaluatedExpression: `${luasJalan} * ${T}`,
        calculatedValue: volumeLapisan,
        unit: 'm³',
      })
      .addStep({
        code: 'LUAS_BAHU',
        description: 'Luas Permukaan Bahu Jalan (Kiri & Kanan)',
        formulaText: `2 × ${P} m × ${Lb} m`,
        evaluatedExpression: `2 * ${P} * ${Lb}`,
        calculatedValue: luasBahu,
        unit: 'm²',
      })
      .setPrimaryResult(luasJalan, 'm2', 'Luas Permukaan Jalan')
      .build();

    return {
      calculatorId: 'road.geometry',
      version: '1.0.0',
      primaryQuantity: luasJalan,
      primaryUnit: 'm2',
      primaryLabel: 'Luas Permukaan Jalan',
      breakdown: {
        panjangRuas: P,
        lebarBadanJalan: L,
        luasPermukaanJalan: luasJalan,
        volumePerkerasan: volumeLapisan,
        luasBahuJalan: luasBahu,
        panjangTotalSisi: panjangSisi,
      },
      detailedBreakdown: [
        {
          code: 'LUAS_JALAN',
          label: 'Luas Permukaan Badan Jalan',
          formulaText: 'P × L',
          value: luasJalan,
          unit: 'm²',
          ownership: 'produced',
        },
        {
          code: 'VOL_PERKERASAN',
          label: 'Volume Lapisan Perkerasan',
          formulaText: 'Luas × T',
          value: volumeLapisan,
          unit: 'm³',
          ownership: 'produced',
        },
        {
          code: 'LUAS_BAHU',
          label: 'Luas Bahu Jalan (2 Sisi)',
          formulaText: '2 × P × Lb',
          value: luasBahu,
          unit: 'm²',
          ownership: 'produced',
        },
      ],
      materials: [
        {
          name: 'Material Perkerasan (Aspal / Beton)',
          quantity: volumeLapisan,
          unit: 'm³',
          notes: 'Volume padat sebelum faktor loose/padat.',
        },
      ],
      labor: [],
      equipment: [],
      warnings: valSummary.warnings,
      provenance: [RoadGeometryCalculator.formulaSource],
      trace,
      status: 'PARTIALLY_VERIFIED',
      validation: valSummary,
      timestamp: new Date().toISOString(),
    };
  },
};
