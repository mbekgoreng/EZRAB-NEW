import React, { memo } from 'react';
import {
  BarChart3,
  Calculator,
  Database,
  FileCheck,
  FileText,
  FolderKanban,
  Layers,
  LayoutDashboard,
  Sparkles,
  Table2,
  Wallet,
} from 'lucide-react';

export interface MockMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  ai?: boolean;
}

export interface MockMenuSection {
  title: string;
  items: MockMenuItem[];
}

/**
 * Lightweight visual reproduction of the EZRAB workspace chrome
 * (light theme #F8FAFC, accent #2563EB) for the cinematic demo stage.
 * Menu labels mirror the real sidebar (src/components/layout/Sidebar.tsx).
 */
export const MOCK_MENU: MockMenuSection[] = [
  {
    title: '',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> }],
  },
  {
    title: 'Proyek & Estimasi',
    items: [
      { id: 'proyek', label: 'Proyek', icon: <FolderKanban size={15} /> },
      { id: 'kalkulator-volume', label: 'Kalkulator Volume', icon: <Calculator size={15} /> },
      { id: 'rab-estimasi', label: 'RAB & Estimasi', icon: <Table2 size={15} /> },
      { id: 'ezrab-chat-ai', label: 'Ezrab Chat AI', icon: <Sparkles size={15} />, ai: true },
      { id: 'ded-estimate-ai', label: 'Ded Estimate AI', icon: <FileCheck size={15} />, ai: true },
      { id: 'ai-document', label: 'AI Document', icon: <FileText size={15} />, ai: true },
    ],
  },
  {
    title: 'Data & Keuangan',
    items: [
      { id: 'template-rab', label: 'Template RAB', icon: <Layers size={15} /> },
      { id: 'keuangan-proyek', label: 'Keuangan Proyek', icon: <Wallet size={15} /> },
    ],
  },
  {
    title: '',
    items: [
      { id: 'ahsp', label: 'AHSP 2026', icon: <Database size={15} /> },
      { id: 'laporan', label: 'Laporan', icon: <BarChart3 size={15} /> },
    ],
  },
];

interface DashboardMockProps {
  activeMenuId: string;
  children: React.ReactNode;
}

/** Renders the sidebar + topbar chrome; scene content goes in `children`. */
export const DashboardMock: React.FC<DashboardMockProps> = memo(({ activeMenuId, children }) => (
  <div className="ch-dash">
    {/* Sidebar (hidden below 640px via CSS; topbar remains) */}
    <aside className="ch-dash-sidebar" aria-hidden="true">
      <div className="ch-dash-logo">
        <span className="ch-dash-logo-mark">E</span>
        <span className="ch-dash-logo-text">EZRAB</span>
      </div>
      <nav className="ch-dash-nav">
        {MOCK_MENU.map((section, si) => (
          <div key={si} className="ch-dash-navgroup">
            {section.title !== '' && <p className="ch-dash-navtitle">{section.title}</p>}
            {section.items.map((item) => (
              <div
                key={item.id}
                className={`ch-dash-navitem${item.id === activeMenuId ? ' is-active' : ''}`}
              >
                <span className="ch-dash-navicon">{item.icon}</span>
                <span className="ch-dash-navlabel">{item.label}</span>
                {item.ai && <span className="ch-dash-aibadge">AI</span>}
              </div>
            ))}
          </div>
        ))}
      </nav>
    </aside>

    {/* Main column */}
    <div className="ch-dash-main">
      <header className="ch-dash-topbar">
        <span className="ch-dash-logo-mark ch-dash-logo-mark--sm">E</span>
        <span className="ch-dash-topbar-title">EZRAB</span>
        <div className="ch-dash-search" aria-hidden="true">
          Cari proyek, fitur, dokumen…
        </div>
        <span className="ch-dash-avatar" aria-hidden="true">
          D
        </span>
      </header>
      <div className="ch-dash-content">{children}</div>
    </div>
  </div>
));

DashboardMock.displayName = 'DashboardMock';
