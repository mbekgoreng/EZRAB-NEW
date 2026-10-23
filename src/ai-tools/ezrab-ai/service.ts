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
import { scanToolCalls } from './toolCallParser';

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
      return { success: false, reply: result.message, rawContent: '', requestId: '', errorCode: result.errorCode };
    }

    const toolCalls: EzrabAiToolCall[] = [];
    const toolResults: EzrabAiToolResult[] = [];
    // FASE 5A fix: when the model calls a tool, the DETERMINISTIC tool output
    // becomes the reply — never leak the raw tool-call JSON to the user, and
    // never let the model replace tool figures with its own arithmetic.
    // F3: extraction is done by scanToolCalls (balanced, key-order agnostic,
    // up to 3 sequential calls). A malformed call is NEVER executed with
    // silently-emptied args — it is reported as not understood instead.
    let toolReply: string | null = null;
    let fallbackText = result.content;
    try {
      const scan = scanToolCalls(result.content);
      fallbackText = scan.cleanText;
      if (scan.calls.length > 0) {
        const outputs: string[] = [];
        for (const call of scan.calls) {
          toolCalls.push({ toolName: call.toolName, args: call.args });
          if (EZRAB_AI_TOOL_MAP[call.toolName]) {
            const out = runTool(call.toolName, call.args);
            const output = typeof out === 'string' ? out : out.message;
            toolResults.push({ toolName: call.toolName, ok: typeof out === 'string', output });
            outputs.push(output);
          } else {
            const output = `Alat tidak dikenal: ${call.toolName}`;
            toolResults.push({ toolName: call.toolName, ok: false, output });
            outputs.push(output);
          }
        }
        // Deterministic: tool output(s) ARE the answer.
        toolReply = outputs.join('\n\n');
      } else if (scan.malformed) {
        // The model tried to call a tool but the call could not be parsed.
        // Never run it with {} args; answer with the model's remaining
        // prose if any, else a clear "not understood" — never raw JSON.
        toolReply =
          scan.cleanText ||
          'Maaf, perintah yang dibuat model tidak dapat dipahami. Coba ulangi pertanyaanmu dengan kata lain ya.';
      }
    } finally {
      // Never leak one request's project into the next.
      setActiveProjectSnapshot(null);
    }

    const reply = toolReply ?? fallbackText;
    // F3 guard: an empty/whitespace reply must never become an empty chat
    // bubble that looks like a successful answer.
    if (!reply || reply.trim() === '') {
      return {
        success: false,
        reply: 'Model mengembalikan respons kosong. Silakan coba lagi.',
        rawContent: result.content,
        requestId: result.requestId,
        errorCode: 'EMPTY_RESPONSE',
      };
    }
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
