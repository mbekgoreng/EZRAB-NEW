/**
 * Lapisan penyelesaian dataset Premium Demo — keputusan owner 2026-11-04:
 * proyek contoh HARUS tampil bersih: 213/213 baris berharga, tanpa
 * peringatan kuning di spreadsheet.
 *
 * Urutan penyelesaian per baris (di generate.ts):
 *  1. Gerbang kanonis (matchDedItemToAhsp) — tidak berubah.
 *  2. CURATED: kandidat AHSP dipilih eksplisit oleh estimator (persis yang
 *     diminta gerbang pada status NEEDS_REVIEW) → kode diklaim di sini.
 *  3. COMPONENT_COMPLETIONS: analisa AHSP yang kurang TEPAT SATU harga
 *     komponen dilengkapi dari harga resmi yang sama (konversi satuan
 *     terdokumentasi / record generik resmi) atau harga pasar wajar —
 *     selalu tercatat di priceSourceExplanation item.
 *  4. ESTIMATES: baris di luar katalog (jasa ls/bulanan, pengadaan khusus)
 *     memakai estimasi contoh berlabel EZRAB_ASSUMPTION + basis tertulis.
 *     Ini DATASET DEMO — bukan harga resmi, bukan untuk dokumen konstruksi.
 */

/** Indeks spec 1-based (urutan SPEC+SPEC2+SPEC3) → klaim kode/unit kurasi. */
export const CURATED: Record<number, { code: string; unit?: string; note: string }> = {
  23: { code: '1.3.1.1', note: 'Urugan kembali galian tanah — padanan persis katalog.' },
  97: { code: '3.10.5.3', note: 'Dinding lambisering papan kayu — padanan panel kayu terdekat di katalog.' },
  119: { code: '3.11.4.9', note: 'Pemasangan Door Stop — padanan persis katalog.' },
  138: { code: '5.3.1.12', note: 'Lampu Eksit LED c/w Battery — lampu darurat terdekat di katalog.' },
  173: { code: '5.4.2.16', unit: 'titik', note: 'Outdoor Smart Wifi CCTV 360 — satuan katalog titik (pemasangan per titik).' },
};

/** Komponen hilang: kunci `${nama}|${satuan}` → harga penyelesaian. */
export interface ComponentCompletion {
  price: number;
  /** true bila harga berasal dari data resmi (konversi/record generik). */
  official: boolean;
  basis: string;
}

export const COMPONENT_COMPLETIONS: Record<string, ComponentCompletion> = {
  'Batu split 2/3|kg': {
    price: 243,
    official: true,
    basis: 'Konversi harga resmi batu split Rp352.300/m3 ÷ berat isi 1.450 kg/m3 = Rp243/kg (satuan analisa kg).',
  },
  'Paku 12 cm|kg': {
    price: 22000,
    official: true,
    basis: 'Harga resmi record generik "Paku" (RES-001358) Rp22.000/kg — harga per kg tidak dibedakan per panjang paku pada basis harga.',
  },
  'Paku campuran 5 cm + 7 cm|kg': {
    price: 22000,
    official: true,
    basis: 'Harga resmi record generik "Paku" (RES-001358) Rp22.000/kg.',
  },
  'Tukang Batu|OJ': {
    price: 150000,
    official: false,
    basis: 'Tarif harian tukang batu kelas OJ/OH pada basis harga acuan 2026 (rentang record tukang Rp140–175rb).',
  },
  'Sewa mobil crane|jam': {
    price: 450000,
    official: false,
    basis: 'Tarif pasar sewa mobile crane ±25 ton per jam (porsi jam terbagi per analisa).',
  },
  'Membran Bakar|m': {
    price: 58000,
    official: false,
    basis: 'Harga pasar material membran bakar 3 mm per m2 (satuan analisa tercatat "m").',
  },
  'Saklar Triple|bh': { price: 85000, official: false, basis: 'Harga pasar saklar triple kelas standar (Broco/Panasonic).' },
  'Kloset duduk/monoblok|unit': { price: 1950000, official: false, basis: 'Harga pasar kloset duduk monoblok kelas standar.' },
  'Flexible hose|unit': { price: 45000, official: false, basis: 'Harga pasar flexible hose sanitair standar.' },
  'Wastafel|unit': { price: 850000, official: false, basis: 'Harga pasar wastafel pedestal kelas standar.' },
  'Bak cuci stainlesteel|unit': { price: 650000, official: false, basis: 'Harga pasar bak cuci stainless 1 lubang.' },
  'Water drain|bh': { price: 75000, official: false, basis: 'Harga pasar floor drain stainless standar.' },
  'Bak fiberglass 70x70x66 cm|unit': { price: 550000, official: false, basis: 'Harga pasar bak air fiberglass 70x70.' },
  'AC Wall Mounted Kap : 9.000 BTUH|unit': { price: 3800000, official: false, basis: 'Harga pasar unit AC split 1 PK kelas standar (unit saja).' },
  'AC Wall Mounted Kap : 7.000 BTUH|unit': { price: 3400000, official: false, basis: 'Harga pasar unit AC split 3/4 PK kelas standar (unit saja).' },
  'AC Wall Mounted Kap : 12.000 BTUH|unit': { price: 4600000, official: false, basis: 'Harga pasar unit AC split 1,5 PK kelas standar (unit saja).' },
  'Indoor Fix Dome IP Camera|unit': { price: 650000, official: false, basis: 'Harga pasar IP dome camera indoor standar.' },
  'Connector|bh': { price: 7500, official: false, basis: 'Harga pasar konektor F/RG6 per buah.' },
  'Antena UHF|unit': { price: 250000, official: false, basis: 'Harga pasar antena TV UHF outdoor.' },
  'Tiang|bh': { price: 350000, official: false, basis: 'Harga pasar tiang antena galvanis per batang.' },
  'Router Broadband|unit': { price: 450000, official: false, basis: 'Harga pasar router broadband kelas rumahan/kantor kecil.' },
  'Wifi Access Point (Wifi 6 Radius 50 M)|unit': { price: 950000, official: false, basis: 'Harga pasar access point WiFi 6 kelas standar.' },
  'Flexible Conduit 20 mm|bh': { price: 25000, official: false, basis: 'Harga pasar flexible conduit 20 mm per batang 3 m.' },
  'Rumput gajah mini|bh': { price: 35000, official: false, basis: 'Harga pasar rumput gajah mini tanam per m2 (satuan analisa tercatat "bh").' },
  'Media Tanam|': { price: 250000, official: false, basis: 'Harga pasar media tanam per m3 — koefisien analisa 0 (garis penyeimbang katalog), kontribusi Rp0.' },
  'Tutup Beton Bertulang|': { price: 450000, official: false, basis: 'Harga pasar tutup beton bertulang pracetak — koefisien analisa 0, kontribusi Rp0.' },
  'Urukan Tanah|m3': { price: 185000, official: false, basis: 'Harga pasar tanah urug terkirim per m3.' },
};

