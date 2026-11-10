# EZRAB — Unified Credits Sprint 4: PostgreSQL Runtime Validation

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896`
- **Subject:** `supabase/migrations/20261110_unified_credits_foundation.sql` (1,028 lines, md5 `685d8ad464f94da8ccf3fa09025c0e6c` — unchanged this sprint)
- **Verdict: BLOCKED — NOT RUNTIME VERIFIED.** No SQL was executed against any database in Sprint 4.

---

## 1. Environment discovery (verified 2026-11-10, re-checked this sprint)

| Tool / surface | Result |
|---|---|
| `psql`, `postgres`, `pg_ctl`, `pg_ctlcluster`, `initdb` | MISSING |
| `docker`, `podman` | MISSING |
| `/var/run/docker.sock`, `/run/podman/podman.sock` | absent |
| `postgresql.service` | not found |
| `/usr/lib/postgresql`, `/var/run/postgresql` | absent |

The Sprint 3 finding (no PostgreSQL tooling on this machine) is confirmed unchanged. The Sprint 4 master prompt does **not** authorise installing system packages or altering host services, so no installation was attempted. No connection was made to any user, staging, Preview, or production database. **Production database verification remains unauthorised (grant D16).**

Consequence per the acceptance criteria: every runtime scenario below is **BLOCKED / NOT RUN**, and Sprint 4 overall is at most **PARTIAL**.

## 2. Runtime scenario matrix (all BLOCKED — environment)

| Scenario | Status | Note |
|---|---|---|
| Clean-database migration execution | BLOCKED | No PostgreSQL available |
| Repeated execution / idempotency (F-1) | BLOCKED | Static guard verified (§4) |
| Schema & constraint creation | BLOCKED | — |
| RLS policy behaviour | BLOCKED | Harness has no RLS scenario at all (§3) |
| Grants / revocations under real roles (`SET ROLE`) | BLOCKED | Harness checks privileges only (§3) |
| RPC execution under expected roles; unauthorised-role rejection (CLIENT always rejected) | BLOCKED | Static authorisation verified (§4) |
| Transaction rollback behaviour | BLOCKED | Only indirectly asserted in harness design |
| Reconciliation view permissions (F-2) | BLOCKED | Static REVOKE verified (§4) |
| F-6: concurrent reservations, two independent sessions, 80+80 over balance 100 | BLOCKED | **No executable harness scenario exists** (§3) |
| F-6: account lock before batch allocation; deterministic lock order; in-transaction balance recompute; ROW_COUNT; post-loop `v_need`; no partial reservation; idempotent retry; same-key different-payload conflict | BLOCKED | Static code verified (§4) |
| F-10: concurrent approvals; consumption = approved reserved; overage rollback; terminal CAS; REJECTED terminal; no double consumption; partial allocation cannot become full approval | BLOCKED | **No executable harness scenario exists** (§3) |
| F-4: review↔operation mismatch & authorisation | BLOCKED | Static check verified (§4) |
| F-5: `issue_batch` concurrency & unique-violation replay | BLOCKED | Sequential replay only in harness design |
| F-7: zero / negative / NULL estimated credits rejected | BLOCKED | Static check verified (§4) |

## 3. Sprint 3 harness audit — a structural defect found

The prepared harness at `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT3/sql-harness/` was read in full. It does **not** prove what its README implies:

1. **`concurrency.sh` is not an executable harness.** Its body is an `echo` specification of the scenarios plus `exit 0` (`concurrency.sh:9-28`; it admits this at `:23-27`). `run_all.sh:39-40` therefore "passes" the concurrency stage unconditionally, without running a single concurrent session. The F-6/F-10/F-5 concurrency evidence Sprint 3 deferred to this harness **does not exist in executable form**.
2. **`assertions.sql` never calls `settle_reservation` or `resolve_review`.** Both functions appear only in `pg_proc` existence lists (`assertions.sql:11-12,24-25`). The F-10 approval path has zero sequential coverage, let alone concurrent coverage.
3. **Coverage matrix (design intent vs. Sprint 4 requirements):**
   - *Covered (design):* clean migration apply (`run_all.sh:12-16,26-34`); sequential F-5 replay (`assertions.sql:54-63`).
   - *Partial:* F-1 re-apply (policy guard only); schema (constraints not asserted); grants (only `has_function_privilege`, never a real `SET ROLE` execution); rollback (indirect, via final-state checks); F-2 view (anon/PUBLIC/`security_invoker` behaviour not exercised).
   - *Absent:* RLS behaviour; F-6 concurrent 80+80; F-10 (all); F-4 mismatch scenario; F-7 (0/negative/NULL); authorisation roles CLIENT / SUPER_ADMIN / `billing_admin=true` as executing roles.

**Required harness work before any future runtime claim:** rewrite `concurrency.sh` as real dual-session `psql` scenarios; add `settle_reservation`/`resolve_review` sequences (success, overage, mismatch, rejection, concurrent approval) to `assertions.sql`; add `SET ROLE` authorisation tests; add F-7 rejection cases. Until then, any "harness passed" statement about concurrency would be false.

## 4. Static SQL verification (method: structured textual inspection, `grep -n`; `pgsql-parser` is not present in `node_modules` and was not installed)

All checks against the Sprint 3-repaired draft (line numbers in the current file):

| Check | Result | Evidence |
|---|---|---|
| `reserve_credits`: account lock before batch locks, `FOR UPDATE`, deterministic order | PASS (static) | `:377, 391-395, 411-422` |
| `resolve_review`: account + batch locks before consumption | PASS (static) | `:704, 708, 725-729, 773, 805-816, 871` |
| Post-loop `v_need` assertion (F-6) | PASS (static) | `:463-465`; review-side equivalents `:798-800, 848-850` |
| ROW_COUNT assertions | PASS (static) | 9 sites across `reserve_credits` / `resolve_review` |
| Terminal CAS on review resolution (F-10) | PASS (static) | `:910-921` |
| F-1 idempotent policy guard (`pg_policies`) | PASS (static) | `:88-100` |
| F-2 view REVOKE + `security_invoker` | PASS (static) | `:189-199` |
| F-5 advisory lock + `unique_violation` capture in `issue_batch` | PASS (static) | `:256`, `:308` |
| F-7 amount validation (estimated credits) | PASS (static) | `:384-386` |
| SECURITY DEFINER + pinned `search_path` (all five RPCs) | PASS (static) | function definitions |
| REVOKE from PUBLIC; GRANT execute to `service_role` only | PASS (static) | function grants |
| F-4 review↔operation mismatch + authorisation (CLIENT rejected; SUPER_ADMIN or `billing_admin=true` only) | PASS (static) | `:718-722`, `:734-743` |

### Static findings (documented, NOT fixed — no defect repair was authorised beyond the draft's Sprint 3 state, and none of these may be "fixed" blind)

1. **FAIL by design (SQL layer): same-key replay with a different payload is not conflicted in `issue_batch`** — the first result wins (`:259-264`). The JS ledger (Sprint 3) returns `IDEMPOTENCY_CONFLICT` for the equivalent case. The SQL draft and the JS contract therefore diverge on this point; whichever behaviour is intended must be decided before D16 execution and the draft amended under that grant.
2. **GAP: `settle_reservation` (`:491-637`) contains no ROW_COUNT assertion** — unlike the other two financial RPCs. A silently missed update inside settlement would not raise.
3. **Nuance:** the RPCs have no explicit `REVOKE … FROM anon/authenticated` (only the view does, `:190-191`); they rely on the PUBLIC revoke + service_role-only grant. `security_invoker` on the view is attempted with a NOTICE fallback, so its presence is version-dependent.

## 5. Reproducible disposable setup (written, NOT RUN on this machine)

Location (outside the repo): `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/sql-runtime-setup/`

- `setup-postgres-disposable.sh` — `bash -n` syntax-clean. On a machine with permission it starts a disposable `postgres:16` container (tmpfs storage, port 55432 bound to 127.0.0.1 only, synthetic single-use credentials), and **refuses any non-local PGHOST**, mirroring the `run_all.sh` safeguard. It was **not executed here** (no Docker/PostgreSQL exists on this machine).
- `README.md` — prerequisites, exact commands to run the Sprint 3 harness against the disposable database, the prerequisite migration order (`20261008_phase3_canonical_schema_rls` → `20261102_billing_batch_ledger` → `20261102_phase53_workspace_billing` → `20261109_billing_orders_subscriptions` → `20261110_unified_credits_foundation`), the harness gaps from §3 that must be closed first, and the standing warning that **production execution still requires the separate D16 grant** regardless of disposable results.

## 6. Status separation (required)

- **Static review:** DONE this sprint (§4) — PASS with three documented findings.
- **Disposable PostgreSQL runtime verification:** **NOT DONE — BLOCKED** (environment; harness additionally incomplete per §3).
- **Production database verification:** **NOT AUTHORISED** (D16 pending) and not attempted.

Passing disposable tests in the future would still not, by itself, declare this migration ready for execution against a real environment.
