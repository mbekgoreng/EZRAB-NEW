# UNIFIED CREDITS — SPRINT 3 FINAL REPORT
## Transactional Ledger Repair & Shared AI Metering

Date: 2026-11-10 · Repository `~/workspace/ezrab-unified` · Branch
`integrasi/unified-ui-engine` · HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896`
(unchanged) · Environment: LOCAL DEVELOPMENT ONLY · Production Status A — PUBLIC
SHOWCASE ONLY · Billing DORMANT · `AUTH_ENABLED=false`.

Companion documents: `UNIFIED_CREDITS_SPRINT_3_CONCURRENCY_REPORT.md`,
`UNIFIED_CREDITS_SPRINT_3_SQL_VALIDATION.md`,
`docs/architecture/UNIFIED_AI_METERING_IMPLEMENTATION.md`,
`UNIFIED_CREDITS_SPRINT_3_PROVIDER_ROUTING.md`,
`UNIFIED_CREDITS_SPRINT_3_REGRESSION.md`.

---

## A. Sprint verdict

| Area | Verdict | Basis |
|---|---|---|
| Transactional integrity | **PARTIAL** | Both proven Phase 2 defects repaired and regression-proven at the in-process layer (52/52 deterministic concurrency tests). Cross-instance atomicity rests on the SQL RPC layer, which is **NOT RUNTIME VERIFIED**. |
| SQL readiness | **PARTIAL** | F-6 and F-10 corrected in the draft, plus F-1/F-2/F-4/F-5/F-7; static review only. The draft remains **NOT READY FOR EXECUTION** until the prepared harness passes on a disposable PostgreSQL. |
| Shared metering | **PARTIAL** | Boundary implemented with an enforced state machine, server-side feature derivation, and a fail-closed dead gate (83/83 + 94/94 tests). Production integration is deliberately zero — no feature is wired yet. |
| DED compatibility | **PARTIAL** | Adapter contract implemented and proven (42/42) without touching any DED file. Real pipeline integration waits for the parallel DED Final Hardening programme. |
| Provider pricing | **NOT VERIFIED** | Routing re-verified with zero delta vs Phase 2; the head-of-chain gateway tariffs (Crown, AtmoRouter, ZyRouter, River, Dahl, Atria) remain unpublished → route costs UNKNOWN. No margin can be claimed. |
| Security | **PARTIAL** | Webhook handler verified strong (signature-first, timing-safe, exact amount, triple idempotency, refunds recorded only). The middleware gate incompatibility remains — documented, deliberately unchanged, activation BLOCKED on owner grant D17. Client-trust boundaries in the new metering contract are enforced and tested. |
| Production readiness | **FAIL — NOT PRODUCTION READY** | By design. Billing is dormant; the ordered activation blockers in §G of the Phase 2 final report remain in force (legal D1/D2/D4 → D7/D8 → tariff verification → F-6/F-10 runtime verification → D16 → D17 → D6). |

## B. Concurrency proof

Suite `src/test/creditConcurrencySprint3.test.ts` — `npx --yes tsx …` →
**52 PASS / 0 FAIL**, using explicit deferred gates (controlled interleavings, not
sleeps). Proven: concurrent FREE_ONCE grants → exactly one batch + one GRANT entry
(Phase 2 Defect A closed, including a stale-snapshot flush rejected pre-write);
concurrent reservations 80+80 vs 100 → exactly one succeeds, loser
`INSUFFICIENT_BALANCE` (Defect B closed); multi-batch concurrent allocation follows
the locked Phase 5.1 order; settle/release race → one terminal outcome; expiry vs
reservation serialized in both orders; duplicate webhook grants → exactly one grant
set (3,600 total); duplicate settlement consumes once; simulated mid-flush failure
→ **zero partial state**, retry succeeds exactly once; same key + different payload
→ explicit `IDEMPOTENCY_CONFLICT`. Every scenario also verifies the batch invariant
`granted = remaining + reserved + consumed + expired` and a healthy reconciliation.
**Scope honesty:** proven for a single Node process on the InMemory adapter. No
claim is made that in-process serialization provides distributed transaction
safety; that guarantee is assigned to the SQL RPC layer (Section C), which is not
runtime-verified.

## C. SQL repair status

Draft `supabase/migrations/20261110_unified_credits_foundation.sql` (827 → 1,028
lines; edited locally only; never executed):

- **F-6 `reserve_credits` — FIXED (static).** Deterministic row locking
  (account first, batches `FOR UPDATE` in allocation order), availability
  recomputed inside the transaction, `ROW_COUNT = 1` asserted on every write,
  hard post-loop assertion (`v_need <> 0 … → RAISE`) rolling back the entire
  transaction — a partial reservation can no longer persist as success.
- **F-10 `resolve_review` — FIXED (static).** Account lock, batches locked before
  consumption, `ROW_COUNT` on all branch updates, consumption-equals-reserved
  assertion, post-loop overage `RAISE`, terminal CAS retained (no double settle;
  REJECTED is terminal).
- **F-1 — FIXED (static).** Idempotent policy creation (`DO` + `pg_policies`
  guard); file is re-runnable.
- **F-2 — FIXED (static).** Reconciliation view: never-grant warning, `REVOKE ALL`
  from PUBLIC/anon/authenticated, guarded `security_invoker` attempt.
- **F-13 — NOT CHANGED, documented residual risk.** Informational per Phase 2;
  append-only is a family-wide authoring convention; tamper-evidence is a separate
  owner design decision.
- Also fixed in the same pass: **F-4** (review↔operation mismatch check;
  authorization semantics deliberately preserved — SUPER_ADMIN or
  `billing_admin = true`, CLIENT always rejected, per the governing Phase 5.3
  design), **F-5** (`issue_batch` advisory lock + unique-violation replay — no
  orphan batches), **F-7** (`estimated_credits <= 0`/NULL rejected). F-3, F-8,
  F-9, F-11, F-12 unchanged (minor/informational).
- **Runtime: NOT VERIFIED.** No PostgreSQL exists on this machine. A disposable-DB
  harness is prepared at
  `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT3/sql-harness/`.

## D. Metering integration

Implemented: `api/_lib/aiMeteringLifecycle.js` (state machine) +
`api/_lib/aiMetering.js` (boundary wrapping the injected Gen-2 ledger), gated by
`AI_METERING_ENABLED` (must be exactly `'true'`; default off; off = fail-closed
rejection with zero ledger writes and no simulation fallback). Client billing
fields are rejected; feature keys are server-derived; missing evidence →
REQUIRES_REVIEW; unknown feature/policy fails closed. Phase 2 contract defects
closed: gateway product→feature mapping for DED/Document (no more
`UNKNOWN_FEATURE`), `approvedMaxCredits` enforced explicitly instead of silently
discarded, receipt scan marked `MISSING_ENDPOINT` and rejected
`TRANSPORT_UNAVAILABLE`.

Per-feature actual status — **integration into production paths: none** (zero
production importers, grep-verified; deliberate, because the only correct
integration point, `aiGateway.js`, was outside this sprint's write territory):

| Feature group | Status today | Boundary readiness |
|---|---|---|
| Chat FAST / ADVANCED | Simulation debit (client-estimated) | Wrapper-ready; first integration candidate |
| Magic AI / Co-Assistant, Magic AI RAB | NOT_WIRED (full bypass) | Registered in matrix; pending gateway integration |
| DED AI | Simulation flat debit, result ignored | Adapter-ready (Section E) |
| AI Document (create/revision/enhance/translate/QA/analysis) | Analysis: simulation debit, ignored; rest NOT_WIRED | Feature keys mapped; pending integration |
| Receipt scan | Endpoint does not exist | Rejected at boundary until transport exists |
| Price research (Serper leg), drawing reader, SmartAdd, ded-rab pipeline, Node router, legacy `server/` | NOT_WIRED / REQUIRES_REVIEW | Registered; owner converge/retire decisions pending |
| 15 deterministic operations | DETERMINISTIC_FREE | **Enforced at the boundary** — cannot enter the debit lifecycle (94/94 tests) |

## E. DED compatibility

Implemented as a dormant adapter only — `api/_lib/dedBillingAdapter.js`, zero DED
files touched. The flat 500/650/800 values (test-asserted equal to
`EZRAB_DRAFT_TARIFFS`) are redefined as **maximum reservation estimates**, one
operation per DED batch/run: reserve → execute → settle from accumulated actual
usage under v1.1 → release the remainder → unknown usage/overage to the ledger
review queue. Proven by 42/42 deterministic mock-executor tests, including
multi-file runs, partial failure, full failure (full release), timeouts, retry
idempotency, terminal-state conflicts, and insufficient balance (executor never
invoked — the inverse of today's DED behavior). Remaining work: wiring the adapter
into the real DED pipeline, which is **blocked on the parallel DED Final Hardening
programme** finishing its edits to the same surface; DED output, provenance,
quantity labels, and review behavior are unchanged.

## F. Provider routing

Zero delta vs Phase 2 (all routing files byte-identical to HEAD). Crown still
heads the chat/advanced/fast chains; MiniMax-M2.7 was re-fetched from MiniMax's
official pricing page this sprint and is **still absent** from the current list →
Crown route cost UNKNOWN. Client-registry deviation re-confirmed at up to ≈16.7×
(`gemini-3.5-flash-lite` output). Cached-input prices remain absent from the
client registry. Verified paid-direct routes: only the 6 Phase 2 rows (Google
direct Gemini models, Inception Mercury on the dormant `server/` path). All
gateway route costs (Crown, AtmoRouter, ZyRouter, River, Dahl, Atria, VLEEE) and
the Serper per-search price are **UNKNOWN**; margin parameters remain `null`;
**no margin is claimed**. Legacy/simulation isolation: no paid operation can fall
back to localStorage or the rogue flat-1 `server/` path (verified — the real risk
is the inverse: paid AI execution is not gated by any system at all today, which
is precisely what the dormant boundary is built to close). No legacy code was
deleted; proposed additive isolation markers are recorded as proposals for the
coordinator/owner, not applied.

## G. Test evidence

Commands and actual results (full detail in the regression document):

- New: `creditConcurrencySprint3` **52/52** · `ai-metering` **83/83** ·
  `deterministic-free-metering` **94/94** · `dedBillingCompat` **42/42**
  (all via `npx --yes tsx src/test/<file>`).
- Re-confirmed: Phase 1 suites **174/174** · vitest billing set **110/110** ·
  billing/webhook/catalog set **180 checks, 0 FAIL**.
- `creditInvariantAdversarial`: **55 PASS / 3 FAIL / 2 NOT RUN** — classified as
  **superseded pins**, not behavior regressions: the failing assertions pin the
  old defective behavior (different-payload replay as `duplicate`; the
  known-limitation orphan outcome) that this sprint was mandated to replace, and
  the suite's own comments instruct a deliberate update of Cases 2–4 now that the
  transactional boundary is fixed. The file was outside the ledger worker's edit
  territory and was not edited mid-flight. No assertion was weakened or skipped
  anywhere in this sprint.
- Coordinator gates on the combined worktree (solo runs): `tsc --noEmit
  --skipLibCheck` **exit 0** · `vite build` **exit 0** (pre-existing chunk-size
  warning only).
- SQL runtime tests: **not executed — environment limitation** (no PostgreSQL on
  this machine); classified unverified, harness prepared.

## H. File changes

**Modified (3):**
- `api/_lib/billingStore.js` — per-account serialization, preflight invariant +
  content-CAS validation, compensated flush, repository `delete*Row` methods.
- `api/_lib/creditLedger.js` — idempotency payload comparison
  (`IDEMPOTENCY_CONFLICT`), `resolveReview` approval snapshot + overage assertion.
- `supabase/migrations/20261110_unified_credits_foundation.sql` — F-6/F-10/F-1/F-2/
  F-4/F-5/F-7 fixes (draft only; md5 `62d9e860…` → `685d8ad4…`).

**Created (7 in repo):**
- `api/_lib/aiMetering.js`, `api/_lib/aiMeteringLifecycle.js`,
  `api/_lib/dedBillingAdapter.js`
- `src/test/creditConcurrencySprint3.test.ts`, `src/test/ai-metering.test.ts`,
  `src/test/deterministic-free-metering.test.ts`, `src/test/dedBillingCompat.test.ts`

**Created (6 documents):** this report and its five companions (concurrency, SQL
validation, metering implementation, provider routing, regression).

**Deliberately unchanged:** `middleware.ts` (webhook finding stays documented;
fix design proposed in Phase 2/Sprint 3 audit — one exact-path entry
`/api/credits/webhook` in `PUBLIC_API_PATHS`, safe because the handler verifies
the Midtrans SHA-512 signature, timing-safe, before any processing and fails
closed when unconfigured; requires owner grant D17) · `api/_lib/creditAllocation.js`,
`billingService.js`, `tariffRegistry.js`, `creditReconciliation.js`,
`featureBillingMatrix.js` (md5-verified identical to the pre-sprint baseline) ·
Gen-1 `creditEngine.js` · the localStorage simulation · the legacy `server/` ·
**all DED files** · all Phase 1/Phase 2 reports.

**Outside the repo:** protection snapshots
`~/workspace/your_files/EZRAB-UNIFIED-CREDITS-SPRINT3/baseline-tugas12/` and
`after-tugas12/`, plus the SQL test harness in the same folder.

## I. Git safety

Branch `integrasi/unified-ui-engine`; HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896`
before and after; **staged: 0**; worktree: 64 porcelain entries comprising the
four local packages (Unified Credits Phase 1+2, DED gap fix, DED/Doc shell, DED
Final Hardening in flight) + Sprint 3 + the permanent exclusions (`scripts/ai-audit/*`,
`.github/`, `demo-gen/out/`, `k7-harness.html`, `k7shots.mjs`, `~/`, `dist/`).
Parallel-programme work verified present and untouched at close (DED estimate/full-ai
files, `FeaturePageShell`, `dedHardening.src.ts`, `usageMetadata.ts`). No
`reset`/`clean`/`stash` was used. **No commit, push, merge, or tag occurred.**

