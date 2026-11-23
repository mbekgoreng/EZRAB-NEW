/**
 * I11 Stage 4 (E16/E17) — element records + geometry QTO suite
 * (plain-tsx assertion script, NO vitest imports; run from repo root:
 *   npx --yes tsx src/test/dedVisionElements.test.ts
 *
 * Covers elements.ts: keyword inference, mark/diameter extraction,
 * dimension-from-text, schedule linking, and quantity derivation.
 * Fixtures carry hand-verified ground truth. Prints `PASS n/total`
 * and exits non-zero on any failure.
 */

import {
  ELEMENT_TYPE_LABELS,
  diameterFromMark,
  elementDimsFromText,
  elementIdFor,
  elementMarkFromText,
  inferElement,
  linkElementToSchedule,
  quantitiesForElement,
} from '../ai-tools/ded-vision/elements';
import type { ElementRecord, EvidenceRecord, OpeningRecord } from '../ai-tools/ded-vision/types';
import type { ScheduleEntry } from '../ai-tools/ded-vision/openings';

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

function ev(content: string): EvidenceRecord {
  return {
    id: 'EV-001',
    sourceDocumentId: 'test',
    sourceFileName: 'test.pdf',
    pageNumber: 1,
    type: 'TEXT',
    content,
    confidence: 0.9,
  };
}

function row(mark: string, widthMm: number | null, heightMm: number | null, page: number, thicknessMm?: number | null): ScheduleEntry {
  return {
    mark,
    widthMm,
    heightMm,
    thicknessMm: thicknessMm ?? null,
    material: null,
    frame: null,
    glazing: null,
    sourcePage: page,
    rowText: `${mark} schedule row`,
  };
}

/** Minimal opening for wall-deduction tests (only the read fields matter). */
function opening(mark: string, widthMm: number | null, heightMm: number | null, quantity: number): OpeningRecord {
  return {
    mark,
    widthMm,
    heightMm,
    quantity,
    confidence: 0.9,
  } as OpeningRecord;
}

// ---------------------------------------------------------------------------
// inferElement — keyword → category/type (order-sensitive)
// ---------------------------------------------------------------------------

check('infer: kolom → STRUCTURAL/column', JSON.stringify(inferElement('Kolom K1', 'Kolom K1')) === JSON.stringify({ category: 'STRUCTURAL', elementType: 'column' }));
check('infer: balok → STRUCTURAL/beam', inferElement('Balok B1', 'Balok B1')?.elementType === 'beam');
check('infer: pelat → STRUCTURAL/slab', inferElement('Pelat S1', 'Pelat S1')?.elementType === 'slab');
check('infer: pondasi → STRUCTURAL/foundation', inferElement('Pondasi F1', 'Pondasi F1')?.elementType === 'foundation');
check('infer: tulangan → STRUCTURAL/rebar', inferElement('Tulangan D12', 'Tulangan D12')?.elementType === 'rebar');
check('infer: partisi wins over dinding', inferElement('Partisi dinding', 'Partisi dinding')?.elementType === 'partition-wall');
check('infer: dinding → WALL/wall', inferElement('Dinding luar', 'Dinding luar')?.elementType === 'wall');
check('infer: rangka atap wins over atap', inferElement('Rangka atap', 'Rangka atap baja')?.elementType === 'roof-frame');
check('infer: atap → ROOF/roof-plane', inferElement('Atap', 'Atap 6.000 x 8.000')?.elementType === 'roof-plane');
check('infer: genteng → ROOF/roof-covering', inferElement('Genteng', 'Genteng beton')?.elementType === 'roof-covering');
check('infer: pintu air → SDA/sluice-gate (not an opening)', inferElement('Pintu air', 'Pintu air saluran')?.elementType === 'sluice-gate');
check('infer: bendungan → SDA/dam-body', inferElement('Bendungan', 'Bendungan')?.elementType === 'dam-body');
check('infer: bendung does NOT match bendungan', inferElement('Bendung', 'Bendung')?.elementType === 'weir');
check('infer: saluran → SDA/channel', inferElement('Saluran', 'Saluran irigasi')?.elementType === 'channel');
check('infer: jalan → CIVIL/road', inferElement('Jalan', 'Jalan akses')?.elementType === 'road');
check('infer: jembatan → CIVIL/bridge', inferElement('Jembatan', 'Jembatan')?.elementType === 'bridge');
check('infer: room name → null', inferElement('RUANG TAMU', 'ruang tamu') === null);
check('infer: grid label → null', inferElement('A', 'A') === null);

