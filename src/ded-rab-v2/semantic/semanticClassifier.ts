/**
 * Semantic Classification Engine for DED Extraction (EZRAB DED -> RAB V2)
 *
 * ROOT-CAUSE FIX PRINCIPLE:
 * "JANGAN SEMUA TEKS DED MENJADI ITEM RAB"
 *
 * Every OCR / Vision finding MUST pass through this semantic classification layer
 * BEFORE AHSP matching or item creation.
 *
 * HANYA 'CONSTRUCTION_WORK' yang boleh menjadi kandidat item RAB.
 *
 * - ROOM_LABEL (e.g. "Kamar Utama", "Kamar Anak", "KM/WC") -> context only, NEVER a RAB item!
 * - TITLE_HEADER (e.g. "Denah Lantai 1") -> metadata only, NEVER a RAB item!
 * - NOTE / DRAWING_ANNOTATION (e.g. "Skala 1:100", "Elevasi ±0.00") -> annotation only!
 * - STRUCTURAL_LABEL / SYMBOL (e.g. "P1", "P2", "K1", "B1") -> unverified label,
 *   must be resolved via schedule/legend with full work description, otherwise NEEDS_REVIEW.
 */

import { DedEntityType, DedFact } from '../types';

export interface SemanticClassificationResult {
  fact: DedFact;
  isRabEligible: boolean;
  rejectReason?: string;
  contextRoom?: string;
}

export class SemanticClassifier {
  private static instance: SemanticClassifier;

  private constructor() {}

  public static getInstance(): SemanticClassifier {
    if (!SemanticClassifier.instance) {
      SemanticClassifier.instance = new SemanticClassifier();
    }
    return SemanticClassifier.instance;
  }

  // Exact room names in Indonesian architectural drawings
  private readonly roomNames = new Set([
    'kamar utama',
    'kamar tidur utama',
    'k. utama',
    'k. tidur utama',
    'kamar tidur',
    'kamar anak',
    'k. anak',
    'kamar tidur anak',
    'kamar tidur 1',
    'kamar tidur 2',
    'kamar tidur 3',
    'kamar tamu',
    'kamar pembantu',
    'kamar art',
    'km/wc',
    'km / wc',
    'km',
    'wc',
    'toilet',
    'toilet utama',
    'toilet anak',
    'toilet tamu',
    'kamar mandi',
    'kamar mandi utama',
    'kamar mandi luar',
    'kamar mandi dalam',
    'ruang tamu',
    'r. tamu',
    'ruang keluarga',
    'r. keluarga',
    'ruang makan',
    'r. makan',
    'ruang kerja',
    'r. kerja',
    'ruang santai',
    'ruang tv',
    'ruang ibadah',
    'musholla',
    'mushola',
    'dapur',
    'dapur bersih',
    'dapur kotor',
    'kitchen',
    'pantry',
    'teras',
    'teras depan',
    'teras belakang',
    'teras samping',
    'carport',
    'garasi',
    'balkon',
    'balkon depan',
    'balkon belakang',
    'gudang',
    'koridor',
    'selasar',
    'hallway',
    'foyer',
    'void',
    'tangga',
    'area tangga',
    'service area',
    'area servis',
    'ruang cuci',
    'ruang jemur',
    'cuci jemur',
    'jemuran',
    'taman',
    'taman depan',
    'taman belakang',
    'taman samping',
    'courtyard',
    'laundry',
    'lavatory',
    'wardrobe',
    'walk in closet',
    'plaza',
    'basement',
    'rooftop',
    'attic',
    'dak jemur',
  ]);

  // Regex patterns for room detection
  private readonly roomRegexes = [
    /^(ruang|r\.)\s+(tamu|keluarga|makan|tidur|kerja|santai|ibadah|cuci|jemur|servis|art)/i,
    /^(kamar|k\.)\s+(utama|tidur|anak|tamu|pembantu|art|mandi|\d+)/i,
    /^(km|wc|toilet)(\s*[\/\-]\s*(wc|km|toilet))?(\s+\w+)?$/i,
    /^(teras|balkon|taman)\s+(depan|belakang|samping|atas|bawah)?$/i,
    /^(carport|garasi|gudang|musholla|mushola|pantry|foyer|void|koridor|selasar)(\s+\w+)?$/i,
  ];

  // Regex patterns for structural / architectural symbols like P1, P2, K1, K2, B1, S1
  private readonly symbolRegex = /^(P|PJ|J|BV|K|KP|B|S|PL|TB|D|F|W|C|COL|BEAM|SL)[0-9]{1,3}[a-zA-Z]?$/i;

