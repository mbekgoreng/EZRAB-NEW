/**
 * EZRAB Universal Construction Intelligence — Batch 3 (§6):
 * Engineering Specification & QTO Integrity.
 *
 * Suite tsx polos (tanpa vitest, tanpa AI/network):
 *   npx --yes tsx src/test/engineeringQto.test.ts
 *
 * Cakupan (§6.7):
 *  A. Konversi satuan (§6.3) — whitelist + provenans eksplisit.
 *  B. Validasi dimensi (§6.3) — konsistensi L×W, volume, formula.
 *  C. Gerbang spesifikasi teknik (§6.1) — profil per kategori.
 *  D. Tingkat risiko teknik (§6.2) — LOW/MODERATE/HIGH/CRITICAL.
 *  E. Integritas rumus kuantitas (§6.4) — trace + rekonstruksi.
 *  F. Konsistensi QTO (§6.5–§6.6) — deteksi, tanpa koreksi otomatis.
 *  G. Perbaikan parser terintegrasi (§6.3) — lahan, diameter, kedalaman,
 *     per-unit, 'dalam dari', pertanyaan MEP, wiring gerbang.
 *  H. Skenario rumus domain (§6.7) — beton, urugan, irigasi, jalan,
 *     jembatan, dinding penahan, baja, MEP, hunian.
 *
 * PIN PERILAKU YANG TIDAK BOLEH BERUBAH (keputusan owner):
 *  - Volume 1.0 diam-diam (rule kosong → volume 1.0) TIDAK diubah di
 *    Batch 3 — di-pin di Bagian E sebagai dokumentasi perilaku
 *    (quantityRecordFromTrace menandainya LABELED_ASSUMPTION +
 *    NEEDS_REVIEW, bukan memperbaikinya diam-diam).
 *  - questionDefsFor TIDAK digabung dengan criticalFieldsFor (keputusan
 *    W2/W10 2026-11-22 — semantik "kritis" keduanya berbeda; di-pin di
 *    Bagian G).
 */

import { strict as assert } from 'assert';
import { RabTemplateService } from '../services/rabTemplateService';
import type { RabTemplate } from '../types/rabTemplate';
import {
  ENGINEERING_PROFILES,
  engineeringCategoryFor,
  evaluateEngineeringSpec,
  classifyEngineeringRisk,
  assessDraftEngineering,
  mepBasisFor,
  convertUnit,
  parseDimensionWithUnit,
  unitFamilyOf,
  validateDimensions,
  validateFormulaDimensions,
  buildQuantityRecord,
  applyRoundingPolicy,
  quantityRecordFromTrace,
  mapVolumeSource,
  recomputeFormulaValue,
  reconstructQuantity,
  recordManualOverride,
  checkQtoConsistency,
  type EngineeringCategoryId,
  type EngineeringSpecInput,
  type QuantityRecord,
  type QtoConsistencyItem,
} from '../ai-tools/ezrab-ai/engineeringSpec';
import {
  buildUniversalDraft,
  extractUniversalSpec,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  extractUniversalContext,
  selectNextQuestion,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  extractUniversalMeasures,
  parseLandAreaM2,
} from '../ai-tools/ezrab-ai/rabNeeds';
import { criticalFieldsFor } from '../ai-tools/ezrab-ai/rabIntentFlow';
import { isPerUnitAreaParam } from '../ai-tools/ezrab-ai/templateSuitability';

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
function section(id: string, title: string): void {
  console.log(`\n== ${id}. ${title} ==`);
}

function liveTemplate(id: string): RabTemplate {
  const t = RabTemplateService.getInstance().getTemplateById(id);
  if (!t) throw new Error(`template katalog ${id} tidak ditemukan`);
  return t;
}

function gate(
  category: EngineeringCategoryId,
  spec: EngineeringSpecInput,
  templateId?: string,
) {
  return evaluateEngineeringSpec(
    category,
    spec,
    templateId ? liveTemplate(templateId) : undefined,
  );
}

/* ================================================================== */
/* A. Konversi satuan (§6.3)                                          */
/* ================================================================== */
section('A', 'Konversi satuan — whitelist + provenans eksplisit');

check('A1 1200 mm → 1,2 m', () => {
  const r = convertUnit(1200, 'mm', 'm');
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value, 1.2);
    assert.ok(r.provenance.includes('mm→m'), r.provenance);
  }
});
check('A2 250 cm → 2,5 m', () => {
  const r = convertUnit(250, 'cm', 'm');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 2.5);
});
check('A3 2 km → 2000 m', () => {
  const r = convertUnit(2, 'km', 'm');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 2000);
});
check('A4 1 ha → 10000 m²', () => {
  const r = convertUnit(1, 'ha', 'm2');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 10000);
});
check('A5 5 are → 500 m²', () => {
  const r = convertUnit(5, 'are', 'm2');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 500);
});
check('A6 2 ton → 2000 kg', () => {
  const r = convertUnit(2, 'ton', 'kg');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 2000);
});
check('A7 1 kwintal → 100 kg', () => {
  const r = convertUnit(1, 'kwintal', 'kg');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 100);
});
check('A8 3 m³ → 3000 L', () => {
  const r = convertUnit(3, 'm3', 'L');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 3000);
});
check('A9 satuan sama = identitas', () => {
  const r = convertUnit(5, 'm', 'm');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 5);
});
check('A10 konversi lintas keluarga DITOLAK (m → m²)', () => {
  const r = convertUnit(5, 'm', 'm2');
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('lintas keluarga'), r.error);
});
check('A11 konversi lintas keluarga DITOLAK (m → kg)', () => {
  assert.equal(convertUnit(5, 'm', 'kg').ok, false);
});
check('A12 satuan tak dikenal DITOLAK (kaki)', () => {
  const r = convertUnit(5, 'kaki', 'm');
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('tidak dikenal'), r.error);
});
check('A13 satuan tak dikenal DITOLAK (inci)', () => {
  assert.equal(convertUnit(5, 'inci', 'cm').ok, false);
});
check('A14 m1 adalah panjang', () => {
  assert.equal(unitFamilyOf('m1'), 'length');
  assert.equal(unitFamilyOf('m2'), 'area');
  assert.equal(unitFamilyOf('titik'), 'count');
  assert.equal(unitFamilyOf('kaki'), null);
});
check('A15 parse "12,5 m" (desimal koma) → 12,5 m', () => {
  const r = parseDimensionWithUnit('12,5 m');
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.valueM, 12.5);
    assert.equal(r.unit, 'm');
  }
});
check('A16 parse tanpa satuan = AMBIGU, ditolak', () => {
  const r = parseDimensionWithUnit('1200');
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('tanpa satuan'), r.error);
});
check('A17 parse satuan tak dikenal ditolak', () => {
  assert.equal(parseDimensionWithUnit('5 kaki').ok, false);
});
check('A18 parse pasangan dimensi ditolak (bukan tugas parser ini)', () => {
  assert.equal(parseDimensionWithUnit('10 x 20 m').ok, false);
});

