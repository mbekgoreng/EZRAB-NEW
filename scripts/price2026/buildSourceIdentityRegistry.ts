/**
 * EZRAB PRICE 2026 — MASTER PRICING §3.2 (M-2): SOURCE IDENTITY REGISTRY
 * ====================================================================
 *
 * Builds the ONE new identity structure §3 allows: the mapping from one
 * canonical entity (RES-xxx) to its MANY external source references.
 * A binding is an IDENTITY link, not a price — it says "this source record
 * refers to this canonical entity". Prices stay on ResourcePriceRecord.
 *
 * Inputs (all already-proven data — nothing here is guessed):
 *   1. priceMaster (452 records): each record IS a proven binding
 *      (resourceId + sourceKey + matchMethod + confidence). The original
 *      source description/unit are recovered by joining the pre-match row
 *      (data/price2026/normalized/price_rows.json) on the PRC id — the
 *      matcher overwrites resourceName with the component-key name.
 *   2. Direct CK/BM sources (runtime-live): OFFICIAL_CK_2026_* (3.323)
 *      + BM adapter (691). Binding is TWO-TIER, mirroring the pipeline
 *      matcher exactly:
 *      (a) EXACT_CODE → VERIFIED: exact component key (looseCode|unit) +
 *          type-compatible + name-compatible (pipelineNameCompatible >=
 *          NAME_COMPATIBLE_THRESHOLD). This is deliberately stricter than
 *          the runtime resolver (which has no name gate on code
 *          resolution — the L.10/L.11 hazard): the registry records only
 *          VERIFIED links at this tier.
 *      (b) NAME_UNIT → NEEDS_REVIEW: strict fuzzy name + unit, unambiguous
 *          (pipelineStrictNameMatch >= NAME_ONLY_THRESHOLD, same
 *          count-dominance tie-break as the matcher). Same quality as the
 *          439 priceMaster NAME_UNIT bindings, same NEEDS_REVIEW
 *          treatment with an explicit verificationNote. This tier is what
 *          binds the 3.303 CK entries that carry NO code at all (the CK
 *          workbook extraction identifies them by name+unit only).
 *      Entries that fail both tiers are recorded in `unbound` with an
 *      explicit reason. The dead BM prices file
 *      (officialBinaMargaPrices2026.ts) is NOT a source here — its
 *      registration is M-4, awaiting the owner decision (audit §2.4.8).
 *   3. The component-key → representative map (COMPONENT_KEY_REPRESENTATIVES,
 *      emitted by the matcher) — the single source of truth for which
 *      RES-xxx a key resolves to.
 *
 * Deliberately NOT included:
 *   - MAT-CANON-xxx (canonicalMaterialMaster): frozen as a specification
 *     registry (§3 decision I-5) — its 24 entries carry no AHSP code and
 *     no RES link, so no proven binding exists. Minting one by name
 *     matching would fabricate identity.
 *   - The BM labor OJ twin: the resolver indexes BM labor `jam` also as
 *     `OJ`, but that is a RESOLUTION rule, not a second source identity —
 *     the entry binds once, on its literal unit.
 *   - Legacy PUPR 2022: quarantined (§3 M-6); never a 2026 identity.
 *
 * Outputs:
 *   data/price2026/validated/source_identity_registry.json (validated)
 *   src/data/priceDatabase2026/sourceIdentityRegistry.generated.ts (runtime projection)
 *
 * Run: npm run price:registry  (also a step of npm run price:pipeline,
 *      AFTER price:match — it consumes the matcher's outputs).
 */

