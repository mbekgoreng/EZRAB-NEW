/**
 * REGIONAL PRICE SOURCES — Remediasi Sumber Terpercaya (2026-11-06)
 * ====================================================================
 * Harga hasil riset web dari sumber terpercaya (laporan:
 * ~/workspace/research_notes/ezrab-unresolved-component-prices-2026-20261106-0735/report.md),
 * disambungkan ke registry identitas kanonis sebagai tautan harga
 * BER-PROVENANCE PENUH. Setiap entri menyimpan: harga, satuan, jenis
 * sumber, penerbit, judul dokumen, tahun/tanggal, wilayah berlaku,
 * URL sumber, dan tanggal akses riset.
 *
 * ATURAN TAKSONOMI (keputusan tercatat):
 * - HSPK Pemda (Perbup/Perwali) = harga resmi PEMERINTAH DAERAH, kelas
 *   provenance `OFFICIAL_HSPK_REGIONAL` — BUKAN `OFFICIAL_AHSP_2026`.
 *   AHSP 2026 nasional (SE 47/2026 & resolver resmi) adalah kelas yang
 *   berbeda dan tidak pernah dicampur dengan entri di berkas ini.
 * - Harga daftar supplier = `MARKET_REFERENCE` dengan atribusi penuh
 *   (penerbit + tanggal daftar + wilayah). Bukan harga resmi.
 *
 * ATURAN WILAYAH (keputusan tercatat; DIPERBARUI 2026-11-06 oleh
 * Master Price Coverage Completion §5 — perintah owner):
 * - Resolver kalkulator menerima `projectProvince` opsional (dari
 *   Project.province proyek aktif):
 *     · provinsi cocok dengan provinsi sumber → harga regional dipakai
 *       sebagai kelas aslinya (HSPK daerah / pasar), ditandai lokal.
 *     · provinsi tidak diketahui (tak ada proyek aktif / provinsi belum
 *       diisi) → harga regional TETAP dipakai, tetapi hasil ditandai
 *       `regionalPriceAssumption = true` dan penjelasan menyebut bahwa
 *       harga memakai asumsi wilayah sumber + instruksi memilih proyek
 *       berprovinsi itu. Asumsi ini EKSPLISIT dan tampak di UI/probe —
 *       bukan penyebaran diam-diam.
 *     · provinsi diketahui BERBEDA → harga TIDAK lagi ditolak. Harga
 *       dipakai sebagai MARKET_REFERENCE lintas-wilayah: provenance
 *       diturunkan menjadi MARKET_REFERENCE (harga HSPK wilayah lain
 *       pun TIDAK diklaim sebagai harga resmi lokal), hasil ditandai
 *       `crossRegion = true` + `sourceRegion`, dan penjelasan memuat
 *       catatan "Harga referensi berasal dari … Belum diverifikasi
 *       sebagai harga lokal proyek …". Asal wilayah TIDAK dihapus,
 *       TIDAK ada faktor transport/penyesuaian yang dikarang, dan
 *       pengguna dapat menggantinya dengan penawaran lokal.
 * - Presedensi yang TIDAK berubah: AHSP 2026 nasional > HSPK provinsi
 *   yang sama > pasar (termasuk lintas-wilayah) > estimasi kalkulator.
 *   Di dalam registry ini, tautan dinilai: wilayah sama dulu, lalu
 *   sumber nasional (provinceScope null), lalu lintas-wilayah; di
 *   tingkat yang sama HSPK mendahului pasar.
 *
 * PUTARAN 2 (Master Price Coverage Completion, 2026-11-06): tautan
 * tambahan dari laporan riset pasar putaran 2
 * (~/workspace/research_notes/ezrab-market-prices-round2-2026-20261106-1023/report.md).
 * Setiap entri putaran 2 membawa `confidence`: VERIFIED_LIVE (halaman
 * sumber dibuka peneliti) atau INDEX_ONLY (hanya teks indeks pencarian
 * — keyakinan lebih rendah, dinyatakan eksplisit di provenance hasil).
 * - Untuk sumber nasional/online tanpa provinsi asal yang bermakna
 *   (mis. supplier online nasional), provinceScope = null dan harga
 *   berlaku tanpa batas wilayah. Supplier yang menyebut area layanan
 *   (Jabodetabek, Jatim) tetap diberi provinceScope sesuai areanya.
 *
 * WILAYAH di dalam satu dokumen (Pamekasan punya kolom Wilayah 1/2/3):
 * hanya nilai yang dinyatakan riset (Wilayah 1 = primer) yang dipakai;
 * varian sub-wilayah lain TIDAK ditebak pemetaannya ke proyek.
 *
 * KESELAMATAN HARGA: nilai yang oleh riset berupa RENTANG, per jam,
 * per meter (untuk komponen per batang), per kg (untuk komponen per m³),
 * anomali, atau tak terverifikasi TIDAK dimasukkan ke berkas ini sama
 * sekali — daftar penolakannya ada di laporan remediasi.
 */

export type RegionalSourceKind = 'OFFICIAL_HSPK' | 'MARKET_SUPPLIER';

export interface RegionalPriceSource {
  /** Harga per satuan record (IDR), persis seperti sumber. */
  price: number;
  /** Satuan record persis seperti sumber (gerbang satuan tetap berlaku). */
  unit: string;
  /** OFFICIAL_HSPK → provenance OFFICIAL_HSPK_REGIONAL; MARKET_SUPPLIER → MARKET_REFERENCE. */
  kind: RegionalSourceKind;
  /** Penerbit dokumen / nama supplier. */
  publisher: string;
  /** Judul dokumen / daftar harga persis seperti sumber. */
  documentTitle: string;
  /** Tahun/tanggal dokumen (teks, mis. "15 Juni 2026"). */
  documentDate: string;
  /** Nama wilayah asal harga seperti tertulis di sumber. */
  regionLabel: string;
  /**
   * Provinsi (nama kanonis indonesiaRegions) tempat harga berlaku.
   * null = tanpa batas wilayah (sumber nasional/online).
   */
  provinceScope: string | null;
  /** URL sumber persis. */
  url: string;
  /** Tanggal riset mengakses sumber (ISO date). */
  accessedAt: string;
  /** Catatan spek/batas pemakaian dari riset (ditampilkan di provenance). */
  note?: string;
  /**
   * Tingkat keyakinan bukti riset (putaran 2): VERIFIED_LIVE = halaman
   * sumber benar-benar dibuka peneliti; INDEX_ONLY = hanya teks indeks
   * pencarian (halaman tidak dibuka) — keyakinan lebih rendah dan
   * dinyatakan eksplisit di penjelasan hasil. Entri putaran 1 yang
   * tidak mengisi field ini diverifikasi langsung saat implementasi.
   */
  confidence?: 'VERIFIED_LIVE' | 'INDEX_ONLY';
  /** Status pajak persis seperti dinyatakan sumber (mis. "Termasuk PPN 11%"). */
  taxNote?: string;
  /**
   * Catatan keterbatasan KEASLIAN sumber (audit Price Integrity Gate
   * 2026-11-06): diisi bila salinan yang diakses peneliti TIDAK dengan
   * sendirinya membuktikan keaslian dokumen primer (mis. salinan pada
   * platform unggahan pihak ketiga tanpa nomor instrumen penerbit).
   * Teks ini diteruskan resolver ke penjelasan hasil — keterbatasannya
   * tampil di titik keputusan harga, tidak hanya di berkas ini.
   */
  authenticityNote?: string;
  /**
   * Bila komponen menyatakan mutu dalam K sedangkan sumber menyatakan
   * f'c: dasar pemetaan K↔f'c terdokumentasi yang mengizinkan entri ini.
   */
  gradeMappingNote?: string;
}

export interface RegionalPriceLink {
  /** Kode identitas kanonis (canonicalResources.ts) yang dilayani entri ini. */
  resourceCode: string;
  source: RegionalPriceSource;
}

const ACCESSED = '2026-11-06';

/** Dokumen resmi yang dipakai berulang — didefinisikan sekali agar konsisten. */
export const HSPK_PAMEKASAN_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Pamekasan',
  documentTitle: 'Peraturan Bupati Pamekasan Nomor 25 Tahun 2026 tentang Perubahan atas Peraturan Bupati Nomor 45 Tahun 2025 tentang Harga Satuan Pokok Kegiatan Tahun Anggaran 2026',
  documentDate: '15 Juni 2026',
  regionLabel: 'Kabupaten Pamekasan, Jawa Timur',
  provinceScope: 'Jawa Timur',
  url: 'https://jdih.pamekasankab.go.id/jdihdokum/upload/2773/PERBUP_NOMOR_25_TAHUN_2026-PERUBAHAN_ATAS_PERBUP_N.pdf',
  accessedAt: ACCESSED,
};
export const HSPK_GUNUNGKIDUL_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Gunungkidul',
  documentTitle: 'Peraturan Bupati Gunungkidul Nomor 46 Tahun 2025 tentang Harga Satuan Pokok Kegiatan dan Analisis Standar Belanja Tahun Anggaran 2026',
  documentDate: '2025 (berlaku 1 Januari 2026)',
  regionLabel: 'Kabupaten Gunungkidul, DI Yogyakarta',
  provinceScope: 'DI Yogyakarta',
  url: 'https://peraturan.bpk.go.id/Download/411860/Perbup%20Gunungkidul%20Nomor%2046%20Tahun%202025.pdf',
  accessedAt: ACCESSED,
};
export const HSPK_TEGAL_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Tegal',
  documentTitle: 'Peraturan Bupati Tegal Nomor 20 Tahun 2026 tentang Perubahan Kedua atas Peraturan Bupati Nomor 26 Tahun 2025 tentang Standar Harga Satuan Tahun Anggaran 2026 (Lampiran II)',
  documentDate: '20 Juli 2026',
  regionLabel: 'Kabupaten Tegal, Jawa Tengah',
  provinceScope: 'Jawa Tengah',
  url: 'https://jdih.tegalkab.go.id/index.php/file-view/produk-hukum?file=1785719867_2026pb3328020%20%282%29.pdf',
  accessedAt: ACCESSED,
};
export const HSPK_SIKKA_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Sikka',
  documentTitle: 'Peraturan Bupati Sikka Nomor 18 Tahun 2025 tentang Standar Harga Satuan Tahun Anggaran 2026',
  documentDate: '10 Oktober 2025',
  regionLabel: 'Kabupaten Sikka, Nusa Tenggara Timur',
  provinceScope: 'Nusa Tenggara Timur',
  url: 'https://bpkad.sikkakab.go.id/dokplan/327887Perbup_18_2025_Sikka_SHS_TA_2026.pdf',
  accessedAt: ACCESSED,
};
export const HSPK_CIREBON_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kota Cirebon',
  documentTitle: 'Peraturan Wali Kota Cirebon Nomor 21 Tahun 2025 tentang Standar Harga Satuan Pemerintah Daerah Tahun Anggaran 2026',
  documentDate: '2025 (TA 2026)',
  regionLabel: 'Kota Cirebon, Jawa Barat',
  provinceScope: 'Jawa Barat',
  url: 'https://literasihukum.com/peraturan/334133/standar-harga-satuan-pemerintah-daerah-tahun-anggaran-2026?download=1',
  accessedAt: ACCESSED,
};

