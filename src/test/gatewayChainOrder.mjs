/**
 * gatewayChainOrder.mjs — urutan rantai provider per mode di executeAI.
 * Fetch di-stub per host; tidak ada panggilan jaringan nyata, tidak ada key asli.
 *
 * SPESIFIKASI FINAL owner 2026-11-22 01:37 (MENGGANTIKAN semua urutan
 * sebelumnya — termasuk urutan V4.1-dulu 2026-11-22 01:21 dan urutan
 * GLM-dulu 2026-11-19 05:55). Rantai = PERSIS kaki yang terdaftar:
 *  - chat     : Crown deepseek-ai/DeepSeek-V4-Flash-0731
 *               -> River deepseek-ai/DeepSeek-V4.1-Flash-1017
 *               -> Atmo mm/MiniMax-M3.1-Flash
 *               -> Atmo zai/glm-5.3-flash
 *  - advanced : Atmo cx/gpt-6-luna
 *               -> Atmo ag/gemini-3.8-flash-high
 *               -> Atmo mv/mistral-medium-3-5
 *  - fast     : Crown deepseek-ai/DeepSeek-V4-Flash-0731
 *               -> River nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4
 *               -> River deepseek-ai/DeepSeek-V4.1-Flash-1017
 *               -> Atmo cx/gpt-6-luna
 *               Mode tak dikenal (termasuk 'quick' aiProviderRouter)
 *               juga memakai rantai ini (cabang else).
 *  - ded      : Atmo cx/gpt-6-luna
 *               -> Atmo ag/gemini-3.8-flash-high
 *  - docai    : SAMA dengan 'chat' (mode BARU — DOKUMEN_AI dipisah dari
 *               'advanced' 2026-11-22; pemetaan di api/ai/tools/execute.js)
 *  - vision   : River deepseek-ai/DeepSeek-V4.1-Flash
 *               -> Atmo ag/gemini-3.8-flash-high -> ZyRouter
 *               (kaki Gemini native DICABUT 2026-11-22 — satu-satunya
 *               perubahan vision; PDF TIDAK LAGI didukung, fail-fast
 *               dengan pesan spesifik, 0 attempt)
 *
 * KELUAR dari semua rantai teks: WeizeRouter + Gemini native (dicabut
 * 2026-11-22 atas perintah owner) + ekor ZyRouter/Dahl/Atria/gemini-oai
 * (ZyRouter hanya tersisa di vision) + ArxPay (sudah keluar 01:21).
 * Key legacy (GEMINI/WEIZEROUTER/DAHL/ATRIA/GEMINI_OAI) SENGAJA tetap
 * di-set di harness ini — membuktikan key itu TIDAK LAGI menghasilkan
 * kaki rantai mana pun.
 *
 * Batas percobaan per provider (cap model-aware, 2026-11-19): tiap model
 * berbeda 1 kesempatan, minimal 2 (cap = max(2, jumlah model berbeda
 * provider itu dalam attempts)). Skenario 2b/2c/3b/4b/5d mem-pin
 * perilaku cap di rantai baru.
 */
import assert from 'node:assert';

// Key legacy SENGAJA tetap di-set (lihat komentar header): membuktikan
// provider yang dicabut tidak lagi menghasilkan kaki, walau key ada.
process.env.GEMINI_API_KEY_1 = 'dummy-gemini';
process.env.DAHL_API_KEY_1 = 'dummy-dahl';
process.env.ATRIA_API_KEY_1 = 'dummy-atria';
process.env.GEMINI_OAI_KEY_1 = 'dummy-gok';
process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
process.env.ZYROUTER_API_KEY = 'dummy-zyrouter';
process.env.RIVER_API_KEY_1 = 'dummy-river';
process.env.ATMO_API_KEY = 'dummy-atmo';
process.env.CROWN_API_KEY = 'dummy-crown';

// behavior per host key: 'ok' | 'fail' (diubah per skenario)
const behavior = {};
const HOSTS = ['gemini', 'river', 'dahl', 'atria', 'geminiOai', 'zyrouter', 'atmo', 'crown', 'weizerouter'];
function setAll(v) { for (const h of HOSTS) behavior[h] = v; }
setAll('fail');

