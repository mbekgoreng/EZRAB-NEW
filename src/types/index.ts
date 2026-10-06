export type UserRole = 'SUPER_ADMIN' | 'ESTIMATOR' | 'DIREKSI' | 'CLIENT' | 'EDITOR';

export type ProjectStatus = 
  | 'DRAFT'
  | 'AI_ANALYSIS'
  | 'EDITOR_REVIEW'
  | 'SUBMITTED_FOR_REVIEW'
  | 'PENDING_DIRECTOR_REVIEW'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'RESUBMITTED'
  | 'DIRECTOR_APPROVED'
  | 'READY_FOR_CLIENT_REVIEW'
  | 'CLIENT_APPROVED'
  | 'CLIENT_REVISION_REQUESTED'
  | 'FINAL_LOCKED'
  | 'COMPLETED'
  | 'ARCHIVED'
  | 'draft'
  | 'in_progress'
  | 'approved'
  | 'completed'
  | 'archived';

export type VerificationStatus = 
  | 'AI_GENERATED'
  | 'NEEDS_VERIFICATION'
  | 'VERIFIED'
  | 'ESTIMATED'
  | 'BLOCKED_BY_PROJECT_CONSTRAINT'
  | 'REJECTED'
  | 'LOCKED';

export type ItemOriginType = 
  | 'AI_GENERATED'
  | 'MANUAL'
  | 'AI_VERIFIED'
  | 'EDITOR_MODIFIED';

export type BuildingType = 
  | 'Rumah Tinggal'
  | 'Gedung Kantor'
  | 'Hotel & Resort'
  | 'Apartemen'
  | 'Ruko / Rukan'
  | 'Sekolah / Kampus'
  | 'Rumah Sakit / Klinik'
  | 'Gudang & Pabrik'
  | 'Restoran / Cafe'
  | 'Renovasi'
  | 'Infrastruktur'
  | 'Landscape & Kawasan'
  | 'Renovasi & Maintenance'
  | 'MEP & Sistem'
  | 'Custom';

export type IndonesianRegion = 
  | 'DKI Jakarta (Indeks 1.00)'
  | 'Jawa Barat / Bandung (Indeks 0.95)'
  | 'Jawa Tengah / Semarang (Indeks 0.90)'
  | 'Jawa Timur / Surabaya (Indeks 0.94)'
  | 'Bali / Denpasar (Indeks 1.05)'
  | 'Sumatera Utara / Medan (Indeks 1.08)'
  | 'Kalimantan Timur / IKN (Indeks 1.25)'
  | 'Sulawesi Selatan / Makassar (Indeks 1.10)'
  | 'Papua & Maluku (Indeks 1.45)';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  companyId: string;
  companyName: string;
  title: string;
  phone?: string;
  twoFactorEnabled?: boolean;
}

export interface Company {
  id: string;
  name: string;
  logo?: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string; // NPWP
  directorName: string;
  leadEstimatorName: string;
  defaultOverheadPercent: number;
  defaultProfitPercent: number;
  defaultContingencyPercent: number;
  defaultTaxPercent: number;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  fileType: 'PDF' | 'DWG' | 'JPG' | 'PNG' | 'DOCX' | 'XLSX';
  category: 'Arsitektur' | 'Struktur' | 'MEP' | 'Detail' | 'Spesifikasi' | 'BoQ' | 'Lainnya';
  uploadedAt: string;
  uploadedBy: string;
  pageCount: number;
  analysisStatus: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
  previewUrl?: string;
  extractedText?: string;
}

