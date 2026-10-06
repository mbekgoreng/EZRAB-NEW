/**
 * Phase 6.5: EZRAB DED -> RAB: Deterministic QTO, AHSP, Price & RAB Draft Types
 *
 * Core Principles:
 * 1. EZRAB CORE IS SOURCE OF TRUTH (AI is NOT source of truth for volume, AHSP, price, or totals).
 * 2. DETERMINISTIC QTO (Geometric mathematical engine calculates volume from dimensions).
 * 3. AUTHORITATIVE AHSP & PRICING (Official database lookup; null/PRICE_NOT_FOUND when missing, never fabricated).
 * 4. FULL TRACEABILITY (RAB Item -> Work Item -> Entity -> Evidence -> Page -> Drawing).
 * 5. NO AUTOMATIC DB FINALIZATION (Draft -> Review -> User Confirmation -> Finalization).
 */

import { ProjectTemplateSnapshot } from './templateMappingTypes';

export type QuantityCalculationMethod =
  | 'GEOMETRIC_VOLUME'
  | 'GEOMETRIC_AREA'
  | 'LINEAR_LENGTH'
  | 'UNIT_COUNT'
  | 'TEMPLATE_RULE';

export type QuantityStatus =
  | 'VERIFIED'
  | 'AI_EXTRACTED'
  | 'CALCULATED'
  | 'NEEDS_VERIFICATION'
  | 'CONFLICT';

export interface DeterministicQuantityItem {
  quantityId: string;
  workItemId: string;
  entityId: string;
  wbsCode: string;
  wbsTitle: string;
  name: string;
  unit: string;
  volume: number;
  formula: string;
  inputParameters: Record<string, { value: number | string; unit?: string; name: string }>;
  sourceEvidence: {
    drawingId: string;
    pageNumber: number;
    fileName: string;
    snippet: string;
  }[];
  calculationMethod: QuantityCalculationMethod;
  confidence: number;
  status: QuantityStatus;
}

export type AhspMatchStatus =
  | 'EXACT_MATCH'
  | 'FUZZY_MATCH'
  | 'SUGGESTED_MATCH'
  | 'NOT_FOUND';

export interface AhspCoefficientItem {
  componentName: string;
  type: 'LABOR' | 'MATERIAL' | 'EQUIPMENT';
  coefficient: number;
  unit: string;
  /** NULL when the component could not be priced — never a stand-in 0. */
  unitPrice: number | null;
  /** coefficient × unitPrice, or NULL when unpriced. */
  totalComponentPrice: number | null;
}

export interface AhspMatchResult {
  matchStatus: AhspMatchStatus;
  ahspCode: string | null;
  ahspTitle: string | null;
  standardCategory: string | null;
  baseUnitPrice: number | null;
  coefficients: AhspCoefficientItem[];
  isOfficial: boolean;
  confidence: number;
  notes?: string;
}

export type PriceStatus =
  | 'PRICE_VERIFIED'
  | 'REGIONAL_ADJUSTED'
  | 'AI_ESTIMATED'
  | 'PRICE_NOT_FOUND';

export interface PriceLookupResult {
  priceStatus: PriceStatus;
  /**
   * NULL when no price could be resolved. It is NEVER 0-as-a-substitute-for-null:
   * `Rp 0` in the UI may only ever mean a genuinely zero amount. See
   * `src/data/priceDatabase2026/resolver.ts` (rule 1) and
   * `EZRAB_PRICE_ZERO_ROOT_CAUSE.md`.
   */
  unitPrice: number | null;
  source: 'OFFICIAL_REGIONAL_DB' | 'TEMPLATE_PRICE_DB' | 'AI_ESTIMATE' | 'UNAVAILABLE';
  priceSourceDetail: string;
  confidence: number;
  status: 'VERIFIED' | 'NEEDS_VERIFICATION' | 'PRICE_MISSING';
  /** How complete the underlying AHSP composition was (price DB only). */
  pricingStatus?: 'FULL' | 'PARTIAL' | 'MISSING';
  /** Number of AHSP components that could not be priced. */
  missingComponents?: number;
  /** Provenance of the resolved price, when one was resolved. */
  provenance?: {
    sourceKey: string;
    sourceName: string;
    sourceTier: string;
    sourcePriority: number;
    periodLabel: string;
    locationLevel: string;
    matchMethod: string | null;
    verificationStatus: string | null;
  } | null;
}

export type ItemValidationStatus =
  | 'VALID'
  | 'WARNING'
  | 'NEEDS_REVIEW'
  | 'INVALID';

export interface SourceTraceabilityRecord {
  entityIdentifier: string;
  entityType: string;
  sourceDrawings: string[];
  sourcePages: number[];
  evidenceCount: number;
  primaryPageNumber: number;
  primaryDrawingNumber: string;
}

export interface DeterministicRabDraftItem {
  rabDraftItemId: string;
  projectId: string;
  workItemId: string;
  entityId: string;
  wbsCode: string;
  wbsTitle: string;
  description: string;
  ahspCode: string | null;
  ahspTitle: string | null;
  unit: string;
  volume: number;
  /** NULL when the item could not be priced. Never a stand-in 0. */
  unitPrice: number | null;
  /** volume × unitPrice, or NULL when unpriced. */
  totalPrice: number | null;
  quantityProvenance: DeterministicQuantityItem;
  ahspMatch: AhspMatchResult;
  priceLookup: PriceLookupResult;
  sourceTrace: SourceTraceabilityRecord;
  validationStatus: ItemValidationStatus;
  validationNotes: string[];
}

export interface WbsSubtotalGroup {
  wbsCode: string;
  wbsTitle: string;
  subtotal: number;
  itemsCount: number;
  /** Rows in this group with no resolvable price — the subtotal is incomplete. */
  unpricedItemsCount: number;
  items: DeterministicRabDraftItem[];
}

export interface DeterministicRabDraftSummary {
  rabDraftId: string;
  projectId: string;
  projectName: string;
  templateSnapshot: ProjectTemplateSnapshot;
  totalItems: number;
  mappedItemsCount: number;
  unmappedItemsCount: number;
  missingAhspCount: number;
  missingPriceCount: number;
  conflictsCount: number;
  needsReviewCount: number;
  wbsSubtotals: Record<string, WbsSubtotalGroup>;
  subtotal: number;
  ppnPercent: number;
  ppnAmount: number;
  grandTotal: number;
  items: DeterministicRabDraftItem[];
  validationFindings: string[];
  isFinalized: boolean;
  generatedAt: string;
}