import * as fs from 'fs';
import * as path from 'path';
import { looseCode, normalizeUnit, NAME_COMPATIBLE_THRESHOLD, NAME_ONLY_THRESHOLD } from './core';
import {
  extractSpecTokens,
  pipelineNameCompatible,
  pipelineNameTokens,
  pipelineNormalizeName,
  pipelineStrictNameMatch,
} from './matcherHardening';
import {
  COMPONENT_KEYS,
  COMPONENT_KEY_REPRESENTATIVES,
} from '../../src/data/priceDatabase2026/resourceIndex.generated';
import {
  OFFICIAL_CK_2026_LABOR,
  OFFICIAL_CK_2026_MATERIALS,
  OFFICIAL_CK_2026_EQUIPMENT,
} from '../../src/data/nationalCostDatabase/officialCiptaKaryaPrices2026';
import {
  OFFICIAL_BM_2026_LABOR,
  OFFICIAL_BM_2026_MATERIALS,
  OFFICIAL_BM_2026_EQUIPMENT,
} from '../../src/data/nationalCostDatabase/binaMarga2026Adapter';
import type {
  SourceIdentityBinding,
  SourceIdentityRegistryFile,
  UnboundSourceReference,
  ResourcePriceRecord,
  PriceMatchMethod,
  PriceVerificationStatus,
} from '../../src/data/priceDatabase2026/types';

const ROOT = process.cwd();
const VALIDATED_DIR = path.join(ROOT, 'data', 'price2026', 'validated');
const SRC_DIR = path.join(ROOT, 'src', 'data', 'priceDatabase2026');

const CK_DOCUMENT = 'SE DJBK No. 47/SE/Dk/2026 Lampiran VI';
const BM_DOCUMENT = 'SE DJBK No. 47/SE/Dk/2026 Lampiran V';

interface AliasRuleLite {
  id: string;
  reason: string;
}

function loadAliasReasons(): Map<string, string> {
  const p = path.join(ROOT, 'data', 'price2026', 'aliases.json');
  const out = new Map<string, string>();
  if (!fs.existsSync(p)) return out;
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of (parsed.rules || []) as AliasRuleLite[]) {
    if (r.id) out.set(r.id, r.reason || '');
  }
  return out;
}

function verificationNoteFor(
  method: PriceMatchMethod,
  notes: string[],
  aliasReasons: Map<string, string>
): string | null {
  if (method === 'NAME_UNIT') {
    return 'Name+unit match only — candidate, needs review (pipeline rule: never auto-VERIFIED).';
  }
  if (method === 'ALIAS') {
    const aliasNote = notes.find((n) => n.startsWith('alias='));
    const id = aliasNote ? aliasNote.slice('alias='.length) : '';
    const reason = id ? aliasReasons.get(id) : undefined;
    return reason ? `Explicit alias rule ${id}: ${reason}` : `Explicit alias rule ${id || '(unknown)'}.`;
  }
  return null;
}

