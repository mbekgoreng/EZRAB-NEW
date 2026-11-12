/**
 * SALDO SERVER — sumber kebenaran saldo tampilan (B11/D14, Gelombang 2).
 * ============================================================================
 * Menggantikan simulasi localStorage sebagai SUMBER saldo tampilan untuk
 * akun nyata: saldo dibaca dari GET /api/credits/balance (ledger batch
 * gen-2, D18(ii)) dan paket dari GET /api/credits/subscription
 * (entitlementPlanId). Modul ini MURNI + dapat diuji tanpa React:
 * `fetch` disuntikkan agar suite dapat memakai fetch tiruan.
 *
 * Aturan kejujuran (fail-closed):
 * - Respons tanpa `success: true`, tanpa objek `balance`, atau dengan
 *   field bukan integer ≥ 0 → GAGAL (pemanggil menampilkan
 *   "belum terhubung", BUKAN angka simulasi yang disamarkan).
 * - Respons yang mengklaim `simulated: true` → GAGAL — saldo simulasi
 *   tidak pernah diterima sebagai saldo server.
 * - Paket tak dikenal → 'free' (fail-closed: gerbang fitur mengunci
 *   fitur berbayar, bukan membukanya). Bila endpoint subscription gagal
 *   tetapi balance berhasil, paket tetap 'free' dengan catatan yang
 *   sama — saldo yang tampil tetap saldo server yang benar.
 * - Tanpa token akses → GAGAL 'NO_TOKEN' (pemanggil tidak pernah
 *   mengarang identitas; mode demo tanpa sesi tidak memanggil modul ini
 *   sama sekali — ia memakai simulasi berlabel eksplisit).
 */
import type { CreditBalance, CreditPlan } from './types';

/** Bentuk saldo mentah dari endpoint /api/credits/balance (creditLedger.getBalance). */
export interface ServerBalancePayload {
  accountId?: string;
  subscriptionAvailable: number;
  topupAvailable: number;
  bonusAvailable: number;
  freeOnceAvailable: number;
  reserved: number;
  total: number;
}

export interface ServerBalanceResponse {
  success: boolean;
  balance?: ServerBalancePayload;
  freeOnceGranted?: boolean;
  simulated?: boolean;
  error?: string;
}

export interface ServerSubscriptionResponse {
  success: boolean;
  subscription?: { planId: string; status: string } | null;
  entitlementPlanId?: string;
  error?: string;
}

/** Bentuk minimal fetch yang dipakai modul ini (kompatibel global fetch). */
export interface BalanceFetcher {
  (input: string, init?: { method?: string; headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
}

export type ServerBalanceResult =
  | { ok: true; balance: CreditBalance; freeOnceGranted: boolean }
  | { ok: false; error: string };

/** ID paket kanonis (plans.ts) → ID paket simulasi/tampilan (CreditPlan). */
export function mapPlanIdToCreditPlan(planId: unknown): CreditPlan {
  if (planId === 'professional') return 'pro';
  if (planId === 'free' || planId === 'starter' || planId === 'business') return planId;
  return 'free'; // tak dikenal → fail-closed
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Petakan payload saldo server → CreditBalance tampilan. Bucket FREE_ONCE
 * dipertahankan sebagai field terpisah (`freeOnce`) — tidak pernah
 * dilebur ke top-up. Payload malformed → null (fail-closed).
 */
export function mapServerBalanceToCreditBalance(
  payload: unknown,
  plan: CreditPlan,
): CreditBalance | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<ServerBalancePayload>;
  if (
    !isNonNegativeInt(p.subscriptionAvailable) ||
    !isNonNegativeInt(p.topupAvailable) ||
    !isNonNegativeInt(p.bonusAvailable) ||
    !isNonNegativeInt(p.freeOnceAvailable) ||
    !isNonNegativeInt(p.reserved) ||
    !isNonNegativeInt(p.total)
  ) {
    return null;
  }
  return {
    total: p.total,
    subscription: p.subscriptionAvailable,
    topup: p.topupAvailable,
    bonus: p.bonusAvailable,
    freeOnce: p.freeOnceAvailable,
    plan,
    validUntil: null,
    currency: 'CREDIT',
  };
}

/** Saldo nol untuk keadaan 'unavailable' — ditampilkan sebagai "belum terhubung", bukan 0 kredit. */
export function unavailableBalance(): CreditBalance {
  return {
    total: 0,
    subscription: 0,
    topup: 0,
    bonus: 0,
    freeOnce: 0,
    plan: 'free',
    validUntil: null,
    currency: 'CREDIT',
  };
}

async function readJsonSafe(resp: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Ambil saldo + paket server untuk satu sesi nyata.
 * `fetcher` default = fetch global (browser); suite menyuntikkan tiruan.
 * Mengembalikan saldo tampilan atau error jujur — tidak pernah angka
 * simulasi.
 */
export async function fetchServerBalance(
  accessToken: string | null,
  fetcher: BalanceFetcher = fetch as unknown as BalanceFetcher,
  workspaceId?: string,
): Promise<ServerBalanceResult> {
  if (!accessToken) return { ok: false, error: 'NO_TOKEN' };
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (workspaceId) headers['x-workspace-id'] = workspaceId;

  let balanceResp: { ok: boolean; status: number; json: () => Promise<unknown> };
  let subResp: { ok: boolean; status: number; json: () => Promise<unknown> } | null = null;
  try {
    [balanceResp, subResp] = await Promise.all([
      fetcher('/api/credits/balance', { method: 'GET', headers }),
      fetcher('/api/credits/subscription', { method: 'GET', headers }).catch(() => null),
    ]);
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }

  const balanceData = (await readJsonSafe(balanceResp)) as ServerBalanceResponse | null;
  if (!balanceResp.ok || !balanceData || balanceData.success !== true) {
    return { ok: false, error: balanceData?.error || `BALANCE_HTTP_${balanceResp.status}` };
  }
  if (balanceData.simulated === true) {
    return { ok: false, error: 'SIMULATED_RESPONSE_REJECTED' };
  }

  let plan: CreditPlan = 'free';
  if (subResp) {
    const subData = (await readJsonSafe(subResp)) as ServerSubscriptionResponse | null;
    if (subResp.ok && subData && subData.success === true) {
      plan = mapPlanIdToCreditPlan(subData.entitlementPlanId);
    }
  }

  const balance = mapServerBalanceToCreditBalance(balanceData.balance, plan);
  if (!balance) return { ok: false, error: 'MALFORMED_BALANCE' };
  return { ok: true, balance, freeOnceGranted: balanceData.freeOnceGranted === true };
}
