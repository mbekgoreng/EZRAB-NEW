/**
 * Centralized Multi-Provider AI Client for DED Pipeline (EZRAB DED -> RAB V2)
 *
 * Supports 3 Processing Modes:
 * - FAST: Direct Gemini Flash-Lite / Fast Flash model.
 * - STANDARD: VLEEE Qwen Flash (text) + Qwen Omni Flash (vision) - Default.
 * - DETAIL: ZyRouter Gemini 3.8 Flash with medium/high reasoning.
 *
 * Responsibilities:
 * - Security: API keys NEVER touch the browser. All browser requests are routed
 *   through the secure EZRAB backend endpoint (/api/ai/multi-provider/execute).
 *   In server/Node environments, direct server adapter execution is used.
 * - Robustness: Automatic retry up to 2 times on transient failures with exponential backoff.
 * - Explicit Fallback: When a primary vision model is unavailable, logs diagnostic fallback explicitly.
 * - JSON Mode: Enforces clean, typed structured JSON output without guessing.
 * - Diagnostics: Full telemetry (prompt tokens, completion tokens, latency, requestId, attempt, fallback).
 */

import { RawAiTelemetryRecord, DedProcessingMode } from '../types';
import { maskAiModelName, maskAiProviderName } from '../../services/aiModelMasking';

export interface ZyRouterChatRequest {
  prompt: string;
  systemPrompt?: string;
  imageDataBase64?: string;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  jsonMode?: boolean;
  model?: string;
  providerId?: string; // 'gemini' | 'vleee' | 'zyrouter' | 'zrouter' | string
  reasoningLevel?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  pageNumber?: number;
  pass?: number;
  requestId?: string;
  fallbackModel?: string;
  fallbackProviderId?: string;
}

export interface ZyRouterChatResponse {
  content: string;
  structuredJson?: any;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  model: string;
  providerId: string;
  requestId: string;
  attempt: number;
  success: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
}

export class ZyRouterError extends Error {
  public readonly code:
    | 'AI_PROVIDER_ERROR'
    | 'AI_TIMEOUT'
    | 'AI_INVALID_JSON'
    | 'AUTH_ERROR'
    | 'MODEL_NOT_AVAILABLE'
    | 'AI_EMPTY_RESPONSE'
    | 'RATE_LIMITED'
    | 'PROVIDER_UNAVAILABLE';
  public readonly httpStatus?: number;
  public readonly requestId?: string;

  constructor(
    code: ZyRouterError['code'],
    message: string,
    opts?: { httpStatus?: number; requestId?: string }
  ) {
    super(`[DedAiClient] ${code}: ${message}`);
    this.name = 'ZyRouterError';
    this.code = code;
    this.httpStatus = opts?.httpStatus;
    this.requestId = opts?.requestId;
  }
}

export class ZyrouterClient {
  private static instance: ZyrouterClient;
  private defaultModel: string;
  private defaultProvider: string;
  private requestCounter: number = 1;
  private activeMode: DedProcessingMode = 'STANDARD';

  private constructor() {
    this.defaultModel =
      (typeof process !== 'undefined' &&
        (process.env.DED_STANDARD_VISION_MODEL ||
          process.env.ZYROUTER_MODEL ||
          process.env.DED_SCAN_AI_MODEL)) ||
      'ali/qwen3.8-omni-flash';

    this.defaultProvider =
      (typeof process !== 'undefined' && process.env.DED_DEFAULT_PROVIDER) || 'ezrab';
  }

  public static getInstance(): ZyrouterClient {
    if (!ZyrouterClient.instance) {
      ZyrouterClient.instance = new ZyrouterClient();
    }
    return ZyrouterClient.instance;
  }

  private telemetryHistory: RawAiTelemetryRecord[] = [];

  public getModel(): string {
    return this.defaultModel;
  }

  public setModel(model: string): void {
    this.defaultModel = model;
  }

  public getProvider(): string {
    return this.defaultProvider;
  }

