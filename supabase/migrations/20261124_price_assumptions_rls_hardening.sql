-- ============================================================================
-- EZRAB Price Assumptions — RLS hardening (P1-D / WC-04)
-- ============================================================================
-- STATUS: NOT APPLIED to any live database. Review + apply manually.
-- Corrective migration for 20261012_price_assumptions.sql. It REPLACES the
-- four permissive policies from 20261012 and rewrites the transition guard.
-- It does NOT edit 20261012 itself: that file may already be applied live
-- (application status UNKNOWN — see the live-vs-file contradiction note in
-- the P1-D report), so corrections ship as a new migration, never as a
-- rewrite of a possibly-applied file.
--
-- PREREQUISITES (enforced by the preflight block below — the migration
-- aborts loudly if they are missing):
--   1. 20261008_phase3_canonical_schema_rls.sql applied (provides
--      public.workspace_members + the workspace role model).
--   2. 20261012_price_assumptions.sql applied (provides the tables,
--      the policies this file replaces, and the guard it rewrites).
--   3. 20261116_master_price_governance.sql applied (provides
--      public.global_admins + public.ezrab_is_global_admin() — the
--      approver function below calls it. OD-A4-1, owner decision
--      2026-11-24 22:49: approval is global-admin + workspace
--      SUPER_ADMIN only; ESTIMATOR no longer approves.)
--
-- APPLY ORDER: after 20261116 (README row 13, after row 12). Re-runnable:
-- every statement below is DROP IF EXISTS / CREATE OR REPLACE guarded.
--
-- WHAT WAS WRONG (audit WC-04, HIGH latent — 2026-11-24):
--   * assumptions_select used (true): ANY authenticated user could read
--     EVERY row, including other users' DRAFT/PENDING work-in-progress.
--   * assumptions_update let ANY authenticated user update rows in
--     DRAFT/PENDING/APPROVED (WITH CHECK (true)): anyone could edit,
--     approve, or reject anyone else's assumption.
--   * approved_by / rejected_by were CLIENT-SETTABLE: an approver could
--     stamp any identity (or the creator's) as the approver.
--   * The guard trigger only fired WHEN (status OR price changed), so
--     silent edits to approved_by, source_note, validity, etc. bypassed
--     the guard entirely — including a price change smuggled into an
--     approval (approve-as-submitted was not enforced).
--
-- WHAT THIS FILE DOES:
--   1. SELECT: the row owner reads their own rows in any status; any
--      authenticated user reads APPROVED rows only; users holding an
--      approval role (global admin, or SUPER_ADMIN in any workspace)
--      may additionally read PENDING rows — the rows they are asked to
--      review. APPROVED rows are the PUBLISHED shared catalog — that
--      is the table's design intent (an approved assumption nobody
--      else can read is useless), and it matches the 20261116
--      governance pattern (SELECT open for published reference data).
--      DRAFT / REJECTED / EXPIRED / DISABLED rows of another user are
--      invisible to everyone but the owner. (Owner-only SELECT was
--      considered and rejected for breaking the shared-catalog purpose;
--      flagged for owner ratification in the P1-D report.)
--      NOTE — why PENDING is readable by approvers (caught by local
--      verification, 2026-11-24): PostgreSQL applies the SELECT
--      policy's USING to UPDATE/DELETE as well (a row must be readable
--      to be updated). A SELECT policy of owner-or-APPROVED alone
--      makes the approver UPDATE policy UNREACHABLE — an approver
--      could never see a PENDING row, so could never approve it (the
--      local Q-6g run matched 0 rows until this clause was added).
--      Visibility therefore follows the workflow stage: DRAFT =
--      owner only; PENDING = owner + approvers; APPROVED = everyone
--      authenticated.
--   2. INSERT: unchanged in spirit (own DRAFT only) + drafts must carry
--      NO approval identity (approved_by/rejected_by + timestamps NULL).
--   3. UPDATE splits into two policies:
--        - assumptions_update_owner: the creator may edit/submit/withdraw/
--          disable/reopen their OWN rows (WITH CHECK: never into APPROVED,
--          REJECTED, or EXPIRED — the owner can never self-approve).
--        - assumptions_update_approver: a NON-CREATOR holding an approval
--          role (global admin, or SUPER_ADMIN in ANY workspace) may
--          approve/reject PENDING rows or retire APPROVED rows
--          (DISABLED/EXPIRED). ESTIMATOR, EDITOR, CLIENT/DIREKSI and
--          users with no workspace membership can approve nothing.
--      Approval roles come from the global-admin model (20261116) +
--      the canonical workspace role model (20261008). OD-A4-1 (owner
--      decision 2026-11-24 22:49, Option A): ONLY global admins and
--      workspace SUPER_ADMINs approve — ESTIMATOR does NOT approve.
--      (The P1-D draft used SUPER_ADMIN-or-ESTIMATOR; that left
--      approval effectively open, because the server bootstrap grants
--      ESTIMATOR to every new user in their own workspace. This file
--      therefore DEPENDS on 20261116 — see PREREQUISITES above.)
--   4. DELETE: still NO policy — deletes stay blocked (use DISABLED).
--   5. History SELECT mirrors the row rule (own rows' history, history
--      of APPROVED rows, or — for approvers — history of PENDING rows
--      under review). History stays trigger-only for writes.
--   6. The transition guard is rewritten and now fires on EVERY update
--      (the WHEN clause is removed):
--        - identity columns (id, created_by, created_at) immutable;
--        - same-status edits allowed ONLY for DRAFT rows (no in-place
--          edits of PENDING/APPROVED rows — pull back to DRAFT first);
--        - price/identity/context fields may change only while the row
--          IS a draft or is being REOPENED as a draft (an approver
--          approves the row AS SUBMITTED — no silent price change);
--        - approved_by / rejected_by are STAMPED server-side from
--          auth.uid() on approve/reject (client values ignored);
--          self-approval/self-rejection still blocked; approval identity
--          is immutable on every other transition and cleared on reopen
--          to DRAFT (fresh cycle).
--      The valid-transition table itself is UNCHANGED, so the
--      auto-expire sweep (APPROVED → EXPIRED, SECURITY DEFINER, no JWT)
--      keeps working: it touches no approval fields and no content.
--   7. SWEEP FIX (latent defect found by local verification, 2026-11-24 —
--      NOT part of WC-04, fixed here because the rewritten trigger must
--      keep the sweep working): the 20261012 trigger wrote history rows
--      with by_user = coalesce(auth.uid(), nil-UUID) — but by_user has
--      a FOREIGN KEY to auth.users, and the nil UUID is not a user, so
--      EVERY system-actor history write (i.e. every sweep run) failed
--      with an FK violation. The sweep could never have succeeded. Fix:
--      by_user becomes NULLABLE (NULL = system write without an
--      authenticated actor — the same convention 20261116 uses for
--      ahsp_version_history.changed_by: "never a fabricated identity"),
--      and the trigger inserts auth.uid() directly. Existing rows are
--      unaffected (widening only).
--
-- ROLLBACK (manual, after approved backup): re-apply the four original
-- policies + the original guard from 20261012 (kept verbatim in git
-- history), then drop public.ezrab_can_approve_price_assumption().
-- No data is deleted or altered by this file.
-- ============================================================================

