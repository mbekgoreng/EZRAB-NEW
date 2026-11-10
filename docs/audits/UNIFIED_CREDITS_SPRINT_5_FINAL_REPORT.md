# EZRAB — Unified Credits Sprint 5: Final Report
## PostgreSQL Runtime Proof, SQL Idempotency Hardening & Distributed Transaction Verification

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` before **and** after (unchanged)
- **Environment:** LOCAL DEVELOPMENT ONLY · Production status A — PUBLIC SHOWCASE ONLY · Billing DORMANT · `AUTH_ENABLED=false` · `AI_METERING_ENABLED` OFF
- **Overall Sprint 5 verdict: PARTIAL.** The SQL draft defects assigned to this sprint are repaired and statically verified, and a real dual-session harness now exists and is proven able to fail — but **PostgreSQL runtime verification remains BLOCKED** (no PostgreSQL/Docker/Podman exists on this machine and the sprint's authorisation does not include installing it). No runtime claim is made anywhere in this report. Production readiness is unchanged: **FAIL — NOT PRODUCTION READY** (the correct verdict for a dormant phase).

Companion documents: `UNIFIED_CREDITS_SPRINT_5_SQL_RUNTIME_VALIDATION.md` (environment evidence + full scenario matrix), `UNIFIED_CREDITS_SPRINT_5_HARNESS_VALIDATION.md` (harness proof), `UNIFIED_CREDITS_SPRINT_5_REGRESSION.md` (exact command/result pairs). Phase 1–4 reports are preserved untouched as historical evidence.

---

## A. Executive verdict (per area)

| Area | Verdict | Basis |
|---|---|---|
| Harness correctness | **PASS** (bash layer) / **NOT RUN** (database layer) | Self-test executed: failing assertion → exit 1; guards refuse unsafe targets (exit 2); missing psql → BLOCKED exit 3. Concurrency scenarios are implemented code, never executed. |
| PostgreSQL environment | **BLOCKED** | `psql`/`postgres`/`pg_ctl`/`initdb`/`docker`/`podman` all MISSING (re-verified this sprint); installation not authorised. Exact approval needed: §B. |
| SQL migration execution | **NOT RUN** | Zero SQL executed against any database in Sprint 5. |
| F-6 reserve runtime behaviour | **NOT VERIFIED** (static PASS carried from Sprint 3/4) | Scenario S1 designed and implemented in harness v2; not executed. |
| F-10 review runtime behaviour | **NOT VERIFIED** (static PASS carried from Sprint 3/4) | Scenario S4 designed and implemented; sequential review coverage added in `assertions2.sql`; not executed. |
| `issue_batch` idempotency | **PARTIAL** | Defect repaired in the draft (payload parity + `IDEMPOTENCY_CONFLICT`); runtime scenarios SEQ-10/S2/S2b designed; not executed. |
| `settle_reservation` atomicity | **PARTIAL** | ROW_COUNT hardening + post-loop consumption assertion added to the draft; runtime scenarios SEQ-1…3/S3/S6 designed; not executed. |
| RPC privileges | **PARTIAL** | Explicit anon/authenticated revokes added for all five RPCs (view already had them); catalog/`SET ROLE` verification designed (P-1); not executed. |
| Independent-session concurrency | **NOT VERIFIED** | Real two-session harness implemented (advisory-lock barriers, third observer session verifying blocked state in `pg_stat_activity`); zero scenarios executed. |
| Regression | **PASS** with one classified parallel-programme item | 921 suite checks green at baseline (0 failures); tsc exit 0; build exit 0 (solo re-run after an OOM-killed first attempt under parallel load). One post-landing failure in `chatFastMetering` (113/114) caused by the parallel Sprint 5 programme's X1 response-shape change — §F of the regression document. |
| Production readiness | **FAIL — NOT PRODUCTION READY** | Unchanged by design; activation blockers in §H stand. |

## B. Environment evidence

- **PostgreSQL version:** none available — `psql`, `postgres`, `pg_ctl`, `pg_ctlcluster`, `initdb` all MISSING; `docker`, `podman` MISSING; `/usr/lib/postgresql` and `/var/run/postgresql` absent; `PGHOST` empty.
- **Database host / disposable identity / session count:** none — no database was created or connected to.
- **Isolation verification:** not applicable at runtime; the harness *design* enforces it (loopback-only guard, `^ezrab_sprint5_disposable_` database-name pattern, `EZRAB_SPRINT5_DISPOSABLE` database-comment marker verified before any scenario, cleanup restricted to the harness's own marked database).
- **Exact setup command (future, NOT run):** `bash ~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/sql-runtime-setup/setup-postgres-disposable.sh` — with the correction found this sprint: the prerequisite chain requires the Supabase `auth` schema, so a **Supabase-flavoured PostgreSQL image** is required; the script's vanilla `postgres:16` cannot apply even the first prerequisite (SCHEMA-2).
- **Exact execution command (future, NOT run):** `bash ~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/run_all.sh`.
- **Did setup require installation or external infrastructure?** **Yes** — that is precisely the blocker. The approval needed is one of: (a) explicit owner authorisation to install PostgreSQL 16 or Docker on this VM for disposable-only use, or (b) any Docker-capable machine. Neither was granted by the Sprint 5 prompt, so provisioning stopped, exactly as instructed.

## C. SQL test matrix

Full matrix with initial states, competing operations, designed expectations, final batch/ledger checks and reconciliation outcomes: `UNIFIED_CREDITS_SPRINT_5_SQL_RUNTIME_VALIDATION.md` §3. Summary: **every scenario — M-1, M-2, SEQ-1…SEQ-10, S1, S2, S2b, S3, S4, S5, S6, P-1 — is BLOCKED / NOT RUN** (environment). No scenario is reported PASS. The invariant `granted = remaining + reserved + consumed + expired` and the reconciliation view are asserted by design at the end of every harness scenario; they have not been observed at runtime.

## D. SQL changes (draft only — never executed)

Subject: `supabase/migrations/20261110_unified_credits_foundation.sql`, 1,028 → **1,227 lines**, md5 `685d8ad464f94da8ccf3fa09025c0e6c` → **`170f0d79b0b43dccea9f81b95ed5ea27`**. A "SPRINT 5 AMENDEMEN" header block documents all three amendments in-file. Backup of the pre-edit draft: `/var/tmp/20261110_unified_credits_foundation.sql.bak` (byte-identical, md5-verified; `/tmp` was full — see the regression document §4), full diff at `/var/tmp/sprint5.diff` (+210/−11 lines, 22 hunks, all inside the authorised scope).

### D.1 `issue_batch` — idempotency payload parity (Phase 2)

- **Original defect:** the replay probe returned the first grant's `batch_id` for a reused key **without comparing the payload** — a same-key/different-payload replay silently "succeeded" with someone else's grant. The JS ledger (Sprint 3) returns `IDEMPOTENCY_CONFLICT` for the equivalent case; the SQL draft diverged (Sprint 4 static finding #1).
- **Exact repair:** signature changed `RETURNS uuid` → `RETURNS text` following the file's own string-code convention (reserve returns `'reserved'`, settle `'settled'/'duplicate'`, review `'approved'`). On probe hit (and on the `unique_violation` race branch), the stored batch is compared against the normalised request — type, `granted_amount` vs the **raw** requested `p_amount`, effective expiry (FREE_ONCE → NULL; SUBSCRIPTION with `period_end` → `period_end + 30 days`; else `p_expires_at`), `source_ref`, `period_start`, `period_end`, `owner_user_id`, `workspace_id`, all with `IS NOT DISTINCT FROM` — returning `'OK:<batch_id>'` on match and `'IDEMPOTENCY_CONFLICT'` with **zero mutation** on mismatch. Successful paths return `'OK:<batch_id>'`. FREE_ONCE compares type only, mirroring the JS contract (the JS validator checks the requested amount *before* the forced 100 is applied; comparing the stored forced 100 against a raw request amount would falsely conflict every legitimate FREE_ONCE replay).
- **Why correct:** it makes the SQL contract identical to the established Gen-2 JS contract (same key + same payload = safe replay; different payload = explicit conflict, original operation untouched) using the error surface that already exists in this file — no new error code was invented (`IDEMPOTENCY_CONFLICT` is the Sprint 3 JS code).
- **Lock ordering:** unchanged — the per-(account, key) `pg_advisory_xact_lock` still precedes the probe, so the check-and-return is serialised per key.
- **Compatibility (stated, not hidden):** the return-type change is **BREAKING** for any external caller expecting a bare `uuid`. Verified this sprint: **no code in `api/` or `src/` calls `issue_batch(`** (grep, zero hits) — the RPC has no in-repo caller, dormant or otherwise, so the blast radius today is zero in-repo; any future adapter must parse `'OK:<uuid>'` / check `'IDEMPOTENCY_CONFLICT'`. Operational note recorded in the file: `CREATE OR REPLACE` cannot change the return type of an existing function, so on any database where the pre-Sprint-5 draft had already been applied, a `DROP FUNCTION` would be required first — moot today because the draft has never been applied anywhere.
- **Edge cases recorded by the implementing lane:** a GRANT row whose batch row is missing (corruption) fails closed through the existing `unique_violation` path (original exception raised, no fabricated result); a concurrent FREE_ONCE winner reached via the partial-unique fallback that differs in `source_ref`/period/owner/workspace now yields `IDEMPOTENCY_CONFLICT` rather than a replay — the literal consequence of applying the same comparison on that branch.
- **Proving tests:** harness v2 SEQ-10 (sequential tripwire — fails BY DESIGN against the pre-Sprint-5 draft), S2/S2b (concurrent) — **all NOT RUN**.

### D.2 `settle_reservation` — ROW_COUNT hardening (Phase 3)

- **Original defect:** the function contained **zero** `GET DIAGNOSTICS` assertions (Sprint 4 static finding #2) — a silently missed update inside settlement would not raise, unlike `reserve_credits`/`resolve_review` after their F-6/F-10 repairs.
- **Exact repair:** `v_rows` checks after **every** write that must affect exactly one row — overage-branch operation UPDATE (`settle_overage_update_failed`), review INSERT (`settle_review_insert_failed`), per-allocation batch UPDATE (`settle_batch_update_failed`), CONSUME / EXPIRATION / RESERVE_RELEASE inserts (each asserted when executed), second batch status UPDATE, final operation UPDATE (`settle_operation_update_failed`) — 8 new assertion sites (function total 0 → 8; file total 9 → 17 in code). A missing allocation batch now raises `settle_allocation_batch_missing` (mirroring `resolve_review`) instead of dereferencing NULL amounts. A new post-loop assertion requires the loop to have consumed **exactly** `p_actual_credits` (`v_to_consume = 0 AND v_consumed_total = p_actual_credits`), else `RAISE 'settle_consumption_mismatch'`.
- **Why correct / rollback behaviour:** every mismatch raises, so the whole function transaction rolls back — no partial ledger state can persist, and the terminal CAS property (second settle returns `'duplicate'` before any write) is preserved. **Documented intentional behaviour change:** recorded allocations summing to less than the reserved amount while `actual <= reserved` is data corruption; the old code settled silently, the amended code fails closed and rolls back (the operation row stays RESERVED because the rollback also undoes nothing else — the row was only locked).
- **No blind assertions:** there is no write in this function whose zero-row outcome is legitimate; that fact is stated in the function's Sprint 5 comment block. The `p_actual_credits = 0` path was verified by static logic (loop consumes 0, assertion 0 = 0 holds, full remainder released).
- **Proving tests:** harness v2 SEQ-1…SEQ-3, S3, S6 — **all NOT RUN**.

### D.3 Explicit RPC privilege revocations (Phase 4)

- **Original state:** the five RPCs relied on `REVOKE ALL … FROM PUBLIC` + service_role-only grant, with no explicit revoke from `anon`/`authenticated` (Sprint 4 nuance #3). On Supabase, where default privileges can grant EXECUTE broadly, that reliance is implicit rather than stated.
- **Exact repair:** `REVOKE ALL ON FUNCTION … FROM anon;` and `… FROM authenticated;` added immediately after each PUBLIC revoke — `issue_batch` (lines 438–439), `reserve_credits` (592–593), `settle_reservation` (821–822), `resolve_review` (1126–1127), `apply_expirations` (1201–1202). The reconciliation view already carried both revokes since the Sprint 3 F-2 fix (now lines 225–226) and was **not** duplicated. No privilege was granted to anyone new; grants remain service_role-only. Authorisation semantics inside `resolve_review` (SUPER_ADMIN or `billing_admin = true`; CLIENT always rejected) are untouched.
- **Proving tests:** harness v2 P-1 (catalogue query + `SET ROLE` execution attempts) — **NOT RUN**; static presence verified by grep (coordinator).

### D.4 Phase 6 static review of the amended migration

Ordering unchanged; subject remains idempotent (F-1 guard intact); signatures of the other four RPCs unchanged; transaction boundaries unchanged (one function = one transaction); lock acquisition order unchanged (account row → batches in allocation order) — no new deadlock surface introduced (the `issue_batch` comparison adds reads under the pre-existing advisory lock only); unique constraints, foreign keys, RLS and the reconciliation view untouched; `SECURITY DEFINER` + pinned `search_path` intact on all five functions; `$$` balance 14 (unchanged); per-function BEGIN/END token deltas match exactly the blocks added. **This migration is not claimed production-ready** — a future disposable run would prove the tested behaviour in that environment only, and production execution remains a separate D16 authorisation.

## E. Harness proof

- **Two independent sessions:** implemented (two `psql` processes per scenario) — **not executed**.
- **Intended interleaving achieved:** by design, session B starts on session A's in-session ready marker, and a third observer session verifies B is blocked in `pg_stat_activity` before A may commit — **not executed**.
- **Deliberately failing assertion → non-zero exit:** **PROVEN, executed on this machine** (exit 1; passing control exits 0).
- **Cannot silently pass without executing database operations:** **PROVEN at the guard layer** — with a valid local environment but no `psql`, `concurrency.sh` exits 3 (BLOCKED); unsafe targets exit 2; `run_all.sh` stops at exit 3 before touching anything.

Full record: `UNIFIED_CREDITS_SPRINT_5_HARNESS_VALIDATION.md`; artifacts: `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/` (the Sprint 3 harness was not modified).

## F. Regression

Exact command/result pairs: `UNIFIED_CREDITS_SPRINT_5_REGRESSION.md`. Headline: adversarial 71/71 · concurrency 52/52 · metering 83/83 · deterministic-free 94/94 · DED adapter 42/42 · Chat FAST 114/114 at baseline · Phase 1 174/174 · billing tsx (webhook 38, catalog 21, checkout 23, demo gate 46) · API inventory 13/13 · financial consistency 40/40 · Vitest billing set 110/110 · **tsc exit 0** (heap 4096, solo) · **vite build exit 0** (heap 3072, solo re-run, 2m 10s; the first attempt was OOM-killed while parallel-lane processes held memory — environment contention, recorded, not counted). Suite-check sum 921 with 0 failures at baseline; overlapping suites are not unique tests (see the regression document §6).

One classified exception after a **parallel Sprint 5 programme** landed gateway usage-evidence changes (X1/X2/X4) in the same worktree mid-sprint: `chatFastMetering` re-runs at **113/114** — the pinned exact response-shape assertion no longer matches the deliberately extended success body. Classification: **parallel-programme change, not a Sprint 5 regression** (this sprint changed no gateway, adapter, or test code). Reconciling that pin belongs to the parallel programme / a future integration grant.

## G. File inventory

**Existing files modified by Sprint 5 (1):**
- `supabase/migrations/20261110_unified_credits_foundation.sql` — untracked draft (was already an uncommitted local package file before Sprint 5; md5 `685d8ad4…` → `170f0d79…`). Changes: §D.1–D.3 + Sprint 5 header amendment block. Tests: static checks (§D.4) + harness v2 scenarios (NOT RUN).

**New files created by Sprint 5:**
- `docs/audits/UNIFIED_CREDITS_SPRINT_5_FINAL_REPORT.md` (this file), `docs/audits/UNIFIED_CREDITS_SPRINT_5_SQL_RUNTIME_VALIDATION.md`, `docs/audits/UNIFIED_CREDITS_SPRINT_5_HARNESS_VALIDATION.md`, `docs/audits/UNIFIED_CREDITS_SPRINT_5_REGRESSION.md` — all new, untracked (under `docs/audits/`).
- Outside the repo: `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/` (`README.md`, `lib.sh`, `setup.sql`, `assertions2.sql`, `concurrency.sh`, `selftest.sh`, `run_all.sh`, `selftest-output.txt`, `sql-object-crosscheck.txt`), `baseline-2026-11-10/` (Phase 0 snapshot incl. `reconciliation-notes.txt`), `after-2026-11-10/` (closing snapshot), `build-log.txt`.

**Files deliberately untouched (Phase 7 preservation, verified by md5/status):** `api/_lib/chatFastMetering.js`, `api/_lib/aiMetering.js`, `api/_lib/aiMeteringLifecycle.js`, `api/_lib/featureBillingMatrix.js`, `api/_lib/creditLedger.js`, `api/_lib/billingStore.js`, `api/_lib/creditAllocation.js`, `api/_lib/dedBillingAdapter.js`, all DED implementation files, Gen-1 `creditEngine.js`, the localStorage simulation, legacy `server/`, `middleware.ts`, all existing tests, all Phase 1–4 reports. (`api/_lib/aiGateway.js` changed during the window — by the parallel programme, §F — not by Sprint 5.)

## H. Remaining limitations — owner decisions preserved, none resolved

All pending owner decisions remain exactly as registered in `docs/product/UNIFIED_CREDITS_OWNER_DECISIONS.md`: **D1/D2/D4** legal review (account closure, refunds, transfers) · **D6** billing activation grant — NOT GRANTED · **D7** allocation-order alignment · **D8** top-up pricing · **D9** margin formula (parameters remain `null`) · **D10** provider tariff verification (Crown route cost remains UNKNOWN) · **D14** simulation retirement · **D16** migration execution authorisation · **D17** webhook exemption · **D18** activation sequence · **F-13** tamper-evidence decision · receipt-scan endpoint-or-retirement decision · legacy `server/` isolation decision · DED adapter activation decision.

Sprint-5-specific open items, in execution order: (1) grant an environment for runtime proof (install authorisation or a Docker-capable machine, with a Supabase-flavoured image per SCHEMA-2) → run harness v2 → only then can F-6/F-10/S1–S6 move from NOT VERIFIED to evidence; (2) reconcile the `chatFastMetering` exact-shape pin with the parallel programme's X1 response extension; (3) the whole local package stack (Credits Phase 1–5, DED programmes) remains uncommitted — commit/push remains an owner grant, unchanged by this sprint.

## I. Git safety

- **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` — unchanged.
- **Staged files: 0** (`git diff --cached` empty at Phase 0 capture and at closing). **No commit, no push, no merge, no tag, no deployment.**
- **No persistent database migration; no SQL executed against any database; no environment changes.** `AUTH_ENABLED=false` (verified `src/App.tsx:39`); `AI_METERING_ENABLED` OFF (zero occurrences in any `.env*` file; the flag is read only from process env by `aiMetering.js`); billing remains dormant; `middleware.ts` untouched.
- **Parallel DED work preserved:** all pre-existing local packages (Credits Phase 1–4, DED gap-fix/shell/hardening/Sprint 4, permanent exclusions) intact; the parallel Sprint 5 programme's own landing (§F) also preserved untouched.
- **Snapshots:** `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/baseline-2026-11-10/` and `…/after-2026-11-10/` (status, tracked patch, cached patch, critical md5s).
- **Final `git status --short`:** 82 entries — identical to the sprint's working set plus the parallel programme's landing and this sprint's five new files (migration amendment is in-place on an already-untracked file; the four Sprint 5 documents sit under the pre-existing `?? docs/audits/` entry). Full final status is preserved verbatim in `after-2026-11-10/git-status.txt`.

## Acceptance criteria (§13) — assessed one by one

1. Actual baseline reconciled and preserved — **PASS** (Phase 0 snapshot + reconciliation notes; one post-Sprint-4 landing identified).
2. Genuinely disposable PostgreSQL environment available — **BLOCKED** (none exists; installation not authorised).
3. Migration executes successfully against the disposable DB — **NOT RUN**.
4. Harness executes real independent sessions — **NOT RUN** (implemented; self-test at the bash layer PASS).
5. Deliberately failing harness assertion produces non-zero exit — **PASS** (executed, exit 1).
6. F-6 runtime verified under independent concurrent reservations — **NOT VERIFIED**.
7. F-10 runtime verified under independent concurrent review resolution — **NOT VERIFIED**.
8. `issue_batch` same-payload replay is safe — **PARTIAL** (draft behaviour preserved + statically reviewed; runtime NOT RUN).
9. `issue_batch` different-payload replay returns the documented conflict — **PARTIAL** (implemented in the draft this sprint; runtime NOT RUN).
10. `settle_reservation` validates required writes and rolls back atomically — **PARTIAL** (implemented in the draft; runtime NOT RUN).
11. RPC privileges verified using actual PostgreSQL roles — **PARTIAL** (explicit revokes implemented; catalogue/`SET ROLE` verification NOT RUN).
12. Ledger invariant and reconciliation remain healthy — **PASS** at the JS layer (adversarial + concurrency + reconciliation suites green); SQL layer **NOT RUN**.
13. Existing adversarial, billing, metering, Chat FAST regressions pass — **PASS** at this sprint's baseline (one post-landing parallel-programme item classified in §F).
14. TypeScript and Vite build pass — **PASS** (both exit 0, solo runs).
15. No production environment touched — **PASS**.
16. No billing activation — **PASS**.
17. All pending owner decisions remain pending — **PASS** (§H).

**Sprint 5 = PARTIAL**, per the master's own rule: without PostgreSQL, no runtime verification is claimed. The smallest next justified step is unchanged in kind from Sprint 4's recommendation but now fully prepared: provide a disposable PostgreSQL (Supabase-flavoured image) and run harness v2 — everything else in this sprint is done.
