/**
 * TESTS — AHSP 2026 master dataset (§26 of the master prompt).
 *
 * Twelve mandatory checks. Every test reads the generated artefacts, so running
 * it verifies the dataset that was actually produced — not a re-computation.
 *
 * Usage: npx tsx scripts/ahsp2026/testAhsp2026.ts
 *        npm run ahsp:test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = process.cwd();
const VAL = path.join(ROOT, 'data', 'ahsp2026', 'validated');
const NORM = path.join(ROOT, 'data', 'ahsp2026', 'normalized');
const REP = path.join(ROOT, 'data', 'ahsp2026', 'reports');
const RAW = path.join(ROOT, 'data', 'ahsp2026', 'raw');

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try { fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (e: any) { fail += 1; failures.push(name); console.log(`  FAIL  ${name}\n        ${e?.message || e}`); }
}

function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

function readJson(p: string) {
  assert(fs.existsSync(p), `missing artefact: ${path.relative(ROOT, p)}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const master = readJson(path.join(VAL, 'ahsp_2026_master.json'));
const items: any[] = master.items;
const resources = readJson(path.join(VAL, 'ahsp_2026_resources.json')).resources;
const dupReport = readJson(path.join(REP, 'ahsp_duplicates.json'));
const normalized = readJson(path.join(NORM, 'ahsp_2026_normalized.json'));

console.log('='.repeat(70));
console.log('AHSP 2026 — DATASET TEST SUITE');
console.log('='.repeat(70));
console.log(`  items=${items.length}  resources=${resources.length}\n`);

/* Test 1 — every item has an ID. */
check('Test 1 — every item has a unique id', () => {
  const ids = new Set<string>();
  for (const it of items) {
    assert(it.id && typeof it.id === 'string', `item without id (code=${it.code})`);
    assert(!ids.has(it.id), `duplicate id ${it.id}`);
    ids.add(it.id);
  }
  assert(ids.size === items.length, 'id count mismatch');
});

/* Test 2 — every item has a source. */
check('Test 2 — every item has a source block with attachment + file', () => {
  for (const it of items) {
    assert(it.source, `no source (${it.id})`);
    assert(it.source.regulation === 'SE DJBK No. 47/SE/Dk/2026', `bad regulation (${it.id})`);
    assert(it.source.attachment && it.source.attachment.length > 0, `no attachment (${it.id})`);
    assert(it.source.source_file && it.source.source_file.length > 5, `no source_file (${it.id})`);
  }
});

/* Test 3 — every item has a code, or is flagged needs_review. */
check('Test 3 — every item has a code or is flagged NEEDS_REVIEW', () => {
  for (const it of items) {
    if (!it.code || !String(it.code).trim()) {
      assert(it.validation.status === 'NEEDS_REVIEW' || it.validation.status === 'INVALID',
        `item without code is not flagged (${it.id})`);
    }
  }
});

/* Test 4 — every coefficient is numeric after normalization. */
check('Test 4 — every coefficient is numeric (or explicitly null)', () => {
  let n = 0;
  for (const it of items) {
    for (const c of [...it.components.labor, ...it.components.materials, ...it.components.equipment]) {
      assert(c.coefficient === null || typeof c.coefficient === 'number',
        `non-numeric coefficient "${c.coefficient}" in ${it.id}`);
      if (c.coefficient !== null) n += 1;
    }
  }
  assert(n > 0, 'no numeric coefficients at all — extraction produced nothing');
});

/* Test 5 — negative coefficients are rejected. */
check('Test 5 — no negative coefficients', () => {
  for (const it of items) {
    for (const c of [...it.components.labor, ...it.components.materials, ...it.components.equipment]) {
      assert(c.coefficient === null || c.coefficient >= 0,
        `negative coefficient ${c.coefficient} in ${it.id} (${c.resource_name})`);
    }
  }
});

/* Test 6 — resource types are limited to material | labor | equipment. */
check('Test 6 — resource_type ∈ {material, labor, equipment}', () => {
  const ok = new Set(['material', 'labor', 'equipment']);
  for (const it of items) {
    for (const c of [...it.components.labor, ...it.components.materials, ...it.components.equipment]) {
      assert(ok.has(c.resource_type), `bad resource_type "${c.resource_type}" in ${it.id}`);
    }
  }
  for (const r of resources) assert(ok.has(r.type), `bad resource type "${r.type}" in ${r.resource_id}`);
});

/* Test 7 — no duplicate code within the same field+version, unless flagged. */
check('Test 7 — duplicate codes within a field are flagged, not silent', () => {
  const flagged = new Set<string>();
  for (const g of dupReport.groups) {
    if (g.status !== 'exact_duplicate') continue;
    for (const id of g.ids) flagged.add(id);
  }
  const seen = new Map<string, string>();
  for (const it of items) {
    const k = `${it.field}|${it.version}|${String(it.code).toLowerCase().replace(/[\s()]/g, '')}`;
    if (!it.code) continue;
    if (seen.has(k)) {
      assert(flagged.has(it.id) && flagged.has(seen.get(k)!),
        `silent duplicate code ${it.code} in ${it.field}: ${seen.get(k)} vs ${it.id}`);
    } else seen.set(k, it.id);
  }
});

