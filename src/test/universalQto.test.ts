/**
 * EZRAB Universal Construction Intelligence — W7 (§7): QTO deterministik generik.
 *
 * Suite tsx polos (tanpa vitest, tanpa AI/network):
 *   npx --yes tsx src/test/universalQto.test.ts
 *
 * Cakupan (PLAN.md §7, celah S3):
 *  A. Trace QTO terstruktur per item chat + sourceComponentId (S3-6 + G7).
 *  B. Bentuk WEIGHT di QTO DED — kg/ton (S3-3).
 *  C. Heuristik cm v2 di DED QTO v2 — satuan eksplisit / tolak ambigu (S3-4).
 *  D. Cek generik qtoBridge — panjang/berat/count (S3-5).
 *
 * TIDAK dicakup di sini (keputusan tercatat di laporan W7):
 *  - Volume 1.0 diam-diam (S3-2): DITUNDA, butuh keputusan owner. Perilaku
 *    saat ini (rule kosong → volume 1.0) di-pin di Bagian A sebagai
 *    dokumentasi perilaku, BUKAN sebagai perilaku yang diinginkan.
 *  - Registry rumus generik (S3-1): DITUNDA — hook fallback tanpa-template
 *    hidup di universalRab.ts (wilayah W2/W10 + W3/W9) dan butuh taksonomi
 *    W2; implementasi setengah di sini akan menjadi kode mati.
 */

import { strict as assert } from 'assert';
import { RabTemplateService } from '../services/rabTemplateService';
import type { RabTemplate } from '../types/rabTemplate';
import {
  computeQuantity,
  shapeForUnit,
  attemptQuantityFromDimensionString,
} from '../ai-tools/ded-ai-estimate/quantity';
import { dedQtoCalculationEngine } from '../services/dedQtoCalculationEngine';
import type { DEDWorkItem, DimensionExtraction } from '../domain/ded/dedPipelineTypes';
import {
  checkQtoAgainstUserDimensions,
  expectedQuantityFromDimensions,
  resolveQtoCheckFamily,
  type QtoItemLike,
  type QtoUserDimensions,
} from '../ai-tools/ezrab-ai/qtoBridge';

// Mock localStorage untuk RabTemplateService (pola templateCatalog180).
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};
(global as any).localStorage = (global as any).window.localStorage;

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

/* ================================================================== */
/* A. Trace QTO terstruktur + sourceComponentId (S3-6 + G7)            */
/* ================================================================== */

function makeTraceTemplate(): RabTemplate {
  return {
    id: 'W7-TRACE',
    name: 'Template Uji Trace W7',
    category: 'INFRASTRUKTUR' as RabTemplate['category'],
    description: 'Template sintetis untuk pin trace QTO W7.',
    parameters: [
      { id: 'p1', key: 'road_length', label: 'Panjang jalan', type: 'NUMBER', required: false, defaultValue: 100 },
      { id: 'p2', key: 'road_width', label: 'Lebar jalan', type: 'NUMBER', required: false, defaultValue: 6 },
      { id: 'p3', key: 'building_area', label: 'Luas bangunan', type: 'NUMBER', required: false, defaultValue: 45 },
      { id: 'p4', key: 'unused_param', label: 'Param tak terpakai', type: 'NUMBER', required: false, defaultValue: 999 },
    ],
    components: [
      {
        id: 'comp-asphalt',
        name: 'Aspal AC-WC',
        category: 'Perkerasan',
        unit: 'm3',
        calculationRule: 'road_length * road_width * 0.06',
        variables: ['road_length', 'road_width'],
        detailLevel: 'PROFESSIONAL',
      },
      {
        id: 'comp-ceil',
        name: 'Pekerjaan Ceil',
        category: 'Lainnya',
        unit: 'unit',
        calculationRule: 'Math.ceil(building_area / 10)',
        variables: ['building_area'],
        detailLevel: 'PROFESSIONAL',
      },
      {
        id: 'comp-norule',
        name: 'Pekerjaan Tanpa Rumus',
        category: 'Lainnya',
        unit: 'ls',
        calculationRule: '',
        variables: [],
        detailLevel: 'PROFESSIONAL',
      },
    ],
    metadata: {
      source: 'EZRAB_OFFICIAL',
      version: '1.0.0',
      createdAt: '2026-11-22',
      updatedAt: '2026-11-22',
    },
  };
}

