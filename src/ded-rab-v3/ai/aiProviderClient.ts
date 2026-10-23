/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * AI Provider Client with Adaptive Capability Routing & Robust JSON Extraction
 *
 * Enforces frontend information hiding:
 * In browser environment, raw provider/model IDs are NEVER sent or received.
 * The client communicates exclusively using official EZRAB public AI identities:
 * - EZRAB Vision (Document/Image understanding, DED page reading)
 * - EZRAB AI Pro (Complex reasoning, construction inventory, DED -> RAB)
 * - EZRAB AI 1.3 (Quick assistance & simple questions)
 * - EZRAB Core (Internal orchestration & deterministic math)
 */

import { aiGatewayAuthHeaders } from '../../ai-tools/aiGatewayAuth';

export type DedAiMode = 'quick' | 'advanced' | 'vision' | 'internal';

// ============================================================================
// F5 (4.4): coded errors + disciplined retry policy.
// Before this fix executeChat retried EVERY failure 3× (including 401s and
// malformed JSON — deterministic failures that can never heal by retrying),
// re-sending the full payload (incl. base64 PDFs) each time; the browser
// fetch had no timeout; and on !resp.ok it threw `HTTP <status>: <raw body>`
// which callers displayed verbatim to users, leaking server internals.
// Now: errors carry a stable code + a safe user-facing message; retries are
// granted ONLY to network failures, timeouts, 429 and 5xx (max 2 retries).
// ============================================================================

export type AiClientErrorCode =
  | 'AUTH_REQUIRED'
  | 'DEMO_RESTRICTED'
  | 'RATE_LIMITED'
  | 'ACCESS_DENIED'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'EMPTY_RESPONSE'
  | 'MALFORMED_JSON'
  | 'MODEL_ERROR';

export class AiProviderClientError extends Error {
  code: AiClientErrorCode;
  retryable: boolean;
  status?: number;

  constructor(
    code: AiClientErrorCode,
    message: string,
    opts?: { retryable?: boolean; status?: number }
  ) {
    super(message);
    this.name = 'AiProviderClientError';
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.status = opts?.status;
  }
}

/** Map an HTTP status / server error code onto a safe, coded error. */
export function mapAiGatewayError(
  status: number | null | undefined,
  serverErrorCode?: string | null
): AiProviderClientError {
  const serverCode = serverErrorCode || '';
  if (status === 401 || serverCode === 'AUTH_REQUIRED') {
    return new AiProviderClientError(
      'AUTH_REQUIRED',
      'Akses AI ditolak oleh gerbang server. Coba lagi sebentar lagi; bila tetap gagal, periksa kode akses aplikasi Anda.',
      { status: status ?? undefined }
    );
  }
  if (serverCode === 'DEMO_RESTRICTED') {
    return new AiProviderClientError(
      'DEMO_RESTRICTED',
      'Mode Demo tidak mengizinkan permintaan ini. Coba permintaan yang lebih sederhana, atau coba lagi nanti.',
      { status: status ?? undefined }
    );
  }
  if (status === 429 || serverCode === 'RATE_LIMITED') {
    return new AiProviderClientError(
      'RATE_LIMITED',
      'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
      { retryable: true, status: status ?? undefined }
    );
  }
  if (status === 403) {
    return new AiProviderClientError(
      'ACCESS_DENIED',
      'AI Online sementara tidak dapat diakses. Silakan coba lagi nanti.',
      { status }
    );
  }
  if (typeof status === 'number' && status >= 500) {
    return new AiProviderClientError(
      'SERVICE_UNAVAILABLE',
      'Layanan AI sedang gangguan. Silakan coba lagi nanti.',
      { retryable: true, status }
    );
  }
  return new AiProviderClientError('MODEL_ERROR', 'Layanan AI gagal memproses permintaan.', {
    status: status ?? undefined,
  });
}

/**
 * Retry policy (pure, exported for tests): retry ONLY network failures,
 * timeouts, 429 and 5xx. NEVER retry 401/other 4xx or malformed responses —
 * those are deterministic and retrying only re-sends the payload in vain.
 */
export function shouldRetryAiError(err: unknown): boolean {
  if (err instanceof AiProviderClientError) return err.retryable;
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  if (typeof status === 'number') {
    return status === 429 || status >= 500;
  }
  if (err instanceof TypeError) return true; // fetch() network failure
  const msg = String((err as any)?.message || '');
  if (/failed to parse|malformed|invalid json|unexpected token/i.test(msg)) return false;
  if (/\b401\b|\b403\b|unauthoriz|forbidden|api.?key/i.test(msg)) return false;
  if (/\b429\b|rate.?limit|too many requests/i.test(msg)) return true;
  if (/\b5\d\d\b|server error|overloaded|bad gateway|service unavailable/i.test(msg)) return true;
  if (/fetch|network|econn|socket|timed? ?out|timeout|aborted/i.test(msg)) return true;
  return false;
}

