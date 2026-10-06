/**
 * Intent Taxonomy for EZRAB Construction AI Agent (Phase 4)
 */

export type IntentCategory =
  | 'GENERAL_CHAT'
  | 'EZRAB_ABOUT'
  | 'PROJECT_INFO'
  | 'PROJECT_LIST'
  | 'PROJECT_CREATE'
  | 'PROJECT_SWITCH'
  | 'RAB_TOTAL'
  | 'RAB_ITEM_SEARCH'
  | 'RAB_ITEM_CREATE'
  | 'RAB_ITEM_UPDATE'
  | 'RAB_ITEM_DELETE'
  | 'RAB_VALIDATE'
  | 'RAB_RECALCULATE'
  | 'QTO_CALCULATE'
  | 'QTO_QUERY'
  | 'AHSP_SEARCH'
  | 'AHSP_DETAIL'
  | 'PRICE_SEARCH'
  | 'MATERIAL_SEARCH'
  | 'LABOR_PRICE_SEARCH'
  | 'EQUIPMENT_PRICE_SEARCH'
  | 'WBS_QUERY'
  | 'WBS_CREATE'
  | 'DOCUMENT_ANALYSIS'
  | 'DED_ANALYSIS'
  | 'DRAWING_ANALYSIS'
  | 'VOLUME_CALCULATION'
  | 'SCHEDULE_QUERY'
  | 'S_CURVE_QUERY'
  | 'EXPORT_EXCEL'
  | 'EXPORT_PDF'
  | 'PROJECT_REPORT'
  | 'CONSTRUCTION_KNOWLEDGE'
  | 'TEMPLATE_QUERY'
  | 'TEMPLATE_GENERATE'
  | 'SUBSCRIPTION_QUERY'
  | 'ACCOUNT_QUERY'
  | 'CLARIFICATION_NEEDED'
  | 'UNKNOWN';

export interface ExtractedEntities {
  projectId?: string;
  projectName?: string;
  workItem?: string;
  ahspCode?: string;
  volume?: number;
  unit?: string;
  price?: number;
  material?: string;
  location?: string;
  floor?: number | string;
  buildingType?: string;
  buildingArea?: number;
  wbsCode?: string;
  category?: string;
  targetItemId?: string;
  actionType?: string;
  date?: string;
  file?: string;
  documentType?: string;
  confidenceMap?: Record<string, number>;
}

export interface ClassifiedIntentResult {
  intent: IntentCategory;
  confidence: number;
  entities: ExtractedEntities;
  requiresProject: boolean;
  requiresTool: boolean;
  requiresVision: boolean;
  requiresExternalKnowledge: boolean;
  isMutatingAction: boolean;
  suggestedTool?: string;
  clarificationPrompt?: string;
  clarificationOptions?: string[];
}