// ---------------------------------------------------------------------------
// diameterFromMark / elementMarkFromText / elementIdFor
// ---------------------------------------------------------------------------

check('diameter: D12 → 12', diameterFromMark('D12') === 12);
check('diameter: D16 → 16', diameterFromMark('D16') === 16);
check('diameter: bare D → null', diameterFromMark('D') === null);
check('diameter: K1 → null', diameterFromMark('K1') === null);
check('diameter: null → null', diameterFromMark(null) === null);
check('markFromText: kolom K1 → K1', elementMarkFromText('kolom K1 di denah') === 'K1');
check('markFromText: D12-150 spec → null', elementMarkFromText('tulangan D12-150') === null);
check('elementId: marked', elementIdFor('STRUCTURAL', 3, 'K1', 'column') === 'el-structural-p3-k1');
check('elementId: unmarked falls back to the type', elementIdFor('WALL', 1, null, 'wall') === 'el-wall-p1-wall');

// ---------------------------------------------------------------------------
// elementDimsFromText — label text → dims (positional, pair-aware)
// ---------------------------------------------------------------------------

{
  const d = elementDimsFromText('Dinding luar 7.000 x 3.500', 'WALL');
  check('dimsFromText: wall 7.000 x 3.500 → length 7000', d.lengthMm === 7000);
  check('dimsFromText: wall height 3500', d.heightMm === 3500);
  check('dimsFromText: wall width stays null', d.widthMm === null);
}
{
  const d = elementDimsFromText('Atap 6.000 x 8.000', 'ROOF');
  check('dimsFromText: roof 6.000 x 8.000 → length 6000', d.lengthMm === 6000);
  check('dimsFromText: roof width 8000', d.widthMm === 8000);
  check('dimsFromText: roof height stays null', d.heightMm === null);
}
{
  const d = elementDimsFromText('15/30', 'STRUCTURAL');
  check('dimsFromText: section pair 15/30 → width 150', d.widthMm === 150);
  check('dimsFromText: section pair 15/30 → height 300', d.heightMm === 300);
  check('dimsFromText: section pair has no length', d.lengthMm === null);
}
{
  const d = elementDimsFromText('Kolom K1', 'STRUCTURAL');
  check('dimsFromText: mark-only text yields no dims', d.lengthMm === null && d.widthMm === null && d.heightMm === null && d.thicknessMm === null);
}
{
  const d = elementDimsFromText('Dinding 7.000', 'WALL');
  check('dimsFromText: a single value yields nothing (role unknowable)', d.lengthMm === null && d.heightMm === null);
}
{
  const d = elementDimsFromText('7.000 x 3.500 x 0.150', 'WALL');
  check('dimsFromText: third value is the thickness (150 mm)', d.thicknessMm === 150);
}

// ---------------------------------------------------------------------------
// linkElementToSchedule — schedule wins, text fills gaps, status rule
// ---------------------------------------------------------------------------

