/**
 * gatewayDisconnectAbort.test.ts — ARS-08 TERBATAS (Gelombang 2 Blok D).
 *
 * Gateway membatalkan rantai failover saat klien disconnect: fetch provider
 * yang sedang berjalan di-abort dan leg berikutnya tidak dimulai.
 *
 * HARNESS (pola Gate 6, stub di batas fetch/gateway — provider nyata 0):
 *  - Handler ASLI (api/ai/chat.js → handleAiRequest) di atas server HTTP
 *    Node NYATA (port ephemeral), dengan res ServerResponse asli + shim
 *    status()/json() gaya Vercel — agar event `res 'close'` menyala persis
 *    seperti di runtime serverless Node.
 *  - Fetch provider dialihkan ke Stub B lokal (HTTP 127.0.0.1, port
 *    ephemeral) lewat override global.fetch; host non-lokal DIBLOKIR keras.
 *  - Klien memakai node:http mentah agar disconnect = destroy socket nyata.
 *
 * Rantai mode 'chat' dengan key dummy crown+gemini+zyrouter:
 *   crown MiniMax M2.7 → crown DeepSeek V4 Flash → gemini native → zyrouter.
 * Key provider lain DIHAPUS agar rantai terpin persis 4 leg.
 *
 * Skenario:
 *  H1 disconnect di tengah leg-1 (crown hang 20 dtk) → 1 attempt, fetch
 *     di-abort, leg-2 TIDAK dimulai, tanpa respons tertulis, handler
 *     selesai < 8 dtk sesudah disconnect (bukan 20/55 dtk).
 *  H2 disconnect di tengah leg-3 (crown 500×2, gemini hang) → 3 attempt,
 *     leg-4 (zyrouter) TIDAK dimulai.
 *  H3 tanpa disconnect, failover normal (crown 500×2 → gemini valid) →
 *     200 + provider gemini + attempts identik pra-perubahan.
 *  H4 tanpa disconnect, sukses leg-1 (crown valid) → 200 + 1 attempt.
 *  H5 PROBE: `req 'close'` menyala pada request NORMAL (saat body selesai
 *     dibaca, sebelum respons terkirim) — bukti `req 'close'` BUKAN sinyal
 *     disconnect dan tidak boleh dipakai untuk abort (temuan harness Gate 6
 *     §8, diuji ulang di sini).
 *  D1 executeAI langsung, sinyal sudah aborted sebelum leg-1 → 0 attempt.
 *  D2 executeAI langsung, abort di tengah leg-1 → 1 attempt, errorClass
 *     'aborted', errorCode CLIENT_DISCONNECTED.
 *  D3 executeAI langsung tanpa sinyal (regresi): urutan failover identik.
 *  D4 executeAI langsung, sinyal ada tapi tak pernah abort → identik D3.
 *
 * Jalankan: npx tsx src/test/gatewayDisconnectAbort.test.ts
 * (ditambahkan ke baterai Gelombang 2 sebagai: run_s gatewayDisconnectAbort)
 */
