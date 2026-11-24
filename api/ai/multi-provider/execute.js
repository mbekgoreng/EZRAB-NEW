/**
 * POST /api/ai/multi-provider/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 * Accepts message | prompt | input and mode | capabilityMode (legacy compat).
 *
 * M-13 (2026-11-24): passes the shared productIdToMode mapper so DED v2/v3
 * clients can carry a productId (DED_AI_DETAIL / DED_AI_FAST) and land on
 * the DED chains instead of the body mode alone ('advanced' would otherwise
 * run the Chat Mendalam chain). Requests WITHOUT a productId are unaffected:
 * the gateway keeps the body mode verbatim (vision 'vision', assistant
 * 'advanced' / 'quick' — unchanged).
 */
import { handleAiRequest } from '../../_lib/aiGateway.js';
import { productIdToMode } from '../tools/execute.js';

export default async function handler(req, res) {
  return handleAiRequest(req, res, { productIdToMode });
}
