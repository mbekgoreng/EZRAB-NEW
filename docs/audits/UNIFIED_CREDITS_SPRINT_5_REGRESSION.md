# EZRAB — Unified Credits Sprint 5: Regression

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- **Scope note:** Sprint 5 changed exactly one repository file — the SQL draft migration (no JavaScript, no tests, no application code). The application suites below were therefore run as the **baseline** (before the SQL edit) and remain the after-state by construction: no code they exercise was modified by this sprint. Two exceptions discovered during the window — both caused by a **parallel Sprint 5 programme** (gateway usage-evidence X1/X2/X4 + DED correlation work) landing in the same worktree mid-sprint — are recorded in §3 with their own classification. Nothing was weakened, skipped, or converted from NOT RUN to PASS.

---

## 1. Application regression — exact command/result pairs (all PASS)

Runner for `.test.ts` suites: `npx --yes tsx src/test/<name>` from the repo root.

| Suite | Command | Result |
|---|---|---|
| Credit invariant adversarial | `npx --yes tsx src/test/creditInvariantAdversarial.test.ts` | **71 PASS, 0 FAIL** (baseline 71/71 held; re-run after the parallel landing: still 71/71) |
| Credit concurrency (Sprint 3) | `npx --yes tsx src/test/creditConcurrencySprint3.test.ts` | **52 PASS, 0 FAIL** |
| AI metering | `npx --yes tsx src/test/ai-metering.test.ts` | **83 PASS, 0 FAIL** |
| Deterministic-free metering | `npx --yes tsx src/test/deterministic-free-metering.test.ts` | **94 PASS, 0 FAIL** |
| DED adapter compatibility | `npx --yes tsx src/test/dedBillingCompat.test.ts` | **42 PASS, 0 FAIL** |
| Chat FAST metering | `npx --yes tsx src/test/chatFastMetering.test.ts` | **114 PASS, 0 FAIL** at baseline — see §3 for the post-landing state |
| Pricing policy (Phase 1) | `npx --yes tsx src/test/pricingPolicy.test.ts` | **33 PASS, 0 FAIL** |
| Feature billing matrix (Phase 1) | `npx --yes tsx src/test/featureBillingMatrix.test.ts` | **87 PASS, 0 FAIL** |
| Credit reconciliation (Phase 1) | `npx --yes tsx src/test/creditReconciliation.test.ts` | **23 PASS, 0 FAIL** |
| Unified credit lifecycle (Phase 1) | `npx --yes tsx src/test/unifiedCreditLifecycle.test.ts` | **31 PASS, 0 FAIL** |
| Billing webhook | `npx --yes tsx src/test/billingWebhook.test.ts` | **38 PASS, 0 FAIL** |
| Billing catalog drift | `npx --yes tsx src/test/billingCatalogDrift.test.ts` | **21 PASS, 0 FAIL** |
| Billing checkout | `npx --yes tsx src/test/billingCheckout.test.ts` | **23 PASS, 0 FAIL** |
| Billing demo gate | `npx --yes tsx src/test/billingDemoGate.test.ts` | **46 PASS, 0 FAIL** |
| API endpoint inventory (Vercel 12-function ceiling) | `npx --yes tsx src/test/apiEndpointInventory.test.ts` | **13 PASS, 0 FAIL** |
| Financial consistency | `npx --yes tsx src/test/financialConsistency.test.ts` | **40 PASS, 0 FAIL** |

Phase 1 aggregate: 33 + 87 + 23 + 31 = **174/174** (matches the Phase 1 baseline exactly).

Billing Vitest set — runner: `~/workspace/kontraktor-os/node_modules/.bin/vitest run <files>` with `TMPDIR` redirected onto the workspace disk (see §4):

| Files | Result |
|---|---|
| `creditLedger.test.ts`, `phase53BillingSecurity.test.ts`, `usageMeter.test.ts`, `aiCredits.test.ts`, `chatCreditDebit.test.ts` | **5 files passed, 110 tests passed, 0 failed** (baseline 110/110 held) |

## 2. Quality gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --skipLibCheck` | **exit 0** (≈84 s, solo) |
| Vite production build (first attempt) | `NODE_OPTIONS=--max-old-space-size=3072 node node_modules/vite/bin/vite.js build` | **OOM-killed** (kernel, 2 OOM kills) while parallel-lane processes held memory — environment contention, not a code failure; **not** counted as a pass |
| Vite production build (solo re-run) | same command, output to `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/build-log.txt` | **exit 0** — `✓ built in 2m 10s` |

## 3. Parallel-programme event during the sprint window (classified, not hidden)

While Sprint 5 ran, a parallel Sprint 5 programme (gateway usage-evidence plumbing X1/X2/X4 + DED work) modified `api/_lib/aiGateway.js` (md5 `635f9c3b…` → `d12a103e…`), `src/ai-tools/providerClient.ts` (newly modified, +142/−2), and added `src/test/dedGatewayUsageEvidence.mjs`, `src/test/dedRequestCorrelation.src.ts`, `src/test/dedPriceReferenceRefresh.src.ts` (file mtimes 00:08–00:10 UTC, after this sprint's Phase 0 capture at 78 status entries; final status: 82 entries).

Effect on this sprint's suites, re-measured after the landing:

- `creditInvariantAdversarial`: **71/71** (unchanged).
- `chatFastMetering`: **113 PASS, 1 FAIL** (was 114/114 at this sprint's baseline). The single failure is the assertion *"HTTP gate OFF: response structure exactly {success,content,model,provider,mode,requestId,durationMs}"* — the parallel programme's X1 change deliberately adds usage/attempts evidence to the gateway success body, so the pinned exact-shape expectation no longer matches. **Classification: parallel-programme change, not a Sprint 5 regression.** This sprint did not modify the gateway, the adapter, or the test; reconciling the pin belongs to the parallel programme / a future integration grant, and the discrepancy is recorded here rather than silently absorbed.

## 4. Environment incident (classified, resolved without touching shared state)

The first Vitest invocation in this window failed to collect any test (`Tests: no tests`, 5 errors) with `ENOSPC: no space left on device` — `/tmp` is a 512 MB tmpfs at 100% (345 MB Node compile cache plus ≈150 MB of esbuild bundles and scratch directories belonging to other programmes). No other programme's files were deleted. The suite was re-run with `TMPDIR` redirected to a workspace-disk directory (`~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT5/tmp/`) and passed 110/110. The same full `/tmp` forced Lane B's pre-edit backup onto `/var/tmp/` (byte-identical copy, md5-verified).

## 5. SQL runtime tests

**NOT RUN — BLOCKED** (no PostgreSQL; installation not authorised). The complete scenario matrix, designed expectations, and the executed bash-layer harness self-test (5/5, including a deliberately failing assertion exiting non-zero) are recorded in `UNIFIED_CREDITS_SPRINT_5_SQL_RUNTIME_VALIDATION.md` and `UNIFIED_CREDITS_SPRINT_5_HARNESS_VALIDATION.md`. NOT RUN is not counted as PASS anywhere in this programme's reporting.

## 6. Count separation (required)

Numeric suite checks executed green in this window: 811 tsx checks (including webhook/catalog/checkout/demo-gate/inventory/financial-consistency) + 110 Vitest tests = **921 checks, 0 failures**, plus 1 post-landing parallel-programme failure recorded in §3 (chatFastMetering 113/114 on re-run). These suites overlap in coverage (e.g. ledger behaviour is exercised by several suites); **921 is a sum of suite checks, not a count of unique tests**. The historical "806" figure belongs to the DED programme's combined-worktree baseline and is not comparable.
