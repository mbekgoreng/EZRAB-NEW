/**
 * EZRAB Backup & Restore
 * ======================
 * Export/import seluruh dataset bisnis sebagai file JSON.
 *
 * FORMAT (v1 — ekstensi aditif, file v1 lama tetap terbaca):
 * - `datasets`: nilai TERDEKODE untuk kunci envelope (hardenedStorage:
 *   loadVersioned/saveVersioned). Dipulihkan lewat saveVersioned.
 * - `rawDatasets`: string MENTAH localStorage (byte-for-byte) untuk kunci
 *   yang dibaca/tulis aplikasi sebagai JSON mentah atau string polos.
 *   Dipulihkan lewat localStorage.setItem langsung, sehingga bentuk
 *   penyimpanan asli (termasuk envelope kustom `ezrab_prod_progress_history`)
 *   dipertahankan persis.
 * - Kunci dinamis berawalan (`ezrab_chat_draft_`, `ezrab_active_conversation_v2_`,
 *   `ezrab_active_ded_analysis_`, `ezrab_estimator_kurva_weeks_`,
 *   `ezrab:wizard-draft:`, `ezrab:custom_templates:`) dipindai
 *   saat ekspor dan disimpan di `rawDatasets` dengan nama kunci lengkapnya.
 *
 * Guarantees:
 * - Backup mencakup SEMUA keluarga entitas bisnis (bukan hanya 10 dataset
 *   proyek): percakapan, draf AI, analisis DED, data DocAI, harga kustom,
 *   asumsi harga, kunci finalisasi, riwayat progres, desain, log aktivitas,
 *   audit trail (termasuk audit mutasi AI), overlay & riwayat harga master,
 *   kop perusahaan, template dokumen kustom, dan draf wizard dokumen.
 *   Lihat BACKUP_DATASET_LABELS untuk daftar lengkap.
 * - Restore memvalidasi struktur SEBELUM menimpa apapun; file yang gagal
 *   validasi tidak menulis satu kunci pun.
 * - Dataset yang TIDAK ADA di file backup DIBIARKAN UTUH (tidak dikosongkan)
 *   — jadi memulihkan backup lama (sebelum keluarga baru ditambahkan) tidak
 *   pernah menghancurkan data yang tidak tercakup backup itu.
 * - Restore bersifat REPLACE per dataset (bukan merge): seluruh isi satu
 *   dataset ditimpa dengan isi backup — proyek/item yang ada di backup DAN
 *   di browser diganti versinya dari backup, TIDAK pernah diduplikasi.
 *   Memulihkan backup yang sama dua kali bersifat idempotent.
 * - Restore TIDAK PERNAH menulis overlay harga master admin, riwayat harga
 *   master, dan feed perubahan harga (§3f): ketiganya adalah konfigurasi
 *   admin khusus browser ini (scope LOCAL_BROWSER, hanya ditulis layanan
 *   apply admin yang tergating). Ketiganya tetap tersimpan di file backup
 *   sebagai arsip, tetapi restore melewatinya dan melaporkannya sebagai
 *   dilewati — sehingga konfigurasi harga admin tidak pernah berpindah
 *   browser/pengguna lewat file backup. Data ketiga kunci di browser ini
 *   dibiarkan utuh. TRADE-OFF yang disengaja: restore tidak dapat
 *   mengembalikan overlay ke kondisi saat backup dibuat; overlay dikelola
 *   lewat UI harga master (apply/rollback), bukan lewat restore. Tidak ada
 *   pemeriksaan "apakah sesi ini admin" di jalur restore: identitas lokal
 *   satu-satunya yang jujur adalah anonim dan peran demo adalah UX saja
 *   (masterPriceAuthorization.ts) — gating pada peran demo hanya teater
 *   keamanan karena dapat di-flip lewat DevTools (P1-03).
 * - Restore bersifat key-by-key (localStorage tidak punya transaksi):
 *   kegagalan di tengah jalan dilaporkan dengan daftar kunci yang sudah
 *   dipulihkan + kunci yang gagal, dan backup pengaman memungkinkan recovery.
 * - Tidak mengeksekusi konten file (pure data, JSON.parse only).
 * - Tidak menyertakan secret/token/kredensial, peran/pengguna, sesi login,
 *   preferensi tampilan, atau URL sinkron (bisa mengandung kunci API).
 *   Daftar pengecualian didokumentasikan di BACKUP_EXCLUDED_NOTE.
 *
 * BATASAN (didokumentasikan, bukan disembunyikan):
 * - Backup adalah file lokal yang diunduh pengguna — TIDAK ada salinan
 *   server. Kehilangan file backup = kehilangan jaring pengaman.
 * - Restore sebagian masih mungkin bila penulisan gagal di tengah jalan
 *   (mis. kuota penuh); pemulihan memakai backup pengaman.
 * - Ekspor sinkron: dibenarkan karena input dibatasi kuota localStorage
 *   (~5 MB); JSON.stringify pada volume itu selesai < 1 detik.
 * - Impor ditolak di atas MAX_IMPORT_BYTES (50 MB) sebelum parsing.
 */

import { loadVersioned, saveVersioned, STORAGE_SCHEMA_VERSION } from './hardenedStorage';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_PREFIX = 'ezrab-backup-';
export const BACKUP_SAFETY_FILE_PREFIX = 'ezrab-backup-pengaman-';

/** Impor di atas batas ini ditolak sebelum JSON.parse (mencegah tab freeze). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
/** Pengingat ekspor muncul bila tidak pernah ekspor / ekspor terakhir lebih lama dari ini. */
export const BACKUP_REMINDER_DAYS = 30;

/** Slot lokal untuk salinan backup pengaman terakhir (best-effort; unduhan file tetap utama). */
export const SAFETY_SLOT_KEY = 'ezrab_backup_safety_slot_v1';
/** Stempel waktu ekspor terakhir (ISO) — metadata ekspor, BUKAN data bisnis; tidak ikut di-backup. */
export const LAST_EXPORT_KEY = 'ezrab_backup_last_export_v1';

/** Dataset keys included in backup (same 10 as ProjectContext) — envelope (decoded). */
export const BACKUP_DATASET_KEYS = [
  'ezrab_prod_projects',
  'ezrab_prod_rab_items',
  'ezrab_prod_work_items',
  'ezrab_prod_calculation_runs',
  'ezrab_prod_qto_items',
  'ezrab_prod_qto_rab_mappings',
  'ezrab_prod_schedule_tasks',
  'ezrab_prod_price_overrides',
  'ezrab_prod_version_snapshots',
  'ezrab_prod_estimate_versions',
] as const;

