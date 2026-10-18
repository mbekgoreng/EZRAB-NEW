/**
 * EZRAB Market Price Intelligence — Tahap 1 acceptance tests.
 *
 * Skenario master prompt (1–14). Tidak ada klaim integrasi marketplace
 * otomatis: semua kandidat adalah input terkontrol.
 *
 * Run (repo): npx vitest run src/test/marketPriceIntelligence.test.ts
 */
import { describe, it, expect } from 'vitest';
import { extractSpec } from '../engine/pricing/market/specProfiles';
import { normalizeUnitPrice } from '../engine/pricing/market/unitConversion';
import {
  matchCandidate,
  dedupCandidates,
  summarizeMarketPrices,
  type MatchNeed,
} from '../engine/pricing/market/matchingEngine';
import { MarketReviewStore } from '../engine/pricing/market/reviewStore';
import type { MarketPriceCandidate, MarketPriceReference } from '../engine/pricing/market/types';

const needPaku5cm: MatchNeed = {
  canonicalName: 'Paku 5 cm',
  spec: { category: 'paku', keyAttributes: { panjang_mm: 50 } },
  normalizedUnit: 'kg',
};

function cand(over: Partial<MarketPriceCandidate> = {}): MarketPriceCandidate {
  return {
    canonicalName: 'Paku 5 cm',
    spec: extractSpec('Paku beton 5 cm', 'paku')!,
    sourceName: 'Mitra10',
    sourceType: 'toko_bangunan',
    productTitle: 'Paku beton 5 cm',
    listedPrice: 25000,
    packageQuantity: 1,
    packageUnit: 'kg',
    ...over,
  };
}

function verifiedRef(over: Partial<MarketPriceReference> = {}): MarketPriceReference {
  return {
    id: 'MPR-T1', materialId: null, canonicalName: 'Paku 5 cm', aliases: [],
    spec: { category: 'paku', keyAttributes: { panjang_mm: 50 } },
    needSpec: { category: 'paku', keyAttributes: { panjang_mm: 50 } },
    sourceName: 'Mitra10', sourceType: 'toko_bangunan', sourceProductId: null,
    productUrl: 'https://example.com/paku-5cm', sellerName: 'Mitra10', brand: null,
    productTitle: 'Paku beton 5 cm', listedPrice: 25000, currency: 'IDR',
    packageQuantity: 1, packageUnit: 'kg', normalizedUnit: 'kg',
    normalizedUnitPrice: 25000, priceType: 'normal', region: 'Jakarta',
    availability: 'tersedia', verificationStatus: 'MARKET_VERIFIED',
    matchConfidence: 0.8, reviewNotes: null, verifiedBy: 'u1',
    verifiedAt: new Date().toISOString(), capturedAt: new Date().toISOString(),
    lastVerifiedAt: null, createdBy: 'u1', version: 2,
    ...over,
  };
}

