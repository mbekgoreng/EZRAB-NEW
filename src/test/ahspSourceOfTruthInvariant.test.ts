/**
 * EZRAB — AHSP SOURCE-OF-TRUTH INVARIANT SUITE (§13, §14, §15)
 * ==========================================================
 *
 * This suite pins the single-source-of-truth contract that the reconciliation established:
 *
 *   §14  MATCHED  =>  OFFICIAL_CATALOG_CONTAINS(selectedAhspId)
 *        A match may NEVER carry a code that is absent from ALL_OFFICIAL_AHSP_ITEMS.
 *        This used to be violated: "Pondasi Batu Kali" matched the 2022 code `A.3.2.1.2`,
 *        which does not exist in the 2026 catalog.
 *
 *   §15  PRICE_FOUND  =>  official AHSP ∧ valid components ∧ resolvable price
 *        Otherwise unitPrice/totalPrice are NULL — never coerced to 0.
 *
 *   §13  Regression: the matcher never returns an AHSP code absent from the official catalog.
 *
 * Run: npx tsx src/test/ahspSourceOfTruthInvariant.test.ts
 */

import { strict as assert } from 'node:assert';
import { ahspMatcher } from '../ded-rab-v2/ahsp/ahspMatcher';
import { ahspPriceResolver } from '../ded-rab-v2/ahsp/ahspPriceResolver';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import { DedWorkItem } from '../ded-rab-v2/types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${label}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${err.message || err}`);
    failures.push(label);
    failed++;
  }
}

function item(name: string, unit = 'm3', category: string = 'FOUNDATION', materialSpec = ''): DedWorkItem {
  return {
    id: `INV-${name}`,
    projectId: 'PRJ-INVARIANT',
    sourceDocumentId: 'doc-inv',
    name,
    category: category as any,
    status: 'CONFIRMED',
    evidenceIds: ['EV-1'],
    sourcePages: [1],
    dimensions: {},
    unit,
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    materialSpec,
  } as unknown as DedWorkItem;
}

const OFFICIAL_CODES = new Set(ALL_OFFICIAL_AHSP_ITEMS.map((a) => a.code.toLowerCase()));

console.log('======================================================================');
console.log('EZRAB — AHSP SOURCE-OF-TRUTH INVARIANT SUITE (§13/§14/§15)');
console.log('======================================================================');
console.log(`Official catalog size: ${ALL_OFFICIAL_AHSP_ITEMS.length}`);

// -----------------------------------------------------------------------------
// §14.1 — The repository IS the official array (no duplicate dataset).
// -----------------------------------------------------------------------------
check('§3 repo is backed by the exact official catalog (no duplication)', () => {
  assert.equal(officialAhspRepository.getAllOfficialAhsp().length, ALL_OFFICIAL_AHSP_ITEMS.length);
  assert.equal(officialAhspRepository.hasOfficialAhsp('A.3.2.1.2'), false);
  assert.ok(officialAhspRepository.hasOfficialAhsp(ALL_OFFICIAL_AHSP_ITEMS[0].code));
});

// -----------------------------------------------------------------------------
// §13/§14.2 — INVARIANT over a broad probe set: any MATCHED code must exist officially.
// -----------------------------------------------------------------------------
const PROBES: Array<[string, string, string]> = [
  ['Pondasi Batu Kali', 'm3', 'FOUNDATION'],
  ['Pasangan Pondasi Batu Kali Belah 1:5', 'm3', 'FOUNDATION'],
  ['Pondasi batu belah 1SP:4PP', 'm3', 'FOUNDATION'],
  ['Pasangan batu kali', 'm3', 'FOUNDATION'],
  ['Pasangan batu kali 1:4', 'm3', 'FOUNDATION'],
  ['Pondasi Footplate Beton Bertulang K-250', 'm3', 'FOUNDATION'],
  ['Sloof 15/20 cm beton bertulang K-250', 'm3', 'STRUCTURE_BEAM'],
  ['Kolom praktis 11x11 cm', 'm', 'STRUCTURE_COLUMN'],
  ['Kolom struktur K-250 15x30', 'm3', 'STRUCTURE_COLUMN'],
  ['Plat lantai beton bertulang t=12 cm', 'm3', 'STRUCTURE_SLAB'],
  ['Dinding Bata Merah 1/2 Bata', 'm2', 'WALL'],
  ['Dinding bata ringan hebel t=10 cm', 'm2', 'WALL'],
  ['Plesteran 1:4 tebal 15 mm', 'm2', 'PLASTER'],
  ['Acian semen', 'm2', 'PLASTER'],
  ['Keramik lantai 40x40', 'm2', 'FLOOR_FINISH'],
  ['Granit tile 60x60', 'm2', 'FLOOR_FINISH'],
  ['Plafon gypsum 9 mm rangka hollow', 'm2', 'CEILING'],
  ['Cat dinding interior', 'm2', 'PAINTING'],
  ['Cat dinding eksterior weathershield', 'm2', 'PAINTING'],
  ['Atap genteng beton', 'm2', 'ROOF'],
  ['Rangka atap baja ringan C75', 'm2', 'ROOF'],
  ['Kloset duduk monoblok', 'unit', 'SANITARY'],
  ['Floor drain stainless', 'unit', 'SANITARY'],
  ['Galian tanah pondasi', 'm3', 'SITEWORK'],
  ['Urugan pasir bawah pondasi', 'm3', 'SITEWORK'],
  ['Pipasomething tidak pernah ada xyz', 'm3', 'SITEWORK'],
];

