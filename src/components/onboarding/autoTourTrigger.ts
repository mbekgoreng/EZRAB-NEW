/**
 * Keputusan pemicu pop-up tutorial (welcome) otomatis.
 *
 * Diekstrak sebagai fungsi murni agar bisa dites tanpa me-render App.
 * Perilaku yang dikunci (perintah owner 2026-11-10): pop-up welcome HARUS
 * muncul otomatis saat dashboard sungguh tampil — bukan sekadar saat URL
 * memasuki /app/*. Karena itu penjadwalan mensyaratkan `workspaceReady`:
 * sinyal dari WorkspaceShell bahwa chunk workspace sudah termuat DAN
 * PasscodeGate sudah lolos (children gerbang hanya me-mount saat terbuka).
 * Sebelum perbaikan, timer 900 ms berjalan hanya berdasar URL sehingga
 * pop-up bisa muncul di atas layar kunci/boot dan flag selesai ter-set
 * sebelum dashboard pernah terlihat.
 */
import { shouldShowOnboarding } from './OnboardingTour';

export interface AutoTourGateState {
  /** App sudah boot (flag boot internal App). */
  booted: boolean;
  /** URL saat ini berada di dalam workspace (/app/*). */
  isWorkspace: boolean;
  /** Workspace sungguh tampil: gerbang lolos + chunk termuat. */
  workspaceReady: boolean;
  /** Pop-up otomatis sudah benar-benar ditampilkan pada sesi ini. */
  autoShownThisSession: boolean;
}

/**
 * true bila pop-up welcome otomatis boleh dijadwalkan sekarang.
 * Sekali-per-pengguna tetap dijaga oleh flag `ezrab_onboarding_done_v1`
 * lewat shouldShowOnboarding(); fungsi ini tidak menulis flag apa pun.
 */
export function shouldScheduleAutoTour(state: AutoTourGateState): boolean {
  if (!state.booted) return false;
  if (!state.isWorkspace) return false;
  if (!state.workspaceReady) return false;
  if (state.autoShownThisSession) return false;
  return shouldShowOnboarding();
}
