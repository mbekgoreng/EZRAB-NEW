/**
 * Dataset FAQ kanonis EZRAB — satu-satunya sumber teks FAQ untuk:
 * - seksi FAQ halaman utama (AiShowcase, subset `featured`),
 * - seksi FAQ halaman /fitur (subset FAQ_FITUR_IDS),
 * - halaman FAQ lengkap /faq (semua item + pencarian + JSON-LD).
 *
 * Aturan integritas konten (wajib dipertahankan saat mengedit):
 * - Jawaban hanya mengklaim kemampuan yang benar-benar ada / terverifikasi
 *   di produk. Klasifikasi internal dicatat di field `status`.
 * - Status A berlaku: aplikasi utama MASIH showcase publik — jangan pernah
 *   menulis pendaftaran publik sudah dibuka atau langganan sudah aktif.
 * - Harga yang disebut adalah harga RENCANA dari katalog plans.ts dan harus
 *   selalu disertai konteks mode simulasi.
 * - Koefisien AHSP resmi tidak pernah diubah AI/pengguna; harga yang belum
 *   tersedia tidak pernah ditulis sebagai Rp0 / harga resmi.
 * - Jangan mengklaim enkripsi end-to-end, backup otomatis, sertifikasi,
 *   atau jaminan keamanan yang tidak ada implementasinya.
 */

export type FaqStatus =
  | 'VERIFIED_ACTIVE'
  | 'PARTIALLY_AVAILABLE'
  | 'IN_DEVELOPMENT'
  | 'PLANNED';

export interface FaqCategory {
  id: string;
  label: string;
}

export interface FaqItem {
  /** ID stabil — dipakai sebagai anchor & kunci React. Jangan diubah sembarangan. */
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  status: FaqStatus;
  featured?: boolean;
  lastReviewedAt: string;
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: 'mengenal', label: 'Mengenal EZRAB' },
  { id: 'rab', label: 'RAB & Estimasi' },
  { id: 'ai', label: 'AI & Magic AI' },
  { id: 'ahsp', label: 'AHSP 2026' },
  { id: 'qto', label: 'QTO & Dokumen' },
  { id: 'laporan', label: 'Laporan & Ekspor' },
  { id: 'proyek', label: 'Proyek & Kolaborasi' },
  { id: 'akun', label: 'Akun & Langganan' },
  { id: 'keamanan', label: 'Keamanan' },
];

export const FAQ_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  FAQ_CATEGORIES.map((c) => [c.id, c.label])
);

const REVIEWED = '2026-11-02';

