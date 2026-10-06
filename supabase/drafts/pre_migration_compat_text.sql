-- DRAFT ONLY. DO NOT APPLY TO PRODUCTION.
-- Preconditions: direct PostgreSQL metadata proves public.projects.id is text.
-- Design: preserve the existing project ID; all project_id FKs remain text.

begin;

do $$
declare t text;
begin
  select data_type into t
  from information_schema.columns
  where table_schema = 'public' and table_name = 'projects' and column_name = 'id';
  if t is distinct from 'text' then
    raise exception 'TEXT branch refused: public.projects.id must be text; found %', coalesce(t, '<missing>');
  end if;
end $$;

-- Additive project attributes. created_by stays nullable until an approved backfill.
alter table public.projects add column if not exists client_name text;
alter table public.projects add column if not exists created_by uuid;
alter table public.projects add column if not exists updated_at timestamptz not null default now();

create table if not exists public.rab_documents (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  workspace_id uuid not null,
  legacy_id text,
  name text not null default 'RAB Utama',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id),
  unique (workspace_id, legacy_id)
);

create table if not exists public.rab_versions (
  id uuid primary key default gen_random_uuid(),
  rab_document_id uuid not null,
  project_id text not null,
  workspace_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'DRAFT',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (rab_document_id, version_number)
);

create table if not exists public.rab_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  rab_document_id uuid not null,
  project_id text not null,
  workspace_id uuid not null,
  item_number text, code text not null, description text not null,
  specification text, volume numeric not null check (volume >= 0), unit text not null,
  material_price numeric not null default 0, labor_price numeric not null default 0,
  equipment_price numeric not null default 0, unit_price numeric not null default 0,
  amount numeric not null default 0, ahsp_code text, ahsp_version text, ahsp_snapshot jsonb,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, legacy_id)
);

create table if not exists public.rab_item_components (
  id uuid primary key default gen_random_uuid(),
  rab_item_id uuid not null,
  component_type text not null check (component_type in ('MATERIAL','LABOR','EQUIPMENT','OTHER')),
  resource_code text not null, resource_name text not null, unit text not null,
  coefficient numeric not null default 0, unit_price numeric not null default 0,
  subtotal numeric not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rab_item_id, component_type, resource_code)
);

-- Add FKs only if absent; unexpected existing constraints must be reviewed first.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rab_documents_project_fk') then
    alter table public.rab_documents add constraint rab_documents_project_fk
      foreign key (project_id) references public.projects(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rab_versions_project_fk') then
    alter table public.rab_versions add constraint rab_versions_project_fk
      foreign key (project_id) references public.projects(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rab_items_project_fk') then
    alter table public.rab_items add constraint rab_items_project_fk
      foreign key (project_id) references public.projects(id) on delete cascade;
  end if;
end $$;

-- RLS/policies are intentionally not auto-created here. Existing policy names and
-- expressions must be inventoried first, then approved policies added idempotently.

-- Forward draft ends here. Run only after metadata, data, and policy preflight.
commit;

-- ROLLBACK PLAN (manual, after backup and reconciliation):
-- 1. Revoke new policies, if any were approved separately.
-- 2. Remove only newly-created RAB rows/tables after export and dependency review.
-- 3. Drop only columns proven unused: projects.client_name, projects.created_by.
-- Never cast or delete projects.id as part of rollback.
