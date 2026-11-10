# DED × Unified Credits — Sprint 4 (Task E)

**Scope.** DED-side integration readiness between the DED usage metadata
(`src/ai-tools/ded-ai-estimate/usageMetadata.ts`) and the Unified Credits
lifecycle designed by the Sprint 3 program
(`createOperation → reserve → execute → recordEvidence → settle | release`).
This document is an audit plus an additive metadata completion. **No
server-side credit debit was activated, no token figure was fabricated, and
no Sprint 3 file was edited.** Sprint 3 files (`api/_lib/*`,
`supabase/migrations/20261110_unified_credits_foundation.sql`) were read only.

**Alignment statement.** Sprint 3 already built the DED billing boundary:
`api/_lib/dedBillingAdapter.js` (one operation per batch/run, flat
500/650/800 credits as a *maximum reservation estimate*, final charge =
token settlement under pricing policy v1.1 from actual usage) on top of
`api/_lib/aiMetering.js`, whose `recordUsageEvidence(operationId, ev)`
accepts per-call evidence `{ provider, model, usage: { tokensIn,
tokensOut, tokensCached } }` and marks evidence incomplete when any of
those is missing. Task E does **not** create a second path: the DED
workflow record produced by `usageMetadata.ts` is shaped so that each of
its per-call records maps 1:1 onto that evidence contract (verified by
test E8 in `src/test/dedUsageCreditsCompat.src.ts`). Until the gateway
reports tokens to the client, that evidence is honestly *incomplete* —
which under the Sprint 3 contract routes settlement to `REQUIRES_REVIEW`,
never to an invented charge.

---

## 1. Audit: current DED usage metadata vs. the future lifecycle

Lifecycle needs, step by step, against the pre-Sprint-4 record
(`DedWorkflowUsage` as built by the Hardening program):

| Lifecycle need | Pre-Sprint-4 state | Verdict |
|---|---|---|
| `createOperation` identity: workflow id, feature key, project/workspace/actor context | `workflowId` (= `output.jobId` standard / `fullai-<ts>` Full AI), `featureKey`, `policy`, optional `projectId`/`workspaceId`/`actorUserId` from service options | **Sufficient** |
| `reserve` input: feature key + complexity class | `featureKey` present; standard pipeline derives DETAIL complexity as default `medium` because the service options carry no complexity selection (see Finding F-E2) | **Sufficient with finding** |
| `execute` traceability: which model calls were actually sent | `modelCalls` (sent passes only), aggregate `retries`, `errors[]`, `status` | **Partial** — aggregate only; no per-call records |
| `recordEvidence`: per-call provider/model + tokens | Workflow-level `provider`/`model` (Full AI only; standard = null), all token fields null, no per-call breakdown, no stated reason for the nulls | **Insufficient** — completed additively in Sprint 4 (§2) |
| `settle`: actual provider cost | `providerCostIdr: null` | **Absent, honestly** — no path reports provider cost to the client; cost must never be derived from a model ID |
| `release` / failure accounting: which calls failed, which never ran | `errors[]` strings; skipped passes excluded from `modelCalls` but not itemised | **Partial** — itemised per call in Sprint 4 |
| Tariff binding | No field | **Absent** — added as explicit `pricingPolicyVersion: null` (§2) |
| Operation timestamps | Only `generatedAt` (record build time) | **Partial** — `startedAt`/`finishedAt` captured in services in Sprint 4 |

## 2. Metadata completed in Sprint 4 (additive, DED-side only)

All new fields are additive and optional on `DedWorkflowUsage`; both
builders always populate them. Every unknown value is exactly `null` —
no token is estimated from character counts and model-call counts are
never converted into tokens.

**New type `DedUsageCallRecord`** (`src/ai-tools/ded-ai-estimate/types.ts`),
one entry per model call in `DedWorkflowUsage.calls`:

| Field | Source | Notes |
|---|---|---|
| `callId` | `pass-<passIndex>` / `full-ai-main` | Stable within the workflow |
| `kind` | `PASS` \| `FULL_AI_MAIN` | |
| `label` | pass `clusterLabel` / file name (Full AI) | |
| `sourceFile` | pass trace `sourceFile`, else the service's `fileName` option | Per-call file identity for multi-file workflows (the view runs one workflow per file, so this is normally the workflow's file) |
| `pages` | pass trace `pages` | `[]` for Full AI (whole document per call) |
| `productId` | pass trace (`DED_AI_FAST`/`DED_AI_DETAIL`); Full AI service now passes it through | The *requested* gateway product — not a billing provider identity |
| `requestedProvider` / `requestedModel` | `null` | The pipeline never reads the registry target (`getModelTarget`); recording it would require reading the registry at record time — left null rather than implied |
| `provider` / `model` | **Actual** identity from the gateway response (see below) | Standard: captured per pass since Sprint 4; Full AI: from output provenance, as before |
| `attempts` / `retries` | Pipeline execution: `1 + retryCount` for sent passes; `0` for skipped | Counts *pipeline-layer* attempts only (the MALFORMED retry in `executeDedPassAttempt`, max 1). Gateway-internal failover attempts are not visible to the client (Task F audit) and are **not** folded into this number |
| `status` / `errorCode` | Pass trace status vocabulary (`OK`, `FAILED`, `EMPTY_RESPONSE`, `MALFORMED_RESPONSE`, `SKIPPED_BUDGET`, `SKIPPED_UNSUPPORTED`); Full AI: `SUCCESS` | Per-call success/failure is now explicit |
| `inputTokens` / `outputTokens` / `cachedTokens` | `null` | Gateway does not report tokens to the client (Task F) |
| `missingEvidenceReason` | `GATEWAY_DOES_NOT_REPORT_TOKENS` for sent calls; `CALL_NOT_SENT` for skipped passes | Explicit reason, per call |
| `startedAt` / `finishedAt` | `null` | The pipeline does not timestamp individual calls today; stated as null instead of borrowing the workflow timestamps |

