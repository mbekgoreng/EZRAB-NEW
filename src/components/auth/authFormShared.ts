/**
 * authFormShared — konstanta & pemetaan error bersama untuk permukaan
 * login email/kata sandi (SlidingAuthCard + SupabaseLoginPanel), agar
 * validasi dan pesan tidak divergen antar-panel (audit login 2026-10-30,
 * temuan T-1: sebelumnya regex email dan pemetaan error tersalin di
 * beberapa tempat).
 */

export const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tujuan redirect sesudah tautan email Supabase diklik (konfirmasi
 * pendaftaran & reset kata sandi). Supabase menambahkan hash sesi-nya
 * sendiri ke URL ini; rute /masuk yang menerimanya (klien mendeteksi
 * sesi dari URL). Path relatif terhadap origin aplikasi, SATU definisi
 * untuk kedua wrapper Supabase — tanpa ini Supabase jatuh ke Site URL
 * mentah dan alur reset tidak punya halaman tujuan.
 */
export const AUTH_EMAIL_REDIRECT_PATH = '/masuk';

/** Origin aplikasi saat ini ('' di luar browser/SSR). */
export function authRedirectOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** URL redirect email lengkap, atau undefined di luar browser. */
export function authEmailRedirectTo(): string | undefined {
  const origin = authRedirectOrigin();
  return origin ? `${origin}${AUTH_EMAIL_REDIRECT_PATH}` : undefined;
}

/**
 * AUTH-09: pesan error provider TIDAK ditampilkan mentah ke pengguna —
 * petakan ke pesan aman berbahasa Indonesia (selaras friendlyAuthError
 * di AuthContext).
 */
export function friendlyAuthError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email atau kata sandi salah.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (m.includes('user already registered') || m.includes('already exists'))
    return 'Email sudah terdaftar. Silakan masuk.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider'))
    return 'Login Google belum diaktifkan. Hubungi admin.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'Koneksi bermasalah. Periksa jaringan Anda, lalu coba lagi.';
  if (m.includes('password')) return 'Kata sandi tidak memenuhi syarat (min. 6 karakter).';
  return 'Gagal autentikasi. Coba lagi.';
}
