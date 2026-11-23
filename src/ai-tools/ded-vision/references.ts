/**
 * I5 — Cross-sheet reference graph (owner order 2026-11-22, spec §7).
 *
 * Pure functions over a small in-memory graph. The graph is just a plain
 * array of `CrossSheetReference` — no class, no hidden state; every function
 * takes the graph explicitly and returns a new array/object, never mutating
 * its inputs.
 *
 * Resolution states (from `./types`):
 * - CONFIRMED     — target found with an exact page + ref match.
 * - PROBABLE      — the ref matches a known target but the page is unknown
 *                   (target page null) or different from every known page.
 * - UNRESOLVED    — no known target carries this ref (dangling reference).
 * - CONTRADICTORY — two sources disagree about the same target key; both
 *                   claims are named in `conflictDetail`. Never silently
 *                   resolved, never silently cleared by resolution.
 *
 * Ref comparison is deterministic: refs are normalized by trimming
 * whitespace and upper-casing (`D1` == ` d1 `). Page comparison is exact
 * numeric equality. An empty ref can never match anything.
 *
 * Divergence note (vs `src/domain/document/drawingGraphTypes.ts`): that
 * module models a project-level drawing-set graph keyed by drawing/page
 * STRING ids with building/floor/zone hierarchy, revisions, supersede/
 * duplicate tracking and timestamps. This increment works at page level
 * (numeric pages + ref strings) with the 4-state spec §7 taxonomy, so the
 * `./types` contracts are used directly and `drawingGraphTypes.ts` is NOT
 * reused. A future wiring step may map `CrossSheetReference` onto
 * `DrawingRelationship` / `CrossReferenceEvidence` if the v2 graph is ever
 * adopted, but no adapter is built here.
 */

import type {
  CrossSheetReference,
  ReferenceEndpoint,
  ReferenceStatus,
} from './types';

/** Reference kinds, re-exported from the `./types` contract for convenience. */
export type ReferenceKind = CrossSheetReference['kind'];

/** A target known to exist in the drawing set (page + ref as written). */
export interface KnownTarget {
  page: number;
  ref: string;
}

/** One claimed value for a target key, with the page that claims it. */
export interface ClaimedValue {
  claim: string;
  page: number;
}

/**
 * Normalize a ref string for comparison: trim + upper-case. Empty (or
 * whitespace-only) refs normalize to '' and never match.
 */
export function normalizeRefKey(ref: string): string {
  return ref.trim().toUpperCase();
}

/** Normalize a claim string for comparison: trim + collapse inner whitespace. */
function normalizeClaim(claim: string): string {
  return claim.trim().replace(/\s+/g, ' ');
}

/** An empty graph is just an empty array. */
export function createReferenceGraph(): CrossSheetReference[] {
  return [];
}

/**
 * Append a reference to the graph. Returns a NEW array; the input array is
 * never mutated.
 */
export function addReference(
  graph: CrossSheetReference[],
  ref: CrossSheetReference,
): CrossSheetReference[] {
  return [...graph, ref];
}

/**
 * Resolve one reference against the known targets.
 *
 * Deterministic rules, in order:
 * 1. A ref already CONTRADICTORY keeps that status — resolution never
 *    silently clears a conflict (conflicts are cleared only by an explicit
 *    human decision, not by re-running resolution).
 * 2. Exact page + ref match (target page non-null) → CONFIRMED.
 * 3. Ref matches a known target but the page is unknown (null) or differs
 *    from every known page for that ref → PROBABLE.
 * 4. No known target carries this ref (or the ref is empty) → UNRESOLVED.
 *
 * Returns a NEW reference object; the input is never mutated and its
 * `evidence` array is preserved (copied, not dropped or rewritten), so the
 * resolution stays explainable from the ref's own evidence.
 */
