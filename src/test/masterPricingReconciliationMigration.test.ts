/**
 * MASTER PRICING §15 — INITIAL RECONCILIATION AND MIGRATION (§15.1–§15.17).
 *
 * Run: npx vitest run src/test/masterPricingReconciliationMigration.test.ts
 *
 * What is pinned here (and why each pin exists):
 * - §15.1–§15.2 dry-run counts: the §15 dry-run (`npm run price:reconcile
 *   -- --out <program>/fase15-dryrun-reconciliation.json`, plus
 *   `price:sync -- --dry-run` = NO-OP) REPRODUCED the §5 reconciliation
 *   byte-identically modulo `generatedAt` — so this suite pins the same
 *   §16.B numbers from the repo artifact (`data/price2026/validated/
 *   reconciliation.json`, never overwritten by the dry-run): 899 records,
 *   33,011 rows, 270 duplicate groups, 2 unit conflicts, 159 price
 *   conflicts, 115 missing prices / unresolved. Before == after, because
 *   the migration applied ZERO data changes (see below).
 * - §15.2 identification: the 88 TRUE_DUP decisions (representative
 *   always one of the group's own members), the 115 true-gap keys, the
 *   2 missing-unit rows (all CK), the 159 audit conflict groups
 *   (153 cross-source / 6 intra-source).
 * - §15.3 no historical rewrite: SNAPSHOT locked (delta 0), OVERRIDE
 *   covered components frozen, LIVE moves (the control — the machinery
 *   works; only frozen states are protected), and explicit adoption
 *   creates a NEW version while the old version keeps the old items
 *   (§10 machinery, fixture numbers shared with §9/§14).
 * - §15.4–§15.5 migration-plan validation: the SAFE migration set is
 *   EMPTY. Every candidate needs an owner decision (88 TRUE_DUP merges,
 *   4 FASE5 alias rules, 6 M-4-blocked bindings) — so this suite pins
 *   that NONE was applied: the approved-alias table is still empty,
 *   priceMaster is still 899 records, the resource index is still
 *   5,185 rows, the sync state is NO_OP with identical digests, and no
 *   priceMaster record carries a 0 price. A migration that changed
 *   data without owner approval would fail these pins.
 * - §15.6 unresolved preserved, labelled: a sample of the 115 true-gap
 *   keys resolves NOT_FOUND with a null price (never Rp0); the M293
 *   phantom price never resolves; EI734/EI374 are REFUSED with their
 *   alternatives listed; M170|L and E17|jam resolve WITH their
 *   NEEDS_REVIEW flags attached (flagged, never silent). The two keys
 *   that newly resolve since §5 (M170|m3, M21|m3) are pinned WITH the
 *   documented §6/§7 rule that resolves them — the change is visible,
 *   not hidden: 113 NOT_FOUND / 2 RESOLVED at runtime (was 111/4 in
 *   §5; the 4 unsafe §5 resolutions were closed by the §6 name gate
 *   and the §6 REFUSE rule).
 * - §15.7 initial master price resolution + all four families read the
 *   canonical source: runtime index 4,489 records, 121/791 keys
 *   priced, and one FULL item per family resolved through
 *   priceResolver2026 with a named official source (CK 1.1.1.1,
 *   BM B.1, SDA A.1.01.a.1, SMKK SMKK.0001).
 * - §15 #8 (forwarded from §14) — the resolver record-exclusion seam
 *   for staged re-preview (price REMOVAL preview): opt-in, additive,
 *   zero behaviour change on legacy paths. Excluding the winning
 *   record falls to the next-best candidate (price AND record id
 *   pinned); an iterative walk reaches NOT_FOUND with a null price;
 *   conversion pools are filtered too; an empty exclusion set is
 *   deep-identical to no exclusion; a nonexistent id changes nothing
 *   but the audit note; exclusion compositions never poison the
 *   default AHSP cache; context (SNAPSHOT) answers are unaffected.
 *
 * No test in this suite changes data, calls a live provider, or touches
 * the network. The suite reads repo artifacts only (never the program
 * folder), so it stays green in a fresh checkout.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { buildComponentPriceRef } from '../data/priceDatabase2026/centralResolution';
import type { ResourcePriceRecord } from '../data/priceDatabase2026/types';
import { canonicalPriceResolver } from '../engine/pricing/canonical/canonicalPriceResolver';
import {
  computeMasterPriceImpact,
  priceChangeKey,
  type MasterPriceChangeInput,
  type ProjectImpactInput,
} from '../engine/pricing/impact/masterPriceImpactPreview';
import {
  approveAdoption,
  previewAdoption,
} from '../engine/pricing/projectPriceModes';
import { APPROVED_ALIASES } from '../../scripts/price2026/reconciliationMatching';
import type { Project, ProjectCostSummary, RabItem } from '../types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8')) as T;
}

interface ReconciliationFile {
  inputs: {
    ahspItems: number;
    ahspComponentRows: number;
    masterResources: number;
    priceMasterRecords: number;
    registryBindings: number;
    registryEntities: number;
    registryUnbound: number;
    pipelineConflictGroups: number;
    pipelineUnresolvedKeys: number;
    componentKeys: number;
    keysWithPrice: number;
  };
  classification54: {
    byCategory: Record<string, number>;
    prefixArrayContradictions: number;
    needsReviewRows: number;
  };
  ahspToMaster51: {
    codedComponentRows: number;
    codedRowsBackedByMaster: number;
    newMasterEntities: number;
  };
  masterToAhsp52: {
    masterOnlyResourcesIndexSense: number;
    masterOnlyResourceIds: string[];
  };
  duplicates: {
    groups: number;
    byKind: Record<string, number>;
    trueDupMergeDecisions: { members: string[]; representative: string; decision: string }[];
  };
  unitConflicts: { missingUnitRows: number; missingUnitByFamily: Record<string, number> };
  verifiedMatches: { registryVerifiedBindings: number; priceMasterVerifiedRecords: number };
  audit: {
    ambiguous: { count: number; codeCollision: number; nameUnitTie: number };
    conflicts: { count: number; crossSource: number; intraSource: number };
    trueGapKeys: { count: number; componentRows: number };
    unreferencedPriceRows: { count: number };
  };
  decisions: {
    phase7: { item: number; id: string; status: string }[];
    ambiguities: { decided: number; needsReview: number; items: unknown[] };
    conflicts: { decided: number; needsReview: number; items: unknown[] };
    verifiedBindings: {
      rowId: string;
      targetKey: string;
      method: string;
      status: string;
      registryAction: string;
    }[];
  } | null;
  table16B: {
    byCategory: Record<string, Record<string, number>>;
    byFamily: Record<string, Record<string, number>>;
  };
}

interface PriceMasterFile {
  count: number;
  records: ResourcePriceRecord[];
}

interface MatchReportFile {
  componentKeyCoverage: { distinctComponentKeys: number; keysWithPrice: number };
  matchedRows: number;
  unmatchedRows: number;
}

interface SyncReconciliationFile {
  mode: string;
  dryRun: boolean;
  digestBefore: string;
  digestAfter: string;
  changed: boolean;
  before: { priceMasterRecords: number; componentKeysPriced: number; conflicts: number; unresolvedKeys: number };
  after: { priceMasterRecords: number; componentKeysPriced: number; conflicts: number; unresolvedKeys: number };
}

interface ResourcesFile {
  resources: unknown[];
}

const RECON = readJson<ReconciliationFile>('data/price2026/validated/reconciliation.json');
const PRICE_MASTER = readJson<PriceMasterFile>('data/price2026/validated/price_master.json');
const MATCH_REPORT = readJson<MatchReportFile>('data/price2026/validated/match_report.json');
const SYNC_RECON = readJson<SyncReconciliationFile>('data/price2026/reports/sync_reconciliation.json');
const RESOURCES = readJson<ResourcesFile>('data/ahsp2026/validated/ahsp_2026_resources.json');

// ---------------------------------------------------------------------------
// Fixtures (mirroring §9/§10/§14 — same live-catalog items, same numbers)
// ---------------------------------------------------------------------------

const T0 = '2026-11-16T00:00:00.000Z';
const T1 = '2026-11-16T00:00:01.000Z';
const T2 = '2026-11-16T00:00:02.000Z';
const REASON = 'Alasan fixture §15 yang cukup panjang';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function realItem(code: string): NationalAHSPItem {
  const found = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code === code);
  if (!found) throw new Error(`Fixture catalog item ${code} not found`);
  return clone(found);
}

/** The §9 small catalog: A (1.1.1.1) + B (1.1.1.2) + C (1.1.1.3), CK. */
function smallCatalog(): NationalAHSPItem[] {
  return [realItem('1.1.1.1'), realItem('1.1.1.2'), realItem('1.1.1.3')];
}

