/**
 * ArcadeQuiz ("Kuis Tukang") — pure logic: bank soal, ronde, skoring.
 * 100% pengetahuan proyek & konstruksi Indonesia. 10 soal per ronde.
 */

export interface Question {
  q: string;
  options: string[];
  answer: number; // index 0-3
  cat: string;
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

export const QUESTIONS: Question[] = [
  // ---- RAB & AHSP ----
  { q: 'Apa kepanjangan "RAB" dalam dunia proyek?', options: ['Rapat Anggaran Bersama', 'Rencana Anggaran Biaya', 'Rancangan Awal Bangunan', 'Rencana Arus Barang'], answer: 1, cat: 'RAB & AHSP' },
  { q: 'AHSP adalah singkatan dari…', options: ['Anggaran Harga Satuan Pekerjaan', 'Analisa Harga Satuan Pekerjaan', 'Analisa Harian Satuan Proyek', 'Anggaran Harian Seluruh Pekerjaan'], answer: 1, cat: 'RAB & AHSP' },
  { q: 'HSPK adalah singkatan dari…', options: ['Harga Satuan Pokok Kegiatan', 'Hitungan Standar Proyek Konstruksi', 'Harga Standar Proyek Kabupaten', 'Himpunan Satuan Pekerjaan Konstruksi'], answer: 0, cat: 'RAB & AHSP' },
  { q: 'Satuan yang tepat untuk pekerjaan pengecoran beton adalah…', options: ['m²', 'm³', 'kg', 'titik'], answer: 1, cat: 'RAB & AHSP' },
  { q: 'Satuan yang tepat untuk pekerjaan bekisting adalah…', options: ['m³', 'kg', 'm²', 'ls'], answer: 2, cat: 'RAB & AHSP' },
  { q: 'Satuan yang tepat untuk pekerjaan pembesian adalah…', options: ['m³', 'm²', 'kg', 'batang'], answer: 2, cat: 'RAB & AHSP' },
  { q: 'Istilah "termin" dalam pembayaran proyek berarti…', options: ['Denda keterlambatan', 'Pembayaran bertahap sesuai progres', 'Uang muka 100%', 'Potongan pajak'], answer: 1, cat: 'RAB & AHSP' },
  { q: '"Opname" di lapangan adalah kegiatan…', options: ['Menghitung volume pekerjaan yang terpasang', 'Membayar gaji tukang', 'Menandatangani kontrak', 'Menguji kuat beton'], answer: 0, cat: 'RAB & AHSP' },
  // ---- MATERIAL ----
  { q: 'Campuran semen, pasir, kerikil, dan air disebut…', options: ['Mortar', 'Beton', 'Spesi', 'Plester'], answer: 1, cat: 'Material' },
  { q: 'Adukan semen + pasir + air (tanpa kerikil) disebut…', options: ['Beton', 'Mortar / spesi', 'Cor dak', 'Agregat'], answer: 1, cat: 'Material' },
  { q: 'Dinding dari tanah liat yang dibakar disebut…', options: ['Batako', 'Bata merah', 'Hebel', 'Gypsum'], answer: 1, cat: 'Material' },
  { q: 'Hebel termasuk jenis…', options: ['Bata merah', 'Beton ringan (AAC)', 'Batu alam', 'Kayu olahan'], answer: 1, cat: 'Material' },
  { q: 'Fungsi pasir dalam adukan beton adalah sebagai…', options: ['Perekat utama', 'Agregat halus / pengisi', 'Pewarna', 'Pengering'], answer: 1, cat: 'Material' },
  { q: 'Besi beton ulir umumnya dipakai untuk…', options: ['Tulangan struktur', 'Kawat jemuran', 'Pagar hias', 'Rangka atap ringan'], answer: 0, cat: 'Material' },
  { q: 'Semen Portland Tipe I dipakai untuk…', options: ['Konstruksi umum', 'Beton massa bendungan', 'Jalan beton cepat kering', 'Kolam renang saja'], answer: 0, cat: 'Material' },
  { q: 'Bekisting kolom di lapangan umumnya memakai…', options: ['Triplek tipis 4 mm', 'Papan kayu / multipleks', 'Seng gelombang', 'Papan gypsum'], answer: 1, cat: 'Material' },
  // ---- STRUKTUR ----
  { q: 'Fondasi yang cocok untuk bangunan 1 lantai di tanah keras dangkal adalah…', options: ['Tiang pancang', 'Bore pile', 'Batu kali menerus', 'Foot plat raksasa'], answer: 2, cat: 'Struktur' },
  { q: 'Fondasi yang dipakai untuk gedung bertingkat di tanah lunak adalah…', options: ['Batu kali', 'Tiang pancang', 'Rollag bata', 'Pasangan kosong'], answer: 1, cat: 'Struktur' },
  { q: 'Elemen struktur vertikal penahan beban disebut…', options: ['Balok', 'Kolom', 'Sloof', 'Plat'], answer: 1, cat: 'Struktur' },
  { q: 'Elemen struktur horizontal yang bertumpu pada kolom disebut…', options: ['Balok', 'Fondasi', 'Kuda-kuda', 'Reng'], answer: 0, cat: 'Struktur' },
  { q: 'Fungsi sloof pada bangunan adalah…', options: ['Menahan atap', 'Mengikat kolom di atas fondasi', 'Membagi ruangan', 'Menahan air hujan'], answer: 1, cat: 'Struktur' },
  { q: 'Atap pelana memiliki…', options: ['1 bidang miring', '2 bidang miring', '4 bidang miring', 'Bidang datar'], answer: 1, cat: 'Struktur' },
  { q: 'Kemiringan ideal atap genteng tanah liat adalah sekitar…', options: ['10°', '20°', '30°', '60°'], answer: 2, cat: 'Struktur' },
  { q: 'Tebal minimal plat lantai beton bertulang umumnya…', options: ['7 cm', '10 cm', '12 cm', '20 cm'], answer: 2, cat: 'Struktur' },
  // ---- K3 ----
  { q: 'APD adalah singkatan dari…', options: ['Alat Pelindung Diri', 'Aturan Proyek Darurat', 'Awasi Pekerja Datang', 'Alat Pemadam Darurat'], answer: 0, cat: 'K3' },
  { q: 'Warna helm proyek yang umumnya dipakai tukang / pekerja umum adalah…', options: ['Putih', 'Kuning', 'Merah', 'Biru'], answer: 1, cat: 'K3' },
  { q: 'Helm putih di proyek umumnya dipakai oleh…', options: ['Tukang batu', 'Pengawas / engineer', 'Tukang las', 'Kernet'], answer: 1, cat: 'K3' },
  { q: 'Fungsi body harness saat kerja di ketinggian adalah…', options: ['Agar tidak kepanasan', 'Mencegah jatuh dari ketinggian', 'Agar terlihat rapi', 'Menahan debu'], answer: 1, cat: 'K3' },
  { q: 'Rambu K3 berbentuk segitiga kuning berarti…', options: ['Larangan', 'Peringatan / awas bahaya', 'Wajib lapor', 'Jalur evakuasi'], answer: 1, cat: 'K3' },
  { q: 'Kotak P3K wajib tersedia di…', options: ['Kantor konsultan saja', 'Area proyek', 'Rumah mandor', 'Warung sebelah proyek'], answer: 1, cat: 'K3' },
  { q: 'Sebelum naik scaffolding, pekerja wajib…', options: ['Lepas helm biar ringan', 'Memakai body harness & helm', 'Bawa radio saja', 'Naik secepatnya'], answer: 1, cat: 'K3' },
  { q: 'Tanda "DILARANG MEROKOK" wajib dipasang di area…', options: ['Kantin proyek', 'Gudang material mudah terbakar', 'Pos satpam', 'Musholla'], answer: 1, cat: 'K3' },
  // ---- ALAT BERAT ----
  { q: 'Excavator (bego) berfungsi untuk…', options: ['Mengangkat material ke lantai atas', 'Menggali tanah', 'Mengaduk beton', 'Memadatkan aspal'], answer: 1, cat: 'Alat Berat' },
  { q: 'Tower crane dipakai untuk…', options: ['Menggali fondasi', 'Mengangkat material ke ketinggian', 'Meratakan tanah', 'Memotong besi'], answer: 1, cat: 'Alat Berat' },
  { q: 'Molen (concrete mixer) berfungsi untuk…', options: ['Mengaduk adukan beton', 'Memompa beton', 'Mengangkat semen', 'Mengukur volume'], answer: 0, cat: 'Alat Berat' },
  { q: 'Concrete vibrator dipakai saat pengecoran untuk…', options: ['Mengeringkan beton', 'Memadatkan adukan agar tidak keropos', 'Menghaluskan permukaan', 'Menambah air'], answer: 1, cat: 'Alat Berat' },
  { q: 'Bulldozer berfungsi untuk…', options: ['Mendorong & meratakan tanah', 'Mengebor tanah', 'Mengecor kolom', 'Mengangkat balok'], answer: 0, cat: 'Alat Berat' },
  { q: 'Bar cutter dipakai untuk…', options: ['Menekuk besi', 'Memotong besi beton', 'Mengelas besi', 'Mengikat besi'], answer: 1, cat: 'Alat Berat' },
  { q: 'Scaffolding (perancah) berfungsi sebagai…', options: ['Bekisting kolom', 'Panggung kerja sementara di ketinggian', 'Penopang fondasi', 'Atap sementara'], answer: 1, cat: 'Alat Berat' },
  { q: 'Waterpass dipakai untuk…', options: ['Mengukur kedalaman galian', 'Mengukur kerataan & beda tinggi', 'Menimbang semen', 'Menghitung volume'], answer: 1, cat: 'Alat Berat' },
  // ---- PROYEK ----
  { q: 'Tugas utama mandor di lapangan adalah…', options: ['Mendesain gambar', 'Mengawasi & mengatur tukang', 'Membayar termin', 'Mengurus IMB'], answer: 1, cat: 'Proyek' },
  { q: 'Tukang batu adalah ahli di bidang…', options: ['Instalasi listrik', 'Pasangan bata & plester', 'Pengelasan', 'Pengecatan'], answer: 1, cat: 'Proyek' },
  { q: 'Kurva S pada proyek dipakai untuk…', options: ['Menggambar denah', 'Memantau progres vs rencana waktu', 'Menghitung RAB', 'Mengetes beton'], answer: 1, cat: 'Proyek' },
  { q: 'Shop drawing dibuat oleh…', options: ['Pemilik proyek', 'Kontraktor pelaksana', 'Notaris', 'Bank'], answer: 1, cat: 'Proyek' },
  { q: 'As-built drawing dibuat…', options: ['Sebelum tender', 'Setelah pekerjaan selesai, sesuai terbangun', 'Saat 50% progres', 'Oleh arsitek saja'], answer: 1, cat: 'Proyek' },
  { q: 'Serah terima pertama pekerjaan (sementara) disebut…', options: ['FHO', 'PHO', 'BAST final', 'Berita acara gagal'], answer: 1, cat: 'Proyek' },
  { q: 'Masa pemeliharaan gedung umumnya berlangsung…', options: ['30 hari', '90 hari', '180 hari', '3 tahun'], answer: 2, cat: 'Proyek' },
  { q: 'Jika hujan deras saat pengecoran, mandor yang bijak akan…', options: ['Tetap cor, biar cepat selesai', 'Menghentikan cor & melindungi adukan', 'Menambah air biar encer', 'Pulang tanpa kabar'], answer: 1, cat: 'Proyek' },
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

/** Susun 10 soal: acak urutan soal & acak urutan opsi tiap soal. */
export function buildRound(seed: number): Question[] {
  const rng = mulberry32(seed);
  const picked = shuffleSeeded(QUESTIONS, rng).slice(0, QUESTIONS_PER_ROUND);
  return picked.map((q) => {
    const order = shuffleSeeded([0, 1, 2, 3], rng);
    return {
      q: q.q,
      cat: q.cat,
      options: order.map((i) => q.options[i]),
      answer: order.indexOf(q.answer),
    };
  });
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