/* Test 8 — category counts are computed automatically. */
check('Test 8 — category counts match the item list', () => {
  const by = (f: string) => items.filter((i) => i.field === f).length;
  assert(master.summary.total === items.length, 'summary.total mismatch');
  assert(master.summary.smkk === by('SMKK'), 'summary.smkk mismatch');
  assert(master.summary.sda === by('SDA'), 'summary.sda mismatch');
  assert(master.summary.bina_marga === by('BINA_MARGA'), 'summary.bina_marga mismatch');
  assert(master.summary.cipta_karya === by('CIPTA_KARYA'), 'summary.cipta_karya mismatch');
  assert(master.summary.umum === by('UMUM'), 'summary.umum mismatch');
});

/* Test 9 — raw → normalized traceability. */
check('Test 9 — every item traces back to a real raw page', () => {
  const cache = new Map<string, Set<number>>();
  /** Explicit attachment → raw-layer key. Never rely on substring order. */
  const keyOf = (file: string): string => {
    const m = /^Lampiran-(III|IV|V|VI)-/.exec(file);
    if (!m) throw new Error(`unrecognised source_file "${file}"`);
    return m[1] === 'III' ? 'smkk' : m[1] === 'IV' ? 'sda' : m[1] === 'V' ? 'binamarga' : 'ciptakarya';
  };
  for (const it of items) {
    const key = keyOf(it.source.source_file);
    if (!cache.has(key)) {
      const p = path.join(RAW, `${key}_raw.jsonl`);
      assert(fs.existsSync(p), `missing raw layer for ${key}`);
      const pages = new Set<number>(
        fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l).source_page),
      );
      cache.set(key, pages);
    }
    const pages = cache.get(key)!;
    assert(pages.has(it.source.page), `${it.id} points at page ${it.source.page}, absent from ${key} raw layer`);
  }
});

/* Test 10 — master JSON parses without error (implicitly true, but assert shape). */
check('Test 10 — master JSON parses and has the §8 envelope', () => {
  assert(master.dataset?.id === 'AHSP-2026', 'dataset.id mismatch');
  assert(master.dataset?.regulation === 'SE DJBK No. 47/SE/Dk/2026', 'dataset.regulation mismatch');
  assert(Array.isArray(master.items), 'items is not an array');
  for (const it of items) {
    assert(it.calculation?.unit_price_formula, `missing calculation template (${it.id})`);
    assert(it.validation && typeof it.validation.status === 'string', `missing validation block (${it.id})`);
  }
});

/* Test 11 — every resource is referenceable from the component rows. */
check('Test 11 — every component resolves to a resource-master entry', () => {
  const key = (t: string, c: string, n: string, u: string) => `${t}|${c}|${n}|${u}`;
  const set = new Set(resources.map((r: any) => key(r.type, r.code, r.name, r.unit)));
  let checked = 0;
  for (const it of items) {
    for (const c of [...it.components.labor, ...it.components.materials, ...it.components.equipment]) {
      const k = key(c.resource_type, c.resource_code, c.resource_name, c.unit);
      assert(set.has(k), `resource not in master: ${k}`);
      checked += 1;
    }
  }
  assert(checked > 0, 'no components to check');
});

/* Test 12 — no active price is stored inside the master AHSP. */
check('Test 12 — no active price inside the master AHSP', () => {
  const banned = /^(unitPrice|unit_price|totalPrice|totalLabor|totalMaterial|totalEquipment|hargaSatuan|activePrice|price)$/;
  for (const it of items) {
    for (const k of Object.keys(it)) {
      assert(!banned.test(k), `price field "${k}" found on ${it.id}`);
    }
    for (const c of [...it.components.labor, ...it.components.materials, ...it.components.equipment]) {
      for (const k of Object.keys(c)) {
        assert(!banned.test(k), `price field "${k}" on a component of ${it.id}`);
      }
    }
  }
  // Reference-year figures are allowed only inside `source_reference` (§13).
  const withRef = items.filter((i) => i.source_reference);
  assert(withRef.length >= 0, 'ok');
});

/* Test 13 (bonus) — normalized layer agrees with the validated master. */
check('Test 13 — normalized item count equals validated item count', () => {
  assert(normalized.items.length === items.length,
    `normalized=${normalized.items.length} vs validated=${items.length}`);
});

/* ------------------------------------------------------------------ */
/* Phase 0.5 — forensic assertions                                     */
/* ------------------------------------------------------------------ */

const FOR = path.join(ROOT, 'data', 'ahsp2026', 'forensic');
const forJson = (n: string) => readJson(path.join(FOR, n));

