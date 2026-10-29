import React, { useEffect, useState } from 'react';
import { Lock, KeyRound, ShieldAlert } from 'lucide-react';
import {
  checkAccessSession,
  submitAccessCode,
  sanitizeNextPath,
} from './passcode';

/**
 * Gerbang kode sementara untuk seluruh workspace (/app/*).
 * KUNCI SEMENTARA — perintah user 2026-10-20 ("kunci dulu pakai kode,
 * sementara jangan ada login"). Bukan pengganti login; lihat passcode.ts.
 *
 * Validasi SEPENUHNYA di server (POST /api/access/verify): komponen ini
 * tidak mengetahui kodenya. Status terbuka = cookie sesi HttpOnly
 * bertanda tangan yang diverifikasi server pada setiap request; tidak
 * ada flag client-side yang bisa dipalsukan.
 *
 * - enabled=false → render children langsung (mode 'real-login').
 * - standalone=true → mode halaman /access: sesudah kode diterima,
 *   pengguna diarahkan ke tujuan (?next=..., hanya path /app).
 */
type GatePhase = 'checking' | 'locked' | 'unlocked' | 'unconfigured';

export const PasscodeGate: React.FC<{
  enabled: boolean;
  standalone?: boolean;
  children?: React.ReactNode;
}> = ({ enabled, standalone = false, children }) => {
  const [phase, setPhase] = useState<GatePhase>(enabled ? 'checking' : 'unlocked');
  const [configNote, setConfigNote] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goNext = () => {
    const next = sanitizeNextPath(
      new URLSearchParams(window.location.search).get('next')
    );
    window.location.assign(next);
  };

  useEffect(() => {
    if (!enabled) {
      setPhase('unlocked');
      return;
    }
    let cancelled = false;
    checkAccessSession().then((state) => {
      if (cancelled) return;
      if (state.active) {
        if (standalone) goNext();
        else setPhase('unlocked');
      } else if (!state.reachable) {
        setConfigNote(
          'Server akses tidak terjangkau, sehingga status gerbang tidak dapat diperiksa. Coba muat ulang halaman.'
        );
        setPhase('unconfigured');
      } else if (!state.configured) {
        setConfigNote(
          'Gerbang akses belum dikonfigurasi di server. Hubungi admin untuk menyelesaikan penyiapan.'
        );
        setPhase('unconfigured');
      } else {
        setPhase('locked');
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled || phase === 'unlocked') return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const result = await submitAccessCode(code);
    setSubmitting(false);
    if (result.ok) {
      setError('');
      if (standalone) goNext();
      else setPhase('unlocked');
    } else if (result.kind === 'not-configured') {
      setConfigNote(result.message);
      setPhase('unconfigured');
    } else {
      setError(result.message);
      setCode('');
    }
  };

  const busy = phase === 'checking';
  const formDisabled = busy || phase === 'unconfigured' || submitting;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background:
          'var(--ezrab-bg, var(--ez-hue-slate-bg, #f2f7ff))',
        color: 'var(--ezrab-text, #0f172a)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--ezrab-surface, #ffffff)',
          border: '1px solid var(--ezrab-border, #e2e8f0)',
          borderRadius: 'var(--ezrab-radius-lg, 18px)',
          boxShadow: 'var(--ezrab-shadow-lg, 0 20px 50px rgba(15,23,42,.12))',
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'var(--ezrab-blue-soft, #dbeafe)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ezrab-blue, #2563eb)',
          }}
        >
          <Lock size={24} />
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          Dashboard Terkunci
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            textAlign: 'center',
            color: 'var(--ezrab-text-muted, #64748b)',
            lineHeight: 1.6,
          }}
        >
          {phase === 'unconfigured'
            ? configNote
            : busy
              ? 'Memeriksa sesi akses Anda…'
              : 'Masukkan kode akses untuk membuka workspace EZRAB.'}
        </p>

        {phase !== 'unconfigured' && (
          <>
            <label
              htmlFor="ezrab-passcode"
              style={{
                alignSelf: 'stretch',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--ezrab-text-muted, #64748b)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <KeyRound size={14} /> Kode akses
            </label>
            <input
              id="ezrab-passcode"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={16}
              disabled={formDisabled}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 16));
                if (error) setError('');
              }}
              placeholder="••••"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '20px',
                letterSpacing: '10px',
                textAlign: 'center',
                borderRadius: '12px',
                border: `1.5px solid ${
                  error
                    ? 'var(--ezrab-danger, #dc2626)'
                    : 'var(--ezrab-border, #e2e8f0)'
                }`,
                background: 'var(--ezrab-bg, #f8fafc)',
                color: 'var(--ezrab-text, #0f172a)',
                outline: 'none',
              }}
            />

            {error && (
              <div
                role="alert"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ezrab-danger, #dc2626)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={formDisabled}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--ezrab-blue, #2563eb)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 800,
                cursor: formDisabled ? 'default' : 'pointer',
                opacity: formDisabled ? 0.65 : 1,
              }}
            >
              {submitting ? 'Memeriksa…' : 'Buka Dashboard'}
            </button>
          </>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: 'var(--ezrab-text-muted, #64748b)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          <ShieldAlert size={12} />
          <span>Kunci sementara — sesi berlaku 12 jam, lalu kode diperlukan lagi.</span>
        </div>
      </form>
    </div>
  );
};
