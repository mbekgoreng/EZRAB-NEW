/**
 * DED AI ESTIMATE — Evaluator Kewajaran Kuantitas (Sprint 3.1)
 * (src/ai-tools/ded-ai-estimate/reasonableness.ts)
 *
 * Lapisan review DETERMINISTIK yang menilai kewajaran fisik/teknik sebuah
 * kuantitas. Ia melengkapi — bukan menggantikan — dua lapisan yang sudah
 * ada:
 * - Sprint 3 (B2) membuktikan angka dimensi BENAR-BENAR ADA di teks
 *   sumber (validitas bukti). Bukti yang sah tidak menjamin hasil
 *   derivasinya masuk akal secara teknik.
 * - quantity.ts / derivation.ts membuktikan derivasinya sah secara
 *   matematis. Matematika yang sah pun bisa menghasilkan skala yang
 *   tidak masuk akal (selip satuan mm↔m menghasilkan faktor 100–1000).
 *
 * Kontrak keras evaluator ini:
 * - MURNI & DETERMINISTIK: input ternormalisasi yang sama selalu
 *   menghasilkan hasil yang sama. Tanpa I/O, tanpa AI, tanpa acak.
 * - TIDAK PERNAH mengubah kuantitas, subtotal, harga, status, atau
 *   provenance item. Ia hanya MENEMPELKAN anotasi `quantityReview`
 *   (+ penanda di quantityNote untuk NEEDS_REVIEW).
 * - TIDAK PERNAH membuang item. Item ASSUMPTION yang ditandai tetap
 *   masuk Total Estimasi tunggal (keputusan owner G2 Opsi A).
 * - TIDAK ADA ambang minimum/maksimum universal. Setiap aturan memakai
 *   konteks: satuan, kelas elemen, dimensi item itu sendiri, dan
 *   dukungan pengulangan (jumlah elemen).
 *
 * Tabel aturan (urutan evaluasi = prioritas; aturan pertama yang
 * terpicu menentukan hasil):
 *  1. DIAMETER_ONLY_DIMENSION → INSUFFICIENT_CONTEXT (MEDIUM)
 *     Satu-satunya dimensi adalah diameter (ø/D) tetapi kuantitasnya
 *     klaim linear/volumetrik. Diameter bukan panjang elemen; derivasi
 *     dari diameter saja tidak aman (selaras Sprint 3 B2).
 *  2. AMBIGUOUS_UNIT / AMBIGUOUS_DIMENSION_UNIT → INSUFFICIENT_CONTEXT
 *     Satuan item tidak dikenal evaluator, atau string dimensi tanpa
 *     penanda satuan panjang eksplisit sehingga skala hitung-ulang
 *     tidak dapat dipercaya. Tanpa skala yang pasti, kewajaran tidak
 *     dapat dinilai — bukan berarti wajar.
 *  3. DIMENSION_RESULT_MISMATCH → NEEDS_REVIEW (HIGH)
 *     Hitung-ulang deterministik dari dimensi item berbeda dari
 *     kuantitas tercatat di luar pita penjaga selip-skala: rasio > 100
 *     atau < 0,01. Basis: selip satuan yang nyata di pekerjaan
 *     konstruksi bersifat multiplikatif besar — mm↔m = ×1000 (linear),
 *     cm↔m = ×100 (linear) / ×10.000 (luas) / ×1.000.000 (volume).
 *     Selisih di bawah dua orde magnitudo masih dapat dijelaskan
 *     netto/bruto, pembulatan, atau faktor susut — di atasnya hampir
 *     pasti selip satuan atau salahsalin. Hitung-ulang 0 dengan
 *     kuantitas > 0 (faktor nol di dimensi) juga masuk aturan ini.
 *  4. MICRO_QUANTITY_CONTEXT → NEEDS_REVIEW (MEDIUM)
 *     Kuantitas volumetrik < 0,01 m³ (10 liter) untuk elemen struktural
 *     (balok/kolom/plat/sloof/pile cap/pondasi/dak) yang TIDAK
 *     dijelaskan hitung-ulang dimensinya. Basis: elemen struktural
 *     terkecil yang realistis (mis. kolom praktis 0,12×0,12×3 m ≈
 *     0,043 m³; sloof per meter 0,15×0,20×1 ≈ 0,03 m³) berada di atas
 *     0,01 m³; di bawah itu untuk elemen struktural hampir selalu
 *     sisa selip skala — KECUALI dimensinya sendiri membuktikan elemen
 *     memang sekecil itu (hitung-ulang cocok → REASONABLE, kasus
 *     "kecil tetapi sah dengan konteks cukup").
 *  5. IMPLAUSIBLE_ELEMENT_SCALE → NEEDS_REVIEW (MEDIUM; HIGH bila
 *     > 100 m³) — kuantitas volumetrik > 10 m³ yang diklaim untuk SATU
 *     elemen balok/kolom tanpa dekomposisi jumlah pengulangan. Basis:
 *     balok tunggal terbesar yang lazim (0,4×0,8×25 m ≈ 8 m³) dan
 *     kolom tunggal besar (1×1×10 m = 10 m³) berada di kisaran ≤ 10 m³;
 *     di atas itu kuantitas hampir pasti agregat banyak elemen —
 *     sah bila formulanya memang menyatakan jumlahnya (dukungan
 *     pengulangan → REASONABLE), mencurigakan bila tidak.
 *  6. NO_DERIVATION_CONTEXT → INSUFFICIENT_CONTEXT (LOW)
 *     Kuantitas geometrik (VOLUME/AREA/LENGTH) tanpa satu pun dari:
 *     hitung-ulang dimensi, jejak derivasi terstruktur, pernyataan
 *     eksplisit di sumber (DED_EXPLICIT), atau angka dekomposisi di
 *     formula. Tidak ada yang bisa dinilai — dinyatakan apa adanya,
 *     tidak pernah menyamar REASONABLE.
 *  7. REASONABLE — dengan kode basis yang menjelaskan MENGAPA wajar:
 *     DIMENSIONS_EXPLAIN_QUANTITY (hitung-ulang cocok), REPEATED_OBJECTS
 *     (dekompisisi jumlah menjelaskan), DERIVATION_TRAIL (jejak
 *     derivasi terstruktur), STATED_IN_SOURCE (DED_EXPLICIT),
 *     COUNT_UNIT (satuan hitung tidak butuh dimensi), atau
 *     DIMENSIONS_PRESENT (dimensi ada dan tak ada aturan yang terpicu).
 *
 * === Sprint 3.2 — SUMBU SKALA TOTAL-ITEM (independen dari dimensi) ===
 * Aturan 1–7 di atas adalah sumbu DERIVASI: ia menilai konsistensi
 * kuantitas terhadap dimensi yang DIKLAIM MODEL SENDIRI. Pada matriks
 * nyata Sprint 3.1 sumbu itu menandai 0/160 item — sampah model yang
 * konsisten-internal (dimensi fragmen menghasilkan nilai fragmen)
 * selalu lolos. Sprint 3.2 menambahkan sumbu kedua yang INDEPENDEN:
 * skala TOTAL item dinilai terhadap profil kategori pekerjaan —
 * model tidak dapat membuat total yang tidak masuk akal tampak wajar
 * hanya dengan memasok dimensi yang mereproduksinya.
 *
 * Profil skala (urutan = prioritas pencocokan; basis = makna fisik
 * sebuah TOTAL item dalam satu proyek, orde magnitudo — BUKAN ambang
 * universal dan BUKAN disetel ke satu contoh):
 *  P1. FOUNDATION_M3 (pile cap/pondasi/footplat/bore pile, m³):
 *      pile cap tunggal lazim 1–8 m³; total < 0,01 m³ pasti fragmen
 *      satu elemen → BELOW. Batas atas longgar 50.000 m³ (fondasi
 *      satu gedung/bendungan kecil tidak mencapai itu per item).
 *  P2. STRUCTURAL_CONCRETE_M3 (balok/kolom/sloof/plat, m³):
 *      elemen lengkap terkecil ≈ 0,03–0,09 m³ (sloof 0,15×0,20×3 m
 *      = 0,09; kolom praktis 0,12×0,12×3 ≈ 0,043); total < 0,01 m³
 *      lebih kecil dari elemen utuh mana pun → fragmen → BELOW.
 *      Total > 10.000 m³ untuk SATU kelas elemen dalam satu item
 *      melampaui skala beton satu gedung lazim → ABOVE.
 *  P3. EARTHWORK_M3 (galian/timbunan/urugan, m³): tanpa amplop
 *      bawah (galian kecil itu sah). Total > 5.000.000 m³ pada SATU
 *      item melampaui pekerjaan tanah proyek tunggal yang sangat
 *      besar sekalipun (timbunan bendungan besar ±10⁶–10⁷ m³ adalah
 *      TOTAL seluruh proyek, bukan satu item) → ABOVE (HIGH).
 *  P4. STONE_MASONRY_M3 (pasangan batu/batu kali, m³): volume =
 *      panjang × tinggi × tebal (±0,3–0,6 m); total > 100.000 m³
 *      menyiratkan > 55 km dinding setinggi 3 m dalam SATU item →
 *      ABOVE. Tanpa amplop bawah.
 *  P5. AREA_FINISH_M2 (plafon/keramik/pengecatan/waterproofing, m²):
 *      total penyelesaian terkecil yang bermakna berskala ruangan
 *      (±0,5–1 m²); total < 0,1 m² adalah fragmen → BELOW.
 * Kategori di luar profil: tidak ada profil yang dikarang — sumbu
 * skala tidak berpendapat (scaleProfile null) dan hasil ditentukan
 * sumbu derivasi seperti Sprint 3.1.
 *
 * Penggabungan dua sumbu (deterministik):
 * - Hasil NEEDS_REVIEW dari sumbu mana pun menang atas
 *   INSUFFICIENT_CONTEXT / REASONABLE sumbu lainnya.
 * - Bila kedua sumbu NEEDS_REVIEW: alasan utama = severity tertinggi;
 *   pada severity sama, alasan DERIVASI dipertahankan sebagai utama
 *   (diagnosis yang lebih spesifik untuk fenomena yang sama, mis.
 *   mikro tak terjelaskan) dan kode skala dicatat di scaleReasonCode.
 *   Bila skala yang utama, kode derivasi dicatat di
 *   derivationReasonCode. Kedua sumbu tidak pernah saling menimpa
 *   tanpa jejak.
 * - Konteks proyek (projectType dari pemanggil) hanya DICATAT di
 *   contextUsed — ia tidak mengangkat amplop dan tidak pernah
 *   diperlakukan sebagai bukti independen; ketiadaannya dicatat
 *   sebagai PROJECT_CONTEXT_MISSING. Dimensi klaim model TIDAK
 *   PERNAH menjadi konteks independen sumbu skala.
 */