/**
 * CATATAN AUDIT KEASLIAN (Price Integrity Gate, 2026-11-06): sumber ini
 * adalah SALINAN pada platform unggahan pihak ketiga (Scribd). Peneliti
 * membuka dan membaca salinan itu (baris harga terverifikasi ADA di
 * salinan — itulah arti confidence VERIFIED_LIVE di tautan-tautannya),
 * TETAPI salinan tersebut tidak mencantumkan nomor peraturan/instrumen
 * penerbit dan bukan saluran publikasi resmi (bukan JDIH/situs Pemkot),
 * sehingga keaslian dokumen primernya TIDAK terbukti dari bukti yang
 * tersedia. Berbeda dengan Pamekasan/Bandung/Cirebon di berkas ini yang
 * mencantumkan nomor peraturan + domain resmi. Keterbatasan ini
 * dinyatakan lewat `authenticityNote` (tampil di penjelasan resolver);
 * implementasi harga TIDAK dihapus dan TIDAK diganti sumber karangan —
 * keputusan menerima/mengganti sumber ini adalah keputusan owner.
 */
export const HSPK_SURABAYA_2025: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel' | 'authenticityNote'> = {
  publisher: 'Pemerintah Kota Surabaya',
  documentTitle: 'HSPK Kota Surabaya 2025 — Daftar Harga Bahan & Upah',
  documentDate: '2025',
  regionLabel: 'Kota Surabaya, Jawa Timur',
  provinceScope: 'Jawa Timur',
  url: 'https://id.scribd.com/document/592518471/HSPK-SURABAYA',
  accessedAt: ACCESSED,
  authenticityNote: 'Salinan dokumen diakses lewat Scribd (platform unggahan pihak ketiga) dan baris harganya dibaca langsung dari salinan itu; nomor peraturan penerbit dan saluran publikasi resmi tidak tertera pada salinan, sehingga keaslian dokumen primer belum terverifikasi dari sumber resmi (JDIH/situs Pemkot Surabaya).',
};
export const HSPK_BANDUNG_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Bandung',
  documentTitle: 'Peraturan Bupati Bandung tentang Harga Satuan Pokok Kegiatan dan Analisis Standar Belanja Tahun Anggaran 2026 (Lampiran I)',
  documentDate: '2025 (TA 2026)',
  regionLabel: 'Kabupaten Bandung, Jawa Barat',
  provinceScope: 'Jawa Barat',
  url: 'https://simbangun.bandungkab.go.id/peraturan/05 PERBUP HSPK ASB TA 2026.pdf',
  accessedAt: ACCESSED,
};
export const HSPK_PESISIR_SELATAN_2024: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Pesisir Selatan (HSPK 2024, direproduksi Jurnal Syntax Literate)',
  documentTitle: 'Analisa Komparatif Perkerasan MDP 2024 — Tabel Harga Satuan Pokok Pekerjaan HSPK Kab. Pesisir Selatan 2024',
  documentDate: '2024',
  regionLabel: 'Kabupaten Pesisir Selatan, Sumatera Barat',
  provinceScope: 'Sumatera Barat',
  url: 'https://jurnal.syntaxliterate.co.id/index.php/syntax-literate/article/download/57907/11326',
  accessedAt: ACCESSED,
};

export const HSPK_SLEMAN_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Sleman',
  documentTitle: 'Peraturan Bupati Sleman Nomor 104 Tahun 2025 — Lampiran I, Analisis Standar Belanja (HSPK) Tahun Anggaran 2026',
  documentDate: '2025 (TA 2026)',
  regionLabel: 'Kabupaten Sleman, DI Yogyakarta',
  provinceScope: 'DI Yogyakarta',
  url: 'https://Peraturan.BPK.go.id/Download/406495/Perbup%20Sleman%20Nomor%20104%20Tahun%202025_Lampiran.pdf',
  accessedAt: ACCESSED,
};
export const HSPK_BANTUL_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Bantul',
  documentTitle: 'Keputusan Bupati Bantul Nomor 526 Tahun 2025 tentang Standar Harga Satuan Konstruksi Tahun Anggaran 2026',
  documentDate: '30 Juni 2025 (TA 2026)',
  regionLabel: 'Kabupaten Bantul, DI Yogyakarta',
  provinceScope: 'DI Yogyakarta',
  url: 'https://jdih.bantulkab.go.id/resource/doc/public/produk_hukum/2025/keputusan-bupati-2025-526.pdf',
  accessedAt: ACCESSED,
};
export const SHS_GUNUNGKIDUL_2025: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Gunungkidul',
  documentTitle: 'Peraturan Bupati Gunungkidul Nomor 22 Tahun 2024 tentang Standar Harga Satuan (SHS Barang Bahan Konstruksi) Tahun Anggaran 2025',
  documentDate: '2024 (TA 2025)',
  regionLabel: 'Kabupaten Gunungkidul, DI Yogyakarta',
  provinceScope: 'DI Yogyakarta',
  url: 'https://peraturan.bpk.go.id/Download/369928/PERBUP Nomor 22 Tahun 2024_3.pdf',
  accessedAt: ACCESSED,
};
export const HSPK_SAMBAS_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Sambas',
  documentTitle: 'Peraturan Bupati Sambas Nomor 31 Tahun 2025 tentang Harga Satuan Pokok Kegiatan Tahun Anggaran 2026',
  documentDate: '2025 (TA 2026)',
  regionLabel: 'Kabupaten Sambas, Kalimantan Barat',
  provinceScope: 'Kalimantan Barat',
  url: 'https://jdih.sambas.go.id/common/dokumen/Perbup_31_2025 Salinan.pdf',
  accessedAt: ACCESSED,
};
export const SSH_CIANJUR_2026: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel'> = {
  publisher: 'Pemerintah Kabupaten Cianjur',
  documentTitle: 'Peraturan Bupati Cianjur Nomor 55 Tahun 2025 tentang Standar Satuan Harga Tahun Anggaran 2026',
  documentDate: '2025 (TA 2026)',
  regionLabel: 'Kabupaten Cianjur, Jawa Barat',
  provinceScope: 'Jawa Barat',
  url: 'https://editor.cianjurkab.go.id/uploads/PERATURAN_BUPATI_NOMOR_55_TAHUN_2025_TENTANG_SSH_TAHUN_ANGGARAN_2026_36dc08cba5.pdf',
  accessedAt: ACCESSED,
};
/**
 * Salinan dokumen resmi pada platform pihak ketiga (Scribd) — perlakuan
 * sama dengan HSPK_SURABAYA_2025: baris harga dibaca dari teks indeks atas
 * salinan itu (INDEX_ONLY), keaslian dokumen primer dinyatakan terbatas
 * lewat authenticityNote. Keputusan akhir = owner.
 */
export const SSH_MAKASSAR_2024: Pick<RegionalPriceSource, 'publisher' | 'documentTitle' | 'documentDate' | 'url' | 'accessedAt' | 'provinceScope' | 'regionLabel' | 'authenticityNote'> = {
  publisher: 'Pemerintah Kota Makassar',
  documentTitle: 'Standar Satuan Harga Bahan Bangunan Konstruksi Kota Makassar Tahun 2024 (salinan Scribd)',
  documentDate: '2024',
  regionLabel: 'Kota Makassar, Sulawesi Selatan',
  provinceScope: 'Sulawesi Selatan',
  url: 'https://www.scribd.com/document/797474965/2024-Data-Standar-Satuan-Harga-Bahan-Bangunan-Konstruksi-Makassar',
  accessedAt: ACCESSED,
  authenticityNote: 'Salinan dokumen diakses lewat Scribd (platform unggahan pihak ketiga); baris harga dibaca dari teks indeks atas salinan itu. Saluran publikasi resmi (JDIH Pemkot Makassar) tidak dibuka pada riset ini, sehingga keaslian dokumen primer belum terverifikasi dari sumber resmi.',
};

