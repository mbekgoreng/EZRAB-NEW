/**
 * productKnowledge — Knowledge Base PRODUK EZRAB terstruktur.
 *
 * Pola yang sama dengan constructionKnowledge.ts (KB konstruksi),
 * tetapi isinya FITUR APLIKASI EZRAB — bukan pengetahuan domain
 * konstruksi umum. Tool LLM yang memakai KB ini: cari_fitur_ezrab
 * (aturan prompt 31); pengetahuan konstruksi umum tetap lewat
 * cari_pengetahuan_konstruksi (aturan 25).
 *
 * SETIAP record membawa provenance eksplisit. Berbeda dengan KB
 * konstruksi (seluruh record "unverified"), record produk ini
 * DIVERIFIKASI DARI KODE: provenance.source menyebut jalur berkas
 * (+ baris) yang membuktikan klaimnya, dan verificationStatus =
 * "verified". Klaim yang TIDAK dapat diverifikasi dari kode DILARANG
 * masuk sebagai fakta — bila terpaksa dicantumkan, statusnya
 * "assumption" dan detailnya menyebut bahwa itu asumsi.
 *
 * LARANGAN KERAS:
 * - TIDAK ADA angka hard-code untuk jumlah template RAB / analisa
 *   AHSP: angka-angka itu dihitung runtime lewat aksesor resmi
 *   (RabTemplateService / officialAhspRepository) di lapisan
 *   pemformatan (productRetrieval.formatProductContext) — bila
 *   aksesor gagal, angka spesifik dihilangkan (klaim kualitatif).
 * - TIDAK ADA harga karangan: harga paket/kredit hanya dari
 *   src/data/plans.ts & kode billing, dengan sitasi.
 * - TIDAK ADA klaim "bisa dari chat" tanpa intent/tool/perintah
 *   yang benar-benar ada; batas chat dinyatakan di chatCannot.
 */

import type {
  KnowledgeProvenance,
  SupportStatus,
} from './constructionKnowledge';

export type { KnowledgeProvenance, SupportStatus };

export type ProductCategory =
  | 'Chat AI'
  | 'RAB'
  | 'DED'
  | 'Dokumen'
  | 'Volume'
  | 'Keuangan'
  | 'Jadwal'
  | 'Laporan'
  | 'Database'
  | 'Akun & Peran'
  | 'Batasan';

export interface ProductKnowledgeRecord {
  id: string;
  category: ProductCategory;
  commonName: string;
  indonesianSynonyms: string[];
  englishTerms: string[];
  /** Apa fitur ini, 1–2 kalimat (fakta, bukan pemasaran). */
  summary: string;
  /** Fakta terverifikasi, per butir. Tanpa angka template/AHSP hard-code. */
  details: string[];
  /** Yang BISA dilakukan dari Chat AI terkait fitur ini (kosong = tidak ada). */
  chatCan: string[];
  /** Yang TIDAK BISA dilakukan dari Chat AI terkait fitur ini. */
  chatCannot: string[];
  /** Id menu sidebar terkait (mis. 'rab-kurva-s'), null bila bukan menu. */
  menuId: string | null;
  supportStatus: SupportStatus;
  unsupportedCapabilities: string[];
  provenance: KnowledgeProvenance;
}

function rec(
  r: Omit<ProductKnowledgeRecord, 'provenance'>,
  provenance: KnowledgeProvenance,
): ProductKnowledgeRecord {
  return { ...r, provenance };
}

/** Provenance bersama: terverifikasi dari kode repo, 2026-11-19. */
function prov(source: string): KnowledgeProvenance {
  return {
    source,
    sourceDate: '2026-11-19',
    documentId: null,
    verificationStatus: 'verified',
    applicableScope: 'aplikasi EZRAB (branch integrasi/unified-ui-engine)',
    discipline: 'produk EZRAB',
    version: '1.0',
  };
}

