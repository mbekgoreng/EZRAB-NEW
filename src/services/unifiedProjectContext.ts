/**
 * EZRAB PROJECT COPILOT — UNIFIED PROJECT CONTEXT & ACTION ENGINE CONTRACT
 * 
 * Canonical intelligence layer providing unified, project-isolated,
 * lazy-loaded context and strict action safety for all AI workflows.
 * 
 * Architectural Principles:
 * 1. AI reads, never becomes the source of truth.
 * 2. Strict Project Isolation: Project A context NEVER leaks to Project B.
 * 3. Lazy / Selective loading: Only fetch what the AI prompt needs.
 * 4. Action Safety:
 *    - INFORMATION -> Read-only (requiresApproval: false, isMutation: false)
 *    - SUGGESTION  -> Recommendations / warnings (requiresApproval: false, isMutation: false)
 *    - ACTION      -> Concrete mutations / document creation (requiresApproval: true, isMutation: true)
 */

import type {
  Project,
  RabItem,
  WorkItem,
  QTOItem,
  ScheduleTask,
  KurvaSDataPoint,
} from '../types';
import type {
  DocumentRecord,
  DocumentDefinition,
  ProjectMasterData,
} from '../document-engine/types';
import { DOCUMENT_REGISTRY } from '../document-engine/registry';
import { LocalDocumentRepository } from '../document-engine/repository';
import { calculateCompletenessForDocument } from '../document-engine/completenessEngine';
import { ProjectDataRepository } from '../project-data/repository';
import { listProjectAhspItems } from '../project-data/ahspBridge';
import type {
  ProjectPersonnel,
  ProjectEquipment,
  ProjectJsaItem,
  ProjectRkkData,
  ProjectAhspItem,
} from '../project-data/types';
import { formatRupiah } from '../document-engine/templateEngine';

// =============================================================================
// DOMAIN STATUS & VALUE PROVENANCE
// =============================================================================

export type DomainStatus =
  | 'AVAILABLE'
  | 'EMPTY'
  | 'MISSING'
  | 'ERROR'
  | 'NOT_REQUESTED';

export type ContextDomainKey =
  | 'project'
  | 'ded'
  | 'boq'
  | 'rab'
  | 'ahsp'
  | 'schedule'
  | 'kurvaS'
  | 'personnel'
  | 'equipment'
  | 'jsa'
  | 'rkk'
  | 'documents';

export interface ContextValue<T> {
  value: T;
  source: string;
  sourceType:
    | 'PROJECT'
    | 'RAB'
    | 'BOQ'
    | 'DED'
    | 'SCHEDULE'
    | 'KURVA_S'
    | 'AHSP'
    | 'RESOURCES'
    | 'DOCUMENTS'
    | 'USER_INPUT';
  status: DomainStatus;
  confidence?: number;
  error?: string;
}

// =============================================================================
// DOMAIN CONTEXT DATA SCHEMAS (PROJECTIONS OF EXISTING SOURCE OF TRUTH)
// =============================================================================

export interface ProjectContextData {
  id: string;
  name: string;
  location: string;
  owner: string;
  contractor: string;
  contractValue: number;
  contractValueFormatted: string;
  duration: string;
  startDate: string;
  endDate: string;
  buildingType: string;
  status: string;
  progress: number;
}

export interface RabCategorySummary {
  name: string;
  total: number;
  weightPercent: number;
  itemCount: number;
}

export interface RabContextData {
  totalRab: number;
  totalRabFormatted: string;
  itemCount: number;
  categories: RabCategorySummary[];
  topCostItems: Array<Pick<RabItem, 'id' | 'code' | 'description' | 'volume' | 'unit' | 'unitPrice' | 'amount'>>;
  anomalyItems: Array<Pick<RabItem, 'id' | 'code' | 'description' | 'amount'>>;
  missingVolumeCount: number;
}

export interface BoqContextData {
  itemCount: number;
  items: Array<{
    no: number;
    code: string;
    description: string;
    volume: number;
    unit: string;
    category?: string;
  }>;
}

