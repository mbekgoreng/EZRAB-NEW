/**
 * PRICE SOURCE INTEGRITY & CONVERSION TRANSPARENCY — 2026-10-15
 *
 * Membuktikan dua gap P2 tertutup:
 * A. Override harga manual tidak lagi memakai label sumber resmi yang
 *    menyesatkan (PRICE_MANUAL + label jujur + riwayat provenance).
 *    Edit non-harga tidak mengubah identitas sumber.
 *    Re-resolve resmi tidak disalahartikan sebagai override manual.
 * B. Provenance konversi terlihat di Excel dan PDF; item resmi tanpa
 *    konversi tidak mendapat penanda palsu; PARTIAL tidak diekspor
 *    seolah FULL; tampilan tidak mengubah hasil hitung.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildRabCellUpdates } from '../components/rab/rabCellEdit';
import { buildExcelSourceText } from '../export/excelExportEngine';
import { buildPdfSourceAnnotations } from '../export/pdfExporter';
import { extractConversionTrail } from '../export/conversionTrail';
import { toRabPriceStatus, resolveOfficialPriceForMappedItem } from '../engine/constructionCalculators/ahsp2026PriceIntegration';
import { recalculateCostSummary } from '../engine/unifiedProjectEngine';
import { saveVersioned, loadVersioned } from '../engine/storage/hardenedStorage';
import type { RabItem } from '../types';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
});

function officialItem(): any {
  return {
    description: 'Pengeboran pipa HDPE',
    volume: 5,
    unit: "m'",
    unitPrice: 2626675,
    priceStatus: 'PRICE_RESOLVED',
    priceSourceKind: 'OFFICIAL_AHSP',
    priceSourceLabel: 'AHSP 2026 Resmi',
    priceSourceExplanation:
      'price:9.3.5.1 → OFFICIAL_AHSP_2026 Rp2.626.675 (domain:CIPTA_KARYA) | UNIT_CONVERTED: Air: harga Air Rp200/liter → Rp200.000/m3 (faktor ×1000, Definisi eksak 1 m3 = 1000 liter)',
    volumeSource: 'CALCULATOR',
    ahspCode: '9.3.5.1',
  };
}

describe('A. Override harga manual', () => {
  it('edit harga manual → PRICE_MANUAL, label jujur, riwayat dipertahankan', () => {
    const u: any = buildRabCellUpdates(officialItem(), 'unitPrice', '3000000');
    expect(u.unitPrice).toBe(3000000);
    expect(u.priceStatus).toBe('PRICE_MANUAL');
    expect(u.priceSourceLabel).toBe('Harga input manual');
    expect(u.priceSourceLabel).not.toContain('AHSP 2026 Resmi');
    // Riwayat: provenance lama dipertahankan + catatan override
    expect(u.priceSourceExplanation).toContain('UNIT_CONVERTED');
    expect(u.priceSourceExplanation).toContain('Diubah manual oleh pengguna');
    expect(u.priceSourceExplanation).toContain('Rp2.626.675');
    expect(u.amount).toBe(5 * 3000000);
  });

  it('edit deskripsi/kuantitas saja → identitas sumber tidak berubah', () => {
    const base = officialItem();
    const uDesc: any = buildRabCellUpdates(base, 'description', 'Pengeboran pipa HDPE revisi');
    expect(uDesc.priceStatus).toBeUndefined();
    expect(uDesc.priceSourceKind).toBeUndefined();
    expect(uDesc.priceSourceLabel).toBeUndefined();
    expect(uDesc.priceSourceExplanation).toBeUndefined();
    expect(uDesc.description).toBe('Pengeboran pipa HDPE revisi');

    const uVol: any = buildRabCellUpdates(base, 'volume', '8');
    expect(uVol.priceStatus).toBeUndefined();
    expect(uVol.priceSourceLabel).toBeUndefined();
    expect(uVol.volume).toBe(8);
    expect(uVol.amount).toBe(8 * 2626675); // hitung ulang, sumber tetap
  });

  it('retype harga dengan nilai sama → identitas sumber tidak berubah', () => {
    const u: any = buildRabCellUpdates(officialItem(), 'unitPrice', '2626675');
    expect(u.priceStatus).toBeUndefined();
    expect(u.priceSourceLabel).toBeUndefined();
  });

  it('harga dikosongkan → PRICE_UNRESOLVED, bukan Rp0', () => {
    const u: any = buildRabCellUpdates(officialItem(), 'unitPrice', '');
    expect(u.unitPrice).toBeNull();
    expect(u.priceStatus).toBe('PRICE_UNRESOLVED');
    expect(u.amount).toBeNull();
    expect(u.totalPrice).toBeNull();
  });

  it('re-resolve resmi tidak pernah menghasilkan PRICE_MANUAL', () => {
    expect(toRabPriceStatus('PRICE_RESOLVED', true)).toBe('PRICE_RESOLVED');
    expect(toRabPriceStatus('PRICE_INCOMPLETE', false)).toBe('PRICE_UNRESOLVED');
    expect(toRabPriceStatus(undefined, true)).toBe('PRICE_RESOLVED');
    // Jalur resolver selalu menulis identitas resmi segar
    const r: any = resolveOfficialPriceForMappedItem('9.3.5.1', 'CIPTA_KARYA');
    expect(r.status).toBe('PRICE_RESOLVED');
    expect(r.priceSource).toBe('OFFICIAL_AHSP_2026');
  });
});

describe('B. Transparansi konversi di ekspor', () => {
  const convertedExpl =
    'price:9.3.5.1 → OFFICIAL_AHSP_2026 (domain:CIPTA_KARYA) | UNIT_CONVERTED: Air: harga Air Rp200/liter → Rp200.000/m3 (faktor ×1000, Definisi eksak 1 m3 = 1000 liter)';

  it('extractConversionTrail: hanya segmen konversi', () => {
    const t = extractConversionTrail(convertedExpl);
    expect(t).toContain('UNIT_CONVERTED');
    expect(t).toContain('Rp200/liter');
    expect(t).toContain('Rp200.000/m3');
    expect(t).toContain('×1000');
    expect(extractConversionTrail('price:1.1.4.2 → OFFICIAL_AHSP_2026 Rp155.785')).toBeNull();
    expect(extractConversionTrail(undefined)).toBeNull();
  });

  it('Excel: OFFICIAL_AHSP + konversi → penanda KONVERSI SATUAN', () => {
    const text = buildExcelSourceText({
      priceStatus: 'PRICE_RESOLVED',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceExplanation: convertedExpl,
      ahspCode: '9.3.5.1',
    });
    expect(text).toContain('KONVERSI SATUAN');
    expect(text).toContain('Rp200/liter');
    expect(text).toContain('Rp200.000/m3');
    expect(text).toContain('×1000');
  });

  it('Excel: OFFICIAL_AHSP tanpa konversi → tanpa penanda palsu', () => {
    const text = buildExcelSourceText({
      priceStatus: 'PRICE_RESOLVED',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceExplanation: 'price:1.1.4.2 → OFFICIAL_AHSP_2026 Rp155.785 (domain:CIPTA_KARYA)',
      volumeSource: 'CALCULATOR',
      ahspCode: '1.1.4.2',
    });
    expect(text).not.toContain('KONVERSI');
    expect(text).toBe('CALCULATOR');
  });

  it('Excel: PRICE_MANUAL → INPUT MANUAL, bukan RESMI AHSP', () => {
    const text = buildExcelSourceText({
      priceStatus: 'PRICE_MANUAL',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: 'Harga input manual',
      priceSourceExplanation: 'price:9.3.5.1 → OFFICIAL_AHSP_2026 | Diubah manual oleh pengguna (sebelumnya Rp2.626.675)',
      ahspCode: '9.3.5.1',
    });
    expect(text).toContain('INPUT MANUAL');
    expect(text).not.toContain('RESMI AHSP');
  });

  it('Excel: PRICE_UNRESOLVED (PARTIAL) → HARGA BELUM TERSEDIA', () => {
    const text = buildExcelSourceText({
      priceStatus: 'PRICE_UNRESOLVED',
      priceSourceKind: 'UNRESOLVED',
      priceSourceLabel: 'Satuan komponen tidak kompatibel',
      ahspCode: '2.2.1.4.6',
    });
    expect(text).toContain('HARGA BELUM TERSEDIA');
  });

  it('PDF: anotasi manual + konversi + unresolved', () => {
    const manual = buildPdfSourceAnnotations({ priceStatus: 'PRICE_MANUAL' });
    expect(manual).toContain('[INPUT MANUAL — bukan harga resmi AHSP]');

    const conv = buildPdfSourceAnnotations({
      priceStatus: 'PRICE_RESOLVED',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceExplanation: convertedExpl,
    });
    expect(conv).toContain('[KONVERSI SATUAN:');
    expect(conv).toContain('×1000');

    const plain = buildPdfSourceAnnotations({
      priceStatus: 'PRICE_RESOLVED',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceExplanation: 'price:1.1.4.2 → OFFICIAL_AHSP_2026 Rp155.785',
    });
    expect(plain).not.toContain('KONVERSI');
    expect(plain).not.toContain('INPUT MANUAL');

    const unres = buildPdfSourceAnnotations({ priceStatus: 'PRICE_UNRESOLVED' });
    expect(unres).toContain('Harga belum tersedia — bukan Rp0');
  });

  it('tampilan tidak mengubah hasil hitung', () => {
    const mk = (expl?: string) => ({
      id: 'R1', projectId: 'p', no: 1, code: '9.3.5.1', category: 'C',
      description: 'Bor', volume: 5, unit: "m'", unitPrice: 2626675,
      amount: 5 * 2626675, totalPrice: 5 * 2626675,
      priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceExplanation: expl,
    } as RabItem);
    const a: any = recalculateCostSummary([mk()], {});
    const b: any = recalculateCostSummary([mk('UNIT_CONVERTED: Air: harga Air Rp200/liter → Rp200.000/m3 (faktor ×1000)')], {});
    expect(b.directCost).toBe(a.directCost);
    expect(b.grandTotal).toBe(a.grandTotal);
  });
});

describe('A+B. Save/reload mempertahankan sumber aktif + provenance', () => {
  beforeEach(() => { localStorage.clear(); });

  it('PRICE_MANUAL + riwayat konversi bertahan setelah save/load', () => {
    const item = {
      ...officialItem(),
      id: 'RAB-1', projectId: 'proj-1', no: 1, code: '9.3.5.1', category: 'Struktur',
      amount: 5 * 3000000, totalPrice: 5 * 3000000,
    } as RabItem;
    const edited: any = { ...item, ...buildRabCellUpdates(item as any, 'unitPrice', '3000000') };
    expect(saveVersioned('k', [edited]).ok).toBe(true);
    const reloaded = (loadVersioned<RabItem[]>('k') as any).data[0] as RabItem;
    expect(reloaded.priceStatus).toBe('PRICE_MANUAL');
    expect(reloaded.priceSourceLabel).toBe('Harga input manual');
    expect(reloaded.priceSourceExplanation).toContain('UNIT_CONVERTED');
    expect(reloaded.priceSourceExplanation).toContain('Diubah manual oleh pengguna');
    expect(reloaded.unitPrice).toBe(3000000);
  });
});