export const FAQ_ITEMS: FaqItem[] = [
  // ---------------- A. Mengenal EZRAB ----------------
  {
    id: 'mengenal-apa-itu-ezrab',
    category: 'mengenal',
    question: 'Apa itu EZRAB?',
    answer:
      'EZRAB adalah aplikasi web untuk estimasi konstruksi: menyusun RAB berbasis AHSP 2026, menghitung volume (QTO) dari gambar kerja dengan bantuan AI, mengelola proyek, dan menghasilkan laporan serta dokumen — dalam satu workspace. AI di dalamnya berperan sebagai asisten analisis; angka resmi tetap berasal dari data AHSP dan perhitungan EZRAB sendiri.',
    keywords: ['ezrab', 'aplikasi', 'estimasi', 'rab', 'pengertian'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'mengenal-tujuan',
    category: 'mengenal',
    question: 'Apa tujuan utama EZRAB?',
    answer:
      'Mempercepat dan merapikan pekerjaan estimasi yang biasanya tersebar di banyak spreadsheet: dari membaca gambar, menghitung volume, menerapkan AHSP, sampai menyusun RAB dan laporan — dengan jejak perhitungan yang dapat ditelusuri kembali. Tujuannya membantu estimator bekerja lebih cepat tanpa mengorbankan ketelitian dan tanggung jawab verifikasi.',
    keywords: ['tujuan', 'manfaat', 'gunanya', 'untuk apa'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'mengenal-siapa-pengguna',
    category: 'mengenal',
    question: 'Siapa saja yang dapat menggunakan EZRAB?',
    answer:
      'Estimator, quantity surveyor, kontraktor, konsultan perencana, arsitek, engineer sipil, pelaksana proyek, pemilik proyek, hingga mahasiswa konstruksi yang sedang belajar menyusun RAB. Setiap peran bekerja dengan tampilan dan kewenangan yang sesuai di dalam workspace.',
    keywords: ['siapa', 'pengguna', 'estimator', 'kontraktor', 'mahasiswa', 'arsitek'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'mengenal-hanya-kontraktor',
    category: 'mengenal',
    question: 'Apakah EZRAB hanya untuk perusahaan kontraktor?',
    answer:
      'Tidak. EZRAB juga dipakai konsultan perencana, estimator lepas, dan pemilik proyek yang ingin memahami rincian biaya sebelum memutuskan. Skala penggunaannya menyesuaikan — dari renovasi rumah tinggal sampai gedung dan pekerjaan infrastruktur.',
    keywords: ['kontraktor', 'perusahaan', 'freelance', 'pemilik proyek', 'perorangan'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'mengenal-pemula',
    category: 'mengenal',
    question: 'Apakah pemula dapat menggunakan EZRAB?',
    answer:
      'Bisa. Alur kerjanya terpandu — dari membuat proyek, memilih item dari katalog AHSP, sampai melihat rekap — dan tersedia mode demo serta panduan di dalam aplikasi untuk belajar tanpa menyentuh data proyek asli. Istilah teknisnya tetap memakai standar konstruksi, jadi pemula sekaligus belajar praktik yang benar.',
    keywords: ['pemula', 'belajar', 'mudah', 'baru', 'panduan'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'mengenal-berbasis-web',
    category: 'mengenal',
    question: 'Apakah EZRAB merupakan aplikasi berbasis web?',
    answer:
      'Ya. EZRAB berjalan di browser laptop maupun HP tanpa instalasi — cukup buka ezrab.site dari browser modern. Di HP tampilannya ringkas dengan fungsi yang sama, dan EZRAB dapat ditambahkan sebagai shortcut di layar utama sehingga terasa seperti aplikasi.',
    keywords: ['web', 'browser', 'install', 'aplikasi', 'hp', 'online'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'mengenal-jenis-proyek',
    category: 'mengenal',
    question: 'Apakah EZRAB dapat digunakan untuk berbagai jenis proyek?',
    answer:
      'Ya — rumah tinggal, gedung, interior, renovasi, hingga pekerjaan jalan dan infrastruktur, selama item pekerjaannya tersedia di katalog AHSP atau ditambahkan sebagai item kustom. Jumlah proyek aktif yang dapat dikelola mengikuti paket yang digunakan.',
    keywords: ['jenis proyek', 'rumah', 'gedung', 'jalan', 'renovasi', 'infrastruktur'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'mengenal-vs-spreadsheet',
    category: 'mengenal',
    question: 'Apa yang membedakan EZRAB dari spreadsheet RAB biasa?',
    answer:
      'Di EZRAB, item pekerjaan terhubung langsung ke katalog AHSP 2026 beserta koefisien resminya, volume dapat dibantu hitung dari gambar kerja, dan perubahan angka mengalir otomatis ke rekap, kurva S, dan laporan. Spreadsheet tetap fleksibel, tetapi rumus, koefisien, dan konsistensi antar-dokumen harus dijaga serba manual.',
    keywords: ['spreadsheet', 'excel', 'beda', 'perbandingan', 'kelebihan'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- B. RAB & Estimasi ----------------
  {
    id: 'rab-apa-itu-rab',
    category: 'rab',
    question: 'Apa itu RAB?',
    answer:
      'RAB (Rencana Anggaran Biaya) adalah dokumen perkiraan biaya proyek yang merinci item pekerjaan, volume, harga satuan, dan jumlah harga. RAB menjadi dasar penawaran, pengendalian biaya, dan evaluasi kemajuan — dan karena sifatnya rencana, angkanya tetap perlu diverifikasi terhadap kondisi lapangan.',
    keywords: ['rab', 'rencana anggaran biaya', 'pengertian', 'definisi'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'rab-membantu-membuat',
    category: 'rab',
    question: 'Apakah EZRAB dapat membantu membuat RAB?',
    answer:
      'Ya. Anda dapat menyusunnya manual dari katalog AHSP, memakai template proyek, atau meminta AI menyusun draf dari gambar kerja (DED Estimate AI) dan dokumen proyek. Semua hasil AI masuk sebagai draf yang Anda periksa dan setujui sebelum dipakai.',
    keywords: ['membuat rab', 'susun rab', 'bisa', 'membantu'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'rab-manual',
    category: 'rab',
    question: 'Apakah RAB dapat dibuat secara manual?',
    answer:
      'Bisa sepenuhnya. Pilih item dari katalog AHSP 2026, isi volumenya, dan harga satuan dihitung dari koefisien resmi dikali harga dasar bahan, upah, dan alat. Cara manual memberi Anda kendali penuh atas setiap angka yang masuk.',
    keywords: ['manual', 'sendiri', 'tanpa ai', 'cara'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'rab-total-anggaran',
    category: 'rab',
    question: 'Apakah EZRAB dapat menghitung total anggaran proyek?',
    answer:
      'Ya. Total dihitung otomatis dari jumlah seluruh item (volume × harga satuan), lalu diringkas dalam rekapitulasi per divisi pekerjaan, lengkap dengan opsi PPN dan pembulatan. Angka total selalu dapat ditelusuri kembali ke item-item penyusunnya.',
    keywords: ['total', 'anggaran', 'jumlah', 'rekapitulasi', 'ppn'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'rab-ubah-volume',
    category: 'rab',
    question: 'Apakah pengguna dapat mengubah volume pekerjaan?',
    answer:
      'Bisa. Volume dapat diketik manual atau dihitung dengan kalkulator volume bawaan. Khusus volume usulan AI, basis perhitungannya ditampilkan terlebih dahulu agar Anda dapat memeriksa, menerima, atau mengubahnya sesuai pengukuran Anda.',
    keywords: ['ubah', 'edit', 'volume', 'ganti'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'rab-item-sendiri',
    category: 'rab',
    question: 'Apakah pengguna dapat menambahkan item pekerjaan sendiri?',
    answer:
      'Bisa. Item kustom dapat dibuat bila pekerjaannya tidak ada di katalog — misalnya pekerjaan khusus atau produk bermerek tertentu. Analisa dan harganya Anda susun sendiri, dan item kustom dibedakan tampilannya dari item AHSP resmi agar tidak tertukar.',
    keywords: ['item kustom', 'tambah item', 'pekerjaan sendiri', 'custom'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'rab-analisis-harga',
    category: 'rab',
    question: 'Apakah EZRAB mendukung analisis harga satuan pekerjaan?',
    answer:
      'Ya. Setiap item AHSP menampilkan rincian analisa: koefisien bahan, upah, dan alat beserta harga dasarnya, sehingga harga satuan terbentuk secara transparan. Anda dapat memeriksa komponen penyusunnya sebelum memakai item tersebut di RAB.',
    keywords: ['analisis', 'harga satuan', 'ahsp', 'koefisien', 'rincian'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'rab-dokumen-kontrak',
    category: 'rab',
    question: 'Apakah hasil RAB EZRAB bisa langsung digunakan sebagai dokumen kontrak?',
    answer:
      'Tidak otomatis. RAB dari EZRAB adalah dokumen estimasi — dasar yang kuat untuk penawaran dan negosiasi — tetapi dokumen kontrak memerlukan verifikasi teknis, kesepakatan para pihak, dan ketentuan hukum yang berlaku. Periksa kembali volume, harga, dan lingkup pekerjaan bersama profesional yang bertanggung jawab sebelum menandatangani apa pun.',
    keywords: ['kontrak', 'dokumen resmi', 'legal', 'penawaran', 'sah'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- C. AI & Magic AI ----------------
  {
    id: 'ai-apa-itu-magic-ai',
    category: 'ai',
    question: 'Apa itu Magic AI di EZRAB?',
    answer:
      'Magic AI adalah sebutan untuk rangkaian fitur AI EZRAB: DED Estimate AI yang membaca gambar kerja menjadi draf RAB, Ezrab Chat AI untuk bertanya dan meminta analisis dari data EZRAB, AI Document untuk menyusun dokumen proyek, dan Ezrab AI Assistant sebagai pendamping di workspace. Prinsipnya satu: AI membantu menganalisis dan menyusun draf — keputusan akhir selalu di tangan Anda.',
    keywords: ['magic ai', 'fitur ai', 'ded', 'chat ai', 'ai document'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-buat-rab-otomatis',
    category: 'ai',
    question: 'Apakah AI EZRAB dapat membuat RAB secara otomatis?',
    answer:
      'AI dapat menyusun draf RAB dari gambar kerja atau dokumen: mengenali item pekerjaan, mengusulkan volume, dan mencocokkannya ke katalog AHSP. Hasilnya bukan RAB final — ia masuk sebagai draf yang wajib Anda tinjau, koreksi, dan setujui item per item.',
    keywords: ['otomatis', 'buat rab', 'generate', 'draf'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-baca-ded',
    category: 'ai',
    question: 'Apakah AI EZRAB dapat membaca gambar DED?',
    answer:
      'Ya, melalui DED Estimate AI. Unggah denah, potongan, atau detail dalam format PNG, JPG, atau PDF — AI mengenali elemen bangunan dan menghitung volume dengan basis perhitungan yang ditampilkan. Elemen yang tidak terbukti dari gambar diturunkan status buktinya dan diberi label, bukan diklaim sebagai hasil ukur pasti.',
    keywords: ['ded', 'gambar kerja', 'denah', 'baca gambar', 'upload'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-kenali-item-dokumen',
    category: 'ai',
    question: 'Apakah AI dapat mengenali item pekerjaan dari dokumen proyek?',
    answer:
      'Bisa. AI Document dan Chat AI membaca dokumen proyek berlapisan teks — misalnya PDF berisi spesifikasi atau daftar pekerjaan — untuk mengekstrak item dan menyelaraskannya dengan katalog AHSP. Dokumen hasil scan tanpa lapisan teks belum dapat diekstrak isinya; lihat pertanyaan tentang gambar hasil scan.',
    keywords: ['dokumen', 'ekstrak', 'spesifikasi', 'pdf', 'kenali item'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-harga-material-otomatis',
    category: 'ai',
    question: 'Apakah AI dapat menentukan harga material secara otomatis?',
    answer:
      'Tidak untuk harga resmi. AI tidak menciptakan harga dan tidak mengubah data AHSP — harga satuan selalu dihitung sistem dari koefisien AHSP dikali harga dasar bahan, upah, dan alat. Bila harga dasar suatu material belum tersedia, item ditahan dan diberi label harga belum tersedia, bukan diisi angka tebakan.',
    keywords: ['harga', 'material', 'otomatis', 'harga dibuat ai'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-ubah-ahsp',
    category: 'ai',
    question: 'Apakah AI EZRAB dapat mengubah harga AHSP resmi?',
    answer:
      'Tidak. Koefisien dan data AHSP resmi dikunci dari sumbernya dan tidak dapat diubah oleh AI maupun pengguna. Yang dapat disesuaikan adalah harga dasar bahan, upah, dan alat sesuai daerah dan proyek Anda — dari situlah harga satuan menyesuaikan kondisi setempat.',
    keywords: ['ubah ahsp', 'koefisien', 'harga resmi', 'edit harga'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-langsung-diterapkan',
    category: 'ai',
    question: 'Apakah hasil rekomendasi AI langsung diterapkan ke RAB?',
    answer:
      'Tidak pernah. Semua keluaran AI — item, volume, maupun dokumen — berstatus draf dan hanya masuk ke RAB setelah Anda memeriksa dan menyetujuinya secara eksplisit. Item yang belum memiliki harga resmi juga ditahan, tidak masuk sebagai nol rupiah.',
    keywords: ['rekomendasi', 'langsung', 'persetujuan', 'review', 'draf'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-gantikan-estimator',
    category: 'ai',
    question: 'Apakah AI EZRAB dapat menggantikan estimator?',
    answer:
      'Tidak. AI mempercepat pekerjaan berulang — membaca gambar, menyusun draf, merapikan dokumen — tetapi penilaian teknis, pengetahuan lapangan, dan tanggung jawab atas angka akhir tetap milik estimator dan profesional proyek. Anggap AI sebagai asisten yang sangat cepat, bukan pengganti penanggung jawab hasil.',
    keywords: ['gantikan', 'estimator', 'manusia', 'pengganti'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-selalu-benar',
    category: 'ai',
    question: 'Apakah hasil AI selalu benar?',
    answer:
      'Tidak ada AI yang selalu benar, termasuk di EZRAB. Karena itu setiap usulan AI ditampilkan bersama basisnya — sumber gambar, rumus, atau data yang dirujuk — agar mudah diperiksa, dan usulan dengan bukti lemah diberi label khusus. Verifikasi akhir selalu diperlukan, terutama untuk volume dan item bernilai besar.',
    keywords: ['benar', 'akurasi', 'salah', 'kesalahan ai', 'percaya'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ai-perbedaan-chat-ded',
    category: 'ai',
    question: 'Apa perbedaan Ezrab Chat AI dan DED Estimate AI?',
    answer:
      'Chat AI adalah asisten percakapan: bertanya harga AHSP, meminta penjelasan item, atau meminta analisis data proyek Anda. DED Estimate AI khusus membaca gambar kerja lalu menyusun draf item beserta volumenya. Keduanya berbagi prinsip yang sama — hasilnya draf yang Anda tinjau sebelum digunakan.',
    keywords: ['perbedaan', 'chat ai', 'ded estimate', 'beda'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- D. AHSP 2026 ----------------
  {
    id: 'ahsp-apa-itu',
    category: 'ahsp',
    question: 'Apa itu AHSP?',
    answer:
      'AHSP (Analisis Harga Satuan Pekerjaan) adalah metode resmi menghitung harga satuan pekerjaan konstruksi dari koefisien kebutuhan bahan, upah tenaga kerja, dan alat untuk satu satuan pekerjaan — misalnya satu meter persegi plesteran. Harga satuan adalah jumlah dari koefisien dikali harga dasar untuk seluruh komponennya.',
    keywords: ['ahsp', 'analisis harga satuan', 'pengertian', 'definisi'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ahsp-2026',
    category: 'ahsp',
    question: 'Apakah EZRAB menggunakan AHSP 2026?',
    answer:
      'Ya. Katalog utama EZRAB adalah AHSP 2026 yang bersumber dari dokumen resmi (Surat Edaran Direktorat Jenderal Bina Konstruksi, Kementerian PUPR), dan koefisiennya dipakai apa adanya tanpa diubah. Saat Anda memilih item pekerjaan, analisa resminya ikut terbawa sebagai dasar perhitungan harga.',
    keywords: ['ahsp 2026', 'resmi', 'pupr', 'katalog', 'sumber'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ahsp-semua-resmi',
    category: 'ahsp',
    question: 'Apakah semua harga di EZRAB merupakan harga resmi pemerintah?',
    answer:
      'Tidak, dan EZRAB membedakannya secara eksplisit. Koefisien AHSP bersifat resmi; harga dasar bahan, upah, dan alat berasal dari data daerah atau proyek Anda sebagai referensi pasar. Item yang memakai asumsi diberi label ASUMSI, dan yang belum ada harganya diberi label harga belum tersedia — tidak pernah disamarkan sebagai harga resmi.',
    keywords: ['harga resmi', 'pemerintah', 'semua harga', 'referensi pasar', 'asumsi'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ahsp-harga-belum-tersedia',
    category: 'ahsp',
    question: 'Bagaimana jika harga material belum tersedia?',
    answer:
      'Item tersebut ditahan dan diberi label "harga belum tersedia", lalu dikeluarkan dari total sampai Anda melengkapinya — tidak dihitung sebagai nol rupiah dan tidak diisi angka karangan. Anda dapat mengisi harga dasarnya dari data proyek atau referensi pasar yang Anda percaya.',
    keywords: ['belum tersedia', 'harga kosong', 'tidak ada harga', 'nol'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ahsp-sama-seindonesia',
    category: 'ahsp',
    question: 'Apakah harga AHSP berlaku sama di seluruh Indonesia?',
    answer:
      'Koefisiennya sama secara nasional, tetapi harga satuannya tidak — karena harga dasar bahan, upah, dan alat berbeda antar daerah. EZRAB menghitung harga satuan dari koefisien resmi dikali harga dasar setempat, sehingga hasil antar daerah memang seharusnya berbeda.',
    keywords: ['daerah', 'seluruh indonesia', 'berbeda', 'regional', 'lokal'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ahsp-koefisien-diubah',
    category: 'ahsp',
    question: 'Apakah koefisien AHSP dapat diubah?',
    answer:
      'Koefisien resmi tidak dapat diubah — ia dikunci agar perhitungan tetap setara dengan dokumen sumbernya. Bila pekerjaan Anda memiliki kondisi khusus, buat item kustom dengan analisa Anda sendiri; item itu dibedakan dari item resmi agar tidak tertukar.',
    keywords: ['koefisien', 'ubah', 'edit', 'dikunci', 'kustom'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'ahsp-ketidaksesuaian',
    category: 'ahsp',
    question: 'Bagaimana jika ditemukan ketidaksesuaian data AHSP?',
    answer:
      'Catat kode dan nama itemnya agar mudah ditelusuri. Data AHSP di EZRAB ditinjau berkala terhadap dokumen resmi sumbernya, dan ketidaksesuaian yang terverifikasi akan dikoreksi pada pembaruan data — tanpa mengubah RAB proyek yang sudah Anda susun sebelumnya.',
    keywords: ['ketidaksesuaian', 'salah data', 'beda', 'koreksi', 'lapor'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- E. QTO & Dokumen ----------------
  {
    id: 'qto-apa-itu',
    category: 'qto',
    question: 'Apa itu QTO?',
    answer:
      'QTO (Quantity Take Off) adalah proses mengukur dan menghitung volume pekerjaan dari gambar kerja — misalnya luas plesteran atau volume beton — sebelum volume itu diberi harga di RAB. QTO yang rapi membuat RAB dapat ditelusuri: setiap volume memiliki dasar ukurnya.',
    keywords: ['qto', 'quantity take off', 'pengertian', 'volume'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'qto-hubungan-rab',
    category: 'qto',
    question: 'Apa hubungan QTO dengan RAB?',
    answer:
      'QTO menghasilkan volume; RAB mengalikan volume itu dengan harga satuan AHSP menjadi jumlah harga. Di EZRAB keduanya terhubung: volume dari perhitungan QTO atau usulan AI mengalir langsung ke item RAB yang sesuai, lengkap dengan catatan basis perhitungannya.',
    keywords: ['hubungan', 'rab', 'qto', 'alur', 'volume ke rab'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'qto-hitung-volume',
    category: 'qto',
    question: 'Apakah EZRAB mendukung perhitungan volume pekerjaan?',
    answer:
      'Ya, dengan tiga cara: kalkulator volume bawaan dengan rumus terstandar, input manual, dan usulan AI dari gambar kerja melalui DED Estimate AI. Khusus usulan AI, rumus dan dimensi yang dipakai ditampilkan agar dapat Anda periksa sebelum diterima.',
    keywords: ['hitung volume', 'kalkulator', 'dukungan', 'cara'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'qto-baca-pdf',
    category: 'qto',
    question: 'Apakah EZRAB dapat membaca file PDF?',
    answer:
      'Bisa untuk dua keperluan: gambar kerja PDF dianalisis DED Estimate AI sebagai gambar, dan dokumen PDF berlapisan teks dibaca AI Document untuk diekstrak isinya — dokumen panjang diproses bertahap dan diberi label bila ada bagian yang terpotong. PDF yang murni hasil scan diperlakukan sebagai gambar, teksnya tidak diekstrak.',
    keywords: ['pdf', 'baca file', 'dokumen pdf', 'gambar pdf'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'qto-scan',
    category: 'qto',
    question: 'Apakah gambar DED hasil scan dapat dianalisis?',
    answer:
      'Gambar scan dapat diunggah dan dianalisis secara visual oleh AI seperti gambar biasa. Namun EZRAB belum memiliki OCR, sehingga tulisan dan angka di dalam scan tidak dibaca sebagai teks — hasil analisis gambar scan perlu ketelitian ekstra dan wajib diverifikasi manual terhadap gambar aslinya.',
    keywords: ['scan', 'ocr', 'hasil scan', 'foto', 'gambar lama'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'qto-otomatis-benar',
    category: 'qto',
    question: 'Apakah QTO otomatis selalu menghasilkan volume yang benar?',
    answer:
      'Tidak selalu. AI dapat keliru membaca skala, dimensi yang tertutup elemen lain, atau detail yang tidak tergambar. Karena itu volume usulan AI selalu ditampilkan dengan basis perhitungan dan status buktinya; volume yang tidak terbukti dari gambar diturunkan statusnya menjadi inferensi agar Anda waspada.',
    keywords: ['otomatis', 'benar', 'akurasi', 'salah hitung', 'volume ai'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- F. Laporan & Ekspor ----------------
  {
    id: 'laporan-excel',
    category: 'laporan',
    question: 'Apakah RAB dapat diekspor ke Excel?',
    answer:
      'Ya. RAB, rekapitulasi, dan analisa dapat diekspor ke Excel untuk diolah lebih lanjut atau dibagikan. Angka di berkas ekspor sama dengan angka terakhir yang tersimpan di proyek Anda.',
    keywords: ['excel', 'ekspor', 'export', 'unduh', 'xlsx'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'laporan-pdf',
    category: 'laporan',
    question: 'Apakah EZRAB mendukung ekspor PDF?',
    answer:
      'Ya. RAB dan laporan proyek dapat diekspor ke PDF — siap dikirim ke klien atau dilampirkan pada penawaran. Dokumen resmi seperti surat penawaran dan berita acara disusun melalui AI Document, lalu diunduh sebagai PDF setelah Anda memeriksanya.',
    keywords: ['pdf', 'ekspor', 'export', 'unduh', 'cetak'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'laporan-identitas-perusahaan',
    category: 'laporan',
    question: 'Apakah laporan dapat disesuaikan dengan identitas perusahaan?',
    answer:
      'Untuk dokumen resmi, ya — AI Document menyusun surat dan berita acara dari template berkop perusahaan Anda (nama, alamat, dan logo) dengan data proyek terisi otomatis. Ekspor RAB standar mengikuti format tabel EZRAB agar strukturnya konsisten dan mudah diperiksa siapa pun.',
    keywords: ['kop surat', 'logo', 'identitas', 'perusahaan', 'template', 'branding'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'laporan-diperbarui',
    category: 'laporan',
    question: 'Apakah data RAB dapat diperbarui setelah laporan dibuat?',
    answer:
      'Bisa. Laporan dan berkas ekspor adalah potret data pada saat dibuat; bila Anda mengubah item atau volume, buat ulang ekspornya agar dokumen mencerminkan angka terbaru. Perubahan yang Anda buat tetap tersimpan di proyek di dalam workspace.',
    keywords: ['perbarui', 'update', 'ubah', 'setelah ekspor', 'revisi'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- G. Proyek & Kolaborasi ----------------
  {
    id: 'proyek-lebih-dari-satu',
    category: 'proyek',
    question: 'Apakah EZRAB dapat mengelola lebih dari satu proyek?',
    answer:
      'Ya. Setiap proyek memiliki RAB, dokumen, dan datanya sendiri. Jumlah proyek aktif mengikuti paket: Gratis 1 proyek, Starter 7, Professional 25, dan Business tanpa batas — sesuai halaman harga yang saat ini masih berstatus mode simulasi.',
    keywords: ['banyak proyek', 'lebih dari satu', 'multi proyek', 'batas proyek'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'proyek-tim',
    category: 'proyek',
    question: 'Apakah EZRAB dapat digunakan oleh beberapa anggota tim?',
    answer:
      'Fitur peran dan undangan anggota sudah tersedia di dalam aplikasi — pemilik proyek dapat mengundang anggota dengan peran berbeda. Kolaborasi multi-pengguna secara penuh sedang disiapkan bersama aktivasi sistem backend, jadi selama tahap ini penggunaan utama masih per akun.',
    keywords: ['tim', 'anggota', 'kolaborasi', 'bersama', 'undang'],
    status: 'IN_DEVELOPMENT',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'proyek-hak-akses',
    category: 'proyek',
    question: 'Apakah setiap anggota tim dapat memiliki hak akses berbeda?',
    answer:
      'Ya, EZRAB mengenal peran dengan kewenangan berbeda — misalnya pemilik atau penanggung jawab proyek, estimator, dan peran peninjau dengan akses terbatas. Hak akses menentukan siapa yang dapat mengubah RAB, menyetujui angka, atau hanya melihat.',
    keywords: ['hak akses', 'peran', 'role', 'izin', 'kewenangan'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'proyek-dipisahkan',
    category: 'proyek',
    question: 'Apakah data setiap proyek dapat dipisahkan?',
    answer:
      'Ya. Item, volume, dokumen, dan laporan tersimpan per proyek dan tidak tercampur antar proyek. Menghapus sebuah proyek hanya menghapus data di dalam proyek itu, tanpa memengaruhi proyek lain.',
    keywords: ['pisah', 'terpisah', 'data proyek', 'antar proyek'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- H. Akun & Langganan ----------------
  {
    id: 'akun-sudah-dibuka',
    category: 'akun',
    question: 'Apakah EZRAB sudah dapat digunakan oleh publik?',
    answer:
      'Belum sepenuhnya. Saat ini situs EZRAB berfungsi sebagai showcase publik — Anda dapat mempelajari fitur dan melihat cara kerjanya — sementara aplikasi utama masih disiapkan: sistem akun, penagihan, dan keamanan akses sedang diselesaikan sebelum dibuka bertahap. Kami tidak mengumumkan tanggal rilis sebelum semuanya siap.',
    keywords: ['publik', 'dibuka', 'kapan rilis', 'akses', 'daftar'],
    status: 'PLANNED',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'akun-gratis',
    category: 'akun',
    question: 'Apakah EZRAB menyediakan akun gratis?',
    answer:
      'Paket Gratis termasuk dalam rencana paket EZRAB — tanpa biaya, dengan 100 kredit AI awal dan 1 proyek aktif, sebagaimana tercantum di halaman harga. Namun pendaftaran publiknya belum dibuka; halaman harga saat ini masih berstatus mode simulasi dan belum ada penagihan nyata.',
    keywords: ['gratis', 'akun gratis', 'free', 'coba gratis', 'kredit'],
    status: 'PLANNED',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'akun-berlangganan',
    category: 'akun',
    question: 'Apakah EZRAB akan menggunakan sistem berlangganan?',
    answer:
      'Ya, rencananya berlangganan bulanan: Starter Rp54.999, Professional Rp79.999, dan Business Rp159.999 per bulan, masing-masing dengan kredit AI bulanan. Angka tersebut adalah harga rencana yang tampil di halaman harga — langganan belum aktif dan belum ada pembayaran yang ditagihkan.',
    keywords: ['berlangganan', 'langganan', 'harga paket', 'subscription', 'bulanan'],
    status: 'PLANNED',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'akun-info-terbaru',
    category: 'akun',
    question: 'Bagaimana cara mendapatkan informasi terbaru tentang EZRAB?',
    answer:
      'Melalui situs resmi ini dan Blog EZRAB di blog.ezrab.site — pengumuman fitur baru dan pembukaan akses diterbitkan pertama kali di kedua kanal tersebut. Berhati-hatilah terhadap informasi EZRAB dari sumber yang tidak resmi.',
    keywords: ['info', 'berita', 'pengumuman', 'update', 'blog', 'terbaru'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },

  // ---------------- I. Keamanan ----------------
  {
    id: 'keamanan-data-aman',
    category: 'keamanan',
    question: 'Apakah data proyek saya aman?',
    answer:
      'Pada tahap saat ini, data proyek tersimpan lokal di browser perangkat Anda sendiri, bukan di server publik — jadi pengamanannya mengikuti keamanan perangkat dan browser Anda. EZRAB tidak mengklaim enkripsi end-to-end atau pencadangan otomatis pada tahap ini; mengekspor berkas proyek secara berkala adalah cadangan terbaik. Kebijakan lengkap tersedia di halaman Kebijakan Privasi.',
    keywords: ['aman', 'keamanan data', 'tersimpan', 'privasi', 'server'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'keamanan-dibagikan',
    category: 'keamanan',
    question: 'Apakah EZRAB membagikan data proyek kepada pihak lain?',
    answer:
      'Data proyek Anda tidak dijual dan tidak dibagikan untuk keperluan iklan. Satu hal yang perlu Anda tahu: saat memakai fitur AI, dokumen atau gambar yang Anda pilih diproses oleh penyedia model AI melalui gateway EZRAB — pertimbangkan isi dokumen sebelum mengunggahnya.',
    keywords: ['dibagikan', 'pihak ketiga', 'jual data', 'iklan', 'privasi'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'keamanan-profesional',
    category: 'keamanan',
    question: 'Apakah EZRAB dapat digunakan untuk pekerjaan profesional?',
    answer:
      'Ya, EZRAB dirancang untuk pekerjaan profesional — datanya bersumber resmi dan perhitungannya berjalan deterministik, bukan tebakan AI. Tetap perlakukan hasilnya seperti hasil perangkat lunak estimasi pada umumnya: melalui pemeriksaan dan persetujuan profesional yang bertanggung jawab sebelum dipakai untuk komitmen biaya.',
    keywords: ['profesional', 'kerja', 'kantor', 'serius', 'proyek nyata'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'keamanan-acuan-final',
    category: 'keamanan',
    question: 'Apakah hasil perhitungan EZRAB dapat dijadikan acuan final?',
    answer:
      'Jadikan sebagai dasar yang kuat, bukan satu-satunya acuan final. Volume, harga dasar, dan kelengkapan item harus diverifikasi terhadap gambar final, kondisi lapangan, dan harga pasar terakhir. Tanggung jawab atas angka final tetap berada pada estimator atau penanggung jawab proyek.',
    keywords: ['acuan final', 'final', 'verifikasi', 'tanggung jawab', 'cek ulang'],
    status: 'VERIFIED_ACTIVE',
    featured: true,
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'keamanan-lapor-kesalahan',
    category: 'keamanan',
    question: 'Bagaimana jika saya menemukan kesalahan pada aplikasi?',
    answer:
      'Di dalam aplikasi tersedia Kotak Saran & Pengaduan pada Pusat Bantuan untuk menyampaikan laporan. Sertakan langkah yang Anda lakukan dan contoh datanya — tanpa data sensitif — agar tim dapat menelusuri dan memperbaikinya.',
    keywords: ['kesalahan', 'bug', 'lapor', 'error', 'saran', 'pengaduan'],
    status: 'PARTIALLY_AVAILABLE',
    lastReviewedAt: REVIEWED,
  },
  {
    id: 'keamanan-pembaruan',
    category: 'keamanan',
    question: 'Apakah EZRAB akan terus mendapatkan pembaruan?',
    answer:
      'Ya. EZRAB dikembangkan secara aktif — perbaikan data AHSP, peningkatan AI, dan fitur baru dirilis bertahap dan diumumkan melalui situs serta Blog EZRAB. Masukan pengguna dari Kotak Saran menjadi salah satu bahan pertimbangan prioritas pengembangannya.',
    keywords: ['pembaruan', 'update', 'dikembangkan', 'fitur baru', 'roadmap'],
    status: 'VERIFIED_ACTIVE',
    lastReviewedAt: REVIEWED,
  },
];

/** Subset FAQ untuk halaman /fitur (urutan tampil mengikuti daftar ini). */
export const FAQ_FITUR_IDS: string[] = [
  'mengenal-apa-itu-ezrab',
  'mengenal-siapa-pengguna',
  'ai-perbedaan-chat-ded',
  'ahsp-2026',
  'ai-harga-material-otomatis',
  'ahsp-harga-belum-tersedia',
  'ai-langsung-diterapkan',
  'mengenal-berbasis-web',
  'akun-sudah-dibuka',
  'akun-berlangganan',
];

export const getFeaturedFaqs = (): FaqItem[] => FAQ_ITEMS.filter((f) => f.featured);

export const getFaqsByIds = (ids: string[]): FaqItem[] =>
  ids
    .map((id) => FAQ_ITEMS.find((f) => f.id === id))
    .filter((f): f is FaqItem => Boolean(f));

/** Normalisasi teks pencarian: huruf kecil, spasi tunggal, tanpa tanda baca tepi. */
export const normalizeFaqText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const faqSearchHaystack = (item: FaqItem): string =>
  normalizeFaqText(
    [item.question, item.answer, FAQ_CATEGORY_LABEL[item.category] ?? '', ...item.keywords].join(' ')
  );

/**
 * Pencarian FAQ murni (tanpa jaringan): cocokkan SEMUA kata kunci query
 * terhadap pertanyaan + jawaban + nama kategori + keywords item.
 * `categoryId` 'semua' berarti tanpa filter kategori.
 */
export function searchFaqs(query: string, categoryId: string = 'semua'): FaqItem[] {
  const pool =
    categoryId === 'semua' ? FAQ_ITEMS : FAQ_ITEMS.filter((f) => f.category === categoryId);
  const tokens = normalizeFaqText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return pool;
  return pool.filter((item) => {
    const haystack = faqSearchHaystack(item);
    return tokens.every((t) => haystack.includes(t));
  });
}

/**
 * JSON-LD FAQPage — HANYA untuk item yang benar-benar tampil di halaman
 * (halaman /faq menampilkan seluruh dataset). Jangan dipakai di halaman
 * lain agar tidak terjadi duplikasi structured data.
 */
export function buildFaqPageJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
