/**
 * UNIT COMPATIBILITY GATE — Fase 3 Master Repair (2026-11-06)
 * ============================================================
 * Gerbang satuan terpusat untuk SEMUA resolusi harga komponen kalkulator.
 *
 * Latar: pencocokan harga lama (QtoCalculatorView) mengabaikan satuan
 * sepenuhnya — komponen `Air` satuan LITER dihargai memakai record
 * `SN-005 Pipa PVC D 4"` satuan BATANG karena namanya mengandung "Air".
 * Aturan owner: satuan tidak cocok → PRICE_INCOMPLETE (UNIT_MISMATCH),
 * tidak pernah dihargai, tidak pernah dikonversi diam-diam.
 *
 * Hasil yang mungkin:
 * - EXACT_MATCH        — satuan sama setelah normalisasi notasi
 *                        (huruf besar/kecil, m2↔m², m'↔m, spasi).
 * - APPROVED_CONVERSION— beda satuan TETAPI satu dimensi fisik dan ada
 *                        faktor konversi SI yang terdokumentasi di
 *                        APPROVED_UNIT_CONVERSIONS (massa, panjang,
 *                        luas, volume murni). Harga dikonversi dengan
 *                        faktor itu dan SELALU ditandai sebagai konversi.
 * - UNIT_MISMATCH      — satuan dikenal tetapi dimensi/keluarga berbeda
 *                        (liter vs batang, m² vs m³, kg vs sak, OH vs m³,
 *                        sewa-hari vs unit beli). TIDAK boleh dihargai.
 * - UNIT_UNKNOWN       — salah satu satuan kosong/tidak dikenal.
 *                        TIDAK boleh dihargai (tidak bisa dibuktikan aman).
 *
 * Konversi kemasan (sak↔kg), densitas (kg↔m³), dan ekuivalensi hitungan
 * (unit↔buah) TIDAK disetujui secara generik: faktor seperti itu bergantung
 * pada spesifikasi sumber daya dan hanya boleh ditambahkan per-sumber-daya
 * dengan rasional + tes, bukan sebagai aturan umum.
 */

export type UnitCompatibilityResult =
  | 'EXACT_MATCH'
  | 'APPROVED_CONVERSION'
  | 'UNIT_MISMATCH'
  | 'UNIT_UNKNOWN';

export interface UnitValidation {
  result: UnitCompatibilityResult;
  /** Satuan komponen setelah normalisasi. */
  componentUnit: string;
  /** Satuan kandidat/record setelah normalisasi. */
  candidateUnit: string;
  /**
   * Pengali harga: hargaPerSatuanKomponen = hargaPerSatuanKandidat × factor.
   * 1 untuk EXACT_MATCH; faktor SI untuk APPROVED_CONVERSION; null bila
   * tidak boleh dihargai.
   */
  priceFactor: number | null;
  /** Penjelasan deterministik (Bahasa Indonesia) untuk provenance/audit. */
  reason: string;
}

/** Normalisasi notasi satuan — TIDAK mengubah dimensi, hanya ejaan. */
export function normalizeUnitName(unit: string | null | undefined): string {
  if (!unit) return '';
  let u = String(unit).trim().toLowerCase();
  u = u.replace(/\s+/g, '');
  u = u.replace(/²/g, '2').replace(/³/g, '3');
  u = u.replace(/^m2$/, 'm²').replace(/^m3$/, 'm³');
  // Notasi meter linear pada dokumen Indonesia: m' , m1, lari — semua meter.
  if (u === "m'" || u === 'm1' || u === 'mlari' || u === 'meter') u = 'm';
  if (u === 'meterkubik') u = 'm³';
  if (u === 'meterpersegi') u = 'm²';
  if (u === 'ltr' || u === 'litre' || u === 'litres') u = 'liter';
  if (u === 'lbr') u = 'lembar';
  if (u === 'bh') u = 'buah';
  // Varian ejaan satuan kemasan yang sama: "zak" (ejaan Belanda, dipakai
  // MASTER_PRICE_ITEMS SM-*) = "sak". Bukan konversi — satuan yang sama.
  if (u === 'zak') u = 'sak';
  if (u === 'pcs') u = 'buah';
  // KEPUTUSAN REGISTRY TERCATAT (Master Repair Fase 3, dari peta Fase 1/2/5):
  // "sewa-hari" adalah satuan sewa PER HARI — identik dengan "hari" pada
  // record resmi CK (mis. Stamper Kodok per "Hari"). Ini ekuivalensi
  // definisi, BUKAN konversi jam↔hari: "jam" tetap dimensi berbeda dan
  // tidak pernah dikonversi ke hari (tidak ada asumsi 8 jam kerja).
  if (u === 'sewa-hari') u = 'hari';
  if (u === 'hari') u = 'hari';
  if (u === 'oh' || u === 'oranghari') u = 'OH';
  if (u === 'oj' || u === 'orangjam') u = 'OJ';
  return u;
}

