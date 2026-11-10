# EZRAB Unified AI Credits — Phase 2 Architecture Audit

- **Date of audit:** 2026-11-10 (Asia/Jakarta)
- **Repository:** `~/workspace/ezrab-unified`
- **Branch / HEAD at audit time:** `integrasi/unified-ui-engine` / `99de8927d3bdb0bc6e2befbcb22e290f64971896`
- **Baseline document:** Phase 1 merged report, `~/workspace/your_files/EZRAB-UNIFIED-CREDITS/EZRAB-LAPORAN-CREDITS-AI.md`, sections 2–3 (audit and architecture baseline). This document compares the *actual current repository state* against that baseline. Where this document and the Phase 1 report agree, the agreement is stated as re-verified with fresh evidence; where they differ, the difference is called out explicitly.
- **Nature of this document:** read-only audit. Documentation only. No code, configuration, migration, or environment was changed by this audit. No SQL was executed. No build (`tsc` / `vite build`) was run, by instruction.
- **Companion document:** `docs/audits/UNIFIED_CREDITS_SQL_READINESS.md` (static readiness review of the Phase 1 draft migration).

## 0. Executive summary

1. **The canonical state described by Phase 1 is unchanged.** Generation-2 (Gen-2) — the batch ledger in `api/_lib/creditLedger.js` plus its companion modules — remains the only complete, tested credit foundation, and it still has **no production caller for reserve/settle**. The only intact money path remains Midtrans webhook → grant, inside `api/credits/[action].js`.
2. **No new production callers appeared since Phase 1.** A full grep of `api/` and `src/` for call sites of the Gen-2 ledger and billing service confirms: outside `api/_lib/` domain definitions and `src/test/`, the only production call sites are the ones Phase 1 already recorded (checkout / webhook / order / subscription in `api/credits/[action].js`, and the Gen-1 balance handler in the same file). The three Phase 1 modules (`pricingPolicy.js`, `featureBillingMatrix.js`, `creditReconciliation.js`) are imported **only by their own test suites** — they remain dormant, exactly as designed.
3. **All 8 Phase 1 files are present and byte-identical to the Phase 1 snapshot** (MD5 match, 8/8 — see §2).
4. **The user-visible "billing" is still the frontend localStorage simulation** (`src/ai-credits/`, storage key `ezrab-credit-sim-v1`). Nothing in the frontend calls `/api/credits/balance`.
5. **DED credit behaviour is unchanged in kind and still not enforcement.** DED Estimate AI takes exactly one upfront simulation debit per run, keyed only by the user-selected complexity category (flat 500 / 650 / 800), *before* any provider execution, and the debit's return value is discarded — a failed debit (insufficient balance) does not stop the analysis. DED Full AI has no credit code of its own at all; it rides on the same single upfront debit taken in the input view. See §5.
6. **All four coexisting credit systems still coexist:** Gen-1, Gen-2, the frontend simulation, and the rogue legacy `server/` path. None has been retired or reconciled. See §6.
7. **The worktree is materially dirtier than at Phase 1 close** — not because of credit work, but because of parallel programs (including a DED hardening program editing DED files in this same worktree during this audit). Current counts: 0 staged, 20 unstaged modified tracked files, 28 untracked paths. Phase 1 closed with exactly 8 untracked files and no modified tracked files. This drift is documented in §1.3; no credit file is among the modified tracked files.
8. **The Phase 1 critical activation finding stands and is documentation-only:** `middleware.ts` gates `/api/credits/:path*` behind the access cookie with **no webhook exception** (`middleware.ts:35-44`; the only API exemptions are `/api/access/*` and `/api/ai/engine-status`). This audit did not modify `middleware.ts`.

---

## 1. Verified repository identity

### 1.1 Identity

| Fact | Value (verified by command output) |
|---|---|
| Repository root (`git rev-parse --show-toplevel`) | `/home/hatch/workspace/ezrab-unified` |
| Branch (`git branch --show-current`) | `integrasi/unified-ui-engine` |
| HEAD (`git rev-parse HEAD`) | `99de8927d3bdb0bc6e2befbcb22e290f64971896` |
| HEAD vs Phase 1 baseline | **Identical.** No commit has landed since Phase 1. |

### 1.2 Worktrees (`git worktree list`)

Eight worktrees exist for this repository family:

| Path | HEAD (short) | Branch |
|---|---|---|
| `~/workspace/ezrab-new` | `f335638` | `landing/cinematic-hero` |
| `~/workspace/ezrab-fix-p0` | `fad4fed` | `fix/data-integrity-p0` |
| `~/workspace/ezrab-integrasi` | `82cf7fc` | `fix/ai-gateway-403-origin` |
| `~/workspace/ezrab-mobile-frame` | `810a1b9` | `mobile/qwen-fallback` |
| `~/workspace/ezrab-preview` | `baead0e` | (detached HEAD) |
| `~/workspace/ezrab-qa-preview` | `57ed521` | `qa/onboarding-preview` |
| `~/workspace/ezrab-redesign-docai` | `8939967` | `redesign/ai-dokumen` |
| `~/workspace/ezrab-unified` | `99de892` | `integrasi/unified-ui-engine` |

Only `~/workspace/ezrab-unified` was audited. No other worktree was read or touched.

### 1.3 Working-tree status (at audit time)

`git status --porcelain` returned 43 entries:

- **Staged:** 0 files (`git diff --cached --name-only` is empty).
- **Unstaged, tracked, modified (` M`):** 20 files.
- **Untracked (`??`):** 23 porcelain entries, expanding to 28 paths under `git ls-files --others --exclude-standard`.

The 20 modified tracked files are:

- AI-audit artefacts: `scripts/ai-audit/DASHBOARD.md`, `scripts/ai-audit/history/index.jsonl`, `scripts/ai-audit/latest-report.md`.
- DED / document / shell files belonging to parallel programs: `src/ai-tools/ded-ai-estimate/{DedAiInputView.tsx, DedAiResultView.tsx, calculator.ts, dedAi.css, finalizeMapping.ts, service.ts, types.ts, view.tsx}`, `src/ai-tools/ded-full-ai/{jakartaPrices.ts, service.ts}`, `src/ai-tools/document-ai/components/{DocAnalyzer.tsx, DocLibrary.tsx}`, `src/ai-tools/document-ai/{document-ai.css, view.tsx}`, `src/components/dashboard/WorkspaceView.tsx`, `src/components/feature-shell/FeatureFullscreenShell.tsx`, `src/test/mobileNativeW2.test.ts`.

**No credit, billing, `api/`, or `supabase/` file is among the modified tracked files.** All Gen-1/Gen-2 domain code, all API handlers, and all migrations are byte-identical to HEAD.

