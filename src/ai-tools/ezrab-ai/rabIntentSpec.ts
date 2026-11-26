/**
 * EZRAB AI — RAB intent-spec model + extractor (src/ai-tools/ezrab-ai/rabIntentSpec.ts)
 *
 * Modul INTENT-FIRST untuk Chat AI → RAB (Worker A, FIX global Chat AI RAB).
 * Mengubah permintaan RAB berbahasa Indonesia bebas menjadi `RabIntentSpec`
 * yang KANONIS: setiap field yang tidak disebut pengguna secara eksplisit
 * tetap `null` / array kosong (UNKNOWN) — TIDAK PERNAH dikarang, TIDAK
 * PERNAH diisi default dari template, dan TIDAK PERNAH dihitung diam-diam
 * (mis. luas dari dimensi, jumlah kamar dari luas, atau "Type 70" dari
 * penyebutan "type 70").
 *
 * API ini FROZEN — Worker B (klarifikasi + builder RAB) mengode terhadap
 * ekspor di bawah ini persis seperti tertulis. Jangan ubah nama ekspor
 * maupun signature tanpa koordinasi dengan Worker B.
 *
 * Aturan inti:
 *  - `null` / `[]` = UNKNOWN. `explicitFields` = field yang benar-benar
 *    disebut pengguna.
 *  - Luas tanah vs luas bangunan adalah dua field terpisah. "luas" telanjang
 *    berarti luas BANGUNAN, KECUALI bila sebuah luas-bangunan berkualifikasi
 *    juga muncul — barulah "luas" telanjang dibaca sebagai luas tanah.
 *  - Dimensi (mis. 6x12) TIDAK PERNAH diturunkan menjadi luas bangunan.
 *  - "type 70" / "tipe 36" dan sejenisnya BUKAN luas — tidak mengisi field
 *    apa pun.
 *  - `mergeRabIntentSpec` hanya menimpa field yang disebut eksplisit di
 *    teks koreksi; sisanya (termasuk `explicitFields`) dipertahankan.
 *  - `identifyMissingSpec` hanya mengembalikan field yang relevan dengan
 *    jenis bangunan dan belum diketahui; untuk `source === 'ded'` ia
 *    mengembalikan [] karena gambar kerja adalah sumber kebenarannya.
 *
 * Murni deterministik, tanpa LLM, tanpa I/O. Satu-satunya dependensi
 * adalah rabNeeds.ts: parser budget KANONIS (S1-R2/F11 — satu parser
 * untuk keempat situs budget) + ekstraksi ukuran universal bersama
 * (S1-R3 — bentang/tebal/volume/jumlah yang sama dengan UniversalSpec).
 */

import { parseBudgetMentions, extractUniversalMeasures } from './rabNeeds';
import type { UniversalSpec } from './universalRab';

/* ------------------------------------------------------------------ */
/* Model kanonis (FROZEN — jangan ubah)                                */
/* ------------------------------------------------------------------ */

/**
 * Sub-model UNIVERSAL di dalam spek rumah (W2/W10 §2, S1-R3 —
 * unifikasi spek): ukuran lintas disiplin (bentang, tebal, volume,
 * jumlah) yang tidak punya kolom di RabIntentSpec. Diisi
 * extractRabIntentSpec dari teks yang sama (parser bersama
 * extractUniversalMeasures) agar jalur rumah dapat MEMBACA field
 * universal tanpa kehilangan data; jembatan dua arah
 * (universalSpecToRabIntent / rabIntentSpecToUniversal di
 * universalRab.ts) memakainya untuk round-trip lossless.
 * Absen (undefined) = tidak satu pun ukuran universal disebut.
 */
export interface UniversalSpecView {
  spanM: number | null;
  widthM: number | null;
  heightM: number | null;
  thicknessCm: number | null;
  volumeM3: number | null;
  count: number | null;
  depthM: number | null;
}

/**
 * Sub-model RUMAH di dalam spek universal (W2/W10 §2, S1-R3): field
 * rumah yang tidak punya kolom di UniversalSpec (kamar, kualitas,
 * pengecualian, sistem atap/pondasi/struktur, lingkup, jenis/fungsi
 * bangunan, kategori proyek). Dibaca jalur universal lewat
 * UniversalSpec.house / UniversalIntakeContext.house; dibuat dari
 * RabIntentSpec oleh houseViewFromSpec. Field null/[] = UNKNOWN
 * (tidak pernah dikarang).
 */
export interface HouseSpecView {
  bedrooms: number | null;
  bathrooms: number | null;
  quality: string | null;
  exclusions: string[];
  roofSystem: string[];
  foundationSystem: string | null;
  structuralSystem: string[];
  scope: string[];
  buildingType: string | null;
  buildingFunction: string | null;
  projectCategory: string | null;
}

/** View rumah dari satu RabIntentSpec — null bila tak ada field rumah yang terisi. */
export function houseViewFromSpec(spec: RabIntentSpec): HouseSpecView | null {
  const view: HouseSpecView = {
    bedrooms: spec.bedrooms,
    bathrooms: spec.bathrooms,
    quality: spec.quality,
    exclusions: [...spec.exclusions],
    roofSystem: [...spec.roofSystem],
    foundationSystem: spec.foundationSystem,
    structuralSystem: [...spec.structuralSystem],
    scope: [...spec.scope],
    buildingType: spec.buildingType,
    buildingFunction: spec.buildingFunction,
    projectCategory: spec.projectCategory,
  };
  const hasData =
    view.bedrooms != null || view.bathrooms != null || view.quality != null ||
    view.exclusions.length > 0 || view.roofSystem.length > 0 ||
    view.foundationSystem != null || view.structuralSystem.length > 0 ||
    view.scope.length > 0 || view.buildingType != null ||
    view.buildingFunction != null || view.projectCategory != null;
  return hasData ? view : null;
}

/**
 * Gabung view rumah antar-giliran (dipakai UniversalIntakeContext):
 * skalar giliran baru menimpa bila terisi, array di-union — semantik
 * yang sama dengan mergeRabIntentSpec. Bila keduanya kosong → null.
 */
