/**
 * D-63 (P2) + G-ER-1 — Weir AHSP count inconsistency (banner 6 vs pipeline
 * 5): the scope path resolved 6/12 weir codes, ALL to wrong items
 * (concrete as excavation, etc.). The registry is remapped to the correct
 * BM 2026 master letter codes; scopes with no BM equivalent are honestly
 * unmapped (primaryCode omitted + unmappedReason), never guessed.
 * Run: npx tsx src/test/d63WeirRemap.test.ts
 *
 * Remap record lives in src/engine/cost/scope/scopeAhspRegistry.ts.
 * Open engineering questions (OD-14) are recorded in
 * 04-REPAIR-EXECUTION-LOG.md (Batch B) — K→fc' rule confirmation, rebar
 * proteksi variant, excavation depth band, masonry mix-ratio loss, and
 * sourcing/exclusion of the 7 unmapped scopes.
 */
import { BINA_MARGA_AHSP_2026_OFFICIAL } from '../data/nationalCostDatabase/binaMarga2026Adapter';
import {
  SCOPE_AHSP_REGISTRY,
  findScopeMapping,
  isScopeMapped,
} from '../engine/cost/scope/scopeAhspRegistry';
import { computeScopeBasedCost } from '../hooks/useScopeBasedCost';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const byCode = (code: string) => BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === code);

test('every registry entry is either correctly mapped or honestly unmapped', () => {
  ok(SCOPE_AHSP_REGISTRY.length > 0, 'registry must not be empty');
  for (const m of SCOPE_AHSP_REGISTRY) {
    if (m.primaryCode) {
      const item = byCode(m.primaryCode);
      ok(!!item, `${m.scopeId}: primaryCode ${m.primaryCode} must resolve in the BM 2026 master`);
      ok(item!.readability !== 'UNREADABLE', `${m.scopeId}: ${m.primaryCode} must be readable`);
      ok(typeof item!.unitPrice === 'number' && item!.unitPrice > 0, `${m.scopeId}: ${m.primaryCode} must carry a master price`);
      for (const fb of m.fallbackCodes) {
        ok(!!byCode(fb), `${m.scopeId}: fallback ${fb} must resolve in the BM 2026 master`);
      }
      ok(!m.unmappedReason, `${m.scopeId}: a mapped scope must not carry an unmappedReason`);
    } else {
      ok(typeof m.unmappedReason === 'string' && m.unmappedReason.trim().length > 0,
        `${m.scopeId}: an unmapped scope must carry a non-empty unmappedReason`);
    }
  }
  const mapped = SCOPE_AHSP_REGISTRY.filter(isScopeMapped).length;
  const unmapped = SCOPE_AHSP_REGISTRY.length - mapped;
  console.log(`  (registry: ${SCOPE_AHSP_REGISTRY.length} scopes, ${mapped} mapped, ${unmapped} honestly unmapped)`);
});

test('concrete scopes map to Beton items (never to excavation) — the G1 canary', () => {
  const cases: [string, string, string][] = [
    ['concrete-k-175', 'G.31', "fc'20"],
    ['concrete-k-225', 'G.28', "fc'25"],
    ['concrete-k-250', 'G.28', "fc'25"],
    ['concrete-k-300', 'G.24', "fc'30"],
    ['concrete-k-350', 'G.17', "fc'35"],
  ];
  for (const [scopeId, code, grade] of cases) {
    const m = findScopeMapping(scopeId)!;
    eq(m.primaryCode, code, `${scopeId} primaryCode`);
    const item = byCode(code)!;
    ok(item.name.includes('Beton'), `${scopeId} -> ${code} must be a Beton item, got "${item.name}"`);
    ok(item.name.includes(grade.replace("fc'", '')), `${scopeId} -> ${code} must be grade ${grade}, got "${item.name}"`);
    ok(!item.name.toLowerCase().includes('galian'), `${scopeId} must never map to an excavation item`);
  }
});

test('rebar maps to Baja Tulangan BjTS 420; excavation maps to Galian Struktur', () => {
  const rebar = findScopeMapping('reinforcement-steel')!;
  eq(rebar.primaryCode, 'G.78', 'rebar primaryCode');
  const rebarItem = byCode('G.78')!;
  ok(rebarItem.name.includes('Baja Tulangan'), `G.78 must be Baja Tulangan, got "${rebarItem.name}"`);
  ok(rebarItem.name.includes('420'), `G.78 must be BjTS 420, got "${rebarItem.name}"`);

  const exc = findScopeMapping('excavation-foundation')!;
  eq(exc.primaryCode, 'C.4', 'excavation primaryCode');
  const excItem = byCode('C.4')!;
  ok(excItem.name.includes('Galian'), `C.4 must be a Galian item, got "${excItem.name}"`);
});

