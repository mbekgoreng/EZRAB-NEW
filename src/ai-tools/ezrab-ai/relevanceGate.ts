/**
 * relevanceGate.ts — GERBANG RELEVANSI item/template (Gelombang A,
 * Fase 5, P0; dikalibrasi bertahap Gelombang E). Aturan eksplisit
 * berbasis kata/frasa di titik masuk draft (buildUniversalDraft).
 *
 * STATUS KALIBRASI (Gelombang E, 2026-11-12): aturan dikalibrasi
 * terhadap KOSAKATA KATALOG NYATA — seluruh 180 template katalog
 * digenerate (1.699 item) dan matriks proyek × item dijalankan:
 * untuk setiap keluarga proyek yang terkalibrasi, NOL item template
 * kategorinya sendiri yang tertolak, sementara keluarga kontaminan
 * khasnya (jalan/perkerasan, interior hunian, sistem kolam renang,
 * sistem gedung khusus, direksi keet) tertolak. Kalibrasi ini berbasis
 * data katalog, BUKAN data perilaku pengguna — dinyatakan terbuka.
 * Kelas:
 *  - HIGH     : item sejalan kategori proyek & cakupan yang diminta.
 *  - MEDIUM   : tidak ada konflik kategori yang terdeteksi.
 *  - LOW      : hanya kecocokan kata lemah (kata kategori muncul
 *               sebagai OBJEK/lokasi pekerjaan lain, bukan sebagai
 *               pekerjaan pembangunan kategori itu) — TIDAK PERNAH
 *               diam-diam menjadi item BOQ terkonfirmasi.
 *  - REJECTED : konflik kategori keras (item jalan/paving pada proyek
 *               bangunan gudang, item interior hunian pada proyek
 *               kandang/jalan/kolam, dst.) tanpa permintaan eksplisit
 *               pengguna atas cakupan itu.
 *
 * KEPUTUSAN KALIBRASI YANG DISENGAJA (dari data katalog):
 *  - Frasa "badan jalan" TIDAK dipakai sebagai tanda tangan jalan:
 *    item timbunan/pemadatan "badan jalan" adalah pekerjaan tanah yang
 *    sah lintas kategori (template Jalan Usaha Tani di kategori
 *    pertanian & template Timbunan Badan Jalan di pekerjaan tanah).
 *  - Frasa "rabat beton" BUKAN tanda tangan jalan bila deskripsi
 *    menyebut "lantai kerja" (kalibrasi GATE 5 / 5E, 2026-11-12):
 *    "Rabat Beton Lantai Kerja Tebal 5 cm" adalah lapisan kerja
 *    lantai yang sah pada RAB rumah parametrik (satu-satunya false
 *    positive gerbang atas 200 item 8 RAB rumah — probe Overhaul
 *    Fase 5 ARS-05, direproduksi 5E). Bukti panen katalog 183
 *    template (1.716 item PROFESSIONAL): satu-satunya item "rabat
 *    beton" jalan yang asli — "Jalan Inspeksi Rabat Beton Sempit
 *    Sepanjang Tanggul" (SDA-RIVER-NORMALIZATION, COMPREHENSIVE) —
 *    TIDAK menyebut "lantai kerja", jadi tetap tertolak; pengecualian
 *    ini tidak membuka jalan bagi kontaminan jalan yang sesungguhnya
 *    (diuji 5E-01/5E-02).
 *  - Proyek landscape TIDAK menolak keluarga paving/kanstin/trotoar:
 *    item itu pekerjaan hardscape taman yang sah (template Taman
 *    Kawasan & Hardscape katalog sendiri memuatnya). Yang ditolak
 *    hanya sistem aspal jalan (ROAD_HARD).
 *  - Proyek drainase TIDAK menolak keluarga jalan: drainase tepi &
 *    cross-drain jalan adalah pekerjaan drainase yang sah.
 *  - Proyek jembatan TIDAK menolak keluarga jalan: trotoar pada
 *    lantai kendaraan jembatan adalah item jembatan yang sah.
 *  - "Kolam" polos BUKAN tanda tangan kolam renang: kolam retensi
 *    adalah bangunan air yang sah (SDA). Tanda tangan kolam renang
 *    memakai frasa majemuk (kolam renang, keramik kolam, dst.).
 *  - Proyek demolisi TIDAK diberi penolakan baru: item demolisi
 *    memang menyebut semua kategori yang dibongkar.
 */

