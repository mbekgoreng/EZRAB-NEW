/**
 * Tests: Temporary dashboard access gate — SERVER-SIDE design.
 *
 * Supersedes the original client-side passcode tests: the code no longer
 * exists in the client at all, so there is nothing client-side to verify
 * except redirect sanitizing. Everything else is tested against the real
 * server artefacts with DUMMY env values (never the production code):
 *
 *   api/_lib/accessGate.js   — token sign/verify, cookie, code compare
 *   api/access/verify.js     — POST endpoint (mock req/res)
 *   api/access/session.js    — GET endpoint (mock req/res)
 *   middleware.ts            — Edge gate decisions (real Request objects)
 *
 * Run: npx tsx src/test/passcodeGate.test.ts
 */
import assert from 'node:assert/strict';

// Dummy configuration for tests ONLY.
process.env.EZRAB_ACCESS_CODE = '7355';
process.env.EZRAB_ACCESS_SESSION_SECRET = 'test-secret-min-16-chars-long';

const {
  createSessionToken,
  verifySessionToken,
  accessCodeMatches,
  getAccessConfig,
  buildSessionCookie,
  parseCookies,
  ACCESS_SESSION_TTL_SECONDS,
  // @ts-ignore — plain JS server module
} = await import('../../api/_lib/accessGate.js');
// @ts-ignore — plain JS server module
const verifyHandler = (await import('../../api/access/verify.js')).default;
// @ts-ignore — plain JS server module
const sessionHandler = (await import('../../api/access/session.js')).default;
// @ts-ignore — Edge middleware (Web APIs only)
const middleware = (await import('../../middleware')).default;
const { sanitizeNextPath } = await import('../auth/passcode');

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

function mockRes() {
  return {
    statusCode: 0,
    body: null as any,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(c: number) { this.statusCode = c; return this; },
    json(o: any) { this.body = o; return this; },
    end() { return this; },
  };
}
function mockReq(opts: { ip: string; body?: any; cookie?: string; proto?: string }) {
  return {
    method: 'POST',
    headers: {
      'x-forwarded-for': opts.ip,
      'x-forwarded-proto': opts.proto || 'https',
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body,
    socket: { remoteAddress: opts.ip },
  } as any;
}

console.log('accessGate (server-side) tests');

await check('token: round-trip valid + membawa expiry TTL', () => {
  const token = createSessionToken(process.env.EZRAB_ACCESS_SESSION_SECRET!);
  const v = verifySessionToken(process.env.EZRAB_ACCESS_SESSION_SECRET!, token);
  assert.equal(v.valid, true);
  const exp = Number(token.split('.')[1]);
  const ttl = exp - Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(ttl - ACCESS_SESSION_TTL_SECONDS) <= 2, `ttl=${ttl}`);
});

await check('token: tanda tangan dipalsukan -> ditolak', () => {
  const token = createSessionToken(process.env.EZRAB_ACCESS_SESSION_SECRET!);
  const forged = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
  assert.equal(verifySessionToken(process.env.EZRAB_ACCESS_SESSION_SECRET!, forged).valid, false);
  const otherSecret = createSessionToken('secret-lain-sama-sekali-16');
  assert.equal(verifySessionToken(process.env.EZRAB_ACCESS_SESSION_SECRET!, otherSecret).valid, false);
});

await check('token: kedaluwarsa -> ditolak', () => {
  const past = createSessionToken(process.env.EZRAB_ACCESS_SESSION_SECRET!, Date.now() - (ACCESS_SESSION_TTL_SECONDS + 60) * 1000);
  const v = verifySessionToken(process.env.EZRAB_ACCESS_SESSION_SECRET!, past);
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'expired');
});

await check('kode: perbandingan eksak + cookie aman', () => {
  assert.equal(accessCodeMatches('7355', '7355'), true);
  assert.equal(accessCodeMatches('7355', '7356'), false);
  assert.equal(accessCodeMatches('7355', ''), false);
  const cookie = buildSessionCookie('v1.1.sig', mockReq({ ip: '1.1.1.1' }));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, new RegExp(`Max-Age=${ACCESS_SESSION_TTL_SECONDS}`));
  assert.deepEqual(parseCookies('a=1; ezrab_access=v1.2.x; b=2').ezrab_access, 'v1.2.x');
});