{
  const linked = linkElementToSchedule(
    { category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 2, sourcePages: [2], evidence: [ev('K1')] },
    [row('K1', 150, 300, 5)],
  );
  check('link: schedule row supplies 150×300', linked.widthMm === 150 && linked.heightMm === 300);
  check('link: schedulePage is 5', linked.schedulePage === 5);
  check('link: linked → 0.9 HIGH_CONFIDENCE', linked.confidence === 0.9 && linked.status === 'HIGH_CONFIDENCE');
  check('link: quantity is the occurrence count', linked.quantity === 2);
  check('link: id is deterministic', linked.id === 'el-structural-p2-k1');
}
{
  const linked = linkElementToSchedule(
    { category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, sourcePages: [2], evidence: [ev('K1')], textDims: { lengthMm: 3000, widthMm: null, heightMm: null, thicknessMm: null } },
    [row('K1', 150, 300, 5)],
  );
  check('link: text length survives alongside schedule width/height', linked.lengthMm === 3000 && linked.widthMm === 150);
}
{
  const linked = linkElementToSchedule(
    { category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, sourcePages: [2], evidence: [ev('K1')], textDims: { lengthMm: null, widthMm: 200, heightMm: null, thicknessMm: null } },
    [row('K1', 150, 300, 5)],
  );
  check('link: disagreement → schedule value wins (150)', linked.widthMm === 150);
  check('link: disagreement is noted', (linked.notes ?? '').includes('150') && (linked.notes ?? '').includes('200'));
  check('link: disagreement caps confidence at 0.8', linked.confidence === 0.8 && linked.status === 'NEEDS_REVIEW');
}
{
  const linked = linkElementToSchedule(
    { category: 'WALL', elementType: 'wall', mark: null, quantity: 1, sourcePages: [1], evidence: [ev('Dinding luar')], textDims: { lengthMm: 7000, widthMm: null, heightMm: 3500, thicknessMm: null } },
    [],
  );
  check('link: dimensioned-unlinked → 0.8 NEEDS_REVIEW', linked.confidence === 0.8 && linked.status === 'NEEDS_REVIEW');
  check('link: unlinked schedulePage is null', linked.schedulePage === null);
}
{
  const linked = linkElementToSchedule(
    { category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, sourcePages: [2], evidence: [ev('K1')] },
    [],
  );
  check('link: undimensioned-unlinked → 0 UNRESOLVED', linked.confidence === 0 && linked.status === 'UNRESOLVED');
}
{
  const linked = linkElementToSchedule(
    { category: 'STRUCTURAL', elementType: 'rebar', mark: 'D12', quantity: 1, sourcePages: [2], evidence: [ev('D12')], diameterMm: 12 },
    [],
  );
  check('link: rebar with only a diameter counts as dimensioned', linked.confidence === 0.8 && linked.status === 'NEEDS_REVIEW');
  check('link: rebar diameter is carried', linked.diameterMm === 12);
}
{
  const linked = linkElementToSchedule(
    { category: 'STRUCTURAL', elementType: 'foundation', mark: 'F1', quantity: 1, sourcePages: [1], evidence: [ev('F1')], textDims: { lengthMm: 1000, widthMm: null, heightMm: null, thicknessMm: null } },
    [row('F1', 1000, 1000, 3, 400)],
  );
  check('link: E15 thickness survives from the schedule row', linked.thicknessMm === 400);
}

// ---------------------------------------------------------------------------
// quantitiesForElement — COUNT always; VOLUME/AREA only when evidenced
// ---------------------------------------------------------------------------

function linkedElement(overrides: Partial<ElementRecord>): ElementRecord {
  return {
    id: 'el-STRUCTURAL-p1-K1',
    category: 'STRUCTURAL',
    elementType: 'column',
    mark: 'K1',
    quantity: 1,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    thicknessMm: null,
    diameterMm: null,
    schedulePage: null,
    sourcePages: [1],
    evidence: [ev('K1')],
    confidence: 0.9,
    status: 'HIGH_CONFIDENCE',
    ...overrides,
  };
}

