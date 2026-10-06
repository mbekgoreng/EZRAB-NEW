/**
 * EZRAB CENTRAL DETERMINISTIC COST ENGINE
 *
 * Combines:
 * Quantity + AHSP Components + Resolved Prices + Configurable Project Settings
 *
 * Enforces:
 * - laborCost = SUM(coefficient * resolvedLaborPrice)
 * - materialCost = SUM(coefficient * resolvedMaterialPrice)
 * - equipmentCost = SUM(coefficient * resolvedEquipmentPrice)
 * - directCost = laborCost + materialCost + equipmentCost
 * - overhead & profit configurable (no hardcoded constants)
 * - tax (PPN) configurable (optional)
 * - status = INCOMPLETE if any mandatory component price is missing
 * - zero cost strictly if actual calculation == 0, never on missing data
 * - deterministic textual explanation ("Quantity x UnitPrice = Total")
 */

import { SafeDecimalEngine } from '../safeDecimalEngine';
import { AHSPComponentDefinition, AHSPDefinition } from '../ahsp/contracts/types';
import { PriceResolutionOutput } from '../pricing/resolver/advancedPriceResolutionEngine';
import { UnitEngine } from '../calculatorCore/unit/unitEngine';

export interface ProjectCostPolicySettings {
  overheadPercent?: number;      // e.g., 5-10%
  profitPercent?: number;        // e.g., 5-10%
  generalProfitPercent?: number; // combined O&P e.g., 10-15%
  taxPercent: number;           // e.g., 11% (PPN)
  includeTax: boolean;          // if false, tax is 0
  contingencyPercent?: number;  // optional contingency
}

export interface ComponentCostLine {
  type: 'labor' | 'material' | 'equipment';
  itemCode: string;
  itemName: string;
  unit: string;
  coefficient: number;
  unitPrice: number | null;
  totalCost: number | null;
  status: 'RESOLVED' | 'MISSING_PRICE' | 'ZERO_PRICE_CONFIRMED';
  source?: string;
}

export interface WorkItemCostInput {
  workItemName: string;
  quantity: number;
  unit: string;
  ahsp: AHSPDefinition;
  resolvedPrices: Map<string, PriceResolutionOutput>; // keyed by component itemCode or itemName
}

export interface WorkItemCostOutput {
  status: 'COMPLETE' | 'INCOMPLETE' | 'ZERO_COST';
  workItemName: string;
  quantity: number;
  unit: string;
  ahspCode: string;
  ahspName: string;
  components: ComponentCostLine[];
  breakdown: {
    laborCost: number;
    materialCost: number;
    equipmentCost: number;
    directCost: number;
    overheadAmount: number;
    profitAmount: number;
    subtotalBeforeTax: number;
    taxAmount: number;
    unitPrice: number;
    totalCost: number;
  };
  missingComponents: string[];
  explanation: string;
  auditTrail: string[];
}

