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
Sun,
  Moon,
  ChevronDown,
  Check,
} from 'lucide-react';
import { NotificationBell } from '../../notifications/NotificationBell';
import type { NotificationItem } from '../../notifications/NotificationContext';
import { ClientUserManagementService } from '../../services/userManagementService';
import { UserRole } from '../../types';
import { useI18n, LANG_OPTIONS } from '../../i18n';
import type { Lang } from '../../i18n';

/** Label ringkas bahasa untuk tombol selector bahasa. */
const LANG_SHORT: Record<Lang, string> = { id: 'ID', en: 'EN', zh: '中文', ms: 'MY' };
import { useRole } from '../../auth/RoleContext';
import { useTheme } from '../../context/ThemeContext';

interface TopBarProps {
  isMobile: boolean;
  isNarrowMobile: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Proyek untuk hasil pencarian global. */
  projects?: Project[];
  onOpenProject?: (projectId: string) => void;
  onCreateProject?: () => void;
  onOpenMobileDrawer?: () => void;
  onNavigate: (menu: string, tab?: string) => void;
  onLogout?: () => void;
  workspaceName?: string;
breadcrumb?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({
  isMobile,
  isNarrowMobile,
  searchQuery,
  onSearchChange,
  projects = [],
  onOpenProject,
  onCreateProject,
  onOpenMobileDrawer,
  onNavigate,
  onLogout,
  workspaceName = 'EZRAB Construction Workspace',
  breadcrumb,
}) => {
const { t, lang, setLang } = useI18n();
  const { activeRole, logoutRole } = useRole();
  const [currentUser, setCurrentUser] = useState(() => ClientUserManagementService.getCurrentUser());
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { effectiveTheme, setTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

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
  const langRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setHelpOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
        setProfileOpen(false);
        setLangOpen(false);
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
      SUPER_ADMIN: { bg: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary-hover)', border: 'var(--ez-hue-blue-border)', label: 'Super Admin' },
      ESTIMATOR: { bg: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text)', border: 'var(--ez-hue-green-border)', label: 'Estimator' },
      DIREKSI: { bg: 'var(--ez-hue-purple-bg)', color: 'var(--ez-hue-purple-text)', border: 'var(--ez-hue-purple-border)', label: 'Direksi' },
      CLIENT: { bg: 'var(--ez-hue-amber-bg)', color: 'var(--ez-hue-amber-text)', border: 'var(--ez-hue-amber-border)', label: 'Client' },
      EDITOR: { bg: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)', border: 'var(--ez-color-border-strong)', label: 'Editor' },
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
        background: 'var(--ez-color-surface)',
        borderBottom: '1px solid var(--ez-color-border-neutral)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          height: isNarrowMobile ? '56px' : '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isNarrowMobile ? '0 12px' : '0 24px',
          gap: '16px',
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
              background: 'var(--ez-color-surface-secondary)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-color-text-ink)',
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
                background: 'var(--ez-color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ez-color-on-primary)',
                fontWeight: 800,
                fontSize: '13px',
                boxShadow: 'var(--ez-shadow-logo)',
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
          ref={searchWrapRef}
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
            color="var(--ez-color-text-faint)"
            style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('nav.search_placeholder')}
          value={searchQuery}
onChange={(e) => onSearchChange(e.target.value)}
          aria-label={t('nav.search_aria_label')}
          style={{
            width: '100%',
            height: '38px',
            paddingLeft: '36px',
            paddingRight: isNarrowMobile ? '12px' : '52px',
            borderRadius: '10px',
            background: 'var(--ez-color-surface-secondary)',
            border: '1px solid var(--ez-color-border-line)',
            fontSize: '13px',
            color: 'var(--ez-color-text-primary)',
            outline: 'none',
            transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
          }}
onFocus={(e) => {
            e.currentTarget.style.background = 'var(--ez-color-surface)';
            e.currentTarget.style.borderColor = 'var(--ez-color-primary)';
            e.currentTarget.style.boxShadow = 'var(--ez-focus-ring)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
            e.currentTarget.style.borderColor = 'var(--ez-color-border-line)';
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
              color: 'var(--ez-color-text-faint)',
              border: '1px solid var(--ez-color-border-line)',
              padding: '2px 6px',
              borderRadius: '5px',
              background: 'var(--ez-color-surface)',
              pointerEvents: 'none',
            }}
          >
            ⌘ K
          </span>
        )}

        {/* Hasil pencarian global */}
        {searchFocused && searchQuery.trim() && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              right: 0,
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 16px 40px rgba(15,23,42,0.14)',
              zIndex: 100,
              overflow: 'hidden',
              maxHeight: 'min(380px, 60vh)',
              overflowY: 'auto',
            }}
          >
            {searchResults.length === 0 ? (
              <div style={{ padding: '18px 16px', fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>
                Tidak ada hasil untuk “{searchQuery.trim()}”.
              </div>
            ) : (
              (() => {
                let lastGroup = '';
                return searchResults.map((r, i) => {
                  const header = r.group !== lastGroup ? r.group : null;
                  lastGroup = r.group;
                  return (
                    <div key={r.key}>
                      {header && (
                        <div style={{ padding: '10px 14px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: '#94A3B8' }}>
                          {header.toUpperCase()}
                        </div>
                      )}
                      <button
                        onMouseDown={(e) => { e.preventDefault(); pickResult(r); }}
                        onMouseEnter={() => setActiveResultIdx(i)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 14px',
                          background: i === activeResultIdx ? '#EFF6FF' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ flexShrink: 0, display: 'flex' }}>{r.icon}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.label}
                          </span>
                          {r.sub && (
                            <span style={{ display: 'block', fontSize: 11.5, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.sub}
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  );
                });
              })()
            )}
          </div>
        )}
        </div>
      </div>

      {/* =======================================================================
          RIGHT: NOTIFICATION + HELP + PROFILE MENU
         ======================================================================= */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isNarrowMobile ? '8px' : '12px', flexShrink: 0 }}>
        
{/* 0. THEME TOGGLE (terang/gelap) */}
        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          title={isDark ? 'Mode terang' : 'Mode gelap'}
          aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
          aria-pressed={isDark}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            border: '1px solid var(--ez-color-border-line)',
            background: 'var(--ez-color-surface)',
            color: 'var(--ez-color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* 0b. LANGUAGE SELECTOR (compact dropdown, wired to I18nContext) */}
        <div style={{ position: 'relative' }} ref={langRef}>
          <button
            type="button"
            onClick={() => {
              setLangOpen(!langOpen);
              setHelpOpen(false);
              setProfileOpen(false);
            }}
            title={t('nav.pilih_bahasa')}
            aria-label={t('nav.pilih_bahasa')}
            aria-expanded={langOpen}
            style={{
              height: '38px',
              minWidth: '58px',
              padding: '0 9px',
              borderRadius: '10px',
              border: '1px solid var(--ez-color-border-line)',
              background: langOpen ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
              color: langOpen ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.03em',
              fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
              transition: 'all 0.15s ease',
            }}
          >
            {LANG_SHORT[lang]}
            <ChevronDown size={13} />
          </button>

          {langOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '168px',
                background: 'var(--ez-color-surface)',
                borderRadius: '14px',
                border: '1px solid var(--ez-color-border-line)',
                boxShadow: 'var(--ez-shadow-popover)',
                zIndex: 100,
                overflow: 'hidden',
                padding: '6px',
                animation: 'ezrabFadeIn 0.18s ease-out',
              }}
            >
              {LANG_OPTIONS.map((opt) => {
                const isActive = opt.id === lang;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setLang(opt.id);
                      setLangOpen(false);
                    }}
                    style={{
                      width: '100%',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 10px',
                      borderRadius: '8px',
                      background: isActive ? 'var(--ez-hue-blue-bg)' : 'transparent',
                      border: 'none',
                      color: isActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-body)',
                      fontSize: '12.5px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{opt.nativeName}</span>
                    {isActive && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
                background: helpOpen ? 'var(--ez-hue-blue-bg)' : 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: helpOpen ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!helpOpen) {
                  e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                  e.currentTarget.style.color = 'var(--ez-color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!helpOpen) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--ez-color-text-muted)';
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
                  background: 'var(--ez-color-surface)',
                  borderRadius: '14px',
                  border: '1px solid var(--ez-color-border-line)',
                  boxShadow: 'var(--ez-shadow-popover)',
                  zIndex: 100,
                  overflow: 'hidden',
                  animation: 'ezrabFadeIn 0.18s ease-out',
                }}
              >
                <div
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                    background: 'var(--ez-color-surface-faint)',
                  }}
                >
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>Bantuan & Panduan</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
                    Dokumentasi dan dukungan teknis EZRAB
                  </div>
                </div>

                <div style={{ padding: '6px' }}>
                  {[
                    { label: 'Panduan Penggunaan EZRAB', icon: BookOpen, action: () => { setHelpOpen(false); onNavigate('pengaturan', 'help'); } },
                    { label: 'Pusat Bantuan & FAQ', icon: LifeBuoy, action: () => { setHelpOpen(false); onNavigate('pengaturan', 'help'); } },
                    { label: 'Shortcut Keyboard (⌘ K)', icon: Keyboard, action: () => { setHelpOpen(false); alert(`${t('nav.shortcut_title')}:\n- ⌘ K / Ctrl+K: ${t('nav.shortcut_search')}\n- Esc: ${t('nav.shortcut_close')}\n- Shift+A: ${t('nav.shortcut_magic_ai')}`); } },
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
                          color: 'var(--ez-color-text-body)',
                          fontSize: '12.5px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                          e.currentTarget.style.color = 'var(--ez-color-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--ez-color-text-body)';
                        }}
                      >
                        <Icon size={15} color="var(--ez-color-text-muted)" />
                        <span>{menuItem.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    padding: '10px 16px',
                    background: 'var(--ez-color-surface-faint)',
                    borderTop: '1px solid var(--ez-color-surface-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--ez-color-text-faint)',
                  }}
                >
                  <span>Versi Aplikasi</span>
                  <span style={{ fontWeight: 700, color: 'var(--ez-color-text-slate)' }}>v2.0.0 (Production)</span>
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
              background: profileOpen ? 'var(--ez-hue-blue-bg)' : 'transparent',
              border: profileOpen ? '1px solid var(--ez-hue-blue-border)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!profileOpen) {
                e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
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
                border: '1.5px solid var(--ez-color-border-line)',
                flexShrink: 0,
              }}
            />
            {!isNarrowMobile && (
              <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                  {currentUser.name.split(',')[0]}
                </div>
<div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                background: 'var(--ez-color-surface)',
                borderRadius: '14px',
                border: '1px solid var(--ez-color-border-line)',
                boxShadow: 'var(--ez-shadow-popover)',
                zIndex: 100,
                overflow: 'hidden',
                animation: 'ezrabFadeIn 0.18s ease-out',
              }}
            >
              {/* Profile Header */}
              <div
                style={{
                  padding: '16px',
                  borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                  background: 'linear-gradient(180deg, var(--ez-color-surface-faint) 0%, var(--ez-color-surface) 100%)',
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
                      border: '2px solid var(--ez-color-surface)',
                      boxShadow: 'var(--ez-shadow-avatar)',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser.name}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
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
color: 'var(--ez-hue-violet-text)', background: 'var(--ez-hue-violet-bg)',
                            border: '1px solid var(--ez-hue-violet-border)', padding: '3px 8px', borderRadius: '999px',
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
                    background: 'var(--ez-color-surface-secondary)',
                    border: '1px solid var(--ez-color-border-line)',
                    fontSize: '11px',
                    color: 'var(--ez-color-text-slate)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Building2 size={13} color="var(--ez-color-text-muted)" />
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
                        color: 'var(--ez-color-text-body)',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                        e.currentTarget.style.color = 'var(--ez-color-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--ez-color-text-body)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={15} color="var(--ez-color-text-muted)" />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight size={13} color="var(--ez-color-border-strong)" />
                    </button>
                  );
                })}
              </div>

              {/* Logout Footer */}
              <div style={{ padding: '6px', borderTop: '1px solid var(--ez-color-surface-tertiary)' }}>
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
                    color: 'var(--ez-color-danger-strong)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--ez-hue-red-bg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
<LogOut size={15} color="var(--ez-color-danger-strong)" />
                  <span>{t('nav.keluar_akun')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      {breadcrumb && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: isNarrowMobile ? '4px 12px' : '6px 24px',
            borderTop: '1px solid var(--ez-color-surface-tertiary)',
            background: 'var(--ez-color-surface)',
          }}
        >
          {breadcrumb}
        </div>
      )}
    </header>
  );
};