import http from 'node:http';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// ENV — mode degraded terkontrol, key dummy, rantai terpin 4 leg
// ---------------------------------------------------------------------------
for (const k of Object.keys(process.env)) {
  if (/^(GEMINI|CROWN|ATMO|ZYROUTER|ZROUTER|DAHL|RIVER|ATRIA|GEMINI_OAI)/.test(k)) delete process.env[k];
}
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.AI_GATEWAY_TOKEN;
delete process.env.AI_METERING_ENABLED;
process.env.CROWN_API_KEY = 'dummy-crown';
process.env.GEMINI_API_KEY_1 = 'dummy-gemini';
process.env.ZYROUTER_API_KEY = 'dummy-zyrouter';
process.env.AI_RATE_LIMIT_PER_MIN = '1000';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    if (cond()) return;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout menunggu ${label}`);
    await sleep(25);
  }
}

// Hitung event log 'client_disconnected' dari gateway (observabilitas abort).
let disconnectEvents = 0;
const origLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const line = args.map(String).join(' ');
  if (line.includes('"event":"client_disconnected"')) disconnectEvents += 1;
  origLog(...args);
};

// ---------------------------------------------------------------------------
// STUB B — provider bentuk OpenAI-compatible / Gemini, HTTP lokal
// ---------------------------------------------------------------------------
type StubBehavior = 'valid' | 'fail-500' | 'hang';
const HANG_MS = 20000; // jauh di atas jendela abort, di bawah timeout 55 dtk
let stubBehavior: Record<string, StubBehavior> = { crown: 'valid', gemini: 'valid', zyrouter: 'valid' };
let stubReceived: Array<{ provider: string }> = [];
function setStub(b: Partial<Record<string, StubBehavior>>): void {
  stubBehavior = { crown: 'valid', gemini: 'valid', zyrouter: 'valid', ...b };
  stubReceived = [];
  fetchCalls = [];
}

function providerIdFromUrl(originalUrl: string): string {
  try {
    const u = new URL(originalUrl);
    if (u.hostname === 'generativelanguage.googleapis.com') return u.pathname.includes('/openai') ? 'gemini-oai' : 'gemini';
    if (u.hostname === 'crown.ai.id') return 'crown';
    if (u.hostname === 'api.zyrouter.com') return 'zyrouter';
    if (u.hostname === 'api.atria-asi.ai') return 'atria';
    if (u.hostname === 'inference.dahl.global') return 'dahl';
    if (u.hostname === 'api.river.ai') return 'river';
    if (u.hostname === 'atmorouter.dev') return 'atmorouter';
    return u.hostname;
  } catch {
    return 'unknown';
  }
}

function safeEnd(res: http.ServerResponse, status: number, contentType: string, body: string): void {
  try {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { 'Content-Type': contentType });
    res.end(body);
  } catch {
    /* klien (gateway) pergi — bukan kesalahan stub */
  }
}

function startStubB(): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    res.on('error', () => {});
    void (async () => {
      try {
        for await (const _c of req) { /* buang body */ }
      } catch {
        /* fetch gateway di-abort di tengah body — lanjut ke perilaku stub */
      }
      const orig = String(req.headers['x-stub-original-url'] || '');
      const providerId = providerIdFromUrl(orig);
      stubReceived.push({ provider: providerId });
      const behavior = stubBehavior[providerId] ?? 'valid';
      if (behavior === 'fail-500') {
        safeEnd(res, 500, 'application/json', JSON.stringify({ error: { message: 'stub fail' } }));
        return;
      }
      if (behavior === 'hang') await sleep(HANG_MS);
      const body =
        providerId === 'gemini'
          ? JSON.stringify({ candidates: [{ content: { parts: [{ text: 'STUB-OK-GEMINI' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 60, totalTokenCount: 160 } })
          : JSON.stringify({ choices: [{ message: { content: 'STUB-OK-' + providerId.toUpperCase() } }], usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 } });
      safeEnd(res, 200, 'application/json', body);
    })();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as any).port })));
}

// ---------------------------------------------------------------------------
// OVERRIDE FETCH — satu-satunya jembatan ke stub; host nyata DIBLOKIR keras
// ---------------------------------------------------------------------------
interface FetchCall { provider: string; url: string; aborted: boolean }
let fetchCalls: FetchCall[] = [];
const PROVIDER_BASES = [
  'https://generativelanguage.googleapis.com/v1beta',
  'https://api.zyrouter.com/v1',
  'https://api.atria-asi.ai/v1',
  'https://inference.dahl.global/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai',
  'https://api.river.ai/v1',
  'https://atmorouter.dev/v1',
  'https://crown.ai.id/v1',
];
const originalFetch = globalThis.fetch.bind(globalThis);
function installStubFetch(stubPort: number): void {
  (globalThis as any).fetch = async (input: unknown, init?: any): Promise<Response> => {
    const url = String(input as string);
    const base = PROVIDER_BASES.find((b) => url.startsWith(b));
    if (base) {
      const rec: FetchCall = { provider: providerIdFromUrl(url), url: url.split('?')[0], aborted: false };
      fetchCalls.push(rec);
      // Jejak abort: sinyal yang diteruskan gateway ke fetch — bila controller
      // attempt di-abort (disconnect), listener ini menyala.
      const sig = init?.signal;
      if (sig && typeof sig.addEventListener === 'function') {
        sig.addEventListener('abort', () => { rec.aborted = true; }, { once: true });
      }
      const headers = new Headers(init?.headers);
      headers.set('x-stub-original-url', url);
      return originalFetch(`http://127.0.0.1:${stubPort}/__stub-provider`, { ...init, headers });
    }
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return originalFetch(input as string, init as RequestInit);
    }
    throw new Error(`STUB-BLOCKED: fetch ke host non-lokal dilarang: ${url.split('?')[0]}`);
  };
}

