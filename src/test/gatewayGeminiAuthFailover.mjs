/**
 * gatewayGeminiAuthFailover.mjs — Phase 2 Workstream 4 (Gemini Gateway,
 * 2026-11-19): failover kegagalan auth (401/403), dead-key skip cakupan
 * key, dan keamanan kredensial di jalur error.
 *
 * Fetch di-stub per host + per key; tidak ada panggilan jaringan nyata,
 * tidak ada key asli. Key dummy memakai nilai khas ('...-SECRETKEY-...')
 * agar kebocoran nilai key ke error/log/respons bisa dideteksi dengan grep.
 *
 * Yang dibuktikan suite ini:
 *  G-401-1 401 Gemini TIDAK membunuh rantai: failover ke kaki berikutnya
 *        (errorClass 'auth', errorStatus 401 tercatat, tanpa errorCode
 *        penghenti rantai).
 *  G-401-2 Rotasi key Gemini dipertahankan: key _1 401 -> key _2 dicoba
 *        dan menjawab.
 *  G-401-3 Dead-key skip: satu key Crown mati (401) TIDAK dicoba ulang
 *        dengan model lain — tepat 1 attempt Crown (dulu 3), lalu
 *        failover ke WeizeRouter.
 *  G-401-4 Skip TIDAK memblokir rotasi: key Crown _0 mati, key _1 hidup
 *        -> model yang sama menjawab via key _1.
 *  G-401-5 Cap Gemini tetap 2: 3 key Gemini 401 -> tepat 2 attempt
 *        (key _3 tidak pernah dicoba — perilaku cap §7.5 laporan owner,
 *        BUKAN yang diubah di sini).
 *  G-403-1 403 TIDAK memicu skip (bisa bermakna cakupan model): ketiga
 *        model Crown tetap dicoba walau semuanya 403.
 *  G-429-1 429 TIDAK memicu skip: keenam model fast tetap dicoba.
 *  G-500-1 errorStatus tercatat untuk kegagalan HTTP lain (500 -> 'server').
 *  G-LEAK-1 Nilai key TIDAK PERNAH muncul di hasil executeAI (error
 *        agregat, attempts, callback onAttempt).
 *  G-VISION-1 Vision PDF + Gemini 401 -> gagal 'auth' (PDF mutlak butuh
 *        Gemini); tanpa key Gemini -> pesan spesifik yang lama.
 *  G-MASK-1/2 Batas HTTP tetap termasking sesudah perubahan ini: respons
 *        sukses membawa alias (Ezrab-flash-v1 / ezrab) tanpa attempts dan
 *        tanpa nama asli; kegagalan total -> 502 generik tanpa nama
 *        provider, status, atau nilai key.
 */
import assert from 'node:assert';

// Bersihkan seluruh key provider yang mungkin terbawa dari shell.
for (let i = 1; i <= 6; i++) delete process.env['GEMINI_API_KEY_' + i];
for (let i = 1; i <= 10; i++) delete process.env['RIVER_API_KEY_' + i];
for (let i = 1; i <= 14; i++) delete process.env['ATRIA_API_KEY_' + i];
for (let i = 1; i <= 12; i++) delete process.env['GEMINI_OAI_KEY_' + i];
for (let i = 1; i <= 4; i++) {
  delete process.env['ATMO_API_KEY_' + i];
  delete process.env['CROWN_API_KEY_' + i];
  delete process.env['ARXPAY_API_KEY_' + i];
  delete process.env['WEIZEROUTER_API_KEY_' + i];
  delete process.env['DAHL_API_KEY_' + i];
}
for (const v of [
  'GEMINI_API_KEY', 'RIVER_API_KEY', 'ATRIA_API_KEY', 'GEMINI_OAI_KEY',
  'DAHL_API_KEY', 'ATMO_API_KEY', 'CROWN_API_KEY', 'ARXPAY_API_KEY',
  'WEIZEROUTER_API_KEY', 'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
]) delete process.env[v];
delete process.env.AI_METERING_ENABLED;
delete process.env.AI_ALLOW_ANONYMOUS;

