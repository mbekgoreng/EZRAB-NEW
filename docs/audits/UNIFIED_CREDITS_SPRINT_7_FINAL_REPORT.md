# EZRAB — Unified Credits Sprint 7: Final Report
## PostgreSQL Provisioning Readiness, Harness Hardening & Runtime Test Preparation

- **Date:** 2026-11-10 · **Repo:** `/home/hatch/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine`
- **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` — identical at baseline and at close (no commit appeared since Sprint 5/6).
- **Environment:** LOCAL ONLY · Production status A — PUBLIC SHOWCASE ONLY · Billing DORMANT · `AUTH_ENABLED=false` (verified `src/App.tsx:39`) · `AI_METERING_ENABLED` OFF (read only from process environment by `api/_lib/aiMetering.js`; never set persistently).
- **Overall Sprint 7 verdict: PASS** — under the master prompt's own definition: *all authorised Sprint 7 objectives are complete.* The authorised objectives were explicitly the work that is safely possible **without** database infrastructure (objectives A–E, §3 of the prompt). The PostgreSQL runtime programme itself remains **BLOCKED on the owner's provisioning grant**, exactly as in Sprint 6 — that blocker is a precondition owned by the owner, not an authorised Sprint 7 task left incomplete, and §11's BLOCKED definition ("a required authorization … prevents the next required operation") describes the *runtime programme's* next operation, which Sprint 7 was scoped to prepare for, not to perform. **Nothing in this verdict is, or may be read as, PostgreSQL runtime verification.** SQL transactional integrity remains unproven until the real independent-session scenarios pass (see §9).

Companion documents: `UNIFIED_CREDITS_SPRINT_7_PROVISIONING_SPEC.md`, `UNIFIED_CREDITS_SPRINT_7_HARNESS_HARDENING.md`, `UNIFIED_CREDITS_SPRINT_7_RUNTIME_EXECUTION_CHECKLIST.md`. Phase 1–6 reports are preserved untouched as historical evidence.

---

## A. Per-area verdicts

| Area | Verdict | Basis |
|---|---|---|
| A — Sprint 6 baseline & evidence reconciliation | **PASS** | HEAD/status/checksum identical to Sprint 6 closure (82 porcelain entries, md5 `170f0d79…`); Sprint 6 asks re-assessed one by one (§3) |
| B — Provisioning specification | **PASS** | `UNIFIED_CREDITS_SPRINT_7_PROVISIONING_SPEC.md` — every requirement derived from the actual migration chain + harness with file/line evidence |
| C — Harness concurrency hardening | **PASS** | Point-10 gap closed harness-only; guards re-proven at the shell level before and after (§4). Timeout paths themselves are NOT runtime-exercised (no `psql` exists) — stated, not hidden |
| D — Runtime execution checklist | **PASS** | `UNIFIED_CREDITS_SPRINT_7_RUNTIME_EXECUTION_CHECKLIST.md` — deterministic Gate 0 → Step 10, each step with an explicit pass/fail gate |
| E — Preservation of SQL & application behaviour | **PASS** | Migration untouched (md5 unchanged); gateway untouched; DED files untouched; only the harness file outside the repo and three new docs changed (§2) |
| Chat FAST test pin (Phase 3) | **NOT APPLIED — grant required (by design)** | §5: the authorised edit exists, but activating it without a commit path would break the already-prepared Batch 4 staging manifest; the master's own rule routes it to a separate owner grant |
| SQL static review (Phase 4) | **PASS — zero drift** | §6: every Sprint 6 line reference reproduces exactly; no defect found |
| Regression (Phase 5) | **PASS as state confirmation** | §7: every Sprint 6 baseline number reproduces exactly, freshly executed, sequential and solo. NOT runtime proof |
| PostgreSQL runtime verification | **BLOCKED (unchanged)** | No PostgreSQL/Docker/Podman on this machine (re-verified Sprint 7 Phase 0); installation not authorised. Zero SQL executed in Sprint 7 |
| Provider pricing | **NOT VERIFIED (unchanged)** | Crown route cost UNKNOWN; margin parameters remain `null`; nothing re-priced |
| Production readiness | **FAIL — NOT PRODUCTION READY (unchanged)** | Never claimed in any sprint of this programme |

## 1. Baseline and final state (exact)

**Baseline (Sprint 7 Phase 0, captured 2026-11-10T08:34Z)** — preserved at `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT7/baseline-2026-11-10/` (HEAD, porcelain status, full tracked diff 4,666 lines, staged diff [empty], diff stat, critical-file md5s):

- Repository root `/home/hatch/workspace/ezrab-unified`; branch `integrasi/unified-ui-engine`; HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896` = expected. No reconciliation exception was needed.
- Worktree: **82 porcelain entries (30 modified + 52 untracked), staged 0** — identical to the Sprint 6 baseline and closure.
- Migration checksum: md5 **`170f0d79b0b43dccea9f81b95ed5ea27`**, 1,227 lines — exactly the Sprint 6 expected value.
- Environment re-verified with actual commands: `psql`, `postgres`, `pg_ctl`, `initdb`, `docker`, `podman`, `pg_isready`, `createdb` — **all MISSING**; no Docker/Podman sockets; no `/usr/lib/postgresql`; nothing listening on 5432/5433; no `PG*`/`DATABASE_URL`/`SUPABASE*` environment variables. Runtime work stopped at this gate, as instructed.
- Harness ownership: harness v2 lives **outside** the repository at `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/`, owned by the Unified Credits programme; baseline md5s: `concurrency.sh` `186c454b…`, `lib.sh` `4647328d…`, `run_all.sh` `07a54a64…`, `selftest.sh` `716b150d…`, `setup.sql` `0c1ac128…`, `assertions2.sql` `be605d6b…`, `README.md` `3cb8153d…`.
- Parallel work identification: the **DED Sprint 5 landing is complete and closed** — its final report (`docs/audits/DED_SPRINT_5_FINAL_REPORT.md`, verdict PARTIAL, mtime 2026-11-10T00:21Z) and seven companion documents are on disk, together with its code landing (gateway X1/X2/X4, DED correlation, price refresh — visible in the 30 modified files) and a **commit-readiness manifest** (`DED_SPRINT_5_COMMIT_READINESS.md`) proposing staged batches over the shared worktree. No DED file was modified during the Sprint 7 window (worktree status byte-identical to the Sprint 7 baseline at close).

