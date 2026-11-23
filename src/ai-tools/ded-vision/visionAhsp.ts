/**
 * I11 Stage 4 (AHSP wiring) — adapter from vision records to the
 * EXISTING EZRAB canonical AHSP resolver. No matcher is invented here:
 * the adapter calls `matchDedItemToAhsp` from
 * `src/ai-tools/ded-canonical/canonicalDedPricing.ts` (source SE DJBK
 * No. 47/SE/Dk/2026, period 2026) and translates its verdict into the
 * vision seam shape.
 *
 * Honesty rules (inherited from the resolver, enforced here too):
 * - ONLY a RESOLVED verdict yields an `ahspCode` + `unitPrice`.
 *   NEEDS_REVIEW / NO_MATCH / UNIT_MISMATCH / INCOMPLETE_COMPONENTS /
 *   INVALID all yield null code + null price — never an invented price,
 *   never a "best guess" code. The resolver's status + reason travel in
 *   `note` so the review UI can show WHY nothing matched.
 * - A resolver throw never crashes the vision run: it is caught and
 *   reported as a null match with the error in `note`.
 * - The adapter takes `matchFn` as a parameter (defaulting to the real
 *   resolver) so tests inject a stub without loading the catalog.
 *
 * FULL AI isolation (C3) is enforced by the PIPELINE
 * (`evaluateAhsp` gates on `canEnrichWithCanonical` BEFORE calling the
 * matcher), not by this adapter: the adapter itself is mode-agnostic.
 * The services pass `createVisionAhspMatcher()` as `ahspMatcher`; in
 * FULL_AI mode the pipeline never calls it (matcher call count 0 —
 * verified by the pipeline suite).
 *
 * The match-input builders (`ahspInputForOpening`,
 * `ahspInputForQuantity`) live in `visionPipeline.ts` — they are
 * pipeline logic over pipeline records, and keeping them there keeps
 * this module's catalog import out of the pipeline's dependency graph.
 */

import { matchDedItemToAhsp } from '../ded-canonical/canonicalDedPricing';
import type { CanonicalDedMatch } from '../ded-canonical/canonicalDedPricing';
import type { VisionAhspMatcher } from './visionPipeline';

/** The resolver function shape the adapter wraps. */
export type VisionMatchFn = (input: {
  name: string;
  unit: string;
  specification?: string;
}) => CanonicalDedMatch;

/**
 * Build a `VisionAhspMatcher` over the canonical resolver (or an
 * injected `matchFn` for tests). The returned matcher is synchronous
 * and deterministic — the resolver is a local catalog lookup, never a
 * provider call.
 */
export function createVisionAhspMatcher(
  matchFn: VisionMatchFn = matchDedItemToAhsp,
): VisionAhspMatcher {
  return (input) => {
    let res: CanonicalDedMatch;
    try {
      res = matchFn({
        name: input.name,
        unit: input.unit,
        specification: input.specification,
      });
    } catch (err) {
      return {
        ahspCode: null,
        unitPrice: null,
        note: `resolver error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (res.status === 'RESOLVED') {
      return {
        ahspCode: res.matchedCode ?? null,
        unitPrice: res.unitPrice,
        note: `RESOLVED via ${res.sourceDocument} (${res.period})${res.matchedName ? `: ${res.matchedName}` : ''}`,
      };
    }
    return {
      ahspCode: null,
      unitPrice: null,
      note: `${res.status}: ${res.reason}`,
    };
  };
}
