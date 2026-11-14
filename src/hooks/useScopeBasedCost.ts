/**
 * useScopeBasedCost — React hook for scope-based cost calculation
 *
 * Bridges calculator outputs with CostPolicyEngine.
 * Returns either:
 *   - A real cost breakdown (if AHSP mapping exists and prices resolve)
 *   - A missing-price state (if prices are unavailable)
 *   - A missing-AHSP state (if calculator has no mapping yet)
 *
 * This hook is designed to be dropped into QtoCalculatorView
 * without disrupting the existing priceBreakdown logic.
 */

import { useMemo } from 'react';
import { ScopeBasedCostCalculator, WeirGeometryInput } from '../engine/cost/scope/scopeBasedCostCalculator';
import { BINA_MARGA_AHSP_2026_OFFICIAL } from '../data/nationalCostDatabase/binaMarga2026Adapter';
import { PriceContext } from '../engine/pricing/contracts/types';
import { CostEngineResult } from '../engine/cost/policy/costPolicyEngine';

export interface ScopeCostHookResult {
  /** Whether this calculator has a scope-based mapping. */
  hasMapping: boolean;
  /** The cost result from the engine (null if no mapping or error). */
  costResult: CostEngineResult | null;
  /** Human-readable status for the UI. */
  status: 'RESOLVED' | 'PARTIAL' | 'PRICE_MISSING' | 'AHSP_MISSING' | 'NO_MAPPING' | 'ERROR';
  /** Summary numbers for quick display. */
  summary: {
    directCost: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    grandTotal: number;
  } | null;
  /** List of line items with AHSP names and costs. */
  lineItems: {
    name: string;
    ahspCode: string;
    ahspName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    warnings: string[];
  }[];
  /** Missing price details for the "HARGA BELUM TERSEDIA" panel. */
  missingPrices: { itemName: string; componentName: string; type: string }[];
  /** Missing AHSP details. */
  missingAHSPs: { workItem: string; ahspCode?: string }[];
  /**
   * D-63 (Batch B) — mapping coverage. `lineItems` counts only the work
   * items that resolved to a real BM AHSP item; the scope breakdown may
   * contain more work items whose scope has no BM master equivalent
   * (formwork, soil disposal, dewatering, cofferdam, SMKK). The banner
   * must show "N dari M" and name the unmapped ones — never claim the
   * resolved count is the whole scope.
   */
  totalScopeItems: number;
  /** Names of scope work items with no AHSP code (honest unmapped state). */
  unmappedWorkItems: string[];
  /** Audit trail strings. */
  auditTrail: string[];
  /** Error message if something went wrong. */
  error?: string;
}

const calculator = new ScopeBasedCostCalculator();

/**
 * Map calculator inputs to WeirGeometryInput if the calculator is a weir pack.
 */
function mapToWeirGeometry(
  calculatorId: string,
  inputs: Record<string, number>
): WeirGeometryInput | null {
  // ScopeBasedCostCalculator models the complete structural weir breakdown,
  // which strictly applies to weir.body. Sub-elements (gate, apron, stilling basin, etc.)
  // have their own dedicated AHSP and price estimation models.
  if (calculatorId !== 'weir.body') return null;

  return {
    weirLength: inputs.weirLength ?? inputs.length ?? 0,
    weirHeight: inputs.weirHeight ?? inputs.height ?? 0,
    crestWidth: inputs.crestWidth ?? 2,
    baseWidth: inputs.baseWidth ?? 6,
    crestArcLength: inputs.crestArcLength,
    skinThickness: inputs.skinThickness,
    apronWidth: inputs.apronWidth ?? inputs.width,
    apronLength: inputs.apronLength,
    apronThickness: inputs.apronThickness ?? inputs.thickness,
    basinWidth: inputs.basinWidth,
    basinLength: inputs.basinLength,
    basinSlabThickness: inputs.basinSlabThickness ?? inputs.slabThickness,
    endSillHeight: inputs.endSillHeight,
  };
}

/**
 * Pure function version — can be called from tests, scripts, or server
 * without a React runtime.
 */
export function computeScopeBasedCost(
  calculatorId: string,
  inputs: Record<string, number>,
  priceContext: PriceContext,
  projectId: string
): ScopeCostHookResult {
  const geo = mapToWeirGeometry(calculatorId, inputs);

  if (!geo) {
    return {
      hasMapping: false,
      costResult: null,
      status: 'NO_MAPPING',
      summary: null,
      lineItems: [],
      missingPrices: [],
      missingAHSPs: [],
      totalScopeItems: 0,
      unmappedWorkItems: [],
      auditTrail: [],
    };
  }

  try {
    const scopeResult = calculator.calculateWeir(
      geo,
      BINA_MARGA_AHSP_2026_OFFICIAL,
      priceContext,
      projectId
    );

    const { costResult } = scopeResult;

    const status: ScopeCostHookResult['status'] =
      costResult.status === 'COMPLETE' ? 'RESOLVED'
        : costResult.status === 'PRICE_MISSING' ? 'PRICE_MISSING'
          : costResult.status === 'AHSP_MISSING' ? 'AHSP_MISSING'
            : costResult.status === 'PARTIAL' ? 'PARTIAL'
              : 'ERROR';

    // D-63: coverage counts come from the scope breakdown (all work items),
    // not from the engine result (resolved items only).
    const allScopeWorkItems = scopeResult.scopes.flatMap((s) => s.workItems);
    const unmappedWorkItems = allScopeWorkItems
      .filter((w) => !w.ahspCode)
      .map((w) => w.name);

    return {
      hasMapping: true,
      costResult,
      status,
      summary: costResult.summary,
      lineItems: costResult.lineItems.map((li) => ({
        name: li.workItem.name,
        ahspCode: li.ahspCode,
        ahspName: li.ahspName,
        quantity: li.workItem.quantity,
        unit: li.workItem.unit,
        unitPrice: li.unitPrice,
        totalPrice: li.totalPrice,
        warnings: li.warnings,
      })),
      missingPrices: costResult.missingPrices,
      missingAHSPs: costResult.missingAHSPs,
      totalScopeItems: allScopeWorkItems.length,
      unmappedWorkItems,
      auditTrail: costResult.auditTrail,
    };
  } catch (err: any) {
    return {
      hasMapping: true,
      costResult: null,
      status: 'ERROR',
      summary: null,
      lineItems: [],
      missingPrices: [],
      missingAHSPs: [],
      totalScopeItems: 0,
      unmappedWorkItems: [],
      auditTrail: [],
      error: err.message || 'Unknown error in scope-based cost calculation',
    };
  }
}

/** React hook wrapper — delegates to the pure function. */
export function useScopeBasedCost(
  calculatorId: string,
  inputs: Record<string, number>,
  priceContext: PriceContext,
  projectId: string
): ScopeCostHookResult {
  return useMemo(
    () => computeScopeBasedCost(calculatorId, inputs, priceContext, projectId),
    [calculatorId, inputs, priceContext, projectId]
  );
}
