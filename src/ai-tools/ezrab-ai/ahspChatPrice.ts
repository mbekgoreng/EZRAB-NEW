/**
 * Harga AHSP untuk tampilan chat (regresi F-02 audit AHSP 2026-10-26).
 *
 * SATU sumber kebenaran dengan kartu explorer: komposisi resolver
 * (priceResolver2026.resolveAhspUnitPrice) + getAhspDirectPrice, dengan
 * fallback baked yang SAMA persis dengan kartu (direct ?? unitPrice) —
 * dan SELALU disertai kualifikasi status (Harga lengkap / Harga parsial /
 * harga belum tersedia). Harga baked tidak pernah lagi tampil sebagai
 * fakta tanpa kualifikasi.
 *
 * Pemanggilan lama resolveAhspUnitPrice(kode, satuan) adalah salah bentuk
 * (resolver hanya menerima satu objek item) sehingga fallback-nya diam-diam
 * selalu null dan chat jatuh ke harga baked. Jangan kembalikan pola itu.
 */
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { getAhspDirectPrice } from '../../data/priceDatabase2026/ahspDisplayPolicy';

type AhspChatItem = Parameters<typeof priceResolver2026.resolveAhspUnitPrice>[0] & {
  unitPrice?: number | null;
};

/** Format yang sama dengan fmtIDR lokal di tools.ts/actionRegistry.ts. */
function fmtChatIDR(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

/**
 * Sufiks harga satu baris hasil pencarian AHSP di chat, diawali ' — '.
 * Contoh: ' — Rp 63.852 (Harga lengkap)' /
 * ' — Rp 131.267 (Harga parsial — 4/7 komponen terisi)' /
 * ' — harga belum tersedia (lihat analisa komponen)'.
 * Resolver gagal → belum tersedia, bukan angka tebakan.
 */
export function ahspChatPriceSuffix(item: AhspChatItem | null | undefined): string {
  try {
    if (!item) return ' — harga belum tersedia (lihat analisa komponen)';
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const direct = getAhspDirectPrice(comp);
    const baked =
      typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : null;
    const price = direct ?? baked;
    if (price !== null && price > 0) {
      const rounded = Math.round(price);
      if (comp.pricingStatus === 'PARTIAL') {
        return ` — ${fmtChatIDR(rounded)} (Harga parsial — ${comp.resolvedComponents}/${comp.totalComponents} komponen terisi)`;
      }
      if (comp.pricingStatus === 'FULL') {
        return ` — ${fmtChatIDR(rounded)} (Harga lengkap)`;
      }
      return ` — ${fmtChatIDR(rounded)}`;
    }
  } catch {
    // Resolver gagal → tampilkan belum tersedia, jangan harga tebakan.
  }
  return ' — harga belum tersedia (lihat analisa komponen)';
}
