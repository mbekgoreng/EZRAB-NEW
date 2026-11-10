# UNIFIED AI METERING — SPRINT 3 IMPLEMENTATION

Status key: **VERIFIED FACT** · **IMPLEMENTED CHANGE** · **PROPOSED DESIGN** ·
**NOT RUNTIME VERIFIED** · **PENDING OWNER DECISION**.
Date: 2026-11-10 · HEAD `99de892` (unchanged) · All work local and dormant.

## 1. What exists in production today (VERIFIED FACT)

Transport: browser `providerClient.ts → POST /api/ai/tools/execute → aiGateway.js`;
a second transport `POST /api/ai/multi-provider/execute` (ded-rab v2/v3,
aiProviderRouter); the legacy Node `server/` path. The gateway's step-6b meter is
`createUsageMeter(null)` — usage evidence is discarded. `api/credits/usage.js` also
constructs `createUsageMeter(null)` behind the `CREDITS_DB_CONFIGURED` gate and
always returns `[]`/503. **No production caller invokes reserve/settle/release on
the Gen-2 ledger.** Re-classification of the 40 operations from Phase 2, re-verified
against current code:

| Class | Count | Notes |
|---|---|---|
| `AI_METERED` (simulation debit exists) | 6 | Chat FAST, Chat ADVANCED (same formula; tiers not distinguished), DED simple/medium/complex (flat 500/650/800 up front, consume result ignored), Document analysis (flat max, after success, result ignored) |
| `NOT_WIRED` | 16 | Magic Co-Assistant, Magic AI RAB, ded-rab v2 pipeline, DED Full AI, DED revision (orphan tariff), Document QA/Create/Revision/Enhance/Translate/Review/Scope, receipt scan (**endpoint does not exist**), AI price synthesis, drawing reader, SmartAdd |
| `DETERMINISTIC_FREE` | 15 | Volume/QTO, RAB arithmetic, AHSP lookup & matching, local price resolution, recalculation, PDF/Excel export, project open/edit, local document review, plain-text parsing, local RAB review as shipped, post-OCR master price matching, Chat's deterministic tool-execution leg |
| `REQUIRES_REVIEW` (classification) | 3 | Serper leg (paid per search, not per token), legacy `server/` stack (flat 1 credit over sample data), Node aiProviderRouter path (bypasses the gateway) |

## 2. Implemented: the shared metering boundary (IMPLEMENTED CHANGE, dormant)

New files — a reusable server-side wrapper around the existing Gen-2 ledger. No
duplicate data model; the wrapper record carries `operationId`, `accountId`,
`workspaceId`, `userId`, `featureKey`, `provider`, `model`, `tariffVersion`
(`2026-11-02.1`), `pricingPolicyVersion` (v1.1), `idempotencyKey`, `reservationId`
(= the ledger operation id — Gen-2 models a reservation inside the operation plus
its allocations; recorded explicitly), `status`, per-call accumulated
`usageEvidence`, `estimatedCredits`, `settledCredits`, and full timestamps.

- `api/_lib/aiMeteringLifecycle.js` — pure state machine.
- `api/_lib/aiMetering.js` — `createAiMeteringBoundary({ ledger, env, now,
  pricingPolicyVersion })` with a staged API (`beginOperation`, `markExecuting`,
  `recordUsageEvidence`, `markSucceeded`, `settleCredits`, `releaseCredits`,
  `flagForReview`) and a one-shot `runMeteredOperation` wrapper.

### State machine (enforced in code, proven by tests)

`CREATED → RESERVED → EXECUTING → SUCCEEDED → SETTLED | RELEASED |
REQUIRES_REVIEW | FAILED`. EXECUTING/SUCCEEDED are wrapper-transient (the ledger
operation remains RESERVED). Every illegal transition is rejected with
`ILLEGAL_TRANSITION` and no mutation: settlement after release, release after
settlement, duplicate terminal transitions, execution before a successful
reservation, settlement before SUCCEEDED, and settle/release out of
REQUIRES_REVIEW (review bypass — resolution is only via the authorized
`ledger.resolveReview`).

### Security contract (enforced, proven by tests)

- `featureKey` is derived server-side: an explicit registry-validated key, or
  `resolveGatewayFeature(productId, serverParams)`.
- Client-supplied billing fields in the payload (`accountId`, tokens, credits,
  `tariffVersion`, provider, model, prices, …) are rejected with
  `CLIENT_BILLING_FIELDS_FORBIDDEN`.
- `accountId` is accepted only from an abstract authenticated `context` argument
  (incomplete context → `AUTH_CONTEXT_REQUIRED`). The module is **not** wired to
  any real auth system.
- Idempotency keys are format-validated (regex) and scoped per account.
- Usage evidence is a structured server-side execution result. Missing or
  incomplete evidence → `REQUIRES_REVIEW`: the reservation is held, no fabricated
  charge, no partial debit.
- Unknown tariff/policy → `REQUIRES_REVIEW`, or `UNKNOWN_POLICY` at begin
  (test-proven: zero consumption).
- Provider/internal failure → full release. Unknown feature → `UNKNOWN_FEATURE`,
  fail-closed. No localStorage value can authorize anything; there is no demo
  bypass.

### Feature gate (VERIFIED by tests)

`AI_METERING_ENABLED` must be exactly `'true'`; default is off. With the gate off,
`beginOperation` is rejected with `AI_METERING_DISABLED` (fail-closed), **zero**
wrapper records are created, **zero** new ledger entries appear, and balances are
identical — there is no fallback to simulation or localStorage. Grep-verified:
the new modules have **zero production importers** (tests only).

