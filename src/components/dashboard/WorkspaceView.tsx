import React, { useCallback, useEffect, useState } from 'react';
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
import { DedAiEstimateView } from '../../ai-tools/ded-ai-estimate/view';
import { DokumenAiView } from '../../ai-tools/document-ai/view';
import { MagicAiSuperView } from '../magic-ai/MagicAiSuperView';
import { ProjectsView } from '../projects/ProjectsView';
import { RabEstimasiView } from '../rab/RabEstimasiView';
import { ManajemenProyekView } from '../management/ManajemenProyekView';
import { AhspExplorerView } from '../ahsp/AhspExplorerView';
import { DaftarPekerjaanView } from '../workItems/DaftarPekerjaanView';
import { QtoCalculatorView } from '../qto/QtoCalculatorView';
import { QtoRekapVolumeView } from '../qto/QtoRekapVolumeView';
import { LaporanView } from '../reports/LaporanView';
import { PengaturanView } from '../settings/PengaturanView';
import { PricesExplorerView } from '../database/PricesExplorerView';
import { ResourceLibraryView } from '../resources/ResourceLibraryView';
import { EzrabAiDashboardView } from './EzrabAiDashboardView';
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
import { routeLabel, navigateTo, routeForMenu, type WorkspaceRoute } from '../../routing/routes';
import '../../styles/dashboard-refined.css';
import '../../styles/workspace-mobile-fixes.css';
import { UnifiedBreadcrumb } from '../navigation/UnifiedBreadcrumb';
import { TopBar } from '../navigation/TopBar';
import { TemplateRabCatalogView } from '../templates/TemplateRabCatalogView';
import { HouseTypeCatalogItem } from '../../data/houseTypeCatalog';
import { RabTemplateService } from '../../services/rabTemplateService';
import { RabTemplate } from '../../types/rabTemplate';
import { CreateProjectModal } from '../projects/CreateProjectModal';
import { TenderDocumentsView } from '../document/TenderDocumentsView';
import { OnboardingTourModal } from './OnboardingTourModal';
import { DashboardGuideModal, shouldShowDashboardGuide } from './DashboardGuideModal';
import { Sidebar } from '../layout/Sidebar';
import { EnterpriseEntryPage } from '../enterprise/EnterpriseEntryPage';
import { ProjectFinanceView } from '../finance/ProjectFinanceView';
import { MaterialDatabaseView } from '../materials/MaterialDatabaseView';

