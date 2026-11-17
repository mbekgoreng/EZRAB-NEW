/**
 * MASTER PRICING §7 — KOMPATIBILITAS + VALIDASI SATUAN (unit compatibility).
 *
 * Run: npx vitest run src/test/masterPricingUnitCompatibility.test.ts
 * Prerequisite: run AFTER `npm run price:pipeline` (§3) — the suite reads
 * the regenerated files (priceMaster + resourceIndex + price_rows) and
 * the canonical AHSP catalog.
 *
 * What is pinned here (and why each pin exists):
 * - (1) Canonical unit system: CanonicalUnitRegistry is the single
 *   dimension authority; the dimensional whitelist is EXACTLY the 3
 *   §6 pairs (ton↔kg, m↔cm, m³↔liter) — validated complete for the
 *   current catalog (a §7 sweep found ZERO genuine dimensional pairs
 *   unwhitelisted) and never duplicated (no second whitelist anywhere
 *   in the resolver layer). UNIT_MISMATCH stays F-016: NOT_FOUND +
 *   explanation, never a silent multiply, never Rp0.
 * - (2) OJ homonym: OJ-day vs OJ-hour are separated explicitly in the
 *   registry (OJ_DAY / OJ_HOUR) with documented bases, and the
 *   resolver carries a per-resolution OJ-basis flag. The §7 1:1 daily
 *   transfer (native-OJ query ≡ OH-day, factor 1) resolves the 67
 *   `Tukang Batu` @OJ rows null since §6 §2.1 — to the CK daily rate
 *   Rp145.000, never ÷7. The OH→OJ ÷N rule still applies ONLY to
 *   hourly-sense queries (raw `jam`) — the §6 §2.1 regression pin.
 * - (3) Same-unit OJ exposure (2.740 rows): every OJ binding is now
 *   basis-flagged — 1.750 BM-twin bindings (daily query, hourly
 *   record: basisMismatch) + 17 LABOR OJ bindings + 907 HSD OJ
 *   bindings (daily/daily, correct). Same-unit bindings are UNCHANGED
 *   by §7 — the flag marks them, it never re-prices them.
 * - (4) 51 spec conflicts (§6 §3.11): §7 does NOT implement a runtime
 *   spec gate (the §7 mandate is units, not specs) — the suite pins
 *   that the runtime resolver still imports NO spec-token function
 *   (the §6 (k) layering pin, re-asserted here) and that the 51
 *   bindings stand unchanged (E51/E69/M92 spot checks).
 * - (5) Threshold calibration: the threshold stays 0.34 (lowering it
 *   was measured UNSAFE — 0.30 admits a known-false binding) and
 *   parentheticals are NOT blanket-stripped (measured UNSOUND — 154
 *   flips, spec-carrying parens). ONLY `(Ready Mix)` is stripped at
 *   the gate: the 2 known-true M265 rows bind (Rp805.000), zero
 *   collateral.
 * - (6) Water: parenthetical unit annotations are stripped from name
 *   keys on both sides (`Air (m3)` → `Air`), so CK's own bulk record
 *   binds same-unit: exactly 4 rows move Rp200.000 → Rp50.000. The
 *   M170 @liter rows are unaffected. The 15 `Air Bersih` rows moved
 *   Rp550.000 → Rp7.500/m³ via adopsi pasar 2026-11-17 (MARKET_2026
 *   R032 direct record beats the §6 (c) liter→m³ conversion by the
 *   same-unit-first rule). `pc` is never stripped (Portland Cement).
 * - (7) location/period validation: strings (and other non-objects)
 *   are rejected with a descriptive TypeError — never silently
 *   dropped (location) or silently breaking resolution (period).
 * - (8) Empty units: UNIT_MISSING is flagged on the resolution +
 *   component (342 catalog components); the price outcome is
 *   unchanged and no unit is ever assumed.
 * - §14.3: unit-test pins for the conversion primitives (exact
 *   factors, same-unit null, unknown-unit null, never throws).
 *
 * Pinned prices/counts are OBSERVED values on the current data
 * (probed 2026-11-16 during the §7 audit), never invented. A pin that
 * moves means the data or the resolver changed — re-audit before
 * updating.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import {
  codeNameGate,
  CODE_NAME_GATE_THRESHOLD,
  DIMENSIONAL_CONVERSION_PAIRS,
  conversionForRecord,
  convertibleUnitsFor,
  stripReadyMixAnnotation,
  stripUnitAnnotation,
  isNativeOjQuery,
  isHourlyOjQuery,
  validateLocationPeriod,
  classifyOjQueryBasis,
  classifyOjRecordBasis,
  ojBasisFlagFor,
} from '../data/priceDatabase2026/centralResolution';
import {
  NAME_COMPATIBLE_THRESHOLD,
  nameSimilarity,
  unitConversionFactor,
} from '../data/priceDatabase2026/normalize';
import {
  canonicalUnitRegistry,
  CANONICAL_UNITS,
  OJ_BASIS_DEFINITIONS,
} from '../engine/pricing/canonical/canonicalUnitRegistry';
import { AHSP_2026_CANONICAL } from '../data/nationalCostDatabase/ahsp2026Canonical.generated';
import type { ResourcePriceQuery } from '../data/priceDatabase2026/types';

type Q = ResourcePriceQuery;
const q = (code: string, name: string, type: Q['resourceType'], unit: string, extra: Partial<Q> = {}) =>
  priceResolver2026.resolveResourcePrice({
    resourceCode: code,
    resourceName: name,
    resourceType: type,
    unit,
    ...extra,
  }) as any;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const readText = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

// ===========================================================================
// (1) Canonical unit system: single registry, one whitelist, UNIT_MISMATCH
// ===========================================================================

describe('(1) sistem satuan kanonis: registry tunggal + whitelist tunggal', () => {
  it('whitelist dimensi adalah TEPAT 3 pasang §6 — tidak ada whitelist kedua', () => {
    expect([...DIMENSIONAL_CONVERSION_PAIRS]).toEqual([
      ['ton', 'kg'],
      ['m', 'cm'],
      ['m3', 'liter'],
    ]);
  });

  it('registry adalah otoritas dimensi: ketiga pasang satu dimensi, lintas dimensi ditolak', () => {
    expect(canonicalUnitRegistry.getDimension('ton')).toBe('MASS');
    expect(canonicalUnitRegistry.getDimension('kg')).toBe('MASS');
    expect(canonicalUnitRegistry.getDimension('m')).toBe('LENGTH');
    expect(canonicalUnitRegistry.getDimension('cm')).toBe('LENGTH');
    expect(canonicalUnitRegistry.getDimension('m3')).toBe('VOLUME');
    expect(canonicalUnitRegistry.getDimension('liter')).toBe('VOLUME');
    expect(canonicalUnitRegistry.areDimensionallyCompatible('ton', 'kg')).toBe(true);
    expect(canonicalUnitRegistry.areDimensionallyCompatible('m', 'cm')).toBe(true);
    expect(canonicalUnitRegistry.areDimensionallyCompatible('m3', 'liter')).toBe(true);
    expect(canonicalUnitRegistry.areDimensionallyCompatible('kg', 'm3')).toBe(false);
    expect(canonicalUnitRegistry.areDimensionallyCompatible('kg', 'unit')).toBe(false);
    expect(canonicalUnitRegistry.areDimensionallyCompatible('m2', 'm3')).toBe(false);
  });

  it('normalize.ts unitConversionFactor tetap konservatif (1/null — bukan whitelist kedua)', () => {
    expect(unitConversionFactor('kg', 'kg')).toBe(1);
    expect(unitConversionFactor('kg', 'ton')).toBeNull();
    expect(unitConversionFactor('m3', 'liter')).toBeNull();
    expect(unitConversionFactor('OH', 'OJ')).toBeNull();
  });

  it('konversi whitelist dua arah dengan faktor eksak', () => {
    const rec = (unit: string) => ({ unit, notes: [] as string[] });
    expect(conversionForRecord(rec('kg'), 'ton')?.factor).toBe(1000);
    expect(conversionForRecord(rec('ton'), 'kg')?.factor).toBe(0.001);
    expect(conversionForRecord(rec('cm'), 'm')?.factor).toBe(100);
    expect(conversionForRecord(rec('m'), 'cm')?.factor).toBe(0.01);
    expect(conversionForRecord(rec('liter'), 'm3')?.factor).toBe(1000);
    expect(conversionForRecord(rec('m3'), 'liter')?.factor).toBe(0.001);
  });

  it('massa↔volume, luas↔volume, hitungan↔massa: TIDAK PERNAH konversi', () => {
    const rec = (unit: string) => ({ unit, notes: [] as string[] });
    expect(conversionForRecord(rec('kg'), 'm3')).toBeNull();
    expect(conversionForRecord(rec('m3'), 'kg')).toBeNull();
    expect(conversionForRecord(rec('m2'), 'm3')).toBeNull();
    expect(conversionForRecord(rec('kg'), 'unit')).toBeNull();
    expect(conversionForRecord(rec('sak'), 'kg')).toBeNull();
    expect(conversionForRecord(rec('set'), 'buah')).toBeNull();
    expect(conversionForRecord(rec('jam'), 'hari')).toBeNull();
  });

  it('UNIT_MISMATCH (F-016): status NOT_FOUND + penjelasan, bukan Rp0', () => {
    const r = q('M57A', 'Besi Beton', 'material', 'm3');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('UNIT_MISMATCH');
    expect(r.explanation).toContain('[kg]');
    expect(r.explanation).toContain('requires [m3]');
  });

  it('UNIT_MISMATCH juga untuk pasangan hitungan (set ≠ buah, unit ≠ set)', () => {
    // Dimensi COUNT yang sama belum berarti bisa dihargai: satu set
    // bukan satu buah. Sweep §7: 39 pasangan hitungan tak-ter-whitelist
    // tetap mismatch — benar, karena ekuivalensinya bergantung produk.
    const rec = (unit: string) => ({ unit, notes: [] as string[] });
    expect(conversionForRecord(rec('buah'), 'set')).toBeNull();
    expect(conversionForRecord(rec('set'), 'buah')).toBeNull();
    expect(conversionForRecord(rec('unit'), 'buah')).toBeNull();
    expect(conversionForRecord(rec('buah'), 'unit')).toBeNull();
  });
});

// ===========================================================================
// (2) OJ homonym: OJ-hari vs OJ-jam + transfer 1:1
// ===========================================================================

describe('(2) homonim OJ: pemisahan basis di registry + kesadaran resolver', () => {
  it('registry memisahkan OJ_DAY / OJ_HOUR sebagai satuan berbeda (LABOR_TIME)', () => {
    expect(CANONICAL_UNITS.OJ_DAY).toBeDefined();
    expect(CANONICAL_UNITS.OJ_HOUR).toBeDefined();
    expect(CANONICAL_UNITS.OJ_DAY.dimension).toBe('LABOR_TIME');
    expect(CANONICAL_UNITS.OJ_HOUR.dimension).toBe('LABOR_TIME');
    expect(canonicalUnitRegistry.getDimension('OJ_DAY')).toBe('LABOR_TIME');
    expect(canonicalUnitRegistry.getDimension('OJ_HOUR')).toBe('LABOR_TIME');
    expect(OJ_BASIS_DEFINITIONS.OJ_DAY.meaning).toContain('hari');
    expect(OJ_BASIS_DEFINITIONS.OJ_HOUR.meaning).toContain('jam');
  });

  it('OJ_DAY kompatibel dimensi dengan OH (identitas 1:1); normalize(OJ) TAK BERUBAH', () => {
    expect(canonicalUnitRegistry.areDimensionallyCompatible('OJ_DAY', 'OH')).toBe(true);
    expect(canonicalUnitRegistry.areDimensionallyCompatible('OJ_HOUR', 'OH')).toBe(true);
    // The bare OJ symbol keeps normalizing to itself — the resolver's
    // conversion + pool logic depends on it. §7 adds meanings, it does
    // not rename the label.
    expect(canonicalUnitRegistry.normalize('OJ')).toBe('OJ');
    expect(canonicalUnitRegistry.normalize('oj')).toBe('OJ');
    expect(canonicalUnitRegistry.normalize('OH')).toBe('OH');
  });

  it('klasifikasi basis kueri: raw OJ → DAY, raw jam → HOUR, tanpa raw → UNDOCUMENTED', () => {
    expect(classifyOjQueryBasis('OJ', 'OJ')).toBe('OJ_DAY');
    expect(classifyOjQueryBasis('OJ', 'oj')).toBe('OJ_DAY');
    expect(classifyOjQueryBasis('OJ', ' OJ ')).toBe('OJ_DAY');
    expect(classifyOjQueryBasis('OJ', 'jam')).toBe('OJ_HOUR');
    expect(classifyOjQueryBasis('OJ', 'Jam')).toBe('OJ_HOUR');
    expect(classifyOjQueryBasis('OJ')).toBe('OJ_UNDOCUMENTED');
    expect(classifyOjQueryBasis('OJ', null)).toBe('OJ_UNDOCUMENTED');
    // 'orangjam' literally says HOUR but is not the documented native
    // label — it fails closed (neither DAY nor HOUR is claimed).
    expect(classifyOjQueryBasis('OJ', 'orangjam')).toBe('OJ_UNDOCUMENTED');
    expect(classifyOjQueryBasis('OH', 'OJ')).toBeNull();
    expect(classifyOjQueryBasis('kg', 'OJ')).toBeNull();
  });

  it('klasifikasi basis record: HSD → DAY, LABOR/BM → HOUR, lain → UNDOCUMENTED', () => {
    expect(classifyOjRecordBasis('OJ', 'HSD_2026')).toBe('OJ_DAY');
    expect(classifyOjRecordBasis('OJ', 'LABOR_2026')).toBe('OJ_HOUR');
    expect(classifyOjRecordBasis('OJ', 'BM_HSD_2026')).toBe('OJ_HOUR');
    expect(classifyOjRecordBasis('OJ', 'CK_HSD_2026')).toBe('OJ_UNDOCUMENTED');
    expect(classifyOjRecordBasis('OJ', 'COMMERCIAL_2026')).toBe('OJ_UNDOCUMENTED');
    expect(classifyOjRecordBasis('OJ', null)).toBe('OJ_UNDOCUMENTED');
    expect(classifyOjRecordBasis('OH', 'HSD_2026')).toBeNull();
    expect(classifyOjRecordBasis('jam', 'BM_HSD_2026')).toBeNull();
  });

  it('isNativeOjQuery / isHourlyOjQuery: hanya bukti harfiah yang dihitung', () => {
    expect(isNativeOjQuery('OJ')).toBe(true);
    expect(isNativeOjQuery('oj')).toBe(true);
    expect(isNativeOjQuery('jam')).toBe(false);
    expect(isNativeOjQuery('orangjam')).toBe(false);
    expect(isNativeOjQuery(null)).toBe(false);
    expect(isNativeOjQuery(undefined)).toBe(false);
    expect(isHourlyOjQuery('jam')).toBe(true);
    expect(isHourlyOjQuery('Jam')).toBe(true);
    expect(isHourlyOjQuery('OJ')).toBe(false);
    expect(isHourlyOjQuery(null)).toBe(false);
  });

  it('transfer 1:1: conversionForRecord(OH → OJ native) = faktor 1, tanpa catatan jam', () => {
    // A same-scale identity needs NO work-hours note — the factor 1
    // does not depend on any hours-per-day. Even a noteless OH record
    // transfers (the CK record carries no workHoursPerDay note).
    const oh = { unit: 'OH', notes: [] as string[] };
    const c = conversionForRecord(oh, 'OJ', 'OJ');
    expect(c?.factor).toBe(1);
    expect(c?.basis).toContain('1:1');
    expect(c?.fromUnit).toBe('OH');
    expect(c?.toUnit).toBe('OJ');
  });

  it('regresi §6 §2.1: OH→OJ dari raw jam TETAP ÷N, tanpa raw TETAP null', () => {
    const oh7 = { unit: 'OH', notes: ['workHoursPerDay=7'] };
    expect(conversionForRecord(oh7, 'OJ', 'jam')?.factor).toBeCloseTo(1 / 7, 10);
    expect(conversionForRecord(oh7, 'OJ')).toBeNull();
    expect(conversionForRecord(oh7, 'OJ', null)).toBeNull();
    expect(conversionForRecord(oh7, 'OJ', 'orangjam')).toBeNull();
    // And OJ→OH still needs the documented note (BM twins never convert).
    expect(conversionForRecord({ unit: 'OJ', notes: [] }, 'OH')).toBeNull();
    expect(conversionForRecord({ unit: 'OJ', notes: ['workHoursPerDay=8'] }, 'OH')?.factor).toBe(8);
  });

  it('resolver: transfer 1:1 berkode (L.04) + tanpa kode → CK Rp145.000', () => {
    const coded = q('L.04', 'Tukang Batu', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(coded.status).toBe('RESOLVED');
    expect(coded.price).toBe(145000);
    expect(coded.unitConversion?.factor).toBe(1);
    expect(coded.source?.name).toContain('Cipta Karya');
    const codeless = q('', 'Tukang Batu', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(codeless.status).toBe('RESOLVED');
    expect(codeless.price).toBe(145000);
    expect(codeless.unitConversion?.factor).toBe(1);
    // The transfer is visible in the explanation, never silent.
    expect(coded.explanation).toContain('CONVERTED to OJ');
    expect(coded.explanation).toContain('1:1');
  });

  it('resolver: transfer TIDAK terjadi tanpa rawUnit (fail closed) — kueri langsung tanpa konteks', () => {
    const r = q('L.04', 'Tukang Batu', 'labor', 'OJ');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    // ...but the OJ flag still says the query is a daily-sense OJ
    // query whose basis is undocumented without a raw unit.
    expect(r.ojBasis?.queryBasis).toBe('OJ_UNDOCUMENTED');
  });

  it('resolver: raw jam tetap ÷7 (Rp25.000) — transfer tidak menyentuh jalur jam', () => {
    const r = q('L.04', 'Tukang Batu', 'labor', 'OJ', { rawUnit: 'jam' });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(25000);
    expect(r.unitConversion?.factor).toBeCloseTo(1 / 7, 10);
    expect(r.ojBasis?.queryBasis).toBe('OJ_HOUR');
  });

  it('flag ojBasis: HSD harian/harian cocok; twin BM mismatch; transfer tanpa record OJ', () => {
    // L.04 Mandor @OJ (raw OJ): HSD daily record — DAY/DAY, no mismatch.
    const hsd = q('L.04', 'Mandor', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(hsd.price).toBe(175000);
    expect(hsd.ojBasis?.queryBasis).toBe('OJ_DAY');
    expect(hsd.ojBasis?.recordBasis).toBe('OJ_DAY');
    expect(hsd.ojBasis?.basisMismatch).toBe(false);
    // L.01 Pekerja @OJ (raw OJ): BM twin wins by id tiebreak — DAY
    // query, HOUR record: the known underprice exposure, now flagged.
    const twin = q('L.01', 'Pekerja', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(twin.price).toBe(27643.54);
    expect(twin.ojBasis?.queryBasis).toBe('OJ_DAY');
    expect(twin.ojBasis?.recordBasis).toBe('OJ_HOUR');
    expect(twin.ojBasis?.basisMismatch).toBe(true);
    // Transfer rows: the record is OH, not OJ — recordBasis null.
    const tr = q('L.04', 'Tukang Batu', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(tr.ojBasis?.queryBasis).toBe('OJ_DAY');
    expect(tr.ojBasis?.recordBasis).toBeNull();
    expect(tr.ojBasis?.basisMismatch).toBe(false);
    // Non-OJ resolutions carry no flag at all.
    const kg = q('M57A', 'Besi Beton', 'material', 'kg');
    expect(kg.ojBasis).toBeNull();
  });

  it('ojBasisFlagFor: NOT_FOUND membawa basis kueri saja; harga proyek tanpa basis record', () => {
    const nf = ojBasisFlagFor(
      { unit: 'OJ', rawUnit: 'OJ' },
      { status: 'NOT_FOUND', unit: 'OJ', source: null, unitConversion: null }
    );
    expect(nf?.queryBasis).toBe('OJ_DAY');
    expect(nf?.recordBasis).toBeNull();
    expect(nf?.basisMismatch).toBe(false);
    const proj = ojBasisFlagFor(
      { unit: 'OJ', rawUnit: 'OJ' },
      { status: 'RESOLVED', unit: 'OJ', source: { key: 'SNAPSHOT_PRICE' } as any, unitConversion: null }
    );
    expect(proj?.queryBasis).toBe('OJ_DAY');
    expect(proj?.recordBasis).toBeNull();
    const none = ojBasisFlagFor(
      { unit: 'kg', rawUnit: 'kg' },
      { status: 'RESOLVED', unit: 'kg', source: { key: 'HSD_2026' } as any, unitConversion: null }
    );
    expect(none).toBeNull();
  });
});

// ===========================================================================
// (3) Paparan homonim OJ same-unit (2.740 baris) — katalog
// ===========================================================================

describe('(3) paparan OJ same-unit: 2.740 baris ter-flag basis (katalog)', () => {
  it('distribusi flag OJ katalog: 1.767 mismatch, 906 HSD harian/harian, 3 baris jam', () => {
    let totalOj = 0;
    let mismatch = 0;
    let dayDay = 0;
    let dayNull = 0;
    let hourQuery = 0;
    let hourDay = 0;
    let hourHour = 0;
    let hourNull = 0;
    for (const item of AHSP_2026_CANONICAL as any[]) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      for (const cat of [comp.labor, comp.material, comp.equipment]) {
        for (const c of cat.components as any[]) {
          if (!c.ojBasis) continue;
          totalOj++;
          if (c.ojBasis.queryBasis === 'OJ_HOUR') hourQuery++;
          if (c.ojBasis.basisMismatch) mismatch++;
          if (c.ojBasis.queryBasis === 'OJ_DAY' && c.ojBasis.recordBasis === 'OJ_DAY') dayDay++;
          if (c.ojBasis.queryBasis === 'OJ_DAY' && c.ojBasis.recordBasis === null) dayNull++;
          if (c.ojBasis.queryBasis === 'OJ_HOUR' && c.ojBasis.recordBasis === 'OJ_DAY') hourDay++;
          if (c.ojBasis.queryBasis === 'OJ_HOUR' && c.ojBasis.recordBasis === 'OJ_HOUR') hourHour++;
          if (c.ojBasis.queryBasis === 'OJ_HOUR' && c.ojBasis.recordBasis === null) hourNull++;
        }
      }
    }
    // 2.743 OJ rows in the catalog (2.740 raw OJ + 3 raw Jam). The
    // mismatch bucket (1.767) is 1.749 twin-DAY + 17 LABOR-DAY + 1
    // Jam-query bound to a daily HSD record (hourly query, daily
    // record — the reverse mismatch, a potential overprice). The 3
    // raw-Jam rows split 1/1/1 across HSD-hourly/unresolved. The
    // query-DAY/record-null bucket (68) holds the 67 transfer rows
    // (record is OH, not OJ) + 1 still-unresolved row (L.16 Tukang
    // pompa; the other unresolved OJ row, W `Jam Operasional…`, is a
    // Jam query counted in hourNull).
    expect(totalOj).toBe(2743);
    expect(mismatch).toBe(1767);
    expect(dayDay).toBe(906);
    expect(dayNull).toBe(68);
    expect(hourQuery).toBe(3);
    expect(hourDay).toBe(1);
    expect(hourHour).toBe(1);
    expect(hourNull).toBe(1);
  });

  it('ikatan same-unit OJ TIDAK BERUBAH harganya (§7 hanya menandai)', () => {
    // The twin binding still prices at the hourly twin rate — §7
    // flags the exposure, it does not re-price it. Re-pricing the
    // 1.750 twin rows is an owner decision (see the §7 report).
    const twin = q('L.01', 'Pekerja', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(twin.price).toBe(27643.54);
    const hsd = q('L.04', 'Mandor', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(hsd.price).toBe(175000);
    const labor = q('L29', 'Welding Inspector', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(labor.price).toBe(40000);
  });
});

// ===========================================================================
// (4) 51 konflik spesifikasi: §7 TIDAK memasang gerbang runtime
// ===========================================================================

describe('(4) 51 konflik spesifikasi (§6 §3.11): tanpa gerbang runtime §7', () => {
  it('resolver runtime tetap TIDAK mengimpor fungsi spec-token (pin layering §6 (k))', () => {
    // Same shape as the §6 (k) pin: the function NAMES must not appear
    // at all; the module name may appear in comments, but never in an
    // import (the §5.3 hierarchy stays pipeline-local).
    const resolverSrc = readText('src/data/priceDatabase2026/resolver.ts');
    const centralSrc = readText('src/data/priceDatabase2026/centralResolution.ts');
    const normalizeSrc = readText('src/data/priceDatabase2026/normalize.ts');
    for (const src of [resolverSrc, centralSrc, normalizeSrc]) {
      expect(src).not.toContain('extractSpecTokens');
      expect(src).not.toContain('specTokensCompatible');
      expect(src).not.toContain('specSetsCompatible');
      expect(src).not.toMatch(/from\s+['"][^'"]*matcherHardening['"]/);
      expect(src).not.toMatch(/from\s+['"][^'"]*reconciliationMatching['"]/);
    }
  });

  it('51 ikatan konflik BERDIRI apa adanya (keputusan owner — bukan diam-diam diubah §7)', () => {
    // Spot checks on the measured conflict groups (§7 Probe B): the
    // bindings stand exactly as §6 left them. E51 still overprices
    // 3.1× and M396ae 7.5× — that is the owner's decision to make
    // with the §7 measurement brief, not a §7 silent fix.
    const e51 = q('E51', 'Crane on Track 10-15 Ton', 'equipment', 'jam');
    expect(e51.price).toBe(2399218);
    const m92 = q('M92', 'Besi Beton', 'material', 'kg');
    expect(m92.status).toBe('RESOLVED');
  });
});

// ===========================================================================
// (5) Kalibrasi ambang 0,34 + M265
// ===========================================================================

describe('(5) kalibrasi ambang: 0,34 tetap; hanya (Ready Mix) yang di-strip', () => {
  it('ambang TIDAK BERUBAH: 0,34 di pipeline, gerbang, dan normalize', () => {
    expect(NAME_COMPATIBLE_THRESHOLD).toBe(0.34);
    expect(CODE_NAME_GATE_THRESHOLD).toBe(0.34);
    // Lowering it was measured UNSAFE (§7 sweep): 0.30 admits a
    // known-false binding, 0.25 admits three.
  });

  it('stripReadyMixAnnotation: hanya (Ready Mix) yang hilang, spesifikasi lain utuh', () => {
    expect(stripReadyMixAnnotation('Beton K-125 (Ready Mix)')).toBe('Beton K-125');
    expect(stripReadyMixAnnotation('Beton K-125 (ready mix)')).toBe('Beton K-125');
    expect(stripReadyMixAnnotation('Beton K-125 (READY MIX)')).toBe('Beton K-125');
    expect(stripReadyMixAnnotation('Beton K-125')).toBe('Beton K-125');
    // Spec-carrying parentheticals are NEVER stripped (blanket
    // stripping was measured UNSOUND — 154 flips).
    expect(stripReadyMixAnnotation('Tukang (anyam+isi batu)')).toBe('Tukang (anyam+isi batu)');
    expect(stripReadyMixAnnotation('Pipa (dia 20-50 mm)')).toBe('Pipa (dia 20-50 mm)');
    expect(stripReadyMixAnnotation('Air (m3)')).toBe('Air (m3)');
    expect(stripReadyMixAnnotation(null)).toBe('');
    expect(stripReadyMixAnnotation(undefined)).toBe('');
  });

  it('gerbang: M265 lolos sesudah strip; paren spesifikasi tetap menolak', () => {
    const m265 = codeNameGate('M265', 'Beton K-125 (Ready Mix)', 'Beton f`c 10 Mpa');
    expect(m265.allowed).toBe(true);
    expect(m265.reason).toBe('NAME_COMPATIBLE');
    expect(m265.similarity).toBe(0.5);
    // The blanket-strip false positive from the §7 sweep:
    // 'Tukang (anyam+isi batu)' vs 'Tukang las geotextile' would flip
    // 0.333 → 0.900 under blanket stripping. The gate must still
    // reject it — the paren carries the distinguishing spec.
    const spec = codeNameGate('L.04', 'Tukang (anyam+isi batu)', 'Tukang las geotextile');
    expect(spec.allowed).toBe(false);
    expect(spec.reason).toBe('NAME_MISMATCH');
    // Raw nameSimilarity is untouched by §7 (normalize.ts name
    // functions are off-limits): the dilution is still visible.
    expect(nameSimilarity('Beton K-125 (Ready Mix)', 'Beton f`c 10 Mpa')).toBeLessThan(0.34);
  });

  it('gerbang: label terblokir + kode pengecualian tetap berlaku sesudah strip', () => {
    expect(codeNameGate('M05', 'Beton K-125 (Ready Mix)', 'belum tersedia').allowed).toBe(false);
    expect(codeNameGate('M05', 'Beton K-125 (Ready Mix)', 'belum tersedia').reason).toBe('BLOCKED_LABEL');
    expect(codeNameGate('M05', null, 'Semen').allowed).toBe(false);
    expect(codeNameGate('M05', null, 'Semen').reason).toBe('EXCEPTION_CODE_NEEDS_NAME');
  });

  it('resolver: kedua baris M265 resolve Rp805.000 (9.4.(21a)/(21b))', () => {
    expect(q('M265', 'Beton K-125 (Ready Mix)', 'material', 'm3').price).toBe(805000);
    const items = (AHSP_2026_CANONICAL as any[]).filter((it) => it.code === '9.4.(21a)' || it.code === '9.4.(21b)');
    expect(items).toHaveLength(2);
    for (const item of items) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      const m265 = comp.material.components.find((c: any) => c.itemCode === 'M265');
      expect(m265?.unitPrice).toBe(805000);
    }
  });
});

// ===========================================================================
// (6) Air: strip anotasi satuan dalam nama
// ===========================================================================

describe('(6) air: token satuan dalam nama di-strip (bug normalisasi)', () => {
  it('stripUnitAnnotation: hanya paren token satuan yang hilang', () => {
    expect(stripUnitAnnotation('Air (m3)')).toBe('Air');
    expect(stripUnitAnnotation('Kayu balok 6/15 kelas II (batang)')).toBe('Kayu balok 6/15 kelas II');
    expect(stripUnitAnnotation('Pipa PVC AW Ø 1/2" (m)')).toBe('Pipa PVC AW Ø 1/2"');
    expect(stripUnitAnnotation('Mesin bor (jam)')).toBe('Mesin bor');
    expect(stripUnitAnnotation('Paku sekrup (buah)')).toBe('Paku sekrup');
    expect(stripUnitAnnotation('Baja ringan C75 x 1,00 mm (m)')).toBe('Baja ringan C75 x 1,00 mm');
    // Non-unit parens are specification, not annotation — untouched.
    expect(stripUnitAnnotation('Tukang (anyam+isi batu)')).toBe('Tukang (anyam+isi batu)');
    expect(stripUnitAnnotation('Beton K-125 (Ready Mix)')).toBe('Beton K-125 (Ready Mix)');
    expect(stripUnitAnnotation('Tanah liat (quarry)')).toBe('Tanah liat (quarry)');
    // 'pc' is Portland Cement, never a piece token.
    expect(stripUnitAnnotation('Semen PC (pc)')).toBe('Semen PC (pc)');
    // Bare trailing tokens are NOT stripped (dimensions, not annotations).
    expect(stripUnitAnnotation('Bata merah 5 x 11 x 22 cm')).toBe('Bata merah 5 x 11 x 22 cm');
    expect(stripUnitAnnotation('Air m3')).toBe('Air m3');
    expect(stripUnitAnnotation(null)).toBe('');
    expect(stripUnitAnnotation(undefined)).toBe('');
  });

  it('resolver: Air @m3 kini mengikat bulk CK Rp50.000 (same-unit, tanpa konversi)', () => {
    const r = q('M170', 'Air', 'material', 'm3');
    expect(r.price).toBe(50000);
    expect(r.unitConversion).toBeNull();
    expect(r.resourceName).toBe('Air (m3)');
    const codeless = q('', 'Air', 'material', 'm3');
    expect(codeless.price).toBe(50000);
    expect(codeless.resourceName).toBe('Air (m3)');
  });

  it('resolver: Air Bersih (Rp7.500 pasar langsung) + Air @liter TIDAK terpengaruh strip', () => {
    // Adopsi pasar 2026-11-17: M.21 resolves Rp7.500/m³ via the direct
    // MARKET_2026 record (same-unit-first beats the §6 (c) liter→m³
    // conversion Rp550.000, which survives as fallback — see the
    // centralResolution conversion test). The strip behaviour itself is
    // unchanged: 'Air Bersih' carries no unit token to strip.
    expect(q('M.21', 'Air Bersih', 'material', 'm3').price).toBe(7500);
    expect(q('M170', 'Air', 'material', 'liter').price).toBe(19900);
  });

  it('resolver: pool gabungan mesin bor tetap dimenangkan CK Rp85.000 (domain tier)', () => {
    // The strip merges 'Mesin bor (jam)' into the 5-record
    // 'mesin bor|jam' pool — the CK-domain query must still win the
    // CK record, not the BM/EQUIPMENT records.
    const r = q('', 'Mesin bor (jam)', 'equipment', 'jam', { domain: 'CIPTA_KARYA' } as any);
    expect(r.price).toBe(85000);
    expect(r.resourceName).toBe('Mesin bor (jam)');
    // And the 66 coded BM 'Mesin bor' rows still bind by code, untouched.
    expect(q('E71', 'Mesin bor', 'equipment', 'jam').price).toBe(63691.07);
  });

  it('katalog: tepat 4 baris Air @m3 memakai bulk Rp50.000', () => {
    const rows: string[] = [];
    for (const item of AHSP_2026_CANONICAL as any[]) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      for (const cat of [comp.labor, comp.material, comp.equipment]) {
        for (const c of cat.components as any[]) {
          if (c.itemName === 'Air' && c.unit === 'm3' && c.unitPrice === 50000) {
            rows.push(`${item.code}::${c.itemCode || '-'}`);
          }
        }
      }
    }
    expect(rows.sort()).toEqual([
      '7.14.(1)::M170',
      '9.3.5.1::-',
      '9.3.5.2::-',
      '9.3.5.3::-',
    ]);
  });
});

// ===========================================================================
// (7) Validasi runtime location/period
// ===========================================================================

describe('(7) validasi location/period: string ditolak, jangan diam-diam', () => {
  it('location string/angka/array → TypeError deskriptif', () => {
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { location: 'JAWA_TIMUR' } as any)).toThrow(TypeError);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { location: 'JAWA_TIMUR' } as any)).toThrow(/location must be an object/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { location: 123 } as any)).toThrow(TypeError);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { location: ['JAWA_TIMUR'] } as any)).toThrow(TypeError);
  });

  it('period string/angka/tahun-string/bulan-di-luar-rentang → TypeError deskriptif', () => {
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: '2026' } as any)).toThrow(/period must be an object/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: 2026 } as any)).toThrow(/period must be an object/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: '2026' } } as any)).toThrow(/period\.year must be an integer/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026.5 } } as any)).toThrow(/period\.year must be an integer/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: {} } as any)).toThrow(/period\.year must be an integer/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026, month: 13 } } as any)).toThrow(/period\.month must be an integer 1–12/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026, month: 0 } } as any)).toThrow(/period\.month must be an integer 1–12/);
    expect(() => q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026, month: 'Jan' } } as any)).toThrow(/period\.month must be an integer 1–12/);
  });

  it('location/period terstruktur yang valid TIDAK throw; kebijakan strict lama tetap berlaku', () => {
    // Structured objects never throw — validation only rejects
    // malformed shapes. (A province request WITHOUT the opt-in
    // fallback is NOT_FOUND under the pre-existing strict location
    // policy — that is §6 policy, not a validation failure.)
    const withPeriod = q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026 } } as any);
    expect(withPeriod.status).toBe('RESOLVED');
    expect(withPeriod.price).toBe(200000);
    const withMonth = q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026, month: 1 } } as any);
    expect(withMonth.status).toBe('RESOLVED');
    const withNullMonth = q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026, month: null } } as any);
    expect(withNullMonth.status).toBe('RESOLVED');
    const withLocFallback = q('M09', 'Pasir Pasang', 'material', 'm3', {
      location: { provinceName: 'Jawa Timur' },
      allowLocationFallback: true,
    } as any);
    expect(withLocFallback.status).toBe('RESOLVED');
    expect(withLocFallback.price).toBe(200000);
    const plain = q('M09', 'Pasir Pasang', 'material', 'm3');
    expect(plain.status).toBe('RESOLVED');
    expect(plain.price).toBe(withPeriod.price);
  });

  it('validateLocationPeriod langsung: null/undefined = absen (boleh)', () => {
    expect(() => validateLocationPeriod({})).not.toThrow();
    expect(() => validateLocationPeriod({ location: null, period: null } as any)).not.toThrow();
    expect(() => validateLocationPeriod({ location: {}, period: { year: 2026 } } as any)).not.toThrow();
    expect(() => validateLocationPeriod({ location: { provinceName: 1 } } as any)).toThrow(/location\.provinceName must be a string/);
  });
});

// ===========================================================================
// (8) Satuan kosong: flag UNIT_MISSING
// ===========================================================================

describe('(8) satuan kosong: flag UNIT_MISSING, jangan pernah asumsikan', () => {
  it('kueri tanpa satuan ter-flag unitMissing — resolve maupun NOT_FOUND', () => {
    // 'Pasir pasang' with no unit still resolves by name (CK m3
    // record) — but the missing unit is now flagged, not silent.
    const resolved = q('', 'Pasir pasang', 'material', '');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.unitMissing).toBe(true);
    const notFound = q('', 'Nama Yang Tidak Ada §7', 'material', '');
    expect(notFound.status).toBe('NOT_FOUND');
    expect(notFound.price).toBeNull();
    expect(notFound.unitMissing).toBe(true);
    // A unit-bearing query is not flagged.
    const withUnit = q('', 'Pasir pasang', 'material', 'm3');
    expect(withUnit.unitMissing).toBe(false);
  });

  it('katalog: 2 komponen bersatuan kosong ter-flag; 2 resolve, sisanya null jujur', () => {
    let flagged = 0;
    let resolved = 0;
    const resolvedNames: string[] = [];
    for (const item of AHSP_2026_CANONICAL as any[]) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      for (const cat of [comp.labor, comp.material, comp.equipment]) {
        for (const c of cat.components as any[]) {
          if (!c.unitMissing) continue;
          flagged++;
          if (c.unitPrice !== null) {
            resolved++;
            resolvedNames.push(c.itemName);
          }
        }
      }
    }
    expect(flagged).toBe(2);
    expect(resolved).toBe(2);
    expect(resolvedNames.sort()).toEqual(['Media Tanam', 'Tukang pipa']);
  });
});

// ===========================================================================
// §14.3 — unit-test primitif konversi
// ===========================================================================

describe('§14.3 primitif konversi: eksak, null aman, tidak pernah throw', () => {
  it('faktor eksak tanpa drift float (1000 / 0.001 / 100 / 0.01)', () => {
    const rec = (unit: string) => ({ unit, notes: [] as string[] });
    expect(conversionForRecord(rec('kg'), 'ton')?.factor).toBe(1000);
    expect(conversionForRecord(rec('ton'), 'kg')?.factor).toBe(0.001);
    expect(conversionForRecord(rec('cm'), 'm')?.factor).toBe(100);
    expect(conversionForRecord(rec('m'), 'cm')?.factor).toBe(0.01);
    // Round-trip is exact: kg→ton→kg returns the price.
    const up = conversionForRecord(rec('kg'), 'ton')!.factor;
    const down = conversionForRecord(rec('ton'), 'kg')!.factor;
    expect(up * down).toBe(1);
  });

  it('pasangan satuan sama → null (tidak ada konversi yang dibutuhkan)', () => {
    const rec = (unit: string) => ({ unit, notes: [] as string[] });
    for (const u of ['kg', 'ton', 'm', 'cm', 'm3', 'liter', 'OH', 'OJ', 'buah', 'jam']) {
      expect(conversionForRecord(rec(u), u)).toBeNull();
    }
  });

  it('satuan tak-dikenal / kosong → null, bukan throw', () => {
    const rec = (unit: string) => ({ unit, notes: [] as string[] });
    expect(() => conversionForRecord(rec('satuan-aneh-§7'), 'kg')).not.toThrow();
    expect(conversionForRecord(rec('satuan-aneh-§7'), 'kg')).toBeNull();
    expect(conversionForRecord(rec('kg'), 'satuan-aneh-§7')).toBeNull();
    expect(conversionForRecord(rec(''), 'kg')).toBeNull();
    expect(conversionForRecord(rec('kg'), '')).toBeNull();
    expect(() => convertibleUnitsFor('satuan-aneh-§7')).not.toThrow();
    expect(convertibleUnitsFor('satuan-aneh-§7')).toEqual([]);
    expect(() => classifyOjQueryBasis('satuan-aneh-§7', 'OJ')).not.toThrow();
    expect(classifyOjQueryBasis('satuan-aneh-§7', 'OJ')).toBeNull();
  });

  it('parseWorkHoursPerDay menolak nilai absurd (di luar 1–24)', () => {
    const rec = (notes: string[]) => ({ unit: 'OJ', notes });
    expect(conversionForRecord(rec(['workHoursPerDay=0']), 'OH')).toBeNull();
    expect(conversionForRecord(rec(['workHoursPerDay=25']), 'OH')).toBeNull();
    expect(conversionForRecord(rec(['workHoursPerDay=abc']), 'OH')).toBeNull();
  });
});

// ===========================================================================
// A/B katalog §7: tepat 73 baris berubah, 11 item kembali FULL
// ===========================================================================

describe('A/B katalog §7: perubahan perilaku terukur penuh', () => {
  it('tepat 67 baris transfer 1:1, semuanya Tukang Batu @Rp145.000', () => {
    let transferRows = 0;
    let transferTotal = 0;
    for (const item of AHSP_2026_CANONICAL as any[]) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      for (const cat of [comp.labor, comp.material, comp.equipment]) {
        for (const c of cat.components as any[]) {
          const conv = c.unitConversion;
          if (conv && conv.factor === 1 && conv.fromUnit === 'OH' && conv.toUnit === 'OJ') {
            transferRows++;
            expect(c.itemName).toBe('Tukang Batu');
            expect(c.unitPrice).toBe(145000);
            expect(conv.basis).toContain('1:1');
            transferTotal += (c.coefficient || 0) * 145000;
          }
        }
      }
    }
    expect(transferRows).toBe(67);
    // Exact: Rp2.029.898,50 (sits exactly on the .5 boundary — pin
    // the raw sum, not a rounding convention).
    expect(transferTotal).toBeCloseTo(2029898.5, 9);
  });

  it('11 item kembali FULL sesudah transfer (8.1.3.1–10 + A.3.09.2a.7)', () => {
    const eleven = [
      '8.1.3.1', '8.1.3.2', '8.1.3.3', '8.1.3.4', '8.1.3.5',
      '8.1.3.6', '8.1.3.7', '8.1.3.8', '8.1.3.9', '8.1.3.10',
      'A.3.09.2a.7',
    ];
    for (const code of eleven) {
      const item = (AHSP_2026_CANONICAL as any[]).find((it) => it.code === code);
      expect(item).toBeDefined();
      expect(priceResolver2026.resolveAhspUnitPrice(item).pricingStatus).toBe('FULL');
    }
  });

  it('status komposisi katalog pasca-adopsi pasar ronde 2 2026-11-17: FULL 2.823 / PARTIAL 2.151 / MISSING 827', () => {
    // Resource-only A/B (Probe A): FULL 2.165 → 2.176 (+11 transfer),
    // PARTIAL 2.799 → 2.788, MISSING 57, NOCOMP 780. The composition
    // loop adds the DHSP/baked fallback (+6 FULL via hspPrice on
    // otherwise-unresolved items): 2.182 / 2.788 / 831 of 5.801.
    // Adopsi pasar 2026-11-17 (589 baris material baru ter-resolve):
    // FULL 2.182 → 2.358 (+176), PARTIAL 2.788 → 2.615 (−173),
    // MISSING 831 → 828 (−3). MISSING counts the 780 NOCOMP items.
    // Adopsi pasar ronde 2 2026-11-17 (332 record baru + perbaikan
    // koefisien 0.0 + unit-fix): FULL 2.358 → 2.823 (+465), PARTIAL
    // 2.615 → 2.151 (−464), MISSING 828 → 827 (−1).
    const counts = { FULL: 0, PARTIAL: 0, MISSING: 0 };
    for (const item of AHSP_2026_CANONICAL as any[]) {
      counts[priceResolver2026.resolveAhspUnitPrice(item).pricingStatus as keyof typeof counts]++;
    }
    expect(counts).toEqual({ FULL: 2823, PARTIAL: 2151, MISSING: 827 });
    expect(counts.FULL + counts.PARTIAL + counts.MISSING).toBe(5801);
  });

  it('recordCount 4.936 (899 priceMaster + 3.323 CK + 694 BM + 20 OJ twin; §7 tidak menambah/menghapus record)', () => {
    expect(priceResolver2026.recordCount).toBe(4936);
  });
});
