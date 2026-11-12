/**
 * Test: AI Credits Phase 1 — config, mock adapter, format.
 * Dijalankan via esbuild + vitest shim.
 */
import { describe, it, expect } from 'vitest';
import {
  PLAN_CREDITS,
  TOPUP_OFFERS,
  topUpOfferFor,
  TARIFFS,
  tariffFor,
  LOW_BALANCE_THRESHOLD,
  CREDIT_CONFIG_NOTE,
} from '../ai-credits/config';
import {
  mockConsume,
  mockGetBalance,
  mockGetLedger,
  mockReset,
  mockSetPlan,
  mockTopUp,
} from '../ai-credits/mockAdapter';
import { formatCredits, formatCreditsShort, formatRupiah, formatEstimateRange } from '../ai-credits/format';

describe('ai-credits config', () => {
  // Nilai jatah mengikuti definisi paket KANONIS (src/billing/plans.ts,
  // owner-approved 2026-10-30): Starter 5.000, Professional 10.000,
  // Business 30.000 per periode. Menggantikan angka lama 10.000/20.000
  // yang menyimpang dari tabel paket resmi.
  it('1. paket Starter 5.000, Pro (Professional) 10.000, Business 30.000', () => {
    expect(PLAN_CREDITS.starter).toBe(5_000);
    expect(PLAN_CREDITS.pro).toBe(10_000);
    expect(PLAN_CREDITS.business).toBe(30_000);
  });

  it('2. K6: 4 tier top-up Spec §7.2 (500/1.500/4.000/10.000 = Rp5rb/10rb/25rb/50rb), tanpa bonus', () => {
    expect(TOPUP_OFFERS.length).toBe(4);
    expect(TOPUP_OFFERS[0]).toEqual({ itemId: 'topup-500', priceIdr: 5_000, credits: 500 });
    expect(TOPUP_OFFERS[1]).toEqual({ itemId: 'topup-1500', priceIdr: 10_000, credits: 1_500 });
    expect(TOPUP_OFFERS[2]).toEqual({ itemId: 'topup-4000', priceIdr: 25_000, credits: 4_000 });
    expect(TOPUP_OFFERS[3]).toEqual({ itemId: 'topup-10000', priceIdr: 50_000, credits: 10_000 });
    expect(topUpOfferFor('topup-4000')?.credits).toBe(4_000);
    expect(topUpOfferFor('topup-3600')).toBe(null); // penawaran interim sudah dihapus
    expect(topUpOfferFor('tidak-ada')).toBe(null);
  });

  it('3. tarif chat FAST 5-20, ADVANCED 20-50', () => {
    const fast = tariffFor('chat-ai/fast');
    const adv = tariffFor('chat-ai/advanced');
    expect(fast.min).toBe(5);
    expect(fast.max).toBe(20);
    expect(adv.min).toBe(20);
    expect(adv.max).toBe(50);
  });

  it('4. tarif DED 500/650/800, revisi 100-300', () => {
    expect(tariffFor('ded-ai/simple').target).toBe(500);
    expect(tariffFor('ded-ai/medium').target).toBe(650);
    expect(tariffFor('ded-ai/complex').target).toBe(800);
    const rev = tariffFor('ded-ai/revision');
    expect(rev.min).toBe(100);
    expect(rev.max).toBe(300);
  });

  it('5. tarif dokumen sederhana 50-100, kompleks 100-250', () => {
    const s = tariffFor('ai-document/simple');
    const c = tariffFor('ai-document/complex');
    expect(s.min).toBe(50);
    expect(s.max).toBe(100);
    expect(c.min).toBe(100);
    expect(c.max).toBe(250);
  });

  it('6. semua tarif bertanda draft kalibrasi', () => {
    for (const k of Object.keys(TARIFFS)) {
      expect(tariffFor(k).isCalibratedDraft).toBe(true);
    }
    expect(CREDIT_CONFIG_NOTE.length > 0).toBe(true);
  });

  it('7. tariffFor melempar untuk kunci tak dikenal', () => {
    let threw = false;
    try { tariffFor('tidak-ada'); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('ai-credits mockAdapter (SIMULASI)', () => {
  it('8. saldo awal = paket starter 5.000', () => {
    mockReset();
    const b = mockGetBalance();
    expect(b.total).toBe(5_000);
    expect(b.plan).toBe('starter');
    expect(b.subscription).toBe(5_000);
  });

  it('9. consume mengurangi saldo dan mencatat ledger simulasi', () => {
    mockReset();
    const ok = mockConsume('chat-ai', 20, 'test chat', { model: 'FAST' });
    expect(ok).toBe(true);
    expect(mockGetBalance().total).toBe(4_980);
    const ledger = mockGetLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].credits).toBe(-20);
    expect(ledger[0].status).toBe('simulated');
  });

  it('10. consume gagal bila saldo tidak cukup (tidak jadi negatif)', () => {
    mockReset();
    const ok = mockConsume('ded-ai', 99_999, 'test');
    expect(ok).toBe(false);
    expect(mockGetBalance().total).toBe(5_000);
    expect(mockGetLedger().length).toBe(0);
  });

  it('11. top-up simulasi per tier K6 (tanpa bonus; itemId tak dikenal ditolak)', () => {
    mockReset();
    const res = mockTopUp('topup-1500');
    expect(res.simulated).toBe(true);
    expect(res.totalCredits).toBe(1_500);
    expect(res.bonusCredits).toBe(0);
    const b = mockGetBalance();
    expect(b.topup).toBe(1_500);
    expect(b.bonus).toBe(0);
    expect(b.total).toBe(6_500);
    // Default tanpa argumen = tier terkecil.
    mockReset();
    expect(mockTopUp().totalCredits).toBe(500);
    // ItemId tak dikenal: gagal tanpa mengubah state.
    mockReset();
    const bad = mockTopUp('topup-3600');
    expect(bad.status).toBe('failed');
    expect(mockGetBalance().total).toBe(5_000);
  });

  it('12. K5: urutan pakai kanonis server — langganan → bonus → top-up', () => {
    mockReset();
    mockTopUp('topup-1500'); // topup 1500, bonus 0
    mockConsume('chat-ai', 1_000, 'test');
    const b = mockGetBalance();
    expect(b.subscription).toBe(4_000); // langganan dipakai DULU (kanonis server)
    expect(b.topup).toBe(1_500); // belum tersentuh
    expect(b.bonus).toBe(0);
  });

  it('12b. K5: sesudah langganan habis, top-up yang dipakai berikutnya', () => {
    mockReset();
    mockTopUp('topup-500'); // topup 500
    mockConsume('chat-ai', 5_000, 'habiskan langganan');
    const mid = mockGetBalance();
    expect(mid.subscription).toBe(0);
    expect(mid.topup).toBe(500);
    mockConsume('chat-ai', 200, 'pakai top-up');
    expect(mockGetBalance().topup).toBe(300);
    // Catatan: bucket bonus tidak lagi terisi lewat mock (tier Spec tanpa
    // bonus) — urutan bonus-di-tengah hanya teruji di server
    // (creditAllocation.resolveAllocationOrder). Yang dipin di sini
    // adalah ujung-ujungnya: langganan dulu, top-up terakhir.
  });

  it('13. ganti paket mengubah jatah langganan', () => {
    mockReset();
    mockSetPlan('pro');
    expect(mockGetBalance().plan).toBe('pro');
    expect(mockGetBalance().subscription).toBe(10_000);
    mockSetPlan('business');
    expect(mockGetBalance().plan).toBe('business');
    expect(mockGetBalance().subscription).toBe(30_000);
    mockSetPlan('free');
    // Keputusan Owner 2026-11-07 (Amendemen Spec v1.2): Free mendapat
    // kredit AWAL 100 SEKALI — bukan 0 (Spec v1.0) dan bukan jatah
    // periodik. Assertion lama (0) mengkodekan bug saldo Free kosong.
    expect(mockGetBalance().subscription).toBe(100);
    expect(mockGetBalance().total).toBe(100);
  });

  it('14. ambang saldo rendah terdefinisi', () => {
    expect(LOW_BALANCE_THRESHOLD).toBe(500);
  });
});

describe('ai-credits format', () => {
  it('15. format kredit dan rupiah', () => {
    expect(formatCredits(3600)).toBe('3.600 kredit');
    expect(formatRupiah(5000)).toBe('Rp5.000');
    expect(formatCreditsShort(10000)).toBe('10rb');
    expect(formatCreditsShort(500)).toBe('500');
  });

  it('16. rentang estimasi tidak pernah angka pasti bila min != max', () => {
    expect(formatEstimateRange(5, 20)).toBe('5–20 kredit');
    expect(formatEstimateRange(500, 500)).toBe('500 kredit');
  });
});
