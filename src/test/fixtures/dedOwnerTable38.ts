/**
 * FIXTURE REGRESI PERMANEN — Tabel hasil DED owner 2026-11-10.
 *
 * 38 baris hasil Estimasi Full AI atas berkas owner
 * `pdf-gambar-rumah-1-lantai_compress.pdf` (rumah 1 lantai), direkonstruksi
 * sebagai item mentah model (bentuk input `convertAiItem`) dari tabel yang
 * ditempel owner di chat 2026-11-10 03:13 WIB.
 *
 * Sensus cacat pada tabel owner (yang harus direproduksi harness pra-perbaikan
 * dan hilang pasca-perbaikan):
 * - 11 item "Harga Blm Tersedia" (harga null): baris 15–19, 24–28.
 * - 6 item "Perlu Input" (kuantitas null): baris 29, 34–38.
 * - Baris 13: volume 3,5714e-6 m³, harga Rp5.600.000, Jumlah Rp20, status Valid
 *   (kuantitas mikro lolos sebagai sah).
 * - Baris 6, 8, 33: volume + harga ADA tetapi Jumlah "—" (subtotal null
 *   karena verdict kuantitas di calculator.ts gugur oleh kata kunci
 *   nama+kategori — lihat LAPORAN-PERBAIKAN.md).
 * - Baris 18: kuantitas 0,0295 m' — salah baca spesifikasi "8 x 150 mm"
 *   pada nama item sebagai kuantitas.
 *
 * Angka qty/harga/status pada baris lain mengikuti tabel owner; baris yang
 * tidak dirinci owner pada ringkasan tabel (9–12, 14, 20–23, 30–32) diisi
 * nilai wajar yang konsisten dengan berkas yang sama (lantai/plafon dari
 * diagnosis 2026-11-08: plafon 29,5 m²; elevasi +3,00/+3,20; atap +5,90).
 */

export interface OwnerRowExpectation {
  no: number;
  /** Status tampilan pada tabel owner. */
  displayStatus: 'Valid' | 'Estimasi AI' | 'Harga Blm Tersedia' | 'Perlu Input';
  /** Subtotal pada tabel owner (null = tampil "—"). */
  displaySubtotal: number | null;
}

export interface OwnerFixtureRow {
  raw: Record<string, unknown>;
  expect: OwnerRowExpectation;
}

const r = (
  no: number,
  raw: Record<string, unknown>,
  displayStatus: OwnerRowExpectation['displayStatus'],
  displaySubtotal: number | null,
): OwnerFixtureRow => ({ raw, expect: { no, displayStatus, displaySubtotal } });

