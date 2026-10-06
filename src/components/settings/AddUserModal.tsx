import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Shield,
  Briefcase,
  Eye,
  CheckCircle2,
  AlertCircle,
  Building2,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { ClientUserManagementService, WorkspaceMember } from '../../services/userManagementService';
import { UserRole } from '../../types';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded: (user: WorkspaceMember) => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState<'ESTIMATOR' | 'DIREKSI' | 'CLIENT'>('ESTIMATOR');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const roleDescriptions: Record<'ESTIMATOR' | 'DIREKSI' | 'CLIENT', { title: string; description: string; icon: any; bg: string; color: string; border: string }> = {
    ESTIMATOR: {
      title: 'Estimator',
      description: 'Membantu penyusunan RAB, QTO, perhitungan volume, dan analisa harga satuan AHSP proyek.',
      icon: Briefcase,
      bg: '#F0FDF4',
      color: '#15803D',
      border: '#BBF7D0',
    },
    DIREKSI: {
      title: 'Direksi',
      description: 'Melihat proyek, laporan eksekutif, memantau kemajuan Kurva S, dan memberikan persetujuan sesuai hak akses.',
      icon: Shield,
      bg: '#FAF5FF',
      color: '#7E22CE',
      border: '#E9D5FF',
    },
    CLIENT: {
      title: 'Client',
      description: 'Melihat informasi proyek, ringkasan penawaran RAB, dan dokumen yang dibagikan khusus untuk pemilik proyek.',
      icon: Eye,
      bg: '#FFFBEB',
      color: '#B45309',
      border: '#FDE68A',
    },
  };

  const selectedRoleMeta = roleDescriptions[role];
  const RoleIcon = selectedRoleMeta.icon;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg('Nama lengkap wajib diisi.');
      return;
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Format email tidak valid.');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const result = ClientUserManagementService.addUser({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        role,
      });

      setLoading(false);

      if (result.success && result.user) {
        setSuccessMsg('Pengguna berhasil dibuat.');
        onUserAdded(result.user);
        setTimeout(() => {
          onClose();
          setName('');
          setEmail('');
          setPhone('');
          setCompany('');
          setRole('ESTIMATOR');
          setSuccessMsg(null);
        }, 1200);
      } else {
        setErrorMsg(result.error || 'Gagal menambahkan pengguna.');
      }
    }, 400);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 20px 48px rgba(15, 23, 42, 0.16)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAFAFA',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserPlus size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
                Tambah Pengguna
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                Undang anggota tim baru untuk mengakses workspace Anda
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Tutup"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {errorMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} color="#DC2626" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#166534',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={16} color="#16A34A" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form Fields */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Nama Lengkap <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <User size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="text"
                placeholder="Contoh: Budi Santoso, ST."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{
                  width: '100%',
                  height: '38px',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  color: '#0F172A',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Alamat Email <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="email"
                placeholder="budi.santoso@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  height: '38px',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  color: '#0F172A',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Nomor WhatsApp
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="+62 812-xxxx-xxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    paddingLeft: '36px',
                    paddingRight: '12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    color: '#0F172A',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Perusahaan / Instansi
              </label>
              <div style={{ position: 'relative' }}>
                <Building2 size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="Nama Perusahaan"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    paddingLeft: '36px',
                    paddingRight: '12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    color: '#0F172A',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Role / Hak Akses <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['ESTIMATOR', 'DIREKSI', 'CLIENT'] as const).map((r) => {
                const isSel = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    style={{
                      height: '38px',
                      borderRadius: '8px',
                      border: isSel ? '2px solid #2563EB' : '1px solid #CBD5E1',
                      background: isSel ? '#EFF6FF' : '#FFFFFF',
                      color: isSel ? '#1D4ED8' : '#475569',
                      fontSize: '12.5px',
                      fontWeight: isSel ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textTransform: 'capitalize',
                    }}
                  >
                    {r === 'ESTIMATOR' ? 'Estimator' : r === 'DIREKSI' ? 'Direksi' : 'Client'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role Card Preview */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: selectedRoleMeta.bg,
              border: `1px solid ${selectedRoleMeta.border}`,
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}
          >
            <RoleIcon size={18} color={selectedRoleMeta.color} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 750, color: selectedRoleMeta.color }}>
                Role: {selectedRoleMeta.title}
              </div>
              <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px', lineHeight: 1.4 }}>
                {selectedRoleMeta.description}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '12px',
              paddingTop: '16px',
              borderTop: '1px solid #F1F5F9',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                height: '38px',
                padding: '0 16px',
                borderRadius: '8px',
                background: '#F1F5F9',
                color: '#475569',
                border: '1px solid #CBD5E1',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                height: '38px',
                padding: '0 20px',
                borderRadius: '8px',
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
              }}
            >
              {loading ? 'Menyimpan...' : 'Tambahkan Pengguna'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