export function mergeHouseViews(
  base: HouseSpecView | null | undefined,
  turn: HouseSpecView | null | undefined,
): HouseSpecView | null {
  if (!base) return turn ? { ...turn, exclusions: [...turn.exclusions], roofSystem: [...turn.roofSystem], structuralSystem: [...turn.structuralSystem], scope: [...turn.scope] } : null;
  if (!turn) return base;
  const union = (a: string[], b: string[]): string[] => {
    const out = [...a];
    for (const x of b) if (!out.some((y) => y.toLowerCase() === x.toLowerCase())) out.push(x);
    return out;
  };
  return {
    bedrooms: turn.bedrooms ?? base.bedrooms,
    bathrooms: turn.bathrooms ?? base.bathrooms,
    quality: turn.quality ?? base.quality,
    exclusions: union(base.exclusions, turn.exclusions),
    roofSystem: union(base.roofSystem, turn.roofSystem),
    foundationSystem: turn.foundationSystem ?? base.foundationSystem,
    structuralSystem: union(base.structuralSystem, turn.structuralSystem),
    scope: union(base.scope, turn.scope),
    buildingType: turn.buildingType ?? base.buildingType,
    buildingFunction: turn.buildingFunction ?? base.buildingFunction,
    projectCategory: turn.projectCategory ?? base.projectCategory,
  };
}

export interface RabIntentSpec {
  buildingType: string | null;
  buildingFunction: string | null;
  landAreaM2: number | null; // luas tanah — field TERPISAH
  buildingAreaM2: number | null; // luas bangunan — field TERPISAH
  dimensionsM: { lengthM: number | null; widthM: number | null } | null;
  floors: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  location: string | null;
  roofSystem: string[];
  foundationSystem: string | null;
  structuralSystem: string[];
  materials: string[];
  scope: string[];
  exclusions: string[];
  budgetIdr: number | null;
  quality: string | null;
  projectCategory: string | null; // 'baru' | 'renovasi' | null (UNKNOWN)
  source: 'ded' | 'template' | 'free' | null;
  rawText: string;
  explicitFields: string[]; // field yang berasal dari input eksplisit pengguna
  /**
   * Sub-model universal (W2/W10 §2, S1-R3) — ukuran lintas disiplin
   * dari teks yang sama. Opsional + absen bila tidak disebut (agar
   * bentuk lama tetap valid). Lihat UniversalSpecView.
   */
  universal?: UniversalSpecView;
}

/* ------------------------------------------------------------------ */
/* Parser angka format Indonesia                                       */
/* ------------------------------------------------------------------ */

/** "1.200.000" | "1,2" | "1.2" | "86" → number. null bila bukan angka. */
function parseIdNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  let norm: string;
  if (s.includes(',') && s.includes('.')) {
    // "1.200.500,75" → titik = ribuan, koma = desimal
    norm = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // "1,2" → koma desimal
    norm = s.replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
    // "500.000" → titik ribuan
    norm = s.replace(/\./g, '');
  } else {
    norm = s;
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const NUMBER_WORDS: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
  'dua belas': 12,
};

const NUMBER_WORD_PATTERN =
  'dua belas|sebelas|sepuluh|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan';

function parseCountToken(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return NUMBER_WORDS[t] ?? null;
}

