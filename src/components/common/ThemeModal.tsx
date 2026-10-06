import React from 'react';
import { X, Check, Sun, Moon, Laptop, Sparkles, LayoutGrid, Zap } from 'lucide-react';
import { useTheme, AccentColor, ThemeMode, InterfaceDensity, MotionMode } from '../../context/ThemeContext';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
  const { theme, setTheme, accent, setAccent, density, setDensity, motion, setMotion } = useTheme();

  if (!isOpen) return null;

  const accents: { id: AccentColor; name: string; color: string }[] = [
    { id: 'blue', name: 'EZRAB Blue', color: '#2563eb' },
    { id: 'emerald', name: 'Emerald', color: '#059669' },
    { id: 'violet', name: 'Violet', color: '#7c3aed' },
    { id: 'amber', name: 'Amber Gold', color: '#d97706' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(8px)',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--ezrab-surface)',
          borderRadius: 'var(--ezrab-radius-lg)',
          border: '1px solid var(--ezrab-border)',
          boxShadow: 'var(--ezrab-shadow-lg)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ezrab-text)' }}>Kustomisasi Tampilan & Tema</h3>
            <p style={{ fontSize: '13px', color: 'var(--ezrab-text-secondary)', marginTop: '2px' }}>
              Personalisasi antarmuka workspace EZRAB sesuai kenyamanan Anda.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ezrab-text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. Theme Mode */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ezrab-text-muted)', display: 'block', marginBottom: '10px' }}>
            Mode Tampilan
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Laptop },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTheme(id as ThemeMode)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: '10px',
                  border: `1.5px solid ${theme === id ? 'var(--ezrab-blue)' : 'var(--ezrab-border)'}`,
                  background: theme === id ? 'var(--ezrab-blue-soft)' : 'var(--ezrab-surface-soft)',
                  color: theme === id ? 'var(--ezrab-blue)' : 'var(--ezrab-text)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Accent Color */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ezrab-text-muted)', display: 'block', marginBottom: '10px' }}>
            Warna Aksen SaaS
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {accents.map(({ id, name, color }) => (
              <button
                key={id}
                onClick={() => setAccent(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: `1.5px solid ${accent === id ? color : 'var(--ezrab-border)'}`,
                  background: accent === id ? 'var(--ezrab-surface-soft)' : 'transparent',
                  color: 'var(--ezrab-text)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: color }} />
                <span>{name}</span>
                {accent === id && <Check size={14} style={{ marginLeft: 'auto', color }} />}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Interface Density */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ezrab-text-muted)', display: 'block', marginBottom: '10px' }}>
            Kepadatan Antarmuka
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {(['compact', 'comfortable', 'spacious'] as InterfaceDensity[]).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                style={{
                  padding: '9px',
                  borderRadius: '8px',
                  border: `1px solid ${density === d ? 'var(--ezrab-blue)' : 'var(--ezrab-border)'}`,
                  background: density === d ? 'var(--ezrab-blue-soft)' : 'transparent',
                  color: density === d ? 'var(--ezrab-blue)' : 'var(--ezrab-text-secondary)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Motion Mode */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ezrab-text-muted)', display: 'block', marginBottom: '10px' }}>
            Sistem Animasi
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {(['full', 'reduced', 'off'] as MotionMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMotion(m)}
                style={{
                  padding: '9px',
                  borderRadius: '8px',
                  border: `1px solid ${motion === m ? 'var(--ezrab-blue)' : 'var(--ezrab-border)'}`,
                  background: motion === m ? 'var(--ezrab-blue-soft)' : 'transparent',
                  color: motion === m ? 'var(--ezrab-blue)' : 'var(--ezrab-text-secondary)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {m === 'full' ? 'Full Dynamic' : m === 'reduced' ? 'Reduced' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        <button onClick={onClose} className="ezrab-button-primary" style={{ marginTop: '6px' }}>
          Simpan Preferensi
        </button>
      </div>
    </div>
  );
};