/** Keluarga envelope tambahan (hardenedStorage) — nilai terdekode di `datasets`. */
export const BACKUP_ENVELOPE_DATASET_KEYS = [
  'ezrab_prod_finalization_keys',
  'ezrab_prod_ai_drafts',
  'ezrab_prod_ai_intake_contexts',
  'ezrab_prod_ai_home_state',
  'ezrab_prod_ai_memories',
  'ezrab_prod_ai_preferences',
  'ezrab_prod_ai_memory_tombstones',
  'ezrab_prod_ai_agent_plans',
  'ezrab_prod_ai_tool_executions',
] as const;

/** Kunci raw (JSON mentah / string polos) — string mentah di `rawDatasets`. */
export const BACKUP_RAW_DATASET_KEYS = [
  // Percakapan Chat AI
  'ezrab_unified_conversations_v2',
  'ezrab_unified_conversations_v2_deleted',
  'ezrab_magic_ai_sessions_v1',
  // DED
  'ezrab_ded_analyses_v2',
  'ezrab_dedai_drafts_v1',
  'ezrab_ded_attachment_v1',
  // Document AI
  'ezrab_docai_drafts_v1',
  'ezrab_docai_history_v1',
  'ezrab_docai_library_v1',
  'ezrab_docai_templates_v1',
  'ezrab_docai_company_v1',
  // Harga & material kustom
  'ezrab_custom_ahsp_v1',
  'ezrab_user_materials_v1',
  'ezrab_user_material_prices_v1',
  'ezrab_price_assumptions_v1',
  'ezrab_project_prices_v2',
  'ezrab_project_overrides_v2',
  'ezrab_market_review_v1',
  // Proyek & riwayat
  'ezrab_prod_progress_history',
  'ezrab_designs',
  'ezrab_db_activities',
  'ezrab_project_material_specs',
  'ezrab_project_backups',
  'ezrab_global_estimation_settings_v1',
  'ezrab_custom_rab_templates',
  'ezrab_template_usage_v1',
  // Audit trail (riwayat, bukan data transaksional)
  'ezrab_price_audit_v2',
  'ezrab_settings_audit_log_v1',
  'ezrab_ai_operations_v1',
  'ezrab_ai_action_audit_v1',
  'ezrab_ai_feedback_local_v1',
  'ezrab_ai_mutation_audit_v1',
  // Harga master (admin) — overlay, riwayat apply, feed perubahan.
  // Ikut di-EKSPOR sebagai arsip; TIDAK PERNAH dipulihkan — lihat
  // BACKUP_RESTORE_SKIPPED_ADMIN_KEYS di bawah (§3f).
  'ezrab.adminMasterPriceOverlay.v1',
  'ezrab.masterPriceHistory.v1',
  'ezrab.priceChangeFeed.v1',
  // Kop perusahaan dokumen (aset kop surat, bisa memuat gambar base64)
  'ezrab:company:headers',
  // Penunjuk / penanda string polos
  'ezrab_prod_active_project_id',
  'ezrab_prod_seeded_v1',
  'ezrab_premium_demo_v1',
] as const;

/**
 * Kunci admin-only yang TIDAK PERNAH ditulis ulang oleh restore (§3f).
 *
 * Ketiganya hanya ditulis oleh layanan apply harga master admin yang
 * tergating (masterPriceApply.ts) dan berscope LOCAL_BROWSER: overlay
 * adalah harga efektif yang diterapkan admin, riwayat adalah jejak audit
 * apply-nya, dan feed adalah turunan apply yang dikonsumsi mesin adopsi
 * §10. Memulihkan ketiganya dari file backup akan memindahkan konfigurasi
 * harga admin lintas browser/pengguna — dan memulihkan riwayat/feed tanpa
 * overlay akan menciptakan entri audit/adopsi hantu untuk apply yang tidak
 * pernah terjadi di browser ini. Karena itu restore melewati ketiganya
 * (nilai lokal dibiarkan utuh) dan melaporkannya sebagai dilewati, baik di
 * pratinjau validasi maupun di laporan hasil restore.
 *
 * Ketiganya TETAP ikut di-ekspor (lihat BACKUP_RAW_DATASET_KEYS) — file
 * backup tetap menjadi arsip lengkap, format v1 tidak berubah, dan file
 * lama tetap terbaca.
 */
export const BACKUP_RESTORE_SKIPPED_ADMIN_KEYS = [
  'ezrab.adminMasterPriceOverlay.v1',
  'ezrab.masterPriceHistory.v1',
  'ezrab.priceChangeFeed.v1',
] as const;

/** Awalan kunci dinamis (per proyek / per percakapan) — dipindai saat ekspor. */
export const BACKUP_RAW_KEY_PREFIXES = [
  'ezrab_chat_draft_',
  'ezrab_active_conversation_v2_',
  'ezrab_active_ded_analysis_',
  'ezrab_estimator_kurva_weeks_',
  // Draf wizard paket dokumen per proyek (object JSON).
  'ezrab:wizard-draft:',
  // Template dokumen kustom per scope (array TemplateDefinition).
  'ezrab:custom_templates:',
] as const;

/** Bentuk yang diharapkan tiap kunci envelope di `datasets`. */
const ENVELOPE_DATASET_SHAPES: Record<string, 'array' | 'object'> = {
  ezrab_prod_projects: 'array',
  ezrab_prod_rab_items: 'array',
  ezrab_prod_work_items: 'array',
  ezrab_prod_calculation_runs: 'array',
  ezrab_prod_qto_items: 'array',
  ezrab_prod_qto_rab_mappings: 'array',
  ezrab_prod_schedule_tasks: 'array',
  ezrab_prod_price_overrides: 'array',
  ezrab_prod_version_snapshots: 'array',
  ezrab_prod_estimate_versions: 'array',
  ezrab_prod_finalization_keys: 'object',
  ezrab_prod_ai_drafts: 'object',
  ezrab_prod_ai_intake_contexts: 'object',
  ezrab_prod_ai_home_state: 'object',
  ezrab_prod_ai_memories: 'object',
  ezrab_prod_ai_preferences: 'object',
  ezrab_prod_ai_memory_tombstones: 'object',
  ezrab_prod_ai_agent_plans: 'object',
  ezrab_prod_ai_tool_executions: 'object',
};

