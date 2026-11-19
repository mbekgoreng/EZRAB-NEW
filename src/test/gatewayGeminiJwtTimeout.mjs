/**
 * gatewayGeminiJwtTimeout.mjs — Phase 2 Workstream 4 (Gemini Gateway,
 * 2026-11-19): D2 Option C — timeout berbatas pada verifikasi JWT
 * Supabase + pencatatan durasi pra-rantai (preChainAuthMs) di logAiUsage.
 *
 * Latar (diagnosis D2): `client.auth.getUser()` tidak punya timeout dan
 * berjalan SEBELUM rantai provider — di luar budget rantai 100 dtk, di
 * dalam jendela abort klien (±91 dtk). Tanpa batas + tanpa angka durasi,
 * H3 (verifikasi JWT lambat memakan jendela klien) tidak bisa diputuskan
 * dari log.
 *
 * Yang dibuktikan suite ini (tanpa panggilan jaringan nyata; verifier
 * disuntikkan — jalur getUser() asli dibatasi oleh timeout yang sama
 * persis karena timeout membungkus verify() di verifySupabaseJwt):
 *  J-1  Verifier yang menggantung + timeoutMs kecil -> { ok:false,
 *        reason:'verify_timeout' } dalam waktu << 10 dtk (fail-closed).
 *  J-2  Verifier lambat tapi di bawah timeout -> ok:true, user utuh.
 *  J-3  Verifier yang melempar -> verify_error (fail-closed dipertahankan).
 *  J-4  Token kosong -> missing_token.
 *  J-5  Verifier yang menolak -> reason diteruskan apa adanya.
 *  J-6  opts.timeoutMs tidak valid (0/negatif/NaN) -> default dipakai
 *        (verifier 120ms tetap ok — bukan timeout instan).
 *  J-7  handleAiRequest: event log 'ai_request' membawa preChainAuthMs
 *        yang mencerminkan verifier lambat (±150ms); durationMs >=
 *        preChainAuthMs.
 *  J-8  handleAiRequest + verifier menggantung + timeout DEFAULT (10 dtk,
 *        tanpa opts) -> HTTP 401 AUTH_REQUIRED sesudah ±10 dtk (bukan
 *        menggantung selamanya); event 'auth_rejected' membawa reason
 *        'verify_timeout' + preChainAuthMs ±10 dtk. SATU-SATUNYA tes
 *        lambat di file ini (±10 dtk) — membuktikan konstanta default
 *        terpasang di jalur produksi (bukan hanya lewat opts tes).
 *  J-9  handleAiRequest + verifier menolak lambat -> 401 + event
 *        'auth_rejected' membawa preChainAuthMs.
 *  J-10 Respons 401 tidak membocorkan token Bearer yang dikirim.
 */
import assert from 'node:assert';

// Bersihkan key provider yang mungkin terbawa dari shell (hanya WeizeRouter
// yang dipakai skenario sukses di sini).
for (let i = 1; i <= 6; i++) delete process.env['GEMINI_API_KEY_' + i];
for (const v of [
  'GEMINI_API_KEY', 'ZYROUTER_API_KEY', 'ZROUTER_API_KEY', 'ATMO_API_KEY',
  'CROWN_API_KEY', 'ARXPAY_API_KEY', 'WEIZEROUTER_API_KEY',
]) delete process.env[v];
delete process.env.AI_METERING_ENABLED;
delete process.env.AI_ALLOW_ANONYMOUS;

// Supabase "configured" agar authenticateRequest memakai jalur JWT.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.WEIZEROUTER_API_KEY = 'dummy-weize';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('weizerouter.web.id')) {
    const payload = { choices: [{ message: { content: 'OK-WEIZE' } }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  }
  return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
};

const { verifySupabaseJwt } = await import('../../api/_lib/supabaseAuth.js');
const { handleAiRequest } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}

const hangingVerifier = async () => new Promise(() => { /* tidak pernah selesai */ });
const registeredUser = { id: 'user-registered-jwt', email: 'user@example.id', isAnonymous: false };

