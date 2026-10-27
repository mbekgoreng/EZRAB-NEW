/**
 * KLASTER F4 — DED Estimate AI honesty regressions.
 * Run: npx vitest run src/test/dedF4.test.ts
 *
 * Covers: provenance identitas aktual (3.1), plafon timeout terbuka (3.3),
 * seleksi halaman berprioritas Full AI (3.4), pembedaan malformed vs
 * dokumen kosong (3.5), halaman tanpa teks / OCR (3.6), dan integritas
 * label subtotalVerified + normalisasi warnings (3.7).
 */
import { describe, it, expect } from 'vitest';
import { verifySubtotal } from '../ai-tools/ded-full-ai/validator';
import {
  buildDocumentText,
  normalizeAiWarnings,
  resolveActualProviderModel,
  FULL_AI_TIMEOUT_MS,
} from '../ai-tools/ded-full-ai/service';
import {
  selectPagesWithTrace,
  formatPageRanges,
} from '../ai-tools/ded-ai-estimate/analysisTrace';
import {
  classifyPassOutcome,
  decideNoItemsError,
} from '../ai-tools/ded-ai-estimate/service';
import type { DedParsedPage } from '../ai-tools/ded-ai-estimate/parser';

const chars = (n: number, c = 'x') => c.repeat(n);

describe('F4 3.1 — provenance identitas aktual dari respons gateway', () => {
  it('memakai provider/model yang dibawa respons', () => {
    expect(
      resolveActualProviderModel({ provider: 'river', model: 'deepseek-ai/DeepSeek-V4.1-Flash' })
    ).toEqual({ provider: 'river', model: 'deepseek-ai/DeepSeek-V4.1-Flash' });
  });

  it('respons tanpa identitas → null (tidak ditebak)', () => {
    expect(resolveActualProviderModel({})).toEqual({ provider: null, model: null });
    expect(resolveActualProviderModel(null)).toEqual({ provider: null, model: null });
    expect(resolveActualProviderModel(undefined)).toEqual({ provider: null, model: null });
  });

  it('string kosong/whitespace bukan identitas', () => {
    expect(resolveActualProviderModel({ provider: '', model: '   ' })).toEqual({
      provider: null,
      model: null,
    });
  });
});

describe('F4 3.3 — timeout disamakan dengan plafon gateway & dinyatakan terbuka', () => {
  it('mode Mendalam (ADVANCED) meminta tepat plafon 180 detik, bukan 240', () => {
    expect(FULL_AI_TIMEOUT_MS.ADVANCED).toBe(180_000);
    expect(FULL_AI_TIMEOUT_MS.FAST).toBe(120_000);
  });
});

describe('F4 3.4 — buildDocumentText: seleksi halaman berprioritas', () => {
  it('halaman prioritas jenis didahulukan; yang terlewat tercatat, bukan hilang diam-diam', () => {
    const pages = [
      { page: 1, text: chars(4000, 's'), pageType: 'SPESIFIKASI' },
      ...Array.from({ length: 16 }, (_, i) => ({
        page: i + 2,
        text: chars(4000, 'd'),
        pageType: 'DENAH',
      })),
      { page: 18, text: '', pageType: 'DENAH' },
    ];
    const doc = buildDocumentText(pages);
    // 15 halaman DENAH × 4000 = 60.000 pas budget; DENAH ke-16 + SPESIFIKASI terlewat.
    expect(doc.includedPages).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(doc.skippedPages).toEqual([1, 17]);
    expect(doc.emptyTextPages).toEqual([18]);
    expect(doc.totalChars).toBe(60_000);
    expect(doc.truncated).toBe(true);
  });

  it('teks terkirim tetap menurut urutan halaman asli dokumen', () => {
    const doc = buildDocumentText([
      { page: 1, text: 'isi spesifikasi', pageType: 'SPESIFIKASI' },
      { page: 2, text: 'isi denah', pageType: 'DENAH' },
    ]);
    expect(doc.text.indexOf('Halaman 1')).toBeLessThan(doc.text.indexOf('Halaman 2'));
    expect(doc.skippedPages).toEqual([]);
  });

  it('halaman melebihi batas per-halaman tercatat sebagai truncatedPages', () => {
    const doc = buildDocumentText([
      { page: 1, text: chars(5000, 'a'), pageType: 'DENAH' },
      { page: 2, text: chars(100, 'b'), pageType: 'STRUKTUR' },
    ]);
    expect(doc.truncatedPages).toEqual([1]);
    expect(doc.totalChars).toBe(4100);
    expect(doc.includedPages).toEqual([1, 2]);
  });
});

