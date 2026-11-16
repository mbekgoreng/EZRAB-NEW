/**
 * EZRAB — NEEDS-REVIEW + UNDERSPECIFIED-KEY REGISTRY READER
 * (MASTER PRICING §6, items h + i)
 * ================================================================
 *
 * Runtime read layer over `needsReviewRegistry.generated.ts` (built by
 * `scripts/price2026/buildNeedsReviewRegistry.ts` from the §5 curated
 * decisions in `fase5-decisions.json`).
 *
 * Two different enforcement levels live here — do not conflate them:
 *
 *   1. NEEDS_REVIEW flags (§6 h): 43 open ambiguities + 29 open
 *      conflicts, merged into flagged component keys. A flagged key
 *      still resolves — the flag marks the resolution with its §5
 *      evidence + alternatives so it is never silent. The flag never
 *      changes a price.
 *   2. Underspecified keys (§6 i): keys §5 proved conflate several
 *      specifications. REFUSE keys (M241|m, EI734|kg, EI374|kg, generic
 *      name `beton`) are declined a single price; FLAG keys (M12|kg)
 *      resolve with an explicit marker (see the generator for the
 *      per-key reasoning). REFUSE rules apply to the CODE in any unit
 *      (a M241|cm query must not convert around the M241|m refusal);
 *      FLAG rules stay key-scoped (their evidence is a per-key spread).
 */

import {
  NEEDS_REVIEW_BY_KEY,
  NEEDS_REVIEW_ENTRIES,
  NEEDS_REVIEW_REGISTRY_STATS,
  UNDERSPECIFIED_ENTRIES,
  type NeedsReviewRegistryEntry,
  type UnderspecifiedRegistryEntry,
} from './needsReviewRegistry.generated';
import type { NeedsReviewFlag, UnderspecifiedKeyFlag } from './types';
import { looseCode, normalizeName, normalizeUnit } from './normalize';

export { NEEDS_REVIEW_REGISTRY_STATS };
export type { NeedsReviewRegistryEntry, UnderspecifiedRegistryEntry };

/** Build the registry lookup key exactly the way the resolver builds its
 *  component key: loose code + normalized unit. */
export function componentKeyFor(code: string | undefined | null, unit: string | undefined | null): string {
  if (!code) return '';
  return `${looseCode(code)}|${normalizeUnit(unit || '')}`;
}

/**
 * The NEEDS_REVIEW flag for a component key, or null when the key is not
 * in the §5 open register. `kind` collapses AMBIGUITY_AND_CONFLICT to
 * CONFLICT (the price-level conflict is the sharper of the two signals);
 * the merged reason still carries both halves of the evidence.
 */
export function getNeedsReviewFlag(componentKey: string): NeedsReviewFlag | null {
  if (!componentKey) return null;
  const entry = NEEDS_REVIEW_BY_KEY[componentKey];
  if (!entry) return null;
  return {
    kind: entry.kind === 'AMBIGUITY' ? 'AMBIGUITY' : 'CONFLICT',
    componentKey: entry.componentKey,
    reason: entry.reason,
    alternatives: [...entry.alternatives],
  };
}

/** All flagged keys (diagnostics / tests). */
export function getAllNeedsReviewEntries(): readonly NeedsReviewRegistryEntry[] {
  return NEEDS_REVIEW_ENTRIES;
}

/**
 * The underspecified-key rule for a query, or null. Checked in order:
 * exact component key (`LOOSECODE|unit`), then — for REFUSE rules only —
 * the CODE in any unit, then exact normalized name (for the generic-name
 * rule — `beton`, any unit). A name rule fires only on an EXACT
 * normalized-name match, so specified names (`Beton K-225`,
 * `Semen Portland`) are never caught by it.
 *
 * Why REFUSE is code-wide but FLAG is key-scoped: a REFUSE rule says the
 * CODE conflates several specifications (M241 = every pipe diameter),
 * which is true in every unit — a query for M241|cm must not silently
 * convert the refused M241|m price (that bypass existed until the §6
 * finisher closed it: M241|cm used to resolve Rp1.800 via m→cm
 * conversion). A FLAG rule's evidence is a per-key price spread, so it
 * stays attached to its own key.
 */
export function getUnderspecifiedRule(
  componentKey: string,
  resourceName?: string | null
): UnderspecifiedKeyFlag | null {
  if (componentKey) {
    const byKey = UNDERSPECIFIED_ENTRIES.find((e) => e.keyKind === 'KEY' && e.key === componentKey);
    if (byKey) {
      return {
        componentKey: byKey.key,
        action: byKey.action,
        reason: byKey.reason,
        alternatives: [...byKey.alternatives],
      };
    }
    const codePart = componentKey.split('|')[0];
    const byCode = UNDERSPECIFIED_ENTRIES.find(
      (e) => e.keyKind === 'KEY' && e.action === 'REFUSE' && e.key.split('|')[0] === codePart
    );
    if (byCode) {
      return {
        componentKey: byCode.key,
        action: byCode.action,
        reason: byCode.reason,
        alternatives: [...byCode.alternatives],
      };
    }
  }
  if (resourceName) {
    const n = normalizeName(resourceName);
    const byName = UNDERSPECIFIED_ENTRIES.find((e) => e.keyKind === 'NAME' && e.key === n);
    if (byName) {
      return {
        componentKey: componentKey || `name:${n}`,
        action: byName.action,
        reason: byName.reason,
        alternatives: [...byName.alternatives],
      };
    }
  }
  return null;
}

/** All underspecified entries (diagnostics / tests). */
export function getAllUnderspecifiedEntries(): readonly UnderspecifiedRegistryEntry[] {
  return UNDERSPECIFIED_ENTRIES;
}
