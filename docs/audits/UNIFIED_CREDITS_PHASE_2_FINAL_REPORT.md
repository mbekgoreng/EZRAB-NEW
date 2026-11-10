# Unified AI Credits — Phase 2 Final Report (Phase J)

**Programme:** EZRAB Unified AI Credits, Phase 2 — Final Hardening & Activation Readiness
**Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD:** `99de8927d3bdb0bc6e2befbcb22e290f64971896` (unchanged by this phase)
**Scope honoured:** local and dormant only. No deploy, no commit/push/merge, no SQL executed anywhere, no Supabase/env changes, no billing activation, `AUTH_ENABLED` untouched, `middleware.ts` untouched.

Companion deliverables: `UNIFIED_CREDITS_PHASE_2_ARCHITECTURE_AUDIT.md` (Phase A), `UNIFIED_CREDITS_SQL_READINESS.md` (Phase C), `UNIFIED_AI_BILLING_INTEGRATION.md` (Phases D+H), `AI_PROVIDER_TARIFF_READINESS.md` (Phase E), `CREDIT_UI_TRUTHFULNESS_AUDIT.md` (Phase F), `UNIFIED_CREDITS_OWNER_DECISIONS.md` (Phase G). Phase B evidence is in §C/§D below and in `src/test/creditInvariantAdversarial.test.ts`.

---

## A. Executive summary and verdicts

Phase 1's baseline was re-verified independently and found accurate in every material particular. Phase 2 hardened what could be hardened in pure local logic, proved two concurrency defects in the in-memory ledger path, statically validated the drafted SQL RPCs (finding two defects of the same class inside them), designed the single shared metering boundary, and established that provider tariffs for the gateways that now head production routing are unknown — so no margin can be claimed.

| Area | Status | Basis |
|---|---|---|
| Architecture | **PARTIAL** | Canonical Gen-2 domain is sound and complete; the end-to-end billing chain is intact for **zero** AI features (Phase A §, 17 features traced). Architecture is documented and correct; integration does not exist yet. |
| Database | **NOT VERIFIED** | No local PostgreSQL; static validation only. Draft RPCs: 3 conditionally ready, 2 require changes (F-6, F-10). Overall verdict of the SQL audit: **NOT READY FOR EXECUTION**. |
| Integration | **PARTIAL** | One shared metering boundary designed (Phase D), DED compatibility path designed (Phase H). Nothing wired — by the phase fence. |
| Pricing | **PARTIAL** | 6 routes verified at official list prices that EZRAB pays directly; the gateways heading current routing have unpublished tariffs → route cost **Unknown**. Margin formula parameters remain `null`; **no measured gross margin can be claimed**. |
| Security | **PARTIAL** | RPC abuse cases mostly defended statically; two in-memory concurrency defects proven in JS; webhook access-gate finding still open (documentation only, per fence). |
| Production readiness | **FAIL — NOT PRODUCTION READY** | Activation blockers in §G are unmet (owner decisions, migration grant, RPC fixes, tariff verification, webhook exemption grant). This is the expected verdict for a dormant phase; nothing in this phase claims otherwise. |

## B. Actual changes

**Modified (2 files, pure-logic hardening only, public APIs unchanged):**
- `api/_lib/creditLedger.js` — integer guards now require `Number.isSafeInteger` (`isNonNegativeInt`, `isPositiveInt`); `grantBonus` validates `expiresAt` (safe integer ≥ 0 or null) and rejects with `INVALID_EXPIRY` before any batch is created.
- `api/_lib/creditAllocation.js` — `isBatchEligible` fails closed when `expiresAt` is non-null and non-finite (NaN/string/Infinity can no longer masquerade as "never expires").

**New (8 files):**
- `src/test/creditInvariantAdversarial.test.ts` — 20 adversarial cases, 60 assertions, incl. two tests that pin the known in-memory concurrency limitation and assert reconciliation detects the resulting divergence.
- The six Phase A/C/D+H/E/F/G documents listed above, and this report.

