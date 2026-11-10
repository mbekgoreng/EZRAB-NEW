# EZRAB — Unified Credits Sprint 5: Harness Validation

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- **Subject:** the new disposable-PostgreSQL harness at `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/` (outside the repo; the Sprint 3 harness was left untouched as historical evidence)
- **Verdict:** harness **logic PROVEN** at the bash layer; harness **database execution NOT RUN** — no PostgreSQL exists on this machine and installation is not authorised. A harness that cannot fail is not evidence; this document separates what was executed from what was only written.

---

## 1. Why a new harness (the Sprint 3 defect, restated)

Sprint 4 proved the Sprint 3 harness could not support any concurrency claim:

1. `concurrency.sh` was an `echo` specification ending in `exit 0` — `run_all.sh` "passed" concurrency unconditionally without running a single session.
2. `assertions.sql` never called `settle_reservation` or `resolve_review` (both appeared only in `pg_proc` existence lists).
3. Grants were checked with `has_function_privilege` only — never a real `SET ROLE` execution; RLS behaviour, F-4, F-7 and all F-6/F-10 concurrent scenarios were absent.

Harness v2 was built to close exactly those gaps. It does **not** inherit any Sprint 3 pass claim.

## 2. Harness design (what exists on disk)

| File | Role |
|---|---|
| `lib.sh` | Fail-closed guards + counting assertions + cleanup trap |
| `setup.sql` | Dummy NOLOGIN roles (disposable DB only), synthetic tariff row, seed helpers (`harness_seed`, `harness_new_op`, `harness_issue_ok`), per-scenario isolated fixtures (distinct UUID prefixes; SUPER_ADMIN owner with `billing_admin=false`, a CLIENT member, an EDITOR with `billing_admin=true`) |
| `assertions2.sql` | Sequential coverage the old harness lacked: full settle, partial settle/release, overage → review, APPROVED, REJECTED + re-resolve rejection, CLIENT rejection, F-4 mismatch, F-7, expirations sweep + idempotency + reserved-portion protection, the Sprint 5 `IDEMPOTENCY_CONFLICT` tripwire, final reconciliation-view invariant over **all** fixture batches |
| `concurrency.sh` | Real two-session scenarios S1–S6 (see §3) |
| `selftest.sh` | Proves the harness can fail (§4) |
| `run_all.sh` | Orchestration: guards → create marked disposable DB → prerequisites → **subject re-apply (F-1) before fixtures** (chosen placement, documented in the harness README) → `assertions2.sql` → `concurrency.sh` → per-stage PASS/FAIL summary with aggregate non-zero exit → drop own DB (trap) |
| `sql-object-crosscheck.txt` | Record of the static name crosscheck against prerequisite DDL (0 mismatches; SCHEMA-1…5 recorded in the SQL runtime validation document) |

### Fail-closed guards (`lib.sh`) — all refuse, never silently override

- `PGHOST` non-loopback, connection string pointing off-loopback, or empty `PGHOST` (standalone scenario entry) → **exit 2**.
- `PGDATABASE` not matching `^ezrab_sprint5_disposable_` → **exit 2**.
- `psql` absent → **exit 3** with an explicit BLOCKED message.
- Before any scenario: verify `SELECT current_database()` matches the expected disposable database **and** its database comment equals the marker `EZRAB_SPRINT5_DISPOSABLE`.
- Cleanup drops **only** the harness's own marked disposable database.

## 3. Independent-session proof design (S1–S6)

Each concurrency scenario uses **two real `psql` processes connected as independent sessions**, coordinated without sleeps-as-correctness:

1. Session A opens a transaction, takes the scenario advisory lock, performs the first step that holds the competing row locks, and — from **inside** the session (psql `\!`) — writes a ready-marker file.
2. Session B starts only after the marker exists (bounded polling of the marker file — coordination, not correctness).
3. A **third observer session** verifies in `pg_stat_activity` that B is actually blocked waiting before A is allowed to commit — the interleaving is *observed*, not assumed.
4. A releases; both sessions' outcomes are captured to result files; final batch/ledger state and the reconciliation invariant are asserted.

Scenarios: **S1** concurrent reserve 80+80 over balance 100 · **S2** concurrent FREE_ONCE same-key grant (+ S2b different-payload conflict) · **S3** concurrent settle (loser `duplicate`) · **S4** concurrent review approval (loser `already_resolved`, CAS rollback) · **S5** reservation vs expiry in both lock orders (identical final state asserted) · **S6** failure atomicity (deliberate RAISE after `issue_batch`, full rollback, retry succeeds exactly once).

**None of S1–S6 has been executed** — there is no PostgreSQL on this machine. The design above is implemented code, not executed evidence.

## 4. Self-test — EXECUTED on this machine (bash layer only)

Record: `sql-harness-v2/selftest-output.txt`. `selftest.sh` overall: **5 passed, 0 failed, exit 0.**

| Check | Result | Exit code |
|---|---|---|
| Deliberately failing assertion → failure summary non-zero | PASS | 1 |
| Passing assertion → summary zero | PASS | 0 |
| `PGHOST=db.example.com` refused | PASS | 2 |
| `PGDATABASE=ezrab_production` refused | PASS | 2 |
| No `psql` present → BLOCKED | PASS | 3 |

Additionally executed here: `bash -n` clean for all four shell scripts; `run_all.sh` stops at exit 3 (BLOCKED) before touching anything; `concurrency.sh` standalone exits 3 with a valid local environment and 2 with an empty `PGHOST`.

This proves the harness **cannot silently pass**: assertions count failures into the exit status, guards refuse unsafe targets, and the absence of a database is a hard BLOCKED, not a pass. It does **not** prove any SQL behaviour.

## 5. Honest status

- Harness correctness (guards, assertions, exit semantics): **PASS** (executed, bash layer).
- Harness database execution (migration apply, `setup.sql`, `assertions2.sql`, S1–S6, `run_all.sh` end-to-end): **NOT RUN — BLOCKED** (environment; approval needed is recorded in `UNIFIED_CREDITS_SPRINT_5_SQL_RUNTIME_VALIDATION.md` §1).
- No SQL was executed against any database in Sprint 5. No installation was performed.