// Supabase "configured" agar authenticateRequest memakai jalur JWT dengan
// verifier suntikan (pola gatewayMediaGuard.mjs) untuk skenario G-MASK.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy-anon-key';

function setKeys(spec) {
  for (const v of [
    'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3',
    'ZYROUTER_API_KEY', 'ATMO_API_KEY', 'ARXPAY_API_KEY',
    'WEIZEROUTER_API_KEY', 'CROWN_API_KEY', 'CROWN_API_KEY_1',
  ]) delete process.env[v];
  if (spec.gemini) {
    for (let i = 1; i <= spec.gemini; i++) {
      process.env['GEMINI_API_KEY_' + i] = spec.geminiKeys
        ? spec.geminiKeys[i - 1]
        : 'dummy-g' + i;
    }
  }
  if (spec.atmo) process.env.ATMO_API_KEY = spec.atmoKey || 'dummy-atmo';
  if (spec.zyrouter) process.env.ZYROUTER_API_KEY = 'dummy-zy';
  if (spec.arxpay) process.env.ARXPAY_API_KEY = 'dummy-arxpay';
  if (spec.weize) process.env.WEIZEROUTER_API_KEY = spec.weizeKey || 'dummy-weize';
  if (spec.crown) {
    // crownKeys = [polos, _1, _2, ...] — polos didahulukan (lihat aiGateway).
    process.env.CROWN_API_KEY = spec.crownKeys ? spec.crownKeys[0] : 'dummy-crown';
    if (spec.crownKeys && spec.crownKeys[1]) process.env.CROWN_API_KEY_1 = spec.crownKeys[1];
  }
}

// behavior per host: 'ok' | 'fail500' | 'fail401' | 'fail403' | 'fail429'
// keyBehavior: override per NILAI key (rotasi key mati -> key hidup).
const behavior = {};
const keyBehavior = new Map();
const hostCalls = {};
function setBehavior(spec, keySpec) {
  for (const k of Object.keys(behavior)) delete behavior[k];
  Object.assign(behavior, spec);
  keyBehavior.clear();
  if (keySpec) for (const [k, v] of Object.entries(keySpec)) keyBehavior.set(k, v);
  for (const k of Object.keys(hostCalls)) delete hostCalls[k];
}

