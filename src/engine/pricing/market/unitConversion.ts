/**
 * Konversi satuan EKSPLISIT untuk harga pasar.
 * ============================================================
 * Hanya konversi dengan faktor yang diketahui & dapat dipertanggungjawabkan.
 * - kg↔g, m↔cm↔mm, L↔ml: faktor tetap.
 * - zak→kg, dus→pcs, sak→kg: HANYA bila isi kemasan diketahui (packageQuantity
 *   + packageUnit valid). Tanpa itu → null (NEEDS_REVIEW), bukan tebakan.
 * - Harga per batang vs per kg (besi): butuh berat per batang → tidak
 *   dikonversi tanpa data (null).
 */

export interface ConversionResult {
  ok: boolean;
  factor: number | null; // listed_price / factor = harga per satuan dasar... (lihat di bawah)
  reason: string | null;
}

/**
 * Faktor: listedPrice (per packageUnit) → harga per normalizedUnit.
 * Mis. listed 150.000/dus isi 100 pcs → 1.500/pcs. factor = packageQuantity.
 */
const FIXED_FACTORS: Record<string, number> = {
  'kg->g': 1000,
  'g->kg': 1 / 1000,
  'm->cm': 100,
  'cm->m': 1 / 100,
  'm->mm': 1000,
  'mm->m': 1 / 1000,
  'cm->mm': 10,
  'mm->cm': 1 / 10,
  'l->ml': 1000,
  'ml->l': 1 / 1000,
  'm3->l': 1000,
};

const n = (u: string | null | undefined): string => (u || '').trim().toLowerCase();

/**
 * Normalisasi harga tertera ke satuan dasar.
 * @returns harga per normalizedUnit, atau null bila konversi tidak valid.
 */
export function normalizeUnitPrice(
  listedPrice: number,
  packageUnit: string | null,
  packageQuantity: number | null,
  normalizedUnit: string
): { price: number | null; reason: string | null } {
  if (!(listedPrice > 0)) return { price: null, reason: 'harga tertera tidak valid' };
  const target = n(normalizedUnit);
  if (!target) return { price: null, reason: 'satuan dasar tidak ditentukan' };

  const pkg = n(packageUnit);

  // Kasus 1: satuan tertera == satuan dasar → langsung
  if (pkg === target) return { price: listedPrice, reason: null };

  // Kasus 2: kemasan dengan isi diketahui (dus isi 100 pcs → /pcs)
  if (pkg && pkg !== target && packageQuantity && packageQuantity > 0) {
    // Hanya izinkan bila satuan kemasan memang wadah (bukan satuan ukur lain)
    const containerUnits = new Set(['dus', 'box', 'kardus', 'pak', 'paket', 'zak', 'sak', 'karung', 'kaleng', 'drum', 'rol', 'gulung', 'ikat', 'batang', 'lembar', 'buah', 'pcs', 'biji', 'unit']);
    if (containerUnits.has(pkg)) {
      return { price: listedPrice / packageQuantity, reason: null };
    }
  }

  // Kasus 3: konversi metrik tetap
  const key = `${pkg}->${target}`;
  const f = FIXED_FACTORS[key];
  if (f) return { price: listedPrice / f, reason: null };

  // Kasus 4: tidak diketahui → null (jangan tebak)
  return {
    price: null,
    reason: `konversi ${packageUnit || '?'} → ${normalizedUnit} tidak diketahui (isi kemasan/faktor tidak valid)`,
  };
}

/**
 * Apakah dua satuan dapat dibandingkan langsung (tanpa konversi berisiko)?
 */
export function unitsDirectlyComparable(a: string | null, b: string | null): boolean {
  return n(a) === n(b) && n(a) !== '';
}