describe('F4 3.5 — malformed dibedakan dari dokumen kosong', () => {
  it('workItems valid berisi → OK', () => {
    const o = classifyPassOutcome({ workItems: [{ name: 'Kolom' }] }, false);
    expect(o.status).toBe('OK');
    expect(o.items).toHaveLength(1);
  });

  it('workItems array kosong → EMPTY_RESPONSE (model memang tidak menemukan)', () => {
    expect(classifyPassOutcome({ workItems: [] }, false).status).toBe('EMPTY_RESPONSE');
  });

  it('JSON valid tanpa workItems → MALFORMED, bukan EMPTY', () => {
    const o = classifyPassOutcome({ summary: 'halo' }, false);
    expect(o.status).toBe('MALFORMED_RESPONSE');
    expect(o.errorCode).toBe('MALFORMED_RESPONSE');
  });

  it('workItems bukan array → MALFORMED', () => {
    expect(classifyPassOutcome({ workItems: 'bukan array' }, false).status).toBe(
      'MALFORMED_RESPONSE'
    );
  });

  it('JSON tidak ter-parse → MALFORMED_JSON', () => {
    const o = classifyPassOutcome(null, true);
    expect(o.status).toBe('MALFORMED_RESPONSE');
    expect(o.errorCode).toBe('MALFORMED_JSON');
  });

  it('keputusan akhir: semua pass kosong sah → NO_DATA', () => {
    const d = decideNoItemsError(['EMPTY_RESPONSE', 'EMPTY_RESPONSE'], null);
    expect(d.errorCode).toBe('NO_DATA');
    expect(d.message).toContain('tidak menemukan pekerjaan');
  });

  it('keputusan akhir: ada pass malformed → MALFORMED_RESPONSE, tidak menyalahkan dokumen', () => {
    const d = decideNoItemsError(['EMPTY_RESPONSE', 'MALFORMED_RESPONSE'], null);
    expect(d.errorCode).toBe('MALFORMED_RESPONSE');
    expect(d.message).toContain('format keluaran yang tidak sesuai');
    expect(d.message).toContain('bukan berarti DED tidak memuat pekerjaan');
    expect(d.retryable).toBe(true);
  });

  it('keputusan akhir: error gateway diteruskan apa adanya', () => {
    const gw = { errorCode: 'MODEL_TIMEOUT', stage: 'DED_AI_FAST:http', message: 'timeout', retryable: true };
    expect(decideNoItemsError(['FAILED'], gw)).toEqual(gw);
  });
});

describe('F4 3.6 — halaman tanpa lapisan teks (butuh OCR)', () => {
  const page = (n: number, text: string, pageType = 'DENAH'): DedParsedPage => ({
    page: n,
    title: `Page ${n}`,
    text,
    pageType,
  });

  it('halaman kosong tercatat NO_TEXT, tidak masuk seleksi, terhitung terpisah', () => {
    const sel = selectPagesWithTrace([page(1, ''), page(2, 'denah lantai 1'), page(3, '   ')]);
    expect(sel.noTextCount).toBe(2);
    expect(sel.selected.map((s) => s.page)).toEqual([2]);
    const t1 = sel.trace.find((t) => t.page === 1);
    expect(t1?.status).toBe('NO_TEXT');
    expect(t1?.reason).toContain('OCR');
    expect(sel.trace.find((t) => t.page === 2)?.status).toBe('SENT');
    expect(sel.skippedCount).toBe(0);
  });

  it('formatPageRanges merangkum rentang halaman untuk peringatan', () => {
    expect(formatPageRanges([3, 1, 2, 5, 7, 8, 9])).toBe('1–3, 5, 7–9');
    expect(formatPageRanges([4])).toBe('4');
    expect(formatPageRanges([1, 3])).toBe('1, 3');
    expect(formatPageRanges([])).toBe('');
  });
});

describe('F4 3.7 — integritas label & warnings', () => {
  it('subtotalVerified hanya true bila subtotal benar-benar terhitung', () => {
    expect(verifySubtotal(2, 150_000)).toEqual({ subtotal: 300_000, verified: true });
    expect(verifySubtotal(null, 150_000).verified).toBe(false);
    expect(verifySubtotal(2, null).verified).toBe(false);
    expect(verifySubtotal(0, 150_000).verified).toBe(false);
    expect(verifySubtotal(-1, 150_000).verified).toBe(false);
    expect(verifySubtotal(NaN, 150_000).verified).toBe(false);
    expect(verifySubtotal(null, null).subtotal).toBeNull();
  });

  it('warnings string dari model menjadi SATU peringatan, bukan per karakter', () => {
    const w = normalizeAiWarnings('Perhatian: data tidak lengkap');
    expect(w).toHaveLength(1);
    expect(w[0]).toBe('Perhatian: data tidak lengkap');
  });

  it('warnings array dipertahankan; objek bermessage memakai pesannya', () => {
    expect(normalizeAiWarnings(['a', 'b'])).toEqual(['a', 'b']);
    expect(normalizeAiWarnings([{ message: 'm1' }, 42, null, { foo: 1 }, ''])).toEqual(['m1', '42']);
    expect(normalizeAiWarnings(undefined)).toEqual([]);
    expect(normalizeAiWarnings('')).toEqual([]);
  });
});
