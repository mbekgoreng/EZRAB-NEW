/**
 * I3 — door/window/opening intelligence suite (plain-tsx assertion script,
 * NO vitest imports; run from repo root:
 *   npx --yes tsx src/test/dedVisionOpenings.test.ts
 *
 * Fixtures carry hand-verified ground truth. Prints `PASS n/total` and
 * exits non-zero on any failure.
 */

import {
  parseScheduleRow,
  linkOpeningToSchedule,
  countOpenings,
  checkOpeningConflict,
  checkOpeningConflictDetail,
  extractKeywordQualifiedDigitMark,
  findMarkToken,
  findUnusedScheduleEntries,
  normalizeMark,
  extractKeywordQualifiedMark,
  OPENING_DIMENSION_TOLERANCE_MM,
  type OpeningOccurrence,
  type ScheduleEntry,
} from '../ai-tools/ded-vision/openings';
import type { EvidenceRecord } from '../ai-tools/ded-vision/types';

let passed = 0;
let total = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  total += 1;
  if (cond) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(actual: T, expected: T): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function ev(page: number): EvidenceRecord {
  return {
    id: `EV-${page}`,
    sourceDocumentId: 'DOC-FIXTURE',
    sourceFileName: 'fixture-ded.pdf',
    pageNumber: page,
    type: 'SCHEDULE_ROW',
    content: 'fixture evidence',
    confidence: 0.95,
  };
}

// ---------------------------------------------------------------------------
// normalizeMark
// ---------------------------------------------------------------------------
check('normalizeMark lowercases/uppercases', normalizeMark('d1') === 'D1');
check('normalizeMark strips hyphen', normalizeMark('D-1') === 'D1');
check('normalizeMark trims + uppercases', normalizeMark(' pj1 ') === 'PJ1');

// Tolerance is stated, not silently assumed.
check(
  'dimension tolerance is exactly 0 mm after rounding',
  OPENING_DIMENSION_TOLERANCE_MM === 0,
);

// ---------------------------------------------------------------------------
// parseScheduleRow — dimension formats (ground truth in mm)
// ---------------------------------------------------------------------------
const r1 = parseScheduleRow('D1 90/210 Kusen Aluminium, Daun Panel Kayu', 8);
check('slash form: mark D1', r1?.mark === 'D1');
check('slash form: 90/210 cm → 900×2100 mm', r1?.widthMm === 900 && r1?.heightMm === 2100);
check('slash form: frame verbatim', r1?.frame === 'Kusen Aluminium');
check('slash form: material verbatim', r1?.material === 'Panel Kayu');
check('slash form: no glazing hint → null', r1?.glazing === null);
check('slash form: sourcePage + rowText kept', r1?.sourcePage === 8 && r1?.rowText === 'D1 90/210 Kusen Aluminium, Daun Panel Kayu');

const r2 = parseScheduleRow('P2 900×2100 mm Kusen Kayu Jati Kaca Bening', 8);
check('× form: 900×2100 mm stays mm', r2?.widthMm === 900 && r2?.heightMm === 2100);
check('× form: frame with wood species', r2?.frame === 'Kusen Kayu Jati');
check('× form: glazing verbatim', r2?.glazing === 'Kaca Bening');
check('× form: frame wood is not claimed as leaf material', r2?.material === null);

const r3 = parseScheduleRow('W3 900 x 2100 mm', 8);
check('x form: 900 x 2100 mm', r3?.widthMm === 900 && r3?.heightMm === 2100);
check('x form: no hints → all null', r3?.material === null && r3?.frame === null && r3?.glazing === null);

const r4 = parseScheduleRow('J1 120 x 150 cm Kusen UPVC Kaca Tempered', 9);
check('cm unit: 120 x 150 cm → 1200×1500 mm', r4?.widthMm === 1200 && r4?.heightMm === 1500);
check('cm unit: frame UPVC', r4?.frame === 'Kusen UPVC');
check('cm unit: glazing tempered', r4?.glazing === 'Kaca Tempered');

const r5 = parseScheduleRow('K1 0,9 x 2,1 m', 9);
check('metre form: 0,9 x 2,1 m → 900×2100 mm', r5?.widthMm === 900 && r5?.heightMm === 2100);

const r6 = parseScheduleRow('D5 900 x 2.100 mm', 9);
check('thousands dot: 2.100 mm → 2100', r6?.widthMm === 900 && r6?.heightMm === 2100);

const r7 = parseScheduleRow('BV1 60/180', 9);
check('two-letter mark BV1 + slash cm', r7?.mark === 'BV1' && r7?.widthMm === 600 && r7?.heightMm === 1800);

