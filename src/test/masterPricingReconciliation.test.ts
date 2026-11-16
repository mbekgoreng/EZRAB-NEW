/**
 * MASTER PRICING §5 — TWO-WAY RECONCILIATION (§5.1–§5.4 + Fase-7 priorities).
 *
 * Run: npx vitest run src/test/masterPricingReconciliation.test.ts
 *
 * What is pinned here (and why each pin exists):
 * - §5.3 hierarchy: levels 1–3 merge on verified identity (exact canonical
 *   ID, exact source ID + compatible unit, exact name + spec + unit); level
 *   4 (approved alias) starts EMPTY — the ten verified §5 bindings live in
 *   reconciliation.json and are applied by the §15 migration, because
 *   applying them changes the pinned §3/§4 counts; level 5 is review-only
 *   and level 6 is no match. The hard rule is pinned with the M293 case:
 *   'Kapur Dolomit' vs 'Kapur' scores 0.90 similarity and STILL never
 *   merges — a similar name alone is never a merge.
 * - §5.4 classification: every one of the 33,011 component rows is
 *   classified (MATERIAL 10,457 / LABOR 15,985 / EQUIPMENT 6,559 /
 *   UNCLASSIFIED 0 / NEEDS_REVIEW 10); the 10 NEEDS_REVIEW rows are listed,
 *   not discarded; the 424 prefix/array contradictions are classified by
 *   prefix and counted separately.
 * - §5.1 AHSP→master: 0 new master entities — proven, not assumed: all
 *   12,870 coded rows are backed by master resource rows, and uncoded rows
 *   carry no code identity to mint from (§5.3 rule 6 forbids minting from
 *   names alone). Prices exist only with a source: the 115 true-gap keys
 *   stay null + labelled.
 * - §5.2 master→AHSP: 0 master-only resources in the index sense (every
 *   resource traces to ≥1 AHSP item); the 12,735 unreferenced price rows
 *   are REPORTED, not bulk-imported — priceMaster is still exactly 452
 *   records. No AHSP code is fabricated: every verified binding targets a
 *   key from the audited 791-key set.
 * - Duplicates (audit §9.2, reproduced with the real primitives): 273
 *   groups = 89 TRUE_DUP / 61 CODE_VARIANT / 84 NAME_ONLY_DUP / 39 MIXED.
 *   Only TRUE_DUP may auto-merge, and even that merge is a §15 migration
 *   action — §5 records the decision + representative (which is always one
 *   of the group's own members).
 * - Fase 7: all 11 priorities pinned by status — decided-with-evidence vs
 *   unresolved-labelled. M293/M09/E07-E11/L.05-L.06 are decided (with the
 *   decided price pinned); M170/SDA-gap/CK-units stay open; the BM & SMKK
 *   generators stay BLOCKED (documented, not faked).
 * - Conflicts: the 50 pipeline groups == conflicts.json (set equality);
 *   48/50 stay ambiguous WITHIN the preferred source (flagged, alternatives
 *   returned — the §4 finding is preserved, not overridden); the audit 159
 *   groups are decided 130 / review 29 in the decisions file.
 *
 * The suite reads the runner output (data/price2026/validated/
 * reconciliation.json) — regenerate it with `npm run price:reconcile`
 * after any input change. The decisions embedded in that file come from
 * fase5-decisions.json (workspace); the runner cross-checks their counts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResourcePriceRecord } from '../data/priceDatabase2026/types';
import {
  matchComponentToMaster,
  classifyComponent,
  isPrefixArrayContradiction,
  classifyDuplicateGroup,
  trueDupRepresentative,
  APPROVED_ALIASES,
} from '../../scripts/price2026/reconciliationMatching';
import {
  findConflictGroups,
  selectMasterPriceCandidate,
} from '../engine/pricing/admin/masterPriceSelection';

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
    needsReviewList: { code: string; name: string }[];
    unclassifiedRows: number;
    unclassifiedList: unknown[];
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
    trueDupMergeDecisions: { members: string[]; representative: string }[];
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
    phase7: { item: number; id: string; status: string; decidedPrice?: number | null }[];
    ambiguities: { decided: number; needsReview: number; items: unknown[] };
    conflicts: { decided: number; needsReview: number; items: unknown[] };
    verifiedBindings: {
      rowId: string;
      targetKey: string;
      method: string;
      status: string;
      registryAction: string;
      proposedAliasRule: unknown;
    }[];
  } | null;
  table16B: {
    byCategory: Record<string, Record<string, number>>;
    byFamily: Record<string, Record<string, number>>;
  };
}

interface PriceMasterFile {
  generatedAt: string;
  count: number;
  records: ResourcePriceRecord[];
}

interface ConflictsFile {
  generatedAt: string;
  count: number;
  conflicts: { identity: string; preferred: string; resolution: string }[];
}

const RECON = readJson<ReconciliationFile>('data/price2026/validated/reconciliation.json');
const PRICE_MASTER = readJson<PriceMasterFile>('data/price2026/validated/price_master.json');
const CONFLICTS = readJson<ConflictsFile>('data/price2026/validated/conflicts.json');
const RECORDS = PRICE_MASTER.records;

/* ====================================================================== */
describe('§5.3 matching hierarchy (strict)', () => {
  it('level 1: exact canonical ID merges', () => {
    const out = matchComponentToMaster(
      { canonicalId: 'RES-000001', code: 'M09', name: 'Timbunan Pilihan', unit: 'm3' },
      { canonicalId: 'RES-000001', sourceCode: 'M09', name: 'Timbunan Pilihan', unit: 'm3' },
    );
    expect(out.level).toBe('EXACT_CANONICAL_ID');
    expect(out.merge).toBe(true);
  });

  it('level 2: exact verified source ID merges (loose code: L.05 == L05)', () => {
    const out = matchComponentToMaster(
      { code: 'L.05', name: 'Juru ukur', unit: 'OH' },
      { sourceCode: 'L05', name: 'Juru Ukur', unit: 'OH' },
    );
    expect(out.level).toBe('EXACT_SOURCE_ID');
    expect(out.merge).toBe(true);
  });

  it('level 2 with an incompatible unit does NOT merge (review, not merge)', () => {
    const out = matchComponentToMaster(
      { code: 'M09', name: 'Timbunan Pilihan', unit: 'm3' },
      { sourceCode: 'M09', name: 'Timbunan Pilihan', unit: 'kg' },
    );
    expect(out.level).toBe('REVIEW_CANDIDATE');
    expect(out.merge).toBe(false);
  });

  it('level 3: exact normalized name + compatible spec + compatible unit merges', () => {
    const out = matchComponentToMaster(
      { name: 'Tandem Roller', unit: 'jam' },
      { name: 'Tandem Roller', unit: 'jam' },
    );
    expect(out.level).toBe('NAME_SPEC_UNIT');
    expect(out.merge).toBe(true);
  });

  it('level 3 refuses an exact name with a conflicting specification', () => {
    const out = matchComponentToMaster(
      { name: 'Pipa Baja', spec: 'dia 100 mm', unit: 'm' },
      { name: 'Pipa Baja', spec: 'dia 50 mm', unit: 'm' },
    );
    expect(out.level).toBe('NO_MATCH');
    expect(out.merge).toBe(false);
    expect(out.reason).toMatch(/incompatible specification/);
  });

  it('level 4: the approved-alias table starts EMPTY in §5 (bindings recorded, applied in §15)', () => {
    expect(APPROVED_ALIASES.size).toBe(0);
  });

  it('level 5: a similar name alone NEVER merges (M293 case: 0.90 similarity)', () => {
    // 'Kapur Dolomit' vs 'Kapur' — the exact false binding that produced the
    // phantom M293 @185.000. Similarity 0.90, and still not a merge.
    const out = matchComponentToMaster(
      { code: 'M293', name: 'Kapur Dolomit', unit: 'kg' },
      { sourceCode: 'M40', name: 'Kapur', unit: 'kg' },
    );
    expect(out.similarity).toBeGreaterThanOrEqual(0.9);
    expect(out.merge).toBe(false);
    expect(out.level).toBe('REVIEW_CANDIDATE');
  });

  it('level 5 refuses when the spec contradicts (diameter 100 vs 50)', () => {
    const out = matchComponentToMaster(
      { name: 'Pipa Baja dia 100 mm', unit: 'm' },
      { name: 'Pipa Baja dia 50 mm', unit: 'm' },
    );
    expect(out.merge).toBe(false);
    expect(out.level).toBe('NO_MATCH');
  });

  it('level 6: unrelated names do not match', () => {
    const out = matchComponentToMaster(
      { name: 'Agregat Halus', unit: 'm3' },
      { name: 'Baja Tulangan', unit: 'kg' },
    );
    expect(out.level).toBe('NO_MATCH');
    expect(out.merge).toBe(false);
  });

  it('ordering: level 1 wins over a conflicting name (ID beats similarity)', () => {
    const out = matchComponentToMaster(
      { canonicalId: 'RES-9', code: 'M09', name: 'Completely Different', unit: 'm3' },
      { canonicalId: 'RES-9', sourceCode: 'M09', name: 'Timbunan Pilihan', unit: 'm3' },
    );
    expect(out.level).toBe('EXACT_CANONICAL_ID');
    expect(out.merge).toBe(true);
  });
});

