/**
 * gatewayChainOrder.mjs — urutan rantai provider per mode di executeAI.
 * Fetch di-stub per host; tidak ada panggilan jaringan nyata, tidak ada key asli.
 * Urutan target:
 *  - chat     : Gemini native -> Atmo ag/gemini-3.8-flash-high -> Atmo
 *               cx/gpt-6-luna -> ZyRouter -> ekor cadangan terakhir
 *               (Dahl -> River vision -> River teks -> Gemini-OAI -> Atria 1 key)
 *               [urutan owner terbaru; sebelumnya River/Dahl dulu & Gemini
 *               absen — chat mati saat ZyRouter membalas SSE + Atria 429]
 *  - advanced : Gemini native -> Atmo ag/gemini-3.8-flash-high
 *               -> Atmo cx/gpt-6-luna -> ZyRouter
 *  - fast     : Gemini native -> River vision (DeepSeek V4.1)
 *               -> Atmo atmo/deepseek-v4.1-flash -> Atmo ali/deepseek-v4.1-flash
 *  - vision   : Gemini native -> River vision -> Atmo ag/gemini-3.8-flash-high
 *               -> ZyRouter
 */
import assert from 'node:assert';

process.env.GEMINI_API_KEY_1 = 'dummy-gemini';
process.env.RIVER_API_KEY_1 = 'dummy-river';
process.env.DAHL_API_KEY_1 = 'dummy-dahl';
process.env.ATRIA_API_KEY_1 = 'dummy-atria';
process.env.GEMINI_OAI_KEY_1 = 'dummy-gok';
process.env.ZYROUTER_API_KEY = 'dummy-zyrouter';
process.env.ATMO_API_KEY = 'dummy-atmo';

// behavior per host key: 'ok' | 'fail' (diubah per skenario)
const behavior = {};
const HOSTS = ['gemini', 'river', 'dahl', 'atria', 'geminiOai', 'zyrouter', 'atmo'];
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

// --- 1. Chat: fallback bekerja — Gemini gagal, AtmoRouter ag menyelamatkan
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat fallback: ok via atmorouter', () => assert.equal(r.ok, true));
  check('chat fallback: provider atmorouter model ag/gemini-3.8-flash-high', () => {
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'ag/gemini-3.8-flash-high');
  });
  check('chat fallback: urutan attempts sebelum sukses', () => assert.deepEqual(seq(r), [
    'gemini:gemini-3.5-flash-lite',
    'atmorouter:ag/gemini-3.8-flash-high',
  ]));
}

// --- 2. Chat: semua gagal -> seluruh rantai (termasuk ekor) tercatat
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat all-fail: ok=false', () => assert.equal(r.ok, false));
  check('chat all-fail: urutan rantai penuh', () => assert.deepEqual(seq(r), [
    'gemini:gemini-3.5-flash-lite',
    'atmorouter:ag/gemini-3.8-flash-high',
    'atmorouter:cx/gpt-6-luna',
    'zyrouter:geminiflash-3.8',
    'dahl:deepseek-ai/DeepSeek-V4-Flash-0731',
    'river-vision:deepseek-ai/DeepSeek-V4.1-Flash',
    'river-text:nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4',
    'gemini-oai:gemini-3.8-flash',
    'atria:Atria-Dawn-Preview',
  ]));
}

// --- 3. Advanced (baru): Gemini -> Atmo ag -> Atmo cx -> ZyRouter
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced: urutan baru', () => assert.deepEqual(seq(r), [
    'gemini:gemini-3.5-flash-lite',
    'atmorouter:ag/gemini-3.8-flash-high',
    'atmorouter:cx/gpt-6-luna',
    'zyrouter:geminiflash-3.8',
  ]));
}

// --- 4. Advanced fallback bekerja: Gemini gagal, Atmo ag menjawab
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced fallback: ok via atmorouter ag', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'ag/gemini-3.8-flash-high');
  });
}

// --- 5. Fast (baru): Gemini -> River vision -> Atmo atmo -> Atmo ali
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast: urutan baru', () => assert.deepEqual(seq(r), [
    'gemini:gemini-3.5-flash-lite',
    'river-vision:deepseek-ai/DeepSeek-V4.1-Flash',
    'atmorouter:atmo/deepseek-v4.1-flash',
    'atmorouter:ali/deepseek-v4.1-flash',
  ]));
}

// --- 6. Vision (baru): Gemini -> River vision -> Atmo ag -> ZyRouter
setAll('fail');
{
  const r = await executeAI({
    message: 'lihat gambar', mode: 'vision',
    imageDataBase64: 'AAAA', imageMimeType: 'image/png',
  });
  check('vision: urutan baru', () => assert.deepEqual(seq(r), [
    'gemini:gemini-3.5-flash-lite',
    'river-vision:deepseek-ai/DeepSeek-V4.1-Flash',
    'atmorouter:ag/gemini-3.8-flash-high',
    'zyrouter:geminiflash-3.8',
  ]));
}

console.log(`\ngatewayChainOrder: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
