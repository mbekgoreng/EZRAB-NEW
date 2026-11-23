/**
 * gatewayGeminiAuthFailover.mjs — Phase 2 Workstream 4 (Gemini Gateway,
 * 2026-11-19): failover kegagalan auth (401/403), dead-key skip cakupan
 * key, dan keamanan kredensial di jalur error.
 *
 * NAMA FILE HISTORIS: skenario Gemini-pertama SUDAH TIDAK BERLAKU di
 * rantai teks (kaki Gemini native dicabut 2026-11-22 atas perintah owner
 * — key 401 sejak 15 Nov 2026). File ini ditulis ulang 2026-11-22 untuk
 * SPESIFIKASI FINAL owner 01:37: mekanisme yang sama (failover 401,
 * rotasi key, dead-key skip, cap, no-skip 403/429, no-leak) kini dipin
 * pada Crown/River/Atmo — satu-satunya provider rantai teks.
 *
 * Fetch di-stub per host + per key; tidak ada panggilan jaringan nyata,
 * tidak ada key asli. Key dummy memakai nilai khas ('...-SECRETKEY-...')
 * agar kebocoran nilai key ke error/log/respons bisa dideteksi dengan grep.
 *
 * Yang dibuktikan suite ini:
 *  G-401-1 401 River TIDAK membunuh rantai vision: failover ke Atmo
 *        (errorClass 'auth', errorStatus 401 tercatat, tanpa errorCode
 *        penghenti rantai).
 *  G-401-2 Rotasi key River dipertahankan: key _1 401 -> key _2 dicoba
 *        dan menjawab (model V4.1-Flash-1017, mode chat).
 *  G-401-3 Dead-key skip: satu key Crown mati (401) -> tepat 1 attempt
 *        Crown, lalu failover ke River.
 *  G-401-4 Skip TIDAK memblokir rotasi: key Crown _0 mati, key _1 hidup
 *        -> model yang sama menjawab via key _1.
 *  G-401-5 Cap River tetap 2: 3 key River 401 -> tepat 2 attempt
 *        (key _3 tidak pernah dicoba — perilaku cap §7.5 laporan owner).
 *        Crown gagal 500 dulu agar rantai mencapai River.
 *  G-403-1 403 TIDAK memicu skip: ketiga model Atmo advanced tetap
 *        dicoba walau semuanya 403.
 *  G-429-1 429 TIDAK memicu skip: keempat kaki fast tetap dicoba.
 *  G-500-1 errorStatus tercatat untuk kegagalan HTTP lain (500 -> 'server').
 *  G-LEAK-1 Nilai key TIDAK PERNAH muncul di hasil executeAI (error
 *        agregat, attempts, callback onAttempt).
 *  G-VISION-1 Vision PDF -> gagal-cepat dengan pesan spesifik, 0 attempt
 *        (dengan maupun tanpa key — hanya Gemini native yang membaca PDF
 *        dan kakinya dicabut 2026-11-22).
 *  G-MASK-1/2 Batas HTTP tetap termasking: respons sukses membawa alias
 *        (Ezrab-flash-v1 / ezrab) tanpa attempts dan tanpa nama asli;
 *        kegagalan total -> 502 generik tanpa nama provider, status,
 *        atau nilai key.
 */
import assert from 'node:assert';

// Bersihkan seluruh key provider yang mungkin terbawa dari shell.
for (let i = 1; i <= 10; i++) delete process.env['RIVER_API_KEY_' + i];
for (let i = 1; i <= 4; i++) {
  delete process.env['ATMO_API_KEY_' + i];
  delete process.env['CROWN_API_KEY_' + i];
}
for (const v of [
  'GEMINI_API_KEY', 'RIVER_API_KEY', 'ATRIA_API_KEY', 'GEMINI_OAI_KEY',
  'DAHL_API_KEY', 'ATMO_API_KEY', 'CROWN_API_KEY',
  'WEIZEROUTER_API_KEY', 'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
]) delete process.env[v];
for (let i = 1; i <= 80; i++) {
  delete process.env['GEMINI_API_KEY_' + i];
  delete process.env['DAHL_API_KEY_' + i];
  delete process.env['ATRIA_API_KEY_' + i];
  delete process.env['GEMINI_OAI_KEY_' + i];
  delete process.env['WEIZEROUTER_API_KEY_' + i];
}
delete process.env.AI_METERING_ENABLED;
delete process.env.AI_ALLOW_ANONYMOUS;