/* ====================================================================== */
describe('§5.4 classification', () => {
  it('coded rows classify by prefix (the reliable signal)', () => {
    expect(classifyComponent({ code: 'M293', name: 'Kapur Dolomit', array: 'materials' })).toBe('MATERIAL');
    expect(classifyComponent({ code: 'L01', name: 'Pekerja', array: 'labor' })).toBe('LABOR');
    expect(classifyComponent({ code: 'E07', name: 'CRANE', array: 'equipment' })).toBe('EQUIPMENT');
    // EI* is a MATERIAL code space even though it starts with E.
    expect(classifyComponent({ code: 'EI734', name: 'Baja Tulangan', array: 'materials' })).toBe('MATERIAL');
  });

  it('unknown prefixes are NEEDS_REVIEW, never silently dropped', () => {
    expect(classifyComponent({ code: 'J01', name: 'Mesin Bor Pipe Jacking', array: 'equipment' })).toBe('NEEDS_REVIEW');
    expect(classifyComponent({ code: 'HPE69', name: 'Gerinda Tangan', array: 'equipment' })).toBe('NEEDS_REVIEW');
  });

  it('uncoded rows classify by array; no code and no array is UNCLASSIFIED', () => {
    expect(classifyComponent({ code: '', name: 'Pekerja', array: 'labor' })).toBe('LABOR');
    expect(classifyComponent({ code: '', name: 'Semen', array: 'materials' })).toBe('MATERIAL');
    expect(classifyComponent({ code: '', name: 'X' })).toBe('UNCLASSIFIED');
  });

  it('a prefix/array contradiction classifies by PREFIX and is detectable', () => {
    const row = { code: 'M03', name: 'Pasir', array: 'labor' as const };
    expect(classifyComponent(row)).toBe('MATERIAL');
    expect(isPrefixArrayContradiction(row)).toBe(true);
    expect(isPrefixArrayContradiction({ code: 'L01', name: 'Pekerja', array: 'labor' })).toBe(false);
  });

  it('all 33,011 rows are classified (runner output)', () => {
    const c = RECON.classification54.byCategory;
    expect(c.MATERIAL).toBe(10457);
    expect(c.LABOR).toBe(15985);
    expect(c.EQUIPMENT).toBe(6559);
    expect(c.UNCLASSIFIED).toBe(0);
    expect(c.NEEDS_REVIEW).toBe(10);
    expect(c.MATERIAL + c.LABOR + c.EQUIPMENT + c.UNCLASSIFIED + c.NEEDS_REVIEW).toBe(33011);
  });

  it('the 10 NEEDS_REVIEW rows are listed with identity (not discarded)', () => {
    expect(RECON.classification54.needsReviewRows).toBe(10);
    expect(RECON.classification54.needsReviewList).toHaveLength(10);
    const codes = RECON.classification54.needsReviewList.map((r) => r.code);
    expect(codes).toContain('J.01');
    expect(codes).toContain('HPE69');
    for (const r of RECON.classification54.needsReviewList) {
      expect(r.name).toBeTruthy();
    }
  });

  it('the 424 prefix/array contradictions are counted separately', () => {
    expect(RECON.classification54.prefixArrayContradictions).toBe(424);
  });
});

