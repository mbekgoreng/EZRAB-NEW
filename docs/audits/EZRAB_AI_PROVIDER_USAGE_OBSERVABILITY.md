# EZRAB AI Provider Usage Observability Audit — Sprint 4 (Task F)

**Question.** When a DED workflow (or any AI-tools feature) calls a model,
is provider usage — input/output/cached tokens and the *actual* model
identity — available in the response, and where exactly does it survive
or get dropped between the provider and the DED usage record?

**Method.** Code audit of the actual call chain, read-only outside the
DED area. No routing or credential policy was changed, no API key is
logged anywhere in this document, and no document content is quoted.
**No provider cost is claimed anywhere in this audit: cost cannot be
derived from a model ID, and no layer in the chain reports a cost figure.**

## The chain under audit

```
DED pipelines (browser)
  ded-ai-estimate/service.ts · ded-full-ai/service.ts
    → aiToolsProviderClient.execute()          src/ai-tools/providerClient.ts
      → POST /api/ai/tools/execute             api/ai/tools/execute.js (thin wrapper)
        → handleAiRequest / executeAI          api/_lib/aiGateway.js
          → callGemini / callOAI (failover chain, per-attempt usage captured)
          → usage meter (server-side only)     api/_lib/usageMeter.js

Alternate path (Node/test, no HTTP):
  aiToolsProviderClient.execute() (isNode branch)
    → chatGemini / chatOpenAiCompatible        server/providers/multiProvider/adapters.ts
```

Product routing at the gateway wrapper: `DED_AI_DETAIL` → `advanced`
chain, `DED_AI_FAST`/`DOKUMEN_AI` → `fast` chain, `EZRAB_AI` →
`chat`/`advanced`. The gateway runs a **sequential failover chain** across
providers/keys (Crown → Gemini native → River → AtmoRouter → ZyRouter →
tail), with a per-provider attempt budget (max 2 tries after a failure)
and a 100 s chain budget.

## What the gateway actually captures (server-side)

Per attempt, `callGemini` and `callOAI` in `api/_lib/aiGateway.js` build a
normalised usage object:

- Gemini: from `usageMetadata` → `{ inputTokens: promptTokenCount,
  outputTokens: candidatesTokenCount, totalTokens,
  cachedTokens: cachedContentTokenCount, source: 'gemini_usageMetadata' }`.
- OpenAI-compatible: from `usage` → `{ inputTokens: prompt_tokens,
  outputTokens: completion_tokens, totalTokens,
  cachedTokens: prompt_tokens_details.cached_tokens,
  reasoningTokens: completion_tokens_details.reasoning_tokens,
  source: 'oai_usage' }`.
- `executeAI` returns `{ ok, content, model, provider, requestId,
  attempts: outcomes[], usage }`, where each outcome is
  `{ provider, model, ok, ms, error?, errorClass?, usage }` — i.e. the
  **full fallback/retry history with per-attempt identity exists
  server-side**, and usage is attached to the successful attempt.
- `handleAiRequest` feeds this to the Phase-3 usage meter
  (`usageMeter.record({ requestId, feature, provider, model, usage,
  attempts: <count>, failures, durationMs, status })`) and to the
  structured secret-free log (`logAiUsage`, including the full
  `attemptLog`). Failed-attempt usage is **not** recorded by the meter:
  outcomes for failed attempts carry `usage: null` by construction, and
  the meter receives `usage: r.ok ? r.usage : null`. A failed attempt
  that nonetheless consumed provider tokens is therefore invisible even
  server-side (relevant to the Sprint 3 adapter rule that
  unknown-usage failures route the whole run to `REQUIRES_REVIEW`).

## Per-path findings

### 1. Standard (non-streaming) completion — the DED production path

| Stage | Fields present | Dropped |
|---|---|---|
| Provider → gateway | Full usage (above), actual model (`d.model` for OAI; the *sent* model for Gemini), finish reason | — |
| Gateway internal (`executeAI` result) | `content, model, provider, requestId, attempts[], usage` | — |
| **HTTP response body** (`handleAiRequest` success branch) | `success, content, model, provider, mode, requestId, durationMs` | **`usage` and `attempts` are dropped at the HTTP boundary** — they are used for the server-side meter/log and then discarded |
| `providerClient` browser branch | Returns `AiToolsSuccess { success, content, structured, requestId, provider, model }` | The `AiToolsSuccess` type has **no usage/token fields at all** — even a future gateway change would be dropped here until the type grows |
| DED standard pipeline | Pass trace kept only the requested `productId` (`DED_AI_FAST`/`DED_AI_DETAIL`) | `AiToolsSuccess.provider/model` were discarded by the pass loop — **fixed additively in Sprint 4** (Task E §2): the final attempt's actual provider/model are now captured into the pass trace and the usage record. Tokens remain unavailable (not present in `AiToolsSuccess`) |
| DED Full AI pipeline | `resolveActualProviderModel(aiResult)` reads `result.provider`/`result.model` into output provenance and the usage record | Tokens (absent from the result type) |

