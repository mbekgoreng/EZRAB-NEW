/**
 * EZRAB — CANONICAL DETERMINISTIC COST ENGINE
 * ============================================
 * Phase 12: Deterministic Arithmetic & Complete Cost Traceability.
 *
 * Strict Principles:
 * 1. AI is STRICTLY FORBIDDEN from calculating final costs.
 * 2. componentCost = coefficient × componentUnitPrice
 * 3. AHSP = SUM(componentCost) + Overhead & Profit
 * 4. workTotal = volume × AHSPUnitPrice
 * 5. Every single rupiah must answer:
 *    "Angka Rp X ini berasal dari mana?"
 *    AHSP -> component -> coefficient -> unit price -> volume -> calculation.
 */

export interface ComponentCalculationInput {
  itemCode: string;
  itemName: string;
  category: 'material' | 'labor' | 'equipment';
  unit: string;
  coefficient: number;
  unitPrice: number | null;
  source?: string;
  sourceDocument?: string;
}

export interface ComponentCalculationResult {
  itemCode: string;
  itemName: string;
  category: 'material' | 'labor' | 'equipment';
  unit: string;
  coefficient: number;
  unitPrice: number | null;
  cost: number | null;
  isPriced: boolean;
  arithmeticTrace: string; // e.g. "1.0500 kg x Rp 14.500/kg = Rp 15.225"
}

export interface AhspBreakdownResult {
  ahspCode: string;
  ahspName: string;
  unit: string;
  components: ComponentCalculationResult[];
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  directCost: number;
  overheadPercent: number;
  overheadCost: number;
  unitPrice: number; // Final HSP
  isComplete: boolean;
  missingComponentCodes: string[];
  traceSummary: string;
}

export interface WorkTotalCalculationResult {
  itemTitle: string;
  volume: number;
  unit: string;
  ahspUnitPrice: number;
  totalCost: number;
  arithmeticTrace: string; // e.g. "50.10 m³ x Rp 928.002/m³ = Rp 46.492.900"
}

export class CanonicalCostEngine {
  private static instance: CanonicalCostEngine;

  private constructor() {}

  public static getInstance(): CanonicalCostEngine {
    if (!CanonicalCostEngine.instance) {
      CanonicalCostEngine.instance = new CanonicalCostEngine();
    }
    return CanonicalCostEngine.instance;
  }

  /**
   * Deterministic component cost: coefficient * unitPrice
   */
  public calculateComponentCost(coefficient: number, unitPrice: number | null): number | null {
    if (unitPrice === null || isNaN(unitPrice)) return null;
    if (isNaN(coefficient)) return null;
    return Math.round(coefficient * unitPrice * 100) / 100;
  }

  /**
   * Deterministic AHSP Unit Price: SUM(material) + SUM(labor) + SUM(equipment) + overhead
   */
  public calculateAhsp(
    ahspCode: string,
    ahspName: string,
    unit: string,
    rawComponents: ComponentCalculationInput[],
    overheadPercent: number = 0.10 // Default PUPR 10-15%
  ): AhspBreakdownResult {
    let materialCost = 0;
    let laborCost = 0;
    let equipmentCost = 0;
    let isComplete = true;
    const missingComponentCodes: string[] = [];
    const calculatedComponents: ComponentCalculationResult[] = [];

    for (const comp of rawComponents) {
      const lineCost = this.calculateComponentCost(comp.coefficient, comp.unitPrice);
      const isPriced = lineCost !== null && lineCost >= 0;

      if (!isPriced) {
        isComplete = false;
        missingComponentCodes.push(comp.itemCode || comp.itemName);
      }

      const costValue = lineCost ?? 0;
      if (comp.category === 'material') materialCost += costValue;
      else if (comp.category === 'labor') laborCost += costValue;
      else if (comp.category === 'equipment') equipmentCost += costValue;

      const trace = isPriced
        ? `${comp.coefficient.toFixed(4)} ${comp.unit} × Rp ${(comp.unitPrice || 0).toLocaleString('id-ID')}/${comp.unit} = Rp ${costValue.toLocaleString('id-ID')}`
        : `${comp.coefficient.toFixed(4)} ${comp.unit} × [HARGA BELUM TERSEDIA]`;

      calculatedComponents.push({
        itemCode: comp.itemCode,
        itemName: comp.itemName,
        category: comp.category,
        unit: comp.unit,
        coefficient: comp.coefficient,
        unitPrice: comp.unitPrice,
        cost: lineCost,
        isPriced,
        arithmeticTrace: trace,
      });
    }

    materialCost = Math.round(materialCost);
    laborCost = Math.round(laborCost);
    equipmentCost = Math.round(equipmentCost);
    const directCost = materialCost + laborCost + equipmentCost;

    const overheadCost = Math.round(directCost * overheadPercent);
    const unitPrice = directCost + overheadCost;

    const traceSummary = `Direct Cost (Bahan Rp ${materialCost.toLocaleString('id-ID')} + Upah Rp ${laborCost.toLocaleString('id-ID')} + Alat Rp ${equipmentCost.toLocaleString('id-ID')}) = Rp ${directCost.toLocaleString('id-ID')}. Overhead ${(overheadPercent * 100).toFixed(0)}% = Rp ${overheadCost.toLocaleString('id-ID')}. Total HSP = Rp ${unitPrice.toLocaleString('id-ID')}/${unit}.`;

    return {
      ahspCode,
      ahspName,
      unit,
      components: calculatedComponents,
      materialCost,
      laborCost,
      equipmentCost,
      directCost,
      overheadPercent,
      overheadCost,
      unitPrice,
      isComplete,
      missingComponentCodes,
      traceSummary,
    };
  }

  /**
   * Deterministic Work Total: volume * ahspUnitPrice
   */
  public calculateWorkTotal(itemTitle: string, volume: number, unit: string, ahspUnitPrice: number): WorkTotalCalculationResult {
    const cleanVolume = isNaN(volume) ? 0 : volume;
    const cleanPrice = isNaN(ahspUnitPrice) ? 0 : ahspUnitPrice;
    const totalCost = Math.round(cleanVolume * cleanPrice);

    return {
      itemTitle,
      volume: cleanVolume,
      unit,
      ahspUnitPrice: cleanPrice,
      totalCost,
      arithmeticTrace: `${cleanVolume.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${unit} × Rp ${cleanPrice.toLocaleString('id-ID')}/${unit} = Rp ${totalCost.toLocaleString('id-ID')}`,
    };
  }
}

export const canonicalCostEngine = CanonicalCostEngine.getInstance();
