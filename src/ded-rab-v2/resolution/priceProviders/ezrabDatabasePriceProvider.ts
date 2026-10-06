/**
 * Priority 2: EZRAB Database Price Provider
 * Resolves price from official PUPR 2026 AHSP repository and official resource cost catalogs.
 */

import { PriceProvider, PriceSearchInput, PriceCandidate } from '../providerContracts';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
import { PriceResolver } from '../../../engine/pricing/resolver/priceResolver';
import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';

export class EzrabDatabasePriceProvider implements PriceProvider {
  public readonly name = 'EZRAB_DATABASE';
  public readonly priority = 2;

  public async search(input: PriceSearchInput): Promise<PriceCandidate | null> {
    const { workItemName, specification, unit, ahspCode, quantity = 1 } = input;
    const cleanCode = (ahspCode || '').toLowerCase().trim();
    const qty = quantity !== null && quantity !== undefined && quantity > 0 ? quantity : 1;

    // 1. Try Official AHSP 2026 repository by code
    if (cleanCode) {
      const match = officialAhspRepository.getOfficialAhsp(ahspCode!);
      if (match) {
        const comp = priceResolver2026.resolveAhspUnitPrice(match);
        if (comp.unitPrice && comp.unitPrice > 0 && (!comp.missing || comp.missing.length === 0)) {
          const uPrice = comp.unitPrice;
          const tot = SafeDecimalEngine.safeMultiply(uPrice, qty, 2);
          const components = [
            ...comp.material.components.map((c) => ({ type: 'MATERIAL', code: c.itemCode, name: c.itemName, coefficient: c.coefficient, unit: c.unit, unitPrice: c.unitPrice, totalPrice: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice || 0, 2) })),
            ...comp.labor.components.map((c) => ({ type: 'LABOR', code: c.itemCode, name: c.itemName, coefficient: c.coefficient, unit: c.unit, unitPrice: c.unitPrice, totalPrice: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice || 0, 2) })),
            ...comp.equipment.components.map((c) => ({ type: 'EQUIPMENT', code: c.itemCode, name: c.itemName, coefficient: c.coefficient, unit: c.unit, unitPrice: c.unitPrice, totalPrice: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice || 0, 2) })),
          ];

          return {
            unitPrice: uPrice,
            totalPrice: tot,
            priceSource: 'EZRAB_DATABASE',
            priceStatus: 'PRICE_INTERNAL',
            sourceName: `AHSP Resmi PUPR 2026 (${match.code} - ${match.name})`,
            materialPrice: comp.material.subtotalPerUnit,
            laborPrice: comp.labor.subtotalPerUnit,
            equipmentPrice: comp.equipment.subtotalPerUnit,
            confidence: 0.95,
            confidenceRating: 'HIGH',
            assumptions: ['Menggunakan komposisi resmi Permen PUPR / SE DJBK No. 47/SE/Dk/2026.'],
            components,
          };
        }
      }
    }

    // 2. Try Historical National Cost Database
    if (cleanCode) {
      const national = ALL_OFFICIAL_AHSP_ITEMS.find(
        (a) => a.code.toLowerCase() === cleanCode || a.codeNormalized?.toLowerCase() === cleanCode
      );
      if (national) {
        const comp = priceResolver2026.resolveAhspUnitPrice(national);
        if (comp.unitPrice && comp.unitPrice > 0 && (!comp.missing || comp.missing.length === 0)) {
          const uPrice = comp.unitPrice;
          const tot = SafeDecimalEngine.safeMultiply(uPrice, qty, 2);
          return {
            unitPrice: uPrice,
            totalPrice: tot,
            priceSource: 'EZRAB_DATABASE',
            priceStatus: 'PRICE_INTERNAL',
            sourceName: `Database Nasional AHSP (${national.code})`,
            materialPrice: comp.material.subtotalPerUnit,
            laborPrice: comp.labor.subtotalPerUnit,
            equipmentPrice: comp.equipment.subtotalPerUnit,
            confidence: 0.92,
            confidenceRating: 'HIGH',
            assumptions: ['Menggunakan data katalog resmi database nasional.'],
          };
        }
      }
    }

    // 3. Try Material Price Resolver direct lookup
    try {
      const resolver = new PriceResolver();
      const res = resolver.resolve({
        code: ahspCode,
        name: workItemName,
        specification,
        unit,
      });

      if (res.status === 'EXACT_MATCH' && res.resolvedPrice && res.resolvedPrice.price > 0) {
        const uPrice = res.resolvedPrice.price;
        const tot = SafeDecimalEngine.safeMultiply(uPrice, qty, 2);
        return {
          unitPrice: uPrice,
          totalPrice: tot,
          priceSource: 'EZRAB_DATABASE',
          priceStatus: 'PRICE_INTERNAL',
          sourceName: `Database Master Material EZRAB (${res.resolvedPrice.name})`,
          materialPrice: res.resolvedPrice.category === 'MATERIAL' ? uPrice : null,
          laborPrice: res.resolvedPrice.category === 'LABOR' ? uPrice : null,
          equipmentPrice: res.resolvedPrice.category === 'EQUIPMENT' ? uPrice : null,
          confidence: 0.90,
          confidenceRating: 'HIGH',
          assumptions: ['Menggunakan data master harga material terverifikasi EZRAB.'],
        };
      }
    } catch {
      // Continue
    }

    return null;
  }
}

export const ezrabDatabasePriceProvider = new EzrabDatabasePriceProvider();
