/**
 * gatewayF3ChainFix.mjs — perbaikan rantai gateway Fase 3 audit besar DED
 * (2026-11-18), ditulis ulang untuk SPESIFIKASI FINAL owner 2026-11-22
 * 01:37. Fetch di-stub per host; tidak ada panggilan jaringan nyata,
 * tidak ada key asli, tidak ada penantian 55 dtk (timeout disimulasikan
 * dengan AbortError yang dilempar stub fetch — jalur klasifikasi yang sama
 * persis dengan timer attempt di produksi).
 *
 * Bukti historis (log runtime Vercel deployment c96881c, 18 Nov 02:32–03:07
 * WIB): FAST gagal identik — WeizeRouter 502 -> Gemini 401 x2 -> rantai
 * berhenti, HTTP 400; tabel External APIs mencatat POST api.zyrouter.com
 * per request FAST, tapi array attempts log TIDAK mencatat upaya/error
 * ZyRouter (celah logging F3-1b/1c). DETAIL gagal: wz/gpt-6-luna diaborsi
 * di 55.000 ms, wz/deepseek-v4.1-flash diaborsi di 55.001 ms.
 * Rantai lama itu SUDAH TIDAK ADA (WeizeRouter + Gemini native dicabut
 * 2026-11-22); yang DIPERTAHANKAN suite ini adalah MEKANISME yang
 * diperbaiki F3 — logging attempt fatal + timeout-skip level model +
 * klasifikasi error — kini dipin pada rantai baru:
 *  - fast  : Crown V4-0731 -> River Nemotron -> River V4.1-1017 -> Atmo cx
 *  - ded   : Atmo cx/gpt-6-luna -> Atmo ag/gemini-3.8-flash-high
 *  - chat  : Crown V4-0731 -> River V4.1-1017 -> Atmo mm -> Atmo zai
 *  - advanced: Atmo cx -> ag -> mv/mistral-medium-3-5
 *
 * Yang dibuktikan suite ini:
 *  F3-1a Fast 502: PERSIS 4 kaki dicoba (dulu: 6 model WeizeRouter).
 *  F3-1b/1c CELAH LOGGING (bug nyata, DIPERTAHANKAN — perbaikan F3-1b):
 *        attempt yang membunuh rantai lewat early-return policy/client_error
 *        TIDAK PERNAH sampai ke callback onAttempt — attemptLog server
 *        (satu-satunya catatan attempts sejak masking) kehilangan attempt
 *        fatal itu. Sesudah perbaikan, onAttempt dipanggil SEBELUM early
 *        return. Skenario kini memakai Crown 400 di mode 'chat' (Gemini
 *        sudah tidak ada di rantai).
 *  F3-1d Jalur normal tidak berubah: setiap attempt failover tetap
 *        dilaporkan ke onAttempt sesuai urutan (Crown 429 -> River ok).
 *  F3-2a Timeout-skip LEVEL MODEL (DED): Atmo cx timeout -> ag TETAP
 *        dicoba (skip level provider akan mematikan rantai satu-provider);
 *        kedua model dicoba, semua 'timeout'.
 *  F3-2b Kegagalan CEPAT tetap memakai rotasi model: fast 502 -> semua
 *        4 kaki TETAP dicoba (hanya timeout yang melewati model).
 *  F3-2c Timeout Atmo melewati key Atmo berikutnya (model sama — skip
 *        level model; cap tidak relevan — skip berasal dari aturan
 *        timeout, bukan cap): advanced 2 key, cx k0 timeout -> cx k1
 *        ter-skip, ag k0 + mv k0 tetap dicoba = 3 attempt.
 *  F3-2d Aturan timeout berlaku umum (mode chat): Crown timeout ->
 *        River 1017 menjawab.
 *  F3-2e Batas klasifikasi: throw BUKAN AbortError tetap 'network' dan
 *        TIDAK memicu skip (hanya AbortError tanpa disconnect = timeout)
 *        — advanced, ketiga model Atmo dicoba.
 *  F3-2f Crown timeout, 2 key: timeout-skip level model melewati key
 *        Crown kedua (model sama) -> River menjawab; hanya 1 attempt
 *        Crown walau 2 key tersedia.
 *
 * Yang SENGAJA tidak diubah (tercatat di aiGateway.js):
 *  - Budget rantai tetap 240 dtk dan timeout attempt tetap 55 dtk.
 *    Worst case rantai baru = 4 kaki x 55 dtk = 220 dtk < budget, jadi
 *    jalur budget-entry tidak lagi terjangkau lewat timeout (lihat
 *    dedTimeout5Min.mjs).
 *  - Aturan berhenti F1 (policy/client_error menghentikan rantai) tidak
 *    diubah — itu desain audit 2026-10-31. HTTP 400 adalah F1 yang
 *    bekerja, bukan bug; yang bug adalah logging-nya (F3-1b/1c).
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

function setKeys(spec) {
  for (const v of [
    'RIVER_API_KEY_1', 'RIVER_API_KEY_2', 'ATMO_API_KEY', 'ATMO_API_KEY_1',
    'CROWN_API_KEY', 'CROWN_API_KEY_1',
  ]) delete process.env[v];
  if (spec.river) {
    process.env.RIVER_API_KEY_1 = 'dummy-river';
    if (spec.river >= 2) process.env.RIVER_API_KEY_2 = 'dummy-river-2';
  }
  if (spec.atmo) {
    process.env.ATMO_API_KEY = 'dummy-atmo';
    if (spec.atmo >= 2) process.env.ATMO_API_KEY_1 = 'dummy-atmo-1';
  }
  if (spec.crown) {
    process.env.CROWN_API_KEY = 'dummy-crown';
    if (spec.crown >= 2) process.env.CROWN_API_KEY_1 = 'dummy-crown-1';
  }
}

// behavior per host: 'ok' | 'fail500' | 'fail400' | 'fail400policy' |
// 'fail401' | 'fail429' | 'timeout' (lempar AbortError) |
// 'netthrow' (lempar Error biasa, bukan abort)
const behavior = {};
function setBehavior(spec) {
  for (const k of Object.keys(behavior)) delete behavior[k];
  Object.assign(behavior, spec);
}

function hostOf(url) {
  const u = String(url);
  if (u.includes('api.river.ai')) return 'river';
  if (u.includes('atmorouter.dev')) return 'atmo';
  if (u.includes('crown.ai.id')) return 'crown';
  return 'unknown';
}

function abortError() {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

global.fetch = async (url) => {
  const host = hostOf(url);
  const b = behavior[host] || 'fail500';
  if (b === 'timeout') throw abortError();
  if (b === 'netthrow') throw new Error('connect ECONNREFUSED 10.0.0.1:443');
  if (b === 'fail500') return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
  if (b === 'fail401') return { ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' };
  if (b === 'fail429') return { ok: false, status: 429, json: async () => ({}), text: async () => 'quota' };
  if (b === 'fail400') {
    const body = JSON.stringify({ error: { message: 'Invalid JSON payload received. Unknown name "foo".' } });
    return { ok: false, status: 400, json: async () => ({}), text: async () => body };
  }
  if (b === 'fail400policy') {
    const body = JSON.stringify({ error: { message: 'Request blocked: SAFETY policy violation (content policy)' } });
    return { ok: false, status: 400, json: async () => ({}), text: async () => body };
  }
  const payload = { choices: [{ message: { content: 'OK-' + host.toUpperCase() } }], usage: {} };
  return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
};

const { executeAI } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}
const seq = (r) => r.attempts.map((a) => `${a.provider}:${a.model}`);
const CROWN_V4 = 'crown:deepseek-ai/DeepSeek-V4-Flash-0731';
const RIVER_NEMOTRON = 'river-text:nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4';
const RIVER_1017 = 'river-flash:deepseek-ai/DeepSeek-V4.1-Flash-1017';
const ATMO_CX = 'atmorouter:cx/gpt-6-luna';
const ATMO_AG = 'atmorouter:ag/gemini-3.8-flash-high';
const ATMO_MV = 'atmorouter:mv/mistral-medium-3-5';
const FAST_SEQ = [CROWN_V4, RIVER_NEMOTRON, RIVER_1017, ATMO_CX];

// --- F3-1a: Fast 502 — PERSIS 4 kaki dicoba (spesifikasi final 2026-11-22).
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'fail500', river: 'fail500', atmo: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('F3-1a fast 502: ok=false (semua kaki 502)', () => assert.equal(r.ok, false));
  check('F3-1a fast 502: keempat kaki dicoba', () => assert.deepEqual(seq(r), FAST_SEQ));
}

// --- F3-1b. Celah logging: attempt client_error yang membunuh rantai HARUS
//      sampai ke onAttempt. Crown 400 di mode 'chat' (Gemini sudah tidak
//      ada di rantai). Key River + Atmo SENGAJA ada — membuktikan rantai
//      BERHENTI (1 attempt), bukan kehabisan kaki.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'fail400' });
{
  const seen = [];
  const r = await executeAI({ message: 'halo', mode: 'chat' }, (a) => seen.push(a));
  check('F3-1b client_error: AI_BAD_REQUEST, rantai berhenti', () => {
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'AI_BAD_REQUEST');
    assert.equal(r.attempts.length, 1);
  });
  check('F3-1b client_error: onAttempt menerima attempt fatal', () => {
    assert.equal(seen.length, 1);
    assert.equal(seen[0].provider, 'crown');
    assert.equal(seen[0].errorClass, 'client_error');
    assert.equal(seen[0].ok, false);
  });
}

// --- F3-1c. Celah logging, varian policy. Crown 400-policy di mode 'chat'.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'fail400policy' });
{
  const seen = [];
  const r = await executeAI({ message: 'halo', mode: 'chat' }, (a) => seen.push(a));
  check('F3-1c policy: CONTENT_REJECTED, rantai berhenti', () => {
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'CONTENT_REJECTED');
    assert.equal(r.attempts.length, 1);
  });
  check('F3-1c policy: onAttempt menerima attempt fatal', () => {
    assert.equal(seen.length, 1);
    assert.equal(seen[0].provider, 'crown');
    assert.equal(seen[0].errorClass, 'policy');
  });
}

// --- F3-1d. Jalur normal: setiap attempt failover tetap ke onAttempt berurutan.
//      Crown 429 -> River 1017 ok, mode 'chat'.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'fail429', river: 'ok' });
{
  const seen = [];
  const r = await executeAI({ message: 'halo', mode: 'chat' }, (a) => seen.push(a));
  check('F3-1d failover: ok via river-flash', () => assert.equal(r.ok, true));
  check('F3-1d failover: onAttempt menerima kedua attempt berurutan', () => {
    assert.deepEqual(seen.map((a) => `${a.provider}:${a.ok}`), ['crown:false', 'river-flash:true']);
    assert.equal(seen[0].errorClass, 'rate');
  });
}

// --- F3-2a. Timeout-skip LEVEL MODEL (DED): Atmo cx timeout -> ag TETAP
//      dicoba (skip level provider akan mematikan rantai satu-provider);
//      kedua model dicoba, semua 'timeout'.
setKeys({ atmo: true });
setBehavior({ atmo: 'timeout' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('F3-2a ded timeout: ok=false (kedua kaki Atmo timeout)', () => assert.equal(r.ok, false));
  check('F3-2a ded timeout: attempt 1 errorClass timeout', () => {
    assert.equal(r.attempts[0].provider, 'atmorouter');
    assert.equal(r.attempts[0].model, 'cx/gpt-6-luna');
    assert.equal(r.attempts[0].errorClass, 'timeout');
  });
  check('F3-2a ded timeout: kedua model TETAP dicoba (skip level model)', () => assert.deepEqual(seq(r), [
    ATMO_CX,
    ATMO_AG,
  ]));
  check('F3-2a ded timeout: semua attempt errorClass timeout', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'timeout'), true);
  });
}

// --- F3-2b. Kontras: kegagalan CEPAT (502) tetap memakai rotasi model —
//      fast, semua 4 kaki dicoba.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'fail500', river: 'fail500', atmo: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('F3-2b fast 502: keempat kaki TETAP dicoba', () => assert.deepEqual(seq(r), FAST_SEQ));
  check('F3-2b fast 502: errorClass semua attempt = server', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'server'), true);
  });
  check('F3-2b fast 502: ok=false', () => assert.equal(r.ok, false));
}

// --- F3-2c. Timeout Atmo melewati key Atmo berikutnya (model sama —
//      skip level model; cap mengizinkan 3 attempt, skip berasal dari
//      aturan timeout, bukan cap). Mode 'advanced', 2 key Atmo: cx k0
//      timeout -> cx k1 ter-skip, ag k0 + mv k0 tetap dicoba = 3 attempt.
setKeys({ atmo: 2 });
setBehavior({ atmo: 'timeout' });
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('F3-2c atmo timeout: tepat 3 attempt (cx 1x, ag 1x, mv 1x)', () => assert.deepEqual(seq(r), [
    ATMO_CX,
    ATMO_AG,
    ATMO_MV,
  ]));
  check('F3-2c atmo timeout: errorClass semua timeout', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'timeout'), true);
  });
  check('F3-2c atmo timeout: ok=false', () => assert.equal(r.ok, false));
}

// --- F3-2d. Aturan timeout berlaku umum (mode chat): Crown timeout ->
//      River 1017 menjawab.
setKeys({ crown: true, river: true });
setBehavior({ crown: 'timeout', river: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('F3-2d chat timeout: urutan [crown V4, river-flash 1017]', () => assert.deepEqual(seq(r), [
    CROWN_V4,
    RIVER_1017,
  ]));
  check('F3-2d chat timeout: ok via river-flash', () => assert.equal(r.ok, true));
}

// --- F3-2e. Batas klasifikasi: throw BUKAN AbortError tetap 'network' dan
//      TIDAK memicu skip — semua model tetap dicoba (advanced, 3 model Atmo).
setKeys({ atmo: true });
setBehavior({ atmo: 'netthrow' });
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('F3-2e netthrow: errorClass network, bukan timeout', () => {
    assert.equal(r.attempts[0].errorClass, 'network');
  });
  check('F3-2e netthrow: ketiga model TETAP dicoba', () => assert.deepEqual(seq(r), [
    ATMO_CX,
    ATMO_AG,
    ATMO_MV,
  ]));
  check('F3-2e netthrow: ok=false', () => assert.equal(r.ok, false));
}

// --- F3-2f. Crown timeout, 2 key: timeout-skip LEVEL MODEL melewati key
//      Crown kedua (model sama — V4-0731) -> River menjawab. Hanya 1
//      attempt Crown walau 2 key tersedia. Tanpa skip level model, key
//      kedua akan dicoba (dan timeout lagi, 55 dtk sia-sia).
setKeys({ crown: 2, river: true });
setBehavior({ crown: 'timeout', river: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('F3-2f crown timeout 2-key: urutan [crown V4 1x, river-flash 1017]', () => assert.deepEqual(seq(r), [
    CROWN_V4,
    RIVER_1017,
  ]));
  check('F3-2f crown timeout 2-key: attempt Crown errorClass timeout', () => {
    assert.equal(r.attempts[0].errorClass, 'timeout');
  });
  check('F3-2f crown timeout 2-key: ok via river-flash (fallback timeout terbukti)', () => assert.equal(r.ok, true));
}

console.log(`\ngatewayF3ChainFix: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
