/**
 * EZRAB AI TOOLS — No-Fallback AI Provider Client
 *
 * The ONLY channel the three AI products use to reach a model.
 * Enforces the registry gate: sends `getModelTarget(productId).model` verbatim.
 * Throws/surfaces MODEL_MISMATCH if anything changes it. Never fabricates success.
 */

import { getModelTarget } from './aiModelRegistry';
import { aiToolsError, AIToolsStructuredError, AIToolsErrorCode } from './types';
import { aiGatewayAuthHeaders } from './aiGatewayAuth';

export type { AIProductId } from './aiModelRegistry';

export interface AiToolsRequest {
  productId: 'EZRAB_AI' | 'DED_AI_FAST' | 'DED_AI_DETAIL' | 'DOKUMEN_AI';
  prompt: string;
  systemPrompt?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  imageDataBase64?: string;
  imageMimeType?: string;
  pdfDataBase64?: string;
  mode?: 'fast' | 'advanced';
}

export interface AiToolsSuccess<T = unknown> {
  success: true;
  content: string;
  structured: T | null;
  requestId: string;
  /** Identitas provider/model AKTUAL yang melayani (dari respons gateway /
   * adapter), diteruskan agar provenance hasil tidak perlu menebak.
   * null bila sumber tidak menyediakannya — pemanggil wajib jujur soal itu. */
  provider?: string | null;
  model?: string | null;
}

export type AiToolsResult<T = unknown> = AiToolsSuccess<T> | AIToolsStructuredError;

const MAX_TIMEOUT_MS = 180_000;

/**
 * Map a gateway HTTP failure onto a user-facing error (Fase 3B).
 * Pure + exported for tests. The server's errorCode distinguishes an AUTH
 * rejection (401 — the gateway refused the request) and a DEMO restriction
 * (403 DEMO_RESTRICTED) from an origin rejection (403) — three causes that
 * used to collapse into one generic message.
 *
 * F3 honesty fix: this build ships with AUTH_ENABLED=false — there is NO
 * sign-in screen the user could go to. The old messages ("Silakan login
 * kembali…") instructed an action that does not exist in the app and hid
 * the real cause. Messages now name the actual cause (the gateway/server
 * refused access) and the actions that actually exist: retry, or check
 * the app's access code (kode akses) that gates this deployment.
 */
export function mapGatewayHttpError(
  status: number,
  serverErrorCode: string,
): { code: AIToolsErrorCode; message: string; retryable: boolean } {
  if (status === 401 || serverErrorCode === 'AUTH_REQUIRED') {
    return {
      code: 'AUTH_REQUIRED',
      message:
        'Akses AI ditolak oleh gerbang server. Coba lagi sebentar lagi; bila tetap gagal, periksa kode akses aplikasi Anda.',
      retryable: false,
    };
  }
  if (serverErrorCode === 'DEMO_RESTRICTED') {
    return {
      code: 'DEMO_RESTRICTED',
      message:
        'Mode Demo tidak mengizinkan permintaan ini. Coba permintaan yang lebih sederhana, atau coba lagi nanti.',
      retryable: false,
    };
  }
  const message =
    status === 403
      ? 'AI Online sementara tidak dapat diakses. Silakan coba lagi nanti.'
      : status === 429
        ? 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'
        : status >= 500
          ? 'Layanan AI sedang gangguan. Silakan coba lagi nanti.'
          : 'Layanan AI gagal memproses permintaan.';
  return { code: 'MODEL_ERROR', message, retryable: status >= 500 || status === 429 };
}

/**
 * Index just past the balanced close of the JSON value that starts at
 * `start` (text[start] must be '{' or '['), honouring string literals and
 * backslash escapes so braces inside strings don't affect depth.
 * Returns -1 when the value never balances out.
 */
export function balancedJsonEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Scan `text` for balanced '{'…'}' / '['…']' spans and return the longest
 * one that parses as JSON (after a trailing-comma cleanup), or undefined
 * when nothing parses. Used by extractJson so prose brackets can never
 * hijack payload extraction.
 */
