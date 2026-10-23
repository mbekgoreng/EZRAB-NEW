/**
 * KLASTER F3 — Chat AI robustness regressions.
 * Run: npx vitest run src/test/chatAiF3.test.ts
 *
 * Covers: tool-call scanning (key order, nested args, multi-call, malformed),
 * extractJson prose-bracket safety, browser-path EMPTY_RESPONSE, and the
 * service-level guarantee that raw tool-call JSON / empty replies never
 * reach the user.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { scanToolCalls, MAX_TOOL_CALLS } from '../ai-tools/ezrab-ai/toolCallParser';
import { aiToolsProviderClient, AiToolsResult } from '../ai-tools/providerClient';
import { ezrabAiService } from '../ai-tools/ezrab-ai/service';
import { renderMarkdown } from '../ai-tools/ezrab-ai/markdown';

describe('scanToolCalls — robust tool-call extraction', () => {
  it('parses the classic tool-first shape', () => {
    const s = scanToolCalls('{"tool":"get_project_total","args":{"projectId":"p1"}}');
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].toolName).toBe('get_project_total');
    expect(s.calls[0].args).toEqual({ projectId: 'p1' });
    expect(s.malformed).toBe(false);
    expect(s.cleanText).toBe('');
  });

  it('parses args BEFORE tool (key order is irrelevant)', () => {
    const s = scanToolCalls('{"args":{"q":"beton"},"tool":"search_items"}');
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].toolName).toBe('search_items');
    expect(s.calls[0].args).toEqual({ q: 'beton' });
  });

  it('keeps NESTED args objects intact (no truncation at first closing brace)', () => {
    const s = scanToolCalls(
      '{"tool":"calc","args":{"spec":{"dims":{"w":2,"h":3}},"qty":4}} lanjutan teks',
    );
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].args).toEqual({ spec: { dims: { w: 2, h: 3 } }, qty: 4 });
    expect(s.cleanText).toBe('lanjutan teks');
  });

  it('extracts multiple sequential calls and caps at MAX_TOOL_CALLS', () => {
    const text = [
      '{"tool":"a","args":{}}',
      '{"tool":"b","args":{"x":1}}',
      '{"tool":"c","args":{}}',
      '{"tool":"d","args":{}}',
    ].join('\n');
    const s = scanToolCalls(text);
    expect(s.calls.map((c) => c.toolName)).toEqual(['a', 'b', 'c']);
    expect(s.calls).toHaveLength(MAX_TOOL_CALLS);
    // Even the un-executed 4th call must not leak as raw JSON.
    expect(s.cleanText).not.toContain('"tool"');
    expect(s.cleanText).not.toContain('"d"');
  });

  it('strips prose around a call but keeps the prose', () => {
    const s = scanToolCalls('Baik, saya cek dulu.\n{"tool":"get_x","args":{}}\nSebentar ya.');
    expect(s.calls).toHaveLength(1);
    expect(s.cleanText).toContain('Baik, saya cek dulu.');
    expect(s.cleanText).toContain('Sebentar ya.');
    expect(s.cleanText).not.toContain('{');
  });

  it('marks unparseable tool JSON as malformed and hides it (never runs with {} args)', () => {
    const s = scanToolCalls('{"tool": "get_x", "args": {"id": p1}}');
    expect(s.calls).toHaveLength(0);
    expect(s.malformed).toBe(true);
    expect(s.cleanText).toBe('');
  });

  it('marks a call whose args is not an object as malformed', () => {
    const s = scanToolCalls('{"tool":"get_x","args":"p1"}');
    expect(s.calls).toHaveLength(0);
    expect(s.malformed).toBe(true);
  });

  it('does NOT treat unrelated JSON as a tool call', () => {
    const s = scanToolCalls('Hasilnya {"total": 5000, "satuan": "m3"} ya.');
    expect(s.calls).toHaveLength(0);
    expect(s.malformed).toBe(false);
    expect(s.cleanText).toContain('{"total": 5000');
  });

  it('plain text passes through untouched', () => {
    const s = scanToolCalls('Halo! Ada yang bisa saya bantu?');
    expect(s.calls).toHaveLength(0);
    expect(s.malformed).toBe(false);
    expect(s.cleanText).toBe('Halo! Ada yang bisa saya bantu?');
  });
});

describe('renderMarkdown — chat bubble rendering', () => {
  it('multi-line paragraph renders a real <br/>, never the literal text "<br/>"', () => {
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, ...renderMarkdown('baris satu\nbaris dua')));
    expect(html).toContain('baris satu<br/>baris dua');
    expect(html).not.toContain('&lt;br');
  });

  it('quoted text keeps its quote marks and is NOT rewritten into bold', () => {
    const html = renderToStaticMarkup(
      React.createElement(React.Fragment, null, ...renderMarkdown('Dokumen "Berita Acara" sudah siap.')),
    );
    expect(html).toContain('"Berita Acara"');
    expect(html).not.toContain('<strong>Berita Acara</strong>');
  });

  it('real **bold** still renders as bold', () => {
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, ...renderMarkdown('Total **Rp 5.000** ya.')));
    expect(html).toContain('<strong>Rp 5.000</strong>');
  });
});

describe('extractJson — prose brackets cannot hijack the payload', () => {
  it('ignores a bracketed prose word before an object payload', () => {
    const v = aiToolsProviderClient.extractJson('Catatan [sementara]: {"total": 42}');
    expect(v).toEqual({ total: 42 });
  });

  it('a tiny prose array does not beat the real object payload', () => {
    const v = aiToolsProviderClient.extractJson('lihat [1] lalu {"items":[1,2,3]}');
    expect(v).toEqual({ items: [1, 2, 3] });
  });

  it('extracts an array payload surrounded by prose', () => {
    const v = aiToolsProviderClient.extractJson('Daftar: [{"a":1},{"a":2}] selesai.');
    expect(v).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles fenced JSON and trailing commas (existing callers keep working)', () => {
    expect(aiToolsProviderClient.extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(aiToolsProviderClient.extractJson('{"a":1,}')).toEqual({ a: 1 });
  });

  it('still throws on true garbage', () => {
    expect(() => aiToolsProviderClient.extractJson('tidak ada json di sini')).toThrow();
  });
});

describe('providerClient browser path — EMPTY_RESPONSE on empty success', () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
  });
  afterAll(() => {
    delete (globalThis as any).window;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function stubFetchJson(body: unknown, ok = true, status = 200) {
    globalThis.fetch = vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
    })) as any;
  }

  it('whitespace-only content on HTTP 200 becomes EMPTY_RESPONSE, not success', async () => {
    stubFetchJson({ success: true, content: '   \n  ', requestId: 'r1' });
    const res: AiToolsResult = await aiToolsProviderClient.execute({
      productId: 'EZRAB_AI',
      prompt: 'halo',
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe('EMPTY_RESPONSE');
  });

  it('missing content on HTTP 200 becomes EMPTY_RESPONSE', async () => {
    stubFetchJson({ success: true, requestId: 'r2' });
    const res = await aiToolsProviderClient.execute({ productId: 'EZRAB_AI', prompt: 'halo' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe('EMPTY_RESPONSE');
  });

  it('real content still succeeds on the browser path', async () => {
    stubFetchJson({ success: true, content: 'Halo juga!', requestId: 'r3' });
    const res = await aiToolsProviderClient.execute({ productId: 'EZRAB_AI', prompt: 'halo' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.content).toBe('Halo juga!');
  });
});

describe('ezrabAiService.send — user never sees raw tool JSON or an empty bubble', () => {
  const original = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
  afterAll(() => {
    (aiToolsProviderClient as any).execute = original;
  });

  function stubExecute(content: string) {
    (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> => ({
      success: true,
      content,
      structured: null,
      requestId: 'stub',
    });
  }

  it('malformed tool call → clear fallback, no raw JSON, tool NOT executed', async () => {
    stubExecute('{"tool": "get_project_total", "args": {"id": rusak}}');
    const res = await ezrabAiService.send({
      messages: [{ role: 'user', content: 'berapa total proyek?' }],
    });
    expect(res.success).toBe(true);
    expect(res.reply).not.toContain('"tool"');
    expect(res.reply).toContain('tidak dapat dipahami');
    expect(res.toolCalls).toBeUndefined();
  });

  it('whitespace-only model content → structured EMPTY_RESPONSE failure', async () => {
    stubExecute('   ');
    const res = await ezrabAiService.send({
      messages: [{ role: 'user', content: 'halo' }],
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMPTY_RESPONSE');
    expect(res.reply.trim()).not.toBe('');
  });
});
