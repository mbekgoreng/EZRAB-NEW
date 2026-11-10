# EZRAB — Unified Credits Sprint 6: Regression

- **Date:** 2026-11-10 · **Repo:** `/home/hatch/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged)
- **Classification of this entire regression: STATE CONFIRMATION, NOT runtime proof.** Sprint 6's PostgreSQL gate is BLOCKED, so no SQL scenario ran; these JavaScript results confirm the worktree has not drifted from the Sprint 5 baseline. They prove nothing about database runtime behaviour.
- **Method:** every suite re-run fresh in Sprint 6, sequentially, one heavy process at a time, reusing the Sprint 5 regression document's exact commands. No file was edited; no assertion was weakened or skipped. Logs: `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT6/lane-b-evidence/`.

---

## 1. tsx suites — exact command/result pairs

Runner (verbatim from Sprint 5): `npx --yes tsx src/test/<name>.test.ts` from the repository root.

| Suite | Exit | Result | Sprint 5 baseline | Duration |
|---|---|---|---|---|
| pricingPolicy | 0 | 33 PASS, 0 FAIL | 33 ✓ | 3s |
| featureBillingMatrix | 0 | 87 PASS, 0 FAIL | 87 ✓ | 1s |
| creditReconciliation | 0 | 23 PASS, 0 FAIL | 23 ✓ | 2s |
| unifiedCreditLifecycle | 0 | 31 PASS, 0 FAIL | 31 ✓ | 1s |
| creditInvariantAdversarial | 0 | **71 PASS, 0 FAIL** | 71/71 ✓ | 2s |
| creditConcurrencySprint3 | 0 | **52 PASS, 0 FAIL** | 52/52 ✓ | 1s |
| ai-metering | 0 | 83 PASS, 0 FAIL | 83 ✓ | 2s |
| deterministic-free-metering | 0 | 94 PASS, 0 FAIL | 94 ✓ | 1s |
| dedBillingCompat | 0 | 42 PASS, 0 FAIL | 42 ✓ | 2s |
| **chatFastMetering** | **1** | **113 PASS, 1 FAIL** | 114 at the Sprint 5 opening baseline → **113/114** (known item, §3) | 1s |
| billingWebhook | 0 | 38 PASS, 0 FAIL | 38 ✓ | 2s |
| billingCatalogDrift | 0 | 21 PASS, 0 FAIL | 21 ✓ | 1s |
| billingCheckout | 0 | 23 PASS, 0 FAIL | 23 ✓ | 2s |
| billingDemoGate | 0 | 46 PASS, 0 FAIL | 46 ✓ | 2s |
| creditsActionHandler *(extra)* | 0 | 9 PASS, 0 FAIL | not in the Sprint 5 table — reported separately, never folded into comparisons | 1s |
| apiEndpointInventory | 0 | 13 PASS, 0 FAIL (12-function Vercel ceiling intact) | 13 ✓ | 2s |
| financialConsistency | 0 | 40 PASS, 0 FAIL | 40/40 ✓ | 2s |

Phase 1 aggregate: 33 + 87 + 23 + 31 = **174/174** — identical to the Sprint 5 baseline.

## 2. Vitest billing set + quality gates

Command: `TMPDIR=~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT6/tmp ~/workspace/kontraktor-os/node_modules/.bin/vitest run src/test/creditLedger.test.ts src/test/phase53BillingSecurity.test.ts src/test/usageMeter.test.ts src/test/aiCredits.test.ts src/test/chatCreditDebit.test.ts`

| File | Tests |
|---|---|
| creditLedger.test.ts | 35 passed |
| phase53BillingSecurity.test.ts | 20 passed |
| usageMeter.test.ts | 17 passed |
| aiCredits.test.ts | 16 passed |
| chatCreditDebit.test.ts | 22 passed |
| **Total** | **5 files, 110 passed, 0 failed — exit 0** (baseline 110/110 ✓) |

| Gate | Exact command | Heap | Exit | Duration |
|---|---|---|---|---|
| TypeScript | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --skipLibCheck` | 4096 | **0** (0 errors) | 86s, solo (Sprint 5: ~84s) |
| Vite build | `NODE_OPTIONS=--max-old-space-size=3072 node node_modules/vite/bin/vite.js build` | 3072 | **0** | wall 122s; vite reported `✓ built in 1m 53s` (Sprint 5: 2m 10s); chunk-size warnings only |

## 3. The single failure — §9 Chat FAST read-only comparison (classification (c))

**The failing assertion, verbatim** (`src/test/chatFastMetering.test.ts`, lines 473–474):

```ts
check('HTTP gate OFF: struktur respons persis {success,content,model,provider,mode,requestId,durationMs}',
  JSON.stringify(Object.keys(resOff.body).sort()) === JSON.stringify(['content', 'durationMs', 'mode', 'model', 'provider', 'requestId', 'success']));
```