## J. Remaining owner decisions

Unchanged from the Phase 2 register (19 rows, `docs/product/UNIFIED_CREDITS_OWNER_DECISIONS.md`)
unless noted: **D1/D2/D4** PENDING_LEGAL_REVIEW (legal review explicitly required) ·
**D3** LOCKED PERIOD_END_30 · **D5** LOCKED MIDTRANS · **D6** activation —
NOT GRANTED · **D7** frontend allocation-order alignment — PENDING_OWNER ·
**D8** top-up pricing — PENDING_OWNER · margin-formula adoption — PENDING_OWNER
(parameters remain `null`) · provider tariff verification —
PENDING_PROVIDER_VERIFICATION (Crown/Atmo/ZyRouter/River/Dahl/Atria/Serper
unpublished) · DED flat-vs-token — the adapter now embodies the token-settlement
design as a dormant contract; the *activation* decision remains the owner's ·
simulation retirement (D14), migration execution (D16), webhook exemption (D17),
and wiring steps (D18) each require their own grant · **NEW:** deliberate update
of `creditInvariantAdversarial` Cases 2–4 to the Sprint 3 mandated behavior ·
**NEW:** F-13 tamper-evidence (trigger/hash-chain) if the append-only convention
is judged insufficient · **NEW:** receipt-scan endpoint (build inside the boundary
or retire the feature) · **NEW:** legacy `server/` explicit retirement/isolation
markers (proposed, not applied).

## K. Next sprint recommendation

The smallest technically justified next sprint — **Sprint 4: Runtime Verification
& First Gated Integration**:

1. Run the prepared SQL harness on a disposable local PostgreSQL (install
   PostgreSQL on this VM or an equivalent isolated machine) — convert F-6/F-10
   from static fixes into runtime evidence; fix whatever the first real run
   surfaces.
2. Deliberately update `creditInvariantAdversarial` Cases 2–4 to assert the new
   guarantees (conflict error, no orphan, CAS rejection), restoring a fully green
   adversarial suite without weakening it.
3. Integrate exactly one representative feature — Chat FAST — through the metering
   boundary inside `aiGateway.js`, with the gate still OFF, proving
   behavior-identical output while dormant; only then consider DED adapter wiring
   (after the DED programme lands) and the remaining features in the documented
   order.

Nothing in this sprint activates billing, and nothing should be promoted toward
activation until items 1–2 are done and the D6/D16/D17 grants exist.
