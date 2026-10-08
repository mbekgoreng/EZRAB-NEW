import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Project,
  RabItem,
  CalculationRun,
  QTOItem,
  QTOItemRABMapping,
  ManualOverrideAudit,
  RABSection,
  RABItem,
  ProjectCostSummary,
  ScheduleTask,
  KurvaSDataPoint,
  ProjectPriceOverride,
  ProjectVersionSnapshot,
  EstimateVersion,
  EstimateScenario,
  QTOSourceType,
  QTOItemStatus,
  VolumeSourceType,
  WorkItem,
  WorkItemStatus,
} from '../types';
import { CONSTRUCTION_CALCULATORS, getCalculatorById } from '../engine/constructionCalculators/registry';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { resolveQtoSyncPrice, resolveQtoSyncCode } from '../lib/qtoSyncPricing';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { projectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { resolveInitialProjects } from '../lib/demoSeed';

export interface SourceTraceLineage {
  qto?: QTOItem;
  sourceCalculator?: string;
  parameters?: Record<string, any>;
  formula?: string;
  linkedRabItem?: RabItem;
  usedInDownstream: {
    rab: boolean;
    boq: boolean;
    rekapitulasi: boolean;
    schedule: boolean;
    laporan: boolean;
  };
}

interface ProjectContextType {
  // 1. Projects Root
  projects: Project[];
  currentProjectId: string | null;
  currentProject: Project | null;
  setCurrentProjectId: (id: string | null) => void;
  createProject: (projectData: Partial<Project>) => Project;
  updateProject: (id: string, projectData: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  backupProjectData: (id: string) => any;

  // 2. Work Items (Daftar Pekerjaan Master Workspace)
  allWorkItems: WorkItem[];
  projectWorkItems: WorkItem[];
  createWorkItem: (item: Omit<WorkItem, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'totalAmount'>) => WorkItem;
  updateWorkItem: (id: string, updates: Partial<WorkItem>) => void;
  deleteWorkItem: (id: string) => void;
  duplicateWorkItem: (id: string) => WorkItem;
  bulkSyncWorkItemsToQto: (ids: string[]) => void;
  bulkSyncWorkItemsToRab: (ids: string[]) => void;
  linkAhspToWorkItem: (
    workItemId: string,
    ahsp: {
      code: string;
      name: string;
      unitPrice: number;
      unit?: string;
      laborPrice?: number;
      materialPrice?: number;
      equipmentPrice?: number;
    }
  ) => void;

  // 3. Calculation Runs
  calculationRuns: CalculationRun[];
  projectCalculationRuns: CalculationRun[];
  getCalculationRun: (runId: string) => CalculationRun | undefined;

  // 4. QTO Master Quantity Takeoff
  qtoItems: QTOItem[];
  projectQtoItems: QTOItem[];
  getQtoItem: (qtoId: string) => QTOItem | undefined;
  createManualQtoItem: (data: {
    kode?: string;
    uraian: string;
    quantity: number;
    unit: string;
    category?: string;
    notes?: string;
  }) => QTOItem;
  deleteQtoItem: (qtoItemId: string) => { success: boolean; message?: string; affectedRabCount?: number };
  checkQtoDependencies: (qtoItemId: string) => { rabItems: RabItem[]; canDeleteSafely: boolean };

  // 5. Mappings & Traceability
  mappings: QTOItemRABMapping[];
  projectMappings: QTOItemRABMapping[];
  getSourceTrace: (qtoIdOrRabId: string) => SourceTraceLineage;

  // 6. Master RAB & Cost Estimation
  allRabItems: RabItem[];
  projectRabItems: RabItem[];
  executeCalculationAndSave: (
    calculatorId: string,
    inputs: Record<string, number>,
    options?: {
      targetQtoId?: string;
      notes?: string;
      autoSyncRab?: boolean;
      targetSectionName?: string;
      ahspCode?: string;
      unitPrice?: number;
    }
  ) => { run: CalculationRun; qto: QTOItem; updatedRabItem?: RabItem };

  syncQtoToRabSpreadsheet: (
    qtoItemId: string,
    targetSectionName?: string,
    ahspCode?: string,
    customUnitPrice?: number
  ) => RabItem;

  updateRabItemManualOverride: (
    rabItemId: string,
    newVolume: number,
    reason: string
  ) => void;

  updateRabItemUnitPrice: (
    rabItemId: string,
    newUnitPrice: number
  ) => void;
  createRabItemDirect: (item: Partial<RabItem> & { description: string; volume: number; unit: string }) => RabItem;
  bulkAddRabItems: (
    items: Array<Partial<RabItem> & { description: string; volume: number; unit: string }>,
    targetProjectId?: string
  ) => RabItem[];
  updateRabItemFull: (rabItemId: string, updates: Partial<RabItem>) => void;
  deleteRabItem: (rabItemId: string) => void;
  bulkDeleteRabItems: (rabItemIds: string[]) => void;
  replaceProjectRabItems: (items: RabItem[], targetProjectId?: string) => void;

  // 6. Schedule & Kurva S
  projectScheduleTasks: ScheduleTask[];
  projectKurvaSData: KurvaSDataPoint[];
  addScheduleTask: (task: Omit<ScheduleTask, 'id' | 'projectId'>) => ScheduleTask;
  updateScheduleTask: (taskId: string, updates: Partial<ScheduleTask>) => void;
  deleteScheduleTask: (taskId: string) => void;

  // 7. Project Resource Price Overrides
  projectPriceOverrides: ProjectPriceOverride[];
  updateProjectPriceOverride: (
    resourceCode: string,
    resourceName: string,
    category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
    unit: string,
    masterPrice: number,
    projectPrice: number
  ) => void;
  resetProjectPriceOverride: (resourceCode: string) => void;

  // 8. Version History, Scenarios & Autosave State
  estimateVersions: EstimateVersion[];
  projectEstimateVersions: EstimateVersion[];
  createEstimateVersion: (label: string, description: string, revisionNotes?: string, targetProjectId?: string) => EstimateVersion;
  restoreEstimateVersion: (versionId: string) => { success: boolean; message: string };
  updateEstimateVersionNotes: (versionId: string, notes: string) => void;
  applyScenarioToActiveProject: (scenario: EstimateScenario) => void;
  projectVersions: ProjectVersionSnapshot[];
  createVersionSnapshot: (description: string) => ProjectVersionSnapshot;
  saveStatus: 'saved' | 'saving' | 'dirty';

  // 9. Data Utilities
  loadProjectTemplate: (templateName?: string) => Project;
  resetAllProductionData: () => void;
}

export const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const DEFAULT_FLAGSHIP_PROJECT_ID = 'PRJ-RUMAH-2LT-01';

const DEFAULT_FLAGSHIP_PROJECT: Project = {
  id: DEFAULT_FLAGSHIP_PROJECT_ID,
  projectNumber: 'PRJ-2026-001',
  name: 'Rumah Tinggal 2 Lantai',
  client: 'Ir. Hendra Kusuma',
  clientName: 'Ir. Hendra Kusuma',
  location: 'Jakarta Selatan',
  buildingType: 'Rumah Tinggal',
  status: 'draft',
  progress: 0,
  totalRab: 0,
  createdAt: '2026-09-19T08:00:00.000Z',
  updatedAt: '2026-09-19T10:24:00.000Z',
  itemsCount: 7,
  sections: [],
  costSummary: {
    directCost: 732532724,
    overheadPercent: 5,
    overheadAmount: 36626636,
    profitPercent: 5,
    profitAmount: 36626636,
    contingencyPercent: 0,
    contingencyAmount: 0,
    directorMarkupPercent: 0,
    directorMarkupNominal: 0,
    directorMarkupTotal: 0,
    showMarkupToEditor: false,
    showMarkupToClient: false,
    subtotalBeforeTax: 805786000,
    taxPercent: 11,
    taxAmount: 7325324,
    grandTotal: 813111324,
    costPerM2: 2450000,
  },
};

export const DEFAULT_PORTFOLIO_PROJECTS: Project[] = [
  DEFAULT_FLAGSHIP_PROJECT,
  {
    id: 'PRJ-KANTOR-BDG-02',
    projectNumber: 'PRJ-2026-002',
    name: 'Gedung Perkantoran',
    client: 'PT Ruang Kreatif Nusantara',
    clientName: 'PT Ruang Kreatif Nusantara',
    location: 'Bandung',
    buildingType: 'Gedung Kantor',
    status: 'in_progress',
    progress: 35,
    totalRab: 0,
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-18T14:12:00.000Z',
    itemsCount: 14,
    sections: [],
    costSummary: {
      directCost: 8054054054,
      overheadPercent: 5,
      overheadAmount: 402702702,
      profitPercent: 5,
      profitAmount: 402702702,
      contingencyPercent: 0,
      contingencyAmount: 0,
      directorMarkupPercent: 0,
      directorMarkupNominal: 0,
      directorMarkupTotal: 0,
      showMarkupToEditor: false,
      showMarkupToClient: false,
      subtotalBeforeTax: 8859459458,
      taxPercent: 11,
      taxAmount: 80540542,
      grandTotal: 8940000000,
      costPerM2: 5200000,
    },
  },
  {
    id: 'PRJ-SEKOLAH-SBY-03',
    projectNumber: 'PRJ-2026-003',
    name: 'Renovasi Sekolah',
    client: 'Yayasan Pendidikan Wijaya',
    clientName: 'Yayasan Pendidikan Wijaya',
    location: 'Surabaya',
    buildingType: 'Sekolah / Kampus',
    status: 'in_progress',
    progress: 70,
    totalRab: 0,
    createdAt: '2026-09-17T08:00:00.000Z',
    updatedAt: '2026-09-17T09:03:00.000Z',
    itemsCount: 18,
    sections: [],
    costSummary: {
      directCost: 3200000000,
      overheadPercent: 5,
      overheadAmount: 160000000,
      profitPercent: 5,
      profitAmount: 160000000,
      contingencyPercent: 0,
      contingencyAmount: 0,
      directorMarkupPercent: 0,
      directorMarkupNominal: 0,
      directorMarkupTotal: 0,
      showMarkupToEditor: false,
      showMarkupToClient: false,
      subtotalBeforeTax: 3520000000,
      taxPercent: 11,
      taxAmount: 387200000,
      grandTotal: 3907200000,
      costPerM2: 3200000,
    },
  },
  {
    id: 'PRJ-FASILITAS-SMG-04',
    projectNumber: 'PRJ-2026-004',
    name: 'Pembangunan Fasilitas Publik',
    client: 'Dinas PUPR Semarang',
    clientName: 'Dinas PUPR Semarang',
    location: 'Semarang',
    buildingType: 'Gudang & Pabrik',
    status: 'completed',
    progress: 100,
    totalRab: 5750000000,
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-09-15T11:00:00.000Z',
    itemsCount: 22,
    sections: [],
    costSummary: {
      directCost: 5180180180,
      overheadPercent: 5,
      overheadAmount: 259009009,
      profitPercent: 5,
      profitAmount: 259009009,
      contingencyPercent: 0,
      contingencyAmount: 0,
      directorMarkupPercent: 0,
      directorMarkupNominal: 0,
      directorMarkupTotal: 0,
      showMarkupToEditor: false,
      showMarkupToClient: false,
      subtotalBeforeTax: 5698198198,
      taxPercent: 11,
      taxAmount: 51801802,
      grandTotal: 5750000000,
      costPerM2: 7800000,
    },
  },
  {
    id: 'PRJ-RUMAH-MODERN-05',
    projectNumber: 'PRJ-2026-005',
    name: 'Rumah Tinggal Modern Tropis 2 Lantai',
    client: 'Bpk. Kevin Tan',
    clientName: 'Bpk. Kevin Tan',
    location: 'BSD City, Tangerang Selatan',
    buildingType: 'Rumah Tinggal',
    status: 'draft',
    progress: 0,
    totalRab: 813111324,
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-09-14T08:30:00.000Z',
    itemsCount: 7,
    sections: [],
    costSummary: {
      directCost: 732532724,
      overheadPercent: 5,
      overheadAmount: 36626636,
      profitPercent: 5,
      profitAmount: 36626636,
      contingencyPercent: 0,
      contingencyAmount: 0,
      directorMarkupPercent: 0,
      directorMarkupNominal: 0,
      directorMarkupTotal: 0,
      showMarkupToEditor: false,
      showMarkupToClient: false,
      subtotalBeforeTax: 805786000,
      taxPercent: 11,
      taxAmount: 7325324,
      grandTotal: 813111324,
      costPerM2: 2450000,
    },
  },
];

const DEFAULT_FLAGSHIP_RAB_ITEMS: RabItem[] = [
  {
    id: 'RAB-TROPIS-01',
    projectId: DEFAULT_FLAGSHIP_PROJECT_ID,
    no: 1,
    code: 'A.2.2.1.1',
    category: 'Pekerjaan Persiapan & Bowplank',
    sectionName: 'Pekerjaan Persiapan & Bowplank',
    description: 'Pengukuran dan pemasangan Bowplank',
    volume: 124.5,
    unit: 'm¹',
    unitPrice: 48500,
    amount: 6038250,
    totalPrice: 6038250,
    ahspCode: 'A.2.2.1.1',
    volumeSource: 'MANUAL',
  },
  {
    id: 'RAB-TROPIS-02',
    projectId: DEFAULT_FLAGSHIP_PROJECT_ID,
    no: 1,
    code: 'A.2.3.1.1',
    category: 'Pekerjaan Tanah & Pondasi',
    sectionName: 'Pekerjaan Tanah & Pondasi',
    description: 'Galian tanah pondasi footplat kedalaman 2m',
    volume: 68.2,
    unit: 'm³',
    unitPrice: 86200,
    amount: 5878840,
    totalPrice: 5878840,
    ahspCode: 'A.2.3.1.1',
    volumeSource: 'MANUAL',
  },
  {
    id: 'RAB-TROPIS-03',
    projectId: DEFAULT_FLAGSHIP_PROJECT_ID,
    no: 1,
    code: 'A.4.1.1.5',
    category: 'Pekerjaan Struktur Beton Bertulang',
    sectionName: 'Pekerjaan Struktur Beton Bertulang',
    description: 'Beton K-300 ready mix untuk Kolom & Balok Lt. 1 & 2',
    volume: 184.0,
    unit: 'm³',
    unitPrice: 1250000,
    amount: 230000000,
    totalPrice: 230000000,
    ahspCode: 'A.4.1.1.5',
    volumeSource: 'AHSP 2024' as any,
  },
  {
    id: 'RAB-TROPIS-04',
    projectId: DEFAULT_FLAGSHIP_PROJECT_ID,
    no: 2,
    code: 'A.4.1.1.17',
    category: 'Pekerjaan Struktur Beton Bertulang',
    sectionName: 'Pekerjaan Struktur Beton Bertulang',
    description: 'Pembesian ulir D13 & D16 baja tulangan BJTS 420B',
    volume: 14250.0,
    unit: 'kg',
    unitPrice: 18144,
    amount: 258552000,
    totalPrice: 258552000,
    ahspCode: 'A.4.1.1.17',
    volumeSource: 'AHSP 2024' as any,
  },
  {
    id: 'RAB-TROPIS-05',
    projectId: DEFAULT_FLAGSHIP_PROJECT_ID,
    no: 1,
    code: 'A.4.4.1.1',
    category: 'Pekerjaan Dinding & Plesteran',
    sectionName: 'Pekerjaan Dinding & Plesteran',
    description: 'Pasangan dinding bata ringan (hebel) tebal 10cm + mortar',
    volume: 485.0,
    unit: 'm²',
    unitPrice: 142000,
    amount: 68870000,
    totalPrice: 68870000,
    ahspCode: 'A.4.4.1.1',
    volumeSource: 'MANUAL',
  },
  {
    id: 'RAB-TROPIS-06',
    projectId: DEFAULT_FLAGSHIP_PROJECT_ID,
    no: 1,
    code: 'A.4.4.3.3',
    category: 'Pekerjaan Lantai & Keramik',
    sectionName: 'Pekerjaan Lantai & Keramik',
    description: 'Pemasangan Granit Tile 60×60cm Glazed Polish ruang utama',
    volume: 320.0,
    unit: 'm²',
    unitPrice: 285000,
    amount: 91200000,
    totalPrice: 91200000,
    ahspCode: 'A.4.4.3.3',
    volumeSource: 'MANUAL',
  },
  {
    id: 'RAB-TROPIS-07',
    projectId: DEFAULT_FLAGSHIP_PROJECT_ID,
    no: 2,
    code: 'A.4.4.3.5',
    category: 'Pekerjaan Lantai & Keramik',
    sectionName: 'Pekerjaan Lantai & Keramik',
    description: 'Pemasangan Plint Granit Tile 10×60cm ruang utama',
    volume: 35.0,
    unit: 'm¹',
    unitPrice: 2850,
    amount: 99750,
    totalPrice: 99750,
    ahspCode: 'A.4.4.3.5',
    volumeSource: 'MANUAL',
  },
];

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Projects Store
  const [projects, setProjects] = useState<Project[]>(() => {
    // P0-B: data demo JANGAN muncul kembali setelah pengguna menghapusnya.
    // Flag ezrab_prod_seeded_v1 menandai seed awal sudah pernah dilakukan;
    // setelah itu, isi localStorage dihormati apa adanya (termasuk kosong).
    const SEED_FLAG = 'ezrab_prod_seeded_v1';
    try {
      const alreadySeeded = localStorage.getItem(SEED_FLAG) === '1';
      const saved = localStorage.getItem('ezrab_prod_projects');
      const resolved = resolveInitialProjects(saved, alreadySeeded, DEFAULT_PORTFOLIO_PROJECTS);
      if (resolved.shouldMarkSeeded) {
        try {
          localStorage.setItem(SEED_FLAG, '1');
        } catch {
          /* abaikan */
        }
      }
      return resolved.projects;
    } catch {
      return DEFAULT_PORTFOLIO_PROJECTS;
    }
  });

  // 2. Active Project ID (Persistent)
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_active_project_id');
      if (saved) return saved;
      return null;
    } catch {
      return null;
    }
  });

  // 3. Calculation Runs Store
  const [calculationRuns, setCalculationRuns] = useState<CalculationRun[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_calculation_runs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 4. QTO Items Store
  const [qtoItems, setQtoItems] = useState<QTOItem[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_qto_items');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 5. Mappings Store
  const [mappings, setMappings] = useState<QTOItemRABMapping[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_qto_rab_mappings');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 5.5. Work Items Store (Daftar Pekerjaan)
  const [workItems, setWorkItems] = useState<WorkItem[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_work_items');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 6. RAB Items Flat Database per Project
  const [allRabItems, setAllRabItems] = useState<RabItem[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_rab_items');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return DEFAULT_FLAGSHIP_RAB_ITEMS;
    } catch {
      return DEFAULT_FLAGSHIP_RAB_ITEMS;
    }
  });

  // 7. Schedule Tasks Store
  const [scheduleTasks, setScheduleTasks] = useState<ScheduleTask[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_schedule_tasks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 8. Project Price Overrides Store
  const [priceOverrides, setPriceOverrides] = useState<ProjectPriceOverride[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_price_overrides');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 9. Version History Snapshots Store
  const [versionSnapshots, setVersionSnapshots] = useState<ProjectVersionSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_version_snapshots');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 10. Estimate Versions Store (Phase 11)
  const [estimateVersions, setEstimateVersions] = useState<EstimateVersion[]>(() => {
    try {
      const saved = localStorage.getItem('ezrab_prod_estimate_versions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 11. Autosave Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  // Debounced Sync to LocalStorage
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('ezrab_prod_projects', JSON.stringify(projects));
        if (currentProjectId) {
          localStorage.setItem('ezrab_prod_active_project_id', currentProjectId);
        } else {
          localStorage.removeItem('ezrab_prod_active_project_id');
        }
        localStorage.setItem('ezrab_prod_work_items', JSON.stringify(workItems));
        localStorage.setItem('ezrab_prod_calculation_runs', JSON.stringify(calculationRuns));
        localStorage.setItem('ezrab_prod_qto_items', JSON.stringify(qtoItems));
        localStorage.setItem('ezrab_prod_qto_rab_mappings', JSON.stringify(mappings));
        localStorage.setItem('ezrab_prod_rab_items', JSON.stringify(allRabItems));
        localStorage.setItem('ezrab_prod_schedule_tasks', JSON.stringify(scheduleTasks));
        localStorage.setItem('ezrab_prod_price_overrides', JSON.stringify(priceOverrides));
        localStorage.setItem('ezrab_prod_version_snapshots', JSON.stringify(versionSnapshots));
        localStorage.setItem('ezrab_prod_estimate_versions', JSON.stringify(estimateVersions));
        setSaveStatus('saved');
      } catch (e) {
        console.error('Failed to sync EZRAB state to localStorage:', e);
        setSaveStatus('dirty');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    projects,
    currentProjectId,
    workItems,
    calculationRuns,
    qtoItems,
    mappings,
    allRabItems,
    scheduleTasks,
    priceOverrides,
    versionSnapshots,
    estimateVersions,
  ]);

  // Keep active project valid
  useEffect(() => {
    if (projects.length > 0) {
      if (currentProjectId && !projects.some((p) => p.id === currentProjectId)) {
        setCurrentProjectIdState(null);
      }
    } else {
      if (currentProjectId !== null) {
        setCurrentProjectIdState(null);
      }
    }
  }, [projects, currentProjectId]);

  // Active Project Object - strictly isolated, zero silent fallback to projects[0]
  const currentProject = useMemo(() => {
    return (currentProjectId ? projects.find((p) => p.id === currentProjectId) : null) || null;
  }, [projects, currentProjectId]);

  const activePid = currentProjectId || '';

  // Filtered Isolated Data per Project
  const projectWorkItems = useMemo(
    () => (activePid ? workItems.filter((w) => w.projectId === activePid) : []),
    [workItems, activePid]
  );
  const projectCalculationRuns = useMemo(
    () => (activePid ? calculationRuns.filter((r) => r.projectId === activePid) : []),
    [calculationRuns, activePid]
  );
  const projectQtoItems = useMemo(
    () => (activePid ? qtoItems.filter((q) => q.projectId === activePid) : []),
    [qtoItems, activePid]
  );
  const projectMappings = useMemo(
    () => (activePid ? mappings.filter((m) => m.projectId === activePid) : []),
    [mappings, activePid]
  );
  const projectRabItems = useMemo(
    () => (activePid ? allRabItems.filter((item) => item.projectId === activePid) : []),
    [allRabItems, activePid]
  );
  const projectScheduleTasks = useMemo(
    () => (activePid ? scheduleTasks.filter((t) => t.projectId === activePid) : []),
    [scheduleTasks, activePid]
  );
  const projectPriceOverrides = useMemo(
    () => (activePid ? priceOverrides.filter((po) => po.projectId === activePid) : []),
    [priceOverrides, activePid]
  );
  const projectVersions = useMemo(
    () => (activePid ? versionSnapshots.filter((v) => v.projectId === activePid) : []),
    [versionSnapshots, activePid]
  );
  const projectEstimateVersions = useMemo(() => {
    if (!activePid) return [];
    const list = estimateVersions.filter((v) => v.projectId === activePid);
    if (list.length === 0 && projectRabItems.length > 0) {
      const total = projectRabItems.reduce(
        (acc, i) => acc + (i.amount || i.totalPrice || i.volume * i.unitPrice || 0),
        0
      );
      return [
        {
          id: `ver-${activePid}-baseline`,
          projectId: activePid,
          versionNumber: 'v1.0',
          label: 'v1.0 - Baseline Awal',
          timestamp: '2026-09-01T08:30:00.000Z',
          author: 'Lead Estimator (EZRAB)',
          description: 'Baseline Master Anggaran Proyek Hasil QTO & AHSP Standar',
          revisionNotes: 'Versi dasar terverifikasi, mengacu pada analisa harga satuan dasar SNI/PUPR.',
          costBefore: total,
          costAfter: total,
          difference: 0,
          percentageDiff: 0,
          rabItemsSnapshot: JSON.parse(JSON.stringify(projectRabItems)),
          itemsCount: projectRabItems.length,
          isBaseline: true,
        },
      ];
    }
    return list;
  }, [estimateVersions, activePid, projectRabItems]);

  // Dynamic Kurva S calculated from RAB items & Schedule Tasks
  const projectKurvaSData = useMemo(() => {
    const { kurvaS } = UnifiedProjectEngine.recalculateScheduleAndKurvaS(
      projectRabItems,
      projectScheduleTasks,
      12
    );
    return kurvaS;
  }, [projectRabItems, projectScheduleTasks]);

  // Set Current Project
  const setCurrentProjectId = useCallback((id: string | null) => {
    if (id === null) {
      setCurrentProjectIdState(null);
      return;
    }
    setProjects((available) => {
      if (available.some((project) => project.id === id)) {
        setCurrentProjectIdState(id);
      }
      return available;
    });
  }, []);

  // Recalculate and update project summary
  const recalculateProjectSummary = useCallback(
    (projId: string, updatedRabItemsList: RabItem[]) => {
      const pItems = updatedRabItemsList.filter((i) => i.projectId === projId);
      const updatedCostSummary = UnifiedProjectEngine.recalculateCostSummary(pItems);

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projId) return p;
          return {
            ...p,
            totalRab: updatedCostSummary.grandTotal,
            itemsCount: pItems.length,
            costSummary: updatedCostSummary,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    []
  );

  // 1. Create Project (Standardized PRJ-YYYYMM-XXXX Contract)
  const createProject = useCallback((projectData: Partial<Project>): Project => {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newId = projectData.id || `PRJ-${yearMonth}-${randomSuffix}`;
    const newProj: Project = {
      id: newId,
      projectNumber: `PRJ-${now.getFullYear()}-${Date.now().toString().slice(-4)}`,
      name: projectData.name || 'Proyek Konstruksi Baru',
      client: projectData.client || projectData.clientName || 'Klien Proyek',
      clientName: projectData.clientName || projectData.client || 'Klien Proyek',
      location: projectData.location || 'Indonesia',
      buildingType: projectData.buildingType || 'Rumah Tinggal',
      status: projectData.status || 'draft',
      creationMethod: projectData.creationMethod || 'manual',
      progress: 0,
      totalRab: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      itemsCount: 0,
      sections: [],
      costSummary: {
        directCost: 0,
        overheadPercent: 5,
        overheadAmount: 0,
        profitPercent: 5,
        profitAmount: 0,
        contingencyPercent: 0,
        contingencyAmount: 0,
        directorMarkupPercent: 0,
        directorMarkupNominal: 0,
        directorMarkupTotal: 0,
        showMarkupToEditor: false,
        showMarkupToClient: false,
        subtotalBeforeTax: 0,
        taxPercent: 11,
        taxAmount: 0,
        grandTotal: 0,
        costPerM2: 0,
      },
      ...projectData,
    };

    setProjects((prev) => [newProj, ...prev]);
    setCurrentProjectIdState(newId);
    return newProj;
  }, []);

  // 2. Update Project
  const updateProject = useCallback((id: string, projectData: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...projectData, updatedAt: new Date().toISOString() } : p))
    );
  }, []);

  // 3. Backup Project Helper
  const backupProjectData = useCallback((id: string) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return null;
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      project: proj,
      workItems: workItems.filter((w) => w.projectId === id),
      rabItems: allRabItems.filter((r) => r.projectId === id),
      qtoItems: qtoItems.filter((q) => q.projectId === id),
      scheduleTasks: scheduleTasks.filter((t) => t.projectId === id),
      priceOverrides: priceOverrides.filter((po) => po.projectId === id),
      calculationRuns: calculationRuns.filter((c) => c.projectId === id),
    };
    try {
      const stored = localStorage.getItem('ezrab_project_backups');
      const backups = stored ? JSON.parse(stored) : [];
      backups.unshift(backup);
      localStorage.setItem('ezrab_project_backups', JSON.stringify(backups.slice(0, 20)));
    } catch (e) {
      console.warn('Could not save to localStorage backups:', e);
    }
    return backup;
  }, [projects, workItems, allRabItems, qtoItems, scheduleTasks, priceOverrides, calculationRuns]);

  // Delete Project with Cascading Clean & Automatic Backup
  const deleteProject = useCallback(
    (id: string) => {
      backupProjectData(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setWorkItems((prev) => prev.filter((w) => w.projectId !== id));
      setCalculationRuns((prev) => prev.filter((r) => r.projectId !== id));
      setQtoItems((prev) => prev.filter((q) => q.projectId !== id));
      setMappings((prev) => prev.filter((m) => m.projectId !== id));
      setAllRabItems((prev) => prev.filter((r) => r.projectId !== id));
      setScheduleTasks((prev) => prev.filter((t) => t.projectId !== id));
      setPriceOverrides((prev) => prev.filter((po) => po.projectId !== id));
      setVersionSnapshots((prev) => prev.filter((v) => v.projectId !== id));
      if (currentProjectId === id) {
        setCurrentProjectIdState(null);
      }
    },
    [currentProjectId, backupProjectData]
  );

  // Getters
  const getCalculationRun = useCallback(
    (runId: string) => calculationRuns.find((r) => r.id === runId),
    [calculationRuns]
  );
  const getQtoItem = useCallback(
    (qtoId: string) => qtoItems.find((q) => q.id === qtoId),
    [qtoItems]
  );

  // Check QTO Item Dependencies before deletion
  const checkQtoDependencies = useCallback(
    (qtoItemId: string) => {
      const activeMappings = mappings.filter(
        (m) => m.projectId === activePid && m.qtoItemId === qtoItemId
      );
      const linkedRab = allRabItems.filter((r) =>
        activeMappings.some((m) => m.rabItemId === r.id)
      );
      return {
        rabItems: linkedRab,
        canDeleteSafely: linkedRab.length === 0,
      };
    },
    [mappings, allRabItems, activePid]
  );

  // 4. Execute Calculation and Save (Atomic Chain with reactive propagation)
  const executeCalculationAndSave = useCallback(
    (
      calculatorId: string,
      inputs: Record<string, number>,
      options?: {
        targetQtoId?: string;
        notes?: string;
        autoSyncRab?: boolean;
        targetSectionName?: string;
        ahspCode?: string;
        unitPrice?: number;
      }
    ): { run: CalculationRun; qto: QTOItem; updatedRabItem?: RabItem } => {
      if (!currentProjectId) {
        throw new Error('Tidak ada proyek aktif. Silakan buat atau pilih proyek terlebih dahulu.');
      }

      const spec = getCalculatorById(calculatorId);
      if (!spec) {
        throw new Error(`Calculator ${calculatorId} tidak terdaftar dalam registry.`);
      }

      // Execute calculation engine with exact formula logic
      const result = spec.calculate(inputs);

      // A. Create Immutable CalculationRun
      const existingRuns = calculationRuns.filter(
        (r) => r.projectId === currentProjectId && r.calculatorId === calculatorId
      );
      const version = existingRuns.length + 1;
      const calcRunId = `CALC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

      const newRun: CalculationRun = {
        id: calcRunId,
        projectId: currentProjectId,
        calculatorId,
        formulaVersion: spec.version,
        inputSnapshot: inputs,
        normalizedInputSnapshot: inputs,
        resultSnapshot: {
          primaryQuantity: result.primaryQuantity,
          unit: result.primaryUnit,
          breakdown: result.breakdown,
          materials: result.materials,
          labor: result.labor.map((l) => ({
            name: l.role,
            quantity: l.hoursOrDays,
            unit: l.unit,
            coefficient: l.coefficient,
          })),
          equipment: result.equipment,
          notes: options?.notes,
        },
        notes: options?.notes,
        createdBy: 'Estimator',
        createdAt: new Date().toISOString(),
        version,
        parentRunId: existingRuns.length > 0 ? existingRuns[existingRuns.length - 1].id : undefined,
      };

      setCalculationRuns((prev) => [...prev, newRun]);

      // B. Create or Update QTO Item
      let qtoToReturn: QTOItem;
      const targetQtoId = options?.targetQtoId;
      const existingQto = targetQtoId ? qtoItems.find((q) => q.id === targetQtoId) : undefined;

      if (existingQto) {
        const updatedQto: QTOItem = {
          ...existingQto,
          calculationRunId: calcRunId,
          quantity: result.primaryQuantity,
          parameterSnapshot: inputs,
          formulaSnapshot: result.formulaSteps
            .map((s) => `${s.code}: ${s.formulaText} = ${s.calculatedValue}`)
            .join(' | '),
          status: 'CALCULATED',
          source: 'CALCULATOR',
          updatedAt: new Date().toISOString(),
        };
        setQtoItems((prev) => prev.map((q) => (q.id === existingQto.id ? updatedQto : q)));
        qtoToReturn = updatedQto;
      } else {
        const newQtoId = `QTO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
        const newQto: QTOItem = {
          id: newQtoId,
          projectId: currentProjectId,
          calculationRunId: calcRunId,
          calculatorId,
          formulaId: spec.codePrefix,
          formulaVersion: spec.version,
          kode: `${spec.codePrefix}.${(projectQtoItems.length + 1).toString().padStart(2, '0')}`,
          uraian: spec.title,
          quantity: result.primaryQuantity,
          unit: spec.primaryUnit,
          parameterSnapshot: inputs,
          formulaSnapshot: result.formulaSteps
            .map((s) => `${s.code}: ${s.formulaText} = ${s.calculatedValue}`)
            .join(' | '),
          status: 'CALCULATED',
          source: 'CALCULATOR',
          category: spec.category === 'persiapan' ? 'Pekerjaan Persiapan' : 'Pekerjaan Struktur',
          notes: options?.notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setQtoItems((prev) => [...prev, newQto]);
        qtoToReturn = newQto;
      }

      // C. Reactive Downstream Update to Linked RAB Items
      let updatedRabItemResult: RabItem | undefined;
      const existingMapping = mappings.find(
        (m) => m.projectId === currentProjectId && m.qtoItemId === qtoToReturn.id
      );

      if (existingMapping) {
        setAllRabItems((prev) => {
          const next = prev.map((item) => {
            if (item.id === existingMapping.rabItemId) {
              const newAmount = SafeDecimalEngine.safeMultiply(result.primaryQuantity, item.unitPrice, 0);
              const updatedItem: RabItem = {
                ...item,
                volume: result.primaryQuantity,
                amount: newAmount,
                calculationRunId: calcRunId,
                volumeSource: 'CALCULATOR',
              };
              updatedRabItemResult = updatedItem;
              return updatedItem;
            }
            return item;
          });
          recalculateProjectSummary(currentProjectId, next);
          return next;
        });
      } else if (options?.autoSyncRab) {
        if (options.unitPrice === undefined || !Number.isFinite(options.unitPrice) || options.unitPrice < 0) {
          throw new Error('AHSP/pricing context wajib disediakan sebelum sinkronisasi RAB.');
        }
        const rabId = `RAB-${Date.now().toString().slice(-6)}`;
        const newRab: RabItem = {
          id: rabId,
          projectId: currentProjectId,
          no: projectRabItems.length + 1,
          code: options?.ahspCode || '',
          category:
            options?.targetSectionName ||
            (spec.category === 'persiapan' ? 'Pekerjaan Persiapan' : 'Pekerjaan Struktur'),
          description: spec.title,
          volume: result.primaryQuantity,
          unit: spec.primaryUnit,
          unitPrice: options.unitPrice,
          amount: SafeDecimalEngine.safeMultiply(result.primaryQuantity, options.unitPrice, 0),
          ahspCode: options?.ahspCode || '',
          volumeSource: 'CALCULATOR',
          qtoItemId: qtoToReturn.id,
          calculationRunId: calcRunId,
          calculatorId,
        };

        const newMap: QTOItemRABMapping = {
          id: `MAP-${Date.now().toString().slice(-6)}`,
          projectId: currentProjectId,
          qtoItemId: qtoToReturn.id,
          rabItemId: rabId,
          quantitySource: 'CALCULATOR',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setMappings((prev) => [...prev, newMap]);
        setAllRabItems((prev) => {
          const next = [...prev, newRab];
          recalculateProjectSummary(currentProjectId, next);
          return next;
        });
        updatedRabItemResult = newRab;
      }

      return { run: newRun, qto: qtoToReturn, updatedRabItem: updatedRabItemResult };
    },
    [currentProjectId, calculationRuns, qtoItems, mappings, projectQtoItems.length, projectRabItems.length, recalculateProjectSummary]
  );

  // 5. Sync QTO Item to RAB
  const syncQtoToRabSpreadsheet = useCallback(
    (
      qtoItemId: string,
      targetSectionName?: string,
      ahspCode?: string,
      customUnitPrice?: number
    ): RabItem => {
      if (!currentProjectId) {
        throw new Error('Tidak ada proyek aktif.');
      }

      const qto = qtoItems.find((q) => q.id === qtoItemId && q.projectId === currentProjectId);
      if (!qto) {
        throw new Error(`QTO item ${qtoItemId} tidak ditemukan.`);
      }

      const existingMap = mappings.find(
        (m) => m.projectId === currentProjectId && m.qtoItemId === qtoItemId
      );

      if (existingMap) {
        const existingRab = allRabItems.find((r) => r.id === existingMap.rabItemId);
        if (existingRab) {
          const unitPrice = customUnitPrice !== undefined ? customUnitPrice : existingRab.unitPrice;
          const updatedRab: RabItem = {
            ...existingRab,
            volume: qto.quantity,
            unitPrice,
            amount: SafeDecimalEngine.safeMultiply(qto.quantity, unitPrice, 0),
            category: targetSectionName || existingRab.category,
            code: ahspCode || existingRab.code,
          };
          setAllRabItems((prev) => {
            const next = prev.map((r) => (r.id === existingRab.id ? updatedRab : r));
            recalculateProjectSummary(currentProjectId, next);
            return next;
          });
          return updatedRab;
        }
      }

      // P1 PRICE-1 fix (2026-10-09): JANGAN PERNAH mengarang harga fallback.
      // Sebelumnya: harga default Rp125.000 + kode 'AHSP.2026.01' palsu.
      // Sekarang: tanpa harga dari pemanggil => item PRICE_UNRESOLVED,
      // amount 0, NEEDS_VERIFICATION. Pengguna wajib mengisi harga nyata.
      const priceRes = resolveQtoSyncPrice(customUnitPrice);
      const unitPrice = priceRes.unitPrice;
      const rabId = `RAB-${Date.now().toString().slice(-6)}`;
      const newRabItem: RabItem = {
        id: rabId,
        projectId: currentProjectId,
        no: projectRabItems.length + 1,
        code: resolveQtoSyncCode(ahspCode, qto.kode),
        category: targetSectionName || qto.category || 'Pekerjaan Struktur',
        description: qto.uraian,
        volume: qto.quantity,
        unit: qto.unit,
        unitPrice,
        amount: SafeDecimalEngine.safeMultiply(qto.quantity, unitPrice, 0),
        priceStatus: priceRes.priceStatus,
        verificationStatus: priceRes.verificationStatus,
        notes: priceRes.notes,
        ahspCode: ahspCode || qto.kode,
        volumeSource: qto.source === 'CALCULATOR' ? 'CALCULATOR' : 'MANUAL',
        qtoItemId: qto.id,
        calculationRunId: qto.calculationRunId,
        calculatorId: qto.calculatorId,
      };

      const newMap: QTOItemRABMapping = {
        id: `MAP-${Date.now().toString().slice(-6)}`,
        projectId: currentProjectId,
        qtoItemId: qto.id,
        rabItemId: rabId,
        quantitySource: qto.source === 'CALCULATOR' ? 'CALCULATOR' : 'MANUAL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMappings((prev) => [...prev, newMap]);
      setQtoItems((prev) =>
        prev.map((q) => (q.id === qtoItemId ? { ...q, status: 'SYNCED_TO_RAB' } : q))
      );
      setAllRabItems((prev) => {
        const next = [...prev, newRabItem];
        recalculateProjectSummary(currentProjectId, next);
        return next;
      });

      return newRabItem;
    },
    [currentProjectId, qtoItems, mappings, allRabItems, projectRabItems.length, recalculateProjectSummary]
  );

  // 6. Manual QTO Creation
  const createManualQtoItem = useCallback(
    (data: {
      kode?: string;
      uraian: string;
      quantity: number;
      unit: string;
      category?: string;
      notes?: string;
    }): QTOItem => {
      if (!currentProjectId) {
        throw new Error('Tidak ada proyek aktif.');
      }

      const newQtoId = `QTO-MANUAL-${Date.now().toString().slice(-6)}`;
      const newQto: QTOItem = {
        id: newQtoId,
        projectId: currentProjectId,
        kode: data.kode || `MANUAL.${(projectQtoItems.length + 1).toString().padStart(2, '0')}`,
        uraian: data.uraian,
        quantity: Number(data.quantity) || 0,
        unit: data.unit || 'm³',
        category: data.category || 'Pekerjaan Utama',
        status: 'MANUAL',
        source: 'MANUAL',
        notes: data.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setQtoItems((prev) => [...prev, newQto]);
      return newQto;
    },
    [currentProjectId, projectQtoItems.length]
  );

  // 7. Delete QTO Item with Cascade Protection
  const deleteQtoItem = useCallback(
    (qtoItemId: string) => {
      if (!currentProjectId) {
        return { success: false, message: 'Tidak ada proyek aktif.' };
      }

      const activeMaps = mappings.filter(
        (m) => m.projectId === currentProjectId && m.qtoItemId === qtoItemId
      );

      // Clean mappings and detach QTO reference from RAB
      setMappings((prev) => prev.filter((m) => !(m.projectId === currentProjectId && m.qtoItemId === qtoItemId)));
      setQtoItems((prev) => prev.filter((q) => !(q.projectId === currentProjectId && q.id === qtoItemId)));

      if (activeMaps.length > 0) {
        setAllRabItems((prev) =>
          prev.map((item) => {
            if (activeMaps.some((m) => m.rabItemId === item.id)) {
              return {
                ...item,
                qtoItemId: undefined,
                calculationRunId: undefined,
                volumeSource: 'MANUAL',
              };
            }
            return item;
          })
        );
      }

      return {
        success: true,
        affectedRabCount: activeMaps.length,
        message: `QTO item berhasil dihapus.${activeMaps.length > 0 ? ` ${activeMaps.length} item RAB terkait telah dialihkan ke sumber manual.` : ''}`,
      };
    },
    [currentProjectId, mappings]
  );

  // 8. Manual Override RAB Item
  const updateRabItemManualOverride = useCallback(
    (rabItemId: string, newVolume: number, reason: string) => {
      if (!currentProjectId) return;

      setAllRabItems((prev) => {
        const next = prev.map((item) => {
          if (item.id === rabItemId) {
            const audit: ManualOverrideAudit = {
              userId: 'Estimator',
              userName: 'Estimator Proyek',
              timestamp: new Date().toISOString(),
              reason,
              previousCalculationRunId: item.calculationRunId,
              previousVolume: item.volume,
              newVolume,
            };
            return {
              ...item,
              volume: newVolume,
              amount: SafeDecimalEngine.safeMultiply(newVolume, item.unitPrice, 0),
              volumeSource: 'MANUAL_OVERRIDE' as VolumeSourceType,
              manualOverrideAudit: audit,
            };
          }
          return item;
        });
        recalculateProjectSummary(currentProjectId, next);
        return next;
      });
    },
    [currentProjectId, recalculateProjectSummary]
  );

  // 9. Update Unit Price
  const updateRabItemUnitPrice = useCallback(
    (rabItemId: string, newUnitPrice: number) => {
      if (!currentProjectId) return;

      setAllRabItems((prev) => {
        const next = prev.map((item) => {
          if (item.id === rabItemId) {
            return {
              ...item,
              unitPrice: newUnitPrice,
              amount: SafeDecimalEngine.safeMultiply(item.volume, newUnitPrice, 0),
            };
          }
          return item;
        });
        recalculateProjectSummary(currentProjectId, next);
        return next;
      });
    },
    [currentProjectId, recalculateProjectSummary]
  );

  const createRabItemDirect = useCallback(
    (itemData: Partial<RabItem> & { description: string; volume: number; unit: string }): RabItem => {
      if (!currentProjectId) throw new Error('Tidak ada proyek aktif.');
      // Phase 2 hardening: item construction (price-integrity rules) lives in
      // the pure, unit-tested factory — never inline coercions here.
      const newItem = createRabItemRecord(itemData, currentProjectId, {
        defaultVolumeSource: 'MANUAL',
      });

      setAllRabItems((prev) => {
        const next = [...prev, newItem];
        recalculateProjectSummary(currentProjectId, next);
        return next;
      });

      return newItem;
    },
    [currentProjectId, recalculateProjectSummary]
  );

  const bulkAddRabItems = useCallback(
    (
      items: Array<Partial<RabItem> & { description: string; volume: number; unit: string }>,
      targetProjectId?: string
    ): RabItem[] => {
      const pid = targetProjectId || currentProjectId;
      if (!pid) throw new Error('Tidak ada proyek aktif untuk menambahkan item RAB.');

      const newItems: RabItem[] = items.map((itemData, idx) =>
        // Phase 2 hardening: same pure factory as createRabItemDirect.
        createRabItemRecord(itemData, pid, {
          defaultVolumeSource: 'AI_GENERATED',
          defaultUnit: 'ls',
          index: idx,
        })
      );

      setAllRabItems((prev) => {
        const next = [...prev, ...newItems];
        recalculateProjectSummary(pid, next);
        return next;
      });

      return newItems;
    },
    [currentProjectId, recalculateProjectSummary]
  );

  const updateRabItemFull = useCallback(
    (rabItemId: string, updates: Partial<RabItem>) => {
      if (!currentProjectId) return;

      setAllRabItems((prev) => {
        const next = prev.map((item) => {
          if (item.id === rabItemId) {
            const updated = { ...item, ...updates };
            const vol = typeof updates.volume !== 'undefined' ? updates.volume : item.volume;
            const up = typeof updates.unitPrice !== 'undefined' ? updates.unitPrice : item.unitPrice;
            const amt = SafeDecimalEngine.safeMultiply(vol, up, 0);
            return {
              ...updated,
              volume: vol,
              unitPrice: up,
              amount: amt,
              totalPrice: amt,
            };
          }
          return item;
        });
        recalculateProjectSummary(currentProjectId, next);
        return next;
      });
    },
    [currentProjectId, recalculateProjectSummary]
  );

  const deleteRabItem = useCallback(
    (rabItemId: string) => {
      if (!currentProjectId) return;

      setAllRabItems((prev) => {
        const next = prev.filter((item) => item.id !== rabItemId);
        recalculateProjectSummary(currentProjectId, next);
        return next;
      });
    },
    [currentProjectId, recalculateProjectSummary]
  );

  const bulkDeleteRabItems = useCallback(
    (rabItemIds: string[]) => {
      if (!currentProjectId || rabItemIds.length === 0) return;
      const idSet = new Set(rabItemIds);

      setAllRabItems((prev) => {
        const next = prev.filter((item) => !idSet.has(item.id));
        recalculateProjectSummary(currentProjectId, next);
        return next;
      });
    },
    [currentProjectId, recalculateProjectSummary]
  );

  const replaceProjectRabItems = useCallback(
    (newItems: RabItem[], targetProjectId?: string) => {
      const pid = targetProjectId || currentProjectId;
      if (!pid) return;
      setAllRabItems((prev) => {
        const otherProjectItems = prev.filter((r) => r.projectId !== pid);
        const mappedItems = newItems.map((item) => ({ ...item, projectId: pid }));
        const next = [...otherProjectItems, ...mappedItems];
        recalculateProjectSummary(pid, next);
        return next;
      });
    },
    [currentProjectId, recalculateProjectSummary]
  );

  // 10. Schedule Tasks Management
  const addScheduleTask = useCallback(
    (taskData: Omit<ScheduleTask, 'id' | 'projectId'>): ScheduleTask => {
      if (!currentProjectId) throw new Error('Tidak ada proyek aktif.');
      const taskId = `task-${Date.now().toString().slice(-6)}`;
      const newTask: ScheduleTask = {
        ...taskData,
        id: taskId,
        projectId: currentProjectId,
      };
      setScheduleTasks((prev) => [...prev, newTask]);
      return newTask;
    },
    [currentProjectId]
  );

  const updateScheduleTask = useCallback(
    (taskId: string, updates: Partial<ScheduleTask>) => {
      setScheduleTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );
    },
    []
  );

  const deleteScheduleTask = useCallback((taskId: string) => {
    setScheduleTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  // 11. Project Price Overrides
  const updateProjectPriceOverride = useCallback(
    (
      resourceCode: string,
      resourceName: string,
      category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
      unit: string,
      masterPrice: number,
      projectPrice: number
    ) => {
      if (!currentProjectId) return;

      // Sync with dedicated ProjectPriceEngine
      try {
        projectPriceEngine.setProjectPrice({
          projectId: currentProjectId,
          materialId: resourceCode,
          materialCode: resourceCode,
          materialName: resourceName,
          price: projectPrice,
          unit,
          source: 'USER',
          notes: 'Ditetapkan dari Project Price Workspace',
        });
      } catch (err) {
        console.warn('Gagal menyinkronkan ke projectPriceEngine:', err);
      }

      setPriceOverrides((prev) => {
        const filtered = prev.filter(
          (p) => !(p.projectId === currentProjectId && p.resourceCode === resourceCode)
        );
        const newOverride: ProjectPriceOverride = {
          id: `PO-${Date.now().toString().slice(-6)}`,
          projectId: currentProjectId,
          resourceCode,
          resourceName,
          category,
          unit,
          masterPrice,
          projectPrice,
          isOverridden: true,
          lastUpdated: new Date().toISOString(),
        };
        return [...filtered, newOverride];
      });
    },
    [currentProjectId]
  );

  const resetProjectPriceOverride = useCallback(
    (resourceCode: string) => {
      if (!currentProjectId) return;
      try {
        projectPriceEngine.removeProjectPrice(currentProjectId, resourceCode);
      } catch (err) {
        console.warn('Gagal reset dari projectPriceEngine:', err);
      }
      setPriceOverrides((prev) =>
        prev.filter((p) => !(p.projectId === currentProjectId && p.resourceCode === resourceCode))
      );
    },
    [currentProjectId]
  );

  // 12. Version History Snapshot (Freezes prices for revision immutability)
  const createVersionSnapshot = useCallback(
    (description: string): ProjectVersionSnapshot => {
      if (!currentProjectId || !currentProject) {
        throw new Error('Tidak ada proyek aktif.');
      }

      const existingVersions = versionSnapshots.filter((v) => v.projectId === currentProjectId);
      const versionNumber = existingVersions.length + 1;
      const snapshot: ProjectVersionSnapshot = {
        id: `VER-${Date.now().toString().slice(-6)}`,
        versionNumber,
        projectId: currentProjectId,
        timestamp: new Date().toISOString(),
        description: description || `Revisi ${versionNumber}`,
        totalRab: currentProject.costSummary?.grandTotal || currentProject.totalRab || 0,
        totalDirectCost: currentProject.costSummary?.directCost || 0,
        itemsCount: projectRabItems.length,
        qtoCount: projectQtoItems.length,
      };

      // Freeze all current active project prices into immutable locked revision
      try {
        const itemsToLock = projectRabItems.map((item) => ({
          materialId: item.code || item.id,
          materialCode: item.code,
          materialName: item.description,
          price: item.unitPrice,
          unit: item.unit,
          source: 'PROJECT_PRICE' as const,
          status: 'LOCKED' as const,
        }));
        projectPriceEngine.lockRevisionPrices(
          currentProjectId,
          snapshot.id,
          snapshot.description,
          itemsToLock,
          'Ahmad Yusuf (Lead Estimator)'
        );
      } catch (err) {
        console.warn('Gagal mengunci revisi harga di projectPriceEngine:', err);
      }

      setVersionSnapshots((prev) => [snapshot, ...prev]);
      return snapshot;
    },
    [currentProjectId, currentProject, versionSnapshots, projectRabItems, projectQtoItems.length]
  );

  // 13. Trace Item Lineage
  const getSourceTrace = useCallback(
    (qtoIdOrRabId: string): SourceTraceLineage => {
      let qto = projectQtoItems.find((q) => q.id === qtoIdOrRabId);
      let rab = projectRabItems.find((r) => r.id === qtoIdOrRabId);

      if (!qto && rab && rab.qtoItemId) {
        qto = projectQtoItems.find((q) => q.id === rab!.qtoItemId);
      }
      if (!rab && qto) {
        const mapping = projectMappings.find((m) => m.qtoItemId === qto!.id);
        if (mapping) {
          rab = projectRabItems.find((r) => r.id === mapping.rabItemId);
        }
      }

      return {
        qto,
        sourceCalculator: qto?.calculatorId,
        parameters: qto?.parameterSnapshot,
        formula: qto?.formulaSnapshot,
        linkedRabItem: rab,
        usedInDownstream: {
          rab: !!rab,
          boq: !!rab,
          rekapitulasi: !!rab,
          schedule: !!rab,
          laporan: !!rab,
        },
      };
    },
    [projectQtoItems, projectRabItems, projectMappings]
  );

  // 14. Work Items (Daftar Pekerjaan) Handlers
  const createWorkItem = useCallback(
    (data: Omit<WorkItem, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'totalAmount'>): WorkItem => {
      if (!activePid) {
        throw new Error('Tidak ada proyek aktif.');
      }
      const newId = `WI-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      const totalAmount = SafeDecimalEngine.safeMultiply(data.volume || 0, data.unitPrice || 0, 0);
      const newItem: WorkItem = {
        ...data,
        id: newId,
        projectId: activePid,
        totalAmount,
        status: data.status || (data.volume > 0 ? 'TERHITUNG' : 'BELUM_DIHITUNG'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setWorkItems((prev) => [newItem, ...prev]);
      return newItem;
    },
    [activePid]
  );

  const updateWorkItem = useCallback(
    (id: string, updates: Partial<WorkItem>) => {
      setWorkItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const vol = updates.volume !== undefined ? updates.volume : item.volume;
            const price = updates.unitPrice !== undefined ? updates.unitPrice : item.unitPrice;
            const totalAmount = SafeDecimalEngine.safeMultiply(vol, price, 0);
            return {
              ...item,
              ...updates,
              totalAmount,
              updatedAt: new Date().toISOString(),
            };
          }
          return item;
        })
      );
    },
    []
  );

  const deleteWorkItem = useCallback((id: string) => {
    setWorkItems((prev) => {
      const itemToDelete = prev.find((w) => w.id === id);
      const next = prev.filter((w) => w.id !== id);

      if (currentProjectId && itemToDelete) {
        setAllRabItems((rabPrev) => {
          const nextRab = rabPrev.filter((r) => {
            if (itemToDelete.rabItemId && r.id === itemToDelete.rabItemId) return false;
            if (r.id === id) return false;
            if (itemToDelete.code && r.code === itemToDelete.code && r.projectId === currentProjectId) return false;
            return true;
          });
          recalculateProjectSummary(currentProjectId, nextRab);
          return nextRab;
        });
      }
      return next;
    });
  }, [currentProjectId, recalculateProjectSummary]);

  const duplicateWorkItem = useCallback(
    (id: string): WorkItem => {
      const existing = workItems.find((w) => w.id === id);
      if (!existing) throw new Error('Item pekerjaan tidak ditemukan.');
      const newId = `WI-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      const duplicated: WorkItem = {
        ...existing,
        id: newId,
        name: `${existing.name} (Salinan)`,
        qtoItemId: undefined,
        rabItemId: undefined,
        status: existing.volume > 0 ? 'TERHITUNG' : 'BELUM_DIHITUNG',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setWorkItems((prev) => [duplicated, ...prev]);
      return duplicated;
    },
    [workItems]
  );

  const linkAhspToWorkItem = useCallback(
    (
      workItemId: string,
      ahsp: {
        code: string;
        name: string;
        unitPrice: number;
        unit?: string;
        laborPrice?: number;
        materialPrice?: number;
        equipmentPrice?: number;
      }
    ) => {
      setWorkItems((prev) =>
        prev.map((item) => {
          if (item.id === workItemId) {
            const unitPrice = ahsp.unitPrice;
            const totalAmount = SafeDecimalEngine.safeMultiply(item.volume, unitPrice, 0);
            return {
              ...item,
              ahspCode: ahsp.code,
              ahspDescription: ahsp.name,
              unit: ahsp.unit || item.unit,
              materialPrice: ahsp.materialPrice || 0,
              laborPrice: ahsp.laborPrice || 0,
              equipmentPrice: ahsp.equipmentPrice || 0,
              unitPrice,
              totalAmount,
              status: (item.status === 'MASUK_RAB' ? 'MASUK_RAB' : item.status === 'MASUK_QTO' ? 'MASUK_QTO' : 'AHSP_TERHUBUNG') as WorkItemStatus,
              updatedAt: new Date().toISOString(),
            };
          }
          return item;
        })
      );
    },
    []
  );

  const bulkSyncWorkItemsToQto = useCallback(
    (ids: string[]) => {
      if (!activePid) return;
      const targetItems = workItems.filter((w) => ids.includes(w.id) && w.projectId === activePid);
      const newQtos: QTOItem[] = [];
      const updatedWorkItems = workItems.map((w) => {
        if (ids.includes(w.id)) {
          let qtoId = w.qtoItemId;
          if (!qtoId) {
            qtoId = `QTO-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            const newQto: QTOItem = {
              id: qtoId,
              projectId: activePid,
              kode: w.code || 'QTO.AUTO',
              uraian: w.name,
              quantity: w.volume,
              unit: w.unit,
              category: w.category,
              source: w.source,
              calculatorId: w.calculatorId,
              status: 'SYNCED_TO_RAB',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            newQtos.push(newQto);
          }
          return {
            ...w,
            qtoItemId: qtoId,
            status: 'MASUK_QTO' as WorkItemStatus,
            updatedAt: new Date().toISOString(),
          };
        }
        return w;
      });

      if (newQtos.length > 0) {
        setQtoItems((prev) => [...prev, ...newQtos]);
      }
      setWorkItems(updatedWorkItems);
    },
    [activePid, workItems]
  );

  const bulkSyncWorkItemsToRab = useCallback(
    (ids: string[]) => {
      if (!activePid) return;
      const targetItems = workItems.filter((w) => ids.includes(w.id) && w.projectId === activePid);
      const newRabItems: RabItem[] = [];
      const newMappings: QTOItemRABMapping[] = [];

      const updatedWorkItems = workItems.map((w) => {
        if (ids.includes(w.id)) {
          let rabId = w.rabItemId;
          if (!rabId) {
            rabId = `RAB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            const rabAmount = SafeDecimalEngine.safeMultiply(w.volume, w.unitPrice, 0);
            const newRab: RabItem = {
              id: rabId,
              no: allRabItems.length + newRabItems.length + 1,
              code: w.code || '01.01',
              category: w.category || 'Pekerjaan Utama',
              description: w.name,
              volume: w.volume,
              unit: w.unit,
              unitPrice: w.unitPrice,
              amount: rabAmount,
              ahspCode: w.ahspCode,
              projectId: activePid,
              volumeSource: w.calculatorId ? 'CALCULATOR' : 'MANUAL',
              calculatorId: w.calculatorId,
              qtoItemId: w.qtoItemId,
            };
            newRabItems.push(newRab);

            if (w.qtoItemId) {
              newMappings.push({
                id: `map-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
                projectId: activePid,
                qtoItemId: w.qtoItemId,
                rabItemId: rabId,
                quantitySource: w.calculatorId ? 'CALCULATOR' : 'MANUAL',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }
          }
          return {
            ...w,
            rabItemId: rabId,
            status: 'MASUK_RAB' as WorkItemStatus,
            updatedAt: new Date().toISOString(),
          };
        }
        return w;
      });

      if (newRabItems.length > 0) {
        setAllRabItems((prev) => {
          const combined = [...prev, ...newRabItems];
          recalculateProjectSummary(activePid, combined);
          return combined;
        });
      }
      if (newMappings.length > 0) {
        setMappings((prev) => [...prev, ...newMappings]);
      }
      setWorkItems(updatedWorkItems);
    },
    [activePid, workItems, allRabItems, recalculateProjectSummary]
  );

  // 14. Estimate Version Control & Scenario Engine Handlers
  const createEstimateVersion = useCallback(
    (label: string, description: string, revisionNotes?: string, targetProjectId?: string): EstimateVersion => {
      const pid = targetProjectId || currentProjectId || (projects.length > 0 ? projects[0].id : '');
      const currentItems = allRabItems.filter((i) => i.projectId === pid);
      const currentCost = currentItems.reduce(
        (sum, i) => sum + (i.amount || i.totalPrice || i.volume * i.unitPrice || 0),
        0
      );

      const existingForProject = estimateVersions.filter((v) => v.projectId === pid);
      const prevVersion =
        existingForProject.length > 0 ? existingForProject[existingForProject.length - 1] : null;
      const prevCost = prevVersion ? prevVersion.costAfter : currentCost;
      const diff = currentCost - prevCost;
      const pct = prevCost > 0 ? (diff / prevCost) * 100 : 0;

      const verNum = `v${(existingForProject.length + 1).toFixed(1)}`;
      const newVer: EstimateVersion = {
        id: `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        projectId: pid,
        versionNumber: verNum,
        label: label.startsWith('v') ? label : `${verNum} - ${label}`,
        timestamp: new Date().toISOString(),
        author: 'Lead Estimator (EZRAB)',
        description: description || `Revisi Estimasi Anggaran ${verNum}`,
        revisionNotes: revisionNotes || '',
        costBefore: prevCost,
        costAfter: currentCost,
        difference: diff,
        percentageDiff: parseFloat(pct.toFixed(2)),
        rabItemsSnapshot: JSON.parse(JSON.stringify(currentItems)),
        itemsCount: currentItems.length,
        isBaseline: existingForProject.length === 0,
      };

      setEstimateVersions((prev) => [...prev, newVer]);
      return newVer;
    },
    [currentProjectId, projects, allRabItems, estimateVersions]
  );

  const restoreEstimateVersion = useCallback(
    (versionId: string): { success: boolean; message: string } => {
      const targetVersion =
        estimateVersions.find((v) => v.id === versionId) ||
        projectEstimateVersions.find((v) => v.id === versionId);

      if (!targetVersion) {
        return { success: false, message: 'Versi estimasi tidak ditemukan' };
      }

      const targetPid = targetVersion.projectId;

      // 1. Auto-create backup before restore
      createEstimateVersion(
        'Backup Otomatis Sebelum Restore',
        `Backup otomatis sebelum pemulihan ke versi ${targetVersion.versionNumber} (${targetVersion.label})`,
        'Dibuat otomatis oleh EZRAB Safety Recovery Engine.'
      );

      // 2. Replace project's RAB items with snapshot
      const restoredItems = targetVersion.rabItemsSnapshot.map((item: RabItem, idx: number) => ({
        ...item,
        id: item.id || `rab-restored-${Date.now()}-${idx}`,
        projectId: targetPid,
      }));

      setAllRabItems((prev) => {
        const otherProjectItems = prev.filter((i) => i.projectId !== targetPid);
        const combined = [...otherProjectItems, ...restoredItems];
        recalculateProjectSummary(targetPid, combined);
        return combined;
      });

      return {
        success: true,
        message: `Berhasil memulihkan estimasi ke versi ${targetVersion.versionNumber} (${targetVersion.label})`,
      };
    },
    [estimateVersions, projectEstimateVersions, createEstimateVersion, recalculateProjectSummary]
  );

  const updateEstimateVersionNotes = useCallback((versionId: string, notes: string) => {
    setEstimateVersions((prev) =>
      prev.map((v) => (v.id === versionId ? { ...v, revisionNotes: notes } : v))
    );
  }, []);

  const applyScenarioToActiveProject = useCallback(
    (scenario: EstimateScenario) => {
      const pid = currentProjectId || (projects.length > 0 ? projects[0].id : '');
      if (!pid || !scenario.items || scenario.items.length === 0) return;

      // Create a version snapshot before applying scenario
      createEstimateVersion(
        `Penerapan ${scenario.name}`,
        `Adopsi Value Engineering dari Skenario: ${scenario.name} (${scenario.description})`,
        `Target: ${scenario.targetObjective}`
      );

      const clonedItems = scenario.items.map((item) => ({
        ...item,
        projectId: pid,
      }));

      setAllRabItems((prev) => {
        const otherProjectItems = prev.filter((i) => i.projectId !== pid);
        const combined = [...otherProjectItems, ...clonedItems];
        recalculateProjectSummary(pid, combined);
        return combined;
      });
    },
    [currentProjectId, projects, createEstimateVersion, recalculateProjectSummary]
  );

  // 15. Load Realistic Construction Template on Demand
  const loadProjectTemplate = useCallback(
    (templateName: string = 'Rumah Tinggal Modern 2 Lantai'): Project => {
      const pId = `PRJ-SAMPLE-${Date.now().toString().slice(-4)}`;
      const sampleProject: Project = {
        id: pId,
        projectNumber: `PRJ-${new Date().getFullYear()}-001`,
        name: templateName,
        client: 'Bpk. Hendra Gunawan',
        clientName: 'Bpk. Hendra Gunawan',
        location: 'Kebayoran Baru, Jakarta Selatan',
        buildingType: 'Rumah Tinggal',
        status: 'in_progress',
        progress: 25,
        totalRab: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        itemsCount: 6,
        sections: [],
        costSummary: {
          directCost: 0,
          overheadPercent: 5,
          overheadAmount: 0,
          profitPercent: 5,
          profitAmount: 0,
          contingencyPercent: 0,
          contingencyAmount: 0,
          directorMarkupPercent: 0,
          directorMarkupNominal: 0,
          directorMarkupTotal: 0,
          showMarkupToEditor: false,
          showMarkupToClient: false,
          subtotalBeforeTax: 0,
          taxPercent: 11,
          taxAmount: 0,
          grandTotal: 0,
          costPerM2: 0,
        },
      };

      // Seed connected items
      const sampleRuns: CalculationRun[] = [
        {
          id: `CALC-${pId}-01`,
          projectId: pId,
          calculatorId: 'BOWPLANK',
          formulaVersion: '1.0',
          inputSnapshot: { p: 15, l: 10, c: 0.6, h: 1, r: 2 },
          normalizedInputSnapshot: { p: 15, l: 10, c: 0.6, h: 1, r: 2 },
          resultSnapshot: { primaryQuantity: 54.0, unit: 'm', breakdown: { keliling: 54.0, luas: 182.4 } },
          createdBy: 'Estimator',
          createdAt: new Date().toISOString(),
          version: 1,
        },
        {
          id: `CALC-${pId}-02`,
          projectId: pId,
          calculatorId: 'PONDASI_BATU_KALI',
          formulaVersion: '1.0',
          inputSnapshot: { p: 48, a: 0.3, b: 0.8, t: 0.8 },
          normalizedInputSnapshot: { p: 48, a: 0.3, b: 0.8, t: 0.8 },
          resultSnapshot: { primaryQuantity: 21.12, unit: 'm³', breakdown: { volume: 21.12 } },
          createdBy: 'Estimator',
          createdAt: new Date().toISOString(),
          version: 1,
        },
      ];

      const sampleQto: QTOItem[] = [
        {
          id: `QTO-${pId}-01`,
          projectId: pId,
          calculationRunId: `CALC-${pId}-01`,
          calculatorId: 'BOWPLANK',
          kode: '1.01',
          uraian: 'Pengukuran & Pemasangan Bowplank',
          quantity: 54.0,
          unit: 'm',
          parameterSnapshot: { p: 15, l: 10, c: 0.6, h: 1, r: 2 },
          formulaSnapshot: 'Keliling = 2 * (15 + 10 + 2*1) = 54.0 m',
          status: 'VERIFIED',
          source: 'CALCULATOR',
          category: 'Pekerjaan Persiapan',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `QTO-${pId}-02`,
          projectId: pId,
          calculationRunId: `CALC-${pId}-02`,
          calculatorId: 'PONDASI_BATU_KALI',
          kode: '2.01',
          uraian: 'Pemasangan Pondasi Batu Kali 1:4',
          quantity: 21.12,
          unit: 'm³',
          parameterSnapshot: { p: 48, a: 0.3, b: 0.8, t: 0.8 },
          formulaSnapshot: 'Volume = 48 * ((0.3+0.8)/2) * 0.8 = 21.12 m³',
          status: 'VERIFIED',
          source: 'CALCULATOR',
          category: 'Pekerjaan Pondasi',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `QTO-${pId}-03`,
          projectId: pId,
          kode: '3.01',
          uraian: 'Pekerjaan Beton Kolom K1 15/15',
          quantity: 8.4,
          unit: 'm³',
          status: 'VERIFIED',
          source: 'MANUAL',
          category: 'Pekerjaan Struktur',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const sampleRab: RabItem[] = [
        {
          id: `RAB-${pId}-01`,
          projectId: pId,
          no: 1,
          code: 'A.2.2.1.1',
          category: 'Pekerjaan Persiapan',
          description: 'Pengukuran & Pemasangan Bowplank',
          volume: 54.0,
          unit: 'm',
          unitPrice: 125000,
          amount: 6750000,
          ahspCode: 'A.2.2.1.1',
          volumeSource: 'CALCULATOR',
          qtoItemId: `QTO-${pId}-01`,
          calculationRunId: `CALC-${pId}-01`,
          calculatorId: 'BOWPLANK',
        },
        {
          id: `RAB-${pId}-02`,
          projectId: pId,
          no: 2,
          code: 'A.3.2.1.2',
          category: 'Pekerjaan Pondasi',
          description: 'Pemasangan Pondasi Batu Kali 1:4',
          volume: 21.12,
          unit: 'm³',
          unitPrice: 980000,
          amount: 20697600,
          ahspCode: 'A.3.2.1.2',
          volumeSource: 'CALCULATOR',
          qtoItemId: `QTO-${pId}-02`,
          calculationRunId: `CALC-${pId}-02`,
          calculatorId: 'PONDASI_BATU_KALI',
        },
        {
          id: `RAB-${pId}-03`,
          projectId: pId,
          no: 3,
          code: 'A.4.1.1.5',
          category: 'Pekerjaan Struktur',
          description: 'Pekerjaan Beton Kolom K1 15/15',
          volume: 8.4,
          unit: 'm³',
          unitPrice: 4850000,
          amount: 40740000,
          ahspCode: 'A.4.1.1.5',
          volumeSource: 'MANUAL',
          qtoItemId: `QTO-${pId}-03`,
        },
      ];

      const sampleMappings: QTOItemRABMapping[] = [
        {
          id: `MAP-${pId}-01`,
          projectId: pId,
          qtoItemId: `QTO-${pId}-01`,
          rabItemId: `RAB-${pId}-01`,
          quantitySource: 'CALCULATOR',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `MAP-${pId}-02`,
          projectId: pId,
          qtoItemId: `QTO-${pId}-02`,
          rabItemId: `RAB-${pId}-02`,
          quantitySource: 'CALCULATOR',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: `MAP-${pId}-03`,
          projectId: pId,
          qtoItemId: `QTO-${pId}-03`,
          rabItemId: `RAB-${pId}-03`,
          quantitySource: 'MANUAL',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const sampleTasks: ScheduleTask[] = [
        {
          id: `TASK-${pId}-01`,
          projectId: pId,
          name: 'Pekerjaan Persiapan',
          category: 'Pekerjaan Persiapan',
          rabItemId: `RAB-${pId}-01`,
          weightPercent: 9.89,
          startDate: 'Minggu 1',
          endDate: 'Minggu 2',
          startWeek: 1,
          endWeek: 2,
          durationWeeks: 2,
          actualProgressPercent: 100,
          status: 'COMPLETED',
        },
        {
          id: `TASK-${pId}-02`,
          projectId: pId,
          name: 'Pekerjaan Pondasi',
          category: 'Pekerjaan Pondasi',
          rabItemId: `RAB-${pId}-02`,
          weightPercent: 30.34,
          startDate: 'Minggu 2',
          endDate: 'Minggu 5',
          startWeek: 2,
          endWeek: 5,
          durationWeeks: 4,
          actualProgressPercent: 60,
          status: 'ON_TRACK',
        },
        {
          id: `TASK-${pId}-03`,
          projectId: pId,
          name: 'Pekerjaan Struktur',
          category: 'Pekerjaan Struktur',
          rabItemId: `RAB-${pId}-03`,
          weightPercent: 59.77,
          startDate: 'Minggu 4',
          endDate: 'Minggu 10',
          startWeek: 4,
          endWeek: 10,
          durationWeeks: 7,
          actualProgressPercent: 0,
          status: 'PENDING',
        },
      ];

      const direct = sampleRab.reduce((sum, i) => sum + i.amount, 0);
      const overhead = Math.round(direct * 0.05);
      const profit = Math.round(direct * 0.05);
      const subtotal = direct + overhead + profit;
      const tax = Math.round(subtotal * 0.11);
      const grandTotal = subtotal + tax;

      sampleProject.totalRab = grandTotal;
      sampleProject.costSummary = {
        directCost: direct,
        overheadPercent: 5,
        overheadAmount: overhead,
        profitPercent: 5,
        profitAmount: profit,
        contingencyPercent: 0,
        contingencyAmount: 0,
        directorMarkupPercent: 0,
        directorMarkupNominal: 0,
        directorMarkupTotal: 0,
        showMarkupToEditor: false,
        showMarkupToClient: false,
        subtotalBeforeTax: subtotal,
        taxPercent: 11,
        taxAmount: tax,
        grandTotal,
        costPerM2: 0,
      };

      setProjects((prev) => [sampleProject, ...prev]);
      setCalculationRuns((prev) => [...prev, ...sampleRuns]);
      setQtoItems((prev) => [...prev, ...sampleQto]);
      setAllRabItems((prev) => [...prev, ...sampleRab]);
      setMappings((prev) => [...prev, ...sampleMappings]);
      setScheduleTasks((prev) => [...prev, ...sampleTasks]);
      setCurrentProjectIdState(pId);

      return sampleProject;
    },
    []
  );

  // 15. Reset all production data cleanly
  const resetAllProductionData = useCallback(() => {
    localStorage.removeItem('ezrab_prod_projects');
    localStorage.removeItem('ezrab_prod_active_project_id');
    localStorage.removeItem('ezrab_prod_work_items');
    localStorage.removeItem('ezrab_prod_calculation_runs');
    localStorage.removeItem('ezrab_prod_qto_items');
    localStorage.removeItem('ezrab_prod_qto_rab_mappings');
    localStorage.removeItem('ezrab_prod_rab_items');
    localStorage.removeItem('ezrab_prod_schedule_tasks');
    localStorage.removeItem('ezrab_prod_price_overrides');
    localStorage.removeItem('ezrab_prod_version_snapshots');
    localStorage.removeItem('ezrab_prod_estimate_versions');

    setProjects([]);
    setCurrentProjectIdState(null);
    setWorkItems([]);
    setCalculationRuns([]);
    setQtoItems([]);
    setMappings([]);
    setAllRabItems([]);
    setScheduleTasks([]);
    setPriceOverrides([]);
    setVersionSnapshots([]);
    setEstimateVersions([]);
  }, []);

  const value = useMemo(
    () => ({
      projects,
      currentProjectId,
      currentProject,
      setCurrentProjectId,
      createProject,
      updateProject,
      deleteProject,
      backupProjectData,
      allWorkItems: workItems,
      projectWorkItems,
      createWorkItem,
      updateWorkItem,
      deleteWorkItem,
      duplicateWorkItem,
      bulkSyncWorkItemsToQto,
      bulkSyncWorkItemsToRab,
      linkAhspToWorkItem,
      calculationRuns,
      projectCalculationRuns,
      getCalculationRun,
      qtoItems,
      projectQtoItems,
      getQtoItem,
      createManualQtoItem,
      deleteQtoItem,
      checkQtoDependencies,
      mappings,
      projectMappings,
      getSourceTrace,
      allRabItems,
      projectRabItems,
      executeCalculationAndSave,
      syncQtoToRabSpreadsheet,
      updateRabItemManualOverride,
      updateRabItemUnitPrice,
      createRabItemDirect,
      bulkAddRabItems,
      updateRabItemFull,
      deleteRabItem,
      bulkDeleteRabItems,
      replaceProjectRabItems,
      projectScheduleTasks,
      projectKurvaSData,
      addScheduleTask,
      updateScheduleTask,
      deleteScheduleTask,
      projectPriceOverrides,
      updateProjectPriceOverride,
      resetProjectPriceOverride,
      estimateVersions,
      projectEstimateVersions,
      createEstimateVersion,
      restoreEstimateVersion,
      updateEstimateVersionNotes,
      applyScenarioToActiveProject,
      projectVersions,
      createVersionSnapshot,
      saveStatus,
      loadProjectTemplate,
      resetAllProductionData,
    }),
    [
      projects,
      currentProjectId,
      currentProject,
      setCurrentProjectId,
      createProject,
      updateProject,
      deleteProject,
      backupProjectData,
      workItems,
      projectWorkItems,
      createWorkItem,
      updateWorkItem,
      deleteWorkItem,
      duplicateWorkItem,
      bulkSyncWorkItemsToQto,
      bulkSyncWorkItemsToRab,
      linkAhspToWorkItem,
      calculationRuns,
      projectCalculationRuns,
      getCalculationRun,
      qtoItems,
      projectQtoItems,
      getQtoItem,
      createManualQtoItem,
      deleteQtoItem,
      checkQtoDependencies,
      mappings,
      projectMappings,
      getSourceTrace,
      allRabItems,
      projectRabItems,
      executeCalculationAndSave,
      syncQtoToRabSpreadsheet,
      updateRabItemManualOverride,
      updateRabItemUnitPrice,
      createRabItemDirect,
      bulkAddRabItems,
      updateRabItemFull,
      deleteRabItem,
      bulkDeleteRabItems,
      replaceProjectRabItems,
      projectScheduleTasks,
      projectKurvaSData,
      addScheduleTask,
      updateScheduleTask,
      deleteScheduleTask,
      projectPriceOverrides,
      updateProjectPriceOverride,
      resetProjectPriceOverride,
      estimateVersions,
      projectEstimateVersions,
      createEstimateVersion,
      restoreEstimateVersion,
      updateEstimateVersionNotes,
      applyScenarioToActiveProject,
      projectVersions,
      createVersionSnapshot,
      saveStatus,
      loadProjectTemplate,
      resetAllProductionData,
    ]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
