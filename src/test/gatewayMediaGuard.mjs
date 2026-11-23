/**
 * gatewayMediaGuard.mjs — B4 (2026-11-19): penjaga media untuk rantai
 * text-only di executeAI (api/_lib/aiGateway.js), ditulis ulang untuk
 * SPESIFIKASI FINAL owner 2026-11-22 01:37.
 *
 * Latar: rantai 'fast'/'ded'/'chat'/'advanced'/'docai' SEMUA kakinya
 * text-only. Bila sebuah caller melampirkan gambar/PDF ke mode teks,
 * semua kaki dilewati dan rantai menjadi KOSONG — sebelum guard ini,
 * hasilnya adalah kegagalan diam-diam 'No AI provider keys configured'
 * yang menyesatkan (bukan soal key sama sekali).
 * PERUBAHAN 2026-11-22: dulu chat/advanced + media TIDAK dijaga karena
 * Gemini native (satu-satunya kaki vision-capable) menjawab; Gemini
 * native dicabut dari semua rantai 2026-11-22, jadi guard kini berlaku
 * untuk SEMUA mode teks termasuk 'chat', 'advanced', dan mode baru
 * 'docai'. Hari ini tidak ada caller produksi yang melampirkan media ke
 * mode teks (media selalu ke 'vision') — guard ini menutup jebakan laten
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
 *  B4-6 fast tanpa media TIDAK BERUBAH: keempat kaki dicoba berurutan.
 *  B4-7 ded tanpa media TIDAK BERUBAH: kedua kaki dicoba; Atmo cx
 *        menjawab sebagai kaki pertama.
 *  B4-8 'quick' + gambar -> guard (mode tak dikenal jatuh ke cabang else
 *        yang memakai rantai text-only yang sama dengan fast).
 *  B4-9 chat + gambar KINI DIJAGA (dulu Gemini native menjawab —
 *        Gemini dicabut 2026-11-22).
 *  B4-10 advanced + gambar KINI DIJAGA (alasan sama).
 *  B4-10b docai + gambar -> guard (mode baru, text-only seperti chat).
 *  B4-11 Guard mendahului soal key: fast + gambar TANPA key apa pun
 *        tetap MEDIA_NOT_SUPPORTED_FOR_MODE (bukan 'No AI provider keys
 *        configured'); fast tanpa media tanpa key tetap pesan no-key lama.
 *  B4-12 vision + gambar TIDAK dijaga (mode vision memang untuk media):
 *        River vision menjawab sebagai kaki pertama.
 *  B4-12b vision + PDF -> gagal-cepat dengan pesan spesifik (bukan
 *        guard media teks — hanya Gemini native yang membaca PDF dan
 *        kakinya dicabut 2026-11-22), 0 attempt.
 *  B4-13 handleAiRequest: fast + gambar -> HTTP 400 (bukan 502 generik),
 *        errorCode MEDIA_NOT_SUPPORTED_FOR_MODE, 0 panggilan provider.
 *  B4-14 handleAiRequest: DED_AI_DETAIL + gambar -> HTTP 400 yang sama.
 *  B4-15 handleAiRequest: DOKUMEN_AI + gambar -> HTTP 400 yang sama
 *        (mode 'docai' — pemetaan baru 2026-11-22).
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
  'DAHL_API_KEY', 'ATMO_API_KEY', 'CROWN_API_KEY', 'ARXPAY_API_KEY',
  'WEIZEROUTER_API_KEY', 'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
]) delete process.env[v];
for (let i = 1; i <= 80; i++) {
  delete process.env['GEMINI_API_KEY_' + i];
  delete process.env['DAHL_API_KEY_' + i];
  delete process.env['ATRIA_API_KEY_' + i];
  delete process.env['GEMINI_OAI_KEY_' + i];
  delete process.env['WEIZEROUTER_API_KEY_' + i];
  delete process.env['ARXPAY_API_KEY_' + i];
}
delete process.env.AI_METERING_ENABLED;

// Supabase "configured" agar authenticateRequest memakai jalur JWT dengan
// verifier suntikan (pola gatewayDemoPolicy.mjs) untuk skenario B4-13/14/15.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy-anon-key';

function setKeys(spec) {
  for (const v of [
    'RIVER_API_KEY_1', 'ZYROUTER_API_KEY', 'ATMO_API_KEY', 'CROWN_API_KEY',
  ]) delete process.env[v];
  if (spec.river) process.env.RIVER_API_KEY_1 = 'dummy-river';
  if (spec.zyrouter) process.env.ZYROUTER_API_KEY = 'dummy-zy';
  if (spec.atmo) process.env.ATMO_API_KEY = 'dummy-atmo';
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
  if (u.includes('api.zyrouter.com')) return 'zyrouter';
  if (u.includes('api.river.ai')) return 'river';
  if (u.includes('atmorouter.dev')) return 'atmo';
  if (u.includes('crown.ai.id')) return 'crown';
  return 'unknown';
}

let fetchCalls = 0;
global.fetch = async (url) => {
  fetchCalls++;
  const host = hostOf(url);
  const b = behavior[host] || 'fail500';
  if (b !== 'ok') return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
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

// Bentuk guard yang diharapkan — dipakai bersama skenario B4-1..B4-5/B4-8/B4-9/B4-10/B4-10b.
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
const CROWN_V4 = 'crown:deepseek-ai/DeepSeek-V4-Flash-0731';
const RIVER_NEMOTRON = 'river-text:nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4';
const RIVER_1017 = 'river-flash:deepseek-ai/DeepSeek-V4.1-Flash-1017';
const RIVER_VISION = 'river-vision:deepseek-ai/DeepSeek-V4.1-Flash';
const ATMO_CX = 'atmorouter:cx/gpt-6-luna';
const ATMO_AG = 'atmorouter:ag/gemini-3.8-flash-high';
const FAST_SEQ = [CROWN_V4, RIVER_NEMOTRON, RIVER_1017, ATMO_CX];

// --- B4-1. fast + gambar -> guard, 0 panggilan provider.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'ok', river: 'ok', atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'fast', ...IMG });
  check('B4-1 fast+gambar: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'fast', ['gambar']));
  check('B4-1 fast+gambar: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-2. fast + PDF -> guard.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'ok', river: 'ok', atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'baca pdf', mode: 'fast', ...PDF });
  check('B4-2 fast+PDF: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'fast', ['PDF']));
  check('B4-2 fast+PDF: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-3. ded + gambar -> guard.
setKeys({ atmo: true });
setBehavior({ atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'ded', ...IMG });
  check('B4-3 ded+gambar: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'ded', ['gambar']));
  check('B4-3 ded+gambar: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-4. ded + PDF -> guard.
setKeys({ atmo: true });
setBehavior({ atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'baca pdf', mode: 'ded', ...PDF });
  check('B4-4 ded+PDF: guard MEDIA_NOT_SUPPORTED_FOR_MODE', () => expectGuard(r, 'ded', ['PDF']));
  check('B4-4 ded+PDF: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-5. ded + gambar+PDF -> guard, pesan menyebut keduanya.
setKeys({ atmo: true });
setBehavior({ atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat keduanya', mode: 'ded', ...IMG, ...PDF });
  check('B4-5 ded+gambar+PDF: guard, pesan menyebut keduanya', () => expectGuard(r, 'ded', ['gambar', 'PDF']));
  check('B4-5 ded+gambar+PDF: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-6. fast tanpa media TIDAK BERUBAH: keempat kaki dicoba berurutan.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'fail500', river: 'fail500', atmo: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('B4-6 fast tanpa media: ok=false (semua kaki 502)', () => assert.equal(r.ok, false));
  check('B4-6 fast tanpa media: keempat kaki tetap dicoba berurutan', () => assert.deepEqual(seq(r), FAST_SEQ));
  check('B4-6 fast tanpa media: BUKAN error guard', () => assert.equal(r.errorCode, undefined));
}

// --- B4-7. ded tanpa media TIDAK BERUBAH: kedua kaki dicoba; Atmo cx
//      menjawab sebagai kaki pertama.
setKeys({ atmo: true });
setBehavior({ atmo: 'fail500' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('B4-7 ded tanpa media: kedua kaki tetap dicoba berurutan', () => assert.deepEqual(seq(r), [
    ATMO_CX,
    ATMO_AG,
  ]));
  check('B4-7 ded tanpa media: BUKAN error guard', () => assert.equal(r.errorCode, undefined));
}
setBehavior({ atmo: 'ok' });
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('B4-7 ded tanpa media: Atmo menjawab via cx/gpt-6-luna', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'cx/gpt-6-luna');
  });
}

// --- B4-8. 'quick' + gambar -> guard (cabang else = rantai fast yang sama).
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'ok', river: 'ok', atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'quick', ...IMG });
  check("B4-8 quick+gambar: guard (cabang else text-only)", () => expectGuard(r, 'quick', ['gambar']));
  check("B4-8 quick+gambar: 0 panggilan provider (fail fast)", () => assert.equal(fetchCalls, 0));
}

// --- B4-9. chat + gambar KINI DIJAGA: dulu Gemini native menjawab (kaki
//      teks dilewati, kaki vision-capable tetap jalan) — Gemini native
//      dicabut dari semua rantai 2026-11-22, jadi tidak ada lagi kaki
//      yang bisa menjawab media di mode chat.
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'ok', river: 'ok', atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'chat', ...IMG });
  check('B4-9 chat+gambar: KINI dijaga (Gemini dicabut)', () => expectGuard(r, 'chat', ['gambar']));
  check('B4-9 chat+gambar: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-10. advanced + gambar KINI DIJAGA (alasan sama seperti B4-9).
setKeys({ atmo: true });
setBehavior({ atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'advanced', ...IMG });
  check('B4-10 advanced+gambar: KINI dijaga (Gemini dicabut)', () => expectGuard(r, 'advanced', ['gambar']));
  check('B4-10 advanced+gambar: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
}

// --- B4-10b. docai + gambar -> guard (mode baru 2026-11-22, text-only
//      seperti chat).
setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'ok', river: 'ok', atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'lihat gambar', mode: 'docai', ...IMG });
  check('B4-10b docai+gambar: guard (mode text-only)', () => expectGuard(r, 'docai', ['gambar']));
  check('B4-10b docai+gambar: 0 panggilan provider (fail fast)', () => assert.equal(fetchCalls, 0));
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

// --- B4-12. vision + gambar TIDAK dijaga (mode vision memang untuk media):
//      River vision menjawab sebagai kaki pertama (dulu Gemini native).
setKeys({ river: true, atmo: true, zyrouter: true });
setBehavior({ river: 'ok', atmo: 'ok' });
{
  const r = await executeAI({ message: 'lihat gambar', mode: 'vision', ...IMG });
  check('B4-12 vision+gambar: TIDAK dijaga, River vision menjawab', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'river-vision');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4.1-Flash');
  });
  check('B4-12 vision+gambar: hanya 1 attempt (kaki pertama)', () => assert.deepEqual(seq(r), [RIVER_VISION]));
}

// --- B4-12b. vision + PDF -> gagal-cepat dengan pesan spesifik (BUKAN
//      guard media teks — hanya Gemini native yang membaca PDF dan
//      kakinya dicabut 2026-11-22), 0 attempt, 0 panggilan provider.
setKeys({ river: true, atmo: true, zyrouter: true });
setBehavior({ river: 'ok', atmo: 'ok' });
{
  fetchCalls = 0;
  const r = await executeAI({ message: 'baca pdf', mode: 'vision', ...PDF });
  check('B4-12b vision+PDF: pesan spesifik, 0 attempt, 0 panggilan', () => {
    assert.equal(r.ok, false);
    assert.ok(typeof r.error === 'string' && r.error.includes('PDF'), r.error);
    assert.notEqual(r.error, 'No AI provider keys configured');
    assert.deepEqual(r.attempts, []);
    assert.equal(fetchCalls, 0);
  });
}

// --- B4-13/14/15. handleAiRequest: guard dipetakan ke HTTP 400 (bukan 502
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
// Salinan lokal productIdToMode (api/ai/tools/execute.js) — DOKUMEN_AI
// kini -> 'docai' (2026-11-22), bukan 'advanced'.
const productIdToMode = (pid, requestedMode) => {
  if (pid === 'DED_AI_DETAIL') return 'ded';
  if (pid === 'DOKUMEN_AI') return 'docai';
  if (pid === 'EZRAB_AI') return requestedMode === 'advanced' ? 'advanced' : 'chat';
  return 'fast';
};
const registeredUser = { id: 'user-registered-b4', email: 'user@example.id', isAnonymous: false };
const verifierFor = (user) => async (token) =>
  token ? { ok: true, user } : { ok: false, reason: 'missing_token' };
const ORIGIN = { origin: 'https://ezrab-site.vercel.app', authorization: 'Bearer dummy-jwt-token' };

setKeys({ crown: true, river: true, atmo: true });
setBehavior({ crown: 'ok', river: 'ok', atmo: 'ok' });
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
{
  fetchCalls = 0;
  const res = mockRes();
  await handleAiRequest(
    mockReq({ headers: ORIGIN, body: { message: 'lihat gambar', productId: 'DOKUMEN_AI', ...IMG } }),
    res,
    { productIdToMode, jwtVerifier: verifierFor(registeredUser) }
  );
  check('B4-15 HTTP docai+gambar: status 400', () => assert.equal(res.statusCode, 400));
  check('B4-15 HTTP docai+gambar: errorCode MEDIA_NOT_SUPPORTED_FOR_MODE', () => assert.equal(res.body.errorCode, 'MEDIA_NOT_SUPPORTED_FOR_MODE'));
  check('B4-15 HTTP docai+gambar: pesan menyebut docai', () => assert.ok(res.body.error.includes("'docai'"), res.body.error));
  check('B4-15 HTTP docai+gambar: 0 panggilan provider', () => assert.equal(fetchCalls, 0));
}

console.log(`\ngatewayMediaGuard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
