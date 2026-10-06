/**
 * EZRAB CALCULATOR PACK: PAVING & HARDSCAPE
 * Basic Paving Block Geometry & Bedding Calculator (paving.geometry)
 * 
 * Deterministic geometric calculation:
 * - Luas Paving (Area) = Panjang × Lebar
 * - Volume Pasir Alas / Bedding = Luas × Tebal Bedding
 * - Volume Subbase / Lapis Pondasi = Luas × Tebal Base
 * - Panjang Keliling Kanstin = 2 × (Panjang + Lebar)
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

export const PavingGeometryCalculator: CalculatorDefinition = {
  id: 'paving.geometry',
  name: 'Pemasangan Paving Block & Lapisan Alas',
  shortName: 'Paving Block',
  category: 'landscape',
  pack: 'paving',
  version: '1.0.0',
  description: 'Menghitung luas pasangan paving block, volume pasir alas (bedding), volume subbase, dan keliling pembatas kanstin.',
  primaryUnit: 'm2',
  primaryQuantityLabel: 'Luas Pasangan Paving Block',
  status: 'PARTIALLY_VERIFIED',
  parameters: [
    {
      id: 'panjang',
      label: 'Panjang Area (P)',
      description: 'Panjang bidang pemasangan paving',
      unit: 'm',
      required: true,
      defaultValue: 20,
      min: 0.5,
      max: 10000,
      step: 0.1,
      category: 'dimensi',
    },
    {
      id: 'lebar',
      label: 'Lebar Area (L)',
      description: 'Lebar bidang pemasangan paving',
      unit: 'm',
      required: true,
      defaultValue: 10,
      min: 0.5,
      max: 1000,
      step: 0.1,
      category: 'dimensi',
    },
    {
      id: 'tebalBedding',
      label: 'Tebal Pasir Alas / Bedding (Tb)',
      description: 'Tebal hamparan pasir alas bedding (standar 0.04 - 0.05 m)',
      unit: 'm',
      required: false,
      defaultValue: 0.05,
      min: 0.02,
      max: 0.15,
      step: 0.01,
      category: 'dimensi',
    },
    {
      id: 'tebalBase',
      label: 'Tebal Lapis Pondasi Base (Tp)',
      description: 'Tebal lapis pondasi agregat / sirtu bawah paving',
      unit: 'm',
      required: false,
      defaultValue: 0.15,
      min: 0,
      max: 0.5,
      step: 0.01,
      category: 'dimensi',
    },
  ],
  formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
    calculatorId: 'paving.geometry',
    calculatorVersion: '1.0.0',
    formulaId: 'paving.geom.area_bedding',
    mathematicalExpression: 'Luas = P × L; VolBedding = Luas × Tb; VolBase = Luas × Tp; Keliling = 2 × (P + L)',
    referenceName: 'SNI 03-0691-1996 Bata Beton untuk Lantai (Paving Block)',
    sectionOrClause: 'Standard Geometric Bedding & Area Requirements',
    status: 'PARTIALLY_VERIFIED',
    notes: 'Pure deterministic geometric equations. Specific block shape counts (e.g. bata 44 bh/m2, segi enam 28 bh/m2) and compaction loss factors are supplied via AHSP adapter.',
  }),
  dependencies: [],
  calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
    // 1. Validation
    const valSummary = ValidationEngine.validate(inputs, PavingGeometryCalculator.parameters);
    if (!valSummary.isValid) {
      const errMessages = valSummary.errors.map((e) => e.message).join('; ');
      throw new Error(`Validasi input gagal untuk "${PavingGeometryCalculator.name}": ${errMessages}`);
    }

    const P = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.panjang, { fieldName: 'panjang', min: 0.5 });
    const L = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.lebar, { fieldName: 'lebar', min: 0.5 });
    const Tb = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.tebalBedding ?? 0.05, { fieldName: 'tebalBedding', min: 0.02 });
    const Tp = PrecisionEngine.validateNumber(valSummary.sanitizedInputs.tebalBase ?? 0.15, { fieldName: 'tebalBase', allowZero: true });

    // 2. Deterministic Formulas
    const luasPaving = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(P, L), 'DECIMAL_2');
    const volumeBedding = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(luasPaving, Tb), 'DECIMAL_4');
    const volumeBase = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(luasPaving, Tp), 'DECIMAL_4');
    const kelilingKanstin = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(2, PrecisionEngine.add(P, L)), 'DECIMAL_2');

    // 3. Trace
    const trace = new ExecutionTraceBuilder('paving.geometry', '1.0.0')
      .setInputs({ panjang: P, lebar: L, tebalBedding: Tb, tebalBase: Tp })
      .addStep({
        code: 'LUAS_PAVING',
        description: 'Luas Bidang Pasangan Paving Block',
        formulaText: `${P} m × ${L} m`,
        evaluatedExpression: `${P} * ${L}`,
        calculatedValue: luasPaving,
        unit: 'm²',
      })
      .addStep({
        code: 'VOL_BEDDING',
        description: 'Volume Pasir Alas (Bedding Sand)',
        formulaText: `${luasPaving} m² × ${Tb} m`,
        evaluatedExpression: `${luasPaving} * ${Tb}`,
        calculatedValue: volumeBedding,
        unit: 'm³',
      })
      .addStep({
        code: 'VOL_BASE',
        description: 'Volume Lapis Pondasi Bawah (Subbase)',
        formulaText: `${luasPaving} m² × ${Tp} m`,
        evaluatedExpression: `${luasPaving} * ${Tp}`,
        calculatedValue: volumeBase,
        unit: 'm³',
      })
      .addStep({
        code: 'KELILING_KANSTIN',
        description: 'Panjang Keliling Pembatas Sisi / Kanstin',
        formulaText: `2 × (${P} + ${L})`,
        evaluatedExpression: `2 * (${P} + ${L})`,
        calculatedValue: kelilingKanstin,
        unit: 'm',
      })
      .setPrimaryResult(luasPaving, 'm2', 'Luas Pasangan Paving Block')
      .build();

    return {
      calculatorId: 'paving.geometry',
      version: '1.0.0',
      primaryQuantity: luasPaving,
      primaryUnit: 'm2',
      primaryLabel: 'Luas Pasangan Paving Block',
      breakdown: {
        panjangArea: P,
        lebarArea: L,
        luasPasanganPaving: luasPaving,
        volumePasirBedding: volumeBedding,
        volumeLapisPondasiBase: volumeBase,
        kelilingKanstin: kelilingKanstin,
      },
      detailedBreakdown: [
        {
          code: 'LUAS_PAVING',
          label: 'Luas Bidang Pasangan Paving Block',
          formulaText: 'P × L',
          value: luasPaving,
          unit: 'm²',
          ownership: 'produced',
        },
        {
          code: 'VOL_BEDDING',
          label: 'Volume Pasir Alas Bedding',
          formulaText: 'Luas × Tb',
          value: volumeBedding,
          unit: 'm³',
          ownership: 'produced',
        },
        {
          code: 'VOL_BASE',
          label: 'Volume Lapis Pondasi Bawah',
          formulaText: 'Luas × Tp',
          value: volumeBase,
          unit: 'm³',
          ownership: 'produced',
        },
        {
          code: 'KELILING_KANSTIN',
          label: 'Panjang Keliling Kanstin',
          formulaText: '2 × (P + L)',
          value: kelilingKanstin,
          unit: 'm',
          ownership: 'produced',
        },
      ],
      materials: [
        {
          name: 'Pasir Pasang Alas Bedding Paving (Tebal Rencana)',
          quantity: volumeBedding,
          unit: 'm³',
        },
        ...(volumeBase > 0
          ? [
              {
                name: 'Material Lapis Pondasi Bawah Agregat / Sirtu',
                quantity: volumeBase,
                unit: 'm³',
              },
            ]
          : []),
      ],
      labor: [],
      equipment: [],
      warnings: valSummary.warnings,
      provenance: [PavingGeometryCalculator.formulaSource],
      trace,
      status: 'PARTIALLY_VERIFIED',
      validation: valSummary,
      timestamp: new Date().toISOString(),
    };
  },
};