-- ------------------------------------------------------------ preflight --
-- Abort loudly (instead of half-applying) when the prerequisites are
-- missing. Mirrors the preflight-ABORT pattern of the 20260913 durable
-- foundation migration.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'price_assumptions'
  ) then
    raise exception 'PREFLIGHT: public.price_assumptions does not exist — apply 20261012_price_assumptions.sql first';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'workspace_members'
  ) then
    raise exception 'PREFLIGHT: public.workspace_members does not exist — apply 20261008_phase3_canonical_schema_rls.sql first';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'global_admins'
  ) then
    raise exception 'PREFLIGHT: public.global_admins does not exist — apply 20261116_master_price_governance.sql first (OD-A4-1: approvers are global admins + workspace SUPER_ADMINs)';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ezrab_is_global_admin'
  ) then
    raise exception 'PREFLIGHT: public.ezrab_is_global_admin() does not exist — apply 20261116_master_price_governance.sql first (OD-A4-1)';
  end if;
end $$;

-- ------------------------------------------------- approver role helper --
-- Mirrors the 20261008 ezrab_can_write_* helper pattern (LANGUAGE sql,
-- SECURITY DEFINER, search_path pinned). OD-A4-1 (owner decision
-- 2026-11-24 22:49, Option A): approval is a GLOBAL-admin function or a
-- workspace SUPER_ADMIN function — ESTIMATOR does NOT approve. (The
-- P1-D draft allowed SUPER_ADMIN-or-ESTIMATOR; that left approval
-- effectively open because the server bootstrap grants ESTIMATOR to
-- every new user in their own workspace.) EDITOR may write RAB data
-- (canonical model) but does NOT approve prices; DIREKSI and CLIENT
-- are read-only; users with no membership approve nothing.
create or replace function public.ezrab_can_approve_price_assumption()
returns boolean
language sql stable security definer set search_path = public
as $$ select
  public.ezrab_is_global_admin()
  or exists (
    select 1 from public.workspace_members
    where user_id = auth.uid() and role = 'SUPER_ADMIN'
  ) $$;

