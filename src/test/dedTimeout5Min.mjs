/**
 * dedTimeout5Min.mjs — Timeout DED 5 menit + perilaku fallback gateway.
 *
 * Keputusan owner 2026-11-20 19:04 ("coba 5 menit aja", jalur Vercel —
 * VPS Amazon ditunda): per panggilan AI DED menjadi 300 detik (maksimal
 * yang diizinkan fungsi Vercel Hobby), kedua mode (Full AI + EZRAB /
 * Database). Owner minta UJI DULU: khawatir LLM pertama yang tidak
 * menjawab memakan seluruh waktu — suite ini membuktikan dengan WAKTU
 * NYATA (bukan AbortError simulasi seperti suite F3) bahwa satu kaki
 * yang menggantung dibatalkan tepat 55 dtk lalu rantai pindah ke kaki
 * berikutnya, dan budget rantai menghentikan rantai sebelum plafon
 * fungsi 300 dtk.
 *
 * Yang dibuktikan (semua provider di-mock — fetch di-stub per model,
 * tanpa panggilan jaringan nyata, tanpa key asli):
 *  A. Failover kaki pertama yang MENGGANTUNG (waktu nyata ~55 dtk):
 *     kaki 1 (wz/gpt-6-luna) diam total → diaborsi 55 dtk (errorClass
 *     'timeout') → kaki 2 (weizerouter-v1) menjawab → sukses. Total
 *     ~55 dtk, BUKAN 5 menit.
 *  B. Akuntansi budget baru 240 dtk (waktu nyata ~275 dtk): SEMUA kaki
 *     menggantung → tepat 5 kaki × 55 dtk lalu entri budget
 *     'chain time budget exceeded (240s)' — total ~275 dtk, DI BAWAH
 *     plafon bunuh Vercel 300 dtk. Batas jujur: dalam skenario semua-
 *     menggantung, Crown/ArxPay TIDAK sempat dicoba (budget habis di
 *     5 kaki WeizeRouter).
 *  C. Pin sumber nilai baru: CHAIN_BUDGET_MS 240000, MAX_TIMEOUT_MS
 *     300_000 (3 situs clamp), FULL_AI_TIMEOUT_MS 300000/300000,
 *     timeout pass DED standar 300000; ATTEMPT_TIMEOUT_MS TETAP 55000
 *     (tidak diubah — keputusan owner); worst case 240+55=295 dtk <
 *     maxDuration Vercel (dibaca dari vercel.json, bukan hardcode).
 *  D. Kegagalan CEPAT tetap menelusuri seluruh rantai (9 kaki ded
 *     dalam hitungan detik) — budget baru tidak merusak failover cepat.
 *
 * RUNTIME: ~5,5 menit (55 + 275 dtk waktu nyata + sisanya seketika).
 * Itu harga bukti waktu-nyata; JANGAN "mempercepat" dengan AbortError
 * simulasi — simulasi membuktikan klasifikasi, bukan timer.
 * Jalankan: node src/test/dedTimeout5Min.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Hanya tiga key rantai ded/fast; key provider lain dihapus supaya tidak
// ada kaki asing yang ikut terhitung.
for (const k of Object.keys(process.env)) {
  if (/^(GEMINI|RIVER|DAHL|ATRIA|ZYROUTER|ATMO|GEMINI_OAI)_/.test(k) || k === 'ZYROUTER_API_KEY' || k === 'ATMO_API_KEY') {
    delete process.env[k];
  }
}
process.env.WEIZEROUTER_API_KEY = 'probe-weize';
process.env.CROWN_API_KEY = 'probe-crown';
process.env.ARXPAY_API_KEY = 'probe-arxpay';

// Perilaku per MODEL (kaki ded berbagi host — stub per host tidak cukup).
// 'hang' = tidak pernah merespons kecuali sinyal abort menembak (meniru
// provider yang diam total; stub WAJIB menghormati sinyal seperti fetch
// asli, kalau tidak timer 55 dtk gateway tidak bisa dibuktikan).
// 'ok' = menjawab seketika. 'fail500' = HTTP 500 seketika.
const behavior = new Map();
function modelOf(init) {
  try {
    const b = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    return b?.model || 'unknown';
  } catch { return 'unknown'; }
}

global.fetch = (url, init = {}) => {
  const model = modelOf(init);
  const b = behavior.get(model) || 'ok';
  if (b === 'hang') {
    return new Promise((_resolve, reject) => {
      const sig = init.signal;
      const abortErr = () => {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        reject(e);
      };
      if (sig?.aborted) { abortErr(); return; }
      if (sig && typeof sig.addEventListener === 'function') {
        sig.addEventListener('abort', abortErr, { once: true });
      }
    });
  }
  if (b === 'fail500') {
    return Promise.resolve({
      ok: false, status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
      text: async () => 'stub-500',
    });
  }
  const payload = { choices: [{ message: { content: 'OK-' + model } }], usage: {} };
  return Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
};

const { executeAI } = await import('../../api/_lib/aiGateway.js');

const DED_MODELS = [
  'wz/gpt-6-luna', 'weizerouter-v1', 'wz/gemini-3.8-flash-high', 'wz/grok-4.7', 'wz/deepseek-v4-pro',
  'zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4-Flash-0731', 'MiniMaxAI/MiniMax-M2.7',
  'deepseek-v4.1-flash',
];
function setAll(b) { for (const m of DED_MODELS) behavior.set(m, b); }

let passed = 0, failed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`  FAIL ${name}: ${e.message}`); }
}
const fmt = (r) => r.attempts.map((a) => `${a.provider}:${a.model ?? '-'}[${a.ok ? 'ok' : a.errorClass}]${a.ms}ms`).join(' | ');
const readSrc = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// --- A. Failover kaki pertama yang menggantung (waktu nyata ~55 dtk) ---
console.log('A: leg 1 hang, leg 2 ok (ekspektasi: sukses via weizerouter-v1 dalam ~55 dtk)...');
setAll('ok');
behavior.set('wz/gpt-6-luna', 'hang');
const tA = Date.now();
const rA = await executeAI({ message: 'halo', mode: 'ded' });
const wallA = Date.now() - tA;
console.log(`  TERUKUR wall=${wallA}ms ok=${rA.ok} provider=${rA.provider} model=${rA.model}`);
console.log(`  attempts: ${fmt(rA)}`);
check('A1 sukses via kaki kedua (weizerouter-v1), bukan kaki pertama', () => {
  assert.equal(rA.ok, true);
  assert.equal(rA.provider, 'weizerouter');
  assert.equal(rA.model, 'weizerouter-v1');
});
check('A2 kaki pertama errorClass timeout (bukan network/aborted)', () => {
  assert.equal(rA.attempts[0].errorClass, 'timeout');
});
check('A3 kaki pertama diaborsi ~55 dtk (50-60 dtk)', () => {
  assert.ok(rA.attempts[0].ms >= 50000 && rA.attempts[0].ms <= 60000, `ms=${rA.attempts[0].ms}`);
});
check('A4 total wall ~55 dtk (50-65 dtk) — SATU kaki diam TIDAK memakan 5 menit', () => {
  assert.ok(wallA >= 50000 && wallA <= 65000, `wall=${wallA}`);
});

// --- B. Akuntansi budget 240 dtk, semua kaki menggantung (waktu nyata ~275 dtk) ---
console.log('B: semua kaki hang (ekspektasi: 5 kaki x 55 dtk lalu budget, ~275 dtk total)...');
setAll('hang');
const tB = Date.now();
const rB = await executeAI({ message: 'halo', mode: 'ded' });
const wallB = Date.now() - tB;
console.log(`  TERUKUR wall=${wallB}ms ok=${rB.ok}`);
console.log(`  attempts: ${fmt(rB)}`);
check('B1 gagal fail-closed (ok=false)', () => assert.equal(rB.ok, false));
check('B2 tepat 5 kaki menggantung lalu entri budget (6 entri)', () => {
  assert.equal(rB.attempts.length, 6);
  for (let i = 0; i < 5; i++) assert.equal(rB.attempts[i].errorClass, 'timeout');
  assert.equal(rB.attempts[5].provider, 'gateway');
  assert.match(rB.attempts[5].error, /chain time budget exceeded \(240s\)/);
});
check('B3 tiap kaki menggantung diaborsi ~55 dtk (54-56 dtk)', () => {
  for (let i = 0; i < 5; i++) {
    const ms = rB.attempts[i].ms;
    assert.ok(ms >= 54000 && ms <= 56000, `kaki ${i + 1} ms=${ms}`);
  }
});
check('B4 total wall ~275 dtk (270-290 dtk)', () => {
  assert.ok(wallB >= 270000 && wallB <= 290000, `wall=${wallB}`);
});
check('B5 wall DI BAWAH plafon bunuh Vercel 300 dtk', () => {
  assert.ok(wallB < 300000, `wall=${wallB}`);
});
check('B6 batas jujur: Crown/ArxPay TIDAK sempat dicoba saat semua menggantung', () => {
  const providers = rB.attempts.map((a) => a.provider);
  assert.ok(!providers.includes('crown'), 'crown tercoba — di luar ekspektasi budget');
  assert.ok(!providers.includes('arxpay'), 'arxpay tercoba — di luar ekspektasi budget');
});

// --- C. Pin sumber nilai baru (tanpa penantian) ---
console.log('C: pin sumber nilai timeout baru...');
const gw = readSrc('api/_lib/aiGateway.js');
const pc = readSrc('src/ai-tools/providerClient.ts');
const fullAi = readSrc('src/ai-tools/ded-full-ai/service.ts');
const stdDed = readSrc('src/ai-tools/ded-ai-estimate/service.ts');
check('C1 CHAIN_BUDGET_MS = 240000 (bukan 100000)', () => {
  assert.ok(gw.includes('const CHAIN_BUDGET_MS = 240000;'));
  assert.ok(!gw.includes('const CHAIN_BUDGET_MS = 100000;'));
});
check('C2 string error budget menyebut (240s)', () => {
  assert.ok(gw.includes("chain time budget exceeded (240s)"));
  assert.ok(!gw.includes('chain time budget exceeded (100s)'));
});
check('C3 ATTEMPT_TIMEOUT_MS TETAP 55000 (tidak diubah)', () => {
  assert.ok(gw.includes('const ATTEMPT_TIMEOUT_MS = 55000;'));
});
check('C4 MAX_TIMEOUT_MS = 300_000 (bukan 180_000)', () => {
  assert.ok(pc.includes('const MAX_TIMEOUT_MS = 300_000;'));
  assert.ok(!pc.includes('const MAX_TIMEOUT_MS = 180_000;'));
});
check('C5 ketiga situs clamp memakai Math.min(..., MAX_TIMEOUT_MS)', () => {
  const sites = pc.match(/Math\.min\(request\.timeoutMs \?\? \d+, MAX_TIMEOUT_MS\)/g) || [];
  assert.equal(sites.length, 3, `situs clamp=${sites.length}`);
});
check('C6 FULL_AI_TIMEOUT_MS FAST + ADVANCED = 300000', () => {
  assert.ok(/FAST:\s*300000/.test(fullAi));
  assert.ok(/ADVANCED:\s*300000/.test(fullAi));
  assert.ok(!/FULL_AI_TIMEOUT_MS = \{\n\s*FAST: 120000/.test(fullAi));
});
check('C7 timeout pass DED standar = 300000 (ternari lama 120000/180000 hilang)', () => {
  assert.ok(stdDed.includes('timeoutMs: 300000,'));
  assert.ok(!stdDed.includes("mode === 'FAST' ? 120000 : 180000"));
});
check('C8 worst case rantai 240+55=295 dtk < maxDuration Vercel (dari vercel.json)', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const maxDuration = vercel.functions?.['api/ai/**/*.js']?.maxDuration;
  assert.equal(typeof maxDuration, 'number', 'maxDuration tidak terbaca dari vercel.json');
  assert.ok(240 + 55 < maxDuration, `295 !< ${maxDuration}`);
  console.log(`     (maxDuration Vercel = ${maxDuration} dtk; worst case rantai = 295 dtk)`);
});