/** Token angka: digit + pemisah ribuan/desimal id-ID. */
const NUM_TOKEN = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?`;

/* ------------------------------------------------------------------ */
/* Util kecil                                                          */
/* ------------------------------------------------------------------ */

type Span = { start: number; end: number };

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function dedupeCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Kapitalisasi kanonis untuk istilah yang lazim ditulis khusus. */
function canonicalTerm(term: string): string {
  let t = term.toLowerCase().replace(/\s+/g, ' ').trim();
  t = t.replace(/\bwf\b/g, 'WF');
  t = t.replace(/\bwc\b/g, 'WC');
  t = t.replace(/\bmep\b/g, 'MEP');
  // Merek dagang umum — ditulis Title Case.
  const brands = [
    'dulux', 'nippon', 'jotun', 'avian', 'propan', 'mowilex', 'roman',
    'indogress', 'arwana', 'platinum', 'mulia', 'holcim', 'dynamix', 'scg',
    'citicon', 'focon', 'blesscon', 'toto', 'kohler', 'grohe', 'yale',
    'kenari', 'jayaboard', 'gyproc', 'aplus', 'alderon', 'onduline',
    'bluescope', 'colorbond', 'kencana', 'taso', 'wavin', 'rucika',
    'pralon', 'maspion', 'philips', 'panasonic', 'schneider', 'broco',
    'visalux', 'taco',
  ];
  for (const b of brands) {
    t = t.replace(new RegExp(`\\b${b}\\b`, 'g'), b.charAt(0).toUpperCase() + b.slice(1));
  }
  t = t.replace(/\btiga roda\b/g, 'Tiga Roda');
  t = t.replace(/\bamerican standard\b/g, 'American Standard');
  return t;
}

/** Kata yang menghentikan penangkapan frasa ("atap baja wf dan ..." → "baja wf"). */
const PHRASE_STOP_WORDS = new Set([
  'dan', 'serta', 'atau', 'dengan', 'memakai', 'menggunakan', 'pakai',
  'yang', 'untuk', 'dari', 'sampai', 'hingga', 'pada', 'di', 'ke', 'lalu',
  'kemudian', 'juga', 'tanpa', 'tidak', 'kecuali', 'lengkap', 'plus',
  'serta', 'serta', 'sekitar', 'kurang', 'lebih', 'maksimal', 'maks',
]);

/**
 * Tangkap frasa sesudah posisi `from` (mis. sesudah kata "atap"): hingga
 * `maxWords` kata huruf, berhenti di kata-stop, angka, atau tanda baca.
 * Mengembalikan frasa terkanonisasi + span-nya, atau null.
 */
function capturePhrase(
  lower: string,
  from: number,
  maxWords = 3,
): { text: string; span: Span } | null {
  const rest = lower.slice(from);
  const m = rest.match(/^[^\p{L}\d]*([\p{L}][\p{L}\s]{0,40})/u);
  if (!m) return null;
  const words = m[1].split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (kept.length >= maxWords) break;
    if (PHRASE_STOP_WORDS.has(w)) break;
    if (/\d/.test(w)) break;
    kept.push(w);
  }
  if (kept.length === 0) return null;
  const text = canonicalTerm(kept.join(' '));
  const start = from + (m[0].indexOf(m[1]) >= 0 ? m[0].indexOf(m[1]) : 0);
  return { text, span: { start, end: start + kept.join(' ').length } };
}

/* ------------------------------------------------------------------ */
/* Jenis & fungsi bangunan                                             */
/* ------------------------------------------------------------------ */

/** Kata benda bangunan — urutan: frasa multi-kata dulu (longest-first). */
const BUILDING_TYPES = [
  'rumah sakit', 'rumah tinggal', 'rumah toko', 'rumah susun',
  'rumah', 'villa', 'ruko', 'gudang', 'kantor', 'sekolah', 'klinik',
  'masjid', 'mushola', 'musholla', 'gereja', 'hotel', 'apartemen',
  'kost', 'kos', 'gedung', 'homestay', 'restoran', 'cafe', 'kafe',
  'toko', 'pabrik', 'bengkel', 'puskesmas', 'mess', 'asrama', 'warung',
  'showroom', 'bioskop', 'mall', 'pasar', 'stasiun', 'terminal',
  'gazebo', 'saung', 'poskamling', 'balai',
];

/** Klasifikasi fungsi dari kata jenis bangunan (deterministik, bukan karangan). */
const TYPE_TO_FUNCTION: Record<string, string> = {
  rumah: 'hunian',
  'rumah tinggal': 'hunian',
  villa: 'hunian',
  kost: 'hunian',
  kos: 'hunian',
  apartemen: 'hunian',
  homestay: 'hunian',
  mess: 'hunian',
  asrama: 'hunian',
  ruko: 'komersial',
  'rumah toko': 'komersial',
  toko: 'komersial',
  warung: 'komersial',
  restoran: 'komersial',
  cafe: 'komersial',
  kafe: 'komersial',
  showroom: 'komersial',
  mall: 'komersial',
  pasar: 'komersial',
  kantor: 'perkantoran',
  gudang: 'penyimpanan',
  pabrik: 'industri',
  bengkel: 'industri',
  sekolah: 'pendidikan',
  klinik: 'kesehatan',
  'rumah sakit': 'kesehatan',
  puskesmas: 'kesehatan',
  masjid: 'ibadah',
  mushola: 'ibadah',
  musholla: 'ibadah',
  gereja: 'ibadah',
  hotel: 'perhotelan',
  bioskop: 'hiburan',
  stasiun: 'transportasi',
  terminal: 'transportasi',
  gazebo: 'rekreasi',
  saung: 'rekreasi',
  poskamling: 'keamanan',
  balai: 'komunitas',
  // 'gedung' & 'rumah susun' terlalu generik → fungsi tetap null.
};

/** Jenis hunian — hanya untuk inilah kamar tidur/mandi relevan ditanyakan. */
const RESIDENTIAL_TYPES = new Set([
  'rumah', 'rumah tinggal', 'villa', 'kost', 'kos', 'apartemen',
  'ruko', 'homestay', 'mess', 'asrama',
]);

/* ------------------------------------------------------------------ */
/* Istilah sistem atap / pondasi / struktur / material                 */
/* ------------------------------------------------------------------ */

const ROOF_TERMS = [
  'baja ringan', 'dak beton', 'seng gelombang', 'metal roof',
  'genteng', 'spandek', 'galvalum', 'seng', 'asbes', 'sirap',
  'alderon', 'onduline', 'bitumen', 'polycarbonate', 'polikarbonat',
  'ijuk', 'rumbia', 'jerami', 'beton pracetak',
];

const FOUNDATION_TERMS = [
  'batu kali', 'cakar ayam', 'foot plat', 'bore pile', 'strauss pile',
  'tiang pancang', 'batu gunung', 'batu bata', 'sumuran', 'telapak',
  'raft', 'menerus', 'tapak',
];

const STRUCTURAL_TERMS = [
  'beton bertulang', 'baja wf', 'kolom praktis', 'rangka baja',
  'balok beton', 'kolom beton', 'shear wall', 'dinding geser',
  'portal baja', 'portal beton', 'struktur baja',
];

/** Frasa material multi-kata (longest-first) lalu kata tunggal. */
const MATERIAL_PHRASES = [
  'keramik granit', 'kayu jati', 'kayu merbau', 'kayu ulin',
  'kayu kamper', 'kayu bengkirai', 'bata ringan', 'bata merah',
  'batu alam', 'batu andesit', 'batu palimanan', 'batu candi',
  'glass block', 'bata expose', 'bata ekspos',
];
const MATERIAL_NOUNS = [
  'keramik', 'granit', 'marmer', 'porcelain', 'porselen', 'batako',
  'hebel', 'gypsum', 'gipsum', 'kaca', 'aluminium', 'alumunium',
  'pvc', 'upvc', 'stainless', 'kuningan', 'tembaga', 'kayu', 'cat',
  'wallpaper', 'vinyl', 'parquet', 'parket', 'teraso', 'terrazzo',
  'besi', 'semen', 'pasir', 'triplek', 'multiplek', 'hpl', 'wpc',
  'roster', 'beton', 'plester', 'acian', 'conblock', 'paving',
  'granito', 'lantai kayu', 'kusen kayu',
];

const BRANDS = [
  'dulux', 'nippon', 'jotun', 'avian', 'propan', 'mowilex', 'roman',
  'indogress', 'arwana', 'platinum', 'mulia', 'tiga roda', 'holcim',
  'dynamix', 'scg', 'citicon', 'focon', 'blesscon', 'toto',
  'american standard', 'kohler', 'grohe', 'yale', 'kenari', 'jayaboard',
  'gyproc', 'aplus', 'alderon', 'onduline', 'bluescope', 'colorbond',
  'kencana', 'taso', 'wavin', 'rucika', 'pralon', 'maspion', 'philips',
  'panasonic', 'schneider', 'broco', 'visalux', 'taco',
];

/* ------------------------------------------------------------------ */
/* Ekstraktor utama                                                    */
/* ------------------------------------------------------------------ */

function emptySpec(rawText: string): RabIntentSpec {
  return {
    buildingType: null,
    buildingFunction: null,
    landAreaM2: null,
    buildingAreaM2: null,
    dimensionsM: null,
    floors: null,
    bedrooms: null,
    bathrooms: null,
    location: null,
    roofSystem: [],
    foundationSystem: null,
    structuralSystem: [],
    materials: [],
    scope: [],
    exclusions: [],
    budgetIdr: null,
    quality: null,
    projectCategory: null,
    source: 'free',
    rawText,
    explicitFields: [],
  };
}

export function extractRabIntentSpec(text: string): RabIntentSpec {
  const spec = emptySpec(text);
  const lower = text.toLowerCase();
  const explicit = new Set<string>();
  const mark = (field: string) => explicit.add(field);

  /* ---- jenis & fungsi bangunan ---------------------------------- */
  for (const t of BUILDING_TYPES) {
    const re = new RegExp(`\\b${t.replace(/ /g, '\\s+')}\\b`);
    if (re.test(lower)) {
      spec.buildingType = t;
      mark('buildingType');
      const fn = TYPE_TO_FUNCTION[t];
      if (fn) {
        spec.buildingFunction = fn;
        mark('buildingFunction');
      }
      break;
    }
  }
  // Fungsi eksplisit ("untuk kos-kosan", "difungsikan sebagai kantor")
  // mengalahkan klasifikasi dari jenis bangunan.
  const fnMatch = lower.match(
    /(?:difungsikan\s+sebagai|untuk|fungsi(?:nya)?)\s+(kos-kosan|kos|kantor|gudang|sekolah|klinik|toko|ruko|hotel|villa|hunian|tempat tinggal|usaha|kontrakan)\b/,
  );
  if (fnMatch) {
    const fn = fnMatch[1] === 'kos-kosan' || fnMatch[1] === 'kontrakan'
      ? 'hunian'
      : fnMatch[1] === 'tempat tinggal'
        ? 'hunian'
        : TYPE_TO_FUNCTION[fnMatch[1]] ?? fnMatch[1];
    spec.buildingFunction = fn;
    mark('buildingFunction');
  }

  /* ---- kategori proyek & sumber ---------------------------------- */
  if (/\brenov(?:asi|)\b|\brehab\b|\bmerenovasi\b/.test(lower)) {
    spec.projectCategory = 'renovasi';
    mark('projectCategory');
  } else if (/\b(bangun|pembangunan|konstruksi)\s+baru\b|\b(rumah|gedung|villa|ruko)\s+baru\b/.test(lower)) {
    spec.projectCategory = 'baru';
    mark('projectCategory');
  }

  if (/\bgambar\s+kerja\b|\bded\b|berdasarkan\s+gambar|dari\s+gambar|\bgambar\s+teknik\b|\bgambar\s+arsitektur\b/.test(lower)) {
    spec.source = 'ded';
    mark('source');
  } else if (/\btemplate\b|\btemplat\b/.test(lower)) {
    spec.source = 'template';
    mark('source');
  }
  // Selain itu source = 'free' (pesan chat memang bebas) — BUKAN field
  // eksplisit, karena pengguna tidak menyatakannya.

  /* ---- dimensi (dulu, agar span-nya bisa dikecualikan dari luas) -- */
  const dimensionSpans: Span[] = [];
  let widthM: number | null = null;
  let lengthM: number | null = null;
  // "6x12", "6×12 m", "5 x 10 meter"
  const xRe = new RegExp(
    `(${NUM_TOKEN})\\s*[x×]\\s*(${NUM_TOKEN})(\\s*(?:m|meter)\\b)?`,
    'g',
  );
  for (const m of lower.matchAll(xRe)) {
    const idx = m.index ?? 0;
    const hasUnit = !!m[3];
    const ctxBefore = lower.slice(Math.max(0, idx - 25), idx);
    const hasContext = /\b(ukuran|dimensi|rumah|gedung|villa|ruko|bangunan|tanah|lahan|denah|kamar|ruang)\b/.test(ctxBefore);
    if (!hasUnit && !hasContext) continue; // mis. "3x24 jam" — bukan dimensi
    const a = parseIdNumber(m[1]);
    const b = parseIdNumber(m[2]);
    if (a === null || b === null) continue;
    // Konvensi Indonesia: "lebar x panjang".
    widthM = a;
    lengthM = b;
    dimensionSpans.push({ start: idx, end: idx + m[0].length });
    break; // dimensi pertama yang valid
  }
  // "lebar 6 panjang 12" / "panjang 12 lebar 6"
  const wMatch = lower.match(new RegExp(`\\blebar\\s*[:\\-]?\\s*(${NUM_TOKEN})`));
  const lMatch = lower.match(new RegExp(`\\bpanjang\\s*[:\\-]?\\s*(${NUM_TOKEN})`));
  if (wMatch) {
    const w = parseIdNumber(wMatch[1]);
    if (w !== null) widthM = w;
  }
  if (lMatch) {
    const l = parseIdNumber(lMatch[1]);
    if (l !== null) lengthM = l;
  }
  if (widthM !== null || lengthM !== null) {
    spec.dimensionsM = { lengthM, widthM };
    mark('dimensionsM');
    // LUAS TIDAK PERNAH diturunkan dari dimensi — sengaja tidak ada
    // pengisian buildingAreaM2 di sini.
  }

  /* ---- luas tanah vs luas bangunan -------------------------------- */
  const landMentions: number[] = [];
  const buildingMentions: number[] = [];
  const bareMentions: number[] = [];
  const areaRe = new RegExp(
    // (?![a-z0-9]) sebagai batas akhir — \b TIDAK bekerja sesudah "m²"
    // karena "²" bukan karakter kata, sehingga "86,5 m²" di akhir teks
    // tidak akan pernah tertangkap bila memakai \b.
    `(${NUM_TOKEN})\\s*(?:m2|m²|meter\\s+persegi|meter2)(?![a-z0-9])`,
    'g',
  );
  for (const m of lower.matchAll(areaRe)) {
    const idx = m.index ?? 0;
    const span: Span = { start: idx, end: idx + m[0].length };
    if (dimensionSpans.some((d) => overlaps(d, span))) continue;
    const value = parseIdNumber(m[1]);
    if (value === null) continue;
    const prefix = lower.slice(Math.max(0, idx - 30), idx);
    // Kualifikasi TERDEKAT (posisi terakhir) yang menang.
    const candidates: Array<{ key: string; pos: number }> = [];
    for (const key of ['luas tanah', 'tanah', 'luas bangunan', 'bangunan', 'lb', 'luas']) {
      const pos = prefix.lastIndexOf(key);
      if (pos >= 0) candidates.push({ key, pos });
    }
    candidates.sort((a, b) => b.pos - a.pos);
    const nearest = candidates[0]?.key;
    if (nearest === 'luas tanah' || nearest === 'tanah') landMentions.push(value);
    else if (nearest === 'luas bangunan' || nearest === 'bangunan' || nearest === 'lb') buildingMentions.push(value);
    else bareMentions.push(value); // "luas" telanjang / tanpa kualifikasi
  }
  // "LB 86" / "LT 120" tanpa satuan.
  const lbMatch = lower.match(new RegExp(`\\blb\\s*[:\\-]?\\s*(${NUM_TOKEN})`));
  if (lbMatch) {
    const v = parseIdNumber(lbMatch[1]);
    if (v !== null) buildingMentions.push(v);
  }
  const ltMatch = lower.match(new RegExp(`\\blt\\s*[:\\-]?\\s*(${NUM_TOKEN})`));
  if (ltMatch) {
    const v = parseIdNumber(ltMatch[1]);
    if (v !== null) landMentions.push(v);
  }
  // Resolusi: "luas" telanjang = BANGUNAN, kecuali bila luas-bangunan
  // berkualifikasi juga hadir — barulah yang telanjang dibaca sebagai TANAH.
  if (buildingMentions.length > 0) {
    spec.buildingAreaM2 = buildingMentions[0];
    mark('buildingAreaM2');
    if (landMentions.length > 0) {
      spec.landAreaM2 = landMentions[0];
      mark('landAreaM2');
    } else if (bareMentions.length > 0) {
      spec.landAreaM2 = bareMentions[0];
      mark('landAreaM2');
    }
  } else {
    if (bareMentions.length > 0) {
      spec.buildingAreaM2 = bareMentions[0];
      mark('buildingAreaM2');
    }
    if (landMentions.length > 0) {
      spec.landAreaM2 = landMentions[0];
      mark('landAreaM2');
    }
  }

  /* ---- lantai ------------------------------------------------------ */
  // Koreksi negasi (sprint 2026-11-26, Worker F; KEPUTUSAN OWNER FINAL
  // 2026-11-26 — MEMBALIKKAN fallback lama): "bukan 2 lantai,
  // 3 lantai" — kemunculan yang dinegasikan ("2 lantai") DILEWATI dan
  // kandidat sah TERAKHIR yang menang; murni negasi tanpa pengganti
  // ("bukan 2 lantai") → null (UNKNOWN), BUKAN 1 — selaras
  // parseFloorsMention (rabNeeds.ts); kedua lapisan harus sepakat.
  // Kata perantara ("tidak JADI 3 lantai", "jangan BUAT 4 lantai",
  // "bukan BANGUNAN 2 lantai") ikut dinegasikan — daftar tertutup yang
  // sama dengan rabNeeds.ts.
  const floorsRe = new RegExp(
    `(?:(\\d+|${NUMBER_WORD_PATTERN})\\s+lantai|lantai(?:nya)?\\s*(\\d+|${NUMBER_WORD_PATTERN})|berlantai\\s*(\\d+|${NUMBER_WORD_PATTERN}))`,
    'g',
  );
  let lastFloors: number | null = null;
  for (const fMatch of lower.matchAll(floorsRe)) {
    const token = fMatch[1] ?? fMatch[2] ?? fMatch[3];
    const n = token ? parseCountToken(token) : null;
    if (n === null || n < 1 || n > 100) continue;
    // Kemunculan yang langsung didahului kata negasi ("bukan",
    // "jangan", "tidak", "tak") — dengan satu kata perantara opsional
    // ("jadi"/"buat"/"bikin"/"pakai"/"bangunan"/"gedung"/"rumah") —
    // adalah nilai yang DITOLAK, bukan nilai yang ditetapkan.
    const before = lower.slice(0, fMatch.index ?? 0);
    if (/(?:jangan|tidak|tak|bukan)\s+(?:(?:jadi|buat|bikin|pakai|bangunan|gedung|rumah)\s+)?$/.test(before)) {
      continue;
    }
    lastFloors = n;
  }
  if (lastFloors !== null) {
    spec.floors = lastFloors;
    mark('floors');
  }

  /* ---- kamar tidur / kamar mandi ----------------------------------- */
  // "kamar mandi" dicek DULU agar tidak tertangkap pola "kamar" tidur.
  const bathRe = new RegExp(
    `(?:(\\d+|${NUMBER_WORD_PATTERN})\\s*(?:kamar\\s+mandi|km|toilet|wc)\\b|(?:kamar\\s+mandi|km|toilet|wc)\\s*[:\\-]?\\s*(\\d+))`,
  );
  const bathMatch = lower.match(bathRe);
  if (bathMatch) {
    const token = bathMatch[1] ?? bathMatch[2];
    const n = token ? parseCountToken(token) : null;
    if (n !== null && n >= 0 && n <= 50) {
      spec.bathrooms = n;
      mark('bathrooms');
    }
  }
  const bedRe = new RegExp(
    `(?:(\\d+|${NUMBER_WORD_PATTERN})\\s*(?:kamar\\s+tidur|kamar(?!\\s+mandi)|kt)\\b|(?:kamar\\s+tidur|kt)\\s*[:\\-]?\\s*(\\d+))`,
  );
  const bedMatch = lower.match(bedRe);
  if (bedMatch) {
    const token = bedMatch[1] ?? bedMatch[2];
    const n = token ? parseCountToken(token) : null;
    if (n !== null && n >= 0 && n <= 50) {
      spec.bedrooms = n;
      mark('bedrooms');
    }
  }

  /* ---- lokasi (dari teks ASLI — memanfaatkan kapitalisasi) --------- */
  const LOCATION_STOP = new Set([
    'atas', 'bawah', 'dalam', 'luar', 'lahan', 'tanah', 'sana', 'sini',
    'tempat', 'lokasi', 'tengah', 'pinggir', 'depan', 'belakang',
    'samping', 'kiri', 'kanan', 'lantai', 'rumah', 'gedung', 'ruko',
    'villa', 'gudang', 'kantor', 'jalan', 'jl', 'rt', 'rw', 'dusun',
    'desa', 'kampung', 'halaman',
    'dekat', 'seberang', 'sekitar', 'area', 'kawasan', 'komplek',
    'kompleks', 'perumahan', 'site', 'proyek', 'lapangan', 'saya',
    'kami', 'kita', 'sini', 'situ', 'sana', 'mana', 'mana-mana',
  ]);
  const SECOND_WORD_OK = new Set([
    'selatan', 'utara', 'timur', 'barat', 'tengah', 'baru', 'raya',
    'besar', 'lama', 'dalam', 'kota', 'agung', 'jaya', 'indah', 'mulya',
    'sari', 'rejo', 'asri', 'lestari', 'mandiri',
  ]);
  const locRe = /(?:lokasi(?:nya)?\s*(?::|di\s*)?|di\s+)\s*(kota|kabupaten|kecamatan|desa|daerah)?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-]*)?)/gi;
  for (const m of text.matchAll(locRe)) {
    const areaPrefix = m[1] ? m[1].toLowerCase() : '';
    const words = (m[2] ?? '').split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const first = words[0].toLowerCase();
    if (LOCATION_STOP.has(first)) continue;
    if (/^\d/.test(words[0])) continue;
    let name = words[0];
    if (words.length > 1) {
      const second = words[1];
      const secondIsCapitalized = /^[A-ZÀ-Þ]/.test(second);
      if (secondIsCapitalized || SECOND_WORD_OK.has(second.toLowerCase())) {
        name = `${words[0]} ${second}`;
      }
    }
    const titleCased = name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    spec.location = areaPrefix
      ? `${areaPrefix.charAt(0).toUpperCase() + areaPrefix.slice(1)} ${titleCased}`
      : titleCased;
    mark('location');
    break; // lokasi pertama yang valid
  }

  /* ---- sistem atap / pondasi / struktur (dengan pelacakan span) ---- */
  const claimedSpans: Span[] = [];
  const roof: string[] = [];
  const structural: string[] = [];

  // "atap <frasa>" → atap.
  for (const m of lower.matchAll(/\batap\s+/g)) {
    const cap = capturePhrase(lower, (m.index ?? 0) + m[0].length, 3);
    if (cap && cap.text.length > 0) {
      const term = cap.text === 'dak' ? 'dak beton' : cap.text;
      roof.push(term);
      claimedSpans.push(cap.span);
    }
  }
  // Istilah atap yang dikenal, di mana pun muncul ("campuran baja ringan").
  for (const term of ROOF_TERMS) {
    const re = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'g');
    for (const m of lower.matchAll(re)) {
      const span: Span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (claimedSpans.some((c) => overlaps(c, span))) continue;
      roof.push(canonicalTerm(term));
      claimedSpans.push(span);
    }
  }
  spec.roofSystem = dedupeCaseInsensitive(roof);
  if (spec.roofSystem.length > 0) mark('roofSystem');

  // "pondasi <frasa>" → pondasi (field tunggal: penyebutan pertama).
  let foundation: string | null = null;
  for (const m of lower.matchAll(/\bpondasi\s+/g)) {
    const cap = capturePhrase(lower, (m.index ?? 0) + m[0].length, 3);
    if (cap && cap.text.length > 0) {
      foundation = cap.text;
      claimedSpans.push(cap.span);
      break;
    }
  }
  if (!foundation) {
    for (const term of FOUNDATION_TERMS) {
      const re = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`);
      const m = re.exec(lower);
      if (m) {
        foundation = canonicalTerm(term);
        claimedSpans.push({ start: m.index, end: m.index + m[0].length });
        break;
      }
    }
  }
  if (foundation) {
    spec.foundationSystem = foundation;
    mark('foundationSystem');
  }

  // "struktur <frasa>" → struktur.
  for (const m of lower.matchAll(/\bstruktur\s+/g)) {
    const cap = capturePhrase(lower, (m.index ?? 0) + m[0].length, 3);
    if (cap && cap.text.length > 0) {
      structural.push(cap.text);
      claimedSpans.push(cap.span);
    }
  }
  // Istilah struktur yang dikenal, di mana pun muncul.
  for (const term of STRUCTURAL_TERMS) {
    const re = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'g');
    for (const m of lower.matchAll(re)) {
      const span: Span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (claimedSpans.some((c) => overlaps(c, span))) continue;
      structural.push(term === 'struktur baja' ? 'baja' : canonicalTerm(term));
      claimedSpans.push(span);
    }
  }
  spec.structuralSystem = dedupeCaseInsensitive(structural);
  if (spec.structuralSystem.length > 0) mark('structuralSystem');

  /* ---- material & merek (melewati span yang sudah diklaim) --------- */
  const materials: string[] = [];
  const materialSpans: Span[] = [...claimedSpans];
  // Merek: "<material> <Merek>" dulu ("cat Dulux"), lalu merek telanjang.
  const materialNounPattern = [...MATERIAL_PHRASES, ...MATERIAL_NOUNS]
    .map((n) => n.replace(/ /g, '\\s+'))
    .join('|');
  const brandPattern = BRANDS.map((b) => b.replace(/ /g, '\\s+')).join('|');
  const brandComboRe = new RegExp(
    `\\b(${materialNounPattern})\\s+(${brandPattern})\\b`,
    'g',
  );
  for (const m of lower.matchAll(brandComboRe)) {
    const span: Span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (materialSpans.some((c) => overlaps(c, span))) continue;
    materials.push(canonicalTerm(`${m[1]} ${m[2]}`));
    materialSpans.push(span);
  }
  const brandSoloRe = new RegExp(`\\b(${brandPattern})\\b`, 'g');
  for (const m of lower.matchAll(brandSoloRe)) {
    const span: Span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (materialSpans.some((c) => overlaps(c, span))) continue;
    materials.push(canonicalTerm(m[1]));
    materialSpans.push(span);
  }
  // Frasa material multi-kata lalu kata tunggal.
  for (const term of [...MATERIAL_PHRASES, ...MATERIAL_NOUNS]) {
    const re = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'g');
    for (const m of lower.matchAll(re)) {
      const span: Span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (materialSpans.some((c) => overlaps(c, span))) continue;
      materials.push(canonicalTerm(term));
      materialSpans.push(span);
    }
  }
  spec.materials = dedupeCaseInsensitive(materials);
  if (spec.materials.length > 0) mark('materials');

  /* ---- lingkup ------------------------------------------------------ */
  const scope: string[] = [];
  const scopeRules: Array<[RegExp, string]> = [
    [/\b(dari\s+)?pondasi\s+(sampai|hingga|sd\.?|s\/d)\s+atap\b/, 'pondasi sampai atap'],
    [/\b(dari\s+)?pondasi\s+(sampai|hingga)\s+finishing\b/, 'pondasi sampai finishing'],
    [/\bstruktur\s+dan\s+arsitektur\b/, 'struktur dan arsitektur'],
    [/\b(hanya\s+)?struktur\s+saja\b|\bhanya\s+struktur\b/, 'struktur saja'],
    [/\b(hanya\s+)?finishing\s+saja\b|\bhanya\s+finishing\b/, 'finishing saja'],
    [/\b(hanya\s+)?arsitektur\s+saja\b/, 'arsitektur saja'],
    [/\b(hanya\s+)?mep\s+saja\b/, 'MEP saja'],
    [/\b(sampai|hingga)\s+finishing\b/, 'sampai finishing'],
    [/\b(sampai\s+)?serah\s+terima\b/, 'serah terima'],
    [/\blengkap\b/, 'lengkap'],
    [/\bkeseluruhan\b/, 'keseluruhan'],
    [/\bsemua\s+pekerjaan\b/, 'semua pekerjaan'],
    [/\bfull\b/, 'full'],
  ];
  for (const [re, label] of scopeRules) {
    if (re.test(lower)) scope.push(label);
  }
  spec.scope = dedupeCaseInsensitive(scope);
  if (spec.scope.length > 0) mark('scope');

  /* ---- pengecualian -------------------------------------------------- */
  const exclusions: string[] = [];
  const exclusionRe = /\b(tidak termasuk|belum termasuk|tidak pakai|tanpa|kecuali|exclude|di luar)\s+/g;
  for (const m of lower.matchAll(exclusionRe)) {
    const cap = capturePhrase(lower, (m.index ?? 0) + m[0].length, 3);
    if (cap && cap.text.length > 0) exclusions.push(cap.text);
  }
  spec.exclusions = dedupeCaseInsensitive(exclusions);
  if (spec.exclusions.length > 0) mark('exclusions');

  /* ---- budget (parser KANONIS — S1-R2/F11) ---------------------- */
  // SATU parser untuk keempat situs (rabNeeds.parseBudgetMentions):
  // situs ini memakai penyebutan PERTAMA (semantik first-match lama —
  // merge koreksi ditangani mergeRabIntentSpec, bukan last-match di
  // sini). Guard "uang" (uang muka/jalan/saku ditolak, `\b` cegah
  // "ruang"), celah "uang muka Rp 50 juta" (ditutup penolakan jendela
  // pada cabang rp), dan "budget menjadi 250 juta" semuanya milik
  // parser kanonis — lihat rabNeeds.ts.
  const budgetMentions = parseBudgetMentions(lower);
  if (budgetMentions.length > 0) {
    spec.budgetIdr = budgetMentions[0].amount;
    mark('budgetIdr');
  }

  /* ---- kualitas ------------------------------------------------------ */
  const qualityMatch = lower.match(
    /\b(ekonomis|standar|menengah|premium|mewah|luxury|sederhana|high-end)\b/,
  );
  if (qualityMatch) {
    spec.quality = qualityMatch[1];
    mark('quality');
  }

  /* ---- ukuran universal (sub-model — S1-R3) ------------------------ */
  // Bentang/tebal/volume/jumlah dari teks yang sama, lewat parser
  // bersama extractUniversalMeasures (satu sumber dengan
  // extractUniversalSpec) — agar jalur rumah dapat MEMBACA field
  // universal. Hanya dipasang bila ≥1 ukuran disebut.
  const universalMeasures = extractUniversalMeasures(lower);
  if (
    universalMeasures.spanM != null || universalMeasures.widthM != null ||
    universalMeasures.heightM != null || universalMeasures.thicknessCm != null ||
    universalMeasures.volumeM3 != null || universalMeasures.count != null ||
    universalMeasures.depthM != null
  ) {
    spec.universal = { ...universalMeasures };
  }

  spec.explicitFields = [...explicit];
  return spec;
}

