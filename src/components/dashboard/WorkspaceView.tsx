import React, { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react';
import {
  LayoutDashboard,
  FolderGit2,
  Calculator,
  FolderKanban,
  FileText,
  Database,
  Ruler,
  Settings,
  Search,
  Bell,
  Moon,
  Plus,
  ArrowLeft,
  ChevronDown,
  Sparkles,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Image as ImageIcon,
  MapPin,
  TrendingUp,
  Target,
  FileUp,
  BookOpen,
  LineChart,
  HardHat,
  Share2,
  Compass,
  Wrench,
  Building,
  X,
  Clock,
  Layers,
  Menu,
} from 'lucide-react';
import { Project, RabItem } from '../../types';
import { EzrabAiView } from '../../ai-tools/ezrab-ai/view';
// Chat-to-RAB Workspace (Fase 3): lazy agar three.js/studio tidak memuat awal.
const ChatToRabWorkspaceLazy = lazy(() =>
  import('../../ai-design/ChatToRabWorkspace').then(m => ({ default: m.ChatToRabWorkspace })),
);
import { DedAiEstimateView } from '../../ai-tools/ded-ai-estimate/view';
import { DokumenAiView } from '../../ai-tools/document-ai/view';
import { exportItemAmount } from '../../export/priceIntegrity';
import { CreditPage } from '../../ai-credits/CreditPage';
import '../../ai-credits/ai-credits.css';
import { MagicAiSuperView } from '../magic-ai/MagicAiSuperView';

import { ProjectsView } from '../projects/ProjectsView';
import { FirstProjectChecklist } from '../onboarding/FirstProjectChecklist';
import { RabEstimasiView } from '../rab/RabEstimasiView';
import { ManajemenProyekView } from '../management/ManajemenProyekView';
// AHSP explorer lazy (F-12): data kanonis ±19 MB tidak ikut bundle awal,
// mengikuti pola ChatToRabWorkspaceLazy di bawah.
const AhspExplorerViewLazy = lazy(() =>
  import('../ahsp/AhspExplorerView').then(m => ({ default: m.AhspExplorerView })),
);
import { DaftarPekerjaanView } from '../workItems/DaftarPekerjaanView';
import { QtoCalculatorView } from '../qto/QtoCalculatorView';
import { QtoRekapVolumeView } from '../qto/QtoRekapVolumeView';
import { LaporanView } from '../reports/LaporanView';
import { PengaturanView } from '../settings/PengaturanView';
import { PricesExplorerView } from '../database/PricesExplorerView';
import { ResourceLibraryView } from '../resources/ResourceLibraryView';
import { DashboardViewSwitcher } from './DashboardViewSwitcher';
import { PricingSection } from '../landing/PricingSection';
import { EzrabAiAssistantFullView } from '../copilot/EzrabAiAssistantFullView';
import { EzrabCoAssistantChatbox, ChatboxDisplayMode } from '../copilot/EzrabCoAssistantChatbox';
import { EzrabCoAssistantLauncher } from '../copilot/EzrabCoAssistantLauncher';
import { coAssistantService } from '../../services/coAssistantService';

import { Bot, MessageSquare } from 'lucide-react';
import {
  Folder,
  Box,
  Coins,
  Tag,
  HelpCircle,
  Sun,
  Package,
  FileCheck,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  User as UserIcon,
  CreditCard,
  Calendar,
  Layers3,
} from 'lucide-react';

import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n';
import { routeLabel, type WorkspaceRoute } from '../../routing/routes';
import { openEzrabAI } from '../../ai-tools/aiNavigation';
import '../layout/menu-animations.css';
import '../layout/premium-frame.css';
import '../../styles/dashboard-refined.css';
import '../../styles/workspace-mobile-fixes.css';
import { UnifiedBreadcrumb } from '../navigation/UnifiedBreadcrumb';
import { TopBar } from '../navigation/TopBar';
import { TemplateRabCatalogView } from '../templates/TemplateRabCatalogView';
import { HouseTypeCatalogItem } from '../../data/houseTypeCatalog';
import { RabTemplateService } from '../../services/rabTemplateService';
import { templateCategoryToBuildingType } from '../../services/rabTemplateCatalogAdapter';
import { RabTemplate } from '../../types/rabTemplate';
import { CreateProjectModal } from '../projects/CreateProjectModal';
import { TenderDocumentsView } from '../document/TenderDocumentsView';
import { BlogAdminPage } from '../../blog/cms/BlogAdminPage';
import { Sidebar } from '../layout/Sidebar';
import { EnterpriseEntryPage } from '../enterprise/EnterpriseEntryPage';
import { ProjectFinanceView } from '../finance/ProjectFinanceView';
import { MaterialDatabaseView } from '../materials/MaterialDatabaseView';

interface WorkspaceViewProps {
  onBackToLanding?: () => void;
  route: WorkspaceRoute;
  onNavigateMenu: (menu: string, projectId?: string | null) => void;
}


/** Waktu relatif Bahasa Indonesia untuk feed aktivitas (dari timestamp nyata). */
const formatRelativeId = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Kemarin';
  if (days < 30) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ onBackToLanding, route, onNavigateMenu }) => {
  // Navigation active tab (Default: 'dashboard' as requested)
  const [activeMenu, setActiveMenuState] = useState<string>(route.menu);
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useI18n();

  // Project status filter ('Semua Proyek', 'Draft', 'Sedang Dikerjakan', 'Selesai', 'Arsip')
  const [projectFilter, setProjectFilter] = useState<string>('Semua Proyek');

  // Sidebar Layout State (collapsible to 72px)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Grouped Submenu Expand/Collapse States
  const [proyekSubmenuOpen, setProyekSubmenuOpen] = useState(true);
  const [pengaturanSubmenuOpen, setPengaturanSubmenuOpen] = useState(false);
  const [pengaturanActiveTab, setPengaturanActiveTab] = useState<string>('profile');
  /** Paket yang dipilih user di halaman Subscription (status jujur di tempat,
   * tanpa navigasi menyesatkan — pembayaran memang belum tersedia). */
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [workspaceSubmenuOpen, setWorkspaceSubmenuOpen] = useState(true);
  const [estimasiSubmenuOpen, setEstimasiSubmenuOpen] = useState(true);
  const [dataMasterLaporanOpen, setDataMasterLaporanOpen] = useState(true);
  const [accountSubmenuOpen, setAccountSubmenuOpen] = useState(false);

  // Calculator Navigation States
  const [activeCalcId, setActiveCalcId] = useState('BOWPLANK');
  const [activeCalcQtoId, setActiveCalcQtoId] = useState<string | null>(null);

  const [coAssistantMode, setCoAssistantMode] = useState<ChatboxDisplayMode>('closed');



  // Project Context Central State
  const {
    projects,
    currentProject,
    currentProjectId,
    setCurrentProjectId,
    createProject,
    resetAllProductionData,
    projectRabItems,
    projectQtoItems,
    projectScheduleTasks,
    projectKurvaSData,
    createRabItemDirect,
    bulkAddRabItems,
  } = useProject();

  // Mobile Navigation & Viewport State
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [isNarrowMobile, setIsNarrowMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      const narrow = window.innerWidth < 768;
      setIsMobile(mobile);
      setIsNarrowMobile(narrow);
      if (!mobile) {
        setMobileDrawerOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Browser URL is authoritative for module and project context. The menu remains a
  // presentation state only; every user navigation is mirrored into browser history.
  const setActiveMenu = useCallback((menu: string, projectId: string | null = currentProjectId) => {
    setActiveMenuState(menu);
    setMobileDrawerOpen(false);
    onNavigateMenu(menu, projectId);
  }, [currentProjectId, onNavigateMenu]);

  const routeProject = route.projectId ? projects.find((project) => project.id === route.projectId) : undefined;
  const hasRouteError = route.status === 'not-found' || (route.scope === 'project' && !routeProject);

  useEffect(() => {
    setActiveMenuState(route.menu);
    if (route.scope === 'project' && routeProject && route.projectId !== currentProjectId) {
      setCurrentProjectId(routeProject.id);
    }
  }, [currentProjectId, route.menu, route.projectId, route.scope, routeProject, setCurrentProjectId]);

  // User activity log
  const [activities, setActivities] = useState<Array<{ text: string; time: string; type: string }>>(() => {
    try {
      const saved = localStorage.getItem('ezrab_db_activities');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [magicAiModalOpen, setMagicAiModalOpen] = useState(false);
  // Legacy in-workspace onboarding modal — superseded by the App-level
  // OnboardingTour (src/components/onboarding/OnboardingTour.tsx), which is the
  // single first-run/replayable tutorial. Kept mounted but never auto-opens.

  // Sync activities to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ezrab_db_activities', JSON.stringify(activities));
    } catch (e) {
      console.error(e);
    }
  }, [activities]);

  // Event global: buka tab pengaturan tertentu (mis. dari tutorial fitur).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: string } | undefined;
      const tab = detail?.tab;
      if (typeof tab === 'string' && tab) {
        setPengaturanActiveTab(tab);
        setActiveMenu('pengaturan');
      }
    };
    window.addEventListener('ezrab:open-settings-tab', handler);
    return () => window.removeEventListener('ezrab:open-settings-tab', handler);
  }, [setActiveMenu]);

  // Event global (Command Router 2026-10-26): set filter status proyek dari
  // Chat AI. Filter BUKAN parameter URL (parseWorkspaceRoute membuang
  // ?status=), jadi dipakai event yang sama polanya dengan
  // ezrab:open-settings-tab di atas. Allowlist ketat: nilai di luar daftar
  // diabaikan. Pengirim (chat) men-dispatch SEBELUM navigateTo, dan
  // ProjectsView menyinkronkan initialFilter lewat useEffect, sehingga
  // filter berlaku baik saat halaman proyek baru di-mount maupun saat
  // sudah terbuka. Sidebar TIDAK diubah sama sekali.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const filter = typeof detail === 'string' ? detail : undefined;
      const allowed = ['Semua Proyek', 'Draft', 'Sedang Dikerjakan', 'Selesai', 'Arsip'];
      if (filter && allowed.includes(filter)) {
        setProjectFilter(filter);
      }
    };
    window.addEventListener('ezrab:set-project-filter', handler);
    return () => window.removeEventListener('ezrab:set-project-filter', handler);
  }, []);

  // Dynamic calculations (100% genuine - 0 dummy data)
  const totalProjects = projects.length;
  const totalRab = projects.reduce((acc, p) => acc + (p.totalRab || 0), 0);
  const completedProjects = projects.filter((p) => p.status === 'completed' || p.status === 'approved').length;
  const activeProjects = projects.filter((p) => p.status === 'in_progress').length;

  // Latest project for the showcase card
  const latestProject = currentProject || (projects.length > 0 ? projects[0] : null);

  // Feed "Aktivitas Terbaru" — derivasi jujur dari timestamp proyek nyata
  // (createdAt / updatedAt / archivedAt). Aplikasi belum memiliki event log
  // per-aksi; log lama di localStorage hanya terisi saat proyek dibuat dan
  // waktunya membeku di 'Baru saja', jadi feed diturunkan dari data proyek
  // itu sendiri: dibuat / diperbarui / selesai / diarsipkan.
  const derivedActivities = useMemo(() => {
    type Ev = { text: string; time: string; type: string; ts: number };
    const events: Ev[] = [];
    for (const p of projects) {
      const createdTs = p.createdAt ? Date.parse(p.createdAt) : NaN;
      if (!isNaN(createdTs)) {
        events.push({ text: `Proyek "${p.name}" dibuat`, time: formatRelativeId(p.createdAt), type: 'create', ts: createdTs });
      }
      const updatedTs = p.updatedAt ? Date.parse(p.updatedAt) : NaN;
      if (!isNaN(updatedTs) && p.updatedAt !== p.createdAt) {
        const isDone = p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED';
        events.push({
          text: isDone ? `Proyek "${p.name}" selesai` : `Proyek "${p.name}" diperbarui`,
          time: formatRelativeId(p.updatedAt as string),
          type: isDone ? 'done' : 'update',
          ts: updatedTs,
        });
      }
      const archivedTs = p.archivedAt ? Date.parse(p.archivedAt) : NaN;
      if (!isNaN(archivedTs) && (p.isArchived || p.status === 'archived')) {
        events.push({ text: `Proyek "${p.name}" diarsipkan`, time: formatRelativeId(p.archivedAt as string), type: 'archive', ts: archivedTs });
      }
    }
    return events
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8)
      .map(({ text, time, type }) => ({ text, time, type }));
  }, [projects]);

  // Total RAB from real items — digating STATUS (priceIntegrity): item
  // PRICE_UNRESOLVED dengan total basi tidak ikut (nilai 0 valid tetap 0).
  // Catatan: nilai ini saat ini belum dirender di view manapun — gating
  // dipasang agar tetap jujur bila suatu saat dipakai.
  const totalRabDetail = projectRabItems.reduce((acc, item) => acc + (exportItemAmount(item as any) ?? 0), 0);

  // Currency Formatter
  const formatRupiah = (val: number) => {
    if (val === 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Handle Project Creation from Centralized Modal
  /**
   * R2: SATU handler keluar workspace — dipakai TopBar (onLogout) dan
   * Pengaturan (onLogout lewat PengaturanView). Isinya sama dengan
   * handler inline lama di TopBar: reset sesi co-assistant + tutup
   * chatbox + kembali ke landing. Data proyek TIDAK dihapus di sini
   * (keputusan produk yang sudah ada; penghapusan transien/sesi
   * dilakukan logoutAll sebelum handler ini dipanggil).
   */
  const handleWorkspaceLogout = () => {
    // Tanpa confirm: confirm browser auto-dismiss di pengujian membuat
    // tombol keluar tampak mati; keluar ke landing tidak menghapus data
    // (workspace tersimpan lokal dan bisa dibuka lagi lewat gerbang).
    coAssistantService.resetSession();
    setCoAssistantMode('closed');
    if (onBackToLanding) onBackToLanding();
  };

  const handleProjectCreated = (newProj: Project) => {
    setActivities((prev) => [
      { text: `Proyek baru "${newProj.name}" (${newProj.creationMethod || 'manual'}) telah dibuat`, time: 'Baru saja', type: 'create' },
      ...prev,
    ]);
  };

  // "Ulangi Tutorial" dari Pengaturan me-dispatch `ezrab:open-onboarding`;
  // event tersebut ditangkap oleh useOnboardingTour() di App (tur baru).
  // Listener lama untuk modal legacy sengaja dihapus agar tidak dobel.

  // Reset to pure 0 state
  const handleResetData = () => {
    resetAllProductionData();
    setActivities([]);
    localStorage.removeItem('ezrab_db_activities');
  };

  return (
    <div
      className="pf-page"
      style={{
        minHeight: '100vh',
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        color: 'var(--ez-color-text-primary)',
      }}
    >
      {/* Mobile Drawer Backdrop Overlay */}
      {isMobile && mobileDrawerOpen && (
        <div
          className="ezrab-drawer-backdrop"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* PREMIUM FRAME — Layer 2 (outer dark frame) + Layer 3 (app panel) */}
      <div className="pf-frame">
        <div className="pf-panel">
      {/* =========================================================================
          LEFT SIDEBAR (DESKTOP) / SLIDE-OVER OFF-CANVAS DRAWER (MOBILE)
         ========================================================================= */}
      <Sidebar
        activeMenu={activeMenu}
        onSelectMenu={(menu, projectId) => setActiveMenu(menu, projectId)}
        sidebarCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        isMobile={isMobile}
        mobileDrawerOpen={mobileDrawerOpen}
        onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
        projectFilter={projectFilter}
        onSelectProjectFilter={(filter) => setProjectFilter(filter)}
        projects={projects}
        currentProject={currentProject}
        onBackToLanding={onBackToLanding}
        onOpenSettingsTab={(tab) => {
          setPengaturanActiveTab(tab);
          setActiveMenu('pengaturan');
        }}
      />

      {/* =========================================================================
          RIGHT MAIN AREA
         ========================================================================= */}
      <div
        className="pf-main"
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflowY: 'auto',
          paddingBottom: isNarrowMobile ? 'calc(68px + var(--ezrab-safe-bottom))' : '0px',
        }}
      >
        {/* TOPBAR (CLEAN, MINIMAL — breadcrumb menyatu dalam satu header).
            Disembunyikan PENUH di mode Ezrab Chat AI (owner 2026-10-27):
            header milik Chat AI sendiri yang memanjang penuh menggantikannya.
            Breadcrumb ikut hilang karena ia adalah prop TopBar ini. */}
        {activeMenu !== 'ezrab-ai' && (
        <TopBar
          breadcrumb={
            activeMenu !== 'dashboard' &&
            activeMenu !== 'material' &&
            activeMenu !== 'database-material' &&
            activeMenu !== 'material-harga' &&
            activeMenu !== 'harga' ? (
              <UnifiedBreadcrumb
                route={route}
                currentProject={currentProject}
                activeMenu={activeMenu}
                onNavigate={(menu, projectId) => setActiveMenu(menu, projectId)}
                projectFilter={projectFilter}
                settingsTab={
                  activeMenu === 'pengaturan'
                    ? pengaturanActiveTab === 'profile'
                      ? t('dash.set_tab_profile')
                      : pengaturanActiveTab === 'workspace' || pengaturanActiveTab === 'company'
                      ? t('dash.set_tab_company')
                      : pengaturanActiveTab === 'users'
                      ? t('dash.set_tab_team')
                      : pengaturanActiveTab === 'roles'
                      ? t('dash.set_tab_roles')
                      : pengaturanActiveTab === 'notifications'
                      ? t('dash.set_tab_notif')
                      : pengaturanActiveTab === 'calculation' || pengaturanActiveTab === 'ded-volume'
                      ? t('dash.set_tab_ded')
                      : pengaturanActiveTab === 'rab' || pengaturanActiveTab === 'estimator'
                      ? t('dash.set_tab_estimator')
                      : pengaturanActiveTab === 'master-data'
                      ? t('dash.set_tab_master')
                      : pengaturanActiveTab === 'export' || pengaturanActiveTab === 'documents'
                      ? t('dash.set_tab_docs')
                      : pengaturanActiveTab === 'schedule'
                      ? t('dash.set_tab_schedule')
                      : pengaturanActiveTab === 'cost'
                      ? t('dash.set_tab_cost')
                      : pengaturanActiveTab === 'integrations'
                      ? t('dash.set_tab_integrations')
                      : pengaturanActiveTab === 'audit-log'
                      ? t('dash.set_tab_audit')
                      : pengaturanActiveTab === 'security'
                      ? t('dash.set_tab_security')
                      : pengaturanActiveTab === 'subscription'
                      ? t('dash.set_tab_billing')
                      : t('dash.set_tab_system')
                    : undefined
                }
              />
            ) : undefined
          }
          isMobile={isMobile}
          isNarrowMobile={isNarrowMobile}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
          onNavigate={(menu, tab) => {
            if (tab) {
              setPengaturanActiveTab(tab);
            }
            if (menu === 'landing') {
              if (onBackToLanding) onBackToLanding();
            } else {
              setActiveMenu(menu);
            }
          }}
          onLogout={handleWorkspaceLogout}
        />
        )}

        {/* =========================================================================
            MAIN VIEW (PROYEK, DAFTAR PEKERJAAN, MAGIC AI, QTO, OR DASHBOARD)
           ========================================================================= */}
        <div key={activeMenu} className="ezr-menu-enter" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {hasRouteError ? (
          <main style={{ padding: '48px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)', display: 'grid', placeItems: 'center' }}>
            <section style={{ maxWidth: '480px', textAlign: 'center', background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border)', borderRadius: '22px', padding: '32px' }}>
              <FolderKanban size={32} color="var(--ez-color-text-muted)" style={{ margin: '0 auto 14px' }} />
              <h1 style={{ fontSize: '20px', color: 'var(--ez-color-text-primary)', marginBottom: '8px' }}>{route.scope === 'project' ? t('dash.err_project_title') : t('dash.err_page_title')}</h1>
              <p style={{ color: 'var(--ez-color-text-muted)', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>{route.scope === 'project' ? t('dash.err_project_desc') : t('dash.err_page_desc')}</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setActiveMenu('dashboard')} style={{ padding: '10px 16px', background: 'var(--ez-color-primary)', color: '#FFFFFF', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>{t('dash.err_go_dashboard')}</button>
                <button onClick={() => setActiveMenu('proyek', null)} style={{ padding: '10px 16px', background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-primary)', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--ez-color-border)', cursor: 'pointer' }}>{t('dash.err_view_projects')}</button>
              </div>
            </section>
          </main>
        ) : activeMenu === 'proyek' ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <ProjectsView
              projects={projects}
              activities={derivedActivities}
              initialFilter={projectFilter}
              onFilterChange={(f) => setProjectFilter(f)}
              onCreateProject={() => setCreateModalOpen(true)}
              onOpenMagicAi={() => openEzrabAI({ mode: 'chat', projectId: currentProjectId, projectName: currentProject?.name, source: 'other' })}
              onNavigateToTab={(tab) => setActiveMenu(tab)}
              onOpenProject={(projectId, menu = 'manajemen-proyek') => {
                setCurrentProjectId(projectId);
                setActiveMenu(menu, projectId);
              }}
            />
          </main>
        ) : (activeMenu === 'daftar-pekerjaan' || activeMenu === 'pekerjaan' || activeMenu === 'qto-daftar') ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <DaftarPekerjaanView
              onNavigateToCalculator={(calcId, qtoId) => {
                setActiveCalcId(calcId || 'BOWPLANK');
                setActiveCalcQtoId(qtoId || null);
                setActiveMenu('qto-vc');
              }}
              onNavigateToTab={(tab) => setActiveMenu(tab)}
            />
          </main>
        ) : (activeMenu === 'ai-assistant' || activeMenu === 'magic-ai' || activeMenu === 'ded-rab') ? (
          <main style={{ minHeight: 'calc(100vh - 64px)' }}>
            <MagicAiSuperView
              initialMode={route.mode}
              currentProject={currentProject}
              projects={projects}
              projectRabItems={projectRabItems}
              onSelectProject={(projectId) => {
                setCurrentProjectId(projectId);
                setActiveMenu(activeMenu, projectId);
              }}
              onNavigateToTab={(tab) => setActiveMenu(tab)}
              onAddRabItemDirect={createRabItemDirect}
              onOpenFloatingChat={() => setCoAssistantMode('compact')}
              onBackToDashboard={() => setActiveMenu('dashboard')}
              onOpenRabDetail={(targetProjectId?: string) => {
                const pid = targetProjectId || currentProjectId;
                if (pid) {
                  setCurrentProjectId(pid);
                }
                setActiveMenu('rab-estimasi', pid);
              }}
            />
          </main>
        ) : activeMenu === 'ezrab-ai' ? (
          <main style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--ez-color-background)' }}>
            <EzrabAiView />
          </main>
        ) : activeMenu === 'desain-rab' ? (
          <main style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--ez-color-background)' }}>
            <Suspense fallback={null}>
              <ChatToRabWorkspaceLazy />
            </Suspense>
          </main>
        ) : activeMenu === 'ded-ai' ? (
          <main style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--ez-color-background)' }}>
            <DedAiEstimateView onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : activeMenu === 'dokumen-ai' ? (
          <main style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--ez-color-background)' }}>
            <DokumenAiView onNavigateToMenu={(menu) => setActiveMenu(menu)} />
          </main>
        ) : activeMenu === 'kredit-ai' ? (
          <main style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--ez-color-background)' }}>
            <CreditPage onBack={() => setActiveMenu('dashboard')} />
          </main>
        ) : (activeMenu === 'rab-estimasi' ||
             activeMenu === 'rab-informasi-proyek' ||
             activeMenu === 'rab-spreadsheet' ||
             activeMenu === 'rab-rekapitulasi' ||
             activeMenu === 'rab-analisa-harga' ||
             activeMenu === 'rab-kurva-s' ||
             activeMenu === 'rab-catatan' ||
             activeMenu === 'rab-pengaturan') ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <RabEstimasiView
              key={activeMenu}
              projects={projects}
              initialTab={
                activeMenu === 'rab-informasi-proyek'
                  ? 'informasi-proyek'
                  : activeMenu === 'rab-rekapitulasi'
                  ? 'rekapitulasi'
                  : activeMenu === 'rab-analisa-harga'
                  ? 'analisa-harga'
                  : activeMenu === 'rab-kurva-s'
                  ? 'kurva-s'
                  : activeMenu === 'rab-catatan'
                  ? 'catatan'
                  : activeMenu === 'rab-pengaturan'
                  ? 'pengaturan'
                  : 'spreadsheet'
              }
              onNavigateToTab={(tab) => setActiveMenu(tab)}
            />
          </main>
        ) : activeMenu === 'manajemen-proyek' ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <ManajemenProyekView projects={projects} />
          </main>
        ) : (activeMenu === 'ahsp-2026' || activeMenu === 'ahsp' || activeMenu === 'analisa-ahsp') ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <Suspense
              fallback={
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>
                    Memuat katalog AHSP 2026…
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)' }}>
                    Data kanonis ±19 MB sedang dimuat. Mohon tunggu sebentar.
                  </div>
                </div>
              }
            >
            <AhspExplorerViewLazy
              routeParams={route.ahsp}
              onAddAhspToRab={(ahsp, volume) => {
                if (currentProject) {
                  createRabItemDirect({
                    code: ahsp.code,
                    ahspCode: ahsp.code,
                    description: ahsp.name,
                    unit: ahsp.unit,
                    volume: volume,
                    unitPrice: ahsp.unitPrice,
                    // Harga AHSP boleh null (belum tersedia): total ikut null agar
                    // factory membuat PRICE_UNRESOLVED — JANGAN fallback ke 0.
                    totalPrice: ahsp.unitPrice != null ? ahsp.unitPrice * volume : null,
                    category: ahsp.category || 'Pekerjaan',
                    sectionName: ahsp.category || 'Pekerjaan',
                    laborPrice: ahsp.totalLabor || 0,
                    materialPrice: ahsp.totalMaterial || 0,
                    equipmentPrice: ahsp.totalEquipment || 0,
                  });
                  return true;
                }
                // Tanpa proyek aktif: kembalikan false agar explorer menampilkan
                // peringatan, bukan toast sukses palsu (regresi F-01).
                return false;
              }}
            />
            </Suspense>
          </main>
        ) : (activeMenu === 'qto' || activeMenu === 'qto-rekap') ? (
          <main style={{ minHeight: 'calc(100vh - 64px)' }}>
            <QtoRekapVolumeView
              onNavigateToCalculator={(calcId, qtoId) => {
                setActiveCalcId(calcId || 'BOWPLANK');
                setActiveCalcQtoId(qtoId || null);
                setActiveMenu('qto-vc');
              }}
            />
          </main>
        ) : (activeMenu === 'qto-vc' || activeMenu === 'volume-calculation') ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <QtoCalculatorView
              initialCalcId={activeCalcId}
              initialQtoId={activeCalcQtoId || undefined}
              onNavigateToTab={(tab) => setActiveMenu(tab)}
            />
          </main>
        ) : activeMenu === 'template-rab' ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <TemplateRabCatalogView
              currentProject={currentProject}
              projects={projects}
              onNavigateToTab={(tab, projId) => setActiveMenu(tab, projId)}
              onApplyTemplate={(template, params, targetProjectId, newProjectMeta, detailLevel, selectedOptionalIds) => {
                const tplService = RabTemplateService.getInstance();
                let effectiveProjectId = targetProjectId;
                if (!effectiveProjectId) {
                  const newProj = createProject({
                    name: newProjectMeta?.name || template.name,
                    buildingType: templateCategoryToBuildingType(template.category),
                    buildingArea: newProjectMeta?.buildingArea || 100,
                    landArea: (newProjectMeta?.buildingArea || 100) * 2,
                    floorCount: newProjectMeta?.floorCount || 1,
                    status: 'draft',
                  });
                  effectiveProjectId = newProj.id;
                }

                // Generate real deterministic items from template with detailLevel and optional works
                const result = tplService.generateRabFromTemplate(
                  template,
                  params,
                  effectiveProjectId,
                  detailLevel || 'PROFESSIONAL',
                  selectedOptionalIds || []
                );
                if (result.items && result.items.length > 0) {
                  bulkAddRabItems(result.items, effectiveProjectId);
                }
                setActiveMenu('rab-estimasi', effectiveProjectId);
              }}
              onSelectTemplate={(template) => {
                setActiveMenu('rab-estimasi', currentProject ? currentProject.id : null);
              }}
              onCreateProjectWithTemplate={(template) => {
                const newProj = createProject({
                  name: template.label || template.name,
                  buildingType: 'Rumah Tinggal',
                  buildingArea: template.area || 36,
                  landArea: (template.area || 36) * 2,
                  floorCount: template.defaultFloorCount || 1,
                  status: 'draft',
                });
                setActiveMenu('rab-estimasi', newProj.id);
              }}
            />
          </main>
        ) : activeMenu === 'dokumen-tender' ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <TenderDocumentsView
              onNavigateToTab={(tab) => setActiveMenu(tab)}
              currentProject={currentProject}
              rabItems={projectRabItems}
              scheduleTasks={projectScheduleTasks}
              kurvaSData={projectKurvaSData}
            />
          </main>
        ) : (activeMenu === 'keuangan-proyek' || activeMenu === 'keuangan' || activeMenu === 'termin' || activeMenu === 'invoice' || activeMenu === 'pemasukan' || activeMenu === 'pengeluaran' || activeMenu === 'cash-flow') ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <ProjectFinanceView
              currentProject={currentProject}
              projects={projects}
              rabItems={projectRabItems}
              initialTab={
                activeMenu === 'termin'
                  ? 'terms'
                  : activeMenu === 'invoice'
                  ? 'invoices'
                  : activeMenu === 'pemasukan'
                  ? 'payments'
                  : activeMenu === 'pengeluaran'
                  ? 'expenses'
                  : activeMenu === 'cash-flow'
                  ? 'cashflow'
                  : 'overview'
              }
              onNavigateToTab={(tab, projId) => setActiveMenu(tab, projId)}
            />
          </main>
        ) : (activeMenu === 'laporan' || activeMenu === 'boq' || activeMenu === 'rekapitulasi') ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <LaporanView projects={projects} rabItems={projectRabItems} onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : (activeMenu === 'material' || activeMenu === 'database-material' || activeMenu === 'material-harga' || activeMenu === 'harga') ? (
          <main style={{ padding: 0, minHeight: 'calc(100vh - 64px)' }}>
            <MaterialDatabaseView initialTab="MATERIALS" onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : (activeMenu === 'upah' || activeMenu === 'database-upah') ? (
          <main style={{ padding: 0, minHeight: 'calc(100vh - 64px)' }}>
            <MaterialDatabaseView initialTab="LABOR" onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : (activeMenu === 'alat' || activeMenu === 'database-alat') ? (
          <main style={{ padding: 0, minHeight: 'calc(100vh - 64px)' }}>
            <MaterialDatabaseView initialTab="EQUIPMENT" onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : (activeMenu === 'harga-proyek' || activeMenu === 'project-price') ? (
          <main style={{ padding: 0, minHeight: 'calc(100vh - 64px)' }}>
            <MaterialDatabaseView initialTab="PROJECT_PRICE" onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : (activeMenu === 'resource-library' || activeMenu === 'suppliers') ? (
          <main style={{ padding: 0, background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <ResourceLibraryView initialTab="SUPPLIERS" onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : (activeMenu === 'kurva-s' || activeMenu === 'jadwal') ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <ManajemenProyekView projects={projects} initialSection={activeMenu === 'jadwal' ? 'jadwal' : 'kurva-s'} />
          </main>
        ) : activeMenu === 'export' ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <LaporanView projects={projects} rabItems={projectRabItems} onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : activeMenu === 'pengaturan' ? (
          <main style={{ padding: '20px 24px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            <PengaturanView
              initialTab={pengaturanActiveTab}
              initialScope={route.scope === 'project' ? 'PROJECT' : 'GLOBAL'}
              onNavigateTab={(tab) => setActiveMenu(tab)}
              onLogout={handleWorkspaceLogout}
            />
          </main>
        ) : activeMenu === 'subscription' ? (
          <main style={{ padding: isNarrowMobile ? '16px 14px' : '24px 28px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)' }}>
            {selectedPlanId && (
              <div
                role="status"
                style={{
                  marginBottom: '16px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--ez-hue-amber-border, #FDE68A)',
                  background: 'var(--ez-hue-amber-bg, #FFFBEB)',
                  color: 'var(--ez-color-text-primary)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                }}
              >
                Paket {(({ free: 'Free', basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' } as Record<string, string>)[selectedPlanId] || selectedPlanId)} dipilih — pembayaran belum tersedia. Paket Anda saat ini: <strong>Gratis</strong>.
              </div>
            )}
            <PricingSection onSelectPlan={(planId) => setSelectedPlanId(planId)} />
          </main>
        ) : activeMenu === 'blog-admin' ? (
          // CMS blog — internal, tidak ada di sidebar. Gate capability di BlogAdminPage.
          <BlogAdminPage />
        ) : (
          <main data-tour="dashboard" style={{ padding: isNarrowMobile ? '16px 14px' : '24px 28px', background: 'var(--ez-color-background)', minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <DashboardViewSwitcher
              projects={projects}
              activities={derivedActivities}
              onCreateProject={() => setCreateModalOpen(true)}
              onSelectProject={(projectId, menu = 'manajemen-proyek') => {
                setCurrentProjectId(projectId);
                setActiveMenu(menu, projectId);
              }}
              onNavigateToTab={(tab, projId) => setActiveMenu(tab, projId)}
              onNavigateToProjects={(filter) => {
                setProjectFilter(filter);
                setActiveMenu('proyek', null);
              }}
              onOpenMagicAi={(mode?: 'chat' | 'ded-rab') => {
                // Fase 1: semua pintu dashboard lewat resolver. DED eksplisit
                // (kartu Upload DED) → ded-ai; generik → chat ezrab-ai.
                // Catatan: ini mengubah tujuan DED dashboard dari SuperView
                // (magic-ai) ke DedAiEstimateView (ded-ai) — dua permukaan
                // DED belum digabung, route /app/magic-ai tetap SuperView.
                if (mode === 'ded-rab') {
                  openEzrabAI({ mode: 'ded', projectId: currentProjectId, projectName: currentProject?.name, source: 'dashboard' });
                } else {
                  openEzrabAI({ mode: 'chat', projectId: currentProjectId, projectName: currentProject?.name, source: 'dashboard' });
                }
              }}
              onOpenSubscription={() => setActiveMenu('subscription')}
              onResetData={handleResetData}
            />
          </main>
        )}
        </div>
      </div>

      {/* =========================================================================
          CENTRALIZED + PROYEK BARU MODAL (THE 4 KICKOFF PATHWAYS)
         ========================================================================= */}
      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreateProject={(projectData) => {
          const newProj = createProject(projectData);
          handleProjectCreated(newProj);
          return newProj;
        }}
        onNavigateToTab={(tab, projId) => setActiveMenu(tab, projId)}
        onOpenMagicAiWithPrompt={(prompt, projectId, projectName) => {
          // Fase 1: kartu Magic AI di CreateProjectModal TIDAK lagi membuka
          // RabGeneratorModal langsung — generatornya adalah chat dengan
          // mode rab-generator (prefill prompt, universal direct RAB).
          // R1: pakai ID + nama proyek BARU yang diteruskan modal — JANGAN
          // currentProject dari closure render sebelum pembuatan (itu proyek
          // aktif lama; draft akan ter-push ke proyek yang salah).
          openEzrabAI({ mode: 'rab-generator', prompt, projectId: projectId ?? null, projectName, source: 'create-project' });
        }}
      />

      {/* =========================================================================
          LIGHTWEIGHT ONBOARDING TOUR MODAL (DISMISSIBLE / RE-TRIGGERABLE)
         ========================================================================= */}
      {/* =========================================================================
          MOBILE BOTTOM NAVIGATION BAR (< 768px)
         ========================================================================= */}
      {isNarrowMobile && (
        <nav className="ezrab-bottom-nav" aria-label={t('nav.bottom_nav')}>
          <button
            type="button"
            className={`ezrab-bottom-nav-item ${activeMenu === 'proyek' || activeMenu === 'dashboard' || activeMenu === 'manajemen-proyek' ? 'is-active' : ''}`}
            onClick={() => setActiveMenu('proyek')}
            aria-label={t('nav.bottom_proyek')}
          >
            <FolderKanban size={18} />
            <span>{t('nav.bottom_proyek')}</span>
          </button>

          <button
            type="button"
            className={`ezrab-bottom-nav-item ${activeMenu === 'rab-estimasi' ? 'is-active' : ''}`}
            onClick={() => setActiveMenu('rab-estimasi')}
            aria-label={t('nav.bottom_estimator')}
          >
            <Coins size={18} />
            <span>{t('nav.bottom_estimator')}</span>
          </button>

          <button
            type="button"
            className="ezrab-bottom-nav-ai-btn"
            onClick={() => openEzrabAI({ mode: 'chat', projectId: currentProjectId, projectName: currentProject?.name, source: 'mobile' })}
            title={t('nav.bottom_magic_ai')}
            aria-label={t('nav.bottom_magic_ai')}
          >
            <Sparkles size={19} />
          </button>

          <button
            type="button"
            className={`ezrab-bottom-nav-item ${activeMenu === 'material' || activeMenu === 'database-material' || activeMenu === 'material-harga' || activeMenu === 'harga' ? 'is-active' : ''}`}
            onClick={() => setActiveMenu('material')}
            aria-label="Harga"
          >
            <Tag size={18} />
            <span>Harga</span>
          </button>

          <button
            type="button"
            className={`ezrab-bottom-nav-item ${activeMenu === 'ahsp-2026' || activeMenu === 'ahsp' || activeMenu === 'analisa-ahsp' ? 'is-active' : ''}`}
            onClick={() => setActiveMenu('ahsp-2026')}
            aria-label={t('nav.bottom_ahsp')}
          >
            <Database size={18} />
            <span>AHSP</span>
          </button>
        </nav>
      )}



      {/* EZRAB Floating Launcher (Bottom-Right, safe from mobile bottom nav; hidden in AI views per Single-Mascot Rule) */}
      {activeMenu !== 'magic-ai' && activeMenu !== 'ai-assistant' && activeMenu !== 'ded-rab' && activeMenu !== 'ezrab-ai' && activeMenu !== 'ded-ai' && activeMenu !== 'dokumen-ai' && (
        <>
          <EzrabCoAssistantLauncher
            isOpen={coAssistantMode !== 'closed' && coAssistantMode !== 'minimized'}
            onClick={() => setCoAssistantMode('compact')}
            hasActiveContext={Boolean(currentProject)}
          />

          {/* EZRAB Co-Assistant Floating Panel */}
          <EzrabCoAssistantChatbox
            mode={coAssistantMode}
            onModeChange={setCoAssistantMode}
            currentProject={currentProject}
            projectRabItems={projectRabItems}
            projectQtoItems={projectQtoItems}
            projects={projects}
            currentProjectId={currentProjectId}
            activeModule={activeMenu}
            userRole="SUPER_ADMIN"
            onSelectProject={(pId) => {
              setCurrentProjectId(pId);
              setActiveMenu(activeMenu, pId);
            }}
            onAddRabItemDirect={createRabItemDirect}
            onOpenSuperView={() => {
              setCoAssistantMode('closed');
              openEzrabAI({ mode: 'chat', projectId: currentProjectId, projectName: currentProject?.name, source: 'copilot' });
            }}
          />
        </>
      )}
        </div>
      </div>
      <FirstProjectChecklist />
    </div>
  );
};

export default WorkspaceView;