import {
  parseDimensionsString,
  detectLengthUnitFactor,
  isDiameterOnlyDimension,
  shapeForUnit,
  type QuantityShape,
} from './quantity';
import type {
  DedAiItem,
  DedQuantityReview,
  DedQuantityReviewOutcome,
} from './types';

/** Kelas elemen struktural untuk aturan mikro & skala (nama/kategori). */
const STRUCTURAL_ELEMENT_PATTERN =
  /balok|kolom|beam|column|plat|pelat|slab|sloof|pile\s?cap|pilecap|pondasi|footing|ring\s?balk|ringbalk|\bdak\b/i;

/** Kelas elemen TUNGGAL untuk aturan skala (aturan 5 hanya balok/kolom). */
const SINGLE_ELEMENT_PATTERN = /balok|kolom|beam|column/i;

/**
 * Satuan yang dikenali evaluator. Inti dari UNIT_SHAPE (quantity.ts)
 * ditambah satuan hitung/lain yang lazim di RAB Indonesia. Satuan di
 * luar daftar ini → konteks ambigu (aturan 2), BUKAN otomatis salah.
 */
const KNOWN_UNITS = new Set([
  'm3', 'm2', "m'", 'm1', 'm', 'unit', 'bh', 'set', 'l', 'titik',
  'ls', 'lumpsum', 'kg', 'ton', 'lbr', 'btg', 'pcs', 'rol', 'dus',
  'buah', 'batang',
]);

