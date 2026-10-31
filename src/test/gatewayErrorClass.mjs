/**
 * gatewayErrorClass.mjs — klasifikasi kegagalan gateway (audit 2026-10-31, F1).
 * Fetch di-stub; tidak ada jaringan nyata, tidak ada key asli.
 * Membuktikan:
 *  S1 penolakan kebijakan (HTTP 400 bernada policy) menghentikan rantai —
 *     TIDAK difailover ke provider lain (anti filter-shopping).
 *  S2 HTTP 429 tetap failover seperti sebelumnya.
 *  S3 blokir SAFETY Gemini via HTTP 200 (promptFeedback) = policy, berhenti.
 *  S4 HTTP 400 non-policy = AI_BAD_REQUEST, berhenti.
 *  S5 rotasi key tetap hidup: 401 pada key bernomor -> key polos dipakai.
 */
import assert from 'node:assert';

for (const v of [
  'GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5', 'GEMINI_API_KEY_6',
  'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
  'ATRIA_API_KEY_1', 'DAHL_API_KEY_1', 'GEMINI_OAI_KEY_1',
  'RIVER_API_KEY_1', 'ATMO_API_KEY', 'CROWN_API_KEY',
]) delete process.env[v];

process.env.GEMINI_API_KEY_1 = 'dummy-gemini';
process.env.ZYROUTER_API_KEY = 'dummy-zy';

let fetchCalls = 0;
let geminiBehavior = 'policy400';
global.fetch = async (url) => {
  fetchCalls += 1;
  const u = String(url);
  if (u.includes('generativelanguage.googleapis.com')) {
    if (geminiBehavior === 'policy400') {
      const body = JSON.stringify({ error: { message: 'Request blocked: SAFETY policy violation (content policy)' } });
      return { ok: false, status: 400, json: async () => ({}), text: async () => body };
    }
    if (geminiBehavior === 'badrequest400') {
      const body = JSON.stringify({ error: { message: 'Invalid JSON payload received. Unknown name "foo".' } });
      return { ok: false, status: 400, json: async () => ({}), text: async () => body };
    }
    if (geminiBehavior === 'rate429') {
      return { ok: false, status: 429, json: async () => ({}), text: async () => 'quota' };
    }
    if (geminiBehavior === 'block200') {
      const payload = { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
    if (geminiBehavior === 'auth401-then-bare') {
      const key = new URL(u).searchParams.get('key');
      if (key === 'dummy-bare') {
        const payload = { candidates: [{ content: { parts: [{ text: 'OK-BARE' }] } }], usageMetadata: {} };
        return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
      }
      return { ok: false, status: 401, json: async () => ({}), text: async () => 'stub-fail' };
    }
  }
  // Host lain (ZyRouter dkk.): sukses gaya OpenAI-compatible.
  const payload = { choices: [{ message: { content: 'OK-NEXT' } }], usage: {} };
  return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
};

const { executeAI } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}

geminiBehavior = 'policy400'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('S1 policy 400: ok=false + CONTENT_REJECTED', () => {
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'CONTENT_REJECTED');
  });
  check('S1 policy 400: rantai berhenti (1 attempt, 1 fetch)', () => {
    assert.equal(r.attempts.length, 1);
    assert.equal(fetchCalls, 1);
  });
}

geminiBehavior = 'rate429'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('S2 429: failover tetap bekerja (ok via provider berikutnya)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.content, 'OK-NEXT');
  });
  check('S2 429: 2 attempt', () => assert.equal(r.attempts.length, 2));
}

geminiBehavior = 'block200'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('S3 blokir 200 SAFETY: CONTENT_REJECTED, rantai berhenti', () => {
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'CONTENT_REJECTED');
    assert.equal(r.attempts.length, 1);
    assert.equal(fetchCalls, 1);
  });
}

geminiBehavior = 'badrequest400'; fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('S4 400 non-policy: AI_BAD_REQUEST, rantai berhenti', () => {
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'AI_BAD_REQUEST');
    assert.equal(r.attempts.length, 1);
  });
}

geminiBehavior = 'auth401-then-bare';
process.env.GEMINI_API_KEY = 'dummy-bare';
fetchCalls = 0;
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('S5 401 key bernomor -> key polos tetap dipakai (rotasi hidup)', () => {
    assert.equal(r.ok, true);
    assert.equal(r.content, 'OK-BARE');
    assert.deepEqual(r.attempts.map((a) => `${a.provider}:${a.ok}`), ['gemini:false', 'gemini:true']);
  });
}
delete process.env.GEMINI_API_KEY;

console.log(`gatewayErrorClass: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
