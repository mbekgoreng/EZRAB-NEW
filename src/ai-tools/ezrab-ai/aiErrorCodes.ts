/**
 * aiErrorCodes — kategori error terstruktur yang menghadap pengguna
 * untuk permukaan AI terpadu (direktif §15, Rekonstruksi 2026-11-11).
 *
 * Pengguna melihat PESAN AKSI (Bahasa Indonesia), bukan stack trace.
 * Kode stabil dipakai log diagnostik terstruktur.
 */

export type AiErrorCode =
  | 'PROJECT_CREATION_FAILED'
  | 'ACTIVE_PROJECT_NOT_FOUND'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_CONTEXT_LIMIT_EXCEEDED'
  | 'DRAFT_GENERATION_FAILED'
  | 'PRICE_UNRESOLVED'
  | 'SPREADSHEET_TRANSFER_FAILED'
  | 'SPREADSHEET_PERSISTENCE_UNVERIFIED'
  | 'DUPLICATE_TRANSFER_BLOCKED'
  | 'DRAFT_PERSISTENCE_FAILED'
  | 'DOCUMENT_PROCESSING_FAILED';

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  PROJECT_CREATION_FAILED:
    'Proyek gagal dibuat. Periksa kembali deskripsi proyek Anda, lalu coba lagi.',
  ACTIVE_PROJECT_NOT_FOUND:
    'Tidak ada proyek aktif untuk operasi ini. Pilih atau buat proyek terlebih dahulu.',
  AI_PROVIDER_TIMEOUT:
    'Layanan AI tidak merespons tepat waktu. Permintaan Anda tidak hilang — silakan coba lagi.',
  AI_CONTEXT_LIMIT_EXCEEDED:
    'Konteks percakapan terlalu besar. Ringkas permintaan atau mulai percakapan baru agar spesifikasi penting tidak terpotong.',
  DRAFT_GENERATION_FAILED:
    'Draft RAB gagal disusun. Detail proyek yang sudah tercatat tetap tersimpan — silakan coba lagi.',
  PRICE_UNRESOLVED:
    'Sebagian harga belum teresolusi dari sumber terverifikasi. Item tersebut ditahan berlabel, tidak diisi Rp0.',
  SPREADSHEET_TRANSFER_FAILED:
    'Transfer ke Spreadsheet RAB gagal. Draft Anda tetap aman dan belum ada item yang masuk.',
  SPREADSHEET_PERSISTENCE_UNVERIFIED:
    'Transfer tidak dapat diverifikasi tersimpan. Periksa Spreadsheet RAB sebelum mencoba lagi agar tidak terjadi duplikasi.',
  DUPLICATE_TRANSFER_BLOCKED:
    'Draft ini sudah pernah ditransfer ke proyek yang sama. Transfer duplikat diblokir agar item tidak ganda.',
  DRAFT_PERSISTENCE_FAILED:
    'Draft belum tersimpan di penyimpanan lokal. Draft tetap aktif di sesi ini, tetapi bisa hilang bila halaman dimuat ulang.',
  DOCUMENT_PROCESSING_FAILED:
    'Dokumen gagal diproses. Periksa format dan isi dokumen, lalu coba lagi.',
};

export interface StructuredAiError {
  code: AiErrorCode;
  message: string;
  correlationId: string;
}

/** correlation_id pendek untuk log & pesan dukungan (tanpa data sensitif). */
export function newCorrelationId(): string {
  return `ez-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
}

export function structuredAiError(
  code: AiErrorCode,
  correlationId: string = newCorrelationId(),
): StructuredAiError {
  return { code, message: AI_ERROR_MESSAGES[code], correlationId };
}

export interface AiDiagnosticLog {
  correlation_id: string;
  conversation_id?: string | null;
  project_id?: string | null;
  draft_id?: string | null;
  operation: string;
  error_code: AiErrorCode;
  duration_ms?: number;
  retry_count?: number;
}

/**
 * Log diagnostik terstruktur. TIDAK PERNAH memuat kredensial, kunci API,
 * atau isi dokumen/prompt pengguna — hanya id & metadata operasi.
 */
export function logAiDiagnostic(log: AiDiagnosticLog): void {
  try {
    console.warn('[ezrab-ai]', JSON.stringify(log));
  } catch {
    /* lingkungan tanpa console — abaikan */
  }
}
