# DED Full AI Parity — Sprint 4 (Task B)

**Date:** 2026-11-10 · **Status:** Done locally, uncommitted (coordinator runs the final `tsc` + build pass; no commit/push/reset/clean performed).
**Scope closed:** the remaining parity gaps from the Hardening report, Section F / I-P2-1 & I-P2-6: structured price-completion metadata, the shared 8-class quantity vocabulary, and recorded user approval for the `ded-full-ai` pipeline.
**Untouched by design:** Sprint 3 files (`api/_lib/*`, `supabase/migrations/*`), the PDF loader (Task A: `src/lib/pdfjsSetup.ts`, `src/ded-rab-v2/ingestion/pdfPageService.ts`), and the behaviour of the standard pipeline (`ded-ai-estimate`) — every shared helper needed was already exported, so **no change to `ded-ai-estimate` was required at all**.

---

## 1. Parity table — before / after

| # | Capability | Standard pipeline (`ded-ai-estimate`) | Full AI — BEFORE Sprint 4 | Full AI — AFTER Sprint 4 |
|---|--------------|------------------------------------------|----------------------------|----------------------------|
| 1 | Structured price-completion block | `DedPriceCompletion` on every completed item: classification, `sourceKind` (via `priceSourceKindFor`), verification status, approval status, original/proposed price, source name/URL/dates, region, scope, stale flag, history | String note in `price.notes` + stale wording + boolean `price.filledFromExternalRef` only | **Parity.** External-reference fills carry the same `DedPriceCompletion` type (imported, not duplicated), built by `buildFullAiPriceCompletion` with identical semantics: fresh ref → `MARKET_REFERENCE`; stale ref → `AI_ESTIMATE` + `sourceStale` + LOW confidence; `priceSourceKindFor` mapping (contractor market → `MARKET_REFERENCE`, supplier/manufacturer → `VERIFIED_SUPPLIER`); `UNVERIFIED` + `PENDING`; original price recorded. Block stored at `price.priceCompletion` **and** mirrored at `item.priceCompletion` (the standard item-level position). String note + `filledFromExternalRef` retained for backward compatibility (the RAB finalize mapper reads `price.notes`) |
| 2 | Material spec-conflict guard | `findExternalReference` rejects conflicts via `referenceSpecConflict`; a keyword-matching but spec-conflicting reference additionally produces an explicit `NEEDS_VERIFICATION` price block (`findConflictingReference`) — price stays empty, reason is visible | Same `findExternalReference` was already used, so conflicting prices were never filled — but the rejection was silent (no structured trace) | **Parity.** `completeFullAiPrices` also consults the shared `findConflictingReference`: a conflicting item keeps its empty price and gains a `NEEDS_VERIFICATION` / `PRICE_UNRESOLVED` / `UNRESOLVED` block naming the rejected reference and reason |
| 3 | Quantity classification vocabulary | 8 classes (`DedQuantityClass`) via `classifyQuantityProvenance` + `DedQuantityAudit` block (original/proposed, method, inputs, formula, assumptions, confidence, verification, approval) | Context fills used the shared estimator but produced only Full AI's own provenance word (`ASSUMPTION`) + formula/assumptions/notes — no class, no audit block | **Parity.** `completeFullAiQuantities` now attaches a shared `DedQuantityAudit` (via `buildQuantityAudit`, with a `QuantityFillTrace` for fills) to **every** item it processes, at `quantity.quantityAudit` and mirrored at `item.quantityAudit`. Context fills classify `ESTIMATED_FROM_CONTEXT` with original quantity preserved, `plan-context-estimate` method, `PENDING` approval; genuine drawing items classify `DRAWING_EXTRACTED`; deliberate zeros classify `EXPLICIT_ZERO` and are still never filled |
| 4 | Context fills never masquerade as drawing facts | Fill path sets `ASSUMPTION` source; classifier maps it to `ESTIMATED_FROM_CONTEXT` (fragment originals recorded in the audit, not the class) | Fill set provenance `ASSUMPTION` + a "not a drawing fact" note (Hardening Stage 4) | **Parity, now machine-checkable.** The audit block proves it: fills are `ESTIMATED_FROM_CONTEXT`, never `DRAWING_EXTRACTED`; the validator additionally warns if a `plan-context-estimate` audit ever claims `DRAWING_EXTRACTED` |
| 5 | Recorded user approval (accept / reject) | `acceptCompletion` → `APPROVED` on price + quantity blocks, values/verification unchanged; `rejectCompletion` restores original price/quantity and revokes the fill blocks | No accept/reject existed for Full AI completions | **Parity.** `acceptFullAiCompletion` / `rejectFullAiCompletion` in `ded-full-ai/service.ts`, rendered in `FullAiResultView.tsx` (Terima/Tolak buttons + structured block display). Accept marks `APPROVED` and changes **nothing else**: verification stays `UNVERIFIED`, a market reference does **not** become official AHSP, item price source stays `AI_ESTIMATE`. Reject restores original values (price and/or quantity), revokes the fill blocks, clears `filledFromExternalRef`, and recomputes subtotal/status with the loop's own rules |
| 6 | Price sanity band | `isSaneEstimate` (Rp100 – Rp50B per unit) rejects insane AI prices at conversion | No equivalent check in the Full AI validator | **Partial (warning only — see §3).** Validator warns using the shared `isSaneEstimate`; hard rejection deferred |
| 7 | Canonical claim traceability | Adapter only emits `AHSP_2026` together with a verified code | Validator warned only for legacy `VERIFIED_SOURCE` without a code | **Parity (warning).** `AHSP_2026` without `ahspCode` now also warns |
| 8 | Implausible-fragment quantities | `classifyQuantity` discriminator (`IMPLAUSIBLE_FRAGMENT`: structural volume < 0.01 m³, listplank < 1 m′) | Validator had no fragment notion; the fill pass already handled fragments | **Parity (warning).** Validator recognises fragments via the shared `classifyQuantity`; filling/handling remains the completion pass's job |
| 9 | Structured-block consistency | Blocks are produced by one completion layer; no re-validation of stored blocks | Blocks did not exist | **New (warning only).** `validateFullAiCompletionBlocks`: enum validity (quantity class, approval, verification), `recommendedPrice` vs applied price, and a second-line spec-conflict check on the block's referenced source |

