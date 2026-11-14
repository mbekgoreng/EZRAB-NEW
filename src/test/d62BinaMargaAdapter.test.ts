/**
 * D-62 (P2) — Weir Body displayed the literal string "undefined (labor)":
 * the BM adapter blind-cast raw master components without field mapping,
 * so `c.name`/`c.code` were undefined downstream.
 * Run: npx tsx src/test/d62BinaMargaAdapter.test.ts
 *
 * Regression: every adapted component carries a real code + name (or an
 * explicit "Komponen tanpa nama (data tidak lengkap)" fallback); the
 * composition engine never embeds a raw undefined in a warning; the
 * policy engine's regex skips a literal "undefined" match.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { BINA_MARGA_AHSP_2026_OFFICIAL } from '../data/nationalCostDatabase/binaMarga2026Adapter';
import { computeScopeBasedCost } from '../hooks/useScopeBasedCost';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const allComponents = (itemCode: string) => {
  const item = BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === itemCode);
  ok(!!item, `BM item ${itemCode} must exist in the adapter`);
  return [...(item!.laborComponents || []), ...(item!.materialComponents || []), ...(item!.equipmentComponents || [])];
};

test('adapter exports all 1.137 BM master items', () => {
  eq(BINA_MARGA_AHSP_2026_OFFICIAL.length, 1137, 'item count');
});

test('every adapted component has a non-empty code and name — never undefined', () => {
  let checked = 0;
  const bad: string[] = [];
  for (const item of BINA_MARGA_AHSP_2026_OFFICIAL) {
    const comps = [...(item.laborComponents || []), ...(item.materialComponents || []), ...(item.equipmentComponents || [])];
    for (const c of comps) {
      checked++;
      if (typeof c.code !== 'string' || c.code.trim() === '' || c.code === 'undefined') {
        bad.push(`${item.code}: code=${JSON.stringify(c.code)}`);
      }
      if (typeof c.name !== 'string' || c.name.trim() === '' || c.name === 'undefined') {
        bad.push(`${item.code}: name=${JSON.stringify(c.name)}`);
      }
    }
  }
  eq(checked, 6835, 'component count');
  eq(bad.length, 0, `components with missing/undefined code or name: ${bad.slice(0, 5).join('; ')}`);
});

test('component mapping: resourceCode -> code, description -> name, category -> componentType', () => {
  const comps = allComponents('G.24');
  ok(comps.length > 0, 'G.24 must have components');
  const labor = BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === 'G.24')!.laborComponents;
  ok(labor.length > 0, 'G.24 must have labor components');
  ok(labor.every((c) => c.componentType === 'TENAGA'), 'labor components must map to TENAGA');
  const mat = BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === 'G.24')!.materialComponents;
  ok(mat.length > 0 && mat.every((c) => c.componentType === 'BAHAN'), 'material components must map to BAHAN');
  ok(comps.every((c) => typeof c.id === 'string' && c.id.startsWith('BM-G.24-C')), 'component ids must be deterministic BM ids');
});

test('G.24 spot check: Beton struktur fc\'30, readable, priced', () => {
  const g24 = BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === 'G.24')!;
  ok(g24.name.includes('Beton'), `G.24 name must mention Beton, got ${g24.name}`);
  ok(g24.name.includes('30'), `G.24 must be fc'30, got ${g24.name}`);
  eq(g24.readability, 'OK', 'G.24 readability');
  ok(typeof g24.unitPrice === 'number' && g24.unitPrice > 0, `G.24 must carry a master price, got ${g24.unitPrice}`);
});

test('readability: only G.222–G.225 are UNREADABLE (E23 coef 0, amount Rp21,12)', () => {
  const unreadable = BINA_MARGA_AHSP_2026_OFFICIAL.filter((i) => i.readability === 'UNREADABLE').map((i) => i.code).sort();
  eq(JSON.stringify(unreadable), JSON.stringify(['G.222', 'G.223', 'G.224', 'G.225']), 'UNREADABLE set');
  // True-zero rows (coef 0, amount 0) are NOT lost — concrete targets stay usable.
  for (const code of ['G.17', 'G.24', 'G.28', 'G.31', 'G.78', 'C.4', 'C.17', 'C.23', 'G.160', 'B.1']) {
    const item = BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === code)!;
    ok(item.readability !== 'UNREADABLE', `${code} must be usable (readability ${item.readability})`);
  }
});

test('no "undefined" string anywhere in the adapted dataset JSON', () => {
  const json = JSON.stringify(BINA_MARGA_AHSP_2026_OFFICIAL);
  ok(!json.includes('"undefined"'), 'no component/item field may serialize as the string "undefined"');
});

test('e2e: weir scope computation surfaces no "undefined" in missing prices or warnings', () => {
  const r = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    { projectId: 'test-project', location: 'Probolinggo, Jawa Timur', effectiveDate: '2026-01-01', periodVersion: '2026' },
    'test-project'
  );
  ok(!r.missingPrices.some((mp) => mp.componentName === 'undefined' || String(mp.componentName || '').includes('undefined')),
    `missingPrices must not contain "undefined": ${JSON.stringify(r.missingPrices.slice(0, 3))}`);
  const warnings = (r as any).warnings as string[] | undefined;
  if (warnings) {
    ok(!warnings.some((w) => w.includes('"undefined"')), `warnings must not embed "undefined": ${warnings.filter((w) => w.includes('undefined')).join('; ')}`);
  }
});

test('guards in place: composition displayName fallback + policy regex skip', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const compSrc = fs.readFileSync(path.join(root, 'engine', 'cost', 'composition', 'costCompositionEngine.ts'), 'utf8');
  ok(compSrc.includes('Komponen tanpa nama (data tidak lengkap)'), 'composition engine must fall back to the explicit no-name label');
  const polSrc = fs.readFileSync(path.join(root, 'engine', 'cost', 'policy', 'costPolicyEngine.ts'), 'utf8');
  ok(polSrc.includes("match[2] !== 'undefined'"), 'policy engine must skip literal "undefined" matches');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-62: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
