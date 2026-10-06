/**
 * CostPolicyEngine — Centralized cost calculation for EZRAB
 *
 * Replaces the 5 parallel ad-hoc price systems with one deterministic,
 * auditable chain:
 *
 *   Work Item → AHSP Lookup → Component Price Resolution →
 *   Direct Cost → Overhead → Profit → Tax → Grand Total
 *
 * Principles:
 * - NO hardcoded prices.
 * - NO fallback constants.
 * - If a price is missing, the engine returns PRICE_NOT_FOUND with details.
 * - All calculations are deterministic and produce an audit trail.
 */

import { CostCompositionEngine } from '../composition/costCompositionEngine';
import { CostCompositionResult, CostCompositionInput } from '../contracts/types';
import { AHSPDefinition } from '../../ahsp/contracts/types';
import { PriceContext } from '../../pricing/contracts/types';
import { PriceResolver } from '../../pricing/resolver/priceResolver';
import { SafeDecimalEngine } from '../../safeDecimalEngine';
import { resolvePolicyValue } from './costPolicyDefaults';
import { adaptOfficialToDefinition } from '../../ahsp/adapters/officialToDefinitionAdapter';
import { OfficialAHSPItem } from '../../../data/nationalCostDatabase/binaMargaOfficialTypes';

export interface CostPolicy {
  overheadPercent: number;
  profitPercent: number;
  taxPercent: number;
  contingencyPercent: number;
}

export interface WorkItem {
  name: string;
  quantity: number;
  unit: string;
  ahspCode?: string;
}

export interface CostLineItem {
  workItem: WorkItem;
  ahspCode: string;
  ahspName: string;
  composition: CostCompositionResult;
  directCost: number;
  unitPrice: number; // direct cost per unit
  totalPrice: number; // quantity * unitPrice
  warnings: string[];
}

export interface CostEngineResult {
  status: 'COMPLETE' | 'PARTIAL' | 'PRICE_MISSING' | 'AHSP_MISSING' | 'INVALID_INPUT';
  lineItems: CostLineItem[];
  summary: {
    directCost: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    contingencyAmount: number;
    grandTotal: number;
  };
  policy: CostPolicy;
  auditTrail: string[];
  missingPrices: { itemName: string; componentName: string; type: string }[];
  missingAHSPs: { workItem: string; ahspCode?: string }[];
}

export class CostPolicyEngine {
  private compositionEngine: CostCompositionEngine;
  private priceResolver: PriceResolver;

  constructor(priceResolver?: PriceResolver) {
    this.priceResolver = priceResolver || new PriceResolver();
    this.compositionEngine = new CostCompositionEngine(this.priceResolver);
  }

