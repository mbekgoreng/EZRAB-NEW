-- ============================================================================
-- EZRAB Billing Phase 5 — Batch Credit Ledger & Usage-Based Settlement
-- ============================================================================
-- STATUS: FILE UNTUK DITINJAU. JANGAN APPLY KE PRODUCTION tanpa persetujuan
-- owner. Migration ini dibuat oleh fase implementasi lokal Phase 5 dan
-- TIDAK dieksekusi oleh fase tersebut.
--
-- TUJUAN:
-- Skema untuk ledger kredit berbasis BATCH (keputusan owner terkunci):
-- - Free ONCE (grant satu kali, idempotent per akun).
-- - Bonus BATCH (identitas batch tersendiri, tidak melebur ke top-up).
-- - Rollover langganan PERIOD_END_30 (expires_at = period_end + 30 hari).
-- - Settlement AI berbasis USAGE aktual (estimasi/reservasi/aktual/settle
--   terpisah; estimasi tidak pernah ditagih sebagai aktual).
-- - Penutupan akun & refund: PENDING_LEGAL_REVIEW — migration ini TIDAK
--   membuat struktur forfeiture/refund/transfer saldo apa pun.
--
-- ORDERING & KOMPATIBILITAS:
-- - Jalankan SETELAH 20261018_ai_credits_ledger.sql (dan migration fondasi
--   auth/workspace sebelumnya). Migration ini murni ADITIF: hanya CREATE
--   TABLE/INDEX baru; TIDAK mengubah, TIDAK menghapus tabel 20261018
--   (credit_balances, credit_ledger, credit_reservations, ai_usage_log,
--   credit_tariffs).
-- - Tabel 20261018 dianggap SUPERSEDED SECARA LOGIS oleh model batch ini,
--   tetapi rekonsiliasi/pemindahannya adalah langkah terpisah yang butuh
--   persetujuan owner — bukan bagian migration ini.
-- - Semua jumlah kredit BIGINT integer (tanpa floating point untuk saldo).
-- - RLS: user hanya SELECT miliknya; TIDAK ada policy INSERT/UPDATE/DELETE
--   untuk authenticated — tulis hanya via service_role/RPC server-side
--   (pola fail-closed yang sama dengan migration 20261018).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. credit_batches — satu baris per batch kredit yang bisa diaudit.
--    Invarian akuntansi ditegakkan constraint:
--    granted = remaining + reserved + consumed + expired.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SUBSCRIPTION', 'TOP_UP', 'BONUS', 'FREE_ONCE')),
  wallet TEXT NOT NULL CHECK (wallet IN ('SUBSCRIPTION_CREDITS', 'TOPUP_CREDITS')),
  granted_amount BIGINT NOT NULL CHECK (granted_amount >= 0),
  remaining_amount BIGINT NOT NULL CHECK (remaining_amount >= 0),
  reserved_amount BIGINT NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  consumed_amount BIGINT NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  expired_amount BIGINT NOT NULL DEFAULT 0 CHECK (expired_amount >= 0),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'FROZEN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_batches_balance_identity
    CHECK (granted_amount = remaining_amount + reserved_amount + consumed_amount + expired_amount)
);

