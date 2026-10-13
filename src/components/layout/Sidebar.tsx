import React, { useState } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Coins,
  Sparkles,
  Calculator,
  Layers,
  Database,
  Ruler,
  LineChart,
  FileText,
  Settings,
  X,
  ChevronDown,
  Files,
  CheckCircle2,
  Receipt,
  Package,
  HardHat,
  Truck,
  Tag,
  FileSpreadsheet,
  FileCheck,
  Calendar,
} from 'lucide-react';
import { Project } from '../../types';
import { useI18n } from '../../i18n';
import { RabTemplateService } from '../../services/rabTemplateService';

export interface SidebarProps {
  activeMenu: string;
  onSelectMenu: (menu: string, projectId?: string | null) => void;
  sidebarCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  mobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;
  projectFilter: string;
  onSelectProjectFilter: (filter: string) => void;
  projects: Project[];
  currentProject: Project | null;
  onBackToLanding?: () => void;
  onOpenSettingsTab?: (tab: string) => void;
}

interface NavItemDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
  badge?: string | number;
  badgeType?: 'primary' | 'success' | 'neutral';
  matchMenu?: (active: string) => boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeMenu,
  onSelectMenu,
  sidebarCollapsed,
  onToggleCollapse,
  isMobile,
  mobileDrawerOpen,
  onCloseMobileDrawer,
  projectFilter,
  onSelectProjectFilter,
  projects,
  currentProject,
  onBackToLanding,
  onOpenSettingsTab,
}) => {
  const { t } = useI18n();
  const [proyekSubmenuOpen, setProyekSubmenuOpen] = useState(true);
  // Floating pill toggle: slides sidebar completely away (manual only, no auto-expand)
  const [isHidden, setIsHidden] = useState(false);
  const [rabSubmenuOpen, setRabSubmenuOpen] = useState(true);
  const [databaseSubmenuOpen, setDatabaseSubmenuOpen] = useState(true);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; label: string } | null>(null);

  // Volume Calculation Submenu Items
  const volumeSubItems = [
    {
      id: 'qto-vc',
      label: t('nav.volume_kalkulator'),
      icon: Calculator,
      match: (m: string) => m === 'qto-vc' || m === 'volume-calculation',
    },
    {
      id: 'qto',
      label: t('nav.rekap_qto'),
      icon: Ruler,
      match: (m: string) => m === 'qto' || m === 'qto-rekap',
    },
  ];

  const isVolumeActive = volumeSubItems.some((sub) => sub.match(activeMenu));

  // RAB & Estimasi Submenu Items
  const rabSubItems = [
    {
      id: 'rab-spreadsheet',
      label: t('nav.rab_spreadsheet'),
      icon: FileSpreadsheet,
      match: (m: string) => m === 'rab-spreadsheet' || m === 'rab-estimasi',
    },
    {
      id: 'rab-rekapitulasi',
      label: t('nav.rekap_rab'),
      icon: FileCheck,
      match: (m: string) => m === 'rab-rekapitulasi',
    },
    {
      id: 'rab-analisa-harga',
      label: t('nav.analisa_harga'),
      icon: Calculator,
      match: (m: string) => m === 'rab-analisa-harga',
    },
    {
      id: 'rab-kurva-s',
      label: t('nav.kurva_s'),
      icon: LineChart,
      match: (m: string) => m === 'rab-kurva-s',
    },
    {
      id: 'rab-catatan',
      label: t('nav.catatan'),
      icon: FileText,
      match: (m: string) => m === 'rab-catatan',
    },
    {
      id: 'rab-pengaturan',
      label: t('nav.pengaturan_rab'),
      icon: Settings,
      match: (m: string) => m === 'rab-pengaturan',
    },
  ];

  const isRabActive = rabSubItems.some((sub) => sub.match(activeMenu));

  // Database Submenu Items
  const databaseSubItems = [
    {
      id: 'database-material',
      label: t('nav.material'),
      icon: Package,
      match: (m: string) => m === 'database-material' || m === 'material' || m === 'material-harga',
    },
    {
      id: 'ahsp-2026',
      label: t('nav.ahsp'),
      icon: Database,
      match: (m: string) => m === 'ahsp-2026' || m === 'ahsp' || m === 'analisa-ahsp',
    },
    {
      id: 'database-upah',
      label: t('nav.upah'),
      icon: HardHat,
      match: (m: string) => m === 'database-upah' || m === 'upah',
    },
    {
      id: 'database-alat',
      label: t('nav.alat'),
      icon: Truck,
      match: (m: string) => m === 'database-alat' || m === 'alat',
    },
    {
      id: 'harga-proyek',
      label: t('nav.harga_proyek'),
      icon: Tag,
      match: (m: string) => m === 'harga-proyek' || m === 'project-price',
    },
  ];

  const isDatabaseActive = databaseSubItems.some((sub) => sub.match(activeMenu));

  // Counts for Project Statuses
  const totalProjects = projects.length;
  const draftCount = projects.filter((p) => p.status === 'draft' || !p.status || p.status === 'DRAFT').length;
  const inProgressCount = projects.filter((p) => p.status === 'in_progress').length;
  const completedCount = projects.filter(
    (p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED'
  ).length;
  const archivedCount = projects.filter((p) => p.status === 'archived' || p.isArchived).length;

  // Real template count from RAB template registry (never hardcoded)
  const templateCount = RabTemplateService.getInstance().getAllTemplates().length;

  const handleMouseEnterItem = (e: React.MouseEvent<HTMLElement>, label: string, id: string) => {
    setHoveredItemId(id);
    if (!isMobile && sidebarCollapsed) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipPos({ top: rect.top + rect.height / 2, label });
    }
  };

  const handleMouseLeaveItem = () => {
    setHoveredItemId(null);
    setTooltipPos(null);
  };

  const isItemActive = (item: NavItemDef): boolean => {
    if (item.matchMenu) return item.matchMenu(activeMenu);
    return activeMenu === item.id;
  };

  const mainNavItems: NavItemDef[] = [
    {
      id: 'dashboard',
      label: t('nav.home'),
      icon: LayoutDashboard,
    },
    // Proyek is handled with dedicated dropdown (Portofolio, Volume/QTO, Jadwal/Manajemen)
    // RAB & Estimasi is handled with dedicated dropdown (Spreadsheet, Rekapitulasi, AHSP, Kurva S, Catatan, Pengaturan)
    // AI section: exactly 3 items (per Director order 2026-10-08)
    {
      id: 'ezrab-ai',
      label: t('nav.chat_ai'),
      icon: Sparkles,
      badge: 'AI',
      badgeType: 'primary',
      matchMenu: (menu) => menu === 'ezrab-ai' || menu === 'ai-assistant',
    },
    {
      id: 'ded-ai',
      label: t('nav.ded_ai'),
      icon: FileCheck,
      badge: 'AI',
      badgeType: 'primary',
      matchMenu: (menu) => menu === 'ded-ai' || menu === 'ded-rab' || menu === 'magic-ai',
    },
    {
      id: 'dokumen-ai',
      label: t('nav.doc_ai'),
      icon: FileText,
      badge: 'AI',
      badgeType: 'primary',
      matchMenu: (menu) => menu === 'dokumen-ai',
    },
    {
      id: 'template-rab',
      label: t('nav.template_rab'),
      icon: Layers,
      badge: templateCount > 0 ? String(templateCount) : undefined,
      badgeType: 'neutral',
    },
    // Database handled with dedicated expandable dropdown!
    {
      id: 'laporan',
      label: t('nav.laporan'),
      icon: FileText,
      matchMenu: (menu) => menu === 'laporan' || menu === 'boq' || menu === 'rekapitulasi',
    },
    {
      id: 'dokumen-tender',
      label: t('nav.dokumen_proyek'),
      icon: Files,
      matchMenu: (menu) => menu === 'dokumen-tender',
    },
    {
      id: 'keuangan-proyek',
      label: t('nav.keuangan_proyek'),
      icon: Receipt,
      matchMenu: (menu) =>
        menu === 'keuangan-proyek' ||
        menu === 'keuangan' ||
        menu === 'termin' ||
        menu === 'invoice' ||
        menu === 'pemasukan' ||
        menu === 'pengeluaran' ||
        menu === 'cash-flow',
    },
  ];

  return (
    <>
      <aside
        className="ezrab-workspace-sidebar"
        style={
          isMobile
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 'min(84vw, 290px)',
                background: '#FFFFFF',
                borderRight: '1px solid #DCE4EE',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                flexShrink: 0,
                height: '100vh',
                zIndex: 9999,
                transform: mobileDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: mobileDrawerOpen ? '0 16px 40px rgba(15,23,42,0.18)' : 'none',
                pointerEvents: mobileDrawerOpen ? 'auto' : 'none',
              }
            : {
                width: sidebarCollapsed ? '72px' : '256px',
                background: '#E9EEF5',
                borderRight: '1px solid #DCE4EE',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                height: '100%',
                marginLeft: isHidden ? (sidebarCollapsed ? '-72px' : '-256px') : '0',
                transition: 'margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 200ms ease-out',
                zIndex: 40,
              }
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {/* =========================================================================
              TOP: LOGO & WORKSPACE HEADER
             ========================================================================= */}
          <div
            style={{
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: !isMobile && sidebarCollapsed ? 'center' : 'space-between',
              padding: !isMobile && sidebarCollapsed ? '0 12px' : '0 16px',
              borderBottom: '1px solid #DCE4EE',
              flexShrink: 0,
            }}
          >
            <div
              onClick={() => {
                if (isMobile) onCloseMobileDrawer();
                if (onBackToLanding) onBackToLanding();
              }}
              title={`EZRAB — ${t('nav.back_landing')}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: onBackToLanding ? 'pointer' : 'default',
              }}
            >
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '9px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <img
                  src="/images/ez-emblem.png"
                  alt="EZ"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>

              {(!sidebarCollapsed || isMobile) && (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.025em', color: '#0F172A' }}>
                      EZRAB
                    </span>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, letterSpacing: '0.01em' }}>
                    Construction Tech
                  </span>
                </div>
              )}
            </div>

            {/* Mobile drawer close (desktop uses floating pill toggle) */}
            {isMobile && (
              <button
                type="button"
                onClick={onCloseMobileDrawer}
                aria-label={t('common.tutup')}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            )}

          </div>


          {/* =========================================================================
              MAIN NAVIGATION
             ========================================================================= */}
          <nav
            style={{
              padding: sidebarCollapsed && !isMobile ? '12px 8px' : '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}
          >
            {/* 1. BERANDA Header & Dashboard */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 12px 3px 12px' }}>
                BERANDA
              </div>
            )}
            {(() => {
              const item = mainNavItems[0];
              const active = isItemActive(item);
              const IconComp = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectMenu(item.id)}
                  onMouseEnter={(e) => handleMouseEnterItem(e, item.label, item.id)}
                  onMouseLeave={handleMouseLeaveItem}
                  aria-label={item.label}
                  style={{
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
                    padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: active ? 650 : 500,
                    color: active ? '#2563EB' : '#475569',
                    background: active ? '#FFFFFF' : hoveredItemId === item.id ? '#DCE7F5' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <IconComp size={17} color={active ? '#2563EB' : '#64748B'} />
                  {(!sidebarCollapsed || isMobile) && <span>{item.label}</span>}
                </button>
              );
            })()}

            {/* 2. PROYEK — status filters with real counts */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                {t('nav.proyek')}
              </div>
            )}
            {[
              { label: t('nav.f_semua'), filter: 'Semua Proyek', count: totalProjects, icon: FolderKanban },
              { label: t('nav.f_draft'), filter: 'Draft', count: draftCount, icon: FileText },
              { label: t('nav.f_aktif'), filter: 'Sedang Dikerjakan', count: inProgressCount, icon: HardHat },
              { label: t('nav.f_selesai'), filter: 'Selesai', count: completedCount, icon: CheckCircle2 },
              { label: t('nav.f_arsip'), filter: 'Arsip', count: archivedCount, icon: Files },
            ].map((sub) => {
              const isSubActive = activeMenu === 'proyek' && projectFilter === sub.filter;
              const SubIcon = sub.icon;
              return (
                <button
                  key={sub.filter}
                  type="button"
                  onClick={() => {
                    onSelectProjectFilter(sub.filter);
                    onSelectMenu('proyek', null);
                  }}
                  onMouseEnter={(e) => handleMouseEnterItem(e, sub.label, `proyek-${sub.filter}`)}
                  onMouseLeave={handleMouseLeaveItem}
                  aria-label={sub.label}
                  style={{
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                    padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: isSubActive ? 650 : 500,
                    color: isSubActive ? '#2563EB' : '#475569',
                    background: isSubActive ? '#FFFFFF' : hoveredItemId === `proyek-${sub.filter}` ? '#DCE7F5' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <SubIcon size={17} color={isSubActive ? '#2563EB' : '#64748B'} />
                    {(!sidebarCollapsed || isMobile) && <span>{sub.label}</span>}
                  </span>
                  {(!sidebarCollapsed || isMobile) && sub.count > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 650, color: isSubActive ? '#2563EB' : '#94A3B8' }}>
                      {sub.count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* 3. VOLUME & QTO */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                VOLUME & QTO
              </div>
            )}
            {volumeSubItems.map((sub) => {
              const isSubActive = sub.match(activeMenu);
              const SubIcon = sub.icon;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSelectMenu(sub.id)}
                  onMouseEnter={(e) => handleMouseEnterItem(e, sub.label, sub.id)}
                  onMouseLeave={handleMouseLeaveItem}
                  aria-label={sub.label}
                  style={{
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
                    padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: isSubActive ? 650 : 500,
                    color: isSubActive ? '#2563EB' : '#475569',
                    background: isSubActive ? '#FFFFFF' : hoveredItemId === sub.id ? '#DCE7F5' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <SubIcon size={17} color={isSubActive ? '#2563EB' : '#64748B'} />
                  {(!sidebarCollapsed || isMobile) && <span>{sub.label}</span>}
                </button>
              );
            })}

            {/* 3b. JADWAL & MANAJEMEN */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                JADWAL & MANAJEMEN
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelectMenu('manajemen-proyek')}
              onMouseEnter={(e) => handleMouseEnterItem(e, 'Jadwal & Manajemen', 'manajemen-proyek')}
              onMouseLeave={handleMouseLeaveItem}
              aria-label="Jadwal & Manajemen"
              style={{
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
                padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: activeMenu === 'manajemen-proyek' ? 650 : 500,
                color: activeMenu === 'manajemen-proyek' ? '#2563EB' : '#475569',
                background: activeMenu === 'manajemen-proyek' ? '#FFFFFF' : hoveredItemId === 'manajemen-proyek' ? '#DCE7F5' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                gap: '12px',
                transition: 'all 0.15s ease',
              }}
            >
              <Calendar size={17} color={activeMenu === 'manajemen-proyek' ? '#2563EB' : '#64748B'} />
              {(!sidebarCollapsed || isMobile) && <span>Jadwal & Manajemen</span>}
            </button>

            {/* 4. RAB & ESTIMASI */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                RAB & ESTIMASI
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div
                style={{
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                  padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: isRabActive ? 650 : 500,
                  color: isRabActive ? '#2563EB' : '#475569',
                  background: isRabActive && !rabSubmenuOpen ? '#FFFFFF' : hoveredItemId === 'rab-parent' ? '#DCE7F5' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.rab_estimasi'), 'rab-parent')}
                onMouseLeave={handleMouseLeaveItem}
              >
                <div
                  onClick={() => onSelectMenu('rab-spreadsheet')}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, height: '100%' }}
                >
                  <Coins size={17} color={isRabActive ? '#2563EB' : '#64748B'} />
                  {(!sidebarCollapsed || isMobile) && <span>{t('nav.rab_estimasi')}</span>}
                </div>

                {(!sidebarCollapsed || isMobile) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRabSubmenuOpen(!rabSubmenuOpen);
                    }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px', display: 'flex' }}
                    title="Buka/Tutup Submenu RAB"
                    aria-label="Buka/Tutup Submenu RAB"
                  >
                    <ChevronDown
                      size={14}
                      style={{
                        transform: rabSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>
                )}
              </div>

              {/* Sub-items RAB & Estimasi */}
              {(!sidebarCollapsed || isMobile) && rabSubmenuOpen && (
                <div
                  style={{
                    paddingLeft: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    borderLeft: '2px solid #DCE4EE',
                    marginLeft: '20px',
                    marginTop: '2px',
                    marginBottom: '4px',
                  }}
                >
                  {rabSubItems.map((sub) => {
                    const isSubActive = sub.match(activeMenu);
                    const SubIcon = sub.icon;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => onSelectMenu(sub.id)}
                        style={{
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: isSubActive ? 650 : 500,
                          color: isSubActive ? '#2563EB' : '#64748B',
                          background: isSubActive ? '#FFFFFF' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <SubIcon size={13} color={isSubActive ? '#2563EB' : '#94A3B8'} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sub.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Remaining Main Nav Items */}
            {mainNavItems.slice(1).map((item) => {
              const active = isItemActive(item);
              const IconComp = item.icon;
              return (
                <React.Fragment key={item.id}>
                  {item.id === 'ezrab-ai' && (!sidebarCollapsed || isMobile) && (
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                      AI
                    </div>
                  )}
                  {item.id === 'template-rab' && (!sidebarCollapsed || isMobile) && (
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                      DATA & REFERENSI
                    </div>
                  )}
                  <button
                    type="button"
                  onClick={() => onSelectMenu(item.id)}
                  onMouseEnter={(e) => handleMouseEnterItem(e, item.label, item.id)}
                  onMouseLeave={handleMouseLeaveItem}
                  aria-label={item.label}
                  style={{
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                    padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: active ? 650 : 500,
                    color: active ? '#2563EB' : '#475569',
                    background: active ? '#FFFFFF' : hoveredItemId === item.id ? '#DCE7F5' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <IconComp size={17} color={active ? '#2563EB' : '#64748B'} />
                    {(!sidebarCollapsed || isMobile) && <span>{item.label}</span>}
                  </div>

                  {(!sidebarCollapsed || isMobile) && item.badge && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 650,
                        color: item.badgeType === 'primary' ? '#2563EB' : '#94A3B8',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>

                {/* Database Expandable Dropdown (Material & Harga, AHSP, Upah, Peralatan, Harga Proyek) */}
                {item.id === 'template-rab' && (
                  <div key="database-expandable-group" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div
                      style={{
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                        padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: isDatabaseActive ? 650 : 500,
                        color: isDatabaseActive ? '#2563EB' : '#475569',
                        background:
                          isDatabaseActive && !databaseSubmenuOpen
                            ? '#FFFFFF'
                            : hoveredItemId === 'database-parent'
                            ? '#DCE7F5'
                            : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        width: '100%',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => handleMouseEnterItem(e, 'Database', 'database-parent')}
                      onMouseLeave={handleMouseLeaveItem}
                    >
                      <div
                        onClick={() => {
                          onSelectMenu('database-material');
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, height: '100%' }}
                      >
                        <Database size={17} color={isDatabaseActive ? '#2563EB' : '#64748B'} />
                        {(!sidebarCollapsed || isMobile) && <span>{t('nav.database')}</span>}
                      </div>

                      {(!sidebarCollapsed || isMobile) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDatabaseSubmenuOpen(!databaseSubmenuOpen);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94A3B8',
                            padding: '2px',
                            display: 'flex',
                          }}
                          title="Buka/Tutup Submenu Database"
                          aria-label="Buka/Tutup Submenu Database"
                        >
                          <ChevronDown
                            size={14}
                            style={{
                              transform: databaseSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease',
                            }}
                          />
                        </button>
                      )}
                    </div>

                    {/* Expanded Database Submenu */}
                    {(!sidebarCollapsed || isMobile) && databaseSubmenuOpen && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          paddingLeft: '32px',
                          paddingRight: '6px',
                          marginTop: '2px',
                          marginBottom: '4px',
                          borderLeft: '2px solid #E2E8F0',
                          marginLeft: '20px',
                        }}
                      >
                        {databaseSubItems.map((sub) => {
                          const isSubActive = sub.match(activeMenu);
                          const SubIcon = sub.icon;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => onSelectMenu(sub.id)}
                              style={{
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '0 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: isSubActive ? 650 : 500,
                                color: isSubActive ? '#2563EB' : '#64748B',
                                background: isSubActive ? '#FFFFFF' : 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                                transition: 'all 0.12s ease',
                              }}
                            >
                              <SubIcon size={14} color={isSubActive ? '#2563EB' : '#94A3B8'} />
                              <span style={{ flex: 1 }}>{sub.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
              );
            })}

            {/* Separator to SYSTEM section */}
            <div style={{ height: '1px', background: '#DCE4EE', margin: '8px 4px' }} />

            {/* SYSTEM: Pengaturan */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 12px 3px 12px' }}>
                LAINNYA
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelectMenu('pengaturan')}
              onMouseEnter={(e) => handleMouseEnterItem(e, 'Pengaturan', 'pengaturan')}
              onMouseLeave={handleMouseLeaveItem}
              aria-label={t('nav.pengaturan')}
              style={{
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
                padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: activeMenu === 'pengaturan' || activeMenu === 'subscription' ? 650 : 500,
                color: activeMenu === 'pengaturan' || activeMenu === 'subscription' ? '#2563EB' : '#475569',
                background:
                  activeMenu === 'pengaturan' || activeMenu === 'subscription'
                    ? '#FFFFFF'
                    : hoveredItemId === 'pengaturan'
                    ? '#DCE7F5'
                    : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                gap: '12px',
                transition: 'all 0.15s ease',
              }}
            >
              <Settings
                size={17}
                color={activeMenu === 'pengaturan' || activeMenu === 'subscription' ? '#2563EB' : '#64748B'}
              />
              {(!sidebarCollapsed || isMobile) && <span>{t('nav.pengaturan')}</span>}
            </button>
          </nav>
        </div>

        {/* =========================================================================
            BOTTOM: USER PROFILE & LOGOUT
           ========================================================================= */}
      </aside>

      {/* Floating pill toggle — distinctive hide/show control on sidebar boundary.
          NOT a conventional header chevron; NOT auto-expand on hover. */}
      {!isMobile && (
        <button
          type="button"
          onClick={() => setIsHidden((v) => !v)}
          title={isHidden ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
          aria-label={isHidden ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
          aria-pressed={isHidden}
          style={{
            position: 'fixed',
            // 8px clear of the sidebar edge so the capsule never crowds
            // group-header text or item rows; bottom-anchored in the
            // sidebar's neutral empty band instead of vertical center.
            left: isHidden ? '8px' : sidebarCollapsed ? '68px' : '252px',
            top: 'auto',
            bottom: '32px',
            transform: 'none',
            width: '28px',
            height: '64px',
            borderRadius: '99px',
            background: '#FFFFFF',
            border: '1px solid #DCE4EE',
            boxShadow: '0 4px 16px rgba(38,54,75,0.12)',
            cursor: 'pointer',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s, color 0.2s',
            color: '#64748B',
            fontSize: '14px',
            fontWeight: 700,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2563EB';
            e.currentTarget.style.borderColor = '#2563EB';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#DCE4EE';
            e.currentTarget.style.color = '#64748B';
          }}
        >
          {isHidden ? '›' : '‹'}
        </button>
      )}

      {/* Floating Tooltip when collapsed */}
      {!isMobile && sidebarCollapsed && tooltipPos && (
        <div
          style={{
            position: 'fixed',
            left: '80px',
            top: `${tooltipPos.top}px`,
            transform: 'translateY(-50%)',
            background: '#0F172A',
            color: '#FFFFFF',
            fontSize: '11.5px',
            fontWeight: 600,
            padding: '5px 10px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            zIndex: 99999,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(15,23,42,0.15)',
          }}
        >
          {tooltipPos.label}
        </div>
      )}
    </>
  );
};
