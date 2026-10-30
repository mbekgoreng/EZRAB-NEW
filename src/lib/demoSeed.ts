/**
 * demoSeed — logika murni untuk P0-B (data demo tidak respawn).
 *
 * Aturan: seed default HANYA pada instalasi pertama (belum ada flag seed).
 * Setelah itu isi penyimpanan dihormati apa adanya — termasuk ketika pengguna
 * menghapus seluruh proyek demo (array kosong tetap kosong).
 */

import type { Project, ProjectCostSummary } from '../types';

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

/**
 * F1a — resolusi awal item RAB flagship.
 *
 * Kunci penyimpanan yang SUDAH ADA selalu dihormati apa adanya — termasuk
 * array kosong hasil pengguna menghapus seluruh item (menghapus semua item
 * TIDAK boleh memunculkan kembali item contoh setelah reload). Seed hanya
 * dipakai bila kunci belum pernah ada (NOT_FOUND) atau isinya rusak
 * (perilaku lama: fallback ke seed).
 */
export function resolveInitialRabItems<T>(
  load: { ok: boolean; data?: T[] },
  seedItems: T[]
): T[] {
  if (load.ok) return load.data ?? seedItems;
  return seedItems;
}

/**
 * F1a — bangun ProjectCostSummary yang konsisten secara internal dari
 * item-item seed: directCost = jumlah amount item; overhead & profit dari
 * directCost; subtotal = direct + overhead + profit; pajak = taxPercent ×
 * subtotal; grandTotal = subtotal + pajak. Tidak ada angka yatim.
 */
export function computeSeedCostSummary(
  items: Array<{ amount?: number | null }>,
  opts: {
    overheadPercent?: number;
    profitPercent?: number;
    taxPercent?: number;
    costPerM2?: number;
  } = {}
): ProjectCostSummary {
  const overheadPercent = opts.overheadPercent ?? 5;
  const profitPercent = opts.profitPercent ?? 5;
  const taxPercent = opts.taxPercent ?? 11;
  const directCost = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const overheadAmount = Math.round((directCost * overheadPercent) / 100);
  const profitAmount = Math.round((directCost * profitPercent) / 100);
  const subtotalBeforeTax = directCost + overheadAmount + profitAmount;
  const taxAmount = Math.round((subtotalBeforeTax * taxPercent) / 100);
  return {
    directCost,
    overheadPercent,
    overheadAmount,
    profitPercent,
    profitAmount,
    contingencyPercent: 0,
    contingencyAmount: 0,
    directorMarkupPercent: 0,
    directorMarkupNominal: 0,
    directorMarkupTotal: 0,
    showMarkupToEditor: false,
    showMarkupToClient: false,
    subtotalBeforeTax,
    taxPercent,
    taxAmount,
    grandTotal: subtotalBeforeTax + taxAmount,
    costPerM2: opts.costPerM2 ?? 0,
  };
}

/**
 * F1a — normalisasi costSummary seed yang ditulis sebagai literal:
 * taxAmount & grandTotal SELALU diturunkan dari subtotalBeforeTax ×
 * taxPercent, agar tidak ada angka pajak yatim yang tidak cocok dengan
 * subtotalnya sendiri.
 */
export function consistentSeedCostSummary(cs: ProjectCostSummary): ProjectCostSummary {
  const taxAmount = Math.round((cs.subtotalBeforeTax * cs.taxPercent) / 100);
  return { ...cs, taxAmount, grandTotal: cs.subtotalBeforeTax + taxAmount };
}

/**
 * F1a — tandai proyek bawaan sebagai data contoh (isDemo) + normalisasi
 * costSummary-nya. totalRab yang terisi diselaraskan ke grandTotal hasil
 * normalisasi agar tidak menunjuk angka lama.
 */
export function markSeedProject(p: Project): Project {
  const costSummary = consistentSeedCostSummary(p.costSummary);
  return {
    ...p,
    isDemo: true,
    costSummary,
    totalRab: p.totalRab ? costSummary.grandTotal : p.totalRab,
  };
}

/**
 * Injeksi satu kali berdasarkan id (untuk dataset demo tambahan seperti
 * Premium Demo). Aturan sama dengan P0-B: hanya berjalan bila flag injeksi
 * belum pernah terpasang; setelah itu isi penyimpanan dihormati apa adanya —
 * termasuk bila pengguna menghapus datasetnya (tidak respawn). Entri yang
 * id-nya sudah ada tidak pernah diduplikasi.
 */
export function injectOnceById<T extends { id: string }>(
  existing: T[],
  additions: T[],
  alreadyInjected: boolean
): { items: T[]; shouldMarkInjected: boolean } {
  if (alreadyInjected) return { items: existing, shouldMarkInjected: false };
  const seen = new Set(existing.map((x) => x.id));
  const fresh = additions.filter((a) => !seen.has(a.id));
  return {
    items: fresh.length ? [...existing, ...fresh] : existing,
    shouldMarkInjected: true,
  };
}
