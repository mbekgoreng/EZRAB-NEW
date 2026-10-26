/**
 * gatewayEnvBareKey.mjs — fallback nama key polos di envKeys (perbaikan
 * env 2026-10-27).
 *
 * Masalah: gateway lama hanya membaca key BERNOMOR (GEMINI_API_KEY_1..6,
 * ATRIA_API_KEY_1..14, dst.). Bila owner memasang key TANPA nomor
 * (mis. GEMINI_API_KEY saja), kaki provider itu hilang diam-diam dan
 * kegagalan tampak seperti "server AI gangguan". Perbaikan: envKeys ikut
 * memakai nama polos, TERAKHIR sesudah key bernomor.
 *
 * Fetch di-stub per host + per key Gemini (query ?key=...): hanya key
 * 'dummy-bare' yang dijawab OK, key bernomor dijawab gagal — sehingga
 * sukses HANYA bisa berasal dari kaki key polos.
 * Run: node src/test/gatewayEnvBareKey.mjs
 */
import assert from 'node:assert';

// Bersihkan warisan env shell agar skenario deterministik.
for (const v of [
  'GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5', 'GEMINI_API_KEY_6',
  'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
  'ATRIA_API_KEY_1', 'DAHL_API_KEY_1', 'GEMINI_OAI_KEY_1',
  'RIVER_API_KEY_1', 'ATMO_API_KEY', 'CROWN_API_KEY',
]) delete process.env[v];

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('generativelanguage.googleapis.com')) {
    const key = new URL(u).searchParams.get('key');
    if (key === 'dummy-bare') {
      const payload = { candidates: [{ content: { parts: [{ text: 'OK-BARE' }] } }], usageMetadata: {} };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
    return { ok: false, status: 401, json: async () => ({}), text: async () => 'stub-fail' };
  }
  return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
};

const { executeAI } = await import('../../api/_lib/aiGateway.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}

// --- 1. Hanya key polos: rantai fast hidup lewat Gemini native.
process.env.GEMINI_API_KEY = 'dummy-bare';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('bare-only: ok via gemini', () => assert.equal(r.ok, true));
  check('bare-only: provider gemini model gemini-3.5-flash-lite', () => {
    assert.equal(r.provider, 'gemini');
    assert.equal(r.model, 'gemini-3.5-flash-lite');
    assert.equal(r.content, 'OK-BARE');
  });
  check('bare-only: 1 attempt', () => assert.equal(r.attempts.length, 1));
}

// --- 2. Key bernomor gagal + key polos menjawab: polos dipakai sesudah bernomor.
process.env.GEMINI_API_KEY_1 = 'dummy-numbered';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('numbered-fail + bare-ok: ok via gemini', () => assert.equal(r.ok, true));
  check('numbered-fail + bare-ok: 2 attempt gemini (bernomor dulu, polos kemudian)', () => {
    assert.deepEqual(r.attempts.map((a) => `${a.provider}:${a.ok}`), ['gemini:false', 'gemini:true']);
  });
}

// --- 3. Tanpa key sama sekali: tetap gagal jujur, bukan sukses palsu.
delete process.env.GEMINI_API_KEY;
delete process.env.GEMINI_API_KEY_1;
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('no-keys: ok=false, attempts kosong', () => {
    assert.equal(r.ok, false);
    assert.deepEqual(r.attempts, []);
  });
}

console.log(`\ngatewayEnvBareKey: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
