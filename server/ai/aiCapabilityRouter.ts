/**
 * EZRAB Server-Side AI Capability Router & Provider Abstraction Layer
 *
 * CANONICAL PUBLIC IDENTITIES:
 * 1. EZRAB AI 1.3  - Capability: QUICK    (Simple questions, lightweight reasoning, fast assistance)
 * 2. EZRAB AI Pro  - Capability: ADVANCED (Complex reasoning, construction analysis, DED -> RAB, document understanding)
 * 3. EZRAB Vision  - Capability: VISION   (Document & image understanding, DED page analysis)
 * 4. EZRAB Core    - Capability: INTERNAL (Deterministic engines, tools, RAG, intent, rules)
 *
 * CRITICAL SECURITY INVARIANT:
 * - Real provider IDs (gemini, inception, zyrouter, atria, vleee, etc.) and model IDs
 *   (gemini-3.5-flash-lite, gemini-3.8-flash, mercury-2.5, etc.) are SERVER-INTERNAL ONLY.
 * - Normal frontend clients ONLY request capabilities: { mode: 'quick' | 'advanced' | 'vision' }
 * - Normal responses NEVER expose raw provider, model, API keys, or routing details.
 * - Raw diagnostics are accessible ONLY to authenticated SUPER_ADMIN callers.
 */

import {
  chatGemini,
  chatOpenAiCompatible,
  ProviderExecError,
  ensureKeyPoolRegistered,
} from '../providers/multiProvider/adapters';
import { serverKeyPool } from '../providers/multiProvider/keyPool';

export type AiMode = 'quick' | 'advanced' | 'vision' | 'internal';

export interface PublicAiIdentity {
  name: string;
  mode: AiMode;
  capability: 'QUICK' | 'ADVANCED' | 'VISION' | 'INTERNAL';
  description: string;
}

export const PUBLIC_AI_IDENTITIES: Record<AiMode, PublicAiIdentity> = {
  quick: {
    name: 'EZRAB AI 1.3',
    mode: 'quick',
    capability: 'QUICK',
    description: 'Pertanyaan cepat, penalaran ringan, dan asistensi estimasi kilat.',
  },
  advanced: {
    name: 'EZRAB AI Pro',
    mode: 'advanced',
    capability: 'ADVANCED',
    description: 'Penalaran kompleks, analisis teknis konstruksi, DED ke RAB, dan kalkulasi volume QTO.',
  },
  vision: {
    name: 'EZRAB Vision',
    mode: 'vision',
    capability: 'VISION',
    description: 'Pemahaman visual dokumen gambar kerja teknis, denah, potongan, dan nota/kuitansi.',
  },
  internal: {
    name: 'EZRAB Core',
    mode: 'internal',
    capability: 'INTERNAL',
    description: 'Orkestrasi AI internal, integrasi tools, RAG, intent, dan kalkulasi deterministik.',
  },
};

export interface CapabilityExecutionRequest {
  mode?: AiMode | string;
  prompt: string;
  systemPrompt?: string;
  imageDataBase64?: string;
  imageMimeType?: string;
  pdfDataBase64?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  // Optional admin diagnostics request
  isSuperAdmin?: boolean;
  // Legacy compatibility: raw provider/model if supplied by internal server code
  internalProviderId?: string;
  internalModelId?: string;
}

export interface CapabilityExecutionResponse<T = any> {
  success: boolean;
  assistant: string;
  mode: AiMode;
  status: 'completed' | 'error';
  content: string;
  structuredData?: T;
  requestId: string;
  error?: string;
  message?: string;
  // Diagnostics ONLY returned if isSuperAdmin === true
  _diagnostics?: {
    provider: string;
    actualModel: string;
    latencyMs: number;
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    keyAlias?: string;
    routing: string;
  };
}

/**
 * Resolves the appropriate server-side provider and model based on capability mode.
 */
