/**
 * Explicit estimate-financial policy. Rates are percentage points: 5 means 5%.
 * This module is intentionally not wired into legacy callers in Phase 1.
 */
export type MonetaryRoundingMode = 'LEGACY_SAFE_DECIMAL';
export type MonetaryPrecision = 0 | 2;

export interface CalculationPolicy {
  readonly policyVersion: string;
  readonly monetaryPrecision: MonetaryPrecision;
  readonly quantityPrecision: number;
  readonly roundingMode: MonetaryRoundingMode;
  readonly overheadRate: number;
  readonly profitRate: number;
  readonly contingencyRate: number;
  readonly markupRate: number;
  readonly ppnRate: number;
  readonly pphRate: number;
  readonly overheadEnabled: boolean;
  readonly profitEnabled: boolean;
  readonly contingencyEnabled: boolean;
  readonly markupEnabled: boolean;
  readonly ppnEnabled: boolean;
  readonly pphEnabled: boolean;
}

/**
 * Compatibility baseline for the current UnifiedProjectEngine defaults only.
 * It is not a universal EZRAB pricing or tax rule and is not applied implicitly.
 */
export const LEGACY_UNIFIED_PROJECT_POLICY: CalculationPolicy = Object.freeze({
  policyVersion: 'legacy-unified-project-v1',
  monetaryPrecision: 0,
  quantityPrecision: 4,
  roundingMode: 'LEGACY_SAFE_DECIMAL',
  overheadRate: 5,
  profitRate: 5,
  contingencyRate: 0,
  markupRate: 0,
  ppnRate: 11,
  pphRate: 0,
  overheadEnabled: true,
  profitEnabled: true,
  contingencyEnabled: false,
  markupEnabled: false,
  ppnEnabled: true,
  pphEnabled: false,
});

const rateKeys = [
  'overheadRate',
  'profitRate',
  'contingencyRate',
  'markupRate',
  'ppnRate',
  'pphRate',
] as const;

/** Creates a validated immutable policy without introducing implicit rates. */
export function createCalculationPolicy(
  overrides: Partial<CalculationPolicy> = {},
): CalculationPolicy {
  const policy: CalculationPolicy = {
    ...LEGACY_UNIFIED_PROJECT_POLICY,
    ...overrides,
  };

  if (!Number.isInteger(policy.quantityPrecision) || policy.quantityPrecision < 0 || policy.quantityPrecision > 8) {
    throw new Error('quantityPrecision must be an integer from 0 through 8.');
  }

  for (const key of rateKeys) {
    const rate = policy[key];
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error(`${key} must be a finite non-negative percentage.`);
    }
  }

  return Object.freeze(policy);
}

