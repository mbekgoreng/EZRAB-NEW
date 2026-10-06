import { AIMessage } from '../database/types';
import { ToolCallRequest } from './aiProvider';

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  supportsVision: boolean;
  supportsEmbedding: boolean;
}

export interface ModelHealthStatus {
  provider: string;
  model: string;
  status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  latencyMs: number;
  capabilities: ModelCapabilities;
  lastChecked: string;
  errorMessage?: string;
}

export interface ModelGenerateOptions {
  systemPrompt?: string;
  contextMarkdown?: string;
  messages?: AIMessage[];
  availableTools?: any[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stream?: boolean;
  responseFormat?: 'text' | 'json';
}

export interface ModelGenerateResult {
  content: string;
  toolCalls?: ToolCallRequest[];
  structuredData?: any;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
  model: string;
  provider: string;
}

export interface ModelAdapter {
  readonly providerName: string;
  readonly modelName: string;
  readonly capabilities: ModelCapabilities;

  generateText(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
  generateStreamingText(options: ModelGenerateOptions, onChunk: (chunk: string) => void): Promise<ModelGenerateResult>;
  generateStructuredOutput<T = any>(prompt: string, schema: any, options?: ModelGenerateOptions): Promise<T>;
  generateEmbedding(text: string): Promise<number[]>;
  analyzeImage(imageUrlOrBase64: string, prompt: string): Promise<string>;
  getModelHealth(): Promise<ModelHealthStatus>;
  estimateTokenUsage(text: string): number;
}
