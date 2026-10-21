/**
 * api/_lib/invitations/handler.js — handler HTTP tipis untuk endpoint
 * /api/invitations/* (Fase C/H). Semua logika ada di service.js; file ini
 * hanya mengurus: CORS, rate limit, parsing body, autentikasi, dan bentuk
 * respons — mengikuti pola api/access/verify.js + api/_lib/security.js.
 *
 * Kebijakan autentikasi endpoint manajemen (create/list/revoke/resend):
 * WAJIB JWT Supabase terverifikasi (auth.user). Mode degraded/anon DITOLAK
 * (401) — membuat undangan tidak pernah boleh anonim. Bila backend
 * (Supabase service) belum dikonfigurasi: 503 NOT_CONFIGURED, fail-closed.
 *
 * createHandlers(deps) dapat diinjeksi repository in-memory + authenticator
 * palsu untuk tes lokal (src/test/secureInvitation.test.ts).
 */
import { applyCors, rateLimit, readJsonBody, authenticateRequest } from '../security.js';
import { getInvitationRepository } from './repository.js';
import { getEmailProvider } from './email.js';
import { resolvePublicBaseUrl } from './core.js';
import * as svc from './service.js';

function requestOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (origin) return origin;
  const host = String(req.headers?.host || '').trim();
  return host ? `https://${host}` : '';
}

export function createHandlers(deps = {}) {
  const getRepo = deps.getRepo || (() => getInvitationRepository());
  const getEmail = deps.getEmailProvider || (() => getEmailProvider());
  const authenticate = deps.authenticate || ((req) => authenticateRequest(req, { jwtVerifier: deps.jwtVerifier }));
  const now = deps.nowMs;

  function serviceDeps(req) {
    return {
      repo: getRepo(),
      emailProvider: getEmail(),
      baseUrl: resolvePublicBaseUrl(process.env, requestOrigin(req)),
      nowMs: typeof now === 'function' ? now() : now,
    };
  }

  async function requireAdminActor(req, res) {
    const auth = await authenticate(req);
    if (!auth || !auth.ok || !auth.user || !auth.user.id) {
      res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Login dengan akun yang berwenang diperlukan.',
      });
      return null;
    }
    return { id: auth.user.id, email: auth.user.email || '' };
  }

  function notConfigured(res) {
    return res.status(503).json({
      success: false,
      error: 'NOT_CONFIGURED',
      message: 'Layanan undangan belum dikonfigurasi di server (database autentikasi belum aktif).',
    });
  }

  async function parseBody(req, res) {
    try {
      return await readJsonBody(req);
    } catch (e) {
      res.status(e.status || 400).json({ success: false, error: 'Body tidak valid.' });
      return undefined;
    }
  }

  function respond(res, result, okShape) {
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        error: result.error,
        message: result.message,
        messages: result.messages,
      });
    }
    return res.status(result.status).json({ success: true, ...okShape(result) });
  }

  // --- POST /api/invitations/create -------------------------------------
  async function create(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const d = serviceDeps(req);
    if (!d.repo) return notConfigured(res);
    const rl = rateLimit(req, { limit: 30, windowMs: 10 * 60 * 1000, keyPrefix: 'rl-inv-create' });
    if (!rl.allowed) return res.status(429).json({ success: false, error: 'TOO_MANY_ATTEMPTS', message: 'Terlalu banyak permintaan. Coba lagi nanti.' });
    const actor = await requireAdminActor(req, res);
    if (!actor) return;
    const body = await parseBody(req, res);
    if (body === undefined) return;
    const result = await svc.createInvitation(d, actor, body);
    return respond(res, result, (r) => ({ invitation: r.invitation, link: r.link, email: r.email }));
  }

  // --- GET /api/invitations/list?workspaceId=&filter= --------------------
  async function list(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const d = serviceDeps(req);
    if (!d.repo) return notConfigured(res);
    const actor = await requireAdminActor(req, res);
    if (!actor) return;
    const url = new URL(req.url, 'http://localhost');
    const result = await svc.listInvitations(d, actor, url.searchParams.get('workspaceId'), url.searchParams.get('filter') || 'ALL');
    return respond(res, result, (r) => ({ invitations: r.invitations }));
  }

  // --- POST /api/invitations/validate { token } (publik) -----------------
  async function validate(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const d = serviceDeps(req);
    if (!d.repo) return notConfigured(res);
    const rl = rateLimit(req, { limit: 20, windowMs: 10 * 60 * 1000, keyPrefix: 'rl-inv-validate' });
    if (!rl.allowed) return res.status(429).json({ success: false, error: 'TOO_MANY_ATTEMPTS', message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' });
    const body = await parseBody(req, res);
    if (body === undefined) return;
    const result = await svc.validateInvitationToken(d, body?.token);
    return respond(res, result, (r) => ({ summary: r.summary }));
  }

  // --- POST /api/invitations/redeem { token } + JWT penerima -------------
  async function redeem(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const d = serviceDeps(req);
    if (!d.repo) return notConfigured(res);
    const rl = rateLimit(req, { limit: 20, windowMs: 10 * 60 * 1000, keyPrefix: 'rl-inv-redeem' });
    if (!rl.allowed) return res.status(429).json({ success: false, error: 'TOO_MANY_ATTEMPTS', message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' });
    const auth = await authenticate(req);
    if (!auth || !auth.ok || !auth.user || !auth.user.id) {
      return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', message: 'Login diperlukan untuk menerima undangan.' });
    }
    const body = await parseBody(req, res);
    if (body === undefined) return;
    const result = await svc.redeemInvitation(d, { id: auth.user.id, email: auth.user.email || '' }, body?.token);
    return respond(res, result, (r) => ({ workspace: r.workspace, role: r.role }));
  }

  // --- POST /api/invitations/revoke { invitationId } ---------------------
  async function revoke(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const d = serviceDeps(req);
    if (!d.repo) return notConfigured(res);
    const actor = await requireAdminActor(req, res);
    if (!actor) return;
    const body = await parseBody(req, res);
    if (body === undefined) return;
    const result = await svc.revokeInvitation(d, actor, body?.invitationId);
    return respond(res, result, (r) => ({ invitation: r.invitation }));
  }

  // --- POST /api/invitations/resend { invitationId } ---------------------
  async function resend(req, res) {
    if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const d = serviceDeps(req);
    if (!d.repo) return notConfigured(res);
    const actor = await requireAdminActor(req, res);
    if (!actor) return;
    const body = await parseBody(req, res);
    if (body === undefined) return;
    const result = await svc.resendInvitation(d, actor, body?.invitationId);
    return respond(res, result, (r) => ({ invitation: r.invitation, link: r.link, email: r.email }));
  }

  return { create, list, validate, redeem, revoke, resend };
}

const defaults = createHandlers();
export const defaultHandlers = defaults;