export interface DedContextData {
  qtoItemCount: number;
  workItemCount: number;
  qtoItems: Array<Pick<QTOItem, 'id' | 'kode' | 'uraian' | 'quantity' | 'unit' | 'status' | 'category'>>;
  workItems: Array<Pick<WorkItem, 'id' | 'code' | 'name' | 'volume' | 'unit' | 'totalAmount' | 'status'>>;
}

export interface ScheduleContextData {
  totalTasks: number;
  completedTasksCount: number;
  activeTasksCount: number;
  pendingTasksCount: number;
  totalDurationWeeks: number;
  tasks: Array<Pick<ScheduleTask, 'id' | 'name' | 'category' | 'weightPercent' | 'startDate' | 'endDate' | 'actualProgressPercent' | 'status'>>;
}

export interface KurvaSContextData {
  plannedProgress: number;
  actualProgress: number;
  deviation: number;
  status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE';
  statusLabel: string;
  totalWeeks: number;
  currentWeek: number;
}

export interface AhspContextData {
  itemCount: number;
  items: Array<{
    code: string;
    description: string;
    unit: string;
    unitPrice: number;
  }>;
}

export interface PersonnelContextData {
  count: number;
  items: Array<Pick<ProjectPersonnel, 'id' | 'name' | 'position' | 'qualification' | 'experience'>>;
}

export interface EquipmentContextData {
  count: number;
  items: Array<Pick<ProjectEquipment, 'id' | 'name' | 'type' | 'quantity' | 'capacity' | 'condition'>>;
}

export interface JsaContextData {
  count: number;
  items: Array<Pick<ProjectJsaItem, 'id' | 'activity' | 'hazard' | 'risk' | 'control' | 'responsiblePerson'>>;
}

export interface RkkContextData {
  count: number;
  items: Array<Pick<ProjectRkkData, 'id' | 'organization' | 'hsePersonnel' | 'safetyObjectives' | 'riskControls'>>;
}

export interface DocumentContextItem {
  id: string;
  definitionId: string;
  name: string;
  code: string;
  category: string;
  status: DocumentRecord['status'];
  revision: number;
  completenessPercentage: number;
  missingDependencies: string[];
  isCore: boolean;
}

export interface DocumentContextData {
  totalRegistered: number;
  createdCount: number;
  completeCount: number;
  incompleteCount: number;
  draftCount: number;
  overallCompletenessPercentage: number;
  items: DocumentContextItem[];
}

// =============================================================================
// UNIFIED PROJECT CONTEXT CONTRACT
// =============================================================================

export interface UnifiedProjectContext {
  projectId: string;
  domains: Record<ContextDomainKey, DomainStatus>;

  project: ProjectContextData;
  ded?: DedContextData;
  boq?: BoqContextData;
  rab?: RabContextData;
  ahsp?: AhspContextData;
  schedule?: ScheduleContextData;
  kurvaS?: KurvaSContextData;
  personnel?: PersonnelContextData;
  equipment?: EquipmentContextData;
  jsa?: JsaContextData;
  rkk?: RkkContextData;
  documents?: DocumentContextData;

  metadata: {
    generatedAt: string;
    activeProjectId: string;
    requestedDomains: ContextDomainKey[];
    availableSources: string[];
    missingSources: string[];
    isReadOnly: true;
    contractVersion: '2.0';
  };
}

// =============================================================================
// AI ACTION ENGINE CONTRACT
// =============================================================================

export type AIActionType =
  | 'INFORMATION'  // Read-only insight, statistics, explanations (NO mutation, NO approval required)
  | 'SUGGESTION'   // Advisory, missing fields, audit recommendations (NO mutation, NO approval required)
  | 'ACTION';      // Draft creation, data mapping, revision creation (MUTATION, APPROVAL MANDATORY)

export type AIActionTargetType =
  | 'DOCUMENT'
  | 'DOCUMENT_PACKAGE'
  | 'RAB'
  | 'BOQ'
  | 'SCHEDULE'
  | 'RESOURCE'
  | 'PROJECT';

export interface AIActionProposal {
  id: string;
  type: AIActionType;
  projectId: string;
  action: string;
  title: string;
  description: string;
  target?: {
    type: AIActionTargetType;
    id?: string;
    definitionId?: string;
  };
  input?: unknown;
  proposedChanges?: unknown;
  warnings?: string[];
  requiresApproval: boolean;
  isMutation: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  createdAt: string;
}

