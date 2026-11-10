# EZRAB — Unified Credits Sprint 7: Concurrency Harness Hardening

- **Date:** 2026-11-10 · **Target:** `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/concurrency.sh` (harness v2, owned by the Unified Credits programme, lives **outside** the repository)
- **Gap closed:** Sprint 6 pre-flight "Point 10" (PARTIAL, robustness — not safety): no `timeout` command, no `statement_timeout`/`lock_timeout`, unbounded `wait` for `end_a`/`end_b`.
- **Result:** hardening implemented, minimal and harness-only. **This is not SQL runtime validation** — no database exists on this machine and none was executed against.

---

## 1. Before / after identity

| | md5 | Lines |
|---|---|---|
| Original `concurrency.sh` (Sprint 5, as re-verified in Sprint 6) | `186c454b4b7b59bc2c0681a1afed09ec` | 348 |
| Hardened `concurrency.sh` (Sprint 7) | `b9c9136311bdd26b95fe25fa42a42e6a` | 445 |

- **Exact original backed up before editing:** `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT7/harness-backup-original/` (byte-identical copies of `concurrency.sh`, `lib.sh`, `selftest.sh`, `run_all.sh`, `setup.sql`, `assertions2.sql`, `README.md`, with `MD5.txt`; the backup `concurrency.sh` md5 reproduces `186c454b…`).
- **Full unified diff preserved:** `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT7/concurrency-hardening.diff` (154 lines: 89 added lines including diff headers, 4 removed content lines — each removal is a launch/wait line replaced by its bounded equivalent; all other additions are comments).
- **No other harness file was modified.** `lib.sh`, `selftest.sh`, `run_all.sh`, `setup.sql`, `assertions2.sql`, `README.md` md5s are unchanged from the Sprint 7 baseline snapshot.

## 2. What changed (and only this)

1. **Header amendment note** documenting the hardening contract in the file itself.
2. **Bounds block** after the guards:
   - `HARNESS_SESSION_TIMEOUT` (default **600 s**), `HARNESS_END_WAIT` (default **30 s**), `HARNESS_STATEMENT_TIMEOUT_MS` (default **120000**), `HARNESS_LOCK_TIMEOUT_MS` (default **60000**) — all environment-overridable for tests.
   - `export PGOPTIONS="-c statement_timeout=… -c lock_timeout=…"` — applies to **one-shot connections only** (see §3).
   - `bounded_wait_pid <pid> <seconds>` — a 0.2 s poll loop with a hard budget.
3. **`open_a` / `open_b`:** the interactive FIFO `psql` processes now launch under `env -u PGOPTIONS timeout --signal=TERM --kill-after=10s "$HARNESS_SESSION_TIMEOUT" psql …` — a process-level bound, with the one-shot SQL guard deliberately stripped from these sessions.
4. **`end_a` / `end_b`:** the unbounded `wait "$PID"` is replaced by `bounded_wait_pid`. On budget expiry the session is `SIGKILL`ed, the recorded exit code is **124**, `HARNESS_FAIL_COUNT` is incremented and a `FAIL:` line is printed — so `harness_summary_exit` makes the harness exit **non-zero** instead of hanging forever.
5. **Comments only** at the observer poll and the S6 batch `psql -f` call, recording that they inherit the one-shot `PGOPTIONS` guard.

## 3. Design decisions (why it is shaped this way)

