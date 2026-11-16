/**
 * EZRAB MASTER PRICING — TWO-WAY RECONCILIATION MATCHING (§5)
 * ============================================================
 *
 * Pure implementation of the MASTER-PROMPT §5.3 strict matching hierarchy and
 * the §5.4 classification rules. Used by the reconciliation runner
 * (`scripts/price2026/reconcileMasterPricing.ts`) and unit-tested in
 * `src/test/masterPricingReconciliation.test.ts`.
 *
 * PIPELINE-LOCAL (like `matcherHardening.ts`): this module imports the
 * pipeline-only spec-token primitives, so it must NOT be imported by the
 * runtime resolver. If §6 needs the hierarchy at runtime, the spec-token
 * functions must first move into `src/data/priceDatabase2026/normalize.ts` —
 * a §6 decision, not §5's.
 *
 * Hierarchy (§5.3), in order — first applicable level wins:
 *   1. EXACT_CANONICAL_ID — the component's canonical resource ID (RES-xxx)
 *      matches a master entity's canonical ID exactly.
 *   2. EXACT_SOURCE_ID    — the component's verified source code (loose code,
 *      e.g. `L.05` == `L05`) matches a master entity's verified source code
 *      exactly, with a compatible unit.
 *   3. NAME_SPEC_UNIT     — exact normalized name + compatible spec tokens +
 *      compatible unit. "Exact" here means the normalized names are identical
 *      after the shared `normalizeName` primitive; spec compatibility uses the
 *      matcher's `specTokensCompatible` (diameters, grades, capacities must not
 *      contradict).
 *   4. APPROVED_ALIAS     — the pair is listed in the approved-alias table
 *      (Fase-2 precedent: `aliases.json`). An alias is a human decision with
 *      evidence, never an inference.
 *   5. REVIEW_CANDIDATE   — a strong semantic candidate (name similarity at or
 *      above the matcher threshold with compatible spec/unit) that MUST be
 *      reviewed by a human. It is NOT a merge.
 *   6. NO_MATCH           — nothing above applies.
 *
 * Hard rule (§5.3): NEVER merge on a similar name alone. A name-only similarity
 * below the exact-name bar lands at level 5 (review) or 6 (no match) — never at
 * a merge level. The matcher functions below enforce this structurally: the
 * only levels that produce a `merge: true` outcome are 1–4, and level 3
 * requires an EXACT normalized name, not a similar one.
 *
 * Classification (§5.4): `classifyComponent` classifies every AHSP component
 * as MATERIAL / LABOR / EQUIPMENT / UNCLASSIFIED / NEEDS_REVIEW. The code
 * prefix is the primary signal (it is the reliable signal in this repository —
 * see `typeFromCodePrefix`); the component array is the fallback for uncoded
 * rows. NOTHING is silently discarded: unclassified rows are returned with
 * their identity intact so the runner can list them.
 *
 * Pure functions only: no file, clock or network access.
 */

import {
  looseCode,
  normalizeName,
  normalizeUnit,
  nameSimilarity,
  typeFromCodePrefix,
  unitsCompatible,
} from '../../src/data/priceDatabase2026/normalize';
import { specTokensCompatible } from './matcherHardening';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconciliationCategory =
  | 'MATERIAL'
  | 'LABOR'
  | 'EQUIPMENT'
  | 'UNCLASSIFIED'
  | 'NEEDS_REVIEW';

/** §5.3 hierarchy levels. */
export type MatchLevel =
  | 'EXACT_CANONICAL_ID'
  | 'EXACT_SOURCE_ID'
  | 'NAME_SPEC_UNIT'
  | 'APPROVED_ALIAS'
  | 'REVIEW_CANDIDATE'
  | 'NO_MATCH';

export interface ReconciliationComponent {
  /** Canonical resource ID (RES-xxx) when the component carries one. */
  canonicalId?: string | null;
  /** Source code as printed in the AHSP item (may contain dots, e.g. `L.05`). */
  code?: string | null;
  name: string;
  unit?: string | null;
  /** Specification text when available (specContext / specification). */
  spec?: string | null;
  /** Which component array the row came from: materials | labor | equipment. */
  array?: 'materials' | 'labor' | 'equipment' | null;
}

export interface ReconciliationMasterEntity {
  canonicalId?: string | null;
  /** Verified source code of the master entity. */
  sourceCode?: string | null;
  name: string;
  unit?: string | null;
  spec?: string | null;
}

