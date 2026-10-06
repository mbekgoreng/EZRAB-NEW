/**
 * REGIONAL COST FACTORS (Indeks Biaya Wilayah Konstruksi Indonesia)
 * Digunakan untuk menyesuaikan estimasi harga satuan material dan upah (AHSP)
 * berdasarkan wilayah proyek dengan patokan standar nasional DKI Jakarta (100% / Indeks 1.00).
 * Rujukan: Indeks Kemahalan Konstruksi (IKK) BPS dan Standar Biaya PUPR.
 */

export interface RegionalCostFactor {
  code: string;
  label: string;
  name: string;
  factor: number;
  multiplier: number;
  percentageVsJakarta: number;
  percentage: number;
  description: string;
  provincesOrCities: string[];
}

export const REGIONAL_COST_FACTORS: Record<string, RegionalCostFactor> = {
  DKI_JAKARTA: {
    code: 'DKI_JAKARTA',
    label: 'DKI Jakarta & Jabodetabek',
    name: 'DKI Jakarta & Jabodetabek',
    factor: 1.00,
    multiplier: 1.00,
    percentageVsJakarta: 100,
    percentage: 100,
    description: 'DKI Jakarta, Tangerang, Bekasi, Depok, Bogor (Standar Acuan Nasional)',
    provincesOrCities: ['jakarta', 'tangerang', 'tangsel', 'bekasi', 'depok', 'bogor', 'jabodetabek']
  },
  JAWA_BARAT: {
    code: 'JAWA_BARAT',
    label: 'Jawa Barat',
    name: 'Jawa Barat',
    factor: 0.95,
    multiplier: 0.95,
    percentageVsJakarta: 95,
    percentage: 95,
    description: 'Bandung, Cirebon, Sukabumi, Tasikmalaya, Karawang, Subang, dll.',
    provincesOrCities: ['bandung', 'cirebon', 'sukabumi', 'tasikmalaya', 'karawang', 'subang', 'garut', 'cianjur', 'jawa barat', 'jabar']
  },
  JAWA_TENGAH_DIY: {
    code: 'JAWA_TENGAH_DIY',
    label: 'Jawa Tengah & D.I. Yogyakarta',
    name: 'Jawa Tengah & D.I. Yogyakarta',
    factor: 0.90,
    multiplier: 0.90,
    percentageVsJakarta: 90,
    percentage: 90,
    description: 'Semarang, Solo/Surakarta, Jogja/Yogyakarta, Magelang, Kudus, Cilacap, dll.',
    provincesOrCities: ['semarang', 'solo', 'surakarta', 'jogja', 'yogyakarta', 'magelang', 'kudus', 'cilacap', 'purwokerto', 'jawa tengah', 'jateng', 'diy']
  },
  JAWA_TIMUR: {
    code: 'JAWA_TIMUR',
    label: 'Jawa Timur',
    name: 'Jawa Timur',
    factor: 0.95,
    multiplier: 0.95,
    percentageVsJakarta: 95,
    percentage: 95,
    description: 'Surabaya, Malang, Sidoarjo, Gresik, Banyuwangi, Jember, Kediri, Madiun, dll.',
    provincesOrCities: ['surabaya', 'malang', 'sidoarjo', 'gresik', 'banyuwangi', 'jember', 'kediri', 'madiun', 'blitar', 'pasuruan', 'probolinggo', 'jawa timur', 'jatim']
  },
  BALI_NTB_NTT: {
    code: 'BALI_NTB_NTT',
    label: 'Bali & Nusa Tenggara',
    name: 'Bali & Nusa Tenggara',
    factor: 1.08,
    multiplier: 1.08,
    percentageVsJakarta: 108,
    percentage: 108,
    description: 'Denpasar, Badung, Gianyar, Mataram, Lombok, Sumbawa, Kupang, Flores, dll.',
    provincesOrCities: ['bali', 'denpasar', 'badung', 'gianyar', 'ubud', 'lombok', 'mataram', 'ntb', 'ntt', 'kupang', 'flores', 'sumbawa', 'labuan bajo', 'nusra', 'nusa tenggara']
  },
  BALI_NUSRA: {
    code: 'BALI_NUSRA',
    label: 'Bali & Nusa Tenggara',
    name: 'Bali & Nusa Tenggara',
    factor: 1.08,
    multiplier: 1.08,
    percentageVsJakarta: 108,
    percentage: 108,
    description: 'Denpasar, Badung, Gianyar, Mataram, Lombok, Sumbawa, Kupang, Flores, dll.',
    provincesOrCities: ['bali', 'denpasar', 'badung', 'gianyar', 'ubud', 'lombok', 'mataram', 'ntb', 'ntt', 'kupang', 'flores', 'sumbawa', 'labuan bajo', 'nusra', 'nusa tenggara']
  },
  SUMATERA: {
    code: 'SUMATERA',
    label: 'Sumatera',
    name: 'Sumatera',
    factor: 1.12,
    multiplier: 1.12,
    percentageVsJakarta: 112,
    percentage: 112,
    description: 'Medan, Palembang, Pekanbaru, Batam, Padang, Lampung, Jambi, Bengkulu, Aceh',
    provincesOrCities: ['sumatera', 'medan', 'palembang', 'pekanbaru', 'batam', 'padang', 'lampung', 'bandar lampung', 'jambi', 'bengkulu', 'aceh', 'riau', 'sumut', 'sumsel', 'sumbar']
  },
  KALIMANTAN: {
    code: 'KALIMANTAN',
    label: 'Kalimantan & IKN Nusantara',
    name: 'Kalimantan & IKN Nusantara',
    factor: 1.20,
    multiplier: 1.20,
    percentageVsJakarta: 120,
    percentage: 120,
    description: 'Balikpapan, Samarinda, Banjarmasin, Pontianak, Palangkaraya, Tarakan, IKN Nusantara',
    provincesOrCities: ['kalimantan', 'balikpapan', 'samarinda', 'banjarmasin', 'pontianak', 'palangkaraya', 'tarakan', 'ikn', 'nusantara', 'kaltim', 'kalsel', 'kalbar', 'kalteng', 'kaltara']
  },
  KALIMANTAN_IKN: {
    code: 'KALIMANTAN_IKN',
    label: 'Kalimantan & IKN Nusantara',
    name: 'Kalimantan & IKN Nusantara',
    factor: 1.20,
    multiplier: 1.20,
    percentageVsJakarta: 120,
    percentage: 120,
    description: 'Balikpapan, Samarinda, Banjarmasin, Pontianak, Palangkaraya, Tarakan, IKN Nusantara',
    provincesOrCities: ['kalimantan', 'balikpapan', 'samarinda', 'banjarmasin', 'pontianak', 'palangkaraya', 'tarakan', 'ikn', 'nusantara', 'kaltim', 'kalsel', 'kalbar', 'kalteng', 'kaltara']
  },
  SULAWESI: {
    code: 'SULAWESI',
    label: 'Sulawesi',
    name: 'Sulawesi',
    factor: 1.15,
    multiplier: 1.15,
    percentageVsJakarta: 115,
    percentage: 115,
    description: 'Makassar, Manado, Palu, Kendari, Gorontalo, Mamuju, Parepare, Bitung',
    provincesOrCities: ['sulawesi', 'makassar', 'manado', 'palu', 'kendari', 'gorontalo', 'mamuju', 'parepare', 'bitung', 'sulsel', 'sulut', 'sulteng', 'sultra', 'sulbar']
  },
  MALUKU_PAPUA: {
    code: 'MALUKU_PAPUA',
    label: 'Maluku & Papua',
    name: 'Maluku & Papua',
    factor: 1.45,
    multiplier: 1.45,
    percentageVsJakarta: 145,
    percentage: 145,
    description: 'Ambon, Ternate, Jayapura, Sorong, Manokwari, Timika, Merauke, Biak, Wamena',
    provincesOrCities: ['maluku', 'ambon', 'ternate', 'papua', 'jayapura', 'sorong', 'manokwari', 'timika', 'merauke', 'biak', 'wamena']
  }
};

