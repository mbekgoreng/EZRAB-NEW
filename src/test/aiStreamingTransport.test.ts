/**
 * aiStreamingTransport.test.ts — Streaming AI real-time, FASE 1 (2026-11-20).
 *
 * Transport SSE gateway <-> klien + kontrak event + failover leg.
 * Mock adapter SEMUA — 0 panggilan provider nyata, 0 panggilan berbayar.
 *
 * Cakupan:
 *  [0] validateAiInput — allowlist flag `stream` (+ conversationId)
 *  [1] Writer SSE server (api/_lib/streamEvents.js)
 *  [2] Parser + validator + staging leg klien (streamEvents.ts)
 *  [3] Tes KESEPAKATAN server <-> klien (format -> parse round-trip)
 *  [4] providerClient.executeStream (fetch mock)
 *  [5] executeAI mode streaming (fetch provider mock)
 *  [6] handleAiRequest cabang SSE (mock req/res)
 *
 * Jalankan: npx --yes tsx src/test/aiStreamingTransport.test.ts
 * (skrip asersi tsx polos, BUKAN suite vitest — "No test suite found"
 * dari vitest untuk file ini adalah keterbatasan harness, bukan gagal.)
 */
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { TextEncoder, TextDecoder } from 'node:util';

// ---------------------------------------------------------------------------
// ENV — mode degraded terkontrol, key dummy (pola gatewayDisconnectAbort)
// ---------------------------------------------------------------------------
for (const k of Object.keys(process.env)) {
  if (/^(GEMINI|CROWN|ATMO|ZYROUTER|ZROUTER|DAHL|RIVER|ATRIA|GEMINI_OAI|WEIZEROUTER|ARXPAY)/.test(k)) {
    delete process.env[k];
  }
}
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.AI_GATEWAY_TOKEN;
delete process.env.AI_METERING_ENABLED;
process.env.CROWN_API_KEY = 'dummy-crown';
// (Key Gemini TIDAK dipasang — kaki Gemini native dicabut dari semua
// rantai 2026-11-22, spesifikasi final owner 01:37.)
process.env.ZYROUTER_API_KEY = 'dummy-zyrouter';
process.env.AI_RATE_LIMIT_PER_MIN = '1000';