export function resolveReference(
  ref: CrossSheetReference,
  knownTargets: KnownTarget[],
): CrossSheetReference {
  if (ref.status === 'CONTRADICTORY') {
    return { ...ref, evidence: [...ref.evidence] };
  }
  const key = normalizeRefKey(ref.to.ref);
  let status: ReferenceStatus = 'UNRESOLVED';
  if (key !== '') {
    const refMatches = knownTargets.filter(
      (t) => normalizeRefKey(t.ref) === key,
    );
    if (refMatches.length > 0) {
      const exactPage =
        ref.to.page !== null &&
        refMatches.some((t) => t.page === ref.to.page);
      status = exactPage ? 'CONFIRMED' : 'PROBABLE';
    }
  }
  return { ...ref, status, evidence: [...ref.evidence] };
}

/**
 * Resolve every reference in the graph against the known targets. Returns a
 * NEW array; the input graph is never mutated.
 */
export function resolveGraph(
  graph: CrossSheetReference[],
  knownTargets: KnownTarget[],
): CrossSheetReference[] {
  return graph.map((ref) => resolveReference(ref, knownTargets));
}

/**
 * Detect conflicts between claimed values for the same target key.
 *
 * `values` maps a target key (e.g. mark "D1") to the claims made about it,
 * each with the page that makes the claim. When a key carries two or more
 * DISTINCT claims (after claim normalization), every reference whose `from`
 * or `to` endpoint names that key is marked CONTRADICTORY with a
 * `conflictDetail` naming ALL distinct claims and their pages, e.g.:
 *   `Conflicting claims for D1: "900 mm" (page 3) vs "1000 mm" (page 7)`
 * Neither side is picked; the ref keeps its evidence and only gains the
 * conflict status + detail. Keys with a single distinct claim (or no claims)
 * leave their refs untouched.
 *
 * Distinct claims are ordered deterministically (page ascending, then claim
 * text) so the same input always produces the same `conflictDetail`.
 *
 * Returns a NEW array; the input graph is never mutated.
 */
export function detectConflicts(
  graph: CrossSheetReference[],
  values: Map<string, ClaimedValue[]>,
): CrossSheetReference[] {
  // Collect conflicting keys -> deterministic conflict detail strings.
  const conflictByKey = new Map<string, string>();
  for (const [rawKey, claims] of values) {
    const key = normalizeRefKey(rawKey);
    if (key === '') continue;
    // Distinct claims, keeping the first-seen page per distinct claim text.
    const distinct = new Map<string, ClaimedValue>();
    for (const c of claims) {
      const normalized = normalizeClaim(c.claim);
      if (!distinct.has(normalized)) {
        distinct.set(normalized, { claim: normalized, page: c.page });
      }
    }
    if (distinct.size < 2) continue;
    const ordered = [...distinct.values()].sort(
      (a, b) => a.page - b.page || a.claim.localeCompare(b.claim),
    );
    const parts = ordered.map((c) => `"${c.claim}" (page ${c.page})`);
    conflictByKey.set(
      key,
      `Conflicting claims for ${key}: ${parts.join(' vs ')}`,
    );
  }
  if (conflictByKey.size === 0) return [...graph];

  return graph.map((ref) => {
    const fromKey = normalizeRefKey(ref.from.ref);
    const toKey = normalizeRefKey(ref.to.ref);
    // A ref names at most one conflicting key per endpoint; prefer the
    // target endpoint (the claim is about the target), then the source.
    const detail = conflictByKey.get(toKey) ?? conflictByKey.get(fromKey);
    if (detail === undefined) return ref;
    return {
      ...ref,
      status: 'CONTRADICTORY' as ReferenceStatus,
      conflictDetail: detail,
      evidence: [...ref.evidence],
    };
  });
}

/** All references in the graph that could not be resolved to a known target. */
export function findUnresolved(graph: CrossSheetReference[]): CrossSheetReference[] {
  return graph.filter((ref) => ref.status === 'UNRESOLVED');
}

/** All references in the graph marked contradictory by `detectConflicts`. */
export function findConflicts(graph: CrossSheetReference[]): CrossSheetReference[] {
  return graph.filter((ref) => ref.status === 'CONTRADICTORY');
}

/** Re-exported for callers that build endpoints without importing `./types`. */
export type { ReferenceEndpoint };
