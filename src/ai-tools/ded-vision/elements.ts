/**
 * I11 Stage 4 (E16/E17) — non-opening element records + geometry QTO.
 *
 * Before I11, the pipeline skipped every structural symbol
 * (`structural-symbol-no-record-type`) and every object proposal
 * (`object-no-record-type`): I8 had no record type for them. This module
 * gives them one — `ElementRecord` (see `types.ts`) — reusing the I0
 * contracts (`EvidenceRecord`, `VisionReviewStatus`) and the I4 geometry
 * types. No parallel type system.
 *
 * Element identity:
 * - `category` is the closed part (STRUCTURAL | WALL | ROOF | SDA |
 *   CIVIL); `elementType` is an open vocabulary (column, beam, wall,
 *   roof-plane, dam-body, road, … — see `ELEMENT_KEYWORDS`).
 * - A mark (`K1`, `B1`, `F1`) identifies a marked element; unmarked
 *   elements (a wall, a roof plane) are identified by
 *   (category, elementType, page).
 * - Dimensions come from, in precedence order: (a) the linked schedule
 *   row, (b) the element's own label text (object proposals only, via
 *   `elementDimsFromText`), (c) a same-page dimension record whose
 *   associatedElement matches the mark (applied by the pipeline, not
 *   here). A dimension from one source never overwrites a dimension
 *   from a higher-precedence source; a disagreement is noted and caps
 *   confidence at NEEDS_REVIEW.
 *
 * QTO (`quantitiesForElement`): COUNT always; VOLUME when three
 * dimensions are evidenced; AREA for a cross-section (width×height),
 * a wall's net face area (with opening deductions), a roof's plan area,
 * or a slab/footing plan area (length×width). SDA/CIVIL elements get
 * records + COUNT only — a dam trapezoid section is not L×H, and no
 * area/volume is derivable from the evidenced dims. Missing/invalid
 * inputs → NO quantity record at all (the element record itself carries
 * the dims + UNRESOLVED status), never a 0.
 */

import { parseDimensionList } from './dimensions';
import { qtoArea, qtoCount, qtoVolume, qtoWallNetArea } from './geometryQto';
import { findMarkToken, normalizeMark } from './openings';
import { statusFromConfidence } from './types';
import type {
  DimensionRecord,
  ElementCategory,
  ElementRecord,
  EvidenceRecord,
  GeometryQuantity,
  OpeningRecord,
  ScheduleEntry,
} from './types';

/** One element observed on a plan (one symbol/object occurrence group). */
export interface ElementOccurrence {
  category: ElementCategory;
  elementType: string;
  mark: string | null;
  page: number;
  /** Dims parsed from the element's own label text (object proposals). */
  textDims?: ElementDims;
  /** Rebar diameter from the mark (`D12` → 12); null otherwise. */
  diameterMm?: number | null;
  evidence: EvidenceRecord[];
}

/** The four length dimensions an element may carry, in mm. */
export interface ElementDims {
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
}

const EMPTY_DIMS: ElementDims = {
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  thicknessMm: null,
};

/**
 * Keyword → (category, elementType). Order matters only where one
 * phrase contains another: `rangka atap` / `kuda-kuda` (roof-frame)
 * before `atap` (roof-plane), `partisi` (partition-wall) before
 * `dinding` (wall), `pintu air` (sluice-gate) before any `pintu`
 * reading. Word-boundaried, so `bendung` never matches `bendungan`.
 */