/* ====================================================================== */
describe('§5.1 AHSP → master', () => {
  it('inputs: 5,801 items / 33,011 rows / 5,236 resources / 452 records / 791 keys', () => {
    expect(RECON.inputs.ahspItems).toBe(5801);
    expect(RECON.inputs.ahspComponentRows).toBe(33011);
    expect(RECON.inputs.masterResources).toBe(5236);
    expect(RECON.inputs.priceMasterRecords).toBe(452);
    expect(RECON.inputs.componentKeys).toBe(791);
    expect(RECON.inputs.keysWithPrice).toBe(121);
  });

  it('0 new master entities — proven: all 12,870 coded rows are backed', () => {
    expect(RECON.ahspToMaster51.codedComponentRows).toBe(12870);
    expect(RECON.ahspToMaster51.codedRowsBackedByMaster).toBe(12870);
    expect(RECON.ahspToMaster51.newMasterEntities).toBe(0);
  });

  it('prices exist only with a source: the 115 true-gap keys stay null + labelled', () => {
    expect(RECON.audit.trueGapKeys.count).toBe(115);
    expect(RECON.audit.trueGapKeys.componentRows).toBe(394);
    // No priceMaster record may carry a 0 price as a valid value.
    for (const r of RECORDS) {
      expect(r.price).not.toBe(0);
    }
  });

  it('duplicate groups reproduce the audit §9.2 counts exactly', () => {
    expect(RECON.duplicates.groups).toBe(273);
    expect(RECON.duplicates.byKind).toEqual({
      TRUE_DUP: 89,
      CODE_VARIANT: 61,
      NAME_ONLY_DUP: 84,
      MIXED: 39,
    });
  });

  it('duplicate-group classification follows audit §9.2 (unit cases)', () => {
    expect(classifyDuplicateGroup([
      { code: 'E05', name: 'AIR COMPRESSOR', unit: 'jam' },
      { code: 'E05', name: 'Air Compressor', unit: 'Jam' },
    ])).toBe('TRUE_DUP');
    expect(classifyDuplicateGroup([
      { code: 'E17', name: 'Tandem Roller', unit: 'jam' },
      { code: 'E17A', name: 'Tandem Roller', unit: 'jam' },
    ])).toBe('CODE_VARIANT');
    expect(classifyDuplicateGroup([
      { code: '', name: 'Batu', unit: 'm3' },
      { code: '', name: 'Batu', unit: 'm3' },
    ])).toBe('NAME_ONLY_DUP');
    expect(classifyDuplicateGroup([
      { code: 'E05', name: 'Air Compressor', unit: 'jam' },
      { code: '', name: 'Air Compressor', unit: 'jam' },
    ])).toBe('MIXED');
    // Several codes + uncoded members = CODE_VARIANT (audit precedence).
    expect(classifyDuplicateGroup([
      { code: 'E17', name: 'Tandem Roller', unit: 'jam' },
      { code: 'E17A', name: 'Tandem Roller', unit: 'jam' },
      { code: '', name: 'Tandem Roller', unit: 'jam' },
    ])).toBe('CODE_VARIANT');
  });

  it('all 89 TRUE_DUP merge decisions name a representative from their own members', () => {
    expect(RECON.duplicates.trueDupMergeDecisions).toHaveLength(89);
    for (const d of RECON.duplicates.trueDupMergeDecisions) {
      expect(d.members.length).toBeGreaterThan(1);
      expect(d.members).toContain(d.representative);
    }
  });

  it('the TRUE_DUP representative choice is deterministic', () => {
    const members = [
      { code: 'E05', name: 'AIR COMPRESSOR', unit: 'jam', resourceId: 'RES-000075' },
      { code: 'E05', name: 'Air Compressor', unit: 'jam', resourceId: 'RES-000084' },
      { code: 'E05', name: 'AIR COMPRESSOR AHX', unit: 'jam', resourceId: 'RES-000085' },
    ];
    const rep = trueDupRepresentative(members);
    expect(rep.resourceId).toBe('RES-000085'); // longest informative name
    expect(trueDupRepresentative([...members].reverse()).resourceId).toBe('RES-000085');
  });
});