console.log('Bagian A — trace terstruktur + sourceComponentId');
{
  const svc = RabTemplateService.getInstance();
  const res = svc.generateRabFromTemplate(
    makeTraceTemplate(),
    { road_length: 100, road_width: 6, building_area: 45 },
    undefined,
    'PROFESSIONAL',
    [],
  );
  const byId = new Map(res.items.map((it) => [it.sourceComponentId, it]));

  check('A1 — tiga item tergenerate', () => {
    assert.equal(res.items.length, 3);
  });
  check('A2 — sourceComponentId = ID komponen (bukan nama)', () => {
    assert.equal(byId.get('comp-asphalt')?.description, 'Aspal AC-WC');
    assert.equal(byId.get('comp-ceil')?.description, 'Pekerjaan Ceil');
    assert.equal(byId.get('comp-norule')?.description, 'Pekerjaan Tanpa Rumus');
  });
  check('A3 — aritmetika TIDAK berubah (100×6×0,06 = 36)', () => {
    assert.equal(byId.get('comp-asphalt')?.volume, 36);
    assert.equal(byId.get('comp-ceil')?.volume, 5); // ceil(45/10)
  });
  check('A4 — qtoTrace.formula = calculationRule komponen', () => {
    assert.equal(byId.get('comp-asphalt')?.qtoTrace?.formula, 'road_length * road_width * 0.06');
    assert.equal(byId.get('comp-ceil')?.qtoTrace?.formula, 'Math.ceil(building_area / 10)');
  });
  check('A5 — qtoTrace.formulaInputs hanya variabel yang dirujuk rule', () => {
    assert.deepEqual(byId.get('comp-asphalt')?.qtoTrace?.formulaInputs, { road_length: 100, road_width: 6 });
    assert.deepEqual(byId.get('comp-ceil')?.qtoTrace?.formulaInputs, { building_area: 45 });
  });
  check('A6 — formulaInputs tidak memuat param tak terpakai / identifier Math', () => {
    const inputs = byId.get('comp-ceil')?.qtoTrace?.formulaInputs ?? {};
    assert.equal('unused_param' in inputs, false);
    assert.equal('Math' in inputs, false);
    assert.equal('ceil' in inputs, false);
  });
  check('A7 — volumeSource CALCULATOR (deterministik) di item + trace', () => {
    const item = byId.get('comp-asphalt');
    assert.equal(item?.volumeSource, 'CALCULATOR');
    assert.equal(item?.qtoTrace?.volumeSource, 'CALCULATOR');
    assert.equal(item?.qtoTrace?.sourceComponentId, 'comp-asphalt');
  });
  check('A8 — calculationFormula top-level = rule (untuk Sheet 4 / audit)', () => {
    assert.equal(byId.get('comp-asphalt')?.calculationFormula, 'road_length * road_width * 0.06');
  });
  check('A9 — komponen tanpa rule: formula null, inputs kosong, id tetap ada', () => {
    const item = byId.get('comp-norule');
    assert.equal(item?.qtoTrace?.formula, null);
    assert.deepEqual(item?.qtoTrace?.formulaInputs, {});
    assert.equal(item?.qtoTrace?.sourceComponentId, 'comp-norule');
    assert.equal(item?.calculationFormula, undefined);
  });
  check('A10 — PIN perilaku S3-2 (DITUNDA): rule kosong masih volume 1.0', () => {
    // Dokumentasi perilaku saat ini — BUKAN persetujuan. Bila owner
    // memutuskan null, pin ini yang diubah (beserta tipe hilir).
    assert.equal(byId.get('comp-norule')?.volume, 1.0);
  });
}

