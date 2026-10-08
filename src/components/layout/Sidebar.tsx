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
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Building2,
  Files,
  Check,
  Receipt,
  Package,
  HardHat,
  Truck,
  Tag,
  Plus,
  FileSpreadsheet,
  FileCheck,
  Calendar,
} from 'lucide-react';
import { Project } from '../../types';
import { useI18n } from '../../i18n';

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
  const [volumeSubmenuOpen, setVolumeSubmenuOpen] = useState(true);
  const [rabSubmenuOpen, setRabSubmenuOpen] = useState(true);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
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
      badge: '36-300',
      badgeType: 'success',
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
                borderRight: '1px solid #E5E7EB',
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
                background: '#FFFFFF',
                borderRight: '1px solid #E5E7EB',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                height: '100vh',
                zIndex: 40,
                transition: 'width 200ms ease-out',
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
              borderBottom: '1px solid #E5E7EB',
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

            {/* Collapse toggle / Mobile close */}
            {isMobile ? (
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
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                title={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}
                aria-label={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#F8FAFC',
                  color: '#64748B',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F1F5F9';
                  e.currentTarget.style.color = '#0F172A';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.color = '#64748B';
                }}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              </button>
            )}
          </div>

          {/* Workspace Selector: Proyek Saat Ini Dropdown */}
          {(!sidebarCollapsed || isMobile) ? (
            <div style={{ position: 'relative', margin: '12px 14px 6px 14px' }}>
              <div
                onClick={() => setProjectPickerOpen(!projectPickerOpen)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  border: projectPickerOpen ? '1.5px solid #2563EB' : '1px solid #E5E7EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: projectPickerOpen ? '0 4px 12px rgba(37,99,235,0.08)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#2563EB',
                    }}
                  >
                    <Building2 size={15} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#2563EB', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      Proyek Saat Ini
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentProject ? currentProject.name : 'Pilih Proyek'}
                    </div>
                  </div>
                </div>

                <ChevronDown
                  size={14}
                  color="#64748B"
                  style={{
                    transform: projectPickerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    flexShrink: 0,
                    marginLeft: '4px',
                  }}
                />
              </div>

              {/* Project Picker Dropdown Popover */}
              {projectPickerOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '6px',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
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
                  <div style={{ padding: '6px 8px 4px', fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Daftar Proyek ({projects.length})
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
                          border: isSelected ? '1px solid #BFDBFE' : '1px solid transparent',
                          background: isSelected ? '#EFF6FF' : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, marginRight: '6px' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: isSelected ? '#2563EB' : '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {proj.name}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748B' }}>
                            {proj.projectNumber || proj.id} • {proj.status === 'completed' ? 'Selesai' : proj.status === 'in_progress' ? 'Berjalan' : 'Draft'}
                          </div>
                        </div>
                        {isSelected && <Check size={14} color="#2563EB" style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}

                  <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '4px', paddingTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMenu('proyek');
                        setProjectPickerOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#EFF6FF',
                        color: '#2563EB',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Plus size={13} />
                      <span>+ Buat Proyek Baru</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
              <button
                type="button"
                onClick={() => onSelectMenu('proyek')}
                title={`Proyek Saat Ini: ${currentProject ? currentProject.name : 'Pilih Proyek'}`}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  color: '#2563EB',
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
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
                    padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: active ? 650 : 500,
                    color: active ? '#2563EB' : '#475569',
                    background: active ? '#EFF6FF' : hoveredItemId === item.id ? '#F8FAFC' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <IconComp size={18} color={active ? '#2563EB' : '#64748B'} />
                  {(!sidebarCollapsed || isMobile) && <span>{item.label}</span>}
                </button>
              );
            })()}

            {/* 2. Proyek with Expandable Status Filter & Submodules */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div
                style={{
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                  padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: (activeMenu === 'proyek' || activeMenu === 'manajemen-proyek') ? 650 : 500,
                  color: (activeMenu === 'proyek' || activeMenu === 'manajemen-proyek') ? '#2563EB' : '#475569',
                  background: (activeMenu === 'proyek' || activeMenu === 'manajemen-proyek') && !proyekSubmenuOpen ? '#EFF6FF' : hoveredItemId === 'proyek-parent' ? '#F8FAFC' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => handleMouseEnterItem(e, 'Proyek', 'proyek-parent')}
                onMouseLeave={handleMouseLeaveItem}
              >
                <div
                  onClick={() => {
                    onSelectProjectFilter('Semua Proyek');
                    onSelectMenu('proyek', null);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, height: '100%' }}
                >
                  <FolderKanban size={18} color={(activeMenu === 'proyek' || activeMenu === 'manajemen-proyek') ? '#2563EB' : '#64748B'} />
                  {(!sidebarCollapsed || isMobile) && <span>{t('nav.proyek')}</span>}
                </div>

                {(!sidebarCollapsed || isMobile) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {totalProjects > 0 && (
                      <span
                        style={{
                          fontSize: '10.5px',
                          background: '#EFF6FF',
                          color: '#2563EB',
                          padding: '1px 7px',
                          borderRadius: '999px',
                          fontWeight: 700,
                        }}
                      >
                        {totalProjects}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProyekSubmenuOpen(!proyekSubmenuOpen);
                      }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px', display: 'flex' }}
                      title="Buka/Tutup Submenu Status Proyek"
                      aria-label="Buka/Tutup Submenu Status Proyek"
                    >
                      <ChevronDown
                        size={14}
                        style={{
                          transform: proyekSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Sub-items Proyek */}
              {(!sidebarCollapsed || isMobile) && proyekSubmenuOpen && (
                <div
                  style={{
                    paddingLeft: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    borderLeft: '2px solid #E5E7EB',
                    marginLeft: '20px',
                    marginTop: '2px',
                    marginBottom: '4px',
                  }}
                >
                  {[
                    { label: t('nav.f_semua'), filter: 'Semua Proyek', count: totalProjects },
                    { label: t('nav.f_draft'), filter: 'Draft', count: draftCount },
                    { label: t('nav.f_aktif'), filter: 'Sedang Dikerjakan', count: inProgressCount },
                    { label: t('nav.f_selesai'), filter: 'Selesai', count: completedCount },
                    { label: t('nav.f_arsip'), filter: 'Arsip', count: archivedCount },
                  ].map((sub) => {
                    const isSubActive = activeMenu === 'proyek' && projectFilter === sub.filter;
                    return (
                      <button
                        key={sub.filter}
                        type="button"
                        onClick={() => {
                          onSelectProjectFilter(sub.filter);
                          onSelectMenu('proyek', null);
                        }}
                        style={{
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: isSubActive ? 650 : 500,
                          color: isSubActive ? '#2563EB' : '#64748B',
                          background: isSubActive ? '#EFF6FF' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>{sub.label}</span>
                        {sub.count > 0 && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 650,
                              padding: '0 5px',
                              borderRadius: '999px',
                              background: isSubActive ? '#DBEAFE' : '#F1F5F9',
                              color: isSubActive ? '#1D4ED8' : '#94A3B8',
                            }}
                          >
                            {sub.count}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />

                  {/* Integrated Volume & QTO */}
                  <button
                    type="button"
                    onClick={() => onSelectMenu('qto')}
                    style={{
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: activeMenu === 'qto' ? 650 : 500,
                      color: activeMenu === 'qto' ? '#2563EB' : '#64748B',
                      background: activeMenu === 'qto' ? '#EFF6FF' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Ruler size={13} color={activeMenu === 'qto' ? '#2563EB' : '#94A3B8'} />
                    <span>Volume & QTO</span>
                  </button>

                  {/* Integrated Jadwal & Manajemen Proyek */}
                  <button
                    type="button"
                    onClick={() => onSelectMenu('manajemen-proyek')}
                    style={{
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: activeMenu === 'manajemen-proyek' ? 650 : 500,
                      color: activeMenu === 'manajemen-proyek' ? '#2563EB' : '#64748B',
                      background: activeMenu === 'manajemen-proyek' ? '#EFF6FF' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Calendar size={13} color={activeMenu === 'manajemen-proyek' ? '#2563EB' : '#94A3B8'} />
                    <span>Jadwal & Manajemen</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Volume Calculation with Expandable Submenu */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div
                style={{
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                  padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: isVolumeActive ? 650 : 500,
                  color: isVolumeActive ? '#2563EB' : '#475569',
                  background: isVolumeActive && !volumeSubmenuOpen ? '#EFF6FF' : hoveredItemId === 'volume-parent' ? '#F8FAFC' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.volume_kalkulator'), 'volume-parent')}
                onMouseLeave={handleMouseLeaveItem}
              >
                <div
                  onClick={() => onSelectMenu('qto-vc')}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, height: '100%' }}
                >
                  <Calculator size={18} color={isVolumeActive ? '#2563EB' : '#64748B'} />
                  {(!sidebarCollapsed || isMobile) && <span>{t('nav.volume_kalkulator')}</span>}
                </div>

                {(!sidebarCollapsed || isMobile) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVolumeSubmenuOpen(!volumeSubmenuOpen);
                    }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px', display: 'flex' }}
                    title="Buka/Tutup Submenu Volume Calculation"
                    aria-label="Buka/Tutup Submenu Volume Calculation"
                  >
                    <ChevronDown
                      size={14}
                      style={{
                        transform: volumeSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>
                )}
              </div>

              {/* Sub-items Volume Calculation */}
              {(!sidebarCollapsed || isMobile) && volumeSubmenuOpen && (
                <div
                  style={{
                    paddingLeft: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    borderLeft: '2px solid #E5E7EB',
                    marginLeft: '20px',
                    marginTop: '2px',
                    marginBottom: '4px',
                  }}
                >
                  {volumeSubItems.map((sub) => {
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
                          background: isSubActive ? '#EFF6FF' : 'transparent',
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

            {/* 4. RAB & Estimasi with Expandable Submenu */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div
                style={{
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                  padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: isRabActive ? 650 : 500,
                  color: isRabActive ? '#2563EB' : '#475569',
                  background: isRabActive && !rabSubmenuOpen ? '#EFF6FF' : hoveredItemId === 'rab-parent' ? '#F8FAFC' : 'transparent',
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
                  <Coins size={18} color={isRabActive ? '#2563EB' : '#64748B'} />
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
                    borderLeft: '2px solid #E5E7EB',
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
                          background: isSubActive ? '#EFF6FF' : 'transparent',
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
                  {item.id === 'ded-rab' && (!sidebarCollapsed || isMobile) && (
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 3px 12px' }}>
                      AI TOOLS
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
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'space-between',
                    padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: active ? 650 : 500,
                    color: active ? '#2563EB' : '#475569',
                    background: active ? '#EFF6FF' : hoveredItemId === item.id ? '#F8FAFC' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <IconComp size={18} color={active ? '#2563EB' : '#64748B'} />
                    {(!sidebarCollapsed || isMobile) && <span>{item.label}</span>}
                  </div>

                  {(!sidebarCollapsed || isMobile) && item.badge && (
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background:
                          item.badgeType === 'primary'
                            ? active
                              ? '#2563EB'
                              : '#EFF6FF'
                            : item.badgeType === 'success'
                            ? '#DCFCE7'
                            : '#F1F5F9',
                        color:
                          item.badgeType === 'primary'
                            ? active
                              ? '#FFFFFF'
                              : '#2563EB'
                            : item.badgeType === 'success'
                            ? '#15803D'
                            : '#64748B',
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
                        height: '40px',
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
                            ? '#EFF6FF'
                            : hoveredItemId === 'database-parent'
                            ? '#F8FAFC'
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
                        <Database size={18} color={isDatabaseActive ? '#2563EB' : '#64748B'} />
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
                                background: isSubActive ? '#EFF6FF' : 'transparent',
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
            <div style={{ height: '1px', background: '#E5E7EB', margin: '8px 4px' }} />

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
                height: '40px',
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
                    ? '#EFF6FF'
                    : hoveredItemId === 'pengaturan'
                    ? '#F8FAFC'
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
                size={18}
                color={activeMenu === 'pengaturan' || activeMenu === 'subscription' ? '#2563EB' : '#64748B'}
              />
              {(!sidebarCollapsed || isMobile) && <span>{t('nav.pengaturan')}</span>}
            </button>
          </nav>
        </div>

        {/* =========================================================================
            BOTTOM: USER PROFILE & LOGOUT
           ========================================================================= */}
        <div
          style={{
            padding: sidebarCollapsed && !isMobile ? '10px 8px' : '12px 14px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
            background: '#FFFFFF',
          }}
        >
          {(!sidebarCollapsed || isMobile) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '4px 6px',
                borderRadius: '8px',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                  flexShrink: 0,
                }}
              >
                <UserIcon size={16} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 650,
                    color: '#0F172A',
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
                    color: '#64748B',
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

          {/* Logout button */}
          <button
            type="button"
            onClick={() => {
              if (onBackToLanding) {
                if (window.confirm('Apakah Anda yakin ingin keluar ke halaman beranda?')) {
                  onBackToLanding();
                }
              }
            }}
            onMouseEnter={(e) => handleMouseEnterItem(e, 'Keluar / Beranda', 'logout')}
            onMouseLeave={handleMouseLeaveItem}
            title={t('nav.back_landing')}
            aria-label={t('nav.back_landing')}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: '8px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#64748B',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed && !isMobile ? 'center' : 'flex-start',
              padding: sidebarCollapsed && !isMobile ? '0' : '0 12px',
              gap: '10px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <LogOut size={16} />
            {(!sidebarCollapsed || isMobile) && <span>Keluar / Beranda</span>}
          </button>
        </div>
      </aside>

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
