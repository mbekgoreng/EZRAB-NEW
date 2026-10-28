import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { checkAhspIdentitySafety } from '../data/priceDatabase2026/ahspDisplayPolicy';
import { normalizeName, normalizeUnit } from '../data/priceDatabase2026/normalize';
import { resolvePriceStatus } from '../engine/pricing/priceStatus';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { clearLogoutInProgress, isLogoutInProgress } from '../auth/sessionBoundary';
import { projectPriceEngine } from '../engine/pricing/projectPriceEngine';
import {
  resolveInitialProjects,
  resolveInitialRabItems,
  computeSeedCostSummary,
  markSeedProject,
} from '../lib/demoSeed';
import { cloneProjectItems } from '../lib/projectClone';
import {
  saveVersioned,
  loadVersioned,
  onExternalStorageChange,
  peekEnvelope,
  type SaveResult,
} from '../engine/storage/hardenedStorage';

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

// ============================================================================
// P1 — Safe template-apply deduplication (exact duplicates only).
//
// The duplicate key is the normalized triple: code-part + name + unit.
// - code-part: ahspCode when present, else code; trimmed + lowercased.
// - name: normalizeName (lowercase, diacritics stripped, punctuation and
//   whitespace collapsed) — same helper the price pipeline already uses.
// - unit: normalizeUnit (spelling canonicalization ONLY, e.g. m² -> m2,
//   "Meter Persegi" -> m2). No conversion: different canonical units never
//   match, and no unit is ever silently converted.
// A code alone is NEVER enough: all three parts must be present and equal.
// A row lacking any part has no key and is always inserted (conservative:
// never discard a row on a partial match). No price, provenance, mapping
// status, or volume field is read or changed by this logic.
// ============================================================================

export interface TemplateApplyDedupeResult {
  /** Sequence number of the dedupe request this result answers. */
  seq: number;
  /** Proposed rows actually inserted. */
  inserted: number;
  /** Proposed rows skipped as exact duplicates. */
  skipped: number;
  /** Descriptions of skipped rows, for the result message. */
  skippedDescriptions: string[];
}

export interface DedupeKeyInput {
  ahspCode?: string;
  code?: string;
  description?: string;
  unit?: string;
}

/**
 * Build the exact-duplicate key for one RAB row, or null when the row lacks
 * sufficient identity to match safely.
 */
export function buildExactDuplicateKey(item: DedupeKeyInput): string | null {
  const codePart = (item.ahspCode?.trim() || item.code?.trim() || '').toLowerCase();
  const namePart = normalizeName(item.description || '');
  const unitPart = normalizeUnit(item.unit || '');
  if (!codePart || !namePart || !unitPart) return null;
  return `${codePart}|||${namePart}|||${unitPart}`;
}

/**
 * Partition proposed rows into inserted vs skipped-exact-duplicates.
 * `existing` must already be scoped to the target project (the caller
 * filters by projectId). A proposed row is skipped only when its full
 * triple key matches an existing row OR an earlier proposed row in the
 * same batch. Rows without a key are always inserted. No field is mutated:
 * both lists carry the original record objects.
 */
export function partitionExactDuplicates<T extends DedupeKeyInput>(
  existing: readonly T[],
  proposed: readonly T[],
): { inserted: T[]; skipped: T[] } {
  const seen = new Set<string>();
  for (const row of existing) {
    const key = buildExactDuplicateKey(row);
    if (key) seen.add(key);
  }
  const inserted: T[] = [];
  const skipped: T[] = [];
  for (const row of proposed) {
    const key = buildExactDuplicateKey(row);
    if (key && seen.has(key)) {
      skipped.push(row);
    } else {
      inserted.push(row);
      if (key) seen.add(key);
    }
  }
  return { inserted, skipped };
}