/* ------------------------------------------------------------------ */
/* Merge: koreksi lanjutan hanya menimpa field yang disebut eksplisit  */
/* ------------------------------------------------------------------ */

const SCALAR_FIELDS: Array<keyof RabIntentSpec> = [
  'buildingType', 'buildingFunction', 'landAreaM2', 'buildingAreaM2',
  'dimensionsM', 'floors', 'bedrooms', 'bathrooms', 'location',
  'foundationSystem', 'budgetIdr', 'quality', 'projectCategory', 'source',
];
const ARRAY_FIELDS: Array<'roofSystem' | 'structuralSystem' | 'materials' | 'scope' | 'exclusions'> = [
  'roofSystem', 'structuralSystem', 'materials', 'scope', 'exclusions',
];

export function mergeRabIntentSpec(prev: RabIntentSpec, patchText: string): RabIntentSpec {
  const patch = extractRabIntentSpec(patchText);
  const merged: RabIntentSpec = {
    ...prev,
    roofSystem: [...prev.roofSystem],
    structuralSystem: [...prev.structuralSystem],
    materials: [...prev.materials],
    scope: [...prev.scope],
    exclusions: [...prev.exclusions],
    explicitFields: [...prev.explicitFields],
    rawText: prev.rawText ? `${prev.rawText}\n${patchText}` : patchText,
  };
  const patchExplicit = new Set(patch.explicitFields);
  for (const field of SCALAR_FIELDS) {
    if (!patchExplicit.has(field)) continue;
    // 'source' dari patch hanya menimpa bila ded/template disebut eksplisit
    // — 'free' tidak pernah masuk explicitFields, jadi sumber DED tidak
    // akan ter-downgrade oleh koreksi lanjutan.
    (merged as unknown as Record<string, unknown>)[field] = (patch as unknown as Record<string, unknown>)[field];
  }
  for (const field of ARRAY_FIELDS) {
    if (!patchExplicit.has(field)) continue;
    // Array diakumulasi (union): koreksi menambah, bukan menghapus.
    merged[field] = dedupeCaseInsensitive([...merged[field], ...patch[field]]);
  }
  merged.explicitFields = dedupeCaseInsensitive([
    ...prev.explicitFields,
    ...patch.explicitFields,
  ]);
  return merged;
}

