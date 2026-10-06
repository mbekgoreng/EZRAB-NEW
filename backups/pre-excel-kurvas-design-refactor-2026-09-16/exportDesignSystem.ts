import ExcelJS from 'exceljs';
import { ExportPresetId, ExportSignaturesConfig } from './types';

// =============================================================================
// COLOR PALETTE & TOKENS (ARGB Strings for ExcelJS)
// =============================================================================
export const EXCEL_COLORS = {
  PRIMARY_BLUE: 'FF2563EB',
  PRIMARY_BLUE_DARK: 'FF1D4ED8',
  NAVY_DARK: 'FF0F172A',
  NAVY_HEADER: 'FF1E293B',
  SLATE_BODY: 'FF334155',
  SLATE_MUTED: 'FF64748B',
  SLATE_LIGHT: 'FF94A3B8',
  WHITE: 'FFFFFFFF',
  BG_LIGHT: 'FFF8FAFC',
  BG_SECTION: 'FFF1F5F9',
  BG_SUBTLE_BLUE: 'FFEFF6FF',
  BG_ACCENT_BLUE: 'FFDBEAFE',
  BG_SUCCESS_SUBTLE: 'FFDCFCE7',
  TEXT_SUCCESS: 'FF15803D',
  BORDER_LIGHT: 'FFE2E8F0',
  BORDER_MEDIUM: 'FFCBD5E1',
  BORDER_DARK: 'FF334155',
  BORDER_BLUE: 'FF93C5FD',
};

export const FONT_FAMILY = 'Segoe UI';

// =============================================================================
// BORDER DEFINITIONS
// =============================================================================
export const BORDER_THIN_LIGHT: ExcelJS.Border = {
  style: 'thin',
  color: { argb: EXCEL_COLORS.BORDER_LIGHT },
};

export const BORDER_THIN_MEDIUM: ExcelJS.Border = {
  style: 'thin',
  color: { argb: EXCEL_COLORS.BORDER_MEDIUM },
};

export const BORDER_MEDIUM_DARK: ExcelJS.Border = {
  style: 'medium',
  color: { argb: EXCEL_COLORS.BORDER_DARK },
};

export const BORDER_DOUBLE_DARK: ExcelJS.Border = {
  style: 'double',
  color: { argb: EXCEL_COLORS.BORDER_DARK },
};

export const BORDER_BLUE_BOTTOM: ExcelJS.Border = {
  style: 'medium',
  color: { argb: EXCEL_COLORS.PRIMARY_BLUE },
};

// =============================================================================
// NUMBER FORMATS (Real Indonesian Construction Standards)
// =============================================================================
export const NUMBER_FORMATS = {
  CURRENCY: '"Rp"#,##0;("Rp"#,##0);"-"',
  CURRENCY_WITH_DECIMAL: '"Rp"#,##0.00;("Rp"#,##0.00);"-"',
  QUANTITY: '#,##0.00',
  QUANTITY_INTEGER: '#,##0',
  PERCENT: '0.00%',
  DATE: 'YYYY-MM-DD',
};

// =============================================================================
// TYPOGRAPHY HIERARCHY
// =============================================================================
export const FONT_HIERARCHY = {
  DOC_TITLE: { name: FONT_FAMILY, size: 20, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } },
  DOC_SUBTITLE: { name: FONT_FAMILY, size: 10, italic: true, color: { argb: EXCEL_COLORS.SLATE_MUTED } },
  SECTION_TITLE: { name: FONT_FAMILY, size: 13, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } },
  SUBSECTION_TITLE: { name: FONT_FAMILY, size: 11, bold: true, color: { argb: EXCEL_COLORS.NAVY_HEADER } },
  TABLE_HEADER: { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: EXCEL_COLORS.WHITE } },
  TABLE_HEADER_LIGHT: { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: EXCEL_COLORS.NAVY_HEADER } },
  WBS_HEADER: { name: FONT_FAMILY, size: 10, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } },
  BODY: { name: FONT_FAMILY, size: 9.5, color: { argb: EXCEL_COLORS.SLATE_BODY } },
  BODY_BOLD: { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } },
  BODY_MUTED: { name: FONT_FAMILY, size: 8.5, color: { argb: EXCEL_COLORS.SLATE_MUTED } },
  SUBTOTAL: { name: FONT_FAMILY, size: 10, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } },
  GRAND_TOTAL: { name: FONT_FAMILY, size: 11, bold: true, color: { argb: EXCEL_COLORS.PRIMARY_BLUE_DARK } },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert number to Indonesian written words (Terbilang)
 */