export class ProjectIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectIsolationError';
  }
}

export class ActionSafetyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionSafetyViolationError';
  }
}

// =============================================================================
// CONTEXT ADAPTERS (REUSING EXISTING INTEGRATION IMPLEMENTATIONS)
// =============================================================================

export function adaptProjectData(project: Project | null, targetProjectId: string): { data: ProjectContextData; status: DomainStatus; error?: string } {
  if (!project) {
    return {
      status: 'MISSING',
      error: 'Data proyek belum tersedia.',
      data: {
        id: targetProjectId,
        name: 'Proyek Tidak Ditemukan',
        location: '',
        owner: '',
        contractor: '',
        contractValue: 0,
        contractValueFormatted: 'Rp 0',
        duration: '',
        startDate: '',
        endDate: '',
        buildingType: '',
        status: 'DRAFT',
        progress: 0,
      },
    };
  }

  if (project.id !== targetProjectId) {
    throw new ProjectIsolationError(`PROJECT_ISOLATION_MISMATCH: Target ${targetProjectId} !== Context ${project.id}`);
  }

  const contractValue = project.totalRab || project.costSummary?.grandTotal || 0;
  return {
    status: 'AVAILABLE',
    data: {
      id: project.id,
      name: project.name || 'Proyek Tanpa Nama',
      location: project.location || '',
      owner: project.clientName || '',
      contractor: '',
      contractValue,
      contractValueFormatted: formatRupiah(contractValue),
      duration: project.startDate && project.targetDate ? `${project.startDate} s/d ${project.targetDate}` : '',
      startDate: project.startDate || '',
      endDate: project.targetDate || '',
      buildingType: project.buildingType || 'Konstruksi',
      status: project.status || 'DRAFT',
      progress: project.progress || 0,
    },
  };
}

export function adaptRabData(rabItems?: RabItem[], totalOverride?: number): { data: RabContextData; status: DomainStatus } {
  const items = Array.isArray(rabItems) ? rabItems : [];
  if (items.length === 0) {
    return {
      status: 'EMPTY',
      data: {
        totalRab: totalOverride || 0,
        totalRabFormatted: formatRupiah(totalOverride || 0),
        itemCount: 0,
        categories: [],
        topCostItems: [],
        anomalyItems: [],
        missingVolumeCount: 0,
      },
    };
  }

  const calculatedTotal = items.reduce((sum, item) => sum + (item.totalPrice || item.amount || 0), 0);
  const grandTotal = calculatedTotal > 0 ? calculatedTotal : (totalOverride && totalOverride > 0 ? totalOverride : 0);

  // Group by category
  const categoryMap = new Map<string, { total: number; count: number }>();
  items.forEach((item) => {
    const cat = item.category || item.sectionName || 'Pekerjaan Lainnya';
    const current = categoryMap.get(cat) || { total: 0, count: 0 };
    current.total += (item.totalPrice || item.amount || 0);
    current.count += 1;
    categoryMap.set(cat, current);
  });

  const categories: RabCategorySummary[] = Array.from(categoryMap.entries()).map(([name, val]) => ({
    name,
    total: val.total,
    weightPercent: grandTotal > 0 ? Number(((val.total / grandTotal) * 100).toFixed(2)) : 0,
    itemCount: val.count,
  })).sort((a, b) => b.total - a.total);

  const sortedItems = [...items].sort((a, b) => (b.totalPrice || b.amount || 0) - (a.totalPrice || a.amount || 0));
  const topCostItems = sortedItems.slice(0, 5).map((i) => ({
    id: i.id,
    code: i.code,
    description: i.description,
    volume: i.volume,
    unit: i.unit,
    unitPrice: i.unitPrice,
    amount: i.amount || i.totalPrice || 0,
  }));

  const anomalyItems = items.filter((i) => {
    const cost = i.totalPrice || i.amount || 0;
    return grandTotal > 0 && cost / grandTotal > 0.25;
  }).map((i) => ({
    id: i.id,
    code: i.code,
    description: i.description,
    amount: i.totalPrice || i.amount || 0,
  }));

  const missingVolumeCount = items.filter((i) => !i.volume || i.volume <= 0).length;

  return {
    status: 'AVAILABLE',
    data: {
      totalRab: grandTotal,
      totalRabFormatted: formatRupiah(grandTotal),
      itemCount: items.length,
      categories,
      topCostItems,
      anomalyItems,
      missingVolumeCount,
    },
  };
}

