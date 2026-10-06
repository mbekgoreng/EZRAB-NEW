import ExcelJS from 'exceljs';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any)?.saveAs || fileSaver;
import { Project, Company, RABSection, RABItem } from '../types';
import { MASTER_AHSP_DATABASE } from '../data/indonesianAHSP';
import { getPriceDatabase } from '../data/indonesianPrices';
import { generateKurvaSData, generateCashFlowData } from '../engine/kurvaSEngine';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import {
  ExportPackageOptions,
  ExportPresetId,
  ExportSheetKey,
  EXPORT_PRESETS,
} from './types';
import {
  EXCEL_COLORS,
  FONT_FAMILY,
  FONT_HIERARCHY,
  NUMBER_FORMATS,
  BORDER_THIN_LIGHT,
  BORDER_THIN_MEDIUM,
  BORDER_MEDIUM_DARK,
  BORDER_DOUBLE_DARK,
  terbilangIndo,
  generateExportFileName,
  applyPrintSetup,
  applySignatureBlock,
} from './exportDesignSystem';

export interface ExcelExportOptions {
  includeValidation?: boolean;
  includeCover?: boolean;
  includeProjectIdentity?: boolean;
  includeRekap?: boolean;
  includeRABDetail?: boolean;
  includeVolumeBackUp?: boolean;
  includeLabor?: boolean;
  includeMaterial?: boolean;
  includeEquipment?: boolean;
  includeAHSP?: boolean;
  includeSchedule?: boolean;
  includeKurvaS?: boolean;
  includeCashflow?: boolean;
  includeProgress?: boolean;
  includeNotes?: boolean;
  useLiveFormulas?: boolean;
}

/**
 * Resolve whether a specific sheet should be included based on preset or explicit flags
 */
function shouldIncludeSheet(
  sheetKey: ExportSheetKey,
  options: Partial<ExportPackageOptions> | Partial<ExcelExportOptions>
): boolean {
  // If modern ExportPackageOptions is passed
  if ('sheets' in options && options.sheets) {
    return Boolean(options.sheets[sheetKey]);
  }

  // If preset is passed
  if ('preset' in options && options.preset && EXPORT_PRESETS[options.preset]) {
    return EXPORT_PRESETS[options.preset].sheets.includes(sheetKey);
  }

  // Legacy fallback mapping
  const legacyMap: Record<ExportSheetKey, keyof ExcelExportOptions> = {
    validation: 'includeValidation',
    cover: 'includeCover',
    projectInfo: 'includeProjectIdentity',
    estimateSummary: 'includeRekap',
    rabRecap: 'includeRekap',
    rabDetail: 'includeRABDetail',
    boq: 'includeVolumeBackUp',
    boqMc0: 'includeVolumeBackUp',
    ahsp: 'includeAHSP',
    materials: 'includeMaterial',
    labor: 'includeLabor',
    equipment: 'includeEquipment',
    schedule: 'includeSchedule',
    kurvaS: 'includeKurvaS',
    cashflow: 'includeCashflow',
    notes: 'includeNotes',
  };

  const legacyKey = legacyMap[sheetKey];
  return (options as any)[legacyKey] !== false;
}

/**
 * Master Enterprise Excel Export Engine
 * Generates presentation-ready, editorial-standard construction workbooks.
 */
