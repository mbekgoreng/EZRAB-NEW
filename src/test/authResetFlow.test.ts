/**
 * Tests: WS-A password-reset flow — pure logic (2026-11-08).
 *
 * Verifies (tanpa jaringan / tanpa kredensial):
 * 1. Konstanta redirect email tunggal: path '/masuk' dipakai signup &
 *    reset; URL lengkap = origin + path; di luar browser = undefined
 *    (tidak pernah mengarang origin).
 * 2. friendlyAuthError memetakan error reset yang relevan: tautan
 *    kedaluwarsa/sesi hilang TIDAK bocor mentah, kredensial salah,
 *    email belum konfirmasi, sandi lemah, jaringan.
 * 3. EMAIL_FORMAT menerima email reset yang sah & menolak yang rusak.
 * 4. Kontrak penanda pemulihan: kunci sessionStorage yang dipakai
 *    SlidingAuthCard & SupabaseLoginPanel adalah string yang sama
 *    (dibaca dari sumber kedua berkas — regresi diam-diam tertangkap).
 *
 * Run: npx tsx src/test/authResetFlow.test.ts
 */
import { readFileSync } from 'node:fs';
import {
  AUTH_EMAIL_REDIRECT_PATH,
  EMAIL_FORMAT,
  authEmailRedirectTo,
  authRedirectOrigin,
  friendlyAuthError,
} from '../components/auth/authFormShared';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(`ASSERT FAILED: ${message}`);
}

function main(): void {
  // 1. Redirect email
  assert(AUTH_EMAIL_REDIRECT_PATH === '/masuk', 'path redirect email harus /masuk');
  assert(authRedirectOrigin() === '', 'di luar browser origin harus kosong');
  assert(authEmailRedirectTo() === undefined, 'di luar browser redirectTo harus undefined');

  // 2. Pemetaan error aman
  assert(
    friendlyAuthError('Invalid login credentials') === 'Email atau kata sandi salah.',
    'kredensial salah terpetakan'
  );
  assert(
    friendlyAuthError('Email not confirmed') === 'Email belum dikonfirmasi. Cek kotak masuk Anda.',
    'email belum konfirmasi terpetakan'
  );
  assert(
    friendlyAuthError('New password should be at least 6 characters').includes('min. 6 karakter'),
    'sandi lemah terpetakan ke syarat minimum'
  );
  assert(
    friendlyAuthError('Failed to fetch') === 'Koneksi bermasalah. Periksa jaringan Anda, lalu coba lagi.',
    'kegagalan jaringan terpetakan'
  );
  const expired = friendlyAuthError('Auth session missing!');
  assert(expired === 'Gagal autentikasi. Coba lagi.', 'sesi pemulihan hilang → pesan generik aman');
  assert(!expired.includes('session') && !expired.includes('Auth'), 'pesan generik tidak membocorkan istilah provider');

  // 3. Format email untuk form reset
  assert(EMAIL_FORMAT.test('pemilik@ezrab.site'), 'email sah diterima');
  assert(!EMAIL_FORMAT.test('bukan-email'), 'email tanpa @ ditolak');
  assert(!EMAIL_FORMAT.test('a@b'), 'email tanpa domain lengkap ditolak');
  assert(!EMAIL_FORMAT.test(''), 'email kosong ditolak');

  // 4. Kontrak penanda pemulihan lintas berkas
  const card = readFileSync(new URL('../components/auth/SlidingAuthCard.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../components/auth/SupabaseLoginPanel.tsx', import.meta.url), 'utf8');
  const ctx = readFileSync(new URL('../auth/AuthContext.tsx', import.meta.url), 'utf8');
  const svc = readFileSync(new URL('../services/supabaseClient.ts', import.meta.url), 'utf8');
  assert(card.includes("sessionStorage.setItem('ezrab_pw_recovery', '1')"), 'SlidingAuthCard memasang penanda pemulihan');
  assert(panel.includes("sessionStorage.getItem('ezrab_pw_recovery')"), 'SupabaseLoginPanel membaca penanda yang sama');
  assert(panel.includes("sessionStorage.removeItem('ezrab_pw_recovery')"), 'penanda dibersihkan sesudah sandi diganti');
  assert(card.includes('PASSWORD_RECOVERY'), 'SlidingAuthCard mendengar event PASSWORD_RECOVERY');
  assert(ctx.includes('resetPasswordForEmail'), 'AuthContext menyediakan resetPassword');
  assert(ctx.includes('updateUser({ password'), 'AuthContext menyediakan updatePassword');
  assert(svc.includes('resetPasswordForEmail'), 'services wrapper menyediakan requestPasswordReset');
  assert(svc.includes('authEmailRedirectTo()'), 'services signUp/reset memakai redirect bersama');
  assert(ctx.includes('authEmailRedirectTo()'), 'AuthContext signUp memakai redirect bersama');

  console.log('PASS authResetFlow.test.ts: redirect email, pemetaan error reset, format email, kontrak penanda pemulihan');
}

main();
