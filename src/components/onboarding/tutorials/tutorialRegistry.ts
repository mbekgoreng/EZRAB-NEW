/**
 * Feature Tutorial Registry — definisi terpusat untuk tutorial kontekstual EZRAB.
 *
 * Prinsip:
 * - Satu sumber kebenaran untuk semua tutorial fitur (tidak tersebar di komponen).
 * - Setiap tutorial punya ID stabil, versi, dan key persistensi sendiri.
 * - TIDAK mengubah key welcome tour (ezrab_onboarding_done_v1) atau migrasi Phase 2.
 * - Tutorial TIDAK auto-run saat login; hanya dibuka eksplisit oleh pengguna.
 * - Tutorial TIDAK menjalankan operasi bisnis (tidak membuat proyek, tidak menjalankan AI).
 */
import { paths } from '../../../routing/routes';

/** Status progres sebuah tutorial. 'skipped'/'closed' dibedakan dari 'completed'. */
export type TutorialStatus = 'not-started' | 'in-progress' | 'completed' | 'skipped';

/** Satu langkah tutorial. */
export interface TutorialStep {
  /** selector CSS target (mis. [data-tour="menu-projects"]). Boleh null = kartu tanpa spotlight. */
  target: string | null;
  title: string;
  body: string;
  /**
   * Route halaman tempat target berada (mis. paths.projects()).
   * Jika diisi dan route aktif berbeda, player otomatis navigasi ke route
   * ini lalu menunggu target muncul — langkah tidak lagi dilewati diam-diam.
   * Kosongkan untuk target yang ada di semua halaman (mis. sidebar).
   */
  route?: string;
  /**
   * Tab pengaturan yang harus aktif (khusus route /app/settings,
   * mis. 'help' untuk langkah yang menarget [data-tutorial-center]).
   */
  settingsTab?: string;
}

/** Kategori tutorial untuk Pusat Bantuan. */
export type TutorialCategory = 'proyek' | 'ai' | 'estimasi' | 'data' | 'laporan';

/** Definisi tutorial fitur. */
export interface FeatureTutorial {
  /** ID stabil, dipakai untuk key persistensi: ezrab_tutorial_<id> */
  id: string;
  title: string;
  description: string;
  category: TutorialCategory;
  /** route fitur terkait (untuk tombol "Buka Fitur") */
  route: string;
  /** menu id sidebar terkait (untuk selector) */
  menuId: string;
  steps: TutorialStep[];
  /** versi tutorial; naik saat konten berubah agar status lama tidak dianggap selesai */
  version: number;
  /** false = belum tersedia, tidak ditampilkan */
  available: boolean;
}

export const TUTORIAL_STATUS_LABEL: Record<TutorialStatus, string> = {
  'not-started': 'Belum dimulai',
  'in-progress': 'Sedang berjalan',
  completed: 'Selesai',
  skipped: 'Dilewati',
};

export const TUTORIAL_CATEGORY_LABEL: Record<TutorialCategory, string> = {
  proyek: 'Proyek',
  ai: 'AI',
  estimasi: 'Estimasi & RAB',
  data: 'Data & Referensi',
  laporan: 'Laporan',
};

// ---------------------------------------------------------------------------
// Definisi tutorial (5 prioritas Phase 4)
// ---------------------------------------------------------------------------

