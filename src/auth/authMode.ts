/**
 * ============================================================================
 *  Auth mode resolution — FAIL-SAFE re-enable path (audit auth 2026-10-17).
 * ============================================================================
 *
 * Menjawab pertanyaan: "apa yang terjadi bila AUTH_ENABLED dibalik ke true
 * tetapi Supabase belum dikonfigurasi?" Jawaban yang aman: aplikasi TIDAK
 * BOLEH mengunci owner dan TIDAK BOLEH crash — ia jatuh ke mode demo terbuka
 * (perilaku hari ini) dengan banner peringatan yang jelas.
 *
 * Mode efektif:
 *   'open'          AUTH_ENABLED=false
 *                   → perilaku hari ini: semua CTA masuk/daftar langsung ke
 *                     dashboard, AuthModal tidak pernah di-render.
 *   'real-login'    AUTH_ENABLED=true  + Supabase valid
 *                   → login wajib via AuthModal (Supabase Auth).
 *   'failsafe-demo' AUTH_ENABLED=true  + Supabase TIDAK valid
 *                   → akses tetap terbuka seperti 'open' + banner peringatan.
 *                     Owner tidak pernah terkunci; aplikasi tidak crash.
 *
 * Validasi Supabase di sini SENGAJA lebih ketat daripada
 * `isSupabaseAuthEnabled()` di lib/supabase.ts (yang hanya mengecek
 * keberadaan env): URL harus https:// dan key harus cukup panjang agar
 * konfigurasi setengah jadi tidak memicu 'real-login' dengan form login
 * yang pasti gagal.
 *
 * Aturan user yang dijaga modul ini:
 * - backend authoritative untuk auth; localStorage bukan identitas
 *   (tidak ada sesi yang ditulis/dibaca di sini — murni resolusi mode);
 * - never lock the owner out (failsafe-demo selalu terbuka);
 * - keep demo login (jalur DemoModal / PIN role tidak diubah modul ini).
 * ============================================================================
 */

export type AuthMode = 'open' | 'real-login' | 'failsafe-demo';

/** Bentuk env yang relevan untuk auth (subset dari import.meta.env). */
export interface AuthEnvShape {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

/** Baca env dengan aman di browser (vite), SSR, maupun tsx/node (tanpa env). */
export function readAuthEnv(): AuthEnvShape {
  try {
    const meta = import.meta as unknown as { env?: AuthEnvShape };
    return meta?.env ?? {};
  } catch {
    return {};
  }
}

const MIN_KEY_LENGTH = 20;

/**
 * True hanya bila konfigurasi Supabase cukup valid untuk login nyata:
 * URL https:// yang masuk akal + anon/publishable key yang cukup panjang.
 * Mengembalikan false untuk: env kosong, URL http/localhost, key placeholder.
 */
export function isSupabaseReadyForAuth(env: AuthEnvShape = readAuthEnv()): boolean {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (
    env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
  if (!url.startsWith('https://')) return false;
  if (url.length <= 'https://'.length + 4) return false; // mis. "https://x"
  if (key.length < MIN_KEY_LENGTH) return false;
  return true;
}

/**
 * Tentukan mode auth efektif dari flag AUTH_ENABLED + env.
 * TIDAK PERNAH melempar; default aman = akses terbuka (fail-safe).
 */
export function resolveAuthMode(
  authEnabled: boolean,
  env: AuthEnvShape = readAuthEnv()
): AuthMode {
  if (!authEnabled) return 'open';
  return isSupabaseReadyForAuth(env) ? 'real-login' : 'failsafe-demo';
}

/** True bila mode ini mengizinkan akses terbuka tanpa login (open/demo). */
export function isOpenAccessMode(mode: AuthMode): boolean {
  return mode === 'open' || mode === 'failsafe-demo';
}

/* ------------------------------------------------------------------ */
/* Login UI frontend-only (tanpa backend) — user 2026-10-28            */
/* ------------------------------------------------------------------ */

/**
 * Keputusan tampilnya modal login.
 *
 * - 'real-login' → modal penuh (Supabase). Tidak peduli flag UI.
 * - 'open' + loginUiEnabled → modal DEMO-ONLY: kartu email tampil, tapi
 *   submit email/Google gagal jujur (Supabase belum terkonfigurasi —
 *   lihat SlidingAuthCard), dan jalur masuk yang jalan adalah peran demo
 *   lokal (RoleLoginPanel + forceDemoRoles). Owner tidak pernah terkunci.
 * - 'failsafe-demo' → modal TIDAK tampil walau flag menyala: jalur
 *   fail-safe harus tetap tanpa friksi (langsung workspace + banner).
 * - 'open' tanpa flag → perilaku lama (langsung workspace).
 *
 * AUTH_ENABLED sendiri TIDAK diubah oleh keputusan ini: backend login
 * tetap nonaktif sampai user mendesain ulang backend.
 */
export interface LoginUiDecision {
  showModal: boolean;
  demoOnly: boolean;
}

export function resolveLoginUi(
  mode: AuthMode,
  loginUiEnabled: boolean,
): LoginUiDecision {
  if (mode === 'real-login') return { showModal: true, demoOnly: false };
  if (loginUiEnabled && mode === 'open')
    return { showModal: true, demoOnly: true };
  return { showModal: false, demoOnly: false };
}
