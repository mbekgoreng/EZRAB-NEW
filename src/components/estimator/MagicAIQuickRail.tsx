import React, { useState } from 'react';
import {
  Sparkles,
  MessageSquare,
  BarChart2,
  Zap,
  FilePlus,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface MagicAIQuickRailProps {
  onSelectAction: (actionKey: 'chat' | 'analisis' | 'optimasi' | 'generate' | 'lainnya') => void;
  isDockedOpen: boolean;
}

export const MagicAIQuickRail: React.FC<MagicAIQuickRailProps> = ({
  onSelectAction,
  isDockedOpen,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // If docked right is already open, hide or collapse rail
  if (isDockedOpen) return null;

  const items = [
    { key: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { key: 'analisis' as const, label: 'Analisis', icon: BarChart2 },
    { key: 'optimasi' as const, label: 'Optimasi', icon: Zap },
    { key: 'generate' as const, label: 'Generate', icon: FilePlus },
    { key: 'lainnya' as const, label: 'Lainnya', icon: MoreHorizontal },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 85,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: '#FFFFFF',
        borderRadius: '24px',
        border: '1px solid #E2E8F0',
        padding: collapsed ? '6px 4px' : '8px 6px',
        boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.12), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
        gap: '8px',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Top AI Badge */}
      <button
        onClick={() => onSelectAction('chat')}
        title="Buka EZRAB Magic AI"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
          border: '1px solid #6366F1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(49, 46, 129, 0.35)',
        }}
      >
        <Sparkles size={16} color="#FFFFFF" />
      </button>

      {/* Action Items */}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
          {items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onSelectAction(key)}
              title={label}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748B',
                gap: '2px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#EFF6FF';
                e.currentTarget.style.color = '#2563EB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#64748B';
              }}
            >
              <Icon size={16} />
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Collapse / Expand Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Perluas AI Quick Rail' : 'Sembunyikan'}
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: '1px solid #E2E8F0',
          background: '#F8FAFC',
          color: '#64748B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          marginTop: '2px',
        }}
      >
        {collapsed ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
      </button>
    </div>
  );
};
