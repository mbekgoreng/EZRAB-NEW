/**
 * EZRAB AI — Service (src/ai-tools/ezrab-ai/service.ts)
 * Wraps aiToolsProviderClient for the EZRAB_AI product. Builds the prompt from the
 * separate system prompt + conversation history, enforces the registry gate, and
 * returns structured errors — never `Rp0 + SUCCESS` masquerading as a real reply.
 */

import { aiToolsProviderClient } from '../providerClient';
import { EZRAB_AI_SYSTEM_PROMPT } from './prompt';
import { getToolListText, runTool, EZRAB_AI_TOOL_MAP, setActiveProjectSnapshot } from './tools';
import { ProjectSnapshot, formatProjectSummary } from './projectContext';
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
    // Project snapshot: prefer the structured snapshot (drives tools),
    // fall back to the legacy free-text projectSummary.
    const snapshot: ProjectSnapshot | null = (request as any).projectSnapshot ?? null;
    const contextBlock = snapshot
      ? `\n\nKONTEKS PROYEK (data aktual aplikasi — gunakan tool proyek untuk angka pasti):\n${formatProjectSummary(snapshot)}`
      : request.projectSummary
        ? `\n\nKONTEKS PROYEK (ringkas):\n${request.projectSummary}`
        : '';

    // Scope read-only project tools to this request's snapshot; always clear after.
    setActiveProjectSnapshot(snapshot);

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
      mode: request.mode ?? 'fast',
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
    // FASE 5A fix: when the model calls a tool, the DETERMINISTIC tool output
    // becomes the reply — never leak the raw tool-call JSON to the user, and
    // never let the model replace tool figures with its own arithmetic.
    let toolReply: string | null = null;
    try {
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
          const output = typeof out === 'string' ? out : out.message;
          toolResults.push({ toolName, ok: typeof out === 'string', output });
          // Deterministic: tool output IS the answer.
          toolReply = output;
        } else {
          const output = `Alat tidak dikenal: ${toolName}`;
          toolResults.push({ toolName, ok: false, output });
          toolReply = output;
        }
      }
    } finally {
      // Never leak one request's project into the next.
      setActiveProjectSnapshot(null);
    }

    const reply = toolReply ?? result.content;
    return {
      success: true,
      reply,
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
