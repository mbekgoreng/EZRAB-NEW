/**
 * EZRAB PRICE 2026 — PHASE 12 (resource matching) + PHASE 13 (aliases) + PHASE 25/26 (duplicates/conflicts)
 * ======================================================================================================
 *
 * WHY THIS MATCHER LOOKS DIFFERENT FROM THE BRIEF'S DEFAULT
 * --------------------------------------------------------
 * The brief's default priority is code-first. In THIS repository that is provably
 * unsafe, for two independent reasons measured from the actual data:
 *
 *  (A) The canonical resource master carries the source PDF's INTERNAL codes, which
 *      collide with — but do not mean — the price sources' codes:
 *        canonical `E.11` "CRANE ON TRACK 10-15 TON" vs equipment master `E.11` "Plate Compactor"  ✗
 *        canonical `E15`  "Wheel Loader"             vs equipment master `E.15` "Lowbed Trailer"  ✗
 *        canonical `E12`  "Generator Set ; 134 KVA"  vs equipment master `E.12` "Dump Truck"      ✗
 *        canonical `E08`  "Dump Truck 4 Ton"         vs equipment master `E.08` "Tandem Roller"   ✗
 *      Code matching is therefore ALWAYS gated by name compatibility.
 *
 *  (B) The resource master's *names* are polluted (see PRICE_RESOURCE_AUDIT.md):
 *      353 SUSPECT + 117 DEFECTIVE rows, `L01` rows literally named "Mandor"/"Tukang batu",
 *      hundreds of `L03` rows whose name is `"Mandor <material name>"`. The COMPONENT-USAGE
 *      names, by contrast, are clean: `L01|OJ` is used as "Pekerja" 1746×, `M03|m3` as
 *      "Aggregat Kasar" 147×.
 *
 * So the matching TARGET is the *component key* — the distinct (code, unit, name) as it is
 * actually used by an AHSP item — not the resource-master representative. The resource master
 * is then joined to the component key by `looseCode|unit` purely for attribution.
 *
 * Priority used:
 *   1. ALIAS                 explicit, auditable alias entry
 *   2. EXACT_CODE            code equal (normalized) + unit equal + names compatible
 *   3. NORMALIZED_CODE_UNIT  dot/case-insensitive code + unit + names compatible
 *   4. NAME_UNIT             strict fuzzy name + unit, unambiguous → NEEDS_REVIEW
 *
 * Per the brief, a NAME_UNIT binding is NEVER promoted to VERIFIED.
 *
 * MARKET_2026 NAME_KEY fallback (step 5, AFTER the main loop): a market row
 * that tryMatch could not bind is retried against an index of canonical
 * component names INCLUDING code-less components (which buildComponentKeys
 * skips — `if (!code) continue`). An EXACT match on (runtime-normalized
 * name, unit) emits a record with resourceId `RES-KEY-<hash>`, empty
 * resourceCode and method NAME_KEY, always NEEDS_REVIEW. The runtime
 * resolver finds such records through its byNameUnit/byName indexes, so
 * code-less AHSP components become pricable without inventing a code.
 * No component key is priced by this step (keysWithPrice does not move).
 *
 * Companion NAME_KEY records (step 5c): a main-loop binding names its
 * record after the COMPONENT KEY (k.name), not the market row — so a
 * fuzzy NAME_UNIT binding to a generic key (e.g. market row 'Paku
 * campuran 5 cm + 7 cm' → key M18 'Paku') prices the key's coded
 * components but NOT the code-less components that carry the market
 * row's own name: the runtime name path looks the record up by the
 * component's raw name. When a main-loop-bound MARKET_2026 row's
 * normalized name differs from its key's normalized name, step 5c
 * ALSO emits a NAME_KEY companion record named after the canonical
 * component (exact name+unit match, same price). The key record and
 * the companion serve different component populations; neither
 * overwrites the other. Rows whose name already equals the key name
 * get no companion (the key record serves them).
 *
 * MARKET_2026 COMPONENT rows (kind=COMPONENT, mixed-item decomposition,
 * owner rule 17 Nov 2026) BYPASS tryMatch entirely and are emitted by the
 * same step as standalone COMPONENT_REF records — reference prices keyed
 * by their own name, with no canonical component binding at all. They are
 * never fuzzy-bound to a coded key: a reference price is not a claim
 * about any AHSP component.
 *
 * DB-sync Fase 2 hardening (pipeline-local, see matcherHardening.ts):
 * roster aliases as name candidates (a), code matching disabled for
 * EQUIPMENT_2026 + COMMERCIAL_2026 (b), spec-number rule (c), token-boundary
 * containment (d). Quarantined component keys (data/price2026/
 * quarantined-component-keys.json) are never matched and never priced.
 * Unresolved keys are published with explicit reasons to
 * data/price2026/validated/unresolved_component_keys.json.
 *
 * MASTER PRICING §3 (M-1/M-3): the matcher also emits the canonical-entity
 * fields (§3.1) on every resource row (buildCanonicalEntityRows), stamps
 * every matched price record with version=1/status=ACTIVE (§3.3), and
 * publishes the component-key → representative-entity map
 * (COMPONENT_KEY_REPRESENTATIVES) that buildSourceIdentityRegistry.ts
 * consumes. Matching itself is UNCHANGED: same rules, same counts
 * (5.236 rows / 791 keys / 452 records), 0 price-value changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AHSP_2026_CANONICAL_RESOURCES } from '../../src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated';
import { AHSP_2026_CANONICAL } from '../../src/data/nationalCostDatabase/ahsp2026Canonical.generated';
import {
  classifyResource,
  componentTypeFromCode,
  looseCode,
  normalizeCode,
  normalizeName,
  normalizeUnit,
  normalizeUnitForType,
  nameTokens,
  NAME_COMPATIBLE_THRESHOLD,
  NAME_ONLY_THRESHOLD,
  sha1Like,
  type ResourceAuditRow,
} from './core';
import {
  CODE_MATCH_DISABLED_SOURCES,
  extractSpecTokens,
  isDeniedRosterAlias,
  pipelineNameCompatible,
  pipelineNameTokens,
  pipelineNormalizeName,
  pipelineStrictNameMatch,
  specSetsCompatible,
} from './matcherHardening';
import { LaborDatabaseService } from '../../src/domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../../src/domain/equipment/equipmentDatabaseService';
import { stripUnitAnnotation } from '../../src/data/priceDatabase2026/centralResolution';
import { readAllSourceRows } from './normalizePrices';
import { PRICE_SOURCES } from './sources.config';
import {
  TRUSTED_MATCH_METHODS,
  type ResourceClassification,
  type ResourcePriceRecord,
  type PriceMatchMethod,
  type PriceVerificationStatus,
  type ResourceRowQuality,
} from '../../src/data/priceDatabase2026/types';

const ROOT = process.cwd();
const VALIDATED_DIR = path.join(ROOT, 'data', 'price2026', 'validated');
const SRC_DIR = path.join(ROOT, 'src', 'data', 'priceDatabase2026');
const SOURCE = new Map(PRICE_SOURCES.map((s) => [s.key, s]));

// ===========================================================================
// alias table (PHASE 13)
// ===========================================================================

interface AliasRule {
  id: string;
  resourceLooseCode?: string;
  resourceUnit?: string;
  resourceType?: string;
  resourceNameContains?: string;
  sourceKey: string;
  sourceCode?: string;
  sourceLooseCode?: string;
  sourceName?: string;
  sourceUnit?: string;
  reason: string;
}

function loadAliases(): AliasRule[] {
  const p = path.join(ROOT, 'data', 'price2026', 'aliases.json');
  if (!fs.existsSync(p)) return [];
  return (JSON.parse(fs.readFileSync(p, 'utf8')).rules || []) as AliasRule[];
}

// ===========================================================================
// quarantined component keys (DB-sync Fase 2)
// ===========================================================================

/**
 * Component keys that are proven parsing artifacts, never resources.
 * NOTE: ahspQuarantine.ts applies to AHSP ITEM codes, not component keys —
 * this pipeline-local list is the correct mechanism for component keys.
 * Quarantined keys stay in the resource index (flagged) and stay unpriced.
 */
interface QuarantinedComponentKey {
  key: string;
  looseCode: string;
  unit: string;
  name: string;
  reason: string;
  detail: string;
  provenance: string;
  sourceItem?: string;
  confidence: string;
}

function loadQuarantinedComponentKeys(): Map<string, QuarantinedComponentKey> {
  const p = path.join(ROOT, 'data', 'price2026', 'quarantined-component-keys.json');
  const out = new Map<string, QuarantinedComponentKey>();
  if (!fs.existsSync(p)) return out;
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const k of (parsed.keys || []) as QuarantinedComponentKey[]) {
    if (k.key) out.set(k.key, k);
  }
  return out;
}

// ===========================================================================
// quarantined component names (Ronde 2, V3 SS8)
// ===========================================================================