-- ------------------------------------------------ sweep fix (see §7) --
-- by_user NULLABLE: NULL marks a system write (sweep/cron, no JWT).
-- The 20261012 nil-UUID fallback could never satisfy the FK to
-- auth.users. Widening only — existing rows are untouched.
alter table public.price_assumption_history
  alter column by_user drop not null;
comment on column public.price_assumption_history.by_user is
  'P1-D (20261124): NULL = system write without an authenticated actor (e.g. the auto-expire sweep). Mirrors the 20261116 ahsp_version_history.changed_by convention — never a fabricated identity.';

-- ------------------------------------------- replace the four policies --
-- Drop the permissive 20261012 policies first so no window exists where
-- old + new policies overlap (policies are OR-ed: a leftover permissive
-- policy would silently defeat the tightening). The two NEW update policy
-- names are dropped too, so the file is re-runnable (without this, a
-- second apply fails at CREATE POLICY "assumptions_update_owner" — caught
-- by local verification 2026-11-24 — and worse, leaves the file
-- half-applied: the shared-name history policy would be dropped but never
-- re-created, silently hiding all history rows).
drop policy if exists "assumptions_select" on public.price_assumptions;
drop policy if exists "assumptions_insert" on public.price_assumptions;
drop policy if exists "assumptions_update" on public.price_assumptions;
drop policy if exists "assumptions_update_owner" on public.price_assumptions;
drop policy if exists "assumptions_update_approver" on public.price_assumptions;
drop policy if exists "assumption_history_select" on public.price_assumption_history;

-- SELECT: owner reads own rows (any status); everyone authenticated reads
-- APPROVED rows (the published shared catalog); approvers additionally
-- read PENDING rows under review. The PENDING clause is REQUIRED, not
-- optional: PostgreSQL applies the SELECT policy's USING to UPDATE as
-- well, so without it the approver UPDATE policy below could never match
-- a PENDING row and approval would be impossible (verified locally).
create policy "assumptions_select" on public.price_assumptions for select to authenticated
  using (
    created_by = auth.uid()
    or status = 'APPROVED'
    or (status = 'PENDING' and public.ezrab_can_approve_price_assumption())
  );

-- INSERT: own DRAFT only, carrying no approval identity.
create policy "assumptions_insert" on public.price_assumptions for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'DRAFT'
    and approved_by is null
    and approved_at is null
    and rejected_by is null
    and rejected_at is null
  );

-- UPDATE (owner): the creator may work their own rows through the
-- DRAFT/PENDING/DISABLED states — edit, submit, withdraw, disable,
-- reopen. WITH CHECK forbids moving a row into APPROVED, REJECTED, or
-- EXPIRED: the owner can never self-approve, self-reject, or expire.
-- (The trigger is the backstop for transition + content rules.)
create policy "assumptions_update_owner" on public.price_assumptions for update to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and status in ('DRAFT', 'PENDING', 'DISABLED')
  );

