-- ============================================================================
-- EZRAB Billing — Unified AI Credits Foundation (Pricing Policy + RPC Ledger)
-- ============================================================================
-- STATUS: DRAFT — TIDAK/BELUM DIEKSEKUSI.
-- File ini adalah ARSIP SPESIFIKASI. Ia TIDAK dijalankan oleh fase yang
-- membuatnya, TIDAK boleh di-apply ke database mana pun (termasuk lokal/
-- staging/production) tanpa persetujuan owner yang eksplisit DAN verifikasi
-- status migration prasyarat di database tujuan lebih dulu. Sintaks file
-- ini BELUM terverifikasi di DB live — verifikasi sintaks di database live
-- (atau salinannya) tetap WAJIB sebelum eksekusi apa pun dipertimbangkan.
--
-- PRASYARAT & URUTAN (berurutan, tidak boleh dilompati):
--   1. 20261008_phase3_canonical_schema_rls.sql
--      (fondasi canonical + tabel gen-1 termasuk credit_tariffs)
--   2. 20261102_billing_batch_ledger.sql
--      (credit_batches, credit_batch_ledger, credit_usage_operations,
--       credit_reservation_allocations, provider_tariff_versions)
--   3. 20261102_phase53_workspace_billing.sql
--      (billing_accounts, kolom workspace_id pada tabel ledger,
--       credit_settlement_reviews, spesifikasi RPC §5 yang diimplementasikan
--       file ini, UNIQUE parsial FREE_ONCE, kind REVIEW_DECISION)
--   4. 20261109_billing_orders_subscriptions.sql
--      (billing_orders, billing_subscriptions)
-- Status penerapan prasyarat di database nyata: UNKNOWN (tidak ada
-- verifikasi DB pada fase penulisan file ini).
--
-- SIFAT: ADITIF SAJA — CREATE TABLE/VIEW/FUNCTION baru dan INSERT baris
-- referensi kebijakan dengan ON CONFLICT DO NOTHING. File ini TIDAK
-- mengubah, TIDAK menghapus, dan TIDAK menulis ulang tabel/data yang sudah
-- ada. Nama kolom/tabel mengikuti PERSIS migration gen-2 (20261102) dan
-- Phase 5.3.
--
-- ISI:
--   §1 credit_pricing_policy_versions — registri kebijakan harga berversi
--      (kembaran persisten api/_lib/pricingPolicy.js). Parameter komersial
--      yang belum diputuskan owner disimpan NULL secara eksplisit.
--   §2 credit_batch_reconciliation — view rekonsiliasi batch vs jurnal
--      (kembaran baca api/_lib/creditReconciliation.js).
--   §3 RPC transaksional SECURITY DEFINER sesuai spesifikasi Phase 5.3 §5:
--      issue_batch, reserve_credits, settle_reservation, resolve_review,
--      apply_expirations. Semantiknya meniru domain api/_lib/creditLedger.js
--      + urutan alokasi Phase 5.1 (api/_lib/creditAllocation.js).
--
-- ROLLBACK: lihat bagian komentar di AKHIR file (sengaja berupa komentar —
-- rollback TIDAK dieksekusi sebagai bagian migration ini).
--
-- SPRINT 3 AMENDEMEN (2026-11-10, EDIT LOKAL — tetap DRAFT, tetap TIDAK
-- DIEKSEKUSI, tetap NOT RUNTIME VERIFIED karena PostgreSQL lokal tidak
-- tersedia di mesin ini): F-6 (assertion pendanaan reserve_credits +
-- kunci baris akun/batch + ROW_COUNT), F-10 (assertion overage
-- resolve_review + kunci + ROW_COUNT + assertion alokasi), F-7
-- (estimated <= 0 ditolak), F-5 (issue_batch: advisory lock + tangkap
-- unique_violation → putar ulang hasil asli), F-4 (cocok silang
-- review↔operasi), F-1 (guard CREATE POLICY), F-2 (REVOKE + upaya
-- security_invoker pada view rekonsiliasi). F-13 SENGAJA TIDAK diubah:
-- append-only jurnal masih konvensi penulis, bukan penegakan DB —
-- audit Phase 2 menilainya informational/bukan blocker dan berlaku
-- untuk seluruh keluarga skema; mekanisme tamper-evidence (trigger /
-- hash-chain) adalah keputusan desain tersendiri untuk owner, bukan
-- koreksi yang didukung bukti cacat di file ini. Risiko sisa F-13,
-- F-3, F-8, F-9, F-11, F-12 tetap sebagaimana dicatat audit Phase 2.
--
-- SPRINT 5 AMENDEMEN (2026-11-10, EDIT LOKAL — tetap DRAFT, tetap TIDAK
-- DIEKSEKUSI, tetap NOT RUNTIME VERIFIED karena PostgreSQL lokal tidak
-- tersedia di mesin ini):
--   Fase 2 — issue_batch: paritas idempotensi konflik meniru idemGet/
--     `matches` pada grantCommon (creditLedger.js, Sprint 3). Probe
--     replay kini MEMBANDINGKAN payload (baris credit_batches terhubung
--     vs parameter ter-normalisasi: type, granted_amount vs nilai
--     mentah p_amount — FREE_ONCE hanya type, lihat komentar fungsi —
--     expires_at efektif, source_ref, period_start, period_end,
--     owner_user_id, workspace_id). Cocok → replay; beda →
--     'IDEMPOTENCY_CONFLICT' tanpa mutasi, mengikuti pola string-kode
--     resolve_review (RETURN, tanpa RAISE). Perbandingan yang sama juga
--     dijalankan pada batch pemenang di cabang unique_violation.
--     BREAKING CHANGE: RETURNS issue_batch berubah uuid → text
--     ('OK:<batch_id>' | 'IDEMPOTENCY_CONFLICT'); pemanggil yang
--     mengharapkan uuid mentah WAJIB menyesuaikan. Tipe argumen tidak
--     berubah, sehingga baris REVOKE/GRANT dan DROP FUNCTION di rollback
--     (yang memakai signature argumen saja) tidak berubah.
--   Fase 3 — settle_reservation: assertion ROW_COUNT (GET DIAGNOSTICS)
--     sesudah SETIAP penulisan (cabang overage, loop alokasi, UPDATE
--     operasi final) dengan pesan khas '<titik>_failed'; batch alokasi
--     yang hilang kini RAISE 'settle_allocation_batch_missing' (meniru
--     resolve_review); assertion pasca-loop baru: total konsumsi loop
--     harus PERSIS p_actual_credits, bila tidak RAISE
--     'settle_consumption_mismatch'. PERUBAHAN PERILAKU YANG DISENGAJA:
--     keadaan "alokasi tercatat kurang dari reserved saat actual <=
--     reserved" (korupsi data) yang sebelumnya settle diam-diam kini
--     gagal tertutup dan seluruh transaksi fungsi ter-rollback.
--   Fase 4 — revoke privilese eksplisit: kelima RPC (issue_batch,
--     reserve_credits, settle_reservation, resolve_review,
--     apply_expirations) kini juga REVOKE ALL FROM anon dan FROM
--     authenticated sesudah REVOKE FROM PUBLIC; GRANT tetap hanya
--     service_role. View credit_batch_reconciliation sudah memiliki
--     ketiga REVOKE sejak Sprint 3 (F-2) — tidak diubah di fase ini.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. credit_pricing_policy_versions — kebijakan harga berversi.
--    Status SQL: LOCKED | PENDING | SUPERSEDED | DISABLED (padanan status
--    domain: LOCKED_OWNER → LOCKED, PENDING_OWNER_DECISION → PENDING).
--    config adalah JSON persis struktur kebijakan di pricingPolicy.js.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_pricing_policy_versions (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('LOCKED', 'PENDING', 'SUPERSEDED', 'DISABLED')),
  basis TEXT NOT NULL,
  config JSONB NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_pricing_policy_versions ENABLE ROW LEVEL SECURITY;

