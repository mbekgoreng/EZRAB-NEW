/**
 * EZRAB AI — Types (src/ai-tools/ezrab-ai/types.ts)
 * Standalone assistant/chat product with its own system prompt, tooling contract,
 * and structured error handling. NOT the DED vision pipeline.
 */

export interface EzrabAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  toolName?: string;
  toolStatus?: 'ok' | 'error';
}

export interface EzrabAiToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface EzrabAiToolResult {
  toolName: string;
  ok: boolean;
  output: string;
}

export interface EzrabAiRequest {
  sessionId?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  projectSummary?: string;
  mode?: 'fast' | 'advanced';
}

export interface EzrabAiResponse {
  success: boolean;
  reply: string;
  rawContent: string;
  requestId: string;
  toolCalls?: EzrabAiToolCall[];
  toolResults?: EzrabAiToolResult[];
}