const ELEMENT_KEYWORDS: Array<{
  pattern: RegExp;
  category: ElementCategory;
  elementType: string;
}> = [
  // STRUCTURAL
  { pattern: /\b(kolom|column)\b/i, category: 'STRUCTURAL', elementType: 'column' },
  { pattern: /\b(balok|beam)\b/i, category: 'STRUCTURAL', elementType: 'beam' },
  { pattern: /\b(pelat|plat|slab)\b/i, category: 'STRUCTURAL', elementType: 'slab' },
  { pattern: /\b(pondasi|fondasi|footplat|footing)\b/i, category: 'STRUCTURAL', elementType: 'foundation' },
  { pattern: /\bsloof\b/i, category: 'STRUCTURAL', elementType: 'tie-beam' },
  { pattern: /\b(tangga|stair)\b/i, category: 'STRUCTURAL', elementType: 'stair' },
  { pattern: /\b(tulangan|rebar)\b/i, category: 'STRUCTURAL', elementType: 'rebar' },
  // WALL
  { pattern: /\bpartisi\b/i, category: 'WALL', elementType: 'partition-wall' },
  { pattern: /\b(dinding|tembok|wall)\b/i, category: 'WALL', elementType: 'wall' },
  // ROOF — frame before plane (`rangka atap` contains `atap`).
  { pattern: /\b(kuda-kuda|rangka atap|roof\s*frame|roof\s*truss)\b/i, category: 'ROOF', elementType: 'roof-frame' },
  { pattern: /\b(genteng|roof\s*covering|penutup atap)\b/i, category: 'ROOF', elementType: 'roof-covering' },
  { pattern: /\b(nok|bubungan|ridge)\b/i, category: 'ROOF', elementType: 'ridge' },
  { pattern: /\b(atap|roof)\b/i, category: 'ROOF', elementType: 'roof-plane' },
  // SDA (water resources)
  { pattern: /\bpintu air\b/i, category: 'SDA', elementType: 'sluice-gate' },
  { pattern: /\b(bendungan|dam)\b/i, category: 'SDA', elementType: 'dam-body' },
  { pattern: /\b(bendung|weir)\b/i, category: 'SDA', elementType: 'weir' },
  { pattern: /\b(saluran|channel|irigasi)\b/i, category: 'SDA', elementType: 'channel' },
  { pattern: /\bembung\b/i, category: 'SDA', elementType: 'reservoir' },
  { pattern: /\btanggul\b/i, category: 'SDA', elementType: 'levee' },
  // CIVIL
  { pattern: /\b(jalan|road)\b/i, category: 'CIVIL', elementType: 'road' },
  { pattern: /\b(jembatan|bridge)\b/i, category: 'CIVIL', elementType: 'bridge' },
];

/**
 * Infer an element (category + type) from a symbol/object label and raw
 * text. Returns null when no element keyword is present — a room name
 * (`RUANG TAMU`), a north arrow, a grid label. The first matching
 * keyword wins (see `ELEMENT_KEYWORDS` for the precedence order).
 */
export function inferElement(
  label: string,
  rawText: string,
): { category: ElementCategory; elementType: string } | null {
  const text = `${label} ${rawText}`;
  for (const entry of ELEMENT_KEYWORDS) {
    if (entry.pattern.test(text)) {
      return { category: entry.category, elementType: entry.elementType };
    }
  }
  return null;
}

/**
 * Rebar diameter from a mark: `D12` → 12, `D16` → 16. Any other mark
 * (including a bare `D` with no digits) yields null. No range check —
 * the mark IS the evidence; a `D200` mark would be a drawing error, not
 * a parser error, and is surfaced as-is for review.
 */
export function diameterFromMark(mark: string | null): number | null {
  if (!mark) return null;
  const m = /^D(\d{1,3})$/i.exec(mark.trim());
  if (!m) return null;
  return Number(m[1]);
}

/** A mark-like token anywhere in the text (re-exported for the pipeline). */
export function elementMarkFromText(text: string): string | null {
  return findMarkToken(text);
}

/** Deterministic element id: `el-<category>-p<page>-<mark|elementType>`. */
export function elementIdFor(
  category: ElementCategory,
  page: number,
  mark: string | null,
  elementType: string,
): string {
  const slug = (mark ?? elementType).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `el-${category.toLowerCase()}-p${page}-${slug}`;
}

/** Convert one parsed dimension record to mm (records carry their unit). */
function toMmValue(rec: DimensionRecord): number {
  switch (rec.unit) {
    case 'm':
      return Math.round(rec.normalizedValue * 1000);
    case 'cm':
      return Math.round(rec.normalizedValue * 10);
    default:
      return rec.normalizedValue;
  }
}

/**
 * Parse dimensions from an element's own label text
 * (`Dinding luar 7.000 x 3.500`, `Balok 15/30`, `Atap 6.000 x 8.000`).
 * Only LINEAR records count (elevations/diameters/slopes are not
 * element dims); a single value yields NOTHING — its role (length vs
 * height vs width) is unknowable without a second value.
 *
 * The text is pre-processed before parsing: each list segment is
 * stripped to its first digit (`Dinding luar 7.000 x 3.500` →
 * `7.000 x 3.500`), because the I2 parser cannot strip a unit-less
 * label prefix on its own (E5 needs a unit). The parse runs with
 * `dimensionEvident: true` (E21): an element description IS a
 * dimension-evident context — the numbers in it are the element's dims
 * by construction — so a bare `40` in `100 x 100 x 40` reads as 40 mm.
 * Single digits still never parse.
 *
 * Role assignment:
 * - A section pair (`15/30`, recognised by the `pair:` note) is
 *   width×height, never length×width. A third LINEAR value after a pair
 *   is the length.
 * - Otherwise, two or more LINEAR values map positionally: WALL →
 *   length×height (a wall's face); every other category →
 *   length×width. A third value is the thickness.
 */
