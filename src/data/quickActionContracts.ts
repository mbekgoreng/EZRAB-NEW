/**
 * Canonical Quick Action Contracts for EZRAB AI CoAssistant
 *
 * Source of truth for 10 interactive conversational Quick Actions.
 * Guarantees consistent IDs, roles, risk levels, and follow-up strategies across frontend and backend.
 */

export type QuickActionRiskLevel = 'READ_ONLY' | 'POTENTIAL_MUTATION' | 'MUTATION';

export interface QuickActionChoice {
  id: string;
  label: string;
  description?: string;
  value: string;
  icon?: string;
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface QuickActionParameterDefinition {
  name: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean' | 'file';
  unit?: string;
  required: boolean;
  defaultValue?: any;
  options?: QuickActionChoice[];
  validation?: {
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
  };
}

export interface QuickActionContract {
  actionId: string;
  label: string;
  description: string;
  icon: string;
  category: 'ANALYSIS' | 'CALCULATION' | 'LOOKUP' | 'REPORT' | 'HELP' | 'MAINTENANCE';
  initialPrompt: string;
  intent: string;
  requiredContext: ('activeWorkspace' | 'activeProject' | 'activeItem' | 'activeFile')[];
  requiredParameters: string[];
  parametersSchema: QuickActionParameterDefinition[];
  followUpStrategy: string;
  toolName?: string;
  riskLevel: QuickActionRiskLevel;
  requiresConfirmation: boolean;
  allowedRoles: ('SUPER_ADMIN' | 'ESTIMATOR' | 'DIREKSI' | 'CLIENT')[];
  requiredSubscription: 'FREE' | 'PRO' | 'ENTERPRISE';
  enabled: boolean;
  version: string;
  initialChoices?: QuickActionChoice[];
}

export const QUICK_ACTION_CONTRACTS: Record<string, QuickActionContract> = {
  AUDIT_RAB: {
    actionId: 'AUDIT_RAB',
    label: 'Audit RAB',
    description: 'Periksa kelengkapan struktur, volume kosong, harga satuan, dan potensi duplikasi RAB',
    icon: 'CheckCircle2',
    category: 'ANALYSIS',
    initialPrompt: 'Bantu saya melakukan audit RAB',
    intent: 'RAB_ANALYSIS',
    requiredContext: ['activeWorkspace'],
    requiredParameters: ['rabSource', 'auditFocus'],
    parametersSchema: [
      {
        name: 'rabSource',
        label: 'Sumber RAB',
        type: 'select',
        required: true,
        defaultValue: 'CURRENT_PROJECT',
        options: [
          { id: 'CURRENT_PROJECT', label: 'RAB Proyek Saat Ini', description: 'Gunakan spreadsheet proyek aktif', value: 'CURRENT_PROJECT' },
          { id: 'UPLOAD_EXCEL', label: 'Upload File Excel', description: 'Audit file xlsx / csv eksternal', value: 'UPLOAD_EXCEL' },
          { id: 'UPLOAD_PDF', label: 'Upload File PDF', description: 'Ekstraksi dan audit file PDF RAB', value: 'UPLOAD_PDF' },
          { id: 'OTHER_PROJECT', label: 'Pilih Proyek Lain', description: 'Pilih dari daftar proyek workspace', value: 'OTHER_PROJECT' }
        ]
      },
      {
        name: 'auditFocus',
        label: 'Fokus Pemeriksaan',
        type: 'select',
        required: true,
        defaultValue: 'ALL',
        options: [
          { id: 'VOLUME_UNIT', label: 'Volume & Satuan', description: 'Cek volume kosong / minus', value: 'VOLUME_UNIT' },
          { id: 'PRICE_TOTAL', label: 'Harga & Total', description: 'Cek anomali harga satuan', value: 'PRICE_TOTAL' },
          { id: 'AHSP_CODE', label: 'Kode AHSP PUPR', description: 'Cek kesesuaian analisa AHSP', value: 'AHSP_CODE' },
          { id: 'DUPLICATION', label: 'Duplikasi Pekerjaan', description: 'Deteksi item pekerjaan ganda', value: 'DUPLICATION' },
          { id: 'ALL', label: 'Audit Menyeluruh', description: 'Periksa seluruh aspek RAB', value: 'ALL' }
        ]
      }
    ],
    initialChoices: [
      { id: 'CURRENT_PROJECT', label: 'RAB Proyek Saat Ini', description: 'Audit spreadsheet RAB aktif', value: 'CURRENT_PROJECT' },
      { id: 'UPLOAD_EXCEL', label: 'Upload File Excel', description: 'Audit file spreadsheet eksternal', value: 'UPLOAD_EXCEL' },
      { id: 'UPLOAD_PDF', label: 'Upload File PDF', description: 'Audit file dokumen RAB PDF', value: 'UPLOAD_PDF' },
      { id: 'OTHER_PROJECT', label: 'Pilih Proyek Lain', description: 'Pilih proyek lain dalam workspace', value: 'OTHER_PROJECT' }
    ],
    followUpStrategy: 'ASK_RAB_SOURCE_AND_FOCUS',
    toolName: 'audit_rab',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  HITUNG_VOLUME: {
    actionId: 'HITUNG_VOLUME',
    label: 'Hitung Volume',
    description: 'Bantu perhitungan volume pekerjaan (Quantity Takeoff) berdasarkan formula teknis terverifikasi',
    icon: 'Search',
    category: 'CALCULATION',
    initialPrompt: 'Bantu saya menghitung volume pekerjaan',
    intent: 'VOLUME_CALCULATION',
    requiredContext: ['activeWorkspace'],
    requiredParameters: ['workType', 'dimensions'],
    parametersSchema: [
      {
        name: 'workType',
        label: 'Jenis Pekerjaan',
        type: 'select',
        required: true,
        options: [
          { id: 'CONCRETE', label: 'Beton Bertulang', description: 'Pondasi, sloof, kolom, balok, pelat lantai (m³)', value: 'CONCRETE' },
          { id: 'EXCAVATION', label: 'Galian Tanah', description: 'Galian tanah pondasi dan parit (m³)', value: 'EXCAVATION' },
          { id: 'BACKFILL', label: 'Timbunan Tanah', description: 'Urugan tanah kembali & peninggian peil (m³)', value: 'BACKFILL' },
          { id: 'BRICK_MASONRY', label: 'Pasangan Dinding', description: 'Bata merah, bata ringan, hebel (m²)', value: 'BRICK_MASONRY' },
          { id: 'PLASTER_SKIM', label: 'Plesteran & Acian', description: 'Plesteran dinding 1:4 dan acian semen (m²)', value: 'PLASTER_SKIM' },
          { id: 'PAINTING', label: 'Pengecatan', description: 'Cat dinding interior & eksterior (m²)', value: 'PAINTING' },
          { id: 'FLOORING', label: 'Penutup Lantai', description: 'Pemasangan keramik, granit, vinyl (m²)', value: 'FLOORING' },
          { id: 'ROOF', label: 'Pekerjaan Atap', description: 'Rangka baja ringan & genteng penutup (m²)', value: 'ROOF' },
          { id: 'CUSTOM', label: 'Geometri Custom', description: 'Perhitungan rumus bentuk bebas', value: 'CUSTOM' }
        ]
      }
    ],
    initialChoices: [
      { id: 'CONCRETE', label: 'Beton Bertulang (m³)', description: 'Balok, kolom, sloof, dan pelat', value: 'CONCRETE' },
      { id: 'EXCAVATION', label: 'Galian Tanah (m³)', description: 'Galian pondasi dan saluran', value: 'EXCAVATION' },
      { id: 'BRICK_MASONRY', label: 'Pasangan Dinding (m²)', description: 'Bata merah dan bata ringan hebel', value: 'BRICK_MASONRY' },
      { id: 'PLASTER_SKIM', label: 'Plesteran & Acian (m²)', description: 'Plesteran tebal 15mm & acian semen', value: 'PLASTER_SKIM' },
      { id: 'PAINTING', label: 'Pengecatan (m²)', description: 'Pengecatan dinding dan plafon', value: 'PAINTING' },
      { id: 'FLOORING', label: 'Penutup Lantai (m²)', description: 'Keramik, granit, dan screed', value: 'FLOORING' },
      { id: 'ROOF', label: 'Rangka Atap (m²)', description: 'Rangka baja ringan dan penutup atap', value: 'ROOF' },
      { id: 'CUSTOM', label: 'Pekerjaan Custom', description: 'Dimensi spesifik lainnya', value: 'CUSTOM' }
    ],
    followUpStrategy: 'ASK_WORK_TYPE_AND_DIMENSIONS',
    toolName: 'calculate_quantity',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  CARI_AHSP: {
    actionId: 'CARI_AHSP',
    label: 'Cari AHSP',
    description: 'Pencarian analisa harga satuan pekerjaan resmi standar AHSP PUPR 2026',
    icon: 'Sparkles',
    category: 'LOOKUP',
    initialPrompt: 'Saya bantu mencari AHSP yang sesuai',
    intent: 'AHSP_LOOKUP',
    requiredContext: ['activeWorkspace'],
    requiredParameters: ['category', 'keyword'],
    parametersSchema: [
      {
        name: 'category',
        label: 'Kategori Pekerjaan',
        type: 'select',
        required: true,
        options: [
          { id: 'EARTHWORK', label: 'Pekerjaan Tanah', description: 'Galian, timbunan, pemadatan', value: 'EARTHWORK' },
          { id: 'CONCRETE', label: 'Pekerjaan Beton', description: 'Beton ready mix, site mix, pembesian, bekisting', value: 'CONCRETE' },
          { id: 'MASONRY', label: 'Pekerjaan Pasangan', description: 'Bata merah, batu kali, hebel', value: 'MASONRY' },
          { id: 'PLASTER', label: 'Plesteran & Acian', description: 'Plesteran dinding, plesteran lantai', value: 'PLASTER' },
          { id: 'FINISHING', label: 'Pekerjaan Finishing', description: 'Pengecatan, keramik, plafon gypsump', value: 'FINISHING' },
          { id: 'ROAD', label: 'Jalan & Perkerasan', description: 'Aspal hotmix, perkerasan beton, paving block', value: 'ROAD' },
          { id: 'DRAINAGE', label: 'Drainase & Saluran', description: 'U-Ditch, buis beton, saluran pasangan', value: 'DRAINAGE' },
          { id: 'WATER', label: 'Bangunan Air / SDA', description: 'Bronjong, riprap, pintu air', value: 'WATER' }
        ]
      }
    ],
    initialChoices: [
      { id: 'EARTHWORK', label: 'Pekerjaan Tanah', description: 'Galian, urugan, pemadatan tanah', value: 'EARTHWORK' },
      { id: 'CONCRETE', label: 'Pekerjaan Beton', description: 'Beton cor, pembesian, bekisting', value: 'CONCRETE' },
      { id: 'MASONRY', label: 'Pekerjaan Pasangan', description: 'Batu kali, bata merah, batako, hebel', value: 'MASONRY' },
      { id: 'FINISHING', label: 'Pekerjaan Finishing', description: 'Cat, keramik, plafon, kusen pintu/jendela', value: 'FINISHING' },
      { id: 'ROAD', label: 'Jalan & Perkerasan', description: 'Aspal AC-WC/AC-BC, rigid beton, paving', value: 'ROAD' },
      { id: 'DRAINAGE', label: 'Drainase & Saluran', description: 'U-ditch precast, gorong-gorong', value: 'DRAINAGE' }
    ],
    followUpStrategy: 'ASK_CATEGORY_AND_KEYWORD',
    toolName: 'search_ahsp',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  CARI_HARGA: {
    actionId: 'CARI_HARGA',
    label: 'Cari Harga',
    description: 'Pencarian harga pasar material, upah tukang, dan sewa alat konstruksi',
    icon: 'Search',
    category: 'LOOKUP',
    initialPrompt: 'Bantu saya mencari harga material, upah, atau alat',
    intent: 'PRICE_SEARCH',
    requiredContext: ['activeWorkspace'],
    requiredParameters: ['resourceType', 'keyword'],
    parametersSchema: [
      {
        name: 'resourceType',
        label: 'Jenis Sumber Daya',
        type: 'select',
        required: true,
        options: [
          { id: 'MATERIAL', label: 'Harga Material / Bahan', description: 'Semen, pasir, besi beton, bata, cat', value: 'MATERIAL' },
          { id: 'LABOR', label: 'Upah Tenaga Kerja', description: 'Tukang batu, tukang kayu, pekerja, mandor', value: 'LABOR' },
          { id: 'EQUIPMENT', label: 'Sewa Peralatan', description: 'Excavator, dump truck, molen beton, crane', value: 'EQUIPMENT' },
          { id: 'UNIT_PRICE', label: 'Harga Satuan Pekerjaan', description: 'Harga satuan komposit jadi', value: 'UNIT_PRICE' }
        ]
      }
    ],
    initialChoices: [
      { id: 'MATERIAL', label: 'Harga Material / Bahan', description: 'Semen, besi beton, pasir, bata, keramik', value: 'MATERIAL' },
      { id: 'LABOR', label: 'Upah Tenaga Kerja', description: 'Tukang batu, tukang besi, pekerja, mandor', value: 'LABOR' },
      { id: 'EQUIPMENT', label: 'Sewa Alat Berat & Mesin', description: 'Excavator, molen beton, stamper, genset', value: 'EQUIPMENT' },
      { id: 'UNIT_PRICE', label: 'Harga Satuan Jadi', description: 'Harga satuan pekerjaan per m², m³, atau unit', value: 'UNIT_PRICE' }
    ],
    followUpStrategy: 'ASK_RESOURCE_TYPE_AND_REGION',
    toolName: 'search_price',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  ANALISIS_DED: {
    actionId: 'ANALISIS_DED',
    label: 'Analisis DED',
    description: 'Ekstraksi elemen gambar kerja teknis, QTO terstruktur, dan deteksi konflik dokumen',
    icon: 'FileText',
    category: 'ANALYSIS',
    initialPrompt: 'Bantu saya menganalisis dokumen DED',
    intent: 'DED_ANALYSIS',
    requiredContext: ['activeWorkspace'],
    requiredParameters: ['documentSource', 'analysisDiscipline'],
    parametersSchema: [
      {
        name: 'documentSource',
        label: 'Sumber Dokumen',
        type: 'select',
        required: true,
        options: [
          { id: 'UPLOAD_PDF', label: 'Upload Dokumen PDF', description: 'Upload file gambar DED PDF', value: 'UPLOAD_PDF' },
          { id: 'UPLOAD_IMAGE', label: 'Upload Gambar (JPG/PNG)', description: 'Upload gambar denah/potongan', value: 'UPLOAD_IMAGE' },
          { id: 'EXISTING_DOCS', label: 'Gunakan Dokumen Proyek', description: 'Gunakan lampiran proyek aktif', value: 'EXISTING_DOCS' }
        ]
      }
    ],
    initialChoices: [
      { id: 'UPLOAD_PDF', label: 'Upload File PDF DED', description: 'Upload dokumen gambar kerja format PDF', value: 'UPLOAD_PDF' },
      { id: 'UPLOAD_IMAGE', label: 'Upload Gambar (JPG/PNG)', description: 'Upload gambar denah arsitektur / struktur', value: 'UPLOAD_IMAGE' },
      { id: 'EXISTING_DOCS', label: 'Gunakan Dokumen Proyek', description: 'Analisis file yang telah tersimpan di proyek', value: 'EXISTING_DOCS' }
    ],
    followUpStrategy: 'ASK_DED_SOURCE_AND_DISCIPLINE',
    toolName: 'analyze_ded',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'PRO',
    enabled: true,
    version: '1.0.0'
  },

  BUAT_LAPORAN: {
    actionId: 'BUAT_LAPORAN',
    label: 'Buat Laporan',
    description: 'Penyusunan draft laporan eksekutif, progres mingguan, kurva S, dan audit biaya',
    icon: 'FileText',
    category: 'REPORT',
    initialPrompt: 'Bantu saya membuat laporan proyek',
    intent: 'REPORT_GENERATION',
    requiredContext: ['activeWorkspace', 'activeProject'],
    requiredParameters: ['reportType', 'period'],
    parametersSchema: [
      {
        name: 'reportType',
        label: 'Jenis Laporan',
        type: 'select',
        required: true,
        options: [
          { id: 'RAB_SUMMARY', label: 'Ringkasan Eksekutif RAB', description: 'Grand total, rekapitulasi, & PPN 11%', value: 'RAB_SUMMARY' },
          { id: 'WEEKLY_PROGRESS', label: 'Laporan Mingguan Progres', description: 'Deviasi mingguan rencana vs aktual', value: 'WEEKLY_PROGRESS' },
          { id: 'COST_EXPENDITURE', label: 'Laporan Realisasi Biaya', description: 'Cashflow dan pengeluaran biaya proyek', value: 'COST_EXPENDITURE' },
          { id: 'MATERIAL_RECAP', label: 'Rekapitulasi Bahan & Alat', description: 'Kebutuhan material & sewa alat', value: 'MATERIAL_RECAP' },
          { id: 'AUDIT_REPORT', label: 'Laporan Hasil Audit', description: 'Temuan anomali & rekomendasi biaya', value: 'AUDIT_REPORT' }
        ]
      }
    ],
    initialChoices: [
      { id: 'RAB_SUMMARY', label: 'Ringkasan Eksekutif RAB', description: 'Rekapitulasi biaya & grand total', value: 'RAB_SUMMARY' },
      { id: 'WEEKLY_PROGRESS', label: 'Laporan Mingguan Progres', description: 'Progres fisik rencana vs realisasi', value: 'WEEKLY_PROGRESS' },
      { id: 'COST_EXPENDITURE', label: 'Laporan Realisasi Biaya', description: 'Pengeluaran anggaran proyek', value: 'COST_EXPENDITURE' },
      { id: 'AUDIT_REPORT', label: 'Laporan Hasil Audit Biaya', description: 'Ringkasan temuan anomali RAB', value: 'AUDIT_REPORT' }
    ],
    followUpStrategy: 'ASK_REPORT_TYPE_AND_PERIOD',
    toolName: 'generate_report',
    riskLevel: 'POTENTIAL_MUTATION',
    requiresConfirmation: true,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  PERIKSA_KURVA_S: {
    actionId: 'PERIKSA_KURVA_S',
    label: 'Periksa Kurva S',
    description: 'Analisis distribusi bobot pekerjaan, deviasi rencana vs realisasi, dan jalur kritis',
    icon: 'CheckCircle2',
    category: 'ANALYSIS',
    initialPrompt: 'Bantu saya memeriksa Kurva S proyek',
    intent: 'CURVE_S_GENERATION',
    requiredContext: ['activeWorkspace', 'activeProject'],
    requiredParameters: ['analysisFocus'],
    parametersSchema: [
      {
        name: 'analysisFocus',
        label: 'Fokus Pemeriksaan',
        type: 'select',
        required: true,
        defaultValue: 'DEVIATION_ANALYSIS',
        options: [
          { id: 'PROGRESS_WEIGHT', label: 'Distribusi Bobot Pekerjaan', description: 'Persentase bobot tiap mata pembayaran', value: 'PROGRESS_WEIGHT' },
          { id: 'PLANNED_VS_ACTUAL', label: 'Rencana vs Realisasi Progres', description: 'Perbandingan kurva rencana vs aktual', value: 'PLANNED_VS_ACTUAL' },
          { id: 'DEVIATION_ANALYSIS', label: 'Analisis Deviasi & Keterlambatan', description: 'Deviasi (+) mendahului atau (-) terlambat', value: 'DEVIATION_ANALYSIS' },
          { id: 'CRITICAL_PATH', label: 'Jalur Kritis WBS', description: 'Pekerjaan pada critical path', value: 'CRITICAL_PATH' },
          { id: 'ALL', label: 'Evaluasi Menyeluruh', description: 'Audit menyeluruh jadwal dan Kurva S', value: 'ALL' }
        ]
      }
    ],
    initialChoices: [
      { id: 'DEVIATION_ANALYSIS', label: 'Analisis Deviasi & Keterlambatan', description: 'Evaluasi deviasi progres fisik', value: 'DEVIATION_ANALYSIS' },
      { id: 'PROGRESS_WEIGHT', label: 'Distribusi Bobot Pekerjaan (%)', description: 'Pemeriksaan total bobot 100%', value: 'PROGRESS_WEIGHT' },
      { id: 'CRITICAL_PATH', label: 'Jalur Kritis & Durasi WBS', description: 'Analisis item pekerjaan berisiko', value: 'CRITICAL_PATH' },
      { id: 'ALL', label: 'Evaluasi Menyeluruh Kurva S', description: 'Pemeriksaan lengkap kurva S & timeline', value: 'ALL' }
    ],
    followUpStrategy: 'ASK_PROJECT_AND_FOCUS',
    toolName: 'inspect_curve_s',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  JELASKAN_ITEM: {
    actionId: 'JELASKAN_ITEM',
    label: 'Jelaskan Item',
    description: 'Penjelasan rinci rumus perhitungan, koefisien AHSP, dan subtotal item pekerjaan',
    icon: 'FileText',
    category: 'HELP',
    initialPrompt: 'Item pekerjaan atau data apa yang ingin Anda jelaskan?',
    intent: 'EXPLAIN_CALCULATION',
    requiredContext: ['activeWorkspace'],
    requiredParameters: ['targetItem'],
    parametersSchema: [
      {
        name: 'targetItem',
        label: 'Item Pekerjaan',
        type: 'string',
        required: true
      }
    ],
    initialChoices: [
      { id: 'ACTIVE_SELECTED_ITEM', label: 'Item yang Sedang Dipilih', description: 'Jelaskan item yang aktif di spreadsheet', value: 'ACTIVE_SELECTED_ITEM' },
      { id: 'LARGEST_COST_ITEM', label: 'Item Biaya Terbesar (Pareto 80/20)', description: 'Jelaskan item dengan bobot biaya tertinggi', value: 'LARGEST_COST_ITEM' },
      { id: 'CONCRETE_WORK', label: 'Pekerjaan Beton & Pembesian', description: 'Jelaskan formula perhitungan beton & besi', value: 'CONCRETE_WORK' },
      { id: 'OTHER_ITEM', label: 'Ketik Nama Item Tertentu', description: 'Sebutkan nama item pekerjaan lainnya', value: 'OTHER_ITEM' }
    ],
    followUpStrategy: 'RESOLVE_ACTIVE_ITEM_OR_ASK',
    toolName: 'explain_item',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  RECALCULATE: {
    actionId: 'RECALCULATE',
    label: 'Recalculate',
    description: 'Rekalkulasi deterministik volume, harga satuan, PPN, dan grand total RAB dengan preview perbandingan',
    icon: 'CheckCircle2',
    category: 'MAINTENANCE',
    initialPrompt: 'Bantu saya menghitung ulang RAB',
    intent: 'RECALCULATE_RAB',
    requiredContext: ['activeWorkspace', 'activeProject'],
    requiredParameters: ['scope'],
    parametersSchema: [
      {
        name: 'scope',
        label: 'Cakupan Rekalkulasi',
        type: 'select',
        required: true,
        defaultValue: 'ALL_RAB',
        options: [
          { id: 'ALL_RAB', label: 'Seluruh RAB & Rekapitulasi', description: 'Hitung ulang seluruh volume, harga, subtotal, dan PPN', value: 'ALL_RAB' },
          { id: 'CHANGED_ITEMS', label: 'Item yang Mengalami Perubahan', description: 'Hanya rekalkulasi baris pekerjaan yang diedit', value: 'CHANGED_ITEMS' },
          { id: 'QUANTITIES_ONLY', label: 'Hanya Volume Pekerjaan', description: 'Perbarui subtotal dari volume terbaru', value: 'QUANTITIES_ONLY' },
          { id: 'PRICES_ONLY', label: 'Hanya Harga Satuan & AHSP', description: 'Perbarui subtotal dari harga satuan terkini', value: 'PRICES_ONLY' },
          { id: 'TAX_AND_OVERHEAD', label: 'Pajak (PPN 11%) & Overhead Profit', description: 'Hitung ulang nilai PPN dan overhead', value: 'TAX_AND_OVERHEAD' }
        ]
      }
    ],
    initialChoices: [
      { id: 'ALL_RAB', label: 'Seluruh RAB & Rekapitulasi', description: 'Hitung ulang seluruh baris dan grand total', value: 'ALL_RAB' },
      { id: 'CHANGED_ITEMS', label: 'Hanya Item yang Berubah', description: 'Rekalkulasi parsial item yang diedit', value: 'CHANGED_ITEMS' },
      { id: 'TAX_AND_OVERHEAD', label: 'Pajak PPN 11% & Overhead', description: 'Perbarui rekapitulasi pajak & profit', value: 'TAX_AND_OVERHEAD' }
    ],
    followUpStrategy: 'PREVIEW_DIFF_AND_CONFIRM',
    toolName: 'recalculate_rab',
    riskLevel: 'MUTATION',
    requiresConfirmation: true,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  },

  BANTUAN_FITUR: {
    actionId: 'BANTUAN_FITUR',
    label: 'Bantuan Fitur',
    description: 'Panduan interaktif cara penggunaan fitur-fitur platform EZRAB',
    icon: 'Sparkles',
    category: 'HELP',
    initialPrompt: 'Saya bisa membantu Anda menggunakan EZRAB. Fitur apa yang ingin Anda pelajari?',
    intent: 'BASIC_HELP',
    requiredContext: ['activeWorkspace'],
    requiredParameters: ['featureTopic'],
    parametersSchema: [
      {
        name: 'featureTopic',
        label: 'Modul Fitur',
        type: 'select',
        required: true,
        options: [
          { id: 'PROJECT_CREATION', label: 'Cara Membuat Proyek Baru', description: 'Inisialisasi data proyek & informasi awal', value: 'PROJECT_CREATION' },
          { id: 'RAB_WIZARD', label: 'Cara Membuat RAB Otomatis', description: 'Gunakan interactive wizard Type 36–300', value: 'RAB_WIZARD' },
          { id: 'SPREADSHEET_RAB', label: 'Cara Menggunakan Spreadsheet RAB', description: 'Formula, WBS, subtotal, dan rekalkulasi', value: 'SPREADSHEET_RAB' },
          { id: 'AHSP_LOOKUP', label: 'Cara Mencari Analisa AHSP 2026', description: 'Database koefisien PUPR resmi', value: 'AHSP_LOOKUP' },
          { id: 'QTO_CALCULATION', label: 'Cara Menghitung Volume QTO', description: 'Rumus geometri dan quantity takeoff', value: 'QTO_CALCULATION' },
          { id: 'DED_ANALYSIS', label: 'Cara Analisis Gambar DED', description: 'Ekstraksi gambar kerja arsitektur & struktur', value: 'DED_ANALYSIS' },
          { id: 'CURVE_S', label: 'Cara Menggunakan Kurva S', description: 'Distribusi bobot & monitoring deviasi', value: 'CURVE_S' },
          { id: 'EXPORT_REPORTS', label: 'Cara Ekspor Excel & PDF', description: 'Cetak dan ekspor dokumen resmi proyek', value: 'EXPORT_REPORTS' }
        ]
      }
    ],
    initialChoices: [
      { id: 'PROJECT_CREATION', label: '1. Membuat Proyek Baru', description: 'Langkah awal inisialisasi proyek di EZRAB', value: 'PROJECT_CREATION' },
      { id: 'RAB_WIZARD', label: '2. Wizard RAB Otomatis', description: 'Pembuatan estimasi cepat dari katalog rumah', value: 'RAB_WIZARD' },
      { id: 'SPREADSHEET_RAB', label: '3. Spreadsheet RAB Interaktif', description: 'Pengelolaan baris RAB & formula deterministik', value: 'SPREADSHEET_RAB' },
      { id: 'AHSP_LOOKUP', label: '4. Database AHSP PUPR 2026', description: 'Pencarian analisa harga satuan terverifikasi', value: 'AHSP_LOOKUP' },
      { id: 'CURVE_S', label: '5. Kurva S & Manajemen Jadwal', description: 'Pemantauan deviasi progres rencana vs realisasi', value: 'CURVE_S' },
      { id: 'EXPORT_REPORTS', label: '6. Ekspor Laporan Excel / PDF', description: 'Format cetak resmi laporan proyek', value: 'EXPORT_REPORTS' }
    ],
    followUpStrategy: 'OFFER_FEATURE_MODULES',
    toolName: 'get_feature_help',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    enabled: true,
    version: '1.0.0'
  }
};

export const QUICK_ACTIONS_LIST: QuickActionContract[] = Object.values(QUICK_ACTION_CONTRACTS);
