/**
 * Fase 3B — gateway DEMO POLICY integration tests (no network).
 * Exercises handleAiRequest with an injected JWT verifier:
 *  - demo (Supabase anonymous) identities: Chat AI fast only, everything
 *    else 403 DEMO_RESTRICTED before any provider call;
 *  - registered users unaffected;
 *  - no token still 401 (fail-closed);
 *  - CORS still rejects before the demo policy;
 *  - demo rate limit is stricter and separate;
 *  - evaluateCreditAccess policy for the credit endpoints.
 * Run: node src/test/gatewayDemoPolicy.mjs
 */
import { readFileSync } from 'node:fs';
import { handleAiRequest } from '../../api/_lib/aiGateway.js';
import { evaluateCreditAccess } from '../../api/_lib/security.js';

// Supabase "configured" so authenticateRequest takes the JWT path and uses
// the injected verifier (values are dummies; verifier never calls network).
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.GEMINI_API_KEY_1 = 'test-dummy-key';
// The 'chat' chain (River -> Dahl -> Atmo -> ZyRouter) has no Gemini-native
// attempt, so give it a dummy ZyRouter key to succeed against the stub.
process.env.ZYROUTER_API_KEY = 'test-dummy-key';

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

function mockReq({ method = 'POST', headers = {}, body } = {}) {
  return { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), body, socket: { remoteAddress: '10.0.0.9' } };
}
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { this.body = ''; return this; },
  };
}

let fetchCalls = 0;
global.fetch = async () => {
  fetchCalls++;
  // Dual-shape stub: Gemini-native parsers read `candidates`, the
  // OpenAI-compatible chains (ZyRouter/River/…) read `choices`.
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'halo dari AI' }] } }],
      choices: [{ message: { content: 'halo dari AI' } }],
    }),
  };
};

// Same product routing as api/ai/tools/execute.js
const productIdToMode = (pid, requestedMode) => {
  if (pid === 'DED_AI_DETAIL') return 'advanced';
  if (pid === 'EZRAB_AI') return requestedMode === 'advanced' ? 'advanced' : 'chat';
  return 'fast';
};
const verifierFor = (user) => async (token) =>
  token ? { ok: true, user } : { ok: false, reason: 'missing_token' };

const ORIGIN = { origin: 'https://ezrab-site.vercel.app', authorization: 'Bearer test-jwt' };
const demoUser = (id) => ({ id, email: null, isAnonymous: true });
const registeredUser = { id: 'user-registered-1', email: 'user@example.id', isAnonymous: false };
const body = (extra = {}) => ({ message: 'berapa harga semen?', mode: 'fast', productId: 'EZRAB_AI', ...extra });

await test('demo + Chat AI fast -> 200, provider called', async () => {
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(mockReq({ headers: ORIGIN, body: body() }), res, { productIdToMode, jwtVerifier: verifierFor(demoUser('demo-a')) });
  eq(res.statusCode, 200, 'status');
  eq(res.body.success, true, 'success');
  ok(fetchCalls > 0, 'provider should be called');
});

await test('demo + Chat AI advanced -> 403 DEMO_RESTRICTED, provider NOT called', async () => {
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(mockReq({ headers: ORIGIN, body: body({ mode: 'advanced' }) }), res, { productIdToMode, jwtVerifier: verifierFor(demoUser('demo-b')) });
  eq(res.statusCode, 403, 'status');
  eq(res.body.errorCode, 'DEMO_RESTRICTED', 'errorCode');
  eq(fetchCalls, 0, 'provider must not be called');
});

await test('demo + DED_AI_FAST -> 403 DEMO_RESTRICTED', async () => {
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(mockReq({ headers: ORIGIN, body: body({ productId: 'DED_AI_FAST' }) }), res, { productIdToMode, jwtVerifier: verifierFor(demoUser('demo-c')) });
  eq(res.statusCode, 403, 'status');
  eq(res.body.errorCode, 'DEMO_RESTRICTED', 'errorCode');
  eq(fetchCalls, 0, 'provider must not be called');
});

