/**
 * gatewayChainOrder.mjs — urutan rantai provider per mode di executeAI.
 * Fetch di-stub per host; tidak ada panggilan jaringan nyata, tidak ada key asli.
 * Urutan target (user 2026-10-25: Crown = provider UTAMA untuk teks;
 * user 2026-11-13: WeizeRouter menjadi kaki PERTAMA chat+advanced,
 * ArxPay deepseek-v4.1-flash kaki KEDUA; owner 2026-11-19 05:55: Crown
 * kembali menjadi PRIORITAS No.1 mode 'chat' dengan 3 model GLM-5.3-Flash
 * -> DeepSeek V4 Flash -> MiniMax M2.7, fallback ke rantai lain bila
 * timeout — 'advanced' TIDAK BERUBAH, tetap MiniMax-dulu 2 model):
 *  - chat     : Crown GLM-5.3-Flash -> Crown DeepSeek V4 Flash
 *               -> Crown MiniMax M2.7 -> WeizeRouter weizerouter-v2
 *               -> WeizeRouter kimi-k2.7 -> WeizeRouter kimi-k2.6
 *               -> ArxPay deepseek-v4.1-flash -> Gemini native
 *               -> Atmo ag/gemini-3.8-flash-high -> Atmo cx/gpt-6-luna
 *               -> ZyRouter -> ekor cadangan terakhir
 *               (Dahl -> River vision -> River teks -> Gemini-OAI -> Atria 1 key)
 *  - advanced : WeizeRouter gpt-6-luna -> WeizeRouter muse-spark-1.3-contributor
 *               -> ArxPay deepseek-v4.1-flash -> Crown MiniMax M2.7
 *               -> Crown DeepSeek V4 Flash -> Gemini native
 *               -> Atmo ag/gemini-3.8-flash-high -> Atmo cx/gpt-6-luna -> ZyRouter
 *  - ded      : WeizeRouter PERTAMA (keputusan owner 2026-11-19 02:09,
 *               MENGGANTIKAN rantai advanced + F3-1a) + fallback Crown
 *               (keputusan owner 2026-11-20 10:56, sesudah DED gagal live
 *               karena WeizeRouter 401 — rantai WeizeRouter-only mati
 *               total oleh satu key 401) + ArxPay TERAKHIR (keputusan
 *               owner 2026-11-20 16:54, sesudah WeizeRouter 401 + Crown
 *               403 live 16:28):
 *               WeizeRouter wz/gpt-6-luna -> weizerouter-v1
 *               -> wz/gemini-3.8-flash-high -> wz/grok-4.7
 *               -> wz/deepseek-v4-pro -> Crown GLM-5.3-Flash
 *               -> Crown DeepSeek V4 Flash -> Crown MiniMax M2.7
 *               -> ArxPay deepseek-v4.1-flash.
 *               Tanpa Gemini/Atmo/ZyRouter. DED_AI_DETAIL
 *               dipetakan ke 'ded' di api/ai/tools/execute.js. ID model
 *               baru adalah asumsi konvensi (prefix wz/) — butuh
 *               verifikasi live.
 *  - fast     : WeizeRouter PERTAMA (keputusan owner 2026-11-19 02:09,
 *               MENGGANTIKAN rantai multi-provider + F3-1a) + fallback
 *               Crown (keputusan owner 2026-11-20 10:56, sama seperti
 *               'ded') + ArxPay TERAKHIR (keputusan owner 2026-11-20
 *               16:54, sama seperti 'ded'):
 *               WeizeRouter weizerouter-v2 -> wz/gpt-6-luna
 *               -> wz/qwen3.8-flash -> wz/deepseek-v4-flash-0731
 *               -> weizerouter-v1 -> wz/gemini-3.8-flash
 *               -> Crown GLM-5.3-Flash -> Crown DeepSeek V4 Flash
 *               -> Crown MiniMax M2.7 -> ArxPay deepseek-v4.1-flash.
 *               Tanpa Gemini/River/Atmo/ZyRouter/ekor.
 *               Mode tak dikenal (termasuk 'quick' aiProviderRouter)
 *               juga memakai rantai ini (cabang else).
 *  - vision   : TIDAK BERUBAH (Crown, ArxPay, dan WeizeRouter tidak support image_url):
 *               Gemini native -> River vision -> Atmo ag/gemini-3.8-flash-high
 *               -> ZyRouter
 *  - tanpa key WeizeRouter/ArxPay: rantai chat tetap Crown-dulu (3 model
 *    Crown -> Gemini -> Atmo -> ZyRouter -> ekor) — fail-closed,
 *    dibuktikan skenario 8. Rantai 'fast'/'ded' TANPA key WeizeRouter
 *    kini hanya berisi 3 kaki fallback Crown (bila key Crown ada) —
 *    dibuktikan skenario 8; tanpa key Crown juga, rantai kosong
 *    (0 attempt, 'No AI provider keys configured'). Re-baseline
 *    2026-11-20 (fallback Crown): sebelumnya rantai fast/ded tanpa key
 *    WeizeRouter tidak punya kaki sama sekali.
 *  - batas percobaan per provider: tiap model berbeda 1 kesempatan, minimal 2
 *    (WeizeRouter chat 3 model → batas 3; Crown chat 3 model → batas 3;
 *    kalau tidak, model ketiganya tidak pernah jalan — dibuktikan
 *    skenario 1c/2/3 yang memuat ketiga model WeizeRouter dan ketiga
 *    model Crown).
 *    Cap dihitung per MODEL yang sudah dicoba (2026-11-19): dengan 2 key,
 *    keenam model fast tetap dicoba (skenario 6b) dan kelima model ded tetap
 *    dicoba (skenario 4c) — tanpa ini 3 model fast terakhir kelaparan.
 *    Crown chat 2 key (skenario 3b): ketiga model Crown tetap dicoba.
 */