/* ================================================================== */
/* B. Validasi dimensi (§6.3)                                         */
/* ================================================================== */
section('B', 'Validasi dimensi — konsistensi & rumus');

check('B1 panjang negatif = ERROR', () => {
  const f = validateDimensions({ lengthM: -5 });
  assert.ok(f.some((x) => x.code === 'NON_POSITIVE' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('B2 panjang nol = ERROR', () => {
  assert.ok(validateDimensions({ lengthM: 0 }).some((x) => x.code === 'NON_POSITIVE'));
});
check('B3 jumlah pecahan = WARNING', () => {
  const f = validateDimensions({ count: 2.5 });
  assert.ok(f.some((x) => x.code === 'FRACTIONAL_COUNT' && x.severity === 'WARNING'), JSON.stringify(f));
});
check('B4 jumlah bulat = tanpa temuan jumlah', () => {
  assert.ok(!validateDimensions({ count: 30 }).some((x) => x.code === 'FRACTIONAL_COUNT'));
});
check('B5 kemiringan >100% = WARNING', () => {
  assert.ok(validateDimensions({ slopePct: 150 }).some((x) => x.code === 'STEEP_SLOPE'));
});
check('B6 sudut di luar 0–360 = ERROR', () => {
  assert.ok(validateDimensions({ angleDeg: 400 }).some((x) => x.code === 'INVALID_ANGLE'));
});
check('B7 tebal > tinggi induk = WARNING', () => {
  assert.ok(validateDimensions({ thicknessM: 0.5, heightM: 0.3 }).some((x) => x.code === 'THICKNESS_EXCEEDS_HOST'));
});
check('B8 bentang < lebar = WARNING', () => {
  assert.ok(validateDimensions({ spanM: 4, widthM: 6 }).some((x) => x.code === 'SPAN_LESS_THAN_WIDTH'));
});
check('B9 luas 500 ≠ 10×20 = ERROR konsistensi', () => {
  const f = validateDimensions({ lengthM: 10, widthM: 20, areaM2: 500 });
  assert.ok(f.some((x) => x.code === 'AREA_INCONSISTENT' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('B10 luas 200 = 10×20 lolos', () => {
  assert.ok(!validateDimensions({ lengthM: 10, widthM: 20, areaM2: 200 }).some((x) => x.code === 'AREA_INCONSISTENT'));
});
check('B11 selisih luas ≤1% lolos (toleransi pembulatan)', () => {
  assert.ok(!validateDimensions({ lengthM: 10, widthM: 20, areaM2: 201 }).some((x) => x.code === 'AREA_INCONSISTENT'));
});
check('B12 volume 50 ≠ 200×0,15 = ERROR konsistensi', () => {
  const f = validateDimensions({ areaM2: 200, thicknessM: 0.15, volumeM3: 50 });
  assert.ok(f.some((x) => x.code === 'VOLUME_INCONSISTENT' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('B13 volume 30 = 200×0,15 lolos', () => {
  assert.ok(!validateDimensions({ areaM2: 200, thicknessM: 0.15, volumeM3: 30 }).some((x) => x.code === 'VOLUME_INCONSISTENT'));
});
check('B14 rumus VOL-LWH valid (m×m×m → m³)', () => {
  const r = validateFormulaDimensions('VOL-LWH', {
    length: { value: 10, unit: 'm' }, width: { value: 0.3, unit: 'm' }, height: { value: 0.5, unit: 'm' },
  });
  assert.equal(r.ok, true);
});
check('B15 rumus VOL-LWH menolak perkalian tak kompatibel (m×m²×m)', () => {
  const r = validateFormulaDimensions('VOL-LWH', {
    length: { value: 10, unit: 'm' }, width: { value: 0.3, unit: 'm2' }, height: { value: 0.5, unit: 'm' },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('tidak kompatibel'), r.error);
});
check('B16 rumus VOL-LWH menolak input hilang', () => {
  const r = validateFormulaDimensions('VOL-LWH', {
    length: { value: 10, unit: 'm' }, width: { value: 0.3, unit: 'm' },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('butuh input'), r.error);
});
check('B17 rumus tak terdaftar ditolak', () => {
  const r = validateFormulaDimensions('VOL-XXX', { length: { value: 10, unit: 'm' } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('tidak terdaftar'), r.error);
});
check('B18 rumus AREA-LW valid (m×m → m²)', () => {
  assert.equal(validateFormulaDimensions('AREA-LW', {
    length: { value: 10, unit: 'm' }, width: { value: 20, unit: 'm' },
  }).ok, true);
});
check('B19 rumus WGT-VOL-RATIO valid (m³ × kg/m³ → kg)', () => {
  assert.equal(validateFormulaDimensions('WGT-VOL-RATIO', {
    volume: { value: 2.5, unit: 'm3' }, ratioKgPerM3: { value: 7850, unit: 'kg/m3' },
  }).ok, true);
});
check('B20 rumus COUNT-N valid (unit → unit)', () => {
  assert.equal(validateFormulaDimensions('COUNT-N', { count: { value: 40, unit: 'unit' } }).ok, true);
});
check('B21 rumus menolak input tidak positif', () => {
  const r = validateFormulaDimensions('AREA-LW', {
    length: { value: 0, unit: 'm' }, width: { value: 20, unit: 'm' },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('tidak valid'), r.error);
});
check('B22 rumus WGT-VOL-RATIO menolak rasio bersatuan salah', () => {
  assert.equal(validateFormulaDimensions('WGT-VOL-RATIO', {
    volume: { value: 2.5, unit: 'm3' }, ratioKgPerM3: { value: 7850, unit: 'kg' },
  }).ok, false);
});

/* ================================================================== */
/* C. Gerbang spesifikasi teknik (§6.1)                               */
/* ================================================================== */
section('C', 'Gerbang spesifikasi teknik — profil per kategori');

check('C1 profil §6.1 memuat 7 kategori', () => {
  assert.deepEqual(
    Object.keys(ENGINEERING_PROFILES).sort(),
    ['bridge', 'electrical', 'hvac', 'plumbing', 'residential', 'retaining-wall', 'road'],
  );
});
check('C2 kategori per scope: gedung/jalan/jembatan', () => {
  assert.equal(engineeringCategoryFor('gedung'), 'residential');
  assert.equal(engineeringCategoryFor('jalan'), 'road');
  assert.equal(engineeringCategoryFor('jembatan'), 'bridge');
});
check('C3 kategori MEP dari template: listrik/plumbing/HVAC; fire/data = gerbang diam (null)', () => {
  assert.equal(engineeringCategoryFor('mep', { templateId: 'MEP-ELECTRICAL-DIST' }), 'electrical');
  assert.equal(engineeringCategoryFor('mep', { templateId: 'MEP-PLUMBING-TOWER' }), 'plumbing');
  assert.equal(engineeringCategoryFor('mep', { templateId: 'MEP-HVAC-VRF' }), 'hvac');
  // Fire-protection & jaringan data BUKAN kategori §6.1 — gerbang diam
  // (null), evaluator kesesuaian B1 yang memutuskan; gerbang tidak
  // mengarang kategori untuk keduanya.
  assert.equal(engineeringCategoryFor('mep', { templateId: 'MEP-FIRE-PROTECTION' }), null);
  assert.equal(engineeringCategoryFor('mep', { templateId: 'MEP-DATA-NETWORK' }), null);
  assert.equal(engineeringCategoryFor('mep', { subcategoryId: 'listrik' }), 'electrical');
  assert.equal(engineeringCategoryFor('mep', { subcategoryId: 'plumbing' }), 'plumbing');
  assert.equal(engineeringCategoryFor('mep', { subcategoryId: 'hvac' }), 'hvac');
  assert.equal(engineeringCategoryFor('mep', {}), null);
});
check('C4 kategori lanskap: retaining dari template, taman = tanpa gerbang', () => {
  assert.equal(engineeringCategoryFor('lanskap', { templateId: 'STR-RETAINING-RC' }), 'retaining-wall');
  assert.equal(engineeringCategoryFor('lanskap', { templateId: 'LND-TAMAN' }), null);
  assert.equal(engineeringCategoryFor('pondasi'), null);
  assert.equal(engineeringCategoryFor('drainase'), null);
});
check('C5 hunian berluas = CALCULABLE', () => {
  const g = gate('residential', { areaM2: 120, rawText: 'rumah 120 m2' });
  assert.equal(g.verdict, 'CALCULABLE');
  assert.equal(g.blocking, false);
});
check('C6 hunian tanpa basis = NEEDS_CLARIFICATION (blocking)', () => {
  const g = gate('residential', { rawText: 'rumah' });
  assert.equal(g.verdict, 'NEEDS_CLARIFICATION');
  assert.equal(g.blocking, true);
  assert.ok(g.missingRequired.some((m) => m.key === 'area'), JSON.stringify(g.missingRequired));
});
check('C7 hunian lantai saja = CALCULABLE (basis meniru gerbang ukuran kanonis areaOrFloors)', () => {
  const g = gate('residential', { floors: 2, rawText: 'gedung 2 lantai' });
  assert.equal(g.verdict, 'CALCULABLE');
});
check('C8 jalan berpanjang = CALCULABLE', () => {
  assert.equal(gate('road', { lengthM: 1000, rawText: 'jalan 1000 m' }).verdict, 'CALCULABLE');
});
check('C9 jalan tanpa basis = NEEDS_CLARIFICATION', () => {
  assert.equal(gate('road', { rawText: 'jalan' }).verdict, 'NEEDS_CLARIFICATION');
});
check('C10 jalan berluas saja = CALCULABLE (paving per luas)', () => {
  assert.equal(gate('road', { areaM2: 500, rawText: 'paving 500 m2' }).verdict, 'CALCULABLE');
});
check('C11 jembatan bentang 25 m = CALCULABLE', () => {
  const g = gate('bridge', { spanM: 25, rawText: 'jembatan bentang 25 m' }, 'BRG-GIRDER-20M');
  assert.equal(g.verdict, 'CALCULABLE');
});
check('C12 jembatan bentang 50 m = REQUIRES_ENGINEERING_DESIGN (blocking)', () => {
  const g = gate('bridge', { spanM: 50, rawText: 'jembatan bentang 50 m' }, 'BRG-GIRDER-20M');
  assert.equal(g.verdict, 'REQUIRES_ENGINEERING_DESIGN');
  assert.equal(g.blocking, true);
  assert.ok(g.documentsRequired.length > 0, 'dokumen DED wajib disebut');
  assert.ok(g.explanation.includes('50'), g.explanation);
});
check('C13 dinding penahan panjang saja = CALCULABLE + tinggi kritis hilang', () => {
  const g = gate('retaining-wall', { lengthM: 100, rawText: 'dinding penahan 100 m' }, 'STR-RETAINING-RC');
  assert.equal(g.verdict, 'CALCULABLE');
  assert.ok(g.missingCritical.some((m) => m.key === 'height'), JSON.stringify(g.missingCritical));
});
check('C14 dinding penahan tinggi 8 m = REQUIRES_ENGINEERING_DESIGN (blocking, maks template 7 m)', () => {
  const g = gate('retaining-wall', { lengthM: 100, heightM: 8, rawText: 'dinding penahan 100 m tinggi 8 m' }, 'STR-RETAINING-RC');
  assert.equal(g.verdict, 'REQUIRES_ENGINEERING_DESIGN');
  assert.equal(g.blocking, true);
});
check('C15 dinding penahan tinggi 3 m = CALCULABLE', () => {
  const g = gate('retaining-wall', { lengthM: 100, heightM: 3, rawText: 'dinding penahan 100 m tinggi 3 m' }, 'STR-RETAINING-RC');
  assert.equal(g.verdict, 'CALCULABLE');
  assert.equal(g.missingCritical.length, 0);
});
check('C16 listrik luas saja = NEEDS_CLARIFICATION (luas bukan basis listrik)', () => {
  const g = gate('electrical', { areaM2: 120, rawText: 'instalasi listrik 120 m2' });
  assert.equal(g.verdict, 'NEEDS_CLARIFICATION');
  assert.equal(g.blocking, true);
});
check('C17 listrik berdaya = CALCULABLE', () => {
  assert.equal(gate('electrical', { powerKva: 100, rawText: 'instalasi listrik 100 kVA' }).verdict, 'CALCULABLE');
});
check('C18 listrik berlantai = CALCULABLE', () => {
  assert.equal(gate('electrical', { floors: 5, rawText: 'instalasi listrik gedung 5 lantai' }).verdict, 'CALCULABLE');
});
check('C19 plumbing berlantai = CALCULABLE', () => {
  assert.equal(gate('plumbing', { floors: 10, rawText: 'plumbing tower 10 lantai' }).verdict, 'CALCULABLE');
});
check('C20 plumbing tanpa basis = NEEDS_CLARIFICATION', () => {
  assert.equal(gate('plumbing', { rawText: 'plumbing' }).verdict, 'NEEDS_CLARIFICATION');
});
check('C21 HVAC berluas = CALCULABLE', () => {
  assert.equal(gate('hvac', { areaM2: 500, rawText: 'instalasi AC 500 m2' }).verdict, 'CALCULABLE');
});
check('C22 HVAC jumlah saja = NEEDS_CLARIFICATION (luas adalah basis sizing)', () => {
  assert.equal(gate('hvac', { count: 10, rawText: 'instalasi AC 10 unit indoor' }).verdict, 'NEEDS_CLARIFICATION');
});
check('C23 hunian >10 lantai = dokumen DED wajib dicatat', () => {
  const g = gate('residential', { areaM2: 5000, floors: 12, rawText: 'gedung 12 lantai 5000 m2' });
  assert.equal(g.verdict, 'CALCULABLE');
  assert.ok(g.documentsRequired.some((d) => /DED/i.test(d)), JSON.stringify(g.documentsRequired));
});
check('C24 basis MEP: listrik→daya, plumbing→lantai, hvac→luas, data→titik', () => {
  assert.equal(mepBasisFor('listrik').criticalQuestionKey, 'mep-power-capacity');
  assert.equal(mepBasisFor('plumbing').criticalQuestionKey, 'mep-floors');
  assert.equal(mepBasisFor('hvac').criticalQuestionKey, 'mep-area');
  assert.equal(mepBasisFor('komunikasi-data').criticalQuestionKey, 'mep-points');
  assert.equal(mepBasisFor('fire-protection').criticalQuestionKey, 'mep-area');
  assert.equal(mepBasisFor('mep-umum').criticalQuestionKey, 'mep-area');
});

/* ================================================================== */
/* D. Tingkat risiko teknik (§6.2)                                    */
/* ================================================================== */
section('D', 'Tingkat risiko teknik — LOW/MODERATE/HIGH/CRITICAL');

check('D1 spek lengkap = LOW (draft, asumsi diizinkan, tanpa peringatan wajib)', () => {
  const r = classifyEngineeringRisk(gate('residential', { areaM2: 120, lengthM: 10, widthM: 12, floors: 2, rawText: 'rumah 10x12 2 lantai' }));
  assert.equal(r.level, 'LOW');
  assert.equal(r.canDraft, true);
  assert.equal(r.assumptionsPermitted, true);
  assert.equal(r.warningMandatory, false);
  assert.equal(r.humanReviewRequired, false);
});
check('D2 field wajib hilang (bukan kritis) = MODERATE', () => {
  // Jalan panjang saja: lebar wajib hilang (bukan kritis) → MODERATE.
  const r = classifyEngineeringRisk(gate('road', { lengthM: 1000, rawText: 'jalan 1000 m' }));
  assert.equal(r.level, 'MODERATE');
  assert.equal(r.canDraft, true);
  assert.equal(r.warningMandatory, false);
});
check('D3 field rekayasa-kritis hilang = HIGH (draft boleh, peringatan WAJIB, review WAJIB)', () => {
  const r = classifyEngineeringRisk(gate('retaining-wall', { lengthM: 100, rawText: 'dinding penahan 100 m' }, 'STR-RETAINING-RC'));
  assert.equal(r.level, 'HIGH');
  assert.equal(r.canDraft, true);
  assert.equal(r.warningMandatory, true);
  assert.equal(r.humanReviewRequired, true);
  assert.ok(r.warningText != null && r.warningText.includes('tinggi tanah yang ditahan'), r.warningText);
  assert.ok(/bukan desain final/i.test(r.claims), r.claims);
});
check('D4 REQUIRES_ENGINEERING_DESIGN = CRITICAL (draft dilarang)', () => {
  const r = classifyEngineeringRisk(gate('retaining-wall', { lengthM: 100, heightM: 8, rawText: 'dinding penahan 100 m tinggi 8 m' }, 'STR-RETAINING-RC'));
  assert.equal(r.level, 'CRITICAL');
  assert.equal(r.canDraft, false);
  assert.equal(r.assumptionsPermitted, false);
  assert.equal(r.warningMandatory, true);
  assert.equal(r.humanReviewRequired, true);
});
check('D5 NEEDS_CLARIFICATION = HIGH + draft dilarang', () => {
  const r = classifyEngineeringRisk(gate('electrical', { areaM2: 120, rawText: 'instalasi listrik 120 m2' }));
  assert.equal(r.level, 'HIGH');
  assert.equal(r.canDraft, false);
  assert.equal(r.warningMandatory, true);
});
check('D6 agregasi draft: LOW + HIGH = HIGH keseluruhan', () => {
  const a = assessDraftEngineering({
    spec: { areaM2: 120, lengthM: 100, rawText: 'rumah 120 m2 + dinding penahan 100 m' },
    parts: [
      { scope: { id: 'gedung', label: 'Bangunan Gedung' }, template: liveTemplate('HOUSE-T90-2FL') },
      { scope: { id: 'lanskap', label: 'Lanskap' }, template: liveTemplate('STR-RETAINING-RC') },
    ],
  });
  assert.equal(a.level, 'HIGH');
  assert.equal(a.canDraft, true);
  assert.equal(a.humanReviewRequired, true);
  assert.equal(a.perPart[0].level, 'LOW');
  assert.equal(a.perPart[1].level, 'HIGH');
  assert.ok(a.perPart[1].warningText != null && a.perPart[1].warningText.includes('tinggi tanah yang ditahan'), a.perPart[1].warningText);
});
check('D7 agregasi draft: part CRITICAL melarang draft', () => {
  const a = assessDraftEngineering({
    spec: { lengthM: 100, heightM: 8, rawText: 'dinding penahan 100 m tinggi 8 m' },
    parts: [
      { scope: { id: 'lanskap', label: 'Lanskap' }, template: liveTemplate('STR-RETAINING-RC') },
    ],
  });
  assert.equal(a.level, 'CRITICAL');
  assert.equal(a.canDraft, false);
  assert.equal(a.perPart[0].verdict, 'REQUIRES_ENGINEERING_DESIGN');
});
check('D8 risiko tidak pernah menggantikan penilaian insinyur (klaim selalu dibatasi)', () => {
  const high = classifyEngineeringRisk(gate('retaining-wall', { lengthM: 100, rawText: 'dinding penahan 100 m' }, 'STR-RETAINING-RC'));
  assert.ok(/bukan desain final/i.test(high.claims), high.claims);
  const critical = classifyEngineeringRisk(gate('retaining-wall', { lengthM: 100, heightM: 8, rawText: 'dinding penahan 100 m tinggi 8 m' }, 'STR-RETAINING-RC'));
  assert.ok(/TIDAK BOLEH mengklaim/i.test(critical.claims), critical.claims);
});

/* ================================================================== */
/* E. Integritas rumus kuantitas (§6.4)                               */
/* ================================================================== */
section('E', 'Integritas rumus kuantitas — trace + rekonstruksi');

function asphaltRecord(over: Partial<QuantityRecord> = {}): QuantityRecord {
  return buildQuantityRecord({
    formulaId: 'VOL-AREA-T',
    formulaExpression: 'road_length * road_width * 0.06',
    formulaVersion: '1.0',
    inputs: [
      { name: 'road_length', value: 100, unit: 'm', source: 'USER_DIMENSION' },
      { name: 'road_width', value: 6, unit: 'm', source: 'USER_DIMENSION' },
    ],
    outputUnit: 'm3',
    result: 36,
    roundingPolicy: 'template-2dp-min-0.01',
    sourceComponentId: 'comp-asphalt',
    quantitySource: 'CALCULATOR',
    ...over,
  });
}

check('E1 record menyimpan rumus + input + satuan + sumber + status', () => {
  const r = asphaltRecord();
  assert.equal(r.formulaId, 'VOL-AREA-T');
  assert.equal(r.formulaExpression, 'road_length * road_width * 0.06');
  assert.equal(r.formulaVersion, '1.0');
  assert.equal(r.inputs.length, 2);
  assert.equal(r.inputs[0].unit, 'm');
  assert.equal(r.inputs[0].source, 'USER_DIMENSION');
  assert.equal(r.outputUnit, 'm3');
  assert.equal(r.result, 36);
  assert.equal(r.sourceComponentId, 'comp-asphalt');
  assert.equal(r.quantitySource, 'CALCULATOR');
  assert.deepEqual(r.manualOverrideHistory, []);
});
check('E2 default record: formulaId TPL-RULE + versi 1.0', () => {
  const r = buildQuantityRecord({
    inputs: [], outputUnit: 'm2', result: 120, quantitySource: 'TEMPLATE',
  });
  assert.equal(r.formulaId, 'TPL-RULE');
  assert.equal(r.formulaVersion, '1.0');
  assert.equal(r.formulaExpression, null);
});
check('E3 pembulatan round-2dp: 36,125 → 36,13', () => {
  assert.equal(applyRoundingPolicy(36.125, 'round-2dp'), 36.13);
});
check('E4 pembulatan round-3dp: 1,2346 → 1,235', () => {
  assert.equal(applyRoundingPolicy(1.2346, 'round-3dp'), 1.235);
});
check('E5 pembulatan exact: tanpa perubahan', () => {
  assert.equal(applyRoundingPolicy(36.123456, 'exact'), 36.123456);
});
check('E6 pembulatan template: 0,004 → 0,01 (lantai SafeDecimalEngine)', () => {
  assert.equal(applyRoundingPolicy(0.004, 'template-2dp-min-0.01'), 0.01);
});
check('E7 pembulatan template: 0 → 0,01 (lantai berlaku universal, cermin SafeDecimalEngine)', () => {
  assert.equal(applyRoundingPolicy(0, 'template-2dp-min-0.01'), 0.01);
});
check('E8 pemetaan sumber volume: AI_GENERATED→ASSUMPTION, IMPORT→MANUAL_INPUT', () => {
  assert.equal(mapVolumeSource('AI_GENERATED'), 'ASSUMPTION');
  assert.equal(mapVolumeSource('CALCULATOR'), 'CALCULATOR');
  assert.equal(mapVolumeSource('IMPORT'), 'MANUAL_INPUT');
  assert.equal(mapVolumeSource('MANUAL'), 'MANUAL_INPUT');
  assert.equal(mapVolumeSource('MANUAL_OVERRIDE'), 'MANUAL_INPUT');
  assert.equal(mapVolumeSource(null), 'TEMPLATE');
});
check('E9 record dari trace kanonis (rumus + satuan eksplisit)', () => {
  const r = quantityRecordFromTrace(
    { formula: 'road_length * road_width * 0.06', formulaInputs: { road_length: 100, road_width: 6 }, volumeSource: 'CALCULATOR', sourceComponentId: 'comp-asphalt' } as any,
    { volume: 36, unit: 'm3', volumeSource: 'CALCULATOR' },
    { inputUnits: { road_length: 'm', road_width: 'm' } },
  );
  assert.equal(r.formulaExpression, 'road_length * road_width * 0.06');
  assert.equal(r.quantitySource, 'CALCULATOR');
  assert.equal(r.sourceComponentId, 'comp-asphalt');
  assert.equal(r.assumptionStatus, 'NONE');
  assert.equal(r.validationStatus, 'UNVALIDATED');
});
check('E10 PIN — volume 1.0 tanpa rumus = LABELED_ASSUMPTION + NEEDS_REVIEW (perilaku TIDAK diubah)', () => {
  const r = quantityRecordFromTrace(
    { formula: null, formulaInputs: {}, volumeSource: 'CALCULATOR', sourceComponentId: 'comp-ruleless' } as any,
    { volume: 1.0, unit: 'm3', volumeSource: 'CALCULATOR' },
  );
  assert.equal(r.assumptionStatus, 'LABELED_ASSUMPTION');
  assert.equal(r.validationStatus, 'NEEDS_REVIEW');
  assert.equal(r.result, 1.0, 'volume 1.0 TIDAK diubah — hanya ditandai');
});
check('E11 recompute: road_length × road_width × 0,06 = 36', () => {
  const r = recomputeFormulaValue('road_length * road_width * 0.06', { road_length: 100, road_width: 6 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 36);
});
check('E12 recompute menghormati prioritas operator (2 + 3×4 = 14)', () => {
  const r = recomputeFormulaValue('a + b * c', { a: 2, b: 3, c: 4 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 14);
});
check('E13 recompute Math.ceil: ceil(25/10) = 3', () => {
  const r = recomputeFormulaValue('Math.ceil(a / 10)', { a: 25 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 3);
});
check('E14 recompute identifier tak dikenal = UNRESOLVED_DEPENDENCY', () => {
  const r = recomputeFormulaValue('a * b', { a: 2 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('UNRESOLVED_DEPENDENCY'), r.error);
});
check('E15 recompute pembagian nol = gagal', () => {
  const r = recomputeFormulaValue('a / 0', { a: 5 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes('nol'), r.error);
});
check('E16 recompute rumus kosong = gagal', () => {
  assert.equal(recomputeFormulaValue('', {}).ok, false);
});
check('E17 recompute fungsi tak diizinkan (Math.sqrt) = gagal', () => {
  assert.equal(recomputeFormulaValue('Math.sqrt(a)', { a: 4 }).ok, false);
});
check('E18 rekonstruksi: record aspal direproduksi dari input tersimpan', () => {
  const r = reconstructQuantity(asphaltRecord());
  assert.equal(r.reproduced, true);
  assert.equal(r.recomputed, 36);
  assert.equal(r.difference, 0);
});
check('E19 rekonstruksi: hasil tersimpan salah (40 ≠ 36) = tidak direproduksi', () => {
  const r = reconstructQuantity(asphaltRecord({ result: 40 }));
  assert.equal(r.reproduced, false);
  assert.equal(r.recomputed, 36);
  assert.equal(r.difference, 4);
});
check('E20 rekonstruksi: record tanpa rumus = tidak direproduksi', () => {
  const r = reconstructQuantity(asphaltRecord({ formulaExpression: null }));
  assert.equal(r.reproduced, false);
  assert.ok(r.detail.includes('tanpa rumus'), r.detail);
});
check('E21 rekonstruksi: dependensi hilang = tidak direproduksi', () => {
  const rec = asphaltRecord();
  rec.inputs = [{ name: 'road_length', value: 100, unit: 'm', source: 'USER_DIMENSION' }];
  const r = reconstructQuantity(rec);
  assert.equal(r.reproduced, false);
  assert.ok(r.detail.includes('UNRESOLVED_DEPENDENCY'), r.detail);
});
check('E22 override manual: record baru, sumber MANUAL_INPUT, NEEDS_REVIEW, riwayat 1', () => {
  const orig = asphaltRecord();
  const res = recordManualOverride(orig, { newValue: 40, reason: 'Ukur ulang lapangan: tebal 0,07 m' });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.record.result, 40);
  assert.equal(res.record.quantitySource, 'MANUAL_INPUT');
  assert.equal(res.record.validationStatus, 'NEEDS_REVIEW');
  assert.equal(res.record.manualOverrideHistory.length, 1);
  assert.equal(res.record.manualOverrideHistory[0].previousValue, 36);
  assert.equal(res.record.manualOverrideHistory[0].sequence, 1);
  assert.equal(orig.result, 36, 'record asli tidak dimutasi');
  assert.equal(orig.manualOverrideHistory.length, 0);
});
check('E23 override manual: alasan kosong DITOLAK', () => {
  const res = recordManualOverride(asphaltRecord(), { newValue: 40, reason: '   ' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error.includes('alasan'), res.error);
});
check('E24 override manual: nilai negatif DITOLAK', () => {
  assert.equal(recordManualOverride(asphaltRecord(), { newValue: -5, reason: 'koreksi' }).ok, false);
});
check('E25 override manual: riwayat append-only (override kedua menyimpan yang pertama)', () => {
  const first = recordManualOverride(asphaltRecord(), { newValue: 40, reason: 'ukur ulang 1' });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = recordManualOverride(first.record, { newValue: 42, reason: 'ukur ulang 2' });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.record.manualOverrideHistory.length, 2);
  assert.equal(second.record.manualOverrideHistory[0].reason, 'ukur ulang 1');
  assert.equal(second.record.manualOverrideHistory[1].sequence, 2);
});

/* ================================================================== */
/* F. Konsistensi QTO (§6.5–§6.6)                                     */
/* ================================================================== */
section('F', 'Konsistensi QTO — deteksi, tanpa koreksi otomatis');

function qtoItem(over: Partial<QtoConsistencyItem>): QtoConsistencyItem {
  return {
    description: 'Aspal AC-WC',
    quantity: 36,
    unit: 'm3',
    sourceComponentId: 'comp-asphalt',
    formula: 'road_length * road_width * 0.06',
    formulaInputs: { road_length: 100, road_width: 6 },
    volumeSource: 'CALCULATOR',
    ...over,
  };
}

check('F1 item valid = tanpa temuan', () => {
  assert.deepEqual(checkQtoConsistency([qtoItem({})]), []);
});
check('F2 kuantitas null satuan dimensional = MISSING_DIMENSION', () => {
  const f = checkQtoConsistency([qtoItem({ quantity: null })]);
  assert.ok(f.some((x) => x.code === 'MISSING_DIMENSION' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('F3 satuan tak dikenal = INCONSISTENT_UNIT', () => {
  const f = checkQtoConsistency([qtoItem({ unit: 'kaki' })]);
  assert.ok(f.some((x) => x.code === 'INCONSISTENT_UNIT'), JSON.stringify(f));
});
check('F4 satuan tidak cocok dengan permintaan = INCONSISTENT_UNIT', () => {
  const f = checkQtoConsistency([qtoItem({})], { expectedUnits: { 'Aspal AC-WC': 'm2' } });
  assert.ok(f.some((x) => x.code === 'INCONSISTENT_UNIT' && x.message.includes('m2')), JSON.stringify(f));
});
check('F5 satuan output vs rumus registry (VOL-LWH → kg) = INCONSISTENT_UNIT', () => {
  const f = checkQtoConsistency([qtoItem({ formulaId: 'VOL-LWH', unit: 'kg' })]);
  assert.ok(f.some((x) => x.code === 'INCONSISTENT_UNIT'), JSON.stringify(f));
});
check('F6 kuantitas 0 dimensional = UNEXPECTED_ZERO', () => {
  const f = checkQtoConsistency([qtoItem({ quantity: 0 })]);
  assert.ok(f.some((x) => x.code === 'UNEXPECTED_ZERO' && x.severity === 'WARNING'), JSON.stringify(f));
});
check('F7 kuantitas negatif = INVALID_GEOMETRY', () => {
  const f = checkQtoConsistency([qtoItem({ quantity: -5 })]);
  assert.ok(f.some((x) => x.code === 'INVALID_GEOMETRY' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('F8 jumlah pecahan satuan hitung = IMPLAUSIBLE_RANGE', () => {
  const f = checkQtoConsistency([qtoItem({ description: 'Titik lampu', quantity: 2.5, unit: 'titik', formula: null, formulaInputs: null, volumeSource: 'MANUAL' })]);
  assert.ok(f.some((x) => x.code === 'IMPLAUSIBLE_RANGE'), JSON.stringify(f));
});
check('F9 sumber CALCULATOR tanpa rumus = MISSING_FORMULA', () => {
  const f = checkQtoConsistency([qtoItem({ formula: null })]);
  assert.ok(f.some((x) => x.code === 'MISSING_FORMULA'), JSON.stringify(f));
});
check('F10 rumus merujuk input tak tersimpan = UNRESOLVED_DEPENDENCY', () => {
  const f = checkQtoConsistency([qtoItem({ formulaInputs: { road_length: 100 } })]);
  assert.ok(f.some((x) => x.code === 'UNRESOLVED_DEPENDENCY' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('F11 komponen sama dua kali = DUPLICATE_QUANTITY (ERROR)', () => {
  const f = checkQtoConsistency([qtoItem({}), qtoItem({ description: 'Aspal AC-WC (2)' })]);
  assert.ok(f.some((x) => x.code === 'DUPLICATE_QUANTITY' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('F12 deskripsi+satuan sama, kuantitas beda = DUPLICATE_QUANTITY (WARNING)', () => {
  const f = checkQtoConsistency([
    qtoItem({ sourceComponentId: 'comp-a' }),
    qtoItem({ sourceComponentId: 'comp-b', quantity: 40 }),
  ]);
  assert.ok(f.some((x) => x.code === 'DUPLICATE_QUANTITY' && x.severity === 'WARNING'), JSON.stringify(f));
});
check('F13 input rumus ≠ dimensi scope = SCOPE_DIMENSION_MISMATCH', () => {
  const f = checkQtoConsistency(
    [qtoItem({ scopeId: 'jalan', formulaInputs: { road_length: 500, road_width: 6 } })],
    { scopeDimensions: { jalan: { lengthM: 1000, widthM: 6 } } },
  );
  assert.ok(f.some((x) => x.code === 'SCOPE_DIMENSION_MISMATCH' && x.severity === 'ERROR'), JSON.stringify(f));
});
check('F14 input rumus = dimensi scope = tanpa mismatch', () => {
  const f = checkQtoConsistency(
    [qtoItem({ scopeId: 'jalan' })],
    { scopeDimensions: { jalan: { lengthM: 100, widthM: 6 } } },
  );
  assert.ok(!f.some((x) => x.code === 'SCOPE_DIMENSION_MISMATCH'), JSON.stringify(f));
});
check('F15 dimensi klaim item tidak valid = INVALID_GEOMETRY', () => {
  const f = checkQtoConsistency([qtoItem({ dimensions: { lengthM: 10, widthM: 20, areaM2: 500 } })]);
  assert.ok(f.some((x) => x.code === 'INVALID_GEOMETRY'), JSON.stringify(f));
});
check('F16 semua proposal koreksi SELALU requiresApproval', () => {
  const f = checkQtoConsistency([
    qtoItem({ quantity: null }),
    qtoItem({ description: 'Item B', quantity: 0, unit: 'm2', sourceComponentId: 'comp-b', formula: null, formulaInputs: null }),
  ]);
  const withProposal = f.filter((x) => x.correctionProposal);
  assert.ok(withProposal.length > 0, 'harus ada proposal koreksi');
  assert.ok(withProposal.every((x) => x.correctionProposal!.requiresApproval === true), JSON.stringify(f));
});
check('F17 pemeriksa TIDAK PERNAH mengubah item (murni)', () => {
  const items = [qtoItem({ quantity: 0 })];
  const before = JSON.stringify(items);
  checkQtoConsistency(items);
  assert.equal(JSON.stringify(items), before);
});

/* ================================================================== */
/* G. Perbaikan parser terintegrasi (§6.3)                            */
/* ================================================================== */
section('G', 'Perbaikan parser terintegrasi — lahan, diameter, kedalaman, per-unit, MEP, gerbang');

function draftOf(text: string) {
  const r = buildUniversalDraft(text);
  return r.kind === 'draft' ? r.draft : null;
}
function templateIdsOf(text: string): string[] {
  const d = draftOf(text);
  return d ? d.parts.map((p) => p.template?.id ?? '?') : [];
}

check('G1 "gudang luas lahan 500 m2" → needs-spec (lahan bukan ukuran bangunan)', () => {
  const r = buildUniversalDraft('gudang luas lahan 500 m2');
  assert.equal(r.kind, 'needs-spec');
  const spec = extractUniversalSpec('gudang luas lahan 500 m2');
  assert.equal((spec as any).scopeSpecs?.gedung?.areaM2, undefined);
  assert.equal(spec.landAreaM2, 500);
});
check('G2 "gudang 10x20 + lahan 500" → draft 200 m² (bukan 500)', () => {
  const spec = extractUniversalSpec('gudang 10 x 20 m luas lahan 500 m2');
  assert.equal(spec.areaM2, 200);
  assert.equal(spec.landAreaM2, 500);
  assert.deepEqual(templateIdsOf('gudang 10 x 20 m luas lahan 500 m2'), ['BLD-IND-WAREHOUSE']);
});
check('G3 "bore pile diameter 40 cm" → needs-spec (diameter bukan panjang)', () => {
  const r = buildUniversalDraft('bore pile diameter 40 cm');
  assert.equal(r.kind, 'needs-spec');
  const spec = extractUniversalSpec('bore pile diameter 40 cm');
  assert.equal((spec as any).scopeSpecs?.pondasi?.lengthM, undefined);
});
check('G4 "bore pile diameter 40 cm kedalaman 18 m" → lengthM 18 (bukan 0,4)', () => {
  const spec = extractUniversalSpec('bore pile diameter 40 cm kedalaman 18 m');
  assert.equal((spec as any).scopeSpecs?.pondasi?.lengthM, 18);
  assert.equal((spec as any).scopeSpecs?.pondasi?.depthM, 18);
  assert.deepEqual(templateIdsOf('bore pile diameter 40 cm kedalaman 18 m'), ['FND-BORED-PILE']);
});
check('G5 DEPTH: "bore pile 18 m" → depthM 18', () => {
  const spec = extractUniversalSpec('bore pile 18 m');
  assert.equal((spec as any).scopeSpecs?.pondasi?.depthM, 18);
  assert.deepEqual(templateIdsOf('bore pile 18 m'), ['FND-BORED-PILE']);
});
check('G6 DEPTH: "tiang pancang 12 m" → depthM 12', () => {
  const spec = extractUniversalSpec('tiang pancang 12 m');
  assert.equal((spec as any).scopeSpecs?.pondasi?.depthM, 12);
  assert.deepEqual(templateIdsOf('tiang pancang 12 m'), ['FND-DRIVEN-PILE']);
});
check('G7 DEPTH: "sumuran 5 m" → depthM 5', () => {
  const spec = extractUniversalSpec('sumuran 5 m');
  assert.equal((spec as any).scopeSpecs?.pondasi?.depthM, 5);
  assert.deepEqual(templateIdsOf('sumuran 5 m'), ['FND-SUMURAN-CAISSON']);
});
check('G8 "dinding penahan tanah 100 m" → lahan null (bukan lahan 100 m²)', () => {
  const spec = extractUniversalSpec('dinding penahan tanah 100 m');
  assert.equal(spec.landAreaM2, null);
  assert.deepEqual(templateIdsOf('dinding penahan tanah 100 m'), ['STR-RETAINING-RC']);
});
check('G9 parser lahan: "galian tanah 100 m2" bukan lahan; "luas lahan 500 m2" tetap lahan', () => {
  assert.equal(parseLandAreaM2('galian tanah 100 m2'), null);
  assert.equal(parseLandAreaM2('dinding penahan tanah 100 m2'), null);
  assert.equal(parseLandAreaM2('luas lahan 500 m2'), 500);
  assert.equal(parseLandAreaM2('lahan 500 m2'), 500);
});
check('G10 "dalam 30 m dari jalan" = JARAK, bukan kedalaman', () => {
  assert.equal(extractUniversalMeasures('gedung dalam 30 m dari jalan').depthM, null);
});
check('G11 "kedalaman 30 m" tetap kedalaman', () => {
  assert.equal(extractUniversalMeasures('sumur bor kedalaman 30 m').depthM, 30);
});
check('G12 gerbang: dinding penahan tinggi 8 m → needs-spec (di atas maks template 7 m)', () => {
  const r = buildUniversalDraft('dinding penahan tanah 100 m tinggi 8 m');
  assert.equal(r.kind, 'needs-spec');
  if (r.kind === 'needs-spec') {
    assert.ok(r.missing.some((m) => /stabilitas/i.test(m)), JSON.stringify(r.missing));
  }
});
check('G13 gerbang: dinding penahan tanpa tinggi → draft + PERINGATAN TEKNIK wajib', () => {
  const d = draftOf('dinding penahan tanah 100 m');
  assert.ok(d, 'harus draft');
  assert.ok(d!.warnings.some((w) => w.includes('PERINGATAN TEKNIK') && w.includes('tinggi tanah yang ditahan')), JSON.stringify(d!.warnings));
});
check('G14 gerbang: dinding penahan tinggi 3 m → draft tanpa peringatan tinggi', () => {
  const d = draftOf('dinding penahan tanah 100 m tinggi 3 m');
  assert.ok(d, 'harus draft');
  assert.ok(!d!.warnings.some((w) => w.includes('tinggi tanah yang ditahan')), JSON.stringify(d!.warnings));
});
check('G15 per-unit: predikat isPerUnitAreaParam (dipakai mapper + evaluator)', () => {
  // Predikat yang sama dipakai mapSpecToParams — luas total tidak
  // pernah dipetakan ke parameter ini di mana pun.
  assert.equal(isPerUnitAreaParam('unit_area', 'Luas per Unit'), true);
  assert.equal(isPerUnitAreaParam('room_area_m2', 'Luas per Kamar'), true);
  assert.equal(isPerUnitAreaParam('villa_area_m2', 'Luas Bangunan per Unit'), true);
  assert.equal(isPerUnitAreaParam('unit_area', 'Luas Unit Tenant'), true);
  assert.equal(isPerUnitAreaParam('building_area', 'Luas Bangunan'), false);
  assert.equal(isPerUnitAreaParam('pool_area', 'Luas Kolam Renang'), false);
  assert.equal(isPerUnitAreaParam('building_area', 'Luas Bangunan Villa'), false);
});
check('G16 per-unit end-to-end: "perumahan 20 unit, luas total 720 m²" → needs-spec minta luas PER UNIT', () => {
  const r = buildUniversalDraft('perumahan 20 unit luas total 720 m2');
  assert.equal(r.kind, 'needs-spec');
  if (r.kind === 'needs-spec') {
    assert.ok(r.missing.some((m) => /luas per unit/i.test(m)), JSON.stringify(r.missing));
  }
});
check('G17 MEP listrik → pertanyaan kritis daya (bukan luas)', () => {
  const nq = selectNextQuestion(extractUniversalContext('buatkan RAB instalasi listrik rumah 3 kamar tidur'));
  assert.equal((nq as any)?.key, 'mep-power-capacity');
  assert.equal((nq as any)?.critical, true);
});
check('G18 MEP plumbing → pertanyaan kritis lantai', () => {
  const nq = selectNextQuestion(extractUniversalContext('buatkan RAB instalasi plumbing apartemen'));
  assert.equal((nq as any)?.key, 'mep-floors');
  assert.equal((nq as any)?.critical, true);
});
check('G19 MEP HVAC → pertanyaan kritis luas (tetap)', () => {
  const nq = selectNextQuestion(extractUniversalContext('buatkan RAB instalasi AC gedung kantor'));
  assert.equal((nq as any)?.key, 'mep-area');
  assert.equal((nq as any)?.critical, true);
});
check('G20 MEP data → pertanyaan kritis titik', () => {
  const nq = selectNextQuestion(extractUniversalContext('buatkan RAB instalasi jaringan data gedung kantor'));
  assert.equal((nq as any)?.key, 'mep-points');
  assert.equal((nq as any)?.critical, true);
});
check('G21 PIN W6 — questionDefsFor TIDAK digabung criticalFieldsFor (keputusan W2/W10)', () => {
  // Tabel kritis intent-first tidak berubah oleh B3 dan tidak memuat
  // kunci pertanyaan intake MEP — kedua definisi "kritis" tetap
  // terpisah sesuai keputusan yang dipin di universalClassification §8.
  assert.deepEqual(criticalFieldsFor('jalan').map((f) => f.key), ['length', 'width']);
  assert.deepEqual(criticalFieldsFor('jembatan').map((f) => f.key), ['span', 'width']);
  assert.ok(!criticalFieldsFor('listrik').some((f) => f.key === 'mep-power-capacity'));
});

/* ================================================================== */
/* H. Skenario rumus domain (§6.7)                                    */
/* ================================================================== */
section('H', 'Skenario rumus domain — beton, urugan, irigasi, jalan, jembatan, baja, MEP, hunian');

check('H1 hunian: tapak 10×20 = 200 m² (AREA-LW)', () => {
  const v = validateFormulaDimensions('AREA-LW', {
    length: { value: 10, unit: 'm' }, width: { value: 20, unit: 'm' },
  });
  assert.equal(v.ok, true);
  const r = recomputeFormulaValue('length * width', { length: 10, width: 20 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 200);
});
check('H2 jalan: 1000×6 = 6000 m²; perkerasan 0,06 m = 360 m³', () => {
  const a = recomputeFormulaValue('length * width', { length: 1000, width: 6 });
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.value, 6000);
  const v = recomputeFormulaValue('area * thickness', { area: 6000, thickness: 0.06 });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.value, 360);
  assert.equal(validateFormulaDimensions('VOL-AREA-T', {
    area: { value: 6000, unit: 'm2' }, thickness: { value: 0.06, unit: 'm' },
  }).ok, true);
});
check('H3 beton: kolom 10×0,3×0,5 = 1,5 m³ (VOL-LWH)', () => {
  const r = recomputeFormulaValue('length * width * height', { length: 10, width: 0.3, height: 0.5 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 1.5);
});
check('H4 urugan: 100×2×1,5 = 300 m³ (VOL-LWD)', () => {
  const r = recomputeFormulaValue('length * width * depth', { length: 100, width: 2, depth: 1.5 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 300);
});
check('H5 irigasi: saluran 250×1,2×0,8 = 240 m³ (VOL-LWD)', () => {
  assert.equal(validateFormulaDimensions('VOL-LWD', {
    length: { value: 250, unit: 'm' }, width: { value: 1.2, unit: 'm' }, depth: { value: 0.8, unit: 'm' },
  }).ok, true);
  const r = recomputeFormulaValue('length * width * depth', { length: 250, width: 1.2, depth: 0.8 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 240);
});
check('H6 jembatan: luas penampang 20×3 = 60 m² (AREA-LH) + bentang dalam batas', () => {
  assert.equal(validateFormulaDimensions('AREA-LH', {
    length: { value: 20, unit: 'm' }, height: { value: 3, unit: 'm' },
  }).ok, true);
  const g = gate('bridge', { spanM: 20, rawText: 'jembatan bentang 20 m' }, 'BRG-GIRDER-20M');
  assert.equal(g.verdict, 'CALCULABLE');
});
check('H7 dinding penahan: 100×0,4×3 = 120 m³ (VOL-LWH)', () => {
  const r = recomputeFormulaValue('length * width * height', { length: 100, width: 0.4, height: 3 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 120);
});
check('H8 baja: 2,5 m³ × 7850 kg/m³ = 19625 kg (WGT-VOL-RATIO)', () => {
  const r = recomputeFormulaValue('volume * ratioKgPerM3', { volume: 2.5, ratioKgPerM3: 7850 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 19625);
});
check('H9 MEP: 40 titik = 40 unit (COUNT-N)', () => {
  assert.equal(validateFormulaDimensions('COUNT-N', { count: { value: 40, unit: 'titik' } }).ok, true);
  const r = recomputeFormulaValue('count', { count: 40 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 40);
});
check('H10 skenario gagal: saluran irigasi dengan dimensi tak konsisten = ERROR', () => {
  const f = validateDimensions({ lengthM: 250, widthM: 1.2, areaM2: 500 });
  assert.ok(f.some((x) => x.code === 'AREA_INCONSISTENT' && x.severity === 'ERROR'), JSON.stringify(f));
});

/* ================================================================== */
/* Ringkasan                                                           */
/* ================================================================== */
console.log(`\nengineeringQto: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
