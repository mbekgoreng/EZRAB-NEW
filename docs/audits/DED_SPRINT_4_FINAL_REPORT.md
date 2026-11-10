# DED Sprint 4 — Final Report

**Programme:** EZRAB Sprint 4 — DED Runtime Compatibility, Full AI Parity & Unified Credits Integration (owner master prompt 2026-11-10 06:04, Tasks A–H).
**Execution:** LOCAL ONLY. Production Status A — PUBLIC SHOWCASE ONLY. Billing DORMANT. `AUTH_ENABLED=false`.
**No production readiness is claimed by this report.**

## Executive verdict

Sprint 4 is **complete with documented limitations**. The shared PDF.js runtime defect is fixed and proven in Node 24 and in a real headless-browser runtime; Full AI reached metadata, quantity-audit, and approval parity with the standard pipeline through shared services (no second model); the two price-reference bases were inventoried (zero exact price conflicts) and projected into one canonical read-only reference service without changing resolution behaviour; material-specification conflict validation now covers grade/dimension attributes with conservative semantics; DED usage metadata is now per-call, null-honest, and shape-compatible with the Unified Credits Sprint 3 evidence contract; and the gateway observability audit pinpoints the exact HTTP boundary where provider usage is currently discarded, with the smallest required extensions assigned to their file owners.

Full regression: **848 baseline checks PASS before and after** (Hardening 806 + Sprint 3 dedBillingCompat 42), **155 new Sprint 4 checks PASS**, tsc exit 0, vite build exit 0, API inventory 13/13 (Vercel 12-function ceiling intact). HEAD unchanged. No commit, push, merge, deploy, migration, environment change, or billing activation occurred.

## Repository and Git state

