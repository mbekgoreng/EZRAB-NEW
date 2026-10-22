/**
 * Perbaikan Template Profesional AI Document — subjenis, contoh dokumen,
 * metadata acuan, dan aturan anti fakta karangan (master prompt §3–§11).
 * Jalankan: npx vitest run src/test/docTemplatesPro.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_META,
  resolveTemplate,
  missingRequiredFields,
  buildFieldBlock,
  CONTOH_BANNER_HTML,
} from '../ai-tools/document-ai/docTemplates';
import { htmlToPaperBlocks, type PaperBlock } from '../ai-tools/document-ai/paperModel';
import { kopHtml, emptyProfile } from '../ai-tools/document-ai/companyProfile';

type TableBlock = Extract<PaperBlock, { type: 'table' }>;
function tablesOf(html: string): TableBlock[] {
  return htmlToPaperBlocks(html).filter((b): b is TableBlock => b.type === 'table');
}
function sampleOf(id: string, subtypeId?: string): string {
  return resolveTemplate(TEMPLATE_META[id], subtypeId).sampleHtml ?? '';
}
const num = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'));

describe('struktur template profesional', () => {
  it('6 kategori utama punya subjenis / struktur lengkap', () => {
    expect(TEMPLATE_META['berita-acara'].subtypes?.length).toBeGreaterThanOrEqual(5);
    expect(TEMPLATE_META['surat'].subtypes?.length).toBeGreaterThanOrEqual(6);
    for (const id of ['laporan-harian', 'notulen', 'checklist-qc', 'bebas']) {
      expect(TEMPLATE_META[id].sampleHtml, id).toBeTruthy();
      expect(TEMPLATE_META[id].scaffold.length, id).toBeGreaterThan(80);
    }
  });

  it('template Fase B tidak dihapus dan tetap berfungsi (tumpang tindih opname dinyatakan apa adanya)', () => {
    for (const id of ['bast', 'opname', 'laporan-mingguan', 'laporan-k3', 'surat-penawaran', 'surat-undangan']) {
      expect(TEMPLATE_META[id], id).toBeTruthy();
      expect(TEMPLATE_META[id].scaffold.length).toBeGreaterThan(20);
    }
    // Opname kini ada dua pintu: template mandiri Fase B DAN subjenis Berita Acara.
    expect(TEMPLATE_META['berita-acara'].subtypes?.some((s) => s.id === 'opname')).toBe(true);
  });

  it('semua contoh bertanda CONTOH dengan data dummy', () => {
    const samples = [
      sampleOf('berita-acara', 'serah-terima'),
      sampleOf('berita-acara', 'opname'),
      sampleOf('surat', 'permohonan'),
      sampleOf('surat', 'undangan'),
      sampleOf('laporan-harian'),
      sampleOf('notulen'),
      sampleOf('checklist-qc'),
      sampleOf('bebas'),
    ];
    for (const s of samples) {
      expect(s.startsWith(CONTOH_BANNER_HTML)).toBe(true);
      expect(s).toContain('data dummy');
    }
  });

  it('metadata acuan jujur: lengkap, tanpa klaim SNI, QC belum terverifikasi', () => {
    for (const id of ['berita-acara', 'surat', 'laporan-harian', 'notulen', 'checklist-qc', 'bebas']) {
      const ref = TEMPLATE_META[id].reference;
      expect(ref, id).toBeTruthy();
      expect(ref!.sourceName.length).toBeGreaterThan(10);
      expect(ref!.scope.length).toBeGreaterThan(20);
      expect(ref!.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['terverifikasi', 'sebagian', 'belum-terverifikasi']).toContain(ref!.verification);
    }
    expect(TEMPLATE_META['checklist-qc'].reference?.verification).toBe('belum-terverifikasi');
    expect(TEMPLATE_META['berita-acara'].reference?.scope).toContain('BUKAN format yang diatur SNI');
    // Tidak ada nomor SNI karangan di seluruh meta (scaffold, contoh, acuan).
    expect(JSON.stringify(TEMPLATE_META)).not.toMatch(/SNI\s+\d{2,}/);
  });
});

describe('subjenis & field dinamis', () => {
  it('field bergantung subjenis: opname wajib periode, serah terima tidak', () => {
    const opname = resolveTemplate(TEMPLATE_META['berita-acara'], 'opname');
    expect(missingRequiredFields(opname, {})).toContain('Periode Opname');
    const serah = resolveTemplate(TEMPLATE_META['berita-acara'], 'serah-terima');
    expect(serah.fields.some((f) => f.key === 'masaPemeliharaan')).toBe(true);
    expect(serah.fields.some((f) => f.key === 'periode')).toBe(false);
  });

  it('field undangan hanya tampil pada subjenis undangan', () => {
    const undangan = resolveTemplate(TEMPLATE_META['surat'], 'undangan');
    expect(missingRequiredFields(undangan, {})).toContain('Nama Acara');
    const permohonan = resolveTemplate(TEMPLATE_META['surat'], 'permohonan');
    expect(permohonan.fields.some((f) => f.key === 'acara')).toBe(false);
    // Basis surat tanpa subjenis: perilaku lama tetap (Nomor Dokumen wajib).
    expect(missingRequiredFields(TEMPLATE_META['surat'], {})).toContain('Nomor Dokumen');
  });

  it('blok prompt memuat panduan kejujuran template efektif', () => {
    const block = buildFieldBlock(resolveTemplate(TEMPLATE_META['berita-acara'], 'opname'), { periode: 'Oktober 2026' });
    expect(block).toContain('PANDUAN KEJUJURAN ISI');
    expect(block).toContain('KERANGKA STRUKTUR');
  });

  it('draf bebas punya pilihan jenis dokumen & gaya bahasa (select)', () => {
    const jenis = TEMPLATE_META['bebas'].fields.find((f) => f.key === 'jenisDokumen');
    expect(jenis?.type).toBe('select');
    expect(jenis?.options?.length).toBeGreaterThanOrEqual(5);
    expect(TEMPLATE_META['bebas'].fields.find((f) => f.key === 'gayaBahasa')?.type).toBe('select');
  });
});

describe('contoh dokumen per kategori (§11)', () => {
  it('opname: tabel 7 kolom persis & selisih konsisten dengan angka dummy', () => {
    const t = tablesOf(sampleOf('berita-acara', 'opname'))[0];
    expect(t.header).toEqual([
      'No', 'Uraian Pekerjaan', 'Satuan', 'Volume Kontrak/Acuan',
      'Volume Hasil Pengukuran', 'Selisih', 'Keterangan',
    ]);
    for (const row of t.rows) {
      expect(num(row[4]) - num(row[3])).toBeCloseTo(num(row[5]), 2);
    }
  });

  it('checklist QC: kolom Referensi + Status ada; semua Belum Diperiksa; kriteria tanpa angka teknis karangan', () => {
    const sample = sampleOf('checklist-qc');
    expect(sample).toContain('Acuan perlu dilengkapi');
    const t = tablesOf(sample)[0];
    expect(t.header?.some((h) => h.includes('Referensi'))).toBe(true);
    expect(t.header).toContain('Status');
    const statusIdx = t.header!.indexOf('Status');
    const hasilIdx = t.header!.findIndex((h) => h.includes('Hasil'));
    const kriteriaIdx = t.header!.findIndex((h) => h.includes('Kriteria'));
    expect(t.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of t.rows) {
      expect(row[statusIdx]).toBe('Belum Diperiksa');
      expect(row[hasilIdx]).toBe('—');
      expect(row[kriteriaIdx]).not.toMatch(/\d/);
      expect(row[kriteriaIdx]).not.toMatch(/MPa|mm|cm|kg\/|kN|%/);
    }
    expect(sample).not.toMatch(/\bLulus\b(?!.*Belum Diperiksa)/);
    expect(TEMPLATE_META['checklist-qc'].aiGuidance).toContain('memenuhi SNI');
  });

  it('laporan harian: tabel realisasi ada; sel volume aktual contoh kosong/"—"', () => {
    const realisasi = tablesOf(sampleOf('laporan-harian')).find((t) => t.header?.includes('Volume Hari Ini'));
    expect(realisasi).toBeTruthy();
    expect(realisasi!.header).toContain('Volume Kumulatif');
    for (const row of realisasi!.rows) {
      expect(row[4]).toBe('—');
      expect(row[5]).toBe('—');
    }
    expect(TEMPLATE_META['laporan-harian'].aiGuidance).toContain('mengarang');
  });

  it('notulen: tabel tindak lanjut dengan PIC & tenggat; panduan melarang usulan jadi keputusan', () => {
    const t = tablesOf(sampleOf('notulen')).find((x) => x.header?.includes('Penanggung Jawab'));
    expect(t).toBeTruthy();
    expect(t!.header).toContain('Tenggat');
    const g = TEMPLATE_META['notulen'].aiGuidance ?? '';
    expect(g).toContain('usulan');
    expect(g.toLowerCase()).toContain('keputusan');
    expect(g).toContain('DILARANG');
  });

  it('berita acara: panduan melarang klaim diterima sempurna / hak pembayaran', () => {
    const g = TEMPLATE_META['berita-acara'].aiGuidance ?? '';
    expect(g).toContain('diterima sempurna');
    expect(g).toContain('pembayaran');
    expect(g).toContain('DILARANG');
  });

  it('contoh valid tanpa data proyek & tanpa logo: blok kertas terbentuk; kop teks tetap jalan', () => {
    for (const id of ['berita-acara', 'surat', 'laporan-harian', 'notulen', 'checklist-qc', 'bebas']) {
      const blocks = htmlToPaperBlocks(sampleOf(id));
      expect(blocks.length, id).toBeGreaterThanOrEqual(5);
      // Surat resmi memang tanpa heading (format surat); kategori lain wajib punya heading struktur.
      if (id !== 'surat') expect(blocks.some((b) => b.type === 'heading'), id).toBe(true);
      else expect(blocks.some((b) => b.type === 'table'), id).toBe(true);
    }
    const kop = kopHtml(emptyProfile({ name: 'PT Tanpa Logo' }));
    expect(kop).toContain('PT Tanpa Logo');
    expect(kop).not.toContain('<img');
  });
});
