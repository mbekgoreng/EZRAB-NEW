/**
 * rabNeeds — ekstraksi kebutuhan RAB dari teks chat (Fase 2 Chat-to-RAB).
 *
 * Prinsip: HANYA mengekstrak yang benar-benar disebutkan pengguna. Kolom yang
 * tidak disebut tetap null dan ditanyakan lewat "Lengkapi kebutuhan" — tidak
 * pernah diisi asumsi diam-diam. Parser ini murni & deterministik (tanpa AI,
 * tanpa kredit), dipakai intentRouter (typed) dan view (refinement).
 */

export type RabKind =
  | 'rumah'
  | 'gedung'
  | 'jalan'
  | 'drainase'
  | 'jembatan'
  | 'irigasi'
  | 'renovasi'
  | 'ded'
  | 'lainnya';

export interface RabNeeds {
  kind: RabKind | null;
  /** Kata jenis apa adanya dari teks (mis. "ruko", "villa", "paving") */
  kindLabel: string | null;
  /** Fungsi bangunan terstruktur (buildingTypology) — null bila bukan bangunan. */
  functionId: string | null;
  /** Label fungsi bangunan ("Gudang", "Rumah Tinggal", …). */
  functionLabel: string | null;
  /** Dimensi BANGUNAN eksplisit dari pola "A x B" (terpisah dari lahan). */
  buildingLength: number | null;
  buildingWidth: number | null;
  /** Tapak bangunan hasil kali dimensi (m²) — bukan luas lahan. */
  footprintM2: number | null;
  /** true bila footprint berasal dari dimensi pada teks INI (bukan sisa base multi-giliran). */
  footprintFromDims: boolean;
  /** Luas lahan eksplisit m² bila disebut di teks yang sama. */
  landAreaM2: number | null;
  /** true bila jumlah lantai BENAR-BENAR disebut pengguna. */
  floorsMentioned: boolean;
  /** Subtipe pekerjaan terpilih/terdeteksi (id dari peta rabSubtypes, mis. "hotmix") */
  subtypeId: string | null;
  /** Label subtipe untuk tampilan (mis. "Hotmix / Aspal") */
  subtypeLabel: string | null;
  /** Panjang pekerjaan linear dalam meter (jalan/saluran/jembatan), dari "1 km" / "500 m" */
  lengthM: number | null;
  floors: number | null;
  /** Luas bangunan eksplisit (m²), dari "90 m2" / "luas 90" */
  buildingArea: number | null;
  landLength: number | null;
  landWidth: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carport: boolean | null;
  location: string | null;
  /** Material atap yang disebut eksplisit ("atapnya baja ringan") — null bila tak disebut. */
  roofMaterial: string | null;
}

export const emptyRabNeeds = (): RabNeeds => ({
  kind: null,
  kindLabel: null,
  functionId: null,
  functionLabel: null,
  buildingLength: null,
  buildingWidth: null,
  footprintM2: null,
  footprintFromDims: false,
  landAreaM2: null,
  floorsMentioned: false,
  subtypeId: null,
  subtypeLabel: null,
  lengthM: null,
  floors: null,
  buildingArea: null,
  landLength: null,
  landWidth: null,
  bedrooms: null,
  bathrooms: null,
  carport: null,
  location: null,
  roofMaterial: null,
});

/* ------------------------------------------------------------------ */
/* Fungsi bangunan GENERIK (finalisasi 2026-11-08, §4).                */
/*                                                                     */
/* Kata "bangunan" / "komersial" TIDAK menghasilkan TemplateKind di    */
/* peta di bawah (sengaja: bukan jenis pekerjaan yang bisa dipilih     */
/* template-nya), sehingga jalur klarifikasi universalRab sebelumnya   */
/* kehilangan label fungsinya dan jatuh ke 'unsupported'. Detektor ini  */
/* hanya MEMBACA pola fungsi generik yang sudah ada di KIND_PATTERNS    */
/* (satu sumber pola — tidak menduplikasi daftar kata) dan memberi      */
/* labelnya ke pemanggil (universalRab) untuk pesan klarifikasi        */
/* kontekstual. Ia TIDAK mengubah RabNeeds dan TIDAK mengisi kind.     */
/* ------------------------------------------------------------------ */

const GENERIC_FUNCTION_LABELS: Record<string, string> = {
  bangunan: 'Bangunan (umum)',
  komersial: 'Bangunan Komersial',
  gedung: 'Gedung (umum)',
};

/** Label fungsi generik dari teks, atau null bila tidak ada pola generik. */
export function detectNeedsFunction(rawText: string): { label: string; term: string } | null {
  const t = ` ${(rawText || '').toLowerCase().replace(/\s+/g, ' ')} `;
  for (const p of KIND_PATTERNS) {
    const m = t.match(p.re);
    if (!m) continue;
    const term = m[0].trim();
    const label = GENERIC_FUNCTION_LABELS[term];
    if (label) return { label, term };
  }
  return null;
}

const KIND_PATTERNS: Array<{ kind: RabKind; label: string; re: RegExp }> = [
  { kind: 'ded', label: 'dari dokumen DED', re: /\b(ded|gambar kerja|gambar teknis|denah pdf)\b/ },
  { kind: 'drainase', label: 'drainase / saluran', re: /\b(drainase|saluran air|gorong|u-?ditch|drainage)\b/ },
  { kind: 'jembatan', label: 'jembatan', re: /\b(jembatan|bridge)\b/ },
  { kind: 'irigasi', label: 'bendungan / irigasi', re: /\b(bendungan|bendung|embung|irigasi)\b/ },
  { kind: 'jalan', label: 'jalan / perkerasan', re: /\b(jalan|perkerasan|paving|rabat beton|aspal|road)\b/ },
  { kind: 'renovasi', label: 'renovasi', re: /\b(renovasi|rehab|perbaikan rumah|perbaikan gedung|renovation)\b/ },
  { kind: 'gedung', label: 'gedung', re: /\b(gedung|kantor|ruko|villa|gudang|sekolah|masjid|kos|kontrakan|apartemen|hotel|toko|pabrik|bengkel|workshop|warehouse|aula|pasar|klinik|puskesmas|rumah sakit|gedung olahraga|minimarket|restoran|kafe|showroom|apotek|laundry|kios|warung|musholla|mushola|vihara|klenteng|gereja|madrasah|perpustakaan|rumah makan|tempat ibadah|building)\b/ },
  { kind: 'rumah', label: 'rumah tinggal', re: /\b(rumah|house)\b/ },
];



/* ------------------------------------------------------------------ */
/* Pemisahan LAHAN vs BANGUNAN (remediasi S7, 2026-10-22).             */
/* "lahan 8x12" adalah dimensi LAHAN — bukan tapak bangunan; "luas     */
/* lahan 90 m2" adalah luas lahan — bukan luas bangunan. Helper di     */
/* sini dipakai specRab (generate spek bebas) dan directRab (kartu      */
/* pilihan) agar frasa lahan diekstrak sebagai lahan dan DIBUANG dari   */
/* teks sebelum ekstraksi kebutuhan bangunan berjalan.                  */
/* ------------------------------------------------------------------ */

const LAND_AREA_RE =
  /luas\s*(?:lahan|tanah)(?:nya)?\s*(?:=|sekitar|kurang lebih)?\s*(\d+(?:[.,]\d+)?)\s*(?:m(?:2|²)?)?|\b(?:lahan|tanah)(?:nya)?\s*(?:seluas\s*)?(\d+(?:[.,]\d+)?)\s*m(?:2|²)/;

const LAND_DIMS_RE =
  /(?:^|[\s,;])(?:lahan|tanah)\s*(?:ukuran\s*)?(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/;

/** Luas lahan eksplisit dalam m² ("luas lahan 90 m2", "lahan 90 m2").
 * Batch 3 (§6.3): "tanah" di sini harus berarti LAHAN — lewati
 * kecocokan yang kata lahan/tanahnya didahului kata penahan/galian/
 * urugan/timbunan/pemadatan/pekerjaan ("dinding penahan tanah
 * 100 m2" adalah dinding penahan, bukan lahan; "galian tanah
 * 100 m2" adalah galian, bukan lahan). Penjaga yang sama ada di
 * buildingTypology.landArea agar kedua jalur membaca angka sama. */
export function parseLandAreaM2(rawText: string): number | null {
  const t = (rawText || '').toLowerCase();
  const re = new RegExp(LAND_AREA_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, (m.index ?? 0) - 16), m.index ?? 0);
    if (/(penahan|galian|urugan|timbunan|pemadatan|pekerjaan)\s+$/.test(before)) continue;
    return parseAreaNumber(m[1] ?? m[2]);
  }
  return null;
}

/**
 * Parser angka luas Indonesia: pemisah ribuan adalah TITIK ("1.200 m2"
 * = 1200), desimal adalah KOMA ("250,5" = 250,5). Angka polos tanpa
 * pemisah dikembalikan apa adanya.
 */
