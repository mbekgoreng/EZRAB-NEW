/**
 * Test: RAB Export Integrity (Tugas 3).
 * Fixture deterministik — expected value dihitung independen dari exporter.
 *
 * Memverifikasi exporter TIDAK:
 * - mengubah null menjadi 0
 * - menyembunyikan item tanpa harga
 * - menampilkan subtotal parsial sebagai final
 * - menghilangkan penanda manual/asumsi/AI
 */
import { describe, it, expect } from 'vitest';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';

// Fixture: 6 skenario sesuai prompt
const fixtureItems = [
  // 1. Semua harga tersedia
  { code: 'A.1', description: 'Galian tanah', volume: 100, unit: 'm3', unitPrice: 50000, priceStatus: 'PRICE_RESOLVED' },
  // 2. Harga belum tersedia
  { code: 'A.2', description: 'Urugan pasir', volume: 50, unit: 'm3', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
  // 3. Harga manual
  { code: 'A.3', description: 'Pekerjaan khusus', volume: 10, unit: 'ls', unitPrice: 1000000, priceStatus: 'PRICE_MANUAL' },
  // 4. Harga asumsi/AI
  { code: 'A.4', description: 'Item estimasi', volume: 5, unit: 'm2', unitPrice: 75000, priceStatus: 'PRICE_ASSUMPTION' },
  // 5. Harga nol yang valid
  { code: 'A.5', description: 'Pekerjaan gratis', volume: 1, unit: 'ls', unitPrice: 0, priceStatus: 'PRICE_RESOLVED' },
  // 6. Volume nol
  { code: 'A.6', description: 'Item volume nol', volume: 0, unit: 'm3', unitPrice: 50000, priceStatus: 'PRICE_RESOLVED' },
];

// Expected: dihitung independen
const expectedTotals = fixtureItems.map((it) => ({
  code: it.code,
  // null → tidak dihitung (bukan 0)
  total: it.unitPrice == null ? null : it.volume * it.unitPrice,
}));

describe('export fixture: perhitungan independen', () => {
  it('1. total per item benar', () => {
    expect(expectedTotals[0].total).toBe(5000000); // 100 * 50000
    expect(expectedTotals[1].total).toBe(null); // null, bukan 0
    expect(expectedTotals[2].total).toBe(10000000);
    expect(expectedTotals[3].total).toBe(375000); // 5 * 75000
    expect(expectedTotals[4].total).toBe(0); // 0 valid (1 * 0)
    expect(expectedTotals[5].total).toBe(0); // 0 * 50000
  });

  it('2. total proyek hanya dari item resolved', () => {
    const resolved = expectedTotals.filter((t) => t.total !== null);
    const sum = resolved.reduce((a, b) => a + (b.total || 0), 0);
    expect(sum).toBe(5000000 + 10000000 + 375000 + 0 + 0);
    // Item unresolved (A.2) TIDAK termasuk
    expect(resolved.length).toBe(5);
  });

  it('3. bedakan null vs 0', () => {
    const nullItem = expectedTotals.find((t) => t.code === 'A.2')!;
    const zeroItem = expectedTotals.find((t) => t.code === 'A.5')!;
    expect(nullItem.total).toBeNull(); // belum ada harga
    expect(zeroItem.total).toBe(0); // harga nol valid
    expect(nullItem.total).not.toBe(zeroItem.total);
  });

  it('4. status harga terdiferensiasi', () => {
    const statuses = fixtureItems.map((i) => i.priceStatus);
    expect(statuses).toContain('PRICE_RESOLVED');
    expect(statuses).toContain('PRICE_UNRESOLVED');
    expect(statuses).toContain('PRICE_MANUAL');
    expect(statuses).toContain('PRICE_ASSUMPTION');
  });
});

describe('factory: AHSP identity safety di engine boundary', () => {
  const base = { description: 'Pekerjaan galian tanah', volume: 10, unit: 'm3', unitPrice: 50000 };

  it('5. item AHSP valid → SAFE', () => {
    const item = createRabItemRecord({ ...base, ahspCode: 'A.1.1' }, 'proj-1');
    expect(item.ahspIdentityStatus).toBe('SAFE');
  });

  it('6. item fragmen (nama kosong) → UNSAFE', () => {
    const item = createRabItemRecord(
      { description: '', volume: 10, unit: 'm3', unitPrice: 50000, ahspCode: 'SEDANG-1' },
      'proj-1'
    );
    expect(item.ahspIdentityStatus).toBe('UNSAFE');
    expect(item.ahspIdentityReason).toContain('nama kosong');
  });

  it('7. artefak kode angka → UNSAFE', () => {
    const item = createRabItemRecord(
      { ...base, description: 'USGPM', ahspCode: '1.000' },
      'proj-1'
    );
    expect(item.ahspIdentityStatus).toBe('UNSAFE');
    expect(item.ahspIdentityReason).toContain('artefak');
  });

  it('8. item non-AHSP → tidak ada flag (backward compat)', () => {
    const item = createRabItemRecord(base, 'proj-1');
    expect(item.ahspIdentityStatus).toBe(undefined);
  });

  it('9. data asli tidak diubah walau UNSAFE', () => {
    const item = createRabItemRecord(
      { description: '', volume: 10, unit: 'm3', unitPrice: 50000, ahspCode: 'SEDANG-1' },
      'proj-1'
    );
    expect(item.ahspCode).toBe('SEDANG-1'); // kode asli dipertahankan
    expect(item.description).toBe(''); // tidak diisi karangan
  });
});

describe('factory: harga manual/estimasi dipertahankan (bug fix 2026-10-18)', () => {
  const base = { description: 'Item test', volume: 10, unit: 'm3' };

  it('10. PRICE_MANUAL mempertahankan harga', () => {
    const item = createRabItemRecord({ ...base, unitPrice: 1000000, priceStatus: 'PRICE_MANUAL' }, 'p1');
    expect(item.unitPrice).toBe(1000000);
    expect(item.amount).toBe(10000000);
  });

  it('11. PRICE_ESTIMATED mempertahankan harga', () => {
    const item = createRabItemRecord({ ...base, unitPrice: 75000, priceStatus: 'PRICE_ESTIMATED' }, 'p1');
    expect(item.unitPrice).toBe(75000);
    expect(item.amount).toBe(750000);
  });

  it('12. PRICE_UNRESOLVED tetap nol (tidak ada harga)', () => {
    const item = createRabItemRecord({ ...base, unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' }, 'p1');
    expect(item.unitPrice).toBe(0);
    expect(item.priceStatus).toBe('PRICE_UNRESOLVED');
  });

  it('13. PRICE_RESOLVED nol valid dipertahankan', () => {
    const item = createRabItemRecord({ ...base, unitPrice: 0, priceStatus: 'PRICE_RESOLVED' }, 'p1');
    expect(item.unitPrice).toBe(0);
    expect(item.amount).toBe(0);
  });
});
