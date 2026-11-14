/**
 * D-29 (P2) — template configurator quotes Rp5.739.615.000 but the created
 * project is Rp5.466.300.000 (Rp273.315.000 of waste evaporates).
 * Run: npx tsx src/test/d29TemplateQuote.test.ts
 *
 * Fix (carry-through, OD-06 option (a) — no ladder change): waste is baked
 * into the VOLUME of non-HSP items (the factory recomputes amount from
 * volume, so amount-baking would be discarded by bulkAdd); overhead /
 * profit / PPN become the NEW project's configuration; the quote is
 * computed through the CANONICAL ENGINE with that same configuration, so
 * quote == created project grand total, to the rupiah. Existing projects
 * keep their own configuration (the quote uses the target's config).
 */
import {
  applyWasteToItems,
  buildTemplateApplicationQuote,
  adjustmentsToNewProjectConfig,
  type TemplateQuoteAdjustments,
} from '../services/templateApplyQuote';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { resolveProjectCostConfig } from '../engine/projectCostConfig';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { RabTemplateService } from '../services/rabTemplateService';
import type { RabItem, Project } from '../types';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const DEFAULTS: TemplateQuoteAdjustments = {
  wastePercent: 5, overheadPercent: 0, profitPercent: 0, taxPercent: 11, taxEnabled: false,
};

const item = (over: Partial<RabItem> & { id: string }): RabItem => ({
  no: 1,
  code: '',
  category: 'Pekerjaan Struktur',
  description: 'Item uji D-29',
  volume: 100,
  unit: 'm2',
  unitPrice: 50000,
  amount: 5000000,
  totalPrice: 5000000,
  priceStatus: 'PRICE_RESOLVED',
  priceCostBasis: 'DIRECT_COST',
  ...over,
} as RabItem);

// --- waste baking -------------------------------------------------------------

test('waste: non-HSP item volume grows 5%, amount recomputed by the factory rule', () => {
  const { items, wasteAmount } = applyWasteToItems(
    [item({ id: 'w1' })],
    5
  );
  eq(items[0].volume, 105, 'volume 100 -> 105');
  eq(items[0].amount, 5250000, 'amount 5.000.000 -> 5.250.000');
  eq(items[0].totalPrice, 5250000, 'totalPrice matches amount');
  eq(wasteAmount, 250000, 'wasteAmount');
  ok(items[0].description.includes('(termasuk waste 5%)'), 'description carries the waste marker');
});

test('waste: HSP items are untouched (anti-double-markup doctrine)', () => {
  const hsp = item({ id: 'h1', priceCostBasis: 'HSP', description: 'Item HSP' });
  const { items, wasteAmount } = applyWasteToItems([hsp], 5);
  eq(items[0], hsp, 'HSP item returned unchanged (same reference)');
  eq(items[0].volume, 100, 'HSP volume unchanged');
  eq(wasteAmount, 0, 'no waste on HSP');
  ok(!items[0].description.includes('waste'), 'no marker on HSP');
});

test('waste: unpriced and zero-volume items are skipped', () => {
  const unpriced = item({ id: 'u1', unitPrice: null, amount: null });
  const zeroVol = item({ id: 'u2', volume: 0, amount: 0 });
  const { items, wasteAmount } = applyWasteToItems([unpriced, zeroVol], 5);
  eq(items[0], unpriced, 'unpriced unchanged');
  eq(items[1], zeroVol, 'zero-volume unchanged');
  eq(wasteAmount, 0, 'no waste');
});

test('waste: fractional volumes round to the factory rule exactly', () => {
  // 3 × 33.333 = 99.999; waste 5% -> 3.15 × 33.333 = 104.998,95 -> 104.999.
  const { items, wasteAmount } = applyWasteToItems(
    [item({ id: 'f1', volume: 3, unitPrice: 33333, amount: 99999, totalPrice: 99999 })],
    5
  );
  eq(items[0].volume, 3.15, 'volume 3 -> 3.15');
  eq(items[0].amount, 104999, 'amount 99.999 -> 104.999');
  eq(wasteAmount, 5000, 'wasteAmount 5.000');
});

