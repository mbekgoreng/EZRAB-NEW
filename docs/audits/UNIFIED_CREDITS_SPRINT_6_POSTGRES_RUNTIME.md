# EZRAB — Unified Credits Sprint 6: PostgreSQL Runtime

- **Date:** 2026-11-10 · **Repo:** `/home/hatch/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- **Subject:** `supabase/migrations/20261110_unified_credits_foundation.sql` — Sprint 5 amended draft, 1,227 lines, md5 `170f0d79b0b43dccea9f81b95ed5ea27` (re-verified this sprint; unchanged).
- **Verdict: BLOCKED — NOT RUNTIME VERIFIED.** No SQL was executed against any database in Sprint 6. The environment gate was re-verified with actual commands (not copied from Sprint 4/5 conclusions) and failed. No installation was attempted; the master prompt does not authorise it.

---

## 1. Environment discovery — the first gate (executed 2026-11-10T06:33:48Z)

Command set: `command -v` for each binary; socket and directory listing; listening-port scan; environment scan. Actual output:

| Check | Result |
|---|---|
| `psql` | **MISSING** |
| `postgres` | **MISSING** |
| `pg_ctl` | **MISSING** |
| `initdb` | **MISSING** |
| `docker` | **MISSING** |
| `podman` | **MISSING** |
| `pg_isready`, `createdb` | **MISSING** |
| `/var/run/docker.sock`, `/run/docker.sock` | No such file or directory |
| `/run/podman/podman.sock`, podman machine dir | No such file or directory |
| `/usr/lib/postgresql`, `/usr/pgsql*`, `/opt/postgresql` | No such file or directory |
| Listening ports 5432 / 5433 | none |
| `PG*` / `DATABASE_URL` / `SUPABASE*` environment variables | none present |

No existing authorised database endpoint is configured on this machine, and no reachable database was reused (reuse merely because reachable is prohibited). No production, staging, shared-development or user-data database was touched — none is reachable from here.

**Gate decision: STOP the runtime workstream.** Per §3 of the master prompt, a blocked environment is never reported as a runtime PASS, and no silent switch to a hosted database was made.

## 2. Migration identity (verified, not executed)

- Checksum verified **before** any would-be execution: md5 `170f0d79b0b43dccea9f81b95ed5ea27` — exactly the Sprint 5 expected value; 1,227 lines. No diff against the Sprint 5 draft exists, so the §5 ownership stop-condition did not trigger.
- PostgreSQL version / image identity / database identity / timestamps / migration output / exit code: **none** — the migration was never run.
- Static identity of the draft (grep-level, read-only, this sprint): five RPCs with expected signatures (`issue_batch` line 261, `reserve_credits` 464, `settle_reservation` 622, `resolve_review` 855, `apply_expirations` 1137); `SECURITY DEFINER` + `SET search_path = public` on all five; explicit revokes from PUBLIC/anon/authenticated and service-role-only grants at the Sprint 5 line numbers; reconciliation-view revokes at lines 224–226. **Zero drift** vs the Sprint 5 final report §D.

## 3. Exact provisioning request (what the owner is asked to authorise)

**Minimum environment — one of:**
- **(a)** Authorisation to install **Docker Engine** on this VM (`/home/hatch` workspace VM), used only to run a disposable container; **or**
- **(b)** Authorisation to install **PostgreSQL 16 + the `psql` client** on this VM, used only for a disposable local database; **or**
- **(c)** Any existing **Docker-capable machine** the owner designates.

**Image (mandatory correction to the Sprint 4 setup script):** a **Supabase-flavoured** PostgreSQL image — `supabase/postgres` (a current 15.x or 17.x tag of the owner's choosing) — **not** vanilla `postgres:16`. Reason (Sprint 5 finding SCHEMA-2): the prerequisite migration chain depends on the Supabase `auth` schema (`auth.users`, `auth.uid()`, a trigger on `auth.users` in `20261008_phase3_canonical_schema_rls.sql`) and on the Supabase roles `anon`, `authenticated`, `service_role`; no repository migration creates them, so on vanilla `postgres:16` the **first prerequisite itself fails**. The `supabase/postgres` image ships that schema and those roles.

**How it must be run (disposable discipline):**
- Container (path a/c): `--tmpfs` data directory (data vanishes with the container), published **only** on `127.0.0.1` at a non-standard host port (the Sprint 4 script used `55432`), synthetic one-time credentials generated per run and never written to any file or the repository; container removed by trap at the end. Host `psql` client must exist (the harness calls `psql` from the host) — under path (a) this means the `postgresql-client` package or an equivalent; under path (b) it is included.
- Database naming: harness v2 creates and accepts **only** databases matching `^ezrab_sprint5_disposable_[A-Za-z0-9_]+$` and stamps/verifies the database comment marker `EZRAB_SPRINT5_DISPOSABLE`. **Recorded discrepancy:** the Sprint 6 master prompt prescribes `ezrab_sprint6_disposable_…` naming; harness v2 enforces the Sprint 5 pattern and was not rewritten for style. The authorised run either (i) proceeds under the harness's own pattern/marker, or (ii) the owner approves a deliberate one-line guard update in `lib.sh` (pattern + marker) to the Sprint 6 naming. Either is safe; the choice is the owner's.
- Identity verification before any scenario (already implemented in the harness, fail-closed): non-loopback `PGHOST` refused (exit 2); non-disposable database name refused (exit 2); missing `psql` → BLOCKED (exit 3); `current_database()` and the comment marker verified before migrations and again before scenarios; cleanup drops **only** the harness's own marked database.
- Execution command (future, not run): `bash ~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/run_all.sh` — it creates its own marked disposable database, applies the four prerequisites + the subject draft (including the F-1 re-apply check), runs `assertions2.sql`, then the two-session concurrency scenarios S1–S6, then drops its own database.
- Disposal: after evidence capture, verify the database is exclusively the harness's, run its restricted cleanup, confirm the disposable database (and container, if any) is removed, and confirm no other database was touched.

**What this grant would NOT authorise:** executing the migration against any persistent or production Supabase project (that remains owner grant **D16**), or any billing activation.

## 4. Status separation (required)

- **Static review:** DONE — zero drift vs the Sprint 5 amended draft (this sprint, grep-level with line evidence; full table in `UNIFIED_CREDITS_SPRINT_6_SQL_AUTHORIZATION.md` for privileges and the final report §D for the rest).
- **Disposable PostgreSQL runtime verification:** **NOT DONE — BLOCKED** (no authorised PostgreSQL environment; harness v2 re-self-tested at the bash layer and ready).
- **Production database verification:** **NOT AUTHORISED** (D16 pending) and not attempted.

A future green disposable run would prove the tested behaviour in that disposable environment only; it would not by itself make the migration production-ready.
