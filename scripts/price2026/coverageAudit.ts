/**
 * EZRAB PRICE 2026 — PHASE 33/34/35: COVERAGE AUDIT
 * =================================================
 *
 * Reports — honestly, without inflating anything — how much of the canonical AHSP can
 * actually be priced today, and precisely which resources are the blockers.
 *
 * Coverage is a MEASUREMENT, not a target. The brief forbids forcing 100%; a resource
 * with no source price must stay unpriced and be reported here.
 *
 * Run: npm run price:coverage
 */

import * as fs from 'fs';
import * as path from 'path';
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { RESOURCE_PRICE_RECORDS } from '../../src/data/priceDatabase2026/priceMaster.generated';
import { COMPONENT_KEYS, CANONICAL_RESOURCE_INDEX } from '../../src/data/priceDatabase2026/resourceIndex.generated';
import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { componentTypeFromCode, looseCode, normalizeUnitForType } from './core';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'data', 'price2026', 'reports');

interface MissingEntry {
  code: string;
  name: string;
  unit: string;
  type: string;
  usageCount: number;
}

function main(): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const pricedKeys = new Set(
    RESOURCE_PRICE_RECORDS.map((r) => `${looseCode(r.resourceCode)}|${r.unit}`)
  );

  // -------------------------------------------------------------------------
  // 1. Component-key coverage, weighted by how often each key is actually used
  // -------------------------------------------------------------------------
  const byType = {
    material: { total: 0, priced: 0, usesTotal: 0, usesPriced: 0 },
    labor: { total: 0, priced: 0, usesTotal: 0, usesPriced: 0 },
    equipment: { total: 0, priced: 0, usesTotal: 0, usesPriced: 0 },
  };
  const missing: MissingEntry[] = [];

  for (const k of COMPONENT_KEYS as any[]) {
    const t = k.type as 'material' | 'labor' | 'equipment';
    if (!byType[t]) continue;
    const priced = pricedKeys.has(k.key);
    byType[t].total++;
    byType[t].usesTotal += k.count;
    if (priced) {
      byType[t].priced++;
      byType[t].usesPriced += k.count;
    } else {
      missing.push({ code: k.code, name: k.name, unit: k.unit, type: t, usageCount: k.count });
    }
  }

  missing.sort((a, b) => b.usageCount - a.usageCount);

  const totalKeys = byType.material.total + byType.labor.total + byType.equipment.total;
  const totalPriced = byType.material.priced + byType.labor.priced + byType.equipment.priced;
  const usesTotal = byType.material.usesTotal + byType.labor.usesTotal + byType.equipment.usesTotal;
  const usesPriced = byType.material.usesPriced + byType.labor.usesPriced + byType.equipment.usesPriced;

  // -------------------------------------------------------------------------
  // 2. AHSP item coverage (PHASE 34) — computed through the real resolver
  // -------------------------------------------------------------------------
  const ahsp = { full: 0, partial: 0, missing: 0, noComponents: 0 };
  const byDomain = new Map<string, { full: number; partial: number; missing: number; noComponents: number; total: number }>();
  const missingComponentHistogram = new Map<string, number>();

  for (const it of AHSP_2026_CANONICAL as any[]) {
    const comp = priceResolver2026.resolveAhspUnitPrice(it);
    const d = it.domain || 'UNKNOWN';
    if (!byDomain.has(d)) byDomain.set(d, { full: 0, partial: 0, missing: 0, noComponents: 0, total: 0 });
    const b = byDomain.get(d)!;
    b.total++;

    if (comp.totalComponents === 0) {
      ahsp.noComponents++;
      b.noComponents++;
    } else if (comp.pricingStatus === 'FULL') {
      ahsp.full++;
      b.full++;
    } else if (comp.pricingStatus === 'PARTIAL') {
      ahsp.partial++;
      b.partial++;
    } else {
      ahsp.missing++;
      b.missing++;
    }

    for (const m of comp.missing) {
      const key = `${m.type}:${looseCode(m.code) || '(no code)'}|${m.unit}`;
      missingComponentHistogram.set(key, (missingComponentHistogram.get(key) || 0) + 1);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Resource-master quality (PHASE 35)
  // -------------------------------------------------------------------------
  const quality = { CLEAN: 0, SUSPECT: 0, DEFECTIVE: 0 };
  for (const r of CANONICAL_RESOURCE_INDEX as any[]) {
    if (quality[r.quality as keyof typeof quality] !== undefined) quality[r.quality as keyof typeof quality]++;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    componentKeyCoverage: {
      distinctKeys: totalKeys,
      pricedKeys: totalPriced,
      keyCoveragePercent: Number(((totalPriced / (totalKeys || 1)) * 100).toFixed(2)),
      componentUses: usesTotal,
      pricedUses: usesPriced,
      useWeightedCoveragePercent: Number(((usesPriced / (usesTotal || 1)) * 100).toFixed(2)),
      byType: Object.fromEntries(
        Object.entries(byType).map(([k, v]) => [
          k,
          {
            keys: v.total,
            pricedKeys: v.priced,
            keyCoveragePercent: Number(((v.priced / (v.total || 1)) * 100).toFixed(2)),
            uses: v.usesTotal,
            pricedUses: v.usesPriced,
            useWeightedCoveragePercent: Number(((v.usesPriced / (v.usesTotal || 1)) * 100).toFixed(2)),
          },
        ])
      ),
    },
    ahspCoverage: {
      total: (AHSP_2026_CANONICAL as any[]).length,
      ...ahsp,
      fullyPricedPercent: Number(((ahsp.full / ((AHSP_2026_CANONICAL as any[]).length || 1)) * 100).toFixed(2)),
      anyPricePercent: Number(
        (((ahsp.full + ahsp.partial) / ((AHSP_2026_CANONICAL as any[]).length || 1)) * 100).toFixed(2)
      ),
      byDomain: Object.fromEntries([...byDomain.entries()].sort()),
    },
    resourceQuality: quality,
    topMissingComponentKeys: missing.slice(0, 100),
    topMissingComponentKeysByItemCount: [...missingComponentHistogram.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([key, count]) => ({ key, itemCount: count })),
    notes: [
      'Coverage is a measurement, not a target. Unpriced resources are reported, never invented.',
      'Component-key coverage is the share of distinct (code, unit) pairs that have a price.',
      'Use-weighted coverage is the share of actual component OCCURRENCES that have a price.',
    ],
  };

  fs.writeFileSync(path.join(REPORT_DIR, 'coverage_audit.json'), JSON.stringify(report, null, 2));

  console.log('=== PHASE 33/34/35 — COVERAGE AUDIT ===');
  console.log('');
  console.log('--- Component keys (distinct code+unit) ---');
  console.log(
    `  overall      ${totalPriced}/${totalKeys} (${report.componentKeyCoverage.keyCoveragePercent}%)  ` +
      `use-weighted ${usesPriced}/${usesTotal} (${report.componentKeyCoverage.useWeightedCoveragePercent}%)`
  );
  for (const [t, v] of Object.entries(report.componentKeyCoverage.byType)) {
    console.log(
      `  ${t.padEnd(10)} ${String(v.pricedKeys).padStart(4)}/${String(v.keys).padEnd(5)} (${String(v.keyCoveragePercent).padStart(5)}%)  ` +
        `use-weighted ${String(v.useWeightedCoveragePercent).padStart(5)}%`
    );
  }
  console.log('');
  console.log('--- AHSP items ---');
  console.log(`  FULL     ${ahsp.full}`);
  console.log(`  PARTIAL  ${ahsp.partial}`);
  console.log(`  MISSING  ${ahsp.missing}`);
  console.log(`  NO-COMP  ${ahsp.noComponents}`);
  console.log(`  fully priced: ${report.ahspCoverage.fullyPricedPercent}%   any price: ${report.ahspCoverage.anyPricePercent}%`);
  console.log('');
  console.log('--- Resource master quality ---');
  console.log(`  CLEAN ${quality.CLEAN}  SUSPECT ${quality.SUSPECT}  DEFECTIVE ${quality.DEFECTIVE}`);
  console.log('');
  console.log('--- Top 15 unpriced component keys by usage ---');
  for (const m of missing.slice(0, 15)) {
    console.log(`  ${m.type.padEnd(9)} ${String(m.code).padEnd(10)} ${String(m.unit).padEnd(6)} uses=${String(m.usageCount).padStart(5)}  "${String(m.name).slice(0, 52)}"`);
  }
  console.log('');
  console.log('Wrote: data/price2026/reports/coverage_audit.json');
}

main();