test('waste: marker is idempotent (one marker even after two bakes)', () => {
  const once = applyWasteToItems([item({ id: 'm1' })], 5).items;
  const twice = applyWasteToItems(once, 5).items;
  const count = (twice[0].description.match(/\(termasuk waste /g) || []).length;
  eq(count, 1, 'marker appears exactly once');
});

test('waste: 0% or negative waste returns items unchanged', () => {
  const src = [item({ id: 'z1' })];
  const zero = applyWasteToItems(src, 0);
  eq(zero.items, src, '0% returns same array');
  eq(zero.wasteAmount, 0, '0% waste is 0');
  const neg = applyWasteToItems(src, -5);
  eq(neg.items, src, 'negative returns same array');
});

// --- quote module ---------------------------------------------------------------

test('quote: defaults — quote == engine grand total of the baked items', () => {
  const base = [
    item({ id: 'q1', volume: 100, unitPrice: 1000000, amount: 100000000, totalPrice: 100000000 }),
    item({ id: 'q2', volume: 50, unitPrice: 200000, amount: 10000000, totalPrice: 10000000, priceCostBasis: 'HSP' }),
  ];
  const quote = buildTemplateApplicationQuote(base, DEFAULTS, null);
  eq(quote.nonOfficialSubtotal, 100000000, 'non-official subtotal');
  eq(quote.officialSubtotal, 10000000, 'official subtotal');
  eq(quote.baseTotal, 110000000, 'base total');
  eq(quote.wasteAmount, 5000000, 'waste 5% of non-official only');
  // Baked direct = 105.000.000 + 10.000.000 = 115.000.000; OH/profit 0, tax off.
  eq(quote.summary.directCost, 115000000, 'baked direct cost');
  eq(quote.adjustedTotal, 115000000, 'adjusted total == baked direct (0/0, tax off)');
  const engine = UnifiedProjectEngine.recalculateCostSummary(
    quote.items,
    adjustmentsToNewProjectConfig(DEFAULTS)
  );
  eq(engine.grandTotal, quote.adjustedTotal, 'quote == engine on the same baked items');
});

test('quote: nonzero OH+profit+tax uses the FLAT engine ladder (not the old compounding)', () => {
  const base = [
    item({ id: 'c1', volume: 100, unitPrice: 1000000, amount: 100000000, totalPrice: 100000000 }),
  ];
  const adj: TemplateQuoteAdjustments = {
    wastePercent: 0, overheadPercent: 10, profitPercent: 10, taxPercent: 11, taxEnabled: true,
  };
  const quote = buildTemplateApplicationQuote(base, adj, null);
  // Engine (flat): OH 10.000.000 + profit 10.000.000 -> 120.000.000 + PPN 13.200.000.
  // Old compounding formula gave 134.310.000 (profit on direct + overhead).
  eq(quote.summary.overheadAmount, 10000000, 'overhead');
  eq(quote.summary.profitAmount, 10000000, 'profit is flat, not compounded');
  eq(quote.summary.taxAmount, 13200000, 'PPN on 120.000.000');
  eq(quote.adjustedTotal, 133200000, 'adjusted total 133.200.000, not 134.310.000');
});

test('quote: existing-project mode uses the TARGET config, not the adjustments', () => {
  const base = [
    item({ id: 'e1', volume: 100, unitPrice: 1000000, amount: 100000000, totalPrice: 100000000 }),
  ];
  const adj: TemplateQuoteAdjustments = {
    wastePercent: 5, overheadPercent: 10, profitPercent: 10, taxPercent: 11, taxEnabled: false,
  };
  const target = resolveProjectCostConfig({
    overheadPercent: 5,
    profitPercent: 5,
    ppnPercent: 11,
    ppnEnabled: true,
  } as Project);
  const quote = buildTemplateApplicationQuote(base, adj, target);
  eq(quote.effectiveConfig.overheadPercent, 5, 'target overhead wins over adjustments');
  eq(quote.effectiveConfig.profitPercent, 5, 'target profit wins');
  eq(quote.effectiveConfig.ppnEnabled, true, 'target PPN flag wins');
  // Waste still baked (quantity change): direct 105.000.000; +5% +5% -> 115.500.000; +PPN 12.705.000.
  eq(quote.summary.directCost, 105000000, 'waste baked even for existing targets');
  eq(quote.adjustedTotal, 128205000, 'quote with target config');
});

test('adjustmentsToNewProjectConfig: maps adjustments to a new-project config', () => {
  const cfg = adjustmentsToNewProjectConfig({
    wastePercent: 5, overheadPercent: 7, profitPercent: 8, taxPercent: 11, taxEnabled: true,
  });
  eq(cfg.overheadPercent, 7, 'overhead');
  eq(cfg.profitPercent, 8, 'profit');
  eq(cfg.taxPercent, 11, 'taxPercent');
  eq(cfg.ppnEnabled, true, 'ppnEnabled from taxEnabled');
  eq(cfg.pphEnabled, false, 'no PPh in adjustments');
  const off = adjustmentsToNewProjectConfig(DEFAULTS);
  eq(off.ppnEnabled, false, 'taxEnabled false -> PPN off');
});

// --- round-trip acceptance: the real audit template -----------------------------

test('D-29 round-trip: Apartemen Mid-Rise 6 Lantai (Professional) — quote == created project', () => {
  const svc = RabTemplateService.getInstance();
  const template = svc.getTemplateById('BLD-APARTMENT-MIDRISE');
  ok(!!template, 'template BLD-APARTMENT-MIDRISE exists');
  const params: Record<string, any> = {};
  for (const p of template!.parameters) {
    params[p.key] = p.defaultValue !== undefined ? p.defaultValue : '';
  }
  const result = svc.generateRabFromTemplate(template!, params, 'PRJ-TEST-D29', 'PROFESSIONAL', []);
  ok(result.items.length > 0, `template generates items (got ${result.items.length})`);

  // Configurator side: the quote.
  const quote = buildTemplateApplicationQuote(result.items, DEFAULTS, null);
  eq(quote.baseTotal, result.totalEstimate, 'quote baseTotal == generator totalEstimate');
  ok(quote.adjustedTotal > quote.baseTotal, 'quote includes waste (adjusted > base)');

  // WorkspaceView side: bake waste with the SAME function, then run every
  // item through the REAL factory (the bulkAdd path), then the engine with
  // the NEW-project config the createProject call would set.
  const baked = applyWasteToItems(result.items, DEFAULTS.wastePercent).items;
  const stored = baked.map((it, idx) =>
    createRabItemRecord(it, 'PRJ-TEST-D29', { defaultVolumeSource: 'AI_GENERATED', defaultUnit: 'ls', index: idx })
  );
  const created = UnifiedProjectEngine.recalculateCostSummary(
    stored,
    adjustmentsToNewProjectConfig(DEFAULTS)
  );
  eq(
    created.grandTotal,
    quote.adjustedTotal,
    `created project grand total == quoted total (created ${created.grandTotal}, quoted ${quote.adjustedTotal})`
  );
  eq(created.directCost, quote.summary.directCost, 'created direct == quoted direct');
  // The old defect, stated plainly: the created total must NOT equal the
  // un-adjusted base total — the waste must survive the apply.
  ok(created.grandTotal !== quote.baseTotal, 'waste survives: created total != base total');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-29: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
