/**
 * dedArxpayFallback.mjs — kaki fallback ArxPay TERAKHIR di rantai DED ('ded' + 'fast').
 *
 * Latar (2026-11-20 16:28): DED gagal live lagi — WeizeRouter menolak key
 * dengan HTTP 401, lalu SEMUA kaki fallback Crown menolak dengan HTTP 403
 * (GLM-5.3-Flash, DeepSeek-V4-Flash-0731, MiniMax-M2.7) — gateway 502.
 * Kode fallback Crown TERBUKTI jalan live (ketiga kakinya terpanggil);
 * kedua provider menolak key-nya. Owner menyetujui fallback ArxPay
 * 2026-11-20 16:54: ArxPay SESUDAH Crown di kedua rantai; WeizeRouter
 * TETAP pertama, Crown kedua, ArxPay TERAKHIR.
 *
 * Yang dibuktikan suite ini (semua mocked — fetch di-stub per host, tidak
 * ada panggilan jaringan nyata, tidak ada key asli):
 *  1. Replay insiden live 16:28 — WeizeRouter 401 -> Crown 403 x3 ->
 *     ArxPay menjawab (dead-key skip per provider:keyIndex TIDAK melewati
 *     Crown maupun ArxPay; 403 TIDAK memicu skip).
 *  2. Kaki ArxPay berada SESUDAH SEMUA kaki WeizeRouter + Crown di kedua
 *     rantai (ded 9 kaki, fast 10 kaki).
 *  3. Sukses WeizeRouter / Crown tetap short-circuit (ArxPay tidak dipanggil).
 *  4. Tanpa key WeizeRouter + Crown, rantai ded/fast hanya berisi kaki ArxPay.
 *  5. Tanpa ketiga key, fail-closed dipertahankan (rantai kosong).
 *  6. ArxPay 401 hanya men-skip slot key ArxPay itu (per-provider scoping).
 *
 * Model ArxPay = ARXPAY_MODEL ('deepseek-v4.1-flash', aiGateway.js:70) —
 * kaki yang SAMA dengan rantai 'chat'/'advanced' (arxpayTextAttempts),
 * text-only seperti Crown; validitas key live BELUM diketahui (butuh
 * verifikasi live sesudah push).
 */
import assert from 'node:assert';

// Hanya tiga key yang relevan untuk rantai ded/fast; key provider lain
// dihapus supaya tidak ada kaki asing yang ikut terhitung.
for (const k of Object.keys(process.env)) {
  if (/^(GEMINI|RIVER|DAHL|ATRIA|ZYROUTER|ATMO|GEMINI_OAI)_/.test(k) || k === 'ZYROUTER_API_KEY' || k === 'ATMO_API_KEY') {
    delete process.env[k];
  }
}
process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
process.env.CROWN_API_KEY = 'dummy-crown';
process.env.ARXPAY_API_KEY = 'dummy-arxpay';

// behavior per host: 'ok' | 'fail401' | 'fail403' | 'fail500' | 'fail502'
const behavior = { weizerouter: 'fail500', crown: 'fail500', arxpay: 'fail500' };
const hostCalls = { weizerouter: 0, crown: 0, arxpay: 0 };

function hostOf(url) {
  if (url.includes('crown.ai.id')) return 'crown';
  if (url.includes('arxpay.my.id')) return 'arxpay';
  if (url.includes('weizerouter.web.id')) return 'weizerouter';
  return 'unknown';
}

global.fetch = async (url) => {
  const host = hostOf(String(url));
  hostCalls[host] = (hostCalls[host] || 0) + 1;
  const b = behavior[host];
  if (b === 'ok') {
    const payload = { choices: [{ message: { content: 'OK-' + host.toUpperCase() } }], usage: {} };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  }
  const status = b === 'fail401' ? 401 : b === 'fail403' ? 403 : b === 'fail502' ? 502 : 500;
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
  behavior.arxpay = 'fail500';
  hostCalls.weizerouter = 0;
  hostCalls.crown = 0;
  hostCalls.arxpay = 0;
  process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
  process.env.CROWN_API_KEY = 'dummy-crown';
  process.env.ARXPAY_API_KEY = 'dummy-arxpay';
  delete process.env.ARXPAY_API_KEY_1;
}
const CROWN_SEQ = [
  'crown:zai-org/GLM-5.3-Flash',
  'crown:deepseek-ai/DeepSeek-V4-Flash-0731',
  'crown:MiniMaxAI/MiniMax-M2.7',
];
const ARXPAY_LEG = 'arxpay:deepseek-v4.1-flash';
const WEIZE_DED_SEQ = [
  'weizerouter:wz/gpt-6-luna',
  'weizerouter:weizerouter-v1',
  'weizerouter:wz/gemini-3.8-flash-high',
  'weizerouter:wz/grok-4.7',
  'weizerouter:wz/deepseek-v4-pro',
];
const WEIZE_FAST_SEQ = [
  'weizerouter:weizerouter-v2',
  'weizerouter:wz/gpt-6-luna',
  'weizerouter:wz/qwen3.8-flash',
  'weizerouter:wz/deepseek-v4-flash-0731',
  'weizerouter:weizerouter-v1',
  'weizerouter:wz/gemini-3.8-flash',
];

