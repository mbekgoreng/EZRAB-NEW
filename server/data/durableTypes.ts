export interface DurableProject {
  id: string;
  legacy_id?: string | null;
  workspace_id: string;
  name: string;
  client_name?: string | null;
  location?: string | null;
  status?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DurableRabItem {
  id: string;
  legacy_id?: string | null;
  rab_document_id: string;
  project_id: string;
  workspace_id: string;
  item_number?: string | null;
  code: string;
  description: string;
  specification?: string | null;
  volume: number;
  unit: string;
  material_price: number;
  labor_price: number;
  equipment_price: number;
  unit_price: number;
  amount: number;
  ahsp_code?: string | null;
  ahsp_version?: string | null;
  ahsp_snapshot?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DurableRabDocument { id: string; project_id: string; workspace_id: string; legacy_id?: string | null; name: string; created_by: string; created_at: string; updated_at: string; }
export interface DurableRabVersion { id: string; rab_document_id: string; project_id: string; workspace_id: string; version_number: number; status: string; created_by: string; created_at: string; }

export type DedAnalysisStatus =
  | 'DRAFT'
  | 'ANALYZING'
  | 'REVIEWING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'PERSISTENCE_FAILED';

export interface DurableDedAnalysis {
  id: string;
  workspace_id: string;
  project_id: string;
  ded_document_id: string;
  status: DedAnalysisStatus;
  current_stage?: string;
  progress?: number;
  stage_message?: string;
  pages_total: number;
  pages_processed: number;
  inventory?: any[];
  work_items?: any[];
  evidences?: any[];
  review_summary?: any;
  self_review?: any;
  execution_output?: any;
  error?: string | null;
  version: string;
  created_at: string;
  updated_at: string;
}