/* ================================================================== */
/* B. Bentuk WEIGHT di QTO DED (S3-3)                                  */
/* ================================================================== */

console.log('Bagian B — bentuk WEIGHT (kg/ton)');
{
  check('B1 — shapeForUnit kg/ton = WEIGHT (sebelumnya COUNT)', () => {
    assert.equal(shapeForUnit('kg'), 'WEIGHT');
    assert.equal(shapeForUnit('ton'), 'WEIGHT');
    assert.equal(shapeForUnit('KG'), 'WEIGHT');
  });
  check('B2 — bentuk lama tidak berubah', () => {
    assert.equal(shapeForUnit('m3'), 'VOLUME');
    assert.equal(shapeForUnit('m2'), 'AREA');
    assert.equal(shapeForUnit('m'), 'LENGTH');
    assert.equal(shapeForUnit('unit'), 'COUNT');
    assert.equal(shapeForUnit('titik'), 'COUNT');
  });
  check('B3 — pembesian kg = volume beton × rasio (10 m³ × 120 = 1200 kg)', () => {
    const r = computeQuantity('WEIGHT', { volume: 10, ratioKgPerM3: 120 }, 'Pembesian kolom');
    assert.equal(r.quantity, 1200);
    assert.ok(r.formula.includes('1200 kg'), r.formula);
    assert.ok(r.formula.includes('rasio'), r.formula);
  });
  check('B4 — volume eksplisit TIDAK lagi short-circuit menjadi kuantitas WEIGHT', () => {
    // Tanpa pengecualian, beton 10 m³ akan "menghasilkan" besi 10 kg.
    const r = computeQuantity('WEIGHT', { volume: 10, ratioKgPerM3: 120 }, 'Pembesian');
    assert.notEqual(r.quantity, 10);
    assert.equal(r.quantity, 1200);
  });
  check('B5 — aspal ton = volume × densitas / 1000 (10 m³ × 2400 = 24 ton)', () => {
    const r = computeQuantity('WEIGHT', { volume: 10, densityKgPerM3: 2400, weightUnit: 'ton' }, 'Aspal AC-WC');
    assert.equal(r.quantity, 24);
    assert.ok(r.formula.includes('24 ton'), r.formula);
    assert.ok(r.formula.includes('densitas'), r.formula);
  });
  check('B6 — WEIGHT dari dimensi L×W×H (10×2×0,5 m³ × 100 = 1000 kg)', () => {
    const r = computeQuantity('WEIGHT', { length: 10, width: 2, height: 0.5, ratioKgPerM3: 100 }, 'Pembesian sloof');
    assert.equal(r.quantity, 1000);
  });
  check('B7 — WEIGHT dari dimensi L×W×D', () => {
    const r = computeQuantity('WEIGHT', { length: 10, width: 2, depth: 0.5, ratioKgPerM3: 100 }, 'Pembesian');
    assert.equal(r.quantity, 1000);
  });
  check('B8 — tanpa faktor kg/m³ → null (tidak ditebak, tidak 0)', () => {
    assert.equal(computeQuantity('WEIGHT', { volume: 10 }, 'Pembesian').quantity, null);
    assert.equal(computeQuantity('WEIGHT', { volume: 10, ratioKgPerM3: 0 }, 'Pembesian').quantity, null);
    assert.equal(computeQuantity('WEIGHT', { volume: 10, ratioKgPerM3: -5 }, 'Pembesian').quantity, null);
  });
  check('B9 — tanpa volume → null', () => {
    assert.equal(computeQuantity('WEIGHT', { ratioKgPerM3: 120 }, 'Pembesian').quantity, null);
  });
  check('B10 — densitas menang bila keduanya diisi', () => {
    const r = computeQuantity('WEIGHT', { volume: 10, densityKgPerM3: 100, ratioKgPerM3: 200 }, 'X');
    assert.equal(r.quantity, 1000);
  });
  check('B11 — volume eksplisit tetap short-circuit untuk VOLUME (non-WEIGHT)', () => {
    assert.equal(computeQuantity('VOLUME', { volume: 5 }, 'Beton').quantity, 5);
    assert.equal(computeQuantity('AREA', { area: 7 }, 'Lantai').quantity, 7);
    assert.equal(computeQuantity('COUNT', { count: 3 }, 'Pintu').quantity, 3);
  });
  check('B12 — string dimensi kg tanpa densitas → null (jujur, bukan COUNT)', () => {
    const r = attemptQuantityFromDimensionString('kg', '10 x 2 x 0.5 m');
    assert.equal(r.quantity, null);
    assert.equal(r.ambiguousUnit, false);
  });
}

