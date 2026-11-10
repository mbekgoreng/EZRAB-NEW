# Unified AI Billing Integration — Design (Phase 2, Phases D + H)

| Field | Value |
|---|---|
| Status | **DESIGN ONLY — dormant. Nothing in this document is wired, activated, or deployed.** |
| Date | 2026-11-10 |
| Repo / branch | `ezrab-unified`, `integrasi/unified-ui-engine`, HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896` |
| Builds on | Phase 1 merged report (`EZRAB-LAPORAN-CREDITS-AI.md`, esp. §§2.5, 3.5, 3.6, 6, 7) and the Phase 1 dormant foundation: `api/_lib/pricingPolicy.js`, `api/_lib/featureBillingMatrix.js`, `api/_lib/creditReconciliation.js`, `supabase/migrations/20261110_unified_credits_foundation.sql` (archived, **not executed**) |
| Companion document | `docs/audits/AI_PROVIDER_TARIFF_READINESS.md` (Phase E) |

> **Fence statement.** This phase produced documentation only. No code was changed, no
> SQL was executed, no environment variable or Supabase setting was touched,
> `middleware.ts` was not modified, `AUTH_ENABLED` was not changed, and no billing,
> Midtrans, or metering integration was activated. DED source files were read
> read-only (a parallel DED program owns them). Every "future change" in §8 is a
> proposal that requires its own owner grant.

---

## 1. Executive summary

EZRAB still runs **three credit generations side by side** (Phase 1 finding, re-verified
against the current tree):

1. **Gen-1** — bucket ledger per user in `api/_lib/creditEngine.js`; dormant, in-memory placeholder.
2. **Gen-2 (canonical)** — batch ledger per account in `api/_lib/creditLedger.js` +
   `creditAllocation.js` + `tariffRegistry.js` + `billingStore.js` + `billingService.js`.
   Complete and tested, but it has **no production caller** for `reserve`/`settle`.
3. **Frontend simulation** — `src/ai-credits/` (localStorage key `ezrab-credit-sim-v1`).
   This is the only "billing" a user experiences today, and it is fully client-side and
   therefore manipulable. A fourth, legacy system lives in `server/` (flat 1 credit per
   operation against hardcoded sample subscription data, `server/orchestrator/aiOrchestrator.ts:367–387`).

The design in this document funnels **every** paid-provider operation through **one**
server-side metering boundary built on the Gen-2 ledger:

```
createOperation → reserve → execute → record evidence → settle OR release
```

with `REQUIRES_REVIEW` as the terminal state whenever usage evidence is missing,
unparseable, or larger than the reservation (the ledger already enforces this:
`settle` returns `USAGE_MISSING` without evidence and `UNKNOWN_TARIFF` for unpriced
tariffs, and routes over-reservation actuals to `openReview` with no partial debit).

### Classification totals (operation-level audit, §4)

| Classification | Count | Meaning |
|---|---:|---|
| `AI_METERED` | 6 feature keys | Paid-provider operations that belong inside the boundary and already have at least a client-simulation debit path today. **None is server-authoritative.** |
| `NOT_WIRED` | 16 operations | A paid provider is reachable and **no debit of any kind** occurs (server or simulation). |
| `DETERMINISTIC_FREE` | 15 operations | No paid provider is called; must remain free and must never create a credit operation. |
| `REQUIRES_REVIEW` | 3 operations | Cannot be classified safely yet (non-token paid API, legacy stack, or a transport that bypasses the browser gateway). |
| **Total** | **40 operation rows** | |

The single most important structural fact: the AI gateway (`api/_lib/aiGateway.js`)
already contains a usage-meter hook (step 6b), but it is constructed as
`createUsageMeter(null)`. With a `null` adapter, `usageMeter.record()` computes and
then **discards** the entry — nothing is persisted, and `api/credits/usage.js` returns
an empty list by construction (`createUsageMeter(null)` → `getUsage()` → `[]`), behind
a `CREDITS_DB_CONFIGURED === 'true'` gate that currently answers 503. Provider usage
evidence therefore exists transiently inside the gateway and is thrown away on every
request. The boundary design in §5 is mostly about stopping that discard and wrapping
execution in a reservation.

---

## 2. Current-state evidence (what exists today)

### 2.1 The canonical ledger already implements the required state machine

`api/_lib/creditLedger.js` (read at lines ~341–620) provides exactly the primitives the
boundary needs; no redesign of the ledger is proposed:

- `createOperation` — idempotent on `(accountId, idempotencyKey)`; validates the account
  and a non-negative integer estimate.
- `reserve` — all-or-nothing allocation using `resolveAllocationOrder`
  (`api/_lib/creditAllocation.js`, policy status `CONFIRMED_OWNER_PHASE_5_1`:
  Subscription earliest-expiry → Bonus/FREE_ONCE finite-expiry-first → Top-up FIFO).
  Insufficient balance returns `INSUFFICIENT_BALANCE` with **no partial allocation**.
- `settle` — requires an integer `actualCredits` (`INVALID_USAGE` otherwise), requires
  usage evidence (`USAGE_MISSING`), requires a tariff version known to the registry
  (`UNKNOWN_TARIFF`). Actual ≤ reserved: consumes the actual amount and releases the
  remainder to the origin batches (or writes it off as `EXPIRATION` if a batch expired).
  Actual > reserved: returns `REQUIRES_REVIEW` and opens a review record — **no partial
  debit, no negative balance**. Re-settle is idempotent.
- `release` — full release of a reservation; idempotent.
- Operation statuses: `CREATED / RESERVED / SETTLED / RELEASED / FAILED / REQUIRES_REVIEW / REVERSED`.

Authorization for review resolution already exists in `api/_lib/billingAuthorization.js`
(roles `SUPER_ADMIN / ESTIMATOR / DIREKSI / CLIENT / EDITOR`; permissions
`billing:read | billing:use | billing:review:resolve`; resolving a review requires an
explicit `billing_admin = true` flag plus an ACTIVE membership).

### 2.2 Pricing policy (locked, Phase 1)

`api/_lib/pricingPolicy.js`:

- Policy `v1.1-token-metering` (`LOCKED_OWNER`): **1 credit = 200 weighted tokens**;
  input ×1, cached input ×1, output ×3 marked `interim: true` (mode
  `PROVIDER_PRICE_RATIO`, interim value 3); minimum 1 credit per operation;
  `creditsForTokenUsage` rounds **up** and fails with `USAGE_UNAVAILABLE` /
  `UNKNOWN_POLICY` instead of guessing.
- Policy `margin-formula-proposal` (`PENDING_OWNER_DECISION`): all four commercial
  parameters are `null` — `creditValueIdr`, `costMultiplierMilli`,
  `targetGrossMarginBps`, `fxIdrPerUsd`. `evaluateMarginPrice` returns
  `PENDING_CONFIGURATION` with the missing parameter list and **never a number**.
  This design does not activate it. See the companion tariff audit for why no measured
  gross margin can be claimed while these remain unknown.

### 2.3 The feature matrix (Phase 1) vs. this audit

`api/_lib/featureBillingMatrix.js` defines 19 `AI_METERED` and 11 `DETERMINISTIC_FREE`
entries, with two properties this design deliberately inherits:

- `classifyFeature` returns `null` for an unknown feature ID, and `chargeDecision`
  fails closed for unknown IDs: `{ chargeable: false, error: 'UNKNOWN_FEATURE' }`.
  Unknown features are **never** treated as free-by-default and never auto-debited.
- Classification (what an operation *is*) is kept separate from wiring status (what
  happens *today*): `WIRED_SIMULATION`, `WIRED_SIMULATION_PARTIAL`, `NOT_WIRED`.

This audit extends the matrix in three ways: it splits several matrix entries into
their real operation rows (§4), it adds operations the matrix does not contain
(SmartAdd, Document review/scope actions, the ded-rab-v2 transport, the Serper search
leg, the legacy `server/` stack), and it corrects one matrix entry against shipped
behavior (RAB review, §4 note R-1).

### 2.4 Transports that reach a paid provider today

| Transport | Path | Who uses it | Metering today |
|---|---|---|---|
| Browser AI gateway | `src/ai-tools/providerClient.ts` → `POST /api/ai/tools/execute` → `api/_lib/aiGateway.js` | Chat AI, Co-Assistant, DED AI Estimate, DED Full AI, AI Document, SmartAdd, AI price-estimate synthesis | Gateway meter hook present but adapter is `null` (evidence discarded) |
| Multi-provider endpoint | `POST /api/ai/multi-provider/execute` → same gateway | `aiProviderRouter` (browser path), ded-rab-v2 `zyrouterClient`, ded-rab-v3 `aiProviderClient` (Magic AI RAB, drawing/source reading, price search service, DED→RAB pipeline) | None |
| Chat endpoint | `api/ai/chat.js` (forces mode `chat`) → gateway | Legacy/simple chat callers | None |
| Node/server adapters | `server/providers/multiProvider/adapters` via `providerClient.ts` Node path; `aiCostRouter` via `aiProviderRouter` Node path | Non-browser execution contexts | None; cost routing uses the **unverified** client registry estimates (companion audit, §3) |
| Legacy `server/` API | `src/services/aiApiClient.ts` → `server/` (`/chat`, `/actions/confirm`, `/api/assistant/wizard/*`) | Wizard / quick-action flows (`quickActionService.ts`) | Rogue flat 1-credit system on sample data |
| Missing endpoint | `src/services/aiReceiptIntelligence.ts:256` → `POST /api/ai/receipt/scan` | Receipt Reader (Magic AI) | **No such endpoint exists under `api/`** — the call fails today (honest error; mock only via an explicit test opt-in) |

Server-side model selection for the browser gateway is **not** client-controlled:
`api/ai/tools/execute.js` maps `productId` → mode (`DED_AI_DETAIL` → `advanced`;
`EZRAB_AI` → `chat`/`advanced` by request; everything else → `fast`), and the gateway
walks a provider chain per mode (see the companion audit, §5, for the current chain
composition and how it changed since Phase 1). The client model registry
(`src/ai-tools/aiModelRegistry.ts`) is **not authoritative** for the browser path — the
gateway ignores its `target.model`; it only matters on the Node path.

### 2.5 The simulation layer (what users experience today)

`src/ai-credits/` mirrors the draft tariffs client-side:

- `config.ts` — tariff mirror (chat ranges, document simple/complex, DED flat
  500/650/800, `ded-ai/revision` 100–300) and a top-up offer (Rp5.000 → 3,000 credits
  + 20% bonus). **All figures are draft/simulation values, not activated prices.**
- `tokenMetering.ts` — v1.1 client mirror (200 weighted tokens/credit, output weight 3,
  ±4 chars/token estimate, reservation output allowance 1,000 tokens). Its header
  honestly states that real provider tokens never reach the client.
- `mockAdapter.ts` — localStorage ledger. `mockConsume` enforces plan gate, integer
  amounts, `jobReference` idempotency, and balance. Note the simulation's consumption
  order is **bonus → top-up → subscription**, which **differs** from the server's
  Phase 5.1 order (subscription first) — the open D7 conflict from Phase 1 §6.
- `featureGate.ts` — plan gate from `src/billing/plans.ts` entitlements; Free = Chat AI
  only (Amendment v1.2), AI Document locked for Free and Starter.

Two simulation behaviors matter for the boundary design: several callers **ignore
`mockConsume`'s boolean result** (DED start, Document analysis), so even the simulation
does not reliably stop work when a debit fails; and the gateway never returns usage to
the client, so every client-side token figure is an estimate by construction.

---

## 3. Classification method

Each operation row in §4 receives exactly one primary classification:

- **`AI_METERED`** — the operation calls (or is designed to call) a paid external
  provider and belongs inside the metering boundary; it already has at least a
  simulation debit path today. "Metered" describes its classification, **not** a claim
  that server-side charging works — it does not, for any row.
- **`NOT_WIRED`** — the operation calls a paid external provider and has **no** debit
  path at all today (neither server nor simulation). These are unbilled paid usage.
- **`DETERMINISTIC_FREE`** — the operation performs no paid provider call (pure local
  computation, lookup, parsing, or arithmetic). It must remain free, and the boundary
  must be constructed so it can never accidentally create a credit operation.
- **`REQUIRES_REVIEW`** — the operation's cost model or reachability cannot be
  established from code evidence alone (paid non-token API, legacy stack, unverified
  live reachability). It must not be silently classified as free or as metered.
  (This is a *classification* state, distinct from the ledger's `REQUIRES_REVIEW`
  *settlement* state for operations with missing/over-reservation usage.)

Wiring status is reported separately in the table so the document never overstates
what works today.


---

## 4. Feature-by-feature integration table

Evidence abbreviations: GW = `api/_lib/aiGateway.js`; PC = `src/ai-tools/providerClient.ts`
(→ `POST /api/ai/tools/execute`); MP = `POST /api/ai/multi-provider/execute`.

### 4.1 `AI_METERED` — inside the boundary design; simulation-only debit today (6)

| # | Operation (feature key) | Entry points | Provider call today | Debit behavior today | Boundary action (future) |
|---|---|---|---|---|---|
| 1 | Chat AI — standard reply (`chat-ai/fast`) | `src/ai-tools/ezrab-ai/service.ts` (one PC execute per send, `productId: EZRAB_AI`); debit in `view.tsx` ~1048–1080 via `chatCreditDebit.ts` | GW chat/fast chain | Debited **only on success**, single gate; amount from **client-estimated** tokens (`meterTexts`); consume result shown as label only when charged; stale (superseded) replies not debited | Reserve by server token estimate; settle from gateway-recorded usage under v1.1 |
| 2 | Chat AI — advanced reply (`chat-ai/advanced`) | Same path, mode `advanced` | GW advanced chain | Same formula as FAST — **tariffs are not differentiated** despite different chains/costs | Same as #1; FAST/ADVANCED differentiation is an owner tariff decision, not assumed here |
| 3 | DED AI Estimate — simple (`ded-ai/simple`) | `src/ai-tools/ded-ai-estimate/` (`DedAiInputView.tsx`, `service.ts`) | GW via PC, one execute **per page-group pass** (FAST `maxTokens` 16000 / DETAIL 24000) | Flat draft 500, **debited before analysis starts**; result ignored (see §6) | Flat value retained **only** as maximum reservation estimate; settle actual usage (§6.2) |
| 4 | DED AI Estimate — medium (`ded-ai/medium`) | Same | Same | Flat draft 650, same behavior | Same as #3 |
| 5 | DED AI Estimate — complex (`ded-ai/complex`) | Same | Same | Flat draft 800, same behavior | Same as #3 |
| 6 | AI Document — analysis run (`ai-document/analysis`) | `src/components/DocAnalyzer.tsx` tabs summary/extract/compare/checklist → `src/ai-tools/document-ai/service.ts` (`productId: DOKUMEN_AI`); SUMMARY is chunked: multiple executes + a synthesis execute | GW via PC | Flat at category **maximum** (simple 100 / complex 250 from the draft config), debited **after success**, consume result **ignored**; charged amount does not vary with chunk count | One operation per run; all chunk/synthesis calls recorded as evidence under the same operation key; settle actual |

### 4.2 `NOT_WIRED` — paid provider reachable, no debit of any kind (16)

| # | Operation (feature key) | Entry points | Provider call today | Evidence |
|---|---|---|---|---|
| 7 | Magic AI Co-Assistant (`magic-ai/co-assistant`) — chatbox **and** FullView copilot surfaces | `src/services/coAssistantService.ts` ~355–374; callers `EzrabCoAssistantChatbox.tsx`, `EzrabAiAssistantFullView.tsx` | GW chat chain via PC (`productId: EZRAB_AI`) | Grep-verified: **no** consume/credit code anywhere in `coAssistantService.ts`. Full bypass (Phase 1 confirmed) |
| 8 | Magic AI RAB — AI estimate pipeline (`magic-ai-rab`) | `src/ai-estimate/aiEstimatePipeline.ts`, invoked from `DedAnalysisDashboard.tsx:225`; uses ded-rab-v3 client `executeChat` | MP endpoint | No debit anywhere in the pipeline |
| 9 | DED-RAB v2 pipeline calls (no matrix key) | `src/ded-rab-v2/ai/zyrouterClient.ts`; importers incl. `DedRabWorkflowView.tsx`, `DedAiSplitAnalysisView.tsx`, `src/services/dedToRabPipelineService.ts` | MP endpoint, modes `vision`/`advanced` | Second, independent DED transport beside `ded-ai-estimate`; no debit. (Read-only inspection; files owned by the parallel DED program) |
| 10 | DED Full AI (`ded-ai/full-ai`) | `src/ai-tools/ded-full-ai/service.ts:249–251` | GW via PC, same `productIds` as standard DED | Single execute per run observed; no debit; Full-AI vs Database policy does not affect any tariff |
| 11 | DED revision (`ded-ai/revision`) | Tariff defined in `src/ai-credits/config.ts` (100–300) and `creditPricing.js` | — | **Orphan definition**: no production caller debits or invokes it as a billed operation |
| 12 | AI Document — interactive QA (`ai-document/qa`) | `DocAnalyzer.tsx` `askQuestion()` ~190 → document-ai service mode `QA` | GW via PC | **No consume call on the chat path** (Phase 1 claim re-verified; see note R-2) |
| 13 | AI Document — create / create report (`ai-document/create`) | `document-ai/orchestrator.ts` actions `CREATE_DOCUMENT` (mode `DRAFT`), `CREATE_REPORT`; `DocCreator` | GW via PC | No credit code in orchestrator/creator; package-UI gate only |
| 14 | AI Document — revision (`ai-document/revision`) | Orchestrator action `REVISE_DOCUMENT` | GW via PC | Returns a CANDIDATE, never applies it; no debit |
| 15 | AI Document — enhance (`ai-document/enhance`) | Orchestrator action `ENHANCE_TEXT` (mode `ENHANCE`; sends selection + minimal context) | GW via PC | No debit |
| 16 | AI Document — translate (`ai-document/translate`) | Orchestrator action `TRANSLATE_DOCUMENT` (mode `TRANSLATE`) | GW via PC | No debit |
| 17 | AI Document — review document (no matrix key) | Orchestrator action `REVIEW_DOCUMENT` | GW via PC | AI-backed review; distinct from the local review helpers in row 33. No debit |
| 18 | AI Document — extract construction scope (no matrix key) | Orchestrator action `EXTRACT_CONSTRUCTION_SCOPE` | GW via PC | No debit |
| 19 | Receipt scan (`ai-receipt/scan`) | `src/services/aiReceiptIntelligence.ts:256`; caller `ReceiptReaderModal.tsx` (Magic AI) | Intended: vision provider via `POST /api/ai/receipt/scan` | **Transport missing**: no such endpoint exists under `api/`, so no paid call can complete today. Classification is `NOT_WIRED` with a blocking transport defect; if the endpoint is ever created, the operation is a vision `AI_METERED` candidate |
| 20 | Price research — AI synthesis leg (`ai-price-search`) | `src/engine/pricing/aiEstimate/aiPriceEstimate.ts:204–211` (PC, `productId: EZRAB_AI`, `jsonMode`); `src/services/aiPriceSearchService.ts:134` via `aiProviderRouter` task `RAB_ANALYSIS` | GW via PC / MP | Synthesizes a price estimate from search candidates; no debit. Output remains an AI estimate and must stay labeled as such |
| 21 | Drawing reader / source reading (`ai-drawing-reader`) | `DrawingReaderModal.tsx` → `aiDrawingIntelligence.ts:278` → `aiSourceReadingService.processSourceFile` ~312 → `aiProviderRouter.execute` task `BACA_DENAH` ~656 | MP endpoint, vision mode | No debit |
| 22 | SmartAdd work-item generation (no matrix key) | `src/components/estimator/SmartAddWorkItemModal.tsx:597–612` (dynamic import of PC, `productId: EZRAB_AI`) | GW via PC | Discovered in this audit; absent from the Phase 1 matrix. No debit. Also a live example of why unknown/unregistered feature identities must fail closed server-side (§5.2) |

### 4.3 `DETERMINISTIC_FREE` — no paid provider call; must remain free (15)

| # | Operation | Entry points | Why free |
|---|---|---|---|
| 23 | Volume / QTO calculation (`volume-calculation`) | Volume calculators | Pure local arithmetic on user dimensions |
| 24 | Deterministic RAB arithmetic (`rab-arithmetic`) | RAB engine | Local multiplication/summation over resolved prices |
| 25 | AHSP lookup (`ahsp-lookup`) | AHSP catalog/repository | Local dataset lookup; no provider call |
| 26 | AHSP candidate search/matching (`ahsp-candidate-search`) | AHSP matching | Local matching over the catalog |
| 27 | Price resolution from local sources (`price-resolution`) | Pricing engine (OFFICIAL → MARKET → ASSUMPTION → UNRESOLVED provenance chain) | Local data only; an unresolved price stays `null`, never invented |
| 28 | Recalculation (`recalculation`) | RAB recalculation paths | Re-runs local arithmetic |
| 29 | Export PDF (`export-pdf`) | Export services | Local rendering |
| 30 | Export Excel (`export-excel`) | Export services | Local rendering |
| 31 | Project open (`project-open`) | Workspace | Local/state operation |
| 32 | Project edit (`project-edit`) | Workspace | Local/state operation |
| 33 | Local document review & validation (`document-review-local`) | `document-ai/review.ts`, `reviewPolish.ts`, `DocStudioReview` | Rule-based local checks; grep-verified no provider calls |
| 34 | Document parsing & plain-text extraction (no matrix key) | `document-ai/parser.ts`; registry entry `DOKUMEN_AI_EXTRACT_PLAIN` (provider: none) | Deterministic local extraction |
| 35 | RAB review **as shipped** (`ai-rab-review` in matrix) | `src/services/aiRabReview.ts` `reviewProjectRab` ~364; modal `RabReviewModal.tsx` | Grep-verified: **no** router/providerClient/fetch — the shipped review is rule-based and local. See note R-1 |
| 36 | Master-price matching after OCR (no matrix key) | Receipt flow post-processing | Local matching of extracted text against master prices |
| 37 | Chat AI deterministic tool execution leg (sub-operation of rows 1–2) | `src/ai-tools/ezrab-ai/tools.ts` (`EZRAB_AI_TOOL_MAP`), invoked from `service.ts` | Model tool calls are executed **locally and deterministically** against EZRAB data; when a tool succeeds, its output *is* the reply. The paid event is the model call (rows 1–2), never the tool execution |

### 4.4 `REQUIRES_REVIEW` — cannot be classified safely yet (3)

| # | Operation | Entry points | Open question |
|---|---|---|---|
| 38 | Market search — Serper leg | `api/market/search.js` → `api/_lib/marketSearch/serperProvider.js` (auth + rate limit 30) | A **paid third-party API billed per search, not per token**. It needs a non-token cost-evidence type and an owner decision (absorb as platform cost vs. meter) before it can be classified. Its AI synthesis leg is row 20 |
| 39 | Legacy `server/` AI surface | `server/orchestrator/aiOrchestrator.ts:367–387`; client `src/services/aiApiClient.ts`, `quickActionService.ts` | Flat 1-credit debit against hardcoded sample subscription data ("rogue system", Phase 1). Which live UIs still mount these flows was **not fully traced** in this audit; recommendation is explicit retirement under a separate grant, not integration |
| 40 | `aiProviderRouter` Node/server path | `src/services/aiProviderRouter.ts` (Node branch: `aiCostRouter.selectBestModel` + server adapters) | Bypasses the browser gateway entirely and routes on **unverified** registry cost estimates. Browser callers converge on the gateway; the Node path needs an owner decision (converge or retire) before classification |

### Notes on discrepancies found during the audit

- **R-1 — RAB review.** `featureBillingMatrix.js` lists `ai-rab-review` as
  `AI_METERED / NOT_WIRED`, anticipating an AI-backed review. The shipped
  implementation is deterministic and local (row 35). The matrix entry should be
  treated as *planned-AI*, and the shipped behavior classified `DETERMINISTIC_FREE`.
  If an AI-backed review is ever shipped, it becomes a new `AI_METERED` operation at
  that time — it must not retroactively make today's local review chargeable.
- **R-2 — Document QA debit nuance.** The Phase 1 statement "Document QA is not
  debited" is confirmed for the interactive chat path (`askQuestion()`, no consume).
  Precision: `DocAnalyzer.runMode()` *would* debit if invoked with the `qa` tab, but
  the QA tab's UI renders the `askQuestion` interface instead of the run button
  (JSX ~line 362), so that branch is unreachable from the shipped UI.
- **R-3 — Gateway feature mapping gap.** The gateway's step-6b meter maps
  `DED_AI_FAST`/`DED_AI_DETAIL` → feature `ded-ai` and `DOKUMEN_AI` → `ai-document`,
  but neither `ded-ai` nor `ai-document` is a key in the `creditPricing.js` draft
  tariffs (which use `ded-ai/simple|medium|complex` and `ai-document/simple|complex`).
  Inside the meter, `finalizeCredits` therefore returns `UNKNOWN_FEATURE` and
  `credits_charged` is `null` for exactly the two heaviest features — a mapping defect
  to fix in the boundary work (§8), independent of the null-adapter problem.
- **R-4 — Client-approved cap is dropped.** `aiGateway.js:781` reads
  `input.approvedMaxCredits` for the meter record, but `validateAiInput`
  (`api/_lib/security.js`, ~line 188) does not carry `approvedMaxCredits` in the
  validated input it returns, so a client-approved maximum never actually reaches the
  meter. Under the boundary design this field becomes server-derived anyway (§5.2);
  the gap is recorded so it is not mistaken for a working control.
- **R-5 — Stale status surface.** `api/ai/engine-status.js` reports every mode as
  `gemini-3.5-flash-lite (Gemini)`, which no longer describes the actual chains
  (companion audit, §5). Cosmetic, but it means the status endpoint cannot be used as
  routing evidence.

---

## 5. The shared metering boundary (design)

### 5.1 Canonical sequence

All paid-provider execution converges on **one** server-side boundary, placed inside
`handleAiRequest` (`api/_lib/aiGateway.js`) around the existing `executeAI` call —
the only point every browser transport already passes through. The sequence:

```
1. IDENTIFY   Server derives (accountId, featureKey) from the authenticated session
              + productId/mode mapping. Client-sent feature/cost/token fields are
              ignored for billing purposes.
2. CLASSIFY   featureBillingMatrix.classifyFeature(featureKey):
                - DETERMINISTIC_FREE → execute locally, create NO operation, stop.
                - unknown → reject UNKNOWN_FEATURE (fail closed), stop.
                - AI_METERED → continue.
3. ESTIMATE   Server computes the reservation estimate:
                - token features: server-side token estimate of the request
                  (+ the v1.1 reservation output allowance);
                - DED: the flat draft tariff (500/650/800) as a MAXIMUM only (§6.2);
                - document analysis: per-run estimate, independent of chunk count.
4. CREATE     creditLedger.createOperation(accountId, idempotencyKey, estimate)
              — idempotent on (accountId, idempotencyKey).
5. RESERVE    creditLedger.reserve(...) — all-or-nothing. On INSUFFICIENT_BALANCE
              the provider is NEVER called and the client receives a billing error.
              **No charge and no execution before a successful reservation.**
6. EXECUTE    executeAI(...) walks the existing provider chains unchanged.
7. RECORD     The gateway's step-6b meter records provider usage evidence
              (provider, model, tokens in/cached/out) to a PERSISTENT adapter
              (usageStore pattern) keyed by the operation's idempotency key.
8a. SETTLE    pricingPolicy.creditsForTokenUsage(usage) → creditLedger.settle(...)
              with the evidence attached. Remainder returns to origin batches.
8b. RELEASE   On internal failure (provider chain exhausted, timeout, malformed
              output with no usable result): creditLedger.release(...). The user is
              never charged for EZRAB-side failures.
8c. REVIEW    Usage missing/unparseable, tariff unknown, or actual > reserved:
              operation lands in REQUIRES_REVIEW via the ledger's existing review
              path; resolution requires billingAuthorization's review permission.
```

### 5.2 Requirement-by-requirement conformance

| Requirement | Design element | Current gap it closes |
|---|---|---|
| Server-side feature identity validation | Feature key is derived server-side from the authenticated session + `productId`/mode mapping in `api/ai/tools/execute.js`; the matrix's `classifyFeature` is the single lookup | Today the client effectively self-declares what it ran (simulation debits are keyed by client-side strings) |
| Client-supplied cost/token values never trusted | The boundary ignores any client-sent token counts, costs, or credit amounts. The only client input with billing relevance is the *request content itself*, from which the server estimates. `validateAiInput` must not pass through cost-bearing fields (see R-4) | Client `tokenMetering.ts` estimates are today's de-facto charge basis for Chat; `approvedMaxCredits` handling is inconsistent (R-4) |
| Provider usage evidence recorded server-side | Step 7 persists the gateway meter record (the `usageStore` in-memory adapter in `api/_lib/usageStore.js` already proves the shape: save/get/dedupe by idempotency key) | `createUsageMeter(null)` discards every record; `api/credits/usage.js` returns `[]` by construction |
| Idempotency key per operation | One key per *user operation*, generated/accepted at the boundary and threaded through **all** provider calls of multi-call features (DED passes, Document SUMMARY chunks + synthesis). Ledger `createOperation` dedupes on `(accountId, key)` | Today only a single-call replay cache exists in the gateway (in-memory, success-only, scoped to user/IP), and `providerClient.ts` forwards a caller-supplied header key it does not create |
| Internal failure releases the reservation | Step 8b; the ledger's `release` is idempotent, so a release racing a settle cannot double-apply | DED currently debits before execution with **no release path at all** (§6) |
| Unknown usage → manual review | Step 8c reuses the ledger's enforced behavior (`USAGE_MISSING`, `UNKNOWN_TARIFF`, over-reservation → `openReview`) and `billingAuthorization` review permissions | Providers whose responses the tariff registry cannot normalize (only `gemini` and `generic` adapters exist in `normalizeProviderUsage`; other providers yield all-null tokens) will land here by design rather than being charged on guesses |
| No charge before successful reservation | Step 5 ordering is normative: `executeAI` is unreachable without a `RESERVED` operation | Chat debits after success (simulation), DED before start (simulation), everything else never — three inconsistent orders today |
| No localStorage value can authorize a paid operation | The boundary reads only the server session and the server ledger. The simulation layer (`mockAdapter`, `useCreditSimulation`) is demoted to a *display mirror* of server state; its balance, plan, and `jobReference` values carry no authority | Today the localStorage simulation **is** the authorization for Chat/DED/Document debits |
| Unknown feature IDs fail closed | `chargeDecision` already returns `UNKNOWN_FEATURE` with `chargeable: false`; the boundary keeps this and adds a guard: an unregistered feature (e.g. SmartAdd, row 22) must be registered in the matrix before it can execute as a paid operation | SmartAdd executes today with no matrix entry at all |
| Deterministic-free features cannot accidentally debit | Classification happens server-side at step 2; `DETERMINISTIC_FREE` features never reach `createOperation`. A guard test (future) asserts zero operations created for each free feature key | No such guard exists today; the simulation's `consume` accepts arbitrary feature strings client-side |
| Vercel function ceiling (11 handlers + middleware = 12/12) | No new top-level handlers: operation actions (create/reserve/settle/release/review) are added as actions inside `api/credits/[action].js`, per the Phase 1 constraint | — (design constraint, respected) |
| Dormancy chain stays broken until owner activation | The boundary is inert while any of the five dormancy links is open (Midtrans key empty → 503; Supabase service config empty; `CREDITS_DB_CONFIGURED`; migration unexecuted; no production callers). Building the boundary changes none of them by itself | — (activation is a separate, explicitly granted program; see §9) |

### 5.3 Multi-call operations

DED and Document SUMMARY are not single provider calls. The boundary treats the
*user-visible run* as the operation: one idempotency key, one reservation, and one
evidence record that **accumulates** every pass/chunk call (each with its own
provider/model/token tuple). Settlement happens once, at run completion, from the
accumulated usage. A run that partially fails follows §6.2's rule for DED and the
analogous rule for documents: calls that produced usable partial results are settled
from their recorded usage; a run that produced nothing usable is released in full.
No pass may execute after the reservation is exhausted without re-entering the
boundary (top-up reservation or `REQUIRES_REVIEW`) — passes may never "run on trust".

---

## 6. DED compatibility (Phase H)

> **No DED production behavior changes in this phase.** This section verifies how DED
> behaves today (read-only) and designs the compatible migration path. Nothing in the
> DED codebase was edited; DED files are owned by a parallel program.

### 6.1 Verification of the Phase H claims

| # | Claim (from Phase 1 / task) | Verdict | Code evidence |
|---|---|---|---|
| H-1 | Flat draft tariffs 500 / 650 / 800 for simple / medium / complex | **CONFIRMED** | `src/ai-credits/config.ts` TARIFFS: `ded-ai/simple` target 500, `medium` 650, `complex` 800; mirrored in `api/_lib/creditPricing.js` draft tariffs and as `FLAT_DRAFT` in `featureBillingMatrix.js`. The complexity category is **user-selected** in `DedAiInputView.tsx:68–70, 108–116`, not detected from the document |
| H-2 | Debit happens before completion | **CONFIRMED — stronger: before execution** | `DedAiInputView.tsx:141–160` (`handleStart`): `consume('ded-ai', dedTarget, …)` runs **before** `onStart({...})` launches the analysis. No refund/release path exists if the analysis later fails |
| H-3 | Multi-file runs take a single debit | **CONFIRMED** | The same `handleStart` call charges `dedTarget` regardless of `validFiles.length`; the file count appears only in the human-readable description string |
| H-4 | Low balance does not reliably stop the analysis | **CONFIRMED, with one nuance** | `DedAiInputView.tsx:401–405`: when `balance.total < dedTarget` the UI shows a warning ("Saldo simulasi … di bawah estimasi. Anda tetap bisa lanjut setelah menyetujui, atau top-up dulu") and the user may proceed after a checkbox approval; `handleStart` **ignores `consume()`'s boolean return entirely**, so even a failed debit (insufficient balance or plan gate inside `mockConsume`) does not block `onStart`. **Nuance:** the *plan* gate does block — the start button is disabled unless `dedAllowed` (plan entitlement) and `creditApproved` hold. So: package gate stops the run; balance does not |
| H-5 | Usage evidence is not consistently persisted | **CONFIRMED — stronger: it is never persisted** | The DED service (`src/ai-tools/ded-ai-estimate/service.ts`) makes one provider execute **per page-group pass** (loop over the pass plan, ~line 1000; `executeDedPassAttempt(() => aiToolsProviderClient.execute({ productId, … }))`, with limited MALFORMED retries per pass). Pass traces record `productId / mode / maxTokens / requestChars / status / itemCount / retryCount` — **no token usage anywhere** (the pass-trace type in `types.ts` explicitly notes `productId` is "bukan nama model final" — not the final model name). The browser client receives provider/model but not usage, and the gateway discards usage into the null-adapter meter (§2.4) |
| H-6 | FAST/DETAIL mode and Full-AI/Database policy do not change the tariff | **CONFIRMED** | The tariff is keyed only by the user-selected complexity (H-1). Mode changes `maxTokens` (FAST 16000 / DETAIL 24000) and timeouts (120s/180s), i.e. it changes real provider cost, but not the charge. DED Full AI (`ded-ai/full-ai`, row 10) is not debited at all |

### 6.2 The compatible path (design)

The DED flat tariff is retained **only as the maximum reservation estimate** — this is
also the Phase 1 §6.10 owner-decision recommendation, restated here as design, not as
an adopted decision:

1. **Classify & estimate.** `ded-ai/simple|medium|complex` stay the feature keys. At
   run start, the server takes the flat draft value (500/650/800) as the *reservation
   ceiling* for the run — the most the run may consume without review.
2. **Reserve before any external AI execution.** `createOperation` (key = one per run,
   covering all files and all passes) → `reserve`. Insufficient balance now **stops**
   the run before the first provider call — this deliberately replaces today's
   warn-and-proceed behavior (H-4) at activation time, and only then.
3. **Execute passes under the operation key.** Every pass attempt — including
   MALFORMED retries — records its provider usage evidence against the run's key.
   Passes that are skipped or fail without provider usage record a zero-usage evidence
   line, so the run's evidence is complete rather than sampled.
4. **Settle actual under v1.1.** At run completion, accumulated usage is converted by
   `pricingPolicy.creditsForTokenUsage` (1 credit = 200 weighted tokens, output ×3
   interim) and settled via the ledger. The unused part of the flat reservation is
   **released back to the origin batches** by the ledger's existing settle semantics.
   A multi-file run is still one operation (preserving H-3's user-visible simplicity)
   — but its settlement now reflects the actual passes across all files.
5. **Unknown or overage → review.** If any pass's usage is missing/unparseable, or the
   accumulated actual exceeds the flat ceiling, the operation goes to
   `REQUIRES_REVIEW` (ledger-enforced; no partial debit, no negative balance) for
   resolution under `billingAuthorization` review permissions. The flat value thereby
   becomes a genuine consumer protection: it is the maximum that can ever settle
   automatically.
6. **Failure → release.** A run that fails before producing a usable result releases
   the full reservation (closing the H-2 gap: no more debit-before-completion with no
   refund path).

### 6.3 Output-labeling invariant (unchanged by billing)

Metering changes how DED is *charged*, never what its outputs *claim*. DED's existing
provenance labeling stays exactly as implemented in `src/ai-tools/ded-ai-estimate/types.ts`
and `priceCompletion.ts`:

- Price provenance classes include `AI_ESTIMATE` ("Estimasi dari model AI — perlu
  verifikasi, bukan harga resmi"), `OFFICIAL_AHSP_VERIFIED`,
  `OFFICIAL_REGIONAL_REFERENCE`, and `MARKET_REFERENCE`; price completions are
  classified `FILLED_MARKET_REFERENCE` vs `FILLED_AI_ESTIMATE` with provenance strings
  appended.
- Quantity sources are `DED / USER / ASSUMPTION`, with evidence verification
  (`applyQuantityEvidenceVerification`) producing provenance such as
  `quantity:… -> AI_INFERENCE(evidence-unverified)`.

**Market-price and inferred-quantity outputs remain transparently labeled as such.
They must never be represented — in UI, exports, or billing descriptions — as
verified official AHSP prices or as drawing-extracted quantities.** A settled credit
charge is payment for computation; it confers no verification status on the numbers.

---

## 7. Transport convergence (design constraint)

The boundary in §5 only governs traffic that passes through it. Four transports exist
today (§2.4); the design requires:

- `api/ai/tools/execute.js`, `api/ai/chat.js`, and `api/ai/multi-provider/execute.js`
  all terminate in the same gateway boundary (they already share `handleAiRequest`;
  the multi-provider wrapper must stop being a thinner, unbilled side door — note it
  also passes router mode strings `quick`/`vision` through, where `quick` currently
  falls into the gateway's fast else-branch: mode semantics must be normalized at the
  boundary, not by accident).
- The ded-rab-v2 / ded-rab-v3 clients (rows 8–9) converge onto the same endpoint +
  operation-key discipline; they are listed as future-change files, owned by the
  parallel DED program.
- The Node/server path (row 40) and the legacy `server/` stack (row 39) are **not**
  integrated by this design. They require explicit owner decisions (converge or
  retire). Until then they remain outside the boundary and must be treated as
  unbilled surfaces in any activation scope statement — never silently assumed covered.

---

## 8. Exact files that would need future changes (none changed in this phase)

| File | Future change (proposal only) |
|---|---|
| `api/_lib/aiGateway.js` | Host the boundary: classify → estimate → create/reserve → execute → record → settle/release/review around `executeAI`; fix the step-6b feature mapping (R-3); use a persistent meter adapter; normalize mode strings |
| `api/_lib/security.js` | `validateAiInput`: derive/pass through only server-trusted fields; resolve the `approvedMaxCredits` drop (R-4) by making the cap server-derived |
| `api/_lib/usageMeter.js` | Accept the persistent adapter in production wiring; accumulate multi-call evidence per operation key |
| `api/_lib/usageStore.js` | Promote the in-memory proof into the persistence-backed adapter (with the Phase 1 migration, when and if the owner grants its execution) |
| `api/ai/tools/execute.js` | Emit the server-derived feature key + operation key into the gateway |
| `api/ai/chat.js` | Route through the same boundary (no unbilled fast lane) |
| `api/ai/multi-provider/execute.js` | Converge onto the boundary; normalize `quick`/`vision` mode semantics |
| `api/credits/usage.js` | Serve persisted usage instead of the null-adapter empty list |
| `api/credits/[action].js` (new actions in the existing dynamic handler) | Operation endpoints (status/review resolution) within the 12-function Vercel ceiling — **no new top-level handler files** |
| `api/_lib/featureBillingMatrix.js` | Register the missing feature keys (SmartAdd, document review/scope, ded-rab pipelines); correct the `ai-rab-review` entry per R-1 |
| `api/_lib/creditPricing.js` | Align draft feature keys with the gateway mapping (R-3) — values remain draft until owner tariff decisions |
| `src/ai-tools/providerClient.ts` | Create and send one operation idempotency key per user operation; declare the feature for server validation (server still derives the authoritative key) |
| `src/ai-tools/ezrab-ai/view.tsx` + `chatCreditDebit.ts` | Replace client-estimated debit with server settlement display (simulation demoted to mirror) |
| `src/services/coAssistantService.ts` | Enter the boundary (currently a full bypass, row 7) |
| `src/ai-tools/ded-ai-estimate/DedAiInputView.tsx` + `service.ts` | Reserve-before-start; thread the run key through all passes; record per-pass evidence; settle/release at completion (§6.2). **Owned by the parallel DED program — coordination required; not touched in this phase** |
| `src/ai-tools/ded-full-ai/service.ts` | Same operation-key discipline (row 10) |
| `src/components/DocAnalyzer.tsx` + `src/ai-tools/document-ai/orchestrator.ts` | One operation per run/action; honor the settlement result; cover create/revision/enhance/translate/QA/review/scope (rows 6, 12–18) |
| `src/services/aiReceiptIntelligence.ts` | Owner decision: create the missing `/api/ai/receipt/scan` endpoint inside the boundary, or retire the feature honestly (row 19) |
| `src/services/aiPriceSearchService.ts` + `src/engine/pricing/aiEstimate/aiPriceEstimate.ts` | Boundary entry for the synthesis leg (row 20); Serper leg per the row-38 decision |
| `src/services/aiDrawingIntelligence.ts` + `aiSourceReadingService.ts` | Boundary entry (row 21) |
| `src/components/estimator/SmartAddWorkItemModal.tsx` | Register + enter the boundary (row 22) |
| `src/services/aiProviderRouter.ts` | Converge browser callers on the gateway boundary; Node path per owner decision (row 40) |
| `src/ded-rab-v2/ai/zyrouterClient.ts`, `src/ded-rab-v3/ai/aiProviderClient.ts` | Operation-key discipline (rows 8–9). **Parallel DED program ownership** |
| `server/**` (legacy) | Retirement or convergence — owner decision only (row 39) |
| `src/ai-credits/mockAdapter.ts` + simulation hooks | Demote to display-only mirror of server state; align consumption order with the server Phase 5.1 order (open decision D7) |

Explicitly **not** in scope for any future step without its own separate grant:
`middleware.ts` (the documented webhook-exception patch from Phase 1 remains
unapplied), `AUTH_ENABLED`, any Supabase migration execution, and any Midtrans
activation.

---

## 9. Activation prerequisites (owner decisions still open)

Nothing in this design self-activates. Carried forward from Phase 1 §6, still open:

- **D1 / D2 / D4** — account closure, refund, and credit-transfer policies:
  `PENDING_LEGAL_REVIEW`. The ledger correctly implements none of them yet.
- **Migration grant** — `20261110_unified_credits_foundation.sql` is archived, not
  executed; live migration status remains UNKNOWN.
- **Middleware exception grant** — `middleware.ts` gates all `/api/credits/*` with no
  webhook exception; the documented patch is unapplied (and was not touched here).
- **D7** — simulation consumption order (bonus → top-up → subscription) vs. server
  Phase 5.1 order (subscription → bonus/FREE_ONCE → top-up): one canonical order must
  be chosen before the simulation is demoted to a mirror.
- **D8** — final top-up pricing; current figures are draft/simulation values.
- **Margin formula adoption** — parameters remain `null`; see the companion audit:
  no measured gross margin can be claimed while provider tariffs and commercial
  parameters are unknown.
- **Verified provider tariffs** — see `docs/audits/AI_PROVIDER_TARIFF_READINESS.md`:
  most gateway routes have no published tariff, which caps how much of the boundary's
  cost side can ever be evidence-based.
- **DED tariff unification** — §6.2 designs the token-settled path; adopting it
  (retiring flat-as-charge in favor of flat-as-ceiling) is an owner decision.

---

## 10. Fence confirmation

This document and its companion were the only artifacts produced. Verified by
`git status` at completion: the only new files are the two documents; the pre-existing
dirty tree (parallel DED program edits, Phase 1 dormant files, and other work) is
unchanged. No commit, push, merge, deploy, SQL execution, environment/Supabase change,
`middleware.ts` edit, `AUTH_ENABLED` change, or billing/Midtrans activation occurred.
No provider price, tariff, credit value, margin, or FX rate was invented in this
document; every monetary figure cited is either a locked Phase 1 policy value, a
draft/simulation value labeled as such, or deferred to the companion tariff audit.
