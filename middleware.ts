/**
 * EZRAB — Temporary dashboard access gate (Vercel Edge Middleware).
 *
 * Gates the workspace document (/app/*) and the sensitive API groups
 * (/api/ai/*, /api/credits/*, /api/market/*) behind a signed, stateless
 * session cookie minted by POST /api/access/verify.
 *
 * - The access code is NEVER present here or in any client bundle: this
 *   middleware only verifies an HMAC signature with the server-only env
 *   EZRAB_ACCESS_SESSION_SECRET. Its twin implementation lives in
 *   api/_lib/accessGate.js (Node) — the two are cross-tested for agreement.
 * - FAIL CLOSED: when the env is not configured, /app/* redirects to the
 *   gate page (which reports the unconfigured state) and protected APIs
 *   answer 503. Nothing silently opens.
 * - Allowlist (minimal, proven needs): /api/ai/engine-status (health
 *   check), /access itself (the gate page; no redirect loop), and all
 *   paths outside the matcher (landing, blog, static assets).
 *
 * Blog root (beranda blog, keputusan user 2026-10-29: URL tetap '/',
 * BUKAN '/blog/'): host blog.ezrab.site + path '/' di-rewrite ke
 * prerendered blog index (/blog/index.html) lewat header
 * 'x-middleware-rewrite', supaya Vercel sendiri melayani file statisnya.
 * Ini menggantikan redirect vercel.json ke '/blog/' (b41eafe) atas
 * permintaan user. Catatan jujur: mekanisme ini belum pernah dites di
 * production (cdeed46 tidak jadi dipromosikan); bila di production
 * ternyata juga tidak jalan, jalur berikutnya yang pasti adalah proyek
 * Vercel terpisah khusus blog. Fetch lewat edge (47239b4) sudah terbukti
 * gagal di production (body kosong/gantung) dan tidak dipakai lagi.
 * Selain host + path itu, middleware ini hanya melakukan gate di bawah.
 *
 * This is a temporary barrier, NOT user authentication.
 */

export const config = {
  matcher: [
    '/',
    '/app',
    '/app/:path*',
    '/access',
    '/api/ai/:path*',
    '/api/credits/:path*',
    '/api/market/:path*',
  ],
};

const COOKIE_NAME = 'ezrab_access';
const PUBLIC_API_PATHS = new Set(['/api/ai/engine-status']);

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha256Base64Url(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySessionToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!secret || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp)) return false;
  const expected = await hmacSha256Base64Url(secret, `v1.${parts[1]}`);
  if (!timingSafeEqualStr(expected, parts[2])) return false;
  return Math.floor(Date.now() / 1000) < exp;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Blog root (beranda): hanya blog.ezrab.site + '/' — URL tetap '/',
  // Vercel melayani /blog/index.html lewat header rewrite di bawah.
  // Jalur lain jatuh ke logika gate seperti biasa.
  if (url.hostname === 'blog.ezrab.site' && path === '/') {
    return new Response(null, {
      status: 200,
      headers: { 'x-middleware-rewrite': new URL('/blog/index.html', url).toString() },
    });
  }

  // The gate's own endpoints must NEVER be gated — defense in depth on top
  // of the matcher (which already excludes them). If this exemption were
  // lost, nobody could ever mint a session (permanent lockout).
  if (path.startsWith('/api/access/')) return undefined;

  const code = process.env.EZRAB_ACCESS_CODE || '';
  const secret = process.env.EZRAB_ACCESS_SESSION_SECRET || '';
  const configured = code.length > 0 && secret.length >= 16;

  // Health check stays public by design.
  if (PUBLIC_API_PATHS.has(path)) return undefined;

  const sessionValid = configured
    ? await verifySessionToken(secret, readCookie(request, COOKIE_NAME))
    : false;

  // Gate page: reachable without a session (no loop); with a valid session
  // it bounces straight to the dashboard.
  if (path === '/access') {
    if (sessionValid) {
      return Response.redirect(new URL('/app/dashboard', url.origin), 307);
    }
    return undefined;
  }

  // Workspace document: require a session, else send to the gate page.
  if (path === '/app' || path.startsWith('/app/')) {
    if (sessionValid) return undefined;
    const gate = new URL('/access', url.origin);
    gate.searchParams.set('next', path + url.search);
    return Response.redirect(gate, 307);
  }

  // Sensitive APIs: JSON answers, fail closed.
  if (path.startsWith('/api/')) {
    if (sessionValid) return undefined;
    if (!configured) {
      return new Response(
        JSON.stringify({ success: false, error: 'ACCESS_NOT_CONFIGURED' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: 'ACCESS_REQUIRED' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return undefined;
}
