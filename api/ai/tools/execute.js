/**
 * POST /api/ai/tools/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 * Preserves the legacy contract: productId DED_AI_DETAIL / DOKUMEN_AI -> advanced mode.
 */
import { handleAiRequest } from '../../_lib/aiGateway.js';

function productIdToMode(pid) {
  // DOKUMEN_AI pakai fast (deepseek 4.1 flash + gemini flash lite)
  // Hanya DED_AI_DETAIL yang pakai advanced (zyrouter + gemini 3.8)
  return pid === 'DED_AI_DETAIL' ? 'advanced' : 'fast';
}

export default async function handler(req, res) {
  return handleAiRequest(req, res, { productIdToMode });
}
