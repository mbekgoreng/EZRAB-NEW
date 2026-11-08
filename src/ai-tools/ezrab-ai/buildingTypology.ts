/**
 * buildingTypology — lapisan pemahaman konstruksi EZRAB Chat AI / Magic AI.
 *
 * Memisahkan FUNGSI bangunan (gudang, rumah tinggal, ruko, …) dari
 * KOMPLEKSITAS (sederhana / satu lantai / bertingkat / struktur khusus /
 * industri khusus). Akar cacat yang diperbaiki modul ini (audit
 * 2026-11-08): kata "gudang" sebelumnya hanya dikenal sebagai kata kunci
 * grup cakupan universalRab "Gedung & Bangunan Bertingkat" — fungsi
 * diperlakukan sebagai kompleksitas, lalu draft ditolak karena "luas
 * atau jumlah lantai" tidak terbaca. Fungsi TIDAK PERNAH menentukan
 * jumlah lantai: lantai hanya dari penyebutan eksplisit, dan bila tidak
 * disebut berlaku ATURAN OWNER 2026-10-22 — asumsi 1 lantai yang DITULIS
 * TERBUKA sebagai asumsi (bukan penolakan, bukan "bertingkat").
 *
 * Modul ini murni & deterministik (tanpa AI, tanpa kredit): ia adalah
 * fondasi pemahaman yang diuji deterministik. Orkestrasi AI nyata tetap
 * berjalan di atasnya; lapisan ini tidak menggantikannya dengan
 * pencocokan kata kunci semata — ia menormalkan istilah (termasuk salah
 * eja umum & istilah Inggris), mengekstrak representasi terstruktur
 * (IR), dan mengklasifikasi kekurangan informasi secara bertahap.
 */

import {
  extractRabNeeds,
  isNegatedAt,
  parseFloorsMention,
  parseLandAreaM2,
  resolveLandAreaM2,
  stripLandPhrases,
  validatePhysicalDimensions,
  type RabNeeds,
} from './rabNeeds';
import { CONSTRUCTION_KNOWLEDGE } from './constructionKnowledge';

/* ------------------------------------------------------------------ */
/* Fungsi & kompleksitas                                               */
/* ------------------------------------------------------------------ */

export type BuildingFunctionId =
  | 'gudang' | 'rumah-tinggal' | 'ruko' | 'kantor' | 'sekolah'
  | 'rumah-sakit' | 'klinik' | 'toko' | 'pabrik' | 'workshop'
  | 'gedung-olahraga' | 'komersial' | 'industri' | 'pertanian'
  | 'masjid' | 'hotel' | 'kos' | 'villa' | 'apartemen' | 'pasar'
  | 'aula' | 'gedung-umum' | 'bangunan-umum';

export type BuildingComplexity =
  | 'sederhana' | 'satu-lantai' | 'bertingkat' | 'struktur-khusus' | 'industri-khusus';

export interface BuildingFunction {
  id: BuildingFunctionId;
  /** Label tampil Bahasa Indonesia. */
  label: string;
  /** Kategori besar knowledge base (CONSTRUCTION_AI_COVERAGE_MATRIX). */
  kbCategory: 'Residensial' | 'Komersial' | 'Industrial' | 'Institusional' | 'Pertanian';
  /** Istilah persis (kata/frasa) — dicocokkan dengan batas kata. */
  terms: string[];
  /** Bentuk salah eja umum yang dinormalkan ke fungsi ini. */
  typos: string[];
  /** Kompleksitas bawaan HANYA sebagai konteks wajar (bukan kesimpulan lantai). */
  typicalComplexity: BuildingComplexity;
}

