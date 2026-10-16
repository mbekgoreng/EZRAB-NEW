/**
 * WelcomeSlotGuard — mengklaim slot 'welcome' saat welcome tour aktif.
 *
 * Dipasang di App bersama OnboardingTour agar FeatureTutorialPlayer
 * tahu kapan welcome tour sedang berjalan (anti-tumpuk).
 */
import { useEffect } from 'react';
import { claimTutorialSlot, releaseTutorialSlot } from './tutorialCoordinator';

export function WelcomeSlotGuard({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) {
      claimTutorialSlot('welcome');
    } else {
      releaseTutorialSlot('welcome');
    }
    return () => releaseTutorialSlot('welcome');
  }, [active]);
  return null;
}

export default WelcomeSlotGuard;
