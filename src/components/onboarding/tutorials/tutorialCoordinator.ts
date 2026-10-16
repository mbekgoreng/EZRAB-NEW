/**
 * tutorialCoordinator — mencegah tutorial bertumpuk.
 *
 * Hanya satu overlay tutorial yang boleh aktif dalam satu waktu:
 * welcome tour, dashboard tour, atau satu feature tutorial.
 *
 * Modul-level (bukan React state) agar dapat dipakai dari App,
 * OnboardingOrchestrator, dan FeatureTutorialPlayer tanpa prop drilling.
 */
export type TutorialSlotKind = 'welcome' | 'dashboard' | 'feature';

let activeSlot: TutorialSlotKind | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* abaikan */
    }
  }
}

/**
 * Coba klaim slot. Berhasil (true) hanya jika tidak ada tutorial lain aktif.
 */
export function claimTutorialSlot(kind: TutorialSlotKind): boolean {
  if (activeSlot !== null && activeSlot !== kind) return false;
  activeSlot = kind;
  notify();
  return true;
}

/** Lepaskan slot yang diklaim. */
export function releaseTutorialSlot(kind: TutorialSlotKind): void {
  if (activeSlot === kind) {
    activeSlot = null;
    notify();
  }
}

/** Slot sedang dipakai oleh tutorial lain (bukan kind yang diminta). */
export function isSlotTakenByOther(kind: TutorialSlotKind): boolean {
  return activeSlot !== null && activeSlot !== kind;
}

export function getActiveSlot(): TutorialSlotKind | null {
  return activeSlot;
}

/** Untuk testing: paksa reset. */
export function resetTutorialSlots(): void {
  activeSlot = null;
  notify();
}