export function scanLongestParseableJson(text: string): unknown {
  let best: unknown = undefined;
  let bestLen = -1;
  let candidates = 0;
  for (let i = 0; i < text.length && candidates < 200; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    candidates++;
    const end = balancedJsonEnd(text, i);
    if (end === -1) continue;
    const slice = text.slice(i, end);
    if (slice.length <= bestLen) continue;
    try {
      best = JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
      bestLen = slice.length;
    } catch {
      /* not valid JSON — keep scanning */
    }
  }
  return best;
}

export class AiToolsProviderClient {
  public async execute<T = unknown>(request: AiToolsRequest): Promise<AiToolsResult<T>> {
    const target = getModelTarget(request.productId);
    const isNode = typeof window === 'undefined';
    const stage = request.productId;

    if (isNode) {
      try {
        const { loadServerEnv } = await import(/* @vite-ignore */ '../../server/config/loadServerEnv');
        loadServerEnv();
        const { chatOpenAiCompatible, chatGemini } = await import(/* @vite-ignore */ '../../server/providers/multiProvider/adapters');
        const payload: any = {
          providerId: target.provider,
          modelId: target.model,
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          jsonMode: Boolean(request.jsonMode),
          temperature: request.temperature ?? 0.1,
          maxTokens: request.maxTokens ?? 6000,
          timeoutMs: Math.min(request.timeoutMs ?? 60000, MAX_TIMEOUT_MS),
          imageDataBase64: request.imageDataBase64,
          imageMimeType: request.imageMimeType || 'image/png',
          pdfDataBase64: request.pdfDataBase64,
          mode: request.mode,
        };
        const result =
          target.provider === 'gemini'
            ? await chatGemini(payload)
            : await chatOpenAiCompatible(payload);

        if (!result || typeof result.content !== 'string' || result.content.trim() === '') {
          return aiToolsError('EMPTY_RESPONSE', stage, 'Model mengembalikan respons kosong.', { retryable: true });
        }

        let structured: T | null = null;
        if (request.jsonMode) {
          try {
            structured = (result.structuredData as T) ?? this.extractJson<T>(result.content);
          } catch {
            return aiToolsError('MALFORMED_JSON', `${stage}:parse`, 'Respons model tidak valid sebagai JSON.', { retryable: true });
          }
        }

        return {
          success: true, content: result.content, structured, requestId: '',
          provider: (result as any)?.provider ?? target.provider,
          model: (result as any)?.model ?? target.model,
        };
      } catch (err: any) {
        const code = this.classifyError(err);
        return aiToolsError(code, `${stage}:provider`, this.friendly(err, code), { retryable: this.isRetryable(code) });
      }
    }

    // Browser path
    try {
      const controller = new AbortController();
      const timeoutMs = Math.min(request.timeoutMs ?? 90000, MAX_TIMEOUT_MS);
      const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs + 1000);
      const resp = await fetch('/api/ai/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await aiGatewayAuthHeaders()) },
        body: JSON.stringify({
          productId: request.productId,
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          jsonMode: Boolean(request.jsonMode),
          temperature: request.temperature ?? 0.1,
          maxTokens: request.maxTokens ?? 6000,
          timeoutMs,
          imageDataBase64: request.imageDataBase64,
          imageMimeType: request.imageMimeType || 'image/png',
          pdfDataBase64: request.pdfDataBase64,
          mode: request.mode,
        }),
      });
      globalThis.clearTimeout(timer);

