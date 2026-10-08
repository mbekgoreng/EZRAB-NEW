/**
 * DOKUMEN AI — Types (src/ai-tools/document-ai/types.ts)
 * Dokumen AI: PDF/DOCX/XLSX upload, reader, Q&A, summary, search, table/spec extraction,
 * comparison. Answers come only from the uploaded document content.
 */

export type DocAiMode = 'SUMMARY' | 'QA' | 'EXTRACT' | 'COMPARE' | 'CHAT' | 'CHECKLIST' | 'DRAFT';

export type ChatTurn = { role: 'user' | 'ai'; text: string };

export type DokumenAiChatRequest = {
  documentText: string;
  fileName: string;
  mode: DocAiMode;
  prompt?: string;
  /** Riwayat percakapan untuk QA kontekstual (maks beberapa turn terakhir). */
  history?: ChatTurn[];
  timeoutMs?: number;
};

export type DokumenAiChatResponse = {
  success: boolean;
  mode: DocAiMode;
  reply?: string;
  /** true jika teks dokumen dipotong karena batas. */
  truncated?: boolean;
  errorCode?: string;
  stage?: string;
  message?: string;
};