export const BUILDING_FUNCTIONS: BuildingFunction[] = [
  { id: 'gudang', label: 'Gudang', kbCategory: 'Industrial', terms: ['gudang', 'warehouse', 'gudang logistik', 'distribution center', 'cold storage', 'gudang pendingin', 'storage building', 'storage facility'], typos: ['gudng', 'gudnag', 'gudangg'], typicalComplexity: 'satu-lantai' },
  { id: 'pabrik', label: 'Pabrik', kbCategory: 'Industrial', terms: ['pabrik', 'factory', 'plant', 'pabrikasi', 'home industry', 'industri rumahan'], typos: ['pabrk'], typicalComplexity: 'industri-khusus' },
  { id: 'workshop', label: 'Workshop / Bengkel', kbCategory: 'Industrial', terms: ['workshop', 'bengkel', 'perbengkelan'], typos: ['bengkl', 'wrkshop', 'bngkel'], typicalComplexity: 'satu-lantai' },
  { id: 'industri', label: 'Bangunan Industri', kbCategory: 'Industrial', terms: ['industri', 'industrial', 'kawasan industri'], typos: [], typicalComplexity: 'industri-khusus' },
  { id: 'rumah-tinggal', label: 'Rumah Tinggal', kbCategory: 'Residensial', terms: ['rumah tinggal', 'rumah', 'hunian', 'rumah tapak', 'residensial', 'residential', 'house', 'home'], typos: ['rumh', 'rmh'], typicalComplexity: 'satu-lantai' },
  { id: 'kos', label: 'Kos / Kontrakan', kbCategory: 'Residensial', terms: ['kos', 'kost', 'kosan', 'kontrakan', 'indekos', 'boarding house'], typos: [], typicalComplexity: 'bertingkat' },
  { id: 'villa', label: 'Villa', kbCategory: 'Residensial', terms: ['villa'], typos: [], typicalComplexity: 'satu-lantai' },
  { id: 'apartemen', label: 'Apartemen', kbCategory: 'Residensial', terms: ['apartemen', 'apartment', 'kondominium', 'rusun', 'rumah susun'], typos: ['apartmen'], typicalComplexity: 'bertingkat' },
  { id: 'ruko', label: 'Ruko', kbCategory: 'Komersial', terms: ['ruko', 'rukan', 'shophouse'], typos: [], typicalComplexity: 'bertingkat' },
  { id: 'toko', label: 'Toko', kbCategory: 'Komersial', terms: ['toko', 'retail', 'minimarket', 'showroom', 'gerai', 'apotek', 'kios', 'toko kelontong'], typos: [], typicalComplexity: 'satu-lantai' },
  { id: 'kantor', label: 'Kantor', kbCategory: 'Komersial', terms: ['kantor', 'perkantoran', 'office'], typos: ['kntor'], typicalComplexity: 'bertingkat' },
  { id: 'hotel', label: 'Hotel', kbCategory: 'Komersial', terms: ['hotel', 'penginapan', 'homestay', 'guest house'], typos: [], typicalComplexity: 'bertingkat' },
  { id: 'pasar', label: 'Pasar', kbCategory: 'Komersial', terms: ['pasar', 'market hall'], typos: [], typicalComplexity: 'satu-lantai' },
  { id: 'komersial', label: 'Bangunan Komersial', kbCategory: 'Komersial', terms: ['komersial', 'commercial', 'mall', 'pusat perbelanjaan', 'plaza', 'restoran', 'kafe', 'cafe', 'laundry', 'rumah makan', 'warung makan', 'warung', 'kedai'], typos: [], typicalComplexity: 'bertingkat' },
  { id: 'sekolah', label: 'Sekolah', kbCategory: 'Institusional', terms: ['sekolah', 'school', 'madrasah', 'kampus', 'universitas', 'paud', 'smp', 'sma', 'smk', 'sd', 'perpustakaan'], typos: ['skolah'], typicalComplexity: 'bertingkat' },
  { id: 'rumah-sakit', label: 'Rumah Sakit', kbCategory: 'Institusional', terms: ['rumah sakit', 'hospital', 'rs'], typos: ['rmh sakit'], typicalComplexity: 'bertingkat' },
  { id: 'klinik', label: 'Klinik / Puskesmas', kbCategory: 'Institusional', terms: ['klinik', 'puskesmas', 'clinic', 'praktek dokter'], typos: [], typicalComplexity: 'satu-lantai' },
  { id: 'masjid', label: 'Masjid / Rumah Ibadah', kbCategory: 'Institusional', terms: ['masjid', 'musholla', 'mushola', 'gereja', 'rumah ibadah', 'vihara', 'klenteng', 'pura', 'tempat ibadah'], typos: ['msjid'], typicalComplexity: 'struktur-khusus' },
  { id: 'aula', label: 'Aula / Gedung Serbaguna', kbCategory: 'Institusional', terms: ['aula', 'gedung serbaguna', 'balai', 'pendopo'], typos: [], typicalComplexity: 'struktur-khusus' },
  { id: 'gedung-olahraga', label: 'Gedung Olahraga (GOR)', kbCategory: 'Institusional', terms: ['gedung olahraga', 'gor', 'sport hall', 'sport center', 'stadion', 'lapangan olahraga'], typos: [], typicalComplexity: 'struktur-khusus' },
  { id: 'pertanian', label: 'Bangunan Pertanian', kbCategory: 'Pertanian', terms: ['kandang', 'greenhouse', 'rumah kaca', 'gudang hasil', 'lumbung', 'pertanian', 'peternakan', 'kolam ikan', 'kolam budidaya', 'tambak', 'perikanan'], typos: [], typicalComplexity: 'sederhana' },
  { id: 'gedung-umum', label: 'Gedung (umum)', kbCategory: 'Komersial', terms: ['gedung', 'bangunan bertingkat', 'building'], typos: ['gedng'], typicalComplexity: 'bertingkat' },
  { id: 'bangunan-umum', label: 'Bangunan (umum)', kbCategory: 'Komersial', terms: ['bangunan'], typos: [], typicalComplexity: 'sederhana' },
];

