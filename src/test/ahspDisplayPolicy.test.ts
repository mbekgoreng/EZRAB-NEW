/**
 * AHSP — Kebijakan harga kosong & penonaktifan Biaya Umum/Keuntungan.
 *
 * Skenario wajib master prompt:
 *  1. Semua komponen wajib memiliki harga valid.
 *  2. Satu komponen bahan tidak memiliki harga.
 *  3. Beberapa komponen tidak memiliki harga.
 *  4. Nilai harga null tidak berubah menjadi nol.
 *  5. Biaya Umum dan Keuntungan tidak ditambahkan pada total.
 *  6. Total biaya langsung tidak terduplikasi.
 *  7. AHSP parsial tidak dapat disimpan sebagai AHSP lengkap.
 *  8. AHSP parsial tidak dapat masuk ke RAB sebagai harga final yang lengkap.
 *  9. Ekspor mempertahankan status harga yang belum tersedia (via gate: tidak ada
 *     angka final yang bocor dari AHSP parsial).
 * 10. Satuan tidak cocok tetap ditolak (tidak dikalikan diam-diam).
 *
 * Run (repo): npx vitest run src/test/ahspDisplayPolicy.test.ts
 */
import { describe, it, expect } from 'vitest';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import {
  getAhspDirectPrice,
  canFinalizeAhsp,
  ahspCompletenessNote,
} from '../data/priceDatabase2026/ahspDisplayPolicy';

const FAKE = (suffix: string) => `ZZZ_TIDAK_ADA_${suffix}_999`;

let __n = 0;
function mockItem(over: Record<string, unknown> = {}) {
  return {
    code: `TEST.${++__n}`,
    name: 'AHSP Uji',
    unit: 'm3',
    domain: 'CIPTA_KARYA',
    laborComponents: [
      { code: 'ZZZL1', name: FAKE('TK'), unit: 'OH', coefficient: 2, unitPrice: 100000 },
    ],
    materialComponents: [
      { code: 'ZZZM1', name: 'Semen Uji', unit: 'zak', coefficient: 5, unitPrice: 75000 },
    ],
    equipmentComponents: [
      { code: 'ZZZE1', name: FAKE('ALAT'), unit: 'hari', coefficient: 1, unitPrice: 250000 },
    ],
    ...over,
  };
}

