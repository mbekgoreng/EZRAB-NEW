/**
 * AcceptInvitationPage — halaman publik /accept-invitation/<token> (Fase D).
 *
 * Alur:
 * 1. Token dari URL divalidasi ke server (POST /api/invitations/validate,
 *    token dikirim di BODY — bukan URL API — agar tidak bocor ke log).
 * 2. Ringkasan aman ditampilkan: perusahaan, role, nama, email termask,
 *    masa berlaku. Token mentah TIDAK pernah dirender.
 * 3. Penerima membuat kata sandi SENDIRI lewat Supabase Auth yang sudah ada
 *    (useAuth().signUp) — tidak ada penyimpanan password custom. Bila email
 *    sudah terdaftar: masuk dengan akun yang ada (signIn), lalu redeem.
 * 4. Redeem atomik di server dengan JWT akun yang emailnya harus sama
 *    dengan email undangan; role/workspace diambil dari data tersimpan.
 * 5. Bila Supabase/Auth belum aktif di deployment ini (keputusan pemilik:
 *    login OFF), halaman menyatakan itu secara jujur — undangan belum dapat
 *    ditebus, bukan disimulasikan berhasil.
 */
import React, { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Building2, UserRound, Clock3, TriangleAlert, Loader2, LogIn } from 'lucide-react';
import { invitationClient, type InvitationSummary } from '../../services/invitationClient';
import { useAuth } from '../../auth/AuthContext';
import { getSupabaseClient, isSupabaseAuthEnabled } from '../../lib/supabase';
import { paths } from '../../routing/routes';

type Phase =
  | { kind: 'validating' }
  | { kind: 'invalid'; message: string }
  | { kind: 'not-configured' }
  | { kind: 'summary'; summary: InvitationSummary }
  | { kind: 'confirm-email'; summary: InvitationSummary }
  | { kind: 'done'; workspaceName: string; role: string };

const card: React.CSSProperties = {
  width: '100%', maxWidth: 460, background: 'var(--ez-color-surface, #fff)',
  border: '1px solid var(--ez-color-border, #dbe3ee)', borderRadius: 16,
  padding: '28px 28px 24px', boxShadow: '0 12px 40px rgba(15, 42, 84, 0.10)',
};
const input: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 14,
  border: '1px solid var(--ez-color-border, #dbe3ee)', background: 'var(--ez-color-surface, #fff)',
  color: 'var(--ez-color-text-primary, #0f2a54)', fontFamily: 'inherit', boxSizing: 'border-box',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
  color: 'var(--ez-color-text-secondary, #47597a)', margin: '14px 0 6px', textTransform: 'uppercase',
};
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 20, padding: '12px 16px', border: 'none', borderRadius: 10,
  background: 'var(--ez-color-primary, #2563eb)', color: '#fff', fontSize: 14.5, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', gap: 8,
};

