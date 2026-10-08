/**
 * EZRAB AI Receipt & Invoice Intelligence Service (Phase 9)
 * 
 * Handles OCR extraction from supplier invoices, receipts, and purchase orders,
 * matching with EZRAB Master Price, and creating draft Expenses for Project Finance.
 * 
 * CORE PRINCIPLES:
 * - Extracts Supplier, Date, Invoice No, Items, Qty, Unit Price, Subtotal, Tax, and Total.
 * - Matches items against Master Price / Material Catalog with percentage comparison.
 * - Generates Draft Expense with category suggestion (Material, Upah, Alat, etc.).
 * - Human Confirmation Gate: ONLY writes to ProjectFinanceRepository upon user approval.
 * - Strict project-scoped persistence.
 */

import { ProjectFinanceRepository } from '../domain/finance/repository';
import { Expense, ExpenseCategory } from '../domain/finance/types';

export type ReceiptConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MasterPriceReferenceItem {
  id?: string;
  name: string;
  category: string;
  unit: string;
  price: number;
}

export interface MasterPriceMatch {
  masterItemName: string;
  masterPrice: number;
  extractedPrice: number;
  priceDifferencePercent: number; // e.g. +4.84 or -3.2
  matchQuality: 'HIGH' | 'MEDIUM' | 'NO_MATCH';
  insightText: string;
}

export interface ReceiptLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  categorySuggestion: ExpenseCategory;
  matchedMasterItem?: MasterPriceMatch;
  confidence: ReceiptConfidence;
}

export interface ReceiptOCRResult {
  id: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  scanDate: string;
  
  // Header Information
  supplierName: string;
  supplierAddress?: string;
  supplierPhone?: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxId?: string; // NPWP
  
  // Line Items & Master Price Matching
  lineItems: ReceiptLineItem[];
  
  // Financial Totals
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  
  // AI Confidence & Reasoning
  overallConfidence: ReceiptConfidence;
  confidenceNotes: string[];
  warnings: string[];
}

export interface ReceiptAnalysisRequest {
  projectId: string;
  fileData: ArrayBuffer | Blob | File | string;
  fileName: string;
  customSupplier?: string;
  customDate?: string;
  referenceMasterPrices?: MasterPriceReferenceItem[];
  /**
   * TEST-ONLY: explicitly allow the mock OCR fallback (used by unit tests).
   * NEVER set this in production UI code — when the OCR endpoint is
   * unavailable, analyzeReceipt must FAIL HONESTLY instead of fabricating
   * receipt data (P0 data-integrity fix, 2026-10-09).
   */
  __allowMockFallback?: boolean;
}

export interface ReceiptAnalysisResponse {
  success: boolean;
  result?: ReceiptOCRResult;
  error?: string;
}

export interface ExpenseDraftConfirmationPayload {
  projectId: string;
  ocrId: string;
  supplier: string;
  date: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
}

/**
 * Built-in Master Price benchmark catalog for common construction materials
 */
export const DEFAULT_MASTER_PRICE_CATALOG: MasterPriceReferenceItem[] = [
  { name: 'Semen Portland 50 kg', category: 'Material', unit: 'sak', price: 62000 },
  { name: 'Semen Mortar Plester 40 kg', category: 'Material', unit: 'sak', price: 78000 },
  { name: 'Bata Ringan Hebel 10 cm', category: 'Material', unit: 'm³', price: 650000 },
  { name: 'Pasir Pasang Extra', category: 'Material', unit: 'm³', price: 275000 },
  { name: 'Batu Belah 15/20', category: 'Material', unit: 'm³', price: 230000 },
  { name: 'Besi Beton Polos Dia 10mm SNI', category: 'Material', unit: 'btg', price: 72000 },
  { name: 'Besi Beton Ulir Dia 12mm SNI', category: 'Material', unit: 'btg', price: 110000 },
  { name: 'Kawat Bendrat Beton', category: 'Material', unit: 'kg', price: 22000 },
  { name: 'Cat Tembok Interior 20 kg', category: 'Material', unit: 'pail', price: 750000 },
  { name: 'Keramik Lantai 60x60 cm Polished', category: 'Material', unit: 'dus', price: 165000 },
  { name: 'Pipa PVC AW 3/4 inch', category: 'Material', unit: 'btg', price: 38000 },
  { name: 'Sewa Molen Beton per hari', category: 'Alat', unit: 'hari', price: 300000 },
  { name: 'Upah Tukang Batu per hari', category: 'Tenaga Kerja', unit: 'hari', price: 150000 },
];