function hostOf(url) {
  const u = String(url);
  if (u.includes('generativelanguage.googleapis.com/v1beta/openai')) return 'geminiOai';
  if (u.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (u.includes('api.zyrouter.com')) return 'zyrouter';
  if (u.includes('api.atria-asi.ai')) return 'atria';
  if (u.includes('arxpay.my.id')) return 'arxpay';
  if (u.includes('weizerouter.web.id')) return 'weizerouter';
  if (u.includes('crown.ai.id')) return 'crown';
  if (u.includes('atmorouter.dev')) return 'atmo';
  return 'unknown';
}

// Nilai key yang dipakai attempt ini: Gemini native lewat query ?key=,
// provider OpenAI-compatible lewat header Authorization. Hanya dipakai
// stub untuk memilih perilaku per key — TIDAK PERNAH dicatat/di-echo.
function keyOf(url, init) {
  const u = String(url);
  const m = u.match(/[?&]key=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  const h = (init && init.headers) || {};
  const auth = h.Authorization || h.authorization || '';
  const mm = String(auth).match(/^Bearer\s+(.+)$/);
  return mm ? mm[1] : '';
}

global.fetch = async (url, init) => {
  const host = hostOf(url);
  hostCalls[host] = (hostCalls[host] || 0) + 1;
  const key = keyOf(url, init);
  const b = keyBehavior.get(key) || behavior[host] || 'fail500';
  if (b === 'fail500') return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
  if (b === 'fail401') return { ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' };
  if (b === 'fail403') return { ok: false, status: 403, json: async () => ({}), text: async () => 'forbidden' };
  if (b === 'fail429') return { ok: false, status: 429, json: async () => ({}), text: async () => 'quota' };
  if (host === 'gemini') {
    const payload = { candidates: [{ content: { parts: [{ text: 'OK-GEMINI' }] } }], usageMetadata: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  }
  const payload = { choices: [{ message: { content: 'OK-' + host.toUpperCase() } }], usage: {} };
  return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
};

const { executeAI, handleAiRequest } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}
const seq = (r) => r.attempts.map((a) => `${a.provider}:${a.model}`);

// --- G-401-1. 401 Gemini TIDAK membunuh rantai: failover ke AtmoRouter.
setKeys({ gemini: 1, atmo: true });
setBehavior({ gemini: 'fail401', atmo: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-1 gemini 401: ok via atmorouter (failover jalan)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'ag/gemini-3.8-flash-high');
  });
  check('G-401-1 gemini 401: urutan [gemini, atmo]', () => assert.deepEqual(seq(r), [
    'gemini:gemini-3.5-flash-lite',
    'atmorouter:ag/gemini-3.8-flash-high',
  ]));
  check('G-401-1 gemini 401: errorClass auth + errorStatus 401', () => {
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
  });
  check('G-401-1 gemini 401: tanpa errorCode penghenti rantai', () => assert.equal(r.errorCode, undefined));
}

// --- G-401-2. Rotasi key Gemini dipertahankan: key _1 401 -> key _2 menjawab.
setKeys({ gemini: 2, geminiKeys: ['dummy-g1-dead', 'dummy-g2-live'] });
setBehavior({ gemini: 'ok' }, { 'dummy-g1-dead': 'fail401' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-2 gemini rotasi: ok via gemini key _2', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'gemini');
  });
  check('G-401-2 gemini rotasi: 2 attempt Gemini (_1 401, _2 ok)', () => {
    assert.equal(r.attempts.length, 2);
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
    assert.equal(r.attempts[1].ok, true);
  });
}

// --- G-401-3. Dead-key skip: 1 key Crown mati -> tepat 1 attempt Crown
//      (dulu 3, satu per model), lalu WeizeRouter menjawab.
setKeys({ crown: true, weize: true });
setBehavior({ crown: 'fail401', weizerouter: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-3 crown dead-key: ok via weizerouter', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'weizerouter');
  });
  check('G-401-3 crown dead-key: tepat 1 attempt Crown (GLM saja)', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'weizerouter:weizerouter-v2',
  ]));
  check('G-401-3 crown dead-key: tepat 1 panggilan HTTP ke Crown', () => assert.equal(hostCalls.crown, 1));
  check('G-401-3 crown dead-key: attempt Crown errorClass auth + 401', () => {
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
  });
}

// --- G-401-4. Skip TIDAK memblokir rotasi: key Crown polos mati, key _1
//      hidup -> model GLM yang sama menjawab via key _1.
setKeys({ crown: true, crownKeys: ['dummy-crown-dead', 'dummy-crown-live'], weize: true });
setBehavior({ crown: 'ok', weizerouter: 'ok' }, { 'dummy-crown-dead': 'fail401' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-4 crown rotasi: ok via crown GLM (key _1)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'zai-org/GLM-5.3-Flash');
  });
  check('G-401-4 crown rotasi: 2 attempt, keduanya GLM (key _0 401, key _1 ok)', () => {
    assert.deepEqual(seq(r), ['crown:zai-org/GLM-5.3-Flash', 'crown:zai-org/GLM-5.3-Flash']);
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[1].ok, true);
  });
}

