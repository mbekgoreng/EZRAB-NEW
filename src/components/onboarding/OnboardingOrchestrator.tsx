/**
 * OnboardingOrchestrator — mengatur urutan tour onboarding.
 *
 * Alur:
 * 1. Welcome tour (OnboardingTour) — sudah ada di App.tsx
 * 2. DashboardTour dapat dibuka via event `ezrab:open-dashboard-tour`
 *    atau otomatis setelah welcome tour pertama kali selesai
 *
 * FirstProjectChecklist dirender terpisah di WorkspaceView
 * (membutuhkan ProjectProvider).
 *
 * Tidak mengganggu auth guard atau routing.
 */
import { useCallback, useEffect, useState } from 'react';
import { DashboardTour } from './DashboardTour';
import { claimTutorialSlot, releaseTutorialSlot } from './tutorials/tutorialCoordinator';

export const DASHBOARD_TOUR_EVENT = 'ezrab:open-dashboard-tour';

export function openDashboardTour(): void {
  try {
    window.dispatchEvent(new CustomEvent(DASHBOARD_TOUR_EVENT));
  } catch {
    /* abaikan */
  }
}

export function OnboardingOrchestrator() {
  const [dashboardTourOpen, setDashboardTourOpen] = useState(false);

  // Klaim slot anti-tumpuk saat dashboard tour aktif
  useEffect(() => {
    if (dashboardTourOpen) claimTutorialSlot('dashboard');
    else releaseTutorialSlot('dashboard');
    return () => releaseTutorialSlot('dashboard');
  }, [dashboardTourOpen]);

  // Dengarkan event buka dashboard tour
  useEffect(() => {
    const handler = () => setDashboardTourOpen(true);
    window.addEventListener(DASHBOARD_TOUR_EVENT, handler);
    return () => window.removeEventListener(DASHBOARD_TOUR_EVENT, handler);
  }, []);

  const handleDashboardTourDone = useCallback(() => {
    setDashboardTourOpen(false);
  }, []);

  if (!dashboardTourOpen) return null;
  return <DashboardTour onDone={handleDashboardTourDone} />;
}
