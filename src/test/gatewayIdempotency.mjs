/**
 * gatewayIdempotency.mjs — tindak lanjut SEC-FIND-4: gateway menghormati
 * header Idempotency-Key klien. Respons SUKSES pertama disimpan di peta
 * memori TTL pendek; pengiriman ulang dengan kunci sama (retry/kirim ulang)
 * menerima respons yang sama TANPA memanggil provider lagi. Kegagalan TIDAK
 * disimpan (boleh dicoba ulang). Kunci ter-scope ke identitas pemanggil
 * (di sini: hash IP mode degraded) sehingga tidak lintas pengguna.
 * Fetch di-stub; tidak ada jaringan, tidak ada key asli.
 * Run: node src/test/gatewayIdempotency.mjs
 */
import { handleAiRequest } from '../../api/_lib/aiGateway.js';

for (let i = 1; i <= 6; i++) delete process.env['GEMINI_API_KEY_' + i];
for (let i = 1; i <= 10; i++) delete process.env['RIVER_API_KEY_' + i];
for (let i = 1; i <= 14; i++) delete process.env['ATRIA_API_KEY_' + i];
delete process.env.ATMO_API_KEY;
delete process.env.ZYROUTER_API_KEY;
delete process.env.AI_GATEWAY_TOKEN;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
process.env.GEMINI_API_KEY_1 = 'dummy-idem-key';

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assert'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

function mockReq({ headers = {}, body, ip = '10.0.0.7' } = {}) {
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

let fetchCalls = 0;
let upstreamOk = true;
globalThis.fetch = async () => {
  fetchCalls++;
  if (!upstreamOk) return { ok: false, status: 500, json: async () => ({}) };
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'halo dari AI' }] } }] }),
  };
};

const body = { message: 'berapa harga semen?', mode: 'fast' };

let firstRequestId = null;
await test('1: kunci sama dua kali -> provider hanya dipanggil sekali, respons identik', async () => {
  fetchCalls = 0;
  const h = { 'idempotency-key': 'idem-key-alpha' };
  const r1 = mockRes();
  await handleAiRequest(mockReq({ headers: h, body }), r1);
  eq(r1.statusCode, 200, 'respons pertama');
  firstRequestId = r1.body.requestId;
  const r2 = mockRes();
  await handleAiRequest(mockReq({ headers: h, body }), r2);
  eq(r2.statusCode, 200, 'respons replay');
  eq(r2.body.requestId, firstRequestId, 'requestId replay harus sama dengan aslinya');
  eq(r2.body.content, 'halo dari AI', 'konten replay');
  eq(fetchCalls, 1, 'provider tidak boleh dipanggil lagi pada replay');
});

await test('2: kunci berbeda -> provider dipanggil lagi', async () => {
  const r = mockRes();
  await handleAiRequest(mockReq({ headers: { 'idempotency-key': 'idem-key-beta' }, body }), r);
  eq(r.statusCode, 200);
  eq(fetchCalls, 2, 'kunci baru harus mengeksekusi ulang');
});

await test('3: tanpa kunci -> perilaku lama (selalu eksekusi)', async () => {
  const r = mockRes();
  await handleAiRequest(mockReq({ body }), r);
  eq(r.statusCode, 200);
  eq(fetchCalls, 3, 'tanpa kunci tidak ada deduplikasi');
});

await test('4: kegagalan (502) TIDAK disimpan — retry dengan kunci sama mengeksekusi ulang', async () => {
  const h = { 'idempotency-key': 'idem-key-gagal' };
  upstreamOk = false;
  const r1 = mockRes();
  await handleAiRequest(mockReq({ headers: h, body }), r1);
  eq(r1.statusCode, 502, 'upstream gagal harus 502');
  const callsAfterFail = fetchCalls;
  upstreamOk = true;
  const r2 = mockRes();
  await handleAiRequest(mockReq({ headers: h, body }), r2);
  eq(r2.statusCode, 200, 'retry sesudah gagal harus berhasil');
  ok(fetchCalls > callsAfterFail, 'retry harus memanggil provider lagi (kegagalan tidak di-cache)');
});

await test('5: kunci sama dari identitas berbeda (IP lain) -> TIDAK menerima replay orang lain', async () => {
  const before = fetchCalls;
  const r = mockRes();
  await handleAiRequest(
    mockReq({ headers: { 'idempotency-key': 'idem-key-alpha' }, body, ip: '10.0.0.99' }),
    r
  );
  eq(r.statusCode, 200);
  ok(fetchCalls > before, 'identitas berbeda harus mengeksekusi sendiri');
  ok(r.body.requestId !== firstRequestId, 'requestId identitas lain harus berbeda');
});

console.log(failures === 0 ? '\nGATEWAY IDEMPOTENCY DONE (semua cek lulus)' : `\n${failures} FAIL`);
process.exit(failures ? 1 : 0);
