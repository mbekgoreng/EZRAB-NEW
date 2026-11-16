/**
 * EZRAB PRICE 2026 — MATCHER HARDENING (DB-sync Fase 2, PIPELINE-LOCAL)
 * ====================================================================
 *
 * Pipeline-local hardening of the price matcher. This module is imported ONLY
 * by the build-time pipeline (`scripts/price2026/*`) and the DB-sync audit
 * ladder — NEVER by the runtime resolver. The shared primitives in
 * `src/data/priceDatabase2026/normalize.ts` are untouched: every function here
 * wraps them (never re-implements normalization) and adds pipeline-only gates.
 *
 * Rules (koordinator Fase 2, bukti di phase1-audit.md):
 *
 *  (a) Roster aliases as name candidates — `aliases[]` on the labor/equipment
 *      rosters are DATA (roster-authored alternative names), not guesses. The
 *      matcher scores them alongside the primary name. Two aliases are
 *      DENYLISTED with documented reasons (see ROSTER_ALIAS_DENYLIST):
 *      they are proven misleading, not merely uncertain.
 *
 *  (b) Code matching DISABLED for EQUIPMENT_2026 + COMMERCIAL_2026 — both
 *      proven to run their own numbering schemes, not AHSP codes (Fase 1
 *      §3.2: of 17 bound equipment rows only 2 codes agreed by chance).
 *      Name-only matching still applies; explicit ALIAS rules still apply.
 *
 *  (c) Spec-number rule — numeric specification tokens (dimensions `30x30`,
 *      diameters `dia 63 mm` / `3"`, cross-sections `90 mm2`, angles `90°`,
 *      size ranges `0-5`) must agree when present on BOTH sides: compatible
 *      iff either side is empty or one set is a SUBSET of the other (a
 *      subset is a less complete description of the same product, e.g. a
 *      source label that lost one dimension to extraction corruption).
 *      Disjoint values conflict (`50 mm` vs `50 cm`, `90°` vs `45°`).
 *      Pipe diameters are compared on the NOMINAL (DN) scale, so dual
 *      notation (`Ø 24" (600 mm)`) collapses to one token instead of
 *      conflicting. Fractional inches allow spaces (`3 / 4 Inch` = `3/4"`).
 *      Trailing M-size is case-sensitive uppercase M (`M8` yes, `(m3)` no).
 *      Capacity/tonnage (`10-15 Ton`) is DELIBERATELY not a spec token:
 *      it is a rental class, not an identity dimension (known limitation,
 *      reported in phase2-sync.md).
 *
 *  (d) Token-boundary containment — the old `String.includes` containment
 *      scored `amp` ⊂ `stamper` (and ⊂ `amplas`) as a 0.90 match. Containment
 *      now requires a contiguous TOKEN subsequence (spelling-tolerant per
 *      token) AND coverage ≥ 0.25 of the longer name's tokens, so a passing
 *      mention (`batu bata` inside a 16-token chamber name, coverage 0.14)
 *      no longer binds — while a product name with modifiers ("Truck Mixer"
 *      inside a 5-token mixer-truck name, coverage 0.40) still does.
 *      Applies to NAME_UNIT scoring and to the code-match name gate.
 *
 *  (e) Bina Marga adapter rows: code+unit binding WITHOUT the name gate,
 *      with an explicit exception list (BM_CODE_BIND_BLOCKED_*). The adapter
 *      is not a pipeline source, so this rule lives in the AUDIT LADDER
 *      (match2), not in matchPricesToResources.ts — the constants live here
 *      so ladder and pipeline share one list. Workbook proof per code is in
 *      phase2-sync.md §1(e).
 *
 *  (+) Token dictionary — `geotextile=geotekstil` (proven: BM workbook M23
 *      carries both spellings for the same row). Applied as whole-token
 *      replacement AFTER normalizeName, so it cannot create substring
 *      matches.
 *
 *  (+) OJ twin (L03|OJ Mandor) — the runtime resolver indexes BM-adapter
 *      labor rows with unit `jam` ALSO as `OJ`. The pipeline has no adapter
 *      rows, so the twin is implemented in the AUDIT LADDER only
 *      (twinUnitsForBmLabor). NO alias rule is written for L03|OJ: the only
 *      pipeline Mandor row (LAB-004, code L.04) already binds L04|OJ, and an
 *      alias would steal it. See phase2-sync.md §2.
 */

