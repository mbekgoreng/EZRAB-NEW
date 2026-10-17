/**
 * /keunggulan — copy & data.
 * Semua klaim merujuk pada kemampuan aktual aplikasi. Tanpa statistik fiktif,
 * tanpa testimoni, tanpa persentase penghematan.
 */

export interface WorkflowStep {
  no: string;
  title: string;
  desc: string;
  tag: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    no: '01',
    title: 'Dokumen / Deskripsi',
    desc: 'Mulai dari gambar kerja, dokumen proyek, atau deskripsi pekerjaan yang Anda miliki.',
    tag: 'INPUT',
  },
  {
    no: '02',
    title: 'AI Assistance',
    desc: 'AI membantu membaca dokumen dan menyusun usulan item pekerjaan — selalu sebagai draf yang bisa ditinjau.',
    tag: 'BANTUAN AI',
  },
  {
    no: '03',
    title: 'QTO / Volume',
    desc: 'Kalkulator volume parametrik menghitung dari dimensi gambar: panjang, lebar, tinggi, diameter.',
    tag: 'HITUNG',
  },
  {
    no: '04',
    title: 'AHSP & Harga',
    desc: 'Setiap item dicocokkan dengan referensi AHSP 2026 dan database harga — lengkap dengan status sumbernya.',
    tag: 'REFERENSI',
  },
  {
    no: '05',
    title: 'RAB',
    desc: 'Volume × harga satuan tersusun menjadi RAB per divisi pekerjaan, siap direkap dan diekspor.',
    tag: 'OUTPUT',
  },
  {
    no: '06',
    title: 'Review / Output',
    desc: 'Anda meninjau, mengoreksi, dan menyetujui. Dokumen final: PDF, Excel, dan laporan proyek.',
    tag: 'VALIDASI',
  },
];

export interface PriceCategory {
  name: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  example: string;
}

export const PRICE_CATEGORIES: PriceCategory[] = [
  {
    name: 'Referensi Resmi',
    desc: 'Harga dari dokumen analisa resmi yang terdaftar di sistem, mis. AHSP 2026.',
    color: '#1D4ED8',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    example: 'AHSP 2026 · 5.792 item master',
  },
  {
    name: 'Referensi Pasar',
    desc: 'Harga pasar hasil kurasi — tercatat sebagai referensi, bukan harga resmi.',
    color: '#047857',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    example: 'Database harga material & upah',
  },
  {
    name: 'Asumsi',
    desc: 'Nilai asumsi yang ditandai jelas — terlihat sebagai asumsi di setiap tampilannya.',
    color: '#92400E',
    bg: '#FFFBEB',
    border: '#FDE68A',
    example: 'Selalu berlabel, tidak disamarkan',
  },
  {
    name: 'Input Manual',
    desc: 'Harga yang Anda isi sendiri — tercatat sebagai keputusan pengguna.',
    color: '#6D28D9',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    example: 'Tertulis atas nama Anda',
  },
  {
    name: 'Belum Tersedia',
    desc: 'Harga yang belum ada referensinya. Ditampilkan sebagai "belum diisi" — tidak pernah dianggap nol.',
    color: '#92400E',
    bg: '#FEF3C7',
    border: '#FCD34A',
    example: 'Bukan Rp0 · wajib diisi manual',
  },
];

export interface Ecostage {
  stage: string;
  desc: string;
  modules: string[];
}

export const ECOSYSTEM_STAGES: Ecostage[] = [
  {
    stage: 'Baca & Pahami',
    desc: 'Memahami dokumen dan kebutuhan proyek.',
    modules: ['DED Estimate AI', 'Ezrab Chat AI', 'Dokumen AI'],
  },
  {
    stage: 'Hitung Volume',
    desc: 'Mengubah dimensi gambar menjadi angka.',
    modules: ['QTO & 24 Kalkulator Volume', 'Kurva S & Schedule'],
  },
  {
    stage: 'Tentukan Harga',
    desc: 'Mencocokkan dengan referensi yang bisa ditelusur.',
    modules: ['AHSP 2026', 'Database Harga', 'Template RAB'],
  },
  {
    stage: 'Susun & Kelola',
    desc: 'Merakit RAB dan mengelola proyek berjalan.',
    modules: ['RAB & Estimasi', 'Manajemen Proyek', 'Keuangan & Termin', 'Laporan & Ekspor'],
  },
];

export interface Role {
  id: string;
  label: string;
  scenario: string;
  points: string[];
}

