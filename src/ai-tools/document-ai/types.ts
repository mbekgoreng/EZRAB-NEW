/**
 * DOKUMEN AI — Types (src/ai-tools/document-ai/types.ts)
 * Dokumen AI: PDF/DOCX/XLSX upload, reader, Q&A, summary, search, table/spec extraction,
 * comparison. Answers come only from the uploaded document content.
 */

export type DokumenAiChatRequest = {
  documentText: string;
  fileName: string;
  mode: 'SUMMARY' | 'QA' | 'EXTRACT' | 'COMPARE' | 'CHAT';
  prompt?: string;
  timeoutMs?: number;
};

export type DokumenAiChatResponse = {
  success: boolean;
  mode: NonNullable<DokumenAiChatRequest['mode']>;
  reply?: string;
  errorCode?: string;
  stage?: string;
  message?: string;
};
