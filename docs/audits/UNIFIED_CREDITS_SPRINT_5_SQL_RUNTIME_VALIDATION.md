# EZRAB — Unified Credits Sprint 5: SQL Runtime Validation

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- **Subject:** `supabase/migrations/20261110_unified_credits_foundation.sql` — Sprint 5 amended draft, 1,227 lines, md5 `170f0d79b0b43dccea9f81b95ed5ea27` (pre-Sprint-5 md5 `685d8ad464f94da8ccf3fa09025c0e6c`)
- **Verdict: BLOCKED — NOT RUNTIME VERIFIED.** No SQL was executed against any database in Sprint 5. This document supersedes nothing; Sprint 3/4 SQL documents remain the historical record.

---

## 1. Environment evidence (re-verified 2026-11-10, this sprint)

| Tool / surface | Result |
|---|---|
| `psql`, `postgres`, `pg_ctl`, `pg_ctlcluster`, `initdb` | MISSING |
| `docker`, `podman` | MISSING |
| `/usr/lib/postgresql`, `/var/run/postgresql` | absent |
| `PGHOST` in environment | empty |
| `sqlite3` | present (`/usr/bin/sqlite3`) — not a PostgreSQL substitute; never used as runtime evidence |

The Sprint 5 master prompt does **not** authorise installing PostgreSQL or system packages, and does not authorise starting or modifying persistent host services. No installation was attempted. **No connection was made to any production, Preview, staging, or persistent Supabase database.** Production migration remains a separately authorised action under owner grant **D16**.

**Exact approval needed to unblock:** either (a) explicit owner authorisation to install PostgreSQL 16 (or Docker) on this VM, used only for a disposable local database, or (b) any machine with Docker available, running the Sprint 4 setup script (with the image correction in §4/SCHEMA-2) plus harness v2. Setup command (future, not run here): `bash ~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/sql-runtime-setup/setup-postgres-disposable.sh` followed by `bash ~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/run_all.sh`.

Consequence per acceptance criteria §13: every runtime scenario in §3 is **BLOCKED / NOT RUN**, and Sprint 5 overall is **PARTIAL**.

## 2. What was proven instead (static, this sprint)

1. **Cross-layer harness crosscheck (Lane A):** every table, column, function name and signature referenced by harness v2 (`setup.sql`, `assertions2.sql`, `concurrency.sh`) was checked against the actual DDL of the four prerequisite migrations and the subject draft — **0 name mismatches**. Five schema facts were found and recorded (SCHEMA-1…5, §4).
2. **Static review of the amended draft (Phase 6, coordinator-verified):** `GET DIAGNOSTICS` count 9 → 19 raw grep sites (17 in code: reserve 3, settle 8, resolve_review 6); explicit `REVOKE … FROM anon` / `FROM authenticated` present for all five RPCs (lines 438–439, 592–593, 821–822, 1126–1127, 1201–1202) and pre-existing for the reconciliation view (lines 225–226); `$$` delimiters balanced (14, unchanged); per-function BEGIN/END token deltas exactly match the blocks added.
3. **Harness logic self-test executed on this machine** (bash only, no database): deliberate failing assertion → exit 1; passing assertion → exit 0; non-local `PGHOST` refused → exit 2; non-disposable `PGDATABASE` refused → exit 2; missing `psql` → BLOCKED exit 3. `run_all.sh` on this machine stops at exit 3 before touching anything. Full record: `UNIFIED_CREDITS_SPRINT_5_HARNESS_VALIDATION.md`.

## 3. SQL test matrix — all scenarios BLOCKED (environment), by design of the fence

Harness v2 location: `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/`. "Designed expectation" is the behaviour the scenario asserts when a disposable PostgreSQL exists; **actual result is NOT RUN for every row**.