/** Kelas item jalan/perkerasan — konflik keras untuk proyek bangunan
 *  & proyek tapak non-jalan. Diperluas Gelombang E dengan sistem
 *  lapis aspal (prime/tack coat, lapis resap/perekat, AC-WC/AC-BC,
 *  agregat kelas, marka) yang menurut panen katalog hanya muncul di
 *  kategori jalan/perkerasan. */
const ROAD_ITEM_RE =
  /\b(paving|paving block|perkerasan|marka|kanstin|trotoar|geobag|aspal|hotmix|rabat beton|bahu jalan|jalan lingkungan|jalan beton|jalan aspal|prime coat|tack coat|lapis resap|lapis perekat|ac-wc|ac-bc|agregat kelas)\b/;

/** Sistem aspal jalan saja (tanpa paving/kanstin/trotoar yang sah
 *  sebagai hardscape taman) — konflik keras untuk proyek landscape. */
const ROAD_HARD_RE =
  /\b(aspal|hotmix|hot mix|marka|prime coat|tack coat|lapis resap|lapis perekat|ac-wc|ac-bc|agregat kelas|perkerasan|rabat beton|bahu jalan|geobag)\b/;

/** Item interior hunian/gedung — konflik keras untuk proyek pekerjaan
 *  luar/tapak. Menurut panen katalog frasa ini hanya muncul di
 *  kategori bangunan & renovasi, tidak pernah di kategori tapak.
 *  "Ubin granit" halte BRT bukan "granit tile" — frasa dibedakan. */
const INTERIOR_ITEM_RE =
  /\b(plafon|kusen|kloset|wastafel|partisi|kitchen set|daun pintu|pintu kayu|shower|bathtub|granit tile)\b/;

/** Item sistem kolam renang — konflik keras untuk proyek non-kolam
 *  (frasa majemuk; "kolam retensi" bangunan air tidak tertangkap). */
const POOL_ITEM_RE =
  /\b(kolam renang|keramik kolam|sirkulasi kolam|dek kolam|struktur kolam|galian kolam)\b|\bwaterproofing\b[^.]{0,48}\bkolam\b|\bpompa (sirkulasi|kolam)\b|\bfilter (pasir|kolam)\b/;

/** Item sistem khusus gedung bertingkat/fasilitas — konflik keras
 *  untuk proyek tapak & renovasi hunian. */
const BUILDING_SYSTEM_ITEM_RE =
  /\b(gas medis|eskalator|lift penumpang|instalasi lift)\b/;

/** Item penunjang kawasan jalan yang pada draft gudang terbukti liar. */
const ROAD_SITE_ITEM_RE = /\b(direksi keet|direksikeet)\b/;

/**
 * Kalibrasi 5E: "rabat beton lantai kerja" = lapisan kerja lantai
 * (item sah rumah/bangunan), bukan perkerasan jalan. Bila deskripsi
 * menyebut "lantai kerja", frasa "rabat beton" dihapus dari teks uji
 * SEBELUM tanda tangan jalan diperiksa — sehingga item lantai kerja
 * lolos sementara item jalan "rabat beton" yang sesungguhnya (tanpa
 * frasa "lantai kerja") tetap tertangkap. Lihat keputusan kalibrasi
 * di kepala berkas.
 */
function scrubLantaiKerjaRabat(d: string): string {
  return d.includes('lantai kerja') ? d.replace(/rabat beton/g, ' ') : d;
}

/** ROAD_ITEM_RE dengan pengecualian "lantai kerja" (kalibrasi 5E). */
function matchesRoadSignature(d: string): boolean {
  return ROAD_ITEM_RE.test(scrubLantaiKerjaRabat(d));
}

/** ROAD_HARD_RE dengan pengecualian "lantai kerja" (kalibrasi 5E). */
function matchesRoadHardSignature(d: string): boolean {
  return ROAD_HARD_RE.test(scrubLantaiKerjaRabat(d));
}