/** Bentuk yang diharapkan tiap kunci raw di `rawDatasets`. */
const RAW_DATASET_SHAPES: Record<string, 'array' | 'object' | 'string'> = {
  ezrab_unified_conversations_v2: 'array',
  ezrab_unified_conversations_v2_deleted: 'object',
  ezrab_magic_ai_sessions_v1: 'array',
  ezrab_ded_analyses_v2: 'array',
  ezrab_dedai_drafts_v1: 'array',
  ezrab_ded_attachment_v1: 'object',
  ezrab_docai_drafts_v1: 'array',
  ezrab_docai_history_v1: 'array',
  ezrab_docai_library_v1: 'array',
  ezrab_docai_templates_v1: 'array',
  ezrab_docai_company_v1: 'array',
  ezrab_custom_ahsp_v1: 'array',
  ezrab_user_materials_v1: 'array',
  ezrab_user_material_prices_v1: 'array',
  ezrab_price_assumptions_v1: 'array',
  ezrab_project_prices_v2: 'object',
  ezrab_project_overrides_v2: 'object',
  ezrab_market_review_v1: 'object',
  ezrab_prod_progress_history: 'object',
  ezrab_designs: 'object',
  ezrab_db_activities: 'array',
  ezrab_project_material_specs: 'object',
  ezrab_project_backups: 'array',
  ezrab_global_estimation_settings_v1: 'object',
  ezrab_custom_rab_templates: 'array',
  ezrab_template_usage_v1: 'object',
  ezrab_price_audit_v2: 'array',
  ezrab_settings_audit_log_v1: 'array',
  ezrab_ai_operations_v1: 'array',
  ezrab_ai_action_audit_v1: 'array',
  ezrab_ai_feedback_local_v1: 'array',
  ezrab_ai_mutation_audit_v1: 'array',
  'ezrab.adminMasterPriceOverlay.v1': 'array',
  'ezrab.masterPriceHistory.v1': 'array',
  'ezrab.priceChangeFeed.v1': 'array',
  'ezrab:company:headers': 'array',
  ezrab_prod_active_project_id: 'string',
  ezrab_prod_seeded_v1: 'string',
  ezrab_premium_demo_v1: 'string',
};

/** Bentuk yang diharapkan tiap keluarga awalan dinamis. */
const PREFIX_SHAPES: Record<string, 'array' | 'object' | 'string' | 'number-string'> = {
  ezrab_chat_draft_: 'object',
  ezrab_active_conversation_v2_: 'string',
  ezrab_active_ded_analysis_: 'string',
  ezrab_estimator_kurva_weeks_: 'number-string',
  'ezrab:wizard-draft:': 'object',
  'ezrab:custom_templates:': 'array',
};

/** Label Indonesia untuk UI (ringkasan ekspor / pratinjau impor). */
export const BACKUP_DATASET_LABELS: Record<string, string> = {
  ezrab_prod_projects: 'Proyek',
  ezrab_prod_rab_items: 'Item RAB',
  ezrab_prod_work_items: 'Item pekerjaan',
  ezrab_prod_calculation_runs: 'Riwayat perhitungan',
  ezrab_prod_qto_items: 'Item QTO',
  ezrab_prod_qto_rab_mappings: 'Pemetaan QTO–RAB',
  ezrab_prod_schedule_tasks: 'Tugas jadwal',
  ezrab_prod_price_overrides: 'Override harga proyek',
  ezrab_prod_version_snapshots: 'Snapshot versi',
  ezrab_prod_estimate_versions: 'Versi estimasi',
  ezrab_prod_finalization_keys: 'Kunci finalisasi (anti-duplikat transfer)',
  ezrab_prod_ai_drafts: 'Draf RAB AI',
  ezrab_prod_ai_intake_contexts: 'Konteks intake AI',
  ezrab_prod_ai_home_state: 'Status beranda AI',
  ezrab_prod_ai_memories: 'Memori AI',
  ezrab_prod_ai_preferences: 'Preferensi AI',
  ezrab_prod_ai_memory_tombstones: 'Tombstone memori AI',
  ezrab_prod_ai_agent_plans: 'Rencana agen AI',
  ezrab_prod_ai_tool_executions: 'Jejak eksekusi tool AI',
  ezrab_unified_conversations_v2: 'Percakapan Chat AI',
  ezrab_unified_conversations_v2_deleted: 'Tombstone percakapan terhapus',
  ezrab_magic_ai_sessions_v1: 'Sesi Magic AI (legacy)',
  ezrab_ded_analyses_v2: 'Analisis DED',
  ezrab_dedai_drafts_v1: 'Draf DED AI',
  ezrab_ded_attachment_v1: 'Lampiran DED',
  ezrab_docai_drafts_v1: 'Draf Document AI',
  ezrab_docai_history_v1: 'Riwayat Document AI',
  ezrab_docai_library_v1: 'Perpustakaan dokumen',
  ezrab_docai_templates_v1: 'Template dokumen pengguna',
  ezrab_docai_company_v1: 'Profil perusahaan dokumen',
  ezrab_custom_ahsp_v1: 'AHSP kustom',
  ezrab_user_materials_v1: 'Material pengguna',
  ezrab_user_material_prices_v1: 'Harga material pengguna',
  ezrab_price_assumptions_v1: 'Asumsi harga',
  ezrab_project_prices_v2: 'Harga proyek (price engine)',
  ezrab_project_overrides_v2: 'Override harga (price engine)',
  ezrab_market_review_v1: 'Antrean review harga pasar',
  ezrab_prod_progress_history: 'Riwayat progres',
  ezrab_designs: 'Desain rumah',
  ezrab_db_activities: 'Log aktivitas',
  ezrab_project_material_specs: 'Spesifikasi material proyek',
  ezrab_project_backups: 'Cadangan proyek terhapus',
  ezrab_global_estimation_settings_v1: 'Pengaturan estimasi global',
  ezrab_custom_rab_templates: 'Template RAB kustom',
  ezrab_template_usage_v1: 'Statistik pemakaian template',
  ezrab_price_audit_v2: 'Audit harga',
  ezrab_settings_audit_log_v1: 'Log audit pengaturan',
  ezrab_ai_operations_v1: 'Log operasi AI',
  ezrab_ai_action_audit_v1: 'Audit aksi AI',
  ezrab_ai_feedback_local_v1: 'Umpan balik AI',
  ezrab_ai_mutation_audit_v1: 'Audit mutasi AI',
  'ezrab.adminMasterPriceOverlay.v1': 'Overlay harga master (admin)',
  'ezrab.masterPriceHistory.v1': 'Riwayat harga master',
  'ezrab.priceChangeFeed.v1': 'Feed perubahan harga',
  'ezrab:company:headers': 'Kop perusahaan dokumen',
  ezrab_prod_active_project_id: 'Proyek aktif',
  ezrab_prod_seeded_v1: 'Penanda seed awal',
  ezrab_premium_demo_v1: 'Penanda demo premium',
  ezrab_chat_draft_: 'Draf chat',
  ezrab_active_conversation_v2_: 'Percakapan aktif',
  ezrab_active_ded_analysis_: 'Analisis DED aktif',
  ezrab_estimator_kurva_weeks_: 'Pengaturan minggu Kurva-S',
  'ezrab:wizard-draft:': 'Draf wizard dokumen',
  'ezrab:custom_templates:': 'Template dokumen kustom',
};