const r8 = parseScheduleRow('W9 1200/1500', 9);
check('slash magnitude ≥300 → mm', r8?.widthMm === 1200 && r8?.heightMm === 1500);

const r9 = parseScheduleRow('PJ1 150/210', 9);
check('three-letter mark PJ1', r9?.mark === 'PJ1' && r9?.widthMm === 1500 && r9?.heightMm === 2100);

const r10 = parseScheduleRow('d2 80/200', 9);
check('lowercase mark normalizes to D2', r10?.mark === 'D2' && r10?.widthMm === 800);

const r11 = parseScheduleRow('D-3 80/200', 9);
check('hyphenated mark D-3 → D3', r11?.mark === 'D3' && r11?.widthMm === 800);

const r12 = parseScheduleRow('D9 Kusen Aluminium', 9);
check('mark without dims: row still parses', r12?.mark === 'D9');
check('mark without dims: dims null, never invented', r12?.widthMm === null && r12?.heightMm === null);
check('mark without dims: frame still extracted', r12?.frame === 'Kusen Aluminium');

const r13 = parseScheduleRow('90/210 Kusen Aluminium', 9);
check('no mark → null', r13 === null);

const r14 = parseScheduleRow('D1 90/210 Kusen Aluminium 4 inch', 9);
check('frame with size phrase', r14?.frame === 'Kusen Aluminium 4 inch');

const r15 = parseScheduleRow('J2 150/150 Kaca', 9);
check('bare trailing kaca → glazing', r15?.glazing === 'Kaca');

// kind is never inferred from the mark letter (marks are project-defined).
check('kind left unset (no mark-letter inference)', r1?.kind === undefined);

// ---------------------------------------------------------------------------
// I10b E4 — letter-only marks (Indian/English schedules: D, MD, W, V, KV, G)
// A letter-only mark qualifies ONLY with an opening keyword in the row —
// the keyword is the discriminator against grid labels / section markers.
// Real rows from the I10a report (90135 + 111853 joinery schedules).
// ---------------------------------------------------------------------------
const e4rows: Array<[string, string, number, number]> = [
  ['D-DOOR - 0.91X2.13', 'D', 910, 2130],
  ['MD-MAIN DOOR - 1.07X2.13', 'MD', 1070, 2130],
  ['W-WINDOW - 0.91X1.21', 'W', 910, 1210],
  ['V-VENTILATOR - 0.91X0.61', 'V', 910, 610],
  ['KV-KIT-VENTILATOR - 1.21X0.91', 'KV', 1210, 910],
  ['G-GATE - 1.07X2.13', 'G', 1070, 2130],
  ['MD MAIN DOOR 1.06X2.13', 'MD', 1060, 2130],
  ['W WINDOW 1.52X1.83', 'W', 1520, 1830],
  ['V VENTILATOR 0.91X0.61', 'V', 910, 610],
];
for (const [row, mark, w, h] of e4rows) {
  const parsed = parseScheduleRow(row, 1);
  check(
    `E4 letter-only mark: ${JSON.stringify(row)} → ${mark} ${w}×${h}`,
    parsed?.mark === mark && parsed?.widthMm === w && parsed?.heightMm === h,
    `got ${parsed ? `${parsed.mark} ${parsed.widthMm}×${parsed.heightMm}` : 'null'}`,
  );
}
// A digit mark still wins over the letter fallback (D1, not D).
const e4d1 = parseScheduleRow('D1-DOOR - 0.76X2.13', 1);
check('E4 digit mark wins: D1-DOOR → D1 (not D)', e4d1?.mark === 'D1' && e4d1?.widthMm === 760);
// The dimension separator X must never become a phantom mark X2.
const e4x = parseScheduleRow('D DOOR 0.91 X 2.13', 1);
check('E4 spaced pair: D DOOR 0.91 X 2.13 → D (never phantom X2)', e4x?.mark === 'D' && e4x?.widthMm === 910);
// No keyword → no letter mark (grid labels / section markers stay null).
check('E4 no keyword: "D 0.91X2.13" → null', parseScheduleRow('D 0.91X2.13', 1) === null);
check('E4 no keyword: "A SECTION" → null', parseScheduleRow('A SECTION', 1) === null);
check(
  'E4 keyword without a leading mark: "90/210 Kusen Aluminium" → null',
  parseScheduleRow('90/210 Kusen Aluminium', 1) === null,
);
check(
  'E4 keyword without a leading mark: "Tanpa kode | Pintu | 90 x 210" → null',
  parseScheduleRow('Tanpa kode | Pintu | 90 x 210', 1) === null,
);
// extractKeywordQualifiedMark (shared with the pipeline + OCR router).
check('extractKeywordQualifiedMark: "D DOOR" → D', extractKeywordQualifiedMark('D DOOR') === 'D');
check('extractKeywordQualifiedMark: "MD MAIN DOOR" → MD', extractKeywordQualifiedMark('MD MAIN DOOR') === 'MD');
check('extractKeywordQualifiedMark: "KV-KIT-VENTILATOR" → KV', extractKeywordQualifiedMark('KV-KIT-VENTILATOR') === 'KV');
check('extractKeywordQualifiedMark: "D1 DOOR" → null (digit marks are not its business)', extractKeywordQualifiedMark('D1 DOOR') === null);
check('extractKeywordQualifiedMark: "MAIN DOOR" → null (4-letter first token)', extractKeywordQualifiedMark('MAIN DOOR') === null);
check('extractKeywordQualifiedMark: "D 0.91X2.13" → null (no keyword)', extractKeywordQualifiedMark('D 0.91X2.13') === null);