function normalizeUnit(unit: string | undefined): string {
  return String(unit || '')
    .toLowerCase()
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/\s+/g, '')
    .trim();
}

/** Kepala formula: bagian dimensi/dekomposisi sebelum anotasi hasil. */
function formulaHead(formula: string | undefined): string {
  if (!formula) return '';
  return formula.split('(')[0].split('[')[0];
}

interface RecomputeResult {
  /** Produk geometrik murni dari dimensi (tanpa faktor jumlah). */
  base: number | null;
  /**
   * Kandidat jumlah pengulangan (bilangan bulat ≥ 2) dari: angka ekstra
   * pada string dimensi, angka formula yang BUKAN angka dimensi itu
   * sendiri, atau input jumlah pada jejak derivasi. Kandidat belum
   * berarti apa-apa — ia baru "menjelaskan" bila base × kandidat ≈
   * kuantitas tercatat (diperiksa evaluator).
   */
  candidateCounts: number[];
  hasDimensionNumbers: boolean;
  dimensionUnitAmbiguous: boolean;
  diameterOnly: boolean;
}

const DIMS_NEEDED: Record<QuantityShape, number> = {
  VOLUME: 3,
  AREA: 2,
  LENGTH: 1,
  COUNT: 0,
};

function recompute(item: DedAiItem, shape: QuantityShape): RecomputeResult {
  const dimsStr = (item.rawDimensions && item.rawDimensions.trim())
    ? item.rawDimensions
    : formulaHead(item.quantityFormula);
  const nums = dimsStr ? parseDimensionsString(dimsStr) : [];
  const diameterOnly = dimsStr
    ? isDiameterOnlyDimension(dimsStr, nums.length)
    : false;
  const dc = derivationCount(item);
  if (nums.length === 0) {
    return { base: null, candidateCounts: dc !== null ? [dc] : [], hasDimensionNumbers: false, dimensionUnitAmbiguous: false, diameterOnly };
  }
  const { factor, unit: dimUnit } = detectLengthUnitFactor(dimsStr || '');
  if (dimUnit === null) {
    // Tanpa penanda satuan eksplisit skala angka tidak dapat dipercaya
    // (displin yang sama dengan attemptQuantityFromDimensionString).
    return { base: null, candidateCounts: dc !== null ? [dc] : [], hasDimensionNumbers: true, dimensionUnitAmbiguous: true, diameterOnly };
  }
  const needed = DIMS_NEEDED[shape];
  let base: number | null = null;
  if (needed > 0 && nums.length >= needed) {
    base = 1;
    for (let i = 0; i < needed; i++) base *= nums[i] * factor;
  }
  // Kandidat jumlah pengulangan (angka MENTAH, tidak diskalakan satuan
  // panjang — jumlah elemen bukan panjang):
  // - angka ke-(needed+1) pada string dimensi bila bilangan bulat ≥ 2
  //   (pola derivasi kolom: penampang × tinggi × jumlah), dan
  // - bilangan bulat ≥ 2 pada kepala formula yang BUKAN salah satu angka
  //   dimensi yang sudah dipakai (kepala formula hasil konversi memuat
  //   ulang angka dimensinya sendiri — itu bukan jumlah), dan
  // - input jumlah pada jejak derivasi terstruktur.
  const candidates = new Set<number>();
  if (needed > 0 && nums.length > needed) {
    const extra = nums[needed];
    if (Number.isInteger(extra) && extra >= 2 && extra <= 100000) candidates.add(extra);
  }
  const dimNumbersUsed = new Set(nums.slice(0, Math.max(needed, 0)));
  for (const n of parseDimensionsString(formulaHead(item.quantityFormula))) {
    if (Number.isInteger(n) && n >= 2 && n <= 100000 && !dimNumbersUsed.has(n)) {
      candidates.add(n);
    }
  }
  if (dc !== null) candidates.add(dc);
  return { base, candidateCounts: [...candidates], hasDimensionNumbers: true, dimensionUnitAmbiguous: false, diameterOnly };
}

