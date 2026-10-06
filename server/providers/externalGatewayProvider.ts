import {
  AIProvider,
  AIProviderCapabilities,
  AIChatOptions,
  AIChatResult,
  ProviderHealth,
  ToolCallRequest
} from './aiProvider';
import { getAiConfig } from '../config/aiConfig';

export class ExternalGatewayProvider implements AIProvider {
  public readonly id = 'external_gateway';
  public readonly name = 'EZRAB External AI Gateway (9Router / OpenAI-Compatible)';
  public readonly type = 'external' as const;

  private apiKey: string;
  private baseURL: string;
  private modelName: string;
  private timeoutMs: number;

  public readonly capabilities: AIProviderCapabilities = {
    supportsText: true,
    supportsVision: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsEmbedding: true,
    maxContextTokens: 128000,
    estimatedCostClass: 'medium',
    latencyClass: 'medium'
  };

  constructor(options?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    timeoutMs?: number;
  }) {
    const cfg = getAiConfig().external;
    this.apiKey = options?.apiKey || cfg.apiKey;
    this.baseURL = (options?.baseURL || cfg.baseUrl).replace(/\/$/, '');
    this.modelName = options?.model || cfg.model;
    this.timeoutMs = options?.timeoutMs || cfg.timeoutMs;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  public async discoverModels(): Promise<string[]> {
    if (!this.isConfigured()) return [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) return [this.modelName];
      const data = await response.json();
      if (Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id).filter(Boolean);
      }
      return [this.modelName];
    } catch {
      return [this.modelName];
    }
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        type: this.type,
        status: 'NOT_CONFIGURED',
        latencyMs: 0,
        message: 'External AI API key is not configured in backend environment',
        lastChecked: new Date().toISOString()
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        return {
          providerId: this.id,
          type: this.type,
          status: 'AVAILABLE',
          latencyMs: Date.now() - start,
          message: `External AI Gateway online (Model: ${this.modelName})`,
          lastChecked: new Date().toISOString()
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          providerId: this.id,
          type: this.type,
          status: 'NOT_CONFIGURED',
          latencyMs: Date.now() - start,
          message: 'External AI API key is invalid or unauthorized',
          lastChecked: new Date().toISOString()
        };
      }

      return {
        providerId: this.id,
        type: this.type,
        status: 'DEGRADED',
        latencyMs: Date.now() - start,
        message: `External AI returned HTTP ${response.status}`,
        lastChecked: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        type: this.type,
        status: 'UNAVAILABLE',
        latencyMs: Date.now() - start,
        message: 'Network error contacting External AI Gateway',
        lastChecked: new Date().toISOString()
      };
    }
  }

  public supportsTools(): boolean {
    return this.capabilities.supportsTools;
  }

  public supportsVision(): boolean {
    return this.capabilities.supportsVision;
  }

  public supportsStructuredOutput(): boolean {
    return this.capabilities.supportsStructuredOutput;
  }

  public supportsStreaming(): boolean {
    return this.capabilities.supportsStreaming;
  }

  public async chat(options: AIChatOptions): Promise<AIChatResult> {
    const start = Date.now();
    if (!this.isConfigured()) {
      throw new Error('AI_AUTH_ERROR: Missing or invalid API key for external provider.');
    }

    const messagesPayload: any[] = [];
    if (options.systemPrompt || options.contextMarkdown) {
      messagesPayload.push({
        role: 'system',
        content: `${options.systemPrompt || ''}\n\n${options.contextMarkdown || ''}`.trim()
      });
    }

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
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
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

    const body: any = {
      model: this.modelName,
      messages: messagesPayload,
      temperature: options.temperature ?? 0.2
    };

    if (options.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    if (options.availableTools && options.availableTools.length > 0) {
      body.tools = options.availableTools;
      body.tool_choice = 'auto';
    }

    if (options.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401 || response.status === 403) {
          throw new Error(`AI_AUTH_ERROR [${response.status}]: Authentication failed with external provider.`);
        }
        if (response.status === 429) {
          throw new Error(`AI_RATE_LIMIT: External AI gateway rate limit exceeded.`);
        }
        throw new Error(`AI_PROVIDER_UNAVAILABLE [${response.status}]: ${errorText}`);
      }

      const json = await response.json();
      const choice = json.choices?.[0];
      const message = choice?.message;
      const reasoningContent = (message?.reasoning_content || message?.reasoning || '').toString().trim() || undefined;

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

      let content = (message?.content || '').toString().trim();
      // If content is empty but model produced reasoning and no tool call, fallback to reasoning
      if (!content && reasoningContent && (!toolCalls || toolCalls.length === 0)) {
        content = reasoningContent;
      }

      let structuredData: any;
      if (options.responseFormat === 'json' && content) {
        try {
          structuredData = JSON.parse(content);
        } catch {
          // Keep raw
        }
      }

      return {
        content,
        reasoningContent,
        toolCalls,
        structuredData,
        durationMs: Date.now() - start,
        providerId: this.id,
        modelId: json.model || this.modelName,
        tokenUsage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens,
              completionTokens: json.usage.completion_tokens,
              totalTokens: json.usage.total_tokens
            }
          : undefined
      };
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new Error(`AI_TIMEOUT: External gateway did not respond within ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Real runtime inference diagnostic with a harmless non-project prompt
   */
  public async testInference(): Promise<{ success: boolean; answer?: string; error?: string; latencyMs: number }> {
    const start = Date.now();
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SKIPPED — provider not configured',
        latencyMs: 0
      };
    }

    try {
      const result = await this.chat({
        messages: [{ id: 'diag', role: 'user', content: 'Jawab singkat: apa fungsi RAB dalam proyek konstruksi?', createdAt: new Date().toISOString() }],
        timeoutMs: 12000
      });
      return {
        success: Boolean(result.content && result.content.length > 0),
        answer: result.content,
        latencyMs: Date.now() - start
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        latencyMs: Date.now() - start
      };
    }
  }
}