// ---------------------------------------------------------------------------
// linkOpeningToSchedule
// ---------------------------------------------------------------------------
const schedule: ScheduleEntry[] = [
  parseScheduleRow('D1 90/210 Kusen Aluminium, Daun Panel Kayu', 8)!,
  parseScheduleRow('P2 900×2100 mm Kusen Kayu Jati Kaca Bening', 8)!,
  parseScheduleRow('D9 Kusen Aluminium', 8)!, // row exists, no dimensions
  parseScheduleRow('W7 120/150', 8)!, // unused by any plan below
];

const linked = linkOpeningToSchedule(
  { mark: 'd1', elementType: 'door', sourcePages: [3, 3, 5], evidence: [ev(3)] },
  schedule,
);
check('link: case-insensitive match fills width/height', linked.widthMm === 900 && linked.heightMm === 2100);
check('link: material/frame from row', linked.material === 'Panel Kayu' && linked.frame === 'Kusen Aluminium');
check('link: schedulePage set', linked.schedulePage === 8);
check('link: match → HIGH_CONFIDENCE', linked.status === 'HIGH_CONFIDENCE');
check('link: VERIFIED is never set here', linked.status !== 'VERIFIED');
check('link: confidence 0.9', linked.confidence === 0.9);
check('link: single opening quantity 1', linked.quantity === 1);
check('link: sourcePages deduped + sorted', eq(linked.sourcePages, [3, 5]));
check('link: evidence passed through', linked.evidence.length === 1);

const unlinked = linkOpeningToSchedule(
  { mark: 'D4', elementType: 'door', sourcePages: [4], evidence: [] },
  schedule,
);
check('no match: dims null', unlinked.widthMm === null && unlinked.heightMm === null);
check('no match: material/frame/glazing null', unlinked.material === null && unlinked.frame === null && unlinked.glazing === null);
check('no match: schedulePage null', unlinked.schedulePage === null);
check('no match: status UNRESOLVED', unlinked.status === 'UNRESOLVED');
check('no match: confidence 0', unlinked.confidence === 0);

const linkedNoDims = linkOpeningToSchedule(
  { mark: 'D9', elementType: 'door', sourcePages: [4], evidence: [] },
  schedule,
);
check('matched row without dims: link still HIGH_CONFIDENCE', linkedNoDims.status === 'HIGH_CONFIDENCE');
check('matched row without dims: dims stay null', linkedNoDims.widthMm === null && linkedNoDims.heightMm === null);

// ---------------------------------------------------------------------------
// countOpenings — counting across 2 floor plans
// ---------------------------------------------------------------------------
const occurrences: OpeningOccurrence[] = [
  { mark: 'D1', elementType: 'door', page: 3, floor: 'Lt 1' },
  { mark: 'D1', elementType: 'door', page: 3, floor: 'Lt 1' },
  { mark: 'D1', elementType: 'door', page: 5, floor: 'Lt 2' },
  { mark: 'D1', elementType: 'door', page: 5, floor: 'Lt 2' },
  { mark: 'D1', elementType: 'door', page: 5, floor: 'Lt 2' },
  { mark: 'P2', elementType: 'door', page: 3, floor: 'Lt 1' },
  { mark: 'D4', elementType: 'door', page: 5, floor: 'Lt 2' }, // not in schedule
  { mark: 'D9', elementType: 'door', page: 3, floor: 'Lt 1' }, // in schedule, row has no dims
  { mark: 'J1', elementType: 'window', page: 3 }, // no floor
  { mark: 'J1', elementType: 'window', page: 5 }, // no floor, second page
];
const counted = countOpenings(occurrences, schedule);