/**
 * Component NAMES that are proven NOT materials — sub-analysis references,
 * work descriptions, services, formula variables, unrecoverable fragments.
 * Unlike quarantined KEYS (matched by looseCode|unit), these are matched by
 * NAME_KEY (normNameKey(name)|normalizeUnitForType(unit, 'material')) and
 * excluded from the NAME_KEY fallback index only: a market row can never
 * bind to them by name, and they never produce a NAME_KEY record. The rows
 * stay in the canonical data and stay PRICE_MISSING at runtime (the runtime
 * resolver does NOT read this file); the gap-audit copy (audit-runtime-r2.ts)
 * excludes them from the missing count. Q-13 is deliberately absent
 * (R204/B.06.a.1 was recovered to a real material name by coordinator
 * override); R192 is deliberately absent (its fragment was merged by the
 * cleanup into the real material name 'Superplastizer M.24.b').
 */
interface QuarantinedComponentName {
  key: string;
  name: string;
  unit: string;
  reason: string;
  detail: string;
  provenance: string;
  source: string;
  rows: number;
  confidence: string;
}

function loadQuarantinedComponentNames(): Map<string, QuarantinedComponentName> {
  const p = path.join(ROOT, 'data', 'price2026', 'quarantined-component-names.json');
  const out = new Map<string, QuarantinedComponentName>();
  if (!fs.existsSync(p)) return out;
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const n of (parsed.names || []) as QuarantinedComponentName[]) {
    if (n.key) out.set(n.key, n);
  }
  return out;
}

// ===========================================================================
// roster aliases (DB-sync Fase 2, rule a)
// ===========================================================================

/**
 * aliases[] from the labor/equipment rosters, keyed by pipeline source +
 * roster code. Read from the SAME services the normalizer reads, so codes
 * always agree with the emitted rows. Aliases are roster DATA (alternative
 * names authored with the role), not guesses — but two proven-misleading
 * aliases are denylisted in matcherHardening.ts and filtered out here.
 */
function loadRosterAliases(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const l of LaborDatabaseService.getInstance().getAllLabor() as any[]) {
    if (l.code && Array.isArray(l.aliases) && l.aliases.length > 0) {
      map.set(
        `LABOR_2026|${normalizeCode(l.code)}`,
        l.aliases.filter((a: string) => a && !isDeniedRosterAlias(a))
      );
    }
  }
  for (const e of EquipmentDatabaseService.getInstance().getAllEquipment() as any[]) {
    if (e.code && Array.isArray(e.aliases) && e.aliases.length > 0) {
      map.set(
        `EQUIPMENT_2026|${normalizeCode(e.code)}`,
        e.aliases.filter((a: string) => a && !isDeniedRosterAlias(a))
      );
    }
  }
  return map;
}

// ===========================================================================
// indexes
// ===========================================================================

interface ResourceEntry extends ResourceAuditRow {
  index: number;
}

/** Canonical resource rows sharing a (looseCode, unit) — used for attribution only. */
interface ResourceGroup {
  key: string;
  looseCode: string;
  unit: string;
  representative: ResourceEntry;
  members: ResourceEntry[];
}

/**
 * A distinct (code, unit, name) as it is actually USED by an AHSP component.
 * Component names are markedly cleaner than resource-master names, and they are
 * what must actually be priced — so they are the primary matching target.
 */
interface ComponentKey {
  key: string; // looseCode|unit
  looseCode: string;
  code: string;
  unit: string;
  name: string;
  type: string;
  count: number;
  normName: string;
  tokens: string[];
  /** false when every observed label was an extraction artefact (never name-match these). */
  cleanName: boolean;
  /** Dictionary-applied normalized name + tokens (pipeline-local hardening). */
  pipeNormName: string;
  pipeTokens: string[];
  /** Normalized spec tokens of the chosen name (rule c). */
  specTokens: string[];
  /** True when the key is quarantined (never matched, never priced). */
  quarantined: boolean;
  quarantineReason?: string;
}

function qualityRank(q: string): number {
  return q === 'CLEAN' ? 0 : q === 'SUSPECT' ? 1 : 2;
}

