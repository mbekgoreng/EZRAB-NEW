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
    const maxRetries = 3;
    let attempt = 0;
    let lastError: any = null;

    while (attempt < maxRetries) {
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

          let parsedData: T | undefined = result.structuredData;
          if (!parsedData && options.jsonMode && result.content) {
            parsedData = this.extractJson<T>(result.content);
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
            timeoutMs: options.timeoutMs || 45000,
          };

          const resp = await fetch('/api/ai/multi-provider/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await aiGatewayAuthHeaders()) },
            body: JSON.stringify(payload),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${errText}`);
          }

          const resJson = await resp.json();
          let parsedData: T | undefined = undefined;
          if (options.jsonMode) {
            parsedData = resJson.structuredData || this.extractJson<T>(resJson.content);
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
        console.warn(`[AiProviderClient] Attempt ${attempt}/${maxRetries} failed:`, err.message);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new Error(`AI Request failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }
}

export const aiProviderClient = AiProviderClient.getInstance();
