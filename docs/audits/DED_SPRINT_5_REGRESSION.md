# DED Sprint 5 — Regression Record (Workstream E)

Date: 2026-11-10. Repo root: `/home/hatch/workspace/ezrab-unified`. All heavy processes
(tsc, vite build) were run solo and sequentially. `/tmp` is 100% full on this machine;
esbuild bundles were written to `/home/hatch/workspace/.ded-sprint5-bundles/` with
absolute outfile paths. Counts below are per-suite as printed by each suite; suites
overlap in coverage, so counts are **not** summed into a unique-test total.

## New suites (Sprint 5)

| Suite | Command | Result |
|---|---|---|
| dedGatewayUsageEvidence | `node src/test/dedGatewayUsageEvidence.mjs` | 6/6 groups PASS |
| dedRequestCorrelation | esbuild bundle of `src/test/dedRequestCorrelation.src.ts` → `node` | 26 PASS / 0 FAIL |
| dedPriceReferenceRefresh | esbuild bundle of `src/test/dedPriceReferenceRefresh.src.ts` → `node` | 14 PASS / 0 FAIL |

## Existing regressions

| Suite | Result |
|---|---|
| dedPdfjsCompat (unbundled) | `npx tsx src/test/dedPdfjsCompat.src.ts` → 28 PASS / 0 FAIL / 0 SKIP |
| dedPdfjsCompat (bundled) | 26 PASS / 2 FAIL — known esbuild-external artifact (`@napi-rs/canvas`), identical classification to Sprint 4; Sprint 5 changed no PDF code (`src/lib/pdfjsSetup.ts` md5 unchanged) |
| dedFullAiParity | 28 PASS / 0 FAIL |
| dedMaterialSpec | 46 PASS / 0 FAIL |
| dedCanonicalReferenceService | 19 PASS / 0 FAIL |
| dedUsageCreditsCompat | `npx tsx src/test/dedUsageCreditsCompat.test.ts` → 36 PASS / 0 FAIL |
| dedBillingCompat | `npx tsx src/test/dedBillingCompat.test.ts` → 42 PASS / 0 FAIL |
| dedPriceCompletion | 43 PASS / 0 FAIL (owner fixture grand total unchanged: Rp149.023.200) |
| dedHardening | 34 PASS / 0 FAIL |
| dedDocPageShell | 50 PASS / 0 FAIL |
| gatewayIdempotency | `node src/test/gatewayIdempotency.mjs` → 5 checks PASS |
| apiEndpointInventory | 13 PASS / 0 FAIL (12-function Vercel ceiling intact) |

## Cross-programme item (not a Sprint 5 regression; not "fixed" by this sprint)

`npx tsx src/test/chatFastMetering.test.ts` → **113 PASS / 1 FAIL**. The single failure
is the Credits Sprint 4 assertion pinning the exact gateway success-body shape
`{success,content,model,provider,mode,requestId,durationMs}`. Workstream A's mandated
additive X1 fields (`usage`, `usageStatus`, `attempts`) supersede that shape by design.
All other gate-OFF parity checks in the same suite PASS (identical
content/provider/model/mode, provider called once, identical prompt, zero ledger
writes). The test file is Credits-owned and untracked; updating its expectation is a
deliberate Credits-side decision (same pattern as the Sprint 3 adversarial Cases 2–4
update). This sprint did not edit it.

## Type-check and build

| Step | Command | Result |
|---|---|---|
| tsc (first run) | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --skipLibCheck` | exit 2 — one error: implicit-`any` parameter in the new X2 client code (`providerClient.ts:461`); fixed with an explicit type predicate |
| tsc (rerun) | same | **exit 0, 0 errors** (log: `~/workspace/your_files/EZRAB-DED-SPRINT5/tsc-run2.log`) |
| Production build | `NODE_OPTIONS=--max-old-space-size=3072 npx vite build` | **exit 0**, built in 1m 42s (chunk-size warnings only; log: `build-run.log` in the same folder) |

Note: the working tree during these runs also contained the parallel Credits Sprint 5
programme's in-flight changes; tsc and build cover the combined tree and passed on it.
