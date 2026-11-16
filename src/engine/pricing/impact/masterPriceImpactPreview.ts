/**
 * MASTER PRICING §9 — GLOBAL PRICE CHANGE IMPACT PREVIEW (real calculator).
 * =========================================================================
 *
 * Implements Master Prompt §9 (Phase Eight — Global Price Change Impact
 * Warning): the MANDATORY impact preview for global master price updates
 * and AHSP version changes. This module is the real calculator behind the
 * §8 `ImpactProvider` seam — it replaces `notComputedImpactProvider` as
 * the default for the Mode A flow (see `masterPriceImpactProvider` below
 * and the wiring in `ahspVersioning.ts`).
 *
 * WHAT IT COMPUTES (all from real data — never estimated, never sampled)
 * ----------------------------------------------------------------------
 * Two change kinds, one preview shape:
 *
 * 1. `AHSP_VERSION_CHANGE` / `ROLLBACK` — a proposed new AHSP version
 *    (Mode A direct edit, Mode B publish, or rollback to an older
 *    version's content). Input: family + base version + new content +
 *    the §8 diff (`compareAhspSnapshots`). Output: per-item deltas from
 *    the diff's baked unit prices, component changes from the field
 *    diffs, and per-project RAB deltas from repricing project items
 *    against the new version's items through the canonical resolver.
 *
 * 2. `MASTER_PRICE_CHANGE` — a change to the EFFECTIVE (resolved) price
 *    of one or more resource keys (code + unit), e.g. §9.1's Semen
 *    Portland Rp1.450 → Rp1.500/kg. Output: the fan-out over the
 *    resource→component index (families / items / component references),
 *    per-item direct-cost deltas, and per-project RAB deltas.
 *
 * THE EFFECTIVE-PRICE MODEL (read this before using the master-price path)
 * ------------------------------------------------------------------------
 * A master price change is modelled as a change to the price the
 * RESOLVER returns for a resource key — the effective price components
 * actually pay — not as an edit to one underlying record. The preview
 * VERIFIES that model at compute time: for every changed key it resolves
 * the current effective price and requires it to equal the stated old
 * price. If it does not (the key resolves through a different record, or
 * the admin's baseline is stale), the preview is NOT_COMPUTED — it never
 * computes an impact on a false premise. Which record wins a key is the
 * §4 selection's job; the preview models the effective price, and says so.
 *
 * Consequences of the model (all pinned by tests):
 * - Price REMOVAL (new price null) is NOT_COMPUTED: after removing the
 *   winning record, the next-best record (or a direct CK/BM source)
 *   would win, and the preview cannot determine that fallback price
 *   without re-running selection. Refusing beats guessing a fallback.
 * - A key the resolver REFUSEs (§6 (i) underspecified) does not bind:
 *   a change to it has zero impact on resolved prices, recorded as a
 *   non-binding change with its reason — never as a computed delta.
 * - Binding is by resource code + unit (the same key the resolver's
 *   context map uses: `looseCode|normalizedUnit`, with the unit passed
 *   through the resolver's own type-aware normalization pipeline).
 *   Components WITHOUT a code cannot be attributed to a code-keyed
 *   change (they resolve by name); they are counted, not silently
 *   included or silently dropped.
 *
 * HOW PROJECT DELTAS ARE COMPUTED (the canonical path, no custom ladder)
 * -----------------------------------------------------------------------
 * - Baseline = the project's STORED RabItems (what `recalculateCostSummary`
 *   totals today). New items = the same items repriced under the change.
 *   Delta = `recalculateCostSummary(new) - recalculateCostSummary(old)`
 *   — the financial engine is authoritative; this module never totals a
 *   project with its own formula.
 * - Repricing goes through the canonical resolver (`resolveAhspUnitPrice`):
 *   version path = compose the NEW version's item; master-price path =
 *   recompose the item with the changed components' prices replaced
 *   (arithmetic over the resolver's own per-component subtotals, mirroring
 *   its baked-price and baked-total fallbacks exactly — see
 *   `repriceItemForMasterPriceChange`).
 * - Item amounts use the canonical formula
 *   `SafeDecimalEngine.safeMultiply(volume, unitPrice, 0)`.
 * - LIVE projects reprice; SNAPSHOT projects are locked (delta 0) with an
 *   `adoptionPreview` (the would-be delta if the owner adopts — §10 owns
 *   adoption itself, this is data only); OVERRIDE projects reprice with
 *   their override prices winning over the new master prices per
 *   component key (a covered component's delta is exactly 0).
 * - Items that must NOT move: manual prices (PRICE_MANUAL), assumption
 *   prices (PRICE_ESTIMATED), HSP/DHSP-basis items (their price is the
 *   PUBLISHED DHSP schedule, which neither a master price change nor an
 *   AHSP version change republishes — delta 0 by rule, documented in
 *   `repriceProjectItem`), and items with no AHSP linkage.
 * - An item whose new price cannot be determined (AHSP item removed in
 *   the new version, new composition unresolvable) is UNCOMPUTABLE for
 *   that project — the project's delta becomes NOT_COMPUTABLE and the
 *   aggregate total delta becomes null, never a partial sum presented
 *   as complete.
 *
 * PURITY
 * ------
 * Every function here is pure: no localStorage, no network, no mutation
 * of inputs, no writes of any kind. The workspace collector lives in a
 * separate module (`workspaceProjectCollector.ts`) and only READS.
 *
 * CACHE BYPASS (read this before "optimizing" it away): the resolver's
 * default composition cache is keyed by ITEM CODE. This calculator
 * resolves ARBITRARY item arrays (fixtures, snapshots, new versions) —
 * a new version's item shares the old item's code but not its content,
 * so a cached composition would silently be the OLD item's price
 * (proven by probe 2026-11-16: a coefficient change 0.6 → 0.7 returned
 * the cached 715,816). Every resolution here therefore goes through an
 * EXPLICIT pricing context (the project's own context, or an explicit
 * LIVE context), which §6 (d) excludes from the default cache — with
 * zero change to resolution semantics (a LIVE context resolves exactly
 * like a default query). The calculator never warms, reads, or
 * invalidates the resolver's cache: no shared state is touched at all.
 *
 * FRESHNESS (stale previews are refused, §9.3)
 * --------------------------------------------
 * Every COMPUTED preview carries a fingerprint of the state it was
 * computed over (base + new content checksums, active pointer, master
 * price version, baseline prices, project-input hash). `computedAt` is
 * RECORDED in the fingerprint for audit but is NOT part of the hash —
 * the hash covers state only, so a validator can recompute the same
 * hash from current state. `validateImpactPreviewFreshness` recomputes
 * and compares; `markPreviewStale` produces a STALE copy. A STALE
 * preview is never usable for confirm (`confirmDirectEdit` rejects it,
 * and `applyDirectEdit` re-checks the new-content checksum).
 *
 * PERFORMANCE (§9 (g))
 * ---------------------
 * The resource→component index is built once per computation (O(items +
 * components)); changed keys fan out through the index, never by
 * scanning the catalog per key. No sampling anywhere: every affected
 * item and component is computed. Full-catalog timings are measured in
 * the test suite and reported in `fase9-impact-preview.md`.
 */
import type {
  AhspFamily,
  AhspVersionChangeDescription,
  AhspVersionImpact,
  ImpactProvider,
} from '../../../data/nationalCostDatabase/ahspVersioning';
import type {
  AHSPVersionDiff,
  NationalAHSPItem,
} from '../../../data/nationalCostDatabase/types';
import type {
  AhspUnitPriceComposition,
  ComponentPriceMapRef,
  ProjectPricingContext,
  ProjectPricingMode,
  ResourceType,
} from '../../../data/priceDatabase2026/types';
import { MASTER_PRICE_VERSION } from '../../../data/priceDatabase2026/types';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
import {
  buildComponentPriceRef,
  contextCodeKey,
} from '../../../data/priceDatabase2026/centralResolution';
import {
  componentTypeFromCode,
  normalizeUnitForType,
} from '../../../data/priceDatabase2026/normalize';
import { recalculateCostSummary } from '../../unifiedProjectEngine';
import { SafeDecimalEngine } from '../../safeDecimalEngine';
import type {
  AHSPComponent,
  ProjectCostSummary,
  ProjectPriceOverride,
  RabItem,
} from '../../../types';

// ---------------------------------------------------------------------------
// Deterministic hash + canonical JSON (same FNV-1a 64-bit primitive as §4/§8,
// duplicated deliberately so this engine module does not import the §8
// versioning engine — the impact module only type-imports ahspVersioning,
// which keeps the runtime import graph acyclic: ahspVersioning → this
// module → resolver/centralResolution/unifiedProjectEngine)
// ---------------------------------------------------------------------------

/** FNV-1a 64-bit hex — same deterministic-hash primitive as §4.4 / §8. */
function fnv1aHex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Deep-sort object keys (arrays keep order — order is meaningful there). */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Canonical JSON string: deep-key-sorted, so key order cannot change it. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ImpactPreviewKind = 'AHSP_VERSION_CHANGE' | 'MASTER_PRICE_CHANGE' | 'ROLLBACK';

/** COMPUTED only when the input was complete and every number is real. */
export type ImpactPreviewStatus = 'COMPUTED' | 'STALE' | 'NOT_COMPUTED';

/**
 * One master price change: the EFFECTIVE price of a resource key
 * (code + unit) moves from oldPrice to newPrice. See the module header
 * for the effective-price model. `newPrice: null` (removal) is refused
 * (NOT_COMPUTED) — the fallback price cannot be determined by preview.
 */
export interface MasterPriceChangeInput {
  /** Resource code as printed (M01, L.05, E07, …). */
  resourceCode: string;
  /** Canonical entity id (RES-xxx) when known — informational only; binding is by code+unit. */
  resourceId?: string | null;
  /** Resource name as printed (used for the resolver's name gate at baseline verification). */
  resourceName?: string | null;
  /** Category when known (derives the resolver query type when the code prefix is ambiguous). */
  category?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | null;
  /** Unit the price applies to (the price record's unit, e.g. kg, m3, OJ). */
  unit: string;
  /** Current effective price (null = currently unpriced). Verified against the resolver at compute time. */
  oldPrice: number | null;
  /** Proposed effective price (null = removal — refused, see module header). */
  newPrice: number | null;
  region?: string | null;
  source?: string | null;
}

/**
 * One workspace project as impact input. Produced by
 * `workspaceProjectCollector.collectWorkspaceProjects` (real workspace)
 * or by hand in tests (fixtures — always labelled as such there).
 *
 * `pricingMode` absent (or null) means SNAPSHOT_PRICE (Decision D —
 * §8 `resolveProjectAhspVersion` reads unrecorded mode as snapshot;
 * existing projects are never silently live). `items` are the project's
 * flat RabItems (the `ezrab_prod_rab_items` store — the same list
 * `recalculateProjectSummary` totals). `costSummary` is the project's
 * overhead/profit/tax configuration in exactly the shape
 * `recalculateProjectSummary` passes to `recalculateCostSummary`.
 */
export interface ProjectImpactInput {
  projectId: string;
  projectName: string;
  isDemo?: boolean;
  pricingMode?: ProjectPricingMode | null;
  pinnedAhspDatabaseVersion?: string | null;
  pinnedMasterPriceVersion?: string | null;
  items: readonly RabItem[];
  costSummary: Partial<ProjectCostSummary>;
  overrides?: readonly ProjectPriceOverride[];
}

/** Per-item AHSP impact (catalog level — §9 (b)(1)/(b)(2)). */
export interface AhspItemImpact {
  itemId: string;
  code: string;
  name: string;
  family: AhspFamily;
  unit: string;
  changeKind: 'ADDED' | 'REMOVED' | 'REVISED' | 'PRICE_CHANGED';
  /** Baked unitPrice (version path) or resolver composition total (master-price path). Null = unpriced, NOT Rp0. */
  oldUnitPrice: number | null;
  newUnitPrice: number | null;
  /** new - old. Null when either side is unpriced (a delta against "no price" is undefined). */
  delta: number | null;
  /** Percent change vs old, 2 decimals. Null when old is null or 0. */
  percentChange: number | null;
  /** Component changes on this item (version path: from field diffs; master-price path: changed components). */
  componentChangeCount: number;
  /** Resolver composition status on the NEW side (master-price path only). */
  pricingStatusNew?: 'FULL' | 'PARTIAL' | 'MISSING' | null;
  missingComponentsNew?: number | null;
  /** Why the delta could not be computed (null when computed). */
  uncomputableReason?: string | null;
}

/** One affected component reference (§9 (b)(2)). */
export interface AffectedComponentRef {
  itemCode: string;
  itemName: string;
  family: AhspFamily;
  componentType: 'labor' | 'material' | 'equipment';
  code: string;
  name: string;
  unit: string;
  coefficient: number;
  /** Resource key this reference is bound by (code|unit). */
  resourceKey: string;
  oldPrice: number | null;
  newPrice: number | null;
  /** coeff × (new - old), rounded to 2 decimals like the resolver's subtotals. Null when either price is null. */
  deltaPerUnit: number | null;
  changeKind: 'PRICE_CHANGED' | 'ADDED' | 'REMOVED' | 'REVISED';
}

/**
 * Per-family roll-up. The change-kind counts mirror `items.summary`'s
 * taxonomy exactly: a PRICE_CHANGED item (master-price path — its
 * content is untouched, only a resource price moved) is NOT a
 * "revision" and is counted separately.
 */
export interface FamilyImpactSummary {
  family: AhspFamily;
  affectedItemCount: number;
  affectedComponentReferenceCount: number;
  addedItemCount: number;
  removedItemCount: number;
  revisedItemCount: number;
  priceChangedItemCount: number;
}

/** Per-project RAB item repricing outcome. */
export type ProjectItemImpactStatus =
  | 'REPRICED'
  | 'UNCHANGED'
  | 'NEWLY_PRICED'
  | 'BECAME_UNPRICED'
  | 'UNCOMPUTABLE'
  | 'SKIPPED';

export interface ProjectItemImpact {
  rabItemId: string;
  code: string;
  description: string;
  ahspCode: string | null;
  volume: number;
  unit: string;
  oldUnitPrice: number | null;
  newUnitPrice: number | null;
  oldAmount: number | null;
  newAmount: number | null;
  /** newAmount - oldAmount, where an excluded (unpriced) side contributes 0. Null only when UNCOMPUTABLE. */
  deltaAmount: number | null;
  status: ProjectItemImpactStatus;
  /** Always present: why this outcome (rule name + evidence). */
  reason: string;
  missingComponentsNew?: number | null;
}

/** Per-project impact (§9 (b)(3)). */
export type ProjectImpactStatus = 'AFFECTED' | 'UNAFFECTED' | 'LOCKED_SNAPSHOT' | 'NOT_COMPUTABLE';