- Root `~/workspace/ezrab-unified`; branch `integrasi/unified-ui-engine`; HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896` before and after (verified repeatedly).
- Baseline snapshot: `~/workspace/your_files/EZRAB-DED-SPRINT4/snapshot-baseline-2026-11-10/` (HEAD, git status — 53 entries, patch 3.137 lines, md5 of Sprint 4 + Sprint 3 areas, docs listing). After snapshot: `snapshot-after-2026-11-10/` (status 78 entries — growth is Sprint 3's own new files plus Sprint 4's, patch 4.268 lines, md5-after).
- Parallel programme: Unified Credits Sprint 3 ran in the same worktree the whole sprint. Sprint 4 never edited its files (`api/_lib/*`, `supabase/migrations/20261110_unified_credits_foundation.sql`, its tests/docs). Verified by md5: all Sprint 3 modules Sprint 4 only read are either byte-identical to baseline (creditLedger, creditAllocation, aiMeteringLifecycle, dedBillingAdapter, featureBillingMatrix, pricingPolicy, creditReconciliation) or changed by Sprint 3 itself during the sprint (billingStore, aiMetering, the migration draft, aiGateway) — never by Sprint 4. Every pre-existing uncommitted change (three local packages + exclusion leftovers) is preserved.

## Task A — PDF.js compatibility fix — PASS

- **Root cause:** `pdfjs-dist@6.3.289` modern build calls `Uint8Array.prototype.toHex` (Chrome 140+ / Firefox 133+ / Safari 18.2+ / Node 25+) with no polyfill; the worker invokes it on every `getDocument()` via `PDFDocument.fingerprints`, so PDF loading failed totally (but fail-closed) on older runtimes. EZRAB loaded the modern build in the browser loader and in one Node ingestion path. Detail: `docs/audits/DED_PDFJS_COMPATIBILITY_FIX.md`.
- **Fix:** shared loader `src/lib/pdfjsSetup.ts` now pairs the legacy main module (`pdfjs-dist/legacy/build/pdf.mjs`) with the version-identical legacy worker (`pdfjs-dist/legacy/build/pdf.worker.min.mjs?url`) for browser and Node; the CDN fallback was re-pointed to the exact-version legacy worker on jsDelivr (kept as a last-resort net, documented); `src/ded-rab-v2/ingestion/pdfPageService.ts` Node import switched to the legacy build. No hand-written `toHex` polyfill (the legacy build ships upstream core-js polyfills, including into the Worker scope). Dependency version unchanged; `package.json` untouched.
- **Evidence:** pre-fix reproduction on Node 24.22.1 (modern fails with the exact error; legacy loads the owner fixture: 32 pages, fingerprints readable). New suite `dedPdfjsCompat` 26 PASS / 0 FAIL / 2 SKIP (render checks SKIP in the bundled form — esbuild path artifact — and PASS via the unbundled tsx probe: 2 pages RENDERED with non-empty images; coordinator re-ran the probe on the final tree: PROBE PASS). Invalid PDFs still fail closed. All shared consumers regression-tested through their existing suites.
- **Browser evidence:** real runtime — headless Chromium (Playwright cache) + local HTTP server loaded the exact legacy files the loader now references: `SMOKE_OK version=6.3.289 numPages=32`, fingerprints readable. Qualifications (stated in the fix document): the page imported the legacy package files directly rather than through Vite's `?url` wiring (that wiring is verified statically and by the successful production build, whose output contains the legacy worker asset); Chromium 156 has native `toHex`, so the old-runtime rescue itself is proven by the Node 24 before/after evidence. Summary document: `docs/audits/DED_SPRINT_4_PDFJS_COMPATIBILITY.md`.

## Task B — Full AI parity — PASS (with two owner-gated deferrals)

Full AI items now carry the standard pipeline's structured `DedPriceCompletion` block (source kind/label, URL, source date, access date, region, scope, verification status, approval status, stale flag, original price, history) built by the shared semantics — fresh reference → `MARKET_REFERENCE`, stale → `AI_ESTIMATE` + `sourceStale` + LOW, supplier tier → `VERIFIED_SUPPLIER`, conflicts → structured `NEEDS_VERIFICATION` block. Quantity fills carry the shared 8-class audit (`buildQuantityAudit`): context fills are `ESTIMATED_FROM_CONTEXT` with the full estimation trail, drawing facts `DRAWING_EXTRACTED`, explicit zeros `EXPLICIT_ZERO`. Explicit accept/reject actions exist in `FullAiResultView` and persist `userApprovalStatus`; accept changes approval only — never verification status, never source, so a market reference can never become official AHSP through acceptance; reject restores original price and quantity and revokes fill blocks. Validator gained warning-only enforcements using shared helpers (fragment classification, AHSP-without-code, sane-estimate band, structured-block consistency). New suite `dedFullAiParity`: 28 PASS / 0 FAIL; all Full AI and standard suites green. Document: `docs/audits/DED_FULL_AI_PARITY_SPRINT_4.md`.
**Deferred by design (owner decision required — they change finalization behaviour, Hardening fence I-P2-6):** hard rejection of out-of-band prices in Full AI (warning only today), and a mandatory basis-note gate for flat-path prices. Also noted: the Full AI RAB mapper does not yet carry the structured completion summary (string source notes already reach the RAB), and canonical/manual retained prices carry no completion block (self-describing via `ahspCode`/`ahspMatch`).

## Task C — Canonical price reference architecture — PASS (design + additive read-only layer)

Full inventory of both bases (document §2): curated base = 13 families (data 2026-10-22, accessed 2026-11-10, 30-day TTL → **all stale after 2026-12-10**); Jakarta base = 49 entries (no per-entry URL/dates/confidence; 12 carry 2026-11-10 research notes). **13 aligned pairs, zero exact price conflicts** (Rp0 deltas). Documented overlap hazards instead: generic Jakarta window Rp650.000 vs curated aluminium Rp900.000 (Δ −250.000); installed frame 165.000 vs component sum 230.000/m² (double-count risk); intra-Jakarta "Urugan tanah kembali" 45.000 vs "Urugan tanah" 95.000/m³ (2.1×); linear-unit notation inconsistency (`m1` vs `m′`). 36 Jakarta entries are unique coverage (prompt guidance), 0 curated entries lack a Jakarta counterpart.
Implemented additively: `canonicalPriceReferenceService.ts` projects all 62 records into one canonical model (Jakarta provenance gaps are `null`/unknown — never borrowed; derived IDs are declared derived), preserves the source hierarchy with the **OFFICIAL_SSH_HSPK tier empty by design** (no fabricated records), exposes freshness (FRESH/STALE/UNKNOWN) and a revalidation worklist (on 2026-12-11: 25 stale + 37 unknown). **Behavioural unification was deliberately NOT done**: promoting the 36 uncurated Jakarta entries into the deterministic resolver would change resolution results — a product decision, not a refactor — and deleting the prompt table would remove Full AI price guidance. A 4-stage migration plan, risks, and the refresh process (real re-research only; new access dates only from real research; historical prices preserved and auditable; deadline 2026-12-10) are documented in `docs/architecture/DED_CANONICAL_PRICE_REFERENCE_SERVICE.md`. New suite: 19 PASS / 0 FAIL; fixture results unchanged (43/43, total Rp149.023.200).

## Task D — Material specification conflict validation — PASS

New pure module `materialSpecValidation.ts` (18 structured attributes: light-steel/sheet/profile/glass/gypsum/GRC thicknesses, window dimensions, cable cross-section, concrete K- and f′c classes, rebar diameter/grade/form, pipe diameters in mm and inch kept separate, pipe material, roof coating grade AZ, paint coat count), wired additively into the existing `referenceSpecConflict` (legacy category rules run first; legacy reason strings preserved exactly; Full AI inherits the guard through the shared helper). Semantics are conservative: an attribute missing on the item side stays compatible (incomplete ≠ conflict) for every attribute **except concrete class**, which is essential — a reference stating a class against class-less concrete work yields `NEEDS_VERIFICATION`; differing values on both sides are hard conflicts, except window dimensions which yield `NEEDS_VERIFICATION` (unit prices are stated as width ranges and prose extraction is least certain there); cross-notation comparisons (K- vs f′c, inch vs mm pipe) are `NEEDS_VERIFICATION` with human-readable reasons, never silently converted. Parser guards prevent noun-binding errors (an 18 mm multiplex leaf is not glass; a 150 mm listplank width is not board thickness; comparative phrases are not assumed dimensions). New suite `dedMaterialSpec`: 46 PASS / 0 FAIL (15 must-match, 11 must-reject, 5 ambiguous, 8 parser guards, integration, legacy-reason regressions); zero legacy scenarios changed. Document: `docs/audits/DED_MATERIAL_SPECIFICATION_VALIDATION.md`. Open boundary (documented): the guard receives the item **name** today — attributes present only in an item's `specification` field are not yet compared (follow-up in the audit §7).

## Task E — DED usage integration with Unified Credits — PASS (DED side; gateway extensions owned elsewhere)

`DedWorkflowUsage` now carries a per-call `calls[]` record (`DedUsageCallRecord`): call identity, pass/file identity, pages, gateway productId, requested provider/model (`null` — honestly not read by the pipelines), actual provider/model, attempts/retries, status/error, per-call and workflow token fields (**null exactly**), explicit `missingEvidenceReason` (`GATEWAY_DOES_NOT_REPORT_TOKENS` / `PROVIDER_COST_NOT_REPORTED` / `CALL_NOT_SENT`), `pricingPolicyVersion: null` (v1.1 exists server-side, LOCKED, but is not bound per call — stated, not claimed), and workflow started/finished timestamps captured additively in both services. The standard pipeline now retains the gateway's final-attempt provider/model (previously discarded) and the usage identity is a consensus (mixed identity → null). The evidence shape maps 1:1 onto Sprint 3's `dedBillingAdapter.recordUsageEvidence` contract (tested). Feature keys verified against `featureBillingMatrix.js` (read-only): every key the builders can emit (`ded-ai/simple|medium|complex`, `ded-ai/full-ai`) exists in the matrix and matches the code's real complexities. Findings recorded as Sprint 3 dependencies: **F-E1** `ded-ai/revision` exists in matrix/tariffs but no DED path emits it (orphan tariff); **F-E2** the user-selected complexity in the view only drives the *simulation* tariff — it does not reach `DedAiServiceOptions`, so DETAIL workflows always record `ded-ai/medium` (fix path documented; not implemented because it changes the service-options contract). Simulation boundary confirmed: `DedAiInputView.handleStart` calls the local simulation `consume()` and ignores its boolean return; the only prior gate is the separate simulation package gate (behaviour unchanged; an explicit comment was added at the consume site). Written confirmations in the document: deterministic operations (context quantity estimation, AHSP lookup, local reference/cache matching, canonical subtotals, review, user edits) create no paid record (proven by test — pure completion leaves `modelCalls` at 0); no DED-specific balance; no second billing system; no server-side debit activated. New suite `dedUsageCreditsCompat`: 36 PASS / 0 FAIL; Sprint 3's `dedBillingCompat` still 42/42. Document: `docs/architecture/DED_UNIFIED_CREDITS_SPRINT_4.md`.

## Task F — Provider and gateway observability — PASS (audit; extensions specified, not implemented outside DED territory)

Traced path: DED → `providerClient.ts` → `api/ai/tools/execute.js` → `api/_lib/aiGateway.js`. The gateway **does** capture per-attempt usage (Gemini `usageMetadata`, OpenAI-compatible `usage` incl. cached and reasoning tokens) and `executeAI` returns `{usage, attempts[]}` — but the HTTP success body is only `{success, content, model, provider, mode, requestId, durationMs}`: **usage and attempt history are discarded at the HTTP boundary**, and the client success type has no token fields. Streaming: none to the client (`stream:false`); upstream SSE is reassembled server-side with last-block usage retained, then dropped at the same boundary. Retries: gateway failover history exists only in server logs and the server usage meter; the client sees the final attempt's identity only (DED's own MALFORMED retry, max 1, is counted; identity = final attempt — now retained per Task E). Fallback identity visible to the client is the *routing* provider (e.g. `atmorouter`), not the actual billing provider — distinguished explicitly in the document. Vision path: usage captured identically in the gateway; DED does not use it (text-only, `withImages:false`). Multi-file: one service execution per file from the view; the gateway returns `requestId` but DED does not yet record it (client↔meter correlation not yet possible). Node adapter path returns token fields under different names (`promptTokens` etc., `providerId`/`modelId`) that `providerClient` does not read — it falls back to the *requested* identity and drops all tokens.
**Smallest required extensions (specified, owners named, none implemented here):** X1 include the already-computed `usage` + `attempts` in the success `responseBody` of `handleAiRequest` — owner `api/_lib/aiGateway.js` (platform/Sprint 3 territory); X2 add `usage` to the client success type and read `providerId`/`modelId` on the Node path — owner `src/ai-tools/providerClient.ts` (shared platform); X3 record `requestId` per DED call (DED side, prepared, deferred to keep this sprint's diff minimal); X4 retain failed-attempt usage in the gateway so Sprint 3's `REQUIRES_REVIEW` rule can distinguish known-zero from unknown — owner `api/_lib/aiGateway.js`. No API keys or document contents are logged by the design; no provider cost is ever inferred from a model ID; routing policy and credentials untouched. Document: `docs/audits/EZRAB_AI_PROVIDER_USAGE_OBSERVABILITY.md`.

## Task G — Regression and real-file validation — PASS

See `docs/audits/DED_SPRINT_4_REGRESSION.md` for the full matrix, exact commands, invariant checklist, and failure classifications (2 bundle-artifact FAILs in one suite's render checks — proven PASS unbundled; 1 pre-existing missing-fixture failure in a ded-rab-v2 test outside Sprint 4 territory; 1 ENOSPC environment event; build OOM kills classified as parallel-programme memory contention, followed by a verified solo exit 0 on the identical tree). Totals: baseline 848 PASS / 0 FAIL → after **848 PASS / 0 FAIL + 155 new PASS**; apiEndpointInventory 13/13; tsc exit 0; vite build exit 0.

## Task H — Documents produced

1. `docs/audits/DED_PDFJS_COMPATIBILITY_FIX.md` (Task A technical) + `docs/audits/DED_SPRINT_4_PDFJS_COMPATIBILITY.md` (sprint summary referencing it — chosen over duplication).
2. `docs/audits/DED_FULL_AI_PARITY_SPRINT_4.md`
3. `docs/architecture/DED_CANONICAL_PRICE_REFERENCE_SERVICE.md`
4. `docs/audits/DED_MATERIAL_SPECIFICATION_VALIDATION.md`
5. `docs/architecture/DED_UNIFIED_CREDITS_SPRINT_4.md`
6. `docs/audits/EZRAB_AI_PROVIDER_USAGE_OBSERVABILITY.md`
7. `docs/audits/DED_SPRINT_4_REGRESSION.md`
8. `docs/audits/DED_SPRINT_4_FINAL_REPORT.md` (this file)
No Phase 1/2, Hardening, or Sprint 3 report was overwritten. Baseline and after snapshots are stored outside the repo (see Git state above).

## Files changed by Sprint 4 (exact)

**Modified (tracked):**
- `src/lib/pdfjsSetup.ts` — legacy main+worker pairing (Task A).
- `src/ded-rab-v2/ingestion/pdfPageService.ts` — Node import → legacy build (Task A).
- `src/ai-tools/ded-full-ai/service.ts` — structured price completion pass, shared quantity audit attachment, accept/reject, usage timestamps + file/product identity (Tasks B, E).
- `src/ai-tools/ded-full-ai/types.ts` — additive optional shared-type mirrors (Task B).
- `src/ai-tools/ded-full-ai/validator.ts` — warning-only shared enforcements + block consistency (Task B). (Note: `ded-full-ai/service.ts`/`validator.ts` also contain the parallel Sprint 3 programme's own in-flight edits where they overlap; Sprint 4's changes are the additive ones described in the Task B/E documents.)
- `src/ai-tools/ded-full-ai/FullAiResultView.tsx` — structured blocks render + accept/reject UI (Task B).
- `src/ai-tools/ded-ai-estimate/types.ts` — additive usage types (Task E).
- `src/ai-tools/ded-ai-estimate/service.ts` — final-attempt provider/model retention + workflow timestamps (Task E).
- `src/ai-tools/ded-ai-estimate/usageMetadata.ts` — per-call records, missing-evidence reasons (Task E).
- `src/ai-tools/ded-ai-estimate/DedAiInputView.tsx` — explanatory comment at the simulation consume site only (Task E).
- `src/ai-tools/ded-ai-estimate/externalPriceReferences.ts` — additive structured-spec layer in `referenceSpecConflict` + `referenceSpecValidation` export; no price or legacy rule changed (Task D).

**New:**
- `src/ai-tools/ded-ai-estimate/materialSpecValidation.ts` (Task D), `src/ai-tools/ded-ai-estimate/canonicalPriceReferenceService.ts` (Task C).
- Tests: `src/test/dedPdfjsCompat.src.ts`, `src/test/dedFullAiParity.src.ts`, `src/test/dedMaterialSpec.src.ts`, `src/test/dedCanonicalReferenceService.src.ts`, `src/test/dedUsageCreditsCompat.src.ts`.
- The 9 Sprint 4 documents listed under Task H (8 deliverables; Task A produced two by design).

## Acceptance criteria (§10 of the master prompt) — assessed one by one

| # | Criterion | Status |
|---|---|---|
| 1 | PDF.js compatibility fix tested in the relevant runtime | **PASS** — Node 24.22.1 before/after reproduction + suites; browser runtime smoke (see #2 note) |
| 2 | Main PDF.js build and worker version-matched | **PASS** — both legacy 6.3.289; asserted in suite; production bundle ships the legacy worker. Browser runtime verified with qualification (direct legacy import; Vite `?url` wiring verified statically + via build) |
| 3 | Shared PDF loader consumers regression-tested | **PASS** — ded-ai-estimate, ded-full-ai, ded-rab-v3 consumer suites green; dedDifferentialPdf failure is a pre-existing missing fixture (NOT VERIFIED for that one suite — fixture absent from checkout, fails before any PDF loads) |
| 4 | Full AI price metadata parity implemented or explicitly blocked | **PASS** — implemented via shared `DedPriceCompletion` |
| 5 | Full AI quantity audit parity implemented or explicitly blocked | **PASS** — shared 8-class audit attached to all Full AI items |
| 6 | User approval state persisted consistently | **PASS** — accept/reject in both pipelines, approval-only semantics tested |
| 7 | Canonical price reference architecture documented | **PASS** — plus an additive read-only implementation |
| 8 | Duplicate reference datasets reconciled without silently deleting evidence | **PASS** — 13 pairs aligned, 0 conflicts, hazards documented, both bases retained, historical prices preserved |
| 9 | Material specification conflict checks tested | **PASS** — 46 checks incl. false-positive and false-negative suites |
| 10 | DED usage metadata compatible with Unified Credits | **PASS** — per-call evidence shape maps 1:1 to Sprint 3's adapter contract (tested) |
| 11 | Unknown provider usage remains unknown | **PASS** — tokens/cost `null` with explicit missing-evidence reasons; nothing estimated from characters or call counts |
| 12 | Deterministic operations remain free | **PASS** — proven by test; no paid record from pure completion paths |
| 13 | No DED-specific balance system introduced | **PASS** — none; single Unified Credits architecture referenced |
| 14 | No live credit debit activated | **PASS** — billing remains dormant simulation; `AUTH_ENABLED=false` untouched |
| 15 | All relevant regression tests reported accurately | **PASS** — full matrix with classifications in the regression document |
| 16 | Existing parallel work intact | **PASS** — md5/status verified; Sprint 3 files changed only by Sprint 3 itself; all prior local packages preserved |
| 17 | No deployment, migration, environment change, commit, push, or merge | **PASS** — HEAD identical; nothing staged by Sprint 4; zero external actions |

## Remaining issues

**P0:** none.

**P1:**
1. All Sprint 4 results (like all prior local packages) remain **uncommitted** — worktree-loss risk persists until the owner grants a commit. Snapshots mitigate, not eliminate.
2. Gateway usage evidence is discarded at the HTTP boundary (Task F, X1/X2/X4) — until the gateway/platform owners implement those extensions, v1.1 token settlement for DED cannot be fed real evidence; DED metadata is ready and honest (`null` + reasons) in the meantime. Owner: gateway/platform (Sprint 3 territory), not DED.

**P2:**
1. Curated market references go **stale en masse on 2026-12-10** (single research batch); re-research must be scheduled before that date or completion quality drops a tier across the board. 37 Jakarta records have unknown freshness.
2. Full AI finalization-semantics parity deferred (hard out-of-band rejection; mandatory basis-note gate) — owner decision required.
3. User-selected DED complexity does not reach the service options (F-E2) — DETAIL always records `ded-ai/medium`; fix changes the options contract.
4. Behavioural unification of the two price bases not done (36 uncurated Jakarta entries must not enter the deterministic resolver without a product decision).
5. Material-spec guard compares the item **name** only; attributes living solely in an item's `specification` field are not yet compared.
6. Full AI RAB mapper does not carry the structured completion summary (string evidence does reach the RAB).
7. Cross-notation spec comparisons (K- vs f′c, inch vs mm) intentionally stop at NEEDS_VERIFICATION pending an official conversion table.

**P3:**
1. `ded-ai/revision` tariff exists in the matrix but no DED path emits it (orphan — Sprint 3 dependency F-E1).
2. DED does not yet record gateway `requestId` per call (X3, prepared).
3. Pre-existing `dedDifferentialPdf.test.ts` fixture B missing from the checkout (test cannot run; outside Sprint 4 territory).
4. Dead code documented by earlier programmes (seedResearchCache etc.) still awaits a cleanup grant.

## Owner decisions required

1. **Commit grant** for the accumulated local packages (now including Sprint 4) — the single largest remaining risk is uncommitted work.
2. **Full AI finalization semantics**: adopt hard out-of-band price rejection and/or a mandatory basis-note gate in Full AI, or keep warning-only parity.
3. **Price-base unification**: whether/when the 36 uncurated Jakarta entries may be promoted (after curation to the curated evidence bar) into the canonical resolver.
4. **Reference refresh scheduling** before 2026-12-10 (real re-research of the 13 curated families).
5. **Gateway observability extensions X1/X2/X4** — assign to the gateway/platform owner (overlaps Sprint 3 territory) so DED evidence can flow when billing is eventually activated.
6. **F-E2**: whether the view's complexity selection should be wired into `DedAiServiceOptions` (changes recorded feature key for DETAIL runs).

## Recommended next sprint (exact)

**Sprint 5 — "Evidence plumbing & commit closure":** (1) obtain the owner's commit grant and land the accumulated local packages in reviewed batches; (2) implement gateway extensions X1 + X2 + X4 with the gateway owner so provider usage evidence reaches clients with requestId correlation (X3 on the DED side in the same sprint); (3) wire F-E2 (complexity → service options) if the owner approves; (4) run the curated-reference refresh ahead of the 2026-12-10 staleness cliff. No billing activation, no production change — those remain separate owner decisions.