export const AcceptInvitationPage: React.FC<{ token: string }> = ({ token }) => {
  const auth = useAuth();
  const authEnabled = isSupabaseAuthEnabled();
  const [phase, setPhase] = useState<Phase>({ kind: 'validating' });
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pengerasan privasi (audit fast-track 2026-10-22): token undangan ada
  // di URL halaman ini. Pasang <meta name="referrer" content="no-referrer">
  // selama halaman tampil agar URL — dan token di dalamnya — tidak pernah
  // terkirim sebagai header Referer ke tujuan mana pun. index.html tidak
  // memasang meta referrer global, jadi elemen dibuat saat mount dan
  // kondisi semula dipulihkan saat unmount (khusus halaman ini saja).
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta: HTMLMetaElement = existing ?? document.createElement('meta');
    if (!existing) {
      meta.setAttribute('name', 'referrer');
      document.head.appendChild(meta);
    }
    const previous = meta.getAttribute('content');
    meta.setAttribute('content', 'no-referrer');
    return () => {
      if (!existing) meta.remove();
      else if (previous === null) meta.removeAttribute('content');
      else meta.setAttribute('content', previous);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await invitationClient.validate(token);
      if (!alive) return;
      if (r.ok) setPhase({ kind: 'summary', summary: r.data.summary });
      else if (r.status === 503 || r.error === 'NOT_CONFIGURED') setPhase({ kind: 'not-configured' });
      else setPhase({ kind: 'invalid', message: r.message || 'Tautan undangan tidak valid atau sudah tidak berlaku.' });
    })();
    return () => { alive = false; };
  }, [token]);

  const redeemAndFinish = async (summary: InvitationSummary) => {
    const r = await invitationClient.redeem(token);
    if (r.ok) {
      setPhase({ kind: 'done', workspaceName: r.data.workspace.name || summary.company, role: r.data.role });
    } else {
      setError(r.message || 'Gagal menerima undangan. Coba lagi.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase.kind !== 'summary') return;
    setBusy(true);
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (mode === 'signup') {
        const res = await auth.signUp(cleanEmail, password, phase.summary.inviteeName || undefined);
        if (!res.ok) {
          if ((res.error || '').toLowerCase().includes('sudah terdaftar')) {
            setMode('signin');
            setError('Email ini sudah memiliki akun. Masuk dengan kata sandi yang ada untuk menerima undangan.');
          } else {
            setError(res.error || 'Gagal membuat akun.');
          }
          return;
        }
        // Bila provider mewajibkan konfirmasi email, sesi belum ada:
        // jangan buat akun setengah jadi — arahkan konfirmasi dulu, token
        // tetap sama dan undangan tetap Pending sampai redeem berhasil.
        const sb = getSupabaseClient();
        const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
        if (!data.session) {
          setPhase({ kind: 'confirm-email', summary: phase.summary });
          return;
        }
      } else {
        const res = await auth.signIn(cleanEmail, password);
        if (!res.ok) {
          setError(res.error || 'Gagal masuk.');
          return;
        }
      }
      await redeemAndFinish(phase.summary);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmedContinue = async () => {
    if (phase.kind !== 'confirm-email') return;
    setBusy(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
      if (!data.session) {
        setError('Sesi belum aktif. Selesaikan konfirmasi email, lalu masuk melalui halaman login dan kembali ke tautan ini.');
        return;
      }
      await redeemAndFinish(phase.summary);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--ez-color-background, #eef3fa)', padding: '32px 16px', fontFamily: 'inherit',
    }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <ShieldCheck size={22} color="var(--ez-color-primary, #2563eb)" />
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
            Undangan Workspace EZRAB
          </div>
        </div>

        {phase.kind === 'validating' && (
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ez-color-text-secondary, #47597a)', fontSize: 14 }}>
            <Loader2 size={16} className="spin" /> Memeriksa tautan undangan…
          </p>
        )}

        {phase.kind === 'invalid' && (
          <div>
            <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--ez-color-danger, #dc2626)', fontSize: 14, lineHeight: 1.55 }}>
              <TriangleAlert size={17} style={{ flexShrink: 0, marginTop: 2 }} /> {phase.message}
            </p>
            <p style={{ fontSize: 13, color: 'var(--ez-color-text-muted, #7c8aa5)', lineHeight: 1.55 }}>
              Hubungi administrator workspace Anda untuk meminta undangan baru.
            </p>
          </div>
        )}

        {phase.kind === 'not-configured' && (
          <div>
            <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--ez-color-warning, #b45309)', fontSize: 14, lineHeight: 1.55 }}>
              <TriangleAlert size={17} style={{ flexShrink: 0, marginTop: 2 }} />
              Sistem undangan belum aktif pada deployment ini.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ez-color-text-muted, #7c8aa5)', lineHeight: 1.55 }}>
              Administrator belum mengaktifkan autentikasi dan database undangan di server,
              sehingga undangan belum dapat diterima. Tidak ada akun yang dibuat dan tidak ada
              data yang berubah. Hubungi administrator workspace Anda.
            </p>
          </div>
        )}

        {(phase.kind === 'summary' || phase.kind === 'confirm-email') && (
          <div>
            <div style={{
              background: 'var(--ez-color-primary-soft, #eaf1fe)', borderRadius: 12, padding: '14px 16px', margin: '12px 0 4px',
              display: 'grid', gap: 8, fontSize: 14, color: 'var(--ez-color-text-primary, #0f2a54)',
            }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Building2 size={15} /> Perusahaan: <strong>{phase.summary.company}</strong></span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><UserRound size={15} /> Role Anda: <strong>{phase.summary.role}</strong></span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Mail size={15} /> Email undangan: <strong>{phase.summary.emailMasked}</strong></span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Clock3 size={15} /> Berlaku sampai: <strong>{new Date(phase.summary.expiresAt).toLocaleString('id-ID')}</strong></span>
            </div>

            {phase.kind === 'confirm-email' ? (
              <div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ez-color-text-secondary, #47597a)' }}>
                  Akun dibuat. Provider autentikasi mewajibkan konfirmasi email — buka kotak masuk
                  <strong> {email}</strong>, klik tautan konfirmasi, lalu kembali ke halaman ini dan lanjutkan.
                  Undangan Anda tetap tersimpan dan belum digunakan.
                </p>
                {error && <p style={{ color: 'var(--ez-color-danger, #dc2626)', fontSize: 13.5 }}>{error}</p>}
                <button style={primaryBtn} disabled={busy} onClick={handleConfirmedContinue}>
                  {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />} Saya sudah konfirmasi — selesaikan penerimaan
                </button>
              </div>
            ) : !authEnabled ? (
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ez-color-warning, #b45309)', marginTop: 14 }}>
                Undangan ini valid, tetapi login belum diaktifkan pada deployment ini oleh pemilik,
                sehingga pembuatan kata sandi dan penerimaan undangan belum dapat diselesaikan.
                Hubungi administrator workspace Anda.
              </p>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button type="button" onClick={() => setMode('signup')}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid var(--ez-color-border, #dbe3ee)',
                      background: mode === 'signup' ? 'var(--ez-color-primary, #2563eb)' : 'transparent',
                      color: mode === 'signup' ? '#fff' : 'var(--ez-color-text-secondary, #47597a)' }}>
                    Akun baru
                  </button>
                  <button type="button" onClick={() => setMode('signin')}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid var(--ez-color-border, #dbe3ee)',
                      background: mode === 'signin' ? 'var(--ez-color-primary, #2563eb)' : 'transparent',
                      color: mode === 'signin' ? '#fff' : 'var(--ez-color-text-secondary, #47597a)' }}>
                    Sudah punya akun
                  </button>
                </div>
                <label style={label} htmlFor="inv-email">Email (harus sama dengan email undangan)</label>
                <input id="inv-email" style={input} type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nama@perusahaan.co.id" />
                <label style={label} htmlFor="inv-pass">{mode === 'signup' ? 'Buat kata sandi Anda' : 'Kata sandi akun Anda'}</label>
                <input id="inv-pass" style={input} type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'signup' ? 'Minimal 6 karakter' : 'Kata sandi Anda'} />
                {error && <p style={{ color: 'var(--ez-color-danger, #dc2626)', fontSize: 13.5, marginTop: 12 }}>{error}</p>}
                <button style={primaryBtn} disabled={busy} type="submit">
                  {busy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                  {mode === 'signup' ? 'Buat akun & terima undangan' : 'Masuk & terima undangan'}
                </button>
                <p style={{ fontSize: 12, color: 'var(--ez-color-text-muted, #7c8aa5)', lineHeight: 1.55, marginTop: 12 }}>
                  Kata sandi Anda dibuat dan disimpan oleh penyedia autentikasi EZRAB (Supabase Auth) —
                  bukan oleh halaman ini. Role dan workspace mengikuti undangan dan tidak dapat diubah dari halaman ini.
                </p>
              </form>
            )}
          </div>
        )}

        {phase.kind === 'done' && (
          <div>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
              Selamat datang! Anda sekarang anggota <strong>{phase.workspaceName}</strong> dengan role{' '}
              <strong>{phase.role}</strong>.
            </p>
            <button style={primaryBtn} onClick={() => { window.location.assign(paths.dashboard()); }}>
              <LogIn size={16} /> Masuk ke Workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvitationPage;
