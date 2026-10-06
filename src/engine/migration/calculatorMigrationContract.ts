/**
 * EZRAB CALCULATOR MIGRATION FRAMEWORK
 *
 * Implements the standard calculator contract:
 * - calculateGeometry() : preserves exact existing geometry formula
 * - mapWorkItems()      : outputs standardized work items with scope
 * - resolveAHSP()       : resolves deterministic AHSP definitions
 * - resolvePrices()     : multi-tier price resolution
 * - calculateCost()     : central cost composition
 * - validate()          : integrity & range validation
 * - generateAudit()     : full calculation trail
 *
 * Includes:
 * - Feature Flag: 'legacy' vs 'v2' (default: 'v2')
 * - Regression guard: strictly compares oldQuantity vs newQuantity (BLOCKS if differs)
 */

import { SafeDecimalEngine } from '../safeDecimalEngine';
import { AHSPDefinition } from '../ahsp/contracts/types';
import { CentralDeterministicCostEngine, ProjectCostPolicySettings, WorkItemCostOutput } from '../cost/centralDeterministicCostEngine';
import { PriceResolutionOutput } from '../pricing/resolver/advancedPriceResolutionEngine';

export type PricingEngineVersion = 'legacy' | 'v2';

export interface StandardWorkItem {
  id: string;
  name: string;
  scope: string;
  quantity: number;
  unit: string;
  targetAhspCode: string;
}

export interface StandardGeometryResult {
  primaryQuantity: number;
  primaryUnit: string;
  breakdown: Record<string, number>;
  formulaSteps: string[];
}

export interface StandardCalculatorContract<TInput = any> {
  id: string;
  title: string;
  batch: 1 | 2 | 3 | 4 | 5;
  calculateGeometry(inputs: TInput): StandardGeometryResult;
  mapWorkItems(geometry: StandardGeometryResult, inputs: TInput): StandardWorkItem[];
  resolveAHSP?(workItems: StandardWorkItem[], ahspMap: Map<string, AHSPDefinition>): Map<string, AHSPDefinition>;
  resolvePrices?(ahspMap: Map<string, AHSPDefinition>, pricesMap: Map<string, PriceResolutionOutput>): Map<string, PriceResolutionOutput>;
  calculateCost?(
    workItems: StandardWorkItem[],
    ahspMap: Map<string, AHSPDefinition>,
    pricesMap: Map<string, PriceResolutionOutput>,
    settings: ProjectCostPolicySettings
  ): WorkItemCostOutput[];
  validate?(geometry: StandardGeometryResult, costs: WorkItemCostOutput[]): { valid: boolean; errors: string[]; warnings: string[] };
  generateAudit?(geometry: StandardGeometryResult, costs: WorkItemCostOutput[], regressionPass: boolean): string[];
}

/**
 * Base abstract class providing default implementations for the contract methods
 */
