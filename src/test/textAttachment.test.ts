/**
 * Test: lampiran file teks Ezrab Chat AI (2026-10-26).
 * Composer hanya menerima file teks; gambar/.pdf/.docx ditolak.
 * Isi dibaca via File.text() dan dikirim sebagai blok terdelimitasi.
 */
import { describe, it, expect } from 'vitest';
import {
  TEXT_ATTACHMENT_EXTENSIONS,
  MAX_TEXT_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_CHARS,
  buildTextAttachmentBlock,
  formatTextAttachmentSize,
  getTextAttachmentExtension,
  isSupportedTextAttachment,
  readTextAttachment,
  type TextAttachmentFileLike,
} from '../ai-tools/ezrab-ai/textAttachment';

const fakeFile = (name: string, size: number, text: string): TextAttachmentFileLike => ({
  name,
  size,
  text: async () => text,
});

describe('ekstensi lampiran teks', () => {
  it('menerima tepat 9 ekstensi yang didaftarkan', () => {
    expect(TEXT_ATTACHMENT_EXTENSIONS).toEqual([
      'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'log', 'xml',
    ]);
    for (const ext of TEXT_ATTACHMENT_EXTENSIONS) {
      expect(isSupportedTextAttachment(`data.${ext}`)).toBe(true);
    }
  });

  it('ekstensi tidak peka huruf besar/kecil', () => {
    expect(isSupportedTextAttachment('DATA.CSV')).toBe(true);
    expect(isSupportedTextAttachment('catatan.Md')).toBe(true);
  });

  it('menolak gambar, pdf, docx, dan tanpa ekstensi', () => {
    for (const name of [
      'foto.png', 'foto.jpg', 'foto.jpeg', 'foto.gif', 'foto.webp',
      'dok.pdf', 'dok.docx', 'data.xls', 'data.xlsx', 'tanpaekstensi',
      'arsip.csv.png', // ekstensi terakhir yang berlaku = png
    ]) {
      expect(isSupportedTextAttachment(name)).toBe(false);
    }
  });

  it('getTextAttachmentExtension: titik terakhir, tanpa titik = kosong', () => {
    expect(getTextAttachmentExtension('a.b.csv')).toBe('csv');
    expect(getTextAttachmentExtension('noext')).toBe('');
    expect(getTextAttachmentExtension('trailing.')).toBe('');
  });

  it('pesan penolakan menyebut format yang didukung', async () => {
    const res = await readTextAttachment(fakeFile('foto.png', 100, 'x'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('.txt');
      expect(res.error).toContain('.csv');
      expect(res.error).toContain('.json');
    }
  });
});

describe('batas ukuran dan pemotongan', () => {
  it('menolak file > 200 KB dengan pesan jelas', async () => {
    const res = await readTextAttachment(
      fakeFile('besar.log', MAX_TEXT_ATTACHMENT_BYTES + 1, 'x'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('200');
  });

  it('menerima file tepat 200 KB', async () => {
    const res = await readTextAttachment(
      fakeFile('pas.log', MAX_TEXT_ATTACHMENT_BYTES, 'ok'),
    );
    expect(res.ok).toBe(true);
  });

  it('isi > 20.000 karakter dipotong dengan penanda total', async () => {
    const raw = 'a'.repeat(MAX_TEXT_ATTACHMENT_CHARS + 5000);
    const res = await readTextAttachment(fakeFile('panjang.txt', 100, raw));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attachment.truncated).toBe(true);
      expect(res.attachment.content.length).toBe(MAX_TEXT_ATTACHMENT_CHARS);
      expect(res.attachment.totalChars).toBe(raw.length);
      const block = buildTextAttachmentBlock(res.attachment);
      expect(block).toContain('[dipotong:');
      expect(block).toContain(String(raw.length));
    }
  });

  it('isi pendek tidak terpotong dan tanpa penanda', async () => {
    const res = await readTextAttachment(fakeFile('kecil.txt', 10, 'halo'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attachment.truncated).toBe(false);
      expect(buildTextAttachmentBlock(res.attachment)).not.toContain('[dipotong');
    }
  });
});

describe('format blok lampiran', () => {
  it('terdelimitasi jelas dengan nama file', () => {
    const block = buildTextAttachmentBlock({
      name: 'rab.csv', size: 20, content: 'a,b\n1,2',
      truncated: false, totalChars: 9,
    });
    expect(block).toBe(
      '=== LAMPIRAN: rab.csv ===\na,b\n1,2\n=== AKHIR LAMPIRAN ===',
    );
  });
});

describe('format ukuran', () => {
  it('byte dan KB', () => {
    expect(formatTextAttachmentSize(512)).toBe('512 B');
    expect(formatTextAttachmentSize(2048)).toBe('2.0 KB');
  });
});
