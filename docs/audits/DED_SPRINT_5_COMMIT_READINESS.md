# DED Sprint 5 — Worktree Inventory & Commit Readiness (Workstream F)

Date: 2026-11-10. **No commit is authorized by this sprint.** Nothing was staged,
committed, pushed, merged or tagged. This document is the proposed batch manifest only.

## F1 — Inventory

Baseline (sprint start): HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896`, branch
`integrasi/unified-ui-engine`, 78 status entries (29 modified tracked + 49 untracked
entries). Final: 82 entries (30 modified + 52 untracked). The status diff against the
baseline snapshot is **exactly** the 4 Sprint 5 DED additions (1 newly modified file +
3 new test files); 5 further files already modified at baseline received additive
Sprint 5 edits. No pre-existing change was lost or reverted (verified by status diff and
md5 comparison; `api/_lib/featureBillingMatrix.js` and the unified-credits migration
draft are byte-identical to baseline).

Accumulated local packages in the worktree:
- **Unified Credits Phase 1** — pricing policy, feature billing matrix, reconciliation,
  archive migration draft, 4 test suites (dormant foundation, zero production callers).
- **Unified Credits Phase 2** — ledger/allocation hardening (`creditLedger.js`,
  `creditAllocation.js`), adversarial suite, architecture/audit docs.
- **Unified Credits Sprint 3** — in-process concurrency closure (`billingStore.js`,
  `creditLedger.js`), dormant metering boundary (`aiMetering.js`,
  `aiMeteringLifecycle.js`), DED billing adapter, migration draft repairs.
- **Unified Credits Sprint 4** — Chat FAST metering insertion in `aiGateway.js` +
  `chatFastMetering.js`, adversarial suite repair, SQL static review docs.
- **Unified Credits Sprint 5** — running in parallel (SQL harness / migration / credit
  tests); its entries may appear after this snapshot.
- **DED gap-fix** — curated external price references, price completion, research cache,
  calculator fixes, 38-row owner fixture.
- **DED/Documents shell** — `FeaturePageShell`, DED AI + AI Document view migration.
- **DED Final Hardening** — approval persistence, quantity classification, cache fixes.
- **DED Sprint 4** — pdf.js legacy fix, Full AI parity, canonical price reference
  service, material specification validation, per-call usage metadata.
- **DED Sprint 5** — this sprint (gateway evidence X1/X2/X4, request correlation X3,
  complexity pins, price-refresh state pins, 7 audit documents).

**Exclusions (never stage without a separate explicit decision):** `scripts/ai-audit/*`
(3 modified + history files), `.github/`, `demo-gen/out/`, `k7-harness.html`,
`k7shots.mjs`, the literal `~/` folder inside the repo, `dist/`.

## F2 — Proposed commit-ready batches

Shared-file rule: several files carry changes from multiple programmes (notably
`api/_lib/creditLedger.js`, the unified-credits migration draft, and the DED
`service.ts`/`types.ts`). Per-hunk splitting of those files was assessed **unsafe**
(interleaved programme changes); consistent with the owner's combined-commit precedent
(2026-11-10), each shared file lands whole in the earliest batch that contains it, and
later batches note the dependency. DED and Credits changes are **not** merged into one
batch merely for sharing a worktree, except where a single file physically contains both
(`api/_lib/aiGateway.js`: Credits Sprint 4 metering insertion + DED Sprint 5 X1/X4 —
one file, lands once, in Batch 4).

| # | Batch | Owner programme | Contents (summary) | Depends on | Key tests | Risks |
|---|---|---|---|---|---|---|
| 1 | Credits Phase 1 foundation | Credits | `api/_lib/pricingPolicy.js`, `featureBillingMatrix.js`, `creditReconciliation.js`, `supabase/migrations/20261110_unified_credits_foundation.sql` (archive only), 4 credit test suites, Phase 1 docs | — | pricingPolicy 33, featureBillingMatrix 87, creditReconciliation 23, unifiedCreditLifecycle 31 | Migration is archive-only; must never be executed as part of the commit |
| 2 | Credits Phase 2 hardening | Credits | `api/_lib/creditLedger.js`, `creditAllocation.js`, adversarial suite, Phase 2 docs | 1 | adversarial 71/71 (post-Sprint-4 repair) | `creditLedger.js` also carries Sprint 3 changes — lands whole here |
| 3 | Credits Sprint 3 metering boundary | Credits | `api/_lib/billingStore.js`, `aiMetering.js`, `aiMeteringLifecycle.js`, `dedBillingAdapter.js`, 4 test suites, Sprint 3 docs; migration draft repairs ride with Batch 1's file | 1, 2 | concurrency 52/52, metering 83/83, deterministic-free 94/94, DED adapter 42/42 | Dormant by design (`AI_METERING_ENABLED` OFF); zero production importers is intentional |
| 4 | Gateway evidence + Chat FAST | Shared (Credits S4 + DED S5) | `api/_lib/aiGateway.js`, `api/_lib/chatFastMetering.js`, `src/test/chatFastMetering.test.ts`, `src/ai-tools/providerClient.ts`, `src/test/dedGatewayUsageEvidence.mjs`, Sprint 4 Credits report + this sprint's gateway doc | 3 | chatFastMetering (113/1 — see note), dedGatewayUsageEvidence 6/6, gatewayIdempotency 5, apiEndpointInventory 13/13 | **Note:** the exact-shape assertion in chatFastMetering must be deliberately updated by the Credits side for the X1 additive fields — decide before or with this batch |
| 5 | DED gap-fix | DED | `externalPriceReferences.ts`, `priceCompletion.ts`, `priceResearchCache.ts`, `calculator.ts`, `finalizeMapping.ts`, `DedAiResultView.tsx`, `jakartaPrices.ts`, fixture `dedOwnerTable38.ts`, `dedPriceCompletion.src.ts` | — | dedPriceCompletion 43/43 (total Rp149.023.200) | Curated references go STALE after 2026-12-10 (Workstream D blocked) |
| 6 | DED/Documents shell | DED/UI | `FeaturePageShell.tsx` + css, `FeatureFullscreenShell.tsx`, `WorkspaceView.tsx`, DED `view.tsx`, `DedAiInputView.tsx`, DocAnalyzer, DocLibrary, document-ai view + css, `dedDocPageShell.test.ts`, `mobileNativeW2.test.ts` | — | dedDocPageShell 50/50 | UI-only; old fullscreen module retained (still imported elsewhere) |
| 7 | DED Hardening + Sprint 4 + Sprint 5 | DED | ded `service.ts`, `types.ts`, `usageMetadata.ts`, `materialSpecValidation.ts`, `canonicalPriceReferenceService.ts`, ded-full-ai `service.ts`/`types.ts`/`validator.ts`/`FullAiResultView.tsx`, `pdfjsSetup.ts`, `pdfPageService.ts`, test suites (dedHardening, dedPdfjsCompat, dedFullAiParity, dedMaterialSpec, dedCanonicalReferenceService, dedUsageCreditsCompat, dedBillingCompat, dedRequestCorrelation, dedPriceReferenceRefresh), DED docs | 5 (imports price completion + references), 4 (consumes gateway evidence fields) | 806-check hardening baseline + Sprint 4 (848 + 155) + Sprint 5 suites; tsc 0; build 0 | Largest batch; pdf.js legacy pairing is version-sensitive (6.3.289 both sides) |
| 8 | Remaining docs | Both | `docs/audits/`, `docs/architecture/`, `docs/product/` files not already landed with their code batches | respective code batches | — | Docs-only; safe to land last |

Recommended commit order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

## F3 — Approval required

Exactly one thing is needed to proceed: an **explicit owner grant naming the commit
action and its scope** — either per-batch (e.g. "commit Batch 1") or a whole-tree
instruction ("push semua" / "commit semua") accepting the shared-file combination above.
A push requires its own grant naming the push; a commit grant does not imply a push
grant. Until then the correct state is: everything local, HEAD unchanged at
`99de8927d3bdb0bc6e2befbcb22e290f64971896`, zero staged entries.

## F4 — Snapshots

- Baseline: `~/workspace/your_files/EZRAB-DED-SPRINT5/snapshot-baseline-2026-11-10-0705/`
- Final: `~/workspace/your_files/EZRAB-DED-SPRINT5/snapshot-after-2026-11-10-0745/`
  (HEAD, branch, full git status, tracked patch, diffstat, md5 of relevant files,
  research notes, README with the exact status delta).
