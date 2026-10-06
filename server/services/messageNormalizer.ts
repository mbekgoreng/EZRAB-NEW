/**
 * EZRAB AI Co Assistant - Message Normalizer
 * Normalizes user input handling case, excessive punctuation, repeated characters,
 * Indonesian slang, contractions, abbreviations, and informal construction terms.
 */

export interface NormalizedMessage {
  original: string;
  normalized: string;
  tokens: string[];
  stemmedTokens: string[];
  hasQuestionMark: boolean;
  isInformal: boolean;
  detectedSlang: string[];
}

// Common Indonesian slang, abbreviations & typo mapping
const SLANG_MAP: Record<string, string> = {
  // Abbreviations & Chat Slang
  'gmn': 'bagaimana',
  'gmana': 'bagaimana',
  'bgmn': 'bagaimana',
  'bikin': 'membuat',
  'bkin': 'membuat',
  'buat': 'membuat',
  'klo': 'kalau',
  'kl': 'kalau',
  'kalo': 'kalau',
  'udh': 'sudah',
  'uda': 'sudah',
  'sdh': 'sudah',
  'blm': 'belum',
  'blom': 'belum',
  'belom': 'belum',
  'gk': 'tidak',
  'gak': 'tidak',
  'ga': 'tidak',
  'nggak': 'tidak',
  'ngga': 'tidak',
  'tdk': 'tidak',
  'tak': 'tidak',
  'tp': 'tetapi',
  'tapi': 'tetapi',
  'krn': 'karena',
  'karna': 'karena',
  'soale': 'karena',
  'sy': 'saya',
  'aq': 'saya',
  'gw': 'saya',
  'gue': 'saya',
  'gua': 'saya',
  'km': 'kamu',
  'lu': 'kamu',
  'loe': 'kamu',
  'elo': 'kamu',
  'ente': 'kamu',
  'dgn': 'dengan',
  'dg': 'dengan',
  'sama': 'dengan',
  'utk': 'untuk',
  'buatkan': 'membuatkan',
  'tuk': 'untuk',
  'dr': 'dari',
  'pd': 'pada',
  'bgt': 'sangat',
  'banget': 'sangat',
  'bgtu': 'begitu',
  'bs': 'bisa',
  'bsa': 'bisa',
  'gbs': 'tidak bisa',
  'gabisa': 'tidak bisa',
  'gatau': 'tidak tahu',
  'gktau': 'tidak tahu',
  'tau': 'tahu',
  'ap': 'apa',
  'apaan': 'apa',
  'knp': 'mengapa',
  'kenape': 'mengapa',
  'knpa': 'mengapa',
  'ngapa': 'mengapa',
  'ngapain': 'sedang apa',
  'lg': 'lagi',
  'lgi': 'lagi',
  'sdg': 'sedang',
  'skrg': 'sekarang',
  'skg': 'sekarang',
  'now': 'sekarang',
  'bray': '',
  'bro': '',
  'sis': '',
  'gan': '',
  'min': '',
  'bos': '',
  'cuk': '',
  'cuy': '',
  'dong': '',
  'deh': '',
  'sih': '',
  'lah': '',
  'kan': '',
  'ya': '',
  'nih': '',
  'tuh': '',
  'kek': 'seperti',
  'kayak': 'seperti',
  'kyk': 'seperti',
  'macam': 'seperti',
  'kecampur': 'tercampur',
  'ketuker': 'tertukar',
  'ilang': 'hilang',
  'ilangin': 'menghilangkan',
  'bener': 'benar',
  'beneran': 'benar',
  'or': 'atau',
  'and': 'dan',
  'pls': 'tolong',
  'plz': 'tolong',
  'help': 'bantuan',
  'bantu': 'bantuan',
  'cek': 'periksa',
  'ngecek': 'memeriksa',
  'ngitung': 'menghitung',
  'itung': 'menghitung',
  'hitungin': 'menghitungkan',
  'liat': 'melihat',
  'ngeliat': 'melihat',
  'tampilin': 'menampilkan',
  'kasi': 'memberi',
  'kasih': 'memberi',
  'dapet': 'dapat',
  'dapetnya': 'dapatnya',
  'pake': 'menggunakan',
  'pakek': 'menggunakan',
  'make': 'menggunakan',
  'ngedit': 'mengubah',
  'hapusin': 'menghapus'
};

