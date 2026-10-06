/**
 * EZRAB AI — Service (src/ai-tools/ezrab-ai/service.ts)
 * Wraps aiToolsProviderClient for the EZRAB_AI product. Builds the prompt from the
 * separate system prompt + conversation history, enforces the registry gate, and
 * returns structured errors — never `Rp0 + SUCCESS` masquerading as a real reply.
 */

import { aiToolsProviderClient } from '../providerClient';
import { EZRAB_AI_SYSTEM_PROMPT } from './prompt';
import { getToolListText, runTool, EZRAB_AI_TOOL_MAP } from './tools';
import { EzrabAiRequest, EzrabAiResponse, EzrabAiToolCall, EzrabAiToolResult } from './types';
import { aiToolsError } from '../types';

const MAX_HISTORY_MESSAGES = 20;

export class EzrabAiService {
  public async send(request: EzrabAiRequest): Promise<EzrabAiResponse> {
    const history = (request.messages || []).slice(-MAX_HISTORY_MESSAGES);
    const lines: string[] = [];
    for (const m of history) {
      if (m.role === 'user') lines.push(`PENGGUNA: ${m.content}`);
      else lines.push(`EZRAB AI: ${m.content}`);
    }
    const contextBlock = request.projectSummary
      ? `\n\nKONTEKS PROYEK (ringkas):\n${request.projectSummary}`
      : '';

    const lastUser = history.length ? history[history.length - 1].content : '';
    const prompt = `${contextBlock}

PERCAKAPAN:
${lines.join('\n')}

PENGGUNA (terakhir): ${lastUser}

ALAT YANG TERSEDIA:
${getToolListText()}

Jika diperlukan, panggil alat dengan format JSON: {"tool":"<nama_alat>","args":{...}}
Kemudian lanjutkan jawabanmu. Kamu harus menjawab dalam Bahasa Indonesia.`;

    const result = await aiToolsProviderClient.execute<unknown>({
      productId: 'EZRAB_AI',
      prompt,
      systemPrompt: EZRAB_AI_SYSTEM_PROMPT,
      jsonMode: false,
      temperature: request.temperature ?? 0.4,
      maxTokens: request.maxTokens ?? 3000,
      timeoutMs: request.timeoutMs ?? 90000,
    });

    if (!result.success) {
      return { success: false, reply: result.message, rawContent: '', requestId: '' };
    }

    const toolCalls: EzrabAiToolCall[] = [];
    const toolResults: EzrabAiToolResult[] = [];
    const toolPattern = /\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\}/;
    const toolMatch = result.content.match(toolPattern);
    if (toolMatch) {
      const toolName = toolMatch[1];
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolMatch[2]);
      } catch {
        /* ignore malformed tool args */
      }
      toolCalls.push({ toolName, args });
      if (EZRAB_AI_TOOL_MAP[toolName]) {
        const out = runTool(toolName, args);
        toolResults.push({
          toolName,
          ok: typeof out === 'string',
          output: typeof out === 'string' ? out : out.message,
        });
      } else {
        toolResults.push({ toolName, ok: false, output: `Alat tidak dikenal: ${toolName}` });
      }
    }

    return {
      success: true,
      reply: result.content,
      rawContent: result.content,
      requestId: result.requestId,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      toolResults: toolResults.length ? toolResults : undefined,
    };
  }
}

export const ezrabAiService = new EzrabAiService();

export function ezrabAiError(stage: string, message: string) {
  return aiToolsError('MODEL_ERROR', `ezrab-ai:${stage}`, message);
}
