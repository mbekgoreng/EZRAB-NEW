/**
 * Test: Perkiraan Harga AI (aiPriceEstimate) + label display policy.
 * Dijalankan via esbuild + vitest shim (lihat pola marketPriceIntelligence.test.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  gatherEstimateSources,
  heuristicEstimate,
  aiEstimateStore,
  formatAiEstimatePrice,
  AI_ESTIMATE_LABEL,
} from '../engine/pricing/aiEstimate/aiPriceEstimate';
import { marketReviewStore } from '../engine/pricing/market/reviewStore';
import { formatAiEstimatedPrice } from '../data/priceDatabase2026/ahspDisplayPolicy';

const SPEC = { category: 'semen', keyAttributes: { berat_kg: 50 }, extraAttributes: {} } as any;

function seedRef(price: number, status: 'MARKET_VERIFIED' | 'NEEDS_REVIEW' = 'MARKET_VERIFIED') {
  const r: any = {
    id: `r_${price}_${status}`,
    materialId: null,
    canonicalName: 'Semen Portland 50kg',
    aliases: [],
    spec: SPEC,
    needSpec: SPEC,
    sourceName: 'Toko Maju',
    sourceType: 'toko_bangunan',
    sourceProductId: null,
    productTitle: 'Semen 50kg',
    productUrl: 'https://toko.example/semen',
    listedPrice: price,
    packageQuantity: 1,
    packageUnit: 'zak',
    normalizedUnit: 'zak',
    priceType: 'normal',
    region: 'Jakarta',
    verificationStatus: status,
    normalizedUnitPrice: price,
    confidence: 0.9,
    history: [],
    ingestedAt: new Date().toISOString(),
    ingestedBy: 'test',
  };
  (marketReviewStore as any).refs.set(r.id, r);
}

function resetStores() {
  (marketReviewStore as any).refs.clear();
  aiEstimateStore.clear();
}

describe('aiPriceEstimate', () => {

  it('1. label khusus terdefinisi dan mengandung kata AI', () => {
    expect(AI_ESTIMATE_LABEL).toContain('Perkiraan AI');
  });

  it('2. gatherEstimateSources memakai referensi pasar terverifikasi dulu', () => {
    resetStores();
    seedRef(75000, 'MARKET_VERIFIED');
    seedRef(80000, 'NEEDS_REVIEW');
    const srcs = gatherEstimateSources('Semen Portland 50kg', 'zak');
    expect(srcs.length).toBe(2);
    expect(srcs[0].kind).toBe('market_verified');
    expect(srcs[1].kind).toBe('market_review');
  });

  it('3. gatherEstimateSources kosong tanpa sumber → []', () => {
    expect(gatherEstimateSources('Material Entah Berantah Xyz', 'unit')).toEqual([]);
  });

  it('4. heuristicEstimate = median sumber, method heuristik', () => {
    resetStores();
    seedRef(70000);
    seedRef(80000);
    seedRef(90000);
    const srcs = gatherEstimateSources('Semen Portland 50kg', 'zak');
    const est = heuristicEstimate('C.1', 'Semen Portland 50kg', 'zak', srcs);
    expect(est).not.toBeNull();
    expect(est!.estimatedPrice).toBe(80000);
    expect(est!.method).toBe('heuristic');
    expect(est!.confidence).toBeLessThanOrEqual(0.5);
    expect(est!.acknowledged).toBe(false);
  });

  it('5. heuristicEstimate null tanpa sumber (tidak mengarang dari nol)', () => {
    expect(heuristicEstimate('C.9', 'Xyz', 'unit', [])).toBeNull();
  });

  it('6. format selalu menyertakan label', () => {
    const f = formatAiEstimatePrice(125000);
    expect(f).toContain('125.000');
    expect(f).toContain(AI_ESTIMATE_LABEL);
  });

  it('7. store: save + latestFor + acknowledge', () => {
    resetStores();
    seedRef(75000);
    const srcs = gatherEstimateSources('Semen Portland 50kg', 'zak');
    const est = heuristicEstimate('C.1', 'Semen Portland 50kg', 'zak', srcs)!;
    aiEstimateStore.save(est);
    expect(aiEstimateStore.latestFor('C.1')?.id).toBe(est.id);
    expect(aiEstimateStore.latestFor('C.2')).toBeNull();
    const ack = aiEstimateStore.acknowledge(est.id, 'estimator');
    expect(ack?.acknowledged).toBe(true);
    expect(ack?.acknowledgedBy).toBe('estimator');
  });

  it('8. display policy: formatAiEstimatedPrice null-safe', () => {
    expect(formatAiEstimatedPrice(null)).toBeNull();
    expect(formatAiEstimatedPrice(0)).toBeNull();
    expect(formatAiEstimatedPrice(-5)).toBeNull();
    const f = formatAiEstimatedPrice(99000)!;
    expect(f).toContain('99.000');
    expect(f).toContain('*Harga Perkiraan AI*');
  });

  it('9. display policy: tidak pernah mengubah null menjadi 0', () => {
    expect(formatAiEstimatedPrice(undefined)).toBeNull();
  });
});
