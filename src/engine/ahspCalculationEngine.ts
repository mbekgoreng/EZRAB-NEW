import { AHSPComponent, AHSPProjectSnapshot, RABItem } from '../types';
import { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { getPriceDatabase } from '../data/indonesianPrices';
import { SafeDecimalEngine } from './safeDecimalEngine';
// PHASE 1 (audit §16): record every fabricated price. Recording only — no value is changed.
import { recordFabricatedTotal } from './pricing/telemetry/fabricatedPriceTelemetry';

export interface AHSPCostSummary {
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  unitPrice: number;
  totalPrice: number;
}

export class AHSPCalculationEngine {
  /**
   * Clone a master National AHSP item into an independent Project Snapshot.
   * Auto-resolves component prices against the regional Price Database if missing.
   * NEVER mutates the master AHSP record.
   */
  static createProjectSnapshot(
    masterItem: NationalAHSPItem,
    region?: string
  ): AHSPProjectSnapshot {
    const priceDb = getPriceDatabase();

    const resolvePrice = (compCode: string, compName: string, fallbackPrice: number, category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT'): { price: number; source: string } => {
      if (fallbackPrice > 0) {
        return { price: fallbackPrice, source: 'PUPR AHSP 2026' };
      }

      // Try exact code match in price database
      const cleanCode = compCode.trim().toLowerCase();
      const cleanName = compName.trim().toLowerCase();

      const matched = priceDb.find(p => 
        p.code.trim().toLowerCase() === cleanCode ||
        p.name.trim().toLowerCase() === cleanName ||
        cleanName.includes(p.name.trim().toLowerCase())
      );

      if (matched && matched.price > 0) {
        return { price: matched.price, source: matched.priceSource || matched.location || 'Database Daerah' };
      }

      // PHASE 1 telemetry: no price source found; the component's own embedded price (or 0)
      // is reused and labelled "Estimasi Standar", disguising missing data as an estimate.
      recordFabricatedTotal('ahspcalc.zero-as-estimate', fallbackPrice || 0, {
        constant: fallbackPrice || 0,
        unit: category,
        itemName: compName || compCode,
        calculatorId: compCode,
      });

      return { price: fallbackPrice || 0, source: 'Estimasi Standar' };
    };

    const cloneCategory = (
      components: AHSPComponent[] | undefined,
      category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
      prefix: string
    ): AHSPComponent[] => {
      if (!components || components.length === 0) return [];

      return components.map((comp, idx) => {
        const { price, source } = resolvePrice(comp.code || '', comp.name || '', comp.unitPrice || 0, category);
        const coeff = SafeDecimalEngine.sanitize(comp.coefficient, 0, false);
        const total = SafeDecimalEngine.safeMultiply(coeff, price, 2);

        return {
          id: `snap-${prefix}-${Date.now()}-${idx}-${Math.floor(100 + Math.random() * 900)}`,
          code: comp.code || `RES-${idx + 1}`,
          name: comp.name || 'Komponen Tanpa Nama',
          unit: comp.unit || 'satuan',
          coefficient: coeff,
          originalCoefficient: coeff,
          unitPrice: price,
          total,
          resourceId: comp.code || `RES-${idx + 1}`,
          resourceType: category,
          isOverridden: false,
          priceSource: source,
          region: region || 'Jabodetabek'
        };
      });
    };

    const laborComponents = cloneCategory(masterItem.laborComponents, 'LABOR', 'lab');
    const materialComponents = cloneCategory(masterItem.materialComponents, 'MATERIAL', 'mat');
    const equipmentComponents = cloneCategory(masterItem.equipmentComponents, 'EQUIPMENT', 'eqp');

    const totalLabor = laborComponents.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);
    const totalMaterial = materialComponents.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);
    const totalEquipment = equipmentComponents.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);

    const calculatedUnitPrice = SafeDecimalEngine.safeAdd(
      SafeDecimalEngine.safeAdd(totalMaterial, totalLabor, 2),
      totalEquipment,
      2
    );

    return {
      ahspId: masterItem.id,
      code: masterItem.code,
      version: masterItem.version || '2026',
      name: masterItem.name,
      unit: masterItem.unit || 'unit',
      sourceDocument: masterItem.sourceDocument || 'Permen PUPR No. 1 2022 / 2026',
      laborComponents,
      materialComponents,
      equipmentComponents,
      unitPrice: calculatedUnitPrice,
      isCustomModified: false,
      snapshotTimestamp: new Date().toISOString()
    };
  }

  /**
   * Recalculate all subtotals and unit price for an AHSP snapshot
   */
  static recalculateSnapshot(snapshot: AHSPProjectSnapshot): AHSPProjectSnapshot {
    const recalcComp = (c: AHSPComponent): AHSPComponent => {
      const coeff = SafeDecimalEngine.sanitize(c.coefficient, 0, false);
      const price = SafeDecimalEngine.sanitize(c.unitPrice, 0, true);
      const total = SafeDecimalEngine.safeMultiply(coeff, price, 2);
      return { ...c, coefficient: coeff, unitPrice: price, total };
    };

    const labor = (snapshot.laborComponents || []).map(recalcComp);
    const material = (snapshot.materialComponents || []).map(recalcComp);
    const equipment = (snapshot.equipmentComponents || []).map(recalcComp);

    const totalLabor = labor.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);
    const totalMaterial = material.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);
    const totalEquipment = equipment.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);

    const unitPrice = SafeDecimalEngine.safeAdd(
      SafeDecimalEngine.safeAdd(totalMaterial, totalLabor, 2),
      totalEquipment,
      2
    );

    return {
      ...snapshot,
      laborComponents: labor,
      materialComponents: material,
      equipmentComponents: equipment,
      unitPrice,
      snapshotTimestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate complete item cost ensuring NO double calculation
   */
  static calculateItemCost(
    volume: number,
    snapshot?: AHSPProjectSnapshot,
    manualUnitPrice: number = 0
  ): AHSPCostSummary {
    const safeVolume = Math.max(0, SafeDecimalEngine.sanitize(volume, 0, false));

    if (snapshot) {
      const refreshed = this.recalculateSnapshot(snapshot);
      const materialCost = refreshed.materialComponents.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);
      const laborCost = refreshed.laborComponents.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);
      const equipmentCost = refreshed.equipmentComponents.reduce((sum, c) => SafeDecimalEngine.safeAdd(sum, c.total, 2), 0);
      const unitPrice = refreshed.unitPrice;
      const totalPrice = SafeDecimalEngine.safeMultiply(safeVolume, unitPrice, 0);

      return {
        materialCost,
        laborCost,
        equipmentCost,
        unitPrice,
        totalPrice
      };
    }

    // Manual item without AHSP
    const unitPrice = Math.max(0, SafeDecimalEngine.sanitize(manualUnitPrice, 0, true));
    const totalPrice = SafeDecimalEngine.safeMultiply(safeVolume, unitPrice, 0);

    return {
      materialCost: 0,
      laborCost: 0,
      equipmentCost: 0,
      unitPrice,
      totalPrice
    };
  }
}
