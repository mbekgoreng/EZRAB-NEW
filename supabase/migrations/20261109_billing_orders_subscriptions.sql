-- ============================================================================
-- EZRAB Billing — Order Pembayaran, Langganan & Peristiwa Webhook (Midtrans)
-- ============================================================================
-- STATUS: FILE DRAFT UNTUK DITINJAU. TIDAK DIEKSEKUSI oleh fase integrasi
-- Midtrans lokal. JANGAN APPLY ke database mana pun tanpa persetujuan owner
-- DAN verifikasi status migration sebelumnya lebih dulu.
--
-- LATAR: migration 20261102 (ledger batch) + 20261102_phase53 (akun billing
-- workspace, review) TIDAK memiliki tempat untuk:
--   (a) ORDER pembayaran gateway (checkout → status → grant), dan
--   (b) STATUS LANGGANAN (mesin status WS-B §3 langkah 6).
-- File ini ADITIF MURNI untuk kedua kebutuhan itu + jurnal peristiwa
-- webhook. Ia TIDAK mengubah tabel/migration mana pun yang sudah ada.
--
-- PRASYARAT & URUTAN:
-- - Jalankan SETELAH 20260913_auth_membership_foundation.sql (workspaces,
--   profiles) dan 20261102_phase53_workspace_billing.sql (billing_accounts).
-- - Status penerapan migration prasyarat di database nyata: UNKNOWN —
--   verifikasi dulu sebelum file ini dipertimbangkan.
--
-- ATURAN YANG DITEGAKKAN SKEMA:
-- - order_id (id transaksi Midtrans) UNIQUE — kunci idempotensi pembayaran;
--   webhook replay menemukan baris yang sama, tidak membuat order ganda.
-- - Satu akun billing = maksimal satu baris langganan berjalan
--   (UNIQUE account_id di billing_subscriptions).
-- - Refund dicatat sebagai status order + baris peristiwa; TIDAK ada kolom
--   atau struktur penarikan saldo/refund uang di file ini — perlakuan saldo
--   atas refund adalah PENDING_LEGAL_REVIEW (register D1/D2/D4).
-- - RLS fail-closed: anggota workspace boleh SELECT order/langganan
--   workspace-nya; billing_payment_events tanpa policy authenticated
--   (audit server saja). Tulis HANYA via service_role server-side.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. billing_orders — satu baris per upaya pembayaran (checkout).
--    Dibuat server-side dari KATALOG server (amount_idr tidak pernah dari
--    klien). paymentRef ledger = order_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id),
  account_id uuid NOT NULL REFERENCES public.billing_accounts (id),
  created_by uuid REFERENCES public.profiles (id),
  kind text NOT NULL CHECK (kind IN ('SUBSCRIPTION', 'TOP_UP')),
  item_id text NOT NULL,
  plan_id text,
  amount_idr bigint NOT NULL CHECK (amount_idr >= 0),
  credits_snapshot integer,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED',
                      'REFUNDED', 'PARTIALLY_REFUNDED')),
  snap_token text,
  redirect_url text,
  midtrans_transaction_status text,
  midtrans_payment_type text,
  granted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_orders_account_created
  ON public.billing_orders (account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_orders_workspace_created
  ON public.billing_orders (workspace_id, created_at);

ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_orders_select_member ON public.billing_orders
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
            WHERE m.workspace_id = billing_orders.workspace_id
              AND m.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. billing_subscriptions — state berjalan mesin status langganan
--    (api/_lib/subscriptionMachine.js). Satu baris per akun billing;
--    transisi ditulis server-side dari peristiwa webhook + sapuan waktu.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id),
  account_id uuid NOT NULL UNIQUE REFERENCES public.billing_accounts (id),
  plan_id text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE',
                      'CANCELLED', 'EXPIRED')),
  period_start timestamptz,
  period_end timestamptz,
  trial_end timestamptz,
  grace_ends_at timestamptz,
  last_order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_subscriptions_select_member ON public.billing_subscriptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workspace_members m
            WHERE m.workspace_id = billing_subscriptions.workspace_id
              AND m.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. billing_payment_events — jurnal APPEND-ONLY setiap notifikasi webhook
--    yang diterima (termasuk yang signature-nya tidak valid — signature_valid
--    membedakannya; payload untuk invalid tidak dipercaya dan tidak diproses).
--    order_id sengaja TANPA foreign key: notifikasi untuk order yang tidak
--    dikenal tetap harus bisa dicatat sebagai bukti.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  account_id uuid REFERENCES public.billing_accounts (id),
  transaction_status text,
  status_code text,
  gross_amount text,
  signature_valid boolean NOT NULL DEFAULT false,
  event_kind text,
  processing_result text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_events_order
  ON public.billing_payment_events (order_id, created_at);

ALTER TABLE public.billing_payment_events ENABLE ROW LEVEL SECURITY;
-- Tanpa policy untuk authenticated: jurnal webhook adalah audit server-side.

-- ============================================================================
-- CATATAN ADAPTER (bukan SQL):
-- - Adapter store (api/_lib/billingStore.js) memetakan store domain
--   creditLedger.js ke tabel 20261102/phase53 (batches/ledger/operations/
--   reviews + billing_accounts) dan modul billing ke tiga tabel di atas.
-- - RPC transaksional pada spesifikasi Phase 5.3 §5 TETAP merupakan langkah
--   pengerasan production sebelum uang nyata: adapter REST menambal
--   atomisitas dengan constraint UNIQUE (ledger idempotency, FREE_ONCE
--   parsial, order_id) + update compare-and-set pada status order.
-- ============================================================================
