/**
 * Phase 2 hardening — AI gateway FULL-PIPELINE integration tests (no network).
 * Exercises handleAiRequest end-to-end with a stubbed upstream fetch.
 * Run: node src/test/phase2GatewayIntegration.mjs
 */
import { handleAiRequest } from '../../api/_lib/aiGateway.js';

// Test env: dummy provider keys so the failover chain has attempts to make
// (upstream fetch is stubbed below — no real network).
process.env.GEMINI_API_KEY_1 = 'test-dummy-key';

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

// minimal Express-like req/res
function mockReq({ method = 'POST', headers = {}, body } = {}) {
  return { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), body, socket: { remoteAddress: '10.0.0.7' } };
}
function mockRes() {
  const res = {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { this.body = ''; return this; },
  };
  return res;
}

// stub upstream: Gemini answers OK for any key
let fetchCalls = 0;
global.fetch = async (url) => {
  fetchCalls++;
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'halo dari AI' }] } }] }),
  };
};

const validBody = { message: 'berapa harga semen?', mode: 'fast' };

await test('OPTIONS preflight -> 200', async () => {
  const res = mockRes();
  await handleAiRequest(mockReq({ method: 'OPTIONS', headers: { origin: 'https://ezrab-site.vercel.app' } }), res);
  eq(res.statusCode, 200);
});

await test('GET -> 405', async () => {
  const res = mockRes();
  await handleAiRequest(mockReq({ method: 'GET' }), res);
  eq(res.statusCode, 405);
});

await test('evil Origin -> 403, no AI call', async () => {
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(mockReq({ headers: { origin: 'https://evil.example.com' }, body: validBody }), res);
  eq(res.statusCode, 403);
  eq(fetchCalls, 0, 'AI must not be invoked on CORS rejection');
});

await test('empty message -> 400, no AI call', async () => {
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(mockReq({ body: {} }), res);
  eq(res.statusCode, 400);
  eq(fetchCalls, 0, 'AI must not be invoked on validation failure');
});

await test('valid request (degraded mode) -> 200 with traceable provider/model', async () => {
  delete process.env.AI_GATEWAY_TOKEN;
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(mockReq({ body: validBody }), res);
  eq(res.statusCode, 200);
  eq(res.body.success, true);
  eq(res.body.content, 'halo dari AI');
  ok(res.body.provider === 'gemini', 'actual provider recorded');
  ok(res.body.model === 'gemini-3.5-flash-lite', 'actual model recorded');
  ok(typeof res.body.requestId === 'string' && res.body.requestId.startsWith('req_'), 'requestId');
  ok(typeof res.body.durationMs === 'number', 'durationMs');
  ok(res.headers['x-ratelimit-limit'], 'rate-limit headers present');
  eq(fetchCalls, 1, 'exactly one upstream call');
});

await test('token enforced: missing -> 401, wrong -> 401, correct -> 200', async () => {
  process.env.AI_GATEWAY_TOKEN = 'tok123';
  let res = mockRes();
  await handleAiRequest(mockReq({ body: validBody }), res);
  eq(res.statusCode, 401);
  eq(res.body.errorCode, 'AUTH_REQUIRED');

  res = mockRes();
  await handleAiRequest(mockReq({ headers: { 'x-ezrab-api-token': 'nope' }, body: validBody }), res);
  eq(res.statusCode, 401);

  fetchCalls = 0;
  res = mockRes();
  await handleAiRequest(mockReq({ headers: { 'x-ezrab-api-token': 'tok123' }, body: validBody }), res);
  eq(res.statusCode, 200);
  eq(fetchCalls, 1);
  delete process.env.AI_GATEWAY_TOKEN;
});

await test('rate limit -> 429 after budget exhausted (no AI call on 429)', async () => {
  delete process.env.AI_GATEWAY_TOKEN;
  process.env.AI_RATE_LIMIT_PER_MIN = '3';
  const req = () => mockReq({ body: {} }); // invalid body: consumes budget, never calls AI
  let last;
  for (let i = 0; i < 5; i++) { last = mockRes(); await handleAiRequest(req(), last); }
  eq(last.statusCode, 429);
  eq(last.body.errorCode, 'RATE_LIMITED');
  ok(last.body.retryAfterMs >= 0, 'retryAfterMs present');
  delete process.env.AI_RATE_LIMIT_PER_MIN;
});

await test('upstream failure -> 502 (never silent success)', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500 });
  const res = mockRes();
  await handleAiRequest(mockReq({ body: validBody }), res);
  eq(res.statusCode, 502);
  eq(res.body.success, false);
  global.fetch = realFetch;
});

console.log(failures === 0 ? '\nALL GATEWAY INTEGRATION TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
