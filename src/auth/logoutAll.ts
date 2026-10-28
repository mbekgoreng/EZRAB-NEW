/**
 * Logout terpusat (R2) — SATU alur yang dipakai semua titik keluar.
 *
 * Yang dilakukan logoutAll (logout workspace):
 *  1. Menandai batas sesi (sessionBoundary) SEBELUM pekerjaan async apa
 *     pun, supaya flush-on-unmount ProjectContext tidak menghidupkan
 *     kembali state yang baru dibersihkan.
 *  2. Menghapus sesi role demo (state provider + kunci localStorage).
 *  3. Sign-out Supabase bila ada sesi Supabase (kegagalan dicatat,
 *     bukan dilempar — logout tetap berjalan).
 *  4. Memanggil endpoint passcode-logout agar cookie sesi gerbang
 *     dihapus server-side (kegagalan dicatat, bukan dilempar).
 *  5. Menghapus kunci localStorage transien/sesi (bukan data proyek).
 *
 * Yang SENGAJA TIDAK dilakukan:
 *  - Tidak menghapus badan data proyek/RAB/QTO/dokumen (ezrab_prod_*).
 *    Data itu hanya tersimpan lokal tanpa salinan server dan tanpa
 *    pemilik akun — menghapusnya saat logout sama dengan menghancurkan
 *    pekerjaan owner. Komentar yang sama sudah ada di WorkspaceView
 *    ("keluar ke landing tidak menghapus data"). Isolasi proyek
 *    per-pengguna yang sesungguhnya butuh model server (R3/R5).
 *  - Tidak mengklaim sesi server berakhir bila langkahnya tidak
 *    dicoba atau gagal: lihat LogoutResult (attempted/ok per langkah
 *    + allAttemptedOk). Pemanggil tidak boleh menampilkan "semua sesi
 *    berakhir" bila allAttemptedOk false.
 *  - Tidak mencatat token, kata sandi, PIN, cookie, atau secret apa pun.
 *    Pesan error hanya berisi nama langkah + status HTTP.
 *
 * Varian logoutSessionsOnly dipakai tombol Keluar di UI login
 * (SupabaseLoginPanel, SlidingAuthCard): tempat itu tampil SEBELUM
 * workspace mount, jadi pembersihan transien workspace tidak relevan
 * dan navigasi tidak dilakukan — hanya sesi (role + Supabase +
 * passcode) yang diakhiri. Navigasi tetap tanggung jawab pemanggil.
 */

import { ROLE_STORAGE_KEY } from './RoleContext';
import { beginLogout } from './sessionBoundary';

/**
 * Kunci localStorage yang bersifat sesi/transien — dihapus saat logout
 * workspace. Daftar ini SENGAJA pendek:
 *  - ezrab_ai_workspace_sessions_v2: sesi chat AI (state sesi, bukan data).
 *  - ezrab_prod_active_project_id: penunjuk proyek aktif saja (bukan
 *    badan proyek). Proyek berikutnya dibuka eksplisit, tidak
 *    terwarisi otomatis.
 * Preferensi (tema, motion, density, accent, tur/onboarding) dan badan
 * data (ezrab_prod_*, backup, desain, log audit) TIDAK ada di sini.
 */
export const TRANSIENT_SESSION_KEYS: string[] = [
  'ezrab_ai_workspace_sessions_v2',
  'ezrab_prod_active_project_id',
];

export interface SupabaseSignOutResult {
  error?: unknown;
}

export interface LogoutCallbacks {
  /** Menghapus sesi role (biasanya logoutRole dari useRole). */
  logoutRole: () => void;
  /** True bila ada sesi Supabase aktif yang perlu diakhiri. */
  hasSupabaseSession: boolean;
  /** Sign-out Supabase (AuthContext.signOut atau signOutSupabase). */
  signOutSupabase?: () => Promise<SupabaseSignOutResult | void>;
  /** Fetch untuk pengujian / lingkungan non-browser. Default: global fetch. */
  fetchImpl?: typeof fetch;
}

