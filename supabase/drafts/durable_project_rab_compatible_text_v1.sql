-- DRAFT ONLY: durable_project_rab_compatible_text_v1.sql
-- DO NOT APPLY. This file is for human SQL review only.
-- No existing table, applied migration, projects.id, legacy_id, or auth foundation is changed.
-- project_id remains text; workspace_id remains uuid.
--
-- Atomic concurrency contract:
--   API performs UPDATE ... WHERE id = ? AND project_id = ? AND workspace_id = ?
--   AND revision = expected_revision, and checks affected-row count.
--   A zero-row stale result is HTTP 409 CONCURRENCY_CONFLICT.
--   The trigger below rejects client-supplied revision changes and advances revision
--   server-side, so revision is not client-controlled.
--
-- Lifecycle contract:
--   DRAFT -> FINAL; FINAL -> ARCHIVED; no other status transitions.
--   FINAL and ARCHIVED business rows are immutable.
--   A new version must reference a FINAL source_version_id.
--
-- RLS contract:
--   auth.uid(), workspace_members, project_members, project_id, and workspace_id
--   are required for every user-path policy. CLIENT/DIREKSI receive no RAB policy
--   in phase one. Service-role access is not evidence of user-path RLS.

begin;

-- Fail closed before any object creation. Existing RAB objects are never reconciled.
do $$
begin
  if to_regclass('public.rab_documents') is not null
     or to_regclass('public.rab_versions') is not null
     or to_regclass('public.rab_items') is not null
     or to_regclass('public.rab_item_components') is not null then
    raise exception 'preflight: one or more RAB tables already exist; manual review required';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='projects'
      and column_name='id' and data_type='text' and is_nullable='NO'
  ) then
    raise exception 'preflight: public.projects.id must be existing NOT NULL text';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='projects'
      and column_name='workspace_id' and data_type='uuid' and is_nullable='NO'
  ) then
    raise exception 'preflight: public.projects.workspace_id must be existing NOT NULL uuid';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='id' and data_type='uuid' and is_nullable='NO'
  ) then
    raise exception 'preflight: public.profiles.id must be existing NOT NULL uuid';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='workspaces'
      and column_name='id' and data_type='uuid' and is_nullable='NO'
  ) then
    raise exception 'preflight: public.workspaces.id must be existing NOT NULL uuid';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='project_members'
      and column_name='project_id' and data_type='text' and is_nullable='NO'
  ) then
    raise exception 'preflight: project_members.project_id must be existing NOT NULL text';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='project_members'
      and column_name='workspace_id' and data_type='uuid' and is_nullable='NO'
  ) then
    raise exception 'preflight: project_members.workspace_id must be existing NOT NULL uuid';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='projects_id_workspace_id_key'
      and conrelid='public.projects'::regclass
  ) then
    raise exception 'preflight: required existing projects(id, workspace_id) unique key is missing';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in (
        'ezrab_v1_rab_documents_project_uq',
        'ezrab_v1_rab_documents_scope_uq',
        'ezrab_v1_rab_versions_document_version_uq',
        'ezrab_v1_rab_versions_draft_uq',
        'ezrab_v1_rab_versions_scope_uq',
        'ezrab_v1_rab_items_scope_idx',
        'ezrab_v1_rab_items_version_idx',
        'ezrab_v1_rab_components_item_idx'
      )
  ) then
    raise exception 'preflight: proposed index name already exists';
  end if;

  if exists (
    select 1 from pg_constraint
    where conname in (
      'ezrab_v1_rab_documents_pkey',
      'ezrab_v1_rab_documents_project_fk',
      'ezrab_v1_rab_documents_workspace_fk',
      'ezrab_v1_rab_versions_pkey',
      'ezrab_v1_rab_versions_document_fk',
      'ezrab_v1_rab_versions_project_fk',
      'ezrab_v1_rab_versions_source_fk',
      'ezrab_v1_rab_items_pkey',
      'ezrab_v1_rab_items_version_fk',
      'ezrab_v1_rab_items_project_fk',
      'ezrab_v1_rab_items_created_by_fk',
      'ezrab_v1_rab_components_pkey',
      'ezrab_v1_rab_components_item_fk',
      'ezrab_v1_rab_components_uq',
      'ezrab_v1_rab_documents_created_by_fk',
      'ezrab_v1_rab_versions_created_by_fk',
      'ezrab_v1_rab_versions_document_version_uq',
      'ezrab_v1_rab_versions_scope_uq'
    )
  ) then
    raise exception 'preflight: proposed constraint name already exists';
  end if;

  if exists (
    select 1 from pg_policies
    where policyname like 'ezrab_v1_%'
  ) then
    raise exception 'preflight: proposed policy namespace is already in use';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('ezrab_v1_guard_rab_lifecycle','ezrab_v1_guard_rab_revision')
  ) then
    raise exception 'preflight: proposed function name already exists';
  end if;

  if exists (
    select 1 from pg_trigger t
    where t.tgname in (
      'ezrab_v1_rab_versions_lifecycle',
      'ezrab_v1_rab_items_lifecycle',
      'ezrab_v1_rab_components_lifecycle',
      'ezrab_v1_rab_versions_revision',
      'ezrab_v1_rab_items_revision'
    )
  ) then
    raise exception 'preflight: proposed trigger name already exists';
  end if;
