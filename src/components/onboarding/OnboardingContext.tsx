/**
 * OnboardingContext — state terpusat untuk sistem onboarding EZRAB.
 *
 * Satu-satunya sumber kebenaran untuk status onboarding. Menggantikan
 * pemakaian langsung helper localStorage yang tersebar.
 *
 * - Progres bersifat lokal per-browser (auth dimatikan; tidak ada klaim sync akun).
 * - Menangani localStorage yang gagal dibaca, data rusak, dan perubahan versi skema.
 * - Migrasi key legacy dilakukan idempoten saat provider di-mount.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { navigateTo } from '../../routing/routes';
import {
  LEGACY_ONBOARDING_FLAG,
  ONBOARDING_FLAG,
  ONBOARDING_OPEN_EVENT,
  ONBOARDING_SCHEMA_VERSION,
  migrateLegacyOnboardingFlag,
} from './OnboardingTour';

const VERSION_KEY = 'ezrab_onboarding_schema_version';
const SEEN_TOUR_PREFIX = 'ezrab_tour_seen_';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}

export interface OnboardingState {
  /** true jika welcome onboarding sudah selesai (tidak tampil otomatis lagi) */
  completed: boolean;
  /** apakah modal welcome sedang terbuka */
  tourOpen: boolean;
  /** buka modal welcome */
  openTour: () => void;
  /** tutup modal welcome (menandai selesai) */
  closeTour: () => void;
  /** tandai selesai tanpa membuka */
  markDone: () => void;
  /** reset agar muncul lagi (pengaturan/testing) */
  reset: () => void;
  /** apakah tutorial fitur tertentu sudah pernah dilihat */
  hasSeenFeatureTour: (featureId: string) => boolean;
  /** tandai tutorial fitur sudah dilihat */
  markFeatureTourSeen: (featureId: string) => void;
  /** navigasi aman ke route fitur */
  goToFeature: (path: string) => void;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Inisialisasi: migrasi legacy + baca status + cek versi skema
  useEffect(() => {
    migrateLegacyOnboardingFlag();
    const storedVersion = safeGet(VERSION_KEY);
    if (storedVersion !== null && storedVersion !== String(ONBOARDING_SCHEMA_VERSION)) {
      // Versi skema berubah: jangan paksa ulang, pertahankan status selesai yang ada.
      safeSet(VERSION_KEY, String(ONBOARDING_SCHEMA_VERSION));
    } else if (storedVersion === null) {
      safeSet(VERSION_KEY, String(ONBOARDING_SCHEMA_VERSION));
    }
    setCompleted(safeGet(ONBOARDING_FLAG) === '1');
  }, []);

  // Dengarkan event global buka ulang (entry point "Ulangi Tutorial")
  useEffect(() => {
    const handler = () => setTourOpen(true);
    window.addEventListener(ONBOARDING_OPEN_EVENT, handler);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, handler);
  }, []);

  const openTour = useCallback(() => {
    setTourOpen(true);
    // Dispatch event global agar App-level OnboardingTour (useOnboardingTour) ikut terbuka.
    // Menjaga kompatibilitas dengan sistem Phase 2.
    try {
      window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT));
    } catch {
      /* abaikan */
    }
  }, []);

  const markDone = useCallback(() => {
    if (safeSet(ONBOARDING_FLAG, '1')) setCompleted(true);
    else setCompleted(true); // storage gagal: anggap selesai agar tidak mengulang
  }, []);

  const closeTour = useCallback(() => {
    markDone();
    setTourOpen(false);
  }, [markDone]);

  const reset = useCallback(() => {
    safeRemove(ONBOARDING_FLAG);
    safeRemove(LEGACY_ONBOARDING_FLAG);
    setCompleted(false);
  }, []);

  const hasSeenFeatureTour = useCallback((featureId: string) => {
    return safeGet(SEEN_TOUR_PREFIX + featureId) === '1';
  }, []);

  const markFeatureTourSeen = useCallback((featureId: string) => {
    safeSet(SEEN_TOUR_PREFIX + featureId, '1');
  }, []);

  const goToFeature = useCallback((path: string) => {
    if (typeof path === 'string' && path.startsWith('/app')) navigateTo(path);
  }, []);

  const value = useMemo<OnboardingState>(
    () => ({
      completed,
      tourOpen,
      openTour,
      closeTour,
      markDone,
      reset,
      hasSeenFeatureTour,
      markFeatureTourSeen,
      goToFeature,
    }),
    [completed, tourOpen, openTour, closeTour, markDone, reset, hasSeenFeatureTour, markFeatureTourSeen, goToFeature]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

/** Akses state onboarding terpusat. Harus dipakai di dalam <OnboardingProvider>. */
export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding harus dipakai di dalam <OnboardingProvider>');
  return ctx;
}
