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
    const fullText = request.documentText || '';
    const truncated = fullText.length > MAX_DOC_CHARS;
    const docText = fullText.slice(0, MAX_DOC_CHARS);
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

    // Riwayat percakapan untuk QA kontekstual (batasi agar prompt tidak bloat).
    const historyBlock = (request.history || [])
      .slice(-6)
      .map((t) => `${t.role === 'user' ? 'Pengguna' : 'AI'}: ${t.text.slice(0, 2000)}`)
      .join('\n');
    const historySection = historyBlock ? `\n\nPercakapan sebelumnya:\n${historyBlock}` : '';

    const userPrompt =
      request.mode === 'QA' || request.mode === 'CHAT'
        ? `Berdasarkan dokumen "${request.fileName}":\n\n${docText}${historySection}\n\nPertanyaan: ${request.prompt || ''}`
        : request.mode === 'SUMMARY'
          ? `Ringkas dokumen "${request.fileName}":\n\n${docText}`
          : request.mode === 'EXTRACT'
            ? `Ekstrak tabel/spesifikasi dari dokumen "${request.fileName}":\n\n${docText}`
            : request.mode === 'COMPARE'
              ? `Bandingkan bagian-bagian dokumen "${request.fileName}":\n\n${docText}`
              : request.mode === 'CHECKLIST'
                ? `Periksa kelengkapan dokumen "${request.fileName}" (dokumen konstruksi). Sebutkan bagian/informasi yang ada dan yang belum ada/tidak ditemukan:\n\n${docText}`
                : request.mode === 'DRAFT'
                  ? `Buatkan draf dokumen berdasarkan instruksi berikut. Gunakan HANYA informasi yang diberikan; jangan mengarang nomor surat, nama pihak, nilai kontrak, atau persetujuan.\n\nInstruksi: ${request.prompt || ''}\n\nKonteks dokumen referensi "${request.fileName}":\n${docText}`
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

    return { success: true, reply: result.content, mode: request.mode, truncated };
  }
}

export const dokumenAiService = new DokumenAiService();
