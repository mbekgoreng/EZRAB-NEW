import {
  AIProvider,
  AIProviderCapabilities,
  AIChatOptions,
  AIChatResult,
  ProviderHealth
} from './aiProvider';
import { ExternalGatewayProvider } from './externalGatewayProvider';

export class HermesProvider implements AIProvider {
  public readonly id = 'hermes_gateway';
  public readonly name = 'Hermes Local/Private AI Gateway';
  public readonly type = 'hermes' as const;

  private delegate?: ExternalGatewayProvider;
  private isConfigured: boolean;

  public readonly capabilities: AIProviderCapabilities = {
    supportsText: true,
    supportsVision: false,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsEmbedding: true,
    maxContextTokens: 64000,
    estimatedCostClass: 'low',
    latencyClass: 'fast'
  };

  constructor(options?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  }) {
    const baseURL = options?.baseURL || process.env.HERMES_BASE_URL || process.env.HERMES_URL;
    const apiKey = options?.apiKey || process.env.HERMES_API_KEY || 'hermes-local';
    const model = options?.model || process.env.HERMES_MODEL || 'hermes-3-llama-3.1-8b';

    this.isConfigured = Boolean(baseURL);

    if (this.isConfigured && baseURL) {
      this.delegate = new ExternalGatewayProvider({
        baseURL,
        apiKey,
        model,
        timeoutMs: 20000
      });
    }
  }

  public async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured || !this.delegate) {
      return {
        providerId: this.id,
        type: this.type,
        status: 'NOT_CONFIGURED',
        latencyMs: 0,
        message: 'Hermes gateway is not configured in backend environment (HERMES_BASE_URL absent)',
        lastChecked: new Date().toISOString()
      };
    }

    const health = await this.delegate.healthCheck();
    return {
      ...health,
      providerId: this.id,
      type: this.type
    };
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
    if (!this.isConfigured || !this.delegate) {
      throw new Error('HERMES_NOT_CONFIGURED: Hermes gateway is not configured.');
    }
    const result = await this.delegate.chat(options);
    return {
      ...result,
      providerId: this.id
    };
  }
}
