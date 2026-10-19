/**
 * Test: Usage Meter & Credit Pricing (Phase 3).
 * Dijalankan via esbuild + vitest shim.
 */
import { describe, it, expect } from 'vitest';
import { computeProviderCost, getModelTariff, TARIFF_VERSION } from '../../api/_lib/providerTariffs.js';
import { estimateCredits, finalizeCredits, getDraftTariff } from '../../api/_lib/creditPricing.js';
import { createUsageMeter } from '../../api/_lib/usageMeter.js';
import { createCreditEngine, createMemoryAdapter } from '../../api/_lib/creditEngine.js';

describe('providerTariffs', () => {
  it('1. tarif belum dikonfigurasi → getModelTariff jujur', () => {
    const t = getModelTariff('gemini-3.5-flash-lite');
    expect(t.configured).toBe(false);
    expect(getModelTariff('model-tidak-ada').reason).toBe('MODEL_UNKNOWN');
  });

  it('2. tanpa usage metadata → USAGE_UNAVAILABLE (tidak menebak)', () => {
    const r = computeProviderCost(null, 'gemini-3.5-flash-lite');
    expect(r.status).toBe('USAGE_UNAVAILABLE');
    expect(r.costUsd).toBe(null);
  });

  it('3. usage ada tapi tarif belum dikonfigurasi → UNDETERMINED', () => {
    const r = computeProviderCost({ inputTokens: 1000, outputTokens: 500 }, 'gemini-3.5-flash-lite');
    expect(r.status).toBe('UNDETERMINED');
    expect(r.costUsd).toBe(null);
    // usage aktual tetap disimpan untuk audit
    expect(r.usage.inputTokens).toBe(1000);
  });

  it('4. versi tarif tercatat', () => {
    expect(typeof TARIFF_VERSION).toBe('string');
    expect(TARIFF_VERSION.length > 0).toBe(true);
  });
});

describe('creditPricing (EZRAB draft)', () => {
  it('5. estimasi chat FAST 5-20 (konservatif = max)', () => {
    const e = estimateCredits('chat-ai/fast');
    expect(e.ok).toBe(true);
    expect(e.estimate).toBe(20);
    expect(e.max).toBe(20);
    expect(e.isCalibratedDraft).toBe(true);
    expect(e.label).toBe('Estimasi');
  });

  it('6. estimasi DED kompleks = target 800', () => {
    const e = estimateCredits('ded-ai/complex');
    expect(e.estimate).toBe(800);
    expect(e.max).toBe(800);
  });

  it('7. fitur tak dikenal → error jujur', () => {
    expect(estimateCredits('fitur-aneh').ok).toBe(false);
  });

  it('8. finalize tidak pernah melebihi approvedMax', () => {
    const f = finalizeCredits(
      'ded-ai/complex',
      { inputTokens: 1000, outputTokens: 500 },
      { status: 'UNDETERMINED', reason: 'x' },
      600 // user setujui maks 600
    );
    expect(f.ok).toBe(true);
    expect(f.creditsCharged <= 600).toBe(true);
  });

  it('9. finalize tanpa approvedMax pakai tarif max', () => {
    const f = finalizeCredits('chat-ai/fast', null, { status: 'USAGE_UNAVAILABLE' }, null);
    expect(f.creditsCharged).toBe(20);
    expect(f.usage.status).toBe('USAGE_UNAVAILABLE');
  });
});

