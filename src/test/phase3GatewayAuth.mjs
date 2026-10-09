/**
 * Phase 3 — gateway auth pipeline tests (no network).
 * Covers: Supabase JWT (mocked verifier), static token fallback, degraded mode,
 * per-user rate limiting, and the full handleAiRequest JWT path.
 * Run: node src/test/phase3GatewayAuth.mjs
 */
import { authenticateRequest, rateLimitIdentity } from '../../api/_lib/security.js';
import { isSupabaseConfigured, extractBearerToken } from '../../api/_lib/supabaseAuth.js';
import { handleAiRequest } from '../../api/_lib/aiGateway.js';

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

const mockReq = ({ headers = {}, body } = {}) => ({
  method: 'POST',
  headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  body, socket: { remoteAddress: '10.9.9.9' },
});
const mockRes = () => {
  const r = { headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { this.body = ''; return this; } };
  return r;
};

const jwtVerifierOk = async (token) =>
  token === 'good-jwt' ? { ok: true, user: { id: 'user-123', email: 'a@b.id' } } : { ok: false, reason: 'invalid_token' };

function clearEnv() {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY; delete process.env.AI_GATEWAY_TOKEN;
}

// --- config detection ---
await test('isSupabaseConfigured: false when env absent', async () => {
  clearEnv(); eq(isSupabaseConfigured(), false);
});
await test('isSupabaseConfigured: true when both set', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  eq(isSupabaseConfigured(), true); clearEnv();
});
await test('extractBearerToken parses Authorization header', async () => {
  eq(extractBearerToken(mockReq({ headers: { authorization: 'Bearer abc.def' } })), 'abc.def');
  eq(extractBearerToken(mockReq({ headers: { authorization: 'bearer XYZ' } })), 'XYZ');
  eq(extractBearerToken(mockReq()), '');
});

// --- authenticateRequest modes ---
await test('JWT mode: valid token -> ok, method jwt, user', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  const r = await authenticateRequest(mockReq({ headers: { authorization: 'Bearer good-jwt' } }), { jwtVerifier: jwtVerifierOk });
  eq(r.ok, true); eq(r.method, 'jwt'); eq(r.user.id, 'user-123'); clearEnv();
});
await test('JWT mode: missing token -> fail-closed', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  const r = await authenticateRequest(mockReq(), { jwtVerifier: jwtVerifierOk });
  eq(r.ok, false); eq(r.method, 'jwt'); eq(r.reason, 'missing_token'); clearEnv();
});
await test('JWT mode: invalid token -> fail-closed (never trusts claims)', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  const r = await authenticateRequest(mockReq({ headers: { authorization: 'Bearer bad' } }), { jwtVerifier: jwtVerifierOk });
  eq(r.ok, false); eq(r.reason, 'invalid_token'); clearEnv();
});
await test('JWT mode: client x-user-id header is ignored', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  const r = await authenticateRequest(
    mockReq({ headers: { authorization: 'Bearer good-jwt', 'x-user-id': 'attacker-id' } }),
    { jwtVerifier: jwtVerifierOk });
  eq(r.ok, true); eq(r.user.id, 'user-123', 'identity must come from verified JWT only'); clearEnv();
});
await test('token fallback: static token still works when Supabase absent', async () => {
  clearEnv(); process.env.AI_GATEWAY_TOKEN = 'svc';
  const bad = await authenticateRequest(mockReq());
  eq(bad.ok, false); eq(bad.method, 'token');
  const good = await authenticateRequest(mockReq({ headers: { 'x-ezrab-api-token': 'svc' } }));
  eq(good.ok, true); eq(good.method, 'token'); clearEnv();
});
await test('degraded: neither configured -> ok with degraded flag', async () => {
  clearEnv();
  const r = await authenticateRequest(mockReq());
  eq(r.ok, true); eq(r.method, 'none'); eq(r.degraded, true);
});

// --- per-user rate limiting identity ---
await test('rateLimitIdentity: user id when JWT, ip otherwise', async () => {
  eq(rateLimitIdentity(mockReq(), { ok: true, user: { id: 'user-123' } }), 'user:user-123');
  eq(rateLimitIdentity(mockReq(), { ok: true, method: 'none', degraded: true }).startsWith('ip:'), true);
});

// --- full pipeline via handleAiRequest ---
let fetchCalls = 0;
global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });
process.env.GEMINI_API_KEY_1 = 'dummy';

await test('pipeline JWT: missing token -> 401 Login diperlukan', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(mockReq({ body: { message: 'hi' } }), res, { jwtVerifier: jwtVerifierOk });
  eq(res.statusCode, 401); eq(res.body.errorCode, 'AUTH_REQUIRED'); eq(fetchCalls, 0);
  clearEnv();
});
await test('pipeline JWT: valid token -> 200, per-user rate limit key', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.AI_RATE_LIMIT_PER_MIN = '2';
  fetchCalls = 0;
  const req = () => mockReq({ headers: { authorization: 'Bearer good-jwt' }, body: { message: 'hi' } });
  const r1 = mockRes(); await handleAiRequest(req(), r1, { jwtVerifier: jwtVerifierOk });
  const r2 = mockRes(); await handleAiRequest(req(), r2, { jwtVerifier: jwtVerifierOk });
  const r3 = mockRes(); await handleAiRequest(req(), r3, { jwtVerifier: jwtVerifierOk });
  eq(r1.statusCode, 200); eq(r2.statusCode, 200); eq(r3.statusCode, 429, 'third request from same user is rate-limited');
  delete process.env.AI_RATE_LIMIT_PER_MIN; clearEnv();
});

console.log(failures === 0 ? '\nALL PHASE 3 AUTH TESTS PASSED' : `\n${failures} TEST(S) FAILED`);

// --- Regression: AI_ALLOW_ANONYMOUS on Vercel preview ---
// Vercel sets NODE_ENV=production on ALL deployments (incl. preview).
// Only VERCEL_ENV may decide production; otherwise anonymous preview
// access breaks with 401 and AI Online dies completely.
await test('anonymous: allowed on preview even when NODE_ENV=production', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.AI_ALLOW_ANONYMOUS = 'true';
  process.env.VERCEL_ENV = 'preview'; process.env.NODE_ENV = 'production';
  const r = await authenticateRequest(mockReq(), {});
  eq(r.ok, true, 'anonymous preview must be allowed (degraded)');
  eq(r.method, 'none');
  delete process.env.AI_ALLOW_ANONYMOUS; delete process.env.VERCEL_ENV; delete process.env.NODE_ENV; clearEnv();
});
await test('anonymous: still refused on real production', async () => {
  process.env.SUPABASE_URL = 'https://xyz.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.AI_ALLOW_ANONYMOUS = 'true';
  process.env.VERCEL_ENV = 'production'; process.env.NODE_ENV = 'production';
  const r = await authenticateRequest(mockReq(), { jwtVerifier: jwtVerifierOk });
  eq(r.ok, false, 'anonymous must stay disabled on production');
  delete process.env.AI_ALLOW_ANONYMOUS; delete process.env.VERCEL_ENV; delete process.env.NODE_ENV; clearEnv();
});

console.log(failures === 0 ? 'ALL ANONYMOUS-REGRESSION TESTS PASSED' : `${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
