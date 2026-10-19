/**
 * POST /api/credits/estimate — Estimasi kredit server-side (Phase 3)
 *
 * Menghitung estimasi dari tarif draft yang dikelola server.
 * Frontend TIDAK boleh menghitung sendiri untuk keputusan debit —
 * angka ini hanya untuk tampilan; debit aktual ditentukan server.
 */
import { estimateCredits } from '../_lib/creditPricing.js';
import { applyCors } from '../_lib/security.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ success: false, error: 'Body tidak valid' });
  }
  const feature = String(body.feature || '');
  const result = estimateCredits(feature);
  if (!result.ok) {
    return res.status(400).json({ success: false, error: result.error });
  }
  return res.status(200).json({ success: true, ...result, simulated: false });
}