// --- AF-1. DED: replay insiden live 2026-11-20 16:28 — WeizeRouter 401,
//      Crown 403 x3, ArxPay menyelamatkan.
reset();
behavior.weizerouter = 'fail401';
behavior.crown = 'fail403';
behavior.arxpay = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('AF-1 ded 401->403x3->ArxPay: ok via arxpay', () => assert.equal(r.ok, true));
  check('AF-1 ded 401->403x3->ArxPay: provider arxpay model deepseek-v4.1-flash', () => {
    assert.equal(r.provider, 'arxpay');
    assert.equal(r.model, 'deepseek-v4.1-flash');
  });
  check('AF-1 ded 401->403x3->ArxPay: tepat 5 attempt (1 weize + 3 crown + 1 arxpay)', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    ...CROWN_SEQ,
    ARXPAY_LEG,
  ]));
  check('AF-1 ded 401->403x3->ArxPay: attempt pertama errorClass auth status 401', () => {
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 401);
  });
  check('AF-1 ded 401->403x3->ArxPay: ketiga Crown 403 (errorClass auth, tanpa skip)', () => {
    assert.equal(r.attempts[1].errorStatus, 403);
    assert.equal(r.attempts[2].errorStatus, 403);
    assert.equal(r.attempts[3].errorStatus, 403);
    assert.equal(hostCalls.crown, 3);
  });
  check('AF-1 ded 401->403x3->ArxPay: 4 kaki WeizeRouter lain di-skip (dead-key)', () => {
    assert.equal(hostCalls.weizerouter, 1);
  });
}

// --- AF-2. Fast: pola yang sama — WeizeRouter 401, Crown 403 x3, ArxPay ok.
reset();
behavior.weizerouter = 'fail401';
behavior.crown = 'fail403';
behavior.arxpay = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('AF-2 fast 401->403x3->ArxPay: ok via arxpay', () => assert.equal(r.ok, true));
  check('AF-2 fast 401->403x3->ArxPay: tepat 5 attempt (1 weize + 3 crown + 1 arxpay)', () => assert.deepEqual(seq(r), [
    'weizerouter:weizerouter-v2',
    ...CROWN_SEQ,
    ARXPAY_LEG,
  ]));
  check('AF-2 fast 401->403x3->ArxPay: 5 kaki WeizeRouter lain di-skip (dead-key)', () => {
    assert.equal(hostCalls.weizerouter, 1);
  });
}

// --- AF-3. DED, semua gagal: urutan LENGKAP — 5 WeizeRouter + 3 Crown + 1 ArxPay.
reset();
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('AF-3 ded semua-gagal: ArxPay TERAKHIR sesudah Crown', () => assert.deepEqual(seq(r), [
    ...WEIZE_DED_SEQ,
    ...CROWN_SEQ,
    ARXPAY_LEG,
  ]));
  check('AF-3 ded semua-gagal: ok=false, 9 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 9);
  });
}

// --- AF-4. Fast, semua gagal: urutan LENGKAP — 6 WeizeRouter + 3 Crown + 1 ArxPay.
reset();
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('AF-4 fast semua-gagal: ArxPay TERAKHIR sesudah Crown', () => assert.deepEqual(seq(r), [
    ...WEIZE_FAST_SEQ,
    ...CROWN_SEQ,
    ARXPAY_LEG,
  ]));
  check('AF-4 fast semua-gagal: ok=false, 10 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 10);
  });
}

// --- AF-5. Quick (cabang else): rantai fast yang sama — ArxPay TERAKHIR.
reset();
{
  const r = await executeAI({ message: 'halo', mode: 'quick' });
  check('AF-5 quick semua-gagal: ArxPay TERAKHIR sesudah Crown', () => assert.deepEqual(seq(r), [
    ...WEIZE_FAST_SEQ,
    ...CROWN_SEQ,
    ARXPAY_LEG,
  ]));
  check('AF-5 quick semua-gagal: ok=false, 10 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 10);
  });
}

// --- AF-6. DED: WeizeRouter sukses -> short-circuit, Crown + ArxPay tidak dipanggil.
reset();
behavior.weizerouter = 'ok';
behavior.crown = 'ok';
behavior.arxpay = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('AF-6 ded short-circuit: ok via weizerouter kaki pertama', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'weizerouter');
    assert.equal(r.model, 'wz/gpt-6-luna');
  });
  check('AF-6 ded short-circuit: hanya 1 attempt', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
  ]));
  check('AF-6 ded short-circuit: Crown + ArxPay TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.crown, 0);
    assert.equal(hostCalls.arxpay, 0);
  });
}