function hostOf(url) {
  if (url.includes('generativelanguage.googleapis.com/v1beta/openai')) return 'geminiOai';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (url.includes('api.river.ai')) return 'river';
  if (url.includes('inference.dahl.global')) return 'dahl';
  if (url.includes('api.atria-asi.ai')) return 'atria';
  if (url.includes('api.zyrouter.com')) return 'zyrouter';
  if (url.includes('atmorouter.dev')) return 'atmo';
  if (url.includes('crown.ai.id')) return 'crown';
  if (url.includes('weizerouter.web.id')) return 'weizerouter';
  return 'unknown';
}

global.fetch = async (url) => {
  const host = hostOf(String(url));
  if (behavior[host] !== 'ok') {
    return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
  }
  if (host === 'gemini') {
    const payload = { candidates: [{ content: { parts: [{ text: 'OK-GEMINI' }] } }], usageMetadata: {} };
    return {
      ok: true, status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  }
  const payload = { choices: [{ message: { content: 'OK-' + host.toUpperCase() } }], usage: {} };
  return {
    ok: true, status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
};

const { executeAI } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}
const seq = (r) => r.attempts.map((a) => `${a.provider}:${a.model}`);

// Label kaki spesifikasi final (dipakai bersama skenario).
const CROWN_V4 = 'crown:deepseek-ai/DeepSeek-V4-Flash-0731';
const RIVER_1017 = 'river-flash:deepseek-ai/DeepSeek-V4.1-Flash-1017';
const RIVER_NEMOTRON = 'river-text:nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4';
const RIVER_VISION = 'river-vision:deepseek-ai/DeepSeek-V4.1-Flash';
const ATMO_MM = 'atmorouter:mm/MiniMax-M3.1-Flash';
const ATMO_ZAI = 'atmorouter:zai/glm-5.3-flash';
const ATMO_CX = 'atmorouter:cx/gpt-6-luna';
const ATMO_AG = 'atmorouter:ag/gemini-3.8-flash-high';
const ATMO_MV = 'atmorouter:mv/mistral-medium-3-5';
const ZYROUTER = 'zyrouter:geminiflash-3.8';
const CHAT_SEQ = [CROWN_V4, RIVER_1017, ATMO_MM, ATMO_ZAI];
const FAST_SEQ = [CROWN_V4, RIVER_NEMOTRON, RIVER_1017, ATMO_CX];

// --- 1. Chat: Crown V4-0731 menjawab sebagai kaki PERTAMA — tidak sampai
//      ke River/Atmo.
setAll('fail'); behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat crown-first: ok via crown', () => assert.equal(r.ok, true));
  check('chat crown-first: provider crown model deepseek-ai/DeepSeek-V4-Flash-0731', () => {
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4-Flash-0731');
  });
  check('chat crown-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [CROWN_V4]));
}

// --- 1b. Chat: Crown gagal, River V4.1-1017 menjawab sebagai kaki kedua.
setAll('fail'); behavior.river = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat river-second: ok via river-flash', () => assert.equal(r.ok, true));
  check('chat river-second: provider river-flash model deepseek-ai/DeepSeek-V4.1-Flash-1017', () => {
    assert.equal(r.provider, 'river-flash');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4.1-Flash-1017');
  });
  check('chat river-second: urutan attempts', () => assert.deepEqual(seq(r), [CROWN_V4, RIVER_1017]));
}

// --- 1c. Chat: Crown + River gagal, Atmo mm/MiniMax-M3.1-Flash menjawab
//      sebagai kaki ketiga (bukan ag/cx — model Atmo chat berubah total).
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat atmo-third: ok via atmorouter mm', () => assert.equal(r.ok, true));
  check('chat atmo-third: provider atmorouter model mm/MiniMax-M3.1-Flash', () => {
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'mm/MiniMax-M3.1-Flash');
  });
  check('chat atmo-third: urutan attempts', () => assert.deepEqual(seq(r), [CROWN_V4, RIVER_1017, ATMO_MM]));
}

// --- 2. Chat: semua gagal -> PERSIS 4 kaki, tanpa WeizeRouter/Gemini/ekor
//      (key legacy tetap ter-set — membuktikan mereka tidak menghasilkan kaki).
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat all-fail: ok=false', () => assert.equal(r.ok, false));
  check('chat all-fail: urutan rantai penuh (4 kaki)', () => assert.deepEqual(seq(r), CHAT_SEQ));
  check('chat all-fail: tanpa weizerouter/gemini/dahl/atria/gemini-oai', () => {
    for (const p of ['weizerouter:', 'gemini:', 'dahl:', 'atria:', 'gemini-oai:']) {
      assert.equal(seq(r).some((s) => s.startsWith(p)), false, p);
    }
  });
}

