/**
 * Phase 2 hardening — AI gateway security unit tests (no network).
 * Run: node src/test/phase2GatewaySecurity.mjs
 */
import {
  applyCors, rateLimit, checkApiToken, validateAiInput, readJsonBody,
} from '../../api/_lib/security.js';

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

const mkRes = () => {
  const headers = {};
  return { headers, setHeader: (k, v) => { headers[k.toLowerCase()] = v; } };
};
const mkReq = (headers = {}) => ({ headers, socket: { remoteAddress: '1.2.3.4' } });

// --- CORS ---
test('CORS: unknown origin rejected', () => {
  const res = mkRes();
  eq(applyCors(mkReq({ origin: 'https://evil.example.com' }), res), false);
});
test('CORS: production origin allowed', () => {
  const res = mkRes();
  eq(applyCors(mkReq({ origin: 'https://ezrab-site.vercel.app' }), res), true);
  eq(res.headers['access-control-allow-origin'], 'https://ezrab-site.vercel.app');
});
test('CORS: arbitrary vercel.app subdomain REJECTED by default (wildcard removed)', () => {
  const res = mkRes();
  eq(applyCors(mkReq({ origin: 'https://ezrab-site-abc123-yf-arch.vercel.app' }), res), false);
});
test('CORS: preview origin allowed when explicitly allowlisted via env', () => {
  process.env.CORS_ALLOWED_ORIGINS = 'https://ezrab-site-abc123-yf-arch.vercel.app';
  const res = mkRes();
  try {
    eq(applyCors(mkReq({ origin: 'https://ezrab-site-abc123-yf-arch.vercel.app' }), res), true);
  } finally { delete process.env.CORS_ALLOWED_ORIGINS; }
});
test('CORS: no origin (same-origin/curl) passes through', () => {
  eq(applyCors(mkReq({}), mkRes()), true);
});
test('CORS: lookalike domain rejected', () => {
  eq(applyCors(mkReq({ origin: 'https://ezrab-site.vercel.app.evil.com' }), mkRes()), false);
});

// --- rate limit ---
test('rateLimit: blocks after limit', () => {
  const req = mkReq();
  let last;
  for (let i = 0; i < 4; i++) last = rateLimit(req, { limit: 3, windowMs: 60000, keyPrefix: 't1' });
  eq(last.allowed, false);
  eq(last.remaining, 0);
});
test('rateLimit: separate keys are independent', () => {
  const a = mkReq(); a.socket.remoteAddress = '9.9.9.9';
  const r = rateLimit(a, { limit: 1, windowMs: 60000, keyPrefix: 't2' });
  eq(r.allowed, true);
  eq(rateLimit(a, { limit: 1, windowMs: 60000, keyPrefix: 't2' }).allowed, false);
});

// --- token auth ---
test('token auth: degraded mode when AI_GATEWAY_TOKEN unset', () => {
  delete process.env.AI_GATEWAY_TOKEN;
  const r = checkApiToken(mkReq());
  eq(r.enforced, false); eq(r.ok, true);
});
test('token auth: missing token rejected when enforced', () => {
  process.env.AI_GATEWAY_TOKEN = 's3cr3t';
  const r = checkApiToken(mkReq());
  eq(r.enforced, true); eq(r.ok, false); eq(r.reason, 'missing_token');
});
test('token auth: wrong token rejected', () => {
  const r = checkApiToken(mkReq({ 'x-ezrab-api-token': 'wrong' }));
  eq(r.ok, false); eq(r.reason, 'invalid_token');
});
test('token auth: correct header token accepted', () => {
  const r = checkApiToken(mkReq({ 'x-ezrab-api-token': 's3cr3t' }));
  eq(r.ok, true);
});
test('token auth: correct Bearer token accepted', () => {
  const r = checkApiToken(mkReq({ authorization: 'Bearer s3cr3t' }));
  eq(r.ok, true);
});
delete process.env.AI_GATEWAY_TOKEN;

// --- input validation ---
test('validation: empty message rejected', () => {
  const { errors } = validateAiInput({ message: '   ' });
  ok(errors.length > 0, 'expected errors');
});
test('validation: oversize message rejected', () => {
  const { errors } = validateAiInput({ message: 'x'.repeat(20001) });
  ok(errors.length > 0, 'expected errors');
});
test('validation: temperature clamped to [0,1]', () => {
  eq(validateAiInput({ message: 'hi', temperature: 5 }).input.temperature, 1);
  eq(validateAiInput({ message: 'hi', temperature: -2 }).input.temperature, 0);
});
test('validation: maxTokens clamped to [100,8000]', () => {
  eq(validateAiInput({ message: 'hi', maxTokens: 99999 }).input.maxTokens, 8000);
  eq(validateAiInput({ message: 'hi', maxTokens: 1 }).input.maxTokens, 100);
});
test('validation: prompt/input aliases + advanced mode', () => {
  const { errors, input } = validateAiInput({ prompt: 'halo', capabilityMode: 'advanced' });
  eq(errors.length, 0); eq(input.message, 'halo'); eq(input.mode, 'advanced');
});
test('validation: systemPrompt capped at 8000 chars', () => {
  const { input } = validateAiInput({ message: 'hi', systemPrompt: 'y'.repeat(9000) });
  eq(input.systemPrompt.length, 8000);
});

// --- body ---
test('readJsonBody: oversize string body throws 413', async () => {
  try {
    await readJsonBody({ body: 'x'.repeat(5 * 1024 * 1024) }, 1024);
    throw new Error('did not throw');
  } catch (e) {
    eq(e.status, 413);
  }
});
test('readJsonBody: pre-parsed object passes through', async () => {
  const b = await readJsonBody({ body: { message: 'hi' } });
  eq(b.message, 'hi');
});

console.log(failures === 0 ? '\nALL GATEWAY SECURITY TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
