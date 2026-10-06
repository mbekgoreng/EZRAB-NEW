/**
 * EZRAB CORE AI — INTENT ENGINE
 * 
 * Maps user messages, queries, or UI actions to formal construction estimating intents.
 * Combines semantic keyword matching, regex patterns, and context hints.
 */

export type CoreIntentType =
  // PROJECT
  | 'CREATE_PROJECT'
  | 'OPEN_PROJECT'
  | 'UPDATE_PROJECT'
  | 'DELETE_PROJECT'
  // RAB
  | 'CREATE_RAB'
  | 'VIEW_RAB'
  | 'EDIT_RAB'
  | 'AUDIT_RAB'
  | 'ADD_RAB_ITEM'
  | 'DELETE_RAB_ITEM'
  | 'GET_RAB_TOTAL'
  | 'GET_RAB_SECTION'
  | 'APPLY_TO_RAB'
  // DED
  | 'UPLOAD_DED'
  | 'ANALYZE_DED'
  | 'CREATE_RAB_FROM_DED'
  // QTO
  | 'CALCULATE_QTO'
  | 'CALCULATE_VOLUME'
  | 'CALCULATE_AREA'
  | 'CALCULATE_LENGTH'
  | 'CALCULATE_COUNT'
  | 'VIEW_QTO'
  | 'CREATE_RAB_FROM_QTO'
  // AHSP
  | 'SEARCH_AHSP'
  | 'VIEW_AHSP'
  | 'COMPARE_AHSP'
  | 'VALIDATE_AHSP'
  | 'EXPLAIN_AHSP_MATCH'
  // PRICE
  | 'SEARCH_PRICE'
  | 'SEARCH_RESOURCE_PRICE'
  | 'UPDATE_PRICE'
  | 'UPDATE_PROJECT_PRICE'
  | 'VIEW_PRICE_HISTORY'
  | 'EXPLAIN_PRICE_STATUS'
  | 'RESOLVE_MISSING_PRICES'
  // REPORT
  | 'GENERATE_REPORT'
  | 'EXPORT_EXCEL'
  | 'EXPORT_PDF'
  // PROJECT MANAGEMENT
  | 'VIEW_SCHEDULE'
  | 'UPDATE_SCHEDULE'
  | 'VIEW_PROGRESS'
  | 'VIEW_MC'
  | 'VIEW_KURVA_S'
  // TEMPLATE
  | 'LIST_TEMPLATE'
  | 'CREATE_FROM_TEMPLATE'
  | 'VIEW_TEMPLATE'
  // SYSTEM
  | 'HELP'
  | 'EXPLAIN'
  | 'NAVIGATE'
  // UNKNOWN & GENERAL
  | 'GENERAL_CONVERSATION'
  | 'UNKNOWN';

export interface RecognizedIntent {
  type: CoreIntentType;
  confidence: number;
  extractedParameters: Record<string, any>;
  reasoning: string;
}

export class IntentEngine {
  private static instance: IntentEngine | null = null;

  private constructor() {}

  public static getInstance(): IntentEngine {
    if (!IntentEngine.instance) {
      IntentEngine.instance = new IntentEngine();
    }
    return IntentEngine.instance;
  }

