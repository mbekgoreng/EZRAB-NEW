import React from 'react';
import { ArrowLeft, Home, LayoutDashboard, ShieldCheck, FileText, LogIn, SearchX } from 'lucide-react';

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

const PageShell: React.FC<PageShellProps> = ({ icon, title, children, onBackToLanding, onOpenWorkspace }) => (
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
        <ArrowLeft size={15} /> Kembali ke Beranda
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
        <LayoutDashboard size={15} /> Buka Aplikasi
      </button>
    </div>
  </div>
);

interface InfoPageProps {
  onBackToLanding: () => void;
  onOpenWorkspace: () => void;
}

export const PrivacyPage: React.FC<InfoPageProps> = (props) => (
  <PageShell icon={<ShieldCheck size={20} />} title="Kebijakan Privasi — Ringkasan" {...props}>
    <p style={{ margin: 0 }}>
      Halaman ini adalah <strong>ringkasan praktik privasi EZRAB saat ini</strong>, ditulis apa adanya
      sesuai cara aplikasi bekerja hari ini — bukan dokumen hukum lengkap.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Data proyek tersimpan di perangkat Anda.</strong> EZRAB saat ini berjalan tanpa akun.
      Data proyek, RAB, dan pengaturan yang Anda masukkan disimpan secara lokal di browser pada
      perangkat yang Anda pakai (penyimpanan lokal browser), dan hilang bila Anda membersihkan data
      situs dari browser tersebut. Data tersebut tidak otomatis terkirim ke server EZRAB.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Fitur AI memproses lewat gateway.</strong> Saat Anda memakai fitur AI (chat, estimasi DED,
      dokumen AI), teks atau dokumen yang Anda kirim diteruskan melalui gateway AI EZRAB ke penyedia
      model AI pihak ketiga untuk menghasilkan jawaban. Hindari memasukkan data pribadi atau rahasia
      ke dalam perintah AI.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Gerbang akses.</strong> Akses ke area aplikasi dilindungi kode akses; sesi akses disimpan
      dalam cookie di browser Anda agar Anda tidak perlu memasukkan kode berulang kali.
    </p>
    <p style={{ margin: 0 }}>
      Ringkasan ini dapat berubah mengikuti perkembangan aplikasi. Versi yang berlaku adalah yang
      tampil di halaman ini.
    </p>
  </PageShell>
);

export const TermsPage: React.FC<InfoPageProps> = (props) => (
  <PageShell icon={<FileText size={20} />} title="Ketentuan Layanan — Ringkasan" {...props}>
    <p style={{ margin: 0 }}>
      Halaman ini adalah <strong>ringkasan ketentuan pemakaian EZRAB saat ini</strong>, ditulis lugas
      sesuai keadaan layanan hari ini — bukan dokumen hukum lengkap.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Tahap pengujian.</strong> EZRAB saat ini disediakan dalam tahap pengujian dan dapat
      berubah sewaktu-waktu. Belum ada akun pengguna dan belum ada pembayaran di dalam aplikasi;
      paket berbayar yang tampil di halaman harga belum dapat dibeli.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Hasil perhitungan &amp; AI adalah alat bantu.</strong> Angka RAB, harga satuan, dan
      dokumen yang dihasilkan EZRAB — termasuk yang dibantu AI — adalah bahan estimasi awal. Harga
      yang belum bersumber resmi ditandai sebagai harga referensi/estimasi di dalam aplikasi. Anda
      wajib memverifikasi sendiri setiap angka dan dokumen sebelum memakainya untuk kontrak,
      penawaran resmi, atau keputusan proyek.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Tanggung jawab data.</strong> Karena data tersimpan lokal di perangkat Anda, menjaga
      cadangan (ekspor/backup) data proyek adalah tanggung jawab Anda.
    </p>
    <p style={{ margin: 0 }}>
      Dengan memakai aplikasi ini Anda dianggap menyetujui ringkasan ketentuan di atas.
    </p>
  </PageShell>
);

interface AuthNoticePageProps extends InfoPageProps {
  tab: 'masuk' | 'daftar';
}

export const AuthNoticePage: React.FC<AuthNoticePageProps> = ({ tab, ...props }) => (
  <PageShell icon={<LogIn size={20} />} title={tab === 'daftar' ? 'Daftar di EZRAB' : 'Masuk ke EZRAB'} {...props}>
    <p style={{ margin: 0 }}>
      Halaman {tab === 'daftar' ? 'pendaftaran' : 'masuk'} EZRAB tersedia di{' '}
      <strong>/masuk</strong>. Saat ini EZRAB masih dalam tahap pengujian:{' '}
      {tab === 'daftar' ? 'pendaftaran akun email' : 'login email'} belum dibuka, dan cara masuk
      yang tersedia adalah <strong>peran demo</strong> di halaman login tersebut. Tanpa akun pun
      seluruh fitur dapat dibuka dari tombol di bawah, dan data Anda tersimpan lokal di perangkat
      ini.
    </p>
    <p style={{ margin: 0 }}>
      Akses ke area aplikasi sementara dilindungi kode akses. Bila login resmi diaktifkan nanti,
      formulir {tab === 'daftar' ? 'pendaftaran' : 'masuk'} email akan tersedia di halaman login.
    </p>
  </PageShell>
);

export const PublicNotFoundPage: React.FC<InfoPageProps> = ({ onBackToLanding, onOpenWorkspace }) => (
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
      <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 8px' }}>Halaman tidak ditemukan</h1>
      <p style={{ fontSize: '14.5px', lineHeight: 1.7, color: 'var(--ez-color-text-muted, #64748B)', margin: '0 0 20px' }}>
        Alamat yang Anda buka tidak tersedia di EZRAB. Periksa kembali alamatnya, atau kembali ke
        beranda dan lanjutkan dari sana.
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
          <Home size={15} /> Ke Beranda
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
          <LayoutDashboard size={15} /> Buka Aplikasi
        </button>
      </div>
    </div>
  </div>
);
