-- ============================================================================
-- EZRAB P1-D — RLS negative tests for price_assumptions hardening (WC-04)
-- ============================================================================
-- STATUS: BLOCKED — UNEXECUTED. DOCUMENTED, NOT RUN.
-- These tests require a live Supabase Postgres instance with ALL FOUR
-- migrations applied: 20261008 (canonical schema), 20261012
-- (price_assumptions), 20261116 (global_admins + ezrab_is_global_admin
-- — OD-A4-1 prerequisite), 20261124 (P1-D hardening). No such instance
-- is available in this environment (Supabase API route dead; no live-DB
-- access in the P1 program). DO NOT claim these tests passed.
--
-- LOCAL-STUB EXECUTION (2026-11-24, W-RLS resume — NOT live verification):
-- this file was run twice against a throwaway local PostgreSQL 16
-- instance with a stubbed auth schema (auth.users table + auth.uid()
-- reading request.jwt.claims; NOT Supabase): exit 0, "ALL PASSED"
-- (Q-6a–Q-6q, 23 notices), transaction rolled back with zero rows left.
-- That validates the SQL + policy logic under the stub only. The status
-- above stands: UNEXECUTED against live Supabase; live verification
-- remains BLOCKED. Never cite the local run as live evidence.
--
-- LOCAL-STUB EXECUTION (2026-11-25, B1 OD-A4-1 — NOT live verification):
-- re-run against a throwaway local PostgreSQL 16 with the same stub
-- auth schema + Supabase-equivalent GRANTs, apply order 20261008 →
-- 20261012 → 20261116 → 20261124 (edited): exit 0, "ALL PASSED"
-- (Q-6a–Q-6s, 26 notices), transaction rolled back with zero rows left.
-- Control run: the NEW test file against the PRE-EDIT migration FAILS
-- at Q-6r ("ESTIMATOR user E can read PENDING row (1 rows)") — the new
-- cases genuinely pin the OD-A4-1 behavior change. The edited
-- migration without 20261116 aborts in preflight ("PREFLIGHT:
-- public.global_admins does not exist"). Logs in the B1 evidence
-- folder (b1-pg-new-*.log, b1-pg-control-*.log, b1-pg-preflight-*.log).
--
-- WHAT THIS IS: the D6 case Q-6 regression suite for WC-04, plus the
-- approval-binding and trigger-gap cases from the P1-D hardening. It
-- complements (does not replace) the A9 suite in
-- supabase/tests/phase3_rls_negative_tests.sql, which covers the
-- canonical 20261008 policies (projects / workspaces / RAB / ded_analyses).
-- Run A9 first; run this file second.
--
-- HOW TO RUN (once live-DB access exists — owner present, NON-PRODUCTION
-- project, synthetic data only, never production user data):
--   1. Apply 20261008, then 20261012, then 20261116, then 20261124 to
--      the test project (20261116 BEFORE 20261124 — the hardening
--      migration's preflight aborts without global_admins, OD-A4-1).
--   2. Run with psql as the postgres / service_role user:
--        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/p1_rls_negative_tests.sql
--   3. Every assertion that fails raises an exception (the run aborts).
--      A clean run ends with:
--        NOTICE 'P1 RLS NEGATIVE TESTS (WC-04): ALL PASSED'
--      Cases: Q-6a–Q-6s (incl. Q-6b2 — PENDING visibility by role;
--      Q-6r/Q-6s — OD-A4-1 approver scope).
--   4. The whole file runs inside ONE transaction that is ROLLED BACK at
--      the end, so no test data persists.
--
-- SUPABASE SQL EDITOR: psql meta-commands (\set, \gset, \if) do not run
-- in the editor. To run there, edit the SET p1.uid_x / p1.ws_x values at the top to the real
-- UUIDs, skip the \gset guard block, and run the scenario blocks in
-- order inside one transaction (BEGIN ... ROLLBACK).
--
-- SELF-GUARD: if the hardening migration is not applied (helper function
-- missing), the file prints a BLOCKED notice and exits WITHOUT failing
-- (exit 0). That is the honest outcome — the tests are documented, not
-- faked. Mirrors the 20261116_master_price_governance.test.sql pattern.
--
-- TEST USERS (synthetic UUIDs, created by the setup block):
--   A — creator, ESTIMATOR in workspace W_A (owns the assumption rows).
--   B — approver, SUPER_ADMIN in workspace W_B (authorized approver role,
--       different workspace from A — approval is role-based, not
--       workspace-scoped, because price_assumptions has no workspace_id).
--       OD-A4-1 (owner decision 2026-11-24 22:49, Option A): B was
--       ESTIMATOR in the P1-D draft; ESTIMATOR no longer approves.
--   C — CLIENT in W_A (read-only role: must NOT approve anything).
--   D — authenticated user with NO workspace membership at all.
--   E — ESTIMATOR in workspace W_C (OD-A4-1 negative case: an estimator
--       must NOT approve anything and must NOT read PENDING rows — the
--       server bootstrap grants ESTIMATOR to every new user, so letting
--       ESTIMATOR approve would leave approval effectively open).
--   F — GLOBAL ADMIN (row in public.global_admins, no workspace
--       membership — OD-A4-1 positive case: global admins approve
--       without belonging to any workspace).
-- ============================================================================

-- Test-user / workspace IDs as session settings (plain SQL — readable
-- inside DO blocks via current_setting(), unlike psql \set variables,
-- which psql does NOT interpolate inside dollar-quoted DO bodies).
set p1.uid_a = 'aaaaaaaa-0001-4000-8000-000000000001';
set p1.uid_b = 'bbbbbbbb-0002-4000-8000-000000000002';
set p1.uid_c = 'cccccccc-0003-4000-8000-000000000003';
set p1.uid_d = 'dddddddd-0004-4000-8000-000000000004';
set p1.uid_e = 'eeeeeeee-0005-4000-8000-000000000005';
set p1.uid_f = 'ffffffff-0006-4000-8000-000000000006';
set p1.ws_a  = 'aaaaaaaa-1000-4000-8000-0000000000a1';
set p1.ws_b  = 'bbbbbbbb-2000-4000-8000-0000000000b2';
set p1.ws_c  = 'cccccccc-3000-4000-8000-0000000000c3';

begin;

-- Self-guard: hardening applied? (helper function is the marker.)
select case when exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ezrab_can_approve_price_assumption'
) then 'true' else 'false' end as hardening_applied \gset

\if :hardening_applied
\echo P1-D hardening detected — running WC-04 RLS negative tests...
\else
\echo BLOCKED — migration 20261124_price_assumptions_rls_hardening not applied; tests skipped (documented, not run)
\endif

\if :hardening_applied

-- ============================================================== SETUP ==
-- Runs as postgres/service_role (RLS bypassed). If the direct insert
-- into auth.users fails on your Supabase version (column drift), create
-- users A–D via Dashboard > Authentication instead, then set the
-- p1.uid_x settings above to their real UUIDs and re-run from the workspace
-- inserts below.
insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   is_super_admin)
values
  (current_setting('p1.uid_a')::uuid, 'authenticated', 'authenticated', 'p1-a@example.invalid', 'x', now(), now(), now(), '{}', '{}', false),
  (current_setting('p1.uid_b')::uuid, 'authenticated', 'authenticated', 'p1-b@example.invalid', 'x', now(), now(), now(), '{}', '{}', false),
  (current_setting('p1.uid_c')::uuid, 'authenticated', 'authenticated', 'p1-c@example.invalid', 'x', now(), now(), now(), '{}', '{}', false),
  (current_setting('p1.uid_d')::uuid, 'authenticated', 'authenticated', 'p1-d@example.invalid', 'x', now(), now(), now(), '{}', '{}', false),
  (current_setting('p1.uid_e')::uuid, 'authenticated', 'authenticated', 'p1-e@example.invalid', 'x', now(), now(), now(), '{}', '{}', false),
  (current_setting('p1.uid_f')::uuid, 'authenticated', 'authenticated', 'p1-f@example.invalid', 'x', now(), now(), now(), '{}', '{}', false)
