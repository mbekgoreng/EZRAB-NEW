# EZRAB — Unified Credits Sprint 6: Concurrency Evidence

- **Date:** 2026-11-10 · **Repo:** `/home/hatch/workspace/ezrab-unified` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- **Verdict: NO RUNTIME CONCURRENCY EVIDENCE EXISTS.** No PostgreSQL is available on this machine (environment gate re-verified 2026-11-10T06:33:48Z — `psql`/`postgres`/`docker`/`podman` all MISSING), so **zero independent-session scenarios were executed in Sprint 6**. Nothing in this document is, or may be read as, concurrency proof. A passing JavaScript suite is not PostgreSQL proof; a static review is not runtime verification; simultaneous process launch would not have been proof either.

---

## 1. Scenario-by-scenario actual status (§6 of the master prompt)

Scenario IDs are the harness v2 set from Sprint 5, which the Sprint 6 §6 requirements map onto one-to-one.

| Sprint 6 § | Harness ID | Scenario | Actual status |
|---|---|---|---|
| 6.1 | M-1, M-2 | Migration + schema/constraint/RLS/view/signature/privilege checks; F-1 re-apply | **BLOCKED / NOT RUN** |
| 6.2 | SEQ-10, S2, S2b | `issue_batch` idempotency: identical replay; amount/type/expiry/source/period/ownership mismatches → `IDEMPOTENCY_CONFLICT`; concurrent same-key identical → exactly one grant; concurrent different-payload → one winner + one conflict; FREE_ONCE replay semantics per the JS contract | **BLOCKED / NOT RUN** |
| 6.3 | S1 | `reserve_credits` / F-6: two sessions reserve 80 + 80 over balance 100 | **BLOCKED / NOT RUN** |
| 6.4 | SEQ-1…3, S3, S6 | `settle_reservation`: normal, partial + release, zero-usage, duplicate, missing allocation batch, allocation mismatch, ROW_COUNT assertions, full rollback on any assertion failure | **BLOCKED / NOT RUN** |
| 6.5 | SEQ-4…7, S4 | `resolve_review` / F-10: authorised resolve, unauthorised rejection, CLIENT rejection, concurrent double-resolution, F-4 mismatch | **BLOCKED / NOT RUN** |
| 6.6 | S5, SEQ-9 | Expiration vs reservation races, both lock orders | **BLOCKED / NOT RUN** |
| 6.7 | P-1 | RPC authorisation with actual PostgreSQL roles (catalogue + `SET ROLE`) | **BLOCKED / NOT RUN** (static equivalent verified — see `UNIFIED_CREDITS_SPRINT_6_SQL_AUTHORIZATION.md`) |
| 6.8 | (asserted per scenario) | Invariant `granted = remaining + reserved + consumed + expired`, reconciliation view clean, no orphan ledger entries, no orphan allocations, no duplicate idempotency keys, no negative balances, no partially committed failures | **NOT OBSERVED** (asserted by harness design only) |

## 2. What evidence a future authorised run must capture (§7 of the master prompt)

Concurrency proof must demonstrate real transaction blocking, not merely simultaneous process launch. For every concurrency scenario the run must record:

1. Session A begins its transaction and acquires the intended lock.
2. Session A emits a ready marker (harness v2: from inside session A via psql `\!` — see §3).
3. Session B begins the competing operation.
4. An observer session queries `pg_stat_activity`.
5. The observer confirms session B is genuinely waiting (`wait_event_type = 'Lock'`, `state = 'active'`) on the expected lock/transaction.
6. Session A is released to commit or roll back.
7. Session B completes; both exit codes are captured.
8. Final database state (batch amounts, ledger entries, reconciliation view) is inspected independently, and the §6.8 invariant is asserted.

If the observer cannot prove the intended interleaving for a scenario, that scenario must be classified **NOT VERIFIED** — never passed on timing assumptions or sleep-based synchronisation.

## 3. Readiness of the proof mechanism (implemented, statically verified — not executed)

Harness v2 (`~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/concurrency.sh`, 348 lines) implements exactly the §7 protocol:

- `open_a`/`open_b` (lines 51–86) spawn **separate background `psql` processes**, each fed by its own FIFO, with its own PID, file descriptors, stdout and stderr captures.
- Session A's barrier is deterministic: A itself issues `\! touch …ready` **from inside its open transaction**; the script polls for the marker file before starting B (coordination polling, not correctness-by-sleep).
- `observed_lock_wait` (lines 97–112) is a **third, observer `psql` invocation** polling `pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND state = 'active'` (up to 50 × 0.2s); every scenario S1–S5 asserts "observably blocked" through it **before** A is allowed to commit, plus a `b_still_running` check.
- Each scenario ends with final-state assertions (batch amounts, ledger counts, reconciliation invariant).

Re-verified in Sprint 6 pre-flight: all four harness shell scripts pass `bash -n`; `concurrency.sh` standalone exits 3 (BLOCKED) when `psql` is absent and 2 on an empty `PGHOST` — it cannot fabricate a pass.

**One robustness gap (Point 10 of the pre-flight, PARTIAL — not a safety defect):** there is no `timeout` command anywhere in `concurrency.sh`, no `statement_timeout`/`lock_timeout`, and the `end_a`/`end_b` `wait` is unbounded. A `psql` that ignored `\q` while blocked would hang the harness rather than fail it. The failure direction is fail-stuck, never fail-open — the harness cannot proceed to touch another database — so this does not weaken any safety property. It is flagged for a future harness-hardening grant and was not fixed in this sprint.

## 4. JavaScript-layer concurrency (state confirmation only)

The in-process JS suites remain green (`creditConcurrencySprint3` 52/52, `creditInvariantAdversarial` 71/71 — see `UNIFIED_CREDITS_SPRINT_6_REGRESSION.md`). They prove the JS ledger's in-process serialisation contract. Per the programme's standing honesty rule, they are **not** evidence of cross-instance, database-level transactional safety, and this sprint does not present them as such. The SQL layer remains **NOT VERIFIED** until harness v2 executes against a real disposable PostgreSQL.
