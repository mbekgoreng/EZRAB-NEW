export interface DbAiConversation {
  id: string;
  workspace_id: string;
  project_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type AiMessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type AiMessageType = 'text' | 'tool_call' | 'tool_result' | 'error';

export interface DbAiMessage {
  id: string;
  conversation_id: string;
  role: AiMessageRole;
  content: string;
  message_type: AiMessageType;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: any[];
  createdAt: string;
}

export type AiToolCallStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'CONFIRMATION_REQUIRED';

export interface DbAiToolCall {
  id: string;
  conversation_id: string;
  message_id?: string;
  tool_name: string;
  arguments: Record<string, any>;
  result?: any;
  status: AiToolCallStatus;
  created_at: string;
}

export interface DbAiUsage {
  id: string;
  workspace_id: string;
  project_id: string;
  user_id: string;
  conversation_id: string;
  provider?: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
  created_at: string;
}

export type DocumentProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DbAiDocument {
  id: string;
  workspace_id: string;
  project_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  processing_status: DocumentProcessingStatus;
  extracted_text?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface DbAiContextCache {
  id: string;
  workspace_id: string;
  project_id: string;
  context_type: string;
  context_hash: string;
  data: any;
  expires_at: string;
  created_at: string;
}

export interface DbAiAuditLog {
  id: string;
  workspace_id: string;
  project_id: string;
  user_id: string;
  tool_name: string;
  action_type?: string;
  entity_type?: string;
  entity_id?: string;
  arguments?: Record<string, any>;
  before_state?: any;
  after_state?: any;
  ip_address?: string;
  timestamp: string;
}

export interface DbKnowledgeEntry {
  id: string;
  document_id?: string;
  external_id?: string;
  category: string;
  intent: string;
  question: string;
  normalized_question: string;
  answer: string;
  tone: string;
  language: string;
  source: string;
  answer_core?: string;
  keywords: string[];
  synonyms?: string[];
  embedding?: number[];
  confidence_weight?: number;
  is_active: boolean;
  version: string;
  checksum?: string;
  created_at: string;
  updated_at?: string;
}

export interface DbAnswerLog {
  id: string;
  conversation_id: string;
  message_id?: string;
  user_id: string;
  workspace_id: string;
  project_id?: string;
  detected_intent: string;
  selected_source: 'live_data' | 'knowledge_base' | 'dataset' | 'tool' | 'fallback';
  matched_entry_id?: string;
  confidence_score: number;
  response_mode: 'static' | 'generated' | 'live_hybrid' | 'refusal';
  tool_called: boolean;
  tool_name?: string;
  fallback_used: boolean;
  response_time_ms: number;
  created_at: string;
}

export interface DbAnswerFeedback {
  id: string;
  answer_log_id?: string;
  conversation_id: string;
  message_id: string;
  user_id: string;
  rating: 'thumbs_up' | 'thumbs_down';
  feedback_category?: 'accuracy' | 'clarity' | 'tone' | 'speed' | 'other';
  comment?: string;
  created_at: string;
}

export interface DbDatasetImportReport {
  id: string;
  source_file: string;
  file_format: string;
  total_records: number;
  valid_records: number;
  duplicate_records: number;
  skipped_records: number;
  failed_records: number;
  checksum_sha256: string;
  summary_json: Record<string, any>;
  duration_ms: number;
  imported_by?: string;
  created_at: string;
}