function makeRabItem(partial: Partial<RabItem> & { id: string }): RabItem {
  return {
    id: partial.id,
    no: partial.no ?? 1,
    code: partial.code ?? '1.1.1.1',
    ahspCode: partial.ahspCode ?? '1.1.1.1',
    description: partial.description ?? 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
    volume: partial.volume ?? 10,
    unit: partial.unit ?? 'm',
    unitPrice: partial.unitPrice ?? 715816,
    amount: partial.amount ?? 7158160,
    category: partial.category ?? 'PEKERJAAN_PERSIAPAN',
    ...partial,
  };
}

function zeroCostSummary(): ProjectCostSummary {
  return {
    directCost: 0,
    overheadAmount: 0,
    overheadPercent: 0,
    subtotalBeforeProfit: 0,
    profitAmount: 0,
    profitPercent: 0,
    subtotalBeforeTax: 0,
    taxAmount: 0,
    grandTotal: 0,
  };
}

function makeProjectRecord(partial: Partial<Project> = {}): Project {
  return {
    id: partial.id ?? 'FIXTURE-P-SNAP',
    name: partial.name ?? 'Fixture Project (SNAPSHOT)',
    location: partial.location ?? '',
    status: partial.status ?? 'draft',
    sections: partial.sections ?? [],
    costSummary: partial.costSummary ?? zeroCostSummary(),
    createdAt: partial.createdAt ?? T0,
    updatedAt: partial.updatedAt ?? T0,
    ...partial,
  };
}

function projectABItems(): RabItem[] {
  return [
    makeRabItem({ id: 'FIXTURE-RAB-A' }),
    makeRabItem({
      id: 'FIXTURE-RAB-B',
      no: 2,
      code: '1.1.1.2',
      ahspCode: '1.1.1.2',
      description: 'Pembuatan 1 m’ pagar sementara dari seng gelombang',
      volume: 2,
      unit: 'm',
      unitPrice: 577752,
      amount: 1155504,
    }),
  ];
}

function makeProjectInput(partial: Partial<ProjectImpactInput> & { projectId: string }): ProjectImpactInput {
  return {
    projectId: partial.projectId,
    projectName: partial.projectName ?? 'Fixture Project',
    isDemo: partial.isDemo ?? false,
    pricingMode: partial.pricingMode ?? 'SNAPSHOT_PRICE',
    pinnedAhspDatabaseVersion: partial.pinnedAhspDatabaseVersion ?? '2026.1',
    pinnedMasterPriceVersion: partial.pinnedMasterPriceVersion ?? '2026.1',
    items: partial.items ?? [],
    costSummary: partial.costSummary ?? {},
    overrides: partial.overrides,
  };
}

function snapshotProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-SNAP',
    projectName: 'Fixture Project (SNAPSHOT)',
    pricingMode: 'SNAPSHOT_PRICE',
    items: projectABItems(),
  });
}

function liveProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-LIVE',
    projectName: 'Fixture Project (LIVE)',
    pricingMode: 'LIVE_MASTER_PRICE',
    items: projectABItems(),
  });
}

/** The L.01 change: Pekerja OH Rp100.000 → Rp110.000 (baseline probed, pinned by §9). */
function l01Change(): MasterPriceChangeInput {
  return {
    resourceCode: 'L.01',
    resourceName: 'Pekerja',
    category: 'LABOR',
    unit: 'OH',
    oldPrice: 100000,
    newPrice: 110000,
  };
}

/* ====================================================================== */
describe('§15.1–§15.2 dry-run counts — the §15 dry-run reproduced §5 exactly', () => {
  it('inputs: 5,801 items / 33,011 rows / 5,185 resources / 899 records / 790 keys / 130 priced', () => {
    expect(RECON.inputs.ahspItems).toBe(5801);
    expect(RECON.inputs.ahspComponentRows).toBe(33011);
    expect(RECON.inputs.masterResources).toBe(5185);
    expect(RECON.inputs.priceMasterRecords).toBe(899);
    expect(RECON.inputs.componentKeys).toBe(790);
    expect(RECON.inputs.keysWithPrice).toBe(130);
    expect(RECON.inputs.registryBindings).toBe(1324);
    expect(RECON.inputs.registryEntities).toBe(274);
    expect(RECON.inputs.registryUnbound).toBe(3587);
    expect(RECON.inputs.pipelineConflictGroups).toBe(55);
    expect(RECON.inputs.pipelineUnresolvedKeys).toBe(660);
  });

  it('§16.B category TOTAL: the §15 before/after headline numbers', () => {
    const t = RECON.table16B.byCategory.TOTAL;
    expect(t.masterRecordsScanned).toBe(899);
    expect(t.ahspComponentsScanned).toBe(33011);
    expect(t.verifiedMatches).toBe(13);
    expect(t.newMasterRecords).toBe(0);
    expect(t.masterOnlyRecords).toBe(0);
    expect(t.duplicateCandidates).toBe(270);
    expect(t.unitConflicts).toBe(2);
    expect(t.priceConflicts).toBe(159);
    expect(t.missingPrices).toBe(115);
    expect(t.unresolvedRecords).toBe(115);
  });

  it('§16.B per category: material 75 / labor 6 / equipment 34 missing prices', () => {
    const byCat = RECON.table16B.byCategory;
    expect(byCat.MATERIAL.missingPrices).toBe(75);
    expect(byCat.LABOR.missingPrices).toBe(6);
    expect(byCat.EQUIPMENT.missingPrices).toBe(34);
    expect(byCat.MATERIAL.priceConflicts).toBe(98);
    expect(byCat.LABOR.priceConflicts).toBe(10);
    expect(byCat.EQUIPMENT.priceConflicts).toBe(51);
    expect(byCat.MATERIAL.ahspComponentsScanned).toBe(10454);
    expect(byCat.LABOR.ahspComponentsScanned).toBe(15985);
    expect(byCat.EQUIPMENT.ahspComponentsScanned).toBe(6562);
    expect(byCat.NEEDS_REVIEW.ahspComponentsScanned).toBe(10);
  });

  it('§16.B per family: BM 64 / SDA 51 missing prices; all 2 unit conflicts are CK; SMKK 0 rows', () => {
    const byFam = RECON.table16B.byFamily;
    expect(byFam.BINA_MARGA.missingPrices).toBe(64);
    expect(byFam.SUMBER_DAYA_AIR.missingPrices).toBe(51);
    expect(byFam.CIPTA_KARYA.missingPrices).toBe(0);
    expect(byFam.CIPTA_KARYA.ahspComponentsScanned).toBe(16506);
    expect(byFam.SUMBER_DAYA_AIR.ahspComponentsScanned).toBe(6692);
    expect(byFam.BINA_MARGA.ahspComponentsScanned).toBe(9813);
    // SMKK carries 0 component rows in the canonical extraction — the
    // extraction hole, reported honestly, not a hidden zero.
    expect(byFam.SMKK.ahspComponentsScanned).toBe(0);
    expect(byFam.SMKK.missingPrices).toBe(0);
    expect(RECON.unitConflicts.missingUnitRows).toBe(2);
    expect(RECON.unitConflicts.missingUnitByFamily.CIPTA_KARYA).toBe(2);
  });

  it('the family TOTAL row agrees with the category TOTAL row', () => {
    const cat = RECON.table16B.byCategory.TOTAL;
    const fam = RECON.table16B.byFamily.TOTAL;
    for (const k of Object.keys(cat)) {
      if (k === 'verifiedMatches') continue; // family-agnostic by design
      expect(fam[k]).toBe(cat[k]);
    }
  });

  it('audit counts: 156 ambiguities / 159 conflicts / 115 true-gap keys / 12,735 unreferenced rows', () => {
    expect(RECON.audit.ambiguous.count).toBe(156);
    expect(RECON.audit.ambiguous.codeCollision).toBe(104);
    expect(RECON.audit.ambiguous.nameUnitTie).toBe(52);
    expect(RECON.audit.conflicts.count).toBe(159);
    expect(RECON.audit.conflicts.crossSource).toBe(153);
    expect(RECON.audit.conflicts.intraSource).toBe(6);
    expect(RECON.audit.trueGapKeys.count).toBe(115);
    expect(RECON.audit.trueGapKeys.componentRows).toBe(394);
    expect(RECON.audit.unreferencedPriceRows.count).toBe(12735);
  });

  it('verified matches: 596 registry VERIFIED bindings, 13 priceMaster VERIFIED records', () => {
    expect(RECON.verifiedMatches.registryVerifiedBindings).toBe(596);
    expect(RECON.verifiedMatches.priceMasterVerifiedRecords).toBe(13);
  });

  it('the sync engine agrees: NO_OP, digest unchanged, before == after', () => {
    expect(SYNC_RECON.mode).toBe('NO_OP');
    expect(SYNC_RECON.changed).toBe(false);
    expect(SYNC_RECON.digestBefore).toBe('0mw40czeh4p');
    expect(SYNC_RECON.digestAfter).toBe('0mw40czeh4p');
    expect(SYNC_RECON.before).toEqual(SYNC_RECON.after);
    expect(SYNC_RECON.before.priceMasterRecords).toBe(452);
    expect(SYNC_RECON.before.componentKeysPriced).toBe(121);
    expect(SYNC_RECON.before.conflicts).toBe(50);
    expect(SYNC_RECON.before.unresolvedKeys).toBe(670);
  });
});

