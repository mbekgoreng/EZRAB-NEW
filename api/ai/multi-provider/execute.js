/**
 * POST /api/ai/multi-provider/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 * Accepts message | prompt | input and mode | capabilityMode (legacy compat).
 */
import { handleAiRequest } from '../../_lib/aiGateway.js';

export default async function handler(req, res) {
  return handleAiRequest(req, res, {});
}
