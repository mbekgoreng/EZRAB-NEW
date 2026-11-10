# EZRAB — Unified Credits Sprint 4: Final Report
## Runtime Verification, Adversarial Regression Repair & First Gated AI Integration

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine`
- **HEAD before = HEAD after:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (verified — matches the expected HEAD; no reconciliation exception was needed)
- **Environment:** LOCAL DEVELOPMENT ONLY · Production Status A — PUBLIC SHOWCASE ONLY · Billing DORMANT · `AUTH_ENABLED=false` · `AI_METERING_ENABLED` OFF
- **Sprint verdict: PARTIAL** — everything that could be executed locally passed with zero failures; the PostgreSQL runtime phase is BLOCKED by a documented environment limitation, which caps the sprint at PARTIAL per the acceptance criteria. Nothing was activated.

Companion documents: `UNIFIED_CREDITS_SPRINT_4_SQL_RUNTIME_VALIDATION.md` · `UNIFIED_CREDITS_SPRINT_4_ADVERSARIAL_REGRESSION.md` · `UNIFIED_CREDITS_SPRINT_4_REGRESSION.md` · `docs/architecture/UNIFIED_CREDITS_SPRINT_4_CHATFAST_INTEGRATION.md`. Phase workpapers and snapshots: `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/`.

---

## Phase 0 — Safety snapshot & worktree reconciliation (inventory)

- Repository root `/home/hatch/workspace/ezrab-unified`, branch `integrasi/unified-ui-engine`, HEAD `99de892…` — **identical to the expected HEAD**, so work proceeded without a stop-and-reconcile exception.
- Baseline captured **before any edit** at `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/baseline-2026-11-10-0630/`: HEAD, full `git status --short --branch`, tracked patch (3,973 lines), staged patch (**0 bytes — nothing staged**), untracked list (66 entries), md5 of the 10 critical files named in the brief plus `aiGateway.js`.
- Worktree contents identified by package: 3 modified credit files (Sprint 3: `billingStore.js`, `creditAllocation.js`, `creditLedger.js`); DED gap-fix + DED/document shell + DED Final Hardening modifications (DED estimate/full-ai/document files, `WorkspaceView.tsx`, feature shells, `pdfjsSetup.ts`, `pdfPageService.ts`, `mobileNativeW2.test.ts`); untracked Phase 1–3 credit files (`pricingPolicy.js`, `featureBillingMatrix.js`, `creditReconciliation.js`, metering modules, adapter, migration draft, tests, docs); the parallel **Sprint 4 DED** programme actively adding files during this sprint (e.g. `docs/architecture/DED_UNIFIED_CREDITS_SPRINT_4.md`, `src/test/dedUsageCreditsCompat.src.ts` appeared mid-sprint — preserved untouched); permanent exclusions (ai-audit scripts/outputs, `.github/`, `demo-gen/out/`, harness files, `dist/`).
- Sprint 3 snapshot directories verified present (`~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT3/` incl. `sql-harness/`); the new Sprint 4 snapshot does not replace them. After-snapshot at `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/after-2026-11-10/` with fresh md5s and copies of the three Sprint 4 credit files.

---

## A. Executive verdict (per area)

| Area | Verdict | Basis |
|---|---|---|
| PostgreSQL runtime verification | **BLOCKED** | No PostgreSQL/Docker/Podman on this machine (re-verified); installation not authorised. Zero SQL executed. Sprint 3's harness additionally proven structurally incomplete (§B). |
| Transactional integrity | **PARTIAL** | In-process guarantees now fully pinned by regression (adversarial 71/71, concurrency 52/52). Cross-instance safety remains the SQL RPC contract — statically verified, runtime **NOT VERIFIED**. No in-memory result is claimed as distributed proof. |
| Adversarial regression | **PASS** | 71 PASS / 0 FAIL (from 55 / 3 / 2 NOT RUN); assertions strengthened, none weakened; suite now runs to its summary instead of crashing. |
| Chat FAST integration | **PASS** | Exactly one feature integrated through the shared boundary, behind the OFF gate, via a narrow adapter at the one correct insertion point. |
| Gate-OFF parity | **PASS** | Object-identical and HTTP-level parity vs. the original path; zero ledger writes proven; boundary never invoked. |
| Gate-ON mocked tests | **PASS** | 114-check suite: reserve→execute→settle from actual usage, full release on provider failure, unknown usage → review, fail-closed without auth context, idempotent retry. In-memory mocks only. |
| Provider pricing | **NOT VERIFIED** | Chat FAST route cost remains **UNKNOWN** (Crown tariffs unpublished; MiniMax-M2.7 still absent from MiniMax's official list on re-check). Margin parameters remain `null`. No margin claimed. |
| Security | **PARTIAL** | Client trust boundary proven by tests (12 billing fields rejected; server-derived feature identity; no fabricated account). RPC authorisation is static-only (runtime BLOCKED). Webhook middleware gate unchanged (D17 not granted — by design). |
| Production readiness | **FAIL — NOT PRODUCTION READY** | Correct verdict for a dormant phase: billing inactive, migrations unexecuted, auth off, D6 not granted. Nothing in this sprint changes that status. |

## B. SQL runtime evidence

- **PostgreSQL version:** none — no server exists on this machine (`psql/postgres/pg_ctl/initdb/docker/podman` all MISSING; no container sockets; re-verified this sprint).
- **Disposable database setup:** not executed. A reproducible setup was written (outside the repo): `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/sql-runtime-setup/setup-postgres-disposable.sh` (`postgres:16`, tmpfs, 127.0.0.1:55432, synthetic single-use credentials, refuses non-local PGHOST; `bash -n` clean; **not run**) plus its README with the prerequisite migration order and the D16 warning.
- **Independent session count:** 0 (no database).
- **F-6 / F-10 / F-1 / F-2 / F-4 / F-5 / F-7 runtime results:** all **BLOCKED / NOT RUN**. Static verification of each passed with line-level evidence (see companion report §4), with three documented static findings: (1) SQL `issue_batch` does not conflict a same-key different-payload replay (first result wins) — diverges from the JS ledger's `IDEMPOTENCY_CONFLICT`; (2) `settle_reservation` has no ROW_COUNT assertion; (3) RPCs rely on PUBLIC-revoke + service_role-only grant without explicit anon/authenticated revokes.
- **Harness defect (new, material):** Sprint 3's `sql-harness/concurrency.sh` is an echo-only specification ending in `exit 0` — it executes no concurrent session, so `run_all.sh` "passes" concurrency vacuously; `assertions.sql` never calls `settle_reservation`/`resolve_review` at all. The harness must be rewritten before any future runtime claim (details in companion report §3).
- **Is the migration now runtime verified? NO.** It remains a statically reviewed draft.
- **Production execution remains unauthorised** (grant D16, PENDING_OWNER) and was not attempted.

## C. Adversarial suite

- **Previous assertions:** Case 2 pinned "payload mismatch returns a safe duplicate"; Cases 3/4 pinned the pre-Sprint-3 defects (orphan FREE_ONCE batch, reconciliation-detected divergence, cross-snapshot double settle) as KNOWN LIMITATIONs; the double-settle block then crashed the process on the new `LEDGER_CONFLICT`, leaving 2 checks NOT RUN. Measured baseline this sprint: **55 PASS / 3 FAIL / 2 NOT RUN**.
- **Updated expected behaviour** (each verified against the implementation and by probes before rewriting; no error code invented): mismatch → `IDEMPOTENCY_CONFLICT` with no new batch/entry and the original grant intact; stale FREE_ONCE flush → rejected `UNIQUE_VIOLATION` pre-write, final state exactly 1 batch + 1 GRANT, reconciliation healthy; reservation race → loser rejected `LEDGER_CONFLICT`, exactly one backed reservation; double settle → second flush rejected `LEDGER_CONFLICT`, exactly 1 CONSUME entry, reconciliation healthy.
- **New regression guarantees:** idempotency keys are payload-bound; stale-snapshot flushes are rejected before partial persistence under both rejection codes; every repaired race converges to a reconciliation-healthy state — while Cases 15/16/17 still prove reconciliation detects genuine corruption.
- **Exact results:** **71 PASS / 0 FAIL**, exit 0, summary printed. Checks grew 60 → 71; no case removed, skipped, or weakened; no sleep-based synchronisation introduced.
- **Remaining failures:** none.

## D. Chat FAST integration

- **Actual integration files:** NEW `api/_lib/chatFastMetering.js` (narrow adapter); MODIFIED `api/_lib/aiGateway.js` (+65/−1, 3 hunks). `executeAI` itself is **unchanged** — wrapping its `'fast'` mode was evaluated and rejected on evidence (real Chat FAST traffic runs as mode `'chat'`; the `'fast'` chain is shared with DED/Document products).
- **Exact insertion point:** `handleAiRequest`, `api/_lib/aiGateway.js` step 6 → new block 6a (lines 758–816), the only point holding authenticated context + server-mapped mode + validated `productId`. Context/boundary arrive only via `opts.meteringContext` / `opts.meteringBoundary`, which **no production handler passes today**.
- **Architecture / lifecycle:** request → server-side feature derivation (`chat`, or `fast`+`EZRAB_AI` → `chat-ai/fast`) → shared Sprint 3 boundary → existing AI execution → usage evidence → settle/release/review per the existing lifecycle. No parallel billing code, no duplicated state machine, no localStorage debit, no flat charge.
- **Feature derivation:** entirely server-side; client-proposed feature keys/costs are rejected or ignored (12 billing fields tested individually).
- **Gate-OFF behaviour:** total bypass before any metering call; boundary untouched; **zero ledger writes proven** (operations/entries/balance/reserved identical); ordinary requests never rejected for dormant billing.
- **Gate-ON mocked behaviour:** in-test only (`'true'` + in-memory ledger): reservation held during execution (25 credits, status RESERVED), settlement from actual usage with remainder released, provider failure → full release, missing evidence → `REQUIRES_REVIEW` with no fabricated numbers, no context/boundary → fail-closed with zero provider calls, idempotent retry → 1 operation / 1 debit.
- **Usage evidence:** passed through from the provider result as-is; where the provider returns none, the operation goes to review — token counts are never estimated into existence. (The reservation *estimate* is a server-side heuristic — `ceil(chars/4)` + 1000-token allowance — used only to size the hold, never as a charge.)
- **Error & retry behaviour:** inherited from the unmodified gateway chains; metering adds no retry of its own; lifecycle retry is idempotent.
- **Output parity:** deterministic mocked provider → identical result object and identical HTTP response shape vs. the original path (provider `gemini`, model `gemini-3.5-flash-lite`).
- **Ledger-write proof (gate OFF):** spy boundary + store snapshots in `src/test/chatFastMetering.test.ts` (114 PASS / 0 FAIL).

## E. Files changed

### Existing files modified (2)

| Path | Change | Reason | Coverage | Modified before Sprint 4? |
|---|---|---|---|---|
| `src/test/creditInvariantAdversarial.test.ts` | Cases 2, 3a rewritten to Sprint 3 guarantees; new Case 4a (reservation CAS); Case 4b double-settle updated; header reframed | Phase 2 — pin the repaired guarantees | Itself: 71/71 | Yes — untracked Phase 2 file |
| `api/_lib/aiGateway.js` | Import (l.41), opts docs (ll.620–624), metering block 6a (ll.758–816); +65/−1 | Phase 3 — the single Chat FAST insertion point | chatFastMetering 114/114; gateway suites green | No — clean at HEAD in baseline |

### New source files (1)

| Path | Summary |
|---|---|
| `api/_lib/chatFastMetering.js` | Narrow Chat FAST metering adapter: server-side feature derivation, gate-OFF bypass, gate-ON lifecycle runner |

### New tests (1)

| Path | Summary |
|---|---|
| `src/test/chatFastMetering.test.ts` | 114 checks: gate OFF (absent/false/invalid) parity + zero-write proof; gate ON mocked lifecycle; Phase 4 trust-boundary audit |

### New documents (5)

`docs/audits/UNIFIED_CREDITS_SPRINT_4_FINAL_REPORT.md` (this file) · `docs/audits/UNIFIED_CREDITS_SPRINT_4_SQL_RUNTIME_VALIDATION.md` · `docs/audits/UNIFIED_CREDITS_SPRINT_4_ADVERSARIAL_REGRESSION.md` · `docs/audits/UNIFIED_CREDITS_SPRINT_4_REGRESSION.md` · `docs/architecture/UNIFIED_CREDITS_SPRINT_4_CHATFAST_INTEGRATION.md`. Outside the repo: `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT4/` (baseline + after snapshots, phase workpapers, `sql-runtime-setup/`).

### Deliberately untouched

`middleware.ts` (webhook gate — D17); `supabase/migrations/20261110_unified_credits_foundation.sql` (md5 `685d8ad4…` unchanged); `api/_lib/billingStore.js`, `creditLedger.js`, `creditAllocation.js`, `aiMetering.js`, `aiMeteringLifecycle.js`, `dedBillingAdapter.js`, `featureBillingMatrix.js`, `tariffRegistry.js` (md5-identical to baseline); Gen-1 code; legacy `server/`; localStorage simulation; **all DED files** (the adapter was NOT wired into the DED pipeline); all Phase 1/2/Sprint 3 reports.

## F. Regression results

Full command/result pairs are in `UNIFIED_CREDITS_SPRINT_4_REGRESSION.md`. Headlines: adversarial **71/71**; new Chat FAST suite **114/114**; Sprint 3 suites **271/271** (52+83+94+42); Phase 1 suites **174/174** (33+87+23+31); vitest billing set **110/110** (identical to baseline); billing tsx family (webhook 38, catalog drift 21, checkout 23, action handler 9) green; gateway suites green; `apiEndpointInventory` 13/13 (12-function ceiling intact); financialConsistency 40/40; DED spot checks (dedPriceCompletion **43/43** — the parallel programme's fix has landed; dedDocPageShell 50/50) green with zero DED files changed by this sprint; **tsc exit 0**; **vite build exit 0** (combined worktree, solo; two earlier tsc attempts OOM-killed at heap 6144 alongside the parallel programme's own tsc on the shared VM — environment pattern, passing run at heap 4096 on the identical tree).

**Counting discipline:** numeric suites sum to 1,025 counted checks / 0 failures, but suites overlap in coverage, so that sum is **not** a unique-test count and is not presented as one. The "806" figure from the Sprint 3 brief was the *DED programme's* combined baseline (different suite set); overlapping anchors reconcile exactly (§F companion).

**NOT RUN (not counted as PASS):** every PostgreSQL runtime scenario — BLOCKED, see §B.

## G. Remaining blockers — owner decisions (none resolved or inferred by this sprint)

Preserved verbatim from the decision register (`docs/product/UNIFIED_CREDITS_OWNER_DECISIONS.md`) and the sprint brief:

- **D1 / D2 / D4** — account closure, refunds, transfers: `PENDING_LEGAL_REVIEW` (legal review required before implementation).
- **D6** — billing activation authorisation: `PENDING_OWNER` — **NOT GRANTED**.
- **D7** — frontend allocation-order alignment: `PENDING_OWNER` (server Phase 5.1 order stands).
- **D8** — top-up pricing and tiers: `PENDING_OWNER`.
- **D9** — margin-formula adoption: `PENDING_OWNER`; parameters (`creditValueIdr`, `costMultiplierMilli`, `targetGrossMarginBps`, `fxIdrPerUsd`) verified still `null` in `pricingPolicy.js:84-87`.
- **D10** — provider tariff verification: `PENDING_PROVIDER_VERIFICATION`. Phase 5 audit this sprint: routing unchanged (Crown heads fast/chat/advanced — `aiGateway.js:49-57, 451-513`); **Chat FAST route cost remains UNKNOWN**; Crown, AtmoRouter, ZyRouter, River, Dahl, Atria, VLEEE, and Serper per-search cost all remain UNKNOWN on code evidence; MiniMax's official list (re-checked 2026-11-10) still omits MiniMax-M2.7, and MiniMax list prices would not equal Crown route costs in any case. No registry was changed; no price was written anywhere.
- **D16** — migration execution grant: `PENDING_OWNER`. (Now additionally informed by §B: the SQL draft has two documented static gaps — payload-conflict divergence and the missing ROW_COUNT in `settle_reservation` — and the Sprint 3 harness needs a real concurrency implementation before runtime evidence can exist.)
- **D17** — webhook middleware exemption grant: `PENDING_OWNER`; middleware untouched this sprint.
- **D14** — frontend simulation retirement: `PENDING_OWNER`; simulation untouched.
- **D18** — staged activation sequence: `READY_FOR_APPROVAL` (plan only; execution not granted).
- **F-13** — tamper-evidence decision: open (informational per Phase 2; not changed).
- **Receipt-scan endpoint**: build inside the boundary or retire the feature — open; the metering registry still rejects it `TRANSPORT_UNAVAILABLE` because the endpoint does not exist.
- **Legacy `server/`** isolation/retirement: open; code untouched this sprint.
- **DED adapter activation**: open — `dedBillingAdapter.js` remains a dormant contract; wiring it into the real DED pipeline requires the parallel DED programme to complete plus a separate integration grant. Not done here (Phase 6 fence).
- **New from this sprint (technical, not decisional):** (i) rewrite `sql-harness/concurrency.sh` into real dual-session scenarios and add settle/review coverage to `assertions.sql`; (ii) a workspace billing-account resolver is required before gate-ON can ever run in production (account IDs are never fabricated from user IDs); (iii) a PostgreSQL-capable environment (or install permission) is required for any runtime SQL evidence.

## H. Git safety proof

- Branch: `integrasi/unified-ui-engine`. **HEAD unchanged:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` before and after.
- **Staged files: 0** (verified at baseline and at close; nothing was ever staged). **No commit, no push, no merge, no tag, no deployment, no production migration.**
- Final `git status --short` delta vs. the Phase 0 baseline is exactly the sprint's own footprint: tracked-modified set identical to baseline **plus** `api/_lib/aiGateway.js`; untracked additions **only** `api/_lib/chatFastMetering.js`, `src/test/chatFastMetering.test.ts`, this sprint's five documents — plus two files belonging to the parallel Sprint 4 DED programme (`docs/architecture/DED_UNIFIED_CREDITS_SPRINT_4.md`, `src/test/dedUsageCreditsCompat.src.ts`), which appeared during the sprint and were preserved untouched.
- Critical-file md5s: every Sprint 3 / Phase 1 credit file and the migration draft are **byte-identical** to baseline; only `aiGateway.js` (`f2ad63bd…` → `635f9c3b…`) and `creditInvariantAdversarial.test.ts` (`1b0702e7…` → `41b08f82…`) changed, plus the two new files.
- **`AI_METERING_ENABLED` remains OFF:** 0 occurrences in `.env`, `.env.example`, `.env.staging.example`; the flag was set to `'true'` only inside isolated test processes. **`AUTH_ENABLED=false`** verified at `src/App.tsx:39`. **Billing remains dormant; middleware unchanged; all parallel DED work intact** (tracked-modified DED set identical to baseline; DED suites spot-checked green).

