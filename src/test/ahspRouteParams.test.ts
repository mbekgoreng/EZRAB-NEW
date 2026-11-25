import { describe, it, expect } from 'vitest';
import { parseWorkspaceRoute, paths } from '../routing/routes';
import { resolveNavCommand } from '../ai-tools/ezrab-ai/navRegistry';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

/**
 * Regresi temuan audit AHSP 2026-10-26: F-05 (parameter URL /app/ahsp),
 * F-06 (kata kunci navigasi chat → ?q=), F-08 (standardCode Bina Marga).
 */

describe('F-05: parameter URL /app/ahsp', () => {
  it('parse ?q=&domain=&kategori=&page=', () => {
    const r = parseWorkspaceRoute('/app/ahsp', '?q=beton&domain=BINA_MARGA&kategori=BINA_MARGA&page=3');
    expect(r.status).toBe('ok');
    expect(r.menu).toBe('ahsp-2026');
    expect(r.ahsp).toEqual({ q: 'beton', domain: 'BINA_MARGA', kategori: 'BINA_MARGA', page: 3 });
  });

  it('tanpa parameter → tanpa field ahsp (hasil parse tak berubah, kompatibilitas round-trip)', () => {
    const r = parseWorkspaceRoute('/app/ahsp', '');
    expect(r.menu).toBe('ahsp-2026');
    expect(r.ahsp).toBeUndefined();
  });

  it('domain tak valid dan page tak valid dibuang, parameter sah dipertahankan', () => {
    const r = parseWorkspaceRoute('/app/ahsp', '?domain=BOGUS&page=abc&q=beton');
    expect(r.ahsp).toEqual({ q: 'beton' });
  });

  it('paths.ahsp(params) round-trip lewat parse', () => {
    const url = paths.ahsp({ q: 'beton', domain: 'BINA_MARGA', page: 3 });
    expect(url).toBe('/app/ahsp?q=beton&domain=BINA_MARGA&page=3');
    const r = parseWorkspaceRoute(url, '');
    expect(r.ahsp).toEqual({ q: 'beton', domain: 'BINA_MARGA', page: 3 });
  });

  it('paths.ahsp() tanpa parameter tetap /app/ahsp', () => {
    expect(paths.ahsp()).toBe('/app/ahsp');
  });
});

describe('F-06: kata kunci navigasi AHSP', () => {
  // §4.1 (directive P1 2026-11-24 / OD-1): navigasi bahasa alami DIHAPUS —
  // "buka ahsp ..." kini 'none' (sampai ke AI), bukan direct + q. Jalur q
  // dari bahasa alami ikut terhapus bersama cabang eksplisitnya; aturan
  // scrubbing W-A-03 hidup di extractAhspResidual() dan dipin suite
  // p1NavSlashOnly. Yang dipertahankan: slash /ahsp (tanpa q) dan slash
  // tengah-pesan "tolong buka /ahsp" (direct, tanpa q sampah).
  it('"buka ahsp beton" → none (bahasa alami tidak menavigasi) (§4.1)', () => {
    expect(resolveNavCommand('buka ahsp beton').mode).toBe('none');
  });

  it('"buka ahsp" → none (§4.1)', () => {
    expect(resolveNavCommand('buka ahsp').mode).toBe('none');
  });

  it('"buka katalog ahsp 2026 beton bertulang" → none (§4.1)', () => {
    expect(resolveNavCommand('buka katalog ahsp 2026 beton bertulang').mode).toBe('none');
  });

  it('"tolong buka /ahsp" → direct tanpa query (W-A-03: tanpa q "tolong /")', () => {
    const r = resolveNavCommand('tolong buka /ahsp');
    expect(r.mode).toBe('direct');
    if (r.mode === 'direct') {
      expect(r.entry.id).toBe('ahsp');
      expect(r.ahspQuery).toBeUndefined();
    }
  });

  it('slash /ahsp → direct tanpa query', () => {
    const r = resolveNavCommand('/ahsp');
    expect(r.mode).toBe('direct');
    if (r.mode === 'direct') {
      expect(r.entry.id).toBe('ahsp');
      expect(r.ahspQuery).toBeUndefined();
    }
  });
});

describe('F-08: standardCode Bina Marga', () => {
  it('item B.1 membawa standardCode 2.1.(1) dari master', () => {
    const items = officialAhspRepository.getActiveOfficialAhsp();
    const item = items.find((i) => i.code === 'B.1');
    expect(item).toBeDefined();
    expect(item?.standardCode).toBe('2.1.(1)');
  });

  it('pencarian kode resmi 2.1.(1) menemukan itemnya (logika filter explorer)', () => {
    const items = officialAhspRepository.getActiveOfficialAhsp();
    const q = '2.1.(1)';
    const hits = items.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.codeNormalized.toLowerCase().includes(q) ||
        (i.standardCode || '').toLowerCase().includes(q),
    );
    expect(hits.some((i) => i.code === 'B.1')).toBe(true);
  });
});