Untracked paths include the 8 Phase 1 files (§2) plus, among others: `.github/workflows/ai-audit.yml`, `demo-gen/out/*`, `k7-harness.html`, `k7shots.mjs`, two `scripts/ai-audit/history/*.json` files, three new DED price-completion modules (`src/ai-tools/ded-ai-estimate/{externalPriceReferences.ts, priceCompletion.ts, priceResearchCache.ts}` — price research, not credit code; verified by name and by the credit greps in §4–§5 returning no hits in them), `src/components/feature-shell/FeaturePageShell.tsx` + CSS, `src/test/{dedDocPageShell.test.ts, dedPriceCompletion.src.ts}`, `src/test/fixtures/dedOwnerTable38.ts` (the DED fixture already noted in the Phase 1 merged report §5.6), and a literal `~/` directory entry containing scratch bundles from other programs.

**Delta vs Phase 1:** Phase 1 §5.6 recorded "exactly 8 untracked new files; no old file changed, deleted, or staged". That is no longer the state of the tree. The change is attributable to parallel programs sharing this worktree, not to credit work: every credit-relevant file still matches either HEAD or the Phase 1 snapshot (§2). Any future Phase 1-style integrity claim must be re-based on the counts above, not on the Phase 1 close-out counts.

---

## 2. Phase 1 deliverables — presence and content verification

All 8 files created by Phase 1 still exist, are still untracked, and are **byte-identical** to the copies preserved in the Phase 1 snapshot folder (`~/workspace/your_files/EZRAB-UNIFIED-CREDITS/snapshots/group-unified-credits-2026-11-10/md5-new-files.txt`). MD5 comparison, worktree vs snapshot record: **8/8 match.**

| # | File | Lines | MD5 (worktree = snapshot) | Content check |
|---|---|---|---|---|
| 1 | `api/_lib/pricingPolicy.js` | 319 | `311c485b04a086ef578eda8a799a6619` | Header declares DORMANT (not imported by any handler/UI). Exports match Phase 1 §4.1: `PRICING_POLICY_VERSION_V11`, `PRICING_POLICY_VERSION_MARGIN`, `MARGIN_PARAM_NAMES`, `PRICING_POLICIES` (L32–59), `getPricingPolicy` (L99), `weightedTokensForUsage` (L146), `creditsForTokenUsage` (L185), `deriveTokenRate` (L222), `evaluateMarginPrice` (L277). Two policies only: `v1.1-token-metering` (LOCKED) and `margin-formula-proposal` (PENDING, all commercial parameters `null`). |
| 2 | `api/_lib/featureBillingMatrix.js` | 139 | `e0413f9ee8b53efc954e4df55fb63b38` | Header declares DORMANT with honest `integrationStatus` vocabulary (`WIRED_SIMULATION`, `WIRED_SIMULATION_PARTIAL`, `NOT_WIRED`). Exports: `FEATURE_BILLING_MATRIX` (L42), `classifyFeature` (L90), `chargeDecision` (L108), `listFeaturesByClass` (L124), `listBypassedAiFeatures` (L134). Matrix content re-verified entry by entry: 19 `AI_METERED` keys + 11 `DETERMINISTIC_FREE` keys, matching Phase 1 §4.1. |
| 3 | `api/_lib/creditReconciliation.js` | 256 | `72411a055b6d3a45e8fc338b578b6295` | Header declares DORMANT, report-only (no mutation). Exports: `DEFAULT_STUCK_TTL_MS` (L39), `reconcileAccountData` (L71), `reconcileAccount` (L242). The reserved-derivation convention in the header (RESERVE / RESERVE_RELEASE / CONSUME-by-reason / EXPIRATION-by-reason) matches the implementation aggregate at L71–160. |
| 4 | `supabase/migrations/20261110_unified_credits_foundation.sql` | 827 | `62d9e8608431d2f7aaf7d6da281ebd79` | Header (L1–50) still declares DRAFT / not executed / additive-only / prerequisites UNKNOWN. Full static review in the companion SQL readiness document. |
| 5 | `src/test/pricingPolicy.test.ts` | 117 | `15bbffcb1124b74095b0085f699d26ef` | Imports exactly the six symbols Phase 1 claimed from `api/_lib/pricingPolicy.js` plus `creditsFromTokens` from `api/_lib/tariffRegistry.js`. |
| 6 | `src/test/featureBillingMatrix.test.ts` | 73 | `af1fe19d23f32cf83803e32e9458b659` | Imports the five matrix functions; deterministic key list matches the matrix's 11 free keys. |
| 7 | `src/test/creditReconciliation.test.ts` | 126 | `2142b7dd0c3bd04a737f630c164f7719` | Drives the real `createCreditLedger` + `createMemoryLedgerStore` from `api/_lib/creditLedger.js`, as Phase 1 claimed (not fabricated data). |
| 8 | `src/test/unifiedCreditLifecycle.test.ts` | 115 | `929bee6766f6acacc2ffee3345591e22` | Cross-module lifecycle (matrix → metering → real in-memory ledger), as Phase 1 claimed. |

**Conclusion:** the Phase 1 implementation claims in §4.1 of the merged report are accurate as of this audit. Nothing was edited, moved, or partially overwritten by the parallel programs.

A naming-collision note for future greps: the string `pricingPolicy` also appears throughout the DED code (`src/ai-tools/ded-ai-estimate/prompts/{fast,detail}.ts`, `src/ai-tools/ded-full-ai/prompts.ts`, DED services and tests), where it denotes a **DED prompt pricing mode** (`'FULL_AI' | 'DATABASE'` — how DED prices its estimate), *not* the credit module `api/_lib/pricingPolicy.js`. The two concepts share a word and nothing else; no DED file imports the credit module.

---

## 3. Migration draft — execution status evidence

File: `supabase/migrations/20261110_unified_credits_foundation.sql` (827 lines; MD5 above).

Evidence available locally that the draft is **still unexecuted**:

1. The file itself is **untracked** (`??` in `git status`) — it has never been committed, let alone deployed as part of a release.
2. Its own header (L4–L10) declares `STATUS: DRAFT — TIDAK/BELUM DIEKSEKUSI` and forbids application without explicit owner approval plus prior verification of prerequisite migrations in the target database.
3. The Phase 1 merged report (§1 point 5, §5.4) records that the file was written as an archive/specification and was not executed by the Phase 1 program, and this Phase 2 audit executed no SQL of any kind.
4. A search of the Phase 1 programme folder (`~/workspace/your_files/EZRAB-UNIFIED-CREDITS/`) finds no execution record, apply log, or database receipt for this file — every mention describes it as a draft.
5. This machine has **no local PostgreSQL** (`which psql pg_ctl postgres` returns nothing, exit 1 — verified again for the companion document), so no local database exists here that the migration could have been applied to from this environment.

**Honest limit:** local evidence cannot *prove* a negative about a remote database. Whether any migration (this one or its prerequisites) has ever been applied to the live Supabase project is, as Phase 1 already stated, **UNKNOWN** from the repository alone; the prerequisite status is recorded as UNKNOWN in the draft's own header (L24–L25). Confirming live migration state requires an owner-side check in the Supabase dashboard/SQL editor, which is outside this audit's fence. What can be stated firmly: there is no evidence in the repo, in the programme records, or on this machine that the 20261110 draft was ever executed, and substantial documentary evidence that it was not.

