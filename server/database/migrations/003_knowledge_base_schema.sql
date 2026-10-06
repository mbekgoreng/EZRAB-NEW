-- ==============================================================================
-- EZRAB AI CO ASSISTANT - KNOWLEDGE BASE & AUTO ANSWER ENGINE SCHEMA
-- Migration: 003_knowledge_base_schema.sql
-- ==============================================================================

-- 1. Knowledge Base Documents (Optional source containers)
CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_format VARCHAR(32) NOT NULL DEFAULT 'jsonl',
  version VARCHAR(32) NOT NULL DEFAULT '1.0',
  total_entries INTEGER NOT NULL DEFAULT 0,
  checksum VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Knowledge Base Entries (Auto-Answer 9999 Dataset & Official QAs)
CREATE TABLE IF NOT EXISTS ai_knowledge_entries (
  id VARCHAR(128) PRIMARY KEY,
  document_id UUID REFERENCES ai_knowledge_documents(id) ON DELETE SET NULL,
  external_id VARCHAR(128),
  category VARCHAR(64) NOT NULL DEFAULT 'umum',
  intent VARCHAR(64) NOT NULL DEFAULT 'GENERAL_QUESTION',
  question TEXT NOT NULL,
  normalized_question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tone VARCHAR(32) NOT NULL DEFAULT 'serius',
  language VARCHAR(16) NOT NULL DEFAULT 'id',
  source VARCHAR(128) NOT NULL DEFAULT 'dataset_universal_9999',
  answer_core TEXT,
  keywords TEXT[] DEFAULT '{}',
  synonyms TEXT[] DEFAULT '{}',
  confidence_weight NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version VARCHAR(32) NOT NULL DEFAULT '1.0',
  checksum VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Fast Query Retrieval
CREATE INDEX IF NOT EXISTS idx_ai_kb_category ON ai_knowledge_entries(category);
CREATE INDEX IF NOT EXISTS idx_ai_kb_intent ON ai_knowledge_entries(intent);
CREATE INDEX IF NOT EXISTS idx_ai_kb_tone ON ai_knowledge_entries(tone);
CREATE INDEX IF NOT EXISTS idx_ai_kb_normalized_q ON ai_knowledge_entries USING gin(to_tsvector('indonesian', normalized_question));
CREATE INDEX IF NOT EXISTS idx_ai_kb_keywords ON ai_knowledge_entries USING gin(keywords);

-- 3. Answer Logs (Audit trail for questions, answers, intent & latency)
CREATE TABLE IF NOT EXISTS ai_answer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(128) NOT NULL,
  message_id VARCHAR(128),
  user_id VARCHAR(128) NOT NULL,
  workspace_id VARCHAR(128) NOT NULL,
  project_id VARCHAR(128),
  detected_intent VARCHAR(64) NOT NULL,
  selected_source VARCHAR(32) NOT NULL, -- 'live_data', 'knowledge_base', 'dataset', 'tool', 'fallback'
  matched_entry_id VARCHAR(128) REFERENCES ai_knowledge_entries(id) ON DELETE SET NULL,
  confidence_score NUMERIC(4, 3) NOT NULL,
  response_mode VARCHAR(32) NOT NULL, -- 'static', 'generated', 'live_hybrid', 'refusal'
  tool_called BOOLEAN NOT NULL DEFAULT FALSE,
  tool_name VARCHAR(128),
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_answer_logs_workspace ON ai_answer_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_answer_logs_conversation ON ai_answer_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_answer_logs_intent ON ai_answer_logs(detected_intent);

-- 4. User Feedback on AI Answers
CREATE TABLE IF NOT EXISTS ai_answer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_log_id UUID REFERENCES ai_answer_logs(id) ON DELETE SET NULL,
  conversation_id VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  rating VARCHAR(16) NOT NULL, -- 'thumbs_up', 'thumbs_down'
  feedback_category VARCHAR(32), -- 'accuracy', 'clarity', 'tone', 'speed', 'other'
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Dataset Import Reports
CREATE TABLE IF NOT EXISTS ai_dataset_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file VARCHAR(255) NOT NULL,
  file_format VARCHAR(16) NOT NULL,
  total_records INTEGER NOT NULL,
  valid_records INTEGER NOT NULL,
  duplicate_records INTEGER NOT NULL,
  skipped_records INTEGER NOT NULL,
  failed_records INTEGER NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}',
  duration_ms INTEGER NOT NULL,
  imported_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Row Level Security (RLS) Policies
ALTER TABLE ai_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_answer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_answer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_dataset_imports ENABLE ROW LEVEL SECURITY;

-- Knowledge base read-only access for authenticated users
CREATE POLICY p_ai_kb_entries_read ON ai_knowledge_entries
  FOR SELECT USING (is_active = TRUE);

-- Answer logs and feedback isolated by workspace_id
CREATE POLICY p_ai_answer_logs_tenant ON ai_answer_logs
  FOR ALL USING (workspace_id = current_setting('request.jwt.claim.workspace_id', true));