// --- 2b. Chat, 2 key Atmo: cap model-aware — mm mendapat rotasi key,
//      zai satu kesempatan (cap max(2, 2 model) = 2; zai k1 ter-skip).
setAll('fail');
process.env.ATMO_API_KEY_1 = 'dummy-atmo-1';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat atmo 2-key: mm 2x, zai 1x (cap model-aware)', () => assert.deepEqual(seq(r), [
    CROWN_V4, RIVER_1017, ATMO_MM, ATMO_MM, ATMO_ZAI,
  ]));
}
delete process.env.ATMO_API_KEY_1;

// --- 2c. Chat, 2 key Crown: 1 model, 2 key — keduanya dicoba (cap 2).
setAll('fail');
process.env.CROWN_API_KEY_1 = 'dummy-crown-1';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat crown 2-key: V4 dicoba 2x (rotasi key)', () => assert.deepEqual(seq(r), [
    CROWN_V4, CROWN_V4, RIVER_1017, ATMO_MM, ATMO_ZAI,
  ]));
}
delete process.env.CROWN_API_KEY_1;

// --- 3. Advanced: PERSIS 3 kaki Atmo (cx -> ag -> mv), tanpa provider lain.
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced all-fail: ok=false', () => assert.equal(r.ok, false));
  check('advanced all-fail: urutan rantai penuh (3 kaki Atmo)', () => assert.deepEqual(seq(r), [
    ATMO_CX, ATMO_AG, ATMO_MV,
  ]));
}

// --- 3b. Advanced, 2 key Atmo: cap model-aware — cx 2x, ag 1x, mv 1x
//      (cap max(2, 3 model) = 3; ag k1 + mv k1 ter-skip).
setAll('fail');
process.env.ATMO_API_KEY_1 = 'dummy-atmo-1';
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced atmo 2-key: cx 2x, ag 1x, mv 1x (cap model-aware)', () => assert.deepEqual(seq(r), [
    ATMO_CX, ATMO_CX, ATMO_AG, ATMO_MV,
  ]));
}
delete process.env.ATMO_API_KEY_1;

// --- 3c. Advanced: Atmo cx/gpt-6-luna menjawab sebagai kaki pertama.
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced atmo-first: ok via atmorouter cx', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'cx/gpt-6-luna');
  });
  check('advanced atmo-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [ATMO_CX]));
}

// --- 4. DED Dalam: PERSIS 2 kaki Atmo (cx -> ag).
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded all-fail: ok=false', () => assert.equal(r.ok, false));
  check('ded all-fail: urutan rantai penuh (2 kaki Atmo)', () => assert.deepEqual(seq(r), [
    ATMO_CX, ATMO_AG,
  ]));
}

// --- 4b. DED, 2 key Atmo: cap model-aware — cx 2x, ag 1x (cap 2).
setAll('fail');
process.env.ATMO_API_KEY_1 = 'dummy-atmo-1';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded atmo 2-key: cx 2x, ag 1x (cap model-aware)', () => assert.deepEqual(seq(r), [
    ATMO_CX, ATMO_CX, ATMO_AG,
  ]));
}
delete process.env.ATMO_API_KEY_1;

// --- 4c. DED: Atmo cx menjawab sebagai kaki pertama.
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded atmo-first: ok via atmorouter cx', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'cx/gpt-6-luna');
  });
  check('ded atmo-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [ATMO_CX]));
}

// --- 5. Fast (DED Cepat): PERSIS 4 kaki (Crown -> Nemotron -> 1017 -> cx).
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast all-fail: ok=false', () => assert.equal(r.ok, false));
  check('fast all-fail: urutan rantai penuh (4 kaki)', () => assert.deepEqual(seq(r), FAST_SEQ));
}