let sessionCookie = '';
await check('verify endpoint: kode salah -> 401 tanpa cookie', async () => {
  const res = mockRes();
  await verifyHandler(mockReq({ ip: '10.0.0.1', body: { code: '0000' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

await check('verify endpoint: kode benar -> 200 + Set-Cookie sesi', async () => {
  const res = mockRes();
  await verifyHandler(mockReq({ ip: '10.0.0.2', body: { code: '7355' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.match(res.headers['Set-Cookie'], /^ezrab_access=/);
  assert.match(res.headers['Set-Cookie'], /HttpOnly/);
  sessionCookie = res.headers['Set-Cookie'].split(';')[0];
});

await check('session endpoint: cookie valid -> active; tanpa cookie -> tidak aktif', async () => {
  const resA = mockRes();
  await sessionHandler({ method: 'GET', headers: { cookie: sessionCookie } } as any, resA);
  assert.equal(resA.body.active, true);
  const resB = mockRes();
  await sessionHandler({ method: 'GET', headers: {} } as any, resB);
  assert.equal(resB.body.active, false);
  assert.equal(resB.body.configured, true);
});

await check('verify endpoint: percobaan berulang dibatasi (429)', async () => {
  let last = 0;
  for (let i = 0; i < 11; i++) {
    const res = mockRes();
    await verifyHandler(mockReq({ ip: '10.0.0.99', body: { code: '0000' } }), res);
    last = res.statusCode;
  }
  assert.equal(last, 429);
});

await check('middleware: /app/* tanpa sesi -> redirect ke /access?next=', async () => {
  const out = await middleware(new Request('https://ezrab.site/app/dashboard'));
  assert.ok(out instanceof Response);
  assert.equal(out.status, 307);
  const loc = out.headers.get('location') || '';
  assert.ok(loc.includes('/access'), loc);
  assert.ok(decodeURIComponent(loc).includes('next=/app/dashboard'), loc);
});

await check('middleware: API sensitif tanpa sesi -> 401; dengan sesi -> lolos', async () => {
  const denied = await middleware(new Request('https://ezrab.site/api/credits/balance'));
  assert.ok(denied instanceof Response);
  assert.equal(denied.status, 401);
  const allowed = await middleware(new Request('https://ezrab.site/api/credits/balance', { headers: { cookie: sessionCookie } }));
  assert.equal(allowed, undefined);
  const dash = await middleware(new Request('https://ezrab.site/app/dashboard', { headers: { cookie: sessionCookie } }));
  assert.equal(dash, undefined);
});

await check('middleware: cookie dipalsukan -> tetap ditolak', async () => {
  const forged = 'ezrab_access=v1.9999999999.forgedsignaturevalue00000000000000000000000000';
  const out = await middleware(new Request('https://ezrab.site/api/ai/chat', { headers: { cookie: forged } }));
  assert.ok(out instanceof Response);
  assert.equal(out.status, 401);
});

await check('middleware: /access tanpa sesi lolos (tanpa loop); dengan sesi -> dashboard', async () => {
  const gate = await middleware(new Request('https://ezrab.site/access'));
  assert.equal(gate, undefined);
  const bounced = await middleware(new Request('https://ezrab.site/access', { headers: { cookie: sessionCookie } }));
  assert.ok(bounced instanceof Response);
  assert.equal(bounced.status, 307);
  assert.ok((bounced.headers.get('location') || '').includes('/app/dashboard'));
});

await check('middleware: health check publik tetap terbuka', async () => {
  const out = await middleware(new Request('https://ezrab.site/api/ai/engine-status'));
  assert.equal(out, undefined);
});

await check('middleware: endpoint gerbang sendiri tidak pernah digerbang (anti-lockout)', async () => {
  const verify = await middleware(new Request('https://ezrab.site/api/access/verify'));
  assert.equal(verify, undefined);
  const session = await middleware(new Request('https://ezrab.site/api/access/session'));
  assert.equal(session, undefined);
});

await check('client: sanitizeNextPath hanya menerima path /app', () => {
  assert.equal(sanitizeNextPath('/app/projects'), '/app/projects');
  assert.equal(sanitizeNextPath('https://evil.example/app'), '/app/dashboard');
  assert.equal(sanitizeNextPath('//evil.example'), '/app/dashboard');
  assert.equal(sanitizeNextPath('%2F%2Fevil.example'), '/app/dashboard');
  assert.equal(sanitizeNextPath('/fitur'), '/app/dashboard');
  assert.equal(sanitizeNextPath(null), '/app/dashboard');
});

await check('konfigurasi: env hilang -> fail closed', () => {
  const cfg = getAccessConfig({} as any);
  assert.equal(cfg.configured, false);
});

console.log(`\n${passed} checks passed`);
