/**
 * EZRAB PRICE 2026 — PHASE 2 (resource master audit) + PHASE 6 (source audit)
 * ==========================================================================
 * Read-only. Writes:
 *   data/price2026/reports/resource_audit.json
 *   data/price2026/reports/price_source_audit.json
 *   PRICE_RESOURCE_AUDIT.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { AHSP_2026_CANONICAL_RESOURCES } from '../../src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated';
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import { classifyResource, looseCode, normalizeUnit } from './core';
import { PRICE_SOURCES, ACTIVE_SOURCES, EXCLUDED_SOURCES } from './sources.config';
import { readAllSourceRows } from './normalizePrices';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data', 'price2026', 'reports');

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function pct(n: number, d: number): string {
  if (!d) return '0,0%';
  return ((n / d) * 100).toFixed(1).replace('.', ',') + '%';
}

function main() {
  ensureDir(OUT_DIR);

  const raw = AHSP_2026_CANONICAL_RESOURCES as any[];
  const items = AHSP_2026_CANONICAL as any[];

  // ---------------------------------------------------------------- resources
  const audited = raw.map(classifyResource);

  const byClass = new Map<string, number>();
  const byQuality = new Map<string, number>();
  const byClassQuality = new Map<string, Map<string, number>>();
  const issueCount = new Map<string, number>();
  const unitHistogram = new Map<string, number>();

  for (const r of audited) {
    byClass.set(r.classification, (byClass.get(r.classification) || 0) + 1);
    byQuality.set(r.quality, (byQuality.get(r.quality) || 0) + 1);
    if (!byClassQuality.has(r.classification)) byClassQuality.set(r.classification, new Map());
    const m = byClassQuality.get(r.classification)!;
    m.set(r.quality, (m.get(r.quality) || 0) + 1);
    for (const i of r.issues) {
      const key = i.split(':')[0];
      issueCount.set(key, (issueCount.get(key) || 0) + 1);
    }
    unitHistogram.set(r.unit || '(empty)', (unitHistogram.get(r.unit || '(empty)') || 0) + 1);
  }

  const unknown = audited.filter((r) => r.classification === 'UNKNOWN');
  const defective = audited.filter((r) => r.quality === 'DEFECTIVE');
  const suspect = audited.filter((r) => r.quality === 'SUSPECT');
  const clean = audited.filter((r) => r.quality === 'CLEAN');
  const priceable = audited.filter((r) => r.quality !== 'DEFECTIVE' && r.classification !== 'UNKNOWN');

  // duplicate resource names (look-alike) — never auto-merged
  const byLooseName = new Map<string, number>();
  for (const r of audited) {
    const k = (r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + r.unit;
    if (!k || k === '|') continue;
    byLooseName.set(k, (byLooseName.get(k) || 0) + 1);
  }
  const lookAlike = [...byLooseName.entries()].filter(([, n]) => n > 1);

  // -------------------------------------------------- component coverage stats
  const componentCodeKeys = new Map<string, { type: string; code: string; unit: string; name: string; count: number }>();
  let totalComponents = 0;
  for (const it of items) {
    for (const [type, comps] of [
      ['labor', it.laborComponents || []],
      ['material', it.materialComponents || []],
      ['equipment', it.equipmentComponents || []],
    ] as const) {
      for (const c of comps as any[]) {
        totalComponents++;
        const code = String(c.code || '');
        if (!code) continue;
        const unit = String(c.unit || '');
        const key = looseCode(code) + '|' + normalizeUnit(unit);
        const prev = componentCodeKeys.get(key);
        if (prev) prev.count++;
        else componentCodeKeys.set(key, { type, code, unit, name: String(c.name || ''), count: 1 });
      }
    }
  }

  const resourceCodeSet = new Set(audited.filter((r) => r.code).map((r) => looseCode(r.code)));
  let componentKeysWithResource = 0;
  let componentRowsWithResource = 0;
  for (const [key, v] of componentCodeKeys) {
    const code = key.split('|')[0];
    if (resourceCodeSet.has(code)) {
      componentKeysWithResource++;
      componentRowsWithResource += v.count;
    }
  }

  // ------------------------------------------------------------------ sources
  const sourceRows = readAllSourceRows();
  const sourceAudit = PRICE_SOURCES.map((s) => {
    const rows = sourceRows.filter((r) => r.sourceKey === s.key);
    const units = new Map<string, number>();
    const types = new Map<string, number>();
    let withPrice = 0;
    let nonPositive = 0;
    for (const r of rows) {
      units.set(r.unit, (units.get(r.unit) || 0) + 1);
      types.set(r.resourceType, (types.get(r.resourceType) || 0) + 1);
      if (r.price > 0) withPrice++;
      else nonPositive++;
    }
    return {
      key: s.key,
      label: s.label,
      origin: s.origin,
      tier: s.tier,
      priority: s.priority,
      active: s.active,
      verificationStatus: s.verificationStatus,
      sourceDocument: s.sourceDocument,
      locationLevel: s.locationLevel,
      rows: rows.length,
      rowsWithPositivePrice: withPrice,
      rowsNonPositive: nonPositive,
      unitHistogram: Object.fromEntries([...units.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)),
      typeHistogram: Object.fromEntries(types),
      notes: s.notes,
    };
  });

  // ------------------------------------------------------------------- write
  const resourceReport = {
    generatedAt: new Date().toISOString(),
    canonicalAhspItems: items.length,
    canonicalResources: raw.length,
    classification: Object.fromEntries(byClass),
    quality: Object.fromEntries(byQuality),
    classificationByQuality: Object.fromEntries(
      [...byClassQuality.entries()].map(([k, v]) => [k, Object.fromEntries(v)])
    ),
    priceableResources: priceable.length,
    unknownResources: unknown.length,
    defectiveResources: defective.length,
    suspectResources: suspect.length,
    cleanResources: clean.length,
    issueHistogram: Object.fromEntries([...issueCount.entries()].sort((a, b) => b[1] - a[1])),
    unitHistogram: Object.fromEntries([...unitHistogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)),
    lookAlikeNameGroups: lookAlike.length,
    componentRows: totalComponents,
    componentDistinctKeys: componentCodeKeys.size,
    componentKeysBackedByResource: componentKeysWithResource,
    componentRowsBackedByResource: componentRowsWithResource,
    samples: {
      unknown: unknown.slice(0, 20).map((r) => ({ code: r.code, name: r.name, unit: r.unit, issues: r.issues })),
      defective: defective.slice(0, 25).map((r) => ({ code: r.code, name: r.name, unit: r.unit, issues: r.issues })),
    },
  };

  const sourceReport = {
    generatedAt: new Date().toISOString(),
    totalRegisteredSources: PRICE_SOURCES.length,
    activeSources: ACTIVE_SOURCES.length,
    excludedSources: EXCLUDED_SOURCES.length,
    activeRowCount: sourceRows.filter((r) => r.active).length,
    excludedRowCount: sourceRows.filter((r) => !r.active).length,
    sources: sourceAudit,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'resource_audit.json'), JSON.stringify(resourceReport, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'price_source_audit.json'), JSON.stringify(sourceReport, null, 2));

  // ------------------------------------------------------------------ markdown
  const md: string[] = [];
  md.push('# PRICE RESOURCE AUDIT');
  md.push('');
  md.push(`Generated: ${resourceReport.generatedAt}  `);
  md.push('Scope: canonical AHSP resource master (PHASE 2) + every price source in the repository (PHASE 6).  ');
  md.push('The canonical AHSP is **not modified** by this audit.');
  md.push('');
  md.push('## 1. Canonical resource master — actual numbers');
  md.push('');
  md.push('| metric | value |');
  md.push('|---|---:|');
  md.push(`| canonical AHSP items | ${items.length} |`);
  md.push(`| canonical resources | ${raw.length} |`);
  md.push(`| — material | ${byClass.get('MATERIAL') || 0} |`);
  md.push(`| — labor | ${byClass.get('LABOR') || 0} |`);
  md.push(`| — equipment | ${byClass.get('EQUIPMENT') || 0} |`);
  md.push(`| — **UNKNOWN** | **${unknown.length}** |`);
  md.push('');
  md.push('## 2. Resource row quality');
  md.push('');
  md.push('| quality | rows | meaning |');
  md.push('|---|---:|---|');
  md.push(`| CLEAN | ${clean.length} | usable |`);
  md.push(`| SUSPECT | ${suspect.length} | usable but flagged (NEEDS_REVIEW on match) |`);
  md.push(`| **DEFECTIVE** | **${defective.length}** | mis-extracted from the PDF — never priced |`);
  md.push('');
  md.push('### 2.1 Classification × quality');
  md.push('');
  md.push('| classification | CLEAN | SUSPECT | DEFECTIVE |');
  md.push('|---|---:|---:|---:|');
  for (const [cls, m] of byClassQuality) {
    md.push(`| ${cls} | ${m.get('CLEAN') || 0} | ${m.get('SUSPECT') || 0} | ${m.get('DEFECTIVE') || 0} |`);
  }
  md.push('');
  md.push('### 2.2 Defect histogram');
  md.push('');
  md.push('| issue | rows |');
  md.push('|---|---:|');
  for (const [k, v] of [...issueCount.entries()].sort((a, b) => b[1] - a[1])) {
    md.push(`| ${k} | ${v} |`);
  }
  md.push('');
  md.push('### 2.3 Sample defective rows');
  md.push('');
  md.push('| code | unit | name (truncated) | issues |');
  md.push('|---|---|---|---|');
  for (const r of defective.slice(0, 20)) {
    md.push(`| \`${r.code || '—'}\` | ${r.unit} | ${r.name.slice(0, 50).replace(/\|/g, '/')} | ${r.issues.join(', ')} |`);
  }
  md.push('');
  md.push('> **UNKNOWN classification ⇒ NEEDS_REVIEW and no price** (PHASE 2 requirement).');
  md.push(`> Priceable resources (not UNKNOWN, not DEFECTIVE): **${priceable.length} / ${raw.length}** (${pct(priceable.length, raw.length)}).`);
  md.push('');
  md.push('## 3. Component → resource traceability');
  md.push('');
  md.push('| metric | value |');
  md.push('|---|---:|');
  md.push(`| component rows in canonical AHSP | ${totalComponents} |`);
  md.push(`| distinct (code,unit) keys | ${componentCodeKeys.size} |`);
  md.push(`| keys whose code exists in the resource master | ${componentKeysWithResource} (${pct(componentKeysWithResource, componentCodeKeys.size)}) |`);
  md.push(`| component rows backed by a resource | ${componentRowsWithResource} (${pct(componentRowsWithResource, totalComponents)}) |`);
  md.push('');
  md.push('## 4. Price sources in the repository (PHASE 6)');
  md.push('');
  md.push('| key | tier | prio | active | rows | positive | unit space | doc |');
  md.push('|---|---|---:|---|---:|---:|---|---|');
  for (const s of sourceAudit) {
    const units = Object.keys(s.unitHistogram).slice(0, 4).join(' ');
    md.push(
      `| \`${s.key}\` | ${s.tier} | ${s.priority} | ${s.active ? 'yes' : '**NO**'} | ${s.rows} | ${s.rowsWithPositivePrice} | ${units} | ${s.sourceDocument || '—'} |`
    );
  }
  md.push('');
  md.push('### 4.1 Source notes');
  md.push('');
  for (const s of sourceAudit) {
    md.push(`- **${s.key}** — ${s.notes}`);
  }
  md.push('');
  md.push('## 5. Unit histogram (canonical resources)');
  md.push('');
  md.push('| unit | rows |');
  md.push('|---|---:|');
  for (const [u, n] of [...unitHistogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    md.push(`| ${u} | ${n} |`);
  }
  md.push('');
  md.push('## 6. Look-alike resource names');
  md.push('');
  md.push(`Groups sharing a normalized (name, unit): **${lookAlike.length}**. These are FLAGGED, never auto-merged (PHASE 17 / rule 9).`);
  md.push('');
  md.push('**END OF RESOURCE AUDIT.**');
  md.push('');

  fs.writeFileSync(path.join(ROOT, 'PRICE_RESOURCE_AUDIT.md'), md.join('\n'));

  // ------------------------------------------------------------------ console
  console.log('=== PHASE 2 — RESOURCE MASTER AUDIT ===');
  console.log('canonical AHSP items :', items.length);
  console.log('canonical resources  :', raw.length);
  console.log('classification       :', JSON.stringify(Object.fromEntries(byClass)));
  console.log('quality              :', JSON.stringify(Object.fromEntries(byQuality)));
  console.log('priceable            :', priceable.length);
  console.log('UNKNOWN              :', unknown.length, '(→ NEEDS_REVIEW, no price)');
  console.log('DEFECTIVE            :', defective.length);
  console.log('look-alike groups    :', lookAlike.length);
  console.log('component rows       :', totalComponents, '| keys:', componentCodeKeys.size);
  console.log('rows backed by resource:', componentRowsWithResource, `(${pct(componentRowsWithResource, totalComponents)})`);
  console.log('');
  console.log('=== PHASE 6 — PRICE SOURCE AUDIT ===');
  for (const s of sourceAudit) {
    console.log(
      `  ${s.active ? 'ACTIVE ' : 'EXCLUDE'} ${s.key.padEnd(22)} rows=${String(s.rows).padStart(5)} pos=${String(s.rowsWithPositivePrice).padStart(5)} tier=${s.tier}`
    );
  }
  console.log('');
  console.log('Wrote: data/price2026/reports/resource_audit.json');
  console.log('Wrote: data/price2026/reports/price_source_audit.json');
  console.log('Wrote: PRICE_RESOURCE_AUDIT.md');
}

main();
