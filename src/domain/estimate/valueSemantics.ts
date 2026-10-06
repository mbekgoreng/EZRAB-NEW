/** A stored financial value is present when it is not null or undefined; zero is valid. */
export function hasFinancialValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

/**
 * Selects an explicitly stored amount before evaluating the fallback.
 * This deliberately preserves 0 and prevents the `amount || fallback` bug.
 */
export function resolveStoredAmount(
  amount: number | null | undefined,
  fallback: () => number,
): number {
  return hasFinancialValue(amount) ? amount : fallback();
}
