-- ============================================================================
-- EZRAB AI Credits Phase 2 — Credit Ledger & Usage Meter
-- ============================================================================
-- STATUS: FILE UNTUK DITINJAU. JANGAN APPLY KE PRODUCTION tanpa persetujuan.
--
-- Desain:
-- - credit_ledger: immutable, append-only. Koreksi via transaksi baru
--   (kind='correction'), bukan UPDATE/DELETE.
-- - credit_balances: materialized balance per user (subscription/topup/bonus/
--   reserved terpisah). Diperbarui atomik dalam transaksi yang sama dengan
--   insert ledger.
-- - Idempotensi: idempotency_key UNIQUE per user — retry/duplikat aman.
-- - RLS: user hanya baca miliknya; tulis hanya via service_role (API server).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabel tarif (dikelola aman, terpisah dari kode frontend)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_tariffs (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  min_credits INTEGER,
  max_credits INTEGER,
  target_credits INTEGER,
  is_calibrated_draft BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed tarif draft Phase 1 (rancangan bisnis, BELUM dikalibrasi biaya provider)
INSERT INTO credit_tariffs (key, label, min_credits, max_credits, target_credits, is_calibrated_draft, note) VALUES
  ('plan.starter', 'Starter per periode', NULL, NULL, 10000, TRUE, 'Draft kalibrasi'),
  ('plan.pro', 'Pro per periode', NULL, NULL, 20000, TRUE, 'Draft kalibrasi'),
  ('topup.5000', 'Top-up Rp5.000', NULL, NULL, 3600, TRUE, '3.000 dasar + 600 bonus 20%'),
  ('chat-ai.fast', 'Chat AI Cepat', 5, 20, NULL, TRUE, 'Draft kalibrasi'),
  ('chat-ai.advanced', 'Chat AI Mendalam', 20, 50, NULL, TRUE, 'Draft kalibrasi'),
  ('ai-document.simple', 'AI Document sederhana', 50, 100, NULL, TRUE, 'Draft kalibrasi'),
  ('ai-document.complex', 'AI Document kompleks', 100, 250, NULL, TRUE, 'Draft kalibrasi'),
  ('ded-ai.simple', 'DED sederhana', NULL, NULL, 500, TRUE, 'Draft kalibrasi'),
  ('ded-ai.medium', 'DED menengah', NULL, NULL, 650, TRUE, 'Draft kalibrasi'),
  ('ded-ai.complex', 'DED kompleks', NULL, NULL, 800, TRUE, 'Draft kalibrasi'),
  ('ded-ai.revision', 'DED revisi / analisis ulang', 100, 300, NULL, TRUE, 'Draft kalibrasi')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Saldo materialized per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_balances (
  user_id UUID PRIMARY KEY,
  subscription INTEGER NOT NULL DEFAULT 0 CHECK (subscription >= 0),
  topup INTEGER NOT NULL DEFAULT 0 CHECK (topup >= 0),
  bonus INTEGER NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Ledger immutable (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'subscription_grant', 'subscription_reset',
    'topup', 'bonus',
    'reserve', 'reserve_release', 'consume',
    'refund', 'correction', 'admin_adjust'
  )),
  credits INTEGER NOT NULL, -- positif = masuk, negatif = keluar
  balance_after JSONB NOT NULL, -- snapshot {subscription, topup, bonus, reserved, total}
  idempotency_key TEXT NOT NULL,
  ref_type TEXT, -- 'ai_usage' | 'reservation' | 'topup_order' | 'admin'
  ref_id TEXT,
  reason TEXT,
  created_by TEXT, -- user_id atau 'system' atau 'admin:<id>'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_ref
  ON credit_ledger (ref_type, ref_id);

-- ---------------------------------------------------------------------------
-- 4. Reservasi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  job_id TEXT NOT NULL,
  feature TEXT NOT NULL, -- 'ded-ai' | 'chat-ai' | 'ai-document'
  credits_reserved INTEGER NOT NULL CHECK (credits_reserved > 0),
  credits_used INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  max_credits INTEGER NOT NULL CHECK (max_credits >= credits_reserved),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'released', 'expired', 'refunded'
  )),
  idempotency_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_status
  ON credit_reservations (user_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_expires
  ON credit_reservations (expires_at) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 5. Usage meter (catatan pemakaian AI aktual)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  job_id TEXT,
  idempotency_key TEXT NOT NULL,
  feature TEXT, -- 'chat-ai' | 'ded-ai' | 'ai-document'
  provider TEXT, -- 'gemini' | 'zyrouter' | 'atria'
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  tokens_cached INTEGER,
  tokens_reasoning INTEGER,
  usage_is_estimate BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 1,
  failures JSONB, -- [{provider, model, error, ms}]
  cost_amount NUMERIC,
  cost_currency TEXT,
  cost_source TEXT, -- 'provider' | 'price_list' | 'estimate'
  fx_rate_idr NUMERIC,
  credits_charged INTEGER,
  status TEXT NOT NULL DEFAULT 'actual' CHECK (status IN (
    'actual', 'estimated', 'undetermined', 'failed'
  )),
  error TEXT,
  duration_ms INTEGER,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_created
  ON ai_usage_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_job
  ON ai_usage_log (job_id);

-- ---------------------------------------------------------------------------
-- 6. RLS (fail-closed: tulis hanya via service_role)
-- ---------------------------------------------------------------------------
ALTER TABLE credit_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Tarif: publik baca (dibutuhkan frontend untuk estimasi)
CREATE POLICY credit_tariffs_read ON credit_tariffs
  FOR SELECT USING (true);

-- Saldo: user baca miliknya sendiri
CREATE POLICY credit_balances_read_own ON credit_balances
  FOR SELECT USING (auth.uid() = user_id);

-- Ledger: user baca miliknya sendiri
CREATE POLICY credit_ledger_read_own ON credit_ledger
  FOR SELECT USING (auth.uid() = user_id);

-- Reservasi: user baca miliknya sendiri
CREATE POLICY credit_reservations_read_own ON credit_reservations
  FOR SELECT USING (auth.uid() = user_id);

-- Usage log: user baca miliknya sendiri
CREATE POLICY ai_usage_log_read_own ON ai_usage_log
  FOR SELECT USING (auth.uid() = user_id);

-- TIDAK ADA policy INSERT/UPDATE/DELETE untuk authenticated —
-- tulis hanya via service_role dari API server (bypass RLS).