**Final state:** HEAD unchanged; porcelain status **identical** to the Sprint 7 baseline (the three new Sprint 7 documents sit under the pre-existing `?? docs/audits/` entry, so the count is unchanged at 82); staged 0; migration md5 unchanged. Closing snapshot: `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT7/after-2026-11-10/`.

## 2. Exact files modified and created

**Repository files modified: NONE.** No migration, gateway, DED, test, or configuration file in the repo was edited in Sprint 7 (the Phase 3 decision in §5 is precisely about the one edit that was *not* made).

**Repository files created (3, documentation, untracked under the pre-existing `?? docs/audits/` entry):**
- `docs/audits/UNIFIED_CREDITS_SPRINT_7_FINAL_REPORT.md` (this file)
- `docs/audits/UNIFIED_CREDITS_SPRINT_7_PROVISIONING_SPEC.md`
- `docs/audits/UNIFIED_CREDITS_SPRINT_7_HARNESS_HARDENING.md`
- `docs/audits/UNIFIED_CREDITS_SPRINT_7_RUNTIME_EXECUTION_CHECKLIST.md`

**Outside the repository (1 file modified):**
- `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/sql-harness-v2/concurrency.sh` — Sprint 7 hardening amendment (§4). md5 `186c454b…` → `b9c9136311bdd26b95fe25fa42a42e6a`; 348 → 445 lines.

**Outside the repository (created):** `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT7/` — `baseline-2026-11-10/` (Phase-0 snapshot), `harness-backup-original/` (byte-identical pre-edit harness copies + `MD5.txt`), `concurrency-hardening.diff` (the full minimal diff), `selftest-before.log`, `selftest-after.log`, `after-2026-11-10/` (closing snapshot).

**Deliberately untouched (verified against baseline md5/status):** the migration draft; all other harness files (`lib.sh`, `selftest.sh`, `run_all.sh`, `setup.sql`, `assertions2.sql`, `README.md` — md5s unchanged); the Sprint 3 harness; `api/_lib/*` (gateway, metering, ledger); `middleware.ts`; `src/test/chatFastMetering.test.ts` (read-only in §5); all DED implementation files and DED Sprint 5 documents; Gen-1; the localStorage simulation; legacy `server/`; all Phase 1–6 reports.

## 3. Sprint 6 reconciliation (objective A) — its four asks, re-assessed