function main() {
  const generatedAt = new Date().toISOString();
  const aliasReasons = loadAliasReasons();

  const priceMaster = JSON.parse(
    fs.readFileSync(path.join(VALIDATED_DIR, 'price_master.json'), 'utf8')
  ) as { records: ResourcePriceRecord[] };
  const priceRows = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'price2026', 'normalized', 'price_rows.json'), 'utf8')
  ) as { rows: ResourcePriceRecord[] };
  const preMatchById = new Map(priceRows.rows.map((r) => [r.id, r]));

  const keyByKey = new Map(COMPONENT_KEYS.map((k) => [k.key, k]));
  const repByKey = new Map(COMPONENT_KEY_REPRESENTATIVES.map((r) => [r.key, r.resourceId]));

  const bindings: SourceIdentityBinding[] = [];
  const unbound: UnboundSourceReference[] = [];
  const seen = new Set<string>();
  const stats: Record<string, number> = {
    priceMasterRecordsScanned: priceMaster.records.length,
    ckEntriesScanned: 0,
    bmEntriesScanned: 0,
    bindingsDeduped: 0,
    quarantinedKeySkipped: 0,
  };

  const dedupKey = (b: SourceIdentityBinding) =>
    [b.resourceId, b.sourceDataset, b.sourceRecordId || '', b.sourceCode, b.originalDescription, b.originalUnit].join('|');

  const pushBinding = (b: SourceIdentityBinding) => {
    const k = dedupKey(b);
    if (seen.has(k)) {
      stats.bindingsDeduped++;
      return;
    }
    seen.add(k);
    bindings.push(b);
  };

  // ---- 1. priceMaster bindings (proven by the pipeline match) --------------
  for (const r of priceMaster.records) {
    if (!r.resourceId || !r.resourceId.startsWith('RES-0')) {
      // A RES-KEY-* fallback id is not a canonical entity: the binding
      // cannot enter the registry. (0 such records today; handled generally.)
      unbound.push({
        sourceDataset: r.sourceKey,
        sourceRecordId: r.sourceRecordId ?? null,
        sourceCode: r.resourceCode,
        originalDescription: preMatchById.get(r.id)?.resourceName || r.resourceName,
        originalUnit: preMatchById.get(r.id)?.unitRaw || r.unitRaw,
        reason: 'NO_CANONICAL_ENTITY',
        detail: `Price record ${r.id} binds a component key with no canonical resource row (resourceId ${r.resourceId || 'null'}).`,
      });
      continue;
    }
    const pre = preMatchById.get(r.id);
    pushBinding({
      resourceId: r.resourceId,
      sourceType: r.sourceType,
      sourceDataset: r.sourceKey,
      sourceRecordId: r.sourceRecordId ?? pre?.sourceRecordId ?? null,
      sourceCode: pre?.resourceCode || r.resourceCode,
      originalDescription: pre?.resourceName || r.resourceName,
      originalUnit: pre?.unitRaw || r.unitRaw,
      ahspComponentCode: r.resourceCode || null,
      sourceDocument: r.sourceDocument ?? null,
      matchMethod: r.matchMethod,
      matchConfidence: r.matchConfidence,
      verificationStatus: r.verificationStatus,
      verificationNote: verificationNoteFor(r.matchMethod, r.notes || [], aliasReasons),
      priceRecordId: r.id,
      createdAt: generatedAt,
    });
  }

  // ---- 2. direct CK/BM bindings (same gate as pipeline EXACT_CODE) ---------
  interface DirectEntry {
    code: string;
    name: string;
    unit: string;
    category: 'labor' | 'material' | 'equipment';
    dataset: 'CK_HSD_2026' | 'BM_HSD_2026';
    document: string;
  }
  const direct: DirectEntry[] = [
    ...OFFICIAL_CK_2026_LABOR.map((e) => ({ ...e, category: 'labor' as const, dataset: 'CK_HSD_2026' as const, document: CK_DOCUMENT })),
    ...OFFICIAL_CK_2026_MATERIALS.map((e) => ({ ...e, category: 'material' as const, dataset: 'CK_HSD_2026' as const, document: CK_DOCUMENT })),
    ...OFFICIAL_CK_2026_EQUIPMENT.map((e) => ({ ...e, category: 'equipment' as const, dataset: 'CK_HSD_2026' as const, document: CK_DOCUMENT })),
    ...OFFICIAL_BM_2026_LABOR.map((e) => ({ ...e, category: 'labor' as const, dataset: 'BM_HSD_2026' as const, document: BM_DOCUMENT })),
    ...OFFICIAL_BM_2026_MATERIALS.map((e) => ({ ...e, category: 'material' as const, dataset: 'BM_HSD_2026' as const, document: BM_DOCUMENT })),
    ...OFFICIAL_BM_2026_EQUIPMENT.map((e) => ({ ...e, category: 'equipment' as const, dataset: 'BM_HSD_2026' as const, document: BM_DOCUMENT })),
  ];
  stats.ckEntriesScanned = direct.filter((e) => e.dataset === 'CK_HSD_2026').length;
  stats.bmEntriesScanned = direct.filter((e) => e.dataset === 'BM_HSD_2026').length;

  // Precomputed name forms for the NAME_UNIT tier (mirror of the matcher's
  // per-key fields, which are not persisted in COMPONENT_KEYS).
  interface KeyNameForms {
    key: string;
    name: string;
    type: string;
    count: number;
    cleanName: boolean;
    quarantined: boolean;
    pipeNormName: string;
    pipeTokens: string[];
    specTokens: string[];
  }
  const keyForms: KeyNameForms[] = COMPONENT_KEYS.map((k) => ({
    key: k.key,
    name: k.name,
    type: k.type,
    count: k.count,
    cleanName: k.cleanName,
    quarantined: k.quarantined,
    pipeNormName: pipelineNormalizeName(k.name),
    pipeTokens: pipelineNameTokens(k.name),
    specTokens: extractSpecTokens(k.name),
  }));
  const keysByUnit = new Map<string, KeyNameForms[]>();
  for (const kf of keyForms) {
    const unit = kf.key.split('|')[1] || '';
    if (!keysByUnit.has(unit)) keysByUnit.set(unit, []);
    keysByUnit.get(unit)!.push(kf);
  }

  /**
   * NAME_UNIT tier — a faithful mirror of the pipeline matcher's step 4
   * (matchPricesToResources.ts tryMatch): strict fuzzy name + unit,
   * unambiguous best (or 3× count-dominant tie-break), spec-compatible.
   * No roster aliases here (direct entries carry none). Returns the bound
   * key + similarity, or null.
   */
  function tryNameUnit(
    entryName: string,
    unit: string,
    category: string
  ): { key: KeyNameForms; sim: number } | null {
    if (!entryName) return null;
    const rowNorm = pipelineNormalizeName(entryName);
    const rowTokens = pipelineNameTokens(entryName);
    const rowSpec = extractSpecTokens(entryName);
    const scored: Array<{ k: KeyNameForms; sim: number }> = [];
    for (const kf of keysByUnit.get(unit) || []) {
      if (!kf.name || !kf.cleanName || kf.quarantined) continue;
      if (kf.type.toLowerCase() !== category) continue;
      const sim = pipelineStrictNameMatch(rowNorm, rowTokens, kf.pipeNormName, kf.pipeTokens, rowSpec, kf.specTokens);
      if (sim > 0) scored.push({ k: kf, sim });
    }
    scored.sort((a, b) => b.sim - a.sim || b.k.count - a.k.count || a.k.key.localeCompare(b.k.key));
    if (scored.length === 0) return null;
    const top = scored[0];
    if (top.sim < NAME_ONLY_THRESHOLD) return null;
    const runnerUp = scored[1];
    let unambiguous = !runnerUp || runnerUp.sim < top.sim;
    if (!unambiguous && runnerUp && runnerUp.sim === top.sim && top.k.count >= runnerUp.k.count * 3) {
      unambiguous = true;
    }
    if (!unambiguous) return null;
    return { key: top.k, sim: top.sim };
  }

  for (const e of direct) {
    const code = String(e.code || '').trim();
    const name = String(e.name || '').trim();
    // Mirror the resolver's unit handling for direct sources (normalizeUnit,
    // not the type-aware variant — see PriceResolver2026.ensureIndex).
    const unit = normalizeUnit(String(e.unit || ''));
    const base = {
      sourceDataset: e.dataset,
      sourceRecordId: null as string | null, // CK/BM workbook rows carry no stable record id; code+unit is the natural key
      sourceCode: code,
      originalDescription: name,
      originalUnit: String(e.unit || ''),
    };
    const emitBinding = (
      resourceId: string,
      ck: { code: string },
      method: 'EXACT_CODE' | 'NAME_UNIT',
      sim: number
    ) => {
      pushBinding({
        resourceId,
        sourceType: 'GOVERNMENT_REFERENCE',
        sourceDataset: e.dataset,
        sourceRecordId: null,
        sourceCode: code,
        originalDescription: name,
        originalUnit: String(e.unit || ''),
        ahspComponentCode: ck.code || null,
        sourceDocument: e.document,
        matchMethod: method,
        matchConfidence: Number(sim.toFixed(2)),
        verificationStatus: method === 'EXACT_CODE' ? 'VERIFIED' : 'NEEDS_REVIEW',
        verificationNote:
          method === 'NAME_UNIT'
            ? 'Name+unit match only — candidate, needs review (pipeline rule: never auto-VERIFIED).'
            : null,
        priceRecordId: null,
        createdAt: generatedAt,
      });
    };

    // ---- tier (a): EXACT_CODE --------------------------------------------
    // Determine the code-step outcome WITHOUT recording it yet: the
    // NAME_UNIT tier still gets its chance when the code step fails.
    let codeFailure: UnboundSourceReference | null = null;
    if (!code) {
      codeFailure = { ...base, reason: 'NO_COMPONENT_KEY', detail: 'Source entry carries no code — no component key can be formed.' };
    } else {
      const key = `${looseCode(code)}|${unit}`;
      const ck = keyByKey.get(key);
      if (!ck) {
        codeFailure = { ...base, reason: 'NO_COMPONENT_KEY', detail: `No AHSP component uses key ${key} — nothing to bind to.` };
      } else if (ck.quarantined) {
        stats.quarantinedKeySkipped++;
        codeFailure = { ...base, reason: 'QUARANTINED_KEY', detail: `Key ${key} is a quarantined parsing artifact — never bound, never priced.` };
      } else if (ck.type.toLowerCase() !== e.category) {
        codeFailure = { ...base, reason: 'TYPE_MISMATCH', detail: `Key ${key} is ${ck.type}, source entry is ${e.category}.` };
      } else if (!name || !ck.name) {
        codeFailure = { ...base, reason: 'NAME_GATE_REJECTED', detail: `No usable name on one side (entry ${JSON.stringify(name)} vs key ${JSON.stringify(ck.name)}) — a VERIFIED binding needs a name check.` };
      } else {
        const sim = pipelineNameCompatible(name, ck.name);
        if (sim < NAME_COMPATIBLE_THRESHOLD) {
          codeFailure = { ...base, reason: 'NAME_GATE_REJECTED', detail: `Name compatibility ${sim.toFixed(2)} < ${NAME_COMPATIBLE_THRESHOLD} (entry ${JSON.stringify(name)} vs key ${JSON.stringify(ck.name)}).` };
        } else {
          const resourceId = repByKey.get(key);
          if (!resourceId) {
            codeFailure = { ...base, reason: 'NO_CANONICAL_ENTITY', detail: `Key ${key} has no representative canonical resource row.` };
          } else {
            emitBinding(resourceId, ck, 'EXACT_CODE', sim);
            continue;
          }
        }
      }
    }

    // ---- tier (b): NAME_UNIT (NEEDS_REVIEW) --------------------------------
    // Same tier the pipeline applies to price rows after the code steps
    // fail — including for entries with no code at all (3.303 CK rows).
    // A quarantined exact key does not block this tier: NAME_UNIT only
    // ever binds a DIFFERENT, non-quarantined key by name.
    const nameHit = tryNameUnit(name, unit, e.category);
    if (nameHit) {
      const resourceId = repByKey.get(nameHit.key.key);
      if (resourceId) {
        emitBinding(resourceId, { code: keyByKey.get(nameHit.key.key)?.code || '' }, 'NAME_UNIT', nameHit.sim);
        continue;
      }
      codeFailure = {
        ...base,
        reason: 'NO_CANONICAL_ENTITY',
        detail: `Name+unit matched key ${nameHit.key.key}, but it has no representative canonical resource row.`,
      };
    }

    // Both tiers failed: record the code-step reason (most specific).
    if (codeFailure) unbound.push(codeFailure);
  }

  // ---- sort + counts --------------------------------------------------------
  bindings.sort(
    (a, b) =>
      a.resourceId.localeCompare(b.resourceId) ||
      a.sourceDataset.localeCompare(b.sourceDataset) ||
      (a.sourceRecordId || '').localeCompare(b.sourceRecordId || '') ||
      a.sourceCode.localeCompare(b.sourceCode)
  );
  unbound.sort(
    (a, b) =>
      a.sourceDataset.localeCompare(b.sourceDataset) ||
      a.sourceCode.localeCompare(b.sourceCode) ||
      a.originalDescription.localeCompare(b.originalDescription)
  );

  const byDataset: Record<string, number> = {};
  const byVerificationStatus: Record<string, number> = {};
  for (const b of bindings) {
    byDataset[b.sourceDataset] = (byDataset[b.sourceDataset] || 0) + 1;
    byVerificationStatus[b.verificationStatus] = (byVerificationStatus[b.verificationStatus] || 0) + 1;
  }
  const entities = new Set(bindings.map((b) => b.resourceId)).size;

  const file: SourceIdentityRegistryFile = {
    generatedAt,
    version: '2026.1',
    counts: { bindings: bindings.length, entities, byDataset, byVerificationStatus, unbound: unbound.length },
    stats,
    bindings,
    unbound,
  };

  fs.mkdirSync(VALIDATED_DIR, { recursive: true });
  fs.writeFileSync(path.join(VALIDATED_DIR, 'source_identity_registry.json'), JSON.stringify(file, null, 2));

  // ---- runtime projection (chunked, like priceMaster) -----------------------
  const CHUNK = 150;
  const chunks: string[] = [];
  const n = Math.ceil(bindings.length / CHUNK);
  for (let i = 0; i < n; i++) {
    chunks.push(`const REG_CHUNK_${i}: SourceIdentityBinding[] = ${JSON.stringify(bindings.slice(i * CHUNK, (i + 1) * CHUNK))};`);
  }
  const spread = Array.from({ length: n }, (_, i) => `...REG_CHUNK_${i}`).join(', ');
  fs.writeFileSync(
    path.join(SRC_DIR, 'sourceIdentityRegistry.generated.ts'),
    `/**
 * AUTO-GENERATED by scripts/price2026/buildSourceIdentityRegistry.ts — DO NOT EDIT.
 *
 * MASTER PRICING §3.2 (M-2) — source identity registry: one canonical entity
 * (RES-xxx) → many source references. A binding is an IDENTITY link, not a
 * price. Only VERIFIED bindings are emitted here; unbound references live
 * only in the validated JSON (data/price2026/validated/
 * source_identity_registry.json), never in the runtime projection.
 * Regenerate with: npm run price:registry (or npm run price:pipeline)
 *
 * bindings: ${bindings.length}   entities: ${entities}
 */

import type { SourceIdentityBinding } from './types';

${chunks.join('\n\n')}

export const SOURCE_IDENTITY_BINDINGS: SourceIdentityBinding[] = [${spread}];

export const SOURCE_IDENTITY_BINDING_COUNT = ${bindings.length};

export const SOURCE_IDENTITY_ENTITY_COUNT = ${entities};
`
  );

  console.log('=== MASTER PRICING §3.2 — SOURCE IDENTITY REGISTRY ===');
  console.log('priceMaster records scanned :', stats.priceMasterRecordsScanned);
  console.log('CK entries scanned          :', stats.ckEntriesScanned);
  console.log('BM adapter entries scanned  :', stats.bmEntriesScanned);
  console.log('bindings emitted            :', bindings.length, `(${entities} entities)`);
  console.log('by dataset                  :', JSON.stringify(byDataset));
  console.log('by verification             :', JSON.stringify(byVerificationStatus));
  console.log('bindings deduped            :', stats.bindingsDeduped, '(same entity+source, different price rows — identity, not price)');
  console.log('unbound references          :', unbound.length);
  console.log('quarantined keys skipped    :', stats.quarantinedKeySkipped);
  console.log('Wrote: data/price2026/validated/source_identity_registry.json');
  console.log('Wrote: src/data/priceDatabase2026/sourceIdentityRegistry.generated.ts');
}

main();
