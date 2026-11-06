/**
 * ArcadeQuiz ("Kuis Tukang") — pure logic: bank soal, ronde, skoring.
 * 100% pengetahuan proyek & konstruksi Indonesia. 10 soal per ronde.
 *
 * Gelombang 5: bank diperluas 48 → 96 soal, bertingkat kesulitan.
 * - `tier` 1 = Dasar, 2 = Menengah, 3 = Lanjutan.
 * - `buildRound` mencampur tingkat sesuai progres ronde lewat
 *   `ROUND_TIER_PLAN` (awal ronde dasar, tengah menengah, akhir lanjutan)
 *   sebagai fungsi murni `pickQuestionsForRound` / `tierPlanForRound`.
 * Semua soal adalah fakta konstruksi umum yang kokoh (satuan standar,
 * fungsi alat/APD, istilah proyek, matematika proyek sederhana) — tidak
 * ada angka teknis yang meragukan.
 */

export type DifficultyTier = 1 | 2 | 3;

export interface Question {
  q: string;
  options: string[];
  answer: number; // index 0-3
  cat: string;
  tier: DifficultyTier;
}

export const QUESTIONS_PER_ROUND = 10;
export const TIME_PER_QUESTION = 15; // detik

export const CATEGORIES = [
  'RAB & AHSP',
  'Material',
  'Struktur',
  'K3',
  'Alat Berat',
  'Proyek',
] as const;

export function tierLabel(tier: DifficultyTier): string {
  if (tier === 1) return 'Dasar';
  if (tier === 2) return 'Menengah';
  return 'Lanjutan';
}

/**
 * Rencana tingkat kesulitan per posisi soal dalam satu ronde (10 soal):
 * 3 dasar → 4 menengah → 3 lanjutan. Ronde terasa menanjak, bukan acak datar.
 */
export const ROUND_TIER_PLAN: readonly DifficultyTier[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];

/** Rencana tier untuk ronde sejumlah `count` soal (mengulang pola proporsional). */
export function tierPlanForRound(count: number = QUESTIONS_PER_ROUND): DifficultyTier[] {
  if (count <= 0) return [];
  const plan: DifficultyTier[] = [];
  for (let i = 0; i < count; i += 1) {
    // petakan posisi ke pola 10 soal agar proporsi 3/4/3 tetap terjaga
    const idx = Math.min(ROUND_TIER_PLAN.length - 1, Math.floor((i / count) * ROUND_TIER_PLAN.length));
    plan.push(ROUND_TIER_PLAN[idx]);
  }
  return plan;
}