const d1Records = counted.filter((o) => o.mark === 'D1');
check('count: same mark on 2 floors → 2 records', d1Records.length === 2);
check('count: Lt 1 quantity 2', d1Records.find((o) => eq(o.sourcePages, [3]))?.quantity === 2);
check('count: Lt 2 quantity 3', d1Records.find((o) => eq(o.sourcePages, [5]))?.quantity === 3);
check(
  'count: quantities add up to mark total 5',
  d1Records.reduce((sum, o) => sum + o.quantity, 0) === 5,
);
check('count: per-floor records both linked to schedule', d1Records.every((o) => o.status === 'HIGH_CONFIDENCE' && o.widthMm === 900));

const p2 = counted.find((o) => o.mark === 'P2');
check('count: single occurrence quantity 1', p2?.quantity === 1 && p2?.heightMm === 2100);

const d4 = counted.find((o) => o.mark === 'D4');
check('count: mark-in-plan-but-not-in-schedule → UNRESOLVED', d4?.status === 'UNRESOLVED');
check('count: unresolved mark keeps null dims', d4?.widthMm === null && d4?.heightMm === null);
check('count: unresolved mark still counted', d4?.quantity === 1);

const d9 = counted.find((o) => o.mark === 'D9');
check('count: matched row without dims → HIGH_CONFIDENCE, null dims', d9?.status === 'HIGH_CONFIDENCE' && d9?.widthMm === null && d9?.heightMm === null);

const j1Records = counted.filter((o) => o.mark === 'J1');
check('count: no-floor occurrences aggregate into one record', j1Records.length === 1);
check('count: no-floor quantity adds across pages', j1Records[0]?.quantity === 2);
check('count: no-floor sourcePages merged + sorted', eq(j1Records[0]?.sourcePages, [3, 5]));

check('count: empty occurrences → empty', countOpenings([], schedule).length === 0);
check(
  'count: deterministic order by mark then floor',
  eq(counted.map((o) => o.mark), ['D1', 'D1', 'D4', 'D9', 'J1', 'P2']),
);

// Schedule entry unused by any plan.
const unused = findUnusedScheduleEntries(schedule, counted);
check('unused schedule: W7 reported', unused.length === 1 && unused[0].mark === 'W7');
check('unused schedule: D1/D9/P2 not reported as unused', !unused.some((s) => ['D1', 'D9', 'P2'].includes(s.mark)));
check('unused schedule: empty openings → all unused', findUnusedScheduleEntries(schedule, []).length === 4);

// ---------------------------------------------------------------------------
// checkOpeningConflict — plan vs schedule
// ---------------------------------------------------------------------------
const schedD1 = schedule[0]; // D1 900×2100
check('conflict: exact match → OK', checkOpeningConflict({ mark: 'D1', widthMm: 900, heightMm: 2100 }, schedD1) === 'OK');
check('conflict: width mismatch → CONFLICT', checkOpeningConflict({ mark: 'D1', widthMm: 800, heightMm: 2100 }, schedD1) === 'CONFLICT');
check('conflict: height mismatch → CONFLICT', checkOpeningConflict({ mark: 'D1', widthMm: 900, heightMm: 2000 }, schedD1) === 'CONFLICT');
check('conflict: both mismatch → CONFLICT', checkOpeningConflict({ mark: 'D1', widthMm: 800, heightMm: 2000 }, schedD1) === 'CONFLICT');
check('conflict: 1 mm off → CONFLICT (0 mm tolerance)', checkOpeningConflict({ mark: 'D1', widthMm: 901, heightMm: 2100 }, schedD1) === 'CONFLICT');
check('conflict: sub-mm rounding 900.4 → OK', checkOpeningConflict({ mark: 'D1', widthMm: 900.4, heightMm: 2100 }, schedD1) === 'OK');
check('conflict: sub-mm rounding 900.6 → CONFLICT', checkOpeningConflict({ mark: 'D1', widthMm: 900.6, heightMm: 2100 }, schedD1) === 'CONFLICT');
check('conflict: missing plan dims → OK (unverified, not conflict)', checkOpeningConflict({ mark: 'D1', widthMm: null, heightMm: null }, schedD1) === 'OK');
check('conflict: missing plan width only → OK', checkOpeningConflict({ mark: 'D1', widthMm: null, heightMm: 2100 }, schedD1) === 'OK');
check('conflict: missing schedule dims → OK (unverified)', checkOpeningConflict({ mark: 'D9', widthMm: 900, heightMm: 2100 }, schedule[2]) === 'OK');
check(
  'conflict: one side missing + other side conflicting → CONFLICT',
  checkOpeningConflict({ mark: 'D1', widthMm: null, heightMm: 2000 }, schedD1) === 'CONFLICT',
);

