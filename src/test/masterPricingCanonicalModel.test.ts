/**
 * MASTER PRICING §3 — CANONICAL MODEL (M-1/M-2/M-3/M-6 + I-5/I-9/I-11).
 *
 * Run: npx vitest run src/test/masterPricingCanonicalModel.test.ts
 * Prerequisite: run AFTER `npm run price:pipeline` (§3) — the suite reads
 * the regenerated files (resourceIndex + priceMaster + source identity
 * registry) and the validated JSONs.
 *
 * What is pinned here (and why each pin exists):
 * - §3.1 entity identity: RES-xxx stable; §3.1 fields filled; category
 *   valid; active = not DEFECTIVE; aliases verified-only (traceable to a
 *   roster alias or an explicit alias rule — never name-guessed).
 * - §3.2 source identity registry: one entity → many sources; JSON file
 *   == TS projection (round-trip); NEEDS_REVIEW carries an explicit
 *   reason; unproven bindings never enter (quarantined keys, name-gate
 *   failures, and entries failing both tiers stay in `unbound` with a
 *   reason). Direct CK/BM bindings are two-tier: EXACT_CODE → VERIFIED,
 *   NAME_UNIT → NEEDS_REVIEW (never auto-VERIFIED).
 * - §3.3 entity != price identity: one material, many valid price
 *   records (RES-001241 Besi Beton: 83 records, never merged); price
 *   identity components always filled; duplicate price contexts are
 *   never silently merged — the 50 multi-price groups are disclosed in
 *   conflicts.json with a SOURCE_PRIORITY resolution; the 5-tuple is
 *   the identity FORM, not a uniqueness key (209 distinct 5-tuples
 *   among 899 records); version/status/effectiveTo filled.
 * - Spec-different = different identity: keramik 30x30 vs 60x60, CPHMA
 *   curah vs kemasan, kaca 5mm vs 8mm, semen M12 kg vs ton — pinned by
 *   real RES ids from the canonical master.
 * - I-5: MAT-CANON-xxx frozen as a specification-only registry.
 * - I-9: uniform DHSP reader == the two raw maps, entry for entry, and
 *   == the resolver's DHSP-derived price on a real sample (the §6 seam).
 * - I-11: snapshot/version fields filled with safe defaults (SNAPSHOT).
 * - M-6/R-7: no 2022 legacy price resolves for a 2026 query anywhere in
 *   PriceRepository; the archive itself is preserved (tier LEGACY).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_RESOURCE_INDEX,
  CANONICAL_RESOURCE_INDEX_COUNT,
  COMPONENT_KEYS,
  COMPONENT_KEY_COUNT,
  COMPONENT_KEY_REPRESENTATIVES,
} from '../data/priceDatabase2026/resourceIndex.generated';
import {
  RESOURCE_PRICE_RECORDS,
  RESOURCE_PRICE_RECORD_COUNT,
} from '../data/priceDatabase2026/priceMaster.generated';
import {
  SOURCE_IDENTITY_BINDINGS,
  SOURCE_IDENTITY_BINDING_COUNT,
  SOURCE_IDENTITY_ENTITY_COUNT,
} from '../data/priceDatabase2026/sourceIdentityRegistry.generated';
import {
  getSourceBindings,
  getSourceDatasets,
  getBindingsByDataset,
  hasVerifiedBinding,
  getRegistryCounts,
} from '../data/priceDatabase2026/sourceIdentityRegistry';
import {
  MASTER_PRICE_VERSION,
  DEFAULT_SNAPSHOT_PRICING_MODE,
  type SourceIdentityRegistryFile,
} from '../data/priceDatabase2026/types';
import { looseCode, normalizeUnit } from '../data/priceDatabase2026/normalize';
import { AHSP_DATABASE_VERSION } from '../data/nationalCostDatabase/types';
import { getDhspEntry, getDhspPrice } from '../data/nationalCostDatabase/dhspMapReader';
import { OFFICIAL_CK_2026_DHSP_MAP } from '../data/nationalCostDatabase/officialCiptaKaryaDhsp2026';
import { OFFICIAL_BM_2026_DHSP_MAP } from '../data/nationalCostDatabase/binaMarga2026Adapter';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import {
  CostDatabaseEngine,
  ALL_OFFICIAL_AHSP_ITEMS,
} from '../data/nationalCostDatabase/masterRegistry';
import { AHSPCalculationEngine } from '../engine/ahspCalculationEngine';
import {
  buildBaselineVersion,
  createRevision,
  validateVersionSnapshot,
} from '../engine/estimateVersioning';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { CANONICAL_MATERIALS } from '../engine/pricing/canonical/canonicalMaterialMaster';
import { LaborDatabaseService } from '../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../domain/equipment/equipmentDatabaseService';
import { pipelineNameCompatible } from '../../scripts/price2026/matcherHardening';
import { NAME_COMPATIBLE_THRESHOLD, NAME_ONLY_THRESHOLD } from '../../scripts/price2026/core';
import type { EstimateVersion } from '../types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
}

const registryFile = readJson<SourceIdentityRegistryFile>(
  'data/price2026/validated/source_identity_registry.json'
);
const matchReport = readJson<{
  canonicalModel: {
    entities: number;
    active: number;
    inactive: number;
    entitiesWithAliases: number;
    aliasesAttached: number;
    keyRepresentatives: number;
  };
}>('data/price2026/validated/match_report.json');
const aliasRules = readJson<{
  version: string;
  rules: Array<{ id: string; sourceName?: string }>;
}>('data/price2026/aliases.json');
const priceRows = readJson<{
  rows: Array<{ id: string; resourceName: string; unitRaw: string }>;
}>('data/price2026/normalized/price_rows.json');
const conflictsFile = readJson<{
  count: number;
  conflicts: Array<{
    identity: string;
    resourceId: string;
    unit: string;
    candidates: Array<{ price: number; sourceKey: string }>;
    resolution: string;
    preferred: string | null;
  }>;
}>('data/price2026/validated/conflicts.json');

const indexById = new Map(CANONICAL_RESOURCE_INDEX.map((r) => [r.resourceId, r]));
const keyByKey = new Map(COMPONENT_KEYS.map((k) => [k.key, k]));
const quarantinedKeys = new Set(COMPONENT_KEYS.filter((k) => k.quarantined).map((k) => k.key));

// ===========================================================================
// §3.1 — canonical entity identity (M-1)
// ===========================================================================

describe('§3.1 identitas entitas kanonis (M-1)', () => {
  it('5.185 entitas, RES-xxx stabil & unik — ID kanonis tidak diganti', () => {
    expect(CANONICAL_RESOURCE_INDEX_COUNT).toBe(5185);
    expect(CANONICAL_RESOURCE_INDEX.length).toBe(5185);
    expect(COMPONENT_KEY_COUNT).toBe(790);
    expect(RESOURCE_PRICE_RECORD_COUNT).toBe(899);
    const ids = CANONICAL_RESOURCE_INDEX.map((r) => r.resourceId);
    expect(new Set(ids).size).toBe(5185);
    for (const id of ids) expect(id).toMatch(/^RES-\d{6}$/);
  });

  it('kategori valid (MATERIAL/LABOR/EQUIPMENT/UNKNOWN) dan konsisten dengan type', () => {
    const allowed = new Set(['MATERIAL', 'LABOR', 'EQUIPMENT', 'UNKNOWN']);
    for (const r of CANONICAL_RESOURCE_INDEX) {
      expect(allowed.has(r.category)).toBe(true);
      expect(r.category.toLowerCase()).toBe(r.type);
    }
    const byCategory = new Map<string, number>();
    for (const r of CANONICAL_RESOURCE_INDEX) {
      byCategory.set(r.category, (byCategory.get(r.category) || 0) + 1);
    }
    expect(byCategory.get('MATERIAL')).toBe(3712);
    expect(byCategory.get('LABOR')).toBe(259);
    expect(byCategory.get('EQUIPMENT')).toBe(1214);
  });

  it('field §3.1 terisi pada setiap entitas (null hanya di mana sumber tidak punya datanya)', () => {
    for (const r of CANONICAL_RESOURCE_INDEX) {
      expect(typeof r.canonicalName).toBe('string');
      expect(['RESOURCE_MASTER', 'COMPONENT_USAGE', 'NONE']).toContain(r.nameSource);
      expect(r.primaryUnit).toBe(r.unit);
      // The canonical master carries NO specification/description field —
      // null is the honest value (§3 never invents one).
      expect(r.specification).toBeNull();
      expect(r.description).toBeNull();
      expect(Array.isArray(r.specTokens)).toBe(true);
      expect(Array.isArray(r.aliases)).toBe(true);
      expect(typeof r.active).toBe('boolean');
      expect(Number.isNaN(Date.parse(r.createdAt))).toBe(false);
      expect(Number.isNaN(Date.parse(r.updatedAt))).toBe(false);
      expect(r.recordSource).toBe('AHSP_2026_CANONICAL_RESOURCES');
      expect(r.sourceDocument).toBe('SE DJBK No. 47/SE/Dk/2026');
      expect([null, 'CIPTA_KARYA', 'BINA_MARGA', 'SDA']).toContain(r.sourceDomain);
    }
  });

  it('canonicalName fallback terdokumentasi lewat nameSource', () => {
    let componentUsage = 0;
    let none = 0;
    for (const r of CANONICAL_RESOURCE_INDEX) {
      if (r.nameSource === 'RESOURCE_MASTER') {
        expect(r.canonicalName).toBe(r.name);
        expect(r.name.length).toBeGreaterThan(0);
      } else if (r.nameSource === 'COMPONENT_USAGE') {
        componentUsage++;
        expect(r.name).toBe('');
        expect(r.canonicalName.length).toBeGreaterThan(0);
      } else {
        none++;
        expect(r.name).toBe('');
        expect(r.canonicalName).toBe('');
      }
    }
    // Empty-name rows are rare (DEFECTIVE EMPTY_NAME class); the fallback
    // must have rescued at least one, and NONE must stay tiny.
    expect(componentUsage).toBeGreaterThan(0);
    expect(none).toBeLessThan(50);
  });

  it('active = bukan DEFECTIVE (108 baris tercemar nonaktif, tidak pernah berharga)', () => {
    let inactive = 0;
    for (const r of CANONICAL_RESOURCE_INDEX) {
      expect(r.active).toBe(r.quality !== 'DEFECTIVE');
      if (!r.active) inactive++;
    }
    expect(inactive).toBe(108);
    expect(matchReport.canonicalModel.inactive).toBe(108);
    expect(matchReport.canonicalModel.active).toBe(5185 - 108);
  });

  it('alias hanya yang terverifikasi (roster alias atau aturan alias eksplisit)', () => {
    const verified = new Set<string>();
    for (const l of LaborDatabaseService.getInstance().getAllLabor() as any[]) {
      for (const a of l.aliases || []) verified.add(String(a).trim());
    }
    for (const e of EquipmentDatabaseService.getInstance().getAllEquipment() as any[]) {
      for (const a of e.aliases || []) verified.add(String(a).trim());
    }
    for (const rule of aliasRules.rules) {
      if (rule.sourceName) verified.add(rule.sourceName.trim());
    }
    let entitiesWithAliases = 0;
    let aliasesAttached = 0;
    for (const r of CANONICAL_RESOURCE_INDEX) {
      expect(new Set(r.aliases).size).toBe(r.aliases.length); // unique
      expect([...r.aliases].sort()).toEqual(r.aliases); // sorted
      if (r.aliases.length > 0) {
        entitiesWithAliases++;
        aliasesAttached += r.aliases.length;
        for (const a of r.aliases) {
          expect(verified.has(a)).toBe(true);
        }
      }
    }
    expect(entitiesWithAliases).toBe(matchReport.canonicalModel.entitiesWithAliases);
    expect(aliasesAttached).toBe(matchReport.canonicalModel.aliasesAttached);
    // The 4 explicit alias rules must have attached (each names a real entity).
    expect(entitiesWithAliases).toBeGreaterThanOrEqual(4);
  });

  it('key representatives: turunan ulang aturan matcher cocok dengan peta terbitan', () => {
    const rank = (q: string) => (q === 'CLEAN' ? 0 : q === 'SUSPECT' ? 1 : 2);
    const groups = new Map<string, { rep: (typeof CANONICAL_RESOURCE_INDEX)[number]; index: number }>();
    CANONICAL_RESOURCE_INDEX.forEach((r, i) => {
      if (!r.code) return;
      const key = `${looseCode(r.code)}|${r.unit}`;
      const cur = groups.get(key);
      if (!cur) {
        groups.set(key, { rep: r, index: i });
        return;
      }
      const better =
        rank(r.quality) < rank(cur.rep.quality) ||
        (rank(r.quality) === rank(cur.rep.quality) && r.name.length < cur.rep.name.length) ||
        (rank(r.quality) === rank(cur.rep.quality) &&
          r.name.length === cur.rep.name.length &&
          i < cur.index);
      if (better) groups.set(key, { rep: r, index: i });
    });
    const published = new Map(COMPONENT_KEY_REPRESENTATIVES.map((e) => [e.key, e.resourceId]));
    expect(published.size).toBe(groups.size);
    expect(published.size).toBe(matchReport.canonicalModel.keyRepresentatives);
    for (const [key, g] of groups) {
      expect(published.get(key)).toBe(g.rep.resourceId);
      expect(indexById.has(g.rep.resourceId)).toBe(true);
    }
  });
});

// ===========================================================================
// §3.2 — source identity registry (M-2)
// ===========================================================================

describe('§3.2 source identity registry (M-2)', () => {
  it('round-trip: JSON tervalidasi == proyeksi TS (hitung + isi)', () => {
    expect(registryFile.version).toBe('2026.1');
    expect(registryFile.counts.bindings).toBe(SOURCE_IDENTITY_BINDING_COUNT);
    expect(registryFile.counts.bindings).toBe(SOURCE_IDENTITY_BINDINGS.length);
    expect(registryFile.counts.bindings).toBe(registryFile.bindings.length);
    expect(registryFile.counts.entities).toBe(SOURCE_IDENTITY_ENTITY_COUNT);
    expect(registryFile.counts.unbound).toBe(registryFile.unbound.length);
    expect(registryFile.bindings).toEqual(SOURCE_IDENTITY_BINDINGS);
    expect(getRegistryCounts()).toEqual({
      bindings: SOURCE_IDENTITY_BINDING_COUNT,
      entities: SOURCE_IDENTITY_ENTITY_COUNT,
    });
    const byDataset: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const b of SOURCE_IDENTITY_BINDINGS) {
      byDataset[b.sourceDataset] = (byDataset[b.sourceDataset] || 0) + 1;
      byStatus[b.verificationStatus] = (byStatus[b.verificationStatus] || 0) + 1;
    }
    expect(registryFile.counts.byDataset).toEqual(byDataset);
    expect(registryFile.counts.byVerificationStatus).toEqual(byStatus);
    expect(new Set(SOURCE_IDENTITY_BINDINGS.map((b) => b.resourceId)).size).toBe(
      registryFile.counts.entities
    );
  });

  it('setiap binding menunjuk entitas RES-xxx yang ada (tanpa RES-KEY-*)', () => {
    for (const b of SOURCE_IDENTITY_BINDINGS) {
      expect(b.resourceId).toMatch(/^RES-\d{6}$/);
      expect(indexById.has(b.resourceId)).toBe(true);
      expect(b.sourceDataset).toBeTruthy();
      // sourceCode is empty for code-less CK entries bound by NAME_UNIT
      // (the workbook extraction identifies them by name+unit only);
      // an EXACT_CODE binding must always carry a code.
      expect(typeof b.sourceCode).toBe('string');
      if (b.matchMethod === 'EXACT_CODE') expect(b.sourceCode).toBeTruthy();
      if (!b.sourceCode) expect(b.matchMethod).toBe('NAME_UNIT');
      expect(typeof b.originalDescription).toBe('string');
      expect(typeof b.originalUnit).toBe('string');
      expect(b.matchConfidence).toBeGreaterThanOrEqual(0);
      expect(b.matchConfidence).toBeLessThanOrEqual(1);
      expect(Number.isNaN(Date.parse(b.createdAt))).toBe(false);
    }
  });

  it('satu entitas → banyak sumber (RES-001241 Besi Beton: ≥3 dataset)', () => {
    const datasets = getSourceDatasets('RES-001241');
    expect(datasets.length).toBeGreaterThanOrEqual(3);
    expect(datasets).toContain('HSD_2026');
    expect(datasets).toContain('MATERIAL_MASTER_2026');
    expect(datasets).toContain('COMMERCIAL_2026');
    const bindings = getSourceBindings('RES-001241');
    expect(bindings.length).toBeGreaterThanOrEqual(3);
    expect(hasVerifiedBinding('RES-001241')).toBe(true);
    expect(getBindingsByDataset('HSD_2026').length).toBeGreaterThan(0);
    expect(getSourceBindings('RES-999999')).toEqual([]);
  });

  it('tidak ada ikatan priceMaster yang hilang karena dedup (identitas, bukan harga)', () => {
    const preById = new Map(priceRows.rows.map((r) => [r.id, r]));
    for (const r of RESOURCE_PRICE_RECORDS) {
      // NAME_KEY / COMPONENT_REF records (adopsi pasar 2026-11-17) bind
      // by (name, unit) to codeless components — the identity registry
      // only binds canonical RES-xxx entities, so no registry binding
      // exists for them by design. Their identity is pinned instead:
      // RES-KEY id + sourceRecordId + unit must be present and stable.
      if (r.matchMethod === 'NAME_KEY' || r.matchMethod === 'COMPONENT_REF') {
        expect(r.resourceId).toMatch(/^RES-KEY-[0-9a-z]{8,9}$/);
        expect(r.sourceRecordId).toBeTruthy();
        expect(r.unit).toBeTruthy();
        continue;
      }
      const pre = preById.get(r.id);
      // The registry dedups on (entity, dataset, sourceRecordId, sourceCode,
      // originalUnit); the pre-match sourceCode lives only in price_rows,
      // so verify the binding exists on the checkable part of the identity.
      const found = SOURCE_IDENTITY_BINDINGS.some(
        (b) =>
          b.resourceId === r.resourceId &&
          b.sourceDataset === r.sourceKey &&
          (b.sourceRecordId || '') === (r.sourceRecordId || '') &&
          b.originalUnit === (pre?.unitRaw || r.unitRaw)
      );
      expect(found).toBe(true);
    }
  });

  it('NEEDS_REVIEW selalu membawa alasan eksplisit; VERIFIED boleh membawa catatan asal', () => {
    let needsReview = 0;
    for (const b of SOURCE_IDENTITY_BINDINGS) {
      expect(['VERIFIED', 'SOURCE_REPORTED', 'NEEDS_REVIEW']).toContain(b.verificationStatus);
      if (b.verificationStatus === 'NEEDS_REVIEW') {
        needsReview++;
        expect(b.verificationNote).toBeTruthy();
        expect(b.matchMethod).toBe('NAME_UNIT');
      } else if (b.verificationNote !== null) {
        // VERIFIED bindings may carry a provenance note (e.g. the explicit
        // alias rule that produced an ALIAS binding) — never an empty one.
        expect(b.verificationNote).toBeTruthy();
      }
    }
    expect(needsReview).toBeGreaterThan(0);
  });

  it('ikatan tak-terbukti TIDAK masuk registry (unbound beralasan, bukan hilang diam-diam)', () => {
    const reasons = new Set(['NO_COMPONENT_KEY', 'NO_CANONICAL_ENTITY', 'NAME_GATE_REJECTED', 'TYPE_MISMATCH', 'QUARANTINED_KEY']);
    for (const u of registryFile.unbound) {
      expect(reasons.has(u.reason)).toBe(true);
      expect(u.detail).toBeTruthy();
      expect(u.sourceDataset).toBeTruthy();
    }
    // No binding may resolve through a quarantined component key.
    for (const b of SOURCE_IDENTITY_BINDINGS) {
      if (!b.ahspComponentCode) continue;
      const key = `${looseCode(b.ahspComponentCode)}|${normalizeUnit(b.originalUnit)}`;
      expect(quarantinedKeys.has(key)).toBe(false);
    }
  });

  it('binding CK/BM lolos gerbang pipeline — per tier (EXACT_CODE VERIFIED / NAME_UNIT NEEDS_REVIEW)', () => {
    let exactChecked = 0;
    let nameChecked = 0;
    for (const b of SOURCE_IDENTITY_BINDINGS) {
      if (b.sourceDataset !== 'CK_HSD_2026' && b.sourceDataset !== 'BM_HSD_2026') continue;
      expect(b.sourceRecordId).toBeNull(); // workbook rows carry no stable record id
      if (b.matchMethod === 'EXACT_CODE') {
        expect(b.verificationStatus).toBe('VERIFIED');
        const key = `${looseCode(b.ahspComponentCode || '')}|${normalizeUnit(b.originalUnit)}`;
        const ck = keyByKey.get(key);
        expect(ck).toBeDefined();
        const sim = pipelineNameCompatible(b.originalDescription, ck!.name);
        expect(sim).toBeGreaterThanOrEqual(NAME_COMPATIBLE_THRESHOLD);
        exactChecked++;
      } else {
        // NAME_UNIT tier: strict name+unit, never auto-VERIFIED.
        expect(b.matchMethod).toBe('NAME_UNIT');
        expect(b.verificationStatus).toBe('NEEDS_REVIEW');
        expect(b.verificationNote).toBeTruthy();
        expect(b.matchConfidence).toBeGreaterThanOrEqual(NAME_ONLY_THRESHOLD);
        nameChecked++;
      }
    }
    // Both tiers must be exercised: BM has codes (EXACT_CODE), CK is
    // mostly code-less (NAME_UNIT rescues the name+unit-identifiable rows).
    expect(exactChecked).toBeGreaterThan(0);
    expect(nameChecked).toBeGreaterThan(0);
  });
});

// ===========================================================================
// §3.3 — entity identity vs price identity (M-3)
// ===========================================================================

describe('§3.3 identitas entitas ≠ identitas harga (M-3)', () => {
  it('satu material, banyak record harga valid — tidak pernah di-merge (RES-001241: 83)', () => {
    const records = RESOURCE_PRICE_RECORDS.filter((r) => r.resourceId === 'RES-001241');
    expect(records.length).toBe(83);
    // Same entity, same canonical name/code — different prices/contexts.
    for (const r of records) {
      expect(r.resourceCode).toBe('M57a');
      expect(r.resourceName).toBe('Besi Beton');
    }
    const prices = new Set(records.map((r) => r.price));
    expect(prices.size).toBeGreaterThan(1); // not merged into one ambiguous value
    const contexts = new Set(
      records.map((r) => [r.unit, r.location.level, r.location.provinceName || '', r.period.label, r.sourceKey].join('|'))
    );
    expect(contexts.size).toBeGreaterThan(1);
    const sources = new Set(records.map((r) => r.sourceKey));
    expect(sources.size).toBe(3);
  });

  it('setiap record membawa komponen identitas harga lengkap + PRC id unik', () => {
    const ids = new Set<string>();
    for (const r of RESOURCE_PRICE_RECORDS) {
      // RES-KEY-<hash8> is the explicit shape for NAME_KEY / COMPONENT_REF
      // records (adopsi pasar 2026-11-17): codeless components have no
      // canonical RES-xxx entity, so the matcher mints a deterministic
      // name-key id instead of fabricating a canonical identity. The
      // canonical index itself (line ~146) and the identity bindings
      // (line ~309) still carry RES-\d{6} only — pinned there.
      expect(r.resourceId).toMatch(/^RES-(\d{6}|KEY-[0-9a-z]{8,9})$/);
      expect(r.unit).toBeTruthy();
      expect(r.location.level).toBeTruthy();
      expect(r.period.label).toBeTruthy();
      expect(r.sourceKey).toBeTruthy();
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
    expect(ids.size).toBe(899);
  });

  it('5-tuple BUKAN kunci unik — duplikat tidak di-merge, tapi terdokumentasi persis (50 grup konflik)', () => {
    // DATA FACT (measured 2026-11-16): only 209 distinct
    // (resourceId, unit, lokasi, periode, sourceKey) 5-tuples among 899
    // records — e.g. RES-001241 Besi Beton has SIX commercial rows at the
    // same NATIONAL/2026-Q1 context (BJ-001..BJ-006, different roster
    // entries, prices 12.500/13.200). The 5-tuple is the price identity
    // FORM (§3.3), not a uniqueness key: distinct source records may
    // legitimately share it. §3.3's real guarantee is that such
    // duplicates are NEVER silently merged — every (resourceId, unit,
    // lokasi, periode) group with >1 distinct price survives as separate
    // records AND is disclosed in conflicts.json with a SOURCE_PRIORITY
    // resolution and a named preferred source.
    const groups = new Map<string, number[]>();
    for (const r of RESOURCE_PRICE_RECORDS) {
      const identity = [
        r.resourceId,
        r.unit,
        r.location.level,
        r.location.provinceName || '',
        r.location.regencyName || '',
        r.period.label,
      ].join('|');
      const list = groups.get(identity) || [];
      list.push(r.price);
      groups.set(identity, list);
    }
    const multiPrice = new Set(
      [...groups.entries()].filter(([, prices]) => new Set(prices).size > 1).map(([id]) => id)
    );
    expect(multiPrice.size).toBe(55);
    expect(conflictsFile.count).toBe(55);
    expect(new Set(conflictsFile.conflicts.map((c) => c.identity))).toEqual(multiPrice);
    for (const c of conflictsFile.conflicts) {
      expect(c.resolution).toBe('SOURCE_PRIORITY');
      expect(c.candidates.length).toBeGreaterThan(1);
      expect(new Set(c.candidates.map((x) => x.price)).size).toBeGreaterThan(1);
      expect(c.preferred).toBeTruthy();
      expect(c.candidates.map((x) => x.sourceKey)).toContain(c.preferred);
    }
    // The records themselves survive: 899 records, none merged away.
    expect(RESOURCE_PRICE_RECORDS.length).toBe(899);
  });

  it('version + status + effectiveTo terisi pada setiap record harga', () => {
    for (const r of RESOURCE_PRICE_RECORDS) {
      expect(r.version).toBe(1);
      expect(r.status).toBe('ACTIVE');
      expect(r.period.effectiveTo).toBeNull(); // open-ended
      expect(r.price).toBeGreaterThan(0); // missing price is null/absent, never 0
    }
  });
});

// ===========================================================================
// Spesifikasi berbeda = identitas berbeda (R-5)
// ===========================================================================

describe('spesifikasi berbeda = identitas berbeda (R-5)', () => {
  it('keramik 30x30 vs 60x60: dua entitas (RES-002787 vs RES-002789)', () => {
    const a = indexById.get('RES-002787')!;
    const b = indexById.get('RES-002789')!;
    expect(a.name).toMatch(/30x30/);
    expect(b.name).toMatch(/60x60/);
    expect(a.unit).toBe(b.unit);
    expect(a.resourceId).not.toBe(b.resourceId);
    expect(a.specTokens).not.toEqual(b.specTokens);
  });

  it('CPHMA curah vs kemasan: dua entitas (RES-002181 vs RES-002182)', () => {
    const a = indexById.get('RES-002181')!;
    const b = indexById.get('RES-002182')!;
    expect(a.name).toMatch(/Curah/i);
    expect(b.name).toMatch(/Kemasan/i);
    expect(a.unit).toBe(b.unit);
    expect(a.resourceId).not.toBe(b.resourceId);
  });

  it('kaca cermin 5mm vs 8mm: dua entitas (RES-003146 vs RES-003147)', () => {
    const a = indexById.get('RES-003146')!;
    const b = indexById.get('RES-003147')!;
    expect(a.name).toMatch(/5 mm/);
    expect(b.name).toMatch(/8 mm/);
    expect(a.resourceId).not.toBe(b.resourceId);
    expect(a.specTokens).not.toEqual(b.specTokens);
  });

  it('semen M12 kg vs ton: kode+nama sama, satuan beda = identitas beda', () => {
    const a = indexById.get('RES-004655')!;
    const b = indexById.get('RES-004657')!;
    expect(a.code).toBe(b.code);
    expect(a.name).toBe(b.name);
    expect(a.unit).not.toBe(b.unit);
    expect(a.resourceId).not.toBe(b.resourceId);
  });
});

// ===========================================================================
// I-5 — MAT-CANON frozen
// ===========================================================================

describe('I-5 MAT-CANON-xxx dibekukan sebagai registry spesifikasi', () => {
  it('24 entri, ID unik, tanpa referensi RES-xxx, semua berspesifikasi', () => {
    expect(CANONICAL_MATERIALS.length).toBe(24);
    const ids = CANONICAL_MATERIALS.map((m) => m.materialId);
    expect(new Set(ids).size).toBe(24);
    for (const m of CANONICAL_MATERIALS) {
      expect(m.materialId).toMatch(/^MAT-CANON-\d{3}$/);
      expect(JSON.stringify(m)).not.toMatch(/RES-\d{6}/);
      expect(m.specification).toBeTruthy();
      expect(m.unit).toBeTruthy();
      expect(m.aliases.length).toBeGreaterThan(0);
    }
    // And no registry binding may reference a MAT-CANON id.
    for (const b of SOURCE_IDENTITY_BINDINGS) {
      expect(b.sourceRecordId || '').not.toMatch(/^MAT-CANON-/);
    }
  });
});

// ===========================================================================
// I-9 — uniform DHSP reader
// ===========================================================================

describe('I-9 pembaca DHSP seragam (normalisasi di lapisan baca)', () => {
  it('setiap entri BM (NUMBER) → reader mengembalikan harga yang sama', () => {
    expect(OFFICIAL_BM_2026_DHSP_MAP.size).toBeGreaterThan(1000);
    for (const [code, price] of OFFICIAL_BM_2026_DHSP_MAP) {
      const entry = getDhspEntry(code, 'BINA_MARGA');
      expect(entry).not.toBeNull();
      expect(entry!.unitPrice).toBe(price);
      expect(entry!.family).toBe('BINA_MARGA');
      expect(entry!.provenanceSource).toContain('Lampiran V');
    }
  });

  it('setiap entri CK (OBJEK) → reader mengembalikan field yang sama', () => {
    expect(OFFICIAL_CK_2026_DHSP_MAP.size).toBeGreaterThan(1000);
    for (const [code, raw] of OFFICIAL_CK_2026_DHSP_MAP) {
      const entry = getDhspEntry(code, 'CIPTA_KARYA');
      expect(entry).not.toBeNull();
      expect(entry!.unitPrice).toBe(raw.unitPrice);
      expect(entry!.family).toBe('CIPTA_KARYA');
      expect(entry!.sourceSheet).toBe(raw.sourceSheet);
      expect(entry!.sourceRow).toBe(raw.sourceRow);
      expect(entry!.name).toBe(raw.name);
      expect(entry!.unit).toBe(raw.unit);
      expect(entry!.isLeaf).toBe(raw.isLeaf);
    }
  });

  it('fallback lintas-keluarga + kode tak dikenal → null', () => {
    const bmCode = [...OFFICIAL_BM_2026_DHSP_MAP.keys()][0];
    const ckCode = [...OFFICIAL_CK_2026_DHSP_MAP.keys()][0];
    // A BM-only code still resolves under a CK domain (fallback, same as resolver).
    expect(getDhspPrice(bmCode, 'CIPTA_KARYA')).toBe(OFFICIAL_BM_2026_DHSP_MAP.get(bmCode));
    expect(getDhspPrice(ckCode, 'BINA_MARGA')).toBe(
      OFFICIAL_CK_2026_DHSP_MAP.get(ckCode)?.unitPrice ?? null
    );
    expect(getDhspEntry('KODE-TIDAK-ADA-§3')).toBeNull();
    expect(getDhspPrice('KODE-TIDAK-ADA-§3')).toBeNull();
  });

  it('reader == harga DHSP resolver pada sampel item nyata (seam §6)', () => {
    const bmItems = ALL_OFFICIAL_AHSP_ITEMS.filter(
      (it: any) => it.domain === 'BINA_MARGA' && OFFICIAL_BM_2026_DHSP_MAP.has(it.code)
    ).slice(0, 5);
    const ckItems = ALL_OFFICIAL_AHSP_ITEMS.filter(
      (it: any) => it.domain === 'CIPTA_KARYA' && OFFICIAL_CK_2026_DHSP_MAP.has(it.code)
    ).slice(0, 5);
    expect(bmItems.length).toBe(5);
    expect(ckItems.length).toBe(5);
    for (const item of [...bmItems, ...ckItems] as any[]) {
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      const readerPrice = getDhspPrice(item.code, item.domain, item.codeNormalized);
      expect(comp.officialDhspPrice).toBe(readerPrice);
    }
  });
});

// ===========================================================================
// M-6 — legacy 2022 quarantine (R-7)
// ===========================================================================

describe('M-6 karantina ingest legacy PUPR 2022 (R-7)', () => {
  const repo = PriceRepository.getInstance();

  it('arsip legacy terisi, semua bertier LEGACY + periode 2022-Q1 (data dipertahankan)', () => {
    const legacy = repo.getLegacyPrices();
    expect(legacy.length).toBeGreaterThan(0);
    for (const d of legacy) {
      expect(d.sourceTier).toBe('LEGACY');
      expect(d.periodVersion).toBe('2022-Q1');
      expect(d.price).toBeGreaterThan(0);
    }
    const first = legacy[0];
    expect(repo.getLegacyByCode(first.code)?.id).toBe(first.id);
  });

  it('indeks aktif tidak mengandung satu pun harga 2022', () => {
    const active = repo.getAllMasterPrices();
    expect(active.length).toBe(repo.count());
    for (const d of active) {
      expect(d.sourceTier).not.toBe('LEGACY');
      expect(d.periodVersion.startsWith('2022')).toBe(false);
      // NOTE: no substring check on priceSource — a legitimate 2026 source
      // may cite a 2022 regulation by name ('Standar Remunerasi INKINDO
      // 2026 & Permen PUPR 1/2022'). The quarantine is on tier + period,
      // not on the source's label.
    }
    expect(repo.getAll().length).toBe(active.length);
    expect(repo.queryPrices({})).toHaveLength(active.length);
  });

  it('getByCode / getAllByCode tidak pernah mengembalikan harga 2022', () => {
    for (const d of repo.getLegacyPrices()) {
      const hit = repo.getByCode(d.code);
      if (hit) {
        expect(hit.sourceTier).not.toBe('LEGACY');
        expect(hit.periodVersion.startsWith('2022')).toBe(false);
      }
      for (const alt of repo.getAllByCode(d.code)) {
        expect(alt.sourceTier).not.toBe('LEGACY');
        expect(alt.periodVersion.startsWith('2022')).toBe(false);
      }
    }
  });

  it('kode yang HANYA ada di 2022 tidak ter-resolve sama sekali', () => {
    const activeCodes = new Set(
      repo.getAllMasterPrices().map((d) => (d.codeNormalized || d.code).toUpperCase())
    );
    const legacyOnly = repo
      .getLegacyPrices()
      .filter((d) => !activeCodes.has((d.codeNormalized || d.code).toUpperCase()));
    expect(legacyOnly.length).toBeGreaterThan(0);
    for (const d of legacyOnly) {
      expect(repo.getByCode(d.code)).toBeUndefined();
      expect(repo.getAllByCode(d.code)).toHaveLength(0);
    }
  });
});

// ===========================================================================
// I-11 — snapshot/version fields + safe defaults
// ===========================================================================

describe('I-11 field versi snapshot + default aman (model saja)', () => {
  it('konstanta versi konsisten (2026.1 = label de-facto repo)', () => {
    expect(AHSP_DATABASE_VERSION).toBe('2026.1');
    expect(MASTER_PRICE_VERSION).toBe('2026.1');
    expect(DEFAULT_SNAPSHOT_PRICING_MODE).toBe('SNAPSHOT_PRICE');
    expect(aliasRules.version).toBe('2026.1');
  });

  it('createProjectSnapshot (registry) mengisi ketiga field dengan default aman', () => {
    const snap = CostDatabaseEngine.createProjectSnapshot({
      id: 'TEST-§3',
      code: 'A.1.1.1',
      version: '2026',
      sourceDocument: 'SE DJBK 47/2026',
      name: 'Item uji §3',
      unit: 'm3',
      laborComponents: [],
      materialComponents: [],
      equipmentComponents: [],
      unitPrice: 1000,
    } as any);
    expect(snap.ahspDatabaseVersion).toBe('2026.1');
    expect(snap.masterPriceVersion).toBe('2026.1');
    expect(snap.pricingMode).toBe('SNAPSHOT_PRICE');
  });

  it('AHSPCalculationEngine.createProjectSnapshot mengisi ketiga field', () => {
    const snap = AHSPCalculationEngine.createProjectSnapshot({
      id: 'TEST-§3',
      code: 'A.1.1.1',
      version: '2026',
      sourceDocument: 'SE DJBK 47/2026',
      name: 'Item uji §3',
      unit: 'm3',
      laborComponents: [],
      materialComponents: [],
      equipmentComponents: [],
      unitPrice: 0,
    } as any);
    expect(snap.ahspDatabaseVersion).toBe('2026.1');
    expect(snap.masterPriceVersion).toBe('2026.1');
    expect(snap.pricingMode).toBe('SNAPSHOT_PRICE');
  });

  it('buildBaselineVersion + createRevision mengisi ketiga field', () => {
    const baseline = buildBaselineVersion('proj-§3', [], {
      now: '2026-11-16T00:00:00.000Z',
      idGenerator: () => 'ver-baseline-§3',
    });
    expect(baseline.ahspDatabaseVersion).toBe('2026.1');
    expect(baseline.masterPriceVersion).toBe('2026.1');
    expect(baseline.pricingMode).toBe('SNAPSHOT_PRICE');
    const { created } = createRevision([baseline], 'proj-§3', [], {
      label: 'Revisi uji §3',
      description: 'Uji field versi',
    }, { now: '2026-11-16T01:00:00.000Z', idGenerator: () => 'ver-rev-§3' });
    expect(created.ahspDatabaseVersion).toBe('2026.1');
    expect(created.masterPriceVersion).toBe('2026.1');
    expect(created.pricingMode).toBe('SNAPSHOT_PRICE');
  });

  it('versi lama tanpa field tetap valid (opsional — tidak ada migrasi paksa)', () => {
    const legacyVersion = {
      id: 'ver-legacy',
      projectId: 'proj-legacy',
      versionNumber: 'v1.0',
      label: 'v1.0 - Baseline Awal',
      timestamp: '2026-09-01T00:00:00.000Z',
      author: 'System',
      description: 'Baseline lama pra-§3',
      costBefore: 0,
      costAfter: 0,
      difference: 0,
      percentageDiff: 0,
      rabItemsSnapshot: [{ id: 'item-1' }],
      itemsCount: 1,
      isBaseline: true,
    } as EstimateVersion;
    expect(legacyVersion.ahspDatabaseVersion).toBeUndefined();
    expect(legacyVersion.masterPriceVersion).toBeUndefined();
    expect(legacyVersion.pricingMode).toBeUndefined();
    expect(validateVersionSnapshot(legacyVersion).ok).toBe(true);
  });
});
