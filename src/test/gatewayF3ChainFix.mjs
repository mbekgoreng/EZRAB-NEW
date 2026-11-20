/**
 * gatewayF3ChainFix.mjs — perbaikan rantai gateway Fase 3 audit besar DED
 * (2026-11-18). Fetch di-stub per host; tidak ada panggilan jaringan nyata,
 * tidak ada key asli, tidak ada penantian 55 dtk (timeout disimulasikan
 * dengan AbortError yang dilempar stub fetch — jalur klasifikasi yang sama
 * persis dengan timer attempt di produksi).
 *
 * Bukti (log runtime Vercel deployment c96881c, 18 Nov 02:32–03:07 WIB):
 *  FAST (28 panggilan, semua gagal identik): WeizeRouter weizerouter-v2
 *  502 -> Gemini 401 x2 (cap per-provider) -> rantai berhenti, HTTP 400.
 *  Tabel External APIs mencatat POST api.zyrouter.com per request FAST,
 *  tapi array attempts log TIDAK mencatat upaya/error ZyRouter.
 *  DETAIL gagal (4 panggilan, pola byte-identik): wz/gpt-6-luna diaborsi
 *  di 55.000 ms, wz/deepseek-v4.1-flash diaborsi di 55.001 ms, total
 *  110.002 ms > budget rantai 100 dtk -> HTTP 502. 13 DETAIL BERHASIL
 *  via wz/gpt-6-luna sekali upaya (±43,7 dtk).
 *
 * Yang dibuktikan suite ini (diperbarui 2026-11-19: F3-1a DIGANTIKAN
 * keputusan owner WeizeRouter-only; F3-2 diadaptasi ke skip level MODEL;
 * catatan 2026-11-20: rantai fast/ded kini + fallback Crown — skenario
 * suite ini TANPA key Crown sehingga urutan WeizeRouter-only tetap
 * berlaku di sini):
 *  F3-1a Fast WeizeRouter-only (tanpa key Crown di skenario ini):
 *        WeizeRouter 502 -> keenam model dicoba,
 *        ArxPay TIDAK PERNAH muncul (dulu: ArxPay kaki kedua fast).
 *  F3-1b/1c CELAH LOGGING (bug nyata, DIPERTAHANKAN — perbaikan F3-1b):
 *        attempt yang membunuh rantai lewat early-return policy/client_error
 *        TIDAK PERNAH sampai ke callback onAttempt — attemptLog server
 *        (satu-satunya catatan attempts sejak masking) kehilangan attempt
 *        fatal itu. Itulah mengapa ZyRouter 400 tidak muncul di log padahal
 *        dipanggil. Sesudah perbaikan, onAttempt dipanggil SEBELUM early
 *        return. (Skenario memakai mode 'chat' — 'fast' tidak lagi berisi
 *        Gemini/ZyRouter sejak WeizeRouter-only.)
 *  F3-1d Jalur normal tidak berubah: setiap attempt failover tetap
 *        dilaporkan ke onAttempt sesuai urutan.
 *  F3-2a Timeout-skip LEVEL MODEL (DED): wz/gpt-6-luna timeout ->
 *        weizerouter-v1 TETAP dicoba (skip level provider akan mematikan
 *        rantai satu-provider); kelima model dicoba, semua 'timeout'.
 *  F3-2b Kegagalan CEPAT tetap memakai rotasi model: WeizeRouter 502 ->
 *        semua model TETAP dicoba (hanya timeout yang melewati model).
 *  F3-2c Timeout Gemini melewati key Gemini berikutnya (model sama —
 *        skip level model; cap 2 tidak relevan — skip berasal dari aturan
 *        timeout, bukan cap).
 *  F3-2d Aturan timeout berlaku umum (mode chat, 3 model WeizeRouter):
 *        ketiganya dicoba walau timeout, lalu ArxPay menjawab.
 *  F3-2e Batas klasifikasi: throw BUKAN AbortError tetap 'network' dan
 *        TIDAK memicu skip (hanya AbortError tanpa disconnect = timeout).
 *  F3-2f Crown timeout di chat (owner 2026-11-19 05:55): ketiga model
 *        Crown timeout satu per satu (skip level model), lalu WeizeRouter
 *        menjawab — fallback timeout Crown -> rantai lain terbukti.
 *
 * Yang SENGAJA tidak diubah (tercatat di aiGateway.js):
 *  - Budget rantai tetap 100 dtk dan timeout attempt tetap 55 dtk.
 *    Menambah budget di atas ~125 dtk sia-sia: klien DED DETAIL membatalkan
 *    di 181 dtk dan worst case = budget + 55 dtk overshoot. Mempersingkat
 *    timeout attempt akan mematahkan 13 sukses DETAIL terbukti (±43,7 dtk).
 *  - Aturan berhenti F1 (policy/client_error menghentikan rantai) tidak
 *    diubah — itu desain audit 2026-10-31. HTTP 400 FAST adalah F1 yang
 *    bekerja (ZyRouter 400 -> AI_BAD_REQUEST), bukan bug; yang bug adalah
 *    logging-nya (F3-1b/1c).
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

function setKeys(spec) {
  for (const v of [
    'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'ZYROUTER_API_KEY',
    'ATRIA_API_KEY_1', 'ARXPAY_API_KEY', 'WEIZEROUTER_API_KEY', 'CROWN_API_KEY',
  ]) delete process.env[v];
  if (spec.gemini) {
    process.env.GEMINI_API_KEY_1 = 'dummy-g1';
    if (spec.gemini >= 2) process.env.GEMINI_API_KEY_2 = 'dummy-g2';
  }
  if (spec.zyrouter) process.env.ZYROUTER_API_KEY = 'dummy-zy';
  if (spec.atria) process.env.ATRIA_API_KEY_1 = 'dummy-atria';
  if (spec.arxpay) process.env.ARXPAY_API_KEY = 'dummy-arxpay';
  if (spec.weize) process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
  if (spec.crown) process.env.CROWN_API_KEY = 'dummy-crown';
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
  if (u.includes('generativelanguage.googleapis.com/v1beta/openai')) return 'geminiOai';
  if (u.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (u.includes('api.zyrouter.com')) return 'zyrouter';
  if (u.includes('api.atria-asi.ai')) return 'atria';
  if (u.includes('arxpay.my.id')) return 'arxpay';
  if (u.includes('weizerouter.web.id')) return 'weizerouter';
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
  if (host === 'gemini') {
    const payload = { candidates: [{ content: { parts: [{ text: 'OK-GEMINI' }] } }], usageMetadata: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
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

// --- F3-1a (DIGANTIKAN keputusan owner 2026-11-19 02:09): ArxPay BUKAN
//      lagi kaki kedua fast — fast WeizeRouter-only DI SKENARIO INI
//      (tanpa key Crown; sejak 2026-11-20 rantai fast punya fallback
//      Crown — lihat dedCrownFallback.mjs). Weize 502 -> keenam
//      model WeizeRouter dicoba, ArxPay TIDAK PERNAH muncul walau key-nya
//      ada (bentuk env Vercel yang hidup).
setKeys({ weize: true, arxpay: true, gemini: 1, zyrouter: true, atria: true });
setBehavior({ weizerouter: 'fail500', arxpay: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('F3-1a fast WeizeRouter-only: ok=false (semua kaki weize 502)', () => assert.equal(r.ok, false));
  check('F3-1a fast WeizeRouter-only: keenam model dicoba', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/deepseek-v4-flash-0731',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash',
  ]));
  check('F3-1a fast WeizeRouter-only: arxpay TIDAK muncul', () => {
    assert.equal(seq(r).some((s) => s.startsWith('arxpay:')), false);
  });
}

// --- F3-1b. Celah logging: attempt client_error yang membunuh rantai HARUS
//      sampai ke onAttempt (sebelum perbaikan, callback dilewati dan
//      attemptLog server kehilangan attempt fatal itu — kasus ZyRouter).
//      Mode 'chat' (fast tidak lagi berisi Gemini sejak WeizeRouter-only).
setKeys({ gemini: 1 });
setBehavior({ gemini: 'fail400' });
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
    assert.equal(seen[0].provider, 'gemini');
    assert.equal(seen[0].errorClass, 'client_error');
    assert.equal(seen[0].ok, false);
  });
}

// --- F3-1c. Celah logging, varian policy. Mode 'chat' (lihat F3-1b).
setKeys({ gemini: 1 });
setBehavior({ gemini: 'fail400policy' });
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
    assert.equal(seen[0].provider, 'gemini');
    assert.equal(seen[0].errorClass, 'policy');
  });
}

// --- F3-1d. Jalur normal: setiap attempt failover tetap ke onAttempt berurutan.
//      Mode 'chat' (lihat F3-1b).
setKeys({ gemini: 1, zyrouter: true });
setBehavior({ gemini: 'fail429', zyrouter: 'ok' });
{
  const seen = [];
  const r = await executeAI({ message: 'halo', mode: 'chat' }, (a) => seen.push(a));
  check('F3-1d failover: ok via zyrouter', () => assert.equal(r.ok, true));
  check('F3-1d failover: onAttempt menerima kedua attempt berurutan', () => {
    assert.deepEqual(seen.map((a) => `${a.provider}:${a.ok}`), ['gemini:false', 'zyrouter:true']);
    assert.equal(seen[0].errorClass, 'rate');
  });
}

// --- F3-2a. Timeout-skip LEVEL MODEL (DED, adaptasi 2026-11-19):
//      wz/gpt-6-luna timeout -> weizerouter-v1 TETAP dicoba (skip level
//      provider akan mematikan rantai satu-provider); kelima model dicoba.
setKeys({ weize: true, arxpay: true });
setBehavior({ weizerouter: 'timeout', arxpay: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('F3-2a ded timeout: ok=false (semua kaki weize timeout, tanpa fallback)', () => assert.equal(r.ok, false));
  check('F3-2a ded timeout: attempt 1 errorClass timeout', () => {
    assert.equal(r.attempts[0].provider, 'weizerouter');
    assert.equal(r.attempts[0].model, 'wz/gpt-6-luna');
    assert.equal(r.attempts[0].errorClass, 'timeout');
  });
  check('F3-2a ded timeout: kelima model TETAP dicoba (skip level model)', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
  ]));
  check('F3-2a ded timeout: semua attempt errorClass timeout', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'timeout'), true);
  });
  check('F3-2a ded timeout: arxpay TIDAK muncul (ded WeizeRouter-only)', () => {
    assert.equal(seq(r).some((s) => s.startsWith('arxpay:')), false);
  });
}

// --- F3-2b. Kontras: kegagalan CEPAT (502) tetap memakai rotasi model.
setKeys({ weize: true, arxpay: true });
setBehavior({ weizerouter: 'fail500', arxpay: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('F3-2b ded 502: kelima model WeizeRouter TETAP dicoba', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
  ]));
  check('F3-2b ded 502: errorClass semua attempt = server', () => {
    assert.equal(r.attempts.every((a) => a.errorClass === 'server'), true);
  });
  check('F3-2b ded 502: ok=false (tanpa fallback)', () => assert.equal(r.ok, false));
}

// --- F3-2c. Timeout Gemini melewati key Gemini berikutnya (model sama —
//      skip level model; cap mengizinkan 2 attempt, skip berasal dari
//      aturan timeout, bukan cap). Mode 'chat' (lihat F3-1b).
setKeys({ gemini: 2 });
setBehavior({ gemini: 'timeout' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('F3-2c gemini timeout: tepat 1 attempt walau 2 key tersedia', () => {
    assert.equal(r.attempts.filter((a) => a.provider === 'gemini').length, 1);
  });
  check('F3-2c gemini timeout: errorClass timeout', () => {
    assert.equal(r.attempts[0].errorClass, 'timeout');
  });
  check('F3-2c gemini timeout: ok=false (tidak ada kaki lain)', () => assert.equal(r.ok, false));
}

// --- F3-2d. Aturan timeout level model berlaku umum (mode chat, 3 model
//      WeizeRouter): v2 timeout -> kimi-k2.7 TETAP dicoba -> kimi-k2.6
//      TETAP dicoba -> ArxPay menjawab.
setKeys({ weize: true, arxpay: true });
setBehavior({ weizerouter: 'timeout', arxpay: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('F3-2d chat timeout: urutan [weize v2, kimi-2.7, kimi-2.6, arxpay]', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:kimi-k2.7',
    'weizerouter:kimi-k2.6',
    'arxpay:deepseek-v4.1-flash',
  ]));
  check('F3-2d chat timeout: ok via arxpay', () => assert.equal(r.ok, true));
}

// --- F3-2e. Batas klasifikasi: throw BUKAN AbortError tetap 'network' dan
//      TIDAK memicu skip — semua model tetap dicoba.
setKeys({ weize: true, arxpay: true });
setBehavior({ weizerouter: 'netthrow', arxpay: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('F3-2e netthrow: errorClass network, bukan timeout', () => {
    assert.equal(r.attempts[0].errorClass, 'network');
  });
  check('F3-2e netthrow: kelima model TETAP dicoba', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
  ]));
  check('F3-2e netthrow: ok=false (tanpa fallback)', () => assert.equal(r.ok, false));
}

// --- F3-2f. Crown timeout di chat (owner 2026-11-19 05:55, Crown prioritas
//      No.1): GLM timeout -> DeepSeek TETAP dicoba -> MiniMax TETAP dicoba
//      (skip level model, bukan level provider) -> WeizeRouter menjawab.
//      Tanpa skip level model, timeout GLM akan mematikan kedua model
//      Crown lainnya dan rantai langsung jatuh ke WeizeRouter.
setKeys({ crown: true, weize: true });
setBehavior({ crown: 'timeout', weizerouter: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('F3-2f crown timeout: urutan [GLM, DeepSeek, MiniMax, weize v2]', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'weizerouter:weizerouter-v2',
  ]));
  check('F3-2f crown timeout: ketiga attempt Crown errorClass timeout', () => {
    assert.equal(r.attempts.slice(0, 3).every((a) => a.errorClass === 'timeout'), true);
  });
  check('F3-2f crown timeout: ok via weizerouter (fallback timeout terbukti)', () => assert.equal(r.ok, true));
}

console.log(`\ngatewayF3ChainFix: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
