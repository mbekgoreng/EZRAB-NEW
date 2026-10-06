/**
 * Priority 1: Project Price Provider
 * Checks existing approved RAB items in the active project.
 */

import { PriceProvider, PriceSearchInput, PriceCandidate } from '../providerContracts';
import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';

export class ProjectPriceProvider implements PriceProvider {
  public readonly name = 'PROJECT_PRICE';
  public readonly priority = 1;

  public async search(input: PriceSearchInput): Promise<PriceCandidate | null> {
    const { workItemName, ahspCode, quantity = 1, existingProjectItems } = input;
    if (!existingProjectItems || existingProjectItems.length === 0) return null;

    const normName = workItemName.toLowerCase().trim();
    const cleanCode = (ahspCode || '').toLowerCase().trim();

    const match = existingProjectItems.find((it) => {
      const itCode = (it.code || it.ahspCode || '').toLowerCase().trim();
      const itName = (it.description || it.name || '').toLowerCase().trim();
      const hasPrice = (it.unitPrice || it.amount || 0) > 0;
      if (!hasPrice) return false;
      if (cleanCode && itCode && itCode === cleanCode) return true;
      return itName === normName;
    });

    if (!match || !match.unitPrice) return null;

    const unitPrice = Number(match.unitPrice);
    const qty = quantity !== null && quantity !== undefined && quantity > 0 ? quantity : 1;
    const totalPrice = SafeDecimalEngine.safeMultiply(unitPrice, qty, 2);

    return {
      unitPrice,
      totalPrice,
      priceSource: 'PROJECT_PRICE',
      priceStatus: 'PRICE_INTERNAL',
      sourceName: `RAB Proyek Aktif (${match.description || match.name})`,
      location: input.location ? `${input.location.city}, ${input.location.province}` : undefined,
      materialPrice: match.materialPrice ?? null,
      laborPrice: match.laborPrice ?? null,
      equipmentPrice: match.equipmentPrice ?? null,
      confidence: 0.98,
      confidenceRating: 'HIGH',
      assumptions: ['Harga diambil langsung dari item tervalidasi pada proyek aktif ini.'],
    };
  }
}

export const projectPriceProvider = new ProjectPriceProvider();