interface WorkspaceViewProps {
  onBackToLanding?: () => void;
  route: WorkspaceRoute;
  onNavigateMenu: (menu: string, projectId?: string | null) => void;
}

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
  const [workspaceSubmenuOpen, setWorkspaceSubmenuOpen] = useState(true);
  const [estimasiSubmenuOpen, setEstimasiSubmenuOpen] = useState(true);
  const [dataMasterLaporanOpen, setDataMasterLaporanOpen] = useState(true);
  const [accountSubmenuOpen, setAccountSubmenuOpen] = useState(false);

  // Calculator Navigation States
  const [activeCalcId, setActiveCalcId] = useState('BOWPLANK');
  const [activeCalcQtoId, setActiveCalcQtoId] = useState<string | null>(null);

  const [coAssistantMode, setCoAssistantMode] = useState<ChatboxDisplayMode>('closed');

  // AI Dokumen: workspace analisis aktif? (floating assistant disembunyikan
  // HANYA saat analisis aktif; tampil di halaman utama AI Dokumen)
  const [docAiAnalysisActive, setDocAiAnalysisActive] = useState(false);



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
    // Reset status workspace analisis AI Dokumen saat pindah menu
    if (menu !== 'dokumen-ai') setDocAiAnalysisActive(false);
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
  const [onboardingTourOpen, setOnboardingTourOpen] = useState(false);

  // Panduan langkah pertama di dashboard — muncul otomatis saat pengguna
  // masuk dashboard dan belum punya proyek sama sekali.
  const [dashboardGuideOpen, setDashboardGuideOpen] = useState(false);

  // Sync activities to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ezrab_db_activities', JSON.stringify(activities));
    } catch (e) {
      console.error(e);
    }
  }, [activities]);

  // Panduan langkah pertama: otomatis tampil saat masuk dashboard dan belum
  // punya proyek. Delay 1,2 detik agar tidak bertumpuk dengan tur selamat
  // datang di level App (jika sedang tampil di atasnya).
  useEffect(() => {
    if (activeMenu !== 'dashboard') return;
    if (projects.length > 0) return;
    if (!shouldShowDashboardGuide()) return;
    const t = setTimeout(() => setDashboardGuideOpen(true), 1200);
    return () => clearTimeout(t);
  }, [activeMenu, projects.length]);

  // Dynamic calculations (100% genuine - 0 dummy data)
  const totalProjects = projects.length;
  const totalRab = projects.reduce((acc, p) => acc + (p.totalRab || 0), 0);
  const completedProjects = projects.filter((p) => p.status === 'completed' || p.status === 'approved').length;
  const activeProjects = projects.filter((p) => p.status === 'in_progress').length;
  
  // Latest project for the showcase card
  const latestProject = currentProject || (projects.length > 0 ? projects[0] : null);

  // Total RAB from real items
  const totalRabDetail = projectRabItems.reduce((acc, item) => acc + (item.amount || 0), 0);

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
  const handleProjectCreated = (newProj: Project) => {
    setActivities((prev) => [
      { text: `Proyek baru "${newProj.name}" (${newProj.creationMethod || 'manual'}) telah dibuat`, time: 'Baru saja', type: 'create' },
      ...prev,
    ]);
  };

  // Onboarding Complete Handler
  const handleCompleteOnboarding = () => {
    setOnboardingTourOpen(false);
    try {
      localStorage.setItem('ezrab_onboarding_completed', 'true');
    } catch (e) {
      console.error(e);
    }
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
      style={{
        minHeight: '100vh',
        background: '#F2F7FF',
        fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#0F172A',
        display: 'flex',
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
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflowY: 'auto',
          paddingBottom: isNarrowMobile ? 'calc(68px + var(--ezrab-safe-bottom))' : '0px',
        }}
      >
        {/* TOPBAR (CLEAN, MINIMAL, LIGHT MODE ONLY, MODERN UX) */}
        <TopBar
          isMobile={isMobile}
          isNarrowMobile={isNarrowMobile}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          projects={projects}
          onOpenProject={(projectId) => {
            setCurrentProjectId(projectId);
            setActiveMenu('manajemen-proyek', projectId);
          }}
          onCreateProject={() => setCreateModalOpen(true)}
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
          onLogout={() => {
            if (window.confirm('Apakah Anda yakin ingin keluar dari akun?')) {
              coAssistantService.resetSession();
              setCoAssistantMode('closed');
              if (onBackToLanding) onBackToLanding();
            }
          }}
        />

        {/* =========================================================================
            UNIFIED BREADCRUMB & ACTION BAR (Only visible on non-dashboard pages)
           ========================================================================= */}
        {activeMenu !== 'dashboard' &&
          activeMenu !== 'material' &&
          activeMenu !== 'database-material' &&
          activeMenu !== 'material-harga' &&
          activeMenu !== 'harga' && (
          <div
            style={{
              background: '#ffffff',
              borderBottom: '1px solid #E2E8F0',
              padding: isNarrowMobile ? '6px 12px' : '8px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              position: 'sticky',
              top: isNarrowMobile ? '56px' : '64px',
              zIndex: 19,
            }}
          >
            <UnifiedBreadcrumb
              route={route}
              currentProject={currentProject}
              activeMenu={activeMenu}
              onNavigate={(menu, projectId) => setActiveMenu(menu, projectId)}
              projectFilter={projectFilter}
              settingsTab={
                activeMenu === 'pengaturan'
                  ? pengaturanActiveTab === 'profile'
                    ? 'Profil Saya'
                    : pengaturanActiveTab === 'workspace' || pengaturanActiveTab === 'company'
                    ? 'Profil Perusahaan'
                    : pengaturanActiveTab === 'users'
                    ? 'Tim & Anggota'
                    : pengaturanActiveTab === 'roles'
                    ? 'Role & Hak Akses'
                    : pengaturanActiveTab === 'notifications'
                    ? 'Notifikasi'
                    : pengaturanActiveTab === 'calculation' || pengaturanActiveTab === 'ded-volume'
                    ? 'DED & Presisi'
                    : pengaturanActiveTab === 'rab' || pengaturanActiveTab === 'estimator'
                    ? 'Standar Estimator'
                    : pengaturanActiveTab === 'master-data'
                    ? 'Master Data & AHSP'
                    : pengaturanActiveTab === 'export' || pengaturanActiveTab === 'documents'
                    ? 'Dokumen & Ekspor'
                    : pengaturanActiveTab === 'schedule'
                    ? 'Kalender & Jadwal'
                    : pengaturanActiveTab === 'cost'
                    ? 'Cost Code & Biaya'
                    : pengaturanActiveTab === 'integrations'
                    ? 'Integrasi'
                    : pengaturanActiveTab === 'audit-log'
                    ? 'Audit Trail'
                    : pengaturanActiveTab === 'security'
                    ? 'Keamanan Akun'
                    : pengaturanActiveTab === 'subscription'
                    ? 'Paket & Billing'
                    : 'Pengaturan Sistem'
                  : undefined
              }
            />

          </div>
        )}



        {/* =========================================================================
            MAIN VIEW (PROYEK, DAFTAR PEKERJAAN, MAGIC AI, QTO, OR DASHBOARD)
           ========================================================================= */}
        {hasRouteError ? (
          <main style={{ padding: '48px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)', display: 'grid', placeItems: 'center' }}>
            <section style={{ maxWidth: '480px', textAlign: 'center', background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '32px' }}>
              <FolderKanban size={32} color="#64748B" style={{ margin: '0 auto 14px' }} />
              <h1 style={{ fontSize: '20px', color: '#0F172A', marginBottom: '8px' }}>{route.scope === 'project' ? 'Proyek tidak ditemukan' : 'Halaman tidak ditemukan'}</h1>
              <p style={{ color: '#64748B', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>{route.scope === 'project' ? 'Tautan ini tidak mengarah ke proyek yang tersedia di workspace Anda.' : 'Tautan workspace ini tidak tersedia atau sudah dipindahkan.'}</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setActiveMenu('dashboard')} style={{ padding: '10px 16px', background: '#2563EB', color: '#fff', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Ke Dashboard Utama</button>
                <button onClick={() => setActiveMenu('proyek', null)} style={{ padding: '10px 16px', background: '#F1F5F9', color: '#334155', borderRadius: '8px', fontWeight: 600, border: '1px solid #CBD5E1', cursor: 'pointer' }}>Lihat Semua Proyek</button>
              </div>
            </section>
          </main>
        ) : activeMenu === 'proyek' ? (
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <ProjectsView
              projects={projects}
              activities={activities}
              initialFilter={projectFilter}
              onFilterChange={(f) => setProjectFilter(f)}
              onCreateProject={() => setCreateModalOpen(true)}
              onOpenMagicAi={() => setActiveMenu('magic-ai')}
              onNavigateToTab={(tab) => setActiveMenu(tab)}
              onOpenProject={(projectId, menu = 'manajemen-proyek') => {
                setCurrentProjectId(projectId);
                setActiveMenu(menu, projectId);
              }}
            />
          </main>
        ) : (activeMenu === 'daftar-pekerjaan' || activeMenu === 'pekerjaan' || activeMenu === 'qto-daftar') ? (
          <main style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: 'calc(100vh - 64px)' }}>
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
          <main style={{ height: `calc(100dvh - ${isMobile ? 56 : 64}px)`, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F2F7FF' }}>
            <EzrabAiView
              onNavigate={(menu) => setActiveMenu(menu)}
              currentMenu={activeMenu}
              activeProject={currentProject ? { id: currentProject.id, name: currentProject.name } : null}
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
              projectTotal={currentProject ? (currentProject.totalRab ?? null) : null}
            />
          </main>
        ) : activeMenu === 'ded-ai' ? (
          <main style={{ minHeight: 'calc(100vh - 64px)', background: '#F2F7FF' }}>
            <DedAiEstimateView onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : activeMenu === 'dokumen-ai' ? (
          <main style={{ minHeight: 'calc(100vh - 64px)', background: '#F2F7FF' }}>
            <DokumenAiView onAnalysisActiveChange={setDocAiAnalysisActive} />
          </main>
        ) : (activeMenu === 'rab-estimasi' ||
             activeMenu === 'rab-spreadsheet' ||
             activeMenu === 'rab-rekapitulasi' ||
             activeMenu === 'rab-analisa-harga' ||
             activeMenu === 'rab-kurva-s' ||
             activeMenu === 'rab-catatan' ||
             activeMenu === 'rab-pengaturan') ? (
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <RabEstimasiView
              key={activeMenu}
              projects={projects}
              initialTab={
                activeMenu === 'rab-rekapitulasi'
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
              onOpenMagicAi={() => setActiveMenu('magic-ai')}
              onNavigateToTab={(tab) => setActiveMenu(tab)}
            />
          </main>
        ) : activeMenu === 'manajemen-proyek' ? (
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <ManajemenProyekView projects={projects} />
          </main>
        ) : (activeMenu === 'ahsp-2026' || activeMenu === 'ahsp' || activeMenu === 'analisa-ahsp') ? (
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <AhspExplorerView
              onAddAhspToRab={(ahsp, volume) => {
                if (currentProject) {
                  createRabItemDirect({
                    code: ahsp.code,
                    ahspCode: ahsp.code,
                    description: ahsp.name,
                    unit: ahsp.unit,
                    volume: volume,
                    unitPrice: ahsp.unitPrice,
                    totalPrice: ahsp.unitPrice * volume,
                    category: ahsp.category || 'Pekerjaan',
                    sectionName: ahsp.category || 'Pekerjaan',
                    laborPrice: ahsp.totalLabor || 0,
                    materialPrice: ahsp.totalMaterial || 0,
                    equipmentPrice: ahsp.totalEquipment || 0,
                  });
                }
              }}
            />
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
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <QtoCalculatorView
              initialCalcId={activeCalcId}
              initialQtoId={activeCalcQtoId || undefined}
              onNavigateToTab={(tab) => setActiveMenu(tab)}
            />
          </main>
        ) : activeMenu === 'template-rab' ? (
          <main style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: 'calc(100vh - 64px)' }}>
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
                    buildingType:
                      template.category === 'RUMAH_TINGGAL'
                        ? 'Rumah Tinggal'
                        : template.category === 'JALAN_TRANSPORTASI' || template.category === 'PERKERASAN' || template.category === 'SDA_IRIGASI'
                        ? 'Infrastruktur'
                        : template.category === 'GEDUNG' || template.category === 'BANGUNAN_TINGGI'
                        ? 'Gedung Kantor'
                        : template.category === 'HOTEL_HOSPITALITY'
                        ? 'Hotel & Resort'
                        : template.category === 'KESEHATAN'
                        ? 'Rumah Sakit / Klinik'
                        : template.category === 'PENDIDIKAN'
                        ? 'Sekolah / Kampus'
                        : template.category === 'INDUSTRI'
                        ? 'Gudang & Pabrik'
                        : template.category === 'LANDSCAPE_SITE'
                        ? 'Landscape & Kawasan'
                        : template.category === 'MEP_SYSTEM'
                        ? 'MEP & Sistem'
                        : template.category === 'RENOVASI_MAINTENANCE'
                        ? 'Renovasi & Maintenance'
                        : 'Custom',
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
          <main style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: 'calc(100vh - 64px)' }}>
            <TenderDocumentsView
              currentProject={currentProject}
              rabItems={projectRabItems}
              scheduleTasks={projectScheduleTasks}
              kurvaSData={projectKurvaSData}
            />
          </main>
        ) : (activeMenu === 'keuangan-proyek' || activeMenu === 'keuangan' || activeMenu === 'termin' || activeMenu === 'invoice' || activeMenu === 'pemasukan' || activeMenu === 'pengeluaran' || activeMenu === 'cash-flow') ? (
          <main style={{ padding: '20px 24px', background: '#F8FAFC', minHeight: 'calc(100vh - 64px)' }}>
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
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
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
          <main style={{ padding: 0, background: '#F8FAFC', minHeight: 'calc(100vh - 64px)' }}>
            <ResourceLibraryView initialTab="SUPPLIERS" onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : (activeMenu === 'kurva-s' || activeMenu === 'jadwal') ? (
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <ManajemenProyekView projects={projects} />
          </main>
        ) : activeMenu === 'export' ? (
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <LaporanView projects={projects} rabItems={projectRabItems} onNavigateToTab={(tab) => setActiveMenu(tab)} />
          </main>
        ) : activeMenu === 'pengaturan' ? (
          <main style={{ padding: '20px 24px', background: '#F2F7FF', minHeight: 'calc(100vh - 64px)' }}>
            <PengaturanView
              initialTab={pengaturanActiveTab}
              initialScope={route.scope === 'project' ? 'PROJECT' : 'GLOBAL'}
              onNavigateTab={(tab) => setActiveMenu(tab)}
            />
          </main>
        ) : activeMenu === 'subscription' ? (
          <main style={{ padding: isNarrowMobile ? '16px 14px' : '24px 28px', background: '#F8FAFC', minHeight: 'calc(100vh - 64px)' }}>
            <PricingSection onSelectPlan={() => setActiveMenu('magic-ai')} />
          </main>
        ) : (
          <main style={{ padding: isNarrowMobile ? '16px 14px' : '24px 28px', background: '#F8FAFC', minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <EzrabAiDashboardView
              projects={projects}
              onCreateProject={() => setCreateModalOpen(true)}
              onSelectProject={(projectId, menu = 'manajemen-proyek') => {
                setCurrentProjectId(projectId);
                setActiveMenu(menu, projectId);
              }}
              onNavigateToTab={(tab, projId) => setActiveMenu(tab, projId)}
              onOpenMagicAi={(mode?: 'chat' | 'ded-rab') => {
                if (mode) {
                  navigateTo(routeForMenu('magic-ai', currentProjectId, mode));
                } else {
                  setActiveMenu('magic-ai');
                }
              }}
              onOpenSubscription={() => setActiveMenu('subscription')}
              onResetData={handleResetData}
              onOpenOnboarding={() => setOnboardingTourOpen(true)}
            />
          </main>
        )}
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
        onOpenMagicAiWithPrompt={(prompt) => {
          setActiveMenu('magic-ai');
        }}
      />

      {/* =========================================================================
          PANDUAN LANGKAH PERTAMA DI DASHBOARD (auto saat belum ada proyek)
         ========================================================================= */}
      <DashboardGuideModal
        open={dashboardGuideOpen}
        onClose={() => setDashboardGuideOpen(false)}
        onStartFirstProject={() => {
          setDashboardGuideOpen(false);
          setCreateModalOpen(true);
        }}
      />

      {/* =========================================================================
          LIGHTWEIGHT ONBOARDING TOUR MODAL (DISMISSIBLE / RE-TRIGGERABLE)
         ========================================================================= */}
      <OnboardingTourModal
        isOpen={onboardingTourOpen}
        onClose={handleCompleteOnboarding}
        onStartFirstProject={() => {
          handleCompleteOnboarding();
          setCreateModalOpen(true);
        }}
      />

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
            onClick={() => setActiveMenu('magic-ai')}
            title={t('nav.bottom_magic_ai')}
            aria-label={t('nav.bottom_magic_ai')}
          >
            <Sparkles size={19} />
          </button>

          <button
            type="button"
            className={`ezrab-bottom-nav-item ${activeMenu === 'qto' || activeMenu === 'qto-vc' || activeMenu === 'qto-rekap' ? 'is-active' : ''}`}
            onClick={() => setActiveMenu('qto')}
            aria-label={t('nav.bottom_qto')}
          >
            <Calculator size={18} />
            <span>QTO</span>
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



      {/* EZRAB Floating Launcher — hidden in AI menus (Single-Mascot Rule):
          each AI menu (Chat AI, DED Estimate AI, Magic AI) has its own
          mascot/interface, so the floating assistant stays out.
          AI Dokumen: visible on the main page, hidden ONLY while the
          contextual analysis workspace is active. */}
      {!['magic-ai', 'ai-assistant', 'ezrab-ai', 'ded-ai'].includes(activeMenu) &&
        !(activeMenu === 'dokumen-ai' && docAiAnalysisActive) && (
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
              setActiveMenu('magic-ai');
            }}
          />
        </>
      )}
    </div>
  );
};

export default WorkspaceView;