  /**
   * Calculate cost for a list of work items using the official AHSP dataset.
   *
   * @param workItems   Geometry outputs mapped to construction work items
   * @param ahspItems   Official AHSP items (e.g. BINA_MARGA_AHSP_2026_OFFICIAL)
   * @param policy      Overhead / profit / tax / contingency percentages
   * @param priceContext Regional price resolution context
   * @param projectId   Project identifier for provenance
   */
  calculate(
    workItems: WorkItem[],
    ahspItems: OfficialAHSPItem[],
    policy: Partial<CostPolicy>,
    priceContext: PriceContext,
    projectId: string
  ): CostEngineResult {
    const resolvedPolicy: CostPolicy = {
      overheadPercent: policy.overheadPercent ?? resolvePolicyValue('overheadPercent', policy.overheadPercent, 'CostPolicyEngine'),
      profitPercent: policy.profitPercent ?? resolvePolicyValue('profitPercent', policy.profitPercent, 'CostPolicyEngine'),
      taxPercent: policy.taxPercent ?? resolvePolicyValue('taxPercent', policy.taxPercent, 'CostPolicyEngine'),
      contingencyPercent: policy.contingencyPercent ?? resolvePolicyValue('contingencyPercent', policy.contingencyPercent, 'CostPolicyEngine'),
    };

    const lineItems: CostLineItem[] = [];
    const auditTrail: string[] = [];
    const missingPrices: { itemName: string; componentName: string; type: string }[] = [];
    const missingAHSPs: { workItem: string; ahspCode?: string }[] = [];

    let totalDirectCost = 0;
    let hasMissingPrice = false;
    let hasMissingAHSP = false;

    // Index AHSP by normalized code for O(1) lookup
    const ahspByCode = new Map<string, OfficialAHSPItem>();
    for (const item of ahspItems) {
      ahspByCode.set(item.codeNormalized, item);
      ahspByCode.set(item.code, item);
    }

    for (const wi of workItems) {
      if (wi.quantity < 0 || !Number.isFinite(wi.quantity)) {
        auditTrail.push(`INVALID: ${wi.name} quantity=${wi.quantity}`);
        continue;
      }

      const ahspCode = wi.ahspCode || this.inferAHSPCode(wi.name);
      const officialItem = ahspCode ? ahspByCode.get(ahspCode) : undefined;

      if (!officialItem) {
        hasMissingAHSP = true;
        missingAHSPs.push({ workItem: wi.name, ahspCode });
        auditTrail.push(`AHSP_MISSING: ${wi.name} → code=${ahspCode || '(inferred-none)'}`);
        continue;
      }

      const adapterResult = adaptOfficialToDefinition(officialItem);
      if (adapterResult.error || !adapterResult.definition) {
        auditTrail.push(`AHSP_UNREADABLE: ${wi.name} → ${officialItem.code} — ${adapterResult.error}`);
        continue;
      }

      if (adapterResult.warning) {
        auditTrail.push(`WARNING: ${adapterResult.warning}`);
      }

      const ahspDef = adapterResult.definition;

      const input: CostCompositionInput = {
        quantity: wi.quantity,
        quantityUnit: wi.unit,
        ahspDefinition: ahspDef,
        priceContext,
      };

      const composition = this.compositionEngine.compose(input);

      if (composition.status === 'PRICE_MISSING') {
        hasMissingPrice = true;
        for (const w of composition.warnings) {
          const match = w.match(/Price not found for (\w+) component "([^"]+)"/);
          if (match) {
            missingPrices.push({
              itemName: wi.name,
              componentName: match[2],
              type: match[1],
            });
          }
        }
      }

      const directCost = composition.directCost;
      totalDirectCost += directCost;

      lineItems.push({
        workItem: wi,
        ahspCode: ahspDef.code,
        ahspName: ahspDef.name,
        composition,
        directCost,
        unitPrice: composition.unitCost,
        totalPrice: directCost,
        warnings: composition.warnings,
      });

      auditTrail.push(
        `COMPOSED: ${wi.name} | ${ahspDef.code} | qty=${wi.quantity} ${wi.unit} | ` +
        `direct=${directCost} | status=${composition.status}`
      );
    }

    // Apply policy
    const overheadAmount = Math.round(totalDirectCost * (resolvedPolicy.overheadPercent / 100));
    const profitAmount = Math.round(totalDirectCost * (resolvedPolicy.profitPercent / 100));
    const contingencyAmount = Math.round(totalDirectCost * (resolvedPolicy.contingencyPercent / 100));
    const subtotalBeforeTax = totalDirectCost + overheadAmount + profitAmount + contingencyAmount;
    const taxAmount = Math.round(subtotalBeforeTax * (resolvedPolicy.taxPercent / 100));
    const grandTotal = subtotalBeforeTax + taxAmount;

    auditTrail.push(
      `SUMMARY: direct=${totalDirectCost} + OH(${resolvedPolicy.overheadPercent}%)=${overheadAmount} + ` +
      `profit(${resolvedPolicy.profitPercent}%)=${profitAmount} + contingency(${resolvedPolicy.contingencyPercent}%)=${contingencyAmount} + ` +
      `tax(${resolvedPolicy.taxPercent}%)=${taxAmount} = ${grandTotal}`
    );

    let status: CostEngineResult['status'] = 'COMPLETE';
    if (hasMissingAHSP) status = 'AHSP_MISSING';
    if (hasMissingPrice) status = hasMissingAHSP ? 'PARTIAL' : 'PRICE_MISSING';

    return {
      status,
      lineItems,
      summary: {
        directCost: totalDirectCost,
        overheadAmount,
        profitAmount,
        taxAmount,
        contingencyAmount,
        grandTotal,
      },
      policy: resolvedPolicy,
      auditTrail,
      missingPrices,
      missingAHSPs,
    };
  }

  /**
   * Very naive AHSP code inference from work item name.
   * This is a placeholder — real mapping should come from calculator registry.
   */
  private inferAHSPCode(name: string): string | undefined {
    const lower = name.toLowerCase();
    if (lower.includes('galian') && lower.includes('drainase')) return '2.1.(1)';
    if (lower.includes('urugan') && lower.includes('pasir')) return '2.1.(2)';
    if (lower.includes('beton') && lower.includes('k-225')) return '3.1.(1)';
    // … more mappings should be added from calculator registry
    return undefined;
  }
}
