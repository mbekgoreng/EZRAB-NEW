import { RABSection, RABItem } from '../types';

export interface CellCoordinate {
  col: string; // e.g. "F", "K", "L"
  row: number; // 1-based index (e.g. 12)
}

export const SPREADSHEET_COLUMNS = [
  { key: 'rowNum', letter: 'A', name: 'No', width: 45, defaultVisible: true, isFixed: true },
  { key: 'wbs', letter: 'B', name: 'WBS', width: 70, defaultVisible: true, isFixed: true },
  { key: 'code', letter: 'C', name: 'Kode AHSP', width: 100, defaultVisible: true },
  { key: 'description', letter: 'D', name: 'Uraian Pekerjaan', width: 320, defaultVisible: true },
  { key: 'specification', letter: 'E', name: 'Spesifikasi Teknis', width: 200, defaultVisible: true },
  { key: 'volume', letter: 'F', name: 'Volume', width: 90, defaultVisible: true, align: 'right' },
  { key: 'unit', letter: 'G', name: 'Sat', width: 55, defaultVisible: true, align: 'center' },
  { key: 'materialPrice', letter: 'H', name: 'Material (Rp)', width: 115, defaultVisible: false, align: 'right' },
  { key: 'laborPrice', letter: 'I', name: 'Upah (Rp)', width: 110, defaultVisible: false, align: 'right' },
  { key: 'equipmentPrice', letter: 'J', name: 'Alat (Rp)', width: 95, defaultVisible: false, align: 'right' },
  { key: 'unitPrice', letter: 'K', name: 'Harga Satuan (Rp)', width: 130, defaultVisible: true, align: 'right' },
  { key: 'totalPrice', letter: 'L', name: 'Jumlah Harga (Rp)', width: 145, defaultVisible: true, align: 'right' },
  { key: 'weightPercent', letter: 'M', name: 'Bobot (%)', width: 85, defaultVisible: true, align: 'right' },
  { key: 'startDate', letter: 'N', name: 'Mulai', width: 105, defaultVisible: false },
  { key: 'endDate', letter: 'O', name: 'Selesai', width: 105, defaultVisible: false },
  { key: 'duration', letter: 'P', name: 'Durasi (Hr)', width: 80, defaultVisible: false, align: 'center' },
  { key: 'status', letter: 'Q', name: 'Status Verifikasi', width: 130, defaultVisible: true, align: 'center' },
  { key: 'aiConfidence', letter: 'R', name: 'Confidence AI', width: 105, defaultVisible: false, align: 'center' },
  { key: 'sourceDocument', letter: 'S', name: 'Sumber Gambar', width: 150, defaultVisible: false },
];

/**
 * Evaluate Excel-style formula string
 * e.g. "=F12*K12", "=SUM(L12:L20)", "=H12+I12+J12"
 */
export function evaluateSpreadsheetFormula(
  formulaStr: string,
  rowItemMap: Record<number, RABItem>,
  grandTotal: number = 1
): { value: number; error: string | null } {
  if (!formulaStr || !formulaStr.startsWith('=')) {
    const num = parseFloat(formulaStr);
    return { value: isNaN(num) ? 0 : num, error: null };
  }

  try {
    let clean = formulaStr.substring(1).trim().toUpperCase();

    // 1. Check for SUM function: SUM(L12:L25) or SUM(F12:F15)
    const sumMatch = clean.match(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/);
    if (sumMatch) {
      const col = sumMatch[1];
      const startRow = parseInt(sumMatch[2]);
      const endRow = parseInt(sumMatch[4]);
      let totalSum = 0;

      for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
        const item = rowItemMap[r];
        if (item) {
          if (col === 'F') totalSum += item.volume || 0;
          else if (col === 'K') totalSum += item.unitPrice || 0;
          else if (col === 'L') totalSum += item.totalPrice || 0;
        }
      }
      return { value: Math.round(totalSum * 100) / 100, error: null };
    }

    // 2. Check for AVERAGE function
    const avgMatch = clean.match(/AVERAGE\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/);
    if (avgMatch) {
      const col = avgMatch[1];
      const startRow = parseInt(avgMatch[2]);
      const endRow = parseInt(avgMatch[4]);
      let totalSum = 0;
      let count = 0;

      for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
        const item = rowItemMap[r];
        if (item) {
          if (col === 'F') totalSum += item.volume || 0;
          else if (col === 'K') totalSum += item.unitPrice || 0;
          else if (col === 'L') totalSum += item.totalPrice || 0;
          count++;
        }
      }
      const val = count > 0 ? totalSum / count : 0;
      return { value: Math.round(val * 100) / 100, error: null };
    }

    // 3. Replace Cell References like F12, K12, $L$TOTAL with numeric values
    // Replace $L$TOTAL with Grand Total
    clean = clean.replace(/\$L\$TOTAL/gi, grandTotal.toString());

    // Replace cell references e.g. F12, L25
    clean = clean.replace(/([A-Z])(\d+)/g, (match, colLetter, rowNumStr) => {
      const r = parseInt(rowNumStr);
      const item = rowItemMap[r];
      if (!item) return '0';

      switch (colLetter) {
        case 'F': return (item.volume || 0).toString();
        case 'H': return (item.materialPrice || 0).toString();
        case 'I': return (item.laborPrice || 0).toString();
        case 'J': return (item.equipmentPrice || 0).toString();
        case 'K': return (item.unitPrice || 0).toString();
        case 'L': return (item.totalPrice || 0).toString();
        case 'M': return (item.weightPercent || 0).toString();
        default: return '0';
      }
    });

    // Check for division by zero
    if (clean.includes('/0') && !clean.includes('/0.')) {
      return { value: 0, error: '#DIV/0!' };
    }

    // Restrict safe math characters
    const sanitized = clean.replace(/[^0-9+\-*/().\s]/g, '');
    if (!sanitized.trim()) return { value: 0, error: '#FORMULA ERROR' };

    const result = new Function(`'use strict'; return (${sanitized})`)();
    if (typeof result === 'number' && !isNaN(result)) {
      return { value: Math.round(result * 100) / 100, error: null };
    }

    return { value: 0, error: '#FORMULA ERROR' };
  } catch (err) {
    return { value: 0, error: '#FORMULA ERROR' };
  }
}