**Inspected only (no edits):** `creditReconciliation.js`, `pricingPolicy.js`, `featureBillingMatrix.js`, `billingStore.js`, `billingService.js`, `usageMeter.js`, `tariffRegistry.js`, `api/credits/[action].js`, the whole `src/` credit UI, DED sources (read-only evidence), all migrations.

**Deliberately not changed:**
- `middleware.ts` — the webhook-gate finding stays documentation (fence).
- `supabase/migrations/20261110_unified_credits_foundation.sql` — remains an unexecuted archive draft; its F-6/F-10 defects are documented in the SQL readiness audit, not silently patched, because any edit must be reviewed as part of the future execution grant.
- Gen-1 `creditEngine`, the localStorage simulation, and the legacy `server/` path — coexistence documented, nothing retired without owner decisions (D14/D19).
- All DED files — a parallel hardening programme owns that area; this phase read them as evidence only.

## C. Test evidence (Phase I, all re-run this phase; solo execution for heavy gates)

| Suite | Command/tool | Result |
|---|---|---|
| pricingPolicy (Phase 1) | `npx --yes tsx src/test/pricingPolicy.test.ts` | 33/33 PASS |
| featureBillingMatrix (Phase 1) | tsx | 87/87 PASS |
| creditReconciliation (Phase 1) | tsx | 23/23 PASS |
| unifiedCreditLifecycle (Phase 1) | tsx | 31/31 PASS |
| **Phase 1 new total** | | **174/174 PASS** (matches Phase 1 claim) |
| creditInvariantAdversarial (new) | tsx | **60/60 PASS** |
| billingPlans / billingDemoGate / billingWebhook / midtransSignature / subscriptionMachine / billingCheckout / tokenMetering / billingCatalogDrift / creditsActionHandler | tsx | 72+46+38+37+26+23+26+21+9 = **298 checks, 0 FAIL** |
| apiEndpointInventory | tsx | PASSED (11 handlers + middleware = 12/12 ceiling intact) |
| creditLedger, usageMeter, aiCredits, chatCreditDebit, phase53BillingSecurity | real vitest binary | **5 files, 110 tests, all passed** |
| financialConsistency | tsx | 40/40 PASS |
| dedAiPriceEstimation (cross-programme regression) | tsx | 13/13 PASS |
| dedPriceCompletion (cross-programme regression) | esbuild→node pattern | **42 PASS / 1 FAIL** — see classification below |
| TypeScript | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` | **exit 0** (combined-worktree state) |
| Production build | `NODE_OPTIONS=--max-old-space-size=3072 npx vite build` | **exit 0**, 1m 51s (combined-worktree state) |

Failure classification: the single dedPriceCompletion failure ("S4b cakupan tercatat di output terstruktur") lies inside the parallel DED hardening programme's actively-edited area; the parent agent verified 43/43 earlier the same day before that programme's edits, and this phase changed no DED file. Classified: **parallel-programme in-flight state, not a regression of this phase**. No assertion was weakened, skipped, or edited anywhere in this phase; the two initial failures in the new adversarial suite were fixture-design errors in the new tests themselves, fixed in the fixtures.

## D. Financial integrity

**Invariants holding (proven by tests):** batch invariant `granted = remaining + reserved + consumed + expired` after every operation class; append-only ledger; duplicate grant/webhook/settle are idempotent no-ops; settle above reservation routes the excess to `REQUIRES_REVIEW` with zero partial debit; unknown usage → review, never a fabricated charge; incomplete usage evidence cannot settle; reservation all-or-nothing across batches; expired batches never allocate; cross-account/workspace operations rejected; tampered aggregates are detected by `creditReconciliation` (`LEDGER_BATCH_MISMATCH`, `ORPHAN_LEDGER_ENTRY`, etc.).

**Hardening applied:** unsafe integers (≥ 2^53) previously passed validation and silently lost precision in balances (proven: a 2^53 grant persisted a balance off by one). Now rejected. Malformed expiries previously poisoned eligibility silently; now rejected at grant time and fail-closed at allocation time.

**Two concurrency defects proven in the in-memory `withLedger` path (deterministic interleavings, not races of chance):**
1. Concurrent FREE_ONCE grants: the loser's flush throws an unhandled `UNIQUE_VIOLATION` after its batch was already persisted by the winner's flush → an **orphan batch with no GRANT ledger entry** (batch-derived balance overstates).
2. Concurrent reservations against one balance: **both succeed** (160 reserved against 100 available) while the persisted batch shows only one → the second operation is unbacked. Root cause: snapshot-read → mutate → flush with unconditional row updates (no version/CAS guard) in both repository implementations.

**Honest limitation (not papered over):** these are NOT safely fixable in pure in-memory logic without changing `withLedger`'s contract. The designed remedy is the transactional DB layer: unique constraints plus atomic guarded state transitions. The SQL draft implements most of this (row locks, CAS on review resolution, unique idempotency), **but the static audit found the same missing-assertion class inside the draft itself**: `reserve_credits` (F-6 — unlocked availability pre-check, no post-loop `v_need` assertion) and the `resolve_review` approval path (F-10) can record a full reservation over a partial allocation under concurrency. **Both must be fixed in the draft and runtime-verified before any execution grant.** Until then, reconciliation is the safety net: it detects every divergence these defects produce (asserted in tests).

**Idempotency note:** replaying a key with a *different* financial payload returns the originally recorded result (duplication-safe, mismatch-undetected). This is pinned as documented behaviour; payload-fingerprint comparison is a required behaviour of the future DB RPC layer.

## E. Security

- **RPC authorization (static):** all five drafted RPCs are `SECURITY DEFINER` with pinned `search_path`, `REVOKE … FROM PUBLIC`, `GRANT EXECUTE … TO service_role` only — signatures verified argument-by-argument. The trust model is "service_role holder is fully trusted; functions authenticate nothing themselves", with one exception: `resolve_review` re-checks reviewer authorization against `workspace_members` and resolves via CAS — the strongest code in the draft. Cross-account settle, arbitrary-account grant, unauthorized review resolution, expiry manipulation, idempotency-key reuse with different payloads, settle-above-reservation, and ledger-history rewriting were each analysed per-RPC in the SQL readiness audit. Verdicts: `issue_batch` conditionally ready; `reserve_credits` **changes required** (F-6); `settle_reservation` conditionally ready; `resolve_review` **changes required** (F-10); `apply_expirations` conditionally ready (caller-supplied `p_now` is a manipulation surface confined only by the trusted-caller model). All verdicts **NOT RUNTIME VERIFIED**.
- **Webhook gate (open, documentation only):** `middleware.ts` gates `/api/credits/:path*` behind the access cookie with no webhook exception — Midtrans server-to-server notifications would be rejected before reaching the signature-verifying handler while the gate is active. Not modified (fence); exemption is decision D17.
- **Client trust boundaries:** client-supplied cost/token values are never authoritative in the designed boundary (Phase D); the localStorage simulation remains user-editable and must never authorize a paid operation; landing pricing currently presents dormant commercial terms as standing fact (Phase F risk #1) — a truthfulness defect to fix in copy, not in this phase's fence.
- **Open items:** the Phase E audit noted, by existence only, a hardcoded credential-shaped fallback in legacy `server/config/aiConfig.ts` (~line 224) — flagged for a separate owner-granted fix; no value reproduced here. Gen-1 balance endpoint remains a memory placeholder; the rogue `server/` path still debits a flat 1 credit/op off hardcoded data.

## F. Pricing

- **Verified (official provider pages, retrieved 2026-11-10):** 6 routes EZRAB pays directly (incl. Gemini 3.5 Flash-Lite $0.30/$0.03/$2.50 per 1M in/cache/out; Gemini 3.8 Flash stepping up 2027-01-01; two deprecated Gemini 2.5 models auto-rerouting 2026-12-01; Inception Mercury 2/2.5).
- **Unknown where it matters most:** routing changed since Phase 1 — Crown now heads chat/advanced/fast chains, and its head model (MiniMax-M2.7) does not appear on MiniMax's current official price list; 15 rows are "verified list price, EZRAB route cost unknown", 10 unverified estimates, 11 unknown. The client tariff registry disagrees with official pages by up to ~17× on output price and contains no cached-input prices.
- **Margin:** not measurable. The margin formula stays `PENDING` with `creditValueIdr`, `costMultiplierMilli`, `targetGrossMarginBps`, `fxIdrPerUsd` all `null`; metering v1.1 (output weight ×3 INTERIM) is unchanged; nothing was invented to fill these gaps.

## G. Activation blockers (in execution order)

1. Owner legal decisions **D1** (closure), **D2** (refunds), **D4** (transfers) — `PENDING_LEGAL_REVIEW`; closure/refund/transfer behaviour must not be implemented before legal review.
2. Owner decisions **D7** (simulation/server allocation-order alignment — safest migration plan in the decisions register), **D8** (final top-up price), DED settlement basis (flat vs token), Starter AHSP scope, top-tier naming, simulation retirement (D14).
3. Provider tariff verification for the gateway routes actually used (Phase E list) — until then margins and the margin formula stay unmeasurable/`null`.
4. Fix draft-RPC findings **F-6** and **F-10** (plus minor F-1/F-2/F-13), then runtime-verify the migration on an isolated disposable database — never against an existing Supabase environment without a separate grant.
5. **D16** migration execution grant + live-DB verification (prerequisite migrations' live state is currently UNKNOWN).
6. **D17** middleware webhook-exemption grant (without it, paid webhooks cannot arrive while the access gate is active).
7. **D6** activation grant (currently NOT GRANTED) and the D18 sequence: auth first → migration → webhook (sandbox) → sandbox checkout → production keys.
8. Wire the single metering boundary (Phase D file list) under a separate implementation grant — including DED's reserve-then-settle conversion (flat 500/650/800 retained only as maximum reservation estimates) and the gateway's missing feature keys / dropped `approvedMaxCredits` defects recorded in Phase D.
9. UI truthfulness fixes from Phase F (simulation labelling on compact surfaces, DED gate semantics, landing terms) before any public paid launch.

## H. Owner decisions

The consolidated register (`UNIFIED_CREDITS_OWNER_DECISIONS.md`) carries 19 rows (D1–D19) with statuses: D3 `LOCKED (PERIOD_END_30)`, D5 `LOCKED (MIDTRANS)`, D6 `PENDING_OWNER` — **NOT GRANTED**, D1/D2/D4 `PENDING_LEGAL_REVIEW`, provider tariffs `PENDING_PROVIDER_VERIFICATION`, D18 `READY_FOR_APPROVAL` (plan only), D19 `BLOCKED_TECHNICAL`, the remainder `PENDING_OWNER`. Phase 1 recommendations are preserved verbatim-in-substance and labelled as recommendations; no owner answer was guessed anywhere.

## I. Git safety

- Branch `integrasi/unified-ui-engine`, HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896` before and after; **0 staged** throughout; nothing committed, pushed, merged, or deployed.
- Baseline snapshot (status + patches + md5) was recorded before work and an after-snapshot after work, both outside the repo under `~/workspace/your_files/EZRAB-UNIFIED-CREDITS-PHASE2/`. Reconciliation: 43 baseline status entries + 9 entries from this phase (2 modified, 1 test, 6 docs + this report = 10 files; status count reconciles with untracked-directory collapsing) — **no baseline entry is missing; no pre-existing or parallel-programme work was lost or altered by this phase.**
- Parallel work preserved untouched: the DED gap-fix package, the DED/Document app-shell package, and the in-flight DED Final Hardening programme's edits all remain in the worktree exactly as their programmes left them. The 8 Phase 1 files are byte-identical to the Phase 1 snapshot (md5 8/8, re-verified in Phase A).
- The migration file remains an unexecuted archive draft by all available local evidence; live Supabase state is honestly labelled UNKNOWN (a negative about a remote database cannot be proven locally).

---

*End of Phase 2 report. Production readiness is explicitly NOT claimed. Everything delivered is local, dormant, and reversible.*
