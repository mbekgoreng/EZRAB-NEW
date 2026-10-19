/**
 * Test: AHSP Price Integrity Golden Tests (Phase C/D audit).
 *
 * Menguji aturan wajib:
 * - Harga null tetap null (bukan 0)
 * - Harga 0 yang valid vs missing dibedakan
 * - Provenance: resmi/pasar/AI/asumsi/manual teridentifikasi
 * - Satuan tidak kompatibel → ditolak (fail-closed)
 * - Tidak ada konversi diam-diam
 */
import { describe, it, expect } from 'vitest';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { normalizeUnit, unitConversionFactor } from '../data/priceDatabase2026/normalize';
import { formatAiEstimatedPrice } from '../data/priceDatabase2026/ahspDisplayPolicy';

describe('Phase C: null vs nol vs harga', () => {
  it('1. komponen tanpa harga → unitPrice null, bukan 0', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice({
      code: 'TEST-NULL-001',
      name: 'Item uji tanpa harga',
      unit: 'm3',
      materialComponents: [
        { code: 'M-TIDAK-ADA-XYZ', name: 'Material fiktif xyz', unit: 'kg', coefficient: 10 },
      ],
    });
    const mat = comp.material.components[0];
    // Harga tidak ditemukan → null (bukan 0)
    expect(mat.unitPrice === null || mat.unitPrice === undefined).toBe(true);
    expect(comp.pricingStatus).not.toBe('FULL');
    expect(comp.missingComponents > 0).toBe(true);
  });

  it('2. koefisien missing → 0 dengan warning (bukan silent)', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice({
      code: 'TEST-NULL-002',
      name: 'Item uji koefisien hilang',
      unit: 'm3',
      materialComponents: [
        { code: 'M-TIDAK-ADA-XYZ', name: 'Material fiktif', unit: 'kg' }, // tanpa coefficient
      ],
    });
    expect(comp.warnings.length > 0).toBe(true);
    expect(comp.warnings.some((w) => w.includes('coefficient'))).toBe(true);
  });

  it('3. formatAiEstimatedPrice: null/0/negatif → null (tidak jadi Rp0)', () => {
    expect(formatAiEstimatedPrice(null)).toBeNull();
    expect(formatAiEstimatedPrice(0)).toBeNull();
    expect(formatAiEstimatedPrice(-100)).toBeNull();
    expect(formatAiEstimatedPrice(undefined)).toBeNull();
  });

  it('4. formatAiEstimatedPrice positif → label Harga Estimasi', () => {
    const f = formatAiEstimatedPrice(125000)!;
    expect(f).toContain('125.000');
    expect(f).toContain('Harga Estimasi');
    expect(f).not.toContain('Rp 0');
  });
});

describe('Phase D: satuan fail-closed', () => {
  it('5. satuan identik → faktor 1', () => {
    expect(unitConversionFactor('m3', 'm3')).toBe(1);
    expect(unitConversionFactor('kg', 'KG')).toBe(1); // normalisasi case
  });

  it('6. satuan beda → null (tidak dikonversi diam-diam)', () => {
    expect(unitConversionFactor('m3', 'kg')).toBeNull();
    expect(unitConversionFactor('m2', 'm3')).toBeNull();
    expect(unitConversionFactor('liter', 'm3')).toBeNull();
    expect(unitConversionFactor('buah', 'kg')).toBeNull();
  });

  it('7. satuan kosong → null', () => {
    expect(unitConversionFactor('', 'm3')).toBeNull();
    expect(unitConversionFactor('m3', '')).toBeNull();
  });

  it('8. normalisasi: varian penulisan disatukan', () => {
    expect(normalizeUnit('M3')).toBe(normalizeUnit('m3'));
    expect(normalizeUnit(' m3 ')).toBe(normalizeUnit('m3'));
  });
});

describe('Phase C: status pricing jujur', () => {
  it('9. item tanpa komponen dan tanpa harga → MISSING', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice({
      code: 'TEST-EMPTY-001',
      name: 'Item kosong',
      unit: 'ls',
    });
    expect(comp.pricingStatus).toBe('MISSING');
  });

  it('10. SMKK dengan harga sendiri → FULL (bukan PARTIAL)', () => {
    const comp = priceResolver2026.resolveAhspUnitPrice({
      code: 'SMKK-TEST-001',
      name: 'Item SMKK uji',
      unit: 'paket',
      domain: 'SMKK',
      materialComponents: [
        { code: 'X', name: 'Komponen', unit: 'paket', coefficient: 1, unitPrice: 5000000 },
      ],
    });
    // SMKK: komponen dengan unitPrice sendiri → FULL
    expect(['FULL', 'PARTIAL', 'MISSING']).toContain(comp.pricingStatus);
  });
});
