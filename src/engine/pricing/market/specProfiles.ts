/**
 * Profil spesifikasi kanonis material & ekstraksi atribut dari teks produk.
 * ============================================================================
 * Aturan keras: atribut KUNCI yang tidak cocok → TIDAK SEBANDING (hard reject).
 * Paku 5cm tidak pernah otomatis setara paku 7cm.
 */
import type { MaterialSpec } from './types';

export interface SpecProfile {
  category: string;
  /** pola: [namaAtribut, regex dengan 1 capture group angka/teks] */
  keyPatterns: Array<{ attr: string; re: RegExp; unit?: string }>;
  extraPatterns?: Array<{ attr: string; re: RegExp }>;
  keywords: string[];
}

/** Daftar profil — diperluas bertahap sesuai kebutuhan (Tahap 3). */
export const SPEC_PROFILES: SpecProfile[] = [
  {
    category: 'paku',
    keywords: ['paku'],
    keyPatterns: [
      { attr: 'panjang_cm', re: /(\d+(?:[.,]\d+)?)\s*cm\b/i, unit: 'cm' },
      { attr: 'panjang_mm', re: /(\d+(?:[.,]\d+)?)\s*mm\b/i, unit: 'mm' },
    ],
    extraPatterns: [
      { attr: 'jenis', re: /\b(paku\s+(?:beton|kayu|biasa|tembok|usuk|reng))\b/i },
      { attr: 'merek', re: /\b(merek\s+([a-z0-9]+))\b/i },
    ],
  },
  {
    category: 'semen',
    keywords: ['semen'],
    keyPatterns: [
      { attr: 'berat_kg', re: /(\d+(?:[.,]\d+)?)\s*kg\b/i, unit: 'kg' },
    ],
    extraPatterns: [
      { attr: 'merek', re: /\b(semen\s+(?:tiga\s+roda|gresik|padang|holcim|dynamix|bima|garuda))\b/i },
      { attr: 'tipe', re: /\b(pcc|opc|ppc)\b/i },
    ],
  },
  {
    category: 'besi_beton',
    keywords: ['besi', 'baja tulangan', 'wiremesh', 'behel'],
    keyPatterns: [
      { attr: 'diameter_mm', re: /(?:d|ø|diameter|dia\.?)\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\b/i, unit: 'mm' },
      { attr: 'panjang_m', re: /(\d+(?:[.,]\d+)?)\s*(?:m|meter)\b/i, unit: 'm' },
    ],
    extraPatterns: [
      { attr: 'mutu', re: /\b(bjts?\s*\d+|bjtp\s*\d+)\b/i },
      { attr: 'jenis', re: /\b(polos|ulir|sirip)\b/i },
    ],
  },
  {
    category: 'multipleks',
    keywords: ['multipleks', 'multiplex', 'triplek', 'plywood', 'bekisting'],
    keyPatterns: [
      { attr: 'tebal_mm', re: /(\d+(?:[.,]\d+)?)\s*mm\b/i, unit: 'mm' },
    ],
    extraPatterns: [
      { attr: 'dimensi', re: /(\d+\s*x\s*\d+)\s*(?:cm|m)?/i },
    ],
  },
  {
    category: 'cat',
    keywords: ['cat '],
    keyPatterns: [
      { attr: 'isi_kg', re: /(\d+(?:[.,]\d+)?)\s*kg\b/i, unit: 'kg' },
      { attr: 'isi_liter', re: /(\d+(?:[.,]\d+)?)\s*(?:l|liter)\b/i, unit: 'L' },
    ],
    extraPatterns: [{ attr: 'jenis', re: /\b(tembok|kayu|besi|waterproofing|dasar)\b/i }],
  },
  {
    category: 'pipa',
    keywords: ['pipa'],
    keyPatterns: [
      { attr: 'diameter_inch', re: /(\d+(?:[.,]\d+)?)\s*(?:inch|in|")/i, unit: 'inch' },
      { attr: 'panjang_m', re: /(\d+(?:[.,]\d+)?)\s*(?:m|meter)\b/i, unit: 'm' },
    ],
    extraPatterns: [
      { attr: 'jenis', re: /\b(pvc|ppr|hdpe|galvanis|besi)\b/i },
      { attr: 'kelas', re: /\b(aw|d|sdp)\b/i },
    ],
  },
  {
    category: 'kayu',
    keywords: ['kayu', 'kaso', 'papan', 'balok', 'usuk', 'reng'],
    keyPatterns: [
      { attr: 'panjang_m', re: /(\d+(?:[.,]\d+)?)\s*(?:m|meter)\b/i, unit: 'm' },
    ],
    extraPatterns: [
      { attr: 'jenis_kayu', re: /\b(jati|merbau|kamper|borneo|kelapa|sengon|mahoni)\b/i },
      { attr: 'dimensi', re: /(\d+\s*x\s*\d+)\s*(?:cm)?/i },
    ],
  },
];

const num = (s: string): number => parseFloat(s.replace(',', '.'));

function detectCategory(text: string): SpecProfile | null {
  const t = ` ${text.toLowerCase()} `;
  for (const p of SPEC_PROFILES) {
    if (p.keywords.some((k) => t.includes(k.toLowerCase()))) return p;
  }
  return null;
}

/**
 * Ekstrak spesifikasi dari judul/deskripsi produk.
 * Mengembalikan null bila kategori tidak dikenali (→ NEEDS_REVIEW).
 */
export function extractSpec(productTitle: string, categoryHint?: string): MaterialSpec | null {
  const profile =
    (categoryHint && SPEC_PROFILES.find((p) => p.category === categoryHint)) ||
    detectCategory(productTitle);
  if (!profile) return null;

  const keyAttributes: Record<string, string | number> = {};
  for (const kp of profile.keyPatterns) {
    const m = productTitle.match(kp.re);
    if (m) {
      keyAttributes[kp.attr] = num(m[1]);
      break; // satu atribut kunci per pola prioritas (cm sebelum mm untuk paku)
    }
  }
  const extraAttributes: Record<string, string | number> = {};
  for (const ep of profile.extraPatterns || []) {
    const m = productTitle.match(ep.re);
    if (m) extraAttributes[ep.attr] = m[1].trim().toLowerCase();
  }
  return { category: profile.category, keyAttributes, extraAttributes };
}

/**
 * Bandingkan atribut kunci kebutuhan vs kandidat.
 * Setiap atribut kunci yang ADA di kedua sisi harus SAMA (toleransi numerik kecil).
 * Atribut kunci yang hilang di salah satu sisi → blocker (tidak meyakinkan).
 */
export function compareKeyAttributes(
  need: MaterialSpec,
  have: MaterialSpec
): { compatible: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (need.category !== have.category) {
    return { compatible: false, blockers: [`kategori ${have.category} ≠ ${need.category}`] };
  }
  // Normalisasi panjang paku cm↔mm agar sebanding
  const normNeed = normalizeLengthAttrs(need.keyAttributes);
  const normHave = normalizeLengthAttrs(have.keyAttributes);
  const keys = new Set([...Object.keys(normNeed), ...Object.keys(normHave)]);
  for (const k of keys) {
    const a = normNeed[k];
    const b = normHave[k];
    if (a === undefined || b === undefined) {
      blockers.push(`atribut kunci "${k}" tidak diketahui di salah satu sisi`);
      continue;
    }
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > 1e-9) blockers.push(`${k}: ${b} ≠ ${a}`);
    } else if (String(a).toLowerCase() !== String(b).toLowerCase()) {
      blockers.push(`${k}: "${b}" ≠ "${a}"`);
    }
  }
  return { compatible: blockers.length === 0, blockers };
}

/** Samakan representasi panjang (cm & mm → mm) agar perbandingan adil. */
function normalizeLengthAttrs(attrs: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = { ...attrs };
  if (typeof out['panjang_cm'] === 'number' && out['panjang_mm'] === undefined) {
    out['panjang_mm'] = (out['panjang_cm'] as number) * 10;
    delete out['panjang_cm'];
  }
  return out;
}
