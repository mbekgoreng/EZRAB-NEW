/**
 * Judul uraian pekerjaan hasil Chat AI.
 *
 * Perintah owner 16 Nov 2026: awalan "[Chat AI] " dihapus dari hasil —
 * uraian tampil sebagai judul biasa dengan kapital awal kata.
 *
 * - `formatWorkItemTitle` dipakai di titik PEMBUATAN item (push Chat AI ke
 *   spreadsheet): buang awalan + normalisasi kapitalisasi judul.
 * - `stripChatAiPrefix` dipakai di TAMPILAN spreadsheet: hanya membuang
 *   awalan dari baris lama yang tersimpan, tanpa mengubah sisa teks.
 *
 * Penanda asal AI yang sah secara mesin tetap `volumeSource: 'AI_GENERATED'`
 * + `verificationStatus` — awalan teks tidak pernah dipakai kode lain
 * (tidak ada yang mem-parse '[Chat AI]' di luar tes).
 */

const CHAT_AI_PREFIX = '[Chat AI]';

/** Buang awalan "[Chat AI] " (berulang bila ada) dari awal teks. */
export function stripChatAiPrefix(raw: string): string {
  let out = String(raw ?? '').trim();
  while (out.startsWith(CHAT_AI_PREFIX)) {
    out = out.slice(CHAT_AI_PREFIX.length).trim();
  }
  return out;
}

// Kata penghubung Bahasa Indonesia: tetap huruf kecil bila bukan kata pertama.
const LOWERCASE_WORDS = new Set([
  'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'yang', 'atau',
  's.d.', 's.d', 'sd', 'sampai', 'per', '&',
]);

// Satuan/kuantitas: tetap huruf kecil apa adanya.
const UNITS = new Set([
  'cm', 'mm', 'm', 'km', 'kg', 'g', 'mg', 'ton', 'l', 'ml', 'liter',
  'm2', 'm3', 'm²', 'm³', 'buah', 'bh', 'ls', 'set', 'titik', 'oh', 'oj',
  'jam', 'hari', 'org', 'pasang', 'btg', 'lbr', 'zak', 'sak', 'rol',
  'lembar', 'batang', 'kaleng', 'drum',
]);

// Akronim yang dipertahankan huruf besar semua.
const ACRONYMS = new Set([
  'RAB', 'AHSP', 'PBG', 'MEP', 'BIM', 'AC', 'SNI', 'KDB', 'KLB', 'GSB',
  'IMB', 'PBB', 'PVC', 'HDPE', 'SDA', 'CK', 'BM', 'SMKK', 'HSD', 'HSP',
  'BOQ', 'AI', 'WC', 'KM', 'GI', 'BJTP', 'BJTS', 'KWH', 'UPVC', 'GRC',
  'SP', 'PP', 'DED', 'QTO',
]);

function isAllCaps(word: string): boolean {
  return word.length >= 2 && /[A-Z]/.test(word) && word === word.toUpperCase();
}

function titleCaseWord(word: string, isFirst: boolean): string {
  // Pisahkan tanda baca pembuka/penutup agar keputusan kapitalisasi
  // melihat kata intinya ("(Kedalaman" -> "(Kedalaman", "s.d." -> "s.d.").
  const openMatch = word.match(/^[\(\[\{"']+/);
  const closeMatch = word.match(/[\)\]\}",'\.;:]+$/);
  const open = openMatch ? openMatch[0] : '';
  const close = closeMatch ? closeMatch[0] : '';
  const core = word.slice(open.length, word.length - close.length);
  if (!core) return word;

  // Senyawa berslash/berstrip diproses per segmen ("KM/WC", "Lain-Lain",
  // "Bouwplank/Bowplank"); pemisahnya dipertahankan apa adanya.
  const segments = core.split(/([/-])/);
  let firstDone = false;
  const cased = segments
    .map((seg) => {
      if (seg === '/' || seg === '-') return seg;
      const out = titleCasePart(seg, isFirst && !firstDone);
      firstDone = true;
      return out;
    })
    .join('');
  return `${open}${cased}${close}`;
}

function titleCasePart(part: string, isFirst: boolean): string {
  if (!part) return part;
  // Angka/dimensi dipertahankan ("1:5", "25x25", "1m", "15", "1SP:1PP").
  if (/^[0-9]/.test(part)) return part;
  const lower = part.toLowerCase();
  if (!isFirst && LOWERCASE_WORDS.has(lower)) return lower;
  // Akronim dicek SEBELUM satuan: "km" di judul hampir selalu Kamar Mandi
  // ("Plafon KM/WC"), bukan kilometer.
  const upper = part.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  if (UNITS.has(lower)) return lower;
  if (isAllCaps(part)) return part.charAt(0) + part.slice(1).toLowerCase();
  // Kapitalisasi huruf pertama, sisa kata dipertahankan ("plesteran" ->
  // "Plesteran"; "Pembersihan" dan "Bouwplank" tidak berubah).
  return part.charAt(0).toUpperCase() + part.slice(1);
}

/**
 * Normalisasi judul uraian: buang awalan "[Chat AI] ", rapikan spasi,
 * kapitalisasi awal kata dengan aturan Bahasa Indonesia (kata penghubung
 * dan satuan tetap kecil, akronim tetap besar, angka/dimensi utuh).
 */
export function formatWorkItemTitle(raw: string): string {
  const stripped = stripChatAiPrefix(raw);
  if (!stripped) return '';
  return stripped
    .split(/\s+/)
    .map((word, i) => titleCaseWord(word, i === 0))
    .join(' ');
}
