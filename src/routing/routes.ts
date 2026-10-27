export type WorkspaceMenu = string;

export type RouteScope = 'public' | 'global' | 'project' | 'account';

/** Parameter state explorer AHSP di URL (F-05). Hanya field yang terisi yang ditulis ke URL. */
export interface AhspRouteParams {
  q?: string;
  domain?: string;
  kategori?: string;
  page?: number;
}

export interface WorkspaceRoute {
  scope: Exclude<RouteScope, 'public'>;
  menu: WorkspaceMenu;
  projectId?: string;
  mode?: 'chat' | 'ded-rab' | 'dokumen-ai';
  /** Hadir hanya bila /app/ahsp dibuka dengan ≥1 parameter — tanpanya hasil parse tak berubah (kompatibilitas tes round-trip). */
  ahsp?: AhspRouteParams;
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
  login: () => '/masuk',
  signup: () => '/daftar',
  loginRole: () => '/masuk/role',
  app: () => APP_PREFIX,
  projects: (status?: string) => `${PROJECTS_PREFIX}${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  // /app/pekerjaan: alias publik Daftar Pekerjaan (parse sudah mengenalnya;
  // routeForMenu kini memakainya agar klik menu global tidak jatuh dashboard).
  pekerjaan: () => `${APP_PREFIX}/pekerjaan`,
  schedule: () => `${APP_PREFIX}/schedule`,
  curveS: () => `${APP_PREFIX}/curve-s`,
  dashboard: () => `${APP_PREFIX}/dashboard`,
  // tab: sub-menu RAB (spreadsheet|rekapitulasi|analisa-harga|kurva-s|catatan|pengaturan).
  // Tanpa tab = tab default (spreadsheet). Dipakai routeForMenu agar klik sub-menu
  // sidebar tidak jatuh ke default (dashboard) lalu menimpa activeMenu via sinkronisasi route.
  estimate: (tab?: string) => `${APP_PREFIX}/estimate${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`,
  magicAi: (mode?: 'chat' | 'ded-rab' | 'dokumen-ai') => `${APP_PREFIX}/magic-ai${mode ? `?mode=${mode}` : ''}`,
  ezrabAi: () => `${APP_PREFIX}/ezrab-ai`,
  dedAiEstimate: () => `${APP_PREFIX}/ded-ai`,
  // Chat-to-RAB Workspace (Fase 3): halaman penuh desain → QTO → RAB.
  desainRab: () => `${APP_PREFIX}/desain-rab`,
  dokumenAi: () => `${APP_PREFIX}/dokumen-ai`,
  kreditAi: () => `${APP_PREFIX}/kredit-ai`,
  volumeCalculation: () => `${APP_PREFIX}/volume-calculation`,
  templates: () => `${APP_PREFIX}/template-rab`,
  ahsp: (params?: AhspRouteParams) => {
    const qs = new URLSearchParams();
    if (params?.q?.trim()) qs.set('q', params.q.trim());
    if (params?.domain && params.domain !== 'ALL') qs.set('domain', params.domain);
    if (params?.kategori && params.kategori !== 'ALL') qs.set('kategori', params.kategori);
    if (params?.page && params.page > 1) qs.set('page', String(params.page));
    const s = qs.toString();
    return `${APP_PREFIX}/ahsp${s ? `?${s}` : ''}`;
  },
  qto: () => `${APP_PREFIX}/qto`,
  management: () => `${APP_PREFIX}/management`,
  reports: (view?: 'rab' | 'boq' | 'recap' | 'ahsp') => `${APP_PREFIX}/reports${view && view !== 'rab' ? `/${view}` : ''}`,
  tenderDocuments: () => `${APP_PREFIX}/tender-documents`,
  materialHarga: (type: 'material' | 'labor' | 'equipment' | 'suppliers' | 'project-price' = 'material') => `${APP_PREFIX}/resources?type=${type}`,
  finance: (tab?: string) => `${APP_PREFIX}/finance${tab ? `?tab=${tab}` : ''}`,
  settings: (section?: string) => `${APP_PREFIX}/settings${section ? `/${section}` : ''}`,
  subscription: () => `${APP_PREFIX}/subscription`,
  enterprise: () => `${APP_PREFIX}/enterprise`,
  // CMS blog — workspace internal, tidak tampil di sidebar publik.
  blogAdmin: () => `${APP_PREFIX}/blog`,
  accountPreferences: () => `${APP_PREFIX}/account/preferences`,
  project: {
    dashboard: (projectId: string) => projectRoot(projectId),
    estimate: (projectId: string, view?: 'work-items', tab?: string) =>
      `${projectRoot(projectId)}/estimate${view ? `?view=${view}` : tab ? `?tab=${encodeURIComponent(tab)}` : ''}`,
    qto: (projectId: string, view?: 'calculator') =>
      `${projectRoot(projectId)}/qto${view ? `?view=${view}` : ''}`,
    ahsp: (projectId: string) => `${projectRoot(projectId)}/ahsp`,
    resources: (projectId: string, type: 'material' | 'labor' | 'equipment' | 'suppliers' | 'project-price' = 'material') =>
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
    desainRab: (projectId: string) => `${projectRoot(projectId)}/desain-rab`,
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
      case 'rab-informasi-proyek': return paths.estimate('informasi-proyek');
      case 'rab-spreadsheet': return paths.estimate('spreadsheet');
      case 'rab-rekapitulasi': return paths.estimate('rekapitulasi');
      case 'rab-analisa-harga': return paths.estimate('analisa-harga');
      case 'rab-kurva-s': return paths.estimate('kurva-s');
      case 'rab-catatan': return paths.estimate('catatan');
      case 'rab-pengaturan': return paths.estimate('pengaturan');
      // Daftar Pekerjaan global: parse mengenal /app/pekerjaan, jadi klik
      // menu tanpa proyek tidak boleh jatuh ke default dashboard (kelas bug
      // fidelity 2026-10-19; audit routing 2026-10-23).
      case 'daftar-pekerjaan':
      case 'pekerjaan':
      case 'qto-daftar': return paths.pekerjaan();
      case 'ezrab-ai': return paths.ezrabAi();
      case 'desain-rab': return paths.desainRab();
      // 'ded-rab' = Magic AI mode ded-rab (satu view dengan magic-ai).
      case 'ded-rab': return paths.magicAi('ded-rab');
      case 'ded-ai': return paths.dedAiEstimate();
      case 'dokumen-ai': return paths.dokumenAi();
      case 'kredit-ai': return paths.kreditAi();
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
      // 'harga' = alias lama grup material di WorkspaceView.
      case 'harga': return paths.materialHarga('material');
      case 'qto':
      case 'qto-rekap': return paths.qto();
      case 'manajemen-proyek': return paths.management();
      // Jadwal & Kurva S global dirender ManajemenProyekView (section) —
      // sebelumnya tanpa case: klik tab dari halaman global menimpa menu
      // menjadi dashboard via sinkronisasi route (audit routing 2026-10-23).
      case 'jadwal': return paths.schedule();
      case 'kurva-s': return paths.curveS();
      case 'laporan': return paths.reports();
      case 'boq': return paths.reports('boq');
      case 'rekapitulasi': return paths.reports('recap');
      // 'export' merender LaporanView yang sama dengan 'laporan'.
      case 'export': return paths.reports();
      // Blog CMS global (tanpa sidebar) — sama seperti kredit-ai.
      case 'blog-admin': return paths.blogAdmin();
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
    // Kredit AI selalu halaman global (bukan per-proyek).
    case 'kredit-ai': return paths.kreditAi();
    case 'rab-estimasi': return paths.project.estimate(project);
    case 'rab-informasi-proyek': return paths.project.estimate(project, undefined, 'informasi-proyek');
    case 'rab-spreadsheet': return paths.project.estimate(project, undefined, 'spreadsheet');
    case 'rab-rekapitulasi': return paths.project.estimate(project, undefined, 'rekapitulasi');
    case 'rab-analisa-harga': return paths.project.estimate(project, undefined, 'analisa-harga');
    case 'rab-kurva-s': return paths.project.estimate(project, undefined, 'kurva-s');
    case 'rab-catatan': return paths.project.estimate(project, undefined, 'catatan');
    case 'rab-pengaturan': return paths.project.estimate(project, undefined, 'pengaturan');
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
    case 'project-price': return paths.project.resources(project, 'project-price');
    case 'resource-library':
    case 'suppliers': return paths.project.resources(project, 'suppliers');
    case 'jadwal': return paths.project.schedule(project);
    case 'kurva-s': return paths.project.curveS(project);
    // 'harga' = alias lama grup material di WorkspaceView.
    case 'harga': return paths.project.resources(project, 'material');
    case 'laporan': return paths.project.reports(project, 'rab');
    // 'export' merender LaporanView yang sama dengan 'laporan'.
    case 'export': return paths.project.reports(project, 'rab');
    // Blog CMS selalu halaman global (bukan per-proyek).
    case 'blog-admin': return paths.blogAdmin();
    case 'boq': return paths.project.reports(project, 'boq');
    case 'rekapitulasi': return paths.project.reports(project, 'recap');
    case 'magic-ai':
    case 'ai-assistant': return paths.project.ai(project, mode);
    case 'ded-rab': return paths.project.ai(project, 'ded-rab');
    case 'ezrab-ai': return paths.project.ezrabAi(project);
    case 'desain-rab': return paths.project.desainRab(project);
    case 'ded-ai': return paths.project.dedAiEstimate(project);
    case 'dokumen-ai': return paths.project.dokumenAi(project);
    case 'subscription': return paths.subscription();
    case 'pengaturan': return paths.project.settings(project);
    default: return paths.project.dashboard(project);
  }
};

/** Peta ?tab= pada route estimate -> id menu sidebar RAB yang tepat. */
const estimateTabToMenu = (tab: string | null): WorkspaceMenu => {
  switch (tab) {
    case 'informasi-proyek': return 'rab-informasi-proyek';
    case 'spreadsheet': return 'rab-spreadsheet';
    case 'rekapitulasi': return 'rab-rekapitulasi';
    case 'analisa-harga': return 'rab-analisa-harga';
    case 'kurva-s': return 'rab-kurva-s';
    case 'catatan': return 'rab-catatan';
    case 'pengaturan': return 'rab-pengaturan';
    default: return 'rab-estimasi';
  }
};

const AHSP_ROUTE_DOMAINS = ['SMKK', 'SUMBER_DAYA_AIR', 'BINA_MARGA', 'CIPTA_KARYA'];

/** Parse ?q=&domain=&kategori=&page= untuk /app/ahsp (F-05). Nilai tak valid dibuang; undefined bila tak ada parameter. */
const parseAhspParams = (query: URLSearchParams): AhspRouteParams | undefined => {
  const q = query.get('q')?.trim() || undefined;
  const rawDomain = query.get('domain');
  const domain = rawDomain && AHSP_ROUTE_DOMAINS.includes(rawDomain) ? rawDomain : undefined;
  const kategori = query.get('kategori')?.trim() || undefined;
  const rawPage = query.get('page');
  const pageNum = rawPage ? parseInt(rawPage, 10) : NaN;
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : undefined;
  if (!q && !domain && !kategori && !page) return undefined;
  return { ...(q ? { q } : {}), ...(domain ? { domain } : {}), ...(kategori ? { kategori } : {}), ...(page ? { page } : {}) };
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
  if (path === `${APP_PREFIX}/estimate`) return { scope: 'global', menu: estimateTabToMenu(query.get('tab')), status: 'ok' };
  if (path === `${APP_PREFIX}/magic-ai` || path === `${APP_PREFIX}/ai`) return { scope: 'global', menu: 'magic-ai', mode, status: 'ok' };
  if (path === `${APP_PREFIX}/ezrab-ai`) return { scope: 'global', menu: 'ezrab-ai', status: 'ok' };
  if (path === `${APP_PREFIX}/desain-rab`) return { scope: 'global', menu: 'desain-rab', status: 'ok' };
  if (path === `${APP_PREFIX}/ded-ai`) return { scope: 'global', menu: 'ded-ai', status: 'ok' };
  if (path === `${APP_PREFIX}/dokumen-ai`) return { scope: 'global', menu: 'dokumen-ai', status: 'ok' };
  // /app/kredit-ai: halaman Kredit AI (Phase 1 frontend — simulasi, tanpa sidebar).
  if (path === `${APP_PREFIX}/kredit-ai`) return { scope: 'global', menu: 'kredit-ai', status: 'ok' };
  if (path === `${APP_PREFIX}/volume-calculation` || path === `${APP_PREFIX}/qto-vc`) return { scope: 'global', menu: 'qto-vc', status: 'ok' };
  // /app/pekerjaan: alias publik untuk Daftar Pekerjaan (temuan audit 2026-10-13:
  // route ini 404). Di-render oleh DaftarPekerjaanView via menu 'daftar-pekerjaan'.
  if (path === `${APP_PREFIX}/pekerjaan`) return { scope: 'global', menu: 'daftar-pekerjaan', status: 'ok' };
  if (path === `${APP_PREFIX}/template-rab` || path === `${APP_PREFIX}/templates`) return { scope: 'global', menu: 'template-rab', status: 'ok' };
  if (path === `${APP_PREFIX}/ahsp`) {
    const ahsp = parseAhspParams(query);
    return { scope: 'global', menu: 'ahsp-2026', status: 'ok', ...(ahsp ? { ahsp } : {}) };
  }
  if (path === `${APP_PREFIX}/qto`) return { scope: 'global', menu: 'qto', status: 'ok' };
  if (path === `${APP_PREFIX}/management`) return { scope: 'global', menu: 'manajemen-proyek', status: 'ok' };
  if (path === `${APP_PREFIX}/schedule`) return { scope: 'global', menu: 'jadwal', status: 'ok' };
  if (path === `${APP_PREFIX}/curve-s`) return { scope: 'global', menu: 'kurva-s', status: 'ok' };
  if (path === `${APP_PREFIX}/reports`) return { scope: 'global', menu: 'laporan', status: 'ok' };
  // Sub-path laporan global — cermin perilaku proyek (reports/ahsp tetap
  // membuka Laporan, bukan explorer AHSP; lihat catatan F6 di scope proyek).
  if (path === `${APP_PREFIX}/reports/boq`) return { scope: 'global', menu: 'boq', status: 'ok' };
  if (path === `${APP_PREFIX}/reports/recap`) return { scope: 'global', menu: 'rekapitulasi', status: 'ok' };
  if (path === `${APP_PREFIX}/reports/rab` || path === `${APP_PREFIX}/reports/ahsp`) return { scope: 'global', menu: 'laporan', status: 'ok' };
  if (path === `${APP_PREFIX}/tender-documents`) return { scope: 'global', menu: 'dokumen-tender', status: 'ok' };
  if (path === `${APP_PREFIX}/finance` || path === `${APP_PREFIX}/keuangan` || path === `${APP_PREFIX}/keuangan-proyek`) return { scope: 'global', menu: 'keuangan-proyek', status: 'ok' };
  // /app/enterprise: TIDAK diaktifkan (2026-10-17). Komponen
  // `EnterpriseEntryPage` ada di src/components/enterprise/ tetapi tidak
  // pernah di-mount di WorkspaceView (area tim UI). Sebelum wiring itu ada,
  // route ini harus jujur 404 daripada diam-diam menampilkan dashboard.
  if (path === `${APP_PREFIX}/enterprise`) return { scope: 'global', menu: 'enterprise', status: 'not-found' };
  if (path === `${APP_PREFIX}/subscription`) return { scope: 'global', menu: 'subscription', status: 'ok' };
  // /app/blog: CMS blog — hanya untuk sesi role dengan capability 'manage-blog'
  // (gate di BlogAdminPage). Sengaja tidak dimasukkan ke sidebar publik.
  if (path === `${APP_PREFIX}/blog`) return { scope: 'global', menu: 'blog-admin', status: 'ok' };
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
  if (module === 'estimate') {
    if (query.get('view') === 'work-items') return { ...base, menu: 'daftar-pekerjaan' };
    return { ...base, menu: estimateTabToMenu(query.get('tab')) };
  }
  if (module === 'qto') return { ...base, menu: query.get('view') === 'calculator' ? 'qto-vc' : 'qto' };
  if (module === 'ahsp') return { ...base, menu: 'ahsp-2026' };
  if (module === 'resources') {
    const type = query.get('type');
    return {
      ...base,
      menu:
        type === 'labor'
          ? 'database-upah'
          : type === 'equipment'
          ? 'database-alat'
          : type === 'suppliers'
          ? 'suppliers'
          : type === 'project-price'
          ? 'harga-proyek'
          : 'database-material',
    };
  }
  if (module === 'schedule') return { ...base, menu: 'jadwal' };
  if (module === 'curve-s') return { ...base, menu: 'kurva-s' };
  if (module === 'ai' || module === 'magic-ai') return { ...base, menu: 'magic-ai', mode };
  if (module === 'ai-assistant' || module === 'copilot') return { ...base, menu: 'ai-assistant', mode };
  if (module === 'ezrab-ai') return { ...base, menu: 'ezrab-ai' };
  if (module === 'desain-rab') return { ...base, menu: 'desain-rab' };
  if (module === 'ded-ai') return { ...base, menu: 'ded-ai' };
  if (module === 'dokumen-ai') return { ...base, menu: 'dokumen-ai' };
  if (module === 'reports/rab' || module === 'reports') return { ...base, menu: 'laporan' };
  if (module === 'reports/boq') return { ...base, menu: 'boq' };
  if (module === 'reports/recap') return { ...base, menu: 'rekapitulasi' };
  // reports/ahsp = "Laporan AHSP" → buka Laporan (LaporanView), BUKAN
  // AhspExplorerView — label laporan tidak boleh membuka explorer (F6).
  // Menu 'analisa-ahsp' tetap dipakai route /ahsp (explorer) itu sendiri.
  if (module === 'reports/ahsp') return { ...base, menu: 'laporan' };
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
    'rab-spreadsheet': 'RAB Spreadsheet',
    'rab-rekapitulasi': 'Rekapitulasi RAB',
    'rab-analisa-harga': 'Analisa Harga',
    'rab-kurva-s': 'Kurva S',
    'rab-catatan': 'Catatan',
    'rab-pengaturan': 'Pengaturan RAB',
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
    'kredit-ai': 'Kredit AI',
    pengaturan: 'Pengaturan',
    subscription: 'Subscription',
    'blog-admin': 'Blog CMS',
  };
  return labels[route.menu] || 'EZRAB';
};