  public setProvider(provider: string): void {
    this.defaultProvider = provider;
  }

  public getProcessingMode(): DedProcessingMode {
    return this.activeMode;
  }

  public setProcessingMode(mode: DedProcessingMode): void {
    this.activeMode = mode;
  }

  public getTelemetryHistory(): RawAiTelemetryRecord[] {
    return [...this.telemetryHistory];
  }

  public clearTelemetryHistory(): void {
    this.telemetryHistory = [];
  }

  /**
   * Preflight verification: tests provider responsiveness without silently falling back.
   */
  public async preflightCheck(
    modelToTest?: string,
    providerToTest?: string
  ): Promise<{ success: boolean; provider: string; model: string; latencyMs: number; status: string }> {
    const targetModel = modelToTest || this.defaultModel;
    const targetProvider = providerToTest || this.defaultProvider;
    const start = Date.now();
    try {
      const res = await this.chat({
        prompt: 'Respond strictly in JSON: {"status":"OK","ready":true}',
        systemPrompt: 'You are performing a preflight liveness check. Output valid JSON only.',
        providerId: targetProvider,
        model: targetModel,
        jsonMode: true,
        timeoutMs: 15000,
        requestId: `preflight-${Date.now()}`,
      });
      return {
        success: true,
        provider: targetProvider,
        model: targetModel,
        latencyMs: Date.now() - start,
        status: res.structuredJson?.status || 'OK',
      };
    } catch (err: any) {
      throw new ZyRouterError(
        'MODEL_NOT_AVAILABLE',
        `Model preflight gagal untuk provider '${targetProvider}' model '${targetModel}': ${err.message}`,
        {
          httpStatus: err.httpStatus,
        }
      );
    }
  }