import {
  normalizeName,
  nameTokens,
  tokenEquivalent,
} from '../../src/data/priceDatabase2026/normalize';

// ===========================================================================
// (b) code matching disabled for these sources (own numbering schemes)
// ===========================================================================

export const CODE_MATCH_DISABLED_SOURCES: ReadonlySet<string> = new Set([
  'EQUIPMENT_2026',
  'COMMERCIAL_2026',
]);

// ===========================================================================
// (a) roster-alias denylist — proven misleading, never auto-accepted
// ===========================================================================

/** Normalized alias -> why it must never bind (evidence in phase2-sync.md). */
export const ROSTER_ALIAS_DENYLIST: ReadonlyMap<string, string> = new Map([
  [
    'ahli mekanika tanah',
    'LAB-ENG-002 (Geotechnical Engineer) alias; mekanika tanah (soil mechanics) is not ' +
      'Mekanik (machine mechanic, key L08|OJ). Would bind via mekanika~mekanik prefix tolerance.',
  ],
  [
    'stamper gilas',
    'EQP-010 (Baby Roller / Walk-Behind Compactor) alias; a walk-behind roller is not ' +
      'key E25 Stamper (tamping rammer). The faithful alias Baby Roller binds E19A instead.',
  ],
]);

export function isDeniedRosterAlias(alias: string): boolean {
  return ROSTER_ALIAS_DENYLIST.has(normalizeName(alias));
}

// ===========================================================================
// (+) token dictionary (whole-token, applied after normalizeName)
// ===========================================================================

export const TOKEN_DICTIONARY: ReadonlyMap<string, string> = new Map([
  // BM workbook M23 carries both spellings for the same row (rows 267-268).
  ['geotextile', 'geotekstil'],
]);

/** normalizeName + whole-token dictionary replacement. */
export function pipelineNormalizeName(name: string): string {
  const norm = normalizeName(name);
  if (!norm) return '';
  return norm
    .split(' ')
    .map((t) => TOKEN_DICTIONARY.get(t) || t)
    .join(' ');
}

/** nameTokens over the dictionary-applied normalized name. */
export function pipelineNameTokens(name: string): string[] {
  return nameTokens(pipelineNormalizeName(name));
}

// ===========================================================================
// (c) spec-number rule
// ===========================================================================

/** Nominal pipe sizes (mm) recognised for DN equivalence. */
const NOMINAL_MM = new Set([
  15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600,
]);

/** Inch -> nominal mm (standard DN table). */
const INCH_TO_NOMINAL_MM: Record<string, number> = {
  '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40, '2': 50, '2.5': 65,
  '3': 80, '4': 100, '5': 125, '6': 150, '8': 200, '10': 250, '12': 300,
  '14': 350, '16': 400, '18': 450, '20': 500, '24': 600,
};

function fmtNum(n: number): string {
  // Canonical number rendering: strip trailing zeros (2.50 -> "2.5").
  return String(Math.round(n * 1000) / 1000);
}

function mmToken(mm: number): string {
  const rounded = Math.round(mm * 100) / 100;
  if (NOMINAL_MM.has(rounded)) return `mm:DN${rounded}`;
  return `mm:${fmtNum(rounded)}`;
}

function inchToken(inches: number): string {
  const key = fmtNum(Math.round(inches * 1000) / 1000);
  const nominal = INCH_TO_NOMINAL_MM[key];
  if (nominal !== undefined) return `mm:DN${nominal}`;
  return `mm:IN${key}`;
}

/**
 * Extract normalized spec tokens from a raw (unnormalized) name.
 * Classes: `mm:*` (any mm/cm/inch/DN/diameter measurement, nominal-normalized),
 * `area:*` (cross-section mm2/mm², e.g. cable sizes), `dim:AxB` (sorted
 * dimension pair), `angle:N`, `range:A-B` (bare number range), `msize:N`
 * (trailing uppercase M-number, e.g. Wiremesh M8).
 */
