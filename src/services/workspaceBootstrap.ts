/**
 * Phase 2 W5 — pemicu bootstrap workspace dari browser.
 *
 * SESI TERAUTENTIKASI PERTAMA → POST /api/credits/bootstrap dengan Bearer
 * token Supabase. Server yang memutuskan SEGALANYA: workspace mana,
 * peran apa (allowlist env server-side), dan provisioning billing.
 * Klien TIDAK PERNAH mengirim role, workspaceId, atau klaim kepemilikan
 * apa pun — body request kosong.
 *
 * Idempoten & aman dipanggil berulang: panggilan kedua mengembalikan
 * keanggotaan yang sudah ada. Dedup in-flight mencegah dua panggilan
 * bersamaan dari dua efek React. Kegagalan TIDAK PERNAH memecahkan login:
 * pemanggil (AuthContext) memanggil ini fire-and-forget, dan endpoint
 * billing tetap menjawab NOT_A_MEMBER secara jujur bila bootstrap belum
 * berhasil — percobaan berikutnya terjadi pada event sesi berikutnya.
 *
 * Tidak ada panggilan jaringan bila Supabase tidak dikonfigurasi atau
 * tidak ada sesi (mode demo / belum login).
 */
import { getSupabaseClient, isSupabaseAuthEnabled } from '../lib/supabase';

export interface WorkspaceBootstrapResult {
  ok: boolean;
  created?: boolean;
  workspaceId?: string | null;
  role?: string | null;
  billingProvisioned?: boolean;
  freeOnceGranted?: boolean;
  ownerAllowlistConfigured?: boolean;
  billingNotConfigured?: boolean;
  billingError?: string;
  error?: string;
}

interface BootstrapResponseBody {
  success?: boolean;
  workspaceId?: string;
  role?: string;
  created?: boolean;
  billingProvisioned?: boolean;
  freeOnceGranted?: boolean;
  ownerAllowlistConfigured?: boolean;
  billingNotConfigured?: boolean;
  billingError?: string;
  errorCode?: string;
  error?: string;
}

let inFlight: Promise<WorkspaceBootstrapResult> | null = null;

/** Pastikan workspace pengguna terautentikasi ada (idempoten, dedup in-flight). */
export async function ensureWorkspaceBootstrap(): Promise<WorkspaceBootstrapResult> {
  if (inFlight) return inFlight;
  const run = runBootstrap();
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}

async function runBootstrap(): Promise<WorkspaceBootstrapResult> {
  try {
    if (!isSupabaseAuthEnabled()) return { ok: false, error: 'SUPABASE_NOT_CONFIGURED' };
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, error: 'SUPABASE_NOT_CONFIGURED' };
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) return { ok: false, error: 'NO_SESSION' };

    let resp: Response;
    try {
      resp = await fetch('/api/credits/bootstrap', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
    } catch {
      return { ok: false, error: 'NETWORK_ERROR' };
    }

    let parsed: BootstrapResponseBody | null = null;
    try {
      parsed = (await resp.json()) as BootstrapResponseBody;
    } catch {
      return { ok: false, error: `BOOTSTRAP_HTTP_${resp.status}` };
    }
    if (!resp.ok || !parsed || parsed.success !== true) {
      return {
        ok: false,
        error: parsed?.errorCode || parsed?.error || `BOOTSTRAP_HTTP_${resp.status}`,
      };
    }
    return {
      ok: true,
      created: parsed.created === true,
      workspaceId: parsed.workspaceId ?? null,
      role: parsed.role ?? null,
      billingProvisioned: parsed.billingProvisioned === true,
      freeOnceGranted: parsed.freeOnceGranted === true,
      ownerAllowlistConfigured: parsed.ownerAllowlistConfigured === true,
      billingNotConfigured: parsed.billingNotConfigured === true,
      billingError: parsed.billingError,
    };
  } catch {
    return { ok: false, error: 'BOOTSTRAP_FAILED' };
  }
}