/**
 * Matches an extracted description against Master Price benchmarks
 */
export function matchItemWithMasterPrice(
  description: string,
  unitPrice: number,
  masterCatalog: MasterPriceReferenceItem[] = DEFAULT_MASTER_PRICE_CATALOG
): MasterPriceMatch | undefined {
  const cleanDesc = description.toLowerCase();
  
  // Find closest matching material
  let bestMatch: MasterPriceReferenceItem | undefined;
  let highestScore = 0;

  for (const master of masterCatalog) {
    const masterKeywords = master.name.toLowerCase().split(/\s+/);
    let matchedKeywords = 0;

    for (const kw of masterKeywords) {
      if (kw.length >= 3 && cleanDesc.includes(kw)) {
        matchedKeywords++;
      }
    }

    const score = matchedKeywords / masterKeywords.length;
    if (score > highestScore && score >= 0.4) {
      highestScore = score;
      bestMatch = master;
    }
  }

  if (!bestMatch) {
    return undefined;
  }

  const diffPercent = Number((((unitPrice - bestMatch.price) / bestMatch.price) * 100).toFixed(2));
  const diffAbs = Math.abs(diffPercent);

  let matchQuality: MasterPriceMatch['matchQuality'] = 'LOW' as any;
  if (highestScore >= 0.8) matchQuality = 'HIGH';
  else if (highestScore >= 0.5) matchQuality = 'MEDIUM';

  let insightText = '';
  if (diffAbs <= 1.0) {
    insightText = `Harga nota sama dengan harga acuan Master Price (Rp ${bestMatch.price.toLocaleString('id-ID')}).`;
  } else if (diffPercent > 0) {
    insightText = `Harga nota Rp ${unitPrice.toLocaleString('id-ID')} berada sekitar ${diffPercent}% di atas harga acuan Master Price (Rp ${bestMatch.price.toLocaleString('id-ID')}).`;
  } else {
    insightText = `Harga nota Rp ${unitPrice.toLocaleString('id-ID')} berada sekitar ${Math.abs(diffPercent)}% di bawah harga acuan Master Price (Rp ${bestMatch.price.toLocaleString('id-ID')}).`;
  }

  return {
    masterItemName: bestMatch.name,
    masterPrice: bestMatch.price,
    extractedPrice: unitPrice,
    priceDifferencePercent: diffPercent,
    matchQuality,
    insightText,
  };
}

async function fileDataToBase64(data: ArrayBuffer | Blob | File | string): Promise<{ base64: string; mimeType: string }> {
  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      const parts = data.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      return { base64: parts[1] || data, mimeType: mime };
    }
    return { base64: data, mimeType: 'image/jpeg' };
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const mimeType = data.type || 'image/jpeg';
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const b64 = res.includes(',') ? res.split(',')[1] : res;
        resolve({ base64: b64, mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(data);
    });
  }
  if (typeof Buffer !== 'undefined' && data instanceof ArrayBuffer) {
    return { base64: Buffer.from(data).toString('base64'), mimeType: 'image/jpeg' };
  }
  return { base64: '', mimeType: 'image/jpeg' };
}

/**
 * Analyzes Receipt / Supplier Invoice Images or PDFs via EZRAB Vision
 */
