/**
 * gatewayErrorClass.mjs — klasifikasi kegagalan gateway (audit 2026-10-31, F1).
 * Fetch di-stub; tidak ada jaringan nyata, tidak ada key asli.
 * Membuktikan:
 *  S1 penolakan kebijakan (HTTP 400 bernada policy) menghentikan rantai —
 *     TIDAK difailover ke provider lain (anti filter-shopping).
 *  S2 HTTP 429 tetap failover seperti sebelumnya.
 *  S3 OAI 200 dengan konten kosong = 'empty' (BUKAN policy) — failover
 *     berlanjut. (S3 lama memakai blokir SAFETY Gemini via HTTP 200
 *     promptFeedback — kaki Gemini native dicabut 2026-11-22, spesifikasi
 *     final owner 01:37 — dan callOAI tidak mengenal content_filter
 *     sebagai policy; perilaku OAI yang jujur didokumentasikan di sini.)
 *  S4 HTTP 400 non-policy = AI_BAD_REQUEST, berhenti.
 *  S5 rotasi key tetap hidup: 401 pada key bernomor -> key polos dipakai.
 * Skenario memakai mode 'chat' (Crown V4-0731 kaki-1, River 1017 kaki-2;
 * spesifikasi final owner 2026-11-22 01:37).
 */
import assert from 'node:assert';

for (const v of [
  'GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5', 'GEMINI_API_KEY_6',
  'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
  'ATRIA_API_KEY_1', 'DAHL_API_KEY_1', 'GEMINI_OAI_KEY_1',
  'WEIZEROUTER_API_KEY', 'WEIZEROUTER_API_KEY_1',
  'RIVER_API_KEY', 'RIVER_API_KEY_1', 'RIVER_API_KEY_2',
  'ATMO_API_KEY', 'ATMO_API_KEY_1',
  'CROWN_API_KEY', 'CROWN_API_KEY_1',
]) delete process.env[v];

process.env.CROWN_API_KEY = 'dummy-crown';
process.env.RIVER_API_KEY_1 = 'dummy-river';

let fetchCalls = 0;
let crownBehavior = 'policy400';
function bearerOf(init) {
  const h = init?.headers || {};
  if (typeof h.get === 'function') return h.get('Authorization') || h.get('authorization') || '';
  return h.Authorization || h.authorization || '';
}
global.fetch = async (url, init) => {
  fetchCalls += 1;
  const u = String(url);
  if (u.includes('crown.ai.id')) {
    if (crownBehavior === 'policy400') {
      const body = JSON.stringify({ error: { message: 'Request blocked: SAFETY policy violation (content policy)' } });
      return { ok: false, status: 400, json: async () => ({}), text: async () => body };
    }
    if (crownBehavior === 'badrequest400') {
      const body = JSON.stringify({ error: { message: 'Invalid JSON payload received. Unknown name "foo".' } });
      return { ok: false, status: 400, json: async () => ({}), text: async () => body };
    }
    if (crownBehavior === 'rate429') {
      return { ok: false, status: 429, json: async () => ({}), text: async () => 'quota' };
    }
    if (crownBehavior === 'empty200') {
      const payload = { choices: [{ message: { content: '' } }], usage: {} };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
  }
  if (u.includes('api.river.ai') && crownBehavior === 'auth401-then-bare') {
    // S5: key bernomor 401, key polos menjawab.
    if (bearerOf(init) === 'Bearer dummy-bare') {
      const payload = { choices: [{ message: { content: 'OK-BARE' } }], usage: {} };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
    return { ok: false, status: 401, json: async () => ({}), text: async () => 'stub-fail' };
  }
  // Host lain (River kaki-2): sukses gaya OpenAI-compatible.
  const payload = { choices: [{ message: { content: 'OK-NEXT' } }], usage: {} };
  return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
};

const { executeAI } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}

crownBehavior = 'policy400'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('S1 policy 400: ok=false + CONTENT_REJECTED', () => {
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'CONTENT_REJECTED');
  });
  check('S1 policy 400: rantai berhenti (1 attempt, 1 fetch)', () => {
    assert.equal(r.attempts.length, 1);
    assert.equal(fetchCalls, 1);
  });
}

crownBehavior = 'rate429'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('S2 429: failover tetap bekerja (ok via provider berikutnya)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.content, 'OK-NEXT');
  });
  check('S2 429: 2 attempt', () => assert.equal(r.attempts.length, 2));
}

crownBehavior = 'empty200'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('S3 OAI 200 konten kosong: errorClass empty + failover ke River (bukan policy)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.content, 'OK-NEXT');
    assert.equal(r.attempts.length, 2);
    assert.equal(r.attempts[0].errorClass, 'empty');
    assert.equal(r.attempts[0].provider, 'crown');
  });
}

crownBehavior = 'badrequest400'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('S4 400 non-policy: AI_BAD_REQUEST, rantai berhenti', () => {
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'AI_BAD_REQUEST');
    assert.equal(r.attempts.length, 1);
  });
}

crownBehavior = 'auth401-then-bare';
delete process.env.CROWN_API_KEY;
process.env.RIVER_API_KEY_1 = 'dummy-numbered';
process.env.RIVER_API_KEY = 'dummy-bare';
fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('S5 401 key bernomor -> key polos tetap dipakai (rotasi hidup)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.content, 'OK-BARE');
    assert.deepEqual(r.attempts.map((a) => `${a.provider}:${a.ok}`), ['river-flash:false', 'river-flash:true']);
  });
}
delete process.env.RIVER_API_KEY;

console.log(`gatewayErrorClass: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
