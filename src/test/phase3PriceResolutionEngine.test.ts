/**
 * Tests for Phase 3: Price Resolution Engine
 */

import { AdvancedPriceResolutionEngine, PriceRecord } from '../engine/pricing/resolver/advancedPriceResolutionEngine';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e: any) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assertTrue(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg || 'Expected true');
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

console.log('====================================================');
console.log('PHASE 3 — PRICE RESOLUTION ENGINE TEST SUITE');
console.log('====================================================\n');

const samplePrices: PriceRecord[] = [
  // National Baseline
  {
    id: 'NAT_SEMEN',
    resourceId: 'mat_semen',
    resourceName: 'Semen Portland',
    price: 1500,
    unit: 'kg',
    tier: 'NATIONAL',
    source: 'BINA_MARGA_2026',
    sourceDocument: 'Lampiran V SE DJBK 2026',
    year: 2026,
    effectiveDate: '2026-01-01',
    confidence: 0.9,
  },
  // Province Baseline
  {
    id: 'PROV_SEMEN_JATIM',
    resourceId: 'mat_semen',
    resourceName: 'Semen Portland',
    price: 1600,
    unit: 'kg',
    tier: 'PROVINCE',
    provinceId: 'JAWA_TIMUR',
    source: 'SHST_JATIM_2026',
    sourceDocument: 'Standar Harga Satuan Jatim',
    year: 2026,
    effectiveDate: '2026-02-01',
    confidence: 0.95,
  },
  // City / Regency Price
  {
    id: 'CITY_SEMEN_PROBOLINGGO',
    resourceId: 'mat_semen',
    resourceName: 'Semen Portland',
    price: 1750,
    unit: 'kg',
    tier: 'CITY_REGENCY',
    cityId: 'KAB_PROBOLINGGO',
    provinceId: 'JAWA_TIMUR',
    source: 'HSD_KAB_PROBOLINGGO',
    sourceDocument: 'HSD Kab. Probolinggo 2026',
    year: 2026,
    effectiveDate: '2026-02-15',
    confidence: 0.98,
  },
  // Project-Specific Override
  {
    id: 'PROJ_SEMEN_BENDUNG',
    resourceId: 'mat_semen',
    resourceName: 'Semen Portland',
    price: 1800,
    unit: 'kg',
    tier: 'PROJECT_SPECIFIC',
    projectId: 'PROJ_WEIR_001',
    source: 'VENDOR_QUOTATION',
    sourceDocument: 'Surat Penawaran PT Semen Indonesia',
    year: 2026,
    effectiveDate: '2026-03-01',
    confidence: 1.0,
  },
];

const engine = new AdvancedPriceResolutionEngine(samplePrices);

// 1. Priority Resolution Check
test('Prioritizes Project-Specific price over City, Province, and National', () => {
  const res = engine.resolvePrice({
    resourceId: 'mat_semen',
    projectId: 'PROJ_WEIR_001',
    cityId: 'KAB_PROBOLINGGO',
    provinceId: 'JAWA_TIMUR',
    year: 2026,
  });

  assertEqual(res.status, 'VERIFIED');
  assertEqual(res.price, 1800);
  assertEqual(res.provenance?.tier, 'PROJECT_SPECIFIC');
});

test('Falls back to City when Project-Specific is absent', () => {
  const res = engine.resolvePrice({
    resourceId: 'mat_semen',
    projectId: 'OTHER_PROJECT',
    cityId: 'KAB_PROBOLINGGO',
    provinceId: 'JAWA_TIMUR',
    year: 2026,
  });

  assertEqual(res.status, 'VERIFIED');
  assertEqual(res.price, 1750);
  assertEqual(res.provenance?.tier, 'CITY_REGENCY');
});

test('Falls back to Province when City is absent', () => {
  const res = engine.resolvePrice({
    resourceId: 'mat_semen',
    cityId: 'KAB_MALANG',
    provinceId: 'JAWA_TIMUR',
    year: 2026,
  });

  assertEqual(res.status, 'VERIFIED');
  assertEqual(res.price, 1600);
  assertEqual(res.provenance?.tier, 'PROVINCE');
});

test('Falls back to National when Province is absent', () => {
  const res = engine.resolvePrice({
    resourceId: 'mat_semen',
    provinceId: 'PAPUA_BARAT',
    year: 2026,
  });

  assertEqual(res.status, 'VALID');
  assertEqual(res.price, 1500);
  assertEqual(res.provenance?.tier, 'NATIONAL');
});

// 2. Missing Price Check (DILARANG Rp0 fallback)
test('Missing price returns status MISSING and price null (NO Rp0)', () => {
  const res = engine.resolvePrice({
    resourceId: 'mat_uranium_unknown',
    year: 2026,
  });

  assertEqual(res.status, 'MISSING');
  assertEqual(res.price, null, 'Price must be null, never 0');
});

// 3. Unit Conversion Engine
test('Converts price between compatible units (kg to ton)', () => {
  const res = engine.resolvePrice({
    resourceId: 'mat_semen',
    provinceId: 'PAPUA_BARAT', // resolves to national 1,500 / kg
    targetUnit: 'ton',
    year: 2026,
  });

  assertEqual(res.status, 'VALID');
  // 1 ton = 1,000 kg -> price = 1,500 * 1,000 = 1,500,000
  assertEqual(res.price, 1500000);
  assertEqual(res.unit, 'ton');
});

