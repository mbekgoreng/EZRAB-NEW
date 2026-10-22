/**
 * Fase B Paper System — companyProfile, paperModel, docTemplates.
 * Jalankan: npx vitest run src/test/docPaperSystem.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  detectLogoKind,
  emptyProfile,
  kopHtml,
  saveProfile,
  listProfiles,
  getDefaultProfile,
  deleteProfile,
} from '../ai-tools/document-ai/companyProfile';
import { htmlToPaperBlocks, paperBlocksToText, parseRuns } from '../ai-tools/document-ai/paperModel';
import {
  TEMPLATE_META,
  buildFieldBlock,
  missingRequiredFields,
  saveUserTemplate,
  listUserTemplates,
  newUserTemplate,
  deleteUserTemplate,
} from '../ai-tools/document-ai/docTemplates';

describe('companyProfile — deteksi logo dari magic bytes', () => {
  it('PNG/JPEG/GIF/WebP dikenali; file lain ditolak', () => {
    expect(detectLogoKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectLogoKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectLogoKind(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('gif');
    expect(
      detectLogoKind(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe('webp');
    expect(detectLogoKind(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(null); // PDF — bukan logo
    expect(detectLogoKind(new Uint8Array([1, 2]))).toBe(null);
  });

  it('kop HTML: kosong tanpa profil; 3 layout merender nama + kontak; teks di-escape', () => {
    expect(kopHtml(null)).toBe('');
    expect(kopHtml(emptyProfile())).toBe('');
    const p = emptyProfile({ name: 'PT <Uji> & Co', address: 'Jl. Merdeka 1', phone: '0812', layout: 'left' });
    const left = kopHtml(p);
    expect(left).toContain('docai-kop-left');
    expect(left).toContain('PT &lt;Uji&gt; &amp; Co');
    expect(left).toContain('Jl. Merdeka 1 • 0812');
    expect(kopHtml({ ...p, layout: 'center' })).toContain('docai-kop-center');
    expect(kopHtml({ ...p, layout: 'minimal' })).toContain('docai-kop-minimal');
  });

  it('profil tersimpan & default konsisten', () => {
    const a = emptyProfile({ name: 'Satu' });
    saveProfile(a);
    const b = emptyProfile({ name: 'Dua', isDefault: true });
    saveProfile(b);
    const all = listProfiles();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(getDefaultProfile()?.name).toBe('Dua');
    deleteProfile(b.id);
    expect(getDefaultProfile()?.name).toBe('Satu');
  });
});

describe('paperModel — HTML editor → blok kertas', () => {
  const html = [
    '<h1 style="text-align: center">BERITA ACARA</h1>',
    '<p>Pada hari ini <strong>disepakati</strong> bersama <em>oleh para pihak</em>.</p>',
    '<ul><li>Item <strong>satu</strong></li><li>Item dua</li></ul>',
    '<table><tbody><tr><th>Uraian</th><th>Volume</th></tr><tr><td>Kolom</td><td>12</td></tr></tbody></table>',
    '<hr>',
    '<h2>B. Penutup</h2>',
    '<p style="text-align: right">Hormat kami</p>',
  ].join('');

  it('blok terstruktur benar (heading/paragraf/list/tabel/hr)', () => {
    const blocks = htmlToPaperBlocks(html);
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1, text: 'BERITA ACARA', align: 'center' });
    const para = blocks.find((b) => b.type === 'paragraph');
    expect(para && para.type === 'paragraph' ? para.runs.map((r) => `${r.text}|${r.bold ? 'B' : ''}${r.italic ? 'I' : ''}`).join(' ') : '').toContain('disepakati|B');
    const list = blocks.find((b) => b.type === 'list');
    expect(list && list.type === 'list' ? list.items.length : 0).toBe(2);
    const table = blocks.find((b) => b.type === 'table');
    expect(table && table.type === 'table' ? table.header : null).toEqual(['Uraian', 'Volume']);
    expect(table && table.type === 'table' ? table.rows : null).toEqual([['Kolom', '12']]);
    expect(blocks.some((b) => b.type === 'hr')).toBe(true);
    const text = paperBlocksToText(blocks);
    expect(text).toContain('BERITA ACARA');
    expect(text).toContain('Uraian | Volume');
  });

  it('parseRuns menggabungkan flag inline', () => {
    const runs = parseRuns('teks <strong>tebal <em>miring</em></strong> biasa');
    expect(runs.some((r) => r.bold && r.italic && r.text.includes('miring'))).toBe(true);
    expect(runs[0].text).toContain('teks');
  });

  it('HTML kosong → tanpa blok', () => {
    expect(htmlToPaperBlocks('')).toEqual([]);
    expect(htmlToPaperBlocks('<p></p>')).toEqual([]);
  });
});

describe('docTemplates — field & template pengguna', () => {
  it('field wajib kosong terdeteksi; blok data deterministik', () => {
    const meta = TEMPLATE_META['surat'];
    expect(missingRequiredFields(meta, {})).toContain('Nomor Dokumen');
    const values = { nomorDokumen: '001/SRT/X/2026', tanggalDokumen: '2026-10-21', tujuanSurat: 'PT ABC', perihal: 'Penawaran' };
    expect(missingRequiredFields(meta, values)).toEqual([]);
    const block = buildFieldBlock(meta, values);
    expect(block).toContain('DATA DOKUMEN');
    expect(block).toContain('001/SRT/X/2026');
    expect(block).toContain('KERANGKA STRUKTUR');
  });

  it('template pengguna: simpan, duplikat basis, arsip, hapus', () => {
    const t = newUserTemplate({ name: 'BA Kolom', baseTemplateId: 'berita-acara', scaffold: 'Isi khusus' });
    saveUserTemplate(t);
    expect(listUserTemplates().some((x) => x.id === t.id)).toBe(true);
    saveUserTemplate({ ...t, archived: true });
    expect(listUserTemplates(false).some((x) => x.id === t.id)).toBe(false);
    deleteUserTemplate(t.id);
    expect(listUserTemplates().some((x) => x.id === t.id)).toBe(false);
  });

  it('semua template bawaan punya meta (6 lama + 6 baru)', () => {
    for (const id of ['berita-acara', 'surat', 'laporan-harian', 'notulen', 'checklist-qc', 'bebas', 'bast', 'opname', 'laporan-mingguan', 'laporan-k3', 'surat-penawaran', 'surat-undangan']) {
      expect(TEMPLATE_META[id], id).toBeTruthy();
      expect(typeof TEMPLATE_META[id].scaffold).toBe('string');
    }
  });
});
