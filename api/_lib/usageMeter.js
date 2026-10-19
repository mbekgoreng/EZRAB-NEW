/**
 * api/_lib/usageMeter.js — Usage Meter (Phase 3)
 * ============================================================================
 * Mencatat setiap pemanggilan provider AI yang benar-benar terjadi.
 *
 * - Idempoten: (idempotency_key) UNIQUE — retry tidak menggandakan catatan.
 * - Best-effort: kegagalan pencatatan TIDAK PERNAH menggagalkan request AI.
 * - Minimisasi data: TIDAK menyimpan prompt, dokumen, atau data pribadi.
 *   Hanya metadata yang relevan untuk audit biaya.
 * - TIDAK menyimpan secret/API key.
 *
 * Storage: adapter (memory untuk test; Supabase untuk produksi via
 * ai_usage_log). Dipanggil dari handleAiRequest setelah executeAI.
 */
import { computeProviderCost } from './providerTariffs.js';
import { finalizeCredits } from './creditPricing.js';

export function createUsageMeter(adapter) {
  const seen = new Set();

  /**
   * Catat satu pemanggilan provider.
   * @param {object} rec - { jobId, requestId, idempotencyKey, userId, feature,
   *   provider, model, usage, attempts, failures, durationMs, status, error,
   *   approvedMaxCredits }
   */
  async function record(rec) {
    const key = rec.idempotencyKey || ('um_' + rec.requestId);
    if (seen.has(key)) return { ok: true, duplicate: true };
    seen.add(key);

    const usage = rec.usage || null;
    const hasUsage = usage && usage.inputTokens != null && usage.outputTokens != null;
    const cost = computeProviderCost(usage, rec.model);
    const pricing = rec.feature
      ? finalizeCredits(rec.feature, usage, cost, rec.approvedMaxCredits)
      : null;

    const entry = {
      id: 'u_' + Math.random().toString(36).slice(2, 12),
      user_id: rec.userId || null,
      job_id: rec.jobId || null,
      idempotency_key: key,
      feature: rec.feature || null,
      provider: rec.provider || null,
      model: rec.model || null,
      tokens_in: hasUsage ? usage.inputTokens : null,
      tokens_out: hasUsage ? usage.outputTokens : null,
      tokens_cached: usage && usage.cachedTokens != null ? usage.cachedTokens : null,
      tokens_reasoning: usage && usage.reasoningTokens != null ? usage.reasoningTokens : null,
      usage_is_estimate: false,
      attempts: rec.attempts || 1,
      failures: rec.failures || null,
      cost_amount: cost.status === 'ACTUAL' ? cost.costUsd : null,
      cost_currency: cost.status === 'ACTUAL' ? 'USD' : null,
      cost_source: cost.status === 'ACTUAL' ? cost.tariffSource : null,
      fx_rate_idr: cost.fx ? cost.fx.usdToIdr : null,
      credits_charged: pricing && pricing.ok ? pricing.creditsCharged : null,
      status: rec.status || (hasUsage ? 'actual' : cost.status === 'USAGE_UNAVAILABLE' ? 'undetermined' : 'undetermined'),
      cost_status: cost.status,
      cost_reason: cost.reason || null,
      error: rec.error || null,
      duration_ms: rec.durationMs != null ? rec.durationMs : null,
      request_id: rec.requestId || null,
      pricing_policy: pricing && pricing.ok ? pricing.policy : null,
      created_at: new Date().toISOString(),
    };

    try {
      if (adapter && typeof adapter.saveUsage === 'function') {
        await adapter.saveUsage(entry);
      } else if (adapter && adapter.usageLog) {
        adapter.usageLog.push(entry);
      }
      return { ok: true, entry };
    } catch (e) {
      // Best-effort: catat kegagalan, jangan lempar.
      try { console.error('[usage-meter] save failed:', (e && e.message) || e); } catch {}
      return { ok: false, error: 'SAVE_FAILED', entry };
    }
  }

  async function getUsage(userId, limit = 50) {
    if (adapter && typeof adapter.getUsage === 'function') {
      return adapter.getUsage(userId, limit);
    }
    if (adapter && adapter.usageLog) {
      return adapter.usageLog.filter((u) => u.user_id === userId).slice(-limit).reverse();
    }
    return [];
  }

  return { record, getUsage };
}
