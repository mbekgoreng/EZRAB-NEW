/**
 * Test: AI Design Spec Engine
 *
 * - Prompt valid → spec tervalidasi
 * - Prompt kurang info → needsClarification
 * - Dimensi kontradiktif → warning
 * - Konsistensi luas ruang
 * - Kalkulasi volume independen
 * - Spreadsheet → work items (harga null, bukan 0)
 */
import { describe, it, expect } from 'vitest';
import { parseHousePrompt, validateSpec } from '../ai-design/specEngine';
import { specToSpreadsheetRows, rowsToCSV } from '../ai-design/DesignSpreadsheet';
import { spreadsheetToWorkItems, validateWorkItemsForRab, buildApprovalSummary } from '../ai-design/designToRabBridge';

describe('specEngine: parse prompt valid', () => {
  it('1. Prompt lengkap menghasilkan spec', () => {
    const { spec, needsClarification } = parseHousePrompt(
      'Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.'
    );
    expect(spec).not.toBeNull();
    expect(spec!.floors).toBe(1);
    expect(spec!.buildingWidthM).toBe(6);
    expect(spec!.buildingLengthM).toBe(15);
    expect(spec!.buildingAreaM2).toBe(90);
    expect(needsClarification.length).toBe(0);
  });

  it('2. Ruang terekstrak dengan benar', () => {
    const { spec } = parseHousePrompt(
      'rumah 1 lantai 90 m² 6×15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, carport'
    );
    const bedrooms = spec!.rooms.filter(r => r.type === 'bedroom');
    const bathrooms = spec!.rooms.filter(r => r.type === 'bathroom');
    expect(bedrooms.length).toBe(3);
    expect(bathrooms.length).toBe(2);
    expect(spec!.rooms.some(r => r.type === 'living')).toBe(true);
    expect(spec!.rooms.some(r => r.type === 'kitchen')).toBe(true);
    expect(spec!.rooms.some(r => r.type === 'carport')).toBe(true);
  });

  it('3. Asumsi eksplisit untuk dimensi default', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×15 m, 2 kamar tidur');
    expect(spec!.assumptions.length).toBeGreaterThan(0);
    expect(spec!.rooms.every(r => r.isAssumed)).toBe(true);
  });
});

describe('specEngine: prompt kurang info', () => {
  it('4. Tanpa luas/dimensi → needsClarification', () => {
    const { spec, needsClarification } = parseHousePrompt('buatkan rumah dengan 3 kamar tidur');
    expect(needsClarification.length).toBeGreaterThan(0);
    expect(needsClarification.some(c => c.includes('Luas') || c.includes('Dimensi'))).toBe(true);
  });

  it('5. Tanpa daftar ruang → needsClarification', () => {
    const { needsClarification } = parseHousePrompt('rumah 1 lantai 100 m² ukuran 8×12 m');
    expect(needsClarification.some(c => c.toLowerCase().includes('ruang'))).toBe(true);
  });
});

describe('specEngine: validasi', () => {
  it('6. Dimensi kontradiktif → warning', () => {
    // Luas 90 tapi dimensi 10×10=100 → diff 11% < 15%, tidak warning
    // Luas 90 tapi dimensi 10×20=200 → diff >15%, warning
    const { spec } = parseHousePrompt('rumah 1 lantai luas 90 m² ukuran 10 × 20 m, 2 kamar tidur');
    expect(spec!.warnings.length).toBeGreaterThan(0);
  });

  it('7. Validasi overlap terdeteksi', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×15 m, 2 kamar tidur');
    const result = validateSpec(spec!);
    // Layout sederhana seharusnya tidak overlap untuk kasus normal
    expect(result.valid).toBe(true);
  });
});

describe('spreadsheet: generasi dan kalkulasi', () => {
  it('8. Baris spreadsheet dari spec', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×15 m, 2 kamar tidur, 1 kamar mandi');
    const rows = specToSpreadsheetRows(spec!);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(r => r.kategori === 'PROYEK')).toBe(true);
    expect(rows.some(r => r.kategori === 'RUANG')).toBe(true);
    expect(rows.some(r => r.kategori === 'PEKERJAAN')).toBe(true);
  });

  it('9. Volume dinding = perimeter × tebal × tinggi (independen)', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×15 m, 1 kamar tidur');
    const rows = specToSpreadsheetRows(spec!);
    const wallRow = rows.find(r => r.kode === 'W-001');
    // perimeter = 2×(6+15) = 42, tebal 0.15, tinggi 3.2
    // volume = 42 × 0.15 × 3.2 = 20.16
    expect(wallRow!.volume).toBe(20.16);
  });

  it('10. CSV valid dengan header benar', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×15 m, 1 kamar tidur');
    const rows = specToSpreadsheetRows(spec!);
    const csv = rowsToCSV(rows);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Kategori');
    expect(lines[0]).toContain('Volume/Luas');
    expect(lines.length).toBe(rows.length + 1);
  });
});

describe('bridge: QTO/RAB integration', () => {
  it('11. Work items harga null (bukan 0)', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×15 m, 2 kamar tidur');
    const rows = specToSpreadsheetRows(spec!);
    const items = spreadsheetToWorkItems(rows);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.unitPrice).toBeNull();
      expect(item.priceStatus).toBe('PRICE_UNRESOLVED');
    }
  });

  it('12. Validasi menolak volume invalid', () => {
    const { valid, rejected } = validateWorkItemsForRab([
      { code: 'T1', description: 'Test', category: 'X', unit: 'm³', volume: -5, source: 'AI_DESIGN_GEOMETRY', sourceDetail: '', designRowId: '', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED', needsReview: false, reviewReason: '' },
      { code: 'T2', description: 'Valid item', category: 'X', unit: 'm³', volume: 10, source: 'AI_DESIGN_GEOMETRY', sourceDetail: '', designRowId: '', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED', needsReview: false, reviewReason: '' },
    ]);
    expect(valid.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toContain('Volume tidak valid');
  });

  it('13. Approval summary jujur tentang harga', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×15 m, 2 kamar tidur');
    const rows = specToSpreadsheetRows(spec!);
    const items = spreadsheetToWorkItems(rows);
    const summary = buildApprovalSummary(spec!, items);
    expect(summary.unresolvedPriceCount).toBe(items.length);
    expect(summary.lines.some(l => l.includes('BELUM ADA HARGA'))).toBe(true);
  });
});