/** Kategori proyek bangunan (konflik dengan item jalan). */
const BUILDING_PROJECT_IDS = new Set([
  'gedung', 'gudang-industri', 'kantor', 'sekolah', 'kesehatan', 'hotel',
  'komersial', 'bangunan-publik', 'apartemen', 'rumah',
]);

/** Keluarga jalan (subtipe jalan adalah protected flow — gerbang ini
 *  hanya menilai relevansi ITEM, tidak menyentuh pemilihan subtipe). */
const ROAD_PROJECT_IDS = new Set([
  'jalan', 'jalan-aspal', 'jalan-beton', 'jalan-lingkungan', 'jalan-tol',
]);

/** Keluarga landscape & tapak hijau (termasuk pagar/gerbang). */
const LANDSCAPE_PROJECT_IDS = new Set([
  'lanskap', 'landscape-umum', 'landscape-komersial', 'landscape-resort',
  'landscape-perumahan', 'taman-kota', 'hardscape', 'pagar-gerbang',
]);

/** Proyek yang menolak keluarga jalan penuh (bangunan ditangani
 *  terpisah; drainase/jembatan/landscape punya keputusan sendiri). */
const REJECT_ROAD_PROJECT_IDS = new Set([
  'kandang', 'kolam', 'irigasi', 'bendung', 'pekerjaan-tanah', 'pondasi',
  'pelabuhan', 'pelindung-pantai', 'renovasi', 'pemeliharaan',
]);

/** Proyek pekerjaan luar/tapak yang menolak item interior hunian. */
const REJECT_INTERIOR_PROJECT_IDS = new Set([
  ...ROAD_PROJECT_IDS,
  'kandang', 'kolam', 'drainase', 'gorong-gorong', 'irigasi', 'bendung',
  'pelabuhan', 'pelindung-pantai', 'pekerjaan-tanah', 'jembatan', 'pondasi',
  ...LANDSCAPE_PROJECT_IDS,
]);

/** Proyek yang menolak item sistem kolam renang (bukan proyek kolam /
 *  landscape — kolam & water feature adalah pekerjaan landscape sah). */
const REJECT_POOL_PROJECT_IDS = new Set([
  ...ROAD_PROJECT_IDS,
  'kandang', 'drainase', 'gorong-gorong', 'irigasi', 'bendung',
  'pelabuhan', 'pelindung-pantai', 'pekerjaan-tanah', 'jembatan', 'pondasi',
  'renovasi', 'pemeliharaan',
]);

/** Proyek yang menolak item sistem khusus gedung. */
const REJECT_SYSTEM_PROJECT_IDS = new Set([
  ...REJECT_POOL_PROJECT_IDS, 'kolam', 'renovasi',
  ...LANDSCAPE_PROJECT_IDS,
]);

/** Proyek tapak yang menolak direksi keet liar (perluasan dari aturan
 *  gudang Gelombang A; frasa ini tidak muncul di satu pun dari 1.699
 *  item katalog, jadi perluasannya bebas konflik dengan item sah). */
const REJECT_KEET_PROJECT_IDS = new Set([
  ...ROAD_PROJECT_IDS,
  'kandang', 'kolam', 'drainase', 'gorong-gorong', 'irigasi', 'bendung',
  'pelabuhan', 'pelindung-pantai', 'pekerjaan-tanah', 'jembatan', 'pondasi',
  ...LANDSCAPE_PROJECT_IDS,
]);

export type RelevanceClass = 'HIGH' | 'MEDIUM' | 'LOW' | 'REJECTED';

export interface RelevanceVerdict {
  level: RelevanceClass;
  reason: string;
}

/**
 * Klasifikasi relevansi SATU item terhadap konteks proyek.
 * `projectId` = id scope/subkategori proyek (mis. 'gedung',
 * 'gudang-industri', 'kandang', 'kolam', 'jalan', 'lanskap');
 * `explicitScopes` = id scope yang pengguna minta secara eksplisit
 * (mis. ['jalan'] bila ia memang meminta jalan).
 */