export function terbilangIndo(n: number): string {
  if (!n || isNaN(n) || n === 0) return 'Nol Rupiah';
  const angka = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function bilang(x: number): string {
    x = Math.floor(Math.abs(x));
    if (x < 12) return angka[x];
    if (x < 20) return bilang(x - 10) + ' Belas';
    if (x < 100) return bilang(Math.floor(x / 10)) + ' Puluh' + (x % 10 !== 0 ? ' ' + bilang(x % 10) : '');
    if (x < 200) return 'Seratus' + (x % 100 !== 0 ? ' ' + bilang(x % 100) : '');
    if (x < 1000) return bilang(Math.floor(x / 100)) + ' Ratus' + (x % 100 !== 0 ? ' ' + bilang(x % 100) : '');
    if (x < 2000) return 'Seribu' + (x % 1000 !== 0 ? ' ' + bilang(x % 1000) : '');
    if (x < 1000000) return bilang(Math.floor(x / 1000)) + ' Ribu' + (x % 1000 !== 0 ? ' ' + bilang(x % 1000) : '');
    if (x < 1000000000) return bilang(Math.floor(x / 1000000)) + ' Juta' + (x % 1000000 !== 0 ? ' ' + bilang(x % 1000000) : '');
    if (x < 1000000000000) return bilang(Math.floor(x / 1000000000)) + ' Miliar' + (x % 1000000000 !== 0 ? ' ' + bilang(x % 1000000000) : '');
    return bilang(Math.floor(x / 1000000000000)) + ' Triliun' + (x % 1000000000000 !== 0 ? ' ' + bilang(x % 1000000000000) : '');
  }

  const result = bilang(n).trim() + ' Rupiah';
  return result.replace(/\s+/g, ' ');
}

/**
 * Sanitize file name for OS compatibility
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Generate standard professional file name
 * Format: EZRAB_[PRESET]_[ProjectName]_[Rev]_[Date].xlsx
 */
export function generateExportFileName(
  preset: ExportPresetId,
  projectName: string,
  revision?: string,
  dateStr?: string
): string {
  const cleanProject = sanitizeFileName(projectName || 'Proyek');
  const cleanRev = sanitizeFileName(revision || 'Rev00');
  const today = dateStr || new Date().toISOString().substring(0, 10);
  const prefixMap: Record<ExportPresetId, string> = {
    RAB: 'RAB',
    BOQ: 'BOQ-Komersial',
    RAB_BOQ: 'RAB-BOQ',
    RAB_BOQ_AHSP: 'RAB-BOQ-AHSP',
    BOQ_MC0: 'BOQ-MC0',
    TENDER_PACKAGE: 'TENDER-PACKAGE',
    COMPLETE_PACKAGE: 'COMPLETE-PROJECT',
    CUSTOM: 'DOKUMEN-PROYEK',
  };
  const prefix = prefixMap[preset] || 'DOKUMEN';
  return `EZRAB_${prefix}_${cleanProject}_${cleanRev}_${today}.xlsx`;
}

/**
 * Configure professional print setup, headers, and footers on a worksheet
 */
