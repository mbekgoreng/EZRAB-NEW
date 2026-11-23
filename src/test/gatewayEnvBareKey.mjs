/**
 * gatewayEnvBareKey.mjs — fallback nama key polos di envKeys (perbaikan
 * env 2026-10-27), ditulis ulang untuk SPESIFIKASI FINAL owner 2026-11-22
 * 01:37 (kaki Gemini native dicabut — skenario kini memakai River).
 *
 * Masalah: gateway lama hanya membaca key BERNOMOR (GEMINI_API_KEY_1..6,
 * ATRIA_API_KEY_1..14, dst.). Bila owner memasang key TANPA nomor
 * (mis. GEMINI_API_KEY saja), kaki provider itu hilang diam-diam dan
 * kegagalan tampak seperti "server AI gangguan". Perbaikan: envKeys ikut
 * memakai nama polos, TERAKHIR sesudah key bernomor.
 *
 * Fetch di-stub per host + per key (header Authorization Bearer): hanya
 * key 'dummy-bare' yang dijawab OK, key bernomor dijawab 401 — sehingga
 * sukses HANYA bisa berasal dari kaki key polos.
 * Skenario 1–3 memakai River di mode 'chat' (tanpa key Crown, rantai
 * chat mulai dari River V4.1-Flash-1017). Skenario 4 mem-pin ASIMETRI
 * yang disengaja: Crown/Atmo membaca nama polos secara eksplisit dan
 * meletakkannya PERTAMA (bukan terakhir seperti envKeys) — lihat
 * komentar envKeys di aiGateway.js.
 * Run: node src/test/gatewayEnvBareKey.mjs
 */
import assert from 'node:assert';

// Bersihkan warisan env shell agar skenario deterministik.
for (const v of [
  'GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5', 'GEMINI_API_KEY_6',
  'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
  'ATRIA_API_KEY_1', 'DAHL_API_KEY_1', 'GEMINI_OAI_KEY_1',
  'RIVER_API_KEY', 'RIVER_API_KEY_1', 'RIVER_API_KEY_2',
  'ATMO_API_KEY', 'ATMO_API_KEY_1', 'CROWN_API_KEY', 'CROWN_API_KEY_1',
]) delete process.env[v];

function keyOf(init) {
  const h = (init && init.headers) || {};
  const auth = h.Authorization || h.authorization || '';
  const mm = String(auth).match(/^Bearer\s+(.+)$/);
  return mm ? mm[1] : '';
}

global.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('api.river.ai') || u.includes('crown.ai.id')) {
    const key = keyOf(init);
    if (key === 'dummy-bare') {
      const payload = { choices: [{ message: { content: 'OK-BARE' } }], usage: {} };
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

// --- 1. Hanya key polos River: rantai chat hidup lewat River V4.1-1017.
process.env.RIVER_API_KEY = 'dummy-bare';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('bare-only: ok via river-flash', () => assert.equal(r.ok, true));
  check('bare-only: provider river-flash model deepseek-ai/DeepSeek-V4.1-Flash-1017', () => {
    assert.equal(r.provider, 'river-flash');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4.1-Flash-1017');
    assert.equal(r.content, 'OK-BARE');
  });
  check('bare-only: 1 attempt', () => assert.equal(r.attempts.length, 1));
}

// --- 2. Key bernomor gagal + key polos menjawab: polos dipakai sesudah bernomor.
process.env.RIVER_API_KEY_1 = 'dummy-numbered';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('numbered-fail + bare-ok: ok via river-flash', () => assert.equal(r.ok, true));
  check('numbered-fail + bare-ok: 2 attempt river-flash (bernomor dulu, polos kemudian)', () => {
    assert.deepEqual(r.attempts.map((a) => `${a.provider}:${a.ok}`), ['river-flash:false', 'river-flash:true']);
  });
}

// --- 3. Tanpa key sama sekali: tetap gagal jujur, bukan sukses palsu.
delete process.env.RIVER_API_KEY;
delete process.env.RIVER_API_KEY_1;
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('no-keys: ok=false, attempts kosong', () => {
    assert.equal(r.ok, false);
    assert.deepEqual(r.attempts, []);
  });
}

// --- 4. ASIMETRI Crown: nama polos dibaca eksplisit dan dipakai PERTAMA
//      (bukan terakhir seperti envKeys) — key polos yang hidup menjawab
//      di attempt pertama, key bernomor yang mati tidak pernah dicoba.
process.env.CROWN_API_KEY = 'dummy-bare';
process.env.CROWN_API_KEY_1 = 'dummy-numbered';
{
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('crown bare-first: ok via crown di attempt pertama', () => assert.equal(r.ok, true));
  check('crown bare-first: 1 attempt (key bernomor tak tersentuh)', () => {
    assert.equal(r.attempts.length, 1);
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4-Flash-0731');
    assert.equal(r.content, 'OK-BARE');
  });
}
delete process.env.CROWN_API_KEY;
delete process.env.CROWN_API_KEY_1;

console.log(`\ngatewayEnvBareKey: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
