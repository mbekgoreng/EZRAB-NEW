/**
 * DED AI ESTIMATE — Types (src/ai-tools/ded-ai-estimate/types.ts)
 *
 * STANDALONE estimation product. These types are self-contained — they do NOT
 * import AHSP matcher, price resolver, HSD database, masterRegistry, official
 * price database, or project price engine. They define the estimate from scratch.
 *
 * Core contracts (from master prompt):
 * - quantity: null is allowed, never 0.
 * - unitPrice: null is allowed, never 0.
 * - subtotal = quantity × unitPrice, deterministic, code-calculated.
 * - No grand-total from the AI — totals are computed by `calculator.ts`.
 */

export type DedAiProjectType =
  | 'BANGUNAN'
  | 'GEDUNG'
  | 'BANGUNAN AIR'
  | 'JALAN'
  | 'PAVING'
  | (string & {});

export type DedAiMode = 'FAST' | 'DETAIL';

export type DedAiQuantitySource =
  | 'DED_EXPLICIT'
  | 'DED_GEOMETRIC'
  | 'AI_INFERENCE'
  | 'ASSUMPTION'
  | 'UNRESOLVED';

export type DedAiPriceSource = 'AI_ESTIMATE' | 'UNRESOLVED';

export interface DedAiItem {
  id: string;
  name: string;
  category: string;
  specification?: string;
  description?: string;
  units: string;
  quantity: number | null;
  quantitySource: DedAiQuantitySource;
  quantityFormula?: string;
  rawAIQuantity?: number | null;
  unitPrice: number | null;
  priceSource: DedAiPriceSource;
  priceAssumptionNote?: string;
  subtotal: number | null;
  sourcePages: number[];
  sourceEvidence?: string;
  provenance: string[];
  stage: 'PARSE' | 'QUANTITY' | 'PRICING' | 'CALCULATED' | 'REJECTED';
}

export interface DedAiCategorySummary {
  category: string;
  subtotal: number;
  itemCount: number;
  resolvedCount: number;
  unresolvedCount: number;
}

export interface DedAiOutput {
  success: boolean;
  jobId: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  projectName: string;
  fileName?: string;
  pageCount: number;
  items: DedAiItem[];
  grandTotal: number;
  categorySummaries: DedAiCategorySummary[];
  coverage: {
    totalItems: number;
    itemsWithQuantity: number;
    itemsWithPrice: number;
    itemsFullyResolved: number;
    itemsUnresolved: number;
  };
}

export type DedAiProgressEvent = {
  stage: string;
  label: string;
  percent: number;
  message: string;
  pagesRead: number;
  totalPages: number;
};

export interface DedAiServiceOptions {
  fileName: string;
  buffer: ArrayBuffer | Uint8Array | Buffer | string;
  mimeType?: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  projectName?: string;
  onProgress?: (event: DedAiProgressEvent) => void;
}