export function parseAreaNumber(s: string): number | null {
  const raw = (s || '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const v = parseFloat(normalized);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Dimensi lahan eksplisit ("lahan 8x12", "tanah ukuran 6 x 15"). */
export function parseLandDims(rawText: string): { p: number; l: number } | null {
  const t = (rawText || '').toLowerCase();
  const m = t.match(LAND_DIMS_RE);
  if (!m) return null;
  const p = parseFloat(m[1].replace(',', '.'));
  const l = parseFloat(m[2].replace(',', '.'));
  return Number.isFinite(p) && Number.isFinite(l) && p > 0 && l > 0 ? { p, l } : null;
}

/** Luas lahan total: dari m² eksplisit, atau hasil kali dimensi lahan. */
export function resolveLandAreaM2(rawText: string): number | null {
  const explicit = parseLandAreaM2(rawText);
  if (explicit != null) return explicit;
  const dims = parseLandDims(rawText);
  return dims ? dims.p * dims.l : null;
}

/**
 * Buang frasa lahan (luas m² + dimensi) dari teks agar ekstraksi kebutuhan
 * bangunan tidak membacanya sebagai luas/dimensi BANGUNAN.
 */
export function stripLandPhrases(rawText: string): string {
  return (rawText || '')
    .replace(new RegExp(LAND_AREA_RE.source, 'g'), ' ')
    .replace(new RegExp(LAND_DIMS_RE.source, 'g'), ' ');
}

const WORD_FLOORS: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
};

/** Kata bilangan Inggris untuk bentuk "two-story" (WD-3.7-03). */
const EN_WORD_FLOORS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/** Material penutup atap yang dikenal parser kebutuhan (ekstraksi atap). */
const ROOF_MATERIALS: string[] = [
  'genteng tanah liat', 'genteng keramik', 'genteng metal', 'genteng beton',
  'baja ringan', 'dak beton', 'polycarbonate', 'multiroof', 'onduline',
  'galvalum', 'galvanis', 'genteng', 'spandek', 'asbes', 'sirap', 'upvc',
  'beton', 'metal', 'seng', 'kaca', 'ijuk',
];

const WORD_COUNTS: Record<string, number> = {
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
};

/**
 * Jumlah lantai dari teks, semua bentuk yang dipakai pengguna Indonesia.
 * Urutan pemeriksaan menyelesaikan dua ambiguitas nyata:
 * - "5x10 lantai 2": pola "<angka> lantai" akan menelan angka dimensi
 *   ("10 lantai" → 10). Karena itu kecocokan "<angka> lantai" yang
 *   angkanya adalah ekor dimensi (didahului 'x'/'×') DILEWATI, lalu
 *   bentuk "lantai 2" (remediasi S7b) yang menang.
 * - "2 lantai 3 kamar": bentuk "lantai <angka>" akan salah memungut
 *   angka kamar — karena itu "<angka> lantai" yang sah dicek lebih dulu.
 * Lalu kata bilangan ("dua lantai" / "lantai dua") dan "bertingkat" (= 2,
 * konvensi katalog). Null bila tidak disebut.
 */
export function parseFloorsMention(text: string): number | null {
  const t = ` ${(text || '').toLowerCase()} `;
  // Negasi lantai (audit ekstrem 2026-11-08): "jangan dua lantai",
  // "tidak bertingkat", "bukan 2 lantai" adalah penyebutan NEGATIF —
  // pengguna justru menetapkan SATU lantai. Tanpa aturan ini pola
  // "<angka> lantai" di bawah memungut angka yang dinegasikan sebagai
  // nilai eksplisit (cacat terukur: "jangan dua lantai" → 2 lantai
  // eksplisit). Aturan ini berada di LAPISAN BERSAMA penyebutan lantai
  // sehingga semua pemanggil (IR tipologi & kebutuhan RAB) konsisten.
  if (/\b(?:jangan|tidak|tak|bukan)\s+(?:\d+|satu|dua|tiga|empat|lima)\s+lantai\b/.test(t)) return 1;
  if (/\b(?:tidak|tak|bukan)\s+bertingkat\b/.test(t)) return 1;
  if (/\bbertingkat\s+(?:tidak|tak|bukan)\b/.test(t)) return 1;
  // Penanda posisi frasa dimensi "A x B": angka tepat sebelum 'x'/'×'
  // adalah LEBAR dan angka tepat sesudahnya adalah PANJANG — keduanya
  // bukan jumlah lantai walau kata "lantai" berdiri di dekatnya
  // ("gudang satu lantai 12 x 25 m": yang disebut lantai adalah "satu";
  // 12 dan 25 adalah dimensi).
  // FASE 4 (CHAT-03, 2026-11-12): SEMUA kemunculan "A x B" dilindungi,
  // bukan hanya yang pertama — teks multi-gedung membawa DUA dimensi
  // ("gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m"):
  // dengan match() tunggal, "15" dari "15 x 10" tidak terlindungi lalu
  // pola "lantai <angka>" memungutnya sebagai 15 lantai (draft UI
  // E2E Fase 4 run 4: "luas 240 m², 15 lantai"). Dengan matchAll,
  // "15" tertolak sebagai lantai; kandidat terakhir yang sah adalah 2.
  const dimNumSpans: Array<[number, number]> = [];
  for (const dm of t.matchAll(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/g)) {
    if (dm.index == null) continue;
    const aStart = dm.index;
    const aEnd = aStart + dm[1].length;
    const bStart = dm.index + dm[0].length - dm[2].length;
    dimNumSpans.push([aStart, aEnd], [bStart, bStart + dm[2].length]);
  }
  const inDimSpan = (start: number, len: number) =>
    dimNumSpans.some(([s, e]) => start >= s && start + len <= e);
  // GUARD KAMAR (regresi audit 2026-11-08): frasa "<angka> kamar"
  // ditutupi ("### kamar") agar pola "lantai <angka>" tidak memungut
  // jumlah kamar sebagai lantai — "2 lantai 3 kamar" tetap 2 lantai.
  // Posisi dipertahankan (panjang sama) agar kandidat tetap terurut.
  const tG = t.replace(/\b\d+\s*kamar\b/g, (m) => '#'.repeat(m.length));
  // Urutan giliran layar: kandidat TERAKHIR di seluruh teks menang —
  // pada gabungan multi-giliran koreksi pengguna menggantikan nilai
  // lama ("dua lantai" → "satu lantai saja"; "2 lantai" → "lantai 3"
  // tidak terjadi karena bentuk yang sama). Semua pola mengumpulkan
  // kandidat berposisi, lalu kandidat berposisi terbesar yang menang,
  // apa pun bentuk katanya (angka, "<kata> lantai", "lantai <kata>").
  const candidates: Array<{ pos: number; value: number }> = [];
  const push = (pos: number, value: number) => {
    // Parser mencatat nilai eksplisit APA ADANYA (audit P0 A-098:
    // "100 lantai" sebelumnya disaring diam-diam menjadi "tidak
    // disebut" lalu jatuh ke asumsi 1 lantai — penyucian senyap).
    // Kewajaran jumlah lantai BUKAN urusan parser: itu tugas amplop
    // plausibilitas di validatePhysicalDimensions, yang menolak/
    // meminta klarifikasi secara terbuka.
    if (value >= 1 && value <= 999) candidates.push({ pos, value });
  };
  const beforeRe = /(\d+)\s*lantai/g;
  let bm: RegExpExecArray | null;
  while ((bm = beforeRe.exec(tG)) !== null) {
    const prev = bm.index > 0 ? tG[bm.index - 1] : ' ';
    if (prev === 'x' || prev === '×') continue; // ekor dimensi, bukan lantai
    if (inDimSpan(bm.index, bm[1].length)) continue; // angka dimensi, bukan lantai
    push(bm.index, parseInt(bm[1], 10));
  }
  // "lantai <angka>": lewati angka yang merupakan AWAL dimensi ("dua
  // lantai 6x9" — angka 6 adalah dimensi, bukan lantai; bentuk kata
  // bilangan di bawah yang berlaku). Perbaikan dataset audit 2026-11-06.
  const afterRe = /\blantai\s*(\d+)/g;
  let am: RegExpExecArray | null;
  while ((am = afterRe.exec(tG)) !== null) {
    const next = tG[(am.index ?? 0) + am[0].length];
    if (next === 'x' || next === '×') continue;
    if (inDimSpan(am.index + am[0].length - am[1].length, am[1].length)) continue;
    // GUARD SATUAN UKUR (cacat live 2026-11-22, Preview 9p1tqx9l1):
    // "1 lantai 60 m2" — angka sesudah "lantai" yang diikuti satuan
    // ukuran (m2/m²/meter persegi/m) adalah UKURAN, bukan jumlah
    // lantai. Tanpa guard ini pola "lantai <angka>" memungut 60 lalu
    // aturan "kandidat terakhir menang" mengalahkan "1 lantai" yang
    // benar dari pola "<angka> lantai".
    const restAfterNum = tG.slice((am.index ?? 0) + am[0].length);
    if (/^\s*(m2|m²|meter\s*persegi|meter|m)\b/.test(restAfterNum)) continue;
    push(am.index, parseInt(am[1], 10));
  }
  for (const m of tG.matchAll(/\blantai\s+(satu|dua|tiga|empat|lima)\b/g)) {
    const v = WORD_FLOORS[m[1]];
    if (v != null) push(m.index ?? 0, v);
  }
  for (const m of tG.matchAll(/\b(satu|dua|tiga|empat|lima)\s+lantai\b/g)) {
    const v = WORD_FLOORS[m[1]];
    if (v != null) push(m.index ?? 0, v);
  }
  // WD-3.7-03: bentuk Inggris "two-story" / "2-storey" / "3 story" —
  // digit maupun kata bilangan, tanda hubung maupun spasi, ejaan
  // Amerika maupun Britania (story/storey). Kandidat yang sama
  // (posisi terakhir menang) seperti bentuk Indonesia di atas.
  for (const m of tG.matchAll(/\b(\d+)[- ]stor(e)?y\b/g)) {
    push(m.index ?? 0, parseInt(m[1], 10));
  }
  for (const m of tG.matchAll(/\b(one|two|three|four|five)[- ]stor(e)?y\b/g)) {
    const v = EN_WORD_FLOORS[m[1]];
    if (v != null) push(m.index ?? 0, v);
  }
  if (candidates.length > 0) {
    candidates.sort((x, y) => x.pos - y.pos);
    return candidates[candidates.length - 1].value;
  }
  // "3 kamar (tidur)" yang berdiri SENDIRI tanpa kata lantai BUKAN
  // jumlah lantai — jangan pernah menaikkan "2 lantai 3 kamar" menjadi
  // 3 lantai (regresi lama audit 2026-11-08).
  // Koreksi kepemilikan frasa "lantainya <N> (saja)" (audit ekstrem
  // 2026-11-08, Kategori F): penanda -nya + kata penutup "saja" adalah
  // bentuk koreksi kepemilikan yang sangat umum ("lantainya 1 saja" =
  // tetapkan 1 lantai). Pola "lantai\s*<angka>" di atas SENGAJA tidak
  // menangkapnya karena akhiran -nya — tanpa aturan ini koreksi
  // dilaporkan "tidak ada perubahan" dan nilai lama bertahan. Pola ini
  // hanya berjalan bila tidak ada kandidat lain sama sekali, dan kata
  // "jadi <N> lantai" tanpa kata "lantai" terpisah TIDAK ditambahkan:
  // bentuk itu ambigu dengan konteks lain.
  const possessive = t.match(/\blantainya\s*(\d+)\s*(?:saja|aja)?\b/);
  if (possessive) {
    const v = parseInt(possessive[1], 10);
    if (v >= 1 && v <= 999) return v;
  }
  if (/\bbertingkat\b/.test(tG)) return 2;
  return null;
}

/**
 * Apakah kemunculan istilah pada `index` di teks (sudah ternormalisasi
 * lowercase) didahului LANGSUNG oleh kata negasi (bukan/jangan/tidak/
 * tak)? Aturan bersama deteksi fungsi (buildingTypology) dan deteksi
 * cakupan (universalRab) — audit ekstrem G-081: istilah yang
 * dinegasikan pengguna ("bukan gudang") tidak boleh ikut bertanding
 * di lapisan deteksi mana pun.
 */
export function isNegatedAt(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 16), index);
  // Fase 2 Bagian B (audit §3): 'tanpa' adalah negasi — "jalan tanpa
  // drainase" tidak boleh memicu scope drainase. 'eksisting' SENGAJA
  // tidak ditambahkan ke negasi global (ditangani suppression
  // deterministik di specChain, bukan deteksi teks).
  return /\b(?:bukan|jangan|tidak|tak|tanpa)\s*$/.test(before);
}