const detailOk = checkOpeningConflictDetail({ mark: 'D1', widthMm: 900, heightMm: 2100 }, schedD1);
check('conflict detail: match is verified', detailOk.result === 'OK' && detailOk.unverified === false);
const detailMissing = checkOpeningConflictDetail({ mark: 'D1', widthMm: null, heightMm: null }, schedD1);
check('conflict detail: missing data flagged unverified', detailMissing.result === 'OK' && detailMissing.unverified === true);
const detailConflict = checkOpeningConflictDetail({ mark: 'D1', widthMm: 800, heightMm: 2100 }, schedD1);
check('conflict detail: reason names the mismatch', detailConflict.result === 'CONFLICT' && detailConflict.reason.includes('800') && detailConflict.reason.includes('900'));

// A mark with a conflicting width on ONE floor only (Lt 1 matches, Lt 2 does not).
const lt1Plan = { mark: 'D1', widthMm: 900, heightMm: 2100 };
const lt2Plan = { mark: 'D1', widthMm: 800, heightMm: 2100 };
check('per-floor: Lt 1 plan matches schedule → OK', checkOpeningConflict(lt1Plan, schedD1) === 'OK');
check('per-floor: Lt 2 plan width conflicts → CONFLICT', checkOpeningConflict(lt2Plan, schedD1) === 'CONFLICT');

// ---------------------------------------------------------------------------
// I11 Stage 4 — E15 schedule third dimension (thickness)
// ---------------------------------------------------------------------------

// F1 100×100×40 (cm): the third value survives as thicknessMm with the
// unit inferred from the max of all three values.
const t1 = parseScheduleRow('F1 100×100×40', 3);
check('E15: triple row keeps the mark', t1?.mark === 'F1');
check('E15: triple row width 1000 mm', t1?.widthMm === 1000);
check('E15: triple row height 1000 mm', t1?.heightMm === 1000);
check('E15: triple row thickness 400 mm', t1?.thicknessMm === 400);
const t2 = parseScheduleRow('F2 120/120/50', 3);
check('E15: slash triple width 1200 mm', t2?.widthMm === 1200);
check('E15: slash triple thickness 500 mm', t2?.thicknessMm === 500);
const t3 = parseScheduleRow('K1 15/30', 3);
check('E15: pair row has NO thickness (role unknowable)', t3?.thicknessMm === null);
const t4 = parseScheduleRow('D1 900×2100 mm', 3);
check('E15: mm pair row has NO thickness', t4?.thicknessMm === null);
const t5 = parseScheduleRow('F1 100×100×40 tebal 40 cm', 3);
check('E15: triple row with a thickness word still reads 400 mm', t5?.thicknessMm === 400);

// ---------------------------------------------------------------------------
// I11 Stage 4 — F8/F11 mark helpers
// ---------------------------------------------------------------------------

check('F8 findMarkToken: first digit-bearing mark anywhere', findMarkToken('lihat kolom K1 di denah') === 'K1');
check('F8 findMarkToken: D1 in free text', findMarkToken('Pintu D1') === 'D1');
check('F8 findMarkToken: spec-like D12-150 is NOT a mark', findMarkToken('tulangan D12-150') === null);
check('F8 findMarkToken: bare letters are not marks (no digits)', findMarkToken('pintu D') === null);
check('F8 findMarkToken: no mark in plain text', findMarkToken('ruang tamu') === null);
check('F11 digit mark: Pintu D1 → D1', extractKeywordQualifiedDigitMark('Pintu D1') === 'D1');
check('F11 digit mark: JENDELA J2 → J2', extractKeywordQualifiedDigitMark('JENDELA J2') === 'J2');
check('F11 digit mark: keyword + mark in either order', extractKeywordQualifiedDigitMark('D1 pintu utama') === 'D1');
check('F11 digit mark: no keyword → null', extractKeywordQualifiedDigitMark('K1 di denah') === null);
check('F11 digit mark: spec-like D12-150 → null', extractKeywordQualifiedDigitMark('tulangan D12-150 pintu') === null);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL: ${f}`);
}
console.log(`PASS ${passed}/${total}`);
if (passed !== total) process.exit(1);