export class CentralDeterministicCostEngine {
  /**
   * Calculate cost for a single work item deterministically.
   */
  public static calculateWorkItem(
    input: WorkItemCostInput,
    settings: ProjectCostPolicySettings
  ): WorkItemCostOutput {
    if (!input.ahsp) {
      return {
        status: 'INCOMPLETE',
        workItemName: input.workItemName,
        quantity: input.quantity,
        unit: input.unit,
        ahspCode: 'MISSING_AHSP',
        ahspName: 'Definisi AHSP Tidak Ditemukan',
        components: [],
        breakdown: {
          laborCost: 0,
          materialCost: 0,
          equipmentCost: 0,
          directCost: 0,
          overheadAmount: 0,
          profitAmount: 0,
          subtotalBeforeTax: 0,
          taxAmount: 0,
          unitPrice: 0,
          totalCost: 0,
        },
        missingComponents: ['AHSP Definition'],
        explanation: `Biaya tidak dapat dihitung karena definisi AHSP untuk "${input.workItemName}" tidak ditemukan.`,
        auditTrail: ['[MISSING_AHSP] Definisi AHSP tidak ditemukan'],
      };
    }

    const auditTrail: string[] = [];
    const missingComponents: string[] = [];
    const componentLines: ComponentCostLine[] = [];

    let laborSubtotal = 0;
    let materialSubtotal = 0;
    let equipmentSubtotal = 0;
    let hasMissingPrice = false;

    auditTrail.push(`START CALCULATION: ${input.workItemName} | Qty: ${input.quantity} ${input.unit} | AHSP: ${input.ahsp.code}`);

    const allComponents: AHSPComponentDefinition[] = [
      ...(input.ahsp.laborComponents || []),
      ...(input.ahsp.materialComponents || []),
      ...(input.ahsp.equipmentComponents || []),
    ];

    for (const comp of allComponents) {
      const resolved = input.resolvedPrices.get(comp.itemCode) ||
                       input.resolvedPrices.get(comp.itemName.toLowerCase()) ||
                       input.resolvedPrices.get(comp.itemName);

      if (!resolved || resolved.price === null || resolved.status === 'MISSING') {
        hasMissingPrice = true;
        missingComponents.push(`${comp.itemName} (${comp.type})`);
        componentLines.push({
          type: comp.type,
          itemCode: comp.itemCode,
          itemName: comp.itemName,
          unit: comp.unit,
          coefficient: comp.coefficient,
          unitPrice: null,
          totalCost: null,
          status: 'MISSING_PRICE',
        });
        auditTrail.push(`  [MISSING] ${comp.itemName} (${comp.itemCode}): No price resolved`);
      } else {
        let effectivePrice = resolved.price;
        // Unit conversion between component required unit and resolved price unit
        if (resolved.unit && comp.unit && resolved.unit.toLowerCase() !== comp.unit.toLowerCase()) {
          if (UnitEngine.areCompatible(comp.unit, resolved.unit)) {
            const conversionRatio = UnitEngine.convert(1, comp.unit, resolved.unit);
            effectivePrice = SafeDecimalEngine.safeMultiply(resolved.price, conversionRatio);
            auditTrail.push(`  [UNIT_CONVERSION] ${comp.itemName}: Converted price from Rp ${resolved.price}/${resolved.unit} to Rp ${effectivePrice}/${comp.unit} (ratio: ${conversionRatio})`);
          } else {
            hasMissingPrice = true;
            missingComponents.push(`${comp.itemName} (Incompatible Unit: ${comp.unit} vs ${resolved.unit})`);
            componentLines.push({
              type: comp.type,
              itemCode: comp.itemCode,
              itemName: comp.itemName,
              unit: comp.unit,
              coefficient: comp.coefficient,
              unitPrice: null,
              totalCost: null,
              status: 'MISSING_PRICE',
            });
            auditTrail.push(`  [UNIT_CONVERSION_ERROR] ${comp.itemName}: Incompatible units ${comp.unit} and ${resolved.unit}`);
            continue;
          }
        }

        const lineTotal = SafeDecimalEngine.safeMultiply(comp.coefficient, effectivePrice);
        if (comp.type === 'labor') laborSubtotal += lineTotal;
        else if (comp.type === 'material') materialSubtotal += lineTotal;
        else if (comp.type === 'equipment') equipmentSubtotal += lineTotal;

        componentLines.push({
          type: comp.type,
          itemCode: comp.itemCode,
          itemName: comp.itemName,
          unit: comp.unit,
          coefficient: comp.coefficient,
          unitPrice: effectivePrice,
          totalCost: lineTotal,
          status: effectivePrice === 0 ? 'ZERO_PRICE_CONFIRMED' : 'RESOLVED',
          source: resolved.provenance?.source,
        });
        auditTrail.push(`  [RESOLVED] ${comp.itemName}: coeff ${comp.coefficient} x Rp ${effectivePrice} = Rp ${lineTotal}`);
      }
    }

    if (hasMissingPrice) {
      auditTrail.push(`END CALCULATION: Status INCOMPLETE due to ${missingComponents.length} missing prices.`);
      return {
        status: 'INCOMPLETE',
        workItemName: input.workItemName,
        quantity: input.quantity,
        unit: input.unit,
        ahspCode: input.ahsp.code,
        ahspName: input.ahsp.name,
        components: componentLines,
        breakdown: {
          laborCost: laborSubtotal,
          materialCost: materialSubtotal,
          equipmentCost: equipmentSubtotal,
          directCost: laborSubtotal + materialSubtotal + equipmentSubtotal,
          overheadAmount: 0,
          profitAmount: 0,
          subtotalBeforeTax: 0,
          taxAmount: 0,
          unitPrice: 0,
          totalCost: 0,
        },
        missingComponents,
        explanation: `Biaya tidak dapat difinalisasi karena harga untuk ${missingComponents.join(', ')} belum tersedia.`,
        auditTrail,
      };
    }

    // Direct Cost
    const directCost = laborSubtotal + materialSubtotal + equipmentSubtotal;

    // Configurable Overhead & Profit (supports overheadPercent + profitPercent OR generalProfitPercent)
    let overheadAmount = 0;
    let profitAmount = 0;
    const ohPct = settings.overheadPercent ?? 0;
    const profPct = settings.profitPercent ?? 0;
    const genProfPct = settings.generalProfitPercent;

    if (genProfPct !== undefined) {
      profitAmount = Math.round(directCost * (genProfPct / 100));
    } else {
      overheadAmount = Math.round(directCost * (ohPct / 100));
      profitAmount = Math.round(directCost * (profPct / 100));
    }

    const subtotalBeforeTax = directCost + overheadAmount + profitAmount;

    // Configurable Tax (PPN)
    const taxAmount = settings.includeTax
      ? Math.round(subtotalBeforeTax * (settings.taxPercent / 100))
      : 0;

    // Unit Price (Direct + Overhead + Profit + Tax if included per unit)
    const unitPrice = subtotalBeforeTax + taxAmount;

    // Total Cost
    const totalCost = SafeDecimalEngine.safeMultiply(input.quantity, unitPrice);

    const isZeroCost = input.quantity === 0 || directCost === 0;

    const policySummary = genProfPct !== undefined
      ? `General O&P: ${genProfPct}%`
      : `OH: ${ohPct}%, Profit: ${profPct}%`;

    const explanation = `${input.quantity} ${input.unit} x Rp ${unitPrice.toLocaleString('id-ID')}/${input.unit} = Rp ${totalCost.toLocaleString('id-ID')} (Direct: Rp ${directCost.toLocaleString('id-ID')}, ${policySummary}, PPN: ${settings.includeTax ? settings.taxPercent + '%' : '0%'})`;

    auditTrail.push(`DIRECT COST: Rp ${directCost} (Labor: ${laborSubtotal}, Material: ${materialSubtotal}, Equip: ${equipmentSubtotal})`);
    auditTrail.push(`POLICY: OH=${overheadAmount}, Profit=${profitAmount}, Tax=${taxAmount} (${settings.includeTax ? settings.taxPercent : 0}%)`);
    auditTrail.push(`FINAL: UnitPrice=Rp ${unitPrice}, Total=Rp ${totalCost}`);

    return {
      status: isZeroCost ? 'ZERO_COST' : 'COMPLETE',
      workItemName: input.workItemName,
      quantity: input.quantity,
      unit: input.unit,
      ahspCode: input.ahsp.code,
      ahspName: input.ahsp.name,
      components: componentLines,
      breakdown: {
        laborCost: laborSubtotal,
        materialCost: materialSubtotal,
        equipmentCost: equipmentSubtotal,
        directCost,
        overheadAmount,
        profitAmount,
        subtotalBeforeTax,
        taxAmount,
        unitPrice,
        totalCost,
      },
      missingComponents: [],
      explanation,
      auditTrail,
    };
  }
}