export const ROLES: Role[] = [
  {
    id: 'estimator',
    label: 'Estimator / QS',
    scenario:
      'Anda menerima gambar kerja pada Senin pagi dan RAB harus siap Jumat. EZRAB membantu memecah gambar menjadi item pekerjaan, menghitung volume dari dimensi, dan mencocokkannya dengan AHSP — sehingga waktu tersisa untuk memeriksa, bukan mengetik ulang.',
    points: [
      'Usulan item pekerjaan dari analisis gambar',
      'Volume dari dimensi, bukan tebakan',
      'Rantai harga yang bisa ditelusur per item',
    ],
  },
  {
    id: 'kontraktor',
    label: 'Kontraktor',
    scenario:
      'Penawaran harus kompetitif tapi tidak boleh rugi. EZRAB menyusun estimasi dari referensi yang jelas, lalu membantu memantau arus kas termin terhadap belanja aktual selama proyek berjalan.',
    points: [
      'Estimasi penawaran yang terstruktur',
      'Termin & arus kas terpantau',
      'Rekapitulasi siap presentasi ke owner',
    ],
  },
  {
    id: 'konsultan',
    label: 'Konsultan Perencana',
    scenario:
      'DED yang Anda susun perlu dilengkapi engineer’s estimate yang bisa dipertanggungjawabkan. Setiap angka di EZRAB membawa konteks sumbernya — memudahkan diskusi dengan owner maupun auditor.',
    points: [
      'Dokumentasi estimasi yang rapi',
      'Sumber harga terdokumentasi',
      'Ekspor laporan profesional',
    ],
  },
  {
    id: 'arsitek',
    label: 'Arsitek / Engineer',
    scenario:
      'Desain berubah — volume ikut berubah. Dengan kalkulator parametrik, revisi dimensi langsung menghitung ulang volume terkait tanpa mengulang dari nol.',
    points: [
      'Revisi dimensi → volume terhitung ulang',
      'Hubungan desain–estimasi terjaga',
      'Cek cepat kelayakan biaya desain',
    ],
  },
  {
    id: 'mahasiswa',
    label: 'Mahasiswa',
    scenario:
      'Belajar estimasi bukan sekadar menghafal rumus. EZRAB memperlihatkan alur lengkap: dari item pekerjaan, koefisien AHSP, sampai menjadi RAB — cara kerja yang sama dipakai di proyek nyata.',
    points: [
      'Alur estimasi end-to-end',
      'Memahami struktur AHSP',
      'Praktik dengan studi kasus',
    ],
  },
];

export const TRANSPARENCY_PRINCIPLES = [
  {
    title: 'Sumber harga harus jelas',
    desc: 'Setiap harga satuan membawa label sumbernya: resmi, pasar, asumsi, atau manual.',
  },
  {
    title: 'Satuan harus sesuai',
    desc: 'Satuan yang tidak kompatibel tidak dikalikan diam-diam — sistem menandainya untuk diperiksa.',
  },
  {
    title: 'Hasil AI dapat ditinjau',
    desc: 'Usulan AI selalu berupa draf. Tidak ada angka AI yang lolos tanpa persetujuan Anda.',
  },
  {
    title: 'Input manual dapat dibedakan',
    desc: 'Angka yang Anda isi tercatat sebagai keputusan pengguna, terpisah dari referensi sistem.',
  },
  {
    title: 'Yang belum ada, dikatakan belum ada',
    desc: 'Harga tanpa referensi tampil sebagai "belum diisi" — bukan nol, bukan angka karangan.',
  },
];

export const PROBLEMS = [
  {
    title: 'Data proyek tersebar',
    desc: 'Gambar di satu folder, harga di spreadsheet lain, termin di catatan terpisah. Estimasi disusun dari ingatan, bukan dari sumber yang terhubung.',
  },
  {
    title: 'Item vs referensi tidak cocok',
    desc: 'Pekerjaan di gambar harus dicocokkan manual dengan analisa harga yang sesuai. Satu kode salah, seluruh harga ikut salah.',
  },
  {
    title: 'Revisi dimensi = hitung ulang',
    desc: 'Desain berubah sedikit, volume harus dihitung ulang dari awal. Pekerjaan berulang yang memakan hari.',
  },
  {
    title: 'Harga tanpa konteks',
    desc: 'Angka di spreadsheet tidak bercerita dari mana asalnya. Saat ditanya owner, jawabannya "kira-kira".',
  },
  {
    title: 'Dokumen tidak konsisten',
    desc: 'RAB final, rekapitulasi, dan laporan dibuat terpisah — versinya berbeda-beda saat dibutuhkan.',
  },
];