  /**
   * Classifies a user message into a formal CoreIntentType.
   */
  public classifyIntent(message: string, context?: { activeModule?: string }): RecognizedIntent {
    const text = (message || '').trim();
    const lower = text.toLowerCase();

    // 1. DED to RAB Intent
    if (
      (lower.includes('ded') && (lower.includes('rab') || lower.includes('buat') || lower.includes('estimasi'))) ||
      lower.includes('buat rab dari gambar') ||
      lower.includes('analisis ded') ||
      lower.includes('baca ded') ||
      lower.includes('gambar ded')
    ) {
      return {
        type: 'CREATE_RAB_FROM_DED',
        confidence: 0.95,
        extractedParameters: {},
        reasoning: 'Pengguna meminta analisis DED dan pembuatan estimasi RAB.',
      };
    }

    // 1b. QTO to RAB Intent ("Buat RAB dari data QTO", "Buat RAB dari QTO", "Estimasi RAB dari volume")
    if (
      (lower.includes('buat rab') || lower.includes('estimasi rab') || lower.includes('create rab')) &&
      (lower.includes('qto') || lower.includes('volume'))
    ) {
      return {
        type: 'CREATE_RAB_FROM_QTO',
        confidence: 0.95,
        extractedParameters: {},
        reasoning: 'Pengguna meminta pembuatan estimasi RAB dari hasil perhitungan kuantitas QTO.',
      };
    }

    // 2. Explain Missing Price Status ("Kenapa harga pondasi kosong?", "Kenapa belum ada harga?")
    if (
      (lower.includes('kenapa') || lower.includes('mengapa')) &&
      (lower.includes('harga') || lower.includes('biaya')) &&
      (lower.includes('kosong') || lower.includes('belum ada') || lower.includes('nol') || lower.includes('missing'))
    ) {
      const match = text.match(/(?:harga|biaya)\s+([a-zA-Z0-9\s]+?)(?:\s+kosong|\s+belum|\s+nol|\?|$)/i);
      const targetItem = match ? match[1].trim() : 'Pondasi';
      return {
        type: 'EXPLAIN_PRICE_STATUS',
        confidence: 0.95,
        extractedParameters: { targetItem },
        reasoning: `Pengguna menanyakan penyebab ketiadaan harga pada item "${targetItem}".`,
      };
    }

    // 3. Explain AHSP Match ("Kenapa AHSP ini tidak cocok?")
    if (
      (lower.includes('kenapa') || lower.includes('mengapa')) &&
      (lower.includes('ahsp') || lower.includes('analisa')) &&
      (lower.includes('tidak cocok') || lower.includes('salah') || lower.includes('mismatch') || lower.includes('berbeda'))
    ) {
      return {
        type: 'EXPLAIN_AHSP_MATCH',
        confidence: 0.92,
        extractedParameters: {},
        reasoning: 'Pengguna menanyakan alasan mismatch pada analisa AHSP.',
      };
    }

    // 4. Resolve Missing Prices ("Perbaiki yang belum ada harganya", "Lengkapi harga kosong")
    if (
      (lower.includes('perbaiki') || lower.includes('lengkapi') || lower.includes('cari')) &&
      (lower.includes('belum ada harga') || lower.includes('harga kosong') || lower.includes('harga nol'))
    ) {
      return {
        type: 'RESOLVE_MISSING_PRICES',
        confidence: 0.94,
        extractedParameters: {},
        reasoning: 'Pengguna meminta resolusi otomatis untuk item berstatus NO_PRICE.',
      };
    }

    // 5. Apply to RAB ("Masukkan ke RAB", "Terapkan ke spreadsheet")
    if (
      lower.includes('masukkan ke rab') ||
      lower.includes('terapkan ke rab') ||
      lower.includes('apply to rab') ||
      lower.includes('masukkan semua yang valid')
    ) {
      return {
        type: 'APPLY_TO_RAB',
        confidence: 0.96,
        extractedParameters: {},
        reasoning: 'Pengguna meminta komitmen item valid ke dalam Spreadsheet RAB.',
      };
    }

    // 6. Audit RAB
    if (
      lower.includes('audit rab') ||
      lower.includes('periksa rab') ||
      lower.includes('cek kelengkapan rab') ||
      lower.includes('audit')
    ) {
      return {
        type: 'AUDIT_RAB',
        confidence: 0.95,
        extractedParameters: {},
        reasoning: 'Pengguna meminta audit komprehensif atas spreadsheet RAB aktif.',
      };
    }

    // 7. Calculate QTO / Volume
    if (
      lower.includes('hitung volume') ||
      lower.includes('hitung luas') ||
      lower.includes('hitung kuantitas') ||
      (lower.includes('hitung') && (lower.includes('pondasi') || lower.includes('beton') || lower.includes('m3') || lower.includes('m2')))
    ) {
      const numbers = text.match(/\d+(\.\d+)?/g)?.map(Number) || [];
      return {
        type: 'CALCULATE_QTO',
        confidence: 0.92,
        extractedParameters: { numbers },
        reasoning: 'Pengguna meminta perhitungan dimensi dan kuantitas teknis.',
      };
    }

    // 8. Search AHSP
    if (
      lower.includes('cari ahsp') ||
      lower.includes('analisa ahsp') ||
      (lower.includes('ahsp') && (lower.includes('batu kali') || lower.includes('beton') || lower.includes('bata') || lower.includes('plesteran')))
    ) {
      const query = text.replace(/cari|ahsp|analisa|standar|pupr/gi, '').trim();
      return {
        type: 'SEARCH_AHSP',
        confidence: 0.92,
        extractedParameters: { query: query || text },
        reasoning: 'Pengguna mencari analisa harga satuan pekerjaan di katalog resmi.',
      };
    }

    // 9. Update Project Price ("Ganti harga semen jadi 1.450.000")
    if (
      (lower.includes('ganti harga') || lower.includes('ubah harga') || lower.includes('update harga')) &&
      /\d+/.test(lower)
    ) {
      const numbers = text.match(/\d+[\d\.,]*/g) || [];
      const cleanNum = numbers.length > 0 ? parseFloat(numbers[numbers.length - 1].replace(/[\.,]/g, '')) : 0;
      return {
        type: 'UPDATE_PROJECT_PRICE',
        confidence: 0.95,
        extractedParameters: { newPrice: cleanNum },
        reasoning: 'Pengguna meminta pembaruan harga material pada level proyek.',
      };
    }

    // 10. Search Resource Price ("Berapa harga semen?", "Harga pasir")
    if (
      lower.includes('berapa harga') ||
      (lower.includes('harga') && !lower.includes('total') && !lower.includes('ganti'))
    ) {
      const resource = text.replace(/berapa|harga|satuan|saat ini|resmi/gi, '').trim();
      return {
        type: 'SEARCH_RESOURCE_PRICE',
        confidence: 0.90,
        extractedParameters: { resourceName: resource },
        reasoning: 'Pengguna meminta informasi harga material, upah, atau peralatan.',
      };
    }

    // 11. Get Total RAB
    if (
      lower.includes('total rab') ||
      lower.includes('total anggaran') ||
      lower.includes('total biaya') ||
      (lower.includes('berapa') && lower.includes('total'))
    ) {
      return {
        type: 'GET_RAB_TOTAL',
        confidence: 0.95,
        extractedParameters: {},
        reasoning: 'Pengguna meminta total nilai estimasi anggaran proyek.',
      };
    }

    // 12. Export Excel ("Export ke excel", "Download excel")
    if (
      lower.includes('export ke excel') ||
      lower.includes('ekspor excel') ||
      lower.includes('download excel') ||
      lower.includes('unduh excel')
    ) {
      return {
        type: 'EXPORT_EXCEL',
        confidence: 0.96,
        extractedParameters: {},
        reasoning: 'Pengguna meminta ekspor spreadsheet RAB ke format Excel.',
      };
    }

    // 13. Export PDF
    if (lower.includes('export ke pdf') || lower.includes('cetak pdf') || lower.includes('unduh pdf')) {
      return {
        type: 'EXPORT_PDF',
        confidence: 0.96,
        extractedParameters: {},
        reasoning: 'Pengguna meminta dokumen cetak PDF.',
      };
    }

    // 14. Project Management: Kurva S & Schedule
    if (lower.includes('kurva s') || lower.includes('kurva-s')) {
      return {
        type: 'VIEW_KURVA_S',
        confidence: 0.95,
        extractedParameters: {},
        reasoning: 'Pengguna meminta visualisasi Kurva S proyek.',
      };
    }

    if (lower.includes('jadwal') || lower.includes('schedule') || lower.includes('timeline')) {
      return {
        type: 'VIEW_SCHEDULE',
        confidence: 0.92,
        extractedParameters: {},
        reasoning: 'Pengguna meminta informasi jadwal pekerjaan.',
      };
    }

    // 15. Create RAB from Template ("Buat RAB rumah tipe 36")
    if (
      (lower.includes('buat rab') || lower.includes('bikin rab') || lower.includes('estimasi rab')) &&
      !lower.includes('ded') && !lower.includes('gambar') && !lower.includes('qto')
    ) {
      let template: string | undefined = undefined;
      if (lower.includes('tipe 36') || lower.includes('type 36')) template = 'RUMAH_TYPE_36';
      else if (lower.includes('tipe 45') || lower.includes('type 45')) template = 'RUMAH_TYPE_45';
      else if (lower.includes('tipe 60') || lower.includes('type 60')) template = 'RUMAH_TYPE_60';
      else if (lower.includes('tipe 72') || lower.includes('type 72')) template = 'RUMAH_TYPE_72';

      return {
        type: 'CREATE_RAB',
        confidence: 0.93,
        extractedParameters: { template },
        reasoning: template ? `Pengguna meminta pembuatan RAB dengan template resmi ${template}.` : 'Pengguna meminta pembuatan RAB baru.',
      };
    }

    // 16. Add Item to Active RAB ("Tambahkan keramik", "Tambah pekerjaan dinding")
    if (
      (lower.includes('tambah') || lower.includes('tambahkan')) &&
      (lower.includes('item') || lower.includes('pekerjaan') || lower.includes('pos') || lower.includes('keramik') || lower.includes('bata'))
    ) {
      return {
        type: 'ADD_RAB_ITEM',
        confidence: 0.92,
        extractedParameters: {},
        reasoning: 'Pengguna meminta penambahan item pekerjaan ke RAB aktif.',
      };
    }

    // 17. Help & Navigation
    if (lower === 'help' || lower === 'bantuan' || lower.includes('panduan') || lower.includes('bisa apa')) {
      return {
        type: 'HELP',
        confidence: 0.95,
        extractedParameters: {},
        reasoning: 'Pengguna meminta panduan penggunaan EZRAB Assistant.',
      };
    }

    // 12. General Conversation
    if (
      lower === 'halo' ||
      lower === 'hai' ||
      lower === 'selamat pagi' ||
      lower === 'selamat siang' ||
      lower.includes('apa kabar')
    ) {
      return {
        type: 'GENERAL_CONVERSATION',
        confidence: 0.98,
        extractedParameters: {},
        reasoning: 'Pesan sapaan pengguna.',
      };
    }

    return {
      type: 'UNKNOWN',
      confidence: 0.5,
      extractedParameters: {},
      reasoning: 'Pesan memerlukan penalaran mendalam oleh AI Model Gateway.',
    };
  }
}

export const intentEngine = IntentEngine.getInstance();