/* ------------------------------------------------------------------ */
/* Analisis field yang hilang + label Indonesia                        */
/* ------------------------------------------------------------------ */

const FIELD_LABELS: Record<string, string> = {
  buildingType: 'jenis bangunan',
  buildingFunction: 'fungsi bangunan',
  landAreaM2: 'luas tanah',
  buildingAreaM2: 'luas bangunan',
  dimensionsM: 'ukuran/dimensi bangunan',
  floors: 'jumlah lantai',
  bedrooms: 'jumlah kamar tidur',
  bathrooms: 'jumlah kamar mandi',
  location: 'lokasi proyek',
  roofSystem: 'sistem atap',
  foundationSystem: 'sistem pondasi',
  structuralSystem: 'sistem struktur',
  materials: 'material',
  scope: 'lingkup pekerjaan',
  exclusions: 'pengecualian',
  budgetIdr: 'anggaran/budget',
  quality: 'kualitas/standar finishing',
  projectCategory: 'kategori proyek (baru/renovasi)',
  source: 'sumber data (gambar/template/bebas)',
  rawText: 'teks permintaan',
  explicitFields: 'field yang sudah diisi',
};

export function specFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/**
 * Field yang berpengaruh material terhadap kualitas/kuantitas/validitas
 * RAB dan masih UNKNOWN — dalam urutan tanya yang wajar. Field yang
 * sudah diisi pengguna TIDAK PERNAH muncul. Kamar tidur/mandi hanya
 * ditanyakan untuk bangunan hunian (atau bila jenisnya belum diketahui).
 * Untuk sumber DED, daftar kosong: gambar kerja yang menjawab.
 */