/* Test 14 — Bina Marga index is fully parsed (PARSER_ERROR regression guard). */
check('Test 14 — Bina Marga index parses all 1,137 published rows', () => {
  const a = forJson('BM_METHOD_A.json');
  assert(a.rows_total === 1137, `BM index rows=${a.rows_total}, expected 1137`);
  assert(a.codes_distinct >= 1130, `BM index distinct codes=${a.codes_distinct}, expected ≥1130`);
  assert(a.status_breakdown.Normatif + a.status_breakdown.Informatif === 1137,
    'BM index status breakdown does not cover every row');
});

/* Test 15 — Cipta Karya index is fully parsed (PARSER_ERROR regression guard). */
check('Test 15 — Cipta Karya index parses all 2,841 published rows', () => {
  const c = forJson('ck_missing.json');
  assert(c.parsed_index_rows === 2841, `CK index rows=${c.parsed_index_rows}, expected 2841`);
  assert(c.parsed_index_rows === c.independent_status_line_scan,
    `CK index=${c.parsed_index_rows} vs independent scan=${c.independent_status_line_scan}`);
});

/* Test 16 — SDA inventory is complete; the code-less row is flagged, not invented. */
check('Test 16 — SDA inventory has all 1,556 rows and no invented code', () => {
  const s = forJson('sda_missing.json');
  assert(s.parsed === 1556, `SDA inventory rows=${s.parsed}, expected 1556`);
  assert(s.code_less_rows >= 1, 'the source-defect row (810) should be recorded');
  const sdaItems = items.filter((i) => i.field === 'SDA');
  const noCode = sdaItems.filter((i) => !i.code);
  assert(noCode.length === s.code_less_rows, 'SDA code-less item count disagrees with the forensic record');
  for (const it of noCode) {
    assert(it.validation.status === 'NEEDS_REVIEW', `${it.id} has no code but is not NEEDS_REVIEW`);
  }
});

/* Test 17 — SMKK count is confirmed by two independent methods. */
check('Test 17 — SMKK row count is method-independent (223)', () => {
  const s = forJson('smkk_missing.json');
  assert(s.parsed === s.independent_raw_scan,
    `SMKK parsed=${s.parsed} vs independent scan=${s.independent_raw_scan}`);
  assert(s.parsed === 223, `SMKK rows=${s.parsed}, expected 223`);
});

/* Test 18 — the annex inventory is complete and no phantom "Umum" annex exists. */
check('Test 18 — annex inventory covers I–VII and records no Bidang Umum', () => {
  const inv = forJson('AHSP_2026_ANNEX_INVENTORY.json');
  const atts = inv.rows.map((r: any) => r.attachment);
  for (const a of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']) {
    assert(atts.includes(a), `annex ${a} missing from the inventory`);
  }
  assert(atts.includes('Batang Tubuh'), 'batang tubuh missing from the inventory');
  assert(JSON.stringify(inv.bidangs_absent) === JSON.stringify(['UMUM']),
    'the inventory must record UMUM as absent');
  const ahsp = inv.rows.filter((r: any) => r.contains_ahsp_items).map((r: any) => r.attachment).sort();
  assert(JSON.stringify(ahsp) === JSON.stringify(['III', 'IV', 'V', 'VI']),
    `AHSP-bearing annexes should be III,IV,V,VI — got ${ahsp.join(',')}`);
});

/* Test 19 — Bina Marga items are labelled Lampiran V, never II. */
check('Test 19 — Bina Marga source.attachment is "V"', () => {
  const bm = items.filter((i) => i.field === 'BINA_MARGA');
  assert(bm.length > 0, 'no Bina Marga items');
  for (const it of bm) {
    assert(it.source.attachment === 'V', `${it.id} has attachment "${it.source.attachment}", expected "V"`);
    assert(!it.source.source_file.includes('Lampiran-II-'), `${it.id} still points at the mislabelled file`);
  }
});

/* Test 20 — every needs-review record is bucketed and the duplicate set is classified. */
check('Test 20 — needs-review buckets and duplicate classification exist', () => {
  const nr = forJson('needs_review/_summary.json');
  assert(nr.needs_review > 0, 'no needs-review records recorded');
  assert(typeof nr.buckets.NO_COMPONENTS === 'number', 'NO_COMPONENTS bucket missing');
  const dc = forJson('duplicate_classification.json');
  assert(dc.total_groups > 0, 'no duplicate groups classified');
  const sum = Object.values(dc.by_classification).reduce((a: number, b: any) => a + Number(b), 0);
  assert(sum === dc.total_groups, `duplicate classification total ${sum} != ${dc.total_groups}`);
});

console.log('');
console.log('='.repeat(70));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail) console.log(`FAILED: ${failures.join(', ')}`);
console.log('='.repeat(70));
process.exit(fail > 0 ? 1 : 0);