1. **Provisioning authorisation** — still outstanding; remains the single smallest next owner action (§10). Sprint 7 converted the Sprint 6 request into a full derived specification (companion doc) so the grant, once given, needs no further design work.
2. **Harness naming choice** — still the owner's; documented in the provisioning specification §5 with the exact three touch-points a rename would require (`lib.sh`, `setup.sql` §1, `run_all.sh`). Not renamed in Sprint 7.
3. **Chat FAST test-pin grant** — Sprint 7 performed the full investigation and reached a decision: the edit is **not applied** in this sprint, for a coordination reason discovered in the evidence (§5). The grant is requested as part of the post-commit integration step.
4. **Harness-hardening grant** (Sprint 6 listed it as *optional/future*) — Sprint 7's master prompt carries its own explicit Phase 2 hardening authorisation, which supersedes the need for that separate grant; executed in §4.

## 4. Harness hardening (objective C) — summary

Full record: `UNIFIED_CREDITS_SPRINT_7_HARNESS_HARDENING.md`. In brief:

- **Gap (Sprint 6 Point 10):** `concurrency.sh` had no `timeout` command, no `statement_timeout`/`lock_timeout`, and unbounded `wait` in `end_a`/`end_b` — fail-stuck, never fail-open.
- **Change (one file, +89/−4 diff lines incl. headers; the 4 removals are launch/wait lines replaced by bounded equivalents):** interactive sessions A/B launch under process-level `timeout` (default 600 s, TERM then KILL after 10 s); `end_a`/`end_b` use a bounded wait (default 30 s) that on expiry kills the session, records exit 124 and counts a harness failure (non-zero exit); one-shot connections (`q()`, observer polls, `psql -f`) inherit `PGOPTIONS` `statement_timeout` 120 s / `lock_timeout` 60 s.
- **Deliberate non-application:** SQL-level timeouts are **not** set on the interactive sessions — session A must hold its transaction open at the barrier, and session B must stay genuinely blocked for the observer's `pg_stat_activity` proof; a `lock_timeout` there would destroy the evidence the harness exists to produce. Poll budgets (~20 s / ~10 s) were already bounded and are unchanged; no sleep-based correctness was introduced; **no assertion was weakened, removed, or re-worded**; no scenario SQL changed.
- **Cleanup safety preserved by construction:** timeout exits still fire the script's EXIT trap (own `$TMPD` only) and propagate as a FAIL stage to `run_all.sh`, whose drop path re-verifies name pattern + marker before dropping only its own database. A partial failure cannot trigger cleanup outside the harness-owned disposable database.
- **Evidence (shell level only):** `bash -n` OK; self-test **5/5 PASS exit 0 both before and after** (failing assertion → 1; passing → 0; non-loopback host → 2; non-disposable name → 2; missing `psql` → BLOCKED 3); hardened `concurrency.sh` standalone and `run_all.sh` both still exit **3 BLOCKED** without `psql`. **Honest limit:** the new timeout/kill paths cannot be exercised without a live `psql` + database; they are code-reviewed and syntax-checked only, and the runtime checklist (Step 7) makes their first real exercise an explicit, recorded checkpoint. No SQL runtime validation is claimed.

## 5. Chat FAST test pin (Phase 3) — decision and result

**The item.** `src/test/chatFastMetering.test.ts:473–474` pins the gateway success body to exactly 7 keys (`content, durationMs, mode, model, provider, requestId, success`). The DED programme's X1 change added three deliberate, client-safe fields (`usage`, `usageStatus`, `attempts` — `api/_lib/aiGateway.js` sanitiser at lines 643–687: whitelist fields only, unknown usage honestly `null` + `usageStatus:'missing'`). Fresh Sprint 7 run: **113 PASS / 1 FAIL, suite exit 1**; the single FAIL is verbatim that assertion. All other gate-OFF parity checks pass.

**Verification of the Sprint 6 classification (from actual code, not copied):** classification **(c)** confirmed — the assertion is conclusively an exhaustive exact-shape assertion that has become stale; the change is purely additive; the seven original fields keep identical names, types and meanings; nothing was removed, renamed or re-typed. Under the master prompt's decision rule, the smallest Credits-owned update (expected key list 7 → 10, label updated) is the authorised remedy.

**Decision: the edit is NOT applied in Sprint 7.** Reason, from evidence gathered in Phase 0/3:

- The parallel programme is **not** mid-flight: DED Sprint 5 has landed and *closed* (its final report and commit-readiness manifest are written). The coordination risk the no-edit rule guards against (editing a file a live programme is touching) does not apply — the test file's mtime (2026-11-09T23:33Z) predates even the DED landing.
- However, DED Sprint 5's manifest **already incorporates this exact file into a prepared staging batch**: `DED_SPRINT_5_COMMIT_READINESS.md` Batch 4 ("Gateway evidence + Chat FAST") lists `src/test/chatFastMetering.test.ts` with the explicit note that the pin *"must be deliberately updated by the Credits side — decide before or with this batch"*, and its §42 directs that the update happen **under the owner's commit grant**. The manifest's recorded state for the suite (113/1) is part of a prepared, hashed staging proposal.
- Editing the file now — with no commit authorised — would silently invalidate that manifest's recorded state and hashes, while buying nothing: the suite cannot go durably green in an uncommitted worktree whose staging plan is already written around the current state.
- The Sprint 6 final report had already assigned ownership of this fix to *"the Unified Credits programme, via a future integration grant"*, and the register's standing rule (D-register preamble) is that approvals name the exact action. The Sprint 7 Phase-3 authorisation's purpose is served by recording the decision, the exact minimal edit, and its owner at the exact point the DED manifest designates.

**Required approval (exact):** owner grant for the Credits-owned pin update — one assertion in `src/test/chatFastMetering.test.ts` (expected sorted key list from 7 to `['attempts','content','durationMs','mode','model','provider','requestId','success','usage','usageStatus']`, label updated to name the three additive X1 fields) — to be applied **with or immediately before the Batch 4 commit** from the DED Sprint 5 commit-readiness manifest, followed by the focused run `npx --yes tsx src/test/chatFastMetering.test.ts` (expected result after the edit: **114 PASS / 0 FAIL**, to be proven at that time, not claimed now). The gateway was not modified; no DED implementation was modified; the assertion was not weakened or deleted.

## 6. SQL static review (Phase 4) — read-only, zero drift

Method: grep-level inspection of the current file (md5 `170f0d79b0b43dccea9f81b95ed5ea27`, 1,227 lines) against every Sprint 6 line reference. **The migration was not edited.** Findings:

| Item | Evidence (this sprint) | Status |
|---|---|---|
| Five RPC signatures | `issue_batch` L261, `reserve_credits` L464, `settle_reservation` L622, `resolve_review` L855, `apply_expirations` L1137 — exact Sprint 6 lines; `RETURNS text` ×4 (L274/468/629/863), `apply_expirations RETURNS bigint` L1141 | ✓ zero drift |
| `SECURITY DEFINER` + pinned `search_path` | `SET search_path = public` at L277, 471, 632, 866, 1144 — one per function, immediately after each DEFINER clause (remaining grep hits are header prose) | ✓ |
| Explicit revokes + service-role-only grants | View L224–226; functions L436/438/439→440, 590/592/593→594, 819/821/822→823, 1124/1126/1127→1128, 1199/1201/1202→1203 — all reproduce exactly | ✓ |
| `issue_batch` idempotency payload comparison | `'IDEMPOTENCY_CONFLICT'` returns at code L349 + L429; advisory lock `pg_advisory_xact_lock(hashtextextended(account||':'||key))` L300; Sprint 5 header amendment L63–96 | ✓ |
| F-6 reservation locking + post-loop assertion | `FOR UPDATE` ×19 across the file; allocation loop L521–576; post-loop `IF v_need <> 0 OR v_allocated <> … THEN` RAISE at L574–576 | ✓ |
| F-10 terminal CAS | Early `status <> 'PENDING'` → `'already_resolved'` L898–899; final CAS `UPDATE … WHERE id = … AND status = 'PENDING'` L1102–1103 with `GET DIAGNOSTICS` L1104 + zero-row RAISE L1105–1107 | ✓ |
| Settlement ROW_COUNT assertions | In-code `GET DIAGNOSTICS … ROW_COUNT` — settle 8 (L679, 694, 728, 743, 758, 773, 786, 810), reserve 3 (L546, 553, 581), resolve_review 6 (L968, 1014, 1044, 1066, 1090, 1104), total 17 (= Sprint 6 count; grep total 19 includes 2 header mentions); `settle_allocation_batch_missing` RAISE L713; post-loop `settle_consumption_mismatch` RAISE L798 | ✓ |
| Transaction atomicity structure | Each RPC is a single PL/pgSQL function (implicit single transaction); any RAISE rolls back the function's writes; `$$` delimiters balanced (14 occurrences = 7 pairs: view + 5 functions + rollback note structure as in Sprint 6) | ✓ |
| Defects found | **None.** No file/line defect to report. The standing non-defect limitations remain as previously recorded (F-13 tamper-evidence = owner design decision; runtime behaviour of every item above = NOT VERIFIED until a real run) | — |

