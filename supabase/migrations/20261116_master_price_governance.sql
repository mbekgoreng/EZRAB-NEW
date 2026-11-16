-- ============================================================================
-- EZRAB Master Pricing §4 — Global Master Price Governance
--   master_price_* tables: canonical entities, price records, price
--   history, aliases, AHSP database versions + global_admins.
-- §13 additions (2026-11-16): content_checksum on ahsp_database_versions,
--   sync_history table (§13.4), price_change_feed view (read projection
--   over master_price_history). The file stays NOT APPLIED.
-- ============================================================================
-- STATUS: NOT APPLIED to any live database. Review + apply manually.
-- Non-destructive by design (CREATE TABLE IF NOT EXISTS, no DROPs).
--
-- BLOCKED (§2.4.7 — do not apply until the blockers clear):
--   (a) Owner confirms/provides the Supabase project and applies the
--       canonical schema 20261008 (which SUPERSEDES both 20260913
--       files — see supabase/migrations/README.md; NEVER apply the
--       20260913 files: they conflict on projects.id TEXT vs UUID);
--   (b) AUTH_ENABLED=true + real Supabase login works (today
--       AUTH_ENABLED=false is hardcoded in src/App.tsx:32);
--   (c) this migration is applied; (d) the admin API exists
--       (server/ on the VPS — the Vercel Hobby quota is 12/12, so no
--       new Vercel function can host it).
-- Until (a)–(d) are done, §4.1 enforcement does not exist anywhere.
-- The deterministic authorization LOGIC lives in
-- src/engine/pricing/admin/masterPriceAuthorization.ts (local only).
--
-- APPLY ORDER (explicit, I-15):
--   1. 20261008_phase3_canonical_schema_rls.sql (canonical; SUPERSEDES
--      20260913_auth_membership_foundation.sql and
--      20260913_durable_project_rab_foundation.sql — do NOT apply those)
--   2. 20261012_price_assumptions.sql (pattern source for this file)
--   3. THIS FILE (20261116_master_price_governance.sql)
--   4. (later) 20261018_market_price_references.sql if not yet applied
-- This file depends only on auth.users + pgcrypto (gen_random_uuid);
-- it does NOT depend on workspaces/projects (global admins are a
-- separate authority by §4 decision — see global_admins below).
--
-- DESIGN DECISIONS (§4, recorded here and in masterPriceAuthorization.ts):
--   * Global admin = SEPARATE TABLE `global_admins`, NOT a role in
--     workspace_members: workspace roles are per-workspace, master
--     prices are GLOBAL. Reusing workspace SUPER_ADMIN would conflate
--     two authorities and silently grant global price power to every
--     workspace super-admin.
--   * A missing price is NULL (explicitly unresolved), never 0.
--     CHECK: amount IS NULL OR amount >= 0 — an explicit 0 is a
--     resolved zero price (same rule as resolvePriceStatus); a
--     negative price is invalid.
--   * Records are never deleted: deactivation is a status change
--     (ACTIVE → SUPERSEDED/EXPIRED). No DELETE policy exists on any
--     master_price_* table.
--   * History is append-only: `master_price_history` has NO client
--     INSERT/UPDATE/DELETE policies — rows are written only by the
--     SECURITY DEFINER trigger on master_price_records.
--   * Every price change carries a reason (>= 10 chars, mirrors
--     price_assumptions.source_note) supplied via the transient
--     `change_reason` column, which the trigger copies into the
--     history row and then clears. A change without a reason is
--     rejected by the trigger.
--   * Rollback creates a NEW version (never resurrects a superseded
--     row): the admin API updates the record back to the previous
--     values with change_operation='ROLLBACK'; the trigger writes a
--     ROLLBACK history entry and bumps the version.
--   * The original AHSP source price is preserved independently
--     (original_ahsp_source_price) and is NEVER overwritten by the
--     master price.
--   * §12 (MASTER PRICING §12 — §11 BLOCKED #2): the §4 operation
--     enum now covers AHSP VERSION writes too
--     (`AhspVersionOperation` in masterPriceAuthorization.ts:
--     CLONE_AHSP_VERSION, PUBLISH_AHSP_VERSION, ROLLBACK_AHSP_VERSION,
--     EDIT_AHSP_ACTIVE). The `ahsp_version_history` table below is
--     the append-only audit trail for those transitions, mirroring
--     `master_price_history`; its operation CHECK lists exactly the
--     four TS enum values. Keep them in sync.
-- ============================================================================

-- ---------------------------------------------------------- global admins --
-- The ONLY authority that may write the global master price DB.
-- Bootstrap problem: the FIRST admin cannot be granted by an existing
-- admin (none exists yet). The owner inserts the first row via the
-- Supabase SQL console / service_role (which bypasses RLS), or calls
-- ezrab_grant_global_admin() as service_role. After bootstrap, grants
-- and revokes are done by existing global admins only. Revocation is
-- a timestamp (revoked_at), never a delete — the grant history stays.
create table if not exists public.global_admins (
  user_id uuid primary key references auth.users(id),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  reason text not null check (char_length(reason) >= 10),
  note text
);
create index if not exists idx_global_admins_active
  on public.global_admins (user_id) where revoked_at is null;

-- Helper (mirrors the 20261008 ezrab_can_write_* pattern).
create or replace function public.ezrab_is_global_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.global_admins
  where user_id = auth.uid() and revoked_at is null
) $$;