await test('demo + request without productId (Copilot wrapper) -> 403 DEMO_RESTRICTED', async () => {
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(
    mockReq({ headers: ORIGIN, body: { message: 'halo', mode: 'fast' } }),
    res,
    { productIdToMode: () => 'chat', jwtVerifier: verifierFor(demoUser('demo-d')) }
  );
  eq(res.statusCode, 403, 'status');
  eq(res.body.errorCode, 'DEMO_RESTRICTED', 'errorCode');
  eq(fetchCalls, 0, 'provider must not be called');
});

await test('registered + Chat AI advanced -> 200 (policy does not restrict registered)', async () => {
  const res = mockRes();
  await handleAiRequest(mockReq({ headers: ORIGIN, body: body({ mode: 'advanced' }) }), res, { productIdToMode, jwtVerifier: verifierFor(registeredUser) });
  eq(res.statusCode, 200, 'status');
  eq(res.body.success, true, 'success');
});

await test('no token -> 401 AUTH_REQUIRED (fail-closed unchanged)', async () => {
  const res = mockRes();
  await handleAiRequest(mockReq({ headers: { origin: ORIGIN.origin }, body: body() }), res, { productIdToMode, jwtVerifier: verifierFor(demoUser('demo-e')) });
  eq(res.statusCode, 401, 'status');
  eq(res.body.errorCode, 'AUTH_REQUIRED', 'errorCode');
});

await test('demo + evil origin -> 403 origin rejection happens before demo policy', async () => {
  const res = mockRes();
  await handleAiRequest(
    mockReq({ headers: { origin: 'https://evil.com', authorization: 'Bearer test-jwt' }, body: body() }),
    res,
    { productIdToMode, jwtVerifier: verifierFor(demoUser('demo-f')) }
  );
  eq(res.statusCode, 403, 'status');
  eq(res.body.error, 'Origin tidak diizinkan', 'origin error, not demo error');
});

await test('demo rate limit: stricter bucket (limit=3 -> 4th request 429)', async () => {
  process.env.AI_DEMO_RATE_LIMIT_PER_MIN = '3';
  try {
    const v = verifierFor(demoUser('demo-rate'));
    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      await handleAiRequest(mockReq({ headers: ORIGIN, body: body() }), res, { productIdToMode, jwtVerifier: v });
      eq(res.statusCode, 200, `request ${i + 1} status`);
    }
    const res4 = mockRes();
    await handleAiRequest(mockReq({ headers: ORIGIN, body: body() }), res4, { productIdToMode, jwtVerifier: v });
    eq(res4.statusCode, 429, '4th request status');
    eq(res4.body.errorCode, 'RATE_LIMITED', 'errorCode');
  } finally {
    delete process.env.AI_DEMO_RATE_LIMIT_PER_MIN;
  }
});

await test('evaluateCreditAccess: failed auth -> 401, demo -> 403, registered/degraded -> allow', async () => {
  eq(evaluateCreditAccess({ ok: false }).status, 401, 'failed auth status');
  eq(evaluateCreditAccess({ ok: false }).errorCode, 'AUTH_REQUIRED', 'failed auth code');
  eq(evaluateCreditAccess(null).allow, false, 'null auth denied');
  const demo = evaluateCreditAccess({ ok: true, user: demoUser('demo-g') });
  eq(demo.allow, false, 'demo denied');
  eq(demo.status, 403, 'demo status');
  eq(demo.errorCode, 'DEMO_RESTRICTED', 'demo code');
  eq(evaluateCreditAccess({ ok: true, user: registeredUser }).allow, true, 'registered allowed');
  eq(evaluateCreditAccess({ ok: true, user: null }).allow, true, 'degraded allowed (existing contract)');
});

await test('source contract: gateway clamps demo maxTokens and verifies is_anonymous from Supabase user', async () => {
  const gw = readFileSync(new URL('../../api/_lib/aiGateway.js', import.meta.url), 'utf8');
  ok(gw.includes('DEMO_MAX_TOKENS'), 'demo token cap present');
  ok(gw.includes('input.maxTokens = DEMO_MAX_TOKENS'), 'clamp applied to validated input');
  const sa = readFileSync(new URL('../../api/_lib/supabaseAuth.js', import.meta.url), 'utf8');
  ok(sa.includes('is_anonymous'), 'is_anonymous surfaced from verified user');
});

console.log(failures === 0 ? '\nAll demo policy tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