const WORD_RE = (term: string) => {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${esc}\\b`);
};

export interface FunctionMatch {
  fn: BuildingFunction;
  /** Istilah persis yang cocok. */
  matchedTerm: string;
  /** true bila kecocokan berasal dari daftar salah eja (keyakinan lebih rendah). */
  viaTypo: boolean;
}

/**
 * Deteksi fungsi bangunan dari teks. Istilah yang lebih panjang menang
 * atas istilah generik ("rumah sakit" atas "rumah"; "gudang hasil"
 * pertanian hanya bila konteks pertanian eksplisit — "gudang" tetap
 * fungsi gudang-industri untuk frasa polos). Mengembalikan null bila
 * tidak ada fungsi yang disebut.
 */
export function detectBuildingFunction(rawText: string): FunctionMatch | null {
  const t = ` ${(rawText || '').toLowerCase().replace(/\s+/g, ' ')} `;
  let best: FunctionMatch | null = null;
  let bestPos = -1;
  const consider = (fn: BuildingFunction, term: string, viaTypo: boolean) => {
    // Negasi SEBELUM istilah (audit ekstrem G-081, KRITIS): pada
    // "bukan gudang tapi rumah", istilah yang dinegasikan TIDAK boleh
    // ikut bertanding — sebelumnya "gudang" menang hanya karena lebih
    // panjang dari "rumah", sehingga koreksi pengguna diabaikan dua
    // arah. Kemunculan yang didahului langsung kata negasi
    // (bukan/jangan/tidak/tak) dilewati; kemunculan sah berikutnya
    // dari istilah yang sama tetap berlaku. (Negasi SESUDAH istilah —
    // "gudang bukan gedung" — ditangani koreksi eksplisit di
    // understandProject dan tidak berubah.)
    const re = new RegExp(WORD_RE(term).source, 'g');
    let m: RegExpExecArray | null = null;
    let valid: RegExpExecArray | null = null;
    while ((m = re.exec(t)) !== null) {
      if (isNegatedAt(t, m.index)) continue;
      valid = m;
      break;
    }
    if (!valid) return;
    m = valid;
    const pos = m.index;
    // Istilah terpanjang menang pada cakupan yang tumpang tindih
    // ("rumah sakit" di atas "rumah"). Pada istilah yang SAMA PANJANG
    // tapi berbeda fungsi ("rumah 6x10, gudang 10x20" — dua proyek
    // disebut dalam satu gabungan teks), kemunculan TERAKHIR yang
    // berlaku: permintaan terbaru adalah proyek aktif, konsisten
    // dengan aturan dimensi-terakhir & lahan-terakhir di IR ini
    // (audit ekstrem 2026-11-08: sebelumnya fungsi pertama menang
    // diam-diam sehingga proyek kedua tak pernah dikenali).
    if (!best || term.length > best.matchedTerm.length || (term.length === best.matchedTerm.length && pos > bestPos)) {
      best = { fn, matchedTerm: term, viaTypo };
      bestPos = pos;
    }
  };
  for (const fn of BUILDING_FUNCTIONS) {
    for (const term of fn.terms) consider(fn, term, false);
    for (const typo of fn.typos) consider(fn, typo, true);
  }
  return best;
}

/**
 * Kompleksitas dari teks. Lantai adalah SATU-SATUNYA penentu
 * "bertingkat": tanpa penyebutan lantai eksplisit kompleksitas TIDAK
 * pernah "bertingkat" — fungsi bangunan tidak menentukannya.
 */
export function detectComplexity(
  rawText: string,
  floors: number | null,
  fn: BuildingFunction | null
): { complexity: BuildingComplexity; floorsExplicit: boolean } {
  const t = (rawText || '').toLowerCase();
  const floorsExplicit = floors != null;
  if (floors != null && floors > 1) return { complexity: 'bertingkat', floorsExplicit };
  if (/\b(bentang lebar|bentang besar|struktur khusus|kubah|space frame|spaceframe)\b/.test(t)) {
    return { complexity: 'struktur-khusus', floorsExplicit };
  }
  if (fn && (fn.id === 'pabrik' || fn.id === 'industri') && /\b(crane|gantry|mesin berat|proses produksi)\b/.test(t)) {
    return { complexity: 'industri-khusus', floorsExplicit };
  }
  if (floors === 1) return { complexity: 'satu-lantai', floorsExplicit };
  return { complexity: 'sederhana', floorsExplicit };
}

/* ------------------------------------------------------------------ */
/* Representasi terstruktur (IR) permintaan                            */
/* ------------------------------------------------------------------ */

export interface FieldConfidence {
  value: number | null;
  /** 'explicit' disebut pengguna · 'derived' hasil hitung deterministik · 'assumption' asumsi terlabel · 'unknown' belum ada. */
  source: 'explicit' | 'derived' | 'assumption' | 'unknown';
  /** Catatan ambiguitas (mis. urutan panjang/lebar tidak pasti). */
  ambiguity?: string;
}

export interface ProjectUnderstanding {
  /** Fungsi bangunan (null = bukan permintaan bangunan / belum dikenal). */
  functionId: BuildingFunctionId | null;
  functionLabel: string | null;
  /** Kategori knowledge base. */
  category: string | null;
  complexity: BuildingComplexity;
  width: FieldConfidence;
  length: FieldConfidence;
  /** Tapak bangunan (m²) — BUKAN total luas lantai, BUKAN luas lahan. */
  footprint: FieldConfidence;
  /** Luas lahan (m²) — selalu terpisah dari footprint. */
  landArea: FieldConfidence;
  /** Luas bangunan eksplisit yang disebut pengguna ("luas bangunan 200 m²"). */
  statedBuildingArea: FieldConfidence;
  floors: FieldConfidence & { explicit: boolean };
  height: FieldConfidence;
  structuralSystem: string | null;
  roofSystem: string | null;
  location: string | null;
  /** Rasio tapak/lahan (%) — hanya bila kedua luas eksplisit & sebanding. */
  coveragePct: number | null;
  /** Peringatan pemahaman (koreksi klasifikasi, tafsir lemah, dsb.). */
  flags: string[];
  /* --- Perluasan IR (finalisasi 2026-11-08, §5) ---------------------- */
  /** Total luas lantai = tapak × lantai EKSPLISIT; null bila lantai tidak disebut (tapak tidak pernah dikali asumsi). */
  totalFloorArea: FieldConfidence;
  /** Disiplin yang terkait fungsi/pekerjaan ini (bisa jamak; dari KB). */
  disciplines: string[];
  /** Keliling lahan dari frasa "keliling lahan A x B" / "pagar keliling lahan A x B" (meter linear). */
  perimeter: FieldConfidence;
  /** Kondisi eksisting yang disebut ("lahan kosong", "bangunan lama dibongkar"). */
  existingConditions: string | null;
  /** Lingkup yang diminta pengguna (mis. "struktur saja", "sampai finishing"). */
  requestedScope: string | null;
  /** Spesifikasi yang SUDAH disebut pengguna (material/sistem, apa adanya). */
  requiredSpecifications: string[];
  /** Informasi yang masih hilang (label tier A dari penilaian kekurangan). */
  missingInformation: string[];
  /** Masalah validasi dimensi fisik dari lapisan validasi bersama (rabNeeds). */
  dimensionProblems: string[];
  /** Provenance per field: sumber nilai (explicit/derived/assumption/unknown) — ringkasan dari FieldConfidence tiap field. */
  provenance: Record<string, FieldConfidence['source']>;
}

const NUMRE = '(\\d+(?:[.,]\\d+)?)';

/**
 * Angka dari kata bilangan Indonesia ("sepuluh", "dua puluh",
 * "seratus lima puluh"). Ketat: mengembalikan null bila ada token
 * yang tidak dikenal — parser dimensi tidak menebak kata yang bukan
 * bilangan. Mendukung satuan, belasan, puluhan (+satuan), ratusan
 * (seratus / X ratus + sisa).
 */
export function indonesianWordNumber(raw: string): number | null {
  const UNIT: Record<string, number> = {
    satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5,
    enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
  };
  const toks = (raw || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (toks.length === 0) return null;
  let i = 0;
  let total = 0;
  let consumed = false;
  if (toks[i] === 'seratus') { total += 100; i++; consumed = true; }
  else if (UNIT[toks[i]] != null && toks[i + 1] === 'ratus') { total += UNIT[toks[i]] * 100; i += 2; consumed = true; }
  if (toks[i] === 'sepuluh') { total += 10; i++; consumed = true; }
  else if (toks[i] === 'sebelas') { total += 11; i++; consumed = true; }
  else if (UNIT[toks[i]] != null && toks[i + 1] === 'belas') { total += 10 + UNIT[toks[i]]; i += 2; consumed = true; }
  else if (UNIT[toks[i]] != null && toks[i + 1] === 'puluh') {
    total += UNIT[toks[i]] * 10; i += 2; consumed = true;
    if (UNIT[toks[i]] != null) { total += UNIT[toks[i]]; i++; }
  } else if (UNIT[toks[i]] != null) { total += UNIT[toks[i]]; i++; consumed = true; }
  return consumed && i === toks.length ? total : null;
}

const WORDNUM_SRC =
  '(?:seratus|sebelas|sepuluh|[a-z]+\\s+belas|[a-z]+\\s+puluh(?:\\s+(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan))?|[a-z]+\\s+ratus(?:\\s+[a-z]+(?:\\s+[a-z]+)?)?|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)';

function parseDimsPhrase(t: string): { a: number; b: number; span: [number, number] } | null {
  const m = t.match(new RegExp(`${NUMRE}\\s*[x×]\\s*${NUMRE}`));
  if (m) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    if (a > 0 && b > 0) return { a, b, span: [m.index ?? 0, (m.index ?? 0) + m[0].length] };
  }
  // Bentuk kata: "10 meter kali 20 meter" / "10 kali 20".
  const kw = t.match(new RegExp(`${NUMRE}\\s*(?:meter|m)?\\s*kali\\s*${NUMRE}`));
  if (kw) {
    const a = parseFloat(kw[1].replace(',', '.'));
    const b = parseFloat(kw[2].replace(',', '.'));
    if (a > 0 && b > 0) return { a, b, span: [kw.index ?? 0, (kw.index ?? 0) + kw[0].length] };
  }
  // Kata bilangan penuh (audit ekstrem A-099): "sepuluh kali dua
  // puluh", "sepuluh x dua puluh" — sebelumnya tak terbaca sama
  // sekali sehingga permintaan berdimensi sah jatuh ke needs-spec.
  // Validasi ketat indonesianWordNumber menjaga kata bukan-bilangan.
  for (const sep of ['\\s*(?:meter|m)?\\s*kali\\s*', '\\s*[x×]\\s*']) {
    const wm = t.match(new RegExp(`(${WORDNUM_SRC})${sep}(${WORDNUM_SRC})`));
    if (wm) {
      const a = indonesianWordNumber(wm[1]);
      const b = indonesianWordNumber(wm[2]);
      if (a != null && b != null && a > 0 && b > 0) {
        return { a, b, span: [wm.index ?? 0, (wm.index ?? 0) + wm[0].length] };
      }
    }
  }
  // Rasio sebagai dimensi (audit ekstrem A-100): "gudang 10:20"
  // dimaksudkan pengguna sebagai ukuran 10 × 20. Penjaga ketat agar
  // rasio CAMPURAN tidak ikut tertelan: hanya bila kedua sisi ≥ 2
  // (rasio campuran semen selalu berawal 1) DAN teks tidak memuat
  // konteks campuran/plesteran/pasangan/beton sama sekali.
  if (!/\b(campuran|plesteran|pasangan|adukan|beton|cor|semen)\b/.test(t)) {
    const rt = t.match(/(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)/);
    if (rt) {
      const a = parseFloat(rt[1].replace(',', '.'));
      const b = parseFloat(rt[2].replace(',', '.'));
      if (a >= 2 && b >= 2) return { a, b, span: [rt.index ?? 0, (rt.index ?? 0) + rt[0].length] };
    }
  }
  return null;
}

/**
 * Bangun IR dari teks mentah. Aritmetika dimensi deterministik di sini
 * (bukan LLM): footprint = panjang × lebar; cakupan lahan hanya dari
 * dua luas eksplisit. Lantai tak disebut → 1 dengan sumber 'assumption'
 * (aturan owner 2026-10-22), TIDAK pernah dinaikkan menjadi bertingkat.
 *
 * Multi-giliran: frasa lahan dapat berdiri sendiri sebagai pesan susulan
 * ("luas lahannya 500m2") sedangkan dimensi datang di pesan lain. Karena
 * itu luas lahan dicari di SELURUH riwayat pesan yang digabung pemanggil
 * (pola "lahannya/tanahnya/luas lahan" dapat muncul di mana saja),
 * sementara dimensi bangunan dicari pada teks TANPA frasa lahan per
 * pesan agar "lahan 15x30" tidak dibaca sebagai tapak.
 */
export function understandProject(rawText: string): ProjectUnderstanding {
  const text = (rawText || '').trim();
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const flags: string[] = [];

  const match = detectBuildingFunction(text);
  const fn = match?.fn ?? null;
  if (match?.viaTypo) flags.push(`Istilah "${match.matchedTerm}" ditafsirkan sebagai "${fn!.label}" (kemungkinan salah ketik) — koreksi bila keliru.`);
  // Rumah ibadah non-masjid (audit ekstrem A-095): "gereja" (dan
  // vihara/klenteng/pura) memang satu kelompok fungsi "Masjid / Rumah
  // Ibadah" untuk struktur pekerjaan awal — pengelompokan itu kini
  // DINYATAKAN sebagai flag terbuka, bukan klasifikasi diam-diam yang
  // membuat pengguna gereja membaca bangunannya disebut masjid.
  if (match && match.fn.id === 'masjid' && ['gereja', 'vihara', 'klenteng', 'pura'].includes(match.matchedTerm)) {
    flags.push(`Kata "${match.matchedTerm}" adalah rumah ibadah — untuk struktur pekerjaan awal ia dikelompokkan pada fungsi "Masjid / Rumah Ibadah"; koreksi bila pengelompokan ini keliru.`);
  }
  // Koreksi eksplisit pengguna: "gudang bukan gedung" — fungsi yang
  // disebut SEBELUM "bukan" adalah koreksinya, bukan kata sesudahnya.
  const negation = t.match(/\b(gudang|rumah|ruko|kantor|pabrik|toko|sekolah|klinik|workshop|bengkel|masjid)\s+bukan\s+(gedung|bangunan|kantor|rumah)\b/);
  let functionId = fn?.id ?? null;
  let functionLabel = fn?.label ?? null;
  if (negation) {
    const corrected = detectBuildingFunction(negation[1]);
    if (corrected) {
      functionId = corrected.fn.id;
      functionLabel = corrected.fn.label;
      flags.push(`Klasifikasi dikoreksi pengguna: ${corrected.fn.label} (bukan ${negation[2]}).`);
    }
  }

  const floorsMention = parseFloorsMention(text);
  const { complexity, floorsExplicit } = detectComplexity(text, floorsMention, fn);
  const floors: ProjectUnderstanding['floors'] = floorsMention != null
    ? { value: floorsMention, source: 'explicit', explicit: true }
    : { value: 1, source: 'assumption', explicit: false, ambiguity: 'Jumlah lantai tidak disebutkan — dipakai asumsi 1 lantai (aturan standar EZRAB); sebutkan jumlah lantai bila berbeda.' };

  // Luas lahan: eksplisit saja, tidak pernah diturunkan dari dimensi
  // bangunan. Pencarian memakai SELURUH kemunculan frasa lahan dan
  // mengambil yang TERAKHIR — pada percakapan multi-giliran nilai
  // terbaru pengguna adalah koreksi yang berlaku ("lahannya 1500 bukan
  // 2000"). Bentuk yang dikenali: "luas lahan(nya) 500 m2", "tanahnya
  // 150 meter", "di lahan 400 m2", "lahan seluas 900 m2".
  const landArea: FieldConfidence = (() => {
    // Koreksi lahan ("lahannya 1500 bukan 2000"): angka SETELAH kata
    // "bukan" adalah nilai yang DIBATALKAN, bukan nilai berlaku —
    // buang klausa "bukan <angka>" sebelum mencari kemunculan terakhir.
    const tLand = t.replace(/\bbukan\s*\d+(?:[.,]\d+)?/g, ' ');
    const re = /(?:luas\s*(?:lahan|tanah)(?:nya)?|lahannya|tanahnya|lahan|tanah)\s*(?:seluas\s*|=\s*)?(\d+(?:[.,]\d+)?)\s*(?:m2|m²|meter persegi|meter|m\b)?/g;
    let m: RegExpExecArray | null;
    let last: number | null = null;
    let lastIsBareLandWord = false;
    while ((m = re.exec(tLand)) !== null) {
      // Satuan tidak wajib bila kata lahan/tanah eksplisit ("lahannya
      // 1500 bukan 2000" — konteks lahan sudah pasti), TAPI angka yang
      // merupakan bagian dari dimensi "AxB" di belakang kata lahan
      // generik ("lahan 15x30") adalah dimensi lahan, bukan luas —
      // dimensi itu ditangani resolveLandAreaM2 di bawah; lewati di
      // sini agar tidak terbaca sebagai luas polos. "lahannya/tanahnya"
      // berbentuk posesif tidak pernah mendahului dimensi lahan dalam
      // dataset, jadi pengecualian hanya untuk kata polos.
      const rest = tLand.slice((m.index ?? 0) + m[0].length);
      const bareWord = /^(?:lahan|tanah)\s/.test(m[0]);
      if (bareWord && /^\s*[x×]/.test(rest)) continue;
      const v = parseFloat(m[1].replace(/\./g, (g, off, s) => ((s as string).slice(off).match(/^\.\d{3}(\D|$)/) ? '' : '.')).replace(',', '.'));
      if (Number.isFinite(v) && v > 0) {
        last = v;
        lastIsBareLandWord = /^lahan\s/.test(m[0]) || /^tanah\s/.test(m[0]);
      }
    }
    if (last != null) {
      // "di lahan 400 m2" tanpa kata luas: tetap luas lahan (frasa lahan
      // memang tidak punya tafsir lain), dinyatakan eksplisit.
      void lastIsBareLandWord;
      return { value: Math.round(last * 100) / 100, source: 'explicit' as const };
    }
    const dimsLand = resolveLandAreaM2(text);
    return { value: dimsLand, source: dimsLand != null ? 'derived' as const : 'unknown' as const };
  })();

  // Dimensi bangunan: teks TANPA frasa lahan agar "lahan 8x12" tidak
  // dibaca sebagai tapak bangunan.
  const stripped = stripLandPhrases(text);
  // Koreksi dimensi pada gabungan multi-giliran: frasa koreksi
  // ("ganti jadi 7x12", "ukurannya 15x20") menggantikan dimensi lama;
  // parseDimsPhrase mengambil yang PERTAMA, jadi bila penanda koreksi
  // dimensi ada, ambil pasangan dimensi TERAKHIR di teks bersih.
  // Perpindahan proyek (permintaan bangunan BARU yang lengkap setelah
  // permintaan lain: "rumah 8x12 … gudang 10x20") juga memakai pasangan
  // terakhir: permintaan terbaru adalah proyek aktif. Alternatif di
  // dalam SATU kalimat ("10x20 atau 12x25") BUKAN koreksi — pilihan
  // pertama yang berlaku dan ambiguitasnya ditandai.
  const lastDims = (() => {
    if (/\batau\b/.test(t) && !/\b(ganti|jadi|ukurannya|buatkan|rab)\b/.test(t.replace(/^.*\batau\b/, ''))) return null;
    // Klausa koreksi "bukan <dimensi>" (audit ekstrem 2026-11-08):
    // dimensi yang DIBATALKAN tidak boleh menang sebagai pasangan
    // terakhir — "gudang 10x20, bukan 8x15" berarti 10x20 yang berlaku,
    // dan "bukan 8x15 tapi 10x20" berarti 10x20 juga. Selaraskan dengan
    // validasi bersama (validatePhysicalDimensions membuang klausa
    // "bukan <angka>") & aturan lahan: buang klausa koreksinya dari
    // teks yang dipindai, lalu ambil pasangan terakhir dari sisanya.
    if (!/\b(ganti|jadi|ukurannya|dimensi|buatkan|rab)\b/.test(t)) return null;
    const scanText = ` ${stripped.toLowerCase()} `.replace(/\bbukan\s+-?\d+(?:[.,]\d+)?(?:\s*[x×]\s*-?\d+(?:[.,]\d+)?)?/g, ' ');
    const re = new RegExp(`${NUMRE}\\s*[x×]\\s*${NUMRE}`, 'g');
    let m: RegExpExecArray | null;
    let found: { a: number; b: number } | null = null;
    while ((m = re.exec(scanText)) !== null) {
      const a = parseFloat(m[1].replace(',', '.'));
      const b = parseFloat(m[2].replace(',', '.'));
      if (a > 0 && b > 0) found = { a, b };
    }
    return found;
  })();
  const dims = lastDims ?? parseDimsPhrase(` ${stripped.toLowerCase()} `);
  let length: FieldConfidence = { value: null, source: 'unknown' };
  let width: FieldConfidence = { value: null, source: 'unknown' };
  const panjangM = stripped.toLowerCase().match(new RegExp(`panjang\\s*(?:=|sekitar)?\\s*${NUMRE}\\s*(?:meter|m)\\b`));
  const lebarM = stripped.toLowerCase().match(new RegExp(`lebar\\s*(?:=|sekitar)?\\s*${NUMRE}\\s*(?:meter|m)?\\b`));
  if (panjangM && lebarM) {
    length = { value: parseFloat(panjangM[1].replace(',', '.')), source: 'explicit' };
    width = { value: parseFloat(lebarM[1].replace(',', '.')), source: 'explicit' };
  } else if (dims) {
    // Konvensi chat EZRAB: angka pertama = lebar, kedua = panjang
    // (konsisten dengan strip "10 × 20 m" pada ringkasan kebutuhan).
    width = { value: dims.a, source: 'explicit' };
    length = { value: dims.b, source: 'explicit', ambiguity: 'Urutan dimensi mengikuti konvensi lebar × panjang; tertukar tidak mengubah luas tapak.' };
  }
  const footprint: FieldConfidence = length.value != null && width.value != null
    ? { value: Math.round(length.value * width.value * 100) / 100, source: 'derived' }
    : { value: null, source: 'unknown' };

  const needs: RabNeeds = extractRabNeeds(stripped);
  // Fallback dari jalur kebutuhan terstruktur: bentuk "lebar 8 panjang
  // 22" / "panjang 10 lebar 7" tanpa satuan tertangkap oleh
  // extractRabNeeds (buildingWidth/buildingLength) bila regex IR di
  // atas yang mensyaratkan satuan gagal — pakai nilai itu agar kedua
  // jalur ekstraksi konsisten.
  if (length.value == null && width.value == null && needs.buildingWidth != null && needs.buildingLength != null) {
    width = { value: needs.buildingWidth, source: 'explicit' };
    length = { value: needs.buildingLength, source: 'explicit' };
  }
  const footprintFromNeeds: FieldConfidence = footprint.value == null && needs.footprintM2 != null
    ? { value: needs.footprintM2, source: 'derived' }
    : footprint;
  const statedBuildingArea: FieldConfidence = needs.buildingArea != null
    ? { value: needs.buildingArea, source: 'explicit' }
    : { value: null, source: 'unknown' };

  // Luas dalam satuan imperial: "500 sqm" sudah meter persegi; "sq ft" dikonversi.
  let footprintFinal = footprintFromNeeds;
  let statedFinal = statedBuildingArea;
  const sqft = t.match(new RegExp(`${NUMRE}\\s*(?:sq\\s*ft|sqft|feet persegi)`));
  if (sqft && statedFinal.value == null && footprintFinal.value == null) {
    const v = Math.round(parseFloat(sqft[1].replace(',', '.')) * 0.092903 * 100) / 100;
    statedFinal = { value: v, source: 'derived', ambiguity: `Dikonversi dari ${sqft[1]} sq ft (1 sq ft = 0,0929 m²).` };
  }

  const heightM = t.match(new RegExp(`(?:tinggi(?:\\s+bebas|\\s+bangunan|\\s+bersih)?|clear\\s*height)\\s*(?:=|sekitar)?\\s*${NUMRE}\\s*(?:meter|m)\\b`));
  const height: FieldConfidence = heightM
    ? { value: parseFloat(heightM[1].replace(',', '.')), source: 'explicit' }
    : { value: null, source: 'unknown' };

  const structuralSystem = /\b(rangka baja|struktur baja|baja wf)\b/.test(t) ? 'rangka baja'
    : /\b(beton bertulang|beton)\b/.test(t) ? 'beton bertulang'
    : /\b(kayu)\b/.test(t) ? 'kayu' : null;
  const roofSystem = /\b(baja ringan)\b/.test(t) ? 'rangka baja ringan'
    : /\b(spandek)\b/.test(t) ? 'penutup spandek'
    : /\b(genteng)\b/.test(t) ? 'genteng'
    : /\b(dak beton|dak)\b/.test(t) ? 'dak beton' : null;

  const coveragePct = footprintFinal.value != null && landArea.value != null && landArea.source === 'explicit' && landArea.value >= footprintFinal.value
    ? Math.round((footprintFinal.value / landArea.value) * 1000) / 10
    : null;
  if (landArea.value != null && footprintFinal.value != null && landArea.value < footprintFinal.value) {
    flags.push('Luas lahan yang disebut lebih kecil dari tapak bangunan — kedua angka dipertahankan apa adanya dan ditandai untuk konfirmasi (tidak saling menimpa).');
  }

  /* --- §5: perluasan IR (finalisasi 2026-11-08) -----------------------
   * Semua nilai di bawah deterministik dari teks/IR yang sudah ada;
   * tidak ada yang ditebak: yang tidak disebut tetap null/kosong. */
  const dimensionProblems = validatePhysicalDimensions(text);
  // Total luas lantai: HANYA dari lantai eksplisit (aturan yang sama
  // dengan tool CalculateBuildingArea — tapak tidak dikali asumsi 1).
  const totalFloorArea: FieldConfidence = footprintFinal.value != null && floors.explicit
    ? { value: Math.round(footprintFinal.value * (floors.value ?? 1) * 100) / 100, source: 'derived' }
    : { value: null, source: 'unknown', ambiguity: 'Lantai tidak disebut eksplisit — total luas lantai tidak dikalikan dari asumsi.' };
  // Keliling lahan: frasa "keliling lahan A x B" / "pagar keliling lahan
  // A x B" — keliling = 2 × (A + B) meter linear (dasar pagar keliling).
  const perimeter: FieldConfidence = (() => {
    const m = t.match(/(?:pagar\s+)?keliling\s+(?:lahan|tanah)\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return { value: null, source: 'unknown' as const };
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    if (a > 0 && b > 0) return { value: Math.round(2 * (a + b) * 100) / 100, source: 'derived' as const };
    return { value: null, source: 'unknown' as const };
  })();
  // Disiplin terkait: dari record KB fungsi (bila fungsi dikenal) —
  // daftarnya bisa jamak dan berasal dari data KB, bukan karangan.
  const disciplines: string[] = (() => {
    if (!functionId) return [];
    const kb = CONSTRUCTION_KNOWLEDGE.find((r) => r.id === functionId);
    return kb ? [...kb.relatedDisciplines] : [];
  })();
  const existingConditions = /\blahan kosong\b/.test(t) ? 'lahan kosong'
    : /\bbangunan lama (akan |mau )?dibongkar\b|\bdibongkar dulu\b/.test(t) ? 'bangunan lama dibongkar'
    : /\bbangunan eksisting\b|\bbangunan sudah ada\b/.test(t) ? 'bangunan eksisting' : null;
  const requestedScope = /\bstruktur saja\b/.test(t) ? 'struktur saja'
    : /\bsampai finishing\b|\btermasuk finishing\b/.test(t) ? 'sampai finishing'
    : /\bpekerjaan tanah saja\b/.test(t) ? 'pekerjaan tanah saja' : null;
  const requiredSpecifications: string[] = [];
  if (structuralSystem) requiredSpecifications.push(`struktur: ${structuralSystem}`);
  if (roofSystem) requiredSpecifications.push(`atap: ${roofSystem}`);
  for (const mat of ['bata ringan', 'bata merah', 'beton bertulang', 'baja ringan', 'spandek', 'genteng', 'keramik', 'epoxy', 'u-ditch', 'box culvert', 'hotmix', 'aspal', 'paving']) {
    if (t.includes(mat) && !requiredSpecifications.some((s) => s.includes(mat))) {
      requiredSpecifications.push(`material: ${mat}`);
    }
  }
  const provenance: Record<string, FieldConfidence['source']> = {
    function: functionId ? 'explicit' : 'unknown',
    width: width.source, length: length.source,
    footprint: footprintFinal.source, landArea: landArea.source,
    statedBuildingArea: statedFinal.source, floors: floors.source,
    height: height.source, totalFloorArea: totalFloorArea.source,
    perimeter: perimeter.source,
  };

  return {
    functionId,
    functionLabel,
    category: fn?.kbCategory ?? null,
    complexity,
    width,
    length,
    footprint: footprintFinal,
    landArea,
    statedBuildingArea: statedFinal,
    floors,
    height,
    structuralSystem,
    roofSystem,
    location: needs.location,
    coveragePct,
    flags,
    totalFloorArea,
    disciplines,
    perimeter,
    existingConditions,
    requestedScope,
    requiredSpecifications,
    missingInformation: [],
    dimensionProblems,
    provenance,
  };
}

/* ------------------------------------------------------------------ */
/* Validasi bertahap kekurangan informasi                              */
/* ------------------------------------------------------------------ */

export type MissingTier = 'A-essential' | 'B-important' | 'C-optional';

export interface MissingInfoItem {
  field: string;
  label: string;
  tier: MissingTier;
  /** true bila ketiadaannya MEMBLOKIR draft awal (hanya tier A inti). */
  blocksDraft: boolean;
}

export interface MissingInfoAssessment {
  items: MissingInfoItem[];
  /** Draft awal boleh dimulai (ada basis ukuran: luas/dimensi/panjang/bentang/anggaran). */
  canStartPreliminaryDraft: boolean;
  /** Asumsi terlabel yang dipakai bila draft dimulai (lantai dsb.). */
  labeledAssumptions: string[];
}

const BUILDING_SPEC_FIELDS: Array<{ field: string; label: string; tier: MissingTier; present: (u: ProjectUnderstanding, raw: string) => boolean }> = [
  { field: 'structuralSystem', label: 'sistem struktur (beton bertulang / rangka baja / lainnya)', tier: 'B-important', present: (u) => u.structuralSystem != null },
  { field: 'foundationType', label: 'jenis pondasi', tier: 'B-important', present: (_u, raw) => /\b(foot\s?plat|bore pile|pancang|sumuran|strauss|pondasi batu|mini pile)\b/i.test(raw) },
  { field: 'height', label: 'tinggi bersih bangunan', tier: 'B-important', present: (u) => u.height.value != null },
  { field: 'roofSystem', label: 'struktur & penutup atap', tier: 'B-important', present: (u) => u.roofSystem != null },
  { field: 'floorSpec', label: 'spesifikasi lantai (beton poles / keramik / epoxy industri)', tier: 'C-optional', present: (_u, raw) => /\b(keramik|epoxy|beton poles|floor hardener|granit)\b/i.test(raw) },
  { field: 'wallMaterial', label: 'material dinding (bata ringan / bata merah / panel)', tier: 'C-optional', present: (_u, raw) => /\b(bata ringan|bata merah|hebel|panel sandwich|cladding)\b/i.test(raw) },
  { field: 'openingsAccess', label: 'pintu & akses loading (rolling door / pintu besi / dock)', tier: 'C-optional', present: (_u, raw) => /\b(rolling door|pintu besi|loading dock|pintu lipat)\b/i.test(raw) },
  { field: 'electrical', label: 'instalasi listrik & daya terpasang', tier: 'C-optional', present: (_u, raw) => /\b(listrik|panel|kva|watt|instalasi)\b/i.test(raw) },
  { field: 'drainageSite', label: 'drainase & pekerjaan tanah/lahan', tier: 'C-optional', present: (_u, raw) => /\b(drainase|saluran|pemadatan|urugan|cut and fill)\b/i.test(raw) },
  { field: 'finishing', label: 'persyaratan finishing', tier: 'C-optional', present: (_u, raw) => /\b(cat|plester|acian|finishing)\b/i.test(raw) },
  { field: 'location', label: 'lokasi proyek (konteks harga wilayah)', tier: 'B-important', present: (u) => u.location != null },
];

/**
 * Nilai kekurangan informasi untuk permintaan BANGUNAN. Satu-satunya
 * blokir tier A adalah tidak adanya basis ukuran sama sekali (luas,
 * dimensi, atau luas disebut) — selebihnya draft awal BOLEH dimulai dan
 * kekurangan menjadi item perlu-konfirmasi, bukan penolakan.
 */
export function assessBuildingMissingInfo(u: ProjectUnderstanding, rawText: string): MissingInfoAssessment {
  const items: MissingInfoItem[] = [];
  const hasMeasure = u.footprint.value != null || u.statedBuildingArea.value != null;
  if (u.dimensionProblems.length > 0) {
    // Dimensi tidak valid adalah blokir tier A tersendiri: draft tidak
    // boleh dibangun dari dimensi yang salah walau luas lain tersedia.
    items.push({ field: 'dimension-validity', label: `dimensi tidak valid — ${u.dimensionProblems[0]}`, tier: 'A-essential', blocksDraft: true });
  }
  if (!hasMeasure) {
    items.push({ field: 'measure', label: 'ukuran atau luas bangunan (mis. "10 x 20 m" atau "luas 200 m²")', tier: 'A-essential', blocksDraft: true });
  }
  for (const f of BUILDING_SPEC_FIELDS) {
    if (!f.present(u, rawText)) items.push({ field: f.field, label: f.label, tier: f.tier, blocksDraft: false });
  }
  const labeledAssumptions: string[] = [];
  if (!u.floors.explicit) labeledAssumptions.push('Jumlah lantai: 1 lantai (asumsi — tidak disebutkan; koreksi bila berbeda).');
  // Konsumen IR (§5): field missingInformation pada IR diisi dari
  // penilaian yang sama — label item tier A yang benar-benar memblokir
  // draft (dimensi tidak valid / basis ukuran hilang). Tanpa blokir,
  // array kosong (kekurangan tier B/C tetap ada di `items`).
  u.missingInformation = items.filter((i) => i.blocksDraft).map((i) => i.label);
  return { items, canStartPreliminaryDraft: hasMeasure && u.dimensionProblems.length === 0, labeledAssumptions };
}

/** Ringkasan pemahaman dalam Bahasa Indonesia yang siap tampil di chat. */
export function summarizeUnderstanding(u: ProjectUnderstanding): string {
  const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const parts: string[] = [];
  if (u.functionLabel) parts.push(`fungsi: ${u.functionLabel}${u.category ? ` (kategori ${u.category})` : ''}`);
  if (u.width.value != null && u.length.value != null) parts.push(`ukuran ${fmt(u.width.value)} × ${fmt(u.length.value)} meter`);
  if (u.footprint.value != null) parts.push(`luas tapak bangunan ${fmt(u.footprint.value)} m²`);
  if (u.statedBuildingArea.value != null && u.statedBuildingArea.value !== u.footprint.value) parts.push(`luas bangunan yang disebut ${fmt(u.statedBuildingArea.value)} m²`);
  if (u.landArea.value != null) parts.push(`luas lahan ${fmt(u.landArea.value)} m² (tercatat terpisah, bukan luas bangunan)`);
  if (u.perimeter.value != null) parts.push(`keliling lahan ${fmt(u.perimeter.value)} m (dari dimensi lahan)`);
  if (u.totalFloorArea.value != null) parts.push(`total luas lantai ${fmt(u.totalFloorArea.value)} m² (tapak × lantai eksplisit)`);
  if (u.coveragePct != null) parts.push(`cakupan tapak terhadap lahan ±${fmt(u.coveragePct)}%`);
  parts.push(u.floors.explicit ? `jumlah lantai ${u.floors.value} (disebut eksplisit)` : 'jumlah lantai: asumsi 1 lantai (terlabel)');
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ */
/* Taksonomi status komponen draft                                     */
/* ------------------------------------------------------------------ */

export type ComponentStatus =
  | 'CALCULABLE'
  | 'REQUIRES_SPECIFICATION'
  | 'REQUIRES_ENGINEERING_REVIEW'
  | 'PRICE_UNRESOLVED'
  | 'NOT_SUPPORTED';

/**
 * Petakan status item yang SUDAH ADA di aplikasi ke taksonomi status
 * draft (satu sistem label, bukan duplikasi): PRICE_UNRESOLVED →
 * PRICE_UNRESOLVED; pemetaan AHSP belum lengkap (NEEDS_MAPPING /
 * UNIT_MISMATCH) → REQUIRES_SPECIFICATION; item berharga & termeta →
 * CALCULABLE. NOT_SUPPORTED / REQUIRES_ENGINEERING_REVIEW dipakai di
 * tingkat komponen hasil orkestrasi (bukan dari item katalog).
 */
export function componentStatusFromItem(it: {
  priceStatus?: string | null;
  unitPrice?: number | null;
  ahspMappingStatus?: string | null;
}): ComponentStatus {
  if (it.priceStatus === 'PRICE_UNRESOLVED' || it.unitPrice == null) return 'PRICE_UNRESOLVED';
  if (it.ahspMappingStatus === 'NEEDS_MAPPING' || it.ahspMappingStatus === 'UNIT_MISMATCH') return 'REQUIRES_SPECIFICATION';
  return 'CALCULABLE';
}
