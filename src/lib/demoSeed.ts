/**
 * demoSeed — logika murni untuk P0-B (data demo tidak respawn).
 *
 * Aturan: seed default HANYA pada instalasi pertama (belum ada flag seed).
 * Setelah itu isi penyimpanan dihormati apa adanya — termasuk ketika pengguna
 * menghapus seluruh proyek demo (array kosong tetap kosong).
 */

export interface SeedResolution<T> {
  projects: T[];
  /** true = pemanggil harus menulis flag seed ke penyimpanan. */
  shouldMarkSeeded: boolean;
}

export function resolveInitialProjects<T extends { id: string }>(
  savedJson: string | null,
  alreadySeeded: boolean,
  defaults: T[]
): SeedResolution<T> {
  if (alreadySeeded) {
    if (savedJson) {
      try {
        const parsed = JSON.parse(savedJson);
        if (Array.isArray(parsed)) return { projects: parsed as T[], shouldMarkSeeded: false };
      } catch {
        /* jatuh ke bawah */
      }
    }
    return { projects: [], shouldMarkSeeded: false };
  }
  if (savedJson) {
    try {
      const parsed = JSON.parse(savedJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { projects: parsed as T[], shouldMarkSeeded: true };
      }
    } catch {
      /* jatuh ke seed default */
    }
  }
  return { projects: defaults, shouldMarkSeeded: true };
}