**New workflow-level fields** on `DedWorkflowUsage`:

- `missingEvidenceReason: 'GATEWAY_DOES_NOT_REPORT_TOKENS'` — set exactly
  when the workflow token fields are null (they always are today).
- `providerCostMissingReason: 'PROVIDER_COST_NOT_REPORTED'` — set exactly
  when `providerCostIdr` is null (always today).
- `pricingPolicyVersion: null` — pricing policy v1.1
  (`api/_lib/pricingPolicy.js`, `v1.1-token-metering`, LOCKED_OWNER)
  exists server-side, but nothing binds that version per call or per
  workflow on the DED side. Claiming the version here would fabricate a
  binding that does not exist; the field is present so the binding has a
  home when Sprint 3 wires it.
- `requestedProvider` / `requestedModel: null` — requested-vs-actual is
  kept distinct at workflow level too; only the actual identity
  (`provider`/`model`) is ever populated, and only from response data.
- `startedAt` / `finishedAt` — captured additively in both services
  (`ded-ai-estimate/service.ts#run`, `ded-full-ai/service.ts#runExecute`)
  and passed through the builders' context. `finishedAt` falls back to
  `generatedAt` when a caller does not supply it; `startedAt` stays null
  when the service did not capture it (e.g. records built outside the
  services).

**Behaviour change (deliberate, narrow).** The standard pipeline
previously discarded the actual provider/model that `AiToolsSuccess`
already carries: a pass trace kept only the requested `productId`, and
the standard usage record hard-coded `provider: null, model: null`.
Since Sprint 4, `executeDedPassAttempt` returns the final attempt's
`provider`/`model`, the pass loop stores them on the pass trace
(`DedPassTraceEntry.provider/model`, additive optional fields), and the
usage builder derives the workflow-level identity by *consensus*: it is
populated only when every identity-bearing sent call agrees on one
provider/model pair; mixed or absent identities stay null. A failed
provider attempt records null identity (the gateway error shape carries
none). Full AI behaviour is unchanged (its provenance already carried
the actual identity); its single call record now also carries the file
name and requested `productId`.

## 3. Feature-key verification against the billing matrix (read-only)

Matrix source: `api/_lib/featureBillingMatrix.js` (Sprint 3, read-only).
Complexity values that actually exist in DED code: the view's complexity
selector is exactly `'simple' | 'medium' | 'complex'`
(`DedAiInputView.tsx`), `DedAiMode` is `FAST | DETAIL`, and Full AI is a
separate pipeline. Keys the DED builders can produce:

| Builder output | In matrix? | Matrix entry |
|---|---|---|
| `ded-ai/simple` (FAST, or DETAIL+simple) | Yes | AI_METERED, FLAT_DRAFT, WIRED_SIMULATION_PARTIAL |
| `ded-ai/medium` (DETAIL default, or DETAIL+medium) | Yes | AI_METERED, FLAT_DRAFT, WIRED_SIMULATION_PARTIAL |
| `ded-ai/complex` (DETAIL+complex) | Yes | AI_METERED, FLAT_DRAFT, WIRED_SIMULATION_PARTIAL |
| `ded-ai/full-ai` | Yes | AI_METERED, TOKEN, NOT_WIRED |

Every producible key exists in the matrix, and every matrix DED key for
the standard pipeline corresponds to a real code complexity. Two
findings:

- **F-E1 — `ded-ai/revision` is in the matrix (and in the draft tariffs)
  but no DED code path produces it.** No builder, view, or service emits
  `ded-ai/revision`; the matrix itself already notes it as an orphan
  tariff ("Tarif yatim"). *Sprint 3 dependency:* decide whether the key
  is retired or a revision workflow is planned; DED side needs no change
  either way.
- **F-E2 — DETAIL complexity recorded by the usage builder defaults to
  `medium`.** The complexity the user picks in `DedAiInputView` drives
  only the *simulation* tariff lookup (`tariffFor('ded-ai/<complexity>')`);
  it is not part of `DedAiServiceOptions`, so `buildDedUsageFromStandard`
  is called without it and DETAIL runs record `ded-ai/medium` regardless
  of the user's simple/complex choice. The reservation adapter would
  therefore reserve against the wrong flat class for non-medium DETAIL
  runs. *Fix path (DED-side, not done here because it changes the
  service-options contract):* add an optional `complexity` to
  `DedAiServiceOptions`, pass the view's selection through, and forward
  it to `dedStandardFeatureKey`. Until then this is a recorded mismatch,
  not a silent one. (FAST is unaffected: it always maps to
  `ded-ai/simple`.)