// --- 5b. Fast: Crown V4-0731 menjawab sebagai kaki pertama.
setAll('fail'); behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast crown-first: ok via crown', () => assert.equal(r.ok, true));
  check('fast crown-first: provider crown model deepseek-ai/DeepSeek-V4-Flash-0731', () => {
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4-Flash-0731');
  });
  check('fast crown-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [CROWN_V4]));
}

// --- 5c. Fast: Crown + River gagal, Atmo cx/gpt-6-luna menjawab terakhir.
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast atmo-last: ok via atmorouter cx', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'cx/gpt-6-luna');
  });
  check('fast atmo-last: urutan attempts', () => assert.deepEqual(seq(r), FAST_SEQ));
}

// --- 5d. Fast, 2 key River: label river-text dan river-flash punya cap
//      sendiri (masing-masing 1 model -> cap 2) — keduanya rotasi key.
setAll('fail');
process.env.RIVER_API_KEY_2 = 'dummy-river-2';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast river 2-key: Nemotron 2x, 1017 2x', () => assert.deepEqual(seq(r), [
    CROWN_V4,
    RIVER_NEMOTRON, RIVER_NEMOTRON,
    RIVER_1017, RIVER_1017,
    ATMO_CX,
  ]));
}
delete process.env.RIVER_API_KEY_2;

// --- 6. DocAI (mode BARU): PERSIS rantai yang sama dengan 'chat'.
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'docai' });
  check('docai all-fail: ok=false', () => assert.equal(r.ok, false));
  check('docai all-fail: urutan rantai penuh = chat (4 kaki)', () => assert.deepEqual(seq(r), CHAT_SEQ));
}

// --- 6b. DocAI: Crown V4-0731 menjawab sebagai kaki pertama.
setAll('fail'); behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'docai' });
  check('docai crown-first: ok via crown', () => assert.equal(r.ok, true));
  check('docai crown-first: provider crown model deepseek-ai/DeepSeek-V4-Flash-0731', () => {
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4-Flash-0731');
  });
  check('docai crown-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [CROWN_V4]));
}

// --- 7. Mode tak dikenal 'quick' (aiProviderRouter) memakai cabang else
//      = rantai fast (DED Cepat) yang sama.
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'quick' });
  check("quick: rantai fast (DED Cepat)", () => assert.deepEqual(seq(r), FAST_SEQ));
}

// --- 7b. Mode tak dikenal lain ('zzz') juga jatuh ke rantai fast.
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'zzz' });
  check("mode-tak-dikenal: rantai fast (DED Cepat)", () => assert.deepEqual(seq(r), FAST_SEQ));
}

// --- 8. Vision + gambar: River vision -> Atmo ag -> ZyRouter. TANPA
//      Gemini native (dicabut 2026-11-22), tanpa Crown/WeizeRouter.
setAll('fail');
{
  const r = await executeAI({
    message: 'lihat gambar', mode: 'vision',
    imageDataBase64: 'AAAA', imageMimeType: 'image/png',
  });
  check('vision: urutan baru (tanpa Gemini)', () => assert.deepEqual(seq(r), [
    RIVER_VISION,
    ATMO_AG,
    ZYROUTER,
  ]));
  check('vision: tanpa gemini', () => assert.equal(seq(r).some((s) => s.startsWith('gemini:')), false));
  check('vision: tanpa crown', () => assert.equal(seq(r).some((s) => s.startsWith('crown:')), false));
  check('vision: tanpa weizerouter', () => assert.equal(seq(r).some((s) => s.startsWith('weizerouter:')), false));
}

// --- 8b. Vision + gambar: River vision menjawab sebagai kaki pertama.
setAll('fail'); behavior.river = 'ok';
{
  const r = await executeAI({
    message: 'lihat gambar', mode: 'vision',
    imageDataBase64: 'AAAA', imageMimeType: 'image/png',
  });
  check('vision river-first: ok via river-vision', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'river-vision');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4.1-Flash');
  });
  check('vision river-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [RIVER_VISION]));
}

// --- 8c. Vision + PDF: TIDAK LAGI didukung (hanya Gemini native yang
//      membaca PDF dan kakinya dicabut 2026-11-22) — fail-fast dengan
//      pesan spesifik, 0 attempt, walau key ada.
setAll('fail');
{
  const r = await executeAI({
    message: 'baca pdf', mode: 'vision',
    pdfDataBase64: 'AAAA', pdfMimeType: 'application/pdf',
  });
  check('vision pdf: ok=false, 0 attempt', () => {
    assert.equal(r.ok, false);
    assert.deepEqual(seq(r), []);
  });
  check('vision pdf: pesan spesifik (bukan "No AI provider keys configured")', () => {
    assert.ok(typeof r.error === 'string' && r.error.includes('PDF'));
    assert.notEqual(r.error, 'No AI provider keys configured');
  });
}