// --- D. Kegagalan cepat tetap menelusuri seluruh rantai ---
console.log('D: semua kaki fail 500 cepat (ekspektasi: 9 kaki ded dalam hitungan detik)...');
setAll('fail500');
const tD = Date.now();
const rD = await executeAI({ message: 'halo', mode: 'ded' });
const wallD = Date.now() - tD;
console.log(`  TERUKUR wall=${wallD}ms ok=${rD.ok} attempts=${rD.attempts.length}`);
check('D1 gagal fail-closed (ok=false)', () => assert.equal(rD.ok, false));
check('D2 kesembilan kaki ded dicoba (WeizeRouter 5 + Crown 3 + ArxPay 1)', () => {
  assert.equal(rD.attempts.length, 9);
  assert.deepEqual(rD.attempts.map((a) => a.model), DED_MODELS);
});
check('D3 kegagalan cepat selesai <10 dtk (budget baru tidak memperlambat failover cepat)', () => {
  assert.ok(wallD < 10000, `wall=${wallD}`);
});

console.log(`\nHasil: ${passed} lolos, ${failed} gagal${failed ? ` — GAGAL: ${failures.join(', ')}` : ''}`);
if (failed) process.exit(1);
console.log('SEMUA TEST DED TIMEOUT 5 MENIT LOLOS');