// Supabase "configured" agar authenticateRequest memakai jalur JWT dengan
// verifier suntikan (pola gatewayMediaGuard.mjs) untuk skenario G-MASK.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy-anon-key';

function setKeys(spec) {
  for (const v of [
    'RIVER_API_KEY_1', 'RIVER_API_KEY_2', 'RIVER_API_KEY_3',
    'ZYROUTER_API_KEY', 'ATMO_API_KEY', 'ATMO_API_KEY_1',
    'CROWN_API_KEY', 'CROWN_API_KEY_1',
  ]) delete process.env[v];
  if (spec.river) {
    for (let i = 1; i <= spec.river; i++) {
      process.env['RIVER_API_KEY_' + i] = spec.riverKeys
        ? spec.riverKeys[i - 1]
        : 'dummy-r' + i;
    }
  }
  if (spec.atmo) process.env.ATMO_API_KEY = spec.atmoKey || 'dummy-atmo';
  if (spec.zyrouter) process.env.ZYROUTER_API_KEY = 'dummy-zy';
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
  if (u.includes('api.zyrouter.com')) return 'zyrouter';
  if (u.includes('api.river.ai')) return 'river';
  if (u.includes('crown.ai.id')) return 'crown';
  if (u.includes('atmorouter.dev')) return 'atmo';
  return 'unknown';
}

// Nilai key yang dipakai attempt ini: provider OpenAI-compatible lewat
// header Authorization. Hanya dipakai stub untuk memilih perilaku per
// key — TIDAK PERNAH dicatat/di-echo.
function keyOf(url, init) {
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
const CROWN_V4 = 'crown:deepseek-ai/DeepSeek-V4-Flash-0731';
const RIVER_1017 = 'river-flash:deepseek-ai/DeepSeek-V4.1-Flash-1017';
const RIVER_VISION = 'river-vision:deepseek-ai/DeepSeek-V4.1-Flash';
const ATMO_MM = 'atmorouter:mm/MiniMax-M3.1-Flash';

// --- G-401-1. 401 River TIDAK membunuh rantai vision: failover ke Atmo.
//      Mode 'vision' (gambar): River vision 401 -> Atmo ag menjawab.
setKeys({ river: 1, atmo: true });
setBehavior({ river: 'fail401', atmo: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'vision', imageDataBase64: 'AAAA', imageMimeType: 'image/png' });
  check('G-401-1 river 401: ok via atmorouter (failover jalan)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'ag/gemini-3.8-flash-high');
  });
  check('G-401-1 river 401: urutan [river-vision, atmo]', () => assert.deepEqual(seq(r), [
    RIVER_VISION,
    'atmorouter:ag/gemini-3.8-flash-high',
  ]));
  check('G-401-1 river 401: errorClass auth + errorStatus 401', () => {
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
  });
  check('G-401-1 river 401: tanpa errorCode penghenti rantai', () => assert.equal(r.errorCode, undefined));
}

// --- G-401-2. Rotasi key River dipertahankan: key _1 401 -> key _2 menjawab.
//      Mode 'chat' tanpa key Crown (rantai mulai dari River 1017).
setKeys({ river: 2, riverKeys: ['dummy-r1-dead', 'dummy-r2-live'] });
setBehavior({ river: 'ok' }, { 'dummy-r1-dead': 'fail401' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-2 river rotasi: ok via river-flash key _2', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'river-flash');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4.1-Flash-1017');
  });
  check('G-401-2 river rotasi: 2 attempt River (_1 401, _2 ok)', () => {
    assert.equal(r.attempts.length, 2);
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
    assert.equal(r.attempts[1].ok, true);
  });
}