/* ====================================================================== */
describe('§15.2 identification — duplicates, unresolved, conflicts (concrete)', () => {
  it('270 duplicate groups = 88 TRUE_DUP / 61 CODE_VARIANT / 82 NAME_ONLY_DUP / 39 MIXED', () => {
    expect(RECON.duplicates.groups).toBe(270);
    expect(RECON.duplicates.byKind).toEqual({
      TRUE_DUP: 88,
      CODE_VARIANT: 61,
      NAME_ONLY_DUP: 82,
      MIXED: 39,
    });
  });

  it('all 88 TRUE_DUP merge decisions are RECORDED (not executed) with an in-member representative', () => {
    expect(RECON.duplicates.trueDupMergeDecisions).toHaveLength(88);
    for (const d of RECON.duplicates.trueDupMergeDecisions) {
      expect(d.members.length).toBeGreaterThan(1);
      expect(d.members).toContain(d.representative);
      expect(d.decision).toMatch(/not executed in §5/);
    }
  });

  it('0 new master entities — proven: all 12,870 coded rows are backed by master', () => {
    expect(RECON.ahspToMaster51.codedComponentRows).toBe(12870);
    expect(RECON.ahspToMaster51.codedRowsBackedByMaster).toBe(12870);
    expect(RECON.ahspToMaster51.newMasterEntities).toBe(0);
  });

  it('0 master-only resources in the index sense; the 420 prefix/array contradictions are counted', () => {
    expect(RECON.masterToAhsp52.masterOnlyResourcesIndexSense).toBe(0);
    expect(RECON.masterToAhsp52.masterOnlyResourceIds).toHaveLength(0);
    expect(RECON.classification54.prefixArrayContradictions).toBe(420);
    expect(RECON.classification54.needsReviewRows).toBe(10);
  });

  it('Fase-7 ledger: all 11 priorities present with their §5 verdicts intact', () => {
    const byId = new Map((RECON.decisions?.phase7 ?? []).map((p) => [p.id, p]));
    expect(RECON.decisions!.phase7).toHaveLength(11);
    expect(byId.get('M293')!.status).toBe('DECIDED_WITH_EVIDENCE');
    expect(byId.get('M09')!.status).toBe('DECIDED_WITH_EVIDENCE');
    expect(byId.get('E07/E11')!.status).toBe('DECIDED_WITH_EVIDENCE');
    expect(byId.get('L.05/L.06')!.status).toBe('DECIDED_REGRESSION_PROVEN');
    expect(byId.get('M170')!.status).toBe('OPEN');
    expect(byId.get('SDA-GAP')!.status).toBe('VERIFIED_OPEN');
    expect(byId.get('CK-UNITS-191')!.status).toBe('VERIFIED_OPEN');
    expect(byId.get('BM-SMKK-GENERATORS')!.status).toBe('BLOCKED_DOCUMENTED');
    expect(byId.get('TRUE-GAP-115')!.status).toBe('VERIFIED_WITH_RUNTIME_PROBE');
    expect(byId.get('AMBIG-156')!.status).toBe('DECIDED_113_REVIEW_43');
    expect(byId.get('CONF-159')!.status).toBe('DECIDED_130_REVIEW_29');
  });

  it('bulk verdicts intact: ambiguities 113/43, conflicts 130/29', () => {
    expect(RECON.decisions!.ambiguities.decided).toBe(113);
    expect(RECON.decisions!.ambiguities.needsReview).toBe(43);
    expect(RECON.decisions!.ambiguities.items).toHaveLength(156);
    expect(RECON.decisions!.conflicts.decided).toBe(130);
    expect(RECON.decisions!.conflicts.needsReview).toBe(29);
    expect(RECON.decisions!.conflicts.items).toHaveLength(159);
  });
});

