/**
 * gatewayF7.mjs — Klaster F7: ketahanan gateway terhadap SSE, anggaran
 * percobaan per provider, dan penyaring footer promo AtmoRouter.
 * Fetch di-stub per host; tidak ada jaringan nyata, tidak ada key asli.
 *
 * Latar (log produksi 2026-10-23): mode 'chat' gagal karena ZyRouter
 * membalas stream SSE yang dibaca sebagai JSON ("Unexpected token 'd',
 * "data: {..."), lalu Atria 429 tiga kali; Gemini tidak ada di rantai chat.
 */
import assert from 'node:assert';

// Bersihkan seluruh key provider yang mungkin terbawa dari shell, lalu
// atur per skenario (key dibaca executeAI pada setiap panggilan).
for (let i = 1; i <= 6; i++) delete process.env['GEMINI_API_KEY_' + i];
for (let i = 1; i <= 10; i++) delete process.env['RIVER_API_KEY_' + i];
for (let i = 1; i <= 14; i++) delete process.env['ATRIA_API_KEY_' + i];
for (let i = 1; i <= 12; i++) delete process.env['GEMINI_OAI_KEY_' + i];
for (let i = 1; i <= 4; i++) delete process.env['ATMO_API_KEY_' + i];
delete process.env.DAHL_API_KEY_1;
delete process.env.ATMO_API_KEY;
delete process.env.ZYROUTER_API_KEY;
delete process.env.ZROUTER_API_KEY;

const { executeAI, parseSseStreamContent, stripAtmoPromoFooter } = await import(
  '../../api/_lib/aiGateway.js'
);

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  PASS ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
}

// ---------------------------------------------------------------------------
// 1. Unit: parseSseStreamContent
// ---------------------------------------------------------------------------
{
  const sse = [
    'data: {"id":"x","choices":[{"delta":{"content":"Halo "}}]}',
    '',
    'data: {"id":"x","choices":[{"delta":{"content":"dunia"}}]}',
    'data: {"id":"x","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
    'data: [DONE]',
    '',
  ].join('\n');
  const parsed = parseSseStreamContent(sse);
  check('sse: delta chunks tergabung', () => assert.equal(parsed.content, 'Halo dunia'));
  check('sse: usage dari chunk terakhir tertangkap', () =>
    assert.equal(parsed.usage.total_tokens, 5));

  const msgStyle = parseSseStreamContent(
    'data: {"choices":[{"message":{"content":"utuh"}}]}\ndata: [DONE]'
  );
  check('sse: message.content juga didukung', () => assert.equal(msgStyle.content, 'utuh'));

  check('sse: body JSON biasa -> null', () =>
    assert.equal(parseSseStreamContent('{"choices":[]}'), null));
  check('sse: string kosong -> null', () => assert.equal(parseSseStreamContent(''), null));
  check('sse: baris data rusak dilewati, bukan gagal total', () => {
    const p = parseSseStreamContent('data: {bukan json\ndata: {"choices":[{"delta":{"content":"ok"}}]}');
    assert.equal(p.content, 'ok');
  });
}

// ---------------------------------------------------------------------------
// 2. Unit: stripAtmoPromoFooter
// ---------------------------------------------------------------------------
{
  check('footer: baris promo di akhir dibuang', () =>
    assert.equal(stripAtmoPromoFooter('Jawaban selesai.\n\nPowered by AtmoRouter'), 'Jawaban selesai.'));
  check('footer: pemisah --- di atas promo ikut dibuang', () =>
    assert.equal(stripAtmoPromoFooter('Isi.\n\n---\nPowered by AtmoRouter'), 'Isi.'));
  check('footer: frasa di tengah konten TIDAK dibuang', () =>
    assert.equal(
      stripAtmoPromoFooter('Bagian ini membahas Powered by AtmoRouter sebagai contoh.\n\nParagraf penutup biasa.'),
      'Bagian ini membahas Powered by AtmoRouter sebagai contoh.\n\nParagraf penutup biasa.'
    ));
  check('footer: baris akhir panjang berisi frasa TIDAK dibuang', () => {
    const long =
      'Kesimpulan: layanan ini powered by atmorouter menurut dokumentasi resmi yang panjang sekali dan merupakan kalimat sah.';
    assert.ok(long.length > 100);
    // kalimat sah di akhir yang panjangnya > 100 char tidak boleh dipotong
    const content = 'Pembuka.\n\n' + long;
    assert.equal(stripAtmoPromoFooter(content), content);
  });
  check('footer: tanpa promo -> tidak berubah', () =>
    assert.equal(stripAtmoPromoFooter('Selesai.'), 'Selesai.'));
}

