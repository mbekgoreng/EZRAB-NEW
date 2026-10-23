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
// 3. End-to-end: ZyRouter membalas SSE (mode chat & advanced kini selamat)
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
  const r = await executeAI({ message: 'buat bast', mode: 'chat' });
  check('sse e2e chat: ok via zyrouter', () => {
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'zyrouter');
  });
  check('sse e2e chat: konten delta tergabung utuh', () =>
    assert.equal(r.content, 'BAST selesai dibuat.'));
  check('sse e2e: payload meminta stream:false', () =>
    assert.equal(lastZyrouterBody.stream, false));
  delete process.env.ZYROUTER_API_KEY;
}

// ---------------------------------------------------------------------------
// 4. Anggaran provider: 429 tidak membakar banyak percobaan di provider sama
// ---------------------------------------------------------------------------
{
  // Fast: 4 key Gemini, semuanya 429 -> hanya 2 attempt Gemini yang tercatat
  // (1 awal + 1 ulang), lalu failover keluar dari provider itu.
  for (let i = 1; i <= 4; i++) process.env['GEMINI_API_KEY_' + i] = 'dummy-g' + i;
  global.fetch = async () => httpFail(429);
  const r = await executeAI({ message: 'halo', mode: 'fast' });
  check('budget: fast all-429 ok=false', () => assert.equal(r.ok, false));
  check('budget: gemini dibatasi 2 attempt walau 4 key tersedia', () =>
    assert.equal(r.attempts.filter((a) => a.provider === 'gemini').length, 2));
  for (let i = 1; i <= 4; i++) delete process.env['GEMINI_API_KEY_' + i];

  // Chat: Atria kini cadangan terakhir dengan SATU attempt walau 3 key ada.
  process.env.ZYROUTER_API_KEY = 'dummy-zyrouter';
  for (let i = 1; i <= 3; i++) process.env['ATRIA_API_KEY_' + i] = 'dummy-a' + i;
  global.fetch = async (url) => httpFail(hostOf(String(url)) === 'atria' ? 429 : 500);
  const rc = await executeAI({ message: 'halo', mode: 'chat' });
  check('budget: chat all-fail ok=false', () => assert.equal(rc.ok, false));
  check('budget: atria tepat 1 attempt (cadangan terakhir, 1 key)', () =>
    assert.equal(rc.attempts.filter((a) => a.provider === 'atria').length, 1));
  check('budget: atria berada di urutan paling akhir rantai chat', () => {
    const seqProviders = rc.attempts.map((a) => a.provider);
    assert.equal(seqProviders[seqProviders.length - 1], 'atria');
    assert.equal(seqProviders[0], 'zyrouter'); // gemini/atmo tanpa key -> zyrouter pertama yang dicoba
  });
  delete process.env.ZYROUTER_API_KEY;
  for (let i = 1; i <= 3; i++) delete process.env['ATRIA_API_KEY_' + i];
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