## 4. Simulation boundary: the ignored `consume()` result

`DedAiInputView.handleStart` calls the **simulation** hook
`useCreditSimulation().consume('ded-ai', dedTarget, …)`
(`src/ai-credits/useCreditSimulation.ts` → `mockConsume`, a local
mock adapter — not a backend). Facts, verified in code:

- `consume()` returns a boolean ("simulation balance sufficient"). The
  caller **ignores the return value**; nothing branches on it. This is
  exactly the state the matrix records as `WIRED_SIMULATION_PARTIAL` for
  `ded-ai/simple|medium|complex`.
- The only gate that runs before it is the separate simulation *plan*
  gate: `handleStart` returns early unless `creditApproved` and
  `dedAllowed` (`planAllowsAiFeature(balance.plan, 'ded-ai')` — DED AI
  is excluded from the Free plan per the owner's 2026-11-07 Amendment
  v1.2). That gate's behaviour was **not changed**.
- The simulation is isolated and labelled as simulation in the view and
  in the hook; it shares no state with the Unified Credits ledger and
  cannot debit anything real.

Sprint 4 action: the call site now carries an explicit comment stating
that the return value is intentionally ignored, that the call is
simulation-only, and where that state is recorded (matrix +
this document). No behaviour was changed. Closing the gap (enforcing on
the consume result, or replacing the simulation with the dormant
adapter) is a Sprint 3 / activation decision, not a DED-side fix.

## 5. Confirmations

1. **Deterministic operations produce no billable record in this
   lifecycle design.** Context quantity estimation, AHSP lookup,
   reference matching and the local research cache, canonical subtotal
   computation, review, and user edits are deterministic/local. The pure
   completion path (`priceCompletion.completeDedBatch` and friends)
   builds no usage record at all and cannot increment `modelCalls`
   (test E6); the billing matrix classifies the corresponding features
   (`ahsp-lookup`, `price-resolution`, `recalculation`, `project-edit`,
   …) as `DETERMINISTIC_FREE`. `externalResearchApplications` counts
   local curated-reference fills for transparency only — it is not a
   billable call count.
2. **There is no DED-specific balance and no second billing system.**
   The usage record is readiness metadata for the single Unified
   Credits lifecycle; the only DED billing boundary is the Sprint 3
   adapter over the shared metering boundary and Gen-2 ledger.
3. **No server-side debit was activated by this task.** The feature
   matrix remains dormant; `AI_METERING_ENABLED` gating is untouched;
   nothing in the DED pipelines calls the metering boundary today.

## 6. Sprint 3 dependencies (not implemented here — by design)

| # | Dependency | Owner |
|---|---|---|
| D-E1 | Gateway → client usage propagation (tokens per call) — see the observability audit, extension X1/X2 | Gateway/`providerClient` owners (Sprint 3 platform) |
| D-E2 | Decide the fate of orphan key `ded-ai/revision` (F-E1) | Sprint 3 (matrix/tariffs) |
| D-E3 | Bind `pricingPolicyVersion` per operation when the lifecycle is wired (the DED field now exists and is honestly null) | Sprint 3 (metering boundary) |
| D-E4 | Replace/retire the simulation `consume()` path when activation is approved (§4) | Sprint 3 + owner activation decision |
| D-E5 | (DED-side, listed for completeness) Forward the view's complexity selection into `DedAiServiceOptions` so DETAIL records stop defaulting to `medium` (F-E2) | DED — future task, changes the service-options contract |

## 7. Tests

New suite `src/test/dedUsageCreditsCompat.src.ts` (esbuild bundle → node,
bundle under `~/workspace/.ded-sprint4-bundles/`), run from the repo root
(it reads the real `api/_lib/featureBillingMatrix.js` from disk):

- **36 PASS / 0 FAIL** — required fields on standard & Full AI records,
  exact nulls for tokens/cost, `missingEvidenceReason` semantics
  (incl. `CALL_NOT_SENT`), per-call attempts/retries/status/identity,
  consensus identity, timestamps, `pricingPolicyVersion: null`,
  feature keys ⊆ matrix keys (read from the Sprint 3 file), the
  `ded-ai/revision` finding, evidence-shape compatibility with
  `recordUsageEvidence`, final-attempt identity capture in
  `executeDedPassAttempt` (incl. MALFORMED-retry), and the
  deterministic-path test (E6).

Regressions (logs in `~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/taskEF/`):

- `dedBillingCompat.test.ts` (tsx): **42 PASS / 0 FAIL** (unchanged).
- `dedHardening.src.ts`: **34 PASS / 0 FAIL** (unchanged).
- `dedPriceCompletion.src.ts`: **43 PASS / 0 FAIL** (unchanged).
- `dedFullAiParity.src.ts`: **28 PASS / 0 FAIL** (extra check; the Full AI
  service was touched additively).