/* ================================================================== */
/* C. Heuristik cm v2 di DED QTO v2 (S3-4)                             */
/* ================================================================== */

console.log('Bagian C — heuristik cm v2');
{
  function makeItem(dims: DimensionExtraction, category = 'CONCRETE'): DEDWorkItem {
    return {
      id: 'w7-item',
      projectId: 'w7-proj',
      name: 'Item uji W7',
      category,
      sourceIds: ['src1'],
      evidence: [{
        sourceType: 'pdf',
        sourceId: 'src1',
        sourceName: 'DED.pdf',
        confidence: 'HIGH',
        status: 'VERIFIED',
      }],
      confidence: 'HIGH',
      status: 'CONFIRMED',
      dimensions: dims,
    };
  }
  const baseDims = (over: Partial<DimensionExtraction>): DimensionExtraction => ({
    unit: 'm³',
    rawSnippets: [],
    scaleVerified: true,
    ...over,
  });

  check('C1 — PIN: lebar 12 m yang sah TIDAK menjadi 0,12 m (20×12×0,5 = 120)', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({ length: 20, width: 12, height: 0.5 })),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 120);
    assert.ok(calc.calculation?.formula.includes('12.00 m'), calc.calculation?.formula);
  });
  check('C2 — tinggi 15 m yang sah juga tidak dibagi 100', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({ length: 2, width: 3, height: 15 })),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 90);
  });
  check('C3 — satuan eksplisit cm dari provenance: lebar 60 cm → 0,6 m', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({
        length: 20, width: 60, height: 0.5,
        provenance: { width: { value: 60, unit: 'cm' } },
      })),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 6);
    assert.ok(calc.calculation?.formula.includes('[konversi cm→m]'), calc.calculation?.formula);
  });
  check('C4 — satuan eksplisit mm dari provenance: lebar 600 mm → 0,6 m', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({
        length: 20, width: 600, height: 0.5,
        provenance: { width: { value: 600, unit: 'mm' } },
      })),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 6);
  });
  check('C5 — satuan eksplisit m dari provenance: nilai dipakai apa adanya', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({
        length: 20, width: 12, height: 0.5,
        provenance: { width: { value: 12, unit: 'm' } },
      })),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 120);
  });
  check('C6 — satuan tak dikenal → DITOLAK (AMBIGUOUS_UNIT), bukan ditebak', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({
        length: 20, width: 12, height: 0.5,
        provenance: { width: { value: 12, unit: 'inci' } },
      })),
    );
    assert.equal(calc.success, false);
    assert.equal(calc.errorState, 'AMBIGUOUS_UNIT');
    assert.ok(calc.reason?.includes('inci'), calc.reason);
  });
  check('C7 — regresi: 42,50 × 0,60 × 0,30 = 7,65 m³ tetap', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({ length: 42.5, width: 0.6, height: 0.3 })),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 7.65);
  });
  check('C8 — AREA: 20 × 12 m = 240 m² (bukan 2,4)', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({ length: 20, width: 12 }), 'FINISH'),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 240);
    assert.equal(calc.unit, 'm²');
  });
  check('C9 — AREA cm eksplisit: 2000 × 1200 cm → 20 × 12 = 240 m²', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({
        length: 2000, width: 1200,
        provenance: { length: { value: 2000, unit: 'cm' }, width: { value: 1200, unit: 'cm' } },
      }), 'FINISH'),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 240);
  });
  check('C10 — PERIMETER: panjang 1500 cm → 15 m', () => {
    const calc = dedQtoCalculationEngine.calculateQuantity(
      makeItem(baseDims({
        length: 1500,
        provenance: { length: { value: 1500, unit: 'cm' } },
      }), 'OTHER'),
    );
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 15);
    assert.equal(calc.unit, 'm');
  });
}

