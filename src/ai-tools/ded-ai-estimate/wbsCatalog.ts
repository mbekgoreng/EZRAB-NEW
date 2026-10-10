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
];

/**
 * KATALOG JALAN
 */
const JALAN_CATALOG: WbsNode[] = [
  { code: 'JLN-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan', 'mobilisasi', 'pembersihan'], projectTypes: ['JALAN'] },
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
  { code: 'JLN-06-A', name: 'Jembatan', level: 'subkelompok', parentCode: 'JLN-06', order: 1, keywords: ['jembatan', 'bridge'], projectTypes: ['JALAN'] },
  { code: 'JLN-06-B', name: 'Dinding Penahan', level: 'subkelompok', parentCode: 'JLN-06', order: 2, keywords: ['dinding penahan', 'retaining'], projectTypes: ['JALAN'] },

  { code: 'JLN-07', name: 'Perlengkapan Jalan', level: 'kelompok', order: 7, keywords: ['marka', 'rambu', 'penerangan', 'guardrail'], projectTypes: ['JALAN'] },
  { code: 'JLN-07-A', name: 'Marka & Rambu', level: 'subkelompok', parentCode: 'JLN-07', order: 1, keywords: ['marka', 'rambu'], projectTypes: ['JALAN'] },
  { code: 'JLN-07-B', name: 'Penerangan', level: 'subkelompok', parentCode: 'JLN-07', order: 2, keywords: ['penerangan', 'lampu jalan'], projectTypes: ['JALAN'] },
];

/**
 * KATALOG DRAINASE / BANGUNAN AIR
 */
const DRAINASE_CATALOG: WbsNode[] = [
  { code: 'DRN-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-02', name: 'Pekerjaan Tanah', level: 'kelompok', order: 2, keywords: ['galian', 'urugan'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03', name: 'Pekerjaan Struktur', level: 'kelompok', order: 3, keywords: ['struktur', 'beton'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03-A', name: 'Saluran', level: 'subkelompok', parentCode: 'DRN-03', order: 1, keywords: ['saluran', 'drainase'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03-B', name: 'Gorong-Gorong', level: 'subkelompok', parentCode: 'DRN-03', order: 2, keywords: ['gorong-gorong'], projectTypes: ['BANGUNAN AIR'] },
  { code: 'DRN-03-C', name: 'Bangunan Pelengkap', level: 'subkelompok', parentCode: 'DRN-03', order: 3, keywords: ['inlet', 'outlet', 'bangunan'], projectTypes: ['BANGUNAN AIR'] },
];

/**
 * KATALOG JEMBATAN
 */
const JEMBATAN_CATALOG: WbsNode[] = [
  { code: 'JMB-01', name: 'Pekerjaan Persiapan', level: 'kelompok', order: 1, keywords: ['persiapan'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02', name: 'Struktur Bawah', level: 'kelompok', order: 2, keywords: ['abutment', 'pier', 'pondasi'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02-A', name: 'Abutment', level: 'subkelompok', parentCode: 'JMB-02', order: 1, keywords: ['abutment'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02-B', name: 'Pier', level: 'subkelompok', parentCode: 'JMB-02', order: 2, keywords: ['pier', 'pilar'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-02-C', name: 'Pondasi', level: 'subkelompok', parentCode: 'JMB-02', order: 3, keywords: ['pondasi', 'pile'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-03', name: 'Struktur Atas', level: 'kelompok', order: 3, keywords: ['girder', 'deck', 'gelagar'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-03-A', name: 'Girder', level: 'subkelompok', parentCode: 'JMB-03', order: 1, keywords: ['girder', 'gelagar'], projectTypes: ['JEMBATAN'] },
  { code: 'JMB-03-B', name: 'Deck', level: 'subkelompok', parentCode: 'JMB-03', order: 2, keywords: ['deck', 'lantai jembatan'], projectTypes: ['JEMBATAN'] },
];

export const WBS_CATALOGS: Record<string, WbsNode[]> = {
  'BANGUNAN': BANGUNAN_CATALOG,
  'GEDUNG': BANGUNAN_CATALOG,
  'JALAN': JALAN_CATALOG,
  'BANGUNAN AIR': DRAINASE_CATALOG,
  'JEMBATAN': JEMBATAN_CATALOG,
  'PAVING': JALAN_CATALOG,
};

export function getWbsCatalog(projectType: string): WbsNode[] {
  return WBS_CATALOGS[projectType] || BANGUNAN_CATALOG;
}
