# EZRAB — Unified AI Credits: Owner Decision Register (Phase G)

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD at writing:** `99de8927d3bdb0bc6e2befbcb22e290f64971896`
- **Purpose:** One consolidated register of every owner decision the Unified AI Credits programme depends on. This register **records** decisions and recommendations; it **makes** none. No answer has been guessed, inferred, or filled in for any row.
- **Source:** Phase 1 merged report (`EZRAB-LAPORAN-CREDITS-AI.md`), section 6 (owner decisions, items 1–15, plus its "already locked" list) and sections 2.8 / 3.8 / 4.4. Every Phase 1 recommendation is carried over **verbatim in substance** and is labelled **Recommendation** — a recommendation is not a decision and must never be read as one.
- **Allowed statuses:** `LOCKED` · `PENDING_OWNER` · `PENDING_LEGAL_REVIEW` · `PENDING_PROVIDER_VERIFICATION` · `BLOCKED_TECHNICAL` · `READY_FOR_APPROVAL`.
- **Standing context:** Billing is dormant and local-only. `AUTH_ENABLED = false`. No migration has been executed (live database state is `UNKNOWN`). Production is Status A — PUBLIC SHOWCASE ONLY. Nothing in this register authorises activation, execution, or publication.
- **How to use:** An owner approval should name the row ID and the chosen option. Approval of one row does not approve any other row; grants are per-action, per the standing release rules.

---

## Register summary

| Row | Decision | Status |
|---|---|---|
| D1 | Account closure — fate of remaining balance | `PENDING_LEGAL_REVIEW` |
| D2 | Subscription refund policy | `PENDING_LEGAL_REVIEW` |
| D3 | Period-end forfeiture | `LOCKED` (`PERIOD_END_30`) |
| D4 | Credit transfer policy | `PENDING_LEGAL_REVIEW` |
| D5 | Payment gateway | `LOCKED` (`MIDTRANS`) |
| D6 | Billing activation authorisation | `PENDING_OWNER` — **NOT GRANTED** |
| D7 | Frontend allocation-order alignment | `PENDING_OWNER` |
| D8 | Top-up pricing and tiers | `PENDING_OWNER` |
| D9 | Margin-based pricing adoption | `PENDING_OWNER` |
| D10 | Provider tariff verification | `PENDING_PROVIDER_VERIFICATION` |
| D11 | DED flat reserve vs token settlement | `PENDING_OWNER` |
| D12 | Starter AHSP entitlement scope (Spec §3.2 correction) | `PENDING_OWNER` |
| D13 | Highest package display name (Advanced vs Business) | `PENDING_OWNER` |
| D14 | Frontend simulation retirement | `PENDING_OWNER` |
| D15 | Internal finance dashboard | `PENDING_OWNER` |
| D16 | Migration execution grant + live DB verification | `PENDING_OWNER` |
| D17 | Webhook middleware exemption grant | `PENDING_OWNER` |
| D18 | Activation sequence order | `READY_FOR_APPROVAL` |
| D19 | Gen-1 → Gen-2 balance reconciliation migration | `BLOCKED_TECHNICAL` |

**Row count: 19 decision rows**, plus an annex of already-locked baseline items (Annex A) that are not open decisions and must not be reopened by implication.

---

## D1 — Account closure: fate of remaining balance

- **Status:** `PENDING_LEGAL_REVIEW`
- **Current state / evidence:** No structure for closure-time balance handling exists anywhere: no refund/forfeiture/transfer schema was written, deliberately (Phase 1 §2.2, §4.4). The webhook refund path only records events (`RECORDED_NO_BALANCE_ACTION`); no code path moves a balance at account closure. Phase 1 §6 item 1 options: (a) balance forfeited; (b) pro-rata refund claimable; (c) frozen 90 days, then forfeited.
- **Recommendation (Phase 1, preserved):** **(c)** — freeze for 90 days, then forfeit.
- **What blocks it:** **Legal review is required before any implementation.** Consumer-protection and digital-goods obligations for paid, unused credits at closure have not been reviewed; implementing any option before that review would pre-decide a legal question in code.
- **What an owner approval unlocks:** Nothing by itself — approval must follow (or explicitly incorporate) the legal review outcome. After both, the closure behaviour can be specified for the billing service and its terms published consistently (including on the landing pricing page, which currently makes no closure statement — see Phase F audit §3.12).
- **Delay impact (Phase 1):** Commercial billing must not open without this decision (Phase 1 register WS-B).