export const REGIONAL_PRICE_LINKS: RegionalPriceLink[] = [
  // ------------------------------------------------------------ FORMWORK_OIL
  {
    resourceCode: 'FORMWORK_OIL',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 6600, unit: 'liter', kind: 'OFFICIAL_HSPK',
      note: 'Sumber menyebut "Minyak Bekisting / Oli Bekas" — nilai Wilayah 1 (Wilayah 2 sama 6.600; Wilayah 3 = 6.100 tidak dipakai).',
    },
  },
  {
    resourceCode: 'FORMWORK_OIL',
    source: {
      ...HSPK_GUNUNGKIDUL_2026,
      price: 5000, unit: 'liter', kind: 'OFFICIAL_HSPK',
      note: 'Harga komponen di dalam analisis HSPK Gunungkidul TA 2026.',
    },
  },
  // ------------------------------------------------------------ DOLKEN_810_4M
  {
    resourceCode: 'DOLKEN_810_4M',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 33600, unit: 'batang', kind: 'OFFICIAL_HSPK',
      note: 'Spek persis: Kayu Dolken 8–10 (4 m). Nilai Wilayah 1 (Wilayah 2 = 35.100; Wilayah 3 = 36.200 tidak dipakai).',
    },
  },
  // ------------------------------------------------------------ PLYWOOD_12MM
  {
    resourceCode: 'PLYWOOD_12MM',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 214400, unit: 'lembar', kind: 'OFFICIAL_HSPK',
      note: 'Sumber: "Multiplek tebal 12 mm × 1,2 × 2,4 m" — ukuran lembar dinyatakan sumber. Nilai Wilayah 1 (Wilayah 2 = 255.500; Wilayah 3 = 257.000 tidak dipakai).',
    },
  },
  // ------------------------------------------------------------ NAIL_8_12CM (baru; mencakup Paku 12 cm & Paku 4 inch)
  {
    resourceCode: 'NAIL_8_12CM',
    source: {
      ...HSPK_GUNUNGKIDUL_2026,
      price: 18000, unit: 'kg', kind: 'OFFICIAL_HSPK',
      note: 'Sumber menyebut satu baris "Paku 8 s/d 12 cm" per kg — mencakup Paku 12 cm (ujung atas rentang) dan Paku 4 inch (≈10,16 cm, di dalam rentang). TIDAK ada harga 4 inch yang terpisah.',
    },
  },
  // ------------------------------------------------------------ SAND_CONCRETE
  {
    resourceCode: 'SAND_CONCRETE',
    source: {
      ...HSPK_CIREBON_2026,
      price: 301000, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'Diverifikasi ulang 2026-11-06 dengan membuka dokumen Perwali Cirebon 21/2025 (Lampiran I): "Pasir Beton — M3 — 301.000". Harga Pamekasan per kg (380/kg) SENGAJA tidak dipakai: UNIT_MISMATCH terhadap komponen per m³, tidak dikonversi.',
    },
  },
  // ------------------------------------------------------------ SAND_MASONRY (harga AHSP di dalam Perbup Pamekasan)
  {
    resourceCode: 'SAND_MASONRY',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 533800, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'Harga komponen "Pasir Pasang (Jawa)" di dalam analisis AHSP Perbup Pamekasan (Wilayah 2, Sumber Daya Air). Kelas tetap HSPK daerah — dokumennya adalah Perbup HSPK, bukan AHSP nasional.',
    },
  },
  // ------------------------------------------------------------ FOUNDATION_STONE_FILL (harga AHSP di dalam Perbup Sikka)
  {
    resourceCode: 'FOUNDATION_STONE_FILL',
    source: {
      ...HSPK_SIKKA_2026,
      price: 200300, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'Sumber: "Batu Kali/Batu Sungai — Batu Belah Pondasi (Terima Di Tempat)" — material landasan batu belah yang sama dengan komponen aanstamping/pasangan batu belah EZRAB. Basis penyerahan "terima di tempat" dinyatakan sumber. Berlaku NTT saja.',
    },
  },
  // ------------------------------------------------------------ AGGREGATE_SPLIT_23 (baru)
  {
    resourceCode: 'AGGREGATE_SPLIT_23',
    source: {
      ...HSPK_TEGAL_2026,
      price: 203000, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'Sumber: "Batu Kerikil dan Split, Beton (Split) 2/3" — fraksi 2/3 persis.',
    },
  },
  // ------------------------------------------------------------ ABU_BATU_JOINT_FILLER (baru)
  {
    resourceCode: 'ABU_BATU_JOINT_FILLER',
    source: {
      ...HSPK_TEGAL_2026,
      price: 195000, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'Harga material Abu Batu per m³. Sumber TIDAK menyatakan pemakaian "pengisi celah" — identitas komponen EZRAB memang bernama "Abu Batu Pengisi Celah (Joint Filler)" dengan satuan m³ yang sama; harga yang dipakai adalah harga material Abu Batu-nya.',
    },
  },
  {
    resourceCode: 'ABU_BATU_JOINT_FILLER',
    source: {
      ...HSPK_SIKKA_2026,
      price: 572200, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'Abu Batu Sikka — sebaran regional nyata terhadap Tegal (195.000); TIDAK dirata-rata.',
    },
  },
  // ------------------------------------------------------------ READYMIX_K350 (f'c 30 MPa HSPK + pasar Jatim)
  {
    resourceCode: 'READYMIX_K350',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 1291000, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'Sumber menilai beton berdasarkan f\'c: "Beton Ready Mixed f\'c 30 MPa". Nilai Wilayah 1 (Wilayah 2 = 1.301.000; Wilayah 3 = 1.311.000 tidak dipakai).',
      gradeMappingNote: 'PEMETAAN K↔f\'c TERDOKUMENTASI: identitas READYMIX_K350 didefinisikan pada komponen yang menyatakan "K-350 / fc 30 MPa" (dan padanannya) — korespondensi K-350 ↔ f\'c 30 MPa adalah padanan baku yang juga dipakai keluarga sumber ini. Pemetaan hanya berlaku untuk identitas ini, bukan konversi umum K↔f\'c.',
    },
  },
  {
    resourceCode: 'READYMIX_K350',
    source: {
      publisher: 'Putra Niaga Readymix',
      documentTitle: 'Daftar Harga Beton Jayamix Jawa Timur',
      documentDate: 'November 2026',
      regionLabel: 'Jawa Timur',
      provinceScope: 'Jawa Timur',
      url: 'https://www.putraniagareadymix.com/2020/01/harga-beton-jayamix-jawa-timur.html',
      accessedAt: ACCESSED,
      price: 950000, unit: 'm³', kind: 'MARKET_SUPPLIER',
      note: 'Beton ready mix K 350, slump 12±2 cm; harga SUDAH termasuk PPN 11% menurut halaman sumber.',
      gradeMappingNote: 'Sumber menyatakan mutu langsung dalam K (K 350) — tidak ada pemetaan f\'c yang diperlukan.',
    },
  },
  // ------------------------------------------------------------ LEAN_CONCRETE_B0
  {
    resourceCode: 'LEAN_CONCRETE_B0',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 1127000, unit: 'm³', kind: 'OFFICIAL_HSPK',
      note: 'PERINGATAN SUMBER: dokumen menilai "Beton Ready Mixed f\'c 10 MPa" — TIDAK dilabeli "B0 / beton kurus". Entri ini adalah proksi kelas kuat yang sama (f\'c 10 MPa), bukan padanan nama. Nilai Wilayah 1 (Wilayah 2 = 1.137.000; Wilayah 3 = 1.147.000 tidak dipakai).',
      gradeMappingNote: 'PEMETAAN KELAS KUAT TERDOKUMENTASI: identitas LEAN_CONCRETE_B0 didefinisikan sebagai beton kurus/lantai kerja f\'c 10 MPa (B0). Sumber HSPK menyediakan kelas kuat yang sama (f\'c 10 MPa) tanpa label B0 — dipakai sebagai proksi kelas kuat dengan peringatan eksplisit ini.',
    },
  },
  // ------------------------------------------------------------ UDITCH_40X40 (baru)
  {
    resourceCode: 'UDITCH_40X40',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 480000, unit: 'buah', kind: 'OFFICIAL_HSPK',
      note: 'Sumber: U-Ditch 40×40×120 cm per BUAH (satu unit 120 cm), bukan per meter. Berlaku untuk semua wilayah di dokumen.',
    },
  },
  // ------------------------------------------------------------ COVER_UDITCH_40_LD (baru)
  {
    resourceCode: 'COVER_UDITCH_40_LD',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 165000, unit: 'buah', kind: 'OFFICIAL_HSPK',
      note: 'Sumber: "Tutup U-Ditch (LD) 40: 53 × 60 × 8 cm" — spek persis komponen (cover 40 light duty, panjang 0,60 m). Berlaku untuk semua wilayah di dokumen.',
    },
  },
  {
    resourceCode: 'COVER_UDITCH_40_LD',
    source: {
      publisher: 'Pratama Precast',
      documentTitle: 'Harga U Ditch Sidoarjo 2026',
      documentDate: '2026',
      regionLabel: 'Sidoarjo, Jawa Timur',
      provinceScope: 'Jawa Timur',
      url: 'https://pratamaprecast.com/product/harga-u-ditch-sidoarjo/',
      accessedAt: ACCESSED,
      price: 114000, unit: 'buah', kind: 'MARKET_SUPPLIER',
      note: '"Cover U-Ditch 400 LD" per pcs; harga BELUM termasuk PPN menurut catatan halaman sumber.',
    },
  },
  // ------------------------------------------------------------ MANHOLE_COVER_PRECAST (baru)
  {
    resourceCode: 'MANHOLE_COVER_PRECAST',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 1500000, unit: 'buah', kind: 'OFFICIAL_HSPK',
      note: 'Sumber: "Tutup Manhole Box Culvert Precast 100 × 100 × 30 cm" — beton pracetak, BUKAN ductile iron. Komponen EZRAB bernama "Cover Manhole Ductile / Precast": entri ini hanya menanggung varian PRECAST-nya; varian ductile tetap tanpa sumber (lihat laporan). Berlaku untuk semua wilayah di dokumen.',
    },
  },
  // ------------------------------------------------------------ STEEL_WF_PROFILE_KG (pasar persis + generik resmi)
  {
    resourceCode: 'STEEL_WF_PROFILE_KG',
    source: {
      publisher: 'konstruksi.online',
      documentTitle: 'Jual Besi WF — Daftar Harga',
      documentDate: 'Oktober 2026',
      regionLabel: 'Indonesia (supplier online)',
      provinceScope: null,
      url: 'https://konstruksi.online/jual/besi-wf/',
      accessedAt: ACCESSED,
      price: 15500, unit: 'kg', kind: 'MARKET_SUPPLIER',
      note: 'Ukuran penampang PERSIS komponen: WF 200×100×5,5×8 per kg. Cek silang riset: hargabeton.com Rp15.950/kg (Jabodetabek, Okt 2026) — tidak dipakai, satu sumber per entri.',
    },
  },
  {
    resourceCode: 'STEEL_WF_PROFILE_KG',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 17000, unit: 'kg', kind: 'OFFICIAL_HSPK',
      note: 'Sumber: "Besi Profil WF" GENERIK per kg — ukuran penampang TIDAK dinyatakan sumber, jadi entri ini adalah harga profil WF generik, bukan verifikasi ukuran 200×100×5,5×8. Nilai Wilayah 1 (Wilayah 2 = 17.200; Wilayah 3 = 17.600 tidak dipakai).',
    },
  },
  // ------------------------------------------------------------ PAINT_ZINCROMATE_PRIMER (baru)
  {
    resourceCode: 'PAINT_ZINCROMATE_PRIMER',
    source: {
      ...HSPK_PAMEKASAN_2026,
      price: 75000, unit: 'kg', kind: 'OFFICIAL_HSPK',
      note: 'Sumber mengeja "Cat Zyncromate" — cat dasar (primer) antikarat zincromate. Hanya porsi ZINCROMATE dari komponen gabungan "Zinkromate / Epoxy Primer" yang ditanggung entri ini; epoxy primer tetap tanpa sumber terpisah. Berlaku untuk semua wilayah di dokumen.',
    },
  },
  // ------------------------------------------------------------ ASPHALT_ACWC_TON (baru, pasar)
  {
    resourceCode: 'ASPHALT_ACWC_TON',
    source: {
      publisher: 'Pabrik Aspal Semarang (jasaaspalhotmix.web.id)',
      documentTitle: 'Daftar Harga Pabrik Aspal Semarang',
      documentDate: 'Berlaku 1 Oktober 2025',
      regionLabel: 'Semarang, Jawa Tengah',
      provinceScope: 'Jawa Tengah',
      url: 'https://jasaaspalhotmix.web.id/pabrik-aspal-semarang/',
      accessedAt: ACCESSED,
      price: 1710000, unit: 'ton', kind: 'MARKET_SUPPLIER',
      note: 'Aspal hotmix Laston AC-WC per ton. Alternatif riset: AMP Karawang Rp1.850.000/ton (Sep 2026, loco pabrik) dan AMP Hoki Bekasi "mulai Rp1.250.000/ton" (harga lantai, bukan harga pasti — ditolak sebagai entri). Tidak ada harga resmi HSPK/AHSP per ton untuk AC-WC.',
    },
  },
  // ------------------------------------------------------------ EQUIP_ASPHALT_FINISHER (baru, pasar)
  {
    resourceCode: 'EQUIP_ASPHALT_FINISHER',
    source: {
      publisher: 'PT Laksana Karya Indonesia',
      documentTitle: 'Daftar Sewa Alat Aspal (Tangerang/Bogor)',
      documentDate: '2026',
      regionLabel: 'Tangerang/Bogor, Banten–Jawa Barat',
      provinceScope: 'Banten',
      url: 'https://www.laksanakarya.co.id/sewa-alat-aspal-bogor.html',
      accessedAt: ACCESSED,
      price: 2800000, unit: 'sewa-hari', kind: 'MARKET_SUPPLIER',
      note: 'Sewa Asphalt Finisher per hari. Cek silang riset berupa RENTANG (Great Hotmix Jakarta Rp4.000.000–6.500.000/hari) — tidak dipakai sebagai harga. Ketentuan operator/bahan bakar berbeda per vendor; sumber ini tidak merincinya di kutipan riset.',
    },
  },
  // ------------------------------------------------------------ EQUIP_TANDEM_ROLLER (baru, pasar)
  {
    resourceCode: 'EQUIP_TANDEM_ROLLER',
    source: {
      publisher: 'PT Laksana Karya Indonesia',
      documentTitle: 'Daftar Sewa Alat Aspal (Tangerang/Bogor)',
      documentDate: '2026',
      regionLabel: 'Tangerang/Bogor, Banten–Jawa Barat',
      provinceScope: 'Banten',
      url: 'https://www.laksanakarya.co.id/sewa-alat-aspal-bogor.html',
      accessedAt: ACCESSED,
      price: 1800000, unit: 'sewa-hari', kind: 'MARKET_SUPPLIER',
      note: 'Sewa Tandem Roller per hari. Cek silang riset berupa rentang/satuan shift (Rp1.000.000 per 8 jam untuk 3 ton) — tidak dipakai.',
    },
  },

  // =====================================================================
  // PUTARAN 2 — Master Price Coverage Completion (2026-11-06).
  // Sumber satu-satunya: laporan riset pasar putaran 2 (lihat header).
  // =====================================================================

  // ------------------------------------------------- UPAH HSPK (Surabaya & Bandung)
  {
    resourceCode: 'LABOR_PEKERJA',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 150000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Pekerja" pada daftar harga bahan & upah HSPK Surabaya 2025.',
    },
  },
  {
    resourceCode: 'LABOR_PEKERJA',
    source: {
      ...HSPK_BANDUNG_2026,
      price: 133000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Pekerja L.01" pada Lampiran I Perbup Bandung HSPK/ASB TA 2026.',
    },
  },
  {
    resourceCode: 'LABOR_MANDOR',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 215000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Mandor" pada DAFTAR HARGA bahan & upah HSPK Surabaya 2025 (tautan utama). KONFLIK SUMBER TERCATAT: Lampiran II Keputusan Walikota Surabaya (dokumen analisis pekerjaan) memuat Mandor Rp158.000/OH — nilai itu TIDAK dipakai dan TIDAK dirata-rata; daftar harga 2025 adalah basis yang dipilih sesuai arahan remediasi.',
    },
  },
  {
    resourceCode: 'LABOR_MANDOR',
    source: {
      ...HSPK_BANDUNG_2026,
      price: 181300, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Mandor L.04" pada Lampiran I Perbup Bandung HSPK/ASB TA 2026.',
    },
  },
  {
    resourceCode: 'LABOR_KEPALA_TUKANG',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 175000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Kepala Tukang" pada daftar harga bahan & upah HSPK Surabaya 2025.',
    },
  },
  {
    resourceCode: 'LABOR_KEPALA_TUKANG',
    source: {
      ...HSPK_BANDUNG_2026,
      price: 172200, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Kepala Tukang L.03" pada Lampiran I Perbup Bandung HSPK/ASB TA 2026.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_BATU',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 150000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Tukang Batu" pada daftar harga bahan & upah HSPK Surabaya 2025.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_KAYU',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 150000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Tukang Kayu" pada daftar harga bahan & upah HSPK Surabaya 2025.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_BESI',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 150000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Tukang Besi" pada daftar harga bahan & upah HSPK Surabaya 2025.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_GENERIC',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 150000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Dokumen yang sama memuat tiga baris terpisah — Tukang Besi, Tukang Kayu, Tukang Batu — SEMUANYA Rp150.000/OH; peran generik "Tukang" memakai tarif seragam itu.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_GENERIC',
    source: {
      ...HSPK_BANDUNG_2026,
      price: 157500, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris upah "Tukang L.02" (kode L.02 mencakup Tukang Kayu/Besi/Batu) pada Lampiran I Perbup Bandung HSPK/ASB TA 2026.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_BESI_KAYU',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 150000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris gabungan "Tukang Besi & Kayu": kedua perdagangan dihargai SAMA di dokumen ini (Tukang Besi Rp150.000 dan Tukang Kayu Rp150.000 per OH) — ekuivalensi persis, bukan harga satu bagian untuk bundel.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_BESI_KAYU',
    source: {
      ...HSPK_BANDUNG_2026,
      price: 157500, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Kode upah L.02 di dokumen ini secara eksplisit mencakup Tukang Kayu/Besi/Batu — mencakup kedua perdagangan pada baris gabungan ini.',
    },
  },
  {
    resourceCode: 'LABOR_TUKANG_KAYU_ALUMINIUM',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 175000, unit: 'OH', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Baris gabungan "Tukang Kayu / Aluminium" dihargai pada tarif "Tukang Aluminium" Rp175.000/OH dari dokumen yang sama (perdagangan berketerampilan lebih tinggi pada baris ini). Sebagai pembanding, "Tukang Kayu" pada dokumen yang sama Rp150.000/OH — keduanya dicatat agar pilihan tarif ini dapat diaudit.',
    },
  },

  // ------------------------------------------------- KAYUTimber & bekisting (Surabaya)
  {
    resourceCode: 'TIMBER_BEAM_57_MERANTI',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 3000000, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Kayu Meranti Usuk 4/6, 5/7" per m³ — ukuran 5/7 dinyatakan eksplisit.',
    },
  },
  {
    resourceCode: 'TIMBER_BOARD_320_MERANTI',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 3000000, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'ASUMSI TERCATAT: sumber memuat "Kayu Meranti Papan 2/20, 4/10" per m³ — ketebalan 3/20 TIDAK tercantum. Harga yang dipakai adalah tarif m³ kayu papan Meranti yang sama dari baris tersebut; perbedaan ketebalan 2/20 vs 3/20 tidak mengubah tarif per m³ pada daftar ini, tetapi ekuivalensinya adalah asumsi, bukan spek persis.',
    },
  },
  {
    resourceCode: 'FORMWORK_TIMBER_M3',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 3000000, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Kayu Meranti Bekisting" per m³ — label "kelas III" TIDAK dipakai sumber. EKUIVALENSI MATERIAL DOMINAN: nilai ini adalah tarif kayu bekisting per m³ untuk baris "Papan Bekisting + Kayu Dolken Penyangga" yang memang dihitung per m³ volume kayu; dolken penyangganya TIDAK dihargai terpisah di dalam tarif ini (dokumen yang sama memuat Dolken gelam Ø8–10 cm P4m Rp11.500/batang — satuan berbeda, tidak digabung).',
    },
  },

  // ------------------------------------------------- PASIR & AGREGAT (Surabaya/Bandung)
  {
    resourceCode: 'SAND_MASONRY_SIEVED',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 160000, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Pasir Pasang/Plester" per m³. ASUMSI TERCATAT: kata "Ayak" (sudah diayak) TIDAK dinyatakan sumber; yang dipakai adalah tarif Pasir Pasang dari dokumen ini.',
    },
  },
  {
    resourceCode: 'SAND_MASONRY_SIEVED',
    source: {
      ...HSPK_BANDUNG_2026,
      price: 230400, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Pasir Pasang M.54" per m³ — wilayah kedua untuk Pasir Pasang (kata "Ayak" juga tidak dinyatakan di sini).',
    },
  },
  {
    resourceCode: 'AGGREGATE_CRUSHED_UNSPEC',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 275000, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'EKUIVALENSI TERCATAT (kebijakan cakupan praktis owner, putaran 2): dokumen memuat "Batu Pecah Mesin 2/3 cm" Rp275.000/m³ (dan 1/2 cm Rp278.000/m³) sebagai baris batu pecah mesin bakunya. Komponen "Batu split" tanpa gradasi dihargai dengan baris 2/3 ini — gradasi baku batu pecah mesin pada daftar HSPK — dengan catatan ini; BUKAN lagi ditahan tanpa harga seperti putaran 1.',
    },
  },

  // ------------------------------------------------- BESI BETON per batang & per kg (Jayasteel + HSPK Surabaya)
  {
    resourceCode: 'REBAR_BAR_16MM',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Update Harga Besi Beton SNI Terbaru 2026',
      documentDate: 'September 2026',
      regionLabel: 'Jawa Timur (distributor melayani pengiriman se-Jawa Timur)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/p/update-harga-besi-beton-sni-terbaru.html',
      accessedAt: ACCESSED,
      price: 161950, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Besi beton POLOS Ø16 × 12 m per batang (18,94 kg/batang). Peran utama/support pada komponen memakai diameter yang sama → harga batang yang sama. Varian ulir Ø16 pada halaman yang sama Rp162.900/batang — tidak dipakai untuk komponen polos.',
    },
  },
  {
    resourceCode: 'REBAR_BAR_13MM',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Update Harga Besi Beton SNI Terbaru 2026',
      documentDate: 'September 2026',
      regionLabel: 'Jawa Timur (distributor melayani pengiriman se-Jawa Timur)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/p/update-harga-besi-beton-sni-terbaru.html',
      accessedAt: ACCESSED,
      price: 107500, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Besi beton ULIR Ø13 × 12 m per batang (12,50 kg/batang). CATATAN SPEK: pada daftar ini Ø13 HANYA dijual sebagai ulir (tidak ada varian polos Ø13) — komponen alas/pembentuk Ø13 dihargai dengan satu-satunya produk Ø13 yang ada di sumber.',
    },
  },
  {
    resourceCode: 'REBAR_BAR_10MM',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Update Harga Besi Beton SNI Terbaru 2026',
      documentDate: 'September 2026',
      regionLabel: 'Jawa Timur (distributor melayani pengiriman se-Jawa Timur)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/p/update-harga-besi-beton-sni-terbaru.html',
      accessedAt: ACCESSED,
      price: 63300, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Besi beton POLOS Ø10 × 12 m per batang. Peran sengkang/kait/support pada komponen memakai diameter yang sama → harga batang yang sama. Varian ulir Ø10 Rp63.650/batang pada halaman yang sama — tidak dipakai.',
    },
  },
  {
    resourceCode: 'REBAR_BAR_8MM',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Update Harga Besi Beton SNI Terbaru 2026',
      documentDate: 'September 2026',
      regionLabel: 'Jawa Timur (distributor melayani pengiriman se-Jawa Timur)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/p/update-harga-besi-beton-sni-terbaru.html',
      accessedAt: ACCESSED,
      price: 40450, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Besi beton POLOS Ø8 × 12 m per batang.',
    },
  },
  {
    resourceCode: 'REBAR_BAR_6MM',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Update Harga Besi Beton SNI Terbaru 2026',
      documentDate: 'September 2026',
      regionLabel: 'Jawa Timur (distributor melayani pengiriman se-Jawa Timur)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/p/update-harga-besi-beton-sni-terbaru.html',
      accessedAt: ACCESSED,
      price: 23550, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Besi beton POLOS Ø6 × 12 m per batang.',
    },
  },
  {
    resourceCode: 'REBAR_BAR_12MM',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Update Harga Besi Beton SNI Terbaru 2026',
      documentDate: 'September 2026',
      regionLabel: 'Jawa Timur (distributor melayani pengiriman se-Jawa Timur)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/p/update-harga-besi-beton-sni-terbaru.html',
      accessedAt: ACCESSED,
      price: 91100, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Besi beton POLOS Ø12 × 12 m per batang.',
    },
  },
  {
    resourceCode: 'REBAR_MAIN_D12_KG',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 13500, unit: 'kg', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Besi Beton Polos/Ulir" Rp13.500/kg. KONFLIK HARGA TERCATAT: distributor Jayasteel menjual besi beton per kg Rp8.550 (tautan pasar pada identitas yang sama) — presedensi resmi menang, kedua nilai TIDAK dirata-rata. Dokumen HSPK ini juga memuat baris "Besi tulangan polos" Rp8.400/kg; baris generik Polos/Ulir yang dipakai di sini adalah baris yang mencakup kedua jenis tulangan utama.',
    },
  },
  {
    resourceCode: 'REBAR_MAIN_D12_KG',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Update Harga Besi Beton SNI Terbaru 2026',
      documentDate: 'September 2026',
      regionLabel: 'Jawa Timur (distributor melayani pengiriman se-Jawa Timur)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/p/update-harga-besi-beton-sni-terbaru.html',
      accessedAt: ACCESSED,
      price: 8550, unit: 'kg', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Harga jual distributor besi beton per kg (Ø12 polos Rp8.550/kg). KONFLIK dengan HSPK Surabaya Rp13.500/kg pada identitas yang sama — presedensi resmi menang; nilai pasar ini tersimpan sebagai pembanding, tidak dirata-rata.',
    },
  },

  // ------------------------------------------------- BAJA RINGAN & SDS (pasar)
  {
    resourceCode: 'LIGHTSTEEL_C75_6M',
    source: {
      publisher: 'Agen Baja Ringan (supplier baja ringan)',
      documentTitle: 'Daftar Harga Baja Ringan November 2026',
      documentDate: 'November 2026',
      regionLabel: 'Indonesia (supplier online; orientasi Jabodetabek)',
      provinceScope: null,
      url: 'https://www.agenbajaringan.com/harga-baja-ringan.php',
      accessedAt: ACCESSED,
      price: 128000, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Truss C75.75 TASO, tebal 0,75 TCT, panjang 6 m — spek persis komponen (Kanal C75.75 panjang 6 m).',
    },
  },
  {
    resourceCode: 'LIGHTSTEEL_RENG_6M',
    source: {
      publisher: 'Agen Baja Ringan (supplier baja ringan)',
      documentTitle: 'Daftar Harga Baja Ringan November 2026',
      documentDate: 'November 2026',
      regionLabel: 'Indonesia (supplier online; orientasi Jabodetabek)',
      provinceScope: null,
      url: 'https://www.agenbajaringan.com/harga-baja-ringan.php',
      accessedAt: ACCESSED,
      price: 40000, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'ASUMSI PROFIL TERCATAT: sumber menyebut produk ini "Reng 30.45" (tinggi 30 mm, tebal 0,45, panjang 6 m) — BUKAN "U30". Ekuivalensi "U30" komponen ↔ reng tinggi 30 mm adalah penafsiran profil; huruf profil (U vs trapesium) tidak dinyatakan sumber.',
    },
  },
  {
    resourceCode: 'SDS_ROOFING',
    source: {
      publisher: 'CV. Era Santoso Abadi (Tokopedia)',
      documentTitle: 'Self Drilling Screw Baut Atap 12x60 Roofing Baja merk STAR',
      documentDate: 'September 2026 (tampilan halaman)',
      regionLabel: 'Kota Tangerang, Banten',
      provinceScope: 'Banten',
      url: 'https://www.tokopedia.com/erasantoso/self-drilling-screw-baut-atap-12x60-roofing-baja-merk-star',
      accessedAt: ACCESSED,
      price: 550, unit: 'buah', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'SDS STAR #12×60 mm, zinc yellow. Harga bertingkat penjual: Rp550/buah pada pembelian 50 pcs (Rp500 @100 pcs; Rp400 @300 pcs) — dipakai tingkat 50 pcs. ASUMSI TERCATAT: komponen EZRAB tidak menetapkan panjang sekrup; ukuran roofing baku 60 mm yang dipakai di sini.',
    },
  },

  // ------------------------------------------------- FINISHING & MEP (Surabaya)
  {
    resourceCode: 'GROUT_COLOR_CEMENT',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 16067, unit: 'kg', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Semen Berwarna (Yiyitan)" per kg — semen warna/nat ubin yang sama dengan komponen Semen Warna / Tile Grout.',
    },
  },
  {
    resourceCode: 'GLASS_PLAIN_5MM',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 87000, unit: 'm²', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Kaca Polos 5 mm" per m² — spek persis.',
    },
  },
  {
    resourceCode: 'GLASS_PLAIN_5MM',
    source: {
      ...HSPK_BANDUNG_2026,
      price: 200500, unit: 'm²', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Wilayah kedua untuk Kaca Polos 5 mm. SEBARAN REGIONAL BESAR terhadap Surabaya (87.000) — kedua nilai dilaporkan apa adanya, TIDAK dirata-rata; provinsi proyek menentukan yang dipakai.',
    },
  },
  {
    resourceCode: 'KUSEN_4IN',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 145000, unit: "m'", kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Alumunium Putih uk. 4x10, Profil 4 inch" per m\'. BATAS EKUIVALENSI: entri ini menanggung varian ALUMINIUM dari baris gabungan "Kusen Kayu Kamper / Aluminium 4 inch" — varian kayu kamper TIDAK punya harga di sumber ini. Nilai adalah harga MATERIAL PROFIL, bukan harga pekerjaan kusen jadi.',
    },
  },
  {
    resourceCode: 'CABLE_NYM_COMBINED',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 15600, unit: "m'", kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Kabel NYM 3x2,5 mm" per m\'. BATAS EKUIVALENSI: baris komponen menggabungkan DUA ukuran (3x2,5 dan 2x1,5); entri ini hanya menanggung ukuran 3x2,5. Ukuran 2x1,5 TIDAK ada di sumber (yang ada NYM 2x2,5 Rp11.600/m\' — ukuran berbeda, tidak dipakai).',
    },
  },
  {
    resourceCode: 'GYPSUM_LIST_PROFILE',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 18000, unit: "m'", kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "List Gypsum" per m\'. ASUMSI TERCATAT: lebar profil 7–10 cm pada komponen TIDAK dinyatakan sumber.',
    },
  },
  {
    resourceCode: 'FLOOR_DRAIN',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 84800, unit: 'unit', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Sumber: "Floor drain" per unit. ASUMSI TERCATAT: material stainless steel dan ukuran 4" pada komponen TIDAK dinyatakan pada baris sumber.',
    },
  },
  {
    resourceCode: 'PVC_PIPE_AW_34',
    source: {
      publisher: 'PT Wahana Duta Jaya Rucika (manufacturer pipa PVC)',
      documentTitle: 'Daftar Harga Pipa PVC Rucika',
      documentDate: '1 November 2026',
      regionLabel: 'Nasional (daftar harga manufacturer, Indonesia)',
      provinceScope: null,
      url: 'https://www.rucika.co.id/harga-pipa-pvc/',
      accessedAt: ACCESSED,
      price: 38200, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      taxNote: 'Termasuk PPN 11%',
      note: 'Rucika Standard AW 3/4" (DN20, OD 26 mm), panjang 4 m per batang — spek persis komponen. Harga SUDAH termasuk PPN 11% menurut daftar manufacturer.',
    },
  },
  {
    resourceCode: 'PVC_PIPE_AW_34',
    source: {
      ...HSPK_SURABAYA_2025,
      price: 37000, unit: 'batang', kind: 'OFFICIAL_HSPK', confidence: 'VERIFIED_LIVE',
      note: 'Pembanding regional: HSPK Surabaya memuat pipa PVC AW 3/4" 4 m GENERIK Rp37.000/batang (merek tidak dinyatakan) — menguatkan orde harga manufacturer Rucika.',
    },
  },

  // ------------------------------------------------- READY MIX pasar Malang (cadangan)
  {
    resourceCode: 'READYMIX_K300',
    source: {
      publisher: 'Putra Niaga Readymix',
      documentTitle: 'Daftar Harga Beton Jayamix Malang 2026',
      documentDate: '2026',
      regionLabel: 'Malang, Jawa Timur',
      provinceScope: 'Jawa Timur',
      url: 'https://www.putraniagareadymix.com/2017/01/harga-beton-jayamix-malang.html',
      accessedAt: ACCESSED,
      price: 925000, unit: 'm³', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      taxNote: 'Termasuk PPN 11%',
      note: 'Beton Jayamix K300, slump 12±2 cm; harga SUDAH termasuk PPN 11%. TAUTAN CADANGAN: jalur resmi/katalog identitas READYMIX_K300 tetap didahulukan — entri ini hanya dipakai bila jalur nasional gagal.',
    },
  },

  // ------------------------------------------------- BINA MARGA (Pesisir Selatan, INDEX_ONLY, basis terpasang)
  {
    resourceCode: 'LPA_CLASS_A',
    source: {
      ...HSPK_PESISIR_SELATAN_2024,
      price: 1187827, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      note: 'KEYAKINAN LEBIH RENDAH (INDEX_ONLY): nilai dibaca dari indeks pencarian atas reproduksi jurnal tabel HSPK — dokumen HSPK aslinya tidak dibuka pada riset ini. BASIS HARGA: ini harga POKOK PEKERJAAN (terpasang) per m³ dari tabel HSPK, BUKAN harga material lepas — sesuai konteks komponen Bina Marga "Lapis Pondasi Agregat Kelas A" yang memang item pekerjaan terpasang.',
    },
  },
  {
    resourceCode: 'LPB_CLASS_B',
    source: {
      ...HSPK_PESISIR_SELATAN_2024,
      price: 903151, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      note: 'KEYAKINAN LEBIH RENDAH (INDEX_ONLY): nilai dibaca dari indeks pencarian atas reproduksi jurnal tabel HSPK — dokumen HSPK aslinya tidak dibuka pada riset ini. BASIS HARGA: harga POKOK PEKERJAAN (terpasang) per m³, bukan harga material lepas.',
    },
  },
  {
    resourceCode: 'PRIME_COAT',
    source: {
      ...HSPK_PESISIR_SELATAN_2024,
      price: 25427, unit: 'liter', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      note: 'KEYAKINAN LEBIH RENDAH (INDEX_ONLY): nilai dibaca dari indeks pencarian atas reproduksi jurnal tabel HSPK. "Lapis Resap Pengikat" adalah padanan Bina Marga untuk prime coat (aspal cair/emulsi) dan dinilai per liter pada tabel sumber — satuan sama dengan komponen.',
    },
  },

  // ------------------------------------------------- PRECAST & SDA (pasar, INDEX_ONLY)
  {
    resourceCode: 'UDITCH_60X60',
    source: {
      publisher: 'CV. Mandiri Jaya Beton',
      documentTitle: 'Harga U-Ditch Precast Jabodetabek 2026',
      documentDate: '23 September 2026',
      regionLabel: 'Jabodetabek',
      provinceScope: 'DKI Jakarta',
      url: 'https://www.solusibetonreadymix.com/harga-jual-u-ditch/',
      accessedAt: ACCESSED,
      price: 735000, unit: 'buah', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'U-Ditch 60×60×120 cm per buah, material saja (belum pemasangan). KEYAKINAN: INDEX_ONLY tetapi TERKOROBORASI tiga sumber pada angka yang sama (Indoprimacast Rp735.000; Indoprecast Rp734.790; ArthaPanel K-350 Rp734.000). Cakupan Jabodetabek direpresentasikan pada level provinsi sebagai DKI Jakarta.',
    },
  },
  {
    resourceCode: 'PAVING_BLOCK_K300_6CM',
    source: {
      publisher: 'PavingBlock99 (pabrik paving)',
      documentTitle: 'Daftar Harga Paving Block Bantul 2026',
      documentDate: 'Oktober 2026',
      regionLabel: 'Bantul, DI Yogyakarta (franco truk, min. 50 m²)',
      provinceScope: 'DI Yogyakarta',
      url: 'https://pavingblock99.com/paving-block-bantul/',
      accessedAt: ACCESSED,
      price: 85000, unit: 'm²', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Paving bata (Truepave) abu natural tebal 6 cm, 44 pcs/m², franco Bantul min. 50 m². CATATAN MUTU: sumber menyatakan mutu sebagai RENTANG "K-250/K-300" — komponen meminta K-300; harga ini adalah harga produk bata natural 6 cm yang sama pada daftar tersebut. Terkoroborasi Rajasa Concrete (Bekasi) bata K300 6 cm Rp85.000/m².',
    },
  },
  {
    resourceCode: 'GABION_BASKET_2X1X05',
    source: {
      publisher: 'Duta Merpati (distributor, Surabaya)',
      documentTitle: 'Harga Kawat Bronjong 2x1x0.5',
      documentDate: 'November 2026',
      regionLabel: 'Surabaya, Jawa Timur',
      provinceScope: 'Jawa Timur',
      url: 'https://dutamerpati.com/product-tag/harga-kawat-bronjong-2x1x0-5-sluke',
      accessedAt: ACCESSED,
      price: 293500, unit: 'unit', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Keranjang bronjong galvanis 2×1×0,5 m per unit. CATATAN SPEK: diameter kawat dan ukuran anyaman TIDAK dinyatakan pada halaman sumber.',
    },
  },

  // ------------------------------------------------- GEOMEMBRAN per ketebalan (pasar nasional)
  {
    resourceCode: 'GEOMEMBRANE_HDPE',
    source: {
      publisher: 'PusatMaterial (distributor geomembran)',
      documentTitle: 'Daftar Harga Geomembrane',
      documentDate: 'Tanggal daftar tidak dinyatakan sumber (diakses riset 2026-11-06)',
      regionLabel: 'Indonesia (distributor nasional)',
      provinceScope: null,
      url: 'https://pusatmaterial.com/daftar-harga-geomembrane/',
      accessedAt: ACCESSED,
      price: 15000, unit: 'm²', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Geomembran HDPE ketebalan 1,0 mm per m² — harga TUNGGAL per ketebalan (bukan rentang). Komponen EZRAB menyatakan rentang 1,0–1,5 mm; harga yang dipakai untuk komponen itu adalah harga ketebalan 1,0 mm ini. Untuk ketebalan 1,5 mm sumber yang sama memuat Rp20.000/m² (tautan kedua pada identitas ini). Merek/standar (GRI-GM13) tidak dinyatakan sumber. CATATAN SEBARAN: daftar installer lain (PetraNe) memuat rentang jauh lebih tinggi untuk 1,5–2,0 mm — tidak dipakai (rentang) dan tidak dirata-rata.',
    },
  },
  {
    resourceCode: 'GEOMEMBRANE_HDPE',
    source: {
      publisher: 'PusatMaterial (distributor geomembran)',
      documentTitle: 'Daftar Harga Geomembrane',
      documentDate: 'Tanggal daftar tidak dinyatakan sumber (diakses riset 2026-11-06)',
      regionLabel: 'Indonesia (distributor nasional)',
      provinceScope: null,
      url: 'https://pusatmaterial.com/daftar-harga-geomembrane/',
      accessedAt: ACCESSED,
      price: 20000, unit: 'm²', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Geomembran HDPE ketebalan 1,5 mm per m² — sub-harga kedua pada identitas yang sama (komponen menyatakan rentang 1,0–1,5 mm). Resolver memakai sub-harga 1,0 mm (Rp15.000/m²) untuk komponen rentang; nilai 1,5 mm ini tersimpan agar ketebalan spesifik dapat dihargai bila komposisi kelak menyatakannya.',
    },
  },

  // ------------------------------------------------- SEWA ALAT per hari (pasar)
  {
    resourceCode: 'EQUIP_CONCRETE_CUTTER',
    source: {
      publisher: 'Buana Alat (rental alat teknik)',
      documentTitle: 'Daftar Harga Sewa Alat Teknik Balikpapan 2026',
      documentDate: '2026',
      regionLabel: 'Balikpapan, Kalimantan Timur',
      provinceScope: 'Kalimantan Timur',
      url: 'https://buanaalat.com/rental-alat-teknik/harga-sewa-alat-teknik-balikpapan/',
      accessedAt: ACCESSED,
      price: 695000, unit: 'sewa-hari', kind: 'MARKET_SUPPLIER', confidence: 'VERIFIED_LIVE',
      note: 'Sewa concrete cutter per hari / 8 jam — satuan persis komponen (sewa-hari), BUKAN konversi dari tarif per jam. Ukuran blade/mesin tidak dinyatakan sumber.',
    },
  },

  // ================================================ PUTARAN 3 (2026-11-06)
  // Penuntasan harga bersumber. CATATAN METODE PUTARAN 3: perkakas
  // browser.open mati total selama riset ini, sehingga SEMUA tautan
  // putaran 3 ber-confidence INDEX_ONLY — nilai dibaca dari teks indeks
  // pencarian atas dokumen/halaman penerbit yang teridentifikasi (judul,
  // nomor, domain resmi/URL persis tercatat), BUKAN dari halaman yang
  // dibuka penuh. Tidak ada satu pun harga putaran 3 yang diklaim
  // VERIFIED_LIVE. Harga turunan (bagi/panjang, kali cakupan, jumlah
  // bundel) selalu membawa aritmetikanya di `note`.

  // ------------------------------------- pekerjaan tanah & pasangan (HSPK)
  {
    resourceCode: 'FILL_SOIL_MATERIAL',
    source: {
      ...SHS_GUNUNGKIDUL_2025,
      price: 93750, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      taxNote: 'SHS barang bahan konstruksi: BELUM TERMASUK PAJAK (dinyatakan dokumen).',
      note: 'Baris sumber: "Tanah Urug" (tabel SHS barang) — bahan lepas, sesuai kategori komponen. Harga pekerjaan urugan (Sleman Rp71.605/m³) TIDAK dipakai karena basisnya pekerjaan, bukan bahan.',
    },
  },
  {
    resourceCode: 'FILL_BACKFILL_WORK',
    source: {
      ...HSPK_BANTUL_2026,
      price: 74400, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      taxNote: 'HSPK tidak termasuk pajak (Diktum KEDUA dokumen).',
      note: 'Baris sumber: "Pengurugan Kembali 1M3 galian Tanah" — pekerjaan terpasang. Kata "dipadatkan" pada nama komponen tidak tertulis eksplisit di baris sumber; urugan kembali adalah pekerjaan pemadatan bertahap menurut metode AHSP, tetapi batas ini dinyatakan apa adanya.',
    },
  },
  {
    resourceCode: 'SELECTED_FILL_WORK',
    source: {
      ...HSPK_SAMBAS_2026,
      price: 315146, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      note: 'Baris sumber: "Pengurugan 1 m3 dengan tanah Timbunan Pilihan" — pekerjaan terpasang. Kata "Berbutir" pada nama komponen tidak tertulis di sumber; yang dihargai adalah pekerjaan timbunan pilihan. Bahan lepas "Urugan pilihan" Rp207.200/m³ (SSH Hulu Sungai Tengah TA 2025) tercatat sebagai pembanding, tidak dipakai.',
    },
  },
  {
    resourceCode: 'STONE_MASONRY_14',
    source: {
      ...HSPK_SLEMAN_2026,
      price: 1178070, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      taxNote: 'Nilai kolom SEBELUM PPN (setelah PPN Rp1.307.657,70).',
      note: 'Baris sumber: "1.01.03.002 Pasangan pondasi batu kali 1:4" — harga PEKERJAAN terpasang per m³, sesuai sifat komponen "Pasangan" (bukan bahan lepas). Konteks dokumen adalah pekerjaan gedung (ASB Cipta Karya); varian drainase/revetment/kaki tebing memakai campuran 1:4 yang sama dan dihargai dari baris ini dengan batas konteks tersebut dinyatakan.',
    },
  },
  {
    resourceCode: 'JOINT_POINTING_12',
    source: {
      ...HSPK_GUNUNGKIDUL_2026,
      price: 50957.27, unit: 'm²', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      note: 'Baris sumber (seksi SDA): "1 m2 Pekerjaan siaran dengan mortar jenis M2 — Nilai HSPK 50.957,27". Mortar jenis M pada nomenklatur AHSP Bidang SDA = mortar tipe M setara campuran 1 PC : 2 PP, yaitu campuran 1:2 komponen ini. Dokumen yang sama memuat baris bernilai Rp50.386,49 pada seksi lain — nilai seksi SDA dipakai karena komponen ini berasal dari kalkulator SDA/drainase; selisihnya dinyatakan, tidak dirata-rata.',
    },
  },
  {
    resourceCode: 'SAND_FILL_SDA',
    source: {
      ...SHS_GUNUNGKIDUL_2025,
      price: 143000, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      taxNote: 'SHS barang: belum termasuk pajak (dinyatakan dokumen).',
      note: 'Baris sumber: "Pasir Isi [SDA] — pasir urug" (SHS TA 2025). Dipakai untuk fungsi alas bedding saluran: pasir pengisi SDA per m³. Ketebalan 10 cm pada nama komponen adalah parameter volume kalkulator, bukan spesifikasi harga. Batas dinyatakan: sumber tidak menulis kata "bedding".',
    },
  },
  {
    resourceCode: 'SAND_BEDDING_PAVING',
    source: {
      ...SSH_CIANJUR_2026,
      price: 250000, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      note: 'Baris sumber: "Pasir — Pasir Pasang — M3 — 250.000,00" (tabel bahan SSH). Dipakai untuk fungsi ALAS PAVING (bedding) komponen ini, yang materialnya pasir pasang. Klaim "Pasir Ekstra Beton" pada nama komponen TIDAK dihargai terpisah — bila yang dimaksud pasir beton, identitas SAND_CONCRETE (nasional) adalah komoditasnya.',
    },
  },
  {
    resourceCode: 'GRAVEL_GENERIC',
    source: {
      ...SHS_GUNUNGKIDUL_2025,
      price: 351600, unit: 'm³', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      taxNote: 'SHS barang: belum termasuk pajak (dinyatakan dokumen).',
      note: 'Baris sumber: "Batu — M07 Gravel — M3 — 351.600,00" (bahan lepas). Komponen adalah gravel untuk toe drain — materialnya gravel; fungsi drainase-porous adalah aplikasi, bukan komoditas berbeda. Gradasi khusus tidak dinyatakan kedua sisi.',
    },
  },
  {
    resourceCode: 'STEEL_PLATE_BJ37',
    source: {
      ...SSH_MAKASSAR_2024,
      price: 16800, unit: 'kg', kind: 'OFFICIAL_HSPK', confidence: 'INDEX_ONLY',
      note: 'Baris sumber: "Pelat Baja — Kg — 16.800,00". Mutu BJ37/SS400 pada nama komponen TIDAK tertulis di baris sumber (pelat baja generik) — batas dinyatakan. Pembanding pasar baja (bajastruktur.com, Jan 2026): pelat baja Rp16.000–21.000/kg untuk base plate/sambungan — konsisten, tidak dipakai menggantikan baris resmi.',
    },
  },

  // ------------------------------------- pasar riset putaran 3 (INDEX_ONLY)
  {
    resourceCode: 'WELDING_WIRE_E6013',
    source: {
      publisher: 'S-logam Teknik (etalase Tokopedia)',
      documentTitle: 'Daftar produk Tokopedia — Kawat Las Besi AWS E-6013 RD-460 3.2 mm Nikko Steel 1 KG',
      documentDate: 'diakses 2026-11-06 (daftar marketplace berjalan)',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/archive-s-logam/etalase/welding',
      accessedAt: ACCESSED,
      price: 42433, unit: 'kg', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Harga produk bernama persis: Nikko Steel RD-460 AWS E-6013 3,2 mm kemasan 1 KG = Rp42.433/kg. Hanya varian E6013 yang dihargai; varian E7018 pada nama komponen BELUM ada sumber per kg bertanggal (contoh lama Rp12.500/kg dari dokumen hitung biaya tak bertanggal ditolak). Satu daftar marketplace — kepastian lebih rendah, dinyatakan.',
    },
  },
  {
    resourceCode: 'DOOR_LEAF_TIMBER',
    source: {
      publisher: 'CV Mulya Abadi (supplier kusen & pintu kayu)',
      documentTitle: 'Harga Daun Pintu Panel Kayu Jakarta — daftar per m²',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'Jakarta, DKI Jakarta',
      provinceScope: 'DKI Jakarta',
      url: 'https://www.kusen-pintu-kayu.com/harga-daun-pintu-panel-kayu-jakarta/',
      accessedAt: ACCESSED,
      price: 750000, unit: 'm²', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Baris sumber: "Daun Pintu Panel Kayu Kamper Samarinda — Rp750.000/m²". Yang dihargai adalah daun pintu panel kayu kamper per m²; komponen generik "solid wood / engineering door" bervariasi menurut kayu (sumber yang sama: Meranti Rp500.000/m², Jati Rp2.500.000/m² — tidak dirata-rata). Harga pekerjaan HSPK Denpasar (pembuatan+pemasangan Rp1.381.630/m²) tidak dipakai karena komponen ini baris bahan.',
    },
  },
  {
    resourceCode: 'METAL_ROOF_TILE',
    source: {
      publisher: 'Central Atap Spandek (supplier atap)',
      documentTitle: 'Daftar Harga Genteng Metal Pasir per Lembar — November 2026 (Jabodetabek)',
      documentDate: 'November 2026',
      regionLabel: 'Jabodetabek',
      provinceScope: null,
      url: 'https://www.centralatapspandek.com/2018/11/harga-genteng-metal-pasir.html',
      accessedAt: ACCESSED,
      price: 61560, unit: 'm²', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'HARGA TURUNAN DARI BASIS YANG DINYATAKAN SUMBER: Genteng Metal Pasir 2x4 (77×80 cm, T 0,25) Rp38.000/lembar dan kebutuhan 1,62 lembar/m² menurut daftar yang sama → 38.000 × 1,62 = Rp61.560/m². Varian Genteng Beton pada nama komponen TIDAK tercakup daftar ini.',
    },
  },
  {
    resourceCode: 'GRANITE_TILE_60_DUS',
    source: {
      publisher: 'Daftar Tokopedia (granit Infiniti)',
      documentTitle: 'Daftar "Infiniti Rugao" — data diperbarui 6/11/2026',
      documentDate: '6 November 2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/find/infiniti-rugao',
      accessedAt: ACCESSED,
      price: 174990, unit: 'dus', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'MODEL BERNAMA (batas putaran 2 dinyatakan): INFINITI RUGAO GREY 60×60, isi 4 pcs/dus = 1,44 m²/dus, KW1 — Rp174.990/dus. Komponen tidak menyebut model; ini harga SATU model bernama pada ukuran yang dispesifikasi komponen, BUKAN harga generik semua granit 60×60 (rentang model tidak dirata-rata).',
    },
  },
  {
    resourceCode: 'CERAMIC_WALL_30X60_DUS',
    source: {
      publisher: 'Megabuilding (Tokopedia, Jakarta Pusat)',
      documentTitle: 'Keramik Dinding Roman dWeave Series 30x60 KW1 W63470R Perla — harga per dus',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'Jakarta, DKI Jakarta',
      provinceScope: 'DKI Jakarta',
      url: 'https://www.tokopedia.com/megabuilding/keramik-dinding-roman-dweave-series-30x60-kw-1-w63470r-perla-7522d?extParam=src%3Dshop%26whid%3D6919494&aff_unique_id=&channel=others&chain_key=',
      accessedAt: ACCESSED,
      price: 152000, unit: 'dus', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'MODEL BERNAMA: Roman dWeave W63470R Perla 30×60, KW1, isi 5 pcs/dus = 0,9 m²/dus — Rp152.000/dus ("Harga tersebut adalah Harga / Dus" dinyatakan penjual). Komponen tidak menyebut model; harga satu model bernama pada ukuran komponen, bukan generik.',
    },
  },
  {
    resourceCode: 'GRANITE_PLINTH',
    source: {
      publisher: 'PT Indo Jaya Granit (Tokopedia, Kab. Bogor)',
      documentTitle: 'List Plint Granite 10x60 Motif Daiva White by Arna — harga per pcs',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'Kabupaten Bogor, Jawa Barat',
      provinceScope: 'Jawa Barat',
      url: 'https://www.tokopedia.com/ptindo/list-keramik-plint-granite-10x60-motif-daiva-white-by-arna-termurah',
      accessedAt: ACCESSED,
      price: 25833, unit: "m'", kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'HARGA TURUNAN DARI PANJANG YANG DINYATAKAN PRODUK: plint granit 10×60 dijual Rp15.500/pcs ("harga tertera adalah harga per pcs ukuran 10x60"); satu pcs = 0,6 m\' → 15.500 / 0,6 = Rp25.833,33/m\', dibulatkan ke Rp25.833/m\'. Motif Daiva White — model lain dapat berbeda.',
    },
  },
  {
    resourceCode: 'GROUT_ANTIFUNGAL',
    source: {
      publisher: 'Daftar Tokopedia (Mortar Utama)',
      documentTitle: 'Daftar "MU Nat" — data diperbarui 1/11/2026',
      documentDate: '1 November 2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/find/mu-nat',
      accessedAt: ACCESSED,
      price: 58889, unit: 'kg', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Produk bernama sesuai spek komponen: MU-408 PowerPLUS pengisi nat "5 in 1 Anti Jamur Tahan Air & UV" kemasan 1 kg — Rp58.889/kg. Pembanding AM 51 anti jamur Rp65.556/kg tidak dipakai. Berbeda dari GROUT_COLOR_CEMENT (nat warna generik HSPK Rp16.067/kg) — komponen ini mensyaratkan anti jamur.',
    },
  },
  {
    resourceCode: 'HOLLOW_BUNDLE_4M',
    source: {
      publisher: 'TB. Surya Tedja (Indonetwork)',
      documentTitle: 'Daftar Harga Besi Hollow (Holo) — Ukuran, Panjang, Harga per Batang',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'DKI Jakarta',
      provinceScope: 'DKI Jakarta',
      url: 'https://www.indonetwork.co.id/product/damdex-biang-dan-damdex-warna-5612149',
      accessedAt: ACCESSED,
      price: 47000, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'JUMLAH BUNDEL TERDOKUMENTASI (kedua bagian terpakai bersama sesuai definisi komponen — rangka memakai kedua profil): Hollow Plafon Galvanis 40×40 panjang 4M Rp27.000/batang + Hollow Plafon Galvanis 20×40 panjang 4M Rp20.000/batang, dari DAFTAR YANG SAMA → Rp47.000 per satuan batang bundel. Kelas hollow plafon; ketebalan tidak dinyatakan sumber maupun komponen. Hollow struktural 6 m adalah produk berbeda (tidak dipakai).',
    },
  },
  {
    resourceCode: 'PAINT_INTERIOR_PAIL',
    source: {
      publisher: 'Daftar Tokopedia (cat tembok 20 kg)',
      documentTitle: 'Daftar "Cat Tembok 20kg" — data diperbarui 6/11/2026',
      documentDate: '6 November 2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/find/cat-tembok-20kg?page=11',
      accessedAt: ACCESSED,
      price: 3174000, unit: 'pail', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Kemasan persis komponen: Dulux Easy Clean 20KG (cat interior premium) Rp3.174.000/pail 20 kg. Tautan ini menutup UNIT_MISMATCH lama (record katalog CT-001 bersatuan kg). Alternatif kelas menengah pada daftar bertanggal sama: Nippon Vinilex Pro 1000 20 kg Rp1.247.000/pail — tidak dirata-rata; kelas premium komponen mengikuti Dulux Easy Clean.',
    },
  },
  {
    resourceCode: 'PAINT_EXTERIOR_GALON',
    source: {
      publisher: 'KaryaAgungID (Tokopedia)',
      documentTitle: 'Cat Tembok Eksterior Nippon Weatherbond 2,5 Liter — 1001 Brilliant White',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/karyaagungid/cat-tembok-eksterior-nippon-weatherbond-warna-ready-2-5-liter-2-5l-1001-brll-white',
      accessedAt: ACCESSED,
      price: 336000, unit: 'galon', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Kemasan persis komponen: Nippon Weatherbond (weatherproof) galon 2,5 liter Rp336.000. Tautan ini menutup UNIT_MISMATCH lama (record katalog CT-002 bersatuan kg). Pembanding Dulux Weathershield 2,5 L Rp450.000 tidak dipakai.',
    },
  },
  {
    resourceCode: 'WALL_PUTTY_PAIL',
    source: {
      publisher: 'Daftar Tokopedia (Nippon Matex)',
      documentTitle: 'Daftar "Nippon Matex 20 Kg" — data diperbarui 4/9/2026',
      documentDate: '4 September 2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/find/nippon-matex-20-kg',
      accessedAt: ACCESSED,
      price: 350000, unit: 'pail', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Kemasan persis komponen: Nippon Paint Matex Putty (Pail 20 Kg) Rp350.000/pail. Varian lain pada daftar yang sama (Rp405.000 / Rp499.900) tidak dirata-rata.',
    },
  },
  {
    resourceCode: 'PAINT_TOOL_SET',
    source: {
      publisher: 'Sumber Rejeki Makmur (Shopee)',
      documentTitle: 'Paket Alat Mengecat isi 7 pcs (Kuas Roll Kapal + Bak Cat + Kape + Amplas + Lakban Kertas + Kuas 2,5" + Kuas 1")',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://shopee.co.id/sumberrejekimakmur',
      accessedAt: ACCESSED,
      price: 45500, unit: 'set', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Set nyata dari supplier yang memuat keempat isi komponen (rol cat, kuas, amplas, lakban kertas) ditambah bak cat & kape — Rp45.500/set 7 pcs. Isi tambahan dinyatakan apa adanya.',
    },
  },
  {
    resourceCode: 'WALL_TAP_SS',
    source: {
      publisher: 'Indoestri Bangunan (Tokopedia, Kab. Bogor)',
      documentTitle: 'Kran Dinding Waterplus CTL 211 BS Brushed Stainless Steel SS-304 — ukuran pipa 1/2"',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'Kabupaten Bogor, Jawa Barat',
      provinceScope: 'Jawa Barat',
      url: 'https://www.tokopedia.com/indoestribangunan/kran-dinding-waterplus-ctl-211-bs-brushed-stainless-steel-waterplus-kran-dinding-1730382412118067018',
      accessedAt: ACCESSED,
      price: 93951, unit: 'buah', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Produk bernama sesuai spek komponen: kran dinding stainless SS-304 1/2" — Rp93.951/buah (harga sebelum diskon Rp94.900 pada halaman yang sama).',
    },
  },
  {
    resourceCode: 'RCP_800',
    source: {
      publisher: 'Nusantara Precast',
      documentTitle: 'Daftar Harga Pipa Beton RCP Kudus Terbaru 2026',
      documentDate: '2026',
      regionLabel: 'Kudus, Jawa Tengah',
      provinceScope: 'Jawa Tengah',
      url: 'https://nusantaraprecast.com/product/harga-pipa-beton-rcp-kudus/',
      accessedAt: ACCESSED,
      price: 1016000, unit: 'm', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'HARGA TURUNAN DARI PANJANG EFEKTIF YANG DINYATAKAN SUMBER: Pipa Beton Ø800 K-450 panjang efektif 1,25 m = Rp1.270.000/pcs → 1.270.000 / 1,25 = Rp1.016.000/m. Varian Leff 2,45 m (Rp1.750.000/pcs ≈ Rp714.286/m) menunjukkan harga per meter bergantung panjang modul — nilai modul 1,25 m dipakai dan batasnya dinyatakan.',
    },
  },
  {
    resourceCode: 'EQUIP_PNEUMATIC_TIRE_ROLLER',
    source: {
      publisher: 'Arthamix (rental alat berat) — terkoroborasi PT Laksana Karya',
      documentTitle: 'Harga Sewa Alat Berat Terbaru 2026 (Arthamix) & Sewa Alat Aspal Bogor (Laksana Karya)',
      documentDate: '2026',
      regionLabel: 'Jabodetabek',
      provinceScope: null,
      url: 'https://www.arthamix.com/product/harga-sewa-alat-berat/',
      accessedAt: ACCESSED,
      price: 1800000, unit: 'sewa-hari', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Tarif HARIAN PTR dari dua daftar rental independen yang sepakat: Arthamix "Pneumatic Tyred Rollers (PTR) Rp1.800.000/Hari" dan Laksana Karya "Pneumatic Tyre Roller — Hari — 1.800.000". Tautan ini menutup UNIT_MISMATCH lama (record EQ-017 per JAM tetap tidak dipakai). Batas dinyatakan: kapasitas 10 ton pada nama komponen tidak tertulis di kedua daftar harian; kelas PTR 8–15 ton adalah kelas mesin komponen ini.',
    },
  },
  {
    resourceCode: 'READYMIX_FS45',
    source: {
      publisher: 'Niagara Readymix',
      documentTitle: 'Harga Beton FS 45 — Produk Beton Cor Ready Mix Terbaru 2026 (Last Update 1 April 2026)',
      documentDate: '1 April 2026',
      regionLabel: 'Jabodetabek',
      provinceScope: null,
      url: 'https://www.niagareadymix.com/2023/03/harga-beton-fs-45.html',
      accessedAt: ACCESSED,
      price: 1400000, unit: 'm³', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Harga untuk mutu FS-45 (kuat LENTUR 45 kg/cm²): Rp1.400.000/m³ truk standar 7 m³ maupun minimix 3 m³. PERINGATAN SPEK: label "/ f\'c 25 MPa" pada nama komponen TIDAK setara FS-45 (sumber pembanding menyatakan FS-45 setara kuat tekan ±K-400; f\'c 25 MPa dipetakan pasar ke K-300) — harga ini berlaku untuk FS-45; verifikasi mutu yang dimaksud sebelum memakai komponen ini.',
    },
  },
  {
    resourceCode: 'CONCRETE_WATERPROOF_K300',
    source: {
      publisher: 'PT. Anas Colossal Group (Colossal Chemicals)',
      documentTitle: 'Harga Ready Mix Waterproofing Bogor',
      documentDate: 'diakses 2026-11-06 (halaman harga berjalan)',
      regionLabel: 'Bogor, Jawa Barat',
      provinceScope: 'Jawa Barat',
      url: 'https://colossalchemicals.com/harga-ready-mix-for-waterproofing-bogor/',
      accessedAt: ACCESSED,
      price: 1000000, unit: 'm³', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Halaman supplier BERTEMA waterproofing secara eksplisit: baris "K300 — Rp1.000.000 — Menyesuaikan spesifikasi proyek". Ini varian kedap air, BUKAN ready mix K-300 polos (yang dilarang untuk identitas ini). Satu supplier — kepastian lebih rendah, dinyatakan.',
    },
  },
  {
    resourceCode: 'CONCRETE_WATERPROOF_K350',
    source: {
      publisher: 'PT. Anas Colossal Group (Colossal Chemicals)',
      documentTitle: 'Harga Ready Mix Waterproofing Bogor',
      documentDate: 'diakses 2026-11-06 (halaman harga berjalan)',
      regionLabel: 'Bogor, Jawa Barat',
      provinceScope: 'Jawa Barat',
      url: 'https://colossalchemicals.com/harga-ready-mix-for-waterproofing-bogor/',
      accessedAt: ACCESSED,
      price: 1050000, unit: 'm³', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Baris "K350 — Rp1.050.000 — Konfirmasi sebelum pemesanan" pada halaman ready mix waterproofing yang sama. Varian kedap air eksplisit, bukan K-350 polos.',
    },
  },
  {
    resourceCode: 'EXPANSION_JOINT_AP',
    source: {
      publisher: 'Jurnal JHP17 — Universitas 17 Agustus 1945 Surabaya',
      documentTitle: 'Studi biaya pemasangan expansion joint jembatan (Krian–Mojokerto): Asphaltic Plug Joint vs Strip Seal Joint',
      documentDate: '30 September 2025',
      regionLabel: 'Krian–Mojokerto, Jawa Timur',
      provinceScope: 'Jawa Timur',
      url: 'https://jurnal.untag-sby.ac.id/index.php/jhp17/article/view/132497',
      accessedAt: ACCESSED,
      price: 2170500, unit: 'm', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Biaya PEMASANGAN Asphaltic Plug Joint Rp2.170.500/m menurut studi jurnal 2025 (tabel harga terbit). Varian Baja Modular pada nama komponen TIDAK dihargai dari angka ini — studi yang sama menilai strip seal Rp11.450.000/m; keduanya tidak dicampur. Penguat: artikel Bina Marga PU menyebut kisaran asphaltic plug Rp1.350.000–1.500.000/m (bahan) — basis berbeda, tidak dipakai.',
    },
  },
  {
    resourceCode: 'CCSP_W500_L12',
    source: {
      publisher: 'JasaPancang.id (supplier sheet pile)',
      documentTitle: 'Harga Sheet Pile Berdasarkan Ukuran (Updated 2024-03-13)',
      documentDate: '13 Maret 2024',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://jasapancang.id/harga-sheet-pile/',
      accessedAt: ACCESSED,
      price: 15000000, unit: 'batang', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'HARGA TURUNAN DARI PANJANG YANG DINYATAKAN KOMPONEN: CSP W.500.1000 Kelas A (lebar efektif 50 cm = We komponen) Rp1.250.000/meter panjang tiang → batang L=12 m = 12 × 1.250.000 = Rp15.000.000/batang. Pembanding RK Beton Precast W500 Rp1.155.000/m tidak dipakai. Tanggal daftar 2024 — vintage dinyatakan.',
    },
  },
  {
    resourceCode: 'GALV_PIPE_3IN',
    source: {
      publisher: 'Toko Besi Baja (tokobesibaja.com)',
      documentTitle: 'Harga Pipa Galvanis Medium 2026 Terbaru',
      documentDate: '2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'http://tokobesibaja.com/product/pipa-galvanis-medium',
      accessedAt: ACCESSED,
      price: 210500, unit: 'm', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'HARGA TURUNAN DARI PANJANG BATANG YANG DINYATAKAN SUMBER: pipa galvanis medium 3" tebal 3,75 mm panjang 6 meter Rp1.263.000/batang → 1.263.000 / 6 = Rp210.500/m. Ketebalan sangat menentukan (varian 2,00 mm = Rp466.100/batang pada daftar sama) — basis 3,75 mm dinyatakan.',
    },
  },
  {
    resourceCode: 'HDPE_PIPE_400',
    source: {
      publisher: 'PipaPedia (daftar harga pipa HDPE Vinilon)',
      documentTitle: 'Daftar Harga Pipa HDPE Vinilon Terbaru 2026 (Update September 2026)',
      documentDate: 'September 2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://pipapedia.com/harga-pipa-hdpe/',
      accessedAt: ACCESSED,
      price: 1810000, unit: 'm', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Baris sumber: Vinilon PE100 OD 400 mm (16") SDR 17 / PN 10 tebal 23,7 mm — Rp1.810.000/m. Varian PIPA BAJA pada nama komponen tidak dihargai dari daftar HDPE ini. Penguat: daftar Rucika Black PN10 Rp1.673.300/m (2023) — tidak dipakai, tidak dirata-rata.',
    },
  },
  {
    resourceCode: 'HDPE_PIPE_ND150',
    source: {
      publisher: 'HargaPipaAir.com',
      documentTitle: 'Price List Harga Pipa HDPE Standard SNI 2026',
      documentDate: '2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.hargapipaair.com/list-harga-pipa-hdpe-terbaru-2018/',
      accessedAt: ACCESSED,
      price: 215700, unit: 'm', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      taxNote: 'Harga daftar BELUM termasuk PPN 11% (dinyatakan sumber).',
      note: 'Konvensi HDPE: ND 150 mm = OD 160 mm (6") — tidak ada pipa HDPE OD 150 standar. Baris sumber: OD 160 SDR 17 / PN 10 tebal 9,50 mm — Rp215.700/m. Varian DIP/PVC pada nama komponen tidak dihargai dari daftar ini.',
    },
  },
  {
    resourceCode: 'FRP_TANK_50M3',
    source: {
      publisher: 'Daftar Tokopedia (tangki panel fiberglass BIORICH)',
      documentTitle: 'Daftar "Tangki Panel Fiberglass" — data diperbarui 4/11/2026',
      documentDate: '4 November 2026',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/find/tangki-panel-fiberglass?page=2',
      accessedAt: ACCESSED,
      price: 250000000, unit: 'unit', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Harga UNIT persis kapasitas komponen: Roof Tank FRP Panel BIORICH 50.000 liter / 50 m³ — Rp250.000.000. KONFLIK DINYATAKAN: produsen yang sama (Surya Fibertek/BIORICH) menyebut kisaran Rp3–4 juta per m³ (= Rp150–200 juta untuk 50 m³) — tidak dirata-rata; harga listing per unit dipakai karena menamai kapasitas persis 50 m³, dan konfliknya wajib ditinjau saat pengadaan nyata.',
    },
  },
  {
    resourceCode: 'MANHOLE_HATCH_SS',
    source: {
      publisher: 'Toko Teknik (Tokopedia) — listing Serinox',
      documentTitle: 'Sanitary Oval Manhole Cover Stainless Steel SS304 — 435 x 335 mm (Serinox)',
      documentDate: 'diakses 2026-11-06',
      regionLabel: 'Nasional (online)',
      provinceScope: null,
      url: 'https://www.tokopedia.com/tokoteknikmuraah',
      accessedAt: ACCESSED,
      price: 9192900, unit: 'unit', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'Pintu akses/manhole tangki stainless SS304 oval 435×335 mm — Rp9.192.900/unit. Komponen tidak menyatakan ukuran; ukuran sumber dinyatakan di sini. Varian square pada listing sama berharga placeholder (Rp12.345) dan DITOLAK.',
    },
  },
  {
    resourceCode: 'REBAR_BJTS_UNSPEC',
    source: {
      publisher: 'Jayasteel (distributor besi beton)',
      documentTitle: 'Harga dan Ukuran Besi Beton — daftar BJTS 420B per batang (update 2026-07-06)',
      documentDate: '6 Juli 2026',
      regionLabel: 'Jawa Timur (distributor nasional)',
      provinceScope: 'Jawa Timur',
      url: 'https://www.jayasteel.com/2023/06/harga-dan-ukuran-besi-beton.html',
      accessedAt: ACCESSED,
      price: 10400, unit: 'kg', kind: 'MARKET_SUPPLIER', confidence: 'INDEX_ONLY',
      note: 'DASAR PER-KG DARI SUMBER ITU SENDIRI: tiga diameter BJTS 420B pada daftar yang sama konsisten pada ±Rp10.400/kg — Ulir 10 mm (7,4 kg/batang) Rp77.000; Ulir 13 mm (12,48 kg) Rp129.800; Ulir 16 mm (18,96 kg) Rp197.200. Karena distributor menilai BJTS 420B secara per-kg lintas diameter, komponen tanpa diameter dapat dihargai per kg dari konsistensi ini (77.000/7,4 ≈ 129.800/12,48 ≈ 197.200/18,96 ≈ 10.400). Penguat: percakapan distributor Jayasteel menyebut eksplisit "Rp9.950 per-kg" untuk BJTS 420 diameter 13–32. Harga BOQ lama Rp8.500/kg (basis pekerjaan) tidak dipakai. Ini menutup keberatan putaran 2 — yang dulu ditolak adalah meminjam record SATU diameter; yang dipakai sekarang adalah basis per-kg distributor itu sendiri.',
    },
  },
];
