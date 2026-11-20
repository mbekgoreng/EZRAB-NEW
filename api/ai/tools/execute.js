/**
 * POST /api/ai/tools/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 *
 * Routing per produk (Wave-1 remediation AI-01 — sebelumnya SEMUA produk
 * selain DED_AI_DETAIL dipaksa 'fast', sehingga rantai chat tidak pernah
 * terjangkau dan toggle Cepat/Mendalam di Chat AI tidak berpengaruh).
 * Susunan rantai (F7, 2026-10-23 — mengikuti urutan prioritas owner;
 * rantai 'ded' + 'fast' WeizeRouter-dulu + fallback Crown (WeizeRouter-only
 * 2026-11-19 s.d. 2026-11-20; fallback Crown sejak keputusan owner
 * 2026-11-20 10:56, sesudah DED gagal live karena WeizeRouter 401)):
 * - EZRAB_AI (Chat AI): mode default           -> rantai 'chat'
 *     WeizeRouter weizerouter-v2 -> kimi-k2.7 -> kimi-k2.6 -> ArxPay
 *     -> Crown x2 -> Gemini native -> AtmoRouter ag/cx -> ZyRouter (+ ekor)
 *   EZRAB_AI mode 'advanced' (Mendalam)       -> rantai 'advanced' (kepala sama)
 * - DED_AI_DETAIL                             -> 'ded' (WeizeRouter-dulu +
 *     fallback Crown: wz/gpt-6-luna -> weizerouter-v1 -> wz/gemini-3.8-flash-high
 *     -> wz/grok-4.7 -> wz/deepseek-v4-pro -> Crown GLM-5.3-Flash
 *     -> DeepSeek-V4-Flash-0731 -> MiniMax-M2.7)
 * - DOKUMEN_AI                                -> 'advanced' (WeizeRouter gpt-6-luna pertama — user 2026-11-16)
 * - DED_AI_FAST, lainnya                      -> 'fast' (WeizeRouter-dulu +
 *     fallback Crown: weizerouter-v2 -> wz/gpt-6-luna -> wz/qwen3.8-flash
 *     -> wz/deepseek-v4-flash-0731 -> weizerouter-v1 -> wz/gemini-3.8-flash
 *     -> Crown GLM-5.3-Flash -> DeepSeek-V4-Flash-0731 -> MiniMax-M2.7)
 */
import { handleAiRequest } from '../../_lib/aiGateway.js';

export function productIdToMode(pid, requestedMode) {
  if (pid === 'DED_AI_DETAIL') return 'ded';
  if (pid === 'DOKUMEN_AI') return 'advanced';
  if (pid === 'EZRAB_AI') return requestedMode === 'advanced' ? 'advanced' : 'chat';
  return 'fast';
}

export default async function handler(req, res) {
  return handleAiRequest(req, res, { productIdToMode });
}
