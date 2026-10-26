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
  it('"buka ahsp beton" → direct + ahspQuery beton', () => {
    const r = resolveNavCommand('buka ahsp beton');
    expect(r.mode).toBe('direct');
    if (r.mode === 'direct') {
      expect(r.entry.id).toBe('ahsp');
      expect(r.ahspQuery).toBe('beton');
    }
  });

  it('"buka ahsp" → direct tanpa query', () => {
    const r = resolveNavCommand('buka ahsp');
    expect(r.mode).toBe('direct');
    if (r.mode === 'direct') {
      expect(r.entry.id).toBe('ahsp');
      expect(r.ahspQuery).toBeUndefined();
    }
  });

  it('"buka katalog ahsp 2026 beton bertulang" → beton bertulang (tahun edisi dibuang)', () => {
    const r = resolveNavCommand('buka katalog ahsp 2026 beton bertulang');
    expect(r.mode).toBe('direct');
    if (r.mode === 'direct') {
      expect(r.ahspQuery).toBe('beton bertulang');
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
