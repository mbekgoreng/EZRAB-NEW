/**
 * Konten halaman /fitur — "Kenali EZRAB".
 * Semua klaim angka merujuk pada implementasi yang terverifikasi.
 * Jangan menambah angka/klaim baru tanpa verifikasi di codebase.
 */

export interface EcosystemModule {
  id: string;
  name: string;
  desc: string;
  /** posisi di diagram: pusat rantai atau satelit */
  tier: 'core' | 'ai' | 'data' | 'output';
  status: 'live' | 'beta';
}

export const ECOSYSTEM_MODULES: EcosystemModule[] = [
  { id: 'proyek', name: 'Proyek', desc: 'Wadah kerja setiap estimasi: identitas, parameter, dan arsip.', tier: 'core', status: 'live' },
  { id: 'qto', name: 'Quantity Take-Off', desc: 'Ukur dari gambar kerja menjadi daftar volume pekerjaan.', tier: 'core', status: 'live' },
  { id: 'kalkulator', name: 'Kalkulator Volume', desc: '24 kalkulator parametrik bergambar untuk tiap jenis pekerjaan.', tier: 'core', status: 'live' },
  { id: 'rab', name: 'RAB & Estimasi', desc: 'Susun RAB, BOQ, dan rekapitulasi dalam satu alur.', tier: 'core', status: 'live' },
  { id: 'ded-ai', name: 'DED → RAB AI', desc: 'AI membaca gambar kerja dan mengusulkan draft item pekerjaan.', tier: 'ai', status: 'live' },
  { id: 'chat-ai', name: 'AI Chat', desc: 'Asisten percakapan untuk pertanyaan estimasi dan navigasi fitur.', tier: 'ai', status: 'live' },
  { id: 'dokumen-ai', name: 'Dokumen AI', desc: 'Analisis dan penyusunan dokumen proyek berbantuan AI.', tier: 'ai', status: 'live' },
  { id: 'ahsp', name: 'AHSP 2026', desc: '5.792 item analisa harga satuan resmi sebagai acuan.', tier: 'data', status: 'live' },
  { id: 'harga', name: 'Database Harga', desc: 'Harga material, upah, dan alat milik Anda sendiri.', tier: 'data', status: 'live' },
  { id: 'template', name: 'Template RAB', desc: 'Mulai dari template siap pakai per sektor konstruksi.', tier: 'data', status: 'live' },
  { id: 'kurva-s', name: 'Kurva S', desc: 'Progres fisik tertimbang bobot nilai, rencana vs aktual.', tier: 'output', status: 'live' },
  { id: 'laporan', name: 'Laporan', desc: 'Export Excel & PDF: RAB, BOQ, rekapitulasi.', tier: 'output', status: 'live' },
  { id: 'keuangan', name: 'Keuangan Proyek', desc: 'Catat pemasukan-pengeluaran per proyek.', tier: 'output', status: 'live' },
];

export interface ProblemItem {
  title: string;
  desc: string;
  how: string;
}

export const PROBLEMS: ProblemItem[] = [
  {
    title: 'Data proyek tersebar di banyak file',
    desc: 'Gambar, spreadsheet volume, file RAB, dan catatan harga tinggal di tempat berbeda. Mencari satu angka bisa makan waktu lama.',
    how: 'EZRAB menaruh proyek, QTO, RAB, dokumen, dan harga dalam satu workspace yang saling terhubung.',
  },
  {
    title: 'Penyusunan RAB penuh pekerjaan berulang',
    desc: 'Item yang mirip diketik ulang untuk setiap proyek. Rumus disalin antar sheet dan mudah rusak.',
    how: 'Template RAB siap pakai dan kalkulator parametrik menghitung dari dimensi — bukan dari ketikan ulang.',
  },
  {
    title: 'Mencocokkan item dengan AHSP butuh ketelitian',
    desc: 'Salah pilih kode analisa berarti salah harga satuan untuk seluruh volume item tersebut.',
    how: 'Library AHSP 2026 terintegrasi: pilih item pekerjaan, koefisien dan acuannya ikut terbawa.',
  },
  {
    title: 'Perubahan dimensi merembet ke mana-mana',
    desc: 'Revisi gambar membuat seluruh hitungan volume harus diperiksa satu per satu.',
    how: 'Ubah dimensi di kalkulator, volume dan RAB yang terhubung ikut menyesuaikan.',
  },
  {
    title: 'Estimasi, dokumen, dan data tidak konsisten',
    desc: 'Angka di laporan berbeda dengan angka di file kerja karena pembaruan tidak sinkron.',
    how: 'Satu sumber data: laporan dan export dibaca dari RAB yang sama dengan yang Anda kerjakan.',
  },
];