## 7. Regression (Phase 5) — freshly executed, state confirmation only

**Classification: newly executed tests, run in Sprint 7 as state confirmation. NOT database runtime tests; no SQL scenario ran.** Method: Sprint 6's exact commands, strictly sequential, one heavy process at a time (no duplicate dispatch — the Sprint 6 incident was not repeated; tsc and build each ran once, solo, to completion). Suite counts overlap in coverage and are **not** summed as unique tests.

| Suite | Command | Exit | Result | Sprint 6 baseline |
|---|---|---|---|---|
| pricingPolicy | `npx --yes tsx src/test/pricingPolicy.test.ts` | 0 | 33 PASS, 0 FAIL | 33 ✓ |
| featureBillingMatrix | `npx --yes tsx src/test/featureBillingMatrix.test.ts` | 0 | 87 PASS, 0 FAIL | 87 ✓ |
| creditReconciliation | `npx --yes tsx src/test/creditReconciliation.test.ts` | 0 | 23 PASS, 0 FAIL | 23 ✓ |
| unifiedCreditLifecycle | `npx --yes tsx src/test/unifiedCreditLifecycle.test.ts` | 0 | 31 PASS, 0 FAIL | 31 ✓ |
| creditInvariantAdversarial | `npx --yes tsx src/test/creditInvariantAdversarial.test.ts` | 0 | **71 PASS, 0 FAIL** | 71/71 ✓ |
| creditConcurrencySprint3 | `npx --yes tsx src/test/creditConcurrencySprint3.test.ts` | 0 | **52 PASS, 0 FAIL** | 52/52 ✓ |
| ai-metering | `npx --yes tsx src/test/ai-metering.test.ts` | 0 | 83 PASS, 0 FAIL | 83 ✓ |
| deterministic-free-metering | `npx --yes tsx src/test/deterministic-free-metering.test.ts` | 0 | 94 PASS, 0 FAIL | 94 ✓ |
| dedBillingCompat | `npx --yes tsx src/test/dedBillingCompat.test.ts` | 0 | 42 PASS, 0 FAIL | 42 ✓ |
| **chatFastMetering** | `npx --yes tsx src/test/chatFastMetering.test.ts` | **1** | **113 PASS, 1 FAIL** — the single classified pin (§5) | 113/114 ✓ (same item) |
| billingWebhook | `npx --yes tsx src/test/billingWebhook.test.ts` | 0 | 38 PASS, 0 FAIL | 38 ✓ |
| billingCatalogDrift | `npx --yes tsx src/test/billingCatalogDrift.test.ts` | 0 | 21 PASS, 0 FAIL | 21 ✓ |
| billingCheckout | `npx --yes tsx src/test/billingCheckout.test.ts` | 0 | 23 PASS, 0 FAIL | 23 ✓ |
| billingDemoGate | `npx --yes tsx src/test/billingDemoGate.test.ts` | 0 | 46 PASS, 0 FAIL | 46 ✓ |
| creditsActionHandler | `npx --yes tsx src/test/creditsActionHandler.test.ts` | 0 | 9 PASS, 0 FAIL | 9 ✓ (reported separately, as in Sprint 6) |
| apiEndpointInventory | `npx --yes tsx src/test/apiEndpointInventory.test.ts` | 0 | 13 PASS, 0 FAIL (12-function Vercel ceiling intact) | 13 ✓ |
| financialConsistency | `npx --yes tsx src/test/financialConsistency.test.ts` | 0 | 40 PASS, 0 FAIL | 40 ✓ |
| Vitest billing set | `~/workspace/kontraktor-os/node_modules/.bin/vitest run src/test/creditLedger.test.ts src/test/phase53BillingSecurity.test.ts src/test/usageMeter.test.ts src/test/aiCredits.test.ts src/test/chatCreditDebit.test.ts` | 0 | **110 passed, 0 failed** (35+20+17+16+22) | 110/110 ✓ |
| TypeScript | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --skipLibCheck` | **0** | 0 errors, solo, ~147 s | exit 0 ✓ |
| Vite build | `NODE_OPTIONS=--max-old-space-size=3072 node node_modules/vite/bin/vite.js build` | **0** | `✓ built in 2m 25s`, chunk-size warnings only | exit 0 ✓ |

Phase 1 aggregate: 33 + 87 + 23 + 31 = **174/174**, identical to baseline. Static checks performed in Sprint 7: migration grep review (§6), environment discovery (Phase 0), harness `bash -n` + guards (§4). Mocked/in-process tests: the JS suites above (mock dependencies, in-memory state) — as always, they are not PostgreSQL proof. **Actual database runtime tests executed in Sprint 7: zero.**

## 8. Remaining owner decisions (none resolved, none inferred)

The full register stands (`docs/product/UNIFIED_CREDITS_OWNER_DECISIONS.md`): **D1/D2/D4** legal review · **D3** LOCKED (`PERIOD_END_30`) · **D5** LOCKED (MIDTRANS) · **D6** billing activation — **NOT GRANTED** · **D7** allocation-order alignment · **D8** top-up pricing · **D9** margin formula (parameters `null`) · **D10** provider tariff verification · **D11** DED flat reserve vs token settlement · **D12** Starter AHSP entitlement scope · **D13** highest package display name · **D14** simulation retirement · **D15** internal finance dashboard · **D16** migration execution grant · **D17** webhook exemption grant · **D18** activation sequence (`READY_FOR_APPROVAL`) · **D19** Gen-1→Gen-2 reconciliation (`BLOCKED_TECHNICAL`) · **F-13** tamper-evidence decision · receipt-scan endpoint-or-retirement · legacy `server/` isolation · DED adapter activation · DED **F-E2** complexity contract (owner decision required, per the DED Sprint 5 report).

Carried programme asks: (i) **provisioning grant** (§10 — the smallest next action); (ii) **harness naming choice** (Sprint 5 pattern as-is vs deliberate rename — provisioning spec §5); (iii) **Chat FAST pin grant**, to be executed with/just before the DED manifest's Batch 4 commit (§5); (iv) the **commit grants** for the accumulated local packages themselves, per the DED Sprint 5 commit-readiness manifest and the standing per-batch protocol.

## 9. Explicit confirmations

- **No database execution:** zero SQL was executed against any database in Sprint 7; no migration was applied anywhere; no database was created, connected to, or dropped.
- **No infrastructure installation:** nothing was installed; no service was started or created; the environment is byte-for-byte the Sprint 6 environment (all binaries still MISSING).
- **Billing remains dormant:** no billing, subscription, top-up, paid-credit, Midtrans, auth, or metering activation of any kind; `AUTH_ENABLED=false` unchanged; `AI_METERING_ENABLED` remains OFF.
- **No commit, push, merge, tag, or deployment** occurred; staged files = 0 throughout; HEAD unchanged.
- **No gateway behaviour and no DED implementation was modified.** No production readiness status was changed, and none is claimed: production readiness remains **FAIL — NOT PRODUCTION READY**, and SQL transactional integrity remains **NOT VERIFIED** until the real independent-session scenarios have passed against a disposable PostgreSQL.
- Sprint 8 was **not** started.

## 10. The single smallest next action required from the owner

**Grant the provisioning authorisation** — one decision, exactly as specified in `UNIFIED_CREDITS_SPRINT_7_PROVISIONING_SPEC.md` and `UNIFIED_CREDITS_SPRINT_6_POSTGRES_RUNTIME.md` §3:

> Authorise installing **Docker Engine** on this VM for disposable-only use — **or** PostgreSQL 16 + `psql` for a disposable local database — **or** designate any Docker-capable machine; the database image must be **Supabase-flavoured (`supabase/postgres`)**, not vanilla `postgres:16`.

That single grant unblocks the entire prepared chain: self-test → `run_all.sh` → migration execution → assertions → two-session concurrency evidence → P-1 — all already built, hardened (Sprint 7), and checklisted (`UNIFIED_CREDITS_SPRINT_7_RUNTIME_EXECUTION_CHECKLIST.md`). It does **not** authorise D16 (any persistent/production execution) or any billing activation.
