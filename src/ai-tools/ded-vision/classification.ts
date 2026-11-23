/**
 * DED vision — page classification (increment I1, spec §2).
 *
 * Pure keyword/signal scoring over a page's title + native text layer.
 * Classifies into the 14 drawing classes (+ UNKNOWN) from `./types`
 * (13 spec classes + CIVIL, added I10b E12 for road/bridge/dam/SDA
 * sheets). No AI call, no I/O, no guessing from nothing:
 *
 * - A page with no usable signal (no text layer, no title signal, or
 *   text with no drawing terms) classifies UNKNOWN with confidence 0
 *   and status UNRESOLVED — never a default class. This deliberately
 *   differs from `heuristicClassifyPage()` in
 *   `src/ded-rab-v2/ingestion/pdfPageService.ts`, which defaults to
 *   FLOOR_PLAN, and from `classifyPageTitle()` in
 *   `src/ai-tools/ded-ai-estimate/parser.ts`, which defaults to
 *   'HALAMAN'.
 * - Title evidence outranks body text: a title-start anchor phrase
 *   (e.g. "denah pondasi") is decisive over the generic "denah", and
 *   the LONGEST matching anchor wins across classes, so "Denah
 *   Pondasi" is FOUNDATION, not FLOOR_PLAN.
 * - Confidence grows with signal strength (multiple agreeing signals
 *   > single weak signal), is capped when there is no title evidence,
 *   and maps to a review status via `statusFromConfidence` (VERIFIED
 *   is unreachable here by design — only explicit verification sets
 *   it).
 * - A CONTESTED top (margin <= 1 with a real runner-up) classifies
 *   UNKNOWN (I10b E9): a composite sheet must not get a forced single
 *   class via tie-break or a 1-point edge — the evidence barely
 *   distinguishes the top class from its rival, so the label would be
 *   a coin flip and the pipeline would apply the wrong class policy.
 *   The contest is recorded in `signals` (`tie:A/B` for margin 0,
 *   `contested:A/B` for margin 1). A single weak signal with NO
 *   runner-up still classifies (low confidence, UNRESOLVED) — that is
 *   weak evidence, not contested evidence.
 *
 * Substring traps are avoided with word-boundary matching: bare
 * "site" is never a signal ("arsitektur" contains it), and bare
 * "jadwal" is never a signal (a work schedule is not a drawing
 * schedule). All matched signals are recorded in `signals[]` for
 * traceability.
 */

import type {
  DrawingPageClass,
  PageClassification,
  VisionPageMeta,
} from './types';
import { statusFromConfidence } from './types';

/** Input to {@link classifyDrawingPage}. */
export interface ClassifyDrawingPageInput
  extends Pick<VisionPageMeta, 'page' | 'hasTextLayer'> {
  /** Drawing title (title block / file name), when known. */
  title?: string;
  /** Native text-layer content, when present. Ignored when `hasTextLayer` is false. */
  text?: string;
}

interface ClassSignalSpec {
  /** Title-start phrases. The longest match across all classes wins. */
  anchors: string[];
  /** Keyword phrases with body-text weight (title matches count double). */
  keywords: Array<{ phrase: string; weight: number }>;
}

/**
 * Signal table for the 13 spec classes. Indonesian drawing terms first,
 * English equivalents alongside. UNKNOWN has no signals by definition.
 */
export const DRAWING_CLASS_SIGNALS: Record<
  Exclude<DrawingPageClass, 'UNKNOWN'>,
  ClassSignalSpec