-- Kebijakan adalah data referensi: SELECT untuk authenticated (meniru pola
-- credit_tariffs pada 20261018); tulis hanya via service_role/migration.
-- SPRINT 3 FIX (F-1, audit SQL Phase 2): pembuatan policy kini dijaga
-- keberadaannya (pg_policies) lewat blok DO + EXECUTE, sehingga file ini
-- aman dijalankan ulang — sebelumnya CREATE POLICY tanpa guard akan
-- menggagalkan run kedua di titik ini dan membatalkan sisa file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_pricing_policy_versions'
      AND policyname = 'credit_pricing_policy_versions_select_ref'
  ) THEN
    EXECUTE 'CREATE POLICY credit_pricing_policy_versions_select_ref
      ON public.credit_pricing_policy_versions
      FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

INSERT INTO public.credit_pricing_policy_versions (version, status, basis, config, note)
VALUES
  (
    'v1.1-token-metering',
    'LOCKED',
    'TOKEN_METERING',
    '{"weightedTokensPerCredit": 200, "inputWeight": 1, "cachedInputWeight": 1, "outputWeight": {"mode": "PROVIDER_PRICE_RATIO", "interimValue": 3, "interim": true}, "minCreditsPerAiOperation": 1}'::jsonb,
    'Amendemen Spec Billing v1.1 (keputusan owner 2026-11-06). Bobot output interim 3: rasio harga provider nyata belum terverifikasi (tarif seed provider_tariff_versions semua NULL/UNKNOWN).'
  ),
  (
    'margin-formula-proposal',
    'PENDING',
    'MARGIN_FORMULA',
    '{"creditValueIdr": null, "costMultiplierMilli": null, "targetGrossMarginBps": null, "fxIdrPerUsd": null}'::jsonb,
    'Usulan formula margin — SELURUH parameter komersial menunggu keputusan owner; NULL di sini berarti BELUM DIPUTUSKAN, bukan nol.'
  )
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. credit_batch_reconciliation — per batch: kolom batch vs agregat jurnal.
--    Konvensi tanda amount credit_batch_ledger mengikuti creditLedger.js:
--      GRANT +n · RESERVE -n · RESERVE_RELEASE +n · EXPIRATION -n · CONSUME -n
--    ledger_reserved_amount diturunkan seperti di creditReconciliation.js:
--    reservasi bersih setelah offset pelepasan, konsumsi-dari-reservasi
--    (reason settle_actual_usage / review_approved_settle), dan write-off
--    kedaluwarsa porsi ter-reserve (reason release_after_batch_expiry /
--    settle_remainder_after_batch_expiry). CONSUME overage review
--    (review_approved_overage) dan EXPIRATION sapuan (batch_expiry_sweep)
--    TIDAK mengoffset reserved.
-- ---------------------------------------------------------------------------
-- SPRINT 3 FIX (F-2, audit SQL Phase 2): view ini mengagregasi SEMUA akun.
-- Ia TIDAK boleh pernah di-GRANT ke authenticated/anon: tanpa
-- security_invoker, view berjalan dengan hak pemiliknya dan akan
-- melewati RLS owner pada credit_batches. Karena itu di bawah view ini
-- dibuat, hak PUBLIC/anon/authenticated dicabut secara eksplisit, dan
-- security_invoker dicoba diaktifkan (PostgreSQL 15+; di platform yang
-- belum mendukungnya blok DO hanya memberi NOTICE dan pencabutan hak
-- tetap menjadi pagarnya — akses sah hanya pemilik/service_role).
CREATE OR REPLACE VIEW public.credit_batch_reconciliation AS
SELECT
  b.id AS batch_id,
  b.account_id,
  b.owner_user_id,
  b.workspace_id,
  b.type,
  b.status,
  b.granted_amount,
  b.remaining_amount,
  b.reserved_amount,
  b.consumed_amount,
  b.expired_amount,
  COALESCE(a.ledger_grant_amount, 0) AS ledger_grant_amount,
  COALESCE(a.ledger_consumed_amount, 0) AS ledger_consumed_amount,
  COALESCE(a.ledger_expired_amount, 0) AS ledger_expired_amount,
  COALESCE(a.ledger_reserved_amount, 0) AS ledger_reserved_amount,
  (b.granted_amount = b.remaining_amount + b.reserved_amount + b.consumed_amount + b.expired_amount)
    AS invariant_ok,
  (
    b.granted_amount = b.remaining_amount + b.reserved_amount + b.consumed_amount + b.expired_amount
    AND COALESCE(a.ledger_grant_amount, 0) = b.granted_amount
    AND COALESCE(a.ledger_consumed_amount, 0) = b.consumed_amount
    AND COALESCE(a.ledger_expired_amount, 0) = b.expired_amount
    AND COALESCE(a.ledger_reserved_amount, 0) = b.reserved_amount
  ) AS is_consistent
FROM public.credit_batches b
LEFT JOIN (
  SELECT
    l.batch_id,
    SUM(l.amount) FILTER (WHERE l.kind = 'GRANT') AS ledger_grant_amount,
    -SUM(l.amount) FILTER (WHERE l.kind = 'CONSUME') AS ledger_consumed_amount,
    -SUM(l.amount) FILTER (WHERE l.kind = 'EXPIRATION') AS ledger_expired_amount,
    (
      -COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'RESERVE'), 0)
      - COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'RESERVE_RELEASE'), 0)
      + COALESCE(SUM(l.amount) FILTER (
          WHERE l.kind = 'CONSUME' AND l.reason IS DISTINCT FROM 'review_approved_overage'
        ), 0)
      + COALESCE(SUM(l.amount) FILTER (
          WHERE l.kind = 'EXPIRATION'
            AND l.reason IN ('release_after_batch_expiry', 'settle_remainder_after_batch_expiry')
        ), 0)
    ) AS ledger_reserved_amount
  FROM public.credit_batch_ledger l
  WHERE l.batch_id IS NOT NULL
  GROUP BY l.batch_id
) a ON a.batch_id = b.id;

-- F-2 (lanjutan): cabut hak baca luas + coba security_invoker.
REVOKE ALL ON public.credit_batch_reconciliation FROM PUBLIC;
REVOKE ALL ON public.credit_batch_reconciliation FROM anon;
REVOKE ALL ON public.credit_batch_reconciliation FROM authenticated;
DO $$
BEGIN
  BEGIN
    ALTER VIEW public.credit_batch_reconciliation SET (security_invoker = true);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'credit_batch_reconciliation: security_invoker tidak tersedia di platform ini (%); pagar REVOKE di atas tetap berlaku — JANGAN GRANT view ini ke authenticated/anon', SQLERRM;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 3. RPC transaksional (spesifikasi Phase 5.3 §5).
--    Semua fungsi: SECURITY DEFINER, SET search_path = public, jumlah
--    BIGINT integer, entri ledger append-only, dan diakhiri REVOKE ALL
--    FROM PUBLIC + GRANT EXECUTE hanya ke service_role. Pemanggil adalah
--    backend tepercaya (service role) SETELAH otorisasi workspace lolos;
--    p_owner_user_id / p_workspace_id pada issue_batch berasal dari
--    konteks server terverifikasi, bukan dari input klien bebas.
--    credit_batch_ledger.idempotency_key adalah NOT NULL + UNIQUE
--    (account_id, idempotency_key) — entri per-batch memakai kunci turunan
--    '<kunci>#<batch_id>' persis pola domain creditLedger.js.
-- ---------------------------------------------------------------------------

