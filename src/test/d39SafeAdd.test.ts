/**
 * D-39 (P2) + NEW-09 — safeAdd misuse: trailing `, 2` (meant as decimals)
 * was summed literally (+Rp2 per call) at 16 sites.
 * Run: npx tsx src/test/d39SafeAdd.test.ts
 *
 * Regression: the three audit cases now agree exactly, and the DED grand
 * total is no longer overstated Rp2 × item count. A static guard scans the
 * whole src/ tree for any remaining `safeAdd(..., 2)` shape.
 *
 * NOTE on the DED golden (Rp149.023.200): it flows through
 * DedAiCalculator.buildOutput (plain `+`), NOT through dedRabGenerator,
 * so the fix does not move it. Verified by dedPriceCompletion (43/43).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { AHSPCalculationEngine } from '../engine/ahspCalculationEngine';
import { DedRabGenerator } from '../ded-rab-v2/pipeline/dedRabGenerator';
import type { AHSPComponent, AHSPProjectSnapshot } from '../types';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

// --- fixtures ---------------------------------------------------------------

const comp = (total: number, name: string): AHSPComponent => ({
  id: `comp-${name}`,
  code: `RES-${name}`,
  name,
  unit: 'ls',
  coefficient: 1,
  unitPrice: total,
  total,
  resourceType: 'LABOR',
} as AHSPComponent);

const snapshot = (
  material: number[],
  labor: number[],
  equipment: number[]
): AHSPProjectSnapshot => ({
  ahspId: 'AHSP-TEST',
  code: 'TEST.1',
  version: '2026',
  name: 'Item uji D-39',
  unit: 'm2',
  sourceDocument: 'uji',
  materialComponents: material.map((t, i) => comp(t, `mat-${i}`)),
  laborComponents: labor.map((t, i) => comp(t, `lab-${i}`)),
  equipmentComponents: equipment.map((t, i) => comp(t, `eqp-${i}`)),
  unitPrice: 0,
  isCustomModified: false,
  snapshotTimestamp: '2026-11-14T00:00:00.000Z',
} as AHSPProjectSnapshot);

// --- safeAdd semantics ------------------------------------------------------

test('safeAdd is variadic and sums every argument (the trap, pinned)', () => {
  eq(SafeDecimalEngine.safeAdd(100, 50), 150, 'two args');
  eq(SafeDecimalEngine.safeAdd(100, 50, 2), 152, 'three args sums the 2');
  eq(SafeDecimalEngine.safeAdd(100, 50, 2, 3), 155, 'four args');
});

// --- audit case A: labor 2 rows = 7.550 (was 7.554 / 7.558) ----------------

test('D-39 case A: labor 2 rows totalling 7.550 stays 7.550 everywhere', () => {
  const snap = snapshot([], [3000, 4550], []);
  const recalculated = AHSPCalculationEngine.recalculateSnapshot(snap);
  eq(recalculated.unitPrice, 7550, 'snapshot unitPrice');
  const cost = AHSPCalculationEngine.calculateItemCost(1, snap);
  eq(cost.laborCost, 7550, 'laborCost');
  eq(cost.materialCost, 0, 'materialCost');
  eq(cost.equipmentCost, 0, 'equipmentCost');
  eq(cost.unitPrice, 7550, 'unitPrice');
  eq(cost.totalPrice, 7550, 'totalPrice at volume 1');
});

// --- audit case B: 3 sections × 1 row = 125.000 (was 125.006 / 125.010) ---

test('D-39 case B: 3 sections × 1 row totalling 125.000 stays 125.000', () => {
  const snap = snapshot([50000], [45000], [30000]);
  const recalculated = AHSPCalculationEngine.recalculateSnapshot(snap);
  eq(recalculated.unitPrice, 125000, 'snapshot unitPrice');
  const cost = AHSPCalculationEngine.calculateItemCost(1, snap);
  eq(cost.materialCost, 50000, 'materialCost');
  eq(cost.laborCost, 45000, 'laborCost');
  eq(cost.equipmentCost, 30000, 'equipmentCost');
  eq(cost.unitPrice, 125000, 'unitPrice');
  eq(cost.totalPrice, 125000, 'totalPrice at volume 1');
});

// --- audit case C: 5 labor rows = 1.738.052 (was +10 per section) -----------

test('D-39 case C: 5 labor rows totalling 1.738.052 stay 1.738.052', () => {
  const snap = snapshot([], [500000, 400000, 300000, 300000, 238052], []);
  const recalculated = AHSPCalculationEngine.recalculateSnapshot(snap);
  eq(recalculated.unitPrice, 1738052, 'snapshot unitPrice');
  const cost = AHSPCalculationEngine.calculateItemCost(1, snap);
  eq(cost.laborCost, 1738052, 'laborCost');
  eq(cost.unitPrice, 1738052, 'unitPrice');
  eq(cost.totalPrice, 1738052, 'totalPrice at volume 1');
});

// --- DED grand total (NEW-09): no longer +Rp2 per READY item ---------------

test('NEW-09: DED grand total is the exact sum of READY items (no +Rp2/item)', () => {
  const gen = DedRabGenerator.getInstance();
  const inventory = [
    { id: 'DED-1', name: 'Pekerjaan A', category: 'Struktur', specification: 'm2', sourcePages: [1], evidence: [] },
    { id: 'DED-2', name: 'Pekerjaan B', category: 'Arsitektur', specification: 'm3', sourcePages: [2], evidence: [] },
    { id: 'DED-3', name: 'Pekerjaan C', category: 'MEP', specification: 'ls', sourcePages: [3], evidence: [] },
  ] as any;
  const quantities = new Map<string, any>([
    ['DED-1', { value: 10, unit: 'm2', formula: '10', status: 'RESOLVED', inputs: [], sourcePages: [1] }],
    ['DED-2', { value: 2.5, unit: 'm3', formula: '2.5', status: 'RESOLVED', inputs: [], sourcePages: [2] }],
    ['DED-3', { value: 1, unit: 'ls', formula: '1', status: 'RESOLVED', inputs: [], sourcePages: [3] }],
  ]);
  const ahspMatches = new Map<string, any>([
    ['DED-1', { code: 'A.1', name: 'AHSP A', unit: 'm2', matchType: 'EXACT_MATCH', source: 'PUPR 2026', confidence: 1 }],
    ['DED-2', { code: 'A.2', name: 'AHSP B', unit: 'm3', matchType: 'EXACT_MATCH', source: 'PUPR 2026', confidence: 1 }],
    ['DED-3', { code: 'A.3', name: 'AHSP C', unit: 'ls', matchType: 'SEMANTIC_MATCH', source: 'PUPR 2026', confidence: 0.9 }],
  ]);
  const prices = new Map<string, any>([
    ['DED-1', { unitPrice: 125000, totalPrice: 1250000, priceSource: 'OFFICIAL_AHSP', isOfficial: true, currency: 'IDR' }],
    ['DED-2', { unitPrice: 80000, totalPrice: 200000, priceSource: 'OFFICIAL_AHSP', isOfficial: true, currency: 'IDR' }],
    ['DED-3', { unitPrice: 500000, totalPrice: 500000, priceSource: 'OFFICIAL_AHSP', isOfficial: true, currency: 'IDR' }],
  ]);
  const validations = new Map<string, any>([
    ['DED-1', { isValid: true, status: 'READY', errors: [] }],
    ['DED-2', { isValid: true, status: 'READY', errors: [] }],
    ['DED-3', { isValid: true, status: 'READY', errors: [] }],
  ]);
  const result = gen.generateRab({ inventory, quantities, ahspMatches, prices, validations });
  eq(result.readyCount, 3, 'all 3 items READY');
  // 10×125.000 + 2.5×80.000 + 1×500.000 = 1.950.000 (old code: 1.950.006)
  eq(result.grandTotal, 1950000, 'grandTotal exact');
  eq(result.readyItems[0].totalAmount, 1250000, 'item 1 total');
  eq(result.readyItems[1].totalAmount, 200000, 'item 2 total');
  eq(result.readyItems[2].totalAmount, 500000, 'item 3 total');
});

// --- static guard: no `safeAdd(..., 2)` shape anywhere in src/ --------------

const SAFE_ADD_TRAILING_TWO = /safeAdd\([^()]*,\s*2\s*\)/g;

test('guard regex self-test: catches the misuse, passes legit uses', () => {
  const bad = 'SafeDecimalEngine.safeAdd(sum, c.total, 2)';
  const badMultiline = 'SafeDecimalEngine.safeAdd(grandTotal, totalAmount,\n  2)';
  const goodVariadic = 'SafeDecimalEngine.safeAdd(subtotalBeforeTax, ppn, pph)';
  const goodNested = 'SafeDecimalEngine.safeAdd(SafeDecimalEngine.safeAdd(a, b), c)';
  const goodRound = 'safeRound(safeAdd(a, b), 2)';
  ok(SAFE_ADD_TRAILING_TWO.test(bad), 'catches single-line misuse');
  SAFE_ADD_TRAILING_TWO.lastIndex = 0;
  ok(SAFE_ADD_TRAILING_TWO.test(badMultiline.replace(/\n/g, ' ')), 'catches multiline misuse (collapsed)');
  SAFE_ADD_TRAILING_TWO.lastIndex = 0;
  ok(!SAFE_ADD_TRAILING_TWO.test(goodVariadic), 'legit 3-arg variadic sum passes');
  SAFE_ADD_TRAILING_TWO.lastIndex = 0;
  ok(!SAFE_ADD_TRAILING_TWO.test(goodNested), 'nested safeAdd passes');
  SAFE_ADD_TRAILING_TWO.lastIndex = 0;
  ok(!SAFE_ADD_TRAILING_TWO.test(goodRound), 'safeRound(safeAdd(a, b), 2) passes');
});

test('guard: no safeAdd(..., 2) misuse remains in src/ (excl. *.test.ts)', () => {
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      const content = fs.readFileSync(full, 'utf8').replace(/\r?\n/g, ' ');
      SAFE_ADD_TRAILING_TWO.lastIndex = 0;
      if (SAFE_ADD_TRAILING_TWO.test(content)) {
        hits.push(path.relative(srcRoot, full));
      }
    }
  };
  walk(srcRoot);
  eq(hits.length, 0, `files with safeAdd(..., 2) misuse: ${hits.join(', ')}`);
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-39/NEW-09: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
