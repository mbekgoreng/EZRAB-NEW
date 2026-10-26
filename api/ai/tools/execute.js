/**
 * POST /api/ai/tools/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 *
 * Routing per produk (Wave-1 remediation AI-01 — sebelumnya SEMUA produk
 * selain DED_AI_DETAIL dipaksa 'fast', sehingga rantai chat tidak pernah
 * terjangkau dan toggle Cepat/Mendalam di Chat AI tidak berpengaruh).
 * Susunan rantai (F7, 2026-10-23 — mengikuti urutan prioritas owner):
 * - EZRAB_AI (Chat AI): mode default           -> rantai 'chat'
 *     Gemini native (gemini-3.5-flash-lite) -> AtmoRouter ag/gemini-3.8-flash-high
 *     -> AtmoRouter cx/gpt-6-luna -> ZyRouter geminiflash-3.8 (+ ekor generik)
 *   EZRAB_AI mode 'advanced' (Mendalam)       -> rantai 'advanced' (kepala sama)
 * - DED_AI_DETAIL                             -> 'advanced'
 * - DED_AI_FAST, DOKUMEN_AI, lainnya          -> 'fast'
 *     Gemini native -> River DeepSeek V4.1 -> AtmoRouter DeepSeek flash
 *     -> ZyRouter + ekor chat (perbaikan 2026-10-27: fast sebelumnya mati
 *     bila Gemini native gagal dan Crown/River/Atmo tak punya key)
 */
import { handleAiRequest } from '../../_lib/aiGateway.js';

function productIdToMode(pid, requestedMode) {
  if (pid === 'DED_AI_DETAIL') return 'advanced';
  if (pid === 'EZRAB_AI') return requestedMode === 'advanced' ? 'advanced' : 'chat';
  return 'fast';
}

export default async function handler(req, res) {
  return handleAiRequest(req, res, { productIdToMode });
}
