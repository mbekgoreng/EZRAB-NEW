/**
 * DED AI ESTIMATE — Validasi konflik spesifikasi material LANJUTAN
 * (Sprint 4, Tugas D). Modul pendamping `externalPriceReferences.ts`:
 * penjaga lama bekerja pada KATEGORI BESAR (aluminium vs kayu/UPVC/besi,
 * metal vs genteng berbatas kata, gypsum vs GRC/PVC). Modul ini menambah
 * perbandingan ATRIBUT grade/dimensi yang terstruktur — dengan sengaja
 * KONSERVATIF:
 *
 * - Atribut hanya diekstrak bila ANDAL dari teks: nilai numerik harus
 *   terikat pada kata benda domainnya (kedekatan teks), berada dalam
 *   rentang plausibilitas domain, dan tidak "dicuri" domain lain.
 * - Bandingkan HANYA atribut setara yang SAMA-SAMA tertulis di kedua
 *   sisi. Atribut hilang di salah satu sisi BUKAN konflik keras —
 *   hasilnya spesifikasi tak lengkap (tetap boleh cocok), kecuali
 *   atribut yang dinyatakan ESENSIAL per tabel di bawah (kelas beton
 *   bila referensi menyatakannya dan item adalah pekerjaan beton:
 *   NEEDS_VERIFICATION, karena kelas adalah atribut penentu harga
 *   beton dan tidak ada asumsi standar yang aman).
 * - Konflik KERAS hanya bila kedua sisi menyatakan nilai berbeda untuk
 *   atribut yang sama (himpunan saling lepas).
 * - Satu nilai item yang termasuk himpunan nilai referensi (referensi
 *   menyatakan rentang, mis. boven "30x50 sampai 40x60") = cocok.
 * - Tumpang tindih sebagian / notasi tak sebanding (K- vs f'c, diameter
 *   pipa inch vs mm) / banyak nilai yang tak tertampung rentang =
 *   NEEDS_VERIFICATION dengan alasan terbaca — BUKAN konflik keras dan
 *   BUKAN kecocokan diam-diam.
 * - Kata deskriptif non-esensial (warna, merek, "premium", finishing)
 *   TIDAK PERNAH diekstrak, jadi tidak pernah menolak kecocokan.
 * - Material yang tidak bisa dicocokkan dengan aman tetap unresolved:
 *   modul ini hanya bisa MENOLAK atau MENANDAI, tidak pernah mengisi
 *   harga dan tidak pernah menyatakan dua material "setara".
 *
 * Sisi referensi yang dibandingkan adalah `specAssumption` referensi —
 * pernyataan asumsi speknya sendiri. `sourceName` TIDAK dipakai: ia
 * string bibliografi yang menyebut banyak produk/harga lain.
 */

export type MaterialSpecAttributeKey =
  | 'lightSteelThicknessMm'
  | 'roofSheetThicknessMm'
  | 'aluminiumThicknessMm'
  | 'glassThicknessMm'
  | 'gypsumBoardThicknessMm'
  | 'grcBoardThicknessMm'
  | 'windowDimension'
  | 'cableSectionMm2'
  | 'concreteK'
  | 'concreteFcMpa'
  | 'rebarDiameterMm'
  | 'rebarGrade'
  | 'rebarType'
  | 'pipeDiameterMm'
  | 'pipeDiameterInch'
  | 'pipeMaterial'
  | 'roofCoatingGrade'
  | 'paintCoats';

export interface ParsedMaterialSpec {
  /** Nilai kanonis per atribut (string ternormalisasi, himpunan). */
  attributes: Partial<Record<MaterialSpecAttributeKey, string[]>>;
  /** Cuplikan teks mentah yang menjadi bukti ekstraksi per atribut. */
  evidence: Partial<Record<MaterialSpecAttributeKey, string[]>>;
}

export type MaterialSpecVerdict =
  | 'COMPATIBLE'              // semua atribut yang sama-sama tertulis cocok
  | 'COMPATIBLE_INCOMPLETE'   // tidak ada konflik; sebagian atribut hanya tertulis di satu sisi
  | 'NEEDS_VERIFICATION'      // ambigu / notasi tak sebanding / atribut esensial hilang
  | 'HARD_CONFLICT';          // kedua sisi menyatakan nilai berbeda untuk atribut yang sama