---

## 4. Production callers of billing / ledger services — delta since Phase 1

Method: grep over `api/` and `src/` for call sites of the Gen-2 ledger surface (`createCreditLedger`, `.reserve(`, `.settle(`, `.release(`, `.grantSubscription`, `.grantTopUp`, `.grantBonus`, `.grantFreeOnce`, `createOperation`, `resolveReview`), of `billingService` / `handleNotification`, and of the three Phase 1 modules; results classified as *domain definition*, *production caller*, or *test*.

### 4.1 Findings

**Answer to the audit question: NO — no new production callers of reserve / settle / grant / billing services have appeared since Phase 1.**

The complete production caller inventory is unchanged:

| Caller | Calls | Classification |
|---|---|---|
| `api/credits/[action].js:30,145` | `createBillingService(...)` → `service.handleNotification(body)` in the `webhook` action; also `service.checkout`, `service.getOrder`, `service.getSubscriptionState` in their actions | Production — the only intact money path (Midtrans webhook → grant inside `billingService.js:233`). Pre-existing in Phase 1; unchanged (file matches HEAD). |
| `api/credits/[action].js:26` | `createCreditEngine` + `createMemoryAdapter` from Gen-1 `creditEngine.js`, used only by the `balance` action | Production — Gen-1, behind `CREDITS_DB_CONFIGURED`; adapter is a memory placeholder (`getAdapter()`, `[action].js:36-43`). Pre-existing; unchanged. |
| `api/credits/estimate.js` | `estimateCredits` from Gen-1-era `creditPricing.js` (draft tariffs, no auth) | Production HTTP surface; computes an estimate only, touches no ledger. Pre-existing; unchanged. |
| `api/credits/usage.js` | `createUsageMeter(null)` | Production HTTP surface that is structurally always empty (null adapter). Pre-existing; unchanged. |
| `api/_lib/aiGateway.js:764-765` | `createUsageMeter(null)` in step 6b (best-effort usage record after provider execution) | Production path, but the null adapter makes it a no-op store. Not a ledger caller. Pre-existing; unchanged. |

Everything else that touches `reserve` / `settle` / `grant*` / `resolveReview` is either the domain definition itself (`api/_lib/creditLedger.js`, `api/_lib/billingService.js`) or a test file (`src/test/creditLedger.test.ts`, `src/test/phase53BillingSecurity.test.ts`, `src/test/billingWebhook.test.ts`, `src/test/billingCheckout.test.ts`, `src/test/creditReconciliation.test.ts`, `src/test/unifiedCreditLifecycle.test.ts`, `src/test/usageMeter.test.ts` — the last of these exercises the *Gen-1* engine).

### 4.2 Phase 1 modules — importer check

Grep for `pricingPolicy` / `featureBillingMatrix` / `creditReconciliation` as module references across `api/` and `src/` returns:

- The three modules' own header comments.
- Imports in exactly four files, all tests: `src/test/pricingPolicy.test.ts`, `src/test/featureBillingMatrix.test.ts`, `src/test/creditReconciliation.test.ts`, `src/test/unifiedCreditLifecycle.test.ts`.
- No handler, no UI component, no service imports any of them.

(DED `pricingPolicy` prompt-mode hits are the unrelated naming collision documented in §2.) The Phase 1 dormancy claim — "no new module is imported by any handler/UI" — remains true.

### 4.3 Specifically confirmed absences

- `grantFreeOnce` (Gen-2 domain, `creditLedger.js` — FREE_ONCE 100, once per account) still has **no production caller**; nothing calls it at workspace/account creation.
- `subscriptionMachine.applyCancellation` still has no production caller.
- No file calls the five SQL RPCs drafted in the 20261110 migration (`issue_batch`, `reserve_credits`, `settle_reservation`, `resolve_review`, `apply_expirations`) — expected, since the migration is unexecuted, but recorded here for completeness: there is not even dormant client code waiting on them; the JS domain over the PostgREST adapter (`billingStore.withLedger`) remains the only implemented execution strategy.
- Frontend: no component calls `/api/credits/balance`, `/api/credits/checkout`, or any `/api/credits/*` URL. All balance display flows through `mockGetBalance` / `useCreditSimulation` (see §6.3).

---

## 5. DED credit paths — read-only inspection

Scope note: DED files were **inspected read-only** for this section. A parallel DED hardening program is editing DED files in this worktree; several DED files were in modified state during the audit (§1.3). The line references below are to the worktree state at audit time. No DED file was edited by this audit, and no conclusion below depends on the parallel program's in-progress changes — the credit-relevant lines were stable across the audit.

There are exactly **two** DED execution engines and **one** credit touchpoint between them:

### 5.1 The single touchpoint: upfront simulation debit in the input view

`src/ai-tools/ded-ai-estimate/DedAiInputView.tsx`:

- L23–27: imports `useCreditSimulation` (`src/ai-credits/useCreditSimulation.ts`), `tariffFor` (`src/ai-credits/config.ts`), and the plan gate `planAllowsAiFeature` (`src/ai-credits/featureGate.ts`).
- L110–117: the user picks a complexity category (`simple` / `medium` / `complex`); the debit amount is `tariffFor('ded-ai/' + complexity)` → `target ?? max`. The tariff table (`src/ai-credits/config.ts`, mirrored in `api/_lib/creditPricing.js`) is flat: **simple 500, medium 650, complex 800** — draft values, flagged `isCalibratedDraft: true`.
- L115: plan gate — `planAllowsAiFeature(balance.plan, 'ded-ai')` blocks the Free plan (Free = Chat AI only, Amendment v1.2). This gate is real, but it gates the *simulation* plan stored in the browser, not a server account.
- L141–145 (`handleStart`): after local guards (`canStart`, `creditApproved`, `dedAllowed`), it calls the simulation hook's `consume('ded-ai', dedTarget, …, { jobReference: 'ded-' + … })` **once, before any analysis runs**, and then unconditionally builds the session and calls `onStart(...)`.

Properties of this path, each verified in the code:

1. **Debit timing: upfront, pre-execution.** The debit happens in the input view, before a single provider call. It is not a reservation (nothing is held or released) and not a settlement (no actual usage is ever compared). If the subsequent analysis fails, errors, or is abandoned, there is no refund/release path — the simulation debit stands.
2. **Debit result is discarded.** The return value of `consume(...)` is not assigned, not checked, and does not branch anything (L143–145). `mockConsume` (`src/ai-credits/mockAdapter.ts:105`) returns `false` on insufficient balance, on a plan-forbidden feature, on a non-integer amount, or on a duplicate `jobReference`. None of those outcomes stops `handleStart`. **Low-balance behaviour: the analysis proceeds anyway.** The only low-balance protection is presentational (the credit-approval checkbox and the balance display); enforcement does not exist on this path. This matches the Phase 1 classification `WIRED_SIMULATION_PARTIAL` for `ded-ai/{simple,medium,complex}` in `featureBillingMatrix.js`.
3. **Multi-file = single debit.** The amount depends only on the complexity category. `validFiles.length` appears only inside the debit's description string (`"…: N dokumen"`). One file or the maximum file count costs the same 500/650/800. The underlying pipeline cost, by contrast, scales with files/pages: `src/ai-tools/ded-ai-estimate/service.ts` issues multiple provider calls per run (product routing at L955, provider executions around L967 and L1001, plus reading/synthesis stages) — all of it is covered by, at most, the single upfront simulation debit.
4. **Pricing policy does not affect the tariff.** The DED `policy` option (`FULL_AI` vs `DATABASE`, selected in the input view and enforced inside the services) changes how the *estimate* is priced, not what the run *costs* in credits. A Full AI run and a database-priced run in the same complexity category debit identically.
5. **Mode does not affect the tariff.** FAST vs DETAIL/DEEP changes the provider chain (`DED_AI_FAST` → `fast` chain, `DED_AI_DETAIL` → `advanced` chain, per `service.ts:955` and `api/ai/tools/execute.js`), not the debit.

### 5.2 DED standard pipeline (`src/ai-tools/ded-ai-estimate/service.ts`)

No credit code exists in the service: no `consume`, no metering, no balance check (grep for credit terms returns only the unrelated prompt `pricingPolicy` mode and `.flatMap` false positives). The pipeline executes via `aiToolsProviderClient` → `POST /api/ai/tools/execute` → `aiGateway.js`, whose only post-execution accounting is the null-adapter usage meter (§7). If the input view's debit is bypassed (e.g. a session restored from a draft, `view.tsx` draft loading), the pipeline runs with **no debit at all**: `src/ai-tools/ded-ai-estimate/view.tsx` imports `useCreditSimulation` only to *display* the balance (L64, L748 — `creditText`) and passes `session.creditEstimate` through as data (L712); it never consumes.

### 5.3 DED Full AI (`src/ai-tools/ded-full-ai/service.ts`)

No credit code exists in this service either (same grep result: only the prompt `pricingPolicy` mode at L246 and the provider call at L250–251). Full AI is entered from the same input view / session flow, so its entire credit treatment is the single upfront flat debit of §5.1 — taken under a *standard-DED* category tariff that does not describe Full AI's actual multi-call cost. `featureBillingMatrix.js` records this honestly: `ded-ai/full-ai` is `AI_METERED / TOKEN / NOT_WIRED`. The parallel program's edits to `ded-full-ai/service.ts` and `jakartaPrices.ts` concern price completion, not credits; no credit path was added by them as of this audit.

### 5.4 DED verdict

Phase 1 §2.5's DED row is confirmed in full: **flat per user-chosen category; once, upfront; result ignored; failure to debit does not block analysis; multi-file still one debit; Full AI vs Database policy does not influence the tariff.** The DED work since Phase 1 (including the parallel hardening program) introduced **no additional credit paths** — no new debit, meter, gate, or ledger call exists in any DED file.

---

## 6. Coexistence verification — four credit systems, all still present

Phase 1's central structural finding was "three generations + one rogue system". Each was re-verified with file evidence:

### 6.1 Gen-1 — bucket engine (Phase 2/3)

- **Code:** `api/_lib/creditEngine.js` (287 lines; header: "Credit Ledger Engine (Phase 2)") — aggregate buckets per **user** (`subscription / topup / bonus / reserved`), with `createCreditEngine` and `createMemoryAdapter` exports.
- **Schema:** `supabase/migrations/20261018_ai_credits_ledger.sql` — `credit_tariffs` (L19), `credit_balances` (L48), `credit_ledger` (L60, `UNIQUE(user_id, idempotency_key)`), `credit_reservations` (L87), `ai_usage_log` (L112).
- **Live surface:** the `balance` action of `api/credits/[action].js:26` — and even there, `getAdapter()` returns a **memory placeholder** when `CREDITS_DB_CONFIGURED === 'true'` and `null` (→ honest 503) otherwise (`[action].js:36-43`). Gen-1 has never read a real database through this handler.
- **Status:** present, dormant, unreconciled with Gen-2. Confirmed still coexisting.

### 6.2 Gen-2 — batch ledger (Phase 5 / 5.3) — the canonical foundation

Detailed assessment in §8. Presence verified: `api/_lib/creditLedger.js` (926 lines), `creditAllocation.js` (113), `tariffRegistry.js` (191), `billingStore.js` (820), `billingService.js` (454), plus `billingAuthorization.js` (192), `billingCatalog.js` (87), `subscriptionMachine.js` (159). Schema files `20261102_billing_batch_ledger.sql`, `20261102_phase53_workspace_billing.sql`, `20261109_billing_orders_subscriptions.sql` all present and unmodified.

### 6.3 Frontend simulation (Phase 1)

