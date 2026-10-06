-- DRAFT ONLY. DO NOT APPLY TO PRODUCTION.
-- Preconditions: direct PostgreSQL metadata proves public.projects.id is uuid.
-- Design: UUID is canonical for existing and new project references.

begin;

do $$
declare t text;
begin
  select data_type into t
  from information_schema.columns
  where table_schema = 'public' and table_name = 'projects' and column_name = 'id';
  if t is distinct from 'uuid' then
    raise exception 'UUID branch refused: public.projects.id must be uuid; found %', coalesce(t, '<missing>');
  end if;
end $$;

-- Additive only. created_by remains nullable until a separately approved backfill.
alter table public.projects add column if not exists legacy_id text;
alter table public.projects add column if not exists client_name text;
alter table public.projects add column if not exists created_by uuid;
alter table public.projects add column if not exists updated_at timestamptz not null default now();

create table if not exists public.rab_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null,
  legacy_id text,
  name text not null default 'RAB Utama',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id), unique (workspace_id, legacy_id)
);

create table if not exists public.rab_versions (
  id uuid primary key default gen_random_uuid(),
  rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null, version_number integer not null check (version_number > 0),
  status text not null default 'DRAFT', created_by uuid,
  created_at timestamptz not null default now(), unique (rab_document_id, version_number)
);

create table if not exists public.rab_items (
  id uuid primary key default gen_random_uuid(), legacy_id text,
  rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null, item_number text, code text not null, description text not null,
  specification text, volume numeric not null check (volume >= 0), unit text not null,
  material_price numeric not null default 0, labor_price numeric not null default 0,
  equipment_price numeric not null default 0, unit_price numeric not null default 0,
  amount numeric not null default 0, ahsp_code text, ahsp_version text, ahsp_snapshot jsonb,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, legacy_id)
);

create table if not exists public.rab_item_components (
  id uuid primary key default gen_random_uuid(), rab_item_id uuid not null references public.rab_items(id) on delete cascade,
  component_type text not null check (component_type in ('MATERIAL','LABOR','EQUIPMENT','OTHER')),
  resource_code text not null, resource_name text not null, unit text not null,
  coefficient numeric not null default 0, unit_price numeric not null default 0,
  subtotal numeric not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (rab_item_id, component_type, resource_code)
);

-- Do not add NOT NULL to created_by until the backfill query has zero nulls and
-- every value is a valid profile. Do not auto-create RLS policies before inventory.

commit;

-- ROLLBACK PLAN (manual, after backup and reconciliation):
-- 1. Revoke new policies, if any were approved separately.
-- 2. Export and remove newly-created RAB data/tables in reverse dependency order.
-- 3. Drop only unused additive columns and indexes after dependency review.
-- Never cast, replace, or delete public.projects.id as part of rollback.
