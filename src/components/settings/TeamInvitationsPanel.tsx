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

const FILTERS = [
  { id: 'ALL', label: 'Semua' },
  { id: 'AKTIF', label: 'Aktif' },
  { id: 'PENDING', label: 'Undangan Pending' },
  { id: 'KEDALUWARSA', label: 'Kedaluwarsa' },
  { id: 'DIBATALKAN', label: 'Dibatalkan' },
] as const;

const ROLE_OPTIONS = ['ESTIMATOR', 'DIREKSI', 'CLIENT', 'EDITOR'];

function statusChip(inv: InvitationAdminView) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    PENDING: { label: 'Pending', bg: 'var(--ez-color-warning-soft, #fef3c7)', fg: 'var(--ez-color-warning, #b45309)' },
    ACCEPTED: { label: 'Aktif — sudah diterima', bg: 'var(--ez-color-success-soft, #dcfce7)', fg: 'var(--ez-color-success, #15803d)' },
    EXPIRED: { label: 'Kedaluwarsa', bg: 'var(--ez-color-surface-tertiary, #e2e8f0)', fg: 'var(--ez-color-text-secondary, #47597a)' },
    REVOKED: { label: 'Dibatalkan', bg: 'var(--ez-color-danger-soft, #fee2e2)', fg: 'var(--ez-color-danger, #dc2626)' },
  };
  const s = map[inv.status] || map.PENDING;
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function emailChip(inv: InvitationAdminView) {
  if (inv.emailStatus === 'sent') {
    return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--ez-color-success, #15803d)', fontWeight: 600 }}><MailCheck size={14} /> Email terkirim</span>;
  }
  if (inv.emailStatus === 'failed') {
    return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--ez-color-danger, #dc2626)', fontWeight: 600 }}><MailX size={14} /> Email gagal</span>;
  }
  return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--ez-color-text-muted, #7c8aa5)', fontWeight: 600 }}><MailQuestion size={14} /> Email belum dikirim</span>;
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
      setError('Daftar undangan hanya dapat dilihat oleh Super Admin workspace yang sedang login. Pada mode demo/login nonaktif, daftar tidak ditampilkan.');
    } else {
      setError(r.message || 'Gagal memuat daftar undangan.');
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
          ? 'Undangan dibuat dan email terkirim. Link juga dapat disalin sekali dari daftar di bawah.'
          : 'Undangan dibuat. Email BELUM dikirim (provider email belum terkonfigurasi) — salin link undangan dari daftar di bawah dan sampaikan melalui kanal Anda sendiri.'
      );
      setName('');
      setEmail('');
      setRole('ESTIMATOR');
      void load(filter);
    } else {
      setFormError(r.messages?.join(' ') || r.message || 'Gagal membuat undangan.');
    }
  };

  const handleCopy = async (inv: InvitationAdminView) => {
    if (!freshLink || freshLink.invitationId !== inv.id) return;
    try {
      await navigator.clipboard.writeText(freshLink.link);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Gagal menyalin link. Salin manual dari kotak link undangan terakhir.');
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
    } else setError(r.message || 'Gagal membatalkan undangan.');
  };

  const handleResend = async (inv: InvitationAdminView) => {
    setBusyRow(inv.id);
    const r = await invitationClient.resend(inv.id);
    setBusyRow(null);
    if (r.ok) {
      setFreshLink({ invitationId: r.data.invitation.id, link: r.data.link });
      setFormOk('Undangan baru diterbitkan dengan token dan masa berlaku baru. Token lama sudah dicabut.');
      void load(filter);
    } else setError(r.message || 'Gagal mengirim ulang undangan.');
  };

  return (
    <div style={{ marginTop: 28, borderTop: '1px solid var(--ez-color-border, #dbe3ee)', paddingTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <MailPlus size={18} color="var(--ez-color-primary, #2563eb)" />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
          Undangan Aman (Secure Invitation)
        </h3>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ez-color-text-secondary, #47597a)', lineHeight: 1.55 }}>
        Undang anggota baru ke <strong>{workspaceName}</strong> melalui tautan rahasia sekali pakai (berlaku 24 jam).
        Penerima membuat kata sandinya sendiri. Role Super Admin tidak dapat diberikan melalui undangan.
      </p>

      {hasSession === false && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--ez-color-warning-soft, #fef3c7)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
          <TriangleAlert size={16} color="var(--ez-color-warning, #b45309)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
            <strong>Konteks demo:</strong> nama perusahaan &amp; workspace di panel ini berasal dari profil demo lokal,
            bukan dari membership akun yang login (tidak ada sesi Supabase nyata terdeteksi). Konteks demo ini
            <strong> tidak memberikan otorisasi apa pun</strong> — server hanya mengakui workspace dari membership
            Super Admin akun yang login, diverifikasi dari database, dan menolak aksi undangan tanpa sesi nyata.
          </span>
        </div>
      )}
      {hasSession === true && (
        <p style={{ margin: '0 0 16px', fontSize: 12, lineHeight: 1.55, color: 'var(--ez-color-text-muted, #7c8aa5)' }}>
          Sesi login nyata terdeteksi. Otorisasi tidak berasal dari halaman ini: untuk setiap aksi, server
          memverifikasi dari database bahwa akun Anda adalah Super Admin pada workspace target.
        </p>
      )}

      {notConfigured && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--ez-color-warning-soft, #fef3c7)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
          <TriangleAlert size={16} color="var(--ez-color-warning, #b45309)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ez-color-text-primary, #0f2a54)' }}>
            Backend undangan <strong>belum aktif</strong> di server (database autentikasi belum dikonfigurasi).
            Form dan daftar di bawah ini adalah UI finalnya; pembuatan undangan akan berfungsi setelah admin
            mengaktifkan Supabase + migration undangan. Tidak ada undangan yang dibuat atau dikirim dari halaman ini saat ini.
          </span>
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 8 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>NAMA ANGGOTA</label>
          <input style={fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap penerima" required />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>EMAIL</label>
          <input style={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.co.id" required />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>ROLE</label>
          <select style={fieldInput} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>PERUSAHAAN / WORKSPACE</label>
          <input style={{ ...fieldInput, opacity: 0.75 }} value={workspaceName} disabled readOnly />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5, color: 'var(--ez-color-text-secondary, #47597a)' }}>MASA BERLAKU</label>
          <input style={{ ...fieldInput, opacity: 0.75 }} value="24 jam" disabled readOnly />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" disabled={creating} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', borderRadius: 9,
            background: 'var(--ez-color-primary, #2563eb)', color: '#fff', fontSize: 13.5, fontWeight: 700,
            cursor: creating ? 'wait' : 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center',
          }}>
            {creating ? <Loader2 size={15} className="spin" /> : <MailPlus size={15} />} Buat Undangan
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
          }}>{f.label}</button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--ez-color-danger, #dc2626)', fontSize: 13 }}>{error}</p>}

      {loading ? (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'var(--ez-color-text-secondary, #47597a)' }}>
          <Loader2 size={15} className="spin" /> Memuat undangan…
        </p>
      ) : rows.length === 0 ? (
        <div style={{ border: '1.5px dashed var(--ez-color-border, #dbe3ee)', borderRadius: 12, padding: '22px 16px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ez-color-text-muted, #7c8aa5)' }}>
            {notConfigured ? 'Belum ada data — backend undangan belum aktif.' : 'Belum ada undangan pada filter ini.'}
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
                  Diundang {new Date(inv.createdAt).toLocaleString('id-ID')} · berlaku s/d {new Date(inv.expiresAt).toLocaleString('id-ID')}
                  {inv.acceptedAt ? ` · diterima ${new Date(inv.acceptedAt).toLocaleString('id-ID')}` : ''}
                </div>
                <div style={{ marginTop: 4 }}>{emailChip(inv)}</div>
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                {statusChip(inv)}
                {inv.status === 'PENDING' && freshLink?.invitationId === inv.id && (
                  <button style={{ ...smallBtn, background: 'var(--ez-color-primary, #2563eb)', color: '#fff', border: 'none' }} onClick={() => void handleCopy(inv)}>
                    {copiedId === inv.id ? <Check size={13} /> : <Copy size={13} />} {copiedId === inv.id ? 'Tersalin' : 'Salin Link Undangan'}
                  </button>
                )}
                {(inv.status === 'PENDING' || inv.status === 'EXPIRED') && (
                  <button style={smallBtn} disabled={busyRow === inv.id} onClick={() => void handleResend(inv)}>
                    <RefreshCw size={13} /> Kirim Ulang
                  </button>
                )}
                {inv.status === 'PENDING' && (confirmRevoke === inv.id ? (
                  <>
                    <button style={{ ...smallBtn, color: 'var(--ez-color-danger, #dc2626)', borderColor: 'var(--ez-color-danger, #dc2626)' }}
                      disabled={busyRow === inv.id} onClick={() => void handleRevoke(inv)}>
                      <Ban size={13} /> Ya, batalkan
                    </button>
                    <button style={smallBtn} onClick={() => setConfirmRevoke(null)}>Urung</button>
                  </>
                ) : (
                  <button style={smallBtn} onClick={() => setConfirmRevoke(inv.id)}>
                    <Ban size={13} /> Batalkan
                  </button>
                ))}
                {inv.status === 'ACCEPTED' && (
                  <span style={{ fontSize: 12, color: 'var(--ez-color-text-muted, #7c8aa5)' }}>Anggota aktif — kelola dari daftar anggota di atas</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: 'var(--ez-color-text-muted, #7c8aa5)', marginTop: 12, lineHeight: 1.55 }}>
        Demi keamanan, link undangan hanya dapat disalin sesaat setelah undangan dibuat/dikirim ulang dari sesi ini.
        Untuk membagikan ulang di lain waktu, gunakan Kirim Ulang — token lama otomatis dicabut dan token baru diterbitkan.
        Hash token tidak pernah ditampilkan.
      </p>
    </div>
  );
};

export default TeamInvitationsPanel;