- **SQL-level timeouts are NOT applied to the interactive sessions.** Session A must hold its transaction open across the barrier while doing nothing — any idle/statement bound risks killing the holder mid-scenario. Session B's entire evidentiary purpose is to remain *genuinely blocked* on a lock wait so the third observer session can prove it in `pg_stat_activity`; a `lock_timeout` on B would make B error out early and **destroy the concurrency proof** (and could make B "finish" while A still holds its transaction, failing `b_still_running` for the wrong reason and corrupting scenario semantics). The correct bound for A/B is process-level: `timeout` 600 s (far above any legitimate scenario duration) plus the 30 s bounded `\q` wait in `end_a`/`end_b`.
- **One-shot connections DO get both timeouts.** `q()` queries, the observer's `pg_stat_activity` polls, and `psql -f` batches are short statements against a database whose locks are held by the controlled sessions; if one of them ever blocked unexpectedly (e.g. an assertion query queueing behind session A's row locks longer than intended), `statement_timeout` 120 s / `lock_timeout` 60 s turn an infinite hang into a bounded error, which the existing assertion machinery records as a failure.
- **Poll budgets unchanged.** `wait_for_marker` (~20 s) and `observed_lock_wait` (~10 s) were already bounded; they were not touched, and no sleep-based *correctness* was introduced anywhere — all coordination remains the original deterministic barrier (marker written from inside session A's open transaction; observer-verified lock wait before A may commit).
- **Assertions untouched.** No assertion was weakened, removed, re-worded, or re-scoped; no scenario SQL changed; the observer session and its `pg_stat_activity` predicate are byte-identical.

## 4. Cleanup safety under timeout failure

- `concurrency.sh`'s EXIT trap (`rm -rf "$TMPD"`) fires on **every** exit path, including a hardening-induced non-zero exit — it removes only the script's own temporary directory.
- Database cleanup remains exclusively `run_all.sh`'s EXIT trap → `lib.sh` `harness_drop_own_db`, which re-verifies the disposable name pattern **and** the marker comment before dropping, and refuses otherwise. A timeout failure inside `concurrency.sh` propagates as a FAIL stage in `run_all.sh`'s bookkeeping with an aggregate non-zero exit; it cannot widen cleanup beyond the harness's own marked database.
- A partial failure therefore cannot trigger cleanup outside the harness-owned disposable database. This property is by construction (unchanged code paths) and is stated as such — it has not been runtime-exercised, because no database exists here.

## 5. Shell-level test evidence (the only level available)

All commands run 2026-11-10 in Sprint 7; logs preserved in `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT7/`:

| Check | Before hardening | After hardening |
|---|---|---|
| `bash -n concurrency.sh` | OK | OK |
| `bash selftest.sh` (pure bash, no database) | **5/5 PASS, exit 0** (`selftest-before.log`): failing assertion → exit 1; passing assertions → exit 0; non-loopback `PGHOST` refused → exit 2; non-disposable `PGDATABASE` refused → exit 2; missing `psql` → BLOCKED exit 3 | **5/5 PASS, exit 0** (`selftest-after.log`) — identical results |
| `concurrency.sh` standalone, no `psql` on machine | exit **3** (BLOCKED at `harness_require_psql`) | exit **3** (BLOCKED) — unchanged |
| `run_all.sh`, no `psql` on machine | exit **3** (BLOCKED before creating anything) | exit **3** (BLOCKED) — unchanged |
| GNU `timeout` availability (hardening prerequisite) | n/a | `/usr/bin/timeout`, GNU coreutils 9.4 |

**Explicitly NOT proven by this evidence:** the timeout paths themselves (session kill, bounded-wait expiry) cannot be exercised without a live `psql` and a database; they are code-reviewed and syntax-checked only. The first authorised runtime run remains the first real test of the hardened paths as well (the runtime checklist carries a step for exactly this). No SQL runtime validation is claimed.

## 6. What was deliberately NOT changed

- Harness database naming/marker (`ezrab_sprint5_disposable_` / `EZRAB_SPRINT5_DISPOSABLE`) — owner decision, untouched (see the provisioning specification §5).
- `lib.sh` guards, exit-code contract (2/3/4/5), identity verification, restricted cleanup — untouched.
- Scenario set S1–S6, seed prefixes, expected outcomes — untouched.
- The Sprint 3 harness (`~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT3/sql-harness/`) — untouched historical evidence.
