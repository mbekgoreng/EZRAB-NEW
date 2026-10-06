/**
 * EZRAB PHASE 6A — WEIR DOMAIN TYPES
 *
 * Strongly typed interfaces for the Weir/Bendung forensic cost pipeline.
 * Every number in the output is independently traceable to a source.
 */

import { AHSPDefinition } from '../ahsp/contracts/types';
import { PriceResolutionOutput } from '../pricing/resolver/advancedPriceResolutionEngine';
import { WorkItemCostOutput } from '../cost/centralDeterministicCostEngine';

// ── INPUTS ──────────────────────────────────────────────────────────────

export interface WeirCostInput {
  /** Panjang mercu bendung (L) in meters */
  weirLength: number;
  /** Tinggi bendung dari pondasi (H) in meters */
  weirHeight: number;
  /** Lebar puncak mercu (Wc) in meters */
  crestWidth: number;
  /** Lebar dasar pondasi bendung (Wb) in meters */
  baseWidth: number;

  /** Include reinforcement steel? 0 = no, 1 = yes */
  includeReinforcement?: number;
  /** Include formwork? 0 = no, 1 = yes */
  includeFormwork?: number;
  /** Include contraction joints? 0 = no, 1 = yes */
  includeJoint?: number;
  /** Include waterstop? 0 = no, 1 = yes */
  includeWaterstop?: number;

  /** Reference rebar ratio in kg/m³ (default 85, REFERENCE_ESTIMATE) */
  rebarRatio?: number;

  /** Project location for price resolution */
  projectLocation: string;

  /** Override rates (0-100). Defaults: OH 5%, Profit 5%, Tax 11%, SMKK 0% */
  overheadPercent?: number;
  profitPercent?: number;
  taxPercent?: number;
  smkkPercent?: number;
}

// ── GEOMETRY ───────────────────────────────────────────────────────────

export interface WeirGeometryResult {
  crossSectionArea: number;
  volume: number;
  unit: string;
  formulaSteps: string[];
  /** True if geometry matches the golden case exactly */
  goldenCaseMatch: boolean;
}

// ── WORK ITEMS ──────────────────────────────────────────────────────────

export interface WeirWorkItem {
  id: string;
  name: string;
  scope: string;
  quantity: number;
  unit: string;
  targetAhspCode: string;
  /** Source of the quantity (DESIGN_DERIVED, REFERENCE_ESTIMATE, etc.) */
  quantitySource: 'DESIGN_DERIVED' | 'REFERENCE_ESTIMATE';
  /** Classification of the work item */
  classification: string;
  /** Price resolution status for this item */
  priceStatus: 'RESOLVED' | 'PRICE_NOT_FOUND' | 'AHSP_NOT_FOUND' | 'WARNING';
}

export interface WeirWorkItemWithCost extends WeirWorkItem {
  ahspCode: string;
  ahspDescription: string;
  ahspUnit: string;
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  directCost: number;
  smkk: number;
  overhead: number;
  profit: number;
  tax: number;
  finalCost: number;
  components: WorkItemCostOutput['components'];
  auditTrail: string[];
}

// ── UNIT VALIDATION ─────────────────────────────────────────────────────

export interface UnitValidationResult {
  valid: boolean;
  checks: {
    componentName: string;
    componentCode: string;
    quantityUnit: string;
    ahspUnit: string;
    coefficientUnit: string;
    resourceUnit: string;
    priceUnit: string;
    status: 'MATCH' | 'CONVERSION_REQUIRED' | 'INVALID';
    note?: string;
  }[];
}

// ── PRICE RESOLUTION ───────────────────────────────────────────────────

export interface PriceResolutionEntry {
  resourceCode: string;
  resourceName: string;
  price: number | null;
  unit: string;
  source: string;
  sourceDocument: string;
  region: string;
  year: number;
  effectiveDate: string;
  confidence: number;
  tier: string;
  status: 'VALID' | 'MISSING';
}

// ── COST SUMMARY ─────────────────────────────────────────────────────────

export interface WeirCostSummary {
  volume: number;
  unit: string;
  directCost: number;
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  smkk: number;
  overhead: number;
  profit: number;
  tax: number;
  finalCost: number;
  /** Number of resolved work items */
  workItemsResolved: number;
  /** Number of items missing price or AHSP */
  workItemsBlocked: number;
}

// ── PARETO ANALYSIS ──────────────────────────────────────────────────────

export interface ParetoEntry {
  resource: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalExpense: number;
  contributionPercent: number;
  cumulativePercent: number;
}

// ── DATA CONFIDENCE ─────────────────────────────────────────────────────

export type DataConfidence = 'A' | 'B' | 'C' | 'D' | 'BLOCKED';

// ── ASSUMPTIONS ──────────────────────────────────────────────────────────

export interface AssumptionEntry {
  field: string;
  value: string;
  type: 'REFERENCE_ESTIMATE' | 'VERIFIED_QUANTITY' | 'DESIGN_PARAMETER';
  note: string;
}

// ── AUDIT ENGINE STEP ────────────────────────────────────────────────────

export interface AuditEngineStep {
  stepIndex: number;
  stageName: string;
  detail: string;
  data: any;
}

// ── FULL RESULT ───────────────────────────────────────────────────────────

export interface WeirCostResult {
  timestamp: string;
  input: WeirCostInput;
  geometry: WeirGeometryResult;
  workItems: WeirWorkItemWithCost[];
  costSummary: WeirCostSummary;
  unitValidation: UnitValidationResult;
  priceResolution: PriceResolutionEntry[];
  paretoAnalysis: ParetoEntry[];
  dataConfidence: DataConfidence;
  assumptions: AssumptionEntry[];
  auditTrail: AuditEngineStep[];
  locationInfo: {
    projectLocation: string;
    resolvedRegion: string;
    priceSource: string;
    priceDate: string;
    priceConfidence: number;
  };
  /** Invariant: double markup detection */
  noDoubleMarkup: {
    overheadAppliedOnce: boolean;
    profitAppliedOnce: boolean;
    taxAppliedOnce: boolean;
    status: 'PASS' | 'FAIL';
  };
  /** SMKK applied? If smkkPercent=0, this is WARNING */
  smkkStatus: 'APPLIED' | 'NOT_CONFIGURED' | 'WARNING';
}

// ── AHSP + PRICE DATABASE TYPES (re-exported for convenience) ────────────

export type { AHSPDefinition, PriceResolutionOutput, WorkItemCostOutput };