// --- J-1. Verifier menggantung + timeout kecil -> verify_timeout, cepat.
{
  const t0 = Date.now();
  const r = await verifySupabaseJwt('dummy-token', hangingVerifier, { timeoutMs: 50 });
  const elapsed = Date.now() - t0;
  check('J-1 hanging verifier: reason verify_timeout + fail-closed', () => {
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'verify_timeout');
  });
  check('J-1 hanging verifier: kembali cepat (<2 dtk, bukan 10 dtk)', () => {
    assert.ok(elapsed < 2000, `elapsed=${elapsed}ms`);
    assert.ok(typeof r.ms === 'number' && r.ms < 2000, `ms=${r.ms}`);
  });
}

// --- J-2. Verifier lambat tapi di bawah timeout -> ok, user utuh.
{
  const slowOk = async () => { await sleep(120); return { ok: true, user: registeredUser }; };
  const t0 = Date.now();
  const r = await verifySupabaseJwt('dummy-token', slowOk, { timeoutMs: 5000 });
  const elapsed = Date.now() - t0;
  check('J-2 verifier 120ms: ok + user dipertahankan', () => {
    assert.equal(r.ok, true);
    assert.equal(r.user.id, registeredUser.id);
    assert.equal(r.user.isAnonymous, false);
  });
  check('J-2 verifier 120ms: durasi tercatat (ms >= 100)', () => {
    assert.ok(elapsed >= 100, `elapsed=${elapsed}ms`);
    assert.ok(r.ms >= 100, `ms=${r.ms}`);
  });
}

// --- J-3. Verifier melempar -> verify_error (fail-closed).
{
  const throwing = async () => { throw new Error('boom'); };
  const r = await verifySupabaseJwt('dummy-token', throwing, { timeoutMs: 5000 });
  check('J-3 verifier melempar: verify_error + fail-closed', () => {
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'verify_error');
  });
}

// --- J-4. Token kosong -> missing_token.
{
  const r = await verifySupabaseJwt('', hangingVerifier, { timeoutMs: 50 });
  check('J-4 token kosong: missing_token (tanpa memanggil verifier)', () => {
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'missing_token');
  });
}

// --- J-5. Verifier menolak -> reason diteruskan.
{
  const rejecting = async () => ({ ok: false, reason: 'invalid_token' });
  const r = await verifySupabaseJwt('dummy-token', rejecting, { timeoutMs: 5000 });
  check('J-5 verifier menolak: reason invalid_token diteruskan', () => {
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'invalid_token');
  });
}

// --- J-6. timeoutMs tidak valid -> default dipakai (bukan timeout instan).
{
  const slowOk = async () => { await sleep(120); return { ok: true, user: registeredUser }; };
  const r = await verifySupabaseJwt('dummy-token', slowOk, { timeoutMs: 0 });
  check('J-6 timeoutMs=0: default 10 dtk dipakai (verifier 120ms tetap ok)', () => {
    assert.equal(r.ok, true);
  });
  const r2 = await verifySupabaseJwt('dummy-token', slowOk, { timeoutMs: -5 });
  check('J-6 timeoutMs negatif: default dipakai', () => assert.equal(r2.ok, true));
}

// --- J-7/J-8/J-9/J-10. handleAiRequest: preChainAuthMs di log + fail-closed.
function mockReq({ method = 'POST', headers = {}, body } = {}) {
  return { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), body, socket: { remoteAddress: '10.0.0.12' } };
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
const ORIGIN = { origin: 'https://ezrab-site.vercel.app', authorization: 'Bearer dummy-jwt-token-j10' };

// Tangkap event logAiUsage ('[ai-gateway] {...}' di console.log) selama fn.
async function withLogCapture(fn) {
  const events = [];
  const origLog = console.log;
  console.log = (...args) => {
    const s = args.join(' ');
    if (s.startsWith('[ai-gateway] ')) {
      try { events.push(JSON.parse(s.slice('[ai-gateway] '.length))); } catch { /* bukan JSON — abaikan */ }
    }
    origLog(...args);
  };
  try {
    const result = await fn();
    return { result, events };
  } finally {
    console.log = origLog;
  }
}