/**
 * Yang TIDAK termasuk dalam backup — ditampilkan di UI dan didokumentasikan
 * di sini agar tidak ada asumsi diam-diam:
 * - Secret/token/kredensial (tidak ada yang disimpan di localStorage yang
 *   di-backup; kunci API tidak pernah ditulis ke localStorage).
 * - Peran & pengguna (ezrab_role_v1, ezrab_is_global_admin,
 *   ezrab_workspace_users_v2) — data identitas; memulihkannya lintas
 *   konteks dapat mengacaukan sistem peran.
 * - Sesi & status transien (kunci sesi chat AI lama yang sudah dihapus,
 *   ezrab_after_oauth, ezrab_magic_ai_launch_context, ezrab_notifications_v1).
 * - Preferensi tampilan (tema, densitas, aksen, bahasa, mode chat/DED,
 *   status onboarding/tutorial/tour, kalkulator favorit/terakhir).
 * - URL sinkron Google Sheets (ezrab_gsheets_db_url) — dapat mengandung
 *   kunci API di parameter URL.
 * - Cache kurs (ezrab_currency_rates_v1) — dapat diambil ulang.
 * - Cache riset harga DED (ezrab-price-research-v1) — dapat dibuat ulang.
 * - Persetujuan cookie (ezrab-cookie-consent-v1) — preferensi.
 * - Status simulasi kredit (ezrab-credit-sim-v1) — data simulasi mock,
 *   bukan data penagihan nyata.
 * - Penanda versi dataset demo premium (ezrab_premium_demo_dataset_v,
 *   ezrab_premium_demo_items_v1, ezrab_premium_demo_items_dataset_v) —
 *   penanda regenerable; dataset demo dibuat ulang dari kode.
 * - sessionStorage (mis. ezrab_pw_recovery) — bukan localStorage; tidak
 *   tercakup backup ini.
 * - Penanda migrasi Supabase (ezrab_supabase_migrated_v1) — spesifik
 *   lingkungan; memulihkannya dapat melewatkan migrasi yang dibutuhkan.
 * - Dataset demo premium (regenerable dari kode).
 * - Metadata backup itu sendiri (ezrab_backup_last_export_v1,
 *   ezrab_backup_safety_slot_v1) — memulihkannya akan menimpa jaring
 *   pengaman / memundurkan pengingat ekspor.
 */
export const BACKUP_EXCLUDED_NOTE =
  'Tidak termasuk: kata sandi/token, peran & pengguna, sesi login, preferensi tampilan, ' +
  'URL sinkron, cache kurs, dan data demo (dapat dibuat ulang).';

export interface BackupMetadata {
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  appVersion?: string;
  datasetCounts: Record<string, number>;
  projectSummary: Array<{ id: string; name: string; itemCount: number }>;
  /** Kunci raw yang ikut dalam backup (termasuk hasil pindai awalan). */
  rawDatasetKeys?: string[];
  /** Peringatan saat ekspor (mis. dataset rusak yang tidak terbaca). */
  warnings?: string[];
}

export interface BackupFile {
  kind: 'ezrab-backup';
  metadata: BackupMetadata;
  datasets: Record<string, unknown>;
  /** String mentah localStorage per kunci raw. Opsional: file v1 lama tidak memilikinya. */
  rawDatasets?: Record<string, string>;
}

export type BackupResult =
  | { ok: true; filename: string; metadata: BackupMetadata; content: string; sizeBytes: number }
  | { ok: false; error: string };

export type RestoreValidation =
  | {
      ok: true;
      metadata: BackupMetadata;
      warnings: string[];
      /** Jumlah per dataset yang dihitung ULANG dari isi file (bukan dari metadata). */
      counts: Record<string, number>;
      /** Kunci raw yang akan dipulihkan. */
      rawKeys: string[];
      /** Kunci tercakup yang TIDAK ADA di file — akan dibiarkan utuh. */
      untouchedKeys: string[];
      /** Kunci admin-only yang ADA di file tetapi TIDAK AKAN dipulihkan (§3f)
       *  — nilai lokal dibiarkan utuh; dilaporkan juga sebagai peringatan. */
      skippedKeys: string[];
    }
  | { ok: false; error: string };

export type RestoreResult =
  | { ok: true; restoredKeys: string[]; skippedKeys: string[]; warnings: string[] }
  | { ok: false; error: string; restoredKeys: string[]; skippedKeys: string[]; failedKey?: string };

export interface BackupDatasetSummary {
  key: string;
  label: string;
  count: number;
  present: boolean;
  kind: 'envelope' | 'raw';
  bytes: number;
}

export interface BackupSummary {
  datasets: BackupDatasetSummary[];
  totalItems: number;
  totalBytes: number;
  /** Kunci yang ada di localStorage tapi tidak tercakup backup (untuk audit cakupan). */
  uncoveredEzrabKeys: string[];
}

export interface SafetyBackupResult {
  ok: boolean;
  content?: string;
  filename?: string;
  metadata?: BackupMetadata;
  /** Apakah salinan berhasil disimpan ke slot lokal (best-effort). */
  slotStored: boolean;
  error?: string;
}

export interface SafetySlotInfo {
  exists: boolean;
  createdAt: string | null;
  sizeBytes: number;
  corrupt: boolean;
}