  // Title / Header detection
  private readonly titleRegexes = [
    /^(denah|tampak|potongan|rencana|detail|jadwal|daftar|layout|key\s*plan|site\s*plan)\s+/i,
    /^(denah|tampak|potongan|rencana|detail)\s+(lantai|atap|pondasi|balok|kolom|pintu|kusen|plafon|pola\s+lantai|sanitasi|titik\s+lampu)/i,
  ];

  // Notes / Annotations detection
  private readonly noteRegexes = [
    /^(skala|scale)\s*[:=]?\s*1\s*:\s*\d+/i,
    /^(catatan|notes?|keterangan)\s*[:=]/i,
    /^(elevasi|peil)\s*[:=]?\s*[±\+\-]\s*\d+/i,
    /^[±\+\-]\s*0\.\d{2}/,
    /^(semua\s+ukuran|dimensi\s+dalam)\s+/i,
    /^(as|grid)\s+[0-9a-zA-Z\-\–\—\s]+$/i,
  ];

  // Keywords that indicate true construction work
  private readonly constructionActionKeywords = [
    'pondasi',
    'galian',
    'urugan',
    'pasangan',
    'bata',
    'hebel',
    'batako',
    'plesteran',
    'acian',
    'beton',
    'pembesian',
    'tulangan',
    'bekisting',
    'sloof',
    'kolom',
    'balok',
    'ringbalk',
    'plat',
    'dak',
    'rangka',
    'kuda-kuda',
    'penutup',
    'genteng',
    'spandek',
    'keramik',
    'homogenous',
    'granit',
    'parket',
    'plafon',
    'gypsum',
    'kalsiboard',
    'cat',
    'pengecatan',
    'pintu',
    'jendela',
    'kusen',
    'sanitair',
    'closet',
    'kloset',
    'wastafel',
    'floor drain',
    'kran',
    'pipa',
    'instalasi',
    'titik lampu',
    'stop kontak',
    'saklar',
    'septictank',
    'resapan',
    'bowplank',
    'pembersihan',
    'rabat',
    'screed',
    'waterproofing',
    'talang',
    'railing',
    'canopy',
    'kanopi',
    'pagar',
  ];

