/**
 * DOKUMEN AI — Service (src/ai-tools/document-ai/service.ts)
 * Wraps aiToolsProviderClient for the DOKUMEN_AI product. Answers only from the
 * extracted document content. Structured errors, never fabricated success.
 */

import { aiToolsProviderClient } from '../providerClient';
import { systemForMode } from './prompt';
import { DokumenAiChatRequest, DokumenAiChatResponse } from './types';

const MAX_DOC_CHARS = 140_000;

export class DokumenAiService {
  public async chat(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    const docText = (request.documentText || '').slice(0, MAX_DOC_CHARS);
    if (!docText.trim()) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'NO_DATA',
        stage: 'document:text',
        message: 'Dokumen kosong — tidak ada teks yang bisa dianalisis.',
      };
    }

    const userPrompt =
      request.mode === 'QA' || request.mode === 'CHAT'
        ? `Berdasarkan dokumen "${request.fileName}":\n\n${docText}\n\nPertanyaan: ${request.prompt || ''}`
        : request.mode === 'SUMMARY'
          ? `Ringkas dokumen "${request.fileName}":\n\n${docText}`
          : request.mode === 'EXTRACT'
            ? `Ekstrak tabel/spesifikasi dari dokumen "${request.fileName}":\n\n${docText}`
            : request.mode === 'COMPARE'
              ? `Bandingkan bagian-bagian dokumen "${request.fileName}":\n\n${docText}`
              : docText;

    const result = await aiToolsProviderClient.execute<unknown>({
      productId: 'DOKUMEN_AI',
      prompt: userPrompt,
      systemPrompt: systemForMode(request.mode),
      jsonMode: false,
      maxTokens: 4000,
      timeoutMs: request.timeoutMs ?? 120000,
    });

    if (!result.success) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: result.errorCode,
        stage: result.stage,
        message: result.message,
      };
    }

    return { success: true, reply: result.content, mode: request.mode };
  }
}

export const dokumenAiService = new DokumenAiService();