// --- G-401-3. Dead-key skip: 1 key Crown mati -> tepat 1 attempt Crown,
//      lalu River menjawab.
setKeys({ crown: true, river: 1 });
setBehavior({ crown: 'fail401', river: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-3 crown dead-key: ok via river-flash', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'river-flash');
  });
  check('G-401-3 crown dead-key: tepat 1 attempt Crown (V4 saja)', () => assert.deepEqual(seq(r), [
    CROWN_V4,
    RIVER_1017,
  ]));
  check('G-401-3 crown dead-key: tepat 1 panggilan HTTP ke Crown', () => assert.equal(hostCalls.crown, 1));
  check('G-401-3 crown dead-key: attempt Crown errorClass auth + 401', () => {
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
  });
}

// --- G-401-4. Skip TIDAK memblokir rotasi: key Crown polos mati, key _1
//      hidup -> model V4 yang sama menjawab via key _1.
setKeys({ crown: true, crownKeys: ['dummy-crown-dead', 'dummy-crown-live'], river: 1 });
setBehavior({ crown: 'ok', river: 'ok' }, { 'dummy-crown-dead': 'fail401' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-4 crown rotasi: ok via crown V4 (key _1)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4-Flash-0731');
  });
  check('G-401-4 crown rotasi: 2 attempt, keduanya V4 (key _0 401, key _1 ok)', () => {
    assert.deepEqual(seq(r), [CROWN_V4, CROWN_V4]);
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[1].ok, true);
  });
}

// --- G-401-5. Cap River tetap 2: 3 key 401 -> tepat 2 attempt, key _3
//      tidak pernah dicoba (perilaku cap §7.5 — BUKAN yang diubah).
//      Crown gagal 500 dulu agar rantai mencapai River.
setKeys({ crown: true, river: 3 });
setBehavior({ crown: 'fail500', river: 'fail401' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-401-5 river cap: ok=false sesudah Crown 500 + 2x River 401', () => assert.equal(r.ok, false));
  check('G-401-5 river cap: tepat 2 attempt River (key _3 tak tersentuh)', () => {
    assert.deepEqual(seq(r), [CROWN_V4, RIVER_1017, RIVER_1017]);
    assert.equal(hostCalls.river, 2);
    assert.equal(r.attempts.slice(1).every((a) => a.errorClass === 'auth'), true);
  });
}

// --- G-403-1. 403 TIDAK memicu skip: ketiga model Atmo advanced tetap dicoba.
setKeys({ atmo: true });
setBehavior({ atmo: 'fail403' });
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('G-403-1 atmo 403: ketiga model tetap dicoba (tanpa skip)', () => assert.deepEqual(seq(r), [
    'atmorouter:cx/gpt-6-luna',
    'atmorouter:ag/gemini-3.8-flash-high',
    'atmorouter:mv/mistral-medium-3-5',
  ]));
  check('G-403-1 atmo 403: ketiga attempt errorClass auth + errorStatus 403', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'auth' && a.errorStatus === 403), true);
  });
  check('G-403-1 atmo 403: 3 panggilan HTTP ke Atmo', () => assert.equal(hostCalls.atmo, 3));
}

// --- G-429-1. 429 TIDAK memicu skip: keempat kaki fast tetap dicoba.
setKeys({ crown: true, river: 1, atmo: true });
setBehavior({ crown: 'fail429', river: 'fail429', atmo: 'fail429' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('G-429-1 fast 429: keempat kaki tetap dicoba (tanpa skip)', () => assert.deepEqual(seq(r), [
    CROWN_V4,
    'river-text:nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4',
    RIVER_1017,
    'atmorouter:cx/gpt-6-luna',
  ]));
  check('G-429-1 fast 429: semua errorClass rate + errorStatus 429', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'rate' && a.errorStatus === 429), true);
  });
}

