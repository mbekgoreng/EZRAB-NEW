/**
 * EZRAB AI ESTIMATOR AGENT — CANONICAL TYPES & CONTRACTS
 * Architecture: DED -> RAB 2.0 (Master Prompt Spec)
 */

export type FieldProvenanceSource =
  | 'EZRAB_DATABASE'
  | 'OFFICIAL_AHSP'
  | 'OFFICIAL_STANDARD'
  | 'PROJECT_PRICE'
  | 'REGIONAL_PRICE'
  | 'EXTERNAL_MARKET'
  | 'AI_ASSISTED'
  | 'AI_INFERRED'
  | 'AI_ESTIMATED'
  | 'USER_INPUT';

export type EstimatorMode = 'AI_ESTIMATOR' | 'EZRAB_STANDARD';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type WorkItemDiscipline =
  | 'ARCHITECTURAL'
  | 'STRUCTURAL'
  | 'MEP'
  | 'SITEWORK'
  | 'FINISH'
  | 'OTHER';

export interface StandardReference {
  standardName: string;
  standardCode: string;
  year?: number;
  source: string;
  applicability: string;
  isVerified: boolean;
}

export interface ResourceItem {
  name: string;
  specification?: string;
  unit: string;
  coefficient?: number;
  unitPrice?: number;
  totalPrice?: number;
  source?: FieldProvenanceSource;
}

export interface AiRabItem {
  id: string;
  itemNumber?: number;
  workItem: string;
  category: string;
  discipline: WorkItemDiscipline;
  description: string;
  specification: string;

  // Quantity Takeoff (Deterministic Calculation Result)
  quantity: number | null;
  unit: string;
  quantityFormula: string;
  quantitySource: FieldProvenanceSource;
  quantityEvidence: Array<{ pageNumber: number; text: string }>;

  // AHSP Resolution
  ahspCode: string | null;
  ahspName: string | null;
  ahspSource: FieldProvenanceSource;
  ahspConfidence: 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';

  // Resource Breakdowns
  materials: ResourceItem[];
  labor: ResourceItem[];
  equipment: ResourceItem[];
  materialSource: FieldProvenanceSource;
  laborSource: FieldProvenanceSource;
  equipmentSource: FieldProvenanceSource;

  // Pricing & Arithmetic (SafeDecimalEngine)
  unitPrice: number | null;
  priceSource: FieldProvenanceSource;
  priceConfidence: ConfidenceLevel | 'UNRESOLVED';
  subtotal: number | null;

  // Engineering & Legal References
  standardReferences: StandardReference[];
  assumptions: string[];
  evidence: Array<{ pageNumber: number; description: string }>;

  // Audit & Quality Gates
  confidence: ConfidenceLevel;
  provenance: FieldProvenanceSource;
  status: 'READY' | 'AI_ESTIMATED' | 'NEEDS_REVIEW' | 'UNRESOLVED';
  userApproved?: boolean;
}

export interface DedCoverageDiscipline {
  category: string;
  covered: boolean;
  itemCount: number;
  evidencePages: number[];
  notes?: string;
}

export interface DedCoverageReport {
  overallCoveragePercent: number;
  architectural: {
    floor: DedCoverageDiscipline;
    wall: DedCoverageDiscipline;
    door: DedCoverageDiscipline;
    window: DedCoverageDiscipline;
    ceiling: DedCoverageDiscipline;
    finish: DedCoverageDiscipline;
  };
  structural: {
    foundation: DedCoverageDiscipline;
    column: DedCoverageDiscipline;
    beam: DedCoverageDiscipline;
    slab: DedCoverageDiscipline;
    roof: DedCoverageDiscipline;
  };
  mep: {
    plumbing: DedCoverageDiscipline;
    electrical: DedCoverageDiscipline;
  };
  missingDisciplines: string[];
  recommendations: string[];
}

export interface SelfCheckQuestion {
  question: string;
  passed: boolean;
  scorePercent: number;
  findings: string[];
}

export interface SelfCheckReport {
  overallPassed: boolean;
  averageScorePercent: number;
  questions: SelfCheckQuestion[];
  repairsAttempted: number;
  repairsSucceeded: number;
  remainingAnomalies: string[];
}

export interface AiEstimatorRunContext {
  aiRunId: string;
  projectId: string;
  projectName: string;
  mode: EstimatorMode;
  location: {
    province: string;
    city: string;
    district?: string;
    year: number;
  };
  model: string;
  sourceHash: string;
  startTime: number;
  endTime?: number;
  toolCallsCount: number;
}

export interface AiEstimatorResult {
  success: boolean;
  aiRunId: string;
  projectId: string;
  projectName: string;
  mode: EstimatorMode;
  items: AiRabItem[];
  readyCount: number;
  estimatedCount: number;
  needsReviewCount: number;
  grandTotal: number;
  subtotal: number;
  coverage: DedCoverageReport;
  selfCheck: SelfCheckReport;
  provenanceSummary: {
    ezrabDatabase: number;
    officialAhsp: number;
    projectPrice: number;
    regionalPrice: number;
    aiAssisted: number;
    aiEstimated: number;
    userInput: number;
  };
  confidenceSummary: {
    high: number;
    medium: number;
    low: number;
  };
  executionDurationSec: number;
  error?: string;
}
