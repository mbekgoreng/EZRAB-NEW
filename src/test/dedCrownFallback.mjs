/**
 * dedCrownFallback.mjs — kaki fallback Crown di rantai DED ('ded' + 'fast').
 *
 * Latar (2026-11-20 10:46): DED gagal live karena WeizeRouter menolak key
 * dengan HTTP 401; rantai DED saat itu WeizeRouter-only (5 model, 1 key
 * yang sama) sehingga dead-key skip (Phase 2 W4, per provider:keyIndex)
 * melewati semua kaki sesudah 401 pertama — 1 attempt, gagal total.
 * Owner menyetujui fallback Crown 2026-11-20 10:56: Crown SESUDAH semua
 * kaki WeizeRouter di kedua rantai; WeizeRouter TETAP pertama.
 *
 * Yang dibuktikan suite ini (semua mocked — fetch di-stub per host, tidak
 * ada panggilan jaringan nyata, tidak ada key asli):
 *  1. WeizeRouter 401 di kaki pertama -> rantai LANJUT ke kaki Crown dan
 *     sukses (dead-key skip per provider:keyIndex TIDAK melewati Crown).
 *  2. Kaki Crown berada SESUDAH SEMUA kaki WeizeRouter di kedua rantai.
 *  3. Sukses WeizeRouter tetap short-circuit (Crown tidak pernah dipanggil).
 *  4. Rotasi multi-model Crown bekerja sesudah WeizeRouter habis (502).
 *  5. Tanpa key WeizeRouter, rantai ded/fast hanya berisi kaki Crown.
 *
 * Model Crown = CROWN_CHAT_MODELS (urutan owner 2026-11-19 05:55):
 * zai-org/GLM-5.3-Flash -> deepseek-ai/DeepSeek-V4-Flash-0731 ->
 * MiniMaxAI/MiniMax-M2.7.
 */
import assert from 'node:assert';

// Hanya dua key yang relevan untuk rantai ded/fast; key provider lain
// dihapus supaya tidak ada kaki asing yang ikut terhitung.
for (const k of Object.keys(process.env)) {
  if (/^(GEMINI|RIVER|DAHL|ATRIA|ZYROUTER|ATMO|ARXPAY|GEMINI_OAI)_/.test(k) || k === 'ZYROUTER_API_KEY' || k === 'ATMO_API_KEY' || k === 'ARXPAY_API_KEY') {
    delete process.env[k];
  }
}
process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
process.env.CROWN_API_KEY = 'dummy-crown';

// behavior per host: 'ok' | 'fail401' | 'fail500' | 'fail502'
const behavior = { weizerouter: 'fail500', crown: 'fail500' };
// Per-model override untuk Crown (dipakai CF-7): { model: behavior }
const crownModelBehavior = {};
const hostCalls = { weizerouter: 0, crown: 0 };

function hostOf(url) {
  if (url.includes('crown.ai.id')) return 'crown';
  if (url.includes('weizerouter.web.id')) return 'weizerouter';
  return 'unknown';
}

global.fetch = async (url, init) => {
  const host = hostOf(String(url));
  hostCalls[host] = (hostCalls[host] || 0) + 1;
  let b = behavior[host];
  if (host === 'crown') {
    try {
      const body = JSON.parse(init?.body || '{}');
      if (crownModelBehavior[body.model]) b = crownModelBehavior[body.model];
    } catch { /* body bukan JSON — pakai behavior host */ }
  }
  if (b === 'ok') {
    const payload = { choices: [{ message: { content: 'OK-' + host.toUpperCase() } }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  }
  const status = b === 'fail401' ? 401 : b === 'fail502' ? 502 : 500;
  return { ok: false, status, json: async () => ({}), text: async () => `stub-${status}` };
};

const { executeAI } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}
const seq = (r) => r.attempts.map((a) => `${a.provider}:${a.model}`);
function reset() {
  behavior.weizerouter = 'fail500';
  behavior.crown = 'fail500';
  for (const k of Object.keys(crownModelBehavior)) delete crownModelBehavior[k];
  hostCalls.weizerouter = 0;
  hostCalls.crown = 0;
  process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
  process.env.CROWN_API_KEY = 'dummy-crown';
}
const CROWN_SEQ = [
  'crown:zai-org/GLM-5.3-Flash',
  'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
  'crown:MiniMaxAI/MiniMax-M2.7',
];

// --- CF-1. DED: replay insiden live 2026-11-20 10:46 — WeizeRouter 401 di
//      kaki pertama, rantai LANJUT ke Crown dan sukses.
reset();
behavior.weizerouter = 'fail401';
behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('CF-1 ded 401->Crown: ok via crown', () => assert.equal(r.ok, true));
  check('CF-1 ded 401->Crown: provider crown model GLM-5.3-Flash', () => {
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'zai-org/GLM-5.3-Flash');
  });
  check('CF-1 ded 401->Crown: tepat 2 attempt (1 weize 401 + 1 crown ok)', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'crown:zai-org/GLM-5.3-Flash',
  ]));
  check('CF-1 ded 401->Crown: attempt pertama errorClass auth status 401', () => {
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
  });
  check('CF-1 ded 401->Crown: 4 kaki WeizeRouter lain di-skip (dead-key)', () => {
    assert.equal(hostCalls.weizerouter, 1);
  });
}

