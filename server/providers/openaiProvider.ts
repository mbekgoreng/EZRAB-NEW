import { AIProvider, AIChatOptions, AIChatResult, ToolCallRequest } from './aiProvider';

export interface OpenAIProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class OpenAIProvider implements AIProvider {
  public name = 'openai';
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(config: OpenAIProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseURL = (config.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o';
  }

  public async chat(options: AIChatOptions): Promise<AIChatResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API Key is missing. Set OPENAI_API_KEY in your environment.');
    }

    const messagesPayload: any[] = [
      {
        role: 'system',
        content: `${options.systemPrompt}\n\n${options.contextMarkdown}`
      }
    ];

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

    const requestBody: any = {
      model: this.model,
      messages: messagesPayload,
      temperature: options.temperature ?? 0.2
    };

    if (options.availableTools && options.availableTools.length > 0) {
      requestBody.tools = options.availableTools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error [${response.status}]: ${errText}`);
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

    return {
      content: message?.content || '',
      toolCalls,
      tokenUsage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens
          }
        : undefined
    };
  }
}
