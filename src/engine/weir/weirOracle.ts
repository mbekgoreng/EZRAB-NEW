/**
 * EZRAB PHASE 6A — INDEPENDENT ORACLE
 *
 * Calculates expected Weir Body costs INDEPENDENTLY of the production engine.
 * Does NOT import CentralDeterministicCostEngine, WeirCostService, or any
 * production cost module. Uses only raw AHSP coefficients and verified prices.
 *
 * The oracle computes:
 *   expectedDirectCost = SUM(coeff × price) × qty   (per work item)
 *   expectedSmkk = directCost × smkkPercent%
 *   expectedOverhead = directCost × overheadPercent%
 *   expectedProfit = directCost × profitPercent%
 *   expectedTax = (direct + smkk + oh + profit) × taxPercent%
 *   expectedFinal = direct + smkk + oh + profit + tax
 *
 * Tolerance: Rp 0 (or smallest documented rounding tolerance).
 */

import { lookupWeirAhsp } from './weirAhspDatabase';
import { lookupWeirPrice } from './weirPriceDatabase';
import { WeirCostInput } from './weirTypes';

export interface OracleExpectedResult {
  volume: number;
  crossSectionArea: number;
  workItems: {
    name: string;
    ahspCode: string;
    quantity: number;
    unit: string;
    laborCost: number;
    materialCost: number;
    equipmentCost: number;
    directCost: number;
    smkk: number;
    overhead: number;
    profit: number;
    tax: number;
    finalCost: number;
  }[];
  totalDirectCost: number;
  totalLaborCost: number;
  totalMaterialCost: number;
  totalEquipmentCost: number;
  totalSmkk: number;
  totalOverhead: number;
  totalProfit: number;
  totalTax: number;
  totalFinalCost: number;
}