import assert from 'node:assert';

process.env.GEMINI_API_KEY_1 = 'dummy-gemini';
process.env.RIVER_API_KEY_1 = 'dummy-river';
process.env.DAHL_API_KEY_1 = 'dummy-dahl';
process.env.ATRIA_API_KEY_1 = 'dummy-atria';
process.env.GEMINI_OAI_KEY_1 = 'dummy-gok';
process.env.ZYROUTER_API_KEY = 'dummy-zyrouter';
process.env.ATMO_API_KEY = 'dummy-atmo';
process.env.CROWN_API_KEY = 'dummy-crown';
process.env.ARXPAY_API_KEY = 'dummy-arxpay';
process.env.WEIZEROUTER_API_KEY = 'dummy-weize';

// behavior per host key: 'ok' | 'fail' (diubah per skenario)
const behavior = {};
const HOSTS = ['gemini', 'river', 'dahl', 'atria', 'geminiOai', 'zyrouter', 'atmo', 'crown', 'arxpay', 'weizerouter'];
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
  if (url.includes('arxpay.my.id')) return 'arxpay';
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

// --- 1. Chat: Crown GLM menjawab sebagai kaki PERTAMA (owner 2026-11-19
//      05:55) — tidak sampai ke WeizeRouter/ArxPay/Gemini/Atmo
setAll('fail'); behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat crown-first: ok via crown', () => assert.equal(r.ok, true));
  check('chat crown-first: provider crown model zai-org/GLM-5.3-Flash', () => {
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'zai-org/GLM-5.3-Flash');
  });
  check('chat crown-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
  ]));
}

// --- 1b. Chat: ketiga model Crown gagal, WeizeRouter menyelamatkan
//      (ketiga model Crown TERCATAT dalam urutan owner — bukti batas
//      percobaan 3 bekerja dan tidak ada model Crown yang kelaparan)
setAll('fail'); behavior.weizerouter = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat crown-fail weize-menjawab: ok via weizerouter', () => assert.equal(r.ok, true));
  check('chat crown-fail weize-menjawab: provider weizerouter model weizerouter-v2', () => {
    assert.equal(r.provider, 'weizerouter');
    assert.equal(r.model, 'weizerouter-v2');
  });
  check('chat crown-fail weize-menjawab: urutan attempts', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'weizerouter:weizerouter-v2',
  ]));
}