on conflict (id) do nothing;

-- Profiles are created by the on_auth_user_created_profile trigger; make
-- sure they exist even if the trigger was skipped.
insert into public.profiles (id) values (current_setting('p1.uid_a')::uuid), (current_setting('p1.uid_b')::uuid), (current_setting('p1.uid_c')::uuid), (current_setting('p1.uid_d')::uuid), (current_setting('p1.uid_e')::uuid), (current_setting('p1.uid_f')::uuid)
on conflict (id) do nothing;

insert into public.workspaces (id, name) values
  (current_setting('p1.ws_a')::uuid, 'P1 test workspace A'),
  (current_setting('p1.ws_b')::uuid, 'P1 test workspace B'),
  (current_setting('p1.ws_c')::uuid, 'P1 test workspace C')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role) values
  (current_setting('p1.ws_a')::uuid, current_setting('p1.uid_a')::uuid, 'ESTIMATOR'),
  (current_setting('p1.ws_b')::uuid, current_setting('p1.uid_b')::uuid, 'SUPER_ADMIN'),
  (current_setting('p1.ws_a')::uuid, current_setting('p1.uid_c')::uuid, 'CLIENT'),
  (current_setting('p1.ws_c')::uuid, current_setting('p1.uid_e')::uuid, 'ESTIMATOR')
