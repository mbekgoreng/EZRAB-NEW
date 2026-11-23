/**
 * dedRiverAtmoFallback.mjs — kaki fallback River + Atmo di rantai DED
 * ('ded' + 'fast') — spesifikasi final owner 2026-11-22 01:37.
 *
 * Latar: 2026-11-20 16:28 DED gagal live — WeizeRouter menolak key dengan
 * HTTP 401, lalu SEMUA kaki fallback Crown menolak dengan HTTP 403 —
 * gateway 502. Owner menyetujui fallback ArxPay 2026-11-20 16:54.
 * 2026-11-21 21:25 ArxPay ikut tumbang (timeout 55 dtk, DED/fast 100%
 * mati); owner memerintahkan 2026-11-22 01:21: HAPUS ArxPay, ganti
 * slotnya dengan River lalu Atmo. 2026-11-22 01:37 owner menetapkan
 * SPESIFIKASI FINAL: WeizeRouter + Gemini native KELUAR dari semua
 * rantai teks; rantai DED kini:
 *  - fast (DED Cepat): Crown V4-0731 -> River Nemotron -> River
 *    V4.1-Flash-1017 -> Atmo cx/gpt-6-luna
 *  - ded (DED Dalam): Atmo cx/gpt-6-luna -> Atmo ag/gemini-3.8-flash-high
 * File ini ditulis ulang untuk rantai baru (satu-satunya yang tersisa
 * dari versi lama adalah pola replay insiden + pin dead-key skip).
 *
 * Yang dibuktikan suite ini (semua mocked — fetch di-stub per host, tidak
 * ada panggilan jaringan nyata, tidak ada key asli):
 *  1. Replay pola insiden live — Crown 403 -> River Nemotron menjawab
 *     (403 TIDAK memicu dead-key skip; skip hanya pada 401).
 *  1b. River gagal 500 -> Atmo cx menjawab sebagai kaki terakhir fast.
 *  2. DED Dalam: cx gagal 500 -> ag menjawab.
 *  3. Fast semua-gagal: PERSIS 4 kaki; ded semua-gagal: PERSIS 2 kaki.
 *  4. Quick (cabang else) = rantai fast yang sama.
 *  5. Sukses Crown tetap short-circuit (River + Atmo tidak dipanggil).
 *  6. Crown 401 -> Nemotron menjawab (dead-key skip per slot).
 *  7. Tanpa key Crown, rantai fast hanya River + Atmo; ded tak berubah.
 *  8. Tanpa semua key, fail-closed dipertahankan (rantai kosong).
 *  9. River 401 hanya men-skip slot key River itu (per-provider scoping).
 * 10. Atmo 401 dengan 1 key mematikan SELURUH rantai ded (cx + ag satu
 *     slot key yang sama) — kerapuhan single-key yang dipin jujur.
 * 11. Crown 401 dengan 2 key: rotasi key tetap jalan.
 */
import assert from 'node:assert';

// Hanya key yang relevan untuk rantai ded/fast; key provider lain
// dihapus supaya tidak ada kaki asing yang ikut terhitung. Key
// WeizeRouter SENGAJA tetap di-set — membuktikan provider yang dicabut
// tidak lagi dipanggil walau key ada.
for (const k of Object.keys(process.env)) {
  if (/^(GEMINI|DAHL|ATRIA|ZYROUTER|GEMINI_OAI)_/.test(k) || k === 'ZYROUTER_API_KEY') {
    delete process.env[k];
  }
}
process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
process.env.CROWN_API_KEY = 'dummy-crown';
process.env.RIVER_API_KEY_1 = 'dummy-river';
process.env.ATMO_API_KEY = 'dummy-atmo';

// behavior per host: 'ok' | 'fail401' | 'fail403' | 'fail500' | 'fail502'
const behavior = { weizerouter: 'fail500', crown: 'fail500', river: 'fail500', atmo: 'fail500' };
const hostCalls = { weizerouter: 0, crown: 0, river: 0, atmo: 0 };