export interface MaterialSpecComparison {
  attribute: MaterialSpecAttributeKey;
  itemValues: string[];
  referenceValues: string[];
  outcome: 'MATCH' | 'ITEM_MISSING' | 'REFERENCE_MISSING' | 'HARD_CONFLICT' | 'AMBIGUOUS';
  /** Penjelasan terbaca manusia (dipakai alasan penolakan/penanda). */
  note: string;
}

export interface MaterialSpecValidation {
  verdict: MaterialSpecVerdict;
  comparisons: MaterialSpecComparison[];
  /**
   * Alasan terbaca untuk HARD_CONFLICT / NEEDS_VERIFICATION (null bila
   * cocok). Format stabil: konflik keras diawali "konflik spesifikasi
   * material:"; kebutuhan verifikasi diawali "spesifikasi perlu
   * verifikasi:" — pemanggil lama (`referenceSpecConflict`) meneruskan
   * string ini apa adanya.
   */
  reason: string | null;
  itemSpec: ParsedMaterialSpec;
  referenceSpec: ParsedMaterialSpec;
}

// ---------------------------------------------------------------------------
// Konfigurasi atribut: label, perlakuan nilai hilang, kekerasan konflik.
// ---------------------------------------------------------------------------

interface AttributeConfig {
  label: string;
  /**
   * Perlakuan bila REFERENSI menyatakan atribut tetapi ITEM tidak:
   * - 'MATCH': spesifikasi tak lengkap — tetap boleh cocok (asumsi
   *   referensi berlaku; nama item DED lazimnya tidak memuat atribut
   *   ini, dan memblokir akan mengosongkan harga item generik yang sah).
   * - 'NEEDS_VERIFICATION': atribut esensial penentu harga; tanpa
   *   pernyataan item, kecocokan tidak aman.
   */
  whenItemMissing: 'MATCH' | 'NEEDS_VERIFICATION';
  /**
   * true: himpunan saling lepas = konflik KERAS.
   * false: himpunan saling lepas = NEEDS_VERIFICATION (atribut yang
   * ekstraksi/interpretasinya paling tidak pasti — dimensi jendela per
   * unit, yang harganya dinyatakan referensi sebagai rentang lebar).
   */
  hardOnDisjoint: boolean;
}

