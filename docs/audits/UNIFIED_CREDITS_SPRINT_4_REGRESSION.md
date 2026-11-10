# EZRAB — Unified Credits Sprint 4: Regression Summary

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- All suites below were executed this sprint, individually, from the repo root. **Zero failures across every suite run.** No test was skipped or weakened to obtain green (the one suite whose assertions changed — `creditInvariantAdversarial` — grew from 60 to 71 checks; see the adversarial companion report).

## 1. Command/result pairs

### Unified Credits — tsx suites (`npx --yes tsx src/test/<file>`)

| Suite | Result |
|---|---|
| creditInvariantAdversarial.test.ts | **71 PASS / 0 FAIL** (baseline 55 / 3 / 2 NOT RUN) |
| chatFastMetering.test.ts (NEW) | **114 PASS / 0 FAIL** |
| creditConcurrencySprint3.test.ts | 52 PASS / 0 FAIL |
| ai-metering.test.ts | 83 PASS / 0 FAIL |
| deterministic-free-metering.test.ts | 94 PASS / 0 FAIL |
| featureBillingMatrix.test.ts | 87 PASS / 0 FAIL |
| pricingPolicy.test.ts | 33 PASS / 0 FAIL |
| creditReconciliation.test.ts | 23 PASS / 0 FAIL |
| unifiedCreditLifecycle.test.ts | 31 PASS / 0 FAIL |
| dedBillingCompat.test.ts | 42 PASS / 0 FAIL |
| billingWebhook.test.ts | 38 PASS / 0 FAIL |
| billingCatalogDrift.test.ts | 21 PASS / 0 FAIL |
| billingCheckout.test.ts | 23 PASS / 0 FAIL |
| creditsActionHandler.test.ts | 9 PASS / 0 FAIL |

### Unified Credits — vitest suites (`~/workspace/kontraktor-os/node_modules/.bin/vitest run <files>`)

| Suite | Result |
|---|---|
| creditLedger.test.ts | 35 PASS |
| phase53BillingSecurity.test.ts | 20 PASS |
| usageMeter.test.ts | 17 PASS |
| aiCredits.test.ts | 16 PASS |
| chatCreditDebit.test.ts | 22 PASS |
| **Vitest total** | **110 PASS / 0 FAIL** (identical to the Phase 2 / Sprint 3 baseline) |

Note: `creditLedger.test.ts` and `phase53BillingSecurity.test.ts` import `vitest` and cannot run under the plain tsx runner (`ERR_MODULE_NOT_FOUND: vitest`) — that is their documented execution mode (esbuild + vitest), not a failure.

### Gateway / Chat FAST suites

| Suite | Result |
|---|---|
| Gateway ChainOrder | 14 PASS / 0 FAIL |
| Gateway F7 | 21 PASS / 0 FAIL |
| Gateway ErrorClass | 7 PASS / 0 FAIL |
| Gateway EnvBareKey | 6 PASS / 0 FAIL |
| Gateway Idempotency | PASS |
| Gateway DemoPolicy | PASS |
| apiEndpointInventory | 13 PASS / 0 FAIL (Vercel 12-function ceiling intact) |

### Cross-programme spot checks (implementations NOT modified by this sprint)

| Suite | Command | Result |
|---|---|---|
| financialConsistency.test.ts | `npx --yes tsx src/test/financialConsistency.test.ts` | 40 PASS / 0 FAIL |
| dedDocPageShell.test.ts | `npx --yes tsx src/test/dedDocPageShell.test.ts` | 50 PASS / 0 FAIL |
| dedPriceCompletion.src.ts | esbuild bundle → `node` (per file header) | **43 PASS / 0 FAIL** — note: Sprint 3/Phase 2 measured 42/43 with the 1 failure attributed to the parallel DED programme's in-flight edit; the DED programme has since landed its fix in this worktree, and the suite is now fully green. This sprint changed no DED file. |

### Repository gates (combined worktree, run solo by the coordinator at sprint end)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --skipLibCheck` | **exit 0** |
| Production build | `NODE_OPTIONS=--max-old-space-size=3072 npx vite build` | **exit 0** (1m 34s; chunk-size warnings only, pre-existing) |

Environment note (honesty): the first two tsc attempts this session were OOM-killed (exit 137) at heap 6144 while a second heavy process (the parallel programme's own tsc) held ~2.9 GB RSS on the shared 7.9 GB VM — the documented container-memory pattern for this repo, not a code failure. The passing run used heap 4096, solo, on the identical tree.

## 2. Counting discipline

The numeric suites above sum to **1,025 counted checks with 0 failures**, plus 2 pass/fail gateway suites (Idempotency, DemoPolicy) reported as PASS. This sum is **not** a count of unique tests: suites overlap in coverage (e.g. `ai-metering` and `chatFastMetering` exercise the same lifecycle from different sides; `dedBillingCompat` overlaps the adapter contract). Counts are reported per suite precisely so no overlap is double-presented as uniqueness.

**Reconciliation with the "806" figure:** the 806 PASS / 0 FAIL quoted in Sprint 3's brief was the *DED programme's* combined-worktree baseline (its own suite set, dominated by DED suites), not a Unified Credits total. This sprint's credit-focused set is a different, larger scope (it adds the new 114-check Chat FAST suite and the repaired 71-check adversarial suite). The overlapping anchor points agree exactly with their baselines: vitest set 110/110, Phase 1 suites 174/174 (33+87+23+31), Sprint 3 new suites 271/271 (52+83+94+42), billing tsx set 91 (38+21+23+9) within the previously reported 180-check billing/webhook/catalog family.

## 3. NOT RUN items (not counted as PASS)

- **All PostgreSQL runtime scenarios** (F-6, F-10, F-1/F-2/F-4/F-5/F-7 runtime behaviour, RLS, role rejection): **BLOCKED** — no PostgreSQL/Docker/Podman exists on this machine and installation is not authorised. See the SQL runtime validation companion report.
- Full combined-worktree mega-suite (every suite in `src/test/`): not run as a single pass; the relevant subsets above were run individually per the sprint's Phase 7 list.
