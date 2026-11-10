/**
 * dedGatewayUsageEvidence.mjs — SPRINT 5 Workstream A (X1/X2/X4).
 *
 * Bukti usage provider harus MELEWATI batas HTTP gateway dalam skema
 * client-safe, dan attempt gagal yang terukur harus terpelihara per
 * attempt (X4) tanpa diagregasi menjadi usage final.
 * Fetch di-stub; tidak ada jaringan, tidak ada key asli.
 * Run: node src/test/dedGatewayUsageEvidence.mjs
 */
import { handleAiRequest, sanitizeUsageForClient, sanitizeAttemptForClient } from '../../api/_lib/aiGateway.js';

for (let i = 1; i <= 6; i++) delete process.env['GEMINI_API_KEY_' + i];
for (let i = 1; i <= 10; i++) delete process.env['RIVER_API_KEY_' + i];
for (let i = 1; i <= 14; i++) delete process.env['ATRIA_API_KEY_' + i];
for (let i = 1; i <= 80; i++) delete process.env['DAHL_API_KEY_' + i];
for (let i = 1; i <= 12; i++) delete process.env['GEMINI_OAI_KEY_' + i];
delete process.env.ATMO_API_KEY;
delete process.env.ATMO_API_KEY_1;
delete process.env.ZYROUTER_API_KEY;
delete process.env.CROWN_API_KEY;
delete process.env.CROWN_API_KEY_1;
delete process.env.AI_GATEWAY_TOKEN;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_ANON_KEY;
process.env.GEMINI_API_KEY_1 = 'dummy-sprint5-key';

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

function mockReq({ headers = {}, body, ip = '10.0.0.9' } = {}) {
  return {
    method: 'POST',
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    body,
    socket: { remoteAddress: ip },
  };
}
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { this.body = ''; return this; },
  };
}

// Respons Gemini stub yang bisa dikonfigurasi per skenario.
let geminiPayload = null;
globalThis.fetch = async () => ({
  ok: true,
  json: async () => geminiPayload,
});
const geminiWith = (text, usageMetadata) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  ...(usageMetadata !== undefined ? { usageMetadata } : {}),
});

const body = { message: 'analisis dokumen ini', mode: 'fast' };

await test('G1: usage Gemini valid selamat melewati batas HTTP (X1)', async () => {
  geminiPayload = geminiWith('hasil analisis', { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500, cachedContentTokenCount: 200 });
  const r = mockRes();
  await handleAiRequest(mockReq({ body }), r);
  eq(r.statusCode, 200, 'status');
  eq(r.body.usage.inputTokens, 1200, 'inputTokens');
  eq(r.body.usage.outputTokens, 300, 'outputTokens');
  eq(r.body.usage.totalTokens, 1500, 'totalTokens');
  eq(r.body.usage.cachedTokens, 200, 'cachedTokens terbedakan');
  eq(r.body.usage.source, 'gemini_usageMetadata', 'source');
  eq(r.body.usageStatus, 'measured', 'usageStatus');
  eq(r.body.attempts.length, 1, 'satu attempt');
  eq(r.body.attempts[0].usage.inputTokens, 1200, 'attempt usage');
  eq(r.body.content, 'hasil analisis', 'field lama utuh');
  eq(r.body.provider, 'gemini', 'provider lama utuh');
});

await test('G2: nol terukur eksplisit != usage hilang (X4 state 1 vs 3)', async () => {
  geminiPayload = geminiWith('nol', { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 });
  const r = mockRes();
  await handleAiRequest(mockReq({ body }), r);
  eq(r.statusCode, 200, 'status');
  eq(r.body.usageStatus, 'measured_zero', 'nol terukur berstatus measured_zero');
  eq(r.body.usage.inputTokens, 0, 'nol dipertahankan sebagai 0');
  geminiPayload = geminiWith('tanpa usage', undefined);
  const r2 = mockRes();
  await handleAiRequest(mockReq({ body }), r2);
  eq(r2.statusCode, 200, 'status 2');
  eq(r2.body.usage, null, 'usage hilang = null, BUKAN nol');
  eq(r2.body.usageStatus, 'missing', 'status missing');
});