on conflict (workspace_id, user_id) do nothing;
-- D deliberately has NO membership. F deliberately has NO workspace
-- membership either — F's authority is the global_admins row below.

-- F is a global admin (OD-A4-1 positive case). Inserted as service_role,
-- bypassing RLS — the same path the owner uses to bootstrap the first
-- global admin via the Supabase SQL console (20261116 header).
insert into public.global_admins (user_id, granted_by, reason)
values (current_setting('p1.uid_f')::uuid, current_setting('p1.uid_f')::uuid, 'P1 test global admin')
on conflict (user_id) do nothing;

-- Seed rows owned by A (inserted as service_role, bypassing RLS):
--   PA-DRAFT-1  DRAFT    (B must not see / touch it)
--   PA-PEND-1   PENDING  (approval cases: C denied, A self-denied, B ok)
--   PA-PEND-3   PENDING  (OD-A4-1 negative case: E/ESTIMATOR approval)
--   PA-PEND-4   PENDING  (OD-A4-1 positive case: F/global-admin approval)
--   PA-APPR-1   APPROVED (published catalog: readable by all; in-place
--                          edits denied; approval identity immutable;
--                          valid_until already past, so the Q-6p sweep
--                          control can expire it WITHOUT a setup UPDATE —
--                          editing an APPROVED row in place is exactly
--                          what the rewritten trigger forbids)
insert into public.price_assumptions
  (id, resource_code, resource_name, resource_type, price, unit,
   valid_from, valid_until, source_note, status, created_by, approved_by, approved_at)
values
  ('PA-DRAFT-1', 'M-TEST-001', 'Test material draft', 'material',
   100000, 'm3', current_date, null, 'P1 test draft row', 'DRAFT', current_setting('p1.uid_a')::uuid, null, null),
  ('PA-PEND-1', 'M-TEST-002', 'Test material pending', 'material',
   200000, 'm3', current_date, null, 'P1 test pending row', 'PENDING', current_setting('p1.uid_a')::uuid, null, null),
  ('PA-PEND-2', 'M-TEST-003', 'Test material pending 2', 'material',
   300000, 'm3', current_date, null, 'P1 test pending row 2', 'PENDING', current_setting('p1.uid_a')::uuid, null, null),
  ('PA-PEND-3', 'M-TEST-012', 'Test material pending 3', 'material',
   350000, 'm3', current_date, null, 'P1 test pending row 3 (OD-A4-1)', 'PENDING', current_setting('p1.uid_a')::uuid, null, null),
  ('PA-PEND-4', 'M-TEST-013', 'Test material pending 4', 'material',
   360000, 'm3', current_date, null, 'P1 test pending row 4 (OD-A4-1)', 'PENDING', current_setting('p1.uid_a')::uuid, null, null),
  ('PA-APPR-1', 'M-TEST-004', 'Test material approved', 'material',
   400000, 'm3', current_date - 30, current_date - 1, 'P1 test approved row', 'APPROVED', current_setting('p1.uid_a')::uuid, current_setting('p1.uid_b')::uuid, now())
