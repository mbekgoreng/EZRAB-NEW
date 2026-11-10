# UNIFIED CREDITS — SPRINT 3 REGRESSION REPORT

Date: 2026-11-10 · Branch `integrasi/unified-ui-engine` · HEAD `99de892` before and
after · All suites executed locally in this sprint; historical Phase 2 numbers were
treated as claims and re-run wherever the suite belongs to this sprint's territory.

Failure classification key: **new regression** · **pre-existing baseline failure** ·
**parallel-programme conflict** · **environment/configuration limitation** ·
**test fixture defect** · **unverified runtime behavior** · **superseded pin**
(a test that pins behavior the current sprint's mandate deliberately replaced).

## 1. New suites (Sprint 3)

| Suite | Command | Result |
|---|---|---|
| `creditConcurrencySprint3.test.ts` | `npx --yes tsx src/test/creditConcurrencySprint3.test.ts` | **52 PASS / 0 FAIL** |
| `ai-metering.test.ts` | `npx --yes tsx src/test/ai-metering.test.ts` | **83 PASS / 0 FAIL** |
| `deterministic-free-metering.test.ts` | `npx --yes tsx src/test/deterministic-free-metering.test.ts` | **94 PASS / 0 FAIL** |
| `dedBillingCompat.test.ts` | `npx --yes tsx src/test/dedBillingCompat.test.ts` | **42 PASS / 0 FAIL** |

## 2. Existing billing/credit suites — before vs after

| Suite | Phase 2 baseline (claimed) | Sprint 3 actual | Verdict |
|---|---|---|---|
| `pricingPolicy.test.ts` | 33 | 33 PASS / 0 FAIL | Identical |
| `featureBillingMatrix.test.ts` | 87 | 87 PASS / 0 FAIL | Identical |
| `creditReconciliation.test.ts` | 23 | 23 PASS / 0 FAIL | Identical |
| `unifiedCreditLifecycle.test.ts` | 31 | 31 PASS / 0 FAIL | Identical |
| Phase 1 subtotal | 174 | **174 / 174** | Confirmed |
| vitest: `creditLedger` + `phase53BillingSecurity` + `aiCredits` + `usageMeter` + `chatCreditDebit` | 110 | **110 / 110 PASS** | Confirmed (of which creditLedger 35, usageMeter 17 via the metering lane's run) |
| `billingWebhook` / `billingCheckout` / `catalogDrift` / `subscriptionMachine` / `tokenMetering` / `creditsActionHandler` / `midtransSignature` | 38/23/21/26/26/9/37 | **Identical, 0 FAIL** | Confirmed |
| `tokenMetering` (counted in the metering lane run) | 26 | 26 PASS / 0 FAIL | Identical |
| `creditInvariantAdversarial.test.ts` | 60 / 60 | **55 PASS recorded, 3 FAIL, then the suite halted** (plain harness exits on the uncaught throw; its last 2 checks never ran) | **Superseded pins — see §3** |
| `apiEndpointInventory` (Vercel 12-function ceiling) | Pass (Phase 2) | Not re-run by Sprint 3 lanes; no API handler files were added or changed in this sprint (new modules live in `api/_lib/`, which is not a routed handler directory) | Unchanged by construction |

## 3. The three adversarial failures — classification: SUPERSEDED PINS (not behavior regressions)

The old suite `creditInvariantAdversarial.test.ts` belongs to the Phase 2 lane and
was **outside this sprint's ledger worker's edit territory**, so it was deliberately
not edited mid-flight. All three failures are pins of the *old defective behavior*
that Sprint 3 was mandated to fix:

1. **Case 2** expects a different-payload replay under the same idempotency key to
   be returned as `duplicate`. Sprint 3 Task 1 / test 10 mandates the opposite:
   an explicit `IDEMPOTENCY_CONFLICT`. The code now implements the mandate; the
   pin is obsolete.
2. **Two "KNOWN LIMITATION" pins** assert the orphan-FREE_ONCE outcome. The orphan
   no longer exists: the second flush is rejected pre-write and reconciliation is
   clean. The pins assert a defect that has been repaired.
3. The suite then **halts**: a manual double-settle sub-case (no try/catch in the
   old test) now throws `LEDGER_CONFLICT` from the new CAS preflight instead of
   silently proceeding, terminating the plain-harness process before its final 2
   checks.

The test file's own comments instruct that Cases 2–4 be updated deliberately when
the transactional boundary is fixed. **Required follow-up (owner/coordinator
action, recorded in the final report):** update those pins deliberately to the
Sprint 3 mandated behavior — do not weaken them; re-express them as assertions of
the new guarantees (conflict error, no orphan, CAS rejection). Until that update
lands, this suite's honest status is 55 PASS / 3 FAIL (superseded) / 2 NOT RUN.

No assertion anywhere in this sprint was weakened, skipped, or edited to force a
green result.

## 4. Project quality gate (coordinator, combined worktree, run solo)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` | **Exit 0** |
| Production build | `NODE_OPTIONS=--max-old-space-size=3072 npx vite build` | **Exit 0** (only the pre-existing >500 kB chunk-size warning) |

Scope note: this gate ran on the **combined worktree** — Sprint 3 changes plus the
in-flight parallel programmes (DED gap fix, DED/Doc shell, DED Final Hardening).
A green gate therefore also evidences that Sprint 3 did not break compilation of
the parallel work. No failure in this sprint is attributable to parallel-programme
files.

## 5. Cross-programme observations

- During the metering lane's run, `creditInvariantAdversarial` was observed at
  57 PASS / 3 FAIL against the ledger lane's *mid-edit* state; the final settled
  state is the 55/3 + halt recorded in §3. Both observations are consistent with
  a suite whose pins target behavior under active repair.
- DED test suites were not re-run by Sprint 3 (they belong to the parallel DED
  Final Hardening programme, which owns them and is still in flight). Sprint 3
  touched **zero** DED files; compilation integrity of the DED surface is covered
  by the combined tsc/build gate above.
- SQL runtime tests: **not executed — environment limitation.** No PostgreSQL
  exists on this machine (`which psql/postgres/pg_ctl/docker/podman` all empty).
  Classified as *unverified runtime behavior*, with a prepared harness awaiting a
  machine that has PostgreSQL (see the SQL validation document).

## 6. Totals

New Sprint 3 checks: **271 PASS / 0 FAIL** (52 + 83 + 94 + 42).
Re-confirmed legacy checks: **174 / 174** Phase 1 + **110 / 110** vitest +
**180** billing/webhook/catalog checks, 0 FAIL.
Known open item: `creditInvariantAdversarial` 55 PASS / 3 FAIL (superseded pins) /
2 NOT RUN — deliberate pin update pending.
Gates: tsc exit 0 · vite build exit 0.