export interface ProjectImpact {
  projectId: string;
  projectName: string;
  isDemo: boolean;
  pricingMode: ProjectPricingMode;
  pricingModeSource: 'RECORDED' | 'DEFAULT_SNAPSHOT';
  pinnedAhspDatabaseVersion: string | null;
  status: ProjectImpactStatus;
  /** Stored totals (recalculateCostSummary over the stored items). */
  oldGrandTotal: number;
  oldDirectCost: number;
  /** Totals under the change (null when NOT_COMPUTABLE — never a partial sum). */
  newGrandTotal: number | null;
  newDirectCost: number | null;
  deltaGrandTotal: number | null;
  deltaDirectCost: number | null;
  totalItemCount: number;
  repricedItemCount: number;
  unchangedItemCount: number;
  skippedItemCount: number;
  uncomputableItemCount: number;
  /** Affected + uncomputable + skipped items (unchanged items are counted, not listed). */
  items: ProjectItemImpact[];
  /**
   * SNAPSHOT projects only: the would-be delta if the owner explicitly
   * adopts the change (§10.2 — adoption itself is §10's job; this is
   * data only, excluded from every aggregate). Null when the adoption
   * preview itself is not computable.
   */
  adoptionPreview: {
    newGrandTotal: number | null;
    deltaGrandTotal: number | null;
    affectedItemCount: number;
    uncomputableItemCount: number;
    uncomputableReasons: string[];
  } | null;
  uncomputableReasons: string[];
}

/**
 * Fingerprint of the state a preview was computed over (§9 (d)).
 * `computedAt` is RECORDED for audit but is NOT part of `fingerprintHash`
 * (the hash covers state only, so a validator can recompute the same hash
 * from current state — a timestamp in the hash would make every preview
 * instantly stale).
 */
export interface ImpactPreviewFingerprint {
  kind: ImpactPreviewKind;
  family: AhspFamily | null;
  sourceVersionId: string | null;
  targetVersionId: string | null;
  baseContentChecksum: string | null;
  newContentChecksum: string | null;
  /** Active pointer value at compute time (version kind). A publish moves it → stale. */
  activeVersionIdAtCompute: string | null;
  masterPriceVersion: string;
  /** Baseline effective prices the preview was computed against (master-price kind): key → old price. */
  changedResourceBaseline: ReadonlyArray<{ key: string; oldPrice: number | null }>;
  /** Hash of the project inputs the preview was computed over (ids, modes, pins, items, overrides). */
  projectsFingerprint: string;
  /** Single combined hash (FNV-1a over the canonical fingerprint JSON, excluding computedAt). */
  fingerprintHash: string;
  computedAt: string;
}

/** The complete, auditable impact preview (§9 (f)). */
export interface MasterPriceImpactPreview {
  status: ImpactPreviewStatus;
  kind: ImpactPreviewKind;
  computedAt: string;
  /** Human-readable note — always present, even for NOT_COMPUTED/STALE. */
  note: string;
  /** Reasons the preview is NOT_COMPUTED (empty when COMPUTED). */
  notComputedReasons: string[];
  /** Reasons the preview was marked STALE (empty unless status is STALE). */
  staleReasons: string[];
  fingerprint: ImpactPreviewFingerprint;
  change: {
    family: AhspFamily | null;
    sourceVersionId: string | null;
    targetVersionId: string | null;
    priceChanges: ReadonlyArray<MasterPriceChangeInput>;
    /** Keys that do not bind (§6 (i) REFUSE) — zero impact, with reasons. */
    nonBindingChanges: ReadonlyArray<{ key: string; reason: string }>;
  };
  items: {
    summary: {
      added: number;
      removed: number;
      revised: number;
      priceChanged: number;
      totalAffected: number;
      uncomputable: number;
    };
    changed: AhspItemImpact[];
  };
  components: {
    summary: {
      affectedReferenceCount: number;
      byFamily: FamilyImpactSummary[];
      /** Components with no code — not attributable to a code-keyed change (counted, not dropped silently). */
      codelessComponentCount: number;
    };
    affected: AffectedComponentRef[];
  };
  projects: {
    summary: {
      totalProjectCount: number;
      liveProjectCount: number;
      snapshotProjectCount: number;
      overrideProjectCount: number;
      demoProjectCount: number;
      affectedProjectCount: number;
      lockedSnapshotCount: number;
      notComputableProjectCount: number;
    };
    projects: ProjectImpact[];
  };
  aggregates: {
    /** Σ LIVE + OVERRIDE grand-total deltas. Null when any affected project is NOT_COMPUTABLE. */
    totalDeltaGrandTotal: number | null;
    totalDeltaDirectCost: number | null;
    newlyPricedItemCount: number;
    becameUnpricedItemCount: number;
    uncomputableProjectCount: number;
  };
  /** §4.4 history inputs: affected AHSP codes + affected live-price project ids (sorted, deduped). */
  affectedAhspReferences: string[];
  affectedLivePriceProjects: string[];
}

// ---------------------------------------------------------------------------
// Money + validation helpers (SafeDecimalEngine is the canonical channel —
// full rupiah, no hidden rounding; percents are ratios, 2 decimals)
// ---------------------------------------------------------------------------

/** Delta between two nullable prices. Null when either side is unpriced. */
function priceDelta(oldPrice: number | null, newPrice: number | null): number | null {
  if (oldPrice === null || newPrice === null) return null;
  return SafeDecimalEngine.safeSubtract(newPrice, oldPrice);
}

/** Percent change vs old, 2 decimals. Null when old is null or 0. */
function percentChange(oldPrice: number | null, delta: number | null): number | null {
  if (oldPrice === null || delta === null || oldPrice === 0) return null;
  return SafeDecimalEngine.safeRound(
    SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(delta, oldPrice, 6), 100, 2),
    2,
  );
}

