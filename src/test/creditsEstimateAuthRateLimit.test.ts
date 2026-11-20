// Suite: G4 + G5 (Phase B, 2026-11-20) — auth & rate limit handler kredit
// dan undangan, diuji LEVEL HANDLER (tanpa panggilan live):
//   (a) POST /api/credits/estimate tanpa auth → 401; panggilan
//       terautentikasi lolos auth → 200 + estimasi.
//   (b) Rate limit 429 sesudah batas terlampaui pada keempat handler:
//       estimate (30/mnt per pengguna), usage (30/mnt per pengguna),
//       dispatcher credits (60/mnt per IP), dispatcher invitations
//       (30/mnt per IP).
//
// Auth terautentikasi diuji lewat server stub Supabase Auth LOKAL
// (127.0.0.1, port ephemeral): stub hanya melayani GET /auth/v1/user
// (token `jwt-<id>` → pengguna terverifikasi, `jwt-anon-<id>` →
// pengguna demo) dan menjawab 500 untuk semua jalur lain — tidak ada
// panggilan jaringan eksternal. Karena stub tidak mengimplementasikan
// PostgREST, panggilan usage/balance yang LOLOS auth + rate limit
// berakhir 503 CREDITS_BACKEND_UNAVAILABLE (repo melempar saat query);
// itu BUKTI mereka lolos kedua pagar — yang diassert adalah 429 pada
// panggilan ke-(batas+1).
// Jalankan dari root repo: npx --yes tsx src/test/creditsEstimateAuthRateLimit.test.ts

import { createServer } from 'node:http';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// --- Stub Supabase Auth (lokal; tanpa jaringan eksternal) -----------------
const stub = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+jwt-(anon-)?([\w-]+)$/i);
    if (!m) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ msg: 'Invalid token' }));
      return;
    }
    const id = m[2];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id,
      email: `${id}@stub.local`,
      is_anonymous: Boolean(m[1]),
      aud: 'authenticated',
      role: 'authenticated',
    }));
    return;
  }
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'stub_unimplemented' }));
});
await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
const stubPort = (stub.address() as { port: number }).port;

// --- Env: dibersihkan dulu agar hasil deterministik -----------------------
const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'AI_GATEWAY_TOKEN', 'AI_ALLOW_ANONYMOUS', 'VERCEL_ENV', 'APP_ENV',
];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }

function mockRes() {
  const res: any = {
    statusCode: 0,
    payload: null as any,
    headers: {} as Record<string, string>,
    status(code: number) { res.statusCode = code; return res; },
    json(obj: unknown) { res.payload = obj; return res; },
    end() { return res; },
    setHeader(k: string, v: string) { res.headers[k] = v; return res; },
  };
  return res;
}
function mockReq(opts: {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  ip?: string;
}) {
  return {
    method: opts.method || 'GET',
    headers: { ...(opts.ip ? { 'x-real-ip': opts.ip } : {}), ...(opts.headers || {}) },
    query: { ...(opts.query || {}) },
    body: opts.body,
    socket: { remoteAddress: opts.ip || '127.0.0.1' },
  } as any;
}
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// Handler diimpor DINAMIS sesudah env skenario A diset (pola
// creditsActionHandler.test.ts); modul tidak membaca env saat impor.
// @ts-ignore — plain JS server modules
const estimateHandler = (await import('../../api/credits/estimate.js')).default;

console.log('=== G4: estimate — tanpa Supabase, token layanan saja ===');
{
  process.env.AI_GATEWAY_TOKEN = 'svc-token';
  const res = mockRes();
  await estimateHandler(mockReq({
    method: 'POST', ip: '10.1.1.1',
    headers: { 'x-ezrab-api-token': 'svc-token' },
    body: { feature: 'chat-ai/fast' },
  }), res);
  check('token layanan valid TANPA identitas → 401 (R-01: tidak ada identitas bersama)',
    res.statusCode === 401 && res.payload?.errorCode === 'AUTH_REQUIRED', res.payload);
}
{
  const res = mockRes();
  await estimateHandler(mockReq({ method: 'POST', ip: '10.1.1.1', body: { feature: 'chat-ai/fast' } }), res);
  check('tanpa token saat token ditegakkan → 401 fail-closed',
    res.statusCode === 401 && res.payload?.errorCode === 'AUTH_REQUIRED', res.payload);
}
{
  delete process.env.AI_GATEWAY_TOKEN;
  const res = mockRes();
  await estimateHandler(mockReq({ method: 'POST', ip: '10.1.1.1', body: { feature: 'chat-ai/fast' } }), res);
  check('mode degraded (tanpa Supabase, tanpa token) → 401, bukan lolos anonim',
    res.statusCode === 401 && res.payload?.errorCode === 'AUTH_REQUIRED', res.payload);
}

