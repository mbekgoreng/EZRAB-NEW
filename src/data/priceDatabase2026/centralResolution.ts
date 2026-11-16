/**
 * EZRAB — CENTRAL RESOLUTION LAYER (MASTER PRICING §6)
 * =====================================================
 *
 * The §6 extensions to `priceResolver2026` (design D3, §2.4.6): the
 * resolver itself is EXTENDED, not replaced — this module holds the pure
 * decision functions the resolver calls, so each rule is testable in
 * isolation and the resolver stays a thin orchestrator.
 *
 *   (a) Name gate on code resolution — a code match whose names share
 *       nothing is a false positive (CK L.10 `Sopir` vs BM key `Akhli
 *       Madya Lingkungan`, similarity 0.00). The gate uses
 *       `nameSimilarity` + the pipeline's own threshold (0.34), with the
 *       same explicit exceptions as the BM adapter ladder.
 *   (b) Project pricing context — LIVE / SNAPSHOT / OVERRIDE lookups.
 *   (c) Dimensional unit conversion — an explicit whitelist, wired to
 *       CanonicalUnitRegistry (dimension authority) + UnitEngine.convert
 *       (factor authority), plus the documented OJ↔OH work-hours basis.
 *       The OJ↔OH conversion is ASYMMETRIC: OJ→OH (hourly record →
 *       daily query) always applies on a documented basis; OH→OJ
 *       applies ÷N only when the query OJ is hourly-sense (raw unit
 *       `jam`) and 1:1 when the query OJ is native daily (§7: OJ-day ≡
 *       OH-day, documented by §5 §8 + HSD usage — see
 *       conversionForRecord).
 *   (d) MASTER PRICING §7 — unit-annotation stripping (a parenthetical
 *       unit token in a name, e.g. `Air (m3)`, is redundant with the
 *       unit field and must not break exact-name matching);
 *       `(Ready Mix)`-only stripping at the name gate (the M265 false
 *       negative — a delivery-form annotation, not grade identity);
 *       runtime location/period validation (strings are rejected, never
 *       silently dropped); OJ-basis classification + the per-resolution
 *       OJ-basis flag (the §5 §8 homonym made explicit, never guessed).
 *
 * Deliberately NOT here (see the §6 report):
 *   - `normalize.ts` is untouched: `unitConversionFactor` stays the
 *     conservative no-implicit-conversion primitive. Documented
 *     conversions live in THIS layer, where the evidence (whitelist /
 *     work-hours note) travels with the factor.
 *   - The §5.3 matching hierarchy / spec-token functions stay
 *     pipeline-local: the runtime resolver does not need them (the name
 *     gate uses `nameSimilarity`, the registries are curated) — §6 (k).
 */

import {
  NAME_COMPATIBLE_THRESHOLD,
  looseCode,
  nameSimilarity,
  normalizeName,
  normalizeUnit,
} from './normalize';
import { canonicalUnitRegistry } from '../../engine/pricing/canonical/canonicalUnitRegistry';
import { UnitEngine } from '../../engine/calculatorCore/unit/unitEngine';
import type {
  ComponentPriceMapRef,
  OjBasis,
  OjBasisFlag,
  ProjectPricingContext,
  ProjectPricingMode,
  ResourcePriceQuery,
  ResourcePriceRecord,
  ResourcePriceResolution,
  UnitConversionApplied,
} from './types';

// ===========================================================================
// (a) NAME GATE ON CODE RESOLUTION
// ===========================================================================

/** The pipeline's own code-gate threshold (§2.2.2, matcherHardening). */
export const CODE_NAME_GATE_THRESHOLD = NAME_COMPATIBLE_THRESHOLD;

/**
 * BM adapter exception codes (matcherHardening `BM_CODE_BIND_BLOCKED_CODES`,
 * audit ladder rule (e): M05 + E41 are TRUE code collisions (one code,
 * several products); E07/E11 carry the pending owner/PDF swap question
 * (§5 §7.4 refuted the swap on workbook evidence, but the codes stay
 * exception-listed until the SE DJBK PDF lands). For these codes the name
 * gate is MANDATORY: a code match with no name on either side cannot
 * bind — code alone is known-insufficient evidence for them.
 */
