/**
 * POST /api/ai/tools/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 *
 * Routing per produk (Wave-1 remediation AI-01 — sebelumnya SEMUA produk
 * selain DED_AI_DETAIL dipaksa 'fast', sehingga rantai chat tidak pernah
 * terjangkau dan toggle Cepat/Mendalam di Chat AI tidak berpengaruh):
 * - EZRAB_AI (Chat AI): mode 'fast' (Cepat)    -> rantai 'chat'
 *     River NVIDIA Nemotron -> River DeepSeek -> Dahl -> ZyRouter (+ ekor generik)
 *   EZRAB_AI mode 'advanced' (Mendalam)       -> rantai 'advanced'
 *     ZyRouter geminiflash-3.8 -> Gemini flash lite (+ ekor generik)
 * - DED_AI_DETAIL                             -> 'advanced'
 * - DED_AI_FAST, DOKUMEN_AI, lainnya          -> 'fast'
 *     River DeepSeek-V4.1-Flash -> Gemini flash lite -> Dahl -> ZyRouter
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
