/**
 * EZRAB PRICE DATABASE 2026 — SHARED NORMALIZATION PRIMITIVES
 * ===========================================================
 *
 * Pure, dependency-free, side-effect-free. Imported by BOTH the runtime price
 * resolver (`src/data/priceDatabase2026/resolver.ts`) and the build-time pipeline
 * (`scripts/price2026/*`) so the two can never drift apart.
 *
 * Nothing here reads a file, a clock or the network: every function is a pure
 * function of its arguments, which is what makes price resolution reproducible.
 */

import type { ResourceClassification } from './types';

// ============================================================================
// CODE NORMALIZATION
// ============================================================================

/**
 * Normalized code — uppercase, whitespace removed, dots collapsed.
 * Keeps dots, because `L.01` and `L01` are DIFFERENT code spaces and must only be
 * unified deliberately (see `looseCode`).
 */
export function normalizeCode(code: string): string {
  if (!code) return '';
  return String(code)
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
}

/**
 * Loose code — strips every separator so `L.01` == `L01` == `L-01`.
 * Used ONLY for the `NORMALIZED_CODE_UNIT` tier, and only when the candidate is
 * unique AND the names are compatible.
 */
export function looseCode(code: string): string {
  if (!code) return '';
  return String(code)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// ============================================================================
// TYPE INFERENCE FROM CODE PREFIX
// ============================================================================

/**
 * Resource classification inferred from the code prefix.
 *
 * This is the RELIABLE signal in this repository, because the canonical AHSP
 * extraction mis-files a large block of MATERIAL resources into `laborComponents`
 * (rows coded `M03`, `M14`, `M170`, …). Typing those by which component array they
 * appeared in makes every material price source fail the type gate.
 *
 * Order matters: `EI*` is a MATERIAL code space (`EI311` = "Galian tanah biasa") even
 * though it starts with `E`, so it must be tested before the equipment rule.
 */
export function typeFromCodePrefix(loose: string): ResourceClassification {
  if (!loose) return 'UNKNOWN';
  if (/^L/.test(loose)) return 'LABOR';
  if (/^EI/.test(loose)) return 'MATERIAL';
  if (/^E/.test(loose) || /^AL/.test(loose) || /^T\./.test(loose) || /^T\d/.test(loose) || /^G/.test(loose)) {
    return 'EQUIPMENT';
  }
  if (/^M|^MT|^B|^C|^D|^A|^K/.test(loose)) return 'MATERIAL';
  return 'UNKNOWN';
}

const TYPE_TO_COMPONENT_KEY: Record<string, 'material' | 'labor' | 'equipment'> = {
  MATERIAL: 'material',
  LABOR: 'labor',
  EQUIPMENT: 'equipment',
};

/**
 * Lowercase component-array key ('material' | 'labor' | 'equipment') inferred from a
 * resource code, or '' when the prefix is not recognised.
 */
export function componentTypeFromCode(code: string): 'material' | 'labor' | 'equipment' | '' {
  const t = typeFromCodePrefix(looseCode(code));
  return TYPE_TO_COMPONENT_KEY[t] || '';
}

// ============================================================================
// UNIT NORMALIZATION
// ============================================================================

/**
 * Documented unit map. PHASE 10.
 *
 * OH (orang-hari), OJ (orang-jam) and jam (hour) are DELIBERATELY kept distinct:
 * conflating them produces a ~7× labour error. A conversion between them is only
 * ever applied when a documented factor exists (see `unitConversionFactor`).
 */
const UNIT_MAP: Record<string, string> = {
  // length
  m: 'm', m1: 'm', "m'": 'm', meter: 'm', metre: 'm', mtr: 'm',
  // area
  m2: 'm2', 'm²': 'm2', meterpersegi: 'm2', meter2: 'm2',
  // volume
  m3: 'm3', 'm³': 'm3', meterkubik: 'm3', meter3: 'm3', kubik: 'm3',
  // mass
  kg: 'kg', kilogram: 'kg', kilo: 'kg', kgm: 'kg',
  // piece / count
  bh: 'bh', buah: 'bh', pcs: 'bh', pc: 'bh', unit: 'unit', set: 'set', titik: 'titik', ttk: 'titik',
  // packaging
  sak: 'sak', zak: 'sak', bag: 'sak',
  // sticks / sheets
  btg: 'batang', batang: 'batang', lbr: 'lembar', lembar: 'lembar',
  // time-based labour — kept DISTINCT
  oh: 'OH', 'org/hari': 'OH', oranghari: 'OH', oranghari_: 'OH', 'orang-hari': 'OH',
  oj: 'OJ', 'org/jam': 'OJ', orangjam: 'OJ', 'orang-jam': 'OJ', manhour: 'OJ', manhour_: 'OJ',
  jam: 'jam', hour: 'jam', hrs: 'jam', hr: 'jam',
  hari: 'hari', day: 'hari', days: 'hari',
  // liquid
  ltr: 'liter', liter: 'liter', litre: 'liter', l: 'liter', l_: 'liter',
  // lump sum
  ls: 'ls', lumpsum: 'ls', 'lump sum': 'ls',
  // misc
  km: 'km', ton: 'ton', mpa: 'mpa', roll: 'roll', bln: 'bulan', bulan: 'bulan',
  tahun: 'tahun', thn: 'tahun', sbln: 'set/bulan', 'set/bln': 'set/bulan',
};

export function normalizeUnit(unit: string): string {
  if (!unit) return '';
  const key = String(unit).trim().toLowerCase().replace(/\s+/g, '');
  if (UNIT_MAP[key]) return UNIT_MAP[key];
  const stripped = key.replace(/[.)\]]+$/, '');
  if (UNIT_MAP[stripped]) return UNIT_MAP[stripped];
  return key;
}