// --- CF-2. Fast: pola yang sama — WeizeRouter 401, Crown menyelamatkan.
reset();
behavior.weizerouter = 'fail401';
behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('CF-2 fast 401->Crown: ok via crown', () => assert.equal(r.ok, true));
  check('CF-2 fast 401->Crown: tepat 2 attempt (1 weize 401 + 1 crown ok)', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'crown:zai-org/GLM-5.3-Flash',
  ]));
  check('CF-2 fast 401->Crown: 5 kaki WeizeRouter lain di-skip (dead-key)', () => {
    assert.equal(hostCalls.weizerouter, 1);
  });
}

// --- CF-3. DED, semua gagal: urutan LENGKAP — 5 WeizeRouter lalu 3 Crown.
reset();
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('CF-3 ded semua-gagal: Crown sesudah SEMUA kaki WeizeRouter', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
    ...CROWN_SEQ,
  ]));
  check('CF-3 ded semua-gagal: ok=false, 8 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 8);
  });
}

// --- CF-4. Fast, semua gagal: urutan LENGKAP — 6 WeizeRouter lalu 3 Crown.
reset();
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('CF-4 fast semua-gagal: Crown sesudah SEMUA kaki WeizeRouter', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:wz/qwen3.8-flash',
    'weizerouter:wz/deepseek-v4-flash-0731',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash',
    ...CROWN_SEQ,
  ]));
  check('CF-4 fast semua-gagal: ok=false, 9 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 9);
  });
}

// --- CF-5. DED: WeizeRouter sukses -> short-circuit, Crown tidak dipanggil.
reset();
behavior.weizerouter = 'ok';
behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('CF-5 ded short-circuit: ok via weizerouter kaki pertama', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'weizerouter');
    assert.equal(r.model, 'wz/gpt-6-luna');
  });
  check('CF-5 ded short-circuit: hanya 1 attempt', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
  ]));
  check('CF-5 ded short-circuit: Crown TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.crown, 0);
  });
}

// --- CF-6. Fast: WeizeRouter sukses -> short-circuit, Crown tidak dipanggil.
reset();
behavior.weizerouter = 'ok';
behavior.crown = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('CF-6 fast short-circuit: ok via weizerouter kaki pertama', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'weizerouter');
    assert.equal(r.model, 'weizerouter-v2');
  });
  check('CF-6 fast short-circuit: hanya 1 attempt', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
  ]));
  check('CF-6 fast short-circuit: Crown TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.crown, 0);
  });
}

// --- CF-7. DED: WeizeRouter 502 semua (tanpa skip — 502 bukan auth), lalu
//      Crown GLM gagal 500 dan Crown DeepSeek menjawab — rotasi multi-model
//      Crown bekerja sesudah WeizeRouter habis.
reset();
behavior.weizerouter = 'fail502';
behavior.crown = 'ok';
crownModelBehavior['zai-org/GLM-5.3-Flash'] = 'fail500';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('CF-7 ded 502->Crown-rotasi: ok via crown DeepSeek', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4-Flash-0731');
  });
  check('CF-7 ded 502->Crown-rotasi: 5 weize 502 + GLM gagal + DeepSeek ok', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'weizerouter:weizerouter-v1',
    'weizerouter:wz/gemini-3.8-flash-high',
    'weizerouter:wz/grok-4.7',
    'weizerouter:wz/deepseek-v4-pro',
    'crown:zai-org/GLM-5.3-Flash',
    'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
  ]));
  check('CF-7 ded 502->Crown-rotasi: semua kaki WeizeRouter dicoba (tanpa skip)', () => {
    assert.equal(hostCalls.weizerouter, 5);
  });
}

// --- CF-8. Tanpa key WeizeRouter (key Crown ada): rantai ded/fast hanya
//      berisi kaki Crown — dan sukses lewat Crown.
reset();
delete process.env.WEIZEROUTER_API_KEY;
behavior.crown = 'ok';
{
  const rd = await executeAI({ message: 'halo', mode: 'ded' });
  check('CF-8 ded tanpa-key-weize: ok via crown GLM kaki pertama', () => {
    assert.equal(rd.ok, true);
    assert.equal(rd.provider, 'crown');
    assert.deepEqual(seq(rd), ['crown:zai-org/GLM-5.3-Flash']);
  });
  const rf = await executeAI({ message: 'halo', mode: 'fast' });
  check('CF-8 fast tanpa-key-weize: ok via crown GLM kaki pertama', () => {
    assert.equal(rf.ok, true);
    assert.equal(rf.provider, 'crown');
    assert.deepEqual(seq(rf), ['crown:zai-org/GLM-5.3-Flash']);
  });
  check('CF-8 tanpa-key-weize: WeizeRouter TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.weizerouter, 0);
  });
}

console.log(`\ndedCrownFallback: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
