import type { ReadOnlyProjectContext } from './aiProjectContext';
import { getSupabaseAccessToken } from './supabaseClient';

export interface ChatApiRequest {
  message: string;
  projectId?: string;
  conversationId?: string;
  currentPage?: string;
  stream?: boolean;
  projectContext?: ReadOnlyProjectContext;
  clientMessageId?: string;
  idempotencyKey?: string;
  suggestionId?: string;
  source?: string;
}

export interface ActionProposal {
  actionId: string;
  toolName: string;
  parameters: Record<string, any>;
  description: string;
  requiresConfirmation: boolean;
}

export interface NormalizedAiResponse {
  content: string;
  status: string;
  assistant?: string;
  mode?: string;
  conversationId?: string;
  messageId?: string;
  requestId?: string;
  contextSource?: string;
  toolCallsExecuted?: Array<{ toolName: string; result?: unknown } | string>;
  providerMode?: 'REAL_AI' | 'MOCK' | 'AUTO';
  isError: boolean;
  retryable: boolean;
  actionProposal?: ActionProposal;
  wizardResponse?: any;
  quickActionResponse?: any;
  followUpSuggestions?: string[];
  intent?: string;
  code?: string;
}

// Backward compatibility alias
export type ChatApiResponse = NormalizedAiResponse;

export interface NormalizeAiResponseOptions {
  providerMode?: 'REAL_AI' | 'MOCK' | 'AUTO';
  isHttpError?: boolean;
  httpStatus?: number;
  code?: string;
  retryable?: boolean;
  fallbackMessage?: string;
}

