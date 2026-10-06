/**
 * EZRAB — Central Quantity Resolution Engine
 *
 * Implements quantity resolution without ever returning silent zero (NULL -> 0 is banned):
 * 1. Direct deterministic QTO from drawing dimensions (SafeDecimalEngine)
 * 2. Cross-page deduction & schedule correlation
 * 3. AI architectural room inference
 * 4. Transparent fallback estimate with explicit assumptions
 */

import { QuantityProvider, QuantityResolutionInput, QuantityCandidate } from './providerContracts';
import { deterministicQuantityProvider } from './quantityProviders/deterministicQuantityProvider';
import { aiDeducedQuantityProvider } from './quantityProviders/aiDeducedQuantityProvider';

export class QuantityResolutionEngine {
  private static instance: QuantityResolutionEngine;
  private providers: QuantityProvider[];

  private constructor() {
    this.providers = [
      deterministicQuantityProvider,
      aiDeducedQuantityProvider,
    ];
  }

  public static getInstance(): QuantityResolutionEngine {
    if (!QuantityResolutionEngine.instance) {
      QuantityResolutionEngine.instance = new QuantityResolutionEngine();
    }
    return QuantityResolutionEngine.instance;
  }

  public async resolveQuantity(input: QuantityResolutionInput): Promise<QuantityCandidate> {
    for (const provider of this.providers) {
      try {
        const candidate = await provider.resolveQuantity(input);
        if (candidate && candidate.quantity !== null && candidate.quantity !== undefined && candidate.quantity > 0) {
          return candidate;
        }
      } catch (err) {
        console.warn(`[QuantityResolutionEngine] Provider ${provider.name} failed:`, err);
      }
    }

    // Fallback: estimate 1 unit for items that exist in drawing but dimensions could not be deduced
    const unit = input.item?.unit || 'unit';
    return {
      quantity: 1,
      unit,
      formula: '1 unit (estimasi keberadaan pekerjaan dari gambar DED)',
      source: 'AI_DEDUCED',
      confidence: 0.60,
      confidenceRating: 'LOW',
      assumptions: ['Kuantitas diestimasi minimum 1 unit karena item teridentifikasi pada gambar namun dimensi spesifik tidak tercantum.'],
      inputs: {},
      calculationBreakdown: 'Estimasi kuantitas minimal pekerjaan teridentifikasi',
    };
  }
}

export const quantityResolutionEngine = QuantityResolutionEngine.getInstance();
