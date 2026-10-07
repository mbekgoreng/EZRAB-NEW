/**
 * EZRAB AI TOOLS — No-Fallback AI Provider Client
 *
 * The ONLY channel the three AI products use to reach a model.
 * Enforces the registry gate: sends `getModelTarget(productId).model` verbatim.
 * Throws/surfaces MODEL_MISMATCH if anything changes it. Never fabricates success.
 */

import { getModelTarget } from './aiModelRegistry';
import { aiToolsError, AIToolsStructuredError, AIToolsErrorCode } from './types';

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
}

export type AiToolsResult<T = unknown> = AiToolsSuccess<T> | AIToolsStructuredError;

const MAX_TIMEOUT_MS = 180_000;

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

        return { success: true, content: result.content, structured, requestId: '' };
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
        headers: { 'Content-Type': 'application/json' },
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
        const text = await resp.text();
        return aiToolsError('MODEL_ERROR', `${stage}:http`, `HTTP ${resp.status}: ${text.slice(0, 240)}`, {
          retryable: resp.status >= 500 || resp.status === 429,
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
      let structured: T | null = null;
      if (request.jsonMode) {
        try {
          structured = (json.structured as T) ?? this.extractJson<T>(json.content);
        } catch {
          return aiToolsError('MALFORMED_JSON', `${stage}:parse`, 'Respons model tidak valid sebagai JSON.', { retryable: true });
        }
      }
      return { success: true, content: json.content, structured, requestId: json.requestId };
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
      const isArr = text.indexOf('[') !== -1;
      const first = isArr ? text.indexOf('[') : text.indexOf('{');
      if (first !== -1) {
        const last = isArr ? text.lastIndexOf(']') : text.lastIndexOf('}');
        if (last > first) {
          const slice = text.substring(first, last + 1).replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(slice) as T;
        }
      }
      throw new Error(`Failed to parse AI JSON response: ${text.slice(0, 160)}...`);
    }
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