// --- AF-7. DED: WeizeRouter 401, Crown GLM menjawab -> ArxPay tidak dipanggil.
reset();
behavior.weizerouter = 'fail401';
behavior.crown = 'ok';
behavior.arxpay = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('AF-7 ded Crown-menjawab: ok via crown GLM', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'zai-org/GLM-5.3-Flash');
  });
  check('AF-7 ded Crown-menjawab: tepat 2 attempt', () => assert.deepEqual(seq(r), [
    'weizerouter:wz/gpt-6-luna',
    'crown:zai-org/GLM-5.3-Flash',
  ]));
  check('AF-7 ded Crown-menjawab: ArxPay TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.arxpay, 0);
  });
}

// --- AF-8. Tanpa key WeizeRouter + Crown (key ArxPay ada): rantai ded/fast
//      hanya berisi kaki ArxPay — dan sukses lewat ArxPay.
reset();
delete process.env.WEIZEROUTER_API_KEY;
delete process.env.CROWN_API_KEY;
behavior.arxpay = 'ok';
{
  const rd = await executeAI({ message: 'halo', mode: 'ded' });
  check('AF-8 ded tanpa-key-weize+crown: ok via arxpay kaki pertama', () => {
    assert.equal(rd.ok, true);
    assert.equal(rd.provider, 'arxpay');
    assert.deepEqual(seq(rd), [ARXPAY_LEG]);
  });
  const rf = await executeAI({ message: 'halo', mode: 'fast' });
  check('AF-8 fast tanpa-key-weize+crown: ok via arxpay kaki pertama', () => {
    assert.equal(rf.ok, true);
    assert.equal(rf.provider, 'arxpay');
    assert.deepEqual(seq(rf), [ARXPAY_LEG]);
  });
  check('AF-8 tanpa-key-weize+crown: WeizeRouter + Crown TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.weizerouter, 0);
    assert.equal(hostCalls.crown, 0);
  });
}

// --- AF-9. Tanpa ketiga key: fail-closed — rantai ded/fast KOSONG.
reset();
delete process.env.WEIZEROUTER_API_KEY;
delete process.env.CROWN_API_KEY;
delete process.env.ARXPAY_API_KEY;
{
  const rd = await executeAI({ message: 'halo', mode: 'ded' });
  check('AF-9 ded tanpa-semua-key: rantai KOSONG (fail-closed)', () => {
    assert.equal(rd.ok, false);
    assert.deepEqual(seq(rd), []);
    assert.equal(rd.error, 'No AI provider keys configured');
  });
  const rf = await executeAI({ message: 'halo', mode: 'fast' });
  check('AF-9 fast tanpa-semua-key: rantai KOSONG (fail-closed)', () => {
    assert.equal(rf.ok, false);
    assert.deepEqual(seq(rf), []);
    assert.equal(rf.error, 'No AI provider keys configured');
  });
  check('AF-9 tanpa-semua-key: TIDAK ADA panggilan provider', () => {
    assert.equal(hostCalls.weizerouter, 0);
    assert.equal(hostCalls.crown, 0);
    assert.equal(hostCalls.arxpay, 0);
  });
}

// --- AF-10. ArxPay 401 hanya men-skip slot key ArxPay itu (dead-key skip
//      per provider:keyIndex): 2 key ArxPay, kaki keyIndex 0 401 -> kaki
//      keyIndex 1 tetap dicoba (dan menjawab). WeizeRouter + Crown gagal
//      500 semua (tanpa skip — 500 bukan auth).
reset();
process.env.ARXPAY_API_KEY_1 = 'dummy-arxpay-1';
behavior.arxpay = 'fail401';
{
  // Kaki arxpay pertama 401; kaki kedua (keyIndex 1) harus tetap dicoba.
  // Karena stub mengembalikan 401 untuk semua panggilan arxpay, rantai
  // berakhir gagal — yang dibuktikan: KEDUA kaki arxpay dicoba.
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('AF-10 ded arxpay-2key-401: kedua kaki arxpay dicoba (skip per slot)', () => {
    assert.equal(hostCalls.arxpay, 2);
    assert.deepEqual(seq(r).slice(-2), [ARXPAY_LEG, ARXPAY_LEG]);
  });
  check('AF-10 ded arxpay-2key-401: 5 weize + 3 crown tetap dicoba dulu', () => {
    assert.deepEqual(seq(r).slice(0, 8), [...WEIZE_DED_SEQ, ...CROWN_SEQ]);
    assert.equal(hostCalls.weizerouter, 5);
    assert.equal(hostCalls.crown, 3);
  });
}
delete process.env.ARXPAY_API_KEY_1;

console.log(`\ndedArxpayFallback: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
