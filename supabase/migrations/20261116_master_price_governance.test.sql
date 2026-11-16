-- ============================================================================
-- EZRAB Master Pricing §4 — SQL TESTS for 20261116_master_price_governance
-- (§14.1 authorization tests, server-side / RLS layer)
-- ============================================================================
-- STATUS: BLOCKED — DOCUMENTED, NOT RUNNABLE.
-- These tests require a Supabase Postgres instance with
-- 20261116_master_price_governance.sql APPLIED. No such instance is
-- available in this environment (migrations NOT APPLIED; no live DB
-- access; AUTH_ENABLED=false). DO NOT claim these tests passed.
--
-- HOW TO RUN (once the §2.4.7 blockers clear):
--   1. Apply 20261008, then 20261012, then 20261116 to a NON-PRODUCTION
--      Supabase project (or `supabase db reset` locally).
--   2. Run this file with psql as the postgres/service_role user:
--        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>
--   3. Every assertion that fails raises an exception (the run aborts).
--      A clean run ends with: NOTICE 'MASTER PRICE GOVERNANCE SQL TESTS: ALL PASSED'.
--
-- SELF-GUARD: if the migration tables do not exist, the file prints
--   NOTICE 'BLOCKED — migration 20261116 not applied; tests skipped'
-- and exits WITHOUT failing (exit 0). That is the honest outcome in
-- this environment — the tests are documented, not faked.
--
-- The whole file runs inside ONE transaction that is ROLLED BACK at
-- the end, so no test data persists.
-- ============================================================================

begin;