/* ====================================================================== */
describe('§15.3 no historical rewrite — the migration touches zero project data', () => {
  it('SNAPSHOT_PRICE is untouched by a global price change (delta 0, locked)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [snapshotProjectAB()],
    });
    expect(preview.status).toBe('COMPUTED');
    const p = preview.projects.projects[0];
    expect(p.deltaGrandTotal).toBe(0);
    expect(p.newGrandTotal).toBe(p.oldGrandTotal);
    expect(p.oldGrandTotal).toBe(8313664);
    expect(preview.projects.summary.lockedSnapshotCount).toBe(1);
  });

  it('LIVE_MASTER_PRICE moves (the control: the machinery works — only frozen states are protected)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
    });
    expect(preview.status).toBe('COMPUTED');
    const p = preview.projects.projects[0];
    expect(p.deltaGrandTotal).toBe(60000);
    expect(p.newGrandTotal).toBe(8373664);
  });

  it('PROJECT_OVERRIDE: the covered component stays frozen (L.01 covered @90.000)', () => {
    const overrideProject = makeProjectInput({
      projectId: 'FIXTURE-P-OVR',
      projectName: 'Fixture Project (OVERRIDE)',
      pricingMode: 'PROJECT_OVERRIDE',
      overrides: [
        {
          id: 'FIXTURE-OVR-1',
          projectId: 'FIXTURE-P-OVR',
          resourceCode: 'L.01',
          resourceName: 'Pekerja',
          category: 'LABOR',
          unit: 'OH',
          masterPrice: 100000,
          projectPrice: 90000,
          isOverridden: true,
          lastUpdated: T0,
        },
      ],
      items: [
        makeRabItem({ id: 'FIXTURE-RAB-A', unitPrice: 709816, amount: 7098160 }),
        makeRabItem({
          id: 'FIXTURE-RAB-B',
          no: 2,
          code: '1.1.1.2',
          ahspCode: '1.1.1.2',
          description: 'Pembuatan 1 m’ pagar sementara dari seng gelombang',
          volume: 2,
          unit: 'm',
          unitPrice: 577752,
          amount: 1155504,
        }),
      ],
    });
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [overrideProject],
    });
    expect(preview.status).toBe('COMPUTED');
    const p = preview.projects.projects[0];
    expect(p.deltaGrandTotal).toBe(0);
    expect(p.newGrandTotal).toBe(p.oldGrandTotal);
  });

  it('explicit adoption creates a NEW version — the old version keeps the old items', () => {
    const input = snapshotProjectAB();
    const project = makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' });
    const adoption = previewAdoption({
      project: input,
      change: {
        kind: 'MASTER_PRICE_CHANGE' as const,
        targetMasterPriceVersion: '2026.2',
        priceChanges: [l01Change()],
        catalogItems: smallCatalog(),
      },
      computedAt: T1,
    });
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project,
      versions: [],
      reason: REASON,
      actor: 'fixture-owner',
      now: T2,
      currentPrices: new Map([[priceChangeKey(l01Change()), 110000]]),
      catalogItems: smallCatalog(),
      idGenerator: () => 'FIXTURE-VERSION-ADOPTED',
    });
    expect(result.oldGrandTotal).toBe(8313664);
    expect(result.newGrandTotal).toBe(8373664);
    expect(result.versions).toHaveLength(2);
    // The materialised baseline keeps the OLD items (pre-adoption).
    const baseline = result.versions[0];
    expect(baseline.rabItemsSnapshot[0].unitPrice).toBe(715816);
    // The created version keeps the NEW items.
    expect(result.created.rabItemsSnapshot[0].unitPrice).toBe(721816);
    // The project's mode and overhead/profit are unchanged by adoption.
    expect(result.project.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(result.project.costSummary.overheadPercent).toBe(0);
    expect(result.project.costSummary.profitPercent).toBe(0);
    // The created version carries the captured component-price map (§14 #2).
    expect(result.created.componentPriceSnapshot).toBeTruthy();
    expect(result.created.componentPriceSnapshot!.pricesByComponentKey['L01|OH']).toBe(110000);
  });
});

/* ====================================================================== */
describe('§15.4–§15.5 migration-plan validation — the safe set is EMPTY (all deferred to owner)', () => {
  it('no alias rule was applied: the approved-alias table is still EMPTY', () => {
    expect(APPROVED_ALIASES.size).toBe(0);
  });

  it('no TRUE_DUP merge was executed: the resource index is still 5,185 rows', () => {
    expect(RESOURCES.resources).toHaveLength(5185);
    expect(RECON.inputs.masterResources).toBe(5185);
  });

  it('no price record was added or changed by the migration: priceMaster is still exactly 899 records', () => {
    expect(PRICE_MASTER.count).toBe(899);
    expect(PRICE_MASTER.records).toHaveLength(899);
    expect(MATCH_REPORT.matchedRows).toBe(899);
    expect(MATCH_REPORT.unmatchedRows).toBe(9439);
    expect(MATCH_REPORT.componentKeyCoverage.distinctComponentKeys).toBe(790);
    expect(MATCH_REPORT.componentKeyCoverage.keysWithPrice).toBe(130);
  });

  it('the 4 FASE5 bindings are still RECORDED (not applied); the 6 dead-file bindings still BLOCKED on M-4', () => {
    const bindings = RECON.decisions!.verifiedBindings;
    expect(bindings).toHaveLength(10);
    const ready = bindings.filter((b) => b.registryAction === 'APPLY_IN_§15');
    const blocked = bindings.filter((b) => b.registryAction.startsWith('BLOCKED_ON_M4'));
    expect(ready).toHaveLength(4);
    expect(blocked).toHaveLength(6);
    // Recorded + ready is NOT applied: the alias table above is the
    // proof (empty), and the priceMaster count above is the proof
    // (899, not 903).
    expect(ready.map((b) => b.targetKey).sort()).toEqual(['E17|jam', 'E17|jam', 'E17|jam', 'M397C|m']);
  });

  it('the price fence holds: no priceMaster record carries a 0 price', () => {
    for (const r of PRICE_MASTER.records) {
      expect(r.price).not.toBe(0);
      expect(r.price).toBeGreaterThan(0);
    }
  });
});