// --- 9. Media guard (B4, diperluas 2026-11-22): mode teks + media
//      gagal-cepat dengan kode MEDIA_NOT_SUPPORTED_FOR_MODE, 0 attempt.
//      Dulu chat/advanced + media dijawab Gemini native; Gemini dicabut,
//      jadi guard kini berlaku untuk SEMUA mode teks.
setAll('fail');
{
  const rChat = await executeAI({
    message: 'x', mode: 'chat',
    imageDataBase64: 'AAAA', imageMimeType: 'image/png',
  });
  check('chat + gambar: media guard, 0 attempt', () => {
    assert.equal(rChat.ok, false);
    assert.equal(rChat.errorCode, 'MEDIA_NOT_SUPPORTED_FOR_MODE');
    assert.deepEqual(seq(rChat), []);
  });
  const rAdv = await executeAI({
    message: 'x', mode: 'advanced',
    imageDataBase64: 'AAAA', imageMimeType: 'image/png',
  });
  check('advanced + gambar: media guard, 0 attempt', () => {
    assert.equal(rAdv.ok, false);
    assert.equal(rAdv.errorCode, 'MEDIA_NOT_SUPPORTED_FOR_MODE');
    assert.deepEqual(seq(rAdv), []);
  });
  const rDocai = await executeAI({
    message: 'x', mode: 'docai',
    pdfDataBase64: 'AAAA', pdfMimeType: 'application/pdf',
  });
  check('docai + pdf: media guard, 0 attempt', () => {
    assert.equal(rDocai.ok, false);
    assert.equal(rDocai.errorCode, 'MEDIA_NOT_SUPPORTED_FOR_MODE');
    assert.deepEqual(seq(rDocai), []);
  });
}

// --- 10. Tanpa key Crown: rantai chat/fast kehilangan kaki pertama saja
//      (fail-closed parsial — kaki lain tetap jalan).
delete process.env.CROWN_API_KEY;
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat tanpa-key-crown: 3 kaki (River + Atmo)', () => assert.deepEqual(seq(r), [
    RIVER_1017, ATMO_MM, ATMO_ZAI,
  ]));
  const rf = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast tanpa-key-crown: 3 kaki (River + Atmo)', () => assert.deepEqual(seq(rf), [
    RIVER_NEMOTRON, RIVER_1017, ATMO_CX,
  ]));
  const rd = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded tanpa-key-crown: tetap 2 kaki (Atmo saja)', () => assert.deepEqual(seq(rd), [
    ATMO_CX, ATMO_AG,
  ]));
}

// --- 11. Tanpa SEMUA key rantai teks (Crown + River + Atmo): rantai
//      teks KOSONG (fail-closed) — key legacy Gemini/Weize/Dahl/Atria
//      yang masih ter-set TIDAK menghidupkan rantai apa pun. Vision +
//      gambar masih punya kaki ZyRouter (key ZyRouter masih ada).
//      Skenario terakhir — key tidak dipulihkan sesudah ini.
delete process.env.RIVER_API_KEY_1;
delete process.env.ATMO_API_KEY;
setAll('fail');
{
  for (const mode of ['chat', 'advanced', 'fast', 'ded', 'docai']) {
    const r = await executeAI({ message: 'halo', mode });
    check(`${mode} tanpa-semua-key: rantai KOSONG (fail-closed)`, () => {
      assert.equal(r.ok, false);
      assert.deepEqual(seq(r), []);
      assert.equal(r.error, 'No AI provider keys configured');
    });
  }
  const rv = await executeAI({
    message: 'lihat gambar', mode: 'vision',
    imageDataBase64: 'AAAA', imageMimeType: 'image/png',
  });
  check('vision tanpa-key-river/atmo: hanya kaki ZyRouter', () => assert.deepEqual(seq(rv), [
    ZYROUTER,
  ]));
}

console.log(`\ngatewayChainOrder: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