export interface DedStep {
  no: string;
  title: string;
  desc: string;
}

export const DED_STEPS: DedStep[] = [
  { no: '01', title: 'Masukkan deskripsi atau dokumen', desc: 'Jelaskan proyek Anda atau unggah gambar kerja yang didukung melalui alur Input DED AI.' },
  { no: '02', title: 'AI menyusun usulan item', desc: 'AI membaca dan mengusulkan daftar item pekerjaan beserta perkiraan volumenya sebagai draft.' },
  { no: '03', title: 'Pencocokan referensi', desc: 'Sistem membantu mencocokkan setiap item dengan referensi AHSP yang tersedia.' },
  { no: '04', title: 'Pemeriksaan volume & satuan', desc: 'Volume dan satuan melewati pemeriksaan konsistensi sebelum lanjut.' },
  { no: '05', title: 'Harga dari engine terverifikasi', desc: 'Harga dan koefisien dihitung dari AHSP dan database harga Anda — bukan dari AI.' },
  { no: '06', title: 'Anda meninjau & menyetujui', desc: 'Setiap angka bisa diklik untuk melihat dasarnya. Tidak ada yang masuk RAB tanpa persetujuan Anda.' },
];

export interface AiRole {
  name: string;
  when: string;
  desc: string;
  cta: string;
}

export const AI_ROLES: AiRole[] = [
  {
    name: 'AI Chat',
    when: 'Saat Anda bertanya',
    desc: 'Tanya soal alur kerja EZRAB, konsep estimasi, atau minta dijelaskan informasi yang tersedia. Menjawab dari data EZRAB sendiri, bukan dari hafalan model.',
    cta: 'Untuk: belajar fitur, memahami istilah, navigasi cepat.',
  },
  {
    name: 'DED → RAB AI',
    when: 'Saat Anda punya gambar kerja',
    desc: 'Membaca gambar/desain dan menyusun draft daftar pekerjaan. Fokus pada struktur pekerjaan dan volume perkiraan.',
    cta: 'Untuk: memulai RAB dari DED yang sudah ada.',
  },
  {
    name: 'Dokumen AI',
    when: 'Saat Anda punya dokumen',
    desc: 'Menganalisis dan membantu menyusun dokumen proyek — dengan riwayat proses yang bisa ditinjau.',
    cta: 'Untuk: mengolah dokumen menjadi insight.',
  },
];

export interface Audience {
  role: string;
  need: string;
  modules: string[];
}

export const AUDIENCES: Audience[] = [
  { role: 'Estimator & Quantity Surveyor', need: 'Menyusun volume dan RAB yang bisa dipertanggungjawabkan.', modules: ['Kalkulator Volume', 'QTO', 'AHSP 2026', 'RAB & Estimasi'] },
  { role: 'Kontraktor', need: 'Mengelola banyak proyek dan memantau biaya pelaksanaan.', modules: ['Manajemen Proyek', 'Keuangan Proyek', 'Kurva S', 'Laporan'] },
  { role: 'Konsultan Perencana', need: 'Menyusun estimasi dari DED secara terstruktur.', modules: ['DED → RAB AI', 'Template RAB', 'Dokumen AI'] },
  { role: 'Arsitek & Engineer Sipil', need: 'Menghubungkan desain dengan konsekuensi biayanya.', modules: ['DED → RAB AI', 'Kalkulator Volume', 'AI Chat'] },
  { role: 'Pelaksana Proyek', need: 'Mencatat progres dan keuangan di lapangan.', modules: ['Kurva S', 'Keuangan Proyek', 'Manajemen Proyek'] },
  { role: 'Mahasiswa Konstruksi', need: 'Belajar menyusun RAB dengan acuan yang benar.', modules: ['10 Tutorial Interaktif', 'AHSP 2026', 'Template RAB'] },
];

export const START_STEPS = [
  { no: '1', title: 'Kenali kebutuhan Anda', desc: 'Jelajahi halaman ini dan tentukan modul yang relevan dengan pekerjaan Anda.' },
  { no: '2', title: 'Mulai EZRAB', desc: 'Buka aplikasi — Anda langsung masuk ke workspace.' },
  { no: '3', title: 'Buat proyek pertama', desc: 'Ikuti tutorial terpandu; checklist proyek pertama memandu langkah demi langkah.' },
  { no: '4', title: 'Masukkan data atau dokumen', desc: 'Gunakan kalkulator, template, atau DED AI sesuai kebutuhan.' },
  { no: '5', title: 'Tinjau hasil', desc: 'Periksa sumber data, satuan, dan harga setiap angka penting.' },
  { no: '6', title: 'Simpan & export', desc: 'Export laporan ke Excel atau PDF saat RAB sudah final.' },
];