export const BM_CODE_GATE_EXCEPTIONS: ReadonlySet<string> = new Set([
  'M05',
  'E41',
  'E07',
  'E11',
]);

/** Adapter-row labels that must never auto-bind (matcherHardening). */
export const CODE_GATE_BLOCKED_LABELS: readonly string[] = [
  'belum tersedia', // placeholder label ("not yet available") — needs human review
];

export type CodeNameGateReason =
  | 'NAME_COMPATIBLE'
  | 'NO_NAME_TO_CHECK'
  | 'NAME_MISMATCH'
  | 'BLOCKED_LABEL'
  | 'EXCEPTION_CODE_NEEDS_NAME';

export interface CodeNameGateDecision {
  allowed: boolean;
  reason: CodeNameGateReason;
  /** nameSimilarity(queryName, candidateName), 0 when either name is missing. */
  similarity: number;
}

/**
 * MASTER PRICING §7 — strip ONLY the `(Ready Mix)` parenthetical from a
 * name before the gate compares it. `(Ready Mix)` is a DELIVERY-FORM
 * annotation (beton siap pakai), not grade identity: `Beton K-125
 * (Ready Mix)` and `Beton K-125` are the same product. The §7 threshold
 * sweep proved this narrow strip flips exactly 2 catalog bindings —
 * the two known-true M265 rows (9.4.(21a)/(21b), sim 0.333 → 0.5) —
 * with ZERO collateral flips and zero drops. A BLANKET strip of all
 * parentheticals was measured UNSOUND (154 flips, dominated by
 * spec-carrying parens: `0,5-0,7 m/menit`, `anyam+isi batu`,
 * `dia 20-50 mm`) and is deliberately NOT done here.
 */
