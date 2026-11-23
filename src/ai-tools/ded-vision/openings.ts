/**
 * DED drawing-vision: door/window/opening intelligence (I3, owner spec §4,
 * MANDATORY priority).
 *
 * Pure functions only. No I/O, no AI calls, no invented numbers:
 * - Marks (D1/P1/W1/J1/K1/…) are project-defined identifiers. This module
 *   never assumes a universal meaning for any mark letter — it only matches
 *   marks textually between plan occurrences and schedule rows.
 * - Dimensions come only from an explicit schedule row (or an explicit plan
 *   dimension passed to the conflict check). A mark with no schedule row
 *   gets `widthMm: null, heightMm: null` and status UNRESOLVED — never a
 *   guessed size.
 * - VERIFIED is never set here. A schedule match caps at HIGH_CONFIDENCE
 *   (via `statusFromConfidence`); VERIFIED is the caller's job, after
 *   explicit verification (cross-check, user confirmation, calibration).
 *
 * Reference only (not modified): the schedule-tag lookup in
 * `src/ded-rab-v2/qto/dedQuantityEngine.ts:139-160` (v2 matches
 * `/\b([pPjJ][\d]+|[bB][vV][\d]+)\b/` and trusts the schedule count) and
 * `ScheduleItem` in `src/ded-rab-v3/types.ts:78-90` (v3 keeps width/height
 * in metres and a schedule-side count). This module differs deliberately:
 * it counts occurrences on the PLANS (not the schedule's count column),
 * keeps dimensions in mm, and refuses to invent a size when the schedule
 * row is missing.
 */

import {
  type OpeningKind,
  type OpeningRecord,
  type ScheduleEntry,
  type EvidenceRecord,
  statusFromConfidence,
} from './types';

/** Tolerance for plan-vs-schedule dimension comparison: 0 mm after rounding
 *  both sides to the nearest whole millimetre. Any rounded difference is a
 *  CONFLICT; there is no "close enough" band. */
export const OPENING_DIMENSION_TOLERANCE_MM = 0;

/** Confidence assigned to a schedule-linked opening (→ HIGH_CONFIDENCE). */
const LINKED_CONFIDENCE = 0.9;

/** Confidence assigned to an opening with no schedule row (→ UNRESOLVED). */
const UNLINKED_CONFIDENCE = 0;

/**
 * Normalize a mark for matching: trim, uppercase, drop hyphens and internal
 * whitespace. "d-1" → "D1", " pj1 " → "PJ1". Matching is case-insensitive
 * and hyphen-insensitive; nothing else about the mark is interpreted.
 */
export function normalizeMark(mark: string): string {
  return mark.trim().toUpperCase().replace(/[-\s]+/g, '');
}

/** A mark-like token: 1–3 letters, optional hyphen, 1–3 digits (D1, PJ1,
 *  BV1, W12). Word-boundaried so "Kusen" (no digits) or "18mm" (digits
 *  first) never match. A LONE `X` is excluded as a mark letter: `X` is
 *  the dimension separator (`0.91 X 2.13`), and matching it would turn
 *  the separator into a phantom mark `X2`. `X` still matches inside a
 *  2–3-letter mark (`XA1`); a hypothetical lone-`X` mark is the accepted
 *  trade-off (I10b E4). */
const MARK_TOKEN_RE = /\b((?:[A-WYZa-wyz][A-Za-z]{0,2}|[Xx][A-Za-z]{1,2}))-?(\d{1,3})\b/;

/**
 * I10b E4 — opening keywords that qualify a LETTER-ONLY mark. Indian /
 * English schedules use bare letters as marks (`D-DOOR`, `MD-MAIN DOOR`,
 * `W-WINDOW`, `V-VENTILATOR`, `G-GATE`); the keyword is the
 * discriminator against grid labels / section markers (single letters
 * `A`/`B`/`C` with no opening keyword never qualify). Shared with the
 * pipeline (`visionPipeline.ts` infers the kind from the same words)
 * and the OCR router (`visionOcr.ts`).
 */
export const OPENING_KEYWORD_RE =
  /\b(?:door|window|ventilator|vent|louver|gate|pintu|jendela|ventilasi|gerbang|partisi|kusen)\b/i;