export function identifyMissingSpec(spec: RabIntentSpec): string[] {
  if (spec.source === 'ded') return [];
  const missing: string[] = [];
  const isResidential =
    spec.buildingType === null || RESIDENTIAL_TYPES.has(spec.buildingType);
  if (spec.buildingType === null) missing.push('buildingType');
  if (spec.buildingAreaM2 === null) missing.push('buildingAreaM2');
  if (spec.floors === null) missing.push('floors');
  if (spec.location === null) missing.push('location');
  if (isResidential) {
    if (spec.bedrooms === null) missing.push('bedrooms');
    if (spec.bathrooms === null) missing.push('bathrooms');
  }
  if (spec.projectCategory === null) missing.push('projectCategory');
  if (spec.foundationSystem === null) missing.push('foundationSystem');
  if (spec.roofSystem.length === 0) missing.push('roofSystem');
  if (spec.structuralSystem.length === 0) missing.push('structuralSystem');
  if (spec.quality === null) missing.push('quality');
  if (spec.scope.length === 0) missing.push('scope');
  return missing;
}

/* ------------------------------------------------------------------ */
/* Jembatan dua arah spek rumah ↔ spek universal (W2/W10 §2, S1-R3)    */
/*                                                                     */
/* PENDEKATAN (dampak terkecil — BUKAN penulisan ulang kedua model):   */
/* kedua model tetap hidup; yang disatukan adalah PEMBACAANNYA.        */
/* - Universal → rumah (fungsi di bawah): UniversalSpec dibaca sebagai */
/*   RabIntentSpec; ukuran universal (bentang/tebal/volume/jumlah)     */
/*   masuk sub-model `universal`, field rumah masuk dari               */
/*   UniversalSpec.house (bila ada — bila tidak ada, UNKNOWN, tidak    */
/*   pernah ditebak dari label bebas seperti kindLabel).               */
/* - Rumah → universal: rabIntentSpecToUniversal di universalRab.ts    */
/*   (extractUniversalSpec + overlay field rumah + sub-model).         */
/* Round-trip dipin di universalClassification.test.ts: rumah →        */
/* universal → rumah dan universal → rumah → universal tidak           */
/* kehilangan field di kedua arah.                                     */
/*                                                                     */
/* `explicitFields` hasil jembatan SENGAJA kosong: jembatan tidak      */
/* tahu field mana yang disebut eksplisit pengguna (itu provenance     */
/* ekstraksi, bukan data) — mengisinya dari non-null akan memalsukan   */
/* provenance dan merusak mergeRabIntentSpec.                          */
/* ------------------------------------------------------------------ */