  /**
   * Classifies a raw text label extracted from a DED page into a structured DedFact.
   */
  public classify(
    rawText: string,
    categoryHint?: string,
    sourcePage: number = 1,
    sourceRegion?: string
  ): SemanticClassificationResult {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();

    // 1. Check Title / Header
    if (this.isTitleHeader(lower)) {
      const fact: DedFact = {
        id: `FACT-TITLE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sourcePage,
        sourceRegion,
        rawText: text,
        normalizedText: lower,
        entityType: 'TITLE_HEADER',
        rabEligible: false,
        confidence: 0.98,
      };
      return {
        fact,
        isRabEligible: false,
        rejectReason: `Judul gambar / header sheet ("${text}") bukan merupakan item pekerjaan konstruksi.`,
      };
    }

    // 2. Check Note / Drawing Annotation / Grid / Elevation
    if (this.isNoteOrAnnotation(lower)) {
      const isGrid = lower.startsWith('as ') || lower.startsWith('grid ');
      const isElev = lower.includes('elevasi') || lower.includes('peil') || /^[±\+\-]\s*0\.\d{2}/.test(lower);
      const fact: DedFact = {
        id: `FACT-NOTE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sourcePage,
        sourceRegion,
        rawText: text,
        normalizedText: lower,
        entityType: isGrid ? 'GRID_AXIS' : isElev ? 'ELEVATION' : 'NOTE',
        rabEligible: false,
        confidence: 0.95,
      };
      return {
        fact,
        isRabEligible: false,
        rejectReason: `Catatan gambar / notasi elevasi / grid ("${text}") bukan item pekerjaan konstruksi.`,
      };
    }

    // 3. Check Room Label (CRITICAL: Must NEVER become a RAB item!)
    if (this.isRoomLabel(lower)) {
      const fact: DedFact = {
        id: `FACT-ROOM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sourcePage,
        sourceRegion,
        rawText: text,
        normalizedText: lower,
        entityType: 'ROOM_LABEL',
        rabEligible: false,
        confidence: 0.98,
        context: { room: text },
      };
      return {
        fact,
        isRabEligible: false,
        rejectReason: `Label nama ruangan ("${text}") adalah data spasial/konteks ruangan, BUKAN item pekerjaan RAB.`,
        contextRoom: text,
      };
    }

    // 4. Check Reference Codes: Door, Window, Structure (P1, P2, J1, J2, BV1, K1, B1, etc.)
    const refType = this.getReferenceType(text);
    if (refType) {
      const fact: DedFact = {
        id: `FACT-REF-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sourcePage,
        sourceRegion,
        rawText: text,
        normalizedText: lower,
        entityType: refType,
        rabEligible: false,
        confidence: 0.92,
        context: { tag: text },
      };
      const labelDesc = refType === 'DOOR_REFERENCE' ? 'Kode referensi pintu' :
                        refType === 'WINDOW_REFERENCE' ? 'Kode referensi jendela/ventilasi' :
                        refType === 'STRUCTURAL_REFERENCE' ? 'Kode referensi struktur (kolom/balok)' :
                        'Kode referensi gambar';
      return {
        fact,
        isRabEligible: false,
        rejectReason: `${labelDesc} ("${text}") memerlukan referensi schedule / legenda spesifikasi teknis lengkap sebelum dapat dijadikan item pekerjaan.`,
      };
    }

    // 5. Check Construction Work vs Unknown
    const isWork = this.isConstructionWork(lower, categoryHint);

    if (isWork) {
      const fact: DedFact = {
        id: `FACT-WORK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sourcePage,
        sourceRegion,
        rawText: text,
        normalizedText: lower,
        entityType: 'CONSTRUCTION_WORK',
        rabEligible: true,
        confidence: 0.95,
      };
      return {
        fact,
        isRabEligible: true,
      };
    }

    // 6. Unknown / Unverified Text
    const fact: DedFact = {
      id: `FACT-UNK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourcePage,
      sourceRegion,
      rawText: text,
      normalizedText: lower,
      entityType: 'UNKNOWN',
      rabEligible: false,
      confidence: 0.50,
    };
    return {
      fact,
      isRabEligible: false,
      rejectReason: `Teks ("${text}") tidak teridentifikasi sebagai aktivitas pekerjaan konstruksi yang terukur.`,
    };
  }

  /**
   * Helper: checks if a string is a room label.
   */
  public isRoomLabel(lowerText: string): boolean {
    const cleaned = lowerText.replace(/[\(\)\[\]\:\.\,\-]/g, ' ').trim().replace(/\s+/g, ' ');
    if (this.roomNames.has(cleaned)) return true;

    for (const r of this.roomNames) {
      if (cleaned === r) return true;
    }

    for (const rx of this.roomRegexes) {
      if (rx.test(cleaned)) return true;
    }

    return false;
  }

  /**
   * Helper: checks if text is a title or sheet header.
   */
  public isTitleHeader(lowerText: string): boolean {
    const cleaned = lowerText.trim();
    for (const rx of this.titleRegexes) {
      if (rx.test(cleaned)) return true;
    }
    return false;
  }

  /**
   * Helper: checks if text is an annotation, note, scale, or grid.
   */
  public isNoteOrAnnotation(lowerText: string): boolean {
    const cleaned = lowerText.trim();
    for (const rx of this.noteRegexes) {
      if (rx.test(cleaned)) return true;
    }
    return false;
  }

  /**
   * Helper: checks if text is a raw symbol like P1, P2, K1, B1.
   */
  public isRawSymbol(text: string): boolean {
    const cleaned = text.trim();
    return this.symbolRegex.test(cleaned);
  }

  /**
   * Helper: returns granular canonical reference type (DOOR_REFERENCE, WINDOW_REFERENCE, etc.)
   */
  public getReferenceType(text: string): DedEntityType | null {
    const cleaned = text.trim().toUpperCase();
    if (!this.symbolRegex.test(cleaned)) return null;

    if (/^(P|PJ)[0-9]{1,3}[A-Z]?$/i.test(cleaned)) {
      return 'DOOR_REFERENCE';
    }
    if (/^(J|BV)[0-9]{1,3}[A-Z]?$/i.test(cleaned)) {
      return 'WINDOW_REFERENCE';
    }
    if (/^(K|KP|B|S|SL|COL|BEAM)[0-9]{0,3}[A-Z]?$/i.test(cleaned)) {
      return 'STRUCTURAL_REFERENCE';
    }
    if (/^(D|DET)[0-9]{1,3}[A-Z]?$/i.test(cleaned)) {
      return 'DETAIL_REFERENCE';
    }
    return 'SYMBOL';
  }

  /**
   * Helper: checks if text represents actual construction work.
   */
  public isConstructionWork(lowerText: string, categoryHint?: string): boolean {
    // If it's a known room label or title or raw symbol, it's NOT a construction work
    if (this.isRoomLabel(lowerText) || this.isTitleHeader(lowerText) || this.isRawSymbol(lowerText)) {
      return false;
    }

    // Check presence of construction action keywords
    for (const kw of this.constructionActionKeywords) {
      if (lowerText.includes(kw)) {
        return true;
      }
    }

    // Check category hint if provided and not OTHER
    if (categoryHint && categoryHint !== 'OTHER' && categoryHint !== 'UNKNOWN') {
      return true;
    }

    return false;
  }
}

export const semanticClassifier = SemanticClassifier.getInstance();