/* ================================================================== */
/* D. Cek generik qtoBridge — panjang/berat/count (S3-5)                */
/* ================================================================== */

console.log('Bagian D — cek generik qtoBridge');
{
  const dimsVol: QtoUserDimensions = { lengthM: 10, widthM: 2, depthM: 0.5 };
  const dimsLen: QtoUserDimensions = { lengthM: 100 };
  const dimsHeight: QtoUserDimensions = { lengthM: 10, widthM: 2, heightM: 0.5 };

  function verdictOf(item: QtoItemLike, dims: QtoUserDimensions): string {
    return checkQtoAgainstUserDimensions([item], dims)[0].verdict;
  }

  check('D1 — resolveQtoCheckFamily: satuan dimensional menang', () => {
    assert.equal(resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'kg' }), 'WEIGHT');
    assert.equal(resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'ton' }), 'WEIGHT');
    assert.equal(resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'm' }), 'LENGTH');
    assert.equal(resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'm3' }), 'VOLUME');
    assert.equal(resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'm2' }), 'AREA');
    assert.equal(resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'buah' }), 'COUNT');
    // Kategori TIDAK mengalahkan satuan: m³ berkategori pembesian tetap VOLUME.
    assert.equal(
      resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'm3', category: 'pembesian' }),
      'VOLUME',
    );
  });
  check('D2 — resolveQtoCheckFamily: kategori dipakai bila satuan generik', () => {
    assert.equal(
      resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'ls', category: 'pipa' }),
      'LENGTH',
    );
    assert.equal(
      resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'ls', category: 'pembesian' }),
      'WEIGHT',
    );
    assert.equal(
      resolveQtoCheckFamily({ description: 'x', quantity: 1, unit: 'ls' }),
      null,
    );
  });
  check('D3 — LENGTH OK: pipa 100 m vs panjang 100 m', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Pipa PVC 4 inch', quantity: 100, unit: 'm' }],
      dimsLen,
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 100);
  });
  check('D4 — LENGTH MISMATCH: 50 m vs 100 m', () => {
    assert.equal(
      verdictOf({ description: 'Pipa PVC 4 inch', quantity: 50, unit: 'm' }, dimsLen),
      'MISMATCH',
    );
  });
  check('D5 — LENGTH toleransi 10% dipertahankan (105 OK, 111 MISMATCH)', () => {
    assert.equal(
      verdictOf({ description: 'Kabel NYM', quantity: 105, unit: 'm' }, dimsLen),
      'OK',
    );
    assert.equal(
      verdictOf({ description: 'Kabel NYM', quantity: 111, unit: 'm' }, dimsLen),
      'MISMATCH',
    );
  });
  check('D6 — LENGTH tanpa dimensi linear → CANNOT_CHECK', () => {
    assert.equal(
      verdictOf({ description: 'Pipa PVC', quantity: 100, unit: 'm' }, {}),
      'CANNOT_CHECK',
    );
  });
  check('D7 — WEIGHT kg OK: besi 1200 kg = 10 m³ × 120 kg/m³', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Pembesian kolom', quantity: 1200, unit: 'kg', weightRatioKgPerM3: 120 }],
      dimsVol,
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 1200);
  });
  check('D8 — WEIGHT ton OK: aspal 24 ton = 10 m³ × 2400 kg/m³', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Aspal AC-WC', quantity: 24, unit: 'ton', weightRatioKgPerM3: 2400 }],
      dimsVol,
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 24);
  });
  check('D9 — WEIGHT MISMATCH: besi 600 kg vs 1200 kg ekspektasi', () => {
    assert.equal(
      verdictOf(
        { description: 'Pembesian kolom', quantity: 600, unit: 'kg', weightRatioKgPerM3: 120 },
        dimsVol,
      ),
      'MISMATCH',
    );
  });
  check('D10 — WEIGHT tanpa rasio → CANNOT_CHECK (rasio tidak dikarang)', () => {
    assert.equal(
      verdictOf({ description: 'Pembesian kolom', quantity: 1200, unit: 'kg' }, dimsVol),
      'CANNOT_CHECK',
    );
    assert.equal(
      verdictOf(
        { description: 'Pembesian kolom', quantity: 1200, unit: 'kg', weightRatioKgPerM3: 0 },
        dimsVol,
      ),
      'CANNOT_CHECK',
    );
  });
  check('D11 — WEIGHT memakai volume L×W×tinggi bila tanpa kedalaman', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Pembesian balok', quantity: 1200, unit: 'kg', weightRatioKgPerM3: 120 }],
      dimsHeight,
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 1200);
  });
  check('D12 — WEIGHT memakai luas×tebal (thicknessM dari intake)', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Pembesian plat', quantity: 600, unit: 'kg', weightRatioKgPerM3: 120 }],
      { buildingAreaM2: 50, thicknessM: 0.1 },
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 600); // 50 × 0,1 × 120
  });
  check('D13 — COUNT OK: 8 pintu vs 8 elemen', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Pintu panel', quantity: 8, unit: 'buah', elementCount: 8 }],
      {},
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 8);
  });
  check('D14 — COUNT MISMATCH: 6 vs 8 elemen (selisih 25%)', () => {
    assert.equal(
      verdictOf({ description: 'Pintu panel', quantity: 6, unit: 'buah', elementCount: 8 }, {}),
      'MISMATCH',
    );
  });
  check('D15 — COUNT tanpa elementCount → CANNOT_CHECK', () => {
    assert.equal(
      verdictOf({ description: 'Pintu panel', quantity: 8, unit: 'buah' }, {}),
      'CANNOT_CHECK',
    );
  });
  check('D16 — cek m³ kata-kunci dipertahankan: galian 10 m³ OK', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Galian tanah', quantity: 10, unit: 'm3' }],
      dimsVol,
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 10);
  });
  check('D17 — cek m² kata-kunci dipertahankan: dinding 20 m² OK', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Dinding bata', quantity: 20, unit: 'm2' }],
      { lengthM: 5, widthM: 4 },
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 20);
  });
  check('D18 — VOLUME generik via kategori tanpa kata kunci: OK', () => {
    const c = checkQtoAgainstUserDimensions(
      [{ description: 'Struktur atas', quantity: 10, unit: 'm3', category: 'concrete' }],
      dimsVol,
    )[0];
    assert.equal(c.verdict, 'OK');
    assert.equal(c.expectedFromUserDimensions, 10);
  });
  check('D19 — expectedQuantityFromDimensions WEIGHT ton memakai basis kg', () => {
    const r = expectedQuantityFromDimensions(
      { description: 'Aspal', quantity: 24, unit: 'ton', weightRatioKgPerM3: 2400 },
      dimsVol,
    );
    assert.equal(r.expected, 24);
    assert.ok(r.basis?.includes('24000 kg'), r.basis ?? '');
  });
  check('D20 — kuantitas null tetap MISSING (bukan 0)', () => {
    assert.equal(
      verdictOf({ description: 'Pipa PVC', quantity: null, unit: 'm' }, dimsLen),
      'MISSING',
    );
  });
}

/* ================================================================== */

console.log(`\nuniversalQto: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