---

## 2. Exact changes

### `src/ai-tools/ded-full-ai/types.ts` (additive / optional only — backward compatible)
- Imports and re-exports the standard `DedPriceCompletion` / `DedQuantityAudit` types — reused, never duplicated.
- `FullAiPriceDetail.priceCompletion?: DedPriceCompletion`
- `FullAiQuantityDetail.quantityAudit?: DedQuantityAudit`
- `FullAiItem.priceCompletion?: DedPriceCompletion` and `FullAiItem.quantityAudit?: DedQuantityAudit` (item-level mirrors of the nested blocks, matching `DedAiItem`'s layout).

### `src/ai-tools/ded-full-ai/service.ts`
- **Price completion extracted from the conversion loop into a testable pass.** The inline external-reference fill inside `runExecute` was replaced by a post-loop pass, mirroring how quantities already worked:
  - `buildFullAiPriceCompletion(ref, opts)` — structured block builder (standard `applyReference` semantics).
  - `buildFullAiConflictPriceCompletion(ref, reason, opts)` — `NEEDS_VERIFICATION` marker block (standard Stage-2 semantics).
  - `applyFullAiExternalReference(item, ref, opts)` — fills one item (price, note, flag, both block locations) and recomputes subtotal/status via `verifySubtotal` + `resolveFullAiItemStatus`.
  - `completeFullAiPrices(items, opts)` — the pass: skips priced/`USER_INPUT` items (canonical and manual prices are never touched), fills via the shared `findExternalReference`, marks conflicts via the shared `findConflictingReference`; returns the fill count. `runExecute` runs it in `FULL_AI` mode only, before the quantity pass, and reports fills in the warnings (same pattern as the quantity pass).
  - `fullAiPriceCompletionOf` / `fullAiQuantityAuditOf` — effective-block accessors (nested or mirror).
  - `acceptFullAiCompletion(item)` / `rejectFullAiCompletion(item)` — recorded approval (§1 row 5). One deliberate adaptation from the standard: `rejectCompletion` only runs when a price block exists (standard quantity fills always attach one via `quantityBasis`); Full AI quantity fills can stand alone, so the Full AI reject runs when **either** block exists.
- **`completeFullAiQuantities` extended** (Hardening Stage-4 function): item adaptation factored into `adaptFullAiItemForQuantityServices`; every processed item now receives the shared quantity audit (fills via fill-trace, others via plain `buildQuantityAudit`); when an item also carries a price block, the fill's formula is attached as `quantityBasis` (parity with the standard's `markQuantityBasis`). No price block is fabricated for quantity-only fills — a price block is only ever born from price completion.

