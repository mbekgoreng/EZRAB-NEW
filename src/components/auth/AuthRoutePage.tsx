/**
 * AuthRoutePage — halaman login EZRAB di route sendiri: /masuk & /daftar.
 *
 * Merender kartu login animasi yang sama seperti AuthModal
 * (SlidingAuthCard), tetapi sebagai halaman dokumen sungguhan, bukan
 * modal: halaman bisa di-scroll alami sehingga kartu setinggi apa pun
 * (mode daftar lebih tinggi) tetap terjangkau penuh, banner demo-only
 * mengalir di atas kartu, dan tombol tutup/kembali menempel di kartu —
 * bukan melayang di pojok viewport.
 *
 * Pengkabelan meniru AuthModal persis: demoOnly dari sumber yang sama
 * (LOGIN_UI di App), onSuccessLogin = perilaku pasca-login yang sama
 * (masuk aplikasi), onShowRoleLogin berganti ke RoleLoginPanel di
 * halaman ini juga dengan jalan kembali ke form, dan tutup/kembali =
 * navigasi ke '/'.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { RoleLoginPanel } from './RoleLoginPanel';
import { SlidingAuthCard } from './SlidingAuthCard';

interface AuthRoutePageProps {
  initialTab?: 'masuk' | 'daftar';
  /** True bila backend login belum aktif: tampilkan banner + paksa peran demo. */
  demoOnly?: boolean;
  /** Login berhasil → masuk aplikasi (perilaku sama seperti modal). */
  onSuccessLogin: () => void;
  /** Kembali ke landing '/'. */
  onBackToLanding: () => void;
}

const DEMO_ONLY_BANNER: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: 1.55,
  color: '#1e40af',
  background: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '10px',
  padding: '10px 12px',
  margin: '0 0 14px',
};

const ROLE_CARD: React.CSSProperties = {
  width: 'min(460px, 100%)',
  background: 'var(--ez-color-surface)',
  borderRadius: '18px',
  boxShadow: '0 24px 70px -18px rgba(37, 99, 235, 0.35), 0 10px 24px rgba(15, 23, 42, 0.12)',
  padding: '28px 30px',
  position: 'relative',
};

const ROLE_CLOSE: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 14,
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '1px solid var(--ez-color-border-line)',
  background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-muted)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
};

export const AuthRoutePage: React.FC<AuthRoutePageProps> = ({
  initialTab = 'masuk',
  demoOnly = false,
  onSuccessLogin,
  onBackToLanding,
}) => {
  const [showRole, setShowRole] = useState(false);

  if (showRole) {
    // Panel peran demo sebagai halaman (bukan overlay): kartu mengalir
    // di backdrop .sac-page varian route; X menempel di kartu dan
    // kembali ke beranda; panel sendiri punya jalan kembali ke form.
    return (
      <div className="sac-page sac-page--route">
        <div style={ROLE_CARD}>
          <button
            type="button"
            onClick={onBackToLanding}
            aria-label="Kembali ke beranda"
            style={ROLE_CLOSE}
          >
            <X size={18} />
          </button>
          {demoOnly && (
            <div style={DEMO_ONLY_BANNER}>
              Login email belum diaktifkan — backend dalam redesign. Untuk
              sekarang, masuk lewat peran demo di bawah.
            </div>
          )}
          <RoleLoginPanel
            forceDemoRoles={demoOnly}
            onSuccess={onSuccessLogin}
            onBackToLogin={() => setShowRole(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <SlidingAuthCard
      variant="page"
      initialTab={initialTab}
      onSuccessLogin={onSuccessLogin}
      onClose={onBackToLanding}
      onShowRoleLogin={() => setShowRole(true)}
      demoOnly={demoOnly}
    />
  );
};

export default AuthRoutePage;
