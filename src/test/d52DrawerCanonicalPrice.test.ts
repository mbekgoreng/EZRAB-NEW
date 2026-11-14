/**
 * D-52 (P2) — Drawer fuzzy-matched market wages (SHBJ Rp130k/210k) over
 * canonical AHSP prices (Rp100k/200k) for A.1.01.a.1, then wrote 8.692 over
 * canonical 6.000.
 * Run: npx tsx src/test/d52DrawerCanonicalPrice.test.ts
 *
 * Regression: the drawer resolves official items canonical-first (same
 * identity + source as the catalog); market wages appear only as an
 * explicitly labeled fallback when the canonical component has no price.
 *
 * NOTE on the save path: the drawer's markup panel defaults overhead/profit
 * to 5%/10% when the item carries no O&P (pre-existing, user-visible,
 * disclosed in the drawer UI). So "save without edits" writes
 * direct × (1 + O&P) — 6.900 at the defaults, 6.000 at O&P 0/0. The D-52
 * invariant is the DIRECT basis: it must be canonical 6.000, never a
 * market substitution. Changing the O&P defaults is a product decision,
 * flagged for report 09 (see 04-REPAIR-EXECUTION-LOG.md, Batch B).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { getAhspDirectPrice } from '../data/priceDatabase2026/ahspDisplayPolicy';
import { getPriceDatabase } from '../data/indonesianPrices';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import {
  resolveDrawerComponentPrice,
  buildDrawerComponents,
  isMarketDrawerPrice,
} from '../engine/ahsp/drawerPriceResolution';
import type { PriceItem } from '../types';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const priceDb = getPriceDatabase();
const CANON_SRC = 'Lampiran IV SE DJBK No. 47/SE/Dk/2026';

// --- the defect's own item --------------------------------------------------

test('A.1.01.a.1 canonical record: Pekerja 0.05 x Rp100.000, Mandor 0.005 x Rp200.000', () => {
  const item = officialAhspRepository.getOfficialAhsp('A.1.01.a.1');
  ok(!!item, 'A.1.01.a.1 must exist in the canonical catalog');
  const labs = item!.laborComponents || [];
  const pekerja = labs.find((c) => (c.name || '').toLowerCase().includes('pekerja'));
  const mandor = labs.find((c) => (c.name || '').toLowerCase().includes('mandor'));
  ok(!!pekerja && !!mandor, 'both labor components must exist');
  eq(pekerja!.coefficient, 0.05, 'Pekerja coefficient');
  eq(pekerja!.unitPrice, 100000, 'Pekerja canonical price');
  eq(mandor!.coefficient, 0.005, 'Mandor coefficient');
  eq(mandor!.unitPrice, 200000, 'Mandor canonical price');
});

test('market table DOES contain higher fuzzy matches (the trap that caused D-52)', () => {
  const pekerjaMarket = priceDb.find((p) => p.name.toLowerCase().includes('pekerja'));
  const mandorMarket = priceDb.find((p) => p.name.toLowerCase().includes('mandor'));
  ok(!!pekerjaMarket && pekerjaMarket.price > 100000, `expected a market Pekerja row above Rp100.000, got ${pekerjaMarket?.price}`);
  ok(!!mandorMarket && mandorMarket.price > 200000, `expected a market Mandor row above Rp200.000, got ${mandorMarket?.price}`);
});

test('canonical price wins over a higher fuzzy market match', () => {
  const r = resolveDrawerComponentPrice(100000, 'Pekerja', priceDb, CANON_SRC);
  eq(r.unitPrice, 100000, 'canonical price must win');
  eq(r.basis, 'CANONICAL', 'basis');
  ok((r.priceSource || '').startsWith('AHSP resmi'), `priceSource must say AHSP resmi, got ${r.priceSource}`);
  const r2 = resolveDrawerComponentPrice(200000, 'Mandor', priceDb, CANON_SRC);
  eq(r2.unitPrice, 200000, 'Mandor canonical price must win');
});

test('market fallback only when canonical has no price — and labeled from the matched row', () => {
  const r = resolveDrawerComponentPrice(null, 'Pekerja', priceDb, CANON_SRC);
  eq(r.basis, 'MARKET', 'basis must be MARKET when canonical is missing');
  ok(r.unitPrice !== null && r.unitPrice > 0, 'market fallback must carry a price');
  const match = priceDb.find((p) => p.name.toLowerCase().includes('pekerja'))!;
  eq(r.unitPrice, match.price, 'fallback price must be the matched row price');
  ok((r.priceSource || '').startsWith('Referensi pasar'), `must be labeled Referensi pasar, got ${r.priceSource}`);
  ok((r.priceSource || '').includes(match.priceSource), 'label must carry the matched row priceSource');
  ok((r.priceSource || '').includes(match.location), 'label must carry the matched row location');
  ok((r.priceSource || '').includes(match.periodVersion), 'label must carry the matched row periodVersion');
  ok(isMarketDrawerPrice(r.priceSource), 'isMarketDrawerPrice must detect the label');
});

test('no canonical price and no market match => null, never Rp0', () => {
  const r = resolveDrawerComponentPrice(null, 'Komponen fiktif yang tidak ada di mana pun zzq', priceDb, CANON_SRC);
  eq(r.unitPrice, null, 'unresolved price must stay null');
  eq(r.basis, 'NONE', 'basis NONE');
  eq(r.priceSource, null, 'no source label without a price');
  const r2 = resolveDrawerComponentPrice(0, 'Pekerja', [] as PriceItem[], CANON_SRC);
  eq(r2.unitPrice, null, 'canonical 0 is not a price');
});

test('drawer components for A.1.01.a.1 use canonical prices; direct cost = 6.000', () => {
  const item = officialAhspRepository.getOfficialAhsp('A.1.01.a.1')!;
  const labs = buildDrawerComponents(item.laborComponents, 'LABOR', priceDb, CANON_SRC);
  const pekerja = labs.find((c) => (c.name || '').toLowerCase().includes('pekerja'))!;
  const mandor = labs.find((c) => (c.name || '').toLowerCase().includes('mandor'))!;
  eq(pekerja.unitPrice, 100000, 'drawer Pekerja price must be canonical Rp100.000, not market Rp130.000');
  eq(mandor.unitPrice, 200000, 'drawer Mandor price must be canonical Rp200.000, not market Rp210.000');
  eq(pekerja.total, 5000, 'Pekerja total 0.05 x 100000');
  eq(mandor.total, 1000, 'Mandor total 0.005 x 200000');
  const mats = buildDrawerComponents(item.materialComponents, 'MATERIAL', priceDb, CANON_SRC);
  const eqps = buildDrawerComponents(item.equipmentComponents, 'EQUIPMENT', priceDb, CANON_SRC);
  const direct = [...mats, ...labs, ...eqps].reduce((s, c) => s + (c.total ?? 0), 0);
  eq(direct, 6000, 'drawer direct cost must equal canonical HSP 6.000');
  ok(![...mats, ...labs, ...eqps].some((c) => isMarketDrawerPrice(c.priceSource)), 'no component may be market-priced when canonical prices exist');
});

test('catalog and drawer agree on A.1.01.a.1 (resolver direct price = drawer direct cost)', () => {
  const item = officialAhspRepository.getOfficialAhsp('A.1.01.a.1')!;
  const comp = priceResolver2026.resolveAhspUnitPrice(item);
  const catalogDirect = getAhspDirectPrice(comp);
  eq(catalogDirect, 6000, 'catalog direct price');
  const labs = buildDrawerComponents(item.laborComponents, 'LABOR', priceDb, CANON_SRC);
  const drawerDirect = labs.reduce((s, c) => s + (c.total ?? 0), 0);
  eq(drawerDirect, catalogDirect, 'drawer direct cost must equal catalog direct price');
});

test('fuzzy match never overrides canonical across a sample of at-risk components', () => {
  // At-risk = a component whose canonical price differs from what the OLD
  // fuzzy-first rule would have returned. Scan the catalog for the first
  // 20 and assert each resolves canonical.
  const atRisk: { code: string; name: string; canonical: number; oldFuzzy: number }[] = [];
  for (const item of officialAhspRepository.getActiveOfficialAhsp()) {
    if (atRisk.length >= 20) break;
    const all = [...(item.materialComponents || []), ...(item.laborComponents || []), ...(item.equipmentComponents || [])];
    for (const c of all) {
      if (atRisk.length >= 20) break;
      if (!(typeof c.unitPrice === 'number' && c.unitPrice > 0)) continue;
      const match = priceDb.find((p) => p.name.toLowerCase().includes((c.name || '').toLowerCase()));
      if (match && match.price > 0 && match.price !== c.unitPrice) {
        atRisk.push({ code: item.code, name: c.name, canonical: c.unitPrice, oldFuzzy: match.price });
      }
    }
  }
  ok(atRisk.length > 0, 'sample must contain at least one at-risk component (else the test is vacuous)');
  for (const a of atRisk) {
    const r = resolveDrawerComponentPrice(a.canonical, a.name, priceDb, CANON_SRC);
    eq(r.unitPrice, a.canonical, `${a.code} ${a.name}: canonical ${a.canonical} must beat fuzzy ${a.oldFuzzy}`);
    eq(r.basis, 'CANONICAL', `${a.code} ${a.name}: basis`);
  }
  console.log(`  (checked ${atRisk.length} at-risk components)`);
});

test('save formula: direct 6.000 with O&P 0/0 stays 6.000; drawer 5/10 defaults give 6.900 (explicit markup, not a market price)', () => {
  const direct = 6000;
  // The drawer computes via SafeDecimalEngine (safeMultiply), not raw floats.
  eq(SafeDecimalEngine.safeMultiply(direct, 1 + 0 + 0, 0), 6000, 'O&P 0/0');
  eq(SafeDecimalEngine.safeMultiply(direct, 1 + 0.05 + 0.10, 0), 6900, 'drawer defaults 5/10 — the markup is user-visible and editable, the direct basis is canonical');
});

// --- wiring guard -----------------------------------------------------------

test('drawer wires canonical-first resolution (no fuzzy-first resolvePrice left)', () => {
  const drawerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'components', 'inspector', 'WorkItemInspectorDrawer.tsx');
  const src = fs.readFileSync(drawerPath, 'utf8');
  ok(src.includes('buildDrawerComponents'), 'drawer must build components via buildDrawerComponents');
  ok(src.includes('isMarketDrawerPrice'), 'drawer must label market-priced rows');
  ok(!src.includes('resolvePrice(c.name'), 'old fuzzy-first resolvePrice call must be gone');
  ok(!src.includes('const resolvePrice ='), 'old resolvePrice helper must be gone');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-52: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