function derivationCount(item: DedAiItem): number | null {
  const inputs = item.derivation?.inputs;
  if (!Array.isArray(inputs)) return null;
  for (const inp of inputs) {
    if (/jumlah|count/i.test(inp.name) && Number.isInteger(inp.value) && inp.value >= 2) {
      return inp.value;
    }
  }
  return null;
}

/** Dekat relatif: |a-b| ≤ toleransi × max(|a|,|b|). */
function approxEqual(a: number, b: number, tol: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return false;
  return Math.abs(a - b) / scale <= tol;
}

function review(
  outcome: DedQuantityReviewOutcome,
  reasonCode: string,
  explanation: string,
  severity: DedQuantityReview['severity'],
  item: DedAiItem,
  derivedQuantity: number | null
): DedQuantityReview {
  return {
    outcome,
    reasonCode,
    explanation,
    severity,
    originalQuantity: item.quantity as number,
    derivedQuantity,
  };
}

const fmt = (n: number): string =>
  n.toLocaleString('id-ID', { maximumFractionDigits: 6 });

/** Konteks opsional dari pemanggil (Sprint 3.2) — hanya dicatat, tidak
 *  pernah menjadi bukti independen bagi sumbu skala. */
export interface DedReasonablenessContext {
  projectType?: string;
}

interface ScaleProfile {
  id: string;
  /** Label kategori yang terbaca manusia (masuk hasil review). */
  category: string;
  pattern: RegExp;
  /** Gerbang satuan ternormalisasi — profil hanya berlaku untuk satuan ini. */
  unit: string;
  /** Batas bawah amplop total item (inklusif-aman: total < lower terpicu). null = tanpa amplop bawah. */
  lower: number | null;
  /** Batas atas amplop total item (total > upper terpicu). null = tanpa amplop atas. */
  upper: number | null;
  /** Basis teknik amplop (terdokumentasi, masuk hasil review). */
  basis: string;
  belowSeverity: DedQuantityReview['severity'];
  aboveSeverity: DedQuantityReview['severity'];
}

/**
 * Profil skala total-item (Sprint 3.2). Urutan array = prioritas:
 * fondasi dicocokkan sebelum beton struktural karena nama seperti
 * "pile cap dan sloof pondasi" memuat kata kedua kategori — profil
 * yang lebih spesifik (fondasi) yang berlaku.
 */