export const PRODUCT_KNOWLEDGE: ProductKnowledgeRecord[] = [
  rec({
    id: 'chat-ai',
    category: 'Chat AI',
    commonName: 'Ezrab Chat AI',
    indonesianSynonyms: ['chat ai', 'ezrab chat ai', 'asisten chat', 'chat', 'perintah chat', 'ezrab ai'],
    englishTerms: ['chat ai', 'ai chat', 'assistant'],
    summary: 'Asisten estimasi konstruksi di dalam EZRAB — menjawab dari data EZRAB sendiri dan menjalankan perintah deterministik dari chat.',
    details: [
      'Perintah deterministik dijalankan tanpa LLM dan tanpa kredit — pencocokan intent berjalan sebelum panggilan provider AI.',
      'Kelola proyek dari chat: buat, ganti nama, duplikat, arsipkan, hapus.',
      'Ubah item RAB dari chat: tambah, hapus, ubah volume/harga, batalkan — selalu lewat pratinjau + tombol Konfirmasi Eksekusi; tanpa klik konfirmasi tidak ada perubahan.',
      'QTO: buat item volume manual (satuan wajib) dan sinkronkan ke RAB; item tanpa harga tidak pernah tersinkron diam-diam.',
      'Jalankan analisis DED dari sesi yang sudah diunggah di menu DED, dan ringkas dokumen dari chat.',
      'Ekspor Excel/PDF (format hanya excel atau pdf; default Excel bila tidak disebut) dan buat revisi (snapshot item saat ini).',
      'Atur overhead/profit/PPN/PPh proyek dari chat; PPN opt-in (diaktifkan bersama persentasenya); nilai divalidasi 0–100.',
      'Transfer draft ke spreadsheet lewat pratinjau + konfirmasi; override harga material per proyek (bukan harga master).',
      'Top-up kredit dan ganti paket dari chat adalah SIMULASI — bukan pembayaran atau langganan nyata.',
      'Perintah diawali / : /rab, /ded, /template, /proyek, /qto, /ahsp, /laporan, /dokumen, /pengaturan, /dashboard, /help, /game.',
      'Mode rab-generator: draf RAB langsung di chat dengan banner + prefill prompt.',
    ],
    chatCan: [
      'kelola proyek (buat/ganti nama/duplikat/arsip/hapus)',
      'ubah item RAB lewat pratinjau + Konfirmasi',
      'buat item QTO dan sinkronkan ke RAB',
      'jalankan analisis DED dari sesi yang sudah diunggah',
      'ringkas dokumen',
      'ekspor Excel/PDF dan buat revisi',
      'cek saldo kredit',
      'atur overhead/profit/PPN/PPh proyek',
      'transfer draft ke spreadsheet',
      'override harga material untuk satu proyek',
      'membuat draf RAB langsung di chat (mode rab-generator)',
    ],
    chatCannot: [
      'mengubah harga master/database material (hanya override per proyek)',
      'membuat atau mengubah jadwal (tidak ada tool penjadwalan di chat)',
      'top-up kredit nyata dan ganti paket nyata — keduanya simulasi di chat',
    ],
    menuId: 'ezrab-ai',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: ['mengubah harga master dari chat', 'membuat/mengubah jadwal dari chat'],
  }, prov('intentRouter.ts:25-99 (75 intent), :130-150 (perintah /); actionRegistry.ts:3180-3186 (pratinjau + Konfirmasi), :3003,3086 (ganti paket simulasi); projectCommands.ts:325-345 (hapus 2 langkah); exportCreditCommands.ts:30,414,455 (top-up simulasi); aiNavigation.ts:136-138 (rab-generator)')),
  rec({
    id: 'wizard-rab',
    category: 'RAB',
    commonName: 'Wizard RAB Rumah',
    indonesianSynonyms: ['wizard rab', 'wizard rumah', 'wizard', 'buat rab rumah', 'rab wizard'],
    englishTerms: ['rab wizard', 'house wizard'],
    summary: 'Wizard 5 langkah untuk membuat RAB rumah dari tipe & ukuran rumah.',
    details: [
      'Tepat 5 langkah: Tipe Rumah, Dimensi, Ruangan, Lokasi & Kualitas, Konfirmasi.',
      'Tipe preset: Tipe 36/45/60/90 atau Custom.',
      'Lokasi memakai database wilayah Indonesia (provinsi/kabupaten); kualitas: standar/menengah/mewah.',
    ],
    chatCan: ['membuka wizard RAB dari chat (intent START_RAB_WIZARD)'],
    chatCannot: [],
    menuId: null,
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('src/ai-design/RabWizard.tsx:43-49,51,228,231-443')),
  rec({
    id: 'desain-rumah-ai',
    category: 'RAB',
    commonName: 'Desain Rumah AI',
    indonesianSynonyms: ['desain rumah ai', 'ai design studio', 'desain rumah', 'desain ai'],
    englishTerms: ['ai house design', 'ai design studio'],
    summary: 'AI Design Studio — dari deskripsi teks menjadi spesifikasi rumah, spreadsheet, lalu QTO/RAB.',
    details: [
      'Deskripsi teks diurai menjadi HouseSpec, lalu ditinjau dalam tab spesifikasi, spreadsheet, dan review.',
      'Persetujuan mengubah baris spreadsheet menjadi item pekerjaan.',
      'Alur terpadu wizard → studio tersedia.',
    ],
    chatCan: ['membuka AI Design Studio dari chat (intent START_HOUSE_DESIGN)'],
    chatCannot: [],
    menuId: null,
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('src/ai-design/AiDesignStudio.tsx:4-5,11,21; src/ai-design/specEngine.ts:20,67; actionRegistry.ts:3946-3956; src/ai-design/DesignWizardFlow.tsx:24-30')),
  rec({
    id: 'template-rab',
    category: 'RAB',
    commonName: 'Template RAB',
    indonesianSynonyms: ['template rab', 'template', 'katalog template', 'template siap pakai'],
    englishTerms: ['rab template', 'template catalog'],
    summary: 'Katalog template RAB siap pakai untuk berbagai jenis proyek; jumlahnya dihitung saat runtime, bukan angka tetap.',
    details: [
      'Jumlah template dihitung runtime lewat RabTemplateService — jangan pernah mengutip angka tetap.',
      'Katalog dibuka dari menu Template RAB.',
    ],
    chatCan: ['membuka katalog template RAB dari chat (intent OPEN_TEMPLATE)'],
    chatCannot: [],
    menuId: 'template-rab',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('src/services/rabTemplateService.ts:128,150,1514; actionRegistry.ts:3344-3357 (larangan hard-code jumlah)')),
  rec({
    id: 'qto',
    category: 'RAB',
    commonName: 'QTO (Quantity Take-Off)',
    indonesianSynonyms: ['qto', 'quantity take-off', 'take off', 'item volume', 'volume pekerjaan'],
    englishTerms: ['qto', 'quantity take-off', 'takeoff'],
    summary: 'QTO — item volume yang dapat dibuat manual dan disinkronkan ke RAB.',
    details: [
      'Buat item QTO manual dari chat; satuan wajib diisi.',
      'Sinkronisasi QTO → RAB spreadsheet; item tanpa harga tidak pernah tersinkron diam-diam.',
    ],
    chatCan: ['membuat item QTO manual', 'mensinkronkan QTO ke RAB'],
    chatCannot: [],
    menuId: null,
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('src/ai-tools/ezrab-ai/commands/qtoCommands.ts:1-14,21-34; intentRouter.ts:70-71')),
  rec({
    id: 'ded-ai',
    category: 'DED',
    commonName: 'DED Estimate AI',
    indonesianSynonyms: ['ded', 'ded estimate ai', 'estimasi ded', 'analisis ded', 'ded ai', 'gambar kerja', 'estimasi dari ded'],
    englishTerms: ['ded estimate ai', 'ded analysis'],
    summary: 'Estimasi dari DED — unggah gambar kerja (PDF) dan draft estimasi disusun otomatis. Tepat 2 mode analisis.',
    details: [
      'TEPAT 2 mode: EZRAB AI MODE (default) dan FULL AI MODE.',
      'EZRAB AI MODE: analisis dengan referensi EZRAB — terintegrasi database AHSP EZRAB, referensi harga + data terstruktur, engine perhitungan EZRAB; item tanpa harga terverifikasi tetap tidak tersedia dan total bisa parsial.',
      'FULL AI MODE: AI membangun analisis konstruksi secara mandiri (WBS + item pekerjaan, analisa AHSP sendiri, koefisien + estimasi harga) dan TIDAK memakai database referensi AHSP internal — terisolasi dari katalog AHSP + harga internal EZRAB; harganya estimasi AI, bukan harga AHSP resmi — validasi sebelum dipakai untuk pengadaan/tender/kontrak.',
      'Kedalaman Cepat/Mendalam adalah pilihan di dalam kedua mode, bukan mode ketiga.',
      'Batas unggah: maks 5 berkas, masing-masing maks 25 MB, hanya PDF.',
    ],
    chatCan: ['menjalankan analisis DED dari sesi/draft yang sudah diunggah di menu DED (tanpa sesi, dijawab jujur "belum ada sesi")'],
    chatCannot: ['menjalankan analisis tanpa sesi DED yang sudah diunggah di menu DED'],
    menuId: 'ded-ai',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: ['mengambil kuantitas dari garis gambar CAD — DED teks saja tidak dapat membaca dimensi dari garis gambar (temuan audit DED 2026-11-18)'],
  }, prov('src/ai-tools/ded-ai-estimate/dedMode.ts:12-18,63,71,74,99-105; dedModeUi.ts:39-45,53-91; DedAiInputView.tsx:133-134,247-248,258-259; batas CAD: laporan audit DED 2026-11-18 (~/workspace/your_files/EZRAB-DED-AUDIT-BESAR-2026-11-17/LAPORAN-AKHIR.md §9-10)')),
  rec({
    id: 'magic-ai',
    category: 'DED',
    commonName: 'Magic AI',
    indonesianSynonyms: ['magic ai', 'magic', 'ded analysis dashboard', 'analisis ded magic'],
    englishTerms: ['magic ai'],
    summary: 'Magic AI — dasbor analisis DED & estimasi (bukan chat): unggah dokumen, kenali item pekerjaan, tinjau, lalu commit menjadi seksi RAB.',
    details: [
      'Permukaan DED warisan: permukaan DED utama EZRAB adalah DED AI Estimate (menu ded-ai, terhubung AHSP kanonis); Magic AI tetap tersedia untuk pembacaan vision dokumen & sintesis lintas halaman.',
      'Alur: unggah dokumen → kenali item/kategori pekerjaan → tinjau → commit seksi RAB ke proyek (commit membuka rab-spreadsheet).',
      'Kategori pekerjaan diturunkan dinamis dari hasil AI per analisis — tidak ada jumlah kategori tetap.',
      'Pekerjaan kompleks dapat di-handoff ke Chat AI.',
      'Magic AI dijalankan dari dasbornya sendiri, bukan dari chat.',
    ],
    chatCan: [],
    chatCannot: ['menjalankan analisis Magic AI dari chat'],
    menuId: 'magic-ai',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('src/components/magic-ai/MagicAiSuperView.tsx:1-9,51-93; DedAnalysisDashboard.tsx:286,377-380,1033; WorkspaceView.tsx:703-705; magicHandoff.ts:1-17')),
  rec({
    id: 'ai-document',
    category: 'Dokumen',
    commonName: 'AI Document',
    indonesianSynonyms: ['ai document', 'document ai', 'dokumen ai', 'buat dokumen', 'analisis dokumen', 'draf dokumen'],
    englishTerms: ['ai document', 'document ai'],
    summary: 'AI Document — buat, analisis, dan periksa dokumen proyek dengan AI: draf dari instruksi atau template, ringkasan, tanya-jawab, ekstrak, bandingkan, checklist, terjemahan, dan penyempurnaan teks.',
    details: [
      '9 mode layanan: ringkasan, tanya-jawab, ekstrak, bandingkan, chat dokumen, checklist, draf, penyempurnaan, terjemahan.',
      'Tiga jalur utama: Buat dengan AI (instruksi bebas + konteks proyek/perusahaan), Gunakan Template (katalog template + formulir), Edit & Periksa (editor draf + review + revisi AI + versi).',
      '12 template bawaan (berita acara, surat, laporan harian/mingguan, notulen, checklist QC, BAST, opname, laporan K3, surat penawaran, surat undangan, bebas) dalam 6 kategori; template pengguna dapat dibuat/disimpan/dihapus.',
      'Panel konteks: 22 field (16 proyek + 6 perusahaan) dalam 5 kelompok; tiap field membawa provenance (terverifikasi/belum terverifikasi/hilang) — nilai kosong dilaporkan hilang, tidak diganti nilai demo.',
      'Semua draf berstatus DRAF sampai ditinjau dan disetujui pengguna.',
      'Review dokumen bersifat deterministik (bukan panggilan AI) — kategori temuan: kelengkapan, konsistensi, struktur, bahasa, sumber; revisi menghasilkan pratinjau kandidat — dokumen berubah hanya bila pengguna menekan Apply.',
      'Format unggah: PDF, DOCX, XLSX, teks; jawaban hanya dari isi dokumen yang diunggah — bila tidak tercantum, AI wajib mengatakan begitu.',
      'Terjemahan ke 8 bahasa; penyempurnaan teks 10 transformasi.',
      'Draf tersimpan lokal (maks 100 draf, maks 20 versi tiap draf), bukan penyimpanan server; ekspor PDF dan DOCX.',
    ],
    chatCan: ['meringkas dokumen dari chat', 'membuka AI Document dari chat (intent OPEN_AI_DOCUMENTS)'],
    chatCannot: ['membuat draf dokumen dari chat — pembuatan lewat menu AI Document'],
    menuId: 'dokumen-ai',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('document-ai/types.ts:7,85-93,111-131,135-145,157-164,195-213; prompt.ts:68,113,119-141; view.tsx:4-12,50,89-101,168-171; docTemplates.ts:24-33,51-56,115-119,196,213-273,621-627,654-658,682-739; DocContextPanel.tsx:72-108,156-170; contextAdapter.ts:68-105; orchestrator.ts:15,177-196,218; review.ts:125')),
  rec({
    id: 'kalkulator-volume',
    category: 'Volume',
    commonName: 'Kalkulator Volume',
    indonesianSynonyms: ['kalkulator volume', 'kalkulator', 'hitung volume', 'volume kalkulator', 'kalkulator qto'],
    englishTerms: ['volume calculator', 'calculator'],
    summary: 'Kalkulator Volume — hitung volume tiap jenis pekerjaan dari dimensi/spesifikasi, dengan langkah rumus, rincian material/upah/alat, dan saran AHSP.',
    details: [
      'Katalog 15 kategori (A–O): Master Standar SNI & CAD, Pekerjaan Tanah, Pondasi & Beton, Dinding & Finishing, Atap & Bukaan, MEP & Sanitasi, Road & Highway, Drainage & Saluran, Jembatan, Irigasi, Sungai & Proteksi Banjir, Bendung, Embung & Retensi, Bendungan Besar, Bangunan Air (SPAM).',
      'Tiap kalkulator mengembalikan kuantitas utama + satuan, rincian angka, langkah rumus, rincian material/upah/alat, dan saran AHSP.',
      'Hasil kalkulator dapat disimpan sebagai snapshot yang terhubung ke QTO dan spreadsheet RAB.',
      'Ilustrasi pekerjaan tersedia untuk sebagian kalkulator — tampil hanya bila ada entri ilustrasi untuk kalkulator tersebut (tidak dijamin untuk setiap item katalog).',
    ],
    chatCan: ['menghitung kuantitas lewat tool hitung_qto (kalkulator terdaftar)'],
    chatCannot: [],
    menuId: 'qto-vc',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:121-134; QtoCalculatorView.tsx:181-510,515-526,1003-1006,1408,2378-2406; constructionCalculators/types.ts:74-109; calculatorRegistry.ts:13-20,31,41-86,181; calculatorIllustrations.ts:1-12,209-211')),
  rec({
    id: 'keuangan-proyek',
    category: 'Keuangan',
    commonName: 'Keuangan Proyek',
    indonesianSynonyms: ['keuangan proyek', 'keuangan', 'termin', 'invoice', 'pemasukan', 'pengeluaran', 'cash flow', 'arus kas', 'budget proyek'],
    englishTerms: ['project finance', 'cash flow', 'invoice', 'payment terms'],
    summary: 'Keuangan Proyek — kelola termin, invoice, pemasukan, pengeluaran, arus kas & forecast, budget, dan laporan keuangan proyek.',
    details: [
      '9 sub-tab: Ringkasan, Arus Kas & Forecast, Budget vs Actual, Termin & Penagihan, Invoice, Pemasukan, Pengeluaran, Log Transaksi, Laporan.',
      'Termin: tonggak pembayaran (urutan, nama, persentase, jumlah, pemicu, jatuh tempo, status); invoice dapat dibuat dari termin.',
      'Invoice: nomor/tanggal/jatuh tempo, klien, rincian item, subtotal, pajak, potongan (mis. amortisasi uang muka, retensi), total, jumlah dibayar/belum dibayar, status, detail bank; ekspor PDF.',
      'Pemasukan: pembayaran yang diterima atas invoice (tanggal, jumlah, metode, nomor referensi).',
      'Pengeluaran: tanggal, kategori, deskripsi, jumlah, vendor, metode pembayaran.',
      'Arus Kas & Forecast: proyeksi arus kas + analisis profitabilitas/margin.',
    ],
    chatCan: [],
    chatCannot: ['mengelola keuangan proyek dari chat (termin/invoice/pemasukan/pengeluaran lewat menu Keuangan Proyek)'],
    menuId: 'keuangan-proyek',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:338-348; ProjectFinanceView.tsx:30-39,157-167,171-261; finance/types.ts:39-54,55-93,94-105,108-121,196; CashFlowProfitTab.tsx:56-60')),
  rec({
    id: 'kurva-s',
    category: 'Jadwal',
    commonName: 'Kurva S & Jadwal',
    indonesianSynonyms: ['kurva s', 'curva s', 'kurva', 'jadwal', 'jadwal pelaksanaan', 's curve', 'progres'],
    englishTerms: ['s-curve', 's curve', 'schedule'],
    summary: 'Kurva S & Jadwal — visualisasi distribusi bobot kumulatif dan progres rencana konstruksi mingguan dari RAB dan jadwal proyek.',
    details: [
      'Fitur ini ADA: engine kurvaSEngine.ts + tampilan EstimatorKurvaSView + versi mobile; menu rab-kurva-s di RAB & Estimasi.',
      'Input yang dibutuhkan: tanggal mulai proyek, tanggal target selesai, dan daftar tugas jadwal yang tidak kosong; bila kurang, tampilan menyebut field yang kurang.',
      'Engine menghitung % dan biaya rencana mingguan + kumulatif, berakhir tepat 100% dan grand total; minggu dibatasi 4–52.',
      'Tampilan estimator TIDAK menggambar kurva tanpa jadwal nyata — panel "Data Kurva S Tidak Tersedia" tampil bila tidak ada tugas; tidak ada kurva karangan.',
      'Pemilih durasi 8/12/16/20/24 minggu hanya muncul bila tidak ada jadwal nyata.',
      'Arus kas mingguan dihitung engine dari data RAB (pemasukan termin + pengeluaran material/upah per minggu); tonggak pemasukan: DP 20% minggu 1, Termin 1 30% tengah proyek, Termin 2 40% minggu kedua terakhir, Retensi 10% minggu terakhir.',
      'Engine yang sama dipakai Laporan & ekspor Excel.',
      'Realisasi progres hanya dari riwayat progres mingguan yang tersimpan — tidak pernah disintesis.',
    ],
    chatCan: [],
    chatCannot: ['membuat atau mengubah jadwal dari chat', 'membuatkan kurva S dari chat — kurva dilihat di menu Kurva S & Jadwal'],
    menuId: 'rab-kurva-s',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: ['menggambar kurva tanpa jadwal nyata (by design — kejujuran kurva)'],
  }, prov('Sidebar.tsx:165-168; kurvaSEngine.ts:3-10,33-63,70-76,87,90-151,154-207,210-260; EstimatorKurvaSView.tsx:60-62,70-76,94-117; useKurvaSModel.ts:40-45,119-121; unifiedProjectEngine.ts:520-544; kurvaSHonesty.ts:51,78-108; ProjectContext.tsx:1188-1194; LaporanView.tsx:368; excelExportEngine.ts:1692,2110,2222-2223')),
  rec({
    id: 'laporan-boq',
    category: 'Laporan',
    commonName: 'Laporan & BOQ',
    indonesianSynonyms: ['laporan', 'boq', 'rekapitulasi', 'laporan proyek', 'rekap rab'],
    englishTerms: ['reports', 'boq', 'bill of quantities', 'recapitulation'],
    summary: 'Laporan — rekapitulasi, BOQ, Analisa Harga Satuan (AHSP), Kurva S, dan Jadwal Waktu dari data RAB nyata; ekspor PDF dan Excel.',
    details: [
      '5 tab laporan: Rekapitulasi, BOQ, Analisa Harga Satuan (AHSP), Kurva S, Jadwal Waktu.',
      'Kategori rekapitulasi dan dataset BOQ diturunkan dari item RAB nyata.',
      'Ekspor PDF dan Excel (.xlsx); paket default mencakup cover, identitas proyek, rekap, detail RAB, backup volume, upah, material, alat, AHSP, jadwal, Kurva S, dan cashflow.',
      'Modal paket ekspor tersedia (preset + pilihan sheet).',
    ],
    chatCan: ['membuka Laporan dari chat (intent OPEN_REPORTS)'],
    chatCannot: [],
    menuId: 'laporan',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:326-329; LaporanView.tsx:51-52,54,131-133,202-206,259-261,269-270,526,634-646,784,961-965,1165,1193')),
  rec({
    id: 'dokumen-tender',
    category: 'Dokumen',
    commonName: 'Dokumen Proyek (Dokumen Tender)',
    indonesianSynonyms: ['dokumen tender', 'dokumen proyek', 'berkas tender', 'tender', 'paket tender', 'dokumen lelang'],
    englishTerms: ['tender documents', 'project documents'],
    summary: 'Dokumen Proyek (Dokumen Tender) — menyiapkan paket berkas tender (Administrasi, Teknis, Biaya, Jadwal, K3) secara otomatis dari database proyek.',
    details: [
      '5 alur kerja: tender (semua kategori), teknis, HSE/K3, komersial, jadwal.',
      '19 definisi dokumen: 6 Administrasi, 3 Teknis, 5 Komersial (BOQ, RAB, AHSP, Rekapitulasi, Bobot Pekerjaan), 2 Jadwal (Time Schedule, Kurva-S), 3 HSE (RKK, IBPR, JSA).',
      'Memuat data proyek, RAB, BOQ, AHSP, dan jadwal ke dalam dokumen.',
      'Pelacakan per dokumen: status DRAF / BELUM LENGKAP / LENGKAP / DIEKSPOR, persentase kelengkapan, progres keseluruhan; revisi R0 Draf / R1 Review / R2 Final.',
      'Dokumen tersimpan lokal (LocalDocumentRepository).',
    ],
    chatCan: [],
    chatCannot: ['menyiapkan dokumen tender dari chat — penyusunan lewat menu Dokumen Proyek'],
    menuId: 'dokumen-tender',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:332-335; TenderDocumentsView.tsx:25-31,74,109,237,248-258,323,1048,1150; document-engine/registry.ts:34,39-213,234-306,325-461,481-520,555-615,652-679')),
  rec({
    id: 'database-material',
    category: 'Database',
    commonName: 'Database Material & Harga',
    indonesianSynonyms: ['material', 'database material', 'harga material', 'bahan bangunan', 'material bangunan'],
    englishTerms: ['material database', 'materials'],
    summary: 'Database Material & Harga — daftar material beserta harga (database harga 2026).',
    details: [
      'Menu Database Material di dropdown Database.',
      'Harga material dapat dicari dari chat lewat tool cari_harga.',
    ],
    chatCan: ['mencari harga material dari chat (tool cari_harga)'],
    chatCannot: ['mengubah harga material master dari chat'],
    menuId: 'database-material',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:187-190; dictionaries.ts:29; toolRegistry.ts (cari_harga: jenis material/upah/alat)')),
  rec({
    id: 'database-ahsp',
    category: 'Database',
    commonName: 'AHSP 2026',
    indonesianSynonyms: ['ahsp', 'ahsp 2026', 'analisa harga satuan', 'analisa ahsp', 'harga satuan'],
    englishTerms: ['ahsp', 'unit price analysis'],
    summary: 'AHSP — Analisa Harga Satuan Pekerjaan resmi 2026; jumlah analisa dihitung saat runtime, bukan angka tetap.',
    details: [
      'Sumber kebenaran: masterRegistry (AHSP_2026_CANONICAL + OFFICIAL_SMKK_2026_ITEMS).',
      'Jumlah analisa dihitung runtime lewat officialAhspRepository.size — jangan pernah mengutip angka tetap.',
      'size menghitung seluruh item termasuk yang dikarantina; daftar aktif saja tersedia lewat getActiveOfficialAhsp().',
    ],
    chatCan: ['mencari AHSP dari chat', 'memakai AHSP langsung di RAB'],
    chatCannot: [],
    menuId: 'ahsp-2026',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:195-198 (id ahsp-2026, alias ahsp/analisa-ahsp); officialAhspRepository.ts:5-7,90-99,129-131; masterRegistry.ts:14,16,111,114')),
  rec({
    id: 'database-upah',
    category: 'Database',
    commonName: 'Database Upah',
    indonesianSynonyms: ['upah', 'database upah', 'harga upah', 'upah pekerja', 'upah tukang', 'ongkos'],
    englishTerms: ['wage database', 'labor rates'],
    summary: 'Database Upah — daftar upah pekerja beserta harga (database harga 2026).',
    details: [
      'Menu Database Upah di dropdown Database.',
      'Harga upah dapat dicari dari chat lewat tool cari_harga.',
    ],
    chatCan: ['mencari harga upah dari chat (tool cari_harga)'],
    chatCannot: ['mengubah harga upah master dari chat'],
    menuId: 'database-upah',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:201-202; dictionaries.ts:31; toolRegistry.ts (cari_harga: jenis material/upah/alat)')),
  rec({
    id: 'database-alat',
    category: 'Database',
    commonName: 'Database Peralatan',
    indonesianSynonyms: ['peralatan', 'alat', 'database alat', 'harga alat', 'sewa alat', 'alat berat'],
    englishTerms: ['equipment database', 'tools'],
    summary: 'Database Peralatan — daftar peralatan beserta harga (database harga 2026).',
    details: [
      'Menu Database Peralatan di dropdown Database.',
      'Harga peralatan dapat dicari dari chat lewat tool cari_harga.',
    ],
    chatCan: ['mencari harga peralatan dari chat (tool cari_harga)'],
    chatCannot: ['mengubah harga peralatan master dari chat'],
    menuId: 'database-alat',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:207-208; dictionaries.ts:32; toolRegistry.ts (cari_harga: jenis material/upah/alat)')),
  rec({
    id: 'harga-proyek',
    category: 'Database',
    commonName: 'Harga Proyek',
    indonesianSynonyms: ['harga proyek', 'harga per proyek', 'daftar harga proyek'],
    englishTerms: ['project prices'],
    summary: 'Harga Proyek — daftar harga yang berlaku untuk satu proyek (termasuk override harga per proyek).',
    details: [
      'Menu Harga Proyek di dropdown Database.',
      'Override harga material untuk satu proyek diatur dari chat (SET_PROJECT_PRICE, dua langkah + konfirmasi) dan tidak mengubah harga master.',
    ],
    chatCan: ['override harga material untuk satu proyek'],
    chatCannot: ['mengubah harga master dari chat'],
    menuId: 'harga-proyek',
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('Sidebar.tsx:213-214; dictionaries.ts:33; actionRegistry.ts:2847-2850,2872-2900,3326-3328')),
  rec({
    id: 'master-pricing',
    category: 'Database',
    commonName: 'Harga Master (Master Pricing)',
    indonesianSynonyms: ['harga master', 'master pricing', 'database master', 'harga master pricing'],
    englishTerms: ['master pricing', 'master price database'],
    summary: 'Harga Master (Master Pricing) — konsol admin untuk database harga master: record priceMaster beserta provenance-nya.',
    details: [
      'Tiga tab di atas engine §3–§10, termasuk Database Master (record priceMaster + provenance).',
      'Penulisan harga master membutuhkan admin global (tabel global_admins terpisah, bukan SUPER_ADMIN); penegakan server saat ini BLOCKED (logika lokal saja).',
    ],
    chatCan: [],
    chatCannot: ['mengubah harga master dari chat (kewenangan admin global)'],
    menuId: 'master-pricing',
    supportStatus: 'PARTIALLY_SUPPORTED',
    unsupportedCapabilities: ['penegakan server untuk penulisan harga master (status BLOCKED)'],
  }, prov('Sidebar.tsx:219-220; MasterPricingAdminView.tsx:1-18; MasterDatabaseView.tsx:29; priceMaster.generated.ts:25,27; masterPriceAuthorization.ts:39-46,53,69-79')),
  rec({
    id: 'peran-pengguna',
    category: 'Akun & Peran',
    commonName: 'Peran Pengguna',
    indonesianSynonyms: ['peran', 'role', 'admin', 'estimator', 'direksi', 'client', 'klien', 'editor', 'pengguna', 'anggota tim'],
    englishTerms: ['user roles', 'roles', 'admin', 'estimator'],
    summary: 'Peran pengguna EZRAB: tepat 5 peran — Super Admin, Estimator, Direksi, Client, Editor.',
    details: [
      'Peran yang dapat diundang hanya 3: Estimator, Direksi, Client.',
      'Estimator: membantu penyusunan RAB, QTO, perhitungan volume, dan analisa harga satuan AHSP proyek.',
      'Direksi: melihat proyek, laporan eksekutif, memantau kemajuan Kurva S, dan memberikan persetujuan sesuai hak akses.',
      'Client: melihat informasi proyek, ringkasan penawaran RAB, dan dokumen yang dibagikan khusus untuk pemilik proyek.',
      'Tidak ada matriks izin formal per peran di kode — kewenangan tersebar di pemeriksaan kode; SUPER_ADMIN adalah admin workspace, BUKAN otoritas harga global.',
      'Tim paket Professional: Super Admin, Estimator, Client; paket Free tidak punya peran tim.',
    ],
    chatCan: [],
    chatCannot: ['mengubah peran pengguna dari chat'],
    menuId: null,
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('src/types/index.ts:8; TopBar.tsx:310-314; userManagementService.ts:22,36,51,64,77,104,127; AddUserModal.tsx:38-61; masterPriceAuthorization.ts:39-46; plans.ts (PROFESSIONAL_TEAM_ROLES)')),
  rec({
    id: 'tema',
    category: 'Akun & Peran',
    commonName: 'Tema Tampilan',
    indonesianSynonyms: ['tema', 'theme', 'mode gelap', 'dark mode', 'mode terang', 'tampilan', 'warna'],
    englishTerms: ['theme', 'dark mode', 'appearance'],
    summary: 'Tema tampilan — mode Terang, Gelap, atau mengikuti Sistem; plus tema premium berbasis gelap dan opsi aksen/kepadatan/gerak.',
    details: [
      'Mode: Terang, Gelap, Sistem; tombol cepat matahari/bulan di TopBar, pemilih lengkap di menu profil.',
      'Tema premium: Default, Blueprint, Midnight Gold, Emerald — selalu berbasis gelap.',
      'Penguncian tema premium saat ini adalah saklar UI client-side yang mengembalikan true sampai ada validasi subscription server — bukan keamanan.',
      'Tombol mode dinonaktifkan saat tema premium aktif.',
      'Opsi lain di konteks tema: aksen (biru/emerald/violet/amber), kepadatan, gerak.',
    ],
    chatCan: [],
    chatCannot: ['mengubah tema dari chat'],
    menuId: null,
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('ThemeContext.tsx:3-7,21-30,61,69-72,122-126; TopBar.tsx:37-42,598-600,1353-1360,1391-1400')),
  rec({
    id: 'billing-kredit',
    category: 'Akun & Peran',
    commonName: 'Paket & Kredit AI',
    indonesianSynonyms: ['paket', 'kredit', 'kredit ai', 'billing', 'langganan', 'harga paket', 'top up', 'topup', 'saldo kredit', 'free', 'starter', 'professional', 'business'],
    englishTerms: ['plans', 'billing', 'ai credits', 'subscription'],
    summary: 'Paket & kredit AI — Free, Starter, Professional, Business; kredit AI diukur per token terbobot; pembayaran via Midtrans (sandbox sebagai default).',
    details: [
      'Harga bulanan: Free Rp0, Starter Rp54.999, Professional Rp79.999, Business Rp159.999. Nama kanonis: Professional dan Business (bukan "Pro"/"Advanced").',
      'Batas proyek: Free 1, Starter 7, Professional 25, Business tanpa batas.',
      'Free mendapat 100 kredit AI SEKALI per akun (habis = habis, tanpa isi ulang otomatis); paket berbayar mendapat kredit bulanan: Starter 5.000, Professional 10.000, Business 30.000.',
      'Free hanya dapat memakai Chat AI — DED AI & AI Document nonaktif untuk Free berapa pun sisa kreditnya; top-up tidak tersedia untuk Free.',
      'Metering: 1 kredit = 200 token terbobot; token terbobot = token masuk × 1 + token keluar × 3; contoh kalibrasi: jawaban chat ±25 kredit, DED menengah ±750 kredit.',
      'Harga top-up tidak didefinisikan di kode (ditunda, O-10).',
      'Pembayaran via Midtrans; sandbox adalah default kecuali flag produksi diaktifkan; harga dari katalog server, kredit hanya dari webhook terverifikasi.',
      'Catatan: definisi hak paket belum ditegakkan di permukaan manapun (billing masih dormant).',
    ],
    chatCan: ['cek saldo kredit', 'top-up kredit (simulasi)', 'ganti paket (simulasi)'],
    chatCannot: ['top-up kredit nyata dan ganti paket nyata dari chat (keduanya simulasi)'],
    menuId: null,
    supportStatus: 'PARTIALLY_SUPPORTED',
    unsupportedCapabilities: ['penegakan hak paket di permukaan aplikasi (billing dormant)', 'harga top-up (belum didefinisikan)'],
  }, prov('src/billing/plans.ts:20-30,38,232-234,238-252,257-260,279-282,301-304,363-383; tokenMetering.ts:8-10,15-18,31,34,37; checkoutClient.ts:10-14,32-38,99-101; midtrans.js:27,32-33,39-43')),
  rec({
    id: 'batas-chat',
    category: 'Batasan',
    commonName: 'Batas Jujur Chat AI',
    indonesianSynonyms: ['batas', 'tidak bisa', 'limitasi', 'kekurangan', 'yang belum bisa', 'batasan chat'],
    englishTerms: ['limitations', 'cannot', 'limits'],
    summary: 'Batas jujur Chat AI — hal-hal yang TIDAK bisa dilakukan dari chat, beserta alasannya.',
    details: [
      'Mengubah harga master/database material: kewenangan admin global (tabel global_admins terpisah); penegakan server BLOCKED.',
      'Membuat atau mengubah jadwal: tidak ada tool penjadwalan di chat; arahkan ke menu Kurva S & Jadwal.',
      'Melihat gambar/DED: Chat AI tidak melihat gambar — analisis DED diarahkan ke fitur DED AI Estimate.',
      'LLM tidak punya tool untuk mengubah nama/data proyek — penggantian nama dilayani perintah deterministik "ubah nama proyek menjadi <nama baru>" atau menu Daftar Proyek.',
      'Pertanyaan info tidak mengubah data; penulisan RAB hanya lewat pratinjau + tombol Konfirmasi.',
      'Copilot (kanal CoAssistant) hanya menjawab — tidak mengubah RAB.',
      'Jalur quick-action server tidak dapat dijangkau (registry server dorman).',
    ],
    chatCan: [],
    chatCannot: ['mengubah harga master', 'membuat/mengubah jadwal', 'melihat gambar/DED', 'mengubah RAB tanpa pratinjau + Konfirmasi'],
    menuId: null,
    supportStatus: 'FULLY_SUPPORTED',
    unsupportedCapabilities: [],
  }, prov('prompt.ts:100 (aturan 5), :111 (aturan 11), :117 (aturan 15), :125 (aturan 22), :130 (aturan 27), :132-133 (aturan 29-30); masterPriceAuthorization.ts:39-46,53,69-79; coAssistantService.ts:65,335-339,641-644; skill-engine/definisi quick-action:9-20,75,136-147')),
];

export function getProductRecord(id: string): ProductKnowledgeRecord | null {
  return PRODUCT_KNOWLEDGE.find((r) => r.id === id) ?? null;
}
