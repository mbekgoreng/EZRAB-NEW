/**
 * AuthModal — pintu masuk/daftar EZRAB.
 *
 * Desain baru (sesuai video referensi): kartu "double slider" layar penuh —
 * form Masuk/Daftar + panel overlay gradien biru EZRAB yang bergeser halus.
 * Tab "peran demo" tetap tersedia lewat tautan di bawah kartu.
 *
 * Kontrak props tidak berubah: isOpen, onClose, onSuccessLogin, initialTab.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { RoleLoginPanel } from './RoleLoginPanel';
import { SlidingAuthCard } from './SlidingAuthCard';

export type AuthTabId = 'masuk' | 'daftar' | 'role';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin: () => void;
  initialTab?: AuthTabId;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
  initialTab = 'masuk',
}) => {
  const [showRole, setShowRole] = useState(false);

  React.useEffect(() => {
    if (isOpen) setShowRole(initialTab === 'role');
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleEmailSuccess = () => {
    onClose();
    onSuccessLogin();
  };

  if (showRole) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={onClose}
      >
        <div
          style={{
            width: 'min(460px, 100%)',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: '#ffffff',
            borderRadius: 22,
            boxShadow: '0 24px 70px -18px rgba(15, 23, 42, 0.5)',
            padding: '28px 30px',
            position: 'relative',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#64748b',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
          <RoleLoginPanel
            onSuccess={() => {
              onSuccessLogin();
              onClose();
            }}
            onBackToLogin={() => setShowRole(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <SlidingAuthCard
      initialTab={initialTab === 'daftar' ? 'daftar' : 'masuk'}
      onSuccessLogin={handleEmailSuccess}
      onClose={onClose}
      onShowRoleLogin={() => setShowRole(true)}
    />
  );
};

export default AuthModal;
