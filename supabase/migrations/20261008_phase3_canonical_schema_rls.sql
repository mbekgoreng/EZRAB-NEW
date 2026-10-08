-- ============================================================================
-- EZRAB Phase 3 — Canonical schema + Row Level Security (FRESH PROJECT ONLY)
-- ============================================================================
-- STATUS: NOT APPLIED to any live database (no Supabase project exists yet).
-- Review + apply manually in the Supabase SQL editor. Non-destructive by
-- design (CREATE TABLE IF NOT EXISTS, no DROPs), but intended for a fresh
-- project.
--
-- WHY THIS FILE EXISTS: the two 20260913 migrations conflict and were never
-- applied together:
--   * 20260913_auth_membership_foundation.sql defines public.projects(id TEXT)
--     and public.project_members(project_id TEXT)
--   * 20260913_durable_project_rab_foundation.sql ABORTS its preflight unless
--     public.projects.id is UUID, and its RAB policies compare
--     project_members.project_id (text) against rab_*.project_id (uuid) —
--     a type mismatch that would fail at apply time.
-- This migration is the reconciled canonical model (UUID everywhere) and
-- SUPERSEDES both files for new projects. Do NOT apply the 20260913 files
-- on top of this one.
--
-- COVERAGE: every table has SELECT + INSERT + UPDATE + DELETE policies.
-- Write access requires project membership; mutating RAB/cost data additionally
-- requires a workspace role of SUPER_ADMIN, ESTIMATOR, or EDITOR.
-- CLIENT and DIReksi roles are read-only. All policies use auth.uid() —
-- never a client-supplied userId.
-- ============================================================================

-- ---------------------------------------------------------------- helpers --
create or replace function public.ezrab_is_workspace_member(ws_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
) $$;

create or replace function public.ezrab_workspace_role(ws_id uuid)
returns text
language sql stable security definer set search_path = public
as $$ select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid() limit 1 $$;

create or replace function public.ezrab_is_project_member(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.project_members
  where project_id = p_id and user_id = auth.uid()
) $$;

create or replace function public.ezrab_can_write_project(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    join public.workspace_members wm
      on wm.workspace_id = pm.workspace_id and wm.user_id = pm.user_id
    where pm.project_id = p_id
      and pm.user_id = auth.uid()
      and wm.role in ('SUPER_ADMIN', 'ESTIMATOR', 'EDITOR')
  )
$$;

-- ---------------------------------------------------------------- tables --
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('SUPER_ADMIN','ESTIMATOR','DIREKSI','CLIENT','EDITOR')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null check (char_length(name) between 1 and 500),
  client_name text, location text, status text,
  progress numeric check (progress between 0 and 100),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id)
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id) on delete cascade
);

create table if not exists public.rab_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null default 'RAB Utama',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id), unique (workspace_id, legacy_id)
);

create table if not exists public.rab_versions (
  id uuid primary key default gen_random_uuid(),
  rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'DRAFT',
  snapshot jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (rab_document_id, version_number)
);

create table if not exists public.rab_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  rab_document_id uuid not null references public.rab_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_number text, code text not null, description text not null, specification text,
  volume numeric not null check (volume >= 0), unit text not null,
  material_price numeric not null default 0, labor_price numeric not null default 0,
  equipment_price numeric not null default 0,
  unit_price numeric not null default 0, amount numeric not null default 0,
  -- Phase 2 integrity: unresolved prices are explicit, never silent Rp0
  price_status text not null default 'PRICE_RESOLVED'
    check (price_status in ('PRICE_RESOLVED','PRICE_UNRESOLVED','PRICE_ESTIMATED','PRICE_MANUAL')),
  verification_status text,
  ahsp_code text, ahsp_version text, ahsp_snapshot jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, legacy_id)
);

create table if not exists public.rab_item_components (
  id uuid primary key default gen_random_uuid(),
  rab_item_id uuid not null references public.rab_items(id) on delete cascade,
  component_type text not null check (component_type in ('MATERIAL','LABOR','EQUIPMENT','OTHER')),
  resource_code text not null, resource_name text not null, unit text not null,
  coefficient numeric not null default 0, unit_price numeric not null default 0,
  subtotal numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (rab_item_id, component_type, resource_code)
);

-- Phase 3: tables referenced by app code but missing from earlier migrations
create table if not exists public.ded_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_name text, source_hash text,
  result jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.qto_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  calculator_id text, description text,
  inputs jsonb not null default '{}'::jsonb,
  quantity numeric, unit text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  description text not null, category text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.estimate_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  label text, snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create table if not exists public.price_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  resource_key text not null,
  override_price numeric not null check (override_price >= 0),
  reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, resource_key)
);

create table if not exists public.schedule_tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, start_date date, end_date date,
  progress numeric check (progress between 0 and 100),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  event_code text not null, request_id text,
  created_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id, workspace_id);
create index if not exists project_members_user_idx on public.project_members(user_id, project_id);
create index if not exists projects_workspace_idx on public.projects(workspace_id, id);
create index if not exists rab_items_project_idx on public.rab_items(workspace_id, project_id, created_at);
create index if not exists rab_components_item_idx on public.rab_item_components(rab_item_id);
create index if not exists audit_logs_actor_idx on public.audit_logs(user_id, created_at desc);

