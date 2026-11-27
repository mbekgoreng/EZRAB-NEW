/**
 * TeamInvitationsPanel — manajemen Secure Invitation di tab Tim & Anggota
 * (Fase E). Memperluas UI yang sudah ada TANPA mengubah daftar anggota demo
 * di atasnya: panel ini mengelola UNDANGAN melalui backend
 * /api/invitations/* (otoritatif), bukan localStorage.
 *
 * Kejujuran status:
 * - "Salin Link" hanya muncul untuk undangan yang BARU dibuat/dikirim ulang
 *   pada sesi ini (token mentah hanya tersedia sekali dari server dan hanya
 *   disimpan di state komponen — tidak di localStorage, tidak ditampilkan
 *   ulang dari daftar).
 * - Status email mengikuti jawaban server: 'not_sent' → "Email belum
 *   dikirim" (provider belum terkonfigurasi / mock), 'sent' hanya bila
 *   provider benar-benar mengonfirmasi, 'failed' → "Email gagal".
 * - Bila backend belum dikonfigurasi (503), panel menampilkan banner jujur
 *   dan daftar kosong — bukan data pura-pura.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  MailPlus, RefreshCw, Ban, Copy, Check, Loader2, TriangleAlert, MailCheck, MailX, MailQuestion,
} from 'lucide-react';
import { invitationClient, hasInvitationSession, type InvitationAdminView } from '../../services/invitationClient';
import { useI18n } from '../../i18n';

const FILTERS = [
  { id: 'ALL', key: 'common.semua' },
  { id: 'AKTIF', key: 'settings.und_filter_aktif' },
  { id: 'PENDING', key: 'settings.und_filter_pending' },
  { id: 'KEDALUWARSA', key: 'settings.und_filter_kedaluwarsa' },
  { id: 'DIBATALKAN', key: 'settings.und_filter_dibatalkan' },
] as const;

const ROLE_OPTIONS = ['ESTIMATOR', 'DIREKSI', 'CLIENT', 'EDITOR'];

function statusChip(inv: InvitationAdminView, t: (key: string) => string) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    PENDING: { label: t('settings.und_status_pending'), bg: 'var(--ez-color-warning-soft, #fef3c7)', fg: 'var(--ez-color-warning, #b45309)' },
    ACCEPTED: { label: t('settings.und_status_aktif'), bg: 'var(--ez-color-success-soft, #dcfce7)', fg: 'var(--ez-color-success, #15803d)' },
    EXPIRED: { label: t('settings.und_status_kedaluwarsa'), bg: 'var(--ez-color-surface-tertiary, #e2e8f0)', fg: 'var(--ez-color-text-secondary, #47597a)' },
    REVOKED: { label: t('settings.und_status_dibatalkan'), bg: 'var(--ez-color-danger-soft, #fee2e2)', fg: 'var(--ez-color-danger, #dc2626)' },
  };
  const s = map[inv.status] || map.PENDING;
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function emailChip(inv: InvitationAdminView, t: (key: string) => string) {
  if (inv.emailStatus === 'sent') {
    return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--ez-color-success, #15803d)', fontWeight: 600 }}><MailCheck size={14} /> {t('settings.und_email_terkirim')}</span>;
  }
  if (inv.emailStatus === 'failed') {
    return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--ez-color-danger, #dc2626)', fontWeight: 600 }}><MailX size={14} /> {t('settings.und_email_gagal')}</span>;
  }
  return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--ez-color-text-muted, #7c8aa5)', fontWeight: 600 }}><MailQuestion size={14} /> {t('settings.und_email_belum')}</span>;
}

const smallBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8,
  border: '1px solid var(--ez-color-border, #dbe3ee)', background: 'var(--ez-color-surface, #fff)',
  color: 'var(--ez-color-text-secondary, #47597a)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const fieldInput: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 9, fontSize: 13.5, width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--ez-color-border, #dbe3ee)', background: 'var(--ez-color-surface, #fff)',
  color: 'var(--ez-color-text-primary, #0f2a54)', fontFamily: 'inherit',
};

export const TeamInvitationsPanel: React.FC<{ workspaceId: string; workspaceName: string }> = ({ workspaceId, workspaceName }) => {
  const { t } = useI18n();
  // Konteks workspace panel ini berasal dari profil tampilan (demo lokal).
  // hasSession membedakan label yang jujur: sesi Supabase nyata vs demo.
  // Otorisasi TIDAK PERNAH berasal dari nilai workspaceId di sini — server
  // memverifikasi membership SUPER_ADMIN dari database untuk setiap aksi.
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [rows, setRows] = useState<InvitationAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ESTIMATOR');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<{ invitationId: string; link: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    const r = await invitationClient.list(workspaceId, f);
    if (r.ok) {
      setRows(r.data.invitations);
      setNotConfigured(false);
      setError(null);
    } else if (r.status === 503 || r.error === 'NOT_CONFIGURED') {
      setRows([]);
      setNotConfigured(true);
      setError(null);
    } else if (r.status === 401 || r.status === 403) {
      setRows([]);
      setNotConfigured(false);
      setError(t('settings.und_err_akses'));
    } else {
      setError(r.message || t('settings.und_err_muat'));
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { void load(filter); }, [load, filter]);

  useEffect(() => {
    let alive = true;
    void hasInvitationSession().then((v) => { if (alive) setHasSession(v); });
    return () => { alive = false; };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    setFormOk(null);
    const r = await invitationClient.create({
      name: name.trim(), email: email.trim(), role, workspaceId, expiryHours: 24,
    });
    setCreating(false);
    if (r.ok) {
      setFreshLink({ invitationId: r.data.invitation.id, link: r.data.link });
      setFormOk(
        r.data.email.status === 'sent'
          ? t('settings.und_ok_terkirim')
          : t('settings.und_ok_belum_kirim')
      );
      setName('');
      setEmail('');
      setRole('ESTIMATOR');
      void load(filter);
    } else {
      setFormError(r.messages?.join(' ') || r.message || t('settings.und_err_buat'));
    }
  };

  const handleCopy = async (inv: InvitationAdminView) => {
    if (!freshLink || freshLink.invitationId !== inv.id) return;
    try {
      await navigator.clipboard.writeText(freshLink.link);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError(t('settings.und_err_salin'));
    }
  };

  const handleRevoke = async (inv: InvitationAdminView) => {
    setBusyRow(inv.id);
    const r = await invitationClient.revoke(inv.id);
    setBusyRow(null);
    setConfirmRevoke(null);
    if (r.ok) {
      if (freshLink?.invitationId === inv.id) setFreshLink(null);
      void load(filter);
    } else setError(r.message || t('settings.und_err_batal'));
  };

  const handleResend = async (inv: InvitationAdminView) => {
    setBusyRow(inv.id);
    const r = await invitationClient.resend(inv.id);
    setBusyRow(null);
    if (r.ok) {
      setFreshLink({ invitationId: r.data.invitation.id, link: r.data.link });
      setFormOk(t('settings.und_ok_kirim_ulang'));
      void load(filter);
    } else setError(r.message || t('settings.und_err_kirim_ulang'));
  };

  return (
    <div style={{ marginTop: 28, borderTop: '1px solid var(--ez-color-border, #dbe3ee)', paddingTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <MailPlus size={18} color="var(--ez-color-primary, #2563eb)" />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
          {t('settings.und_judul')}
        </h3>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ez-color-text-secondary, #47597a)', lineHeight: 1.55 }}>
        {t('settings.und_desc_a')}<strong>{workspaceName}</strong>{t('settings.und_desc_b')}
      </p>

      {hasSession === false && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--ez-color-warning-soft, #fef3c7)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
          <TriangleAlert size={16} color="var(--ez-color-warning, #b45309)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
            <strong>{t('settings.und_demo_label')}</strong> {t('settings.und_demo_a')}
            <strong>{t('settings.und_demo_strong')}</strong>{t('settings.und_demo_b')}
          </span>
        </div>
      )}
      {hasSession === true && (
        <p style={{ margin: '0 0 16px', fontSize: 12, lineHeight: 1.55, color: 'var(--ez-color-text-muted, #7c8aa5)' }}>
          {t('settings.und_sesi_nyata')}
        </p>
      )}

      {notConfigured && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--ez-color-warning-soft, #fef3c7)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
          <TriangleAlert size={16} color="var(--ez-color-warning, #b45309)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
            {t('settings.und_belum_aktif_a')}<strong>{t('settings.und_belum_aktif_strong')}</strong>{t('settings.und_belum_aktif_b')}
          </span>
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 8 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>{t('settings.und_label_nama')}</label>
          <input style={fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.und_ph_nama')} required />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>{t('settings.und_label_email')}</label>
          <input style={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('settings.und_ph_email')} required />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>{t('settings.und_label_role')}</label>
          <select style={fieldInput} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>{t('settings.und_label_perusahaan')}</label>
          <input style={{ ...fieldInput, opacity: 0.75 }} value={workspaceName} disabled readOnly />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>{t('settings.und_label_masa')}</label>
          <input style={{ ...fieldInput, opacity: 0.75 }} value={t('settings.und_masa_24')} disabled readOnly />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" disabled={creating} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', borderRadius: 9,
            background: 'var(--ez-color-primary, #2563eb)', color: '#fff', fontSize: 13.5, fontWeight: 700,
            cursor: creating ? 'wait' : 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center',
          }}>
            {creating ? <Loader2 size={15} className="spin" /> : <MailPlus size={15} />} {t('settings.und_buat')}
          </button>
        </div>
      </form>
      {formError && <p style={{ color: 'var(--ez-color-danger, #dc2626)', fontSize: 13, margin: '6px 0' }}>{formError}</p>}
      {formOk && <p style={{ color: 'var(--ez-color-success, #15803d)', fontSize: 13, margin: '6px 0' }}>{formOk}</p>}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '16px 0 12px' }}>
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid var(--ez-color-border, #dbe3ee)',
            background: filter === f.id ? 'var(--ez-color-primary, #2563eb)' : 'var(--ez-color-surface, #fff)',
            color: filter === f.id ? '#fff' : 'var(--ez-color-text-secondary, #47597a)',
          }}>{t(f.key)}</button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--ez-color-danger, #dc2626)', fontSize: 13 }}>{error}</p>}

      {loading ? (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'var(--ez-color-text-secondary, #47597a)' }}>
          <Loader2 size={15} className="spin" /> {t('settings.und_memuat')}
        </p>
      ) : rows.length === 0 ? (
        <div style={{ border: '1.5px dashed var(--ez-color-border, #dbe3ee)', borderRadius: 12, padding: '22px 16px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ez-color-text-muted, #7c8aa5)' }}>
            {notConfigured ? t('settings.und_kosong_belum_aktif') : t('settings.und_kosong_filter')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 9 }}>
          {rows.map((inv) => (
            <div key={inv.id} style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between',
              border: '1px solid var(--ez-color-border, #dbe3ee)', borderRadius: 12, padding: '12px 14px',
              background: 'var(--ez-color-surface, #fff)',
            }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
                  {inv.inviteeName || inv.email}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ez-color-text-secondary, #47597a)' }}>
                  {inv.email} · {inv.role}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted, #7c8aa5)', marginTop: 2 }}>
                  {t('settings.und_diundang_a')}{new Date(inv.createdAt).toLocaleString('id-ID')}{t('settings.und_berlaku_a')}{new Date(inv.expiresAt).toLocaleString('id-ID')}
                  {inv.acceptedAt ? `${t('settings.und_diterima_a')}${new Date(inv.acceptedAt).toLocaleString('id-ID')}` : ''}
                </div>
                <div style={{ marginTop: 4 }}>{emailChip(inv, t)}</div>
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                {statusChip(inv, t)}
                {inv.status === 'PENDING' && freshLink?.invitationId === inv.id && (
                  <button style={{ ...smallBtn, background: 'var(--ez-color-primary, #2563eb)', color: '#fff', border: 'none' }} onClick={() => void handleCopy(inv)}>
                    {copiedId === inv.id ? <Check size={13} /> : <Copy size={13} />} {copiedId === inv.id ? t('settings.und_tersalin') : t('settings.und_salin')}
                  </button>
                )}
                {(inv.status === 'PENDING' || inv.status === 'EXPIRED') && (
                  <button style={smallBtn} disabled={busyRow === inv.id} onClick={() => void handleResend(inv)}>
                    <RefreshCw size={13} /> {t('settings.und_kirim_ulang')}
                  </button>
                )}
                {inv.status === 'PENDING' && (confirmRevoke === inv.id ? (
                  <>
                    <button style={{ ...smallBtn, color: 'var(--ez-color-danger, #dc2626)', borderColor: 'var(--ez-color-danger, #dc2626)' }}
                      disabled={busyRow === inv.id} onClick={() => void handleRevoke(inv)}>
                      <Ban size={13} /> {t('settings.und_ya_batal')}
                    </button>
                    <button style={smallBtn} onClick={() => setConfirmRevoke(null)}>{t('settings.und_urung')}</button>
                  </>
                ) : (
                  <button style={smallBtn} onClick={() => setConfirmRevoke(inv.id)}>
                    <Ban size={13} /> {t('settings.und_batalkan')}
                  </button>
                ))}
                {inv.status === 'ACCEPTED' && (
                  <span style={{ fontSize: 12, color: 'var(--ez-color-text-muted, #7c8aa5)' }}>{t('settings.und_anggota_aktif')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: 'var(--ez-color-text-muted, #7c8aa5)', marginTop: 12, lineHeight: 1.55 }}>
        {t('settings.und_catatan')}
      </p>
    </div>
  );
};

export default TeamInvitationsPanel;
