-- ============================================================================
-- EZRAB Phase 3 — RLS negative tests (NOT EXECUTED: no live database yet)
-- ============================================================================
-- Run manually in the Supabase SQL editor AFTER applying
-- 20261008_phase3_canonical_schema_rls.sql, using TWO test auth users and
-- synthetic data only. Never run against production user data.
--
-- Setup (as service_role, synthetic only):
--   1. Create auth users A and B (Supabase Dashboard > Authentication).
--   2. Insert workspace W_A (member: A as ESTIMATOR) and W_B (member: B).
--   3. Insert project P_A in W_A (member: A), project P_B in W_B (member: B).
--      Capture ids into psql variables, e.g.:
--        \set UID_A 'aaaaaaaa-...'
--        \set UID_B 'bbbbbbbb-...'
--        \set PROJ_A '...'
--        \set PROJ_B '...'
--   4. For each scenario below: SET ROLE authenticated; SET request.jwt.claims
--      to impersonate the test user, run the query, and confirm it is DENIED
--      (0 rows / permission error). Reset after each scenario.
--
-- Helper to impersonate (service_role session):
--   select set_config('request.jwt.claims',
--     json_build_object('sub', :'UID_A', 'role', 'authenticated')::text, true);
-- ============================================================================

-- SCENARIO 1: User A reads project owned by User B -> DENIED
--   impersonate A, then:
--   select * from public.projects where id = :'PROJ_B';
--   EXPECT: 0 rows.

-- SCENARIO 2: User A updates/deletes project of User B -> DENIED
--   impersonate A, then:
--   update public.projects set name = 'hacked' where id = :'PROJ_B';
--   delete from public.projects where id = :'PROJ_B';
--   EXPECT: 0 rows affected (RLS filters the target row away).

-- SCENARIO 3: User from org A reads data of org B -> DENIED
--   impersonate A, then:
--   select * from public.workspaces where id = :'WS_B';
--   select * from public.rab_items where workspace_id = :'WS_B' limit 1;
--   EXPECT: 0 rows.

-- SCENARIO 4: User without membership tries project access -> DENIED
--   Create user C with NO workspace/project membership. Impersonate C, then:
--   select * from public.projects where id = :'PROJ_A';
--   insert into public.rab_items (rab_document_id, project_id, workspace_id,
--     code, description, volume, unit, created_by)
--     values (:'DOC_A', :'PROJ_A', :'WS_A', 'X', 'injected', 1, 'ls', :'UID_C');
--   EXPECT: 0 rows selected; insert raises RLS violation.

-- SCENARIO 5: User tries to forge role / organization id -> DENIED
--   Impersonate A (role ESTIMATOR in W_A). Attempt privilege escalation:
--   update public.workspace_members set role = 'SUPER_ADMIN'
--     where workspace_id = :'WS_A' and user_id = :'UID_A';
--   EXPECT: 0 rows (only SUPER_ADMIN can write workspace_members).
--   Then attempt cross-workspace insert with forged workspace_id:
--   insert into public.projects (workspace_id, name, created_by)
--     values (:'WS_B', 'forged', :'UID_A');
--   EXPECT: RLS violation (A is not a member of W_B).

-- SCENARIO 6: Export/AI read against inaccessible project -> DENIED
--   The app's export and AI-document flows read via the same tables.
--   Impersonate A, then:
--   select * from public.rab_documents where project_id = :'PROJ_B';
--   select * from public.ded_analyses where project_id = :'PROJ_B';
--   select * from public.rab_item_components
--     where rab_item_id in (select id from public.rab_items where project_id = :'PROJ_B');
--   EXPECT: 0 rows on all three.

-- SCENARIO 7: Anonymous access to sensitive tables -> DENIED
--   (no impersonation; plain anon role)
--   reset role; -- ensure role = anon
--   select * from public.projects limit 1;
--   select * from public.rab_items limit 1;
--   select * from public.workspace_members limit 1;
--   EXPECT: 0 rows (all policies require `to authenticated`).

-- TEARDOWN (service_role): delete synthetic workspaces (cascades), then the
-- two test auth users via Dashboard. Verify row counts return to baseline.
