import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { CalculationPolicy } from './calculationPolicy';

export interface PolicyAdditionTotals {
  readonly directCost: number;
  readonly overhead: number;
  readonly profit: number;
  readonly contingency: number;
  readonly markup: number;
  readonly subtotalBeforeTax: number;
  readonly ppn: number;
  readonly pph: number;
  readonly grandTotal: number;
}

/**
 * Canonical policy arithmetic prepared for the estimate engine. This has no
 * callers in Phase 1, so it cannot change current UI, server, or export totals.
 */
export function calculatePolicyAdditions(
  directCostInput: number,
  policy: CalculationPolicy,
): PolicyAdditionTotals {
  const directCost = SafeDecimalEngine.sanitize(directCostInput, 0, true);
  const precision = policy.monetaryPrecision;
  const addition = (enabled: boolean, rate: number, base: number): number =>
    enabled ? SafeDecimalEngine.safePercent(base, rate, precision) : 0;

  const overhead = addition(policy.overheadEnabled, policy.overheadRate, directCost);
  const profit = addition(policy.profitEnabled, policy.profitRate, directCost);
  const contingency = addition(policy.contingencyEnabled, policy.contingencyRate, directCost);
  const markup = addition(policy.markupEnabled, policy.markupRate, directCost);
  const subtotalBeforeTax = SafeDecimalEngine.safeAdd(
    directCost,
    overhead,
    profit,
    contingency,
    markup,
  );
  const ppn = addition(policy.ppnEnabled, policy.ppnRate, subtotalBeforeTax);
  const pph = addition(policy.pphEnabled, policy.pphRate, subtotalBeforeTax);
  const grandTotal = SafeDecimalEngine.safeAdd(subtotalBeforeTax, ppn, pph);

  return Object.freeze({
    directCost,
    overhead,
    profit,
    contingency,
    markup,
    subtotalBeforeTax,
    ppn,
    pph,
    grandTotal,
  });
}