const SCALE_PROFILES: ScaleProfile[] = [
  {
    id: 'FOUNDATION_M3',
    category: 'Pile cap & fondasi',
    pattern: /pile\s?cap|pilecap|pondasi|footplat|foot\s?plate|bore\s?pile|bor\s?pile|tiang\s?pancang|telapak/i,
    unit: 'm3',
    lower: 0.01,
    upper: 50000,
    basis:
      'Satu pile cap lazim bervolume 1–8 m³ dan total fondasi satu item pekerjaan berada jauh di bawah 50.000 m³; ' +
      'total di bawah 0,01 m³ (10 liter) lebih kecil dari elemen fondasi utuh mana pun sehingga pasti fragmen derivasi, bukan total pekerjaan.',
    belowSeverity: 'MEDIUM',
    aboveSeverity: 'MEDIUM',
  },
  {
    id: 'STRUCTURAL_CONCRETE_M3',
    category: 'Elemen beton struktural (balok/kolom/sloof/plat)',
    pattern: /balok|kolom|beam|column|sloof|plat|pelat|slab|ring\s?balk|ringbalk|\bdak\b/i,
    unit: 'm3',
    lower: 0.01,
    upper: 10000,
    basis:
      'Elemen beton lengkap terkecil (sloof 0,15×0,20×3 m ≈ 0,09 m³; kolom praktis 0,12×0,12×3 m ≈ 0,043 m³) berada di atas 0,01 m³, ' +
      'sehingga total item di bawah 0,01 m³ pasti fragmen satu elemen; total di atas 10.000 m³ untuk satu kelas elemen melampaui skala beton satu gedung dalam satu item.',
    belowSeverity: 'MEDIUM',
    aboveSeverity: 'MEDIUM',
  },
  {
    id: 'EARTHWORK_M3',
    category: 'Pekerjaan tanah (galian/timbunan/urugan)',
    pattern: /galian|penggalian|timbunan|penimbunan|urugan|excavat/i,
    unit: 'm3',
    lower: null,
    upper: 5000000,
    basis:
      'Pekerjaan tanah proyek tunggal yang sangat besar (timbunan bendungan besar) berorde 10⁶–10⁷ m³ sebagai TOTAL seluruh proyek; ' +
      'satu item di atas 5.000.000 m³ melampaui amplop itu sehingga wajib ditinjau. Tidak ada amplop bawah: galian kecil adalah pekerjaan yang sah.',
    belowSeverity: 'MEDIUM',
    aboveSeverity: 'HIGH',
  },
  {
    id: 'STONE_MASONRY_M3',
    category: 'Pasangan batu',
    pattern: /pasangan\s?batu|batu\s?kali|stone\s?masonry/i,
    unit: 'm3',
    lower: null,
    upper: 100000,
    basis:
      'Volume pasangan batu = panjang × tinggi × tebal (±0,3–0,6 m); total di atas 100.000 m³ menyiratkan lebih dari ±55 km dinding setinggi 3 m ' +
      'dalam SATU item — di luar skala pekerjaan pasangan batu satu proyek. Tidak ada amplop bawah.',
    belowSeverity: 'MEDIUM',
    aboveSeverity: 'MEDIUM',
  },
  {
    id: 'AREA_FINISH_M2',
    category: 'Penyelesaian luas (plafon/keramik/cat/waterproofing)',
    pattern: /plafon|plafond|keramik|pengecatan|waterproofing/i,
    unit: 'm2',
    lower: 0.1,
    upper: null,
    basis:
      'Total penyelesaian luas yang bermakna berskala ruangan (±0,5–1 m² ke atas); total di bawah 0,1 m² adalah fragmen derivasi, bukan total pekerjaan satu ruangan pun.',
    belowSeverity: 'MEDIUM',
    aboveSeverity: 'MEDIUM',
  },
];

type ScaleVerdictKind = 'BELOW' | 'ABOVE' | 'WITHIN';

interface ScaleVerdict {
  profile: ScaleProfile;
  verdict: ScaleVerdictKind;
  reasonCode: string | null;
  severity: DedQuantityReview['severity'];
}

/** Sumbu skala: cocokkan profil (pola kategori + gerbang satuan), lalu
 *  posisikan TOTAL item terhadap amplopnya. null = tidak ada profil
 *  yang berlaku (kategori tak terprofil — tidak dikarang). */
function evaluateScaleAxis(item: DedAiItem, unitNorm: string): ScaleVerdict | null {
  const q = item.quantity as number;
  const elementText = `${item.name || ''} ${item.category || ''}`;
  for (const profile of SCALE_PROFILES) {
    if (profile.unit !== unitNorm) continue;
    if (!profile.pattern.test(elementText)) continue;
    if (profile.lower !== null && q < profile.lower) {
      return { profile, verdict: 'BELOW', reasonCode: 'TOTAL_QUANTITY_BELOW_SCALE_ENVELOPE', severity: profile.belowSeverity };
    }
    if (profile.upper !== null && q > profile.upper) {
      // Di atas 10× amplop atas, severity naik satu tingkat ke HIGH
      // (kecuali sudah HIGH) — selip orde magnitudo ganda.
      const severity = q > profile.upper * 10 && profile.aboveSeverity !== 'HIGH' ? 'HIGH' : profile.aboveSeverity;
      return { profile, verdict: 'ABOVE', reasonCode: 'TOTAL_QUANTITY_ABOVE_SCALE_ENVELOPE', severity };
    }
    return { profile, verdict: 'WITHIN', reasonCode: null, severity: 'NONE' };
  }
  return null;
}

const SEVERITY_RANK: Record<DedQuantityReview['severity'], number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/**
 * Nilai kewajaran satu item berkuantitas. Mengembalikan null bila
 * kuantitas null / tidak valid (tidak ada yang dapat dinilai — pemanggil
 * tidak menempelkan anotasi apa pun).
 */
