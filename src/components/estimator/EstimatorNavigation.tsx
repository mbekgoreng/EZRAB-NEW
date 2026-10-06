import React from 'react';
import {
  FileSpreadsheet,
  FileCheck,
  Calculator,
  LineChart,
  FileText,
  Settings,
} from 'lucide-react';

export type EstimatorTabType =
  | 'spreadsheet'
  | 'rekapitulasi'
  | 'analisa-harga'
  | 'kurva-s'
  | 'catatan'
  | 'pengaturan';

interface EstimatorNavigationProps {
  activeTab: EstimatorTabType;
  onTabChange: (tab: EstimatorTabType) => void;
}

export const EstimatorNavigation: React.FC<EstimatorNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const tabs = [
    { id: 'spreadsheet' as EstimatorTabType, label: 'Spreadsheet', icon: FileSpreadsheet },
    { id: 'rekapitulasi' as EstimatorTabType, label: 'Rekapitulasi', icon: FileCheck },
    { id: 'analisa-harga' as EstimatorTabType, label: 'Analisa Harga', icon: Calculator },
    { id: 'kurva-s' as EstimatorTabType, label: 'Kurva S', icon: LineChart },
    { id: 'catatan' as EstimatorTabType, label: 'Catatan', icon: FileText },
    { id: 'pengaturan' as EstimatorTabType, label: 'Pengaturan', icon: Settings },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        borderBottom: '1px solid #E2E8F0',
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
              color: isActive ? '#2563EB' : '#64748B',
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
              if (!isActive) e.currentTarget.style.color = '#64748B';
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
