-- DRAFT ONLY. DO NOT APPLY.
-- Compatibility candidate for a staging schema where public.projects.id is text.
-- Never run against production. Never change public.projects.id.
-- This draft intentionally stops on unexpected existing objects.

begin;

do $$
declare v text; begin
  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='projects' and column_name='id';
  if v is distinct from 'text' then
    raise exception 'compatibility preflight: projects.id must be text; found %', coalesce(v,'<missing>');
  end if;

  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='profiles' and column_name='id';
  if v is distinct from 'uuid' then
    raise exception 'compatibility preflight: profiles.id must be uuid; found %', coalesce(v,'<missing>');
  end if;

  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='workspaces' and column_name='id';
  if v is distinct from 'uuid' then
    raise exception 'compatibility preflight: workspaces.id must be uuid; found %', coalesce(v,'<missing>');
  end if;

  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='project_members' and column_name='project_id';
  if v is distinct from 'text' then
    raise exception 'compatibility preflight: project_members.project_id must be text; found %', coalesce(v,'<missing>');
  end if;

  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='projects' and column_name='workspace_id';
  if v is distinct from 'uuid' then
    raise exception 'compatibility preflight: projects.workspace_id must be uuid; found %', coalesce(v,'<missing>');
  end if;

  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='project_members' and column_name='workspace_id';
  if v is distinct from 'uuid' then
    raise exception 'compatibility preflight: project_members.workspace_id must be uuid; found %', coalesce(v,'<missing>');
  end if;

  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='project_members' and column_name='user_id';
  if v is distinct from 'uuid' then
    raise exception 'compatibility preflight: project_members.user_id must be uuid; found %', coalesce(v,'<missing>');
  end if;

  for v in select column_name from information_schema.columns
           where table_schema='public' and table_name='projects'
             and column_name in ('legacy_id','client_name','created_by') loop
    if v = 'created_by' then
      select data_type into v from information_schema.columns
       where table_schema='public' and table_name='projects' and column_name='created_by';
      if v is distinct from 'uuid' then
        raise exception 'compatibility preflight: existing projects.created_by must be uuid; found %', coalesce(v,'<missing>');
      end if;
    elsif v in ('legacy_id','client_name') then
      -- Both additive attributes are text in the compatible contract.
      if (select data_type from information_schema.columns
          where table_schema='public' and table_name='projects' and column_name=v) is distinct from 'text' then
        raise exception 'compatibility preflight: existing projects.% must be text', v;
      end if;
    end if;
  end loop;
end $$;

-- Additive project attributes. Existing projects remain valid while created_by is mapped.
alter table public.projects add column if not exists legacy_id text;
alter table public.projects add column if not exists client_name text;
alter table public.projects add column if not exists created_by uuid;

-- Do not add NOT NULL here. Backfill created_by from an approved project-owner mapping first.
do $$ begin
  if exists (select 1 from pg_constraint
             where conrelid='public.projects'::regclass
               and conname='projects_created_by_profiles_fk') then
    raise exception 'constraint name projects_created_by_profiles_fk already exists on projects; inspect it before continuing';
  else
    if exists (select 1 from public.projects p left join public.profiles f on f.id=p.created_by
               where p.created_by is not null and f.id is null) then
      raise exception 'created_by contains orphan profile IDs; FK not added';
    end if;
    alter table public.projects add constraint projects_created_by_profiles_fk
      foreign key (created_by) references public.profiles(id);
  end if;
end $$;

-- Refuse legacy index creation until the live index/constraint inventory is approved.
-- The duplicate check is evidence only; it does not make an existing index safe.
do $$ begin
  if exists (select 1 from public.projects
             where legacy_id is not null
             group by workspace_id, legacy_id having count(*) > 1) then
    raise exception 'duplicate (workspace_id, legacy_id) values exist';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname='projects_workspace_legacy_uidx') then
    raise exception 'index name projects_workspace_legacy_uidx already exists; inspect definition before continuing';
  end if;
end $$;
-- DEFERRED STATEMENT (requires metadata approval):
-- create unique index projects_workspace_legacy_uidx
--   on public.projects(workspace_id, legacy_id) where legacy_id is not null;

-- Do not let CREATE TABLE IF NOT EXISTS silently accept an unreviewed existing table.
do $$ begin
  if to_regclass('public.rab_documents') is not null
     or to_regclass('public.rab_versions') is not null
     or to_regclass('public.rab_items') is not null
     or to_regclass('public.rab_item_components') is not null then
    raise exception 'one or more RAB tables already exist; inspect columns, constraints, indexes, RLS, and policies first';
  end if;
end $$;

-- New RAB entities use UUID IDs; project_id deliberately remains text.
create table public.rab_documents (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text, name text not null default 'RAB Utama',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id), unique(workspace_id, legacy_id)
);

create table public.rab_versions (
  id uuid primary key default gen_random_uuid(),
  rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number integer not null check(version_number > 0), status text not null default 'DRAFT',
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique(rab_document_id, version_number)
);

create table public.rab_items (
  id uuid primary key default gen_random_uuid(), legacy_id text,
  rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_number text, code text not null, description text not null, specification text,
  volume numeric not null check(volume >= 0), unit text not null,
  material_price numeric not null default 0, labor_price numeric not null default 0,
  equipment_price numeric not null default 0, unit_price numeric not null default 0,
  amount numeric not null default 0, ahsp_code text, ahsp_version text, ahsp_snapshot jsonb,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id, legacy_id)
);

create table public.rab_item_components (
  id uuid primary key default gen_random_uuid(),
  rab_item_id uuid not null references public.rab_items(id) on delete cascade,
  component_type text not null check(component_type in ('MATERIAL','LABOR','EQUIPMENT','OTHER')),
  resource_code text not null, resource_name text not null, unit text not null,
  coefficient numeric not null default 0, unit_price numeric not null default 0,
  subtotal numeric not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rab_item_id, component_type, resource_code)
);

-- Existing RAB tables are not silently reconciled by CREATE TABLE IF NOT EXISTS.
-- Before applying to a database where any RAB table already exists, export and
-- compare every column, FK, unique constraint, index, RLS flag, and policy.
-- Add created_by -> profiles(id) FKs only after orphan checks and approved backfill.
-- Add RLS/policies only after pg_policies inventory; do not replace same-name policies.

commit;

-- MANUAL ROLLBACK PLAN (not executable automatically):
-- 1. Restore from approved backup or remove new RAB rows/tables in reverse dependency order.
-- 2. Remove only the new legacy index/constraints after dependency review.
-- 3. Drop projects.created_by/client_name/legacy_id only if proven unused.
-- 4. Never cast, delete, rename, or replace projects.id.