end $$;

create table public.rab_documents (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  workspace_id uuid not null,
  name text not null default 'RAB Utama',
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ezrab_v1_rab_documents_project_fk
    foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade,
  constraint ezrab_v1_rab_documents_workspace_fk
    foreign key (workspace_id) references public.workspaces (id),
  constraint ezrab_v1_rab_documents_project_uq unique (project_id, workspace_id),
  constraint ezrab_v1_rab_documents_scope_uq unique (id, project_id, workspace_id),
  constraint ezrab_v1_rab_documents_created_by_fk
    foreign key (created_by) references public.profiles (id)
);

create table public.rab_versions (
  id uuid primary key default gen_random_uuid(),
  rab_document_id uuid not null,
  project_id text not null,
  workspace_id uuid not null,
  source_version_id uuid null,
  version_number integer not null check (version_number > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','FINAL','ARCHIVED')),
  revision bigint not null default 1 check (revision >= 1),
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ezrab_v1_rab_versions_document_fk
    foreign key (rab_document_id, project_id, workspace_id)
    references public.rab_documents (id, project_id, workspace_id)
    on delete cascade,
  constraint ezrab_v1_rab_versions_project_fk
    foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id)
    on delete cascade,
  constraint ezrab_v1_rab_versions_source_fk
    foreign key (source_version_id)
    references public.rab_versions (id),
  constraint ezrab_v1_rab_versions_created_by_fk
    foreign key (created_by) references public.profiles (id),
  constraint ezrab_v1_rab_versions_document_version_uq
    unique (rab_document_id, version_number),
  constraint ezrab_v1_rab_versions_scope_uq
    unique (id, project_id, workspace_id)
);

create unique index ezrab_v1_rab_versions_draft_uq
  on public.rab_versions (rab_document_id)
  where status = 'DRAFT';