function resolveServerTarget(request: CapabilityExecutionRequest): {
  mode: AiMode;
  providerId: string;
  modelId: string;
  fallbackProviderId?: string;
  fallbackModelId?: string;
} {
  // If images or PDF are provided, capability is automatically VISION
  const hasMultimodal = Boolean(request.imageDataBase64 || request.pdfDataBase64);
  let resolvedMode: AiMode = 'quick';

  if (hasMultimodal) {
    resolvedMode = 'vision';
  } else if (typeof request.mode === 'string') {
    const m = request.mode.toLowerCase().trim();
    if (m === 'vision') resolvedMode = 'vision';
    else if (m === 'advanced' || m === 'detail' || m === 'thinking' || m === 'pro') resolvedMode = 'advanced';
    else if (m === 'internal' || m === 'core') resolvedMode = 'internal';
    else resolvedMode = 'quick';
  }

  // Allow server-internal caller to specify target if already routed
  if (request.internalProviderId && request.internalModelId) {
    return {
      mode: resolvedMode,
      providerId: request.internalProviderId,
      modelId: request.internalModelId,
    };
  }

  const cleanModel = (val?: string): string | undefined => {
    if (!val) return undefined;
    if (val.includes(',')) {
      const parts = val.split(',').map(s => s.trim()).filter(Boolean);
      return parts[0];
    }
    return val.trim();
  };

  let target: {
    mode: AiMode;
    providerId: string;
    modelId: string;
    fallbackProviderId?: string;
    fallbackModelId?: string;
  };

  switch (resolvedMode) {
    case 'vision':
      target = {
        mode: 'vision',
        providerId: 'gemini',
        modelId: cleanModel(process.env.GEMINI_VISION_MODEL) || cleanModel(process.env.DED_FAST_MODEL) || 'gemini-3.5-flash-lite',
        fallbackProviderId: 'zyrouter',
        fallbackModelId: 'geminiflash-3.8',
      };
      break;

    case 'advanced':
      target = {
        mode: 'advanced',
        providerId: 'gemini',
        modelId: cleanModel(process.env.GEMINI_MODEL_PRO) || cleanModel(process.env.GEMINI_MODEL) || 'gemini-3.8-flash',
        fallbackProviderId: 'inception',
        fallbackModelId: 'mercury-2.5',
      };
      break;

    case 'quick':
    default:
      target = {
        mode: 'quick',
        providerId: 'gemini',
        modelId: cleanModel(process.env.DED_FAST_MODEL) || cleanModel(process.env.GEMINI_FAST_MODEL) || 'gemini-3.5-flash-lite',
        fallbackProviderId: 'inception',
        fallbackModelId: 'mercury-2.5',
      };
      break;
  }

  console.log('[AI-ESTIMATE-TRACE] ROUTER_RESOLVED:', {
    requestedMode: request.mode,
    resolvedMode,
    targetProvider: target.providerId,
    targetModel: target.modelId,
  });

  return target;
}

/**
 * Executes an AI request through the capability abstraction layer.
 * Enforces frontend information hiding: real provider/model is NEVER sent to normal users.
 */
export async function executeAiCapability<T = any>(
  request: CapabilityExecutionRequest
): Promise<CapabilityExecutionResponse<T>> {
  ensureKeyPoolRegistered();

  const target = resolveServerTarget(request);
  const identity = PUBLIC_AI_IDENTITIES[target.mode];
  const requestId = `ezrab-ai-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const start = Date.now();

  const executeWithTarget = async (pid: string, mid: string) => {
    const payload = {
      providerId: pid,
      modelId: mid,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      imageDataBase64: request.imageDataBase64,
      imageMimeType: request.imageMimeType || 'image/png',
      pdfDataBase64: request.pdfDataBase64,
      jsonMode: request.jsonMode,
      temperature: request.temperature ?? 0.1,
      maxTokens: request.maxTokens || 4000,
      timeoutMs: request.timeoutMs || 45000,
    };

    if (pid === 'gemini') {
      return await chatGemini(payload);
    } else {
      return await chatOpenAiCompatible(payload);
    }
  };

  let executionResult: any = null;
  let activeProvider = target.providerId;
  let activeModel = target.modelId;
  let fallbackUsed = false;

  try {
    executionResult = await executeWithTarget(target.providerId, target.modelId);
  } catch (primaryErr: any) {
    console.warn(`[AiCapabilityRouter] Primary ${target.providerId}/${target.modelId} failed: ${primaryErr.message}`);

    if (target.fallbackProviderId && target.fallbackModelId) {
      console.info(`[AiCapabilityRouter] Engaging server-side fallback to ${target.fallbackProviderId}/${target.fallbackModelId}...`);
      try {
        executionResult = await executeWithTarget(target.fallbackProviderId, target.fallbackModelId);
        activeProvider = target.fallbackProviderId;
        activeModel = target.fallbackModelId;
        fallbackUsed = true;
      } catch (fallbackErr: any) {
        console.error(`[AiCapabilityRouter] Fallback failed: ${fallbackErr.message}`);
        throw primaryErr; // throw original
      }
    } else {
      throw primaryErr;
    }
  }

  const latencyMs = Date.now() - start;

  // Build clean response for frontend
  const response: CapabilityExecutionResponse<T> = {
    success: true,
    assistant: identity.name,
    mode: target.mode,
    status: 'completed',
    content: executionResult.content || '',
    structuredData: executionResult.structuredData,
    requestId,
  };

  // Only attach technical provider/model details if caller is verified SUPER_ADMIN
  if (request.isSuperAdmin) {
    response._diagnostics = {
      provider: activeProvider,
      actualModel: activeModel,
      latencyMs,
      tokenUsage: {
        prompt: executionResult.promptTokens || 0,
        completion: executionResult.completionTokens || 0,
        total: executionResult.totalTokens || 0,
      },
      keyAlias: executionResult.keyAlias,
      routing: fallbackUsed ? 'FALLBACK' : 'PRIMARY',
    };
  }

  return response;
}