export const AI_CLIENT_MAX_ATTEMPTS = 3; // 1 initial + max 2 retries
export const AI_CLIENT_RETRY_BASE_MS = 300;

export interface AiRequestOptions {
  prompt: string;
  systemPrompt?: string;
  imageDataBase64?: string;
  imageMimeType?: string;
  pdfDataBase64?: string;
  jsonMode?: boolean;
  mode?: DedAiMode;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  // Internal server/node compatibility only:
  modelId?: string;
  providerId?: string;
}

export interface AiResponseResult<T = any> {
  content: string;
  data?: T;
  assistant: string;
  mode: DedAiMode;
  status: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  providerId?: string;
  modelId?: string;
  keyAlias?: string;
}

export class AiProviderClient {
  private static instance: AiProviderClient;

  private constructor() {}

  public static getInstance(): AiProviderClient {
    if (!AiProviderClient.instance) {
      AiProviderClient.instance = new AiProviderClient();
    }
    return AiProviderClient.instance;
  }

  /**
   * Helper to robustly extract and parse JSON from an LLM response string.
   */
  public extractJson<T = any>(rawText: string): T {
    if (!rawText || typeof rawText !== 'string') {
      throw new Error('AI returned empty response text');
    }

    let text = rawText.trim();

    // 1. Remove markdown code block fences if present
    if (text.includes('```')) {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        text = match[1].trim();
      }
    }

    // 2. Direct parse attempt
    try {
      return JSON.parse(text) as T;
    } catch {
      // 3. Find outermost JSON object or array brackets
      const firstBrace = text.indexOf('{');
      const firstBracket = text.indexOf('[');
      let startIndex = -1;
      let isObject = true;

      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIndex = firstBrace;
        isObject = true;
      } else if (firstBracket !== -1) {
        startIndex = firstBracket;
        isObject = false;
      }

