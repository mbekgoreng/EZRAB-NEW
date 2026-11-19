import * as XLSX from 'xlsx';
import { RabItem, VolumeSourceType, type PriceStatus } from '../types';
import { SafeDecimalEngine } from './safeDecimalEngine';
import { honestVolume } from './honestVolume';

export interface ColumnMappingConfig {
  noCol: number | null;
  codeCol: number | null;
  descriptionCol: number | null;
  volumeCol: number | null;
  unitCol: number | null;
  unitPriceCol: number | null;
  amountCol: number | null;
  categoryCol: number | null;
}

export interface DetectedSheetInfo {
  name: string;
  rowCount: number;
  colCount: number;
  sampleData: any[][];
}

export interface ValidationAnomaly {
  rowNumber: number;
  type: 'MISSING_PRICE' | 'MISSING_VOLUME' | 'MISSING_UNIT' | 'MISSING_DESCRIPTION' | 'INVALID_UNIT' | 'DUPLICATE_CODE' | 'FORMULA_ERROR' | 'MATH_MISMATCH' | 'SUSPECTED_TOTAL';
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  rawValue?: any;
}

export interface ParsedRabRow {
  rowNumber: number;
  isGroupHeader: boolean;
  isSubtotalOrTotal: boolean;
  isMetadataOrBlank: boolean;
  groupName?: string;
  /** Kode dari file apa adanya; '' bila sel/kolom kode kosong (T20: tidak
   *  pernah dikarang — kode karangan `ITEM.N` ikut terhitung sebagai
   *  referensi AHSP karena mengandung '.'). */
  code: string;
  description: string;
  /**
   * T20 (Gelombang 2) — KEJUJURAN NILAI: null = TIDAK DIKETAHUI dari file
   * (sel kosong / kolom tidak terpetakan / tidak dapat dibaca sebagai
   * angka), BUKAN 0 dan BUKAN angka karangan. Sebelumnya volume kosong
   * menjadi 1, satuan kosong menjadi 'ls', dan jumlah dihitung dari
   * volume karangan itu — total impor ikut terfabrikasi. Nilai 0
   * EKSPLISIT dari file tetap 0 (nilai file, bukan kekosongan) dan tetap
   * dianomalikan.
   */
  volume: number | null;
  /** Satuan ternormalisasi; '' bila tidak diketahui dari file (bukan 'ls'). */
  unit: string;
  /** null = harga satuan tidak diketahui dari file (bukan Rp0 yang valid). */
  unitPrice: number | null;
  /** Jumlah dari file bila ada; bila tidak, hasil hitung volume × harga
   *  bila keduanya diketahui; null bila tidak dapat ditentukan. */
  amount: number | null;
  /** volume × unitPrice bila keduanya > 0; null bila salah satunya tidak
   *  diketahui/tidak valid. */
  calculatedAmount: number | null;
  anomalies: ValidationAnomaly[];
  rawRow: any[];
}

export interface ExcelAnalysisResult {
  sheetNames: string[];
  selectedSheet: string;
  detectedHeaderRowIndex: number;
  columnHeaders: string[];
  suggestedMapping: ColumnMappingConfig;
  mappingConfidence: Record<keyof ColumnMappingConfig, number>;
  totalRows: number;
  detectedGroupsCount: number;
  detectedWorkItemsCount: number;
  detectedAhspReferencesCount: number;
  detectedResourcesCount: number;
  parsedRows: ParsedRabRow[];
  validItems: ParsedRabRow[];
  groupHeaders: ParsedRabRow[];
  subtotalRows: ParsedRabRow[];
  skippedRows: ParsedRabRow[];
  allAnomalies: ValidationAnomaly[];
}

