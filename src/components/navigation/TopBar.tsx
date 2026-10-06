import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Bell,
  HelpCircle,
  User,
  Settings,
  Shield,
  CreditCard,
  LogOut,
  Building2,
  Users,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Info,
  Clock,
  Menu as MenuIcon,
  ChevronRight,
  BookOpen,
  Keyboard,
  LifeBuoy,
  MessageSquare,
} from 'lucide-react';
import { ClientUserManagementService } from '../../services/userManagementService';
import { UserRole } from '../../types';

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

interface NotificationItem {
  id: string;
  category: 'PROJECT' | 'RAB' | 'QTO' | 'DED' | 'AI' | 'SYSTEM' | 'ACCOUNT';
  title: string;
  message: string;
  time: string;
  priority: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  read: boolean;
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
  const [currentUser, setCurrentUser] = useState(() => ClientUserManagementService.getCurrentUser());
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Real Application Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      category: 'PROJECT',
      title: 'RAB Selesai Diproses',
      message: 'RAB Rumah Tinggal Type 36 selesai dihitung otomatis dengan standar AHSP 2026.',
      time: '5 menit yang lalu',
      priority: 'SUCCESS',
      read: false,
    },
    {
      id: 'notif-2',
      category: 'DED',
      title: 'Analisis Gambar DED Selesai',
      message: 'Sistem vision AI telah mengekstraksi 14 item pekerjaan struktur beton dan pondasi.',
      time: '30 menit yang lalu',
      priority: 'INFO',
      read: true,
    },
    {
      id: 'notif-3',
      category: 'SYSTEM',
      title: 'Ekspor Dokumen Berhasil',
      message: 'Format RAB Excel & BoQ terverifikasi siap diunduh.',
      time: '1 jam yang lalu',
      priority: 'SUCCESS',
      read: true,
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const notifRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setHelpOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationOpen(false);
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

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

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
            placeholder={isNarrowMobile ? 'Cari proyek...' : 'Cari proyek, material, AHSP, atau data estimasi...'}
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
        
        {/* 1. NOTIFICATION BELL & POPOVER */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            onClick={() => {
              setNotificationOpen(!notificationOpen);
              setHelpOpen(false);
              setProfileOpen(false);
            }}
            aria-label="Notifikasi"
            aria-expanded={notificationOpen}
            style={{
              position: 'relative',
              width: '38px',
              height: '38px',
              borderRadius: '9px',
              background: notificationOpen ? '#EFF6FF' : 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: notificationOpen ? '#2563EB' : '#64748B',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!notificationOpen) {
                e.currentTarget.style.background = '#F8FAFC';
                e.currentTarget.style.color = '#0F172A';
              }
            }}
            onMouseLeave={(e) => {
              if (!notificationOpen) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#64748B';
              }
            }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  width: '15px',
                  height: '15px',
                  borderRadius: '50%',
                  background: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '9.5px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #FFFFFF',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notification Popover Menu */}
          {notificationOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: isNarrowMobile ? '-60px' : '0',
                width: isNarrowMobile ? '310px' : '360px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E5E7EB',
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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#FAFAFA',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>Notifikasi</span>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#EFF6FF',
                        color: '#2563EB',
                        padding: '1px 7px',
                        borderRadius: '999px',
                      }}
                    >
                      {unreadCount} belum dibaca
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: '#2563EB',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Tandai dibaca
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                    Tidak ada notifikasi baru
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #F1F5F9',
                        display: 'flex',
                        gap: '12px',
                        background: item.read ? '#FFFFFF' : '#F8FAFC',
                        transition: 'background 0.15s ease',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F1F5F9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = item.read ? '#FFFFFF' : '#F8FAFC';
                      }}
                    >
                      <div style={{ marginTop: '2px', flexShrink: 0 }}>
                        {item.priority === 'SUCCESS' ? (
                          <CheckCircle2 size={16} color="#10B981" />
                        ) : item.priority === 'WARNING' ? (
                          <AlertCircle size={16} color="#F59E0B" />
                        ) : (
                          <Info size={16} color="#2563EB" />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#64748B',
                              background: '#F1F5F9',
                              padding: '1px 5px',
                              borderRadius: '4px',
                            }}
                          >
                            {item.category}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>{item.time}</span>
                        </div>
                        <div style={{ fontSize: '12.5px', fontWeight: 650, color: '#0F172A', marginTop: '3px' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4, marginTop: '2px' }}>
                          {item.message}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  padding: '10px 16px',
                  background: '#FAFAFA',
                  borderTop: '1px solid #F1F5F9',
                  textAlign: 'center',
                }}
              >
                <button
                  onClick={() => {
                    setNotificationOpen(false);
                    onNavigate('pengaturan', 'notifications');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 650,
                    color: '#2563EB',
                    cursor: 'pointer',
                  }}
                >
                  Lihat Semua Notifikasi & Pengaturan →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. HELP MENU & POPOVER (DESKTOP) */}
        {!isNarrowMobile && (
          <div style={{ position: 'relative' }} ref={helpRef}>
            <button
              onClick={() => {
                setHelpOpen(!helpOpen);
                setNotificationOpen(false);
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
              setNotificationOpen(false);
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
                  <span>Super Admin</span>
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
                    <div style={{ marginTop: '6px' }}>
                      {renderRoleBadge(currentUser.role)}
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
                    label: 'Profil Saya',
                    icon: User,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'profile');
                    },
                  },
                  {
                    label: 'Pengaturan Sistem',
                    icon: Settings,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'general');
                    },
                  },
                  {
                    label: 'Manajemen Pengguna & Tim',
                    icon: Users,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'users');
                    },
                  },
                  {
                    label: 'Paket & Penggunaan',
                    icon: CreditCard,
                    action: () => {
                      setProfileOpen(false);
                      onNavigate('pengaturan', 'subscription');
                    },
                  },
                  {
                    label: 'Keamanan Akun',
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
                      onLogout();
                    } else if (window.confirm('Apakah Anda yakin ingin keluar dari akun?')) {
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
                  <span>Keluar Akun</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
