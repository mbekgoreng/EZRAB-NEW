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
 * - Top-up: TOPUP_OFFER di src/ai-credits/config.ts (Fase 1: Rp5.000 →
 *   3.000 kredit dasar + bonus 20% = 600, total 3.600).
 *
 * Tes `billingCatalogDrift` membandingkan file ini terhadap kedua sumber
 * frontend itu dan GAGAL bila ada yang bergeser — perubahan harga wajib
 * mengubah sumber kanonis dan katalog ini bersama-sama, secara sadar.
 *
 * CATATAN KEPUTUSAN: harga top-up final adalah keputusan owner yang DITUNDA
 * (register D8 / Spec O-10, menunggu kalibrasi biaya). Entri top-up di sini
 * memakai penawaran Fase 1 yang SUDAH ADA — bukan harga baru karangan —
 * dan ditandai priceStatus agar tidak diklaim sebagai harga final.
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

/** Penawaran top-up sekali bayar (Fase 1 — harga final menunggu D8). */
export const TOPUP_CATALOG = Object.freeze({
  'topup-3600': Object.freeze({
    kind: 'TOP_UP',
    itemId: 'topup-3600',
    displayName: 'Top-up Kredit AI',
    priceIdr: 5000,
    baseCredits: 3000,
    bonusCredits: 600,
    priceStatus: 'PHASE1_OFFER_PENDING_D8',
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