function evaluateDerivationAxis(item: DedAiItem): DedQuantityReview | null {
  const q = item.quantity;
  if (q === null || q === undefined || !Number.isFinite(q) || q <= 0) return null;

  const unitNorm = normalizeUnit(item.units);
  const shape = shapeForUnit(item.units);
  const elementText = `${item.name || ''} ${item.category || ''}`;
  const rc = recompute(item, shape);

  // Aturan 1 — diameter saja untuk klaim linear/volumetrik.
  if (rc.diameterOnly && (shape === 'LENGTH' || shape === 'VOLUME')) {
    return review(
      'INSUFFICIENT_CONTEXT',
      'DIAMETER_ONLY_DIMENSION',
      `Satu-satunya dimensi yang tercantum adalah diameter ("${(item.rawDimensions || '').trim()}") — ` +
        `diameter bukan panjang/volume elemen, sehingga kewajaran kuantitas ${fmt(q)} ${item.units} tidak dapat dinilai dari derivasi yang aman.`,
      'MEDIUM',
      item,
      null
    );
  }

  // Aturan 2a — satuan item tidak dikenal.
  if (!KNOWN_UNITS.has(unitNorm)) {
    return review(
      'INSUFFICIENT_CONTEXT',
      'AMBIGUOUS_UNIT',
      `Satuan "${item.units}" tidak dikenali evaluator sehingga bentuk kuantitasnya (volume/luas/panjang/hitung) tidak pasti — kewajaran tidak dapat dinilai.`,
      'MEDIUM',
      item,
      null
    );
  }

  // Aturan 2b — dimensi tanpa penanda satuan: skala tak dapat dipercaya.
  if (rc.dimensionUnitAmbiguous && shape !== 'COUNT') {
    return review(
      'INSUFFICIENT_CONTEXT',
      'AMBIGUOUS_DIMENSION_UNIT',
      `Dimensi item tidak mencantumkan satuan panjang eksplisit (mm/cm/m) sehingga hitung-ulang berskala pasti tidak mungkin — kewajaran kuantitas ${fmt(q)} ${item.units} tidak dapat dinilai.`,
      'MEDIUM',
      item,
      null
    );
  }

  // Dukungan penjelasan dari hitung-ulang / derivasi.
  const derivationResult =
    item.derivation && typeof item.derivation.result === 'number' && Number.isFinite(item.derivation.result)
      ? item.derivation.result
      : null;
  let explainedBy: 'DIMENSIONS' | 'COUNT' | 'DERIVATION' | null = null;
  let explainedCount: number | null = null;
  let derived: number | null = rc.base;
  if (derivationResult !== null) {
    derived = derivationResult;
    if (approxEqual(q, derivationResult, 0.02)) explainedBy = 'DERIVATION';
  } else if (rc.base !== null && rc.base > 0) {
    if (approxEqual(q, rc.base, 0.25)) {
      explainedBy = 'DIMENSIONS';
    } else {
      // Kandidat jumlah eksplisit: base × kandidat ≈ kuantitas.
      for (const c of rc.candidateCounts) {
        if (approxEqual(q, rc.base * c, 0.02)) {
          explainedBy = 'COUNT';
          explainedCount = c;
          derived = rc.base * c;
          break;
        }
      }
      if (explainedBy === null) {
        // Jumlah implisit: kuantitas ≈ base × bilangan bulat berarti
        // dekomposisi pengulangan yang konsisten. DIBATASI ≤ 100 dan di
        // dalam pita selip-skala: rasio 1000 (selip mm↔m kanonis) TIDAK
        // boleh "dijelaskan" sebagai 1000 elemen — jumlah sebesar itu
        // harus terdokumentasi (kandidat eksplisit di atas), bukan
        // ditebak dari rasio.
        const implied = Math.round(q / rc.base);
        if (implied >= 2 && implied <= 100 && approxEqual(q, rc.base * implied, 0.02)) {
          explainedBy = 'COUNT';
          explainedCount = implied;
          derived = rc.base * implied;
        }
      }
    }
  }

  // Aturan 3 — selisih hasil hitung-ulang di luar pita selip-skala.
  if (rc.base !== null && explainedBy === null) {
    if (rc.base <= 0 && q > 0) {
      return review(
        'NEEDS_REVIEW',
        'DIMENSION_RESULT_MISMATCH',
        `Dimensi item menghasilkan hitung-ulang 0 (ada faktor nol pada dimensi) tetapi kuantitas tercatat ${fmt(q)} ${item.units} — derivasi tidak konsisten dan harus diperiksa.`,
        'HIGH',
        item,
        rc.base
      );
    }
    if (rc.base > 0) {
      const ratio = q / rc.base;
      if (ratio > 100 || ratio < 0.01) {
        return review(
          'NEEDS_REVIEW',
          'DIMENSION_RESULT_MISMATCH',
          `Kuantitas tercatat ${fmt(q)} ${item.units} berbeda ${fmt(Math.max(ratio, 1 / ratio))}× dari hitung-ulang dimensi (${fmt(rc.base)} ${item.units}) — ` +
            `selisih sebesar ini adalah pola khas selip satuan (mm↔m/cm↔m) atau salah salin, dan harus ditinjau sebelum dipakai.`,
          'HIGH',
          item,
          rc.base
        );
      }
    }
  }

  // Aturan 4 — mikro volumetrik struktural yang tak dijelaskan dimensi.
  if (
    shape === 'VOLUME' &&
    q < 0.01 &&
    STRUCTURAL_ELEMENT_PATTERN.test(elementText) &&
    explainedBy === null
  ) {
    return review(
      'NEEDS_REVIEW',
      'MICRO_QUANTITY_CONTEXT',
      `Kuantitas ${fmt(q)} m³ sangat kecil untuk elemen struktural (${item.name}) dan tidak dijelaskan oleh hitung-ulang dimensinya — ` +
        `elemen struktural terkecil yang lazim pun berada di atas 0,01 m³, sehingga nilai ini kemungkinan sisa selip skala dan harus ditinjau.`,
      'MEDIUM',
      item,
      rc.base
    );
  }

  // Aturan 5 — skala elemen tunggal balok/kolom tanpa dukungan jumlah.
  if (
    shape === 'VOLUME' &&
    q > 10 &&
    SINGLE_ELEMENT_PATTERN.test(elementText) &&
    explainedBy !== 'COUNT'
  ) {
    return review(
      'NEEDS_REVIEW',
      'IMPLAUSIBLE_ELEMENT_SCALE',
      `Kuantitas ${fmt(q)} m³ diklaim untuk elemen ${item.name} tanpa dekomposisi jumlah pengulangan — ` +
        `satu elemen balok/kolom tunggal yang lazim tidak melebihi ±10 m³, sehingga nilai ini kemungkinan agregat banyak elemen atau salah skala dan harus ditinjau.`,
      q > 100 ? 'HIGH' : 'MEDIUM',
      item,
      rc.base
    );
  }

  // Aturan 6 — tanpa konteks derivasi apa pun untuk kuantitas geometrik.
  const formulaNumbers = parseDimensionsString(formulaHead(item.quantityFormula)).length > 0;
  if (
    shape !== 'COUNT' &&
    rc.base === null &&
    derivationResult === null &&
    !formulaNumbers &&
    item.quantitySource !== 'DED_EXPLICIT'
  ) {
    return review(
      'INSUFFICIENT_CONTEXT',
      'NO_DERIVATION_CONTEXT',
      `Kuantitas ${fmt(q)} ${item.units} tidak disertai dimensi, formula, atau jejak derivasi yang dapat diperiksa — kewajarannya tidak dapat dinilai dari konteks yang tersedia.`,
      'LOW',
      item,
      null
    );
  }

  // Aturan 7 — wajar, dengan kode basis yang jujur.
  if (explainedBy === 'COUNT') {
    return review(
      'REASONABLE',
      'REPEATED_OBJECTS',
      `Kuantitas ${fmt(q)} ${item.units} konsisten dengan hitung-ulang dimensi dikali jumlah pengulangan (${explainedCount ?? '?'} elemen).`,
      'NONE',
      item,
      derived
    );
  }
  if (explainedBy === 'DIMENSIONS' || explainedBy === 'DERIVATION') {
    return review(
      'REASONABLE',
      explainedBy === 'DIMENSIONS' ? 'DIMENSIONS_EXPLAIN_QUANTITY' : 'DERIVATION_TRAIL',
      `Kuantitas ${fmt(q)} ${item.units} konsisten dengan ${explainedBy === 'DIMENSIONS' ? 'hitung-ulang dimensinya' : 'jejak derivasi terstrukturnya'} (${fmt(derived ?? q)} ${item.units}).`,
      'NONE',
      item,
      derived
    );
  }
  if (item.quantitySource === 'DED_EXPLICIT') {
    return review(
      'REASONABLE',
      'STATED_IN_SOURCE',
      `Kuantitas ${fmt(q)} ${item.units} dinyatakan eksplisit di dokumen sumber; tidak ada ketidakkonsistenan skala yang terdeteksi.`,
      'NONE',
      item,
      derived
    );
  }
  if (shape === 'COUNT') {
    return review(
      'REASONABLE',
      'COUNT_UNIT',
      `Kuantitas ${fmt(q)} ${item.units} adalah satuan hitung yang tidak memerlukan derivasi dimensi; tidak ada ketidakkonsistenan skala yang terdeteksi.`,
      'NONE',
      item,
      derived
    );
  }
  return review(
    'REASONABLE',
    'DIMENSIONS_PRESENT',
    `Dimensi item tersedia dan tidak ada ketidakkonsistenan skala yang terdeteksi untuk kuantitas ${fmt(q)} ${item.units}.`,
    'NONE',
    item,
    derived
  );
}

