/**
 * EZRAB Professional Project Export System - Type Definitions
 */

export type ExportPresetId = 
  | 'RAB'
  | 'BOQ'
  | 'RAB_BOQ'
  | 'RAB_BOQ_AHSP'
  | 'BOQ_MC0'
  | 'TENDER_PACKAGE'
  | 'COMPLETE_PACKAGE'
  | 'CUSTOM';

export type ExportSheetKey =
  | 'validation'
  | 'cover'
  | 'projectInfo'
  | 'estimateSummary'
  | 'rabRecap'
  | 'rabDetail'
  | 'boq'
  | 'boqMc0'
  | 'ahsp'
  | 'materials'
  | 'labor'
  | 'equipment'
  | 'schedule'
  | 'kurvaS'
  | 'cashflow'
  | 'notes';

export type ExportFormat = 'excel' | 'pdf' | 'both';

export type ExportAudience = 'all' | 'owner' | 'consultant' | 'contractor' | 'internal';

export interface ExportSheetMeta {
  key: ExportSheetKey;
  code: string; // e.g., '01_Cover', '07_BOQ_MC0'
  title: string;
  category: 'overview' | 'estimation' | 'quantity' | 'analysis' | 'management';
  description: string;
  defaultChecked: boolean;
  hasCostData: boolean; // false for boqMc0
}

export interface ExportSignaturesConfig {
  preparedByTitle?: string;
  preparedByName?: string;
  checkedByTitle?: string;
  checkedByName?: string;
  approvedByTitle?: string;
  approvedByName?: string;
}

export interface ExportPackageOptions {
  preset: ExportPresetId;
  format: ExportFormat;
  audience: ExportAudience;
  mcNumber?: string; // default 'MC-0'
  revisionOverride?: string;
  documentNumberOverride?: string;
  useLiveFormulas?: boolean;
  includeGanttChart?: boolean;
  includeKurvaSChart?: boolean;
  signatures?: ExportSignaturesConfig;
  customBrandColor?: string;
  // Granular sheet toggles
  sheets: Record<ExportSheetKey, boolean>;
}

export const ALL_EXPORT_SHEETS: ExportSheetMeta[] = [
  {
    key: 'validation',
    code: '00_Validasi',
    title: 'Lembar Validasi & Integritas Data',
    category: 'overview',
    description: 'Pemeriksaan kepatuhan matematis, status formula, total bobot WBS 100%, dan status Kurva-S.',
    defaultChecked: true,
    hasCostData: false,
  },
  {
    key: 'cover',
    code: '01_Cover',
    title: 'Halaman Judul (Cover)',
    category: 'overview',
    description: 'Halaman sampul resmi dengan branding, identitas proyek, ringkasan nilai, dan tanda tangan.',
    defaultChecked: true,
    hasCostData: true,
  },
  {
    key: 'projectInfo',
    code: '02_Project_Info',
    title: 'Informasi Proyek',
    category: 'overview',
    description: 'Data teknis dan legalitas proyek, lokasi, pemilik/klien, konsultan, dan parameter desain.',
    defaultChecked: true,
    hasCostData: false,
  },
  {
    key: 'estimateSummary',
    code: '03_Estimate_Summary',
    title: 'Ringkasan Eksekutif (Summary)',
    category: 'estimation',
    description: 'Dashboard finansial, distribusi biaya per divisi WBS, Pareto analisis 80/20, dan biaya per m².',
    defaultChecked: true,
    hasCostData: true,
  },
  {
    key: 'rabRecap',
    code: '04_RAB_Recapitulation',
    title: 'Rekapitulasi RAB',
    category: 'estimation',
    description: 'Ikhtisar total per divisi/kelompok WBS, subtotal, overhead, profit, PPN, dan kalimat terbilang.',
    defaultChecked: true,
    hasCostData: true,
  },
  {
    key: 'rabDetail',
    code: '05_RAB_Detail',
    title: 'Rincian RAB Detail',
    category: 'estimation',
    description: 'Daftar item pekerjaan lengkap dengan volume, satuan, harga satuan, jumlah, dan bobot persentase.',
    defaultChecked: true,
    hasCostData: true,
  },
  {
    key: 'boq',
    code: '06_BOQ',
    title: 'Bill of Quantities (BOQ Komersial)',
    category: 'quantity',
    description: 'Daftar kuantitas pekerjaan komersial untuk penawaran tender dan kontraktor.',
    defaultChecked: false,
    hasCostData: true,
  },
  {
    key: 'boqMc0',
    code: '07_BOQ_MC0',
    title: 'BOQ MC-0 (Baseline Fisik Tanpa Biaya)',
    category: 'quantity',
    description: 'Daftar kuantitas awal (MC-0) strictly TANPA harga, dilengkapi lokasi/area dan referensi gambar.',
    defaultChecked: false,
    hasCostData: false,
  },
  {
    key: 'ahsp',
    code: '08_AHSP',
    title: 'Analisa Harga Satuan Pekerjaan (AHSP)',
    category: 'analysis',
    description: 'Kartu analisa rincian koefisien bahan, upah, alat, overhead, dan profit standar SNI/PUPR.',
    defaultChecked: false,
    hasCostData: true,
  },
  {
    key: 'materials',
    code: '09_Materials',
    title: 'Daftar Harga Bahan (Material)',
    category: 'analysis',
    description: 'Daftar harga satuan material, spesifikasi teknis, supplier, lokasi, dan tanggal berlaku.',
    defaultChecked: false,
    hasCostData: true,
  },
  {
    key: 'labor',
    code: '10_Labor',
    title: 'Daftar Standar Upah Kerja (Labor)',
    category: 'analysis',
    description: 'Standar upah harian/jam tenaga kerja (tukang, pekerja, mandor, kepala tukang).',
    defaultChecked: false,
    hasCostData: true,
  },
  {
    key: 'equipment',
    code: '11_Equipment',
    title: 'Daftar Sewa & Alat Kerja (Equipment)',
    category: 'analysis',
    description: 'Daftar sewa alat berat, alat bantu, dan peralatan konstruksi per jam/hari.',
    defaultChecked: false,
    hasCostData: true,
  },
  {
    key: 'schedule',
    code: '12_Schedule',
    title: 'Jadwal Pelaksanaan (Time Schedule)',
    category: 'management',
    description: 'Durasi pekerjaan, tanggal mulai-selesai, predecessor, bobot mingguan, dan Gantt visual.',
    defaultChecked: false,
    hasCostData: false,
  },
  {
    key: 'kurvaS',
    code: '13_Kurva_S',
    title: 'Kurva S & Progres Kumulatif',
    category: 'management',
    description: 'Tabel distribusi bobot berkala rencana vs aktual dengan chart visual otomatis.',
    defaultChecked: false,
    hasCostData: false,
  },
  {
    key: 'cashflow',
    code: '14_Cashflow',
    title: 'Arus Kas Proyek (Cashflow Proyeksi)',
    category: 'management',
    description: 'Proyeksi penerimaan termin, pengeluaran mingguan, dan deviasi arus kas.',
    defaultChecked: false,
    hasCostData: true,
  },
  {
    key: 'notes',
    code: '15_Notes',
    title: 'Catatan Teknis & Syarat Umum',
    category: 'overview',
    description: 'Ruang lingkup, dasar analisa, syarat pembayaran, masa berlaku, dan klausul site instruction.',
    defaultChecked: true,
    hasCostData: false,
  },
];