export class MessageNormalizer {
  /**
   * Cleans repeated characters (e.g. "hlooo" -> "hlo", "ezrabbb" -> "ezrab")
   */
  public cleanRepeatedChars(text: string): string {
    // Replace 3 or more consecutive identical characters with a single one (or double if common)
    return text.replace(/(.)\1{2,}/g, '$1');
  }

  /**
   * Normalizes emojis, special unicode characters, and excessive punctuations
   */
  public cleanPunctuationAndSymbols(text: string): { cleaned: string; hadQuestionMark: boolean } {
    const hadQuestionMark = text.includes('?');
    // Remove emojis and special non-latin / non-punctuation symbols
    let cleaned = text.replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ' ');
    // Reduce multiple punctuation marks to single space or clean form
    cleaned = cleaned.replace(/[!?,;:~`@#$%^&*()_+=|\\/{}[\]<>]+/g, ' ');
    // Normalize multiple whitespace to single space
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return { cleaned, hadQuestionMark };
  }

  /**
   * Normalize an entire message string
   */
  public normalize(rawText: string): NormalizedMessage {
    const original = (rawText || '').trim();
    if (!original) {
      return {
        original: '',
        normalized: '',
        tokens: [],
        stemmedTokens: [],
        hasQuestionMark: false,
        isInformal: false,
        detectedSlang: []
      };
    }

    const { cleaned, hadQuestionMark } = this.cleanPunctuationAndSymbols(original.toLowerCase());
    const repeatCleaned = this.cleanRepeatedChars(cleaned);

    const rawTokens = repeatCleaned.split(' ').filter(t => t.length > 0);
    const normalizedTokens: string[] = [];
    const detectedSlang: string[] = [];
    let isInformal = false;

    for (const token of rawTokens) {
      if (SLANG_MAP[token] !== undefined) {
        isInformal = true;
        detectedSlang.push(token);
        const mapped = SLANG_MAP[token];
        if (mapped) {
          // Add mapped words
          const subWords = mapped.split(' ');
          normalizedTokens.push(...subWords);
        }
      } else {
        normalizedTokens.push(token);
      }
    }

    const normalized = normalizedTokens.join(' ').trim();

    return {
      original,
      normalized,
      tokens: normalizedTokens,
      stemmedTokens: normalizedTokens.map(t => this.simpleStem(t)),
      hasQuestionMark: hadQuestionMark,
      isInformal,
      detectedSlang
    };
  }

  /**
   * Simple Indonesian prefix / suffix stripping for fuzzy root matching
   */
  public simpleStem(word: string): string {
    let w = word.toLowerCase();
    if (w.length <= 4) return w;

    // Common Indonesian prefixes
    if (w.startsWith('meng') && w.length > 5) w = w.slice(4);
    else if (w.startsWith('meny') && w.length > 5) w = 's' + w.slice(4);
    else if (w.startsWith('men') && w.length > 4) w = w.slice(3);
    else if (w.startsWith('mem') && w.length > 4) w = w.slice(3);
    else if (w.startsWith('me') && w.length > 4) w = w.slice(2);
    else if (w.startsWith('ber') && w.length > 4) w = w.slice(3);
    else if (w.startsWith('per') && w.length > 4) w = w.slice(3);
    else if (w.startsWith('ter') && w.length > 4) w = w.slice(3);
    else if (w.startsWith('di') && w.length > 4) w = w.slice(2);
    else if (w.startsWith('ke') && w.length > 4) w = w.slice(2);
    else if (w.startsWith('se') && w.length > 4) w = w.slice(2);

    // Common Indonesian suffixes
    if (w.endsWith('kan') && w.length > 5) w = w.slice(0, -3);
    else if (w.endsWith('an') && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith('nya') && w.length > 4) w = w.slice(0, -3);
    else if (w.endsWith('lah') && w.length > 4) w = w.slice(0, -3);
    else if (w.endsWith('kah') && w.length > 4) w = w.slice(0, -3);
    else if (w.endsWith('i') && w.length > 4) w = w.slice(0, -1);

    return w;
  }

  /**
   * Levenshtein distance calculation for typo tolerance
   */
  public levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1,   // insertion
              matrix[i - 1][j] + 1    // deletion
            )
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Similarity score between 0.0 and 1.0 based on Levenshtein distance
   */
  public stringSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - this.levenshtein(longer, shorter)) / longerLength;
  }
}

export const messageNormalizer = new MessageNormalizer();
