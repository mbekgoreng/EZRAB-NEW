/**
 * Test: AI Credits Phase 1 — config, mock adapter, format.
 * Dijalankan via esbuild + vitest shim.
 */
import { describe, it, expect } from 'vitest';
import {
  PLAN_CREDITS,
  TOPUP_OFFER,
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
  it('1. paket Starter 10.000 dan Pro 20.000', () => {
    expect(PLAN_CREDITS.starter).toBe(10_000);
    expect(PLAN_CREDITS.pro).toBe(20_000);
  });

  it('2. top-up Rp5.000 → 3.000 + 600 bonus = 3.600', () => {
    expect(TOPUP_OFFER.priceIdr).toBe(5_000);
    expect(TOPUP_OFFER.baseCredits).toBe(3_000);
    expect(TOPUP_OFFER.bonusCredits).toBe(600);
    expect(TOPUP_OFFER.totalCredits).toBe(3_600);
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
  it('8. saldo awal = paket starter 10.000', () => {
    mockReset();
    const b = mockGetBalance();
    expect(b.total).toBe(10_000);
    expect(b.plan).toBe('starter');
    expect(b.subscription).toBe(10_000);
  });

  it('9. consume mengurangi saldo dan mencatat ledger simulasi', () => {
    mockReset();
    const ok = mockConsume('chat-ai', 20, 'test chat', { model: 'FAST' });
    expect(ok).toBe(true);
    expect(mockGetBalance().total).toBe(9_980);
    const ledger = mockGetLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].credits).toBe(-20);
    expect(ledger[0].status).toBe('simulated');
  });

  it('10. consume gagal bila saldo tidak cukup (tidak jadi negatif)', () => {
    mockReset();
    const ok = mockConsume('ded-ai', 99_999, 'test');
    expect(ok).toBe(false);
    expect(mockGetBalance().total).toBe(10_000);
    expect(mockGetLedger().length).toBe(0);
  });

  it('11. top-up simulasi menambah 3.600 (3.000 topup + 600 bonus)', () => {
    mockReset();
    const res = mockTopUp();
    expect(res.simulated).toBe(true);
    expect(res.totalCredits).toBe(3_600);
    const b = mockGetBalance();
    expect(b.topup).toBe(3_000);
    expect(b.bonus).toBe(600);
    expect(b.total).toBe(13_600);
  });

  it('12. urutan pakai: bonus → topup → langganan', () => {
    mockReset();
    mockTopUp(); // bonus 600, topup 3000
    mockConsume('chat-ai', 1_000, 'test');
    const b = mockGetBalance();
    expect(b.bonus).toBe(0); // 600 habis dulu
    expect(b.topup).toBe(2_600); // sisa 400 dari topup
    expect(b.subscription).toBe(10_000); // belum tersentuh
  });

  it('13. ganti paket mengubah jatah langganan', () => {
    mockReset();
    mockSetPlan('pro');
    expect(mockGetBalance().plan).toBe('pro');
    expect(mockGetBalance().subscription).toBe(20_000);
    mockSetPlan('free');
    expect(mockGetBalance().subscription).toBe(0);
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