/** Baca satu UniversalSpec sebagai RabIntentSpec (view rumah). */
export function universalSpecToRabIntent(uni: UniversalSpec): RabIntentSpec {
  const house = uni.house;
  const measures: UniversalSpecView = {
    spanM: uni.spanM,
    widthM: uni.widthM,
    heightM: uni.heightM,
    thicknessCm: uni.thicknessCm,
    volumeM3: uni.volumeM3,
    count: uni.count,
    depthM: uni.depthM,
  };
  const hasUniversal =
    measures.spanM != null || measures.widthM != null || measures.heightM != null ||
    measures.thicknessCm != null || measures.volumeM3 != null || measures.count != null ||
    measures.depthM != null;
  return {
    buildingType: house?.buildingType ?? null,
    buildingFunction: house?.buildingFunction ?? null,
    landAreaM2: uni.landAreaM2,
    buildingAreaM2: uni.areaM2,
    dimensionsM:
      uni.buildingLengthM != null || uni.buildingWidthM != null
        ? { lengthM: uni.buildingLengthM, widthM: uni.buildingWidthM }
        : null,
    floors: uni.floors,
    bedrooms: house?.bedrooms ?? null,
    bathrooms: house?.bathrooms ?? null,
    location: uni.location,
    roofSystem: house ? [...house.roofSystem] : [],
    foundationSystem: house?.foundationSystem ?? null,
    structuralSystem: house ? [...house.structuralSystem] : [],
    materials: [...uni.materialKeywords],
    scope: house ? [...house.scope] : [],
    exclusions: house ? [...house.exclusions] : [],
    budgetIdr: uni.budgetCap,
    quality: house?.quality ?? null,
    projectCategory: house?.projectCategory ?? null,
    source: null,
    rawText: uni.rawText,
    explicitFields: [],
    ...(hasUniversal ? { universal: measures } : {}),
  };
}