// --- G-401-5. Cap Gemini tetap 2: 3 key 401 -> tepat 2 attempt, key _3
//      tidak pernah dicoba (perilaku cap §7.5 — BUKAN yang diubah).
setKeys({ gemini: 3, atmo: true });
setBehavior({ gemini: 'fail401', atmo: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-5 gemini cap: ok via atmorouter sesudah 2x 401', () => assert.equal(r.ok, true));
  check('G-401-5 gemini cap: tepat 2 attempt Gemini (key _3 tak tersentuh)', () => {
    assert.equal(r.attempts.filter((a) => a.provider === 'gemini').length, 2);
    assert.equal(hostCalls.gemini, 2);
    assert.equal(r.attempts.every((a) => a.provider !== 'gemini' || a.errorClass === 'auth'), true);
  });
}

// --- G-403-1. 403 TIDAK memicu skip: ketiga model Crown tetap dicoba.
setKeys({ crown: true, weize: true });
setBehavior({ crown: 'fail403', weizerouter: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-403-1 crown 403: ketiga model tetap dicoba (tanpa skip)', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'weizerouter:weizerouter-v2',
  ]));
  check('G-403-1 crown 403: ketiga attempt errorClass auth + errorStatus 403', () => {
    assert.equal(r.attempts.slice(0, 3).every((a) => a.errorClass === 'auth' && a.errorStatus === 403), true);
  });
  check('G-403-1 crown 403: 3 panggilan HTTP ke Crown', () => assert.equal(hostCalls.crown, 3));
}

// --- G-429-1. 429 TIDAK memicu skip: keenam model fast tetap dicoba.
setKeys({ weize: true });
setBehavior({ weizerouter: 'fail429' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('G-429-1 weize 429: keenam model tetap dicoba (tanpa skip)', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/deepseek-v4-flash-0731',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash',
  ]));
  check('G-429-1 weize 429: semua errorClass rate + errorStatus 429', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'rate' && a.errorStatus === 429), true);
  });
}

// --- G-500-1. errorStatus tercatat untuk kegagalan HTTP lain.
setKeys({ weize: true });
setBehavior({ weizerouter: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('G-500-1 weize 500: errorClass server + errorStatus 500', () => {
    assert.equal(r.attempts[0].errorClass, 'server');
    assert.equal(r.attempts[0].errorStatus, 500);
  });
}

// --- G-LEAK-1. Nilai key tidak pernah muncul di hasil executeAI.
setKeys({
  gemini: 1, geminiKeys: ['dummy-gemini-SECRETKEY-111'],
  crown: true, crownKeys: ['dummy-crown-SECRETKEY-222'],
  weize: true, weizeKey: 'dummy-weize-SECRETKEY-333',
});
setBehavior({ gemini: 'fail401', crown: 'fail401', weizerouter: 'fail401' });
{
  const seen = [];
  const r = await executeAI({ message: 'halo', mode: 'chat' }, (a) => seen.push(a));
  const secrets = ['dummy-gemini-SECRETKEY-111', 'dummy-crown-SECRETKEY-222', 'dummy-weize-SECRETKEY-333'];
  check('G-LEAK-1: hasil executeAI tidak memuat nilai key', () => {
    const blob = JSON.stringify(r);
    for (const s of secrets) assert.equal(blob.includes(s), false, `hasil memuat ${s}`);
  });
  check('G-LEAK-1: error agregat tidak memuat nilai key / awalan dummy', () => {
    assert.equal(r.error.includes('SECRETKEY'), false);
    assert.equal(r.error.includes('dummy-'), false);
  });
  check('G-LEAK-1: callback onAttempt tidak memuat nilai key', () => {
    const blob = JSON.stringify(seen);
    for (const s of secrets) assert.equal(blob.includes(s), false, `onAttempt memuat ${s}`);
  });
  check('G-LEAK-1: rantai tetap failover walau semua 401 (3 provider tercatat)', () => {
    assert.equal(r.ok, false);
    assert.deepEqual(seq(r), [
      'crown:zai-org/GLM-5.3-Flash',
      'weizerouter:weizerouter-v2',
      'gemini:gemini-3.5-flash-lite',
    ]);
  });
}

// --- G-VISION-1. Vision PDF + Gemini 401 -> gagal 'auth'; tanpa key
//      Gemini -> pesan spesifik yang lama (tidak berubah).
setKeys({ gemini: 1 });
setBehavior({ gemini: 'fail401' });
{
  const r = await executeAI({ message: 'baca pdf', mode: 'vision', pdfDataBase64: 'BBBB' });
  check('G-VISION-1 pdf+gemini401: ok=false, 1 attempt auth', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 1);
    assert.equal(r.attempts[0].provider, 'gemini');
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
  });
}
setKeys({});
setBehavior({});
{
  const r = await executeAI({ message: 'baca pdf', mode: 'vision', pdfDataBase64: 'BBBB' });
  check('G-VISION-1 pdf tanpa key: pesan spesifik tidak berubah', () => {
    assert.equal(r.ok, false);
    assert.equal(r.error, 'Vision PDF membutuhkan GEMINI_API_KEY_* — tidak ada key Gemini terkonfigurasi');
    assert.deepEqual(r.attempts, []);
  });
}

