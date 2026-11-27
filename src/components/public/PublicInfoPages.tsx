import React from 'react';
import { ArrowLeft, Home, LayoutDashboard, ShieldCheck, FileText, LogIn, SearchX } from 'lucide-react';
import { useI18n } from '../../i18n';

/**
 * Halaman publik sederhana & jujur (F6):
 * - PrivacyPage / TermsPage: ringkasan praktik nyata aplikasi SAAT INI
 *   (bukan dokumen hukum lengkap, tanpa klaim sertifikasi apa pun).
 * - AuthNoticePage: /masuk & /daftar selama login dinonaktifkan.
 * - PublicNotFoundPage: 404 publik yang jelas (bukan jatuh diam-diam ke landing).
 */

interface PageShellProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  onBackToLanding: () => void;
  onOpenWorkspace: () => void;
}

const PageShell: React.FC<PageShellProps> = ({ icon, title, children, onBackToLanding, onOpenWorkspace }) => {
  const { t } = useI18n();
  return (
  <div
    style={{
      minHeight: '100vh',
      background: 'var(--ezrab-bg, var(--ez-hue-slate-bg))',
      color: 'var(--ezrab-text, #0f172a)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '48px 20px 64px',
    }}
  >
    <div style={{ width: '100%', maxWidth: '760px' }}>
      <button
        type="button"
        onClick={onBackToLanding}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'transparent',
          border: 'none',
          color: 'var(--ez-color-primary, #2563EB)',
          fontSize: '13.5px',
          fontWeight: 700,
          cursor: 'pointer',
          padding: 0,
          marginBottom: '24px',
        }}
      >
        <ArrowLeft size={15} /> {t('landing.info_back_home')}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--ezrab-blue-soft, #EFF6FF)',
            color: 'var(--ez-color-primary, #2563EB)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
        <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
      </div>

      <div
        style={{
          marginTop: '16px',
          background: 'var(--ezrab-surface, #FFFFFF)',
          border: '1px solid var(--ezrab-border, #E2E8F0)',
          borderRadius: '16px',
          padding: '24px 28px',
          fontSize: '14.5px',
          lineHeight: 1.75,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {children}
      </div>

      <button
        type="button"
        onClick={onOpenWorkspace}
        style={{
          marginTop: '20px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--ez-color-primary, #2563EB)',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '10px',
          padding: '11px 18px',
          fontSize: '13.5px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <LayoutDashboard size={15} /> {t('landing.info_open_app')}
      </button>
    </div>
  </div>
  );
};

interface InfoPageProps {
  onBackToLanding: () => void;
  onOpenWorkspace: () => void;
}

export const PrivacyPage: React.FC<InfoPageProps> = (props) => {
  const { t } = useI18n();
  return (
  <PageShell icon={<ShieldCheck size={20} />} title={t('landing.privacy_title')} {...props}>
    <p style={{ margin: 0 }}>
      {t('landing.privacy_p1_a')}<strong>{t('landing.privacy_p1_strong')}</strong>{t('landing.privacy_p1_b')}
    </p>
    <p style={{ margin: 0 }}>
      <strong>{t('landing.privacy_p2_strong')}</strong> {t('landing.privacy_p2_body')}
    </p>
    <p style={{ margin: 0 }}>
      <strong>{t('landing.privacy_p3_strong')}</strong> {t('landing.privacy_p3_body')}
    </p>
    <p style={{ margin: 0 }}>
      <strong>{t('landing.privacy_p4_strong')}</strong> {t('landing.privacy_p4_body')}
    </p>
    <p style={{ margin: 0 }}>
      {t('landing.privacy_p5')}
    </p>
  </PageShell>
  );
};

export const TermsPage: React.FC<InfoPageProps> = (props) => {
  const { t } = useI18n();
  return (
  <PageShell icon={<FileText size={20} />} title={t('landing.terms_title')} {...props}>
    <p style={{ margin: 0 }}>
      {t('landing.terms_p1_a')}<strong>{t('landing.terms_p1_strong')}</strong>{t('landing.terms_p1_b')}
    </p>
    <p style={{ margin: 0 }}>
      <strong>{t('landing.terms_p2_strong')}</strong> {t('landing.terms_p2_body')}
    </p>
    <p style={{ margin: 0 }}>
      <strong>{t('landing.terms_p3_strong')}</strong> {t('landing.terms_p3_body')}
    </p>
    <p style={{ margin: 0 }}>
      <strong>{t('landing.terms_p4_strong')}</strong> {t('landing.terms_p4_body')}
    </p>
    <p style={{ margin: 0 }}>
      {t('landing.terms_p5')}
    </p>
  </PageShell>
  );
};

interface AuthNoticePageProps extends InfoPageProps {
  tab: 'masuk' | 'daftar';
}

export const AuthNoticePage: React.FC<AuthNoticePageProps> = ({ tab, ...props }) => {
  const { t } = useI18n();
  const isSignup = tab === 'daftar';
  return (
  <PageShell icon={<LogIn size={20} />} title={t(isSignup ? 'landing.auth_notice_signup_title' : 'landing.auth_notice_signin_title')} {...props}>
    <p style={{ margin: 0 }}>
      {t(isSignup ? 'landing.auth_notice_p1_signup_a' : 'landing.auth_notice_p1_signin_a')}
      <strong>{isSignup ? '/daftar' : '/masuk'}</strong>
      {t(isSignup ? 'landing.auth_notice_p1_signup_mid' : 'landing.auth_notice_p1_signin_mid')}
      <strong>{t('landing.info_open_app')}</strong>
      {t('landing.auth_notice_p1_suffix')}
    </p>
    <p style={{ margin: 0 }}>
      {t('landing.auth_notice_p2_a')}
      {t(isSignup ? 'landing.auth_notice_p2_signup' : 'landing.auth_notice_p2_signin')}
      {t('landing.auth_notice_p2_b')}
    </p>
  </PageShell>
  );
};

export const PublicNotFoundPage: React.FC<InfoPageProps> = ({ onBackToLanding, onOpenWorkspace }) => {
  const { t } = useI18n();
  return (
  <div
    style={{
      minHeight: '100vh',
      background: 'var(--ezrab-bg, var(--ez-hue-slate-bg))',
      color: 'var(--ezrab-text, #0f172a)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}
  >
    <div style={{ textAlign: 'center', maxWidth: '440px' }}>
      <span
        style={{
          display: 'inline-flex',
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          background: 'var(--ezrab-blue-soft, #EFF6FF)',
          color: 'var(--ez-color-primary, #2563EB)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        <SearchX size={26} />
      </span>
      <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 8px' }}>{t('landing.notfound_title')}</h1>
      <p style={{ fontSize: '14.5px', lineHeight: 1.7, color: 'var(--ez-color-text-muted, #64748B)', margin: '0 0 20px' }}>
        {t('landing.notfound_body')}
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBackToLanding}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--ez-color-primary, #2563EB)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            padding: '11px 18px',
            fontSize: '13.5px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Home size={15} /> {t('landing.notfound_home')}
        </button>
        <button
          type="button"
          onClick={onOpenWorkspace}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'transparent',
            color: 'var(--ez-color-primary, #2563EB)',
            border: '1px solid var(--ez-color-primary, #2563EB)',
            borderRadius: '10px',
            padding: '11px 18px',
            fontSize: '13.5px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <LayoutDashboard size={15} /> {t('landing.info_open_app')}
        </button>
      </div>
    </div>
  </div>
  );
};