/** The resolver's per-component subtotal rounding: round(coef × price, 2). */
function roundSubtotal(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Canonical RabItem amount: volume × unitPrice, whole rupiah. Null when unpriced. */
function itemAmount(volume: number, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  return SafeDecimalEngine.safeMultiply(volume, unitPrice, 0);
}

function isValidPrice(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

// ---------------------------------------------------------------------------
// Resource → component index (§9 (g): built once, O(items + components);
// changed keys fan out through the map, never by scanning the catalog)
// ---------------------------------------------------------------------------

export interface IndexedComponentRef {
  itemId: string;
  itemCode: string;
  itemName: string;
  family: AhspFamily;
  componentType: 'labor' | 'material' | 'equipment';
  componentIndex: number;
  code: string;
  name: string;
  unit: string;
  coefficient: number;
  /** The resolver-lookup key for this component (see `componentLookupKey`). */
  resourceKey: string;
}

export interface ResourceComponentIndex {
  /** resourceKey → every component bound by that key (sorted by item code, then component index). */
  byKey: ReadonlyMap<string, readonly IndexedComponentRef[]>;
  itemCount: number;
  componentCount: number;
  /** Components with no code — unbindable by a code-keyed change (counted, not dropped silently). */
  codelessComponentCount: number;
  /** Distinct resource keys in the index. */
  distinctKeyCount: number;
}

/**
 * The key the RESOLVER uses to look a component price up in a context
 * map — mirrored exactly from `resolveAhspUnitPrice` → `resolveResourcePrice`
 * → `lookupContextPrice`: the component's raw unit goes through the
 * type-aware normalization (`normalizeUnitForType`, with the effective
 * type = code prefix type, else the array type, and the item domain),
 * then the plain `contextCodeKey` (looseCode|normalizedUnit). Mirroring
 * the pipeline (instead of keying on the raw unit) is what makes the
 * index agree with the resolver on e.g. labor `jam` vs `OJ`.
 */
export function componentLookupKey(
  component: Pick<AHSPComponent, 'code' | 'unit'>,
  arrayType: 'labor' | 'material' | 'equipment',
  domain: string | undefined,
): string {
  const code = String(component.code || '').trim();
  if (code === '') return '';
  const effectiveType = componentTypeFromCode(code) || arrayType;
  const unit = normalizeUnitForType(String(component.unit || ''), effectiveType, domain);
  return contextCodeKey(code, unit);
}

/** The key for a proposed price change (the price record's unit is already canonical). */
export function priceChangeKey(change: Pick<MasterPriceChangeInput, 'resourceCode' | 'unit'>): string {
  return contextCodeKey(change.resourceCode, change.unit);
}

/**
 * Build the resource→component index over a catalog. Pure: reads the
 * items, builds new maps, mutates nothing. Components with an empty
 * code are counted in `codelessComponentCount` and NOT indexed (a
 * code-keyed price change cannot be deterministically attributed to
 * them — they resolve by name in the resolver).
 */
export function buildResourceComponentIndex(
  items: readonly NationalAHSPItem[],
): ResourceComponentIndex {
  const byKey = new Map<string, IndexedComponentRef[]>();
  let componentCount = 0;
  let codelessComponentCount = 0;
  const arrays: ReadonlyArray<{
    key: 'laborComponents' | 'materialComponents' | 'equipmentComponents';
    type: 'labor' | 'material' | 'equipment';
  }> = [
    { key: 'laborComponents', type: 'labor' },
    { key: 'materialComponents', type: 'material' },
    { key: 'equipmentComponents', type: 'equipment' },
  ];
  for (const item of items) {
    const family = item.domain as AhspFamily;
    for (const { key, type } of arrays) {
      const comps = item[key] ?? [];
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        componentCount++;
        const resourceKey = componentLookupKey(c, type, item.domain);
        if (resourceKey === '') {
          codelessComponentCount++;
          continue;
        }
        const ref: IndexedComponentRef = {
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          family,
          componentType: type,
          componentIndex: i,
          code: String(c.code || '').trim(),
          name: String(c.name || ''),
          unit: String(c.unit || ''),
          coefficient: typeof c.coefficient === 'number' && Number.isFinite(c.coefficient) ? c.coefficient : 0,
          resourceKey,
        };
        const list = byKey.get(resourceKey);
        if (list) list.push(ref);
        else byKey.set(resourceKey, [ref]);
      }
    }
  }
  for (const list of byKey.values()) {
    list.sort((a, b) =>
      a.itemCode < b.itemCode ? -1 : a.itemCode > b.itemCode ? 1 : a.componentIndex - b.componentIndex,
    );
  }
  return {
    byKey,
    itemCount: items.length,
    componentCount,
    codelessComponentCount,
    distinctKeyCount: byKey.size,
  };
}

// ---------------------------------------------------------------------------
// Catalog lookup maps (by stable id + by code, with ambiguity detection)
// ---------------------------------------------------------------------------

/**
 * Catalog lookup maps (§9; exported for §10 adoption repricing — the
 * adoption replays the SAME lookup the preview used, never a second
 * implementation of it).
 */
export interface CatalogMaps {
  byId: ReadonlyMap<string, NationalAHSPItem>;
  /** Lower-cased code (code / codeNormalized / standardCode) → item. Ambiguous codes are absent (see `ambiguousCodes`). */
  byCode: ReadonlyMap<string, NationalAHSPItem>;
  ambiguousCodes: ReadonlySet<string>;
}

/** Build the catalog lookup maps (§9; exported for §10). */
export function buildCatalogMaps(items: readonly NationalAHSPItem[]): CatalogMaps {
  const byId = new Map<string, NationalAHSPItem>();
  const byCode = new Map<string, NationalAHSPItem>();
  const ambiguousCodes = new Set<string>();
  for (const item of items) {
    if (item.id && !byId.has(item.id)) byId.set(item.id, item);
    const codes = [item.code, item.codeNormalized, item.standardCode];
    for (const raw of codes) {
      const code = String(raw || '').trim().toLowerCase();
      if (code === '') continue;
      const existing = byCode.get(code);
      if (existing === undefined) {
        byCode.set(code, item);
      } else if (existing !== item) {
        ambiguousCodes.add(code);
        byCode.delete(code);
      }
    }
  }
  return { byId, byCode, ambiguousCodes };
}

/** The AHSP code a RabItem links by: ahspCode first, then code (the precedent in `reportAhspDetail`). */
function rabItemAhspCode(item: RabItem): string {
  return String(item.ahspCode || item.code || '').trim();
}

/** Find a catalog item by code (§9; exported for §10). Ambiguous codes return null. */
export function findCatalogItemForCode(maps: CatalogMaps, code: string): NationalAHSPItem | null {
  const key = code.trim().toLowerCase();
  if (key === '') return null;
  return maps.byCode.get(key) ?? null;
}

/**
 * Map a RabItem to its OLD-state AHSP item: by code (ahspCode, then
 * code) first; then by the frozen snapshot's ahspId (covers a catalog
 * item whose code changed since the row was written); then the frozen
 * snapshot itself as an item-like (a custom item with no catalog
 * entry); else null (a manual item with no AHSP linkage).
 *
 * Exported for §10: adoption replays the SAME mapping the preview
 * used, so the adopted items are the preview's items.
 */
export function resolveOldCatalogItem(maps: CatalogMaps, rabItem: RabItem): NationalAHSPItem | null {
  const code = rabItemAhspCode(rabItem);
  const byCode = code !== '' ? findCatalogItemForCode(maps, code) : null;
  if (byCode) return byCode;
  const snapshotId = rabItem.ahspSnapshot?.ahspId;
  if (snapshotId) {
    const byId = maps.byId.get(snapshotId);
    if (byId) return byId;
  }
  if (rabItem.ahspSnapshot) return snapshotToItemLike(rabItem.ahspSnapshot);
  return null;
}

/** A RabItem's frozen snapshot as an item-like the resolver can compose (custom items with no catalog entry). */
function snapshotToItemLike(snapshot: NonNullable<RabItem['ahspSnapshot']>): NationalAHSPItem {
  // The snapshot carries no domain — derive it with the SAME code-prefix
  // heuristic `resolveAhspUnitPrice` uses (digit-start codes are Bina
  // Marga), so the domain the resolver sees matches the domain the
  // lookup keys were built with.
  const code = String(snapshot.code || '');
  const looksBinaMarga = /^(10|[1-9])\./.test(code);
  return {
    // Always a synthetic id: the snapshot's ahspId (when present) is
    // tried as a CATALOG id by `resolveOldCatalogItem` first — reaching
    // here means it matched nothing, so the item-like must not reuse it
    // (it would masquerade as a catalog item in id-based checks).
    id: `snapshot:${snapshot.code}`,
    code: snapshot.code,
    codeNormalized: snapshot.code,
    name: snapshot.name,
    unit: snapshot.unit,
    domain: looksBinaMarga ? 'BINA_MARGA' : 'CIPTA_KARYA',
    category: '',
    version: snapshot.version || '2026',
    year: 2026,
    normativeStatus: 'Custom',
    method: 'UNSPECIFIED',
    sourceId: '',
    sourceDocument: snapshot.sourceDocument || '',
    status: 'VERIFIED',
    laborComponents: snapshot.laborComponents ?? [],
    materialComponents: snapshot.materialComponents ?? [],
    equipmentComponents: snapshot.equipmentComponents ?? [],
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    unitPrice: snapshot.unitPrice ?? null,
    lastUpdated: snapshot.snapshotTimestamp || '',
    dataQualityScore: 0,
  } as NationalAHSPItem;
}

// ---------------------------------------------------------------------------
// Resolver composition mirroring (master-price path)
// ---------------------------------------------------------------------------

/**
 * Mirror of the resolver's per-component subtotal rule in
 * `resolveAhspUnitPrice.build`: subtotal = round(coef × price, 2), and
 * when that is null or 0 while the component carries a baked total
 * (`c.total > 0`), the baked total is used instead. The arithmetic
 * route reuses the resolver's OWN subtotals for unchanged components
 * (taken from the old composition) and mirrors the rule only for
 * changed components — so the new total agrees with a fresh resolver
 * composition to the rupiah.
 */
function mirrorComponentSubtotal(
  coefficient: number,
  price: number | null,
  bakedTotal: number | null | undefined,
): number | null {
  let subtotal: number | null = price === null ? null : roundSubtotal(coefficient * price);
  if ((subtotal === null || subtotal === 0) && typeof bakedTotal === 'number' && bakedTotal > 0) {
    subtotal = bakedTotal;
  }
  return subtotal;
}

/**
 * Mirror of the resolver's item-total rule: the total is the rounded sum
 * of the priced components' subtotals; when nothing resolves (or the sum
 * rounds to 0) and the item carries a baked unitPrice, the baked price
 * is the total. Returns the total plus the priced/missing counts the
 * preview reports.
 */
function mirrorItemTotal(
  item: NationalAHSPItem,
  subtotals: ReadonlyArray<number | null>,
): { unitPrice: number | null; resolvedCount: number; missingCount: number } {
  let sum = 0;
  let resolvedCount = 0;
  for (const s of subtotals) {
    if (s !== null) {
      sum = SafeDecimalEngine.safeAdd(sum, s);
      resolvedCount++;
    }
  }
  let unitPrice: number | null = resolvedCount > 0 ? Math.round(sum) : null;
  if ((unitPrice === null || unitPrice === 0) && typeof item.unitPrice === 'number' && item.unitPrice > 0) {
    unitPrice = item.unitPrice;
  }
  return { unitPrice, resolvedCount, missingCount: subtotals.length - resolvedCount };
}

/**
 * Resolve an item's composition WITHOUT the resolver's default cache.
 * The cache is keyed by item code, and this calculator resolves
 * arbitrary item arrays (new versions share the old items' codes) —
 * a cached composition would be the wrong item's price (see the
 * module header). An explicit pricing context bypasses the cache
 * (§6 (d)); a LIVE context resolves exactly like a default query.
 */
function resolveCompositionUncached(
  item: NationalAHSPItem,
  projectContext: ProjectPricingContext | null,
): AhspUnitPriceComposition {
  return priceResolver2026.resolveAhspUnitPrice(item, {
    pricingContext: projectContext ?? { pricingMode: 'LIVE_MASTER_PRICE' },
  });
}

type ComponentArrayKey = 'laborComponents' | 'materialComponents' | 'equipmentComponents';
const COMPONENT_ARRAY_KEYS: ReadonlyArray<{
  key: ComponentArrayKey;
  type: 'labor' | 'material' | 'equipment';
}> = [
  { key: 'laborComponents', type: 'labor' },
  { key: 'materialComponents', type: 'material' },
  { key: 'equipmentComponents', type: 'equipment' },
];

/**
 * Reprice ONE item under a master price change, arithmetically over the
 * resolver's own old composition. Returns the new unit price plus the
 * per-category new subtotals (for the repriced RabItem's category
 * prices) and the missing counts. `changedPrices` maps resourceKey →
 * new effective price (null entries are refused upstream — removals are
 * NOT_COMPUTED). `overridePrices` maps resourceKey → project override
 * price (OVERRIDE projects): a covered component keeps its override
 * price on both sides, so its delta is exactly 0.
 *
 * Old side: `resolveAhspUnitPrice(item, projectContext)` — the canonical
 * composition under the project's own context (LIVE: none; OVERRIDE:
 * the project's override map). New side: the same composition with each
 * changed, uncovered component's price replaced by the new effective
 * price (or the baked price when the new price is 0 — the resolver's
 * own baked fallback for a 0 price — or the baked total when neither
 * price exists, mirroring `build` exactly).
 */
/** Per-component old/new detail from a master-price repricing (the audit trail for §9 (b)(2)). */
export interface RepriceComponentDetail {
  arrayKey: ComponentArrayKey;
  index: number;
  resourceKey: string;
  /** Resolved old price (null = unpriced on the old side). */
  oldPrice: number | null;
  /** Effective new price (null = unpriced on the new side; equals oldPrice when unchanged/covered). */
  newPrice: number | null;
  oldSubtotal: number | null;
  newSubtotal: number | null;
  /** True when the new price came from a project override (OVERRIDE projects) rather than the master change. */
  coveredByOverride: boolean;
  /** True when this component's key is in the changed set (and not override-covered). */
  changed: boolean;
}

function repriceItemForMasterPriceChange(
  item: NationalAHSPItem,
  projectContext: ProjectPricingContext | null,
  changedPrices: ReadonlyMap<string, number>,
  overridePrices: ReadonlyMap<string, number>,
  /**
   * MASTER PRICING §14 need #11 — store-backed baseline prices per
   * changed key (the sync store's price, which may legitimately
   * differ from the live resolver's reading in a chained change:
   * the store already holds the intermediate price while the live
   * master still reads the pre-change price). When a changed
   * component's key is present here, its OLD subtotal is recomputed
   * from the STORE price (via the exact mirror rule), so the delta
   * is measured against the store baseline, not the live price.
   * Absent (or no entry for a key), the OLD subtotal is the live
   * composition's — behavior is exactly §9's.
   */
  baselinePrices?: ReadonlyMap<string, number | null>,
): {
  oldComposition: AhspUnitPriceComposition;
  /** The OLD unit price the delta is measured against: the live composition's total, or the mirror-recomputed total from store-baseline subtotals when a baseline entry applied to any changed component. */
  oldUnitPrice: number | null;
  newUnitPrice: number | null;
  newCategorySubtotals: { labor: number; material: number; equipment: number };
  newResolvedCount: number;
  newMissingCount: number;
  newPricingStatus: 'FULL' | 'PARTIAL' | 'MISSING';
  componentDetails: RepriceComponentDetail[];
} {
  const oldComposition = resolveCompositionUncached(item, projectContext);
  const oldSubtotals: Array<number | null> = [];
  const newSubtotals: Array<number | null> = [];
  const componentDetails: RepriceComponentDetail[] = [];
  const newCategorySubtotals = { labor: 0, material: 0, equipment: 0 };
  let baselineApplied = false;
  const compositionArrays = {
    laborComponents: oldComposition.labor.components,
    materialComponents: oldComposition.material.components,
    equipmentComponents: oldComposition.equipment.components,
  };
  for (const { key, type } of COMPONENT_ARRAY_KEYS) {
    const rawComps = item[key] ?? [];
    const pricedComps = compositionArrays[key];
    for (let i = 0; i < rawComps.length; i++) {
      const raw = rawComps[i];
      const priced = pricedComps[i];
      // The composition arrays align 1:1 with the item's component
      // arrays (build() iterates in order). A length mismatch is a
      // resolver-shape drift — fail loud in the subtotal (null), never
      // silently reuse a neighbour's subtotal.
      let oldSubtotal = priced ? priced.subtotalPerUnit : null;
      let oldPrice = priced ? priced.unitPrice : null;
      const lookupKey = componentLookupKey(raw, type, item.domain);
      const coveredByOverride = lookupKey !== '' && overridePrices.has(lookupKey);
      const changed = lookupKey !== '' && !coveredByOverride && changedPrices.has(lookupKey);
      const coef =
        typeof raw.coefficient === 'number' && Number.isFinite(raw.coefficient) ? raw.coefficient : 0;
      // §14 need #11 — store-baseline OLD price: the effective-price
      // rule mirrors the changed branch below (store price when
      // positive, else the baked AHSP source price, else unpriced)
      // and the subtotal mirrors the resolver's rule exactly
      // (mirrorComponentSubtotal). Only when a priced entry exists
      // (a length mismatch keeps its loud null) and the component is
      // actually changed (override-covered components never move with
      // a master change, so their OLD price stays the override
      // price already in the live composition).
      if (changed && priced !== undefined && baselinePrices !== undefined && baselinePrices.has(lookupKey)) {
        const storePrice = baselinePrices.get(lookupKey) ?? null;
        const baked = priced.originalAhspSourcePrice ?? null;
        const baselineOldPrice =
          storePrice !== null && storePrice > 0 ? storePrice : baked !== null && baked > 0 ? baked : null;
        oldPrice = baselineOldPrice;
        oldSubtotal = mirrorComponentSubtotal(coef, baselineOldPrice, raw.total);
        baselineApplied = true;
      }
      let newSubtotal: number | null = oldSubtotal;
      let newPrice: number | null = oldPrice;
      if (changed) {
        const proposed = changedPrices.get(lookupKey) as number;
        // `?? null`: originalAhspSourcePrice is `number | null | undefined`
        // — normalize undefined to null so the `!== null` checks below
        // narrow correctly (§9 gate fix 2026-11-16; runtime-identical).
        const baked = priced ? priced.originalAhspSourcePrice ?? null : null;
        const effectivePrice =
          proposed > 0 ? proposed : baked !== null && baked > 0 ? baked : null;
        newPrice = effectivePrice;
        newSubtotal = mirrorComponentSubtotal(coef, effectivePrice, raw.total);
      }
      oldSubtotals.push(oldSubtotal);
      newSubtotals.push(newSubtotal);
      componentDetails.push({
        arrayKey: key,
        index: i,
        resourceKey: lookupKey,
        oldPrice,
        newPrice,
        oldSubtotal,
        newSubtotal,
        coveredByOverride,
        changed,
      });
      if (newSubtotal !== null) {
        newCategorySubtotals[type] = SafeDecimalEngine.safeAdd(newCategorySubtotals[type], newSubtotal);
      }
    }
  }
  const { unitPrice: newUnitPrice, resolvedCount, missingCount } = mirrorItemTotal(item, newSubtotals);
  // §14 need #11 — the OLD total the delta is measured against. When
  // no baseline entry applied, this is exactly the live composition's
  // total (§9 behavior, byte-identical). When a baseline entry
  // applied, the total is mirror-recomputed from the (partly
  // store-baseline) OLD subtotals — the same mirror rule the NEW
  // total uses, so the delta is the store-baseline delta.
  const oldUnitPrice = baselineApplied
    ? mirrorItemTotal(item, oldSubtotals).unitPrice
    : oldComposition.unitPrice;
  const totalComponents = newSubtotals.length;
  const newPricingStatus: 'FULL' | 'PARTIAL' | 'MISSING' =
    totalComponents === 0
      ? newUnitPrice !== null
        ? 'FULL'
        : 'MISSING'
      : missingCount === 0
        ? 'FULL'
        : resolvedCount > 0
          ? 'PARTIAL'
          : newUnitPrice !== null
            ? 'FULL'
            : 'MISSING';
  return {
    oldComposition,
    oldUnitPrice,
    newUnitPrice,
    newCategorySubtotals,
    newResolvedCount: resolvedCount,
    newMissingCount: missingCount,
    newPricingStatus,
    componentDetails,
  };
}

// ---------------------------------------------------------------------------
// Baseline verification (master-price path — the effective-price model)
// ---------------------------------------------------------------------------

/** The baseline check for one changed key (§9; exported for §10 adoption verification). */
export interface BaselineCheck {
  key: string;
  change: MasterPriceChangeInput;
  /** Current effective price from the resolver (null = unpriced / refused). */
  resolvedPrice: number | null;
  resolved: boolean;
  /** §6 (i) REFUSE: the key does not bind — a change to it cannot move any resolved price. */
  refused: boolean;
  refuseReason: string | null;
}

function queryTypeForChange(change: MasterPriceChangeInput): ResourceType {
  if (change.category === 'MATERIAL') return 'material';
  if (change.category === 'LABOR') return 'labor';
  if (change.category === 'EQUIPMENT') return 'equipment';
  return componentTypeFromCode(change.resourceCode) || 'unknown';
}

/**
 * Resolve the current effective price for one changed key (default
 * national context — the same context compositions use).
 *
 * Exported for §10: adoption of a master-price change verifies the
 * new prices are actually live by re-resolving each changed key.
 */
export function verifyChangeBaseline(change: MasterPriceChangeInput): BaselineCheck {
  const key = priceChangeKey(change);
  const res = priceResolver2026.resolveResourcePrice({
    resourceCode: change.resourceCode,
    resourceName: change.resourceName ?? '',
    resourceType: queryTypeForChange(change),
    unit: change.unit,
  });
  const refused = res.underspecified?.action === 'REFUSE';
  return {
    key,
    change,
    resolvedPrice: res.status === 'RESOLVED' ? res.price : null,
    resolved: res.status === 'RESOLVED',
    refused,
    refuseReason: refused ? res.underspecified?.reason ?? 'Underspecified key refused by the resolver' : null,
  };
}

// ---------------------------------------------------------------------------
// Project repricing (shared by both change kinds)
// ---------------------------------------------------------------------------

/**
 * How one RabItem reprices under a change. Produced by the kind-specific
 * repricer. Exported for §10 (adoption replays the preview's repricers).
 */
export interface ItemRepriceOutcome {
  /** The new unit price (null = the item becomes unpriced). Meaningful only when computable. */
  newUnitPrice: number | null;
  newCategorySubtotals: { labor: number; material: number; equipment: number } | null;
  newMissingCount: number | null;
  /** False when the item cannot be repriced (removed AHSP item, no linkage, …) — see reason. */
  computable: boolean;
  /** False when the item is unaffected (no changed components / unchanged AHSP item). */
  affected: boolean;
  reason: string;
}

/** A kind-specific item repricer (§9; exported for §10 adoption). */
export type ItemRepricer = (
  item: RabItem,
  // Non-null by contract: `repriceProjectItem` returns early for null
  // catalog items (no AHSP linkage — skip rule 3) and only calls the
  // repricer with a narrowed non-null item (§9 gate fix 2026-11-16:
  // the `| null` here produced 19 phantom TS18047 errors).
  catalogItem: NationalAHSPItem,
) => ItemRepriceOutcome;

/** Is this RabItem priced on the published DHSP (HSP) basis? Mirrors `isHspPricedItem` (unmarked = DIRECT). */
function isHspBasisItem(item: RabItem): boolean {
  return (item as { priceCostBasis?: string }).priceCostBasis === 'HSP';
}

/**
 * Reprice ONE project item under a change, applying the skip rules in
 * order (each with its reason — the preview never silently skips):
 *
 * 1. PRICE_MANUAL / PRICE_ESTIMATED — user-set prices never move.
 * 2. HSP/DHSP basis — the published schedule price; neither change kind
 *    republishes SE DJBK, so the price is unchanged by rule.
 * 3. No AHSP linkage (no catalog item, no snapshot) — a manual item.
 * 4. Otherwise the kind-specific repricer decides (affected / unchanged /
 *    uncomputable).
 *
 * Returns the repriced RabItem (a NEW object — the input is never
 * mutated) plus the item impact record. `catalogItem` is the item's
 * AHSP item in the OLD state (catalog match by code, else the frozen
 * snapshot as an item-like, else null).
 *
 * Exported for §10: adoption builds the new version's items by replaying
 * this EXACT function over the project's items with the preview's
 * repricer — the adopted items are the preview's items, by construction.
 */
export function repriceProjectItem(
  item: RabItem,
  catalogItem: NationalAHSPItem | null,
  repricer: ItemRepricer,
): { newItem: RabItem; impact: ProjectItemImpact } {
  const base: Omit<ProjectItemImpact, 'status' | 'reason' | 'newUnitPrice' | 'newAmount' | 'deltaAmount'> = {
    rabItemId: item.id,
    code: item.code,
    description: item.description,
    ahspCode: rabItemAhspCode(item) || null,
    volume: item.volume,
    unit: item.unit,
    oldUnitPrice: item.unitPrice ?? null,
    oldAmount: item.amount ?? null,
  };
  const skipped = (reason: string): { newItem: RabItem; impact: ProjectItemImpact } => ({
    newItem: item,
    impact: {
      ...base,
      newUnitPrice: item.unitPrice ?? null,
      newAmount: item.amount ?? null,
      deltaAmount: 0,
      status: 'SKIPPED',
      reason,
    },
  });
  if (item.priceStatus === 'PRICE_MANUAL') {
    return skipped('Manual price (PRICE_MANUAL) — user-set, never repriced by a master/AHSP change');
  }
  if (item.priceStatus === 'PRICE_ESTIMATED') {
    return skipped('Assumption price (PRICE_ESTIMATED) — user-approved assumption, never repriced by a master/AHSP change');
  }
  if (isHspBasisItem(item)) {
    return skipped('HSP/DHSP basis — price comes from the published DHSP schedule, which this change does not republish');
  }
  if (catalogItem === null) {
    return skipped('No AHSP linkage — manual item, unaffected by AHSP/master price changes');
  }
  const outcome = repricer(item, catalogItem);
  if (!outcome.computable) {
    return {
      newItem: item,
      impact: {
        ...base,
        newUnitPrice: null,
        newAmount: null,
        deltaAmount: null,
        status: 'UNCOMPUTABLE',
        reason: outcome.reason,
      },
    };
  }
  if (!outcome.affected) {
    return {
      newItem: item,
      impact: {
        ...base,
        newUnitPrice: item.unitPrice ?? null,
        newAmount: item.amount ?? null,
        deltaAmount: 0,
        status: 'UNCHANGED',
        reason: outcome.reason,
      },
    };
  }
  const newUnitPrice = outcome.newUnitPrice;
  const wasPriced = item.unitPrice !== null && item.unitPrice !== undefined && item.priceStatus !== 'PRICE_UNRESOLVED';
  if (newUnitPrice === null) {
    // The item LOSES its price under the change: it drops out of the
    // totals (PRICE_UNRESOLVED), exactly as recalculateCostSummary
    // treats an unpriced item. Delta = -(its old CONTRIBUTION) — an
    // item that was already PRICE_UNRESOLVED contributed 0 to the old
    // total, so its loss moves the total by 0 (not by -old amount).
    const newItem: RabItem = {
      ...item,
      unitPrice: null,
      amount: null,
      priceStatus: 'PRICE_UNRESOLVED',
      isPartial: true,
    };
    return {
      newItem,
      impact: {
        ...base,
        newUnitPrice: null,
        newAmount: null,
        deltaAmount:
          wasPriced && item.amount != null ? SafeDecimalEngine.safeSubtract(0, item.amount) : 0,
        status: 'BECAME_UNPRICED',
        reason: outcome.reason,
        missingComponentsNew: outcome.newMissingCount,
      },
    };
  }
  const newAmount = itemAmount(item.volume, newUnitPrice);
  const newItem: RabItem = {
    ...item,
    unitPrice: newUnitPrice,
    amount: newAmount,
    priceStatus:
      item.priceStatus === 'PRICE_UNRESOLVED' ? 'PRICE_RESOLVED' : item.priceStatus,
    isPartial: outcome.newMissingCount !== null && outcome.newMissingCount > 0,
    ...(outcome.newCategorySubtotals
      ? {
          materialPrice: outcome.newCategorySubtotals.material,
          laborPrice: outcome.newCategorySubtotals.labor,
          equipmentPrice: outcome.newCategorySubtotals.equipment,
        }
      : {}),
  };
  const oldContribution = wasPriced ? item.amount ?? 0 : 0;
  return {
    newItem,
    impact: {
      ...base,
      newUnitPrice,
      newAmount,
      deltaAmount: SafeDecimalEngine.safeSubtract(newAmount ?? 0, oldContribution),
      status: wasPriced ? 'REPRICED' : 'NEWLY_PRICED',
      reason: outcome.reason,
      missingComponentsNew: outcome.newMissingCount,
    },
  };
}

/**
 * Resolve a project's effective pricing mode. Absent mode (legacy
 * project, §10 not yet recording modes) reads as SNAPSHOT_PRICE
 * (Decision D — §8 `resolveProjectAhspVersion` semantics). An
 * explicitly invalid mode string fails closed (throw — a corrupt mode
 * must never be silently treated as live).
 */
export function resolveProjectPricingMode(
  input: Pick<ProjectImpactInput, 'pricingMode'>,
): { mode: ProjectPricingMode; source: 'RECORDED' | 'DEFAULT_SNAPSHOT' } {
  const mode = input.pricingMode ?? null;
  if (mode === null) return { mode: 'SNAPSHOT_PRICE', source: 'DEFAULT_SNAPSHOT' };
  if (mode === 'LIVE_MASTER_PRICE' || mode === 'SNAPSHOT_PRICE' || mode === 'PROJECT_OVERRIDE') {
    return { mode, source: 'RECORDED' };
  }
  throw new Error(
    `Unknown project pricing mode ${JSON.stringify(mode)} — refusing to guess (fail-closed, Decision D)`,
  );
}

/**
 * Build the override price map + resolver context from a project's
 * recorded overrides (the `ezrab_prod_price_overrides` store shape).
 * Only ACTIVE overrides (`isOverridden`) enter the map; an inactive
 * override never prices a component.
 *
 * Exported for §10 (e): OVERRIDE resolution reuses this exact mapping
 * (plus the `ProjectPriceEngine` store — see `projectPriceModes.ts`).
 */
export function buildProjectOverrideRef(
  overrides: readonly ProjectPriceOverride[] | undefined,
  projectId: string,
): { context: ProjectPricingContext; overridePrices: ReadonlyMap<string, number> } {
  const active = (overrides ?? []).filter((o) => o.isOverridden);
  const ref: ComponentPriceMapRef = buildComponentPriceRef(
    active.map((o) => ({
      code: o.resourceCode,
      name: o.resourceName,
      unit: o.unit,
      unitPrice: o.projectPrice,
    })),
    { label: `project-overrides:${projectId}` },
  );
  return {
    context: { pricingMode: 'PROJECT_OVERRIDE', overrideRef: ref },
    overridePrices: new Map(Object.entries(ref.pricesByComponentKey)),
  };
}

/** Build the resolver pricing context + override price map for one project. */
function projectPricingContext(
  project: ProjectImpactInput,
  mode: ProjectPricingMode,
): { context: ProjectPricingContext | null; overridePrices: ReadonlyMap<string, number> } {
  if (mode !== 'PROJECT_OVERRIDE') return { context: null, overridePrices: new Map() };
  return buildProjectOverrideRef(project.overrides, project.projectId);
}

/**
 * Compute one project's impact under a change: reprice every item, then
 * total old vs new through `recalculateCostSummary` (the canonical
 * engine — this module never totals a project itself). SNAPSHOT projects
 * are locked (delta 0) and additionally get an `adoptionPreview` (the
 * would-be delta under LIVE repricing — §10.2 data, excluded from
 * aggregates). A project with ANY uncomputable item is NOT_COMPUTABLE
 * (its totals are null — never a partial sum).
 *
 * `resolveCatalogItem` maps a RabItem to its OLD-state AHSP item (or
 * null); `repricer` is the kind-specific repricer (it receives the
 * OLD-state catalog item).
 */
function computeProjectImpact(
  project: ProjectImpactInput,
  resolveCatalogItem: (item: RabItem) => NationalAHSPItem | null,
  repricer: ItemRepricer,
): ProjectImpact {
  const { mode, source } = resolveProjectPricingMode(project);
  const oldSummary = recalculateCostSummary([...project.items], project.costSummary);
  const base: Omit<
    ProjectImpact,
    'status' | 'newGrandTotal' | 'newDirectCost' | 'deltaGrandTotal' | 'deltaDirectCost' | 'items' | 'adoptionPreview' | 'uncomputableReasons' | 'repricedItemCount' | 'unchangedItemCount' | 'skippedItemCount' | 'uncomputableItemCount'
  > = {
    projectId: project.projectId,
    projectName: project.projectName,
    isDemo: project.isDemo === true,
    pricingMode: mode,
    pricingModeSource: source,
    pinnedAhspDatabaseVersion: project.pinnedAhspDatabaseVersion ?? null,
    oldGrandTotal: oldSummary.grandTotal,
    oldDirectCost: oldSummary.directCost,
    totalItemCount: project.items.length,
  };

  /** Run the repricer over every item and total the result. */
  const runRepricing = (): {
    newItems: RabItem[];
    impacts: ProjectItemImpact[];
    uncomputableReasons: string[];
  } => {
    const newItems: RabItem[] = [];
    const impacts: ProjectItemImpact[] = [];
    const uncomputableReasons: string[] = [];
    for (const item of project.items) {
      const catalogItem = resolveCatalogItem(item);
      const { newItem, impact } = repriceProjectItem(item, catalogItem, repricer);
      newItems.push(newItem);
      if (impact.status !== 'UNCHANGED') impacts.push(impact);
      if (impact.status === 'UNCOMPUTABLE') {
        uncomputableReasons.push(`${impact.code || impact.rabItemId}: ${impact.reason}`);
      }
    }
    return { newItems, impacts, uncomputableReasons };
  };

  const countBy = (impacts: ProjectItemImpact[], status: ProjectItemImpactStatus): number =>
    impacts.filter((i) => i.status === status).length;

  if (mode === 'SNAPSHOT_PRICE') {
    // Locked: the stored totals stand (delta 0). The adoption preview
    // runs the SAME repricing as a LIVE project would, so §10.2 can
    // show old-vs-new when the owner explicitly adopts.
    const adoption = runRepricing();
    const adoptionUncomputable = adoption.uncomputableReasons.length > 0;
    const adoptionAffectedCount = adoption.impacts.filter(
      (i) => i.status === 'REPRICED' || i.status === 'NEWLY_PRICED' || i.status === 'BECAME_UNPRICED',
    ).length;
    let adoptionPreview: ProjectImpact['adoptionPreview'];
    if (adoptionUncomputable) {
      adoptionPreview = {
        newGrandTotal: null,
        deltaGrandTotal: null,
        affectedItemCount: adoptionAffectedCount,
        uncomputableItemCount: countBy(adoption.impacts, 'UNCOMPUTABLE'),
        uncomputableReasons: [...adoption.uncomputableReasons],
      };
    } else {
      const newSummary = recalculateCostSummary(adoption.newItems, project.costSummary);
      adoptionPreview = {
        newGrandTotal: newSummary.grandTotal,
        deltaGrandTotal: SafeDecimalEngine.safeSubtract(newSummary.grandTotal, oldSummary.grandTotal),
        affectedItemCount: adoptionAffectedCount,
        uncomputableItemCount: 0,
        uncomputableReasons: [],
      };
    }
    return {
      ...base,
      status: 'LOCKED_SNAPSHOT',
      newGrandTotal: oldSummary.grandTotal,
      newDirectCost: oldSummary.directCost,
      deltaGrandTotal: 0,
      deltaDirectCost: 0,
      repricedItemCount: 0,
      // `items` stays EMPTY for a locked project: nothing changed here.
      // The would-be changes live in `adoptionPreview` (counts +
      // reasons), never mixed into this project's applied items.
      unchangedItemCount: project.items.length - adoption.impacts.length,
      skippedItemCount: countBy(adoption.impacts, 'SKIPPED'),
      uncomputableItemCount: 0,
      items: [],
      adoptionPreview,
      uncomputableReasons: [],
    };
  }

  const run = runRepricing();
  const uncomputable = run.uncomputableReasons.length > 0;
  const repricedCount =
    countBy(run.impacts, 'REPRICED') + countBy(run.impacts, 'NEWLY_PRICED') + countBy(run.impacts, 'BECAME_UNPRICED');
  if (uncomputable) {
    return {
      ...base,
      status: 'NOT_COMPUTABLE',
      newGrandTotal: null,
      newDirectCost: null,
      deltaGrandTotal: null,
      deltaDirectCost: null,
      repricedItemCount: repricedCount,
      unchangedItemCount: project.items.length - run.impacts.length,
      skippedItemCount: countBy(run.impacts, 'SKIPPED'),
      uncomputableItemCount: countBy(run.impacts, 'UNCOMPUTABLE'),
      items: run.impacts,
      adoptionPreview: null,
      uncomputableReasons: run.uncomputableReasons,
    };
  }
  const newSummary = recalculateCostSummary(run.newItems, project.costSummary);
  const deltaGrandTotal = SafeDecimalEngine.safeSubtract(newSummary.grandTotal, oldSummary.grandTotal);
  const deltaDirectCost = SafeDecimalEngine.safeSubtract(newSummary.directCost, oldSummary.directCost);
  return {
    ...base,
    status: repricedCount > 0 ? 'AFFECTED' : 'UNAFFECTED',
    newGrandTotal: newSummary.grandTotal,
    newDirectCost: newSummary.directCost,
    deltaGrandTotal,
    deltaDirectCost,
    repricedItemCount: repricedCount,
    unchangedItemCount: project.items.length - run.impacts.length,
    skippedItemCount: countBy(run.impacts, 'SKIPPED'),
    uncomputableItemCount: 0,
    items: run.impacts,
    adoptionPreview: null,
    uncomputableReasons: [],
  };
}

// ---------------------------------------------------------------------------
// Kind-specific repricer builders (§9 (b)(3); exported for §10 adoption)
// ---------------------------------------------------------------------------

/**
 * Build the master-price-change repricer for ONE project.
 *
 * This builder is the SINGLE home of the per-project repricer:
 * `computeMasterPriceImpact` calls it, and §10 adoption calls it with
 * the same inputs — so the adopted items are the preview's items, by
 * construction (no second repricing implementation may drift from it).
 *
 * SNAPSHOT projects adopt under LIVE semantics (no overrides); LIVE
 * projects use no context; OVERRIDE projects use their override map.
 */
export function buildMasterPriceItemRepricer(input: {
  /** Catalog item ids with at least one changed component (from the resource→component index). */
  affectedItemIds: ReadonlySet<string>;
  /** Resource key → new effective price (binding changes only; no-ops excluded). */
  changedPrices: ReadonlyMap<string, number>;
  project: ProjectImpactInput;
  /**
   * §14 need #11 — store-backed baseline prices per changed key
   * (see `repriceItemForMasterPriceChange`). When present, the OLD
   * totals the deltas are measured against come from the store
   * baseline, not the live resolver.
   */
  baselinePrices?: ReadonlyMap<string, number | null>;
}): ItemRepricer {
  const { affectedItemIds, changedPrices, project } = input;
  const { mode } = resolveProjectPricingMode(project);
  const { context, overridePrices } =
    mode === 'PROJECT_OVERRIDE' ? projectPricingContext(project, mode) : { context: null, overridePrices: new Map<string, number>() };
  const cache = new Map<string, { oldTotal: number | null; newTotal: number | null; newMissingCount: number | null; newCategorySubtotals: { labor: number; material: number; equipment: number } | null }>();
  const repricer: ItemRepricer = (rabItem, catalogItem) => {
    const isSnapshotItem = catalogItem.id.startsWith('snapshot:');
    if (!isSnapshotItem && !affectedItemIds.has(catalogItem.id)) {
      return {
        newUnitPrice: null,
        newCategorySubtotals: null,
        newMissingCount: null,
        computable: true,
        affected: false,
        reason: 'No changed component in this AHSP item',
      };
    }
    let cached = cache.get(catalogItem.id);
    if (!cached) {
      const reprice = repriceItemForMasterPriceChange(
        catalogItem,
        context,
        changedPrices,
        overridePrices,
        input.baselinePrices,
      );
      cached = {
        oldTotal: reprice.oldUnitPrice,
        newTotal: reprice.newUnitPrice,
        newMissingCount: reprice.newMissingCount,
        newCategorySubtotals: reprice.newCategorySubtotals,
      };
      cache.set(catalogItem.id, cached);
    }
    const storedPriced = rabItem.unitPrice !== null && rabItem.unitPrice !== undefined && rabItem.priceStatus !== 'PRICE_UNRESOLVED';
    return applyCompositionDeltaToStored({
      storedUnitPrice: rabItem.unitPrice ?? null,
      storedPriced,
      oldTotal: cached.oldTotal,
      newTotal: cached.newTotal,
      newMissingCount: cached.newMissingCount,
      newCategorySubtotals: cached.newCategorySubtotals,
      reason: `Master price change on ${catalogItem.code}`,
    });
  };
  return repricer;
}

/**
 * Build the AHSP-version-change repricer for ONE project.
 *
 * This builder is the SINGLE home of the per-project repricer:
 * `computeAhspVersionImpact` calls it, and §10 adoption calls it with
 * the same inputs — so the adopted items are the preview's items, by
 * construction (no second repricing implementation may drift from it).
 */
export function buildAhspVersionItemRepricer(input: {
  /** Lookup maps over the TARGET version's items. */
  targetMaps: CatalogMaps;
  /** The §8 diff describing source → target. */
  diff: AHSPVersionDiff;
  sourceVersionId: string;
  targetVersionId: string;
  project: ProjectImpactInput;
}): ItemRepricer {
  const { targetMaps, diff, sourceVersionId, targetVersionId, project } = input;
  const revisedIds = new Set(diff.fieldDiffs.map((f) => f.id));
  const { mode } = resolveProjectPricingMode(project);
  const { context } =
    mode === 'PROJECT_OVERRIDE' ? projectPricingContext(project, mode) : { context: null };
  const cache = new Map<string, { oldTotal: number | null; newTotal: number | null; newMissingCount: number | null; newCategorySubtotals: { labor: number; material: number; equipment: number } | null; removed: boolean }>();
  const repricer: ItemRepricer = (rabItem, catalogItem) => {
    // A snapshot-only item (no entry in the versioned catalog — a
    // custom item) is NOT repriced by a version change: the version
    // does not contain it, so there is no "new version" of it to
    // price from. (Master price changes DO reprice snapshot items —
    // their components still resolve from master — but a version
    // change is a catalog change, and this item is not in the catalog.)
    if (catalogItem.id.startsWith('snapshot:')) {
      return {
        newUnitPrice: null,
        newCategorySubtotals: null,
        newMissingCount: null,
        computable: true,
        affected: false,
        reason: `Custom item ${catalogItem.code} — not in the versioned AHSP catalog, so the version change does not reprice it`,
      };
    }
    // Unchanged in the diff (same id, no field changes) → no resolver
    // calls at all: the new version prices this item identically.
    if (!revisedIds.has(catalogItem.id)) {
      const stillThere = targetMaps.byId.get(catalogItem.id) ?? findCatalogItemForCode(targetMaps, catalogItem.code);
      if (stillThere) {
        return {
          newUnitPrice: null,
          newCategorySubtotals: null,
          newMissingCount: null,
          computable: true,
          affected: false,
          reason: `AHSP item ${catalogItem.code} unchanged in ${targetVersionId}`,
        };
      }
      // Not revised AND not in the target: removed — but a removed
      // item's RabItem cannot reprice (see below).
    }
    let cached = cache.get(catalogItem.id);
    if (!cached) {
      // New item by stable id first, then by code (a recreated item
      // keeps its code but not its id — the project links by code).
      const newItem =
        targetMaps.byId.get(catalogItem.id) ?? findCatalogItemForCode(targetMaps, catalogItem.code) ?? null;
      if (!newItem) {
        cached = { oldTotal: null, newTotal: null, newMissingCount: null, newCategorySubtotals: null, removed: true };
      } else {
        const oldComp = resolveCompositionUncached(catalogItem, context);
        const newComp = resolveCompositionUncached(newItem, context);
        cached = {
          oldTotal: oldComp.unitPrice,
          newTotal: newComp.unitPrice,
          newMissingCount: newComp.missingComponents,
          newCategorySubtotals: {
            labor: newComp.labor.subtotalPerUnit,
            material: newComp.material.subtotalPerUnit,
            equipment: newComp.equipment.subtotalPerUnit,
          },
          removed: false,
        };
      }
      cache.set(catalogItem.id, cached);
    }
    if (cached.removed) {
      return {
        newUnitPrice: null,
        newCategorySubtotals: null,
        newMissingCount: null,
        computable: false,
        affected: false,
        reason: `AHSP item ${catalogItem.code} is REMOVED in ${targetVersionId} — no new price exists for it`,
      };
    }
    const storedPriced = rabItem.unitPrice !== null && rabItem.unitPrice !== undefined && rabItem.priceStatus !== 'PRICE_UNRESOLVED';
    return applyCompositionDeltaToStored({
      storedUnitPrice: rabItem.unitPrice ?? null,
      storedPriced,
      oldTotal: cached.oldTotal,
      newTotal: cached.newTotal,
      newMissingCount: cached.newMissingCount,
      newCategorySubtotals: cached.newCategorySubtotals,
      reason: `AHSP version ${sourceVersionId} → ${targetVersionId} on ${catalogItem.code}`,
    });
  };
  return repricer;
}

// ---------------------------------------------------------------------------
// Fingerprint (§9 (d)) + catalog checksum mirror
// ---------------------------------------------------------------------------

/**
 * Content checksum of an item array — a deliberate mirror of §8's
 * `computeAhspContentChecksum` (same canonicalization: items sorted by
 * stable id, keys deep-sorted; same FNV-1a 64-bit). Mirrored (not
 * imported) because importing ahspVersioning at runtime would close an
 * import cycle (ahspVersioning imports this module for the default
 * provider). Equality with §8's checksum is pinned by a test on the
 * real catalog.
 */
export function computeCatalogChecksum(items: readonly NationalAHSPItem[]): string {
  const sorted = [...items].sort((a, b) => {
    const ka = itemIdentityKeyLocal(a);
    const kb = itemIdentityKeyLocal(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
  return fnv1aHex(JSON.stringify(sorted.map((item) => sortKeysDeep(item))));
}

/** Stable item identity (mirror of §8 `itemIdentityKey`): id, else code+name+unit. */
function itemIdentityKeyLocal(item: NationalAHSPItem): string {
  if (typeof item.id === 'string' && item.id !== '') return item.id;
  return `code:${item.code ?? ''}|name:${item.name ?? ''}|unit:${item.unit ?? ''}`;
}

/**
 * Hash of the project inputs a preview was computed over. Covers
 * everything the project impact depends on: ids, modes, pins, items
 * (id/code/volume/unit/price/amount/status/basis), cost config, and
 * overrides. Sorted by project id (input order cannot change it).
 * Returns '' when the projects were not supplied at all (unknown —
 * the validator skips the check and says so).
 */
export function computeProjectsFingerprint(projects: readonly ProjectImpactInput[] | null | undefined): string {
  if (!projects) return '';
  const canonical = [...projects]
    .map((p) => ({
      projectId: p.projectId,
      pricingMode: p.pricingMode ?? null,
      pinnedAhspDatabaseVersion: p.pinnedAhspDatabaseVersion ?? null,
      pinnedMasterPriceVersion: p.pinnedMasterPriceVersion ?? null,
      costSummary: p.costSummary ?? {},
      items: [...(p.items ?? [])]
        .map((i) => ({
          id: i.id,
          code: i.code,
          ahspCode: i.ahspCode ?? null,
          volume: i.volume,
          unit: i.unit,
          unitPrice: i.unitPrice ?? null,
          amount: i.amount ?? null,
          priceStatus: i.priceStatus ?? null,
          priceCostBasis: (i as { priceCostBasis?: string }).priceCostBasis ?? null,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      overrides: [...(p.overrides ?? [])]
        .map((o) => ({
          id: o.id,
          resourceCode: o.resourceCode,
          unit: o.unit,
          projectPrice: o.projectPrice,
          isOverridden: o.isOverridden,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    }))
    .sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
  return fnv1aHex(canonicalJson(canonical));
}

function fingerprintHashOf(fp: Omit<ImpactPreviewFingerprint, 'fingerprintHash' | 'computedAt'>): string {
  return fnv1aHex(canonicalJson(fp));
}

/**
 * MASTER PRICING §13 — exported for the sync engine's rollback path:
 * the inverse preview of a price change (see
 * `invertMasterPriceImpactPreview` in
 * src/engine/pricing/sync/syncEngine.ts) needs a FRESH fingerprint
 * over the rollback-time state (post-change baselines), so the
 * fingerprint builder is a public seam. Pure; no behavior change.
 */
export function buildFingerprint(input: {
  kind: ImpactPreviewKind;
  family: AhspFamily | null;
  sourceVersionId: string | null;
  targetVersionId: string | null;
  baseContentChecksum: string | null;
  newContentChecksum: string | null;
  activeVersionIdAtCompute: string | null;
  masterPriceVersion: string;
  changedResourceBaseline: ReadonlyArray<{ key: string; oldPrice: number | null }>;
  projectsFingerprint: string;
  computedAt: string;
}): ImpactPreviewFingerprint {
  const withoutHash: Omit<ImpactPreviewFingerprint, 'fingerprintHash' | 'computedAt'> = {
    kind: input.kind,
    family: input.family,
    sourceVersionId: input.sourceVersionId,
    targetVersionId: input.targetVersionId,
    baseContentChecksum: input.baseContentChecksum,
    newContentChecksum: input.newContentChecksum,
    activeVersionIdAtCompute: input.activeVersionIdAtCompute,
    masterPriceVersion: input.masterPriceVersion,
    changedResourceBaseline: [...input.changedResourceBaseline].sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    ),
    projectsFingerprint: input.projectsFingerprint,
  };
  return {
    ...withoutHash,
    fingerprintHash: fingerprintHashOf(withoutHash),
    computedAt: input.computedAt,
  };
}

// ---------------------------------------------------------------------------
// NOT_COMPUTED builder (never a fake COMPUTED — §9 (f))
// ---------------------------------------------------------------------------

function emptySections(): Pick<
  MasterPriceImpactPreview,
  'items' | 'components' | 'projects' | 'aggregates' | 'affectedAhspReferences' | 'affectedLivePriceProjects'
> {
  return {
    items: {
      summary: { added: 0, removed: 0, revised: 0, priceChanged: 0, totalAffected: 0, uncomputable: 0 },
      changed: [],
    },
    components: {
      summary: { affectedReferenceCount: 0, byFamily: [], codelessComponentCount: 0 },
      affected: [],
    },
    projects: {
      summary: {
        totalProjectCount: 0,
        liveProjectCount: 0,
        snapshotProjectCount: 0,
        overrideProjectCount: 0,
        demoProjectCount: 0,
        affectedProjectCount: 0,
        lockedSnapshotCount: 0,
        notComputableProjectCount: 0,
      },
      projects: [],
    },
    aggregates: {
      totalDeltaGrandTotal: null,
      totalDeltaDirectCost: null,
      newlyPricedItemCount: 0,
      becameUnpricedItemCount: 0,
      uncomputableProjectCount: 0,
    },
    affectedAhspReferences: [],
    affectedLivePriceProjects: [],
  };
}

function notComputedPreview(
  kind: ImpactPreviewKind,
  reasons: string[],
  partial: {
    family?: AhspFamily | null;
    sourceVersionId?: string | null;
    targetVersionId?: string | null;
    baseContentChecksum?: string | null;
    newContentChecksum?: string | null;
    activeVersionIdAtCompute?: string | null;
    masterPriceVersion?: string;
    priceChanges?: ReadonlyArray<MasterPriceChangeInput>;
    projects?: readonly ProjectImpactInput[] | null;
    computedAt?: string;
  },
): MasterPriceImpactPreview {
  const computedAt = partial.computedAt ?? new Date().toISOString();
  return {
    status: 'NOT_COMPUTED',
    kind,
    computedAt,
    note:
      `Impact NOT computed — no number in this preview is usable. Reasons: ${reasons.join('; ')}. ` +
      'This is NOT a claim of zero impact.',
    notComputedReasons: [...reasons],
    staleReasons: [],
    fingerprint: buildFingerprint({
      kind,
      family: partial.family ?? null,
      sourceVersionId: partial.sourceVersionId ?? null,
      targetVersionId: partial.targetVersionId ?? null,
      baseContentChecksum: partial.baseContentChecksum ?? null,
      newContentChecksum: partial.newContentChecksum ?? null,
      activeVersionIdAtCompute: partial.activeVersionIdAtCompute ?? null,
      masterPriceVersion: partial.masterPriceVersion ?? MASTER_PRICE_VERSION,
      changedResourceBaseline: [],
      projectsFingerprint: computeProjectsFingerprint(partial.projects ?? null),
      computedAt,
    }),
    change: {
      family: partial.family ?? null,
      sourceVersionId: partial.sourceVersionId ?? null,
      targetVersionId: partial.targetVersionId ?? null,
      priceChanges: partial.priceChanges ?? [],
      nonBindingChanges: [],
    },
    ...emptySections(),
  };
}

// ---------------------------------------------------------------------------
// Shared aggregation
// ---------------------------------------------------------------------------

function aggregateProjectImpacts(impacts: readonly ProjectImpact[]): {
  summary: MasterPriceImpactPreview['projects']['summary'];
  aggregates: MasterPriceImpactPreview['aggregates'];
  affectedLivePriceProjects: string[];
} {
  const summary = {
    totalProjectCount: impacts.length,
    liveProjectCount: impacts.filter((p) => p.pricingMode === 'LIVE_MASTER_PRICE').length,
    snapshotProjectCount: impacts.filter((p) => p.pricingMode === 'SNAPSHOT_PRICE').length,
    overrideProjectCount: impacts.filter((p) => p.pricingMode === 'PROJECT_OVERRIDE').length,
    demoProjectCount: impacts.filter((p) => p.isDemo).length,
    affectedProjectCount: impacts.filter((p) => p.status === 'AFFECTED').length,
    lockedSnapshotCount: impacts.filter((p) => p.status === 'LOCKED_SNAPSHOT').length,
    notComputableProjectCount: impacts.filter((p) => p.status === 'NOT_COMPUTABLE').length,
  };
  // The aggregate total is null when ANY affected project is
  // NOT_COMPUTABLE — a partial sum presented as complete would be a
  // fabricated number.
  const anyNotComputable = summary.notComputableProjectCount > 0;
  let totalDeltaGrandTotal: number | null = 0;
  let totalDeltaDirectCost: number | null = 0;
  if (anyNotComputable) {
    totalDeltaGrandTotal = null;
    totalDeltaDirectCost = null;
  } else {
    for (const p of impacts) {
      if (p.status === 'AFFECTED') {
        totalDeltaGrandTotal = SafeDecimalEngine.safeAdd(totalDeltaGrandTotal, p.deltaGrandTotal ?? 0);
        totalDeltaDirectCost = SafeDecimalEngine.safeAdd(totalDeltaDirectCost, p.deltaDirectCost ?? 0);
      }
    }
  }
  let newlyPricedItemCount = 0;
  let becameUnpricedItemCount = 0;
  for (const p of impacts) {
    for (const it of p.items) {
      if (it.status === 'NEWLY_PRICED') newlyPricedItemCount++;
      if (it.status === 'BECAME_UNPRICED') becameUnpricedItemCount++;
    }
  }
  const affectedLivePriceProjects = impacts
    .filter((p) => p.status === 'AFFECTED')
    .map((p) => p.projectId)
    .sort();
  return {
    summary,
    aggregates: {
      totalDeltaGrandTotal,
      totalDeltaDirectCost,
      newlyPricedItemCount,
      becameUnpricedItemCount,
      uncomputableProjectCount: summary.notComputableProjectCount,
    },
    affectedLivePriceProjects,
  };
}

function familySummaries(
  itemImpacts: readonly AhspItemImpact[],
  componentRefs: readonly AffectedComponentRef[],
): FamilyImpactSummary[] {
  const families: AhspFamily[] = ['CIPTA_KARYA', 'BINA_MARGA', 'SUMBER_DAYA_AIR', 'SMKK'];
  return families
    .map((family) => ({
      family,
      affectedItemCount: itemImpacts.filter((i) => i.family === family).length,
      affectedComponentReferenceCount: componentRefs.filter((c) => c.family === family).length,
      addedItemCount: itemImpacts.filter((i) => i.family === family && i.changeKind === 'ADDED').length,
      removedItemCount: itemImpacts.filter((i) => i.family === family && i.changeKind === 'REMOVED').length,
      revisedItemCount: itemImpacts.filter((i) => i.family === family && i.changeKind === 'REVISED').length,
      priceChangedItemCount: itemImpacts.filter((i) => i.family === family && i.changeKind === 'PRICE_CHANGED').length,
    }))
    .filter((s) => s.affectedItemCount > 0 || s.affectedComponentReferenceCount > 0);
}

// ---------------------------------------------------------------------------
// Shared repricing rule: apply a composition delta to the STORED price
// ---------------------------------------------------------------------------

/**
 * The (a) rule (see module header): a project item moves by exactly the
 * composition delta of its AHSP item, applied to its STORED price —
 * the preview measures THIS change's impact, not a full reprice (a full
 * reprice would silently fold in staleness corrections of the stored
 * price). When the old composition is unpriced but the new one prices,
 * the new price IS the fresh composition (flagged in the reason).
 */
function applyCompositionDeltaToStored(input: {
  storedUnitPrice: number | null;
  storedPriced: boolean;
  oldTotal: number | null;
  newTotal: number | null;
  newMissingCount: number | null;
  newCategorySubtotals: { labor: number; material: number; equipment: number } | null;
  reason: string;
}): ItemRepriceOutcome {
  const { storedUnitPrice, storedPriced, oldTotal, newTotal } = input;
  if (oldTotal === null && newTotal === null) {
    return {
      newUnitPrice: null,
      newCategorySubtotals: null,
      newMissingCount: input.newMissingCount,
      computable: true,
      affected: false,
      reason: `${input.reason} — neither side prices this item, so the change does not move it`,
    };
  }
  if (oldTotal !== null && newTotal !== null && oldTotal === newTotal) {
    return {
      newUnitPrice: null,
      newCategorySubtotals: null,
      newMissingCount: input.newMissingCount,
      computable: true,
      affected: false,
      reason: `${input.reason} — price-identical (Rp${oldTotal.toLocaleString('id-ID')} on both sides)`,
    };
  }
  if (oldTotal === null && newTotal !== null) {
    return {
      newUnitPrice: newTotal,
      newCategorySubtotals: input.newCategorySubtotals,
      newMissingCount: input.newMissingCount,
      computable: true,
      affected: true,
      reason: `${input.reason} — old composition unpriced; new price is the fresh composition (Rp${newTotal.toLocaleString('id-ID')})`,
    };
  }
  if (oldTotal !== null && newTotal === null) {
    return {
      newUnitPrice: null,
      newCategorySubtotals: null,
      newMissingCount: input.newMissingCount,
      computable: true,
      affected: true,
      reason: `${input.reason} — new composition unpriced (was Rp${oldTotal.toLocaleString('id-ID')}); the item loses its price`,
    };
  }
  // Both priced and different.
  const delta = SafeDecimalEngine.safeSubtract(newTotal as number, oldTotal as number);
  if (!storedPriced) {
    return {
      newUnitPrice: newTotal,
      newCategorySubtotals: input.newCategorySubtotals,
      newMissingCount: input.newMissingCount,
      computable: true,
      affected: true,
      reason: `${input.reason} — item was unpriced; new price is the fresh composition (Rp${(newTotal as number).toLocaleString('id-ID')})`,
    };
  }
  const newUnitPrice = SafeDecimalEngine.safeAdd(storedUnitPrice as number, delta);
  if (newUnitPrice < 0) {
    return {
      newUnitPrice: null,
      newCategorySubtotals: null,
      newMissingCount: input.newMissingCount,
      computable: false,
      affected: false,
      reason:
        `${input.reason} — stored price (Rp${(storedUnitPrice as number).toLocaleString('id-ID')}) is inconsistent ` +
        `with the old composition (Rp${(oldTotal as number).toLocaleString('id-ID')}): applying the change delta ` +
        `would produce a negative price. Reprice this item manually.`,
    };
  }
  return {
    newUnitPrice,
    newCategorySubtotals: input.newCategorySubtotals,
    newMissingCount: input.newMissingCount,
    computable: true,
    affected: true,
    reason: `${input.reason} — composition moved Rp${(oldTotal as number).toLocaleString('id-ID')} → Rp${(newTotal as number).toLocaleString('id-ID')} (delta Rp${delta.toLocaleString('id-ID')}); applied to the stored price`,
  };
}

// ---------------------------------------------------------------------------
// Entry point 1: master price change (§9.1 — the Semen Portland example)
// ---------------------------------------------------------------------------

export function computeMasterPriceImpact(input: {
  priceChanges: readonly MasterPriceChangeInput[];
  catalogItems: readonly NationalAHSPItem[];
  projects: readonly ProjectImpactInput[];
  masterPriceVersion?: string;
  computedAt?: string;
  /**
   * MASTER PRICING §13 — store-backed baseline override (optional).
   * The §13.2 workflow verifies the baseline against ITS target (the
   * sync store), which may legitimately differ from the live
   * resolver's reading — e.g. a rollback, where the store already
   * holds the post-change price while the live resolver still reads
   * the pre-change master. When a key is present here, its value
   * REPLACES the resolver's resolved price for that key's baseline
   * check; binding (refused / refuseReason) still comes from the
   * real resolver. §14 need #11: the override ALSO threads into the
   * repricer — a changed component's OLD subtotal is recomputed from
   * the store price, so the reported delta is measured against the
   * store baseline (a chained change 110.000 → 120.000 shows +10.000
   * of movement, not +20.000 against the live 100.000). Absent an
   * override, behavior is exactly §9's. The caller owns verifying
   * the override against its target.
   */
  baselineOverride?: ReadonlyMap<string, number | null>;
}): MasterPriceImpactPreview {
  const kind: ImpactPreviewKind = 'MASTER_PRICE_CHANGE';
  const computedAt = input.computedAt ?? new Date().toISOString();
  const masterPriceVersion = input.masterPriceVersion ?? MASTER_PRICE_VERSION;
  const incomplete: string[] = [];
  if (!Array.isArray(input.priceChanges)) incomplete.push('priceChanges not supplied (must be an array, possibly empty)');
  if (!Array.isArray(input.catalogItems)) incomplete.push('catalogItems not supplied (the catalog the index is built over)');
  if (!Array.isArray(input.projects)) incomplete.push('projects not supplied — pass the collected workspace projects (possibly empty); an absent list is unknown, not zero');
  if (incomplete.length > 0) {
    return notComputedPreview(kind, incomplete, {
      masterPriceVersion,
      priceChanges: Array.isArray(input.priceChanges) ? input.priceChanges : [],
      projects: Array.isArray(input.projects) ? input.projects : null,
      computedAt,
    });
  }
  const priceChanges = input.priceChanges;
  const catalogItems = input.catalogItems;
  const projects = input.projects;

  // --- Validate the changes (shape + removals + duplicate keys). ---
  const invalid: string[] = [];
  const seenKeys = new Map<string, MasterPriceChangeInput>();
  for (const change of priceChanges) {
    if (!change || typeof change !== 'object') {
      invalid.push('a price change entry is not an object');
      continue;
    }
    if (!isNonEmptyString(change.resourceCode)) invalid.push('a price change has no resourceCode');
    if (!isNonEmptyString(change.unit)) invalid.push(`change ${String(change.resourceCode || '?')}: no unit`);
    if (!isValidPrice(change.oldPrice)) invalid.push(`change ${String(change.resourceCode || '?')}: oldPrice is invalid (must be null or a finite non-negative number)`);
    if (!isValidPrice(change.newPrice)) invalid.push(`change ${String(change.resourceCode || '?')}: newPrice is invalid (must be null or a finite non-negative number)`);
    if (change.newPrice === null) {
      invalid.push(
        `change ${String(change.resourceCode || '?')}@${String(change.unit || '?')}: price REMOVAL cannot be previewed — ` +
          'after removing the winning record the next-best record (or a direct CK/BM source) would win, and the preview ' +
          'cannot determine that fallback price without re-running selection. Stage the removal and re-run the preview.',
      );
    }
    if (isNonEmptyString(change.resourceCode) && isNonEmptyString(change.unit)) {
      const key = priceChangeKey(change);
      const prev = seenKeys.get(key);
      if (prev) {
        invalid.push(`duplicate change for resource key ${key} — one change per key (old ${String(prev.oldPrice)} → ${String(prev.newPrice)} vs old ${String(change.oldPrice)} → ${String(change.newPrice)})`);
      } else {
        seenKeys.set(key, change);
      }
    }
  }
  if (invalid.length > 0) {
    return notComputedPreview(kind, invalid, {
      masterPriceVersion,
      priceChanges,
      projects,
      computedAt,
    });
  }

  // --- Baseline verification (the effective-price model). ---
  const baselineProblems: string[] = [];
  const nonBindingChanges: Array<{ key: string; reason: string }> = [];
  const bindingChanges: MasterPriceChangeInput[] = [];
  const baselineByKey = new Map<string, BaselineCheck>();
  for (const change of priceChanges) {
    const check = verifyChangeBaseline(change);
    // MASTER PRICING §13 — store-backed baseline override (see the
    // input docs): replaces ONLY the resolved price; binding still
    // comes from the real resolver.
    const overridden = input.baselineOverride?.get(check.key);
    const effectiveCheck: BaselineCheck =
      overridden !== undefined ? { ...check, resolvedPrice: overridden } : check;
    baselineByKey.set(effectiveCheck.key, effectiveCheck);
    if (effectiveCheck.refused) {
      nonBindingChanges.push({
        key: effectiveCheck.key,
        reason: `Key refused by the resolver (§6 (i) underspecified): ${effectiveCheck.refuseReason} — a change to this key cannot move any resolved price`,
      });
      continue;
    }
    if (effectiveCheck.resolvedPrice !== change.oldPrice) {
      const baselineSource = overridden !== undefined ? 'the sync target' : 'the resolver';
      baselineProblems.push(
        `baseline mismatch for ${effectiveCheck.key}: the stated old price is ` +
          `${change.oldPrice === null ? 'unpriced (null)' : `Rp${change.oldPrice.toLocaleString('id-ID')}`} but ${baselineSource} ` +
          `currently resolves ${effectiveCheck.resolvedPrice === null ? 'unpriced (null)' : `Rp${effectiveCheck.resolvedPrice.toLocaleString('id-ID')}`} ` +
          `for this key — the premise is stale (another record wins this key, or the price moved since the preview was requested)`,
      );
      continue;
    }
    bindingChanges.push(change);
  }
  if (baselineProblems.length > 0) {
    return notComputedPreview(kind, baselineProblems, {
      masterPriceVersion,
      priceChanges,
      projects,
      computedAt,
    });
  }

  // Effective changes only (no-ops — old == new — move nothing; they stay
  // in the change list + fingerprint, but fan out to zero components).
  const changedPrices = new Map<string, number>();
  let noOpCount = 0;
  for (const change of bindingChanges) {
    if (change.oldPrice === change.newPrice) {
      noOpCount++;
      continue;
    }
    changedPrices.set(priceChangeKey(change), change.newPrice as number);
  }

  // --- Fan-out over the resource→component index. ---
  const index = buildResourceComponentIndex(catalogItems);
  const catalogMaps = buildCatalogMaps(catalogItems);
  const affectedItemIds = new Set<string>();
  for (const key of changedPrices.keys()) {
    const refs = index.byKey.get(key);
    if (refs) for (const ref of refs) affectedItemIds.add(ref.itemId);
  }
  const affectedItems = [...affectedItemIds]
    .map((id) => catalogMaps.byId.get(id))
    .filter((item): item is NationalAHSPItem => item !== undefined)
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  // --- Per-item deltas (catalog level, LIVE context) + component refs. ---
  const itemImpacts: AhspItemImpact[] = [];
  const componentRefs: AffectedComponentRef[] = [];
  let uncomputableItemCount = 0;
  for (const item of affectedItems) {
    const reprice = repriceItemForMasterPriceChange(
      item,
      null,
      changedPrices,
      new Map(),
      input.baselineOverride,
    );
    const oldUnitPrice = reprice.oldUnitPrice;
    const newUnitPrice = reprice.newUnitPrice;
    const delta = priceDelta(oldUnitPrice, newUnitPrice);
    const uncomputableReason =
      delta === null
        ? oldUnitPrice === null
          ? 'OLD_UNPRICED — the item had no price before the change (a delta against "no price" is undefined)'
          : 'NEW_UNPRICED — the item has no price after the change'
        : null;
    if (uncomputableReason !== null) uncomputableItemCount++;
    const changedDetails = reprice.componentDetails.filter((d) => d.changed);
    itemImpacts.push({
      itemId: item.id,
      code: item.code,
      name: item.name,
      family: item.domain as AhspFamily,
      unit: item.unit,
      changeKind: 'PRICE_CHANGED',
      oldUnitPrice,
      newUnitPrice,
      delta,
      percentChange: percentChange(oldUnitPrice, delta),
      componentChangeCount: changedDetails.length,
      pricingStatusNew: reprice.newPricingStatus,
      missingComponentsNew: reprice.newMissingCount,
      uncomputableReason,
    });
    for (const detail of changedDetails) {
      const rawComps = item[detail.arrayKey] ?? [];
      const raw = rawComps[detail.index];
      if (!raw) continue;
      const type =
        detail.arrayKey === 'laborComponents'
          ? 'labor'
          : detail.arrayKey === 'materialComponents'
            ? 'material'
            : 'equipment';
      componentRefs.push({
        itemCode: item.code,
        itemName: item.name,
        family: item.domain as AhspFamily,
        componentType: type,
        code: String(raw.code || ''),
        name: String(raw.name || ''),
        unit: String(raw.unit || ''),
        coefficient: typeof raw.coefficient === 'number' && Number.isFinite(raw.coefficient) ? raw.coefficient : 0,
        resourceKey: detail.resourceKey,
        oldPrice: detail.oldPrice,
        newPrice: detail.newPrice,
        deltaPerUnit: SafeDecimalEngine.safeSubtract(detail.newSubtotal ?? 0, detail.oldSubtotal ?? 0),
        changeKind: 'PRICE_CHANGED',
      });
    }
  }
  componentRefs.sort((a, b) =>
    a.itemCode < b.itemCode ? -1 : a.itemCode > b.itemCode ? 1 : a.resourceKey < b.resourceKey ? -1 : a.resourceKey > b.resourceKey ? 1 : 0,
  );

  // --- Per-project impact. ---
  const resolveCatalogItem = (rabItem: RabItem): NationalAHSPItem | null =>
    resolveOldCatalogItem(catalogMaps, rabItem);
  const projectImpacts: ProjectImpact[] = [];
  for (const project of [...projects].sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0))) {
    const repricer = buildMasterPriceItemRepricer({
      affectedItemIds,
      changedPrices,
      project,
      baselinePrices: input.baselineOverride,
    });
    projectImpacts.push(computeProjectImpact(project, resolveCatalogItem, repricer));
  }
  const { summary: projectSummary, aggregates, affectedLivePriceProjects } = aggregateProjectImpacts(projectImpacts);

  const affectedAhspReferences = [...new Set(itemImpacts.map((i) => i.code))].sort();
  const noteParts = [
    `Master price change: ${bindingChanges.length} binding change(s)` +
      (nonBindingChanges.length > 0 ? `, ${nonBindingChanges.length} non-binding (refused key)` : '') +
      (noOpCount > 0 ? `, ${noOpCount} no-op(s) (old == new)` : '') +
      `.`,
    `${itemImpacts.length} AHSP item(s) affected across ${familySummaries(itemImpacts, componentRefs).length} famil(ies), ` +
      `${componentRefs.length} component reference(s).`,
    `${projectSummary.totalProjectCount} project(s) in the workspace: ` +
      `${projectSummary.liveProjectCount} LIVE, ${projectSummary.snapshotProjectCount} SNAPSHOT (locked), ` +
      `${projectSummary.overrideProjectCount} OVERRIDE; ${projectSummary.affectedProjectCount} affected` +
      (aggregates.totalDeltaGrandTotal !== null
        ? `, total RAB delta Rp${aggregates.totalDeltaGrandTotal.toLocaleString('id-ID')}`
        : ', total RAB delta NOT COMPUTABLE (an affected project is uncomputable)') +
      `.`,
  ];
  if (index.codelessComponentCount > 0) {
    noteParts.push(
      `${index.codelessComponentCount} catalog component(s) carry no code and cannot be attributed to a code-keyed price change (they resolve by name).`,
    );
  }
  return {
    status: 'COMPUTED',
    kind,
    computedAt,
    note: noteParts.join(' '),
    notComputedReasons: [],
    staleReasons: [],
    fingerprint: buildFingerprint({
      kind,
      family: null,
      sourceVersionId: null,
      targetVersionId: null,
      baseContentChecksum: computeCatalogChecksum(catalogItems),
      newContentChecksum: null,
      activeVersionIdAtCompute: null,
      masterPriceVersion,
      changedResourceBaseline: [...baselineByKey.values()]
        .filter((b) => !b.refused)
        .map((b) => ({ key: b.key, oldPrice: b.change.oldPrice })),
      projectsFingerprint: computeProjectsFingerprint(projects),
      computedAt,
    }),
    change: {
      family: null,
      sourceVersionId: null,
      targetVersionId: null,
      priceChanges,
      nonBindingChanges,
    },
    items: {
      summary: {
        added: 0,
        removed: 0,
        revised: 0,
        priceChanged: itemImpacts.length,
        totalAffected: itemImpacts.length,
        uncomputable: uncomputableItemCount,
      },
      changed: itemImpacts,
    },
    components: {
      summary: {
        affectedReferenceCount: componentRefs.length,
        byFamily: familySummaries(itemImpacts, componentRefs),
        codelessComponentCount: index.codelessComponentCount,
      },
      affected: componentRefs,
    },
    projects: { summary: projectSummary, projects: projectImpacts },
    aggregates,
    affectedAhspReferences,
    affectedLivePriceProjects,
  };
}

// ---------------------------------------------------------------------------
// Entry point 2: AHSP version change / rollback (§8 Mode A/B + §9 (e))
// ---------------------------------------------------------------------------

/** Baked contribution of one component: round(coef × price, 2), else the baked total, else null. */
function bakedContribution(comp: AHSPComponent): number | null {
  const coef = typeof comp.coefficient === 'number' && Number.isFinite(comp.coefficient) ? comp.coefficient : 0;
  if (typeof comp.unitPrice === 'number' && comp.unitPrice > 0) {
    return roundSubtotal(coef * comp.unitPrice);
  }
  if (typeof comp.total === 'number' && comp.total > 0) return comp.total;
  return null;
}

const COMPONENT_PATH_PATTERN = /^(laborComponents|materialComponents|equipmentComponents)\[(\d+)\](?:\.(.+))?$/;

/**
 * Component refs for a version change, from the §8 field diffs (grouped
 * per component — one ref per changed component, however many fields
 * changed on it) plus every component of added/removed items.
 */
function versionComponentRefs(
  diff: AHSPVersionDiff,
  sourceMaps: CatalogMaps,
  targetMaps: CatalogMaps,
  family: AhspFamily,
): AffectedComponentRef[] {
  const refs: AffectedComponentRef[] = [];
  const pushRef = (
    itemCode: string,
    itemName: string,
    type: 'labor' | 'material' | 'equipment',
    oldComp: AHSPComponent | null,
    newComp: AHSPComponent | null,
    changeKind: AffectedComponentRef['changeKind'],
  ): void => {
    const comp = newComp ?? oldComp;
    if (!comp) return;
    const oldContribution = oldComp ? bakedContribution(oldComp) : null;
    const newContribution = newComp ? bakedContribution(newComp) : null;
    refs.push({
      itemCode,
      itemName,
      family,
      componentType: type,
      code: String(comp.code || ''),
      name: String(comp.name || ''),
      unit: String(comp.unit || ''),
      coefficient:
        typeof comp.coefficient === 'number' && Number.isFinite(comp.coefficient) ? comp.coefficient : 0,
      resourceKey: componentLookupKey(comp, type, family),
      oldPrice: oldComp && typeof oldComp.unitPrice === 'number' ? oldComp.unitPrice : null,
      newPrice: newComp && typeof newComp.unitPrice === 'number' ? newComp.unitPrice : null,
      deltaPerUnit:
        oldContribution === null && newContribution === null
          ? null
          : SafeDecimalEngine.safeSubtract(newContribution ?? 0, oldContribution ?? 0),
      changeKind,
    });
  };
  // Revised items: group field changes per component (array + index).
  for (const fieldDiff of diff.fieldDiffs) {
    const sourceItem = sourceMaps.byId.get(fieldDiff.id);
    const targetItem = targetMaps.byId.get(fieldDiff.id);
    if (!sourceItem || !targetItem) continue;
    const changedComponents = new Map<string, { arrayKey: ComponentArrayKey; index: number; kind: 'ADDED' | 'REMOVED' | 'REVISED' }>();
    for (const change of fieldDiff.changes) {
      const m = COMPONENT_PATH_PATTERN.exec(change.path);
      if (!m) continue;
      const arrayKey = m[1] as ComponentArrayKey;
      const index = Number(m[2]);
      const mapKey = `${arrayKey}[${index}]`;
      if (changedComponents.has(mapKey)) continue;
      const kind =
        change.field === 'component' && change.oldValue === null
          ? 'ADDED'
          : change.field === 'component' && change.newValue === null
            ? 'REMOVED'
            : 'REVISED';
      changedComponents.set(mapKey, { arrayKey, index, kind });
    }
    for (const { arrayKey, index, kind } of [...changedComponents.values()].sort((a, b) =>
      a.arrayKey < b.arrayKey ? -1 : a.arrayKey > b.arrayKey ? 1 : a.index - b.index,
    )) {
      const type =
        arrayKey === 'laborComponents' ? 'labor' : arrayKey === 'materialComponents' ? 'material' : 'equipment';
      // NOTE on BM id-less components (§8 §3.2): the diff matches them
      // by position, so source index == target index for paired
      // components; added/removed indices are target/source-side
      // respectively. The field diff's path carries the SOURCE-side
      // index for pairs and removed, the TARGET-side index for added
      // (see diffItemPair). For ADDED the source side has no such
      // component; for REMOVED the target side has none.
      const oldComp = kind === 'ADDED' ? null : (sourceItem[arrayKey] ?? [])[index] ?? null;
      const newComp = kind === 'REMOVED' ? null : (targetItem[arrayKey] ?? [])[index] ?? null;
      pushRef(sourceItem.code, sourceItem.name, type, oldComp, newComp, kind);
    }
  }
  // Added items: every component is a new reference. Removed items: every component leaves.
  for (const item of diff.addedCodes) {
    for (const { key, type } of COMPONENT_ARRAY_KEYS) {
      for (const comp of item[key] ?? []) {
        pushRef(item.code, item.name, type, null, comp, 'ADDED');
      }
    }
  }
  for (const removed of diff.removedCodes) {
    const sourceItem = findCatalogItemForCode(sourceMaps, removed.code);
    if (!sourceItem) continue;
    for (const { key, type } of COMPONENT_ARRAY_KEYS) {
      for (const comp of sourceItem[key] ?? []) {
        pushRef(sourceItem.code, sourceItem.name, type, comp, null, 'REMOVED');
      }
    }
  }
  refs.sort((a, b) =>
    a.itemCode < b.itemCode ? -1 : a.itemCode > b.itemCode ? 1 : a.resourceKey < b.resourceKey ? -1 : a.resourceKey > b.resourceKey ? 1 : 0,
  );
  return refs;
}

export function computeAhspVersionImpact(input: {
  kind?: 'AHSP_VERSION_CHANGE' | 'ROLLBACK';
  family: AhspFamily;
  sourceVersionId: string;
  targetVersionId: string;
  sourceItems: readonly NationalAHSPItem[];
  targetItems: readonly NationalAHSPItem[];
  diff: AHSPVersionDiff;
  sourceContentChecksum: string;
  targetContentChecksum: string;
  activeVersionIdAtCompute?: string | null;
  masterPriceVersion?: string;
  projects: readonly ProjectImpactInput[];
  computedAt?: string;
}): MasterPriceImpactPreview {
  const kind: ImpactPreviewKind = input.kind ?? 'AHSP_VERSION_CHANGE';
  const computedAt = input.computedAt ?? new Date().toISOString();
  const masterPriceVersion = input.masterPriceVersion ?? MASTER_PRICE_VERSION;
  const incomplete: string[] = [];
  if (!input.family) incomplete.push('family not supplied');
  if (!isNonEmptyString(input.sourceVersionId)) incomplete.push('sourceVersionId not supplied');
  if (!isNonEmptyString(input.targetVersionId)) incomplete.push('targetVersionId not supplied');
  if (!Array.isArray(input.sourceItems)) incomplete.push('sourceItems not supplied (the base version content)');
  if (!Array.isArray(input.targetItems)) incomplete.push('targetItems not supplied (the proposed content)');
  if (!input.diff || typeof input.diff !== 'object') incomplete.push('diff not supplied (the §8 compareAhspSnapshots result)');
  if (!isNonEmptyString(input.sourceContentChecksum)) incomplete.push('sourceContentChecksum not supplied');
  if (!isNonEmptyString(input.targetContentChecksum)) incomplete.push('targetContentChecksum not supplied');
  if (!Array.isArray(input.projects)) incomplete.push('projects not supplied — pass the collected workspace projects (possibly empty); an absent list is unknown, not zero');
  if (incomplete.length > 0) {
    return notComputedPreview(kind, incomplete, {
      family: input.family ?? null,
      sourceVersionId: input.sourceVersionId ?? null,
      targetVersionId: input.targetVersionId ?? null,
      baseContentChecksum: input.sourceContentChecksum ?? null,
      newContentChecksum: input.targetContentChecksum ?? null,
      activeVersionIdAtCompute: input.activeVersionIdAtCompute ?? null,
      masterPriceVersion,
      projects: Array.isArray(input.projects) ? input.projects : null,
      computedAt,
    });
  }
  const { family, sourceVersionId, targetVersionId, sourceItems, targetItems, diff, projects } = input;

  // --- Integrity: the checksums must match the supplied content, and the
  //     diff must describe this exact pair (a mismatched diff or checksum
  //     means the caller mixed versions — computing on it would attribute
  //     the impact to the wrong change). ---
  const integrity: string[] = [];
  const actualSourceChecksum = computeCatalogChecksum(sourceItems);
  if (actualSourceChecksum !== input.sourceContentChecksum) {
    integrity.push(
      `source checksum mismatch: the stated base checksum is ${input.sourceContentChecksum} but the supplied source items hash to ${actualSourceChecksum} — the items do not match the stated base version`,
    );
  }
  const actualTargetChecksum = computeCatalogChecksum(targetItems);
  if (actualTargetChecksum !== input.targetContentChecksum) {
    integrity.push(
      `target checksum mismatch: the stated new-content checksum is ${input.targetContentChecksum} but the supplied target items hash to ${actualTargetChecksum} — the items do not match the stated new content`,
    );
  }
  if (diff.sourceVersion !== sourceVersionId || diff.targetVersion !== targetVersionId) {
    integrity.push(
      `diff describes ${diff.sourceVersion} → ${diff.targetVersion}, not the requested ${sourceVersionId} → ${targetVersionId}`,
    );
  }
  if (diff.domain !== family) {
    integrity.push(`diff domain is ${diff.domain}, not the requested family ${family}`);
  }
  if (integrity.length > 0) {
    return notComputedPreview(kind, integrity, {
      family,
      sourceVersionId,
      targetVersionId,
      baseContentChecksum: input.sourceContentChecksum,
      newContentChecksum: input.targetContentChecksum,
      activeVersionIdAtCompute: input.activeVersionIdAtCompute ?? null,
      masterPriceVersion,
      projects,
      computedAt,
    });
  }

  const sourceMaps = buildCatalogMaps(sourceItems);
  const targetMaps = buildCatalogMaps(targetItems);

  // --- Per-item deltas from the diff's baked unit prices (§9 (b)(1)). ---
  const itemImpacts: AhspItemImpact[] = [];
  let uncomputableItemCount = 0;
  const componentChangeCountById = new Map<string, number>();
  for (const fieldDiff of diff.fieldDiffs) {
    const components = new Set<string>();
    for (const change of fieldDiff.changes) {
      const m = COMPONENT_PATH_PATTERN.exec(change.path);
      if (m) components.add(`${m[1]}[${m[2]}]`);
    }
    componentChangeCountById.set(fieldDiff.id, components.size);
  }
  for (const item of diff.addedCodes) {
    const componentCount =
      (item.laborComponents?.length ?? 0) + (item.materialComponents?.length ?? 0) + (item.equipmentComponents?.length ?? 0);
    itemImpacts.push({
      itemId: item.id,
      code: item.code,
      name: item.name,
      family,
      unit: item.unit,
      changeKind: 'ADDED',
      oldUnitPrice: null,
      newUnitPrice: item.unitPrice ?? null,
      delta: null,
      percentChange: null,
      componentChangeCount: componentCount,
      uncomputableReason: null,
    });
  }
  for (const removed of diff.removedCodes) {
    const sourceItem = findCatalogItemForCode(sourceMaps, removed.code);
    const componentCount = sourceItem
      ? (sourceItem.laborComponents?.length ?? 0) + (sourceItem.materialComponents?.length ?? 0) + (sourceItem.equipmentComponents?.length ?? 0)
      : 0;
    itemImpacts.push({
      itemId: sourceItem?.id ?? `removed:${removed.code}`,
      code: removed.code,
      name: removed.name,
      family,
      unit: sourceItem?.unit ?? '',
      changeKind: 'REMOVED',
      oldUnitPrice: sourceItem?.unitPrice ?? null,
      newUnitPrice: null,
      delta: null,
      percentChange: null,
      componentChangeCount: componentCount,
      uncomputableReason: null,
    });
  }
  for (const revised of diff.revisedCodes) {
    const fieldDiff = diff.fieldDiffs.find((f) => f.code === revised.code);
    const sourceItem = fieldDiff ? sourceMaps.byId.get(fieldDiff.id) : undefined;
    const delta = priceDelta(revised.oldPrice, revised.newPrice);
    const uncomputableReason =
      delta === null
        ? revised.oldPrice === null
          ? 'OLD_UNPRICED — the old version carries no baked price for this item'
          : 'NEW_UNPRICED — the new version carries no baked price for this item'
        : null;
    if (uncomputableReason !== null) uncomputableItemCount++;
    itemImpacts.push({
      itemId: fieldDiff?.id ?? sourceItem?.id ?? `revised:${revised.code}`,
      code: revised.code,
      name: revised.name,
      family,
      unit: sourceItem?.unit ?? '',
      changeKind: 'REVISED',
      oldUnitPrice: revised.oldPrice,
      newUnitPrice: revised.newPrice,
      delta,
      percentChange: percentChange(revised.oldPrice, delta),
      componentChangeCount: fieldDiff ? componentChangeCountById.get(fieldDiff.id) ?? 0 : 0,
      uncomputableReason,
    });
  }
  itemImpacts.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const componentRefs = versionComponentRefs(diff, sourceMaps, targetMaps, family);

  // --- Per-project impact: reprice against the NEW version's items. ---
  const resolveCatalogItem = (rabItem: RabItem): NationalAHSPItem | null =>
    resolveOldCatalogItem(sourceMaps, rabItem);
  const projectImpacts: ProjectImpact[] = [];
  for (const project of [...projects].sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0))) {
    const repricer = buildAhspVersionItemRepricer({ targetMaps, diff, sourceVersionId, targetVersionId, project });
    projectImpacts.push(computeProjectImpact(project, resolveCatalogItem, repricer));
  }
  const { summary: projectSummary, aggregates, affectedLivePriceProjects } = aggregateProjectImpacts(projectImpacts);

  const affectedAhspReferences = [...new Set(itemImpacts.map((i) => i.code))].sort();
  const kindLabel = kind === 'ROLLBACK' ? 'Rollback' : 'AHSP version change';
  const noteParts = [
    `${kindLabel}: ${family} ${sourceVersionId} → ${targetVersionId}: ` +
      `${diff.summary.added} added, ${diff.summary.removed} removed, ${diff.summary.revised} revised ` +
      `(${diff.summary.unchanged} unchanged), ${componentRefs.length} component reference(s) affected.`,
    `${projectSummary.totalProjectCount} project(s) in the workspace: ` +
      `${projectSummary.liveProjectCount} LIVE, ${projectSummary.snapshotProjectCount} SNAPSHOT (locked), ` +
      `${projectSummary.overrideProjectCount} OVERRIDE; ${projectSummary.affectedProjectCount} affected` +
      (aggregates.totalDeltaGrandTotal !== null
        ? `, total RAB delta Rp${aggregates.totalDeltaGrandTotal.toLocaleString('id-ID')}`
        : ', total RAB delta NOT COMPUTABLE (an affected project is uncomputable)') +
      `.`,
  ];
  return {
    status: 'COMPUTED',
    kind,
    computedAt,
    note: noteParts.join(' '),
    notComputedReasons: [],
    staleReasons: [],
    fingerprint: buildFingerprint({
      kind,
      family,
      sourceVersionId,
      targetVersionId,
      baseContentChecksum: input.sourceContentChecksum,
      newContentChecksum: input.targetContentChecksum,
      activeVersionIdAtCompute: input.activeVersionIdAtCompute ?? null,
      masterPriceVersion,
      changedResourceBaseline: [],
      projectsFingerprint: computeProjectsFingerprint(projects),
      computedAt,
    }),
    change: {
      family,
      sourceVersionId,
      targetVersionId,
      priceChanges: [],
      nonBindingChanges: [],
    },
    items: {
      summary: {
        added: diff.summary.added,
        removed: diff.summary.removed,
        revised: diff.summary.revised,
        priceChanged: 0,
        totalAffected: itemImpacts.length,
        uncomputable: uncomputableItemCount,
      },
      changed: itemImpacts,
    },
    components: {
      summary: {
        affectedReferenceCount: componentRefs.length,
        byFamily: familySummaries(itemImpacts, componentRefs),
        codelessComponentCount: 0,
      },
      affected: componentRefs,
    },
    projects: { summary: projectSummary, projects: projectImpacts },
    aggregates,
    affectedAhspReferences,
    affectedLivePriceProjects,
  };
}

// ---------------------------------------------------------------------------
// Freshness validation (§9 (d)) — a stale preview is refused, never used
// ---------------------------------------------------------------------------

/** Current state to validate a preview against. Every field is optional: a check the caller cannot supply data for is SKIPPED (and named in `checksSkipped`), never failed and never silently passed. */
export interface CurrentImpactState {
  /** Current active pointer per family (from the §8 registry state). */
  activeVersions?: Readonly<Record<AhspFamily, string>>;
  /** `${family}|${versionId}` → content checksum (from the §8 registry state). */
  versionChecksums?: Readonly<Record<string, string>>;
  /** Current master price version label. */
  masterPriceVersion?: string;
  /** Checksum of the CURRENT catalog items (master-price kind — recompute with `computeCatalogChecksum`). */
  catalogChecksum?: string | null;
  /** Currently resolved effective price per changed resource key (master-price kind). */
  currentBaselinePrices?: ReadonlyMap<string, number | null>;
  /** Fingerprint of the CURRENT project inputs (`computeProjectsFingerprint`). */
  projectsFingerprint?: string;
}

export interface FreshnessValidation {
  fresh: boolean;
  /** Why the preview is stale (empty when fresh). */
  reasons: string[];
  /** Checks that could not run for lack of current-state data (named, not silent). */
  checksSkipped: string[];
}

export function validateImpactPreviewFreshness(
  preview: MasterPriceImpactPreview,
  current: CurrentImpactState,
): FreshnessValidation {
  const reasons: string[] = [];
  const checksSkipped: string[] = [];
  if (preview.status === 'NOT_COMPUTED') {
    return { fresh: false, reasons: ['preview was never computed'], checksSkipped };
  }
  if (preview.status === 'STALE') {
    return { fresh: false, reasons: ['preview already marked STALE', ...preview.staleReasons], checksSkipped };
  }
  const fp = preview.fingerprint;
  // Tamper check: the fingerprint hash must match the fingerprint fields.
  const { fingerprintHash, computedAt: _computedAt, ...hashFields } = fp;
  void _computedAt;
  if (fingerprintHashOf(hashFields) !== fingerprintHash) {
    reasons.push('fingerprint hash mismatch — the preview data was modified after computation');
  }
  if (current.masterPriceVersion !== undefined) {
    if (current.masterPriceVersion !== fp.masterPriceVersion) {
      reasons.push(
        `master price version moved ${fp.masterPriceVersion} → ${current.masterPriceVersion} since the preview was computed`,
      );
    }
  } else {
    checksSkipped.push('masterPriceVersion (no current value supplied)');
  }
  if (fp.kind === 'AHSP_VERSION_CHANGE' || fp.kind === 'ROLLBACK') {
    if (fp.family !== null) {
      if (current.activeVersions !== undefined) {
        if (fp.activeVersionIdAtCompute !== null && current.activeVersions[fp.family] !== fp.activeVersionIdAtCompute) {
          reasons.push(
            `active ${fp.family} version moved ${fp.activeVersionIdAtCompute} → ${current.activeVersions[fp.family]} since the preview was computed (a publish happened)`,
          );
        }
      } else {
        checksSkipped.push('active pointer (no current registry state supplied)');
      }
      if (current.versionChecksums !== undefined) {
        if (fp.sourceVersionId !== null && fp.baseContentChecksum !== null) {
          const currentChecksum = current.versionChecksums[`${fp.family}|${fp.sourceVersionId}`];
          if (currentChecksum === undefined) {
            reasons.push(`base version ${fp.family} ${fp.sourceVersionId} is no longer in the registry`);
          } else if (currentChecksum !== fp.baseContentChecksum) {
            reasons.push(`base version ${fp.family} ${fp.sourceVersionId} content changed since the preview was computed`);
          }
        }
      } else {
        checksSkipped.push('base version checksum (no current registry state supplied)');
      }
    }
  } else if (fp.kind === 'MASTER_PRICE_CHANGE') {
    if (current.catalogChecksum !== undefined) {
      if (current.catalogChecksum !== fp.baseContentChecksum) {
        reasons.push('catalog content changed since the preview was computed (a new AHSP version was published)');
      }
    } else {
      checksSkipped.push('catalog checksum (no current catalog supplied)');
    }
    if (current.currentBaselinePrices !== undefined) {
      for (const baseline of fp.changedResourceBaseline) {
        const currentPrice = current.currentBaselinePrices.get(baseline.key);
        if (currentPrice !== baseline.oldPrice) {
          reasons.push(
            `baseline price for ${baseline.key} moved ` +
              `${baseline.oldPrice === null ? 'unpriced' : `Rp${baseline.oldPrice.toLocaleString('id-ID')}`} → ` +
              `${currentPrice === undefined || currentPrice === null ? 'unpriced' : `Rp${currentPrice.toLocaleString('id-ID')}`} ` +
              `since the preview was computed`,
          );
        }
      }
    } else {
      checksSkipped.push('baseline prices (no current resolutions supplied)');
    }
  }
  if (current.projectsFingerprint !== undefined) {
    if (fp.projectsFingerprint !== '' && current.projectsFingerprint !== fp.projectsFingerprint) {
      reasons.push('project inputs changed since the preview was computed (a project, item, mode, or override moved)');
    }
  } else {
    checksSkipped.push('project inputs (no current project fingerprint supplied)');
  }
  return { fresh: reasons.length === 0, reasons, checksSkipped };
}

/**
 * Resolve the CURRENT effective price for each changed key of a
 * master-price preview (for freshness validation): the same baseline
 * resolution the preview verified at compute time.
 */
export function resolveCurrentBaselinePrices(
  preview: MasterPriceImpactPreview,
): ReadonlyMap<string, number | null> {
  const out = new Map<string, number | null>();
  for (const change of preview.change.priceChanges) {
    const check = verifyChangeBaseline(change);
    out.set(check.key, check.resolvedPrice);
  }
  return out;
}

/** Mark a preview STALE (a NEW object — the input is never mutated). The data stays readable for audit; the status refuses use. */
export function markPreviewStale(
  preview: MasterPriceImpactPreview,
  reasons: string[],
): MasterPriceImpactPreview {
  if (preview.status === 'STALE') return preview;
  return {
    ...preview,
    status: 'STALE',
    staleReasons: [...reasons],
    note:
      `${preview.note} STALE — do not use for confirm: ${reasons.join('; ')}. ` +
      'Recompute a fresh preview before confirming.',
  };
}

// ---------------------------------------------------------------------------
// The §8 ImpactProvider seam — the REAL provider (§9 (a))
// ---------------------------------------------------------------------------

/**
 * Convert a full §9 preview to the §8 `AhspVersionImpact` shape carried
 * by Mode A confirmations. The full preview rides along (`preview`) so
 * the confirmation — and the history entry built from it — keeps the
 * complete auditable numbers, not just the counts.
 */
export function toAhspVersionImpact(preview: MasterPriceImpactPreview): AhspVersionImpact {
  if (preview.status === 'NOT_COMPUTED') {
    return {
      status: 'NOT_COMPUTED',
      note: preview.note,
      fingerprint: preview.fingerprint,
      preview,
    };
  }
  if (preview.status === 'STALE') {
    return {
      status: 'STALE',
      note: preview.note,
      fingerprint: preview.fingerprint,
      preview,
    };
  }
  return {
    status: 'COMPUTED',
    affectedAhspCodes: [...preview.affectedAhspReferences],
    affectedComponentReferences: preview.components.summary.affectedReferenceCount,
    affectedLiveProjects: [...preview.affectedLivePriceProjects],
    lockedSnapshotsUnchanged: preview.projects.summary.lockedSnapshotCount,
    computedAt: preview.computedAt,
    note: preview.note,
    fingerprint: preview.fingerprint,
    preview,
  };
}

/**
 * The REAL impact provider (§9 (a)): computes the actual impact of a
 * proposed AHSP version change from the rich change description
 * (family + base version + new content + §8 diff + projects). Returns
 * NOT_COMPUTED — never a fabricated number — when the description
 * lacks the rich inputs (the legacy minimal description carries counts
 * only, which cannot support a real computation).
 *
 * This is the default provider for the Mode A flow (wired as
 * `defaultImpactProvider` in ahspVersioning.ts). `notComputedImpactProvider`
 * remains available as the explicit "do not compute" choice.
 */
export const masterPriceImpactProvider: ImpactProvider = {
  computeImpact(change: AhspVersionChangeDescription): AhspVersionImpact {
    const missing: string[] = [];
    if (!change || typeof change !== 'object') {
      return {
        status: 'NOT_COMPUTED',
        note: 'Impact not computed: no change description was supplied.',
      };
    }
    if (!Array.isArray(change.sourceItems)) missing.push('sourceItems (the base version content)');
    if (!Array.isArray(change.targetItems)) missing.push('targetItems (the proposed content)');
    if (!change.diff || typeof change.diff !== 'object') missing.push('diff (the §8 compareAhspSnapshots result)');
    if (!isNonEmptyString(change.sourceContentChecksum)) missing.push('sourceContentChecksum');
    if (!isNonEmptyString(change.targetContentChecksum)) missing.push('targetContentChecksum');
    if (!Array.isArray(change.projects)) missing.push('projects (the collected workspace projects, possibly empty)');
    if (missing.length > 0) {
      return {
        status: 'NOT_COMPUTED',
        note:
          `Impact not computed: the change description lacks ${missing.join(', ')} — ` +
          'a real impact cannot be computed from counts alone. This is NOT a claim of zero impact.',
      };
    }
    const preview = computeAhspVersionImpact({
      kind: change.kind ?? 'AHSP_VERSION_CHANGE',
      family: change.family,
      sourceVersionId: change.sourceVersionId,
      targetVersionId: change.targetVersionId,
      sourceItems: change.sourceItems as readonly NationalAHSPItem[],
      targetItems: change.targetItems as readonly NationalAHSPItem[],
      diff: change.diff as AHSPVersionDiff,
      sourceContentChecksum: change.sourceContentChecksum as string,
      targetContentChecksum: change.targetContentChecksum as string,
      activeVersionIdAtCompute: change.activeVersionIdAtCompute ?? null,
      masterPriceVersion: change.masterPriceVersion,
      projects: change.projects as readonly ProjectImpactInput[],
      computedAt: change.computedAt,
    });
    return toAhspVersionImpact(preview);
  },
};