// ---------------------------------------------------------------------------
// SERVER GATEWAY — handler ASLI di atas HTTP Node nyata
// ---------------------------------------------------------------------------
interface ReqState {
  responseWritten: boolean;
  handlerSettledAt: number | null;
  handlerError: unknown;
  reqCloseAt: number | null;
  reqCloseWritableFinished: boolean | null;
}
function freshReqState(): ReqState {
  return { responseWritten: false, handlerSettledAt: null, handlerError: null, reqCloseAt: null, reqCloseWritableFinished: null };
}
let current: ReqState = freshReqState();

function gatewayBody(): Record<string, unknown> {
  return {
    productId: 'EZRAB_AI',
    prompt: 'halo stub disconnect',
    systemPrompt: 'Anda asisten stub ARS-08.',
    jsonMode: false,
    temperature: 0.4,
    maxTokens: 3000,
    mode: 'fast',
  };
}

function postRaw(port: number, body: unknown, ip: string): { req: http.ClientRequest; done: Promise<{ status: number; body: string }> } {
  const payload = JSON.stringify(body);
  const req = http.request({
    host: '127.0.0.1', port, path: '/api/ai/chat', method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-real-ip': ip },
  });
  const done = new Promise<{ status: number; body: string }>((resolve, reject) => {
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
  req.end(payload);
  return { req, done };
}

function destroyClient(req: http.ClientRequest): void {
  try { req.destroy(); } catch { /* sudah mati */ }
  try { req.socket?.destroy(); } catch { /* sudah mati */ }
}

// ---------------------------------------------------------------------------
// RUNNER
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: any) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e?.message || e}`);
  }
}

async function main(): Promise<void> {
  console.log('== gatewayDisconnectAbort — ARS-08 TERBATAS (stub-only, provider nyata 0) ==');
  const { server: stubServer, port: stubPort } = await startStubB();
  installStubFetch(stubPort);
  const gw = await import('../../api/_lib/aiGateway.js');
  const chatHandler = (await import('../../api/ai/chat.js')).default as (req: any, res: any) => Promise<unknown>;

  const gwServer = http.createServer((req, res) => {
    res.on('error', () => {});
    const st = current;
    // PROBE H5: catat kapan `req 'close'` pertama menyala + apakah respons
    // sudah terkirim saat itu.
    req.on('close', () => {
      if (st.reqCloseAt === null) {
        st.reqCloseAt = Date.now();
        st.reqCloseWritableFinished = (res as any).writableFinished === true;
      }
    });
    // Shim gaya Vercel di atas ServerResponse ASLI (agar `res 'close'` nyata).
    (res as any).status = (c: number) => { res.statusCode = c; return res; };
    (res as any).json = (o: unknown) => {
      st.responseWritten = true;
      try {
        if (!res.writableEnded && !(res as any).destroyed) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(o));
        }
      } catch { /* klien pergi */ }
      return res;
    };
    void Promise.resolve()
      .then(() => chatHandler(req as any, res as any))
      .then(() => { st.handlerSettledAt = Date.now(); })
      .catch((e) => { st.handlerError = e; st.handlerSettledAt = Date.now(); });
  });
  const gwPort = await new Promise<number>((resolve) => gwServer.listen(0, '127.0.0.1', () => resolve((gwServer.address() as any).port)));

  const calls = () => fetchCalls.length;
  const abortedCalls = () => fetchCalls.filter((c) => c.aborted).length;

  // --- H1: disconnect di tengah leg-1 -------------------------------------
  console.log('\n-- H1 disconnect di tengah leg-1 (crown hang 20 dtk) --');
  setStub({ crown: 'hang' });
  current = freshReqState();
  const h1 = current;
  const evBeforeH1 = disconnectEvents;
  const c1 = postRaw(gwPort, gatewayBody(), '10.99.7.1');
  c1.done.catch(() => {});
  await waitFor(() => calls() === 1, 10000, 'leg-1 dimulai');
  const tDisc1 = Date.now();
  destroyClient(c1.req);
  await waitFor(() => h1.handlerSettledAt !== null, 15000, 'handler selesai sesudah disconnect');
  const settleMs1 = (h1.handlerSettledAt as number) - tDisc1;
  await sleep(2000); // konfirmasi leg-2 benar-benar tak dimulai (bukan tertunda)
  const h1Calls = calls();
  const h1Aborted = abortedCalls();
  await check('H1a disconnect leg-1: tepat 1 attempt (leg-2 TIDAK dimulai)', () => assert.equal(h1Calls, 1, `attempt: ${h1Calls}`));
  await check('H1b disconnect leg-1: fetch in-flight DI-ABORT (bukan timeout)', () => assert.equal(h1Aborted, 1, `aborted: ${h1Aborted}`));
  await check('H1c disconnect leg-1: handler selesai <8 dtk sesudah disconnect', () => assert.ok(settleMs1 < 8000, `settle ${settleMs1} ms`));
  await check('H1d disconnect leg-1: TIDAK ada respons ditulis ke socket mati', () => assert.equal(h1.responseWritten, false));
  await check('H1e disconnect leg-1: handler tanpa error + event client_disconnected tercatat', () => {
    assert.equal(h1.handlerError, null, `handlerError: ${String(h1.handlerError)}`);
    assert.ok(disconnectEvents > evBeforeH1, 'event client_disconnected tidak tercatat');
  });
  await check('H1f disconnect leg-1: stub hanya menerima 1 request', () => assert.equal(stubReceived.length, 1, `stub: ${stubReceived.length}`));

  // --- H2: disconnect di tengah leg-3 -------------------------------------
  console.log('\n-- H2 disconnect di tengah leg-3 (crown 500x2, gemini hang) --');
  setStub({ crown: 'fail-500', gemini: 'hang' });
  current = freshReqState();
  const h2 = current;
  const c2 = postRaw(gwPort, gatewayBody(), '10.99.7.2');
  c2.done.catch(() => {});
  await waitFor(() => calls() === 3, 10000, 'leg-3 (gemini hang) dimulai');
  const tDisc2 = Date.now();
  destroyClient(c2.req);
  await waitFor(() => h2.handlerSettledAt !== null, 15000, 'handler selesai sesudah disconnect');
  const settleMs2 = (h2.handlerSettledAt as number) - tDisc2;
  await sleep(2000);
  const h2Calls = calls();
  const h2Aborted = abortedCalls();
  await check('H2a disconnect leg-3: tepat 3 attempt (leg-4 zyrouter TIDAK dimulai)', () => assert.equal(h2Calls, 3, `attempt: ${h2Calls}`));
  await check('H2b disconnect leg-3: hanya fetch in-flight yang di-abort', () => assert.equal(h2Aborted, 1, `aborted: ${h2Aborted}`));
  await check('H2c disconnect leg-3: handler selesai <8 dtk sesudah disconnect', () => assert.ok(settleMs2 < 8000, `settle ${settleMs2} ms`));
  await check('H2d disconnect leg-3: TIDAK ada respons ditulis', () => assert.equal(h2.responseWritten, false));

  // --- H3: tanpa disconnect, failover normal (regresi) ---------------------
  console.log('\n-- H3 tanpa disconnect: failover crown 500x2 -> gemini valid --');
  setStub({ crown: 'fail-500', gemini: 'valid' });
  current = freshReqState();
  const h3 = current;
  const evBeforeH3 = disconnectEvents;
  const c3 = postRaw(gwPort, gatewayBody(), '10.99.7.3');
  const r3 = await c3.done;
  const b3 = JSON.parse(r3.body);
  await check('H3a no-disconnect failover: 200 + provider gemini model gemini-3.5-flash-lite', () => {
    assert.equal(r3.status, 200, `status ${r3.status}`);
    assert.equal(b3.success, true);
    assert.equal(b3.provider, 'gemini');
    assert.equal(b3.model, 'gemini-3.5-flash-lite');
  });
  await check('H3b no-disconnect failover: attempts [crown server, crown server, gemini ok]', () => {
    assert.equal(Array.isArray(b3.attempts), true);
    assert.equal(b3.attempts.length, 3, `attempts: ${b3.attempts.length}`);
    assert.deepEqual(b3.attempts.map((a: any) => `${a.provider}:${a.ok ? 'ok' : a.errorClass}`), ['crown:server', 'crown:server', 'gemini:ok']);
  });
  await check('H3c no-disconnect failover: 3 panggilan provider stub', () => assert.equal(calls(), 3, `attempt: ${calls()}`));
  await check('H3d no-disconnect failover: TANPA abort palsu (event client_disconnected tidak bertambah)', () => {
    assert.equal(disconnectEvents, evBeforeH3, `event bertambah ${disconnectEvents - evBeforeH3}`);
    assert.equal(abortedCalls(), 0, `fetch ter-abort: ${abortedCalls()}`);
    assert.equal(h3.handlerError, null);
  });

  // --- H4: tanpa disconnect, sukses leg-1 ----------------------------------
  console.log('\n-- H4 tanpa disconnect: crown valid, sukses leg-1 --');
  setStub({ crown: 'valid' });
  current = freshReqState();
  const h4 = current;
  const c4 = postRaw(gwPort, gatewayBody(), '10.99.7.4');
  const r4 = await c4.done;
  const b4 = JSON.parse(r4.body);
  await check('H4a no-disconnect sukses: 200 + provider crown model MiniMax M2.7', () => {
    assert.equal(r4.status, 200, `status ${r4.status}`);
    assert.equal(b4.success, true);
    assert.equal(b4.provider, 'crown');
    assert.equal(b4.model, 'MiniMaxAI/MiniMax-M2.7');
  });
  await check('H4b no-disconnect sukses: tepat 1 attempt, 1 panggilan stub', () => {
    assert.equal(b4.attempts.length, 1);
    assert.equal(calls(), 1, `attempt: ${calls()}`);
  });

  // --- H5: probe `req 'close'` pada request normal -------------------------
  console.log('\n-- H5 probe: `req close` pada request NORMAL (H4) --');
  await check("H5a req 'close' MENYALA pada request normal (bukan hanya saat disconnect)", () => {
    assert.notEqual(h4.reqCloseAt, null, "req 'close' tidak menyala sama sekali");
  });
  await check("H5b req 'close' menyala SEBELUM respons terkirim (saat body selesai dibaca)", () => {
    assert.equal(h4.reqCloseWritableFinished, false, 'saat req close menyala, respons sudah terkirim?');
  });

  // --- D1: executeAI langsung, sinyal sudah aborted ------------------------
  console.log('\n-- D1 executeAI langsung: sinyal pre-aborted --');
  setStub({ crown: 'valid' });
  {
    const ctl = new AbortController();
    ctl.abort();
    const r = await gw.executeAI({ message: 'halo', mode: 'chat', signal: ctl.signal });
    await check('D1a pre-aborted: 0 panggilan provider (leg-1 tidak dimulai)', () => assert.equal(calls(), 0, `attempt: ${calls()}`));
    await check('D1b pre-aborted: errorCode CLIENT_DISCONNECTED + aborted=true', () => {
      assert.equal(r.ok, false);
      assert.equal(r.errorCode, 'CLIENT_DISCONNECTED');
      assert.equal(r.aborted, true);
    });
    await check('D1c pre-aborted: 1 entri sintetis gateway errorClass aborted', () => {
      assert.equal(r.attempts.length, 1);
      assert.equal(r.attempts[0].provider, 'gateway');
      assert.equal(r.attempts[0].errorClass, 'aborted');
    });
  }

  // --- D2: executeAI langsung, abort di tengah leg-1 -----------------------
  console.log('\n-- D2 executeAI langsung: abort di tengah leg-1 (crown hang) --');
  setStub({ crown: 'hang' });
  {
    const ctl = new AbortController();
    const p = gw.executeAI({ message: 'halo', mode: 'chat', signal: ctl.signal });
    await waitFor(() => calls() === 1, 10000, 'leg-1 dimulai');
    const tAbort = Date.now();
    ctl.abort();
    const r = await p;
    const resolveMs = Date.now() - tAbort;
    await check('D2a abort mid-leg-1: tepat 1 attempt (leg-2 TIDAK dimulai)', () => assert.equal(calls(), 1, `attempt: ${calls()}`));
    await check('D2b abort mid-leg-1: attempt errorClass aborted', () => {
      assert.equal(r.attempts.length, 1);
      assert.equal(r.attempts[0].errorClass, 'aborted', `errorClass: ${r.attempts[0].errorClass}`);
    });
    await check('D2c abort mid-leg-1: CLIENT_DISCONNECTED + selesai <8 dtk', () => {
      assert.equal(r.errorCode, 'CLIENT_DISCONNECTED');
      assert.equal(r.aborted, true);
      assert.ok(resolveMs < 8000, `resolve ${resolveMs} ms`);
    });
  }

  // --- D3/D4: regresi tanpa disconnect -------------------------------------
  console.log('\n-- D3/D4 executeAI langsung: regresi tanpa disconnect --');
  const expectedSeq = ['crown:MiniMaxAI/MiniMax-M2.7:server', 'crown:deepseek-ai/DeepSeek-V4-Flash-0731:server', 'gemini:gemini-3.5-flash-lite:ok'];
  const seqOf = (r: any) => r.attempts.map((a: any) => `${a.provider}:${a.model}:${a.ok ? 'ok' : a.errorClass}`);
  setStub({ crown: 'fail-500', gemini: 'valid' });
  const d3 = await gw.executeAI({ message: 'halo', mode: 'chat' });
  await check('D3a tanpa sinyal: failover identik pra-perubahan (urutan + errorClass)', () => {
    assert.equal(d3.ok, true);
    assert.equal(d3.provider, 'gemini');
    assert.deepEqual(seqOf(d3), expectedSeq);
  });
  await check('D3b tanpa sinyal: 3 panggilan provider stub', () => assert.equal(calls(), 3, `attempt: ${calls()}`));
  setStub({ crown: 'fail-500', gemini: 'valid' });
  const ctl4 = new AbortController(); // tidak pernah di-abort
  const d4 = await gw.executeAI({ message: 'halo', mode: 'chat', signal: ctl4.signal });
  await check('D4a sinyal ada tapi tak abort: hasil IDENTIK dengan tanpa sinyal', () => {
    assert.equal(d4.ok, true);
    assert.equal(d4.provider, 'gemini');
    assert.deepEqual(seqOf(d4), seqOf(d3));
  });
  await check('D4b sinyal ada tapi tak abort: 3 panggilan, 0 ter-abort', () => {
    assert.equal(calls(), 3, `attempt: ${calls()}`);
    assert.equal(abortedCalls(), 0);
  });

  gwServer.close();
  stubServer.close();
  console.log(`\ngatewayDisconnectAbort: ${passed} passed, ${failed} failed`);
  console.log(`jejak stub total: fetch provider=${fetchCalls.length} (skenario terakhir), provider nyata=0`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('gatewayDisconnectAbort: FATAL', e);
  process.exit(1);
});