It is an **exhaustive exact-set pin**: the sorted keys of the gateway success body must equal exactly those 7 keys. Suite log line 118 records the FAIL; the footer reads `Hasil: 113 PASS, 1 FAIL`. Every other gate-OFF parity check in the same run passes (identical content/provider/model/mode, provider called exactly once, identical prompt).

**Current gateway success body** (`api/_lib/aiGateway.js`, `handleAiRequest`, ~lines 972–984) — 10 top-level fields:

```js
const finalUsage = sanitizeUsageForClient(r.usage ?? null);
const responseBody = {
  success: true, content: r.content, model: r.model, provider: r.provider,
  mode, requestId, durationMs,
  usage: finalUsage.usage,
  usageStatus: finalUsage.usageStatus,
  attempts: (Array.isArray(r.attempts) ? r.attempts : []).map(sanitizeAttemptForClient).filter(Boolean),
};
```

**Classification: (c) — the pin is missing deliberate additive fields.**

- X1 (DED Sprint 5, Workstream A) added **three** fields — `usage`, `usageStatus`, `attempts` — not two. (The Sprint 5 Unified Credits regression shorthand "adds usage/attempts evidence" understated this by one; the DED programme's own documents state three, and the code confirms three.)
- **Additive-only:** all 7 pre-existing fields are present with identical names, types and meanings. Nothing was removed, renamed or re-typed. It is therefore **not (b)** — no unintended change was detected — and **not (a) in substance**: the pin was correct when written; it has been superseded by a deliberate, documented additive change.
- Client safety of the new fields: `sanitizeUsageForClient`/`sanitizeAttemptForClient` whitelist fields and expose only `errorClass` (never raw error text or secrets); unknown usage is honestly `usage: null` + `usageStatus: 'missing'`, with measured-zero and malformed as distinct states — never fabricated.
- Backward compatibility is proven by the parallel programme's client (`src/ai-tools/providerClient.ts`, X2), which accepts legacy responses without the new fields.
- The adapter `api/_lib/chatFastMetering.js` does not read, strip or reshape HTTP response fields: at gate OFF it returns the `execute()` result object as-is without calling the metering boundary; at gate ON it reads only `result.usage`/`provider`/`model` from the gateway result object (not the HTTP body).

**Ownership and minimal future adjustment (NOT performed in this sprint, per §9):** the test is Credits-owned, so the fix belongs to **the Unified Credits programme via a future integration grant**. Minimal adjustment: extend the assertion's expected sorted key list from 7 to 10 — `['attempts','content','durationMs','mode','model','provider','requestId','success','usage','usageStatus']` — and update its label to name the 10-field shape. No gateway or adapter change is warranted. The assertion was not weakened, deleted or edited here.

## 4. SQL harness (bash layer)

- `bash …/sql-harness-v2/selftest.sh` → **5/5 PASS, exit 0** (failing assertion → exit 1; passing control → exit 0; non-local `PGHOST` refused → exit 2; non-disposable `PGDATABASE` refused → exit 2; missing `psql` → BLOCKED exit 3). Identical to Sprint 5's captured output.
- `bash …/sql-harness-v2/run_all.sh` → **exit 3 (BLOCKED)** before touching anything: guard order stops it before any `CREATE DATABASE` (see `UNIFIED_CREDITS_SPRINT_6_POSTGRES_RUNTIME.md`).
- **Full SQL runtime harness: NOT RUN** — no PostgreSQL exists. SQL scenarios are not counted as PASS anywhere.

## 5. Incidents — honestly classified

1. **Accidental parallel `tsc` dispatch (lane error, not counted):** two identical `tsc` invocations were dispatched in parallel once — a violation of the solo rule by the regression lane itself. The service restarted mid-run; that attempt produced a 0-byte log and no exit code, and is counted as **neither pass nor fail**. The counted TypeScript result is the clean solo re-run (exit 0, 86s).
2. **No OOM (exit 137)** occurred in any counted run. All heavy processes ran one at a time after the incident above.
3. **`/tmp` ENOSPC did not occur** this window (`/tmp` was ~0–1% used at start; Sprint 5 had found it 100% full). The workspace-disk `TMPDIR` redirect for Vitest was still applied as a precaution, per the Sprint 5 recipe. No other programme's files were touched.

## 6. Count separation

Per-suite counts overlap in coverage (ledger behaviour is exercised by several suites) and **must not be summed as unique tests**. For reference only, the arithmetic sum of suite checks executed in this window is 820 tsx checks (811 from the Sprint 5 set, with `chatFastMetering` contributing 113 passes + 1 known failure, plus 9 from the extra `creditsActionHandler` suite) + 110 Vitest tests — a sum of suite checks, not a unique-test count.

**Bottom line:** every Sprint 5 baseline held exactly, except the single fully explained `chatFastMetering` exact-shape failure (113/114) — classification (c), a deliberate X1 additive change awaiting a Credits-owned test-pin update under a future integration grant.