export const DEFAULT_REGIONAL_CODE = 'DKI_JAKARTA';

/**
 * Mengambil faktor wilayah berdasarkan kode atau nama teks wilayah
 */
export function getRegionalFactor(regionCodeOrText?: string): RegionalCostFactor {
  if (!regionCodeOrText) {
    return REGIONAL_COST_FACTORS[DEFAULT_REGIONAL_CODE];
  }

  // Direct match by key
  const upper = regionCodeOrText.toUpperCase().trim();
  if (REGIONAL_COST_FACTORS[upper]) {
    return REGIONAL_COST_FACTORS[upper];
  }

  // Detect by keyword inside provincesOrCities with word boundary
  const lower = regionCodeOrText.toLowerCase().trim();
  for (const factor of Object.values(REGIONAL_COST_FACTORS)) {
    if (factor.provincesOrCities.some(kw => new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'i').test(lower))) {
      return factor;
    }
  }

  return REGIONAL_COST_FACTORS[DEFAULT_REGIONAL_CODE];
}

/**
 * Mendeteksi kode wilayah otomatis dari teks query/prompt pengguna
 */
export function detectRegionFromText(text: string): string {
  if (!text) return DEFAULT_REGIONAL_CODE;
  const lower = text.toLowerCase();

  if (lower.includes('ikn') || lower.includes('nusantara')) {
    return 'KALIMANTAN_IKN';
  }

  // Collect all keyword matches sorted by length descending so specific cities (e.g. 'balikpapan') match before 'bali'
  const candidates: Array<{ code: string; kw: string }> = [];
  for (const [code, region] of Object.entries(REGIONAL_COST_FACTORS)) {
    for (const kw of region.provincesOrCities) {
      candidates.push({ code, kw });
    }
  }
  candidates.sort((a, b) => b.kw.length - a.kw.length);

  for (const item of candidates) {
    const regex = new RegExp(`(^|[^a-z0-9])${item.kw}([^a-z0-9]|$)`, 'i');
    if (regex.test(lower)) {
      return item.code;
    }
  }

  return DEFAULT_REGIONAL_CODE;
}

/**
 * Daftar opsi wilayah untuk pertanyaan Wizard
 */
const seenCodes = new Set<string>();
export const REGIONAL_WIZARD_OPTIONS = Object.values(REGIONAL_COST_FACTORS)
  .filter(r => {
    if (seenCodes.has(r.code)) return false;
    seenCodes.add(r.code);
    return true;
  })
  .map(r => ({
    id: r.code.toLowerCase(),
    label: `${r.label} (${r.percentageVsJakarta}% Acuan)`,
    description: `${r.description}`,
    value: r.code,
    nextStep: 'NEXT',
    badge: r.factor === 1.00 ? 'Standar Acuan' : `${r.percentageVsJakarta > 100 ? '+' : ''}${r.percentageVsJakarta - 100}%`
  }));