**Verdict:** actual provider/model identity *is* available on this path
and is now preserved end-to-end on the DED side. Token usage is captured
by the gateway but **does not cross the HTTP boundary**; from the
client's perspective it is exactly as if the gateway did not report it
(`GATEWAY_DOES_NOT_REPORT_TOKENS`).

### 2. Streaming responses

- There is **no client-facing streaming** on the AI-tools path: the
  gateway sends `stream: false` upstream and always returns one complete
  JSON response; `providerClient` does a single `fetch` + `resp.json()`.
- Upstream SSE replies (some gateways answer SSE despite `stream:
  false`) are reassembled inside `callOAI` by `parseSseStreamContent`,
  which keeps the **last usage block seen** — so streamed upstream usage
  survives into the same normalised `usage` object, then hits the same
  HTTP-boundary drop as path 1.
- The Node adapters have the equivalent `parseSseCompletion` (keeps
  `chunk.usage`, `chunk.model`), whose result is dropped by
  `providerClient`'s Node branch (path 6).

**Verdict:** streaming changes nothing about observability today: usage
exists at the gateway, absent at the client.

### 3. Retry responses

Two distinct retry layers, with different observability:

- **Gateway failover/key retries** (inside `executeAI`): every attempt
  is recorded in `outcomes[]` with provider/model/ok/ms/errorClass, and
  the handler logs all of them and counts them for the meter
  (`attempts: attemptLog.length`, plus a `failures` list). **None of
  this history is returned to the client** — the response carries only
  the final attempt's provider/model. A client therefore cannot tell a
  first-try success from a fifth-attempt failover success, and cannot
  attribute usage to the attempts that failed.
- **Pipeline retry** (DED standard only): `executeDedPassAttempt`
  retries a MALFORMED outcome at most once; the retry count is recorded
  on the pass trace (`retryCount`) and, since Sprint 4, in the usage
  record (`calls[].retries`, `attempts = 1 + retries`). The identity
  recorded is the **final** attempt's; earlier attempts of the same pass
  contribute no identity or usage (their responses are discarded by
  design — items are taken only from the final outcome). Full AI has no
  pipeline retry (`retries: 0` is a real count).

**Design requirement (preserved by the Task E record shape):** fallback
and retry history *can* be preserved — `DedUsageCallRecord.attempts`
already counts pipeline attempts, and the record has room for a
gateway attempt history the day the gateway returns `attempts[]`
(extension X1). Today that history is server-log-only.

### 4. Fallback (provider chain) responses

Covered by the `attempts[]` mechanics above. Two identity subtleties,
both verified in code:

- **Requested vs. actual model:** the client asks for a *product*
  (`DED_AI_FAST`, …); the registry target is enforced by
  `providerClient` on the Node path and by the gateway's product→mode
  routing in the browser path. The `provider`/`model` in the gateway
  response are the chain's *serving* attempt identity (for
  OpenAI-compatible providers this is the provider label the gateway
  assigned to the attempt, e.g. `atmorouter`, with the model string it
  sent; the upstream's self-reported `d.model` is not substituted on
  this path). For Gemini the returned model is the model the gateway
  sent, not a provider-reported one.
- **Routing provider vs. actual billing provider:** when a gateway
  reseller (AtmoRouter, ZyRouter, Crown, River, Dahl) serves the call,
  the identity the client sees is the *routing* provider
  (`provider: 'atmorouter'`, model `ali/deepseek-v4.1-flash`). Which
  upstream ultimately billed is not represented anywhere in the
  response. Any future cost attribution must treat the recorded
  provider/model as the routing identity, not proof of the billing
  provider.

### 5. Vision / image interpretation responses

- The gateway has a `vision` mode chain (Gemini native first — the only
  path that also accepts PDF via inlineData — then River/AtmoRouter/
  ZyRouter via `image_url`). `callGemini`/`callOAI` capture usage
  identically for media requests, so vision usage exists server-side
  and is dropped at the same HTTP boundary.
- **DED does not use this path at all:** both DED pipelines parse the
  PDF locally and send text only (`parseDedPdf(..., { withImages:
  false })`; the standard service states this explicitly as its F4
  honesty label). No current `src/ai-tools` feature passes
  `imageDataBase64` through `providerClient` — the field exists in
  `AiToolsRequest` only. Scanned/image pages are a known DED blind spot
  (no OCR), recorded in the analysis trace as `NO_TEXT`, unrelated to
  billing.

### 6. Multi-file workflows

- The DED view runs **one service execution per file** (standard and
  Full AI alike); each execution is its own workflow with its own usage
  record (`calls[]` carry `sourceFile`). Within the standard pipeline,
  one file fans out into multiple pass calls, each a separate gateway
  request with its own `requestId`.
