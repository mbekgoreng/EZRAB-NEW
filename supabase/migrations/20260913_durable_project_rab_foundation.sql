-- EZRAB durable Project/RAB foundation. APPLY MANUALLY ONLY AFTER SCHEMA REVIEW.
-- The preflight intentionally aborts on an incompatible existing projects.id.
begin;
do $$
declare id_type text;
begin
  select data_type into id_type from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'id';
  if id_type is not null and id_type <> 'uuid' then
    raise exception 'EZRAB preflight: public.projects.id must be uuid; found %', id_type;
  end if;
end $$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), legacy_id text,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, client_name text, location text, status text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id)
);
alter table public.projects add column if not exists legacy_id text;
create unique index if not exists projects_workspace_legacy_uidx on public.projects(workspace_id, legacy_id) where legacy_id is not null;

create table if not exists public.rab_documents (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade, legacy_id text,
  name text not null default 'RAB Utama', created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id), unique (workspace_id, legacy_id)
);
create table if not exists public.rab_versions (
  id uuid primary key default gen_random_uuid(), rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number integer not null check (version_number > 0), status text not null default 'DRAFT',
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  unique (rab_document_id, version_number)
);
create table if not exists public.rab_items (
  id uuid primary key default gen_random_uuid(), legacy_id text,
  rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_number text, code text not null, description text not null, specification text,
  volume numeric not null check (volume >= 0), unit text not null,
  material_price numeric not null default 0, labor_price numeric not null default 0, equipment_price numeric not null default 0,
  unit_price numeric not null default 0, amount numeric not null default 0,
  ahsp_code text, ahsp_version text, ahsp_snapshot jsonb,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, legacy_id)
);
create table if not exists public.rab_item_components (
  id uuid primary key default gen_random_uuid(), rab_item_id uuid not null references public.rab_items(id) on delete cascade,
  component_type text not null check (component_type in ('MATERIAL','LABOR','EQUIPMENT','OTHER')),
  resource_code text not null, resource_name text not null, unit text not null,
  coefficient numeric not null default 0, unit_price numeric not null default 0, subtotal numeric not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (rab_item_id, component_type, resource_code)
);
create index if not exists rab_items_project_idx on public.rab_items(workspace_id, project_id, created_at);
create index if not exists rab_components_item_idx on public.rab_item_components(rab_item_id);

alter table public.rab_documents enable row level security;
alter table public.rab_versions enable row level security;
alter table public.rab_items enable row level security;
alter table public.rab_item_components enable row level security;
create policy "rab_documents_project_member_read" on public.rab_documents for select to authenticated using (exists (select 1 from public.project_members m where m.project_id = rab_documents.project_id and m.user_id = auth.uid()));
create policy "rab_versions_project_member_read" on public.rab_versions for select to authenticated using (exists (select 1 from public.project_members m where m.project_id = rab_versions.project_id and m.user_id = auth.uid()));
create policy "rab_items_project_member_read" on public.rab_items for select to authenticated using (exists (select 1 from public.project_members m where m.project_id = rab_items.project_id and m.user_id = auth.uid()));
create policy "rab_components_project_member_read" on public.rab_item_components for select to authenticated using (exists (select 1 from public.project_members m join public.rab_items i on i.project_id = m.project_id where i.id = rab_item_components.rab_item_id and m.user_id = auth.uid()));
commit;

-- Rollback: execute only after an approved backup and import reconciliation,
-- in reverse dependency order. No automatic rollback is performed by EZRAB.
