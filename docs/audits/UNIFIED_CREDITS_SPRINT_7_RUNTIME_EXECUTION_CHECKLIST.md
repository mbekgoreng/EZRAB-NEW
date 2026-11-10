# EZRAB — Unified Credits Sprint 7: Runtime Execution Checklist

- **Date:** 2026-11-10 · **Purpose:** the deterministic, step-by-step runbook for the future **owner-authorised** disposable-PostgreSQL run of harness v2. Each step has an exact command (or exact action) and an explicit pass/fail gate. A step that fails stops the run at that step; later steps are recorded SKIPPED, never assumed.
- **Companion documents:** `UNIFIED_CREDITS_SPRINT_7_PROVISIONING_SPEC.md` (environment requirements), `UNIFIED_CREDITS_SPRINT_7_HARNESS_HARDENING.md` (harness state after Sprint 7).
- **Status:** **prepared, not executed.** Nothing in this checklist was run against a database in Sprint 7 (no PostgreSQL exists on the authoring machine). Production readiness is not claimed by completing it; a green run proves the tested behaviour in that disposable environment only.

---

## Gate 0 — Authorisation (no commands)

- [ ] Owner grant for **provisioning** exists (install Docker Engine — or PostgreSQL 16 + `psql` — on the VM for disposable-only use, **or** a designated Docker-capable machine). *Gate: no grant → STOP. This checklist does not authorise anything by itself.*
- [ ] Owner naming decision recorded: harness runs under its Sprint 5 pattern/marker (`ezrab_sprint5_disposable_` / `EZRAB_SPRINT5_DISPOSABLE`) **as-is**, or a deliberate guard update to newer sprint naming was separately approved and applied. *Gate: undecided → STOP (do not rename ad hoc during the run).*
- [ ] Confirmation that this run is **not** D16: no migration in the chain may be applied to any persistent Supabase project under this checklist. *Gate: any doubt → STOP.*

## Step 1 — Provision the disposable environment

- [ ] Start a **Supabase-flavoured** PostgreSQL (`supabase/postgres` image, owner-chosen current 15.x/17.x tag) — **not** vanilla `postgres:16` (fails at prerequisite 1: no `auth` schema). Container discipline: `--tmpfs` data, published **only** on `127.0.0.1` at a non-standard port (e.g. `55432`), synthetic one-time credentials generated for this run and never written to any file/repo, container removed by trap at the end. (Alternative: a local Supabase-flavoured PostgreSQL 16 install with the same loopback-only, throwaway-data discipline.)
- [ ] Verify the host has a `psql` client: `command -v psql` → a path. *Gate: absent → STOP (harness would exit 3 BLOCKED).*
- [ ] Record environment identity for the evidence bundle: image tag / install identity, `SELECT version();` output once reachable. *Gate: unrecorded → do not proceed.*

## Step 2 — Baseline and checksum verification

- [ ] In `/home/hatch/workspace/ezrab-unified`: `git rev-parse HEAD` → `99de8927d3bdb0bc6e2befbcb22e290f64971896` (or a later owner-known HEAD, recorded verbatim). *Gate: unexpected HEAD → STOP and reconcile; never reset/restore.*
- [ ] `md5sum supabase/migrations/20261110_unified_credits_foundation.sql` → `170f0d79b0b43dccea9f81b95ed5ea27`. *Gate: mismatch → STOP; inspect the diff and ownership before anything else (do not overwrite newer changes).*
- [ ] Confirm the four prerequisite files exist alongside the subject in `supabase/migrations/` (names in Step 5). *Gate: any missing → STOP (harness also aborts BLOCKED exit 5).*
- [ ] Confirm harness integrity: `concurrency.sh` in `sql-harness-v2/` is the Sprint 7 hardened file (md5 `b9c9136311bdd26b95fe25fa42a42e6a`) or a later owner-approved state, recorded verbatim. *Gate: unknown harness state → STOP.*

## Step 3 — Harness self-test (no database)

- [ ] Run: `bash ~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/selftest.sh`
- [ ] **Pass gate:** exit 0 with `== selftest summary: 5 passed, 0 failed ==` (failing assertion → 1; passing → 0; non-loopback host refused → 2; non-disposable name refused → 2; missing `psql` → BLOCKED 3). *Gate: anything else → STOP; the harness's own safety logic is not proven on this machine.*

