/**
 * Jejak konversi satuan untuk lapisan tampilan (Excel/PDF).
 *
 * Format provenance `UNIT_CONVERTED: ...` ditulis oleh kebijakan konversi
 * whitelist (`src/data/priceDatabase2026/unitConversionPolicy.ts`).
 * Helper ini hanya MEMBACA segmen tersebut untuk ditampilkan — tidak
 * mengubah kebijakan, whitelist, harga, maupun koefisien apa pun.
 */

/**
 * Ambil segmen jejak konversi dari string provenance (diawali
 * `UNIT_CONVERTED:`).
 *
 * Mengembalikan segmen mulai dari `UNIT_CONVERTED` — memuat satuan & harga
 * sumber, satuan hasil konversi, faktor, dan dasar konversi — atau null bila
 * provenance tidak memuat konversi. Dipakai lapisan tampilan (Excel/PDF)
 * agar hanya item yang benar-benar memakai konversi yang diberi penanda.
 */
export function extractConversionTrail(provenance: string | undefined | null): string | null {
  if (!provenance) return null;
  const idx = provenance.indexOf('UNIT_CONVERTED');
  if (idx < 0) return null;
  return provenance.slice(idx).trim();
}