on conflict (id) do nothing;

-- ==================================================== Q-6a: B reads A's DRAFT → DENIED ==
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-DRAFT-1';
  if v_n <> 0 then raise exception 'Q-6a FAILED: user B can read user A''s DRAFT row (% rows)', v_n; end if;
  raise notice 'Q-6a passed: B cannot read A''s DRAFT row';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============ Q-6b: B reads A's APPROVED row → ALLOWED (published catalog) ==
-- DOCUMENTED DESIGN DECISION (see 20261124 header): APPROVED rows are the
-- published shared catalog — readable by any authenticated user. If the
-- owner ratifies owner-only SELECT instead, this case flips to DENIED and
-- the assumptions_select policy must change with it.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-APPR-1';
  if v_n <> 1 then raise exception 'Q-6b FAILED: APPROVED row not readable by B (% rows)', v_n; end if;
  raise notice 'Q-6b passed: B can read A''s APPROVED row (published catalog, by design)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============ Q-6b2: PENDING rows are readable by approvers ONLY ==
-- Visibility follows the workflow stage (see the 20261124 header note):
-- an approver must be able to READ a PENDING row to approve it, because
-- PostgreSQL applies the SELECT policy's USING to UPDATE as well. C
-- (CLIENT) and D (no membership) must NOT see PENDING rows.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-PEND-1';
  if v_n <> 1 then raise exception 'Q-6b2 FAILED: approver B cannot read PENDING row (% rows)', v_n; end if;
  raise notice 'Q-6b2 step 1 passed: approver B can read PENDING row under review';
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_c')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-PEND-1';
  if v_n <> 0 then raise exception 'Q-6b2 FAILED: CLIENT user C can read PENDING row (% rows)', v_n; end if;
  raise notice 'Q-6b2 step 2 passed: CLIENT cannot read PENDING row';
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_d')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-PEND-1';
  if v_n <> 0 then raise exception 'Q-6b2 FAILED: unmembered user D can read PENDING row (% rows)', v_n; end if;
  raise notice 'Q-6b2 step 3 passed: unmembered user cannot read PENDING row';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================ Q-6c: B updates A's DRAFT → DENIED ==
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  update public.price_assumptions set price = 1 where id = 'PA-DRAFT-1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'Q-6c FAILED: B updated A''s DRAFT row (% rows)', v_n; end if;
  raise notice 'Q-6c passed: B cannot update A''s DRAFT row';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================ Q-6d: B deletes A's row → DENIED ==
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  delete from public.price_assumptions where id = 'PA-DRAFT-1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'Q-6d FAILED: B deleted A''s row (% rows)', v_n; end if;
  raise notice 'Q-6d passed: B cannot delete A''s row (no DELETE policy)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================== Q-6e: C (CLIENT role) approves A's PENDING → DENIED ==
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_c')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  update public.price_assumptions set status = 'APPROVED' where id = 'PA-PEND-1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'Q-6e FAILED: CLIENT user C approved A''s row (% rows)', v_n; end if;
  raise notice 'Q-6e passed: CLIENT role cannot approve';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ================================== Q-6f: A self-approves own PENDING → DENIED ==
-- Denial arrives as an EXCEPTION here (not 0 rows): the owner policy's
-- USING passes (own row), so the BEFORE trigger runs first and raises
-- self-approval — and even without the trigger, the owner policy's WITH
-- CHECK (never into APPROVED) would raise an RLS violation. Either layer
-- denying is a pass; the row must stay PENDING.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_a')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.price_assumptions set status = 'APPROVED' where id = 'PA-PEND-1';
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'Q-6f FAILED: creator A self-approved (no denial raised)'; end if;
  raise notice 'Q-6f passed: creator cannot self-approve (trigger denies; RLS WITH CHECK backstops)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_status text;
