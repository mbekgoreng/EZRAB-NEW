# DED Sprint 5 — Gateway Usage Evidence (Workstream A: X1, X2, X4)

Date: 2026-11-10. Scope: additive only. Routing, provider chains, settlement logic and
tariff rules untouched. `AI_METERING_ENABLED` remains OFF and untouched.

## X4 — failure usage preserved (api/_lib/aiGateway.js)

Sprint 4 finding: `callGemini`/`callOAI` captured usage on success only; the policy-block
path produced no usage object and the empty-response path produced an all-null skeleton;
`executeAI` forced `usage: null` on failure outcomes, discarding usage the provider had
already reported on a failed attempt.

Changes:
- `callGemini` and `callOAI` now build the normalized usage object **before** the
  policy-block and empty-response checks and attach it to those failure returns. A
  policy-blocked or empty response that carried provider-reported usage now preserves it.
  HTTP/network failures still carry no usage (none exists).
- `executeAI` outcome construction now preserves failure usage for both the
  `finishAiRequest` and `releaseAiRequest` paths (`usage: r.usage || null`).

Failed-attempt usage is preserved **per attempt** and is never aggregated into the final
usage (see X1). REQUIRES_REVIEW-grade evidence (per-attempt usage + error class) is
therefore available without any fabricated totals.

## X1 — client-safe response evidence (api/_lib/aiGateway.js)

New exported helpers: `sanitizeUsageForClient(raw)` and `sanitizeAttemptForClient(a)`.

`handleAiRequest` success body gains three additive fields (all pre-existing fields and
their meanings unchanged; the idempotency cache stores the body, so replays carry
identical evidence):

| Field | Meaning |
|---|---|
| `usage` | Normalized usage of the **final attempt only**, or `null` when unknown. |
| `usageStatus` | `measured` / `measured_zero` / `missing` / `malformed`. |
| `attempts` | Ordered array of client-safe attempt records. |

Attempt schema (minimal, documented): `{ provider, model, ok, ms, errorClass?, usage,
usageStatus }`. `provider`/`model` are the **actual** adapter-reported identity, never
the requested/routing identity. Raw error text is never included (it can embed internal
URLs or parameters); only the classified `errorClass` is exposed. API keys, auth headers,
prompt/document content and secret-like strings are excluded by construction (the
sanitizer whitelists fields).

Usage status semantics (six-state distinction required by X4):
1. Explicit measured zero → usage object with zeros + `measured_zero`.
2. Valid measured usage → usage object + `measured`.
3. No usage returned → `usage: null` + `missing`.
4. Provider failed before usable usage → the attempt records `usage: null` + `missing`
   (or measured usage when the provider did report it before failing, per X4).
5. Malformed/incomplete evidence (negative numbers, NaN, wrong types, or validity
   counters inconsistent with the token fields) → `usage: null` + `malformed` — never a
   fabricated count, never zero.
6. Retry with differing final-attempt usage → final `usage` is the final attempt's only;
   earlier attempts remain visible in `attempts[]` with their own usage.

An all-null usage skeleton (the shape the gateway itself constructs when a provider
reports nothing) is normalized to `usage: null` + `missing`, not exposed as an object.

## X2 — client normalization (src/ai-tools/providerClient.ts)

- New exported types: `AiToolsUsage`, `AiToolsUsageStatus`, `AiToolsAttemptEvidence`;
  new pure exported functions `normalizeAiUsage(raw, reportedStatus?)` and
  `normalizeAiAttempt(raw)` implementing the same four-state semantics (absent stays
  null; explicit zero stays zero; malformed becomes null + `malformed`).
- `AiToolsSuccess` gains optional `usage`, `usageStatus`, `attempts`.
- Browser branch parses the gateway's new fields; legacy gateway responses without them
  remain accepted (`usage: null`, `usageStatus: 'missing'`, no attempts).
- Node branch identity fix: adapters report `providerId`/`modelId`; the client
  previously read non-existent `provider`/`model` fields, so the *requested* target
  identity always won. Now `providerId`/`modelId` take precedence, with the target as
  last-resort fallback. Adapter token fields (`promptTokens`, `completionTokens`,
  `totalTokens`, `reasoningTokens`) are forwarded normalized with
  `source: 'node_adapter'`; `cachedTokens` stays null (adapters do not report it);
  `keyAlias` is never surfaced.

## Tests

`src/test/dedGatewayUsageEvidence.mjs` — 6/6 groups PASS (live in-process gateway over
real HTTP): Gemini usage crosses the HTTP boundary; measured-zero distinguishable from
missing; failed-attempt usage preserved per attempt and not aggregated (failover history
intact, raw error text absent); no secrets on the wire; sanitizer malformed handling;
attempt sanitizer strips raw errors and secret-like strings.
Regression: `gatewayIdempotency` 5 checks PASS; `apiEndpointInventory` 13/13.
Cross-programme note: `chatFastMetering.test.ts` measures 113 PASS / 1 FAIL — the single
failure is its exact-shape assertion on the success body, superseded by design by the X1
additive fields; updating that expectation is a Credits-side decision (see final report).
