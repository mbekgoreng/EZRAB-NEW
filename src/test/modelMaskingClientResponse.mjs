/**
 * modelMaskingClientResponse.mjs — program MASKING NAMA MODEL (Fase 3, tes).
 *
 * Membuktikan kontrak masking di batas respons HTTP gateway + konsistensi
 * alias server/klien + kebersihan string tampil:
 *  (a) respons klien mode fast: model 'Ezrab-flash-v1', provider 'ezrab',
 *      tanpa attempts[], tanpa usage.source, tanpa SATU PUN nama asli di
 *      seluruh JSON terserialisasi (pindai denylist).
 *  (b) sama untuk mode ded + advanced -> 'Ezrab-pro'; chat + vision ->
 *      'Ezrab-flash-v1'.
 *  (c) return INTERNAL executeAI tetap membawa nama asli (provider/model/
 *      attempts utuh) — masking hanya di batas respons.
 *  (d) matriks maskUsageHistoryModel: kunci fitur operasi + fallback nama
 *      model (pro-only / flash-only / ambigu -> null / tak dikenal -> null).
 *  (e) replay idempotency menyajikan body TERMASKING.
 *  (f) pindaian string tampil atas file display yang diubah program ini —
 *      tanpa nama model/provider asli di string tampil (komentar di-strip;
 *      routing/registry internal DI LUAR cakupan, residual terdokumentasi).
 *  (g) cross-check: konstanta alias server (api/_lib/modelMasking.js) dan
 *      klien (src/services/aiModelMasking.ts) SEPAKAT (nilai literal sama).
 *
 * Fetch di-stub (hanya key Gemini dummy yang terpasang, jadi hanya kaki
 * Gemini native yang berjalan di semua mode — KECUALI mode fast/ded yang
 * WeizeRouter-only sejak keputusan owner 2026-11-19: tes (a)/(b1)/(e)
 * memasang key WeizeRouter dummy sementara + stub payload ganda
 * candidates/choices); tidak ada jaringan, tidak ada key asli, tidak ada
 * panggilan AI live.
 * Run: node src/test/modelMaskingClientResponse.mjs
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handleAiRequest, executeAI } from '../../api/_lib/aiGateway.js';
import {
  modelAliasForMode,
  maskUsageHistoryModel,
  EZRAB_MODEL_FLASH,
  EZRAB_MODEL_PRO,
  EZRAB_PROVIDER_DISPLAY,
} from '../../api/_lib/modelMasking.js';
import chatHandler from '../../api/ai/chat.js';
import toolsExecuteHandler from '../../api/ai/tools/execute.js';

// --- env: hanya Gemini dummy (pola dedGatewayUsageEvidence.mjs) ---
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
delete process.env.ARXPAY_API_KEY;
delete process.env.WEIZEROUTER_API_KEY;
delete process.env.AI_GATEWAY_TOKEN;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_ANON_KEY;
process.env.GEMINI_API_KEY_1 = 'dummy-mask-key';

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

// --- denylist nama model/provider asli (lowercase; pindai case-insensitive) ---
// 'deepseek' (bare) menelan 'deepseek-'; keduanya dipertahankan sesuai daftar
// tugas. 'kimi' menelan 'kimi-k2'. Self-check di bawah membuktikan tidak ada
// token yang false-positive pada string alias itu sendiri.
const DENYLIST = [
  'gemini-', 'gpt-6', 'kimi-k2', 'deepseek-', 'minimax', 'atria', 'zyrouter',
  'weizerouter', 'kimi', 'arxpay', 'crown', 'river', 'dahl', 'atmo',
  'geminiflash', 'nemotron', 'deepseek',
  // Model Crown baru (owner 2026-11-19 05:55, prioritas No.1 chat):
  // 'glm-5' + 'zai-org' menangkap 'zai-org/GLM-5.3-Flash' bila bocor.
  'glm-5', 'zai-org',
];
function findDenied(haystackLower) {
  for (const token of DENYLIST) {
    if (haystackLower.includes(token)) return token;
  }
  return null;
}
function assertNoRealNames(wire, label) {
  const hit = findDenied(String(wire).toLowerCase());
  ok(!hit, `${label}: nama asli bocor (token '${hit}') di ${String(wire).slice(0, 400)}`);
}

// --- harness mock req/res (pola dedGatewayUsageEvidence.mjs) ---
let ipCounter = 0;
function mockReq({ headers = {}, body } = {}) {
  ipCounter++;
  return {
    method: 'POST',
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    body,
    // IP berbeda per request: rate limit mode degraded 20/mnt per IP.
    socket: { remoteAddress: `10.0.9.${ipCounter}` },
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

// Stub Gemini: konten netral (tanpa token denylist) + usage terukur agar
// ketiadaan usage.source bermakna (bukan karena usage null).
// Payload GANDA: candidates+usageMetadata (jalur Gemini) dan
// choices+usage (jalur OpenAI/WeizeRouter — mode fast/ded WeizeRouter-only
// sejak keputusan owner 2026-11-19; kedua bentuk membawa konten + usage
// yang sama agar asersi bersama berlaku di kedua jalur).
let fetchCalls = 0;
const geminiPayload = {
  candidates: [{ content: { parts: [{ text: 'STUB-OK' }] } }],
  usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500 },
  choices: [{ message: { content: 'STUB-OK' } }],
  usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
};
const geminiFetch = async () => {
  fetchCalls++;
  return { ok: true, json: async () => geminiPayload };
};
globalThis.fetch = geminiFetch;

// Mode fast/ded WeizeRouter-only (keputusan owner 2026-11-19): key
// WeizeRouter dummy dipasang HANYA di dalam tes yang membutuhkannya,
// lalu dihapus — bila dipasang global, kaki WeizeRouter menjadi pertama
// di rantai chat/advanced dan tes (c1)/(c2) kehilangan kaki Gemini.
async function withWeizeKey(fn) {
  process.env.WEIZEROUTER_API_KEY = 'dummy-mask-weize';
  try { await fn(); } finally { delete process.env.WEIZEROUTER_API_KEY; }
}

// Asersi bersama untuk SATU respons klien termasking.
function assertMaskedClientBody(r, { mode, model }) {
  eq(r.statusCode, 200, 'status');
  eq(r.body.model, model, `model mode ${mode}`);
  eq(r.body.provider, 'ezrab', 'provider disamarkan');
  eq(r.body.mode, mode, 'mode dipertahankan');
  eq(r.body.content, 'STUB-OK', 'konten diteruskan utuh');
  ok(!('attempts' in r.body), 'attempts[] TIDAK dikirim ke klien');
  ok(r.body.usage && r.body.usage.inputTokens === 1200, 'usage terukur diteruskan');
  ok(!('source' in r.body.usage), 'usage.source TIDAK diteruskan ke klien');
  assertNoRealNames(JSON.stringify(r.body), `body mode ${mode}`);
}

// --- (denylist) self-check: denylist tidak false-positive pada alias ---
await test('0: denylist tidak mengenai string alias itu sendiri', async () => {
  for (const alias of ['Ezrab-flash-v1', 'Ezrab-pro', 'ezrab']) {
    eq(findDenied(alias.toLowerCase()), null, `denylist mengenai alias '${alias}'`);
  }
  // ...tapi tetap menangkap nama asli (sanity: pindai bukan no-op).
  eq(findDenied(JSON.stringify({ model: 'gemini-3.5-flash-lite' }).toLowerCase()), 'gemini-');
  eq(findDenied(JSON.stringify({ provider: 'weizerouter' }).toLowerCase()), 'weizerouter');
  eq(findDenied(JSON.stringify({ model: 'Atria-Dawn-Preview' }).toLowerCase()), 'atria');
});

// --- (a) mode fast ---
await test('a: respons klien mode fast termasking penuh', async () => {
  await withWeizeKey(async () => {
    const r = mockRes();
    await handleAiRequest(mockReq({ body: { message: 'halo', mode: 'fast' } }), r);
    assertMaskedClientBody(r, { mode: 'fast', model: 'Ezrab-flash-v1' });
  });
});

// --- (b) mode ded / advanced / chat / vision ---
await test('b1: respons klien mode ded (via tools/execute, DED_AI_DETAIL) -> Ezrab-pro', async () => {
  await withWeizeKey(async () => {
    const r = mockRes();
    await toolsExecuteHandler(mockReq({ body: { message: 'hitung rab', productId: 'DED_AI_DETAIL' } }), r);
    assertMaskedClientBody(r, { mode: 'ded', model: 'Ezrab-pro' });
  });
});

await test('b2: respons klien mode advanced -> Ezrab-pro', async () => {
  const r = mockRes();
  await handleAiRequest(mockReq({ body: { message: 'analisis mendalam', mode: 'advanced' } }), r);
  assertMaskedClientBody(r, { mode: 'advanced', model: 'Ezrab-pro' });
});

await test('b3: respons klien mode chat (via api/ai/chat, EZRAB_AI) -> Ezrab-flash-v1', async () => {
  const r = mockRes();
  await chatHandler(mockReq({ body: { message: 'halo chat', productId: 'EZRAB_AI' } }), r);
  assertMaskedClientBody(r, { mode: 'chat', model: 'Ezrab-flash-v1' });
});

await test('b4: respons klien mode vision -> Ezrab-flash-v1', async () => {
  const r = mockRes();
  await handleAiRequest(mockReq({
    body: { message: 'lihat gambar', mode: 'vision', imageDataBase64: 'AAAA', imageMimeType: 'image/png' },
  }), r);
  assertMaskedClientBody(r, { mode: 'vision', model: 'Ezrab-flash-v1' });
});

// --- (c) return INTERNAL executeAI tetap nama asli ---
// Mode 'chat' (fast WeizeRouter-only sejak keputusan owner 2026-11-19 —
// tes ini membuktikan nama internal Gemini; rantai chat masih berisi
// Gemini dan hanya key Gemini yang terpasang di titik ini).
await test('c1: executeAI internal tetap membawa nama asli (provider/model/attempts)', async () => {
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  eq(r.ok, true, 'ok');
  eq(r.provider, 'gemini', 'provider internal asli');
  eq(r.model, 'gemini-3.5-flash-lite', 'model internal asli');
  eq(r.attempts.length, 1, 'attempts internal utuh');
  eq(r.attempts[0].provider, 'gemini', 'attempt provider asli');
  eq(r.attempts[0].model, 'gemini-3.5-flash-lite', 'attempt model asli');
  eq(r.attempts[0].ok, true, 'attempt ok');
});

await test('c2: failover internal: attempts gagal + sukses tercatat nama asli', async () => {
  // Key kedua + stub gagal-sekali: attempt 1 (key 1) gagal, attempt 2 (key 2) sukses.
  process.env.GEMINI_API_KEY_2 = 'dummy-mask-key-2';
  let call = 0;
  globalThis.fetch = async () => {
    call++;
    if (call === 1) return { ok: false, status: 500, json: async () => ({}), text: async () => 'stub-fail' };
    return { ok: true, json: async () => geminiPayload };
  };
  try {
    const r = await executeAI({ message: 'halo', mode: 'chat' });
    eq(r.ok, true, 'ok sesudah failover');
    eq(r.attempts.length, 2, 'dua attempt tercatat');
    eq(r.attempts[0].ok, false, 'attempt 1 gagal');
    eq(r.attempts[0].provider, 'gemini', 'attempt gagal: provider asli');
    eq(r.attempts[1].ok, true, 'attempt 2 sukses');
    eq(r.attempts[1].model, 'gemini-3.5-flash-lite', 'attempt sukses: model asli');
  } finally {
    delete process.env.GEMINI_API_KEY_2;
    globalThis.fetch = geminiFetch;
  }
});

// --- (d) matriks maskUsageHistoryModel ---
await test('d1: maskUsageHistoryModel — kunci fitur operasi (primer)', async () => {
  const cases = [
    // [feature, model, expected] — model sengaja "berlawanan" di dua kasus
    // pertama untuk membuktikan kunci fitur MENANG atas fallback nama.
    ['chat-ai/fast', 'gpt-6-luna', EZRAB_MODEL_FLASH],
    ['chat-ai/advanced', 'weizerouter-v2', EZRAB_MODEL_PRO],
    ['chat-ai/fast', null, EZRAB_MODEL_FLASH],
    ['chat-ai/advanced', null, EZRAB_MODEL_PRO],
    ['ded-ai/simple', 'gemini-3.5-flash-lite', EZRAB_MODEL_FLASH],
    ['ded-ai/medium', null, EZRAB_MODEL_PRO],
    ['ded-ai/complex', null, EZRAB_MODEL_PRO],
    ['ded-ai/full-ai', null, EZRAB_MODEL_PRO],
    ['ai-document/analysis', null, EZRAB_MODEL_PRO],
    ['ai-document/translate', 'deepseek-v4.1-flash', EZRAB_MODEL_PRO],
  ];
  for (const [feature, model, expected] of cases) {
    eq(maskUsageHistoryModel({ feature, model }), expected, `feature ${feature} (model ${model})`);
  }
});

await test('d2: maskUsageHistoryModel — kunci bare legacy jatuh ke fallback nama model', async () => {
  // Bare 'ded-ai'/'ai-document' AMBIGU (LEGACY_AMBIGUOUS_FEATURE_KEYS) —
  // TIDAK dipetakan langsung; hasil ditentukan fallback nama model.
  eq(maskUsageHistoryModel({ feature: 'ded-ai', model: 'gpt-6-luna' }), EZRAB_MODEL_PRO, 'bare ded-ai + model pro-only -> pro');
  eq(maskUsageHistoryModel({ feature: 'ded-ai', model: 'weizerouter-v2' }), EZRAB_MODEL_FLASH, 'bare ded-ai + model flash-only -> flash');
  eq(maskUsageHistoryModel({ feature: 'ai-document', model: 'wz/gpt-6-luna' }), EZRAB_MODEL_PRO, 'bare ai-document + model pro-only -> pro');
  eq(maskUsageHistoryModel({ feature: 'ai-document', model: 'kimi-k2.7' }), EZRAB_MODEL_FLASH, 'bare ai-document + model flash-only -> flash');
  eq(maskUsageHistoryModel({ feature: 'ded-ai', model: 'cx/gpt-6-luna' }), null, 'bare ded-ai + model ambigu -> null');
  eq(maskUsageHistoryModel({ feature: 'ded-ai', model: 'model-tak-dikenal' }), null, 'bare ded-ai + model tak dikenal -> null');
  eq(maskUsageHistoryModel({ feature: 'ai-document', model: 'gemini-3.5-flash-lite' }), null, 'bare ai-document + model ambigu -> null');
  eq(maskUsageHistoryModel({ feature: 'ai-document', model: 'model-ngasal' }), null, 'bare ai-document + model tak dikenal -> null');
  eq(maskUsageHistoryModel({ feature: 'ded-ai' }), null, 'bare ded-ai tanpa model -> null');
});

await test('d3: maskUsageHistoryModel — fallback nama model (pro/flash-only, ambigu, tak dikenal)', async () => {
  const proOnly = ['gpt-6-luna', 'muse-spark-1.3-contributor', 'wz/gpt-6-luna', 'wz/deepseek-v4.1-flash'];
  for (const model of proOnly) {
    eq(maskUsageHistoryModel({ model }), EZRAB_MODEL_PRO, `pro-only ${model}`);
  }
  const flashOnly = [
    'weizerouter-v2', 'kimi-k2.7', 'kimi-k2.6',
    'atmo/deepseek-v4.1-flash', 'ali/deepseek-v4.1-flash',
    'deepseek-ai/DeepSeek-V4.1-Flash',
    'nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4',
    'Atria-Dawn-Preview', 'gemini-3.8-flash',
  ];
  for (const model of flashOnly) {
    eq(maskUsageHistoryModel({ model }), EZRAB_MODEL_FLASH, `flash-only ${model}`);
  }
  const ambiguous = [
    'cx/gpt-6-luna', 'gemini-3.5-flash-lite', 'deepseek-v4.1-flash',
    'geminiflash-3.8', 'ag/gemini-3.8-flash-high',
  ];
  for (const model of ambiguous) {
    eq(maskUsageHistoryModel({ model }), null, `ambigu ${model} -> null (jangan tebak tier)`);
  }
  eq(maskUsageHistoryModel({ model: 'model-tak-dikenal-xyz' }), null, 'tak dikenal -> null');
  eq(maskUsageHistoryModel({ feature: 'fitur-tak-dikenal', model: 'model-ngasal' }), null, 'fitur tak dikenal + model tak dikenal -> null');
  eq(maskUsageHistoryModel({}), null, 'kosong -> null');
  eq(maskUsageHistoryModel(), null, 'tanpa argumen -> null');
});

await test('d4: modelAliasForMode — pemetaan mode ke alias', async () => {
  eq(modelAliasForMode('fast'), EZRAB_MODEL_FLASH, 'fast -> flash');
  eq(modelAliasForMode('chat'), EZRAB_MODEL_FLASH, 'chat -> flash');
  eq(modelAliasForMode('vision'), EZRAB_MODEL_FLASH, 'vision -> flash');
  eq(modelAliasForMode('advanced'), EZRAB_MODEL_PRO, 'advanced -> pro');
  eq(modelAliasForMode('ded'), EZRAB_MODEL_PRO, 'ded -> pro');
  eq(modelAliasForMode('mode-liar'), EZRAB_MODEL_FLASH, 'mode tak dikenal -> flash (jaring pengaman)');
});

// --- (e) replay idempotency menyajikan body termasking ---
await test('e: replay idempotency menyajikan body TERMASKING (tanpa panggil provider lagi)', async () => {
  await withWeizeKey(async () => {
  const h = { 'idempotency-key': 'idem-key-mask-client' };
  fetchCalls = 0;
  const r1 = mockRes();
  const req1 = mockReq({ headers: h, body: { message: 'halo', mode: 'fast' } });
  await handleAiRequest(req1, r1);
  eq(r1.statusCode, 200, 'respons pertama');
  eq(fetchCalls, 1, 'provider dipanggil sekali');
  const r2 = mockRes();
  // IP SAMA dengan r1 (scope idempotensi = IP + kunci): mockReq menaikkan
  // IP otomatis, jadi paksa IP r1 pada req replay.
  const req2 = mockReq({ headers: h, body: { message: 'halo', mode: 'fast' } });
  req2.socket.remoteAddress = req1.socket.remoteAddress;
  await handleAiRequest(req2, r2);
  eq(r2.statusCode, 200, 'respons replay');
  eq(fetchCalls, 1, 'replay TIDAK memanggil provider lagi');
  eq(r2.body.requestId, r1.body.requestId, 'replay = body tersimpan yang sama');
  eq(r2.body.model, 'Ezrab-flash-v1', 'replay: model alias flash');
  eq(r2.body.provider, 'ezrab', 'replay: provider netral');
  ok(!('attempts' in r2.body), 'replay: tanpa attempts[]');
  ok(!('source' in r2.body.usage), 'replay: tanpa usage.source');
  assertNoRealNames(JSON.stringify(r2.body), 'body replay');
  });
});

// --- (f) pindaian string tampil atas file display program ini ---
// Daftar dari evidence/implementation-client.md (§1–§4): 14 file produksi.
// Registry/routing internal sengaja DI LUAR cakupan (residual terdokumentasi
// — bundle): yang dipindai hanya string tampil, bukan seluruh src/.
// Metode: strip komentar blok + komentar baris penuh (nomor baris dipertahankan),
// lalu cocokkan token denylist HANYA bila tidak didahului karakter identifier
// [a-z0-9_] — 'atmo' di 'changeChatMode' dan 'gemini' di 'chatGemini' adalah
// false positive pola itu, bukan nama vendor. Token 'gemini' bare ditambahkan
// ke denylist di sini agar string tampil gaya lama ('Gemini Flash Lite',
// 'Gemini Vision …') ikut tertangkap — 'gemini-' saja tidak menangkapnya.
// Sisa yang cocok pola tapi BUKAN string tampil dicatat di ALLOWLIST dengan
// alasan (residual terdokumentasi); hit baru apa pun = FAIL.
const DISPLAY_FILES = [
  'src/services/aiModelMasking.ts',
  'src/services/aiProviderRouter.ts',
  'src/ai-estimate/modelConfig.ts',
  'src/ai-estimate/aiEstimatePipeline.ts',
  'src/components/document/DedRabWorkflowView.tsx',
  'src/components/magic-ai/DedAnalysisDashboard.tsx',
  'src/components/magic-ai/DocumentViewer.tsx',
  'src/ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts',
  'src/ded-rab-v2/config/dedModeConfig.ts',
  'src/ai-tools/ded-ai-estimate/view.tsx',
  'src/ai-tools/ezrab-ai/view.tsx',
  'src/ai-tools/document-ai/components/DocCreator.tsx',
  'src/ai-credits/CreditPage.tsx',
  'src/ai-credits/components/CreditUsageHistory.tsx',
];
// Residual yang cocok pola tapi BUKAN string tampil (didokumentasi di
// evidence/implementation-client.md §8 / §3 — JANGAN tambah entri baru tanpa
// keputusan koordinator; setiap entri harus menunjuk alasan residual).
const DISPLAY_SCAN_ALLOWLIST = [
  {
    file: 'src/services/aiProviderRouter.ts',
    pattern: /route\.providerId === 'gemini'/,
    reason: 'dispatch routing internal (bukan render) — residual §8.1',
  },
  {
    file: 'src/ai-estimate/modelConfig.ts',
    pattern: /modelId: 'gemini-/,
    reason: 'kunci routing internal; nilai tampilnya modelName (alias) — §3',
  },
  {
    file: 'src/services/aiModelMasking.ts',
    pattern: /str\.includes\('(gemini|gpt-6|atria)'/,
    reason: 'string pencocokan di dalam classifier masking itu sendiri — residual §8.1',
  },
];
const FILE_SCAN_TOKENS = [...DENYLIST, 'gemini'];
function stripCommentsPreservingLines(src) {
  // Komentar blok -> ganti isi dengan jumlah newline yang sama.
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));
  // Komentar baris penuh (baris yang — sesudah trim — diawali //).
  return noBlock
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n');
}
function scanDisplayFile(relPath, root) {
  const src = readFileSync(root + relPath, 'utf8');
  const stripped = stripCommentsPreservingLines(src);
  const hits = [];
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    for (const token of FILE_SCAN_TOKENS) {
      let idx = lower.indexOf(token);
      while (idx !== -1) {
        const prev = idx === 0 ? '' : lower[idx - 1];
        if (!/[a-z0-9_]/.test(prev)) {
          const allowed = DISPLAY_SCAN_ALLOWLIST.some(
            (a) => a.file === relPath && a.pattern.test(lines[i]),
          );
          if (!allowed) hits.push({ file: relPath, line: i + 1, token, text: lines[i].trim() });
          break; // satu hit per token per baris sudah cukup
        }
        idx = lower.indexOf(token, idx + 1);
      }
    }
  }
  return hits;
}

await test('f: pindaian string tampil — tanpa nama asli di 14 file display program ini', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const allHits = DISPLAY_FILES.flatMap((f) => scanDisplayFile(f, root));
  ok(
    allHits.length === 0,
    allHits.length
      ? `nama asli di string tampil:\n${allHits.map((h) => `  ${h.file}:${h.line} [${h.token}] ${h.text}`).join('\n')}`
      : 'bersih',
  );
  // Sanity: pemindai bukan no-op — ia harus menangkap string tampil gaya lama.
  const probe = stripCommentsPreservingLines("const x = 'Gemini Flash Lite';\n// Gemini di komentar\n");
  ok(probe.split('\n')[0].toLowerCase().includes('gemini'), 'probe: baris kode terdeteksi');
  ok(!probe.split('\n')[1].includes('Gemini'), 'probe: komentar ter-strip');
});

// --- (g) cross-check konstanta alias server vs klien ---
await test('g: konstanta alias server dan klien SEPAKAT (nilai literal sama)', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const serverSrc = readFileSync(root + 'api/_lib/modelMasking.js', 'utf8');
  const clientSrc = readFileSync(root + 'src/services/aiModelMasking.ts', 'utf8');
  const extract = (src, name) => {
    const m = src.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*'([^']+)'`));
    if (!m) throw new Error(`konstanta ${name} tidak ditemukan sebagai literal`);
    return m[1];
  };
  const cases = [
    ['EZRAB_MODEL_FLASH', 'Ezrab-flash-v1'],
    ['EZRAB_MODEL_PRO', 'Ezrab-pro'],
    ['EZRAB_PROVIDER_DISPLAY', 'ezrab'],
  ];
  for (const [name, expected] of cases) {
    const s = extract(serverSrc, name);
    const c = extract(clientSrc, name);
    eq(s, expected, `server ${name}`);
    eq(c, expected, `klien ${name}`);
    eq(s, c, `${name} server vs klien`);
  }
  // Nilai runtime impor server selaras dengan literal teks.
  eq(EZRAB_MODEL_FLASH, 'Ezrab-flash-v1', 'runtime server FLASH');
  eq(EZRAB_MODEL_PRO, 'Ezrab-pro', 'runtime server PRO');
  eq(EZRAB_PROVIDER_DISPLAY, 'ezrab', 'runtime server PROVIDER');
});

console.log(failures === 0 ? '\nSEMUA LULUS' : `\n${failures} GAGAL`);
process.exit(failures === 0 ? 0 : 1);
