import { AIMessage } from '../database/types';

export type AIProviderType = 'ezrab_core' | 'local' | 'hermes' | 'external' | 'mock';

export type ProviderHealthStatus = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';

export type CostClass = 'free' | 'low' | 'medium' | 'high';

export type LatencyClass = 'fast' | 'medium' | 'slow';

export interface AIProviderCapabilities {
  supportsText: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  supportsEmbedding: boolean;
  maxContextTokens: number | 'unknown';
  estimatedCostClass: CostClass;
  latencyClass: LatencyClass;
}

export interface ProviderHealth {
  providerId: string;
  type: AIProviderType;
  status: ProviderHealthStatus;
  latencyMs: number;
  message?: string;
  lastChecked: string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AIChatOptions {
  systemPrompt?: string;
  contextMarkdown?: string;
  messages: AIMessage[];
  availableTools?: any[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  responseFormat?: 'text' | 'json';
  timeoutMs?: number;
  // Security & Project Isolation context
  projectId?: string;
  workspaceId?: string;
  userId?: string;
}

export interface AIChatResult {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCallRequest[];
  structuredData?: any;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs?: number;
  providerId?: string;
  modelId?: string;
  escalated?: boolean;
  escalationReason?: string;
}

export interface AIStreamEvent {
  type: 'chunk' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCallRequest;
  error?: string;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: AIProviderType;
  readonly capabilities: AIProviderCapabilities;

  healthCheck(): Promise<ProviderHealth>;
  chat(options: AIChatOptions): Promise<AIChatResult>;
  stream?(options: AIChatOptions): AsyncIterable<AIStreamEvent>;

  supportsTools(): boolean;
  supportsVision(): boolean;
  supportsStructuredOutput(): boolean;
  supportsStreaming(): boolean;
}
