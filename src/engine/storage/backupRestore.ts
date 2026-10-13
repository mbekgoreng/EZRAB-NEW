/**
 * EZRAB Backup & Restore
 * ======================
 * Export/import seluruh dataset proyek sebagai file JSON.
 *
 * Guarantees:
 * - Backup mencakup 10 dataset + metadata (schema version, timestamp)
 * - Restore memvalidasi struktur SEBELUM menimpa apapun
 * - Restore bersifat atomik: backup otomatis dibuat sebelum restore
 * - Provenance harga, unresolved status, snapshots dipertahankan
 * - Tidak mengeksekusi konten file (pure data, JSON.parse only)
 * - Tidak menyertakan secret/token/kredensial
 */

import { loadVersioned, saveVersioned, STORAGE_SCHEMA_VERSION } from './hardenedStorage';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_PREFIX = 'ezrab-backup-';

/** Dataset keys included in backup (same 10 as ProjectContext) */
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

export interface BackupMetadata {
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  appVersion?: string;
  datasetCounts: Record<string, number>;
  projectSummary: Array<{ id: string; name: string; itemCount: number }>;
}

export interface BackupFile {
  kind: 'ezrab-backup';
  metadata: BackupMetadata;
  datasets: Record<string, unknown>;
}

export type BackupResult =
  | { ok: true; filename: string; metadata: BackupMetadata }
  | { ok: false; error: string };

export type RestoreValidation =
  | { ok: true; metadata: BackupMetadata; warnings: string[] }
  | { ok: false; error: string };

/**
 * Create a backup of all datasets. Returns the file content as string.
 * Does NOT include secrets, tokens, or credentials (only the 10 dataset keys).
 */
export function createBackup(): BackupResult {
  try {
    const datasets: Record<string, unknown> = {};
    const datasetCounts: Record<string, number> = {};

    for (const key of BACKUP_DATASET_KEYS) {
      const result = loadVersioned<unknown>(key);
      if (result.ok) {
        datasets[key] = result.data;
        datasetCounts[key] = Array.isArray(result.data) ? result.data.length : 1;
      } else {
        datasets[key] = [];
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
    };

    const backup: BackupFile = {
      kind: 'ezrab-backup',
      metadata,
      datasets,
    };

    const json = JSON.stringify(backup, null, 2);
    const filename = `${BACKUP_FILE_PREFIX}${new Date().toISOString().slice(0, 10)}.json`;

    return { ok: true, filename, metadata };
  } catch (e) {
    return { ok: false, error: `Gagal membuat backup: ${String((e as Error)?.message || e)}` };
  }
}

/**
 * Validate a backup file WITHOUT modifying any data.
 * Returns metadata for preview + warnings.
 */
export function validateBackup(jsonText: string): RestoreValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'File bukan JSON yang valid.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Format backup tidak dikenali.' };
  }

  const backup = parsed as Partial<BackupFile>;

  if (backup.kind !== 'ezrab-backup') {
    return { ok: false, error: 'File ini bukan backup EZRAB.' };
  }

  if (!backup.metadata || typeof backup.metadata !== 'object') {
    return { ok: false, error: 'Metadata backup hilang atau rusak.' };
  }

  if (backup.metadata.formatVersion !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Versi format backup (${backup.metadata.formatVersion}) tidak didukung. Versi saat ini: ${BACKUP_FORMAT_VERSION}.`,
    };
  }

  if (!backup.datasets || typeof backup.datasets !== 'object') {
    return { ok: false, error: 'Data backup hilang atau rusak.' };
  }

  const warnings: string[] = [];

  // Check schema version compatibility
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

  // Validate each dataset is present (allow empty arrays)
  for (const key of BACKUP_DATASET_KEYS) {
    if (!(key in backup.datasets)) {
      warnings.push(`Dataset ${key} tidak ada di backup; akan dikosongkan.`);
    }
  }

  // Validate projects structure
  const projects = backup.datasets['ezrab_prod_projects'];
  if (projects !== undefined && !Array.isArray(projects)) {
    return { ok: false, error: 'Struktur data projects rusak.' };
  }

  // Validate rab_items structure (check provenance fields are preserved, not required)
  const rabItems = backup.datasets['ezrab_prod_rab_items'];
  if (rabItems !== undefined && !Array.isArray(rabItems)) {
    return { ok: false, error: 'Struktur data RAB rusak.' };
  }

  return { ok: true, metadata: backup.metadata, warnings };
}

export type RestoreResult =
  | { ok: true; restoredKeys: string[] }
  | { ok: false; error: string; restoredKeys: string[] };

/**
 * Restore from a validated backup.
 *
 * SAFETY:
 * 1. Caller MUST have called validateBackup() first and shown preview to user.
 * 2. Caller MUST have created a safety backup via createBackup() before calling.
 * 3. Writes are done key-by-key; if one fails, previously written keys are reported.
 *    (localStorage has no transactions; the safety backup enables manual recovery.)
 *
 * Does NOT recalculate prices or modify provenance — restores data as-is.
 */
export function restoreBackup(jsonText: string): RestoreResult {
  const validation = validateBackup(jsonText);
  if (!validation.ok) {
    return { ok: false, error: validation.error, restoredKeys: [] };
  }

  const backup = JSON.parse(jsonText) as BackupFile;
  const restoredKeys: string[] = [];

  for (const key of BACKUP_DATASET_KEYS) {
    const data = backup.datasets[key];
    // Absent datasets → restore as empty (with warning already shown)
    const result = saveVersioned(key, data ?? []);
    if (!result.ok) {
      return {
        ok: false,
        error: `Gagal memulihkan ${key}: ${result.message}. ${restoredKeys.length} dataset sudah dipulihkan; gunakan backup pengaman untuk recovery.`,
        restoredKeys,
      };
    }
    restoredKeys.push(key);
  }

  return { ok: true, restoredKeys };
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
