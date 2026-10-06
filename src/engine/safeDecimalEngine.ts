/**
 * YFARCH RAB PRO — SAFE DECIMAL & ARITHMETIC ENGINE
 * High-precision integer scaled & fixed-point calculations to eliminate floating point drift.
 * Ensures that 100000 * 0.125 = 12500 exactly (not 12499.999999999998).
 */

const SCALE_FACTOR = 10000; // 4 decimal places internal precision scale

export class SafeDecimalEngine {
  /**
   * Validate and sanitize input numbers.
   * Rejects NaN, Infinity, and invalid negative values when strictPositive is true.
   */
  public static sanitize(val: any, fallback = 0, strictPositive = false): number {
    if (val === null || val === undefined || val === '') return fallback;
    const num = typeof val === 'number' ? val : Number(val);
    if (isNaN(num) || !isFinite(num)) return fallback;
    if (strictPositive && num < 0) return fallback;
    return num;
  }

  /**
   * Safe multiplication of two decimal numbers with scaled precision
   * e.g. safeMultiply(100000, 0.125) -> 12500
   */
  public static safeMultiply(a: number, b: number, decimals = 2): number {
    const validA = this.sanitize(a);
    const validB = this.sanitize(b);
    if (validA === 0 || validB === 0) return 0;

    // Use scaled integer arithmetic for coefficient precision
    const scaledA = Math.round(validA * SCALE_FACTOR);
    const scaledB = Math.round(validB * SCALE_FACTOR);
    const product = (scaledA * scaledB) / (SCALE_FACTOR * SCALE_FACTOR);

    return this.safeRound(product, decimals);
  }

  /**
   * Safe addition of multiple numbers with scaled precision
   */
  public static safeAdd(...numbers: number[]): number {
    let totalScaled = 0;
    for (const num of numbers) {
      const valid = this.sanitize(num);
      totalScaled += Math.round(valid * SCALE_FACTOR);
    }
    return totalScaled / SCALE_FACTOR;
  }

  /**
   * Safe subtraction (a - b) with scaled precision
   */
  public static safeSubtract(a: number, b: number): number {
    const validA = this.sanitize(a);
    const validB = this.sanitize(b);
    const diffScaled = Math.round(validA * SCALE_FACTOR) - Math.round(validB * SCALE_FACTOR);
    return diffScaled / SCALE_FACTOR;
  }

  /**
   * Safe division with zero division guard
   */
  public static safeDivide(numerator: number, denominator: number, decimals = 4, fallback = 0): number {
    const validNum = this.sanitize(numerator);
    const validDenom = this.sanitize(denominator);
    if (validDenom === 0) return fallback;

    const result = validNum / validDenom;
    return this.safeRound(result, decimals);
  }

  /**
   * Banker's / Half-up Rounding to specified decimal places
   */
  public static safeRound(val: number, decimals = 0): number {
    const valid = this.sanitize(val);
    if (decimals === 0) {
      return Math.round(valid);
    }
    const factor = Math.pow(10, decimals);
    return Math.round((valid + Number.EPSILON) * factor) / factor;
  }

  /**
   * Compute percentage safely (e.g. 11% of 100000 -> 11000)
   */
  public static safePercent(amount: number, percent: number, decimals = 0): number {
    const validAmount = this.sanitize(amount, 0, true);
    const validPercent = this.sanitize(percent, 0, true);
    if (validAmount === 0 || validPercent === 0) return 0;

    const result = (validAmount * validPercent) / 100;
    return this.safeRound(result, decimals);
  }

  /**
   * Compute relative weight percentage (Bobot %) with 2 decimal precision
   */
  public static calculateWeight(itemTotal: number, grandDirectCost: number): number {
    if (grandDirectCost <= 0) return 0;
    const ratio = (this.sanitize(itemTotal, 0, true) / grandDirectCost) * 100;
    return this.safeRound(ratio, 2);
  }
}