/* ====================================================================== */
describe('§5.2 master → AHSP', () => {
  it('0 master-only resources in the index sense (all trace to AHSP items)', () => {
    expect(RECON.masterToAhsp52.masterOnlyResourcesIndexSense).toBe(0);
    expect(RECON.masterToAhsp52.masterOnlyResourceIds).toHaveLength(0);
  });

  it('no bulk import: the 12,735 unreferenced price rows are reported, priceMaster stays 452', () => {
    expect(RECON.audit.unreferencedPriceRows.count).toBe(12735);
    expect(PRICE_MASTER.count).toBe(452);
    expect(RECORDS).toHaveLength(452);
  });

  it('no fabricated AHSP codes: every verified binding targets an audited key', () => {
    const bindings = RECON.decisions!.verifiedBindings;
    expect(bindings).toHaveLength(10);
    const targets = bindings.map((b) => b.targetKey).sort();
    expect(targets).toEqual([
      'A1NH|bh', 'A2NH|bh', 'B1NH|bh', 'B2NH|bh', 'C1NH|bh', 'C2NH|bh',
      'E17|jam', 'E17|jam', 'E17|jam', 'M397C|m',
    ].sort());
    for (const b of bindings) {
      expect(b.status).toBe('VERIFIED');
      expect(['NAME_SPEC_UNIT', 'EXACT_SOURCE_ID']).toContain(b.method);
    }
  });

  it('registry extension is staged, not silently applied: 4 rules ready for §15, 6 blocked on M-4', () => {
    const bindings = RECON.decisions!.verifiedBindings;
    const ready = bindings.filter((b) => b.registryAction === 'APPLY_IN_§15');
    const blocked = bindings.filter((b) => b.registryAction.startsWith('BLOCKED_ON_M4'));
    expect(ready).toHaveLength(4);
    expect(blocked).toHaveLength(6);
    for (const b of ready) expect(b.proposedAliasRule).toBeTruthy();
    for (const b of blocked) expect(b.proposedAliasRule).toBe(null);
  });
});

