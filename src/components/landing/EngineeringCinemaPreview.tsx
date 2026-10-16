/**
 * EngineeringCinemaPreview — host route /preview/landing-cinema (PREVIEW VARIANT)
 *
 * Branch: preview/landing-engineering-cinema
 * Me-mount EzrabLandingPage + GuidedWorkspaceTour secara terisolasi.
 * Path proposal ('/dashboard', '/login') dipetakan ke route asli app
 * ('/app/dashboard', '/masuk') agar CTA berfungsi di preview.
 */
import React, { useState, useCallback } from 'react';
import { EzrabLandingPage } from './EzrabLandingPage';
import { GuidedWorkspaceTour } from './GuidedWorkspaceUpgrade';
import { navigateTo, paths } from '../../routing/routes';

export const LANDING_CINEMA_PREVIEW_PATH = '/preview/landing-cinema';

const mapProposalPath = (target: string): string => {
  if (target === '/dashboard') return paths.dashboard();
  if (target === '/login') return paths.login();
  if (target.startsWith('#')) return target;
  return target;
};

export const EngineeringCinemaPreview: React.FC = () => {
  const [tourVisible, setTourVisible] = useState(false);

  const handleNavigate = useCallback((target: string) => {
    if (target.startsWith('#')) {
      const el = document.querySelector(target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    navigateTo(mapProposalPath(target));
  }, []);

  const openTour = useCallback(() => setTourVisible(true), []);
  const closeTour = useCallback(() => setTourVisible(false), []);

  return (
    <>
      <EzrabLandingPage
        isAuthenticated={false}
        onNavigate={handleNavigate}
        onStartGuidedWorkspace={openTour}
      />
      {tourVisible && (
        <GuidedWorkspaceTour
          currentPath={LANDING_CINEMA_PREVIEW_PATH}
          onClose={closeTour}
        />
      )}
    </>
  );
};