export async function analyzeReceipt(request: ReceiptAnalysisRequest): Promise<ReceiptAnalysisResponse> {
  try {
    if (!request.projectId || request.projectId.trim() === '') {
      return { success: false, error: 'Project ID tidak valid atau belum dipilih.' };
    }

    if (!request.fileData) {
      return { success: false, error: 'File nota / invoice tidak ditemukan.' };
    }

    const fileSize = typeof request.fileData === 'string'
      ? request.fileData.length
      : typeof Blob !== 'undefined' && request.fileData instanceof Blob
      ? request.fileData.size
      : (request.fileData as ArrayBuffer).byteLength || 350000;

    const masterCatalog = request.referenceMasterPrices && request.referenceMasterPrices.length > 0
      ? request.referenceMasterPrices
      : DEFAULT_MASTER_PRICE_CATALOG;

    // Convert file to base64
    let filePayload: { base64: string; mimeType: string } = { base64: '', mimeType: 'image/jpeg' };
    try {
      filePayload = await fileDataToBase64(request.fileData);
    } catch {
      // ignore
    }

    // Try live server OCR endpoint first (EZRAB Vision)
    try {
      const isPdf = request.fileName.toLowerCase().endsWith('.pdf') || filePayload.mimeType.includes('pdf');
      const apiRes = await fetch('/api/ai/receipt/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: request.projectId,
          fileName: request.fileName,
          fileSize,
          imageDataBase64: isPdf ? undefined : filePayload.base64,
          imageMimeType: isPdf ? undefined : filePayload.mimeType,
          pdfDataBase64: isPdf ? filePayload.base64 : undefined,
        }),
      });

      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.success && json.result) {
          const rawResult = json.result;
          // Enrich line items with Master Price benchmarks
          const enrichedLineItems: ReceiptLineItem[] = (rawResult.lineItems || []).map((item: any, idx: number) => {
            const matched = matchItemWithMasterPrice(item.description, item.unitPrice, masterCatalog);
            return {
              id: item.id || `item-${idx + 1}`,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
              categorySuggestion: item.categorySuggestion || 'Material',
              matchedMasterItem: matched,
              confidence: item.confidence || 'HIGH',
            };
          });

          return {
            success: true,
            result: {
              ...rawResult,
              supplierName: request.customSupplier || rawResult.supplierName,
              invoiceDate: request.customDate || rawResult.invoiceDate,
              lineItems: enrichedLineItems,
            },
          };
        }
      }
    } catch {
      // Backend unavailable or running in offline / unit test environment
    }

    // P0 data-integrity fix (2026-10-09): NEVER fabricate OCR results when the
    // endpoint is unavailable. Previously this returned hardcoded mock supplier
    // names, prices, and invoice numbers with confidence HIGH, which users
    // could confirm straight into Keuangan Proyek as if they were real.
    // Mock data is now ONLY available via explicit test opt-in.
    if (request.__allowMockFallback !== true) {
      return {
        success: false,
        error: 'Layanan OCR tidak tersedia saat ini. Silakan catat pengeluaran secara manual di menu Keuangan Proyek.',
      };
    }

    return { success: true, result: buildMockReceiptResultForTests(request, fileSize, masterCatalog) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memproses OCR nota / invoice.';
    return { success: false, error: message };
  }
}

/**
 * TEST-ONLY mock OCR result builder. Exported so unit tests can exercise the
 * result structure WITHOUT going through analyzeReceipt's honest-failure path.
 * MUST NEVER be called from production UI code.
 */
