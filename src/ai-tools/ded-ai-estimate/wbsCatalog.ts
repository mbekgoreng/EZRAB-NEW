/**
 * DED ESTIMATE — Katalog WBS Dinamis per Kategori Proyek
 *
 * Prinsip:
 * - Katalog adalah REFERENSI kandidat, bukan daftar wajib.
 * - Item aktual hanya dari DED, input pengguna, atau lingkup terkonfirmasi.
 * - Jangan tambah item biaya otomatis hanya karena ada di katalog.
 * - Satu item = satu kelompok utama (anti duplikasi).
 *
 * Hierarki: Proyek → Kelompok → Subkelompok → Item
 */

export type WbsItemStatus =
  | 'IDENTIFIED'      // Teridentifikasi dari DED
  | 'DERIVED'         // Hasil turunan deterministik
  | 'NEEDS_CONFIRM'   // Perlu konfirmasi pengguna
  | 'OPTIONAL';       // Kandidat opsional dari katalog (tidak masuk total)

export interface WbsNode {
  code: string;           // Kode stabil, mis. "BGN-STR-01"
  name: string;           // Nama kelompok/subkelompok
  level: 'kelompok' | 'subkelompok' | 'item';
  parentCode?: string;
  order: number;
  keywords: string[];     // Untuk klasifikasi otomatis
  projectTypes: string[]; // Kategori proyek yang relevan
}

export interface WbsCatalog {
  projectType: string;
  groups: WbsNode[];
}

/**
 * KATALOG BANGUNAN (Rumah, Gedung)
 */