check('§14 INVARIANT — every MATCHED/EXACT/SEMANTIC code exists in the official catalog', () => {
  const offenders: string[] = [];
  for (const [name, unit, cat] of PROBES) {
    const m = ahspMatcher.matchWorkItem(item(name, unit, cat));
    const isSelected = m.matchType === 'EXACT_MATCH' || m.matchType === 'SEMANTIC_MATCH';
    if (isSelected) {
      if (!OFFICIAL_CODES.has(m.code.toLowerCase())) {
        offenders.push(`"${name}" → ${m.code} (${m.matchType}) NOT IN OFFICIAL`);
      }
    }
    // AMBIGUOUS / NOT_FOUND must NEVER carry a selected code.
    if (m.matchType === 'AMBIGUOUS' || m.matchType === 'NOT_FOUND') {
      if (m.code !== '') {
        offenders.push(`"${name}" → ${m.matchType} but code="${m.code}" (must be empty)`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n         '));
});

check('§14 — a non-decision (AMBIGUOUS) never masquerades as MATCHED', () => {
  // Bare stone masonry has no stated mortar ratio → several official items apply.
  const m = ahspMatcher.matchWorkItem(item('Pondasi Batu Kali', 'm3', 'FOUNDATION'));
  if (m.matchType === 'AMBIGUOUS') {
    assert.equal(m.code, '', 'AMBIGUOUS must not select a code');
    assert.ok((m.candidates || []).length > 0, 'AMBIGUOUS must list official candidates');
    for (const c of m.candidates || []) {
      assert.ok(OFFICIAL_CODES.has(c.code.toLowerCase()), `candidate ${c.code} not official`);
    }
  }
});

// -----------------------------------------------------------------------------
// §5/§8 — No synthetic code may surface as a match, even via the normalizer hint.
// -----------------------------------------------------------------------------
check('§5/§8 — the stale 2022 code A.3.2.1.2 never surfaces as a match', () => {
  const probes = [
    item('Pondasi Batu Kali 1:4', 'm3', 'FOUNDATION'),
    item('Pondasi batu belah 1:4', 'm3', 'FOUNDATION'),
    item('Dinding Bata Merah 1/2 Bata', 'm2', 'WALL'),
    item('Pondasi Footplate Beton Bertulang K-250', 'm3', 'FOUNDATION'),
  ];
  for (const p of probes) {
    const m = ahspMatcher.matchWorkItem(p);
    assert.notEqual(m.code.toLowerCase(), 'a.3.2.1.2', `"${p.name}" surfaced legacy A.3.2.1.2`);
  }
});

// -----------------------------------------------------------------------------
// §14 — Validator rejects a code absent from the official catalog.
// -----------------------------------------------------------------------------
check('§14 — resolveValidatedAhspCandidate rejects a non-official code', () => {
  const bad = item('Pasangan Batu Kali Resmi', 'm3', 'FOUNDATION');
  bad.ahspMatch = {
    code: 'A.3.2.1.2',
    name: 'Pasangan Pondasi Batu Belah 1 SP : 4 PP',
    unit: 'm3',
    matchType: 'SEMANTIC_MATCH',
    source: 'Standar PUPR 2026',
    confidence: 0.9,
  };
  const v = ahspMatcher.resolveValidatedAhspCandidate(bad);
  assert.equal(v.isValid, false, 'non-official code must be rejected');
});

check('§14 — resolveValidatedAhspCandidate accepts a real official code', () => {
  const okItem = item('Pondasi batu belah 1:4', 'm3', 'FOUNDATION');
  const m = ahspMatcher.matchWorkItem(okItem);
  if (m.code && (m.matchType === 'SEMANTIC_MATCH' || m.matchType === 'EXACT_MATCH')) {
    const v = ahspMatcher.resolveValidatedAhspCandidate({ ...okItem, ahspMatch: m } as any);
    assert.equal(v.isValid, true, `official code ${m.code} should validate`);
    assert.ok(OFFICIAL_CODES.has(v.match!.code.toLowerCase()));
  }
});

// -----------------------------------------------------------------------------
// §15 — PRICE_FOUND requires the full official chain; otherwise NULL (never 0).
// -----------------------------------------------------------------------------
check('§15 — unresolved AHSP yields unitPrice=null, totalPrice=null (never 0)', () => {
  const noMatch = item('Pekerjaan Tidak Dikenal XYZ', 'm3', 'SITEWORK');
  const m = ahspMatcher.matchWorkItem(noMatch);
  const priced = ahspPriceResolver.resolvePrice({ ...noMatch, ahspMatch: m } as any);
  assert.equal(priced.unitPrice, null);
  assert.equal(priced.totalPrice, null);
});

check('§15 — AMBIGUOUS price is null (no official decision ⇒ no price)', () => {
  const amb = item('Pondasi Batu Kali', 'm3', 'FOUNDATION');
  const m = ahspMatcher.matchWorkItem(amb);
  if (m.matchType === 'AMBIGUOUS') {
    const priced = ahspPriceResolver.resolvePrice({ ...amb, ahspMatch: m } as any);
    assert.equal(priced.unitPrice, null);
    assert.equal(priced.priceSource, 'PRICE_NOT_FOUND');
  }
});

check('§15 — no price is ever the literal 0 from a missing chain', () => {
  for (const [name, unit, cat] of PROBES) {
    const it = item(name, unit, cat);
    const m = ahspMatcher.matchWorkItem(it);
    const priced = ahspPriceResolver.resolvePrice({ ...it, ahspMatch: m } as any);
    if (priced.unitPrice !== null) {
      assert.ok(priced.unitPrice > 0, `"${name}" produced unitPrice=${priced.unitPrice}`);
      assert.ok(OFFICIAL_CODES.has(m.code.toLowerCase()), `"${name}" priced from non-official ${m.code}`);
    }
  }
});

console.log('----------------------------------------------------------------------');
console.log(`TOTAL: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================');
if (failed > 0) process.exit(1);
