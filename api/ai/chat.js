/**
 * POST /api/ai/chat
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 * Phase 2 hardening: token auth, rate limiting, CORS allowlist, strict input
 * validation, and structured secret-free logging all live in the gateway.
 */
import { handleAiRequest } from '../_lib/aiGateway.js';

export default async function handler(req, res) {
  return handleAiRequest(req, res, {});
}
