import type { ReadOnlyProjectContextPayload } from '../api/readOnlyProjectContext';

export interface AiCoreChatResult {
  conversationId: string;
  messageId: string;
  content: string;
  status: 'COMPLETED' | 'CONFIRMATION_REQUIRED';
  contextSource: 'server_official_context';
  toolCallsExecuted: { toolName: string; result: unknown }[];
  requestId: string;
}

export class AiCoreBridgeError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean, message: string) { super(message); }
}

const AI_CORE_TIMEOUT_MS = Number(process.env.EZRAB_AI_CORE_TIMEOUT_MS || 40_000);

/** Calls FastAPI only through its local/internal HTTP boundary. */
export async function sendReadOnlyContextToAiCore(input: {
  message: string;
  projectId: string;
  userId: string;
  conversationId?: string;
  context: ReadOnlyProjectContextPayload;
}): Promise<AiCoreChatResult> {
  const baseUrl = process.env.EZRAB_AI_CORE_URL || 'http://127.0.0.1:8000';
  const serviceToken = process.env.EZRAB_AI_CORE_SERVICE_TOKEN;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(serviceToken ? { 'x-ezrab-service-token': serviceToken } : {}) },
      signal: AbortSignal.timeout(AI_CORE_TIMEOUT_MS),
      body: JSON.stringify({
        message: input.message, user_id: input.userId, project_id: input.projectId,
        conversation_id: input.conversationId, project_context: input.context,
      }),
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new AiCoreBridgeError('AI_CORE_TIMEOUT', true, 'Layanan AI membutuhkan waktu terlalu lama.');
    }
    throw new AiCoreBridgeError('AI_CORE_UNAVAILABLE', true, 'AI Core belum dapat dihubungi.');
  }
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload || payload.success === false) {
    const code = payload?.error?.code || (response.status === 404 ? 'AI_CORE_NOT_FOUND' : 'AI_CORE_UNAVAILABLE');
    throw new AiCoreBridgeError(code, response.status >= 500 || response.status === 429, 'AI Core belum dapat dihubungi.');
  }
  return {
    conversationId: input.conversationId || payload.request_id,
    messageId: payload.request_id,
    content: payload.message || 'AI tidak mengembalikan jawaban.',
    status: payload.requires_confirmation ? 'CONFIRMATION_REQUIRED' : 'COMPLETED',
    contextSource: 'server_official_context',
    toolCallsExecuted: Array.isArray(payload.data?.tool_results)
      ? payload.data.tool_results.map((result: any) => ({ toolName: result.tool_name, result }))
      : [],
    requestId: payload.request_id,
  };
}

export async function getAiCoreHealth(): Promise<{ aiCore: 'connected' | 'unavailable'; ollama: 'connected' | 'unavailable' }> {
  const baseUrl = process.env.EZRAB_AI_CORE_URL || 'http://127.0.0.1:8000';
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const health = await response.json().catch(() => null);
    return { aiCore: response.ok ? 'connected' : 'unavailable', ollama: health?.ollama === true ? 'connected' : 'unavailable' };
  } catch { return { aiCore: 'unavailable', ollama: 'unavailable' }; }
}