> = {
  COVER: {
    anchors: [
      'sampul',
      'cover',
      'halaman judul',
      'lembar judul',
      'daftar gambar',
      'daftar isi',
    ],
    keywords: [
      { phrase: 'sampul', weight: 3 },
      { phrase: 'cover', weight: 3 },
      { phrase: 'halaman judul', weight: 3 },
      { phrase: 'lembar judul', weight: 3 },
      { phrase: 'daftar gambar', weight: 2 },
      { phrase: 'daftar isi', weight: 2 },
      { phrase: 'gambar kerja', weight: 1 },
    ],
  },
  SITE_PLAN: {
    anchors: [
      'denah situasi',
      'site plan',
      'siteplan',
      'denah lokasi',
      'rencana tapak',
      'peta lokasi',
    ],
    keywords: [
      { phrase: 'denah situasi', weight: 4 },
      { phrase: 'site plan', weight: 4 },
      { phrase: 'siteplan', weight: 3 },
      { phrase: 'situasi', weight: 3 },
      { phrase: 'rencana tapak', weight: 3 },
      { phrase: 'denah lokasi', weight: 3 },
      { phrase: 'peta lokasi', weight: 2 },
      { phrase: 'batas tanah', weight: 1 },
      { phrase: 'garis sempadan', weight: 1 },
      { phrase: 'gsb', weight: 1 },
    ],
  },
  FLOOR_PLAN: {
    anchors: ['denah lantai', 'denah', 'floor plan', 'rencana lantai'],
    keywords: [
      { phrase: 'denah lantai', weight: 4 },
      { phrase: 'floor plan', weight: 4 },
      { phrase: 'denah', weight: 3 },
      { phrase: 'rencana lantai', weight: 3 },
    ],
  },
  ELEVATION: {
    anchors: ['tampak', 'elevation'],
    keywords: [
      { phrase: 'tampak', weight: 3 },
      { phrase: 'elevation', weight: 3 },
      { phrase: 'fasad', weight: 2 },
      { phrase: 'facade', weight: 2 },
    ],
  },
  SECTION: {
    anchors: ['potongan', 'section'],
    keywords: [
      { phrase: 'potongan', weight: 3 },
      { phrase: 'section', weight: 3 },
      { phrase: 'penampang', weight: 2 },
    ],
  },
  STRUCTURAL: {
    anchors: [
      'denah struktur',
      'denah kolom',
      'denah balok',
      'denah sloof',
      'denah pelat',
      'denah ring balk',
      'struktur',
    ],
    keywords: [
      { phrase: 'denah struktur', weight: 4 },
      { phrase: 'struktur', weight: 3 },
      { phrase: 'kolom', weight: 2 },
      { phrase: 'balok', weight: 2 },
      { phrase: 'sloof', weight: 2 },
      { phrase: 'pelat', weight: 2 },
      { phrase: 'ring balk', weight: 2 },
      { phrase: 'ringbalk', weight: 2 },
      { phrase: 'beton bertulang', weight: 2 },
      { phrase: 'pembesian', weight: 2 },
      { phrase: 'tulangan', weight: 2 },
    ],
  },
  FOUNDATION: {
    anchors: [
      'denah pondasi',
      'pondasi',
      'denah footplat',
      'footplat',
      'denah pile cap',
      'pile cap',
    ],
    keywords: [
      { phrase: 'denah pondasi', weight: 4 },
      { phrase: 'pondasi', weight: 3 },
      { phrase: 'pondasi batu kali', weight: 3 },
      { phrase: 'pondasi strauss', weight: 3 },
      { phrase: 'footplat', weight: 2 },
      { phrase: 'pile cap', weight: 2 },
      { phrase: 'tiang pancang', weight: 2 },
      { phrase: 'bored pile', weight: 2 },
    ],
  },
  ROOF_PLAN: {
    anchors: ['denah atap', 'atap', 'roof plan', 'denah rangka atap'],
    keywords: [
      { phrase: 'denah atap', weight: 4 },
      { phrase: 'roof plan', weight: 4 },
      { phrase: 'atap', weight: 3 },
      { phrase: 'rangka atap', weight: 3 },
      { phrase: 'kuda kuda', weight: 2 },
      { phrase: 'genteng', weight: 1 },
    ],
  },
  DOOR_WINDOW_SCHEDULE: {
    anchors: [
      'jadwal kusen',
      'daftar kusen',
      'denah kusen',
      'jadwal pintu',
      'jadwal jendela',
      'jadwal pintu dan jendela',
      'door schedule',
      'window schedule',
    ],
    keywords: [
      { phrase: 'jadwal kusen', weight: 4 },
      { phrase: 'daftar kusen', weight: 4 },
      { phrase: 'denah kusen', weight: 4 },
      { phrase: 'kusen', weight: 3 },
      { phrase: 'jadwal pintu', weight: 3 },
      { phrase: 'jadwal jendela', weight: 3 },
      { phrase: 'daun pintu', weight: 1 },
      { phrase: 'daun jendela', weight: 1 },
    ],
  },
  STRUCTURAL_SCHEDULE: {
    anchors: [
      'jadwal pembesian',
      'jadwal tulangan',
      'jadwal kolom',
      'jadwal balok',
      'jadwal pondasi',
      'jadwal struktur',
      'daftar pembesian',
      'bar bending schedule',
    ],
    keywords: [
      { phrase: 'jadwal pembesian', weight: 4 },
      { phrase: 'jadwal tulangan', weight: 4 },
      { phrase: 'jadwal kolom', weight: 3 },
      { phrase: 'jadwal balok', weight: 3 },
      { phrase: 'jadwal pondasi', weight: 3 },
      { phrase: 'jadwal struktur', weight: 3 },
      { phrase: 'daftar pembesian', weight: 3 },
      { phrase: 'bar bending', weight: 3 },
      { phrase: 'pembesian', weight: 2 },
      { phrase: 'tulangan', weight: 2 },
    ],
  },
  MEP: {
    anchors: [
      'denah instalasi',
      'instalasi',
      'denah listrik',
      'denah plumbing',
      'denah air bersih',
      'denah sanitair',
      'denah mep',
      'mep',
      'mekanikal elektrikal',
    ],
    keywords: [
      { phrase: 'denah instalasi', weight: 4 },
      { phrase: 'instalasi', weight: 3 },
      { phrase: 'mep', weight: 3 },
      { phrase: 'listrik', weight: 2 },
      { phrase: 'elektrikal', weight: 2 },
      { phrase: 'plumbing', weight: 2 },
      { phrase: 'plambing', weight: 2 },
      { phrase: 'air bersih', weight: 2 },
      { phrase: 'air kotor', weight: 2 },
      { phrase: 'sanitair', weight: 2 },
      { phrase: 'mekanikal', weight: 2 },
      { phrase: 'tata udara', weight: 2 },
      { phrase: 'penerangan', weight: 1 },
      { phrase: 'pipa', weight: 1 },
    ],
  },
  DETAIL: {
    anchors: ['detail'],
    keywords: [
      { phrase: 'detail', weight: 3 },
      { phrase: 'detail sambungan', weight: 3 },
      { phrase: 'detail konstruksi', weight: 3 },
    ],
  },
  LEGEND_SPEC: {
    anchors: [
      'legenda',
      'legend',
      'spesifikasi',
      'rks',
      'rencana kerja dan syarat',
      'catatan umum',
    ],
    keywords: [
      { phrase: 'legenda', weight: 3 },
      { phrase: 'legend', weight: 3 },
      { phrase: 'spesifikasi', weight: 3 },
      { phrase: 'rks', weight: 3 },
      { phrase: 'rencana kerja', weight: 3 },
      { phrase: 'catatan umum', weight: 2 },
      { phrase: 'simbol', weight: 1 },
      { phrase: 'notasi', weight: 1 },
    ],
  },
  // I10b E12 — civil / road / bridge / dam / water works. Anchors do the
  // heavy lifting (a civil sheet's title names the work); keywords stay
  // modest so civil terms in a site plan's surroundings ("jalan akses",
  // "sungai di utara") or a section title ("Road Section") cannot flip
  // a building sheet. `road` is weight 1 deliberately: it appears in
  // addresses and section titles on building sheets. `street` is NOT a
  // signal at all (address word, not a civil-works term). Both
  // spellings of the alignment word are covered (`alinemen` in titles,
  // `alinement` in body text on Indonesian road drawings).
  CIVIL: {
    anchors: [
      'denah alinement',
      'denah alinemen',
      'denah jalan',
      'denah jembatan',
      'denah bendungan',
      'denah saluran',
      'denah drainase',
      'alinemen',
      'alinement',
      'alinem',
      'road',
      'jalan raya',
      'jembatan',
      'bendungan',
      'saluran irigasi',
    ],
    keywords: [
      { phrase: 'alinemen', weight: 3 },
      { phrase: 'alinement', weight: 3 },
      { phrase: 'alinem', weight: 3 },
      { phrase: 'jalan', weight: 2 },
      { phrase: 'jembatan', weight: 2 },
      { phrase: 'bendungan', weight: 2 },
      { phrase: 'saluran', weight: 2 },
      { phrase: 'irigasi', weight: 2 },
      { phrase: 'sungai', weight: 2 },
      { phrase: 'bridge', weight: 2 },
      { phrase: 'dam', weight: 2 },
      { phrase: 'highway', weight: 2 },
      { phrase: 'drainase', weight: 2 },
      { phrase: 'gorong', weight: 2 },
      { phrase: 'box culvert', weight: 2 },
      { phrase: 'talud', weight: 2 },
      { phrase: 'tanggul', weight: 2 },
      { phrase: 'embung', weight: 2 },
      { phrase: 'road', weight: 1 },
      { phrase: 'sta', weight: 1 },
      { phrase: 'station', weight: 1 },
    ],
  },
};