const BANGUNAN_CATALOG: WbsNode[] = [
  // I. PERSIAPAN
  { code: 'BGN-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan', 'pembersihan', 'pengukuran', 'bowplank'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-01-A', name: 'Pembersihan Lahan', level: 'subkelompok', parentCode: 'BGN-01', order: 1, keywords: ['pembersihan', 'clearing'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-01-B', name: 'Pengukuran & Bowplank', level: 'subkelompok', parentCode: 'BGN-01', order: 2, keywords: ['bowplank', 'pengukuran', 'uitzet'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // II. PEKERJAAN TANAH
  { code: 'BGN-02', name: 'Pekerjaan Tanah', level: 'kelompok', order: 2, keywords: ['tanah', 'galian', 'urugan', 'timbunan'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-02-A', name: 'Galian Tanah', level: 'subkelompok', parentCode: 'BGN-02', order: 1, keywords: ['galian'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-02-B', name: 'Urugan & Pemadatan', level: 'subkelompok', parentCode: 'BGN-02', order: 2, keywords: ['urugan', 'timbunan', 'pemadatan'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // III. PONDASI
  { code: 'BGN-03', name: 'Pekerjaan Pondasi', level: 'kelompok', order: 3, keywords: ['pondasi', 'footing', 'pile'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-03-A', name: 'Pondasi Batu Kali', level: 'subkelompok', parentCode: 'BGN-03', order: 1, keywords: ['batu kali', 'pasangan batu'], projectTypes: ['BANGUNAN'] },
  { code: 'BGN-03-B', name: 'Pondasi Footplat', level: 'subkelompok', parentCode: 'BGN-03', order: 2, keywords: ['footplat', 'telapak'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-03-C', name: 'Pondasi Tiang', level: 'subkelompok', parentCode: 'BGN-03', order: 3, keywords: ['tiang pancang', 'bored pile', 'pile'], projectTypes: ['GEDUNG'] },

  // IV. STRUKTUR
  { code: 'BGN-04', name: 'Pekerjaan Struktur', level: 'kelompok', order: 4, keywords: ['struktur', 'beton bertulang'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-04-A', name: 'Sloof', level: 'subkelompok', parentCode: 'BGN-04', order: 1, keywords: ['sloof'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-04-B', name: 'Kolom', level: 'subkelompok', parentCode: 'BGN-04', order: 2, keywords: ['kolom', 'column'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-04-C', name: 'Balok', level: 'subkelompok', parentCode: 'BGN-04', order: 3, keywords: ['balok', 'beam'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-04-D', name: 'Ringbalk', level: 'subkelompok', parentCode: 'BGN-04', order: 4, keywords: ['ringbalk', 'ring balk'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-04-E', name: 'Pelat Lantai/Dak', level: 'subkelompok', parentCode: 'BGN-04', order: 5, keywords: ['pelat', 'dak', 'slab'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-04-F', name: 'Tangga', level: 'subkelompok', parentCode: 'BGN-04', order: 6, keywords: ['tangga', 'stair'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // V. DINDING
  { code: 'BGN-05', name: 'Pekerjaan Dinding', level: 'kelompok', order: 5, keywords: ['dinding'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-05-A', name: 'Pasangan Dinding', level: 'subkelompok', parentCode: 'BGN-05', order: 1, keywords: ['pasangan', 'bata', 'batako'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-05-B', name: 'Plesteran & Acian', level: 'subkelompok', parentCode: 'BGN-05', order: 2, keywords: ['plester', 'acian', 'aci'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // VI. ATAP
  { code: 'BGN-06', name: 'Pekerjaan Atap', level: 'kelompok', order: 6, keywords: ['atap', 'roof', 'genteng', 'rangka atap'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-06-A', name: 'Rangka Atap', level: 'subkelompok', parentCode: 'BGN-06', order: 1, keywords: ['rangka atap', 'kuda-kuda', 'baja ringan'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-06-B', name: 'Penutup Atap', level: 'subkelompok', parentCode: 'BGN-06', order: 2, keywords: ['genteng', 'penutup atap', 'spandek'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-06-C', name: 'Plafon', level: 'subkelompok', parentCode: 'BGN-06', order: 3, keywords: ['plafon', 'ceiling', 'gypsum'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // VII. LANTAI
  { code: 'BGN-07', name: 'Pekerjaan Lantai', level: 'kelompok', order: 7, keywords: ['lantai', 'floor', 'keramik', 'ubin'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // VIII. KUSEN, PINTU, JENDELA
  { code: 'BGN-08', name: 'Kusen, Pintu & Jendela', level: 'kelompok', order: 8, keywords: ['kusen', 'pintu', 'jendela', 'door', 'window'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-08-A', name: 'Kusen', level: 'subkelompok', parentCode: 'BGN-08', order: 1, keywords: ['kusen'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-08-B', name: 'Pintu', level: 'subkelompok', parentCode: 'BGN-08', order: 2, keywords: ['pintu', 'door'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-08-C', name: 'Jendela & Ventilasi', level: 'subkelompok', parentCode: 'BGN-08', order: 3, keywords: ['jendela', 'ventilasi', 'window'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // IX. FINISHING
  { code: 'BGN-09', name: 'Pekerjaan Finishing', level: 'kelompok', order: 9, keywords: ['finishing', 'cat', 'pengecatan'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-09-A', name: 'Pengecatan', level: 'subkelompok', parentCode: 'BGN-09', order: 1, keywords: ['cat', 'pengecatan', 'paint'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // X. MEP
  { code: 'BGN-10', name: 'Pekerjaan MEP', level: 'kelompok', order: 10, keywords: ['mep', 'listrik', 'plumbing', 'sanitair'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-10-A', name: 'Instalasi Listrik', level: 'subkelompok', parentCode: 'BGN-10', order: 1, keywords: ['listrik', 'elektrikal'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-10-B', name: 'Instalasi Plumbing', level: 'subkelompok', parentCode: 'BGN-10', order: 2, keywords: ['plumbing', 'sanitair', 'air bersih', 'air kotor'], projectTypes: ['BANGUNAN', 'GEDUNG'] },

  // XI. PEKERJAAN LUAR
  { code: 'BGN-11', name: 'Pekerjaan Luar', level: 'kelompok', order: 11, keywords: ['pagar', 'halaman', 'drainase luar', 'carport'], projectTypes: ['BANGUNAN'] },
  { code: 'BGN-11-A', name: 'Pagar', level: 'subkelompok', parentCode: 'BGN-11', order: 1, keywords: ['pagar', 'fence'], projectTypes: ['BANGUNAN'] },
  { code: 'BGN-11-B', name: 'Halaman & Parkir', level: 'subkelompok', parentCode: 'BGN-11', order: 2, keywords: ['halaman', 'parkir', 'paving'], projectTypes: ['BANGUNAN'] },

  // XII. INTERIOR (alignment WBS 2026-10-28: sebelumnya item interior
  // jatuh ke "Lain-lain" karena tidak ada kelompoknya; kode-kode lama
  // di atas tidak diubah — kelompok ini hanya ditambahkan di akhir).
  // Kata kunci memakai frasa spesifik (bukan kata tunggal generik
  // seperti 'dapur'/'partisi') agar item lantai/dinding ruang dapur
  // tidak tercuri dari kelompoknya.
  { code: 'BGN-12', name: 'Pekerjaan Interior', level: 'kelompok', order: 12, keywords: ['interior', 'fit-out', 'fit out'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-12-A', name: 'Lemari & Wardrobe', level: 'subkelompok', parentCode: 'BGN-12', order: 1, keywords: ['lemari tanam', 'lemari pakaian', 'wardrobe'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-12-B', name: 'Kitchen Set & Countertop', level: 'subkelompok', parentCode: 'BGN-12', order: 2, keywords: ['kitchen set', 'countertop', 'kabinet dapur', 'meja dapur'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-12-C', name: 'Partisi & Panel Interior', level: 'subkelompok', parentCode: 'BGN-12', order: 3, keywords: ['partisi interior', 'panel dekoratif', 'panel interior'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
  { code: 'BGN-12-D', name: 'Furnitur & Fixture Interior', level: 'subkelompok', parentCode: 'BGN-12', order: 4, keywords: ['furnitur', 'furniture', 'fixture interior'], projectTypes: ['BANGUNAN', 'GEDUNG'] },
];

/**
 * KATALOG JALAN
 */
const JALAN_CATALOG: WbsNode[] = [
  { code: 'JLN-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan', 'mobilisasi', 'pembersihan', 'pengukuran'], projectTypes: ['JALAN'] },
  { code: 'JLN-02', name: 'Pekerjaan Tanah', level: 'kelompok', order: 2, keywords: ['tanah', 'galian', 'urugan', 'timbunan'], projectTypes: ['JALAN'] },
  { code: 'JLN-02-A', name: 'Galian', level: 'subkelompok', parentCode: 'JLN-02', order: 1, keywords: ['galian'], projectTypes: ['JALAN'] },
  { code: 'JLN-02-B', name: 'Urugan & Timbunan', level: 'subkelompok', parentCode: 'JLN-02', order: 2, keywords: ['urugan', 'timbunan', 'sirtu'], projectTypes: ['JALAN'] },

  { code: 'JLN-03', name: 'Pekerjaan Drainase', level: 'kelompok', order: 3, keywords: ['drainase', 'gorong-gorong', 'saluran'], projectTypes: ['JALAN'] },
  { code: 'JLN-03-A', name: 'Gorong-Gorong', level: 'subkelompok', parentCode: 'JLN-03', order: 1, keywords: ['gorong-gorong', 'buis'], projectTypes: ['JALAN'] },
  { code: 'JLN-03-B', name: 'Saluran Samping', level: 'subkelompok', parentCode: 'JLN-03', order: 2, keywords: ['saluran', 'drainase'], projectTypes: ['JALAN'] },

  { code: 'JLN-04', name: 'Lapis Fondasi', level: 'kelompok', order: 4, keywords: ['fondasi', 'base', 'agregat'], projectTypes: ['JALAN'] },
  { code: 'JLN-04-A', name: 'Lapis Fondasi Agregat', level: 'subkelompok', parentCode: 'JLN-04', order: 1, keywords: ['agregat', 'base course', 'lapis fondasi'], projectTypes: ['JALAN'] },

  { code: 'JLN-05', name: 'Pekerjaan Perkerasan', level: 'kelompok', order: 5, keywords: ['perkerasan', 'pavement'], projectTypes: ['JALAN'] },
  { code: 'JLN-05-A', name: 'Lapis Aus (AC-WC)', level: 'subkelompok', parentCode: 'JLN-05', order: 1, keywords: ['lapis aus', 'ac-wc', 'wearing course'], projectTypes: ['JALAN'] },
  { code: 'JLN-05-B', name: 'Lapis Antara (AC-BC)', level: 'subkelompok', parentCode: 'JLN-05', order: 2, keywords: ['lapis antara', 'ac-bc', 'binder'], projectTypes: ['JALAN'] },
  { code: 'JLN-05-C', name: 'Lapen / Burda', level: 'subkelompok', parentCode: 'JLN-05', order: 3, keywords: ['lapen', 'burda', 'penetrasi'], projectTypes: ['JALAN'] },
  { code: 'JLN-05-D', name: 'Beton Semen', level: 'subkelompok', parentCode: 'JLN-05', order: 4, keywords: ['beton semen', 'rigid', 'pcc'], projectTypes: ['JALAN'] },

  { code: 'JLN-06', name: 'Struktur Pelengkap', level: 'kelompok', order: 6, keywords: ['jembatan', 'struktur', 'dinding penahan'], projectTypes: ['JALAN'] },
  { code: 'JLN-06-A', name: 'Jembatan', level: 'subkelompok', parentCode: 'JLN-06', order: 1, keywords: ['bridge'], projectTypes: ['JALAN'] },
  { code: 'JLN-06-B', name: 'Dinding Penahan', level: 'subkelompok', parentCode: 'JLN-06', order: 2, keywords: ['dinding penahan', 'retaining'], projectTypes: ['JALAN'] },

  { code: 'JLN-07', name: 'Perlengkapan Jalan', level: 'kelompok', order: 7, keywords: ['marka', 'rambu', 'penerangan', 'guardrail'], projectTypes: ['JALAN'] },
  { code: 'JLN-07-A', name: 'Marka & Rambu', level: 'subkelompok', parentCode: 'JLN-07', order: 1, keywords: ['marka', 'rambu'], projectTypes: ['JALAN'] },
  { code: 'JLN-07-B', name: 'Penerangan', level: 'subkelompok', parentCode: 'JLN-07', order: 2, keywords: ['penerangan', 'lampu jalan'], projectTypes: ['JALAN'] },
  // Alignment WBS 2026-10-28: bahu/trotoar/kerb sebelumnya tidak punya
  // subkelompok (frasa 'paving block' sengaja TIDAK dipakai agar item
  // halaman bangunan tidak tercuri dari BGN-11-B).
  { code: 'JLN-07-C', name: 'Bahu, Trotoar & Kerb', level: 'subkelompok', parentCode: 'JLN-07', order: 3, keywords: ['bahu jalan', 'trotoar', 'kerb', 'sidewalk'], projectTypes: ['JALAN'] },

  // VIII. PENGUJIAN & PENYELESAIAN (alignment WBS 2026-10-28)
  { code: 'JLN-08', name: 'Pengujian & Penyelesaian', level: 'kelompok', order: 8, keywords: ['pengujian', 'uji kepadatan', 'core drill'], projectTypes: ['JALAN'] },
];

/**
 * KATALOG DRAINASE / BANGUNAN AIR
 */
const DRAINASE_CATALOG: WbsNode[] = [
  { code: 'DRN-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan', 'pembersihan', 'pengukuran'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-02', name: 'Pekerjaan Tanah', level: 'kelompok', order: 2, keywords: ['galian', 'urugan'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03', name: 'Pekerjaan Struktur', level: 'kelompok', order: 3, keywords: ['struktur', 'beton'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03-A', name: 'Saluran', level: 'subkelompok', parentCode: 'DRN-03', order: 1, keywords: ['saluran', 'drainase'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03-B', name: 'Gorong-Gorong', level: 'subkelompok', parentCode: 'DRN-03', order: 2, keywords: ['gorong-gorong'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03-C', name: 'Bangunan Pelengkap', level: 'subkelompok', parentCode: 'DRN-03', order: 3, keywords: ['inlet', 'outlet', 'bangunan pelengkap'], projectTypes: ['BANGUNAN AIR'] },
  // Alignment WBS 2026-10-28: jaringan pipa air sebelumnya tidak punya
  // subkelompok sehingga jatuh ke "Lain-lain" di proyek BANGUNAN AIR.
  { code: 'DRN-03-D', name: 'Jaringan Pipa & Pelengkap Air', level: 'subkelompok', parentCode: 'DRN-03', order: 4, keywords: ['pipa', 'manhole', 'reservoir', 'jaringan pipa'], projectTypes: ['BANGUNAN AIR'] },
];

/**
 * KATALOG JEMBATAN
 */
const JEMBATAN_CATALOG: WbsNode[] = [
  { code: 'JMB-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan', 'pembersihan', 'pengukuran'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02', name: 'Struktur Bawah', level: 'kelompok', order: 2, keywords: ['abutment', 'pier', 'pondasi'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02-A', name: 'Abutment', level: 'subkelompok', parentCode: 'JMB-02', order: 1, keywords: ['abutment'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02-B', name: 'Pier', level: 'subkelompok', parentCode: 'JMB-02', order: 2, keywords: ['pier', 'pilar'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02-C', name: 'Pondasi', level: 'subkelompok', parentCode: 'JMB-02', order: 3, keywords: ['pondasi', 'pile'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-03', name: 'Struktur Atas', level: 'kelompok', order: 3, keywords: ['girder', 'deck', 'gelagar'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-03-A', name: 'Girder', level: 'subkelompok', parentCode: 'JMB-03', order: 1, keywords: ['girder', 'gelagar'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-03-B', name: 'Deck', level: 'subkelompok', parentCode: 'JMB-03', order: 2, keywords: ['deck', 'lantai jembatan'], projectTypes: ['JEMBATAN'] },
  // Alignment WBS 2026-10-28: oprit & pelengkap jembatan.
  { code: 'JMB-03-C', name: 'Oprit & Pelengkap', level: 'subkelompok', parentCode: 'JMB-03', order: 3, keywords: ['oprit', 'jalan pendekat', 'expansion joint'], projectTypes: ['JEMBATAN'] },
];

/**
 * KATALOG BENDUNGAN / BENDUNG (alignment WBS 2026-10-28 — baru).
 * Mengikuti §4 spesifikasi work-classification.md. Kata kunci memakai
 * frasa domain-spesifik; kata generik tunggal seperti 'beton' sengaja
 * TIDAK dipakai agar item beton bangunan tidak tercuri dari BGN-04
 * lewat fallback lintas katalog (lihat wbsClassifier.ts).
 */
const BENDUNGAN_CATALOG: WbsNode[] = [
  { code: 'BDM-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan', 'mobilisasi', 'benchmark', 'pembersihan', 'pengukuran'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-02', name: 'Pembersihan & Galian', level: 'kelompok', order: 2, keywords: ['pembersihan lahan', 'galian', 'dasar sungai'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-03', name: 'Pengalihan Sungai & Cofferdam', level: 'kelompok', order: 3, keywords: ['cofferdam', 'pengalihan sungai', 'saluran bypass', 'dewatering'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-04', name: 'Timbunan Bendungan', level: 'kelompok', order: 4, keywords: ['timbunan bendungan', 'tubuh bendungan urugan', 'fill bendungan'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-05', name: 'Struktur Beton', level: 'kelompok', order: 5, keywords: ['struktur beton', 'beton bendung'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-05-A', name: 'Tubuh Bendung', level: 'subkelompok', parentCode: 'BDM-05', order: 1, keywords: ['tubuh bendung', 'tubuh bendungan', 'weir', 'bendung'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-05-B', name: 'Apron & Kolam Olak', level: 'subkelompok', parentCode: 'BDM-05', order: 2, keywords: ['apron', 'kolam olak', 'stilling basin'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-06', name: 'Pembesian & Bekisting', level: 'kelompok', order: 6, keywords: ['pembesian', 'bekisting', 'tulangan'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-07', name: 'Cutoff & Kendali Rembesan', level: 'kelompok', order: 7, keywords: ['cutoff', 'kendali rembesan', 'grouting', 'filter bendung'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-08', name: 'Spillway & Pintu Air', level: 'kelompok', order: 8, keywords: ['spillway', 'pelimpah', 'pintu air', 'hoist', 'intake'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-08-A', name: 'Spillway', level: 'subkelompok', parentCode: 'BDM-08', order: 1, keywords: ['spillway', 'pelimpah'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-08-B', name: 'Pintu Air & Hoist', level: 'subkelompok', parentCode: 'BDM-08', order: 2, keywords: ['pintu air', 'hoist'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-09', name: 'Saluran & Bangunan Pelengkap', level: 'kelompok', order: 9, keywords: ['saluran irigasi', 'bangunan pelengkap'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-10', name: 'Bangunan Silang', level: 'kelompok', order: 10, keywords: ['bangunan silang', 'akuaduk', 'sifon'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-11', name: 'Pengaman Tebing', level: 'kelompok', order: 11, keywords: ['riprap', 'gabion', 'proteksi erosi', 'pengaman tebing'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-12', name: 'Jalan Akses & Utilitas', level: 'kelompok', order: 12, keywords: ['jalan akses', 'jalan inspeksi'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-13', name: 'Instrumentasi & Monitoring', level: 'kelompok', order: 13, keywords: ['instrumentasi', 'monitoring', 'piezometer'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-14', name: 'Rehabilitasi & Lingkungan', level: 'kelompok', order: 14, keywords: ['rehabilitasi bendung', 'restorasi', 'sedimen'], projectTypes: ['BENDUNGAN'] },
  { code: 'BDM-15', name: 'Testing & Serah Terima', level: 'kelompok', order: 15, keywords: ['testing hidrolika', 'commissioning bendung', 'serah terima bendung'], projectTypes: ['BENDUNGAN'] },
];

/**
 * KATALOG IRIGASI (alignment WBS 2026-10-28 — baru).
 * Mengikuti §4/§6 spesifikasi work-classification.md (saluran, bangunan
 * bagi/sadap/ukur, bangunan silang). 'Saluran' sebagai subkelompok
 * drainase (DRN-03-A) tetap menang seri atas katalog ini bila
 * projectType-nya BANGUNAN AIR — lihat aturan seri di wbsClassifier.ts.
 */
const IRIGASI_CATALOG: WbsNode[] = [
  { code: 'IRG-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan', 'mobilisasi', 'pembersihan', 'pengukuran'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-02', name: 'Galian Saluran', level: 'kelompok', order: 2, keywords: ['galian saluran', 'galian'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-03', name: 'Saluran & Lining', level: 'kelompok', order: 3, keywords: ['saluran irigasi', 'lining saluran', 'saluran'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-03-A', name: 'Lining Saluran', level: 'subkelompok', parentCode: 'IRG-03', order: 1, keywords: ['lining', 'pasangan saluran'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-04', name: 'Bangunan Bagi & Sadap', level: 'kelompok', order: 4, keywords: ['bangunan bagi', 'sadap', 'bangunan sadap'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-05', name: 'Bangunan Ukur', level: 'kelompok', order: 5, keywords: ['bangunan ukur', 'ukur debit', 'ambang ukur'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-06', name: 'Gorong-gorong Silang & Sifon', level: 'kelompok', order: 6, keywords: ['gorong-gorong silang', 'sifon', 'akuaduk', 'terjunan', 'bangunan terjun'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-06-A', name: 'Sifon & Akuaduk', level: 'subkelompok', parentCode: 'IRG-06', order: 1, keywords: ['sifon', 'akuaduk'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-06-B', name: 'Terjunan', level: 'subkelompok', parentCode: 'IRG-06', order: 2, keywords: ['terjunan', 'bangunan terjun'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-07', name: 'Pengaman Tebing', level: 'kelompok', order: 7, keywords: ['riprap', 'gabion', 'proteksi erosi'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-08', name: 'Jalan Inspeksi & Akses', level: 'kelompok', order: 8, keywords: ['jalan inspeksi', 'jalan akses'], projectTypes: ['IRIGASI'] },
  { code: 'IRG-09', name: 'Pengujian & Serah Terima', level: 'kelompok', order: 9, keywords: ['pengujian irigasi', 'serah terima irigasi'], projectTypes: ['IRIGASI'] },
];

export const WBS_CATALOGS: Record<string, WbsNode[]> = {
  'BANGUNAN': BANGUNAN_CATALOG,
  'GEDUNG': BANGUNAN_CATALOG,
  'JALAN': JALAN_CATALOG,
  'BANGUNAN AIR': DRAINASE_CATALOG,
  'JEMBATAN': JEMBATAN_CATALOG,
  'PAVING': JALAN_CATALOG,
  'BENDUNGAN': BENDUNGAN_CATALOG,
  'IRIGASI': IRIGASI_CATALOG,
};

export function getWbsCatalog(projectType: string): WbsNode[] {
  return WBS_CATALOGS[projectType] || BANGUNAN_CATALOG;
}