      if (startIndex !== -1) {
        const lastIndex = isObject ? text.lastIndexOf('}') : text.lastIndexOf(']');
        if (lastIndex > startIndex) {
          const slice = text.substring(startIndex, lastIndex + 1);
          try {
            return JSON.parse(slice) as T;
          } catch {
            // Clean common JSON issues: trailing commas before closing braces
            const cleaned = slice
              .replace(/,\s*([}\]])/g, '$1')
              .replace(/[\u201C\u201D]/g, '"');
            return JSON.parse(cleaned) as T;
          }
        }
      }

      throw new Error(`Failed to parse AI JSON response: ${text.slice(0, 200)}...`);
    }
  }

  /**
   * Dispatches AI request via capability abstraction layer.
   * In browser: sends capability mode only to /api/ai/multi-provider/execute.
   * In Node/test: executes via server-side capability router directly.
   */
  public async executeChat<T = any>(options: AiRequestOptions): Promise<AiResponseResult<T>> {
    const isNode = typeof window === 'undefined';
    const hasMultimodal = Boolean(options.imageDataBase64 || options.pdfDataBase64);
    const resolvedMode: DedAiMode = options.mode || (hasMultimodal ? 'vision' : 'advanced');
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < AI_CLIENT_MAX_ATTEMPTS) {
      attempt++;
      try {
        if (isNode) {
          // Direct server execution via Capability Router (Node runtime only)
          const envMod = ['..', '..', '..', 'server', 'config', 'loadServerEnv'].join('/');
          const routerMod = ['..', '..', '..', 'server', 'ai', 'aiCapabilityRouter'].join('/');
          const { loadServerEnv } = await import(/* @vite-ignore */ envMod);
          loadServerEnv();

          const { executeAiCapability } = await import(/* @vite-ignore */ routerMod);

          const result: any = await executeAiCapability({
            mode: resolvedMode,
            prompt: options.prompt,
            systemPrompt: options.systemPrompt,
            imageDataBase64: options.imageDataBase64,
            imageMimeType: options.imageMimeType || 'image/png',
            pdfDataBase64: options.pdfDataBase64,
            jsonMode: options.jsonMode,
            temperature: options.temperature ?? 0.1,
            maxTokens: options.maxTokens || 4000,
            timeoutMs: options.timeoutMs || 45000,
            internalProviderId: options.providerId,
            internalModelId: options.modelId,
          });

          // F5 (4.4): an explicit failure flag or an empty payload is a
          // failure here too — never a "successful" empty result.
          if (result?.success === false) {
            throw mapAiGatewayError(null, result?.errorCode || result?.error);
          }
          if (
            (typeof result?.content !== 'string' || result.content.trim().length === 0) &&
            !result?.structuredData
          ) {
            throw new AiProviderClientError(
              'EMPTY_RESPONSE',
              'Model mengembalikan respons kosong.'
            );
          }

          let parsedData: T | undefined = result.structuredData;
          if (!parsedData && options.jsonMode && result.content) {
            try {
              parsedData = this.extractJson<T>(result.content);
            } catch {
              throw new AiProviderClientError(
                'MALFORMED_JSON',
                'Respons AI tidak dapat dibaca sebagai JSON yang valid.'
              );
            }
          }

          return {
            content: result.content,
            data: parsedData,
            assistant: result.assistant,
            mode: result.mode,
            status: result.status,
          };
        } else {
          // Browser environment: Request by capability mode ONLY. Real provider/model NEVER sent!
          const timeoutMs = options.timeoutMs || 45000;
          const payload = {
            mode: resolvedMode,
            prompt: options.prompt,
            systemPrompt: options.systemPrompt,
            imageDataBase64: options.imageDataBase64,
            imageMimeType: options.imageMimeType || 'image/png',
            pdfDataBase64: options.pdfDataBase64,
            jsonMode: options.jsonMode,
            temperature: options.temperature ?? 0.1,
            maxTokens: options.maxTokens || 4000,
            timeoutMs,
          };

          // F5 (4.4): AbortController deadline (previously the browser fetch
          // could hang forever).
          const controller = new AbortController();
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs);

          let resp: Response;
          try {
            resp = await fetch('/api/ai/multi-provider/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(await aiGatewayAuthHeaders()) },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
          } catch (fetchErr: any) {
            if (timedOut) {
              throw new AiProviderClientError(
                'TIMEOUT',
                'Permintaan AI melebihi batas waktu. Silakan coba lagi.',
                { retryable: true }
              );
            }
            throw new AiProviderClientError(
              'NETWORK_ERROR',
              'Tidak dapat terhubung ke server AI. Periksa koneksi lalu coba lagi.',
              { retryable: true }
            );
          } finally {
            clearTimeout(timer);
          }

          if (!resp.ok) {
            // F5 (4.4): NEVER surface the raw response body to users. Only a
            // machine error code is read from it; the message is mapped.
            let serverErrorCode: string | null = null;
            try {
              const errJson = await resp.clone().json();
              serverErrorCode = errJson?.errorCode || errJson?.error || null;
            } catch {
              serverErrorCode = null;
            }
            throw mapAiGatewayError(resp.status, serverErrorCode);
          }

          let resJson: any;
          try {
            resJson = await resp.json();
          } catch {
            throw new AiProviderClientError(
              'MALFORMED_JSON',
              'Respons AI tidak dapat dibaca sebagai JSON yang valid.'
            );
          }

          // F5 (4.4): honour the payload success flag on HTTP 200, and treat
          // an empty payload as a failure rather than a "successful" blank.
          if (resJson?.success === false) {
            throw mapAiGatewayError(resp.status, resJson?.errorCode || resJson?.error);
          }
          if (
            (typeof resJson?.content !== 'string' || resJson.content.trim().length === 0) &&
            !resJson?.structuredData
          ) {
            throw new AiProviderClientError(
              'EMPTY_RESPONSE',
              'Model mengembalikan respons kosong.'
            );
          }

          let parsedData: T | undefined = undefined;
          if (options.jsonMode) {
            if (resJson.structuredData) {
              parsedData = resJson.structuredData;
            } else {
              try {
                parsedData = this.extractJson<T>(resJson.content);
              } catch {
                throw new AiProviderClientError(
                  'MALFORMED_JSON',
                  'Respons AI tidak dapat dibaca sebagai JSON yang valid.'
                );
              }
            }
          }

          const assistant =
            resJson.assistant ||
            (resolvedMode === 'vision' ? 'EZRAB Vision' : resolvedMode === 'quick' ? 'EZRAB AI 1.3' : 'EZRAB AI Pro');

          return {
            content: resJson.content || '',
            data: parsedData,
            assistant,
            mode: resolvedMode,
            status: resJson.status || 'completed',
          };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[AiProviderClient] Attempt ${attempt}/${AI_CLIENT_MAX_ATTEMPTS} failed:`,
          err?.message
        );
        // F5 (4.4): retry ONLY retryable failures (network/timeout/429/5xx).
        if (attempt < AI_CLIENT_MAX_ATTEMPTS && shouldRetryAiError(err)) {
          await new Promise((r) => setTimeout(r, AI_CLIENT_RETRY_BASE_MS * attempt));
          continue;
        }
        break;
      }
    }

    // Final error keeps its code + safe message; unknown errors collapse to a
    // generic coded failure (raw internals stay in the console, not the UI).
    if (lastError instanceof AiProviderClientError) throw lastError;
    throw new AiProviderClientError('MODEL_ERROR', 'Layanan AI gagal memproses permintaan.');
  }
}

export const aiProviderClient = AiProviderClient.getInstance();