// --- Skenario B: Supabase stub (JWT terverifikasi) -------------------------
process.env.SUPABASE_URL = `http://127.0.0.1:${stubPort}`;
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
// Service key membuat getBillingRepository()/getInvitationRepository()
// mengembalikan repo (klien menunjuk stub) — query PostgREST-nya gagal
// 500 di stub, sehingga handler yang lolos auth menjawab 503 jujur.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
// @ts-ignore — plain JS server modules
const creditsHandler = (await import('../../api/credits/[action].js')).default;
// @ts-ignore — plain JS server modules
const usageHandler = (await import('../../api/credits/usage.js')).default;
// @ts-ignore — plain JS server modules
const invitationsHandler = (await import('../../api/invitations/[action].js')).default;

console.log('=== G4: estimate — JWT stub ===');
{
  const res = mockRes();
  await estimateHandler(mockReq({ method: 'POST', ip: '10.2.2.1', body: { feature: 'chat-ai/fast' } }), res);
  check('JWT mode: tanpa token → 401 missing_token',
    res.statusCode === 401 && res.payload?.errorCode === 'AUTH_REQUIRED', res.payload);
}
{
  const res = mockRes();
  await estimateHandler(mockReq({
    method: 'POST', ip: '10.2.2.1', headers: bearer('token-salah'), body: { feature: 'chat-ai/fast' },
  }), res);
  check('JWT mode: token tidak valid → 401 invalid_token',
    res.statusCode === 401 && res.payload?.errorCode === 'AUTH_REQUIRED', res.payload);
}
{
  const res = mockRes();
  await estimateHandler(mockReq({
    method: 'POST', ip: '10.2.2.1', headers: bearer('jwt-anon-demo-1'), body: { feature: 'chat-ai/fast' },
  }), res);
  check('pengguna demo (anonymous) → 403 DEMO_RESTRICTED',
    res.statusCode === 403 && res.payload?.errorCode === 'DEMO_RESTRICTED', res.payload);
}

console.log('=== G4+G5: estimate — terautentikasi 200, lalu 429 di panggilan ke-31 ===');
{
  const codes: number[] = [];
  let firstPayload: any = null;
  for (let i = 0; i < 31; i++) {
    const res = mockRes();
    await estimateHandler(mockReq({
      method: 'POST', ip: '10.2.2.2', headers: bearer('jwt-est-1'), body: { feature: 'chat-ai/fast' },
    }), res);
    if (i === 0) firstPayload = res.payload;
    codes.push(res.statusCode);
  }
  check('panggilan terautentikasi pertama → 200 + estimasi chat-ai/fast = 20',
    codes[0] === 200 && firstPayload?.success === true && firstPayload?.estimate === 20
    && firstPayload?.simulated === false, firstPayload);
  check('panggilan 1–30 terautentikasi → semua 200 (belum kena limit)',
    codes.slice(0, 30).every((c) => c === 200), codes);
  const last = mockRes();
  await estimateHandler(mockReq({
    method: 'POST', ip: '10.2.2.2', headers: bearer('jwt-est-1'), body: { feature: 'chat-ai/fast' },
  }), last);
  check('panggilan ke-32 pengguna sama → 429 RATE_LIMITED + retryAfterMs',
    last.statusCode === 429 && last.payload?.errorCode === 'RATE_LIMITED'
    && typeof last.payload?.retryAfterMs === 'number', last.payload);
  check('panggilan ke-31 (indeks 30) → 429', codes[30] === 429, codes);
}
{
  const res = mockRes();
  await estimateHandler(mockReq({
    method: 'POST', ip: '10.2.2.2', headers: bearer('jwt-est-2'), body: { feature: 'ded-ai/complex' },
  }), res);
  check('pengguna LAIN dari IP sama → 200 (bucket per pengguna, bukan per IP)',
    res.statusCode === 200 && res.payload?.estimate === 800, res.payload);
}

