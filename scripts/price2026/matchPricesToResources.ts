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
  nameSimilarity,
  nameBindingScore,
  nameTokens,
  tokenEquivalent,
  NAME_COMPATIBLE_THRESHOLD,
  NAME_ONLY_THRESHOLD,
  sha1Like,
  type ResourceAuditRow,
} from './core';
import { readAllSourceRows } from './normalizePrices';
import { PRICE_SOURCES } from './sources.config';
import {
  TRUSTED_MATCH_METHODS,
  type ResourcePriceRecord,
  type PriceMatchMethod,
  type PriceVerificationStatus,
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

function buildComponentKeys(): ComponentKey[] {
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
 * Strict fuzzy name rule for a NAME-ONLY binding.
 *
 * Containment is allowed when the shorter name carries at least two significant
 * tokens, OR when it is a single token that is also the FIRST token of the longer
 * name ("Pekerja" vs "Pekerja / Buruh Konstruksi"). That single-token relaxation is
 * what lets clean canonical names bind to verbose source names — but it is still
 * subject to unit + type gating and to a uniqueness requirement, and every such
 * binding is marked NEEDS_REVIEW.
 *
 * Falls back to token-ratio similarity, which the caller gates at NAME_ONLY_THRESHOLD
 * (0.6) so a two-token name must agree on BOTH tokens.
 */
function strictNameMatch(aNorm: string, aTokens: string[], bNorm: string, bTokens: string[]): number {
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;
  const short = aNorm.length <= bNorm.length ? { n: aNorm, t: aTokens } : { n: bNorm, t: bTokens };
  const long = aNorm.length <= bNorm.length ? bNorm : aNorm;
  const longTokens = aNorm.length <= bNorm.length ? bTokens : aTokens;
  if (short.t.length >= 2 && long.includes(short.n)) return 0.92;
  if (
    short.t.length === 1 &&
    short.t[0].length >= 4 &&
    longTokens.length > 0 &&
    tokenEquivalent(longTokens[0], short.t[0])
  ) {
    return 0.88;
  }
  return nameBindingScore(aNorm, bNorm);
}

/** Pick the best candidate by name similarity to the source row. */
function pickByComponent(
  candidates: ComponentKey[],
  sourceName: string
): { k: ComponentKey; sim: number } | null {
  if (candidates.length === 0) return null;
  const scored = candidates
    .map((k) => ({ k, sim: nameSimilarity(sourceName, k.name) }))
    .sort((a, b) => b.sim - a.sim || b.k.count - a.k.count || a.k.key.localeCompare(b.k.key));
  const best = scored[0];
  const anyNameKnown = candidates.some((k) => !!k.name);
  if (!anyNameKnown || !sourceName) return { k: best.k, sim: 0 };
  if (best.sim >= NAME_COMPATIBLE_THRESHOLD) return best;
  return null;
}

function tryMatch(
  row: ResourcePriceRecord,
  idx: ReturnType<typeof buildIndexes>,
  cidx: ComponentIndex,
  componentKeys: ComponentKey[],
  aliases: AliasRule[]
): MatchOutcome {
  const notes: string[] = [];

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
    if (a.resourceUnit && target.unit !== normalizeUnit(a.resourceUnit)) continue;
    if (a.resourceType && target.type.toLowerCase() !== a.resourceType.toLowerCase()) continue;

    return { method: 'ALIAS', componentKey: target, confidence: 0.99, notes: [`alias=${a.id}`, a.reason] };
  }

  // ---- 2. EXACT_CODE -------------------------------------------------------
  if (row.resourceCode) {
    const nc = normalizeCode(row.resourceCode);
    const candidates = (cidx.byNormCode.get(nc) || []).filter(
      (k) => k.unit === row.unit && typeCompatible(k.type, row.resourceType)
    );
    const pick = pickByComponent(candidates, row.resourceName);
    if (pick) {
      return {
        method: 'EXACT_CODE',
        componentKey: pick.k,
        confidence: 0.98,
        notes: [`nameSimilarity=${pick.sim.toFixed(2)}`, `componentKey=${pick.k.key}`],
      };
    }
    if (candidates.length > 0) notes.push(`EXACT_CODE_REJECTED_NAME_MISMATCH:${candidates.length}`);
  }

  // ---- 3. NORMALIZED_CODE_UNIT --------------------------------------------
  if (row.resourceCode) {
    const lc = looseCode(row.resourceCode);
    const candidates = (cidx.byLooseCode.get(lc) || []).filter(
      (k) => k.unit === row.unit && typeCompatible(k.type, row.resourceType)
    );
    const pick = pickByComponent(candidates, row.resourceName);
    if (pick) {
      return {
        method: 'NORMALIZED_CODE_UNIT',
        componentKey: pick.k,
        confidence: 0.9,
        notes: [`nameSimilarity=${pick.sim.toFixed(2)}`, `componentKey=${pick.k.key}`],
      };
    }
    if (candidates.length > 0) notes.push(`NORMALIZED_CODE_REJECTED_NAME_MISMATCH:${candidates.length}`);
  }

  // ---- 4. NAME_UNIT (unambiguous best; candidate only) --------------------
  if (row.resourceName) {
    const rowNorm = normalizeName(row.resourceName);
    const rowTokens = nameTokens(row.resourceName);
    const scored: { k: ComponentKey; sim: number }[] = [];
    for (const k of componentKeys) {
      if (k.unit !== row.unit || !k.normName || !k.cleanName) continue;
      if (!typeCompatible(k.type, row.resourceType)) continue;
      const sim = strictNameMatch(rowNorm, rowTokens, k.normName, k.tokens);
      if (sim > 0) scored.push({ k, sim });
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
          notes: [`nameSimilarity=${top.sim.toFixed(2)}`, 'name+unit candidate — NEEDS_REVIEW'],
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

function main() {
  fs.mkdirSync(VALIDATED_DIR, { recursive: true });
  fs.mkdirSync(SRC_DIR, { recursive: true });

  const resources: ResourceEntry[] = (AHSP_2026_CANONICAL_RESOURCES as any[]).map((r, i) => ({
    ...classifyResource(r),
    index: i,
  }));
  const idx = buildIndexes(resources);
  const componentKeys = buildComponentKeys();
  const cidx = buildComponentIndex(componentKeys);
  const aliases = loadAliases();
  const rows = readAllSourceRows().filter((r) => SOURCE.get(r.sourceKey)?.active);

  const matched: ResourcePriceRecord[] = [];
  const unmatched: ResourcePriceRecord[] = [];
  const methodCount = new Map<string, number>();
  const perSourceMatched = new Map<string, number>();
  const perSourceUnmatched = new Map<string, number>();
  const pricedComponentKeys = new Set<string>();

  for (const row of rows) {
    const outcome = tryMatch(row, idx, cidx, componentKeys, aliases);
    methodCount.set(outcome.method, (methodCount.get(outcome.method) || 0) + 1);

    if (!outcome.componentKey) {
      perSourceUnmatched.set(row.sourceKey, (perSourceUnmatched.get(row.sourceKey) || 0) + 1);
      unmatched.push({ ...row, matchMethod: 'UNMATCHED', matchConfidence: 0, notes: [...row.notes, ...outcome.notes] });
      continue;
    }

    const k = outcome.componentKey;
    const g = idx.byLooseCodeUnit.get(k.key);
    const rep = g?.representative;
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
    });

    pricedComponentKeys.add(k.key);
    perSourceMatched.set(row.sourceKey, (perSourceMatched.get(row.sourceKey) || 0) + 1);
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

  const matchReport = {
    generatedAt: new Date().toISOString(),
    aliasRules: aliases.length,
    activePriceRows: rows.length,
    matchedRows: matched.length,
    unmatchedRows: unmatched.length,
    matchRate: Number(((matched.length / rows.length) * 100).toFixed(2)),
    matchMethodHistogram: Object.fromEntries([...methodCount.entries()].sort((a, b) => b[1] - a[1])),
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
    duplicates: { exactDuplicateGroups: exactDuplicates.length, samples: exactDuplicates.slice(0, 20) },
    conflicts: { conflictGroups: conflicts.length, samples: conflicts.slice(0, 20) },
  };

  fs.writeFileSync(path.join(VALIDATED_DIR, 'price_master.json'), JSON.stringify({ generatedAt: matchReport.generatedAt, count: matched.length, records: matched }, null, 2));
  fs.writeFileSync(path.join(VALIDATED_DIR, 'match_report.json'), JSON.stringify(matchReport, null, 2));
  fs.writeFileSync(path.join(VALIDATED_DIR, 'unmatched_price_rows.json'), JSON.stringify({ count: unmatched.length, records: unmatched.slice(0, 3000) }, null, 2));
  fs.writeFileSync(path.join(VALIDATED_DIR, 'conflicts.json'), JSON.stringify({ generatedAt: matchReport.generatedAt, count: conflicts.length, conflicts }, null, 2));

  emitPriceMaster(matched);
  emitResourceIndex(resources, componentKeys);

  console.log('=== PHASE 12 — RESOURCE MATCHING ===');
  console.log('active price rows      :', rows.length);
  console.log('matched                :', matched.length, `(${matchReport.matchRate}%)`);
  console.log('unmatched              :', unmatched.length);
  console.log('match methods          :', JSON.stringify(matchReport.matchMethodHistogram));
  console.log('verification           :', JSON.stringify(verification));
  console.log('');
  console.log('=== COVERAGE ===');
  console.log('distinct component keys:', componentKeys.length, '| with price:', pricedComponentKeys.size, `(${matchReport.componentKeyCoverage.coveragePercent}%)`);
  for (const [t, v] of Object.entries(matchReport.componentKeyCoverage.perType)) {
    console.log(`  ${t.padEnd(10)} ${v.priced}/${v.total} (${(v as any).coveragePercent}%)`);
  }
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
  console.log('Wrote: data/price2026/validated/{price_master,match_report,unmatched_price_rows,conflicts}.json');
  console.log('Wrote: src/data/priceDatabase2026/{priceMaster,resourceIndex}.generated.ts');
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

function emitResourceIndex(resources: ResourceEntry[], componentKeys: ComponentKey[]) {
  const rows = resources.map((r) => ({
    resourceId: r.resourceId,
    code: r.code,
    name: r.name,
    unit: r.unit,
    unitRaw: r.rawUnit,
    type: r.classification.toLowerCase(),
    quality: r.quality,
    issues: r.issues,
    sourceAhspCodes: r.sourceAhspCodes,
  }));
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
 * resource rows: ${rows.length}   component keys: ${componentKeys.length}
 */

import type { ResourceRowQuality } from './types';

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
}

export interface ComponentKeyRow {
  key: string;
  code: string;
  unit: string;
  name: string;
  type: string;
  count: number;
  cleanName: boolean;
}

${chunks.join('\n\n')}

${keyChunks.join('\n\n')}

export const CANONICAL_RESOURCE_INDEX: CanonicalResourceRow[] = [${spread}];

export const CANONICAL_RESOURCE_INDEX_COUNT = ${rows.length};

export const COMPONENT_KEYS: ComponentKeyRow[] = [${keySpread}];

export const COMPONENT_KEY_COUNT = ${componentKeys.length};
`
  );
}

main();