function buildIndexes(resources: ResourceEntry[]) {
  const byKey = new Map<string, ResourceGroup>();
  for (const r of resources) {
    const lc = r.code ? looseCode(r.code) : '';
    if (!lc) continue;
    const key = `${lc}|${r.unit}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, looseCode: lc, unit: r.unit, representative: r, members: [] };
      byKey.set(key, g);
    }
    g.members.push(r);
    const cur = g.representative;
    const better =
      qualityRank(r.quality) < qualityRank(cur.quality) ||
      (qualityRank(r.quality) === qualityRank(cur.quality) && r.name.length < cur.name.length) ||
      (qualityRank(r.quality) === qualityRank(cur.quality) &&
        r.name.length === cur.name.length &&
        r.index < cur.index);
    if (better) g.representative = r;
  }
  const groups = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const byLooseCodeUnit = new Map<string, ResourceGroup>();
  for (const g of groups) byLooseCodeUnit.set(g.key, g);
  return { groups, byLooseCodeUnit };
}

/** True when a name is a usable canonical label (not an extraction artefact). */
function isCleanComponentName(name: string): boolean {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 90) return false;
  if (/^\d/.test(n)) return false; // "1. Pekerja"
  if (/^\*/.test(n)) return false; // cross-reference
  if (/^\(/.test(n)) return false; // placeholder
  if (/sub\s*total/i.test(n)) return false; // summary line leak
  if (/[-–—]\s*$/.test(n)) return false; // trailing dash
  if (/\.\s*$/.test(n)) return false; // trailing dot
  if (/\b(rp|idr)\b/i.test(n)) return false;
  if (/\d{1,3}(\.\d{3})+(,\d+)?/.test(n)) return false; // embedded money "526.919,72"
  return true;
}

function buildComponentKeys(quarantined: Map<string, QuarantinedComponentKey>): ComponentKey[] {
  interface Acc {
    key: string;
    looseCode: string;
    code: string;
    unit: string;
    type: string;
    count: number;
    names: Map<string, { count: number; clean: boolean }>;
  }
  const map = new Map<string, Acc>();
  for (const it of AHSP_2026_CANONICAL as any[]) {
    for (const [type, comps] of [
      ['labor', it.laborComponents || []],
      ['material', it.materialComponents || []],
      ['equipment', it.equipmentComponents || []],
    ] as const) {
      for (const c of comps as any[]) {
        const code = String(c.code || '').trim();
        if (!code) continue;
        // The code prefix wins over the component array: the canonical extraction
        // mis-files many MATERIAL resources into `laborComponents` (M03, M14, M170…).
        const effectiveType = componentTypeFromCode(code) || type;
        const unit = normalizeUnitForType(String(c.unit || ''), effectiveType);
        const key = `${looseCode(code)}|${unit}`;
        const rawName = String(c.name || '').replace(/\s*-\s*$/, '').trim();
        let e = map.get(key);
        if (!e) {
          e = { key, looseCode: looseCode(code), code, unit, type: effectiveType, count: 0, names: new Map() };
          map.set(key, e);
        }
        e.count++;
        if (rawName) {
          const cur = e.names.get(rawName);
          if (cur) cur.count++;
          else e.names.set(rawName, { count: 1, clean: isCleanComponentName(rawName) });
        }
      }
    }
  }

  const out: ComponentKey[] = [];
  for (const e of map.values()) {
    // Choose the best label: clean first, then most-used, then shortest.
    const ranked = [...e.names.entries()]
      .map(([name, m]) => ({ name, ...m }))
      .sort(
        (a, b) =>
          Number(b.clean) - Number(a.clean) ||
          b.count - a.count ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name)
      );
    const chosen = ranked[0];
    const name = chosen ? chosen.name : '';
    const q = quarantined.get(e.key);
    out.push({
      key: e.key,
      looseCode: e.looseCode,
      code: e.code,
      unit: e.unit,
      name,
      type: e.type,
      count: e.count,
      normName: normalizeName(name),
      tokens: nameTokens(name),
      cleanName: !!chosen?.clean,
      pipeNormName: pipelineNormalizeName(name),
      pipeTokens: pipelineNameTokens(name),
      specTokens: extractSpecTokens(name),
      quarantined: !!q,
      quarantineReason: q ? `${q.reason}: ${q.detail}` : undefined,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

interface ComponentIndex {
  byKey: Map<string, ComponentKey>;
  byLooseCode: Map<string, ComponentKey[]>;
  byNormCode: Map<string, ComponentKey[]>;
}

function buildComponentIndex(componentKeys: ComponentKey[]): ComponentIndex {
  const byKey = new Map<string, ComponentKey>();
  const byLooseCode = new Map<string, ComponentKey[]>();
  const byNormCode = new Map<string, ComponentKey[]>();
  for (const k of componentKeys) {
    byKey.set(k.key, k);
    const lc = k.looseCode;
    if (!byLooseCode.has(lc)) byLooseCode.set(lc, []);
    byLooseCode.get(lc)!.push(k);
    const nc = normalizeCode(k.code);
    if (nc) {
      if (!byNormCode.has(nc)) byNormCode.set(nc, []);
      byNormCode.get(nc)!.push(k);
    }
  }
  return { byKey, byLooseCode, byNormCode };
}

// ===========================================================================
// NAME_KEY fallback index (MARKET_2026 only)
// ===========================================================================

/**
 * Runtime name normalization, EXACTLY as the runtime resolver indexes
 * names (resolver.ts normResourceName: stripUnitAnnotation + lowercase +
 * non-word→space + collapse). The NAME_KEY fallback MUST use this — not
 * the pipeline's normalizeName — because the emitted records are found
 * at runtime through the resolver's byNameUnit/byName indexes, which
 * are keyed by this normalization. stripUnitAnnotation is imported from
 * the runtime module itself (centralResolution.ts) so the two cannot drift.
 */
function normNameKey(s: string): string {
  return stripUnitAnnotation(s)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a price row is a MARKET_2026 decomposition-component row. */
function isComponentRow(row: ResourcePriceRecord): boolean {
  return row.sourceKey === 'MARKET_2026' && row.notes.includes('kind=COMPONENT');
}

/** One canonical-name bucket: every raw label observed for a (normName, unit). */
interface NameKeyEntry {
  key: string; // normName|unit
  normName: string;
  unit: string;
  /** Best raw label: clean first, then most-used, then shortest (mirrors buildComponentKeys). */
  name: string;
  count: number;
}

/**
 * Index of canonical MATERIAL component names INCLUDING code-less
 * components — the population buildComponentKeys cannot see (`if (!code)
 * continue`). Keyed by (runtime-normalized name, normalized unit).
 * Coded components are included too: a market row that tryMatch rejected
 * (ambiguous / below threshold) can still be rescued by an EXACT name
 * match — the emission is a NAME_KEY record either way, never a
 * component-key binding.
 */
function buildNameKeyIndex(
  quarantinedNames: Map<string, QuarantinedComponentName> = new Map()
): Map<string, NameKeyEntry> {
  interface Acc {
    unit: string;
    count: number;
    names: Map<string, { count: number; clean: boolean }>;
  }
  const map = new Map<string, Acc>();
  for (const it of AHSP_2026_CANONICAL as any[]) {
    for (const [type, comps] of [
      ['labor', it.laborComponents || []],
      ['material', it.materialComponents || []],
      ['equipment', it.equipmentComponents || []],
    ] as const) {
      for (const c of comps as any[]) {
        const code = String(c.code || '').trim();
        // Same effective-type rule as buildComponentKeys (code prefix wins
        // over the component array); MARKET_2026 rows are all material,
        // so only material components can be priced by them.
        const effectiveType = componentTypeFromCode(code) || type;
        if (effectiveType !== 'material') continue;
        const unit = normalizeUnitForType(String(c.unit || ''), effectiveType);
        const rawName = String(c.name || '').replace(/\s*-\s*$/, '').trim();
        if (!rawName) continue;
        const norm = normNameKey(rawName);
        if (!norm) continue;
        const key = `${norm}|${unit}`;
        // Quarantined names (V3 SS8): never enter the NAME_KEY index, so no
        // market row can bind to them by name and no NAME_KEY record is ever
        // emitted for them. The rows stay PRICE_MISSING at runtime by design.
        if (quarantinedNames.has(key)) continue;
        let e = map.get(key);
        if (!e) {
          e = { unit, count: 0, names: new Map() };
          map.set(key, e);
        }
        e.count++;
        const cur = e.names.get(rawName);
        if (cur) cur.count++;
        else e.names.set(rawName, { count: 1, clean: isCleanComponentName(rawName) });
      }
    }
  }

  const out = new Map<string, NameKeyEntry>();
  for (const [key, e] of map) {
    const ranked = [...e.names.entries()]
      .map(([name, m]) => ({ name, ...m }))
      .sort(
        (a, b) =>
          Number(b.clean) - Number(a.clean) ||
          b.count - a.count ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name)
      );
    const chosen = ranked[0];
    const norm = key.slice(0, key.length - e.unit.length - 1);
    out.set(key, { key, normName: norm, unit: e.unit, name: chosen ? chosen.name : '', count: e.count });
  }
  return out;
}

// ===========================================================================
// matching
// ===========================================================================

interface MatchOutcome {
  method: PriceMatchMethod;
  componentKey: ComponentKey | null;
  confidence: number;
  notes: string[];
}

/** Component type must agree with the price row's resource type. */
function typeCompatible(componentType: string, priceType: string): boolean {
  if (!componentType || !priceType || priceType === 'unknown') return true;
  return componentType.toLowerCase() === priceType.toLowerCase();
}

/**
 * Strict fuzzy name rule — PIPELINE-LOCAL hardened version
 * (`pipelineStrictNameMatch` in matcherHardening.ts). The old implementation
 * used String.includes containment and scored `amp` ⊂ `stamper` 0.90; it is
 * intentionally no longer used here. See matcherHardening.ts rule (d).
 */

/**
 * Pick the best candidate by pipeline-local name compatibility to the source
 * row — primary name first, then each roster alias (rule a). Token-boundary
 * only (pipelineNameCompatible); a spec conflict scores 0 for that name.
 */
function pickByComponent(
  candidates: ComponentKey[],
  sourceName: string,
  aliasNames: string[]
): { k: ComponentKey; sim: number; viaAlias: string | null } | null {
  if (candidates.length === 0) return null;
  const anyNameKnown = candidates.some((k) => !!k.name);
  // Without a source name (or without any known candidate name) there is
  // nothing to score against: keep the original behaviour — the highest-count
  // candidate wins, reported with sim 0. Aliases must not influence the pick
  // when the row itself carries no name.
  if (!anyNameKnown || !sourceName) {
    const best = [...candidates].sort(
      (a, b) => b.count - a.count || a.key.localeCompare(b.key)
    )[0];
    return { k: best, sim: 0, viaAlias: null };
  }
  const names: Array<{ name: string; alias: string | null }> = [
    { name: sourceName, alias: null },
    ...aliasNames.map((a) => ({ name: a, alias: a })),
  ];
  let best: { k: ComponentKey; sim: number; viaAlias: string | null } | null = null;
  for (const k of candidates) {
    for (const { name, alias } of names) {
      if (!name) continue;
      const sim = pipelineNameCompatible(name, k.name);
      if (
        !best ||
        sim > best.sim ||
        (sim === best.sim &&
          (k.count > best.k.count || (k.count === best.k.count && k.key < best.k.key)))
      ) {
        best = { k, sim, viaAlias: alias };
      }
    }
  }
  if (!best) return null;
  if (best.sim >= NAME_COMPATIBLE_THRESHOLD) return best;
  return null;
}

function tryMatch(
  row: ResourcePriceRecord,
  idx: ReturnType<typeof buildIndexes>,
  cidx: ComponentIndex,
  componentKeys: ComponentKey[],
  aliases: AliasRule[],
  rosterAliases: Map<string, string[]>
): MatchOutcome {
  const notes: string[] = [];
  // Roster aliases for this row (rule a), denylist already applied at load.
  const aliasNames =
    rosterAliases.get(`${row.sourceKey}|${normalizeCode(row.resourceCode)}`) || [];

  // ---- 1. ALIAS ------------------------------------------------------------
  for (const a of aliases) {
    if (a.sourceKey !== row.sourceKey) continue;
    const codeHit =
      (a.sourceCode && normalizeCode(a.sourceCode) === normalizeCode(row.resourceCode)) ||
      (a.sourceLooseCode && a.sourceLooseCode === looseCode(row.resourceCode));
    const nameHit = !!a.sourceName && normalizeName(a.sourceName) === normalizeName(row.resourceName);
    if (!codeHit && !nameHit) continue;
    if (a.sourceUnit && normalizeUnit(a.sourceUnit) !== row.unit) continue;
    if (!a.resourceLooseCode) continue;

    const target =
      (cidx.byKey.get(`${a.resourceLooseCode}|${normalizeUnit(a.resourceUnit || row.unit)}`)) ||
      (cidx.byLooseCode.get(a.resourceLooseCode) || []).find(
        (k) =>
          (!a.resourceUnit || k.unit === normalizeUnit(a.resourceUnit)) &&
          (!a.resourceNameContains ||
            normalizeName(k.name).includes(normalizeName(a.resourceNameContains)))
      );
    if (!target) continue;
    if (target.quarantined) continue;
    if (a.resourceUnit && target.unit !== normalizeUnit(a.resourceUnit)) continue;
    if (a.resourceType && target.type.toLowerCase() !== a.resourceType.toLowerCase()) continue;

    return { method: 'ALIAS', componentKey: target, confidence: 0.99, notes: [`alias=${a.id}`, a.reason] };
  }

  // ---- 2. EXACT_CODE -------------------------------------------------------
  // Rule (b): EQUIPMENT_2026 + COMMERCIAL_2026 run their own numbering
  // schemes — code matching is disabled for them (name matching still applies).
  if (row.resourceCode) {
    if (CODE_MATCH_DISABLED_SOURCES.has(row.sourceKey)) {
      notes.push(`CODE_MATCH_DISABLED:${row.sourceKey}`);
    } else {
      const nc = normalizeCode(row.resourceCode);
      const candidates = (cidx.byNormCode.get(nc) || []).filter(
        (k) => k.unit === row.unit && typeCompatible(k.type, row.resourceType) && !k.quarantined
      );
      const pick = pickByComponent(candidates, row.resourceName, aliasNames);
      if (pick) {
        return {
          method: 'EXACT_CODE',
          componentKey: pick.k,
          confidence: 0.98,
          notes: [
            `nameSimilarity=${pick.sim.toFixed(2)}`,
            `componentKey=${pick.k.key}`,
            ...(pick.viaAlias ? [`aliasName=${pick.viaAlias}`] : []),
          ],
        };
      }
      if (candidates.length > 0) notes.push(`EXACT_CODE_REJECTED_NAME_MISMATCH:${candidates.length}`);
    }
  }

  // ---- 3. NORMALIZED_CODE_UNIT --------------------------------------------
  if (row.resourceCode) {
    if (!CODE_MATCH_DISABLED_SOURCES.has(row.sourceKey)) {
      const lc = looseCode(row.resourceCode);
      const candidates = (cidx.byLooseCode.get(lc) || []).filter(
        (k) => k.unit === row.unit && typeCompatible(k.type, row.resourceType) && !k.quarantined
      );
      const pick = pickByComponent(candidates, row.resourceName, aliasNames);
      if (pick) {
        return {
          method: 'NORMALIZED_CODE_UNIT',
          componentKey: pick.k,
          confidence: 0.9,
          notes: [
            `nameSimilarity=${pick.sim.toFixed(2)}`,
            `componentKey=${pick.k.key}`,
            ...(pick.viaAlias ? [`aliasName=${pick.viaAlias}`] : []),
          ],
        };
      }
      if (candidates.length > 0) notes.push(`NORMALIZED_CODE_REJECTED_NAME_MISMATCH:${candidates.length}`);
    }
  }

  // ---- 4. NAME_UNIT (unambiguous best; candidate only) --------------------
  if (row.resourceName) {
    const rowNorm = pipelineNormalizeName(row.resourceName);
    const rowTokens = pipelineNameTokens(row.resourceName);
    const rowSpec = extractSpecTokens(row.resourceName);
    // Each roster alias is scored as an additional candidate name (rule a).
    const aliasForms = aliasNames.map((a) => ({
      alias: a,
      norm: pipelineNormalizeName(a),
      tokens: pipelineNameTokens(a),
      spec: extractSpecTokens(a),
    }));
    const scored: { k: ComponentKey; sim: number; viaAlias: string | null }[] = [];
    for (const k of componentKeys) {
      if (k.unit !== row.unit || !k.normName || !k.cleanName || k.quarantined) continue;
      if (!typeCompatible(k.type, row.resourceType)) continue;
      let bestSim = pipelineStrictNameMatch(rowNorm, rowTokens, k.pipeNormName, k.pipeTokens, rowSpec, k.specTokens);
      let viaAlias: string | null = null;
      for (const af of aliasForms) {
        if (!af.norm) continue;
        // An alias may not override a spec conflict carried by the primary
        // name: the row's own specs still bind.
        if (!specSetsCompatible(rowSpec, k.specTokens)) continue;
        const sim = pipelineStrictNameMatch(af.norm, af.tokens, k.pipeNormName, k.pipeTokens, af.spec, k.specTokens);
        if (sim > bestSim) {
          bestSim = sim;
          viaAlias = af.alias;
        }
      }
      if (bestSim > 0) scored.push({ k, sim: bestSim, viaAlias });
    }
    scored.sort((a, b) => b.sim - a.sim || b.k.count - a.k.count || a.k.key.localeCompare(b.k.key));
    if (scored.length > 0) {
      const top = scored[0];
      const runnerUp = scored[1];
      if (top.sim < NAME_ONLY_THRESHOLD) {
        notes.push(`NAME_UNIT_BELOW_THRESHOLD:${top.sim.toFixed(2)}`);
        return { method: 'UNMATCHED', componentKey: null, confidence: 0, notes };
      }
      let unambiguous = !runnerUp || runnerUp.sim < top.sim;
      if (!unambiguous && runnerUp && runnerUp.sim === top.sim) {
        // Allow a dominant-usage tie-break: 3× the runner-up's usage and the same
        // similarity is treated as decidable, but still flagged NEEDS_REVIEW.
        if (top.k.count >= runnerUp.k.count * 3) {
          unambiguous = true;
          notes.push(`NAME_UNIT_COUNT_DOMINANT:${top.k.count}vs${runnerUp.k.count}`);
        }
      }
      if (unambiguous) {
        return {
          method: 'NAME_UNIT',
          componentKey: top.k,
          confidence: top.sim,
          notes: [
            `nameSimilarity=${top.sim.toFixed(2)}`,
            'name+unit candidate — NEEDS_REVIEW',
            ...(top.viaAlias ? [`aliasName=${top.viaAlias}`] : []),
          ],
        };
      }
      notes.push(`NAME_UNIT_AMBIGUOUS:${scored.length}`);
    }
  }

  return { method: 'UNMATCHED', componentKey: null, confidence: 0, notes };
}

// ===========================================================================
// main
// ===========================================================================

/**
 * MASTER PRICING §13 (dry-run): with `dryRun` the full match is still
 * computed from the CURRENT sources, but NONE of the 7 writes happen
 * (5 validated JSONs + the 2 generated TS modules) — the summary plus
 * a machine-readable `__SYNC_DRY_RUN_JSON__<json>` line are printed
 * instead, so the orchestrator can report what WOULD change.
 */
function main(dryRun = false) {
  fs.mkdirSync(VALIDATED_DIR, { recursive: true });
  fs.mkdirSync(SRC_DIR, { recursive: true });

  const resources: ResourceEntry[] = (AHSP_2026_CANONICAL_RESOURCES as any[]).map((r, i) => ({
    ...classifyResource(r),
    index: i,
  }));
  const idx = buildIndexes(resources);
  const quarantined = loadQuarantinedComponentKeys();
  const quarantinedNames = loadQuarantinedComponentNames();
  const rosterAliases = loadRosterAliases();
  const componentKeys = buildComponentKeys(quarantined);
  const cidx = buildComponentIndex(componentKeys);
  const aliases = loadAliases();
  const rows = readAllSourceRows().filter((r) => SOURCE.get(r.sourceKey)?.active);

  const matched: ResourcePriceRecord[] = [];
  const unmatched: ResourcePriceRecord[] = [];
  const componentRows: ResourcePriceRecord[] = [];
  /** MARKET_2026 rows bound by the main loop (method + target key) — printed
   *  with the fallback section so a dry-run review can audit every market
   *  binding, including fuzzy NAME_UNIT ones, before the full pipeline runs. */
  const marketMainLoopBindings: Array<{ sourceRecordId: string; method: string; componentKey: string; confidence: number }> = [];
  /** MARKET_2026 rows bound by the main loop, with the bound key's name —
   *  step 5c (companion NAME_KEY) needs the row + key name to detect a
   *  name mismatch between the market row and its key. */
  const marketMainLoopBoundRows: Array<{ row: ResourcePriceRecord; keyName: string }> = [];
  const methodCount = new Map<string, number>();
  const perSourceMatched = new Map<string, number>();
  const perSourceUnmatched = new Map<string, number>();
  const pricedComponentKeys = new Set<string>();

  for (const row of rows) {
    // COMPONENT rows bypass tryMatch entirely: a decomposition reference
    // price must never be fuzzy-bound to a coded key (see the fallback step).
    if (isComponentRow(row)) {
      componentRows.push(row);
      continue;
    }
    const outcome = tryMatch(row, idx, cidx, componentKeys, aliases, rosterAliases);
    methodCount.set(outcome.method, (methodCount.get(outcome.method) || 0) + 1);

    if (!outcome.componentKey) {
      perSourceUnmatched.set(row.sourceKey, (perSourceUnmatched.get(row.sourceKey) || 0) + 1);
      unmatched.push({ ...row, matchMethod: 'UNMATCHED', matchConfidence: 0, notes: [...row.notes, ...outcome.notes] });
      continue;
    }

    const k = outcome.componentKey;
    const g = idx.byLooseCodeUnit.get(k.key);
    const rep = g?.representative;
    if (row.sourceKey === 'MARKET_2026') {
      marketMainLoopBindings.push({
        sourceRecordId: row.sourceRecordId || '',
        method: outcome.method,
        componentKey: k.key,
        confidence: outcome.confidence,
      });
      marketMainLoopBoundRows.push({ row, keyName: k.name });
    }
    const trusted = TRUSTED_MATCH_METHODS.includes(outcome.method);
    // PHASE 12: a name-only binding must NOT become VERIFIED.
    const status: PriceVerificationStatus = trusted ? row.verificationStatus : 'NEEDS_REVIEW';

    matched.push({
      ...row,
      resourceId: rep?.resourceId || `RES-KEY-${sha1Like(k.key)}`,
      resourceCode: k.code,
      resourceName: k.name || rep?.name || row.resourceName,
      resourceType: (k.type as any) || 'unknown',
      matchMethod: outcome.method,
      matchConfidence: outcome.confidence,
      verificationStatus: status,
      notes: [...row.notes, ...outcome.notes],
      // MASTER PRICING §3.3 — price identity versioning. Every record the
      // pipeline emits is v1/ACTIVE of its identity; a future §4 price
      // change supersedes (never overwrites) it. effectiveTo stays null
      // (open-ended) — it is already filled by the normalizer's PricePeriod.
      version: 1,
      status: 'ACTIVE',
    });

    pricedComponentKeys.add(k.key);
    perSourceMatched.set(row.sourceKey, (perSourceMatched.get(row.sourceKey) || 0) + 1);
  }

  // ---- NAME_KEY / COMPONENT_REF fallback (MARKET_2026 only) ----------------
  // Runs AFTER the main loop, on rows tryMatch could not bind (plus the
  // COMPONENT rows, which bypass tryMatch by design — see above).
  //   * regular market row + exact (normName, unit) hit in the name-key
  //     index  → NAME_KEY record (RES-KEY-<hash>, resourceCode '', NEEDS_REVIEW)
  //   * COMPONENT row (kind=COMPONENT) → COMPONENT_REF standalone record
  //     (RES-KEY-<hash>, resourceCode '', resourceName = the item's own
  //     name, NEEDS_REVIEW) — emitted even with NO canonical component.
  // Emission is deduped per (normName, unit) across both methods: two rows
  // naming the same thing at the same unit yield ONE record (the first in
  // row order wins; the other stays unmatched with a NAME_KEY_DEDUP_SKIPPED
  // note). NOTHING here touches pricedComponentKeys: neither method prices
  // a component key.
  const marketFallback = {
    candidates: 0,
    nameKeyEmitted: 0,
    /** Step 5c companions (subset of nameKeyEmitted). */
    nameKeyCompanionEmitted: 0,
    companionDedupSkipped: 0,
    companionNoCanonical: 0,
    componentRefEmitted: 0,
    dedupSkipped: 0,
    noCanonicalComponent: 0,
    /** MARKET_2026 rows bound by the main loop (before the fallback ran). */
    mainLoopBindings: marketMainLoopBindings,
    stillUnmatched: [] as Array<{ sourceRecordId: string; name: string; unit: string; price: number; reason: string }>,
  };
  {
    const emittedByNameKey = new Map<string, string>(); // nameKey -> sourceRecordId of the emitted record
    const emitStandalone = (
      row: ResourcePriceRecord,
      method: 'NAME_KEY' | 'COMPONENT_REF',
      resourceName: string,
      note: string,
      // Step 5c companions share their row with a main-loop record, so
      // the row's id is already taken — the companion gets a suffixed id
      // (assert §2 requires unique record identities). Steps (a)/(b)
      // emit from otherwise-unmatched rows, whose ids are unique already.
      idSuffix = ''
    ) => {
      const key = `${normNameKey(row.resourceName)}|${row.unit}`;
      matched.push({
        ...row,
        id: idSuffix ? `${row.id}${idSuffix}` : row.id,
        resourceId: `RES-KEY-${sha1Like(key)}`,
        resourceCode: '',
        resourceName,
        resourceType: 'material',
        matchMethod: method,
        // Exact-name evidence: NAME_KEY matched the canonical name exactly;
        // COMPONENT_REF is keyed by its own name by construction. Either way
        // the record is NEEDS_REVIEW — a name-only binding is never VERIFIED
        // ('NAME_KEY' / 'COMPONENT_REF' are NOT in TRUSTED_MATCH_METHODS).
        matchConfidence: 1,
        verificationStatus: 'NEEDS_REVIEW',
        notes: [...row.notes, note],
        version: 1,
        status: 'ACTIVE',
      });
      emittedByNameKey.set(key, row.sourceRecordId || row.id);
      methodCount.set(method, (methodCount.get(method) || 0) + 1);
      perSourceMatched.set(row.sourceKey, (perSourceMatched.get(row.sourceKey) || 0) + 1);
      if (method === 'NAME_KEY') marketFallback.nameKeyEmitted++;
      else marketFallback.componentRefEmitted++;
    };

    // (a) COMPONENT rows first: standalone reference prices, no canonical
    // lookup at all (they bypassed tryMatch above for the same reason).
    for (const row of componentRows) {
      marketFallback.candidates++;
      const key = `${normNameKey(row.resourceName)}|${row.unit}`;
      const firstId = emittedByNameKey.get(key);
      if (firstId) {
        marketFallback.dedupSkipped++;
        marketFallback.stillUnmatched.push({ sourceRecordId: row.sourceRecordId || '', name: row.resourceName, unit: row.unit, price: row.price, reason: `DEDUP_SKIPPED:${firstId}` });
        methodCount.set('UNMATCHED', (methodCount.get('UNMATCHED') || 0) + 1);
        perSourceUnmatched.set(row.sourceKey, (perSourceUnmatched.get(row.sourceKey) || 0) + 1);
        unmatched.push({ ...row, matchMethod: 'UNMATCHED', matchConfidence: 0, notes: [...row.notes, `NAME_KEY_DEDUP_SKIPPED:${firstId}`] });
        continue;
      }
      emitStandalone(row, 'COMPONENT_REF', row.resourceName, 'COMPONENT_ONLY: reference price for mixed-item decomposition (owner rule 2026-11-17); no AHSP component');
    }

    // (b) regular unmatched MARKET_2026 rows: exact name-key retry.
    // The name-key index is shared with step (c) below. Quarantined names
    // (V3 SS8) never enter the index, so no market row can bind to them.
    const nameKeyIndex = buildNameKeyIndex(quarantinedNames);
    const marketUnmatched = unmatched.filter((r) => r.sourceKey === 'MARKET_2026' && !isComponentRow(r));
    if (marketUnmatched.length > 0) {
      const kept: ResourcePriceRecord[] = [];
      for (const row of unmatched) {
        if (row.sourceKey !== 'MARKET_2026' || isComponentRow(row)) { kept.push(row); continue; }
        marketFallback.candidates++;
        const key = `${normNameKey(row.resourceName)}|${row.unit}`;
        const entry = nameKeyIndex.get(key);
        if (!entry) {
          marketFallback.noCanonicalComponent++;
          marketFallback.stillUnmatched.push({ sourceRecordId: row.sourceRecordId || '', name: row.resourceName, unit: row.unit, price: row.price, reason: 'NO_CANONICAL_COMPONENT' });
          kept.push({ ...row, notes: [...row.notes, 'NAME_KEY_NO_CANONICAL_COMPONENT'] });
          continue;
        }
        const firstId = emittedByNameKey.get(key);
        if (firstId) {
          marketFallback.dedupSkipped++;
          marketFallback.stillUnmatched.push({ sourceRecordId: row.sourceRecordId || '', name: row.resourceName, unit: row.unit, price: row.price, reason: `DEDUP_SKIPPED:${firstId}` });
          kept.push({ ...row, notes: [...row.notes, `NAME_KEY_DEDUP_SKIPPED:${firstId}`] });
          continue;
        }
        // Convert this UNMATCHED row into a NAME_KEY match.
        methodCount.set('UNMATCHED', (methodCount.get('UNMATCHED') || 0) - 1);
        perSourceUnmatched.set(row.sourceKey, (perSourceUnmatched.get(row.sourceKey) || 0) - 1);
        emitStandalone(row, 'NAME_KEY', entry.name, 'NAME_KEY: exact name+unit fallback (MARKET_2026 only)');
      }
      unmatched.length = 0;
      unmatched.push(...kept);
    }

    // (c) companion NAME_KEY records for main-loop-bound MARKET_2026 rows
    // whose name differs from their key's name (see the header comment):
    // the main-loop record is named after the KEY, so code-less
    // components carrying the market row's own name would still resolve
    // to nothing. A companion record — same price, named after the
    // canonical component — prices them. Rows whose name already equals
    // the key name need no companion. A dedup skip or a missing
    // canonical entry here is NOT an unmatched row (the row IS matched
    // via the main loop), so neither touches `unmatched` or the
    // UNMATCHED counts.
    for (const { row, keyName } of marketMainLoopBoundRows) {
      if (normNameKey(row.resourceName) === normNameKey(keyName)) continue;
      marketFallback.candidates++;
      const key = `${normNameKey(row.resourceName)}|${row.unit}`;
      const entry = nameKeyIndex.get(key);
      if (!entry) {
        marketFallback.companionNoCanonical++;
        continue;
      }
      const firstId = emittedByNameKey.get(key);
      if (firstId) {
        marketFallback.companionDedupSkipped++;
        continue;
      }
      emitStandalone(row, 'NAME_KEY', entry.name, 'NAME_KEY: exact name+unit companion to main-loop key binding (MARKET_2026 only; row name differs from key name)', '-NK');
      marketFallback.nameKeyCompanionEmitted++;
    }
  }

  // ---- duplicate / conflict detection (PHASE 25/26) ------------------------
  const byIdentity = new Map<string, ResourcePriceRecord[]>();
  for (const r of matched) {
    const key = [r.resourceId, r.unit, r.location.level, r.location.provinceName || '', r.location.regencyName || '', r.period.label, r.sourceKey].join('|');
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key)!.push(r);
  }
  const exactDuplicates = [...byIdentity.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([k, l]) => ({ identity: k, count: l.length, ids: l.map((r) => r.id) }));

  const byValueKey = new Map<string, ResourcePriceRecord[]>();
  for (const r of matched) {
    const key = [r.resourceId, r.unit, r.location.level, r.location.provinceName || '', r.location.regencyName || '', r.period.label].join('|');
    if (!byValueKey.has(key)) byValueKey.set(key, []);
    byValueKey.get(key)!.push(r);
  }
  const conflicts: any[] = [];
  for (const [key, list] of byValueKey) {
    const prices = [...new Set(list.map((r) => r.price))];
    if (list.length > 1 && prices.length > 1) {
      const sorted = [...list].sort((a, b) => a.sourcePriority - b.sourcePriority);
      conflicts.push({
        identity: key,
        resourceId: list[0].resourceId,
        resourceCode: list[0].resourceCode,
        resourceName: list[0].resourceName,
        unit: list[0].unit,
        location: list[0].location,
        period: list[0].period.label,
        candidates: sorted.map((r) => ({ price: r.price, sourceKey: r.sourceKey, sourceName: r.sourceName, priority: r.sourcePriority, tier: r.sourceTier })),
        resolution: 'SOURCE_PRIORITY', // never silently dropped
        preferred: sorted[0].sourceKey,
      });
    }
  }

  // ---- coverage ------------------------------------------------------------
  const coverageByTypeKey = { material: { total: 0, priced: 0 }, labor: { total: 0, priced: 0 }, equipment: { total: 0, priced: 0 } };
  for (const k of componentKeys) {
    const t = k.type as 'material' | 'labor' | 'equipment';
    if (!coverageByTypeKey[t]) continue;
    coverageByTypeKey[t].total++;
    if (pricedComponentKeys.has(k.key)) coverageByTypeKey[t].priced++;
  }

  // ---- AHSP item pricing status -------------------------------------------
  // NOTE: this must mirror `PriceResolver2026.resolveAhspUnitPrice` exactly, including
  // the rule that a component WITHOUT a code cannot be priced. Skipping code-less
  // components here would report items as FULL that the runtime resolver reports as
  // PARTIAL — two different numbers for the same thing.
  const pricedByLoose = new Set(matched.map((r) => `${r.resourceType}|${looseCode(r.resourceCode)}|${r.unit}`));
  let full = 0, partial = 0, missing = 0, noComp = 0;
  const byDomain = new Map<string, { full: number; partial: number; missing: number }>();
  for (const it of AHSP_2026_CANONICAL as any[]) {
    const comps: Array<{ code: string; unit: string; type: string }> = [];
    for (const [type, list] of [
      ['labor', it.laborComponents || []],
      ['material', it.materialComponents || []],
      ['equipment', it.equipmentComponents || []],
    ] as const) {
      for (const c of list as any[]) {
        const effectiveType = componentTypeFromCode(String(c.code || '')) || type;
        comps.push({
          code: String(c.code || '').trim(),
          unit: normalizeUnitForType(String(c.unit || ''), effectiveType),
          type: effectiveType,
        });
      }
    }
    if (!byDomain.has(it.domain)) byDomain.set(it.domain, { full: 0, partial: 0, missing: 0 });
    const b = byDomain.get(it.domain)!;
    if (comps.length === 0) { noComp++; b.missing++; continue; }
    let ok = 0;
    for (const c of comps) {
      if (!c.code) continue; // a code-less component can never be priced
      if (pricedByLoose.has(`${c.type}|${looseCode(c.code)}|${c.unit}`)) ok++;
    }
    if (ok === 0) { missing++; b.missing++; }
    else if (ok === comps.length) { full++; b.full++; }
    else { partial++; b.partial++; }
  }

  const verification: Record<string, number> = {};
  for (const r of matched) verification[r.verificationStatus] = (verification[r.verificationStatus] || 0) + 1;

  // ---- hardening stats (DB-sync Fase 2) ------------------------------------
  const hasNote = (r: ResourcePriceRecord, prefix: string) => r.notes.some((n) => n.startsWith(prefix));
  const hardening = {
    rosterAliasBindings: matched.filter((r) => hasNote(r, 'aliasName=')).length,
    codeMatchDisabledRows:
      matched.filter((r) => hasNote(r, 'CODE_MATCH_DISABLED')).length +
      unmatched.filter((r) => hasNote(r, 'CODE_MATCH_DISABLED')).length,
    quarantinedComponentKeys: componentKeys.filter((k) => k.quarantined).length,
    rosterAliasesLoaded: [...rosterAliases.values()].reduce((n, l) => n + l.length, 0),
    rosterEntriesWithAliases: rosterAliases.size,
  };

  // ---- unresolved component keys (explicitly labelled, never priced) --------
  // A key with no price is a DATA gap, not a zero price: it is published here
  // with its reason so the DB-sync audit test can assert that no record
  // fabricates a price for it.
  const unresolvedKeys = componentKeys
    .filter((k) => !pricedComponentKeys.has(k.key))
    .map((k) => ({
      key: k.key,
      code: k.code,
      unit: k.unit,
      name: k.name,
      type: k.type,
      count: k.count,
      reason: k.quarantined ? 'QUARANTINED_ARTIFACT' : 'NO_SOURCE_PRICE',
      detail: k.quarantined
        ? k.quarantineReason || 'quarantined artifact key'
        : 'No pipeline price source binds this key — needs new price data (owner). No fabricated price is assigned.',
    }));

  // ---- MASTER PRICING §3.1 — verified aliases per canonical entity --------
  // An alias enters the canonical entity ONLY when it is verified by
  // construction — never by name-guessing:
  //   (a) a roster alias the matcher actually USED to bind a price row
  //       (note `aliasName=<alias>` on a matched record) — the alias named
  //       the same entity the component key represents;
  //   (b) an explicit alias-rule source name (aliases.json) — a human
  //       decision with workbook evidence, attached to the rule target's
  //       representative resource.
  // Component-usage alternative labels are NOT aliases (observed, not
  // approved) and stay out; §5 decides whether any of them is promoted.
  const aliasesByResourceId = new Map<string, Set<string>>();
  const attachAlias = (resourceId: string | null | undefined, alias: string) => {
    if (!resourceId || !resourceId.startsWith('RES-0')) return; // RES-KEY-* is not a canonical entity
    if (!alias || !alias.trim()) return;
    if (!aliasesByResourceId.has(resourceId)) aliasesByResourceId.set(resourceId, new Set());
    aliasesByResourceId.get(resourceId)!.add(alias.trim());
  };
  for (const r of matched) {
    for (const n of r.notes) {
      if (n.startsWith('aliasName=')) attachAlias(r.resourceId, n.slice('aliasName='.length));
    }
  }
  for (const a of aliases) {
    if (!a.resourceLooseCode || !a.sourceName) continue;
    const key = `${looseCode(a.resourceLooseCode)}|${normalizeUnit(a.resourceUnit || '')}`;
    // The rule targets a key; the representative resource of that key is
    // the canonical entity the alias names. (resourceUnit is required on
    // all current rules; a rule without one cannot resolve a key.)
    const rep = a.resourceUnit ? idx.byLooseCodeUnit.get(key)?.representative : undefined;
    attachAlias(rep?.resourceId, a.sourceName);
  }

  // MASTER PRICING §3.1 — canonical entity rows (built once: the same rows
  // feed match_report.canonicalModel AND the emitted resource index).
  const generatedAt = new Date().toISOString();
  const canonical = buildCanonicalEntityRows(
    resources,
    componentKeys,
    idx,
    aliasesByResourceId,
    generatedAt
  );

  const matchReport = {
    generatedAt,
    aliasRules: aliases.length,
    hardening,
    activePriceRows: rows.length,
    matchedRows: matched.length,
    unmatchedRows: unmatched.length,
    matchRate: Number(((matched.length / rows.length) * 100).toFixed(2)),
    matchMethodHistogram: Object.fromEntries([...methodCount.entries()].sort((a, b) => b[1] - a[1])),
    marketFallback,
    perSource: PRICE_SOURCES.filter((s) => s.active).map((s) => ({
      key: s.key,
      tier: s.tier,
      rows: rows.filter((r) => r.sourceKey === s.key).length,
      matched: perSourceMatched.get(s.key) || 0,
      unmatched: perSourceUnmatched.get(s.key) || 0,
    })),
    componentKeyCoverage: {
      distinctComponentKeys: componentKeys.length,
      keysWithPrice: pricedComponentKeys.size,
      coveragePercent: Number(((pricedComponentKeys.size / (componentKeys.length || 1)) * 100).toFixed(2)),
      perType: Object.fromEntries(Object.entries(coverageByTypeKey).map(([k, v]) => [k, { ...v, coveragePercent: Number(((v.priced / (v.total || 1)) * 100).toFixed(2)) }])),
    },
    ahspCoverage: {
      total: (AHSP_2026_CANONICAL as any[]).length,
      full,
      partial,
      missing,
      noPriceableComponents: noComp,
      byDomain: Object.fromEntries(byDomain),
    },
    verification,
    unresolvedComponentKeys: {
      count: unresolvedKeys.length,
      quarantinedArtifact: unresolvedKeys.filter((k) => k.reason === 'QUARANTINED_ARTIFACT').length,
      noSourcePrice: unresolvedKeys.filter((k) => k.reason === 'NO_SOURCE_PRICE').length,
    },
    duplicates: { exactDuplicateGroups: exactDuplicates.length, samples: exactDuplicates.slice(0, 20) },
    conflicts: { conflictGroups: conflicts.length, samples: conflicts.slice(0, 20) },
    // MASTER PRICING §3.1 — canonical entity model (M-1).
    canonicalModel: canonical.stats,
  };

  if (!dryRun) {
    fs.writeFileSync(path.join(VALIDATED_DIR, 'price_master.json'), JSON.stringify({ generatedAt: matchReport.generatedAt, count: matched.length, records: matched }, null, 2));
    fs.writeFileSync(path.join(VALIDATED_DIR, 'match_report.json'), JSON.stringify(matchReport, null, 2));
    fs.writeFileSync(path.join(VALIDATED_DIR, 'unmatched_price_rows.json'), JSON.stringify({ count: unmatched.length, records: unmatched.slice(0, 3000) }, null, 2));
    fs.writeFileSync(path.join(VALIDATED_DIR, 'conflicts.json'), JSON.stringify({ generatedAt: matchReport.generatedAt, count: conflicts.length, conflicts }, null, 2));
    fs.writeFileSync(path.join(VALIDATED_DIR, 'unresolved_component_keys.json'), JSON.stringify({ generatedAt: matchReport.generatedAt, count: unresolvedKeys.length, keys: unresolvedKeys }, null, 2));

    emitPriceMaster(matched);
    emitResourceIndex(canonical.rows, componentKeys, canonical.keyRepresentatives);
  }

  console.log('=== PHASE 12 — RESOURCE MATCHING ===');
  console.log('active price rows      :', rows.length);
  console.log('matched                :', matched.length, `(${matchReport.matchRate}%)`);
  console.log('unmatched              :', unmatched.length);
  console.log('match methods          :', JSON.stringify(matchReport.matchMethodHistogram));
  console.log('verification           :', JSON.stringify(verification));
  console.log('');
  console.log('=== MARKET FALLBACK (NAME_KEY / COMPONENT_REF, MARKET_2026 only) ===');
  console.log('candidates             :', marketFallback.candidates);
  console.log('NAME_KEY emitted       :', marketFallback.nameKeyEmitted);
  console.log('  of which companions  :', marketFallback.nameKeyCompanionEmitted);
  console.log('COMPONENT_REF emitted  :', marketFallback.componentRefEmitted);
  console.log('dedup skipped          :', marketFallback.dedupSkipped);
  console.log('no canonical component :', marketFallback.noCanonicalComponent);
  console.log('companion dedup skipped:', marketFallback.companionDedupSkipped);
  console.log('companion no canonical :', marketFallback.companionNoCanonical);
  for (const u of marketFallback.stillUnmatched) {
    console.log(`  still unmatched: ${u.sourceRecordId || '(no id)'} | ${u.name} | ${u.unit} | Rp${u.price} | ${u.reason}`);
  }
  console.log('main-loop bindings     :', marketMainLoopBindings.length);
  for (const b of marketMainLoopBindings) {
    console.log(`  bound: ${b.sourceRecordId || '(no id)'} | ${b.method} | ${b.componentKey} | conf=${b.confidence.toFixed(2)}`);
  }
  console.log('');
  console.log('=== HARDENING (DB-sync Fase 2) ===');
  console.log('alias rules            :', aliases.length);
  console.log('roster alias bindings  :', hardening.rosterAliasBindings);
  console.log('code-match disabled rows:', hardening.codeMatchDisabledRows, '(EQUIPMENT_2026 + COMMERCIAL_2026)');
  console.log('quarantined keys       :', hardening.quarantinedComponentKeys, '(never matched, never priced)');
  console.log('unresolved keys        :', unresolvedKeys.length, `(${matchReport.unresolvedComponentKeys.quarantinedArtifact} quarantined artifact, ${matchReport.unresolvedComponentKeys.noSourcePrice} no source price)`);
  console.log('');
  console.log('=== COVERAGE ===');
  console.log('distinct component keys:', componentKeys.length, '| with price:', pricedComponentKeys.size, `(${matchReport.componentKeyCoverage.coveragePercent}%)`);
  for (const [t, v] of Object.entries(matchReport.componentKeyCoverage.perType)) {
    console.log(`  ${t.padEnd(10)} ${v.priced}/${v.total} (${(v as any).coveragePercent}%)`);
  }
  console.log('');
  console.log('=== CANONICAL MODEL §3.1 (M-1) ===');
  console.log('entities               :', canonical.stats.entities);
  console.log('active / inactive      :', `${canonical.stats.active} / ${canonical.stats.inactive} (inactive = DEFECTIVE quality)`);
  console.log('canonicalName source   :', JSON.stringify(canonical.stats.canonicalNameSource));
  console.log('entities with aliases  :', canonical.stats.entitiesWithAliases, `(${canonical.stats.aliasesAttached} aliases attached)`);
  console.log('key representatives    :', canonical.stats.keyRepresentatives);
  console.log('');
  console.log('=== AHSP PRICING STATUS ===');
  console.log('FULL    :', full);
  console.log('PARTIAL :', partial);
  console.log('MISSING :', missing);
  console.log('NO-COMP :', noComp, '(items whose components have no resolvable price)');
  console.log('');
  console.log('=== DUPLICATES / CONFLICTS ===');
  console.log('exact duplicate groups :', exactDuplicates.length);
  console.log('conflict groups        :', conflicts.length);
  console.log('');
  if (dryRun) {
    console.log('DRY RUN — no files written.');
    console.log(
      `__SYNC_DRY_RUN_JSON__${JSON.stringify({
        stage: 'match',
        activePriceRows: rows.length,
        matchedRows: matched.length,
        unmatchedRows: unmatched.length,
        matchRate: matchReport.matchRate,
        componentKeyCoverage: matchReport.componentKeyCoverage,
        ahspCoverage: matchReport.ahspCoverage,
        verification,
        unresolvedKeys: unresolvedKeys.length,
        exactDuplicateGroups: exactDuplicates.length,
        conflictGroups: conflicts.length,
        canonicalEntities: canonical.stats.entities,
        marketFallback,
      })}`
    );
  } else {
    console.log('Wrote: data/price2026/validated/{price_master,match_report,unmatched_price_rows,conflicts,unresolved_component_keys}.json');
    console.log('Wrote: src/data/priceDatabase2026/{priceMaster,resourceIndex}.generated.ts');
  }
}

// ===========================================================================
// emitters (chunked to avoid TS2590)
// ===========================================================================

const CHUNK = 150;

function emitPriceMaster(records: ResourcePriceRecord[]) {
  const chunks: string[] = [];
  const n = Math.ceil(records.length / CHUNK);
  for (let i = 0; i < n; i++) {
    chunks.push(`const PRC_CHUNK_${i}: ResourcePriceRecord[] = ${JSON.stringify(records.slice(i * CHUNK, (i + 1) * CHUNK))};`);
  }
  const spread = Array.from({ length: n }, (_, i) => `...PRC_CHUNK_${i}`).join(', ');
  fs.writeFileSync(
    path.join(SRC_DIR, 'priceMaster.generated.ts'),
    `/**
 * AUTO-GENERATED by scripts/price2026/matchPricesToResources.ts — DO NOT EDIT.
 *
 * EZRAB PRICE DATABASE 2026 — matched resource price records.
 * This layer is SEPARATE from the canonical AHSP source of truth.
 * Regenerate with: npm run price:pipeline
 *
 * records: ${records.length}
 */

import type { ResourcePriceRecord } from './types';

${chunks.join('\n\n')}

export const RESOURCE_PRICE_RECORDS: ResourcePriceRecord[] = [${spread}];

export const RESOURCE_PRICE_RECORD_COUNT = ${records.length};
`
  );
}

function emitResourceIndex(
  rows: CanonicalEntityRow[],
  componentKeys: ComponentKey[],
  keyRepresentatives: Array<{ key: string; resourceId: string }>
) {
  const chunks: string[] = [];
  const n = Math.ceil(rows.length / CHUNK);
  for (let i = 0; i < n; i++) {
    chunks.push(`const RES_CHUNK_${i}: CanonicalResourceRow[] = ${JSON.stringify(rows.slice(i * CHUNK, (i + 1) * CHUNK))};`);
  }
  const spread = Array.from({ length: n }, (_, i) => `...RES_CHUNK_${i}`).join(', ');

  const keyChunks: string[] = [];
  const kn = Math.ceil(componentKeys.length / CHUNK);
  for (let i = 0; i < kn; i++) {
    keyChunks.push(
      `const KEY_CHUNK_${i}: ComponentKeyRow[] = ${JSON.stringify(
        componentKeys.slice(i * CHUNK, (i + 1) * CHUNK).map((k) => ({
          key: k.key,
          code: k.code,
          unit: k.unit,
          name: k.name,
          type: k.type,
          count: k.count,
          cleanName: k.cleanName,
          quarantined: k.quarantined,
          quarantineReason: k.quarantineReason,
        }))
      )};`
    );
  }
  const keySpread = Array.from({ length: kn }, (_, i) => `...KEY_CHUNK_${i}`).join(', ');

  fs.writeFileSync(
    path.join(SRC_DIR, 'resourceIndex.generated.ts'),
    `/**
 * AUTO-GENERATED by scripts/price2026/matchPricesToResources.ts — DO NOT EDIT.
 *
 * Canonical AHSP 2026 resource index (audited) + the distinct component keys that
 * actually need pricing. This is a READ-ONLY projection — the canonical resource
 * master itself is not modified.
 *
 * MASTER PRICING §3.1 (M-1): each row is a CANONICAL ENTITY (RES-xxx is the
 * stable id — never replaced). The §3.1 fields (canonicalName, category,
 * specification, primaryUnit, aliases, description, active, createdAt,
 * updatedAt, recordSource) are emitted by buildCanonicalEntityRows() in the
 * matcher. specification/description are null: the canonical master carries
 * no such field, and §3 never invents one.
 *
 * resource rows: ${rows.length}   component keys: ${componentKeys.length}
 */

import type { ResourceClassification, ResourceRowQuality } from './types';

export interface CanonicalResourceRow {
  resourceId: string;
  code: string;
  name: string;
  unit: string;
  unitRaw: string;
  type: string;
  quality: ResourceRowQuality;
  issues: string[];
  sourceAhspCodes: string[];
  // --- MASTER PRICING §3.1 — canonical entity identity (M-1) ---
  /** Best available canonical label: resource-master name, else the clean component-usage name for the same key, else ''. */
  canonicalName: string;
  /** Where canonicalName came from. NONE = no usable label exists anywhere. */
  nameSource: 'RESOURCE_MASTER' | 'COMPONENT_USAGE' | 'NONE';
  /** MATERIAL | LABOR | EQUIPMENT | UNKNOWN (from the master's declared type; UNKNOWN is routed to NEEDS_REVIEW). */
  category: ResourceClassification;
  /** Technical specification. null: the canonical master carries no spec field (§3 never invents one). */
  specification: string | null;
  /** Spec tokens DERIVED from canonicalName (extractSpecTokens) — a matching aid, not source data. */
  specTokens: string[];
  /** Primary unit (normalized). */
  primaryUnit: string;
  /** VERIFIED aliases only (matcher-used roster aliases + explicit alias rules). Never name-guessed. */
  aliases: string[];
  /** Description. null: the canonical master carries no description field. */
  description: string | null;
  /** false = DEFECTIVE quality (proven polluted row, never priced). */
  active: boolean;
  /** Index-publication timestamps (this pipeline run). Per-row source timestamps do not exist in the canonical master. */
  createdAt: string;
  updatedAt: string;
  /** Record owner/source: the canonical resource dataset this row was published from. */
  recordSource: string;
  /** Source document of the canonical resource dataset. */
  sourceDocument: string;
  /** AHSP family the row was extracted from (CIPTA_KARYA / BINA_MARGA / SDA) — the SOURCE DOMAIN, not the category. */
  sourceDomain: string | null;
}

export interface ComponentKeyRow {
  key: string;
  code: string;
  unit: string;
  name: string;
  type: string;
  count: number;
  cleanName: boolean;
  quarantined: boolean;
  quarantineReason?: string;
}

/** Which canonical entity (representative RES-xxx) a component key resolves to. Single source of truth, computed once by the matcher. */
export interface ComponentKeyRepresentative {
  key: string;
  resourceId: string;
}

${chunks.join('\n\n')}

${keyChunks.join('\n\n')}

export const CANONICAL_RESOURCE_INDEX: CanonicalResourceRow[] = [${spread}];

export const CANONICAL_RESOURCE_INDEX_COUNT = ${rows.length};

export const COMPONENT_KEYS: ComponentKeyRow[] = [${keySpread}];

export const COMPONENT_KEY_COUNT = ${componentKeys.length};

export const COMPONENT_KEY_REPRESENTATIVES: ComponentKeyRepresentative[] = ${JSON.stringify(keyRepresentatives)};
`
  );
}

// ===========================================================================
// MASTER PRICING §3.1 — canonical entity enrichment (M-1)
// ===========================================================================

/** Enriched canonical entity row (mirrors the emitted CanonicalResourceRow). */
interface CanonicalEntityRow {
  resourceId: string;
  code: string;
  name: string;
  unit: string;
  unitRaw: string;
  type: string;
  quality: ResourceRowQuality;
  issues: string[];
  sourceAhspCodes: string[];
  canonicalName: string;
  nameSource: 'RESOURCE_MASTER' | 'COMPONENT_USAGE' | 'NONE';
  category: ResourceClassification;
  specification: string | null;
  specTokens: string[];
  primaryUnit: string;
  aliases: string[];
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  recordSource: string;
  sourceDocument: string;
  sourceDomain: string | null;
}

interface CanonicalEntityBuild {
  rows: CanonicalEntityRow[];
  keyRepresentatives: Array<{ key: string; resourceId: string }>;
  stats: {
    entities: number;
    active: number;
    inactive: number;
    byCategory: Record<string, number>;
    canonicalNameSource: Record<string, number>;
    entitiesWithAliases: number;
    aliasesAttached: number;
    keyRepresentatives: number;
    specificationAvailable: number;
    descriptionAvailable: number;
  };
}

/**
 * Enrich every audited resource row with its §3.1 canonical-entity fields.
 * RES-xxx stays the stable id; nothing here renames, merges, or reprices
 * anything. Fields with no source data are null — never guessed.
 */
function buildCanonicalEntityRows(
  resources: ResourceEntry[],
  componentKeys: ComponentKey[],
  idx: ReturnType<typeof buildIndexes>,
  aliasesByResourceId: Map<string, Set<string>>,
  generatedAt: string
): CanonicalEntityBuild {
  const keyNameByKey = new Map(componentKeys.map((k) => [k.key, k.name]));
  const keyRepresentatives = [...idx.byLooseCodeUnit.values()]
    .map((g) => ({ key: g.key, resourceId: g.representative.resourceId }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const nameSourceCount: Record<string, number> = { RESOURCE_MASTER: 0, COMPONENT_USAGE: 0, NONE: 0 };
  const categoryCount: Record<string, number> = {};
  let active = 0;
  let entitiesWithAliases = 0;
  let aliasesAttached = 0;

  const rows: CanonicalEntityRow[] = resources.map((r) => {
    const key = r.code ? `${looseCode(r.code)}|${r.unit}` : '';
    const keyName = key ? keyNameByKey.get(key) || '' : '';
    let canonicalName = r.name;
    let nameSource: CanonicalEntityRow['nameSource'] = 'RESOURCE_MASTER';
    if (!canonicalName && keyName) {
      canonicalName = keyName;
      nameSource = 'COMPONENT_USAGE';
    }
    if (!canonicalName) nameSource = 'NONE';
    nameSourceCount[nameSource]++;

    const isActive = r.quality !== 'DEFECTIVE';
    if (isActive) active++;

    const aliases = [...(aliasesByResourceId.get(r.resourceId) || [])].sort();
    if (aliases.length > 0) {
      entitiesWithAliases++;
      aliasesAttached += aliases.length;
    }
    categoryCount[r.classification] = (categoryCount[r.classification] || 0) + 1;

    return {
      resourceId: r.resourceId,
      code: r.code,
      name: r.name,
      unit: r.unit,
      unitRaw: r.rawUnit,
      type: r.classification.toLowerCase(),
      quality: r.quality,
      issues: r.issues,
      sourceAhspCodes: r.sourceAhspCodes,
      canonicalName,
      nameSource,
      category: r.classification,
      // No specification/description field exists in the canonical resource
      // master (ahsp_2026_resources.json carries only resource_id/code/name/
      // type/unit/category/source_ahsp_codes/duplicate_status). null is the
      // honest value — a spec is NEVER derived by guessing from the name.
      // specTokens (below) is the only derived spec signal, labelled derived.
      specification: null,
      specTokens: extractSpecTokens(canonicalName),
      primaryUnit: r.unit,
      aliases,
      description: null,
      // DEFECTIVE rows are proven polluted (empty name / summary-line leak /
      // fragment) and are never priced — they are inactive entities.
      active: isActive,
      // Per-row source timestamps do not exist in the canonical master;
      // createdAt/updatedAt record the INDEX publication (this pipeline
      // run), not a source publication date.
      createdAt: generatedAt,
      updatedAt: generatedAt,
      recordSource: 'AHSP_2026_CANONICAL_RESOURCES',
      sourceDocument: 'SE DJBK No. 47/SE/Dk/2026',
      sourceDomain: r.sourceDomain ?? null,
    };
  });

  return {
    rows,
    keyRepresentatives,
    stats: {
      entities: rows.length,
      active,
      inactive: rows.length - active,
      byCategory: categoryCount,
      canonicalNameSource: nameSourceCount,
      entitiesWithAliases,
      aliasesAttached,
      keyRepresentatives: keyRepresentatives.length,
      specificationAvailable: 0, // no source field — see note above
      descriptionAvailable: 0,
    },
  };
}

main(process.argv.includes('--dry-run'));