export function stripReadyMixAnnotation(name: string | undefined | null): string {
  return String(name || '').replace(/\(\s*ready\s+mix\s*\)/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Does the query name carry real name evidence? A missing name, or a name
 * that IS the code itself (code-only callers pass the code as the name),
 * carries no evidence — the gate cannot compare, so it must not pretend
 * to. Only a genuine name string counts.
 */
export function queryNameHasEvidence(queryCode: string | undefined | null, queryName: string | undefined | null): boolean {
  const stripped = String(queryName || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!stripped) return false;
  if (queryCode && stripped === looseCode(queryCode)) return false;
  return true;
}

/**
 * The §6 name gate for ONE code-path candidate.
 *
 *   - Candidate name containing a blocked label (`belum tersedia`) →
 *     BLOCKED, always, whatever the similarity.
 *   - Exception code (M05/E41/E07/E11) → the gate is mandatory: both
 *     sides must carry a name AND similarity must reach the threshold.
 *     A missing name blocks (EXCEPTION_CODE_NEEDS_NAME).
 *   - Any other code → when both sides carry a name, similarity must
 *     reach the threshold (NAME_MISMATCH otherwise). When either side
 *     has no usable name, the gate passes vacuously (NO_NAME_TO_CHECK):
 *     a missing name is not evidence of a mismatch. This is a
 *     DOCUMENTED LIMITATION — a nameless component cannot be
 *     name-checked (1 such row exists: SDA item A.3.08.2q, L.10 with an
 *     empty name, which still resolves to the CK `Sopir` price; the
 *     data defect is the component's missing name, not the gate).
 *
 * The gate NEVER applies to the resourceId path (an explicit RES-xxx
 * join is verified identity, §5.3 level 1) or to name paths (they are
 * name-based by construction) — only to loose-code candidates.
 */
export function codeNameGate(
  queryCode: string | undefined | null,
  queryName: string | undefined | null,
  candidateName: string | undefined | null
): CodeNameGateDecision {
  const candNorm = normalizeName(candidateName || '');
  if (candNorm && CODE_GATE_BLOCKED_LABELS.some((lbl) => candNorm.includes(lbl))) {
    return { allowed: false, reason: 'BLOCKED_LABEL', similarity: 0 };
  }

  const lc = looseCode(queryCode || '');
  const isException = BM_CODE_GATE_EXCEPTIONS.has(lc);
  const queryHasName = queryNameHasEvidence(queryCode, queryName);
  const candidateHasName = candNorm.length > 0;

  if (!queryHasName || !candidateHasName) {
    if (isException) {
      return { allowed: false, reason: 'EXCEPTION_CODE_NEEDS_NAME', similarity: 0 };
    }
    return { allowed: true, reason: 'NO_NAME_TO_CHECK', similarity: 0 };
  }

  const similarity = nameSimilarity(
    // MASTER PRICING §7: the `(Ready Mix)` annotation is stripped for
    // the comparison ONLY — the blocked-label + evidence checks above
    // stay on the raw names. See stripReadyMixAnnotation.
    stripReadyMixAnnotation(queryName),
    stripReadyMixAnnotation(candidateName)
  );
  if (similarity >= CODE_NAME_GATE_THRESHOLD) {
    return { allowed: true, reason: 'NAME_COMPATIBLE', similarity };
  }
  return { allowed: false, reason: 'NAME_MISMATCH', similarity };
}

// ===========================================================================
// (c) DIMENSIONAL UNIT CONVERSION (§7)
// ===========================================================================

/**
 * The explicit dimensional whitelist (§7.1). ONLY these pairs convert,
 * in either direction. Everything else — including every mass↔volume
 * pair — stays UNIT_MISMATCH: no density is ever inferred.
 */
export const DIMENSIONAL_CONVERSION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['ton', 'kg'], // 1 ton = 1.000 kg
  ['m', 'cm'], // 1 m = 100 cm
  ['m3', 'liter'], // 1 m³ = 1.000 liter
];

function isWhitelistedPair(a: string, b: string): boolean {
  return DIMENSIONAL_CONVERSION_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

/**
 * Parse a `workHoursPerDay=N` note from a price record. The LABOR source
 * stamps it on every row (7 for field workers, 8 for staff —
 * laborDatabaseService: OJ = OH / workHoursPerDay). Returns null when
 * the record carries no such note or the value is not a sane work day
 * (1–24 hours): an undocumented or absurd basis never converts.
 */
export function parseWorkHoursPerDay(record: Pick<ResourcePriceRecord, 'notes'>): number | null {
  for (const note of record.notes || []) {
    const m = /workHoursPerDay\s*=\s*([0-9]+(?:\.[0-9]+)?)/.exec(note);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 24) return n;
      return null;
    }
  }
  return null;
}

/**
 * The conversion that turns ONE record's price into the query unit, or
 * null when no documented conversion applies. The returned factor is a
 * PRICE factor: price per query unit = record price × factor.
 *
 * `queryRawUnit` is the query unit BEFORE type-aware normalization
 * (resolveAhspUnitPrice passes the component's raw unit). It is needed
 * ONLY for the OH→OJ direction: a native-OJ query is a day (§5 §8), an
 * OJ query that came from raw `jam` is an hour. A missing raw unit fails
 * closed (OH→OJ returns null); the OJ→OH direction never needs it.
 *
 *   - Dimensional pairs (whitelist): the factor comes from
 *     UnitEngine.convert(1, queryUnit, recordUnit), after the
 *     CanonicalUnitRegistry confirms both units share one dimension.
 *     UnitEngine.convert converts QUANTITIES, so the price factor is
 *     the quantity conversion in the opposite direction: 1 ton of
 *     material contains 1.000 kg, so a per-kg price × 1.000 is the
 *     per-ton price.
 *   - OJ→OH (labor time, §5 §8 homonym): the factor comes ONLY from
 *     the record's own documented `workHoursPerDay` (LABOR source).
 *     OJ→OH multiplies by N (a day holds N working hours). A record
 *     without the note never converts — the BM OJ twins (hourly rates
 *     relabelled OJ, no note) are deliberately excluded: their hourly
 *     basis is NOT documented on the record.
 *   - OH→OJ, hourly-sense query (raw unit `jam`): divides by N, on the
 *     record's documented `workHoursPerDay`.
 *   - OH→OJ, native-OJ query (raw unit `OJ`) — MASTER PRICING §7 1:1
 *     DAILY TRANSFER: factor 1, no work-hours note needed (a
 *     same-scale identity needs no hours basis). Authorized by the
 *     documented semantics OJ-day ≡ OH-day: §5 §8 proved canonical OJ
 *     coefficients daily-scale; HSD prices ALL its labor in OJ at
 *     daily rates with no OH labor records at all; CK `Tukang batu`
 *     OH Rp145.000 ≈ HSD `Tukang` OJ Rp140–160.000 (same role, same
 *     price, different label); and in the 67 affected items the OJ
 *     rows sit beside sibling OJ rows with identical coefficients
 *     (coherent daily crews — 30/67 share the exact coefficient with
 *     a resolved sibling). Measured impact: 67 `Tukang Batu` @OJ rows
 *     (null since the §6 §2.1 fix) resolve to the CK daily rate
 *     Rp145.000; 11 items return to FULL; +Rp2.029.898 across the
 *     catalog. The transfer applies ONLY to native-OJ queries — a
 *     missing or ambiguous raw unit fails closed.
 *
 * Same-unit pairs return null (no conversion needed). Cross-dimension
 * pairs return null (UNIT_MISMATCH stays). This function never throws:
 * an unknown unit or a UnitEngine error is a null, not a crash.
 */