      if (!resp.ok) {
        /* Phase 3: jangan bocorkan raw JSON / detail internal ke user.
         * Pesan ramah; detail diagnostik tetap di log server via requestId.
         * Fase 3B: errorCode server dibaca untuk membedakan penolakan AUTH
         * (401 — gerbang menolak akses) dan DEMO (403 DEMO_RESTRICTED)
         * dari penolakan origin (403) — ketiganya tadinya melebur jadi satu
         * pesan generik sehingga penyebab asli tak terlihat oleh pengguna. */
        let serverErrorCode = '';
        try {
          const errJson = await resp.json();
          serverErrorCode = String(errJson?.errorCode || '');
        } catch {
          /* body bukan JSON — lanjutkan dengan pemetaan status */
        }
        const mapped = mapGatewayHttpError(resp.status, serverErrorCode);
        return aiToolsError(mapped.code, `${stage}:http`, mapped.message, {
          retryable: mapped.retryable,
        });
      }
      const json = await resp.json();
      if (!json || json.success === false) {
        return aiToolsError(
          json?.errorCode || 'MODEL_ERROR',
          json?.stage || `${stage}:gateway`,
          json?.message || 'Layanan AI gagal memproses permintaan.',
          { retryable: Boolean(json?.retryable) }
        );
      }
      // Mirror the Node path: a "successful" gateway response with empty /
      // whitespace-only content is NOT a success — surface EMPTY_RESPONSE
      // instead of letting callers render an empty bubble/result.
      if (typeof json.content !== 'string' || json.content.trim() === '') {
        return aiToolsError('EMPTY_RESPONSE', `${stage}:http`, 'Model mengembalikan respons kosong.', {
          retryable: true,
        });
      }
      let structured: T | null = null;
      if (request.jsonMode) {
        try {
          structured = (json.structured as T) ?? this.extractJson<T>(json.content);
        } catch {
          return aiToolsError('MALFORMED_JSON', `${stage}:parse`, 'Respons model tidak valid sebagai JSON.', { retryable: true });
        }
      }
      return {
        success: true, content: json.content, structured, requestId: json.requestId,
        provider: typeof json.provider === 'string' ? json.provider : null,
        model: typeof json.model === 'string' ? json.model : null,
      };
    } catch (err: any) {
      const code = err?.name === 'AbortError' ? 'MODEL_TIMEOUT' : this.classifyError(err);
      return aiToolsError(code, `${stage}:http`, this.friendly(err, code), { retryable: true });
    }
  }

  public extractJson<T = unknown>(raw: string): T {
    if (!raw || typeof raw !== 'string') {
      throw new Error('AI returned empty response text');
    }
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence && fence[1]) text = fence[1].trim();
    try {
      return JSON.parse(text) as T;
    } catch {
      /* fall through to the balanced-span scan below */
    }
    // F3 fix: the old heuristic decided array-vs-object from the FIRST '['
    // anywhere in the text — prose containing a bracket (e.g. "[gambar: …]"
    // or "[1]") hijacked the slice and the real payload failed to parse.
    // Now: scan every '{'/'[' start, take its string-aware BALANCED span,
    // keep the spans that actually parse, and return the LONGEST one (the
    // model's payload dwarfs any prose bracket). Type is returned as-is.
    const value = scanLongestParseableJson(text);
    if (value !== undefined) return value as T;
    throw new Error(`Failed to parse AI JSON response: ${text.slice(0, 160)}...`);
  }

  private classifyError(err: any): AIToolsErrorCode {
    const msg = String(err?.message || '');
    if (err instanceof Error && err.name === 'AbortError') return 'MODEL_TIMEOUT';
    if (/404|not found|unknown model|does not exist/i.test(msg)) return 'MODEL_PROVIDER_404';
    if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return 'MODEL_TIMEOUT';
    if (/401|403|auth|api key/i.test(msg)) return 'MODEL_ERROR';
    if (/429|rate/i.test(msg)) return 'MODEL_ERROR';
    if (/empty/i.test(msg)) return 'EMPTY_RESPONSE';
    return 'MODEL_ERROR';
  }

  private isRetryable(code: string): boolean {
    return code === 'MODEL_TIMEOUT' || code === 'MODEL_PROVIDER_404' || code === 'MALFORMED_JSON';
  }

  private friendly(err: any, code: string): string {
    switch (code) {
      case 'MODEL_TIMEOUT':
        return 'Proses AI memakan waktu terlalu lama dan dibatalkan. Silakan coba lagi.';
      case 'MODEL_PROVIDER_404':
        return 'Model yang diminta tidak ditemukan pada penyedia layanan (404). Periksa konfigurasi model.';
      case 'MALFORMED_JSON':
        return err?.message || 'Respons model dalam format yang tidak valid.';
      case 'MODEL_ERROR':
        return 'Penyedia layanan AI menolak permintaan atau terjadi kesalahan otentikasi.';
      default:
        return err?.message || 'Terjadi kesalahan internal saat menghubungi AI.';
    }
  }
}

export const aiToolsProviderClient = new AiToolsProviderClient();