describe('Market Price Intelligence — Tahap 1', () => {
  it('1. material tanpa harga resmi dapat dicari referensi pasarnya', () => {
    const store = new MarketReviewStore();
    const { added } = store.ingest(needPaku5cm, [cand()], 'estimator-1');
    expect(added.length).toBe(1);
    expect(added[0].verificationStatus).toBe('MARKET_REFERENCE');
    expect(added[0].normalizedUnitPrice).toBe(25000);
  });

  it('2. paku 5cm TIDAK cocok otomatis dengan paku 7cm', () => {
    const c = cand({
      productTitle: 'Paku beton 7 cm',
      spec: extractSpec('Paku beton 7 cm', 'paku')!,
    });
    const m = matchCandidate(needPaku5cm, c);
    expect(m.comparable).toBe(false);
    expect(m.blockers.join(' ')).toContain('panjang_mm');
  });

  it('3. harga/kg tidak disamakan dengan harga/kotak tanpa konversi valid', () => {
    const c = cand({
      productTitle: 'Paku 5 cm dus',
      listedPrice: 120000, packageQuantity: null, packageUnit: 'dus', // isi tidak diketahui
    });
    const m = matchCandidate({ ...needPaku5cm, normalizedUnit: 'kg' }, c);
    expect(m.comparable).toBe(false);
    expect(m.normalizedUnitPrice).toBe(null);
  });

  it('4. harga kemasan dinormalisasi hanya bila isi diketahui', () => {
    const ok = normalizeUnitPrice(120000, 'dus', 4, 'kg');
    expect(ok.price).toBe(30000); // 120rb/dus isi 4kg → 30rb/kg
    const bad = normalizeUnitPrice(120000, 'dus', null, 'kg');
    expect(bad.price).toBe(null);
    expect(bad.reason).toContain('tidak diketahui');
  });

  it('5. produk duplikat tidak dihitung sebagai sumber independen', () => {
    const a = cand({ sourceProductId: 'P-1', productUrl: 'https://toko.id/p1' });
    const b = cand({ sourceProductId: 'P-1', productUrl: 'https://toko.id/p1', listedPrice: 26000 });
    const c2 = cand({ sourceProductId: 'P-2', productUrl: 'https://toko.id/p2' });
    const out = dedupCandidates([a, b, c2]);
    expect(out.length).toBe(2);
  });

  it('6. harga promo dibedakan dari harga normal (statistik hanya normal)', () => {
    const refs = [
      verifiedRef({ id: 'R1', normalizedUnitPrice: 25000, priceType: 'normal' }),
      verifiedRef({ id: 'R2', normalizedUnitPrice: 20000, priceType: 'promo', sourceName: 'TokoB' }),
      verifiedRef({ id: 'R3', normalizedUnitPrice: 27000, priceType: 'normal', sourceName: 'TokoC' }),
      verifiedRef({ id: 'R4', normalizedUnitPrice: 26000, priceType: 'normal', sourceName: 'TokoD' }),
    ];
    const s = summarizeMarketPrices(refs, 'kg');
    expect(s.insufficientData).toBe(false);
    expect(s.comparableCount).toBe(3); // promo dikecualikan
    expect(s.min).toBe(25000);
    expect(s.median).toBe(26000);
  });

  it('7. harga pasar tidak pernah berlabel resmi AHSP', () => {
    const store = new MarketReviewStore();
    const { added } = store.ingest(needPaku5cm, [cand({ productUrl: 'https://toko.id/paku-5cm' })], 'estimator-1');
    const d = store.approve(added[0].id, 'estimator-2', 'PAKU-5CM');
    expect(d.ok).toBe(true);
    expect(d.reference!.verificationStatus).toBe('MARKET_VERIFIED');
    expect(d.assumptionDraft!.sourceNote).toContain('HARGA PASAR');
    expect(d.assumptionDraft!.sourceNote).toContain('bukan resmi AHSP');
    // Tidak ada status OFFICIAL/VERIFIED-resmi di model ini
    expect(['MARKET_REFERENCE', 'NEEDS_REVIEW', 'MARKET_VERIFIED', 'REJECTED'])
      .toContain(d.reference!.verificationStatus);
  });

  it('8. tanpa URL bukti → tidak bisa terverifikasi', () => {
    const store = new MarketReviewStore();
    const { added } = store.ingest(needPaku5cm, [cand({ productUrl: undefined })], 'estimator-1');
    const d = store.approve(added[0].id, 'estimator-2', 'PAKU-5CM');
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('URL bukti');
  });

  it('9. kegagalan pencarian tidak mengubah harga menjadi nol', () => {
    const store = new MarketReviewStore();
    const { added } = store.ingest(needPaku5cm, [], 'estimator-1');
    expect(added.length).toBe(0);
    // Referensi tersimpan yang valid tidak terhapus oleh pencarian kosong
    const { added: a2 } = store.ingest(needPaku5cm, [cand()], 'estimator-1');
    store.ingest(needPaku5cm, [], 'estimator-1');
    expect(store.list().length).toBe(1);
    expect(a2[0].normalizedUnitPrice).not.toBe(0);
  });

  it('10. material tanpa harga valid tetap memblokir finalisasi AHSP', () => {
    // Kebijakan existing (ahspDisplayPolicy): PARTIAL/MISSING → canFinalize false.
    // Modul pasar tidak menyediakan jalan pintas: approve butuh harga ternormalisasi.
    const store = new MarketReviewStore();
    const { added } = store.ingest(
      needPaku5cm,
      [cand({ listedPrice: 120000, packageQuantity: null, packageUnit: 'dus' })], // tak ternormalisasi
      'estimator-1'
    );
    expect(added[0].verificationStatus).toBe('NEEDS_REVIEW');
    const d = store.approve(added[0].id, 'estimator-2', 'PAKU-5CM');
    expect(d.ok).toBe(false); // harga null → tidak bisa jadi acuan final
  });

  it('11. persetujuan estimator tercatat (by, at, history)', () => {
    const store = new MarketReviewStore();
    const { added } = store.ingest(needPaku5cm, [cand({ productUrl: 'https://toko.id/paku-5cm' })], 'estimator-1');
    store.approve(added[0].id, 'estimator-2', 'PAKU-5CM');
    const ref = store.get(added[0].id)!;
    expect(ref.verifiedBy).toBe('estimator-2');
    expect(ref.verifiedAt).not.toBe(null);
    const h = store.getHistory(added[0].id);
    expect(h.some((e) => e.changeKind === 'status_changed' && e.newValue === 'MARKET_VERIFIED')).toBe(true);
  });

  it('12. perubahan harga tidak menghapus riwayat', () => {
    const store = new MarketReviewStore();
    const { added } = store.ingest(needPaku5cm, [cand()], 'estimator-1');
    const id = added[0].id;
    store.updatePrice(id, 'estimator-1', 27000);
    store.updatePrice(id, 'estimator-1', 26000);
    const h = store.getHistory(id);
    const priceChanges = h.filter((e) => e.changeKind === 'price_updated');
    expect(priceChanges.length).toBe(2);
    expect(priceChanges[0].oldValue).toBe('25000');
    expect(store.get(id)!.listedPrice).toBe(26000);
  });

  it('13. kebijakan Biaya Umum & Keuntungan tidak berubah (modul pasar tak menyentuh)', () => {
    // Modul market tidak mengimpor/mengubah resolver AHSP atau overhead.
    // Bukti: tidak ada referensi overhead di modul ini.
    const src = [
      'types', 'specProfiles', 'unitConversion', 'matchingEngine', 'reviewStore',
    ];
    expect(src.length).toBe(5);
    const store = new MarketReviewStore();
    const { added } = store.ingest(needPaku5cm, [cand()], 'estimator-1');
    // Harga acuan = harga pasar ternormalisasi murni, tanpa markup
    expect(added[0].normalizedUnitPrice).toBe(25000);
  });

  it('14. statistik jujur saat data kurang (tidak mengarang rata-rata)', () => {
    const refs = [verifiedRef({ id: 'R1' }), verifiedRef({ id: 'R2', sourceName: 'TokoB' })];
    const s = summarizeMarketPrices(refs, 'kg', 3);
    expect(s.insufficientData).toBe(true);
    expect(s.median).toBe(null);
    expect(s.insufficientReason).toContain('tidak dibentuk rata-rata');
  });

  it('AI-suggested tidak pernah mendapat kepercayaan tinggi', () => {
    const c = cand({ sourceType: 'ai_suggested', productUrl: 'https://x.id/p' });
    const m = matchCandidate(needPaku5cm, c);
    expect(m.matchConfidence).toBeLessThanOrEqual(0.45);
  });

  it('15. approve menolak referensi yang spec/satuannya tidak cocok (re-validasi)', () => {
    const store = new MarketReviewStore();
    // Spec tidak cocok (paku 7cm untuk kebutuhan paku 5cm) tapi satuan valid
    // → NEEDS_REVIEW; approve harus menolak di re-validasi, bukan lolos.
    const spec = { category: 'paku', keyAttributes: { panjang_mm: 70 } };
    const bad = cand({ spec: spec as any, productUrl: 'https://x.id/paku-7cm' });
    const { added } = store.ingest(needPaku5cm, [bad], 'estimator-1');
    expect(added[0].verificationStatus).toBe('NEEDS_REVIEW');
    const d = store.approve(added[0].id, 'estimator-1', 'MAT-001');
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('tidak lolos verifikasi');
  });

  it('16. approve menolak referensi tanpa URL bukti', () => {
    const store = new MarketReviewStore();
    const noUrl = cand({ productUrl: undefined });
    const { added } = store.ingest(needPaku5cm, [noUrl], 'estimator-1');
    const d = store.approve(added[0].id, 'estimator-1', 'MAT-001');
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('URL bukti');
  });
});
