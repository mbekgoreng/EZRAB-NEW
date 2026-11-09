/**
 * src/billing/checkoutClient.ts — Klien checkout online (Midtrans Snap).
 * ============================================================================
 * Jalur pembayaran NYATA untuk billing EZRAB, berdampingan dengan simulasi
 * frontend (src/ai-credits) yang tetap menjadi mode demo. Aturan kejujuran:
 *
 * - Terhubung HANYA bila env publik VITE_MIDTRANS_CLIENT_KEY terpasang.
 *   Tanpa itu isOnlinePaymentConfigured() = false dan UI WAJIB menampilkan
 *   status "payment gateway not connected" — tidak ada tombol bayar yang
 *   berpura-pura bekerja.
 * - Jumlah tidak pernah dikirim dari sini: checkout hanya menyebut
 *   (kind, itemId); harga ditentukan katalog server (api/_lib/billingCatalog).
 * - Hasil Snap (onSuccess dsb.) HANYA umpan balik tampilan. Kredit/paket
 *   diberikan server dari webhook Midtrans terverifikasi — callback browser
 *   tidak pernah menjadi bukti pembayaran di arsitektur ini.
 * - snap.js dimuat dari CDN resmi Midtrans (host sandbox/produksi mengikuti
 *   VITE_MIDTRANS_IS_PRODUCTION) dengan data-client-key dari env publik.
 */

export interface MidtransPublicConfig {
  clientKey: string;
  isProduction: boolean;
  snapJsUrl: string;
}

export function getMidtransPublicConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>
): MidtransPublicConfig | null {
  const clientKey = String(env.VITE_MIDTRANS_CLIENT_KEY || '').trim();
  if (!clientKey) return null;
  const isProduction = String(env.VITE_MIDTRANS_IS_PRODUCTION || '').trim().toLowerCase() === 'true';
  return {
    clientKey,
    isProduction,
    snapJsUrl: isProduction
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js',
  };
}

export function isOnlinePaymentConfigured(): boolean {
  return getMidtransPublicConfig() !== null;
}

interface SnapCallbacks {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}

interface SnapGlobal {
  pay: (token: string, callbacks?: SnapCallbacks) => void;
}

declare global {
  interface Window {
    snap?: SnapGlobal;
  }
}

let snapLoadPromise: Promise<void> | null = null;

export function loadSnapJs(config: MidtransPublicConfig): Promise<void> {
  if (typeof window !== 'undefined' && window.snap) return Promise.resolve();
  if (snapLoadPromise) return snapLoadPromise;
  snapLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = config.snapJsUrl;
    script.setAttribute('data-client-key', config.clientKey);
    script.onload = () => resolve();
    script.onerror = () => {
      snapLoadPromise = null;
      reject(new Error('SNAP_LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });
  return snapLoadPromise;
}

export type CheckoutStartResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

/**
 * Mulai checkout online: minta order ke server (JWT Supabase pengguna +
 * workspace aktif), lalu buka Snap dengan token yang dikembalikan server.
 * `accessToken` wajib token sesi nyata — mode demo/anonim ditolak server.
 */
export async function startOnlineCheckout(args: {
  accessToken: string;
  workspaceId?: string;
  kind: 'SUBSCRIPTION' | 'TOP_UP';
  itemId: string;
  callbacks?: SnapCallbacks;
}): Promise<CheckoutStartResult> {
  const config = getMidtransPublicConfig();
  if (!config) return { ok: false, error: 'PAYMENT_NOT_CONNECTED' };
  if (!args.accessToken) return { ok: false, error: 'AUTH_REQUIRED' };

  let resp: Response;
  try {
    resp = await fetch('/api/credits/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
        ...(args.workspaceId ? { 'x-workspace-id': args.workspaceId } : {}),
      },
      body: JSON.stringify({ kind: args.kind, itemId: args.itemId, workspaceId: args.workspaceId }),
    });
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
  const data = (await resp.json().catch(() => null)) as
    | { success?: boolean; token?: string; orderId?: string; error?: string }
    | null;
  if (!resp.ok || !data?.success || !data.token || !data.orderId) {
    return { ok: false, error: data?.error || 'CHECKOUT_FAILED' };
  }

  try {
    await loadSnapJs(config);
  } catch {
    return { ok: false, error: 'SNAP_LOAD_FAILED' };
  }
  if (!window.snap) return { ok: false, error: 'SNAP_UNAVAILABLE' };
  window.snap.pay(data.token, args.callbacks);
  return { ok: true, orderId: data.orderId };
}