export interface PresetMeta {
  id: ExportPresetId;
  name: string;
  badge: string;
  description: string;
  sheets: ExportSheetKey[];
  recommendedAudience: ExportAudience;
}

export const EXPORT_PRESETS: Record<ExportPresetId, PresetMeta> = {
  RAB: {
    id: 'RAB',
    name: '1. Standar RAB',
    badge: 'Populer',
    description: 'Paket estimasi standar mencakup Cover, Identitas, Rekapitulasi, Rincian RAB, dan Catatan Teknis.',
    sheets: ['cover', 'projectInfo', 'estimateSummary', 'rabRecap', 'rabDetail', 'notes'],
    recommendedAudience: 'owner',
  },
  BOQ: {
    id: 'BOQ',
    name: '2. Commercial BOQ',
    badge: 'Komersial',
    description: 'Bill of Quantities komersial lengkap dengan volume dan harga satuan untuk penawaran.',
    sheets: ['cover', 'projectInfo', 'boq', 'notes'],
    recommendedAudience: 'contractor',
  },
  RAB_BOQ: {
    id: 'RAB_BOQ',
    name: '3. RAB + BOQ',
    badge: 'Lengkap',
    description: 'Kombinasi Rencana Anggaran Biaya dan Bill of Quantities komersial dalam satu buku kerja.',
    sheets: ['cover', 'projectInfo', 'estimateSummary', 'rabRecap', 'rabDetail', 'boq', 'notes'],
    recommendedAudience: 'consultant',
  },
  RAB_BOQ_AHSP: {
    id: 'RAB_BOQ_AHSP',
    name: '4. RAB + BOQ + AHSP',
    badge: 'Tender Detail',
    description: 'Paket evaluasi mendalam mencakup rincian RAB, BOQ, dan kartu analisa harga satuan (AHSP).',
    sheets: ['cover', 'projectInfo', 'estimateSummary', 'rabRecap', 'rabDetail', 'boq', 'ahsp', 'notes'],
    recommendedAudience: 'consultant',
  },
  BOQ_MC0: {
    id: 'BOQ_MC0',
    name: '5. BOQ MC-0 (Baseline Fisik)',
    badge: 'Fisik / Lapangan',
    description: 'Baseline kuantitas awal pengukuran 0% (MC-0) murni kuantitas tanpa nilai finansial/harga.',
    sheets: ['cover', 'projectInfo', 'boqMc0', 'notes'],
    recommendedAudience: 'contractor',
  },
  TENDER_PACKAGE: {
    id: 'TENDER_PACKAGE',
    name: '6. Tender Submission Package',
    badge: 'Tender Resmi',
    description: 'Berkas lengkap lelang: RAB, BOQ, daftar harga bahan/upah/alat, jadwal waktu, dan Kurva S.',
    sheets: ['cover', 'projectInfo', 'estimateSummary', 'rabRecap', 'rabDetail', 'boq', 'materials', 'labor', 'equipment', 'schedule', 'kurvaS', 'notes'],
    recommendedAudience: 'contractor',
  },
  COMPLETE_PACKAGE: {
    id: 'COMPLETE_PACKAGE',
    name: '7. Complete Project Package',
    badge: 'All-In-One (15 Lembar)',
    description: 'Semua 15 dokumen dan lembar kerja proyek lengkap terstruktur dalam satu workbook presentasi.',
    sheets: [
      'cover',
      'projectInfo',
      'estimateSummary',
      'rabRecap',
      'rabDetail',
      'boq',
      'boqMc0',
      'ahsp',
      'materials',
      'labor',
      'equipment',
      'schedule',
      'kurvaS',
      'cashflow',
      'notes',
    ],
    recommendedAudience: 'all',
  },
  CUSTOM: {
    id: 'CUSTOM',
    name: 'Custom Export',
    badge: 'Kustom',
    description: 'Pilih sendiri dokumen dan lembar kerja spesifik sesuai kebutuhan pengajuan Anda.',
    sheets: ['cover', 'rabRecap', 'rabDetail'],
    recommendedAudience: 'internal',
  },
};