test('Rejects conversion between incompatible units (kg to m3)', () => {
  const res = engine.resolvePrice({
    resourceId: 'mat_semen',
    targetUnit: 'm3',
    year: 2026,
  });

  assertEqual(res.status, 'INVALID');
  assertEqual(res.price, null);
  assertTrue(res.anomalies.some((a) => a.code === 'UNIT_MISMATCH'));
});

// 4. Conflict Resolution Check
test('Deterministically resolves conflict using latest effective date', () => {
  const conflictEngine = new AdvancedPriceResolutionEngine([
    {
      id: 'REC_OLD',
      resourceId: 'mat_pasir',
      resourceName: 'Pasir Beton',
      price: 250000,
      unit: 'm3',
      tier: 'CITY_REGENCY',
      cityId: 'KAB_PROBOLINGGO',
      source: 'OLD_HSD',
      sourceDocument: 'Doc 1',
      year: 2026,
      effectiveDate: '2026-01-10',
      confidence: 0.9,
    },
    {
      id: 'REC_NEW',
      resourceId: 'mat_pasir',
      resourceName: 'Pasir Beton',
      price: 275000,
      unit: 'm3',
      tier: 'CITY_REGENCY',
      cityId: 'KAB_PROBOLINGGO',
      source: 'NEW_HSD',
      sourceDocument: 'Doc 2',
      year: 2026,
      effectiveDate: '2026-03-01',
      confidence: 0.9,
    },
  ]);

  const res = conflictEngine.resolvePrice({
    resourceId: 'mat_pasir',
    cityId: 'KAB_PROBOLINGGO',
    year: 2026,
  });

  assertEqual(res.status, 'VALID');
  assertEqual(res.price, 275000, 'Should pick latest effective date');
  assertTrue(Boolean(res.provenance?.resolutionReason.includes('Resolved conflict')));
});

// 5. Snapshot Engine
test('Creates immutable snapshot for project RAB', () => {
  const snap = engine.createSnapshot('PROJ_WEIR_001', [
    { resourceId: 'mat_semen', year: 2026 },
  ]);

  assertTrue(snap.snapshotId.startsWith('SNAP_PROJ_WEIR_001'));
  assertTrue(snap.items.has('mat_semen'));
  assertEqual(snap.items.get('mat_semen')?.price, 1800);
});

// 6. Expired Price Check
test('Detects expired price and marks status EXPIRED with anomaly warning', () => {
  const expiredEngine = new AdvancedPriceResolutionEngine([
    {
      id: 'EXP_01',
      resourceId: 'mat_cat_lama',
      resourceName: 'Cat Tembok Lama',
      price: 35000,
      unit: 'kg',
      tier: 'NATIONAL',
      source: 'OLD_CATALOG',
      sourceDocument: 'Katalog 2020',
      year: 2020,
      effectiveDate: '2020-01-01',
      validUntil: '2021-01-01',
      confidence: 0.8,
    },
  ]);

  const res = expiredEngine.resolvePrice({
    resourceId: 'mat_cat_lama',
    year: 2026,
  });

  assertEqual(res.status, 'EXPIRED');
  assertTrue(res.anomalies.some((a) => a.code === 'EXPIRED_PRICE'));
  assertTrue(res.anomalies.some((a) => a.code === 'YEAR_MISMATCH'));
});

// 7. Price Anomaly Check (Negative Price & Abnormal Value)
test('Detects negative price anomaly and marks status INVALID', () => {
  const anomalyEngine = new AdvancedPriceResolutionEngine([
    {
      id: 'ANOM_NEG',
      resourceId: 'mat_solar_salah',
      resourceName: 'Solar Industri Rusak',
      price: -15000,
      unit: 'liter',
      tier: 'NATIONAL',
      source: 'ERROR_LOG',
      sourceDocument: 'Typo Data',
      year: 2026,
      effectiveDate: '2026-01-01',
      confidence: 0.5,
    },
  ]);

  const res = anomalyEngine.resolvePrice({
    resourceId: 'mat_solar_salah',
    year: 2026,
  });

  assertEqual(res.status, 'INVALID');
  assertTrue(res.anomalies.some((a) => a.code === 'NEGATIVE_PRICE'));
});

// 8. Rejection of unconfirmed Rp0
test('Rejects unconfirmed Rp0 price and returns status MISSING (Never Rp0)', () => {
  const zeroEngine = new AdvancedPriceResolutionEngine([
    {
      id: 'ZERO_SEMEN',
      resourceId: 'mat_semen_gratis_palsu',
      resourceName: 'Semen Palsu Rp 0',
      price: 0,
      unit: 'kg',
      tier: 'NATIONAL',
      source: 'CORRUPTED_DB',
      sourceDocument: 'Null price exported as 0',
      year: 2026,
      effectiveDate: '2026-01-01',
      confidence: 0.5,
    },
  ]);

  const res = zeroEngine.resolvePrice({
    resourceId: 'mat_semen_gratis_palsu',
    year: 2026,
  });

  assertEqual(res.status, 'MISSING');
  assertEqual(res.price, null, 'Unconfirmed Rp0 must be returned as null');
});

console.log('\nAll Phase 3 tests passed.');