export interface MatchOutcome {
  level: MatchLevel;
  /** True only for levels 1–4 (a verified merge). Levels 5–6 never merge. */
  merge: boolean;
  /** 0–1 similarity for the pair (informational; never a merge criterion alone). */
  similarity: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// §5.4 Classification
// ---------------------------------------------------------------------------

const ARRAY_TO_CATEGORY: Record<string, ReconciliationCategory> = {
  materials: 'MATERIAL',
  labor: 'LABOR',
  equipment: 'EQUIPMENT',
};

/**
 * Classify one AHSP component (§5.4).
 *
 * - Coded rows: the code prefix decides (the reliable signal). An unknown
 *   prefix (typeFromCodePrefix returns UNKNOWN) is NEEDS_REVIEW, never a
 *   silent drop — the row keeps its code/name/unit for the review queue.
 * - Uncoded rows: the component array decides (MATERIAL/LABOR/EQUIPMENT).
 * - No code and no array: UNCLASSIFIED (kept, listed, never discarded).
 * - A prefix/array contradiction (e.g. an `M`-coded row inside the labor
 *   array) is classified by PREFIX, and the contradiction is reported by the
 *   runner as a separate count — it is a data-quality signal, not a reason to
 *   refuse classification.
 */
export function classifyComponent(
  component: ReconciliationComponent,
): ReconciliationCategory {
  const loose = looseCode(component.code ?? '');
  if (loose) {
    const fromPrefix = typeFromCodePrefix(loose);
    if (fromPrefix !== 'UNKNOWN') return fromPrefix;
    // Coded but the prefix is unknown: needs a human, not a guess.
    return 'NEEDS_REVIEW';
  }
  if (component.array && ARRAY_TO_CATEGORY[component.array]) {
    return ARRAY_TO_CATEGORY[component.array];
  }
  return 'UNCLASSIFIED';
}

/** True when the code prefix and the component array disagree on category. */
export function isPrefixArrayContradiction(
  component: ReconciliationComponent,
): boolean {
  const loose = looseCode(component.code ?? '');
  if (!loose || !component.array) return false;
  const fromPrefix = typeFromCodePrefix(loose);
  if (fromPrefix === 'UNKNOWN') return false;
  return fromPrefix !== ARRAY_TO_CATEGORY[component.array];
}

// ---------------------------------------------------------------------------
// §5.3 Matching hierarchy
// ---------------------------------------------------------------------------

/**
 * The approved-alias table (level 4). Keys are `looseCode|normalizedUnit`
 * pairs of the component side; values are the canonical IDs they are approved
 * to merge into. Aliases are human decisions recorded with evidence in the
 * reconciliation report — this table starts EMPTY in §5: the ten verified
 * bindings decided in §5 are recorded in `reconciliation.json`
 * (`verifiedBindings`, with method + status + evidence) and are applied to
 * this table by the §15 migration, because applying them changes the pinned
 * §3/§4 counts (452 priceMaster records, 50 conflict groups, 1,276 registry
 * bindings) and therefore needs owner approval. Nothing in §5 invents an
 * alias.
 */
export const APPROVED_ALIASES: ReadonlyMap<string, string> = new Map([]);

/** Similarity floor for a level-5 review candidate (matcher threshold). */
export const REVIEW_CANDIDATE_MIN_SIMILARITY = 0.6;

/**
 * Match one AHSP component against one master entity through the §5.3
 * hierarchy. Pure: the caller supplies both sides.
 *
 * Ordering guarantee: the first applicable level wins, so a level-1 match is
 * never demoted and a level-5 candidate is never promoted to a merge.
 */
export function matchComponentToMaster(
  component: ReconciliationComponent,
  entity: ReconciliationMasterEntity,
): MatchOutcome {
  const similarity = nameSimilarity(component.name, entity.name);
  const unitOk = unitsCompatible(component.unit ?? '', entity.unit ?? '');
  const specOk = specTokensCompatible(
    component.spec ?? component.name,
    entity.spec ?? entity.name,
  );

  // Level 1 — exact canonical ID.
  if (
    component.canonicalId &&
    entity.canonicalId &&
    component.canonicalId === entity.canonicalId
  ) {
    return {
      level: 'EXACT_CANONICAL_ID',
      merge: true,
      similarity,
      reason: `canonical ID ${component.canonicalId} identical`,
    };
  }

  // Level 2 — exact verified source ID + compatible unit.
  const looseComponent = looseCode(component.code ?? '');
  const looseEntity = looseCode(entity.sourceCode ?? '');
  if (looseComponent && looseEntity && looseComponent === looseEntity) {
    if (unitOk) {
      return {
        level: 'EXACT_SOURCE_ID',
        merge: true,
        similarity,
        reason: `source code ${looseComponent} identical, unit compatible`,
      };
    }
    return {
      level: 'REVIEW_CANDIDATE',
      merge: false,
      similarity,
      reason:
        `source code ${looseComponent} identical but units incompatible ` +
        `(${component.unit ?? '∅'} vs ${entity.unit ?? '∅'}) — review, do not merge`,
    };
  }

  // Level 3 — exact normalized name + compatible spec + compatible unit.
  // NOTE: the name must be EXACT after normalization. A merely similar name
  // can never reach this level — that is the §5.3 "never merge on a similar
  // name alone" rule, enforced structurally.
  const nameExact =
    normalizeName(component.name) !== '' &&
    normalizeName(component.name) === normalizeName(entity.name);
  if (nameExact && specOk && unitOk) {
    return {
      level: 'NAME_SPEC_UNIT',
      merge: true,
      similarity,
      reason: 'exact normalized name + compatible spec + compatible unit',
    };
  }

  // Level 4 — approved alias.
  if (looseComponent) {
    const aliasKey = `${looseComponent}|${normalizeUnit(component.unit ?? '')}`;
    const approved = APPROVED_ALIASES.get(aliasKey);
    if (approved && entity.canonicalId && approved === entity.canonicalId) {
      return {
        level: 'APPROVED_ALIAS',
        merge: true,
        similarity,
        reason: `approved alias ${aliasKey} → ${approved}`,
      };
    }
  }

  // Level 5 — strong semantic candidate requiring review (NOT a merge).
  if (
    similarity >= REVIEW_CANDIDATE_MIN_SIMILARITY &&
    specOk &&
    unitOk
  ) {
    return {
      level: 'REVIEW_CANDIDATE',
      merge: false,
      similarity,
      reason:
        `strong semantic candidate (similarity ${similarity.toFixed(2)}) — ` +
        `review required, not a merge`,
    };
  }

  // Level 6 — no match.
  return {
    level: 'NO_MATCH',
    merge: false,
    similarity,
    reason:
      nameExact && !specOk
        ? 'exact name but incompatible specification'
        : nameExact && !unitOk
          ? 'exact name but incompatible unit'
          : 'no hierarchy level applies',
  };
}

// ---------------------------------------------------------------------------
// Duplicate grouping (§5.1 step 5 / audit phase1 §9.2 rules)
// ---------------------------------------------------------------------------

export type DuplicateKind = 'TRUE_DUP' | 'CODE_VARIANT' | 'NAME_ONLY_DUP' | 'MIXED';

export interface DuplicateGroupInput {
  code?: string | null;
  name: string;
  unit?: string | null;
  resourceId?: string | null;
}

/**
 * Classify a duplicate group formed by (normalized name + normalized unit)
 * — the audit phase1 §9.2 grouping. Within such a group the name and unit are
 * uniform by construction, so the kind is decided by the CODE pattern:
 * - TRUE_DUP: all members share ONE non-empty loose code. The ONLY kind that
 *   may auto-merge (§5.3) — and even then the merge itself is a §15 migration
 *   action, recorded as a decision, not executed here.
 * - CODE_VARIANT: more than one distinct loose code (one name, several codes
 *   — e.g. the same product coded differently in two families).
 * - NAME_ONLY_DUP: NO member carries a code (all uncoded).
 * - MIXED: some members coded, some not.
 *
 * Precedence (audit §9.2): CODE_VARIANT (>1 distinct loose code) is checked
 * before MIXED, so a group with several codes AND uncoded members is
 * CODE_VARIANT; MIXED is a group with exactly one code plus uncoded members.
 * A group with no code at all is NAME_ONLY_DUP, never TRUE_DUP (a shared
 * empty code is not an identity).
 */
export function classifyDuplicateGroup(
  members: DuplicateGroupInput[],
): DuplicateKind {
  const codes = new Set(
    members.map((m) => looseCode(m.code ?? '')).filter(Boolean),
  );
  const hasUncoded = members.some((m) => !looseCode(m.code ?? ''));
  const hasCoded = codes.size > 0;
  if (codes.size > 1) return 'CODE_VARIANT';
  if (hasCoded && hasUncoded) return 'MIXED';
  if (codes.size === 1) return 'TRUE_DUP';
  return 'NAME_ONLY_DUP';
}

/**
 * Canonical representative of a TRUE_DUP group (same rule as the matcher's
 * representative choice): longest informative name first, then alphabetical,
 * then lowest resource ID. Deterministic.
 */
export function trueDupRepresentative(
  members: DuplicateGroupInput[],
): DuplicateGroupInput {
  const sorted = [...members].sort((a, b) => {
    const nameA = normalizeName(a.name);
    const nameB = normalizeName(b.name);
    if (nameA.length !== nameB.length) return nameB.length - nameA.length;
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return String(a.resourceId ?? '').localeCompare(String(b.resourceId ?? ''));
  });
  return sorted[0];
}