function hostOf(url) {
  if (url.includes('crown.ai.id')) return 'crown';
  if (url.includes('api.river.ai')) return 'river';
  if (url.includes('atmorouter.dev')) return 'atmo';
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
  behavior.river = 'fail500';
  behavior.atmo = 'fail500';
  hostCalls.weizerouter = 0;
  hostCalls.crown = 0;
  hostCalls.river = 0;
  hostCalls.atmo = 0;
  process.env.WEIZEROUTER_API_KEY = 'dummy-weize';
  process.env.CROWN_API_KEY = 'dummy-crown';
  process.env.RIVER_API_KEY_1 = 'dummy-river';
  process.env.ATMO_API_KEY = 'dummy-atmo';
  delete process.env.RIVER_API_KEY_2;
  delete process.env.CROWN_API_KEY_1;
  delete process.env.ATMO_API_KEY_1;
}
const CROWN_V4 = 'crown:deepseek-ai/DeepSeek-V4-Flash-0731';
const RIVER_NEMOTRON = 'river-text:nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4';
const RIVER_1017 = 'river-flash:deepseek-ai/DeepSeek-V4.1-Flash-1017';
const ATMO_AG = 'atmorouter:ag/gemini-3.8-flash-high';
const ATMO_CX = 'atmorouter:cx/gpt-6-luna';
const FAST_SEQ = [CROWN_V4, RIVER_NEMOTRON, RIVER_1017, ATMO_CX];
const DED_SEQ = [ATMO_CX, ATMO_AG];

// --- RA-1. Fast: replay pola insiden live 2026-11-20 16:28 — Crown 403,
//      River Nemotron menyelamatkan (403 TIDAK memicu dead-key skip).
reset();
behavior.crown = 'fail403';
behavior.river = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-1 fast 403->River: ok via river-text', () => assert.equal(r.ok, true));
  check('RA-1 fast 403->River: provider river-text model Nemotron', () => {
    assert.equal(r.provider, 'river-text');
    assert.equal(r.model, 'nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4');
  });
  check('RA-1 fast 403->River: tepat 2 attempt (1 crown + 1 river)', () => assert.deepEqual(seq(r), [
    CROWN_V4,
    RIVER_NEMOTRON,
  ]));
  check('RA-1 fast 403->River: attempt Crown errorClass auth status 403', () => {
    assert.equal(r.attempts[0].errorClass, 'auth');
    assert.equal(r.attempts[0].errorStatus, 403);
  });
}

// --- RA-1b. Fast: Crown 403, River gagal 500 (kedua model) -> Atmo cx
//      menjawab sebagai kaki terakhir.
reset();
behavior.crown = 'fail403';
behavior.river = 'fail500';
behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-1b fast 403->River500->Atmo: ok via atmorouter', () => assert.equal(r.ok, true));
  check('RA-1b fast 403->River500->Atmo: provider atmorouter model cx/gpt-6-luna', () => {
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'cx/gpt-6-luna');
  });
  check('RA-1b fast 403->River500->Atmo: tepat 4 attempt (seluruh rantai)', () => assert.deepEqual(seq(r), FAST_SEQ));
}

// --- RA-2. DED Dalam: cx gagal 500 -> ag menjawab.
reset();
behavior.atmo = 'fail500';
{
  // Stub per-host tidak membedakan model — skenario ini butuh Atmo
  // menjawab di kaki kedua saja; dipakai perilaku 'ok' pada panggilan
  // kedua via penghitung khusus di bawah (lihat RA-2b). Di sini, atmo
  // 'fail500' untuk mem-pin urutan semua-gagal dulu.
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('RA-2 ded semua-gagal: PERSIS 2 kaki (cx -> ag)', () => assert.deepEqual(seq(r), DED_SEQ));
  check('RA-2 ded semua-gagal: ok=false, 2 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 2);
  });
}

// --- RA-2b. DED Dalam: cx gagal, ag menjawab — stub menjawab 'ok' hanya
//      untuk model ag (dibedakan dari body request).
reset();
{
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const host = hostOf(String(url));
    hostCalls[host] = (hostCalls[host] || 0) + 1;
    let model = '';
    try { model = JSON.parse(String(opts && opts.body ? opts.body : '{}')).model || ''; } catch { /* abaikan */ }
    if (host === 'atmo' && model === 'ag/gemini-3.8-flash-high') {
      const payload = { choices: [{ message: { content: 'OK-ATMO-AG' } }], usage: {} };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
    return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-500' };
  };
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  global.fetch = origFetch;
  check('RA-2b ded cx-gagal->ag: ok via atmorouter ag', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
    assert.equal(r.model, 'ag/gemini-3.8-flash-high');
  });
  check('RA-2b ded cx-gagal->ag: tepat 2 attempt', () => assert.deepEqual(seq(r), DED_SEQ));
}

