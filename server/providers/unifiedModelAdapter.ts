import { AIMessage } from '../database/types';
import { ToolCallRequest } from './aiProvider';
import { ModelAdapter, ModelCapabilities, ModelGenerateOptions, ModelGenerateResult, ModelHealthStatus } from './modelAdapter';

export class UnifiedModelAdapter implements ModelAdapter {
  public readonly providerName: string;
  public readonly modelName: string;
  public readonly capabilities: ModelCapabilities;

  private apiKey: string;
  private baseURL: string;
  private timeoutMs: number;
  private fallbackAdapter?: ModelAdapter;

  constructor(options?: {
    provider?: string;
    model?: string;
    baseURL?: string;
    apiKey?: string;
    timeoutMs?: number;
    fallbackAdapter?: ModelAdapter;
  }) {
    this.providerName = (options?.provider || process.env.AI_PROVIDER || 'mock').toLowerCase();
    this.modelName = options?.model || process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';
    this.baseURL = (options?.baseURL || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.apiKey = options?.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
    this.timeoutMs = options?.timeoutMs || parseInt(process.env.AI_TIMEOUT_MS || '40000', 10);
    this.fallbackAdapter = options?.fallbackAdapter;

    // Detect capabilities
    this.capabilities = this.detectCapabilities(this.providerName, this.modelName);
  }

  private detectCapabilities(provider: string, model: string): ModelCapabilities {
    if (provider === 'mock') {
      return {
        supportsStreaming: true,
        supportsToolCalling: true,
        supportsStructuredOutput: true,
        supportsVision: false,
        supportsEmbedding: true
      };
    }

    if (provider === 'ollama' || provider === 'local') {
      const isVisionModel = /vision|llava|bakllava/i.test(model);
      const isQwen = /qwen/i.test(model);
      return {
        supportsStreaming: true,
        supportsToolCalling: isQwen,
        supportsStructuredOutput: true,
        supportsVision: isVisionModel,
        supportsEmbedding: true
      };
    }

    // Default cloud (OpenAI / OpenRouter)
    const isVision = /gpt-4o|vision|claude-3|gemini/i.test(model);
    return {
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsStructuredOutput: true,
      supportsVision: isVision,
      supportsEmbedding: true
    };
  }

  public estimateTokenUsage(text: string): number {
    if (!text) return 0;
    // Heuristic: ~4 characters per token for Indonesian / English mix
    return Math.ceil(text.length / 3.8);
  }

  public async generateText(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const start = Date.now();

    if (this.providerName === 'mock') {
      return {
        content: 'Hasil analisis deterministik model mock EZRAB AI.',
        durationMs: Date.now() - start,
        model: 'mock-model',
        provider: 'mock'
      };
    }

    const messagesPayload: any[] = [];
    if (options.systemPrompt || options.contextMarkdown) {
      messagesPayload.push({
        role: 'system',
        content: `${options.systemPrompt || ''}\n\n${options.contextMarkdown || ''}`.trim()
      });
    }

    if (options.messages) {
      for (const msg of options.messages) {
        if (msg.role === 'tool') {
          messagesPayload.push({
            role: 'tool',
            tool_call_id: msg.toolCallId,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          });
        } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
          messagesPayload.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments)
              }
            }))
          });
        } else {
          messagesPayload.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }

    const requestBody: any = {
      model: this.modelName,
      messages: messagesPayload,
      temperature: options.temperature ?? 0.2
    };

    if (options.maxTokens) {
      requestBody.max_tokens = options.maxTokens;
    }

    if (this.capabilities.supportsToolCalling && options.availableTools && options.availableTools.length > 0) {
      requestBody.tools = options.availableTools;
      requestBody.tool_choice = 'auto';
    }

    if (options.responseFormat === 'json' && this.capabilities.supportsStructuredOutput) {
      requestBody.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API Provider Error [${response.status}]: ${errText}`);
      }

      const json = await response.json();
      const choice = json.choices?.[0];
      const message = choice?.message;

      let toolCalls: ToolCallRequest[] | undefined;
      if (message?.tool_calls && Array.isArray(message.tool_calls)) {
        toolCalls = message.tool_calls.map((tc: any) => {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}');
          } catch {
            parsedArgs = { raw: tc.function.arguments };
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs
          };
        });
      }

      let structuredData: any;
      if (options.responseFormat === 'json' && message?.content) {
        try {
          structuredData = JSON.parse(message.content);
        } catch {
          // Keep raw content
        }
      }

      return {
        content: message?.content || '',
        toolCalls,
        structuredData,
        tokenUsage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens,
              completionTokens: json.usage.completion_tokens,
              totalTokens: json.usage.total_tokens
            }
          : undefined,
        durationMs: Date.now() - start,
        model: this.modelName,
        provider: this.providerName
      };
    } catch (err: any) {
      if (this.fallbackAdapter) {
        console.warn(`[UnifiedModelAdapter] ${this.providerName} failed, triggering fallback:`, err.message);
        return this.fallbackAdapter.generateText(options);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async generateStreamingText(
    options: ModelGenerateOptions,
    onChunk: (chunk: string) => void
  ): Promise<ModelGenerateResult> {
    const result = await this.generateText(options);
    if (result.content && onChunk) {
      onChunk(result.content);
    }
    return result;
  }

  public async generateStructuredOutput<T = any>(
    prompt: string,
    schema: any,
    options?: ModelGenerateOptions
  ): Promise<T> {
    const systemPrompt = `You are a strict structured JSON extraction engine. Follow this JSON schema exactly:\n${JSON.stringify(schema, null, 2)}`;
    const result = await this.generateText({
      ...options,
      systemPrompt,
      messages: [{ id: '1', role: 'user', content: prompt, createdAt: new Date().toISOString() }],
      responseFormat: 'json',
      temperature: 0.0
    });

    if (result.structuredData) {
      return result.structuredData as T;
    }

    try {
      const parsed = JSON.parse(result.content);
      return parsed as T;
    } catch {
      throw new Error(`Failed to parse structured JSON output from model: ${result.content.slice(0, 100)}`);
    }
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    if (this.providerName === 'mock') {
      // Deterministic pseudo-embedding for testing
      const vector: number[] = new Array(384).fill(0);
      for (let i = 0; i < text.length; i++) {
        vector[i % 384] += text.charCodeAt(i) / 1000;
      }
      return vector;
    }

    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding generation error [${response.status}]`);
    }

    const json = await response.json();
    return json.data?.[0]?.embedding || [];
  }

  public async analyzeImage(imageUrlOrBase64: string, prompt: string): Promise<string> {
    if (!this.capabilities.supportsVision) {
      throw new Error(`Model ${this.modelName} does not support vision capabilities.`);
    }

    const result = await this.generateText({
      messages: [
        {
          id: 'v1',
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrlOrBase64 } }
          ] as any,
          createdAt: new Date().toISOString()
        }
      ]
    });

    return result.content;
  }

  public async getModelHealth(): Promise<ModelHealthStatus> {
    const start = Date.now();
    try {
      if (this.providerName === 'mock') {
        return {
          provider: 'mock',
          model: 'mock-model',
          status: 'HEALTHY',
          latencyMs: 1,
          capabilities: this.capabilities,
          lastChecked: new Date().toISOString()
        };
      }

      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
      });

      const latencyMs = Date.now() - start;
      return {
        provider: this.providerName,
        model: this.modelName,
        status: response.ok ? 'HEALTHY' : 'DEGRADED',
        latencyMs,
        capabilities: this.capabilities,
        lastChecked: new Date().toISOString(),
        errorMessage: response.ok ? undefined : `HTTP ${response.status}`
      };
    } catch (err: any) {
      return {
        provider: this.providerName,
        model: this.modelName,
        status: 'OFFLINE',
        latencyMs: Date.now() - start,
        capabilities: this.capabilities,
        lastChecked: new Date().toISOString(),
        errorMessage: err.message
      };
    }
  }
}