/** Deterministic evaluation order (I10b E9: ties no longer break by order — they classify UNKNOWN). */
const CLASS_ORDER: Array<Exclude<DrawingPageClass, 'UNKNOWN'>> = [
  'COVER',
  'SITE_PLAN',
  'FLOOR_PLAN',
  'ELEVATION',
  'SECTION',
  'STRUCTURAL',
  'FOUNDATION',
  'ROOF_PLAN',
  'DOOR_WINDOW_SCHEDULE',
  'STRUCTURAL_SCHEDULE',
  'MEP',
  'DETAIL',
  'LEGEND_SPEC',
  'CIVIL',
];

/** Score bonus for the winning title-start anchor. */
const ANCHOR_BONUS = 8;
/** Title keyword matches count double vs body-text matches. */
const TITLE_MULTIPLIER = 2;
/** Confidence ceiling when the winning class has no title evidence. */
const BODY_ONLY_CONFIDENCE_CAP = 0.8;

function normalize(raw: string | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary match, so "site" never fires inside "arsitektur". */
function phrasePattern(phrase: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`);
}

/** Title-start match with a word boundary after the anchor phrase. */
function anchorPattern(anchor: string): RegExp {
  return new RegExp(`^${escapeRegExp(anchor)}\\b`);
}

interface ClassScore {
  score: number;
  signals: string[];
  hasTitleSignal: boolean;
}

/**
 * Classify one drawing page from its title + native text layer.
 * Pure function. Never guesses: no signal means UNKNOWN at confidence 0.
 */
export function classifyDrawingPage(
  input: ClassifyDrawingPageInput,
): PageClassification {
  const page = input.page;
  const titleNorm = normalize(input.title);
  // Without a text layer the page is scanned/image-only: any `text` is
  // untrusted and must not drive classification. The title (title block
  // / file name) is independent evidence and still counts.
  const textNorm = input.hasTextLayer ? normalize(input.text) : '';

  // 1. Title-start anchor: longest matching anchor across all classes wins.
  let anchorWinner: {
    drawingClass: Exclude<DrawingPageClass, 'UNKNOWN'>;
    anchor: string;
  } | null = null;
  if (titleNorm) {
    for (const drawingClass of CLASS_ORDER) {
      for (const anchor of DRAWING_CLASS_SIGNALS[drawingClass].anchors) {
        if (
          anchorPattern(anchor).test(titleNorm) &&
          (!anchorWinner || anchor.length > anchorWinner.anchor.length)
        ) {
          anchorWinner = { drawingClass, anchor };
        }
      }
    }
  }

  // 2. Keyword scoring per class (title x2, body x1) + anchor bonus.
  const scores = new Map<Exclude<DrawingPageClass, 'UNKNOWN'>, ClassScore>();
  for (const drawingClass of CLASS_ORDER) {
    const spec = DRAWING_CLASS_SIGNALS[drawingClass];
    const entry: ClassScore = { score: 0, signals: [], hasTitleSignal: false };
    if (anchorWinner && anchorWinner.drawingClass === drawingClass) {
      entry.score += ANCHOR_BONUS;
      entry.signals.push(`title-anchor:"${anchorWinner.anchor}"`);
      entry.hasTitleSignal = true;
    }
    for (const { phrase, weight } of spec.keywords) {
      const pattern = phrasePattern(phrase);
      if (titleNorm && pattern.test(titleNorm)) {
        entry.score += weight * TITLE_MULTIPLIER;
        entry.signals.push(`title:"${phrase}"`);
        entry.hasTitleSignal = true;
      }
      if (textNorm && pattern.test(textNorm)) {
        entry.score += weight;
        entry.signals.push(`text:"${phrase}"`);
      }
    }
    scores.set(drawingClass, entry);
  }

  // 3. Pick the top class (and the runner-up, for the tie/contested checks).
  let best: Exclude<DrawingPageClass, 'UNKNOWN'> | null = null;
  let bestScore = 0;
  let secondClass: Exclude<DrawingPageClass, 'UNKNOWN'> | null = null;
  let secondScore = 0;
  for (const drawingClass of CLASS_ORDER) {
    const score = scores.get(drawingClass)?.score ?? 0;
    if (score > bestScore) {
      secondClass = best;
      secondScore = bestScore;
      bestScore = score;
      best = drawingClass;
    } else if (score > secondScore) {
      secondClass = drawingClass;
      secondScore = score;
    }
  }

  // 4. No signal at all: UNKNOWN, confidence 0, UNRESOLVED. Never guess.
  if (!best || bestScore <= 0) {
    return {
      page,
      drawingClass: 'UNKNOWN',
      confidence: 0,
      signals: [],
      status: 'UNRESOLVED',
    };
  }

  // 4b. I10b E9 — a contested top is not a classification: the sheet is
  // composite (several drawing types on one page) or genuinely
  // ambiguous, and a forced single class via tie-break — or a 1-point
  // edge — misleads the pipeline (wrong vision policy, wrong per-class
  // gating). Return UNKNOWN with the contest recorded for
  // traceability. A lone weak signal (secondScore 0) is NOT contested
  // and still classifies at low confidence below.
  if (secondClass !== null && bestScore - secondScore <= 1) {
    const margin = bestScore - secondScore;
    return {
      page,
      drawingClass: 'UNKNOWN',
      confidence: 0,
      signals: [
        margin === 0
          ? `tie:${best}/${secondClass}`
          : `contested:${best}/${secondClass}`,
      ],
      status: 'UNRESOLVED',
    };
  }

  const bestEntry = scores.get(best) as ClassScore;

  // 5. Confidence from signal strength: multiple agreeing signals score
  //    higher than a single weak signal. Body-only evidence is capped
  //    so it can never claim high confidence. (Contested tops never
  //    reach here — step 4b returns UNKNOWN for margin <= 1.)
  let confidence = Math.min(0.95, 0.3 + 0.08 * bestScore);
  if (!bestEntry.hasTitleSignal) {
    confidence = Math.min(confidence, BODY_ONLY_CONFIDENCE_CAP);
  }
  confidence = Math.round(confidence * 100) / 100;

  return {
    page,
    drawingClass: best,
    confidence,
    signals: bestEntry.signals,
    status: statusFromConfidence(confidence),
  };
}