export function extractSpecTokens(rawName: string): string[] {
  const out = new Set<string>();
  // Work on a lowercased copy; decimal commas -> dots (Indonesian "2,5\"").
  let s = String(rawName || '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[×]/g, 'x')
    .replace(/[²]/g, '2')
    .replace(/[“”]/g, '"');

  const take = (re: RegExp, fn: (m: RegExpExecArray) => string | string[] | null): void => {
    let m: RegExpExecArray | null;
    // Reset per call; global regexes are stateful.
    re.lastIndex = 0;
    const hits: Array<{ index: number; length: number }> = [];
    while ((m = re.exec(s)) !== null) {
      const tok = fn(m);
      if (tok) {
        if (Array.isArray(tok)) {
          for (const t of tok) out.add(t);
        } else {
          out.add(tok);
        }
      }
      hits.push({ index: m.index, length: m[0].length });
      if (m[0].length === 0) break;
    }
    // Blank matched spans (right-to-left) so later patterns cannot re-match them.
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      s = s.slice(0, h.index) + ' '.repeat(h.length) + s.slice(h.index + h.length);
    }
  };

  // 1. Fractional inches: 2-1/2", 1/2", 3/4" — spaces around '/' and '-'
  //    are allowed ("3 / 4 Inch" is the same 3/4" as "3/4\""; without this,
  //    "3 / 4 Inch" falls through to plain inches and misreads as 4" = DN100).
  //    (before bare ranges eat "2-1").
  take(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)\s*(?:"|inch\b)/g, (m) => {
    const v = parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
    return inchToken(v);
  });
  take(/(\d+)\s*\/\s*(\d+)\s*(?:"|inch\b)/g, (m) => {
    const v = parseInt(m[1], 10) / parseInt(m[2], 10);
    return inchToken(v);
  });
  // 2. Plain inches: 3", 24", 1.5 inch.
  take(/(\d+(?:\.\d+)?)\s*(?:"|inch\b)/g, (m) => inchToken(parseFloat(m[1])));
  // 3. Dimension pairs: 30x30, 30 x 30 (sorted: 30x60 == 60x30).
  //    NOT when followed by mm2: "4x10 mm2" is 4 cores x 10 mm² cross-section,
  //    not a 4x10 dimension — the area rule (step 5) owns that span.
  //    The (?!\d) guard stops the second group backtracking to a prefix of a
  //    longer number ("4x1" of "4x10") just to satisfy the mm2 lookahead.
  take(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?!\d)(?!\s*mm2\b)/g, (m) => {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return `dim:${fmtNum(lo)}x${fmtNum(hi)}`;
  });
  // 4. Bare ranges: 0-5, 5-10, 14-20 (BEFORE mm/cm so "14 - 20 mm" is one
  //    range token, not the point value 20 mm). Also capacity ranges like
  //    10-15 Ton — harmless: they only conflict when BOTH sides carry a
  //    differing range.
  take(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/g, (m) => {
    return `range:${fmtNum(parseFloat(m[1]))}-${fmtNum(parseFloat(m[2]))}`;
  });
  // 5. Cross-section area: "90 mm2" / "90 mm²" (cable sizes). BEFORE plain
  //    mm so the span is blanked; mm2 must never become a diameter token.
  //    (Without this, NYFGBY 70/90/95/120 mm2 cables are indistinguishable:
  //    "mm2" is a stopword and bare numbers drop from tokens, so every size
  //    ties at 0.92 and the binding is lost to ambiguity.)
  //    Core count rides with the area: "2 x 10 mm2" and "2C - 10 mm2" are both
  //    2-core 10 mm² cable. The count is otherwise invisible (single digits
  //    drop from tokens), so without it a 2-core row scores 1.00 against a
  //    3-core key ("Kabel NYFGBY 3 x 10 mm2" tokenises identically).
  take(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*mm2\b/g, (m) => [
    `cores:${fmtNum(parseFloat(m[1]))}`,
    `area:${fmtNum(parseFloat(m[2]))}`,
  ]);
  take(/(\d+)\s*c\s*-\s*(\d+(?:\.\d+)?)\s*mm2\b/g, (m) => [
    `cores:${fmtNum(parseFloat(m[1]))}`,
    `area:${fmtNum(parseFloat(m[2]))}`,
  ]);
  take(/(\d+(?:\.\d+)?)\s*mm2\b/g, (m) => `area:${fmtNum(parseFloat(m[1]))}`);
  // 6. Diameters / mm / cm / DN: "dia 63 mm", "Ø 63", "63mm", "50 cm", "DN 100".
  take(/(?:dia\.?|diameter|ø|dn\.?)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/g, (m) => {
    const v = parseFloat(m[1]) * (m[2] === 'cm' ? 10 : 1);
    return mmToken(v);
  });
  take(/\bdn\.?\s*(\d+(?:\.\d+)?)\b/g, (m) => mmToken(parseFloat(m[1])));
  take(/[ø]\s*(\d+(?:\.\d+)?)\b/g, (m) => mmToken(parseFloat(m[1])));
  // 7. Angles: 90°, 45°.
  take(/(\d+(?:\.\d+)?)\s*°/g, (m) => `angle:${fmtNum(parseFloat(m[1]))}`);
  // 8. Trailing M-size: "Wiremesh M8" (last token only, so "M3 PC" never
  //    matches). Case-SENSITIVE uppercase M on the RAW token: "(m3)" is a
  //    cubic-metre unit annotation, not a bolt size — it must not become
  //    msize:3 ("Air (m3)" vs "Air (m2)" would otherwise falsely conflict).
  const rawTokens = String(rawName || '').trim().split(/\s+/).filter(Boolean);
  const lastRaw = (rawTokens[rawTokens.length - 1] || '').replace(/[.,;:()]+$/, '');
  const mm = /^M(\d+)$/.exec(lastRaw);
  if (mm) out.add(`msize:${mm[1]}`);

  return [...out].sort();
}

