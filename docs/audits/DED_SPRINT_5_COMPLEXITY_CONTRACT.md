# DED Sprint 5 — Complexity Contract (Workstream C: F-E2)

Date: 2026-11-10. **Decision: OWNER DECISION REQUIRED. No behavioural change implemented.**

## Evidence from the code (why the gate fired)

1. `src/ai-tools/ded-ai-estimate/DedAiInputView.tsx` labels the control explicitly as
   simulation: the credits line reads "AI Credits (simulasi): kategori dipilih user".
   The selected complexity drives only the local simulation tariff
   (`tariffFor('ded-ai/<complexity>')` → simulation `consume()`, whose return value is
   deliberately ignored) and the approval-checkbox label via the session's
   `creditEstimate`.
2. The raw complexity value is **not present** in the session object passed to
   `view.tsx`; the `dedAiEstimateService.execute({...})` calls there pass no complexity.
3. `DedAiServiceOptions` has no complexity field.
4. `buildDedUsageFromStandard` in `usageMetadata.ts` calls
   `dedStandardFeatureKey(output.mode)` without complexity, so a DETAIL workflow always
   records feature key `ded-ai/medium` (FAST records `ded-ai/simple`).
5. `api/_lib/featureBillingMatrix.js` (Credits-owned, read-only for this sprint) does
   contain valid keys `ded-ai/simple`, `ded-ai/medium`, `ded-ai/complex` — all
   `FLAT_DRAFT` / `WIRED_SIMULATION_PARTIAL`.

Conclusion: the complexity control is currently a **simulation display choice**, not an
explicit product/billing decision reaching the service. Wiring it through would change
the recorded billing classification (feature key) of real DETAIL workflows from
`ded-ai/medium` to the user-selected key. Under the sprint scope gate, that is a product
decision: **F-E2 = OWNER DECISION REQUIRED.**

## Current behaviour pinned by tests

`src/test/dedRequestCorrelation.src.ts`, section C (2 checks): DETAIL records
`ded-ai/medium` regardless of any UI selection (the service contract has no complexity
input); the three `ded-ai/*` keys exist in the canonical matrix file. Any future change
to this behaviour will fail these pins deliberately and must update them with the owner's
decision recorded.

## Minimal implementation proposal (for owner approval)

1. `DedAiInputView`: include the raw selected complexity in the session object passed to
   `view.tsx` (one field; the simulation display stays as-is).
2. `DedAiServiceOptions`: add optional `complexity?: 'simple' | 'medium' | 'complex'`.
   Absent stays absent — never default silently to medium.
3. `view.tsx`: pass `session.complexity` into `execute(...)` for DETAIL runs.
4. `usageMetadata.ts`: `buildDedUsageFromStandard` accepts the complexity and calls
   `dedStandardFeatureKey(mode, complexity)`; FAST remains `ded-ai/simple` unless the
   owner decides otherwise.
5. Validate every produced key against `api/_lib/featureBillingMatrix.js` (read-only
   dependency; all three keys already exist, so no matrix change is needed).
6. Tests: per-complexity feature-key assertions; absent-complexity assertion (recorded
   key must not silently become medium — either the workflow is recorded without a
   complexity-derived key or the absence is explicit in metadata).

Explicit warning for the owner: approving this changes the recorded feature key of
DETAIL runs from `ded-ai/medium` to the selected key. Tariff values do not change (all
three keys remain FLAT_DRAFT drafts), no credit is debited (metering stays OFF), and the
simulation display is unaffected. The change is metadata classification only — but it is
billing-visible metadata, which is why it is gated.
