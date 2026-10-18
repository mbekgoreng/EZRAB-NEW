-- ============================================================================
-- EZRAB Market Price Intelligence — market_price_references + history
-- ============================================================================
-- STATUS: NOT APPLIED to any live database. Review + apply manually.
-- Non-destructive by design (CREATE TABLE IF NOT EXISTS, no DROPs).
--
-- Tabel ini menyimpan REFERENSI HARGA PASAR dengan identitas & riwayat sendiri.
-- Referensi pasar TIDAK PERNAH menimpa harga resmi AHSP/HSD.
-- MARKET_VERIFIED = diverifikasi manusia, TETAP berlabel harga pasar.
-- Persetujuan estimator menautkan ke price_assumptions (DRAFT) — bukan ke
-- harga resmi.
-- ============================================================================

create table if not exists public.market_price_references (
  id text primary key,
  -- identitas material
  material_id text,
  canonical_name text not null,
  aliases text[] not null default '{}',
  spec_category text not null,
  spec_key_attributes jsonb not null default '{}',
  spec_extra_attributes jsonb not null default '{}',
  -- sumber
  source_name text not null,
  source_type text not null check (source_type in ('toko_bangunan','marketplace','distributor','ai_suggested','manual')),
  source_product_id text,
  product_url text,
  seller_name text,
  brand text,
  product_title text not null,
  -- harga & satuan
  listed_price numeric(18,2) not null check (listed_price > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  package_quantity numeric(18,4),
  package_unit text,
  normalized_unit text not null,
  normalized_unit_price numeric(18,2),
  price_type text not null default 'normal' check (price_type in ('normal','promo','grosir','member')),
  region text,
  availability text not null default 'tidak_diketahui'
    check (availability in ('tersedia','habis','tidak_diketahui')),
  -- verifikasi
  verification_status text not null default 'MARKET_REFERENCE'
    check (verification_status in ('MARKET_REFERENCE','NEEDS_REVIEW','MARKET_VERIFIED','REJECTED')),
  match_confidence numeric(3,2) not null default 0 check (match_confidence >= 0 and match_confidence <= 1),
  review_notes text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  -- audit
  captured_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  -- MARKET_VERIFIED wajib punya URL bukti + harga ternormalisasi + identitas verifier
  check (verification_status != 'MARKET_VERIFIED' or product_url is not null),
  check (verification_status != 'MARKET_VERIFIED' or normalized_unit_price is not null),
  check (verification_status != 'MARKET_VERIFIED' or verified_by is not null)
);

create index if not exists idx_mpr_canonical_unit
  on public.market_price_references (canonical_name, normalized_unit);
create index if not exists idx_mpr_status
  on public.market_price_references (verification_status);
create index if not exists idx_mpr_source_product
  on public.market_price_references (source_name, source_product_id);

-- riwayat: tidak ada DELETE diam-diam
create table if not exists public.market_price_history (
  id uuid primary key default gen_random_uuid(),
  reference_id text not null references public.market_price_references(id),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  change_kind text not null check (change_kind in ('created','price_updated','status_changed','spec_corrected')),
  old_value text,
  new_value text,
  note text
);

create index if not exists idx_mph_reference
  on public.market_price_history (reference_id, changed_at desc);

-- RLS: baca untuk authenticated, tulis via policy aplikasi (meniru price_assumptions)
alter table public.market_price_references enable row level security;
alter table public.market_price_history enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'mpr_read_authenticated') then
    create policy mpr_read_authenticated on public.market_price_references
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'mph_read_authenticated') then
    create policy mph_read_authenticated on public.market_price_history
      for select to authenticated using (true);
  end if;
end $$;
