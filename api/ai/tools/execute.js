/**
 * POST /api/ai/tools/execute
 *
 * Thin wrapper over the canonical AI gateway (api/_lib/aiGateway.js).
 *
 * Routing per produk (Wave-1 remediation AI-01 — sebelumnya SEMUA produk
 * selain DED_AI_DETAIL dipaksa 'fast', sehingga rantai chat tidak pernah
 * terjangkau dan toggle Cepat/Mendalam di Chat AI tidak berpengaruh).
 * Susunan rantai = SPESIFIKASI FINAL owner 2026-11-22 01:37 (rantai =
 * PERSIS kaki yang terdaftar; WeizeRouter + Gemini native + ekor
 * ZyRouter/Dahl/Atria/gemini-oai KELUAR dari semua rantai teks; ArxPay
 * sudah keluar 2026-11-22 01:21). Urutan lama (Crown GLM-dulu, WeizeRouter-
 * dulu) ada di git history. Detail kaki ada di executeAI
 * (api/_lib/aiGateway.js):
 * - EZRAB_AI (Chat AI): mode default           -> rantai 'chat' (Cepat)
 *     Crown DeepSeek-V4-Flash-0731 -> River DeepSeek-V4.1-Flash-1017
 *     -> AtmoRouter mm/MiniMax-M3.1-Flash -> zai/glm-5.3-flash
 *   EZRAB_AI mode 'advanced' (Mendalam)       -> rantai 'advanced'
 *     AtmoRouter cx/gpt-6-luna -> ag/gemini-3.8-flash-high
 *     -> mv/mistral-medium-3-5
 * - DED_AI_DETAIL                             -> 'ded' (DED Dalam)
 *     AtmoRouter cx/gpt-6-luna -> ag/gemini-3.8-flash-high
 * - DOKUMEN_AI                                -> 'docai' (Document AI;
 *     dipisah dari 'advanced' 2026-11-22 — rantainya sama dengan 'chat':
 *     Crown DeepSeek-V4-Flash-0731 -> River DeepSeek-V4.1-Flash-1017
 *     -> AtmoRouter mm/MiniMax-M3.1-Flash -> zai/glm-5.3-flash)
 * - DED_AI_FAST, lainnya                      -> 'fast' (DED Cepat; juga
 *     default mode tak dikenal)
 *     Crown DeepSeek-V4-Flash-0731 -> River Nemotron
 *     -> River DeepSeek-V4.1-Flash-1017 -> AtmoRouter cx/gpt-6-luna
 * Mode 'docai' hanya diturunkan di server (seperti 'chat'/'ded'):
 * validateAiInput menjepit mode body ke 'advanced'/'vision'/'fast',
 * jadi pemetaan productId inilah yang membawa mode ke gateway.
 */
import { handleAiRequest } from '../../_lib/aiGateway.js';

export function productIdToMode(pid, requestedMode) {
  if (pid === 'DED_AI_DETAIL') return 'ded';
  // 2026-11-22: Document AI dipisah dari 'advanced' — spesifikasi final
  // owner 01:37 memberi DocAI rantainya sendiri ('docai'), yang persis
  // sama dengan Chat Cepat, BUKAN Chat Mendalam.
  if (pid === 'DOKUMEN_AI') return 'docai';
  if (pid === 'EZRAB_AI') return requestedMode === 'advanced' ? 'advanced' : 'chat';
  return 'fast';
}

export default async function handler(req, res) {
  return handleAiRequest(req, res, { productIdToMode });
}