await test('G3: respons kosong DENGAN usage -> attempt gagal terpelihara, failover sukses tidak diagregasi (X4 state 6)', async () => {
  // Attempt Gemini pertama: HTTP 200, teks kosong, usage terukur.
  // Attempt kedua (key sama dicoba ulang oleh rantai? tidak — rantai
  // pindah provider; di sini key Gemini kedua tidak ada, jadi stub
  // dibuat bergantian: panggilan fetch pertama kosong, kedua sukses).
  let call = 0;
  globalThis.fetch = async () => {
    call++;
    if (call === 1) return { ok: true, json: async () => geminiWith('', { promptTokenCount: 500, candidatesTokenCount: 0, totalTokenCount: 500 }) };
    return { ok: true, json: async () => geminiWith('sukses kedua', { promptTokenCount: 700, candidatesTokenCount: 100, totalTokenCount: 800 }) };
  };
  process.env.GEMINI_API_KEY_2 = 'dummy-sprint5-key-2';
  const r = mockRes();
  await handleAiRequest(mockReq({ body }), r);
  delete process.env.GEMINI_API_KEY_2;
  globalThis.fetch = async () => ({ ok: true, json: async () => geminiPayload });
  eq(r.statusCode, 200, 'status');
  eq(r.body.content, 'sukses kedua', 'konten dari attempt final');
  eq(r.body.usage.inputTokens, 700, 'usage final = attempt sukses SAJA (bukan 500+700)');
  ok(r.body.attempts.length >= 2, 'riwayat attempt >= 2');
  const failedAttempt = r.body.attempts.find((a) => !a.ok);
  ok(failedAttempt, 'attempt gagal ada di riwayat');
  eq(failedAttempt.usage.inputTokens, 500, 'usage attempt GAGAL terpelihara per attempt');
  eq(failedAttempt.errorClass, 'empty', 'errorClass attempt gagal');
  ok(!('error' in failedAttempt), 'teks error mentah TIDAK terekspos');
});

await test('G4: field sensitif tidak pernah terekspos di respons', async () => {
  geminiPayload = geminiWith('aman', { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 });
  const r = mockRes();
  await handleAiRequest(mockReq({ body }), r);
  const wire = JSON.stringify(r.body);
  ok(!wire.includes('dummy-sprint5-key'), 'API key tidak bocor');
  ok(!/authorization/i.test(wire), 'header otorisasi tidak bocor');
  ok(!('error' in (r.body.attempts[0] || {})), 'attempt tanpa field error mentah');
});

await test('G5: sanitizeUsageForClient — malformed tidak menjadi token karangan', async () => {
  eq(sanitizeUsageForClient(null).usageStatus, 'missing', 'null -> missing');
  eq(sanitizeUsageForClient('bukan-objek').usageStatus, 'malformed', 'string -> malformed');
  eq(sanitizeUsageForClient('bukan-objek').usage, null, 'malformed -> usage null');
  eq(sanitizeUsageForClient({ inputTokens: 'banyak' }).usage, null, 'tipe salah -> usage null');
  eq(sanitizeUsageForClient({ inputTokens: 'banyak' }).usageStatus, 'malformed', 'tipe salah -> malformed');
  eq(sanitizeUsageForClient({ inputTokens: -5 }).usageStatus, 'malformed', 'negatif -> malformed');
  const partial = sanitizeUsageForClient({ inputTokens: 42, outputTokens: 'x' });
  eq(partial.usage.inputTokens, 42, 'field sah dipertahankan');
  eq(partial.usage.outputTokens, null, 'field rusak -> null, bukan angka karangan');
  eq(partial.usageStatus, 'measured', 'parsial sah -> measured');
  const zeros = sanitizeUsageForClient({ inputTokens: 0, outputTokens: 0 });
  eq(zeros.usageStatus, 'measured_zero', 'semua nol -> measured_zero');
  eq(zeros.usage.cachedTokens, undefined, 'field absen tidak difabrikasi');
});

await test('G6: sanitizeAttemptForClient membuang teks error mentah', async () => {
  const a = sanitizeAttemptForClient({ provider: 'atmorouter', model: 'm1', ok: false, ms: 120, error: 'fetch https://x?key=SECRET gagal', errorClass: 'network', usage: null });
  eq(a.errorClass, 'network', 'errorClass dipertahankan');
  ok(!('error' in a), 'error mentah dibuang');
  ok(!JSON.stringify(a).includes('SECRET'), 'tidak ada secret di attempt tersanitasi');
  eq(sanitizeAttemptForClient(null), null, 'attempt null -> null');
});

console.log(failures === 0 ? '\nSEMUA LULUS' : `\n${failures} GAGAL`);
process.exit(failures === 0 ? 0 : 1);