/**
 * A letter-only mark at the START of a row (`D`, `MD`, `W`, `V`, `KV`,
 * `G`). Schedule rows put the mark first by convention; requiring the
 * first-token position keeps stray words (`THE`, `KIT`) from becoming
 * marks. The mark must be followed by a word boundary, so `MAIN` (4
 * letters) never matches — only 1–3-letter tokens do.
 */
const LETTER_ONLY_MARK_RE = /^\s*\|?\s*([A-Za-z]{1,3})\b/;

/**
 * Extract a letter-only mark from a row/symbol text, qualified by an
 * opening keyword anywhere in the text. Returns the normalized mark
 * (`D`, `MD`, `KV`) or null when the text does not start with a
 * letter-only token or carries no opening keyword. Digit-bearing marks
 * are NOT this function's business — `MARK_TOKEN_RE` owns those.
 */
export function extractKeywordQualifiedMark(text: string): string | null {
  if (!OPENING_KEYWORD_RE.test(text)) return null;
  const m = LETTER_ONLY_MARK_RE.exec(text);
  if (!m) return null;
  return normalizeMark(m[1]);
}

/**
 * I11 Stage 4 (F8/F11) — find the first digit-bearing mark token anywhere
 * in the text ("Kolom K1" → `K1`, "Pintu D1" → `D1`), normalized. Used
 * by the pipeline's STRUCTURAL path, where the element keyword already
 * establishes identity, so extracting the mark from anywhere in the
 * text is safe. A spec-like token (`D12-150` — letter+digits, hyphen,
 * digits) is NOT a mark: it is a rebar spacing specification, and this
 * function returns null for it rather than inventing a mark `D12`.
 * (A bare `D12` with no hyphen is a mark — see `isStructuralMark`.)
 */
export function findMarkToken(text: string): string | null {
  if (/\b[A-Za-z]{1,3}\d+-\d/.test(text)) return null;
  const m = MARK_TOKEN_RE.exec(text);
  if (!m) return null;
  return normalizeMark(`${m[1]}${m[2]}`);
}

/**
 * I11 Stage 4 (F11) — extract a digit-bearing mark qualified by an
 * opening keyword anywhere in the text ("Pintu D1" → `D1`). The
 * opening-keyword requirement is what keeps this safe: a spec-like or
 * structural token without an opening keyword (`D12-150`, `Kolom K1`)
 * never matches here. The letter-only counterpart is
 * `extractKeywordQualifiedMark`; the two together cover "mark + keyword
 * in either order, with or without digits".
 */
export function extractKeywordQualifiedDigitMark(text: string): string | null {
  if (!OPENING_KEYWORD_RE.test(text)) return null;
  return findMarkToken(text);
}

/** One numeric token in Indonesian notation: digits with optional
 *  dot-thousands and/or comma-decimal ("900", "2.100", "0,9", "2.100,5"). */
const NUMBER_TOKEN = String.raw`\d+(?:[.,]\d+)*`;

/** Dimension pair in "W × H" form, optional unit suffix. */
const CROSS_DIM_RE = new RegExp(
  `(${NUMBER_TOKEN})\\s*[×xX]\\s*(${NUMBER_TOKEN})\\s*(mm|cm|m|meter|meters)?`,
  'i',
);
/** Dimension pair in slash form ("90/210"). */
const SLASH_DIM_RE = new RegExp(
  `(${NUMBER_TOKEN})\\s*/\\s*(${NUMBER_TOKEN})`,
);
/**
 * I11 Stage 4 (E15) — dimension TRIPLE in "W × H × T" form, optional unit
 * suffix ("F1 100×100×40"). The third value is the thickness; it must
 * survive, not be silently dropped. Tried before the pair form.
 */
const CROSS_TRIPLE_RE = new RegExp(
  `(${NUMBER_TOKEN})\\s*[×xX]\\s*(${NUMBER_TOKEN})\\s*[×xX]\\s*(${NUMBER_TOKEN})\\s*(mm|cm|m|meter|meters)?`,
  'i',
);
/** Dimension triple in slash form ("120/120/50"). Tried before the pair form. */
const SLASH_TRIPLE_RE = new RegExp(
  `(${NUMBER_TOKEN})\\s*/\\s*(${NUMBER_TOKEN})\\s*/\\s*(${NUMBER_TOKEN})`,
);

