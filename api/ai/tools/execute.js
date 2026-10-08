/**
 * POST /api/ai/tools/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 * Preserves the legacy contract: productId DED_AI_DETAIL / DOKUMEN_AI -> advanced mode.
 */
import { handleAiRequest } from '../../_lib/aiGateway.js';

function productIdToMode(pid) {
  return pid === 'DED_AI_DETAIL' || pid === 'DOKUMEN_AI' ? 'advanced' : 'fast';
}

export default async function handler(req, res) {
  return handleAiRequest(req, res, { productIdToMode });
}
