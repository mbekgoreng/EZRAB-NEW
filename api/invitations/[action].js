/**
 * /api/invitations/[action] — SATU Serverless Function untuk semua aksi
 * Secure Invitation: create | list | validate | redeem | revoke | resend.
 *
 * Digabung dari 6 file endpoint terpisah (api/invitations/<aksi>.js) karena
 * plan Hobby Vercel membatasi 12 Serverless Functions per Deployment —
 * 6 endpoint undangan menaikkan total 11 → 17 dan menggagalkan semua
 * deployment sejak f23ec30. Vercel memetakan segmen [action] dari URL,
 * jadi URL publik tidak berubah: /api/invitations/create tetap sama, dst.
 *
 * Implementasi per aksi tidak berubah sama sekali: file ini hanya
 * meneruskan ke handler yang sama di api/_lib/invitations/handler.js
 * (yang sebelumnya di-re-export satu-satu oleh tiap file endpoint).
 * Fail-closed tetap di handler: 503 NOT_CONFIGURED bila backend
 * autentikasi/database server-side belum dikonfigurasi.
 */
import { rateLimit } from '../_lib/security.js';
import { defaultHandlers } from '../_lib/invitations/handler.js';

const ACTIONS = new Set(Object.keys(defaultHandlers));

export default async function handler(req, res) {
  // G5 (Phase B, 2026-11-20): rate limit dispatcher — 30/mnt per IP, sama
  // seperti /api/market/search, sebelum dispatch. Menutupi SEMUA aksi
  // termasuk yang belum punya limit per-aksi di
  // api/_lib/invitations/handler.js (list/revoke/resend); create/validate/
  // redeem tetap dibatasi jendela 10-menit yang lebih ketat di handler lib
  // (lapis kedua, bukan pengganti). Bentuk 429 mengikuti handler lib
  // (TOO_MANY_ATTEMPTS).
  const rl = rateLimit(req, { limit: 30, keyPrefix: 'rl-invitations' });
  if (!rl.allowed) {
    return res.status(429).json({
      success: false,
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Terlalu banyak permintaan. Coba lagi nanti.',
    });
  }
  const action = req.query?.action;
  if (!action || !ACTIONS.has(action)) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Endpoint undangan tidak ditemukan.',
    });
  }
  return defaultHandlers[action](req, res);
}