export function elementDimsFromText(
  text: string,
  category: ElementCategory,
): ElementDims {
  const stripped = text
    .split(/[;\n\r]+/)
    .flatMap((seg) => seg.split(/,\s+(?=[A-Za-z])/))
    .map((part) => {
      const i = part.search(/\d/);
      return i >= 0 ? part.slice(i) : '';
    })
    .filter((part) => part !== '')
    .join('; ');
  if (stripped === '') return { ...EMPTY_DIMS };
  const records = parseDimensionList(stripped, { dimensionEvident: true }).filter(
    (r) => r.kind === 'LINEAR',
  );
  if (records.length < 2) return { ...EMPTY_DIMS };
  const values = records.map(toMmValue);
  const isPair = (records[0].notes ?? '').startsWith('pair:');
  if (isPair) {
    return {
      lengthMm: records.length >= 3 ? values[2] : null,
      widthMm: values[0],
      heightMm: values[1],
      thicknessMm: null,
    };
  }
  if (category === 'WALL') {
    return {
      lengthMm: values[0],
      widthMm: null,
      heightMm: values[1],
      thicknessMm: records.length >= 3 ? values[2] : null,
    };
  }
  return {
    lengthMm: values[0],
    widthMm: values[1],
    heightMm: null,
    thicknessMm: records.length >= 3 ? values[2] : null,
  };
}

/** Input to `linkElementToSchedule`: one element observed on the plans. */
export interface ElementLinkInput {
  category: ElementCategory;
  elementType: string;
  mark: string | null;
  quantity: number;
  sourcePages: number[];
  evidence: EvidenceRecord[];
  /** Dims from the element's own label text (object proposals). */
  textDims?: ElementDims;
  /** Rebar diameter from the mark. */
  diameterMm?: number | null;
}

/**
 * Link one plan element to its schedule row by mark (case-insensitive,
 * hyphen-insensitive via `normalizeMark`) and build the record.
 *
 * Dimension precedence: schedule row first (width/height/thickness);
 * label-text dims fill the gaps (length always comes from text — no
 * schedule row states a length). A disagreement between the two sources
 * on the same field is noted and caps confidence at NEEDS_REVIEW; the
 * schedule value wins.
 *
 * Status rule (mirrors `linkOpeningToSchedule`): schedule-linked → 0.9
 * HIGH_CONFIDENCE; dimensioned but unlinked → 0.8 NEEDS_REVIEW;
 * undimensioned and unlinked → 0 UNRESOLVED. A rebar element with only
 * a diameter counts as dimensioned (the diameter IS its dimension).
 */
export function linkElementToSchedule(
  input: ElementLinkInput,
  schedule: ScheduleEntry[],
): ElementRecord {
  const normalizedMark = input.mark ? normalizeMark(input.mark) : null;
  const row =
    normalizedMark === null
      ? undefined
      : schedule.find((e) => normalizeMark(e.mark) === normalizedMark);
  const textDims = input.textDims ?? EMPTY_DIMS;
  const notes: string[] = [];
  const widthMm = row?.widthMm ?? textDims.widthMm;
  const heightMm = row?.heightMm ?? textDims.heightMm;
  const thicknessMm = row?.thicknessMm ?? textDims.thicknessMm;
  const lengthMm = textDims.lengthMm;
  if (row) {
    if (
      row.widthMm !== null && row.widthMm !== undefined &&
      textDims.widthMm !== null && textDims.widthMm !== row.widthMm
    ) {
      notes.push(
        `Lebar dari jadwal ${row.widthMm} mm berbeda dengan teks label ${textDims.widthMm} mm — nilai jadwal dipakai`,
      );
    }
    if (
      row.heightMm !== null && row.heightMm !== undefined &&
      textDims.heightMm !== null && textDims.heightMm !== row.heightMm
    ) {
      notes.push(
        `Tinggi dari jadwal ${row.heightMm} mm berbeda dengan teks label ${textDims.heightMm} mm — nilai jadwal dipakai`,
      );
    }
  }
  const diameterMm = input.diameterMm ?? null;
  const dimensioned =
    lengthMm !== null || widthMm !== null || heightMm !== null ||
    thicknessMm !== null || diameterMm !== null;
  let confidence = 0;
  if (row) confidence = 0.9;
  else if (dimensioned) confidence = 0.8;
  if (notes.length > 0) confidence = Math.min(confidence, 0.8);
  const page = input.sourcePages[0] ?? 0;
  return {
    id: elementIdFor(input.category, page, input.mark, input.elementType),
    category: input.category,
    elementType: input.elementType,
    mark: input.mark,
    quantity: input.quantity,
    lengthMm,
    widthMm: widthMm ?? null,
    heightMm: heightMm ?? null,
    thicknessMm: thicknessMm ?? null,
    diameterMm,
    schedulePage: row ? row.sourcePage : null,
    sourcePages: [...new Set(input.sourcePages)].sort((a, b) => a - b),
    evidence: input.evidence,
    confidence,
    status: statusFromConfidence(confidence),
    notes: notes.length > 0 ? notes.join('; ') : undefined,
  };
}