export function applyPrintSetup(
  ws: ExcelJS.Worksheet,
  options: {
    orientation?: 'portrait' | 'landscape';
    paperSize?: number; // 9 = A4
    fitToWidth?: number;
    fitToHeight?: number;
    printTitlesRow?: string; // e.g., '5:5'
    projectName?: string;
    documentTitle?: string;
    revision?: string;
  }
) {
  const {
    orientation = 'portrait',
    paperSize = 9,
    fitToWidth = 1,
    fitToHeight = 0,
    printTitlesRow,
    projectName = 'Proyek Konstruksi',
    documentTitle = 'Dokumen RAB',
    revision = 'Rev 00',
  } = options;

  ws.pageSetup = {
    paperSize,
    orientation,
    fitToPage: true,
    fitToWidth,
    fitToHeight: fitToHeight === 0 ? undefined : fitToHeight,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    },
    printTitlesRow: printTitlesRow || undefined,
  };

  // Header and Footer for print
  ws.headerFooter = {
    oddHeader: `&L&8&K0F172A${documentTitle}&R&8&K64748BEZRAB • Professional Estimator`,
    oddFooter: `&L&8&K64748BProyek: ${projectName} (${revision})&R&8&K64748BHalaman &P dari &N`,
  };
}

/**
 * Apply Clean Signature Block (Disusun, Diperiksa, Disetujui)
 */
export function applySignatureBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  colStart: string,
  colMid: string,
  colEnd: string,
  signatures?: ExportSignaturesConfig
) {
  const prepTitle = signatures?.preparedByTitle || 'Disusun Oleh,';
  const prepName = signatures?.preparedByName || 'Ahmad Yusuf (Lead Estimator)';
  const checkTitle = signatures?.checkedByTitle || 'Diperiksa Oleh,';
  const checkName = signatures?.checkedByName || 'Ir. Hendra Kusuma (Direktur Teknik)';
  const appTitle = signatures?.approvedByTitle || 'Disetujui Oleh,';
  const appName = signatures?.approvedByName || 'Owner / Klien';

  const r1 = startRow;
  const r2 = startRow + 1;
  const r3 = startRow + 5;
  const r4 = startRow + 6;

  // Row 1: Titles
  ws.getCell(`${colStart}${r1}`).value = prepTitle;
  ws.getCell(`${colMid}${r1}`).value = checkTitle;
  ws.getCell(`${colEnd}${r1}`).value = appTitle;

  [colStart, colMid, colEnd].forEach((c) => {
    ws.getCell(`${c}${r1}`).font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };
    ws.getCell(`${c}${r1}`).alignment = { horizontal: 'center' };
  });

  // Row 2: Subtitle
  ws.getCell(`${colStart}${r2}`).value = 'Konsultan Estimasi';
  ws.getCell(`${colMid}${r2}`).value = 'Manajemen Konstruksi';
  ws.getCell(`${colEnd}${r2}`).value = 'Pemilik Proyek';

  [colStart, colMid, colEnd].forEach((c) => {
    ws.getCell(`${c}${r2}`).font = { name: FONT_FAMILY, size: 8, color: { argb: EXCEL_COLORS.SLATE_MUTED } };
    ws.getCell(`${c}${r2}`).alignment = { horizontal: 'center' };
  });

  // Row 3: Signature line
  [colStart, colMid, colEnd].forEach((c) => {
    ws.getCell(`${c}${r3}`).value = '_______________________________';
    ws.getCell(`${c}${r3}`).font = { name: FONT_FAMILY, size: 9, color: { argb: EXCEL_COLORS.BORDER_MEDIUM } };
    ws.getCell(`${c}${r3}`).alignment = { horizontal: 'center' };
  });

  // Row 4: Names
  ws.getCell(`${colStart}${r4}`).value = prepName;
  ws.getCell(`${colMid}${r4}`).value = checkName;
  ws.getCell(`${colEnd}${r4}`).value = appName;

  [colStart, colMid, colEnd].forEach((c) => {
    ws.getCell(`${c}${r4}`).font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };
    ws.getCell(`${c}${r4}`).alignment = { horizontal: 'center' };
  });
}