do $$
declare
  v_applied boolean;
  v_admin uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_history_count integer;
  v_version integer;
  v_ok boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'master_price_records'
  ) into v_applied;

  if not v_applied then
    raise notice 'BLOCKED — migration 20261116_master_price_governance not applied; SQL tests skipped (documented, not run)';
    return;
  end if;

  raise notice 'Migration applied — running master price governance SQL tests...';

  -- T1: helper exists; anonymous (no JWT) is NOT a global admin.
  -- (psql as service_role has auth.uid() = null.)
  if public.ezrab_is_global_admin() then
    raise exception 'T1 FAILED: anonymous/service_role must not be a global admin';
  end if;
  raise notice 'T1 passed: ezrab_is_global_admin() is false without a JWT';

  -- T2: history table has NO client INSERT/UPDATE/DELETE policies
  -- (append-only; only the trigger writes).
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'master_price_history'
      and cmd in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'T2 FAILED: master_price_history must have no INSERT/UPDATE/DELETE policies';
  end if;
  raise notice 'T2 passed: master_price_history is insert-only (no client write policies)';

  -- T3: no DELETE policy on any master_price_* table.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('master_price_entities','master_price_records',
                        'master_price_history','master_price_aliases',
                        'ahsp_database_versions','global_admins')
      and cmd = 'DELETE'
  ) then
    raise exception 'T3 FAILED: master_price_* tables must have no DELETE policy';
  end if;
  raise notice 'T3 passed: no DELETE policy on any master_price_* table';

  -- T4: negative amount rejected by CHECK (service_role bypasses RLS
  -- but NOT check constraints).
  insert into public.master_price_entities
    (resource_id, canonical_name, category, primary_unit)
    values ('RES-TEST-001', 'Test Material', 'MATERIAL', 'kg');
  begin
    insert into public.master_price_records
      (id, resource_id, amount, unit, location_level, effective_from,
       period_label, source_key, source_tier, source_name, change_reason)
      values ('PRC-TEST-NEG', 'RES-TEST-001', -100, 'kg', 'NATIONAL',
              '2026-01-01', '2026-Q1', 'TEST', 'COMMERCIAL_REFERENCE',
              'Test Source', 'negative amount test case');
    raise exception 'T4 FAILED: negative amount was accepted';
  exception when check_violation then
    raise notice 'T4 passed: negative amount rejected by CHECK';
  end;

  -- T5: NULL amount (explicitly unresolved) is ACCEPTED, and the
  -- trigger writes a CREATE history row.
  insert into public.master_price_records
    (id, resource_id, amount, unit, location_level, effective_from,
     period_label, source_key, source_tier, source_name, change_reason)
    values ('PRC-TEST-NULL', 'RES-TEST-001', null, 'kg', 'NATIONAL',
            '2026-01-01', '2026-Q1', 'TEST', 'COMMERCIAL_REFERENCE',
            'Test Source', 'null price test case');
  select count(*) into v_history_count from public.master_price_history
    where price_record_id = 'PRC-TEST-NULL' and operation = 'CREATE'
      and new_amount is null;
  if v_history_count <> 1 then
    raise exception 'T5 FAILED: expected 1 CREATE history row with null amount, got %', v_history_count;
  end if;
  raise notice 'T5 passed: NULL amount accepted + CREATE history row written';

  -- T6: a change WITHOUT a reason is rejected by the trigger.
  begin
    update public.master_price_records
      set amount = 5000, version = 2
      where id = 'PRC-TEST-NULL';
    raise exception 'T6 FAILED: update without change_reason was accepted';
  exception when raise_exception then
    raise notice 'T6 passed: update without change_reason rejected';
  end;

  -- T7: version must increment by exactly 1.
  begin
    update public.master_price_records
      set amount = 5000, version = 5, change_reason = 'version jump test case'
      where id = 'PRC-TEST-NULL';
    raise exception 'T7 FAILED: version jump 1 → 5 was accepted';
  exception when raise_exception then
    raise notice 'T7 passed: version jump rejected';
  end;

  -- T8: a valid update bumps the version, writes an UPDATE history row
  -- with old/new amounts, and clears the transient inputs.
  update public.master_price_records
    set amount = 5000, version = 2, change_reason = 'valid update test case',
        change_affected_ahsp = array['A.1.1.1'], change_affected_projects = array['PRJ-1']
    where id = 'PRC-TEST-NULL';
  select version into v_version from public.master_price_records where id = 'PRC-TEST-NULL';
  if v_version <> 2 then
    raise exception 'T8 FAILED: expected version 2, got %', v_version;
  end if;
  select count(*) into v_history_count from public.master_price_history
    where price_record_id = 'PRC-TEST-NULL' and operation = 'UPDATE'
      and previous_amount is null and new_amount = 5000
      and affected_ahsp_references = array['A.1.1.1']
      and affected_live_price_projects = array['PRJ-1'];
  if v_history_count <> 1 then
    raise exception 'T8 FAILED: expected 1 UPDATE history row with old/new amounts, got %', v_history_count;
  end if;
  select (change_reason is null and change_affected_ahsp = '{}') into v_ok
    from public.master_price_records where id = 'PRC-TEST-NULL';
  if not v_ok then
    raise exception 'T8 FAILED: transient trigger inputs were not cleared';
  end if;
  raise notice 'T8 passed: valid update → version 2 + UPDATE history row + transient inputs cleared';

  -- T9: status transition SUPERSEDED → ACTIVE is rejected (no resurrection).
  update public.master_price_records
    set status = 'SUPERSEDED', version = 3, change_reason = 'deactivate test case'
    where id = 'PRC-TEST-NULL';
  begin
    update public.master_price_records
      set status = 'ACTIVE', version = 4, change_reason = 'resurrect test case'
      where id = 'PRC-TEST-NULL';
    raise exception 'T9 FAILED: SUPERSEDED → ACTIVE was accepted';
  exception when raise_exception then
    raise notice 'T9 passed: SUPERSEDED → ACTIVE rejected';
  end;

  -- T10: alias anti-self-approval (CHECK + trigger).
  insert into public.master_price_aliases (resource_id, alias, proposed_by)
    values ('RES-TEST-001', 'test alias', v_admin);
  begin
    update public.master_price_aliases
      set status = 'APPROVED', approved_by = v_admin, approved_at = now()
      where resource_id = 'RES-TEST-001' and alias = 'test alias';
    raise exception 'T10 FAILED: self-approval was accepted';
  exception when check_violation or raise_exception then
    -- Either the CHECK constraint or the transition trigger rejects it
    -- (defense in depth — the trigger fires first in practice).
    raise notice 'T10 passed: self-approval rejected (CHECK + trigger)';
  end;
  update public.master_price_aliases
    set status = 'APPROVED', approved_by = v_other, approved_at = now()
    where resource_id = 'RES-TEST-001' and alias = 'test alias';
  raise notice 'T10b passed: approval by a different admin accepted';

  -- T11: grant function requires a >= 10 char reason.
  begin
    perform public.ezrab_grant_global_admin(v_admin, 'short');
    raise exception 'T11 FAILED: short grant reason was accepted';
  exception when raise_exception then
    raise notice 'T11 passed: short grant reason rejected';
  end;

  raise notice 'MASTER PRICE GOVERNANCE SQL TESTS: ALL PASSED (T1–T11)';
end $$;

rollback;