export function classifyItemRelevance(
  itemDescription: string,
  projectId: string | null,
  explicitScopes: string[] = [],
): RelevanceVerdict {
  const d = ` ${(itemDescription || '').toLowerCase()} `;
  const explicit = new Set(explicitScopes);

  // --- Kecocokan kata LEMAH untuk gudang: kata "gudang" sebagai objek
  // pekerjaan logistik/isi, bukan pekerjaan MEMBANGUN gudang. ---
  if (/\b(muat|bongkar muat|angkut|penyimpanan sementara)\b[^.]{0,30}\bgudang\b/.test(d)
    || /\bgudang (semen|material|bahan|logistik|penyimpanan)\b/.test(d)
    || /\bpembuatan gudang (semen|material|bahan)\b/.test(d)) {
    return {
      level: 'LOW',
      reason: 'Kata "gudang" muncul sebagai objek/lokasi pekerjaan lain (gudang semen/material, muat dari gudang) — bukan item pembangunan gudang; kecocokan kata semata tidak cukup.',
    };
  }

  // --- Konflik kategori keras: item jalan pada proyek bangunan. ---
  const isBuildingProject = projectId != null && BUILDING_PROJECT_IDS.has(projectId);
  if (isBuildingProject && !explicit.has('jalan') && matchesRoadSignature(d)) {
    return {
      level: 'REJECTED',
      reason: `Item jalan/perkerasan pada proyek bangunan (${projectId}) tanpa permintaan eksplisit atas cakupan jalan — konflik kategori.`,
    };
  }
  // Direksi keet: pada draft gudang ia terbukti item liar (keluhan
  // owner S3); untuk bangunan lain ia persiapan yang lazim → MEDIUM.
  if (ROAD_SITE_ITEM_RE.test(d) && projectId === 'gudang-industri' && !explicit.has('jalan')) {
    return {
      level: 'REJECTED',
      reason: 'Direksi keet pada draft gudang tanpa permintaan eksplisit — item penunjang kawasan yang tidak terkait scope gudang baja yang diminta.',
    };
  }

  // --- Kalibrasi Gelombang E: konflik keras per keluarga proyek
  // pekerjaan luar/tapak (aturan umum per keluarga tanda tangan item,
  // bukan per skenario; cakupan eksplisit pengguna selalu menang). ---
  if (projectId != null && REJECT_ROAD_PROJECT_IDS.has(projectId) && !explicit.has('jalan') && matchesRoadSignature(d)) {
    return {
      level: 'REJECTED',
      reason: `Item jalan/perkerasan pada proyek ${projectId} tanpa permintaan eksplisit atas cakupan jalan — konflik kategori.`,
    };
  }
  if (projectId != null && LANDSCAPE_PROJECT_IDS.has(projectId) && !explicit.has('jalan') && matchesRoadHardSignature(d)) {
    return {
      level: 'REJECTED',
      reason: `Item sistem aspal jalan pada proyek landscape (${projectId}) tanpa permintaan eksplisit atas cakupan jalan — konflik kategori (paving/kanstin hardscape taman tidak termasuk yang ditolak).`,
    };
  }
  if (projectId != null && REJECT_INTERIOR_PROJECT_IDS.has(projectId) && !explicit.has('finishing') && !explicit.has('interior') && INTERIOR_ITEM_RE.test(d)) {
    return {
      level: 'REJECTED',
      reason: `Item interior bangunan pada proyek pekerjaan luar/tapak (${projectId}) tanpa permintaan eksplisit atas cakupan interior — konflik kategori.`,
    };
  }
  if (projectId != null && REJECT_POOL_PROJECT_IDS.has(projectId) && !explicit.has('kolam') && !explicit.has('olahraga') && POOL_ITEM_RE.test(d)) {
    return {
      level: 'REJECTED',
      reason: `Item sistem kolam renang pada proyek ${projectId} tanpa permintaan eksplisit atas cakupan kolam — konflik kategori.`,
    };
  }
  if (projectId != null && REJECT_SYSTEM_PROJECT_IDS.has(projectId) && !explicit.has('mep') && BUILDING_SYSTEM_ITEM_RE.test(d)) {
    return {
      level: 'REJECTED',
      reason: `Item sistem khusus gedung (lift/eskalator/gas medis) pada proyek ${projectId} tanpa permintaan eksplisit atas cakupan MEP gedung — konflik kategori.`,
    };
  }
  if (projectId != null && REJECT_KEET_PROJECT_IDS.has(projectId) && !explicit.has('jalan') && ROAD_SITE_ITEM_RE.test(d)) {
    return {
      level: 'REJECTED',
      reason: `Direksi keet pada proyek ${projectId} tanpa permintaan eksplisit — item penunjang kawasan yang tidak terkait cakupan yang diminta.`,
    };
  }

  // --- Item yang memang menyebut kategori proyeknya = HIGH. ---
  if (projectId === 'gudang-industri' && /\b(gudang|warehouse|portal frame|rangka baja|cladding|floor hardener)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti gudang/struktur baja.' };
  }
  if (projectId === 'jembatan' && /\b(jembatan|abutment|gelagar|oprit)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti jembatan.' };
  }
  if (projectId === 'kandang' && /\b(kandang|ternak|peternakan)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti kandang/peternakan.' };
  }
  if (projectId === 'kolam' && /\b(kolam|sirkulasi|water ?feature)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti kolam & sirkulasinya.' };
  }
  if (projectId != null && ROAD_PROJECT_IDS.has(projectId) && (matchesRoadSignature(d) || /\bjalan\b/.test(d))) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti jalan/perkerasan.' };
  }
  if ((projectId === 'drainase' || projectId === 'gorong-gorong') && /\b(drainase|u-ditch|uditch|saluran|gorong|manhole|culvert)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti drainase/saluran.' };
  }
  if ((projectId === 'irigasi' || projectId === 'bendung') && /\b(irigasi|bendung|bendungan|embung|pintu air|tanggul|bangunan air|polder|kolam retensi)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti bangunan air/irigasi.' };
  }
  if (projectId != null && LANDSCAPE_PROJECT_IDS.has(projectId) && /\b(taman|lanskap|landscape|pagar|gerbang|rumput|tanaman|pekarangan|hardscape|softscape)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti landscape/pagar/taman.' };
  }
  if ((projectId === 'pelabuhan' || projectId === 'pelindung-pantai') && /\b(dermaga|pelabuhan|tetrapod|breakwater|seawall|turap|pesisir|revetment)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti pelabuhan/pelindung pantai.' };
  }
  if (projectId === 'pekerjaan-tanah' && /\b(galian|urugan|timbunan|pemadatan|cut and fill|pematangan|pengupasan)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti pekerjaan tanah.' };
  }
  if (projectId === 'pondasi' && /\b(pondasi|bore pile|bored pile|tiang pancang|foot plat|sumuran|mini pile|strauss|cerucuk)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti pondasi/geoteknik.' };
  }
  if ((projectId === 'renovasi' || projectId === 'pemeliharaan') && /\b(renovasi|rehabilitasi|bongkaran|penggantian|strip-out|perkuatan|pemeliharaan)\b/.test(d)) {
    return { level: 'HIGH', reason: 'Item menyebut pekerjaan inti renovasi/pemeliharaan.' };
  }
  if (projectId != null && d.includes(projectId.replace(/-/g, ' '))) {
    return { level: 'HIGH', reason: 'Item menyebut kategori proyek secara langsung.' };
  }
  return { level: 'MEDIUM', reason: 'Tidak ada konflik kategori yang terdeteksi oleh aturan gerbang.' };
}

/**
 * Saring item-item satu part draft: item REJECTED dibuang dan
 * dilaporkan; item LOW dipertahankan HANYA bila bukan part otomatis
 * (pemanggil memutuskan) — di jalur draft otomatis item LOW dibuang
 * juga dari BOQ terkonfirmasi dan dilaporkan sebagai catatan.
 * Mengembalikan item yang lolos + catatan penolakan transparan.
 */
export function filterItemsByRelevance<T extends { description: string }>(
  items: T[],
  projectId: string | null,
  explicitScopes: string[] = [],
): { kept: T[]; notes: string[] } {
  const kept: T[] = [];
  const notes: string[] = [];
  for (const it of items) {
    const v = classifyItemRelevance(it.description, projectId, explicitScopes);
    if (v.level === 'REJECTED' || v.level === 'LOW') {
      notes.push(`Item "${it.description}" dikeluarkan oleh gerbang relevansi (${v.level}: ${v.reason})`);
      continue;
    }
    kept.push(it);
  }
  return { kept, notes };
}