// --- RA-3. Fast, semua gagal: urutan LENGKAP — PERSIS 4 kaki; WeizeRouter
//      TIDAK PERNAH dipanggil walau key-nya ada.
reset();
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-3 fast semua-gagal: PERSIS 4 kaki (Crown -> Nemotron -> 1017 -> cx)', () => assert.deepEqual(seq(r), FAST_SEQ));
  check('RA-3 fast semua-gagal: ok=false, 4 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 4);
  });
  check('RA-3 fast semua-gagal: WeizeRouter TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.weizerouter, 0);
  });
}

// --- RA-4. Quick (cabang else): rantai fast yang sama.
reset();
{
  const r = await executeAI({ message: 'halo', mode: 'quick' });
  check('RA-4 quick semua-gagal: rantai fast (4 kaki)', () => assert.deepEqual(seq(r), FAST_SEQ));
  check('RA-4 quick semua-gagal: ok=false, 4 attempt', () => {
    assert.equal(r.ok, false);
    assert.equal(r.attempts.length, 4);
  });
}

// --- RA-5. Fast: Crown sukses -> short-circuit, River + Atmo tidak dipanggil.
reset();
behavior.crown = 'ok';
behavior.river = 'ok';
behavior.atmo = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-5 fast short-circuit: ok via crown kaki pertama', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'crown');
    assert.equal(r.model, 'deepseek-ai/DeepSeek-V4-Flash-0731');
  });
  check('RA-5 fast short-circuit: hanya 1 attempt', () => assert.deepEqual(seq(r), [CROWN_V4]));
  check('RA-5 fast short-circuit: River + Atmo TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.river, 0);
    assert.equal(hostCalls.atmo, 0);
  });
}

// --- RA-6. Fast: Crown 401, Nemotron menjawab -> dead-key skip per slot
//      (slot crown:0 mati tidak menyentuh River).
reset();
behavior.crown = 'fail401';
behavior.river = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-6 fast Crown401->River: ok via river-text', () => assert.equal(r.ok, true));
  check('RA-6 fast Crown401->River: tepat 2 attempt', () => assert.deepEqual(seq(r), [
    CROWN_V4,
    RIVER_NEMOTRON,
  ]));
}

// --- RA-7. Tanpa key Crown (key River + Atmo ada): rantai fast hanya
//      River + Atmo — sukses lewat Nemotron kaki pertama; ded tak berubah.
reset();
delete process.env.CROWN_API_KEY;
behavior.river = 'ok';
behavior.atmo = 'ok'; // ded butuh Atmo ok (rantainya Atmo-only); fast short-circuit di Nemotron sebelum Atmo
{
  const rf = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-7 fast tanpa-key-crown: ok via river-text kaki pertama', () => {
    assert.equal(rf.ok, true);
    assert.equal(rf.provider, 'river-text');
    assert.deepEqual(seq(rf), [RIVER_NEMOTRON]);
  });
  const rd = await executeAI({ message: 'halo', mode: 'ded' });
  check('RA-7 ded tanpa-key-crown: ok via atmorouter cx (rantai tak berubah)', () => {
    assert.equal(rd.ok, true);
    assert.equal(rd.provider, 'atmorouter');
    assert.deepEqual(seq(rd), [ATMO_CX]);
  });
  check('RA-7 tanpa-key-crown: Crown TIDAK pernah dipanggil', () => {
    assert.equal(hostCalls.crown, 0);
  });
}

