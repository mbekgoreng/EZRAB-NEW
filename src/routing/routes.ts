export type WorkspaceMenu = string;

export type RouteScope = 'public' | 'global' | 'project' | 'account';

export interface WorkspaceRoute {
  scope: Exclude<RouteScope, 'public'>;
  menu: WorkspaceMenu;
  projectId?: string;
  mode?: 'chat' | 'ded-rab' | 'dokumen-ai';
  status: 'ok' | 'not-found';
}

const APP_PREFIX = '/app';
const PROJECTS_PREFIX = `${APP_PREFIX}/projects`;

const normalizePath = (path: string) => {
  const value = path.replace(/\/+$/, '') || '/';
  return value.startsWith('/') ? value : `/${value}`;
};

const projectRoot = (projectId: string) => `${PROJECTS_PREFIX}/${encodeURIComponent(projectId)}`;

export const paths = {
  home: () => '/',
  about: () => '/about',
  app: () => APP_PREFIX,
  projects: (status?: string) => `${PROJECTS_PREFIX}${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  dashboard: () => `${APP_PREFIX}/dashboard`,
  estimate: () => `${APP_PREFIX}/estimate`,
  magicAi: (mode?: 'chat' | 'ded-rab' | 'dokumen-ai') => `${APP_PREFIX}/magic-ai${mode ? `?mode=${mode}` : ''}`,
  ezrabAi: () => `${APP_PREFIX}/ezrab-ai`,
  dedAiEstimate: () => `${APP_PREFIX}/ded-ai`,
  dokumenAi: () => `${APP_PREFIX}/dokumen-ai`,
  volumeCalculation: () => `${APP_PREFIX}/volume-calculation`,
  templates: () => `${APP_PREFIX}/template-rab`,
  ahsp: () => `${APP_PREFIX}/ahsp`,
  qto: () => `${APP_PREFIX}/qto`,
  management: () => `${APP_PREFIX}/management`,
  reports: () => `${APP_PREFIX}/reports`,
  tenderDocuments: () => `${APP_PREFIX}/tender-documents`,
  materialHarga: (type: 'material' | 'labor' | 'equipment' | 'suppliers' | 'project-price' = 'material') => `${APP_PREFIX}/resources?type=${type}`,
  finance: (tab?: string) => `${APP_PREFIX}/finance${tab ? `?tab=${tab}` : ''}`,
  settings: (section?: string) => `${APP_PREFIX}/settings${section ? `/${section}` : ''}`,
  subscription: () => `${APP_PREFIX}/subscription`,
  enterprise: () => `${APP_PREFIX}/enterprise`,
  accountPreferences: () => `${APP_PREFIX}/account/preferences`,
  project: {
    dashboard: (projectId: string) => projectRoot(projectId),
    estimate: (projectId: string, view?: 'work-items') =>
      `${projectRoot(projectId)}/estimate${view ? `?view=${view}` : ''}`,
    qto: (projectId: string, view?: 'calculator') =>
      `${projectRoot(projectId)}/qto${view ? `?view=${view}` : ''}`,
    ahsp: (projectId: string) => `${projectRoot(projectId)}/ahsp`,
    resources: (projectId: string, type: 'material' | 'labor' | 'equipment' | 'suppliers' = 'material') =>
      `${projectRoot(projectId)}/resources?type=${type}`,
    schedule: (projectId: string) => `${projectRoot(projectId)}/schedule`,
    curveS: (projectId: string) => `${projectRoot(projectId)}/curve-s`,
    reports: (projectId: string, view: 'rab' | 'boq' | 'recap' | 'ahsp' = 'rab') =>
      `${projectRoot(projectId)}/reports/${view}`,
    finance: (projectId: string, tab?: string) =>
      `${projectRoot(projectId)}/finance${tab ? `?tab=${tab}` : ''}`,
    settings: (projectId: string) => `${projectRoot(projectId)}/settings`,
    ai: (projectId: string, mode?: 'chat' | 'ded-rab' | 'dokumen-ai') => `${projectRoot(projectId)}/ai${mode ? `?mode=${mode}` : ''}`,
    ezrabAi: (projectId: string) => `${projectRoot(projectId)}/ezrab-ai`,
    dedAiEstimate: (projectId: string) => `${projectRoot(projectId)}/ded-ai`,
    dokumenAi: (projectId: string) => `${projectRoot(projectId)}/dokumen-ai`,
  },
} as const;

export const isAppPath = (pathname: string) => normalizePath(pathname) === APP_PREFIX || normalizePath(pathname).startsWith(`${APP_PREFIX}/`);

export const isSafeInternalReturnTo = (value: string | null) => Boolean(value && value.startsWith('/') && !value.startsWith('//'));

export const navigateTo = (to: string, options: { replace?: boolean } = {}) => {
  const destination = to.startsWith('/') ? to : `/${to}`;
  if (options.replace) window.history.replaceState({}, '', destination);
  else window.history.pushState({}, '', destination);
  window.dispatchEvent(new Event('ezrab:navigate'));
};

export const routeForMenu = (menu: WorkspaceMenu, projectId?: string | null, mode?: 'chat' | 'ded-rab' | 'dokumen-ai'): string => {
  const project = projectId || null;
  if (!project) {
    switch (menu) {
      case 'dashboard': return paths.dashboard();
      case 'proyek': return paths.projects();
      case 'rab-estimasi': return paths.estimate();
      case 'ezrab-ai': return paths.ezrabAi();
      case 'ded-ai': return paths.dedAiEstimate();
      case 'dokumen-ai': return paths.dokumenAi();
      case 'magic-ai':
      case 'ai-assistant': return paths.magicAi(mode);
      case 'volume-calculation':
      case 'qto-vc': return paths.volumeCalculation();
      case 'template-rab': return paths.templates();
      case 'ahsp-2026':
      case 'ahsp':
      case 'analisa-ahsp': return paths.ahsp();
      case 'material-harga':
      case 'database-material':
      case 'material': return paths.materialHarga('material');
      case 'database-upah':
      case 'upah': return paths.materialHarga('labor');
      case 'database-alat':
      case 'alat': return paths.materialHarga('equipment');
      case 'harga-proyek':
      case 'project-price': return paths.materialHarga('project-price');
      case 'resource-library':
      case 'suppliers': return paths.materialHarga('suppliers');
      case 'qto':
      case 'qto-rekap': return paths.qto();
      case 'manajemen-proyek': return paths.management();
      case 'laporan': return paths.reports();
      case 'dokumen-tender': return paths.tenderDocuments();
      case 'keuangan-proyek':
      case 'keuangan':
      case 'termin':
      case 'invoice':
      case 'pemasukan':
      case 'pengeluaran':
      case 'cash-flow': return paths.finance();
      case 'subscription': return paths.subscription();
      case 'enterprise': return paths.enterprise();
      case 'pengaturan': return paths.settings();
      default: return paths.dashboard();
    }
  }

  switch (menu) {
    case 'enterprise': return paths.enterprise();
    case 'dashboard': return paths.dashboard();
    case 'dokumen-tender': return paths.tenderDocuments();
    case 'keuangan-proyek':
    case 'keuangan':
    case 'termin':
    case 'invoice':
    case 'pemasukan':
    case 'pengeluaran':
    case 'cash-flow': return paths.project.finance(project);
    case 'proyek': return paths.projects();
    case 'manajemen-proyek': return paths.project.dashboard(project);
    case 'rab-estimasi': return paths.project.estimate(project);
    case 'daftar-pekerjaan':
    case 'pekerjaan':
    case 'qto-daftar': return paths.project.estimate(project, 'work-items');
    case 'volume-calculation':
    case 'qto-vc': return paths.project.qto(project, 'calculator');
    case 'qto':
    case 'qto-rekap': return paths.project.qto(project);
    case 'template-rab': return paths.templates();
    case 'ahsp-2026':
    case 'ahsp':
    case 'analisa-ahsp': return paths.project.ahsp(project);
    case 'material-harga':
    case 'database-material':
    case 'material': return paths.project.resources(project, 'material');
    case 'database-upah':
    case 'upah': return paths.project.resources(project, 'labor');
    case 'database-alat':
    case 'alat': return paths.project.resources(project, 'equipment');
    case 'harga-proyek':
    case 'project-price': return paths.project.resources(project, 'material');
    case 'resource-library':
    case 'suppliers': return paths.project.resources(project, 'suppliers');
    case 'jadwal': return paths.project.schedule(project);
    case 'kurva-s': return paths.project.curveS(project);
    case 'laporan': return paths.project.reports(project, 'rab');
    case 'boq': return paths.project.reports(project, 'boq');
    case 'rekapitulasi': return paths.project.reports(project, 'recap');
    case 'magic-ai':
    case 'ai-assistant': return paths.project.ai(project, mode);
    case 'ezrab-ai': return paths.project.ezrabAi(project);
    case 'ded-ai': return paths.project.dedAiEstimate(project);
    case 'dokumen-ai': return paths.project.dokumenAi(project);
    case 'subscription': return paths.subscription();
    case 'pengaturan': return paths.project.settings(project);
    default: return paths.project.dashboard(project);
  }
};

export const parseWorkspaceRoute = (pathname: string, search: string = ''): WorkspaceRoute => {
  let cleanPath = pathname;
  let cleanSearch = search;
  if (pathname.includes('?')) {
    const [p, s] = pathname.split('?');
    cleanPath = p;
    cleanSearch = s || search;
  }
  const path = normalizePath(cleanPath);
  const query = new URLSearchParams(cleanSearch);
  const rawMode = query.get('mode');
  const mode = rawMode === 'ded-rab' ? 'ded-rab' : rawMode === 'dokumen-ai' || rawMode === 'dokumen' ? 'dokumen-ai' : rawMode === 'chat' ? 'chat' : undefined;

  // Global routes
  if (path === APP_PREFIX || path === `${APP_PREFIX}/dashboard`) return { scope: 'global', menu: 'dashboard', status: 'ok' };
  if (path === `${APP_PREFIX}/projects`) return { scope: 'global', menu: 'proyek', status: 'ok' };
  if (path === `${APP_PREFIX}/estimate`) return { scope: 'global', menu: 'rab-estimasi', status: 'ok' };
  if (path === `${APP_PREFIX}/magic-ai` || path === `${APP_PREFIX}/ai`) return { scope: 'global', menu: 'magic-ai', mode, status: 'ok' };
  if (path === `${APP_PREFIX}/ezrab-ai`) return { scope: 'global', menu: 'ezrab-ai', status: 'ok' };
  if (path === `${APP_PREFIX}/ded-ai`) return { scope: 'global', menu: 'ded-ai', status: 'ok' };
  if (path === `${APP_PREFIX}/dokumen-ai`) return { scope: 'global', menu: 'dokumen-ai', status: 'ok' };
  if (path === `${APP_PREFIX}/volume-calculation` || path === `${APP_PREFIX}/qto-vc`) return { scope: 'global', menu: 'qto-vc', status: 'ok' };
  if (path === `${APP_PREFIX}/template-rab` || path === `${APP_PREFIX}/templates`) return { scope: 'global', menu: 'template-rab', status: 'ok' };
  if (path === `${APP_PREFIX}/ahsp`) return { scope: 'global', menu: 'ahsp-2026', status: 'ok' };
  if (path === `${APP_PREFIX}/qto`) return { scope: 'global', menu: 'qto', status: 'ok' };
  if (path === `${APP_PREFIX}/management`) return { scope: 'global', menu: 'manajemen-proyek', status: 'ok' };
  if (path === `${APP_PREFIX}/reports`) return { scope: 'global', menu: 'laporan', status: 'ok' };
  if (path === `${APP_PREFIX}/tender-documents`) return { scope: 'global', menu: 'dokumen-tender', status: 'ok' };
  if (path === `${APP_PREFIX}/finance` || path === `${APP_PREFIX}/keuangan` || path === `${APP_PREFIX}/keuangan-proyek`) return { scope: 'global', menu: 'keuangan-proyek', status: 'ok' };
  if (path === `${APP_PREFIX}/enterprise`) return { scope: 'global', menu: 'enterprise', status: 'ok' };
  if (path === `${APP_PREFIX}/subscription`) return { scope: 'global', menu: 'subscription', status: 'ok' };
  if (path === `${APP_PREFIX}/resources` || path === `${APP_PREFIX}/material-harga`) {
    const type = query.get('type');
    return {
      scope: 'global',
      menu:
        type === 'labor'
          ? 'database-upah'
          : type === 'equipment'
          ? 'database-alat'
          : type === 'project-price'
          ? 'harga-proyek'
          : type === 'suppliers'
          ? 'suppliers'
          : 'database-material',
      status: 'ok',
    };
  }
  if (path === `${APP_PREFIX}/settings` || path.startsWith(`${APP_PREFIX}/settings/`) || path === `${APP_PREFIX}/account/preferences`) {
    return { scope: 'account', menu: 'pengaturan', status: 'ok' };
  }

  // Project-scoped routes: /app/projects/:projectId/...
  const match = path.match(/^\/app\/projects\/([^/]+)(?:\/(.*))?$/);
  if (!match) return { scope: 'global', menu: 'dashboard', status: 'not-found' };

  const projectId = decodeURIComponent(match[1]);
  const module = match[2] || 'dashboard';
  const base = { scope: 'project' as const, projectId, status: 'ok' as const };
  if (module === 'dashboard') return { ...base, menu: 'manajemen-proyek' };
  if (module === 'estimate') return { ...base, menu: query.get('view') === 'work-items' ? 'daftar-pekerjaan' : 'rab-estimasi' };
  if (module === 'qto') return { ...base, menu: query.get('view') === 'calculator' ? 'qto-vc' : 'qto' };
  if (module === 'ahsp') return { ...base, menu: 'ahsp-2026' };
  if (module === 'resources') {
    const type = query.get('type');
    return { ...base, menu: type === 'labor' ? 'database-upah' : type === 'equipment' ? 'database-alat' : type === 'suppliers' ? 'suppliers' : 'database-material' };
  }
  if (module === 'schedule') return { ...base, menu: 'jadwal' };
  if (module === 'curve-s') return { ...base, menu: 'kurva-s' };
  if (module === 'ai' || module === 'magic-ai') return { ...base, menu: 'magic-ai', mode };
  if (module === 'ai-assistant' || module === 'copilot') return { ...base, menu: 'ai-assistant', mode };
  if (module === 'ezrab-ai') return { ...base, menu: 'ezrab-ai' };
  if (module === 'ded-ai') return { ...base, menu: 'ded-ai' };
  if (module === 'dokumen-ai') return { ...base, menu: 'dokumen-ai' };
  if (module === 'reports/rab' || module === 'reports') return { ...base, menu: 'laporan' };
  if (module === 'reports/boq') return { ...base, menu: 'boq' };
  if (module === 'reports/recap') return { ...base, menu: 'rekapitulasi' };
  if (module === 'reports/ahsp') return { ...base, menu: 'analisa-ahsp' };
  if (module === 'finance' || module === 'keuangan' || module === 'keuangan-proyek') return { ...base, menu: 'keuangan-proyek' };
  if (module === 'settings') return { ...base, menu: 'pengaturan' };

  return { scope: 'project', projectId, menu: 'manajemen-proyek', status: 'not-found' };
};

export const routeLabel = (route: WorkspaceRoute) => {
  const labels: Record<string, string> = {
    dashboard: 'Dashboard',
    proyek: 'Proyek',
    'manajemen-proyek': 'Manajemen Proyek',
    'rab-estimasi': 'RAB & Estimasi',
    'daftar-pekerjaan': 'Daftar Pekerjaan',
    qto: 'QTO',
    'qto-vc': 'Volume Calculation',
    'template-rab': 'Template RAB',
    'ahsp-2026': 'AHSP',
    'database-material': 'Material & Harga',
    'database-upah': 'Standar Upah',
    'database-alat': 'Tarif Peralatan',
    suppliers: 'Supplier & Vendor',
    'dokumen-tender': 'Dokumen Proyek',
    'keuangan-proyek': 'Keuangan Proyek',
    jadwal: 'Schedule',
    'kurva-s': 'Kurva S',
    laporan: 'Laporan',
    boq: 'Laporan BOQ',
    rekapitulasi: 'Rekapitulasi',
    'analisa-ahsp': 'Laporan AHSP',
    'magic-ai': 'EZRAB Magic AI',
    'ai-assistant': 'EZRAB AI Copilot',
    'ezrab-ai': 'EZRAB AI',
    'ded-ai': 'DED AI Estimate',
    'dokumen-ai': 'Dokumen AI',
    pengaturan: 'Pengaturan',
    subscription: 'Subscription',
  };
  return labels[route.menu] || 'EZRAB';
};
