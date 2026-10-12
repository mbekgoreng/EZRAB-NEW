import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import './menu-animations.css';
import './premium-frame.css';
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
  Search,
  LifeBuoy,
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

type FlyoutKey = 'proyek' | 'volume' | 'rab' | 'database';
type AnchorKey = FlyoutKey | 'picker';

interface RailDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
  ai?: boolean;
  active: boolean;
  onClick: () => void;
  anchor?: AnchorKey;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeMenu,
  onSelectMenu,
  sidebarCollapsed: _sidebarCollapsed,
  onToggleCollapse: _onToggleCollapse,
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
  // Submenu open states — reused by mobile drawer expandable groups
  const [proyekSubmenuOpen, setProyekSubmenuOpen] = useState(true);
  const [volumeSubmenuOpen, setVolumeSubmenuOpen] = useState(true);
  const [rabSubmenuOpen, setRabSubmenuOpen] = useState(true);
  const [databaseSubmenuOpen, setDatabaseSubmenuOpen] = useState(true);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  // Desktop flyout: only one open at a time ('picker' shares the anchor slot)
  const [openFlyout, setOpenFlyout] = useState<FlyoutKey | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; label: string } | null>(null);

  // Refs for white-pill + flyout positioning (absolute, relative to the rail)
  const railRef = useRef<HTMLElement | null>(null);
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const [pillGeom, setPillGeom] = useState<{ top: number; height: number } | null>(null);
  const [flyoutTop, setFlyoutTop] = useState<number | null>(null);

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
  const isAhspActive =
    activeMenu === 'ahsp-2026' || activeMenu === 'ahsp' || activeMenu === 'analisa-ahsp';

  // Counts for Project Statuses
  const totalProjects = projects.length;
  const draftCount = projects.filter((p) => p.status === 'draft' || !p.status || p.status === 'DRAFT').length;
  const inProgressCount = projects.filter((p) => p.status === 'in_progress').length;
  const completedCount = projects.filter(
    (p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED'
  ).length;
  const archivedCount = projects.filter((p) => p.status === 'archived' || p.isArchived).length;

  const proyekFilters = [
    { label: t('nav.f_semua'), filter: 'Semua Proyek', count: totalProjects },
    { label: t('nav.f_draft'), filter: 'Draft', count: draftCount },
    { label: t('nav.f_aktif'), filter: 'Sedang Dikerjakan', count: inProgressCount },
    { label: t('nav.f_selesai'), filter: 'Selesai', count: completedCount },
    { label: t('nav.f_arsip'), filter: 'Arsip', count: archivedCount },
  ];

  const handleMouseEnterItem = (e: { currentTarget: HTMLElement }, label: string) => {
    if (isMobile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ top: rect.top + rect.height / 2, label });
  };

  const handleMouseLeaveItem = () => {
    setTooltipPos(null);
  };

  const isItemActive = (item: NavItemDef): boolean => {
    if (item.matchMenu) return item.matchMenu(activeMenu);
    return activeMenu === item.id;
  };

  // Search button: dispatch a synthetic keydown so the existing global TopBar
  // search (which listens for ctrl/meta+K on document) focuses.
  const handleSearchClick = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  };

  const mainNavItems: NavItemDef[] = [
    {
      id: 'dashboard',
      label: t('nav.home'),
      icon: LayoutDashboard,
    },
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

  const findNav = (id: string): NavItemDef => mainNavItems.find((i) => i.id === id) as NavItemDef;

  const logoClickHandler = () => {
    if (isMobile) onCloseMobileDrawer();
    if (onBackToLanding) onBackToLanding();
  };

  const toggleFlyout = (key: FlyoutKey) => {
    setProjectPickerOpen(false);
    setOpenFlyout((prev) => (prev === key ? null : key));
  };

  const openProjectPicker = () => {
    setOpenFlyout(null);
    setProjectPickerOpen((v) => !v);
  };

  /* ---------------- Rail item definitions (keeps existing order & menu ids) ---------------- */
  const railGroups: RailDef[][] = [
    [
      {
        key: 'dashboard',
        label: t('nav.home'),
        icon: LayoutDashboard,
        active: activeMenu === 'dashboard',
        onClick: () => onSelectMenu('dashboard'),
      },
    ],
    [
      {
        key: 'proyek',
        label: t('nav.proyek'),
        icon: FolderKanban,
        active: activeMenu === 'proyek',
        anchor: 'proyek',
        onClick: () => {
          onSelectProjectFilter('Semua Proyek');
          onSelectMenu('proyek', null);
          toggleFlyout('proyek');
        },
      },
      {
        key: 'volume',
        label: t('nav.volume_kalkulator'),
        icon: Calculator,
        active: isVolumeActive,
        anchor: 'volume',
        onClick: () => {
          onSelectMenu('qto-vc');
          toggleFlyout('volume');
        },
      },
      {
        key: 'rab',
        label: t('nav.rab_estimasi'),
        icon: Coins,
        active: isRabActive,
        anchor: 'rab',
        onClick: () => {
          onSelectMenu('rab-spreadsheet');
          toggleFlyout('rab');
        },
      },
      {
        key: 'manajemen',
        label: t('nav.manajemen_proyek'),
        icon: Calendar,
        active: activeMenu === 'manajemen-proyek',
        onClick: () => onSelectMenu('manajemen-proyek'),
      },
    ],
    [
      {
        key: 'laporan',
        label: t('nav.laporan'),
        icon: FileText,
        active: isItemActive(findNav('laporan')),
        onClick: () => onSelectMenu('laporan'),
      },
      {
        key: 'ahsp',
        label: t('nav.ahsp') + ' 2026',
        icon: Database,
        active: isAhspActive,
        onClick: () => onSelectMenu('ahsp-2026'),
      },
      {
        key: 'qto',
        label: t('nav.rekap_qto'),
        icon: Ruler,
        active: activeMenu === 'qto' || activeMenu === 'qto-rekap',
        onClick: () => onSelectMenu('qto'),
      },
    ],
    [
      {
        key: 'ezrab-ai',
        label: t('nav.chat_ai'),
        icon: Sparkles,
        ai: true,
        active: isItemActive(findNav('ezrab-ai')),
        onClick: () => onSelectMenu('ezrab-ai'),
      },
      {
        key: 'ded-ai',
        label: t('nav.ded_ai'),
        icon: FileCheck,
        ai: true,
        active: isItemActive(findNav('ded-ai')),
        onClick: () => onSelectMenu('ded-ai'),
      },
      {
        key: 'dokumen-ai',
        label: t('nav.doc_ai'),
        icon: FileText,
        ai: true,
        active: isItemActive(findNav('dokumen-ai')),
        onClick: () => onSelectMenu('dokumen-ai'),
      },
    ],
    [
      {
        key: 'template-rab',
        label: t('nav.template_rab'),
        icon: Layers,
        active: isItemActive(findNav('template-rab')),
        onClick: () => onSelectMenu('template-rab'),
      },
      {
        key: 'database',
        label: t('nav.database'),
        icon: Database,
        active: isDatabaseActive && !isAhspActive,
        anchor: 'database',
        onClick: () => {
          onSelectMenu('database-material');
          toggleFlyout('database');
        },
      },
      {
        key: 'dokumen-tender',
        label: t('nav.dokumen_proyek'),
        icon: Files,
        active: isItemActive(findNav('dokumen-tender')),
        onClick: () => onSelectMenu('dokumen-tender'),
      },
      {
        key: 'keuangan',
        label: t('nav.keuangan_proyek'),
        icon: Receipt,
        active: isItemActive(findNav('keuangan-proyek')),
        onClick: () => onSelectMenu('keuangan-proyek'),
      },
    ],
    [
      {
        key: 'pengaturan',
        label: t('nav.pengaturan'),
        icon: Settings,
        active: activeMenu === 'pengaturan' || activeMenu === 'subscription',
        onClick: () => onSelectMenu('pengaturan'),
      },
    ],
  ];

  const allRailDefs: RailDef[] = railGroups.flat();
  const activePillKey = allRailDefs.find((d) => d.active)?.key ?? null;

  /* -------- White pill + flyout geometry (absolute, relative to the rail) --------
     The pill lives OUTSIDE the scroll column so overflow-y:auto can never clip it. */
  const updatePositions = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const rr = rail.getBoundingClientRect();

    // Pill tracks the active button.
    const pBtn = activePillKey ? btnRefs.current.get(activePillKey) : undefined;
    if (pBtn) {
      const br = pBtn.getBoundingClientRect();
      setPillGeom({ top: br.top - rr.top, height: br.height });
    } else {
      setPillGeom(null);
    }

    // Flyout tracks the anchor button, vertically centered then clamped.
    // Two-pass: on the first pass the flyout isn't in the DOM yet, so we
    // position with an estimated height; the refinement effect below re-clamps
    // with the real height once rendered.
    const anchorKey: AnchorKey | null = openFlyout ?? (projectPickerOpen ? 'picker' : null);
    const aBtn = anchorKey ? btnRefs.current.get(anchorKey) : undefined;
    if (aBtn) {
      const br = aBtn.getBoundingClientRect();
      let top = br.top - rr.top + br.height / 2;
      const fh = flyoutRef.current?.offsetHeight || 300;
      const minTop = fh / 2 + 12;
      const maxTop = window.innerHeight - rr.top - fh / 2 - 12;
      top = Math.min(Math.max(top, minTop), Math.max(maxTop, minTop));
      setFlyoutTop(top);
    } else {
      setFlyoutTop(null);
    }
  }, [activePillKey, openFlyout, projectPickerOpen, projects.length]);

  // Re-clamp the flyout with its real measured height after it renders.
  useLayoutEffect(() => {
    if (flyoutTop === null) return;
    const rail = railRef.current;
    const fly = flyoutRef.current;
    if (!rail || !fly) return;
    const fh = fly.offsetHeight;
    if (!fh) return;
    const rr = rail.getBoundingClientRect();
    const anchorKey: AnchorKey | null = openFlyout ?? (projectPickerOpen ? 'picker' : null);
    const aBtn = anchorKey ? btnRefs.current.get(anchorKey) : undefined;
    if (!aBtn) return;
    const br = aBtn.getBoundingClientRect();
    let top = br.top - rr.top + br.height / 2;
    const minTop = fh / 2 + 12;
    const maxTop = window.innerHeight - rr.top - fh / 2 - 12;
    top = Math.min(Math.max(top, minTop), Math.max(maxTop, minTop));
    setFlyoutTop((prev) => (prev === top ? prev : top));
  });

  useLayoutEffect(() => {
    updatePositions();
    const nav = navScrollRef.current;
    nav?.addEventListener('scroll', updatePositions, { passive: true });
    window.addEventListener('resize', updatePositions);
    return () => {
      nav?.removeEventListener('scroll', updatePositions);
      window.removeEventListener('resize', updatePositions);
    };
  }, [updatePositions]);

  // Escape closes any flyout/picker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenFlyout(null);
        setProjectPickerOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const registerBtn = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) btnRefs.current.set(key, el);
    else btnRefs.current.delete(key);
  };

  const renderRailBtn = (def: RailDef) => (
    <button
      key={def.key}
      ref={registerBtn(def.anchor ?? def.key)}
      type="button"
      onClick={def.onClick}
      onMouseEnter={(e) => handleMouseEnterItem(e, def.label)}
      onMouseLeave={handleMouseLeaveItem}
      onFocus={(e) => handleMouseEnterItem(e, def.label)}
      onBlur={handleMouseLeaveItem}
      aria-label={def.label}
      aria-current={def.active ? 'page' : undefined}
      aria-expanded={def.anchor ? (openFlyout === def.anchor ? true : undefined) : undefined}
      className={`pf-rail-btn${def.active ? ' is-active' : ''}`}
    >
      <def.icon size={22} />
      {def.ai && <span className="pf-ai-dot" aria-hidden="true" />}
    </button>
  );

  /* ---------------- Desktop flyout panels (dark #141926) ---------------- */
  const renderFlyout = () => {
    const anchorKey: AnchorKey | null = openFlyout ?? (projectPickerOpen ? 'picker' : null);
    if (!anchorKey || flyoutTop === null) return null;

    const flyoutProps = {
      ref: flyoutRef,
      className: 'pf-flyout',
      style: { top: flyoutTop },
      role: 'menu' as const,
    };

    if (anchorKey === 'picker') {
      return (
        <div {...flyoutProps} aria-label={t('nav.proyek')}>
          <div className="pf-flyout-title">
            {t('nav.proyek')} ({projects.length})
          </div>
          {projects.map((proj) => {
            const isSelected = currentProject?.id === proj.id;
            return (
              <button
                key={proj.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectProjectFilter('Semua Proyek');
                  onSelectMenu('proyek', proj.id);
                  setProjectPickerOpen(false);
                }}
                className={`pf-flyout-row${isSelected ? ' is-active' : ''}`}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {proj.name}
                </span>
                {isSelected && <Check size={14} />}
              </button>
            );
          })}
          <div className="pf-flyout-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMenu('proyek');
              setProjectPickerOpen(false);
            }}
            className="pf-flyout-row"
          >
            <Plus size={15} />
            <span>+ {t('nav.buat_proyek')}</span>
          </button>
        </div>
      );
    }

    if (anchorKey === 'proyek') {
      return (
        <div {...flyoutProps} aria-label={t('nav.proyek')}>
          <div className="pf-flyout-title">{t('nav.proyek')}</div>
          {proyekFilters.map((f) => {
            const isSelected = activeMenu === 'proyek' && projectFilter === f.filter;
            return (
              <button
                key={f.filter}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectProjectFilter(f.filter);
                  onSelectMenu('proyek', null);
                  setOpenFlyout(null);
                }}
                className={`pf-flyout-row${isSelected ? ' is-active' : ''}`}
              >
                <span style={{ flex: 1 }}>{f.label}</span>
                {f.count > 0 && <span className="pf-flyout-count">{f.count}</span>}
              </button>
            );
          })}
          <div className="pf-flyout-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMenu('qto');
              setOpenFlyout(null);
            }}
            className="pf-flyout-row"
          >
            <Ruler size={15} />
            <span>Volume & QTO</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMenu('manajemen-proyek');
              setOpenFlyout(null);
            }}
            className="pf-flyout-row"
          >
            <Calendar size={15} />
            <span>Jadwal & Manajemen</span>
          </button>
        </div>
      );
    }

    if (anchorKey === 'volume') {
      return (
        <div {...flyoutProps} aria-label={t('nav.volume_kalkulator')}>
          <div className="pf-flyout-title">{t('nav.volume_kalkulator')}</div>
          {volumeSubItems.map((sub) => (
            <button
              key={sub.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelectMenu(sub.id);
                setOpenFlyout(null);
              }}
              className={`pf-flyout-row${sub.match(activeMenu) ? ' is-active' : ''}`}
            >
              <sub.icon size={15} />
              <span style={{ flex: 1 }}>{sub.label}</span>
            </button>
          ))}
        </div>
      );
    }

    if (anchorKey === 'rab') {
      return (
        <div {...flyoutProps} aria-label={t('nav.rab_estimasi')}>
          <div className="pf-flyout-title">{t('nav.rab_estimasi')}</div>
          {rabSubItems.map((sub) => (
            <button
              key={sub.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelectMenu(sub.id);
                setOpenFlyout(null);
              }}
              className={`pf-flyout-row${sub.match(activeMenu) ? ' is-active' : ''}`}
            >
              <sub.icon size={15} />
              <span style={{ flex: 1 }}>{sub.label}</span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <div {...flyoutProps} aria-label={t('nav.database')}>
        <div className="pf-flyout-title">{t('nav.database')}</div>
        {databaseSubItems.map((sub) => (
          <button
            key={sub.id}
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMenu(sub.id);
              setOpenFlyout(null);
            }}
            className={`pf-flyout-row${sub.match(activeMenu) ? ' is-active' : ''}`}
          >
            <sub.icon size={15} />
            <span style={{ flex: 1 }}>{sub.label}</span>
          </button>
        ))}
      </div>
    );
  };

  /* ---------------- Desktop rail render ---------------- */
  if (!isMobile) {
    return (
      <>
        <aside ref={railRef} className="pf-rail" aria-label="Navigasi utama EZRAB">
          <div
            className="pf-rail-logo"
            onClick={logoClickHandler}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') logoClickHandler();
            }}
            role="button"
            tabIndex={0}
            title={`EZRAB — ${t('nav.back_landing')}`}
            aria-label={`EZRAB — ${t('nav.back_landing')}`}
          >
            <img src="/images/ez-logo.png" alt="EZRAB" style={{ height: 26, width: 'auto', display: 'block' }} />
          </div>

          <div className="pf-rail-scroll" ref={navScrollRef}>
            <button
              ref={registerBtn('search')}
              type="button"
              onClick={handleSearchClick}
              onMouseEnter={(e) => handleMouseEnterItem(e, `${t('common.cari')} (Ctrl+K)`)}
              onMouseLeave={handleMouseLeaveItem}
              onFocus={(e) => handleMouseEnterItem(e, `${t('common.cari')} (Ctrl+K)`)}
              onBlur={handleMouseLeaveItem}
              aria-label={`${t('common.cari')} (Ctrl+K)`}
              className="pf-rail-btn"
            >
              <Search size={20} />
            </button>
            <button
              ref={registerBtn('picker')}
              type="button"
              onClick={openProjectPicker}
              onMouseEnter={(e) => handleMouseEnterItem(e, t('nav.proyek'))}
              onMouseLeave={handleMouseLeaveItem}
              onFocus={(e) => handleMouseEnterItem(e, t('nav.proyek'))}
              onBlur={handleMouseLeaveItem}
              aria-label={t('nav.proyek')}
              aria-expanded={projectPickerOpen || undefined}
              className="pf-rail-btn"
            >
              <Building2 size={20} />
            </button>

            {railGroups.map((group, gi) => (
              <React.Fragment key={gi}>
                <div className="pf-rail-divider" aria-hidden="true" />
                {group.map(renderRailBtn)}
              </React.Fragment>
            ))}
          </div>

          <div className="pf-rail-bottom">
            <div className="pf-rail-divider" aria-hidden="true" />
            <button
              ref={registerBtn('bantuan')}
              type="button"
              onClick={() => {
                if (onOpenSettingsTab) onOpenSettingsTab('help');
                else onSelectMenu('pengaturan');
              }}
              onMouseEnter={(e) => handleMouseEnterItem(e, 'Bantuan')}
              onMouseLeave={handleMouseLeaveItem}
              onFocus={(e) => handleMouseEnterItem(e, 'Bantuan')}
              onBlur={handleMouseLeaveItem}
              aria-label="Bantuan"
              className="pf-rail-btn"
            >
              <LifeBuoy size={20} />
            </button>
            <button
              ref={registerBtn('profil')}
              type="button"
              onClick={() => onSelectMenu('pengaturan')}
              onMouseEnter={(e) => handleMouseEnterItem(e, 'Profil')}
              onMouseLeave={handleMouseLeaveItem}
              onFocus={(e) => handleMouseEnterItem(e, 'Profil')}
              onBlur={handleMouseLeaveItem}
              aria-label="Profil"
              className="pf-rail-btn"
            >
              <UserIcon size={20} />
            </button>
            <button
              ref={registerBtn('keluar')}
              type="button"
              onClick={() => {
                if (window.confirm('Apakah Anda yakin ingin keluar ke halaman beranda?')) {
                  onCloseMobileDrawer();
                  onBackToLanding?.();
                }
              }}
              onMouseEnter={(e) => handleMouseEnterItem(e, 'Keluar')}
              onMouseLeave={handleMouseLeaveItem}
              onFocus={(e) => handleMouseEnterItem(e, 'Keluar')}
              onBlur={handleMouseLeaveItem}
              aria-label="Keluar"
              className="pf-rail-btn"
            >
              <LogOut size={20} />
            </button>
          </div>

          {/* White active capsule — outside the scroll column, never clipped */}
          {pillGeom && (
            <span
              className="pf-pill"
              aria-hidden="true"
              style={{ top: pillGeom.top + 7, height: pillGeom.height - 14 }}
            />
          )}

          {renderFlyout()}
        </aside>

        {tooltipPos && (
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: 84,
              top: tooltipPos.top,
              transform: 'translateY(-50%)',
              background: '#141926',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f1f5f9',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 10px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
              zIndex: 10000,
              pointerEvents: 'none',
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
            }}
          >
            {tooltipPos.label}
          </div>
        )}
      </>
    );
  }

  /* ---------------- Mobile drawer render ---------------- */
  const drawerRow = (
    key: string,
    label: string,
    Icon: React.ComponentType<{ size?: number; color?: string; className?: string }>,
    active: boolean,
    onClick: () => void,
    ai?: boolean
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`pf-drawer-row${active ? ' is-active' : ''}`}
    >
      <Icon size={19} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {ai && <span className="pf-ai-dot" style={{ position: 'static', boxShadow: 'none' }} aria-hidden="true" />}
    </button>
  );

  const drawerSub = (
    subs: { id: string; label: string; icon: React.ComponentType<{ size?: number }> }[],
    activeCheck: (id: string) => boolean
  ) => (
    <div className="pf-drawer-sub">
      {subs.map((sub) => {
        const active = activeCheck(sub.id);
        return (
          <button
            key={sub.id}
            type="button"
            onClick={() => onSelectMenu(sub.id)}
            aria-label={sub.label}
            aria-current={active ? 'page' : undefined}
            className={`pf-drawer-row${active ? ' is-active' : ''}`}
          >
            <sub.icon size={17} />
            <span style={{ flex: 1 }}>{sub.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <aside
        className={`pf-drawer${mobileDrawerOpen ? ' open' : ''}`}
        aria-label="Navigasi EZRAB"
        aria-hidden={!mobileDrawerOpen}
        inert={!mobileDrawerOpen}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 8px',
            flex: '0 0 auto',
          }}
        >
          <div onClick={logoClickHandler} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <img src="/images/ez-logo.png" alt="EZRAB" style={{ height: 30, width: 'auto', display: 'block' }} />
          </div>
          <button
            type="button"
            onClick={onCloseMobileDrawer}
            aria-label={t('common.tutup')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#9aa4b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="pf-drawer-scroll">
          {/* Project picker (expandable) */}
          <button
            type="button"
            onClick={() => setProjectPickerOpen((v) => !v)}
            aria-expanded={projectPickerOpen}
            className="pf-drawer-row"
          >
            <Building2 size={19} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentProject?.name || t('nav.proyek')}
            </span>
            <ChevronDown
              size={15}
              style={{
                transform: projectPickerOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
                flexShrink: 0,
              }}
            />
          </button>
          {projectPickerOpen && (
            <div className="pf-drawer-sub">
              {projects.map((proj) => {
                const isSelected = currentProject?.id === proj.id;
                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => {
                      onSelectProjectFilter('Semua Proyek');
                      onSelectMenu('proyek', proj.id);
                      setProjectPickerOpen(false);
                    }}
                    className={`pf-drawer-row${isSelected ? ' is-active' : ''}`}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proj.name}
                    </span>
                    {isSelected && <Check size={14} />}
                  </button>
                );
              })}
              <button type="button" onClick={() => onSelectMenu('proyek')} className="pf-drawer-row">
                <Plus size={16} />
                <span style={{ flex: 1 }}>+ {t('nav.buat_proyek')}</span>
              </button>
            </div>
          )}

          {/* Search */}
          <button type="button" onClick={handleSearchClick} className="pf-drawer-row">
            <Search size={19} />
            <span style={{ flex: 1 }}>{t('common.cari')}…</span>
            <kbd
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.08)',
                color: '#9aa4b8',
                fontFamily: 'inherit',
              }}
            >
              ⌘K
            </kbd>
          </button>

          <div className="pf-drawer-section">Menu</div>

          {drawerRow('dashboard', t('nav.home'), LayoutDashboard, activeMenu === 'dashboard', () =>
            onSelectMenu('dashboard')
          )}

          {/* Proyek group (expandable) */}
          <button
            type="button"
            onClick={() => {
              onSelectProjectFilter('Semua Proyek');
              onSelectMenu('proyek', null);
            }}
            aria-label={t('nav.proyek')}
            aria-current={activeMenu === 'proyek' ? 'page' : undefined}
            className={`pf-drawer-row${activeMenu === 'proyek' ? ' is-active' : ''}`}
          >
            <FolderKanban size={19} />
            <span style={{ flex: 1 }}>{t('nav.proyek')}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={proyekSubmenuOpen ? 'Tutup submenu' : 'Buka submenu'}
              aria-expanded={proyekSubmenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setProyekSubmenuOpen((v) => !v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  setProyekSubmenuOpen((v) => !v);
                }
              }}
              style={{ display: 'flex', padding: 4, cursor: 'pointer' }}
            >
              <ChevronDown
                size={15}
                style={{
                  transform: proyekSubmenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                }}
              />
            </span>
          </button>
          {proyekSubmenuOpen && (
            <div className="pf-drawer-sub">
              {proyekFilters.map((f) => {
                const isSelected = activeMenu === 'proyek' && projectFilter === f.filter;
                return (
                  <button
                    key={f.filter}
                    type="button"
                    onClick={() => {
                      onSelectProjectFilter(f.filter);
                      onSelectMenu('proyek', null);
                    }}
                    className={`pf-drawer-row${isSelected ? ' is-active' : ''}`}
                  >
                    <span style={{ flex: 1 }}>{f.label}</span>
                    {f.count > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 8px',
                          borderRadius: 999,
                          background: isSelected ? 'rgba(11,13,18,0.08)' : 'rgba(255,255,255,0.1)',
                          color: isSelected ? '#0f172a' : '#c7d0e0',
                        }}
                      >
                        {f.count}
                      </span>
                    )}
                  </button>
                );
              })}
              {drawerRow('qto', 'Volume & QTO', Ruler, activeMenu === 'qto', () => onSelectMenu('qto'))}
              {drawerRow('manajemen-proyek', 'Jadwal & Manajemen', Calendar, activeMenu === 'manajemen-proyek', () =>
                onSelectMenu('manajemen-proyek')
              )}
            </div>
          )}

          {/* Kalkulator Volume group (expandable) */}
          <button
            type="button"
            onClick={() => onSelectMenu('qto-vc')}
            aria-label={t('nav.volume_kalkulator')}
            aria-current={isVolumeActive ? 'page' : undefined}
            className={`pf-drawer-row${isVolumeActive ? ' is-active' : ''}`}
          >
            <Calculator size={19} />
            <span style={{ flex: 1 }}>{t('nav.volume_kalkulator')}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={volumeSubmenuOpen ? 'Tutup submenu' : 'Buka submenu'}
              aria-expanded={volumeSubmenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setVolumeSubmenuOpen((v) => !v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  setVolumeSubmenuOpen((v) => !v);
                }
              }}
              style={{ display: 'flex', padding: 4, cursor: 'pointer' }}
            >
              <ChevronDown
                size={15}
                style={{
                  transform: volumeSubmenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                }}
              />
            </span>
          </button>
          {volumeSubmenuOpen && drawerSub(volumeSubItems, (id) => volumeSubItems.find((s) => s.id === id)?.match(activeMenu) ?? false)}

          {/* RAB & Estimasi group (expandable) */}
          <button
            type="button"
            onClick={() => onSelectMenu('rab-spreadsheet')}
            aria-label={t('nav.rab_estimasi')}
            aria-current={isRabActive ? 'page' : undefined}
            className={`pf-drawer-row${isRabActive ? ' is-active' : ''}`}
          >
            <Coins size={19} />
            <span style={{ flex: 1 }}>{t('nav.rab_estimasi')}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={rabSubmenuOpen ? 'Tutup submenu' : 'Buka submenu'}
              aria-expanded={rabSubmenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setRabSubmenuOpen((v) => !v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  setRabSubmenuOpen((v) => !v);
                }
              }}
              style={{ display: 'flex', padding: 4, cursor: 'pointer' }}
            >
              <ChevronDown
                size={15}
                style={{
                  transform: rabSubmenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                }}
              />
            </span>
          </button>
          {rabSubmenuOpen && drawerSub(rabSubItems, (id) => rabSubItems.find((s) => s.id === id)?.match(activeMenu) ?? false)}

          {drawerRow('manajemen-proyek', t('nav.manajemen_proyek'), Calendar, activeMenu === 'manajemen-proyek', () =>
            onSelectMenu('manajemen-proyek')
          )}
          {drawerRow('laporan', t('nav.laporan'), FileText, isItemActive(findNav('laporan')), () =>
            onSelectMenu('laporan')
          )}
          {drawerRow('ahsp', t('nav.ahsp') + ' 2026', Database, isAhspActive, () => onSelectMenu('ahsp-2026'))}
          {drawerRow('qto', t('nav.rekap_qto'), Ruler, activeMenu === 'qto' || activeMenu === 'qto-rekap', () =>
            onSelectMenu('qto')
          )}

          <div className="pf-drawer-section">AI</div>
          {drawerRow('ezrab-ai', t('nav.chat_ai'), Sparkles, isItemActive(findNav('ezrab-ai')), () =>
            onSelectMenu('ezrab-ai'), true
          )}
          {drawerRow('ded-ai', t('nav.ded_ai'), FileCheck, isItemActive(findNav('ded-ai')), () =>
            onSelectMenu('ded-ai'), true
          )}
          {drawerRow('dokumen-ai', t('nav.doc_ai'), FileText, isItemActive(findNav('dokumen-ai')), () =>
            onSelectMenu('dokumen-ai'), true
          )}

          <div className="pf-drawer-section">Data</div>
          {drawerRow('template-rab', t('nav.template_rab'), Layers, isItemActive(findNav('template-rab')), () =>
            onSelectMenu('template-rab')
          )}

          {/* Database group (expandable) */}
          <button
            type="button"
            onClick={() => onSelectMenu('database-material')}
            aria-label={t('nav.database')}
            aria-current={isDatabaseActive && !isAhspActive ? 'page' : undefined}
            className={`pf-drawer-row${isDatabaseActive && !isAhspActive ? ' is-active' : ''}`}
          >
            <Database size={19} />
            <span style={{ flex: 1 }}>{t('nav.database')}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={databaseSubmenuOpen ? 'Tutup submenu' : 'Buka submenu'}
              aria-expanded={databaseSubmenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setDatabaseSubmenuOpen((v) => !v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  setDatabaseSubmenuOpen((v) => !v);
                }
              }}
              style={{ display: 'flex', padding: 4, cursor: 'pointer' }}
            >
              <ChevronDown
                size={15}
                style={{
                  transform: databaseSubmenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                }}
              />
            </span>
          </button>
          {databaseSubmenuOpen &&
            drawerSub(databaseSubItems, (id) => databaseSubItems.find((s) => s.id === id)?.match(activeMenu) ?? false)}

          {drawerRow('dokumen-tender', t('nav.dokumen_proyek'), Files, isItemActive(findNav('dokumen-tender')), () =>
            onSelectMenu('dokumen-tender')
          )}
          {drawerRow('keuangan', t('nav.keuangan_proyek'), Receipt, isItemActive(findNav('keuangan-proyek')), () =>
            onSelectMenu('keuangan-proyek')
          )}
          {drawerRow('pengaturan', t('nav.pengaturan'), Settings, activeMenu === 'pengaturan' || activeMenu === 'subscription', () =>
            onSelectMenu('pengaturan')
          )}
        </div>

        <div style={{ flex: '0 0 auto', padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            type="button"
            onClick={() => {
              if (onOpenSettingsTab) onOpenSettingsTab('help');
              else onSelectMenu('pengaturan');
            }}
            className="pf-drawer-row"
          >
            <LifeBuoy size={19} />
            <span style={{ flex: 1 }}>Bantuan</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Apakah Anda yakin ingin keluar ke halaman beranda?')) {
                onCloseMobileDrawer();
                onBackToLanding?.();
              }
            }}
            className="pf-drawer-row"
          >
            <LogOut size={19} />
            <span style={{ flex: 1 }}>Keluar</span>
          </button>
        </div>
      </aside>
    </>
  );
};
