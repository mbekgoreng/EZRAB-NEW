# EZRAB — Unified Credits Sprint 7: PostgreSQL Provisioning Specification

- **Date:** 2026-11-10 · **Repo:** `/home/hatch/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896`
- **Subject migration:** `supabase/migrations/20261110_unified_credits_foundation.sql`, 1,227 lines, md5 `170f0d79b0b43dccea9f81b95ed5ea27` (Sprint 6 value, re-verified in Sprint 7 Phase 0).
- **Harness:** `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/` (`run_all.sh`, `lib.sh`, `setup.sql`, `assertions2.sql`, `concurrency.sh`, `selftest.sh`, `README.md`).
- **Status of this document:** a specification for a future owner-authorised provisioning act. **Nothing in it was executed in Sprint 7.** No PostgreSQL, Docker or Podman exists on this machine (re-verified 2026-11-10T08:34Z, Sprint 7 Phase 0) and no installation is authorised by the Sprint 7 prompt. Every requirement below is derived from the actual migration chain and the actual harness files — file and line evidence is given for each; nothing is invented.

---

## 1. Required PostgreSQL compatibility

| Requirement | Value | Derivation |
|---|---|---|
| Server | PostgreSQL **16** (the harness-documented target) | `sql-harness-v2/README.md` "Prerequisites"; `lib.sh` BLOCKED message ("run this harness on a machine with PostgreSQL 16 + psql") |
| Flavour | **Supabase-flavoured** — vanilla `postgres:16` is NOT sufficient | Finding SCHEMA-2 (harness `README.md`; `setup.sql` §4a fails closed with `prerequisite_missing_auth_schema`): the prerequisite chain needs the Supabase `auth` schema, which no repository migration creates (evidence §2 below) |
| Image (if containerised) | `supabase/postgres` (a current 15.x or 17.x tag of the owner's choosing) | Sprint 6 provisioning request (`UNIFIED_CREDITS_SPRINT_6_POSTGRES_RUNTIME.md` §3) |
| Client | `psql` on the **host** PATH (the harness invokes host `psql`) | `lib.sh` `harness_require_psql` (exit 3 BLOCKED when absent); all harness scripts call `psql` directly |
| Built-in functions relied on | `gen_random_uuid()` (core since PostgreSQL 13 — no extension) | `20261008_phase3_canonical_schema_rls.sql` lines 41, 55, 78 and passim (used as column defaults) |
| Extensions | **None.** No migration in the repository contains a `CREATE EXTENSION` statement (verified by grep over `supabase/migrations/*.sql` in Sprint 7). In particular there is no `pgcrypto` or `uuid-ossp` requirement. Any Supabase-internal extensions shipped by the chosen image are the image's own business, not a harness requirement. | Sprint 7 grep evidence |
| Reachability | Loopback only — `127.0.0.1`, `localhost` or `::1` | `lib.sh` `harness_guard_env`: empty `PGHOST` refused, connection-string-shaped `PGHOST` refused, non-loopback refused (all exit 2) |

## 2. Required Supabase schemas and roles

### 2.1 Schema `auth` — must pre-exist

No migration in the chain creates schema `auth`, `auth.users`, or any `auth.*` function; the chain **consumes** them:

- `20261008_phase3_canonical_schema_rls.sql` line 34: `profiles.id … references auth.users(id) on delete cascade` — the only `auth.users` **column** referenced anywhere in the chain is `id` (verified by grep; the harness seed inserts exactly that column).
- Same file, line 271–273: `drop trigger if exists on_auth_user_created_profile on auth.users; create trigger … after insert on auth.users`.
- Same file: `auth.uid()` called in policies and helper functions (lines 226, 233, 240, 253 and passim, e.g. lines 301, 303, 318, 327, 350, 358).
- `auth.role()` is referenced only by `20261017_blog_cms.sql`, which is **not** in the harness chain; it is recorded here for completeness only and is not a harness requirement.
- Harness behaviour when absent: `setup.sql` `harness_seed` raises `prerequisite_missing_auth_schema` and seeds nothing — fail-closed by design, no shim is created.

A Supabase-flavoured image/server provides `auth.users`, `auth.uid()` and `auth.role()`. A vanilla server does not, and the **first prerequisite fails** there (Sprint 5 finding SCHEMA-2).

### 2.2 Roles

| Role | Must exist because | Evidence |
|---|---|---|
| `service_role` | The subject migration grants `EXECUTE` on all five RPCs to `service_role` **only**, and revokes from PUBLIC/`anon`/`authenticated`; the reconciliation view is likewise revoked. `GRANT … TO service_role` errors if the role does not exist. | Subject migration lines 440, 594, 823, 1128, 1203 (grants); 436–439, 590–593, 819–822, 1124–1127, 1199–1202 (revokes); view revokes 224–226 |
| `anon` | Named in explicit `REVOKE ALL … FROM anon` statements (same lines) and in prerequisite RLS policies `TO anon` where present; a `REVOKE … FROM` a non-existent role errors. | Subject migration lines 438, 592, 821, 1126, 1201 |
| `authenticated` | Named in explicit revokes (same lines) and pervasively in prerequisite policies (`create policy … to authenticated using (… auth.uid() …)`). | Subject lines 439, 593, 822, 1127, 1202; `20261008` lines 300–358 passim; `20260913_auth_membership_foundation.sql` lines 71–75 |
| `postgres` (bootstrap superuser) | Default `PGUSER` of `run_all.sh`; database creation/drop and migration application run as this user in the harness flow. | `run_all.sh`: `PGUSER="${PGUSER:-postgres}"` |

The harness `setup.sql` §2 additionally creates **dummy NOLOGIN** `service_role` / `authenticated` / `anon` roles `IF NOT EXISTS` — but that runs *after* the migrations are applied, so it cannot substitute for the roles existing **before** migration application on a vanilla server. On a Supabase-flavoured server all three already exist and the harness block is a no-op safety net for the disposable cluster only.

### 2.3 Schemas created by the chain itself

`public` only. All chain objects (tables, views, functions) are created in `public`; the five RPCs pin `SET search_path = public` (subject lines 277, 471, 632, 866, 1144).

## 3. Required privileges

- The applying user must be able to: create/drop the disposable database; create tables, views, functions, triggers and policies in `public`; create a trigger on `auth.users` (prerequisite 1) — in practice the disposable cluster's superuser (`postgres`), or an owner-equivalent role on a Supabase-flavoured install.
- The five RPCs are `SECURITY DEFINER` (subject lines 276–277 and equivalents), so their runtime behaviour is owner-context; the harness deliberately invokes them as the database owner rather than via `SET ROLE service_role` (harness `README.md`, closing note). Execute-privilege verification by actual roles (catalogue + `SET ROLE`) is harness scenario **P-1**'s job and remains **NOT RUN**.
- No privilege beyond the disposable cluster is required or permitted: the harness never connects anywhere else (loopback guard, §5).

## 4. Required connection configuration

From `run_all.sh` and `lib.sh` (verbatim semantics):

| Variable | Required value | Notes |
|---|---|---|
| `PGHOST` | `127.0.0.1` (default in `run_all.sh`) | Must be set explicitly; empty is refused (exit 2). `localhost` / `::1` also accepted by the guard. Connection strings are refused. |
| `PGPORT` | The disposable server's loopback port (default `5432`; the Sprint 4 disposable setup used `55432`) | Non-standard port recommended so the disposable server can never be confused with a system PostgreSQL. |
| `PGUSER` | `postgres` (default) or the disposable cluster's owner-equivalent | See §3. |
| `PGPASSWORD` | The disposable server's **synthetic one-time** credential | Never a real credential; never written to any file or the repository (harness `README.md` run commands). |
| `PGDATABASE` | Set **by the harness itself** to its own created database | A caller-preset `PGDATABASE` is validated by the guard **before** being replaced; a preset pointing anywhere non-disposable is refused, never silently overridden (`run_all.sh` guard-order comment). |
| `REPO` | Path to the `ezrab-unified` checkout (default `$HOME/workspace/ezrab-unified`) | `run_all.sh` aborts BLOCKED (exit 5) if any migration file is missing. |

Guard exit-code contract (`lib.sh`): **2** = refused target (non-loopback/empty/connection-string host, or non-disposable database name); **3** = BLOCKED (no `psql` on PATH); **4** = database identity/marker verification failed; **5** = migration file missing (`run_all.sh`).

## 5. Required disposable database naming and marker

**Current enforced contract (do not rename silently):**

- Name pattern: `^ezrab_sprint5_disposable_[A-Za-z0-9_]+$` (`lib.sh` `HARNESS_DB_PATTERN`). `run_all.sh` creates `ezrab_sprint5_disposable_<yyyymmddhhmmss>_<pid>`.
- Database comment marker: `EZRAB_SPRINT5_DISPOSABLE` (`lib.sh` `HARNESS_DB_MARKER`), applied by `run_all.sh` via `COMMENT ON DATABASE … IS 'EZRAB_SPRINT5_DISPOSABLE'` immediately after creation, re-asserted inside the database by `setup.sql` §1 (`harness_db_marker_missing` on mismatch), and verified by `harness_verify_db_identity` (`current_database()` + `shobj_description`) before any scenario runs.
- The marker is also re-verified by the cleanup path before any drop (§6).

**Owner decision required (unchanged from Sprint 6):** the Sprint 6/7 naming (`ezrab_sprint6_disposable_…` / `ezrab_sprint7_disposable_…`) was prescribed by later master prompts, but harness v2 enforces its Sprint 5 pattern and Sprint 7 did not rewrite it for style. The authorised run either (i) proceeds under the harness's own Sprint 5 pattern and marker, or (ii) the owner approves a deliberate guard update (pattern + marker, in `lib.sh`, `setup.sql` §1, and `run_all.sh`'s generated name/comment) to a newer sprint naming. Either is safe; the choice is the owner's and is recorded as an open item in the Sprint 7 final report.