## Acceptance criteria (§13) — assessed one by one

| # | Criterion | Status |
|---|---|---|
| 1 | Repository baseline reconciled & protected | **PASS** (HEAD matched expectation; snapshots before/after) |
| 2 | SQL harness run on disposable PostgreSQL, or exact blocker documented without false runtime claims | **BLOCKED — documented** (no PostgreSQL exists; installation unauthorised; harness also proven incomplete) |
| 3 | F-6/F-10 independent-session runtime tests | **NOT RUN** (depends on #2) |
| 4 | Adversarial suite updated to Sprint 3 guarantees without weakening | **PASS** (71/71; checks 60→71) |
| 5 | Chat FAST is the only real feature path integrated | **PASS** |
| 6 | Gate-OFF Chat FAST behaviour proven equivalent | **PASS** (object + HTTP parity) |
| 7 | No gate-OFF ledger writes or simulation debits | **PASS** (proven by spy/store assertions) |
| 8 | Gate-ON tested only with controlled mocks | **PASS** (in-memory ledger, test process only) |
| 9 | No DED files or unrelated parallel work modified | **PASS** (md5/status evidence) |
| 10 | TypeScript and Vite build pass | **PASS** (both exit 0, combined worktree) |
| 11 | Failures and limitations reported honestly | **PASS** (BLOCKED/NOT RUN stated, never counted as PASS) |
| 12 | No production activation or owner decision inferred | **PASS** (§G preserved entire) |

**Overall: PARTIAL** — capped by criteria 2–3 (environment), exactly as the master prompt prescribes. The smallest technically justified next step remains: provision a disposable PostgreSQL (one install permission or a Docker-capable machine), rewrite the harness concurrency stage into real dual-session scenarios, and run F-6/F-10 to convert the SQL draft from static review to runtime evidence — still under the D16 fence for anything beyond a disposable database.
