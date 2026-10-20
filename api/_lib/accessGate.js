/**
 * EZRAB — Temporary dashboard access gate (server side).
 *
 * A SOFT, temporary barrier for the public demo while real login is off.
 * NOT user authentication and NOT per-user authorization.
 *
 * Design:
 * - The access code lives ONLY in the server env var EZRAB_ACCESS_CODE.
 *   It is never shipped to the client, never logged, never stored client-side.
 * - A correct code mints a stateless session token:
 *     v1.<exp-unix-seconds>.<base64url(HMAC-SHA256(secret, "v1." + exp))>
 *   signed with EZRAB_ACCESS_SESSION_SECRET (server-only env). The token
 *   carries nothing but its expiry — no identity, no code.
 * - The token travels in an HttpOnly cookie (see buildSessionCookie).
 * - Verification is done by api/access/* (Node) and by middleware.ts (Edge,
 *   WebCrypto twin implementation — the two are cross-tested for agreement).
 * - FAIL CLOSED: when either env var is missing, nothing is granted.
 */
import crypto from 'node:crypto';

export const ACCESS_COOKIE_NAME = 'ezrab_access';
export const ACCESS_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 jam

export function getAccessConfig(env = process.env) {
  const code = String(env.EZRAB_ACCESS_CODE || '');
  const secret = String(env.EZRAB_ACCESS_SESSION_SECRET || '');
  return {
    code,
    secret,
    configured: code.length > 0 && secret.length >= 16,
  };
}

function hmacBase64Url(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Mint a session token valid for ACCESS_SESSION_TTL_SECONDS from `nowMs`. */
export function createSessionToken(secret, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + ACCESS_SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  return `${payload}.${hmacBase64Url(secret, payload)}`;
}

/**
 * Verify a session token. Returns { valid, reason } — reason is one of
 * 'ok' | 'malformed' | 'bad-signature' | 'expired'. Never throws.
 */
export function verifySessionToken(secret, token, nowMs = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length === 0) {
    return { valid: false, reason: 'malformed' };
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { valid: false, reason: 'malformed' };
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp)) return { valid: false, reason: 'malformed' };
  const expected = hmacBase64Url(secret, `v1.${parts[1]}`);
  const givenBuf = Buffer.from(parts[2]);
  const expectedBuf = Buffer.from(expected);
  if (givenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(givenBuf, expectedBuf)) {
    return { valid: false, reason: 'bad-signature' };
  }
  if (Math.floor(nowMs / 1000) >= exp) return { valid: false, reason: 'expired' };
  return { valid: true, reason: 'ok', exp };
}

/** Constant-time code comparison (hashes first so length does not leak). */
export function accessCodeMatches(configuredCode, candidate) {
  if (!configuredCode || typeof candidate !== 'string') return false;
  const a = crypto.createHash('sha256').update(configuredCode).digest();
  const b = crypto.createHash('sha256').update(candidate).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Parse the Cookie header into a plain object (first value wins). */
export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!(name in out)) out[name] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** Read + verify the access session from a Node request. */
export function checkAccessSession(req, env = process.env) {
  const { secret, configured } = getAccessConfig(env);
  if (!configured) return { active: false, configured: false, reason: 'not-configured' };
  const cookies = parseCookies(req.headers?.cookie || '');
  const result = verifySessionToken(secret, cookies[ACCESS_COOKIE_NAME]);
  return { active: result.valid, configured: true, reason: result.reason };
}

/** Serialize the session cookie. Secure is set when the request is HTTPS. */
export function buildSessionCookie(token, req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '');
  const secure = proto === 'https' ? '; Secure' : '';
  return `${ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_SESSION_TTL_SECONDS}${secure}`;
}

/** Serialize an immediately-expiring cookie (logout / reset). */
export function buildClearCookie(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '');
  const secure = proto === 'https' ? '; Secure' : '';
  return `${ACCESS_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
