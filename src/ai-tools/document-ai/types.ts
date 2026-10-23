/**
 * DOKUMEN AI — Types (src/ai-tools/document-ai/types.ts)
 * Dokumen AI: PDF/DOCX/XLSX upload, reader, Q&A, summary, search, table/spec extraction,
 * comparison. Answers come only from the uploaded document content.
 */

export type DocAiMode = 'SUMMARY' | 'QA' | 'EXTRACT' | 'COMPARE' | 'CHAT' | 'CHECKLIST' | 'DRAFT' | 'ENHANCE';

export type ChatTurn = { role: 'user' | 'ai'; text: string };

export type DokumenAiChatRequest = {
  documentText: string;
  fileName: string;
  mode: DocAiMode;
  prompt?: string;
  /** Riwayat percakapan untuk QA kontekstual (maks beberapa turn terakhir). */
  history?: ChatTurn[];
  timeoutMs?: number;
  /**
   * Mode ENHANCE: teks TARGET yang disunting (rentang terpilih atau seluruh
   * dokumen bila pemanggil memintanya). Hanya teks ini yang dikirim ke
   * provider — BUKAN seluruh dokumen bila yang diminta hanya satu rentang.
   */
  selectionText?: string;
  /** Mode ENHANCE: jenis transformasi (kunci EnhanceTransform). */
  transform?: string;
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

/* ------------------------------------------------------------------ */
/* DOCUMENT STUDIO — kontrak intent, provenance konteks, review       */
/* ------------------------------------------------------------------ */

import type { DocTemplateMeta } from './docTemplates';

/** Intent Document Studio (master prompt §C). Setiap intent punya handler nyata di orchestrator. */
export type DocumentIntent =
  | 'CREATE_DOCUMENT'
  | 'SUMMARIZE_DOCUMENT'
  | 'EXTRACT_DATA'
  | 'ASK_DOCUMENT'
  | 'REVIEW_DOCUMENT'
  | 'REVISE_DOCUMENT'
  | 'COMPARE_DOCUMENTS'
  | 'CREATE_REPORT'
  | 'EXTRACT_CONSTRUCTION_SCOPE'
  | 'ENHANCE_TEXT';

export const DOCUMENT_INTENTS: readonly DocumentIntent[] = [
  'CREATE_DOCUMENT',
  'SUMMARIZE_DOCUMENT',
  'EXTRACT_DATA',
  'ASK_DOCUMENT',
  'REVIEW_DOCUMENT',
  'REVISE_DOCUMENT',
  'COMPARE_DOCUMENTS',
  'CREATE_REPORT',
  'EXTRACT_CONSTRUCTION_SCOPE',
  'ENHANCE_TEXT',
] as const;

export function isDocumentIntent(v: unknown): v is DocumentIntent {
  return typeof v === 'string' && (DOCUMENT_INTENTS as readonly string[]).includes(v);
}

/** Sumber data konteks yang diizinkan untuk dipakai dokumen. */
export type ContextSourceType = 'project' | 'company' | 'rab' | 'schedule' | 'document' | 'user';

/**
 * Satu nilai konteks beserta provenance-nya (master prompt §E).
 * Nilai kosong TIDAK dibuang: verificationStatus 'missing' adalah sinyal
 * untuk missing-field detection, bukan fallback ke nilai demo.
 */
export interface ContextField {
  fieldName: string;
  value: string;
  sourceType: ContextSourceType;
  sourceId?: string;
  /** ISO timestamp saat nilai diambil. */
  retrievedAt: string;
  verificationStatus: 'verified' | 'unverified' | 'missing';
}

/** Field yang belum tersedia dan perlu dilengkapi/dikonfirmasi pengguna. */
export interface MissingFieldInfo {
  key: string;
  label: string;
  reason: string;
}

export type ReviewSeverity = 'high' | 'medium' | 'low';
export type ReviewFindingStatus = 'open' | 'fixed' | 'ignored' | 'checked';

/** Kelompok temuan review (polish §7): kelengkapan data, konsistensi, struktur, bahasa, sumber/verifikasi. */
export type ReviewCategory = 'kelengkapan' | 'konsistensi' | 'struktur' | 'bahasa' | 'sumber';

export const REVIEW_CATEGORIES: readonly ReviewCategory[] = [
  'kelengkapan',
  'konsistensi',
  'struktur',
  'bahasa',
  'sumber',
] as const;

/**
 * Temuan review deterministik (master prompt §F). Semua temuan adalah
 * pemeriksaan kelengkapan/konsistensi internal — BUKAN penilaian kepatuhan
 * hukum atau kelengkapan mutlak.
 */
export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  /** Kelompok temuan untuk panel review (polish §7). */
  category: ReviewCategory;
  description: string;
  location?: string;
  reason: string;
  suggestion: string;
  status: ReviewFindingStatus;
}

