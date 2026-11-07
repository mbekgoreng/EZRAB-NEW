/**
 * GERBANG FITUR AI PER PAKET — lapisan simulasi kredit (demo).
 * ============================================================================
 * Menurunkan hak fitur AI dari matriks entitlement KANONIS
 * (src/billing/plans.ts → activeAiFeatures, Keputusan Owner 2026-11-07 /
 * Amendemen Spec v1.2) ke ID paket SIMULASI (CreditPlan).
 *
 * Dipakai permukaan demo/simulasi untuk MENOLAK fitur yang tidak termasuk
 * paket dengan pesan yang jelas — khususnya: Free hanya Chat AI; DED AI
 * tertutup untuk Free; AI Document tertutup untuk Free & Starter.
 *
 * Ini gerbang SIMULASI FRONTEND (mode demo/showcase) — bukan penegakan
 * billing produksi. Billing sungguhan tetap dormant menunggu backend.
 */
import { activeAiFeatures, type AiFeatureKey } from '../billing/plans';
import { CREDIT_PLAN_TO_PLAN_ID, FEATURE_LABELS } from './config';
import type { CreditPlan } from './types';

/** Label paket simulasi untuk pesan pengguna. */
export const CREDIT_PLAN_LABELS: Record<CreditPlan, string> = {
  free: 'Free (Gratis)',
  starter: 'Starter',
  pro: 'Professional (Pro)',
  business: 'Business',
};

/** true bila paket simulasi berhak memakai fitur AI ini. */
export function planAllowsAiFeature(plan: CreditPlan, feature: AiFeatureKey): boolean {
  return activeAiFeatures(CREDIT_PLAN_TO_PLAN_ID[plan]).includes(feature);
}

/**
 * Pesan penolakan yang jelas (Bahasa Indonesia) untuk fitur yang tidak
 * termasuk paket. Selalu menyebut: fitur, paket aktif, dan sifat demo.
 */
export function aiFeatureLockedMessage(plan: CreditPlan, feature: AiFeatureKey): string {
  const featureLabel = FEATURE_LABELS[feature];
  const planLabel = CREDIT_PLAN_LABELS[plan];
  if (plan === 'free') {
    return (
      `${featureLabel} tidak tersedia untuk paket ${planLabel}. ` +
      'Fitur AI paket Free hanya Chat AI, dan kredit Free (100 kredit sekali) hanya dapat dipakai di Chat AI. ' +
      'MODE DEMO — simulasi, bukan penagihan nyata.'
    );
  }
  return (
    `${featureLabel} tidak tersedia untuk paket ${planLabel}. ` +
    'Fitur ini tersedia mulai paket Professional. MODE DEMO — simulasi, bukan penagihan nyata.'
  );
}