// --- G-500-1. errorStatus tercatat untuk kegagalan HTTP lain.
setKeys({ crown: true });
setBehavior({ crown: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('G-500-1 crown 500: errorClass server + errorStatus 500', () => {
    assert.equal(r.attempts[0].errorClass, 'server');
    assert.equal(r.attempts[0].errorStatus, 500);
  });
}

// --- G-LEAK-1. Nilai key tidak pernah muncul di hasil executeAI.
//      Mode 'chat', semua 401: [crown V4, river-flash 1017, atmo mm] —
//      atmo zai ter-skip oleh dead-key (slot 'atmorouter:0' mati di mm).
setKeys({
  crown: true, crownKeys: ['dummy-crown-SECRETKEY-222'],
  river: 1, riverKeys: ['dummy-river-SECRETKEY-111'],
  atmo: true, atmoKey: 'dummy-atmo-SECRETKEY-333',
});
setBehavior({ crown: 'fail401', river: 'fail401', atmo: 'fail401' });
{
  const seen = [];
  const r = await executeAI({ message: 'halo', mode: 'chat' }, (a) => seen.push(a));
  const secrets = ['dummy-crown-SECRETKEY-222', 'dummy-river-SECRETKEY-111', 'dummy-atmo-SECRETKEY-333'];
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
  check('G-LEAK-1: rantai tetap failover walau semua 401 (3 attempt, zai ter-skip dead-key)', () => {
    assert.equal(r.ok, false);
    assert.deepEqual(seq(r), [
      CROWN_V4,
      RIVER_1017,
      ATMO_MM,
    ]);
  });
}

// --- G-VISION-1. Vision PDF -> gagal-cepat dengan pesan spesifik, 0
//      attempt — dengan maupun tanpa key (hanya Gemini native yang
//      membaca PDF dan kakinya dicabut 2026-11-22).
setKeys({ river: 1, atmo: true, zyrouter: true });
setBehavior({ river: 'ok', atmo: 'ok' });
{
  const r = await executeAI({ message: 'baca pdf', mode: 'vision', pdfDataBase64: 'BBBB' });
  check('G-VISION-1 pdf dengan key: pesan spesifik, 0 attempt', () => {
    assert.equal(r.ok, false);
    assert.ok(typeof r.error === 'string' && r.error.includes('PDF'));
    assert.notEqual(r.error, 'No AI provider keys configured');
    assert.deepEqual(r.attempts, []);
  });
}
setKeys({});
setBehavior({});
{
  const r = await executeAI({ message: 'baca pdf', mode: 'vision', pdfDataBase64: 'BBBB' });
  check('G-VISION-1 pdf tanpa key: pesan spesifik yang sama, 0 attempt', () => {
    assert.equal(r.ok, false);
    assert.ok(typeof r.error === 'string' && r.error.includes('PDF'));
    assert.notEqual(r.error, 'No AI provider keys configured');
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

setKeys({ crown: true, crownKeys: ['dummy-crown-SECRETKEY-444'] });
setBehavior({ crown: 'ok' });
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
    assert.equal(blob.includes('crown'), false);
    assert.equal(blob.includes('DeepSeek'), false);
    assert.equal(blob.includes('SECRETKEY'), false);
    assert.equal(blob.includes('dummy-'), false);
  });
}

// Mode 'chat' di body dijepit validator ke 'fast' — rantai fast dipakai
// (Crown 401 -> Nemotron 401 -> 1017 401 -> Atmo mm 401; zai ter-skip).
setKeys({
  crown: true, crownKeys: ['dummy-crown-SECRETKEY-666'],
  river: 1, riverKeys: ['dummy-river-SECRETKEY-555'],
  atmo: true, atmoKey: 'dummy-atmo-SECRETKEY-777',
});
setBehavior({ crown: 'fail401', river: 'fail401', atmo: 'fail401' });
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
    assert.equal(blob.includes('river'), false);
    assert.equal(blob.includes('atmo'), false);
    assert.equal(blob.includes('SECRETKEY'), false);
    assert.equal(blob.includes('dummy-'), false);
  });
}

console.log(`\ngatewayGeminiAuthFailover: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