export function adaptBoqData(rabItems?: RabItem[]): { data: BoqContextData; status: DomainStatus } {
  const items = Array.isArray(rabItems) ? rabItems : [];
  if (items.length === 0) {
    return {
      status: 'EMPTY',
      data: { itemCount: 0, items: [] },
    };
  }

  return {
    status: 'AVAILABLE',
    data: {
      itemCount: items.length,
      items: items.map((x, idx) => ({
        no: idx + 1,
        code: x.code || `BOQ-${idx + 1}`,
        description: x.description || '',
        volume: x.volume || 0,
        unit: x.unit || 'LS',
        category: x.category || x.sectionName,
      })),
    },
  };
}

export function adaptDedData(qtoItems?: QTOItem[], workItems?: WorkItem[]): { data: DedContextData; status: DomainStatus } {
  const qto = Array.isArray(qtoItems) ? qtoItems : [];
  const works = Array.isArray(workItems) ? workItems : [];

  if (qto.length === 0 && works.length === 0) {
    return {
      status: 'EMPTY',
      data: { qtoItemCount: 0, workItemCount: 0, qtoItems: [], workItems: [] },
    };
  }

  return {
    status: 'AVAILABLE',
    data: {
      qtoItemCount: qto.length,
      workItemCount: works.length,
      qtoItems: qto.map((q) => ({
        id: q.id,
        kode: q.kode,
        uraian: q.uraian,
        quantity: q.quantity,
        unit: q.unit,
        status: q.status,
        category: q.category,
      })),
      workItems: works.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        volume: w.volume,
        unit: w.unit,
        totalAmount: w.totalAmount,
        status: w.status,
      })),
    },
  };
}

export function adaptScheduleData(tasks?: ScheduleTask[]): { data: ScheduleContextData; status: DomainStatus } {
  const taskList = Array.isArray(tasks) ? tasks : [];
  if (taskList.length === 0) {
    return {
      status: 'EMPTY',
      data: {
        totalTasks: 0,
        completedTasksCount: 0,
        activeTasksCount: 0,
        pendingTasksCount: 0,
        totalDurationWeeks: 0,
        tasks: [],
      },
    };
  }

  let maxWeek = 0;
  taskList.forEach((t) => {
    if (t.endWeek && t.endWeek > maxWeek) maxWeek = t.endWeek;
  });

  return {
    status: 'AVAILABLE',
    data: {
      totalTasks: taskList.length,
      completedTasksCount: taskList.filter((t) => t.status === 'COMPLETED' || t.actualProgressPercent === 100).length,
      activeTasksCount: taskList.filter((t) => t.status === 'ON_TRACK' || t.status === 'DELAYED').length,
      pendingTasksCount: taskList.filter((t) => !t.status || t.status === 'PENDING').length,
      totalDurationWeeks: maxWeek || 12,
      tasks: taskList.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        weightPercent: t.weightPercent,
        startDate: t.startDate,
        endDate: t.endDate,
        actualProgressPercent: t.actualProgressPercent,
        status: t.status,
      })),
    },
  };
}

