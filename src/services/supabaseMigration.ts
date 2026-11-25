/**
 * Phase 3 — localStorage → Supabase migration runner.
 *
 * STATUS: DINONAKTIFKAN (B1 2026-11-25, PE-5 — bukan diterapkan).
 * `migrateLocalStorageToSupabase()` di bawah ini SELALU menolak: versi
 * lama fungsi ini menetapkan `SUPER_ADMIN` untuk dirinya sendiri dari
 * browser (anon-key client, `workspace_members` insert) — pola yang
 * dilarang (lihat header `api/_lib/workspaceBootstrap.js`). Fungsi ini
 * TIDAK PERNAH dipanggil dari mana pun (nol importer — diverifikasi
 * 2026-11-25), tetapi membiarkan badan yang bisa dipanggil berarti
 * membiarkan jalur eskalasi hak istimewa yang siap dipakai begitu ada
 * yang memasangnya. Penonaktifan ini fail-closed dan reversibel: Tahap 5
 * harus menulis ulang migrasi sebagai endpoint server-side (service-role,
 * identitas JWT terverifikasi), bukan menghidupkan kembali versi browser.
 *
 * Yang tersisa dan tidak berbahaya: flag penanda `MIGRATION_FLAG` +
 * pembaca/penghapusnya (tidak memberi hak apa pun) dan tipe progres.
 */
export const MIGRATION_FLAG = 'ezrab_supabase_migrated_v1';

export interface MigrationProgress {
  entity: string;
  local: number;
  migrated: number;
  skipped: number;
}
export type ProgressCallback = (p: MigrationProgress) => void;

export function isMigrationComplete(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG) === '1';
  } catch {
    return false;
  }
}

export function resetMigrationFlag(): void {
  try {
    localStorage.removeItem(MIGRATION_FLAG);
  } catch {
    /* noop */
  }
}

/**
 * Migrasi browser DINONAKTIFKAN (B1 2026-11-25, PE-5).
 * Selalu mengembalikan { ok: false } tanpa menyentuh Supabase atau
 * localStorage. Jangan pernah mengembalikan badan lama yang
 * meng-insert `workspace_members` dengan role SUPER_ADMIN dari browser.
 */
export async function migrateLocalStorageToSupabase(
  _onProgress?: ProgressCallback
): Promise<{ ok: boolean; migrated: number; errors: string[] }> {
  return {
    ok: false,
    migrated: 0,
    errors: [
      'Migrasi browser DINONAKTIFKAN (B1 2026-11-25, PE-5): versi lama fungsi ini menetapkan SUPER_ADMIN untuk dirinya sendiri dari browser (anon-key) — pola yang dilarang. Migrasi data lokal ke Supabase harus berjalan server-side (Tahap 5), bukan dari browser.',
    ],
  };
}
