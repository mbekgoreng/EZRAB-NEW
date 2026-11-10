# EZRAB — Unified Credits Sprint 4: Chat FAST First Gated Integration

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896`
- **Scope:** exactly ONE feature — **Chat FAST** — integrated through the shared metering boundary (`api/_lib/aiMetering.js`, Sprint 3). Gate `AI_METERING_ENABLED` remains **OFF** everywhere persistent. No other feature was integrated. No production caller passes a metering context today, so live behaviour is unchanged by construction.
- **Result:** integration complete and dormant; gate-OFF parity and gate-ON mocked behaviour proven by `src/test/chatFastMetering.test.ts` — **114 PASS / 0 FAIL**.

---

## 1. Integration file and exact insertion point

**Why not `executeAI` mode `'fast'`:** tracing the real request lifecycle showed wrapping mode `'fast'` inside `executeAI` would be wrong twice over — (a) real Chat FAST traffic flows as mode `'chat'` (both Chat AI handlers map it there), and (b) the `'fast'` chain is shared with DED_AI_FAST / DOKUMEN_AI, which would have been metered by mistake. `executeAI` was therefore not modified at all.

**Chosen insertion point:** `handleAiRequest` in `api/_lib/aiGateway.js`, step 6 — the only point that simultaneously has the authenticated context, the server-mapped mode, and the validated `productId`. The change is +65/−1 lines in 3 hunks: the import (line 41), the `opts` documentation (lines 620–624), and block **6a** (lines 758–816) replacing the single previous `executeAI` call (formerly line 752). The boundary and context are taken **only** from `opts.meteringContext` / `opts.meteringBoundary`; no existing handler passes them, which is precisely why the integration is dormant in production.

**New adapter:** `api/_lib/chatFastMetering.js` — a deliberately narrow adapter:

- `deriveChatFastFeatureKey(...)` — server-side derivation only: mode `chat`, or mode `fast` with product `EZRAB_AI`, → canonical key **`chat-ai/fast`**. Advanced, vision, DED, Document, and generic traffic are out of scope and never reach the boundary.
- `runChatFastWithMetering(...)` — the gate-OFF bypass / gate-ON lifecycle runner (§2, §3).
- Reservation estimate computed server-side: `ceil(chars/4)` + the existing 1000-token output allowance (mirrors the established reservation-estimate convention; it is an estimate for reservation only, never a charge).

No parallel billing implementation was created: the adapter calls the existing Sprint 3 boundary, which calls the existing Gen-2 ledger. No localStorage debit, no flat one-credit path, no duplicated state machine.

## 2. Gate-OFF behaviour (the production state)

With `AI_METERING_ENABLED` absent, `'false'`, `'1'`, `'TRUE'`, or any invalid value (all tested — only the exact string `'true'` opens the gate):

- The adapter returns **before any metering check**; the boundary object is never touched (proven with a throwing boundary double and `_recordCount() === 0`).
- **Zero ledger writes:** operations, ledger entries, balance, and reserved amounts are byte-identical before/after (asserted in tests).
- **No simulation debit, no localStorage fallback, no hidden billing side effect**, and no claim that usage was charged.
- Ordinary Chat FAST requests are never rejected because billing is dormant.
- **Output parity:** with a deterministic mocked provider, the integrated path returns the identical result object as the original path (provider `gemini`, model `gemini-3.5-flash-lite`, same constructed prompt, same parsing), and at HTTP level the response structure `{success, content, model, provider, mode, requestId, durationMs}` is identical. Provider/model selection, parameters, error handling, and retry behaviour are inherited unchanged from the unmodified `executeAI`.

## 3. Gate-ON behaviour (isolated tests only, in-memory ledger)

Exercised only inside the test process with the flag set to `'true'` and the real in-memory Gen-2 ledger — never with real billing credentials, never persisted:

- **Ordering proven:** inside the executor, the reservation is already held (`reserved = 25`, operation status `RESERVED`); execution follows reservation; settlement follows execution.
- **Settlement from actual usage:** a 25-credit actual usage settles 25; partial usage settles the actual amount and releases the remainder.
- **Provider failure → full release:** the reservation is released in full and the balance is restored.
- **Missing/incomplete usage evidence → `REQUIRES_REVIEW`:** the reservation stays held; no token count is fabricated; no guessed charge is produced.
- **Fail-closed without context:** no metering context → `AUTH_CONTEXT_REQUIRED`; no boundary → `METERING_BOUNDARY_UNAVAILABLE`; in both cases the provider is called **zero** times (HTTP level: 401). An `accountId` is never fabricated from a `userId` — production activation still requires a workspace billing-account resolver, which is a documented dependency of the activation programme, not something this sprint invents.
- **Idempotent retry:** a retried operation yields exactly 1 operation and 1 debit; no duplicate settlement, no fabricated second result.

## 4. Metering contract & failure-path audit (Phase 4)

- **Server trust boundary:** 12 distinct client billing fields were submitted one by one and each was rejected (`CLIENT_BILLING_FIELDS_FORBIDDEN` contract of the boundary); a client-proposed `featureKey`/`credits` is ignored — the record keeps the server-derived `chat-ai/fast` and settles from actual usage. Debits can only land on the account carried by the server context. The adapter exports no settle/release/resolve surface, so a caller cannot claim a settlement or approve its own review through it; releasing a `REQUIRES_REVIEW` record through the automated path is rejected with `ILLEGAL_TRANSITION` (review resolution remains the ledger's authorised `resolveReview` path only). Missing authenticated identity fails safely (§3).
- **Lifecycle state machine:** the Sprint 3 machine (`aiMeteringLifecycle.js`) is enforced unchanged — it was not modified and not duplicated. Invalid post-settlement transitions produce **zero** additional ledger writes (asserted).
- **Evidence:** the v1.1 token policy is preserved exactly (1 credit = 200 weighted tokens; input/cached ×1; output ×3 INTERIM — see `pricingPolicy.js`). Unavailable provider usage is never estimated into "verified" usage; unknown usage routes to review on the gated path.
- **Deterministic-free operations:** all registered deterministic operations remain outside the debit lifecycle — 17 keys verified (11 matrix + 6 extended registry entries; covering the 15 Phase 2 deterministic operation rows). Their classification was not changed.

## 5. Test evidence

| Suite | Result |
|---|---|
| `src/test/chatFastMetering.test.ts` (NEW) | **114 PASS / 0 FAIL** |
| `src/test/ai-metering.test.ts` | 83 PASS / 0 FAIL |
| `src/test/deterministic-free-metering.test.ts` | 94 PASS / 0 FAIL |
| `src/test/creditConcurrencySprint3.test.ts` | 52 PASS / 0 FAIL |
| Gateway ChainOrder / F7 / ErrorClass / EnvBareKey | 14 / 21 / 7 / 6 PASS, 0 FAIL |
| Gateway Idempotency, DemoPolicy | PASS |
| `apiEndpointInventory` | 13 PASS / 0 FAIL — Vercel 12-function ceiling intact (the adapter lives in `api/_lib`, not an endpoint) |
| `src/test/featureBillingMatrix.test.ts` | 87 PASS / 0 FAIL |
| `src/test/dedBillingCompat.test.ts` | 42 PASS / 0 FAIL |

Commands: `npx --yes tsx src/test/<suite>.test.ts` from the repo root, each run individually. Global tsc/build were run once by the coordinator at sprint end on the combined worktree (see the Sprint 4 regression summary).

## 6. Deliberately untouched

`executeAI` and all provider chains; Chat ADVANCED, Magic AI, Magic AI RAB, DED, AI Document, receipt scan, drawing reader, SmartAdd, price research; `aiMetering.js` / `aiMeteringLifecycle.js` (read-only); `middleware.ts`; every DED file. A pre-edit backup of `aiGateway.js` was kept during the work and was not needed, because gate-OFF parity was proven in full.