## 6. Required cleanup conditions

Disposal is the harness's own restricted procedure — and nothing broader is ever permitted:

1. Cleanup runs only from `run_all.sh`'s EXIT trap, calling `lib.sh` `harness_drop_own_db`.
2. Before dropping, `harness_drop_own_db` re-verifies **both** the name pattern **and** the marker comment against the live database; on any mismatch it refuses (return 2) and leaves the database in place for manual inspection.
3. The drop targets exactly the database the harness created in that run (`DROP DATABASE IF EXISTS "<its own name>"`, issued against the `postgres` maintenance database).
4. `concurrency.sh`'s own EXIT trap removes only its per-run temporary directory (`$TMPD`) — after the Sprint 7 hardening it does this even on timeout-failure exits (the trap fires on every exit path).
5. If the container path is used, the container itself is removed at the end (Sprint 4 setup used a trap for this; data on `--tmpfs` vanishes with it).
6. A broad database deletion command is never run. If cleanup cannot be verified, the correct action is to stop and report the exact remaining resource.

## 7. Required isolation from all existing databases

- **Loopback-only binding:** the disposable server publishes only on `127.0.0.1` at a non-standard port; nothing is exposed on any external interface.
- **Disposable data:** container data on `--tmpfs` (vanishes with the container) or a throwaway local cluster/data directory created for the run; no volume shared with any existing database.
- **Synthetic identities only:** all fixtures are harness-generated UUID sets (`setup.sql` `harness_seed`); no real user, customer, or production data is ever loaded. The single tariff fixture row (`harness-tariff-v1`) has all price columns **NULL** — the harness never invents a tariff (finding SCHEMA-5).
- **No connection to any existing database:** the guard refuses non-loopback hosts and connection strings outright; there is no code path in the harness that can reach a persistent, staging, or production database.
- **D16 boundary:** this specification covers a *local disposable* environment only. Applying any migration in this chain to a real Supabase project (local persistent, staging, or production) is a separate act requiring the owner's **D16** grant; the harness guardrails are not a substitute for that grant.