## 3. Phase 2 contract defects closed at the boundary

1. **Missing feature keys (R-3).** `GATEWAY_PRODUCT_FEATURE_MAP` +
   `resolveGatewayFeature` map `DED_AI_*` + server-side complexity to
   `ded-ai/simple|medium|complex`, and `DOKUMEN_AI` + category to the canonical
   `ai-document/analysis` with `pricingFeatureKey ai-document/simple|complex`.
   Tests prove those pricing keys actually exist in `EZRAB_DRAFT_TARIFFS`, while
   the bare keys `'ded-ai'` / `'ai-document'` do not; bare keys are rejected with
   `LEGACY_AMBIGUOUS_FEATURE_KEY`. Features missing from the matrix (SmartAdd,
   document review/scope, ded-rab pipeline) are registered in
   `EXTENDED_FEATURE_REGISTRY` inside `aiMetering.js` as dormant data.
   `featureBillingMatrix.js` was **not** modified (md5
   `e0413f9ee8b53efc954e4df55fb63b38`, identical to the Phase 1 snapshot) — a
   minimal edit was not proven necessary.
2. **`approvedMaxCredits` silently discarded (R-4).** The new contract rejects
   explicitly: invalid cap → `INVALID_APPROVED_MAX`; estimate above cap →
   `ESTIMATE_EXCEEDS_APPROVED_MAX` with both numbers reported, before any
   operation is created (tested at the boundary and in the DED adapter).
3. **Receipt scan.** The registry entry is marked
   `transportStatus: 'MISSING_ENDPOINT'`; operations are rejected with
   `TRANSPORT_UNAVAILABLE` instead of being metered through a phantom transport.
   Owner decision stands: build the endpoint inside the boundary, or retire the
   feature.

## 4. Deterministic-free guarantee (Task 4 — IMPLEMENTED + PROVEN)

Suite `src/test/deterministic-free-metering.test.ts` — **94 PASS / 0 FAIL**.
For each of 17 deterministic keys (the 11 matrix §7 keys plus `qto-calculation`,
`unit-conversion`, `local-validation`, `document-parsing`,
`master-price-matching`, `rab-review-local`): `beginOperation` is rejected with
`DETERMINISTIC_FREE_NOT_METERABLE` — enforcement lives in the boundary, not only
in tests; `runDeterministic` executes the local function with identical results;
and there are **zero operations, zero reservations, zero ledger entries, and
untouched balances**, including with the gate off. AI features are symmetrically
rejected from the deterministic path. A mixed two-stage feature is modeled:
local parsing + QTO (zero operations) → AI analysis (exactly one operation,
settled at 25 from actual usage, not the flat 250 estimate).

## 5. DED compatibility adapter (Task 5 — IMPLEMENTED as adapter only)

New file `api/_lib/dedBillingAdapter.js` — zero imports from or into DED code.
Contract: `DED_FLAT_RESERVATION_CREDITS { simple: 500, medium: 650, complex: 800 }`
marked **DRAFT**, cross-referenced and **test-asserted equal** to
`creditPricing.js` `EZRAB_DRAFT_TARIFFS` (and `src/ai-credits/config.ts`). The flat
value is a maximum reservation ceiling only — never a final charge. Aggregation
choice (documented): **one operation per DED batch/run**, with the aggregate
estimate equal to the category flat (not per file), preserving the simplicity of
the current shape while changing its meaning to a reservation settled from the
accumulated usage of all files.

Suite `src/test/dedBillingCompat.test.ts` — **42 PASS / 0 FAIL** (deterministic
mock executors): multi-file (3 medium files → 1 operation, settle 75, release 575,
flat ≠ final) · partial failure before provider (settle 50 from 2 files) ·
partial failure with unknown usage → review · full workflow failure → full release
of 800, balance restored · timeout with no result → full release; timeout with
partial result → review · unknown usage → review · actual < reservation → partial
settle + release of remainder · actual > reservation (700 vs 500) → overage 200 to
the ledger review queue (PENDING), zero automatic consumption · retry with the
same key → 1 operation, executor not re-run, single debit · terminal settle↔release
conflict → both rejected · insufficient balance → `INSUFFICIENT_BALANCE` and the
**executor is never invoked** (the inverse of today's DED behavior).

**Unchanged, by design:** all DED output, price provenance, inferred-quantity
labels, AHSP integrity, and DED review behavior. Real integration into the DED
pipeline is follow-up work that waits for the parallel DED Final Hardening
programme to finish; the dependency is recorded in the adapter's file header.

## 6. Deliberately not integrated (PROPOSED DESIGN / remaining work)

Feature integration stopped at the wrapper + tests, deliberately. The only correct
representative integration point is `aiGateway.js` / `security.js` — outside this
sprint's write territory, and touching it risks changing live behavior. Remaining
integration sequence (Phase 2 §8, still valid): gateway (classify → estimate →
create/reserve → execute → record → settle/release) → `tools/execute` + `chat` +
`multi-provider` → persistent usage → co-assistant → DED (coordinated with the DED
programme) → documents → receipt/price-search/drawing/SmartAdd → Node router and
legacy `server/` (owner decision: converge or retire). Activation of any of this
additionally requires a trusted authenticated account context — **PENDING** on the
separate auth programme (`AUTH_ENABLED` remains `false`).