{
  const qs = quantitiesForElement(
    linkedElement({ elementType: 'foundation', mark: 'F1', lengthMm: 1000, widthMm: 1000, heightMm: 400 }),
    [],
    1,
  );
  const vol = qs.find((q) => q.kind === 'VOLUME');
  const count = qs.find((q) => q.kind === 'COUNT');
  check('qto: F1 1000×1000×400 → VOLUME 0.4 m³', vol?.quantity === 0.4 && vol?.unit === 'm3');
  check('qto: F1 COUNT is 1', count?.quantity === 1);
  check('qto: quantity ids carry the qto-el- prefix', qs.every((q) => q.id.startsWith('qto-el-')));
  check('qto: quantity inputs tag the element', vol?.inputs.elemen === 'F1' && vol?.inputs.tipe_elemen === 'foundation');
}
{
  const qs = quantitiesForElement(linkedElement({ widthMm: 150, heightMm: 300 }), [], 1);
  const area = qs.find((q) => q.kind === 'AREA');
  check('qto: K1 cross-section AREA 0.045 m² (no volume without length)', area?.quantity === 0.045);
  check('qto: K1 has no VOLUME', qs.every((q) => q.kind !== 'VOLUME'));
}
{
  const wall = linkedElement({ category: 'WALL', elementType: 'wall', mark: null, lengthMm: 7000, heightMm: 3500 });
  const qs = quantitiesForElement(wall, [opening('D1', 900, 2100, 1)], 1);
  const area = qs.find((q) => q.kind === 'AREA');
  check('qto: wall net area 22.61 m² after the D1 deduction', area?.quantity === 22.61);
  check('qto: wall net area formula shows the deduction', (area?.formula ?? '').includes('0.900 × 2.100'));
}
{
  const wall = linkedElement({ category: 'WALL', elementType: 'wall', mark: null, lengthMm: 7000, heightMm: 3500 });
  const qs = quantitiesForElement(wall, [opening('D2', null, null, 1)], 1);
  const area = qs.find((q) => q.kind === 'AREA');
  check('qto: undimensioned opening is NOT deducted (gross 24.5)', area?.quantity === 24.5);
  check('qto: undimensioned opening is named in the assumptions', (area?.assumptions ?? []).some((a) => a.includes('D2')));
  check('qto: net area is flagged as an upper bound', (area?.assumptions ?? []).some((a) => a.includes('batas atas')));
}
{
  const qs = quantitiesForElement(
    linkedElement({ category: 'ROOF', elementType: 'roof-plane', mark: null, lengthMm: 6000, widthMm: 8000 }),
    [],
    1,
  );
  const area = qs.find((q) => q.kind === 'AREA');
  check('qto: roof plan AREA 48 m²', area?.quantity === 48);
  check('qto: roof area carries the no-slope-correction assumption', (area?.assumptions ?? []).some((a) => a.includes('kemiringan')));
}
{
  const qs = quantitiesForElement(
    linkedElement({ category: 'SDA', elementType: 'dam-body', mark: null }),
    [],
    1,
  );
  check('qto: SDA element gets COUNT only (no area/volume)', qs.length === 1 && qs[0].kind === 'COUNT');
}
{
  const qs = quantitiesForElement(
    linkedElement({ category: 'CIVIL', elementType: 'road', mark: null }),
    [],
    1,
  );
  check('qto: CIVIL element gets COUNT only', qs.length === 1 && qs[0].kind === 'COUNT');
}
{
  const qs = quantitiesForElement(
    linkedElement({ elementType: 'rebar', mark: 'D12', diameterMm: 12 }),
    [],
    1,
  );
  check('qto: rebar gets COUNT only (no kg derivation)', qs.length === 1 && qs[0].kind === 'COUNT');
}
{
  const qs = quantitiesForElement(linkedElement({}), [], 1);
  check('qto: undimensioned element gets COUNT only, never a 0 quantity', qs.length === 1 && qs[0].kind === 'COUNT' && qs[0].quantity === 1);
}

check('labels: ELEMENT_TYPE_LABELS covers kolom/balok', ELEMENT_TYPE_LABELS.column === 'kolom' && ELEMENT_TYPE_LABELS.beam === 'balok');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL: ${f}`);
}
console.log(`PASS ${passed}/${total}`);
if (passed !== total) process.exit(1);