/**
 * True when two spec-token sets are compatible: either side empty, or one set
 * is a SUBSET of the other. A subset means one side is a less complete
 * description of the same product (e.g. a source label that lost one
 * dimension to extraction corruption: {200,250} ⊆ {150,200,250}); it is NOT
 * a conflict. A conflict is disjoint values for the same kind of measurement
 * ({DN50} vs {DN500}, {90°} vs {45°}, {0-5} vs {5-10}) — neither side a
 * subset of the other. Known trade-off: a row carrying EXTRA specs beyond
 * the key (e.g. a 50x100 reducer vs a plain 50 mm pipe key) stays compatible;
 * the name gate remains the backstop there.
 */
export function specSetsCompatible(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const sa = new Set(a);
  const sb = new Set(b);
  return a.every((t) => sb.has(t)) || b.every((t) => sa.has(t));
}

/** Convenience wrapper over raw names. */
export function specTokensCompatible(aName: string, bName: string): boolean {
  return specSetsCompatible(extractSpecTokens(aName), extractSpecTokens(bName));
}

// ===========================================================================
// (d) token-boundary containment + token-only similarity
// ===========================================================================

/**
 * Jaccard overlap of significant tokens (tokenEquivalent spelling tolerance).
 * Identical to nameBindingScore MINUS its substring-containment shortcut:
 * `amp` vs `stamper` scores 0 here, not 0.9.
 */
export function tokenBoundaryBindingScore(aNorm: string, bNorm: string): number {
  const ta = nameTokens(aNorm);
  const tb = nameTokens(bNorm);
  if (ta.length === 0 || tb.length === 0) return 0;
  if (aNorm === bNorm) return 1;
  const shared = ta.filter((t) => tb.some((u) => tokenEquivalent(t, u))).length;
  const union = ta.length + tb.length - shared;
  return union === 0 ? 0 : shared / union;
}