/**
 * T20 (Gelombang 2) — Draf item impor: satu-satunya pemetaan
 * ParsedRabRow → item yang diserahkan ke spreadsheet (dipakai
 * IntelligentExcelImportModal.handleExecuteImport).
 *
 * Batas numerik hilir (RabItem.volume / WorkItem numerik) tidak bisa
 * null, jadi volume yang tidak diketahui menjadi 0 lewat honestVolume
 * (pola Fase 4A) — tetapi HARGA memakai null + priceStatus eksplisit:
 * RabItem mendukung `unitPrice: number | null` ("null = harga belum
 * tersedia, bukan Rp0") dan factory menghormati priceStatus eksplisit.
 * Tanpa status eksplisit, resolvePriceStatus(0) = PRICE_RESOLVED —
 * harga yang hilang akan mendarat sebagai harga Rp0 yang "resolved".
 */
export interface ImportItemDraft {
  code: string;
  description: string;
  category: string;
  /** 0 bila volume tidak diketahui (batas numerik hilir; honestVolume). */
  volume: number;
  /** '' bila satuan tidak diketahui (bukan 'ls'). */
  unit: string;
  /** null = harga belum ditentukan (bukan Rp0 yang valid). */
  unitPrice: number | null;
  /** null = jumlah tidak dapat dihitung dari file. */
  amount: number | null;
  totalPrice: number | null;
  priceStatus: PriceStatus;
  volumeSource: VolumeSourceType;
  notes?: string;
}

// -----------------------------------------------------------------------------
// STANDARD INDONESIAN UNITS MAPPER & NORMALIZER
// -----------------------------------------------------------------------------
const STANDARD_INDONESIAN_UNITS: Record<string, string> = {
  m3: 'm³',
  'm^3': 'm³',
  meter3: 'm³',
  m2: 'm²',
  'm^2': 'm²',
  meter2: 'm²',
  m1: "m'",
  "m'": "m'",
  m: "m'",
  meter: "m'",
  mtr: "m'",
  kg: 'kg',
  kgm: 'kg',
  kilogram: 'kg',
  ton: 'ton',
  bh: 'bh',
  buah: 'bh',
  pcs: 'bh',
  pc: 'bh',
  unit: 'unit',
  set: 'set',
  ls: 'ls',
  lump: 'ls',
  sum: 'ls',
  lumpsum: 'ls',
  oh: 'OH',
  hkr: 'OH',
  hari: 'OH',
  org: 'OH',
  jam: 'jam',
  btg: 'btg',
  batang: 'btg',
  lbr: 'lbr',
  lembar: 'lbr',
  sak: 'sak',
  zak: 'sak',
  titik: 'ttk',
  ttk: 'ttk',
  roll: 'roll',
  rol: 'roll',
};

export const normalizeIndonesianUnit = (rawUnit: string): { unit: string; isValid: boolean } => {
  // T20: satuan kosong = TIDAK DIKETAHUI ('', bukan 'ls') — 'ls' adalah
  // satuan yang mengklaim "lumpsum" dan tidak boleh muncul dari sel kosong.
  if (!rawUnit) return { unit: '', isValid: false };
  const clean = rawUnit.toString().trim().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');
  if (STANDARD_INDONESIAN_UNITS[clean]) {
    return { unit: STANDARD_INDONESIAN_UNITS[clean], isValid: true };
  }
  return { unit: rawUnit.toString().trim(), isValid: false };
};

// -----------------------------------------------------------------------------
// EXCEL WORKBOOK ANALYZER & PARSER
// -----------------------------------------------------------------------------
export class ExcelImportEngine {
  /**
   * Reads an ArrayBuffer / File and extracts workbook structure
   */
  public static readWorkbook(data: ArrayBuffer): XLSX.WorkBook {
    return XLSX.read(data, {
      type: 'array',
      cellDates: true,
      cellStyles: true,
      cellNF: true,
    });
  }