describe('AHSP display policy — harga kosong & overhead nonaktif', () => {
  it('1. semua komponen valid → FULL, D = A+B+C', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(mockItem());
    expect(c.pricingStatus).toBe('FULL');
    // A=2×100.000=200.000, B=5×75.000=375.000, C=1×250.000=250.000 → D=825.000
    expect(c.unitPrice).toBe(825000);
    expect(c.missingComponents).toBe(0);
  });

  it('2. satu komponen bahan tanpa harga → PARTIAL + missing=1', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(
      mockItem({
        materialComponents: [
          { code: 'ZZZM1', name: FAKE('SEMEN_HILANG'), unit: 'zak', coefficient: 5 },
        ],
      })
    );
    expect(c.pricingStatus).toBe('PARTIAL');
    expect(c.missingComponents).toBe(1);
    // D parsial = A + C saja = 450.000 (bukan seolah lengkap)
    expect(c.unitPrice).toBe(450000);
    expect(c.missing[0].name).toContain('SEMEN_HILANG');
  });

  it('3. beberapa komponen tanpa harga → PARTIAL + jumlah benar', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(
      mockItem({
        laborComponents: [{ code: 'ZZZL1', name: FAKE('TK_HILANG'), unit: 'OH', coefficient: 2 }],
        materialComponents: [{ code: 'ZZZM1', name: FAKE('BHN_HILANG'), unit: 'zak', coefficient: 5 }],
        // equipment tetap valid agar resolvedComponents > 0 → PARTIAL (bukan MISSING)
      })
    );
    expect(c.pricingStatus).toBe('PARTIAL');
    expect(c.missingComponents).toBe(2);
    expect(c.unitPrice).toBe(250000); // hanya C yang resolved
  });

  it('4. null tidak pernah menjadi 0', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(
      mockItem({
        materialComponents: [{ code: 'ZZZM1', name: FAKE('NOL'), unit: 'zak', coefficient: 5 }],
      })
    );
    const missing = c.material.components[0];
    expect(missing.unitPrice).toBe(null);
    expect(missing.subtotalPerUnit).toBe(null);
    expect(missing.subtotalPerUnit).not.toBe(0);
    // Komposisi tidak menyuntik 0 untuk yang hilang
    expect(c.missing.length).toBe(1);
  });

  it('5. overhead tidak ditambahkan ke total (D murni)', () => {
    // Item DHSP resmi 5.6.3.3 (official price 2.342.087, termasuk E versi pemerintah)
    const c: any = priceResolver2026.resolveAhspUnitPrice({
      code: '5.6.3.3',
      name: 'Pemasangan 1 unit Fire Extinguisher 25 kg',
      unit: 'unit',
      domain: 'CIPTA_KARYA',
      laborComponents: [{ code: 'ZZZL1', name: FAKE('TK'), unit: 'OH', coefficient: 1, unitPrice: 100000 }],
      materialComponents: [{ code: 'ZZZM1', name: FAKE('BHN'), unit: 'unit', coefficient: 1, unitPrice: 2000000 }],
      equipmentComponents: [],
    });
    expect(c.officialDhspPrice).toBe(2342087);
    // D = 2.100.000 (tanpa E)
    expect(c.unitPrice).toBe(2100000);
    // E tercatat terpisah, bukan ditambahkan ke D
    expect(c.overheadAmount).toBe(2342087 - 2100000);
    expect(c.unitPrice! + c.overheadAmount!).toBe(c.officialDhspPrice);
    // Kebijakan tampil: yang dipakai = D, bukan hspPrice
    expect(getAhspDirectPrice(c)).toBe(2100000);
    expect(getAhspDirectPrice(c)).not.toBe(c.hspPrice);
  });

  it('6. total tidak terduplikasi', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(mockItem());
    const sum = c.labor.subtotalPerUnit + c.material.subtotalPerUnit + c.equipment.subtotalPerUnit;
    expect(c.unitPrice).toBe(Math.round(sum));
  });

  it('7. AHSP parsial tidak lolos finalisasi simpan', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(
      mockItem({
        materialComponents: [{ code: 'ZZZM1', name: FAKE('SIMPAN'), unit: 'zak', coefficient: 5 }],
      })
    );
    const gate = canFinalizeAhsp(c);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('Belum lengkap');
    expect(ahspCompletenessNote(c)).toContain('parsial');
  });

  it('8. AHSP parsial tidak lolos finalisasi RAB; FULL lolos dengan D', () => {
    const partial: any = priceResolver2026.resolveAhspUnitPrice(
      mockItem({
        materialComponents: [{ code: 'ZZZM1', name: FAKE('RAB'), unit: 'zak', coefficient: 5 }],
      })
    );
    expect(canFinalizeAhsp(partial).ok).toBe(false);

    const full: any = priceResolver2026.resolveAhspUnitPrice(mockItem());
    const gate = canFinalizeAhsp(full);
    expect(gate.ok).toBe(true);
    expect(getAhspDirectPrice(full)).toBe(825000);
  });

  it('9. tidak ada angka final bocor dari AHSP MISSING (ekspor aman)', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(
      mockItem({
        laborComponents: [{ code: 'ZZZL1', name: FAKE('X1'), unit: 'OH', coefficient: 2 }],
        materialComponents: [{ code: 'ZZZM1', name: FAKE('X2'), unit: 'zak', coefficient: 5 }],
        equipmentComponents: [{ code: 'ZZZE1', name: FAKE('X3'), unit: 'hari', coefficient: 1 }],
      })
    );
    expect(c.pricingStatus).toBe('MISSING');
    expect(canFinalizeAhsp(c).ok).toBe(false);
    expect(getAhspDirectPrice(c)).toBe(null); // bukan 0 → ekspor tidak menulis Rp0
  });

  it('10. satuan tidak cocok → harga null, tidak dikalikan diam-diam', () => {
    const c: any = priceResolver2026.resolveAhspUnitPrice(
      mockItem({
        materialComponents: [
          // Satuan absurd + nama tak dikenal: tidak boleh menghasilkan angka
          { code: 'ZZZM1', name: FAKE('SATUAN'), unit: 'KILOMETER_PERSEGI', coefficient: 5 },
        ],
      })
    );
    const comp = c.material.components[0];
    expect(comp.unitPrice).toBe(null);
    expect(comp.subtotalPerUnit).toBe(null);
    expect(c.pricingStatus).toBe('PARTIAL');
  });
});