- Because `usage`/`attempts` never cross the HTTP boundary, there is
  currently **no way to correlate a DED workflow's calls with the
  gateway's per-request meter records from the client side** except by
  time and provider/model. `AiToolsSuccess.requestId` *is* returned by
  the gateway and read by `providerClient`, but the DED pipelines do
  not record it — a zero-risk future capture on the DED side (not done
  in Sprint 4: the pass trace has no requestId field and adding one to
  the shared result plumbing was left as extension X3 to keep this
  sprint's diff inside its fence).

### 7. Node adapter path (server-side execution / tests)

`server/providers/multiProvider/adapters.ts` returns rich results:
`{ content, structuredData, promptTokens, completionTokens, totalTokens,
reasoningTokens, latencyMs, keyAlias, providerId, modelId,
finishReason }` (Gemini from `usageMetadata`; OAI from `usage`, with the
actual `parsed.model` preferred for `modelId`). But
`providerClient`'s Node branch:

- reads `(result as any)?.provider ?? target.provider` and
  `?.model ?? target.model` — the adapters name these fields
  `providerId`/`modelId`, so the fallbacks (**requested** target
  identity) always win; the actual identity is silently replaced by the
  requested one on this path;
- drops `promptTokens`/`completionTokens`/`totalTokens`/
  `reasoningTokens` entirely (`AiToolsSuccess` has no token fields).

DED runs in the browser in production, so this path does not affect
DED records today; it matters for any future server-side DED execution
and for tests that mistake Node-path provenance for actual identity.

## Summary map

| Path | Actual provider/model at client | Tokens at client | Attempt/fallback history at client |
|---|---|---|---|
| Standard completion (browser) | **Yes** — preserved by DED since Sprint 4 | **No** — dropped at gateway HTTP boundary | No — server log/meter only |
| Streaming (upstream SSE) | Same as standard | Captured at gateway, dropped at same boundary | No |
| Pipeline retry | Final attempt only (by design) | No | Retry *count* yes; per-attempt detail no |
| Gateway fallback chain | Final (routing) provider/model only | Successful attempt's usage stays server-side; failed attempts' usage recorded nowhere | Server-side only (`outcomes[]`, logs, meter counts) |
| Vision | Same mechanics as standard | Same drop | Same |
| Multi-file | Per file/call, as standard | No | No cross-request correlation key recorded by DED |
| Node adapters | **No** — requested identity substituted (`providerId`/`modelId` field-name mismatch) | Returned by adapters, dropped by `providerClient` | n/a |

## Smallest extensions needed

Nothing below was implemented in Sprint 4: X1/X2/X4 live in files owned
by the gateway/`providerClient` platform work (Sprint 3), and X3 is
listed with its DED-side half already prepared.

- **X1 — Return usage + attempts in the gateway success response.**
  File: `api/_lib/aiGateway.js` (owner: gateway/Sprint 3 platform), in
  `handleAiRequest`'s success branch: add `usage: r.usage || null` and
  `attempts: r.attempts` (already computed for logging/metering) to
  `responseBody`. No new data collection, no secret exposure (the usage
  object contains only token counts and a `source` tag; attempt entries
  contain provider/model/status/timing/error class — the same fields
  already logged). This single change makes every browser-path feature
  able to record real evidence.
- **X2 — Carry usage through `providerClient`.** File:
  `src/ai-tools/providerClient.ts` (owner: shared AI-tools platform):
  add `usage?: { inputTokens, outputTokens, cachedTokens,
  reasoningTokens? } | null` and optionally `attempts?` to
  `AiToolsSuccess`, populated from the gateway JSON (browser branch)
  and from the adapters' `promptTokens/completionTokens/totalTokens`
  (Node branch, mapping `cachedTokens: null` — the adapters do not
  report a cached count today). Also fix the Node branch to read
  `providerId`/`modelId` so actual identity stops being replaced by
  the requested target. Once X1+X2 land, the DED builders can fill
  `calls[].inputTokens/…` with no further shape change — the fields and
  the `missingEvidenceReason` semantics already anticipate real values.
- **X3 — Record `requestId` per DED call.** DED-side (this program's
  fence): add `requestId` to `DedPassTraceEntry`/`DedUsageCallRecord`
  from `AiToolsSuccess.requestId`, enabling exact correlation with the
  gateway meter. Deferred from Sprint 4 to keep the diff minimal;
  zero-risk and additive when scheduled.
- **X4 — Failed-attempt usage at the gateway.** File:
  `api/_lib/aiGateway.js` (owner: gateway/Sprint 3 platform): when a
  provider returns usage on a failed/empty attempt, keep it on the
  outcome instead of forcing `usage: null`, so the meter — and the
  Sprint 3 rule "unknown usage from a failed file → REQUIRES_REVIEW" —
  can distinguish "known zero" from "unknown". Behaviour of routing is
  unchanged; this is bookkeeping only.

## Rules honoured by this audit

- No API keys or credential values appear in any log, record, or this
  document; the gateway's structured logging is already secret-free
  (hashed IPs, prompt hashes, no key material) and nothing here weakens
  that.
- No sensitive document content is logged or quoted; DED records carry
  page numbers and file names, never document text.
- Requested vs. actual model, and routing provider vs. billing
  provider, are kept distinct throughout (Task E record fields:
  `requestedProvider/requestedModel` vs. `provider/model`).
- No cost figure is inferred from a model ID anywhere; DED
  `providerCostIdr` remains null with the explicit reason
  `PROVIDER_COST_NOT_REPORTED`.
- Routing and credential policies were not modified.