export const MATERIAL_SPEC_ATTRIBUTES: Record<MaterialSpecAttributeKey, AttributeConfig> = {
  lightSteelThicknessMm: { label: 'ketebalan baja ringan', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  roofSheetThicknessMm: { label: 'ketebalan lembaran atap metal/spandek', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  aluminiumThicknessMm: { label: 'ketebalan profil aluminium', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  glassThicknessMm: { label: 'ketebalan kaca', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  gypsumBoardThicknessMm: { label: 'ketebalan papan gypsum', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  grcBoardThicknessMm: { label: 'ketebalan papan GRC/kalsiboard', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  windowDimension: { label: 'dimensi jendela/boven', whenItemMissing: 'MATCH', hardOnDisjoint: false },
  cableSectionMm2: { label: 'penampang kabel', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  concreteK: { label: 'kelas beton K-', whenItemMissing: 'NEEDS_VERIFICATION', hardOnDisjoint: true },
  concreteFcMpa: { label: "kuat tekan beton f'c", whenItemMissing: 'NEEDS_VERIFICATION', hardOnDisjoint: true },
  rebarDiameterMm: { label: 'diameter besi tulangan', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  rebarGrade: { label: 'grade besi tulangan', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  rebarType: { label: 'jenis besi tulangan (polos/ulir)', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  pipeDiameterMm: { label: 'diameter pipa (mm)', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  pipeDiameterInch: { label: 'diameter pipa (inch)', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  pipeMaterial: { label: 'material pipa', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  roofCoatingGrade: { label: 'kelas coating atap (AZ)', whenItemMissing: 'MATCH', hardOnDisjoint: true },
  paintCoats: { label: 'jumlah lapis cat', whenItemMissing: 'MATCH', hardOnDisjoint: true },
};

// ---------------------------------------------------------------------------
// Ekstraksi atribut terstruktur (hanya yang andal)
// ---------------------------------------------------------------------------

function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2') // koma desimal Indonesia → titik
    .replace(/²/g, '2');            // mm² → mm2 agar satu pola berlaku
}

const fmtNum = (n: number): string => String(Math.round(n * 1000) / 1000);

interface MmClaim { value: number; index: number; raw: string }

/** Semua kemunculan "<angka> mm" (bukan mm2) beserta posisinya. */
function allMmValues(t: string): MmClaim[] {
  const out: MmClaim[] = [];
  const re = /(\d+(?:\.\d+)?)\s*mm\b(?!2)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) out.push({ value: parseFloat(m[1]), index: m.index, raw: m[0] });
  return out;
}

/** Kata benda material yang BUKAN domain ketebalan ini — penjaga anti-curi. */
const FOREIGN_NOUNS = [
  'multipleks', 'multiplex', 'kayu', 'beton', 'keramik', 'granit', 'marmer',
  'bata', 'hollow', 'besi', 'papan', 'lebar', 'tinggi', 'panjang', 'jarak',
];

/**
 * Klaim nilai mm untuk satu domain ketebalan:
 * 1. Kedekatan: kata kunci domain muncul ≤20 karakter sebelum nilai.
 * 2. Fallback aman: teks memuat TEPAT SATU nilai mm, nilai itu belum
 *    diklaim domain lain, kata kunci domain ada di teks, dan jendela
 *    nilai tidak memuat kata benda material asing.
 * Nilai di luar rentang plausibilitas domain tidak pernah diklaim.
 */
function claimThickness(
  t: string,
  claims: MmClaim[],
  keywords: string[],
  range: [number, number],
  claimedIndexes: Set<number>,
): { values: string[]; evidence: string[] } {
  const values = new Set<string>();
  const evidence: string[] = [];
  const inRange = (v: number) => v >= range[0] && v <= range[1];
  for (const c of claims) {
    if (!inRange(c.value) || claimedIndexes.has(c.index)) continue;
    const before = t.slice(Math.max(0, c.index - 20), c.index);
    if (keywords.some((k) => before.includes(k))) {
      values.add(fmtNum(c.value));
      evidence.push(c.raw);
      claimedIndexes.add(c.index);
    }
  }
  if (values.size === 0 && claims.length === 1) {
    const c = claims[0];
    if (inRange(c.value) && !claimedIndexes.has(c.index)
      && keywords.some((k) => t.includes(k))) {
      const before = t.slice(Math.max(0, c.index - 24), c.index);
      if (!FOREIGN_NOUNS.some((n) => before.includes(n))) {
        values.add(fmtNum(c.value));
        evidence.push(c.raw);
        claimedIndexes.add(c.index);
      }
    }
  }
  return { values: [...values], evidence };
}

function addAttr(
  spec: ParsedMaterialSpec,
  key: MaterialSpecAttributeKey,
  values: string[],
  evidence: string[],
): void {
  if (values.length === 0) return;
  spec.attributes[key] = [...new Set(values)].sort();
  spec.evidence[key] = evidence;
}

/**
 * Parse atribut spesifikasi terstruktur dari teks bebas (nama item,
 * specAssumption referensi, atau teks spek lain). Mengembalikan hanya
 * atribut yang ekstraksinya andal; teks tanpa atribut yang dikenal
 * menghasilkan `attributes` kosong — BUKAN tebakan.
 */
export function parseMaterialSpec(rawText: string): ParsedMaterialSpec {
  const spec: ParsedMaterialSpec = { attributes: {}, evidence: {} };
  const original = String(rawText || '');
  const t = normalizeText(original);

  // --- Ketebalan berbasis kedekatan domain (urutan = prioritas klaim:
  // domain paling spesifik lebih dulu agar nilainya tidak dicuri). ---
  const claims = allMmValues(t);
  const claimed = new Set<number>();
  const thicknessDomains: Array<{
    key: MaterialSpecAttributeKey; keywords: string[]; range: [number, number];
  }> = [
    { key: 'glassThicknessMm', keywords: ['kaca'], range: [2, 19] },
    { key: 'gypsumBoardThicknessMm', keywords: ['gypsum', 'gipsum'], range: [3, 25] },
    { key: 'grcBoardThicknessMm', keywords: ['grc', 'kalsiboard', 'kalsium silikat', 'kalsi'], range: [3, 25] },
    { key: 'lightSteelThicknessMm', keywords: ['baja ringan', 'kanal c', 'canal c'], range: [0.2, 3] },
    { key: 'roofSheetThicknessMm', keywords: ['spandek', 'metal deck', 'dek metal', 'genteng metal'], range: [0.2, 1.2] },
    { key: 'aluminiumThicknessMm', keywords: ['aluminium', 'alumunium', 'almunium'], range: [0.5, 4] },
  ];
  for (const d of thicknessDomains) {
    const r = claimThickness(t, claims, d.keywords, d.range, claimed);
    addAttr(spec, d.key, r.values, r.evidence);
  }

  // --- Penampang kabel: "<angka> mm2" (NYM 3×2.5 mm2 → yang terikat
  // satuan mm2 adalah 2.5, bukan jumlah inti 3). ---
  {
    const values: string[] = [];
    const evidence: string[] = [];
    const re = /(\d+(?:\.\d+)?)\s*mm2\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) { values.push(fmtNum(parseFloat(m[1]))); evidence.push(m[0]); }
    addAttr(spec, 'cableSectionMm2', values, evidence);
  }

  // --- Kelas beton: K-<3 digit> dan f'c <angka> MPa adalah DUA notasi
  // terpisah; tidak pernah dikonversi satu sama lain di sini. ---
  {
    const k: string[] = [];
    const kEv: string[] = [];
    const reK = /\bk[-\s]?(\d{3})\b/g;
    let m: RegExpExecArray | null;
    while ((m = reK.exec(t)) !== null) { k.push(String(parseInt(m[1], 10))); kEv.push(m[0]); }
    addAttr(spec, 'concreteK', k, kEv);
    const fc: string[] = [];
    const fcEv: string[] = [];
    const reFc = /f'?\s*c\s*(\d+(?:\.\d+)?)\s*mpa/g;
    while ((m = reFc.exec(t)) !== null) { fc.push(fmtNum(parseFloat(m[1]))); fcEv.push(m[0]); }
    addAttr(spec, 'concreteFcMpa', fc, fcEv);
  }

  // --- Besi tulangan: diameter Ø/D (teks ASLI untuk D kapital),
  // grade BJTP/BJTS / fy, dan jenis polos/ulir. Konteks pipa mengambil
  // alih simbol Ø untuk diameter pipa, bukan tulangan. ---
  const isPipeText = /\bpipa\b/.test(t);
  {
    const dia: string[] = [];
    const diaEv: string[] = [];
    if (!isPipeText) {
      const reO = /[øØ]\s*(\d+(?:\.\d+)?)/g;
      let m: RegExpExecArray | null;
      while ((m = reO.exec(original)) !== null) { dia.push(fmtNum(parseFloat(m[1]))); diaEv.push(m[0]); }
      const reD = /\bD\s*-?\s*(\d{1,2})\b/g;
      while ((m = reD.exec(original)) !== null) { dia.push(fmtNum(parseFloat(m[1]))); diaEv.push(m[0]); }
      // "besi 10 mm" / "besi Ø10" tanpa simbol di atas: besi + angka mm dekat.
      if (dia.length === 0 && /\bbesi\b|tulangan|pembesian/.test(t)) {
        for (const c of claims) {
          const before = t.slice(Math.max(0, c.index - 20), c.index);
          if ((before.includes('besi') || before.includes('tulangan')) && c.value >= 4 && c.value <= 40) {
            dia.push(fmtNum(c.value));
            diaEv.push(c.raw);
          }
        }
      }
    }
    addAttr(spec, 'rebarDiameterMm', dia, diaEv);
    const grade: string[] = [];
    const gradeEv: string[] = [];
    const reG = /\b(bjts?|bjtp|bjtd)\s*-?\s*(\d+)/g;
    let g: RegExpExecArray | null;
    while ((g = reG.exec(t)) !== null) { grade.push(`${g[1].toUpperCase()}${g[2]}`); gradeEv.push(g[0]); }
    const reFy = /\bfy\s*=?\s*(\d+)/g;
    while ((g = reFy.exec(t)) !== null) { grade.push(`FY${g[1]}`); gradeEv.push(g[0]); }
    addAttr(spec, 'rebarGrade', grade, gradeEv);
    const type: string[] = [];
    if (/\bpolos\b/.test(t)) type.push('POLOS');
    if (/\bulir\b|\bdeform/.test(t)) type.push('ULIR');
    addAttr(spec, 'rebarType', type, type);
  }

  // --- Pipa: material + diameter. Diameter inch dan mm TIDAK dicampur
  // (ukuran nominal pipa ≠ diameter luar aktual), jadi disimpan sebagai
  // dua atribut terpisah dan dibandingkan lintas-satuan sebagai ambigu. ---
  if (isPipeText) {
    const mats: string[] = [];
    for (const [re, name] of [
      [/\bhdpe\b/, 'HDPE'], [/\bppr\b/, 'PPR'], [/\bupvc\b/, 'UPVC'],
      [/\bpvc\b/, 'PVC'], [/\bgalvanis\b/, 'GALVANIS'], [/\bstainless\b/, 'STAINLESS'],
    ] as Array<[RegExp, string]>) {
      if (re.test(t)) mats.push(name);
    }
    addAttr(spec, 'pipeMaterial', mats, mats);
    const inch: string[] = [];
    const inchEv: string[] = [];
    const reFrac = /(\d+)\s*\/\s*(\d+)\s*(?:"|inch|in\b)/g;
    let m: RegExpExecArray | null;
    while ((m = reFrac.exec(t)) !== null) {
      // Pecahan campuran ("1 1/2\"") ditangani pola campuran di bawah.
      const beforeFrac = t.slice(Math.max(0, m.index - 3), m.index);
      if (/\d\s+$/.test(beforeFrac)) continue;
      inch.push(fmtNum(parseInt(m[1], 10) / parseInt(m[2], 10)));
      inchEv.push(m[0]);
    }
    const reMixed = /(\d+)\s+(\d+)\s*\/\s*(\d+)\s*(?:"|inch)/g;
    while ((m = reMixed.exec(t)) !== null) {
      inch.push(fmtNum(parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10)));
      inchEv.push(m[0]);
    }
    const reInt = /(\d+(?:\.\d+)?)\s*(?:"|inch\b)/g;
    while ((m = reInt.exec(t)) !== null) {
      // Hindari klaim ganda atas penyebut pecahan yang sudah tercatat
      // (mis. "3/4\"" atau "1 1/2\""): angka yang didahului '/' adalah
      // penyebut, bukan diameter utuh.
      if (t.charAt(m.index - 1) === '/') continue;
      inch.push(fmtNum(parseFloat(m[1])));
      inchEv.push(m[0]);
    }
    addAttr(spec, 'pipeDiameterInch', inch, inchEv);
    const mm: string[] = [];
    const mmEv: string[] = [];
    for (const c of claims) {
      const before = t.slice(Math.max(0, c.index - 24), c.index);
      if (before.includes('pipa') || /[øØ]\s*$/.test(before)) { mm.push(fmtNum(c.value)); mmEv.push(c.raw); }
    }
    const reO = /[øØ]\s*(\d+(?:\.\d+)?)\s*mm/g;
    while ((m = reO.exec(t)) !== null) { mm.push(fmtNum(parseFloat(m[1]))); mmEv.push(m[0]); }
    addAttr(spec, 'pipeDiameterMm', mm, mmEv);
  }

  // --- Dimensi jendela/boven/pintu: pola WxH. Penjaga:
  // - hanya pada teks berkonteks kusen/jendela/boven/pintu;
  // - kedua sisi ≥ 10 (menyaring pola kabel "3x2.5" dan rasio kecil);
  // - kemunculan yang didahului frasa perbandingan ("lebih besar dari",
  //   "mulai dari") adalah TITIK ACUAN sumber, bukan dimensi asumsi —
  //   dilewati;
  // - nilai > 300 dianggap mm dan dikonversi ke cm. ---
  if (/jendela|boven|pintu|kusen|ventilasi/.test(t)) {
    const dims: string[] = [];
    const ev: string[] = [];
    const re = /(\d{2,4})\s*[x×]\s*(\d{2,4})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const before = t.slice(Math.max(0, m.index - 18), m.index);
      if (/\bdari\s*$/.test(before)) continue; // frasa perbandingan: titik acuan, bukan dimensi asumsi
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (Math.min(a, b) < 10) continue;
      if (a > 300 || b > 300) { a = Math.round(a / 10); b = Math.round(b / 10); }
      dims.push(`${Math.min(a, b)}x${Math.max(a, b)}`);
      ev.push(m[0]);
    }
    addAttr(spec, 'windowDimension', dims, ev);
  }

  // --- Grade atap: kelas coating AZ (AZ70/AZ100/AZ150). Huruf grade
  // generik ("grade A") TIDAK dibandingkan — semantiknya berbeda antar
  // vendor sehingga tidak andal. ---
  {
    const grades: string[] = [];
    const ev: string[] = [];
    const re = /\baz\s*-?\s*(\d{2,3})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) { grades.push(`AZ${m[1]}`); ev.push(m[0]); }
    addAttr(spec, 'roofCoatingGrade', grades, ev);
  }

  // --- Cat: hanya JUMLAH LAPIS yang dibandingkan. Merek, warna, dan
  // kata sistem/finishing adalah deskriptif non-esensial di sini. ---
  {
    const coats: string[] = [];
    const ev: string[] = [];
    const re = /(\d+)\s*(?:lapis|coat)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) { coats.push(String(parseInt(m[1], 10))); ev.push(m[0]); }
    addAttr(spec, 'paintCoats', coats, ev);
  }

  return spec;
}

// ---------------------------------------------------------------------------
// Perbandingan
// ---------------------------------------------------------------------------

function setsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}
function isSubset(a: string[], b: string[]): boolean {
  return a.every((v) => b.includes(v));
}

/**
 * Bandingkan spesifikasi ITEM terhadap spesifikasi REFERENSI.
 * Mengembalikan verdict + perbandingan per atribut + alasan terbaca.
 * Fungsi murni; tidak mengubah apa pun dan tidak menghasilkan harga.
 */
export function validateMaterialSpec(itemText: string, referenceText: string): MaterialSpecValidation {
  const itemSpec = parseMaterialSpec(itemText);
  const referenceSpec = parseMaterialSpec(referenceText);
  const comparisons: MaterialSpecComparison[] = [];
  const hardReasons: string[] = [];
  const verifyReasons: string[] = [];

  const keys = new Set<MaterialSpecAttributeKey>([
    ...(Object.keys(itemSpec.attributes) as MaterialSpecAttributeKey[]),
    ...(Object.keys(referenceSpec.attributes) as MaterialSpecAttributeKey[]),
  ]);

  for (const key of keys) {
    const cfg = MATERIAL_SPEC_ATTRIBUTES[key];
    const iv = itemSpec.attributes[key] ?? [];
    const rv = referenceSpec.attributes[key] ?? [];
    if (iv.length > 0 && rv.length > 0) {
      if (setsEqual(iv, rv) || isSubset(iv, rv) || isSubset(rv, iv)) {
        comparisons.push({
          attribute: key, itemValues: iv, referenceValues: rv, outcome: 'MATCH',
          note: `${cfg.label}: item ${iv.join('/')} tercakup referensi ${rv.join('/')}`,
        });
      } else if (iv.some((v) => rv.includes(v))) {
        const note = `${cfg.label}: nilai tumpang tindih sebagian (item ${iv.join('/')} vs referensi ${rv.join('/')}) — cakupan tidak dapat dipastikan`;
        comparisons.push({ attribute: key, itemValues: iv, referenceValues: rv, outcome: 'AMBIGUOUS', note });
        verifyReasons.push(note);
      } else if (cfg.hardOnDisjoint) {
        const note = `${cfg.label} item ${iv.join('/')} berbeda dari referensi ${rv.join('/')}`;
        comparisons.push({ attribute: key, itemValues: iv, referenceValues: rv, outcome: 'HARD_CONFLICT', note });
        hardReasons.push(note);
      } else {
        const note = `${cfg.label} item ${iv.join('/')} berbeda dari referensi ${rv.join('/')} — atribut ini tidak cukup pasti untuk penolakan keras`;
        comparisons.push({ attribute: key, itemValues: iv, referenceValues: rv, outcome: 'AMBIGUOUS', note });
        verifyReasons.push(note);
      }
    } else if (rv.length > 0) {
      // Atribut hanya di referensi.
      if (cfg.whenItemMissing === 'NEEDS_VERIFICATION' && key.startsWith('concrete')
        && /\bbeton\b/.test(normalizeText(itemText))) {
        const note = `${cfg.label}: referensi menyatakan ${rv.join('/')} tetapi item pekerjaan beton tidak menyatakan kelas/kuat tekan — kecocokan tidak aman`;
        comparisons.push({ attribute: key, itemValues: iv, referenceValues: rv, outcome: 'AMBIGUOUS', note });
        verifyReasons.push(note);
      } else {
        comparisons.push({
          attribute: key, itemValues: iv, referenceValues: rv, outcome: 'ITEM_MISSING',
          note: `${cfg.label}: hanya referensi yang menyatakan (${rv.join('/')}) — spesifikasi item tak lengkap, asumsi referensi berlaku`,
        });
      }
    } else {
      comparisons.push({
        attribute: key, itemValues: iv, referenceValues: rv, outcome: 'REFERENCE_MISSING',
        note: `${cfg.label}: hanya item yang menyatakan (${iv.join('/')}) — referensi tidak membatasi atribut ini`,
      });
    }
  }

  // --- Ambiguitas lintas-notasi (kedua sisi menyatakan, tak sebanding):
  // kelas beton K- vs f'c (tanpa tabel konversi resmi di modul ini) dan
  // diameter pipa inch vs mm (nominal vs aktual). ---
  const crossNotation: Array<[MaterialSpecAttributeKey, MaterialSpecAttributeKey, string]> = [
    ['concreteK', 'concreteFcMpa', 'kelas beton dinyatakan dalam notasi berbeda (K- vs f\'c) tanpa tabel konversi — tidak dibandingkan langsung'],
    ['pipeDiameterMm', 'pipeDiameterInch', 'diameter pipa dinyatakan dalam satuan berbeda (mm vs inch; nominal vs aktual) — tidak dibandingkan langsung'],
  ];
  for (const [a, b, label] of crossNotation) {
    const itemA = itemSpec.attributes[a] ?? [];
    const itemB = itemSpec.attributes[b] ?? [];
    const refA = referenceSpec.attributes[a] ?? [];
    const refB = referenceSpec.attributes[b] ?? [];
    const itemHasEither = itemA.length > 0 || itemB.length > 0;
    const refHasEither = refA.length > 0 || refB.length > 0;
    const sameNotationCompared =
      (itemA.length > 0 && refA.length > 0) || (itemB.length > 0 && refB.length > 0);
    if (itemHasEither && refHasEither && !sameNotationCompared) {
      verifyReasons.push(label);
      comparisons.push({
        attribute: a,
        itemValues: [...itemA, ...itemB],
        referenceValues: [...refA, ...refB],
        outcome: 'AMBIGUOUS',
        note: label,
      });
    }
  }

  let verdict: MaterialSpecVerdict;
  let reason: string | null = null;
  if (hardReasons.length > 0) {
    verdict = 'HARD_CONFLICT';
    reason = `konflik spesifikasi material: ${hardReasons.join('; ')}`;
  } else if (verifyReasons.length > 0) {
    verdict = 'NEEDS_VERIFICATION';
    reason = `spesifikasi perlu verifikasi: ${verifyReasons.join('; ')}`;
  } else if (comparisons.some((c) => c.outcome === 'ITEM_MISSING' || c.outcome === 'REFERENCE_MISSING')) {
    verdict = 'COMPATIBLE_INCOMPLETE';
  } else {
    verdict = 'COMPATIBLE';
  }
  return { verdict, comparisons, reason, itemSpec, referenceSpec };
}