const TUTORIALS: Record<string, FeatureTutorial> = {
  proyek: {
    id: 'proyek',
    title: 'Membuat Proyek Pertama',
    description: 'Pelajari cara membuat proyek, memilih metode, mengisi identitas, dan membuka workspace.',
    category: 'proyek',
    route: paths.projects(),
    menuId: 'proyek',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="menu-proyek"]',
        title: 'Mulai dari Proyek',
        body: 'Semua pekerjaan di EZRAB berpusat pada proyek. Buka halaman Proyek untuk melihat daftar atau membuat yang baru.',
      },
      {
        target: '[data-tutorial="proyek-create"]',
        route: paths.projects(),
        title: 'Buat Proyek Baru',
        body: 'Klik tombol "Buat Proyek" untuk memulai. Kamu akan diminta memilih metode pembuatan terlebih dahulu.',
      },
      {
        target: '[data-tutorial="proyek-method"]',
        route: paths.projects(),
        title: 'Pilih Metode Pembuatan',
        body: 'Tersedia beberapa metode: Magic AI (dibantu AI), Manual (isi sendiri), Volume Calculation (dari hitungan volume), atau Template (dari template RAB). Pilih yang paling sesuai dengan kebutuhanmu.',
      },
      {
        target: '[data-tutorial="proyek-method"]',
        route: paths.projects(),
        title: 'Isi Identitas Proyek',
        body: 'Lengkapi nama proyek, klien, lokasi, dan informasi dasar lainnya. Identitas ini akan tampil di laporan dan dokumen.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Buka Workspace',
        body: 'Setelah proyek dibuat, buka workspace-nya. Dari sini kamu dapat mengakses RAB, estimasi, QTO, dan semua fitur proyek.',
      },
      {
        target: '[data-tour="menu-rab-spreadsheet"]',
        title: 'Akses RAB & Estimasi',
        body: 'Menu RAB & Estimasi tersedia di sidebar setelah proyek aktif. Di sinilah kamu menyusun anggaran biaya.',
      },
    ],
  },

  'magic-ai': {
    id: 'magic-ai',
    title: 'Menggunakan Magic AI',
    description: 'Pelajari cara memberi instruksi yang jelas ke Magic AI dan meninjau hasilnya sebelum menyimpan.',
    category: 'ai',
    route: paths.magicAi(),
    menuId: 'magic-ai',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="menu-ded-ai"]',
        title: 'Buka Magic AI',
        body: 'Magic AI adalah asisten estimasi EZRAB. Kamu dapat membukanya dari halaman Proyek melalui tombol "Generate dengan AI", atau langsung via menu AI.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Tulis Instruksi yang Jelas',
        body: 'Jelaskan kebutuhan konstruksimumu dengan spesifik: jenis bangunan, ukuran, jumlah lantai, dan material yang diinginkan. Semakin jelas instruksi, semakin akurat hasilnya.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Pilih Jenis Konstruksi',
        body: 'Pastikan jenis konstruksi yang dipilih sesuai dengan UI yang tersedia. Pilihan ini memengaruhi analisis dan rekomendasi AI.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Periksa Parameter',
        body: 'Sebelum melanjutkan, periksa parameter yang digunakan AI: dimensi, satuan, dan asumsi. Sesuaikan jika ada yang tidak tepat.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Tinjau Hasil dengan Teliti',
        body: 'Hasil AI adalah titik awal, bukan angka final. Periksa setiap item: apakah volume masuk akal? Apakah harga satuannya wajar?',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Perbaiki Sebelum Menyimpan',
        body: 'Koreksi hasil yang kurang tepat sebelum menyimpan ke proyek. Kamu tetap memegang kendali penuh atas angka final.',
      },
    ],
  },

  'ded-rab': {
    id: 'ded-rab',
    title: 'DED to RAB dengan AI',
    description: 'Pelajari alur unggah DED, validasi hasil baca, pencocokan AHSP, hingga persetujuan eksplisit.',
    category: 'ai',
    route: paths.dedAiEstimate(),
    menuId: 'ded-ai',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="menu-ded-ai"]',
        title: 'Buka DED to RAB',
        body: 'Fitur ini mengubah Dokumen Engineering Design (DED) menjadi Rencana Anggaran Biaya dengan bantuan AI.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Unggah Dokumen DED',
        body: 'Unggah file DED (gambar kerja/denah). Pastikan dokumen jelas dan terbaca agar hasil ekstraksi akurat.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Periksa Hasil Pembacaan',
        body: 'AI akan membaca dan mengekstrak informasi dari dokumen. Periksa apakah semua elemen penting terbaca dengan benar.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Validasi Dimensi & Volume',
        body: 'Periksa dimensi, satuan, dan volume hasil ekstraksi. Kesalahan di tahap ini akan berdampak pada seluruh RAB.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Tinjau Pencocokan AHSP',
        body: 'AI mencocokkan item pekerjaan dengan AHSP 2026. Periksa kecocokan setiap item — pastikan kode dan uraian sesuai.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Tangani Item Belum Cocok',
        body: 'Item yang belum cocok atau harganya belum tersedia akan ditandai. Kamu dapat mencari manual atau mengisi harga sendiri dengan transparan.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Setujui Secara Eksplisit',
        body: 'AI membantu ekstraksi dan pencocokan, tetapi perhitungan final mengikuti database dan engine EZRAB. Setujui hasil hanya setelah kamu yakin semuanya benar.',
      },
    ],
  },

  'rab-volume': {
    id: 'rab-volume',
    title: 'RAB & Perhitungan Volume',
    description: 'Pelajari struktur RAB, volume, harga satuan, dan validasi sebelum ekspor.',
    category: 'estimasi',
    route: paths.estimate(),
    menuId: 'rab-spreadsheet',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="menu-rab-spreadsheet"]',
        title: 'Buka RAB Spreadsheet',
        body: 'RAB disusun dalam format spreadsheet yang familiar: baris per item pekerjaan, kolom untuk volume, harga, dan total.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Struktur Item Pekerjaan',
        body: 'Setiap item memiliki kode, uraian pekerjaan, satuan, volume, harga satuan, dan jumlah harga. Struktur ini mengikuti standar RAB konstruksi.',
      },
      {
        target: '[data-tour="menu-qto"]',
        title: 'Volume dari QTO',
        body: 'Volume dapat dihitung melalui QTO (Quantity Take-Off) atau diisi manual. Pastikan satuan volume sesuai dengan satuan harga.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Harga Satuan & Total',
        body: 'Harga satuan berasal dari AHSP atau harga pasar. Total = Volume × Harga Satuan. Periksa setiap angka sebelum lanjut.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Koreksi & Validasi',
        body: 'Koreksi data yang kurang tepat langsung di spreadsheet. Validasi hasil sebelum ekspor — pastikan tidak ada item yang terlewat atau angkanya janggal.',
      },
    ],
  },

  'ahsp-2026': {
    id: 'ahsp-2026',
    title: 'Mencari AHSP 2026',
    description: 'Pelajari cara mencari analisa harga satuan, membaca koefisien, dan memeriksa sumber harga.',
    category: 'data',
    route: paths.ahsp(),
    menuId: 'ahsp-2026',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="menu-ahsp-2026"]',
        title: 'Buka Database AHSP',
        body: 'AHSP (Analisa Harga Satuan Pekerjaan) 2026 adalah acuan resmi untuk harga satuan. Buka melalui menu Data & Referensi di sidebar.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Cari Kode atau Nama',
        body: 'Cari berdasarkan kode pekerjaan atau kata kunci nama pekerjaan. Gunakan kata kunci spesifik untuk hasil yang tepat.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Pilih Domain yang Tepat',
        body: 'AHSP terbagi per domain (mis. Cipta Karya, SDA, Bina Marga). Pastikan domain sesuai dengan jenis pekerjaanmu.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Baca Koefisien',
        body: 'Setiap item AHSP memiliki koefisien material, upah, dan alat. Koefisien menunjukkan kebutuhan per satuan pekerjaan.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Periksa Harga & Sumber',
        body: 'Periksa harga setiap komponen dan sumber datanya. Tidak semua item memiliki harga lengkap — item tanpa harga akan ditandai dengan jelas.',
      },
    ],
  },

  qto: {
    id: 'qto',
    title: 'Menghitung Volume (QTO)',
    description: 'Pelajari cara memilih kalkulator, mengisi dimensi, memeriksa hasil, dan memakai hasil ke RAB.',
    category: 'estimasi',
    route: paths.qto(),
    menuId: 'qto',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="menu-qto"]',
        title: 'Buka QTO',
        body: 'QTO (Quantity Take-Off) menghitung volume pekerjaan dari dimensi yang kamu masukkan. Buka melalui menu Volume & QTO.',
      },
      {
        target: '[data-tutorial="qto-calc"]',
        route: paths.volumeCalculation(),
        title: 'Pilih Jenis Perhitungan',
        body: 'Tersedia banyak kalkulator per jenis pekerjaan (mis. bowplank, pondasi, kolom). Pilih yang sesuai dengan pekerjaanmu.',
      },
      {
        target: '[data-tutorial="qto-calc"]',
        route: paths.volumeCalculation(),
        title: 'Isi Dimensi dengan Benar',
        body: 'Masukkan panjang, lebar, tinggi, dan parameter lain sesuai gambar kerja. Perhatikan satuan setiap kolom isian.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Pahami Satuan Hasil',
        body: 'Hasil volume mengikuti satuan standar (m, m², m³, kg, dll). Pastikan satuan hasil cocok dengan satuan di RAB.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Periksa Duplikasi & Peringatan',
        body: 'Periksa apakah ada perhitungan ganda atau peringatan validasi. Hasil yang janggal perlu dikoreksi sebelum dipakai.',
      },
      {
        target: '[data-tour="menu-rab-spreadsheet"]',
        title: 'Pakai Hasil ke RAB',
        body: 'Volume hasil QTO dapat dipakai ke RAB. Pastikan proyek aktif dipilih agar volume tersimpan di tempat yang benar.',
      },
    ],
  },

  'dokumen-ai': {
    id: 'dokumen-ai',
    title: 'Menggunakan AI Dokumen',
    description: 'Pelajari cara mengelola pustaka dokumen, menganalisis, membuat, dan meninjau riwayat dokumen.',
    category: 'ai',
    route: paths.dokumenAi(),
    menuId: 'dokumen-ai',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="menu-ded-ai"]',
        title: 'Buka AI Dokumen',
        body: 'AI Dokumen membantu mengelola dan menganalisis dokumen proyek. Buka melalui menu AI di sidebar.',
      },
      {
        target: '[data-tutorial="dokumenai-main"]',
        route: paths.dokumenAi(),
        title: 'Pustaka Dokumen',
        body: 'Tab Pustaka menyimpan semua dokumenmu (maksimal 50 dokumen). Dokumen tersimpan lokal di browser ini.',
      },
      {
        target: '[data-tutorial="dokumenai-main"]',
        route: paths.dokumenAi(),
        title: 'Analisis Dokumen',
        body: 'Pilih dokumen lalu buka tab Analisis untuk meminta AI membaca dan menyimpulkan isinya. Tab ini aktif setelah ada dokumen dipilih.',
      },
      {
        target: '[data-tutorial="dokumenai-main"]',
        route: paths.dokumenAi(),
        title: 'Buat Dokumen Baru',
        body: 'Tab Buat memungkinkanmu menyusun dokumen baru dengan bantuan AI, misalnya draft surat atau laporan.',
      },
      {
        target: '[data-tutorial="dokumenai-main"]',
        route: paths.dokumenAi(),
        title: 'Riwayat',
        body: 'Tab Riwayat mencatat aktivitas dokumenmu. Tinjau kembali pekerjaan sebelumnya kapan saja.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Tinjau Sebelum Pakai',
        body: 'Hasil AI adalah draf yang perlu ditinjau. Periksa kebenaran isi sebelum memakai dokumen untuk keperluan resmi.',
      },
    ],
  },

  'manajemen-proyek': {
    id: 'manajemen-proyek',
    title: 'Manajemen Proyek & Jadwal',
    description: 'Pelajari cara memantau progres, mengelola jadwal tugas, dan membaca Kurva-S proyek.',
    category: 'proyek',
    route: paths.management(),
    menuId: 'manajemen-proyek',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="sidebar"]',
        title: 'Buka Manajemen Proyek',
        body: 'Menu ini memantau pelaksanaan proyek: jadwal, progres, dan Kurva-S. Pilih proyek aktif terlebih dahulu.',
      },
      {
        target: '[data-tutorial="manajemen-main"]',
        route: paths.management(),
        title: 'Pantau Progres',
        body: 'Lihat ringkasan progres proyek di bagian atas: status keseluruhan dan indikator keterlambatan atau ketepatan jadwal.',
      },
      {
        target: '[data-tutorial="manajemen-main"]',
        route: paths.management(),
        title: 'Kelola Tugas Jadwal',
        body: 'Tambah, ubah, atau hapus tugas jadwal (schedule). Setiap tugas memiliki tanggal, durasi, dan status: tepat waktu, waspada, atau terlambat.',
      },
      {
        target: '[data-tutorial="manajemen-main"]',
        route: paths.management(),
        title: 'Baca Kurva-S',
        body: 'Kurva-S membandingkan rencana vs realisasi dari waktu ke waktu. Deviasi negatif berarti progres di bawah rencana — perlu perhatian.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Data Tersimpan per Proyek',
        body: 'Jadwal dan progres tersimpan per proyek. Pastikan proyek yang benar sedang aktif sebelum mengubah data.',
      },
    ],
  },

  laporan: {
    id: 'laporan',
    title: 'Membuat Laporan Proyek',
    description: 'Pelajari cara meninjau laporan, mengatur format, dan mengekspor ke Excel atau PDF.',
    category: 'laporan',
    route: paths.reports(),
    menuId: 'laporan',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="sidebar"]',
        title: 'Buka Laporan',
        body: 'Menu Laporan menyajikan seluruh laporan proyek secara terstruktur: RAB, BOQ, rekapitulasi, dan lainnya.',
      },
      {
        target: '[data-tutorial="laporan-main"]',
        route: paths.reports(),
        title: 'Tinjau Isi Laporan',
        body: 'Periksa kelengkapan data: item pekerjaan, volume, harga, dan total. Laporan mengikuti data proyek yang aktif.',
      },
      {
        target: '[data-tutorial="laporan-main"]',
        route: paths.reports(),
        title: 'Atur Format Laporan',
        body: 'Sesuaikan pengaturan laporan: format tampilan, kop, dan opsi lain sebelum mengekspor.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Ekspor ke Excel / PDF',
        body: 'Ekspor laporan ke Excel untuk olah data lanjut, atau ke PDF untuk dokumen resmi. Tunggu hingga proses ekspor selesai.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Pastikan Data Final',
        body: 'Laporan mencerminkan kondisi data saat diekspor. Pastikan RAB dan volume sudah final sebelum mengekspor versi resmi.',
      },
    ],
  },

  pengaturan: {
    id: 'pengaturan',
    title: 'Pengaturan & Pusat Bantuan',
    description: 'Pelajari cara mengatur aplikasi, mengulang tutorial, dan menemukan bantuan.',
    category: 'proyek',
    route: paths.settings(),
    menuId: 'pengaturan',
    version: 2,
    available: true,
    steps: [
      {
        target: '[data-tour="sidebar"]',
        title: 'Buka Pengaturan',
        body: 'Pengaturan mengelola preferensi aplikasi, informasi proyek, dan akses ke pusat bantuan.',
      },
      {
        target: '[data-tutorial-center]',
        route: paths.settings(),
        settingsTab: 'help',
        title: 'Pusat Bantuan & Tutorial',
        body: 'Tab Bantuan berisi FAQ dan seluruh Tutorial Fitur. Cari tutorial berdasarkan kata kunci atau telusuri per kategori.',
      },
      {
        target: '[data-tutorial-center]',
        route: paths.settings(),
        settingsTab: 'help',
        title: 'Ulangi Tutorial Kapan Saja',
        body: 'Setiap tutorial dapat diulang tanpa batas. Status (belum dimulai / berjalan / selesai / dilewati) tercatat per tutorial.',
      },
      {
        target: '[data-tour="help"]',
        title: 'Bantuan Cepat',
        body: 'Tombol bantuan di bilah atas memberi akses cepat ke panduan, shortcut keyboard, dan dukungan teknis.',
      },
      {
        target: '[data-tour="dashboard"]',
        route: paths.dashboard(),
        title: 'Data Tersimpan Lokal',
        body: 'Progres tutorial tersimpan di browser ini (localStorage). Menghapus data browser akan mengatur ulang progres.',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Akses registry
// ---------------------------------------------------------------------------

export function getTutorial(id: string): FeatureTutorial | undefined {
  const t = TUTORIALS[id];
  return t && t.available ? t : undefined;
}

export function listTutorials(): FeatureTutorial[] {
  return Object.values(TUTORIALS).filter((t) => t.available);
}

export function listTutorialsByCategory(category: TutorialCategory): FeatureTutorial[] {
  return listTutorials().filter((t) => t.category === category);
}

export function searchTutorials(query: string): FeatureTutorial[] {
  const q = query.trim().toLowerCase();
  if (!q) return listTutorials();
  return listTutorials().filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      TUTORIAL_CATEGORY_LABEL[t.category].toLowerCase().includes(q)
  );
}

export function getTutorialCategories(): TutorialCategory[] {
  const seen = new Set<TutorialCategory>();
  for (const t of listTutorials()) seen.add(t.category);
  return [...seen];
}

// ---------------------------------------------------------------------------
// Persistensi (key terpisah per tutorial; tidak menyentuh key Phase 2)
// ---------------------------------------------------------------------------

const TUTORIAL_KEY_PREFIX = 'ezrab_tutorial_';

export interface TutorialProgress {
  status: TutorialStatus;
  version: number;
  updatedAt: string;
}

function tutorialKey(id: string): string {
  return `${TUTORIAL_KEY_PREFIX}${id}`;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}

export function getTutorialProgress(id: string): TutorialProgress {
  const tutorial = TUTORIALS[id];
  const fallback: TutorialProgress = {
    status: 'not-started',
    version: tutorial?.version ?? 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    const raw = safeGet(tutorialKey(id));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    // Versi berubah → anggap belum dimulai (konten mungkin berbeda)
    if (typeof parsed.version !== 'number' || parsed.version !== (tutorial?.version ?? 1)) {
      return fallback;
    }
    const valid: TutorialStatus[] = ['not-started', 'in-progress', 'completed', 'skipped'];
    return {
      status: valid.includes(parsed.status as TutorialStatus) ? (parsed.status as TutorialStatus) : 'not-started',
      version: tutorial?.version ?? 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
    };
  } catch {
    return fallback;
  }
}

export function setTutorialStatus(id: string, status: TutorialStatus): void {
  const tutorial = TUTORIALS[id];
  if (!tutorial) return;
  const progress: TutorialProgress = {
    status,
    version: tutorial.version,
    updatedAt: new Date().toISOString(),
  };
  safeSet(tutorialKey(id), JSON.stringify(progress));
}

/** Reset progres satu tutorial (perilaku eksplisit). */
export function resetTutorialProgress(id: string): void {
  safeRemove(tutorialKey(id));
}

/** Event untuk membuka tutorial dari mana saja. */
export const OPEN_TUTORIAL_EVENT = 'ezrab:open-tutorial';

/** Event untuk membuka tab pengaturan tertentu. Detail: { tab: string }. */
export const OPEN_SETTINGS_TAB_EVENT = 'ezrab:open-settings-tab';

export function openSettingsTab(tab: string): void {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_TAB_EVENT, { detail: { tab } }));
  } catch {
    /* abaikan */
  }
}

export function openTutorial(id: string): void {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_TUTORIAL_EVENT, { detail: { tutorialId: id } }));
  } catch {
    /* abaikan */
  }
}