-- Grant / revoke via SECURITY DEFINER functions (the only write path
-- besides service_role bootstrap). The caller must already be a global
-- admin, unless the caller IS service_role (bootstrap: auth.uid() is
-- null and auth.role() = 'service_role').
create or replace function public.ezrab_grant_global_admin(
  target_user uuid,
  grant_reason text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if char_length(coalesce(grant_reason, '')) < 10 then
    raise exception 'grant reason is required (at least 10 characters)';
  end if;
  if auth.role() <> 'service_role' and not public.ezrab_is_global_admin() then
    raise exception 'Only a global admin (or service_role bootstrap) may grant global admin';
  end if;
  insert into public.global_admins (user_id, granted_by, reason)
  values (target_user, auth.uid(), grant_reason)
  on conflict (user_id) do update set
    revoked_at = null,
    revoked_by = null,
    granted_by = excluded.granted_by,
    granted_at = now(),
    reason = excluded.reason;
end;
$$;

create or replace function public.ezrab_revoke_global_admin(
  target_user uuid,
  revoke_reason text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if char_length(coalesce(revoke_reason, '')) < 10 then
    raise exception 'revoke reason is required (at least 10 characters)';
  end if;
  if auth.role() <> 'service_role' and not public.ezrab_is_global_admin() then
    raise exception 'Only a global admin (or service_role bootstrap) may revoke global admin';
  end if;
  if target_user = auth.uid() then
    raise exception 'A global admin cannot revoke their own grant (ask another admin)';
  end if;
  update public.global_admins
  set revoked_at = now(), revoked_by = auth.uid(), reason = revoke_reason
  where user_id = target_user and revoked_at is null;
  if not found then
    raise exception 'No active global admin grant for %', target_user;
  end if;
end;
$$;

-- ------------------------------------------------------- canonical entity --
-- §3.1 canonical entities (RES-xxx). One row per canonical material /
-- labor / equipment identity. Prices live in master_price_records (§3.3:
-- identity != price — one entity, many price records).
create table if not exists public.master_price_entities (
  resource_id text primary key,
  canonical_name text not null,
  category text not null check (category in ('MATERIAL','LABOR','EQUIPMENT')),
  specification text,
  primary_unit text not null,
  description text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','INACTIVE')),
  source_document text,
  source_domain text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_master_price_entities_category
  on public.master_price_entities (category, status);

-- --------------------------------------------------------- price records --
-- §4.2 price records. `amount` NULL = explicitly unresolved (no source
-- price); 0 = an explicit zero price; negative = rejected by CHECK.
-- Transient write-time columns (change_reason, change_operation,
-- change_affected_ahsp, change_affected_projects) are inputs for the
-- history trigger: the admin API sets them with each write, the
-- trigger copies them into the history row and clears them. They are
-- never read as data.
create table if not exists public.master_price_records (
  id text primary key,
  resource_id text not null references public.master_price_entities(resource_id),
  amount numeric(18,2) check (amount is null or amount >= 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  unit text not null,
  unit_raw text,
  -- §4.2 price type vocabulary (observed in the price master; RETAIL
  -- added by Master Pricing §6 decision (j): verified-retailer rows
  -- from the material service, a genuine acquisition channel distinct
  -- from wholesale MARKET_REFERENCE).
  price_type text check (price_type in
    ('PROJECT','SUPPLIER','DISTRIBUTOR','GOVERNMENT_REFERENCE','MARKET_REFERENCE','RETAIL')),
  spec_context text,
  -- region (§4.2: location level + province + regency + city)
  location_level text not null check (location_level in ('NATIONAL','PROVINCE','REGENCY','CITY')),
  province_name text,
  regency_name text,
  city_name text,
  -- effective date (§4.2: period)
  effective_from date not null,
  effective_to date,
  check (effective_to is null or effective_to >= effective_from),
  period_label text not null,
  recorded_at date not null default current_date,
  -- provenance (§4.3)
  source_key text not null,
  source_tier text not null check (source_tier in
    ('OFFICIAL_GOVERNMENT','OFFICIAL_PROJECT','VERIFIED_REGIONAL',
     'USER_IMPORTED_VERIFIED','PROJECT_INTERNAL_MASTER','COMMERCIAL_REFERENCE',
     'LEGACY_SUPERSEDED')),
  source_name text not null,
  source_type text,
  source_document text,
  source_url text,
  supplier text,
  source_record_id text,
  verification_status text not null default 'NEEDS_REVIEW'
    check (verification_status in ('VERIFIED','SOURCE_REPORTED','NEEDS_REVIEW')),
  match_method text,
  match_confidence numeric(3,2) check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  -- §4.3: original AHSP source price, preserved independently — NEVER
  -- overwritten by the master price.
  original_ahsp_source_price numeric(18,2) check (original_ahsp_source_price is null or original_ahsp_source_price >= 0),
  -- lifecycle (§3.3) + publication (§4.4)
  version integer not null default 1 check (version >= 1),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','SUPERSEDED','EXPIRED')),
  publication_status text not null default 'DRAFT'
    check (publication_status in ('DRAFT','PUBLISHED')),
  -- audit identity (NULL = honest no-auth; set server-side from auth.uid())
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- transient trigger inputs (cleared by the trigger after each write)
  change_reason text,
  change_operation text check (change_operation in
    ('CREATE','UPDATE','DEACTIVATE','PUBLISH','ROLLBACK')),
  change_affected_ahsp text[] not null default '{}',
  change_affected_projects text[] not null default '{}'
);
create index if not exists idx_master_price_records_resource
  on public.master_price_records (resource_id, status);
create index if not exists idx_master_price_records_source
  on public.master_price_records (source_key, source_tier);
create index if not exists idx_master_price_records_active
  on public.master_price_records (resource_id, unit, location_level)
  where status = 'ACTIVE';

-- ---------------------------------------------------------- price history --
-- §4.4 — append-only. No client INSERT/UPDATE/DELETE policies: rows
-- are written ONLY by the SECURITY DEFINER trigger below. SELECT is
-- open to authenticated users (transparency).
create table if not exists public.master_price_history (
  id uuid primary key default gen_random_uuid(),
  price_record_id text not null references public.master_price_records(id),
  resource_id text not null,
  operation text not null check (operation in
    ('CREATE','UPDATE','DEACTIVATE','PUBLISH','ROLLBACK')),
  previous_amount numeric(18,2),
  new_amount numeric(18,2),
  previous_unit text,
  new_unit text,
  previous_region jsonb,
  new_region jsonb,
  source_key text,
  source_tier text,
  source_document text,
  verification_status text,
  -- NULL = system/baseline write without an authenticated admin; never
  -- a fabricated identity (the trigger fills auth.uid() when present).
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  reason text not null check (char_length(reason) >= 10),
  affected_ahsp_references text[] not null default '{}',
  affected_live_price_projects text[] not null default '{}',
  publication_status text not null check (publication_status in
    ('DRAFT','PUBLISHED','ROLLED_BACK','SUPERSEDED')),
  previous_version integer,
  new_version integer not null,
  master_price_version text not null
);
create index if not exists idx_master_price_history_record
  on public.master_price_history (price_record_id, changed_at desc);
create index if not exists idx_master_price_history_resource
  on public.master_price_history (resource_id, changed_at desc);

-- --------------------------------------------------------------- aliases --
-- §3.1/§4.1 approved aliases. Anyone authenticated may PROPOSE
-- (status PENDING); only a global admin may APPROVE/REJECT — and never
-- their own proposal (anti-self-approval: CHECK + trigger, mirroring
-- price_assumptions).
create table if not exists public.master_price_aliases (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null references public.master_price_entities(resource_id),
  alias text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED')),
  proposed_by uuid not null references auth.users(id),
  proposed_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejected_by uuid references auth.users(id),
  rejected_at timestamptz,
  rejection_reason text,
  check (approved_by is null or approved_by != proposed_by),
  check (rejected_by is null or rejected_by != proposed_by),
  check (status != 'APPROVED' or approved_by is not null),
  check (status != 'APPROVED' or approved_at is not null),
  check (status != 'REJECTED' or rejected_by is not null),
  check (status != 'REJECTED' or rejected_at is not null),
  unique (resource_id, alias)
);
create index if not exists idx_master_price_aliases_resource
  on public.master_price_aliases (resource_id, status);

-- ---------------------------------------------------- AHSP version registry --
-- §8 version registry (registry only — version CONTENT lives in
-- versioned JSON snapshots per D4, never in this table). Included here
-- because §4.1 governs publication/rollback of AHSP versions too.
create table if not exists public.ahsp_database_versions (
  id text primary key,
  family text not null check (family in ('CIPTA_KARYA','BINA_MARGA','SDA','SMKK','OTHER')),
  name text not null,
  version_label text not null,
  base_version_id text references public.ahsp_database_versions(id),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','ACTIVE','SUPERSEDED')),
  source_document text,
  snapshot_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  note text,
  unique (family, version_label)
);
create index if not exists idx_ahsp_database_versions_family
  on public.ahsp_database_versions (family, status);

-- --------------------------------------- §13: content checksum (§8 §12.3) --
-- The FNV-1a 64-bit hex checksum (16 lowercase hex chars) of the
-- version's snapshot content, as computed by
-- computeAhspContentChecksum in
-- src/data/nationalCostDatabase/ahspVersioning.ts. The pointer-sync
-- CLI (scripts/ahsp2026/syncAhspVersionPointers.ts) upserts this
-- value per version; a mismatch between the row and the recomputed
-- snapshot checksum means the snapshot file was tampered with or
-- the pointer is stale. Nullable: versions synced before §13 have
-- no checksum until the next pointer sync. No CHECK on the format
-- (a CHECK would reject a future hash-algorithm migration); the
-- 16-hex format is documented here and enforced by the engine.
alter table public.ahsp_database_versions
  add column if not exists content_checksum text;
comment on column public.ahsp_database_versions.content_checksum is
  'MASTER PRICING §13 (§8 §12.3): FNV-1a 64-bit hex checksum (16 lowercase hex chars) of the version snapshot content. NULL until the first §13 pointer sync.';

-- -------------------------------------------- AHSP version history (§12) --
-- Append-only audit trail for AHSP version transitions, mirroring
-- `master_price_history`. The operation CHECK lists exactly the four
-- `AhspVersionOperation` values from
-- src/engine/pricing/admin/masterPriceAuthorization.ts (§12 — §11
-- BLOCKED #2). Rows are written by the admin API (server-side, as the
-- global admin); there is NO client INSERT/UPDATE/DELETE policy.
-- A direct edit of the ACTIVE version (EDIT_AHSP_ACTIVE, Mode A)
-- records the previous and new version labels: the edit is applied as
-- a NEW version, never a silent mutation of the active one.
create table if not exists public.ahsp_version_history (
  id uuid primary key default gen_random_uuid(),
  version_id text not null references public.ahsp_database_versions(id),
  family text not null check (family in ('CIPTA_KARYA','BINA_MARGA','SDA','SMKK','OTHER')),
  operation text not null check (operation in
    ('CLONE_AHSP_VERSION','PUBLISH_AHSP_VERSION','ROLLBACK_AHSP_VERSION','EDIT_AHSP_ACTIVE')),
  previous_status text,
  new_status text,
  previous_version_label text,
  new_version_label text,
  -- NULL = system/baseline write without an authenticated admin; never
  -- a fabricated identity.
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  reason text not null check (char_length(reason) >= 10),
  note text
);
create index if not exists idx_ahsp_version_history_version
  on public.ahsp_version_history (version_id, changed_at desc);
create index if not exists idx_ahsp_version_history_family
  on public.ahsp_version_history (family, changed_at desc);

-- ------------------------------------------------------------------- RLS --
alter table public.global_admins enable row level security;
alter table public.master_price_entities enable row level security;
alter table public.master_price_records enable row level security;
alter table public.master_price_history enable row level security;
alter table public.master_price_aliases enable row level security;
alter table public.ahsp_database_versions enable row level security;
alter table public.ahsp_version_history enable row level security;

-- global_admins: SELECT open (transparency — who the admins are is not
-- a secret); writes ONLY via the SECURITY DEFINER grant/revoke
-- functions (no client INSERT/UPDATE/DELETE policies at all).
create policy "global_admins_select" on public.global_admins for select to authenticated
  using (true);

-- entities: SELECT open; INSERT/UPDATE global admins only; NO DELETE.
create policy "master_price_entities_select" on public.master_price_entities for select to authenticated
  using (true);
create policy "master_price_entities_insert" on public.master_price_entities for insert to authenticated
  with check (public.ezrab_is_global_admin());
create policy "master_price_entities_update" on public.master_price_entities for update to authenticated
  using (public.ezrab_is_global_admin())
  with check (public.ezrab_is_global_admin());

-- records: SELECT open; INSERT/UPDATE global admins only; NO DELETE.
-- created_by must be the caller's own id (never a client-supplied identity).
create policy "master_price_records_select" on public.master_price_records for select to authenticated
  using (true);
create policy "master_price_records_insert" on public.master_price_records for insert to authenticated
  with check (public.ezrab_is_global_admin() and created_by = auth.uid());
create policy "master_price_records_update" on public.master_price_records for update to authenticated
  using (public.ezrab_is_global_admin())
  with check (public.ezrab_is_global_admin());

-- history: SELECT open; NO insert/update/delete policies for clients —
-- the trigger (SECURITY DEFINER) is the only writer.
create policy "master_price_history_select" on public.master_price_history for select to authenticated
  using (true);

-- aliases: SELECT open; INSERT = any authenticated user may PROPOSE
-- (PENDING, proposed_by = self); UPDATE = global admins only (approve /
-- reject; anti-self-approval in CHECK + trigger). NO DELETE.
create policy "master_price_aliases_select" on public.master_price_aliases for select to authenticated
  using (true);
create policy "master_price_aliases_insert" on public.master_price_aliases for insert to authenticated
  with check (proposed_by = auth.uid() and status = 'PENDING');
create policy "master_price_aliases_update" on public.master_price_aliases for update to authenticated
  using (public.ezrab_is_global_admin())
  with check (public.ezrab_is_global_admin());

-- AHSP versions: SELECT open; INSERT/UPDATE global admins only; NO DELETE.
create policy "ahsp_database_versions_select" on public.ahsp_database_versions for select to authenticated
  using (true);
create policy "ahsp_database_versions_insert" on public.ahsp_database_versions for insert to authenticated
  with check (public.ezrab_is_global_admin());
create policy "ahsp_database_versions_update" on public.ahsp_database_versions for update to authenticated
  using (public.ezrab_is_global_admin())
  with check (public.ezrab_is_global_admin());

-- AHSP version history: SELECT open; NO insert/update/delete policies
-- for clients — the admin API (server-side) is the only writer.
create policy "ahsp_version_history_select" on public.ahsp_version_history for select to authenticated
  using (true);

-- ------------------------------------------- record trigger: history + guard --
-- Enforces, server-side: reason required; version +1 per update; status
-- transitions; audit identity from auth.uid() (never client-supplied);
-- writes the §4.4 history row; clears the transient trigger inputs.
-- Mirrors price_assumption_transition_guard (20261012).
-- NOTE: the trigger stamps master_price_version '2026.1' (the current
-- MASTER_PRICE_VERSION). §8 (AHSP/version management) advances this
-- literal when a new master price version is published.
create or replace function public.master_price_record_history_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation text;
  v_pub_status text;
  v_region_old jsonb;
  v_region_new jsonb;
begin
  if TG_OP = 'INSERT' then
    if NEW.version <> 1 then
      raise exception 'New price record version must be 1, got %', NEW.version;
    end if;
    if char_length(coalesce(NEW.change_reason, '')) < 10 then
      raise exception 'change_reason is required (at least 10 characters) for a new master price record';
    end if;
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
    NEW.created_at := now();
    NEW.updated_at := now();
    v_operation := coalesce(NEW.change_operation, 'CREATE');
    if v_operation <> 'CREATE' then
      raise exception 'INSERT history operation must be CREATE, got %', v_operation;
    end if;
    v_pub_status := NEW.publication_status;
    v_region_new := jsonb_build_object(
      'level', NEW.location_level,
      'provinceName', NEW.province_name,
      'regencyName', NEW.regency_name,
      'cityName', NEW.city_name);
    insert into public.master_price_history
      (price_record_id, resource_id, operation,
       previous_amount, new_amount, previous_unit, new_unit,
       previous_region, new_region,
       source_key, source_tier, source_document, verification_status,
       changed_by, reason,
       affected_ahsp_references, affected_live_price_projects,
       publication_status, previous_version, new_version, master_price_version)
    values (
      NEW.id, NEW.resource_id, v_operation,
      null, NEW.amount, null, NEW.unit,
      null, v_region_new,
      NEW.source_key, NEW.source_tier, NEW.source_document, NEW.verification_status,
      auth.uid(), NEW.change_reason,
      NEW.change_affected_ahsp, NEW.change_affected_projects,
      v_pub_status, null, NEW.version, '2026.1');
    -- clear transient inputs (they are write-time only, never stored data)
    NEW.change_reason := null;
    NEW.change_operation := null;
    NEW.change_affected_ahsp := '{}';
    NEW.change_affected_projects := '{}';
    return NEW;
  end if;

  -- UPDATE ---------------------------------------------------------------
  if NEW.version <> OLD.version + 1 then
    raise exception 'Price record version must increment by exactly 1 (% → %), got %',
      OLD.version, OLD.version + 1, NEW.version;
  end if;
  -- status transitions: ACTIVE → SUPERSEDED/EXPIRED only; never back
  -- (a rollback is a NEW version with the old values, not a resurrection).
  if OLD.status <> NEW.status then
    if not (OLD.status = 'ACTIVE' and NEW.status in ('SUPERSEDED','EXPIRED')) then
      raise exception 'Invalid price record status transition % → %', OLD.status, NEW.status;
    end if;
  end if;
  if char_length(coalesce(NEW.change_reason, '')) < 10 then
    raise exception 'change_reason is required (at least 10 characters) for a master price change';
  end if;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  -- created_by / resource_id / id are immutable
  NEW.created_by := OLD.created_by;
  NEW.resource_id := OLD.resource_id;
  NEW.id := OLD.id;
  -- derive the operation (explicit change_operation wins — needed for
  -- ROLLBACK, which looks like an ordinary UPDATE to the trigger)
  if NEW.change_operation is not null then
    v_operation := NEW.change_operation;
  elsif OLD.status <> NEW.status then
    v_operation := 'DEACTIVATE';
  elsif OLD.publication_status = 'DRAFT' and NEW.publication_status = 'PUBLISHED' then
    v_operation := 'PUBLISH';
  else
    v_operation := 'UPDATE';
  end if;
  v_pub_status := case v_operation
    when 'PUBLISH' then 'PUBLISHED'
    when 'ROLLBACK' then 'ROLLED_BACK'
    when 'DEACTIVATE' then 'SUPERSEDED'
    else NEW.publication_status
  end;
  v_region_old := jsonb_build_object(
    'level', OLD.location_level,
    'provinceName', OLD.province_name,
    'regencyName', OLD.regency_name,
    'cityName', OLD.city_name);
  v_region_new := jsonb_build_object(
    'level', NEW.location_level,
    'provinceName', NEW.province_name,
    'regencyName', NEW.regency_name,
    'cityName', NEW.city_name);
  insert into public.master_price_history
    (price_record_id, resource_id, operation,
     previous_amount, new_amount, previous_unit, new_unit,
     previous_region, new_region,
     source_key, source_tier, source_document, verification_status,
     changed_by, reason,
     affected_ahsp_references, affected_live_price_projects,
     publication_status, previous_version, new_version, master_price_version)
  values (
    NEW.id, NEW.resource_id, v_operation,
    OLD.amount, NEW.amount, OLD.unit, NEW.unit,
    v_region_old, v_region_new,
    NEW.source_key, NEW.source_tier, NEW.source_document, NEW.verification_status,
    auth.uid(), NEW.change_reason,
    NEW.change_affected_ahsp, NEW.change_affected_projects,
    v_pub_status, OLD.version, NEW.version, '2026.1');
  NEW.change_reason := null;
  NEW.change_operation := null;
  NEW.change_affected_ahsp := '{}';
  NEW.change_affected_projects := '{}';
  return NEW;
end;
$$;

drop trigger if exists trg_master_price_record_history on public.master_price_records;
create trigger trg_master_price_record_history
  before insert or update on public.master_price_records
  for each row
  execute function public.master_price_record_history_guard();

-- ------------------------------------------- alias trigger: transition guard --
-- PENDING → APPROVED/REJECTED only; anti-self-approval (defense in
-- depth — also a CHECK constraint). Mirrors price_assumptions.
create or replace function public.master_price_alias_transition_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.status = 'PENDING' and NEW.status in ('APPROVED','REJECTED') then
    -- allowed
  elsif OLD.status = NEW.status then
    -- same-status updates allowed
  else
    raise exception 'Invalid alias transition % → %', OLD.status, NEW.status;
  end if;
  if NEW.status = 'APPROVED' and NEW.approved_by = OLD.proposed_by then
    raise exception 'Self-approval blocked: approver cannot be proposer';
  end if;
  if NEW.status = 'REJECTED' and NEW.rejected_by = OLD.proposed_by then
    raise exception 'Self-rejection blocked';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_master_price_alias_transition on public.master_price_aliases;
create trigger trg_master_price_alias_transition
  before update on public.master_price_aliases
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function public.master_price_alias_transition_guard();

-- ------------------------------------------- entity trigger: updated_at only --
create or replace function public.master_price_entity_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  return NEW;
end;
$$;

drop trigger if exists trg_master_price_entity_touch on public.master_price_entities;
create trigger trg_master_price_entity_touch
  before update on public.master_price_entities
  for each row
  execute function public.master_price_entity_touch();

-- ============================================================================
-- MASTER PRICING §13 — SYNCHRONIZATION ENGINE (server-side history + feed)
-- ============================================================================
-- The local counterparts live in src/engine/pricing/sync/:
--   syncHistory.ts (entry shape — the column names below mirror it),
--   priceChangeFeed.ts (feed format — the view below is its server
--   projection). The interim local trails are
--   data/price2026/reports/sync_history.jsonl and
--   data/price2026/reports/price_change_feed.jsonl.
-- This section is self-contained (table + RLS + view together) so the
-- §13 addition can be reviewed as one unit; the table is created here
-- (after the earlier RLS block) so its own RLS statements follow it.

-- ------------------------------------------------------------ sync history --
-- §13.4: one row per sync operation, all 13 fields. Append-only:
-- SELECT is open; there are NO client INSERT/UPDATE/DELETE policies
-- (rows are written only by the admin API / sync service, server-side,
-- as the global admin). `successful_operations` counts completed steps
-- for a price-change workflow, synced rows for a pipeline sync — the
-- meaning is per operation_type (see the §13 report).
create table if not exists public.sync_history (
  operation_id text primary key,
  schema_version integer not null default 1,
  operation_type text not null check (operation_type in
    ('FULL_RECONCILIATION','INCREMENTAL_SYNC','ADMIN_TRIGGERED_SYNC',
     'GLOBAL_PRICE_PROPAGATION','AHSP_VERSION_SYNC','DRY_RUN',
     'ROLLBACK','RECOVERY')),
  -- NULL = no authenticated admin (CLI/system run); never fabricated.
  initiated_by uuid references auth.users(id),
  source_entity text not null,
  previous_value numeric(18,2),
  new_value numeric(18,2),
  affected_ahsp_families text[] not null default '{}',
  affected_components text[] not null default '{}',
  affected_projects text[] not null default '{}',
  successful_operations integer not null default 0 check (successful_operations >= 0),
  failed_operations integer not null default 0 check (failed_operations >= 0),
  unresolved_conflicts text[] not null default '{}',
  completed_at timestamptz not null default now(),
  recovery_status text not null check (recovery_status in
    ('NOT_APPLICABLE','NOT_NEEDED','RECOVERED','ROLLBACK_APPLIED',
     'RECOVERY_FAILED','RECOVERY_PENDING'))
);
create index if not exists idx_sync_history_type_time
  on public.sync_history (operation_type, completed_at desc);
create index if not exists idx_sync_history_completed
  on public.sync_history (completed_at desc);

alter table public.sync_history enable row level security;
create policy "sync_history_select" on public.sync_history for select to authenticated
  using (true);

-- -------------------------------------------------------- price change feed --
-- Read projection over master_price_history: every price-changing
-- history row (CREATE / UPDATE / ROLLBACK), newest last (consumers
-- order by changed_at). This is the server-side counterpart of the
-- local price-change feed (§13) that §10 adoption reads "since a
-- pin". DEACTIVATE/PUBLISH rows are not price changes and are
-- excluded. NOTE: the server history carries no resource CODE (the
-- code lives in the pipeline's local feed, which is keyed by
-- code|unit); consumers that need the code join
-- master_price_records on price_record_id or read the local feed.
create or replace view public.price_change_feed as
select
  h.id as history_entry_id,
  h.resource_id,
  h.previous_amount as old_price,
  h.new_amount as new_price,
  h.new_unit as unit,
  h.changed_at,
  h.changed_by,
  h.reason,
  h.master_price_version,
  h.operation,
  'MASTER_PRICE_HISTORY'::text as source_kind
from public.master_price_history h
where h.operation in ('CREATE', 'UPDATE', 'ROLLBACK');