/* ====================================================================== */
describe('§15.6 unresolved preserved, labelled — never forced, never Rp0', () => {
  it('true-gap sample: T34|jam, L10|OH (BM name), M170|kg are NOT_FOUND with null prices', () => {
    // M23|kg left this sample via adopsi pasar 2026-11-17 (Portland
    // Cement Rp1.425/kg, DIRECT median bersumber — pinned by the test
    // below); the remaining three are still genuine gaps.
    const samples: Array<{ code: string; name: string; unit: string; type: 'material' | 'labor' | 'equipment' }> = [
      { code: 'T.34', name: 'Trailer 10-20 ton (lebar 3,5 m x 8,0 m)', unit: 'jam', type: 'equipment' },
      { code: 'L.10', name: 'Akhli Madya Lingkungan', unit: 'OH', type: 'labor' },
      { code: 'M170', name: 'Air', unit: 'kg', type: 'material' },
    ];
    for (const s of samples) {
      const r = priceResolver2026.resolveResourcePrice({
        resourceCode: s.code,
        resourceName: s.name,
        resourceType: s.type,
        unit: s.unit,
      });
      expect(r.status).toBe('NOT_FOUND');
      expect(r.price).toBeNull();
      expect(r.price).not.toBe(0);
    }
  });

  it('M23|kg left the true gap via adopsi pasar 2026-11-17 (Portland Cement Rp1.425/kg)', () => {
    const r = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M23',
      resourceName: 'Portland Cement',
      resourceType: 'material',
      unit: 'kg',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(1425);
    expect(r.source?.key).toBe('MARKET_2026');
  });

  it('M293 Kapur Dolomit still resolves NOT_FOUND — the phantom Rp185.000 never surfaces', () => {
    const r = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M293',
      resourceName: 'Kapur Dolomit',
      resourceType: 'material',
      unit: 'kg',
    });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.alternatives).toHaveLength(0);
  });

  it('EI734/EI374 are REFUSED (underspecified) with their alternatives listed, price null', () => {
    for (const code of ['EI734', 'EI374']) {
      const r = priceResolver2026.resolveResourcePrice({
        resourceCode: code,
        resourceName: 'Baja Tulangan',
        resourceType: 'material',
        unit: 'kg',
      });
      expect(r.status).toBe('NOT_FOUND');
      expect(r.price).toBeNull();
      expect(r.underspecified?.action).toBe('REFUSE');
      expect(r.alternatives.length).toBeGreaterThan(0);
    }
  });

  it('M170|L resolves WITH its CONFLICT flag attached (flagged, never silent)', () => {
    const r = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M170',
      resourceName: 'Air',
      resourceType: 'material',
      unit: 'L',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(19900);
    expect(r.needsReview?.kind).toBe('CONFLICT');
    expect(r.alternatives.length).toBeGreaterThan(0);
  });

  it('E17|jam resolves WITH its AMBIGUITY flag attached', () => {
    const r = priceResolver2026.resolveResourcePrice({
      resourceCode: 'E17',
      resourceName: 'Tandem Roller 6-8 Ton',
      resourceType: 'equipment',
      unit: 'jam',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(494721.02);
    expect(r.needsReview?.kind).toBe('AMBIGUITY');
  });

  it('the two newly-resolving gap keys are pinned WITH their documented §6/§7 rules (not hidden)', () => {
    // M170|m3: §7 stripUnitAnnotation — the CK row is literally named
    // 'Air (m3)' @ m3 @ 50.000; the annotation is stripped, so the name
    // binds. (In §5 the name did not bind: 'air m3' ≠ 'air'.)
    const m170 = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M170',
      resourceName: 'Air',
      resourceType: 'material',
      unit: 'm3',
    });
    expect(m170.status).toBe('RESOLVED');
    expect(m170.price).toBe(50000);
    expect(m170.source?.key).toBe('CK_HSD_2026');
    expect(m170.unitConversion).toBeNull();
    // M21|m3: was §6 (c) documented dimensional conversion — CK 'Air
    // Bersih' liter @ 550 × 1000 (whitelist liter↔m3). Adopsi pasar
    // 2026-11-17 added a direct same-unit record (MARKET_2026 R032 'Air
    // bersih (air tanah)' Rp7.500/m³, DIRECT median bersumber), and the
    // same-unit-first rule serves it instead. The conversion survives
    // as fallback — pinned by the §15 #8 exclusion test below.
    const m21 = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M.21',
      resourceName: 'Air Bersih',
      resourceType: 'material',
      unit: 'm3',
    });
    expect(m21.status).toBe('RESOLVED');
    expect(m21.price).toBe(7500);
    expect(m21.source?.key).toBe('MARKET_2026');
    expect(m21.unitConversion).toBeNull();
  });
});