test('the old wrong targets are gone (C.7, B.9, B.2-as-concrete, B.79)', () => {
  const primaries = SCOPE_AHSP_REGISTRY.filter((m) => m.primaryCode).map((m) => m.primaryCode);
  ok(!primaries.includes('C.7'), 'C.7 (Tambahan biaya galian — the G1 canary wrong target) must not be any primaryCode');
  ok(!primaries.includes('B.9'), 'B.9 (Gorong-gorong) must not be any primaryCode');
  ok(!primaries.includes('B.79'), 'B.79 (Bahan Drainase Porous) must not be any primaryCode');
  // B.2 (Pasangan Batu) may only back masonry scopes, never concrete.
  for (const m of SCOPE_AHSP_REGISTRY) {
    if (m.scopeId.startsWith('concrete-')) {
      ok(m.primaryCode !== 'B.2' && !m.primaryCode?.startsWith('C.'), `${m.scopeId} must not map to masonry/excavation`);
    }
  }
});

test('the 7 unmapped scopes are the documented ones', () => {
  const unmapped = SCOPE_AHSP_REGISTRY.filter((m) => !isScopeMapped(m)).map((m) => m.scopeId).sort();
  eq(JSON.stringify(unmapped), JSON.stringify([
    'dewatering-wellpoint',
    'disposal-soil',
    'formwork-plain',
    'gate-sliding',
    'grouting-cement',
    'safety-smkk',
    'temporary-cofferdam',
  ]), 'unmapped scope set');
});

// --- end-to-end: default weir geometry --------------------------------------

const weirResult = () => computeScopeBasedCost(
  'weir.body',
  { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
  { projectId: 'test-project', location: 'Probolinggo, Jawa Timur', effectiveDate: '2026-01-01', periodVersion: '2026' },
  'test-project'
);

test('default weir geometry: RESOLVED, 7 line items of 12 scope items, 5 honestly unmapped', () => {
  const r = weirResult();
  eq(r.status, 'RESOLVED', 'status (was PARTIAL with 38 missing prices)');
  eq(r.totalScopeItems, 12, 'total scope items');
  eq(r.lineItems.length, 7, 'priced line items');
  eq(r.missingPrices.length, 0, 'missing prices (was 38)');
  eq(JSON.stringify([...r.unmappedWorkItems].sort()), JSON.stringify([
    'Bekisting Tubuh Bendung',
    'Biaya SMKK',
    'Cofferdam Sementara',
    'Dewatering Wellpoint',
    'Pembuangan Tanah Galian',
  ]), 'unmapped work items');
});

test('weir line items resolve to the right work (Beton for concrete, Baja Tulangan for rebar)', () => {
  const r = weirResult();
  const byName = new Map(r.lineItems.map((li) => [li.name, li]));
  const body = byName.get('Beton K-300 Tubuh Bendung')!;
  ok(!!body, 'Beton K-300 Tubuh Bendung line item must exist');
  eq(body.ahspCode, 'G.24', 'body concrete code');
  ok(body.ahspName.includes('Beton'), `body concrete must resolve to Beton, got "${body.ahspName}"`);
  const rebar = byName.get('Pembesian Tubuh Bendung')!;
  eq(rebar.ahspCode, 'G.78', 'rebar code');
  ok(rebar.ahspName.includes('Baja Tulangan'), `rebar must resolve to Baja Tulangan, got "${rebar.ahspName}"`);
  const exc = byName.get('Galian Pondasi Bendung')!;
  eq(exc.ahspCode, 'C.4', 'excavation code');
  ok(exc.ahspName.includes('Galian'), `excavation must resolve to Galian, got "${exc.ahspName}"`);
});

test('weir grand total anchor (default geometry, Probolinggo resolution)', () => {
  const r = weirResult();
  eq(r.summary.directCost, 1024484101, 'direct cost');
  eq(r.summary.grandTotal, 1250895087, 'grand total — remap anchor; movement means the mapping or BM prices changed');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-63: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
