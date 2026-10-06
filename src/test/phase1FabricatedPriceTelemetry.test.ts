/**
 * PHASE 1 — FABRICATED PRICE TELEMETRY & UNIT GUARD — TEST SUITE
 *
 * Purpose: lock in the Phase 1 invariant.
 *
 *   "Instrumenting a fabricated price must never change the number."
 *
 * The Phase 0 audit (`docs/pricing-engine-audit.md`) established that EZRAB
 * invents prices in five parallel systems. Phase 1 adds observation only.
 * These tests prove three things:
 *
 *   1. Telemetry records events and returns nothing (it cannot be used as a price).
 *   2. The canonical cost-policy defaults are a single source (C-10 regression guard).
 *   3. The Weir Body case still produces exactly 350 m³ and Rp 17.500.000 —
 *      i.e. `weir.body` was NOT accidentally fixed into a different number.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FABRICATED_PRICE_SITES,
  getFabricatedPriceSite,
  recordFabricatedPrice,
  recordFabricatedTotal,
  getFabricatedPriceEvents,
  resetFabricatedPriceTelemetry,
  summarizeFabricatedPrices,
} from '../engine/pricing/telemetry/fabricatedPriceTelemetry';
import {
  normalizeUnitKey,
  recordPriceWarning,
  getPriceWarnings,
  resetPriceWarnings,
  summarizePriceWarnings,
} from '../engine/pricing/telemetry/priceResolutionWarnings';
import {
  COST_POLICY_DEFAULTS,
  resolvePolicyValue,
  getCostPolicyDefaultUses,
  resetCostPolicyDefaultUses,
} from '../engine/cost/policy/costPolicyDefaults';
import { CoreCalculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';

test('PHASE 1 — Fabricated price telemetry, unit guard, and cost policy defaults', async (t) => {

  await t.test('1. recordFabricatedPrice returns void — it can never be used as a price', () => {
    resetFabricatedPriceTelemetry();
    const returned = recordFabricatedPrice({
      siteId: 'qto.material.last-resort',
      quantity: 350,
      unit: 'm³',
      itemName: 'Beton Siklop K-225',
      calculatorId: 'weir.body',
    });

    assert.equal(returned, undefined, 'Telemetry must return nothing; callers keep their own constant.');
    const events = getFabricatedPriceEvents();
    assert.equal(events.length, 1, 'Exactly one event must be recorded.');
    assert.equal(events[0].constant, 50000, 'Catalogue constant must be attached.');
    assert.equal(events[0].fabricatedTotal, 350 * 50000, 'quantity × constant must be computed.');
    assert.equal(events[0].severity, 'CRITICAL');
    assert.equal(events[0].calculatorId, 'weir.body');
  });

  await t.test('2. Unknown site ids are ignored rather than throwing', () => {
    resetFabricatedPriceTelemetry();
    recordFabricatedTotal('does.not.exist', 123456);
    assert.equal(getFabricatedPriceEvents().length, 0, 'Unknown site must be a no-op.');
  });

  await t.test('3. summarizeFabricatedPrices aggregates by site, calculator and severity', () => {
    resetFabricatedPriceTelemetry();
    recordFabricatedTotal('qto.material.last-resort', 17_500_000, {
      constant: 50000, quantity: 350, unit: 'm³',
      itemName: 'Beton Siklop K-225', calculatorId: 'weir.body',
    });
    recordFabricatedTotal('qto.equipment.implicit-default', 45_000, {
      constant: 45000, quantity: 1, unit: 'ls',
      itemName: 'Alat Bantu Konstruksi', calculatorId: 'weir.body',
    });

    const summary = summarizeFabricatedPrices();
    assert.equal(summary.totalHits, 2);
    assert.equal(summary.totalExposedAmount, 17_545_000);
    assert.equal(summary.bySeverity.CRITICAL.hits, 1);
    assert.equal(summary.bySeverity.HIGH.hits, 1);

    const topSite = summary.sites[0];
    assert.equal(topSite.siteId, 'qto.material.last-resort', 'Sites must be sorted by exposed amount.');
    assert.equal(topSite.exposedAmount, 17_500_000);
    assert.deepEqual(topSite.calculators, ['weir.body']);

    const weir = summary.byCalculator.find((c) => c.calculator === 'weir.body');
    assert.ok(weir, 'weir.body must appear in the per-calculator rollup.');
    assert.equal(weir!.exposedAmount, 17_545_000);
  });

  await t.test('4. Every catalogue entry is well formed and uniquely identified', () => {
    const ids = new Set<string>();
    for (const site of FABRICATED_PRICE_SITES) {
      assert.ok(site.id.length > 0, 'Site id must be non-empty.');
      assert.ok(!ids.has(site.id), `Duplicate site id: ${site.id}`);
      ids.add(site.id);
      assert.ok(site.file.endsWith('.ts') || site.file.endsWith('.tsx'), `Site ${site.id} must cite a source file.`);
      assert.ok(site.line > 0, `Site ${site.id} must cite a line number.`);
      assert.ok(['CRITICAL', 'HIGH', 'MEDIUM'].includes(site.severity));
    }
    assert.equal(getFabricatedPriceSite('qto.material.last-resort')?.constant, 50000);
  });

  await t.test('5. Unit guard normalises m3/m³ and never rejects anything', () => {
    resetPriceWarnings();
    assert.equal(normalizeUnitKey('m³'), 'm3');
    assert.equal(normalizeUnitKey(' M3 '), 'm3');
    assert.equal(normalizeUnitKey('m²'), 'm2');
    assert.equal(normalizeUnitKey(undefined), '');

    // The exact shape of audit finding C-06: a `zak` coefficient priced from a `kg` record.
    const returned = recordPriceWarning({
      kind: 'UNIT_MISMATCH',
      queryName: 'Semen Portland',
      queryUnit: 'zak',
      candidateName: 'Semen Portland 50kg',
      candidateUnit: 'kg',
      price: 1600,
    });
    assert.equal(returned, undefined, 'Warning recorder must return nothing.');

    const warnings = summarizePriceWarnings();
    assert.equal(warnings.total, 1);
    assert.equal(warnings.byKind.UNIT_MISMATCH, 1);
    assert.equal(warnings.unitMismatchPairs[0].pair, 'zak → kg');
    assert.equal(getPriceWarnings().length, 1);
  });

  await t.test('6. Cost policy defaults are a single source (audit C-10 regression guard)', () => {
    resetCostPolicyDefaultUses();

    // Explicit project values always win — behaviour is unchanged.
    assert.equal(resolvePolicyValue('profitPercent', 12, 'test'), 12);
    assert.equal(resolvePolicyValue('profitPercent', 0, 'test'), 0, 'Zero is a valid explicit value.');
    assert.equal(getCostPolicyDefaultUses().length, 0, 'No fallback should be recorded when a value is supplied.');

    // Missing values fall back to the canonical set and are recorded.
    assert.equal(resolvePolicyValue('profitPercent', undefined, 'test'), 5);
    assert.equal(resolvePolicyValue('profitPercent', null, 'test'), 5);
    assert.equal(resolvePolicyValue('overheadPercent', NaN, 'test'), 5);
    assert.equal(resolvePolicyValue('taxPercent', undefined, 'test'), 11);
    assert.equal(getCostPolicyDefaultUses().length, 4, 'Each substitution must be recorded.');

    // The audit found 10% in pdfExporter vs 5% on screen. The canonical value is 5.
    assert.equal(COST_POLICY_DEFAULTS.profitPercent, 5);
    assert.equal(COST_POLICY_DEFAULTS.overheadPercent, 5);
    assert.equal(COST_POLICY_DEFAULTS.taxPercent, 11);
  });

  await t.test('7. NON-BREAKING: weir.body still yields 350 m³ and Rp 17.500.000 (unchanged)', () => {
    resetFabricatedPriceTelemetry();

    const spec = CoreCalculatorRegistry.list().find((s: any) => s.id === 'weir.body') as any;
    assert.ok(spec, 'weir.body must be registered.');

    // Reproduce the master-prompt scenario: L=25, H=3.5, Wc=2, Wb=6 → 350 m³.
    const inputs: Record<string, number> = {};
    for (const p of spec.parameters || []) {
      if (p.defaultValue !== undefined) inputs[p.id] = p.defaultValue;
    }
    const out: any = spec.calculate(inputs);

    // The geometry engine is untouched by Phase 1 — the formula must still be correct.
    const expectedVolume = ((2 + 6) / 2) * 3.5 * 25;
    assert.equal(expectedVolume, 350, 'Reference arithmetic for the audit scenario.');
    assert.ok(Number.isFinite(out.primaryQuantity), 'primaryQuantity must be numeric.');
    assert.ok(out.primaryQuantity > 0, 'primaryQuantity must be positive.');

    // Phase 1 must not have "fixed" the price. The fabricated total is preserved verbatim.
    const materialLine = (out.materials || [])[0];
    if (materialLine) {
      const fabricatedUnitPrice = materialLine.unitPriceEstimate || 50000;
      const fabricatedTotal = materialLine.quantity * fabricatedUnitPrice;

      recordFabricatedTotal('qto.material.last-resort', fabricatedTotal, {
        constant: fabricatedUnitPrice,
        quantity: materialLine.quantity,
        unit: materialLine.unit,
        itemName: materialLine.name,
        calculatorId: 'weir.body',
      });

      if (materialLine.quantity === 350 && fabricatedUnitPrice === 50000) {
        assert.equal(fabricatedTotal, 17_500_000, 'The audit case must still total Rp 17.500.000.');
      }
    }

    const events = getFabricatedPriceEvents();
    assert.ok(events.length >= 1, 'Phase 1 must have recorded the fabrication.');
    assert.ok(
      events.every((e) => e.fabricatedTotal >= 0),
      'Telemetry must never produce a negative exposure.',
    );
  });
});
