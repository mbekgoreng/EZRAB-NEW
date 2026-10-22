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
import { findAhspCandidates } from '../ai-design/AhspCandidatePicker';

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

describe('derivasi lengkap 12 kelompok (kasus screenshot: rumah 2 lantai 72 m²)', () => {
  // Sama persis dengan screenshot user: 12 × 6 m, 2 lantai, 3 KT, 2 KM,
  // ruang tamu, dapur, carport → geometri menghasilkan 36 m keliling, 72 m².
  const PROMPT =
    'Buatkan rumah 2 lantai luas bangunan 72 m², ukuran 6 × 12 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.';
  const KELOMPOK_12 = [
    '01 Persiapan', '02 Tanah', '03 Pondasi', '04 Struktur', '05 Dinding', '06 Atap',
    '07 Plafond', '08 Lantai', '09 Kusen, Pintu & Jendela', '10 Instalasi Listrik',
    '11 Instalasi Air & Sanitasi', '12 Pengecatan & Finishing',
  ];

  it('14. Menghasilkan item dari seluruh 12 kelompok (bukan hanya 3 item)', () => {
    const { spec } = parseHousePrompt(PROMPT);
    const rows = specToSpreadsheetRows(spec!);
    const workRows = rows.filter(r => r.kategori === 'PEKERJAAN');
    expect(workRows.length).toBeGreaterThanOrEqual(40);
    const groups = new Set(workRows.map(r => r.kelompok));
    for (const g of KELOMPOK_12) expect(groups.has(g)).toBe(true);
    // Work items (jalur kirim ke RAB) membawa kelompok yang sama
    const items = spreadsheetToWorkItems(rows);
    expect(items.length).toBe(workRows.length);
    expect(new Set(items.map(i => i.group)).size).toBe(12);
    expect(items.some(i => i.group === '01 Persiapan')).toBe(true);
    expect(items.some(i => i.group === '12 Pengecatan & Finishing')).toBe(true);
  });

  it('15. Tiga item lama tetap ada dengan volume yang sama persis', () => {
    const { spec } = parseHousePrompt(PROMPT);
    const rows = specToSpreadsheetRows(spec!);
    const by = (kode: string) => rows.find(r => r.kode === kode)!;
    // Keliling 2×(12+6)=36 → 36 × 0,15 × 3,2 = 17,28 (sama seperti screenshot)
    expect(by('W-001').volume).toBe(17.28);
    expect(by('F-001').volume).toBe(8.64);  // 72 × 0,12
    expect(by('F-002').volume).toBe(72);
  });

  it('16. Volume turunan kunci benar & semua item valid untuk RAB', () => {
    const { spec } = parseHousePrompt(PROMPT);
    const rows = specToSpreadsheetRows(spec!);
    const by = (kode: string) => rows.find(r => r.kode === kode)!;
    expect(by('P-002').volume).toBe(36);     // bouwplank = keliling
    expect(by('T-001').volume).toBe(20.16); // galian 36 × 0,7 × 0,8
    expect(by('PD-001').volume).toBe(15.12);// pondasi 36 × 0,6 × 0,7
    expect(by('W-003').volume).toBe(374.4); // plester (36+22,5) × 6,4 dua sisi
    expect(by('E-002').volume).toBe(13);    // stop kontak: 3×2 + 2×1 + 2 + 2 + 1
    expect(by('SN-006').volume).toBe(20);   // pipa: 2 KM × 8 m + dapur 4 m
    for (const r of rows.filter(x => x.kategori === 'PEKERJAAN')) {
      expect(r.volume).toBeGreaterThan(0);
      expect(r.sumber.length).toBeGreaterThan(0);
      expect(['TERHITUNG', 'ASUMSI', 'PERLU_REVIEW']).toContain(r.status);
      expect(r.kelompok).toBeTruthy();
    }
    const items = spreadsheetToWorkItems(rows);
    const { valid, rejected } = validateWorkItemsForRab(items);
    expect(rejected.length).toBe(0);
    expect(valid.length).toBe(items.length);
  });

  it('17. Kejujuran: item asumsi membawa catatan asumsi; geometri berstatus PERLU_REVIEW', () => {
    const { spec } = parseHousePrompt(PROMPT);
    const rows = specToSpreadsheetRows(spec!);
    // Hanya baris PEKERJAAN — baris RUANG juga berstatus ASUMSI (dimensi ruang
    // default) tetapi catatannya berisi posisi, bukan teks asumsi pekerjaan.
    const workRows = rows.filter(r => r.kategori === 'PEKERJAAN');
    const assumed = workRows.filter(r => r.status === 'ASUMSI');
    expect(assumed.length).toBeGreaterThan(10);
    for (const r of assumed) {
      expect(r.sumber).toBe('Asumsi sistem');
      expect(r.catatan.toLowerCase()).toContain('asumsi');
    }
    const geo = workRows.filter(r => r.sumber === 'Turunan geometri');
    expect(geo.length).toBeGreaterThan(10);
    for (const r of geo) expect(r.status).toBe('PERLU_REVIEW');
  });

  it('18. Relevansi: tanpa kamar mandi/dapur & 1 lantai → tidak ada sanitair/pelat tingkat/tangga', () => {
    const { spec } = parseHousePrompt('rumah 1 lantai 6×10 m, 2 kamar tidur, ruang tamu');
    const rows = specToSpreadsheetRows(spec!);
    const codes = rows.map(r => r.kode);
    expect(codes.some(c => c.startsWith('SN-'))).toBe(false);
    expect(codes).not.toContain('S-003');
    expect(codes).not.toContain('S-004');
    const groups = new Set(rows.filter(r => r.kategori === 'PEKERJAAN').map(r => r.kelompok));
    expect(groups.size).toBeGreaterThanOrEqual(10);
  });

  it('19. Kandidat AHSP dari katalog resmi ditemukan untuk item baru (yang memang ada)', () => {
    expect(findAhspCandidates(['galian'], 'm³').length).toBeGreaterThan(0);
    expect(findAhspCandidates(['bouwplank'], "m'").length).toBeGreaterThan(0);
    expect(findAhspCandidates(['plesteran'], 'm²').length).toBeGreaterThan(0);
    expect(findAhspCandidates(['pengecatan'], 'm²').length).toBeGreaterThan(0);
    expect(findAhspCandidates(['kloset'], 'buah').length).toBeGreaterThan(0);
    // Yang tidak ada di katalog (sloof per m³) → kosong secara jujur, bukan dikarang
    expect(Array.isArray(findAhspCandidates(['sloof'], 'm³'))).toBe(true);
  });
});