/**
 * Dimensi fisik dengan faktor ke satuan basis dimensi itu.
 * factor = berapa satuan basis dalam 1 satuan ini (kg: basis massa).
 * Keluarga tanpa faktor (count/packaging/time/labor) sengaja TIDAK punya
 * konversi antar-satuan: nilainya per-satuan-hitung, bukan per-dimensinya.
 */
const DIMENSION_SCALE: Record<string, { dimension: string; toBase: number }> = {
  // massa (basis kg)
  kg: { dimension: 'mass', toBase: 1 },
  gram: { dimension: 'mass', toBase: 0.001 },
  g: { dimension: 'mass', toBase: 0.001 },
  ton: { dimension: 'mass', toBase: 1000 },
  kuintal: { dimension: 'mass', toBase: 100 },
  // panjang (basis m)
  m: { dimension: 'length', toBase: 1 },
  cm: { dimension: 'length', toBase: 0.01 },
  mm: { dimension: 'length', toBase: 0.001 },
  km: { dimension: 'length', toBase: 1000 },
  // luas (basis m²)
  'm²': { dimension: 'area', toBase: 1 },
  'cm²': { dimension: 'area', toBase: 0.0001 },
  ha: { dimension: 'area', toBase: 10000 },
  // volume (basis m³)
  'm³': { dimension: 'volume', toBase: 1 },
  liter: { dimension: 'volume', toBase: 0.001 },
  ml: { dimension: 'volume', toBase: 0.000001 },
  // hitungan (basis: satu benda) — ATURAN EKUIVALENSI TERVERIFIKASI:
  // "buah" dan "unit" adalah sinonim satuan hitung dalam BOQ Indonesia;
  // keduanya menotasikan SATU benda diskrit tanpa dimensi fisik, jadi
  // faktornya tepat 1. Ini BUKAN ekuivalensi generik satuan hitung lain:
  // "set", "dus", "lembar", "batang" tetap keluarga sendiri karena satu
  // set/dus/batang tidak sama dengan satu buah.
  buah: { dimension: 'count', toBase: 1 },
  unit: { dimension: 'count', toBase: 1 },
};

/** Satuan yang dikenal tetapi TIDAK punya konversi generik yang disetujui. */
const KNOWN_NON_CONVERTIBLE = new Set([
  // hitungan / kemasan — ekuivalensi bergantung spesifikasi produk
  // ('buah'/'unit' ada di DIMENSION_SCALE sebagai sinonim hitung faktor 1)
  'batang', 'lembar', 'sak', 'dus', 'pail', 'galon',
  'kaleng', 'set', 'titik', 'pcs', 'roll', 'pak', 'ikat', 'lonjor',
  'lembar/m', 'seng', 'keping', 'blok', 'panel',
  // waktu & tenaga kerja
  'sewa-hari', 'hari', 'OH', 'OJ', 'jam', 'sewa-jam', 'sewa-bulan',
  // lain-lain
  '%', 'ls', 'rit', 'paket', 'm-gu', 'gu',
]);