export const QUESTIONS: Question[] = [
  // ---- RAB & AHSP ----
  { q: 'Apa kepanjangan "RAB" dalam dunia proyek?', options: ['Rapat Anggaran Bersama', 'Rencana Anggaran Biaya', 'Rancangan Awal Bangunan', 'Rencana Arus Barang'], answer: 1, cat: 'RAB & AHSP', tier: 1 },
  { q: 'AHSP adalah singkatan dari…', options: ['Anggaran Harga Satuan Pekerjaan', 'Analisa Harga Satuan Pekerjaan', 'Analisa Harian Satuan Proyek', 'Anggaran Harian Seluruh Pekerjaan'], answer: 1, cat: 'RAB & AHSP', tier: 1 },
  { q: 'HSPK adalah singkatan dari…', options: ['Harga Satuan Pokok Kegiatan', 'Hitungan Standar Proyek Konstruksi', 'Harga Standar Proyek Kabupaten', 'Himpunan Satuan Pekerjaan Konstruksi'], answer: 0, cat: 'RAB & AHSP', tier: 2 },
  { q: 'Satuan yang tepat untuk pekerjaan pengecoran beton adalah…', options: ['m²', 'm³', 'kg', 'titik'], answer: 1, cat: 'RAB & AHSP', tier: 1 },
  { q: 'Satuan yang tepat untuk pekerjaan bekisting adalah…', options: ['m³', 'kg', 'm²', 'ls'], answer: 2, cat: 'RAB & AHSP', tier: 2 },
  { q: 'Satuan yang tepat untuk pekerjaan pembesian adalah…', options: ['m³', 'm²', 'kg', 'batang'], answer: 2, cat: 'RAB & AHSP', tier: 3 },
  { q: 'Istilah "termin" dalam pembayaran proyek berarti…', options: ['Denda keterlambatan', 'Pembayaran bertahap sesuai progres', 'Uang muka 100%', 'Potongan pajak'], answer: 1, cat: 'RAB & AHSP', tier: 2 },
  { q: '"Opname" di lapangan adalah kegiatan…', options: ['Menghitung volume pekerjaan yang terpasang', 'Membayar gaji tukang', 'Menandatangani kontrak', 'Menguji kuat beton'], answer: 0, cat: 'RAB & AHSP', tier: 3 },
  { q: 'Koefisien dalam AHSP menunjukkan…', options: ['Kebutuhan bahan, upah, dan alat untuk satu satuan pekerjaan', 'Total harga seluruh proyek', 'Jumlah tukang yang bekerja di lapangan', 'Lama waktu penyelesaian proyek'], answer: 0, cat: 'RAB & AHSP', tier: 3 },
  { q: 'Volume beton untuk plat berukuran 5 m × 4 m dengan tebal 0,12 m adalah…', options: ['2,4 m³', '24 m³', '0,24 m³', '4,2 m³'], answer: 0, cat: 'RAB & AHSP', tier: 3 },
  { q: 'Satu meter sama dengan…', options: ['10 cm', '100 cm', '1.000 cm', '50 cm'], answer: 1, cat: 'RAB & AHSP', tier: 1 },
  { q: 'Harga satuan satu pekerjaan umumnya terdiri dari komponen…', options: ['Bahan, upah, dan alat', 'Tanah, pajak, dan asuransi', 'Gaji direksi saja', 'Transportasi saja'], answer: 0, cat: 'RAB & AHSP', tier: 3 },
  { q: 'Satuan yang umum untuk pekerjaan pengecatan dinding adalah…', options: ['m³', 'kg', 'm²', 'unit'], answer: 2, cat: 'RAB & AHSP', tier: 2 },
  { q: 'Dokumen Bill of Quantity (BQ) berisi…', options: ['Daftar item pekerjaan beserta volumenya', 'Daftar nama pekerja proyek', 'Jadwal libur proyek', 'Foto dokumentasi lapangan'], answer: 0, cat: 'RAB & AHSP', tier: 3 },
  { q: 'Satuan yang tepat untuk pekerjaan galian tanah adalah…', options: ['m²', 'm³', 'kg', 'batang'], answer: 1, cat: 'RAB & AHSP', tier: 1 },
  { q: 'Luas dinding dengan panjang 6 m dan tinggi 3 m adalah…', options: ['9 m²', '18 m²', '36 m²', '12 m²'], answer: 1, cat: 'RAB & AHSP', tier: 2 },
  // ---- MATERIAL ----
  { q: 'Campuran semen, pasir, kerikil, dan air disebut…', options: ['Mortar', 'Beton', 'Spesi', 'Plester'], answer: 1, cat: 'Material', tier: 1 },
  { q: 'Adukan semen + pasir + air (tanpa kerikil) disebut…', options: ['Beton', 'Mortar / spesi', 'Cor dak', 'Agregat'], answer: 1, cat: 'Material', tier: 1 },
  { q: 'Dinding dari tanah liat yang dibakar disebut…', options: ['Batako', 'Bata merah', 'Hebel', 'Gypsum'], answer: 1, cat: 'Material', tier: 2 },
  { q: 'Hebel termasuk jenis…', options: ['Bata merah', 'Beton ringan (AAC)', 'Batu alam', 'Kayu olahan'], answer: 1, cat: 'Material', tier: 1 },
  { q: 'Fungsi pasir dalam adukan beton adalah sebagai…', options: ['Perekat utama', 'Agregat halus / pengisi', 'Pewarna', 'Pengering'], answer: 1, cat: 'Material', tier: 2 },
  { q: 'Besi beton ulir umumnya dipakai untuk…', options: ['Tulangan struktur', 'Kawat jemuran', 'Pagar hias', 'Rangka atap ringan'], answer: 0, cat: 'Material', tier: 3 },
  { q: 'Semen Portland Tipe I dipakai untuk…', options: ['Konstruksi umum', 'Beton massa bendungan', 'Jalan beton cepat kering', 'Kolam renang saja'], answer: 0, cat: 'Material', tier: 2 },
  { q: 'Bekisting kolom di lapangan umumnya memakai…', options: ['Triplek tipis 4 mm', 'Papan kayu / multipleks', 'Seng gelombang', 'Papan gypsum'], answer: 1, cat: 'Material', tier: 3 },
  { q: 'Fungsi utama tulangan baja pada beton bertulang adalah menahan…', options: ['Gaya tarik', 'Sinar matahari', 'Air hujan', 'Bunyi bising'], answer: 0, cat: 'Material', tier: 3 },
  { q: 'Air yang terlalu banyak pada adukan beton segar dapat menyebabkan…', options: ['Beton makin kuat', 'Kekuatan beton menurun', 'Beton berubah warna jadi emas', 'Beton langsung kering'], answer: 1, cat: 'Material', tier: 3 },
  { q: 'Kerikil / split dalam campuran beton berperan sebagai…', options: ['Agregat kasar', 'Perekat utama', 'Bahan pewarna', 'Bahan pengering'], answer: 0, cat: 'Material', tier: 1 },
  { q: 'Kawat bendrat digunakan untuk…', options: ['Mengikat tulangan besi', 'Mengecat dinding', 'Memotong keramik', 'Mengukur panjang'], answer: 0, cat: 'Material', tier: 3 },
  { q: 'Pipa PVC umumnya digunakan untuk…', options: ['Instalasi saluran air', 'Tulangan kolom', 'Rangka atap', 'Pondasi bangunan'], answer: 0, cat: 'Material', tier: 2 },
  { q: 'Multipleks / triplek dibuat dari…', options: ['Lapisan-lapisan kayu lapis yang direkatkan', 'Serbuk besi yang dipadatkan', 'Tanah liat yang dibakar', 'Plastik daur ulang saja'], answer: 0, cat: 'Material', tier: 3 },
  { q: 'Nat pada pemasangan keramik adalah…', options: ['Bahan pengisi celah antar keramik', 'Jenis paku untuk keramik', 'Alat pemotong keramik', 'Cat untuk permukaan keramik'], answer: 0, cat: 'Material', tier: 1 },
  { q: 'Bata ringan (hebel) umumnya dipasang menggunakan…', options: ['Mortar khusus bata ringan (thin bed)', 'Tanah liat basah', 'Lem kayu', 'Aspal cair'], answer: 0, cat: 'Material', tier: 2 },
  // ---- STRUKTUR ----
  { q: 'Fondasi yang cocok untuk bangunan 1 lantai di tanah keras dangkal adalah…', options: ['Tiang pancang', 'Bore pile', 'Batu kali menerus', 'Foot plat raksasa'], answer: 2, cat: 'Struktur', tier: 1 },
  { q: 'Fondasi yang dipakai untuk gedung bertingkat di tanah lunak adalah…', options: ['Batu kali', 'Tiang pancang', 'Rollag bata', 'Pasangan kosong'], answer: 1, cat: 'Struktur', tier: 2 },
  { q: 'Elemen struktur vertikal penahan beban disebut…', options: ['Balok', 'Kolom', 'Sloof', 'Plat'], answer: 1, cat: 'Struktur', tier: 1 },
  { q: 'Elemen struktur horizontal yang bertumpu pada kolom disebut…', options: ['Balok', 'Fondasi', 'Kuda-kuda', 'Reng'], answer: 0, cat: 'Struktur', tier: 2 },
  { q: 'Fungsi sloof pada bangunan adalah…', options: ['Menahan atap', 'Mengikat kolom di atas fondasi', 'Membagi ruangan', 'Menahan air hujan'], answer: 1, cat: 'Struktur', tier: 3 },
  { q: 'Atap pelana memiliki…', options: ['1 bidang miring', '2 bidang miring', '4 bidang miring', 'Bidang datar'], answer: 1, cat: 'Struktur', tier: 1 },
  { q: 'Kemiringan ideal atap genteng tanah liat adalah sekitar…', options: ['10°', '20°', '30°', '60°'], answer: 2, cat: 'Struktur', tier: 2 },
  { q: 'Tebal minimal plat lantai beton bertulang umumnya…', options: ['7 cm', '10 cm', '12 cm', '20 cm'], answer: 2, cat: 'Struktur', tier: 3 },
  { q: 'Balok latei dipasang di…', options: ['Atas bukaan pintu dan jendela', 'Bawah pondasi', 'Tengah atap', 'Samping tangga'], answer: 0, cat: 'Struktur', tier: 3 },
  { q: 'Pada tangga, permukaan horizontal tempat kaki menginjak disebut…', options: ['Injakan (tread)', 'Sloof', 'Ring balk', 'Usuk'], answer: 0, cat: 'Struktur', tier: 3 },
  { q: 'Kuda-kuda berfungsi untuk…', options: ['Menopang beban atap', 'Mengikat pondasi', 'Membagi ruangan', 'Menyalurkan air hujan'], answer: 0, cat: 'Struktur', tier: 1 },
  { q: 'Fondasi foot plat (pondasi setempat) berfungsi…', options: ['Menyebarkan beban kolom ke tanah di bawahnya', 'Menahan atap bangunan', 'Mengikat dinding bata', 'Menampung air hujan'], answer: 0, cat: 'Struktur', tier: 3 },
  { q: 'Ring balk dipasang…', options: ['Di atas dinding mengelilingi bangunan', 'Di bawah lantai dasar', 'Di dalam pondasi', 'Di puncak atap saja'], answer: 0, cat: 'Struktur', tier: 2 },
  { q: 'Dinding yang ikut memikul beban struktur di atasnya disebut…', options: ['Dinding pemikul', 'Dinding partisi', 'Dinding tirai', 'Dinding dekorasi'], answer: 0, cat: 'Struktur', tier: 3 },
  { q: 'Sloof, kolom, dan balok pada rumah tinggal umumnya terbuat dari…', options: ['Beton bertulang', 'Kaca', 'Plastik', 'Bambu saja'], answer: 0, cat: 'Struktur', tier: 1 },
  { q: 'Beban dari plat lantai disalurkan berikutnya ke…', options: ['Balok, lalu ke kolom', 'Langsung ke atap', 'Ke dinding partisi', 'Ke kusen pintu'], answer: 0, cat: 'Struktur', tier: 2 },
  // ---- K3 ----
  { q: 'APD adalah singkatan dari…', options: ['Alat Pelindung Diri', 'Aturan Proyek Darurat', 'Awasi Pekerja Datang', 'Alat Pemadam Darurat'], answer: 0, cat: 'K3', tier: 1 },
  { q: 'Warna helm proyek yang umumnya dipakai tukang / pekerja umum adalah…', options: ['Putih', 'Kuning', 'Merah', 'Biru'], answer: 1, cat: 'K3', tier: 1 },
  { q: 'Helm putih di proyek umumnya dipakai oleh…', options: ['Tukang batu', 'Pengawas / engineer', 'Tukang las', 'Kernet'], answer: 1, cat: 'K3', tier: 2 },
  { q: 'Fungsi body harness saat kerja di ketinggian adalah…', options: ['Agar tidak kepanasan', 'Mencegah jatuh dari ketinggian', 'Agar terlihat rapi', 'Menahan debu'], answer: 1, cat: 'K3', tier: 2 },
  { q: 'Rambu K3 berbentuk segitiga kuning berarti…', options: ['Larangan', 'Peringatan / awas bahaya', 'Wajib lapor', 'Jalur evakuasi'], answer: 1, cat: 'K3', tier: 1 },
  { q: 'Kotak P3K wajib tersedia di…', options: ['Kantor konsultan saja', 'Area proyek', 'Rumah mandor', 'Warung sebelah proyek'], answer: 1, cat: 'K3', tier: 3 },
  { q: 'Sebelum naik scaffolding, pekerja wajib…', options: ['Lepas helm biar ringan', 'Memakai body harness & helm', 'Bawa radio saja', 'Naik secepatnya'], answer: 1, cat: 'K3', tier: 2 },
  { q: 'Tanda "DILARANG MEROKOK" wajib dipasang di area…', options: ['Kantin proyek', 'Gudang material mudah terbakar', 'Pos satpam', 'Musholla'], answer: 1, cat: 'K3', tier: 2 },
  { q: 'APAR digunakan untuk…', options: ['Memadamkan api kecil pada awal kebakaran', 'Mengangkat material berat', 'Mengukur kerataan lantai', 'Menandai batas lahan'], answer: 0, cat: 'K3', tier: 3 },
  { q: 'Warna merah pada rambu K3 umumnya berarti…', options: ['Larangan', 'Informasi umum', 'Jalur evakuasi', 'Area istirahat'], answer: 0, cat: 'K3', tier: 3 },
  { q: 'Helm proyek (safety helmet) melindungi pekerja dari…', options: ['Benturan dan benda jatuh yang mengenai kepala', 'Kebisingan mesin', 'Sengatan listrik tegangan tinggi', 'Paparan sinar matahari saja'], answer: 0, cat: 'K3', tier: 1 },
  { q: 'Sepatu safety dengan ujung baja melindungi…', options: ['Jari kaki dari benda berat yang jatuh', 'Telinga dari kebisingan', 'Mata dari percikan api', 'Tangan dari goresan'], answer: 0, cat: 'K3', tier: 3 },
  { q: 'Masker / respirator saat menggerinda atau mengebor beton melindungi…', options: ['Pernapasan dari debu', 'Kepala dari benturan', 'Kaki dari paku', 'Mata dari cahaya'], answer: 0, cat: 'K3', tier: 2 },
  { q: 'Toolbox meeting / safety morning talk adalah…', options: ['Briefing keselamatan singkat sebelum mulai bekerja', 'Rapat pembayaran termin', 'Acara syukuran proyek', 'Pemeriksaan gambar kerja'], answer: 0, cat: 'K3', tier: 3 },
  { q: 'Sarung tangan kerja melindungi tangan dari…', options: ['Luka, goresan, dan gesekan saat bekerja', 'Air hujan', 'Dinginnya udara pagi', 'Warna cat yang menempel saja'], answer: 0, cat: 'K3', tier: 1 },
  { q: 'Pekerja yang bekerja di ketinggian wajib menggunakan pengaman berupa…', options: ['Body harness yang terkait ke titik angkur / lifeline', 'Sandal jepit yang kuat', 'Topi biasa', 'Kacamata hitam'], answer: 0, cat: 'K3', tier: 2 },
  // ---- ALAT BERAT ----
  { q: 'Excavator (bego) berfungsi untuk…', options: ['Mengangkat material ke lantai atas', 'Menggali tanah', 'Mengaduk beton', 'Memadatkan aspal'], answer: 1, cat: 'Alat Berat', tier: 1 },
  { q: 'Tower crane dipakai untuk…', options: ['Menggali fondasi', 'Mengangkat material ke ketinggian', 'Meratakan tanah', 'Memotong besi'], answer: 1, cat: 'Alat Berat', tier: 1 },
  { q: 'Molen (concrete mixer) berfungsi untuk…', options: ['Mengaduk adukan beton', 'Memompa beton', 'Mengangkat semen', 'Mengukur volume'], answer: 0, cat: 'Alat Berat', tier: 2 },
  { q: 'Concrete vibrator dipakai saat pengecoran untuk…', options: ['Mengeringkan beton', 'Memadatkan adukan agar tidak keropos', 'Menghaluskan permukaan', 'Menambah air'], answer: 1, cat: 'Alat Berat', tier: 2 },
  { q: 'Bulldozer berfungsi untuk…', options: ['Mendorong & meratakan tanah', 'Mengebor tanah', 'Mengecor kolom', 'Mengangkat balok'], answer: 0, cat: 'Alat Berat', tier: 3 },
  { q: 'Bar cutter dipakai untuk…', options: ['Menekuk besi', 'Memotong besi beton', 'Mengelas besi', 'Mengikat besi'], answer: 1, cat: 'Alat Berat', tier: 2 },
  { q: 'Scaffolding (perancah) berfungsi sebagai…', options: ['Bekisting kolom', 'Panggung kerja sementara di ketinggian', 'Penopang fondasi', 'Atap sementara'], answer: 1, cat: 'Alat Berat', tier: 1 },
  { q: 'Waterpass dipakai untuk…', options: ['Mengukur kedalaman galian', 'Mengukur kerataan & beda tinggi', 'Menimbang semen', 'Menghitung volume'], answer: 1, cat: 'Alat Berat', tier: 3 },
  { q: 'Theodolite / total station digunakan untuk…', options: ['Mengukur sudut, jarak, dan menentukan titik bangunan', 'Mengaduk beton', 'Memotong besi beton', 'Memadatkan tanah'], answer: 0, cat: 'Alat Berat', tier: 3 },
  { q: 'Concrete pump digunakan untuk…', options: ['Memompa beton segar ke lokasi pengecoran yang tinggi / jauh', 'Memotong beton keras', 'Menguji kuat tekan beton', 'Mengeringkan beton'], answer: 0, cat: 'Alat Berat', tier: 3 },
  { q: 'Meteran digunakan untuk…', options: ['Mengukur panjang / jarak', 'Memukul paku', 'Memotong kayu', 'Mengaduk spesi'], answer: 0, cat: 'Alat Berat', tier: 1 },
  { q: 'Gerinda tangan digunakan untuk…', options: ['Memotong dan menghaluskan logam / besi', 'Menggali tanah', 'Mengangkat balok', 'Mengukur sudut'], answer: 0, cat: 'Alat Berat', tier: 3 },
  { q: 'Bor listrik digunakan untuk…', options: ['Membuat lubang pada kayu, logam, atau beton', 'Mengecat dinding', 'Memadatkan tanah', 'Mengelas besi'], answer: 0, cat: 'Alat Berat', tier: 2 },
  { q: 'Palu dalam pekerjaan tukang terutama digunakan untuk…', options: ['Memukul / memasang paku', 'Mengukur panjang', 'Memotong keramik', 'Mengaduk adukan'], answer: 0, cat: 'Alat Berat', tier: 3 },
  { q: 'Obeng digunakan untuk…', options: ['Memasang dan melepas sekrup', 'Memotong besi', 'Menggali tanah', 'Menghaluskan kayu'], answer: 0, cat: 'Alat Berat', tier: 1 },
  { q: 'Tang digunakan untuk…', options: ['Menjepit, memotong kawat, dan memutar benda kecil', 'Mengaduk beton', 'Mengukur kerataan', 'Mengangkat batu'], answer: 0, cat: 'Alat Berat', tier: 2 },
  // ---- PROYEK ----
  { q: 'Tugas utama mandor di lapangan adalah…', options: ['Mendesain gambar', 'Mengawasi & mengatur tukang', 'Membayar termin', 'Mengurus IMB'], answer: 1, cat: 'Proyek', tier: 1 },
  { q: 'Tukang batu adalah ahli di bidang…', options: ['Instalasi listrik', 'Pasangan bata & plester', 'Pengelasan', 'Pengecatan'], answer: 1, cat: 'Proyek', tier: 2 },
  { q: 'Kurva S pada proyek dipakai untuk…', options: ['Menggambar denah', 'Memantau progres vs rencana waktu', 'Menghitung RAB', 'Mengetes beton'], answer: 1, cat: 'Proyek', tier: 1 },
  { q: 'Shop drawing dibuat oleh…', options: ['Pemilik proyek', 'Kontraktor pelaksana', 'Notaris', 'Bank'], answer: 1, cat: 'Proyek', tier: 2 },
  { q: 'As-built drawing dibuat…', options: ['Sebelum tender', 'Setelah pekerjaan selesai, sesuai terbangun', 'Saat 50% progres', 'Oleh arsitek saja'], answer: 1, cat: 'Proyek', tier: 3 },
  { q: 'Serah terima pertama pekerjaan (sementara) disebut…', options: ['FHO', 'PHO', 'BAST final', 'Berita acara gagal'], answer: 1, cat: 'Proyek', tier: 2 },
  { q: 'Masa pemeliharaan gedung umumnya berlangsung…', options: ['30 hari', '90 hari', '180 hari', '3 tahun'], answer: 2, cat: 'Proyek', tier: 3 },
  { q: 'Jika hujan deras saat pengecoran, mandor yang bijak akan…', options: ['Tetap cor, biar cepat selesai', 'Menghentikan cor & melindungi adukan', 'Menambah air biar encer', 'Pulang tanpa kabar'], answer: 1, cat: 'Proyek', tier: 3 },
  { q: 'RKS adalah singkatan dari…', options: ['Rencana Kerja dan Syarat-syarat', 'Rapat Koordinasi Site', 'Rencana Kebutuhan Semen', 'Ringkasan Kegiatan Struktur'], answer: 0, cat: 'Proyek', tier: 3 },
  { q: 'Bowplank dipasang untuk…', options: ['Menentukan as / posisi bangunan dan peil lantai', 'Menopang atap sementara', 'Menampung material semen', 'Membatasi area parkir'], answer: 0, cat: 'Proyek', tier: 3 },
  { q: 'Direksi keet adalah…', options: ['Kantor / barak sementara di lokasi proyek', 'Jenis pondasi dalam', 'Alat pengukur sudut', 'Dokumen kontrak utama'], answer: 0, cat: 'Proyek', tier: 1 },
  { q: 'Konsultan pengawas bertugas…', options: ['Mengawasi mutu, waktu, dan pelaksanaan pekerjaan di lapangan', 'Menjual material ke proyek', 'Membayar gaji tukang', 'Mendesain struktur gedung'], answer: 0, cat: 'Proyek', tier: 3 },
  { q: 'Berita acara dalam proyek adalah…', options: ['Dokumen tertulis resmi tentang suatu kejadian atau pekerjaan', 'Pengumuman di papan proyek saja', 'Daftar hadir pekerja', 'Nota pembelian material'], answer: 0, cat: 'Proyek', tier: 2 },
  { q: 'Site plan menggambarkan…', options: ['Tata letak bangunan pada lahan / lokasi proyek', 'Detail sambungan baja', 'Daftar harga material', 'Jadwal pembayaran termin'], answer: 0, cat: 'Proyek', tier: 3 },
  { q: 'Laporan harian proyek umumnya mencatat…', options: ['Pekerjaan yang dikerjakan, tenaga kerja, material, dan cuaca hari itu', 'Harga saham perusahaan', 'Menu kantin proyek', 'Nama tamu hotel terdekat'], answer: 0, cat: 'Proyek', tier: 1 },
  { q: 'Satu ton sama dengan…', options: ['100 kg', '1.000 kg', '10.000 kg', '500 kg'], answer: 1, cat: 'Proyek', tier: 2 },
];

