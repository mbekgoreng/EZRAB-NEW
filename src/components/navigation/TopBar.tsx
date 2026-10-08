import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  HelpCircle,
  User,
  Settings,
  Shield,
  CreditCard,
  LogOut,
  Building2,
  Users,
  ExternalLink,
  Menu as MenuIcon,
  ChevronRight,
  BookOpen,
  Keyboard,
  LifeBuoy,
  MessageSquare,
} from 'lucide-react';
import { NotificationBell } from '../../notifications/NotificationBell';
import type { NotificationItem } from '../../notifications/NotificationContext';
import { ClientUserManagementService } from '../../services/userManagementService';
import { UserRole } from '../../types';
import { useI18n } from '../../i18n';
import { useRole } from '../../auth/RoleContext';

interface TopBarProps {
  isMobile: boolean;
  isNarrowMobile: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenMobileDrawer?: () => void;
  onNavigate: (menu: string, tab?: string) => void;
  onLogout?: () => void;
  workspaceName?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  isMobile,
  isNarrowMobile,
  searchQuery,
  onSearchChange,
  onOpenMobileDrawer,
  onNavigate,
  onLogout,
  workspaceName = 'EZRAB Construction Workspace',
}) => {
  const { t } = useI18n();
  const { activeRole, logoutRole } = useRole();
  const [currentUser, setCurrentUser] = useState(() => ClientUserManagementService.getCurrentUser());
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleNotificationItemClick = (item: NotificationItem) => {
    if (item.link) {
      const [menu, tab] = item.link.split(':');
      onNavigate(menu, tab);
    }
  };

  const handleNotificationSettings = () => {
    onNavigate('pengaturan', 'notifications');
  };

  const helpRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setHelpOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const renderRoleBadge = (role: UserRole) => {
    const styles: Record<UserRole, { bg: string; color: string; border: string; label: string }> = {
      SUPER_ADMIN: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: 'Super Admin' },
      ESTIMATOR: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'Estimator' },
      DIREKSI: { bg: '#FAF5FF', color: '#7E22CE', border: '#E9D5FF', label: 'Direksi' },
      CLIENT: { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: 'Client' },
      EDITOR: { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: 'Editor' },
    };
    const currentStyle = styles[role] || styles.SUPER_ADMIN;

    return (
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '999px',
          background: currentStyle.bg,
          color: currentStyle.color,
          border: `1px solid ${currentStyle.border}`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          letterSpacing: '0.01em',
        }}
      >
        {currentStyle.label}
      </span>
    );
  };

  return (
    <header
      style={{
        height: isNarrowMobile ? '56px' : '64px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isNarrowMobile ? '0 12px' : '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        gap: '16px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* =======================================================================
          LEFT: BRAND LOGO / IDENTITY (MOBILE HAMBURGER)
         ======================================================================= */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {isMobile && onOpenMobileDrawer && (
          <button
            onClick={onOpenMobileDrawer}
            aria-label="Buka Menu Navigasi"
            className="ezrab-touch-target"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <MenuIcon size={19} />
          </button>
        )}

        <div
          onClick={() => onNavigate('dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title="EZRAB — Workspace"
        >
          {isNarrowMobile && (
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '13px',
                boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
              }}
            >
              EZ
            </div>
          )}
        </div>
      </div>

      {/* =======================================================================
          CENTER: GLOBAL SEARCH (CLEAN & SUBTLE)
         ======================================================================= */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          flex: 1,
          padding: '0 12px',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            maxWidth: isNarrowMobile ? '100%' : '460px',
          }}
        >
          <Search
            size={16}
            color="#94A3B8"
            style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
          />
          <input
            type="text"
            placeholder={t('nav.search_placeholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Pencarian Global"
          style={{
            width: '100%',
            height: '38px',
            paddingLeft: '36px',
            paddingRight: isNarrowMobile ? '12px' : '52px',
            borderRadius: '10px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            fontSize: '13px',
            color: '#0F172A',
            outline: 'none',
            transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#2563EB';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.background = '#F8FAFC';
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        {!isNarrowMobile && (
          <span
            style={{
              position: 'absolute',
              right: '10px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#94A3B8',
              border: '1px solid #E2E8F0',
              padding: '2px 6px',
              borderRadius: '5px',
              background: '#FFFFFF',
              pointerEvents: 'none',
            }}
          >
            ⌘ K
          </span>
        )}
        </div>
      </div>

      {/* =======================================================================
          RIGHT: NOTIFICATION + HELP + PROFILE MENU
         ======================================================================= */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isNarrowMobile ? '8px' : '12px', flexShrink: 0 }}>
        
        {/* 1. NOTIFICATION BELL & POPOVER (real notification center) */}
        <NotificationBell
          isNarrowMobile={isNarrowMobile}
          onItemClick={handleNotificationItemClick}
          onOpenSettings={handleNotificationSettings}
        />

        {/* 2. HELP MENU & POPOVER (DESKTOP) */}
        {!isNarrowMobile && (
          <div style={{ position: 'relative' }} ref={helpRef}>
            <button
              onClick={() => {
                setHelpOpen(!helpOpen);
                setProfileOpen(false);
              }}
              aria-label="Bantuan"
              aria-expanded={helpOpen}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '9px',
                background: helpOpen ? '#EFF6FF' : 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: helpOpen ? '#2563EB' : '#64748B',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!helpOpen) {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.color = '#0F172A';
                }
              }}
              onMouseLeave={(e) => {
                if (!helpOpen) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#64748B';
                }
              }}
            >
              <HelpCircle size={18} />
            </button>

            {/* Help Popover */}
            {helpOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '280px',
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
                  zIndex: 100,
                  overflow: 'hidden',
                  animation: 'ezrabFadeIn 0.18s ease-out',
                }}
              >
                <div
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid #F1F5F9',
                    background: '#FAFAFA',
                  }}
                >
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>Bantuan & Panduan</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                    Dokumentasi dan dukungan teknis EZRAB
                  </div>
                </div>

                <div style={{ padding: '6px' }}>
                  {[
                    { label: 'Panduan Penggunaan EZRAB', icon: BookOpen, action: () => { setHelpOpen(false); onNavigate('pengaturan', 'help'); } },
                    { label: 'Pusat Bantuan & FAQ', icon: LifeBuoy, action: () => { setHelpOpen(false); onNavigate('pengaturan', 'help'); } },
                    { label: 'Shortcut Keyboard (⌘ K)', icon: Keyboard, action: () => { setHelpOpen(false); alert('Shortcut EZRAB:\n- ⌘ K / Ctrl+K: Cari Proyek\n- Esc: Tutup Modal / Popover\n- Shift+A: Magic AI Quick Assistant'); } },
                    { label: 'Hubungi Support Teknis', icon: MessageSquare, action: () => { setHelpOpen(false); onNavigate('pengaturan', 'help'); } },
                  ].map((menuItem) => {
                    const Icon = menuItem.icon;
                    return (
                      <button
                        key={menuItem.label}
                        onClick={menuItem.action}
                        style={{
                          width: '100%',
                          height: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          background: 'transparent',
                          border: 'none',
                          color: '#334155',
                          fontSize: '12.5px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F8FAFC';
                          e.currentTarget.style.color = '#2563EB';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#334155';
                        }}
                      >
                        <Icon size={15} color="#64748B" />
                        <span>{menuItem.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    padding: '10px 16px',
                    background: '#FAFAFA',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: '#94A3B8',
                  }}
                >
                  <span>Versi Aplikasi</span>
                  <span style={{ fontWeight: 700, color: '#475569' }}>v2.0.0 (Production)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. PROFILE AVATAR & DROPDOWN MENU */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button
            onClick={() => {
              setProfileOpen(!profileOpen);
              setHelpOpen(false);
            }}
            aria-label="Menu akun"
            aria-expanded={profileOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              padding: isNarrowMobile ? '2px' : '4px 8px 4px 4px',
              borderRadius: '10px',
              background: profileOpen ? '#EFF6FF' : 'transparent',
              border: profileOpen ? '1px solid #BFDBFE' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!profileOpen) {
                e.currentTarget.style.background = '#F8FAFC';
              }
            }}
            onMouseLeave={(e) => {
              if (!profileOpen) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <img
              src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
              alt={currentUser.name}
              style={{
                width: isNarrowMobile ? '32px' : '34px',
                height: isNarrowMobile ? '32px' : '34px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1.5px solid #E2E8F0',
                flexShrink: 0,
              }}
            />
            {!isNarrowMobile && (
              <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                  {currentUser.name.split(',')[0]}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{activeRole ? activeRole.name : 'Super Admin'}</span>
                </div>
              </div>
            )}
          </button>

          {/* Profile Dropdown Menu */}
          {profileOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '290px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
                zIndex: 100,
                overflow: 'hidden',
                animation: 'ezrabFadeIn 0.18s ease-out',
              }}
            >
              {/* Profile Header */}
              <div
                style={{
                  padding: '16px',
                  borderBottom: '1px solid #F1F5F9',
                  background: 'linear-gradient(180deg, #FAFAFA 0%, #FFFFFF 100%)',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <img
                    src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                    alt={currentUser.name}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #FFFFFF',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser.name}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
                      {currentUser.email}
                    </div>
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {renderRoleBadge(currentUser.role)}
                      {activeRole && (
                        <span
                          title={`${t('settings.role_aktif')}: ${activeRole.name}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em',
                            color: '#7C3AED', background: '#F5F3FF',
                            border: '1px solid #DDD6FE', padding: '3px 8px', borderRadius: '999px',
                          }}
                        >
                          {t('auth.mode_demo')} · {activeRole.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '12px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    fontSize: '11px',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Building2 size={13} color="#64748B" />
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {workspaceName}
                  </span>
                </div>
              </div>

              {/* Menu Links */}
              <div style={{ padding: '6px' }}>
                {[
                  {
                    label: t('nav.menu_profil'),
                    icon: User,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'profile');
                    },
                  },
                  {
                    label: t('nav.menu_pengaturan'),
                    icon: Settings,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'general');
                    },
                  },
                  {
                    label: t('nav.menu_tim'),
                    icon: Users,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'users');
                    },
                  },
                  {
                    label: t('nav.menu_paket'),
                    icon: CreditCard,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'subscription');
                    },
                  },
                  {
                    label: t('nav.menu_keamanan'),
                    icon: Shield,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'security');
                    },
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={item.action}
                      style={{
                        width: '100%',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 10px',
                        borderRadius: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: '#334155',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F8FAFC';
                        e.currentTarget.style.color = '#2563EB';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#334155';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={15} color="#64748B" />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight size={13} color="#CBD5E1" />
                    </button>
                  );
                })}
              </div>

              {/* Logout Footer */}
              <div style={{ padding: '6px', borderTop: '1px solid #F1F5F9' }}>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    if (onLogout) {
                      logoutRole();
                      onLogout();
                    } else if (window.confirm(t('nav.konfirmasi_keluar'))) {
                      logoutRole();
                      onNavigate('landing');
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#DC2626',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#FEE2E2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <LogOut size={15} color="#DC2626" />
                  <span>{t('nav.keluar_akun')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