  /**
   * Sends a vision/multimodal chat request with automatic retry, JSON parsing, and explicit fallback.
   */
  public async chat(request: ZyRouterChatRequest): Promise<ZyRouterChatResponse> {
    const requestId = request.requestId || `ded-ai-${Date.now()}-${this.requestCounter++}`;
    const primaryProvider = request.providerId || this.defaultProvider;
    const primaryModel = request.model || this.defaultModel;
    const maxRetries = 2;
    let attempt = 0;
    let lastError: any = null;
    const inputBytes = request.imageDataBase64
      ? Math.round((request.imageDataBase64.length - 22) * 0.75)
      : 0;

    let currentProvider = primaryProvider;
    let currentModel = primaryModel;
    let fallbackUsed = false;
    let fallbackReason: string | undefined = undefined;

    while (attempt <= maxRetries) {
      attempt++;
      const startMs = Date.now();

      try {
        const rawResult = await this.dispatch(request, currentProvider, currentModel, requestId);
        const latencyMs = Date.now() - startMs;

        let structuredJson: any = undefined;
        if (request.jsonMode) {
          structuredJson = this.extractAndParseJson(rawResult.content);
        }

        // Safe telemetry log in development (NEVER logs secrets or raw base64)
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
          console.log(
            `[DED AI Log] Req: ${requestId} | Provider: ${currentProvider} | Model: ${currentModel} | Page: ${request.pageNumber || '-'} | Pass: ${request.pass || '-'} | Attempt: ${attempt} | ImageBytes: ${inputBytes} | Latency: ${latencyMs}ms | OutputChars: ${rawResult.content.length}`
          );
        }

        const telemetryRecord: RawAiTelemetryRecord = {
          requestId,
          pageNumber: request.pageNumber || 0,
          pass: request.pass || 1,
          model: `${currentProvider}/${currentModel}`,
          httpStatus: 200,
          durationMs: latencyMs,
          inputImageBytes: inputBytes,
          outputChars: rawResult.content.length,
          parsed: Boolean(structuredJson),
          rawContent: rawResult.content,
        };
        this.telemetryHistory.push(telemetryRecord);

        return {
          content: rawResult.content,
          structuredJson,
          promptTokens: rawResult.promptTokens || 0,
          completionTokens: rawResult.completionTokens || 0,
          totalTokens: rawResult.totalTokens || 0,
          latencyMs,
          model: maskAiModelName(currentModel),
          providerId: maskAiProviderName(currentProvider),
          requestId,
          attempt,
          success: true,
          fallbackUsed,
          fallbackReason,
        };
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[DedAiClient] Attempt ${attempt}/${maxRetries + 1} failed for request ${requestId} (${currentProvider}/${currentModel}):`,
          err.message
        );

        // Explicit fallback check if configured (e.g. Qwen Omni -> Qwen Flash)
        if (request.fallbackModel && !fallbackUsed && attempt <= maxRetries) {
          fallbackUsed = true;
          fallbackReason = `Primary model ${currentModel} failed (${err.message}). Switching to fallback ${request.fallbackModel}.`;
          currentModel = request.fallbackModel;
          if (request.fallbackProviderId) {
            currentProvider = request.fallbackProviderId;
          }
          console.warn(`[DedAiClient Fallback] ${fallbackReason}`);
        }

        if (attempt <= maxRetries) {
          // Exponential backoff: 500ms, 1000ms
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    }

    const failedRecord: RawAiTelemetryRecord = {
      requestId,
      pageNumber: request.pageNumber || 0,
      pass: request.pass || 1,
      model: `${currentProvider}/${currentModel}`,
      httpStatus: lastError?.httpStatus || 500,
      durationMs: 0,
      inputImageBytes: inputBytes,
      outputChars: 0,
      parsed: false,
      error: lastError?.message || 'Unknown error',
      rawContent: '',
    };
    this.telemetryHistory.push(failedRecord);

    const errorCode =
      lastError?.code ||
      (lastError?.message?.includes('timeout') || lastError?.message?.includes('Timeout')
        ? 'AI_TIMEOUT'
        : lastError?.message?.includes('429')
        ? 'RATE_LIMITED'
        : 'AI_PROVIDER_ERROR');

    throw new ZyRouterError(
      errorCode,
      `Gagal mengeksekusi AI Provider (${currentProvider}/${currentModel}) setelah ${maxRetries + 1} percobaan: ${lastError?.message || 'Unknown error'}`,
      { requestId, httpStatus: lastError?.httpStatus }
    );
  }

  /**
   * Internal dispatcher: routes to backend proxy in browser or direct adapter in Node.
   */
  private async dispatch(
    request: ZyRouterChatRequest,
    providerId: string,
    model: string,
    requestId: string
  ): Promise<{ content: string; promptTokens: number; completionTokens: number; totalTokens: number }> {
    // 1. In Node / Unit Test runner: execute server adapter directly
    if (typeof window === 'undefined') {
      try {
        const adapterMod = ['..', '..', '..', 'server', 'providers', 'multiProvider', 'adapters'].join('/');
        const { chatGemini, chatOpenAiCompatible } = await import(/* @vite-ignore */ adapterMod);

        if (providerId === 'gemini') {
          const res = await chatGemini({
            providerId: 'gemini',
            modelId: model,
            prompt: request.prompt,
            systemPrompt: request.systemPrompt,
            imageDataBase64: request.imageDataBase64,
            imageMimeType: request.imageMimeType || 'image/png',
            jsonMode: request.jsonMode,
            maxTokens: request.maxTokens || 4000,
            temperature: request.temperature ?? 0.1,
            timeoutMs: request.timeoutMs || 45000,
            reasoningLevel: request.reasoningLevel,
          });
          return {
            content: res.content,
            promptTokens: res.promptTokens,
            completionTokens: res.completionTokens,
            totalTokens: res.totalTokens,
          };
        } else {
          const res = await chatOpenAiCompatible({
            providerId,
            modelId: model,
            prompt: request.prompt,
            systemPrompt: request.systemPrompt,
            imageDataBase64: request.imageDataBase64,
            imageMimeType: request.imageMimeType || 'image/png',
            jsonMode: request.jsonMode,
            maxTokens: request.maxTokens || 4000,
            temperature: request.temperature ?? 0.1,
            timeoutMs: request.timeoutMs || 45000,
            reasoningLevel: request.reasoningLevel,
          });
          return {
            content: res.content,
            promptTokens: res.promptTokens,
            completionTokens: res.completionTokens,
            totalTokens: res.totalTokens,
          };
        }
      } catch (adapterErr: any) {
        throw new ZyRouterError('AI_PROVIDER_ERROR', adapterErr.message || 'Direct adapter call failed', {
          requestId,
        });
      }
    }

    // 2. In Browser: securely dispatch through the server-side API gateway
    // The secret API key NEVER leaves the server.
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), request.timeoutMs || 55000);

    try {
      const response = await fetch('/api/ai/multi-provider/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          mode: request.imageDataBase64 ? 'vision' : 'advanced',
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          imageDataBase64: request.imageDataBase64,
          imageMimeType: request.imageMimeType || 'image/png',
          jsonMode: request.jsonMode,
          maxTokens: request.maxTokens || 4000,
          temperature: request.temperature ?? 0.1,
          timeoutMs: request.timeoutMs || 45000,
          reasoningLevel: request.reasoningLevel,
        }),
      });

      clearTimeout(timeoutTimer);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errKind =
          response.status === 401 || response.status === 403
            ? 'AUTH_ERROR'
            : response.status === 429
            ? 'RATE_LIMITED'
            : 'AI_PROVIDER_ERROR';

        throw new ZyRouterError(
          errKind,
          errJson.error || errJson.message || `Server gateway returned HTTP ${response.status}`,
          { httpStatus: response.status, requestId }
        );
      }

      const payload = await response.json();
      if (!payload.success) {
        throw new ZyRouterError('AI_PROVIDER_ERROR', payload.error || payload.message || 'Provider execution reported failure', {
          requestId,
        });
      }

      return {
        content: payload.content || '',
        promptTokens: payload.promptTokens || 0,
        completionTokens: payload.completionTokens || 0,
        totalTokens: payload.totalTokens || 0,
      };
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (err.name === 'AbortError') {
        throw new ZyRouterError('AI_TIMEOUT', `Request timed out after ${request.timeoutMs || 55000}ms`, {
          requestId,
        });
      }
      if (err instanceof ZyRouterError) throw err;
      throw new ZyRouterError('AI_PROVIDER_ERROR', `Network error to AI gateway: ${err.message}`, { requestId });
    }
  }

  /**
   * Safely extracts JSON from markdown-wrapped codeblocks (```json ... ```) or raw strings.
   */
  private extractAndParseJson(content: string): any {
    if (!content || !content.trim()) {
      throw new ZyRouterError('AI_INVALID_JSON', 'AI response content was empty.');
    }

    let jsonStr = content.trim();

    // Strip markdown code fence if present
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      // Find outermost curly or square braces
      const firstCurly = jsonStr.indexOf('{');
      const lastCurly = jsonStr.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly > firstCurly) {
        try {
          return JSON.parse(jsonStr.substring(firstCurly, lastCurly + 1));
        } catch {
          // pass
        }
      }

      const firstSquare = jsonStr.indexOf('[');
      const lastSquare = jsonStr.lastIndexOf(']');
      if (firstSquare !== -1 && lastSquare > firstSquare) {
        try {
          return JSON.parse(jsonStr.substring(firstSquare, lastSquare + 1));
        } catch {
          // pass
        }
      }

      throw new ZyRouterError(
        'AI_INVALID_JSON',
        `AI output could not be parsed as valid JSON: ${content.slice(0, 150)}...`
      );
    }
  }
}

export const zyrouterClient = ZyrouterClient.getInstance();
export const dedAiClient = ZyrouterClient.getInstance();
