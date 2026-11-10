# UNIFIED CREDITS — SPRINT 3 CONCURRENCY REPORT

Status key used throughout: **VERIFIED FACT** (observed in code or by executed tests) ·
**IMPLEMENTED CHANGE** (made in this sprint) · **PROPOSED DESIGN** · **NOT RUNTIME VERIFIED** ·
**PENDING OWNER DECISION**.

Date: 2026-11-10 · Branch `integrasi/unified-ui-engine` · HEAD `99de892` (unchanged) ·
Scope: local, isolated, dormant. No commit, push, deploy, migration execution, or activation.

---

## 1. The two proven Phase 2 defects

**VERIFIED FACT (root cause, re-inspected this sprint).** The legacy
`billingStore.withLedger` path was: load a snapshot → mutate the in-memory domain →
flush. It had no lock, no compare-and-set, and no pre-write validation.
`flushLedgerSnapshot` wrote batches first with unconditional `UPDATE`s and ledger
entries last. Two consequences were proven deterministically in Phase 2:

- **Defect A — orphan batch.** Two concurrent FREE_ONCE grants read the same snapshot.
  The losing flush threw `UNIQUE_VIOLATION` *after* its batch row had already been
  persisted, leaving a batch with no matching `GRANT` ledger entry.
- **Defect B — unbacked reservation.** Two concurrent reservations of 80 against a
  balance of 100 both passed the availability check against stale snapshots; both
  reported success; only one was backed by persisted batch state.

## 2. Architecture decision

Options evaluated (per Sprint 3 Task 1): transactional SQL RPCs, row-level locking,
conditional updates, version-column CAS, unique idempotency constraints,
single-transaction ledger+batch writes.

**Decision (IMPLEMENTED CHANGE, local layer).** Harden the in-process path with:
per-account promise-chain serialization, pre-flush invariant validation, content-based
CAS against the loaded snapshot, and a compensated flush. **The transactional SQL RPC
layer (Task 2) remains the authoritative contract for cross-instance safety.**

**Explicit non-claim.** A JavaScript in-process serialization chain does **not** solve
distributed concurrency across multiple serverless instances, and snapshot-read →
mutate → flush is **not** claimed to be transaction-safe. What is proven by tests is
single-instance, in-process atomicity on the InMemory adapter. The Supabase adapter
executes the same flush/preflight/compensation code but was **NOT RUNTIME VERIFIED**.
PostgREST-level compensation is not a database transaction.

## 3. Implemented changes

### `api/_lib/billingStore.js`
1. `withLedger` is wrapped in a per-`accountId` promise chain. Acquisition is
   synchronous at call time, so queue order equals call order (deterministic).
   Documented in the file header as non-reentrant and not cross-process.
2. `preflightFlush` runs **before any write**: batch invariant check (safe integers;
   `granted = remaining + reserved + consumed + expired`), detection of duplicate new
   entry keys inside the mutation, collision of new keys with persisted rows outside
   the snapshot (`UNIQUE_VIOLATION` raised pre-write), FREE_ONCE collision, and a
   **content-based CAS**: any persisted entity the flush intends to change must still
   be identical to its state at snapshot load, otherwise `LEDGER_CONFLICT` is raised
   pre-write.
3. Compensated flush: inserts/updates are journaled; a mid-flush failure deletes the
   inserts and restores the updated rows (new `delete*Row` repository methods on the
   InMemory and Supabase adapters, used only for the flush's own compensation).

### `api/_lib/creditLedger.js`
1. `idemGet` now compares the recorded financial payload. Same key + same payload →
   idempotent replay (`duplicate: true`). Same key + different payload →
   `{ ok: false, error: 'IDEMPOTENCY_CONFLICT' }`. Applied to all grant types,
   `createOperation`, `reserve`, `settle`, `release`, `resolveReview`, and the
   FREE_ONCE correction path.
2. `resolveReview` APPROVED path: pre-mutation snapshot plus a post-loop overage
   assertion (the domain-level counterpart of SQL fix F-10). Assertion failure
   restores batches and journal — no partial approvals.

Public module APIs are unchanged (same signatures; new error values only on conflict
paths that previously returned silently wrong results).

## 4. Concurrency proof

Suite: `src/test/creditConcurrencySprint3.test.ts`
Command: `npx --yes tsx src/test/creditConcurrencySprint3.test.ts`
Result: **52 PASS / 0 FAIL**.

Determinism method: explicit deferred gates at the repository load boundary —
controlled interleavings, **not** arbitrary sleeps. Every scenario verifies final
batch state, final ledger entries, the financial invariant, operation status,
idempotency outcome, and a `healthy` reconciliation result.

| # | Scenario | Outcome (VERIFIED by executed test) |
|---|---|---|
| 1 | Two concurrent FREE_ONCE grants (Phase 2 Defect A regression) | Exactly 1 batch + 1 `GRANT`; second caller receives `duplicate` |
| 1b | Manual stale-snapshot flush at repository level | Rejected pre-write with `UNIQUE_VIOLATION`; final state stays 1 batch + 1 entry (no orphan) |
| 2 | Two concurrent bonus grants, same idempotency key | Exactly 1 grant |
| 3 | Reservations 80 + 80 vs balance 100 (Phase 2 Defect B regression) | Exactly one succeeds; loser `INSUFFICIENT_BALANCE`; persisted `reserved` = 80 |
| 4 | Concurrent reservations spanning 3 batches | Winner allocates SUBSCRIPTION 50 + BONUS 50 (locked Phase 5.1 order); TOP_UP untouched |
| 5 | Concurrent settle + release | Settle wins; release rejected `INVALID_STATE`; consumption recorded once (60) |
| 6 | Expiration vs reservation, both orders | Serialized valid results in both orders; reserved amounts never expire |
| 7 | Concurrent duplicate webhook grants (exact `billingService` top-up pattern 3,000 + 600 bonus) | Exactly 2 batches / 2 `GRANT`s; total 3,600 |
| 8 | Concurrent duplicate settlement | Consumed once (120) |
| 9 | Simulated mid-flush failure (entry insert fails once) | **Zero partial state** (insert compensated); retry yields exactly 1 grant |
| 10 | Same idempotency key, different financial payload | Explicit `IDEMPOTENCY_CONFLICT` (grant and `createOperation`); same payload still replays legitimately |

## 5. Scope of proof — read this before citing the results

- **Proven:** single-process Node atomicity on the InMemory adapter, including
  failure compensation and reconciliation detection.
- **Not proven:** cross-instance/serverless concurrency; Supabase adapter runtime
  behavior. Both depend on the transactional RPC layer being executed against a real
  database — see `UNIFIED_CREDITS_SPRINT_3_SQL_VALIDATION.md` (status
  **NOT RUNTIME VERIFIED**: no local PostgreSQL exists on this machine).
- Reconciliation remains the current safety net for any divergence the in-process
  layer cannot prevent in a distributed deployment.
