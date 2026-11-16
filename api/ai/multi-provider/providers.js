/**
 * GET /api/ai/multi-provider/providers
 * Phase 2 hardening: CORS allowlist (was `*`), rate limiting.
 * Returns provider availability only — never keys.
 * MASKING (2026-11-16): respons TIDAK PERNAH memuat nama provider/model
 * asli. Bentuk dipertahankan ({ success, providers: [{ id, label,
 * models, available }] }) tetapi isinya hanya dua alias EZRAB dengan id
 * netral. Ketersediaan diturunkan dari pemeriksaan key env yang SAMA
 * seperti sebelumnya, diagregasi: setiap provider yang dicek di sini
 * mengisi kaki di KEDUA tier (rantai flash maupun pro, langsung atau
 * lewat ekor generik), jadi satu key mana pun yang terpasang membuat
 * kedua alias tersedia; tanpa key sama sekali, array kosong (konvensi
 * lama: hanya entri tersedia yang muncul, tanpa `available: false`).
 */
import { applyCors, rateLimit } from '../../_lib/security.js';
import { EZRAB_MODEL_FLASH, EZRAB_MODEL_PRO } from '../../_lib/modelMasking.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rl = rateLimit(req, { limit: 120, keyPrefix: 'rl-providers' });
  if (!rl.allowed) {
    return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan.' });
  }

  // Pemeriksaan key env yang sama seperti sebelum masking — hanya hasil
  // agregatnya yang dipakai; nama provider tidak pernah keluar.
  let anyKeys = false;
  for (let i = 1; i <= 6; i++) {
    if ((process.env['GEMINI_API_KEY_' + i] || '').trim()) { anyKeys = true; break; }
  }
  if ((process.env.ZYROUTER_API_KEY || '').trim() || (process.env.ZROUTER_API_KEY || '').trim()) {
    anyKeys = true;
  }
  for (let i = 0; i <= 4 && !anyKeys; i++) {
    const k = i === 0 ? process.env.CROWN_API_KEY : process.env['CROWN_API_KEY_' + i];
    if ((k || '').trim()) { anyKeys = true; break; }
  }
  for (let i = 0; i <= 4 && !anyKeys; i++) {
    const k = i === 0 ? process.env.ARXPAY_API_KEY : process.env['ARXPAY_API_KEY_' + i];
    if ((k || '').trim()) { anyKeys = true; break; }
  }
  for (let i = 0; i <= 4 && !anyKeys; i++) {
    const k = i === 0 ? process.env.WEIZEROUTER_API_KEY : process.env['WEIZEROUTER_API_KEY_' + i];
    if ((k || '').trim()) { anyKeys = true; break; }
  }
  for (let i = 1; i <= 14 && !anyKeys; i++) {
    if ((process.env['ATRIA_API_KEY_' + i] || '').trim()) { anyKeys = true; break; }
  }
  const providers = anyKeys
    ? [
        { id: 'ezrab-flash', label: 'EZRAB Flash', models: [EZRAB_MODEL_FLASH], available: true },
        { id: 'ezrab-pro', label: 'EZRAB Pro', models: [EZRAB_MODEL_PRO], available: true },
      ]
    : [];
  return res.status(200).json({ success: true, providers });
}