// ---------------------------------------------------------------------------
// Stub fetch per host untuk skenario end-to-end
// ---------------------------------------------------------------------------
function hostOf(url) {
  if (url.includes('generativelanguage.googleapis.com/v1beta/openai')) return 'geminiOai';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (url.includes('api.river.ai')) return 'river';
  if (url.includes('inference.dahl.global')) return 'dahl';
  if (url.includes('api.atria-asi.ai')) return 'atria';
  if (url.includes('api.zyrouter.com')) return 'zyrouter';
  if (url.includes('atmorouter.dev')) return 'atmo';
  return 'unknown';
}
const jsonOk = (payload) => ({
  ok: true, status: 200,
  headers: { get: () => 'application/json' },
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});
const httpFail = (status) => ({
  ok: false, status,
  headers: { get: () => 'application/json' },
  json: async () => ({}),
  text: async () => 'stub-fail',
});

// ---------------------------------------------------------------------------
// 3. End-to-end: ZyRouter membalas SSE (mode vision kini selamat —
//    ZyRouter hanya tersisa di rantai vision sejak spesifikasi final
//    2026-11-22 01:37; mekanisme toleransi SSE di callOAI tidak
//    bergantung pada provider)
// ---------------------------------------------------------------------------
{
  process.env.ZYROUTER_API_KEY = 'dummy-zyrouter';
  let lastZyrouterBody = null;
  const sseBody = [
    'data: {"choices":[{"delta":{"content":"BAST "}}]}',
    'data: {"choices":[{"delta":{"content":"selesai dibuat."}}]}',
    'data: [DONE]',
  ].join('\n');
  global.fetch = async (url, opts) => {
    const host = hostOf(String(url));
    if (host === 'zyrouter') {
      lastZyrouterBody = JSON.parse(opts.body);
      return {
        ok: true, status: 200,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
        json: async () => { throw new SyntaxError('Unexpected token \'d\', "data: {"id"... is not valid JSON'); },
        text: async () => sseBody,
      };
    }
    return httpFail(500);
  };
  const r = await executeAI({ message: 'buat bast', mode: 'vision', imageDataBase64: 'AAAA', imageMimeType: 'image/png' });
  check('sse e2e vision: ok via zyrouter', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'zyrouter');
  });
  check('sse e2e vision: konten delta tergabung utuh', () =>
    assert.equal(r.content, 'BAST selesai dibuat.'));
  check('sse e2e: payload meminta stream:false', () =>
    assert.equal(lastZyrouterBody.stream, false));
  delete process.env.ZYROUTER_API_KEY;
}