## Step 4 — Connection environment

- [ ] Export exactly: `PGHOST=127.0.0.1`, `PGPORT=<the disposable port from Step 1>`, `PGUSER=postgres` (or the disposable cluster's owner-equivalent), `PGPASSWORD=<the synthetic one-time credential>`, `REPO=/home/hatch/workspace/ezrab-unified`.
- [ ] Do **not** preset `PGDATABASE` to anything (the harness validates a preset before replacing it; a non-disposable preset is refused, exit 2 — by design).
- [ ] Sanity probe: `psql -X -At -d postgres -c 'SELECT 1'` → `1`. *Gate: failure → STOP; fix the disposable environment, never substitute another database.*

## Step 5 — Full harness run

- [ ] Run: `bash ~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/run_all.sh` and capture the complete output to the evidence bundle.
- [ ] Internal order the harness will follow (verify in output, do not reorder): guards → create `ezrab_sprint5_disposable_<timestamp>_<pid>` + marker comment → identity verification (`current_database()` + marker) → apply prerequisites in chain order (`20261008_phase3_canonical_schema_rls.sql`, `20261102_billing_batch_ledger.sql`, `20261102_phase53_workspace_billing.sql`, `20261109_billing_orders_subscriptions.sql`) → apply subject → **re-apply subject (F-1)** → `setup.sql` → `assertions2.sql` → `concurrency.sh` → per-stage summary → drop its own database (EXIT trap).
- [ ] **Pass gate:** aggregate exit 0 and stage summary `apply-migrations PASS`, `reapply-subject-F1 PASS`, `setup PASS`, `assertions2 PASS`, `concurrency PASS`. *Gate: any FAIL → the run is a FAIL at that stage; preserve the full log; do not re-run repeatedly against fresh databases to "get a green one" without documenting each attempt and its cause.*

## Step 6 — Scenario-level verification (inside Step 5's evidence)

For each item: expected outcome per the harness design; evidence = the captured harness output for that stage/scenario. If the observer could not prove the intended interleaving for a concurrency scenario, that scenario is **NOT VERIFIED**, not PASS.

- [ ] **M-1/M-2:** migration + schema/constraints/RLS/view/signatures/privileges present; F-1 re-apply a safe no-op.
- [ ] **SEQ (assertions2.sql):** A settle-full (exact consumption, remainder released, SETTLED, reconciles) · B overage → `REQUIRES_REVIEW`/`PENDING` with **no** partial debit · C review APPROVED (consumption = reserved, REVIEW_DECISION ledgered) · D review REJECTED (released, terminal, re-resolution refused `already_resolved`) · E CLIENT refused (`forbidden_review`) · F review↔operation mismatch (`review_mismatch`) · G F-7 (estimated 0 → `invalid_amount` at RPC layer; negative/NULL refused by DDL) · H `apply_expirations` (unreserved remainder only, reserved untouched, FREE_ONCE skipped, second run idempotent) · I **tripwire**: same-key different-payload replay → `IDEMPOTENCY_CONFLICT`, matching replay → `OK:<batch_id>` · Final: `credit_batch_reconciliation.is_consistent` for **every** fixture batch.
- [ ] **S1 (F-6):** two sessions reserve 80+80 over balance 100 → exactly one `reserved`; loser `insufficient_balance`, stays `CREATED`, zero allocations; observer proved B blocked in `pg_stat_activity` before A committed.
- [ ] **S2:** concurrent FREE_ONCE, same key → identical result to both callers; exactly 1 batch + 1 `GRANT`. **S2b (sequential/concurrent different-payload):** one winner + one `IDEMPOTENCY_CONFLICT`, no extra batch/ledger rows.
- [ ] **S3:** concurrent settle → one `settled`, one `duplicate`, exactly one CONSUME set, consumed exactly 60.
- [ ] **S4 (F-10):** concurrent APPROVED resolution → one `approved`, one `already_resolved`, consumption 95 exactly once, one `REVIEW_DECISION`.
- [ ] **S5:** reservation vs expiry in **both** orders → reserved 40 never swept, expired exactly 60, identical end state in both orders.
- [ ] **S6:** poisoned transaction (issue + deliberate RAISE) → zero batches/zero ledger rows survive; retry with same key succeeds exactly once; matching replay returns identical result.
- [ ] **P-1:** catalogue privileges (`pg_proc.proacl` / `has_function_privilege`) for all five RPCs + the reconciliation view; `SET ROLE anon` and `SET ROLE authenticated` execution attempts **denied** on all five RPCs; `SET ROLE service_role` execution succeeds against synthetic fixtures. *Note: P-1 is asserted by design in the Sprint 3 harness `assertions.sql` (which v2 does not supersede) and by the subject's static revoke/grant posture; if the authorised run does not execute P-1 explicitly, record P-1 as NOT RUN — never infer it from the file text.*
- [ ] **Invariant after every scenario:** `granted = remaining + reserved + consumed + expired`; reconciliation view reports no inconsistency; no orphan ledger entries; no orphan allocations; no duplicate idempotency keys; no negative balances; no partially committed failed operation.

## Step 7 — Hardening behaviour spot-check (first run only)

- [ ] Confirm no step of the run hung: the Sprint 7 bounds (session `timeout` 600 s; bounded `\q` wait 30 s; one-shot `statement_timeout` 120 s / `lock_timeout` 60 s) were in force (harness header amendment). If any bound actually fired (a `FAIL: … killed, exit 124` line or a timeout error in the log), record it as a finding — the run's affected scenario is FAIL/NOT VERIFIED, and the cause must be diagnosed before any re-run.
- [ ] *Gate: a bound firing is never silently re-run away.*

## Step 8 — Disposal

- [ ] Confirm the harness's EXIT trap dropped **only its own** database (the run's log shows the drop, or the refusal message if marker verification failed). Verify independently: connect to the `postgres` maintenance database and confirm no `ezrab_sprint5_disposable_%` database remains (unless the harness explicitly refused the drop — then record the exact remaining resource and stop; never run a broad deletion).
- [ ] Remove the disposable container / stop the disposable server. Confirm nothing else was touched: no other database existed in the disposable cluster, and no connection was ever made outside loopback.
- [ ] *Gate: unverifiable cleanup → STOP and report the exact remaining resource.*