CREATE INDEX IF NOT EXISTS idx_credit_batches_account_wallet_expiry
  ON credit_batches (account_id, wallet, expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_batches_account_type_expiry
  ON credit_batches (account_id, type, expires_at);

-- ---------------------------------------------------------------------------
-- 2. credit_batch_ledger — jurnal append-only per batch.
--    Koreksi hanya via baris kompensasi baru (kind 'REVERSAL'), tidak pernah
--    UPDATE/DELETE sejarah. amount bertanda (signed) mengikuti konvensi
--    perubahan remaining_amount batch (lihat api/_lib/creditLedger.js).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_batch_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  batch_id UUID REFERENCES credit_batches (id),
  operation_id UUID,
  kind TEXT NOT NULL
    CHECK (kind IN ('GRANT', 'RESERVE', 'RESERVE_RELEASE', 'CONSUME', 'EXPIRATION', 'REVERSAL')),
  amount BIGINT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_batch_ledger_idem UNIQUE (account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_batch_ledger_account_created
  ON credit_batch_ledger (account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_batch_ledger_batch
  ON credit_batch_ledger (batch_id);

-- ---------------------------------------------------------------------------
-- 3. credit_usage_operations — lifecycle operasi usage AI:
--    CREATED → RESERVED → SETTLED | RELEASED | REQUIRES_REVIEW
--    (FAILED / REVERSED disediakan untuk fase berikutnya).
--    estimated/reserved/actual/settled disimpan terpisah dan tidak pernah
--    ditimpa satu sama lain; usage_evidence mempertahankan bukti provider.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_usage_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  actor_user_id UUID,
  feature TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED', 'RESERVED', 'SETTLED', 'RELEASED', 'FAILED', 'REQUIRES_REVIEW', 'REVERSED')),
  estimated_credits BIGINT NOT NULL CHECK (estimated_credits >= 0),
  reserved_credits BIGINT NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  actual_credits BIGINT CHECK (actual_credits IS NULL OR actual_credits >= 0),
  settled_credits BIGINT CHECK (settled_credits IS NULL OR settled_credits >= 0),
  released_credits BIGINT CHECK (released_credits IS NULL OR released_credits >= 0),
  overage_credits BIGINT CHECK (overage_credits IS NULL OR overage_credits >= 0),
  tariff_version TEXT,
  usage_evidence JSONB,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_usage_operations_idem UNIQUE (account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_operations_account_status
  ON credit_usage_operations (account_id, status);

-- ---------------------------------------------------------------------------
-- 4. credit_reservation_allocations — alokasi deterministik per batch untuk
--    satu reservasi. Inilah record yang membuat restorasi ke batch ASAL
--    (Keputusan D) menjadi mungkin; tanpa tabel ini restorasi hanya tebakan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_reservation_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES credit_usage_operations (id),
  batch_id UUID NOT NULL REFERENCES credit_batches (id),
  account_id UUID NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_reservation_allocations_uq UNIQUE (operation_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_reservation_allocations_batch
  ON credit_reservation_allocations (batch_id);

-- ---------------------------------------------------------------------------
-- 5. provider_tariff_versions — tarif provider berversi.
--    Harga NULL + verification_status 'UNKNOWN' berarti BELUM diketahui —
--    jangan pernah diisi tebakan. Biaya operasi dengan tarif seperti ini
--    berstatus UNDETERMINED dan tidak boleh diklaim terverifikasi.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_tariff_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_per_1m NUMERIC,
  output_per_1m NUMERIC,
  cached_input_per_1m NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  version TEXT NOT NULL,
  source TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED', 'UNKNOWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_tariff_versions_uq UNIQUE (provider_id, model_id, version)
);

-- ---------------------------------------------------------------------------
-- 6. RLS — fail closed: SELECT milik sendiri saja untuk tabel akun;
--    tarif adalah data referensi (SELECT untuk authenticated, tulis tetap
--    service_role). TIDAK ada policy tulis untuk authenticated di tabel mana
--    pun di migration ini.
-- ---------------------------------------------------------------------------
ALTER TABLE credit_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_batch_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservation_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_tariff_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_batches_select_own ON credit_batches
  FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY credit_batch_ledger_select_own ON credit_batch_ledger
  FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY credit_usage_operations_select_own ON credit_usage_operations
  FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY credit_reservation_allocations_select_own ON credit_reservation_allocations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM credit_usage_operations o
            WHERE o.id = operation_id AND o.owner_user_id = auth.uid())
  );
CREATE POLICY provider_tariff_versions_select_ref ON provider_tariff_versions
  FOR SELECT TO authenticated USING (true);