export function adaptKurvaSData(
  kurvaData?: KurvaSDataPoint[],
  tasks?: ScheduleTask[],
  fallbackProgress?: number
): { data: KurvaSContextData; status: DomainStatus } {
  const points = Array.isArray(kurvaData) ? kurvaData : [];
  if (points.length === 0) {
    return {
      status: 'EMPTY',
      data: {
        plannedProgress: 0,
        actualProgress: fallbackProgress || 0,
        deviation: 0,
        status: 'ON_TRACK',
        statusLabel: 'Belum ada data Kurva S',
        totalWeeks: 0,
        currentWeek: 0,
      },
    };
  }

  const lastPoint = points[points.length - 1];
  const currentWeekPoint = points.find((p) => p.actualProgressPercent !== null && p.actualProgressPercent !== undefined) || lastPoint;
  const planned = currentWeekPoint?.cumulativePlannedPercent || 0;
  const actual = currentWeekPoint?.actualProgressPercent !== null && currentWeekPoint?.actualProgressPercent !== undefined
    ? currentWeekPoint.actualProgressPercent
    : fallbackProgress || 0;

  const deviation = Number((actual - planned).toFixed(2));
  let status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE' = 'ON_TRACK';
  let statusLabel = 'Sesuai Rencana (On Track)';

  if (deviation > 1.5) {
    status = 'AHEAD_OF_SCHEDULE';
    statusLabel = `Lebih Cepat (+${deviation}% Ahead of Schedule)`;
  } else if (deviation < -1.5) {
    status = 'BEHIND_SCHEDULE';
    statusLabel = `Terlambat (${deviation}% Behind Schedule)`;
  }

  return {
    status: 'AVAILABLE',
    data: {
      plannedProgress: Number(planned.toFixed(2)),
      actualProgress: Number(actual.toFixed(2)),
      deviation,
      status,
      statusLabel,
      totalWeeks: points.length,
      currentWeek: currentWeekPoint?.weekIndex || 1,
    },
  };
}

export function adaptAhspData(projectId: string, explicitItems?: ProjectAhspItem[]): { data: AhspContextData; status: DomainStatus } {
  try {
    const items = explicitItems && explicitItems.length > 0 ? explicitItems : listProjectAhspItems(projectId);
    if (!items || items.length === 0) {
      return { status: 'EMPTY', data: { itemCount: 0, items: [] } };
    }
    return {
      status: 'AVAILABLE',
      data: {
        itemCount: items.length,
        items: items.map((x) => ({
          code: x.ahspCode,
          description: x.description,
          unit: x.unit,
          unitPrice: (x.materialCost || 0) + (x.laborCost || 0) + (x.equipmentCost || 0),
        })),
      },
    };
  } catch {
    return { status: 'ERROR', data: { itemCount: 0, items: [] } };
  }
}

export function adaptPersonnelData(projectId: string, explicitItems?: ProjectPersonnel[]): { data: PersonnelContextData; status: DomainStatus } {
  try {
    const repo = new ProjectDataRepository<ProjectPersonnel>('personnel', projectId);
    const items = explicitItems && explicitItems.length > 0 ? explicitItems : repo.list();
    if (!items || items.length === 0) {
      return { status: 'EMPTY', data: { count: 0, items: [] } };
    }
    return {
      status: 'AVAILABLE',
      data: {
        count: items.length,
        items: items.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          qualification: p.qualification,
          experience: p.experience,
        })),
      },
    };
  } catch {
    return { status: 'ERROR', data: { count: 0, items: [] } };
  }
}

export function adaptEquipmentData(projectId: string, explicitItems?: ProjectEquipment[]): { data: EquipmentContextData; status: DomainStatus } {
  try {
    const repo = new ProjectDataRepository<ProjectEquipment>('equipment', projectId);
    const items = explicitItems && explicitItems.length > 0 ? explicitItems : repo.list();
    if (!items || items.length === 0) {
      return { status: 'EMPTY', data: { count: 0, items: [] } };
    }
    return {
      status: 'AVAILABLE',
      data: {
        count: items.length,
        items: items.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          quantity: e.quantity,
          capacity: e.capacity,
          condition: e.condition,
        })),
      },
    };
  } catch {
    return { status: 'ERROR', data: { count: 0, items: [] } };
  }
}

export function adaptJsaData(projectId: string, explicitItems?: ProjectJsaItem[]): { data: JsaContextData; status: DomainStatus } {
  try {
    const repo = new ProjectDataRepository<ProjectJsaItem>('jsa', projectId);
    const items = explicitItems && explicitItems.length > 0 ? explicitItems : repo.list();
    if (!items || items.length === 0) {
      return { status: 'EMPTY', data: { count: 0, items: [] } };
    }
    return {
      status: 'AVAILABLE',
      data: {
        count: items.length,
        items: items.map((j) => ({
          id: j.id,
          activity: j.activity,
          hazard: j.hazard,
          risk: j.risk,
          control: j.control,
          responsiblePerson: j.responsiblePerson,
        })),
      },
    };
  } catch {
    return { status: 'ERROR', data: { count: 0, items: [] } };
  }
}