// ---------------------------------------------------------------------------
// 4. Anggaran provider: 429 tidak membakar banyak percobaan di provider sama
// ---------------------------------------------------------------------------
{
  // Chat: 4 key River, semuanya 429 -> hanya 2 attempt river-flash yang
  // tercatat (cap model-aware: 1 model -> cap 2), lalu failover keluar
  // dari provider itu. (Dulu: Gemini cap 2 — Gemini dicabut 2026-11-22.)
  for (let i = 1; i <= 4; i++) process.env['RIVER_API_KEY_' + i] = 'dummy-r' + i;
  global.fetch = async () => httpFail(429);
  const r = await executeAI({ message: 'halo', mode: 'chat' });
  check('budget: chat all-429 ok=false', () => assert.equal(r.ok, false));
  check('budget: river-flash dibatasi 2 attempt walau 4 key tersedia', () =>
    assert.equal(r.attempts.filter((a) => a.provider === 'river-flash').length, 2));
  for (let i = 1; i <= 4; i++) delete process.env['RIVER_API_KEY_' + i];

  // Advanced: 3 key Atmo, 3 model, semuanya 429 -> cap model-aware
  // max(2, 3 model) = 3 membatasi total attempt Atmo menjadi 5
  // (cx k0, cx k1, cx k2 — tries 2 < cap 3 saat k2 — lalu ag k0 + mv k0
  // sebagai model yang belum dicoba) — BUKAN 9 (3 key x 3 model).
  process.env.ATMO_API_KEY = 'dummy-atmo';
  process.env.ATMO_API_KEY_1 = 'dummy-atmo-1';
  process.env.ATMO_API_KEY_2 = 'dummy-atmo-2';
  global.fetch = async () => httpFail(429);
  const ra = await executeAI({ message: 'halo', mode: 'advanced' });
  check('budget: advanced all-429 ok=false', () => assert.equal(ra.ok, false));
  check('budget: atmo 3 key x 3 model dibatasi 5 attempt (cap model-aware)', () => {
    assert.equal(ra.attempts.length, 5);
    assert.deepEqual(ra.attempts.map((a) => a.model), [
      'cx/gpt-6-luna', 'cx/gpt-6-luna', 'cx/gpt-6-luna', 'ag/gemini-3.8-flash-high', 'mv/mistral-medium-3-5',
    ]);
  });
  delete process.env.ATMO_API_KEY;
  delete process.env.ATMO_API_KEY_1;
  delete process.env.ATMO_API_KEY_2;

  // Chat: Atmo zai/glm-5.3-flash adalah kaki TERAKHIR rantai chat
  // (spesifikasi final 2026-11-22 01:37 — dulu Atria cadangan terakhir).
  process.env.CROWN_API_KEY = 'dummy-crown';
  process.env.RIVER_API_KEY_1 = 'dummy-river';
  process.env.ATMO_API_KEY = 'dummy-atmo';
  global.fetch = async () => httpFail(500);
  const rc = await executeAI({ message: 'halo', mode: 'chat' });
  check('budget: chat all-fail ok=false', () => assert.equal(rc.ok, false));
  check('budget: atmo zai berada di urutan paling akhir rantai chat', () => {
    const seqProviders = rc.attempts.map((a) => a.provider);
    assert.equal(seqProviders[seqProviders.length - 1], 'atmorouter');
    assert.equal(rc.attempts[rc.attempts.length - 1].model, 'zai/glm-5.3-flash');
    assert.equal(seqProviders[0], 'crown'); // crown kaki pertama rantai chat
  });
  delete process.env.CROWN_API_KEY;
  delete process.env.RIVER_API_KEY_1;
  delete process.env.ATMO_API_KEY;
}

// ---------------------------------------------------------------------------
// 5. End-to-end: footer promo AtmoRouter tersaring sebelum ke klien
// ---------------------------------------------------------------------------
{
  process.env.ATMO_API_KEY = 'dummy-atmo';
  global.fetch = async (url) => {
    if (hostOf(String(url)) === 'atmo') {
      return jsonOk({
        choices: [{ message: { content: 'Hasil analisis selesai.\n\n---\nPowered by AtmoRouter' } }],
        usage: {},
      });
    }
    return httpFail(500);
  };
  const r = await executeAI({ message: 'analisis', mode: 'advanced' });
  check('promo e2e: ok via atmorouter', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'atmorouter');
  });
  check('promo e2e: footer promo hilang dari konten', () =>
    assert.equal(r.content, 'Hasil analisis selesai.'));
  delete process.env.ATMO_API_KEY;
}

console.log(`\ngatewayF7: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
