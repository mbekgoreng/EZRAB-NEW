/**
 * GET /api/ai/multi-provider/providers
 * Phase 2 hardening: CORS allowlist (was `*`), rate limiting.
 * Returns provider availability only — never keys.
 * MASKING (2026-11-16): respons TIDAK PERNAH memuat nama provider/model
 * asli. Bentuk dipertahankan ({ success, providers: [{ id, label,
 * models, available }] }) tetapi isinya hanya dua alias EZRAB dengan id
 * netral. Ketersediaan diturunkan dari pemeriksaan key env yang SAMA
 * seperti sebelumnya, diagregasi: setiap provider yang dicek di sini
 * mengisi kaki di KEDUA tier (rantai flash maupun pro), jadi satu key
 * mana pun yang terpasang membuat kedua alias tersedia; tanpa key sama
 * sekali, array kosong (konvensi lama: hanya entri tersedia yang muncul,
 * tanpa `available: false`).
 * 2026-11-22 (spesifikasi final owner 01:37): HANYA key Crown/River/Atmo
 * yang dihitung — Gemini/WeizeRouter/Dahl/Atria/gemini-oai/ZyRouter keluar
 * dari rantai teks, jadi key mereka tidak lagi membuktikan ketersediaan
 * tier chat apa pun. CATATAN: agregat ini kasar — pro secara ketat butuh
 * key Atmo (satu-satunya provider rantai 'advanced'/'ded'), jadi key
 * Crown saja tetap menampilkan kedua alias; itu konvensi lama yang
 * dipertahankan (lihat komentar agregat di atas), bukan klaim per-tier.
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

  // Pemeriksaan key env — HANYA Crown/River/Atmo (spesifikasi final
  // owner 2026-11-22 01:37: ketiga provider itulah yang melayani rantai
  // teks; loop Gemini/ZyRouter/WeizeRouter/Atria/Dahl DIHAPUS — provider
  // itu tidak lagi melayani tier chat mana pun). Hanya hasil agregatnya
  // yang dipakai; nama provider tidak pernah keluar.
  let anyKeys = false;
  for (let i = 0; i <= 4 && !anyKeys; i++) {
    const k = i === 0 ? process.env.CROWN_API_KEY : process.env['CROWN_API_KEY_' + i];
    if ((k || '').trim()) { anyKeys = true; break; }
  }
  // River: RIVER_API_KEY polos + RIVER_API_KEY_1..10 (rentang sama seperti
  // envKeys('RIVER_API_KEY', 10) di aiGateway.js — pengganti ArxPay sejak
  // 2026-11-22, owner 2026-11-22 01:21).
  for (let i = 0; i <= 10 && !anyKeys; i++) {
    const k = i === 0 ? process.env.RIVER_API_KEY : process.env['RIVER_API_KEY_' + i];
    if ((k || '').trim()) { anyKeys = true; break; }
  }
  // Atmo: ATMO_API_KEY polos + ATMO_API_KEY_1..4 (pengganti ArxPay kedua
  // sejak 2026-11-22 — lihat komentar River di atas).
  for (let i = 0; i <= 4 && !anyKeys; i++) {
    const k = i === 0 ? process.env.ATMO_API_KEY : process.env['ATMO_API_KEY_' + i];
    if ((k || '').trim()) { anyKeys = true; break; }
  }
  const providers = anyKeys
    ? [
        { id: 'ezrab-flash', label: 'EZRAB Flash', models: [EZRAB_MODEL_FLASH], available: true },
        { id: 'ezrab-pro', label: 'EZRAB Pro', models: [EZRAB_MODEL_PRO], available: true },
      ]
    : [];
  return res.status(200).json({ success: true, providers });
}
