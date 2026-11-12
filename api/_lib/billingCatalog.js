/**
 * api/_lib/billingCatalog.js — Katalog berbayar SERVER untuk checkout.
 * ============================================================================
 * Satu-satunya sumber jumlah transaksi (gross_amount) untuk checkout
 * Midtrans. Jumlah TIDAK PERNAH diambil dari permintaan klien: klien hanya
 * menyebut (kind, itemId); harga & kredit dibaca dari katalog ini.
 *
 * Nilai di sini MENCERMINKAN definisi kanonis owner-approved di frontend:
 * - Paket: src/billing/plans.ts (PLAN_DEFINITIONS — Spec v1.0 + Amendemen
 *   v1.2): starter Rp54.999/5.000 kredit per bulan, professional
 *   Rp79.999/10.000, business Rp159.999/30.000. (Brief menyebutnya "Pro"/
 *   "Advanced"; id kanonis repo adalah 'professional'/'business'.)
 * - Top-up: TOPUP_OFFERS di src/ai-credits/config.ts — 4 tier Spec v1.0
 *   §7.2 yang diratifikasi keputusan K6 (Gelombang 2, 2026-11-13):
 *   500/Rp5.000, 1.500/Rp10.000, 4.000/Rp25.000, 10.000/Rp50.000.
 *   Tanpa bonus: kredit yang dibeli adalah kredit yang diterima.
 *   Top-up tidak kedaluwarsa (Spec §7.2). Penawaran interim Fase 1
 *   (Rp5.000 → 3.600 kredit, topup-3600) SUDAH DIHAPUS oleh K6.
 *
 * Tes `billingCatalogDrift` membandingkan file ini terhadap kedua sumber
 * frontend itu dan GAGAL bila ada yang bergeser — perubahan harga wajib
 * mengubah sumber kanonis dan katalog ini bersama-sama, secara sadar.
 *
 * CATATAN KEPUTUSAN: harga top-up final diratifikasi owner lewat K6
 * (Gelombang 2, 2026-11-13) dari Spec v1.0 §7.2 — status D8 yang semula
 * menunda harga final kini tertutup oleh ratifikasi ini.
 */

/** Paket langganan yang dapat dibeli (Free tidak dijual — ia grant awal). */
export const SUBSCRIPTION_CATALOG = Object.freeze({
  starter: Object.freeze({
    kind: 'SUBSCRIPTION',
    itemId: 'starter',
    planId: 'starter',
    displayName: 'Starter',
    priceIdr: 54999,
    credits: 5000,
    periodMonths: 1,
  }),
  professional: Object.freeze({
    kind: 'SUBSCRIPTION',
    itemId: 'professional',
    planId: 'professional',
    displayName: 'Professional',
    priceIdr: 79999,
    credits: 10000,
    periodMonths: 1,
  }),
  business: Object.freeze({
    kind: 'SUBSCRIPTION',
    itemId: 'business',
    planId: 'business',
    displayName: 'Business',
    priceIdr: 159999,
    credits: 30000,
    periodMonths: 1,
  }),
});

/**
 * Penawaran top-up sekali bayar — 4 tier Spec v1.0 §7.2 (ratifikasi K6).
 * `credits` = kredit yang diterima pembeli (tanpa bonus terpisah);
 * top-up tidak kedaluwarsa. `priceStatus` menandai ratifikasi Spec.
 */
export const TOPUP_CATALOG = Object.freeze({
  'topup-500': Object.freeze({
    kind: 'TOP_UP',
    itemId: 'topup-500',
    displayName: 'Top-up 500 Kredit AI',
    priceIdr: 5000,
    credits: 500,
    priceStatus: 'SPEC_V1_0_RATIFIED_K6',
  }),
  'topup-1500': Object.freeze({
    kind: 'TOP_UP',
    itemId: 'topup-1500',
    displayName: 'Top-up 1.500 Kredit AI',
    priceIdr: 10000,
    credits: 1500,
    priceStatus: 'SPEC_V1_0_RATIFIED_K6',
  }),
  'topup-4000': Object.freeze({
    kind: 'TOP_UP',
    itemId: 'topup-4000',
    displayName: 'Top-up 4.000 Kredit AI',
    priceIdr: 25000,
    credits: 4000,
    priceStatus: 'SPEC_V1_0_RATIFIED_K6',
  }),
  'topup-10000': Object.freeze({
    kind: 'TOP_UP',
    itemId: 'topup-10000',
    displayName: 'Top-up 10.000 Kredit AI',
    priceIdr: 50000,
    credits: 10000,
    priceStatus: 'SPEC_V1_0_RATIFIED_K6',
  }),
});

/**
 * Ambil item katalog untuk checkout. Mengembalikan salinan beku atau null
 * bila (kind, itemId) tidak dikenal — termasuk kind 'SUBSCRIPTION' dengan
 * itemId 'free' (Free bukan barang jualan).
 */
export function getCatalogItem(kind, itemId) {
  if (kind === 'SUBSCRIPTION') return SUBSCRIPTION_CATALOG[itemId] || null;
  if (kind === 'TOP_UP') return TOPUP_CATALOG[itemId] || null;
  return null;
}

/** Seluruh item yang dapat dibeli (untuk tampilan/status; tanpa rahasia). */
export function listCatalog() {
  return {
    subscriptions: Object.values(SUBSCRIPTION_CATALOG).map((i) => ({ ...i })),
    topUps: Object.values(TOPUP_CATALOG).map((i) => ({ ...i })),
  };
}
