/**
 * GET /api/ai/engine-status — health check.
 * Phase 2 hardening: CORS allowlist (was `*`), rate limiting.
 * Returns key AVAILABILITY booleans only — never key values, and (audit
 * 2026-10-31, F6) no longer exact key COUNTS: counts told an anonymous
 * caller exactly how much provider quota sits behind each provider.
 * MASKING (2026-11-16): field `providers` dan `modes` DIHAPUS dari
 * respons — keduanya membocorkan nama provider/model asli ke PUBLIK
 * anonim (endpoint ini sengaja publik, tanpa auth).
 *
 * RANTAI FINAL (O-01, Fast Track 2026-11-24; spesifikasi owner
 * 2026-11-22, implementasi di api/_lib/aiGateway.js): hanya Crown,
 * River, dan Atmo yang masih dipakai rantai mana pun. Health check ini
 * menghitung key KETIGA provider itu saja (nama polos + bernomor,
 * mengikuti semantik envKeys gateway: Crown/Atmo _1..4, River _1..10).
 * Key legacy (Gemini/Atria/Dahl/gemini-oai/ZyRouter) TIDAK lagi dihitung:
 * sebelumnya mereka membuat status `ready` palsu padahal tidak ada satu
 * pun kaki rantai final yang bisa jalan, dan sebaliknya `no_keys` palsu
 * bila hanya provider final yang terkonfigurasi.
 *
 * Respons kini { success, status, time, chains } — `chains` berisi
 * boolean kesiapan per rantai, dikunci NAMA FITUR (chatFast, chatDeep,
 * dedFast, dedDeep, docai), BUKAN nama provider/model: tidak ada nama
 * provider/model dan tidak ada hitungan key yang bocor ke publik.
 * `status` tetap 'ready' | 'no_keys' (ready = minimal satu rantai siap)
 * — satu-satunya yang dibaca konsumen (aiStatus.ts,
 * UnifiedSettingsView.tsx), jadi kontrak lama tidak berubah.
 */
import { applyCors, rateLimit } from '../_lib/security.js';

/** Ada key untuk provider ini? Nama polos + bernomor (semantik envKeys gateway). */
function hasKeys(prefix, count) {
  if ((process.env[prefix] || '').trim()) return true;
  for (let i = 1; i <= count; i++) {
    if ((process.env[prefix + '_' + i] || '').trim()) return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rl = rateLimit(req, { limit: 120, keyPrefix: 'rl-status' });
  if (!rl.allowed) {
    return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan.' });
  }

  // SECURITY (P0 fix): do NOT disclose auth posture (authMode / degradedMode)
  // publicly — it tells an attacker whether auth is enforced. Availability
  // booleans are enough for the UI health check.
  const crown = hasKeys('CROWN_API_KEY', 4);
  const river = hasKeys('RIVER_API_KEY', 10);
  const atmo = hasKeys('ATMO_API_KEY', 4);

  // Kesiapan per rantai (spesifikasi final owner 2026-11-22):
  // - Chat Cepat / DED Cepat / DocAI: Crown -> River -> Atmo (siap bila
  //   salah satu kakinya punya key).
  // - Chat Mendalam / DED Dalam: Atmo saja (siap bila Atmo punya key).
  const anyFastLeg = crown || river || atmo;
  const chains = {
    chatFast: anyFastLeg,
    chatDeep: atmo,
    dedFast: anyFastLeg,
    dedDeep: atmo,
    docai: anyFastLeg,
  };
  const ready = Object.values(chains).some(Boolean);
  return res.status(200).json({
    success: true,
    status: ready ? 'ready' : 'no_keys',
    chains,
    time: new Date().toISOString(),
  });
}
