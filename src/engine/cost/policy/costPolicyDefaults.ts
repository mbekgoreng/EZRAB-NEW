/**
 * COST POLICY DEFAULTS — Phase 1 (single canonical default set)
 * ------------------------------------------------------------
 * The Phase 0 audit (findings C-09, C-10, C-11) found the same three parameters
 * configured differently across the codebase:
 *
 *   UnifiedProjectEngine    : 5% overhead + 5%  profit   (the live UI path)
 *   RabCostAuditEngine      : 5% overhead + 10% profit
 *   Scenario Engine         : 3–5% overhead + 8–10% profit
 *   Inspector UI            : 5% overhead + 10% profit
 *   `pdfExporter.ts:240`    : 10% profit when the project value is absent
 *
 * Consequence: the exported PDF totals differed from the on-screen totals
 * (C-10), because the exporter silently substituted a different profit rate.
 *
 * Phase 1 fixes exactly one thing: it makes the default set a single exported
 * constant, aligned to the live UI path. Existing projects are unaffected —
 * their explicit `costSummary` values still win. Only the *fallback* changes,
 * and it now changes in one place instead of five.
 *
 * Phase 2 replaces this module with `CostPolicyEngine`.
 */

/** Canonical fallback values. Mirrors the live `ProjectContext` summary path. */
export const COST_POLICY_DEFAULTS = Object.freeze({
  overheadPercent: 5,
  profitPercent: 5,
  taxPercent: 11,
  contingencyPercent: 0,
  directorMarkupPercent: 0,
});

export type CostPolicyField = keyof typeof COST_POLICY_DEFAULTS;

export interface CostPolicyDefaultUse {
  readonly field: CostPolicyField;
  readonly value: number;
  /** Where the default was substituted, e.g. `pdfExporter.computeCostSummary`. */
  readonly site: string;
  readonly at: number;
}

const MAX_USES = 1000;
const uses: CostPolicyDefaultUse[] = [];

/**
 * Resolve a numeric policy field, recording when the fallback was needed.
 *
 * Non-breaking: returns the caller-supplied value whenever it is a finite
 * number, exactly as the previous `typeof x === 'number' ? x : DEFAULT` checks did.
 */
export function resolvePolicyValue(
  field: CostPolicyField,
  candidate: unknown,
  site: string,
): number {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  const value = COST_POLICY_DEFAULTS[field];
  if (uses.length < MAX_USES) {
    uses.push({ field, value, site, at: Date.now() });
  }
  return value;
}

export function getCostPolicyDefaultUses(): readonly CostPolicyDefaultUse[] {
  return uses;
}

export function resetCostPolicyDefaultUses(): void {
  uses.length = 0;
}