-- UPDATE (approver): a non-creator with an approval role (global admin,
-- or SUPER_ADMIN in any workspace — OD-A4-1) may approve/reject PENDING
-- rows or retire APPROVED rows. WITH CHECK is evaluated AFTER the BEFORE
-- trigger, so the trigger-stamped approved_by/rejected_by (= auth.uid())
-- is what gets checked — a forged client value can never survive.
create policy "assumptions_update_approver" on public.price_assumptions for update to authenticated
  using (
    status in ('PENDING', 'APPROVED')
    and created_by <> auth.uid()
    and public.ezrab_can_approve_price_assumption()
  )
  with check (
    created_by <> auth.uid()
    and (
      (status = 'APPROVED' and approved_by = auth.uid() and approved_at is not null)
      or (status = 'REJECTED' and rejected_by = auth.uid() and rejected_at is not null)
      or status in ('DRAFT', 'EXPIRED', 'DISABLED')
    )
  );

-- DELETE: still no policy — deletes stay blocked (use DISABLED status).

-- History SELECT mirrors the row rule: history of your own rows, of
-- APPROVED (published) rows, or — for approvers — of PENDING rows under
-- review. No insert/update/delete policies for clients — the trigger
-- (SECURITY DEFINER) remains the only writer.
create policy "assumption_history_select" on public.price_assumption_history for select to authenticated
  using (exists (
    select 1 from public.price_assumptions a
    where a.id = price_assumption_history.assumption_id
      and (
        a.created_by = auth.uid()
        or a.status = 'APPROVED'
        or (a.status = 'PENDING' and public.ezrab_can_approve_price_assumption())
      )
  ));

-- --------------------------------------- rewrite the transition guard --
-- Replaces 20261012's price_assumption_transition_guard() (same name +
-- signature, so CREATE OR REPLACE swaps it in place).
--
-- Changes vs 20261012 (transition table itself UNCHANGED):
--   (a) fires on EVERY update — the WHEN clause is removed from the
--       trigger below (the old WHEN let non-status/price edits bypass
--       the guard entirely);
--   (b) id / created_by / created_at are immutable;
--   (c) same-status edits allowed ONLY for DRAFT rows;
--   (d) content fields (price, resource identity, unit, validity,
--       provenance, notes) may change only while the row IS a draft or
--       is being REOPENED as a draft — approve-as-submitted;
--   (e) approved_by / rejected_by (+ timestamps) are STAMPED from
--       auth.uid() / now() on approve/reject — client values ignored;
--       self-approval/self-rejection blocked; approval identity is
--       immutable on all other transitions and cleared on reopen to
--       DRAFT (fresh approval cycle).
create or replace function public.price_assumption_transition_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
  content_changed boolean := false;
