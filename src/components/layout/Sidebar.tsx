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
  Building2,
  Plus,
  Check,
  HelpCircle,
  LogOut,
  User as UserIcon,
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
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

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
        data-tour="sidebar"
        className="ezrab-workspace-sidebar"
        style={
          isMobile
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 'min(84vw, 290px)',
                background: 'var(--ez-color-surface)',
                borderRight: '1px solid var(--ez-color-sidebar-border)',
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
                background: 'var(--ez-color-sidebar)',
                borderRight: '1px solid var(--ez-color-sidebar-border)',
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
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '8px' }}>
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
              borderBottom: '1px solid var(--ez-color-sidebar-border)',
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
                  borderRadius: '8px',
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
                    <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.025em', color: 'var(--ez-color-text-primary)' }}>
                      EZRAB
                    </span>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--ez-color-primary)', display: 'inline-block' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0.01em' }}>
                    {t('nav.tagline')}
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
                  background: 'var(--ez-color-surface-secondary)',
                  color: 'var(--ez-color-sidebar-text)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            )}

          </div>


          {/* Project selector — compact, minimal */}
          {(!sidebarCollapsed || isMobile) ? (
            <div style={{ position: 'relative', margin: '4px 0 8px 0' }}>
              <button
                type="button"
                onClick={() => setProjectPickerOpen((v) => !v)}
                aria-label={t('nav.pick_current_project')}
                aria-expanded={projectPickerOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '12px',
                  background: 'var(--ez-color-surface)',
                  border: '1px solid var(--ez-color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: projectPickerOpen ? '0 4px 12px rgba(37,99,235,0.08)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: 'var(--ez-color-primary-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--ez-color-primary)',
                    }}
                  >
                    <Building2 size={15} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--ez-color-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {t('nav.current_project')}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentProject ? currentProject.name : t('nav.pick_project')}
                    </div>
                  </div>
                </div>
                <ChevronDown
                  size={14}
                  color="var(--ez-color-text-muted)"
                  style={{
                    transform: projectPickerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    flexShrink: 0,
                  }}
                />
              </button>

              {projectPickerOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '6px',
                    backgroundColor: 'var(--ez-color-surface)',
                    borderRadius: '12px',
                    border: '1px solid var(--ez-color-border-soft)',
                    boxShadow: '0 12px 28px rgba(15,23,42,0.14)',
                    zIndex: 100,
                    maxHeight: '280px',
                    overflowY: 'auto',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ padding: '6px 8px 4px', fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('nav.project_list')} ({projects.length})
                  </div>
                  {projects.map((proj) => {
                    const isSelected = currentProject?.id === proj.id;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => {
                          onSelectMenu(activeMenu, proj.id);
                          setProjectPickerOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: isSelected ? '1px solid var(--ez-hue-blue-border)' : '1px solid transparent',
                          background: isSelected ? 'var(--ez-color-primary-soft)' : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, marginRight: '6px' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: isSelected ? 'var(--ez-color-primary)' : 'var(--ez-color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {proj.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)' }}>
                            {proj.projectNumber || proj.id} • {proj.status === 'completed' ? t('nav.st_selesai') : proj.status === 'in_progress' ? t('nav.st_berjalan') : t('nav.st_draft')}
                          </div>
                        </div>
                        {isSelected && <Check size={14} color="var(--ez-color-primary)" style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                  <div style={{ borderTop: '1px solid var(--ez-color-surface-secondary)', marginTop: '4px', paddingTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMenu('proyek');
                        setProjectPickerOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--ez-color-primary-soft)',
                        color: 'var(--ez-color-primary)',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Plus size={13} />
                      <span>+ {t('nav.create_project')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 10px 0' }}>
              <button
                type="button"
                onClick={() => onSelectMenu('proyek')}
                title={`${t('nav.current_project')}: ${currentProject ? currentProject.name : t('nav.pick_project')}`}
                aria-label={t('nav.pick_project_aria')}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '12px',
                  background: 'var(--ez-color-primary-soft)',
                  border: 'none',
                  color: 'var(--ez-color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Building2 size={18} />
              </button>
            </div>
          )}

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
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 12px 3px 12px' }}>
                {t('nav.group_beranda')}
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
                  data-tour={`menu-${item.id}`}
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
                    color: active ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                    background: active ? 'var(--ez-color-sidebar-active)' : hoveredItemId === item.id ? 'var(--ez-color-sidebar-hover)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <IconComp size={17} color={active ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
                  {(!sidebarCollapsed || isMobile) && <span>{item.label}</span>}
                </button>
              );
            })()}

            {/* 2. PROYEK — status filters with real counts */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
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
                    color: isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                    background: isSubActive ? 'var(--ez-color-sidebar-active)' : hoveredItemId === `proyek-${sub.filter}` ? 'var(--ez-color-sidebar-hover)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <SubIcon size={17} color={isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
                    {(!sidebarCollapsed || isMobile) && <span>{sub.label}</span>}
                  </span>
                  {(!sidebarCollapsed || isMobile) && sub.count > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 650, color: isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)' }}>
                      {sub.count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* 3. VOLUME & QTO */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                {t('nav.group_volume_qto')}
              </div>
            )}
            {volumeSubItems.map((sub) => {
              const isSubActive = sub.match(activeMenu);
              const SubIcon = sub.icon;
              return (
                <button
                  key={sub.id}
                  type="button"
                  data-tour={`menu-${sub.id}`}
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
                    color: isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                    background: isSubActive ? 'var(--ez-color-sidebar-active)' : hoveredItemId === sub.id ? 'var(--ez-color-sidebar-hover)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <SubIcon size={17} color={isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
                  {(!sidebarCollapsed || isMobile) && <span>{sub.label}</span>}
                </button>
              );
            })}

            {/* 3b. JADWAL & MANAJEMEN */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                {t('nav.group_jadwal')}
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelectMenu('manajemen-proyek')}
              onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.jadwal_manajemen'), 'manajemen-proyek')}
              onMouseLeave={handleMouseLeaveItem}
              aria-label={t('nav.jadwal_manajemen')}
              style={{
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
                padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: activeMenu === 'manajemen-proyek' ? 650 : 500,
                color: activeMenu === 'manajemen-proyek' ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                background: activeMenu === 'manajemen-proyek' ? 'var(--ez-color-sidebar-active)' : hoveredItemId === 'manajemen-proyek' ? 'var(--ez-color-sidebar-hover)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                gap: '12px',
                transition: 'all 0.15s ease',
              }}
            >
              <Calendar size={17} color={activeMenu === 'manajemen-proyek' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
              {(!sidebarCollapsed || isMobile) && <span>{t('nav.jadwal_manajemen')}</span>}
            </button>

            {/* 4. RAB & ESTIMASI */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                {t('nav.group_rab')}
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
                  color: isRabActive ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                  background: isRabActive && !rabSubmenuOpen ? 'var(--ez-color-sidebar-active)' : hoveredItemId === 'rab-parent' ? 'var(--ez-color-sidebar-hover)' : 'transparent',
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
                  <Coins size={17} color={isRabActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
                  {(!sidebarCollapsed || isMobile) && <span>{t('nav.rab_estimasi')}</span>}
                </div>

                {(!sidebarCollapsed || isMobile) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRabSubmenuOpen(!rabSubmenuOpen);
                    }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ez-color-text-muted)', padding: '2px', display: 'flex' }}
                    title={t('nav.toggle_rab')}
                    aria-label={t('nav.toggle_rab')}
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
                    borderLeft: '2px solid var(--ez-color-sidebar-border)',
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
                        data-tour={`menu-${sub.id}`}
                        onClick={() => onSelectMenu(sub.id)}
                        style={{
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '0 8px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: isSubActive ? 650 : 500,
                          color: isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                          background: isSubActive ? 'var(--ez-color-sidebar-active)' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <SubIcon size={13} color={isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
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
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                      {t('nav.group_ai')}
                    </div>
                  )}
                  {item.id === 'template-rab' && (!sidebarCollapsed || isMobile) && (
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                      {t('nav.group_data')}
                    </div>
                  )}
                  <button
                    type="button"
                    data-tour={`menu-${item.id}`}
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
                    color: active ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                    background: active ? 'var(--ez-color-sidebar-active)' : hoveredItemId === item.id ? 'var(--ez-color-sidebar-hover)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <IconComp size={17} color={active ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
                    {(!sidebarCollapsed || isMobile) && <span>{item.label}</span>}
                  </div>

                  {(!sidebarCollapsed || isMobile) && item.badge && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 650,
                        color: item.badgeType === 'primary' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
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
                        color: isDatabaseActive ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                        background:
                          isDatabaseActive && !databaseSubmenuOpen
                            ? 'var(--ez-color-sidebar-active)'
                            : hoveredItemId === 'database-parent'
                            ? 'var(--ez-color-sidebar-hover)'
                            : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        width: '100%',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.database'), 'database-parent')}
                      onMouseLeave={handleMouseLeaveItem}
                    >
                      <div
                        onClick={() => {
                          onSelectMenu('database-material');
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, height: '100%' }}
                      >
                        <Database size={17} color={isDatabaseActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
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
                            color: 'var(--ez-color-text-muted)',
                            padding: '2px',
                            display: 'flex',
                          }}
                          title={t('nav.toggle_db')}
                          aria-label={t('nav.toggle_db')}
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
                          borderLeft: '2px solid var(--ez-color-border)',
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
                              data-tour={`menu-${sub.id}`}
                              onClick={() => onSelectMenu(sub.id)}
                              style={{
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '0 8px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: isSubActive ? 650 : 500,
                                color: isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                                background: isSubActive ? 'var(--ez-color-sidebar-active)' : 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                                transition: 'all 0.12s ease',
                              }}
                            >
                              <SubIcon size={14} color={isSubActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
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
            <div style={{ height: '1px', background: 'var(--ez-color-sidebar-border)', margin: '8px 4px' }} />

            {/* SYSTEM: Pengaturan */}
            {(!sidebarCollapsed || isMobile) && (
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 12px 3px 12px' }}>
                {t('nav.group_lainnya')}
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelectMenu('pengaturan')}
              onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.pengaturan'), 'pengaturan')}
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
                color: activeMenu === 'pengaturan' || activeMenu === 'subscription' ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                background:
                  activeMenu === 'pengaturan' || activeMenu === 'subscription'
                    ? 'var(--ez-color-sidebar-active)'
                    : hoveredItemId === 'pengaturan'
                    ? 'var(--ez-color-sidebar-hover)'
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
                color={activeMenu === 'pengaturan' || activeMenu === 'subscription' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'}
              />
              {(!sidebarCollapsed || isMobile) && <span>{t('nav.pengaturan')}</span>}
            </button>
            {/* Tutorial EZRAB */}
            <button
              type="button"
              data-tour="help"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('ezrab:open-onboarding'));
                }
                if (isMobile) onCloseMobileDrawer();
              }}
              onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.tutorial'), 'tutorial')}
              onMouseLeave={handleMouseLeaveItem}
              aria-label={t('nav.tutorial_ezrab')}
              style={{
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
                padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                color: hoveredItemId === 'tutorial' ? 'var(--ez-color-primary)' : 'var(--ez-color-sidebar-text)',
                background: hoveredItemId === 'tutorial' ? 'var(--ez-color-sidebar-hover)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                gap: '12px',
                transition: 'all 0.15s ease',
              }}
            >
              <HelpCircle
                size={17}
                color={hoveredItemId === 'tutorial' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'}
              />
              {(!sidebarCollapsed || isMobile) && <span>{t('nav.tutorial')}</span>}
            </button>
          </nav>
        </div>

        {/* =========================================================================
            BOTTOM: USER PROFILE & LOGOUT
            Footer memakai background solid + z-index agar kartu profil tidak
            pernah tampak tumpang tindih dengan item menu di atasnya.
           ========================================================================= */}
        <div
          style={{
            padding: sidebarCollapsed && !isMobile ? '12px 8px' : '12px 12px',
            borderTop: '1px solid var(--ez-color-sidebar-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            flexShrink: 0,
            position: 'relative',
            zIndex: 2,
            background: isMobile ? 'var(--ez-color-surface)' : 'var(--ez-color-sidebar)',
          }}
        >
          {(!sidebarCollapsed || isMobile) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 8px',
                borderRadius: '12px',
                background: 'var(--ez-color-surface)',
                border: '1px solid var(--ez-color-border-soft)',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--ez-color-primary-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ez-color-primary)',
                  flexShrink: 0,
                }}
              >
                <UserIcon size={16} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--ez-color-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Estimator Pro
                </div>
                <div
                  style={{
                    fontSize: '10.5px',
                    color: 'var(--ez-color-text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  estimator@ezrab.id
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (onBackToLanding) {
                if (window.confirm(t('nav.confirm_exit_home'))) {
                  onBackToLanding();
                }
              }
            }}
            onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.back_landing'), 'logout')}
            onMouseLeave={handleMouseLeaveItem}
            title={t('nav.back_landing')}
            aria-label={t('nav.back_landing')}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: '8px',
              background: 'transparent',
              border: 'none',
              color: hoveredItemId === 'logout' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
              fontSize: '12.5px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
              padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
              gap: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <LogOut size={16} />
            {(!sidebarCollapsed || isMobile) && <span>{t('nav.back_landing')}</span>}
          </button>
        </div>
      </aside>

      {/* Floating pill toggle — distinctive hide/show control on sidebar boundary.
          NOT a conventional header chevron; NOT auto-expand on hover. */}
      {!isMobile && (
        <button
          type="button"
          onClick={() => setIsHidden((v) => !v)}
          title={isHidden ? t('nav.show_sidebar') : t('nav.hide_sidebar')}
          aria-label={isHidden ? t('nav.show_sidebar') : t('nav.hide_sidebar')}
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
            background: 'var(--ez-color-surface)',
            border: '1px solid var(--ez-color-sidebar-border)',
            boxShadow: '0 4px 16px rgba(38,54,75,0.12)',
            cursor: 'pointer',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s, color 0.2s',
            color: 'var(--ez-color-text-muted)',
            fontSize: '14px',
            fontWeight: 700,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ez-color-primary)';
            e.currentTarget.style.borderColor = 'var(--ez-color-primary)';
            e.currentTarget.style.color = 'var(--ez-color-surface)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--ez-color-surface)';
            e.currentTarget.style.borderColor = 'var(--ez-color-sidebar-border)';
            e.currentTarget.style.color = 'var(--ez-color-text-muted)';
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
            background: 'var(--ez-color-text-primary)',
            color: '#FFFFFF',
            fontSize: '11.5px',
            fontWeight: 600,
            padding: '5px 10px',
            borderRadius: '8px',
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
