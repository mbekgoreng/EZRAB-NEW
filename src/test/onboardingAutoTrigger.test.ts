/**
 * EZRAB — ONBOARDING AUTO-TRIGGER TEST SUITE
 * ==========================================
 * Mengunci keputusan penjadwalan pop-up tutorial (welcome) otomatis
 * (perintah owner 2026-11-10: pop-up HARUS muncul otomatis saat dashboard
 * dibuka — bukan di landing, bukan di atas layar kunci/boot, tidak dobel,
 * dan tidak muncul lagi sesudah pengguna selesai).
 *
 * Memverifikasi shouldScheduleAutoTour (autoTourTrigger.ts):
 * 1. flag absen + masuk workspace yang sungguh tampil → jadwalkan
 * 2. flag ter-set (termasuk hasil migrasi legacy) → tidak menjadwalkan
 * 3. tidak dijadwalkan di luar workspace / sebelum workspace siap
 *    (gerbang belum lolos / chunk belum termuat) / sebelum boot
 * 4. tidak dobel: sesudah tampil sekali dalam sesi → tidak menjadwalkan
 *
 * Run: npx tsx src/test/onboardingAutoTrigger.test.ts
 */
import { strict as assert } from 'node:assert';

// --- Mock browser globals (pola onboardingFoundation.test.ts) ---
const store = new Map<string, string>();
(global as any).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
};

import {
  LEGACY_ONBOARDING_FLAG,
  markOnboardingDone,
  migrateLegacyOnboardingFlag,
} from '../components/onboarding/OnboardingTour';
import {
  shouldScheduleAutoTour,
  type AutoTourGateState,
} from '../components/onboarding/autoTourTrigger';

/** Keadaan dasar: pengguna baru, dashboard sungguh tampil. */
const READY: AutoTourGateState = {
  booted: true,
  isWorkspace: true,
  workspaceReady: true,
  autoShownThisSession: false,
};

let failures = 0;
function test(name: string, fn: () => void) {
  store.clear();
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}: ${(e as Error).message}`);
  }
}

console.log('\n[1] Pengguna baru di dashboard → dijadwalkan');
test('flag absen + workspace tampil → true', () => {
  assert.equal(shouldScheduleAutoTour(READY), true);
});

console.log('\n[2] Flag ter-set → tidak dijadwalkan');
test('flag selesai ter-set → false', () => {
  markOnboardingDone();
  assert.equal(shouldScheduleAutoTour(READY), false);
});
test('flag legacy termigrasi → false (pengguna lama tidak ditanya ulang)', () => {
  store.set(LEGACY_ONBOARDING_FLAG, 'true');
  assert.equal(migrateLegacyOnboardingFlag(), true);
  assert.equal(shouldScheduleAutoTour(READY), false);
});

console.log('\n[3] Belum di dashboard sungguhan → tidak dijadwalkan');
test('di luar workspace (landing) → false', () => {
  assert.equal(shouldScheduleAutoTour({ ...READY, isWorkspace: false }), false);
});
test('workspace belum siap (gerbang/boot/chunk) → false', () => {
  assert.equal(shouldScheduleAutoTour({ ...READY, workspaceReady: false }), false);
});
test('belum boot → false', () => {
  assert.equal(shouldScheduleAutoTour({ ...READY, booted: false }), false);
});

console.log('\n[4] Tidak dobel dalam satu sesi');
test('sudah tampil sekali sesi ini → false', () => {
  assert.equal(
    shouldScheduleAutoTour({ ...READY, autoShownThisSession: true }),
    false
  );
});
test('kombinasi: sudah tampil + flag absen pun tetap false', () => {
  assert.equal(
    shouldScheduleAutoTour({
      booted: true,
      isWorkspace: true,
      workspaceReady: true,
      autoShownThisSession: true,
    }),
    false
  );
});

console.log('');
if (failures > 0) {
  console.error(`Failed tests: ${failures}`);
  process.exit(1);
} else {
  console.log('Semua test onboarding auto-trigger PASS.');
}