export interface AIDetectionItem {
  id: string;
  documentId?: string;
  pageNumber: number;
  drawingTitle: string;
  category: string;
  elementName: string;
  detectedDimensions?: {
    length?: number;
    width?: number;
    height?: number;
    thickness?: number;
    deductionArea?: number;
    count?: number;
  };
  calculationFormula: string;
  quantity: number;
  unit: string;
  confidenceScore: number;
  isAssumption: boolean;
  assumptionReason?: string;
  verificationStatus: VerificationStatus;
  suggestedAHSPCode?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AHSPComponent {
  id: string;
  code: string;
  name: string;
  unit: string;
  coefficient: number;
  unitPrice: number;
  total: number;
  resourceId?: string;
  resourceType?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  originalCoefficient?: number;
  isOverridden?: boolean;
  priceSource?: string;
  region?: string;
  // ---- AHSP 2026 canonical provenance extensions ----
  /** Coefficient exactly as printed in the source (e.g. "0,150"). */
  coefficientRaw?: string;
  /** Raw source line the component was reconstructed from (audit trail). */
  rawLine?: string;
  /** PDF page of the source annex where this component row appears. */
  sourcePage?: number;
}

export type TakeoffMethod = 
  | 'MANUAL' 
  | 'DIMENSION' 
  | 'PERIMETER' 
  | 'AREA' 
  | 'WALL' 
  | 'ROOF' 
  | 'EXCAVATION' 
  | 'FILL' 
  | 'FORMWORK' 
  | 'STEEL' 
  | 'BREAKDOWN' 
  | 'AI_TAKEOFF' 
  | 'CUSTOM';

export interface TakeoffBreakdownRow {
  id: string;
  description: string;
  length: number;
  width: number;
  height: number;
  quantity: number;
  subtotal: number;
}

export interface TakeoffConfig {
  method: TakeoffMethod;
  formulaName?: string;
  formulaExpression?: string;
  parameters?: Record<string, number>;
  breakdownRows?: TakeoffBreakdownRow[];
  calculatedVolume: number;
  manualVolume?: number;
  finalVolume: number;
  isManualOverridden?: boolean;
  aiConfidence?: number;
  notes?: string;
}

export interface AHSPProjectSnapshot {
  ahspId: string;
  code: string;
  version: string;
  name: string;
  unit: string;
  laborComponents: AHSPComponent[];
  materialComponents: AHSPComponent[];
  equipmentComponents: AHSPComponent[];
  unitPrice: number;
  sourceDocument?: string;
  isCustomModified?: boolean;
  snapshotTimestamp?: string;
}

export type ItemCalculationStatus = 
  | 'DRAFT'
  | 'CALCULATED'
  | 'PRICE_INCOMPLETE'
  | 'AI_VERIFIED'
  | 'MANUAL_OVERRIDE'
  | 'READY'
  | 'REVIEW_REQUIRED';

export interface AHSPItem {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  regulationSource: string;
  laborComponents: AHSPComponent[];
  materialComponents: AHSPComponent[];
  equipmentComponents: AHSPComponent[];
  totalLabor: number;
  totalMaterial: number;
  totalEquipment: number;
  unitPrice: number;
  lastUpdated: string;
  isCustom?: boolean;
}

export interface PriceItem {
  id: string;
  code: string;
  name: string;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  subcategory?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  specification: string;
  unit: string;
  price: number;
  location: string;
  supplier?: string;
  periodVersion: string;
  lastUpdated: string;
  priceSource: string;
}

export interface ItemComment {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  text: string;
  timestamp: string;
  isResolved?: boolean;
}

export interface SubItem {
  id: string;
  code: string;
  description: string;
  volume: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface RABItem {
  id: string;
  sectionId: string;
  subSectionId?: string;
  itemNumber: string; // e.g. "1.1", "C.1.2"
  wbsNumber?: string;  // e.g. "1.1.2"
  code: string;
  description: string;
  specification: string;
  volume: number;
  unit: string;
  materialPrice: number;
  laborPrice: number;
  equipmentPrice: number;
  unitPrice: number;
  totalPrice: number; // volume * unitPrice
  weightPercent?: number; // Bobot % terhadap Grand Total
  
  // Scheduling & Kurva S
  startDate?: string;
  endDate?: string;
  duration?: number; // Days

  // Traceability & Origin
  ahspCode?: string;
  ahspId?: string;
  ahspVersion?: string;
  sourceId?: string;
  sourceDocument?: string;
  sourcePage?: number;
  calculationFormula?: string;
  aiConfidence?: number;
  isAssumption?: boolean;
  assumptionNote?: string;
  verificationStatus: VerificationStatus;
  originType?: ItemOriginType;
  notes?: string;

  // Pipeline Reconciliation & Canonical ID
  canonicalItemId?: string;
  confidenceBreakdown?: {
    overall: number;
    quantity: number;
    specification: number;
    price: number;
  };
  evidenceDetails?: {
    sourcePages: number[];
    sourceRegion?: string;
    sourceType?: string;
    calculation?: string;
    inputs?: Record<string, number>;
  };
  conflicts?: string[];
  isDuplicateMerged?: boolean;
  mergeCount?: number;

  // Quantity Takeoff & AHSP Snapshot
  takeoffConfig?: TakeoffConfig;
  ahspSnapshot?: AHSPProjectSnapshot;
  calculationStatus?: ItemCalculationStatus;

  // Director Markup & Locks
  directorMarkupPercent?: number;
  directorMarkupNominal?: number;
  finalUnitPrice?: number;
  finalTotalPrice?: number;
  isLocked?: boolean;
  isCellLocked?: {
    volume?: boolean;
    unitPrice?: boolean;
    materialPrice?: boolean;
    laborPrice?: boolean;
    equipmentPrice?: boolean;
    description?: boolean;
  };

  // Comments & Hierarchy
  comments?: ItemComment[];
  subItems?: SubItem[];

  history?: Array<{
    timestamp: string;
    userId: string;
    userName: string;
    field: string;
    oldVal: any;
    newVal: any;
    reason?: string;
  }>;
}

export interface RABSubSection {
  id: string;
  sectionId: string;
  code: string; // e.g. "C.1"
  name: string; // e.g. "Pekerjaan Beton Bertulang"
  subtotal: number;
  items: RABItem[];
}

export interface RABSection {
  id: string;
  code: string; // e.g. "A", "B", "C"
  name: string; // e.g. "PEKERJAAN STRUKTUR"
  floor?: string;
  subtotal: number;
  subSections?: RABSubSection[];
  items: RABItem[];
}

export interface ProjectCostSummary {
  directCost: number;
  overheadPercent: number;
  overheadAmount: number;
  profitPercent: number;
  profitAmount: number;
  contingencyPercent: number;
  contingencyAmount: number;
  directorMarkupPercent: number;
  directorMarkupNominal: number;
  directorMarkupTotal: number;
  showMarkupToEditor: boolean;
  showMarkupToClient: boolean;
  subtotalBeforeTax: number;
  taxPercent: number;
  taxAmount: number;
  pphPercent?: number;
  pphAmount?: number;
  grandTotal: number;
  costPerM2: number;
}

export interface KurvaSDataPoint {
  weekIndex: number;
  weekLabel: string;
  startDate: string;
  endDate: string;
  plannedWeeklyPercent: number;
  cumulativePlannedPercent: number;
  plannedWeeklyCost: number;
  cumulativePlannedCost: number;
  actualProgressPercent?: number;
}

export interface ProjectVersion {
  id: string;
  versionNumber: string;
  createdAt: string;
  createdBy: string;
  creatorName: string;
  status: ProjectStatus;
  notes: string;
  summary: ProjectCostSummary;
  totalItems: number;
  snapshotData?: string;
}

export interface SpreadsheetLayoutConfig {
  columnWidths: Record<string, number>;
  hiddenColumns: Record<string, boolean>;
  frozenColumns: number; // 0, 1, 3
  rowDensity: 'COMPACT' | 'NORMAL' | 'LARGE';
  zoomLevel: number; // 75, 90, 100, 110, 125
}

export interface Project {
  id: string;
  projectNumber?: string;
  name: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  region?: IndonesianRegion;
  buildingType?: BuildingType;
  landArea?: number;
  buildingArea?: number;
  floorCount?: number;
  year?: number;
  startDate?: string;
  targetDate?: string;
  estimatorId?: string;
  estimatorName?: string;
  reviewerId?: string;
  reviewerName?: string;
  status: ProjectStatus;
  currentVersion?: string;
  notes?: string;
  companyId?: string;
  coverImage?: string;