// --- J-7. Sukses + verifier 150ms -> ai_request membawa preChainAuthMs.
{
  const slowVerifier = async (token) => {
    await sleep(150);
    return token ? { ok: true, user: registeredUser } : { ok: false, reason: 'missing_token' };
  };
  const { result: res, events } = await withLogCapture(async () => {
    const r = mockRes();
    await handleAiRequest(
      mockReq({ headers: ORIGIN, body: { message: 'halo', mode: 'fast' } }),
      r,
      { jwtVerifier: slowVerifier }
    );
    return r;
  });
  const aiReq = events.find((e) => e.event === 'ai_request');
  check('J-7 sukses: HTTP 200 via weizerouter', () => {
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });
  check('J-7 sukses: ai_request membawa preChainAuthMs >= 120', () => {
    assert.ok(aiReq, 'event ai_request tidak tercatat');
    assert.ok(typeof aiReq.preChainAuthMs === 'number', `preChainAuthMs=${aiReq.preChainAuthMs}`);
    assert.ok(aiReq.preChainAuthMs >= 120, `preChainAuthMs=${aiReq.preChainAuthMs}`);
  });
  check('J-7 sukses: durationMs >= preChainAuthMs (rantai = total - auth)', () => {
    assert.ok(aiReq.durationMs >= aiReq.preChainAuthMs, `durationMs=${aiReq.durationMs} preChainAuthMs=${aiReq.preChainAuthMs}`);
  });
}

// --- J-8. Verifier menggantung + timeout DEFAULT 10 dtk -> 401 sesudah ±10 dtk.
{
  const t0 = Date.now();
  const { result: res, events } = await withLogCapture(async () => {
    const r = mockRes();
    await handleAiRequest(
      mockReq({ headers: ORIGIN, body: { message: 'halo', mode: 'fast' } }),
      r,
      { jwtVerifier: hangingVerifier }
    );
    return r;
  });
  const elapsed = Date.now() - t0;
  const rejected = events.find((e) => e.event === 'auth_rejected');
  check('J-8 hanging verifier (default): HTTP 401 AUTH_REQUIRED', () => {
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.errorCode, 'AUTH_REQUIRED');
  });
  check('J-8 hanging verifier (default): kembali sesudah ±10 dtk (9–30 dtk)', () => {
    assert.ok(elapsed >= 9000, `elapsed=${elapsed}ms (terlalu cepat — timeout default tidak jalan?)`);
    assert.ok(elapsed < 30000, `elapsed=${elapsed}ms (terlalu lambat — menggantung?)`);
  });
  check("J-8 hanging verifier (default): auth_rejected reason verify_timeout + preChainAuthMs ±10 dtk", () => {
    assert.ok(rejected, 'event auth_rejected tidak tercatat');
    assert.equal(rejected.reason, 'verify_timeout');
    assert.ok(rejected.preChainAuthMs >= 9000, `preChainAuthMs=${rejected.preChainAuthMs}`);
  });
}

// --- J-9. Verifier menolak lambat -> 401 + auth_rejected membawa preChainAuthMs.
{
  const slowReject = async () => { await sleep(120); return { ok: false, reason: 'invalid_token' }; };
  const { result: res, events } = await withLogCapture(async () => {
    const r = mockRes();
    await handleAiRequest(
      mockReq({ headers: ORIGIN, body: { message: 'halo', mode: 'fast' } }),
      r,
      { jwtVerifier: slowReject }
    );
    return r;
  });
  const rejected = events.find((e) => e.event === 'auth_rejected');
  check('J-9 verifier menolak: HTTP 401', () => assert.equal(res.statusCode, 401));
  check('J-9 verifier menolak: auth_rejected membawa preChainAuthMs >= 100', () => {
    assert.ok(rejected, 'event auth_rejected tidak tercatat');
    assert.equal(rejected.reason, 'invalid_token');
    assert.ok(rejected.preChainAuthMs >= 100, `preChainAuthMs=${rejected.preChainAuthMs}`);
  });
}

// --- J-10. Respons 401 tidak membocorkan token Bearer.
{
  const { result: res } = await withLogCapture(async () => {
    const r = mockRes();
    await handleAiRequest(
      mockReq({ headers: ORIGIN, body: { message: 'halo', mode: 'fast' } }),
      r,
      { jwtVerifier: async () => ({ ok: false, reason: 'invalid_token' }) }
    );
    return r;
  });
  check('J-10 401: body tidak memuat token Bearer', () => {
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.stringify(res.body).includes('dummy-jwt-token-j10'), false);
  });
}

console.log(`\ngatewayGeminiJwtTimeout: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