begin
  select status into v_status from public.price_assumptions where id = 'PA-PEND-1';
  if v_status <> 'PENDING' then raise exception 'Q-6f FAILED: row left PENDING (status %)', v_status; end if;
end $$;

-- ============ Q-6g: B approves A's PENDING with FORGED approved_by → stamped B ==
-- Positive control: an authorized approver CAN approve — but the identity
-- is bound server-side to auth.uid(). B tries to stamp C as the approver.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  update public.price_assumptions
    set status = 'APPROVED', approved_by = current_setting('p1.uid_c')::uuid
    where id = 'PA-PEND-1';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Q-6g FAILED: authorized approver B could not approve (% rows)', v_n; end if;
  raise notice 'Q-6g step 1 passed: B approved (1 row)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_by uuid; v_at timestamptz; v_status text;
begin
  select approved_by, approved_at, status into v_by, v_at, v_status
  from public.price_assumptions where id = 'PA-PEND-1';
  if v_status <> 'APPROVED' then raise exception 'Q-6g FAILED: status is %', v_status; end if;
  if v_by <> current_setting('p1.uid_b')::uuid then raise exception 'Q-6g FAILED: approved_by is % (forged value survived)', v_by; end if;
  if v_at is null then raise exception 'Q-6g FAILED: approved_at is null'; end if;
  raise notice 'Q-6g passed: approved_by bound to auth.uid() (B), forged value (C) discarded';
end $$;

-- ================= Q-6h: B approves A's PENDING *and* changes price → TRIGGER DENIES ==
-- Approve-as-submitted: content may not change on an approval transition.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.price_assumptions
      set status = 'APPROVED', price = 999999
      where id = 'PA-PEND-2';
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'Q-6h FAILED: approve-with-price-change was not blocked'; end if;
  raise notice 'Q-6h passed: approve-with-price-change blocked by trigger';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_price numeric; v_status text;
begin
  select price, status into v_price, v_status
  from public.price_assumptions where id = 'PA-PEND-2';
  if v_price <> 300000 or v_status <> 'PENDING' then
    raise exception 'Q-6h FAILED: row mutated (price %, status %)', v_price, v_status;
  end if;
end $$;

-- ============ Q-6i: A edits notes of own APPROVED row in place → TRIGGER DENIES ==
-- Same-status edits are DRAFT-only now; an APPROVED row must be pulled
-- back through DISABLED → DRAFT → PENDING → APPROVED for any change.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_a')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.price_assumptions
      set notes = 'silent edit' where id = 'PA-APPR-1';
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'Q-6i FAILED: in-place edit of APPROVED row was not blocked'; end if;
  raise notice 'Q-6i passed: in-place edit of APPROVED row blocked (RLS and/or trigger)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ================= Q-6j: B rewrites approved_by on APPROVED row → TRIGGER DENIES ==
-- B is an authorized approver, so RLS lets B touch APPROVED rows (for
-- DISABLE/EXPIRE) — but approval identity is immutable outside an
-- approve/reject transition.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    update public.price_assumptions
      set approved_by = current_setting('p1.uid_c')::uuid where id = 'PA-APPR-1';
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'Q-6j FAILED: approved_by rewrite was not blocked'; end if;
  raise notice 'Q-6j passed: approved_by rewrite blocked by trigger';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================ Q-6k: D (no membership) reads DRAFT → DENIED ==
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_d')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-DRAFT-1';
  if v_n <> 0 then raise exception 'Q-6k FAILED: unmembered user D read A''s DRAFT (% rows)', v_n; end if;
  select count(*) into v_n from public.price_assumptions where id = 'PA-APPR-1';
  if v_n <> 1 then raise exception 'Q-6k FAILED: APPROVED row not readable by D (% rows)', v_n; end if;
  raise notice 'Q-6k passed: D cannot read DRAFT, can read APPROVED (published catalog)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================ Q-6l: history follows the row rule ==