export abstract class BaseMigratedCalculator<TInput = any>
  implements StandardCalculatorContract<TInput> {
  abstract id: string;
  abstract title: string;
  abstract batch: 1 | 2 | 3 | 4 | 5;

  abstract calculateGeometry(inputs: TInput): StandardGeometryResult;
  abstract mapWorkItems(geometry: StandardGeometryResult, inputs: TInput): StandardWorkItem[];

  public resolveAHSP(workItems: StandardWorkItem[], ahspMap: Map<string, AHSPDefinition>): Map<string, AHSPDefinition> {
    const resolved = new Map<string, AHSPDefinition>();
    for (const wi of workItems) {
      const def = ahspMap.get(wi.targetAhspCode);
      if (def) resolved.set(wi.targetAhspCode, def);
    }
    return resolved;
  }

  public resolvePrices(
    ahspMap: Map<string, AHSPDefinition>,
    pricesMap: Map<string, PriceResolutionOutput>
  ): Map<string, PriceResolutionOutput> {
    return pricesMap;
  }

  public calculateCost(
    workItems: StandardWorkItem[],
    ahspMap: Map<string, AHSPDefinition>,
    pricesMap: Map<string, PriceResolutionOutput>,
    settings: ProjectCostPolicySettings
  ): WorkItemCostOutput[] {
    const outputs: WorkItemCostOutput[] = [];
    for (const wi of workItems) {
      const ahsp = ahspMap.get(wi.targetAhspCode);
      if (!ahsp) continue;
      const costRes = CentralDeterministicCostEngine.calculateWorkItem(
        {
          workItemName: wi.name,
          quantity: wi.quantity,
          unit: wi.unit,
          ahsp,
          resolvedPrices: pricesMap,
        },
        settings
      );
      outputs.push(costRes);
    }
    return outputs;
  }

  public validate(
    geometry: StandardGeometryResult,
    costs: WorkItemCostOutput[]
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (geometry.primaryQuantity < 0) {
      errors.push(`Primary quantity cannot be negative: ${geometry.primaryQuantity}`);
    }

    const incompleteItems = costs.filter((c) => c.status === 'INCOMPLETE');
    if (incompleteItems.length > 0) {
      warnings.push(`${incompleteItems.length} work items have incomplete prices/AHSP`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  public generateAudit(
    geometry: StandardGeometryResult,
    costs: WorkItemCostOutput[],
    regressionPass: boolean
  ): string[] {
    const audit: string[] = [
      `[CALCULATOR CONTRACT AUDIT] ${this.id} (${this.title})`,
      `  Geometry: ${geometry.primaryQuantity} ${geometry.primaryUnit}`,
      `  Regression Check: ${regressionPass ? 'PASS (0 drift)' : 'FAILED'}`,
      `  Work Items: ${costs.length} items calculated`,
    ];
    for (const c of costs) {
      audit.push(`    - ${c.workItemName}: Rp ${c.breakdown.totalCost.toLocaleString('id-ID')} (${c.status})`);
    }
    return audit;
  }
}

export interface CalculatorMigrationOutput {
  engineVersion: PricingEngineVersion;
  geometry: StandardGeometryResult;
  workItems: StandardWorkItem[];
  costs: WorkItemCostOutput[];
  grandTotal: number;
  auditTrail: string[];
  regressionPass: boolean;
  regressionMessage?: string;
}

export class CalculatorMigrationRunner {
  private static defaultEngineVersion: PricingEngineVersion = 'v2';

  public static setDefaultVersion(v: PricingEngineVersion) {
    this.defaultEngineVersion = v;
  }

  public static getDefaultVersion(): PricingEngineVersion {
    return this.defaultEngineVersion;
  }

  /**
   * Run calculator through migration contract with feature-flag and regression guard.
   */
  public static execute<TInput = any>(
    calculator: StandardCalculatorContract<TInput>,
    inputs: TInput,
    legacyCalculatorFn: (inputs: TInput) => { primaryQuantity: number; primaryUnit: string; estimatedTotalCost?: number },
    ahspMap: Map<string, AHSPDefinition>,
    pricesMap: Map<string, PriceResolutionOutput>,
    settings: ProjectCostPolicySettings,
    forcedVersion?: PricingEngineVersion
  ): CalculatorMigrationOutput {
    const version = forcedVersion || this.defaultEngineVersion;

    // 1. Calculate Geometry
    const newGeometry = calculator.calculateGeometry(inputs);

    // 2. Run Legacy for Regression Comparison
    const legacyResult = legacyCalculatorFn(inputs);

    // Strict Regression Check: Quantities must be identical!
    const diff = Math.abs(newGeometry.primaryQuantity - legacyResult.primaryQuantity);
    const regressionPass = diff < 0.0001;

    if (!regressionPass) {
      throw new Error(
        `CRITICAL REGRESSION BLOCKED in ${calculator.id}: ` +
        `New quantity (${newGeometry.primaryQuantity}) does not match legacy quantity (${legacyResult.primaryQuantity}). ` +
        `Migration aborted to protect calculation integrity.`
      );
    }

    // If running in legacy mode, return legacy price
    if (version === 'legacy') {
      return {
        engineVersion: 'legacy',
        geometry: newGeometry,
        workItems: [],
        costs: [],
        grandTotal: legacyResult.estimatedTotalCost || 0,
        auditTrail: ['[LEGACY] Executed using legacy pricing formulas.'],
        regressionPass: true,
      };
    }

    // 3. Map Standardized Work Items
    const workItems = calculator.mapWorkItems(newGeometry, inputs);

    // 4. Resolve AHSP & Prices via Calculator Contract
    const resolvedAhsp = calculator.resolveAHSP ? calculator.resolveAHSP(workItems, ahspMap) : ahspMap;
    const resolvedPrices = calculator.resolvePrices ? calculator.resolvePrices(resolvedAhsp, pricesMap) : pricesMap;

    // 5. Calculate Costs via CentralDeterministicCostEngine
    let costs: WorkItemCostOutput[] = [];
    if (calculator.calculateCost) {
      costs = calculator.calculateCost(workItems, resolvedAhsp, resolvedPrices, settings);
    } else {
      for (const wi of workItems) {
        const ahsp = resolvedAhsp.get(wi.targetAhspCode);
        if (!ahsp) continue;
        const costRes = CentralDeterministicCostEngine.calculateWorkItem(
          {
            workItemName: wi.name,
            quantity: wi.quantity,
            unit: wi.unit,
            ahsp,
            resolvedPrices,
          },
          settings
        );
        costs.push(costRes);
      }
    }

    let grandTotal = 0;
    for (const c of costs) {
      grandTotal += c.breakdown.totalCost;
    }

    // 6. Validate
    const validation = calculator.validate ? calculator.validate(newGeometry, costs) : { valid: true, errors: [], warnings: [] };

    // 7. Generate Audit
    const auditTrail = calculator.generateAudit
      ? calculator.generateAudit(newGeometry, costs, regressionPass)
      : [
          `MIGRATION RUNNER (v2): Calculator ${calculator.id} (${calculator.title})`,
          `REGRESSION GUARD: PASS (Quantity matches legacy: ${newGeometry.primaryQuantity} ${newGeometry.primaryUnit})`,
        ];

    return {
      engineVersion: 'v2',
      geometry: newGeometry,
      workItems,
      costs,
      grandTotal,
      auditTrail,
      regressionPass: true,
    };
  }
}
