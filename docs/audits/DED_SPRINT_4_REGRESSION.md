# DED Sprint 4 — Regression Report

Scope: DED Estimate AI Sprint 4 (Tasks A–G). Repository `~/workspace/ezrab-unified`,
branch `integrasi/unified-ui-engine`, HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896`
(unchanged throughout the sprint). All work local; no commit/push/deploy/migration.

Test logs: `~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/` (`BASELINE.md`,
`baseline/*.log`, `after/*.log`, per-task folders `taskA/`, `taskB/`, `taskCD/`, `taskEF/`).

## How suites are run

- `.src.ts` suites: `./node_modules/.bin/esbuild src/test/<name>.src.ts --bundle --platform=node --format=cjs --outfile=~/workspace/.ded-sprint4-bundles/<name>.cjs && node <bundle>` (bundles on workspace disk because `/tmp` is a 512 MB tmpfs).
- `.test.ts` suites: `npx --yes tsx src/test/<name>.test.ts`.
- `dedF4.test.ts`: vitest from `~/workspace/kontraktor-os/node_modules/.bin/vitest run` with `TMPDIR` on workspace disk.

## Baseline (before Sprint 4 changes) vs After (final tree)

| Suite | Baseline | After | Note |
|---|---|---|---|
| dedPriceCompletion (.src.ts) | 43/0 | **43 PASS / 0 FAIL** | FULL_AI fixture 38/38, grand total Rp149.023.200 unchanged |
| dedHardening (.src.ts) | 34/0 | **34 PASS / 0 FAIL** | |
| dedAssumptionTier (.src.ts) | 34/0 | **34 PASS / 0 FAIL** | |
| dedEstimationPolicy (.src.ts) | 41/0 | **41 PASS / 0 FAIL** | |
| dedCanonicalPricing (.src.ts) | 68/0 | **68 PASS / 0 FAIL** | |
| dedFullAiRegression (.src.ts) | 15/0 | **15 PASS / 0 FAIL** | |
| dedPromptBudget (.src.ts) | 267/0 | **267 PASS / 0 FAIL** | |
| dedPromptModeSeparation (.src.ts) | 45/0 | **45 PASS / 0 FAIL** | |
| dedRealFileAssumptionHarness (.src.ts) | 15/0 | **15 PASS / 0 FAIL** | real owner PDF |
| dedFullAi (.src.ts) | 24/0 | **24 PASS / 0 FAIL** | |
| dedFullAiAcceptance (.src.ts) | 15/0 | **15 PASS / 0 FAIL** | |
| dedFullAiFinalCheck (.src.ts) | 21/0 | **21 PASS / 0 FAIL** | |
| dedFullAiQa (.src.ts) | 18/0 | **18 PASS / 0 FAIL** | |
| dedAiPriceEstimation (.test.ts) | 13/0 | **13 PASS / 0 FAIL** | |
| dedDocPageShell (.test.ts) | 50/0 | **50 PASS / 0 FAIL** | DED shell intact |
| mobileNativeW2 (.test.ts) | 83/0 | **83 PASS / 0 FAIL** | mobile result UI intact |
| dedF4 (vitest) | 20/0 | **20 PASS / 0 FAIL** | |
| dedBillingCompat (.test.ts, Sprint 3 area) | 42/0 | **42 PASS / 0 FAIL** | Unified Credits lifecycle compat |
| apiEndpointInventory (.test.ts) | — | **13 PASS / 0 FAIL** | Vercel 12-function ceiling intact (11 handlers + middleware) |

Baseline total (18 suites): **848 PASS / 0 FAIL** (= Hardening report's 806 + Sprint 3's dedBillingCompat 42).

### New suites added by Sprint 4

| Suite | Result | Covers |
|---|---|---|
| dedPdfjsCompat (.src.ts) | **26 PASS / 0 FAIL / 2 SKIP** (see classification below) | Task A: Node load, fingerprints, invalid PDF fail-closed, version pairing, shared consumers |
| dedFullAiParity (.src.ts) | **28 PASS / 0 FAIL** | Task B: structured price block, 8-class quantity audit, accept/reject |
| dedMaterialSpec (.src.ts) | **46 PASS / 0 FAIL** | Task D: 15 false-positive guards, 11 hard conflicts, 5 ambiguous, 8 parser guards, integration |
| dedCanonicalReferenceService (.src.ts) | **19 PASS / 0 FAIL** | Task C: canonical projection, freshness, revalidation list |
| dedUsageCreditsCompat (.src.ts) | **36 PASS / 0 FAIL** | Task E: usage metadata shape, null honesty, deterministic ops create no paid record |

After total: **1.003 PASS** across the baseline suites (806+42+13 inventory = 861 verified checks in the tables above excluding inventory: 848; plus 155 new checks: 26+28+46+19+36) — see per-suite rows; no test was weakened, skipped silently, or had expectations rewritten to reach green.

## Invariant verification (Task G)

- FULL_AI fixture remains **38/38** complete; grand total **Rp149.023.200** (dedPriceCompletion).
- No inferred quantity is labelled drawing-extracted: classifyQuantityProvenance precedence + Task B parity tests assert context fills are `ESTIMATED_FROM_CONTEXT`, never `DRAWING_EXTRACTED`.
- No market reference is labelled official AHSP: sourceKind mapping tests (standard + Full AI parity) — MARKET_REFERENCE / VERIFIED_SUPPLIER only from their tiers; acceptance never changes verification status.
- No missing price silently becomes Rp0: material/spec conflicts keep price empty + `NEEDS_VERIFICATION` (dedPriceCompletion S-scenarios, dedMaterialSpec integration checks).
- No incomplete evidence produces a final charge: usage tokens/cost remain `null` with explicit `missingEvidenceReason`; no debit path exists (dedUsageCreditsCompat; billing stays simulation-only).
- No user edit retains stale AI provenance: `quantitySource='USER_INPUT'` on commitEdit/commitBulkFill (Hardening) + Full AI manual edit revokes replaced fill blocks (Task B).
- No accepted completion is mistaken for official verification: accept sets `userApprovalStatus='APPROVED'` only (Task B tests).
- No cache entry crosses explicit reference-set boundaries; no stale entry presented as fresh (Hardening cache suites + canonical freshness FRESH/STALE/UNKNOWN).
- No PDF runtime failure is hidden: invalid PDF fails closed with structured error (dedPdfjsCompat); the previous `toHex` failure reproduced pre-fix and is gone post-fix (Task A logs).
- Quantity classification, estimation, approval; price completion and rejection; cache freshness and isolation; Full AI parity; material conflicts; PDF parsing; multi-page PDF (32-page fixture); multi-file workflow; DED usage metadata; Unified Credits lifecycle compatibility; financial consistency (canonical pricing suites); mobile result UI (mobileNativeW2); DED shell (dedDocPageShell) — all covered by the suites above.

## Failures encountered and their classification

1. **dedPdfjsCompat E1/E2 in the coordinator's bundled re-run: 2 FAIL** — `Cannot find package '@napi-rs/canvas' imported from ~/workspace/.ded-sprint4-bundles/dedPdfjsCompat.cjs`. Classification: **environment/bundling artifact, not a code regression**. Proof: (a) in the Task A worker's in-repo bundle run the same checks were honest SKIPs (esbuild bundling breaks pdf.js standard-font resolution by path); (b) the unbundled tsx probe (`pdfPageServiceProbe.mts`) run by the coordinator against the final tree returned **PROBE PASS** — `PdfPageService.extractPages(fixture, 2)` → 2 pages `RENDERED`, image lengths 28738 and 169002 (`test-out/after/pdfPageServiceProbe.log`); (c) E3/E4 in the same bundled run PASS, so the legacy loader itself works under bundling.
2. **dedF4 first baseline run: ENOSPC (no space left on device)** — `/tmp` is a 512 MB tmpfs; esbuild bundles (241 MB) + vitest temp filled it. Classification: **environment limitation**. Re-run with bundles and `TMPDIR` on workspace disk → 20/20 PASS, baseline and after.
3. **dedDifferentialPdf.test.ts FAIL (pre-existing)** — its own early assertion requires fixture B `qa-fixtures/DED_UNIQUE_P7Q.pdf`, which does not exist in this checkout; it fails before any PDF is loaded. Classification: **pre-existing fixture defect / parallel-programme area** (ded-rab-v2 test surface), not caused by Sprint 4 and outside Sprint 4's file territory; left untouched and reported.
4. **vite build: two OOM kills (exit 137) before success.** First attempt ran while the parallel Sprint 3 programme's `tsc` and `vite build` processes were active on the same VM (verified via process listing: Sprint 3 `tsc` at 1.6 GB RSS, then its `vite build` at 26% MEM) — combined memory exceeded the container limit. Classification: **parallel-programme resource contention (environment)**. After those processes finished, the solo re-run on the identical, verified-unchanged tree (git status diff = identical, 78 entries) completed: **exit 0, "✓ built in 1m 52s"** (`test-out/after/build-retry.log`).
5. **TypeScript**: `NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit --skipLibCheck` → **exit 0** (0 errors), run solo by the coordinator on the combined tree (`test-out/after/tsc.log` empty). Note: this is the combined Sprint 3 + Sprint 4 tree state at that moment; no Sprint 4 file produced an error.

## TypeScript / build / inventory

- tsc: **exit 0**.
- vite build: **exit 0** (after the contention-classified retries above); production bundle contains the legacy pdf.js main chunk and `pdf.worker.min-*.mjs` — the legacy worker is what ships.
- apiEndpointInventory: **13 PASS / 0 FAIL** — Vercel Hobby 12-function ceiling intact; Sprint 4 added no API handlers.

## Parallel programme note

The Unified Credits Sprint 3 programme worked in the same worktree throughout. Its files changed during Sprint 4 (e.g. `api/_lib/aiGateway.js`, `billingStore.js`, `aiMetering.js`, the credits migration draft, plus new `chatFastMetering.js`, `creditConcurrencySprint3.test.ts`, metering docs). Sprint 4 did not edit any of them; their final state is Sprint 3's own result, and any Sprint 3 test outcomes belong to that programme's report.