/* ------------------------------------------------------------------ */
/* ENHANCE TEXT (polish §5) — transformasi atas rentang teks terpilih  */
/* ------------------------------------------------------------------ */

/** Jenis transformasi Enhance Text. 'bebas' memakai instruksi pengguna sendiri. */
export type EnhanceTransform =
  | 'sempurnakan'
  | 'formal'
  | 'perjelas'
  | 'ringkas'
  | 'perluas'
  | 'tata-bahasa'
  | 'teknis'
  | 'poin'
  | 'tabel'
  | 'bebas';

export const ENHANCE_TRANSFORMS: readonly EnhanceTransform[] = [
  'sempurnakan',
  'formal',
  'perjelas',
  'ringkas',
  'perluas',
  'tata-bahasa',
  'teknis',
  'poin',
  'tabel',
  'bebas',
] as const;

export function isEnhanceTransform(v: unknown): v is EnhanceTransform {
  return typeof v === 'string' && (ENHANCE_TRANSFORMS as readonly string[]).includes(v);
}

/** Ringkasan perbandingan dua dokumen (deterministik, tanpa AI). */
export interface DocumentComparison {
  linesA: number;
  linesB: number;
  addedLines: number;
  removedLines: number;
  unchangedLines: number;
  /** Sampel baris yang hanya ada di dokumen B (baru). */
  addedSamples: string[];
  /** Sampel baris yang hanya ada di dokumen A (hilang/berubah). */
  removedSamples: string[];
  summaryText: string;
}

export interface IntentRequest {
  intent: DocumentIntent | string;
  /** Instruksi bebas pengguna (buat/revisi/tanya). */
  instruction?: string;
  /** Teks dokumen utama: referensi (buat), isi draf (review/revisi), atau sumber analisis. */
  documentText?: string;
  /** Teks dokumen kedua — wajib untuk COMPARE_DOCUMENTS. */
  secondDocumentText?: string;
  fileName?: string;
  /** Judul/nama dokumen yang dibuat (CREATE_DOCUMENT / CREATE_REPORT). */
  documentName?: string;
  templateId?: string;
  /** Template meta yang SUDAH diresolusi (resolveTemplate) bila memakai template. */
  templateMeta?: DocTemplateMeta;
  /** Nilai field template dari pengguna (key → nilai). */
  fieldValues?: Record<string, string>;
  /** Konteks proyek/perusahaan terpilih (dari contextAdapter). Hanya field ini yang boleh masuk prompt. */
  contextFields?: ContextField[];
  /** Jenis laporan untuk CREATE_REPORT bila templateMeta tidak diberikan. */
  reportKind?: 'harian' | 'mingguan';
  /** COMPARE_DOCUMENTS: minta narasi AI tambahan di atas ringkasan deterministik. */
  useAiNarrative?: boolean;
  /** ENHANCE_TEXT: teks target (rentang terpilih) yang disunting. */
  selectionText?: string;
  /** ENHANCE_TEXT: jenis transformasi (EnhanceTransform). */
  transform?: EnhanceTransform | string;
  timeoutMs?: number;
}

export interface IntentResult {
  success: boolean;
  intent: DocumentIntent | string;
  /** Konten hasil (draf/revisi kandidat/ringkasan/ekstraksi). Kosong pada REVIEW_DOCUMENT. */
  content?: string;
  /** Temuan untuk REVIEW_DOCUMENT. */
  findings?: ReviewFinding[];
  /** Ringkasan perbandingan untuk COMPARE_DOCUMENTS. */
  comparison?: DocumentComparison;
  /** Field yang belum tersedia — selalu ada (mungkin kosong), tidak pernah disembunyikan. */
  missingFields: MissingFieldInfo[];
  /** Versi system prompt yang dipakai (DRAFT/ENHANCE) — disimpan ke draf oleh UI sebagai metadata. */
  promptVersion?: string;
  errorCode?: string;
  stage?: string;
  message?: string;
}