/**
 * Parse an Indonesian-notation number. A dot followed by exactly 3 digits
 * is a thousands separator ("2.100" → 2100); a comma is the decimal
 * separator ("0,9" → 0.9); a dot followed by 1–2 digits is a decimal point
 * ("2.5" → 2.5). Returns null when the token is not a number.
 */
function parseIndoNumber(token: string): number | null {
  const t = token.trim();
  if (!/^\d+(?:[.,]\d+)*$/.test(t)) return null;
  let normalized = t;
  // Thousands dots: groups of exactly 3 digits after a dot.
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(t)) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else if (t.includes(',')) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

type LengthUnit = 'mm' | 'cm' | 'm';

/**
 * Infer the unit of a unit-less dimension pair from magnitude:
 * - either value ≥ 300 → millimetres ("900 x 2100")
 * - both values < 10 → metres ("0.9 x 2.1")
 * - otherwise → centimetres ("90 x 210", the Indonesian schedule convention)
 * An explicit unit suffix always wins over this heuristic.
 */
function inferUnit(a: number, b: number): LengthUnit {
  if (Math.max(a, b) >= 300) return 'mm';
  if (Math.max(a, b) < 10) return 'm';
  return 'cm';
}

function toMm(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'mm':
      return Math.round(value);
    case 'cm':
      return Math.round(value * 10);
    case 'm':
      return Math.round(value * 1000);
  }
}

/**
 * Extract a width×height pair (in mm) from row text, or nulls when the
 * row carries no dimension pair. Tries the "×" form first, then "/".
 *
 * I11 Stage 4 (E15): a TRIPLE ("100×100×40", "120/120/50") is tried
 * before the pair form — the third value is the thickness and must
 * survive with its unit. Unit inference uses the max of ALL THREE
 * values (a "100×100×40" triple is cm by the same magnitude rule as
 * the pair form). A single value ("12 cm") is NOT parsed as a
 * thickness — without a keyword its role is unknowable.
 */
function extractDimensions(rowText: string): {
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
} {
  const crossTriple = rowText.match(CROSS_TRIPLE_RE);
  if (crossTriple) {
    const w = parseIndoNumber(crossTriple[1]);
    const h = parseIndoNumber(crossTriple[2]);
    const t = parseIndoNumber(crossTriple[3]);
    if (w !== null && h !== null && t !== null && w > 0 && h > 0 && t > 0) {
      const rawUnit = (crossTriple[4] ?? '').toLowerCase();
      const unit: LengthUnit =
        rawUnit.startsWith('mm') ? 'mm'
        : rawUnit.startsWith('cm') ? 'cm'
        : rawUnit.startsWith('m') ? 'm'
        : inferUnit(Math.max(w, h, t), 0);
      return { widthMm: toMm(w, unit), heightMm: toMm(h, unit), thicknessMm: toMm(t, unit) };
    }
  }
  const slashTriple = rowText.match(SLASH_TRIPLE_RE);
  if (slashTriple) {
    const w = parseIndoNumber(slashTriple[1]);
    const h = parseIndoNumber(slashTriple[2]);
    const t = parseIndoNumber(slashTriple[3]);
    if (w !== null && h !== null && t !== null && w > 0 && h > 0 && t > 0) {
      const unit = inferUnit(Math.max(w, h, t), 0);
      return { widthMm: toMm(w, unit), heightMm: toMm(h, unit), thicknessMm: toMm(t, unit) };
    }
  }
  const cross = rowText.match(CROSS_DIM_RE);
  if (cross) {
    const w = parseIndoNumber(cross[1]);
    const h = parseIndoNumber(cross[2]);
    if (w !== null && h !== null && w > 0 && h > 0) {
      const rawUnit = (cross[3] ?? '').toLowerCase();
      const unit: LengthUnit =
        rawUnit.startsWith('mm') ? 'mm'
        : rawUnit.startsWith('cm') ? 'cm'
        : rawUnit.startsWith('m') ? 'm'
        : inferUnit(w, h);
      return { widthMm: toMm(w, unit), heightMm: toMm(h, unit), thicknessMm: null };
    }
  }
  const slash = rowText.match(SLASH_DIM_RE);
  if (slash) {
    const w = parseIndoNumber(slash[1]);
    const h = parseIndoNumber(slash[2]);
    if (w !== null && h !== null && w > 0 && h > 0) {
      const unit = inferUnit(w, h);
      return { widthMm: toMm(w, unit), heightMm: toMm(h, unit), thicknessMm: null };
    }
  }
  return { widthMm: null, heightMm: null, thicknessMm: null };
}

