import {
  AIProvider,
  AIProviderCapabilities,
  AIChatOptions,
  AIChatResult,
  ProviderHealth
} from './aiProvider';
import { getAiConfig } from '../config/aiConfig';

export class LocalAIProvider implements AIProvider {
  public readonly id = 'local_ai';
  public readonly name = 'EZRAB Local AI / Ollama Daemon';
  public readonly type = 'local' as const;

  private ollamaBaseUrl: string;
  private aiCoreBaseUrl: string;
  private modelName: string;
  private timeoutMs: number;

  public readonly capabilities: AIProviderCapabilities = {
    supportsText: true,
    supportsVision: false,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsEmbedding: true,
    maxContextTokens: 32000,
    estimatedCostClass: 'free',
    latencyClass: 'fast'
  };

  constructor(options?: {
    ollamaBaseUrl?: string;
    aiCoreBaseUrl?: string;
    model?: string;
    timeoutMs?: number;
  }) {
    const cfg = getAiConfig().local;
    this.ollamaBaseUrl = options?.ollamaBaseUrl || cfg.ollamaBaseUrl;
    this.aiCoreBaseUrl = options?.aiCoreBaseUrl || cfg.aiCoreUrl;
    this.modelName = options?.model || cfg.model;
    this.timeoutMs = options?.timeoutMs || cfg.timeoutMs;
  }

  public async discoverModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) return [];
      const data = await response.json();
      if (Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name || m.model).filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      }).catch(() => null);

      clearTimeout(timeout);

      if (response && response.ok) {
        const data = await response.json().catch(() => ({}));
        const installedModels: string[] = Array.isArray(data.models)
          ? data.models.map((m: any) => m.name || m.model)
          : [];

        const hasConfiguredModel = installedModels.some(
          (m) => m === this.modelName || m.startsWith(this.modelName.split(':')[0])
        );

        return {
          providerId: this.id,
          type: this.type,
          status: hasConfiguredModel ? 'AVAILABLE' : 'DEGRADED',
          latencyMs: Date.now() - start,
          message: hasConfiguredModel
            ? `Ollama online with model '${this.modelName}' ready`
            : `Ollama online, but model '${this.modelName}' not found. Installed: [${installedModels.join(', ') || 'none'}]`,
          lastChecked: new Date().toISOString()
        };
      }

      // Check secondary AI Core
      const aiCoreRes = await fetch(`${this.aiCoreBaseUrl}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
      if (aiCoreRes && aiCoreRes.ok) {
        return {
          providerId: this.id,
          type: this.type,
          status: 'AVAILABLE',
          latencyMs: Date.now() - start,
          message: 'Local AI Core FastAPI is responsive',
          lastChecked: new Date().toISOString()
        };
      }

      return {
        providerId: this.id,
        type: this.type,
        status: 'UNAVAILABLE',
        latencyMs: Date.now() - start,
        message: 'Local AI / Ollama daemon not reachable at ' + this.ollamaBaseUrl,
        lastChecked: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        type: this.type,
        status: 'UNAVAILABLE',
        latencyMs: Date.now() - start,
        message: err.message,
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

  public async chat(options: AIChatOptions | any): Promise<AIChatResult> {
    const start = Date.now();
    const isArray = Array.isArray(options);
    const rawOptions: any = isArray ? {} : options;
    const msgs: any[] = isArray ? options : options.messages || [];
    const timeoutVal = rawOptions.timeoutMs || this.timeoutMs;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutVal);

    try {
      const messagesPayload: any[] = [];
      if (rawOptions.systemPrompt || rawOptions.contextMarkdown) {
        messagesPayload.push({
          role: 'system',
          content: `${rawOptions.systemPrompt || ''}\n\n${rawOptions.contextMarkdown || ''}`.trim()
        });
      }

      for (const msg of msgs) {
        const msgObj: any = {
          role: msg.role === 'assistant' ? 'assistant' : msg.role === 'tool' ? 'tool' : 'user',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        };
        if (msg.images && Array.isArray(msg.images)) {
          msgObj.images = msg.images;
        }
        messagesPayload.push(msgObj);
      }

      const body: any = {
        model: rawOptions.model || this.modelName,
        messages: messagesPayload,
        stream: false,
        options: {
          temperature: rawOptions.temperature ?? options.temperature ?? 0.2
        }
      };

      if (rawOptions.responseFormat === 'json') {
        body.format = 'json';
      }

      const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        const targetModel = rawOptions.model || this.modelName;
        if (response.status === 404 && errorText.includes('not found')) {
          throw new Error(`AI_MODEL_NOT_FOUND: Model '${targetModel}' is not installed in local Ollama daemon.`);
        }
        throw new Error(`AI_PROVIDER_UNAVAILABLE [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      const content = data.message?.content || '';

      let structuredData: any;
      if (rawOptions.responseFormat === 'json' && content) {
        try {
          structuredData = JSON.parse(content);
        } catch {
          // Keep raw content
        }
      }

      return {
        content,
        structuredData,
        durationMs: Date.now() - start,
        providerId: this.id,
        modelId: rawOptions.model || this.modelName,
        tokenUsage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        }
      };
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new Error(`AI_TIMEOUT: Local model did not respond within ${timeoutVal}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Diagnostic runtime inference test with a harmless non-project prompt
   */
  public async testInference(): Promise<{ success: boolean; answer?: string; error?: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const result = await this.chat({
        messages: [{ id: 'diag', role: 'user', content: 'Jawab singkat: apa fungsi RAB dalam proyek konstruksi?', createdAt: new Date().toISOString() }],
        timeoutMs: 30000
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