-- ------------------------------------------------------- profile trigger --
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- ------------------------------------------------------------- RLS on ---
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.rab_documents enable row level security;
alter table public.rab_versions enable row level security;
alter table public.rab_items enable row level security;
alter table public.rab_item_components enable row level security;
alter table public.ded_analyses enable row level security;
alter table public.qto_items enable row level security;
alter table public.work_items enable row level security;
alter table public.estimate_versions enable row level security;
alter table public.price_overrides enable row level security;
alter table public.schedule_tasks enable row level security;
alter table public.audit_logs enable row level security;

-- ============================================================ POLICIES ==
-- Convention: SELECT for members; INSERT/UPDATE/DELETE additionally require
-- a write role (SUPABASE-independent check via workspace_members).
-- _self tables (profiles) are restricted to the owner row.

-- profiles
create policy "profiles_self_select" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles_self_update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- workspaces
create policy "workspaces_member_select" on public.workspaces for select to authenticated
  using (public.ezrab_is_workspace_member(id));
create policy "workspaces_member_insert" on public.workspaces for insert to authenticated
  with check (true);
create policy "workspaces_admin_update" on public.workspaces for update to authenticated
  using (public.ezrab_workspace_role(id) = 'SUPER_ADMIN')
  with check (public.ezrab_workspace_role(id) = 'SUPER_ADMIN');
create policy "workspaces_admin_delete" on public.workspaces for delete to authenticated
  using (public.ezrab_workspace_role(id) = 'SUPER_ADMIN');

-- workspace_members (read own membership; admins manage)
create policy "workspace_members_self_select" on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or public.ezrab_is_workspace_member(workspace_id));
create policy "workspace_members_admin_write" on public.workspace_members for insert to authenticated
  with check (public.ezrab_workspace_role(workspace_id) = 'SUPER_ADMIN');
create policy "workspace_members_admin_delete" on public.workspace_members for delete to authenticated
  using (public.ezrab_workspace_role(workspace_id) = 'SUPER_ADMIN');

-- projects
create policy "projects_member_select" on public.projects for select to authenticated
  using (public.ezrab_is_project_member(id));
create policy "projects_member_insert" on public.projects for insert to authenticated
  with check (public.ezrab_is_workspace_member(workspace_id));
create policy "projects_writer_update" on public.projects for update to authenticated
  using (public.ezrab_can_write_project(id))
  with check (public.ezrab_can_write_project(id));
create policy "projects_writer_delete" on public.projects for delete to authenticated
  using (public.ezrab_can_write_project(id));

-- project_members
create policy "project_members_member_select" on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.ezrab_is_project_member(project_id));
create policy "project_members_writer_insert" on public.project_members for insert to authenticated
  with check (public.ezrab_can_write_project(project_id));
create policy "project_members_writer_delete" on public.project_members for delete to authenticated
  using (public.ezrab_can_write_project(project_id));

-- RAB + related: read for members, write for write-roles
create policy "rab_documents_member_select" on public.rab_documents for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "rab_documents_writer_write" on public.rab_documents for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

create policy "rab_versions_member_select" on public.rab_versions for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "rab_versions_writer_write" on public.rab_versions for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

create policy "rab_items_member_select" on public.rab_items for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "rab_items_writer_write" on public.rab_items for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

create policy "rab_components_member_select" on public.rab_item_components for select to authenticated
  using (exists (
    select 1 from public.rab_items i
    where i.id = rab_item_components.rab_item_id
      and public.ezrab_is_project_member(i.project_id)
  ));
create policy "rab_components_writer_write" on public.rab_item_components for all to authenticated
  using (exists (
    select 1 from public.rab_items i
    where i.id = rab_item_components.rab_item_id
      and public.ezrab_can_write_project(i.project_id)
  ))
  with check (exists (
    select 1 from public.rab_items i
    where i.id = rab_item_components.rab_item_id
      and public.ezrab_can_write_project(i.project_id)
  ));

-- DED / QTO / work items / versions / overrides / schedule: same pattern
create policy "ded_analyses_member_select" on public.ded_analyses for select to authenticated
  using (project_id is null or public.ezrab_is_project_member(project_id));
create policy "ded_analyses_writer_write" on public.ded_analyses for all to authenticated
  using (project_id is null or public.ezrab_can_write_project(project_id))
  with check (project_id is null or public.ezrab_can_write_project(project_id));

create policy "qto_items_member_select" on public.qto_items for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "qto_items_writer_write" on public.qto_items for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

create policy "work_items_member_select" on public.work_items for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "work_items_writer_write" on public.work_items for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

create policy "estimate_versions_member_select" on public.estimate_versions for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "estimate_versions_writer_write" on public.estimate_versions for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

create policy "price_overrides_member_select" on public.price_overrides for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "price_overrides_writer_write" on public.price_overrides for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

create policy "schedule_tasks_member_select" on public.schedule_tasks for select to authenticated
  using (public.ezrab_is_project_member(project_id));
create policy "schedule_tasks_writer_write" on public.schedule_tasks for all to authenticated
  using (public.ezrab_can_write_project(project_id))
  with check (public.ezrab_can_write_project(project_id));

-- audit_logs: no browser policies — service-role server code writes it.
-- (Deliberately no CREATE POLICY for audit_logs: deny-by-default.)

-- ============================================================================
-- ROLLBACK (manual, after approved backup): drop policies, then tables in
-- reverse dependency order. No automatic rollback is performed by EZRAB.
-- ============================================================================