/* ====================================================================== */
describe('§15.7 initial master price resolution — all four families read the canonical source', () => {
  it('the runtime index holds 4,936 records (899 priceMaster + CK + BM + OJ twins)', () => {
    expect(priceResolver2026.recordCount).toBe(4936);
  });

  it('CIPTA_KARYA 1.1.1.1 resolves FULL at Rp715.816 from the official CK source', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice(realItem('1.1.1.1'));
    expect(comp.pricingStatus).toBe('FULL');
    expect(comp.unitPrice).toBe(715816);
    expect(comp.totalComponents).toBe(13);
    expect(comp.missingComponents).toBe(0);
    expect(comp.labor.components[0].sourceName).toBe('Standar Upah Cipta Karya SE 47/2026');
  });

  it('BINA_MARGA B.1 resolves FULL at Rp72.616 from the official BM source', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice(realItem('B.1'));
    expect(comp.pricingStatus).toBe('FULL');
    expect(comp.unitPrice).toBe(72616);
    expect(comp.totalComponents).toBe(4);
    expect(comp.labor.components[0].sourceName).toBe('Standar Upah Bina Marga SE 47/2026');
  });

  it('SUMBER_DAYA_AIR A.1.01.a.1 resolves FULL at Rp6.000 (via the CK cross-reference — no SDA source exists)', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice(realItem('A.1.01.a.1'));
    expect(comp.pricingStatus).toBe('FULL');
    expect(comp.unitPrice).toBe(6000);
    expect(comp.totalComponents).toBe(2);
    expect(comp.labor.components[0].sourceName).toBe('Standar Upah Cipta Karya SE 47/2026');
  });

  it('SMKK SMKK.0001 resolves FULL at Rp330.565 from the canonical resolver', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice(realItem('SMKK.0001'));
    expect(comp.pricingStatus).toBe('FULL');
    expect(comp.unitPrice).toBe(330565);
    expect(comp.totalComponents).toBe(4);
    expect(comp.labor.components[0].sourceName).toBe('Standar Upah Cipta Karya SE 47/2026');
  });

  it('the canonical wrapper resolves L.01 through Step 2 (OFFICIAL_GOVERNMENT, Rp100.000)', () => {
    const r = canonicalPriceResolver.resolve({ code: 'L.01', name: 'Pekerja', unit: 'OH' });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(100000);
    expect(r.source).toBe('OFFICIAL_GOVERNMENT');
    expect(r.resolutionPath.join(' ')).toContain('OFFICIAL_RESOURCE_RESOLVED');
  });
});

