/**
 * Priority 2: EZRAB Database Price Provider
 * Resolves price from official PUPR 2026 AHSP repository and official resource cost catalogs.
 */

import { PriceProvider, PriceSearchInput, PriceCandidate } from '../providerContracts';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../../../data/nationalCostDatabase/officialAhspRepository';
import { isQuarantined } from '../../../data/nationalCostDatabase/ahspQuarantine';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
import { canonicalPriceResolver } from '../../../engine/pricing/canonical/canonicalPriceResolver';
import { gateCanonicalUnit } from '../../../engine/pricing/canonical/canonicalPriceResolverAdapter';
import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';

export class EzrabDatabasePriceProvider implements PriceProvider {
  public readonly name = 'EZRAB_DATABASE';
  public readonly priority = 2;

  public async search(input: PriceSearchInput): Promise<PriceCandidate | null> {
    const { workItemName, unit, ahspCode, quantity = 1 } = input;
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
        // P0.1: item karantina tidak boleh menjadi harga EZRAB_DATABASE.
        (a) => !isQuarantined(a.code) && (a.code.toLowerCase() === cleanCode || a.codeNormalized?.toLowerCase() === cleanCode)
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

    // 3. Canonical resource lookup (MASTER PRICING §12, D3/M-12: was the
    // engine PriceResolver over the PriceRepository index — a parallel
    // price universe. Now the canonical service, so the master price
    // wins with name gate + unit validation + sanity gate. The
    // 'EZRAB_DATABASE' / 'PRICE_INTERNAL' labels name the provider
    // priority, not the data source; the data source is named in
    // `sourceName`.)
    try {
      const res = canonicalPriceResolver.resolve({
        code: ahspCode,
        name: workItemName,
        unit,
      });

      // MASTER PRICING §12 (P5): the canonical answer must be usable
      // FOR the queried unit — a gated-out answer falls through to
      // the AI estimation step, never a wrong-unit price.
      const gated =
        res.status === 'RESOLVED' && res.price !== null && res.price > 0
          ? gateCanonicalUnit(res, unit)
          : null;
      if (gated) {
        const uPrice = gated.price;
        const tot = SafeDecimalEngine.safeMultiply(uPrice, qty, 2);
        return {
          unitPrice: uPrice,
          totalPrice: tot,
          priceSource: 'EZRAB_DATABASE',
          priceStatus: 'PRICE_INTERNAL',
          sourceName: `Harga Kanonis EZRAB (${res.sourceDocument || res.source})`,
          materialPrice: res.category === 'MATERIAL' ? uPrice : null,
          laborPrice: res.category === 'LABOR' ? uPrice : null,
          equipmentPrice: res.category === 'EQUIPMENT' ? uPrice : null,
          confidence: res.confidence,
          confidenceRating: res.confidence >= 0.9 ? 'HIGH' : 'MEDIUM',
          assumptions: ['Menggunakan harga kanonis master EZRAB 2026 (resolver terpusat).'],
        };
      }
    } catch {
      // Continue
    }

    return null;
  }
}

export const ezrabDatabasePriceProvider = new EzrabDatabasePriceProvider();
