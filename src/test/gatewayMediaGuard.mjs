/**
 * gatewayMediaGuard.mjs — B4 (2026-11-19): penjaga media untuk rantai
 * text-only 'fast'/'ded' di executeAI (api/_lib/aiGateway.js).
 *
 * Latar: rantai fast + ded WeizeRouter-only (keputusan owner 2026-11-19
 * 02:09) dan SEMUA kakinya text-only. Bila sebuah caller melampirkan
 * gambar/PDF ke fast/ded, semua kaki dilewati dan rantai menjadi KOSONG
 * — sebelum guard ini, hasilnya adalah kegagalan diam-diam 'No AI
 * provider keys configured' yang menyesatkan (bukan soal key sama sekali).
 * Hari ini tidak ada caller produksi yang melampirkan media ke fast/ded
 * (DED text-only, withImages: false) — guard ini menutup jebakan laten
 * untuk caller masa depan.
 *
 * Yang dibuktikan suite ini (fetch di-stub per host; tidak ada panggilan
 * jaringan nyata, tidak ada key asli):
 *  B4-1 fast + gambar  -> gagal-cepat MEDIA_NOT_SUPPORTED_FOR_MODE,
 *        0 panggilan provider, pesan menyebut 'fast' + 'vision'.
 *  B4-2 fast + PDF     -> guard yang sama, pesan menyebut PDF.
 *  B4-3 ded + gambar   -> guard, pesan menyebut 'ded'.
 *  B4-4 ded + PDF      -> guard.
 *  B4-5 ded + gambar+PDF -> guard, pesan menyebut keduanya.
 *  B4-6 fast tanpa media TIDAK BERUBAH: keenam model dicoba berurutan.
 *  B4-7 ded tanpa media TIDAK BERUBAH: kelima model dicoba; WeizeRouter
 *        menjawab via wz/gpt-6-luna sebagai kaki pertama.
 *  B4-8 'quick' + gambar -> guard (mode tak dikenal jatuh ke cabang else
 *        yang memakai rantai text-only yang sama dengan fast).
 *  B4-9 chat + gambar TIDAK dijaga: Gemini native menjawab (kaki teks
 *        dilewati, kaki vision-capable tetap jalan).
 *  B4-10 advanced + gambar TIDAK dijaga: Gemini native menjawab.
 *  B4-11 Guard mendahului soal key: fast + gambar TANPA key apa pun
 *        tetap MEDIA_NOT_SUPPORTED_FOR_MODE (bukan 'No AI provider keys
 *        configured'); fast tanpa media tanpa key tetap pesan no-key lama.
 *  B4-12 vision + gambar TIDAK dijaga (mode vision memang untuk media).
 *  B4-13 handleAiRequest: fast + gambar -> HTTP 400 (bukan 502 generik),
 *        errorCode MEDIA_NOT_SUPPORTED_FOR_MODE, 0 panggilan provider.
 *  B4-14 handleAiRequest: DED_AI_DETAIL + gambar -> HTTP 400 yang sama.
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

// Supabase "configured" agar authenticateRequest memakai jalur JWT dengan
// verifier suntikan (pola gatewayDemoPolicy.mjs) untuk skenario B4-13/14.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy-anon-key';

function setKeys(spec) {
  for (const v of [
    'GEMINI_API_KEY_1', 'ZYROUTER_API_KEY', 'ARXPAY_API_KEY',
    'WEIZEROUTER_API_KEY', 'CROWN_API_KEY',
  ]) delete process.env[v];
  if (spec.gemini) process.env.GEMINI_API_KEY_1 = 'dummy-g1';
  if (spec.zyrouter) process.env.ZYROUTER_API_KEY = 'dummy-zy';
  if (spec.arxpay) process.env.ARXPAY_API_KEY = 'dummy-arxpay';
  if (spec.weize) process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
  if (spec.crown) process.env.CROWN_API_KEY = 'dummy-crown';
}

// behavior per host: 'ok' | 'fail500'
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
  if (u.includes('arxpay.my.id')) return 'arxpay';
  if (u.includes('weizerouter.web.id')) return 'weizerouter';
  if (u.includes('crown.ai.id')) return 'crown';
  return 'unknown';
}

let fetchCalls = 0;
global.fetch = async (url) => {
  fetchCalls++;
  const host = hostOf(url);
  const b = behavior[host] || 'fail500';
  if (b !== 'ok') return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
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

// Bentuk guard yang diharapkan — dipakai bersama skenario B4-1..B4-5/B4-8.
function expectGuard(r, mode, mediaWords) {
  assert.equal(r.ok, false, 'ok harus false');
  assert.equal(r.errorCode, 'MEDIA_NOT_SUPPORTED_FOR_MODE', 'errorCode');
  assert.equal(r.errorClass, 'media_unsupported', 'errorClass');
  assert.deepEqual(r.attempts, [], 'attempts harus kosong (gagal sebelum kaki mana pun)');
  assert.ok(typeof r.error === 'string' && r.error.length > 0, 'error harus berupa pesan');
  assert.ok(r.error.includes(`'${mode}'`), `pesan harus menyebut mode '${mode}': ${r.error}`);
  assert.ok(r.error.includes('vision'), `pesan harus menyarankan mode vision: ${r.error}`);
  for (const w of mediaWords) {
    assert.ok(r.error.includes(w), `pesan harus menyebut ${w}: ${r.error}`);
  }
}

const IMG = { imageDataBase64: 'AAAA', imageMimeType: 'image/png' };
const PDF = { pdfDataBase64: 'BBBB' };

// --- B4-1. fast + gambar -> guard, 0 panggilan provider.
setKeys({ weize: true, gemini: 1 });
setBehavior({ weizerouter: 'ok', gemini: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'fast', ...IMG });
  check('B4-1 fast+gambar: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'fast', ['gambar']));
  check('B4-1 fast+gambar: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-2. fast + PDF -> guard.
setKeys({ weize: true });
setBehavior({ weizerouter: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'baca pdf', mode: 'fast', ...PDF });
  check('B4-2 fast+PDF: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'fast', ['PDF']));
  check('B4-2 fast+PDF: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-3. ded + gambar -> guard.
setKeys({ weize: true, gemini: 1 });
setBehavior({ weizerouter: 'ok', gemini: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'ded', ...IMG });
  check('B4-3 ded+gambar: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'ded', ['gambar']));
  check('B4-3 ded+gambar: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-4. ded + PDF -> guard.
setKeys({ weize: true });
setBehavior({ weizerouter: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'baca pdf', mode: 'ded', ...PDF });
  check('B4-4 ded+PDF: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'ded', ['PDF']));
  check('B4-4 ded+PDF: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-5. ded + gambar+PDF -> guard, pesan menyebut keduanya.
setKeys({ weize: true });
setBehavior({ weizerouter: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat keduanya', mode: 'ded', ...IMG, ...PDF });
  check('B4-5 ded+gambar+PDF: guard, pesan menyebut keduanya', () => expectGuard(r, 'ded', ['gambar', 'PDF']));
  check('B4-5 ded+gambar+PDF: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-6. fast tanpa media TIDAK BERUBAH: keenam model dicoba berurutan.
setKeys({ weize: true });
setBehavior({ weizerouter: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('B4-6 fast tanpa media: ok=false (semua kaki 502)', () => assert.equal(r.ok, false));
  check('B4-6 fast tanpa media: keenam model tetap dicoba berurutan', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/deepseek-v4-flash-0731',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash',
  ]));
  check('B4-6 fast tanpa media: BUKAN error guard', () => assert.equal(r.errorCode, undefined));
}

// --- B4-7. ded tanpa media TIDAK BERUBAH: kelima model dicoba; WeizeRouter
//      menjawab via wz/gpt-6-luna sebagai kaki pertama.
setKeys({ weize: true });
setBehavior({ weizerouter: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('B4-7 ded tanpa media: kelima model tetap dicoba berurutan', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
  ]));
  check('B4-7 ded tanpa media: BUKAN error guard', () => assert.equal(r.errorCode, undefined));
}
setBehavior({ weizerouter: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('B4-7 ded tanpa media: WeizeRouter menjawab via wz/gpt-6-luna', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'weizerouter');
    assert.equal(r.model, 'wz/gpt-6-luna');
  });
}

// --- B4-8. 'quick' + gambar -> guard (cabang else = rantai fast yang sama).
setKeys({ weize: true });
setBehavior({ weizerouter: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'quick', ...IMG });
  check("B4-8 quick+gambar: guard (cabang else text-only)", () => expectGuard(r, 'quick', ['gambar']));
  check("B4-8 quick+gambar: 0 panggilan provider (fail fast)", () => assert.equal(fetchCalls, 0));
}

// --- B4-9. chat + gambar TIDAK dijaga: Gemini native menjawab (kaki
//      teks dilewati, kaki vision-capable tetap jalan).
setKeys({ crown: true, weize: true, arxpay: true, gemini: 1 });
setBehavior({ gemini: 'ok', crown: 'ok', weizerouter: 'ok', arxpay: 'ok' });
{
  const r = await executeAI({ message: 'lihat gambar', mode: 'chat', ...IMG });
  check('B4-9 chat+gambar: TIDAK dijaga, Gemini native menjawab', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'gemini');
  });
  check('B4-9 chat+gambar: hanya kaki Gemini yang dicoba', () => assert.deepEqual(seq(r), [
    'gemini:gemini-3.5-flash-lite',
  ]));
}

// --- B4-10. advanced + gambar TIDAK dijaga: Gemini native menjawab.
setKeys({ weize: true, arxpay: true, crown: true, gemini: 1 });
setBehavior({ gemini: 'ok', weizerouter: 'ok', arxpay: 'ok', crown: 'ok' });
{
  const r = await executeAI({ message: 'lihat gambar', mode: 'advanced', ...IMG });
  check('B4-10 advanced+gambar: TIDAK dijaga, Gemini native menjawab', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'gemini');
  });
}

// --- B4-11. Guard mendahului soal key: fast + gambar TANPA key apa pun
//      tetap MEDIA_NOT_SUPPORTED_FOR_MODE; fast tanpa media tanpa key
//      tetap pesan no-key lama (guard tidak mengubah jalur itu).
setKeys({});
setBehavior({});
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'fast', ...IMG });
  check('B4-11 fast+gambar tanpa key: guard, bukan pesan no-key', () => {
    expectGuard(r, 'fast', ['gambar']);
    assert.notEqual(r.error, 'No AI provider keys configured');
  });
  check('B4-11 fast+gambar tanpa key: 0 panggilan provider', () => assert.equal(fetchCalls, 0));
  const rn = await executeAI({ message: 'halo', mode: 'fast' });
  check('B4-11 fast tanpa media tanpa key: pesan no-key lama tidak berubah', () => {
    assert.equal(rn.ok, false);
    assert.equal(rn.error, 'No AI provider keys configured');
    assert.deepEqual(seq(rn), []);
  });
}

// --- B4-12. vision + gambar TIDAK dijaga (mode vision memang untuk media).
setKeys({ gemini: 1 });
setBehavior({ gemini: 'ok' });
{
  const r = await executeAI({ message: 'lihat gambar', mode: 'vision', ...IMG });
  check('B4-12 vision+gambar: TIDAK dijaga, Gemini menjawab', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'gemini');
  });
}

// --- B4-13/14. handleAiRequest: guard dipetakan ke HTTP 400 (bukan 502
//      generik), 0 panggilan provider. Pola mock dari gatewayDemoPolicy.mjs.
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
const productIdToMode = (pid, requestedMode) => {
  if (pid === 'DED_AI_DETAIL') return 'ded';
  if (pid === 'DOKUMEN_AI') return 'advanced';
  if (pid === 'EZRAB_AI') return requestedMode === 'advanced' ? 'advanced' : 'chat';
  return 'fast';
};
const registeredUser = { id: 'user-registered-b4', email: 'user@example.id', isAnonymous: false };
const verifierFor = (user) => async (token) =>
  token ? { ok: true, user } : { ok: false, reason: 'missing_token' };
const ORIGIN = { origin: 'https://ezrab-site.vercel.app', authorization: 'Bearer <redacted>' };

setKeys({ weize: true, gemini: 1 });
setBehavior({ weizerouter: 'ok', gemini: 'ok' });
{
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(
    mockReq({ headers: ORIGIN, body: { message: 'lihat gambar', mode: 'fast', ...IMG } }),
    res,
    { productIdToMode, jwtVerifier: verifierFor(registeredUser) }
  );
  check('B4-13 HTTP fast+gambar: status 400', () => assert.equal(res.statusCode, 400));
  check('B4-13 HTTP fast+gambar: errorCode MEDIA_NOT_SUPPORTED_FOR_MODE', () => assert.equal(res.body.errorCode, 'MEDIA_NOT_SUPPORTED_FOR_MODE'));
  check('B4-13 HTTP fast+gambar: pesan menyebut fast + vision', () => {
    assert.ok(res.body.error.includes("'fast'"), res.body.error);
    assert.ok(res.body.error.includes('vision'), res.body.error);
  });
  check('B4-13 HTTP fast+gambar: 0 panggilan provider', () => assert.equal(fetchCalls, 0));
}
{
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(
    mockReq({ headers: ORIGIN, body: { message: 'lihat gambar', productId: 'DED_AI_DETAIL', ...IMG } }),
    res,
    { productIdToMode, jwtVerifier: verifierFor(registeredUser) }
  );
  check('B4-14 HTTP ded+gambar: status 400', () => assert.equal(res.statusCode, 400));
  check('B4-14 HTTP ded+gambar: errorCode MEDIA_NOT_SUPPORTED_FOR_MODE', () => assert.equal(res.body.errorCode, 'MEDIA_NOT_SUPPORTED_FOR_MODE'));
  check('B4-14 HTTP ded+gambar: pesan menyebut ded', () => assert.ok(res.body.error.includes("'ded'"), res.body.error));
  check('B4-14 HTTP ded+gambar: 0 panggilan provider', () => assert.equal(fetchCalls, 0));
}

console.log(`\ngatewayMediaGuard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
