/**
 * ============================================================================
 *  Access gate client — gerbang sementara dashboard (server-backed).
 * ============================================================================
 *
 *  Riwayat: versi awal (2026-10-20) memvalidasi kode di client dan menyimpan
 *  status di sessionStorage. Versi itu DIGANTIKAN oleh desain server-side
 *  (task "TEMPORARY DASHBOARD ACCESS GATE"):
 *
 *    - Kode akses TIDAK ADA di client (tidak di bundle, tidak di env publik
 *      VITE_*). Validasi hanya di server: POST /api/access/verify membaca
 *      env server-only EZRAB_ACCESS_CODE.
 *    - Sesi = cookie HttpOnly bertanda tangan HMAC (12 jam) yang diverifikasi
 *      server (middleware Edge + endpoint). Tidak ada status "terbuka" yang
 *      disimpan di localStorage/sessionStorage — flag seperti itu bisa
 *      dipalsukan siapa pun dari devtools.
 *    - File ini hanya klien tipis untuk dua endpoint tersebut.
 *
 *  Ini tetap gerbang SEMENTARA (penghalang demo), bukan autentikasi
 *  pengguna. Backend tetap authoritative untuk auth/AuthZ nyata.
 * ============================================================================
 */

export interface AccessSessionState {
  /** Server mengenali konfigurasi gerbang (env ter-set). */
  configured: boolean;
  /** Cookie sesi valid menurut server. */
  active: boolean;
  /** Endpoint berhasil dihubungi (false = jaringan/dev tanpa API). */
  reachable: boolean;
}

/** Periksa status sesi ke server. Fail-closed: error apa pun = tidak aktif. */
export async function checkAccessSession(): Promise<AccessSessionState> {
  try {
    const res = await fetch('/api/access/session', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { configured: false, active: false, reachable: false };
    const data = (await res.json()) as { configured?: boolean; active?: boolean };
    return {
      configured: data.configured === true,
      active: data.active === true,
      reachable: true,
    };
  } catch {
    return { configured: false, active: false, reachable: false };
  }
}

export type SubmitAccessResult =
  | { ok: true }
  | {
      ok: false;
      kind: 'invalid' | 'rate-limited' | 'not-configured' | 'network';
      message: string;
    };

/** Kirim kode ke server. Kode tidak disimpan di mana pun di client. */
export async function submitAccessCode(code: string): Promise<SubmitAccessResult> {
  try {
    const res = await fetch('/api/access/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (res.status === 503 || data.error === 'ACCESS_NOT_CONFIGURED') {
      return {
        ok: false,
        kind: 'not-configured',
        message: 'Gerbang akses belum dikonfigurasi di server.',
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        kind: 'rate-limited',
        message: data.message || 'Terlalu banyak percobaan. Coba lagi nanti.',
      };
    }
    return { ok: false, kind: 'invalid', message: data.message || 'Kode salah. Coba lagi.' };
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'Tidak dapat menghubungi server. Periksa koneksi Anda.',
    };
  }
}

/** Tujuan sesudah gerbang dibuka: hanya path internal /app yang diterima. */
export function sanitizeNextPath(raw: string | null, fallback = '/app/dashboard'): string {
  if (!raw) return fallback;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded === '/app' || decoded.startsWith('/app/')) return decoded;
  } catch {
    /* abaikan */
  }
  return fallback;
}
