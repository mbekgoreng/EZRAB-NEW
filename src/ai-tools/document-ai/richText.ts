/**
 * AI DOKUMEN — Rich text helpers (src/ai-tools/document-ai/richText.ts)
 *
 * KEPUTUSAN FORMAT (audit 2026-10-21):
 * - Draf lama tersimpan sebagai TEKS POLOS di `DraftRecord.content`
 *   (contentFormat tidak ada / 'plain').
 * - Editor baru (Word-like, TipTap) bekerja dengan HTML. Draf baru disimpan
 *   sebagai HTML di field `content` yang sama, ditandai
 *   `contentFormat: 'html'`.
 * - Kompatibilitas mundur: record tanpa `contentFormat` SELALU dibaca
 *   sebagai teks polos lalu dikonversi ke HTML saat dibuka di editor
 *   (escape penuh — tidak ada interpretasi markdown, jadi tidak ada
 *   format yang dikarang). Setelah pengguna menyimpan dari editor,
 *   record menjadi 'html' secara eksplisit.
 * - Ekspor TXT memakai htmlToPlain agar draf HTML tetap menghasilkan
 *   teks bersih yang setara.
 */

export type ContentFormat = 'plain' | 'html';

/** Format efektif sebuah record draf (record lama = 'plain'). */
export function draftFormat(rec: { contentFormat?: ContentFormat | string }): ContentFormat {
  return rec.contentFormat === 'html' ? 'html' : 'plain';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Teks polos -> HTML aman untuk editor.
 * Paragraf dipisah baris kosong; baris tunggal menjadi <br>.
 * Tidak menafsirkan markdown — teks tampil persis seperti aslinya.
 */
export function plainToHtml(text: string): string {
  const normalized = (text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '<p></p>';
  return normalized
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
}

const BLOCK_CLOSE = /<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi;
const BLOCK_OPEN_LI = /<li[^>]*>/gi;

/**
 * HTML -> teks polos (untuk ekspor .txt dan pratinjau riwayat).
 * Blok menjadi baris/paragraf; tag inline dibuang. Implementasi string
 * murni agar hasil identik di browser dan node (tes).
 */
export function htmlToPlain(html: string): string {
  if (!html) return '';
  let s = html.replace(/\r\n/g, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(BLOCK_OPEN_LI, '\n• ');
  s = s.replace(BLOCK_CLOSE, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Konten draf (format apa pun) -> HTML siap editor. */
export function toEditorHtml(content: string, format: ContentFormat): string {
  return format === 'html' ? content || '<p></p>' : plainToHtml(content);
}

/** Konten draf (format apa pun) -> teks polos untuk ekspor .txt. */
export function toPlainText(content: string, format: ContentFormat): string {
  return format === 'html' ? htmlToPlain(content) : content || '';
}
