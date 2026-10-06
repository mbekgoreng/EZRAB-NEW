/**
 * EZRAB CALCULATOR CORE — PRECISION & NUMERIC ENGINE
 * High-precision arithmetic, strict input validation, and precision policy management.
 */

import { Decimal } from 'decimal.js';
import { PrecisionPolicy } from '../contracts/types';
import { SafeDecimalEngine } from '../../safeDecimalEngine';

export class NumericValidationError extends Error {
  public readonly fieldName: string;
  public readonly receivedValue: unknown;

  constructor(message: string, fieldName = '', receivedValue: unknown = undefined) {
    super(message);
    this.name = 'NumericValidationError';
    this.fieldName = fieldName;
    this.receivedValue = receivedValue;
  }
}

export class PrecisionEngine {
  /**
   * Strictly validate and parse a numeric input.
   * Unlike legacy fallback, strict validation throws or flags non-numeric values.
   */
  public static validateNumber(
    val: unknown,
    options: {
      fieldName?: string;
      allowNull?: boolean;
      allowZero?: boolean;
      allowNegative?: boolean;
      min?: number;
      max?: number;
      integerOnly?: boolean;
    } = {}
  ): number {
    const {
      fieldName = 'value',
      allowNull = false,
      allowZero = true,
      allowNegative = false,
      min,
      max,
      integerOnly = false,
    } = options;

    if (val === null || val === undefined || val === '') {
      if (allowNull) return 0;
      throw new NumericValidationError(`Input for "${fieldName}" is required and cannot be empty`, fieldName, val);
    }

    const num = typeof val === 'number' ? val : Number(val);

    if (isNaN(num)) {
      throw new NumericValidationError(`Input for "${fieldName}" must be a valid number (received NaN/non-numeric: "${val}")`, fieldName, val);
    }

    if (!isFinite(num)) {
      throw new NumericValidationError(`Input for "${fieldName}" must be finite (received Infinity)`, fieldName, val);
    }

    if (!allowZero && num === 0) {
      throw new NumericValidationError(`Input for "${fieldName}" cannot be zero`, fieldName, num);
    }

    if (!allowNegative && num < 0) {
      throw new NumericValidationError(`Input for "${fieldName}" cannot be negative (received ${num})`, fieldName, num);
    }

    if (min !== undefined && num < min) {
      throw new NumericValidationError(`Input for "${fieldName}" must be >= ${min} (received ${num})`, fieldName, num);
    }

    if (max !== undefined && num > max) {
      throw new NumericValidationError(`Input for "${fieldName}" must be <= ${max} (received ${num})`, fieldName, num);
    }

    if (integerOnly && !Number.isInteger(num)) {
      throw new NumericValidationError(`Input for "${fieldName}" must be an integer (received ${num})`, fieldName, num);
    }

    return num;
  }

  /**
   * Apply precision policy to a raw calculated number.
   */
  public static applyPolicy(val: number, policy: PrecisionPolicy = 'DECIMAL_2'): number {
    if (isNaN(val) || !isFinite(val)) return 0;
    const dec = new Decimal(val);

    switch (policy) {
      case 'EXACT_DECIMAL':
        return dec.toNumber();
      case 'DECIMAL_4':
        return dec.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
      case 'DECIMAL_2':
        return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      case 'INTEGER_ROUND':
        return dec.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
      case 'INTEGER_CEIL':
        return dec.ceil().toNumber();
      default:
        return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    }
  }

  /**
   * Exact multiplication using Decimal.js (no floating point drift)
   */
  public static multiply(...values: number[]): number {
    if (values.length === 0) return 0;
    let res = new Decimal(values[0]);
    for (let i = 1; i < values.length; i++) {
      res = res.times(new Decimal(values[i]));
    }
    return res.toNumber();
  }

  /**
   * Exact addition using Decimal.js
   */
  public static add(...values: number[]): number {
    let res = new Decimal(0);
    for (const val of values) {
      res = res.plus(new Decimal(val));
    }
    return res.toNumber();
  }

  /**
   * Exact subtraction (a - b)
   */
  public static subtract(a: number, b: number): number {
    return new Decimal(a).minus(new Decimal(b)).toNumber();
  }

  /**
   * Exact division with zero division guard
   */
  public static divide(numerator: number, denominator: number): number {
    if (denominator === 0) {
      throw new NumericValidationError('Division by zero', 'denominator', 0);
    }
    return new Decimal(numerator).dividedBy(new Decimal(denominator)).toNumber();
  }

  /**
   * Safe bridge to legacy SafeDecimalEngine for backward compatibility.
   */
  public static legacy(): typeof SafeDecimalEngine {
    return SafeDecimalEngine;
  }
}
