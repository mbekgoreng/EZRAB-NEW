import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface MagicAILauncherProps {
  onClick: () => void;
  isOpen: boolean;
}

export const MagicAILauncher: React.FC<MagicAILauncherProps> = ({ onClick, isOpen }) => {
  // Listen for Cmd+J or Ctrl+J keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        onClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  if (isOpen) return null;

  return (
    <button
      onClick={onClick}
      title="Tanya Magic AI Copilot (⌘ + J)"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '68px',
        height: '44px',
        padding: '0 16px 0 6px',
        borderRadius: '999px',
        background: '#FFFFFF',
        border: '1px solid #DBEAFE',
        boxShadow: '0 10px 25px -3px rgba(37, 99, 235, 0.25), 0 4px 6px -2px rgba(37, 99, 235, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
        zIndex: 90,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 14px 28px -3px rgba(37, 99, 235, 0.35)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 10px 25px -3px rgba(37, 99, 235, 0.25)';
      }}
    >
      {/* Icon Badge */}
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 50%, #7C3AED 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
        }}
      >
        <Sparkles size={16} color="#FFFFFF" />
      </div>

      {/* Label */}
      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
        Tanya Magic AI...
      </span>

      {/* Keyboard Shortcut badge */}
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#64748B',
          background: '#F1F5F9',
          padding: '2px 7px',
          borderRadius: '6px',
          border: '1px solid #E2E8F0',
        }}
      >
        ⌘ J
      </span>
    </button>
  );
};