export function conversionForRecord(
  record: Pick<ResourcePriceRecord, 'unit' | 'notes'>,
  queryUnit: string,
  queryRawUnit?: string | null
): (UnitConversionApplied & { recordUnit: string }) | null {
  const fromUnit = canonicalUnitRegistry.normalize(record.unit);
  const toUnit = canonicalUnitRegistry.normalize(queryUnit);
  if (!fromUnit || !toUnit || fromUnit === toUnit) return null;

  // --- OJ ↔ OH: documented work-hours basis only (§5 §8.1–8.2) ---
  // DIRECTION RULE (§6 finisher fix, 2026-11-16 — the OJ homonym is
  // ASYMMETRIC, and the original §6 code got one direction wrong):
  //   - OJ→OH (record OJ, query OH): ALWAYS allowed when the record
  //     documents workHoursPerDay. The record's OJ is hourly BY
  //     CONSTRUCTION (LABOR source: OJ = OH / N), and the query OH is
  //     unambiguously a day. Multiplying by N is sound.
  //   - OH→OJ (record OH, query OJ): TWO sub-cases by the query's RAW
  //     unit — the ONLY evidence of the query OJ's sense:
  //       (a) raw `jam` (hourly-sense): divide by the record's
  //           documented workHoursPerDay (§6 rule, unchanged).
  //       (b) raw `OJ` (native, daily-sense — §5 §8): factor 1. A daily
  //           OH price IS the daily OJ price (§7 1:1 daily transfer).
  //           Dividing it by 7 would be a 7× underprice (measured:
  //           L.04 Tukang Batu @OJ went Rp175.000 → Rp25.000).
  //     A missing or ambiguous raw unit fails closed (no conversion).
  const isLaborTimePair =
    (fromUnit === 'OJ' && toUnit === 'OH') || (fromUnit === 'OH' && toUnit === 'OJ');
  if (isLaborTimePair) {
    if (fromUnit === 'OH') {
      // OH→OJ: branch on the query OJ's sense (raw unit).
      if (isHourlyOjQuery(queryRawUnit)) {
        const hours = parseWorkHoursPerDay(record);
        if (hours === null) return null;
        return {
          recordUnit: record.unit,
          fromUnit: record.unit,
          toUnit: queryUnit,
          factor: 1 / hours,
          basis: `workHoursPerDay=${hours} (documented on the LABOR source record; query OJ is hourly-sense: raw unit jam)`,
        };
      }
      // MASTER PRICING §7 — 1:1 daily transfer (native-OJ query).
      if (isNativeOjQuery(queryRawUnit)) {
        return {
          recordUnit: record.unit,
          fromUnit: record.unit,
          toUnit: queryUnit,
          factor: 1,
          basis:
            'OJ-day ≡ OH-day 1:1 (§7.1: native-OJ query is a day per §5 §8; HSD prices all labor in OJ at daily rates; same role, same price, different label — no hours basis needed for a same-scale identity)',
        };
      }
      return null;
    }
    const hours = parseWorkHoursPerDay(record);
    if (hours === null) return null;
    return {
      recordUnit: record.unit,
      fromUnit: record.unit,
      toUnit: queryUnit,
      factor: hours,
      basis: `workHoursPerDay=${hours} (documented on the LABOR source record; OJ = OH / ${hours})`,
    };
  }

  // --- Dimensional whitelist via the two unit authorities (audit I-6) ---
  if (!isWhitelistedPair(fromUnit, toUnit)) return null;
  if (!canonicalUnitRegistry.areDimensionallyCompatible(fromUnit, toUnit)) return null;
  let factor: number;
  try {
    factor = UnitEngine.convert(1, toUnit, fromUnit);
  } catch {
    return null;
  }
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return {
    recordUnit: record.unit,
    fromUnit: record.unit,
    toUnit: queryUnit,
    factor,
    basis: `dimensional whitelist ${fromUnit}↔${toUnit} (CanonicalUnitRegistry + UnitEngine.convert)`,
  };
}

