import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Building2,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Crown,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { brandingClient, WorkspaceBranding, SubscriptionPlan } from '../../services/brandingClient';

interface CompanyBrandingModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  onBrandingUpdated?: (branding: WorkspaceBranding) => void;
}

export const CompanyBrandingModal: React.FC<CompanyBrandingModalProps> = ({
  isOpen,
  onClose,
  workspaceId = 'ws-default-ezrab',
  onBrandingUpdated,
}) => {
  const [branding, setBranding] = useState<WorkspaceBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [leadEstimatorName, setLeadEstimatorName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadBrandingData();
  }, [isOpen, workspaceId]);

  const loadBrandingData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await brandingClient.getBranding(workspaceId);
      setBranding(data);
      setCompanyName(data.companyName || '');
      setAddress(data.address || '');
      setPhone(data.phone || '');
      setEmail(data.email || '');
      setWebsite(data.website || '');
      setTaxNumber(data.taxNumber || '');
      setDirectorName(data.directorName || '');
      setLeadEstimatorName(data.leadEstimatorName || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memuat profil branding.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isPaid = branding ? branding.canUploadLogo : false;

  const handleSaveMetadata = async () => {
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await brandingClient.updateBranding(workspaceId, {
        companyName,
        address,
        phone,
        email,
        website,
        taxNumber,
        directorName,
        leadEstimatorName,
      });
      setBranding(updated);
      setSuccessMessage('Profil perusahaan berhasil disimpan!');
      onBrandingUpdated?.(updated);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan data branding.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be reselected
    e.target.value = '';

    setUploadingLogo(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await brandingClient.uploadLogo(workspaceId, file);
      setBranding(result.branding);
      setSuccessMessage('Logo perusahaan berhasil diperbarui dan aktif!');
      onBrandingUpdated?.(result.branding);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengunggah logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!window.confirm('Yakin ingin menghapus logo perusahaan? PDF akan kembali menggunakan logo default resmi EZRAB.')) {
      return;
    }

    setUploadingLogo(true);
    setErrorMessage(null);
    try {
      const updated = await brandingClient.deleteLogo(workspaceId);
      setBranding(updated);
      setSuccessMessage('Logo perusahaan berhasil dihapus.');
      onBrandingUpdated?.(updated);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleToggleTierTest = async (newPlan: SubscriptionPlan) => {
    try {
      const updated = await brandingClient.setTestTier(workspaceId, newPlan);
      setBranding(updated);
      onBrandingUpdated?.(updated);
      setSuccessMessage(`Berhasil beralih ke paket ${newPlan.toUpperCase()} untuk pengujian.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <Building2 size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Pengaturan Branding & Kop PDF
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                Atur logo perusahaan, profil kontraktor/konsultan, dan lisensi dokumen RAB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              padding: '6px',
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Notifications */}
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#166534',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Subscription Tier Banner */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '12px',
              background: isPaid ? '#F0FDF4' : '#FFFBEB',
              border: `1px solid ${isPaid ? '#BBF7D0' : '#FDE68A'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isPaid ? <Crown size={22} color="#16A34A" /> : <ShieldAlert size={22} color="#D97706" />}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                    Paket Langganan: {(branding?.subscriptionPlan || 'FREE').toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: isPaid ? '#DCFCE7' : '#FEF3C7',
                      color: isPaid ? '#15803D' : '#B45309',
                    }}
                  >
                    {isPaid ? 'BEBAS WATERMARK' : 'WATERMARK WAJIB'}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>
                  {isPaid
                    ? 'Anda memiliki hak penuh untuk mengunggah logo perusahaan kustom pada seluruh dokumen PDF.'
                    : 'Paket Free/Trial wajib menyertakan watermark resmi EZRAB dan tidak dapat mengunggah logo kustom.'}
                </p>
              </div>
            </div>

            {/* QA Test Tier Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleToggleTierTest(isPaid ? 'free' : 'pro')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Beralih status paket untuk simulasi pengujian"
              >
                <RefreshCw size={12} />
                <span>Simulasi {isPaid ? 'FREE' : 'PRO'}</span>
              </button>
            </div>
          </div>

          {/* Section 1: Logo Perusahaan */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Logo Perusahaan (Kop PDF & Cover)
                </h3>
                <p style={{ fontSize: '11.5px', color: '#64748B', margin: '2px 0 0 0' }}>
                  Format: PNG, JPG, atau WebP (Maksimal 2 MB). Aspek rasio dijaga otomatis.
                </p>
              </div>
              {branding?.logoUrl && isPaid && (
                <button
                  type="button"
                  onClick={handleDeleteLogo}
                  disabled={uploadingLogo}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #FCA5A5',
                    background: '#FEF2F2',
                    color: '#B91C1C',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Trash2 size={13} />
                  <span>Hapus Logo</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {/* Preview Box */}
              <div
                style={{
                  width: '140px',
                  height: '80px',
                  borderRadius: '10px',
                  border: '1px dashed #CBD5E1',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {branding?.logoUrl && isPaid ? (
                  <img
                    src={branding.logoUrl}
                    alt="Logo Perusahaan"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                    <Building2 size={28} style={{ margin: '0 auto 4px' }} />
                    <span style={{ fontSize: '10px', display: 'block' }}>
                      {isPaid ? 'Belum Ada Logo' : 'Logo EZRAB'}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  style={{ display: 'none' }}
                />

                {isPaid ? (
                  <div>
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '9px 18px',
                        borderRadius: '8px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
                      }}
                    >
                      <Upload size={14} />
                      <span>{uploadingLogo ? 'Mengunggah...' : branding?.logoUrl ? 'Ganti Logo' : 'Unggah Logo Perusahaan'}</span>
                    </button>
                    <p style={{ fontSize: '11px', color: '#64748B', margin: '6px 0 0 0' }}>
                      Logo akan muncul di Halaman Cover dan Kop Surat seluruh halaman PDF.
                    </p>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      disabled={true}
                      style={{
                        padding: '9px 18px',
                        borderRadius: '8px',
                        background: '#E2E8F0',
                        color: '#94A3B8',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'not-allowed',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Upload size={14} />
                      <span>Upload Logo (Terkunci)</span>
                    </button>
                    <p style={{ fontSize: '11px', color: '#D97706', fontWeight: 600, margin: '6px 0 0 0' }}>
                      Upload logo perusahaan tersedia untuk paket berbayar.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Informasi Perusahaan / Kontraktor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Identitas Kontraktor / Konsultan
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Nama Perusahaan / Studio
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="PT. Konstruksi Indonesia Maju"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Nomor NPWP
                </label>
                <input
                  type="text"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  placeholder="01.234.567.8-012.000"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Alamat Kantor Lengkap
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Jl. Sudirman No. 45, Gedung Menara Lt. 8, Jakarta Selatan"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+62 21 555-7890"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Email Resmi
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kontak@perusahaan.co.id"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Website Perusahaan
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://perusahaan.co.id"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                  }}
                />
              </div>
            </div>

            {/* Pejabat Penandatangan */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Nama Direktur Utama (Penandatangan)
                </label>
                <input
                  type="text"
                  value={directorName}
                  onChange={(e) => setDirectorName(e.target.value)}
                  placeholder="Ir. Hendra Kusuma, M.T."
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Nama Lead Estimator (Penyusun RAB)
                </label>
                <input
                  type="text"
                  value={leadEstimatorName}
                  onChange={(e) => setLeadEstimatorName(e.target.value)}
                  placeholder="Ahmad Yusuf, S.T."
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: '#F8FAFC',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveMetadata}
            style={{
              height: '38px',
              padding: '0 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
            }}
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>
    </div>
  );
};