## D2 — Subscription refund policy

- **Status:** `PENDING_LEGAL_REVIEW`
- **Current state / evidence:** `CreditRefundService` intentionally does not exist (Phase 1 §2.3). A Midtrans refund notification results in an order status + journal entry only — no balance is ever clawed back or re-granted. Phase 1 §6 item 2 options: (a) no refunds; (b) full refund within ≤7 days if credits are unused; (c) pro-rata refund at any time.
- **Recommendation (Phase 1, preserved):** **(b)** — full refund within ≤7 days provided the credits have not been used.
- **What blocks it:** **Legal review is required before any implementation.** Refund windows, the treatment of partially used grants, and chargeback interaction with Midtrans settlement are legal/commercial terms, not engineering defaults.
- **What an owner approval unlocks:** After legal review, a refund specification (eligibility, window, used-credit test, ledger reversal mechanics via compensating `REVERSAL` entries) can be written as a separate granted work package. Until then the only permitted behaviour is the current record-only hook.
- **Delay impact (Phase 1):** No balance-affecting refund can be offered or promised; public copy must not imply a refund policy exists.

## D3 — Period-end forfeiture

- **Status:** `LOCKED` — value: **`PERIOD_END_30`**
- **Current state / evidence:** Locked baseline (Phase 1 §6, "already locked" list): subscription credits are forfeited at period end + 30 days. The drafted (unexecuted) migration `20261110_unified_credits_foundation.sql` encodes the same rule (`issue_batch`: SUBSCRIPTION default expiry `period_end + 30 days`; `apply_expirations` sweep). FREE_ONCE is excluded from expiration by design.
- **Recommendation:** None — this is a decided item, recorded so it is not reopened by implication. (The landing page's "rollover up to 30 days" wording is the public echo of this rule; any change to public wording must stay consistent with `PERIOD_END_30`.)
- **What blocks it:** Nothing as a decision. Its *enforcement* is dormant like all billing (depends on D16/D6).
- **What approval unlocks:** Not applicable — no approval is sought. Reopening this row requires an explicit new owner decision that names it.

## D4 — Credit transfer policy

- **Status:** `PENDING_LEGAL_REVIEW`
- **Current state / evidence:** The domain does not support transfers at all — no transfer operation, no schema, no UI (Phase 1 §6 item 3). Credits are bound to a billing account (1 workspace ↔ 1 account, Phase 5.3). Options: (a) prohibited outright in v1; (b) only between workspaces of the same owner; (c) generally permitted.
- **Recommendation (Phase 1, preserved):** **(a)** — prohibited outright in v1.
- **What blocks it:** **Legal review is required before any implementation.** Transferability changes the legal character of a credit (resale, gifting, money-transmission and fraud considerations) and interacts with D1/D2; it must not be enabled by an engineering shortcut.
- **What an owner approval unlocks:** After legal review, either a documented v1 prohibition (terms + enforcement note — the current code already behaves this way) or, if (b)/(c) were chosen, a separately designed and granted transfer feature. Approval of the recommendation (a) mainly unlocks certainty for terms copy.
- **Delay impact (Phase 1):** None operationally — absence of transfer is the current behaviour; the block is on ever *promising* transferability (e.g. in sales copy) before this row closes.

## D5 — Payment gateway

- **Status:** `LOCKED` — value: **`MIDTRANS`**
- **Current state / evidence:** Owner decision (already has a Midtrans account). Implemented and locally verified: server catalog as sole amount source (`api/_lib/billingCatalog.js`), Snap checkout (`src/billing/checkoutClient.ts`), signature-verified (SHA-512, timing-safe), amount-exact, triply idempotent webhook grant (`api/credits/[action].js` webhook handler → `billingService.handleNotification`). Dormancy is environmental, not a missing decision: `MIDTRANS_SERVER_KEY` unset → 503 `BILLING_NOT_CONFIGURED`.
- **Recommendation:** None — decided. (Recorded here because later rows depend on it: D17's webhook exemption exists precisely because this gateway's notifications are server-to-server.)
- **What blocks it:** Nothing as a decision. Live use is blocked by D16 (migrations), D17 (webhook reachability), and D6 (activation authorisation), in that dependency order.
- **What approval unlocks:** Not applicable.

## D6 — Billing activation authorisation

- **Status:** `PENDING_OWNER` — decision column: **NOT GRANTED**
- **Current state / evidence:** No activation authorisation has been given. The factual state matches: billing is dormant at five independent break points (Phase 1 §2.6): (1) `MIDTRANS_SERVER_KEY` empty → 503; (2) Supabase service-role config empty → repository null; (3) `CREDITS_DB_CONFIGURED` unset, and even if set, the balance adapter is a memory placeholder; (4) migrations unexecuted (live state `UNKNOWN`); (5) no production callers for reserve/settle/`grantFreeOnce`. `AUTH_ENABLED = false` (`src/App.tsx:39`); Production remains Status A showcase.
- **Recommendation (Phase 1, preserved in substance):** Activation, when authorised, must run as **one separate grant programme** following the exact sequence in D18 — "jalankan persis urutan ini; jangan menyalakan sebagian di Production lebih dulu" (run exactly this order; do not switch on a partial chain in Production first). Phase 1 makes no recommendation that activation be granted now; the readiness claim is explicitly **not** made (Phase 1 §1 item 10, §7).
- **What blocks it:** Predecessor rows D16 (migration grant) and D17 (webhook exemption) must be granted first or together as the activation package (Phase 1 §6 item 5 recommendation: approve the webhook exemption together with the activation package). Legal rows D1/D2/D4 block *commercial* opening regardless of technical readiness.
- **What an owner approval unlocks:** The D18 sequence becomes executable, step by step, each step still individually verifiable: Preview env → endpoint re-pointing → `grantFreeOnce` wiring → transport reserve/settle → sandbox end-to-end (checkout → webhook → grant → use → settle → overage review). Auth enablement and any Production promotion remain separate decisions even after D6 (Phase 1 §6 item 13, step vi).
- **Note on numbering:** Phase 1's "already locked" list uses the shorthand "D6" for the *no-auto-debit / manual-per-period* renewal rule. That rule is locked and is recorded in Annex A to avoid collision; in **this** register, D6 denotes the activation authorisation, per the Phase G brief.

## D7 — Frontend allocation-order alignment

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** Three (arguably four) consumption orders coexist (Phase 1 §2.8 K1, §6 item 7):
  - **Server Phase 5.1 (canonical, owner-locked, tested):** Subscription (earliest expiry first) → Bonus & FREE_ONCE (finite-expiry first, then FIFO) → Top-up (FIFO). Evidence: `api/_lib/creditAllocation.js`, `ALLOCATION_POLICY_STATUS = 'CONFIRMED_OWNER_PHASE_5_1'`; the drafted SQL RPC `reserve_credits` mirrors it exactly.
  - **Frontend simulation:** Bonus → Top-up → Subscription (drain loop in `src/ai-credits/mockAdapter.ts` `mockConsume`) — the *reverse* priority for subscription vs the rest.
  - **Billing Spec v1.0 §8:** Bonus → Rollover → Subscription → Top-up (a fourth ordering, in prose).
  - **Master-prompt §5 proposal:** Promo → Subscription → Top-up (a proposal, never adopted).
  - Structural mismatch beyond ordering: the simulation has three aggregate buckets and stores Free-once credits *inside* its `subscription` bucket (`mockSetPlan`), while the server keeps per-batch lots with FREE_ONCE as its own type in group 1. The simulation cannot represent earliest-expiry ordering *within* a type at all.
  - User-visible consequence: the per-bucket balances on the Credit Page drain in an order the real ledger will never use; demo behaviour teaches the wrong mental model, and any demo→real balance comparison during transition will disagree bucket-by-bucket even when totals match.
- **Recommendation (Phase 1, preserved):** **(a)** Align the simulation (and the Spec §8 wording) to the **server Phase 5.1 order before any paid release**; the master-prompt §5 proposal is recorded as a rejected alternative unless the owner explicitly decides otherwise.
- **What blocks it:** Only the owner decision. No technical blocker: the server order is final and the simulation change is small and test-covered on the server side. It is deliberately *not* bundled into any other grant.
- **What an owner approval unlocks:** The migration plan below may be executed as a frontend-only package (server untouched), and Spec §8's prose can be corrected to match.
- **Safest migration plan (proposal, for approval with this row):**
  1. **Freeze the target:** declare `creditAllocation.js` (Phase 5.1) the sole canonical order in writing (this row). No server file changes at any step.
  2. **Add a drift guard first:** a test in the style of `billingCatalogDrift` that encodes the expected simulation drain order (subscription group → bonus/free group → top-up) and fails against the current `mockConsume` loop — proving the discrepancy in CI before touching behaviour.
  3. **Change only the drain loop** in `mockConsume` to subscription → bonus → top-up, and re-bucket Free-once: `mockSetPlan('free')` should place the 100 initial credits in a way the UI can label as once-only (minimum: keep the bucket but fix all copy that calls it a periodic subscription allowance; the Credit Page already special-cases Free wording — extend that to the drain semantics or add an explicit `freeOnce` bucket if the type change stays frontend-local).
  4. **Migrate persisted state safely:** bump the localStorage key (`ezrab-credit-sim-v1` → `v2`) with a one-time read-migrate-drop of v1 totals (totals are invariant under reordering — only drain order and bucket labels change, so no user's simulated *total* changes; per-bucket splits after migration follow the new semantics and are documented in the release note for the change).
  5. **Update the prose sources:** Spec §8 wording and any UI/help text describing consumption order, in the same package, so three texts cannot drift again.
  6. **Verify:** existing suites (`aiCredits`, `tokenMetering`, `chatCreditDebit`, `billingDemoGate`) plus the new drift guard green; manual check that Credit Page bucket cards drain in the documented order.
  7. **Sequencing guard:** complete this **before** D14 (simulation retirement) is executed and before any paid release; if D14 is approved first for the paid build, D7 still applies to the demo build that remains.

## D8 — Top-up pricing and tiers

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** Two incompatible offers exist (Phase 1 §2.8 K7, §6 item 6). Spec §7.2 defines four tiers — 500 / 1,500 / 4,000 / 10,000 credits at Rp5,000 / Rp10,000 / Rp25,000 / Rp50,000, never expiring. The code (frontend `TOPUP_OFFER` in `src/ai-credits/config.ts`; server `TOPUP_CATALOG` in `api/_lib/billingCatalog.js`) carries exactly one Phase-1 offer: Rp5,000 → 3,000 base + 600 bonus = 3,600, explicitly tagged `PHASE1_OFFER_PENDING_D8`. A drift test pins the frontend and server copies to each other, so the interim offer cannot silently diverge — but it is not a final price.
- **Recommendation (Phase 1, preserved):** Keep the Phase-1 offer in place until provider-cost calibration is complete, then ratify the Spec's four tiers (or a revision of them) as a written decision.
- **What blocks it:** Provider-cost calibration depends on D10 (verified provider tariffs) — pricing tiers set before costs are known would be invented numbers.
- **What an owner approval unlocks:** Final top-up SKUs can be written into `plans.ts`-adjacent canonical config + `billingCatalog.js` together (drift test enforced), the Top-Up Modal can present final tiers, and the "never expires" property of top-up credits — already promised on the landing page (Phase F audit §3.12) — becomes a ratified term rather than an advance promise.
- **Delay impact (Phase 1):** Top-up cannot be sold as a final price; subscriptions are not blocked by this row.

## D9 — Margin-based pricing adoption

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** The locked billing basis is Amendment v1.1 token metering (1 credit = 200 weighted tokens; output weighted by provider price ratio, interim ×3). The master prompt's margin formula (`credits = ceil(cost × multiplier / (1 − margin) / credit-value-IDR)`) exists only as a dormant, versioned policy (`margin-formula-proposal` in `api/_lib/pricingPolicy.js` and the unexecuted 20261110 migration seed) with **all parameters `null`** (`creditValueIdr`, `costMultiplierMilli`, `targetGrossMarginBps`, `fxIdrPerUsd`); `evaluateMarginPrice()` refuses to compute while any parameter is missing (`PENDING_CONFIGURATION`), so no number can be produced from it today (Phase 1 §3.5, §4.2).
- **Recommendation (Phase 1, preserved):** Do **not** replace the billing basis now. Use the margin formula only as an *internal calibration test* after verified provider tariffs exist (D10), then decide with data.
- **What blocks it:** D10 (no verified provider costs → no honest margin computation), plus four owner-supplied parameters if adoption is ever chosen.
- **What an owner approval unlocks:** Two distinct approvals are possible and must not be conflated: (i) approval to *run* the formula as an internal calibration exercise once D10 closes; (ii) approval to *adopt* it as the billing basis, with named parameter values. Neither is granted by this register.
- **Delay impact (Phase 1):** Does not block activation; blocks any claim of measured margin.

## D10 — Provider tariff verification

- **Status:** `PENDING_PROVIDER_VERIFICATION`
- **Current state / evidence:** Every provider tariff in the repo is `NULL` / `UNKNOWN` (Phase 1 §2.7, §6 item 9): Gemini, ZyRouter, Atria and the rest of the gateway chain have seed rows with no verified prices. Consequently the output-token weight ×3 (client `tokenMetering.ts`, server `pricingPolicy.js` `interimValue: 3, interim: true`) is an interim stand-in for the v1.1 provider price ratio, and *all* cost figures are interim estimates. Settlement's tariff check is formal (version string must be known), not substantive (prices are never verified against a source).
- **Recommendation (Phase 1, preserved):** The owner designates the canonical provider list plus each provider's official tariff source; Muse then fills `provider_tariff_versions` **as data, not invention**.
- **What blocks it:** External verification: official published pricing for each provider/model actually used by the gateway chain (or an owner decision to restrict the chain to providers whose tariffs can be verified). No code blocker.
- **What an owner approval unlocks:** Verified tariff rows can be entered with source + version; the interim ×3 can be replaced by per-model ratios; cost-based settlement reconciliation and the D9 calibration exercise become possible; D8 pricing can be calibrated.
- **Delay impact (Phase 1):** Token-based settlement (v1.1) still works; cost- and margin-based claims cannot be made, and no tariff may be described as verified.

## D11 — DED flat reserve vs token settlement

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** Two unreconciled tariffs (Phase 1 §2.8 K4, §6 item 10). Code + simulation charge DED as a flat, user-selected category fee (simple 500 / medium 650 / complex 800, `config.ts` `TARIFFS`), debited once up front in `DedAiInputView.tsx` with the debit result ignored and no release on failure (Phase F audit §3.9). Amendment v1.1's illustration implies a medium DED run is ≈750 credits *from tokens* (≈150,000 weighted tokens). Neither is a production tariff. Full-AI vs database policy and file count do not affect the flat charge.
- **Recommendation (Phase 1, preserved):** Token-metered as the **settlement** basis; flat amounts retained **only** as a maximum reservation estimate per category until real usage data has been collected.
- **What blocks it:** The owner decision; real usage data collection additionally depends on the persistent usage meter (an activation-sequence step, D18). No DED code change is authorised by this row alone — DED files are under a parallel programme's ownership.
- **What an owner approval unlocks:** A single DED tariff definition can be implemented (reserve at category maximum → settle on metered tokens → release remainder / park overage), ending the flat-vs-token contradiction across code, simulation, and documents before activation.

## D12 — Starter AHSP entitlement scope (Spec §3.2 correction)

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** Spec v1.0 §3.2 says every paid plan receives **all** AHSP categories. The tested code grants Starter **CIPTA_KARYA only** (`src/billing/plans.ts`: Starter `ahspDomains: ['CIPTA_KARYA']`; Free likewise; Professional/Business all domains). The landing comparison matrix follows the **Spec** (Starter = all categories), so public copy and enforced behaviour currently disagree (Phase F audit §3.12). Phase 1 §2.8 K6, §6 item 11.
- **Recommendation (Phase 1, preserved):** Align the **Spec wording to the code behaviour** (CIPTA_KARYA for Starter) — unless the owner actually intends to open all categories, which would be an entitlement change, not a text correction.
- **What blocks it:** Only the owner's choice between "correct the Spec" and "change the entitlement". Either branch is small; choosing neither leaves a customer-facing promise the product does not keep.
- **What an owner approval unlocks:** One consistent statement across Spec, `plans.ts`, and landing matrix. If the entitlement branch is chosen, it is a behaviour change requiring its own grant and entitlement-test updates; if the text branch is chosen, Spec + `pricingMatrix.ts` are corrected in one package.

## D13 — Highest package display name (Advanced vs Business)

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** Identical price/credits under two names (Phase 1 §2.8 K5, §6 item 12). Spec v1.0: "Advanced". Code: plan id `business`, `displayName: 'Business'` (`plans.ts`), server catalog "Business". The landing comparison matrix already displays **"Advanced"** via a deliberate bridge (`pricingMatrix.ts` `PLAN_DISPLAY_NAME.business = 'Advanced'`), while the landing plan cards (`ExactPricing.tsx`, from `plans.ts`) and the entire in-app UI (Credit Page, Settings, Sidebar, Mobile) display **"Business"** — so the public site currently uses both names for the same plan on the same page family.
- **Recommendation (Phase 1, preserved):** Lock one display name — **"Advanced"** — and leave the code id `business` exactly as it is.
- **What blocks it:** Only the owner's naming choice. (Note the recommendation selects "Advanced"; if the owner instead locks "Business", the single change is the landing bridge constant — the register records the choice, it does not pre-make it.)
- **What an owner approval unlocks:** One find-and-align pass over display strings (app + landing + catalog display names); zero financial risk, purely cosmetic (Phase 1).
- **Delay impact (Phase 1):** Cosmetic only; no financial risk while pending.

## D14 — Frontend simulation retirement

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** The localStorage simulation (`src/ai-credits/mockAdapter.ts`, key `ezrab-credit-sim-v1`) is the only billing experience users have today: every balance surface reads it, three AI surfaces debit it, and the Credit Page can re-mint it via plan switch/Reset (Phase F audit §§1–3). The backend dormancy chain (D6 evidence) means nothing currently competes with it. Phase 1 §6 item 14 raises the question directly: when the backend activates, the simulation must stop being the displayed source of balance.
- **Recommendation (Phase 1, preserved):** Switch off the simulation path in the paid build (demo labelling only in demo mode); do not run two sources of truth side by side.
- **What blocks it:** Sequencing, not technology: retirement is meaningless before D6/D18 give the UI a server balance to read, and premature removal would strip the Status A showcase of its only billing demo. D7 alignment should land first if any transition window keeps the simulation visible.
- **What an owner approval unlocks:** A defined end-state per build flavour — showcase/demo builds keep a clearly-labelled simulation; paid builds read server state only, with the simulation code path disabled rather than merely unlinked — plus removal of the minting controls (plan switch/Reset) from any paid surface.
- **Delay impact:** While pending, the simulation remains (correctly) the showcase experience; the risk this row guards against materialises only at activation, which is itself ungranted (D6).

## D15 — Internal finance dashboard

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** No finance admin surface exists. What exists: the overage review *mechanism* (`credit_settlement_reviews` + `resolveReview`, restricted to explicit `billing_admin`, Phase 1 §2.2/§3.9), the dormant reconciliation module (`api/_lib/creditReconciliation.js`, Phase 1 §3.7), and a design-only description of a read-only internal surface (reconciliation output, review queue, per-account batch/ledger aggregates, pricing-policy versions) with a hard rule: **no interface may edit ledger history or arbitrary balances** — corrections only via reasoned compensating `REVERSAL` entries. Status A forbids admin on the public site. Phase 1 §6 item 15 asks whether the dashboard should be built as a separate internal application (Local Control Center pattern) after activation.
- **Recommendation (Phase 1, preserved):** Yes — separate and internal; never on the public site, in any state.
- **What blocks it:** The owner decision on building it at all, plus activation itself (a dashboard over a dormant ledger has nothing to show). Access gating design (internal gate, separate from product auth) is part of the eventual package.
- **What an owner approval unlocks:** A separately-granted design/build programme for an internal-only, read-mostly finance surface, scoped to the Phase 1 §3.9 design (reconciliation, review queue, aggregates, policy versions), after activation.
- **Delay impact:** None before activation; after activation, operating without it means reconciliation and overage review run from data exports/queries rather than a purpose-built surface — an operational cost the owner may accept or retire by approving this row.

## D16 — Migration execution grant + live DB verification

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** No migration has been executed by the credits programme; the live Supabase state is `UNKNOWN` (each migration file's own header says so; verifying it is a separate owner step, Phase 1 §2 preamble). Execution order (Phase 1 §3.4): (1) verify live which migrations are actually applied to the active project; (2) `20261018_ai_credits_ledger.sql` (gen-1, historical, only if absent); (3) `20261102_billing_batch_ledger.sql` → `20261102_phase53_workspace_billing.sql` → `20261109_billing_orders_subscriptions.sql` (strict prerequisite order per file headers); (4) `20261110_unified_credits_foundation.sql` — the Phase 1 draft (pricing-policy table + 2 seeded policies: v1.1 `LOCKED`, margin `PENDING` with `null` parameters; reconciliation view; five atomic `SECURITY DEFINER` RPCs mirroring the Phase 5.1 order; execute granted to `service_role` only). The 20261110 file was reviewed line-by-line against the real gen-2/Phase 5.3 DDL (Phase 1 §5.4), but its PL/pgSQL syntax and runtime behaviour are **unverified against any live database** — that verification is part of this grant, not a precondition already met.
- **Recommendation (Phase 1, preserved):** Approve as **one separate grant package**, after reviewing the 20261110 file.
- **What blocks it:** The owner grant. (This register records the recommendation; it does not execute anything, and no SQL was run in producing it.)
- **What an owner approval unlocks:** Live verification of applied migrations, then the ordered execution above, with the 20261110 draft's syntax verified against the live database immediately before its execution. Until this row is granted, the entire billing backend remains dormant regardless of code state (Phase 1 §6 item 4 delay impact).
- **Rollback note (from the migration file itself):** all migrations in the sequence are additive; rollback is `DROP` of the new objects only, without touching existing money tables.

## D17 — Webhook middleware exemption grant

- **Status:** `PENDING_OWNER`
- **Current state / evidence:** Static code reading (Phase 1 §2.6): `middleware.ts` gates `/api/credits/:path*` behind the access-code session cookie with **no exemption for `/api/credits/webhook`**. Midtrans notifications are server-to-server and carry no such cookie, so while the access gate is active a notification would be rejected (401/503) before reaching the handler — whose own authentication is the Midtrans signature verification. The fix is a documented, ready-to-apply, single-place matcher patch (Phase 1 §3.8 item 1: exempt exactly `/api/credits/webhook`, mirroring the existing `/api/access/*` exemption). It was deliberately **not** applied by Phase 1 because changing the access gate was outside that programme's fence; this register likewise applies nothing.
- **Recommendation (Phase 1, preserved):** Approve **together with the activation package** (D16/D6).
- **What blocks it:** The owner grant. Technically the patch is one place; the blocker is authorisation to change a production access gate, plus the fact that the exemption is only safe in combination with the handler's signature verification being live (it is, in code) and the billing service being configured (D6 chain).
- **What an owner approval unlocks:** The middleware patch may be applied as part of the activation package, with the passcode-gate test suite (`passcodeGate`) extended to assert the webhook path is reachable without a session cookie while all other `/api/credits/*` paths remain gated.
- **Delay impact (Phase 1):** Without this exemption, Midtrans notifications are rejected by middleware → grants never trigger → payments never become credits. This row is therefore on the critical path of D6 even though its change is the smallest in the register.

## D18 — Activation sequence order

- **Status:** `READY_FOR_APPROVAL`
- **Current state / evidence:** The sequence is fully specified (Phase 1 §6 item 13) and all of its code-side prerequisites exist in dormant form; what is missing is approval (this row) plus the grants it depends on (D16, D17, D6). Sequence, exactly as Phase 1 specified it: after D16/D17 — (i) server env (Midtrans + Supabase service) in **Preview**; (ii) `balance`/`usage` endpoints re-pointed to the batch ledger + persistent meter; (iii) `grantFreeOnce` called at account/workspace creation; (iv) reserve → settle wired into the AI transport, closing the per-surface bypasses; (v) sandbox end-to-end test (checkout → webhook → grant → use → settle → overage review); (vi) `AUTH_ENABLED` and any Production promotion remain **separate decisions afterwards**.
- **Recommendation (Phase 1, preserved):** Run **exactly this order**; do not switch on a partial chain in Production first.
- **What blocks it:** D6 (the activation authorisation itself) and its predecessors D16/D17. This row is `READY_FOR_APPROVAL` because the *plan* needs no further design work — approval of the order does not grant execution of any step.
- **What an owner approval unlocks:** The sequence becomes the binding plan for the activation programme, so each step's grant (env, endpoint changes, transport wiring) can be requested and verified against a fixed order rather than re-argued per step.

## D19 — Gen-1 → Gen-2 balance reconciliation migration

- **Status:** `BLOCKED_TECHNICAL`
- **Current state / evidence:** Two server generations hold incompatible balance models (Phase 1 §2.1): gen-1 per-**user** buckets (`credit_balances`, served today by the `balance` endpoint's memory placeholder) vs gen-2 per-**account** batches (canonical). No reconciliation function existed before Phase 1 (grep `reconcil` empty); Phase 1 added a dormant *detection* module (`creditReconciliation.js`) but the *migration* that would move gen-1 balances into gen-2 batches **has not been written** (Phase 1 §3.4 item 5, §4.4). Writing it safely requires a snapshot of live balances.
- **Recommendation (Phase 1, preserved in substance):** Treat this as pre-activation work to be written from verified live data — never derived from the repository alone; guessing at money data is explicitly out of bounds.
- **What blocks it:** Technical, not decisional: there is no verified live database access/snapshot in the programme's evidence (live state `UNKNOWN`, D16 step 1). The block clears only after D16's live verification produces the snapshot this migration must be written against.
- **What an owner approval unlocks:** Approval alone unlocks nothing executable — it authorises the *writing* of the migration once the technical block clears (snapshot in hand), as part of the activation programme. If live verification shows gen-1 was never populated in production, this row closes as "not applicable, evidence attached" rather than by assumption.

---

## Annex A — Already locked baseline (not open decisions)

Recorded from Phase 1 §6 ("Yang TIDAK menunggu keputusan — sudah terkunci — jangan dibuka lagi") so that no pending row above is read as reopening them. These items need no approval and are listed for cross-reference only:

| Item | Locked value |
|---|---|
| Plan prices | Free Rp0 · Starter Rp54,999 · Professional Rp79,999 · Business Rp159,999 |
| Plan credit allowances | 100 (Free, once) · 5,000 · 10,000 · 30,000 per period |
| Free terms (Amendment v1.2, 2026-11-07) | 100 AI credits **once per account** (not per month; spent = spent); Free AI features = **Chat AI only**; no top-up for Free |
| Metering (Amendment v1.1, 2026-11-06) | 1 credit = 200 weighted tokens (input ×1, output × provider price ratio; interim ×3 until D10 closes) |
| Server consumption order | Phase 5.1: Subscription (earliest expiry) → Bonus/FREE_ONCE (finite-expiry first) → Top-up (FIFO) — see D7 for the *frontend* alignment question |
| Grace period | 3 days, then return to Free |
| Period-end forfeiture | `PERIOD_END_30` (= row D3) |
| Overage | Parked for manual review; never silently charged |
| Renewal charging | No auto-debit; manual per period (the item Phase 1's locked list shorthands as its "D6" — see the numbering note under row D6 of this register) |
| Payment gateway | Midtrans (= row D5) |
| Billing handler consolidation | All billing actions inside the existing `api/credits/[action].js`; no new serverless functions (Vercel Hobby ceiling 12/12) |

## Annex B — Cross-reference: Phase 1 §6 items → register rows

| Phase 1 §6 item | Register row |
|---|---|
| 1. D1 account closure | D1 |
| 2. D2 subscription refunds | D2 |
| 3. D4 credit transfers | D4 |
| 4. Migration execution grant + live DB verification | D16 |
| 5. Webhook middleware exemption grant | D17 |
| 6. D8 top-up pricing | D8 |
| 7. D7 allocation-order alignment | D7 |
| 8. Margin formula adoption | D9 |
| 9. Verified provider tariffs | D10 |
| 10. DED tariff unification | D11 |
| 11. Spec §3.2 correction (Starter AHSP) | D12 |
| 12. Highest plan name | D13 |
| 13. Activation sequence | D18 (gated by D6) |
| 14. Frontend simulation fate | D14 |
| 15. Credit surfaces & admin | D15 |
| §2.2/§3.4 item 5: gen-1 → gen-2 reconciliation migration | D19 |
| Locked: D3 forfeiture `PERIOD_END_30` | D3 |
| Locked: D5 gateway Midtrans | D5 |
| Activation authorisation itself | D6 |

## Register boundaries

- This register **decides nothing**. Statuses describe the state of each decision as evidenced on 2026-11-10; recommendations are Phase 1's, preserved and labelled, and carry no authority until the owner adopts them by naming the row.
- Legal rows (D1, D2, D4) require legal review **before implementation** regardless of owner preference order; an owner choice among their options does not substitute for that review.
- No code, SQL, environment, middleware, or configuration was changed in producing this register, and no row in it constitutes a grant to do so.
- Companion document: `docs/audits/CREDIT_UI_TRUTHFULNESS_AUDIT.md` (Phase F), whose findings motivate rows D7, D8, D10–D14.