-- B sees history of APPROVED rows, not of A's DRAFT rows. First, A edits
-- the DRAFT row (creating a history row for it via the trigger), so the
-- DRAFT-side assertion is non-vacuous.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_a')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  update public.price_assumptions set notes = 'draft edit' where id = 'PA-DRAFT-1';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Q-6l setup FAILED: owner could not edit own DRAFT'; end if;
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_draft integer; v_appr integer;
begin
  select count(*) into v_draft
  from public.price_assumption_history where assumption_id = 'PA-DRAFT-1';
  if v_draft <> 0 then raise exception 'Q-6l FAILED: B read history of A''s DRAFT row (% rows)', v_draft; end if;
  -- PA-PEND-1 was approved in Q-6g, so it HAS history rows.
  select count(*) into v_appr
  from public.price_assumption_history where assumption_id = 'PA-PEND-1';
  if v_appr < 1 then raise exception 'Q-6l FAILED: B cannot read history of approved row (% rows)', v_appr; end if;
  raise notice 'Q-6l passed: draft history hidden from B; approved-row history readable (% rows)', v_appr;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================ Q-6m: anon reads nothing ==
-- (No impersonation; plain anon role.)
set role anon;
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions;
  if v_n <> 0 then raise exception 'Q-6m FAILED: anon read % rows', v_n; end if;
  raise notice 'Q-6m passed: anon reads nothing';
end $$;
reset role;

-- ============================ Q-6n: forged created_by on INSERT → DENIED ==
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.price_assumptions
      (id, resource_code, resource_name, resource_type, price, unit,
       valid_from, source_note, status, created_by)
    values
      ('PA-FORGED-1', 'M-TEST-009', 'Forged row', 'material',
       1000, 'm3', current_date, 'forged created_by', 'DRAFT', current_setting('p1.uid_a')::uuid);
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'Q-6n FAILED: insert with forged created_by was not blocked'; end if;
  raise notice 'Q-6n passed: forged created_by on INSERT blocked (RLS WITH CHECK)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================ Q-6o: INSERT DRAFT with approved_by preset → DENIED ==
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.price_assumptions
      (id, resource_code, resource_name, resource_type, price, unit,
       valid_from, source_note, status, created_by, approved_by)
    values
      ('PA-FORGED-2', 'M-TEST-010', 'Pre-approved draft', 'material',
       1000, 'm3', current_date, 'draft with approver', 'DRAFT', current_setting('p1.uid_b')::uuid, current_setting('p1.uid_b')::uuid);
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'Q-6o FAILED: DRAFT with preset approved_by was not blocked'; end if;
  raise notice 'Q-6o passed: DRAFT carrying approval identity blocked (RLS WITH CHECK)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================ Q-6p: auto-expire sweep still works (positive control) ==
-- The rewritten trigger must not break the cron path: service_role (no
-- JWT) expiring an APPROVED row past valid_until. PA-APPR-1 was seeded
-- with valid_until already in the past (see setup), so no setup UPDATE
-- is needed here — editing an APPROVED row in place is forbidden by the
-- rewritten trigger, by design.
do $$
declare v_n integer; v_status text; v_hist integer;
begin
  v_n := public.price_assumption_sweep_expiry();
  select status into v_status from public.price_assumptions where id = 'PA-APPR-1';
  if v_status <> 'EXPIRED' then raise exception 'Q-6p FAILED: sweep left status %', v_status; end if;
  if v_n < 1 then raise exception 'Q-6p FAILED: sweep expired 0 rows'; end if;
  -- The sweep's history row must exist with a NULL actor (system write —
  -- the 20261012 nil-UUID fallback violated the auth.users FK).
  select count(*) into v_hist from public.price_assumption_history
  where assumption_id = 'PA-APPR-1' and new_status = 'EXPIRED' and by_user is null;
  if v_hist < 1 then raise exception 'Q-6p FAILED: no system-actor (NULL by_user) history row for the sweep'; end if;
  raise notice 'Q-6p passed: auto-expire sweep works after the trigger rewrite (% rows)', v_n;
end $$;