-- 3a. issue_batch — terbitkan satu batch + entri GRANT-nya.
--     FREE_ONCE: amount dipaksa 100 dan expires_at dipaksa NULL di dalam
--     fungsi; UNIQUE INDEX parsial Phase 5.3 menolak grant FREE_ONCE kedua
--     per akun (termasuk konkuren). SUBSCRIPTION tanpa expires_at eksplisit
--     tetapi dengan period_end: expires_at = period_end + 30 hari
--     (PERIOD_END_30). Idempotent: kunci GRANT yang sama → batch yang sama.
--     SPRINT 5 (Fase 2) — BREAKING CHANGE tanda tangan return: fungsi ini
--     kini RETURNS text, BUKAN uuid: 'OK:<batch_id>' untuk sukses maupun
--     replay yang payload-nya cocok, dan 'IDEMPOTENCY_CONFLICT' bila
--     kunci yang sama dipakai ulang dengan payload finansial yang beda
--     (paritas idemGet/`matches` grantCommon di creditLedger.js).
--     Pemanggil yang mengharapkan uuid mentah WAJIB menyesuaikan.
CREATE OR REPLACE FUNCTION public.issue_batch(
  p_account_id uuid,
  p_owner_user_id uuid,
  p_workspace_id uuid,
  p_type text,
  p_amount bigint,
  p_expires_at timestamptz,
  p_source_ref text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_idempotency_key text,
  p_actor text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_amount bigint := p_amount;
  v_expires_at timestamptz := p_expires_at;
  v_effective_expires_at timestamptz;
  v_existing public.credit_batches%ROWTYPE;
  v_payload_matches boolean;
  v_wallet text;
BEGIN
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_type NOT IN ('SUBSCRIPTION', 'TOP_UP', 'BONUS', 'FREE_ONCE') THEN
    RAISE EXCEPTION 'invalid_batch_type';
  END IF;

  -- SPRINT 3 FIX (F-5, audit SQL Phase 2): kunci advisory per
  -- (akun, kunci idempotensi) selama transaksi ini menserialisasi grant
  -- konkuren berkunci sama SEBELUM probe, sehingga jalur balapan
  -- SELECT-lalu-INSERT tertutup di sumbernya; blok EXCEPTION di bawah
  -- tetap menjadi jaring pengaman terakhir.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::text || ':' || p_idempotency_key, 0));

  -- SPRINT 5 (Fase 2): expires_at EFEKTIF dihitung lebih dulu memakai
  -- aturan fungsi yang sama dengan jalur normal di bawah, karena probe
  -- idempotensi membandingkan payload terhadap nilai efektif ini:
  -- FREE_ONCE → NULL; SUBSCRIPTION tanpa expires_at eksplisit tetapi
  -- dengan period_end → period_end + 30 hari; selain itu p_expires_at.
  v_effective_expires_at := CASE
    WHEN p_type = 'FREE_ONCE' THEN NULL
    WHEN p_type = 'SUBSCRIPTION' AND p_expires_at IS NULL AND p_period_end IS NOT NULL
      THEN p_period_end + interval '30 days'
    ELSE p_expires_at
  END;

  -- Putar ulang idempotent DENGAN paritas konflik (SPRINT 5, Fase 2 —
  -- meniru idemGet + `matches` pada grantCommon di creditLedger.js):
  -- kunci GRANT yang sama + payload finansial yang SAMA → putar ulang
  -- hasil asli sebagai 'OK:<batch_id>'; kunci sama + payload BEDA →
  -- 'IDEMPOTENCY_CONFLICT' TANPA mutasi apa pun (sebelumnya batch
  -- pertama dikembalikan diam-diam seolah permintaan baru sah).
  -- Perbandingan payload: baris credit_batches yang terhubung vs
  -- parameter ter-normalisasi — type, granted_amount, expires_at
  -- efektif, source_ref, period_start, period_end, owner_user_id,
  -- workspace_id.
  -- granted_amount dibandingkan terhadap nilai MENTAH p_amount, BUKAN
  -- jumlah terpaksa — JS membandingkan amount permintaan terhadap
  -- batch yang tersimpan. Pengecualian eksplisit FREE_ONCE: amount
  -- tersimpan selalu 100 karena dipaksa fungsi ini, jadi untuk
  -- FREE_ONCE yang dibandingkan HANYA type-nya — grant FREE_ONCE
  -- ber-amount permintaan berapa pun tetap replay, meniru JS yang
  -- memvalidasi amount (positif) SEBELUM pemaksaan 100 di
  -- grantFreeOnce/grantCommon.
  SELECT b.* INTO v_existing
  FROM public.credit_batch_ledger l
  JOIN public.credit_batches b ON b.id = l.batch_id
  WHERE l.account_id = p_account_id AND l.idempotency_key = p_idempotency_key AND l.kind = 'GRANT';
  IF v_existing.id IS NOT NULL THEN
    v_payload_matches :=
      v_existing.type IS NOT DISTINCT FROM p_type
      AND (p_type = 'FREE_ONCE' OR v_existing.granted_amount IS NOT DISTINCT FROM p_amount)
      AND v_existing.expires_at IS NOT DISTINCT FROM v_effective_expires_at
      AND v_existing.source_ref IS NOT DISTINCT FROM p_source_ref
      AND v_existing.period_start IS NOT DISTINCT FROM p_period_start
      AND v_existing.period_end IS NOT DISTINCT FROM p_period_end
      AND v_existing.owner_user_id IS NOT DISTINCT FROM p_owner_user_id
      AND v_existing.workspace_id IS NOT DISTINCT FROM p_workspace_id;
    IF v_payload_matches THEN
      RETURN 'OK:' || v_existing.id::text;
    END IF;
    RETURN 'IDEMPOTENCY_CONFLICT';
  END IF;

  -- Pemaksaan jalur normal (tidak berubah): FREE_ONCE amount dipaksa
  -- 100; expires_at memakai nilai efektif yang sudah dihitung di atas.
  IF p_type = 'FREE_ONCE' THEN
    v_amount := 100;
  END IF;
  v_expires_at := v_effective_expires_at;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_wallet := CASE WHEN p_type = 'SUBSCRIPTION' THEN 'SUBSCRIPTION_CREDITS' ELSE 'TOPUP_CREDITS' END;

  -- Batch + entri GRANT ditulis dalam satu sub-blok: pelanggaran unik
  -- (kunci ledger yang sama, atau UNIQUE parsial FREE_ONCE) me-rollback
  -- sub-blok ini saja (batch TIDAK jadi yatim), lalu hasil yang sudah
  -- terpersisten diputar ulang — pihak yang kalah menerima
  -- 'OK:<batch_id>' asli, bukan exception mentah — TETAPI hanya bila
  -- payload-nya lolos perbandingan yang sama seperti probe (SPRINT 5);
  -- bila beda, 'IDEMPOTENCY_CONFLICT'.
  BEGIN
    INSERT INTO public.credit_batches (
      account_id, owner_user_id, workspace_id, type, wallet,
      granted_amount, remaining_amount, reserved_amount, consumed_amount, expired_amount,
      expires_at, period_start, period_end, source_ref, status
    ) VALUES (
      p_account_id, p_owner_user_id, p_workspace_id, p_type, v_wallet,
      v_amount, v_amount, 0, 0, 0,
      v_expires_at, p_period_start, p_period_end, p_source_ref, 'ACTIVE'
    )
    RETURNING id INTO v_batch_id;

    INSERT INTO public.credit_batch_ledger (
      account_id, owner_user_id, workspace_id, batch_id, operation_id,
      kind, amount, idempotency_key, actor, reason
    ) VALUES (
      p_account_id, p_owner_user_id, p_workspace_id, v_batch_id, NULL,
      'GRANT', v_amount, p_idempotency_key, p_actor,
      CASE p_type
        WHEN 'SUBSCRIPTION' THEN 'subscription_grant'
        WHEN 'TOP_UP' THEN 'topup_grant'
        WHEN 'BONUS' THEN 'bonus_grant'
        ELSE 'free_once_grant'
      END
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT l.batch_id INTO v_batch_id
    FROM public.credit_batch_ledger l
    WHERE l.account_id = p_account_id AND l.idempotency_key = p_idempotency_key AND l.kind = 'GRANT';
    IF v_batch_id IS NULL AND p_type = 'FREE_ONCE' THEN
      SELECT b.id INTO v_batch_id
      FROM public.credit_batches b
      WHERE b.account_id = p_account_id AND b.type = 'FREE_ONCE'
      ORDER BY b.granted_at ASC, b.id ASC
      LIMIT 1;
    END IF;
    IF v_batch_id IS NULL THEN
      RAISE;
    END IF;
    -- SPRINT 5 (Fase 2): batch pemenang balapan wajib lolos
    -- PERBANDINGAN PAYLOAD YANG SAMA seperti probe di atas — jalur
    -- balapan tidak boleh menjadi jalan memutar melewati cek konflik.
    SELECT b.* INTO v_existing FROM public.credit_batches b WHERE b.id = v_batch_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    v_payload_matches :=
      v_existing.type IS NOT DISTINCT FROM p_type
      AND (p_type = 'FREE_ONCE' OR v_existing.granted_amount IS NOT DISTINCT FROM p_amount)
      AND v_existing.expires_at IS NOT DISTINCT FROM v_effective_expires_at
      AND v_existing.source_ref IS NOT DISTINCT FROM p_source_ref
      AND v_existing.period_start IS NOT DISTINCT FROM p_period_start
      AND v_existing.period_end IS NOT DISTINCT FROM p_period_end
      AND v_existing.owner_user_id IS NOT DISTINCT FROM p_owner_user_id
      AND v_existing.workspace_id IS NOT DISTINCT FROM p_workspace_id;
    IF v_payload_matches THEN
      RETURN 'OK:' || v_batch_id::text;
    END IF;
    RETURN 'IDEMPOTENCY_CONFLICT';
  END;

  RETURN 'OK:' || v_batch_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_batch(uuid, uuid, uuid, text, bigint, timestamptz, text, timestamptz, timestamptz, text, text) FROM PUBLIC;
-- SPRINT 5 (Fase 4): cabut juga secara eksplisit dari anon/authenticated.
REVOKE ALL ON FUNCTION public.issue_batch(uuid, uuid, uuid, text, bigint, timestamptz, text, timestamptz, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.issue_batch(uuid, uuid, uuid, text, bigint, timestamptz, text, timestamptz, timestamptz, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.issue_batch(uuid, uuid, uuid, text, bigint, timestamptz, text, timestamptz, timestamptz, text, text) TO service_role;

-- 3b. reserve_credits — alokasikan estimated_credits operasi ke batch.
--     Batch dikunci FOR UPDATE dalam URUTAN ALOKASI Phase 5.1:
--       1. SUBSCRIPTION — expires_at menaik (null terakhir),
--       2. BONUS/FREE_ONCE — expires_at menaik (null terakhir),
--       3. TOP_UP — granted_at menaik (FIFO);
--     tie-breaker granted_at menaik lalu id. Semua-atau-tidak-sama-sekali:
--     total layak < estimasi → 'insufficient_balance' TANPA mutasi apa pun
--     (fungsi return sebelum menulis; pengecualian apa pun me-rollback
--     seluruh transaksi fungsi).
--     SPRINT 3 FIX (F-6, audit SQL Phase 2): pra-cek ketersediaan yang
--     TIDAK terkunci tidak lagi dipercaya sebagai bukti pendanaan. Baris
--     akun dikunci FOR UPDATE lebih dulu (serialisasi per akun), batch
--     dikunci dalam urutan deterministik yang sama dengan urutan alokasi,
--     ketersediaan dihitung ulang di dalam transaksi dari baris terkunci,
--     setiap UPDATE batch diverifikasi ROW_COUNT-nya, dan SESUDAH loop
--     ada assertion keras: sisa kebutuhan harus PERSIS 0 dan total
--     alokasi harus sama dengan estimasi — bila tidak, RAISE (bukan
--     return) sehingga seluruh transaksi fungsi, termasuk alokasi dan
--     entri ledger parsial, ter-rollback. Nol baris reservasi/alokasi
--     boleh selamat dari transaksi yang gagal.
--     SPRINT 3 FIX (F-7): operasi dengan estimated_credits <= 0 ditolak
--     ('invalid_amount') — reservasi nol bukan reservasi yang sah.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_operation_id uuid,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.credit_usage_operations%ROWTYPE;
  v_account_id uuid;
  v_total bigint;
  v_need bigint;
  v_allocated bigint := 0;
  v_alloc_rows integer := 0;
  v_batch public.credit_batches%ROWTYPE;
  v_take bigint;
  v_rows integer;
BEGIN
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RETURN 'idempotency_key_required';
  END IF;

  SELECT * INTO v_op FROM public.credit_usage_operations WHERE id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_op.status <> 'CREATED' THEN
    RETURN 'invalid_state';
  END IF;
  IF v_op.estimated_credits IS NULL OR v_op.estimated_credits <= 0 THEN
    RETURN 'invalid_amount';
  END IF;

  -- Kunci baris akun: serialisasi reservasi konkuren per akun di level
  -- baris. Bila baris akun tidak ada (prasyarat Phase 5.3 belum terbukti
  -- di target), kunci ini kosong dan FK + assertion di bawah tetap
  -- fail-closed — fungsi tidak mengarang baris akun.
  SELECT a.id INTO v_account_id
  FROM public.billing_accounts a
  WHERE a.id = v_op.account_id
  FOR UPDATE;

  -- Pra-cek cepat (bukan bukti): ketersediaan AUTHORITATIF dihitung dari
  -- baris batch yang terkunci FOR UPDATE di loop alokasi di bawah, lalu
  -- dibuktikan oleh assertion v_need = 0 sesudah loop.
  SELECT COALESCE(SUM(b.remaining_amount), 0) INTO v_total
  FROM public.credit_batches b
  WHERE b.account_id = v_op.account_id
    AND b.status = 'ACTIVE'
    AND b.remaining_amount > 0
    AND (b.expires_at IS NULL OR b.expires_at > now());
  IF v_total < v_op.estimated_credits THEN
    RETURN 'insufficient_balance';
  END IF;

  v_need := v_op.estimated_credits;
  FOR v_batch IN
    SELECT * FROM public.credit_batches b
    WHERE b.account_id = v_op.account_id
      AND b.status = 'ACTIVE'
      AND b.remaining_amount > 0
      AND (b.expires_at IS NULL OR b.expires_at > now())
    ORDER BY
      CASE b.type WHEN 'SUBSCRIPTION' THEN 0 WHEN 'BONUS' THEN 1 WHEN 'FREE_ONCE' THEN 1 WHEN 'TOP_UP' THEN 2 ELSE 3 END,
      CASE WHEN b.type = 'TOP_UP' THEN NULL ELSE b.expires_at END ASC NULLS LAST,
      b.granted_at ASC,
      b.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_batch.remaining_amount, v_need);
    IF v_take <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.credit_batches
    SET remaining_amount = remaining_amount - v_take,
        reserved_amount = reserved_amount + v_take,
        updated_at = now()
    WHERE id = v_batch.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'reserve_batch_update_failed';
    END IF;

    INSERT INTO public.credit_reservation_allocations (operation_id, batch_id, account_id, amount)
    VALUES (v_op.id, v_batch.id, v_op.account_id, v_take);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'reserve_allocation_insert_failed';
    END IF;

    INSERT INTO public.credit_batch_ledger (
      account_id, owner_user_id, workspace_id, batch_id, operation_id,
      kind, amount, idempotency_key, actor, reason
    ) VALUES (
      v_op.account_id, v_op.owner_user_id, v_op.workspace_id, v_batch.id, v_op.id,
      'RESERVE', -v_take, p_idempotency_key || '#' || v_batch.id::text, NULL, 'reserve'
    );

    v_need := v_need - v_take;
    v_allocated := v_allocated + v_take;
    v_alloc_rows := v_alloc_rows + 1;
  END LOOP;

  -- SPRINT 3 FIX (F-6) — assertion pasca-loop: reservasi hanya boleh
  -- dicatat bila terdanai PENUH dari baris terkunci. RAISE me-rollback
  -- seluruh transaksi fungsi (alokasi + ledger parsial ikut hilang).
  IF v_need <> 0 OR v_allocated <> v_op.estimated_credits OR v_alloc_rows = 0 THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.credit_usage_operations
  SET status = 'RESERVED', reserved_credits = estimated_credits, updated_at = now()
  WHERE id = v_op.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'reserve_operation_update_failed';
  END IF;

  RETURN 'reserved';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_credits(uuid, text) FROM PUBLIC;
-- SPRINT 5 (Fase 4): cabut juga secara eksplisit dari anon/authenticated.
REVOKE ALL ON FUNCTION public.reserve_credits(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_credits(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(uuid, text) TO service_role;

-- 3c. settle_reservation — settle dengan usage AKTUAL terverifikasi.
--     actual <= reserved: konsumsi persis actual dari alokasi tercatat;
--     sisa reservasi per batch dilepas (RESERVE_RELEASE) atau di-write-off
--     EXPIRATION bila batch sudah kedaluwarsa saat settle.
--     actual > reserved: operasi → REQUIRES_REVIEW + satu baris
--     credit_settlement_reviews PENDING; TANPA debit parsial, TANPA saldo
--     negatif (overage hanya diputuskan resolve_review).
--     tariff_version wajib dikenal provider_tariff_versions; usage_evidence
--     wajib ada — usage tidak pernah dikarang di sini.
--     SPRINT 5 FIX (Fase 3): fungsi ini sebelumnya TANPA satu pun
--     assertion ROW_COUNT. Kini SETIAP penulisan diverifikasi
--     GET DIAGNOSTICS (wajib tepat 1 baris) dengan pesan khas
--     '<titik>_failed' bergaya F-6/F-10 — kegagalan me-RAISE sehingga
--     seluruh transaksi fungsi ter-rollback. Batch alokasi yang hilang
--     kini RAISE 'settle_allocation_batch_missing' (meniru
--     resolve_review), dan assertion pasca-loop baru mewajibkan total
--     konsumsi loop PERSIS p_actual_credits ('settle_consumption_mismatch').
--     PERUBAHAN PERILAKU YANG DISENGAJA: "alokasi tercatat kurang dari
--     reserved saat actual <= reserved" adalah korupsi data — dulu
--     operasi akan settle diam-diam dengan konsumsi batch kurang dari
--     actual yang dicatat; kini gagal tertutup dan ter-rollback (status
--     operasi yang sudah dikunci FOR UPDATE tidak berubah karena
--     rollback). TIDAK ADA penulisan di fungsi ini yang nol-barisnya
--     sah: semua UPDATE menyasar baris yang sudah dikunci FOR UPDATE
--     atau baru saja dibaca di transaksi ini, dan semua INSERT menulis
--     tepat satu baris — karena itu semua titik aman diberi assertion.
CREATE OR REPLACE FUNCTION public.settle_reservation(
  p_operation_id uuid,
  p_actual_credits bigint,
  p_usage_evidence jsonb,
  p_tariff_version text,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.credit_usage_operations%ROWTYPE;
  v_alloc record;
  v_batch public.credit_batches%ROWTYPE;
  v_to_consume bigint;
  v_consume bigint;
  v_remainder bigint;
  v_released bigint := 0;
  v_batch_expired boolean;
  -- SPRINT 5 (Fase 3): v_rows untuk assertion ROW_COUNT per penulisan;
  -- v_consumed_total akumulator konsumsi loop untuk assertion pasca-loop.
  v_rows integer;
  v_consumed_total bigint := 0;
BEGIN
  SELECT * INTO v_op FROM public.credit_usage_operations WHERE id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_op.status = 'SETTLED' THEN
    RETURN 'duplicate';
  END IF;
  IF v_op.status <> 'RESERVED' THEN
    RETURN 'invalid_state';
  END IF;
  IF p_actual_credits IS NULL OR p_actual_credits < 0 THEN
    RETURN 'invalid_usage';
  END IF;
  IF p_usage_evidence IS NULL THEN
    RETURN 'usage_missing';
  END IF;
  IF p_tariff_version IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.provider_tariff_versions t WHERE t.version = p_tariff_version
  ) THEN
    RETURN 'unknown_tariff';
  END IF;

  IF p_actual_credits > v_op.reserved_credits THEN
    UPDATE public.credit_usage_operations
    SET status = 'REQUIRES_REVIEW',
        actual_credits = p_actual_credits,
        overage_credits = p_actual_credits - reserved_credits,
        tariff_version = p_tariff_version,
        usage_evidence = p_usage_evidence,
        updated_at = now()
    WHERE id = v_op.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'settle_overage_update_failed';
    END IF;

    INSERT INTO public.credit_settlement_reviews (
      workspace_id, account_id, operation_id, status, feature,
      reserved_credits, actual_credits, overage_credits,
      tariff_version, usage_evidence, requested_by, idempotency_key
    ) VALUES (
      v_op.workspace_id, v_op.account_id, v_op.id, 'PENDING', v_op.feature,
      v_op.reserved_credits, p_actual_credits, p_actual_credits - v_op.reserved_credits,
      p_tariff_version, p_usage_evidence, v_op.actor_user_id::text,
      COALESCE(p_idempotency_key, 'review:' || v_op.id::text) || '#review'
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'settle_review_insert_failed';
    END IF;
    RETURN 'requires_review';
  END IF;

  v_to_consume := p_actual_credits;
  FOR v_alloc IN
    SELECT a.batch_id, a.amount
    FROM public.credit_reservation_allocations a
    WHERE a.operation_id = v_op.id
    ORDER BY a.created_at ASC, a.batch_id ASC
  LOOP
    SELECT * INTO v_batch FROM public.credit_batches WHERE id = v_alloc.batch_id FOR UPDATE;
    -- SPRINT 5 (Fase 3): alokasi yang menunjuk batch yang hilang adalah
    -- korupsi data — RAISE (meniru resolve_review), jangan lanjut
    -- dengan baris NULL yang membuat UPDATE di bawah nol-baris diam-diam.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'settle_allocation_batch_missing';
    END IF;
    v_consume := LEAST(v_alloc.amount, v_to_consume);
    v_remainder := v_alloc.amount - v_consume;
    v_to_consume := v_to_consume - v_consume;
    v_consumed_total := v_consumed_total + v_consume;
    v_batch_expired := v_batch.expires_at IS NOT NULL AND v_batch.expires_at <= now();

    UPDATE public.credit_batches
    SET reserved_amount = reserved_amount - v_alloc.amount,
        consumed_amount = consumed_amount + v_consume,
        remaining_amount = remaining_amount + CASE WHEN v_batch_expired THEN 0 ELSE v_remainder END,
        expired_amount = expired_amount + CASE WHEN v_batch_expired THEN v_remainder ELSE 0 END,
        updated_at = now()
    WHERE id = v_batch.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'settle_batch_update_failed';
    END IF;

    IF v_consume > 0 THEN
      INSERT INTO public.credit_batch_ledger (
        account_id, owner_user_id, workspace_id, batch_id, operation_id,
        kind, amount, idempotency_key, actor, reason
      ) VALUES (
        v_op.account_id, v_op.owner_user_id, v_op.workspace_id, v_batch.id, v_op.id,
        'CONSUME', -v_consume,
        COALESCE(p_idempotency_key, 'settle:' || v_op.id::text) || '#consume#' || v_batch.id::text,
        NULL, 'settle_actual_usage'
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'settle_consume_insert_failed';
      END IF;
    END IF;
    IF v_remainder > 0 AND v_batch_expired THEN
      INSERT INTO public.credit_batch_ledger (
        account_id, owner_user_id, workspace_id, batch_id, operation_id,
        kind, amount, idempotency_key, actor, reason
      ) VALUES (
        v_op.account_id, v_op.owner_user_id, v_op.workspace_id, v_batch.id, v_op.id,
        'EXPIRATION', -v_remainder,
        'expire-settle:' || v_op.id::text || ':' || v_batch.id::text,
        'system', 'settle_remainder_after_batch_expiry'
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'settle_expiration_insert_failed';
      END IF;
    ELSIF v_remainder > 0 THEN
      v_released := v_released + v_remainder;
      INSERT INTO public.credit_batch_ledger (
        account_id, owner_user_id, workspace_id, batch_id, operation_id,
        kind, amount, idempotency_key, actor, reason
      ) VALUES (
        v_op.account_id, v_op.owner_user_id, v_op.workspace_id, v_batch.id, v_op.id,
        'RESERVE_RELEASE', v_remainder,
        COALESCE(p_idempotency_key, 'settle:' || v_op.id::text) || '#release#' || v_batch.id::text,
        NULL, 'settle_release_unused'
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'settle_release_insert_failed';
      END IF;
    END IF;

    UPDATE public.credit_batches
    SET status = CASE
          WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'EXPIRED'
          WHEN remaining_amount = 0 AND reserved_amount = 0 THEN 'EXHAUSTED'
          ELSE 'ACTIVE'
        END
    WHERE id = v_batch.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'settle_batch_status_update_failed';
    END IF;
  END LOOP;

  -- SPRINT 5 (Fase 3) — assertion pasca-loop: yang dikonsumsi loop
  -- harus PERSIS p_actual_credits. Bila alokasi tercatat kurang dari
  -- yang harus dikonsumsi (korupsi data), RAISE me-rollback seluruh
  -- transaksi fungsi — operasi TIDAK tercatat SETTLED atas konsumsi
  -- parsial (perilaku lama: settle diam-diam).
  IF v_to_consume <> 0 OR v_consumed_total <> p_actual_credits THEN
    RAISE EXCEPTION 'settle_consumption_mismatch';
  END IF;

  UPDATE public.credit_usage_operations
  SET status = 'SETTLED',
      actual_credits = p_actual_credits,
      settled_credits = p_actual_credits,
      released_credits = v_released,
      tariff_version = p_tariff_version,
      usage_evidence = p_usage_evidence,
      updated_at = now()
  WHERE id = v_op.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'settle_operation_update_failed';
  END IF;

  RETURN 'settled';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_reservation(uuid, bigint, jsonb, text, text) FROM PUBLIC;
-- SPRINT 5 (Fase 4): cabut juga secara eksplisit dari anon/authenticated.
REVOKE ALL ON FUNCTION public.settle_reservation(uuid, bigint, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.settle_reservation(uuid, bigint, jsonb, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_reservation(uuid, bigint, jsonb, text, text) TO service_role;

-- 3d. resolve_review — resolusi MANUAL operasi REQUIRES_REVIEW.
--     Otorisasi diperiksa ULANG di dalam transaksi dari keanggotaan
--     workspace otoritatif (billingAuthorization.js): anggota AKTIF dengan
--     role SUPER_ADMIN (owner workspace) atau grant billing_admin eksplisit;
--     role CLIENT selalu ditolak; p_reviewer_role dari pemanggil harus sama
--     dengan role tersimpan. Transisi review bersifat compare-and-set
--     (WHERE status = 'PENDING' + baris dikunci FOR UPDATE) sehingga
--     resolusi ganda/konkuren hanya berhasil satu kali — CAS yang kalah
--     me-rollback seluruh fungsi lewat RAISE.
--     APPROVED: overage hanya didebit bila saldo tersedia mencukupi
--     (selain itu 'insufficient_balance', review TETAP PENDING, tanpa
--     mutasi). REJECTED: overage tidak didebit; reservasi dilepas ke batch
--     asal (write-off EXPIRATION bila batch sudah kedaluwarsa).
--     SPRINT 3 FIX (F-10, audit SQL Phase 2): pola cacat yang sama dengan
--     F-6 ditutup di cabang APPROVED — baris akun dikunci FOR UPDATE,
--     batch alokasi dikunci sebelum dikonsumsi, setiap UPDATE
--     diverifikasi ROW_COUNT-nya, dan SESUDAH loop overage ada assertion
--     keras v_need = 0 (plus total konsumsi alokasi = reserved_credits):
--     kegagalan assertion memakai RAISE sehingga konsumsi alokasi, debit
--     overage, entri ledger, dan transisi status SEMUA ter-rollback —
--     nol persetujuan parsial, dan approval berulang tidak mungkin
--     settle dua kali (penjaga status + CAS akhir tetap dipertahankan).
--     SPRINT 3 FIX (F-4): baris review kini dicocokkan silang terhadap
--     operasi (account_id + workspace_id harus identik); ketidakcocokan
--     → 'review_mismatch' tanpa mutasi. Otorisasi TIDAK diubah:
--     keanggotaan ACTIVE di workspace operasi, role tersimpan (klaim
--     p_reviewer_role harus sama), CLIENT selalu ditolak, dan akses
--     mensyaratkan SUPER_ADMIN atau billing_admin = true persis desain
--     JS canResolveBillingReview (pemilik workspace adalah SUPER_ADMIN
--     tanpa flag; anggota lain wajib flag eksplisit).
CREATE OR REPLACE FUNCTION public.resolve_review(
  p_operation_id uuid,
  p_decision text,
  p_reason text,
  p_reviewer_user_id uuid,
  p_reviewer_role text,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.credit_usage_operations%ROWTYPE;
  v_review public.credit_settlement_reviews%ROWTYPE;
  v_member_role text;
  v_member_billing_admin boolean;
  v_account_id uuid;
  v_alloc record;
  v_alloc_consumed bigint := 0;
  v_batch public.credit_batches%ROWTYPE;
  v_available bigint;
  v_need bigint;
  v_take bigint;
  v_batch_expired boolean;
  v_rows integer;
BEGIN
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN 'invalid_decision';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN 'reason_required';
  END IF;

  SELECT * INTO v_op FROM public.credit_usage_operations WHERE id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  SELECT * INTO v_review FROM public.credit_settlement_reviews WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'review_not_found';
  END IF;
  IF v_review.status <> 'PENDING' THEN
    RETURN 'already_resolved';
  END IF;
  IF v_op.status <> 'REQUIRES_REVIEW' THEN
    RETURN 'invalid_state';
  END IF;
  -- SPRINT 3 FIX (F-4): review harus milik akun + workspace operasi ini.
  IF v_review.account_id IS DISTINCT FROM v_op.account_id
     OR v_review.workspace_id IS DISTINCT FROM v_op.workspace_id THEN
    RETURN 'review_mismatch';
  END IF;

  -- Kunci baris akun: serialisasi terhadap reservasi/resolusi konkuren
  -- untuk akun yang sama selama cabang finansial berjalan.
  SELECT a.id INTO v_account_id
  FROM public.billing_accounts a
  WHERE a.id = v_op.account_id
  FOR UPDATE;

  -- Periksa ulang permission reviewer dari data otoritatif: keanggotaan
  -- divalidasi terhadap workspace OPERASI (yang kini terbukti sama
  -- dengan workspace review), bukan terhadap klaim pemanggil.
  SELECT m.role, m.billing_admin INTO v_member_role, v_member_billing_admin
  FROM public.workspace_members m
  WHERE m.workspace_id = v_op.workspace_id
    AND m.user_id = p_reviewer_user_id
    AND m.status = 'ACTIVE';
  IF v_member_role IS NULL
     OR v_member_role = 'CLIENT'
     OR NOT (v_member_role = 'SUPER_ADMIN' OR v_member_billing_admin = true)
     OR (p_reviewer_role IS NOT NULL AND p_reviewer_role <> v_member_role) THEN
    RETURN 'forbidden_review';
  END IF;

  IF p_decision = 'APPROVED' THEN
    IF v_op.usage_evidence IS NULL OR v_op.actual_credits IS NULL THEN
      RETURN 'usage_missing';
    END IF;
    IF v_op.tariff_version IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.provider_tariff_versions t WHERE t.version = v_op.tariff_version
    ) THEN
      RETURN 'unknown_tariff';
    END IF;

    SELECT COALESCE(SUM(b.remaining_amount), 0) INTO v_available
    FROM public.credit_batches b
    WHERE b.account_id = v_op.account_id
      AND b.status = 'ACTIVE'
      AND b.remaining_amount > 0
      AND (b.expires_at IS NULL OR b.expires_at > now());
    IF v_available < v_op.overage_credits THEN
      RETURN 'insufficient_balance';
    END IF;

    -- Konsumsi seluruh alokasi reservasi (actual > reserved: tak ada sisa).
    FOR v_alloc IN
      SELECT a.batch_id, a.amount
      FROM public.credit_reservation_allocations a
      WHERE a.operation_id = v_op.id
      ORDER BY a.created_at ASC, a.batch_id ASC
    LOOP
      SELECT * INTO v_batch FROM public.credit_batches WHERE id = v_alloc.batch_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'review_allocation_batch_missing';
      END IF;
      UPDATE public.credit_batches
      SET reserved_amount = reserved_amount - v_alloc.amount,
          consumed_amount = consumed_amount + v_alloc.amount,
          updated_at = now()
      WHERE id = v_alloc.batch_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'review_allocation_update_failed';
      END IF;
      v_alloc_consumed := v_alloc_consumed + v_alloc.amount;

      INSERT INTO public.credit_batch_ledger (
        account_id, owner_user_id, workspace_id, batch_id, operation_id,
        kind, amount, idempotency_key, actor, reason
      ) VALUES (
        v_op.account_id, v_op.owner_user_id, v_op.workspace_id, v_alloc.batch_id, v_op.id,
        'CONSUME', -v_alloc.amount,
        COALESCE(p_idempotency_key, 'review:' || v_op.id::text) || '#consume#' || v_alloc.batch_id::text,
        p_reviewer_user_id::text, 'review_approved_settle'
      );
    END LOOP;
    -- Assertion: alokasi yang dikonsumsi harus PERSIS reserved_credits.
    IF v_alloc_consumed <> v_op.reserved_credits THEN
      RAISE EXCEPTION 'review_allocation_mismatch';
    END IF;

    -- Debit overage dari saldo tersedia menurut urutan alokasi Phase 5.1.
    v_need := v_op.overage_credits;
    FOR v_batch IN
      SELECT * FROM public.credit_batches b
      WHERE b.account_id = v_op.account_id
        AND b.status = 'ACTIVE'
        AND b.remaining_amount > 0
        AND (b.expires_at IS NULL OR b.expires_at > now())
      ORDER BY
        CASE b.type WHEN 'SUBSCRIPTION' THEN 0 WHEN 'BONUS' THEN 1 WHEN 'FREE_ONCE' THEN 1 WHEN 'TOP_UP' THEN 2 ELSE 3 END,
        CASE WHEN b.type = 'TOP_UP' THEN NULL ELSE b.expires_at END ASC NULLS LAST,
        b.granted_at ASC,
        b.id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_need <= 0;
      v_take := LEAST(v_batch.remaining_amount, v_need);
      IF v_take <= 0 THEN
        CONTINUE;
      END IF;
      UPDATE public.credit_batches
      SET remaining_amount = remaining_amount - v_take,
          consumed_amount = consumed_amount + v_take,
          updated_at = now()
      WHERE id = v_batch.id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'review_overage_update_failed';
      END IF;

      INSERT INTO public.credit_batch_ledger (
        account_id, owner_user_id, workspace_id, batch_id, operation_id,
        kind, amount, idempotency_key, actor, reason
      ) VALUES (
        v_op.account_id, v_op.owner_user_id, v_op.workspace_id, v_batch.id, v_op.id,
        'CONSUME', -v_take,
        COALESCE(p_idempotency_key, 'review:' || v_op.id::text) || '#overage#' || v_batch.id::text,
        p_reviewer_user_id::text, 'review_approved_overage'
      );
      v_need := v_need - v_take;
    END LOOP;

    -- SPRINT 3 FIX (F-10) — assertion pasca-loop overage: RAISE (bukan
    -- return) agar konsumsi alokasi + entri ledger di atas ter-rollback
    -- dan operasi TIDAK tercatat SETTLED atas pendanaan parsial.
    IF v_need <> 0 THEN
      RAISE EXCEPTION 'insufficient_balance';
    END IF;

    UPDATE public.credit_usage_operations
    SET status = 'SETTLED',
        settled_credits = actual_credits,
        released_credits = 0,
        updated_at = now()
    WHERE id = v_op.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'review_operation_update_failed';
    END IF;
  ELSE
    -- REJECTED: lepas reservasi ke batch asal; batch kedaluwarsa menerima
    -- write-off EXPIRATION, bukan pengembalian sisa.
    FOR v_alloc IN
      SELECT a.batch_id, a.amount
      FROM public.credit_reservation_allocations a
      WHERE a.operation_id = v_op.id
      ORDER BY a.created_at ASC, a.batch_id ASC
    LOOP
      SELECT * INTO v_batch FROM public.credit_batches WHERE id = v_alloc.batch_id FOR UPDATE;
      v_batch_expired := v_batch.expires_at IS NOT NULL AND v_batch.expires_at <= now();

      UPDATE public.credit_batches
      SET reserved_amount = reserved_amount - v_alloc.amount,
          remaining_amount = remaining_amount + CASE WHEN v_batch_expired THEN 0 ELSE v_alloc.amount END,
          expired_amount = expired_amount + CASE WHEN v_batch_expired THEN v_alloc.amount ELSE 0 END,
          updated_at = now()
      WHERE id = v_batch.id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'review_release_update_failed';
      END IF;

      INSERT INTO public.credit_batch_ledger (
        account_id, owner_user_id, workspace_id, batch_id, operation_id,
        kind, amount, idempotency_key, actor, reason
      ) VALUES (
        v_op.account_id, v_op.owner_user_id, v_op.workspace_id, v_batch.id, v_op.id,
        CASE WHEN v_batch_expired THEN 'EXPIRATION' ELSE 'RESERVE_RELEASE' END,
        CASE WHEN v_batch_expired THEN -v_alloc.amount ELSE v_alloc.amount END,
        COALESCE(p_idempotency_key, 'review:' || v_op.id::text)
          || CASE WHEN v_batch_expired THEN '#exp#' ELSE '#rel#' END || v_batch.id::text,
        p_reviewer_user_id::text,
        CASE WHEN v_batch_expired THEN 'release_after_batch_expiry' ELSE 'release' END
      );
    END LOOP;

    UPDATE public.credit_usage_operations
    SET status = 'RELEASED',
        released_credits = reserved_credits,
        updated_at = now()
    WHERE id = v_op.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'review_operation_update_failed';
    END IF;
  END IF;

  -- Compare-and-set: hanya resolusi pertama yang menang.
  UPDATE public.credit_settlement_reviews
  SET status = p_decision,
      reviewer_user_id = p_reviewer_user_id,
      reviewer_role = v_member_role,
      resolution_reason = p_reason,
      resolved_at = now()
  WHERE id = v_review.id AND status = 'PENDING';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'already_resolved';
  END IF;

  INSERT INTO public.credit_batch_ledger (
    account_id, owner_user_id, workspace_id, batch_id, operation_id,
    kind, amount, idempotency_key, actor, reason
  ) VALUES (
    v_op.account_id, v_op.owner_user_id, v_op.workspace_id, NULL, v_op.id,
    'REVIEW_DECISION', 0,
    COALESCE(p_idempotency_key, 'review:' || v_op.id::text) || '#decision',
    p_reviewer_user_id::text,
    'review_' || lower(p_decision) || ': ' || p_reason
  );

  RETURN lower(p_decision);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_review(uuid, text, text, uuid, text, text) FROM PUBLIC;
-- SPRINT 5 (Fase 4): cabut juga secara eksplisit dari anon/authenticated.
REVOKE ALL ON FUNCTION public.resolve_review(uuid, text, text, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_review(uuid, text, text, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_review(uuid, text, text, uuid, text, text) TO service_role;

-- 3e. apply_expirations — sapu kedaluwarsa satu akun pada waktu p_now.
--     Melewati FREE_ONCE secara EKSPLISIT (kebijakan final: tidak pernah
--     kedaluwarsa) dan batch FROZEN. Hanya remaining_amount yang disapu;
--     porsi yang sedang ter-reserve TIDAK disentuh (milik reservasi yang
--     hidup — penyelesaiannya mengikuti settle/release operasi itu).
--     Idempotent per batch lewat kunci entri 'expire:<batch_id>'.
--     Mengembalikan total kredit yang dikedaluwarsakan pada sapuan ini.
CREATE OR REPLACE FUNCTION public.apply_expirations(
  p_account_id uuid,
  p_now timestamptz
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.credit_batches%ROWTYPE;
  v_total bigint := 0;
BEGIN
  FOR v_batch IN
    SELECT * FROM public.credit_batches b
    WHERE b.account_id = p_account_id
      AND b.type <> 'FREE_ONCE'
      AND b.status <> 'FROZEN'
      AND b.expires_at IS NOT NULL
      AND b.expires_at <= p_now
      AND b.remaining_amount > 0
    FOR UPDATE
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.credit_batch_ledger l
      WHERE l.account_id = v_batch.account_id
        AND l.idempotency_key = 'expire:' || v_batch.id::text
    ) THEN
      INSERT INTO public.credit_batch_ledger (
        account_id, owner_user_id, workspace_id, batch_id, operation_id,
        kind, amount, idempotency_key, actor, reason
      ) VALUES (
        v_batch.account_id, v_batch.owner_user_id, v_batch.workspace_id, v_batch.id, NULL,
        'EXPIRATION', -v_batch.remaining_amount, 'expire:' || v_batch.id::text,
        'system', 'batch_expiry_sweep'
      );
    END IF;

    v_total := v_total + v_batch.remaining_amount;
    UPDATE public.credit_batches
    SET expired_amount = expired_amount + remaining_amount,
        remaining_amount = 0,
        status = 'EXPIRED',
        updated_at = p_now
    WHERE id = v_batch.id;
  END LOOP;

  -- Batch yang sudah kedaluwarsa tanpa sisa pun ditandai EXPIRED;
  -- reserved_amount-nya tetap tidak disentuh.
  UPDATE public.credit_batches
  SET status = 'EXPIRED', updated_at = p_now
  WHERE account_id = p_account_id
    AND type <> 'FREE_ONCE'
    AND status <> 'FROZEN'
    AND status <> 'EXPIRED'
    AND expires_at IS NOT NULL
    AND expires_at <= p_now;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_expirations(uuid, timestamptz) FROM PUBLIC;
-- SPRINT 5 (Fase 4): cabut juga secara eksplisit dari anon/authenticated.
REVOKE ALL ON FUNCTION public.apply_expirations(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.apply_expirations(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_expirations(uuid, timestamptz) TO service_role;

-- ============================================================================
-- ROLLBACK (KOMENTAR — jangan dieksekusi sebagai bagian migration ini;
-- jalankan manual berurutan terbalik HANYA dengan persetujuan owner, dan
-- hanya bila migration ini terbukti pernah di-apply):
--   DROP FUNCTION IF EXISTS public.apply_expirations(uuid, timestamptz);
--   DROP FUNCTION IF EXISTS public.resolve_review(uuid, text, text, uuid, text, text);
--   DROP FUNCTION IF EXISTS public.settle_reservation(uuid, bigint, jsonb, text, text);
--   DROP FUNCTION IF EXISTS public.reserve_credits(uuid, text);
--   DROP FUNCTION IF EXISTS public.issue_batch(uuid, uuid, uuid, text, bigint, timestamptz, text, timestamptz, timestamptz, text, text);
--   Catatan SPRINT 5: baris DROP issue_batch di atas TIDAK berubah
--   meski RETURNS berubah uuid → text — DROP FUNCTION mengidentifikasi
--   fungsi dari nama + tipe argumen saja; tipe return bukan bagian
--   signature DROP. (Sebaliknya, CREATE OR REPLACE tidak bisa mengubah
--   tipe return fungsi yang SUDAH ada — file ini belum pernah
--   dieksekusi sehingga tidak ada fungsi lama; bila suatu saat versi
--   uuid pernah ter-apply di target, DROP dulu sebelum CREATE.)
--   DROP VIEW IF EXISTS public.credit_batch_reconciliation;
--   DROP TABLE IF EXISTS public.credit_pricing_policy_versions;
-- Catatan rollback: tabel kebijakan berisi baris referensi yang di-INSERT
-- file ini; menghapus tabel menghapus baris itu. Fungsi/view tidak memegang
-- data ledger — rollback TIDAK menyentuh credit_batches / credit_batch_ledger
-- / credit_usage_operations / credit_settlement_reviews.
-- ============================================================================