export function isKnownUnit(normalizedUnit: string): boolean {
  return normalizedUnit in DIMENSION_SCALE || KNOWN_NON_CONVERTIBLE.has(normalizedUnit);
}

export interface ApprovedConversion {
  from: string;
  to: string;
  /** harga per `to` = harga per `from` × factor */
  priceFactor: number;
  rationale: string;
}

/**
 * Daftar konversi yang disetujui — diturunkan dari DIMENSION_SCALE.
 * Hanya konversi SI satu-dimensi (massa/panjang/luas/volume murni).
 * Harga per satuan target = harga per satuan sumber × (toBase(target)/toBase(source)).
 */
export function approvedConversionBetween(fromRaw: string, toRaw: string): ApprovedConversion | null {
  const from = normalizeUnitName(fromRaw);
  const to = normalizeUnitName(toRaw);
  const a = DIMENSION_SCALE[from];
  const b = DIMENSION_SCALE[to];
  if (!a || !b || a.dimension !== b.dimension || from === to) return null;
  return {
    from,
    to,
    priceFactor: b.toBase / a.toBase,
    rationale:
      `Konversi SI satu dimensi (${a.dimension}): 1 ${from} = ${a.toBase / b.toBase} ${to}; ` +
      'faktor murni dimensi fisik, tidak bergantung spesifikasi sumber daya.',
  };
}

/**
 * Validasi kompatibilitas satuan komponen vs kandidat harga.
 * Ini SATU-SATUNYA gerbang yang boleh memutuskan dua satuan boleh dihargai.
 */
export function validateUnitCompatibility(
  componentUnitRaw: string | null | undefined,
  candidateUnitRaw: string | null | undefined
): UnitValidation {
  const componentUnit = normalizeUnitName(componentUnitRaw);
  const candidateUnit = normalizeUnitName(candidateUnitRaw);

  if (!componentUnit || !candidateUnit) {
    return {
      result: 'UNIT_UNKNOWN',
      componentUnit,
      candidateUnit,
      priceFactor: null,
      reason: `Satuan tidak lengkap (komponen: "${componentUnitRaw ?? ''}", kandidat: "${candidateUnitRaw ?? ''}") — tidak dapat dibuktikan kompatibel, harga tidak dipakai.`,
    };
  }

  if (componentUnit === candidateUnit) {
    return {
      result: 'EXACT_MATCH',
      componentUnit,
      candidateUnit,
      priceFactor: 1,
      reason: `Satuan sama persis: ${componentUnit}.`,
    };
  }

  const conv = approvedConversionBetween(candidateUnit, componentUnit);
  if (conv) {
    return {
      result: 'APPROVED_CONVERSION',
      componentUnit,
      candidateUnit,
      priceFactor: conv.priceFactor,
      reason: `Konversi disetujui ${conv.from} → ${conv.to} (faktor harga ×${conv.priceFactor}). ${conv.rationale}`,
    };
  }

  if (!isKnownUnit(componentUnit) || !isKnownUnit(candidateUnit)) {
    return {
      result: 'UNIT_UNKNOWN',
      componentUnit,
      candidateUnit,
      priceFactor: null,
      reason: `Satuan tidak dikenal (${!isKnownUnit(componentUnit) ? componentUnit : candidateUnit}) — tidak ada bukti kompatibilitas, harga tidak dipakai.`,
    };
  }

  return {
    result: 'UNIT_MISMATCH',
    componentUnit,
    candidateUnit,
    priceFactor: null,
    reason:
      `UNIT_MISMATCH: komponen bersatuan ${componentUnit} tidak boleh dihargai dengan record bersatuan ${candidateUnit} ` +
      '(dimensi/keluarga berbeda dan tidak ada konversi yang disetujui).',
  };
}

/** true hanya bila hasil validasi mengizinkan harga dipakai. */
export function unitAllowsPricing(v: UnitValidation): boolean {
  return v.result === 'EXACT_MATCH' || v.result === 'APPROVED_CONVERSION';
}