/**
 * A documented, one-directional conversion factor between two units, or null.
 * Deliberately tiny: we only convert what the source documents.
 */
export function unitConversionFactor(from: string, to: string): number | null {
  const f = normalizeUnit(from);
  const t = normalizeUnit(to);
  if (!f || !t) return null;
  if (f === t) return 1;
  return null;
}

/**
 * TYPE-AWARE unit normalization.
 *
 * `jam` is genuinely ambiguous: for EQUIPMENT it is a machine-hour, for LABOR it is
 * a person-hour — which is exactly what `OJ` (orang-jam) means. The canonical AHSP
 * prints labour in `jam` while the labour master prices it as `OJ`, so without this
 * mapping every labour resource would be rejected on a unit mismatch that is not a
 * real mismatch. Equipment is left untouched so machine-hours never collide with
 * person-hours.
 */
export function normalizeUnitForType(unit: string, type: string | undefined, domain?: string): string {
  const u = normalizeUnit(unit);
  const t = String(type || '').toLowerCase();
  if (t === 'labor' && u === 'jam') {
    // For Bina Marga, labor wages in SE DJBK 47/2026 Lampiran V are explicitly defined in 'jam' (hourly rates).
    if (domain === 'BINA_MARGA') return 'jam';
    return 'OJ';
  }
  return u;
}

/** True when the two units are the same quantity (no implicit conversion applied). */
export function unitsCompatible(a: string, b: string): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  if (!na || !nb) return true;
  return na === nb;
}

// ============================================================================
// NAME NORMALIZATION / COMPATIBILITY
// ============================================================================

export function normalizeName(name: string): string {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'dan', 'atau', 'yang', 'untuk', 'dengan', 'pada', 'di', 'ke', 'per', 'the', 'and', 'or',
  'of', 'for', 'with', 'a', 'an', 'mm', 'cm', 'm', 'kg', 'ton', 'mm2', 'std',
]);

export function nameTokens(name: string): string[] {
  return normalizeName(name)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Bounded Levenshtein distance (early-exits above `max`). */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Token equivalence tolerant of the spelling variants that are pervasive in
 * Indonesian construction vocabulary ("aggregat" / "agregat", "plastizier" /
 * "plasticizer", "multiplek" / "multipleks").
 *
 * A single-character difference is only accepted for tokens of length >= 5, which
 * keeps short high-frequency words ("batu", "pasir", "besi") exact so they cannot
 * drift into one another.
 */
export function tokenEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 5) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  if (a.length >= 5 && b.startsWith(a) && b.length - a.length <= 2) return true;
  if (b.length >= 5 && a.startsWith(b) && a.length - b.length <= 2) return true;
  return editDistance(a, b, 1) <= 1;
}

/**
 * Conservative name compatibility, normalised by the SHORTER name. Used to GUARD
 * code matches: a code match whose names share nothing is a false positive
 * (canonical `E.05` is "Generator Set" while the equipment master's `E.05` is
 * "Wheel Loader"). Deliberately permissive; `>= 0.34` counts as compatible.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const shared = ta.filter((t) => tb.some((u) => tokenEquivalent(t, u))).length;
  const ratio = shared / Math.min(ta.length, tb.length);
  return Math.min(0.85, ratio);
}

export const NAME_COMPATIBLE_THRESHOLD = 0.34;

/**
 * Higher bar for a NAME-ONLY binding (no code agreement). At 0.6 a two-token name
 * must agree on both tokens, which is what separates a genuine spelling variant
 * ("Aggregat Kasar" ~ "Agregat kasar") from a merely related phrase
 * ("Galian tanah biasa" ~ "Tanah timbunan").
 */
export const NAME_ONLY_THRESHOLD = 0.6;

/**
 * Jaccard overlap of significant tokens, using `tokenEquivalent` for spelling
 * tolerance. Unlike `nameSimilarity` (normalised by the SHORTER name and therefore
 * permissive) this is normalised by the UNION, so a name with extra unmatched tokens
 * is penalised:
 *
 *   "agregat kasar" vs "aggregat kasar"  → 2/2 = 1.00   (pure spelling variant)
 *   "agregat kasar" vs "agregat s"       → 1/2 = 0.50   (subset — must NOT win)
 *   "galian tanah biasa" vs "tanah timbunan" → 1/3 = 0.33
 */
export function nameBindingScore(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const shared = ta.filter((t) => tb.some((u) => tokenEquivalent(t, u))).length;
  const union = ta.length + tb.length - shared;
  return union === 0 ? 0 : shared / union;
}

// ============================================================================
// DETERMINISTIC SERIALIZATION / IDS
// ============================================================================

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify((value as any)[k])).join(',') +
    '}'
  );
}

export function sha1Like(input: string): string {
  // Deterministic short hash (djb2 + length). Used only for stable ids.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).padStart(7, '0') + input.length.toString(36);
}