console.log('=== G5: usage — 30× lolos (503 backend stub), lalu 429 ===');
{
  const codes: number[] = [];
  let firstPayload: any = null;
  for (let i = 0; i < 31; i++) {
    const res = mockRes();
    await usageHandler(mockReq({
      method: 'GET', ip: '10.3.3.1', headers: bearer('jwt-use-1'), query: {},
    }), res);
    if (i === 0) firstPayload = res.payload;
    codes.push(res.statusCode);
  }
  check('panggilan 1–30 → 503 CREDITS_BACKEND_UNAVAILABLE (lolos auth + rate limit, query stub gagal)',
    codes.slice(0, 30).every((c) => c === 503)
    && firstPayload?.error === 'CREDITS_BACKEND_UNAVAILABLE', firstPayload);
  const last = mockRes();
  await usageHandler(mockReq({
    method: 'GET', ip: '10.3.3.1', headers: bearer('jwt-use-1'), query: {},
  }), last);
  check('panggilan ke-32 pengguna sama → 429 RATE_LIMITED',
    last.statusCode === 429 && last.payload?.errorCode === 'RATE_LIMITED', last.payload);
  check('panggilan ke-31 (indeks 30) → 429', codes[30] === 429, codes);
}

console.log('=== G5: dispatcher credits — 60× lolos, lalu 429 ===');
{
  const codes: number[] = [];
  let firstPayload: any = null;
  for (let i = 0; i < 61; i++) {
    const res = mockRes();
    await creditsHandler(mockReq({
      method: 'GET', ip: '10.4.4.1', headers: bearer('jwt-bal-1'), query: { action: 'balance' },
    }), res);
    if (i === 0) firstPayload = res.payload;
    codes.push(res.statusCode);
  }
  check('panggilan 1–60 (balance) → 503 CREDITS_BACKEND_UNAVAILABLE (lolos dispatcher limit + auth)',
    codes.slice(0, 60).every((c) => c === 503)
    && firstPayload?.error === 'CREDITS_BACKEND_UNAVAILABLE', firstPayload);
  check('panggilan ke-61 → 429 RATE_LIMITED + retryAfterMs',
    codes[60] === 429, codes);
  const probe = mockRes();
  await creditsHandler(mockReq({
    method: 'GET', ip: '10.4.4.1', headers: bearer('jwt-bal-1'), query: { action: 'balance' },
  }), probe);
  check('panggilan ke-62 membawa errorCode RATE_LIMITED',
    probe.statusCode === 429 && probe.payload?.errorCode === 'RATE_LIMITED'
    && typeof probe.payload?.retryAfterMs === 'number', probe.payload);
}
{
  const res = mockRes();
  await creditsHandler(mockReq({
    method: 'GET', ip: '10.4.4.9', headers: bearer('jwt-bal-1'), query: { action: 'balance' },
  }), res);
  check('IP LAIN → lolos dispatcher limit (bucket per IP)',
    res.statusCode === 503, res.payload);
}

console.log('=== G5: dispatcher invitations — 30× lolos, lalu 429 ===');
{
  const codes: number[] = [];
  for (let i = 0; i < 31; i++) {
    const res = mockRes();
    await invitationsHandler(mockReq({
      method: 'GET', ip: '10.5.5.1', query: { action: 'list' },
    }), res);
    codes.push(res.statusCode);
  }
  check('panggilan 1–30 (list tanpa auth) → 401 AUTH_REQUIRED (lolos dispatcher limit)',
    codes.slice(0, 30).every((c) => c === 401), codes);
  check('panggilan ke-31 → 429 TOO_MANY_ATTEMPTS (bentuk 429 keluarga invitations)',
    codes[30] === 429, codes);
  const probe = mockRes();
  await invitationsHandler(mockReq({
    method: 'GET', ip: '10.5.5.1', query: { action: 'list' },
  }), probe);
  check('panggilan ke-32 membawa error TOO_MANY_ATTEMPTS',
    probe.statusCode === 429 && probe.payload?.error === 'TOO_MANY_ATTEMPTS', probe.payload);
}
{
  const codes: number[] = [];
  for (let i = 0; i < 31; i++) {
    const res = mockRes();
    await invitationsHandler(mockReq({
      method: 'GET', ip: '10.5.5.2', query: { action: 'tidak-ada' },
    }), res);
    codes.push(res.statusCode);
  }
  check('aksi tak dikenal 1–30 → 404 (limit dihitung SEBELUM dispatch)',
    codes.slice(0, 30).every((c) => c === 404), codes);
  check('aksi tak dikenal ke-31 → 429 (probing ikut dibatasi)',
    codes[30] === 429, codes);
}

// --- Bersih-bersih ----------------------------------------------------------
await new Promise<void>((resolve) => stub.close(() => resolve()));
for (const k of ENV_KEYS) {
  if (savedEnv[k] === undefined) delete process.env[k];
  else process.env[k] = savedEnv[k];
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