- **Code:** `src/ai-credits/` — `mockAdapter.ts`, `tokenMetering.ts`, `featureGate.ts`, `config.ts`, `useCreditSimulation.ts`, `CreditPage.tsx`, components.
- **Mechanics verified in `mockAdapter.ts`:** state in a module singleton persisted to `localStorage` under key `ezrab-credit-sim-v1`; default plan `starter`; `mockConsume` (L105) enforces, *inside the simulation only*: plan-feature gate via `planAllowsAiFeature`, integer-only amounts, `jobReference` idempotency, sufficient-balance check; consumption order inside the simulation is **bonus → topup → subscription** (comment at the debit loop) — which still differs from the canonical server order (Phase 5.1: subscription → bonus/FREE_ONCE → top-up). That ordering divergence is Phase 1 conflict K1 / open owner decision D7; it is unchanged.
- **Production debit points via the simulation hook** (note the indirection: production components call the hook's `consume(...)`, which forwards to `mockConsume`; a grep for the literal string `mockConsume` outside tests therefore returns only the hook and the adapter — the three real call sites are):
  1. Chat AI — `src/ai-tools/ezrab-ai/view.tsx:1067-1075`, through the `debitChatCreditOnSuccess` gate (`src/ai-tools/ezrab-ai/chatCreditDebit.ts`): debit only when `result.success === true`, amount from client-side token estimation (`tokenMetering.ts`: ±4 chars/token, output ×3 interim, 200 weighted tokens/credit). This is the one simulation path whose debit semantics are correct.
  2. DED — `DedAiInputView.tsx:143` (§5: upfront, result ignored).
  3. AI Document analysis — `src/ai-tools/document-ai/components/DocAnalyzer.tsx:179`: `consume('ai-document', docEstimate.max, …)` **after** `res.success`, result ignored (a failed debit changes nothing the user sees). The QA path in the same file (`askQuestion`, document chat) contains **no** consume call — QA is undebited, as Phase 1 recorded.
- **Status:** present, and still the *only* billing a user actually experiences. Fully manipulable from the browser (state is localStorage). Confirmed still coexisting.

### 6.4 Rogue legacy system — `server/`

- **Orchestrator:** `server/orchestrator/aiOrchestrator.ts` — step 6 checks `subscriptionDataService.checkCredit(workspaceId, 1)` and, on success, calls `subscriptionDataService.deductCredit(workspaceId, 1)` (comment in code: "Deduct 1 token credit for operation") — a **flat 1 credit per operation**, deducted *before* the operation executes.
- **Data service:** `server/services/extendedDataServices.ts:392` — `SubscriptionDataService` over a hardcoded in-memory `Map` of example subscriptions (e.g. `ws-default-ezrab`: PRO, `creditBalance: 8500`, `creditLimit: 10000`; `ws-trial-user`: depleted trial), with a fabricated default subscription (50/100) for unknown workspaces (L431-433). `checkCredit` / `deductCredit` mutate only that map (L439-447).
- **Isolation:** this path shares no store, ledger, tariff, or account concept with `api/` or with the frontend simulation. It is reachable only through the legacy `server/` stack, not through the deployed `api/` handlers.
- **Status:** present, untouched, still not formally declared dead in code. Confirmed still coexisting. (Phase 1's recommendation stands: it should be explicitly declared dead at activation time so it is never mistaken for a backend.)

### 6.5 Reconciliation between the systems

Before Phase 1, no reconciliation function existed anywhere (Phase 1 grep: `reconcil` empty in `api/` and `src/`). Phase 1 added exactly one: the dormant, report-only `api/_lib/creditReconciliation.js` (§2), imported only by tests. There is still **no** reconciliation *process* — nothing runs it, nothing schedules it, and the Gen-1 → Gen-2 balance migration Phase 1 identified as pre-activation work has still not been written (it requires a live balance snapshot, which does not exist in the repo).

---

## 7. Architecture map — every AI feature, chain by chain

The reference chain for a correctly metered feature is:

**UI → Feature → Shared AI Transport → Usage Meter → Reservation → Provider Execution → Evidence → Settlement/Release → Ledger**

For every feature below, the *actual* path in today's code is recorded, and each break in the chain is marked **BREAK**. Two facts apply to almost every row and are stated once here:

- **Shared transport:** the browser-side shared transport is `src/ai-tools/providerClient.ts` (`AiToolsProviderClient.execute`, browser path at L251: `POST /api/ai/tools/execute`, with `Idempotency-Key` forwarding). Server-side, `api/ai/tools/execute.js` maps `productId` + `mode` to a gateway chain (`EZRAB_AI` → `chat`/`advanced`; `DED_AI_DETAIL` → `advanced`; everything else → `fast`) and delegates to `api/_lib/aiGateway.js` (`handleAiRequest`). A second transport family exists — `POST /api/ai/multi-provider/execute`, used by `src/services/aiProviderRouter.ts`, `src/ded-rab-v2/ai/zyrouterClient.ts`, and `src/ded-rab-v3/ai/aiProviderClient.ts` — which no credit code touches at all.
- **The server-side Usage Meter is a structural no-op:** `aiGateway.js:764-765` constructs `createUsageMeter(null)` ("adapter null → no-op storage") in step 6b after execution; `api/credits/usage.js` does the same, so usage history is always `[]` when configured at all. **No feature has a working server-side Usage Meter, Reservation, Evidence capture, Settlement, or Ledger write for AI usage.** Those chain stages exist only as Gen-2 domain code (§8) with no production caller (§4). Consequently every row below breaks at the same place; the rows differ in what happens *client-side* before/after the transport.

| # | Feature (UI entry) | Transport / productId | Client metering & debit today | Chain breaks |
|---|---|---|---|---|
| 1 | **Chat AI — FAST** (`src/ai-tools/ezrab-ai/view.tsx`, `ezrab-ai/service.ts:82`) | `providerClient` → `EZRAB_AI`, mode default → gateway `chat` chain | Token-estimated debit in simulation **after** execution, only on strict success, via `chatCreditDebit.ts` gate + `tokenMetering.ts` (v1.1 formula, interim ×3 output weight, client-estimated tokens) | **BREAK** at Usage Meter (server meter is null-adapter; client estimate is not provider usage), Reservation (none — debit is post-hoc), Evidence (none persisted), Settlement/Release (none), Ledger (simulation localStorage only, never the Gen-2 ledger) |
| 2 | **Chat AI — ADVANCED** (same view, mode toggle) | `providerClient` → `EZRAB_AI`, mode `advanced` → gateway `advanced` chain | Same as FAST; FAST and ADVANCED are **not** distinguished by the simulation debit formula (same token formula; only the gateway chain differs) | Same five breaks as #1 |
| 3 | **Magic AI / Co-Assistant — chatbox** (`src/services/coAssistantService.ts:373`) | `providerClient` → `EZRAB_AI` (same product and `chat` chain as Chat AI) | None. No gate, no balance check, no debit anywhere in the service or its UI | **BREAK at the first metering stage**: full bypass — the feature never enters any credit chain. Free-plan users pass identically |
| 4 | **Magic AI / Co-Assistant — FullView** (`src/components/copilot/EzrabAiAssistantFullView.tsx`) | Same service/transport as #3 | None | Full bypass, as #3 |
| 5 | **Magic AI RAB** (DED pipeline invoked as RAB generation) | DED services → `DED_AI_FAST` / `DED_AI_DETAIL` | Only the §5.1 upfront DED debit *if* entered through `DedAiInputView`; the multi-call pipeline itself meters nothing | **BREAK**: Reservation, Evidence, Settlement, Ledger absent; metering (when present at all) is decoupled from the actual pipeline cost |
| 6 | **DED Estimate AI — standard** (`ded-ai-estimate/service.ts`) | `providerClient` → `DED_AI_FAST` (FAST) / `DED_AI_DETAIL` (DETAIL) | One upfront flat simulation debit in the input view (500/650/800 by user-chosen category), result ignored (§5) | **BREAK** at Reservation (debit precedes execution and is not held/released), Usage Meter, Evidence, Settlement, Ledger; low-balance does not block (§5.1) |
| 7 | **DED Full AI** (`ded-full-ai/service.ts:250`) | `providerClient` → `DED_AI_FAST` / `DED_AI_DETAIL` | None in the service; inherits at most the §5.1 standard-DED debit | **BREAK** as #6, plus tariff mismatch: Full AI's cost driver (multi-call synthesis) has no corresponding charge (`ded-ai/full-ai`: `NOT_WIRED`) |
| 8 | **AI Document — Analysis** (`document-ai/components/DocAnalyzer.tsx:179`; `document-ai/service.ts`) | `providerClient` → `DOKUMEN_AI` → `fast` chain | One flat simulation debit at draft-tariff **max** (`ai-document/simple` 50–100 / `complex` 100–250), after success, result ignored | **BREAK** at Reservation, server Usage Meter, Evidence, Settlement, Ledger |
| 9 | **AI Document — Q&A (Tanya)** (`DocAnalyzer.tsx` `askQuestion` → `dokumenAiService.chat`) | `providerClient` → `DOKUMEN_AI` | None — no consume call on this path | Full bypass |
| 10 | **AI Document — Create / Report / Revise / Enhance / Translate** (`document-ai/orchestrator.ts`: `createDocument` L191, `createReport` L243, `revise` L341, `enhanceText` L392, `translateDocument` L444; `document-ai/service.ts` `enhance` L403, `translate` L473) | `providerClient` → `DOKUMEN_AI` | None. Only a plan-level UI gate (`featureGate`) stands in front; no metering or debit | Full bypass (all five modes). `ded-ai/revision` in the draft tariff table remains an orphan definition with no billing path referencing it |
| 11 | **AHSP Assistant** | No LLM product of its own: Chat AI tool calls resolve deterministically/locally; candidate picking is local search | None (correctly — deterministic) | No break: classified `DETERMINISTIC_FREE` (`ahsp-lookup`, `ahsp-candidate-search` in the matrix). Listed to prevent the false inference that a billing UI implies metering |
| 12 | **QTO-AI** | No separate product: quantity engine inside the DED pipeline + deterministic calculators | None | No independent break: deterministic parts are `DETERMINISTIC_FREE`; the LLM parts inherit the DED rows #6–#7 |
| 13 | **Receipt scan** (`src/services/aiReceiptIntelligence.ts:256`) | Direct `fetch('/api/ai/receipt/scan')` — a path with **no deployed handler** (recorded as client-side honest failure in `apiEndpointInventory` tests) | None | Full bypass *and* a dead transport: the feature cannot reach a provider through the gateway chains at all today |
| 14 | **AI market price search** (`src/engine/pricing/aiEstimate/aiPriceEstimate.ts:204`) | Direct `AiToolsProviderClient` instantiation → `/api/ai/tools/execute` | None | Full bypass (metering, reservation, settlement all absent) |
| 15 | **Smart Add Work Item / RAB assistance** (`src/components/estimator/SmartAddWorkItemModal.tsx:597`) | Direct `AiToolsProviderClient` instantiation → `/api/ai/tools/execute` | None | Full bypass |
| 16 | **DED-RAB v2 / v3 pipelines** (`src/ded-rab-v2/ai/zyrouterClient.ts:376`, `src/ded-rab-v3/ai/aiProviderClient.ts:328`, `src/services/aiProviderRouter.ts:695`) | Second transport family → `/api/ai/multi-provider/execute` | None — no credit code exists anywhere under `src/ded-rab-v2/` or `src/ded-rab-v3/` | Full bypass on a separate transport: even a future transport-level fix applied only to `providerClient` / `tools/execute` would miss this family |
| 17 | **Deterministic surfaces** — volume calculators, RAB arithmetic, AHSP lookup, local price resolution, recalculation, PDF/Excel export, project open/edit | Local computation, no transport | None (correctly) | No break: the 11 `DETERMINISTIC_FREE` entries of `featureBillingMatrix.js`. The matrix's `chargeDecision` returns `{chargeable: false, credits: 0}` for each, and fails closed (`UNKNOWN_FEATURE`, not chargeable) for unlisted keys |

**Map conclusion:** the chain is intact for **zero** AI features end-to-end. Exactly one feature family (Chat AI) implements the *shape* of the chain — estimate → execute → settle-on-success — but implements it entirely inside the browser simulation with estimated tokens. Every other AI feature either debits flat-and-unenforced (DED, Document Analysis) or bypasses metering completely (Co-Assistant, Full AI, Document QA/Create/Revise/Enhance/Translate, receipt scan, price search, Smart Add, ded-rab-v2/v3). The correct fix location remains the one Phase 1 identified: the shared transport / gateway layer, covering **both** transport families — not per-surface patches. That fix is an activation step and was not performed.

---

## 8. Canonical ledger assessment (Gen-2)

### 8.1 Domain modules

| Module | Lines | Role | Assessment |
|---|---|---|---|
| `api/_lib/creditLedger.js` | 926 | Batch grants (`grantSubscription`, `grantTopUp`, `grantBonus`, `grantFreeOnce`), append-only ledger entries (frozen; corrections only via `REVERSAL`), `createOperation` / `reserve` / `settle` / `release` / `resolveReview`, `getBalance` (L312) as a projection derived from batches, `recordFreeOncePolicyCorrection` (L823) | Complete and the broadest-tested domain in the repo (§11). Header (L1–60) locks the owner decisions: FREE_ONCE = 100, never expires; subscription rollover = period_end + 30 days; settlement = verified actual usage only; overage = manual review, never auto-debit; refund/forfeiture/transfer deliberately absent (`PENDING_LEGAL_REVIEW`). Its in-memory default store is explicitly test-only. |
| `api/_lib/creditAllocation.js` | 113 | Allocation order, `ALLOCATION_POLICY_STATUS = 'CONFIRMED_OWNER_PHASE_5_1'` (L34); `isBatchEligible`, `resolveAllocationOrder` | Locked Phase 5.1 order: **SUBSCRIPTION earliest-expiry → BONUS/FREE_ONCE finite-expiry-first → TOP_UP FIFO**, tie-break granted_at → id. This is the canonical order; the frontend simulation's different order (§6.3) is the divergence, not this module. |
| `api/_lib/tariffRegistry.js` | 191 | Versioned provider tariffs; `creditsFromTokens` bridge | Prices remain `NULL` / `UNKNOWN` in seed data — by design (no invented tariffs). Settlement's tariff check is therefore formal (version string known), not substantive (price verified) — unchanged from Phase 1 §2.7. |
| `api/_lib/billingStore.js` | 820 | PostgREST/Supabase repository + in-memory repository; `withLedger` (L400): load snapshot → run ledger in memory → flush; row↔domain mappers for batches, entries, operations, reviews | The only implemented persistence strategy. It is read-modify-write per account, with atomicity delegated to UNIQUE constraints + compare-and-set; this is precisely the gap the drafted SQL RPCs (companion document) are meant to close. `getBillingRepository` (L817) returns `null` when the Supabase service config is absent — one of the dormancy breakpoints (§10). |
| `api/_lib/billingService.js` | 454 | `createBillingService` (L105): checkout (server catalog amounts only), `handleNotification` (L233 — Midtrans signature verification, exact amount match, triple idempotency: `granted_at`, `last_order_id`, ledger key = `order_id`), subscription state machine glue, order/subscription reads | The only production-exercised Gen-2 code path, via `api/credits/[action].js`. Refund notifications are journaled as `RECORDED_NO_BALANCE_ACTION` — no balance mutation — consistent with the pending legal decisions. |
| `api/_lib/billingAuthorization.js` | 192 | Server-side permissions `billing:read`, `billing:use`, `billing:review:resolve` (L45); review resolution requires an explicit `billing_admin = true` plus ACTIVE membership; cross-workspace access resolves to 404 | Sound and tested (`phase53BillingSecurity`). Critically, the AI execution path never passes through this layer today — authorization exists for billing surfaces, not for AI spend. |
| `api/_lib/billingCatalog.js` | 87 | Server catalog (single source of amounts): Starter 54,999 / 5,000; Professional 79,999 / 10,000; Business 159,999 / 30,000; one top-up offer (`topup-3600`, Rp5,000 → 3,000 + 600 bonus, flagged `PHASE1_OFFER_PENDING_D8`) | Unchanged. Top-up final pricing remains owner decision D8. |
| `api/_lib/subscriptionMachine.js` | 159 | Subscription lifecycle incl. 3-day GRACE, no auto-debit | Unchanged; `applyCancellation` callerless (§4.3). |
| `api/_lib/pricingPolicy.js` ★ | 319 | Phase 1 addition: versioned pricing policy (v1.1 LOCKED; margin formula PENDING with `null` parameters, refuses to compute) | Dormant (§2, §4.2). |
| `api/_lib/featureBillingMatrix.js` ★ | 139 | Phase 1 addition: authoritative feature classification | Dormant (§2, §4.2). Its `NOT_WIRED` list and §7's map agree. |
| `api/_lib/creditReconciliation.js` ★ | 256 | Phase 1 addition: pure reconciliation over batches/entries/operations/orders | Dormant (§2, §6.5). |

### 8.2 Tables (schema files; live application status UNKNOWN — §3)

| Table | Defined in | Key properties |
|---|---|---|
| `credit_batches` | `20261102_billing_batch_ledger.sql:38` | Types `SUBSCRIPTION / TOP_UP / BONUS / FREE_ONCE`; `wallet` display grouping; CHECK-enforced invariant `granted = remaining + reserved + consumed + expired`; Phase 5.3 adds `account_id` FK → `billing_accounts`, `workspace_id`, and the partial UNIQUE index *one FREE_ONCE per account, forever* |
| `credit_batch_ledger` | `20261102…:73` | Append-only journal; kinds `GRANT / RESERVE / RESERVE_RELEASE / CONSUME / EXPIRATION / REVERSAL` (+ `REVIEW_DECISION` added by Phase 5.3); `UNIQUE(account_id, idempotency_key)` |
| `credit_usage_operations` | `20261102…:101` | Lifecycle `CREATED / RESERVED / SETTLED / RELEASED / FAILED / REQUIRES_REVIEW / REVERSED`; estimated / reserved / actual / settled / released / overage kept separate; `usage_evidence` JSONB; `UNIQUE(account_id, idempotency_key)` |
| `credit_reservation_allocations` | `20261102…:131` | Per-batch allocation record enabling exact restoration to the origin batch; `UNIQUE(operation_id, batch_id)` |
| `provider_tariff_versions` | `20261102…:150` | Versioned provider prices; `NULL` price + `UNKNOWN` status = honestly unknown; `UNIQUE(provider_id, model_id, version)` |
| `billing_accounts` | `20261102_phase53_workspace_billing.sql:59` | 1 workspace ↔ 1 billing account (`workspace_id UNIQUE`) |
| `credit_settlement_reviews` | `20261102_phase53…` (§4) | Manual overage review queue; `operation_id UNIQUE`; `PENDING → APPROVED / REJECTED` |
| `billing_orders` | `20261109_billing_orders_subscriptions.sql:39` | `order_id UNIQUE` = payment idempotency key |
| `billing_subscriptions` | `20261109…:81` | `account_id UNIQUE` |
| `billing_payment_events` | `20261109…:113` | Append-only webhook journal; deliberately no FK to orders |
| `credit_pricing_policy_versions` | Draft only: `20261110…:54` | Does not exist in any earlier migration; exists solely in the unexecuted draft (companion document) |

Gen-1 tables (`credit_balances`, `credit_ledger`, `credit_reservations`, `ai_usage_log`, `credit_tariffs` in `20261018_ai_credits_ledger.sql`) remain defined alongside all of the above; nothing supersedes them in DDL, only in design intent.

**Assessment:** the canonical ledger design is complete, internally consistent, and unchanged since Phase 1. What is missing is not design but *connection* (§9) and *execution substrate* (the RPC migration, companion document).

---

## 9. Missing connections (delta-checked against Phase 1 §3.8)

Every activation connection Phase 1 listed as missing is still missing. None was connected by any program since:

1. **Gateway ↔ ledger:** `aiGateway.js` performs no `createOperation → reserve → execute → settle/release`. The insertion point Phase 1 identified (shared transport, both transport families — §7) is untouched.
2. **Balance endpoint ↔ Gen-2:** `api/credits/[action].js` balance still reads Gen-1 through a memory placeholder; it has not been re-pointed at `getBillingRepository` + `withLedger` / `creditLedger.getBalance`.
3. **Usage endpoint ↔ persistent meter:** `api/credits/usage.js` still constructs `createUsageMeter(null)`; no persistent usage adapter is wired anywhere, so settlement-grade evidence is collected nowhere.
4. **FREE_ONCE ↔ account creation:** `grantFreeOnce` has no caller at workspace/billing-account creation; the Free trial is still granted only by the simulation's `mockSetPlan`, per-browser, resettable — "once per account" is enforced nowhere a user can touch.
5. **Middleware ↔ webhook:** no `/api/credits/webhook` exemption (§0 point 8, §10).
6. **Simulation ↔ server truth:** the frontend still never reads the server balance; simulation consumption order (bonus → topup → subscription) still diverges from Phase 5.1 (owner decision D7 still open).
7. **Reconciliation ↔ operations:** `creditReconciliation.js` exists but nothing invokes it (no job, no admin surface, no schedule).
8. **RPC layer ↔ domain:** the five drafted RPCs have no callers and no executed schema (companion document).
9. **Gen-1 → Gen-2 balance migration:** still unwritten (requires a live snapshot; intentionally not guessed).

---

## 10. Security boundaries

Verified boundaries, as they stand today:

- **Access gate (outermost):** `middleware.ts` gates `/app/*`, `/api/ai/*`, `/api/credits/*`, `/api/market/*` behind the signed access cookie; fail-closed (503 when unconfigured, 401 when unauthenticated). Exemptions are only `/api/access/*` and `/api/ai/engine-status` (`middleware.ts:35-44`, `PUBLIC_API_PATHS`). **Consequence (Phase 1 critical finding, re-verified, documentation only):** server-to-server Midtrans notifications to `/api/credits/webhook` carry no such cookie and would be rejected by the gate before reaching `webhookHandler`, for as long as the gate is active. The handler's own authentication (Midtrans signature) is never reached in that configuration. This audit did not modify `middleware.ts`.
- **Auth:** `AUTH_ENABLED = false` (`src/App.tsx:39`), mode `open`; login UI is frontend-only demo (`LOGIN_UI_ENABLED = true`, `src/App.tsx:51`). Consequently every plan/feature gate in the frontend is a local demo choice, and `billingAuthorization.js`'s workspace permissions — though implemented and tested — guard no live AI spend, because the AI path never calls them (§8.1) and there is no authenticated identity to evaluate.
- **Financial RLS (schema-level):** all financial tables are SELECT-only for `authenticated` (own/member rows); there is no write policy for `authenticated` anywhere in the Gen-2/Phase 5.3/20261109 migrations — writes are `service_role` / RPC only. Fail-closed and consistent across migrations. (Live application of these policies is UNKNOWN per §3.)
- **Webhook boundary:** `billingService.handleNotification` verifies the Midtrans SHA-512 signature (timing-safe), requires exact amount equality with the server catalog amount, and is idempotent at three layers. Amounts are never taken from the request body at checkout or at grant time (re-read from `billingCatalog.js`).
- **Vercel function ceiling:** 11 handlers + middleware = 12/12 on the Hobby plan, guarded by `src/test/apiEndpointInventory.test.ts`. Any new billing action must be added inside `api/credits/[action].js`; no Phase 1 or later work has added a handler.
- **Dormancy chain (billing):** billing stays off through five independent breakpoints, not one flag — (1) `MIDTRANS_SERVER_KEY` unset → 503; (2) Supabase service-role config absent → repository `null`; (3) `CREDITS_DB_CONFIGURED` unset, and even when `true` the balance adapter is a memory placeholder; (4) migrations unexecuted (live status UNKNOWN); (5) no reserve/settle/grantFreeOnce callers. All five were re-verified present in this audit.
- **Client-side trust boundary (the live one):** because the simulation is the only active billing, the effective boundary today is the browser: balances, plan selection, and debit records live in `localStorage` and can be edited by the user. No server decision depends on them — but no server decision constrains them either.

---

## 11. Existing test coverage inventory (billing / credit / metering)

All files under `src/test/`. Line counts are worktree counts at audit time. This audit did not run any suite (running the billing suites was neither required nor permitted to substitute for the Phase 1 verification record; Phase 1 §5 recorded 479 pre-existing checks + 174 new checks green, with TypeScript and production build at exit 0 — those results stand as the last executed verification, and no credit file has changed since, per §1.3 and §2).

### 11.1 Pre-existing suites (15, per Phase 1 §2.9 — all still present)

| Suite | Lines | Covers |
|---|---|---|
| `creditLedger.test.ts` | 654 | Gen-2 domain: grants, idempotency, allocation order, reserve/settle/release, overage → review, cross-account FORBIDDEN, tariff-version handling |
| `phase53BillingSecurity.test.ts` | 446 | Workspace scoping, FREE_ONCE once-per-account across store instances, review authorization (incl. CLIENT rejection), CAS on review resolution |
| `billingPlans.test.ts` | 224 | Canonical plan definitions (`src/billing/plans.ts`) |
| `billingWebhook.test.ts` | 189 | `handleNotification`: grant on settlement, replay idempotency, forged signature, amount mismatch, refund journaling |
| `usageMeter.test.ts` | 182 | Usage meter + Gen-1 engine integration |
| `aiCredits.test.ts` | 165 | Simulation adapter: consume/top-up/set-plan semantics |
| `billingCheckout.test.ts` | 136 | Checkout: catalog amounts, order creation, unconfigured-service honesty |
| `billingDemoGate.test.ts` | 131 | Simulation gates: Free-plan feature enforcement at the debit layer, top-up rejection for Free, idempotency by `jobReference` |
| `creditsActionHandler.test.ts` | 109 | `api/credits/[action].js` routing and honest 503s |
| `chatCreditDebit.test.ts` | 193 | The Chat AI success-only debit gate (`chatCreditDebit.ts`) against the real simulation adapter |
| `tokenMetering.test.ts` | 78 | v1.1 token metering: formula, reservation estimate, real view path (meter → `mockConsume`) |
| `subscriptionMachine.test.ts` | 76 | Subscription lifecycle incl. GRACE |
| `billingCatalogDrift.test.ts` | 41 | Catalog ↔ plan drift guard |
| `midtransSignature.test.ts` | 113 | Midtrans signature verification |
| `apiEndpointInventory.test.ts` | — | 11 handlers + middleware ceiling (12/12) |

### 11.2 Phase 1 suites (4 — present, byte-identical, §2)

| Suite | Lines | Phase 1 recorded result |
|---|---|---|
| `pricingPolicy.test.ts` | 117 | 33 PASS / 0 FAIL |
| `featureBillingMatrix.test.ts` | 73 | 87 PASS / 0 FAIL |
| `creditReconciliation.test.ts` | 126 | 23 PASS / 0 FAIL |
| `unifiedCreditLifecycle.test.ts` | 115 | 31 PASS / 0 FAIL |

### 11.3 Coverage gaps (unchanged from Phase 1, restated)

- No test executes the drafted SQL RPCs (impossible until the migration is applied to a test database — see companion document: runtime validation is **NOT RUNTIME VERIFIED**).
- No test covers a gateway-level reserve/settle integration, because the integration does not exist (§9.1).
- No test covers the ded-rab-v2/v3 transport family against any billing behaviour, because there is none (§7 row 16).
- Two runner regimes coexist (plain harness via `tsx` / esbuild+node, and vitest-style suites run through an esbuild + shim setup; vitest is not installed in this repo) — a fragility for future verification runs, not a coverage gap per se.

---

## 12. Remaining blockers and audit conclusion

### 12.1 Blockers (all pre-existing; none introduced or removed since Phase 1)

1. **Owner activation decisions/grants** (Phase 1 §6): legal decisions D1 (account closure), D2 (refunds), D4 (transfers) — all `PENDING_LEGAL_REVIEW`, correctly unimplemented; migration execution grant; middleware webhook-exemption grant; D7 (simulation order alignment), D8 (final top-up pricing), and provider-tariff verification (all seed prices `NULL`/`UNKNOWN`).
2. **Live database state UNKNOWN:** prerequisite migration application cannot be confirmed from the repo (§3).
3. **Middleware webhook gate:** billing cannot receive Midtrans notifications while the access gate covers `/api/credits/*` without an exemption (§10). Documentation only in this phase.
4. **No persistent usage evidence:** settlement and reconciliation have no live input until a persistent meter adapter is wired (§9.3).
5. **SQL draft readiness:** the 20261110 draft requires the corrections and runtime verification recorded in the companion document before any execution can even be considered; it must not be applied on the basis of this audit.

### 12.2 Conclusion

Phase 1's architecture baseline is **confirmed accurate in every material particular** by fresh, independent inspection: Gen-2 is canonical and complete as a domain; it is uncalled in production for reserve/settle; the simulation is the only live billing; DED debits flat, upfront, and unenforced; the legacy `server/` path still coexists; the five-point dormancy chain and the middleware webhook finding are exactly as reported. The only material change since Phase 1 is worktree hygiene (parallel programs' files, §1.3) — no credit behaviour, caller, or file has changed. The path to Unified AI Credits remains a connection exercise at activation time (Phase 1 §3.8 list, re-verified as §9), not a rebuild.

*End of audit. This document is documentation only: no commit, push, merge, deploy, migration execution, configuration change, or activation of any kind was performed.*