/**
 * Units a query unit can convert FROM (for the resolver's fallback pool
 * lookup). Dimensional pairs from the whitelist + the OJ↔OH labor pair.
 * The OJ↔OH entries are candidates only — each record still needs its
 * own documented basis to convert (conversionForRecord decides per
 * record). The OH entry for a query OJ is offered when the query OJ's
 * sense is known — hourly (`jam`, ÷N) or native daily (`OJ`, §7 1:1
 * transfer); an OJ query with no usable raw unit gets no OH entry
 * (fail closed — the sense is unknown).
 */
export function convertibleUnitsFor(queryUnit: string, queryRawUnit?: string | null): string[] {
  const toUnit = canonicalUnitRegistry.normalize(queryUnit);
  const out: string[] = [];
  for (const [x, y] of DIMENSIONAL_CONVERSION_PAIRS) {
    if (x === toUnit) out.push(y);
    else if (y === toUnit) out.push(x);
  }
  if (toUnit === 'OH') out.push('OJ');
  else if (toUnit === 'OJ' && (isHourlyOjQuery(queryRawUnit) || isNativeOjQuery(queryRawUnit))) out.push('OH');
  return out;
}

// ===========================================================================
// (d) MASTER PRICING §7 — UNIT-ANNOTATION STRIPPING, OJ SENSE, VALIDATION,
//     OJ-BASIS CLASSIFICATION
// ===========================================================================

/**
 * Parenthetical unit tokens that are REDUNDANT with the unit field:
 * `Air (m3)` carries its unit twice (name + unit column), and the
 * redundant token breaks exact-name matching (`air m3` ≠ `air`).
 * Stripping them from BOTH sides (index keys + query keys, via
 * `normResourceName` in resolver.ts) restores the match. Measured §7
 * impact: exactly 4 catalog rows rebind same-unit (`Air` @m3 →
 * `Air (m3)` Rp50.000 instead of the liter conversion Rp200.000);
 * every other stripped key is a 1-record pool, and the one multi-record
 * pool (`mesin bor|jam`) keeps its CK winner by domain tier.
 *
 * Deliberately EXCLUDES `pc`: PC is Portland Cement in this catalog,
 * not "piece" — stripping `(pc)` would corrupt cement names. Bare
 * trailing tokens are NOT stripped (a dimension like `cm` in
 * `Bata merah 5 x 11 x 22 cm` is specification, not annotation) —
 * parentheticals only.
 */
const UNIT_ANNOTATION_TOKENS = [
  'm3', 'm2', 'liter', 'ltr', 'buah', 'batang', 'lembar', 'hari',
  'roll', 'titik', 'ton', 'kg', 'cm', 'mm', 'bh', 'unit', 'set',
  'sak', 'ls', 'jam', 'oh', 'oj', 'm',
] as const;

