/**
 * MASTER PRICING §6 — RESOLUSI HARGA TERPUSAT (central resolution).
 *
 * Run: npx vitest run src/test/masterPricingCentralResolution.test.ts
 * Prerequisite: run AFTER `npm run price:pipeline` (§3) — the suite reads
 * the regenerated files (priceMaster + resourceIndex + price_rows) and
 * the canonical AHSP catalog.
 *
 * What is pinned here (and why each pin exists):
 * - (a) Name gate on code resolution (D3, threshold 0.34 = pipeline):
 *   L10/L11 no longer bind to Sopir/Kenek; legit bindings survive; BM
 *   exception codes (M05/E41/E07/E11) need a name; blocked labels never
 *   bind; a partial gate rejection is VISIBLE in the explanation.
 * - (b) Project pricing context: LIVE / SNAPSHOT_PRICE / PROJECT_OVERRIDE
 *   at the resolver and at the canonical wrapper (Step 0 snapshot,
 *   Step 1 skip under SNAPSHOT). Old callers without context keep the
 *   historical LIVE behaviour.
 * - (c) Dimensional conversion whitelist + the OJ↔OH work-hours basis.
 *   The OJ↔OH conversion is ASYMMETRIC: OJ→OH always applies on a
 *   documented basis; OH→OJ divides ONLY when the query OJ is
 *   hourly-sense (raw unit `jam`) — a native-OJ query is a DAY (§5 §8),
 *   and dividing a daily price by 7 was a measured 7× underprice
 *   (L.04 Tukang Batu @OJ went Rp175.000 → Rp25.000 before the §6
 *   finisher fix; §6 then failed closed with NOT_FOUND, and §7
 *   applies the documented 1:1 daily transfer instead — L.04 resolves
 *   to the CK daily rate Rp145.000, factor 1, never ÷7).
 * - (d) invalidateAhspCache() + version-keyed cache.
 * - (e) §6.3 fields: canonicalEntityId / originalAhspSourcePrice /
 *   priceDifference on resources and on compositions (incl. the SMKK
 *   baked-price fallback).
 * - (f) recordCount == the real index size (4.489).
 * - (g) DHSP rewire to dhspMapReader: resolver == reader for EVERY
 *   catalog item (officialDhspPrice + provenanceSource) — the §6
 *   rewire is behavior-preserving, and this test is the guard.
 * - (h) NEEDS_REVIEW flags ride on resolutions (84 flagged keys).
 * - (i) Underspecified keys: REFUSE (M241/EI734/EI734/generic `Beton`,
 *   code-wide — a M241|cm query must not convert around the refusal)
 *   and FLAG (M12|kg resolves with an explicit marker).
 * - (j) RETAIL in the price-type vocabulary (guard list + derive +
 *   pipeline stamp + SQL CHECK): 3 verified-retailer rows stamp
 *   RETAIL; 0/899 priceMaster records carry it.
 * - (k) Layering: the runtime resolver imports NO spec-token function
 *   (the §5.3 hierarchy stays pipeline-local); the name gate uses
 *   nameSimilarity at the pipeline threshold. Measured limitation:
 *   51 pre-existing spec-conflicting bindings (E69/M92/E51/M315…)
 *   survive the gate — the gate never created one, and closing them
 *   is a §7/owner decision, not a §6 fix.
 * - §14.2 propagation: one price change (via OVERRIDE context — the
 *   testable injection point; true master mutation needs pipeline
 *   regeneration) reaches every linked CK/BM/SDA/SMKK component;
 *   totals recompute; coefficients never move; provenance of
 *   non-overridden components stays intact.
 * - §14.5 integrity: missing ≠ Rp0; multi-region; multi-date;
 *   conflicting sources; market reference; manual; official
 *   provenance; incompatible units.
 *
 * Pinned prices are OBSERVED values on the current data (probed
 * 2026-11-16 during the §6 audit), never invented. A pin that moves
 * means the data or the resolver changed — re-audit before updating.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import {
  codeNameGate,
  queryNameHasEvidence,
  CODE_NAME_GATE_THRESHOLD,
  BM_CODE_GATE_EXCEPTIONS,
  conversionForRecord,
  convertibleUnitsFor,
  parseWorkHoursPerDay,
  resolvePricingMode,
  contextCodeKey,
  contextNameKey,
  lookupContextPrice,
  buildComponentPriceRef,
} from '../data/priceDatabase2026/centralResolution';
import {
  NAME_COMPATIBLE_THRESHOLD,
  nameSimilarity,
} from '../data/priceDatabase2026/normalize';
import {
  componentKeyFor,
  getNeedsReviewFlag,
  getAllNeedsReviewEntries,
  getUnderspecifiedRule,
  getAllUnderspecifiedEntries,
  NEEDS_REVIEW_REGISTRY_STATS,
} from '../data/priceDatabase2026/needsReviewRegistry';
import { getDhspEntry, getDhspPrice, getDhspMapSizes } from '../data/nationalCostDatabase/dhspMapReader';
import { OFFICIAL_CK_2026_DHSP_MAP } from '../data/nationalCostDatabase/officialCiptaKaryaDhsp2026';
import { OFFICIAL_BM_2026_DHSP_MAP } from '../data/nationalCostDatabase/binaMarga2026Adapter';
import { AHSP_2026_CANONICAL } from '../data/nationalCostDatabase/ahsp2026Canonical.generated';
import { CanonicalPriceResolver } from '../engine/pricing/canonical/canonicalPriceResolver';
import {
  MASTER_PRICE_TYPE_VALUES,
  isMasterPriceType,
  derivePriceType,
} from '../engine/pricing/admin/masterPriceRecord';
import type { ResourcePriceQuery } from '../data/priceDatabase2026/types';
import { specTokensCompatible, extractSpecTokens } from '../../scripts/price2026/matcherHardening';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const readText = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;

type Q = ResourcePriceQuery;
const q = (code: string, name: string, type: Q['resourceType'], unit: string, extra: Partial<Q> = {}) =>
  priceResolver2026.resolveResourcePrice({
    resourceCode: code,
    resourceName: name,
    resourceType: type,
    unit,
    ...extra,
  }) as any;

// ===========================================================================
// (a) Name gate
// ===========================================================================

describe('(a) gerbang nama pada resolusi kode', () => {
  it('ambang gerbang == ambang pipeline (0.34)', () => {
    expect(CODE_NAME_GATE_THRESHOLD).toBe(0.34);
    expect(CODE_NAME_GATE_THRESHOLD).toBe(NAME_COMPATIBLE_THRESHOLD);
  });

  it('codeNameGate: nama tak-cocok ditolak, nama cocok lolos', () => {
    const rejected = codeNameGate('L.10', 'Akhli Madya Lingkungan', 'Sopir');
    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toBe('NAME_MISMATCH');
    expect(rejected.similarity).toBe(0);
    const passed = codeNameGate('L.10', 'Sopir', 'Sopir');
    expect(passed.allowed).toBe(true);
    expect(passed.reason).toBe('NAME_COMPATIBLE');
    expect(passed.similarity).toBe(1);
  });

  it('L.10 Akhli Madya Lingkungan TIDAK LAGI resolve ke Sopir Rp200.000', () => {
    const r = q('L.10', 'Akhli Madya Lingkungan', 'labor', 'OH');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.price).not.toBe(0);
    expect(r.explanation).toContain('NAME_GATE');
    expect(r.explanation).toContain('NAME_MISMATCH');
  });

  it('L.11 Teknisi Lapangan TIDAK LAGI resolve ke Kenek Rp135.000', () => {
    const r = q('L.11', 'Teknisi Lapangan', 'labor', 'OH');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('NAME_GATE');
  });

  it('ikatan sah tetap lolos: Sopir Rp200.000, Kenek Rp135.000', () => {
    expect(q('L.10', 'Sopir', 'labor', 'OH').price).toBe(200000);
    expect(q('L.11', 'Kenek', 'labor', 'OH').price).toBe(135000);
    expect(q('L.01', 'Pekerja', 'labor', 'OH').price).toBe(100000);
  });

  it('M09 dual-price: nama yang membedakan — Timbunan Pilihan vs Pasir Pasang', () => {
    // The SAME code M09 means two materials in two families; the name
    // gate is what separates them (no gate → one wrong winner).
    expect(q('M09', 'Timbunan Pilihan', 'material', 'm3').price).toBe(25000);
    expect(q('M09', 'Pasir Pasang', 'material', 'm3').price).toBe(200000);
  });

  it('pengecualian BM: dengan nama resolve, tanpa nama NOT_FOUND', () => {
    expect(BM_CODE_GATE_EXCEPTIONS.has('M05')).toBe(true);
    expect(BM_CODE_GATE_EXCEPTIONS.has('E41')).toBe(true);
    expect(BM_CODE_GATE_EXCEPTIONS.has('E07')).toBe(true);
    expect(BM_CODE_GATE_EXCEPTIONS.has('E11')).toBe(true);
    expect(q('E07', 'Crane On Track 10-15 Ton', 'equipment', 'jam').price).toBe(773917.31);
    expect(q('E11', 'Flat Bed Truck', 'equipment', 'jam').price).toBe(410265.86);
    expect(q('M05', 'Abu Terbang', 'material', 'kg').price).toBe(700);
    expect(q('E41', 'Asphalt Distributor', 'equipment', 'jam').price).toBe(441600.84);
    for (const [code, type, unit] of [
      ['E07', 'equipment', 'jam'],
      ['E11', 'equipment', 'jam'],
      ['M05', 'material', 'kg'],
      ['E41', 'equipment', 'jam'],
    ] as const) {
      const r = q(code, '', type, unit);
      expect(r.status).toBe('NOT_FOUND');
      expect(r.price).toBeNull();
      expect(r.explanation).toContain('EXCEPTION_CODE_NEEDS_NAME');
    }
  });

  it('label terblokir tidak pernah mengikat (BLOCKED_LABEL)', () => {
    const d = codeNameGate('M99', 'Something', 'belum tersedia - test');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('BLOCKED_LABEL');
  });

  it('kueri tanpa nama lolos vakum (NO_NAME_TO_CHECK) — keterbatasan terdokumentasi', () => {
    // With no name there is nothing to gate on: the code binds at face
    // value. This is a KNOWN limitation (an SDA L.10 component with an
    // empty name still resolves to Sopir) — pinned so a future fix
    // changes it deliberately, not silently.
    expect(queryNameHasEvidence('L.10', '')).toBe(false);
    expect(queryNameHasEvidence('L.10', 'L.10')).toBe(false);
    expect(queryNameHasEvidence('L.10', 'Sopir')).toBe(true);
    const r = q('L.10', '', 'labor', 'OH');
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(200000);
  });

  it('penolakan parsial TERCATAT di penjelasan hasil resolve (E23)', () => {
    // The gate rejected the old winner ('Jam Watertank Truck', sim
    // 0.33) and the winner fell through to 'jam WATER TANK TRUCK'
    // (sim 0.90): Rp500.906,19 → Rp500.906 — same product, 0.19
    // rounding difference. Before the §6 finisher fix the explanation
    // said NOTHING about the rejection.
    const r = q('E23', 'Water Tank Truck', 'equipment', 'jam');
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(500906);
    expect(r.explanation).toContain('NAME_GATE');
    expect(r.explanation).toContain('Jam Watertank Truck');
  });

  it('gerbang menutup harga salah di katalog: M275c, E78, M81c', () => {
    // Spot-checks from the full-catalog A/B sweep (HEAD vs §6): these
    // components bound to wrong-named records in HEAD and are null now.
    const cases: Array<[string, string, Q['resourceType'], string]> = [
      ['M275c', '114 mm', 'material', 'm'],
      ['E78', 'Vibratory Roller', 'equipment', 'jam'],
      ['M81c', 'mm', 'material', 'bh'],
    ];
    for (const [code, name, type, unit] of cases) {
      const r = q(code, name, type, unit);
      expect(r.price).toBeNull();
    }
  });

  it('false negative gerbang DIPERBAIKI §7: "Beton K-125 (Ready Mix)" kini resolve Rp805.000', () => {
    // K-125 IS fc'10 MPa — the M265 binding was CORRECT, but the
    // '(Ready Mix)' suffix diluted the similarity to 0.333, just under
    // the 0.34 threshold (bare 'Beton K-125' scores 0.5 and binds).
    // §6 pinned this as a KNOWN false negative for §7; §7 fixes it
    // with the NARROW `(Ready Mix)`-only strip in the gate (a
    // delivery-form annotation, not grade identity — the sweep proved
    // exactly 2 flips, both known-true, zero collateral). The raw
    // nameSimilarity is UNCHANGED (0.333 < 0.34 — normalize.ts name
    // functions are untouched by §7); only the gate compares stripped
    // names. BM 9.4.(21a)/(21b) regain their correct Rp805.000.
    expect(nameSimilarity('Beton K-125 (Ready Mix)', 'Beton f`c 10 Mpa')).toBeLessThan(0.34);
    expect(nameSimilarity('Beton K-125', 'Beton f`c 10 Mpa')).toBe(0.5);
    expect(q('M265', 'Beton K-125 (Ready Mix)', 'material', 'm3').price).toBe(805000);
    expect(q('M265', 'Beton K-125', 'material', 'm3').price).toBe(805000);
  });
});

// ===========================================================================
// (b) Project pricing context
// ===========================================================================

describe('(b) konteks harga proyek LIVE / SNAPSHOT / OVERRIDE', () => {
  it('resolvePricingMode: tanpa konteks = LIVE_MASTER_PRICE', () => {
    expect(resolvePricingMode()).toBe('LIVE_MASTER_PRICE');
    expect(resolvePricingMode(null)).toBe('LIVE_MASTER_PRICE');
    expect(resolvePricingMode({})).toBe('LIVE_MASTER_PRICE');
    expect(resolvePricingMode({ pricingMode: 'SNAPSHOT_PRICE' })).toBe('SNAPSHOT_PRICE');
    expect(resolvePricingMode({ pricingMode: 'PROJECT_OVERRIDE' })).toBe('PROJECT_OVERRIDE');
  });

  it('lookupContextPrice: kunci kode dulu, lalu kunci nama', () => {
    const ref = {
      pricesByComponentKey: { 'M57A|kg': 15000, 'besi beton|kg': 14000, 'pasir pasang|m3': 210000 },
      label: 'test',
    };
    expect(lookupContextPrice(ref, 'M57A', 'Besi Beton', 'kg')).toBe(15000);
    expect(lookupContextPrice(ref, '', 'Pasir Pasang', 'm3')).toBe(210000);
    expect(lookupContextPrice(ref, 'ZZZ', 'Tidak Ada', 'm3')).toBeNull();
    expect(lookupContextPrice(null, 'M57A', 'Besi Beton', 'kg')).toBeNull();
    expect(contextCodeKey('M57A', 'kg')).toBe('M57A|kg');
    expect(contextNameKey('Besi Beton', 'kg')).toBe('besi beton|kg');
  });

  it('buildComponentPriceRef: harga non-positif dilewati, tulis pertama menang', () => {
    const ref = buildComponentPriceRef(
      [
        { code: 'M09', name: 'Pasir Pasang', unit: 'm3', unitPrice: 30000 },
        { code: 'M09', name: 'Pasir Pasang', unit: 'm3', unitPrice: 99999 },
        { code: 'L01', name: 'Pekerja', unit: 'OH', unitPrice: 0 },
        { code: 'E07', name: 'Crane', unit: 'jam', unitPrice: null },
        { code: 'E07', name: 'Crane', unit: 'jam', unitPrice: -5 },
      ],
      { label: 'test' }
    );
    expect(ref.pricesByComponentKey['M09|m3']).toBe(30000);
    expect(ref.pricesByComponentKey['L01|OH']).toBeUndefined();
    expect(ref.pricesByComponentKey['E07|jam']).toBeUndefined();
  });

  it('SNAPSHOT: harga beku menjawab; miss jatuh ke live', () => {
    const snap = buildComponentPriceRef(
      [{ code: 'M09', name: 'Timbunan Pilihan', unit: 'm3', unitPrice: 30000 }],
      { label: 'SNAP-1' }
    );
    const hit = q('M09', 'Timbunan Pilihan', 'material', 'm3', {
      pricingContext: { pricingMode: 'SNAPSHOT_PRICE', snapshotRef: snap },
    });
    expect(hit.price).toBe(30000);
    expect(hit.pricingMode).toBe('SNAPSHOT_PRICE');
    // A snapshot miss falls through to live resolution (never invented).
    const miss = q('E07', 'Crane On Track 10-15 Ton', 'equipment', 'jam', {
      pricingContext: { pricingMode: 'SNAPSHOT_PRICE', snapshotRef: snap },
    });
    expect(miss.price).toBe(773917.31);
    expect(miss.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(miss.explanation).toContain('no stored price for this component');
  });

  it('OVERRIDE: harga proyek mengganti harga live', () => {
    const ovr = buildComponentPriceRef(
      [{ code: 'M09', name: 'Timbunan Pilihan', unit: 'm3', unitPrice: 27500 }],
      { label: 'OVR-1' }
    );
    const r = q('M09', 'Timbunan Pilihan', 'material', 'm3', {
      pricingContext: { pricingMode: 'PROJECT_OVERRIDE', overrideRef: ovr },
    });
    expect(r.price).toBe(27500);
    expect(r.pricingMode).toBe('PROJECT_OVERRIDE');
  });

  it('harga konteks eksplisit mengalahkan penolakan REFUSE (harga tersimpan, bukan tebakan)', () => {
    // A snapshot/override price is an EXPLICIT stored price for the
    // component — it answers before the underspecified-key refusal,
    // because the project has already decided what the component costs.
    const snap = buildComponentPriceRef(
      [{ code: 'M241', name: 'Pipa Baja', unit: 'm', unitPrice: 190000 }],
      { label: 'SNAP-M241' }
    );
    const r = q('M241', 'Pipa Baja', 'material', 'm', {
      pricingContext: { pricingMode: 'SNAPSHOT_PRICE', snapshotRef: snap },
    });
    expect(r.price).toBe(190000);
  });

  it('pemanggil lama tanpa konteks tetap LIVE (perilaku historis)', () => {
    const r = q('M09', 'Timbunan Pilihan', 'material', 'm3');
    expect(r.price).toBe(25000);
    expect(r.pricingMode).toBe('LIVE_MASTER_PRICE');
  });
});

describe('(b) pembungkus canonical: Step 0 snapshot + Step 1', () => {
  const cpr = CanonicalPriceResolver.getInstance();

  it('Step 0: snapshot menjawab (harga dalam rentang wajar)', () => {
    const r = cpr.resolve({
      code: 'M09',
      name: 'Pasir Pasang',
      unit: 'm3',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: { pricesByComponentKey: { 'M09|m3': 250000 }, label: 'snap-test' },
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(250000);
    expect(r.source).toBe('SNAPSHOT_PRICE');
    expect(r.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(r.resolutionPath.some((p) => p.startsWith('SNAPSHOT_PRICE_RESOLVED'))).toBe(true);
  });

  it('Step 0: harga snapshot di bawah batas wajar DITOLAK gerbang kewarasan', () => {
    const r = cpr.resolve({
      code: 'M09',
      name: 'Pasir Pasang',
      unit: 'm3',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: { pricesByComponentKey: { 'M09|m3': 31000 }, label: 'snap-test' },
    });
    expect(r.status).toBe('INVALID');
    expect(r.price).toBeNull();
    expect(r.resolutionPath.some((p) => p.startsWith('PRICE_SANITY_REJECTED_ON_SNAPSHOT'))).toBe(true);
  });

  it('Step 0 miss jatuh ke live dengan catatan jalur', () => {
    const r = cpr.resolve({
      code: 'M09',
      name: 'Pasir Pasang',
      unit: 'm3',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: { pricesByComponentKey: { 'XXX|m3': 1 }, label: 'snap-miss' },
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(200000);
    expect(r.resolutionPath.some((p) => p.startsWith('SNAPSHOT_MISS_FALL_THROUGH_TO_LIVE'))).toBe(true);
  });

  it('mode default = LIVE_MASTER_PRICE; PROJECT_OVERRIDE tanpa projectId jatuh ke live', () => {
    const live = cpr.resolve({ code: 'M09', name: 'Pasir Pasang', unit: 'm3' });
    expect(live.pricingMode).toBe('LIVE_MASTER_PRICE');
    expect(live.price).toBe(200000);
    const noId = cpr.resolve({
      code: 'M09',
      name: 'Pasir Pasang',
      unit: 'm3',
      pricingMode: 'PROJECT_OVERRIDE',
    });
    expect(noId.price).toBe(200000);
    expect(noId.resolutionPath).toContain('PROJECT_OVERRIDE_NO_PROJECT_ID_FALL_THROUGH_TO_LIVE');
  });

  it('Step 1 dilewati di bawah SNAPSHOT_PRICE (snapshot beku, bukan live)', () => {
    // With a snapshot hit, resolution returns at Step 0 — the path
    // never mentions a project override, even with a projectId set.
    const r = cpr.resolve({
      code: 'M09',
      name: 'Pasir Pasang',
      unit: 'm3',
      projectId: 'PRJ-TEST-§6',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: { pricesByComponentKey: { 'M09|m3': 250000 }, label: 'snap-test' },
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(250000);
    expect(r.resolutionPath.some((p) => p.includes('PROJECT_OVERRIDE'))).toBe(false);
  });
});

// ===========================================================================
// (c) Unit conversion
// ===========================================================================

describe('(c) konversi satuan dimensi + OJ↔OH', () => {
  const rec = (unit: string, notes?: string[]) => ({ unit, notes: notes ?? [] });

  it('parseWorkHoursPerDay hanya dari catatan terdokumentasi', () => {
    expect(parseWorkHoursPerDay(rec('OJ', ['workHoursPerDay=7']))).toBe(7);
    expect(parseWorkHoursPerDay(rec('OJ', ['workHoursPerDay = 8']))).toBe(8);
    expect(parseWorkHoursPerDay(rec('OJ', []))).toBeNull();
    expect(parseWorkHoursPerDay(rec('OJ', ['no note here']))).toBeNull();
  });

  it('konversi dimensi: ton↔kg, m↔cm, m³↔liter dua arah', () => {
    expect(conversionForRecord(rec('kg'), 'ton')?.factor).toBe(1000);
    expect(conversionForRecord(rec('ton'), 'kg')?.factor).toBe(0.001);
    expect(conversionForRecord(rec('m'), 'cm')?.factor).toBe(0.01);
    expect(conversionForRecord(rec('cm'), 'm')?.factor).toBe(100);
    expect(conversionForRecord(rec('liter'), 'm3')?.factor).toBe(1000);
    expect(conversionForRecord(rec('m3'), 'liter')?.factor).toBe(0.001);
  });

  it('OJ→OH mengalikan jam kerja; OH→OJ ÷N bila raw jam, 1:1 bila raw OJ (§7)', () => {
    const oj7 = rec('OJ', ['workHoursPerDay=7']);
    expect(conversionForRecord(oj7, 'OH')?.factor).toBe(7);
    const oh7 = rec('OH', ['workHoursPerDay=7']);
    // Hourly-sense query OJ (raw unit `jam`): divide.
    expect(conversionForRecord(oh7, 'OJ', 'jam')?.factor).toBeCloseTo(1 / 7, 10);
    // Native-OJ (daily) query: NEVER divide — a daily OH price IS the
    // daily OJ price. §6 failed closed here (null); §7 applies the
    // documented 1:1 daily transfer (OJ-day ≡ OH-day, §5 §8 + HSD).
    // Dividing was the 7× underprice (Rp175.000 → Rp25.000) the §6
    // finisher fix closed — the factor is 1, never 1/7.
    const transfer = conversionForRecord(oh7, 'OJ', 'OJ');
    expect(transfer?.factor).toBe(1);
    expect(transfer?.basis).toContain('1:1');
    // Unknown sense (no raw unit): fail closed.
    expect(conversionForRecord(oh7, 'OJ')).toBeNull();
    expect(conversionForRecord(oh7, 'OJ', null)).toBeNull();
  });

  it('convertibleUnitsFor mencerminkan asimetri yang sama', () => {
    expect(convertibleUnitsFor('OH')).toContain('OJ');
    expect(convertibleUnitsFor('OJ', 'jam')).toContain('OH');
    // §7: a native-OJ query offers OH for the 1:1 daily transfer.
    expect(convertibleUnitsFor('OJ', 'OJ')).toContain('OH');
    expect(convertibleUnitsFor('OJ')).not.toContain('OH');
    expect(convertibleUnitsFor('ton')).toContain('kg');
    expect(convertibleUnitsFor('m3')).toContain('liter');
  });

  it('massa↔volume, satuan sama, dan record tanpa catatan: null', () => {
    expect(conversionForRecord(rec('kg'), 'm3')).toBeNull();
    expect(conversionForRecord(rec('m3'), 'kg')).toBeNull();
    expect(conversionForRecord(rec('kg'), 'kg')).toBeNull();
    // BM OJ twins carry NO workHoursPerDay note: their hourly basis is
    // not documented on the record, so they never convert.
    expect(conversionForRecord(rec('OJ', []), 'OH')).toBeNull();
  });

  it('resolver: L29|OH ×8 (Welding Inspector Rp40.000 OJ → Rp320.000)', () => {
    const r = q('L29', 'Welding Inspector', 'labor', 'OH');
    expect(r.price).toBe(320000);
    expect(r.unitConversion?.factor).toBe(8);
    expect(r.unitConversion?.fromUnit).toBe('OJ');
    expect(r.unitConversion?.toUnit).toBe('OH');
  });

  it('resolver: L08|OH ×8 (Mekanik Rp300.000)', () => {
    expect(q('L08', 'Mekanik', 'labor', 'OH').price).toBe(300000);
  });

  it('resolver: M57A|ton = Rp15.000.000 (kg→ton ×1000, HSD)', () => {
    const r = q('M57A', 'Besi Beton', 'material', 'ton');
    expect(r.price).toBe(15000000);
    expect(r.unitConversion?.factor).toBe(1000);
  });

  it('resolver: L.04 Tukang Batu @OJ native TRANSFER 1:1 ke Rp145.000 (§7, TIDAK dibagi 7)', () => {
    // §6 failed closed here (NOT_FOUND) after the finisher fix closed
    // the 7× underprice. §7 applies the documented 1:1 daily transfer:
    // a native-OJ query is a day (§5 §8), and the CK daily rate for
    // the same role (Rp145.000) IS the daily OJ price. The price is
    // 145.000 — never 25.000 (÷7).
    const r = q('L.04', 'Tukang Batu', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(145000);
    expect(r.unitConversion?.factor).toBe(1);
    expect(r.unitConversion?.fromUnit).toBe('OH');
    expect(r.unitConversion?.toUnit).toBe('OJ');
    expect(r.unitConversion?.basis).toContain('1:1');
  });

  it('resolver: L.04 Tukang Batu @OJ dari raw jam DIBAGI 7 (hourly-sense)', () => {
    const r = q('L.04', 'Tukang Batu', 'labor', 'OJ', { rawUnit: 'jam' });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(25000);
    expect(r.unitConversion?.factor).toBeCloseTo(1 / 7, 10);
  });

  it('resolver: massa↔volume ditolak, bukan Rp0 (status NOT_FOUND + UNIT_MISMATCH di penjelasan)', () => {
    // Design (F-016): the status stays NOT_FOUND so the component
    // lands in `missing` and the composition is PARTIAL — the WHY
    // (UNIT_MISMATCH + available units) lives in the explanation.
    const r = q('M57A', 'Besi Beton', 'material', 'm3');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('UNIT_MISMATCH');
    expect(r.explanation).toContain('[kg]');
  });

  it('resolver: M.21 Air Bersih kini Rp7.500/m³ via record pasar langsung; konversi liter→m³ tetap jadi fallback', () => {
    // Adopsi pasar 2026-11-17: a bulk 'Air Bersih' record now exists
    // (MARKET_2026 R032 'Air bersih (air tanah)' Rp7.500/m³, DIRECT
    // median bersumber) — the same-unit-first rule serves it directly,
    // so the §6 (c) liter→m³ conversion (Rp550/liter × 1000 =
    // Rp550.000/m³) no longer wins for M.21. The conversion itself is
    // preserved as fallback: excluding the market record restores it.
    const direct = q('M.21', 'Air Bersih', 'material', 'm3');
    expect(direct.price).toBe(7500);
    expect(direct.unitConversion).toBeNull();
    expect(direct.source?.key).toBe('MARKET_2026');
    // The key record serves both the code path and the bare-name path
    // (its NAME_KEY companion is keyed under the 'Air bersih (air
    // tanah)' variant name). Excluding the key record restores the
    // §6 (c) conversion — the fallback is preserved, not deleted.
    const converted = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M.21',
      resourceName: 'Air Bersih',
      resourceType: 'material',
      unit: 'm3',
      excludeRecordIds: new Set([direct.recordId!]),
    });
    expect(converted.price).toBe(550000);
    expect(converted.unitConversion?.fromUnit).toBe('liter');
    expect(converted.unitConversion?.toUnit).toBe('m3');
    expect(converted.unitConversion?.factor).toBe(1000);
    // §6 pinned M170 'Air' @m3 = Rp200.000 (liter conversion) and
    // flagged the §7 question: CK's own bulk 'Air (m3)' record is
    // Rp50.000/m³ but never bound, because the redundant `(m3)` token
    // in its name broke exact-name matching (`air m3` ≠ `air`). §7
    // strips parenthetical unit annotations from both sides, so the
    // same-unit bulk record now binds — the resolver's normal
    // same-unit-first rule, not a price decision.
    const r = q('M170', 'Air', 'material', 'm3');
    expect(r.price).toBe(50000);
    expect(r.unitConversion).toBeNull();
    expect(r.resourceName).toBe('Air (m3)');
  });
});

// ===========================================================================
// (d) Cache invalidation
// ===========================================================================

describe('(d) invalidateAhspCache + version-key', () => {
  const fixture: any = {
    code: 'FIX-§6-CACHE',
    name: 'Fixture cache',
    unit: 'm3',
    domain: 'CIPTA_KARYA',
    materialComponents: [{ code: 'M09', name: 'Pasir Pasang', unit: 'm3', coefficient: 1 }],
    laborComponents: [],
    equipmentComponents: [],
  };

  it('kueri default yang sama mengembalikan objek yang sama (cache)', () => {
    const a = priceResolver2026.resolveAhspUnitPrice(fixture);
    const b = priceResolver2026.resolveAhspUnitPrice(fixture);
    expect(b).toBe(a);
  });

  it('invalidateAhspCache menaikkan versi + memaksa hitung ulang', () => {
    const before = priceResolver2026.resolveAhspUnitPrice(fixture);
    const v0 = priceResolver2026.getCacheVersion();
    priceResolver2026.invalidateAhspCache();
    expect(priceResolver2026.getCacheVersion()).toBe(v0 + 1);
    const after = priceResolver2026.resolveAhspUnitPrice(fixture);
    expect(after).not.toBe(before);
    expect(after.unitPrice).toBe(before.unitPrice);
  });

  it('kueri berkonteks TIDAK PERNAH memakai cache default', () => {
    const ctx = {
      pricingMode: 'SNAPSHOT_PRICE' as const,
      snapshotRef: { pricesByComponentKey: { 'M09|m3': 30000 }, label: 'snap-cache' },
    };
    const a = priceResolver2026.resolveAhspUnitPrice(fixture, { pricingContext: ctx });
    const b = priceResolver2026.resolveAhspUnitPrice(fixture, { pricingContext: ctx });
    expect(a.unitPrice).toBe(30000);
    expect(b).not.toBe(a);
    // And a context answer must never leak into the default cache.
    const live = priceResolver2026.resolveAhspUnitPrice(fixture);
    expect(live.unitPrice).toBe(200000);
  });
});

// ===========================================================================
// (e) §6.3 fields
// ===========================================================================

describe('(e) field §6.3: canonicalEntityId / originalAhspSourcePrice / priceDifference', () => {
  it('resolusi resource: echo harga sumber + selisih', () => {
    const r = q('M09', 'Timbunan Pilihan', 'material', 'm3', { originalAhspSourcePrice: 20000 });
    expect(r.price).toBe(25000);
    expect(r.originalAhspSourcePrice).toBe(20000);
    expect(r.priceDifference).toBe(5000);
  });

  it('canonicalEntityId = resourceId bila terikat priceMaster; null bila CK/BM langsung', () => {
    const bound = q('M57A', 'Besi Beton', 'material', 'ton');
    expect(bound.canonicalEntityId).toBe('RES-001241');
    const direct = q('M09', 'Pasir Pasang', 'material', 'm3');
    expect(direct.canonicalEntityId).toBeNull();
  });

  it('komposisi: field §6.3 dibawa dari harga baked komponen', () => {
    const item: any = {
      code: 'FIX-§6-6.3',
      name: 'Fixture §6.3',
      unit: 'm3',
      domain: 'CIPTA_KARYA',
      materialComponents: [
        { code: 'M09', name: 'Pasir Pasang', unit: 'm3', coefficient: 1, unitPrice: 20000 },
      ],
      laborComponents: [],
      equipmentComponents: [],
    };
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const c0 = (comp as any).material.components[0];
    expect(c0.unitPrice).toBe(200000);
    expect(c0.originalAhspSourcePrice).toBe(20000);
    expect(c0.priceDifference).toBe(180000);
    expect(c0.canonicalEntityId).toBeNull();
  });

  it('komposisi tanpa harga baked: originalAhspSourcePrice null, priceDifference null', () => {
    const item: any = {
      code: 'FIX-§6-6.3-NOBAKE',
      name: 'Fixture §6.3 tanpa baked',
      unit: 'm3',
      domain: 'CIPTA_KARYA',
      materialComponents: [{ code: 'M09', name: 'Pasir Pasang', unit: 'm3', coefficient: 1 }],
      laborComponents: [],
      equipmentComponents: [],
    };
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const c0 = (comp as any).material.components[0];
    expect(c0.unitPrice).toBe(200000);
    expect(c0.originalAhspSourcePrice).toBeNull();
    expect(c0.priceDifference).toBeNull();
  });

  it('fallback harga baked SMKK: harga sumber dipakai bila master tidak resolve', () => {
    const item: any = {
      code: 'FIX-§6-SMKK',
      name: 'Fixture SMKK',
      unit: 'buah',
      domain: 'SMKK',
      materialComponents: [
        { code: 'ZZZ-SMKK', name: 'Dokumen SMKK', unit: 'buah', coefficient: 1, unitPrice: 123456 },
      ],
      laborComponents: [],
      equipmentComponents: [],
    };
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const c0 = (comp as any).material.components[0];
    expect(c0.resolved).toBe(true);
    expect(c0.unitPrice).toBe(123456);
    expect(c0.originalAhspSourcePrice).toBe(123456);
    expect(c0.priceDifference).toBe(0);
    expect(c0.sourceName).toBe('Lampiran III SE DJBK No. 47/SE/Dk/2026');
  });
});

// ===========================================================================
// (f) recordCount
// ===========================================================================

describe('(f) recordCount = indeks aktual', () => {
  it('recordCount == 4.936 (899 priceMaster + 3.323 CK + 694 BM + 20 OJ twin)', () => {
    expect(priceResolver2026.recordCount).toBe(4936);
  });
});

// ===========================================================================
// (g) DHSP rewire — full equivalence
// ===========================================================================

describe('(g) rewire dhspMapReader: kesetaraan penuh vs perilaku lama', () => {
  it('ukuran map: BM > 1.000, CK > 1.000', () => {
    const sizes = getDhspMapSizes();
    expect(sizes.binaMarga).toBeGreaterThan(1000);
    expect(sizes.ciptaKarya).toBeGreaterThan(1000);
    expect(OFFICIAL_BM_2026_DHSP_MAP.size).toBe(sizes.binaMarga);
    expect(OFFICIAL_CK_2026_DHSP_MAP.size).toBe(sizes.ciptaKarya);
  });

  it('reader == map mentah untuk setiap entri, kedua urutan domain', () => {
    for (const [code, price] of OFFICIAL_BM_2026_DHSP_MAP) {
      expect(getDhspEntry(code, 'BINA_MARGA')?.unitPrice).toBe(price);
      expect(getDhspEntry(code, 'CIPTA_KARYA')?.unitPrice).toBe(price);
    }
    for (const [code, raw] of OFFICIAL_CK_2026_DHSP_MAP) {
      expect(getDhspEntry(code, 'CIPTA_KARYA')?.unitPrice).toBe(raw.unitPrice);
      expect(getDhspEntry(code, 'BINA_MARGA')?.unitPrice).toBe(raw.unitPrice);
    }
    expect(getDhspEntry('KODE-TIDAK-ADA-§6')).toBeNull();
  });

  it('resolver == reader untuk SETIAP item katalog (harga DHSP + provenance)', () => {
    // The §6 rewire guard: resolveAhspUnitPrice reads DHSP ONLY through
    // getDhspEntry now. The full-catalog A/B sweep (HEAD vs §6) found
    // ZERO officialDhspPrice / provenanceSource differences on all
    // 5.801 items — this test pins that equivalence in the suite.
    let withDhsp = 0;
    for (const item of AHSP_2026_CANONICAL as any[]) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      const entry = getDhspEntry(item.code, item.domain, item.codeNormalized);
      expect(comp.officialDhspPrice).toBe(entry?.unitPrice ?? null);
      if (entry) {
        withDhsp++;
        expect(comp.provenanceSource).toBe(entry.provenanceSource);
      }
    }
    expect(withDhsp).toBeGreaterThan(1000);
  });

  it('hspPrice memakai DHSP bila ada, unitPrice bila tidak', () => {
    // Item 1.6.2 (BM): DHSP 150.700 both sides; unitPrice is the
    // resolved sum — hspPrice must equal the DHSP, not the sum.
    const item = (AHSP_2026_CANONICAL as any[]).find((it) => it.code === '1.6.2');
    expect(item).toBeDefined();
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    expect(comp.officialDhspPrice).toBe(150700);
    expect(comp.hspPrice).toBe(150700);
    expect(comp.overheadAmount).toBe(150700 - (comp.unitPrice as number));
  });
});

// ===========================================================================
// (h) NEEDS_REVIEW enforcement
// ===========================================================================

describe('(h) penegakan NEEDS_REVIEW: flag + alternatif, bukan resolusi diam-diam', () => {
  it('statistik registry: 43 ambiguitas + 29 konflik → 84 kunci ter-flag', () => {
    expect(NEEDS_REVIEW_REGISTRY_STATS.ambiguityItems).toBe(43);
    expect(NEEDS_REVIEW_REGISTRY_STATS.conflictItems).toBe(29);
    expect(NEEDS_REVIEW_REGISTRY_STATS.flaggedKeys).toBe(84);
    expect(NEEDS_REVIEW_REGISTRY_STATS.ambiguityOnlyKeys).toBe(55);
    expect(NEEDS_REVIEW_REGISTRY_STATS.conflictOnlyKeys).toBe(27);
    expect(NEEDS_REVIEW_REGISTRY_STATS.bothKeys).toBe(2);
    expect(NEEDS_REVIEW_REGISTRY_STATS.underspecifiedEntries).toBe(5);
    const entries = getAllNeedsReviewEntries();
    expect(entries.length).toBe(84);
    const byKind = new Map<string, number>();
    for (const e of entries) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
    expect(byKind.get('AMBIGUITY')).toBe(55);
    expect(byKind.get('CONFLICT')).toBe(27);
    expect(byKind.get('AMBIGUITY_AND_CONFLICT')).toBe(2);
    // The reader collapses AMBIGUITY_AND_CONFLICT → CONFLICT (the
    // price-level conflict is the sharper signal).
    const both = entries.find((e) => e.kind === 'AMBIGUITY_AND_CONFLICT');
    expect(getNeedsReviewFlag(both!.componentKey)?.kind).toBe('CONFLICT');
  });

  it('getNeedsReviewFlag: M12/M170/E06 ter-flag, M09 tidak', () => {
    const m12 = getNeedsReviewFlag('M12|kg');
    expect(m12?.kind).toBe('CONFLICT');
    expect(m12?.alternatives.length).toBeGreaterThan(0);
    expect(getNeedsReviewFlag('M170|liter')?.kind).toBe('CONFLICT');
    expect(getNeedsReviewFlag('E06|jam')?.kind).toBe('CONFLICT');
    expect(getNeedsReviewFlag('M09|m3')).toBeNull();
  });

  it('flag OJ/jam twin: L01|OJ dan L01|jam sama-sama ter-flag', () => {
    expect(getNeedsReviewFlag('L01|OJ')).not.toBeNull();
    expect(getNeedsReviewFlag('L01|jam')).not.toBeNull();
    expect(getNeedsReviewFlag('L02|OJ')).not.toBeNull();
    expect(getNeedsReviewFlag('L02|jam')).not.toBeNull();
  });

  it('flag menumpang pada resolusi: M12|kg resolve Rp1.600 DENGAN flag', () => {
    const r = q('M12', 'Semen', 'material', 'kg');
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(1600);
    expect(r.needsReview).not.toBeNull();
    expect(r.needsReview.kind).toBe('CONFLICT');
    expect(r.needsReview.componentKey).toBe('M12|kg');
    expect(r.needsReview.alternatives.length).toBeGreaterThan(0);
  });

  it('flag menumpang pada resolusi: M170|liter Rp19.900 + E06|jam Rp573.770,23', () => {
    const m170 = q('M170', 'Air', 'material', 'liter');
    expect(m170.price).toBe(19900);
    expect(m170.needsReview?.kind).toBe('CONFLICT');
    const e06 = q('E06', 'Excavator', 'equipment', 'jam');
    expect(e06.price).toBe(573770.23);
    expect(e06.needsReview?.kind).toBe('CONFLICT');
  });

  it('flag tidak pernah mengubah harga (marker, bukan blokir)', () => {
    // The flagged resolution carries the SAME price the unflagged
    // winner would: the flag annotates, it never re-prices. M12|kg
    // resolves the BM Rp1.600 record — the flag names the spread, the
    // price is the record's own.
    const r = q('M12', 'Semen', 'material', 'kg');
    expect(r.price).toBe(1600);
    expect(r.needsReview).not.toBeNull();
    expect(r.explanation).toContain('Rp 1.600');
  });

  it('flag menumpang pada komponen komposisi', () => {
    const item: any = {
      code: 'FIX-§6-FLAG',
      name: 'Fixture flag',
      unit: 'm3',
      domain: 'CIPTA_KARYA',
      materialComponents: [{ code: 'M12', name: 'Semen', unit: 'kg', coefficient: 1 }],
      laborComponents: [],
      equipmentComponents: [],
    };
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const c0 = (comp as any).material.components[0];
    expect(c0.unitPrice).toBe(1600);
    expect(c0.needsReview?.kind).toBe('CONFLICT');
    expect(c0.underspecified?.action).toBe('FLAG');
  });
});

// ===========================================================================
// (i) Underspecified keys — REFUSE / FLAG
// ===========================================================================

describe('(i) key kurang-spesifikasi: DITOLAK atau diflag, bukan resolve diam-diam', () => {
  it('registry: 5 entri underspecified (4 REFUSE + 1 FLAG)', () => {
    const entries = getAllUnderspecifiedEntries();
    expect(entries.length).toBe(5);
    const refuse = entries.filter((e) => e.action === 'REFUSE');
    const flag = entries.filter((e) => e.action === 'FLAG');
    expect(refuse.length).toBe(4);
    expect(flag.length).toBe(1);
    expect(flag[0].key).toBe('M12|kg');
  });

  it('M241|m DITOLAK (dulu Rp180.000 diam-diam)', () => {
    const r = q('M241', 'Pipa Baja', 'material', 'm');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('UNDERSPECIFIED_KEY');
    expect(r.underspecified?.action).toBe('REFUSE');
    expect(r.alternatives.length).toBeGreaterThan(0);
  });

  it('EI734|kg + EI374|kg DITOLAK (dulu Rp16.000 milik M39b)', () => {
    for (const code of ['EI734', 'EI374']) {
      const r = q(code, 'Baja Tulangan', 'material', 'kg');
      expect(r.status).toBe('NOT_FOUND');
      expect(r.price).toBeNull();
      expect(r.explanation).toContain('UNDERSPECIFIED_KEY');
      expect(r.underspecified?.action).toBe('REFUSE');
    }
  });

  it('REFUSE berlaku untuk kode di SATUAN APAPUN (menutup bypass konversi)', () => {
    // Before the §6 finisher fix, M241|cm resolved Rp1.800 and
    // EI734|ton resolved Rp16.000.000 via dimensional conversion —
    // the refusal is about the CODE's identity, not the unit.
    expect(getUnderspecifiedRule('M241|cm')?.action).toBe('REFUSE');
    expect(getUnderspecifiedRule('EI734|ton')?.action).toBe('REFUSE');
    expect(q('M241', 'Pipa Baja', 'material', 'cm').price).toBeNull();
    expect(q('EI734', 'Baja Tulangan', 'material', 'ton').price).toBeNull();
    expect(q('M241', 'Pipa Baja', 'material', 'cm').explanation).toContain('UNDERSPECIFIED_KEY');
  });

  it('FLAG tetap per-key: M12|ton tidak membawa flag M12|kg', () => {
    expect(getUnderspecifiedRule('M12|ton')).toBeNull();
    expect(getUnderspecifiedRule('M12|kg')?.action).toBe('FLAG');
  });

  it('nama generik "Beton" DITOLAK; nama ber-spesifikasi tidak tertangkap aturan nama', () => {
    const generic = q('', 'Beton', 'material', 'm3');
    expect(generic.status).toBe('NOT_FOUND');
    expect(generic.explanation).toContain('UNDERSPECIFIED_KEY');
    expect(generic.underspecified?.action).toBe('REFUSE');
    // Specified names are NOT refused by the name rule — they simply
    // have no record (NOT_FOUND without UNDERSPECIFIED_KEY).
    const k225 = q('', 'Beton K-225', 'material', 'm3');
    expect(k225.status).toBe('NOT_FOUND');
    expect(k225.price).toBeNull();
    expect(k225.underspecified).toBeNull();
    expect(k225.explanation).not.toContain('UNDERSPECIFIED_KEY');
    const k300 = q('', 'Beton K-300', 'material', 'm3');
    expect(k300.status).toBe('NOT_FOUND');
    expect(k300.underspecified).toBeNull();
  });

  it('M12|kg FLAG: resolve Rp1.600 dengan marker eksplisit', () => {
    const r = q('M12', 'Semen', 'material', 'kg');
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(1600);
    expect(r.underspecified?.action).toBe('FLAG');
    expect(r.underspecified?.componentKey).toBe('M12|kg');
  });

  it('componentKeyFor menormalisasi kunci (loose code + unit)', () => {
    expect(componentKeyFor('M12', 'kg')).toBe('M12|kg');
    expect(componentKeyFor('M.12', 'Kg')).toBe('M12|kg');
    expect(componentKeyFor('', 'kg')).toBe('');
  });
});

// ===========================================================================
// (j) RETAIL decision
// ===========================================================================

describe('(j) keputusan RETAIL: channel akuisisi asli, bukan re-label', () => {
  it('RETAIL ada di kosakata priceType (union + guard list)', () => {
    expect(MASTER_PRICE_TYPE_VALUES).toContain('RETAIL');
    expect(isMasterPriceType('RETAIL')).toBe(true);
    expect(isMasterPriceType('BLACK_MARKET')).toBe(false);
  });

  it('derivePriceType menerima RETAIL dari field maupun catatan', () => {
    expect(derivePriceType({ priceType: 'RETAIL' } as any)).toBe('RETAIL');
    expect(derivePriceType({ notes: ['priceType=RETAIL'] } as any)).toBe('RETAIL');
    expect(derivePriceType({ notes: ['priceType=BLACK_MARKET'] } as any)).toBeNull();
  });

  it('pipeline men-stempel RETAIL pada 3 baris verified-retailer', () => {
    const rows = readJson<{ rows: Array<{ id: string; resourceName: string; priceType: string | null; sourceType: string; price: number }> }>(
      'data/price2026/normalized/price_rows.json'
    ).rows;
    const retail = rows.filter((r) => r.priceType === 'RETAIL');
    expect(retail.length).toBe(3);
    for (const r of retail) expect(r.sourceType).toBe('VERIFIED_RETAILER');
    expect(retail.map((r) => r.resourceName).sort()).toEqual([
      'Karet Waterstop Tipe W-9 (Lebar 230 mm) dengan Center Bulb',
      'Pipa PVC Rucika AW Diameter 1/2 Inch (4 meter)',
      'Semen Portland Komposit (PCC) 50kg',
    ]);
    expect(retail.map((r) => r.price).sort((a, b) => a - b)).toEqual([36000, 76000, 142000]);
  });

  it('0/899 record priceMaster membawa RETAIL (ketiga baris belum match)', () => {
    const master = readJson<{ records: Array<{ priceType: string | null }> }>(
      'data/price2026/validated/price_master.json'
    );
    expect(master.records.length).toBe(899);
    expect(master.records.filter((r) => r.priceType === 'RETAIL').length).toBe(0);
  });

  it('migrasi SQL price_type CHECK mencakup RETAIL (file-only, NOT APPLIED)', () => {
    const sql = readText('supabase/migrations/20261116_master_price_governance.sql');
    expect(sql).toContain("'RETAIL'");
    expect(sql).toContain('NOT APPLIED');
  });
});

// ===========================================================================
// (k) Layering — spec-token stays pipeline-local
// ===========================================================================

describe('(k) layering: resolver runtime tidak butuh spec-token', () => {
  it('resolver + centralResolution tidak mengimpor fungsi spec-token', () => {
    for (const rel of [
      'src/data/priceDatabase2026/resolver.ts',
      'src/data/priceDatabase2026/centralResolution.ts',
    ]) {
      const src = readText(rel);
      expect(src).not.toContain('extractSpecTokens');
      expect(src).not.toContain('specTokensCompatible');
      // No IMPORT from the pipeline matcher modules (a prose mention
      // in a comment — e.g. where the blocked labels came from — is
      // fine and does not create a dependency).
      expect(src).not.toMatch(/from\s+['"][^'"]*matcherHardening['"]/);
      expect(src).not.toMatch(/from\s+['"][^'"]*reconciliationMatching['"]/);
    }
  });

  it('gerbang nama memakai nameSimilarity (bukan spec-token) pada ambang pipeline', () => {
    // D3 orders "nameSimilarity + the pipeline threshold" for the
    // runtime gate; the §5.3 hierarchy (spec tokens) governs MATCHING
    // (creating identity links), and the runtime resolver creates no
    // identity links — it only checks a binding the pipeline made.
    expect(CODE_NAME_GATE_THRESHOLD).toBe(NAME_COMPATIBLE_THRESHOLD);
    expect(nameSimilarity('Sopir', 'Sopir')).toBe(1);
    expect(nameSimilarity('Akhli Madya Lingkungan', 'Sopir')).toBe(0);
  });

  it('keterbatasan terukur: 51 ikatan pra-ada berkonflik spesifikasi lolos gerbang', () => {
    // The gate compares NAMES, not specifications: where both sides
    // carry spec tokens that conflict (E69 gerinda 3,32 HP → 1 HP;
    // E51 crane 10–15 T → 75–100 T; M315 tiang pancang tebal 10/12 mm
    // → 9 mm), the gate passes them (high token overlap). All 51 were
    // verified PRE-EXISTING in the §6 audit (0 changed by §6): closing
    // them would un-resolve 51 currently-priced components — a §7 /
    // owner decision, not a §6 fix. If this count moves, re-audit.
    let conflicts = 0;
    let bothHaveTokens = 0;
    for (const item of AHSP_2026_CANONICAL as any[]) {
      const comps = [
        ...(item.laborComponents ?? []).map((c: any) => ({ ...c, type: 'labor' as const })),
        ...(item.materialComponents ?? []).map((c: any) => ({ ...c, type: 'material' as const })),
        ...(item.equipmentComponents ?? []).map((c: any) => ({ ...c, type: 'equipment' as const })),
      ];
      for (const c of comps) {
        const r = q(c.code ?? '', c.name ?? '', c.type, c.unit, { rawUnit: c.unit });
        if (r.status !== 'RESOLVED') continue;
        const qT = extractSpecTokens(c.name ?? '');
        const wT = extractSpecTokens(r.resourceName ?? '');
        if (qT.length > 0 && wT.length > 0) {
          bothHaveTokens++;
          if (!specTokensCompatible(c.name ?? '', r.resourceName ?? '')) conflicts++;
        }
      }
    }
    expect(bothHaveTokens).toBeGreaterThan(2000);
    expect(conflicts).toBe(51);
  });
});

// ===========================================================================
// §14.2 — propagation: one price change reaches every linked component
// ===========================================================================

describe('§14.2 propagasi harga: satu perubahan → semua komponen ter-link', () => {
  // NOTE (honest scope): a TRUE master mutation requires pipeline
  // regeneration (priceMaster is a generated artifact). The testable
  // injection point for propagation is the OVERRIDE context, which
  // carries the new prices through the SAME resolution path the live
  // master uses (per-component lookup → composition → total).
  const ckFixture: any = {
    code: 'FIX-§6-14.2-CK',
    name: 'Fixture §14.2 CK',
    unit: 'm3',
    domain: 'CIPTA_KARYA',
    materialComponents: [{ code: 'M09', name: 'Pasir Pasang', unit: 'm3', coefficient: 2 }],
    laborComponents: [{ code: 'L01', name: 'Pekerja', unit: 'OH', coefficient: 3 }],
    equipmentComponents: [{ code: 'E07', name: 'Crane', unit: 'jam', coefficient: 0.5 }],
  };
  const overrideAll = {
    pricingMode: 'PROJECT_OVERRIDE' as const,
    overrideRef: {
      pricesByComponentKey: { 'M09|m3': 40000, 'L01|OH': 150000, 'E07|jam': 900000 },
      label: 'test-override-14.2',
    },
  };

  it('CK: ubah material + labor + equipment → total dihitung ulang, koefisien tetap', () => {
    const live = priceResolver2026.resolveAhspUnitPrice(ckFixture);
    expect(live.pricingStatus).toBe('FULL');
    expect(live.unitPrice).toBe(1086959);
    const ov = priceResolver2026.resolveAhspUnitPrice(ckFixture, { pricingContext: overrideAll });
    expect(ov.pricingStatus).toBe('FULL');
    expect(ov.unitPrice).toBe(980000);
    expect(ov.unitPrice).toBe(Math.round(2 * 40000 + 3 * 150000 + 0.5 * 900000));
    for (const cat of ['material', 'labor', 'equipment'] as const) {
      const lc = (live as any)[cat].components[0];
      const oc = (ov as any)[cat].components[0];
      expect(oc.coefficient).toBe(lc.coefficient);
      expect(oc.pricingMode).toBe('PROJECT_OVERRIDE');
    }
    expect((ov as any).material.components[0].unitPrice).toBe(40000);
    expect((ov as any).labor.components[0].unitPrice).toBe(150000);
    expect((ov as any).equipment.components[0].unitPrice).toBe(900000);
  });

  it('BM: propagasi bekerja pada domain Bina Marga (M09 Timbunan Pilihan)', () => {
    const bm: any = {
      code: 'FIX-§6-14.2-BM',
      name: 'Fixture §14.2 BM',
      unit: 'm3',
      domain: 'BINA_MARGA',
      materialComponents: [{ code: 'M09', name: 'Timbunan Pilihan', unit: 'm3', coefficient: 1 }],
      laborComponents: [{ code: 'L.01', name: 'Pekerja', unit: 'OH', coefficient: 1 }],
      equipmentComponents: [{ code: 'E07', name: 'Crane On Track 10-15 Ton', unit: 'jam', coefficient: 1 }],
    };
    const live = priceResolver2026.resolveAhspUnitPrice(bm);
    expect(live.pricingStatus).toBe('FULL');
    expect((live as any).material.components[0].unitPrice).toBe(25000);
    const ov = priceResolver2026.resolveAhspUnitPrice(bm, {
      pricingContext: {
        pricingMode: 'PROJECT_OVERRIDE',
        overrideRef: { pricesByComponentKey: { 'M09|m3': 30000 }, label: 't' },
      },
    });
    expect((ov as any).material.components[0].unitPrice).toBe(30000);
    expect(ov.unitPrice).toBe((live.unitPrice as number) + 5000);
  });

  it('SDA: propagasi bekerja pada domain Sumber Daya Air', () => {
    const sda: any = {
      code: 'FIX-§6-14.2-SDA',
      name: 'Fixture §14.2 SDA',
      unit: 'm3',
      domain: 'SUMBER_DAYA_AIR',
      materialComponents: [{ code: 'M.21', name: 'Air Bersih', unit: 'm3', coefficient: 1 }],
      laborComponents: [{ code: 'L.03', name: 'Kepala Tukang', unit: 'OJ', coefficient: 1 }],
      equipmentComponents: [{ code: 'E.05', name: 'Generator Set', unit: 'jam', coefficient: 1 }],
    };
    const live = priceResolver2026.resolveAhspUnitPrice(sda);
    expect(live.pricingStatus).toBe('FULL');
    // 422.500 = M.21 Air Bersih 7.500 (pasar langsung, adopsi 2026-11-17;
    // dulu 550.000 via konversi liter→m³) + L.03 165.000 + E.05 250.000.
    expect(live.unitPrice).toBe(422500);
    const ov = priceResolver2026.resolveAhspUnitPrice(sda, {
      pricingContext: {
        pricingMode: 'PROJECT_OVERRIDE',
        overrideRef: {
          pricesByComponentKey: { 'M21|m3': 600000, 'L03|OJ': 170000, 'E05|jam': 260000 },
          label: 't',
        },
      },
    });
    expect(ov.unitPrice).toBe(1030000);
  });

  it('SMKK: komponen ber-harga baked ikut total; override menggantinya', () => {
    const smkk: any = {
      code: 'FIX-§6-14.2-SMKK',
      name: 'Fixture §14.2 SMKK',
      unit: 'buah',
      domain: 'SMKK',
      materialComponents: [
        { code: 'ZZZ-SMKK', name: 'Dokumen SMKK', unit: 'buah', coefficient: 2, unitPrice: 123456 },
      ],
      laborComponents: [],
      equipmentComponents: [],
    };
    const live = priceResolver2026.resolveAhspUnitPrice(smkk);
    expect(live.unitPrice).toBe(246912);
    const ov = priceResolver2026.resolveAhspUnitPrice(smkk, {
      pricingContext: {
        pricingMode: 'PROJECT_OVERRIDE',
        // NOTE: 'buah' normalizes to 'bh' — context keys use the
        // NORMALIZED unit (contextCodeKey).
        overrideRef: { pricesByComponentKey: { 'ZZZSMKK|bh': 200000 }, label: 't' },
      },
    });
    expect(ov.unitPrice).toBe(400000);
  });

  it('override parsial: komponen tak-di-override mempertahankan harga + provenance live', () => {
    const live = priceResolver2026.resolveAhspUnitPrice(ckFixture);
    const ov = priceResolver2026.resolveAhspUnitPrice(ckFixture, {
      pricingContext: {
        pricingMode: 'PROJECT_OVERRIDE',
        overrideRef: { pricesByComponentKey: { 'M09|m3': 40000 }, label: 't' },
      },
    });
    const liveLabor = (live as any).labor.components[0];
    const ovLabor = (ov as any).labor.components[0];
    const liveEquip = (live as any).equipment.components[0];
    const ovEquip = (ov as any).equipment.components[0];
    expect((ov as any).material.components[0].unitPrice).toBe(40000);
    expect(ovLabor.unitPrice).toBe(liveLabor.unitPrice);
    expect(ovLabor.sourceName).toBe(liveLabor.sourceName);
    expect(ovEquip.unitPrice).toBe(liveEquip.unitPrice);
    expect(ovEquip.sourceName).toBe(liveEquip.sourceName);
    expect(ov.unitPrice).toBe(
      Math.round(2 * 40000 + 3 * liveLabor.unitPrice + 0.5 * liveEquip.unitPrice)
    );
  });

  it('cache invalidation: sesudah invalidate, fixture menghitung ulang harga yang sama', () => {
    const before = priceResolver2026.resolveAhspUnitPrice(ckFixture);
    priceResolver2026.invalidateAhspCache();
    const after = priceResolver2026.resolveAhspUnitPrice(ckFixture);
    expect(after).not.toBe(before);
    expect(after.unitPrice).toBe(before.unitPrice);
    expect(after.pricingStatus).toBe(before.pricingStatus);
  });
});

// ===========================================================================
// §14.5 — integrity
// ===========================================================================

describe('§14.5 integritas: hilang ≠ Rp0, wilayah, tanggal, konflik, provenance', () => {
  it('harga hilang = NOT_FOUND, harga null — TIDAK PERNAH Rp0', () => {
    const r = q('ZZZ-TIDAK-ADA', 'Tidak Ada', 'material', 'm3');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.price).not.toBe(0);
    expect(r.explanation).toContain('NOT Rp 0');
  });

  it('multi-wilayah: tanpa fallback eksplisit, wilayah tanpa record = NOT_FOUND (tanpa substitusi diam-diam)', () => {
    // Strict by default: a Jawa Timur request with no Jawa Timur
    // record does NOT silently fall back to the NATIONAL price —
    // the caller must opt in with allowLocationFallback.
    const strict = q('M09', 'Pasir Pasang', 'material', 'm3', {
      location: { provinceName: 'Jawa Timur' },
    });
    expect(strict.status).toBe('NOT_FOUND');
    expect(strict.price).toBeNull();
    expect(strict.explanation).toContain('strict location/period policy');
    const fallback = q('M09', 'Pasir Pasang', 'material', 'm3', {
      location: { provinceName: 'Jawa Timur' },
      allowLocationFallback: true,
    });
    expect(fallback.status).toBe('RESOLVED');
    expect(fallback.price).toBe(200000);
  });

  it('multi-tanggal: periode 2026 resolve; 2025 strict = NOT_FOUND; fallback eksplisit resolve', () => {
    expect(q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2026 } }).price).toBe(200000);
    const old = q('M09', 'Pasir Pasang', 'material', 'm3', { period: { year: 2025 } });
    expect(old.status).toBe('NOT_FOUND');
    expect(old.price).toBeNull();
    expect(old.explanation).toContain('strict location/period policy');
    const oldFallback = q('M09', 'Pasir Pasang', 'material', 'm3', {
      period: { year: 2025 },
      allowPeriodFallback: true,
    });
    expect(oldFallback.status).toBe('RESOLVED');
    expect(oldFallback.price).toBe(200000);
  });

  it('konflik sumber: diungkap sebagai flag + alternatif, bukan disembunyikan', () => {
    const r = q('M12', 'Semen', 'material', 'kg');
    expect(r.needsReview?.kind).toBe('CONFLICT');
    expect(r.needsReview.alternatives.length).toBeGreaterThan(0);
    expect(r.underspecified?.action).toBe('FLAG');
  });

  it('referensi pasar: M57A|ton dari Katalog Acuan HSD 2026 (NAME_UNIT → NEEDS_REVIEW)', () => {
    const r = q('M57A', 'Besi Beton', 'material', 'ton');
    expect(r.price).toBe(15000000);
    expect(r.source?.name).toBe('Katalog Acuan HSD 2026');
    // §3 two-tier: a NAME_UNIT binding is NEVER auto-VERIFIED — the
    // status honestly says NEEDS_REVIEW.
    expect(r.explanation).toContain('NEEDS_REVIEW');
    expect(r.matchMethod).toBe('NAME_UNIT');
  });

  it('manual: harga override dilayani verbatim dengan mode tercatat', () => {
    const ovr = buildComponentPriceRef(
      [{ code: 'M09', name: 'Timbunan Pilihan', unit: 'm3', unitPrice: 27500 }],
      { label: 'manual' }
    );
    const r = q('M09', 'Timbunan Pilihan', 'material', 'm3', {
      pricingContext: { pricingMode: 'PROJECT_OVERRIDE', overrideRef: ovr },
    });
    expect(r.price).toBe(27500);
    expect(r.pricingMode).toBe('PROJECT_OVERRIDE');
  });

  it('asumsi tidak pernah dikarang resolver: komponen tanpa harga tetap null', () => {
    // ASSUMPTION-labelled estimates live in the DED layer (pinned by
    // dedPriceCompletion S19); the resolver itself never assumes a
    // price — a component with no source price stays null, labelled.
    // §6 used L.04 Tukang Batu @OJ as the example; §7's documented
    // 1:1 daily transfer now resolves it to the CK daily rate
    // (Rp145.000 — a REAL source price, not an assumption), so the
    // example moves to L.16 Tukang pompa @OJ, one of the 2 OJ rows
    // that genuinely still have no source price in any unit.
    const r = q('L.16', 'Tukang pompa', 'labor', 'OJ', { rawUnit: 'OJ' });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.ojBasis?.queryBasis).toBe('OJ_DAY');
    expect(r.ojBasis?.recordBasis).toBeNull();
  });

  it('provenance resmi: E07 dari Standar Sewa Alat Bina Marga SE 47/2026', () => {
    const r = q('E07', 'Crane On Track 10-15 Ton', 'equipment', 'jam');
    expect(r.price).toBe(773917.31);
    expect(r.source?.name).toBe('Standar Sewa Alat Bina Marga SE 47/2026');
    expect(r.explanation).toContain('VERIFIED');
  });

  it('satuan tak-kompatibel: ditolak, harga null, UNIT_MISMATCH di penjelasan', () => {
    const r = q('M57A', 'Besi Beton', 'material', 'm3');
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('UNIT_MISMATCH');
  });
});