/** True when `short` is a contiguous subsequence of `long` (per-token equivalence). */
export function isTokenSubsequence(short: readonly string[], long: readonly string[]): boolean {
  if (short.length === 0 || short.length > long.length) return false;
  for (let start = 0; start + short.length <= long.length; start++) {
    let ok = true;
    for (let i = 0; i < short.length; i++) {
      if (!tokenEquivalent(short[i], long[start + i])) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Minimum fraction of the longer name's tokens the shorter must cover to bind by containment. */
export const CONTAINMENT_COVERAGE_MIN = 0.25;

/**
 * Pipeline-local strict fuzzy name rule (replaces strictNameMatch in the
 * pipeline only). Inputs are dictionary-applied normalized names/tokens;
 * spec arrays are precomputed with extractSpecTokens.
 *
 * Differences from the original (all pipeline-local):
 *  - containment requires a TOKEN subsequence (not String.includes) + coverage
 *    >= CONTAINMENT_COVERAGE_MIN of the longer name's tokens;
 *  - the fallback is tokenBoundaryBindingScore (no substring containment);
 *  - a spec-token conflict returns 0 outright.
 */
export function pipelineStrictNameMatch(
  aNorm: string,
  aTokens: readonly string[],
  bNorm: string,
  bTokens: readonly string[],
  aSpec: readonly string[],
  bSpec: readonly string[]
): number {
  if (!aNorm || !bNorm) return 0;
  if (!specSetsCompatible(aSpec, bSpec)) return 0;
  if (aNorm === bNorm) return 1;
  const short = aNorm.length <= bNorm.length ? { n: aNorm, t: aTokens } : { n: bNorm, t: bTokens };
  const longTokens = aNorm.length <= bNorm.length ? bTokens : aTokens;
  if (short.t.length >= 2 && longTokens.length > 0 && isTokenSubsequence(short.t, longTokens)) {
    const coverage = short.t.length / longTokens.length;
    if (coverage >= CONTAINMENT_COVERAGE_MIN) return 0.92;
    // Containment without coverage falls through to Jaccard (a passing mention
    // scores low there and will not bind).
  }
  if (
    short.t.length === 1 &&
    short.t[0].length >= 4 &&
    longTokens.length > 0 &&
    tokenEquivalent(longTokens[0], short.t[0])
  ) {
    return 0.88;
  }
  return tokenBoundaryBindingScore(aNorm, bNorm);
}

/**
 * Pipeline-local name-compatibility score for the CODE gate (replaces
 * nameSimilarity in the pipeline only): token-ratio normalized by the SHORTER
 * name, capped at 0.85 — WITHOUT the substring-containment 0.9 shortcut, plus
 * the dictionary and the spec gate. Same 0.34 threshold applies.
 */
export function pipelineNameCompatible(aName: string, bName: string): number {
  if (!specTokensCompatible(aName, bName)) return 0;
  const na = pipelineNormalizeName(aName);
  const nb = pipelineNormalizeName(bName);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = nameTokens(na);
  const tb = nameTokens(nb);
  if (ta.length === 0 || tb.length === 0) return 0;
  const shared = ta.filter((t) => tb.some((u) => tokenEquivalent(t, u))).length;
  return Math.min(0.85, shared / Math.min(ta.length, tb.length));
}

// ===========================================================================
// (e) BM adapter code+unit binding — exceptions (ladder rule; see header)
// ===========================================================================

/** Adapter-BM loose codes that must NEVER bind by code+unit without a name gate. */
export const BM_CODE_BIND_BLOCKED_CODES: ReadonlySet<string> = new Set([
  'M05', // workbook: Abu Terbang + Debu Marmer + Fly Ash + Filler, all @700 — true collision
  'E41', // workbook: Asphalt Distributor + Asphalt Slurry Seal Truck, same price — true collision
  'E07', // swap question pending owner/PDF decision — do not bind (task instruction)
  'E11', // swap question pending owner/PDF decision — do not bind (task instruction)
]);

/** Adapter-row labels that must never auto-bind (normalized substring match). */
export const BM_CODE_BIND_BLOCKED_LABELS: readonly string[] = [
  'belum tersedia', // placeholder label ("not yet available") — needs human review
];

/** True when an adapter-BM row may bind by code+unit without the name gate. */
export function bmAdapterCodeBindAllowed(looseCode: string, rowName: string): boolean {
  if (BM_CODE_BIND_BLOCKED_CODES.has(looseCode)) return false;
  const n = normalizeName(rowName);
  if (BM_CODE_BIND_BLOCKED_LABELS.some((lbl) => n.includes(lbl))) return false;
  return true;
}

// ===========================================================================
// (+) OJ twin (L03|OJ Mandor) — ladder-only helper; see header
// ===========================================================================

/**
 * Units a Bina Marga adapter LABOR row answers under. The runtime resolver
 * indexes BM labor rows with unit `jam` ALSO as `OJ` (resolver.ts twin rule);
 * the audit ladder mirrors it so L03|OJ Mandor counts as bound.
 */
export function twinUnitsForBmLabor(unit: string): string[] {
  return unit === 'jam' ? ['jam', 'OJ'] : [unit];
}
