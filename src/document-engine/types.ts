export type DocumentCategory = 'ADMINISTRATION' | 'TECHNICAL' | 'COMMERCIAL' | 'COST' | 'SCHEDULE' | 'HSE' | 'PBG' | 'CUSTOM' | 'REPORT';
export type DocumentFormat = 'PDF' | 'DOCX' | 'XLSX';
export type DocumentStatus = 'NOT_STARTED' | 'DRAFT' | 'INCOMPLETE' | 'COMPLETE' | 'EXPORTED';
export type RequirementLevel = 'CORE' | 'RECOMMENDED' | 'CONDITIONAL' | 'CUSTOM';
export type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'table';
export type FieldRequirementType = 'AUTO' | 'REQUIRED_USER' | 'OPTIONAL' | 'CONDITIONAL';
export type SourceProvenance = 'PROJECT' | 'AI_DRAFT' | 'USER_INPUT';
export type DocumentRevisionCode = 'R0' | 'R1' | 'R2';
export type DocumentRevisionStatus = 'R0_DRAFT' | 'R1_REVIEW' | 'R2_FINAL';

export interface ConsistencyIssue {
  ruleId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  sourceA: string;
  valueA?: any;
  sourceB: string;
  valueB?: any;
  suggestedAction?: string;
}

export interface ConsistencyCheckResult {
  valid: boolean;
  score: number;
  issues: ConsistencyIssue[];
  verifiedAt: string;
}

export interface DocumentField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  variable?: string;
  sourceType?: 'AUTO' | 'USER' | 'OPTIONAL' | FieldRequirementType;
  requirementType?: FieldRequirementType;
  sourceProvenance?: SourceProvenance;
  defaultValue?: any;
  placeholder?: string;
  condition?: string;
}

export interface DocumentDefinition {
  id: string;
  code: string;
  name: string;
  category: DocumentCategory;
  description: string;
  requirement: RequirementLevel;
  supportedFormats: DocumentFormat[];
  existingModule?: string;
  dependencies?: string[];
  requiredSources?: string[];
  generationMode?: 'DETERMINISTIC' | 'AI_ASSISTED' | 'MANUAL';
  aiEnabled?: boolean;
  templateId?: string;
  fields: DocumentField[];
  templateBody?: string;
  autoVariables?: string[];
  userFields?: DocumentField[];
  optionalFields?: DocumentField[];
  templateLibrary?: TemplateDefinition[];
  recommendedTemplates?: string[];
}

export interface TemplateDefinition {
  id: string;
  documentType: string;
  name: string;
  description: string;
  category: string;
  // EZRAB built-in, USER, SHARED
  source: 'EZRAB' | 'USER' | 'SHARED';
  // DOCX, BUILTIN, CUSTOM source
  templateSource?: 'DOCX' | 'PDF' | 'XLSX' | 'BUILTIN' | 'CUSTOM';
  // Detected variables
  variables?: { name: string; path: string; label: string }[];
  variableMapping?: Record<string, string>;
  // Fields required/optional for this specific template
  fields?: Array<{
    id: string;
    label: string;
    type: FieldRequirementType;
    variable?: string;
    placeholder?: string;
    defaultValue?: any;
    condition?: string;
  }>;
  // Body/content
  body?: string;
  // Usage tracking
  usageCount?: number;
  lastUsedAt?: string;
  isDefault?: boolean;
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  ownerId?: string;
}

export interface ProjectMasterData {
  id?: string;
  projectName: string;
  projectNumber: string;
  owner: string;
  contractor: string;
  location: string;
  contractValue: number | string;
  duration: string;
  startDate: string;
  endDate: string;
  tenderNumber: string;
  projectType: string;
  tenderType: string;
  director: string;
  projectManager: string;
  engineer: string;
  architect: string;
  hseOfficer: string;
  qs: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyLogo?: string;
  companySignature?: string;
}

export interface DocumentRecord {
  id: string;
  definitionId: string;
  documentId?: string;
  projectId?: string;
  status: DocumentStatus;
  data: Record<string, unknown>;
  sourceData: Record<string, boolean>;
  values: Record<string, unknown>;
  userFieldValues?: Record<string, unknown>;
  sourceHash?: string;
  sourceTimestamp?: string;
  revision: number;
  revisionDescription?: string;
  isReadOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentData {
  project: ProjectMasterData;
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    logo?: string;
    signature?: string;
    signatory?: string;
    signatoryPosition?: string;
  };
  boq: Array<Record<string, unknown>>;
  rab: Array<Record<string, unknown>>;
  ahsp: Array<Record<string, unknown>>;
  schedule: Array<Record<string, unknown>>;
  curveS: Array<Record<string, unknown>>;
  rkk: Array<Record<string, unknown>>;
  jsa: Array<Record<string, unknown>>;
  personnel: Array<Record<string, unknown>>;
  equipment: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  revision?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RenderedDocument {
  metadata: {
    code: string;
    name: string;
    category: DocumentCategory;
    revision: string;
    revisionNumber: number;
    project: string;
    date: string;
    owner?: string;
    contractor?: string;
    location?: string;
    contractValue?: string | number;
  };
  sections: string[];
  tables: Array<Record<string, unknown>>;
  tableColumns?: Array<{ key: string; label: string; width?: number }>;
  signatures: Array<{
    name?: string;
    position?: string;
    signatureImage?: string;
    isPlaceholder?: boolean;
  }>;
  warnings?: string[];
}

export interface ExportHistoryRecord {
  id: string;
  documentId: string;
  projectId?: string;
  format: DocumentFormat | string;
  fileName: string;
  revision: number;
  createdAt: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

export interface DocumentRequirementDependency {
  name: string;
  status: 'COMPLETE' | 'INCOMPLETE' | 'MISSING';
  missingFields?: string[];
}

export interface DocumentRequirementResult {
  definitionId: string;
  level: RequirementLevel;
  required: boolean;
  reason?: string;
  conditionsMet: boolean;
  dependencies: DocumentRequirementDependency[];
}

export interface DocumentCompletenessInfo {
  definitionId: string;
  status: DocumentStatus;
  isCore: boolean;
  isRequired: boolean;
  completenessPercentage: number;
  missingDependencies: DocumentRequirementDependency[];
  reason?: string;
}

export interface ProjectRequirementContext {
  purpose?: 'tender' | 'pbg' | 'administrasi' | 'custom';
  projectType?: string;
  tenderType?: string;
  contractValue?: number;
  duration?: string;
  usesKSO?: boolean;
  usesSubcontractor?: boolean;
  signatoryType?: 'DIRECTOR' | 'AUTHORIZED';
}

export const EMPTY_MASTER_DATA: ProjectMasterData = {
  projectName: '',
  projectNumber: '',
  owner: '',
  contractor: '',
  location: '',
  contractValue: '',
  duration: '',
  startDate: '',
  endDate: '',
  tenderNumber: '',
  projectType: '',
  tenderType: '',
  director: '',
  projectManager: '',
  engineer: '',
  architect: '',
  hseOfficer: '',
  qs: '',
  companyName: '',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyLogo: '',
  companySignature: '',
};
