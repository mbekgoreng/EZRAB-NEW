/**
 * Lampiran file TEKS untuk Ezrab Chat AI (2026-10-26).
 *
 * Dulu composer hanya menerima gambar, yang oleh sistem sekadar dicatat
 * sebagai "tidak dapat dilihat model teks" — isi file tidak pernah sampai
 * ke AI. Sekarang lampiran difokuskan ke file teks: isinya dibaca di
 * browser (File.text(), tanpa dependensi baru) dan dikirim sebagai blok
 * konteks terdelimitasi bersama pesan lewat jalur service.send yang sama.
 *
 * BATAS YANG DISENGAJA (bukan kelalaian):
 * - .pdf / .docx TIDAK didukung: butuh parser berat di browser/server.
 *   Bila suatu saat didukung, tambahkan parsernya dulu, baru ekstensinya.
 * - Satu file per pesan (cukup untuk konteks; chip dihapus sesudah kirim).
 *
 * ATURAN UKURAN (konsisten, satu sumber kebenaran di sini):
 * - File > MAX_TEXT_ATTACHMENT_BYTES (200 KB) DITOLAK mentah-mentah
 *   dengan pesan jelas — bukan dipotong diam-diam.
 * - Isi yang lolos tapi > MAX_TEXT_ATTACHMENT_CHARS (20.000 karakter)
 *   DIPOTONG ke 20.000 karakter pertama dengan penanda "[dipotong]"
 *   yang menyebut total karakter asli, supaya AI tahu konteksnya parsial.
 */
export const TEXT_ATTACHMENT_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'log',
  'xml',
] as const;

export const TEXT_ATTACHMENT_ACCEPT = TEXT_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(',');

export const MAX_TEXT_ATTACHMENT_BYTES = 200 * 1024;
export const MAX_TEXT_ATTACHMENT_CHARS = 20_000;

export interface TextAttachment {
  name: string;
  size: number;
  /** Isi sesudah pemotongan (bila terpotong, lihat `truncated`). */
  content: string;
  truncated: boolean;
  /** Jumlah karakter asli sebelum pemotongan. */
  totalChars: number;
}

/** Subset File DOM yang dipakai helper ini (memudahkan tes dengan fake). */
export interface TextAttachmentFileLike {
  name: string;
  size: number;
  text: () => Promise<string>;
}

export type TextAttachmentResult =
  | { ok: true; attachment: TextAttachment }
  | { ok: false; error: string };

/** Ekstensi lowercase sesudah titik terakhir; '' bila tidak ada titik. */
export function getTextAttachmentExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

export function isSupportedTextAttachment(fileName: string): boolean {
  const ext = getTextAttachmentExtension(fileName);
  return (TEXT_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
}

export function formatTextAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Blok konteks yang dikirim ke AI bersama pesan user. Delimiter eksplisit
 * supaya model tidak mengira isi file adalah perintah user, dan penanda
 * potong supaya model tahu bila konteksnya parsial.
 */
export function buildTextAttachmentBlock(att: TextAttachment): string {
  const lines = [`=== LAMPIRAN: ${att.name} ===`, att.content];
  if (att.truncated) {
    lines.push(
      `[dipotong: menampilkan ${att.content.length} dari ${att.totalChars} karakter]`,
    );
  }
  lines.push('=== AKHIR LAMPIRAN ===');
  return lines.join('\n');
}

export async function readTextAttachment(
  file: TextAttachmentFileLike,
): Promise<TextAttachmentResult> {
  if (!isSupportedTextAttachment(file.name)) {
    return {
      ok: false,
      error:
        `Format “${file.name}” tidak didukung. File teks yang diterima: ` +
        TEXT_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(', ') +
        `. Gambar (.png/.jpg/dll), .pdf, dan .docx tidak diterima di chat ini.`,
    };
  }
  if (file.size > MAX_TEXT_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error:
        `File “${file.name}” terlalu besar (${formatTextAttachmentSize(file.size)}). ` +
        `Maksimal ${formatTextAttachmentSize(MAX_TEXT_ATTACHMENT_BYTES)} per file.`,
    };
  }
  const raw = await file.text();
  const truncated = raw.length > MAX_TEXT_ATTACHMENT_CHARS;
  return {
    ok: true,
    attachment: {
      name: file.name,
      size: file.size,
      content: truncated ? raw.slice(0, MAX_TEXT_ATTACHMENT_CHARS) : raw,
      truncated,
      totalChars: raw.length,
    },
  };
}
