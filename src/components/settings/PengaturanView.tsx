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
    <div
      className="ezdb-anim"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        maxWidth: '1440px',
        margin: '0 auto',
        width: '100%',
        color: 'var(--ez-color-text-primary)',
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        animation: 'ezdb-rise 0.6s 0s both',
      }}
    >
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      <UnifiedSettingsView
        initialTab={initialTab}
        initialScope={initialScope}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
};

export default PengaturanView;