/* ====================================================================== */
describe('§15 #8 — resolver record-exclusion seam (staged re-preview; opt-in, additive)', () => {
  it('the winning record id is exposed: L.01 Pekerja OH wins PRC-CK2026-L-0 @100.000', () => {
    const r = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L01',
      resourceName: 'Pekerja',
      resourceType: 'labor',
      unit: 'OH',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(100000);
    expect(r.recordId).toBe('PRC-CK2026-L-0');
    expect(r.matchMethod).toBe('EXACT_CODE');
    expect(r.source?.key).toBe('CK_HSD_2026');
  });

  it('excluding the winner falls to the next-best record (140.000 LABOR_2026) with an exact audit note', () => {
    const r = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L01',
      resourceName: 'Pekerja',
      resourceType: 'labor',
      unit: 'OH',
      excludeRecordIds: new Set(['PRC-CK2026-L-0']),
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(140000);
    expect(r.recordId).not.toBe('PRC-CK2026-L-0');
    expect(r.recordId).toBeTruthy();
    expect(r.source?.key).toBe('LABOR_2026');
    expect(r.explanation).toContain('EXCLUSION: 1 record id(s) listed; 1 candidate(s) removed.');
  });

  it('an iterative exclusion walk reaches NOT_FOUND with a null price — never Rp0, never a repeat winner', () => {
    // The L.01 fallback chain, pinned end to end (probed 2026-11-16):
    // CK 100.000 → LABOR 140.000 → LABOR 155.000 → COMMERCIAL 150.000
    // → COMMERCIAL 130.000 → LABOR 140.000 (OJ→OH ×7 conversion) → unpriced.
    const expectedPrices: Array<number | null> = [100000, 140000, 155000, 150000, 130000, 140000, null];
    const excluded = new Set<string>();
    const seenWinners = new Set<string>();
    for (let step = 0; step < expectedPrices.length; step++) {
      const r = priceResolver2026.resolveResourcePrice({
        resourceCode: 'L01',
        resourceName: 'Pekerja',
        resourceType: 'labor',
        unit: 'OH',
        excludeRecordIds: excluded.size > 0 ? excluded : undefined,
      });
      expect(r.price).toBe(expectedPrices[step]);
      if (expectedPrices[step] === null) {
        expect(r.status).toBe('NOT_FOUND');
        // No record won: recordId is unset (undefined) on NOT_FOUND.
        expect(r.recordId ?? null).toBeNull();
        expect(r.price).not.toBe(0);
      } else {
        expect(r.status).toBe('RESOLVED');
        expect(r.recordId).toBeTruthy();
        // No excluded id ever wins again.
        expect(excluded.has(r.recordId!)).toBe(false);
        expect(seenWinners.has(r.recordId!)).toBe(false);
        seenWinners.add(r.recordId!);
        excluded.add(r.recordId!);
      }
    }
    expect(excluded.size).toBe(6);
  });

  it('M170|L: excluding the HSD winner (19.900) falls to Rp200', () => {
    const winner = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M170',
      resourceName: 'Air',
      resourceType: 'material',
      unit: 'L',
    });
    expect(winner.price).toBe(19900);
    expect(winner.recordId).toBeTruthy();
    const next = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M170',
      resourceName: 'Air',
      resourceType: 'material',
      unit: 'L',
      excludeRecordIds: new Set([winner.recordId!]),
    });
    expect(next.status).toBe('RESOLVED');
    expect(next.price).toBe(200);
    expect(next.recordId).not.toBe(winner.recordId);
  });

  it('conversion pools are filtered too: excluding the M.21 market record falls back to the conversion; excluding both leaves it unpriced', () => {
    // Adopsi pasar 2026-11-17: M.21 now resolves via the direct market
    // record (Rp7.500/m³) — the key record serves both the code path
    // and the bare-name path (its NAME_KEY companion is keyed under
    // the 'Air bersih (air tanah)' variant name, not 'Air Bersih').
    // The §6 (c) liter→m³ conversion (Rp550.000) survives as fallback
    // behind the market record.
    const winner = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M.21',
      resourceName: 'Air Bersih',
      resourceType: 'material',
      unit: 'm3',
    });
    expect(winner.price).toBe(7500);
    expect(winner.unitConversion).toBeNull();
    expect(winner.source?.key).toBe('MARKET_2026');
    const converted = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M.21',
      resourceName: 'Air Bersih',
      resourceType: 'material',
      unit: 'm3',
      excludeRecordIds: new Set([winner.recordId!]),
    });
    expect(converted.price).toBe(550000);
    expect(converted.unitConversion).not.toBeNull();
    expect(converted.unitConversion?.fromUnit).toBe('liter');
    expect(converted.recordId).toBe('PRC-CK2026-M-3065');
    const next = priceResolver2026.resolveResourcePrice({
      resourceCode: 'M.21',
      resourceName: 'Air Bersih',
      resourceType: 'material',
      unit: 'm3',
      excludeRecordIds: new Set([winner.recordId!, 'PRC-CK2026-M-3065']),
    });
    expect(next.status).toBe('NOT_FOUND');
    expect(next.price).toBeNull();
    expect(next.explanation).toContain('EXCLUSION: 2 record id(s) listed; 2 candidate(s) removed.');
  });

  it('excluding a nonexistent id changes nothing but the audit note (0 removed)', () => {
    const plain = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L01',
      resourceName: 'Pekerja',
      resourceType: 'labor',
      unit: 'OH',
    });
    const excluded = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L01',
      resourceName: 'Pekerja',
      resourceType: 'labor',
      unit: 'OH',
      excludeRecordIds: new Set(['PRC-DOES-NOT-EXIST']),
    });
    expect(excluded.price).toBe(plain.price);
    expect(excluded.status).toBe(plain.status);
    expect(excluded.source).toEqual(plain.source);
    expect(excluded.matchMethod).toBe(plain.matchMethod);
    expect(excluded.recordId).toBe(plain.recordId);
    expect(excluded.explanation).toContain('EXCLUSION: 1 record id(s) listed; 0 candidate(s) removed.');
  });

  it('an empty exclusion set is deep-identical to no exclusion (zero legacy behaviour change)', () => {
    const queries: Array<{
      resourceCode: string;
      resourceName: string;
      resourceType: 'material' | 'labor' | 'equipment';
      unit: string;
    }> = [
      { resourceCode: 'L01', resourceName: 'Pekerja', resourceType: 'labor', unit: 'OH' },
      { resourceCode: 'M09', resourceName: 'Timbunan Pilihan', resourceType: 'material', unit: 'm3' },
      { resourceCode: 'E07', resourceName: 'CRANE', resourceType: 'equipment', unit: 'jam' },
      { resourceCode: 'M293', resourceName: 'Kapur Dolomit', resourceType: 'material', unit: 'kg' },
      { resourceCode: 'M170', resourceName: 'Air', resourceType: 'material', unit: 'L' },
      { resourceCode: 'EI734', resourceName: 'Baja Tulangan', resourceType: 'material', unit: 'kg' },
    ];
    for (const q of queries) {
      const plain = priceResolver2026.resolveResourcePrice(q);
      const empty = priceResolver2026.resolveResourcePrice({ ...q, excludeRecordIds: new Set<string>() });
      expect(JSON.stringify(empty)).toBe(JSON.stringify(plain));
      expect(plain.explanation).not.toContain('EXCLUSION:');
    }
  });

  it('an exclusion composition reprices the item — and never poisons the default cache', () => {
    const item = realItem('1.1.1.1');
    const base = priceResolver2026.resolveAhspUnitPrice(item);
    expect(base.unitPrice).toBe(715816);
    expect(base.pricingStatus).toBe('FULL');
    // Exclude the L.01 winner: Pekerja falls to 140.000 (+40.000 × 0,6 = +24.000).
    const excl = priceResolver2026.resolveAhspUnitPrice(item, {
      excludeRecordIds: new Set(['PRC-CK2026-L-0']),
    });
    expect(excl.unitPrice).toBe(739816);
    expect(excl.pricingStatus).toBe('FULL');
    expect(excl.labor.components[0].unitPrice).toBe(140000);
    // The default query after the exclusion still serves the live value.
    const after = priceResolver2026.resolveAhspUnitPrice(item);
    expect(after.unitPrice).toBe(715816);
    expect(after.pricingStatus).toBe('FULL');
  });

  it('the canonical wrapper threads the exclusion through Step 2 (100.000 → 140.000)', () => {
    const plain = canonicalPriceResolver.resolve({ code: 'L.01', name: 'Pekerja', unit: 'OH' });
    expect(plain.price).toBe(100000);
    const excl = canonicalPriceResolver.resolve({
      code: 'L.01',
      name: 'Pekerja',
      unit: 'OH',
      excludeRecordIds: new Set(['PRC-CK2026-L-0']),
    });
    expect(excl.status).toBe('RESOLVED');
    expect(excl.price).toBe(140000);
    expect(excl.resolutionPath.join(' ')).toContain('OFFICIAL_RESOURCE_RESOLVED');
    const empty = canonicalPriceResolver.resolve({
      code: 'L.01',
      name: 'Pekerja',
      unit: 'OH',
      excludeRecordIds: new Set<string>(),
    });
    expect(JSON.stringify(empty)).toBe(JSON.stringify(plain));
  });

  it('a SNAPSHOT answer is unaffected by exclusion (a stored price is not a record)', () => {
    const ref = buildComponentPriceRef(
      [{ code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 111000 }],
      { label: 'test-snapshot-15.8' },
    );
    const r = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L01',
      resourceName: 'Pekerja',
      resourceType: 'labor',
      unit: 'OH',
      pricingContext: { pricingMode: 'SNAPSHOT_PRICE', snapshotRef: ref },
      excludeRecordIds: new Set(['PRC-CK2026-L-0']),
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(111000);
    expect(r.recordId).toBeNull();
    // The context path never consults the index, so no EXCLUSION note.
    expect(r.explanation).not.toContain('EXCLUSION:');
  });
});