interface ProjectContextType {
  // 1. Projects Root
  projects: Project[];
  currentProjectId: string | null;
  currentProject: Project | null;
  setCurrentProjectId: (id: string | null) => void;
  createProject: (projectData: Partial<Project>) => Project;
  updateProject: (id: string, projectData: Partial<Project>) => void;
  /** Hitung ulang total proyek dari item RAB + flag pajak proyek saat ini
   * (dipanggil sesudah updateProject mengubah flag/persen pajak). */
  refreshProjectTotals: (id: string) => void;
  deleteProject: (id: string) => void;
  /** F1a: salin item RAB, QTO, dan mapping milik proyek sumber ke proyek tujuan (id baru). */
  duplicateProjectData: (sourceProjectId: string, targetProjectId: string) => void;
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
  /**
   * P1: one-shot opt-in for template-apply deduplication. The catalog view
   * calls this immediately before invoking the apply callback; the NEXT
   * bulkAddRabItems call then dedupes exact duplicates and records the
   * result for getLastTemplateApplyResult. Returns a sequence number so
   * the caller can verify the result it reads answers THIS request.
   * Callers that never request are completely unaffected.
   */
  requestTemplateApplyDedupe: () => number;
  /**
   * P1: result of the most recent deduped bulk add, or null when no
   * deduped add has run yet. Read it only after checking its seq matches
   * the sequence returned by requestTemplateApplyDedupe.
   */
  getLastTemplateApplyResult: () => TemplateApplyDedupeResult | null;
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
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  saveError: string | null;
  /** External (other-tab) storage change — app should prompt user, not auto-merge. */
  externalChange: { key: string; detectedAt: string } | null;
  dismissExternalChange: () => void;

  // 9. Data Utilities
  loadProjectTemplate: (templateName?: string) => Project;
  resetAllProductionData: () => void;
}

export const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const DEFAULT_FLAGSHIP_PROJECT_ID = 'PRJ-RUMAH-2LT-01';

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
    volumeSource: 'AHSP 2026' as any,
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
    volumeSource: 'AHSP 2026' as any,
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
// F1a: ringkasan biaya flagship DITURUNKAN dari item-itemnya sendiri
// (directCost = Σ amount item; pajak 11% × subtotal) — tidak ada angka yatim
// seperti taxAmount lama yang tidak cocok dengan subtotalnya.
const FLAGSHIP_COST_SUMMARY = computeSeedCostSummary(DEFAULT_FLAGSHIP_RAB_ITEMS, {
  costPerM2: 2450000,
});

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
  totalRab: FLAGSHIP_COST_SUMMARY.grandTotal,
  createdAt: '2026-09-19T08:00:00.000Z',
  updatedAt: '2026-09-19T10:24:00.000Z',
  itemsCount: 7,
  sections: [],
  costSummary: FLAGSHIP_COST_SUMMARY,
};

