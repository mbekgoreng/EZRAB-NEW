/**
 * Regresi F-02 audit AHSP 2026-10-26: harga chat harus sama dengan
 * resolver/explorer (bukan harga baked), dengan kualifikasi status.
 *
 * Dulu: tools.ts dan actionRegistry.ts memanggil
 * resolveAhspUnitPrice(kode, satuan) — salah bentuk (resolver hanya menerima
 * satu objek item) — sehingga fallback diam-diam null dan chat menampilkan
 * harga baked tanpa kualifikasi. Contoh: 1.4.2.1 baked Rp 30.726 vs resolver
 * Rp 63.852; A.1.02.4b.1.a.1 baked Rp 12.320 vs resolver Rp 131.267.
 *
 * Run: npx vitest run src/test/ahspChatPrice.test.ts
 */
import { describe, it, expect } from 'vitest';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { getAhspDirectPrice } from '../data/priceDatabase2026/ahspDisplayPolicy';
import { ahspChatPriceSuffix } from '../ai-tools/ezrab-ai/ahspChatPrice';
import { EZRAB_AI_TOOLS } from '../ai-tools/ezrab-ai/tools';

/** Harga tampil kartu explorer: direct ?? baked (rumus yang sama). */
function cardPrice(item: any): number | null {
  const comp = priceResolver2026.resolveAhspUnitPrice(item);
  const direct = getAhspDirectPrice(comp);
  const baked =
    typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : null;
  return direct ?? baked;
}

describe('ahspChatPrice (regresi F-02)', () => {
  it('1.4.2.1 (FULL): chat menampilkan harga resolver, bukan baked', () => {
    const item: any = officialAhspRepository.getOfficialAhsp('1.4.2.1');
    expect(item).toBeDefined();
    const suffix = ahspChatPriceSuffix(item);
    expect(suffix).toContain('Rp 63.852');
    expect(suffix).toContain('Harga lengkap');
    expect(suffix).not.toContain('30.726');
    expect(cardPrice(item)).toBe(63852);
  });

  it('A.1.02.4b.1.a.1 (PARTIAL): chat menampilkan jumlah parsial + kualifikasi', () => {
    const item: any = officialAhspRepository.getOfficialAhsp('A.1.02.4b.1.a.1');
    expect(item).toBeDefined();
    const suffix = ahspChatPriceSuffix(item);
    expect(suffix).toContain('Rp 131.267');
    expect(suffix).toContain('Harga parsial');
    expect(suffix).toContain('4/7');
    expect(suffix).not.toContain('12.320');
    expect(cardPrice(item)).toBe(131267);
  });

  it('A.1.02.4a.1.b (MISSING): chat menampilkan belum tersedia, bukan Rp0', () => {
    const item: any = officialAhspRepository.getOfficialAhsp('A.1.02.4a.1.b');
    expect(item).toBeDefined();
    expect(ahspChatPriceSuffix(item)).toBe(
      ' — harga belum tersedia (lihat analisa komponen)'
    );
    expect(cardPrice(item)).toBeNull();
  });

  it('item null/undefined → belum tersedia, bukan crash', () => {
    expect(ahspChatPriceSuffix(null)).toBe(
      ' — harga belum tersedia (lihat analisa komponen)'
    );
    expect(ahspChatPriceSuffix(undefined)).toBe(
      ' — harga belum tersedia (lihat analisa komponen)'
    );
  });

  it('tool cari_ahsp mengutip harga resolver untuk 1.4.2.1', () => {
    const tool = EZRAB_AI_TOOLS.find((t) => t.name === 'cari_ahsp');
    expect(tool).toBeDefined();
    const out = tool!.invoke({ kata_kunci: '1.4.2.1' });
    const line = out.split('\n').find((l) => l.includes('[1.4.2.1]'));
    expect(line).toBeDefined();
    expect(line).toContain('Rp 63.852');
    expect(line).toContain('Harga lengkap');
  });
});
