-- ============================================================================
-- EZRAB Billing Phase 5.3 — Workspace-Scoped Billing & Manual Review
-- ============================================================================
-- STATUS: FILE SPESIFIKASI UNTUK DITINJAU. TIDAK DIEKSEKUSI oleh Phase 5.3.
-- JANGAN APPLY ke database mana pun tanpa persetujuan owner DAN verifikasi
-- status migration sebelumnya lebih dulu.
--
-- PRASYARAT & URUTAN:
-- - Jalankan SETELAH 20260913_auth_membership_foundation.sql (workspaces,
--   workspace_members, profiles) dan 20261102_billing_batch_ledger.sql
--   (credit_batches, credit_batch_ledger, credit_usage_operations,
--   credit_reservation_allocations).
-- - Status penerapan migration-migration itu di database nyata: UNKNOWN
--   (tidak ada koneksi/verifikasi DB pada fase ini). Verifikasi dulu.
-- - Migration ini murni ADITIF: CREATE TABLE/INDEX baru, ADD COLUMN baru,
--   pelebaran CHECK secara eksplisit. TIDAK menghapus/menulis ulang data.
--
-- TUJUAN (keputusan owner Phase 5.1 + Phase 5.3):
-- - Kepemilikan billing = WORKSPACE. Tabel `billing_accounts` memetakan
--   1 workspace ↔ 1 akun billing; kolom `account_id` pada tabel ledger
--   20261102 merujuk ke akun ini (FK ditambahkan di bawah).
-- - FREE_ONCE: 100 kredit, satu kali per akun, expires_at NULL, TIDAK
--   PERNAH kedaluwarsa — ditegakkan di DB via UNIQUE INDEX parsial:
--   maksimal satu batch FREE_ONCE per akun, selamanya.
-- - Review manual REQUIRES_REVIEW: tabel `credit_settlement_reviews`.
-- - Penutupan akun & refund: PENDING_LEGAL_REVIEW — migration ini TIDAK
--   membuat struktur forfeiture/refund/transfer saldo apa pun.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. workspace_members: status keanggotaan + grant billing admin eksplisit.
--    Skema fondasi belum punya keduanya; otorisasi server-side
--    (api/_lib/billingAuthorization.js) fail-closed terhadap nilai
--    SUSPENDED/REVOKED dan hanya menghormati billing_admin = true eksplisit.
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS billing_admin boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_status_check'
  ) THEN
    ALTER TABLE public.workspace_members
      ADD CONSTRAINT workspace_members_status_check
      CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. billing_accounts — pemilik billing otoritatif: WORKSPACE.
--    id tabel ini adalah `account_id` yang dipakai seluruh tabel ledger.
--    Satu workspace = satu akun billing (UNIQUE). Akun TIDAK berpindah
--    antar workspace dan TIDAK dihapus saat anggota keluar / kepemilikan
--    workspace berpindah — riwayat billing melekat pada workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces (id),
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
-- Anggota workspace boleh MEMBACA akun billing workspace-nya; tulis hanya
-- service_role/RPC server-side (tidak ada policy tulis untuk authenticated).
CREATE POLICY billing_accounts_select_member ON public.billing_accounts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
            WHERE m.workspace_id = billing_accounts.workspace_id
              AND m.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. Tabel ledger 20261102: ikat account_id → billing_accounts + kolom
--    workspace_id denormal untuk audit/RLS. Backfill workspace_id adalah
--    langkah MANUAL terpisah setelah billing_accounts terisi (contoh di
--    komentar bawah) — migration ini sengaja tidak menebak pemetaan lama.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_batches_account_fk'
  ) THEN
    ALTER TABLE credit_batches
      ADD CONSTRAINT credit_batches_account_fk
      FOREIGN KEY (account_id) REFERENCES public.billing_accounts (id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_batch_ledger_account_fk'
  ) THEN
    ALTER TABLE credit_batch_ledger
      ADD CONSTRAINT credit_batch_ledger_account_fk
      FOREIGN KEY (account_id) REFERENCES public.billing_accounts (id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_usage_operations_account_fk'
  ) THEN
    ALTER TABLE credit_usage_operations
      ADD CONSTRAINT credit_usage_operations_account_fk
      FOREIGN KEY (account_id) REFERENCES public.billing_accounts (id);
  END IF;
END $$;

ALTER TABLE credit_batches ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces (id);
ALTER TABLE credit_batch_ledger ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces (id);
ALTER TABLE credit_usage_operations ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces (id);

-- Backfill manual (JALANKAN TERPISAH, setelah peninjauan, bila diperlukan):
--   UPDATE credit_batches b SET workspace_id = a.workspace_id
--     FROM public.billing_accounts a WHERE b.account_id = a.id
--      AND b.workspace_id IS NULL;
--   (pola sama untuk credit_batch_ledger & credit_usage_operations)

-- FREE_ONCE satu kali per akun — pagar DB (melengkapi idempotency domain):
CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_one_free_once_per_account
  ON credit_batches (account_id) WHERE type = 'FREE_ONCE';