export const OWNER_TABLE_38: OwnerFixtureRow[] = [
  r(1, {
    name: 'Pengukuran dan Bouwplank', category: 'Pekerjaan Persiapan',
    quantity: 24, units: "m'", quantitySource: 'AI_INFERENCE',
    derivation: { formulaType: 'keliling', inputs: [
      { name: 'panjang', value: 800, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 400, unit: 'cm', source: 'DED' },
    ] },
    dimensionUnitAssumption: 'cm',
    dimensions: 'Keliling bangunan 800 x 400 tanpa satuan tertulis',
    estimatedUnitPrice: 85000, unitPriceNote: 'Estimasi AI pekerjaan persiapan',
    sourcePages: [3],
  }, 'Estimasi AI', 2040000),
  r(2, {
    name: 'Galian Tanah Pondasi', category: 'Pekerjaan Tanah & Pondasi',
    quantity: 8.4, units: 'm3', quantitySource: 'DERIVED',
    dimensions: '60 cm x 80 cm x 1750 cm galian pondasi menerus',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 60, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 80, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 1750, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 95000, unitPriceNote: 'Estimasi AI galian tanah',
    sourcePages: [5],
  }, 'Valid', 798000),
  r(3, {
    name: 'Urugan Tanah Kembali', category: 'Pekerjaan Tanah & Pondasi',
    quantity: 2.8, units: 'm3', quantitySource: 'DERIVED',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 100, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 100, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 280, unit: 'cm', source: 'DED' },
    ] },
    dimensionUnitAssumption: 'cm',
    dimensions: 'Urugan kembali 100 x 100 x 280 tanpa satuan tertulis',
    estimatedUnitPrice: 45000, unitPriceNote: 'Estimasi AI urugan',
    sourcePages: [5],
  }, 'Valid', 126000),
  r(4, {
    name: 'Urugan Pasir Bawah Pondasi', category: 'Pekerjaan Tanah & Pondasi',
    quantity: 3.36, units: 'm3', quantitySource: 'DERIVED',
    dimensions: '20 cm x 96 cm x 1750 cm pasir urug bawah pondasi',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 96, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 20, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 1750, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 285000, unitPriceNote: 'Estimasi AI pasir urug',
    sourcePages: [5],
  }, 'Valid', 957600),
  r(5, {
    name: 'Pasangan Batu Kali Pondasi', category: 'Pekerjaan Tanah & Pondasi',
    quantity: 6.72, units: 'm3', quantitySource: 'DERIVED',
    dimensions: '80 cm x 48 cm x 1750 cm pasangan batu kali',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 80, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 48, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 1750, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 1250000, unitPriceNote: 'Estimasi AI batu kali',
    sourcePages: [5],
  }, 'Valid', 8400000),
  r(6, {
    name: 'Pengadaan dan Pemancangan Cerucuk Kayu Ulin 80x80 mm', category: 'Pekerjaan Tanah & Pondasi',
    quantity: 0.08, units: "m'", quantitySource: 'AI_INFERENCE',
    dimensions: "Cerucuk ulin 80 x 80 mm, panjang contoh 8 cm per titik",
    estimatedUnitPrice: 45000, unitPriceNote: 'Estimasi AI cerucuk ulin',
    sourcePages: [5],
  }, 'Estimasi AI', null),
  r(7, {
    name: 'Sloof Beton Bertulang 15/20', category: 'Pekerjaan Beton Bertulang',
    quantity: 1.89, units: 'm3', quantitySource: 'DERIVED',
    dimensions: '15 cm x 20 cm x 6300 cm sloof (label DED: Sloof 15x20)',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 15, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 20, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 6300, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 4850000, unitPriceNote: 'Estimasi AI sloof',
    sourceEvidence: 'Sloof 15x20', sourcePages: [6],
  }, 'Valid', 9166500),
  r(8, {
    name: 'Cor Lantai Kerja', category: 'Pekerjaan Tanah & Pondasi',
    quantity: 3.15, units: 'm3', quantitySource: 'AI_INFERENCE',
    dimensions: '630 cm x 1000 cm x 5 cm lantai kerja',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 630, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 5, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 1000, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 950000, unitPriceNote: 'Estimasi AI lantai kerja',
    sourcePages: [6],
  }, 'Estimasi AI', null),
  r(9, {
    name: 'Kolom Praktis Beton Bertulang 15/15', category: 'Pekerjaan Beton Bertulang',
    quantity: 0.54, units: 'm3', quantitySource: 'DERIVED',
    dimensions: '15 cm x 15 cm x 300 cm x 8 kolom praktis',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 15, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 15, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 300, unit: 'cm', source: 'DED' },
      { name: 'jumlah', value: 8, unit: 'unit', source: 'DED' },
    ] },
    estimatedUnitPrice: 5200000, unitPriceNote: 'Estimasi AI kolom praktis',
    sourcePages: [6],
  }, 'Valid', 2808000),
  r(10, {
    name: 'Ringbalk Beton Bertulang 15/20', category: 'Pekerjaan Beton Bertulang',
    quantity: 1.26, units: 'm3', quantitySource: 'DERIVED',
    dimensions: '15 cm x 20 cm x 4200 cm ringbalk (label DED: Ringbalk 15x20)',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 15, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 20, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 4200, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 4850000, unitPriceNote: 'Estimasi AI ringbalk',
    sourceEvidence: 'Ringbalk 15x20', sourcePages: [6],
  }, 'Valid', 6111000),
  r(11, {
    name: 'Balok Latei Beton Bertulang', category: 'Pekerjaan Beton Bertulang',
    quantity: 0.45, units: 'm3', quantitySource: 'AI_INFERENCE',
    dimensions: '15 cm x 20 cm x 1500 cm balok latei di atas kusen',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 15, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 20, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 1500, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 4700000, unitPriceNote: 'Estimasi AI balok latei',
    sourcePages: [6],
  }, 'Estimasi AI', 2115000),
  r(12, {
    name: 'Pelat Meja Dapur Beton t=80mm', category: 'Pekerjaan Beton Bertulang',
    quantity: 0.32, units: 'm3', quantitySource: 'DERIVED',
    dimensions: '200 cm x 200 cm x 8 cm pelat meja dapur',
    derivation: { formulaType: 'sloof_volume', inputs: [
      { name: 'lebar', value: 200, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 8, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 200, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 4600000, unitPriceNote: 'Estimasi AI pelat meja',
    sourcePages: [7],
  }, 'Valid', 1472000),
  r(13, {
    name: 'Pelat Dak Beton t=100mm', category: 'Pekerjaan Beton Bertulang',
    // Rekonstruksi kanal live-run: pada run owner, kuantitas mikro model
    // (3,5714e-6 m³) BERTAHAN lewat kanal kuantitas tertera eksplisit —
    // tidak ada string dimensi/derivation ter-parse yang menimpanya —
    // sehingga calculator menghitung round(3,5714e-6 × 5.600.000) = Rp20
    // dan status tampil "Valid". Fixture meniru kanal itu persis
    // (DED_EXPLICIT, tanpa dimensions/derivation) agar regresi Rp20
    // tereproduksi pra-penyelesaian dan tertangkap diskriminator
    // IMPLAUSIBLE_FRAGMENT pasca-penyelesaian.
    quantity: 0.0000035714, units: 'm3', quantitySource: 'DED_EXPLICIT',
    estimatedUnitPrice: 5600000, unitPriceNote: 'Estimasi AI pelat dak',
    sourcePages: [7],
  }, 'Valid', 20),
  r(14, {
    name: 'Pasangan Dinding Bata Ringan t=10cm', category: 'Pekerjaan Dinding',
    quantity: 126, units: 'm2', quantitySource: 'AI_INFERENCE',
    dimensions: '4200 cm x 300 cm pasangan dinding',
    derivation: { formulaType: 'luas_dimensi', inputs: [
      { name: 'panjang', value: 4200, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 300, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 285000, unitPriceNote: 'Estimasi AI bata ringan',
    sourcePages: [8],
  }, 'Estimasi AI', 28072500),
  r(15, {
    name: 'Rangka Atap Baja Ringan', category: 'Pekerjaan Atap',
    quantity: 27.2, units: 'm2', quantitySource: 'DERIVED',
    dimensions: '680 cm x 400 cm bidang atap (dibulatkan model 27,16 m2; elevasi atap +5,90)',
    derivation: { formulaType: 'luas_dimensi', inputs: [
      { name: 'panjang', value: 680, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 400, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: null,
    sourcePages: [12],
  }, 'Harga Blm Tersedia', null),
  r(16, {
    name: 'Penutup Atap Spandek', category: 'Pekerjaan Atap',
    quantity: 27.2, units: 'm2', quantitySource: 'DERIVED',
    dimensions: '680 cm x 400 cm bidang atap (dibulatkan model 27,16 m2)',
    derivation: { formulaType: 'luas_dimensi', inputs: [
      { name: 'panjang', value: 680, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 400, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: null,
    sourcePages: [12],
  }, 'Harga Blm Tersedia', null),
  r(17, {
    name: 'Nok Spandek', category: 'Pekerjaan Atap',
    quantity: 7.3, units: "m'", quantitySource: 'DERIVED',
    dimensions: "Panjang bubungan 730 cm dari tampak atap",
    derivation: { formulaType: 'panjang_total', inputs: [
      { name: 'panjang', value: 730, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: null,
    sourcePages: [12],
  }, 'Harga Blm Tersedia', null),
  r(18, {
    name: 'Listplank Kalsium Silikat 8x150mm', category: 'Pekerjaan Atap',
    quantity: 0.0295, units: "m'", quantitySource: 'DERIVED',
    dimensions: 'Listplank 8 x 150 mm pada keliling atap 2400 cm',
    estimatedUnitPrice: null,
    sourcePages: [12],
  }, 'Harga Blm Tersedia', null),
  r(19, {
    name: 'Plafon Gypsum 9mm Rangka Hollow', category: 'Pekerjaan Plafon',
    quantity: 29.5, units: 'm2', quantitySource: 'DERIVED',
    dimensions: '590 cm x 500 cm plafon (label DED: Plafond +3,00 / +3,20)',
    derivation: { formulaType: 'luas_dimensi', inputs: [
      { name: 'panjang', value: 590, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 500, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: null,
    sourceEvidence: 'Plafond +3,00', sourcePages: [10],
  }, 'Harga Blm Tersedia', null),
  r(20, {
    name: 'Lantai Keramik 60x60', category: 'Pekerjaan Lantai',
    quantity: 42, units: 'm2', quantitySource: 'DERIVED',
    dimensions: '700 cm x 600 cm lantai ruang utama',
    derivation: { formulaType: 'luas_dimensi', inputs: [
      { name: 'panjang', value: 700, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 600, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 245000, unitPriceNote: 'Estimasi AI keramik 60x60',
    sourcePages: [9],
  }, 'Valid', 10290000),
  r(21, {
    name: 'Lantai Keramik 30x30 KM/WC', category: 'Pekerjaan Lantai',
    quantity: 6.5, units: 'm2', quantitySource: 'DERIVED',
    dimensions: '250 cm x 260 cm lantai KM/WC',
    derivation: { formulaType: 'luas_dimensi', inputs: [
      { name: 'panjang', value: 250, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 260, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 225000, unitPriceNote: 'Estimasi AI keramik 30x30',
    sourcePages: [9],
  }, 'Valid', 1462500),
  r(22, {
    name: 'Plint Keramik 10x60', category: 'Pekerjaan Lantai',
    quantity: 38, units: "m'", quantitySource: 'AI_INFERENCE',
    dimensions: "Keliling ruang 3800 cm plint keramik",
    derivation: { formulaType: 'panjang_total', inputs: [
      { name: 'panjang', value: 3800, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 45000, unitPriceNote: 'Estimasi AI plint',
    sourcePages: [9],
  }, 'Estimasi AI', 1710000),
  r(23, {
    name: 'Pasangan Keramik Dinding KM 25x50', category: 'Pekerjaan Dinding',
    quantity: 12.6, units: 'm2', quantitySource: 'AI_INFERENCE',
    dimensions: '840 cm x 150 cm keramik dinding KM',
    derivation: { formulaType: 'luas_dimensi', inputs: [
      { name: 'panjang', value: 840, unit: 'cm', source: 'DED' },
      { name: 'lebar', value: 150, unit: 'cm', source: 'DED' },
    ] },
    estimatedUnitPrice: 265000, unitPriceNote: 'Estimasi AI keramik dinding',
    sourcePages: [9],
  }, 'Estimasi AI', 3339000),
  r(24, {
    name: 'Pintu P1 Kusen Aluminium 4in Daun Double Multipleks HPL Kaca', category: 'Pekerjaan Kusen Pintu Jendela',
    quantity: 3, units: 'unit', quantitySource: 'DERIVED',
    specification: 'Jadwal kusen: P1 = 3 Unit',
    sourceEvidence: 'P1 = 3 Unit',
    estimatedUnitPrice: null,
    sourcePages: [11],
  }, 'Harga Blm Tersedia', null),
  r(25, {
    name: 'Pintu P2 Kusen Aluminium Panel Kotak Aluminium', category: 'Pekerjaan Kusen Pintu Jendela',
    quantity: 1, units: 'unit', quantitySource: 'DERIVED',
    specification: 'Jadwal kusen: P2 = 1 Unit',
    sourceEvidence: 'P2 = 1 Unit',
    estimatedUnitPrice: null,
    sourcePages: [11],
  }, 'Harga Blm Tersedia', null),
  r(26, {
    name: 'Jendela J1 Kusen Aluminium Kaca Bening 5mm', category: 'Pekerjaan Kusen Pintu Jendela',
    quantity: 1, units: 'unit', quantitySource: 'DERIVED',
    specification: 'Jadwal kusen: J1 = 1 Unit',
    sourceEvidence: 'J1 = 1 Unit',
    estimatedUnitPrice: null,
    sourceEvidence: 'Kaca 5mm', sourcePages: [11],
  }, 'Harga Blm Tersedia', null),
  r(27, {
    name: 'Jendela J2 Kusen Aluminium Kaca Bening 5mm', category: 'Pekerjaan Kusen Pintu Jendela',
    quantity: 1, units: 'unit', quantitySource: 'EXPLICIT',
    dimensions: 'Jadwal kusen: J2 = 1 Unit',
    estimatedUnitPrice: null,
    sourceEvidence: 'J2 = 1 Unit', sourcePages: [11],
  }, 'Harga Blm Tersedia', null),
  r(28, {
    name: 'Jendela J3 Kusen Aluminium Kaca Bening 5mm', category: 'Pekerjaan Kusen Pintu Jendela',
    quantity: 2, units: 'unit', quantitySource: 'EXPLICIT',
    dimensions: 'Jadwal kusen: J3 = 2 Unit',
    estimatedUnitPrice: null,
    sourceEvidence: 'J3 = 2 Unit', sourcePages: [11],
  }, 'Harga Blm Tersedia', null),
  r(29, {
    name: 'Bovenlicht BV1 Kusen Aluminium Kaca', category: 'Pekerjaan Kusen Pintu Jendela',
    quantity: null, units: 'unit', quantitySource: 'EXPLICIT',
    estimatedUnitPrice: null,
    sourceEvidence: 'Jadwal kusen menyebut tipe BV1 tanpa jumlah terbaca',
    sourcePages: [11],
  }, 'Perlu Input', null),
  r(30, {
    name: 'Kloset Duduk Monoblok dan Aksesoris', category: 'Pekerjaan Sanitasi',
    quantity: 1, units: 'unit', quantitySource: 'DERIVED',
    specification: 'Jadwal sanitair: K1 = 1 Unit',
    sourceEvidence: 'K1 = 1 Unit',
    estimatedUnitPrice: 2850000, unitPriceNote: 'Estimasi AI kloset duduk',
    sourcePages: [13],
  }, 'Valid', 2850000),
  r(31, {
    name: 'Wastafel dan Aksesoris', category: 'Pekerjaan Sanitasi',
    quantity: 1, units: 'unit', quantitySource: 'AI_INFERENCE',
    specification: 'Jadwal sanitair: W1 = 1 Unit',
    sourceEvidence: 'W1 = 1 Unit',
    estimatedUnitPrice: 1250000, unitPriceNote: 'Estimasi AI wastafel',
    sourcePages: [13],
  }, 'Estimasi AI', 1250000),
  r(32, {
    name: 'Shower Set dan Floor Drain', category: 'Pekerjaan Sanitasi',
    quantity: 1, units: 'set', quantitySource: 'AI_INFERENCE',
    specification: 'Jadwal sanitair: S1 = 1 Unit',
    sourceEvidence: 'S1 = 1 Unit',
    estimatedUnitPrice: 875000, unitPriceNote: 'Estimasi AI shower set',
    sourcePages: [13],
  }, 'Estimasi AI', 875000),
  r(33, {
    name: 'Bak Kontrol Drainase Pasangan Bata', category: 'Pekerjaan Sanitasi & Drainase',
    quantity: 2, units: 'unit', quantitySource: 'DERIVED',
    specification: 'Jadwal drainase: B1 = 2 Unit',
    sourceEvidence: 'B1 = 2 Unit',
    estimatedUnitPrice: 450000, unitPriceNote: 'Estimasi AI bak kontrol',
    sourceEvidence: 'Jadwal drainase: Bak Kontrol = 2 Unit',
    sourcePages: [13],
  }, 'Valid', null),
  r(34, {
    name: 'Septic Tank dan Resapan', category: 'Pekerjaan Sanitasi',
    quantity: null, units: 'unit', quantitySource: 'DERIVED',
    estimatedUnitPrice: 4500000, unitPriceNote: 'Estimasi AI septic tank + resapan (paket)',
    sourcePages: [13],
  }, 'Perlu Input', null),
  r(35, {
    name: 'Instalasi Titik Penerangan', category: 'Pekerjaan Elektrikal',
    quantity: null, units: 'titik', quantitySource: 'DERIVED',
    estimatedUnitPrice: null,
    sourcePages: [14],
  }, 'Perlu Input', null),
  r(36, {
    name: 'Instalasi Stop Kontak', category: 'Pekerjaan Elektrikal',
    quantity: null, units: 'titik', quantitySource: 'DERIVED',
    estimatedUnitPrice: null,
    sourcePages: [14],
  }, 'Perlu Input', null),
  r(37, {
    name: 'Instalasi Sakelar', category: 'Pekerjaan Elektrikal',
    quantity: null, units: 'titik', quantitySource: 'DERIVED',
    estimatedUnitPrice: null,
    sourcePages: [14],
  }, 'Perlu Input', null),
  r(38, {
    name: 'PHB Box MCB dan Pembumian', category: 'Pekerjaan Elektrikal',
    quantity: null, units: 'unit', quantitySource: 'DERIVED',
    estimatedUnitPrice: null,
    sourcePages: [14],
  }, 'Perlu Input', null),
];