### `src/ai-tools/ded-full-ai/validator.ts` (warnings only — see §3)
- `validateQuantityDetail`: shared-discriminator fragment warning (`IMPLAUSIBLE_FRAGMENT`).
- `validatePriceDetail`: `AHSP_2026`-without-code warning; shared `isSaneEstimate` band warning for `AI_ESTIMATE` prices.
- New `validateFullAiCompletionBlocks`, wired into `validateFullAiItem`: enum/consistency/spec-conflict warnings for structured blocks (§1 row 9).

### `src/ai-tools/ded-full-ai/FullAiResultView.tsx`
- Renders the structured price-completion block and the quantity-audit block per item (same fields as the standard result view: classification, source kind, verification, approval, range, scope, region, source + dates, spec assumption, quantity basis, method, stale flag, original values, history; audit class/method/confidence/formula/original→proposed).
- Terima/Tolak buttons for items with a pending completion (`acceptFullAiCompletion` / `rejectFullAiCompletion` via the existing `onUpdate` channel); an approved completion shows a recorded-acceptance line stating verification is unchanged.
- Manual edit and AHSP-candidate confirmation now revoke the completion/audit blocks they supersede (a user-typed value is `USER_PROVIDED`, not a completion fill; a canonical price is no longer explained by an external-reference block) — mirroring the standard view's edit behaviour of clearing the fill audit.

### `src/test/dedFullAiParity.src.ts` (new suite, 28 checks)
Sections A (structured price block + source-kind mapping + staleness + canonical/manual protection), B (spec-conflict parity), C (8-class quantity audit, explicit-zero, fragment), D (accept/reject incl. combined fill, price-only, quantity-only, no-block no-op), E (validator parity warnings).

---

## 3. Validation parity — applied vs deferred

The comparison covered: source provenance, missing price, missing quantity, explicit zero, quantity reasonableness, material spec conflict, mandatory basis notes, and partial results.

### Applied (safe: metadata consistency and enforcement that cannot change the finalization of a legitimate item)
1. **Spec-conflict trace (service):** conflicting references now leave a `NEEDS_VERIFICATION` block instead of silence. The price was already not filled (shared `findExternalReference`); finalization outcomes are identical — only the reason becomes visible.
2. **Fragment recognition (validator, warning):** shared `classifyQuantity` discriminator. The completion pass already fills fragments in `FULL_AI`; the validator changes no status.
3. **Canonical-claim traceability (validator, warning):** `AHSP_2026` without a code warns, mirroring the pre-existing `VERIFIED_SOURCE` rule.
4. **Price sanity band (validator, warning):** shared `isSaneEstimate` thresholds surface as a warning (see deferred item 1 for why not a rejection).
5. **Structured-block consistency (validator, warnings):** enum validity, block-vs-applied price agreement, block-level spec-conflict re-check.
6. **Already at parity, verified and left unchanged:** provenance/source enum validation; missing price/quantity → the same specific exclusion reasons via `resolveFullAiItemStatus`; explicit zero is warned by the validator and never filled by the quantity pass (now also classified `EXPLICIT_ZERO` in the audit); partial results are reported honestly (`summary.excludedFromTotal`, `grandTotalNote`, usage `isPartial`).