  // Government & Standard Template Engine Snapshot
  institution?: string;           // e.g. "Kementerian PUPR", "Dinas PU Daerah", "Swasta"
  directorate?: string;           // e.g. "Bina Marga", "Cipta Karya", "Sumber Daya Air"
  projectTypeDomain?: string;     // e.g. "Jalan", "Jembatan", "Gedung", "Perumahan", "Irigasi", "Bendung"
  templateId?: string;            // e.g. "PUPR-BM-JALAN-01"
  templateVersion?: string;       // e.g. "1.0"
  templateSnapshot?: any;         // Frozen immutable copy of the template at project creation
  ahspVersion?: string;           // e.g. "Permen PUPR No. 1/2022"
  priceDatabaseVersion?: string;  // e.g. "2026 Q1 - Wilayah"
  formulaVersion?: string;        // e.g. "1.0"
  contractType?: string;          // e.g. "Harga Satuan (Unit Price)", "Lump Sum"
  fundingSource?: string;         // e.g. "APBN", "APBD", "Swasta"
  ownerName?: string;             // Nama Pemilik / PPK
  consultantName?: string;        // Nama Konsultan Supervisi
  contractorName?: string;        // Nama Kontraktor Pelaksana
  budgetYear?: number;            // Tahun Anggaran
  province?: string;              // Provinsi
  cityRegency?: string;           // Kabupaten / Kota

