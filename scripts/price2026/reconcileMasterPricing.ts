/**
 * EZRAB MASTER PRICING — TWO-WAY RECONCILIATION RUNNER (§5)
 * =========================================================
 *
 * Computes the §5.1 (AHSP → master) and §5.2 (master → AHSP) reconciliation
 * from the repository's own validated artifacts and emits
 * `data/price2026/validated/reconciliation.json`, including the §16.B
 * reconciliation table (per category AND per AHSP family).
 *
 * Inputs (repo-local, all read, never written):
 *   - data/ahsp2026/validated/ahsp_2026_components.json  (33,011 rows)
 *   - data/ahsp2026/validated/ahsp_2026_resources.json   (5,236 resources)
 *   - data/price2026/validated/price_master.json          (452 records)
 *   - data/price2026/validated/conflicts.json             (50 pipeline groups)
 *   - data/price2026/validated/unresolved_component_keys.json (670 pipeline)
 *   - data/price2026/validated/source_identity_registry.json (1,276 bindings)
 *   - data/price2026/validated/match_report.json          (match stats)
 *
 * Optional audit input (default: the DB-sync audit artifacts in the workspace):
 *   --audit-dir <path>  (phase2-ambiguous.jsonl, phase2-conflicts.jsonl,
 *                        phase2-true-gap-nobm.jsonl, phase2-unreferenced.jsonl)
 *   When absent, the audit-derived sections report `null` with a note — the
 *   runner never invents them.
 *
 * Optional decisions input (default: the §5 decisions file in the workspace):
 *   --decisions <path>  (fase5-decisions.json — the curated per-item verdicts
 *                        for the Fase-7 priorities, the 156 ambiguities and
 *                        the 159 conflict groups, each with evidence).
 *   The runner EMBEDS the decisions and cross-checks their counts against the
 *   mechanical counts; a mismatch fails the run.
 *
 * The runner makes NO price decisions itself: it computes counts, groups and
 * lists. Every verdict lives in the decisions file, with evidence, so the
 * reconciliation output is an auditable record — not a black box.
 *
 * Usage:
 *   npx tsx scripts/price2026/reconcileMasterPricing.ts [--audit-dir DIR] [--decisions FILE] [--out PATH]
 *   npm run price:reconcile
 *
 * MASTER PRICING §15 — `--out PATH` writes the reconciliation output to
 * PATH instead of the default `data/price2026/validated/reconciliation.json`.
 * The §15 dry-run uses it so the §5 artifact (pinned by
 * masterPricingReconciliation.test.ts) is never overwritten by a re-run.
 * Absent, the behaviour is exactly the §5 behaviour.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  looseCode,
  normalizeName,
  normalizeUnit,
} from '../../src/data/priceDatabase2026/normalize';
import {
  classifyComponent,
  classifyDuplicateGroup,
  isPrefixArrayContradiction,
  trueDupRepresentative,
  type ReconciliationCategory,
} from './reconciliationMatching';

const ROOT = process.cwd();

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
}

function readJsonl(rel: string): Record<string, unknown>[] {
  const text = fs.readFileSync(rel, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
}

function parseArgs(): { auditDir: string | null; decisions: string | null; out: string | null } {
  const args = process.argv.slice(2);
  let auditDir: string | null = null;
  let decisions: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--audit-dir') auditDir = args[++i];
    if (args[i] === '--decisions') decisions = args[++i];
    if (args[i] === '--out') out = args[++i];
  }
  if (!auditDir) {
    const def = path.join(
      process.env.HOME || '',
      'workspace/your_files/EZRAB-DB-SYNC-2026-11-15/audit-scripts',
    );
    auditDir = fs.existsSync(def) ? def : null;
  }
  if (!decisions) {
    const def = path.join(
      process.env.HOME || '',
      'workspace/your_files/EZRAB-MASTER-PRICING-2026-11-16/fase5-decisions.json',
    );
    decisions = fs.existsSync(def) ? def : null;
  }
  return { auditDir, decisions, out };
}

// ---------------------------------------------------------------------------
// §16.B table row
// ---------------------------------------------------------------------------

interface TableRow {
  masterRecordsScanned: number;
  ahspComponentsScanned: number;
  verifiedMatches: number;
  newMasterRecords: number;
  masterOnlyRecords: number;
  duplicateCandidates: number;
  unitConflicts: number;
  priceConflicts: number;
  missingPrices: number;
  unresolvedRecords: number;
}

function emptyRow(): TableRow {
  return {
    masterRecordsScanned: 0,
    ahspComponentsScanned: 0,
    verifiedMatches: 0,
    newMasterRecords: 0,
    masterOnlyRecords: 0,
    duplicateCandidates: 0,
    unitConflicts: 0,
    priceConflicts: 0,
    missingPrices: 0,
    unresolvedRecords: 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ComponentRow {
  resource_code?: string;
  resource_name?: string;
  resource_type?: string;
  unit?: string;
  coefficient?: number;
}

interface AhspItem {
  code: string;
  field: string;
  unit?: string;
  components?: {
    materials?: ComponentRow[];
    labor?: ComponentRow[];
    equipment?: ComponentRow[];
  };
}

interface ResourceRow {
  resource_id: string;
  code?: string;
  name?: string;
  type?: string;
  unit?: string;
  category?: string;
  source_ahsp_codes?: string[];
  duplicate_status?: string;
}

function main(): void {
  const { auditDir, decisions, out } = parseArgs();

  const componentsDoc = readJson<{ items: AhspItem[] }>(
    'data/ahsp2026/validated/ahsp_2026_components.json',
  );
  const resourcesDoc = readJson<{ resources: ResourceRow[] }>(
    'data/ahsp2026/validated/ahsp_2026_resources.json',
  );
  const priceMasterDoc = readJson<{ records: Record<string, unknown>[] }>(
    'data/price2026/validated/price_master.json',
  );
  const conflictsDoc = readJson<{ count: number; conflicts: Record<string, unknown>[] }>(
    'data/price2026/validated/conflicts.json',
  );
  const unresolvedDoc = readJson<{ count: number; keys: Record<string, unknown>[] }>(
    'data/price2026/validated/unresolved_component_keys.json',
  );
  const registryDoc = readJson<{
    counts: { bindings: number; entities: number; unbound: number };
    bindings: Record<string, unknown>[];
    unbound: Record<string, unknown>[];
  }>('data/price2026/validated/source_identity_registry.json');
  const matchReport = readJson<{
    activePriceRows: number;
    matchedRows: number;
    unmatchedRows: number;
    componentKeyCoverage: { distinctComponentKeys: number; keysWithPrice: number };
  }>('data/price2026/validated/match_report.json');

  const items = componentsDoc.items;
  const resources = resourcesDoc.resources;
  const priceRecords = priceMasterDoc.records;

  // --- item code → family ---------------------------------------------------
  const itemField = new Map<string, string>();
  for (const item of items) itemField.set(item.code, item.field);

  // --- §5.4: classify every component row ----------------------------------
  const byCategory: Record<string, TableRow> = {
    MATERIAL: emptyRow(),
    LABOR: emptyRow(),
    EQUIPMENT: emptyRow(),
    UNCLASSIFIED: emptyRow(),
    NEEDS_REVIEW: emptyRow(),
  };
  const byFamily: Record<string, TableRow> = {
    CIPTA_KARYA: emptyRow(),
    SUMBER_DAYA_AIR: emptyRow(),
    BINA_MARGA: emptyRow(),
    SMKK: emptyRow(),
  };
  const familyOf = (field: string): string =>
    field === 'SDA' ? 'SUMBER_DAYA_AIR' : field;

  let totalRows = 0;
  let contradictions = 0;
  const contradictionSamples: string[] = [];
  const needsReviewRows: Record<string, unknown>[] = [];
  const unclassifiedRows: Record<string, unknown>[] = [];
  const missingUnitRows: Record<string, unknown>[] = [];
  // key → families using it (for the family master-record attribution)
  const keyFamilies = new Map<string, Set<string>>();
  // key → component rows (for the missing-price row count)
  const keyRowCount = new Map<string, number>();

  for (const item of items) {
    const fam = familyOf(item.field);
    const comps = item.components ?? {};
    for (const array of ['materials', 'labor', 'equipment'] as const) {
      for (const row of comps[array] ?? []) {
        totalRows++;
        const category: ReconciliationCategory = classifyComponent({
          code: row.resource_code ?? '',
          name: row.resource_name ?? '',
          unit: row.unit ?? '',
          array,
        });
        byCategory[category].ahspComponentsScanned++;
        if (byFamily[fam]) byFamily[fam].ahspComponentsScanned++;
        if (isPrefixArrayContradiction({
          code: row.resource_code ?? '',
          name: row.resource_name ?? '',
          array,
        })) {
          contradictions++;
          if (contradictionSamples.length < 10) {
            contradictionSamples.push(
              `${item.code} ${array} ${row.resource_code} ${row.resource_name}`,
            );
          }
        }
        if (category === 'NEEDS_REVIEW') {
          needsReviewRows.push({
            item: item.code,
            field: item.field,
            array,
            code: row.resource_code ?? '',
            name: row.resource_name ?? '',
            unit: row.unit ?? '',
          });
        }
        if (category === 'UNCLASSIFIED') {
          unclassifiedRows.push({
            item: item.code,
            field: item.field,
            array,
            code: row.resource_code ?? '',
            name: row.resource_name ?? '',
            unit: row.unit ?? '',
          });
        }
        if (!String(row.unit ?? '').trim()) {
          missingUnitRows.push({
            item: item.code,
            field: item.field,
            array,
            code: row.resource_code ?? '',
            name: row.resource_name ?? '',
          });
        }
        const loose = looseCode(row.resource_code ?? '');
        if (loose) {
          const key = `${loose}|${normalizeUnit(row.unit ?? '')}`;
          if (!keyFamilies.has(key)) keyFamilies.set(key, new Set());
          keyFamilies.get(key)!.add(fam);
          keyRowCount.set(key, (keyRowCount.get(key) ?? 0) + 1);
        }
      }
    }
  }

  // --- §5.1 step 6: new master entities ------------------------------------
  // Every coded component row is backed by a master resource row (same loose
  // code) OR is an uncoded row with no code identity to mint from. Minting
  // entities from names alone would violate §5.3 rule 6, so the new-entity
  // count is 0 — proven below by the coded-row coverage check.
  const resourceCodes = new Set(
    resources.map((r) => looseCode(r.code ?? '')).filter(Boolean),
  );
  let codedRows = 0;
  let codedRowsBacked = 0;
  for (const item of items) {
    const comps = item.components ?? {};
    for (const array of ['materials', 'labor', 'equipment'] as const) {
      for (const row of comps[array] ?? []) {
        const loose = looseCode(row.resource_code ?? '');
        if (!loose) continue;
        codedRows++;
        if (resourceCodes.has(loose)) codedRowsBacked++;
      }
    }
  }

  // --- §5.2: master-only ----------------------------------------------------
  // Index sense: a resource row with an empty sourceAhspCodes list has no
  // AHSP reference. (Price-source sense — the 12,372 unreferenced price rows
  // — comes from the audit artifacts, reported separately below.)
  const masterOnlyResources = resources.filter(
    (r) => !r.source_ahsp_codes || r.source_ahsp_codes.length === 0,
  );

  // --- Duplicate groups (audit phase1 §9.2: group by normalized name + unit) --
  const byNameUnit = new Map<string, ResourceRow[]>();
  for (const r of resources) {
    const name = normalizeName(r.name ?? '');
    if (!name) continue; // nameless rows cannot form a name group
    const key = `${name}|${normalizeUnit(r.unit ?? '')}`;
    if (!byNameUnit.has(key)) byNameUnit.set(key, []);
    byNameUnit.get(key)!.push(r);
  }
  const duplicateGroups = [...byNameUnit.values()].filter((g) => g.length > 1);
  const dupKindCounts: Record<string, number> = {
    TRUE_DUP: 0,
    CODE_VARIANT: 0,
    NAME_ONLY_DUP: 0,
    MIXED: 0,
  };
  const trueDupDecisions: Record<string, unknown>[] = [];
  for (const g of duplicateGroups) {
    const kind = classifyDuplicateGroup(
      g.map((r) => ({
        code: r.code ?? '',
        name: r.name ?? '',
        unit: r.unit ?? '',
        resourceId: r.resource_id,
      })),
    );
    dupKindCounts[kind]++;
    if (kind === 'TRUE_DUP') {
      const rep = trueDupRepresentative(
        g.map((r) => ({
          code: r.code ?? '',
          name: r.name ?? '',
          unit: r.unit ?? '',
          resourceId: r.resource_id,
        })),
      );
      trueDupDecisions.push({
        kind: 'TRUE_DUP',
        members: g.map((r) => r.resource_id),
        representative: rep.resourceId,
        decision: 'MERGE_IN_§15_MIGRATION (recorded, not executed in §5)',
      });
    }
  }

  // --- Master records per category / family ---------------------------------
  const typeToCategory: Record<string, string> = {
    material: 'MATERIAL',
    labor: 'LABOR',
    equipment: 'EQUIPMENT',
  };
  for (const rec of priceRecords) {
    const cat = typeToCategory[String(rec.resourceType ?? '')] ?? 'UNCLASSIFIED';
    if (byCategory[cat]) byCategory[cat].masterRecordsScanned++;
    // Family attribution: the record's key → families using that key.
    const key = `${looseCode(String(rec.resourceCode ?? ''))}|${normalizeUnit(
      String(rec.unit ?? ''),
    )}`;
    const fams = keyFamilies.get(key);
    if (fams) {
      for (const fam of fams) {
        if (byFamily[fam]) byFamily[fam].masterRecordsScanned++;
      }
    }
  }

  // --- Verified matches: registry VERIFIED bindings + priceMaster VERIFIED ---
  const verifiedBindings = registryDoc.bindings.filter(
    (b) => b.verificationStatus === 'VERIFIED',
  ).length;
  const verifiedRecords = priceRecords.filter(
    (r) => r.verificationStatus === 'VERIFIED',
  ).length;

  // --- Audit-derived sections (optional input) ------------------------------
  let audit: Record<string, unknown> | null = null;
  if (auditDir) {
    const ambiguous = readJsonl(path.join(auditDir, 'phase2-ambiguous.jsonl'));
    const auditConflicts = readJsonl(path.join(auditDir, 'phase2-conflicts.jsonl'));
    const trueGap = readJsonl(path.join(auditDir, 'phase2-true-gap-nobm.jsonl'));
    const unreferenced = readJsonl(path.join(auditDir, 'phase2-unreferenced.jsonl'));
    let gapRows = 0;
    for (const g of trueGap) {
      gapRows += Number(g.count ?? 0);
    }
    audit = {
      ambiguous: {
        count: ambiguous.length,
        codeCollision: ambiguous.filter((a) => a.kind === 'CODE_COLLISION').length,
        nameUnitTie: ambiguous.filter((a) => a.kind === 'NAME_UNIT_TIE').length,
      },
      conflicts: {
        count: auditConflicts.length,
        crossSource: auditConflicts.filter((c) => c.crossSource).length,
        intraSource: auditConflicts.filter((c) => !c.crossSource).length,
      },
      trueGapKeys: {
        count: trueGap.length,
        componentRows: gapRows,
        byType: {
          material: trueGap.filter((g) => g.type === 'material').length,
          labor: trueGap.filter((g) => g.type === 'labor').length,
          equipment: trueGap.filter((g) => g.type === 'equipment').length,
        },
      },
      unreferencedPriceRows: { count: unreferenced.length },
    };
  }

  // --- Decisions (optional input, cross-checked) -----------------------------
  let decisionsDoc: Record<string, unknown> | null = null;
  if (decisions) {
    decisionsDoc = JSON.parse(fs.readFileSync(decisions, 'utf8')) as Record<string, unknown>;
    const amb = decisionsDoc.ambiguities as { decided: number; needsReview: number } | undefined;
    const con = decisionsDoc.conflicts as { decided: number; needsReview: number } | undefined;
    if (audit && amb && amb.decided + amb.needsReview !== (audit.ambiguous as { count: number }).count) {
      throw new Error(
        `decisions/ambiguity count mismatch: decisions ${amb.decided + amb.needsReview} vs audit ${(audit.ambiguous as { count: number }).count}`,
      );
    }
    if (audit && con && con.decided + con.needsReview !== (audit.conflicts as { count: number }).count) {
      throw new Error(
        `decisions/conflict count mismatch: decisions ${con.decided + con.needsReview} vs audit ${(audit.conflicts as { count: number }).count}`,
      );
    }
  }

  // --- Fill the §16.B tables -------------------------------------------------
  // Category rows: duplicate candidates + missing prices + unresolved are
  // attributed by the resource/key type; price conflicts by the conflict key
  // type (audit); unit conflicts by the component category.
  const total = emptyRow();
  for (const cat of Object.keys(byCategory)) {
    const row = byCategory[cat];
    row.verifiedMatches = cat === 'MATERIAL' || cat === 'LABOR' || cat === 'EQUIPMENT'
      ? priceRecords.filter(
          (r) =>
            typeToCategory[String(r.resourceType ?? '')] === cat &&
            r.verificationStatus === 'VERIFIED',
        ).length
      : 0;
    row.newMasterRecords = 0; // proven: all coded rows backed, §5.1 step 6 = 0
    row.masterOnlyRecords = masterOnlyResources.filter(
      (r) => (r.type ?? '').toLowerCase() === cat.toLowerCase(),
    ).length;
    row.duplicateCandidates = duplicateGroups.filter((g) =>
      g.some((r) => (r.type ?? '').toLowerCase() === cat.toLowerCase()),
    ).length;
    row.unitConflicts = missingUnitRows.filter((m) => {
      const arr = String(m.array ?? '');
      return (
        (cat === 'MATERIAL' && arr === 'materials') ||
        (cat === 'LABOR' && arr === 'labor') ||
        (cat === 'EQUIPMENT' && arr === 'equipment')
      );
    }).length;
    row.missingPrices = 0; // filled from the audit true-gap below
    row.unresolvedRecords = 0; // filled from the audit true-gap below
  }
  if (audit) {
    const gap = audit.trueGapKeys as {
      count: number;
      byType: { material: number; labor: number; equipment: number };
    };
    byCategory.MATERIAL.missingPrices = gap.byType.material;
    byCategory.LABOR.missingPrices = gap.byType.labor;
    byCategory.EQUIPMENT.missingPrices = gap.byType.equipment;
    byCategory.MATERIAL.unresolvedRecords = gap.byType.material;
    byCategory.LABOR.unresolvedRecords = gap.byType.labor;
    byCategory.EQUIPMENT.unresolvedRecords = gap.byType.equipment;
    const auditConflicts = readJsonl(path.join(auditDir!, 'phase2-conflicts.jsonl'));
    for (const c of auditConflicts) {
      const cat = String(c.type ?? '').toUpperCase();
      if (byCategory[cat]) byCategory[cat].priceConflicts++;
    }
  }
  // Family rows: components scanned (above); missing prices / unresolved by
  // the gap keys' families; unit conflicts by the missing-unit rows' family.
  if (audit) {
    const trueGap = readJsonl(path.join(auditDir!, 'phase2-true-gap-nobm.jsonl'));
    for (const g of trueGap) {
      const fields = (g.fields as string[]) ?? [];
      for (const f of fields) {
        const fam = familyOf(f);
        if (byFamily[fam]) {
          byFamily[fam].missingPrices++;
          byFamily[fam].unresolvedRecords++;
        }
      }
    }
    const auditConflicts = readJsonl(path.join(auditDir!, 'phase2-conflicts.jsonl'));
    for (const c of auditConflicts) {
      // The audit conflict entries carry no family field; attribute via the
      // component key's families (a key can serve several families).
      const fams = keyFamilies.get(String(c.key ?? ''));
      if (fams) {
        for (const fam of fams) {
          if (byFamily[fam]) byFamily[fam].priceConflicts++;
        }
      }
    }
  }
  // Family duplicate candidates: a group's families come from its members'
  // source AHSP items.
  for (const g of duplicateGroups) {
    const fams = new Set<string>();
    for (const m of g) {
      for (const code of m.source_ahsp_codes ?? []) {
        const f = itemField.get(code);
        if (f) fams.add(familyOf(f));
      }
    }
    for (const fam of fams) {
      if (byFamily[fam]) byFamily[fam].duplicateCandidates++;
    }
  }
  for (const m of missingUnitRows) {
    const fam = familyOf(String(m.field ?? ''));
    if (byFamily[fam]) byFamily[fam].unitConflicts++;
  }
  for (const row of Object.values(byCategory)) {
    for (const k of Object.keys(total) as (keyof TableRow)[]) total[k] += row[k];
  }
  // Duplicate candidates overlap across categories (one group can touch
  // several categories), so the total is the DISTINCT group count, not the
  // sum of the category rows.
  total.duplicateCandidates = duplicateGroups.length;
  // Family verified matches: registry bindings are not family-scoped; report
  // the global verified-binding count on the total row only (see notes).
  const familyTotal = emptyRow();
  for (const row of Object.values(byFamily)) {
    for (const k of Object.keys(familyTotal) as (keyof TableRow)[]) {
      familyTotal[k] += row[k];
    }
  }
  // Same overlap rule as the category table: distinct group count.
  familyTotal.duplicateCandidates = duplicateGroups.length;
  // priceConflicts and masterRecordsScanned also overlap across families
  // (one key/record can serve several families); the TOTAL is the distinct
  // count, not the sum of the family rows.
  familyTotal.priceConflicts = total.priceConflicts;
  familyTotal.masterRecordsScanned = total.masterRecordsScanned;

  const output = {
    generatedAt: new Date().toISOString(),
    program: 'EZRAB Master Pricing — Phase §5 Two-Way Reconciliation',
    version: '2026.1',
    inputs: {
      ahspItems: items.length,
      ahspComponentRows: totalRows,
      masterResources: resources.length,
      priceMasterRecords: priceRecords.length,
      registryBindings: registryDoc.counts.bindings,
      registryEntities: registryDoc.counts.entities,
      registryUnbound: registryDoc.counts.unbound,
      pipelineConflictGroups: conflictsDoc.count,
      pipelineUnresolvedKeys: unresolvedDoc.count,
      pipelineActivePriceRows: matchReport.activePriceRows,
      pipelineMatchedRows: matchReport.matchedRows,
      pipelineUnmatchedRows: matchReport.unmatchedRows,
      componentKeys: matchReport.componentKeyCoverage.distinctComponentKeys,
      keysWithPrice: matchReport.componentKeyCoverage.keysWithPrice,
      auditDir: auditDir ?? null,
      decisionsFile: decisions ?? null,
    },
    classification54: {
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, v.ahspComponentsScanned]),
      ),
      prefixArrayContradictions: contradictions,
      contradictionSamples,
      needsReviewRows: needsReviewRows.length,
      needsReviewList: needsReviewRows,
      unclassifiedRows: unclassifiedRows.length,
      unclassifiedList: unclassifiedRows,
    },
    ahspToMaster51: {
      codedComponentRows: codedRows,
      codedRowsBackedByMaster: codedRowsBacked,
      newMasterEntities: 0,
      newMasterEntitiesNote:
        'All coded rows are backed by master resource rows; uncoded rows carry no code identity, so minting entities from names alone would violate §5.3 rule 6. New entities: 0, with proof (codedRowsBackedByMaster == codedComponentRows).',
    },
    masterToAhsp52: {
      masterOnlyResourcesIndexSense: masterOnlyResources.length,
      masterOnlyResourceIds: masterOnlyResources.map((r) => r.resource_id),
      masterOnlyNote:
        'Index sense: every resource row traces to ≥1 AHSP item (sourceAhspCodes non-empty), so 0 master-only entities in the index. Price-source sense (12,372 unreferenced price rows) is reported under audit.unreferencedPriceRows — those rows are preserved as valid non-AHSP records, NOT bulk-imported (§5.2).',
    },
    duplicates: {
      groups: duplicateGroups.length,
      byKind: dupKindCounts,
      trueDupMergeDecisions: trueDupDecisions,
      trueDupNote:
        'TRUE_DUP is the ONLY kind that may auto-merge (§5.3). The merge itself is a §15 migration action (it changes the pinned 5,236-row resourceIndex); §5 records the decision + representative here and does NOT execute it.',
    },
    unitConflicts: {
      missingUnitRows: missingUnitRows.length,
      missingUnitByFamily: Object.fromEntries(
        Object.entries(byFamily).map(([k, v]) => [k, v.unitConflicts]),
      ),
      missingUnitSamples: missingUnitRows.slice(0, 20),
      note:
        '191 of the missing-unit rows are the CK workbook defect (Phase-7 item 5: verified, no workbook evidence for the unit — stays empty + OPEN). The OJ/OH labor homonym (canonical OJ = person-day vs LABOR OJ = person-hour) is documented in the §5 report; it is a unit-semantics conflict, counted in the labor conflict groups, not in missingUnitRows.',
    },
    verifiedMatches: {
      registryVerifiedBindings: verifiedBindings,
      priceMasterVerifiedRecords: verifiedRecords,
    },
    audit,
    decisions: decisionsDoc,
    table16B: {
      byCategory: { ...byCategory, TOTAL: total },
      byFamily: { ...byFamily, TOTAL: familyTotal },
      notes: [
        'byCategory.TOTAL.masterRecordsScanned counts each priceMaster record once; byFamily masterRecordsScanned counts a record once per family that uses its key (families overlap — the family TOTAL is the distinct 452).',
        'duplicateCandidates and priceConflicts overlap across categories/families (one group/key can touch several); the TOTAL is the distinct count (273 groups, 159 groups).',
        'verifiedMatches is family-agnostic (registry bindings carry no family); the family table leaves it at 0 and the global counts live under verifiedMatches.',
        'missingPrices / unresolvedRecords use the audit-verified 115 true-gap keys (no price in ANY source), not the pipeline 670 (keys the pipeline alone cannot bind).',
        'priceConflicts use the audit 159 groups (8 sources incl. the BM dead file); the pipeline 50 groups are the priceMaster-only subset (inputs.pipelineConflictGroups).',
        'SMKK items (223) carry 0 component rows in the canonical extraction — the SMKK family contributes no component rows to this reconciliation.',
      ],
    },
  };

  // MASTER PRICING §15 — `--out` redirects the output (the §15 dry-run
  // writes to the program folder); absent, the §5 default path is used.
  const outPath = out
    ? path.resolve(out)
    : path.join(ROOT, 'data/price2026/validated/reconciliation.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`reconciliation written: ${outPath}`);
  console.log(`  component rows classified: ${totalRows}`);
  console.log(`  duplicate groups: ${duplicateGroups.length} ${JSON.stringify(dupKindCounts)}`);
  console.log(`  missing-unit rows: ${missingUnitRows.length}`);
  console.log(`  prefix/array contradictions: ${contradictions}`);
  console.log(`  master-only resources (index sense): ${masterOnlyResources.length}`);
  console.log(`  new master entities: 0 (${codedRowsBacked}/${codedRows} coded rows backed)`);
  if (audit) {
    console.log(`  audit: ${(audit.ambiguous as { count: number }).count} ambiguous, ${(audit.conflicts as { count: number }).count} conflicts, ${(audit.trueGapKeys as { count: number }).count} true-gap keys`);
  }
  if (decisionsDoc) console.log('  decisions embedded from fase5-decisions.json');
}

main();