/* ====================================================================== */
describe('§16.B reconciliation table', () => {
  it('the category TOTAL row carries the §5 headline numbers', () => {
    const t = RECON.table16B.byCategory.TOTAL;
    expect(t.masterRecordsScanned).toBe(452);
    expect(t.ahspComponentsScanned).toBe(33011);
    expect(t.verifiedMatches).toBe(13);
    expect(t.newMasterRecords).toBe(0);
    expect(t.masterOnlyRecords).toBe(0);
    expect(t.duplicateCandidates).toBe(273);
    expect(t.unitConflicts).toBe(342);
    expect(t.priceConflicts).toBe(159);
    expect(t.missingPrices).toBe(115);
    expect(t.unresolvedRecords).toBe(115);
  });

  it('the family TOTAL row agrees with the category TOTAL row', () => {
    const cat = RECON.table16B.byCategory.TOTAL;
    const fam = RECON.table16B.byFamily.TOTAL;
    for (const k of Object.keys(cat)) {
      if (k === 'verifiedMatches') continue; // family-agnostic by design
      expect(fam[k]).toBe(cat[k]);
    }
  });

  it('per-category rows: material 75 / labor 6 / equipment 34 missing prices', () => {
    expect(RECON.table16B.byCategory.MATERIAL.missingPrices).toBe(75);
    expect(RECON.table16B.byCategory.LABOR.missingPrices).toBe(6);
    expect(RECON.table16B.byCategory.EQUIPMENT.missingPrices).toBe(34);
    expect(RECON.table16B.byCategory.MATERIAL.priceConflicts).toBe(98);
    expect(RECON.table16B.byCategory.LABOR.priceConflicts).toBe(10);
    expect(RECON.table16B.byCategory.EQUIPMENT.priceConflicts).toBe(51);
  });

  it('per-family rows: BM 64 / SDA 51 missing prices, CK 0; all 342 missing-unit rows are CK', () => {
    expect(RECON.table16B.byFamily.BINA_MARGA.missingPrices).toBe(64);
    expect(RECON.table16B.byFamily.SUMBER_DAYA_AIR.missingPrices).toBe(51);
    expect(RECON.table16B.byFamily.CIPTA_KARYA.missingPrices).toBe(0);
    expect(RECON.unitConflicts.missingUnitRows).toBe(342);
    expect(RECON.unitConflicts.missingUnitByFamily.CIPTA_KARYA).toBe(342);
    expect(RECON.unitConflicts.missingUnitByFamily.BINA_MARGA).toBe(0);
    expect(RECON.unitConflicts.missingUnitByFamily.SUMBER_DAYA_AIR).toBe(0);
  });

  it('verified matches: 596 registry VERIFIED bindings, 13 priceMaster VERIFIED records', () => {
    expect(RECON.verifiedMatches.registryVerifiedBindings).toBe(596);
    expect(RECON.verifiedMatches.priceMasterVerifiedRecords).toBe(13);
    expect(RECON.inputs.registryBindings).toBe(1276);
    expect(RECON.inputs.registryEntities).toBe(267);
    expect(RECON.inputs.registryUnbound).toBe(3188);
  });
});

