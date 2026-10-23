/**
 * DOKUMEN AI — Service (src/ai-tools/document-ai/service.ts)
 * Wraps aiToolsProviderClient for the DOKUMEN_AI product. Answers only from the
 * extracted document content. Structured errors, never fabricated success.
 */

import { aiToolsProviderClient } from '../providerClient';
import { ENHANCE_TRANSFORM_GUIDANCE, systemForMode } from './prompt';
import { DokumenAiChatRequest, DokumenAiChatResponse } from './types';

const MAX_DOC_CHARS = 140_000;

/** Batas teks target ENHANCE — rentang suntingan, bukan unggahan dokumen. */
export const MAX_ENHANCE_SELECTION_CHARS = 8_000;

export class DokumenAiService {
  public async chat(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    if (request.mode === 'ENHANCE') return this.enhance(request);

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

  /**
   * Mode ENHANCE (polish §5): menyunting TEKS TARGET saja. Seluruh dokumen
   * TIDAK dikirim — konteks minimum hanya nama/jenis dokumen (fileName).
   * Validasi panjang di sini (sebelum jaringan): kosong → EMPTY_SELECTION,
   * melebihi batas → SELECTION_TOO_LONG. Keduanya error terstruktur.
   */
  private async enhance(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    const selection = request.selectionText ?? '';
    if (!selection.trim()) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'EMPTY_SELECTION',
        stage: 'enhance:selection',
        message: 'Tidak ada teks yang dipilih untuk disempurnakan.',
      };
    }
    if (selection.length > MAX_ENHANCE_SELECTION_CHARS) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'SELECTION_TOO_LONG',
        stage: 'enhance:selection',
        message: `Teks terpilih ${selection.length} karakter melebihi batas ${MAX_ENHANCE_SELECTION_CHARS} karakter untuk satu kali penyuntingan. Persempit pilihan teks Anda.`,
      };
    }

    const guidance = ENHANCE_TRANSFORM_GUIDANCE[request.transform ?? ''] ?? ENHANCE_TRANSFORM_GUIDANCE.sempurnakan;
    const parts = [
      `Sunting teks target berikut dari dokumen "${request.fileName || 'Dokumen'}". Kembalikan HANYA teks hasil suntingan — tanpa pengantar, tanpa komentar, tanpa penjelasan perubahan.`,
      `JENIS TRANSFORMASI: ${guidance}`,
    ];
    if (request.prompt?.trim()) {
      parts.push(`INSTRUKSI PENGGUNA: ${request.prompt.trim()}`);
    }
    parts.push(`TEKS TARGET:\n${selection}`);
    const userPrompt = parts.join('\n\n');

    const result = await aiToolsProviderClient.execute<unknown>({
      productId: 'DOKUMEN_AI',
      prompt: userPrompt,
      systemPrompt: systemForMode('ENHANCE'),
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