/**
 * Evaluator kewajaran gabungan (Sprint 3.1 sumbu derivasi + Sprint 3.2
 * sumbu skala total-item). Kedua sumbu dievaluasi INDEPENDEN lalu
 * digabung deterministik mengikuti aturan di kepala berkas. Konteks
 * bersifat opsional dan hanya dicatat — bukan bukti.
 */
export function evaluateQuantityReasonableness(
  item: DedAiItem,
  context?: DedReasonablenessContext
): DedQuantityReview | null {
  const derivation = evaluateDerivationAxis(item);
  if (derivation === null) return null;

  const q = item.quantity as number;
  const unitNorm = normalizeUnit(item.units);
  const scale = evaluateScaleAxis(item, unitNorm);
  const contextUsed = context?.projectType
    ? `tipe proyek: ${context.projectType} (dicatat; amplop skala kategori tidak bergantung padanya)`
    : 'konteks proyek tidak tersedia (PROJECT_CONTEXT_MISSING) — amplop kategori diterapkan pada total item apa adanya';

  if (scale === null) {
    // Kategori tak terprofil: sumbu skala tidak berpendapat dan tidak
    // ada profil yang dikarang; hasil murni sumbu derivasi.
    return { ...derivation, category: null, scaleProfile: null, contextUsed };
  }

  const profileFields = {
    category: scale.profile.category,
    scaleProfile: scale.profile.id,
    contextUsed,
  };

  if (scale.verdict === 'WITHIN') {
    return {
      ...derivation,
      ...profileFields,
      scaleBasis:
        `${scale.profile.basis} Total item ${fmt(q)} ${item.units} berada DI DALAM amplop skala kategori ini.`,
      scaleReasonCode: null,
    };
  }

  const scaleReasonCode = scale.reasonCode as string;
  const scaleExplanation =
    scale.verdict === 'BELOW'
      ? `Total kuantitas ${fmt(q)} ${item.units} untuk kategori ${scale.profile.category} berada DI BAWAH amplop skala: ${scale.profile.basis} ` +
        `Penilaian ini independen dari dimensi klaim model — konsistensi hitung-ulang dimensi tidak dapat mengesahkan total sekecil ini.`
      : `Total kuantitas ${fmt(q)} ${item.units} untuk kategori ${scale.profile.category} berada DI ATAS amplop skala: ${scale.profile.basis} ` +
        `Penilaian ini independen dari dimensi klaim model — konsistensi hitung-ulang dimensi tidak dapat mengesahkan total sebesar ini.`;
  const scaleBasisText =
    `${scale.profile.basis} Total item ${fmt(q)} ${item.units} berada ${scale.verdict === 'BELOW' ? 'DI BAWAH' : 'DI ATAS'} amplop ` +
    `[${scale.profile.lower !== null ? fmt(scale.profile.lower) : '—'} .. ${scale.profile.upper !== null ? fmt(scale.profile.upper) : '—'}] ${item.units}.`;

  if (
    derivation.outcome === 'NEEDS_REVIEW' &&
    SEVERITY_RANK[derivation.severity] >= SEVERITY_RANK[scale.severity]
  ) {
    // Kedua sumbu menandai; diagnosis derivasi (severity tertinggi /
    // setara) dipertahankan sebagai alasan utama — kode skala dicatat
    // sebagai alasan sekunder agar tidak hilang.
    return {
      ...derivation,
      ...profileFields,
      scaleBasis: scaleBasisText,
      scaleReasonCode,
    };
  }

  // Sumbu skala menjadi alasan utama (derivasi wajar / konteks kurang /
  // severity lebih rendah): kode derivasi dicatat sebagai sekunder.
  return {
    outcome: 'NEEDS_REVIEW',
    reasonCode: scaleReasonCode,
    explanation:
      scaleExplanation +
      (derivation.outcome === 'REASONABLE'
        ? ' (Sumbu derivasi menilai kuantitas ini konsisten dengan dimensinya sendiri — dan justru konsistensi itulah yang tidak cukup.)'
        : ` (Sumbu derivasi: ${derivation.reasonCode}.)`),
    severity: scale.severity,
    originalQuantity: derivation.originalQuantity,
    derivedQuantity: derivation.derivedQuantity ?? null,
    ...profileFields,
    scaleBasis: scaleBasisText,
    derivationReasonCode: derivation.reasonCode,
  };
}

/**
 * Sprint 3.1: terapkan evaluator ke seluruh item hasil — pola yang sama
 * dengan applyQuantityEvidenceVerification (Sprint 3 B2): anotasi di
 * tempat, tanpa mengubah nilai/status/provenance apa pun. Item tanpa
 * kuantitas tidak disentuh. NEEDS_REVIEW juga meninggalkan penanda
 * singkat di quantityNote agar permukaan review yang sudah ada
 * menampilkannya (meniru pola catatan penurunan B2).
 */
export function applyQuantityReasonablenessReview(
  items: DedAiItem[],
  context?: DedReasonablenessContext
): DedAiItem[] {
  for (const item of items) {
    const result = evaluateQuantityReasonableness(item, context);
    if (result === null) continue;
    item.quantityReview = result;
    if (result.outcome === 'NEEDS_REVIEW') {
      const marker = `Tinjauan kewajaran kuantitas: ${result.explanation}`;
      if (!item.quantityNote || !item.quantityNote.includes(marker)) {
        item.quantityNote = [item.quantityNote, marker].filter(Boolean).join(' ');
      }
    }
  }
  return items;
}