export class AiApiError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly requestId?: string;

  constructor(code: string, retryable: boolean, message: string, requestId?: string) {
    super(message);
    this.name = 'AiApiError';
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

/**
 * Returns user-friendly Indonesian messages for technical or error codes.
 */
export function getFriendlyErrorMessage(code?: string, httpStatus?: number): string {
  switch (code) {
    case 'AI_CORE_UNAVAILABLE':
    case 'AI_CORE_NOT_FOUND':
      return 'Layanan AI sedang tidak tersedia. Silakan coba lagi beberapa saat.';
    case 'AI_CORE_TIMEOUT':
    case 'TIMEOUT':
    case 'REQUEST_TIMEOUT':
      return 'Proses AI membutuhkan waktu terlalu lama. Silakan coba lagi.';
    case 'RATE_LIMITED':
      return 'Permintaan terlalu banyak. Tunggu sebentar sebelum mencoba lagi.';
    case 'INVALID_REQUEST':
    case 'INVALID_MESSAGE':
      return 'Permintaan belum valid. Periksa pesan Anda lalu coba lagi.';
    case 'MESSAGE_TOO_LONG':
      return 'Pesan terlalu panjang. Ringkas pesan Anda lalu coba lagi.';
    case 'PROJECT_CONTEXT_TOO_LARGE':
      return 'Konteks proyek terlalu besar. Ringkas data yang dikirim lalu coba lagi.';
    case 'INVALID_PROJECT_CONTEXT':
      return 'Konteks proyek tidak valid. Pilih proyek aktif lalu coba lagi.';
    case 'SERVICE_TOKEN_INVALID':
      return 'Terjadi masalah konfigurasi layanan AI. Hubungi administrator.';
    case 'INTERNAL_ERROR':
      return 'Terjadi gangguan internal pada layanan AI. Silakan coba lagi nanti.';
    case 'INVALID_RESPONSE':
      return 'Respons dari sistem AI tidak valid atau dalam format yang tidak dikenali.';
    case 'NETWORK_ERROR':
      return 'Koneksi ke server EZRAB AI terputus. Pastikan server backend sedang berjalan.';
    case 'FORBIDDEN':
      return 'Akses ke fitur AI tidak diizinkan untuk peran pengguna saat ini.';
    case 'EMPTY_RESPONSE':
      return 'Maaf, EZRAB AI belum menghasilkan jawaban. Silakan coba lagi.';
    default:
      if (httpStatus === 502) {
        return 'Layanan AI sedang tidak tersedia. Silakan coba lagi beberapa saat.';
      }
      if (httpStatus && httpStatus >= 500) {
        return 'Terjadi kendala pada layanan AI. Silakan coba lagi beberapa saat.';
      }
      return 'Terjadi kendala saat menghubungi AI. Silakan coba lagi beberapa saat.';
  }
}

/**
 * Sanitizes response text to prevent leaking stack traces, internal filesystem paths, or credentials.
 */
export function sanitizeResponseText(rawText: string, isError = false): string {
  if (!rawText || typeof rawText !== 'string') return '';

  // Detect stack trace / Node or Python error dump
  const hasStackTrace = /(?:Traceback \(most recent call last\)|^\s+at\s+[\w\.\/<>]+\s+\(|node_modules[\\\/]|(?:TypeError|ReferenceError|SyntaxError|UnhandledPromiseRejection):)/im.test(rawText);
  // Detect local file paths
  const hasLocalPath = /(?:[A-Za-z]:\\[a-zA-Z0-9_\-\.\\]+|\/(?:Users|home|root|var|etc)\/[a-zA-Z0-9_\-\.\/]+)/i.test(rawText);
  // Detect authorization / token / secret leakage
  const hasSecret = /(?:Bearer\s+[A-Za-z0-9\-\._~+/]+=*|(?:\b(?:api[_-]?key|password|secret|token|authorization)\b\s*[:=]\s*['"]?[^\s"',]+['"]?))/i.test(rawText);

  if (hasStackTrace || hasSecret || (isError && hasLocalPath)) {
    console.warn('[EZRAB Sanitizer] Sensitive AI response was removed.', { length: rawText.length });
    return 'Terjadi kendala internal pada layanan AI. Silakan coba beberapa saat lagi.';
  }

  // Mask third-party vendor or model self-identifications if any leak into text
  const maskedText = rawText
    .replace(/\b(?:google\s+gemini|gemini|deepseek|qwen|alibaba|openai|chatgpt|anthropic|claude|zyrouter|zrouter|inception|atria|vleee|ollama|hermes)(?:[- ]?(?:chat|v4\.?1|v3|r1|flash|lite|pro|omni|luna|terra|sol|astra|haiku|sonnet|opus|\d+(\.\d+)?))?\b/gi, (match) => {
      const lower = match.toLowerCase();
      if (lower.includes('vision') || lower.includes('image') || lower.includes('omni') || lower.includes('ocr') || lower.includes('denah') || lower.includes('nota') || lower.includes('ded')) {
        return 'EZRAB Vision';
      }
      if (lower.includes('think') || lower.includes('reason') || lower.includes('opus') || lower.includes('r1') || lower.includes('pro') || lower.includes('sol')) {
        return 'EZRAB AI Pro';
      }
      if (lower.includes('core') || lower.includes('tool') || lower.includes('rag')) {
        return 'EZRAB Core';
      }
      return 'EZRAB AI 1.3';
    });

  return maskedText.trim();
}

/**
 * Centralized normalizer for all AI response variants (Task 1 & Task 2).
 * Handles:
 * - A: Normal AI response (content, status: 'COMPLETED', toolCallsExecuted)
 * - B: FAQ / static response (intent, message, data.knowledge)
 * - C: Date / time response (message or content)
 * - D: Read-only tool response (content, tools_used / toolCallsExecuted)
 * - E: Error response (success: false, error: { code, message, retryable })
 * - F: Mock response / fallback
 * - G: Empty or malformed response (null, undefined, non-object, HTML error)
 */
export function normalizeAiResponse(
  payload: unknown,
  options?: NormalizeAiResponseOptions
): NormalizedAiResponse {
  const providerMode = options?.providerMode || 'REAL_AI';
  const asRec = (val: unknown): Record<string, any> | null =>
    val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, any>) : null;

  const data = asRec(payload);

  // Determine error state
  const isHttpError = Boolean(options?.isHttpError);
  const hasErrorObject = Boolean(data && data.error);
  const isExplicitError = Boolean(
    isHttpError ||
    (data && data.success === false) ||
    (data && data.status === 'ERROR') ||
    hasErrorObject
  );

  // Extract error details safely
  const errRec = data?.error && typeof data.error === 'object' ? data.error : null;
  const errorCode =
    errRec?.code ||
    data?.code ||
    options?.code ||
    (options?.httpStatus === 502 ? 'AI_CORE_UNAVAILABLE' : isExplicitError ? `HTTP_${options?.httpStatus || 'ERROR'}` : undefined);

  const retryable =
    typeof errRec?.retryable === 'boolean'
      ? errRec.retryable
      : typeof options?.retryable === 'boolean'
      ? options.retryable
      : options?.httpStatus
      ? options.httpStatus >= 500 || options.httpStatus === 429
      : isExplicitError;

  // Priority for text:
  // 1. response.content
  // 2. response.message
  // 3. response.error.message
  // 4. fallback message
  let rawText = '';
  if (data) {
    if (typeof data.content === 'string' && data.content.trim()) {
      rawText = data.content;
    } else if (typeof data.message === 'string' && data.message.trim()) {
      rawText = data.message;
    } else if (errRec && typeof errRec.message === 'string' && errRec.message.trim()) {
      rawText = errRec.message;
    } else if (typeof data.error === 'string' && data.error.trim()) {
      rawText = data.error;
    } else if (typeof data.response === 'string' && data.response.trim()) {
      rawText = data.response;
    }
  }

  // Fallback text if empty
  let text = sanitizeResponseText(rawText, isExplicitError);
  if (!text) {
    if (isExplicitError) {
      text = options?.fallbackMessage || getFriendlyErrorMessage(errorCode, options?.httpStatus);
    } else {
      text = options?.fallbackMessage || 'Maaf, EZRAB AI belum menghasilkan jawaban. Silakan coba lagi.';
    }
  }

  // Identifiers
  const conversationId = data?.conversationId || data?.conversation_id || data?.requestId || data?.request_id || undefined;
  const messageId = data?.messageId || data?.message_id || data?.requestId || data?.request_id || undefined;
  const requestId = data?.requestId || data?.request_id || undefined;
  const contextSource = data?.contextSource || data?.context_source || undefined;
  const intent = data?.intent || undefined;

  // Tool calls normalization
  let toolCallsExecuted: Array<{ toolName: string; result?: unknown } | string> = [];
  if (Array.isArray(data?.toolCallsExecuted)) {
    toolCallsExecuted = data!.toolCallsExecuted;
  } else if (Array.isArray(data?.data?.tool_results)) {
    toolCallsExecuted = data!.data.tool_results.map((r: any) => ({
      toolName: r.tool_name || 'unknown_tool',
      result: r,
    }));
  } else if (Array.isArray(data?.tools_used)) {
    toolCallsExecuted = data!.tools_used.map((t: any) =>
      typeof t === 'string' ? t : { toolName: t?.tool_name || String(t) }
    );
  }

  // Action Proposal
  const actionProposal = data?.actionProposal || data?.action_proposal || undefined;

  // Final status
  let status: string;
  if (isExplicitError) {
    status = 'ERROR';
  } else if (data?.requires_confirmation || data?.status === 'CONFIRMATION_REQUIRED') {
    status = 'CONFIRMATION_REQUIRED';
  } else {
    status = data?.status || 'COMPLETED';
  }

  const assistant = data?.assistant || (data?.mode === 'advanced' ? 'EZRAB AI Pro' : data?.mode === 'vision' ? 'EZRAB Vision' : 'EZRAB AI 1.3');
  const mode = data?.mode || (assistant === 'EZRAB AI Pro' ? 'advanced' : assistant === 'EZRAB Vision' ? 'vision' : 'quick');

  return {
    content: text,
    status,
    assistant,
    mode,
    conversationId,
    messageId,
    requestId,
    contextSource,
    toolCallsExecuted,
    providerMode,
    isError: isExplicitError,
    retryable,
    actionProposal,
    wizardResponse: data?.wizardResponse || data?.wizard_response || undefined,
    quickActionResponse: data?.quickActionResponse || data?.quick_action_response || undefined,
    followUpSuggestions: Array.isArray(data?.followUpSuggestions || data?.next_actions) ? (data?.followUpSuggestions || data?.next_actions) : undefined,
    intent,
    code: errorCode,
  };
}

export class AiApiClient {
  private baseUrl: string;
  private workspaceId: string;
  private userId: string;
  private userRole: string;

  constructor(
    baseUrl?: string,
    workspaceId = 'ws-default-ezrab',
    userId = 'user-estimator-01',
    userRole = 'ESTIMATOR'
  ) {
    this.baseUrl =
      baseUrl ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_EZRAB_API_BASE_URL) ||
      '/api/ai';
    this.workspaceId = workspaceId;
    this.userId = userId;
    this.userRole = userRole;
  }

  private async getHeaders(projectId?: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = await getSupabaseAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Send a chat message to EZRAB AI backend.
   * Normalizes response across standard, FAQ/static, date/time, tool execution, and error responses.
   */
  public async sendMessage(request: ChatApiRequest): Promise<NormalizedAiResponse> {
    let response: Response;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 45_000);
    try {
      const headers = await this.getHeaders(request.projectId);
      // Only request data crosses the browser boundary. Identity is the
      // verified Supabase Bearer token; server builds project context itself.
      const { projectContext: _ignoredProjectContext, ...safeRequest } = request;
      response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(safeRequest),
        signal: controller.signal,
      });
    } catch (networkErr: any) {
      if (networkErr?.name === 'AbortError') {
        throw new AiApiError('AI_CORE_TIMEOUT', true, getFriendlyErrorMessage('REQUEST_TIMEOUT'));
      }
      throw new AiApiError(
        'NETWORK_ERROR',
        true,
        getFriendlyErrorMessage('NETWORK_ERROR')
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }

    if (!response.ok) {
      const errPayload = await response.json().catch(() => null);
      const code =
        errPayload?.error?.code ||
        errPayload?.code ||
        (response.status === 502 ? 'AI_CORE_UNAVAILABLE' : `HTTP_${response.status}`);
      const retryable = Boolean(
        errPayload?.error?.retryable ?? (response.status >= 500 || response.status === 429)
      );
      const normalized = normalizeAiResponse(errPayload, {
        isHttpError: true,
        httpStatus: response.status,
        code,
        retryable,
        fallbackMessage: getFriendlyErrorMessage(code, response.status),
      });
      throw new AiApiError(normalized.code || code, normalized.retryable, normalized.content, normalized.requestId);
    }

    const data = await response.json().catch(() => null);
    const normalized = normalizeAiResponse(data);
    if (normalized.isError) {
      throw new AiApiError(
        normalized.code || 'AI_ERROR',
        normalized.retryable,
        normalized.content,
        normalized.requestId
      );
    }
    return normalized;
  }

  /**
   * Confirm pending action proposal (e.g. add_rab_item, update_progress)
   */
  public async confirmAction(
    projectId: string,
    action: ActionProposal
  ): Promise<{ success: boolean; result: any }> {
    const headers = await this.getHeaders(projectId);
    const response = await fetch(`${this.baseUrl}/actions/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, action }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Confirmation failed' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get list of conversations for the active project
   */
  public async getConversations(projectId: string): Promise<any[]> {
    const headers = await this.getHeaders(projectId);
    const response = await fetch(`${this.baseUrl}/conversations?projectId=${encodeURIComponent(projectId)}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) return [];
    const json = await response.json().catch(() => ({}));
    return json.conversations || [];
  }

  /**
   * Start an interactive assistant wizard session
   */
  public async startWizard(projectId: string, conversationId?: string, initialQuery?: string): Promise<any> {
    const headers = await this.getHeaders(projectId);
    const response = await fetch('/api/assistant/wizard/start', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, conversationId, initialQuery })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return json.wizardResponse;
  }

  /**
   * Submit an answer or choice to the wizard session
   */
  public async answerWizard(sessionId: string, choiceId?: string, parameters?: Record<string, any>): Promise<any> {
    const headers = await this.getHeaders();
    const response = await fetch(`/api/assistant/wizard/${encodeURIComponent(sessionId)}/answer`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ choiceId, parameters })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return json.wizardResponse;
  }

  /**
   * Go back to the previous wizard step
   */
  public async goBackWizard(sessionId: string): Promise<any> {
    const headers = await this.getHeaders();
    const response = await fetch(`/api/assistant/wizard/${encodeURIComponent(sessionId)}/back`, {
      method: 'POST',
      headers
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return json.wizardResponse;
  }

  /**
   * Cancel the wizard session
   */
  public async cancelWizard(sessionId: string): Promise<any> {
    const headers = await this.getHeaders();
    const response = await fetch(`/api/assistant/wizard/${encodeURIComponent(sessionId)}/cancel`, {
      method: 'POST',
      headers
    });
    return response.json();
  }

  /**
   * Confirm and apply the calculated wizard RAB items to the project
   */
  public async confirmWizard(sessionId: string, projectId: string): Promise<any> {
    const headers = await this.getHeaders(projectId);
    const response = await fetch(`/api/assistant/wizard/${encodeURIComponent(sessionId)}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

export const aiApiClient = new AiApiClient();