/** Estimasi contoh per indeks spec (baris di luar jangkauan katalog). */
export const ESTIMATES: Record<number, { price: number; basis: string }> = {
  1: { price: 7500000, basis: 'Mobilisasi/demobilisasi alat + personil untuk rumah 2 lantai (lump sum pasar Jakarta).' },
  2: { price: 325000, basis: 'Pagar sementara seng gelombang t=2 m terpasang per m (pasar).' },
  4: { price: 1250000, basis: 'Kantor sementara/gudang semi permanen per m2 (pasar; harga katalog ditolak gerbang kewajaran).' },
  5: { price: 750000, basis: 'Air kerja (tandon + pompa + distribusi) per bulan.' },
  6: { price: 1500000, basis: 'Listrik kerja sementara (sambungan + konsumsi alat) per bulan.' },
  7: { price: 3500000, basis: 'Pengukuran & setting out oleh surveyor (lump sum rumah 2 lantai).' },
  8: { price: 2500000, basis: 'Dokumentasi + administrasi proyek selama pelaksanaan (lump sum).' },
  9: { price: 4500000, basis: 'K3: rambu, APD dasar, P3K, pagar pengaman (lump sum).' },
  10: { price: 3200000, basis: 'Penjagaan lokasi (porsi 1 personil keamanan) per bulan.' },
  11: { price: 3000000, basis: 'Pengelolaan + pembuangan limbah konstruksi berkala (lump sum).' },
  12: { price: 3500000, basis: 'Pengendalian mutu berkala: slump test + inspeksi (lump sum).' },
  16: { price: 95000, basis: 'Drainase sementara keliling lahan per m (galian dangkal + saluran tanah).' },
  17: { price: 85000, basis: 'Proteksi properti tetangga (paranet + seng bekas) per m terpasang.' },
  22: { price: 110000, basis: 'Pembuangan tanah galian keluar lokasi (muat + angkut + buang) per m3.' },
  67: { price: 185000, basis: 'Penutup atap genteng beton terpasang per m2 (pasar; kode katalog ditolak gerbang satuan).' },
  68: { price: 95000, basis: 'Nok/bubungan genteng beton terpasang per m.' },
  71: { price: 78000, basis: 'Pipa turun air hujan PVC 3 inci terpasang per m.' },
  73: { price: 65000, basis: 'Flashing pertemuan atap-dinding (seng/aluminium) per m terpasang.' },
  77: { price: 1500000, basis: 'Sealant sambungan kusen + sanitair seluruh rumah (lump sum).' },
  84: { price: 55000, basis: 'Plint homogenous tile 10x60 terpasang per m (harga katalog di bawah batas wajar gerbang).' },
  85: { price: 52000, basis: 'Plint ubin 10x30 terpasang per m (analisa katalog bersatuan m2 — tidak dipakai lintas satuan).' },
  86: { price: 210000, basis: 'Finishing anak tangga keramik + nosing terpasang per m.' },
  87: { price: 68000, basis: 'Lantai plester semen (screed) per m2 terpasang.' },
  104: { price: 38000, basis: 'List plafon gypsum per m terpasang (harga katalog sedikit di bawah batas wajar gerbang).' },
  105: { price: 42000, basis: 'Pengecatan plafon (1 lapis dasar + 2 lapis penutup) per m2.' },
  106: { price: 185000, basis: 'Panel akses plafon 60x60 termasuk rangka per buah.' },
  118: { price: 450000, basis: 'Handle pintu lever + badan kunci kelas standar per set terpasang.' },
  123: { price: 145000, basis: 'MCB/RCCB pengaman grup terpasang per buah (kelas standar).' },
  137: { price: 2750000, basis: 'Batang arde + kabel BC + bak kontrol + pemasangan skala rumah tinggal per set (analisa katalog 5.1.8.1 berskala gedung — tidak dipakai).' },
  134: { price: 18000, basis: 'Pipa conduit PVC 20 mm terpasang per m (tanpa kabel).' },
  145: { price: 3250000, basis: 'Jet pump rumah tangga + panel + instalasi per unit.' },
  146: { price: 2500000, basis: 'Sambungan PDAM + meteran air (biaya sambung + instalasi) lump sum.' },
  147: { price: 185000, basis: 'Pelampung otomatis (float valve) roof tank per buah terpasang.' },
  149: { price: 68000, basis: 'Pipa air panas PPR PN20 terpasang per m.' },
  159: { price: 550000, basis: 'Bak kontrol pasangan bata 45x45 termasuk tutup per buah.' },
  162: { price: 850000, basis: 'Grease trap dapur per buah terpasang.' },
  163: { price: 95000, basis: 'Cleanout pipa buangan per buah terpasang.' },
  168: { price: 32000, basis: 'Insulasi pipa refrigerant (armaflex) per m terpasang.' },
  180: { price: 450000, basis: 'Outlet data LAN RJ45 + kabel UTP Cat6 per titik terpasang.' },
  182: { price: 350000, basis: 'Bel pintu nirkabel per set terpasang.' },
  183: { price: 195000, basis: 'Paving block 6 cm f\u2019c 20 terpasang per m2 (kode katalog ditolak gerbang satuan).' },
  184: { price: 195000, basis: 'Paving block 6 cm f\u2019c 20 terpasang per m2 (kode katalog ditolak gerbang satuan).' },
  188: { price: 1450000, basis: 'Pagar depan bata plester + besi tempa per m terpasang (komposit, di luar katalog tunggal).' },
  189: { price: 7500000, basis: 'Pintu gerbang besi geser lebar 3,5 m per set terpasang.' },
  196: { price: 15000, basis: 'Perataan akhir + pembersihan halaman (grading) per m2.' },
  197: { price: 2850000, basis: 'Meja dapur beton finishing granit per m terpasang.' },
  198: { price: 2650000, basis: 'Kitchen set kabinet atas + bawah per m terpasang (kelas standar).' },
  202: { price: 450000, basis: 'Aksesoris kamar mandi (tempat sabun, gantungan, dll.) per set.' },
  203: { price: 6500000, basis: 'Lemari pakaian built-in kamar utama per set (kelas standar).' },
  204: { price: 1500000, basis: 'Pengujian instalasi listrik + pengukuran tahanan pembumian (lump sum).' },
  205: { price: 1000000, basis: 'Uji tekanan (hydrotest) pipa air bersih (lump sum).' },
  206: { price: 750000, basis: 'Uji kebocoran + aliran drainase/sanitasi (lump sum).' },
  207: { price: 750000, basis: 'Uji rendam waterproofing 24 jam (lump sum).' },
  208: { price: 150000, basis: 'Pengujian benda uji beton laboratorium per buah.' },
  209: { price: 2000000, basis: 'Komisioning AC, pompa, panel listrik (lump sum).' },
  210: { price: 12000, basis: 'Pembersihan akhir menyeluruh sebelum serah terima per m2.' },
  211: { price: 1000000, basis: 'Inspeksi defect + daftar perbaikan (punch list) lump sum.' },
  212: { price: 3500000, basis: 'Gambar as-built + dokumentasi serah terima (lump sum).' },
  213: { price: 1500000, basis: 'Manual O&M + pelatihan pemilik (lump sum).' },
};