export class WeirIndependentOracle {
  /**
   * Independently calculate the expected cost for the Weir Body golden case.
   * Uses only raw multiplication — no shared cost engine code.
   */
  static calculateExpected(input: WeirCostInput): OracleExpectedResult {
    // ── GEOMETRY (independent calculation) ──────────────────────────────
    const L = input.weirLength;
    const H = input.weirHeight;
    const Wc = input.crestWidth;
    const Wb = input.baseWidth;

    const crossSectionArea = ((Wc + Wb) / 2) * H;
    const volume = crossSectionArea * L;

    // ── WORK ITEMS (independent mapping) ────────────────────────────────
    const ohPct = (input.overheadPercent ?? 5) / 100;
    const profPct = (input.profitPercent ?? 5) / 100;
    const taxPct = (input.taxPercent ?? 11) / 100;
    const smkkPct = (input.smkkPercent ?? 0) / 100;
    const includeTax = input.taxPercent !== undefined ? input.taxPercent > 0 : true;

    const oracleItems: OracleExpectedResult['workItems'] = [];

    // Helper: independently compute cost for one work item
    const computeItem = (
      name: string,
      ahspCode: string,
      quantity: number,
      unit: string,
    ): OracleExpectedResult['workItems'][0] => {
      const ahsp = lookupWeirAhsp(ahspCode);
      if (!ahsp) {
        return {
          name, ahspCode, quantity, unit,
          laborCost: 0, materialCost: 0, equipmentCost: 0,
          directCost: 0, smkk: 0, overhead: 0, profit: 0, tax: 0, finalCost: 0,
        };
      }

      let labor = 0;
      let material = 0;
      let equipment = 0;

      // Labor components
      for (const comp of ahsp.laborComponents) {
        const price = lookupWeirPrice(comp.itemCode);
        if (price) {
          labor += comp.coefficient * price.price;
        }
      }

      // Material components
      for (const comp of ahsp.materialComponents) {
        const price = lookupWeirPrice(comp.itemCode);
        if (price) {
          material += comp.coefficient * price.price;
        }
      }

      // Equipment components
      for (const comp of ahsp.equipmentComponents) {
        const price = lookupWeirPrice(comp.itemCode);
        if (price) {
          equipment += comp.coefficient * price.price;
        }
      }

      // Per-unit direct cost (sum of coefficients × prices)
      const unitDirectCost = labor + material + equipment;

      // Total direct cost = unit direct × quantity
      const directCost = Math.round(unitDirectCost * quantity);

      // SMKK
      const smkk = Math.round(directCost * smkkPct);

      // Overhead
      const overhead = Math.round(directCost * ohPct);

      // Profit
      const profit = Math.round(directCost * profPct);

      // Tax
      const baseForTax = directCost + smkk + overhead + profit;
      const tax = includeTax ? Math.round(baseForTax * taxPct) : 0;

      // Final
      const finalCost = directCost + smkk + overhead + profit + tax;

      return {
        name, ahspCode, quantity, unit,
        laborCost: Math.round(labor * quantity),
        materialCost: Math.round(material * quantity),
        equipmentCost: Math.round(equipment * quantity),
        directCost, smkk, overhead, profit, tax, finalCost,
      };
    };

    // 1. Concrete
    oracleItems.push(computeItem(
      'Beton Siklop K-225 Tubuh Bendung',
      '3.1.(1)',
      volume,
      'm³',
    ));

    // 2. Reinforcement
    if (input.includeReinforcement !== 0) {
      const ratio = input.rebarRatio ?? 85;
      const rebarQty = volume * ratio;
      oracleItems.push(computeItem(
        'Besi Tulangan BJTS 420B',
        'BINA_MARGA_3.2.(1)',
        rebarQty,
        'kg',
      ));
    }

    // 3. Formwork
    if (input.includeFormwork !== 0) {
      const upstreamSlope = Math.sqrt(Math.pow((Wb - Wc) / 2, 2) + Math.pow(H, 2));
      const faceArea = (Wc + upstreamSlope * 2) * L;
      oracleItems.push(computeItem(
        'Bekisting Struktur Bendung',
        'BINA_MARGA_3.3.(1)',
        faceArea,
        'm²',
      ));
    }

    // 4. Joint
    if (input.includeJoint !== 0 && L > 10) {
      const jointCount = Math.floor(L / 12);
      if (jointCount > 0) {
        oracleItems.push(computeItem(
          'Sambungan Dilatasi Bendung',
          'SDA_JOINT_01',
          jointCount * H,
          'm',
        ));
      }
    }

    // 5. Waterstop
    if (input.includeWaterstop !== 0 && L > 10) {
      const jointCount = Math.floor(L / 12);
      if (jointCount > 0) {
        const waterstopLength = jointCount * (H + Wb * 0.5);
        oracleItems.push(computeItem(
          'Waterstop PVC 200mm',
          'SDA_WATERSTOP_01',
          waterstopLength,
          'm',
        ));
      }
    }

    // ── AGGREGATION ─────────────────────────────────────────────────────
    const totalLaborCost = oracleItems.reduce((s, i) => s + i.laborCost, 0);
    const totalMaterialCost = oracleItems.reduce((s, i) => s + i.materialCost, 0);
    const totalEquipmentCost = oracleItems.reduce((s, i) => s + i.equipmentCost, 0);
    const totalDirectCost = oracleItems.reduce((s, i) => s + i.directCost, 0);
    const totalSmkk = oracleItems.reduce((s, i) => s + i.smkk, 0);
    const totalOverhead = oracleItems.reduce((s, i) => s + i.overhead, 0);
    const totalProfit = oracleItems.reduce((s, i) => s + i.profit, 0);
    const totalTax = oracleItems.reduce((s, i) => s + i.tax, 0);
    const totalFinalCost = oracleItems.reduce((s, i) => s + i.finalCost, 0);

    return {
      volume,
      crossSectionArea,
      workItems: oracleItems,
      totalDirectCost,
      totalLaborCost,
      totalMaterialCost,
      totalEquipmentCost,
      totalSmkk,
      totalOverhead,
      totalProfit,
      totalTax,
      totalFinalCost,
    };
  }
}