// --- G-MASK-1/2. Batas HTTP tetap termasking (pola mock B4-13/14).
function mockReq({ method = 'POST', headers = {}, body } = {}) {
  return { method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), body, socket: { remoteAddress: '10.0.0.11' } };
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
const registeredUser = { id: 'user-registered-gmask', email: 'user@example.id', isAnonymous: false };
const verifierFor = (user) => async (token) =>
  token ? { ok: true, user } : { ok: false, reason: 'missing_token' };
const ORIGIN = { origin: 'https://ezrab-site.vercel.app', authorization: 'Bearer dummy-jwt-token' };

setKeys({ weize: true, weizeKey: 'dummy-weize-SECRETKEY-444' });
setBehavior({ weizerouter: 'ok' });
{
  const res = mockRes();
  await handleAiRequest(
    mockReq({ headers: ORIGIN, body: { message: 'halo', mode: 'fast' } }),
    res,
    { jwtVerifier: verifierFor(registeredUser) }
  );
  check('G-MASK-1 sukses: model alias flash + provider ezrab', () => {
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.model, 'Ezrab-flash-v1');
    assert.equal(res.body.provider, 'ezrab');
  });
  check('G-MASK-1 sukses: attempts TIDAK dikirim + tanpa nama asli/key', () => {
    assert.equal(res.body.attempts, undefined);
    const blob = JSON.stringify(res.body);
    assert.equal(blob.includes('weizerouter'), false);
    assert.equal(blob.includes('weizerouter-v2'), false);
    assert.equal(blob.includes('SECRETKEY'), false);
    assert.equal(blob.includes('dummy-'), false);
  });
}

setKeys({
  gemini: 1, geminiKeys: ['dummy-gemini-SECRETKEY-555'],
  crown: true, crownKeys: ['dummy-crown-SECRETKEY-666'],
  weize: true, weizeKey: 'dummy-weize-SECRETKEY-777',
});
setBehavior({ gemini: 'fail401', crown: 'fail401', weizerouter: 'fail401' });
{
  const res = mockRes();
  await handleAiRequest(
    mockReq({ headers: ORIGIN, body: { message: 'halo', mode: 'chat' } }),
    res,
    { jwtVerifier: verifierFor(registeredUser) }
  );
  check('G-MASK-2 semua-401: 502 generik, tanpa nama provider/status/key', () => {
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'AI sedang tidak tersedia.');
    // (Tidak menegaskan ketiadaan substring '401' pada keseluruhan body:
    // requestId acak base36 bisa mengandungnya — flaky. Penegasan error
    // generik di atas + ketiadaan nama provider/key sudah cukup.)
    const blob = JSON.stringify(res.body);
    assert.equal(blob.includes('crown'), false);
    assert.equal(blob.includes('gemini'), false);
    assert.equal(blob.includes('weizerouter'), false);
    assert.equal(blob.includes('SECRETKEY'), false);
    assert.equal(blob.includes('dummy-'), false);
  });
}

console.log(`\ngatewayGeminiAuthFailover: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
