-- Review against the live schema before applying. This migration is additive;
-- it does not drop data, tables, policies, or production users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Provider metadata is used only for a display name. Authorization never uses it.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do update
    set display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
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
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 500),
  location text, status text, progress numeric check (progress between 0 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create table if not exists public.project_members (
  project_id text not null, workspace_id uuid not null, user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade,
  foreign key (workspace_id, user_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null, project_id text,
  event_code text not null, request_id text, created_at timestamptz not null default now()
);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id, workspace_id);
create index if not exists project_members_user_idx on public.project_members(user_id, project_id);
create index if not exists projects_workspace_idx on public.projects(workspace_id, id);
create index if not exists audit_logs_actor_idx on public.audit_logs(user_id, created_at desc);
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.audit_logs enable row level security;
create policy "profiles_self_read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "workspace_members_self_read" on public.workspace_members for select to authenticated using (user_id = auth.uid());
create policy "project_members_self_read" on public.project_members for select to authenticated using (user_id = auth.uid());
create policy "workspaces_member_read" on public.workspaces for select to authenticated using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid()));
create policy "projects_member_read" on public.projects for select to authenticated using (exists (select 1 from public.project_members m where m.project_id = id and m.user_id = auth.uid()));
-- No browser policy exists for audit_logs: server-side service-role code writes it.