-- ============================ Q-6q: owner happy path still works (positive control) ==
-- A creates a DRAFT, submits it, B approves it, A disables it.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_a')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  insert into public.price_assumptions
    (id, resource_code, resource_name, resource_type, price, unit,
     valid_from, source_note, status, created_by)
  values
    ('PA-HAPPY-1', 'M-TEST-011', 'Happy path row', 'material',
     50000, 'm3', current_date, 'happy path draft', 'DRAFT', current_setting('p1.uid_a')::uuid);
  update public.price_assumptions set price = 55000 where id = 'PA-HAPPY-1';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Q-6q FAILED: owner could not edit own DRAFT'; end if;
  update public.price_assumptions set status = 'PENDING' where id = 'PA-HAPPY-1';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Q-6q FAILED: owner could not submit own DRAFT'; end if;
  raise notice 'Q-6q step 1 passed: owner create/edit/submit works';
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_b')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  update public.price_assumptions set status = 'APPROVED' where id = 'PA-HAPPY-1';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Q-6q FAILED: approver could not approve'; end if;
  raise notice 'Q-6q step 2 passed: approver approve works';
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_a')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  update public.price_assumptions set status = 'DISABLED' where id = 'PA-HAPPY-1';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Q-6q FAILED: owner could not disable own APPROVED row'; end if;
  raise notice 'Q-6q step 3 passed: owner disable works';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================ Q-6r: E (ESTIMATOR) approves → DENIED (OD-A4-1) ==
-- OD-A4-1 (owner decision 2026-11-24 22:49, Option A): ESTIMATOR does
-- NOT approve. E holds ESTIMATOR in W_C — under the P1-D draft E could
-- approve (SUPER_ADMIN-or-ESTIMATOR); after the OD-A4-1 edit E must
-- match 0 rows on approve AND must not even READ the PENDING row.
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_e')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-PEND-3';
  if v_n <> 0 then raise exception 'Q-6r FAILED: ESTIMATOR user E can read PENDING row (% rows)', v_n; end if;
  update public.price_assumptions set status = 'APPROVED' where id = 'PA-PEND-3';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'Q-6r FAILED: ESTIMATOR user E approved A''s row (% rows)', v_n; end if;
  raise notice 'Q-6r passed: ESTIMATOR cannot read or approve PENDING rows (OD-A4-1)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_status text;
begin
  select status into v_status from public.price_assumptions where id = 'PA-PEND-3';
  if v_status <> 'PENDING' then raise exception 'Q-6r FAILED: row left PENDING (status %)', v_status; end if;
end $$;

-- ============================ Q-6s: F (global admin) approves → ALLOWED (OD-A4-1) ==
-- Positive control for the other half of Option A: a global admin with
-- NO workspace membership can read a PENDING row under review and
-- approve it, with approved_by bound server-side to auth.uid() (F).
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('p1.uid_f')::uuid, 'role', 'authenticated')::text, true);
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.price_assumptions where id = 'PA-PEND-4';
  if v_n <> 1 then raise exception 'Q-6s FAILED: global admin F cannot read PENDING row (% rows)', v_n; end if;
  update public.price_assumptions set status = 'APPROVED' where id = 'PA-PEND-4';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Q-6s FAILED: global admin F could not approve (% rows)', v_n; end if;
  raise notice 'Q-6s step 1 passed: global admin F approved (1 row)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_by uuid; v_status text;
begin
  select approved_by, status into v_by, v_status
  from public.price_assumptions where id = 'PA-PEND-4';
  if v_status <> 'APPROVED' then raise exception 'Q-6s FAILED: status is %', v_status; end if;
  if v_by <> current_setting('p1.uid_f')::uuid then raise exception 'Q-6s FAILED: approved_by is % (not F)', v_by; end if;
  raise notice 'Q-6s passed: global admin approval works, approved_by bound to F (OD-A4-1)';
end $$;

do $$ begin
  raise notice 'P1 RLS NEGATIVE TESTS (WC-04): ALL PASSED';
end $$;

\endif

rollback;
-- End of p1_rls_negative_tests.sql — transaction rolled back; no test data persists.
