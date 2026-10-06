import {
  AiApiClient,
  AiApiError,
  normalizeAiResponse,
  sanitizeResponseText,
  getFriendlyErrorMessage,
} from '../services/aiApiClient';
import { canRetryRequest, requestFinishedState, shouldAppendUserMessage } from '../services/aiChatRequestState';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function runAiApiClientTests(): Promise<void> {
  console.log('🧪 RUNNING FRONTEND AI API CLIENT & RESPONSE CONTRACT HARDENING TESTS');

  const originalFetch = globalThis.fetch;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Request payload safety — only sends explicit read-only context
    // -------------------------------------------------------------------------
    let capturedBody = '';
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body || '');
      return new Response(
        JSON.stringify({
          success: true,
          conversationId: 'c1',
          messageId: 'm1',
          content: 'jawaban context',
          toolCallsExecuted: [],
          status: 'COMPLETED',
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    await new AiApiClient('/api/ai').sendMessage({
      message: 'status',
      projectId: 'PRJ-1',
      projectContext: { unsafe: 'browser data must not cross this boundary' } as any,
    });

    assert(!capturedBody.includes('projectContext'), 'Client must not send browser projectContext');
    assert(!capturedBody.includes('localStorage'), 'Client must never serialize browser storage');
    assert(!capturedBody.includes('password'), 'Client must never leak passwords');
    assert(!capturedBody.includes('token'), 'Client must never serialize tokens');
    console.log('✅ TEST 1 PASSED: Request payload safety verified');

    // -------------------------------------------------------------------------
    // TEST 2 (A): Response AI Normal
    // -------------------------------------------------------------------------
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          conversationId: 'conv-99',
          messageId: 'msg-99',
          requestId: 'req-99',
          content: 'Total RAB proyek adalah Rp 2.850.000.000',
          status: 'COMPLETED',
          contextSource: 'frontend_project_context',
          toolCallsExecuted: [],
        }),
        { status: 200 }
      )) as typeof fetch;

    const resA = await new AiApiClient('/api/ai').sendMessage({
      message: 'Berapa total RAB?',
      projectId: 'PRJ-1',
    });
    assert(resA.content === 'Total RAB proyek adalah Rp 2.850.000.000', 'Normal AI content matches');
    assert(resA.status === 'COMPLETED', 'Status is COMPLETED');
    assert(resA.conversationId === 'conv-99', 'Conversation ID is preserved');
    assert(resA.isError === false, 'isError must be false');
    console.log('✅ TEST 2 (A) PASSED: Normal AI response normalized');

    // -------------------------------------------------------------------------
    // TEST 3 (B): Response FAQ / Static Knowledge
    // -------------------------------------------------------------------------
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          intent: 'IDENTITY',
          message: 'EZRAB adalah platform estimasi dan manajemen biaya konstruksi modern.',
          data: {
            knowledge: {
              cache_hit: true,
              requires_ai_core: false,
            },
          },
        }),
        { status: 200 }
      )) as typeof fetch;

    const resB = await new AiApiClient('/api/ai').sendMessage({
      message: 'Apa itu EZRAB?',
      projectId: 'PRJ-1',
    });
    assert(
      resB.content === 'EZRAB adalah platform estimasi dan manajemen biaya konstruksi modern.',
      'FAQ static message normalized to content'
    );
    assert(resB.intent === 'IDENTITY', 'Intent is preserved');
    assert(resB.status === 'COMPLETED', 'Status defaults to COMPLETED');
    assert(resB.isError === false, 'FAQ response is not an error');
    console.log('✅ TEST 3 (B) PASSED: FAQ / static knowledge response normalized');

    // -------------------------------------------------------------------------
    // TEST 4 (C): Response Date / Time
    // -------------------------------------------------------------------------
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          intent: 'DATE_TIME',
          message: 'Sekarang tanggal 13 September 2026, pukul 10:30 WIB.',
          data: {},
        }),
        { status: 200 }
      )) as typeof fetch;

    const resC = await new AiApiClient('/api/ai').sendMessage({
      message: 'Sekarang tanggal berapa?',
      projectId: 'PRJ-1',
    });
    assert(resC.content.includes('13 September 2026'), 'Date/time message is normalized');
    assert(resC.intent === 'DATE_TIME', 'Intent is DATE_TIME');
    console.log('✅ TEST 4 (C) PASSED: Date/time response normalized');

    // -------------------------------------------------------------------------
    // TEST 5 (D): Read-only tool execution response
    // -------------------------------------------------------------------------
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          message: 'Berikut ringkasan RAB proyek: Total Rp 2.850.000.000 dengan 25 item pekerjaan.',
          tools_used: ['search_rab_items'],
          data: {
            tool_results: [{ tool_name: 'search_rab_items', count: 25 }],
          },
        }),
        { status: 200 }
      )) as typeof fetch;

    const resD = await new AiApiClient('/api/ai').sendMessage({
      message: 'Ringkas RAB proyek ini.',
      projectId: 'PRJ-1',
    });
    assert(resD.content.includes('Berikut ringkasan RAB proyek'), 'Tool output text normalized');
    assert(Array.isArray(resD.toolCallsExecuted) && resD.toolCallsExecuted.length > 0, 'Tool results retained in metadata');
    assert(!resD.content.includes('"tool_name"'), 'Raw tool JSON must not be in content string');
    console.log('✅ TEST 5 (D) PASSED: Read-only tool execution response normalized');

    // -------------------------------------------------------------------------
    // TEST 6 (E): Error response (HTTP 502 / AI_CORE_UNAVAILABLE)
    // -------------------------------------------------------------------------
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: 'ERROR',
          content: 'AI Core belum dapat dihubungi.',
          error: {
            code: 'AI_CORE_UNAVAILABLE',
            retryable: true,
          },
        }),
        { status: 502 }
      )) as typeof fetch;

    let errorCaught: any = null;
    try {
      await new AiApiClient('/api/ai').sendMessage({
        message: 'Hitung RAB',
        projectId: 'PRJ-1',
      });
    } catch (err: any) {
      errorCaught = err;
    }
    assert(errorCaught instanceof AiApiError, 'Error throws AiApiError');
    assert(errorCaught.code === 'AI_CORE_UNAVAILABLE', 'Error code is AI_CORE_UNAVAILABLE');
    assert(errorCaught.retryable === true, 'Error is retryable');
    console.log('✅ TEST 6 (E) PASSED: AI_CORE_UNAVAILABLE error normalized with retryable=true');

    // -------------------------------------------------------------------------
    // TEST 6A: Gateway-specific safe messages and retryability
    // -------------------------------------------------------------------------
    const expectedMessages: Record<string, string> = {
      INVALID_REQUEST: 'Permintaan belum valid.',
      MESSAGE_TOO_LONG: 'Pesan terlalu panjang.',
      PROJECT_CONTEXT_TOO_LARGE: 'Konteks proyek terlalu besar.',
      INVALID_PROJECT_CONTEXT: 'Konteks proyek tidak valid.',
      RATE_LIMITED: 'Permintaan terlalu banyak.',
      AI_CORE_UNAVAILABLE: 'Layanan AI sedang tidak tersedia.',
      AI_CORE_TIMEOUT: 'Proses AI membutuhkan waktu terlalu lama.',
      INTERNAL_ERROR: 'Terjadi gangguan internal',
      SERVICE_TOKEN_INVALID: 'Terjadi masalah konfigurasi layanan AI.',
    };
    for (const [code, expected] of Object.entries(expectedMessages)) {
      assert(getFriendlyErrorMessage(code).startsWith(expected), `Safe message mapped for ${code}`);
    }

    globalThis.fetch = (async () => new Response(JSON.stringify({
      success: false, requestId: 'req-rate-1', error: { code: 'RATE_LIMITED', retryable: true },
    }), { status: 429 })) as typeof fetch;
    try {
      await new AiApiClient('/api/ai').sendMessage({ message: 'halo', projectId: 'PRJ-1' });
      throw new Error('Expected rate-limit error');
    } catch (err) {
      assert(err instanceof AiApiError && err.code === 'RATE_LIMITED', 'Rate limit error code is retained');
      assert(err instanceof AiApiError && err.retryable, 'Rate limit is retryable only when gateway says so');
      assert(err instanceof AiApiError && err.requestId === 'req-rate-1', 'Safe request ID is retained for support');
    }

    globalThis.fetch = (async () => new Response(JSON.stringify({
      success: false, requestId: 'req-invalid-1', error: { code: 'INVALID_REQUEST', retryable: false },
    }), { status: 400 })) as typeof fetch;
    try {
      await new AiApiClient('/api/ai').sendMessage({ message: 'halo', projectId: 'PRJ-1' });
      throw new Error('Expected invalid-request error');
    } catch (err) {
      assert(err instanceof AiApiError && !err.retryable, 'Non-retryable gateway error stays non-retryable');
    }
    console.log('✅ TEST 6A PASSED: Gateway error messages, rate limit, and request ID verified');

    // -------------------------------------------------------------------------
    // TEST 6B: Client timeout and backend-only URL boundary
    // -------------------------------------------------------------------------
    let calledUrl = '';
    globalThis.fetch = (async (url: string) => {
      calledUrl = url;
      throw new DOMException('aborted', 'AbortError');
    }) as typeof fetch;
    try {
      await new AiApiClient('/api/ai').sendMessage({ message: 'halo', projectId: 'PRJ-1' });
      throw new Error('Expected timeout');
    } catch (err) {
      assert(err instanceof AiApiError && err.code === 'AI_CORE_TIMEOUT', 'Abort maps to AI_CORE_TIMEOUT');
      assert(err instanceof AiApiError && err.retryable, 'Timeout is retryable');
      assert(!calledUrl.includes('11434') && !calledUrl.includes('ollama'), 'Frontend calls backend API, never Ollama');
    }
    console.log('✅ TEST 6B PASSED: Timeout and no-direct-Ollama boundary verified');

    // -------------------------------------------------------------------------
    // TEST 6C: Retry lifecycle never creates a second user message
    // -------------------------------------------------------------------------
    const retryRequest = { message: 'halo', projectId: 'PRJ-1' };
    assert(shouldAppendUserMessage(false), 'Initial attempt appends one user message');
    assert(!shouldAppendUserMessage(true), 'Retry must not append another user message');
    assert(canRetryRequest(retryRequest, 'PRJ-1'), 'Retry keeps the active-project request snapshot');
    assert(!canRetryRequest(retryRequest, 'PRJ-2'), 'Retry is blocked after project changes');
    const finishedState = requestFinishedState();
    assert(!finishedState.isLoading && finishedState.retryingMessageId === null, 'Loading state resets after every settled request');
    console.log('✅ TEST 6C PASSED: Retry deduplication and loading reset verified');

    // -------------------------------------------------------------------------
    // TEST 7 (F): MOCK / AUTO provider normalization
    // -------------------------------------------------------------------------
    const mockNormalized = normalizeAiResponse(
      {
        content: 'Estimasi dinding bata merah: Rp 14.500.000',
      },
      { providerMode: 'MOCK' }
    );
    assert(mockNormalized.providerMode === 'MOCK', 'providerMode preserved');
    assert(mockNormalized.content.includes('Estimasi dinding bata merah'), 'Mock content preserved');
    console.log('✅ TEST 7 (F) PASSED: MOCK mode normalization verified');

    // -------------------------------------------------------------------------
    // TEST 8 (G): Empty or malformed response resilience
    // -------------------------------------------------------------------------
    const emptyNormalized = normalizeAiResponse(null);
    assert(emptyNormalized.content.length > 0, 'Empty null response gets fallback message');
    assert(emptyNormalized.content === 'Maaf, EZRAB AI belum menghasilkan jawaban. Silakan coba lagi.', 'Friendly empty fallback used');

    const undefinedNormalized = normalizeAiResponse(undefined);
    assert(undefinedNormalized.content.length > 0, 'Undefined response gets fallback message');

    const emptyObjNormalized = normalizeAiResponse({});
    assert(emptyObjNormalized.content.length > 0, 'Empty object gets fallback message');
    assert(!emptyObjNormalized.content.includes('[object Object]'), 'Never outputs [object Object]');
    console.log('✅ TEST 8 (G) PASSED: Empty and malformed response resilience verified');

    // -------------------------------------------------------------------------
    // TEST 9: Sanitizer prevents sensitive credential and stack trace leakage
    // -------------------------------------------------------------------------
    const stackTraceText = 'Error: DB failure\n    at Connection.query (/var/app/db.js:42:10)\nTraceback (most recent call last)';
    const sanitizedStack = sanitizeResponseText(stackTraceText, true);
    assert(!sanitizedStack.includes('/var/app'), 'Stack trace must be scrubbed');
    assert(sanitizedStack.includes('Terjadi kendala internal'), 'Safe friendly replacement provided');

    const secretText = 'Authorization: Bearer secret_token_123456789';
    const sanitizedSecret = sanitizeResponseText(secretText, false);
    assert(!sanitizedSecret.includes('secret_token'), 'Bearer token must be scrubbed');
    console.log('✅ TEST 9 PASSED: Security and credential sanitizer verified');

    console.log('====================================================');
    console.log('🏁 ALL FRONTEND CONTRACT HARDENING TESTS PASSED (100%)');
    console.log('====================================================');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runAiApiClientTests();