/** Frame phrase: "Kusen <material>" with an optional size ("Kusen Aluminium
 *  4 inch", "Kusen Kayu Jati"). Matched text is returned as written. */
const FRAME_RE =
  /\bkusen\s+(aluminium|aluminum|almunium|kayu(?:\s+jati|\s+kamper|\s+meranti|\s+bengkirai|\s+ulin)?|upvc|pvc|baja|besi|hpl|wpc)(?:\s+\d+(?:[.,]\d+)?\s*(?:inch|in|"))?/i;

/** Glazing phrase: "Kaca <type>" or "double glazing". Matched as written. */
const GLAZING_RE =
  /\b(?:kaca(?:\s+(tempered|bening|rayben|riben|gelap|buram|es|sandblast|laminated|film|one\s*way))?|double\s+glazing|kaca\s+ganda)\b/i;

/** Leaf/panel material hints, searched in order. "kaca" is deliberately
 *  last: glazing is extracted first and stripped, so bare "kaca" only lands
 *  here when no glazing phrase matched. */
const MATERIAL_HINTS = [
  'panel kayu',
  'kayu jati',
  'kayu kamper',
  'kayu meranti',
  'kayu bengkirai',
  'kayu ulin',
  'multiplek',
  'triplek',
  'engineering',
  'hpl',
  'aluminium',
  'aluminum',
  'upvc',
  'wpc',
  'baja',
  'besi',
  'pvc',
  'kaca',
];

/**
 * Extract material/frame/glazing hints from row text. Each hint is a
 * substring copied verbatim from the row (never reworded); a hint absent
 * from the text stays null. Frame is extracted first, then glazing, then
 * material — each on the text with the earlier matches removed, so a frame
 * material ("Kusen Aluminium") is not also claimed as the leaf material.
 */
function extractHints(rowText: string): {
  material: string | null;
  frame: string | null;
  glazing: string | null;
} {
  let rest = rowText;
  const frameMatch = rest.match(FRAME_RE);
  const frame = frameMatch ? frameMatch[0].trim() : null;
  if (frameMatch) rest = rest.replace(frameMatch[0], ' ');
  const glazingMatch = rest.match(GLAZING_RE);
  const glazing = glazingMatch ? glazingMatch[0].trim() : null;
  if (glazingMatch) rest = rest.replace(glazingMatch[0], ' ');
  let material: string | null = null;
  for (const hint of MATERIAL_HINTS) {
    const re = new RegExp(`\\b${hint.replace(/\s+/g, '\\s+')}\\b`, 'i');
    const m = rest.match(re);
    if (m) {
      material = m[0].trim();
      break;
    }
  }
  return { material, frame, glazing };
}

/**
 * Parse one door/window schedule row into a ScheduleEntry.
 *
 * - Mark: the first mark-like token (1–3 letters + 1–3 digits, optional
 *   hyphen), normalized to uppercase. Failing that, a LETTER-ONLY mark
 *   (I10b E4: `D`, `MD`, `W`, `V`, `KV`, `G`) qualifies when the row
 *   carries an opening keyword (`DOOR`/`WINDOW`/`VENTILATOR`/`GATE`/…).
 *   No mark → null (the row is not a schedule row for an opening).
 * - Dimensions: "90/210" (cm by convention, mm when ≥ 300), "900×2100",
 *   "900 x 2100 mm", "0,9 x 2,1 m", "900 x 2.100 mm" — all normalized to
 *   mm. No dimension pair → widthMm/heightMm null (the row is still
 *   returned; the mark alone is evidence the opening exists in the
 *   schedule). I11 Stage 4 (E15): a TRIPLE ("100×100×40", "120/120/50")
 *   also yields thicknessMm — the third value, same unit, same evidence.
 *   A single value ("12 cm") yields no thickness (role unknowable).
 * - Material/frame/glazing: verbatim hint substrings when present, else
 *   null. `kind` is deliberately left unset — the mark letter does not
 *   define the opening kind (marks are project-defined).
 */
export function parseScheduleRow(
  rowText: string,
  sourcePage: number,
): ScheduleEntry | null {
  const markMatch = rowText.match(MARK_TOKEN_RE);
  const mark = markMatch
    ? normalizeMark(`${markMatch[1]}${markMatch[2]}`)
    : extractKeywordQualifiedMark(rowText);
  if (mark === null) return null;
  const { widthMm, heightMm, thicknessMm } = extractDimensions(rowText);
  const { material, frame, glazing } = extractHints(rowText);
  return {
    mark,
    widthMm,
    heightMm,
    thicknessMm,
    material,
    frame,
    glazing,
    sourcePage,
    rowText,
  };
}

/** Input to `linkOpeningToSchedule`: one opening observed on the plans. */
export interface OpeningLinkInput {
  mark: string;
  elementType: OpeningKind;
  sourcePages: number[];
  evidence: EvidenceRecord[];
}

function sortedUniquePages(pages: number[]): number[] {
  return [...new Set(pages)].sort((a, b) => a - b);
}

/**
 * Link one plan opening to its schedule row by mark (case-insensitive,
 * hyphen-insensitive via `normalizeMark`).
 *
 * - Match found: width/height/material/frame/glazing copied from the row,
 *   `schedulePage` set, quantity 1, confidence 0.9 → HIGH_CONFIDENCE.
 *   VERIFIED is never set here, even for a perfect match — the caller
 *   upgrades to VERIFIED only after explicit verification.
 * - No match: all schedule-sourced fields null, `schedulePage` null,
 *   confidence 0 → UNRESOLVED. Dimensions are never invented.
 * - A matched row with null dimensions still links (HIGH_CONFIDENCE for
 *   the link itself) but keeps width/height null.
 */
export function linkOpeningToSchedule(
  opening: OpeningLinkInput,
  schedule: ScheduleEntry[],
): OpeningRecord {
  const target = normalizeMark(opening.mark);
  const entry = schedule.find((s) => normalizeMark(s.mark) === target);
  const sourcePages = sortedUniquePages(opening.sourcePages);
  if (!entry) {
    return {
      elementType: opening.elementType,
      mark: normalizeMark(opening.mark),
      widthMm: null,
      heightMm: null,
      quantity: 1,
      material: null,
      frame: null,
      glazing: null,
      schedulePage: null,
      sourcePages,
      evidence: opening.evidence,
      confidence: UNLINKED_CONFIDENCE,
      status: statusFromConfidence(UNLINKED_CONFIDENCE),
    };
  }
  return {
    elementType: opening.elementType,
    mark: normalizeMark(opening.mark),
    widthMm: entry.widthMm ?? null,
    heightMm: entry.heightMm ?? null,
    quantity: 1,
    material: entry.material ?? null,
    frame: entry.frame ?? null,
    glazing: entry.glazing ?? null,
    schedulePage: entry.sourcePage,
    sourcePages,
    evidence: opening.evidence,
    confidence: LINKED_CONFIDENCE,
    status: statusFromConfidence(LINKED_CONFIDENCE),
  };
}

/** One observed occurrence of an opening on a plan page. `floor` is the
 *  optional floor label as written on the drawing ("Lt 1", "Lantai 2"). */
export interface OpeningOccurrence {
  mark: string;
  elementType: OpeningKind;
  page: number;
  floor?: string;
}

/**
 * Aggregate plan occurrences into OpeningRecords, one per (mark, floor)
 * group, each linked to its schedule row.
 *
 * Multi-floor behavior (documented choice): the same mark on different
 * floors counts SEPARATELY — one record per (mark, floor) pair, each with
 * its own quantity and sourcePages. The mark TOTAL is the sum of the
 * quantities of all records sharing the mark. Occurrences without a floor
 * group together under "no floor". OpeningRecord carries no floor field,
 * so per-floor records are distinguished by their sourcePages (floor plans
 * live on distinct pages); callers that need the floor label should keep
 * the grouping key alongside the records.
 *
 * Output order is deterministic: by normalized mark, then by floor
 * (no-floor first, then lexicographic).
 */
export function countOpenings(
  occurrences: OpeningOccurrence[],
  schedule: ScheduleEntry[],
): OpeningRecord[] {
  type Group = {
    mark: string;
    elementType: OpeningKind;
    floorKey: string | null;
    pages: number[];
    quantity: number;
  };
  const groups = new Map<string, Group>();
  for (const occ of occurrences) {
    const mark = normalizeMark(occ.mark);
    const floorKey = occ.floor?.trim() ? occ.floor.trim() : null;
    const key = `${mark}\x00${floorKey ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.pages.push(occ.page);
      existing.quantity += 1;
    } else {
      groups.set(key, {
        mark,
        elementType: occ.elementType,
        floorKey,
        pages: [occ.page],
        quantity: 1,
      });
    }
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.mark !== b.mark) return a.mark < b.mark ? -1 : 1;
    if (a.floorKey === b.floorKey) return 0;
    if (a.floorKey === null) return -1;
    if (b.floorKey === null) return 1;
    return a.floorKey < b.floorKey ? -1 : 1;
  });
  return ordered.map((group) => {
    const linked = linkOpeningToSchedule(
      {
        mark: group.mark,
        elementType: group.elementType,
        sourcePages: group.pages,
        evidence: [],
      },
      schedule,
    );
    return { ...linked, quantity: group.quantity };
  });
}

/**
 * Schedule entries no plan occurrence refers to — i.e. rows in the schedule
 * that no counted opening uses. Useful for the "schedule entry unused by
 * any plan" review signal. Matching is by normalized mark.
 */
export function findUnusedScheduleEntries(
  schedule: ScheduleEntry[],
  openings: OpeningRecord[],
): ScheduleEntry[] {
  const used = new Set(openings.map((o) => normalizeMark(o.mark)));
  return schedule.filter((s) => !used.has(normalizeMark(s.mark)));
}

/** Plan-side dimensions for one opening, as read from a floor plan. Null
 *  means the plan states no dimension for that side (unverified, not zero). */
export interface PlanOpeningDimensions {
  mark: string;
  widthMm: number | null;
  heightMm: number | null;
}

export interface OpeningConflictDetail {
  result: 'OK' | 'CONFLICT';
  /** Human-readable reason. Missing data yields an "unverified" OK, never
   *  a conflict. */
  reason: string;
  /** True when either side was missing a dimension, so the check could not
   *  fully verify the opening. */
  unverified: boolean;
}

/**
 * Compare plan dimensions against the schedule row for the same mark.
 *
 * - Both sides present: widths and heights are rounded to the nearest mm
 *   and compared exactly (tolerance `OPENING_DIMENSION_TOLERANCE_MM` = 0).
 *   Any rounded mismatch → CONFLICT.
 * - Either side missing a dimension: that dimension is skipped — missing
 *   data is 'OK' (unverified), never a conflict. A conflict on the OTHER
 *   dimension still yields CONFLICT.
 */
export function checkOpeningConflictDetail(
  plan: PlanOpeningDimensions,
  scheduleEntry: ScheduleEntry,
): OpeningConflictDetail {
  const mismatches: string[] = [];
  let unverified = false;
  const compare = (
    label: string,
    planMm: number | null | undefined,
    schedMm: number | null | undefined,
  ) => {
    if (planMm == null || schedMm == null) {
      unverified = true;
      return;
    }
    const p = Math.round(planMm);
    const s = Math.round(schedMm);
    if (Math.abs(p - s) > OPENING_DIMENSION_TOLERANCE_MM) {
      mismatches.push(
        `${label}: plan ${p} mm vs schedule ${s} mm`,
      );
    }
  };
  compare('width', plan.widthMm, scheduleEntry.widthMm);
  compare('height', plan.heightMm, scheduleEntry.heightMm);
  if (mismatches.length > 0) {
    return {
      result: 'CONFLICT',
      reason: `Mark ${normalizeMark(plan.mark)} — ${mismatches.join('; ')}`,
      unverified,
    };
  }
  return {
    result: 'OK',
    reason: unverified
      ? `Mark ${normalizeMark(plan.mark)} — dimensions match where both sides state them; missing dimension(s) leave the check unverified`
      : `Mark ${normalizeMark(plan.mark)} — plan and schedule dimensions match`,
    unverified,
  };
}

/** Plan-vs-schedule conflict check: 'OK' | 'CONFLICT'. Missing data on
 *  either side is 'OK' (unverified) — see `checkOpeningConflictDetail`
 *  for the reason and the unverified flag. */
export function checkOpeningConflict(
  plan: PlanOpeningDimensions,
  scheduleEntry: ScheduleEntry,
): 'OK' | 'CONFLICT' {
  return checkOpeningConflictDetail(plan, scheduleEntry).result;
}