// --- 1c. Chat: Crown + WeizeRouter gagal, ArxPay menjawab sebagai kaki keempat
setAll('fail'); behavior.arxpay = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat arxpay-fourth: ok via arxpay', () => assert.equal(r.ok, true));
  check('chat arxpay-fourth: provider arxpay model deepseek-v4.1-flash', () => {
    assert.equal(r.provider, 'arxpay');
    assert.equal(r.model, 'deepseek-v4.1-flash');
  });
  check('chat arxpay-fourth: urutan attempts', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'weizerouter:weizerouter-v2',
    'weizerouter:kimi-k2.7',
    'weizerouter:kimi-k2.6',
    'arxpay:deepseek-v4.1-flash',
  ]));
}

// --- 2. Chat: fallback bekerja — Crown + WeizeRouter + ArxPay + Gemini gagal, AtmoRouter ag menyelamatkan
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat fallback: ok via atmorouter', () => assert.equal(r.ok, true));
  check('chat fallback: provider atmorouter model ag/gemini-3.8-flash-high', () => {
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'ag/gemini-3.8-flash-high');
  });
  check('chat fallback: urutan attempts sebelum sukses', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'weizerouter:weizerouter-v2',
    'weizerouter:kimi-k2.7',
    'weizerouter:kimi-k2.6',
    'arxpay:deepseek-v4.1-flash',
    'gemini:gemini-3.5-flash-lite',
    'atmorouter:ag/gemini-3.8-flash-high',
  ]));
}

// --- 3. Chat: semua gagal -> seluruh rantai (termasuk ekor) tercatat
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat all-fail: ok=false', () => assert.equal(r.ok, false));
  check('chat all-fail: urutan rantai penuh', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'weizerouter:weizerouter-v2',
    'weizerouter:kimi-k2.7',
    'weizerouter:kimi-k2.6',
    'arxpay:deepseek-v4.1-flash',
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

// --- 3b. Chat, 2 key Crown: cap model-aware — ketiga model Crown tetap
//      dicoba (model 1 mendapat rotasi key, model 2-3 satu kesempatan;
//      tanpa perbaikan cap, model ke-3 tidak pernah dicoba).
setAll('fail');
process.env.CROWN_API_KEY_1 = 'dummy-crown-1';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat crown 2-key: ketiga model Crown dicoba (cap model-aware)', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'weizerouter:weizerouter-v2',
    'weizerouter:kimi-k2.7',
    'weizerouter:kimi-k2.6',
    'arxpay:deepseek-v4.1-flash',
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
delete process.env.CROWN_API_KEY_1;

// --- 4. Advanced (baru): WeizeRouter gpt-6-luna -> WeizeRouter muse-spark -> ArxPay -> Crown -> Gemini -> Atmo ag -> Atmo cx -> ZyRouter
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced: urutan baru', () => assert.deepEqual(seq(r), [
    'weizerouter:gpt-6-luna',
    'weizerouter:muse-spark-1.3-contributor',
    'arxpay:deepseek-v4.1-flash',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'gemini:gemini-3.5-flash-lite',
    'atmorouter:ag/gemini-3.8-flash-high',
    'atmorouter:cx/gpt-6-luna',
    'zyrouter:geminiflash-3.8',
  ]));
}

// --- 4b. DED (WeizeRouter-dulu + fallback Crown + ArxPay TERAKHIR;
//      WeizeRouter-only owner 2026-11-19 02:09, fallback Crown owner
//      2026-11-20 10:56, ArxPay TERAKHIR owner 2026-11-20 16:54): 5 model
//      WeizeRouter lalu 3 model Crown lalu 1 ArxPay, tanpa Gemini/Atmo/
//      ZyRouter. Re-baseline 2026-11-20 (ArxPay): sebelumnya 8 kaki
//      (5 WeizeRouter + 3 Crown); kini 9 kaki.
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded: urutan baru WeizeRouter-dulu + Crown + ArxPay', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'arxpay:deepseek-v4.1-flash',
  ]));
}

// --- 4c. DED, 2 key WeizeRouter: cap model-aware — kelima model tetap
//      dicoba (model 1-2 mendapat rotasi key, model 3-5 satu kesempatan;
//      tanpa perbaikan cap, model 4-5 tidak pernah dicoba). Lalu 3 kaki
//      fallback Crown (1 key, cap model-aware 3) lalu 1 kaki ArxPay
//      TERAKHIR (1 key, 1 model). Re-baseline 2026-11-20 (ArxPay).
setAll('fail');
process.env.WEIZEROUTER_API_KEY_1 = 'dummy-weize-1';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded 2-key: kelima model dicoba', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'arxpay:deepseek-v4.1-flash',
  ]));
}
delete process.env.WEIZEROUTER_API_KEY_1;

