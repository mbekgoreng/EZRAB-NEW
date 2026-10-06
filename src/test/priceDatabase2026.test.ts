/**
 * EZRAB PRICE DATABASE 2026 — MANDATORY TEST SUITE (PHASE 39)
 * ==========================================================
 *
 * Locks in the price-layer invariants. The single most important one:
 *
 *     A MISSING PRICE IS `null`. IT IS NEVER `0`.
 *
 * Every other assertion exists to make that one impossible to regress: if the price
 * layer ever starts returning 0 for "unknown", or a name-only match is silently
 * promoted to VERIFIED, or a fallback happens without being recorded, this suite fails.
 *
 * Run: npm run test:price
 */

import { AHSP_2026_CANONICAL } from '../data/nationalCostDatabase/ahsp2026Canonical.generated';
import { RESOURCE_PRICE_RECORDS } from '../data/priceDatabase2026/priceMaster.generated';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { formatCurrencyIDR } from '../calculations/decimalEngine';
import { PRICE_SOURCES } from '../../scripts/price2026/sources.config';
import { AuthoritativeAhspPriceBridge } from '../../server/services/authoritativeAhspPriceBridge';

export interface PriceTestResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  logs: string[];
}

export function runPriceDatabaseTestSuite(): PriceTestResult {
  const logs: string[] = [];
  let passed = 0;
  let failed = 0;

  const log = (s: string) => logs.push(s);
  const assert = (cond: boolean, msg: string) => {
    if (cond) {
      passed++;
      log(`  [PASS] ${msg}`);
    } else {
      failed++;
      log(`  [FAIL] ${msg}`);
    }
  };

  log('============================================================');
  log('EZRAB PRICE DATABASE 2026 — MANDATORY TESTS (PHASE 39)');
  log('============================================================');

  // -------------------------------------------------------------------------
  log('\n[TEST 1] A priced resource resolves with a positive price + provenance');
  // -------------------------------------------------------------------------
  {
    const res = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L.01',
      unit: 'OH',
      resourceType: 'labor',
    });
    assert(res.status === 'RESOLVED', 'labour L.01/OH resolves');
    assert(typeof res.price === 'number' && res.price > 0, `price is a positive number (${res.price})`);
    assert(res.currency === 'IDR', 'currency is IDR');
    assert(res.unit === 'OH', 'unit is echoed back');
    assert(!!res.source?.key && !!res.source?.name, 'source key and name are recorded');
    assert(!!res.source?.tier && typeof res.source?.priority === 'number', 'source tier and priority recorded');
    assert(!!res.resolvedPeriod?.label, 'resolved period label recorded');
    assert(!!res.resolvedLocation?.level, 'resolved location level recorded');
    assert(!!res.verificationStatus, 'verification status recorded');
    assert(!!res.matchMethod, 'match method recorded');
    assert(res.explanation.length > 20, 'a human-readable explanation is produced');
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 2] A MISSING price is NULL — never 0  ← the core invariant');
  // -------------------------------------------------------------------------
  {
    const res = priceResolver2026.resolveResourcePrice({
      resourceCode: 'ZZ.NOT.A.REAL.RESOURCE',
      unit: 'kg',
      resourceType: 'material',
    });
    assert(res.status === 'NOT_FOUND', 'status is NOT_FOUND');
    assert(res.price === null, 'price is strictly null');
    assert(res.price !== 0, 'price is NOT 0');
    assert(res.currency === null, 'currency is null (there is no amount)');
    assert(res.source === null, 'source is null');
    assert(res.alternatives.length === 0, 'no alternatives are invented');
    assert(/NOT Rp 0/.test(res.explanation), 'the explanation says so explicitly');
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 3] AHSP unit price = Σ(coefficient × resolved resource price)');
  // -------------------------------------------------------------------------
  {
    let verified = 0;
    let mismatch = '';
    for (const it of AHSP_2026_CANONICAL as any[]) {
      const comp = priceResolver2026.resolveAhspUnitPrice(it);
      if (comp.resolvedComponents === 0) continue;
      const sum = comp.labor.subtotalPerUnit + comp.material.subtotalPerUnit + comp.equipment.subtotalPerUnit;
      if (Math.abs((comp.unitPrice ?? -1) - sum) > 1e-6) {
        mismatch = `${it.code}: unitPrice=${comp.unitPrice} sum=${sum}`;
        break;
      }
      // and every component's own subtotal must equal coefficient × unitPrice
      for (const cat of [comp.labor, comp.material, comp.equipment]) {
        for (const c of cat.components) {
          if (!c.resolved) continue;
          if (Math.abs((c.subtotalPerUnit ?? 0) - c.coefficient * (c.unitPrice ?? 0)) > 1e-6) {
            mismatch = `${it.code}:${c.itemCode} subtotal arithmetic`;
          }
        }
      }
      if (mismatch) break;
      verified++;
    }
    assert(verified > 0, `at least one item was priced and checked (${verified} items)`);
    assert(mismatch === '', `arithmetic holds for every priced item${mismatch ? ` — ${mismatch}` : ''}`);
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 4] PARTIAL pricing is reported, never hidden');
  // -------------------------------------------------------------------------
  {
    let item: any = null;
    let comp: any = null;
    for (const it of AHSP_2026_CANONICAL as any[]) {
      const c = priceResolver2026.resolveAhspUnitPrice(it);
      if (c.pricingStatus === 'PARTIAL') {
        item = it;
        comp = c;
        break;
      }
    }
    assert(!!comp, 'a PARTIAL item exists');
    if (comp) {
      assert(comp.pricingStatus === 'PARTIAL', 'pricingStatus is PARTIAL');
      assert(comp.missingComponents > 0, 'missingComponents > 0');
      assert(comp.resolvedComponents > 0, 'resolvedComponents > 0');
      assert(comp.missing.length === comp.missingComponents, 'the missing list enumerates every unpriced component');
      assert(
        comp.missing.every((m: any) => typeof m.name === 'string' && typeof m.unit === 'string'),
        'every missing entry names the component and its unit'
      );
      assert(
        comp.labor.complete === (comp.labor.missingCount === 0),
        'category `complete` flag agrees with its missingCount'
      );
      // the partial total must be the sum of the RESOLVED components only
      const sum = comp.labor.subtotalPerUnit + comp.material.subtotalPerUnit + comp.equipment.subtotalPerUnit;
      assert(Math.abs((comp.unitPrice ?? -1) - sum) < 1e-6, 'unitPrice counts only resolved components');
    }
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 5] MISSING status when nothing resolves');
  // -------------------------------------------------------------------------
  {
    let comp: any = null;
    for (const it of AHSP_2026_CANONICAL as any[]) {
      const c = priceResolver2026.resolveAhspUnitPrice(it);
      if (c.pricingStatus === 'MISSING') {
        comp = c;
        break;
      }
    }
    assert(!!comp, 'a MISSING item exists');
    if (comp) {
      assert(comp.pricingStatus === 'MISSING', 'pricingStatus is MISSING');
      assert(comp.resolvedComponents === 0, 'zero components resolved');
      assert(comp.unitPrice === null, 'unitPrice is NULL, not 0');
    }
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 6] A name-only binding is NEVER promoted to VERIFIED (PHASE 12)');
  // -------------------------------------------------------------------------
  {
    const offenders = RESOURCE_PRICE_RECORDS.filter(
      (r) => r.matchMethod === 'NAME_UNIT' && r.verificationStatus === 'VERIFIED'
    );
    assert(offenders.length === 0, `no NAME_UNIT record is VERIFIED (${offenders.length} offenders)`);
    const nameOnly = RESOURCE_PRICE_RECORDS.filter((r) => r.matchMethod === 'NAME_UNIT');
    assert(
      nameOnly.every((r) => r.verificationStatus === 'NEEDS_REVIEW'),
      `every NAME_UNIT record is NEEDS_REVIEW (${nameOnly.length} records)`
    );
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 7] Location fallback is REFUSED unless explicitly opted in');
  // -------------------------------------------------------------------------
  {
    const strict = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L.01',
      unit: 'OH',
      resourceType: 'labor',
      location: { provinceName: 'Jawa Barat' },
      allowLocationFallback: false,
    });
    assert(strict.status === 'NOT_FOUND', 'a national price is NOT silently used for a province request');
    assert(strict.price === null, 'the refused lookup returns null');

    const loose = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L.01',
      unit: 'OH',
      resourceType: 'labor',
      location: { provinceName: 'Jawa Barat' },
      allowLocationFallback: true,
    });
    assert(loose.status === 'RESOLVED', 'the same lookup succeeds when fallback is allowed');
    assert(loose.locationFallback !== 'NONE', 'the fallback is recorded');
    assert(loose.requestedLocation?.provinceName === 'Jawa Barat', 'the requested location is preserved');
    assert(!!loose.resolvedLocation, 'the actually-used location is preserved');
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 8] Period fallback is REFUSED unless explicitly opted in');
  // -------------------------------------------------------------------------
  {
    const strict = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L.01',
      unit: 'OH',
      resourceType: 'labor',
      period: { year: 2031 },
      allowPeriodFallback: false,
    });
    assert(strict.status === 'NOT_FOUND', 'a 2026 price is NOT silently used for a 2031 request');

    const loose = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L.01',
      unit: 'OH',
      resourceType: 'labor',
      period: { year: 2031 },
      allowPeriodFallback: true,
    });
    assert(loose.status === 'RESOLVED', 'the same lookup succeeds when period fallback is allowed');
    assert(loose.periodFallback === 'PREVIOUS_PERIOD', `the fallback direction is recorded (${loose.periodFallback})`);
    assert(loose.requestedPeriod?.year === 2031, 'the requested period is preserved');
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 9] Resolution is deterministic');
  // -------------------------------------------------------------------------
  {
    const q = { resourceCode: 'L.04', unit: 'OH', resourceType: 'labor' as const };
    const a = JSON.stringify(priceResolver2026.resolveResourcePrice(q));
    const b = JSON.stringify(priceResolver2026.resolveResourcePrice(q));
    const c = JSON.stringify(priceResolver2026.resolveResourcePrice(q));
    assert(a === b && b === c, 'three consecutive resolutions are byte-identical');

    const item = (AHSP_2026_CANONICAL as any[])[0];
    const x = JSON.stringify(priceResolver2026.resolveAhspUnitPrice(item));
    const y = JSON.stringify(priceResolver2026.resolveAhspUnitPrice(item));
    assert(x === y, 'AHSP composition is deterministic');
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 10] The canonical AHSP is untouched and price-free');
  // -------------------------------------------------------------------------
  {
    assert((AHSP_2026_CANONICAL as any[]).length === 5801, 'canonical AHSP still has 5801 items');
    let priced = 0;
    for (const it of AHSP_2026_CANONICAL as any[]) {
      for (const list of [it.laborComponents || [], it.materialComponents || [], it.equipmentComponents || []]) {
        for (const comp of list as any[]) {
          if (typeof comp.unitPrice === 'number' && comp.unitPrice > 0) priced++;
        }
      }
    }
    assert(priced === 0, 'no price is written into the canonical source');
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 11] Every price record is positive and fully traceable');
  // -------------------------------------------------------------------------
  {
    assert(RESOURCE_PRICE_RECORDS.length > 0, `price records exist (${RESOURCE_PRICE_RECORDS.length})`);
    assert(
      RESOURCE_PRICE_RECORDS.every((r) => Number.isFinite(r.price) && r.price > 0),
      'every record has a positive, finite price'
    );
    assert(
      RESOURCE_PRICE_RECORDS.every((r) => r.sourceKey && r.sourceName && r.period?.label && r.location?.level),
      'every record carries source, period and location'
    );
    const ids = new Set(RESOURCE_PRICE_RECORDS.map((r) => r.id));
    assert(ids.size === RESOURCE_PRICE_RECORDS.length, 'record identities are unique');
    assert(
      RESOURCE_PRICE_RECORDS.every((r) => PRICE_SOURCES.some((s) => s.key === r.sourceKey && s.active)),
      'every record comes from a registered, ACTIVE source'
    );
    assert(
      !PRICE_SOURCES.some((s) => s.active && s.tier === 'LEGACY_SUPERSEDED'),
      'no superseded legacy source is active'
    );
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 12] Conflicting sources are resolved by priority and NEVER dropped');
  // -------------------------------------------------------------------------
  {
    // Find a resource/unit that has more than one source.
    const byKey = new Map<string, typeof RESOURCE_PRICE_RECORDS>();
    for (const r of RESOURCE_PRICE_RECORDS) {
      const k = `${r.resourceCode}|${r.unit}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }
    const multi = [...byKey.values()].filter((list) => new Set(list.map((r) => r.sourceKey)).size > 1);
    assert(multi.length > 0, `at least one multi-source resource exists (${multi.length})`);

    if (multi.length > 0) {
      const list = multi[0];
      const res = priceResolver2026.resolveResourcePrice({
        resourceCode: list[0].resourceCode,
        unit: list[0].unit,
        resourceType: list[0].resourceType,
      });
      const minPriority = Math.min(...list.map((r) => r.sourcePriority));
      assert(
        res.source?.priority === minPriority,
        `the highest-authority source wins (priority ${res.source?.priority} of ${minPriority})`
      );
      assert(res.alternatives.length > 0, 'the losing candidates are retained in `alternatives`');
    }
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 13] The AHSP bridge never fabricates a price');
  // -------------------------------------------------------------------------
  {
    const bridge = AuthoritativeAhspPriceBridge.getInstance();
    const notFound = {
      matchStatus: 'NOT_FOUND' as const,
      ahspCode: null,
      ahspTitle: null,
      standardCategory: null,
      baseUnitPrice: null,
      coefficients: [],
      isOfficial: false,
      confidence: 0,
    };
    const strict = bridge.lookupPrice(notFound, false);
    assert(strict.priceStatus === 'PRICE_NOT_FOUND', 'missing price → PRICE_NOT_FOUND');
    assert(strict.unitPrice === null, 'unitPrice is NULL, not 0');

    const ai = bridge.lookupPrice(notFound, true);
    assert(ai.priceStatus === 'AI_ESTIMATED', 'AI fallback → AI_ESTIMATED');
    assert(ai.unitPrice === null, 'the bridge does NOT invent a number for the AI estimate');
    assert(ai.status === 'NEEDS_VERIFICATION', 'and it is explicitly flagged NEEDS_VERIFICATION');
  }

  // -------------------------------------------------------------------------
  log('\n[TEST 14] The UI never renders a missing price as Rp 0');
  // -------------------------------------------------------------------------
  {
    assert(formatCurrencyIDR(null) === '—', `formatCurrencyIDR(null) is an em dash (got "${formatCurrencyIDR(null)}")`);
    assert(formatCurrencyIDR(undefined) === '—', 'formatCurrencyIDR(undefined) is an em dash');
    assert(formatCurrencyIDR(0).includes('0'), 'a genuine 0 still renders as a currency amount');
    assert(formatCurrencyIDR(150000).includes('150'), 'a real price still renders');
    assert(!formatCurrencyIDR(null).includes('Rp'), 'a missing price shows no "Rp" prefix at all');
  }

  // -------------------------------------------------------------------------
  log('\n============================================================');
  log(`PRICE DATABASE TESTS: ${passed} PASSED, ${failed} FAILED`);
  log('============================================================');

  return {
    success: failed === 0,
    totalTests: passed + failed,
    passedTests: passed,
    failedTests: failed,
    logs,
  };
}

const runtimeProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
if (runtimeProcess?.argv && runtimeProcess.argv[1]?.includes('priceDatabase2026.test')) {
  const result = runPriceDatabaseTestSuite();
  console.log(result.logs.join('\n'));
  if (!result.success) {
    runtimeProcess.exit(1);
  }
}