-- Kind entri baru yang dipakai domain Phase 5.3: 'REVIEW_DECISION'
-- ('REVERSAL' untuk koreksi kebijakan FREE_ONCE sudah ada sejak 20261102).
ALTER TABLE credit_batch_ledger DROP CONSTRAINT IF EXISTS credit_batch_ledger_kind_check;
ALTER TABLE credit_batch_ledger ADD CONSTRAINT credit_batch_ledger_kind_check
  CHECK (kind IN ('GRANT', 'RESERVE', 'RESERVE_RELEASE', 'CONSUME',
                  'EXPIRATION', 'REVERSAL', 'REVIEW_DECISION'));

-- ---------------------------------------------------------------------------
-- 4. credit_settlement_reviews — record review manual untuk operasi
--    REQUIRES_REVIEW (Workstream D). Satu operasi = maksimal satu review
--    (UNIQUE operation_id). Status: PENDING → APPROVED | REJECTED.
--    Bukti usage & perhitungan diawetkan apa adanya; resolusi mencatat
--    reviewer, peran, alasan, dan waktu. Jumlah final TIDAK PERNAH diambil
--    dari input client — actual_credits berasal dari usage terverifikasi
--    yang tercatat pada operasi.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_settlement_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id),
  account_id uuid NOT NULL REFERENCES public.billing_accounts (id),
  operation_id uuid NOT NULL UNIQUE REFERENCES credit_usage_operations (id),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  feature text,
  reserved_credits bigint NOT NULL CHECK (reserved_credits >= 0),
  actual_credits bigint NOT NULL CHECK (actual_credits >= 0),
  overage_credits bigint NOT NULL CHECK (overage_credits >= 0),
  tariff_version text,
  usage_evidence jsonb,
  requested_by text,
  reviewer_user_id uuid REFERENCES public.profiles (id),
  reviewer_role text,
  resolution_reason text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT credit_settlement_reviews_idem UNIQUE (account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_settlement_reviews_account_status
  ON credit_settlement_reviews (account_id, status);

ALTER TABLE credit_settlement_reviews ENABLE ROW LEVEL SECURITY;
-- Anggota workspace boleh membaca review workspace-nya; resolusi HANYA via
-- RPC/service_role server-side setelah pemeriksaan permission
-- billing:review:resolve — tidak ada policy tulis untuk authenticated.
CREATE POLICY credit_settlement_reviews_select_member ON credit_settlement_reviews
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
            WHERE m.workspace_id = credit_settlement_reviews.workspace_id
              AND m.user_id = auth.uid())
  );

-- ============================================================================
-- 5. SPESIFIKASI RPC (belum diimplementasikan — kontrak untuk fase adapter)
-- ============================================================================
-- Operasi billing production WAJIB berjalan sebagai fungsi RPC transaksional
-- (satu transaksi per operasi), dipanggil service_role dari server setelah
-- authorizeWorkspaceAccess() lolos. Kontrak minimum:
--
-- - issue_batch(account_id, type, amount, expires_at, source_ref,
--     idempotency_key, actor) → batch
--   * FREE_ONCE: amount dipaksa 100, expires_at dipaksa NULL di dalam RPC;
--     UNIQUE INDEX parsial §3 menolak grant kedua (termasuk konkuren).
-- - reserve_credits(operation_id, idempotency_key)
--   * SELECT ... FOR UPDATE atas batch akun menurut urutan alokasi final;
--     semua-atau-tidak-sama-sekali; tulis credit_reservation_allocations.
-- - settle_reservation(operation_id, actual_credits, tariff_version,
--     usage_evidence, idempotency_key)
--   * actual > reserved → status REQUIRES_REVIEW + baris review PENDING,
--     TANPA mutasi batch selain yang sudah ter-reserve.
-- - resolve_review(operation_id, decision, reason, reviewer, idempotency_key)
--   * Memeriksa ulang permission reviewer di dalam transaksi; transisi
--     status review bersifat compare-and-set (WHERE status = 'PENDING')
--     sehingga resolusi ganda/konkuren hanya berhasil satu kali.
-- - apply_expirations(account_id, now)
--   * Melewati tipe FREE_ONCE secara eksplisit; idempotent per batch.
--
-- Seluruh RPC: jumlah BIGINT integer; invarian
-- granted = remaining + reserved + consumed + expired ditegakkan CHECK
-- constraint tabel; entri ledger append-only (tidak ada UPDATE/DELETE).
--
-- ============================================================================
-- 6. ATURAN LIFECYCLE WORKSPACE (kontrak perilaku — ditegakkan server-side)
-- ============================================================================
-- - Workspace dibuat → satu billing_accounts dibuat (service role); grant
--   FREE_ONCE 100 diterbitkan SATU kali untuk akun itu.
-- - Anggota diundang/dicabut → saldo & riwayat billing TIDAK berubah;
--   pencabutan keanggotaan hanya memutus AKSES (otorisasi fail-closed),
--   tidak menghapus atau memindahkan kredit.
-- - Kepemilikan workspace berpindah → akun billing tetap milik workspace;
--   FREE_ONCE TIDAK diterbitkan ulang.
-- - Workspace ditutup → perlakuan saldo berbayar tersisa adalah
--   PENDING_LEGAL_REVIEW: tidak ada penghapusan/forfeiture otomatis;
--   riwayat ledger dipertahankan untuk audit.
-- ============================================================================