/** Slug for quantity ids: the mark, or the element type when unmarked. */
function quantitySlug(element: ElementRecord): string {
  return (element.mark ?? element.elementType).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Indonesian work labels for element types, used by the AHSP name
 * builder (`ahspInputForQuantity` in `visionPipeline.ts`). A type not
 * listed here falls back to its raw `elementType` string.
 */
export const ELEMENT_TYPE_LABELS: Record<string, string> = {
  column: 'kolom',
  beam: 'balok',
  slab: 'pelat',
  foundation: 'footplat',
  'tie-beam': 'sloof',
  stair: 'tangga',
  rebar: 'tulangan',
  wall: 'dinding',
  'partition-wall': 'partisi',
  'roof-plane': 'atap',
  'roof-frame': 'rangka atap',
  'roof-covering': 'penutup atap',
  ridge: 'nok',
  'dam-body': 'tubuh bendungan',
  channel: 'saluran',
  weir: 'bendung',
  'sluice-gate': 'pintu air',
  reservoir: 'embung',
  levee: 'tanggul',
  road: 'jalan',
  bridge: 'jembatan',
};

/** Tag a quantity with its element identity (traceability for AHSP). */
function tagQuantity(
  q: GeometryQuantity,
  element: ElementRecord,
  jenis: string,
): GeometryQuantity {
  return {
    ...q,
    inputs: {
      ...q.inputs,
      elemen: element.mark ?? element.elementType,
      tipe_elemen: element.elementType,
      kategori_elemen: element.category,
      jenis_kuantitas: jenis,
    },
  };
}

/**
 * Derive geometry quantities for one element (E17), using the I4
 * `qto*` functions (SafeDecimalEngine) — never hand arithmetic.
 *
 * - COUNT is always emitted (the occurrence count).
 * - VOLUME when three dimensions are evidenced (any three of
 *   length/width/height/thickness, in that order — a footing's
 *   width×height×thickness is a volume exactly as a column's
 *   length×width×height is). STRUCTURAL/WALL/ROOF only — SDA/CIVIL
 *   elements get no volume (a channel's L×W×H is a void, not a solid).
 * - AREA:
 *   - WALL with length+height → net face area via `qtoWallNetArea`,
 *     deducting the same-page linked openings that HAVE dims (each
 *     multiplied by its occurrence quantity). Openings WITHOUT dims
 *     are NOT deducted — they are named in `assumptions`, and the net
 *     area is therefore an upper bound. (Passing an undimensioned
 *     opening to `qtoWallNetArea` would fail the whole quantity — its
 *     fail-closed rule — so the filter lives here, with the assumption
 *     as the honest record.) A wall's net area coexists with its
 *     volume — different billing items (plaster vs masonry).
 *   - ROOF with length+width → plan area, with the assumption that it
 *     is a plan area (no slope correction — SafeDecimalEngine has no
 *     cosine). Coexists with a volume.
 *   - STRUCTURAL with width+height → cross-section area, labelled
 *     `penampang` in the formula inputs; slab/foundation with
 *     length+width → plan area. STRUCTURAL area is a fallback: it is
 *     emitted only when no volume is derivable (a column's
 *     cross-section alone is not a billable quantity next to its
 *     volume).
 *   - SDA/CIVIL → no area/volume (a dam section is not L×H).
 * - When dims are insufficient for an area/volume, NO quantity record
 *   is emitted for it — the element record itself carries the dims +
 *   UNRESOLVED status. Never a 0.
 */
export function quantitiesForElement(
  element: ElementRecord,
  openingsOnPage: OpeningRecord[],
  page: number,
): GeometryQuantity[] {
  const out: GeometryQuantity[] = [];
  const slug = quantitySlug(element);
  const base = {
    sourcePages: element.sourcePages,
    evidence: element.evidence,
    confidence: element.confidence,
  };
  out.push(
    tagQuantity(
      qtoCount(element.quantity, {
        ...base,
        id: `qto-el-count-p${page}-${slug}`,
      }),
      element,
      'jumlah',
    ),
  );

  const dims = [element.lengthMm, element.widthMm, element.heightMm, element.thicknessMm];
  const valid = dims.filter(
    (d): d is number => typeof d === 'number' && Number.isFinite(d) && d > 0,
  );
  // VOLUME when three dimensions are evidenced — STRUCTURAL/WALL/ROOF
  // only. SDA/CIVIL elements get no volume: a channel's L×W×H is a
  // void, not a solid, and a dam section is not a rectangular prism.
  const volumeEmitted =
    valid.length >= 3 &&
    (element.category === 'STRUCTURAL' || element.category === 'WALL' || element.category === 'ROOF');
  if (volumeEmitted) {
    out.push(
      tagQuantity(
        qtoVolume(valid[0], valid[1], valid[2], {
          ...base,
          id: `qto-el-volume-p${page}-${slug}`,
        }),
        element,
        'volume',
      ),
    );
  }

  if (element.category === 'WALL' && element.lengthMm !== null && element.heightMm !== null) {
    const dimensioned: Array<{ widthMm: number; heightMm: number }> = [];
    const skipped: string[] = [];
    let deductionConfidence = element.confidence;
    for (const o of openingsOnPage) {
      if (o.widthMm !== null && o.heightMm !== null && o.widthMm > 0 && o.heightMm > 0) {
        for (let i = 0; i < o.quantity; i += 1) {
          dimensioned.push({ widthMm: o.widthMm, heightMm: o.heightMm });
        }
        deductionConfidence = Math.min(deductionConfidence, o.confidence);
      } else {
        skipped.push(`Bukaan ${o.mark} (×${o.quantity}) tidak dikurangkan — ukurannya tidak terbaca`);
      }
    }
    const assumptions = [...skipped];
    if (skipped.length > 0) {
      assumptions.push('Luas bersih adalah batas atas — bukaan tanpa ukuran belum dikurangkan');
    }
    out.push(
      tagQuantity(
        qtoWallNetArea(element.lengthMm, element.heightMm, dimensioned, {
          ...base,
          id: `qto-el-area-p${page}-${slug}`,
          confidence: deductionConfidence,
          assumptions,
        }),
        element,
        'luas bersih dinding',
      ),
    );
    return out;
  }

  if (element.category === 'ROOF' && element.lengthMm !== null && element.widthMm !== null) {
    out.push(
      tagQuantity(
        qtoArea(element.lengthMm, element.widthMm, {
          ...base,
          id: `qto-el-area-p${page}-${slug}`,
          assumptions: ['Luas denah (belum koreksi kemiringan atap)'],
        }),
        element,
        'luas denah atap',
      ),
    );
    return out;
  }

  // STRUCTURAL area is a FALLBACK for when no volume is derivable: a
  // column's cross-section alone is not a billable quantity next to
  // its volume. (WALL/ROOF areas above are independent billing items —
  // net face area, plan area — so they coexist with a volume.)
  if (element.category === 'STRUCTURAL' && !volumeEmitted) {
    if (element.widthMm !== null && element.heightMm !== null) {
      out.push(
        tagQuantity(
          qtoArea(element.widthMm, element.heightMm, {
            ...base,
            id: `qto-el-area-p${page}-${slug}`,
          }),
          element,
          'luas penampang',
        ),
      );
      return out;
    }
    if (
      (element.elementType === 'slab' || element.elementType === 'foundation') &&
      element.lengthMm !== null && element.widthMm !== null
    ) {
      out.push(
        tagQuantity(
          qtoArea(element.lengthMm, element.widthMm, {
            ...base,
            id: `qto-el-area-p${page}-${slug}`,
          }),
          element,
          'luas denah',
        ),
      );
      return out;
    }
  }

  return out;
}