| ID | Scenario (initial state → competing operations) | Designed expectation | Actual | Final state check |
|---|---|---|---|---|
| M-1 | Clean DB → apply 4 prerequisites + subject | All migrations apply with `ON_ERROR_STOP=1` | BLOCKED | — |
| M-2 | Subject re-applied before fixtures (F-1) | Second apply succeeds (guarded policy creation) | BLOCKED | — |
| SEQ-1 | Grant 100 → reserve 80 → settle actual 80 | SETTLED; consumed exactly 80; released 0 | BLOCKED | reconciliation view `is_consistent` |
| SEQ-2 | Grant → reserve → settle actual < reserved | Remainder released via RESERVE_RELEASE | BLOCKED | invariant per batch |
| SEQ-3 | Settle with actual > reserved | `requires_review`; review PENDING; **no partial debit** | BLOCKED | batch amounts unchanged beyond reserve |
| SEQ-4 | resolve_review APPROVED (SUPER_ADMIN) | Allocation consumed = reserved; overage debited; REVIEW_DECISION entry | BLOCKED | invariant + view |
| SEQ-5 | resolve_review REJECTED | Reservation released in full; second resolve → `already_resolved` | BLOCKED | op RELEASED |
| SEQ-6 | resolve_review by CLIENT member | `forbidden_review`, no mutation | BLOCKED | state unchanged |
| SEQ-7 | Review row with account/workspace ≠ operation (F-4) | `review_mismatch`, no mutation | BLOCKED | state unchanged |
| SEQ-8 | F-7: estimated_credits 0 → reserve | `invalid_amount` (0 reaches the RPC guard; negative/NULL are impossible rows per DDL CHECK/NOT NULL — SCHEMA-3, asserted at the INSERT layer) | BLOCKED | no allocation rows |
| SEQ-9 | apply_expirations: expiring batch with remaining + reserved portions; FREE_ONCE present | Remaining swept once (idempotent second run), **reserved portion untouched**, FREE_ONCE skipped | BLOCKED | invariant + view |
| SEQ-10 | issue_batch same key + different payload | `IDEMPOTENCY_CONFLICT`, no new batch/ledger, original preserved (Sprint 5 tripwire — fails BY DESIGN against the pre-Sprint-5 draft) | BLOCKED | exactly 1 batch, 1 GRANT |
| S1 | Two independent sessions reserve 80 + 80 over balance 100 (advisory-lock barrier; observer session verifies the loser blocked in `pg_stat_activity`) | Exactly one `reserved`; loser `insufficient_balance` (return or fully-rolled-back exception); winner allocations total exactly 80; no partial allocation survives | BLOCKED | invariant + view |
| S2 | Two sessions issue the same FREE_ONCE grant, same key, concurrently | Same batch id to both callers; exactly 1 batch + 1 GRANT entry; no orphan | BLOCKED | counts + view |
| S2b | Same key, different payloads, concurrent | One original grant + one explicit `IDEMPOTENCY_CONFLICT`; no duplicate grant | BLOCKED | counts |
| S3 | Two sessions settle the same reservation | One `settled`, one `duplicate`; exactly one CONSUME set; no double consumption | BLOCKED | consumed = actual once |
| S4 | Two sessions APPROVED-resolve the same review | One success; loser `already_resolved` (CAS raise, full rollback); no double consumption | BLOCKED | invariant + view |
| S5 | Reservation vs expiry, both lock orders | Identical final state either way: reserved portion intact, remaining swept | BLOCKED | invariant + view |
| S6 | Transaction calls issue_batch then deliberate RAISE; retry same key | Full rollback (no batch, no ledger); retry succeeds exactly once | BLOCKED | counts after retry = 1/1 |
| P-1 | Privileges: catalog query + `SET ROLE` execution attempts per RPC | PUBLIC/anon/authenticated cannot EXECUTE any of the 5 RPCs; service_role can; view unreadable by anon/authenticated | BLOCKED (static equivalent PASS, §2.2) | — |

## 4. Schema findings recorded by the harness crosscheck (no shim created)

- **SCHEMA-1:** `public.workspaces.name` is NOT NULL — the Sprint 3 harness fixture (insert of `id` only) would fail at runtime. Harness v2 fills `name`.
- **SCHEMA-2:** the prerequisite chain depends on the Supabase `auth` schema (`auth.users`, `auth.uid()`, a trigger on `auth.users` in `20261008_phase3_canonical_schema_rls.sql`) that no repository migration creates. On a vanilla `postgres:16` image — the image the Sprint 4 setup script uses — the **first prerequisite itself fails**. A Supabase-flavoured image (or an owner-approved disposable Supabase local stack) is required. Harness v2 fails closed with `prerequisite_missing_auth_schema` instead of inventing a shim.
- **SCHEMA-3:** F-7 is two-layered: `credit_usage_operations.estimated_credits` is `NOT NULL CHECK (>= 0)` in the 20261102 DDL, so negative/NULL can never exist as rows (rejected at INSERT — the harness asserts at that layer); only `0` reaches the RPC-level `invalid_amount` guard added by F-7.
- **SCHEMA-4:** the prerequisites are themselves not re-runnable (`20261102_phase53_workspace_billing.sql` contains two unguarded `CREATE POLICY` statements). The F-1 re-apply test therefore covers the subject draft only, by design.
- **SCHEMA-5:** no migration seeds `provider_tariff_versions`; the harness inserts one synthetic row (`harness-tariff-v1`, prices NULL) using the exact DDL columns.

## 5. Status separation (required)

- **Static review:** DONE — PASS with the changes and findings recorded in the Sprint 5 final report §D and above.
- **Disposable PostgreSQL runtime verification:** **NOT DONE — BLOCKED** (no authorised PostgreSQL environment; harness v2 built, self-tested at the bash layer, and ready).
- **Production database verification:** **NOT AUTHORISED** (D16 pending) and not attempted.

A future green disposable run would prove the tested behaviour in that disposable environment only; it would not by itself make the migration production-ready.