/** Kategori pekerjaan linear (panjang adalah kebutuhan utamanya). */
export function isLinearKind(kind: RabKind | null): boolean {
  return kind === 'jalan' || kind === 'drainase' || kind === 'jembatan' || kind === 'irigasi';
}

/**
 * Panjang pekerjaan linear dari teks: "panjang 1 km", "1 km", "500 m",
 * "panjang 250 meter". Mengembalikan nilai meter + rentang teks yang
 * terpakai (dipakai untuk menetralkan tafsir "km" sebagai kamar mandi).
 * Bentuk meter polos ("500 m") hanya diterima bila teks tidak memuat
 * pola dimensi "AxB" (yang sudah ditangani ekstraksi dimensi generik).
 */
export function parseLinearLength(
  text: string,
  hasDims: boolean
): { value: number; span: [number, number] } | null {
  const t = ` ${text.toLowerCase().trim().replace(/\s+/g, ' ')} `;
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const panjang = t.match(
    /panjang\s*(?:=|sekitar|kurang lebih)?\s*(\d+(?:[.,]\d+)?)\s*(km|kilometer|m|meter)\b/
  );
  if (panjang) {
    const v = num(panjang[1]) * (panjang[2].startsWith('k') ? 1000 : 1);
    if (Number.isFinite(v) && v > 0) {
      return { value: v, span: [panjang.index ?? 0, (panjang.index ?? 0) + panjang[0].length] };
    }
  }
  const kmMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer)\b/);
  if (kmMatch) {
    const v = num(kmMatch[1]) * 1000;
    if (Number.isFinite(v) && v > 0) {
      return { value: v, span: [kmMatch.index ?? 0, (kmMatch.index ?? 0) + kmMatch[0].length] };
    }
  }
  if (!hasDims) {
    const mMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(m|meter)\b/);
    if (mMatch) {
      const v = num(mMatch[1]);
      if (Number.isFinite(v) && v > 0) {
        return { value: v, span: [mMatch.index ?? 0, (mMatch.index ?? 0) + mMatch[0].length] };
      }
    }
  }
  return null;
}

/** Format panjang untuk ringkasan: 1000 → "1 km (1.000 m)", 250 → "250 m". */
export function formatLengthM(m: number): string {
  const meters = `${m.toLocaleString('id-ID')} m`;
  if (m >= 1000) {
    const km = (m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 3 });
    return `${km} km (${meters})`;
  }
  return meters;
}

/* ------------------------------------------------------------------ */
/* Parser budget KANONIS (Universal Construction Intelligence §2,      */
/* S1-R2/F11 — SATU-SATUNYA parser budget di repo).                    */
/*                                                                     */
/* Sebelumnya 4 situs menduplikasi parsing budget dengan perilaku      */
/* berbeda (rabIntentSpec, universalRab, draftRevision,                */
/* universalIntake): guard "uang" hanya di 2 situs, "budget menjadi   */
/* 250 juta" tidak tertangkap di universalRab, dan celah "uang muka   */
/* Rp 50 juta" diakui di komentar rabIntentSpec (cabang fallback `rp`  */
/* tidak melewati guard "uang"). Keempat situs kini memanggil          */
/* `parseBudgetMentions` di bawah dan hanya berbeda pada PILIHAN       */
/* (pertama vs terakhir) — pola, guard, dan ambang yang sama.          */
/*                                                                     */
/* Aturan (dipin di src/test/universalClassification.test.ts):         */
/* - Kata kunci: anggaran|budget|dana|biaya|harga|maks(imal)|mentok|   */
/*   total|rp|sekitar|kurang lebih|uang. Kata sisipan wajar antara     */
/*   kata kunci dan angka ("menjadi/sebesar/senilai/adalah/saya/ke",   */
/*   "maksimal/mentok/sekitar/kisaran", "Rp") tidak menggagalkan.      */
/* - Satuan: miliar|milyar|m (= miliar), jt|juta, rb|ribu|k (= ribu).  */
/*   Tanpa satuan, angka diterima hanya bila ≥ Rp1.000.000 (aturan     */
/*   draftRevision — "anggaran 50" bukan nominal), KECUALI cabang      */
/*   Rp telanjang ("Rp 500.000.000" tanpa kata kunci → ≥ Rp10.000,     */
/*   aturan fallback rabIntentSpec).                                   */
/* - Guard "uang" (prompt owner 2026-11-22): "uang" adalah kata kunci  */
/*   anggaran, TAPI "uang muka/jalan/saku" (termasuk bentuk -nya)      */
/*   BUKAN cap anggaran — ditolak lewat lookahead negatif pada kata    */
/*   "uang" DAN lewat penolakan jendela pada kecocokan `rp`/Rp        */
/*   telanjang yang didahului frasa itu (menutup celah "uang muka      */
/*   Rp 50 juta"). `\b` di depan "uang" mencegah "ruang 120jt".       */
/* - Koreksi "bukan X" (semantik koreksi yang sama dengan seluruh      */
/*   repo): nilai yang dibatalkan pola "bukan <angka>" tidak pernah    */
/*   menang — "bukan 300 juta, tapi 250 juta" → 250 juta di SEMUA      */
/*   situs (sebelumnya situs first-match justru memakai 300 jt).       */
/* - Cabang Rp telanjang TIDAK dihidupkan bila kata kunci budget       */
/*   muncul ≤40 karakter sebelumnya — cabang kata kunci yang           */
/*   memilikinya (agar "budget Rp 500.000" tetap ditolak sebagai       */
/*   unitless < Rp1 jt, bukan dihidupkan ulang lewat Rp).              */
/* ------------------------------------------------------------------ */