create table public.rab_items (
  id uuid primary key default gen_random_uuid(),
  rab_version_id uuid not null,
  project_id text not null,
  workspace_id uuid not null,
  item_number text null,
  code text not null,
  description text not null,
  specification text null,
  volume numeric not null check (volume >= 0),
  unit text not null,
  material_price numeric not null default 0 check (material_price >= 0),
  labor_price numeric not null default 0 check (labor_price >= 0),
  equipment_price numeric not null default 0 check (equipment_price >= 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  amount numeric not null default 0 check (amount >= 0),
  ahsp_code text null,
  ahsp_version text null,
  ahsp_snapshot jsonb null,
  revision bigint not null default 1 check (revision >= 1),
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ezrab_v1_rab_items_version_fk
    foreign key (rab_version_id, project_id, workspace_id)
    references public.rab_versions (id, project_id, workspace_id)
    on delete cascade,
  constraint ezrab_v1_rab_items_created_by_fk
    foreign key (created_by) references public.profiles (id)
);

create index ezrab_v1_rab_items_scope_idx
  on public.rab_items (workspace_id, project_id, updated_at);
create index ezrab_v1_rab_items_version_idx
  on public.rab_items (rab_version_id, item_number);

create table public.rab_item_components (
  id uuid primary key default gen_random_uuid(),
  rab_item_id uuid not null,
  component_type text not null
    check (component_type in ('MATERIAL','LABOR','EQUIPMENT','OTHER')),
  resource_code text not null,
  resource_name text not null,
  unit text not null,
  coefficient numeric not null default 0 check (coefficient >= 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  subtotal numeric not null default 0 check (subtotal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ezrab_v1_rab_components_item_fk
    foreign key (rab_item_id) references public.rab_items (id)
    on delete cascade,
  constraint ezrab_v1_rab_components_uq
    unique (rab_item_id, component_type, resource_code)
);

create index ezrab_v1_rab_components_item_idx
  on public.rab_item_components (rab_item_id);

create function public.ezrab_v1_guard_rab_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare parent_status text;
declare source_status text;
declare source_doc uuid;
declare source_project text;
declare source_workspace uuid;
declare source_version integer;
begin
  if tg_op = 'INSERT' and tg_table_name = 'rab_versions' then
    new.revision := 1;
    if new.status <> 'DRAFT' then
      raise exception 'new versions must start as DRAFT';
    end if;
    if new.version_number = 1 then
      if new.source_version_id is not null then
        raise exception 'initial version cannot have source_version_id';
      end if;
    else
      if new.source_version_id is null then
        raise exception 'new version must reference a FINAL source_version_id';
      end if;
      select status, rab_document_id, project_id, workspace_id, version_number
        into source_status, source_doc, source_project, source_workspace, source_version
        from public.rab_versions where id = new.source_version_id;
      if source_status is distinct from 'FINAL'
         or source_doc is distinct from new.rab_document_id
         or source_project is distinct from new.project_id
         or source_workspace is distinct from new.workspace_id
         or new.version_number <> source_version + 1 then
        raise exception 'new version source must be matching FINAL predecessor';
      end if;
    end if;
  elsif tg_op = 'INSERT' and tg_table_name = 'rab_items' then
    new.revision := 1;
    select status into parent_status from public.rab_versions where id = new.rab_version_id;
    if parent_status is distinct from 'DRAFT' then
      raise exception 'items can only be inserted into a DRAFT version';
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'rab_versions' then
    if old.status = 'ARCHIVED' or (old.status = 'FINAL' and new.status <> 'ARCHIVED') then
      raise exception 'FINAL/ARCHIVED version is immutable';
    end if;
    if old.status = 'DRAFT' and new.status not in ('DRAFT','FINAL') then
      raise exception 'DRAFT may transition only to DRAFT or FINAL';
    end if;
    if old.status = 'FINAL' and new.status = 'ARCHIVED' then
      null;
    end if;
    if new.rab_document_id <> old.rab_document_id
       or new.project_id <> old.project_id
       or new.workspace_id <> old.workspace_id then
      raise exception 'version parent and tenant scope are immutable';
    end if;
    if new.revision <> old.revision then
      raise exception 'revision is database-controlled';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
  elsif tg_op = 'UPDATE' and tg_table_name = 'rab_items' then
    select status into parent_status from public.rab_versions where id = old.rab_version_id;
    if parent_status is distinct from 'DRAFT' then
      raise exception 'items in FINAL/ARCHIVED versions are immutable';
    end if;
    if new.rab_version_id <> old.rab_version_id
       or new.project_id <> old.project_id
       or new.workspace_id <> old.workspace_id then
      raise exception 'item parent and tenant scope are immutable';
    end if;
    if new.revision <> old.revision then
      raise exception 'revision is database-controlled';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
  elsif tg_op in ('INSERT','UPDATE') and tg_table_name = 'rab_item_components' then
    select v.status into parent_status
      from public.rab_items i join public.rab_versions v on v.id=i.rab_version_id
      where i.id = coalesce(new.rab_item_id, old.rab_item_id);
    if parent_status is distinct from 'DRAFT' then
      raise exception 'components require a DRAFT version';
    end if;
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  end if;
  return new;
end;
$$;

create function public.ezrab_v1_guard_rab_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and tg_table_name in ('rab_versions','rab_items') then
    new.revision := 1;
  end if;
  return new;
end;
$$;

create trigger ezrab_v1_rab_versions_lifecycle
  before insert or update on public.rab_versions
  for each row execute function public.ezrab_v1_guard_rab_lifecycle();
create trigger ezrab_v1_rab_items_lifecycle
  before insert or update on public.rab_items
  for each row execute function public.ezrab_v1_guard_rab_lifecycle();
create trigger ezrab_v1_rab_components_lifecycle
  before insert or update on public.rab_item_components
  for each row execute function public.ezrab_v1_guard_rab_lifecycle();
create trigger ezrab_v1_rab_versions_revision
  before insert on public.rab_versions
  for each row execute function public.ezrab_v1_guard_rab_revision();
create trigger ezrab_v1_rab_items_revision
  before insert on public.rab_items
  for each row execute function public.ezrab_v1_guard_rab_revision();

alter table public.rab_documents enable row level security;
alter table public.rab_versions enable row level security;
alter table public.rab_items enable row level security;
alter table public.rab_item_components enable row level security;

-- Policies intentionally use a unique namespace and are not idempotent.
create policy ezrab_v1_documents_select on public.rab_documents
  for select to authenticated
  using (
    exists (select 1 from public.workspace_members wm
            where wm.workspace_id = rab_documents.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR'))
    and exists (select 1 from public.project_members pm
                where pm.project_id = rab_documents.project_id
                  and pm.workspace_id = rab_documents.workspace_id
                  and pm.user_id = auth.uid())
  );

create policy ezrab_v1_documents_insert on public.rab_documents
  for insert to authenticated
  with check (
    (created_by is null or created_by = auth.uid())
    and exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_documents.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR'))
    and exists (select 1 from public.project_members pm where pm.project_id=rab_documents.project_id and pm.workspace_id=rab_documents.workspace_id and pm.user_id=auth.uid())
  );

create policy ezrab_v1_versions_select on public.rab_versions
  for select to authenticated
  using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_versions.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR'))
    and exists (select 1 from public.project_members pm where pm.project_id=rab_versions.project_id and pm.workspace_id=rab_versions.workspace_id and pm.user_id=auth.uid())
  );

create policy ezrab_v1_versions_insert on public.rab_versions
  for insert to authenticated
  with check (
    (created_by is null or created_by = auth.uid())
    and exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_versions.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR'))
    and exists (select 1 from public.project_members pm where pm.project_id=rab_versions.project_id and pm.workspace_id=rab_versions.workspace_id and pm.user_id=auth.uid())
  );

create policy ezrab_v1_versions_update on public.rab_versions
  for update to authenticated
  using (
    status in ('DRAFT','FINAL')
    and exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_versions.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR'))
    and exists (select 1 from public.project_members pm where pm.project_id=rab_versions.project_id and pm.workspace_id=rab_versions.workspace_id and pm.user_id=auth.uid())
  )
  with check (
    status in ('DRAFT','FINAL','ARCHIVED')
    and (created_by is null or created_by = auth.uid())
  );

create policy ezrab_v1_items_select on public.rab_items
  for select to authenticated
  using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_items.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR'))
    and exists (select 1 from public.project_members pm where pm.project_id=rab_items.project_id and pm.workspace_id=rab_items.workspace_id and pm.user_id=auth.uid())
  );

create policy ezrab_v1_items_insert on public.rab_items
  for insert to authenticated
  with check (
    (created_by is null or created_by = auth.uid())
    and exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_items.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR'))
    and exists (select 1 from public.project_members pm where pm.project_id=rab_items.project_id and pm.workspace_id=rab_items.workspace_id and pm.user_id=auth.uid())
    and exists (select 1 from public.rab_versions v where v.id=rab_items.rab_version_id and v.status='DRAFT')
  );

create policy ezrab_v1_items_update on public.rab_items
  for update to authenticated
  using (
    exists (select 1 from public.rab_versions v where v.id=rab_items.rab_version_id and v.status='DRAFT')
    and exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_items.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR'))
    and exists (select 1 from public.project_members pm where pm.project_id=rab_items.project_id and pm.workspace_id=rab_items.workspace_id and pm.user_id=auth.uid())
  )
  with check (
    exists (select 1 from public.rab_versions v where v.id=rab_items.rab_version_id and v.status='DRAFT')
    and (created_by is null or created_by = auth.uid())
  );

create policy ezrab_v1_components_select on public.rab_item_components
  for select to authenticated
  using (
    exists (select 1 from public.rab_items i join public.rab_versions v on v.id=i.rab_version_id
            where i.id=rab_item_components.rab_item_id and v.status in ('DRAFT','FINAL','ARCHIVED')
              and exists (select 1 from public.workspace_members wm where wm.workspace_id=v.workspace_id and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR'))
              and exists (select 1 from public.project_members pm where pm.project_id=v.project_id and pm.workspace_id=v.workspace_id and pm.user_id=auth.uid()))
  );

create policy ezrab_v1_components_insert on public.rab_item_components
  for insert to authenticated
  with check (
    exists (select 1 from public.rab_items i join public.rab_versions v on v.id=i.rab_version_id
            join public.workspace_members wm on wm.workspace_id=v.workspace_id
            join public.project_members pm on pm.project_id=v.project_id and pm.workspace_id=v.workspace_id
            where i.id=rab_item_components.rab_item_id and v.status='DRAFT'
              and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR')
              and pm.user_id=auth.uid())
  );

create policy ezrab_v1_components_update on public.rab_item_components
  for update to authenticated
  using (
    exists (select 1 from public.rab_items i join public.rab_versions v on v.id=i.rab_version_id
            join public.workspace_members wm on wm.workspace_id=v.workspace_id
            join public.project_members pm on pm.project_id=v.project_id and pm.workspace_id=v.workspace_id
            where i.id=rab_item_components.rab_item_id and v.status='DRAFT'
              and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR')
              and pm.user_id=auth.uid())
  )
  with check (
    exists (select 1 from public.rab_items i join public.rab_versions v on v.id=i.rab_version_id
            join public.workspace_members wm on wm.workspace_id=v.workspace_id
            join public.project_members pm on pm.project_id=v.project_id and pm.workspace_id=v.workspace_id
            where i.id=rab_item_components.rab_item_id and v.status='DRAFT'
              and wm.user_id=auth.uid() and wm.role in ('SUPER_ADMIN','ESTIMATOR','EDITOR')
              and pm.user_id=auth.uid())
  );

create policy ezrab_v1_documents_delete on public.rab_documents
  for delete to authenticated
  using (false);

create policy ezrab_v1_versions_delete on public.rab_versions
  for delete to authenticated
  using (
    status='DRAFT'
    and exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_versions.workspace_id and wm.user_id=auth.uid() and wm.role='SUPER_ADMIN')
    and exists (select 1 from public.project_members pm where pm.project_id=rab_versions.project_id and pm.workspace_id=rab_versions.workspace_id and pm.user_id=auth.uid())
  );

create policy ezrab_v1_items_delete on public.rab_items
  for delete to authenticated
  using (
    exists (select 1 from public.rab_versions v where v.id=rab_items.rab_version_id and v.status='DRAFT')
    and exists (select 1 from public.workspace_members wm where wm.workspace_id=rab_items.workspace_id and wm.user_id=auth.uid() and wm.role='SUPER_ADMIN')
  );

create policy ezrab_v1_components_delete on public.rab_item_components
  for delete to authenticated
  using (
    exists (select 1 from public.rab_items i join public.rab_versions v on v.id=i.rab_version_id
            join public.workspace_members wm on wm.workspace_id=v.workspace_id
            join public.project_members pm on pm.project_id=v.project_id and pm.workspace_id=v.workspace_id
            where i.id=rab_item_components.rab_item_id and v.status='DRAFT'
              and wm.user_id=auth.uid() and wm.role='SUPER_ADMIN'
              and pm.user_id=auth.uid())
  );

commit;

-- API contract note:
-- The schema cannot emit HTTP 409. The API must execute a conditional update
-- using expected_revision and map zero affected rows to 409.
-- Before any apply: independently review policy role boundaries, object names,
-- backup/restore evidence, and the status-transition test matrix.