export function adaptRkkData(projectId: string, explicitItems?: ProjectRkkData[]): { data: RkkContextData; status: DomainStatus } {
  try {
    const repo = new ProjectDataRepository<ProjectRkkData>('rkk', projectId);
    const items = explicitItems && explicitItems.length > 0 ? explicitItems : repo.list();
    if (!items || items.length === 0) {
      return { status: 'EMPTY', data: { count: 0, items: [] } };
    }
    return {
      status: 'AVAILABLE',
      data: {
        count: items.length,
        items: items.map((r) => ({
          id: r.id,
          organization: r.organization,
          hsePersonnel: r.hsePersonnel,
          safetyObjectives: r.safetyObjectives,
          riskControls: r.riskControls,
        })),
      },
    };
  } catch {
    return { status: 'ERROR', data: { count: 0, items: [] } };
  }
}

export function adaptDocumentsData(projectId: string, explicitRecords?: DocumentRecord[]): { data: DocumentContextData; status: DomainStatus } {
  try {
    const repo = new LocalDocumentRepository(projectId);
    const records = explicitRecords && explicitRecords.length > 0 ? explicitRecords : repo.getProjectDocuments(projectId);

    const items: DocumentContextItem[] = DOCUMENT_REGISTRY.map((def) => {
      const rec = records.find((r) => r.definitionId === def.id);
      const completeness = calculateCompletenessForDocument(def, rec);
      return {
        id: rec?.id || `${def.id}-UNINITIALIZED`,
        definitionId: def.id,
        name: def.name,
        code: def.code,
        category: def.category,
        status: rec?.status || 'NOT_STARTED',
        revision: rec?.revision || 0,
        completenessPercentage: completeness.completenessPercentage,
        missingDependencies: completeness.missingDependencies,
        isCore: def.requirement === 'CORE',
      };
    });

    const created = items.filter((i) => i.status !== 'NOT_STARTED');
    const complete = items.filter((i) => i.status === 'COMPLETE' || i.status === 'EXPORTED');
    const incomplete = items.filter((i) => i.status === 'INCOMPLETE');
    const draft = items.filter((i) => i.status === 'DRAFT');

    const totalCore = items.filter((i) => i.isCore).length;
    const completeCore = items.filter((i) => i.isCore && (i.status === 'COMPLETE' || i.status === 'EXPORTED')).length;
    const overallPercentage = totalCore > 0 ? Math.round((completeCore / totalCore) * 100) : 0;

    return {
      status: 'AVAILABLE',
      data: {
        totalRegistered: DOCUMENT_REGISTRY.length,
        createdCount: created.length,
        completeCount: complete.length,
        incompleteCount: incomplete.length,
        draftCount: draft.length,
        overallCompletenessPercentage: overallPercentage,
        items,
      },
    };
  } catch {
    return {
      status: 'ERROR',
      data: {
        totalRegistered: DOCUMENT_REGISTRY.length,
        createdCount: 0,
        completeCount: 0,
        incompleteCount: 0,
        draftCount: 0,
        overallCompletenessPercentage: 0,
        items: [],
      },
    };
  }
}

// =============================================================================
// CANONICAL BUILDER (UNIFIED PROJECT CONTEXT BUILDER)
// =============================================================================

export interface UnifiedProjectContextOptions {
  projectId: string;
  project: Project | null;
  requestedDomains?: ContextDomainKey[];
  rabItems?: RabItem[];
  workItems?: WorkItem[];
  qtoItems?: QTOItem[];
  scheduleTasks?: ScheduleTask[];
  kurvaSData?: KurvaSDataPoint[];
  personnel?: ProjectPersonnel[];
  equipment?: ProjectEquipment[];
  jsa?: ProjectJsaItem[];
  rkk?: ProjectRkkData[];
  ahspItems?: ProjectAhspItem[];
  documents?: DocumentRecord[];
  question?: string;
}

