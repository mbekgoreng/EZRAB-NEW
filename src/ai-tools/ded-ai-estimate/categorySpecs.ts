/**
 * DED ESTIMATE — Multi-Category Foundation (Design Document)
 *
 * Kontrak dan fixture untuk 6 kategori konstruksi.
 * Status: DESAIN — belum diimplementasikan, belum ada tes.
 * Aturan hanya ditulis jika ada dasar teknis jelas.
 */

export interface CategorySpec {
  category: string;
  units: string[];
  mainFormulas: Array<{ item: string; formula: string; unit: string }>;
  dimensionSources: string[];
  duplicationRisks: string[];
  minimumData: string[];
  clarificationTriggers: string[];
  testsNeeded: string[];
}

export const CATEGORY_SPECS: CategorySpec[] = [
  {
    category: 'Rumah 2 Lantai',
    units: ['m3', 'm2', "m'", 'unit', 'bh'],
    mainFormulas: [
      { item: 'Kolom per lantai', formula: 'jumlah × penampang × tinggi_lantai', unit: 'm3' },
      { item: 'Pelat lantai 2', formula: 'panjang × lebar × tebal', unit: 'm3' },
      { item: 'Tangga', formula: 'lebar × panjang_miring × tebal', unit: 'm3' },
      { item: 'Dinding per lantai', formula: '(keliling × tinggi) - bukaan', unit: 'm2' },
    ],
    dimensionSources: ['Denah lantai 1 & 2', 'Potongan', 'Detail tangga'],
    duplicationRisks: [
      'Dinding lantai 1 vs 2 dihitung ganda jika denah tidak dibedakan',
      'Kolom lantai 1 dan 2 overlap di potongan',
    ],
    minimumData: ['Denah tiap lantai', 'Tinggi antar lantai', 'Detail tangga'],
    clarificationTriggers: [
      'Tinggi lantai tidak tercantum',
      'Tangga tidak ada detail',
      'Denah lantai 2 hilang',
    ],
    testsNeeded: [
      'Kolom 2 lantai tidak double-count',
      'Tangga volume benar',
      'Dinding per lantai terpisah',
    ],
  },
  {
    category: 'Gedung Bertingkat',
    units: ['m3', 'm2', "m'", 'unit', 'titik'],
    mainFormulas: [
      { item: 'Kolom per lantai', formula: 'jumlah_kolom × penampang × tinggi_lantai', unit: 'm3' },
      { item: 'Balok per lantai', formula: 'panjang_total × penampang', unit: 'm3' },
      { item: 'Pelat per lantai', formula: 'luas_lantai × tebal', unit: 'm3' },
      { item: 'Core/shear wall', formula: 'panjang × tinggi × tebal', unit: 'm3' },
    ],
    dimensionSources: ['Jadwal kolom', 'Jadwal balok', 'Denah struktur per lantai', 'Potongan'],
    duplicationRisks: [
      'Gambar tipikal dihitung berkali-kali untuk tiap lantai',
      'Jadwal vs denah tidak konsisten',
    ],
    minimumData: ['Jumlah lantai', 'Jadwal elemen struktur', 'Denah tipikal'],
    clarificationTriggers: [
      'Jadwal kolom bertentangan dengan denah',
      'Jumlah lantai tidak jelas',
      'Core wall tidak ada detail',
    ],
    testsNeeded: [
      'Perkalian lantai tipikal benar (tidak over-count)',
      'Rekonsiliasi jadwal vs denah',
      'Shear wall terpisah dari kolom',
    ],
  },
  {
    category: 'Jalan',
    units: ['m3', 'm2', 'm', "m'"],
    mainFormulas: [
      { item: 'Galian', formula: 'panjang × lebar_rata2 × kedalaman_rata2', unit: 'm3' },
      { item: 'Timbunan', formula: 'panjang × lebar × tebal', unit: 'm3' },
      { item: 'Perkerasan', formula: 'panjang × lebar × tebal_lapis', unit: 'm3' },
      { item: 'Aspal', formula: 'panjang × lebar', unit: 'm2' },
    ],
    dimensionSources: ['Profil memanjang', 'Potongan melintang', 'Tabel stationing'],
    duplicationRisks: [
      'Segmen overlapping di stationing',
      'Penampang berubah tidak diakomodasi',
    ],
    minimumData: ['Panjang ruas', 'Lebar jalan', 'Tebal tiap lapis', 'Data stationing'],
    clarificationTriggers: [
      'Penampang berubah tanpa data transisi',
      'Stationing tidak kontinu',
      'Ketebalan lapis tidak tercantum',
    ],
    testsNeeded: [
      'Volume dengan penampang berubah',
      'Stationing kontinu',
      'Lapis perkerasan terpisah',
    ],
  },
  {
    category: 'Drainase & Bangunan Air',
    units: ['m3', 'm2', 'm', "m'"],
    mainFormulas: [
      { item: 'Galian saluran', formula: 'panjang × (lebar_atas + lebar_bawah)/2 × kedalaman', unit: 'm3' },
      { item: 'Pasangan batu', formula: 'panjang × keliling_penampang × tebal', unit: 'm3' },
      { item: 'Beton saluran', formula: 'panjang × luas_penampang_beton', unit: 'm3' },
    ],
    dimensionSources: ['Denah saluran', 'Potongan melintang', 'Profil memanjang'],
    duplicationRisks: [
      'Galian vs struktur dihitung ganda',
      'Saluran primer vs sekunder overlap',
    ],
    minimumData: ['Panjang saluran', 'Dimensi penampang', 'Kedalaman'],
    clarificationTriggers: [
      'Penampang bervariasi tanpa pola jelas',
      'Elevasi tidak konsisten',
      'Gorong-gorong tidak ada detail',
    ],
    testsNeeded: [
      'Penampang trapesium benar',
      'Tidak double-count galian dan pasangan',
      'Gorong-gorong terpisah',
    ],
  },
  {
    category: 'Jembatan',
    units: ['m3', 'm2', 'unit', 'titik', 'kg'],
    mainFormulas: [
      { item: 'Abutment', formula: 'panjang × lebar × tinggi', unit: 'm3' },
      { item: 'Pile', formula: 'jumlah × luas_penampang × kedalaman', unit: 'm3' },
      { item: 'Girder', formula: 'jumlah × panjang × luas_penampang', unit: 'm3' },
      { item: 'Deck', formula: 'panjang × lebar × tebal', unit: 'm3' },
    ],
    dimensionSources: ['Denah jembatan', 'Potongan memanjang/melingtang', 'Detail abutment/pier'],
    duplicationRisks: [
      'Pile cap vs pile overlap',
      'Girder vs deck double-count',
    ],
    minimumData: ['Bentang jembatan', 'Jumlah pile', 'Dimensi girder', 'Detail abutment'],
    clarificationTriggers: [
      'Jumlah pile tidak sesuai gambar',
      'Tipe girder tidak jelas',
      'Detail sambungan hilang',
    ],
    testsNeeded: [
      'Pile tidak overlap dengan pile cap',
      'Girder count sesuai bentang',
      'Abutment kiri/kanan terpisah',
    ],
  },
  {
    category: 'MEP',
    units: ['m', "m'", 'titik', 'unit', 'set'],
    mainFormulas: [
      { item: 'Pipa', formula: 'panjang_jalur', unit: 'm' },
      { item: 'Kabel', formula: 'panjang_jalur', unit: 'm' },
      { item: 'Titik lampu', formula: 'jumlah_titik', unit: 'titik' },
      { item: 'AC/sanitair', formula: 'jumlah_unit', unit: 'unit' },
    ],
    dimensionSources: ['Denah MEP', 'Diagram skematik', 'Schedule peralatan'],
    duplicationRisks: [
      'Denah vs skematik dihitung ganda',
      'Pipa supply vs return overlap',
    ],
    minimumData: ['Denah jalur', 'Jumlah titik', 'Spesifikasi peralatan'],
    clarificationTriggers: [
      'Skematik bertentangan dengan denah',
      'Diameter pipa tidak tercantum',
      'Jumlah titik tidak sesuai schedule',
    ],
    testsNeeded: [
      'Panjang jalur tidak double-count',
      'Titik vs unit dibedakan',
      'Skematik vs denah direkonsiliasi',
    ],
  },
];

/**
 * CATATAN IMPLEMENTASI:
 * - File ini adalah DESAIN, bukan implementasi aktif.
 * - Jangan import file ini di pipeline produksi sampai fixture dan tes tersedia.
 * - Setiap kategori butuh: fixture PDF, expected values, dan tes independen.
 */