  sections: RABSection[];
  costSummary: ProjectCostSummary;
  kurvaSData?: KurvaSDataPoint[];
  documents?: ProjectDocument[];
  detections?: AIDetectionItem[];
  versions?: ProjectVersion[];
  members?: ProjectMember[];
  notesList?: ProjectNote[];
  shareToken?: string;
  sharePermission?: 'VIEW_ONLY' | 'CAN_COMMENT' | 'CAN_EDIT';
  isShareActive?: boolean;
  layoutConfig?: SpreadsheetLayoutConfig;
  isArchived?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt?: string;

  // Project Creation & Lifecycle Contract
  creationMethod?: 'magic_ai' | 'manual' | 'volume_calculation' | 'template' | 'magic_ai_dashboard';
  initialPrompt?: string;
  currentPrompt?: string;
  projectType?: string;
  parameters?: Record<string, any>;
  assumptions?: Record<string, any>;

  // Backwards Compatibility Fields
  client?: string;
  progress?: number;
  totalRab?: number;
  itemsCount?: number;
  type?: any;
}

export type NoteStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_REVIEW' | 'RESOLVED' | 'CLOSED';
export type NotePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface NoteAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSizeFormatted: string;
  uploadedAt?: string;
}

export interface NoteComment {
  id: string;
  noteId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  attachments?: NoteAttachment[];
}

export interface NoteAISuggestion {
  id: string;
  noteId: string;
  analysisText: string;
  targetSectionId?: string;
  targetItemId?: string;
  targetItemName?: string;
  suggestedChanges: {
    field: string;
    label: string;
    oldValue: any;
    newValue: any;
  }[];
  estimatedCostDelta?: number;
  status: 'PENDING' | 'APPLIED' | 'REJECTED';
}

export interface ProjectNote {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  authorAvatar?: string;
  title: string;
  content: string;
  status: NoteStatus;
  priority: NotePriority;
  assignedToId?: string;
  assignedToName?: string;
  assignedToRole?: UserRole;
  relatedSectionId?: string;
  relatedItemId?: string;
  relatedItemName?: string;
  relatedWbsNumber?: string;
  relatedAhspCode?: string;
  attachments?: NoteAttachment[];
  comments?: NoteComment[];
  aiSuggestion?: NoteAISuggestion;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: UserRole;
  avatar?: string;
  assignedAt: string;
  permissions?: string[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 
    | 'NOTE_NEW' 
    | 'NOTE_REPLY' 
    | 'REVIEW_SUBMITTED' 
    | 'REVISION_REQUESTED' 
    | 'PROJECT_APPROVED' 
    | 'PROJECT_ASSIGNED' 
    | 'CLIENT_CHANGE_REQUESTED'
    | 'SYSTEM';
  projectId?: string;
  projectName?: string;
  noteId?: string;
  itemId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  projectId?: string;
  projectName?: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: 
    | 'LOGIN'
    | 'LOGOUT'
    | 'PROJECT_CREATE'
    | 'PROJECT_UPDATE'
    | 'PROJECT_DELETE'
    | 'PROJECT_ARCHIVE'
    | 'PROJECT_UNARCHIVE'
    | 'DOCUMENT_UPLOAD'
    | 'AI_TAKEOFF_GENERATE'
    | 'ITEM_ADD'
    | 'ITEM_EDIT'
    | 'ITEM_DELETE'
    | 'VOLUME_CHANGE'
    | 'PRICE_CHANGE'
    | 'AHSP_MODIFY'
    | 'DIRECTOR_MARKUP'
    | 'DIRECTOR_APPROVE'
    | 'DIRECTOR_REJECT'
    | 'SUBMIT_FOR_REVIEW'
    | 'VERSION_CREATE'
    | 'EXPORT_EXCEL'
    | 'EXPORT_PDF'
    | 'SHARE_LINK_GENERATE'
    | 'PERMISSION_CHANGE';
  details: string;
  timestamp: string;
  ipAddress: string;
  oldValue?: string;
  newValue?: string;
}

export interface AIValidationRuleResult {
  id: string;
  ruleCode: string;
  severity: 'RED' | 'YELLOW' | 'GREEN';
  title: string;
  description: string;
  affectedItemIds: string[];
  recommendation: string;
  autoFixAvailable: boolean;
}

export interface RegulationStandard {
  id: string;
  code: string;
  name: string;
  institution: string;
  year: number;
  effectiveDate: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'DRAFT';
  description: string;
  totalAHSPTemplates: number;
  version: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  referencedItemIds?: string[];
  suggestedAction?: {
    label: string;
    actionType: string;
    payload: any;
  };
}

// Volume Calculator & Quantity Takeoff Architecture Types
export type VolumeSourceType = 'CALCULATOR' | 'MANUAL' | 'MANUAL_OVERRIDE' | 'IMPORT' | 'AI_GENERATED';

export interface CalculationRun {
  id: string; // e.g. "CALC-2026-000001"
  projectId: string;
  calculatorId: string; // e.g. "BOWPLANK"
  formulaVersion: string; // e.g. "1.0"
  inputSnapshot: Record<string, number | string>;
  normalizedInputSnapshot: Record<string, number>;
  resultSnapshot: {
    primaryQuantity: number;
    unit: string;
    breakdown: Record<string, number>;
    materials?: Array<{ name: string; quantity: number; unit: string; coefficient?: number }>;
    labor?: Array<{ name: string; quantity: number; unit: string; coefficient?: number }>;
    equipment?: Array<{ name: string; quantity: number; unit: string; coefficient?: number }>;
    notes?: string;
  };
  notes?: string;
  createdBy: string;
  createdAt: string;
  version: number;
  parentRunId?: string;
}

export type QTOSourceType = 'CALCULATOR' | 'MANUAL' | 'AI' | 'IMPORT';
export type QTOItemStatus = 'DRAFT' | 'CALCULATED' | 'VERIFIED' | 'MANUAL' | 'AI_GENERATED' | 'SYNCED_TO_RAB';

export interface QTOItem {
  id: string; // e.g. "QTO-2026-000001"
  projectId: string;
  calculationRunId?: string;
  calculatorId?: string;
  formulaId?: string;
  formulaVersion?: string;
  kode: string; // e.g. "QTO.01.BOWPLANK"
  uraian: string; // e.g. "Pekerjaan Bowplank & Pengukuran"
  quantity: number;
  unit: string;
  parameterSnapshot?: Record<string, any>;
  formulaSnapshot?: string;
  status: QTOItemStatus;
  source?: QTOSourceType;
  category?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QTOItemRABMapping {
  id: string;
  projectId: string;
  qtoItemId: string;
  rabItemId: string;
  quantitySource: VolumeSourceType;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleTask {
  id: string;
  projectId: string;
  rabItemId?: string;
  name: string;
  category: string;
  weightPercent: number; // e.g. 14.5%
  startDate: string; // e.g. "2026-09-01" or "Minggu 1"
  endDate: string;   // e.g. "2026-09-28" or "Minggu 4"
  startWeek: number; // 1..12
  endWeek: number;   // 1..12
  durationWeeks: number;
  actualProgressPercent: number; // 0..100
  status: 'PENDING' | 'ON_TRACK' | 'DELAYED' | 'COMPLETED';
}

export interface ProjectPriceOverride {
  id: string;
  projectId: string;
  resourceCode: string;
  resourceName: string;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  unit: string;
  masterPrice: number;
  projectPrice: number;
  isOverridden: boolean;
  lastUpdated: string;
  notes?: string;
}

export interface ProjectVersionSnapshot {
  id: string;
  versionNumber: number;
  projectId: string;
  timestamp: string;
  description: string;
  totalRab: number;
  totalDirectCost: number;
  itemsCount: number;
  qtoCount: number;
}

export interface ManualOverrideAudit {
  userId: string;
  userName?: string;
  timestamp: string;
  reason: string;
  previousCalculationRunId?: string;
  previousVolume: number;
  newVolume: number;
}

export interface WorkItemAuditEntry {
  id: string;
  timestamp: string;
  author: string;
  action: string;
  previousUnitPrice: number;
  newUnitPrice: number;
  previousAmount: number;
  newAmount: number;
  notes?: string;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
}

// Backwards Compatibility Aliases
export interface RabItem {
  id: string;
  no: number;
  code: string;
  category: string;
  sectionName?: string;
  description: string;
  volume: number;
  unit: string;
  materialPrice?: number;
  laborPrice?: number;
  equipmentPrice?: number;
  unitPrice: number;
  amount: number;
  totalPrice?: number;
  itemNumber?: string;
  wbsCode?: string;
  status?: string;
  ahspCode?: string;
  isAiSuggested?: boolean;
  projectId?: string;
  volumeSource?: VolumeSourceType;
  qtoItemId?: string;
  calculationRunId?: string;
  calculatorId?: string;
  verificationStatus?: VerificationStatus;
  manualOverrideAudit?: ManualOverrideAudit;
  ahspSnapshot?: AHSPProjectSnapshot;
  overheadPercent?: number;
  profitPercent?: number;
  otherComponentsPercent?: number;
  auditTrail?: WorkItemAuditEntry[];
  notes?: string;
}

export interface AhspResource {
  id: string;
  code: string;
  name: string;
  type: 'material' | 'labor' | 'equipment';
  unit: string;
  coefficient: number;
  unitPrice: number;
  subtotal: number;
}

export interface AhspItem {
  id: string;
  code: string;
  category: string;
  description: string;
  unit: string;
  unitPrice: number;
  source: string;
  year: number;
  resources: AhspResource[];
}

export interface ProjectStatistics {
  totalProjects: number;
  activeProjects: number;
  totalEstimationValue: number;
  ahspMatchedRate: number;
  averageCalculationTime: string;
}

export type WorkItemStatus =
  | 'DRAFT'
  | 'BELUM_DIHITUNG'
  | 'TERHITUNG'
  | 'AHSP_BELUM_TERHUBUNG'
  | 'AHSP_TERHUBUNG'
  | 'MASUK_QTO'
  | 'MASUK_RAB'
  | 'LENGKAP';

export interface WorkItem {
  id: string;
  projectId: string;
  code: string;
  category: string;
  categoryNumber: number;
  name: string;
  source: 'CALCULATOR' | 'MANUAL' | 'AI' | 'IMPORT';
  calculatorId?: string;
  calculationRunId?: string;
  volume: number;
  unit: string;
  ahspCode?: string;
  ahspDescription?: string;
  ahspId?: string;
  materialPrice: number;
  laborPrice: number;
  equipmentPrice: number;
  unitPrice: number;
  totalAmount: number;
  status: WorkItemStatus;
  qtoItemId?: string;
  rabItemId?: string;
  parameterSnapshot?: Record<string, any>;
  ahspSnapshot?: AHSPProjectSnapshot;
  overheadPercent?: number;
  profitPercent?: number;
  otherComponentsPercent?: number;
  auditTrail?: WorkItemAuditEntry[];
  notes?: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AiChangeActionType =
  | 'ADD'
  | 'UPDATE'
  | 'DELETE'
  | 'REPLACE'
  | 'BULK_UPDATE'
  | 'PRICE_UPDATE'
  | 'AHSP_UPDATE';

export interface AiChangeAffectedRecord {
  id: string;
  code: string;
  description: string;
  category?: string;
  type: 'WORK_ITEM' | 'AHSP' | 'RESOURCE';
  before: {
    volume?: number;
    unit?: string;
    unitPrice?: number;
    amount?: number;
    spec?: string;
    coefficient?: number;
  };
  after: {
    volume?: number;
    unit?: string;
    unitPrice?: number;
    amount?: number;
    spec?: string;
    coefficient?: number;
  };
  deltaAmount?: number;
  deltaPercent?: number;
}

export interface AiChangeProposalData {
  id: string;
  actionType: AiChangeActionType;
  title: string;
  reason: string;
  confidence?: number;
  sourceContext?: string;
  isHighImpact?: boolean;
  affectedWorkItemsCount: number;
  affectedAhspCount: number;
  affectedResourcesCount: number;
  affectedRecords: AiChangeAffectedRecord[];
  currentTotalRab: number;
  proposedTotalRab: number;
  deltaAmount: number;
  deltaPercent: number;
  itemPayload?: Partial<RabItem>;
  bulkAdjustPercent?: number;
  replacementTarget?: { from: string; to: string };
  status: 'PENDING' | 'APPLIED' | 'DISCARDED';
  timestamp: string;
}

export interface EstimateVersion {
  id: string;
  projectId: string;
  versionNumber: string;
  label: string;
  timestamp: string;
  author: string;
  description: string;
  revisionNotes?: string;
  costBefore: number;
  costAfter: number;
  difference: number;
  percentageDiff: number;
  rabItemsSnapshot: RabItem[];
  itemsCount: number;
  isBaseline?: boolean;
}

export interface VersionDiffItem {
  id: string;
  code: string;
  description: string;
  category: string;
  status: 'ADDED' | 'REMOVED' | 'QTY_CHANGED' | 'PRICE_CHANGED' | 'AHSP_CHANGED' | 'UNCHANGED';
  baseVolume?: number;
  targetVolume?: number;
  baseUnitPrice?: number;
  targetUnitPrice?: number;
  baseAmount?: number;
  targetAmount?: number;
  deltaAmount: number;
  deltaPercent: number;
  notes?: string;
}

export interface EstimateScenario {
  id: string;
  projectId: string;
  code: 'BASELINE' | 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C';
  name: string;
  description: string;
  targetObjective: string;
  isBaseline: boolean;
  overheadPercent: number;
  profitPercent: number;
  items: RabItem[];
  totalDirectCost: number;
  totalRab: number;
  differenceFromBaseline: number;
  percentageFromBaseline: number;
  updatedAt: string;
}

export * from './magicAiLaunch';
export * from '../domain/ded/dedPipelineTypes';