## Step 9 — Regression confirmation (application layer, after the SQL run)

Run sequentially, solo (never dispatch duplicate heavy processes), recording exact commands and exit codes:

- [ ] `npx --yes tsx src/test/creditInvariantAdversarial.test.ts` → 71 PASS / 0 FAIL
- [ ] `npx --yes tsx src/test/creditConcurrencySprint3.test.ts` → 52 PASS / 0 FAIL
- [ ] `npx --yes tsx src/test/chatFastMetering.test.ts` → per its then-current authorised state (114/114 once the owner-granted exact-shape pin update is applied; 113/114 with the one classified X1 pin failure before that grant)
- [ ] Phase 1 suites (pricingPolicy 33, featureBillingMatrix 87, creditReconciliation 23, unifiedCreditLifecycle 31), ai-metering 83, deterministic-free 94, dedBillingCompat 42, billing tsx set (webhook 38, catalog drift 21, checkout 23, demo gate 46), creditsActionHandler 9, apiEndpointInventory 13, financialConsistency 40, vitest billing set 110
- [ ] `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --skipLibCheck` → exit 0
- [ ] Vite production build (heap 3072) → exit 0

## Step 10 — Reporting

- [ ] Write the run report (English, `docs/audits/` naming pattern) with: environment identity + PostgreSQL version; migration checksum; every scenario's **actual** status (PASS/FAIL/NOT RUN/NOT VERIFIED — no inferred passes); independent-session evidence (session identifiers, `pg_stat_activity` waits, ordering, exit codes); failed-assertion output verbatim; final reconciliation results; regression command/result pairs; disposal confirmation; final `git status` and hashes.
- [ ] State explicitly what the run does **not** establish: production readiness is not claimed; D16 (any persistent/production execution) remains a separate owner grant; billing remains dormant.
