# EZRAB — Unified Credits Sprint 4: Adversarial Regression Suite Repair

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896`
- **Target:** `src/test/creditInvariantAdversarial.test.ts` — the **only** file changed by this phase.
- **Result: 71 PASS / 0 FAIL** (baseline at sprint start, independently re-measured: **55 PASS / 3 FAIL / 2 NOT RUN**). Run: `npx --yes tsx src/test/creditInvariantAdversarial.test.ts`, exit 0, summary line printed.

---

## 1. Why the suite was failing (verified against implementation code, not assumed)

Sprint 3 changed the guarantees of `api/_lib/billingStore.js` (per-account serialisation, preflight invariant validation, content-CAS snapshot validation, compensated flush) and `api/_lib/creditLedger.js` (idempotency payload comparison). Three pins in the suite still asserted the old defective behaviour, and one block crashed the process:

| # | Location | Old assertion | Actual Sprint 3 behaviour |
|---|---|---|---|
| 1 | Case 2 | Same key + different amount returns `ok + duplicate:true` | `ok:false, error:'IDEMPOTENCY_CONFLICT'` (`creditLedger.js` `idemGet`/`grantCommon` payload comparison) |
| 2 | Case 3a | Orphan FREE_ONCE batch persists (2 batches, 1 GRANT entry) | Second flush rejected **before writing** (`UNIQUE_VIOLATION` from the compensated flush — the GRANT/FREE_ONCE key is already persisted outside the snapshot); final state is exactly 1 batch + 1 GRANT entry |
| 3 | Case 3a | Reconciliation detects the orphan (`LEDGER_BATCH_MISMATCH`) | State is clean; reconciliation reports healthy |
| 4 | Case 4a (2 NOT RUN) | Double settle across snapshots writes 2 CONSUME entries | Second flush throws `LEDGER_CONFLICT` (content-CAS in `preflightFlush`, `billingStore.js`) — the old test had no try/catch, so Node crashed at the flush and the final 2 checks + summary never ran |

Contracts were verified by reading the implementation **and** by deterministic probes before any assertion was rewritten. No error code was invented: `IDEMPOTENCY_CONFLICT`, `UNIQUE_VIOLATION`, `LEDGER_CONFLICT`, `INSUFFICIENT_BALANCE` are the codes the code actually returns.

## 2. Previous assertions → updated expected behaviour

- **Header:** the KNOWN-LIMITATION framing was replaced with the Sprint 3 guarantees plus a deliberate-update note (dated 2026-11-10, Sprint 4). It explicitly states that the corruption-detection cases (15/16/17) were **not** weakened — reconciliation must still detect genuinely corrupted data; it must now report *healthy* on the repaired concurrency paths.
- **Case 2 (2 → 4 checks):** identical replay still returns a safe duplicate; a payload mismatch now returns `IDEMPOTENCY_CONFLICT`, creates **no** new batch, **no** new ledger entry, and the original 3600-credit grant is unchanged (the old "amount stays 3600" check was retained).
- **Case 3a (3 → 4 checks):** the second flush is asserted **rejected** (`UNIQUE_VIOLATION`); the final state is exactly **1** FREE_ONCE batch and **1** GRANT entry (previously: 2 batches, orphaned); reconciliation asserts **zero** `LEDGER_BATCH_MISMATCH` and `healthy === true` — a strictly stronger assertion than the old detection pin.
- **Case 4a — NEW (6 checks), reservation CAS rejection:** two snapshots each reserve 80 against a balance of 100 (grant made via `withLedger`; deliberately distinct operation/reservation keys so the content-CAS is the only rejection path). First flush succeeds; second is rejected with `LEDGER_CONFLICT`. Final state: exactly one RESERVED operation backed by an 80-credit allocation, exactly 1 RESERVE ledger entry, batch `reservedAmount 80 / remainingAmount 20`, batch invariant holds, reconciliation healthy. No unbacked reservation, no partial ledger state.
- **Case 4b (2 NOT RUN → 4 checks), double settle preserved:** the original cross-snapshot double-settle scenario is retained; the second flush is now wrapped and asserted **rejected** (`LEDGER_CONFLICT`); final state has exactly **1** CONSUME entry with `consumedAmount === 80`, and reconciliation is healthy.
- Cases 1, 5–20 and the mixed-lifecycle invariant sequence are untouched. Total checks grew **60 → 71**; nothing was skipped, slept on, or weakened.

One measured nuance, recorded as a comment in the test: reconciliation of operations produced by a flush must be evaluated against wall-clock `Date.now()` (the repository stamps `created_at` from the wall clock — the same pattern as the `healthy()` helper in the Sprint 3 concurrency suite); evaluating against the suite's fixed epoch T0 would falsely flag a legitimate RESERVED operation as STUCK.

## 3. Regression guarantees now pinned

1. Idempotency keys are payload-bound: reuse with different financial data is an explicit conflict, never a silent duplicate and never a second grant.
2. A stale snapshot flush is rejected **before** partial persistence (both rejection codes exercised: `UNIQUE_VIOLATION`, `LEDGER_CONFLICT`).
3. Concurrent FREE_ONCE grants converge to exactly one batch + one GRANT entry.
4. Concurrent reservations over a limited balance converge to at most one backed reservation; the loser leaves no trace.
5. Concurrent settlements of one reservation converge to exactly one CONSUME entry.
6. After every repaired race, `creditReconciliation` reports the account **healthy** — while Cases 15/16/17 still prove it detects real corruption (invariant break, ledger/batch mismatch, paid order without grant, stuck reservation).

## 4. Exact results (this sprint, each run individually from the repo root)

| Suite | Command | Result |
|---|---|---|
| creditInvariantAdversarial | `npx --yes tsx src/test/creditInvariantAdversarial.test.ts` | **71 PASS / 0 FAIL** |
| creditConcurrencySprint3 | `npx --yes tsx src/test/creditConcurrencySprint3.test.ts` | 52 PASS / 0 FAIL |
| pricingPolicy | `npx --yes tsx src/test/pricingPolicy.test.ts` | 33 PASS / 0 FAIL |
| featureBillingMatrix | `npx --yes tsx src/test/featureBillingMatrix.test.ts` | 87 PASS / 0 FAIL |
| creditReconciliation | `npx --yes tsx src/test/creditReconciliation.test.ts` | 23 PASS / 0 FAIL |
| unifiedCreditLifecycle | `npx --yes tsx src/test/unifiedCreditLifecycle.test.ts` | 31 PASS / 0 FAIL |
| ai-metering | `npx --yes tsx src/test/ai-metering.test.ts` | 83 PASS / 0 FAIL |
| deterministic-free-metering | `npx --yes tsx src/test/deterministic-free-metering.test.ts` | 94 PASS / 0 FAIL |
| dedBillingCompat | `npx --yes tsx src/test/dedBillingCompat.test.ts` | 42 PASS / 0 FAIL |

No assertion failed because implementation behaviour deviated from the Sprint 3 contract, so no expectation was forced and no implementation file was modified by this phase (`billingStore.js` / `creditLedger.js` were read only; their working-tree modifications predate this sprint — Sprint 3's own).