  /**
   * Analyzes a specific sheet in a workbook
   */
  public static analyzeSheet(
    workbook: XLSX.WorkBook,
    sheetName?: string,
    forcedHeaderRowIndex?: number,
    customMapping?: Partial<ColumnMappingConfig>
  ): ExcelAnalysisResult {
    const sheetNames = workbook.SheetNames;
    const targetSheetName = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
    const worksheet = workbook.Sheets[targetSheetName];

    if (!worksheet) {
      throw new Error(`Sheet "${targetSheetName}" tidak ditemukan dalam file.`);
    }

    // Convert sheet to 2D array of rows
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    });

    const totalRows = rawMatrix.length;

    // 1. Detect Header Row
    const headerRowIndex =
      forcedHeaderRowIndex !== undefined && forcedHeaderRowIndex >= 0
        ? forcedHeaderRowIndex
        : this.detectHeaderRow(rawMatrix);

    const columnHeaders = (rawMatrix[headerRowIndex] || []).map((c) =>
      c !== undefined && c !== null ? c.toString().trim() : ''
    );

    // 2. Suggest Column Mapping
    const { mapping: suggestedMapping, confidence: mappingConfidence } = this.detectColumnMapping(columnHeaders);
    const finalMapping: ColumnMappingConfig = {
      ...suggestedMapping,
      ...(customMapping || {}),
    };

    // 3. Parse Data Rows
    const dataRows = rawMatrix.slice(headerRowIndex + 1);
    const parsedRows: ParsedRabRow[] = [];
    const allAnomalies: ValidationAnomaly[] = [];

    let currentGroupName = '01. PEKERJAAN PERSIAPAN';
    const seenCodes = new Map<string, number>();

    dataRows.forEach((row, rIdx) => {
      const actualRowNumber = headerRowIndex + 2 + rIdx;

      // Extract raw cell values based on mapping
      const rawNo = finalMapping.noCol !== null ? row[finalMapping.noCol] : '';
      const rawCode = finalMapping.codeCol !== null ? row[finalMapping.codeCol] : '';
      const rawDesc = finalMapping.descriptionCol !== null ? row[finalMapping.descriptionCol] : '';
      const rawVol = finalMapping.volumeCol !== null ? row[finalMapping.volumeCol] : '';
      const rawUnit = finalMapping.unitCol !== null ? row[finalMapping.unitCol] : '';
      const rawPrice = finalMapping.unitPriceCol !== null ? row[finalMapping.unitPriceCol] : '';
      const rawAmount = finalMapping.amountCol !== null ? row[finalMapping.amountCol] : '';

      const descStr = (rawDesc || '').toString().trim();
      const codeStr = (rawCode || '').toString().trim();
      const noStr = (rawNo || '').toString().trim();

      // Check if blank row
      const isBlank = row.every((c) => c === undefined || c === null || c.toString().trim() === '');
      if (isBlank) {
        parsedRows.push({
          rowNumber: actualRowNumber,
          isGroupHeader: false,
          isSubtotalOrTotal: false,
          isMetadataOrBlank: true,
          code: '',
          description: '(Baris Kosong)',
          volume: null,
          unit: '',
          unitPrice: null,
          amount: null,
          calculatedAmount: null,
          anomalies: [],
          rawRow: row,
        });
        return;
      }

      // Check if Subtotal or Grand Total Row
      const isSubtotalOrTotal = this.isTotalOrSubtotalRow(descStr, codeStr, noStr);

      // Check if Group / Section Header
      const isGroupHeader = this.isGroupHeaderRow(descStr, codeStr, noStr, rawVol, rawPrice, isSubtotalOrTotal);

      if (isGroupHeader) {
        currentGroupName = descStr || `GRUP ${noStr || codeStr}`;
        parsedRows.push({
          rowNumber: actualRowNumber,
          isGroupHeader: true,
          isSubtotalOrTotal: false,
          isMetadataOrBlank: false,
          groupName: currentGroupName,
          code: codeStr,
          description: descStr,
          volume: null,
          unit: '',
          unitPrice: null,
          amount: null,
          calculatedAmount: null,
          anomalies: [],
          rawRow: row,
        });
        return;
      }

      if (isSubtotalOrTotal) {
        parsedRows.push({
          rowNumber: actualRowNumber,
          isGroupHeader: false,
          isSubtotalOrTotal: true,
          isMetadataOrBlank: false,
          groupName: currentGroupName,
          code: codeStr,
          description: descStr,
          volume: null,
          unit: '',
          unitPrice: null,
          amount: this.parseNumericOrNull(rawAmount),
          calculatedAmount: null,
          anomalies: [
            {
              rowNumber: actualRowNumber,
              type: 'SUSPECTED_TOTAL',
              severity: 'info',
              message: 'Baris subtotal/total dilewati agar tidak terhitung ganda sebagai item pekerjaan.',
            },
          ],
          rawRow: row,
        });
        return;
      }

      // Parse Regular Work Item Row (T20: nilai yang tidak diketahui dari
      // file tetap null — tidak pernah diisi angka karangan).
      const volume = this.parseNumericOrNull(rawVol);
      const unitPrice = this.parseNumericOrNull(rawPrice);
      const fileAmount = this.parseNumericOrNull(rawAmount);
      // Jumlah terhitung hanya bila KEDUANYA diketahui & positif; bila salah
      // satu kosong/tidak valid, total baris ini TIDAK DAPAT dihitung (null)
      // — bukan 0 dan bukan hasil kali volume karangan.
      const calculatedAmount =
        volume != null && volume > 0 && unitPrice != null && unitPrice > 0
          ? Math.round(volume * unitPrice)
          : null;
      const amount = fileAmount ?? calculatedAmount;
      const { unit: normUnit, isValid: isUnitValid } = normalizeIndonesianUnit(rawUnit);

      const rowAnomalies: ValidationAnomaly[] = [];

      // Anomaly: Missing description
      if (!descStr) {
        rowAnomalies.push({
          rowNumber: actualRowNumber,
          type: 'MISSING_DESCRIPTION',
          severity: 'error',
          message: 'Uraian pekerjaan kosong.',
          field: 'description',
        });
      }

      // Anomaly: Missing volume (null = sel/kolom kosong atau tak terbaca)
      if ((volume == null || volume <= 0) && descStr) {
        rowAnomalies.push({
          rowNumber: actualRowNumber,
          type: 'MISSING_VOLUME',
          severity: 'warning',
          message: volume == null
            ? 'Volume pekerjaan belum terisi di file — dibiarkan kosong (tidak diisi otomatis).'
            : 'Volume pekerjaan 0 atau tidak valid.',
          field: 'volume',
          rawValue: rawVol,
        });
      }

      // Anomaly: Missing unit price (null = sel/kolom kosong atau tak terbaca)
      if ((unitPrice == null || unitPrice <= 0) && descStr) {
        rowAnomalies.push({
          rowNumber: actualRowNumber,
          type: 'MISSING_PRICE',
          severity: 'warning',
          message: unitPrice == null
            ? 'Harga satuan belum terisi di file — harga dibiarkan belum ditentukan (bukan Rp 0).'
            : 'Harga satuan pekerjaan Rp 0 atau tidak valid.',
          field: 'unitPrice',
          rawValue: rawPrice,
        });
      }

      // Anomaly: Missing unit (sel/kolom satuan kosong — bukan 'ls')
      if (!rawUnit || rawUnit.toString().trim() === '') {
        rowAnomalies.push({
          rowNumber: actualRowNumber,
          type: 'MISSING_UNIT',
          severity: 'warning',
          message: 'Satuan belum terisi di file — dibiarkan kosong (bukan "ls").',
          field: 'unit',
          rawValue: rawUnit,
        });
      } else if (!isUnitValid) {
        // Anomaly: Invalid unit — dipakai apa adanya dari file (tidak ada
        // normalisasi karangan; pesan lama "otomatis dinormalisasi" salah).
        rowAnomalies.push({
          rowNumber: actualRowNumber,
          type: 'INVALID_UNIT',
          severity: 'info',
          message: `Satuan "${rawUnit}" tidak dikenali — dipakai apa adanya dari file.`,
          field: 'unit',
          rawValue: rawUnit,
        });
      }

      // Anomaly: Formula Error in Excel cells
      const rowStrings = row.map((c) => (c || '').toString());
      const hasFormulaError = rowStrings.some((s) =>
        s.includes('#REF!') || s.includes('#VALUE!') || s.includes('#DIV/0!') || s.includes('#N/A')
      );
      if (hasFormulaError) {
        rowAnomalies.push({
          rowNumber: actualRowNumber,
          type: 'FORMULA_ERROR',
          severity: 'error',
          message: 'Terdeteksi formula error (#REF! / #VALUE!) pada baris Excel ini.',
        });
      }

      // Anomaly: Math mismatch between Excel amount and calculated (volume * price)
      // — hanya dapat dinilai bila KEDUANYA diketahui (jumlah file + hitung).
      if (fileAmount != null && calculatedAmount != null && Math.abs(fileAmount - calculatedAmount) > 100) {
        rowAnomalies.push({
          rowNumber: actualRowNumber,
          type: 'MATH_MISMATCH',
          severity: 'warning',
          message: `Selisih perhitungan total: Di file Rp ${fileAmount.toLocaleString('id-ID')} vs Kalkulasi Rp ${calculatedAmount.toLocaleString('id-ID')}`,
          field: 'amount',
        });
      }

      // Duplicate Code Check
      if (codeStr) {
        const count = seenCodes.get(codeStr) || 0;
        seenCodes.set(codeStr, count + 1);
        if (count > 0) {
          rowAnomalies.push({
            rowNumber: actualRowNumber,
            type: 'DUPLICATE_CODE',
            severity: 'info',
            message: `Kode AHSP/Item "${codeStr}" ditemukan lebih dari satu kali.`,
            field: 'code',
          });
        }
      }

      allAnomalies.push(...rowAnomalies);

      parsedRows.push({
        rowNumber: actualRowNumber,
        isGroupHeader: false,
        isSubtotalOrTotal: false,
        isMetadataOrBlank: false,
        groupName: currentGroupName,
        // T20: kode dibiarkan '' bila file tidak menyebutkannya. Kode
        // karangan `ITEM.N` ikut terhitung sebagai referensi AHSP (mengandung
        // '.') dan menggelembungkan metrik; kunci lokal ITEM.n hanya dibuat
        // di pemetaan impor (mapParsedRowsToImportItems), bukan klaim kode.
        code: codeStr,
        description: descStr,
        volume,
        unit: normUnit,
        unitPrice,
        amount,
        calculatedAmount,
        anomalies: rowAnomalies,
        rawRow: row,
      });
    });

    const validItems = parsedRows.filter((r) => !r.isGroupHeader && !r.isSubtotalOrTotal && !r.isMetadataOrBlank && r.description);
    const groupHeaders = parsedRows.filter((r) => r.isGroupHeader);
    const subtotalRows = parsedRows.filter((r) => r.isSubtotalOrTotal);
    const skippedRows = parsedRows.filter((r) => r.isMetadataOrBlank);

    // T20: kode kini murni dari file (tanpa ITEM.N karangan), jadi hitungan
    // ini hanya menghitung kode file yang berbentuk berkode ('.' — heuristik
    // lama, dipertahankan).
    const detectedAhspCount = validItems.filter((i) => i.code && i.code.includes('.')).length;
    // T20: mesin ini TIDAK mendeteksi sumber daya apa pun dari lembar RAB
    // datar — angka lama (jumlah item × 3) adalah estimasi karangan yang
    // disajikan sebagai hitungan terdeteksi. Nilai jujur = 0 sampai ada
    // pemetaan AHSP nyata yang menghitung komponen bahan/upah/alat.
    const detectedResourcesCount = 0;

    return {
      sheetNames,
      selectedSheet: targetSheetName,
      detectedHeaderRowIndex: headerRowIndex,
      columnHeaders,
      suggestedMapping: finalMapping,
      mappingConfidence,
      totalRows,
      detectedGroupsCount: groupHeaders.length || 1,
      detectedWorkItemsCount: validItems.length,
      detectedAhspReferencesCount: detectedAhspCount,
      detectedResourcesCount,
      parsedRows,
      validItems,
      groupHeaders,
      subtotalRows,
      skippedRows,
      allAnomalies,
    };
  }

  // ---------------------------------------------------------------------------
  // HEURISTIC HELPERS
  // ---------------------------------------------------------------------------
  private static detectHeaderRow(matrix: any[][]): number {
    let bestRowIdx = 0;
    let maxMatchScore = -1;

    const HEADER_KEYWORDS = [
      'no',
      'nomor',
      'kode',
      'ahsp',
      'uraian',
      'pekerjaan',
      'deskripsi',
      'volume',
      'vol',
      'satuan',
      'sat',
      'unit',
      'harga',
      'satuan',
      'hsp',
      'jumlah',
      'total',
      'subtotal',
    ];

    for (let r = 0; r < Math.min(matrix.length, 25); r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;

      let score = 0;
      row.forEach((cell) => {
        if (cell !== undefined && cell !== null) {
          const s = cell.toString().toLowerCase().trim();
          HEADER_KEYWORDS.forEach((kw) => {
            if (s === kw || s.includes(kw)) score += 1;
          });
        }
      });

      if (score > maxMatchScore) {
        maxMatchScore = score;
        bestRowIdx = r;
      }
    }

    return bestRowIdx;
  }

  private static detectColumnMapping(headers: string[]): {
    mapping: ColumnMappingConfig;
    confidence: Record<keyof ColumnMappingConfig, number>;
  } {
    const mapping: ColumnMappingConfig = {
      noCol: null,
      codeCol: null,
      descriptionCol: null,
      volumeCol: null,
      unitCol: null,
      unitPriceCol: null,
      amountCol: null,
      categoryCol: null,
    };

    const confidence: Record<keyof ColumnMappingConfig, number> = {
      noCol: 0,
      codeCol: 0,
      descriptionCol: 0,
      volumeCol: 0,
      unitCol: 0,
      unitPriceCol: 0,
      amountCol: 0,
      categoryCol: 0,
    };

    headers.forEach((h, colIdx) => {
      const lower = h.toLowerCase().trim();

      // 1. NO / NOMOR
      if (lower === 'no' || lower === 'no.' || lower === 'nomor' || lower === 'item no') {
        mapping.noCol = colIdx;
        confidence.noCol = 0.98;
      }

      // 2. KODE / KODE AHSP / ITEM CODE
      if (lower.includes('kode') || lower.includes('ahsp') || lower.includes('code') || lower === 'analisa') {
        if (!mapping.codeCol || lower.includes('ahsp')) {
          mapping.codeCol = colIdx;
          confidence.codeCol = 0.95;
        }
      }

      // 3. URAIAN / URAIAN PEKERJAAN / DESKRIPSI / NAMA PEKERJAAN
      if (lower.includes('uraian') || lower.includes('pekerjaan') || lower.includes('deskripsi') || lower.includes('item') || lower.includes('nama')) {
        if (!mapping.descriptionCol || lower.includes('uraian pekerjaan')) {
          mapping.descriptionCol = colIdx;
          confidence.descriptionCol = 0.99;
        }
      }

      // 4. VOLUME / VOL / QTY / KUANTITAS
      if (lower === 'vol' || lower === 'volume' || lower === 'qty' || lower === 'kuantitas' || lower.includes('volume')) {
        mapping.volumeCol = colIdx;
        confidence.volumeCol = 0.98;
      }

      // 5. SATUAN / SAT / UNIT
      if (lower === 'sat' || lower === 'sat.' || lower === 'satuan' || lower === 'unit') {
        mapping.unitCol = colIdx;
        confidence.unitCol = 0.97;
      }

      // 6. HARGA SATUAN / HARGA / UNIT PRICE / HSP / TARIF
      if ((lower.includes('harga') && lower.includes('satuan')) || lower === 'harga' || lower === 'hsp' || lower.includes('unit price') || lower === 'tarif') {
        mapping.unitPriceCol = colIdx;
        confidence.unitPriceCol = 0.96;
      }

      // 7. JUMLAH / TOTAL / JUMLAH HARGA / SUB TOTAL
      if (lower.includes('jumlah') || lower === 'total' || lower.includes('total harga') || lower.includes('sub total') || lower.includes('amount')) {
        if (!lower.includes('satuan')) {
          mapping.amountCol = colIdx;
          confidence.amountCol = 0.95;
        }
      }

      // 8. KATEGORI / GROUP / DIVISI
      if (lower.includes('kategori') || lower.includes('group') || lower.includes('divisi') || lower.includes('wbs')) {
        mapping.categoryCol = colIdx;
        confidence.categoryCol = 0.9;
      }
    });

    return { mapping, confidence };
  }

  private static isTotalOrSubtotalRow(desc: string, code: string, no: string): boolean {
    const combined = `${desc} ${code} ${no}`.toLowerCase();
    const TOTAL_KEYWORDS = [
      'sub total',
      'subtotal',
      'jumlah total',
      'jumlah harga',
      'total biaya',
      'rekapitulasi',
      'dibulatkan',
      'pajak ppn',
      'ppn 11%',
      'grand total',
      'total rab',
      'jumlah',
    ];
    return TOTAL_KEYWORDS.some((kw) => combined.includes(kw));
  }

  private static isGroupHeaderRow(
    desc: string,
    code: string,
    no: string,
    rawVol: any,
    rawPrice: any,
    isSubtotal: boolean
  ): boolean {
    if (isSubtotal || !desc) return false;

    // If volume and price are completely empty, and text is uppercase or has Roman/alphabetic numbering
    const hasVolumeOrPrice = this.parseNumeric(rawVol) > 0 || this.parseNumeric(rawPrice) > 0;
    if (hasVolumeOrPrice) return false;

    const trimmed = desc.trim();
    const isRoman = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)[\.\s]/i.test(trimmed) || /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/i.test(no.trim());
    const isAlphabeticGroup = /^[A-Z][\.\s]/i.test(trimmed) || /^[A-Z]$/i.test(no.trim());
    const isPekerjaanKeyword = trimmed.toUpperCase().startsWith('PEKERJAAN') || trimmed.toUpperCase().startsWith('DIVISI') || trimmed.toUpperCase().startsWith('BAGIAN');
    const isAllCaps = trimmed.length > 5 && trimmed === trimmed.toUpperCase() && !hasVolumeOrPrice;

    return isRoman || isAlphabeticGroup || isPekerjaanKeyword || isAllCaps;
  }

  /**
   * T20 — parse angka yang membedakan "tidak ada nilai" (null) dari
   * "nilai 0". Sel kosong / tidak terpetakan / teks yang bukan angka →
   * null (bukan 0): 0 adalah nilai file yang sah (mis. harga eksplisit
   * Rp0), sedangkan null berarti "tidak diketahui" dan wajib tetap null
   * sampai ke pratinjau/impor. Logika format Indonesia dipertahankan
   * persis (titik ribuan, koma desimal, awalan Rp/IDR).
   */
  private static parseNumericOrNull(val: any): number | null {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const str = val.toString().trim();
    if (str === '') return null;
    // Remove "Rp", "IDR", spaces, and parse Indonesian comma decimal if needed
    const cleanStr = str
      .replace(/Rp\.?/gi, '')
      .replace(/IDR/gi, '')
      .replace(/\s/g, '');
    if (cleanStr === '') return null;

    // Check if Indonesian format (e.g. "1.500.000,50" -> 1500000.50)
    if (cleanStr.includes('.') && cleanStr.includes(',')) {
      const normalized = cleanStr.replace(/\./g, '').replace(',', '.');
      const num = parseFloat(normalized);
      return isNaN(num) ? null : num;
    }

    // Check if just dots as thousands separator (e.g. "1.500.000")
    if (/^\d{1,3}(\.\d{3})+$/.test(cleanStr)) {
      const normalized = cleanStr.replace(/\./g, '');
      const num = parseFloat(normalized);
      return isNaN(num) ? null : num;
    }

    // Check if comma as decimal separator (e.g. "12,5")
    if (cleanStr.includes(',') && !cleanStr.includes('.')) {
      const normalized = cleanStr.replace(',', '.');
      const num = parseFloat(normalized);
      return isNaN(num) ? null : num;
    }

    const num = parseFloat(cleanStr);
    return isNaN(num) ? null : num;
  }

  /** parseNumeric lama (0 untuk kekosongan) — hanya untuk pemeriksaan
   *  boolean internal (mis. "apakah baris ini punya volume/harga" di
   *  isGroupHeaderRow), BUKAN untuk nilai yang disimpan/ditampilkan. */
  private static parseNumeric(val: any): number {
    return this.parseNumericOrNull(val) ?? 0;
  }

  /**
   * Generates a downloadable CSV text containing error/anomaly review information
   */
  public static generateErrorReviewCsv(analysis: ExcelAnalysisResult): string {
    const lines: string[] = ['Baris Excel,Tipe Anomali,Severity,Field,Uraian Pekerjaan,Pesan / Keterangan'];
    analysis.allAnomalies.forEach((a) => {
      const rowItem = analysis.parsedRows.find((r) => r.rowNumber === a.rowNumber);
      const desc = rowItem ? `"${rowItem.description.replace(/"/g, '""')}"` : '""';
      const msg = `"${a.message.replace(/"/g, '""')}"`;
      lines.push(`${a.rowNumber},${a.type},${a.severity},${a.field || '-'},${desc},${msg}`);
    });
    return lines.join('\r\n');
  }

  /**
   * T20 — petakan baris terurai menjadi draf item impor. Nilai yang tidak
   * diketahui dari file TIDAK PERNAH diisi angka karangan:
   *  - volume kosong/tidak valid → 0 (honestVolume, pola Fase 4A);
   *  - harga kosong/0/negatif → unitPrice null + PRICE_UNRESOLVED
   *    (bukan Rp0 yang "resolved" — resolvePriceStatus(0) adalah
   *    PRICE_RESOLVED, jadi status eksplisit wajib menyertai);
   *  - jumlah → angka file bila ada, bila tidak hasil hitung engine yang
   *    sudah divalidasi (null bila tak dapat dihitung);
   *  - kode kosong → kunci lokal `ITEM.n` (kunci tampilan/impor, BUKAN
   *    klaim kode AHSP — kode karangan tidak pernah masuk metrik AHSP).
   */
  public static mapParsedRowsToImportItems(rows: ParsedRabRow[]): ImportItemDraft[] {
    return rows.map((item, idx) => {
      const priceKnown = item.unitPrice != null && item.unitPrice > 0;
      return {
        code: item.code || `ITEM.${idx + 1}`,
        description: item.description,
        category: item.groupName || '01. PEKERJAAN PERSIAPAN',
        volume: honestVolume(item.volume),
        unit: item.unit,
        unitPrice: priceKnown ? item.unitPrice : null,
        amount: item.amount,
        totalPrice: item.amount,
        priceStatus: priceKnown ? 'PRICE_RESOLVED' : 'PRICE_UNRESOLVED',
        volumeSource: 'IMPORT' as VolumeSourceType,
        notes: item.anomalies.length > 0 ? `Import Warning: ${item.anomalies.map((a) => a.message).join('; ')}` : undefined,
      };
    });
  }

  /** T20 — total impor: HANYA jumlah yang diketahui dari file/hitung
   *  (null dikecualikan — total yang memuat baris tak-berjumlah adalah
   *  PARSIAL, bukan total lengkap). */
  public static sumImportTotal(items: ImportItemDraft[]): number {
    let total = 0;
    for (const it of items) {
      if (it.amount != null && Number.isFinite(it.amount)) total += it.amount;
    }
    return total;
  }
}