const UNIT_ANNOTATION_RE = new RegExp(
  `\\(\\s*(?:${UNIT_ANNOTATION_TOKENS.join('|')})\\s*\\)`,
  'gi'
);

export function stripUnitAnnotation(name: string | undefined | null): string {
  return String(name || '').replace(UNIT_ANNOTATION_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Is the query's OJ native daily-sense? TRUE only for the literal raw
 * label `OJ` (case/space-insensitive) — the exact population §5 §8
 * proved daily-scale in the canonical catalog. Anything else
 * (`orangjam`, `orang-jam`, missing) is NOT native: it fails closed.
 */
export function isNativeOjQuery(queryRawUnit?: string | null): boolean {
  return String(queryRawUnit || '').trim().toLowerCase() === 'oj';
}

/**
 * Is the query's OJ hourly-sense? TRUE when the raw unit normalizes to
 * `jam` (normalizeUnitForType maps labor `jam` → OJ outside BM).
 */
export function isHourlyOjQuery(queryRawUnit?: string | null): boolean {
  return normalizeUnit(queryRawUnit || '') === 'jam';
}

/**
 * MASTER PRICING §7 — runtime validation of `location` / `period`.
 * Before §7, a string `location` was silently dropped (the query ran
 * as NATIONAL) and a string `period` silently BROKE resolution
 * (NOT_FOUND with `requestedPeriod: { month: null }`). Both are now
 * rejected with a descriptive TypeError — never silently dropped,
 * never silently coerced. No production caller passes strings
 * (verified 2026-11-16: canonicalPriceResolver passes proper objects;
 * componentPriceResolution + tools.ts pass neither).
 */
export function validateLocationPeriod(
  query: Pick<ResourcePriceQuery, 'location' | 'period'>
): void {
  const loc = query.location as unknown;
  if (loc !== undefined && loc !== null) {
    if (typeof loc !== 'object' || Array.isArray(loc)) {
      throw new TypeError(
        `resolveResourcePrice: location must be an object { provinceName?, regencyName?, cityName? }, ` +
          `got ${JSON.stringify(loc)} (${typeof loc}). Strings are not accepted — pass a structured location or omit it.`
      );
    }
    for (const k of ['provinceName', 'regencyName', 'cityName'] as const) {
      const v = (loc as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && typeof v !== 'string') {
        throw new TypeError(
          `resolveResourcePrice: location.${k} must be a string, got ${JSON.stringify(v)} (${typeof v}).`
        );
      }
    }
  }
  const per = query.period as unknown;
  if (per !== undefined && per !== null) {
    if (typeof per !== 'object' || Array.isArray(per)) {
      throw new TypeError(
        `resolveResourcePrice: period must be an object { year, month? }, ` +
          `got ${JSON.stringify(per)} (${typeof per}). Strings and numbers are not accepted — pass { year: 2026 } or omit it.`
      );
    }
    const year = (per as Record<string, unknown>).year;
    if (!Number.isInteger(year)) {
      throw new TypeError(
        `resolveResourcePrice: period.year must be an integer year, got ${JSON.stringify(year)} (${typeof year}).`
      );
    }
    const month = (per as Record<string, unknown>).month;
    if (month !== undefined && month !== null && (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12)) {
      throw new TypeError(
        `resolveResourcePrice: period.month must be an integer 1–12 (or null), got ${JSON.stringify(month)} (${typeof month}).`
      );
    }
  }
}

/** Sources whose OJ records are documented DAILY (§7, Probe C). */
const OJ_DAY_RECORD_SOURCES: ReadonlySet<string> = new Set([
  // HSD_2026: all 13 labor records are OJ at daily prices
  // (Rp120–220 rb) and HSD has NO OH labor records — OJ IS HSD's
  // day unit.
  'HSD_2026',
]);

/** Sources whose OJ records are documented HOURLY (§7, Probe C). */
const OJ_HOUR_RECORD_SOURCES: ReadonlySet<string> = new Set([
  // LABOR_2026: OJ = OH / workHoursPerDay by source definition, note
  // stamped on every OJ record (7/8).
  'LABOR_2026',
  // BM_HSD_2026: every BM OJ record is a twin — an hourly rate
  // relabelled OJ by the resolver's indexing (§6); BM publishes labor
  // in jam only.
  'BM_HSD_2026',
]);

/**
 * Basis of a QUERY's OJ, from the query's raw unit (the only evidence
 * of its sense). Null when the query unit is not OJ. A query with no
 * usable raw unit is OJ_UNDOCUMENTED — never guessed.
 */
export function classifyOjQueryBasis(
  queryUnit: string | undefined | null,
  queryRawUnit?: string | null
): OjBasis | null {
  if (canonicalUnitRegistry.normalize(queryUnit || '') !== 'OJ') return null;
  if (isNativeOjQuery(queryRawUnit)) return 'OJ_DAY';
  if (isHourlyOjQuery(queryRawUnit)) return 'OJ_HOUR';
  return 'OJ_UNDOCUMENTED';
}

/**
 * Basis of a RECORD's OJ, from the record's source (the only documented
 * evidence of an OJ record's basis). Null when the record unit is not
 * OJ. A record from any other source is OJ_UNDOCUMENTED.
 */
export function classifyOjRecordBasis(
  recordUnit: string | undefined | null,
  sourceKey: string | undefined | null
): OjBasis | null {
  if (canonicalUnitRegistry.normalize(recordUnit || '') !== 'OJ') return null;
  if (sourceKey && OJ_DAY_RECORD_SOURCES.has(sourceKey)) return 'OJ_DAY';
  if (sourceKey && OJ_HOUR_RECORD_SOURCES.has(sourceKey)) return 'OJ_HOUR';
  return 'OJ_UNDOCUMENTED';
}

function ojQueryEvidence(queryBasis: OjBasis): string {
  switch (queryBasis) {
    case 'OJ_DAY':
      return 'query OJ daily (raw unit OJ, §5 §8)';
    case 'OJ_HOUR':
      return 'query OJ hourly (raw unit jam)';
    case 'OJ_UNDOCUMENTED':
      return 'query OJ basis undocumented (no usable raw unit)';
  }
}

function ojRecordEvidence(recordBasis: OjBasis, sourceKey: string): string {
  switch (recordBasis) {
    case 'OJ_DAY':
      return 'record OJ daily (HSD: all labor OJ at daily prices, no OH records)';
    case 'OJ_HOUR':
      return sourceKey === 'BM_HSD_2026'
        ? 'record OJ hourly (BM twin: hourly rate relabelled OJ)'
        : 'record OJ hourly (LABOR: OJ = OH / workHoursPerDay)';
    case 'OJ_UNDOCUMENTED':
      return `record OJ basis undocumented (source ${sourceKey || 'unknown'})`;
  }
}

/**
 * Assemble the §7 OJ-basis flag for a resolution, from the query (raw
 * unit) + the resolution (winner's unit/source/conversion). Returns
 * null when NEITHER side is OJ (non-OJ resolutions stay clean).
 *
 * The winning record's unit is the conversion's fromUnit when the price
 * was converted (the resolution's unit is the QUERY unit then), else
 * the resolution's unit. NOT_FOUND resolutions carry the query basis
 * only (no record exists); project stored prices (snapshot/override)
 * carry the query basis only (no master record exists).
 */
export function ojBasisFlagFor(
  query: Pick<ResourcePriceQuery, 'unit' | 'rawUnit'>,
  resolution: Pick<ResourcePriceResolution, 'status' | 'unit' | 'source' | 'unitConversion'>
): OjBasisFlag | null {
  const queryBasis = classifyOjQueryBasis(query.unit, query.rawUnit);
  let recordBasis: OjBasis | null = null;
  const sourceKey = resolution.source?.key ?? '';
  const isProjectPrice = sourceKey === 'SNAPSHOT_PRICE' || sourceKey === 'PROJECT_OVERRIDE';
  if (resolution.status === 'RESOLVED' && !isProjectPrice) {
    const recordUnit = resolution.unitConversion?.fromUnit ?? resolution.unit;
    recordBasis = classifyOjRecordBasis(recordUnit, sourceKey);
  }
  if (queryBasis === null && recordBasis === null) return null;
  const basisMismatch =
    (queryBasis === 'OJ_DAY' && recordBasis === 'OJ_HOUR') ||
    (queryBasis === 'OJ_HOUR' && recordBasis === 'OJ_DAY');
  const evidenceParts: string[] = [];
  if (queryBasis !== null) evidenceParts.push(ojQueryEvidence(queryBasis));
  if (recordBasis !== null) evidenceParts.push(ojRecordEvidence(recordBasis, sourceKey));
  return {
    queryBasis,
    recordBasis,
    basisMismatch,
    evidence: evidenceParts.join('; '),
  };
}

// ===========================================================================
// (b) PROJECT PRICING CONTEXT (§6.1 step 4 + §10)
// ===========================================================================

/** Effective mode of a context: absent context (or absent mode) = LIVE. */
export function resolvePricingMode(context?: ProjectPricingContext | null): ProjectPricingMode {
  return context?.pricingMode || 'LIVE_MASTER_PRICE';
}

/**
 * Component-key construction for context maps. Keys use PLAIN unit
 * normalization (`normalizeUnit`) on both sides (builder + lookup) — NOT
 * the type-aware `normalizeUnitForType` — so a snapshot built from raw
 * component units matches the resolver's lookup for the same components.
 * Code key first, name key for codeless components.
 */
export function contextCodeKey(code: string | undefined | null, unit: string | undefined | null): string {
  if (!code) return '';
  return `${looseCode(code)}|${normalizeUnit(unit || '')}`;
}

export function contextNameKey(name: string | undefined | null, unit: string | undefined | null): string {
  if (!name) return '';
  return `${normalizeName(name)}|${normalizeUnit(unit || '')}`;
}

/**
 * Look a component price up in a context map: code key first, then name
 * key. Returns null when the map has no price for the component — the
 * caller then falls back to live resolution (and records the fallback),
 * never invents a price.
 */
export function lookupContextPrice(
  ref: ComponentPriceMapRef | null | undefined,
  code: string | undefined | null,
  name: string | undefined | null,
  unit: string | undefined | null
): number | null {
  if (!ref) return null;
  const byCode = contextCodeKey(code, unit);
  if (byCode && typeof ref.pricesByComponentKey[byCode] === 'number') {
    return ref.pricesByComponentKey[byCode];
  }
  const byName = contextNameKey(name, unit);
  if (byName && typeof ref.pricesByComponentKey[byName] === 'number') {
    return ref.pricesByComponentKey[byName];
  }
  return null;
}

/**
 * Build a context map from priced components (e.g. an AHSPProjectSnapshot's
 * component arrays, or a set of project overrides). Components without a
 * usable positive price are skipped (a missing price stays missing — it
 * is never stored as Rp0). Each component contributes its code key when
 * it has a code, otherwise its name key.
 */
export function buildComponentPriceRef(
  components: ReadonlyArray<{
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    unitPrice?: number | null;
  }>,
  opts?: { label?: string | null; masterPriceVersion?: string | null; ahspDatabaseVersion?: string | null }
): ComponentPriceMapRef {
  const pricesByComponentKey: Record<string, number> = {};
  for (const c of components) {
    if (typeof c.unitPrice !== 'number' || !Number.isFinite(c.unitPrice) || c.unitPrice <= 0) continue;
    const key = contextCodeKey(c.code, c.unit) || contextNameKey(c.name, c.unit);
    if (!key) continue;
    // First write wins per key: a snapshot holds one price per component
    // key, and a later duplicate must not silently overwrite it.
    if (!(key in pricesByComponentKey)) pricesByComponentKey[key] = c.unitPrice;
  }
  return {
    pricesByComponentKey,
    label: opts?.label ?? null,
    masterPriceVersion: opts?.masterPriceVersion ?? null,
    ahspDatabaseVersion: opts?.ahspDatabaseVersion ?? null,
  };
}