export function buildMockReceiptResultForTests(
  request: ReceiptAnalysisRequest,
  fileSize: number,
  masterCatalog: MasterPriceReferenceItem[]
): ReceiptOCRResult {
    // Offline / unit-test fallback processing
    const isUnreadableReceipt =
      request.fileName && (request.fileName.toLowerCase().includes('blur') || request.fileName.toLowerCase().includes('rusak') || request.fileName.toLowerCase().includes('buram'));

    const mockRawItems: Array<{
      desc: string;
      qty: number;
      unit: string;
      price: number;
      cat: ExpenseCategory;
      conf: ReceiptConfidence;
    }> = isUnreadableReceipt
      ? [
          { desc: 'UNREADABLE (Teks Tidak Terbaca)', qty: 1, unit: 'ls', price: 0, cat: 'Material', conf: 'LOW' },
          { desc: 'Semen Portland (Sebagian Terbaca)', qty: 10, unit: 'sak', price: 65000, cat: 'Material', conf: 'MEDIUM' },
        ]
      : [
          { desc: 'Semen Portland 50 kg', qty: 50, unit: 'sak', price: 65000, cat: 'Material', conf: 'HIGH' },
          { desc: 'Pasir Pasang Extra', qty: 4, unit: 'm³', price: 280000, cat: 'Material', conf: 'HIGH' },
          { desc: 'Besi Beton Polos Dia 10mm SNI', qty: 30, unit: 'btg', price: 74000, cat: 'Material', conf: 'HIGH' },
          { desc: 'Bata Ringan Hebel 10 cm', qty: 6, unit: 'm³', price: 660000, cat: 'Material', conf: 'HIGH' },
        ];

    const warnings: string[] = [];

    const lineItems: ReceiptLineItem[] = mockRawItems.map((item, idx) => {
      const subtotal = item.qty * item.price;
      const isUnreadable = item.desc.toUpperCase().includes('UNREADABLE');
      const matched = isUnreadable ? undefined : matchItemWithMasterPrice(item.desc, item.price, masterCatalog);

      if (isUnreadable) {
        warnings.push(`Baris #${idx + 1}: Teks item tidak terbaca dengan jelas oleh OCR. Perlu pemeriksaan manual.`);
      }

      return {
        id: `item-${idx + 1}`,
        description: item.desc,
        quantity: item.qty,
        unit: item.unit,
        unitPrice: item.price,
        subtotal,
        categorySuggestion: item.cat,
        matchedMasterItem: matched,
        confidence: item.conf,
      };
    });

    const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = 0;
    const discount = 0;
    const grandTotal = subtotal + tax - discount;

    if (isUnreadableReceipt) {
      warnings.push('⚠️ Total hasil ekstraksi tidak sesuai dengan total pada nota fisik. Perlu pemeriksaan manual sebelum konfirmasi.');
    }

    const todayDate = new Date().toISOString().split('T')[0];
    const invoiceNumber = isUnreadableReceipt ? 'NOTA/UNVERIFIED' : `NOTA/TB/${Date.now().toString().slice(-4)}`;

    const result: ReceiptOCRResult = {
      id: `OCR-REC-${Date.now()}`,
      projectId: request.projectId,
      fileName: request.fileName || 'Nota_Material.jpg',
      fileSize,
      scanDate: new Date().toISOString(),
      supplierName: request.customSupplier || (isUnreadableReceipt ? 'Toko Material (Nama Belum Jelas)' : 'TB Sumber Bangunan Makmur'),
      supplierAddress: 'Jl. Raya Konstruksi No. 88, Jawa Barat',
      supplierPhone: '0812-3456-7890',
      invoiceNumber,
      invoiceDate: request.customDate || todayDate,
      lineItems,
      subtotal,
      tax,
      discount,
      grandTotal,
      overallConfidence: isUnreadableReceipt ? 'LOW' : 'HIGH',
      confidenceNotes: isUnreadableReceipt
        ? [
            '⚠️ Gambar nota memiliki bagian buram atau tidak terbaca.',
            'Beberapa baris item ditandai UNREADABLE dan membutuhkan koreksi pengguna.',
          ]
        : [
            'OCR membaca data supplier, nomor nota, tanggal, dan seluruh baris item.',
            `Ditemukan ${lineItems.length} baris material dengan total Rp ${grandTotal.toLocaleString('id-ID')}.`,
            'Item dicocokkan dengan katalog Master Price EZRAB.',
          ],
      warnings,
    };

    return result;
}

/**
 * Human Confirmation Gate: Commits Draft Expense directly to ProjectFinanceRepository
 */
export function confirmAndSaveExpenseToRepository(
  payload: ExpenseDraftConfirmationPayload,
  repository: ProjectFinanceRepository
): Expense {
  if (!payload.projectId || payload.projectId.trim() === '') {
    throw new Error('Project ID wajib ditentukan untuk mencatat pengeluaran.');
  }

  if (payload.amount <= 0) {
    throw new Error('Nominal pengeluaran harus lebih besar dari 0.');
  }

  const saved = repository.saveExpense({
    date: payload.date || new Date().toISOString().split('T')[0],
    category: payload.category || 'Material',
    description: payload.description || `Pembelian material dari ${payload.supplier}`,
    amount: payload.amount,
    vendor: payload.supplier,
    paymentMethod: payload.paymentMethod || 'Transfer',
    reference: payload.referenceNumber || payload.ocrId,
    notes: payload.notes || `Dicatat otomatis dari AI Baca Nota (${payload.ocrId}) setelah konfirmasi pengguna.`,
  });

  return saved;
}