/** Seeded PRNG — deterministik untuk ronde yang bisa diulang. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleSeeded<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pilih soal untuk satu ronde secara murni & deterministik:
 * ikuti `tierPlanForRound`, ambil dari kolam tiap tier tanpa pengulangan,
 * urutan soal mengikuti rencana tier (menanjak). Bila kolam tier kurang,
 * sisa diisi dari tier terdekat yang masih tersedia.
 */
export function pickQuestionsForRound(
  seed: number,
  count: number = QUESTIONS_PER_ROUND,
  bank: readonly Question[] = QUESTIONS,
): Question[] {
  const rng = mulberry32(seed);
  const plan = tierPlanForRound(count);
  const pools = new Map<DifficultyTier, Question[]>();
  for (const tier of [1, 2, 3] as DifficultyTier[]) {
    pools.set(tier, shuffleSeeded(bank.filter((q) => q.tier === tier), rng));
  }
  const used = new Set<Question>();
  const take = (tier: DifficultyTier): Question | null => {
    const pool = pools.get(tier) ?? [];
    while (pool.length > 0) {
      const q = pool.shift() as Question;
      if (!used.has(q)) { used.add(q); return q; }
    }
    return null;
  };
  const picked: Question[] = [];
  for (const tier of plan) {
    const q = take(tier) ?? take(1) ?? take(2) ?? take(3);
    if (q) picked.push(q);
  }
  // jaga-jaga bila bank lebih kecil dari count
  if (picked.length < count) {
    for (const q of shuffleSeeded(bank, rng)) {
      if (picked.length >= count) break;
      if (!used.has(q)) { used.add(q); picked.push(q); }
    }
  }
  return picked;
}

