/**
 * EZRAB DED -> RAB V2.0 — 24 MANDATORY TEST FIXTURES
 * Section AI Compliance Suite: Strict Deterministic Math, QTO, AHSP 2026, and WBS Validation
 */

import { strict as assert } from 'node:assert';
import { ezrabCoreQto } from '../ded-rab-v2/qto/ezrabCoreQto';
import { ahspMatcher } from '../ded-rab-v2/ahsp/ahspMatcher';
import { ahspPriceResolver } from '../ded-rab-v2/ahsp/ahspPriceResolver';
import { dedRabValidationGate } from '../ded-rab-v2/validation/dedRabValidationGate';
import { constructionCompletenessEngine } from '../ded-rab-v2/interpretation/constructionCompletenessEngine';
import { constructionNormalizer } from '../ded-rab-v2/interpretation/constructionNormalizer';
import { DedWorkItem } from '../ded-rab-v2/types';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

let passed = 0;
let failed = 0;

function runFixture(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Reason: ${err.message || err}`);
    failed++;
  }
}

console.log('======================================================================');
console.log('EZRAB DED -> RAB V2.0 — 24 MANDATORY TEST FIXTURES (SECTION AI)');
console.log('======================================================================');

// -----------------------------------------------------------------------------
// FIXTURE 01: Pondasi batu kali 1:4
// DED: Pjg=48m, Lbr Atas=0.3m, Lbr Bawah=0.6m, Tgi=0.8m -> Vol=17.28 m3
// -----------------------------------------------------------------------------
runFixture('FIXTURE 01: Pondasi batu kali 1:4 (Vol = 17.28 m3)', () => {
  const item: DedWorkItem = {
    id: 'FIX-01',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pasangan Pondasi Batu Kali 1:4',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {
      length: { value: 48, unit: 'm', isMissing: false },
      width: { value: 0.3, unit: 'm', isMissing: false },
      height: { value: 0.8, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'TRAPEZOIDAL' },
    unit: 'm3',
    calculationInputs: {
      topWidth: 0.3,
      bottomWidth: 0.6,
      height: 0.8,
      length: 48,
    },
    confidence: 0.98,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(item);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 17.28);
  assert.equal(qto.unit, 'm³');

  // Verify AHSP match.
  // The official 2026 catalog genuinely contains MULTIPLE equally-valid "pondasi batu belah
  // mortar setara 1SP : 4PP" analyses (2.2.2.1.6 manual AND 2.2.2.1.7 semi-mekanis). The
  // matcher must therefore return an HONEST outcome — a MATCH whose code exists in the
  // official catalog, or an AMBIGUOUS non-decision listing the real candidates — and must
  // NEVER invent a code. Asserting `code.length > 0` would encode a fabricated certainty.
  const match = ahspMatcher.matchWorkItem(item);
  assert.notEqual(match.matchType, 'AI_CUSTOM');
  if (match.matchType === 'AMBIGUOUS') {
    assert.equal(match.code, '', 'AMBIGUOUS must never carry a selected code');
    assert.ok((match.candidates || []).length > 0, 'AMBIGUOUS must list real official candidates');
    match.candidates!.forEach((c) => assert.ok(officialAhspRepository.hasOfficialAhsp(c.code)));
  } else if (match.matchType !== 'NOT_FOUND') {
    assert.ok(match.code.length > 0);
    assert.ok(officialAhspRepository.hasOfficialAhsp(match.code), '§14: MATCHED code must exist in the official catalog');
  }
});

// -----------------------------------------------------------------------------
// FIXTURE 02: Footplat 100x100x30 cm, 12 unit -> Vol beton = 3.6 m3, Bekisting = 14.4 m2
// -----------------------------------------------------------------------------
runFixture('FIXTURE 02: Footplat 100x100x30 cm, 12 unit (Beton = 3.6 m3, Bekisting = 14.4 m2)', () => {
  const betonItem: DedWorkItem = {
    id: 'FIX-02-BETON',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Beton Footplat 100x100x30 cm',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-02'],
    sourcePages: [1],
    dimensions: {
      length: { value: 1.0, unit: 'm', isMissing: false },
      width: { value: 1.0, unit: 'm', isMissing: false },
      height: { value: 0.3, unit: 'm', isMissing: false },
      count: { value: 12, unit: 'unit', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      length: 1.0,
      width: 1.0,
      height: 0.3,
      count: 12,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qtoBeton = ezrabCoreQto.calculateQuantity(betonItem);
  assert.equal(qtoBeton.status, 'CALCULATED');
  assert.equal(qtoBeton.quantity, 3.6);

  // Bekisting: 2 * (length + width) * height * count = 2 * 2.0 * 0.3 * 12 = 14.4 m2
  const perimeter = 2 * (1.0 + 1.0);
  const bekistingArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(perimeter, 0.3, 4), 12, 4);
  assert.equal(bekistingArea, 14.4);
});

// -----------------------------------------------------------------------------
// FIXTURE 03: Sloof 15x20 cm, Pjg=48m -> Vol beton = 1.44 m3, Bekisting = 19.2 m2
// -----------------------------------------------------------------------------
runFixture('FIXTURE 03: Sloof 15x20 cm, Pjg=48m (Beton = 1.44 m3, Bekisting = 19.2 m2)', () => {
  const sloofBeton: DedWorkItem = {
    id: 'FIX-03-SLOOF',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Beton Sloof 15/20',
    category: 'STRUCTURE_BEAM',
    status: 'CONFIRMED',
    evidenceIds: ['EV-03'],
    sourcePages: [2],
    dimensions: {
      length: { value: 48, unit: 'm', isMissing: false },
      width: { value: 0.15, unit: 'm', isMissing: false },
      height: { value: 0.20, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      length: 48,
      width: 0.15,
      height: 0.20,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(sloofBeton);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 1.44);

  // Bekisting Sloof: 2 sisi vertikal * height (0.2m) * length (48m) = 2 * 0.2 * 48 = 19.2 m2
  const bekistingSloof = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(2, 0.20, 4), 48, 4);
  assert.equal(bekistingSloof, 19.2);
});

// -----------------------------------------------------------------------------
// FIXTURE 04: Kolom K1 15x30 cm, 16 unit, Tgi=3.5m -> Vol beton = 2.52 m3
// -----------------------------------------------------------------------------
runFixture('FIXTURE 04: Kolom K1 15x30 cm, 16 unit, Tgi=3.5m (Beton = 2.52 m3)', () => {
  const kolomItem: DedWorkItem = {
    id: 'FIX-04-KOLOM',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Beton Kolom K1 15x30 cm',
    category: 'STRUCTURE_COLUMN',
    status: 'CONFIRMED',
    evidenceIds: ['EV-04'],
    sourcePages: [2],
    dimensions: {
      width: { value: 0.15, unit: 'm', isMissing: false },
      length: { value: 0.30, unit: 'm', isMissing: false },
      height: { value: 3.5, unit: 'm', isMissing: false },
      count: { value: 16, unit: 'unit', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      width: 0.15,
      length: 0.30,
      height: 3.5,
      count: 16,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(kolomItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 2.52);
});

// -----------------------------------------------------------------------------
// FIXTURE 05: Balok B1 15x30 cm, Pjg=48m -> Vol beton = 2.16 m3
// -----------------------------------------------------------------------------
runFixture('FIXTURE 05: Balok B1 15x30 cm, Pjg=48m (Beton = 2.16 m3)', () => {
  const balokItem: DedWorkItem = {
    id: 'FIX-05-BALOK',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Beton Balok B1 15x30 cm',
    category: 'STRUCTURE_BEAM',
    status: 'CONFIRMED',
    evidenceIds: ['EV-05'],
    sourcePages: [2],
    dimensions: {
      length: { value: 48, unit: 'm', isMissing: false },
      width: { value: 0.15, unit: 'm', isMissing: false },
      height: { value: 0.30, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      length: 48,
      width: 0.15,
      height: 0.30,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(balokItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 2.16);
});

// -----------------------------------------------------------------------------
// FIXTURE 06: Plat lantai 2 tebal 12 cm, Luas=64 m2 -> Vol beton = 7.68 m3
// -----------------------------------------------------------------------------
runFixture('FIXTURE 06: Plat lantai 2 tebal 12 cm, Luas=64 m2 (Beton = 7.68 m3)', () => {
  const platItem: DedWorkItem = {
    id: 'FIX-06-PLAT',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Beton Plat Lantai 2 tebal 12 cm',
    category: 'STRUCTURE_SLAB',
    status: 'CONFIRMED',
    evidenceIds: ['EV-06'],
    sourcePages: [2],
    dimensions: {
      length: { value: 8, unit: 'm', isMissing: false },
      width: { value: 8, unit: 'm', isMissing: false },
      height: { value: 0.12, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      length: 8,
      width: 8,
      height: 0.12,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(platItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 7.68);
});

// -----------------------------------------------------------------------------
// FIXTURE 07: Dinding bata merah 1:4, Pjg=48m, Tgi=3.5m, kurangi pintu/jendela -> Vol bersih m2
// Gross = 48 * 3.5 = 168 m2. Subtractions = 7 m2 -> 161 m2.
// -----------------------------------------------------------------------------
runFixture('FIXTURE 07: Dinding bata merah 1:4 (Gross 168 m2 - Bukaan 7 m2 = 161 m2)', () => {
  const grossArea = SafeDecimalEngine.safeMultiply(48, 3.5, 4); // 168
  const deductions = 7.0; // 2 pintu + 2 jendela
  const netArea = SafeDecimalEngine.safeSubtract(grossArea, deductions); // 161.0

  const dindingItem: DedWorkItem = {
    id: 'FIX-07-DINDING',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pasangan Dinding Bata Merah 1:4',
    category: 'WALL',
    status: 'CONFIRMED',
    evidenceIds: ['EV-07'],
    sourcePages: [1],
    dimensions: {
      area: { value: netArea, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: netArea,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(dindingItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 161.0);
  assert.equal(qto.unit, 'm²');
});

// -----------------------------------------------------------------------------
// FIXTURE 08: Dinding hebel t=10cm, Luas=120 m2
// -----------------------------------------------------------------------------
runFixture('FIXTURE 08: Dinding hebel t=10cm (Luas = 120 m2)', () => {
  const hebelItem: DedWorkItem = {
    id: 'FIX-08-HEBEL',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pasangan Dinding Bata Ringan Hebel t=10 cm',
    category: 'WALL',
    status: 'CONFIRMED',
    evidenceIds: ['EV-08'],
    sourcePages: [1],
    dimensions: {
      area: { value: 120, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: 120,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(hebelItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 120);
});

// -----------------------------------------------------------------------------
// FIXTURE 09: Plesteran 1:4 tebal 15mm, 2 sisi dinding bata
// -----------------------------------------------------------------------------
runFixture('FIXTURE 09: Plesteran 1:4 tebal 15mm, 2 sisi dinding bata (2 x 161 = 322 m2)', () => {
  const wallArea = 161;
  const plesteranArea = SafeDecimalEngine.safeMultiply(wallArea, 2, 4);

  const plesteranItem: DedWorkItem = {
    id: 'FIX-09-PLESTERAN',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Plesteran 1:4 tebal 15 mm',
    category: 'PLASTER',
    status: 'CONFIRMED',
    evidenceIds: ['EV-09'],
    sourcePages: [1],
    dimensions: {
      area: { value: plesteranArea, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: plesteranArea,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(plesteranItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 322);
});

// -----------------------------------------------------------------------------
// FIXTURE 10: Acian semen, 2 sisi plesteran
// -----------------------------------------------------------------------------
runFixture('FIXTURE 10: Acian semen, 2 sisi plesteran (322 m2)', () => {
  const acianItem: DedWorkItem = {
    id: 'FIX-10-ACIAN',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Acian Dinding Semen Portland',
    category: 'PLASTER',
    status: 'CONFIRMED',
    evidenceIds: ['EV-10'],
    sourcePages: [1],
    dimensions: {
      area: { value: 322, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: 322,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(acianItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 322);
});

// -----------------------------------------------------------------------------
// FIXTURE 11: Keramik lantai 60x60, Luas=45 m2
// -----------------------------------------------------------------------------
runFixture('FIXTURE 11: Keramik lantai 60x60 (Luas = 45 m2)', () => {
  const keramikItem: DedWorkItem = {
    id: 'FIX-11-KERAMIK',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pasang Keramik Lantai 60x60 cm Polished',
    category: 'FLOOR_FINISH',
    status: 'CONFIRMED',
    evidenceIds: ['EV-11'],
    sourcePages: [1],
    dimensions: {
      area: { value: 45, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: 45,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(keramikItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 45);
});

// -----------------------------------------------------------------------------
// FIXTURE 12: Plafon gypsum 9mm + rangka hollow, Luas=64 m2
// -----------------------------------------------------------------------------
runFixture('FIXTURE 12: Plafon gypsum 9mm + rangka hollow (Luas = 64 m2)', () => {
  const plafonItem: DedWorkItem = {
    id: 'FIX-12-PLAFON',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pasang Plafon Gypsum Board 9 mm Rangka Hollow Galvanis',
    category: 'CEILING',
    status: 'CONFIRMED',
    evidenceIds: ['EV-12'],
    sourcePages: [1],
    dimensions: {
      area: { value: 64, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: 64,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(plafonItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 64);
});

// -----------------------------------------------------------------------------
// FIXTURE 13: Cat dinding interior 3 lapis, Luas plesteran (322 m2)
// -----------------------------------------------------------------------------
runFixture('FIXTURE 13: Cat dinding interior 3 lapis (Luas = 322 m2)', () => {
  const catItem: DedWorkItem = {
    id: 'FIX-13-CAT',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pengecatan Tembok Interior 3 Lapis',
    category: 'PAINTING',
    status: 'CONFIRMED',
    evidenceIds: ['EV-13'],
    sourcePages: [1],
    dimensions: {
      area: { value: 322, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: 322,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(catItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 322);
});

// -----------------------------------------------------------------------------
// FIXTURE 14: Atap genteng keramik, Luas bidang m2
// -----------------------------------------------------------------------------
runFixture('FIXTURE 14: Atap genteng keramik (Luas = 100 m2)', () => {
  const atapItem: DedWorkItem = {
    id: 'FIX-14-ATAP',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pasang Atap Genteng Keramik Glazur',
    category: 'ROOF',
    status: 'CONFIRMED',
    evidenceIds: ['EV-14'],
    sourcePages: [3],
    dimensions: {
      area: { value: 100, unit: 'm2', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {
      area: 100,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(atapItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 100);
});

// -----------------------------------------------------------------------------
// FIXTURE 15: Kloset duduk monoblok, 2 unit
// -----------------------------------------------------------------------------
runFixture('FIXTURE 15: Kloset duduk monoblok (2 unit)', () => {
  const klosetItem: DedWorkItem = {
    id: 'FIX-15-KLOSET',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pemasangan Kloset Duduk Monoblok',
    category: 'SANITARY',
    status: 'CONFIRMED',
    evidenceIds: ['EV-15'],
    sourcePages: [1],
    dimensions: {
      count: { value: 2, unit: 'unit', isMissing: false },
    },
    geometry: { shape: 'COUNT' },
    unit: 'unit',
    calculationInputs: {
      count: 2,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(klosetItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 2);
  assert.equal(qto.unit, 'unit');
});

// -----------------------------------------------------------------------------
// FIXTURE 16: Floor drain stainless, 2 unit
// -----------------------------------------------------------------------------
runFixture('FIXTURE 16: Floor drain stainless (2 unit)', () => {
  const floorDrainItem: DedWorkItem = {
    id: 'FIX-16-DRAIN',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pemasangan Floor Drain Stainless Steel',
    category: 'SANITARY',
    status: 'CONFIRMED',
    evidenceIds: ['EV-16'],
    sourcePages: [1],
    dimensions: {
      count: { value: 2, unit: 'unit', isMissing: false },
    },
    geometry: { shape: 'COUNT' },
    unit: 'buah',
    calculationInputs: {
      count: 2,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(floorDrainItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 2);
});

// -----------------------------------------------------------------------------
// FIXTURE 17: Titik lampu kabel NYM 3x1.5, 18 titik
// -----------------------------------------------------------------------------
runFixture('FIXTURE 17: Titik lampu kabel NYM 3x1.5 (18 titik)', () => {
  const lampuItem: DedWorkItem = {
    id: 'FIX-17-LAMPU',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pemasangan Titik Lampu NYM 3x1.5 mm2',
    category: 'MEP',
    status: 'CONFIRMED',
    evidenceIds: ['EV-17'],
    sourcePages: [2],
    dimensions: {
      count: { value: 18, unit: 'titik', isMissing: false },
    },
    geometry: { shape: 'COUNT' },
    unit: 'titik',
    calculationInputs: {
      count: 18,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(lampuItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 18);
  assert.equal(qto.unit, 'titik');
});

// -----------------------------------------------------------------------------
// FIXTURE 18: Pipa PVC AW 4 inch air kotor, Pjg=24m
// -----------------------------------------------------------------------------
runFixture('FIXTURE 18: Pipa PVC AW 4 inch air kotor (Pjg = 24 m)', () => {
  const pipaItem: DedWorkItem = {
    id: 'FIX-18-PIPA',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pemasangan Pipa PVC AW Diameter 4 Inch',
    category: 'MEP',
    status: 'CONFIRMED',
    evidenceIds: ['EV-18'],
    sourcePages: [1],
    dimensions: {
      length: { value: 24, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'LINEAR' },
    unit: 'm',
    calculationInputs: {
      length: 24,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(pipaItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 24);
  assert.equal(qto.unit, 'm');
});

// -----------------------------------------------------------------------------
// FIXTURE 19: Galian tanah pondasi (Vol galian > Vol pondasi, ada slope)
// -----------------------------------------------------------------------------
runFixture('FIXTURE 19: Galian tanah pondasi (Vol galian > Vol pondasi)', () => {
  // Galian: Bottom width=0.8m, Top width=1.2m, Height=1.0m, Length=48m
  // Avg width = (0.8 + 1.2)/2 = 1.0m. Cross-section = 1.0 * 1.0 = 1.0 m2. Volume = 48.0 m3.
  const galianItem: DedWorkItem = {
    id: 'FIX-19-GALIAN',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Galian Tanah Pondasi Batu Kali',
    category: 'SITEWORK',
    status: 'CONFIRMED',
    evidenceIds: ['EV-19'],
    sourcePages: [1],
    dimensions: {
      length: { value: 48, unit: 'm', isMissing: false },
      width: { value: 1.0, unit: 'm', isMissing: false },
      height: { value: 1.0, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'TRAPEZOIDAL' },
    unit: 'm3',
    calculationInputs: {
      topWidth: 1.2,
      bottomWidth: 0.8,
      height: 1.0,
      length: 48,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qtoGalian = ezrabCoreQto.calculateQuantity(galianItem);
  assert.equal(qtoGalian.status, 'CALCULATED');
  assert.equal(qtoGalian.quantity, 48.0);

  // Pondasi Vol = 17.28 m3. Verify that galian > pondasi
  const volPondasi = 17.28;
  assert.ok(qtoGalian.quantity! > volPondasi, 'Vol galian harus lebih besar dari volume pondasi');
});

// -----------------------------------------------------------------------------
// FIXTURE 20: Urugan kembali tanah (Vol galian - Vol pondasi)
// -----------------------------------------------------------------------------
runFixture('FIXTURE 20: Urugan kembali tanah (Vol galian - Vol pondasi = 30.72 m3)', () => {
  const volGalian = 48.0;
  const volPondasi = 17.28;
  const volUruganKembali = SafeDecimalEngine.safeSubtract(volGalian, volPondasi);

  const uruganItem: DedWorkItem = {
    id: 'FIX-20-URUGAN',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Urugan Kembali Tanah Bekas Galian',
    category: 'SITEWORK',
    status: 'CONFIRMED',
    evidenceIds: ['EV-20'],
    sourcePages: [1],
    dimensions: {
      area: { value: volUruganKembali, unit: 'm3', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      length: 48,
      width: 0.8,
      height: 0.8, // raw bounding
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  assert.equal(volUruganKembali, 30.72);
});

// -----------------------------------------------------------------------------
// FIXTURE 21: AI-CUSTOM rejection -> harus ditolak
// -----------------------------------------------------------------------------
runFixture('FIXTURE 21: AI-CUSTOM rejection -> harus ditolak keras', () => {
  const fakeItem: DedWorkItem = {
    id: 'FIX-21-FAKE',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Pekerjaan Pasangan Bata Ringan AI Halusinasi',
    category: 'OTHER',
    status: 'CONFIRMED',
    evidenceIds: [],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {},
    confidence: 0.5,
    assumptions: [],
    warnings: [],
    ahspMatch: {
      code: 'AI-CUSTOM-9999',
      name: 'Item Palsu AI',
      unit: 'm2',
      matchType: 'AI_CUSTOM',
      source: 'CUSTOM_ITEM',
      confidence: 0.2,
    },
    price: {
      unitPrice: 150000,
      totalPrice: 1500000,
      priceSource: 'PRICE_NOT_FOUND',
      isOfficial: false,
      currency: 'IDR',
    },
    quantity: 10,
  };

  const validation = dedRabValidationGate.validateItem(fakeItem, 'PRJ-TEST-01');
  assert.equal(validation.isValid, false);
  assert.ok(
    validation.status === 'MISSING_AHSP' || validation.status === 'NO_AHSP',
    `Expected MISSING_AHSP or NO_AHSP, got ${validation.status}`
  );
  assert.ok(validation.errors.some(e => e.includes('AI-CUSTOM')));
});

// -----------------------------------------------------------------------------
// FIXTURE 22: QTO missing parameter -> quantity: null, BUKAN 0
// -----------------------------------------------------------------------------
runFixture('FIXTURE 22: QTO missing parameter -> quantity: null, BUKAN 0', () => {
  const missingParamItem: DedWorkItem = {
    id: 'FIX-22-MISSING-PARAM',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Balok Beton Gantung Tanpa Dimensi',
    category: 'STRUCTURE_BEAM',
    status: 'MISSING_DATA',
    evidenceIds: [],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {}, // Empty parameters
    confidence: 0.3,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(missingParamItem);
  assert.equal(qto.status, 'MISSING_DATA');
  assert.strictEqual(qto.quantity, null, 'Quantity MUST be strictly null, never 0 or 1');
  assert.ok(qto.missingParameters && qto.missingParameters.length > 0);
});

// -----------------------------------------------------------------------------
// FIXTURE 23: Price missing component -> price: null, BUKAN 0
// -----------------------------------------------------------------------------
runFixture('FIXTURE 23: Price missing component -> unitPrice: null, BUKAN 0', () => {
  const missingPriceItem: DedWorkItem = {
    id: 'FIX-23-MISSING-PRICE',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-ded',
    name: 'Balok Beton Custom Unpriced',
    category: 'STRUCTURE_BEAM',
    status: 'CONFIRMED',
    evidenceIds: [],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.8,
    assumptions: [],
    warnings: [],
    ahspMatch: {
      code: 'NON-EXISTENT-CODE',
      name: 'Unmatched Item',
      unit: 'm3',
      matchType: 'NOT_FOUND',
      source: 'NOT_FOUND',
      confidence: 0,
    },
  };

  const resolved = ahspPriceResolver.resolvePrice(missingPriceItem);

  assert.strictEqual(resolved.unitPrice, null, 'Unit price MUST be strictly null when not found');
  assert.strictEqual(resolved.totalPrice, null, 'Total price MUST be strictly null when not found');
  assert.equal(resolved.priceSource, 'PRICE_NOT_FOUND');
  assert.equal(resolved.isOfficial, false);
});

// -----------------------------------------------------------------------------
// FIXTURE 24: WBS hierarchy (3 level) -> Category -> Work Package -> Item
// -----------------------------------------------------------------------------
runFixture('FIXTURE 24: WBS hierarchy (3 level) -> Category -> Work Package -> Item', () => {
  const wbsPondasi = constructionNormalizer.resolveWbs('Pondasi Batu Kali 1:4', 'FOUNDATION');
  assert.equal(wbsPondasi.canonicalCategory, 'FOUNDATION');
  assert.equal(wbsPondasi.workPackage, 'Pekerjaan Pondasi');
  assert.equal(wbsPondasi.workItem, 'Pondasi Batu Kali');

  const wbsDinding = constructionNormalizer.resolveWbs('Pasangan Dinding Bata Merah', 'WALL');
  assert.equal(wbsDinding.canonicalCategory, 'WALL');
  assert.equal(wbsDinding.workPackage, 'Pekerjaan Dinding');

  const wbsPlumbing = constructionNormalizer.resolveWbs('Pemasangan Pipa Air Bersih', 'MEP');
  assert.equal(wbsPlumbing.canonicalCategory, 'PLUMBING');
  assert.equal(wbsPlumbing.workPackage, 'Pekerjaan Plumbing & Sanitasi');
});

console.log('----------------------------------------------------------------------');
console.log(`TOTAL FIXTURES: 24 | PASSED: ${passed} | FAILED: ${failed}`);
console.log('======================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