// --- 5. Advanced fallback bekerja: WeizeRouter + ArxPay + Crown + Gemini gagal, Atmo ag menjawab
setAll('fail'); behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced fallback: ok via atmorouter ag', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'ag/gemini-3.8-flash-high');
  });
}

// --- 5b. Advanced: WeizeRouter gagal, ArxPay menjawab sebagai kaki kedua
setAll('fail'); behavior.arxpay = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'advanced' });
  check('advanced arxpay-second: ok via arxpay', () => assert.equal(r.ok, true));
  check('advanced arxpay-second: provider arxpay model deepseek-v4.1-flash', () => {
    assert.equal(r.provider, 'arxpay');
    assert.equal(r.model, 'deepseek-v4.1-flash');
  });
  check('advanced arxpay-second: urutan attempts', () => assert.deepEqual(seq(r), [
    'weizerouter:gpt-6-luna',
    'weizerouter:muse-spark-1.3-contributor',
    'arxpay:deepseek-v4.1-flash',
  ]));
}

// --- 5c. DED: WeizeRouter menjawab sebagai kaki pertama dengan wz/gpt-6-luna
setAll('fail'); behavior.weizerouter = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded weize-first: ok via weizerouter', () => assert.equal(r.ok, true));
  check('ded weize-first: provider weizerouter model wz/gpt-6-luna', () => {
    assert.equal(r.provider, 'weizerouter');
    assert.equal(r.model, 'wz/gpt-6-luna');
  });
  check('ded weize-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
  ]));
}

// --- 6. Fast (WeizeRouter-dulu + fallback Crown + ArxPay TERAKHIR;
//      WeizeRouter-only owner 2026-11-19 02:09, fallback Crown owner
//      2026-11-20 10:56, ArxPay TERAKHIR owner 2026-11-20 16:54): 6 model
//      WeizeRouter lalu 3 model Crown lalu 1 ArxPay, tanpa Gemini/River/
//      Atmo/ZyRouter/ekor. F3-1a (ArxPay kaki KEDUA fast) DIGANTIKAN
//      keputusan 2026-11-19 — ArxPay kini kaki TERAKHIR, bukan kedua.
//      Re-baseline 2026-11-20 (ArxPay): sebelumnya 9 kaki (6 WeizeRouter
//      + 3 Crown); kini 10 kaki.
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast: urutan baru WeizeRouter-dulu + Crown + ArxPay', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/deepseek-v4-flash-0731',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash',
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'arxpay:deepseek-v4.1-flash',
  ]));
}

// --- 6b. Fast, 2 key WeizeRouter: cap model-aware — keenam model tetap
//      dicoba (model 1-3 mendapat rotasi key, model 4-6 satu kesempatan;
//      tanpa perbaikan cap, 3 model terakhir tidak pernah dicoba). Lalu
//      3 kaki fallback Crown (1 key, cap model-aware 3) lalu 1 kaki
//      ArxPay TERAKHIR (1 key, 1 model). Re-baseline 2026-11-20 (ArxPay).
setAll('fail');
process.env.WEIZEROUTER_API_KEY_1 = 'dummy-weize-1';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast 2-key: keenam model dicoba', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:weizerouter-v2',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/deepseek-v4-flash-0731',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash',
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'arxpay:deepseek-v4.1-flash',
  ]));
}
delete process.env.WEIZEROUTER_API_KEY_1;

// --- 6c. Fast: WeizeRouter menjawab sebagai kaki pertama dengan weizerouter-v2
setAll('fail'); behavior.weizerouter = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast weize-first: ok via weizerouter', () => assert.equal(r.ok, true));
  check('fast weize-first: provider weizerouter model weizerouter-v2', () => {
    assert.equal(r.provider, 'weizerouter');
    assert.equal(r.model, 'weizerouter-v2');
  });
  check('fast weize-first: hanya 1 attempt', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
  ]));
}

