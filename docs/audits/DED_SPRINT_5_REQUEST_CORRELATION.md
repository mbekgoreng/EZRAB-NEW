# DED Sprint 5 — DED Request Correlation (Workstream B: X3)

Date: 2026-11-10. Scope: additive metadata plumbing only. No second usage ledger was
created; the existing `DedUsageMetadata` builders remain the single record path.

## What was missing

Both DED pipelines recorded per-call usage metadata (file, pass, feature key) but had no
way to correlate a DED call with the gateway request that served it, and per-call token
fields were structurally `null` because the gateway discarded usage at the HTTP boundary
(fixed by Workstream A). Sprint 4 had already made the standard pipeline per-call
(`calls[]`) and specified this X3 extension.

## Changes

- `src/ai-tools/ded-ai-estimate/types.ts`
  - `DedUsageCallRecord.requestId?: string | null` (additive, backward compatible).
  - `DedPassTraceEntry.requestId?: string | null` and
    `DedPassTraceEntry.usage?: AiToolsUsage | null` (type imported from
    `src/ai-tools/providerClient.ts`).
- `src/ai-tools/ded-ai-estimate/service.ts`
  - `DedPassExecution` (success and provider-error variants) gains `requestId` and
    `usage`.
  - `executeDedPassAttempt` captures the **final attempt's** `requestId` (empty string
    from the Node execution path normalized to `null`) and the normalized usage returned
    by the client. Provider-error returns carry both as `null` (honest absence).
  - The pass loop writes `passTrace.requestId` / `passTrace.usage`.
- `src/ai-tools/ded-ai-estimate/usageMetadata.ts`
  - Standard builder: per-call `requestId` (sent passes only; unsent passes → `null`)
    and per-call token fields from the pass's real usage when present; otherwise tokens
    stay `null` with `GATEWAY_DOES_NOT_REPORT_TOKENS`; unsent calls keep
    `CALL_NOT_SENT`.
  - **Workflow totals rule:** each token field is totalled only when *every* sent call
    carries that field; otherwise the workflow total for that field is `null`. No
    partial totals. Workflow `missingEvidenceReason` is `null` only when input and
    output totals are both complete.
  - Full AI builder: `FullAiUsageSource` gains `requestId`, `inputTokens`,
    `outputTokens`, `cachedTokens`; the single call record and workflow totals follow
    the same completeness rule.
- `src/ai-tools/ded-full-ai/service.ts` — forwards `aiResult.requestId` (`''` → `null`)
  and the normalized usage token fields into the usage builder.

Identities remain separate throughout: call identity (requestId), product identity
(feature key / workflow / pass / file), requested identity and actual identity
(provider/model from Workstream A) are never conflated. A missing requestId is recorded
as `null`; no ID is ever fabricated. No document content or credentials are logged.

## Tests

`src/test/dedRequestCorrelation.src.ts` — 26 PASS / 0 FAIL: requestId and usage captured
per pass; the final attempt's ID wins after a retry; empty-string ID normalized to null;
two files keep distinct IDs; an unsent pass records null ID; workflow totals follow the
completeness rule (complete → totals, partial → null totals); Full AI forwards ID and
tokens; client normalizer semantics (missing/malformed/measured-zero).
Regression: `dedUsageCreditsCompat` 36/36 (existing fixtures carry no usage, so the
null-honesty contract is unchanged), `dedBillingCompat` 42/42, `dedPriceCompletion`
43/43, `dedFullAiParity` 28/28.