export function buildUnifiedProjectContext(options: UnifiedProjectContextOptions): UnifiedProjectContext {
  const { projectId, project } = options;

  if (!projectId || !projectId.trim()) {
    throw new ProjectIsolationError('PROJECT_ISOLATION_ERROR: Target projectId cannot be empty or null (Fail-Closed).');
  }

  // Enforce project isolation
  if (project && project.id !== projectId) {
    throw new ProjectIsolationError(`PROJECT_ISOLATION_ERROR: Active project ID mismatch. Option ${projectId} !== project.id ${project.id}.`);
  }

  // Determine requested domains (default to standard construction subset if not explicitly specified)
  const requested = options.requestedDomains || ['project', 'rab', 'boq', 'schedule', 'documents'];
  const isReq = (key: ContextDomainKey) => requested.includes(key);

  const domains: Record<ContextDomainKey, DomainStatus> = {
    project: 'NOT_REQUESTED',
    ded: 'NOT_REQUESTED',
    boq: 'NOT_REQUESTED',
    rab: 'NOT_REQUESTED',
    ahsp: 'NOT_REQUESTED',
    schedule: 'NOT_REQUESTED',
    kurvaS: 'NOT_REQUESTED',
    personnel: 'NOT_REQUESTED',
    equipment: 'NOT_REQUESTED',
    jsa: 'NOT_REQUESTED',
    rkk: 'NOT_REQUESTED',
    documents: 'NOT_REQUESTED',
  };

  // 1. Project (always resolved as root)
  const projRes = adaptProjectData(project, projectId);
  domains.project = projRes.status;

  // 2. RAB & BOQ
  let rabData: RabContextData | undefined = undefined;
  if (isReq('rab')) {
    const res = adaptRabData(options.rabItems, project?.totalRab);
    domains.rab = res.status;
    rabData = res.data;
  }

  let boqData: BoqContextData | undefined = undefined;
  if (isReq('boq')) {
    const res = adaptBoqData(options.rabItems);
    domains.boq = res.status;
    boqData = res.data;
  }

  // 3. DED / QTO
  let dedData: DedContextData | undefined = undefined;
  if (isReq('ded')) {
    const res = adaptDedData(options.qtoItems, options.workItems);
    domains.ded = res.status;
    dedData = res.data;
  }

  // 4. Schedule & Kurva S
  let scheduleData: ScheduleContextData | undefined = undefined;
  if (isReq('schedule')) {
    const res = adaptScheduleData(options.scheduleTasks);
    domains.schedule = res.status;
    scheduleData = res.data;
  }

  let kurvaSData: KurvaSContextData | undefined = undefined;
  if (isReq('kurvaS')) {
    const res = adaptKurvaSData(options.kurvaSData, options.scheduleTasks, project?.progress);
    domains.kurvaS = res.status;
    kurvaSData = res.data;
  }

  // 5. AHSP
  let ahspData: AhspContextData | undefined = undefined;
  if (isReq('ahsp')) {
    const res = adaptAhspData(projectId, options.ahspItems);
    domains.ahsp = res.status;
    ahspData = res.data;
  }

  // 6. Project Resources (Personnel, Equipment, JSA, RKK)
  let personnelData: PersonnelContextData | undefined = undefined;
  if (isReq('personnel')) {
    const res = adaptPersonnelData(projectId, options.personnel);
    domains.personnel = res.status;
    personnelData = res.data;
  }

  let equipmentData: EquipmentContextData | undefined = undefined;
  if (isReq('equipment')) {
    const res = adaptEquipmentData(projectId, options.equipment);
    domains.equipment = res.status;
    equipmentData = res.data;
  }

  let jsaData: JsaContextData | undefined = undefined;
  if (isReq('jsa')) {
    const res = adaptJsaData(projectId, options.jsa);
    domains.jsa = res.status;
    jsaData = res.data;
  }

  let rkkData: RkkContextData | undefined = undefined;
  if (isReq('rkk')) {
    const res = adaptRkkData(projectId, options.rkk);
    domains.rkk = res.status;
    rkkData = res.data;
  }

  // 7. Documents
  let documentsData: DocumentContextData | undefined = undefined;
  if (isReq('documents')) {
    const res = adaptDocumentsData(projectId, options.documents);
    domains.documents = res.status;
    documentsData = res.data;
  }

  // Metadata summary
  const availableSources: string[] = [];
  const missingSources: string[] = [];

  (Object.keys(domains) as ContextDomainKey[]).forEach((dom) => {
    if (domains[dom] === 'AVAILABLE') availableSources.push(dom);
    else if (domains[dom] === 'MISSING' || domains[dom] === 'EMPTY') missingSources.push(dom);
  });

  return {
    projectId,
    domains,
    project: projRes.data,
    ded: dedData,
    boq: boqData,
    rab: rabData,
    ahsp: ahspData,
    schedule: scheduleData,
    kurvaS: kurvaSData,
    personnel: personnelData,
    equipment: equipmentData,
    jsa: jsaData,
    rkk: rkkData,
    documents: documentsData,
    metadata: {
      generatedAt: new Date().toISOString(),
      activeProjectId: projectId,
      requestedDomains: requested,
      availableSources,
      missingSources,
      isReadOnly: true,
      contractVersion: '2.0',
    },
  };
}

