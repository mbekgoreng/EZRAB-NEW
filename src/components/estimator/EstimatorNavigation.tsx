import React from 'react';
import {
  Info,
  FileSpreadsheet,
  FileCheck,
  Calculator,
  LineChart,
  FileText,
  Settings,
} from 'lucide-react';

export type EstimatorTabType =
  | 'informasi-proyek'
  | 'spreadsheet'
  | 'rekapitulasi'
  | 'analisa-harga'
  | 'kurva-s'
  | 'pengaturan'
  | 'catatan';

interface EstimatorNavigationProps {
  activeTab: EstimatorTabType;
  onTabChange: (tab: EstimatorTabType) => void;
}

export const EstimatorNavigation: React.FC<EstimatorNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  /* Urutan baru (owner 2026-10-27): Informasi Proyek pertama, lalu
   * Spreadsheet, Rekapitulasi, Analisa Harga, Kurva S, Pengaturan.
   * Catatan TIDAK dihapus (isinya data user) — dipindah ke posisi
   * TERAKHIR karena tidak disebut dalam urutan baru user. */
  const tabs = [
    { id: 'informasi-proyek' as EstimatorTabType, label: 'Informasi Proyek', icon: Info },
    { id: 'spreadsheet' as EstimatorTabType, label: 'Spreadsheet', icon: FileSpreadsheet },
    { id: 'rekapitulasi' as EstimatorTabType, label: 'Rekapitulasi', icon: FileCheck },
    { id: 'analisa-harga' as EstimatorTabType, label: 'Analisa Harga', icon: Calculator },
    { id: 'kurva-s' as EstimatorTabType, label: 'Kurva S', icon: LineChart },
    { id: 'pengaturan' as EstimatorTabType, label: 'Pengaturan', icon: Settings },
    { id: 'catatan' as EstimatorTabType, label: 'Catatan', icon: FileText },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        borderBottom: '1px solid var(--ez-color-border-line)',
        marginBottom: '16px',
        paddingLeft: '4px',
        overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid #2563EB' : '2px solid transparent',
              padding: '10px 4px',
              fontSize: '13px',
              fontWeight: isActive ? 750 : 500,
              color: isActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              marginBottom: '-1px',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = '#0F172A';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--ez-color-text-muted)';
            }}
          >
            <Icon size={16} color={isActive ? '#2563EB' : '#94A3B8'} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
