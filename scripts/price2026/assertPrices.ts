/**
 * EZRAB PRICE 2026 — PHASE 41/32/42/43: HARD ASSERTIONS (fail closed)
 * ===================================================================
 *
 * This is the gate. If any assertion fails, the price database is NOT trustworthy and
 * the pipeline exits non-zero. Nothing here is advisory.
 *
 * Coverage is deliberately NOT asserted: the brief forbids forcing 100% coverage, and
 * a resource with no source price must stay unpriced. What IS asserted is that every
 * price that DOES exist is honest, traceable and never a stand-in for "unknown".
 *
 * Run: npm run price:assert
 */

import * as fs from 'fs';
import * as path from 'path';
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { RESOURCE_PRICE_RECORDS } from '../../src/data/priceDatabase2026/priceMaster.generated';
import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { PRICE_SOURCES } from './sources.config';
import { looseCode } from './core';

const ROOT = process.cwd();
const VALIDATED = path.join(ROOT, 'data', 'price2026', 'validated');

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`  [PASS] ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readIfExists(p: string): string {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

/**
 * Strip comments so that explanatory prose mentioning a banned pattern
 * ("there is no `|| 0` here") is not mistaken for an actual fallback.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function main(): void {
  console.log('=== PHASE 41 — PRICE DATABASE ASSERTIONS ===');

  // -------------------------------------------------------------------------
  console.log('\n[1] Canonical AHSP is untouched and price-free');
  // -------------------------------------------------------------------------
  const canonicalCount = (AHSP_2026_CANONICAL as any[]).length;
  check('canonical AHSP item count is 5801', canonicalCount === 5801, `got ${canonicalCount}`);

  let canonicalPriced = 0;
  for (const it of AHSP_2026_CANONICAL as any[]) {
    for (const list of [it.laborComponents || [], it.materialComponents || [], it.equipmentComponents || []]) {
      for (const c of list as any[]) {
        if (typeof c.unitPrice === 'number' && c.unitPrice > 0) canonicalPriced++;
      }
    }
  }
  check('no price is written into the canonical AHSP source', canonicalPriced === 0, `${canonicalPriced} priced components`);

  // -------------------------------------------------------------------------
  console.log('\n[2] Every price record is a real, positive, traceable price');
  // -------------------------------------------------------------------------
  const badPrice = RESOURCE_PRICE_RECORDS.filter((r) => !Number.isFinite(r.price) || r.price <= 0);
  check('no record has a non-positive price', badPrice.length === 0, `${badPrice.length} offenders`);

  const missingProvenance = RESOURCE_PRICE_RECORDS.filter(
    (r) =>
      !r.sourceKey ||
      !r.sourceName ||
      !r.period?.label ||
      !r.location?.level ||
      !r.verificationStatus ||
      !r.retrievedAt
  );
  check('every record carries full provenance', missingProvenance.length === 0, `${missingProvenance.length} offenders`);

  const ids = new Set<string>();
  let dupIds = 0;
  for (const r of RESOURCE_PRICE_RECORDS) {
    if (ids.has(r.id)) dupIds++;
    ids.add(r.id);
  }
  check('price record identities are unique', dupIds === 0, `${dupIds} duplicates`);

  const noResource = RESOURCE_PRICE_RECORDS.filter((r) => !r.resourceCode && !r.resourceId);
  check('every record is bound to a canonical resource', noResource.length === 0, `${noResource.length} unbound`);

  // -------------------------------------------------------------------------
  console.log('\n[3] Verification status discipline (PHASE 12)');
  // -------------------------------------------------------------------------
  const nameOnlyVerified = RESOURCE_PRICE_RECORDS.filter(
    (r) => r.matchMethod === 'NAME_UNIT' && r.verificationStatus === 'VERIFIED'
  );
  check(
    'a name-only binding is NEVER promoted to VERIFIED',
    nameOnlyVerified.length === 0,
    `${nameOnlyVerified.length} offenders`
  );

  const validStatuses = new Set(['VERIFIED', 'SOURCE_REPORTED', 'NEEDS_REVIEW']);
  const badStatus = RESOURCE_PRICE_RECORDS.filter((r) => !validStatuses.has(r.verificationStatus));
  check('every record has a known verification status', badStatus.length === 0, `${badStatus.length} offenders`);

  // -------------------------------------------------------------------------
  console.log('\n[4] Source registry discipline (PHASE 27)');
  // -------------------------------------------------------------------------
  const activeLegacy = PRICE_SOURCES.filter((s) => s.active && s.tier === 'LEGACY_SUPERSEDED');
  check('no LEGACY_SUPERSEDED source is active', activeLegacy.length === 0, `${activeLegacy.length} offenders`);

  const usedSources = new Set(RESOURCE_PRICE_RECORDS.map((r) => r.sourceKey));
  const unknownSource = [...usedSources].filter((k) => !PRICE_SOURCES.some((s) => s.key === k));
  check('every used source is registered', unknownSource.length === 0, unknownSource.join(', '));

  const excludedUsed = [...usedSources].filter((k) => PRICE_SOURCES.find((s) => s.key === k)?.active === false);
  check('no excluded source contributed a row', excludedUsed.length === 0, excludedUsed.join(', '));

  // -------------------------------------------------------------------------
  console.log('\n[5] Missing is NULL — never 0 (PHASE 17/43)');
  // -------------------------------------------------------------------------
  const miss = priceResolver2026.resolveResourcePrice({
    resourceCode: 'ZZ.NOT.A.REAL.CODE',
    unit: 'kg',
    resourceType: 'material',
  });
  check('resolver returns null for an unknown resource', miss.price === null, `got ${JSON.stringify(miss.price)}`);
  check('resolver status is NOT_FOUND for an unknown resource', miss.status === 'NOT_FOUND', miss.status);

  const noCode = priceResolver2026.resolveResourcePrice({ resourceCode: '', unit: 'kg' });
  check('resolver returns null when no code is supplied', noCode.price === null, `got ${JSON.stringify(noCode.price)}`);

  // -------------------------------------------------------------------------
  console.log('\n[6] No silent zero / magic-number fallback in the price path (PHASE 43)');
  // -------------------------------------------------------------------------
  const pricePathFiles = [
    'src/data/priceDatabase2026/resolver.ts',
    'src/data/priceDatabase2026/normalize.ts',
    'server/services/authoritativeAhspPriceBridge.ts',
    'server/services/deterministicRabDraftEngine.ts',
    'server/services/spreadsheetApprovalEngine.ts',
  ];
  for (const f of pricePathFiles) {
    const raw = readIfExists(path.join(ROOT, f));
    check(`price path file exists: ${f}`, raw.length > 0);
    if (!raw) continue;
    const src = stripComments(raw);
    const zeroish = [...src.matchAll(/\|\|\s*0\b|\?\?\s*0\b/g)].map((m) => m[0]);
    check(`no \`|| 0\` / \`?? 0\` fallback in ${path.basename(f)}`, zeroish.length === 0, zeroish.join(', '));
  }

  const bridgeSrc = stripComments(readIfExists(path.join(ROOT, 'server/services/authoritativeAhspPriceBridge.ts')));
  check(
    'the fabricated 150000 AI-estimate constant is gone',
    !/\b150000\b/.test(bridgeSrc),
    'still present in authoritativeAhspPriceBridge.ts'
  );
  check(
    'the bridge no longer returns unitPrice: 0 for a missing price',
    !/unitPrice:\s*0\s*,/.test(bridgeSrc)
  );

  // -------------------------------------------------------------------------
  console.log('\n[7] AHSP composition arithmetic (PHASE 18/19/20)');
  // -------------------------------------------------------------------------
  let checkedItems = 0;
  let arithmeticOk = true;
  let statusOk = true;
  let firstArithFail = '';
  let firstStatusFail = '';

  for (const it of AHSP_2026_CANONICAL as any[]) {
    const comp = priceResolver2026.resolveAhspUnitPrice(it);

    // status consistency
    const expected =
      comp.totalComponents === 0
        ? 'MISSING'
        : comp.missingComponents === 0
          ? 'FULL'
          : comp.resolvedComponents > 0
            ? 'PARTIAL'
            : 'MISSING';
    if (comp.pricingStatus !== expected && statusOk) {
      statusOk = false;
      firstStatusFail = `${it.code}: status=${comp.pricingStatus} expected=${expected}`;
    }

    // unitPrice === sum of resolved subtotals
    const sum =
      comp.labor.subtotalPerUnit + comp.material.subtotalPerUnit + comp.equipment.subtotalPerUnit;
    if (comp.resolvedComponents > 0) {
      if (Math.abs((comp.unitPrice ?? -1) - sum) > 1e-6 && arithmeticOk) {
        arithmeticOk = false;
        firstArithFail = `${it.code}: unitPrice=${comp.unitPrice} sum=${sum}`;
      }
    } else if (comp.unitPrice !== null && arithmeticOk) {
      arithmeticOk = false;
      firstArithFail = `${it.code}: unitPrice=${comp.unitPrice} but 0 components resolved`;
    }

    // every resolved component must have coefficient × price === subtotal
    for (const cat of [comp.labor, comp.material, comp.equipment]) {
      for (const c of cat.components) {
        if (c.resolved && Math.abs((c.subtotalPerUnit ?? 0) - c.coefficient * (c.unitPrice ?? 0)) > 1e-6 && arithmeticOk) {
          arithmeticOk = false;
          firstArithFail = `${it.code}:${c.itemCode} coefficient arithmetic`;
        }
      }
    }
    checkedItems++;
  }
  check('AHSP pricing status is consistent for every item', statusOk, firstStatusFail);
  check(
    `AHSP unit price = Σ(coefficient × resolved price) for all ${checkedItems} items`,
    arithmeticOk,
    firstArithFail
  );

  // -------------------------------------------------------------------------
  console.log('\n[8] Determinism (PHASE 4/38)');
  // -------------------------------------------------------------------------
  const q = { resourceCode: 'L.01', unit: 'OH', resourceType: 'labor' as const };
  const a = JSON.stringify(priceResolver2026.resolveResourcePrice(q));
  const b = JSON.stringify(priceResolver2026.resolveResourcePrice(q));
  const c = JSON.stringify(priceResolver2026.resolveResourcePrice(q));
  check('repeated resolution is byte-identical', a === b && b === c);

  // -------------------------------------------------------------------------
  console.log('\n[9] Pipeline artifacts present');
  // -------------------------------------------------------------------------
  for (const f of ['price_master.json', 'match_report.json', 'unmatched_price_rows.json', 'conflicts.json']) {
    check(`artifact present: ${f}`, fs.existsSync(path.join(VALIDATED, f)));
  }

  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  if (failures.length > 0) {
    console.log(`PRICE ASSERTIONS: ${passed} PASSED, ${failures.length} FAILED`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log('============================================================');
    process.exit(1);
  }
  console.log(`PRICE ASSERTIONS: ${passed} PASSED, 0 FAILED`);
  console.log('============================================================');
}

main();