export interface BackupReminderState {
  lastExportAt: string | null;
  daysSinceExport: number | null;
  needsReminder: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestampForFilename(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Jumlah entri dalam satu nilai dataset terdekode. */
function countValue(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v as Record<string, unknown>).length;
  if (v === undefined || v === null) return 0;
  return 1;
}

/** Jumlah entri dalam satu string mentah localStorage (gagal parse → 0, data tetap disertakan). */
function countRawString(raw: string): number {
  try {
    return countValue(JSON.parse(raw));
  } catch {
    return raw.length > 0 ? 1 : 0;
  }
}

/** Pindai kunci localStorage yang cocok dengan salah satu awalan dinamis. */
function scanPrefixKeys(): string[] {
  const found: string[] = [];
  try {
    const len = typeof localStorage !== 'undefined' ? localStorage.length : 0;
    for (let i = 0; i < len; i++) {
      const k = localStorage.key(i);
      if (k && BACKUP_RAW_KEY_PREFIXES.some((p) => k.startsWith(p))) found.push(k);
    }
  } catch {
    // storage tidak tersedia — tidak ada kunci dinamis yang terpindai
  }
  return found.sort();
}

/** Semua kunci localStorage EZRAB (semua bentuk awalan yang dipakai aplikasi:
 *  `ezrab_*`, `ezrab.*`, `ezrab:*`, `ezrab-*`) — untuk audit cakupan. */
function scanAllEzrabKeys(): string[] {
  const found: string[] = [];
  try {
    const len = typeof localStorage !== 'undefined' ? localStorage.length : 0;
    for (let i = 0; i < len; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('ezrab_') || k.startsWith('ezrab.') || k.startsWith('ezrab:') || k.startsWith('ezrab-'))
      ) {
        found.push(k);
      }
    }
  } catch {
    // abaikan
  }
  return found.sort();
}

function prefixOf(key: string): string | null {
  for (const p of BACKUP_RAW_KEY_PREFIXES) {
    if (key.startsWith(p)) return p;
  }
  return null;
}

function labelForKey(key: string): string {
  const direct = BACKUP_DATASET_LABELS[key];
  if (direct) return direct;
  const prefix = prefixOf(key);
  if (prefix) {
    const suffix = key.slice(prefix.length);
    const short = suffix.length > 24 ? `${suffix.slice(0, 21)}…` : suffix;
    return `${BACKUP_DATASET_LABELS[prefix]} (${short})`;
  }
  return key;
}

/** Validasi satu nilai envelope. Mengembalikan pesan error atau null bila valid. */
function validateEnvelopeValue(key: string, value: unknown): string | null {
  const shape = ENVELOPE_DATASET_SHAPES[key];
  if (!shape) return `Dataset tidak dikenal: ${key}.`;
  if (shape === 'array' && !Array.isArray(value)) {
    return `Struktur data ${labelForKey(key)} rusak (diharapkan daftar).`;
  }
  if (shape === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    return `Struktur data ${labelForKey(key)} rusak (diharapkan peta).`;
  }
  return null;
}