// --- RA-8. Tanpa semua key: fail-closed — rantai ded/fast KOSONG.
reset();
delete process.env.CROWN_API_KEY;
delete process.env.RIVER_API_KEY_1;
delete process.env.ATMO_API_KEY;
{
  const rd = await executeAI({ message: 'halo', mode: 'ded' });
  check('RA-8 ded tanpa-semua-key: rantai KOSONG (fail-closed)', () => {
    assert.equal(rd.ok, false);
    assert.deepEqual(seq(rd), []);
    assert.equal(rd.error, 'No AI provider keys configured');
  });
  const rf = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-8 fast tanpa-semua-key: rantai KOSONG (fail-closed)', () => {
    assert.equal(rf.ok, false);
    assert.deepEqual(seq(rf), []);
    assert.equal(rf.error, 'No AI provider keys configured');
  });
  check('RA-8 tanpa-semua-key: TIDAK ADA panggilan provider', () => {
    assert.equal(hostCalls.weizerouter, 0);
    assert.equal(hostCalls.crown, 0);
    assert.equal(hostCalls.river, 0);
    assert.equal(hostCalls.atmo, 0);
  });
}

// --- RA-9. River 401 hanya men-skip slot key River itu (dead-key skip
//      per provider:keyIndex): 2 key River, kedua label River 401 ->
//      KEEMPAT kaki River dicoba (2 key x 2 label) — skip per slot,
//      bukan per provider/label. Crown + Atmo gagal 500.
reset();
process.env.RIVER_API_KEY_2 = 'dummy-river-2';
behavior.river = 'fail401';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-9 fast river-2key-401: keempat kaki River dicoba (skip per slot)', () => {
    assert.equal(hostCalls.river, 4);
    assert.deepEqual(seq(r).slice(1, 5), [RIVER_NEMOTRON, RIVER_NEMOTRON, RIVER_1017, RIVER_1017]);
  });
  check('RA-9 fast river-2key-401: Crown dulu, Atmo terakhir tetap dicoba', () => {
    assert.deepEqual(seq(r), [CROWN_V4, RIVER_NEMOTRON, RIVER_NEMOTRON, RIVER_1017, RIVER_1017, ATMO_CX]);
    assert.equal(r.attempts.length, 6);
  });
}
delete process.env.RIVER_API_KEY_2;

// --- RA-10. DED, 1 key Atmo, Atmo 401: cx 401 menandai slot 'atmorouter:0'
//      mati — ag (slot key yang sama) ikut ter-skip. Rantai ded 1-key
//      mati total oleh satu 401. Dipin JUJUR di sini (bukan bug —
//      perilaku dead-key skip yang sama sejak Phase 2 W4); mitigasi
//      operasional = pasang ATMO_API_KEY_1 kedua (lihat RA-10b).
reset();
behavior.atmo = 'fail401';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('RA-10 ded atmo-1key-401: hanya 1 attempt (ag ter-skip dead-key)', () => {
    assert.equal(r.ok, false);
    assert.deepEqual(seq(r), [ATMO_CX]);
    assert.equal(hostCalls.atmo, 1);
  });
}

// --- RA-10b. DED, 2 key Atmo, Atmo 401: cx k0 401 -> cx k1 tetap dicoba
//      (slot berbeda); ag k0 + k1 ter-skip (kedua slot mati). Total 2
//      attempt — key kedua memberi satu kesempatan ekstra, bukan
//      penyelamatan penuh (ag butuh slot yang hidup).
reset();
process.env.ATMO_API_KEY_1 = 'dummy-atmo-1';
behavior.atmo = 'fail401';
{
  const r = await executeAI({ message: 'halo', mode: 'ded' });
  check('RA-10b ded atmo-2key-401: 2 attempt (cx k0 + k1), ag ter-skip', () => {
    assert.equal(r.ok, false);
    assert.deepEqual(seq(r), [ATMO_CX, ATMO_CX]);
    assert.equal(hostCalls.atmo, 2);
  });
}
delete process.env.ATMO_API_KEY_1;

// --- RA-11. Fast, 2 key Crown, Crown 401: rotasi key tetap jalan —
//      crown k1 dicoba sesudah k0 401 (slot berbeda), lalu River ok.
reset();
process.env.CROWN_API_KEY_1 = 'dummy-crown-1';
behavior.crown = 'fail401';
behavior.river = 'ok';
{
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('RA-11 fast crown-2key-401: rotasi key, lalu River menjawab', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'river-text');
    assert.deepEqual(seq(r), [CROWN_V4, CROWN_V4, RIVER_NEMOTRON]);
    assert.equal(hostCalls.crown, 2);
  });
}
delete process.env.CROWN_API_KEY_1;

console.log(`\ndedRiverAtmoFallback: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