/* ====================================================================== */
describe('Fase-7 priorities (decided-with-evidence vs unresolved-labelled)', () => {
  const byId = new Map(
    (RECON.decisions?.phase7 ?? []).map((p) => [p.id, p]),
  );

  it('all 11 priorities are present with a status', () => {
    expect(RECON.decisions!.phase7).toHaveLength(11);
    for (const p of RECON.decisions!.phase7) {
      expect(p.status).toBeTruthy();
      expect(p.item).toBeGreaterThanOrEqual(1);
      expect(p.item).toBeLessThanOrEqual(11);
    }
  });

  it('decided with evidence: M293 = 760, M09 = 25.000, E07/E11 swap refuted', () => {
    expect(byId.get('M293')!.status).toBe('DECIDED_WITH_EVIDENCE');
    expect(byId.get('M293')!.decidedPrice).toBe(760);
    expect(byId.get('M09')!.status).toBe('DECIDED_WITH_EVIDENCE');
    expect(byId.get('M09')!.decidedPrice).toBe(25000);
    expect(byId.get('E07/E11')!.status).toBe('DECIDED_WITH_EVIDENCE');
  });

  it('decided: L.05/L.06 is a proven extraction regression (fix specified, not applied)', () => {
    expect(byId.get('L.05/L.06')!.status).toBe('DECIDED_REGRESSION_PROVEN');
  });

  it('unresolved + labelled: M170 OPEN, SDA gap open, CK units open, generators BLOCKED', () => {
    expect(byId.get('M170')!.status).toBe('OPEN');
    expect(byId.get('SDA-GAP')!.status).toBe('VERIFIED_OPEN');
    expect(byId.get('CK-UNITS-191')!.status).toBe('VERIFIED_OPEN');
    expect(byId.get('BM-SMKK-GENERATORS')!.status).toBe('BLOCKED_DOCUMENTED');
  });

  it('bulk verdicts: 115 keys verified by runtime probe; ambiguities 113/43; conflicts 130/29', () => {
    expect(byId.get('TRUE-GAP-115')!.status).toBe('VERIFIED_WITH_RUNTIME_PROBE');
    expect(byId.get('AMBIG-156')!.status).toBe('DECIDED_113_REVIEW_43');
    expect(byId.get('CONF-159')!.status).toBe('DECIDED_130_REVIEW_29');
    expect(RECON.decisions!.ambiguities).toEqual({ decided: 113, needsReview: 43, items: expect.any(Array) });
    expect(RECON.decisions!.conflicts).toEqual({ decided: 130, needsReview: 29, items: expect.any(Array) });
    expect(RECON.decisions!.ambiguities.items).toHaveLength(156);
    expect(RECON.decisions!.conflicts.items).toHaveLength(159);
  });

  it('every ambiguity/conflict verdict carries evidence', () => {
    for (const a of RECON.decisions!.ambiguities.items as { evidence?: string; reason?: string }[]) {
      expect(a.evidence ?? a.reason).toBeTruthy();
    }
    for (const c of RECON.decisions!.conflicts.items as { evidence?: string }[]) {
      expect(c.evidence).toBeTruthy();
    }
  });
});

/* ====================================================================== */
describe('conflicts (§4 surface preserved, §5 audit surface decided)', () => {
  it('the 50 pipeline conflict groups recomputed from priceMaster == conflicts.json', () => {
    expect(CONFLICTS.count).toBe(50);
    expect(CONFLICTS.conflicts).toHaveLength(50);
    const groups = findConflictGroups(RECORDS);
    expect(groups.size).toBe(50);
    expect(new Set(groups.keys())).toEqual(
      new Set(CONFLICTS.conflicts.map((g) => g.identity)),
    );
  });

  it('48/50 groups stay ambiguous WITHIN the preferred source (flagged, alternatives returned)', () => {
    const groups = findConflictGroups(RECORDS);
    let ambiguous = 0;
    for (const g of CONFLICTS.conflicts) {
      const sel = selectMasterPriceCandidate(groups.get(g.identity)!, {
        preferredSourceKey: g.preferred,
      });
      expect(sel.selected).not.toBe(null);
      expect(sel.alternatives.length).toBe(sel.candidateCount - 1);
      if (sel.ambiguousWithinPreferredSource) {
        ambiguous += 1;
        expect(sel.reason).toMatch(/admin review required/);
      }
    }
    expect(ambiguous).toBe(48);
  });

  it('the audit 159 groups: 153 cross-source, 6 intra-source', () => {
    expect(RECON.audit.conflicts.count).toBe(159);
    expect(RECON.audit.conflicts.crossSource).toBe(153);
    expect(RECON.audit.conflicts.intraSource).toBe(6);
  });
});