import { validateAiInput } from '../../api/_lib/security.js';
import {
  STREAM_EVENT_TYPES as SERVER_EVENT_TYPES,
  STREAM_HEARTBEAT_MS,
  formatSseEvent,
  createSseWriter,
} from '../../api/_lib/streamEvents.js';
import { executeAI, handleAiRequest } from '../../api/_lib/aiGateway.js';
import {
  STREAM_EVENT_TYPES as CLIENT_EVENT_TYPES,
  createSseParser,
  createLegStaging,
  validateStreamEvent,
  type StreamEvent,
} from '../ai-tools/ezrab-ai/streamEvents.js';
import { aiToolsProviderClient, mapStreamError } from '../ai-tools/providerClient.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, extra?: string) => {
  if (cond) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
};
const eq = (a: unknown, b: unknown, name: string) =>
  check(name, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ===========================================================================
// [0] validateAiInput — flag stream
// ===========================================================================
console.log('\n[0] validateAiInput — allowlist stream');
{
  const r = validateAiInput({ message: 'halo', stream: true });
  eq(r.errors, [], 'stream:true lolos validasi');
  eq(r.input.stream, true, 'stream:true diteruskan ke input');
  const r2 = validateAiInput({ message: 'halo' });
  eq(r2.input.stream, false, 'tanpa flag stream -> false (default buffered)');
  const r3 = validateAiInput({ message: 'halo', stream: 'true' });
  eq(r3.input.stream, false, "stream:'true' (string) TIDAK mengaktifkan");
  const r4 = validateAiInput({ message: 'halo', stream: 1 });
  eq(r4.input.stream, false, 'stream:1 TIDAK mengaktifkan');
  const r5 = validateAiInput({ message: 'halo', stream: true, jsonMode: true });
  check('stream+jsonMode ditolak', r5.errors.length > 0 && r5.errorCode === 'INVALID_REQUEST', r5.errors.join(';'));
  const png = Buffer.from('iVBORw0KGgo=').toString('base64');
  const r6 = validateAiInput({ message: 'halo', stream: true, imageDataBase64: png });
  check('stream+media ditolak', r6.errors.length > 0 && r6.errorCode === 'INVALID_REQUEST', r6.errors.join(';'));
  const r7 = validateAiInput({ message: 'halo', stream: true, conversationId: '  conv-123  ' });
  eq(r7.input.conversationId, 'conv-123', 'conversationId di-trim + diteruskan');
  const r8 = validateAiInput({ message: 'halo', conversationId: 'x'.repeat(200) });
  eq((r8.input.conversationId || '').length, 128, 'conversationId dipotong 128 karakter');
  const r9 = validateAiInput({ message: 'halo', conversationId: 42 });
  eq(r9.input.conversationId, null, 'conversationId non-string -> null');
  const r10 = validateAiInput({ message: 'halo' });
  eq(r10.input.conversationId, null, 'tanpa conversationId -> null');
}

// ===========================================================================
// [1] Writer SSE server
// ===========================================================================
console.log('\n[1] Writer SSE server (api/_lib/streamEvents.js)');
{
  eq(STREAM_HEARTBEAT_MS, 15000, 'heartbeat 15 dtk');
  const frame = formatSseEvent('content_delta', { messageId: 'm1', leg: 0, delta: 'Hel' });
  eq(
    frame,
    'event: content_delta\ndata: {"messageId":"m1","leg":0,"delta":"Hel"}\n\n',
    'formatSseEvent byte-exact'
  );
  let threw = false;
  try {
    formatSseEvent('tipe_ngawur', { messageId: 'm1' });
  } catch {
    threw = true;
  }
  check('formatSseEvent melempar pada tipe tak dikenal', threw);
  threw = false;
  try {
    formatSseEvent('content_delta', null);
  } catch {
    threw = true;
  }
  check('formatSseEvent melempar pada data bukan objek', threw);

  // Mock res minimal ala ServerResponse.
  const mkRes = () => {
    const emitter = new EventEmitter();
    const writes: string[] = [];
    const headers: Record<string, string> = {};
    const res: any = Object.assign(emitter, {
      writes,
      headers,
      statusCode: 0,
      ended: false,
      writeHead(code: number, h: Record<string, string>) {
        res.statusCode = code;
        Object.assign(headers, h);
      },
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
      write(chunk: string) {
        writes.push(chunk);
        return true;
      },
      end() {
        res.ended = true;
      },
    });
    return res;
  };

  const res1 = mkRes();
  const w1 = createSseWriter(res1);
  check('heartbeat sebelum flush = no-op', w1.heartbeat() === false && res1.writes.length === 0);
  check('sendEvent pertama flush header', w1.sendEvent('message_start', { messageId: 'm1', requestId: 'r1' }) === true);
  eq(res1.statusCode, 200, 'status SSE 200');
  eq(res1.headers['Content-Type'], 'text/event-stream', 'header Content-Type event-stream');
  eq(res1.headers['Cache-Control'], 'no-cache', 'header Cache-Control no-cache');
  check('heartbeat sesudah flush menulis : ping', w1.heartbeat() === true && res1.writes[1] === ': ping\n\n');
  w1.end();
  check('end() menutup res', res1.ended === true);
  check('sendEvent sesudah end = no-op', w1.sendEvent('content_delta', { messageId: 'm1', leg: 0, delta: 'x' }) === false);
  check('heartbeat sesudah end = no-op', w1.heartbeat() === false);
  w1.end();
  check('end() kedua aman (idempotent)', res1.ended === true);

  // Tulis ke socket mati: sendEvent mengembalikan false, tidak melempar.
  const res2 = mkRes();
  res2.write = () => {
    throw new Error('socket hang up');
  };
  const w2 = createSseWriter(res2);
  check('sendEvent gagal tulis -> false, tidak melempar', w2.sendEvent('message_start', { messageId: 'm1' }) === false);
  check('writeFailed tercatat', w2.writeFailed === true);
}

// ===========================================================================
// [2] Parser + validator + staging leg klien
// ===========================================================================
console.log('\n[2] Parser + validator + staging leg klien');
{
  // Parser: chunk terbelah arbitrer (termasuk di tengah baris event).
  const events: StreamEvent[] = [];
  let malformed = 0;
  const parser = createSseParser({
    onEvent: (e) => events.push(e),
    onMalformed: () => malformed++,
  });
  const full =
    'event: message_start\ndata: {"messageId":"m1","conversationId":null,"requestId":"r1"}\n\n' +
    ': ping\n\n' +
    'event: content_delta\ndata: {"messageId":"m1","leg":0,"delta":"Hel"}\n\n' +
    'event: content_delta\ndata: {"messageId":"m1","leg":0,"delta":"lo"}\n\n' +
    'event: content_delta\ndata: {bukan-json}\n\n' +
    'event: message_complete\ndata: {"messageId":"m1","requestId":"r1","usage":null,"usageStatus":"missing","durationMs":120,"model":"Ezrab-flash-v1"}\n\n';
  // Umpan per 7 karakter — memaksa belahan di tengah baris/frame.
  for (let i = 0; i < full.length; i += 7) parser.feed(full.slice(i, i + 7));
  parser.finish();
  eq(events.map((e) => e.type), ['message_start', 'content_delta', 'content_delta', 'message_complete'], 'parser: urutan event utuh walau chunk terbelah');
  eq(
    (events[1] as any).delta + (events[2] as any).delta,
    'Hello',
    'parser: delta tersambung'
  );
  eq(malformed, 1, 'parser: 1 event malformed dilewati (bukan JSON), stream jalan');
  eq((events[3] as any).model, 'Ezrab-flash-v1', 'parser: message_complete terbaca');

  // Komentar + [DONE] ditoleransi; blok tanpa baris event: malformed.
  const events2: StreamEvent[] = [];
  let malformed2 = 0;
  const p2 = createSseParser({ onEvent: (e) => events2.push(e), onMalformed: () => malformed2++ });
  p2.feed('data: [DONE]\n\n');
  p2.feed('data: {"messageId":"m1","leg":0,"delta":"x"}\n\n');
  p2.feed('event: stage\ndata: {"messageId":"m1","stage":"contacting-model"}\n\n');
  p2.finish();
  eq(events2.map((e) => e.type), ['stage'], '[DONE] + blok tanpa event: diabaikan; stage lolos');
  eq(malformed2, 1, 'blok tanpa baris event: dihitung malformed');

  // finish() memproses blok terakhir tanpa baris kosong penutup.
  const events3: StreamEvent[] = [];
  const p3 = createSseParser({ onEvent: (e) => events3.push(e) });
  p3.feed('event: leg_start\ndata: {"messageId":"m1","leg":2}');
  p3.finish();
  eq(events3.map((e) => e.type), ['leg_start'], 'finish() memproses blok terakhir tanpa \\n\\n');

  // Validator: tiap tipe + penolakan.
  check('validator: message_start sah', validateStreamEvent({ type: 'message_start', messageId: 'm', conversationId: null, requestId: 'r' }) !== null);
  check('validator: tanpa messageId ditolak', validateStreamEvent({ type: 'leg_start', leg: 0 }) === null);
  check('validator: tipe tak dikenal ditolak', validateStreamEvent({ type: 'teleport', messageId: 'm' }) === null);
  check('validator: leg negatif ditolak', validateStreamEvent({ type: 'content_delta', messageId: 'm', leg: -1, delta: 'x' }) === null);
  check('validator: leg pecahan ditolak', validateStreamEvent({ type: 'content_delta', messageId: 'm', leg: 0.5, delta: 'x' }) === null);
  check('validator: delta non-string ditolak', validateStreamEvent({ type: 'content_delta', messageId: 'm', leg: 0, delta: 42 }) === null);
  check('validator: leg_failed tanpa errorCode ditolak', validateStreamEvent({ type: 'leg_failed', messageId: 'm', leg: 0 }) === null);
  check('validator: bukan objek ditolak', validateStreamEvent('teks') === null && validateStreamEvent(null) === null);
  const mc = validateStreamEvent({ type: 'message_complete', messageId: 'm', requestId: 'r', usage: { inputTokens: 10 }, usageStatus: 'ngawur', durationMs: 5, model: 'Ezrab-flash-v1' });
  check('validator: usageStatus tak dikenal -> missing', mc !== null && (mc as any).usageStatus === 'missing');
  const se = validateStreamEvent({ type: 'stream_error', messageId: 'm', errorCode: 'AI_UNAVAILABLE', message: 'AI sedang tidak tersedia.', retryable: true });
  check('validator: stream_error sah', se !== null && (se as any).retryable === true);

  // Staging leg.
  const st = createLegStaging();
  st.applyDelta(0, 'Hel');
  st.applyDelta(0, 'lo');
  st.applyDelta(1, 'XX');
  eq(st.getLegContent(0), 'Hello', 'staging: delta leg 0 tersambung');
  st.resetLeg(0);
  eq(st.getLegContent(0), '', 'staging: resetLeg menghapus provisional leg 0');
  eq(st.getLegContent(1), 'XX', 'staging: reset leg 0 tidak menyentuh leg 1');
  st.applyDelta(1, 'YY');
  eq(st.completeLeg(1), 'XXYY', 'staging: completeLeg snapshot konten leg 1');
  st.applyDelta(1, 'ZZ');
  eq(st.completedContent, 'XXYY', 'staging: delta sesudah complete diabaikan');
  st.resetLeg(1);
  eq(st.completedContent, 'XXYY', 'staging: reset sesudah complete tidak mengubah snapshot');
  eq(st.completedLeg, 1, 'staging: completedLeg tercatat');
}

// ===========================================================================
// [3] Tes kesepakatan server <-> klien
// ===========================================================================
console.log('\n[3] Tes kesepakatan server <-> klien');
{
  eq([...CLIENT_EVENT_TYPES], [...SERVER_EVENT_TYPES], 'daftar tipe event server == klien');
  const samples: Array<{ type: string; data: Record<string, unknown> }> = [
    { type: 'message_start', data: { messageId: 'm9', conversationId: 'c9', requestId: 'r9' } },
    { type: 'leg_start', data: { messageId: 'm9', leg: 0 } },
    { type: 'content_delta', data: { messageId: 'm9', leg: 0, delta: 'Halo 😀 dunia' } },
    { type: 'leg_failed', data: { messageId: 'm9', leg: 0, errorCode: 'timeout' } },
    { type: 'content_reset', data: { messageId: 'm9', leg: 0 } },
    { type: 'stage', data: { messageId: 'm9', stage: 'contacting-model' } },
    { type: 'content_complete', data: { messageId: 'm9', leg: 1 } },
    { type: 'message_complete', data: { messageId: 'm9', requestId: 'r9', usage: { inputTokens: 10, outputTokens: 5 }, usageStatus: 'measured', durationMs: 321, model: 'Ezrab-flash-v1' } },
    { type: 'stream_error', data: { messageId: 'm9', errorCode: 'AI_UNAVAILABLE', message: 'AI sedang tidak tersedia.', retryable: true } },
  ];
  for (const s of samples) {
    const frame = formatSseEvent(s.type, s.data);
    const got: StreamEvent[] = [];
    const p = createSseParser({ onEvent: (e) => got.push(e) });
    p.feed(frame);
    p.finish();
    eq(got.length, 1, `round-trip ${s.type}: 1 event ter-parse`);
    if (got.length === 1) {
      eq(got[0], { type: s.type, ...s.data }, `round-trip ${s.type}: payload identik`);
    }
  }
}

// ===========================================================================
// [4] providerClient.executeStream (fetch mock)
// ===========================================================================
console.log('\n[4] providerClient.executeStream (fetch mock)');
{
  const encoder = new TextEncoder();
  const sseFrame = (type: string, data: unknown) =>
    `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

  // Respons SSE mock: body.getReader() mengalirkan chunk bytes; read()
  // menolak AbortError bila sinyal abort (agar uji abort/timeout nyata).
  const mockSseResponse = (byteChunks: Uint8Array[], signal?: AbortSignal, delayMs = 0): any => {
    const queue = [...byteChunks];
    let cancelled = false;
    return {
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream; charset=utf-8' : null) },
      body: {
        getReader: () => ({
          read: async (): Promise<{ value?: Uint8Array; done: boolean }> => {
            if (cancelled) return { value: undefined, done: true };
            if (signal?.aborted) {
              const e: any = new Error('aborted');
              e.name = 'AbortError';
              throw e;
            }
            if (delayMs > 0) {
              await new Promise<void>((resolve, reject) => {
                const t = setTimeout(resolve, delayMs);
                signal?.addEventListener(
                  'abort',
                  () => {
                    clearTimeout(t);
                    const e: any = new Error('aborted');
                    e.name = 'AbortError';
                    reject(e);
                  },
                  { once: true }
                );
              });
            }
            if (signal?.aborted) {
              const e: any = new Error('aborted');
              e.name = 'AbortError';
              throw e;
            }
            const next = queue.shift();
            if (next === undefined) return { value: undefined, done: true };
            return { value: next, done: false };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
      json: async () => {
        throw new Error('bukan JSON');
      },
    };
  };
  const mockSseTextResponse = (textChunks: string[], signal?: AbortSignal, delayMs = 0) =>
    mockSseResponse(textChunks.map((c) => encoder.encode(c)), signal, delayMs);

  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  let fetchBehavior: (url: any, init: any) => any = () => {
    throw new Error('fetch mock belum diset untuk uji ini');
  };
  (globalThis as any).fetch = (...args: any[]) => {
    fetchCalls++;
    return Promise.resolve(fetchBehavior(args[0], args[1]));
  };

  const baseReq = { productId: 'EZRAB_AI' as const, prompt: 'halo' };
  const completeEvent = (usage: any = { inputTokens: 10, outputTokens: 5, totalTokens: 15 }) =>
    sseFrame('message_complete', {
      messageId: 'm1',
      requestId: 'r1',
      usage,
      usageStatus: 'measured',
      durationMs: 120,
      model: 'Ezrab-flash-v1',
    });

  // 4a. Jalur bahagia.
  {
    fetchCalls = 0;
    fetchBehavior = (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      check('4a: body fetch memuat stream:true', body.stream === true);
      return mockSseTextResponse([
        sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' }),
        sseFrame('leg_start', { messageId: 'm1', leg: 0 }),
        sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'Hel' }),
        sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'lo' }),
        sseFrame('content_complete', { messageId: 'm1', leg: 0 }),
        completeEvent(),
      ]);
    };
    const seen: StreamEvent[] = [];
    const deltas: string[] = [];
    let firstChunks = 0;
    const res = await aiToolsProviderClient.executeStream(baseReq, {
      onEvent: (e) => seen.push(e),
      onDelta: (d) => deltas.push(d),
      onFirstChunk: () => firstChunks++,
    });
    check('4a: sukses', res.success === true, JSON.stringify(res));
    if (res.success) {
      eq(res.content, 'Hello', '4a: konten rakitan = Hello');
      eq(res.requestId, 'r1', '4a: requestId dari message_complete');
      eq(res.model, 'Ezrab-flash-v1', '4a: model alias diteruskan');
      eq(res.provider, 'ezrab', '4a: provider tampil netral');
      eq(res.usage?.inputTokens, 10, '4a: usage inputTokens ternormalisasi');
      eq(res.usage?.outputTokens, 5, '4a: usage outputTokens ternormalisasi');
      eq(res.usageStatus, 'measured', '4a: usageStatus measured');
    }
    eq(deltas, ['Hel', 'lo'], '4a: onDelta dipanggil per delta');
    eq(firstChunks, 1, '4a: onFirstChunk tepat sekali');
    eq(
      seen.map((e) => e.type),
      ['message_start', 'leg_start', 'content_delta', 'content_delta', 'content_complete', 'message_complete'],
      '4a: onEvent urutan lengkap'
    );
  }

  // 4b. Reset leg: konten leg gagal TIDAK tersambung.
  {
    fetchBehavior = () =>
      mockSseTextResponse([
        sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' }),
        sseFrame('leg_start', { messageId: 'm1', leg: 0 }),
        sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'Hel' }),
        sseFrame('leg_failed', { messageId: 'm1', leg: 0, errorCode: 'network' }),
        sseFrame('content_reset', { messageId: 'm1', leg: 0 }),
        sseFrame('leg_start', { messageId: 'm1', leg: 1 }),
        sseFrame('content_delta', { messageId: 'm1', leg: 1, delta: 'World' }),
        sseFrame('content_complete', { messageId: 'm1', leg: 1 }),
        completeEvent(),
      ]);
    const deltas: string[] = [];
    const res = await aiToolsProviderClient.executeStream(baseReq, { onDelta: (d) => deltas.push(d) });
    check('4b: sukses sesudah failover', res.success === true);
    if (res.success) eq(res.content, 'World', '4b: konten final = leg 1 saja (Hel dibuang reset)');
    eq(deltas, ['Hel', 'World'], '4b: onDelta tetap menerima delta leg gagal (UI yang me-reset)');
  }

  // 4c. stream_error: kode server dipetakan; parsial sudah disampaikan.
  {
    fetchBehavior = () =>
      mockSseTextResponse([
        sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' }),
        sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'Par' }),
        sseFrame('stream_error', { messageId: 'm1', errorCode: 'CONTENT_REJECTED', message: 'Permintaan ditolak oleh kebijakan konten provider AI.', retryable: false }),
      ]);
    const deltas: string[] = [];
    const res = await aiToolsProviderClient.executeStream(baseReq, { onDelta: (d) => deltas.push(d) });
    check('4c: gagal terstruktur', res.success === false);
    if (!res.success) {
      eq(res.errorCode, 'CONTENT_REJECTED', '4c: kode CONTENT_REJECTED dipetakan');
      eq(res.retryable, false, '4c: tidak retryable');
      eq(res.message, 'Permintaan ditolak oleh kebijakan konten provider AI.', '4c: pesan server dipakai apa adanya');
    }
    eq(deltas, ['Par'], '4c: parsial sudah disampaikan via onDelta sebelum error');
  }

  // 4d. Fallback JSON utuh (bukan SSE).
  {
    fetchBehavior = () => ({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
      body: null,
      json: async () => ({ success: true, content: 'Jawaban JSON', requestId: 'rj', provider: 'ezrab', model: 'Ezrab-flash-v1', usage: null, usageStatus: 'missing' }),
    });
    const res = await aiToolsProviderClient.executeStream(baseReq, {});
    check('4d: fallback JSON sukses', res.success === true);
    if (res.success) {
      eq(res.content, 'Jawaban JSON', '4d: konten dari JSON utuh');
      eq(res.usageStatus, 'missing', '4d: usageStatus missing dari JSON');
    }
  }

  // 4e. HTTP !ok dipetakan.
  {
    fetchBehavior = () => ({
      ok: false,
      status: 429,
      headers: { get: () => 'application/json' },
      body: null,
      json: async () => ({ errorCode: 'RATE_LIMITED' }),
    });
    const res = await aiToolsProviderClient.executeStream(baseReq, {});
    check('4e: 429 -> gagal', res.success === false);
    if (!res.success) {
      eq(res.errorCode, 'MODEL_ERROR', '4e: 429 dipetakan MODEL_ERROR');
      eq(res.retryable, true, '4e: 429 retryable');
    }
  }

  // 4f. Event malformed di tengah stream dilewati.
  {
    fetchBehavior = () =>
      mockSseTextResponse([
        sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' }),
        'event: content_delta\ndata: {rusak}\n\n',
        sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'OK' }),
        sseFrame('content_complete', { messageId: 'm1', leg: 0 }),
        completeEvent(),
      ]);
    const res = await aiToolsProviderClient.executeStream(baseReq, {});
    check('4f: sukses walau ada event malformed', res.success === true);
    if (res.success) eq(res.content, 'OK', '4f: konten utuh sesudah malformed dilewati');
  }

  // 4g. Abort pemanggil di tengah stream.
  {
    fetchBehavior = (_url: any, init: any) =>
      mockSseTextResponse(
        [
          sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' }),
          sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'A' }),
          sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'B' }),
          sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'C' }),
          sseFrame('content_complete', { messageId: 'm1', leg: 0 }),
          completeEvent(),
        ],
        init.signal,
        60
      );
    const ctl = new AbortController();
    // Abort di 200 mdtk: delta pertama tiba ~130 mdtk (2 chunk x 60 mdtk +
    // overhead auth), jadi minimal 1 delta sudah disampaikan sebelum abort
    // — tanpa balapan timer (130 mdtk sebelumnya flaky vs overhead auth).
    setTimeout(() => ctl.abort(), 200);
    const deltas: string[] = [];
    const res = await aiToolsProviderClient.executeStream(
      { ...baseReq, signal: ctl.signal },
      { onDelta: (d) => deltas.push(d) }
    );
    check('4g: abort -> gagal', res.success === false);
    if (!res.success) eq(res.errorCode, 'MODEL_TIMEOUT', '4g: abort dipetakan MODEL_TIMEOUT');
    check('4g: delta sebelum abort sudah disampaikan', deltas.length >= 1, `deltas: ${deltas.join(',')}`);
  }

  // 4h/4i. jsonMode + media ditolak tanpa fetch.
  {
    fetchCalls = 0;
    fetchBehavior = () => {
      throw new Error('fetch tidak boleh dipanggil');
    };
    const rH = await aiToolsProviderClient.executeStream({ ...baseReq, jsonMode: true }, {});
    check('4h: jsonMode ditolak', rH.success === false && (rH as any).errorCode === 'INVALID_REQUEST');
    const png = Buffer.from('iVBORw0KGgo=').toString('base64');
    const rI = await aiToolsProviderClient.executeStream({ ...baseReq, imageDataBase64: png }, {});
    check('4i: media ditolak', rI.success === false && (rI as any).errorCode === 'INVALID_REQUEST');
    eq(fetchCalls, 0, '4h/4i: fetch TIDAK dipanggil untuk penolakan klien');
  }

  // 4j. Stream kosong -> EMPTY_RESPONSE.
  {
    fetchBehavior = () =>
      mockSseTextResponse([
        sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' }),
        sseFrame('message_complete', { messageId: 'm1', requestId: 'r1', usage: null, usageStatus: 'missing', durationMs: 5, model: 'Ezrab-flash-v1' }),
      ]);
    const res = await aiToolsProviderClient.executeStream(baseReq, {});
    check('4j: stream tanpa konten -> EMPTY_RESPONSE', res.success === false && (res as any).errorCode === 'EMPTY_RESPONSE');
  }

  // 4k. Split UTF-8 di tengah emoji (batas byte).
  {
    const text = sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' })
      + sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'A\u{1F600}B' })
      + sseFrame('content_complete', { messageId: 'm1', leg: 0 })
      + completeEvent();
    const bytes = encoder.encode(text);
    // Cari offset byte emoji 😀 (4 byte) lalu belah di tengahnya.
    const emojiAt = text.indexOf('\u{1F600}');
    const byteAt = encoder.encode(text.slice(0, emojiAt)).length;
    const splitAt = byteAt + 2;
    fetchBehavior = () => mockSseResponse([bytes.slice(0, splitAt), bytes.slice(splitAt)]);
    const res = await aiToolsProviderClient.executeStream(baseReq, {});
    check('4k: sukses walau emoji terbelah antar chunk', res.success === true);
    if (res.success) eq(res.content, 'A\u{1F600}B', '4k: emoji utuh sesudah TextDecoder streaming');
  }

  // 4l. Stream terpotong tanpa message_complete.
  {
    fetchBehavior = () =>
      mockSseTextResponse([
        sseFrame('message_start', { messageId: 'm1', conversationId: null, requestId: 'r1' }),
        sseFrame('content_delta', { messageId: 'm1', leg: 0, delta: 'Par' }),
      ]);
    const res = await aiToolsProviderClient.executeStream(baseReq, {});
    check('4l: terpotong -> NETWORK_ERROR retryable', res.success === false && (res as any).errorCode === 'NETWORK_ERROR' && (res as any).retryable === true);
  }

  // 4m. mapStreamError.
  {
    const m1 = mapStreamError({ type: 'stream_error', messageId: 'm', errorCode: 'MEDIA_NOT_SUPPORTED_FOR_MODE', message: 'Mode tidak mendukung media.', retryable: false }, 'EZRAB_AI');
    eq(m1.errorCode, 'INVALID_REQUEST', '4m: MEDIA_NOT_SUPPORTED -> INVALID_REQUEST');
    const m2 = mapStreamError({ type: 'stream_error', messageId: 'm', errorCode: 'AI_UNAVAILABLE', message: 'AI sedang tidak tersedia.', retryable: true }, 'EZRAB_AI');
    eq(m2.errorCode, 'MODEL_ERROR', '4m: AI_UNAVAILABLE -> MODEL_ERROR');
    eq(m2.retryable, true, '4m: AI_UNAVAILABLE retryable');
    const m3 = mapStreamError({ type: 'stream_error', messageId: 'm', errorCode: 'KODE_BARU', message: 'x', retryable: false }, 'EZRAB_AI');
    eq(m3.errorCode, 'MODEL_ERROR', '4m: kode tak dikenal -> MODEL_ERROR');
  }

  globalThis.fetch = realFetch;
}

// ===========================================================================
// [5] executeAI mode streaming (fetch provider mock)
// ===========================================================================
console.log('\n[5] executeAI mode streaming (fetch provider mock)');
{
  const encoder = new TextEncoder();
  const realFetch = globalThis.fetch;
  let providerCalls: Array<{ url: string; body: any }> = [];
  let providerBehavior: (url: string, init: any) => any = () => {
    throw new Error('provider mock belum diset');
  };
  (globalThis as any).fetch = (...args: any[]) => {
    const url = String(args[0]);
    const init = args[1] || {};
    if (
      !url.startsWith('https://crown.ai.id') &&
      !url.startsWith('https://generativelanguage.googleapis.com') &&
      !url.startsWith('https://api.zyrouter.com') &&
      !url.startsWith('https://api.river.ai') &&
      !url.startsWith('https://atmorouter.dev')
    ) {
      throw new Error('fetch ke host tak dikenal diblokir: ' + url);
    }
    let body: any = null;
    try {
      body = init.body ? JSON.parse(init.body) : null;
    } catch {
      /* abaikan */
    }
    providerCalls.push({ url, body });
    return Promise.resolve(providerBehavior(url, init));
  };

  const oaiSseBody = (deltas: string[], usage?: any) => {
    const lines = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`);
    if (usage) lines.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
    lines.push('data: [DONE]\n\n');
    return lines.join('');
  };
  const mockProviderSse = (text: string, signal?: AbortSignal): any => {
    const bytes = encoder.encode(text);
    let done = false;
    return {
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: {
        getReader: () => ({
          read: async () => {
            if (signal?.aborted) {
              const e: any = new Error('aborted');
              e.name = 'AbortError';
              throw e;
            }
            if (done) return { value: undefined, done: true };
            done = true;
            return { value: bytes, done: false };
          },
          cancel: async () => {},
        }),
      },
      text: async () => text,
    };
  };
  const mockProviderJson = (obj: any): any => ({
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    body: null,
    text: async () => JSON.stringify(obj),
    json: async () => obj,
  });
  const mockProviderError = (status: number, text = ''): any => ({
    ok: false,
    status,
    headers: { get: () => 'application/json' },
    body: null,
    text: async () => text,
  });

  const chatReq = { message: 'halo', mode: 'chat' as const, requestId: 't5' };

  // 5a. Leg pertama streaming SSE sukses.
  {
    providerCalls = [];
    providerBehavior = (url) => {
      if (url.startsWith('https://crown.ai.id')) {
        return mockProviderSse(oaiSseBody(['Hel', 'lo'], { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }));
      }
      throw new Error('leg tak terduga: ' + url);
    };
    const events: any[] = [];
    const r: any = await executeAI({ ...chatReq, stream: true, onStreamEvent: (e: any) => events.push(e) });
    check('5a: ok', r.ok === true, JSON.stringify(r));
    eq(r.content, 'Hello', '5a: konten = gabungan delta');
    eq(r.usage?.inputTokens, 10, '5a: usage dari chunk SSE terakhir');
    eq(
      events.map((e) => e.type),
      ['leg_start', 'content_delta', 'content_delta', 'content_complete'],
      '5a: urutan event leg'
    );
    eq(events[1].delta, 'Hel', '5a: delta pertama');
    eq(providerCalls.length, 1, '5a: 1 panggilan provider');
    eq(providerCalls[0].body.stream, true, '5a: request provider memuat stream:true');
    eq(providerCalls[0].body.stream_options?.include_usage, true, '5a: stream_options.include_usage diminta');
    check('5a: event tanpa nama provider/model asli', !JSON.stringify(events).includes('crown') && !JSON.stringify(events).includes('GLM'));
  }

  // 5b. Gagal di tengah stream -> reset + failover ke leg berikut.
  // Leg 0 Crown V4-0731 (satu-satunya model Crown kini — dulu GLM) gagal
  // di tengah stream; leg 1 River V4.1-1017 menjawab.
  {
    process.env.RIVER_API_KEY_1 = 'dummy-river';
    providerCalls = [];
    providerBehavior = (url, init) => {
      const model = init.body ? JSON.parse(init.body).model : '';
      if (model === 'deepseek-ai/DeepSeek-V4-Flash-0731') {
        // Stream "Hel" lalu reader melempar (jaringan putus).
        const bytes = encoder.encode(oaiSseBody(['Hel']));
        let step = 0;
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/event-stream' },
          body: {
            getReader: () => ({
              read: async () => {
                step++;
                if (step === 1) return { value: bytes, done: false };
                throw new TypeError('network down');
              },
              cancel: async () => {},
            }),
          },
          text: async () => '',
        };
      }
      if (model === 'deepseek-ai/DeepSeek-V4.1-Flash-1017') {
        return mockProviderSse(oaiSseBody(['World']));
      }
      throw new Error('leg tak terduga: ' + model);
    };
    const events: any[] = [];
    const r: any = await executeAI({ ...chatReq, requestId: 't5b', stream: true, onStreamEvent: (e: any) => events.push(e) });
    delete process.env.RIVER_API_KEY_1;
    check('5b: ok sesudah failover', r.ok === true);
    eq(r.content, 'World', '5b: konten final = leg 2 saja');
    eq(
      events.map((e) => `${e.type}:${e.leg}`),
      ['leg_start:0', 'content_delta:0', 'leg_failed:0', 'content_reset:0', 'leg_start:1', 'content_delta:1', 'content_complete:1'],
      '5b: urutan event failover mid-stream'
    );
    eq(events[2].errorCode, 'network', '5b: leg_failed membawa errorClass network');
  }

  // 5c. Provider mengabaikan stream:true -> satu delta (fallback jujur).
  {
    providerCalls = [];
    providerBehavior = () =>
      mockProviderJson({ choices: [{ message: { content: 'Jawaban JSON penuh' } }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } });
    const events: any[] = [];
    const r: any = await executeAI({ ...chatReq, requestId: 't5c', stream: true, onStreamEvent: (e: any) => events.push(e) });
    check('5c: ok via fallback JSON', r.ok === true);
    eq(r.content, 'Jawaban JSON penuh', '5c: konten dari JSON');
    eq(
      events.filter((e) => e.type === 'content_delta').length,
      1,
      '5c: tepat SATU delta untuk fallback'
    );
    eq(events.filter((e) => e.type === 'content_delta')[0]?.delta, 'Jawaban JSON penuh', '5c: delta tunggal = konten penuh');
  }

  // 5d. Crown 500 -> kaki River 1017 buffered (satu delta).
  // (Dulu: Crown 500 x3 -> kaki Gemini buffered — Gemini native dicabut
  // 2026-11-22; Crown kini 1 model, jadi hanya 1 leg_failed sebelum River.)
  {
    process.env.RIVER_API_KEY_1 = 'dummy-river';
    providerCalls = [];
    providerBehavior = (url) => {
      if (url.startsWith('https://crown.ai.id')) return mockProviderError(500, 'err');
      if (url.startsWith('https://api.river.ai')) {
        return mockProviderJson({
          choices: [{ message: { content: 'Jawaban River' } }],
          usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 },
        });
      }
      throw new Error('leg tak terduga: ' + url);
    };
    const events: any[] = [];
    const r: any = await executeAI({ ...chatReq, requestId: 't5d', stream: true, onStreamEvent: (e: any) => events.push(e) });
    delete process.env.RIVER_API_KEY_1;
    check('5d: ok via River', r.ok === true);
    eq(r.content, 'Jawaban River', '5d: konten River');
    eq(r.provider, 'river-flash', '5d: provider pelayan = river-flash');
    eq(
      events.map((e) => `${e.type}:${e.leg}`),
      ['leg_start:0', 'leg_failed:0', 'leg_start:1', 'content_delta:1', 'content_complete:1'],
      '5d: urutan event (tanpa reset — tak ada konten ter-stream sebelum gagal)'
    );
    check('5d: tanpa content_reset bila tak ada delta', !events.some((e) => e.type === 'content_reset'));
  }

  // 5e. Regresi non-streaming: tanpa flag stream, perilaku lama utuh.
  {
    providerCalls = [];
    providerBehavior = () =>
      mockProviderJson({ choices: [{ message: { content: 'Buffered' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    const r: any = await executeAI({ ...chatReq, requestId: 't5e' });
    check('5e: ok buffered', r.ok === true);
    eq(r.content, 'Buffered', '5e: konten buffered');
    eq(providerCalls[0].body.stream, false, '5e: request provider tetap stream:false');
  }

  // 5f. Disconnect di tengah stream -> CLIENT_DISCONNECTED, 1 attempt.
  {
    providerCalls = [];
    providerBehavior = (_url, init) => {
      const signal = init.signal;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/event-stream' },
        body: {
          getReader: () => ({
            read: async () => {
              // Menggantung sampai sinyal abort menyala.
              await new Promise<void>((_resolve, reject) => {
                signal.addEventListener(
                  'abort',
                  () => {
                    const e: any = new Error('aborted');
                    e.name = 'AbortError';
                    reject(e);
                  },
                  { once: true }
                );
              });
              return { value: undefined, done: true };
            },
            cancel: async () => {},
          }),
        },
        text: async () => '',
      };
    };
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 60);
    const events: any[] = [];
    const r: any = await executeAI({
      ...chatReq,
      requestId: 't5f',
      signal: ctl.signal,
      stream: true,
      onStreamEvent: (e: any) => events.push(e),
    });
    eq(r.errorCode, 'CLIENT_DISCONNECTED', '5f: disconnect -> CLIENT_DISCONNECTED');
    eq(r.attempts?.length, 1, '5f: tepat 1 attempt (leg berikut tidak dimulai)');
    eq(r.attempts?.[0]?.errorClass, 'aborted', '5f: errorClass aborted');
    eq(
      events.map((e) => e.type),
      ['leg_start', 'leg_failed'],
      '5f: event leg_start + leg_failed saja (tanpa reset — tanpa delta)'
    );
  }

  // 5g. Sanitizer Crown: blok <think> terbelah antar chunk TIDAK bocor.
  {
    providerCalls = [];
    providerBehavior = () => mockProviderSse(oaiSseBody(['Jawaban <th', 'ink>rahasia</th', 'ink> akhir']));
    const deltas: string[] = [];
    const r: any = await executeAI({
      ...chatReq,
      requestId: 't5g',
      stream: true,
      onStreamEvent: (e: any) => {
        if (e.type === 'content_delta') deltas.push(e.delta);
      },
    });
    check('5g: ok', r.ok === true);
    check('5g: konten bebas blok think', !r.content.includes('rahasia') && !r.content.includes('<think>'), JSON.stringify(r.content));
    check('5g: TIDAK ADA delta yang membawa isi think', !deltas.join('').includes('rahasia'));
    eq(r.content, 'Jawaban  akhir', '5g: konten = teks di luar blok think');
  }

  // 5h. Sanitizer AtmoRouter: footer promo + pemisah TIDAK bocor.
  {
    process.env.ATMO_API_KEY = 'dummy-atmo';
    providerCalls = [];
    providerBehavior = (url) => {
      if (url.startsWith('https://crown.ai.id')) return mockProviderError(500, 'err');
      if (url.startsWith('https://generativelanguage.googleapis.com')) return mockProviderError(500, 'err');
      if (url.startsWith('https://atmorouter.dev')) {
        return mockProviderSse(oaiSseBody(['Isi jawaban\n---\nPowered by AtmoRouter']));
      }
      throw new Error('leg tak terduga: ' + url);
    };
    const deltas: string[] = [];
    const r: any = await executeAI({
      ...chatReq,
      requestId: 't5h',
      stream: true,
      onStreamEvent: (e: any) => {
        if (e.type === 'content_delta') deltas.push(e.delta);
      },
    });
    check('5h: ok via Atmo', r.ok === true);
    check('5h: footer promo tidak bocor', !r.content.includes('AtmoRouter'), JSON.stringify(r.content));
    check('5h: tidak ada delta membawa promo', !deltas.join('').includes('AtmoRouter'));
    eq(r.content, 'Isi jawaban\n', '5h: konten = isi tanpa footer + pemisah');
    delete process.env.ATMO_API_KEY;
  }

  globalThis.fetch = realFetch;
}

// ===========================================================================
// [6] handleAiRequest cabang SSE (mock req/res)
// ===========================================================================
console.log('\n[6] handleAiRequest cabang SSE (mock req/res)');
{
  const encoder = new TextEncoder();
  const realFetch = globalThis.fetch;
  let providerCalls = 0;
  let providerBehavior: (url: string, init: any) => any = () => {
    throw new Error('provider mock belum diset');
  };
  (globalThis as any).fetch = (...args: any[]) => {
    const url = String(args[0]);
    if (!url.startsWith('https://crown.ai.id') && !url.startsWith('https://generativelanguage.googleapis.com') && !url.startsWith('https://api.zyrouter.com')) {
      throw new Error('fetch ke host tak dikenal diblokir: ' + url);
    }
    providerCalls++;
    return Promise.resolve(providerBehavior(url, args[1]));
  };

  class MockRes extends EventEmitter {
    statusCode = 0;
    headers: Record<string, string> = {};
    writes: string[] = [];
    jsonBody: any = undefined;
    ended = false;
    writableFinished = false;
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    }
    status(code: number) {
      this.statusCode = code;
      return this;
    }
    json(body: any) {
      this.jsonBody = body;
      this.writableFinished = true;
      return this;
    }
    writeHead(code: number, h: Record<string, string>) {
      this.statusCode = code;
      Object.assign(this.headers, h);
    }
    write(chunk: string) {
      this.writes.push(chunk);
      return true;
    }
    end() {
      this.ended = true;
      this.writableFinished = true;
    }
  }
  const mkReq = (body: any, headers: Record<string, string> = {}) => ({
    method: 'POST',
    headers: { origin: '', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    body,
  });
  const parseWrites = (res: MockRes): StreamEvent[] => {
    const out: StreamEvent[] = [];
    const p = createSseParser({ onEvent: (e) => out.push(e) });
    p.feed(res.writes.join(''));
    p.finish();
    return out;
  };
  const crownSse = (deltas: string[]) => {
    const lines = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`);
    lines.push(
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`
    );
    lines.push('data: [DONE]\n\n');
    const bytes = encoder.encode(lines.join(''));
    let done = false;
    return {
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
      body: {
        getReader: () => ({
          read: async () => {
            if (done) return { value: undefined, done: true };
            done = true;
            return { value: bytes, done: false };
          },
          cancel: async () => {},
        }),
      },
      text: async () => lines.join(''),
    };
  };

  // 6a. SSE ujung-ke-ujung: urutan event + masking + header + end.
  {
    providerCalls = 0;
    providerBehavior = () => crownSse(['Hel', 'lo']);
    const req: any = mkReq({ productId: 'EZRAB_AI', prompt: 'halo', stream: true }, { 'idempotency-key': 's6a-1' });
    const res = new MockRes();
    await handleAiRequest(req, res, {
      productIdToMode: (pid: string, m: string) => (pid === 'EZRAB_AI' ? (m === 'advanced' ? 'advanced' : 'chat') : 'fast'),
    });
    eq(res.statusCode, 200, '6a: status 200');
    eq(res.headers['Content-Type'], 'text/event-stream', '6a: header SSE');
    check('6a: res.end() dipanggil', res.ended === true);
    const events = parseWrites(res);
    eq(
      events.map((e) => e.type),
      ['message_start', 'leg_start', 'content_delta', 'content_delta', 'content_complete', 'message_complete'],
      '6a: urutan event SSE lengkap'
    );
    const mc: any = events[events.length - 1];
    eq(mc.model, 'Ezrab-flash-v1', '6a: message_complete membawa alias model');
    eq(mc.usageStatus, 'measured', '6a: usageStatus measured');
    eq(mc.usage?.inputTokens, 10, '6a: usage dari leg pelayan');
    const raw = res.writes.join('');
    check('6a: MASKING — tanpa nama provider/model asli di SSE', !/crown|GLM|zai-org|DeepSeek/i.test(raw), raw.slice(0, 200));
    check('6a: messageId konsisten di semua event', events.every((e) => e.messageId === (events[0] as any).messageId));
    eq(providerCalls, 1, '6a: 1 panggilan provider');
  }

  // 6b. Replay idempotensi streaming: satu set event, tanpa provider baru.
  {
    providerCalls = 0;
    providerBehavior = () => crownSse(['Replay', 'Me']);
    const opts = { productIdToMode: (pid: string) => (pid === 'EZRAB_AI' ? 'chat' : 'fast') };
    const req1: any = mkReq({ productId: 'EZRAB_AI', prompt: 'halo replay', stream: true }, { 'idempotency-key': 's6b-1' });
    const res1 = new MockRes();
    await handleAiRequest(req1, res1, opts);
    eq(providerCalls, 1, '6b: request pertama memanggil provider');
    const req2: any = mkReq({ productId: 'EZRAB_AI', prompt: 'halo replay', stream: true }, { 'idempotency-key': 's6b-1' });
    const res2 = new MockRes();
    await handleAiRequest(req2, res2, opts);
    eq(providerCalls, 1, '6b: replay TIDAK memanggil provider lagi');
    const events2 = parseWrites(res2);
    eq(
      events2.map((e) => e.type),
      ['message_start', 'leg_start', 'content_delta', 'content_complete', 'message_complete'],
      '6b: replay = satu set event lengkap'
    );
    eq(
      (events2.find((e) => e.type === 'content_delta') as any)?.delta,
      'ReplayMe',
      '6b: replay delta tunggal = konten penuh'
    );
  }

  // 6c. Regresi non-streaming: JSON seperti sebelumnya.
  {
    providerCalls = 0;
    providerBehavior = () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'Buffered Biasa' } }], usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } }),
    });
    const req: any = mkReq({ productId: 'EZRAB_AI', prompt: 'halo biasa' });
    const res = new MockRes();
    await handleAiRequest(req, res, { productIdToMode: () => 'chat' });
    eq(res.statusCode, 200, '6c: status 200');
    check('6c: respons JSON (bukan SSE)', res.jsonBody?.success === true && res.writes.length === 0);
    eq(res.jsonBody?.content, 'Buffered Biasa', '6c: konten JSON utuh');
    eq(res.jsonBody?.model, 'Ezrab-flash-v1', '6c: alias model di JSON');
  }

  // 6d. stream+jsonMode -> 400 INVALID_REQUEST (tanpa provider).
  {
    providerCalls = 0;
    providerBehavior = () => {
      throw new Error('provider tidak boleh dipanggil');
    };
    const req: any = mkReq({ productId: 'EZRAB_AI', prompt: 'halo', stream: true, jsonMode: true });
    const res = new MockRes();
    await handleAiRequest(req, res, { productIdToMode: () => 'chat' });
    eq(res.statusCode, 400, '6d: status 400');
    eq(res.jsonBody?.errorCode, 'INVALID_REQUEST', '6d: errorCode INVALID_REQUEST');
    eq(providerCalls, 0, '6d: provider tidak dipanggil');
  }

  // 6e. Semua provider gagal -> stream_error AI_UNAVAILABLE + end.
  {
    providerCalls = 0;
    providerBehavior = () => ({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      body: null,
      text: async () => 'boom',
    });
    const req: any = mkReq({ productId: 'EZRAB_AI', prompt: 'halo gagal', stream: true });
    const res = new MockRes();
    await handleAiRequest(req, res, { productIdToMode: () => 'chat' });
    check('6e: res.end() dipanggil', res.ended === true);
    const events = parseWrites(res);
    eq(events[0]?.type, 'message_start', '6e: message_start tetap terkirim');
    eq(events[events.length - 1]?.type, 'stream_error', '6e: event terakhir stream_error');
    const se: any = events[events.length - 1];
    eq(se.errorCode, 'AI_UNAVAILABLE', '6e: errorCode AI_UNAVAILABLE');
    eq(se.retryable, true, '6e: retryable true');
    check('6e: tanpa message_complete pada kegagalan', !events.some((e) => e.type === 'message_complete'));
    check('6e: tanpa content_reset (tak ada delta)', !events.some((e) => e.type === 'content_reset'));
  }

  globalThis.fetch = realFetch;
}

// ===========================================================================
// Ringkasan
// ===========================================================================
console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(', '));
  process.exit(1);
}
console.log('SEMUA TEST AI STREAMING TRANSPORT LOLOS');