// --- 6d. Mode tak dikenal 'quick' (aiProviderRouter) memakai cabang else
//      = rantai fast yang sama (WeizeRouter-dulu + fallback Crown +
//      ArxPay TERAKHIR). Re-baseline 2026-11-20 (ArxPay): sebelumnya
//      9 kaki; kini 10 kaki.
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'quick' });
  check("quick: rantai fast WeizeRouter-dulu + Crown + ArxPay", () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/deepseek-v4-flash-0731',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash',
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
    'arxpay:deepseek-v4.1-flash',
  ]));
}

// --- 7. Vision (TIDAK BERUBAH): Crown, ArxPay, dan WeizeRouter tidak boleh muncul di rantai vision
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
  check('vision: tanpa crown', () => assert.equal(seq(r).some((s) => s.startsWith('crown:')), false));
  check('vision: tanpa arxpay', () => assert.equal(seq(r).some((s) => s.startsWith('arxpay:')), false));
  check('vision: tanpa weizerouter', () => assert.equal(seq(r).some((s) => s.startsWith('weizerouter:')), false));
}

// --- 8. Tanpa key WeizeRouter/ArxPay: rantai chat tetap Crown-dulu (3 model
//      Crown urutan owner -> Gemini -> Atmo -> ZyRouter -> ekor).
//      Rantai fast/ded kini berisi 3 kaki fallback Crown (re-baseline
//      2026-11-20); tanpa key Crown juga, keduanya KOSONG (fail-closed).
//      Skenario terakhir — key tidak dipulihkan sesudah ini.
delete process.env.ARXPAY_API_KEY;
delete process.env.WEIZEROUTER_API_KEY;
setAll('fail');
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('chat tanpa-key-weize/arxpay: Crown-dulu 3 model', () => assert.deepEqual(seq(r), [
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
    'crown:MiniMaxAI/MiniMax-M2.7',
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
  const rf = await executeAI({ message: 'halo', mode: 'fast' });
  // Re-baseline 2026-11-20 (fallback Crown): tanpa key WeizeRouter,
  // rantai fast kini berisi 3 kaki fallback Crown (key Crown ada) —
  // sebelumnya rantai KOSONG. Error bukan lagi 'No AI provider keys
  // configured' melainkan agregat kegagalan ketiga kaki Crown.
  check('fast tanpa-key-weize: hanya 3 kaki fallback Crown', () => {
    assert.equal(rf.ok, false);
    assert.deepEqual(seq(rf), [
      'crown:zai-org/GLM-5.3-Flash',
      'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
      'crown:MiniMaxAI/MiniMax-M2.7',
    ]);
    assert.ok(typeof rf.error === 'string' && rf.error.length > 0);
    assert.notEqual(rf.error, 'No AI provider keys configured');
  });
  const rd = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded tanpa-key-weize: hanya 3 kaki fallback Crown', () => {
    assert.equal(rd.ok, false);
    assert.deepEqual(seq(rd), [
      'crown:zai-org/GLM-5.3-Flash',
      'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
      'crown:MiniMaxAI/MiniMax-M2.7',
    ]);
    assert.ok(typeof rd.error === 'string' && rd.error.length > 0);
    assert.notEqual(rd.error, 'No AI provider keys configured');
  });
  // Tanpa key WeizeRouter DAN tanpa key Crown: rantai fast/ded KOSONG
  // (fail-closed dipertahankan — pin lama skenario 8, kini dengan
  // kedua key dihapus). Skenario terakhir — key tidak dipulihkan.
  delete process.env.CROWN_API_KEY;
  const rf2 = await executeAI({ message: 'halo', mode: 'fast' });
  check('fast tanpa-key-weize+crown: rantai KOSONG (fail-closed)', () => {
    assert.equal(rf2.ok, false);
    assert.deepEqual(seq(rf2), []);
    assert.equal(rf2.error, 'No AI provider keys configured');
  });
  const rd2 = await executeAI({ message: 'halo', mode: 'ded' });
  check('ded tanpa-key-weize+crown: rantai KOSONG (fail-closed)', () => {
    assert.equal(rd2.ok, false);
    assert.deepEqual(seq(rd2), []);
    assert.equal(rd2.error, 'No AI provider keys configured');
  });
}

console.log(`\ngatewayChainOrder: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