describe('usageMeter', () => {
  it('10. record menyimpan metadata tanpa prompt/dokumen', async () => {
    const meter = createUsageMeter(null);
    const r = await meter.record({
      jobId: 'job_1', requestId: 'req_1', idempotencyKey: 'um_req_1',
      userId: 'u1', feature: 'chat-ai/fast',
      provider: 'gemini', model: 'gemini-3.5-flash-lite',
      usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, cachedTokens: 200, source: 'gemini_usageMetadata' },
      attempts: 1, durationMs: 1500, status: 'actual',
    });
    expect(r.ok).toBe(true);
    expect(r.entry.tokens_in).toBe(1200);
    expect(r.entry.tokens_cached).toBe(200); // cached tercatat terpisah, tidak double-count
    expect(r.entry.cost_status).toBe('UNDETERMINED'); // tarif belum dikonfigurasi
    // prompt tidak disimpan
    expect(r.entry.prompt).toBe(undefined);
  });

  it('11. idempotensi: record duplikat tidak menggandakan', async () => {
    const adapter = createMemoryAdapter();
    const meter = createUsageMeter(adapter);
    const rec = {
      jobId: 'job_2', requestId: 'req_2', idempotencyKey: 'um_dup',
      userId: 'u1', feature: 'chat-ai/fast',
      provider: 'gemini', model: 'gemini-3.5-flash-lite',
      usage: { inputTokens: 100, outputTokens: 50 },
      attempts: 1, durationMs: 800, status: 'actual',
    };
    const r1 = await meter.record(rec);
    const r2 = await meter.record(rec);
    expect(r1.ok).toBe(true);
    expect(r2.duplicate).toBe(true);
    expect(adapter.usageLog.length).toBe(1);
  });

  it('12. usage tidak tersedia → status undetermined, bukan angka karangan', async () => {
    const meter = createUsageMeter(null);
    const r = await meter.record({
      jobId: 'job_3', requestId: 'req_3', idempotencyKey: 'um_req_3',
      userId: 'u1', feature: 'chat-ai/fast',
      provider: 'atria', model: 'Atria-Dawn-Preview',
      usage: null, attempts: 2,
      failures: [{ provider: 'gemini', error: 'timeout' }],
      durationMs: 3000, status: 'actual',
    });
    expect(r.ok).toBe(true);
    expect(r.entry.tokens_in).toBe(null);
    expect(r.entry.cost_status).toBe('USAGE_UNAVAILABLE');
    expect(r.entry.attempts).toBe(2);
  });

  it('13. kegagalan provider tercatat jujur (bukan sukses)', async () => {
    const meter = createUsageMeter(null);
    const r = await meter.record({
      jobId: 'job_4', requestId: 'req_4', idempotencyKey: 'um_req_4',
      userId: 'u1', feature: 'ded-ai',
      provider: null, model: null, usage: null,
      attempts: 3, durationMs: 90000,
      status: 'failed', error: 'All providers failed',
    });
    expect(r.entry.status).toBe('failed');
    expect(r.entry.credits_charged).toBe(null);
  });
});

describe('creditEngine integrasi Phase 3', () => {
  it('14. reserve → release: sisa kembali, tidak melebihi max', async () => {
    const engine = createCreditEngine(createMemoryAdapter());
    await engine.grant('u1', 10000, 'subscription_grant', { idempotencyKey: 'g1' });
    const rsv = await engine.reserve('u1', 'job_ded_1', 'ded-ai', 800, { idempotencyKey: 'rsv1' });
    expect(rsv.ok).toBe(true);
    // pakai aktual 500 dari 800 → 300 dilepas
    const rel = await engine.releaseReservation('u1', rsv.reservation.id, 500, { idempotencyKey: 'rel1' });
    expect(rel.ok).toBe(true);
    expect(rel.used).toBe(500);
    expect(rel.released).toBe(300);
    const bal = await engine.getBalance('u1');
    expect(bal.reserved).toBe(0);
  });

  it('15. actual melebihi max → dipotong ke max (tidak overcharge)', async () => {
    const engine = createCreditEngine(createMemoryAdapter());
    await engine.grant('u1', 10000, 'subscription_grant', { idempotencyKey: 'g1' });
    const rsv = await engine.reserve('u1', 'job_ded_2', 'ded-ai', 800, { idempotencyKey: 'rsv2' });
    const rel = await engine.releaseReservation('u1', rsv.reservation.id, 5000, { idempotencyKey: 'rel2' });
    expect(rel.used).toBe(800); // capped ke max
  });

  it('16. debit duplikat (retry) tidak menggandakan', async () => {
    const engine = createCreditEngine(createMemoryAdapter());
    await engine.grant('u1', 10000, 'subscription_grant', { idempotencyKey: 'g1' });
    const d1 = await engine.debit('u1', 20, { idempotencyKey: 'dup1' });
    const d2 = await engine.debit('u1', 20, { idempotencyKey: 'dup1' });
    expect(d1.ok).toBe(true);
    expect(d2.duplicate).toBe(true);
    const bal = await engine.getBalance('u1');
    expect(bal.total).toBe(9980); // hanya sekali
  });

  it('17. isolasi antar user', async () => {
    const engine = createCreditEngine(createMemoryAdapter());
    await engine.grant('uA', 100, 'topup', { idempotencyKey: 'ga' });
    const d = await engine.debit('uB', 10, { idempotencyKey: 'db' });
    expect(d.aborted).toBe(true); // uB tidak punya saldo
    expect(d.reason).toBe('INSUFFICIENT_BALANCE');
  });
});