export const TRANSPARENCY = [
  {
    title: 'AI mengusulkan, sistem yang menghitung',
    desc: 'Draft dari AI selalu melewati engine deterministik EZRAB. Angka final = koefisien AHSP × harga Anda.',
  },
  {
    title: 'Setiap harga punya sumber',
    desc: 'Resmi, pasar, asumsi berlabel, atau belum tersedia — tidak ada angka yang dikarang diam-diam.',
  },
  {
    title: 'Satuan diperiksa, bukan ditebak',
    desc: 'Satuan yang tidak kompatibel tidak dikalikan diam-diam; ditandai agar Anda yang memutuskan.',
  },
  {
    title: 'Anda memegang persetujuan akhir',
    desc: 'Hasil AI tidak masuk RAB sebelum Anda meninjau dan menyetujui.',
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: 'Apa itu EZRAB?',
    a: 'EZRAB adalah aplikasi web untuk estimasi konstruksi: menghitung volume (QTO), menyusun RAB berbasis AHSP 2026, mengelola proyek, dan membuat laporan — dibantu AI yang transparan.',
  },
  {
    q: 'Siapa yang cocok menggunakan EZRAB?',
    a: 'Estimator, quantity surveyor, kontraktor, konsultan perencana, arsitek, engineer sipil, pelaksana proyek, hingga mahasiswa konstruksi yang belajar menyusun RAB.',
  },
  {
    q: 'Apa perbedaan AI Chat dan DED → RAB AI?',
    a: 'AI Chat adalah asisten percakapan untuk bertanya dan memahami fitur. DED → RAB AI membaca gambar kerja dan menyusun draft daftar pekerjaan. Keduanya berbeda modul dengan fungsi berbeda.',
  },
  {
    q: 'Bagaimana EZRAB menggunakan AHSP?',
    a: 'EZRAB memiliki library AHSP 2026 (5.792 item) yang terintegrasi dengan penyusunan RAB. Saat Anda memilih item pekerjaan, koefisien analisa harganya ikut terbawa sebagai acuan perhitungan.',
  },
  {
    q: 'Apakah harga dibuat oleh AI?',
    a: 'Tidak. AI hanya menyusun usulan item dan perkiraan volume. Harga final selalu dihitung dari koefisien AHSP dikali database harga material, upah, dan alat milik Anda.',
  },
  {
    q: 'Bagaimana jika harga atau referensi belum tersedia?',
    a: 'Item tersebut ditandai "belum tersedia" dan tidak diisi angka karangan — tidak pernah ditampilkan sebagai nol atau diklaim sebagai harga resmi.',
  },
  {
    q: 'Apakah hasil AI dapat diperiksa sebelum digunakan?',
    a: 'Ya. Setiap angka hasil AI bisa diklik untuk melihat dasar perhitungannya, dan tidak ada yang masuk ke RAB sebelum Anda meninjau dan menyetujui.',
  },
  {
    q: 'Apakah EZRAB bisa digunakan di HP?',
    a: 'Ya. EZRAB berjalan di browser, termasuk browser HP. Tampilan menyesuaikan layar kecil.',
  },
  {
    q: 'Bagaimana cara mulai menggunakan EZRAB?',
    a: 'Buka aplikasi dan Anda langsung masuk ke workspace. Ikuti tutorial terpandu dan checklist proyek pertama untuk mulai menyusun estimasi.',
  },
  {
    q: 'Bagaimana informasi mengenai paket dan harga?',
    a: 'Lihat bagian Harga di halaman utama untuk paket Free, Starter, dan Pro beserta batasannya.',
  },
  {
    q: 'Bagaimana keamanan data proyek?',
    a: 'Setiap proyek tersimpan terpisah di workspace Anda. Fitur AI hanya memakai ringkasan yang diperlukan untuk menjawab, bukan seluruh basis data Anda.',
  },
];

export const ANCHORS = [
  { id: 'mengapa', label: 'Mengapa EZRAB' },
  { id: 'ekosistem', label: 'Ekosistem' },
  { id: 'ded-ai', label: 'DED → RAB AI' },
  { id: 'qto', label: 'QTO' },
  { id: 'ahsp', label: 'AHSP 2026' },
  { id: 'untuk-siapa', label: 'Untuk Siapa' },
  { id: 'mulai', label: 'Cara Mulai' },
  { id: 'faq', label: 'FAQ' },
  { id: 'mulai-dari-sini', label: 'Mulai' },
];