/** Susun ronde: pilih soal bertingkat & acak urutan opsi tiap soal. */
export function buildRound(seed: number): Question[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const picked = pickQuestionsForRound(seed);
  return picked.map((q) => {
    const order = shuffleSeeded([0, 1, 2, 3], rng);
    return {
      q: q.q,
      cat: q.cat,
      tier: q.tier,
      options: order.map((i) => q.options[i]),
      answer: order.indexOf(q.answer),
    };
  });
}

/**
 * Validasi bank soal — murni, mengembalikan daftar masalah (kosong = valid).
 * Dipakai tes untuk membuktikan: jumlah, 4 opsi unik, indeks jawaban valid,
 * tidak ada pertanyaan duplikat, tier & kategori sah.
 */
export function validateQuestionBank(bank: readonly Question[] = QUESTIONS): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const q of bank) {
    const key = q.q.trim().toLowerCase();
    if (seen.has(key)) errors.push(`pertanyaan duplikat: ${q.q}`);
    seen.add(key);
    if (q.options.length !== 4) errors.push(`opsi bukan 4: ${q.q}`);
    if (new Set(q.options).size !== q.options.length) errors.push(`opsi duplikat: ${q.q}`);
    if (!(q.answer >= 0 && q.answer <= 3)) errors.push(`answer di luar rentang: ${q.q}`);
    if (!(q.tier === 1 || q.tier === 2 || q.tier === 3)) errors.push(`tier tidak sah: ${q.q}`);
    if (!(CATEGORIES as readonly string[]).includes(q.cat)) errors.push(`kategori asing: ${q.q}`);
  }
  return errors;
}

export interface AnswerResult {
  correct: boolean;
  points: number;
  newStreak: number;
}

/**
 * Skor: 100 poin dasar + bonus kecepatan (sisa detik × 5) + bonus streak (streak × 15).
 * Salah → streak reset, 0 poin.
 */
export function scoreAnswer(correct: boolean, timeLeft: number, streak: number): AnswerResult {
  if (!correct) return { correct: false, points: 0, newStreak: 0 };
  const newStreak = streak + 1;
  const points = 100 + Math.max(0, Math.round(timeLeft)) * 5 + newStreak * 15;
  return { correct: true, points, newStreak };
}

/** Grade akhir berdasarkan total skor maksimal teoritis. */
export function gradeFor(score: number, max: number): string {
  const r = max <= 0 ? 0 : score / max;
  if (r >= 0.9) return 'S';
  if (r >= 0.75) return 'A';
  if (r >= 0.55) return 'B';
  if (r >= 0.35) return 'C';
  return 'D';
}