/** Validasi satu nilai raw (harus string mentah dengan bentuk sesuai tabel). */
function validateRawValue(key: string, value: unknown): string | null {
  if (typeof value !== 'string') {
    return `Data mentah ${labelForKey(key)} rusak (bukan teks).`;
  }
  const fixedShape = RAW_DATASET_SHAPES[key];
  // Diselesaikan lewat if/else eksplisit (bukan `??`): rantai `??` membuat
  // TS menyempitkan `shape` secara keliru sehingga perbandingan
  // 'number-string' di bawah ditolak (TS2367).
  let shape: 'array' | 'object' | 'string' | 'number-string' | undefined = fixedShape;
  let prefix: string | null = null;
  if (shape === undefined) {
    prefix = prefixOf(key);
    shape = prefix ? PREFIX_SHAPES[prefix] : undefined;
  }
  if (!shape) return `Dataset mentah tidak dikenal: ${key}.`;
  if (shape === 'string') return null; // string polos apa pun sah (id / penanda)
  if (shape === 'number-string') {
    return Number.isFinite(Number(value)) && value.trim() !== ''
      ? null
      : `Data ${labelForKey(key)} rusak (diharapkan angka).`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return `Data ${labelForKey(key)} rusak (JSON tidak valid).`;
  }
  if (shape === 'array' && !Array.isArray(parsed)) {
    return `Struktur data ${labelForKey(key)} rusak (diharapkan daftar).`;
  }
  if (shape === 'object' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
    return `Struktur data ${labelForKey(key)} rusak (diharapkan peta).`;
  }
  // Pemeriksaan struktural tambahan per keluarga:
  if (key === 'ezrab_prod_progress_history') {
    const env = parsed as { v?: unknown; data?: unknown };
    if (!Array.isArray(env.data)) {
      return 'Struktur riwayat progres rusak (data bukan daftar).';
    }
  }
  if (key === 'ezrab_unified_conversations_v2' && Array.isArray(parsed)) {
    for (const c of parsed as Array<{ id?: unknown; messages?: unknown }>) {
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !Array.isArray(c.messages)) {
        return 'Struktur percakapan rusak (percakapan tanpa id/pesan).';
      }
    }
  }
  if (prefix === 'ezrab_chat_draft_' && (typeof parsed !== 'object' || parsed === null)) {
    return `Struktur ${labelForKey(key)} rusak.`;
  }
  if (prefix === 'ezrab_chat_draft_') {
    const rec = parsed as { text?: unknown };
    if (typeof rec.text !== 'string') {
      return `Struktur ${labelForKey(key)} rusak (teks draf hilang).`;
    }
  }
  if (
    (key === 'ezrab_ai_mutation_audit_v1' || key === 'ezrab:company:headers') &&
    Array.isArray(parsed)
  ) {
    for (const e of parsed as Array<{ id?: unknown }>) {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string') {
        return `Struktur data ${labelForKey(key)} rusak (entri tanpa id).`;
      }
    }
  }
  if (prefix === 'ezrab:custom_templates:' && Array.isArray(parsed)) {
    for (const t of parsed as Array<{ id?: unknown }>) {
      if (!t || typeof t !== 'object' || typeof t.id !== 'string') {
        return `Struktur ${labelForKey(key)} rusak (template tanpa id).`;
      }
    }
  }
  if (prefix === 'ezrab:wizard-draft:') {
    const rec = parsed as { selectedDocIds?: unknown };
    if (rec.selectedDocIds !== undefined && !Array.isArray(rec.selectedDocIds)) {
      return `Struktur ${labelForKey(key)} rusak (daftar dokumen bukan array).`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a backup of all datasets. Returns the file content as string.
 * Does NOT include secrets, tokens, or credentials (only covered dataset keys).
 *
 * P1-A fix: versi sebelumnya membangun string JSON lalu MEMBUANGNYA
 * (hanya metadata yang dikembalikan). Kini `content` dikembalikan.
 */
export function createBackup(): BackupResult {
  try {
    const datasets: Record<string, unknown> = {};
    const rawDatasets: Record<string, string> = {};
    const datasetCounts: Record<string, number> = {};
    const warnings: string[] = [];
    const rawDatasetKeys: string[] = [];

    // 1. Envelope keys (decoded via hardenedStorage)
    const envelopeKeys = [...BACKUP_DATASET_KEYS, ...BACKUP_ENVELOPE_DATASET_KEYS];
    for (const key of envelopeKeys) {
      const result = loadVersioned<unknown>(key);
      if (result.ok) {
        datasets[key] = result.data;
        datasetCounts[key] = countValue(result.data);
      } else if (result.error === 'CORRUPT' || result.error === 'MIGRATION_FAILED') {
        // Data rusak tidak bisa didekode — JANGAN dibuang: simpan string
        // mentahnya di rawDatasets agar restore mengembalikannya byte-per-byte.
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        // Placeholder SESUAI BENTUK keluarga (array → [], peta → {}) agar
        // file hasil ekspor lolos validasi bentuknya sendiri.
        datasets[key] = ENVELOPE_DATASET_SHAPES[key] === 'object' ? {} : [];
        datasetCounts[key] = 0;
        if (raw !== null) {
          rawDatasets[key] = raw;
          rawDatasetKeys.push(key);
        }
        warnings.push(
          `Dataset ${labelForKey(key)} rusak di penyimpanan lokal dan tidak dapat dibaca; ` +
            'salinan mentahnya disertakan apa adanya.'
        );
      } else {
        datasets[key] = ENVELOPE_DATASET_SHAPES[key] === 'object' ? {} : [];
        datasetCounts[key] = 0;
      }
    }

    // 2. Raw keys (byte-for-byte)
    const rawKeys = [...BACKUP_RAW_DATASET_KEYS, ...scanPrefixKeys()];
    for (const key of rawKeys) {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (raw !== null) {
        rawDatasets[key] = raw;
        rawDatasetKeys.push(key);
        datasetCounts[key] = countRawString(raw);
      } else {
        datasetCounts[key] = 0;
      }
    }

    // Build project summary for preview
    const projects = (datasets['ezrab_prod_projects'] as Array<{ id: string; name: string }>) || [];
    const rabItems = (datasets['ezrab_prod_rab_items'] as Array<{ projectId: string }>) || [];
    const projectSummary = projects.map((p) => ({
      id: p.id,
      name: p.name || '(tanpa nama)',
      itemCount: rabItems.filter((r) => r.projectId === p.id).length,
    }));

    const metadata: BackupMetadata = {
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      datasetCounts,
      projectSummary,
      rawDatasetKeys,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    const backup: BackupFile = {
      kind: 'ezrab-backup',
      metadata,
      datasets,
      rawDatasets,
    };

    const json = JSON.stringify(backup, null, 2);
    const filename = `${BACKUP_FILE_PREFIX}${timestampForFilename(new Date())}.json`;

    return { ok: true, filename, metadata, content: json, sizeBytes: json.length };
  } catch (e) {
    return { ok: false, error: `Gagal membuat backup: ${String((e as Error)?.message || e)}` };
  }
}

// ---------------------------------------------------------------------------
// Validate (no writes)
// ---------------------------------------------------------------------------

/**
 * Validate a backup file WITHOUT modifying any data.
 * Returns metadata for preview + warnings + recomputed counts.
 */
export function validateBackup(jsonText: string): RestoreValidation {
  if (typeof jsonText !== 'string' || jsonText.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: `File backup terlalu besar (maks ${MAX_IMPORT_BYTES / 1024 / 1024} MB).` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'File bukan JSON yang valid (mungkin terpotong atau rusak).' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Format backup tidak dikenali.' };
  }

  const backup = parsed as Partial<BackupFile>;

  if (backup.kind !== 'ezrab-backup') {
    return { ok: false, error: 'File ini bukan backup EZRAB.' };
  }

  if (!backup.metadata || typeof backup.metadata !== 'object' || Array.isArray(backup.metadata)) {
    return { ok: false, error: 'Metadata backup hilang atau rusak.' };
  }

  if (backup.metadata.formatVersion !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Versi format backup (${backup.metadata.formatVersion}) tidak didukung. Versi saat ini: ${BACKUP_FORMAT_VERSION}.`,
    };
  }

  if (!backup.datasets || typeof backup.datasets !== 'object' || Array.isArray(backup.datasets)) {
    return { ok: false, error: 'Data backup hilang atau rusak.' };
  }

  if (
    backup.rawDatasets !== undefined &&
    (typeof backup.rawDatasets !== 'object' || backup.rawDatasets === null || Array.isArray(backup.rawDatasets))
  ) {
    return { ok: false, error: 'Data mentah backup rusak.' };
  }

  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const untouchedKeys: string[] = [];

  // Check schema version compatibility
  if (typeof backup.metadata.schemaVersion !== 'number') {
    return { ok: false, error: 'Versi schema backup hilang atau rusak.' };
  }
  if (backup.metadata.schemaVersion > STORAGE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Backup dibuat dengan schema v${backup.metadata.schemaVersion}, aplikasi hanya mendukung v${STORAGE_SCHEMA_VERSION}.`,
    };
  }
  if (backup.metadata.schemaVersion < STORAGE_SCHEMA_VERSION) {
    warnings.push(
      `Backup memakai schema lama (v${backup.metadata.schemaVersion}); akan dimigrasi otomatis ke v${STORAGE_SCHEMA_VERSION}.`
    );
  }

  // Validate each envelope dataset present; absent keys stay untouched (with warning).
  const envelopeKeys = [...BACKUP_DATASET_KEYS, ...BACKUP_ENVELOPE_DATASET_KEYS];
  for (const key of envelopeKeys) {
    if (!(key in backup.datasets)) {
      untouchedKeys.push(key);
      warnings.push(`Dataset ${labelForKey(key)} tidak ada di backup; data saat ini TIDAK akan diubah.`);
      continue;
    }
    const err = validateEnvelopeValue(key, backup.datasets[key]);
    if (err) return { ok: false, error: err };
    counts[key] = countValue(backup.datasets[key]);
  }
  // Unknown envelope datasets are rejected — restore must never write
  // keys outside the covered set (e.g. a crafted file planting role keys).
  for (const key of Object.keys(backup.datasets)) {
    if (!envelopeKeys.includes(key as never)) {
      return { ok: false, error: `Dataset tidak dikenal di backup: ${key}. File ditolak demi keamanan.` };
    }
  }

  // Validate raw datasets (file v1 lama tidak memilikinya → semua raw dibiarkan utuh).
  const rawKeys: string[] = [];
  const rawMap = backup.rawDatasets ?? {};
  const isLegacyFile = backup.rawDatasets === undefined;
  if (isLegacyFile) {
    warnings.push(
      'Backup lama (sebelum keluarga data tambahan ditambahkan): percakapan, draf AI, analisis DED, ' +
        'data Document AI, dan harga kustom TIDAK termasuk — data tersebut tidak akan diubah.'
    );
  }
  for (const key of Object.keys(rawMap)) {
    // Pengecualian: entri raw untuk kunci envelope HANYA sah sebagai
    // fallback data rusak (datasets[key] berupa placeholder KOSONG sesuai
    // bentuk keluarga — [] atau {} — lihat createBackup). String mentahnya
    // diterima apa adanya; bentuknya memang tidak bisa divalidasi karena
    // itulah yang rusak.
    const placeholder = backup.datasets[key];
    const isEmptyPlaceholder =
      (Array.isArray(placeholder) && placeholder.length === 0) ||
      (typeof placeholder === 'object' &&
        placeholder !== null &&
        !Array.isArray(placeholder) &&
        Object.keys(placeholder).length === 0);
    const isCorruptFallback = envelopeKeys.includes(key as never) && isEmptyPlaceholder;
    if (!isCorruptFallback) {
      const err = validateRawValue(key, rawMap[key]);
      if (err) return { ok: false, error: err };
    }
    rawKeys.push(key);
    counts[key] = countRawString(rawMap[key]);
  }
  // §3f: kunci admin-only yang ada di file TIDAK AKAN dipulihkan — laporkan
  // di pratinjau (peringatan) dan di hasil validasi (skippedKeys) agar
  // pengguna tidak terkejut saat restore selesai.
  const skippedKeys = BACKUP_RESTORE_SKIPPED_ADMIN_KEYS.filter((k) => k in rawMap);
  if (skippedKeys.length > 0) {
    warnings.push(
      `Dilewati saat restore (konfigurasi admin khusus browser ini — data saat ini dibiarkan utuh): ` +
        skippedKeys.map((k) => labelForKey(k)).join(', ') +
        '.'
    );
  }
  // Raw keys covered by the app but absent from the file stay untouched.
  const knownRawKeys = [...BACKUP_RAW_DATASET_KEYS, ...scanPrefixKeys()];
  for (const key of knownRawKeys) {
    if (!(key in rawMap)) {
      untouchedKeys.push(key);
      // Jangan membanjiri peringatan untuk kunci yang memang belum pernah ada
      // di penyimpanan saat ini — hanya peringatkan bila kunci itu ADA sekarang
      // (datanya tidak akan tersentuh restore) — info, bukan alarm.
      if (typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null) {
        warnings.push(`Data ${labelForKey(key)} tidak ada di backup; data saat ini TIDAK akan diubah.`);
      }
    }
  }
  // Count-consistency: metadata counts vs recomputed counts.
  const metaCounts = backup.metadata.datasetCounts;
  if (metaCounts && typeof metaCounts === 'object') {
    for (const [key, claimed] of Object.entries(metaCounts)) {
      if (key in counts && typeof claimed === 'number' && claimed !== counts[key]) {
        warnings.push(
          `Jumlah ${labelForKey(key)} di metadata (${claimed}) tidak cocok dengan isi file (${counts[key]}); ` +
            'isi file yang dipakai.'
        );
      }
    }
  }

  // Surface export-time warnings (e.g. corrupt datasets preserved raw).
  if (Array.isArray(backup.metadata.warnings)) {
    for (const w of backup.metadata.warnings) {
      if (typeof w === 'string') warnings.push(`Saat ekspor: ${w}`);
    }
  }

  return { ok: true, metadata: backup.metadata, warnings, counts, rawKeys, untouchedKeys, skippedKeys };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Restore from a validated backup.
 *
 * SAFETY:
 * 1. Caller MUST have called validateBackup() first and shown preview to user.
 * 2. Caller MUST have created a safety backup via createSafetyBackup() before calling.
 * 3. Writes are done key-by-key; if one fails, previously written keys are reported.
 *    (localStorage has no transactions; the safety backup enables manual recovery.)
 * 4. Keys absent from the backup are LEFT UNTOUCHED — never emptied.
 * 5. Admin-only keys (BACKUP_RESTORE_SKIPPED_ADMIN_KEYS) are NEVER written,
 *    even when present in the file (§3f): the restoring browser's own admin
 *    master-price configuration is left untouched, and the skipped keys are
 *    reported in the result (skippedKeys) and in the warnings.
 * 6. After a successful restore the caller MUST reload the app: in-memory
 *    React state (ProjectContext dsb.) masih memegang data lama.
 * 7. Setiap penulisan DIVERIFIKASI sesudah ditulis (baca-balik, A3-7):
 *    envelope dibaca lewat loadVersioned dan datanya dibandingkan dengan
 *    yang ditulis; raw dibaca lewat getItem dan stringnya dibandingkan.
 *    Ketidakcocokan diperlakukan seperti kegagalan tulis — restore berhenti
 *    dan kunci gagal dilaporkan — sehingga `ok: true` tidak pernah
 *    mengklaim sukses atas data yang tidak terverifikasi.
 *
 * Does NOT recalculate prices or modify provenance — restores data as-is.
 */
export function restoreBackup(jsonText: string): RestoreResult {
  const validation = validateBackup(jsonText);
  if (!validation.ok) {
    return { ok: false, error: validation.error, restoredKeys: [], skippedKeys: [] };
  }

  const backup = JSON.parse(jsonText) as BackupFile;
  const restoredKeys: string[] = [];
  // §3f: kunci admin-only yang ada di file — tidak pernah ditulis; nilai
  // lokal dibiarkan utuh. Dihitung sekali di muka dari hasil validasi agar
  // laporan gagal di tengah jalan pun tetap menyebutnya.
  const skippedKeys = [...validation.skippedKeys];
  const skippedSet = new Set<string>(skippedKeys);
  const fail = (key: string, detail: string): RestoreResult => ({
    ok: false,
    error:
      `Gagal memulihkan ${labelForKey(key)}: ${detail}. ` +
      `${restoredKeys.length} dataset sudah dipulihkan (${restoredKeys.join(', ') || '—'}). ` +
      'Pulihkan backup pengaman (file ezrab-backup-pengaman-*.json yang terunduh otomatis sebelum restore) ' +
      'untuk mengembalikan kondisi semula, lalu muat ulang aplikasi.',
    restoredKeys: [...restoredKeys],
    skippedKeys: [...skippedKeys],
    failedKey: key,
  });

  // 1. Envelope datasets (decoded → saveVersioned). Raw fallback entries for
  //    corrupt envelope keys are handled in step 2 (raw wins).
  for (const key of Object.keys(backup.datasets)) {
    const data = backup.datasets[key];
    const hasRawFallback = backup.rawDatasets && key in backup.rawDatasets;
    if (hasRawFallback) continue; // ditulis mentah di langkah 2
    const result = saveVersioned(key, data);
    if (!result.ok) return fail(key, result.message);
    // A3-7: verifikasi sesudah tulis (baca-balik) — data yang tersimpan
    // harus sama persis dengan yang ditulis.
    const readBack = loadVersioned<unknown>(key);
    if (!readBack.ok || JSON.stringify(readBack.data) !== JSON.stringify(data)) {
      return fail(key, 'verifikasi sesudah tulis gagal (data yang tersimpan tidak cocok dengan isi backup)');
    }
    restoredKeys.push(key);
  }

  // 2. Raw datasets (byte-for-byte) — kecuali kunci admin-only (§3f).
  const rawMap = backup.rawDatasets ?? {};
  for (const key of Object.keys(rawMap)) {
    if (skippedSet.has(key)) continue; // nilai lokal dibiarkan utuh
    try {
      localStorage.setItem(key, rawMap[key]);
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      const isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exceeded');
      return fail(
        key,
        isQuota
          ? 'penyimpanan browser penuh (kuota localStorage terlampaui)'
          : msg
      );
    }
    // A3-7: verifikasi sesudah tulis (baca-balik) — string yang tersimpan
    // harus sama persis dengan yang ditulis.
    if (localStorage.getItem(key) !== rawMap[key]) {
      return fail(key, 'verifikasi sesudah tulis gagal (data yang tersimpan tidak cocok dengan isi backup)');
    }
    restoredKeys.push(key);
  }

  return { ok: true, restoredKeys, skippedKeys, warnings: validation.warnings };
}

// ---------------------------------------------------------------------------
// Safety backup (before restore)
// ---------------------------------------------------------------------------

/**
 * Buat backup pengaman dari kondisi SAAT INI: mengembalikan konten (untuk
 * diunduh otomatis) dan — best-effort — menyimpannya ke slot lokal
 * `ezrab_backup_safety_slot_v1` sebagai jaring kedua bila unduhan gagal.
 * Slot TIDAK ikut di-backup (menghindari rekursi & menimpa jaring pengaman).
 */
export function createSafetyBackup(): SafetyBackupResult {
  const result = createBackup();
  if (!result.ok) {
    return { ok: false, slotStored: false, error: result.error };
  }
  const filename = `${BACKUP_SAFETY_FILE_PREFIX}${timestampForFilename(new Date())}.json`;
  let slotStored = false;
  try {
    localStorage.setItem(SAFETY_SLOT_KEY, result.content);
    slotStored = true;
  } catch {
    slotStored = false; // kuota penuh — unduhan file tetap menjadi jalur recovery
  }
  return { ok: true, content: result.content, filename, metadata: result.metadata, slotStored };
}

/** Info slot backup pengaman (untuk UI: tampilkan bila ada). */
export function getSafetySlotInfo(): SafetySlotInfo {
  try {
    const raw = localStorage.getItem(SAFETY_SLOT_KEY);
    if (!raw) return { exists: false, createdAt: null, sizeBytes: 0, corrupt: false };
    try {
      const parsed = JSON.parse(raw) as Partial<BackupFile>;
      const createdAt =
        parsed && parsed.metadata && typeof parsed.metadata.createdAt === 'string'
          ? parsed.metadata.createdAt
          : null;
      return { exists: true, createdAt, sizeBytes: raw.length, corrupt: parsed?.kind !== 'ezrab-backup' };
    } catch {
      return { exists: true, createdAt: null, sizeBytes: raw.length, corrupt: true };
    }
  } catch {
    return { exists: false, createdAt: null, sizeBytes: 0, corrupt: false };
  }
}

/** Isi mentah slot backup pengaman (untuk dipulihkan lewat alur pratinjau yang sama). */
export function getSafetySlotContent(): string | null {
  try {
    return localStorage.getItem(SAFETY_SLOT_KEY);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Export reminder
// ---------------------------------------------------------------------------

/** Catat bahwa ekspor berhasil dilakukan sekarang. */
export function recordBackupExport(): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  } catch {
    // abaikan — pengingat hanya best-effort
  }
}

export function getLastBackupExport(): string | null {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_KEY);
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

export function getBackupReminderState(): BackupReminderState {
  const lastExportAt = getLastBackupExport();
  if (!lastExportAt) {
    return { lastExportAt: null, daysSinceExport: null, needsReminder: true };
  }
  const days = Math.floor((Date.now() - Date.parse(lastExportAt)) / 86_400_000);
  return { lastExportAt, daysSinceExport: days, needsReminder: days > BACKUP_REMINDER_DAYS };
}

// ---------------------------------------------------------------------------
// Summary (for Settings UI)
// ---------------------------------------------------------------------------

/** Ringkasan dataset saat ini untuk ditampilkan sebelum ekspor. */
export function getBackupSummary(): BackupSummary {
  const datasets: BackupDatasetSummary[] = [];
  let totalItems = 0;
  let totalBytes = 0;

  const covered = new Set<string>();

  for (const key of [...BACKUP_DATASET_KEYS, ...BACKUP_ENVELOPE_DATASET_KEYS]) {
    covered.add(key);
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const bytes = raw ? raw.length : 0;
    const result = loadVersioned<unknown>(key);
    const count = result.ok ? countValue(result.data) : 0;
    datasets.push({ key, label: labelForKey(key), count, present: raw !== null, kind: 'envelope', bytes });
    totalItems += count;
    totalBytes += bytes;
  }

  for (const key of [...BACKUP_RAW_DATASET_KEYS, ...scanPrefixKeys()]) {
    covered.add(key);
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const bytes = raw ? raw.length : 0;
    const count = raw !== null ? countRawString(raw) : 0;
    datasets.push({ key, label: labelForKey(key), count, present: raw !== null, kind: 'raw', bytes });
    totalItems += count;
    totalBytes += bytes;
  }

  // Kunci ezrab_ yang ada tapi tidak tercakup — untuk audit cakupan di UI/laporan.
  const uncoveredEzrabKeys = scanAllEzrabKeys().filter(
    (k) => !covered.has(k) && k !== SAFETY_SLOT_KEY && k !== LAST_EXPORT_KEY
  );

  return { datasets, totalItems, totalBytes, uncoveredEzrabKeys };
}

/**
 * Download backup as a file (browser only).
 */
export function downloadBackup(jsonText: string, filename: string): void {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