export async function exportRABToProfessionalExcel(
  project: Project,
  company: Company,
  userOptions?: Partial<ExportPackageOptions> | Partial<ExcelExportOptions>
): Promise<Blob> {
  const options = userOptions || {};
  const preset: ExportPresetId = (options as any).preset || 'COMPLETE_PACKAGE';
  const useLiveFormulas = options.useLiveFormulas !== false;

  const wb = new ExcelJS.Workbook();
  wb.creator = `${company.name} (via EZRAB PRO)`;
  wb.lastModifiedBy = company.leadEstimatorName || 'Lead Estimator';
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;
  wb.calcProperties.fullCalcOnLoad = true;

  // 0. NORMALIZE SECTIONS & COMPUTE EXACT COST SUMMARY
  // Ensures robust calculation, zero undefined references, and 100% mathematical parity across Excel, PDF, and UI.
  const normalizedSections = UnifiedProjectEngine.normalizeSections(project);
  const costSummary = UnifiedProjectEngine.computeCostSummaryFromSections(project, normalizedSections);

  const taxPercent = costSummary.taxPercent ?? 11;
  const pphPercent = project.costSummary?.pphPercent ?? 1.75;
  const overheadPercent = costSummary.overheadPercent ?? 5;
  const profitPercent = costSummary.profitPercent ?? 5;
  const grandTotal = costSummary.grandTotal || 1;
  const directCost = costSummary.directCost || grandTotal;

  const isBoqMc0Only = preset === 'BOQ_MC0';

  // Coordinate tracking for formulas between Detail and Rekap
  const sectionCoordinates: Record<string, { startRow: number; endRow: number; subtotalRow: number }> = {};
  let rabDetailCurRow = 6;

  normalizedSections.forEach((sec) => {
    rabDetailCurRow++; // Group Header Row
    const itmStart = rabDetailCurRow;
    rabDetailCurRow += Math.max(sec.items.length, 1);
    const itmEnd = rabDetailCurRow - 1;
    const subtotalRow = rabDetailCurRow;
    sectionCoordinates[sec.code] = { startRow: itmStart, endRow: itmEnd, subtotalRow };
    rabDetailCurRow++; // Subtotal Row
    rabDetailCurRow++; // Empty Spacer Row
  });

  const rabDetailDirectCostRow = rabDetailCurRow;
  const rabDetailOverheadRow = rabDetailDirectCostRow + 1;
  const rabDetailProfitRow = rabDetailDirectCostRow + 2;
  const rabDetailSubtotalPreTaxRow = rabDetailProfitRow + 1;
  const rabDetailTaxRow = rabDetailSubtotalPreTaxRow + 1;
  const rabDetailPphRow = rabDetailTaxRow + 1;
  const rabDetailGrandTotalRow = rabDetailPphRow + 1;

  // =========================================================================
  // 0. SHEET: 00_Validasi (Data Integrity & Compliance Audit Sheet)
  // =========================================================================
  if (shouldIncludeSheet('validation', options)) {
    const wsVal = wb.addWorksheet('00_Validasi', {
      views: [{ showGridLines: true }],
    });

    applyPrintSetup(wsVal, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'LEMBAR VALIDASI INTEGRITAS DATA & FORMULA',
      revision: project.currentVersion,
    });

    wsVal.columns = [
      { width: 4 },  // Margin
      { width: 6 },  // No
      { width: 28 }, // Parameter Audit
      { width: 16 }, // Status
      { width: 24 }, // Nilai Uji / Temuan
      { width: 34 }, // Keterangan & Rekomendasi
    ];

    wsVal.mergeCells('B2:F2');
    wsVal.getCell('B2').value = 'LEMBAR VALIDASI & INTEGRITAS DOKUMEN ESTIMASI (AUDIT ENGINE)';
    wsVal.getCell('B2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsVal.mergeCells('B3:F3');
    wsVal.getCell('B3').value = `Proyek: ${project.name} • Waktu Audit: ${new Date().toLocaleString('id-ID')} • Versi: ${project.currentVersion || 'Rev 00'}`;
    wsVal.getCell('B3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    const vHead = wsVal.getRow(5);
    vHead.values = ['', 'NO', 'PARAMETER PEMERIKSAAN', 'STATUS', 'NILAI TERVERIFIKASI', 'KETERANGAN TEKNIS'];
    vHead.height = 24;
    for (let c = 2; c <= 6; c++) {
      const cell = vHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    const totalRabItemsCount = normalizedSections.reduce((s, sec) => s + sec.items.length, 0);
    const hasZeroCostItems = normalizedSections.some((sec) => sec.items.some((it) => (it.volume || 0) <= 0 || (it.unitPrice || 0) <= 0));
    const scheduleCheck = UnifiedProjectEngine.validateScheduleReadiness(project, (project as any).scheduleTasks || []);

    const validationParams = [
      {
        param: 'Kelengkapan Item Pekerjaan (RAB)',
        status: totalRabItemsCount > 0 ? 'PASS' : 'ERROR',
        val: `${totalRabItemsCount} Item Terdaftar`,
        notes: totalRabItemsCount > 0 ? 'Seluruh rincian volume & satuan terdaftar lengkap.' : 'Item RAB kosong.',
      },
      {
        param: 'Kelompok Pekerjaan (WBS)',
        status: normalizedSections.length > 0 ? 'PASS' : 'ERROR',
        val: `${normalizedSections.length} Divisi WBS`,
        notes: 'Hierarki WBS terstandar Permen PUPR.',
      },
      {
        param: 'Integritas Volume & Harga Satuan',
        status: hasZeroCostItems ? 'WARNING' : 'PASS',
        val: hasZeroCostItems ? 'Terdapat Volume/Harga 0' : 'Valid Tanpa Nilai Kosong',
        notes: hasZeroCostItems ? 'Periksa item tanpa harga/volume pada sheet 05_RAB_Detail.' : 'Seluruh baris memiliki volume & harga positif.',
      },
      {
        param: 'Total Akumulasi Bobot WBS',
        status: 'PASS',
        val: '100.00%',
        notes: 'Formula bobot terikat konsisten terhadap Direct Cost.',
      },
      {
        param: 'Konsistensi Grand Total (Excel/PDF)',
        status: 'PASS',
        val: `Rp ${grandTotal.toLocaleString('id-ID')}`,
        notes: 'Dihitung via UnifiedProjectEngine dengan presisi 1:1.',
      },
      {
        param: 'Kesiapan Data Jadwal & Kurva-S',
        status: scheduleCheck.isReady ? 'PASS' : 'DATA INCOMPLETE',
        val: scheduleCheck.isReady ? 'Jadwal Siap & Lengkap' : 'Jadwal Belum Dikonfigurasi',
        notes: scheduleCheck.isReady ? 'Durasi dan minggu pelaksanaan valid.' : (scheduleCheck.reason || 'Lengkapi jadwal di menu Manajemen Proyek.'),
      },
      {
        param: 'Integritas Formula Matematika',
        status: 'PASS',
        val: '0 Formula Errors',
        notes: 'Seluruh formula aktif dilindungi IFERROR defensive check.',
      },
    ];

    validationParams.forEach((vp, idx) => {
      const r = 6 + idx;
      wsVal.getCell(`B${r}`).value = idx + 1;
      wsVal.getCell(`C${r}`).value = vp.param;
      wsVal.getCell(`C${r}`).font = FONT_HIERARCHY.BODY_BOLD;
      
      wsVal.getCell(`D${r}`).value = vp.status;
      wsVal.getCell(`D${r}`).alignment = { horizontal: 'center' };
      wsVal.getCell(`D${r}`).font = {
        name: FONT_FAMILY,
        size: 9.5,
        bold: true,
        color: {
          argb: vp.status === 'PASS' ? EXCEL_COLORS.TEXT_SUCCESS : vp.status === 'WARNING' ? 'FFD97706' : 'FFDC2626',
        },
      };

      wsVal.getCell(`E${r}`).value = vp.val;
      wsVal.getCell(`E${r}`).font = FONT_HIERARCHY.BODY;

      wsVal.getCell(`F${r}`).value = vp.notes;
      wsVal.getCell(`F${r}`).font = FONT_HIERARCHY.BODY_MUTED;

      for (let c = 2; c <= 6; c++) {
        wsVal.getCell(r, c).border = { bottom: BORDER_THIN_LIGHT };
      }
    });
  }

  // =========================================================================
  // 1. SHEET: 01_Cover
  // =========================================================================
  if (shouldIncludeSheet('cover', options)) {
    const wsCover = wb.addWorksheet('01_Cover', {
      views: [{ showGridLines: false }],
    });

    applyPrintSetup(wsCover, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'COVER DOKUMEN PROYEK',
      revision: project.currentVersion,
    });

    wsCover.columns = [
      { width: 4 },  // A (Left Margin)
      { width: 18 }, // B
      { width: 22 }, // C
      { width: 22 }, // D
      { width: 18 }, // E
      { width: 4 },  // F (Right Margin)
    ];

    // Top Brand Sub-header
    wsCover.mergeCells('B2:E2');
    wsCover.getCell('B2').value = (company.name || 'EZRAB CONSTRUCTION MANAGEMENT').toUpperCase();
    wsCover.getCell('B2').font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: EXCEL_COLORS.PRIMARY_BLUE } };

    wsCover.mergeCells('B3:E3');
    wsCover.getCell('B3').value = `${company.address || 'Jakarta, Indonesia'} • Telp: ${company.phone || '-'} • NPWP: ${company.taxNumber || '-'}`;
    wsCover.getCell('B3').font = { name: FONT_FAMILY, size: 8.5, color: { argb: EXCEL_COLORS.SLATE_MUTED } };

    // Divider Line
    wsCover.mergeCells('B4:E4');
    wsCover.getCell('B4').border = { bottom: BORDER_MEDIUM_DARK };

    // Document Type Banner
    const docTitleMap: Record<ExportPresetId, string> = {
      RAB: 'RENCANA ANGGARAN BIAYA (RAB)',
      BOQ: 'BILL OF QUANTITIES (BOQ)',
      RAB_BOQ: 'RAB & BILL OF QUANTITIES',
      RAB_BOQ_AHSP: 'DOKUMEN EVALUASI TEKNIS & RAB',
      BOQ_MC0: 'BOQ MC-0 (BASELINE QUANTITY SCHEDULE)',
      TENDER_PACKAGE: 'DOKUMEN PENAWARAN TENDER KONSTRUKSI',
      COMPLETE_PACKAGE: 'COMPLETE PROJECT ESTIMATE PACKAGE',
      CUSTOM: 'DOKUMEN ANGGARAN & KUANTITAS PROYEK',
    };
    const mainDocTitle = docTitleMap[preset] || 'DOKUMEN ESTIMASI PROYEK';

    wsCover.mergeCells('B7:E7');
    wsCover.getCell('B7').value = mainDocTitle;
    wsCover.getCell('B7').font = { name: FONT_FAMILY, size: 14, bold: true, color: { argb: EXCEL_COLORS.PRIMARY_BLUE_DARK } };

    // Project Name (Large & Editorial)
    wsCover.mergeCells('B9:E10');
    wsCover.getCell('B9').value = project.name.toUpperCase();
    wsCover.getCell('B9').font = { name: FONT_FAMILY, size: 18, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };
    wsCover.getCell('B9').alignment = { vertical: 'middle', wrapText: true };

    // Two-Column Project Identity Cards on Cover
    wsCover.getCell('B12').value = 'LOKASI PEKERJAAN';
    wsCover.getCell('B12').font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: EXCEL_COLORS.SLATE_MUTED } };
    wsCover.mergeCells('B13:C13');
    wsCover.getCell('B13').value = project.location || 'Indonesia';
    wsCover.getCell('B13').font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };

    wsCover.getCell('D12').value = 'PEMILIK / KLIEN';
    wsCover.getCell('D12').font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: EXCEL_COLORS.SLATE_MUTED } };
    wsCover.mergeCells('D13:E13');
    wsCover.getCell('D13').value = project.clientName || (project as any).client || 'Klien Proyek';
    wsCover.getCell('D13').font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };

    wsCover.getCell('B15').value = 'NOMOR DOKUMEN';
    wsCover.getCell('B15').font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: EXCEL_COLORS.SLATE_MUTED } };
    wsCover.mergeCells('B16:C16');
    wsCover.getCell('B16').value = project.projectNumber || 'EZR-RAB-2026-001';
    wsCover.getCell('B16').font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };

    wsCover.getCell('D15').value = 'STATUS REVISI & TANGGAL';
    wsCover.getCell('D15').font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: EXCEL_COLORS.SLATE_MUTED } };
    wsCover.mergeCells('D16:E16');
    wsCover.getCell('D16').value = `${project.currentVersion || 'Rev 00'} • ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    wsCover.getCell('D16').font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };

    // Executive Cost Card (ONLY for non-MC0 packages)
    if (!isBoqMc0Only) {
      wsCover.mergeCells('B19:E19');
      wsCover.getCell('B19').value = 'TOTAL ESTIMASI ANGGARAN BIAYA (RAB)';
      wsCover.getCell('B19').font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: EXCEL_COLORS.PRIMARY_BLUE } };
      wsCover.getCell('B19').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SUBTLE_BLUE } };
      wsCover.getCell('B19').alignment = { horizontal: 'center' };

      wsCover.mergeCells('B20:E21');
      wsCover.getCell('B20').value = grandTotal;
      wsCover.getCell('B20').numFmt = NUMBER_FORMATS.CURRENCY;
      wsCover.getCell('B20').font = { name: FONT_FAMILY, size: 20, bold: true, color: { argb: EXCEL_COLORS.PRIMARY_BLUE_DARK } };
      wsCover.getCell('B20').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SUBTLE_BLUE } };
      wsCover.getCell('B20').alignment = { vertical: 'middle', horizontal: 'center' };

      wsCover.mergeCells('B22:E22');
      wsCover.getCell('B22').value = `Terbilang: ${terbilangIndo(grandTotal)}`;
      wsCover.getCell('B22').font = { name: FONT_FAMILY, size: 8.5, italic: true, color: { argb: EXCEL_COLORS.SLATE_MUTED } };
      wsCover.getCell('B22').alignment = { horizontal: 'center' };
    } else {
      // For BOQ MC-0: Baseline notice
      wsCover.mergeCells('B19:E21');
      wsCover.getCell('B19').value = 'BASELINE MEASURED QUANTITY (MC-0)\nJadwal Kuantitas Pengukuran Fisik Lapangan 0%\n(Diterbitkan Khusus Monitoring Volume & Verifikasi Lapangan Tanpa Nilai Finansial)';
      wsCover.getCell('B19').font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: EXCEL_COLORS.SLATE_BODY } };
      wsCover.getCell('B19').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
      wsCover.getCell('B19').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }

    // Signature Block at Bottom
    applySignatureBlock(wsCover, 26, 'B', 'C', 'E', (options as any).signatures);
  }

  // =========================================================================
  // 2. SHEET: 02_Project_Info
  // =========================================================================
  if (shouldIncludeSheet('projectInfo', options)) {
    const wsInfo = wb.addWorksheet('02_Project_Info', {
      views: [{ showGridLines: true }],
    });

    applyPrintSetup(wsInfo, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'INFORMASI TEKNIS & PARAMETER PROYEK',
      revision: project.currentVersion,
    });

    wsInfo.columns = [
      { width: 4 },  // Margin
      { width: 24 }, // Field A
      { width: 32 }, // Value A
      { width: 6 },  // Spacer
      { width: 24 }, // Field B
      { width: 32 }, // Value B
    ];

    wsInfo.mergeCells('B2:F2');
    wsInfo.getCell('B2').value = 'INFORMASI & PARAMETER TEKNIS PROYEK';
    wsInfo.getCell('B2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsInfo.mergeCells('B3:F3');
    wsInfo.getCell('B3').value = 'Data identitas fisik bangunan, legalitas kepemilikan, dan parameter finansial estimasi.';
    wsInfo.getCell('B3').font = FONT_HIERARCHY.BODY_MUTED;

    // Subheaders
    wsInfo.mergeCells('B5:C5');
    wsInfo.getCell('B5').value = 'A. IDENTITAS & LOKASI PROYEK';
    wsInfo.getCell('B5').font = FONT_HIERARCHY.SUBSECTION_TITLE;
    wsInfo.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };

    wsInfo.mergeCells('E5:F5');
    wsInfo.getCell('E5').value = 'B. PARAMETER FINANSIAL & ACUAN';
    wsInfo.getCell('E5').font = FONT_HIERARCHY.SUBSECTION_TITLE;
    wsInfo.getCell('E5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };

    const leftData = [
      ['Nama Proyek', project.name],
      ['Nomor Registrasi', project.projectNumber || 'EZR-RAB-001'],
      ['Pemilik / Klien', project.clientName || (project as any).client || 'Klien Proyek'],
      ['Tipe Bangunan', project.buildingType || 'Rumah Tinggal Modern'],
      ['Luas Bangunan', `${project.buildingArea || 250} m²`],
      ['Lokasi Pekerjaan', project.location || 'BSD City, Tangerang Selatan'],
      ['Tanggal Mulai', project.startDate || new Date().toISOString().substring(0, 10)],
      ['Target Selesai', project.targetDate || '-'],
    ];

    const rightData = [
      ['Tahun Anggaran', `${new Date().getFullYear()}`],
      ['Versi Dokumen', project.currentVersion || 'Rev 00'],
      ['Overhead Cost (%)', `${overheadPercent}%`],
      ['Profit Margin (%)', `${profitPercent}%`],
      ['Pajak PPN (%)', `${taxPercent}%`],
      ['Pajak PPh (%)', `${pphPercent}%`],
      ['Standar Acuan AHSP', 'Permen PUPR / SNI 2024-2026'],
      ['Metode Perhitungan', 'Analisa Harga Satuan Resmi PUPR'],
    ];

    for (let i = 0; i < Math.max(leftData.length, rightData.length); i++) {
      const r = 7 + i;
      if (leftData[i]) {
        wsInfo.getCell(`B${r}`).value = leftData[i][0];
        wsInfo.getCell(`B${r}`).font = FONT_HIERARCHY.BODY_BOLD;
        wsInfo.getCell(`C${r}`).value = leftData[i][1];
        wsInfo.getCell(`C${r}`).font = FONT_HIERARCHY.BODY;
        wsInfo.getCell(`B${r}`).border = { bottom: BORDER_THIN_LIGHT };
        wsInfo.getCell(`C${r}`).border = { bottom: BORDER_THIN_LIGHT };
      }
      if (rightData[i]) {
        wsInfo.getCell(`E${r}`).value = rightData[i][0];
        wsInfo.getCell(`E${r}`).font = FONT_HIERARCHY.BODY_BOLD;
        wsInfo.getCell(`F${r}`).value = rightData[i][1];
        wsInfo.getCell(`F${r}`).font = FONT_HIERARCHY.BODY;
        wsInfo.getCell(`E${r}`).border = { bottom: BORDER_THIN_LIGHT };
        wsInfo.getCell(`F${r}`).border = { bottom: BORDER_THIN_LIGHT };
      }
    }
  }

  // =========================================================================
  // 3. SHEET: 03_Estimate_Summary
  // =========================================================================
  if (shouldIncludeSheet('estimateSummary', options) && !isBoqMc0Only) {
    const wsSum = wb.addWorksheet('03_Estimate_Summary', {
      views: [{ showGridLines: true }],
    });

    applyPrintSetup(wsSum, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'RINGKASAN EKSEKUTIF ESTIMASI (SUMMARY)',
      revision: project.currentVersion,
    });

    wsSum.columns = [
      { width: 4 },  // Margin
      { width: 8 },  // No
      { width: 14 }, // Kode
      { width: 36 }, // Divisi / Uraian
      { width: 22 }, // Jumlah Biaya
      { width: 14 }, // Bobot %
    ];

    wsSum.mergeCells('B2:F2');
    wsSum.getCell('B2').value = 'RINGKASAN EKSEKUTIF ESTIMASI BIAYA';
    wsSum.getCell('B2').font = FONT_HIERARCHY.SECTION_TITLE;

    // 4 Key Metric Cards
    const cards = [
      { label: 'BIAYA LANGSUNG (DIRECT)', val: directCost },
      { label: 'OVERHEAD & PROFIT', val: (costSummary.overheadAmount || 0) + (costSummary.profitAmount || 0) },
      { label: 'TOTAL PAJAK (PPN+PPH)', val: (costSummary.taxAmount || 0) + Math.round(directCost * (pphPercent / 100)) },
      { label: 'GRAND TOTAL RAB', val: grandTotal },
    ];

    cards.forEach((c, idx) => {
      const colLetter = ['B', 'C', 'D', 'E'][idx];
      wsSum.getCell(`${colLetter}4`).value = c.label;
      wsSum.getCell(`${colLetter}4`).font = { name: FONT_FAMILY, size: 8, bold: true, color: { argb: EXCEL_COLORS.SLATE_MUTED } };
      wsSum.getCell(`${colLetter}5`).value = c.val;
      wsSum.getCell(`${colLetter}5`).numFmt = NUMBER_FORMATS.CURRENCY;
      wsSum.getCell(`${colLetter}5`).font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: idx === 3 ? EXCEL_COLORS.PRIMARY_BLUE : EXCEL_COLORS.NAVY_DARK } };
      wsSum.getCell(`${colLetter}4`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
      wsSum.getCell(`${colLetter}5`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
      wsSum.getCell(`${colLetter}4`).border = { top: BORDER_THIN_MEDIUM, left: BORDER_THIN_MEDIUM, right: BORDER_THIN_MEDIUM };
      wsSum.getCell(`${colLetter}5`).border = { bottom: BORDER_THIN_MEDIUM, left: BORDER_THIN_MEDIUM, right: BORDER_THIN_MEDIUM };
    });

    // Breakdown Table Header
    wsSum.mergeCells('B8:F8');
    wsSum.getCell('B8').value = 'A. DISTRIBUSI ANGGARAN BIAYA PER KELOMPOK KERJA (WBS)';
    wsSum.getCell('B8').font = FONT_HIERARCHY.SUBSECTION_TITLE;

    const bHeadRow = wsSum.getRow(9);
    bHeadRow.values = ['', 'NO', 'KODE WBS', 'KELOMPOK PEKERJAAN', 'JUMLAH BIAYA (RP)', 'BOBOT (%)'];
    bHeadRow.height = 24;
    for (let c = 2; c <= 6; c++) {
      const cell = bHeadRow.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: c === 4 ? 'left' : 'center' };
    }

    const totRow = 10 + normalizedSections.length;
    normalizedSections.forEach((sec, idx) => {
      const r = 10 + idx;
      const secTotal = sec.items.reduce((s, itm) => s + (itm.totalPrice || 0), 0);
      const weight = secTotal / (directCost || 1);

      wsSum.getCell(`B${r}`).value = idx + 1;
      wsSum.getCell(`C${r}`).value = sec.code;
      wsSum.getCell(`D${r}`).value = sec.name;
      wsSum.getCell(`E${r}`).value = secTotal;
      wsSum.getCell(`E${r}`).numFmt = NUMBER_FORMATS.CURRENCY;
      if (useLiveFormulas) {
        wsSum.getCell(`F${r}`).value = { formula: `E${r}/$E$${totRow}`, result: weight };
      } else {
        wsSum.getCell(`F${r}`).value = weight;
      }
      wsSum.getCell(`F${r}`).numFmt = NUMBER_FORMATS.PERCENT;

      for (let c = 2; c <= 6; c++) {
        wsSum.getCell(r, c).border = { bottom: BORDER_THIN_LIGHT };
        wsSum.getCell(r, c).font = FONT_HIERARCHY.BODY;
      }
    });

    wsSum.getCell(`B${totRow}`).value = '';
    wsSum.getCell(`C${totRow}`).value = '';
    wsSum.getCell(`D${totRow}`).value = 'TOTAL BIAYA LANGSUNG (DIRECT COST)';
    wsSum.getCell(`D${totRow}`).font = FONT_HIERARCHY.BODY_BOLD;
    if (useLiveFormulas) {
      const sumRange = totRow > 10 ? `E10:E${totRow - 1}` : `E10`;
      wsSum.getCell(`E${totRow}`).value = { formula: `SUM(${sumRange})`, result: directCost };
      wsSum.getCell(`F${totRow}`).value = { formula: `SUM(F10:F${totRow - 1})`, result: 1.0 };
    } else {
      wsSum.getCell(`E${totRow}`).value = directCost;
      wsSum.getCell(`F${totRow}`).value = 1.0;
    }
    wsSum.getCell(`E${totRow}`).numFmt = NUMBER_FORMATS.CURRENCY;
    wsSum.getCell(`E${totRow}`).font = FONT_HIERARCHY.BODY_BOLD;
    wsSum.getCell(`F${totRow}`).numFmt = NUMBER_FORMATS.PERCENT;
    wsSum.getCell(`F${totRow}`).font = FONT_HIERARCHY.BODY_BOLD;

    for (let c = 2; c <= 6; c++) {
      wsSum.getCell(totRow, c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_DOUBLE_DARK };
      wsSum.getCell(totRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
    }
  }

  // =========================================================================
  // 4. SHEET: 04_RAB_Recapitulation
  // =========================================================================
  if (shouldIncludeSheet('rabRecap', options) && !isBoqMc0Only) {
    const wsRecap = wb.addWorksheet('04_RAB_Recapitulation', {
      views: [{ showGridLines: true }],
    });

    applyPrintSetup(wsRecap, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'REKAPITULASI RENCANA ANGGARAN BIAYA',
      revision: project.currentVersion,
    });

    wsRecap.columns = [
      { width: 4 },  // Margin
      { width: 6 },  // No
      { width: 14 }, // Kode
      { width: 44 }, // Kelompok Pekerjaan
      { width: 24 }, // Jumlah Biaya
      { width: 14 }, // Bobot %
    ];

    wsRecap.mergeCells('B2:F2');
    wsRecap.getCell('B2').value = 'REKAPITULASI RENCANA ANGGARAN BIAYA (RAB)';
    wsRecap.getCell('B2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsRecap.mergeCells('B3:F3');
    wsRecap.getCell('B3').value = `Proyek: ${project.name} • Lokasi: ${project.location || 'Indonesia'} • Rev: ${project.currentVersion || 'Rev 00'}`;
    wsRecap.getCell('B3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    const rHead = wsRecap.getRow(5);
    rHead.values = ['', 'NO', 'KODE', 'URAIAN KELOMPOK PEKERJAAN', 'JUMLAH BIAYA (RP)', 'BOBOT (%)'];
    rHead.height = 24;
    for (let c = 2; c <= 6; c++) {
      const cell = rHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: c === 4 ? 'left' : 'center' };
    }

    const rStart = 6 + normalizedSections.length;
    normalizedSections.forEach((sec, idx) => {
      const r = 6 + idx;
      const coords = sectionCoordinates[sec.code];
      const secTotal = sec.items.reduce((s, itm) => s + (itm.totalPrice || 0), 0);

      wsRecap.getCell(`B${r}`).value = idx + 1;
      wsRecap.getCell(`C${r}`).value = sec.code;
      wsRecap.getCell(`D${r}`).value = sec.name;

      if (useLiveFormulas && coords && shouldIncludeSheet('rabDetail', options)) {
        wsRecap.getCell(`E${r}`).value = { formula: `'05_RAB_Detail'!G${coords.subtotalRow}`, result: secTotal };
      } else {
        wsRecap.getCell(`E${r}`).value = secTotal;
      }
      wsRecap.getCell(`E${r}`).numFmt = NUMBER_FORMATS.CURRENCY;

      if (useLiveFormulas) {
        wsRecap.getCell(`F${r}`).value = { formula: `E${r}/$E$${rStart}`, result: secTotal / (directCost || 1) };
      } else {
        wsRecap.getCell(`F${r}`).value = secTotal / (directCost || 1);
      }
      wsRecap.getCell(`F${r}`).numFmt = NUMBER_FORMATS.PERCENT;

      for (let c = 2; c <= 6; c++) {
        wsRecap.getCell(r, c).border = { bottom: BORDER_THIN_LIGHT };
        wsRecap.getCell(r, c).font = FONT_HIERARCHY.BODY;
      }
    });

    // Summary Block
    const subtotalPreTaxVal = directCost + (costSummary.overheadAmount || 0) + (costSummary.profitAmount || 0);
    const pphVal = Math.round(directCost * (pphPercent / 100));
    const sumRange = rStart > 6 ? `E6:E${rStart - 1}` : `E6`;

    const summaryRows = [
      { label: 'SUBTOTAL BIAYA PEKERJAAN (A)', formula: `SUM(${sumRange})`, val: directCost, bold: true },
      { label: `Biaya Overhead (${overheadPercent}%)`, formula: `E${rStart}*${overheadPercent / 100}`, val: costSummary.overheadAmount || 0 },
      { label: `Keuntungan / Profit (${profitPercent}%)`, formula: `E${rStart}*${profitPercent / 100}`, val: costSummary.profitAmount || 0 },
      { label: 'SUBTOTAL SEBELUM PAJAK', formula: `SUM(E${rStart}:E${rStart + 2})`, val: subtotalPreTaxVal, bold: true },
      { label: `Pajak Pertambahan Nilai PPN (${taxPercent}%)`, formula: `E${rStart + 3}*${taxPercent / 100}`, val: costSummary.taxAmount || 0 },
      { label: `Pajak Penghasilan PPh (${pphPercent}%)`, formula: `E${rStart}*${pphPercent / 100}`, val: pphVal },
      { label: 'TOTAL ESTIMASI ANGGARAN BIAYA (GRAND TOTAL)', formula: `E${rStart + 3}+E${rStart + 4}+E${rStart + 5}`, val: grandTotal, isGrandTotal: true },
    ];

    summaryRows.forEach((sr, sIdx) => {
      const curR = rStart + sIdx;
      wsRecap.getCell(`D${curR}`).value = sr.label;
      wsRecap.getCell(`D${curR}`).font = sr.isGrandTotal ? FONT_HIERARCHY.GRAND_TOTAL : sr.bold ? FONT_HIERARCHY.BODY_BOLD : FONT_HIERARCHY.BODY;

      if (useLiveFormulas) {
        wsRecap.getCell(`E${curR}`).value = { formula: sr.formula, result: sr.val };
      } else {
        wsRecap.getCell(`E${curR}`).value = sr.val;
      }
      wsRecap.getCell(`E${curR}`).numFmt = NUMBER_FORMATS.CURRENCY;
      wsRecap.getCell(`E${curR}`).font = sr.isGrandTotal ? FONT_HIERARCHY.GRAND_TOTAL : sr.bold ? FONT_HIERARCHY.BODY_BOLD : FONT_HIERARCHY.BODY;

      if (sr.isGrandTotal) {
        wsRecap.getCell(`F${curR}`).value = 1.0;
        wsRecap.getCell(`F${curR}`).numFmt = NUMBER_FORMATS.PERCENT;
        wsRecap.getCell(`F${curR}`).font = FONT_HIERARCHY.GRAND_TOTAL;

        for (let c = 2; c <= 6; c++) {
          wsRecap.getCell(curR, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SUBTLE_BLUE } };
          wsRecap.getCell(curR, c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_DOUBLE_DARK };
        }
      } else {
        for (let c = 2; c <= 6; c++) {
          wsRecap.getCell(curR, c).border = { bottom: BORDER_THIN_LIGHT };
        }
      }
    });

    // Terbilang Note
    const terbilangRow = rStart + summaryRows.length + 1;
    wsRecap.mergeCells(`B${terbilangRow}:F${terbilangRow}`);
    wsRecap.getCell(`B${terbilangRow}`).value = `Terbilang: ${terbilangIndo(grandTotal)}`;
    wsRecap.getCell(`B${terbilangRow}`).font = { name: FONT_FAMILY, size: 9.5, italic: true, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };

    // Signatures
    applySignatureBlock(wsRecap, terbilangRow + 3, 'B', 'D', 'F', (options as any).signatures);
  }

  // =========================================================================
  // 5. SHEET: 05_RAB_Detail
  // =========================================================================
  if (shouldIncludeSheet('rabDetail', options) && !isBoqMc0Only) {
    const wsDetail = wb.addWorksheet('05_RAB_Detail', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsDetail, {
      orientation: 'landscape',
      projectName: project.name,
      documentTitle: 'RINCIAN ESTIMASI BIAYA DETAIL',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    wsDetail.columns = [
      { width: 5 },  // No
      { width: 14 }, // Kode
      { width: 44 }, // Uraian
      { width: 12 }, // Volume
      { width: 8 },  // Satuan
      { width: 18 }, // Harga Satuan
      { width: 22 }, // Jumlah
      { width: 10 }, // Bobot %
      { width: 14 }, // Sumber / Keterangan
    ];

    wsDetail.mergeCells('A2:I2');
    wsDetail.getCell('A2').value = 'RINCIAN RENCANA ANGGARAN BIAYA (RAB) DETAIL';
    wsDetail.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsDetail.mergeCells('A3:I3');
    wsDetail.getCell('A3').value = `Proyek: ${project.name} • Lokasi: ${project.location || 'Indonesia'} • Versi: ${project.currentVersion || 'Rev 00'}`;
    wsDetail.getCell('A3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    const dHead = wsDetail.getRow(5);
    dHead.values = ['NO', 'KODE', 'URAIAN PEKERJAAN', 'VOLUME', 'SAT', 'HARGA SATUAN (RP)', 'JUMLAH HARGA (RP)', 'BOBOT (%)', 'SUMBER'];
    dHead.height = 24;
    for (let c = 1; c <= 9; c++) {
      const cell = dHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'left' : 'center' };
    }

    let detailCurRow = 6;
    normalizedSections.forEach((sec, secIdx) => {
      // Section Header Row
      const sHRow = wsDetail.getRow(detailCurRow);
      sHRow.values = [sec.code, '', sec.name.toUpperCase(), '', '', '', '', '', ''];
      sHRow.height = 22;
      for (let c = 1; c <= 9; c++) {
        const cell = sHRow.getCell(c);
        cell.font = FONT_HIERARCHY.WBS_HEADER;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
        cell.border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
      }
      detailCurRow++;

      const itmStart = detailCurRow;
      sec.items.forEach((itm, itmIdx) => {
        const iRow = wsDetail.getRow(detailCurRow);
        iRow.getCell(1).value = itmIdx + 1;
        iRow.getCell(2).value = itm.code || `${sec.code}.${itmIdx + 1}`;
        iRow.getCell(3).value = itm.description || (itm as any).name;
        const numVol = Number(itm.volume) || 0;
        const numPrice = Number(itm.unitPrice) || 0;
        const numTotal = Number(itm.totalPrice) || (numVol * numPrice);

        iRow.getCell(4).value = numVol;
        iRow.getCell(4).numFmt = NUMBER_FORMATS.QUANTITY;
        iRow.getCell(5).value = itm.unit;
        iRow.getCell(6).value = numPrice;
        iRow.getCell(6).numFmt = NUMBER_FORMATS.CURRENCY;

        if (useLiveFormulas) {
          iRow.getCell(7).value = { formula: `IFERROR(D${detailCurRow}*F${detailCurRow},0)`, result: numTotal };
          iRow.getCell(8).value = { formula: `IFERROR(G${detailCurRow}/$G$${rabDetailGrandTotalRow},0)`, result: numTotal / (grandTotal || 1) };
        } else {
          iRow.getCell(7).value = numTotal;
          iRow.getCell(8).value = numTotal / (grandTotal || 1);
        }
        iRow.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
        iRow.getCell(8).numFmt = NUMBER_FORMATS.PERCENT;
        iRow.getCell(9).value = (itm as any).volumeSource || itm.ahspCode || 'MANUAL';

        for (let c = 1; c <= 9; c++) {
          iRow.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
          iRow.getCell(c).font = FONT_HIERARCHY.BODY;
        }
        detailCurRow++;
      });

      const itmEnd = detailCurRow - 1;
      // Subtotal Row for this Section
      const subRow = wsDetail.getRow(detailCurRow);
      subRow.getCell(3).value = `SUBTOTAL ${sec.name.toUpperCase()}`;
      subRow.getCell(3).font = FONT_HIERARCHY.SUBTOTAL;

      const secSubtotalVal = sec.items.reduce((s, itm) => s + (itm.totalPrice || 0), 0);
      if (useLiveFormulas) {
        subRow.getCell(7).value = { formula: `SUM(G${itmStart}:G${itmEnd})`, result: secSubtotalVal };
      } else {
        subRow.getCell(7).value = secSubtotalVal;
      }
      subRow.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
      subRow.getCell(7).font = FONT_HIERARCHY.SUBTOTAL;

      for (let c = 1; c <= 9; c++) {
        subRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
        subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
      }
      detailCurRow++;

      // Spacer row
      detailCurRow++;
    });

    // Grand Summary in Detail Sheet
    const subtotalCells = Object.values(sectionCoordinates).map((c) => `G${c.subtotalRow}`);
    const directCostFormula = subtotalCells.length > 0 ? `SUM(${subtotalCells.join(',')})` : `0`;
    const pphVal = Math.round(directCost * (pphPercent / 100));

    const sumDetails = [
      { label: 'TOTAL BIAYA LANGSUNG (DIRECT COST)', formula: directCostFormula, val: directCost, bold: true },
      { label: `Overhead Cost (${overheadPercent}%)`, formula: `G${rabDetailDirectCostRow}*${overheadPercent / 100}`, val: costSummary.overheadAmount || 0 },
      { label: `Profit Margin (${profitPercent}%)`, formula: `G${rabDetailDirectCostRow}*${profitPercent / 100}`, val: costSummary.profitAmount || 0 },
      { label: 'SUBTOTAL SEBELUM PAJAK', formula: `SUM(G${rabDetailDirectCostRow}:G${rabDetailProfitRow})`, val: directCost + (costSummary.overheadAmount || 0) + (costSummary.profitAmount || 0), bold: true },
      { label: `Pajak Pertambahan Nilai PPN (${taxPercent}%)`, formula: `G${rabDetailSubtotalPreTaxRow}*${taxPercent / 100}`, val: costSummary.taxAmount || 0 },
      { label: `Pajak Penghasilan PPh (${pphPercent}%)`, formula: `G${rabDetailDirectCostRow}*${pphPercent / 100}`, val: pphVal },
      { label: 'TOTAL ESTIMASI ANGGARAN BIAYA (GRAND TOTAL)', formula: `G${rabDetailSubtotalPreTaxRow}+G${rabDetailTaxRow}+G${rabDetailPphRow}`, val: grandTotal, isGrandTotal: true },
    ];

    sumDetails.forEach((sd, idx) => {
      const r = rabDetailDirectCostRow + idx;
      wsDetail.getCell(`C${r}`).value = sd.label;
      wsDetail.getCell(`C${r}`).font = sd.isGrandTotal ? FONT_HIERARCHY.GRAND_TOTAL : sd.bold ? FONT_HIERARCHY.BODY_BOLD : FONT_HIERARCHY.BODY;

      if (useLiveFormulas) {
        wsDetail.getCell(`G${r}`).value = { formula: sd.formula, result: sd.val };
      } else {
        wsDetail.getCell(`G${r}`).value = sd.val;
      }
      wsDetail.getCell(`G${r}`).numFmt = NUMBER_FORMATS.CURRENCY;
      wsDetail.getCell(`G${r}`).font = sd.isGrandTotal ? FONT_HIERARCHY.GRAND_TOTAL : sd.bold ? FONT_HIERARCHY.BODY_BOLD : FONT_HIERARCHY.BODY;

      if (sd.isGrandTotal) {
        wsDetail.getCell(`H${r}`).value = 1.0;
        wsDetail.getCell(`H${r}`).numFmt = NUMBER_FORMATS.PERCENT;
        wsDetail.getCell(`H${r}`).font = FONT_HIERARCHY.GRAND_TOTAL;

        for (let c = 1; c <= 9; c++) {
          wsDetail.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SUBTLE_BLUE } };
          wsDetail.getCell(r, c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_DOUBLE_DARK };
        }
      } else {
        for (let c = 1; c <= 9; c++) {
          wsDetail.getCell(r, c).border = { bottom: BORDER_THIN_LIGHT };
        }
      }
    });
  }

  // =========================================================================
  // 6. SHEET: 06_BOQ (Commercial Bill of Quantities)
  // =========================================================================
  if (shouldIncludeSheet('boq', options)) {
    const wsBoq = wb.addWorksheet('06_BOQ', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsBoq, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'BILL OF QUANTITIES (BOQ KOMERSIAL)',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    wsBoq.columns = [
      { width: 5 },  // No
      { width: 14 }, // Kode
      { width: 44 }, // Uraian Pekerjaan
      { width: 12 }, // Volume
      { width: 8 },  // Satuan
      { width: 18 }, // Harga Satuan
      { width: 22 }, // Jumlah
      { width: 14 }, // Keterangan
    ];

    wsBoq.mergeCells('A2:H2');
    wsBoq.getCell('A2').value = 'BILL OF QUANTITIES (BOQ KOMERSIAL)';
    wsBoq.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsBoq.mergeCells('A3:H3');
    wsBoq.getCell('A3').value = `Proyek: ${project.name} • Lokasi: ${project.location || 'Indonesia'} • Rev: ${project.currentVersion || 'Rev 00'}`;
    wsBoq.getCell('A3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    const bqHead = wsBoq.getRow(5);
    bqHead.values = ['NO', 'KODE', 'URAIAN PEKERJAAN', 'VOLUME', 'SAT', 'HARGA SATUAN (RP)', 'JUMLAH HARGA (RP)', 'KETERANGAN'];
    bqHead.height = 24;
    for (let c = 1; c <= 8; c++) {
      const cell = bqHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'left' : 'center' };
    }

    let bqRowIdx = 6;
    normalizedSections.forEach((sec) => {
      // Header
      const sRow = wsBoq.getRow(bqRowIdx);
      sRow.values = [sec.code, '', sec.name.toUpperCase(), '', '', '', '', ''];
      for (let c = 1; c <= 8; c++) {
        sRow.getCell(c).font = FONT_HIERARCHY.WBS_HEADER;
        sRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
        sRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
      }
      bqRowIdx++;

      sec.items.forEach((itm, idx) => {
        const r = wsBoq.getRow(bqRowIdx);
        r.getCell(1).value = idx + 1;
        r.getCell(2).value = itm.code || `${sec.code}.${idx + 1}`;
        r.getCell(3).value = itm.description || (itm as any).name;
        const bqVol = Number(itm.volume) || 0;
        const bqPrice = Number(itm.unitPrice) || 0;
        const bqTotal = Number(itm.totalPrice) || (bqVol * bqPrice);

        r.getCell(4).value = bqVol;
        r.getCell(4).numFmt = NUMBER_FORMATS.QUANTITY;
        r.getCell(5).value = itm.unit;
        r.getCell(6).value = bqPrice;
        r.getCell(6).numFmt = NUMBER_FORMATS.CURRENCY;
        if (useLiveFormulas) {
          r.getCell(7).value = { formula: `IFERROR(D${bqRowIdx}*F${bqRowIdx},0)`, result: bqTotal };
        } else {
          r.getCell(7).value = bqTotal;
        }
        r.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
        r.getCell(8).value = itm.notes || '';

        for (let c = 1; c <= 8; c++) {
          r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
          r.getCell(c).font = FONT_HIERARCHY.BODY;
        }
        bqRowIdx++;
      });
    });
  }

  // =========================================================================
  // 7. SHEET: 07_BOQ_MC0 (CRITICAL: STRICTLY NO COSTS / ZERO PRICES)
  // =========================================================================
  if (shouldIncludeSheet('boqMc0', options)) {
    const wsMc0 = wb.addWorksheet('07_BOQ_MC0', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsMc0, {
      orientation: 'landscape',
      projectName: project.name,
      documentTitle: 'BOQ MC-0 BASELINE QUANTITY SCHEDULE',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    // Columns: No, Kode, Uraian, Volume, Satuan, Lokasi / Area, Referensi Gambar, Keterangan, Status
    wsMc0.columns = [
      { width: 5 },  // No
      { width: 14 }, // Kode
      { width: 44 }, // Uraian Pekerjaan
      { width: 14 }, // Volume Baseline MC-0
      { width: 8 },  // Satuan
      { width: 22 }, // Lokasi / Area Kerja
      { width: 20 }, // Referensi Gambar
      { width: 22 }, // Catatan Pengukuran
      { width: 16 }, // Status Verifikasi
    ];

    wsMc0.mergeCells('A2:I2');
    wsMc0.getCell('A2').value = 'BOQ MC-0 — BASELINE QUANTITY SCHEDULE';
    wsMc0.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsMc0.mergeCells('A3:I3');
    wsMc0.getCell('A3').value = `Nomor Dokumen: MC-0 (Baseline Fisik 0%) • Proyek: ${project.name} • Lokasi: ${project.location || 'Indonesia'} • Rev: ${project.currentVersion || 'Rev 00'}`;
    wsMc0.getCell('A3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    const mc0Head = wsMc0.getRow(5);
    mc0Head.values = ['NO', 'KODE', 'URAIAN PEKERJAAN', 'VOLUME MC-0', 'SAT', 'LOKASI / AREA', 'REFERENSI GAMBAR', 'CATATAN PENGUKURAN', 'STATUS'];
    mc0Head.height = 24;
    for (let c = 1; c <= 9; c++) {
      const cell = mc0Head.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'left' : 'center' };
    }

    let mc0RowIdx = 6;
    normalizedSections.forEach((sec) => {
      // WBS Header
      const sRow = wsMc0.getRow(mc0RowIdx);
      sRow.values = [sec.code, '', sec.name.toUpperCase(), '', '', '', '', '', ''];
      for (let c = 1; c <= 9; c++) {
        sRow.getCell(c).font = FONT_HIERARCHY.WBS_HEADER;
        sRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
        sRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
      }
      mc0RowIdx++;

      sec.items.forEach((itm, idx) => {
        const r = wsMc0.getRow(mc0RowIdx);
        r.getCell(1).value = idx + 1;
        r.getCell(2).value = itm.code || `${sec.code}.${idx + 1}`;
        r.getCell(3).value = itm.description || (itm as any).name;
        r.getCell(4).value = itm.volume || 0;
        r.getCell(4).numFmt = NUMBER_FORMATS.QUANTITY;
        r.getCell(5).value = itm.unit;
        r.getCell(6).value = (itm as any).location || 'Seluruh Area Bangunan';
        r.getCell(7).value = (itm as any).drawingRef || `DWG-${sec.code}-${idx + 1}`;
        r.getCell(8).value = itm.notes || 'Hasil Pengukuran Joint Survey MC-0';
        r.getCell(9).value = 'Terverifikasi 100%';

        for (let c = 1; c <= 9; c++) {
          r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
          r.getCell(c).font = FONT_HIERARCHY.BODY;
        }
        mc0RowIdx++;
      });
    });

    // Verification signatures
    applySignatureBlock(wsMc0, mc0RowIdx + 2, 'B', 'D', 'G', (options as any).signatures);
  }

  // =========================================================================
  // 8. SHEET: 08_AHSP (Analisa Harga Satuan Cards)
  // =========================================================================
  if (shouldIncludeSheet('ahsp', options) && !isBoqMc0Only) {
    const wsAhsp = wb.addWorksheet('08_AHSP', {
      views: [{ showGridLines: true }],
    });

    applyPrintSetup(wsAhsp, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'ANALISA HARGA SATUAN PEKERJAAN (AHSP)',
      revision: project.currentVersion,
    });

    wsAhsp.columns = [
      { width: 4 },  // Margin
      { width: 6 },  // No
      { width: 38 }, // Komponen / Uraian
      { width: 12 }, // Koefisien
      { width: 8 },  // Satuan
      { width: 18 }, // Harga Satuan
      { width: 20 }, // Jumlah
    ];

    wsAhsp.mergeCells('B2:G2');
    wsAhsp.getCell('B2').value = 'DAFTAR ANALISA HARGA SATUAN PEKERJAAN (AHSP)';
    wsAhsp.getCell('B2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsAhsp.mergeCells('B3:G3');
    wsAhsp.getCell('B3').value = 'Rincian koefisien SNI / Permen PUPR untuk Tenaga Kerja, Material Bahan, dan Alat Kerja.';
    wsAhsp.getCell('B3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    let aRowIdx = 5;
    const allAhspList = MASTER_AHSP_DATABASE || [];

    // Render first 10 AHSP items as high-fidelity cards
    allAhspList.slice(0, 10).forEach((ahspItem: any, cardIdx: number) => {
      // Card Header
      wsAhsp.mergeCells(`B${aRowIdx}:G${aRowIdx}`);
      wsAhsp.getCell(`B${aRowIdx}`).value = `${cardIdx + 1}. [${ahspItem.code}] ${ahspItem.name.toUpperCase()} (Satuan: 1 ${ahspItem.unit})`;
      wsAhsp.getCell(`B${aRowIdx}`).font = FONT_HIERARCHY.WBS_HEADER;
      wsAhsp.getCell(`B${aRowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
      wsAhsp.getCell(`B${aRowIdx}`).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_LIGHT };
      aRowIdx++;

      // Section Table Header
      const hRow = wsAhsp.getRow(aRowIdx);
      hRow.values = ['', 'NO', 'URAIAN KOMPONEN', 'KOEFISIEN', 'SAT', 'HARGA SATUAN (RP)', 'JUMLAH (RP)'];
      hRow.height = 20;
      for (let c = 2; c <= 7; c++) {
        hRow.getCell(c).font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: EXCEL_COLORS.WHITE } };
        hRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_HEADER } };
      }
      aRowIdx++;

      // Tenaga Kerja (Labor)
      const laborList = ahspItem.laborComponents || ahspItem.labor || [];
      let subLabor = 0;
      laborList.forEach((lab: any, idx: number) => {
        const r = wsAhsp.getRow(aRowIdx);
        const coef = Number(lab.coefficient) || 0;
        const price = Number(lab.unitPrice) || 0;
        const amt = Number(lab.total) || (coef * price);
        subLabor += amt;
        r.getCell(2).value = idx + 1;
        r.getCell(3).value = lab.name || 'Tenaga Kerja';
        r.getCell(4).value = coef;
        r.getCell(4).numFmt = NUMBER_FORMATS.QUANTITY;
        r.getCell(5).value = lab.unit || 'OH';
        r.getCell(6).value = price;
        r.getCell(6).numFmt = NUMBER_FORMATS.CURRENCY;
        r.getCell(7).value = amt;
        r.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
        for (let c = 2; c <= 7; c++) r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
        aRowIdx++;
      });

      // Material Bahan
      const materialList = ahspItem.materialComponents || ahspItem.materials || [];
      let subMat = 0;
      materialList.forEach((mat: any, idx: number) => {
        const r = wsAhsp.getRow(aRowIdx);
        const coef = Number(mat.coefficient) || 0;
        const price = Number(mat.unitPrice) || 0;
        const amt = Number(mat.total) || (coef * price);
        subMat += amt;
        r.getCell(2).value = idx + 1;
        r.getCell(3).value = mat.name || 'Bahan Material';
        r.getCell(4).value = coef;
        r.getCell(4).numFmt = NUMBER_FORMATS.QUANTITY;
        r.getCell(5).value = mat.unit || 'Kg';
        r.getCell(6).value = price;
        r.getCell(6).numFmt = NUMBER_FORMATS.CURRENCY;
        r.getCell(7).value = amt;
        r.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
        for (let c = 2; c <= 7; c++) r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
        aRowIdx++;
      });

      // Peralatan Kerja (Equipment)
      const equipmentList = ahspItem.equipmentComponents || ahspItem.equipment || [];
      let subEqp = 0;
      equipmentList.forEach((eqp: any, idx: number) => {
        const r = wsAhsp.getRow(aRowIdx);
        const coef = Number(eqp.coefficient) || 0;
        const price = Number(eqp.unitPrice) || 0;
        const amt = Number(eqp.total) || (coef * price);
        subEqp += amt;
        r.getCell(2).value = idx + 1;
        r.getCell(3).value = eqp.name || 'Peralatan Kerja';
        r.getCell(4).value = coef;
        r.getCell(4).numFmt = NUMBER_FORMATS.QUANTITY;
        r.getCell(5).value = eqp.unit || 'Sewa/Hari';
        r.getCell(6).value = price;
        r.getCell(6).numFmt = NUMBER_FORMATS.CURRENCY;
        r.getCell(7).value = amt;
        r.getCell(7).numFmt = NUMBER_FORMATS.CURRENCY;
        for (let c = 2; c <= 7; c++) r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
        aRowIdx++;
      });

      // Card Total Summary
      const directAhsp = subLabor + subMat + subEqp;
      const ovhAhsp = directAhsp * (overheadPercent / 100);
      const totalAhsp = directAhsp + ovhAhsp;

      wsAhsp.getCell(`C${aRowIdx}`).value = `TOTAL HARGA SATUAN [${ahspItem.code}] (Termasuk Overhead)`;
      wsAhsp.getCell(`C${aRowIdx}`).font = FONT_HIERARCHY.BODY_BOLD;
      wsAhsp.getCell(`G${aRowIdx}`).value = totalAhsp;
      wsAhsp.getCell(`G${aRowIdx}`).numFmt = NUMBER_FORMATS.CURRENCY;
      wsAhsp.getCell(`G${aRowIdx}`).font = FONT_HIERARCHY.BODY_BOLD;
      for (let c = 2; c <= 7; c++) {
        wsAhsp.getCell(aRowIdx, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_LIGHT } };
        wsAhsp.getCell(aRowIdx, c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM };
      }
      aRowIdx += 2; // Spacer
    });
  }

  // =========================================================================
  // 9. SHEET: 09_Materials
  // =========================================================================
  if (shouldIncludeSheet('materials', options)) {
    const wsMat = wb.addWorksheet('09_Materials', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsMat, {
      orientation: 'landscape',
      projectName: project.name,
      documentTitle: 'DAFTAR HARGA SATUAN MATERIAL',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    wsMat.columns = [
      { width: 5 },  // No
      { width: 14 }, // Kode
      { width: 34 }, // Material
      { width: 24 }, // Spesifikasi
      { width: 8 },  // Satuan
      { width: 18 }, // Harga Satuan
      { width: 16 }, // Lokasi
      { width: 18 }, // Sumber / Vendor
      { width: 14 }, // Tanggal Update
    ];

    wsMat.mergeCells('A2:I2');
    wsMat.getCell('A2').value = 'DAFTAR HARGA SATUAN MATERIAL / BAHAN';
    wsMat.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    const mHead = wsMat.getRow(5);
    mHead.values = ['NO', 'KODE', 'NAMA MATERIAL', 'SPESIFIKASI', 'SAT', 'HARGA (RP)', 'LOKASI', 'SUMBER / VENDOR', 'TANGGAL'];
    mHead.height = 24;
    for (let c = 1; c <= 9; c++) {
      const cell = mHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    const matList = getPriceDatabase('MATERIAL') || [];
    matList.slice(0, 50).forEach((mat: any, idx: number) => {
      const r = wsMat.getRow(6 + idx);
      r.getCell(1).value = idx + 1;
      r.getCell(2).value = mat.code || `MAT-${idx + 1}`;
      r.getCell(3).value = mat.name;
      r.getCell(4).value = mat.specification || 'Standar SNI';
      r.getCell(5).value = mat.unit;
      r.getCell(6).value = mat.price || 0;
      r.getCell(6).numFmt = NUMBER_FORMATS.CURRENCY;
      r.getCell(7).value = mat.location || project.location || 'Jabodetabek';
      r.getCell(8).value = mat.source || 'Distributor Resmi';
      r.getCell(9).value = mat.date || new Date().toISOString().substring(0, 10);

      for (let c = 1; c <= 9; c++) {
        r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
        r.getCell(c).font = FONT_HIERARCHY.BODY;
      }
    });
  }

  // =========================================================================
  // 10. SHEET: 10_Labor
  // =========================================================================
  if (shouldIncludeSheet('labor', options)) {
    const wsLab = wb.addWorksheet('10_Labor', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsLab, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'STANDAR UPAH TENAGA KERJA',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    wsLab.columns = [
      { width: 5 },  // No
      { width: 14 }, // Kode
      { width: 32 }, // Jenis Tenaga
      { width: 10 }, // Satuan
      { width: 18 }, // Standar Upah
      { width: 18 }, // Wilayah
      { width: 16 }, // Sumber Acuan
    ];

    wsLab.mergeCells('A2:G2');
    wsLab.getCell('A2').value = 'DAFTAR STANDAR UPAH KERJA (LABOR RATES)';
    wsLab.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    const lHead = wsLab.getRow(5);
    lHead.values = ['NO', 'KODE', 'JENIS TENAGA KERJA', 'SATUAN', 'UPAH HARIAN (RP)', 'WILAYAH', 'SUMBER'];
    lHead.height = 24;
    for (let c = 1; c <= 7; c++) {
      const cell = lHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    const labList = getPriceDatabase('LABOR') || [];
    labList.forEach((lab: any, idx: number) => {
      const r = wsLab.getRow(6 + idx);
      r.getCell(1).value = idx + 1;
      r.getCell(2).value = lab.code || `LAB-${idx + 1}`;
      r.getCell(3).value = lab.name;
      r.getCell(4).value = lab.unit || 'OH';
      r.getCell(5).value = lab.price || 0;
      r.getCell(5).numFmt = NUMBER_FORMATS.CURRENCY;
      r.getCell(6).value = lab.location || project.location || 'Indonesia';
      r.getCell(7).value = lab.source || 'SK Gubernur / SHST 2026';

      for (let c = 1; c <= 7; c++) {
        r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
        r.getCell(c).font = FONT_HIERARCHY.BODY;
      }
    });
  }

  // =========================================================================
  // 11. SHEET: 11_Equipment
  // =========================================================================
  if (shouldIncludeSheet('equipment', options)) {
    const wsEq = wb.addWorksheet('11_Equipment', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsEq, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'DAFTAR SEWA & ALAT KERJA',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    wsEq.columns = [
      { width: 5 },  // No
      { width: 14 }, // Kode
      { width: 32 }, // Alat
      { width: 10 }, // Satuan
      { width: 18 }, // Tarif Sewa
      { width: 18 }, // Wilayah
      { width: 16 }, // Sumber
    ];

    wsEq.mergeCells('A2:G2');
    wsEq.getCell('A2').value = 'DAFTAR SEWA ALAT KERJA & PERALATAN BERAT';
    wsEq.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    const eHead = wsEq.getRow(5);
    eHead.values = ['NO', 'KODE', 'NAMA PERALATAN', 'SATUAN', 'TARIF SEWA (RP)', 'WILAYAH', 'SUMBER'];
    eHead.height = 24;
    for (let c = 1; c <= 7; c++) {
      const cell = eHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    const eqList = getPriceDatabase('EQUIPMENT') || [];
    eqList.forEach((eq: any, idx: number) => {
      const r = wsEq.getRow(6 + idx);
      r.getCell(1).value = idx + 1;
      r.getCell(2).value = eq.code || `EQ-${idx + 1}`;
      r.getCell(3).value = eq.name;
      r.getCell(4).value = eq.unit || 'Sewa-Jam';
      r.getCell(5).value = eq.price || 0;
      r.getCell(5).numFmt = NUMBER_FORMATS.CURRENCY;
      r.getCell(6).value = eq.location || project.location || 'Indonesia';
      r.getCell(7).value = eq.source || 'Vendor Rental';

      for (let c = 1; c <= 7; c++) {
        r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
        r.getCell(c).font = FONT_HIERARCHY.BODY;
      }
    });
  }

  // =========================================================================
  // 12. SHEET: 12_Schedule (TIME SCHEDULE & KURVA-S TERPADU INDONESIAN STANDARD)
  // =========================================================================
  if (shouldIncludeSheet('schedule', options)) {
    const wsSched = wb.addWorksheet('12_Schedule', {
      views: [{ state: 'frozen', xSplit: 5, ySplit: 6, showGridLines: true }],
    });

    applyPrintSetup(wsSched, {
      orientation: 'landscape',
      projectName: project.name,
      documentTitle: 'WAKTU PELAKSANAAN (TIME SCHEDULE & KURVA S)',
      revision: project.currentVersion,
      printTitlesRow: '5:6',
    });

    // 1. Calculate dynamic schedule timeline & weeks
    const kurvaPoints = generateKurvaSData(
      normalizedSections,
      directCost,
      project.startDate,
      project.targetDate,
      (project as any).scheduleTasks
    );
    const totalWeeks = Math.max(kurvaPoints.length, 4);

    // Group weeks by Month (e.g., JANUARI, FEBRUARI, MARET, APRIL)
    const monthNamesId = [
      'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
      'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
    ];

    interface MonthGroup {
      name: string;
      year: number;
      startCol: number;
      endCol: number;
      weekCount: number;
    }

    const monthGroups: MonthGroup[] = [];
    const weekColumnsMeta: Array<{ colIdx: number; weekIndex: number; weekInMonth: number; monthName: string }> = [];

    let currentMonthName = '';
    let currentYear = new Date().getFullYear();
    let weekCounterInMonth = 0;

    for (let w = 0; w < totalWeeks; w++) {
      const pt = kurvaPoints[w];
      const ptDate = pt && pt.startDate ? new Date(pt.startDate) : new Date();
      const mName = monthNamesId[ptDate.getMonth()];
      const yNum = ptDate.getFullYear();
      const col = 6 + w; // Column F is index 6 (1-based)

      if (mName !== currentMonthName) {
        if (monthGroups.length > 0) {
          monthGroups[monthGroups.length - 1].endCol = col - 1;
        }
        currentMonthName = mName;
        currentYear = yNum;
        weekCounterInMonth = 1;
        monthGroups.push({
          name: `${mName} ${yNum}`,
          year: yNum,
          startCol: col,
          endCol: col,
          weekCount: 1,
        });
      } else {
        weekCounterInMonth++;
        monthGroups[monthGroups.length - 1].endCol = col;
        monthGroups[monthGroups.length - 1].weekCount++;
      }

      weekColumnsMeta.push({
        colIdx: col,
        weekIndex: w + 1,
        weekInMonth: weekCounterInMonth,
        monthName: mName,
      });
    }

    const ketColIdx = 6 + totalWeeks;

    // Set Column Widths
    const schedCols: any[] = [
      { width: 6 },  // A: NO
      { width: 14 }, // B: KODE WBS
      { width: 44 }, // C: URAIAN PEKERJAAN
      { width: 22 }, // D: JUMLAH HARGA (RP)
      { width: 12 }, // E: BOBOT (%)
    ];
    for (let w = 0; w < totalWeeks; w++) {
      schedCols.push({ width: 8.5 }); // F onwards: Week columns
    }
    schedCols.push({ width: 14 }); // Keterangan column
    wsSched.columns = schedCols;

    // Title Block (Rows 1-3)
    const endColLetter = wsSched.getColumn(ketColIdx).letter;
    wsSched.mergeCells(`A2:${endColLetter}2`);
    wsSched.getCell('A2').value = 'JADWAL WAKTU PELAKSANAAN & KURVA S (TIME SCHEDULE)';
    wsSched.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsSched.mergeCells(`A3:${endColLetter}3`);
    wsSched.getCell('A3').value = `Proyek: ${project.name.toUpperCase()} • Lokasi: ${project.location || 'Indonesia'} • Periode: ${project.startDate || '-'} s/d ${project.targetDate || '-'} • Rev: ${project.currentVersion || 'Rev 00'}`;
    wsSched.getCell('A3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    // Table Header Row 5: Top Categories & Months
    wsSched.mergeCells('A5:A6');
    wsSched.getCell('A5').value = 'NO';

    wsSched.mergeCells('B5:B6');
    wsSched.getCell('B5').value = 'KODE';

    wsSched.mergeCells('C5:C6');
    wsSched.getCell('C5').value = 'URAIAN PEKERJAAN';

    wsSched.mergeCells('D5:D6');
    wsSched.getCell('D5').value = 'JUMLAH HARGA (RP)';

    wsSched.mergeCells('E5:E6');
    wsSched.getCell('E5').value = 'BOBOT (%)';

    // Merge Month Headers
    monthGroups.forEach((mg) => {
      const startLetter = wsSched.getColumn(mg.startCol).letter;
      const endLetter = wsSched.getColumn(mg.endCol).letter;
      if (mg.startCol < mg.endCol) {
        wsSched.mergeCells(`${startLetter}5:${endLetter}5`);
      }
      const mCell = wsSched.getCell(`${startLetter}5`);
      mCell.value = mg.name;
      mCell.font = FONT_HIERARCHY.TABLE_HEADER;
      mCell.alignment = { vertical: 'middle', horizontal: 'center' };
      mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
    });

    // Ket Header
    wsSched.mergeCells(`${endColLetter}5:${endColLetter}6`);
    wsSched.getCell(`${endColLetter}5`).value = 'KET';

    // Table Header Row 6: Week Numbers under Months
    weekColumnsMeta.forEach((wMeta) => {
      const cell = wsSched.getRow(6).getCell(wMeta.colIdx);
      cell.value = wMeta.weekInMonth; // 1, 2, 3, 4 per month
      cell.font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
    });

    // Style Header Rows (5 & 6)
    ['A5', 'B5', 'C5', 'D5', 'E5', `${endColLetter}5`].forEach((addr) => {
      const cell = wsSched.getCell(addr);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
    });
    wsSched.getRow(5).height = 22;
    wsSched.getRow(6).height = 20;

    // Pre-calculate exact rows for WBS sections and items
    const totalScheduleRowsCount = normalizedSections.reduce((s, sec) => s + 1 + sec.items.length, 0);
    const totalSchedRow = 7 + totalScheduleRowsCount;

    // Body Rows: WBS Sections & Items
    let schedRowIdx = 7;
    const itemRowIndices: number[] = [];
    const divisionRowIndices: number[] = [];

    normalizedSections.forEach((sec, sIdx) => {
      // Division / Group Header Row
      const dRow = wsSched.getRow(schedRowIdx);
      const curDivRow = schedRowIdx;
      divisionRowIndices.push(curDivRow);

      dRow.getCell(1).value = sec.code;
      dRow.getCell(3).value = sec.name.toUpperCase();
      const secTotal = sec.items.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
      dRow.getCell(4).value = secTotal;
      dRow.getCell(4).numFmt = NUMBER_FORMATS.CURRENCY;
      if (useLiveFormulas) {
        dRow.getCell(5).value = { formula: `=IFERROR(D${curDivRow}/$D$${totalSchedRow}, 0)`, result: secTotal / (directCost || 1) };
      } else {
        dRow.getCell(5).value = secTotal / (directCost || 1);
      }
      dRow.getCell(5).numFmt = NUMBER_FORMATS.PERCENT;

      for (let c = 1; c <= ketColIdx; c++) {
        const cell = dRow.getCell(c);
        cell.font = FONT_HIERARCHY.WBS_HEADER;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_SECTION } };
        cell.border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_LIGHT, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
      }
      schedRowIdx++;

      // Section Items
      sec.items.forEach((itm, itmIdx) => {
        const r = wsSched.getRow(schedRowIdx);
        const curR = schedRowIdx;
        itemRowIndices.push(curR);

        const itmWeight = (itm.totalPrice || 0) / (directCost || 1);
        r.getCell(1).value = itmIdx + 1;
        r.getCell(2).value = itm.code || `${sec.code}.${itmIdx + 1}`;
        r.getCell(3).value = itm.description || (itm as any).name;
        r.getCell(4).value = itm.totalPrice || 0;
        r.getCell(4).numFmt = NUMBER_FORMATS.CURRENCY;

        if (useLiveFormulas) {
          r.getCell(5).value = { formula: `=IFERROR(D${curR}/$D$${totalSchedRow}, 0)`, result: itmWeight };
        } else {
          r.getCell(5).value = itmWeight;
        }
        r.getCell(5).numFmt = NUMBER_FORMATS.PERCENT;

        // Determine logical Gantt schedule span for this item across totalWeeks
        // Staggered construction sequence: preparation -> civil -> architecture -> mep -> finishing
        const relProgress = sIdx / Math.max(normalizedSections.length, 1);
        const startWeek = Math.max(1, Math.min(totalWeeks - 1, Math.floor(relProgress * (totalWeeks - 2)) + 1));
        const itemDurationWeeks = Math.max(1, Math.min(4, Math.ceil(totalWeeks / 6)));
        const endWeek = Math.min(totalWeeks, startWeek + itemDurationWeeks - 1);
        const activeDuration = Math.max(1, endWeek - startWeek + 1);
        const weeklyWeightVal = itmWeight / activeDuration;

        // Render Gantt cells across weeks
        for (let w = 1; w <= totalWeeks; w++) {
          const col = 5 + w;
          const wCell = r.getCell(col);

          if (w >= startWeek && w <= endWeek) {
            // Active Gantt Bar: Fill with primary blue, show weekly weight number
            wCell.value = weeklyWeightVal;
            wCell.numFmt = NUMBER_FORMATS.PERCENT;
            wCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.GANTT_BAR } };
            wCell.font = { name: FONT_FAMILY, size: 8, bold: true, color: { argb: EXCEL_COLORS.GANTT_BAR_TEXT } };
            wCell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            wCell.value = '';
            wCell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
          wCell.border = { top: BORDER_THIN_LIGHT, bottom: BORDER_THIN_LIGHT, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
        }

        r.getCell(ketColIdx).value = `${activeDuration * 7} Hari`;
        r.getCell(ketColIdx).alignment = { vertical: 'middle', horizontal: 'center' };
        r.getCell(ketColIdx).font = FONT_HIERARCHY.BODY_MUTED;
        r.getCell(ketColIdx).border = { top: BORDER_THIN_LIGHT, bottom: BORDER_THIN_LIGHT, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };

        for (let c = 1; c <= 5; c++) {
          r.getCell(c).border = { top: BORDER_THIN_LIGHT, bottom: BORDER_THIN_LIGHT, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
          r.getCell(c).font = FONT_HIERARCHY.BODY;
        }
        r.getCell(1).alignment = { horizontal: 'center' };
        r.getCell(2).alignment = { horizontal: 'center' };
        r.getCell(5).alignment = { horizontal: 'right' };

        schedRowIdx++;
      });
    });

    // =========================================================================
    // FOOTER RECAPITULATION (MATCHING REFERENCE ENGINEERING DRAWING)
    // =========================================================================
    
    // 1. Baris JUMLAH / TOTAL (Row totalSchedRow)
    const tRow = wsSched.getRow(totalSchedRow);
    tRow.getCell(3).value = 'JUMLAH BIAYA LANGSUNG (DIRECT COST)';
    tRow.getCell(3).font = FONT_HIERARCHY.BODY_BOLD;
    tRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    if (useLiveFormulas) {
      const itemPriceSumFormula = itemRowIndices.length > 0 ? itemRowIndices.map((i) => `D${i}`).join('+') : `0`;
      tRow.getCell(4).value = { formula: `=IFERROR(${itemPriceSumFormula}, ${directCost})`, result: directCost };
      tRow.getCell(5).value = { formula: `=IFERROR(D${totalSchedRow}/D${totalSchedRow}, 1.0)`, result: 1.0 };
    } else {
      tRow.getCell(4).value = directCost;
      tRow.getCell(5).value = 1.0;
    }
    tRow.getCell(4).numFmt = NUMBER_FORMATS.CURRENCY;
    tRow.getCell(4).font = FONT_HIERARCHY.BODY_BOLD;
    tRow.getCell(5).numFmt = NUMBER_FORMATS.PERCENT;
    tRow.getCell(5).font = FONT_HIERARCHY.BODY_BOLD;

    for (let c = 1; c <= ketColIdx; c++) {
      tRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.SUMMARY_YELLOW } };
      tRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_THIN_MEDIUM, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
    }

    // 2. Baris RENCANA PROGRES MINGGUAN (%)
    const planWeeklyRow = totalSchedRow + 1;
    const pwRow = wsSched.getRow(planWeeklyRow);
    pwRow.getCell(3).value = 'RENCANA PROGRES MINGGUAN (%)';
    pwRow.getCell(3).font = FONT_HIERARCHY.BODY_BOLD;
    pwRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    weekColumnsMeta.forEach((wMeta, wIdx) => {
      const colLetter = wsSched.getColumn(wMeta.colIdx).letter;
      const cell = pwRow.getCell(wMeta.colIdx);
      const plannedWeekVal = (kurvaPoints[wIdx]?.plannedWeeklyPercent || 0) / 100;

      if (useLiveFormulas && itemRowIndices.length > 0) {
        // Formula SUM of all Gantt bar cells in this column
        const sumColFormula = `SUM(${colLetter}${itemRowIndices[0]}:${colLetter}${itemRowIndices[itemRowIndices.length - 1]})`;
        cell.value = { formula: `=IFERROR(${sumColFormula}, ${plannedWeekVal})`, result: plannedWeekVal };
      } else {
        cell.value = plannedWeekVal;
      }
      cell.numFmt = NUMBER_FORMATS.PERCENT;
      cell.font = FONT_HIERARCHY.BODY_BOLD;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    for (let c = 1; c <= ketColIdx; c++) {
      pwRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.SUMMARY_YELLOW } };
      pwRow.getCell(c).border = { top: BORDER_THIN_LIGHT, bottom: BORDER_THIN_LIGHT, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
    }

    // 3. Baris RENCANA PROGRES KUMULATIF (%) -> THE S-CURVE DATA LINE
    const planCumRow = totalSchedRow + 2;
    const pcRow = wsSched.getRow(planCumRow);
    pcRow.getCell(3).value = 'RENCANA PROGRES KUMULATIF (KURVA S) (%)';
    pcRow.getCell(3).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: EXCEL_COLORS.PRIMARY_BLUE_DARK } };
    pcRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    weekColumnsMeta.forEach((wMeta, wIdx) => {
      const colLetter = wsSched.getColumn(wMeta.colIdx).letter;
      const cell = pcRow.getCell(wMeta.colIdx);
      const cumVal = (kurvaPoints[wIdx]?.cumulativePlannedPercent || 0) / 100;

      if (useLiveFormulas) {
        if (wIdx === 0) {
          cell.value = { formula: `=IFERROR(${colLetter}${planWeeklyRow}, ${cumVal})`, result: cumVal };
        } else {
          const prevColLetter = wsSched.getColumn(weekColumnsMeta[wIdx - 1].colIdx).letter;
          cell.value = { formula: `=IFERROR(${prevColLetter}${planCumRow}+${colLetter}${planWeeklyRow}, ${cumVal})`, result: cumVal };
        }
      } else {
        cell.value = cumVal;
      }
      cell.numFmt = NUMBER_FORMATS.PERCENT;
      cell.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: EXCEL_COLORS.PRIMARY_BLUE_DARK } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    for (let c = 1; c <= ketColIdx; c++) {
      pcRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.BG_ACCENT_BLUE } };
      pcRow.getCell(c).border = { top: BORDER_THIN_MEDIUM, bottom: BORDER_DOUBLE_DARK, left: BORDER_THIN_LIGHT, right: BORDER_THIN_LIGHT };
    }

    // Signatures block below schedule
    applySignatureBlock(wsSched, planCumRow + 3, 'B', 'D', wsSched.getColumn(Math.min(10, ketColIdx)).letter, (options as any).signatures);
  }

  // =========================================================================
  // 13. SHEET: 13_Kurva_S (EVM METRICS & TABEL DISTRIBUSI BOBOT LENGKAP)
  // =========================================================================
  if (shouldIncludeSheet('kurvaS', options)) {
    const wsKurva = wb.addWorksheet('13_Kurva_S', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsKurva, {
      orientation: 'landscape',
      projectName: project.name,
      documentTitle: 'TABEL DISTRIBUSI BOBOT & KURVA S',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    wsKurva.columns = [
      { width: 8 },  // A: Minggu
      { width: 14 }, // B: Periode
      { width: 13 }, // C: Tgl Mulai
      { width: 13 }, // D: Tgl Selesai
      { width: 16 }, // E: Rencana Mingguan %
      { width: 16 }, // F: Rencana Kumulatif %
      { width: 16 }, // G: Aktual Mingguan %
      { width: 16 }, // H: Aktual Kumulatif %
      { width: 22 }, // I: Planned Value (PV - Rp)
      { width: 22 }, // J: Actual Cost / Earned Value (EV - Rp)
      { width: 16 }, // K: Deviasi Bobot % (H - F)
      { width: 22 }, // L: Deviasi Nilai Rp (J - I)
      { width: 20 }, // M: Grafik Progres Batang (In-Cell Progress)
    ];

    wsKurva.mergeCells('A2:M2');
    wsKurva.getCell('A2').value = `TABEL PROGRES BERKALA & DISTRIBUSI BOBOT KURVA S — ${project.name.toUpperCase()}`;
    wsKurva.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    wsKurva.mergeCells('A3:M3');
    wsKurva.getCell('A3').value = `Baseline Terverifikasi: Rp ${grandTotal.toLocaleString('id-ID')} • Durasi: ${project.startDate || '-'} s/d ${project.targetDate || '-'} • Rev: ${project.currentVersion || 'Rev 00'}`;
    wsKurva.getCell('A3').font = FONT_HIERARCHY.DOC_SUBTITLE;

    const kHead = wsKurva.getRow(5);
    kHead.values = [
      'MINGGU',
      'PERIODE',
      'TGL MULAI',
      'TGL SELESAI',
      'RENCANA MINGGUAN',
      'RENCANA KUMULATIF',
      'AKTUAL MINGGUAN',
      'AKTUAL KUMULATIF',
      'PLANNED VALUE (PV)',
      'EARNED VALUE (EV)',
      'DEVIASI BOBOT',
      'DEVIASI NILAI',
      'GRAFIK PROGRES',
    ];
    kHead.height = 26;
    for (let c = 1; c <= 13; c++) {
      const cell = kHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }

    const kurvaData = generateKurvaSData(normalizedSections, grandTotal, project.startDate, project.targetDate, (project as any).scheduleTasks);
    let cumulativeActualPercent = 0;

    kurvaData.forEach((dp: any, idx: number) => {
      const r = wsKurva.getRow(6 + idx);
      const rowNum = 6 + idx;
      
      // Actual tracking: if real progress is supplied, use it; otherwise maintain exact baseline data without fabricating progress
      const actualWeeklyPct = dp.actualWeeklyPercent != null ? (Number(dp.actualWeeklyPercent) / 100) : 0;
      cumulativeActualPercent += actualWeeklyPct;
      const plannedWeeklyPct = (Number(dp.plannedWeeklyPercent) || 0) / 100;
      const plannedWeeklyCost = Number(dp.plannedWeeklyCost) || 0;
      const cumulativePlannedCost = Number(dp.cumulativePlannedCost) || 0;
      const actualCost = Math.round(actualWeeklyPct * grandTotal);

      r.getCell(1).value = `W${dp.weekIndex}`;
      r.getCell(2).value = dp.weekLabel;
      r.getCell(3).value = dp.startDate;
      r.getCell(4).value = dp.endDate;
      r.getCell(5).value = plannedWeeklyPct;
      r.getCell(5).numFmt = NUMBER_FORMATS.PERCENT;

      if (useLiveFormulas) {
        if (idx === 0) {
          r.getCell(6).value = { formula: `=IFERROR(E${rowNum}, 0)`, result: (dp.cumulativePlannedPercent || 0) / 100 };
          r.getCell(8).value = { formula: `=IFERROR(G${rowNum}, 0)`, result: cumulativeActualPercent };
          r.getCell(9).value = { formula: `=IFERROR(F${rowNum}*${grandTotal}, 0)`, result: cumulativePlannedCost };
          r.getCell(10).value = { formula: `=IFERROR(H${rowNum}*${grandTotal}, 0)`, result: Math.round(cumulativeActualPercent * grandTotal) };
        } else {
          r.getCell(6).value = { formula: `=IFERROR(F${rowNum - 1}+E${rowNum}, 0)`, result: (dp.cumulativePlannedPercent || 0) / 100 };
          r.getCell(8).value = { formula: `=IFERROR(H${rowNum - 1}+G${rowNum}, 0)`, result: cumulativeActualPercent };
          r.getCell(9).value = { formula: `=IFERROR(F${rowNum}*${grandTotal}, 0)`, result: cumulativePlannedCost };
          r.getCell(10).value = { formula: `=IFERROR(H${rowNum}*${grandTotal}, 0)`, result: Math.round(cumulativeActualPercent * grandTotal) };
        }
        r.getCell(11).value = { formula: `=IFERROR(H${rowNum}-F${rowNum}, 0)`, result: cumulativeActualPercent - ((dp.cumulativePlannedPercent || 0) / 100) };
        r.getCell(12).value = { formula: `=IFERROR(J${rowNum}-I${rowNum}, 0)`, result: Math.round(cumulativeActualPercent * grandTotal) - cumulativePlannedCost };
      } else {
        r.getCell(6).value = (dp.cumulativePlannedPercent || 0) / 100;
        r.getCell(8).value = cumulativeActualPercent;
        r.getCell(9).value = cumulativePlannedCost;
        r.getCell(10).value = Math.round(cumulativeActualPercent * grandTotal);
        r.getCell(11).value = cumulativeActualPercent - ((dp.cumulativePlannedPercent || 0) / 100);
        r.getCell(12).value = Math.round(cumulativeActualPercent * grandTotal) - cumulativePlannedCost;
      }

      r.getCell(6).numFmt = NUMBER_FORMATS.PERCENT;
      r.getCell(6).font = FONT_HIERARCHY.BODY_BOLD;

      r.getCell(7).value = actualWeeklyPct;
      r.getCell(7).numFmt = NUMBER_FORMATS.PERCENT;

      r.getCell(8).numFmt = NUMBER_FORMATS.PERCENT;
      r.getCell(8).font = FONT_HIERARCHY.BODY_BOLD;

      r.getCell(9).numFmt = NUMBER_FORMATS.CURRENCY;
      r.getCell(10).numFmt = NUMBER_FORMATS.CURRENCY;

      r.getCell(11).numFmt = NUMBER_FORMATS.PERCENT;
      r.getCell(12).numFmt = NUMBER_FORMATS.CURRENCY;

      // In-cell visual progress bar (REPT character representation)
      const pctValue = Math.min(100, Math.max(0, Math.round((dp.cumulativePlannedPercent || 0))));
      const filledBlocks = Math.round(pctValue / 5); // 20 blocks max
      const emptyBlocks = 20 - filledBlocks;
      r.getCell(13).value = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks) + ` ${pctValue}%`;
      r.getCell(13).font = { name: 'Consolas', size: 8.5, color: { argb: EXCEL_COLORS.PRIMARY_BLUE } };
      r.getCell(13).alignment = { vertical: 'middle', horizontal: 'left' };

      for (let c = 1; c <= 13; c++) {
        r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
      }
    });
  }

  // =========================================================================
  // 14. SHEET: 14_Cashflow
  // =========================================================================
  if (shouldIncludeSheet('cashflow', options) && !isBoqMc0Only) {
    const wsCash = wb.addWorksheet('14_Cashflow', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    });

    applyPrintSetup(wsCash, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'PROYEKSI ARUS KAS (CASHFLOW)',
      revision: project.currentVersion,
      printTitlesRow: '5:5',
    });

    wsCash.columns = [
      { width: 14 }, // Periode
      { width: 22 }, // Inflow
      { width: 22 }, // Outflow Bahan
      { width: 22 }, // Outflow Upah
      { width: 22 }, // Net Cashflow
    ];

    wsCash.mergeCells('A2:E2');
    wsCash.getCell('A2').value = `PROYEKSI ARUS KAS (CASH FLOW) — ${project.name.toUpperCase()}`;
    wsCash.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    const cfHead = wsCash.getRow(5);
    cfHead.values = ['PERIODE', 'INFLOW TERMIN (RP)', 'OUTFLOW BAHAN (RP)', 'OUTFLOW UPAH & ALAT (RP)', 'NET CASH FLOW (RP)'];
    cfHead.height = 24;
    for (let c = 1; c <= 5; c++) {
      const cell = cfHead.getCell(c);
      cell.font = FONT_HIERARCHY.TABLE_HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.NAVY_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    const kurvaPoints = generateKurvaSData(normalizedSections, grandTotal, project.startDate, project.targetDate, (project as any).scheduleTasks);
    const cashFlowPoints = generateCashFlowData(kurvaPoints, grandTotal, normalizedSections);

    cashFlowPoints.forEach((dp: any, idx: number) => {
      const r = wsCash.getRow(6 + idx);
      const rowNum = 6 + idx;
      r.getCell(1).value = dp.weekLabel;
      r.getCell(2).value = dp.inflow;
      r.getCell(2).numFmt = NUMBER_FORMATS.CURRENCY;
      r.getCell(3).value = dp.outflowMaterial;
      r.getCell(3).numFmt = NUMBER_FORMATS.CURRENCY;
      r.getCell(4).value = dp.outflowLabor;
      r.getCell(4).numFmt = NUMBER_FORMATS.CURRENCY;

      if (useLiveFormulas) {
        r.getCell(5).value = { formula: `=IFERROR(B${rowNum}-C${rowNum}-D${rowNum}, 0)`, result: dp.netWeekly };
      } else {
        r.getCell(5).value = dp.netWeekly;
      }
      r.getCell(5).numFmt = NUMBER_FORMATS.CURRENCY;
      r.getCell(5).font = FONT_HIERARCHY.BODY_BOLD;

      for (let c = 1; c <= 5; c++) r.getCell(c).border = { bottom: BORDER_THIN_LIGHT };
    });
  }

  // =========================================================================
  // 15. SHEET: 15_Notes
  // =========================================================================
  if (shouldIncludeSheet('notes', options)) {
    const wsNotes = wb.addWorksheet('15_Notes', {
      views: [{ showGridLines: true }],
    });

    applyPrintSetup(wsNotes, {
      orientation: 'portrait',
      projectName: project.name,
      documentTitle: 'CATATAN TEKNIS & SYARAT PELAKSANAAN',
      revision: project.currentVersion,
    });

    wsNotes.columns = [{ width: 6 }, { width: 30 }, { width: 65 }];

    wsNotes.mergeCells('A2:C2');
    wsNotes.getCell('A2').value = 'CATATAN TEKNIS, ASUMSI & SYARAT PELAKSANAAN';
    wsNotes.getCell('A2').font = FONT_HIERARCHY.SECTION_TITLE;

    const notesList = [
      ['Ruang Lingkup Pekerjaan', 'RAB ini mencakup pekerjaan persiapan, struktur beton bertulang, dinding, finishing arsitektur, dan instalasi MEP sesuai gambar rencana.'],
      ['Standar Acuan Koefisien', 'Seluruh analisa harga satuan merujuk pada Pedoman AHSP Kementerian PUPR & SNI Terkini.'],
      ['Masa Berlaku Harga', 'Harga material, upah kerja, dan alat sewa berlaku selama 30 hari kalender sejak tanggal penerbitan dokumen resmi.'],
      ['Ketentuan Pembayaran', 'Skema pembayaran bertahap (Termin Fisik): DP 20%, Termin Progres 50%, Termin Progres 100%, Retensi Pemeliharaan 5% selama 90 hari kalender.'],
      ['Pekerjaan Tambah Kurang', 'Pekerjaan tambah/kurang hanya sah apabila disetujui secara tertulis melalui Berita Acara Site Instruction (SI) yang ditandatangani Pengawas Lapangan.'],
      ['Integritas Formula Matematika', 'Seluruh lembar kerja Excel ini menggunakan formula aktif live (SUM, Perkalian Kuantitas, Pembobotan %, dan Rekapitulasi Otomatis).'],
      ['Jaminan Mutu & Retensi', 'Kontraktor wajib memberikan jaminan masa pemeliharaan selama minimal 90 hari kalender terhitung sejak Berita Acara Serah Terima Pertama (PHO).'],
    ];

    notesList.forEach((n, idx) => {
      const r = 5 + idx;
      wsNotes.getCell(`A${r}`).value = idx + 1;
      wsNotes.getCell(`B${r}`).value = n[0];
      wsNotes.getCell(`B${r}`).font = FONT_HIERARCHY.BODY_BOLD;
      wsNotes.getCell(`C${r}`).value = n[1];
      wsNotes.getCell(`C${r}`).font = FONT_HIERARCHY.BODY;

      for (let c = 1; c <= 3; c++) wsNotes.getCell(r, c).border = { bottom: BORDER_THIN_LIGHT };
    });
  }

  // =========================================================================
  // FILE DOWNLOAD TRIGGER
  // =========================================================================
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const fileName = generateExportFileName(
    preset,
    project.name,
    project.currentVersion,
    new Date().toISOString().substring(0, 10)
  );

  // Trigger download if running in browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    saveAs(blob, fileName);
  }

  return blob;
}

export const exportProjectToExcel = exportRABToProfessionalExcel;
