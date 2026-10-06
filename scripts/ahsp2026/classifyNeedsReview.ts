/**
 * NEEDS-REVIEW CLASSIFICATION (§12, §13) — Phase 0.5.
 *
 * Reads the validated master layer and partitions every NEEDS_REVIEW record into
 * one of five actionable buckets, then classifies every duplicate group.
 *
 * Outputs → data/ahsp2026/forensic/needs_review/*.json
 *           data/ahsp2026/forensic/duplicate_classification.json
 *
 * Usage: npx tsx scripts/ahsp2026/classifyNeedsReview.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AHSPItem } from './types';

const ROOT = process.cwd();
const VAL = path.join(ROOT, 'data', 'ahsp2026', 'validated');
const REP = path.join(ROOT, 'data', 'ahsp2026', 'reports');
const OUT = path.join(ROOT, 'data', 'ahsp2026', 'forensic', 'needs_review');

const write = (name: string, obj: unknown) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1));
  console.log(`  -> forensic/needs_review/${name}`);
};

const LABOR_WORDS = /\b(Pekerja|Mandor|Tukang|Kepala Tukang|Operator|Supir|Kenek|Juru Ukur)\b/gi;
const looksMerged = (n: string) => ((n.match(LABOR_WORDS) || []).length > 1);

const ncode = (c: string) => String(c ?? '').trim().toLowerCase().replace(/[\s()]/g, '');

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const master = JSON.parse(fs.readFileSync(path.join(VAL, 'ahsp_2026_master.json'), 'utf8'));
  const items: AHSPItem[] = master.items;
  const review = items.filter((i) => i.validation.status === 'NEEDS_REVIEW');

  const comps = (i: AHSPItem) => [...i.components.labor, ...i.components.materials, ...i.components.equipment];
  const slim = (i: AHSPItem) => ({
    id: i.id, code: i.code, field: i.field, unit: i.unit, page: i.source.page,
    attachment: i.source.attachment, description: i.description,
    issues: i.validation.issues,
  });

  /* ---------- bucket 1 — possible duplicates ---------- */
  const possibleDup = review.filter((i) => i.validation.issues.includes('POSSIBLE_DUPLICATE'));
  write('possible_duplicates.json', {
    bucket: 'POSSIBLE_DUPLICATES',
    definition: 'NEEDS_REVIEW records flagged POSSIBLE_DUPLICATE (identical description ≥50 chars, or identical component signature ≥3 rows, within the same field).',
    count: possibleDup.length,
    records: possibleDup.map(slim),
  });

  /* ---------- bucket 2 — no components in source ---------- */
  const noComp = review.filter((i) => comps(i).length === 0);
  write('no_components.json', {
    bucket: 'NO_COMPONENTS',
    definition: 'The source prints the item (code/description/unit) but no analysis table with components exists in the annex.',
    count: noComp.length,
    by_field: noComp.reduce<Record<string, number>>((a, i) => { a[i.field] = (a[i.field] ?? 0) + 1; return a; }, {}),
    records: noComp.map(slim),
  });

  /* ---------- bucket 3 — index-only (listed but no analysis) ---------- */
  const indexOnly = review.filter((i) =>
    i.validation.issues.some((s) =>
      /listed in DAFTAR ISI/i.test(s) ||
      /listed in the Lampiran V code index/i.test(s) ||
      /inventory-only record/i.test(s) ||
      /header-only entry/i.test(s)));
  write('index_only.json', {
    bucket: 'INDEX_ONLY',
    definition: 'The item is published in the annex\'s own index but no matching analysis table was located in the body.',
    count: indexOnly.length,
    by_field: indexOnly.reduce<Record<string, number>>((a, i) => { a[i.field] = (a[i.field] ?? 0) + 1; return a; }, {}),
    records: indexOnly.map(slim),
  });

  /* ---------- bucket 4 — suspect merged resource names ---------- */
  const merged: any[] = [];
  for (const i of review) {
    for (const c of comps(i)) {
      if (looksMerged(c.resource_name)) {
        merged.push({ ...slim(i), component: { code: c.resource_code, name: c.resource_name, unit: c.unit, coefficient_raw: c.coefficient_raw, page: c.source_page } });
        break;
      }
    }
  }
  write('merged_resource_names.json', {
    bucket: 'MERGED_RESOURCE_NAMES',
    definition: 'A component row carries two labour resources in one name — a two-column layout artefact (e.g. "Mandor … Pekerja"). The row is kept verbatim; the split is NOT guessed.',
    count: merged.length,
    records: merged,
  });

  /* ---------- bucket 5 — missing units ---------- */
  const noUnit = review.filter((i) => !i.unit || !i.unit.trim());
  write('missing_units.json', {
    bucket: 'MISSING_UNITS',
    definition: 'The item has no SATUAN in the source.',
    count: noUnit.length,
    by_field: noUnit.reduce<Record<string, number>>((a, i) => { a[i.field] = (a[i.field] ?? 0) + 1; return a; }, {}),
    records: noUnit.map(slim),
  });

  /* ---------- index ---------- */
  const buckets = {
    POSSIBLE_DUPLICATES: possibleDup.length,
    NO_COMPONENTS: noComp.length,
    INDEX_ONLY: indexOnly.length,
    MERGED_RESOURCE_NAMES: merged.length,
    MISSING_UNITS: noUnit.length,
  };
  const classified = new Set<string>([
    ...possibleDup.map((i) => i.id), ...noComp.map((i) => i.id), ...indexOnly.map((i) => i.id),
    ...merged.map((m: any) => m.id), ...noUnit.map((i) => i.id),
  ]);
  const other = review.filter((i) => !classified.has(i.id));

  write('_summary.json', {
    generated_at: new Date().toISOString(),
    total_items: items.length,
    needs_review: review.length,
    buckets,
    other_needs_review: other.length,
    other_sample: other.slice(0, 50).map(slim),
    note: 'A record can appear in more than one bucket; the buckets are diagnostic, not exclusive.',
  });

  /* ---------- §13 duplicate classification ---------- */
  const dupFile = path.join(REP, 'ahsp_duplicates.json');
  const dup = fs.existsSync(dupFile) ? JSON.parse(fs.readFileSync(dupFile, 'utf8')) : { groups: [] };
  const byId = new Map(items.map((i) => [i.id, i]));

  const classifiedDup = (dup.groups as any[]).map((g) => {
    const members = (g.ids as string[]).map((id) => byId.get(id)).filter(Boolean) as AHSPItem[];
    const codes = new Set(members.map((m) => ncode(m.code)));
    const fields = new Set(members.map((m) => m.field));
    const atts = new Set(members.map((m) => m.source.attachment));
    const sigs = new Set(members.map((m) => comps(m).map((c) => `${c.resource_code}:${c.coefficient_raw}`).join('|')));

    let klass: string;
    if (g.status === 'exact_duplicate' && codes.size === 1 && fields.size === 1) {
      klass = atts.size > 1 ? 'SOURCE_VARIANT' : 'TRUE_DUPLICATE';
    } else if (codes.size === 1 && fields.size > 1) {
      klass = 'SAME_CODE_DIFFERENT_CONTEXT';
    } else if (sigs.size > 1) {
      klass = 'SIMILAR_BUT_DIFFERENT';
    } else if (codes.size > 1 && sigs.size === 1) {
      klass = 'TRUE_DUPLICATE';
    } else {
      klass = 'UNRESOLVED';
    }
    return {
      key: g.key, detector_status: g.status, detail: g.detail,
      classification: klass,
      field: g.field,
      members: members.map((m) => ({ id: m.id, code: m.code, field: m.field, attachment: m.source.attachment, unit: m.unit, page: m.source.page, description: m.description.slice(0, 120) })),
    };
  });

  const kcount: Record<string, number> = {};
  for (const g of classifiedDup) kcount[g.classification] = (kcount[g.classification] ?? 0) + 1;

  fs.writeFileSync(path.join(ROOT, 'data', 'ahsp2026', 'forensic', 'duplicate_classification.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    total_groups: classifiedDup.length,
    by_classification: kcount,
    legend: {
      TRUE_DUPLICATE: 'Same code, same field, same content — the source genuinely repeats the item.',
      SAME_CODE_DIFFERENT_CONTEXT: 'Same code in two different fields — the numbering is per-field, so this is expected, not a defect.',
      SIMILAR_BUT_DIFFERENT: 'Same description/signature key but the component sets differ — distinct items that look alike.',
      SOURCE_VARIANT: 'Same code in the same field but from different attachments.',
      UNRESOLVED: 'Could not be decided from the data alone; needs a human read of the source page.',
    },
    groups: classifiedDup,
  }, null, 1));

  console.log('='.repeat(72));
  console.log('NEEDS-REVIEW CLASSIFICATION');
  console.log('='.repeat(72));
  console.log(`  needs_review records : ${review.length}`);
  for (const [k, v] of Object.entries(buckets)) console.log(`    ${k.padEnd(22)}: ${v}`);
  console.log(`    (unbucketed)          : ${other.length}`);
  console.log(`  duplicate groups      : ${classifiedDup.length}`);
  for (const [k, v] of Object.entries(kcount)) console.log(`    ${k.padEnd(28)}: ${v}`);
}

main();
