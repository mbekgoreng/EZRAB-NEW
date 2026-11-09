/**
 * Ikon keluarga kalkulator volume — pola HP praktis (ACC owner 2026-11-09).
 *
 * Memetakan nama kalkulator ke satu ikon simple (dua warna: biru pekat EZRAB
 * + aksen oranye) berdasarkan kata kunci pada nama. Urutan pemeriksaan dari
 * yang paling spesifik ke yang paling umum; nama yang tidak cocok dengan
 * keluarga mana pun mengembalikan null (kartu tampil tanpa ikon).
 *
 * Aset digenerate AI sebagai artefak statis di src/assets/volcalc-icons/ —
 * pemetaan ini murni presentasi, tidak menyentuh data/logika kalkulator.
 */
import bataIcon from '../../assets/volcalc-icons/bata.webp';
import bekistingIcon from '../../assets/volcalc-icons/bekisting.webp';
import plesterIcon from '../../assets/volcalc-icons/plester.webp';
import galianIcon from '../../assets/volcalc-icons/galian.webp';
import betonIcon from '../../assets/volcalc-icons/beton.webp';
import pondasiIcon from '../../assets/volcalc-icons/pondasi.webp';
import tulanganIcon from '../../assets/volcalc-icons/tulangan.webp';
import atapIcon from '../../assets/volcalc-icons/atap.webp';
import jalanIcon from '../../assets/volcalc-icons/jalan.webp';
import drainaseIcon from '../../assets/volcalc-icons/drainase.webp';
import catIcon from '../../assets/volcalc-icons/cat.webp';

/** Satu keluarga ikon: kata kunci (huruf kecil) → berkas ikon. */
interface CalcFamilyRule {
  keywords: string[];
  icon: string;
}

/** Urutan = spesifik → umum; aturan pertama yang cocok menang. */
const CALC_FAMILY_RULES: CalcFamilyRule[] = [
  { keywords: ['bekisting'], icon: bekistingIcon },
  { keywords: ['plester', 'aci'], icon: plesterIcon },
  { keywords: ['galian', 'urugan', 'timbunan'], icon: galianIcon },
  { keywords: ['tulangan', 'pembesian', 'besi'], icon: tulanganIcon },
  { keywords: ['pondasi', 'footplat', 'footing'], icon: pondasiIcon },
  { keywords: ['atap', 'genteng', 'plafon'], icon: atapIcon },
  { keywords: ['jalan', 'aspal', 'perkerasan', 'rigid'], icon: jalanIcon },
  { keywords: ['drainase', 'saluran', 'gorong', 'pipa'], icon: drainaseIcon },
  { keywords: ['cat', 'pengecatan'], icon: catIcon },
  { keywords: ['bata', 'dinding', 'pasangan', 'keramik', 'lantai'], icon: bataIcon },
  { keywords: ['beton', 'kolom', 'balok', 'sloof', 'ringbalk', 'plat'], icon: betonIcon },
];

/**
 * Kembalikan URL ikon keluarga untuk nama kalkulator, atau null bila nama
 * tidak masuk keluarga mana pun.
 */
export function getCalcFamilyIcon(name: string): string | null {
  const normalized = (name || '').toLowerCase();
  if (!normalized) return null;
  for (const rule of CALC_FAMILY_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.icon;
    }
  }
  return null;
}
