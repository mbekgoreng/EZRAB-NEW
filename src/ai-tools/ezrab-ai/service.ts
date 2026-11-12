/**
 * EZRAB AI — Service (src/ai-tools/ezrab-ai/service.ts)
 * Wraps aiToolsProviderClient for the EZRAB_AI product. Builds the prompt from the
 * separate system prompt + conversation history, enforces the registry gate, and
 * returns structured errors — never `Rp0 + SUCCESS` masquerading as a real reply.
 */

import { aiToolsProviderClient } from '../providerClient';
import { EZRAB_AI_SYSTEM_PROMPT } from './prompt';
import { getToolListText } from './tools';
import { ProjectSnapshot } from './projectContext';
import { executeTool } from './toolRegistry';
import {
  assembleChatPrompt,
  buildCanonicalContext,
  CANONICAL_TOTAL_PROMPT_BUDGET,
} from './canonicalContext';
import { EzrabAiRequest, EzrabAiResponse, EzrabAiToolCall, EzrabAiToolResult } from './types';
import { aiToolsError } from '../types';
import { scanToolCalls } from './toolCallParser';

/**
 * Satu kunci idempotensi per operasi kirim pengguna. Gateway menghormati
 * header Idempotency-Key (replay idempoten, TTL 120 dtk, hanya respons
 * sukses, ter-scope pemanggil): percobaan ulang untuk operasi yang SAMA
 * memakai kunci yang sama sehingga tidak menciptakan biaya/dokumen
 * duplikat; pesan baru = kunci baru.
 */
function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `ezrab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export class EzrabAiService {
  public async send(request: EzrabAiRequest): Promise<EzrabAiResponse> {
    // FASE 1 (Canonical Context Intelligence): perakitan konteks TIDAK
    // lagi di sini — satu builder kanonis (canonicalContext.ts) dipakai
    // jalur ini DAN Copilot. Anggaran total, dedupe pesan terakhir,
    // fakta dari state terstruktur, ringkasan, dan retrieval relevan
    // semuanya milik builder; service hanya merakit prompt akhir dari
    // blok data + seksi alat, lalu memanggil provider seperti semula.
    const snapshot: ProjectSnapshot | null = (request as any).projectSnapshot ?? null;
    // Builder kanonis murni (tidak memakai singleton tool) — snapshot
    // baru di-scope ke tool SESUDAH prompt terakit, agar throw validasi
    // scope (snapshot lintas proyek) tidak membocorkan snapshot lama.
    const toolSectionProbe = assembleChatPrompt('', getToolListText());
    // Panjang seksi di luar blok data (alat + aturan bahasa) — dicadangkan
    // dari anggaran total agar prompt rakitan ≤ 16.000 karakter.
    const reservedChars = toolSectionProbe.length;
    const built = buildCanonicalContext({
      userId: request.userId ?? null,
      projectId: request.projectId ?? snapshot?.projectId ?? null,
      conversationId: request.conversationId ?? request.sessionId ?? null,
      messages: request.messages ?? [],
      projectSnapshot: snapshot,
      projectSummaryText: request.projectSummary ?? null,
      intakeContext: request.intakeContext ?? null,
      structuredSpecs: request.structuredSpecs ?? null,
      draftSummary: request.draftSummary ?? null,
      storedSummary: request.storedSummary ?? null,
      memorySection: request.memorySection ?? null,
      memoryReport: request.memoryReport ?? null,
      objectiveSection: request.objectiveSection ?? null,
      dedSection: request.dedSection ?? null,
      qtoSection: request.qtoSection ?? null,
      reservedChars,
    });
    // Observabilitas: satu baris JSON per kirim — ukuran tiap seksi,
    // jumlah memori/fakta yang diambil, duplikat yang dibuang, dan
    // pemotongan anggaran; memungkinkan verifikasi tanpa menebak.
    try {
      console.info('[canonical-context]', JSON.stringify(built.report));
    } catch {
      /* logging tidak boleh menggagalkan kirim */
    }
    const prompt = assembleChatPrompt(built.dataBlock, getToolListText());
    if (prompt.length > CANONICAL_TOTAL_PROMPT_BUDGET) {
      // Fail-closed yang jujur: guard ini DAPAT menyala — anggaran
      // per-seksi builder tidak menjamin prompt rakitan (blok data +
      // seksi alat + aturan bahasa) selalu ≤ anggaran total, sehingga
      // rakitan yang melebihi anggaran gagal di sini dengan pesan yang
      // dapat ditindaklanjuti — jangan kirim prompt yang pasti ditolak
      // gateway sebagai PAYLOAD_TOO_LARGE.
      return {
        success: false,
        reply: 'Permintaan terlalu besar untuk dikirim (melebihi anggaran konteks). Coba persingkat pesan atau mulai percakapan baru.',
        rawContent: '',
        requestId: '',
        errorCode: 'CONTEXT_BUDGET_EXCEEDED',
      };
    }

    // Scope read-only project tools ke snapshot permintaan ini — dikelola
    // PER TOOL oleh registry (executeTool set/clear di sekitar invoke),
    // bukan sekali untuk seluruh kirim (agar tool kedua tidak kehilangan
    // snapshot bila tool pertama membersihkannya).
    const idempotencyKey = request.idempotencyKey ?? newIdempotencyKey();
    const result = await aiToolsProviderClient.execute<unknown>({
      productId: 'EZRAB_AI',
      mode: request.mode ?? 'fast',
      prompt,
      systemPrompt: EZRAB_AI_SYSTEM_PROMPT,
      jsonMode: false,
      temperature: request.temperature ?? 0.4,
      maxTokens: request.maxTokens ?? 3000,
      timeoutMs: request.timeoutMs ?? 90000,
      idempotencyKey,
      signal: request.signal,
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
          // FASE 5 — panggilan tool model TIDAK lagi langsung ke runTool:
          // lewat registry kanonis (validasi skema + permission +
          // scope proyek + idempotensi + trail audit yang sama dengan
          // Copilot & orkestrator). Actor 'model': tool konsekwensial
          // tanpa persetujuan pengguna TIDAK dijalankan (awaiting-approval).
          const exec = await executeTool({
            toolName: call.toolName,
            args: call.args,
            projectId: request.projectId ?? snapshot?.projectId ?? null,
            conversationId: request.conversationId ?? request.sessionId ?? null,
            actor: 'model',
            channel: 'chat-ai',
            projectSnapshot: snapshot,
          });
          const output = exec.output ?? exec.error ?? `Alat ${call.toolName} gagal tanpa pesan.`;
          toolResults.push({ toolName: call.toolName, ok: exec.ok, output });
          outputs.push(output);
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
      // Registry mengelola snapshot proyek per tool (set/clear di
      // sekitar invoke) — tidak ada snapshot yang bocor ke request berikut.
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