// =============================================================================
// AI ACTION PROPOSAL FACTORY & SAFETY VALIDATOR
// =============================================================================

export function createInformationProposal(params: {
  projectId: string;
  action: string;
  title: string;
  description: string;
  input?: unknown;
}): AIActionProposal {
  return {
    id: `INFO-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'INFORMATION',
    projectId: params.projectId,
    action: params.action,
    title: params.title,
    description: params.description,
    input: params.input,
    requiresApproval: false,
    isMutation: false,
    status: 'APPLIED',
    createdAt: new Date().toISOString(),
  };
}

export function createSuggestionProposal(params: {
  projectId: string;
  action: string;
  title: string;
  description: string;
  warnings?: string[];
  input?: unknown;
}): AIActionProposal {
  return {
    id: `SUGG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'SUGGESTION',
    projectId: params.projectId,
    action: params.action,
    title: params.title,
    description: params.description,
    warnings: params.warnings,
    input: params.input,
    requiresApproval: false,
    isMutation: false,
    status: 'APPLIED',
    createdAt: new Date().toISOString(),
  };
}

export function createActionProposal(params: {
  projectId: string;
  action: string;
  title: string;
  description: string;
  target?: AIActionProposal['target'];
  input?: unknown;
  proposedChanges: unknown;
  warnings?: string[];
}): AIActionProposal {
  return {
    id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'ACTION',
    projectId: params.projectId,
    action: params.action,
    title: params.title,
    description: params.description,
    target: params.target,
    input: params.input,
    proposedChanges: params.proposedChanges,
    warnings: params.warnings,
    requiresApproval: true,
    isMutation: true,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validates that an action proposal complies with strict safety rules before execution:
 * 1. An ACTION must have requiresApproval === true and status === 'APPROVED'.
 * 2. Unapproved ACTION proposals are strictly rejected from mutating the source of truth.
 * 3. INFORMATION and SUGGESTION proposals are strictly prevented from triggering any mutations.
 */
export function validateActionSafety(proposal: AIActionProposal): { allowed: boolean; reason?: string } {
  if (proposal.type === 'INFORMATION' || proposal.type === 'SUGGESTION') {
    if (proposal.isMutation) {
      throw new ActionSafetyViolationError(`SECURITY_VIOLATION: ${proposal.type} proposal cannot declare isMutation: true.`);
    }
    return { allowed: true };
  }

  if (proposal.type === 'ACTION') {
    if (!proposal.requiresApproval) {
      throw new ActionSafetyViolationError('SECURITY_VIOLATION: ACTION proposals must strictly require user approval.');
    }
    if (proposal.status !== 'APPROVED') {
      return {
        allowed: false,
        reason: `Aksi "${proposal.title}" membutuhkan persetujuan pengguna sebelum dapat diterapkan ke data proyek (Status: ${proposal.status}).`,
      };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Unknown proposal type.' };
}
