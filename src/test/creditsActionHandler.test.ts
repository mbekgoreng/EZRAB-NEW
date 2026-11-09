// Suite: Handler api/credits/[action].js — routing aksi, perilaku balance
// yang TIDAK berubah dari balance.js lama (503 CREDITS_NOT_CONFIGURED),
// dan gerbang 503 jujur untuk aksi billing selama env server belum lengkap.
// Env dibersihkan di awal suite agar hasil deterministik di mesin mana pun.
// Jalankan dari root repo: npx --yes tsx src/test/creditsActionHandler.test.ts

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const ENV_KEYS = [
  'MIDTRANS_SERVER_KEY', 'MIDTRANS_IS_PRODUCTION',
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'CREDITS_DB_CONFIGURED',
];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) {
  savedEnv[k] = process.env[k];
  delete process.env[k];
}

const handler = (await import('../../api/credits/[action].js')).default;

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
function mockReq(opts: { method?: string; action?: string; query?: Record<string, string>; body?: unknown }) {
  return {
    method: opts.method || 'GET',
    headers: {},
    query: { ...(opts.query || {}), ...(opts.action ? { action: opts.action } : {}) },
    body: opts.body,
  } as any;
}

console.log('=== Routing aksi ===');
{
  const res = mockRes();
  await handler(mockReq({ action: 'tidak-ada' }), res);
  check('aksi asing → 404 NOT_FOUND', res.statusCode === 404 && res.payload?.error === 'NOT_FOUND');
}
{
  const res = mockRes();
  await handler(mockReq({}), res);
  check('tanpa aksi → 404 NOT_FOUND', res.statusCode === 404 && res.payload?.error === 'NOT_FOUND');
}

console.log('=== balance: perilaku lama persis ===');
{
  const res = mockRes();
  await handler(mockReq({ action: 'balance', method: 'GET' }), res);
  check('GET balance tanpa konfigurasi → 503 CREDITS_NOT_CONFIGURED',
    res.statusCode === 503 && res.payload?.error === 'CREDITS_NOT_CONFIGURED');
}
{
  const res = mockRes();
  await handler(mockReq({ action: 'balance', method: 'POST' }), res);
  check('POST balance → 405', res.statusCode === 405);
}

console.log('=== Aksi billing: 503 jujur selama env belum lengkap ===');
{
  const res = mockRes();
  await handler(mockReq({ action: 'checkout', method: 'POST', body: { kind: 'SUBSCRIPTION', itemId: 'starter' } }), res);
  check('checkout → 503 BILLING_NOT_CONFIGURED', res.statusCode === 503 && res.payload?.error === 'BILLING_NOT_CONFIGURED');
}
{
  const res = mockRes();
  await handler(mockReq({
    action: 'webhook', method: 'POST',
    body: { order_id: 'EZR-X', status_code: '200', gross_amount: '54999.00', transaction_status: 'settlement', signature_key: 'x' },
  }), res);
  check('webhook → 503 BILLING_NOT_CONFIGURED (belum bisa verifikasi)', res.statusCode === 503 && res.payload?.error === 'BILLING_NOT_CONFIGURED');
}
{
  const res = mockRes();
  await handler(mockReq({ action: 'order', method: 'GET', query: { orderId: 'EZR-X' } }), res);
  check('order → 503 BILLING_NOT_CONFIGURED', res.statusCode === 503 && res.payload?.error === 'BILLING_NOT_CONFIGURED');
}
{
  const res = mockRes();
  await handler(mockReq({ action: 'subscription', method: 'GET' }), res);
  check('subscription → 503 BILLING_NOT_CONFIGURED', res.statusCode === 503 && res.payload?.error === 'BILLING_NOT_CONFIGURED');
}
{
  const res = mockRes();
  await handler(mockReq({ action: 'webhook', method: 'GET' }), res);
  check('GET webhook → 405', res.statusCode === 405);
}

for (const k of ENV_KEYS) {
  if (savedEnv[k] === undefined) delete process.env[k];
  else process.env[k] = savedEnv[k];
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