### Deferred (intentional differences — NOT forced)
1. **Hard rejection of out-of-band AI prices.** The standard pipeline *rejects* AI prices outside `isSaneEstimate` at conversion (`applyAiEstimatePrice` → `UNRESOLVED`). Applying the same rejection in Full AI would change which items finalize — exactly the finalization-semantics change the Hardening report's I-P2-6 fence reserves for an owner decision ("validasi ded-full-ai tidak menegakkan penolakan … mengubahnya mengubah perilaku finalisasi, perlu keputusan owner"). Shipped as a warning instead; no concrete defect evidence justifies crossing the fence unilaterally.
2. **Mandatory price basis note gate.** The standard `FULL_AI` conversion drops AI prices lacking a basis note (`unitPriceNote`). Full AI model output has no equivalent field, and adding the gate would null prices that currently finalize — a finalization change under the same I-P2-6 fence. Deferred. (Completion fills are unaffected: they always carry a full structured basis — source, spec assumption, method — in their block.)
3. **Flat finalization path without a basis-note gate / rejection enforcement in `FullAiResultView` finalize:** unchanged, per the same fence. The view's savable set (`READY` + subtotal > 0) is untouched.
4. **RAB persistence summary for Full AI completions.** The standard finalize mapper appends a completion summary (classification + source + dates) to the RAB row explanation; `mapFullAiItemToRabInput` does not. That mapper lives in `ded-ai-estimate/finalizeMapping.ts`, outside this task's file scope. Impact is limited: the Full AI price note already carries source name/URL/dates/range/scope/spec into the RAB explanation verbatim. Recorded here as the one known persistence-parity remainder for a future, in-scope change.
5. **Classification blocks for preserved canonical/manual prices.** The standard completion layer also attaches classification-only blocks to kept AHSP/manual prices. Full AI canonical items already carry `ahspCode` + `ahspMatch` + source `AHSP_2026` (self-describing, no completion occurred), so no block is fabricated for them in this sprint; only completions and conflict markers — the mandated scope — carry blocks.

### Known pre-existing pattern (not introduced, not worsened)
Per-item exclusion warnings are emitted during the conversion loop, i.e. against pre-completion state; the quantity pass (Hardening) already exhibited this, and the new price pass follows the same pattern. Both passes announce their fills in the warnings, and final totals/summaries are computed after all passes, so totals were and remain correct.

---

## 4. Test results

New suite (bundles under `~/workspace/.ded-sprint4-bundles/`, logs under `~/workspace/your_files/EZRAB-DED-SPRINT4/test-out/taskB/`):

| Suite | Result |
|-------|--------|
| `dedFullAiParity.src.ts` (new) | **28 PASS / 0 FAIL** |
| `dedFullAi.src.ts` (regression) | 24 PASS / 0 FAIL |
| `dedFullAiRegression.src.ts` (regression) | 15 PASS / 0 FAIL |
| `dedFullAiAcceptance.src.ts` (regression) | 15 PASS / 0 FAIL |
| `dedFullAiFinalCheck.src.ts` (regression) | 21 PASS / 0 FAIL |
| `dedFullAiQa.src.ts` (regression) | 18 PASS / 0 FAIL |
| `dedPriceCompletion.src.ts` (regression) | 43 PASS / 0 FAIL |
| `dedHardening.src.ts` (regression) | 34 PASS / 0 FAIL |

Per the task fence, no global `tsc` and no `vite build` were run — that gate belongs to the coordinator. Changed files pass esbuild parsing individually.