## 8. Migration chain the environment must satisfy (exact order)

`run_all.sh` applies, never skipping and never reordering:

1. `20261008_phase3_canonical_schema_rls.sql`
2. `20261102_billing_batch_ledger.sql`
3. `20261102_phase53_workspace_billing.sql`
4. `20261109_billing_orders_subscriptions.sql`
5. `20261110_unified_credits_foundation.sql` ← subject (md5 `170f0d79b0b43dccea9f81b95ed5ea27`)

then **re-applies the subject** (F-1: second application must be a safe no-op — subject only; the prerequisites are *not* themselves re-runnable, finding SCHEMA-4), then `setup.sql`, `assertions2.sql`, `concurrency.sh`.

## 9. Required evidence capture

For the authorised run, capture and preserve **outside the repository** (the Sprint 5/6/7 snapshot pattern):

- Environment identity: PostgreSQL version (`SELECT version()`), image/runtime identity and tag, host/port.
- Migration checksum before execution (md5 of the subject file) and confirmation it matches the expected Sprint 5/6/7 value.
- Full migration output for every file, with exit codes and timestamps (start/finish), including any warnings.
- Harness self-test output (bash layer) from the same machine.
- Per-scenario results: `assertions2.sql` stage outcome; `concurrency.sh` per-scenario assertion output **including the observer's `pg_stat_activity` lock-wait evidence, session exit codes, and final-state assertions**; P-1 catalogue + `SET ROLE` results.
- The invariant result after scenarios: reconciliation view consistency (`credit_batch_reconciliation.is_consistent` for every fixture batch — asserted by both `assertions2.sql`'s final block and `concurrency.sh`'s FINAL check).
- Final reconciliation output and the per-stage harness summary.
- Disposal confirmation: the disposable database (and container, if any) removed; explicit confirmation that no other database was touched.
- The exact commands run, verbatim.

**Honesty rules for the evidence:** a scenario counts as PASS only if it actually executed against PostgreSQL; static review is never runtime verification; a successful migration alone is not concurrency verification; if the observer cannot prove the intended interleaving for a scenario, that scenario is NOT VERIFIED (Sprint 6 concurrency-evidence protocol).
