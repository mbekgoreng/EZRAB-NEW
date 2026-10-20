/**
 * GET /api/access/session — report whether the caller holds a valid
 * temporary access session. Used by the SPA gate screen to decide its
 * initial state. Reveals nothing sensitive: no code, no secret, only
 * booleans derived from the caller's own cookie.
 */
import { applyCors } from '../_lib/security.js';
import { checkAccessSession, getAccessConfig } from '../_lib/accessGate.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { configured } = getAccessConfig();
  const session = checkAccessSession(req);
  return res.status(200).json({
    success: true,
    configured,
    active: session.active,
  });
}
