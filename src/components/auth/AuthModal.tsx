import React, { useState } from 'react';
import { X, Eye, EyeOff, Calculator, Database, FolderKanban, Globe, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Logo } from '../common/Logo';
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
  signInWithGoogleOAuth,
  isSupabaseConfigured,
} from '../../services/supabaseClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin: () => void;
  initialTab?: 'masuk' | 'daftar';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
  initialTab = 'masuk',
}) => {
  const [activeTab, setActiveTab] = useState<'masuk' | 'daftar'>(initialTab);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isSupabaseConfigured()) {
      setErrorMessage('Layanan autentikasi Supabase belum terhubung atau konfigurasi belum lengkap.');
      return;
    }

    if (activeTab === 'daftar' && password !== confirmPassword) {
      setErrorMessage('Konfirmasi password tidak cocok dengan password.');
      return;
    }

    setLoading(true);
    try {
      if (activeTab === 'masuk') {
        const { session, error } = await signInWithEmailPassword(identifier.trim(), password);
        if (error) {
          setErrorMessage(error.message || 'Gagal masuk. Periksa kembali email dan password Anda.');
        } else if (session) {
          onSuccessLogin();
          onClose();
        } else {
          setErrorMessage('Gagal memverifikasi sesi autentikasi.');
        }
      } else {
        const { user, session, error } = await signUpWithEmailPassword(identifier.trim(), password, name.trim());
        if (error) {
          setErrorMessage(error.message || 'Gagal mendaftar. Silakan coba lagi.');
        } else if (user && !session) {
          setSuccessMessage('Pendaftaran berhasil! Silakan periksa kotak masuk email Anda untuk verifikasi.');
        } else if (session) {
          onSuccessLogin();
          onClose();
        } else {
          setSuccessMessage('Pendaftaran berhasil diproses.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem pada autentikasi.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    if (!isSupabaseConfigured()) {
      setErrorMessage('Layanan autentikasi Supabase belum terhubung.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInWithGoogleOAuth();
      if (error) {
        setErrorMessage(error.message || 'Gagal login via Google.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi gangguan saat memproses login Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      {/* Outer Modal Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '920px',
          background: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25)',
          display: 'grid',
          gridTemplateColumns: '1fr 1.08fr',
          overflow: 'hidden',
          minHeight: '560px',
        }}
        className="auth-modal-grid"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Tutup"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(241, 245, 249, 0.8)',
            border: 'none',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 30,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e2e8f0';
            e.currentTarget.style.color = '#0f172a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)';
            e.currentTarget.style.color = '#64748b';
          }}
        >
          <X size={18} />
        </button>

        {/* =========================================================================
            LEFT COLUMN: BRANDING, VALUE PROPOSITIONS & BLUEPRINT ILLUSTRATION
           ========================================================================= */}
        <div
          style={{
            position: 'relative',
            background: 'linear-gradient(165deg, #f8fafc 0%, #f0f7ff 60%, #e0f0fe 100%)',
            padding: '36px 36px 30px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
          className="auth-left-col"
        >
          {/* Subtle Grid Pattern */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(37, 99, 235, 0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px)
              `,
              backgroundSize: '24px 24px',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          {/* Upper Info Section */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            {/* Logo */}
            <div style={{ marginBottom: '24px' }}>
              <Logo height={34} showSubtitle={true} />
            </div>

            {/* Headline */}
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: 1.25,
                letterSpacing: '-0.03em',
                marginBottom: '10px',
              }}
            >
              Bangun Masa Depan
              <br />
              Dengan Estimasi yang Lebih Cerdas
            </h2>

            {/* Description */}
            <p
              style={{
                fontSize: '13px',
                color: '#64748b',
                lineHeight: 1.55,
                marginBottom: '24px',
                maxWidth: '340px',
              }}
            >
              Kelola proyek konstruksi Anda dengan mudah, cepat, dan akurat menggunakan teknologi AI.
            </p>

            {/* Feature List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    border: '1px solid #dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    flexShrink: 0,
                  }}
                >
                  <Calculator size={16} />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>
                  Perhitungan RAB & QTO
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    border: '1px solid #dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    flexShrink: 0,
                  }}
                >
                  <Database size={16} />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>
                  Database AHSP 2026
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    border: '1px solid #dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    flexShrink: 0,
                  }}
                >
                  <FolderKanban size={16} />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>
                  Manajemen Proyek Terpadu
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    border: '1px solid #dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={16} />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>
                  Akses Dimana Saja
                </span>
              </div>
            </div>
          </div>

          {/* Blueprint Isometric Illustration Art at Bottom Left */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '140px',
              marginTop: '16px',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            <svg
              viewBox="0 0 400 180"
              style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                bottom: '-10px',
                left: 0,
                opacity: 0.85,
              }}
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Foundation Isometric Planes */}
              <polygon points="200,30 360,110 200,170 40,110" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.2" strokeDasharray="4 3" />
              <polygon points="200,50 320,110 200,155 80,110" fill="#dbeafe" fillOpacity="0.4" stroke="#60a5fa" strokeWidth="1.2" />

              {/* Grid Lines */}
              <line x1="80" y1="90" x2="240" y2="150" stroke="#bfdbfe" strokeWidth="1" strokeDasharray="3 2" />
              <line x1="120" y1="70" x2="280" y2="130" stroke="#bfdbfe" strokeWidth="1" strokeDasharray="3 2" />
              <line x1="160" y1="50" x2="320" y2="110" stroke="#bfdbfe" strokeWidth="1" strokeDasharray="3 2" />

              <line x1="320" y1="90" x2="160" y2="150" stroke="#bfdbfe" strokeWidth="1" strokeDasharray="3 2" />
              <line x1="280" y1="70" x2="120" y2="130" stroke="#bfdbfe" strokeWidth="1" strokeDasharray="3 2" />
              <line x1="240" y1="50" x2="80" y2="110" stroke="#bfdbfe" strokeWidth="1" strokeDasharray="3 2" />

              {/* Wireframe Structure Pillars & Walls */}
              <polygon points="140,80 200,50 260,80 200,110" fill="#ffffff" fillOpacity="0.7" stroke="#2563eb" strokeWidth="1.5" />
              <polygon points="140,80 200,110 200,145 140,115" fill="#eff6ff" stroke="#2563eb" strokeWidth="1.5" />
              <polygon points="260,80 200,110 200,145 260,115" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.5" />

              {/* Upper Wireframe Peak Roof */}
              <line x1="200" y1="15" x2="140" y2="80" stroke="#0284c7" strokeWidth="1.5" />
              <line x1="200" y1="15" x2="260" y2="80" stroke="#0284c7" strokeWidth="1.5" />
              <line x1="200" y1="15" x2="200" y2="110" stroke="#0284c7" strokeWidth="1.2" strokeDasharray="3 2" />

              {/* Dimension Callouts */}
              <circle cx="140" cy="115" r="3" fill="#2563eb" />
              <circle cx="260" cy="115" r="3" fill="#2563eb" />
              <circle cx="200" cy="145" r="3.5" fill="#2563eb" />
              <circle cx="200" cy="15" r="3.5" fill="#0284c7" />

              {/* Glowing Laser Wave */}
              <path d="M 60,110 Q 200,175 340,110" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            </svg>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: WHITE AUTH FORM CARD
           ========================================================================= */}
        <div
          style={{
            background: '#ffffff',
            padding: '36px 36px 30px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
          className="auth-right-col"
        >
          {/* Top Tabs Switcher (Masuk / Daftar) */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #e2e8f0',
              marginBottom: '26px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('masuk')}
              style={{
                flex: 1,
                textAlign: 'center',
                paddingBottom: '12px',
                fontSize: '15px',
                fontWeight: activeTab === 'masuk' ? 700 : 500,
                color: activeTab === 'masuk' ? '#2563eb' : '#64748b',
                position: 'relative',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 0.2s',
              }}
            >
              Masuk
              {activeTab === 'masuk' && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '-1px',
                    left: 0,
                    right: 0,
                    height: '2.5px',
                    background: '#2563eb',
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('daftar')}
              style={{
                flex: 1,
                textAlign: 'center',
                paddingBottom: '12px',
                fontSize: '15px',
                fontWeight: activeTab === 'daftar' ? 700 : 500,
                color: activeTab === 'daftar' ? '#2563eb' : '#64748b',
                position: 'relative',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 0.2s',
              }}
            >
              Daftar
              {activeTab === 'daftar' && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '-1px',
                    left: 0,
                    right: 0,
                    height: '2.5px',
                    background: '#2563eb',
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              )}
            </button>
          </div>

          {/* Title and Subtitle */}
          <div style={{ marginBottom: '18px' }}>
            <h3
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.02em',
                marginBottom: '6px',
              }}
            >
              {activeTab === 'masuk' ? 'Selamat Datang Kembali' : 'Buat Akun Baru'}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              {activeTab === 'masuk'
                ? 'Masuk ke akun Anda untuk melanjutkan'
                : 'Daftar sekarang untuk memulai estimasi proyek Anda'}
            </p>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                marginBottom: '14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#991b1b',
                fontSize: '12.5px',
                lineHeight: 1.4,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                marginBottom: '14px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                color: '#166534',
                fontSize: '12.5px',
                lineHeight: 1.4,
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* If Register tab: Nama Lengkap */}
            {activeTab === 'daftar' && (
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    display: 'block',
                    marginBottom: '6px',
                  }}
                >
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  placeholder="Masukkan nama lengkap Anda"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '13.5px',
                    color: '#0f172a',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            )}

            {/* Email / Handphone */}
            <div>
              <label
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Email atau nomor handphone
              </label>
              <input
                type="text"
                placeholder="nama@perusahaan.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '13.5px',
                  color: '#0f172a',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#2563eb';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 40px 0 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '13.5px',
                    color: '#0f172a',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Tampilkan Password"
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px',
                  }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* If Register tab: Confirm Password */}
            {activeTab === 'daftar' && (
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    display: 'block',
                    marginBottom: '6px',
                  }}
                >
                  Konfirmasi Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ulangi password Anda"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '13.5px',
                    color: '#0f172a',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            )}

            {/* Remember Me & Forgot Password Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12.5px',
                marginTop: '2px',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#475569',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    accentColor: '#2563eb',
                    cursor: 'pointer',
                  }}
                />
                <span>Ingat saya</span>
              </label>

              {activeTab === 'masuk' && (
                <a
                  href="#lupa-password"
                  onClick={(e) => {
                    e.preventDefault();
                    alert('Silakan hubungi administrator atau masukkan email Anda untuk reset password.');
                  }}
                  style={{
                    color: '#2563eb',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Lupa password?
                </a>
              )}
            </div>

            {/* Submit Button (Masuk / Daftar) */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: '44px',
                marginTop: '8px',
                background: loading ? '#93c5fd' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14.5px',
                fontWeight: 650,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s, transform 0.15s, box-shadow 0.2s',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#1d4ed8';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {loading && <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />}
              <span>{loading ? 'Memproses...' : activeTab === 'masuk' ? 'Masuk' : 'Daftar Sekarang'}</span>
            </button>

            {/* Divider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                margin: '8px 0',
              }}
            >
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                {activeTab === 'masuk' ? 'atau masuk dengan' : 'atau daftar dengan'}
              </span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>

            {/* Google Social Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                fontSize: '13.5px',
                fontWeight: 600,
                color: '#1e293b',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Lanjutkan dengan Google</span>
            </button>
          </form>

          {/* Bottom Switcher */}
          <div
            style={{
              marginTop: '18px',
              textAlign: 'center',
              fontSize: '12.5px',
              color: '#64748b',
            }}
          >
            {activeTab === 'masuk' ? (
              <span>
                Belum punya akun?{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('daftar')}
                  style={{
                    color: '#2563eb',
                    fontWeight: 650,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Daftar sekarang
                </button>
              </span>
            ) : (
              <span>
                Sudah punya akun?{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('masuk')}
                  style={{
                    color: '#2563eb',
                    fontWeight: 650,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Masuk di sini
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .auth-modal-grid {
            grid-template-columns: 1fr !important;
            max-width: 460px !important;
          }
          .auth-left-col {
            display: none !important;
          }
          .auth-right-col {
            padding: 28px 20px 24px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AuthModal;