begin
  -- (b) identity columns are immutable.
  if NEW.id is distinct from OLD.id
     or NEW.created_by is distinct from OLD.created_by
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'price_assumptions identity columns (id, created_by, created_at) are immutable';
  end if;

  -- valid transitions (UNCHANGED from 20261012).
  if OLD.status = 'DRAFT' and NEW.status in ('PENDING','DISABLED') then allowed := true;
  elsif OLD.status = 'PENDING' and NEW.status in ('APPROVED','REJECTED','DRAFT') then allowed := true;
  elsif OLD.status = 'APPROVED' and NEW.status in ('EXPIRED','DISABLED') then allowed := true;
  elsif OLD.status = 'EXPIRED' and NEW.status = 'DRAFT' then allowed := true;
  elsif OLD.status = 'REJECTED' and NEW.status = 'DRAFT' then allowed := true;
  elsif OLD.status = 'DISABLED' and NEW.status = 'DRAFT' then allowed := true;
  -- (c) same-status updates (e.g. editing notes) allowed ONLY for DRAFT
  -- rows. A PENDING/APPROVED row cannot be edited in place — pull it
  -- back to DRAFT first (re-approval required).
  elsif OLD.status = NEW.status and NEW.status = 'DRAFT' then allowed := true;
  end if;

  if not allowed then
    raise exception 'Invalid assumption transition % → %', OLD.status, NEW.status;
  end if;

  -- (d) content-edit rule: price / identity / context fields may change
  -- only while the row IS a draft or is being REOPENED as a draft.
  content_changed := (
    NEW.price is distinct from OLD.price
    or NEW.resource_code is distinct from OLD.resource_code
    or NEW.resource_name is distinct from OLD.resource_name
    or NEW.resource_type is distinct from OLD.resource_type
    or NEW.canonical_resource_id is distinct from OLD.canonical_resource_id
    or NEW.unit is distinct from OLD.unit
    or NEW.currency is distinct from OLD.currency
    or NEW.region is distinct from OLD.region
    or NEW.valid_from is distinct from OLD.valid_from
    or NEW.valid_until is distinct from OLD.valid_until
    or NEW.source_note is distinct from OLD.source_note
    or NEW.reference_document is distinct from OLD.reference_document
    or NEW.reference_date is distinct from OLD.reference_date
    or NEW.notes is distinct from OLD.notes
  );
  if content_changed and OLD.status <> 'DRAFT' and NEW.status <> 'DRAFT' then
    raise exception 'Content fields of a % assumption can only change via DRAFT rework', OLD.status;
  end if;

  -- (e) approval-field binding (server-side; client values NEVER trusted).
  if NEW.status = 'APPROVED' and OLD.status <> 'APPROVED' then
    if auth.uid() is null then
      raise exception 'Approval requires an authenticated user (auth.uid() is null)';
    end if;
    if auth.uid() = OLD.created_by then
      raise exception 'Self-approval blocked: approver cannot be creator';
    end if;
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
    -- a fresh approval clears any stale rejection identity
    NEW.rejected_by := null;
    NEW.rejected_at := null;
    NEW.rejection_reason := null;
  elsif NEW.status = 'REJECTED' and OLD.status <> 'REJECTED' then
    if auth.uid() is null then
      raise exception 'Rejection requires an authenticated user (auth.uid() is null)';
    end if;
    if auth.uid() = OLD.created_by then
      raise exception 'Self-rejection blocked';
    end if;
    NEW.rejected_by := auth.uid();
    NEW.rejected_at := now();
    NEW.approved_by := null;
    NEW.approved_at := null;
  elsif NEW.status = 'DRAFT' then
    -- a draft never carries approval identity (fresh cycle on reopen)
    NEW.approved_by := null;
    NEW.approved_at := null;
    NEW.rejected_by := null;
    NEW.rejected_at := null;
    NEW.rejection_reason := null;
  else
    -- PENDING / DISABLED / EXPIRED outcomes: approval identity immutable.
    if NEW.approved_by is distinct from OLD.approved_by
       or NEW.approved_at is distinct from OLD.approved_at
       or NEW.rejected_by is distinct from OLD.rejected_by
       or NEW.rejected_at is distinct from OLD.rejected_at then
      raise exception 'Approval identity (approved_by/rejected_by) is server-managed and cannot be edited';
    end if;
  end if;

  -- auto-manage timestamps and version (unchanged from 20261012).
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();

  -- write history row (SECURITY DEFINER bypasses RLS).
  -- by_user is auth.uid() directly: NULL marks a system actor
  -- (sweep/cron with no JWT). The 20261012 nil-UUID fallback was
  -- removed — it violated the FK to auth.users on every system write.
  insert into public.price_assumption_history
    (assumption_id, by_user, action, note, previous_status, new_status)
  values (
    NEW.id,
    auth.uid(),
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

-- (a) the trigger now fires on EVERY update: the WHEN clause is gone.
-- Without this, silent non-status/price edits would still bypass the
-- guard above (the original WC-04 trigger gap).
drop trigger if exists trg_price_assumption_transition on public.price_assumptions;
create trigger trg_price_assumption_transition
  before update on public.price_assumptions
  for each row
  execute function public.price_assumption_transition_guard();