export const DEFAULT_PORTFOLIO_PROJECTS: Project[] = ([
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
    progress: 0,
    totalRab: 0,
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-18T14:12:00.000Z',
        itemsCount: 0, sections: [],
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
  // F1a: seluruh proyek bawaan ditandai sebagai data contoh (isDemo) dan
  // costSummary-nya dinormalisasi (pajak & grand total diturunkan dari
  // subtotal) oleh markSeedProject.
] as Project[]).map(markSeedProject);
export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Hardened dataset loader: reads versioned envelope or legacy raw JSON.
   * Returns fallback on NOT_FOUND/CORRUPT (caller decides default).
   */
  function loadDataset<T>(key: string, fallback: T): T {
    const result = loadVersioned<T>(key);
    if (result.ok) return result.data;
    if (result.error === 'CORRUPT' || result.error === 'MIGRATION_FAILED') {
      console.warn(`[EZRAB] Storage ${result.error} for key ${key}; using fallback.`);
    }
    return fallback;
  }

  // 1. Projects Store
  const [projects, setProjects] = useState<Project[]>(() => {
    // P0-B: data demo JANGAN muncul kembali setelah pengguna menghapusnya.
    // Flag ezrab_prod_seeded_v1 menandai seed awal sudah pernah dilakukan;
    // setelah itu, isi localStorage dihormati apa adanya (termasuk kosong).
    const SEED_FLAG = 'ezrab_prod_seeded_v1';
    try {
      const alreadySeeded = localStorage.getItem(SEED_FLAG) === '1';
      // Hardened: unwrap versioned envelope if present, else legacy raw.
      const loaded = loadVersioned<Project[]>('ezrab_prod_projects');
      const savedJson = loaded.ok ? JSON.stringify(loaded.data) : localStorage.getItem('ezrab_prod_projects');
      const resolved = resolveInitialProjects(savedJson, alreadySeeded, DEFAULT_PORTFOLIO_PROJECTS);
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
  const [calculationRuns, setCalculationRuns] = useState<CalculationRun[]>(() =>
    loadDataset<CalculationRun[]>('ezrab_prod_calculation_runs', [])
  );

  // 4. QTO Items Store
  const [qtoItems, setQtoItems] = useState<QTOItem[]>(() =>
    loadDataset<QTOItem[]>('ezrab_prod_qto_items', [])
  );

  // 5. Mappings Store
  const [mappings, setMappings] = useState<QTOItemRABMapping[]>(() =>
    loadDataset<QTOItemRABMapping[]>('ezrab_prod_qto_rab_mappings', [])
  );

  // 5.5. Work Items Store (Daftar Pekerjaan)
  const [workItems, setWorkItems] = useState<WorkItem[]>(() =>
    loadDataset<WorkItem[]>('ezrab_prod_work_items', [])
  );

  // 6. RAB Items Flat Database per Project
  // F1a: kunci yang SUDAH ADA dihormati apa adanya — termasuk array kosong
  // hasil pengguna menghapus seluruh item (dulu: array kosong selalu
  // memunculkan kembali item flagship setelah reload). Seed flagship hanya
  // untuk instalasi pertama (kunci belum pernah ada) / data rusak.
  const [allRabItems, setAllRabItems] = useState<RabItem[]>(() => {
    const result = loadVersioned<RabItem[]>('ezrab_prod_rab_items');
    if (!result.ok && (result.error === 'CORRUPT' || result.error === 'MIGRATION_FAILED')) {
      console.warn(`[EZRAB] Storage ${result.error} for key ezrab_prod_rab_items; using fallback.`);
    }
    return resolveInitialRabItems(result, DEFAULT_FLAGSHIP_RAB_ITEMS);
  });

  // 7. Schedule Tasks Store
  const [scheduleTasks, setScheduleTasks] = useState<ScheduleTask[]>(() =>
    loadDataset<ScheduleTask[]>('ezrab_prod_schedule_tasks', [])
  );

  // 8. Project Price Overrides Store
  const [priceOverrides, setPriceOverrides] = useState<ProjectPriceOverride[]>(() =>
    loadDataset<ProjectPriceOverride[]>('ezrab_prod_price_overrides', [])
  );

  // 9. Version History Snapshots Store
  const [versionSnapshots, setVersionSnapshots] = useState<ProjectVersionSnapshot[]>(() =>
    loadDataset<ProjectVersionSnapshot[]>('ezrab_prod_version_snapshots', [])
  );

  // 10. Estimate Versions Store (Phase 11)
  const [estimateVersions, setEstimateVersions] = useState<EstimateVersion[]>(() =>
    loadDataset<EstimateVersion[]>('ezrab_prod_estimate_versions', [])
  );

  // 11. Autosave Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState<{ key: string; detectedAt: string } | null>(null);

  const dismissExternalChange = useCallback(() => setExternalChange(null), []);

  // Cross-tab conflict detection: if another tab writes to our dataset keys,
  // surface it to the user instead of silently overwriting on next save.
  // We do NOT auto-merge — user decides (reload or keep editing).
  useEffect(() => {
    const datasetKeys = new Set([
      'ezrab_prod_projects',
      'ezrab_prod_rab_items',
      'ezrab_prod_work_items',
      'ezrab_prod_calculation_runs',
      'ezrab_prod_qto_items',
      'ezrab_prod_qto_rab_mappings',
      'ezrab_prod_schedule_tasks',
      'ezrab_prod_price_overrides',
      'ezrab_prod_version_snapshots',
      'ezrab_prod_estimate_versions',
    ]);
    const unsubscribe = onExternalStorageChange((ev) => {
      if (datasetKeys.has(ev.key)) {
        setExternalChange({ key: ev.key, detectedAt: new Date().toISOString() });
      }
    });
    return unsubscribe;
  }, []);

  // Refs for unmount flush — always point at latest state.
  const projectsRef = useRef(projects);
  const currentProjectIdRef = useRef(currentProjectId);
  const workItemsRef = useRef(workItems);
  const calculationRunsRef = useRef(calculationRuns);
  const qtoItemsRef = useRef(qtoItems);
  const mappingsRef = useRef(mappings);
  const allRabItemsRef = useRef(allRabItems);
  const scheduleTasksRef = useRef(scheduleTasks);
  const priceOverridesRef = useRef(priceOverrides);
  const versionSnapshotsRef = useRef(versionSnapshots);
  const estimateVersionsRef = useRef(estimateVersions);
  useEffect(() => {
    projectsRef.current = projects;
    currentProjectIdRef.current = currentProjectId;
    workItemsRef.current = workItems;
    calculationRunsRef.current = calculationRuns;
    qtoItemsRef.current = qtoItems;
    mappingsRef.current = mappings;
    allRabItemsRef.current = allRabItems;
    scheduleTasksRef.current = scheduleTasks;
    priceOverridesRef.current = priceOverrides;
    versionSnapshotsRef.current = versionSnapshots;
    estimateVersionsRef.current = estimateVersions;
  });

  // Flush pending writes on unmount (e.g. project switch / tab close via React tree).
  useEffect(() => {
    return () => {
      flushToStorageRef.current();
    };
  }, []);

  // R2: sesi workspace baru dimulai saat provider ini mount — penanda
  // logout dari sesi sebelumnya dibersihkan, supaya flush unmount sesi
  // baru ini kembali normal. Tanpa ini, flush sesi baru pun akan
  // dilewati (kehilangan penyimpanan saat tab ditutup).
  useEffect(() => {
    clearLogoutInProgress();
  }, []);

  // Debounced Sync to LocalStorage (hardened)
  // Extracted so unmount can flush pending writes instead of dropping them.
  const flushToStorageRef = useRef<() => void>(() => {});
  const flushToStorage = useCallback(() => {
    // R2: saat logout sedang berlangsung, JANGAN menulis kembali state
    // dari memori ke localStorage. Flush unmount inilah yang akan
    // menghidupkan kembali kunci transien yang baru dibersihkan
    // logoutAll (penunjuk proyek aktif) — dan menulis state sesi lama
    // di atas penyimpanan yang sudah dibersihkan. Badan data proyek
    // tetap utuh di storage (tidak dihapus logout), jadi melewati
    // flush ini tidak menghilangkan data apa pun.
    if (isLogoutInProgress()) return;
    const failures: string[] = [];
    const saveOne = (key: string, data: unknown) => {
      const result: SaveResult = saveVersioned(key, data);
      if (!result.ok) {
        failures.push(`${key}: ${result.message}`);
      }
    };

    // Read latest state via refs to avoid stale closure on unmount flush.
    // (Values captured here are from the render that scheduled the flush.)
    saveOne('ezrab_prod_projects', projectsRef.current);
    try {
      if (currentProjectIdRef.current) {
        localStorage.setItem('ezrab_prod_active_project_id', currentProjectIdRef.current);
      } else {
        localStorage.removeItem('ezrab_prod_active_project_id');
      }
    } catch (e) {
      failures.push(`ezrab_prod_active_project_id: ${String((e as Error)?.message || e)}`);
    }
    saveOne('ezrab_prod_work_items', workItemsRef.current);
    saveOne('ezrab_prod_calculation_runs', calculationRunsRef.current);
    saveOne('ezrab_prod_qto_items', qtoItemsRef.current);
    saveOne('ezrab_prod_qto_rab_mappings', mappingsRef.current);
    saveOne('ezrab_prod_rab_items', allRabItemsRef.current);
    saveOne('ezrab_prod_schedule_tasks', scheduleTasksRef.current);
    saveOne('ezrab_prod_price_overrides', priceOverridesRef.current);
    saveOne('ezrab_prod_version_snapshots', versionSnapshotsRef.current);
    saveOne('ezrab_prod_estimate_versions', estimateVersionsRef.current);

    if (failures.length > 0) {
      console.error('Failed to sync EZRAB state to localStorage:', failures);
      setSaveError(failures.join('; '));
      setSaveStatus('error');
    } else {
      setSaveError(null);
      setSaveStatus('saved');
    }
  }, []);

  // Keep ref in sync so unmount flush uses the latest implementation.
  useEffect(() => {
    flushToStorageRef.current = flushToStorage;
  }, [flushToStorage]);

  useEffect(() => {
    setSaveStatus('saving');
    setSaveError(null);
    const timer = setTimeout(flushToStorage, 400);
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
        (acc, i) => acc + (i.amount ?? i.totalPrice ?? i.volume * (i.unitPrice ?? 0)),
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

  // Recalculate and update project summary.
  // Kebijakan pajak opt-in (owner 2026-10-27): perhitungan kartu total
  // proyek memakai flag + persen PAJAK PROYEK ITU SENDIRI (bukan default
  // mesin). Komputasi dilakukan di dalam updater setProjects agar flag
  // yang baru saja disimpan lewat updateProject (mis. centang PPN di
  // Pengaturan) ikut terbaca — updater fungsional dieksekusi berurutan.
  // Fallback overhead 10% (owner 2026-10-27, selaras Rekapitulasi):
  // overhead proyek diambil dari FIELD PROYEK (yang ditulis Pengaturan);
  // bila field itu undefined/null (belum dikonfigurasi), mesin memakai
  // fallback 10 — BUKAN persen ringkasan lama (5, default pembuatan
  // proyek). Operator ?? mempertahankan nilai eksplisit 0%. Recalculate
  // tidak pernah menulis field proyek, jadi fallback tidak menimpa
  // konfigurasi tersimpan apa pun.
  const recalculateProjectSummary = useCallback(
    (projId: string, updatedRabItemsList: RabItem[]) => {
      const pItems = updatedRabItemsList.filter((i) => i.projectId === projId);

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projId) return p;
          const cs = p.costSummary ?? ({} as any);
          const updatedCostSummary = UnifiedProjectEngine.recalculateCostSummary(pItems, {
            ...cs,
            overheadPercent: (p as any)?.overheadPercent ?? undefined,
            profitPercent: (p as any)?.profitPercent ?? cs.profitPercent,
            taxPercent: (p as any)?.ppnPercent ?? cs.taxPercent,
            ppnEnabled: (p as any)?.ppnEnabled === true,
            pphEnabled: (p as any)?.pphEnabled === true,
            pphPercent: (p as any)?.pphPercent ?? cs.pphPercent ?? 0,
          });
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

  // Dipanggil sesudah updateProject mengubah flag/persen pajak atau
  // overhead, agar kartu total proyek langsung selaras dengan Rekap —
  // tanpa menunggu ada item yang diubah. Dipakai di handler simpan
  // Pengaturan Estimasi dan Pengaturan Terpadu.
  const refreshProjectTotals = useCallback(
    (projId: string) => {
      recalculateProjectSummary(projId, allRabItems);
    },
    [allRabItems, recalculateProjectSummary]
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

  // F1a: Duplicate project data — salin item RAB, QTO, dan mapping proyek
  // sumber ke proyek tujuan dengan id baru (nilai duplikat konsisten dengan
  // isinya; dulu duplikat hanya menyalin totalRab tanpa item apa pun).
  const duplicateProjectData = useCallback(
    (sourceProjectId: string, targetProjectId: string) => {
      const stamp = Date.now().toString(36);
      const cloned = cloneProjectItems(
        { rabItems: allRabItems, qtoItems, mappings },
        sourceProjectId,
        targetProjectId,
        (kind, _oldId, idx) =>
          `${kind}-copy-${stamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`
      );
      if (cloned.qtoItems.length > 0) {
        setQtoItems((prev) => [...prev, ...cloned.qtoItems]);
      }
      if (cloned.rabItems.length > 0) {
        setAllRabItems((prev) => {
          const next = [...prev, ...cloned.rabItems];
          recalculateProjectSummary(targetProjectId, next);
          return next;
        });
      }
      if (cloned.mappings.length > 0) {
        setMappings((prev) => [...prev, ...cloned.mappings]);
      }
    },
    [allRabItems, qtoItems, mappings, recalculateProjectSummary]
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
              const newAmount = item.unitPrice == null ? null : SafeDecimalEngine.safeMultiply(result.primaryQuantity, item.unitPrice, 0);
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
        // P1 fix (audit 2026-10-18): QTO auto-sync WAJIB lewat factory resmi.
        // Sebelumnya: object literal mentah tanpa priceStatus, tanpa
        // verificationStatus, tanpa identity-safety gate — melanggar aturan
        // "semua jalur masuk RAB lewat factory".
        const newRab: RabItem = createRabItemRecord(
          {
            id: `RAB-${Date.now().toString().slice(-6)}`,
            no: projectRabItems.length + 1,
            code: options?.ahspCode || '',
            category:
              options?.targetSectionName ||
              (spec.category === 'persiapan' ? 'Pekerjaan Persiapan' : 'Pekerjaan Struktur'),
            description: spec.title,
            volume: result.primaryQuantity,
            unit: spec.primaryUnit,
            unitPrice: options.unitPrice,
            ahspCode: options?.ahspCode || '',
            volumeSource: 'CALCULATOR' as const,
            qtoItemId: qtoToReturn.id,
            calculationRunId: calcRunId,
            calculatorId,
          },
          currentProjectId,
          { defaultVolumeSource: 'CALCULATOR' as const }
        );

        const newMap: QTOItemRABMapping = {
          id: `MAP-${Date.now().toString().slice(-6)}`,
          projectId: currentProjectId,
          qtoItemId: qtoToReturn.id,
          rabItemId: newRab.id,
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
          // Bug fix (audit 2026-10-18): sinkronkan priceStatus saat harga berubah.
          // Sebelumnya status tidak dihitung ulang → UNRESOLVED dengan harga valid.
          const priceStatus = customUnitPrice !== undefined
            ? resolvePriceStatus(customUnitPrice)
            : existingRab.priceStatus;
          const newAhspCode = ahspCode || existingRab.ahspCode || '';
          // Identity safety: periksa bila ahspCode berubah/diset
          let ahspIdentityStatus = existingRab.ahspIdentityStatus;
          let ahspIdentityReason = existingRab.ahspIdentityReason;
          if (ahspCode && ahspCode !== existingRab.ahspCode) {
            const idCheck = checkAhspIdentitySafety({ code: ahspCode, name: qto.uraian || '' });
            ahspIdentityStatus = idCheck.safe ? 'SAFE' : 'UNSAFE';
            ahspIdentityReason = idCheck.safe ? undefined : idCheck.reason;
          }
          const updatedRab: RabItem = {
            ...existingRab,
            volume: qto.quantity,
            unitPrice,
            priceStatus,
            verificationStatus: priceStatus === 'PRICE_UNRESOLVED' ? 'NEEDS_VERIFICATION' : existingRab.verificationStatus,
            amount: unitPrice == null ? null : SafeDecimalEngine.safeMultiply(qto.quantity, unitPrice, 0),
            category: targetSectionName || existingRab.category,
            code: ahspCode || existingRab.code,
            ahspCode: newAhspCode,
            ...(ahspIdentityStatus ? { ahspIdentityStatus, ahspIdentityReason } : {}),
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
      const syncAhspCode = ahspCode || qto.kode;
      // Identity safety (audit 2026-10-18): QTO sync juga diperiksa
      const syncIdCheck = syncAhspCode
        ? checkAhspIdentitySafety({ code: syncAhspCode, name: qto.uraian || '' })
        : null;
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
        amount: unitPrice == null ? null : SafeDecimalEngine.safeMultiply(qto.quantity, unitPrice, 0),
        priceStatus: priceRes.priceStatus,
        verificationStatus: priceRes.verificationStatus,
        notes: priceRes.notes,
        ahspCode: syncAhspCode,
        ...(syncIdCheck ? {
          ahspIdentityStatus: (syncIdCheck.safe ? 'SAFE' : 'UNSAFE') as 'SAFE' | 'UNSAFE',
          ahspIdentityReason: syncIdCheck.safe ? undefined : syncIdCheck.reason,
        } : {}),
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
              amount: item.unitPrice == null ? null : SafeDecimalEngine.safeMultiply(newVolume, item.unitPrice, 0),
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

  // P1 — one-shot template-apply dedupe state. Refs (not state) so the
  // request -> apply -> result-read sequence stays synchronous within one
  // event tick: the catalog view requests, the apply callback inserts, and
  // the view reads the result before the menu switch unmounts it.
  const templateApplyDedupePendingRef = useRef(false);
  const templateApplyDedupeSeqRef = useRef(0);
  const lastTemplateApplyResultRef = useRef<TemplateApplyDedupeResult | null>(null);

  const requestTemplateApplyDedupe = useCallback((): number => {
    templateApplyDedupePendingRef.current = true;
    templateApplyDedupeSeqRef.current += 1;
    return templateApplyDedupeSeqRef.current;
  }, []);

  const getLastTemplateApplyResult = useCallback((): TemplateApplyDedupeResult | null => {
    return lastTemplateApplyResultRef.current;
  }, []);

  const bulkAddRabItems = useCallback(
    (
      items: Array<Partial<RabItem> & { description: string; volume: number; unit: string }>,
      targetProjectId?: string
    ): RabItem[] => {
      // P1: consume the one-shot request FIRST, so a requested-but-never-
      // applied flag can never leak into an unrelated later insertion
      // (e.g. when bulkAdd throws below on a missing project id).
      const dedupeSeq = templateApplyDedupeSeqRef.current;
      const dedupeRequested = templateApplyDedupePendingRef.current;
      templateApplyDedupePendingRef.current = false;
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

      // P1: when (and only when) the template-apply path requested it,
      // drop exact duplicates against the TARGET project only. Existing
      // rows are never deleted or overwritten; skipped rows are counted
      // for the result message. All other callers keep the old behavior
      // byte-for-byte (insertedItems === newItems).
      let insertedItems = newItems;
      if (dedupeRequested) {
        const existingForProject = allRabItems.filter((it) => it.projectId === pid);
        const { inserted, skipped } = partitionExactDuplicates(existingForProject, newItems);
        insertedItems = inserted;
        lastTemplateApplyResultRef.current = {
          seq: dedupeSeq,
          inserted: inserted.length,
          skipped: skipped.length,
          skippedDescriptions: skipped.map((it) => it.description),
        };
      }

      setAllRabItems((prev) => {
        const next = [...prev, ...insertedItems];
        recalculateProjectSummary(pid, next);
        return next;
      });

      return insertedItems;
    },
    [currentProjectId, recalculateProjectSummary, allRabItems]
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
            // Phase 2J P0 fix: null price → null amount (never 0).
            const amt = up == null ? null : SafeDecimalEngine.safeMultiply(vol, up, 0);
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
        (sum, i) => sum + (i.amount ?? i.totalPrice ?? i.volume * (i.unitPrice ?? 0)),
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

      const direct = sampleRab.reduce((sum, i) => sum + (i.amount ?? 0), 0);
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
      refreshProjectTotals,
      deleteProject,
      duplicateProjectData,
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
      requestTemplateApplyDedupe,
      getLastTemplateApplyResult,
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
      saveError,
      externalChange,
      dismissExternalChange,
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
      refreshProjectTotals,
      deleteProject,
      duplicateProjectData,
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
      requestTemplateApplyDedupe,
      getLastTemplateApplyResult,
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
      saveError,
      externalChange,
      dismissExternalChange,
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
