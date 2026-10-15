import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Fingerprint,
  HardHat,
  Loader2,
  Ruler,
  Calculator,
  Compass,
  Users2,
  ShieldCheck,
} from 'lucide-react';
import { ROLE_ACCOUNTS, type RoleId } from '../../auth/roleAccounts';
import { useRole } from '../../auth/RoleContext';
import { useI18n } from '../../i18n';

const ROLE_ICONS: Record<RoleId, React.ReactNode> = {
  qs: <Ruler size={20} />,
  estimator: <Calculator size={20} />,
  kontraktor: <HardHat size={20} />,
  konsultan: <Compass size={20} />,
  team: <Users2 size={20} />,
};

const ROLE_COLORS: Record<RoleId, string> = {
  qs: 'var(--ez-color-primary)',
  estimator: '#059669',
  kontraktor: '#D97706',
  konsultan: '#7C3AED',
  team: '#0D9488',
};

interface RoleLoginPanelProps {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

export const RoleLoginPanel: React.FC<RoleLoginPanelProps> = ({ onSuccess, onBackToLogin }) => {
  const { t } = useI18n();
  const { loginWithPin } = useRole();
  const [selectedRole, setSelectedRole] = useState<RoleId | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const handleSelectRole = (roleId: RoleId) => {
    setSelectedRole(roleId);
    setPin('');
    setError(null);
    setSuccess(null);
    setTimeout(() => pinInputRef.current?.focus(), 60);
  };

  const handlePinChange = (value: string) => {
    // Hanya digit, maksimal 6.
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    if (pin.length !== 6) {
      setError(t('auth.pin_kosong'));
      return;
    }
    setLoading(true);
    setError(null);
    // Simulasi jeda verifikasi agar terasa seperti pemeriksaan nyata.
    setTimeout(() => {
      const result = loginWithPin(selectedRole, pin);
      setLoading(false);
      if (result.ok) {
        const account = ROLE_ACCOUNTS.find((r) => r.id === selectedRole);
        setSuccess(`${t('auth.berhasil_masuk_sebagai')} ${account?.name ?? selectedRole}.`);
        setTimeout(() => onSuccess(), 650);
      } else {
        setError(t('auth.pin_salah'));
        setPin('');
        pinInputRef.current?.focus();
      }
    }, 350);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title */}
      <div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10.5px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: 'var(--ez-hue-violet-text)',
            background: 'var(--ez-hue-violet-bg)',
            border: '1px solid var(--ez-hue-violet-border)',
            padding: '4px 10px',
            borderRadius: 'var(--ez-radius-pill)',
            marginBottom: '10px',
          }}
        >
          <ShieldCheck size={12} />
          {t('auth.mode_demo')}
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ez-color-text-primary)', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
          {t('auth.judul_role')}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: 0, lineHeight: 1.55 }}>
          {selectedRole ? `${t('auth.masukkan_pin_untuk')} ${ROLE_ACCOUNTS.find((r) => r.id === selectedRole)?.name}.` : t('auth.subjudul_role')}
        </p>
      </div>

      {/* Feedback */}
      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px',
            backgroundColor: 'var(--ez-hue-rose-bg)', border: '1px solid var(--ez-hue-rose-border)', borderRadius: '8px',
            color: 'var(--ez-hue-red-text)', fontSize: '12.5px', lineHeight: 1.4,
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px',
            backgroundColor: 'var(--ez-hue-green-bg)', border: '1px solid var(--ez-hue-green-border)', borderRadius: '8px',
            color: 'var(--ez-hue-green-text-deep)', fontSize: '12.5px', lineHeight: 1.4,
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{success}</span>
        </div>
      )}

      {!selectedRole ? (
        <>
          {/* Role selection grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ROLE_ACCOUNTS.map((role) => {
              const color = ROLE_COLORS[role.id];
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSelectRole(role.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left',
                    padding: '12px 14px', borderRadius: 'var(--ez-radius-control)',
                    border: '1px solid var(--ez-color-border-line)', background: 'var(--ez-color-surface)', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = color;
                    e.currentTarget.style.boxShadow = `0 4px 14px ${color}22`;
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--ez-color-border)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div
                    style={{
                      width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
                      background: `${color}14`, color, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {ROLE_ICONS[role.id]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{role.name}</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color }}>{role.title}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                      {role.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
            {t('auth.pilih_role_desc')}
          </p>
        </>
      ) : (
        <>
          {/* Selected role summary */}
          {(() => {
            const role = ROLE_ACCOUNTS.find((r) => r.id === selectedRole)!;
            const color = ROLE_COLORS[role.id];
            return (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', borderRadius: 'var(--ez-radius-control)',
                  background: `${color}0d`, border: `1px solid ${color}33`,
                }}
              >
                <div
                  style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: `${color}1a`, color, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {ROLE_ICONS[role.id]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{role.name}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>{role.title}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedRole(null); setPin(''); setError(null); }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--ez-color-text-muted)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600,
                  }}
                >
                  <ArrowLeft size={14} /> {t('auth.kembali')}
                </button>
              </div>
            );
          })()}

          {/* PIN form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '8px' }}>
                {t('auth.pin_placeholder')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={pinInputRef}
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  maxLength={6}
                  style={{
                    width: '100%', height: '52px', padding: '0 14px 0 44px',
                    borderRadius: '10px', border: '1px solid var(--ez-hue-slate-border)', background: 'var(--ez-color-surface)',
                    fontSize: '22px', fontWeight: 700, letterSpacing: '0.5em', textAlign: 'center',
                    color: 'var(--ez-color-text-primary)', outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#7C3AED';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--ez-color-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <Fingerprint
                  size={20}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}
                />
              </div>
              {/* PIN dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: i < pin.length ? '#7C3AED' : 'var(--ez-color-border-line)',
                      transition: 'background 0.15s',
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || pin.length !== 6}
              style={{
                width: '100%', height: '44px', marginTop: '4px',
                background: loading || pin.length !== 6 ? '#c4b5fd' : '#7C3AED',
                color: '#FFFFFF', border: 'none', borderRadius: '8px',
                fontSize: '14.5px', fontWeight: 650,
                cursor: loading || pin.length !== 6 ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s, transform 0.15s',
                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {loading && <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />}
              <span>{loading ? t('auth.memproses') : t('auth.masuk_sebagai')}</span>
            </button>
          </form>
        </>
      )}

      {/* Back link */}
      <div style={{ textAlign: 'center', fontSize: '12.5px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
        <button
          type="button"
          onClick={onBackToLogin}
          style={{ color: 'var(--ez-color-primary)', fontWeight: 650, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ← {t('auth.masuk')} / {t('auth.daftar')}
        </button>
      </div>
    </div>
  );
};

export default RoleLoginPanel;
