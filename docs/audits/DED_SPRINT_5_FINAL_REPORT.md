# DED Sprint 5 — Final Report: Evidence Plumbing, Complexity Contract & Worktree Closure

Date: 2026-11-10. Repo: `/home/hatch/workspace/ezrab-unified`, branch
`integrasi/unified-ui-engine`, HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896`
(verified at start and unchanged at end). Local only. Companion documents:
`DED_SPRINT_5_GATEWAY_USAGE_EVIDENCE.md`, `DED_SPRINT_5_REQUEST_CORRELATION.md`,
`DED_SPRINT_5_COMPLEXITY_CONTRACT.md`, `DED_SPRINT_5_PRICE_REFERENCE_REFRESH.md`,
`DED_SPRINT_5_REGRESSION.md`, `DED_SPRINT_5_COMMIT_READINESS.md`.

## FINAL VERDICT: PARTIAL

Justification: Workstreams A and B are implemented and tested; Workstream C reached its
legitimate documented outcome (owner decision required, current behaviour pinned);
Workstream F is complete. But Workstream D — a full workstream — produced **zero**
refreshes because the web-research infrastructure failed, and one Credits-owned test
expectation now fails by design consequence of the mandated X1 change and awaits a
Credits-side decision. A whole workstream blocked plus an open cross-programme item is
more than a bounded limitation, so PASS WITH DOCUMENTED LIMITATIONS is not claimed.

## Mandatory statements

- Production readiness is **NOT** claimed.
- Billing remains **dormant**; `AI_METERING_ENABLED` remains **OFF** (untouched).
- `AUTH_ENABLED = false` is unchanged.
- **Zero** production migrations were executed (none at all; the unified-credits
  migration draft is byte-identical to baseline and remains archive-only).
- **Zero** deployments. **Zero** commits, staging, pushes, merges or tags — this sprint
  held no commit grant; Workstream F prepared readiness only.
- Status A (public showcase only) is unchanged.

## Implemented and tested

- **Workstream A (X1/X2/X4)** — gateway usage evidence now crosses the HTTP boundary:
  failure-path usage preserved per attempt (never aggregated), client-safe
  `usage`/`usageStatus`/`attempts` on the success body with four-state semantics
  (measured / measured_zero / missing / malformed), actual provider/model identity
  honoured on the Node client path (`providerId`/`modelId`), raw errors and secrets
  never exposed. Suite: `dedGatewayUsageEvidence` 6/6 groups.
  Detail: `DED_SPRINT_5_GATEWAY_USAGE_EVIDENCE.md`.
- **Workstream B (X3)** — DED per-call `requestId` correlation and real per-call token
  plumbing in both pipelines, with the strict workflow-totals completeness rule (no
  partial totals). Suite: `dedRequestCorrelation` 26/26 (includes the Workstream C
  pins). Detail: `DED_SPRINT_5_REQUEST_CORRELATION.md`.
- **Workstream E** — all mandated regressions run; tsc exit 0; production build exit 0.
  Detail: `DED_SPRINT_5_REGRESSION.md`.
- **Workstream F** — full worktree inventory, proposed 8-batch commit manifest with
  shared-file analysis, baseline/final snapshots outside the repo, proof that no
  pre-existing change was lost. Detail: `DED_SPRINT_5_COMMIT_READINESS.md`.

## Implemented but not fully verified

- Nothing in this sprint falls in this category: every implemented change has a passing
  suite. The gateway evidence path is verified in-process over real HTTP with fake
  providers (the established harness pattern); it has not been exercised against a live
  provider endpoint, because no live-provider test was authorized in this sprint.

## Blocked by unavailable infrastructure

- **Workstream D (curated price reference refresh): BLOCKED.** `browser.open` failed on
  4 independent URLs/domains (`browser-service exited with code 1`) — a tooling failure,
  not site downtime. Per the evidence rule (opened pages only; snippets are not
  evidence), 0 of 13 families could be verified, so **no value, source or `accessedAt`
  was changed**. The honest post-block state is pinned by
  `dedPriceReferenceRefresh` 14/14. Consequence: **all 13 curated families become STALE
  after 2026-12-10**; a retry recipe (7 core URLs) and unverified indications are
  recorded in `DED_SPRINT_5_PRICE_REFERENCE_REFRESH.md`.

## Deferred — owner decision required

- **Workstream C (F-E2 complexity contract): OWNER DECISION REQUIRED.** Code evidence
  shows the complexity control is a simulation display choice that never reaches the
  service; wiring it would change the recorded billing classification of DETAIL
  workflows (`ded-ai/medium` → selected key). No behavioural change was implemented;
  current behaviour is pinned by tests and a minimal implementation proposal is written
  in `DED_SPRINT_5_COMPLEXITY_CONTRACT.md`.

## Cross-programme item (owned by Unified Credits, surfaced — not fixed here)

`chatFastMetering.test.ts` now measures **113 PASS / 1 FAIL**: its exact success-body
shape assertion is superseded by the X1 additive fields mandated by this sprint. All
other gate-OFF parity checks pass. Updating that expectation is a deliberate Credits-side
decision; the file was not edited by this sprint.

## Out of scope (untouched, by design)

Credits ledger/allocation/reservation/settlement/tariff/migration architecture;
`api/_lib/featureBillingMatrix.js` (read-only; md5 identical to baseline); all PDF code;
`DedAiInputView.tsx`/`view.tsx` complexity wiring; `externalPriceReferences.ts` values;
production data, env, secrets.

## Files changed by this sprint (exact)

Modified: `api/_lib/aiGateway.js`, `src/ai-tools/providerClient.ts`,
`src/ai-tools/ded-ai-estimate/types.ts`, `src/ai-tools/ded-ai-estimate/service.ts`,
`src/ai-tools/ded-ai-estimate/usageMetadata.ts`, `src/ai-tools/ded-full-ai/service.ts`.
New: `src/test/dedGatewayUsageEvidence.mjs`, `src/test/dedRequestCorrelation.src.ts`,
`src/test/dedPriceReferenceRefresh.src.ts`, and the 7 documents listed above.

## §9 acceptance criteria — one by one

1. Gateway usage crosses HTTP additively, legacy clients compatible — **PASS**
   (6/6 suite; legacy responses accepted by the client normalizer).
2. Failed-attempt usage preserved, never aggregated into final usage — **PASS**.
3. Measured zero distinguishable from missing; malformed never fabricated — **PASS**.
4. No secrets/raw internal errors exposed — **PASS** (whitelist sanitizer; suite checks).
5. Actual provider/model identity not replaced by routing identity — **PASS**
   (Node `providerId`/`modelId` fix + tests).
6. DED per-call requestId correlation, per file and per pass — **PASS** (26/26 suite).
7. Missing requestId/tokens remain honestly null; no partial workflow totals — **PASS**.
8. No second usage ledger created — **PASS** (existing builders extended additively).
9. Complexity: gate decided from code evidence; behaviour unchanged without owner
   approval; current behaviour pinned — **PASS WITH DOCUMENTED LIMITATIONS**
   (F-E2 = OWNER DECISION REQUIRED).
10. No feature key produced that is absent from the canonical matrix — **PASS**
    (all three `ded-ai/*` keys verified present, read-only).
11. No tariff value changed; no credit debited; metering stays OFF — **PASS**.
12. Curated references refreshed only with verified sources — **BLOCKED**
    (infrastructure failure; zero changes made rather than unverified changes).
13. Historical price records and provenance preserved — **PASS** (byte-preserved;
    pinned by test).
14. Canonical reference service remains read-only; OFFICIAL tier empty without evidence;
    freshness reported correctly — **PASS** (14/14 + 19/19 suites).
15. Resolver behaviour unchanged — **PASS** (dedPriceCompletion 43/43; fixture total
    Rp149.023.200 unchanged).
16. Mandated regression suites run with exact commands/counts — **PASS**
    (see regression doc; bundled pdfjsCompat artifact classified, unbundled 28/28).
17. TypeScript and production build green — **PASS** (tsc exit 0 after one
    Sprint-5-owned implicit-any fix; build exit 0).
18. Worktree inventory + commit-ready batch manifest without committing — **PASS**.
19. Fences held: no commit/staging/push/deploy/migration/activation; baseline work
    preserved — **PASS** (status delta = exactly this sprint's 4 additions; HEAD
    unchanged; zero staged entries).

## Snapshots

Baseline: `~/workspace/your_files/EZRAB-DED-SPRINT5/snapshot-baseline-2026-11-10-0705/`.
Final: `~/workspace/your_files/EZRAB-DED-SPRINT5/snapshot-after-2026-11-10-0745/`.