export type BudgetMentionKind = 'MAXIMUM' | 'ESTIMATED' | 'TARGET' | 'UNSPECIFIED';

export interface BudgetMention {
  /** Nominal rupiah penuh (sudah dikali faktor satuan). */
  amount: number;
  /** Jenis batas dari kualifier teks (maksimal / sekitar / target). */
  kind: BudgetMentionKind;
  /** Teks kecocokan apa adanya (untuk provenance / pesan). */
  original: string;
  /** Posisi awal kecocokan pada teks ternormalisasi. */
  index: number;
  /** true bila angka membawa satuan skala (jt/juta/miliar/ribu/k/m). */
  hasUnit: boolean;
}

/** Faktor satuan budget kanonis (diekspor agar pemindai konflik di agentOrchestrator memakai faktor yang sama — satu sumber). */
export const BUDGET_UNIT_FACTORS: Record<string, number> = {
  miliar: 1_000_000_000, milyar: 1_000_000_000, m: 1_000_000_000,
  jt: 1_000_000, juta: 1_000_000, rb: 1_000, ribu: 1_000, k: 1_000,
};

/** Token angka format Indonesia (dipakai bersama parser budget). */
const BUDGET_NUM_TOKEN = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?`;

/** Kata kunci budget (gabungan keempat situs lama — lihat header). */
const BUDGET_KEYWORD_SRC =
  String.raw`anggaran|budget|dana|biaya|harga|maks(?:imal)?|mentok|total|rp\.?|sekitar|kurang\s+lebih|\buang(?!\s+(?:muka|jalan|saku)(?:nya)?\b)`;

/** Kata sisipan wajar antara kata kunci budget dan angkanya. */
const BUDGET_FILLER_SRC =
  String.raw`(?:maksimal|maks|mentok|sekitar|kisaran|kira-kira)?\s*(?:rp\.?\s*)?(?:\s*(?:menjadi|sebesar|senilai|adalah|saya|ke))*`;

function budgetKindFromWindow(windowText: string): BudgetMentionKind {
  if (/\b(maksimal|maks|mentok|paling banyak)\b/.test(windowText)) return 'MAXIMUM';
  if (/\b(sekitar|kisaran|kira-kira)\b/.test(windowText)) return 'ESTIMATED';
  if (/\btarget\b/.test(windowText)) return 'TARGET';
  return 'UNSPECIFIED';
}

/**
 * SEMUA penyebutan budget pada teks, berurutan posisi. Satu-satunya
 * implementasi parsing budget — situs pemanggil hanya memilih
 * pertama (rabIntentSpec, draftRevision) atau terakhir (universalRab,
 * universalIntake) dari daftar ini.
 */
export function parseBudgetMentions(text: string): BudgetMention[] {
  const t = ` ${(text || '').toLowerCase().replace(/\s+/g, ' ')} `;
  // Nilai yang dibatalkan pola koreksi "bukan <angka> <satuan?>".
  const cancelled = new Set<number>();
  for (const m of t.matchAll(
    new RegExp(`\\bbukan\\s+(?:rp\\.?\\s*)?(${BUDGET_NUM_TOKEN})\\s*(miliar|milyar|jt|juta|rb|ribu|k|m)?\\b`, 'g'),
  )) {
    const v = parseAreaNumber(m[1]);
    if (v != null) cancelled.add(Math.round(v * (BUDGET_UNIT_FACTORS[m[2] ?? ''] ?? 1)));
  }
  const found: BudgetMention[] = [];
  const spans: Array<[number, number]> = [];
  const overlapsAccepted = (start: number, end: number): boolean =>
    spans.some(([s, e]) => start < e && end > s);
  const precededByUangMuka = (start: number): boolean =>
    /\buang\s+(muka|jalan|saku)(?:nya)?\b(?:\s*rp\.?)?\s*$/.test(t.slice(Math.max(0, start - 40), start));
  const pushMention = (
    start: number, end: number, original: string,
    numStr: string, unit: string | undefined, hasUnit: boolean,
  ): void => {
    if (overlapsAccepted(start, end)) return;
    if (precededByUangMuka(start)) return; // celah "uang muka Rp …" (F11)
    const v = parseAreaNumber(numStr);
    if (v == null || v <= 0) return;
    const amount = Math.round(v * (unit ? (BUDGET_UNIT_FACTORS[unit] ?? 1) : 1));
    if (!hasUnit && amount < 1_000_000) return; // "anggaran 50" bukan nominal
    if (cancelled.has(amount)) return;
    const windowText = t.slice(Math.max(0, start - 30), end);
    found.push({
      amount,
      kind: budgetKindFromWindow(windowText),
      original: original.trim(),
      index: start,
      hasUnit,
    });
    spans.push([start, end]);
  };
  // Cabang 1 — kata kunci budget + angka (+ satuan opsional).
  const kwRe = new RegExp(
    `(?:${BUDGET_KEYWORD_SRC})\\s*${BUDGET_FILLER_SRC}\\s*(${BUDGET_NUM_TOKEN})\\s*(miliar|milyar|jt|juta|rb|ribu|k|m)?\\b`,
    'g',
  );
  for (const m of t.matchAll(kwRe)) {
    const start = m.index ?? 0;
    pushMention(start, start + m[0].length, m[0], m[1], m[2], m[2] != null);
  }
  // Cabang 2 — Rp telanjang tanpa kata kunci ("Rp 500.000.000").
  // Hanya bila TIDAK ada kata kunci budget ≤40 karakter sebelumnya
  // (bila ada, cabang 1 yang memilikinya — lihat header).
  const rpRe = new RegExp(`\\brp\\.?\\s*(${BUDGET_NUM_TOKEN})\\s*(miliar|milyar|jt|juta|rb|ribu|k|m)?\\b`, 'g');
  for (const m of t.matchAll(rpRe)) {
    const start = m.index ?? 0;
    if (overlapsAccepted(start, start + m[0].length)) continue;
    if (precededByUangMuka(start)) continue;
    const before = t.slice(Math.max(0, start - 40), start);
    if (/(anggaran|budget|dana|biaya|harga|maks(?:imal)?|mentok|total|uang|sekitar|kurang lebih)\b[^.]{0,40}$/.test(before)) continue;
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    const amount = Math.round(v * (m[2] ? (BUDGET_UNIT_FACTORS[m[2]] ?? 1) : 1));
    // Tanpa satuan, Rp telanjang memakai ambang fallback rabIntentSpec
    // (≥ Rp10.000) — lebih longgar dari ambang kata kunci karena "Rp"
    // sendiri sudah menegaskan konteks nominal.
    if (!m[2] && amount < 10_000) continue;
    if (cancelled.has(amount)) continue;
    found.push({
      amount,
      kind: budgetKindFromWindow(t.slice(Math.max(0, start - 30), start + m[0].length)),
      original: m[0].trim(),
      index: start,
      hasUnit: m[2] != null,
    });
    spans.push([start, start + m[0].length]);
  }
  found.sort((a, b) => a.index - b.index);
  return found;
}

/* ------------------------------------------------------------------ */
/* Ukuran universal bersama (S1-R3 — satu sumber ekstraksi ukuran      */
/* lintas disiplin: bentang, lebar, tinggi, tebal, volume, jumlah,     */
/* kedalaman). Kedalaman (koordinator 2026-11-22, final gate A-079):   */
/* "sumur bor 30 m" adalah kedalaman, bukan panjang — tanpa field ini  */
/* template sumur bor (UTIL-DEEP-WELL, param well_depth) tidak pernah  */
/* bisa dipetakan dari ukuran yang disebut pengguna.                   */
/* Dipakai extractUniversalSpec (universalRab) dan                    */
/* extractRabIntentSpec (rabIntentSpec) agar kedua model spek membaca  */
/* angka yang SAMA dari teks yang sama. Pola dipindah verbatim dari    */
/* extractUniversalSpec — tidak ada perilaku baru.                     */
/* ------------------------------------------------------------------ */

export interface UniversalMeasures {
  spanM: number | null;
  widthM: number | null;
  heightM: number | null;
  thicknessCm: number | null;
  volumeM3: number | null;
  count: number | null;
  /** Kedalaman eksplisit (m) — "kedalaman 30 m" / "dalam 30 m". */
  depthM: number | null;
}

export function extractUniversalMeasures(rawText: string): UniversalMeasures {
  const lower = (rawText || '').toLowerCase();
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  // WD-3.7-04 / WD-3.7-03: satuan jamak Inggris ("span 8 meters") +
  // kata sifat di antara jangkar dan angka ("bentang struktur 8
  // meter") + kata kunci Inggris (width/height/depth/thickness).
  // Pola bentang kini setara dengan parseAnchoredLinear di jalur
  // intake (paritas dipin di universalClassification — kedua parser
  // membaca angka yang sama dari teks yang sama).
  const span = lower.match(/(?:bentang|span)\s*(?:[a-z]{2,}\s+){0,2}(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meters?|m)\b/);
  const width = lower.match(/(?:lebar|width)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meters?|m)\b/);
  const height = lower.match(/(?:tinggi|height)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meters?|m)\b/);
  // Tebal: kata kunci tebal/thickness/thick (dengan kata elemen
  // opsional — "tebal pelat 12 cm") ATAU berjangkar elemen ("pelat
  // 8 cm", "slab 8 cm" — angka+cm sesudah kata pelat/slab ADALAH
  // tebalnya, tanpa perlu kata "tebal").
  const thick = lower.match(/(?:tebal|thickness|thick)\s*(?:pelat|slab|dinding|plat)?\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*cm\b/)
    ?? lower.match(/(?:pelat|slab)(?:nya)?\s*(?:tebal\s*)?(\d+(?:[.,]\d+)?)\s*cm\b/);
  // 'dalam' berjangkar angka+satuan ("dalam 30 m") dibaca sebagai
  // kedalaman — KECUALI diikuti "dari" ("dalam 30 m dari jalan" =
  // JARAK dari jalan, bukan kedalaman — Batch 3 §6.3). Frasa
  // "dalam X m" tanpa konteks kedalaman lain tetap dibaca sebagai
  // kedalaman; ambiguitas sisanya dicatat (sama seperti
  // 'tinggi'/'lebar' berjangkar). Semantik posisi-pertama dari
  // regex asli dipertahankan: bila 'kedalaman' dan 'dalam' sama-sama
  // ada, yang muncul lebih dulu yang dipakai.
  const depth = (() => {
    const kd = lower.match(/(?:kedalaman|depth)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meters?|m)\b/);
    const dl = lower.match(/(?:dalam|deep)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meters?|m)\b/);
    const dlOk = dl && !/^\s*dari\b/.test(lower.slice((dl.index ?? 0) + dl[0].length, (dl.index ?? 0) + dl[0].length + 12)) ? dl : null;
    if (kd && dlOk) return (kd.index ?? 0) <= (dlOk.index ?? 0) ? kd : dlOk;
    return kd ?? dlOk;
  })();
  // "m³": ³ bukan karakter kata (\w) sehingga \b SESUDAHNYA selalu
  // gagal — cabang superskrip tanpa \b (³ sudah membatasi diri).
  const vol = lower.match(/(\d+(?:[.,]\d+)?)\s*m(?:3\b|³)/);
  // Basis ukuran JUMLAH ("24 titik", "20 unit", "5 buah", "1 paket",
  // "30 ekor"): "titik" hanya dihitung bila teks menyebut pekerjaan
  // yang memang berbasis titik (pondasi/sanitasi/MEP) agar "titik"
  // geografis tidak salah tafsir; unit/buah/paket bersifat umum.
  const count = (() => {
    const cm = lower.match(/(\d+(?:[.,]\d+)?)\s*(units?|buah|paket|set|titik|ekor)\b/);
    if (!cm) return null;
    const v = num(cm[1]);
    if (!(v > 0)) return null;
    if (cm[2] === 'titik' && !/(pondasi|bore|pancang|sumuran|strauss|kloset|floor drain|perkuatan|titik lampu|titik air|instalasi|sanitasi)/.test(lower)) return null;
    return v;
  })();
  return {
    spanM: span ? num(span[1]) : null,
    widthM: width ? num(width[1]) : null,
    heightM: height ? num(height[1]) : null,
    thicknessCm: thick ? num(thick[1]) : null,
    volumeM3: vol ? num(vol[1]) : null,
    count,
    depthM: depth ? num(depth[1]) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Validasi dimensi fisik (finalisasi 2026-11-08, §4).                 */
/*                                                                     */
/* Seluruh regex dimensi di parser ini menolak angka ≤ 0 SECARA        */
/* SENYAP: "-5x10" terbaca sebagai 5×10 (tanda minus hilang) dan       */
/* "0x0" tidak menghasilkan dimensi apa pun — tanpa sinyal apa pun ke  */
/* pemanggil. Akibatnya permintaan tidak valid lolos menjadi draft     */
/* (kasus amb-020) alih-alih ditolak dengan permintaan koreksi.        */
/* Fungsi di bawah adalah LAPISAN VALIDASI BERSAMA: dipakai parser di  */
/* sini (extractRabNeeds) dan lapisan pemahaman (buildingTypology)     */
/* agar sinyalnya identik di semua jalur.                              */
/* ------------------------------------------------------------------ */

/**
 * Periksa dimensi fisik dari teks mentah. Mengembalikan daftar masalah
 * (kosong = tidak ada masalah). Aturan:
 * - dimensi "A x B" dengan A ≤ 0 atau B ≤ 0 (termasuk tanda minus yang
 *   eksplisit maupun nol) → tidak valid;
 * - pasangan panjang/lebar berlabel dengan nilai ≤ 0 → tidak valid;
 * - dimensi "terbalik" (dua angka dihubungkan kata "terbalik", mis.
 *   "20x10 terbalik") BUKAN kesalahan: luas tapak tidak berubah oleh
 *   urutan — dinyatakan JELAS di sini agar tidak diperlakukan sebagai
 *   malformed; konvensi lebar×panjang di IR sudah menandainya sebagai
 *   ambiguitas urutan, bukan kegagalan validasi.
 * Angka berkonteks "bukan <angka>" (koreksi pengguna: nilai yang
 * dibatalkan) tidak diperiksa — nilai itu memang tidak berlaku.
 */
export function validatePhysicalDimensions(rawText: string): string[] {
  const t = ` ${(rawText || '').toLowerCase().replace(/\s+/g, ' ')} `
    .replace(/\bbukan\s+-?\d+(?:[.,]\d+)?/g, ' ');
  const problems: string[] = [];
  const pair = t.match(/(-?\d+(?:[.,]\d+)?)\s*[x×]\s*(-?\d+(?:[.,]\d+)?)/);
  if (pair) {
    const a = parseFloat(pair[1].replace(',', '.'));
    const b = parseFloat(pair[2].replace(',', '.'));
    if (!(a > 0) || !(b > 0)) {
      problems.push(
        `Dimensi bangunan "${pair[1]} x ${pair[2]}" tidak valid: panjang dan lebar harus lebih dari 0 meter.`
      );
    }
  }
  for (const label of ['panjang', 'lebar', 'tinggi', 'kedalaman', 'dalam'] as const) {
    const m = t.match(new RegExp(`${label}\\s*(?:=|sekitar)?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*(?:meter|m)\\b`));
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (!(v > 0)) problems.push(`Nilai ${label} "${m[1]}" tidak valid: harus lebih dari 0 meter.`);
    }
  }
  // Audit ekstrem 2026-11-08 (KELUARGA LUBANG-VALIDASI): panjang linear
  // POLOS ("jalan -5 km", "drainase -100 m") sebelumnya lolos — pola
  // parseLinearLength menolak tanda minus secara senyap sehingga angka
  // negatifnya hilang dan tersisa panjang positif dari kata lain, atau
  // lengthM null tanpa sinyal. Di sini pola yang SAMA diperiksa dengan
  // tanda minus diizinkan agar nilai ≤ 0 (minus eksplisit maupun nol)
  // terdeteksi sebagai masalah — bukan diubah senyap menjadi positif.
  // "panjang -100 m" berlabel sudah tertangkap pola label di atas;
  // pola polos di bawah ini menutup sisanya. Bentuk "AxB" dikecualikan
  // dari pola meter-polos (sama seperti parseLinearLength) karena
  // pasangan dimensi sudah diperiksa oleh pola pair di atas.
  const hasDimsPair = /\d+(?:[.,]\d+)?\s*[x×]\s*\d/.test(t);
  const linWord = t.match(/(?:^|\s)(panjang|sepanjang)\s*(?:=|sekitar|kurang lebih)?\s*(-\d+(?:[.,]\d+)?|0(?:[.,]0+)?)\s*(km|kilometer|meter|m)\b/);
  if (linWord) {
    problems.push(
      `Nilai panjang "${linWord[2]} ${linWord[3]}" tidak valid: panjang harus lebih dari 0 meter.`
    );
  } else {
    const kmBad = t.match(/(?:^|\s)(-\d+(?:[.,]\d+)?|0(?:[.,]0+)?(?![\d.,]))\s*(km|kilometer)\b/);
    if (kmBad) {
      problems.push(
        `Nilai panjang "${kmBad[1]} ${kmBad[2]}" tidak valid: panjang harus lebih dari 0 meter.`
      );
    } else if (!hasDimsPair) {
      const mBad = t.match(/(?:^|\s)(-\d+(?:[.,]\d+)?)\s*(meter|m)\b/);
      if (mBad) {
        problems.push(
          `Nilai panjang "${mBad[1]} ${mBad[2]}" tidak valid: panjang harus lebih dari 0 meter.`
        );
      }
    }
  }
  /* --- Perluasan audit P0 2026-11-08: lahan negatif (A-096), amplop
   * plausibilitas tapak (A-097) & lantai (A-098). ---
   * (A-096) Luas lahan ≤ 0 sebelumnya lolos diam-diam: parser luas
   * membuang tanda minus ("tanah -500 m2" → tak terbaca, lahan null)
   * dan draft tetap dibuat. Di lapisan bersama ini nilai ≤ 0 pada
   * frasa lahan dinyatakan sebagai masalah validasi — ditolak/diminta
   * klarifikasi, bukan diproses.
   * (A-097/A-098) Amplop kewajaran fisik memakai batas yang
   * TERDOKUMENTASI dari katalog template resmi EZRAB sendiri (bukan
   * angka karangan): luas satu bangunan terbesar pada katalog adalah
   * warehouse_area maks 50.000 m² (BLD-IND-WAREHOUSE) dan jumlah lantai
   * tertinggi adalah 60 (BLD-HIGHRISE-TOWER / BLD-HIGHRISE-OFFICE-A).
   * Nilai di luar amplop DITANDAI dengan basisnya di sini sehingga
   * pemanggil meminta klarifikasi — TIDAK ditolak diam-diam dan TIDAK
   * dinormalisasi diam-diam ke nilai lain. */
  const landNeg =
    t.match(/(?:tanah|lahan)(?:nya)?\s*(?:seluas\s*|=\s*)?-\s*(\d+(?:[.,]\d+)?)/) ??
    t.match(/-\s*(\d+(?:[.,]\d+)?)\s*m(?:2|²)\s*(?:untuk\s+)?(?:tanah|lahan)\b/);
  if (landNeg) {
    problems.push(
      `Luas lahan "-${landNeg[1]} m²" tidak valid: luas lahan harus lebih dari 0 m² — sebutkan luas lahan yang benar.`
    );
  } else if (/(?:tanah|lahan)(?:nya)?\s*(?:seluas\s*)?0(?:[.,]0+)?\s*m(?:2|²)\b/.test(t)) {
    problems.push('Luas lahan 0 m² tidak valid: luas lahan harus lebih dari 0 m².');
  }
  if (pair) {
    const a = parseFloat(pair[1].replace(',', '.'));
    const b = parseFloat(pair[2].replace(',', '.'));
    if (a > 0 && b > 0 && a * b > 50000) {
      problems.push(
        `Tapak bangunan ${pair[1]} × ${pair[2]} m = ${(a * b).toLocaleString('id-ID')} m² melebihi amplop kewajaran satu bangunan (maks 50.000 m² — batas luas terbesar pada katalog template EZRAB). Kemungkinan salah ketik atau salah satuan — klarifikasi dulu; angka ini tidak diproses diam-diam sebagai luas bangunan.`
      );
    }
  }
  const floorsMention = parseFloorsMention(rawText);
  if (floorsMention != null && floorsMention > 60) {
    problems.push(
      `Jumlah lantai ${floorsMention} melebihi amplop kewajaran bangunan (maks 60 lantai — batas tertinggi pada katalog template EZRAB). Nilai eksplisit Anda TIDAK dinormalisasi diam-diam menjadi angka lain — klarifikasi jumlah lantainya.`
    );
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* WD-3.7-01 (2026-11-24): pasangan "A x B" BUTA SATUAN. Regex lama   */
/* `/(\d+)\s*[x×]\s*(\d+)\s*m?\b/` menangkap "kolom 15x15 cm" sebagai  */
/* tapak 15×15 m (225 m² — salah 10.000×): `m?` cocok kosong dan `\b` */
/* bertahan sebelum "c". Pasangan pertama yang LOLOS semua penjaga    */
/* di bawah yang dipakai sebagai dimensi bangunan; pasangan yang      */
/* gagal dilewati (pasangan berikutnya masih dicoba — "kolom 15x15    */
/* cm, rumah 6x15 m" tetap membaca 6×15).                             */
/* (a) Satuan cm/mm sesudah pasangan = penampang elemen — DILEWATI,   */
/*     bukan disimpan sebagai meter dan bukan dikonversi (tidak ada   */
/*     store penampang; mengarangnya di luar cakupan perbaikan ini).  */
/* (b) Tanpa penanda m/meter, pasangan hanya sah bila teks memuat     */
/*     jangkar konteks bangunan (jenis/kata bangunan, jumlah lantai,  */
/*     kamar, carport, ukuran/denah/tapak/lahan/luas) — "15x15"       */
/*     telanjang tanpa konteks bukan dimensi bangunan.                */
/* (c) Pasangan yang langsung didahului kata elemen struktur          */
/*     (kolom/balok/pelat/sloof/dinding/…) adalah penampang elemen,   */
/*     bukan tapak — walau bersatuan meter ("dinding 10x3 m").        */
/* (d) validatePhysicalDimensions TIDAK diumpankan ke sini: ia        */
/*     seberkas (tanpa siklus) tapi validator PELAPOR — kontraknya    */
/*     "ditandai, tidak ditolak/dinormalisasi diam-diam" — dan        */
/*     RabNeeds tidak punya kanal masalah; cek positivitasnya sudah   */
/*     diduplikasi di bawah, dan amplop 50.000 m² tetap urusan        */
/*     pemanggil yang bisa menampilkan masalahnya.                    */
/* ------------------------------------------------------------------ */

/** Kata elemen struktur — pasangan dimensi sesudahnya adalah penampang elemen, bukan tapak. */
const MEMBER_SECTION_WORDS = [
  'kolom', 'balok', 'pelat', 'sloof', 'dinding', 'tembok', 'pintu', 'jendela', 'pondasi',
  'column', 'beam', 'slab', 'wall', 'door', 'window', 'footing',
];

/** Jangkar konteks bangunan untuk pasangan "A x B" tanpa satuan (aturan (b)). */
const BUILDING_CONTEXT_RE = /\b(rumah|gedung|gudang|bangunan|villa|ruko|kantor|toko|sekolah|masjid|pabrik|bengkel|kos|kontrakan|apartemen|hotel|rumah sakit|klinik|puskesmas|restoran|kafe|showroom|apotek|warung|musholla|mushola|kios|aula|pasar|warehouse|kamar|carport|ukuran|dimensi|denah|tapak|tanah|lahan|luas|bangun|house|building)\b|(?:\d+\s*lantai|\blantai\s+\d+|\b(?:satu|dua|tiga|empat|lima)\s+lantai\b|\blantai\s+(?:satu|dua|tiga|empat|lima)\b)/;

const DIMS_PAIR_RE = /(\d+(?:[.,]\d+)?)\s*(cm|mm|meters?|m)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|meters?|m)?\b/g;

/** Pasangan dimensi bangunan pertama yang lolos penjaga WD-3.7-01, atau null. */
function pickBuildingDims(t: string): { a: number; b: number } | null {
  const hasBuildingContext = BUILDING_CONTEXT_RE.test(t);
  const memberRe = new RegExp(`(?:${MEMBER_SECTION_WORDS.join('|')})(?:nya)?\\s*:?\\s*$`);
  for (const m of t.matchAll(DIMS_PAIR_RE)) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[3].replace(',', '.'));
    if (!(a > 0) || !(b > 0)) continue;
    // Satuan boleh menempel di EITHER sisi ("17 m x 9 m", "17 x 9 m",
    // "17 cm x 9 cm") — cm/mm di sisi mana pun menolak pasangan.
    const unit1 = (m[2] ?? '').toLowerCase();
    const unit2 = (m[4] ?? '').toLowerCase();
    if (unit1 === 'cm' || unit1 === 'mm' || unit2 === 'cm' || unit2 === 'mm') continue; // (a) penampang elemen
    const before = t.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (memberRe.test(before)) continue; // (c) penampang elemen
    const isMeter = (u: string) => u === 'm' || u === 'meter' || u === 'meters';
    const hasMeterMarker = isMeter(unit1) || isMeter(unit2);
    if (!hasMeterMarker && !hasBuildingContext) continue; // (b) tanpa konteks
    return { a, b };
  }
  return null;
}

/** Ekstrak kebutuhan dari satu teks. Tidak menebak kolom yang tak disebut. */
export function extractRabNeeds(text: string, base?: RabNeeds): RabNeeds {
  const t = ` ${text.toLowerCase().trim().replace(/\s+/g, ' ')} `;
  const n: RabNeeds = base ? { ...base } : emptyRabNeeds();

  // Deteksi JENIS berjalan pada teks yang klausa fungsi ternegasinya
  // dinetralkan (audit ekstrem G-081): pada "bukan gudang tapi rumah",
  // pola gedung menangkap "gudang" lebih dulu sehingga jenis kebutuhan
  // ikut salah walau fungsi tipologi sudah benar. Daftar kata
  // fungsinya sama dengan koreksi negasi di buildingTypology; teks
  // asli tetap dipakai seluruh ekstraksi lain.
  const tKind = t.replace(
    /\b(?:bukan|jangan)\s+(?:gudang|rumah|ruko|kantor|pabrik|toko|sekolah|klinik|workshop|bengkel|masjid|gedung|bangunan)\b/g,
    ' '
  );
  for (const k of KIND_PATTERNS) {
    if (k.re.test(tKind)) {
      n.kind = k.kind;
      const m = tKind.match(k.re);
      n.kindLabel = k.kind === 'gedung' && m ? m[0].trim() : k.label;
      break;
    }
  }

  const floors = parseFloorsMention(text);
  if (floors != null) {
    n.floors = floors;
    n.floorsMentioned = true;
  }

  // Luas lahan pada teks yang sama (2026-11-08): diisi dari frasa lahan
  // eksplisit agar state kebutuhan ikut menyimpannya antar-giliran
  // (sebelumnya kolom ini dideklarasikan tapi tidak pernah diisi).
  // functionId/functionLabel SENGAJA tidak diisi di sini: deteksinya
  // hidup di buildingTypology.ts yang MENGIMPOR modul ini — mengisi di
  // sini akan membuat impor melingkar. Pemanggil yang butuh fungsi
  // memakai understandProject()/extractUniversalSpec yang sudah
  // menggabungkan keduanya.
  const landHere = resolveLandAreaM2(text);
  if (landHere != null) n.landAreaM2 = landHere;

  const dims = pickBuildingDims(t);
  if (dims) {
    n.landLength = dims.a;
    n.landWidth = dims.b;
    // Dimensi yang sama dicatat juga sebagai dimensi BANGUNAN terstruktur
    // (buildingTypology): jalur universal memakai footprint hasil kalinya
    // sebagai luas, bukan lagi hanya bidang tanah/denah. Pemanggil yang
    // peduli lahan membuang frasa lahan lebih dulu (stripLandPhrases),
    // jadi dimensi di sini memang dimensi subjek permintaan.
    n.buildingWidth = n.landLength;
    n.buildingLength = n.landWidth;
    if (n.buildingWidth > 0 && n.buildingLength > 0) {
      n.footprintM2 = Math.round(n.buildingWidth * n.buildingLength * 100) / 100;
      n.footprintFromDims = true;
    }
  } else {
    // Bentuk "panjang 20 m lebar 10 m" / "lebar 8 panjang 22" tanpa 'x'
    // (perbaikan ekstraksi 2026-11-08): pasangan panjang/lebar eksplisit
    // adalah dimensi bangunan yang sama sahnya dengan bentuk "A x B".
    // WD-3.7-01: satuan cm/mm pada salah satu sisi menolak pasangan ini
    // ("panjang 15 cm lebar 20 cm" adalah penampang, bukan tapak).
    const pj = t.match(/panjang\s*(?:=|sekitar)?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|meter|m)?\b/);
    const lb = t.match(/lebar\s*(?:=|sekitar)?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|meter|m)?\b/);
    if (pj && lb && pj[2] !== 'cm' && pj[2] !== 'mm' && lb[2] !== 'cm' && lb[2] !== 'mm') {
      const p = parseFloat(pj[1].replace(',', '.'));
      const l = parseFloat(lb[1].replace(',', '.'));
      if (p > 0 && l > 0) {
        n.landLength = p;
        n.landWidth = l;
        n.buildingLength = p;
        n.buildingWidth = l;
        n.footprintM2 = Math.round(p * l * 100) / 100;
        n.footprintFromDims = true;
      }
    }
  }

  /* Panjang pekerjaan linear (jalan/drainase/jembatan): "1 km" adalah
   * PANJANG, bukan "1 kamar mandi" — rentang teks kilometer dibuang dari
   * salinan yang dipakai regex kamar mandi di bawah. */
  let tForBathrooms = t;
  if (isLinearKind(n.kind)) {
    const len = parseLinearLength(text, Boolean(dims));
    if (len) {
      n.lengthM = len.value;
      tForBathrooms = `${t.slice(0, len.span[0])} ${t.slice(len.span[1])}`;
    }
  }
  // Panjang pekerjaan linear yang disebut eksplisit per frasa
  // ("sepanjang 50 m", "panjang 40 meter") berlaku untuk SEMUA jenis
  // pekerjaan — bukan hanya kind linear terdaftar: tembok penahan
  // tanah, pagar, dan saluran tanpa kata kunci kind pun punya basis
  // panjang yang sah (audit 2026-11-08: "tembok penahan tanah
  // sepanjang 50 m" sebelumnya kehilangan panjangnya karena kind-nya
  // bukan linear). Bentuk polos tanpa frasa sengaja TIDAK diambil di
  // sini agar tidak menabrak tafsir dimensi bangunan.
  if (n.lengthM == null) {
    const along = t.match(/(?:sepanjang|panjangnya|panjang)\s*(?:=|sekitar)?\s*(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
    if (along) {
      const v = parseFloat(along[1].replace(',', '.'));
      if (v > 0) n.lengthM = v;
    }
  }

  // Luas bangunan: ambil kemunculan TERAKHIR (koreksi pengguna pada
  // gabungan multi-giliran menggantikan angka lama: "luas 100m2 …
  // luas 120m2" → 120). Satuan 'm' tidak wajib bila kata "luas"/"lb"
  // hadir ("lb 180", "luas 120m2", "luas bangunan 100 luas tanah 150"
  // — frasa lahan sudah dibuang pemanggil/stripLandPhrases atau kata
  // "tanah" di sini mencegah tertangkapnya luas lahan karena pola
  // mensyaratkan tepat setelah angka ada 'm' ATAU akhir frasa luas
  // yang tidak diikuti ' tanah').
  // Audit ekstrem F-080/F-082 (2026-11-08): ekstraksi luas bangunan
  // berjalan pada teks yang frasa lahannya SUDAH DIBUANG di sini (di
  // lapisan bersama), bukan mengandalkan pemanggil membuangnya —
  // sebelumnya fallback "(\d+) m2" polos di bawah menangkap angka
  // frasa "luas lahannya 500 m2" sebagai LUAS BANGUNAN karena pola
  // lahan tidak mengenali bentuk posesif "-nya", sehingga ringkasan
  // melaporkan "Luas bangunan: 500 m²" untuk lahan pengguna.
  const tArea = stripLandPhrases(t);
  const areaRe = /(?:luas(?:\s+bangunan)?|lb)\s*(?:=|sekitar|kurang lebih)?\s*(\d+(?:[.,]\d+)?)\s*(m(?:2|²|eter)?)?/g;
  let areaLast: { raw: string; hasUnit: boolean; index: number } | null = null;
  for (const m of tArea.matchAll(areaRe)) {
    const after = tArea.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 7);
    if (/^\s*tanah/.test(after)) continue; // "luas … tanah" = luas lahan
    areaLast = { raw: m[1], hasUnit: Boolean(m[2]), index: m.index ?? 0 };
    void areaLast.hasUnit;
  }
  const area2 = tArea.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²|eter persegi|\s*persegi)/);
  if (areaLast) {
    const parsedArea = parseAreaNumber(areaLast.raw);
    // Bentuk tanpa satuan hanya diterima bila kata luas/lb eksplisit
    // (selalu benar di pola ini) — nilai > 0 saja yang dipakai.
    if (parsedArea != null && parsedArea > 0) n.buildingArea = parsedArea;
  } else if (area2) {
    const parsedArea = parseAreaNumber(area2[1]);
    if (parsedArea != null && parsedArea > 0) n.buildingArea = parsedArea;
  }
  // "500 sqm" (campur Inggris) = 500 m² luas bangunan.
  if (n.buildingArea == null) {
    const sqm = tArea.match(/(\d+(?:[.,]\d+)?)\s*sqm\b/);
    if (sqm) {
      const v = parseAreaNumber(sqm[1]);
      if (v != null) n.buildingArea = v;
    }
  }

  const kt = t.match(/(\d+)\s*(?:kamar tidur|kt)\b/);
  if (kt) n.bedrooms = parseInt(kt[1], 10);
  const km = tForBathrooms.match(/(\d+)\s*(?:kamar mandi|km)\b/);
  if (km) n.bathrooms = parseInt(km[1], 10);
  // Urutan TERBALIK label→angka (audit ekstrem 2026-11-08, Kategori F):
  // koreksi percakapan wajar berbunyi "kamar tidur 4", "kamar tidurnya
  // jadi 4", "jumlah kamar mandi 3" — pola digit-di-depan di atas tidak
  // menangkapnya sehingga koreksi pengguna dilaporkan "tidak ada
  // perubahan" dan nilai lama bertahan (retensi konteks gagal pada
  // bentuk kalimat yang paling umum). Gerbang blok ini adalah "pola
  // digit-di-depan pada TEKS INI tidak cocok" (kt/km di atas), BUKAN
  // "kolom hasil gabungan == null": pada jalur lanjutan, objek n adalah
  // salinan base yang kolomnya sudah terisi, jadi gerbang null akan
  // menonaktifkan blok ini selamanya saat penggabungan. "km" singkatan
  // SENGAJA tidak dipakai di arah ini: "km 4" ambigu dengan kilometer.
  // Kata bilangan di arah ini juga diterima ("kamar tidur tiga") lewat
  // WORD_COUNTS yang sama.
  if (!kt) {
    const rev = t.match(/\bkamar\s*tidur(?:nya)?\s*(?:jadi|menjadi|diganti|ubah|=\s*)?\s*(\d+)\b/)
      ?? t.match(/\bkamar\s*tidur(?:nya)?\s*(?:jadi|menjadi)?\s*\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/);
    if (rev) n.bedrooms = /^\d+$/.test(rev[1]) ? parseInt(rev[1], 10) : WORD_COUNTS[rev[1]];
  }
  if (!km) {
    const rev = tForBathrooms.match(/\bkamar\s*mandi(?:nya)?\s*(?:jadi|menjadi|diganti|ubah|=\s*)?\s*(\d+)\b/)
      ?? tForBathrooms.match(/\bkamar\s*mandi(?:nya)?\s*(?:jadi|menjadi)?\s*\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/);
    if (rev) n.bathrooms = /^\d+$/.test(rev[1]) ? parseInt(rev[1], 10) : WORD_COUNTS[rev[1]];
  }
  // Kata bilangan untuk kamar ("tiga kamar tidur, dua kamar mandi") —
  // sebelumnya hanya angka digit yang terbaca (temuan dataset audit
  // 2026-11-06). Hanya mengisi bila pola digit tidak menemukan apa pun.
  if (n.bedrooms == null) {
    const w = t.match(/\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s*(?:kamar tidur|kt)\b/);
    if (w) n.bedrooms = WORD_COUNTS[w[1]];
  }
  if (n.bathrooms == null) {
    const w = tForBathrooms.match(/\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s*(?:kamar mandi|km)\b/);
    if (w) n.bathrooms = WORD_COUNTS[w[1]];
  }
  if (/\bcarport\b/.test(t)) n.carport = !/\b(tanpa|tidak ada|nggak ada|ga ada)\s+carport\b/.test(t);

  // Material atap eksplisit (audit ekstrem F-081/F-083): sebelumnya
  // RabNeeds TIDAK punya kolom atap sama sekali — penyebutan
  // "atapnya baja ringan" hilang dari state kebutuhan dan koreksinya
  // dilaporkan "tidak ada perubahan". Kini material atap yang disebut
  // sesudah kata "atap(atapnya)" dicatat dari daftar material penutup
  // atap yang dikenal (kecocokan terpanjang menang, mis. "genteng
  // tanah liat" di atas "genteng"); frasa atap tanpa material yang
  // dikenal tetap null — tidak ditebak.
  // INTENT-FIRST (2026-11-20): pindai SEMUA penyebutan "atap" — frasa
  // lingkup "pondasi sampai atap." sebelumnya membayangi penyebutan
  // atap yang sebenarnya ("atap baja wf dan campuran baja ringan")
  // karena match() hanya mengambil kemunculan pertama. Segmen pertama
  // yang memuat material yang dikenal yang menang.
  for (const roofSeg of t.matchAll(/\batap(?:nya)?\b([^.,;]{0,40})/g)) {
    let foundRoof: string | null = null;
    for (const mat of ROOF_MATERIALS) {
      if (roofSeg[1].includes(mat) && (foundRoof == null || mat.length > foundRoof.length)) {
        foundRoof = mat;
      }
    }
    if (foundRoof) {
      n.roofMaterial = foundRoof;
      break;
    }
  }

  const loc = t.match(/\bdi\s+([a-z][a-z\s]{2,24}?)(?=\s*(?:,|\.|$|\d+\s*lantai|\d+\s*m\b))/);
  if (loc && !/^(sini|sana|dalam|luar|atas|bawah|rumah|gedung)\b/.test(loc[1].trim())) {
    n.location = loc[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return n;
}

/** Apakah teks ini jawaban refinement (angka/dimensi) dan bukan perintah baru? */
export function looksLikeNeedsAnswer(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(buka|buatkan|bikin|tampilkan|lihat|cari|hitung total|berapa)\b/.test(t) && !/^\s*\d/.test(t)) return false;
  return /(\d+\s*lantai|lantai\s*\d+|\d+\s*[x×]\s*\d+|\d+\s*m2|\d+\s*m²|luas\s*\d+|\d+\s*kamar|\d+\s*kt\b|\d+\s*km\b|carport)/.test(t);
}

/** Kolom penting yang belum terisi — untuk pertanyaan "Lengkapi kebutuhan". */
export function missingNeeds(n: RabNeeds): string[] {
  const missing: string[] = [];
  if (!n.kind) missing.push('jenis pekerjaan');
  if (n.kind === 'rumah' || n.kind === 'gedung' || !n.kind) {
    // Jumlah lantai BUKAN lagi kekurangan inti (perbaikan tipologi
    // 2026-11-08, aturan owner 2026-10-22): tanpa sebutan lantai berlaku
    // asumsi 1 lantai yang DITULIS TERBUKA di ringkasan — menuntut lantai
    // sebagai syarat memblokir draft gudang/bangunan sederhana secara
    // keliru. Yang tetap inti hanyalah basis ukuran.
    if (!n.buildingArea && !(n.landLength && n.landWidth)) missing.push('luas bangunan atau ukuran tanah (mis. 6 × 15 m)');
    // Kamar tidur/mandi BUKAN kebutuhan inti (perbaikan overhaul
    // 2026-11-06): engine parametrik punya default template yang
    // dinyatakan terbuka sebagai asumsi — data opsional tidak boleh
    // memberi kesan draft terblokir.
  }
  return missing;
}

/** Susun prompt desain untuk AI Design Studio dari kebutuhan terkonfirmasi. */
export function buildDesignPrompt(n: RabNeeds, rawText: string): string {
  if (n.kind !== 'rumah' && n.kind !== 'gedung' && n.kind !== 'renovasi') return rawText;
  const parts: string[] = [];
  parts.push(`Buatkan ${n.kindLabel ?? 'rumah tinggal'} ${n.floors ? `${n.floors} lantai` : '1 lantai'}`);
  if (n.landLength && n.landWidth) parts.push(`ukuran ${n.landLength} × ${n.landWidth} m`);
  if (n.buildingArea) parts.push(`luas bangunan ${n.buildingArea} m²`);
  if (n.bedrooms) parts.push(`${n.bedrooms} kamar tidur`);
  if (n.bathrooms) parts.push(`${n.bathrooms} kamar mandi`);
  parts.push('ruang tamu, dapur');
  if (n.carport) parts.push('carport');
  return `${parts.join(', ')}.`;
}

/** Ringkasan kebutuhan dalam format chat (bisa dibaca & dikoreksi pengguna). */
export function summarizeRabNeeds(
  n: RabNeeds,
  missing: string[],
  opts?: { closingLine?: boolean; hints?: boolean }
): string {
  const lines: string[] = ['Baik — ini ringkasan kebutuhan yang saya tangkap dari pesan Anda:'];
  const row = (label: string, value: string | null) =>
    lines.push(`• ${label}: ${value ?? '— (belum disebutkan)'}`);
  row('Jenis pekerjaan', n.kindLabel);
  if (isLinearKind(n.kind)) {
    if (n.subtypeLabel) row('Jenis / subtipe', n.subtypeLabel);
    row('Panjang', n.lengthM ? formatLengthM(n.lengthM) : null);
  }
  if (n.kind === 'rumah' || n.kind === 'gedung' || n.kind === 'renovasi' || !n.kind) {
    row('Jumlah lantai', n.floors ? `${n.floors} lantai` : '1 lantai (asumsi — tidak disebutkan; koreksi bila berbeda)');
    row('Luas bangunan', n.buildingArea ? `${n.buildingArea} m²` : null);
    row('Ukuran tanah', n.landLength && n.landWidth ? `${n.landLength} × ${n.landWidth} m` : null);
    // Luas lahan & atap ikut tampil di ringkasan asumsi (audit ekstrem
    // F-080…F-083): keduanya data pengguna yang harus bertahan lintas
    // giliran dan terlihat untuk dikoreksi, bukan hilang dari state.
    if (n.landAreaM2) row('Luas lahan', `${n.landAreaM2} m²`);
    row('Atap', n.roofMaterial);
    if (n.kind === 'rumah' || !n.kind) {
      row('Kamar tidur', n.bedrooms ? `${n.bedrooms}` : null);
      row('Kamar mandi', n.bathrooms ? `${n.bathrooms}` : null);
      row('Carport', n.carport === null ? null : n.carport ? 'ada' : 'tidak ada');
    }
  }
  if (n.location) row('Lokasi', n.location);
  if (opts?.hints === false) {
    /* Blok petunjuk diserahkan ke pemanggil (alur subtipe/jalur). */
  } else if (missing.length > 0) {
    lines.push(`Masih kurang: ${missing.join('; ')}.`);
    lines.push('Anda bisa melengkapinya lewat tombol "Lengkapi kebutuhan" atau langsung koreksi di chat, misalnya "2 lantai, 6x15, 3 kamar tidur".');
  } else {
    lines.push('Datanya sudah cukup untuk mulai. Anda tetap bisa mengoreksinya di dalam workspace.');
  }
  if (opts?.closingLine !== false) {
    lines.push('Belum ada yang dibuka otomatis — klik "Buka Workspace Desain & RAB" bila ringkasan ini sudah benar.');
  }
  return lines.join('\n');
}