export interface LogoutResult {
  roleCleared: boolean;
  supabaseAttempted: boolean;
  supabaseOk: boolean;
  passcodeAttempted: boolean;
  passcodeOk: boolean;
  /** Kunci transien yang berhasil dihapus (kosong untuk sessions-only). */
  transientCleared: string[];
  /** Pesan kegagalan per langkah (nama langkah + status, tanpa secret). */
  errors: string[];
  /**
   * True hanya bila SEMUA langkah yang dicoba berhasil (dan role
   * berhasil dibersihkan). False TIDAK menghentikan logout lokal —
   * pemanggil harus mencatatnya, bukan mengklaim semua sesi berakhir.
   */
  allAttemptedOk: boolean;
}

function safeErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return msg ? msg.slice(0, 120) : 'unknown error';
}

/** Hapus kunci transien dari storage. Mengembalikan kunci yang dihapus. */
export function clearTransientSessionStorage(
  storage?: Pick<Storage, 'removeItem'>,
): string[] {
  const store =
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return [];
  const cleared: string[] = [];
  for (const key of TRANSIENT_SESSION_KEYS) {
    try {
      store.removeItem(key);
      cleared.push(key);
    } catch {
      /* abaikan — kunci yang gagal dihapus tidak dilaporkan sebagai bersih */
    }
  }
  return cleared;
}

async function logoutSessions(
  callbacks: LogoutCallbacks,
): Promise<Omit<LogoutResult, 'transientCleared'>> {
  beginLogout();
  const errors: string[] = [];

  // 1. Sesi role demo: state provider + kunci penyimpanan (sabuk ganda
  // untuk kasus tanpa provider, di mana logoutRole adalah no-op).
  let roleCleared = false;
  try {
    callbacks.logoutRole();
  } catch (e) {
    errors.push(`role logout gagal: ${safeErrorText(e)}`);
  }
  try {
    localStorage.removeItem(ROLE_STORAGE_KEY);
    roleCleared = localStorage.getItem(ROLE_STORAGE_KEY) === null;
    if (!roleCleared) errors.push('role session key tidak terhapus');
  } catch (e) {
    errors.push(`role session key gagal dihapus: ${safeErrorText(e)}`);
  }

  // 2. Supabase — hanya bila ada sesi. Tanpa sesi tidak ada yang perlu
  // diakhiri, dan tidak ada klaim apa pun tentang server.
  let supabaseAttempted = false;
  let supabaseOk = true;
  if (callbacks.hasSupabaseSession && callbacks.signOutSupabase) {
    supabaseAttempted = true;
    try {
      const res = await callbacks.signOutSupabase();
      if (res && res.error) {
        supabaseOk = false;
        errors.push(`Supabase sign-out gagal: ${safeErrorText(res.error)}`);
      }
    } catch (e) {
      supabaseOk = false;
      errors.push(`Supabase sign-out gagal: ${safeErrorText(e)}`);
    }
  }

  // 3. Cookie sesi gerbang — selalu dicoba bila fetch tersedia, bahkan
  // tanpa cookie (endpoint mengembalikan clear-header secara idempotent).
  let passcodeAttempted = false;
  let passcodeOk = true;
  const fetchFn =
    callbacks.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (fetchFn) {
    passcodeAttempted = true;
    try {
      const res = await fetchFn('/api/access/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        passcodeOk = false;
        errors.push(`Passcode logout gagal (HTTP ${res.status})`);
      }
    } catch (e) {
      passcodeOk = false;
      errors.push(`Passcode logout gagal (jaringan): ${safeErrorText(e)}`);
    }
  }

  const allAttemptedOk =
    roleCleared &&
    (!supabaseAttempted || supabaseOk) &&
    (!passcodeAttempted || passcodeOk);
  return {
    roleCleared,
    supabaseAttempted,
    supabaseOk,
    passcodeAttempted,
    passcodeOk,
    errors,
    allAttemptedOk,
  };
}

/** Logout workspace penuh: sesi + kunci transien. Navigasi oleh pemanggil. */
export async function logoutAll(callbacks: LogoutCallbacks): Promise<LogoutResult> {
  const sessions = await logoutSessions(callbacks);
  const transientCleared = clearTransientSessionStorage();
  return { ...sessions, transientCleared };
}

/**
 * Logout hanya-sesi untuk tombol Keluar di UI login (belum ada workspace
 * mount): mengakhiri role + Supabase + passcode, TANPA menghapus kunci
 * transien workspace dan TANPA navigasi.
 */
export async function logoutSessionsOnly(
  callbacks: LogoutCallbacks,
): Promise<LogoutResult> {
  const sessions = await logoutSessions(callbacks);
  return { ...sessions, transientCleared: [] };
}
