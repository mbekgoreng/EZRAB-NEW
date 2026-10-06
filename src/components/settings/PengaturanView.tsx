import React from 'react';
import { UnifiedSettingsView, SettingsTabId } from './UnifiedSettingsView';

interface PengaturanViewProps {
  initialTab?: 'perusahaan' | 'estimasi' | 'ai' | 'keamanan' | SettingsTabId | string;
  initialScope?: 'GLOBAL' | 'PROJECT';
  onNavigateTab?: (tab: string) => void;
}

export const PengaturanView: React.FC<PengaturanViewProps> = ({
  initialTab = 'profile',
  initialScope,
  onNavigateTab,
}) => {
  return (
    <UnifiedSettingsView
      initialTab={initialTab}
      initialScope={initialScope}
      onNavigateTab={onNavigateTab}
    />
  );
};

export default PengaturanView;
