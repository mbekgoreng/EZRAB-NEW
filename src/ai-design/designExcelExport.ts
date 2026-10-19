/**
 * EZRAB AI Design — Excel XLSX Export
 *
 * Menggunakan ExcelJS (sama seperti excelExportEngine EZRAB).
 * Sheet: Ringkasan, Daftar Ruang, Dimensi, Data QTO.
 * Tidak mengekspor harga palsu — kolom harga selalu kosong/null dengan status.
 */

import type { HouseSpec } from './specEngine';
import type { SpreadsheetRow } from './DesignSpreadsheet';
import { specToSpreadsheetRows } from './DesignSpreadsheet';

// Lazy import ExcelJS (berat, hanya saat export)
async function getExcelJS(): Promise<typeof import('exceljs')> {
  const mod = await import('exceljs');
  return mod.default || mod;
}

export interface DesignExcelOptions {
  filename?: string;
}

/**
 * Generate workbook XLSX dari HouseSpec.
 * Mengembalikan Buffer (Node) atau Blob (browser).
 */
export async function exportDesignToExcel(
  spec: HouseSpec,
  options: DesignExcelOptions = {}
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EZRAB AI Design';
  wb.created = new Date();

  const rows = specToSpreadsheetRows(spec);

  // --- Sheet 1: Ringkasan ---
  const ws1 = wb.addWorksheet('Ringkasan');
  ws1.columns = [
    { header: 'Item', key: 'item', width: 25 },
    { header: 'Nilai', key: 'value', width: 30 },
  ];
  const summaryData = [
    { item: 'Jenis Bangunan', value: spec.buildingType },
    { item: 'Jumlah Lantai', value: spec.floors },
    { item: 'Dimensi (m)', value: `${spec.buildingWidthM} × ${spec.buildingLengthM}` },
    { item: 'Luas Bangunan (m²)', value: spec.buildingAreaM2 },
    { item: 'Jumlah Ruang', value: spec.rooms.length },
    { item: 'Total Luas Ruang (m²)', value: Math.round(spec.totalRoomAreaM2 * 100) / 100 },
    { item: 'Sirkulasi (m²)', value: Math.round(spec.circulationM2 * 100) / 100 },
    { item: 'Tebal Dinding (m)', value: spec.wallThicknessM },
    { item: 'Kelengkapan (%)', value: spec.completeness },
    { item: 'Status', value: spec.isValid ? 'Valid' : 'Perlu perhatian' },
    { item: 'Sumber', value: 'AI Design (model konsep — bukan gambar kerja)' },
  ];
  summaryData.forEach(r => ws1.addRow(r));
  ws1.getRow(1).font = { bold: true };

  // --- Sheet 2: Daftar Ruang ---
  const ws2 = wb.addWorksheet('Daftar Ruang');
  ws2.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Nama Ruang', key: 'name', width: 25 },
    { header: 'Tipe', key: 'type', width: 15 },
    { header: 'Lebar (m)', key: 'w', width: 12 },
    { header: 'Panjang (m)', key: 'l', width: 12 },
    { header: 'Luas (m²)', key: 'area', width: 12 },
    { header: 'Status', key: 'status', width: 15 },
  ];
  spec.rooms.forEach((r, i) => {
    ws2.addRow({
      no: i + 1, name: r.name, type: r.type,
      w: r.widthM, l: r.lengthM, area: r.areaM2,
      status: r.isAssumed ? 'ASUMSI' : 'TERHITUNG',
    });
  });
  ws2.getRow(1).font = { bold: true };

  // --- Sheet 3: Dimensi ---
  const ws3 = wb.addWorksheet('Dimensi');
  ws3.columns = [
    { header: 'Kode', key: 'code', width: 12 },
    { header: 'Uraian', key: 'desc', width: 35 },
    { header: 'Panjang', key: 'p', width: 10 },
    { header: 'Lebar', key: 'l', width: 10 },
    { header: 'Tinggi', key: 't', width: 10 },
    { header: 'Satuan', key: 'unit', width: 8 },
  ];
  rows.filter(r => r.kategori === 'PEKERJAAN').forEach(r => {
    ws3.addRow({ code: r.kode, desc: r.uraian, p: r.panjang, l: r.lebar, t: r.tinggi, unit: r.satuan });
  });
  ws3.getRow(1).font = { bold: true };

  // --- Sheet 4: Data QTO ---
  const ws4 = wb.addWorksheet('Data QTO');
  ws4.columns = [
    { header: 'Kode', key: 'code', width: 12 },
    { header: 'Uraian', key: 'desc', width: 35 },
    { header: 'Volume', key: 'vol', width: 12 },
    { header: 'Satuan', key: 'unit', width: 8 },
    { header: 'Harga Satuan', key: 'price', width: 15 },
    { header: 'Status Harga', key: 'pstatus', width: 18 },
    { header: 'Sumber', key: 'source', width: 20 },
    { header: 'Catatan', key: 'note', width: 30 },
  ];
  rows.filter(r => r.kategori === 'PEKERJAAN').forEach(r => {
    ws4.addRow({
      code: r.kode, desc: r.uraian, vol: r.volume, unit: r.satuan,
      price: null, // TIDAK ADA HARGA PALSU
      pstatus: 'BELUM TERSEDIA',
      source: r.sumber, note: r.catatan,
    });
  });
  ws4.getRow(1).font = { bold: true };
  // Tandai kolom harga dengan warna peringatan
  ws4.getColumn('price').eachCell((cell, rowNumber) => {
    if (rowNumber > 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const filename = options.filename || `desain-rumah-${spec.buildingWidthM}x${spec.buildingLengthM}-${Date.now()}.xlsx`;

  // Convert Buffer to ArrayBuffer
  const ab = buffer instanceof ArrayBuffer ? buffer
    : new Uint8Array(buffer as unknown as ArrayBuffer).buffer as ArrayBuffer;

  return { buffer: ab, filename };
}

/**
 * Download XLSX di browser.
 */
export async function downloadDesignExcel(spec: HouseSpec): Promise<void> {
  const { buffer, filename } = await exportDesignToExcel(spec);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
