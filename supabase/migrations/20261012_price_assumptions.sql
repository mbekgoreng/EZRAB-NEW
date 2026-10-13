-- ============================================================================
-- EZRAB Price Fallback & Assumption Layer — price_assumptions table
-- ============================================================================
-- STATUS: NOT APPLIED to any live database. Review + apply manually.
-- Non-destructive by design (CREATE TABLE IF NOT EXISTS, no DROPs).
--
-- This table stores EZRAB_ASSUMPTION prices separately from official AHSP.
-- Assumptions NEVER become official prices; they are always labeled.
--
-- Workflow: DRAFT → PENDING → APPROVED → (EXPIRED | DISABLED)
--                    ↓           ↓
--                REJECTED ← ─────┘
-- ============================================================================

create table if not exists public.price_assumptions (
  id text primary key,
  -- resource identity
  resource_code text not null,
  resource_name text not null,
  resource_type text not null check (resource_type in ('material','labor','equipment')),
  canonical_resource_id text,
  -- price
  price numeric(18,2) not null check (price > 0),
  unit text not null,
  currency text not null default 'IDR' check (currency = 'IDR'),
  -- context
  region text,
  valid_from date not null,
  valid_until date,
  check (valid_until is null or valid_until >= valid_from),
  -- provenance (basis wajib)
  source_note text not null check (char_length(source_note) >= 10),
  reference_document text,
  reference_date date,
  -- workflow
  status text not null default 'DRAFT'
    check (status in ('DRAFT','PENDING','APPROVED','EXPIRED','REJECTED','DISABLED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejected_by uuid references auth.users(id),
  rejected_at timestamptz,
  rejection_reason text,
  -- versioning
  version integer not null default 1,
  notes text,
  updated_at timestamptz not null default now(),
  -- self-approval blocked at DB level
  check (approved_by is null or approved_by != created_by),
  check (rejected_by is null or rejected_by != created_by),
  -- approver identity required on terminal decisions (audit: identitas approver)
  check (status != 'APPROVED' or approved_by is not null),
  check (status != 'APPROVED' or approved_at is not null),
  check (status != 'REJECTED' or rejected_by is not null),
  check (status != 'REJECTED' or rejected_at is not null)
);

-- indexes
create index if not exists idx_price_assumptions_code_unit
  on public.price_assumptions (resource_code, unit);
create index if not exists idx_price_assumptions_status
  on public.price_assumptions (status);
create index if not exists idx_price_assumptions_validity
  on public.price_assumptions (valid_from, valid_until)
  where status = 'APPROVED';

-- audit trail
create table if not exists public.price_assumption_history (
  id uuid primary key default gen_random_uuid(),
  assumption_id text not null references public.price_assumptions(id) on delete cascade,
  at timestamptz not null default now(),
  by_user uuid not null references auth.users(id),
  action text not null check (action in
    ('CREATED','SUBMITTED','APPROVED','REJECTED','DISABLED','REENABLED','UPDATED','EXPIRED')),
  note text,
  previous_status text,
  new_status text not null
);
create index if not exists idx_assumption_history_assumption
  on public.price_assumption_history (assumption_id, at desc);

-- ---------------------------------------------------------------- RLS ----
alter table public.price_assumptions enable row level security;
alter table public.price_assumption_history enable row level security;

-- SELECT: any authenticated user (transparency)
create policy "assumptions_select" on public.price_assumptions for select to authenticated
  using (true);

-- INSERT: authenticated users can create drafts
create policy "assumptions_insert" on public.price_assumptions for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'DRAFT'
  );

-- UPDATE: creator can edit own drafts; approvers handle PENDING
-- Note: status transitions enforced by trigger below, not just RLS.
create policy "assumptions_update" on public.price_assumptions for update to authenticated
  using (
    -- creator editing own DRAFT
    (created_by = auth.uid() and status = 'DRAFT')
    -- anyone authenticated can submit/reject/approve (transition rules in trigger)
    or (status in ('DRAFT','PENDING','APPROVED'))
  )
  with check (true);

-- DELETE: nobody via API (use DISABLED status instead)
-- No delete policy = deletes blocked.

-- History: insert-only via trigger; select open
create policy "assumption_history_select" on public.price_assumption_history for select to authenticated
  using (true);
-- No insert/update/delete policies for clients; trigger uses SECURITY DEFINER.

-- ------------------------------------------------- transition trigger ----
-- Enforces valid status transitions and blocks self-approval server-side.
create or replace function public.price_assumption_transition_guard()
returns trigger
language plpgsql
security definer
as $$
declare
  allowed boolean := false;
begin
  -- valid transitions
  if OLD.status = 'DRAFT' and NEW.status in ('PENDING','DISABLED') then allowed := true;
  elsif OLD.status = 'PENDING' and NEW.status in ('APPROVED','REJECTED','DRAFT') then allowed := true;
  elsif OLD.status = 'APPROVED' and NEW.status in ('EXPIRED','DISABLED') then allowed := true;
  elsif OLD.status = 'EXPIRED' and NEW.status = 'DRAFT' then allowed := true;
  elsif OLD.status = 'REJECTED' and NEW.status = 'DRAFT' then allowed := true;
  elsif OLD.status = 'DISABLED' and NEW.status = 'DRAFT' then allowed := true;
  -- same-status updates (e.g. editing notes) always allowed
  elsif OLD.status = NEW.status then allowed := true;
  end if;

  if not allowed then
    raise exception 'Invalid assumption transition % → %', OLD.status, NEW.status;
  end if;

  -- self-approval blocked (defense in depth; also a CHECK constraint)
  if NEW.status = 'APPROVED' and NEW.approved_by = OLD.created_by then
    raise exception 'Self-approval blocked: approver cannot be creator';
  end if;
  if NEW.status = 'REJECTED' and NEW.rejected_by = OLD.created_by then
    raise exception 'Self-rejection blocked';
  end if;

  -- auto-manage timestamps and version
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();

  -- write history row (SECURITY DEFINER bypasses RLS)
  -- coalesce auth.uid(): service_role/cron calls have no JWT subject;
  -- use nil UUID to mark system actor instead of failing NOT NULL.
  insert into public.price_assumption_history
    (assumption_id, by_user, action, note, previous_status, new_status)
  values (
    NEW.id,
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    case NEW.status
      when 'PENDING' then 'SUBMITTED'
      when 'APPROVED' then 'APPROVED'
      when 'REJECTED' then 'REJECTED'
      when 'DISABLED' then 'DISABLED'
      when 'EXPIRED' then 'EXPIRED'
      else 'UPDATED'
    end,
    null,
    OLD.status,
    NEW.status
  );

  return NEW;
end;
$$;

drop trigger if exists trg_price_assumption_transition on public.price_assumptions;
create trigger trg_price_assumption_transition
  before update on public.price_assumptions
  for each row
  when (OLD.status is distinct from NEW.status or OLD.price is distinct from NEW.price)
  execute function public.price_assumption_transition_guard();

-- auto-expire helper (call via cron)
create or replace function public.price_assumption_sweep_expiry()
returns integer
language plpgsql
security definer
as $$
declare
  n integer := 0;
begin
  update public.price_assumptions
  set status = 'EXPIRED'
  where status = 'APPROVED'
    and valid_until is not null
    and valid_until < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;
