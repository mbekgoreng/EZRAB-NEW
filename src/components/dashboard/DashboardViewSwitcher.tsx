import React, { useState } from 'react';
import { LayoutGrid, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n';
import { EzrabAiDashboardView } from './EzrabAiDashboardView';
import { EzrabAiDashboardViewClassic } from './EzrabAiDashboardViewClassic';

interface DashboardViewSwitcherProps {
  projects: any[];
  onCreateProject: () => void;
  onSelectProject: (projectId: string, menu?: string) => void;
  onNavigateToTab: (tab: string, projId?: string | null) => void;
  onOpenMagicAi: (mode?: 'chat' | 'ded-rab') => void;
  onOpenSubscription: () => void;
  onResetData?: () => void;
  onOpenOnboarding?: () => void;
}

const STORAGE_KEY = 'ezrab_dashboard_view';

/**
 * Dashboard dengan dua konsep tampilan:
 * - "modern": pastel clean ala mockup V2 (default)
 * - "klasik": konsep lama dengan hero maskot
 * Preferensi tersimpan di localStorage.
 */
export const DashboardViewSwitcher: React.FC<DashboardViewSwitcherProps> = (props) => {
  const { t } = useI18n();
  const [view, setView] = useState<'modern' | 'klasik'>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as 'modern' | 'klasik') || 'modern';
    } catch {
      return 'modern';
    }
  });

  const switchView = (v: 'modern' | 'klasik') => {
    setView(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* abaikan */
    }
  };

  const toggleBtn = (v: 'modern' | 'klasik', label: string, Icon: React.ComponentType<{ size?: number }>) => {
    const active = view === v;
    return (
      <button
        key={v}
        type="button"
        onClick={() => switchView(v)}
        aria-pressed={active}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 14px',
          borderRadius: '99px',
          border: 'none',
          fontSize: '12.5px',
          fontWeight: 700,
          cursor: 'pointer',
          background: active ? 'var(--ez-color-primary)' : 'transparent',
          color: active ? 'var(--ez-color-surface)' : 'var(--ez-color-text-muted)',
          transition: 'all 0.15s ease',
        }}
      >
        <Icon size={14} />
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          role="group"
          aria-label={t('dash.view_aria')}
          style={{
            display: 'inline-flex',
            padding: '4px',
            borderRadius: '99px',
            background: 'var(--ez-color-surface)',
            border: '1px solid var(--ez-color-border)',
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
          }}
        >
          {toggleBtn('modern', t('dash.view_modern'), Sparkles)}
          {toggleBtn('klasik', t('dash.view_classic'), LayoutGrid)}
        </div>
      </div>
      {view === 'modern' ? (
        <EzrabAiDashboardView {...props} />
      ) : (
        <EzrabAiDashboardViewClassic {...props} />
      )}
    </div>
  );
};

export default DashboardViewSwitcher;
