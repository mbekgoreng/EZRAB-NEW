# EZRAB — Credit UI Truthfulness Audit (Phase F)

- **Date:** 2026-11-10 · **Repo:** `~/workspace/ezrab-unified` · **Branch:** `integrasi/unified-ui-engine` · **HEAD at audit:** `99de8927d3bdb0bc6e2befbcb22e290f64971896`
- **Scope:** Every user-visible credit-related surface in `src/` — balance displays, the credit page, the top-up modal, estimate badges, settings, mobile, landing pricing, and the AI surfaces (Chat AI, DED AI, AI Document) — plus the AI surfaces that show **no** credit UI at all.
- **Method:** Read-only code inspection. Every claim below cites the file that proves it. No UI code was changed by this audit.
- **Predecessor:** Phase 1 merged report (`EZRAB-LAPORAN-CREDITS-AI.md`, sections 2.4 and 2.7 in particular). This audit covers the UI-truthfulness slice of that report in full surface-by-surface detail and adds findings the Phase 1 slices did not enumerate.
- **Status context:** Production EZRAB is **Status A — PUBLIC SHOWCASE ONLY** (owner decision, 2026-11-02): the app is a closed showcase, promotion is manual, there is no admin on the public site, `AUTH_ENABLED = false` (`src/App.tsx:39`), and server billing is dormant. The audit judges each surface against that reality.

---

## 1. Headline findings

1. **The frontend never reads a server balance.** A full search of `src/` finds exactly two calls to credit endpoints: `GET /api/credits/usage` (one section of the Credit Page) and `POST /api/credits/checkout` (the online path of the Top-Up Modal, via `src/billing/checkoutClient.ts`). The endpoints `/api/credits/balance`, `/api/credits/estimate`, `/api/credits/order`, and `/api/credits/subscription` have **zero** frontend callers. Every balance, plan, ledger, and estimate the user sees is computed locally.
2. **Count: 15 of 17 inventoried visible surfaces read the localStorage simulation (directly or via the shared `CreditBalance` widget); 1 surface is hybrid (Top-Up Modal: simulation + a gated real checkout path); 1 surface reads canonical hardcoded plan configuration, not per-user state (landing pricing); 0 surfaces read a server-side balance.** Separately, at least 5 AI feature areas show **no credit UI whatsoever** while consuming the same paid provider gateway (Section 5).
3. **The single source behind all simulation surfaces** is `src/ai-credits/mockAdapter.ts`: an in-memory state object (`plan`, `subscription`, `topup`, `bonus`, `ledger`) persisted to `localStorage` under the key `ezrab-credit-sim-v1`, exposed to React through `src/ai-credits/useCreditSimulation.ts` (`mockGetBalance` / `mockConsume` / `mockTopUp` / `mockSetPlan` / `mockReset`). The file header is honest — it declares itself a mock, "not a production source of truth" — but that honesty lives in code comments, not uniformly in the rendered UI.
4. **Labelling quality is bimodal.** The Credit Page and the Settings billing tab are exemplary: they state in visible text that everything shown is a frontend simulation and that billing is not active. The surfaces users actually see most often — the compact balance pill in the TopBar and in AI tool headers, and the feature-shell credit chips — carry the **weakest** labelling: the rendered pill text is only a number and a plan name; the word "simulasi" appears only in the hover `title` attribute (`CreditBalance.tsx:34`). The feature-shell chips (`creditText` in `FeaturePageShell.tsx` / `FeatureFullscreenShell.tsx`) render `Kredit AI: N` with **no simulation qualifier at all**.
5. **The simulation is fully user-manipulable, and the UI itself hands the user the controls.** The Credit Page ships a visible plan switcher (`mockSetPlan`) and a Reset button (`mockReset`): any visitor can mint themselves a Business balance of 30,000 credits in two clicks, and that number is then displayed identically — same typography, same widget — on every surface. The persisted state is also directly editable in browser devtools (`ezrab-credit-sim-v1`).
6. **Six billing concepts that the server domain model has have no UI vocabulary at all:** reserved credits, expired credits, expiry dates, pending-review (overage) state, unknown/unverified tariffs, and the server-unavailable (503) state on balance surfaces. The UI's `total` silently conflates what the server will later split into available / reserved / consumed / expired (Section 4).
7. **The worst external-facing risk is not in the app but on the landing page.** Landing pricing (`ExactPricing.tsx`, `PricingBlocks.tsx`, `pricingMatrix.ts`) presents prices, per-period credit allowances, and billing-policy promises (rollover, prorated upgrades, "top-up credits never expire") as standing commercial terms, while checkout is dormant, auth is off, and several of those policies are still `PENDING_LEGAL_REVIEW` / `PENDING_OWNER` decisions (see the companion register, `docs/product/UNIFIED_CREDITS_OWNER_DECISIONS.md`). Inside a Status A showcase this is the surface a prospective customer reads as a live offer.
8. **One concrete mislabel bug (new finding):** the Sidebar billing box derives its plan label as `pro → "Pro"`, `starter → "Starter"`, **everything else → "Gratis"** (`src/components/layout/Sidebar.tsx:1329`). A simulated **Business** plan is therefore displayed as "Billing: Paket Gratis" while showing a Business balance. The Credit Page, Settings, and Mobile all label Business correctly; the Sidebar is the outlier.
9. **DED AI's credit gate is presentational, not effective.** `DedAiInputView.tsx` calls `consume(...)` at start and **ignores the return value**; the UI explicitly tells the user whose simulated balance is below the estimate that they may continue anyway after ticking an approval checkbox. A failed debit and a successful debit are indistinguishable in the UI, and because the debit happens *before* execution, a failed analysis run has no release/refund message anywhere.
10. **The dual-path Top-Up Modal is an activation-day trap.** In one modal, the simulation path grants credits instantly to the local balance the widgets read, while the Midtrans path (when configured) grants credits server-side via verified webhook — to a balance **no widget reads**. A user who pays for real will see no change in any balance display; a user who clicks "Simulasikan Top-up" receives a success checkmark. The modal text itself is honest about both paths; the surrounding balance ecosystem is what makes the combination misleading once the gateway is live.

---

## 2. Where the numbers actually come from

### 2.1 The simulation (the de facto billing system)

| Fact | Evidence |
|---|---|
| State shape: single aggregate buckets `subscription / topup / bonus`, a `plan`, and a local ledger array | `src/ai-credits/mockAdapter.ts` (`MockState`) |
| Persistence: `localStorage` key `ezrab-credit-sim-v1`; corrupted data silently falls back to defaults | `mockAdapter.ts:49,62-83` |
| Default state on first run: plan `starter`, 5,000 subscription credits — **not** the Free plan's 100 once-only credits | `mockAdapter.ts` initial state + `PLAN_CREDITS.starter` from `src/ai-credits/config.ts` (derived from `src/billing/plans.ts`) |
| Balance read: `mockGetBalance()` returns `total = subscription + topup + bonus`, `validUntil: null` always | `mockAdapter.ts:215-225` |
| Debit order inside the simulation: **bonus → top-up → subscription** | `mockAdapter.ts` `mockConsume` drain loop — differs from the locked server order (Phase 5.1); see register row D7 |
| Free-once credits are stored in the `subscription` bucket in the simulation (`mockSetPlan('free')` sets `subscription = FREE_INITIAL_CREDITS` = 100) | `mockAdapter.ts:204-213`; on the server, FREE_ONCE is its own batch type in allocation group 1 — the simulation's bucket model cannot represent it faithfully |
| Debit guards that do exist: plan entitlement gate for `chat-ai` / `ded-ai` / `ai-document` (via `featureGate.ts` → canonical `plans.ts`), integer/positive check, `jobReference` idempotency, insufficient-balance returns `false` | `mockAdapter.ts` `mockConsume` |
| Top-up simulation: one fixed offer (Rp5,000 → 3,000 + 600 bonus = 3,600), refused on Free with `status: 'failed'` | `mockAdapter.ts` `mockTopUp`; `config.ts` `TOPUP_OFFER` |
| Tariffs shown as estimates: draft ranges/targets in `config.ts` `TARIFFS`, every entry flagged `isCalibratedDraft: true` in code; `CREDIT_CONFIG_NOTE` states all tariffs are pre-production calibration drafts | `src/ai-credits/config.ts` |
| Chat metering: tokens are **estimated from visible text** (±4 chars/token, output weight ×3 interim), 1 credit = 200 weighted tokens (Amendment v1.1); provider token counts never reach the client | `src/ai-credits/tokenMetering.ts` header + constants |

### 2.2 The server endpoints (what exists vs. what the UI uses)

| Endpoint | Server behaviour (evidence) | Called by frontend? |
|---|---|---|
| `GET /api/credits/balance` | 503 `CREDITS_NOT_CONFIGURED` when `CREDITS_DB_CONFIGURED` is not `true`; if `true`, serves the **gen-1** engine over a **memory placeholder adapter** — not the gen-2 batch ledger (`api/credits/[action].js` `getAdapter()` / `balanceHandler`) | **Never** |
| `GET /api/credits/usage` | 503 `CREDITS_NOT_CONFIGURED` when DB unconfigured; when "configured", the meter is constructed with a `null` adapter and therefore returns `[]` structurally (`api/credits/usage.js`, `createUsageMeter(null)`) | **Yes — only** by `CreditPage.tsx` `UsageMeterSection` |
| `POST /api/credits/estimate` | Computes from server draft tariffs (`creditPricing.js`), **no auth**; header states the frontend must not compute debits itself | **Never** — the UI computes estimates locally from `config.ts` / `tokenMetering.ts` instead |
| `POST /api/credits/checkout` | Server catalog is the only source of amounts (`api/_lib/billingCatalog.js`); 503 `BILLING_NOT_CONFIGURED` until Midtrans + Supabase service env exist | **Yes — only** via `CreditTopUpModal` online path (`checkoutClient.ts`), and only when `VITE_MIDTRANS_CLIENT_KEY` is set and a real auth session exists |
| `POST /api/credits/webhook` | Midtrans notification → verified grant; authentication is the Midtrans signature. **Statically blocked by `middleware.ts`**, whose matcher gates `/api/credits/:path*` behind the access-code session cookie with no webhook exemption (Phase 1 §2.6; `middleware.ts` matcher + gate body) | n/a (server-to-server) |
| `GET /api/credits/order`, `GET /api/credits/subscription` | Billing-service reads behind workspace authorization | **Never** — all subscription/plan UI reads the simulation plan instead |

**Implication:** there is no surface on which a server-side balance *could* appear even if the backend were switched on tomorrow. Wiring the balance widget to `/api/credits/balance` is itself a required future change (and that endpoint must first be re-pointed from the gen-1 memory adapter to the gen-2 batch ledger — Phase 1 §3.8 item 2).

### 2.3 Hardcoded / canonical-configuration values (not per-user state)

These are not "simulation" and not "server" — they are compile-time configuration presented as product fact:

- **Plan prices and allowances** — `src/billing/plans.ts`: Free Rp0 / 100 initial; Starter Rp54,999 / 5,000; Professional Rp79,999 / 10,000; Business Rp159,999 / 30,000 per period. Owner-locked numbers (Phase 1 §6, "already locked" list); mirrored server-side in `api/_lib/billingCatalog.js` with a drift test.
- **Top-up offer** — Rp5,000 → 3,600 credits, explicitly `PHASE1_OFFER_PENDING_D8` in the server catalog; final pricing is register row D8 (`PENDING_OWNER`).
- **Landing strikethrough anchors** — `ExactPricing.tsx` `PLAN_PRESENTATION` hardcodes "original prices" Rp125,000 (Starter) and Rp180,000 (Professional) and derives "HEMAT n%" badges from them. These anchors exist **only** in that presentation file — they are not in `plans.ts` or the server catalog. This audit takes no position on whether they were owner-approved elsewhere; inside the repo they are an unverified hardcoded claim sitting next to canonical numbers.
- **Draft tariffs** — `config.ts` `TARIFFS` (chat 5–20 / 20–50, document 50–250, DED flat 500/650/800, revision 100–300). The `ded-ai/revision` tariff is an orphan: defined, never referenced by any debit path (Phase 1 §2.5).

---

## 3. Per-surface audit

Truthfulness scale used below: **Truthful** = a reasonable user, reading only what is rendered (not hover text, not code), understands the number is a local simulation / draft and billing is inactive. **Mostly truthful** = simulation is labelled somewhere on the surface but a rendered element, taken alone, implies a real balance. **Misleading risk** = the rendered surface, taken as users actually encounter it, implies a real server-side balance, a working payment, or an enforced paid gate that does not exist.

### 3.1 TopBar balance widget — `CreditBalance` in `src/components/navigation/TopBar.tsx:958`

- **Data source:** simulation (`CreditBalance.tsx` → `useCreditSimulation` → `mockGetBalance`).
- **Rendered content:** coin icon, abbreviated total (`formatCreditsShort`, e.g. `5rb`), plan id text (raw lowercase id, e.g. `pro`), a `+` top-up affordance. The word "simulasi" appears **only** in the `title` tooltip and the top-up button's title; the aria-label (`Saldo kredit AI N kredit, paket …`) does **not** mention simulation.
- **Verdict: Misleading risk (highest-frequency surface).** It sits in the global header of every workspace screen, styled identically to a real account balance. A screenshot, a screen-share, or a casual glance reads it as authoritative. The `+` button opens the Top-Up Modal (Section 3.5), reinforcing the impression of a working purchase flow.
- **Required future change:** when server billing activates, this widget must read the server balance (after the endpoint is re-pointed to the gen-2 ledger) and must render reserved/available distinctly; while simulation remains, the visible pill — not just its tooltip — should carry the demo/simulation qualifier wherever it is the primary balance affordance. (Audit recommendation only; no change made.)

### 3.2 Sidebar billing box — `src/components/layout/Sidebar.tsx:92,1304-1382`

- **Data source:** simulation (`useCreditSimulation`, `balance.total`, `balance.plan`).
- **Rendered content:** "Billing: Paket {label}" + "{total} kredit (simulasi)"; tooltip adds "backend billing belum live". Per-plan styling (Free plain, Starter framed, Pro gradient).
- **Verdict: Mostly truthful, with one concrete defect.** The visible "(simulasi)" is good. The defect: the label derivation at line 1329 maps only `pro` and `starter`; `business` (and any other value) falls through to **"Gratis"**, so a Business simulation displays as a Free plan with a 30,000-credit balance. Plan styling has the same gap (Business gets the plain Free style, because only `pro`/`starter` branches exist).
- **Required future change:** fix the label/style mapping to cover all four plans (bug fix, independent of billing activation); on activation, source plan + balance from the server subscription/balance endpoints, which the frontend currently never calls.

### 3.3 Mobile menu plan note — `src/components/mobile/MobileV3.tsx:346-387`

- **Data source:** simulation (`useCreditSimulation`; plan label via `CREDIT_PLAN_LABELS`, which handles all four plans correctly).
- **Rendered content:** profile card chip shows the plan name **without** a simulation qualifier; directly beneath, a note reads "Paket saat ini (simulasi): {label} · Lihat paket & penggunaan". No balance number is shown on this surface. The linked destination is the Settings subscription tab (Section 3.10), which is well labelled.
- **Verdict: Mostly truthful.** The chip alone overstates (a plan badge reads as an account fact), the note immediately below corrects it.
- **Required future change:** keep the qualifier attached to the chip itself on activation; source from server subscription state.

### 3.4 Credit Page — `src/ai-credits/CreditPage.tsx`

- **Data source:** simulation for the balance cards, plan card, usage summary, and history (`useCreditSimulation`); **server** for exactly one section (`UsageMeterSection`, `fetch('/api/credits/usage?limit=20')`).
- **Rendered content:** the page header states in body text: "Seluruh angka di halaman ini adalah **simulasi frontend** — bukan penagihan nyata." Balance is decomposed into subscription / top-up / bonus cards with honest sublabels ("dari pembelian simulasi", Free described as "kredit awal (sekali) — bukan jatah periodik"). A calibration footnote carries `CREDIT_CONFIG_NOTE` (all tariffs are pre-production drafts) and admits "Masa berlaku kredit langganan belum ditentukan pada fase ini" (subscription-credit validity not yet determined). The usage-meter section handles its four states honestly: loading; **unavailable** → "Backend usage meter belum aktif… Tidak ada data simulasi yang ditampilkan sebagai data nyata"; empty; data (with per-row status labels including "biaya provider belum dapat ditentukan" for `UNDETERMINED` costs).
- **Verdict: Truthful — the best-labelled surface in the product.** Two residual issues: (a) the page also hosts the demo controls — plan switcher and Reset — which let any visitor rewrite the "balance" the rest of the app displays (acceptable in a demo world, disqualifying in a billing world); (b) the hero card's "Top-up Kredit" button and the per-bucket cards use the same visual language as real account balances, so the page's honesty depends on its header paragraph being read.
- **Required future change:** on activation, remove or demo-gate the plan switcher/Reset, replace simulation reads with server balance + ledger reads, and keep the usage-meter section's honest unavailable state as the pattern for all server-backed sections.

### 3.5 Top-Up Modal — `src/ai-credits/components/CreditTopUpModal.tsx`

- **Data source: hybrid.** Simulation path: `mockTopUp()` (instant local grant). Online path: `startOnlineCheckout` (`src/billing/checkoutClient.ts`) → `POST /api/credits/checkout` → Midtrans Snap; the file header and the Snap callbacks state correctly that credit is granted by the server from the verified webhook, never by the browser callback.
- **Rendered content:** For non-Free plans, a simulation banner states real payment is not active and the button "hanya menambah saldo simulasi". The online section states "Terhubung / Belum terhubung" based on `isOnlinePaymentConfigured()` (presence of `VITE_MIDTRANS_CLIENT_KEY`), and when unconfigured says plainly "Payment gateway not connected". Server 503s surface as "Server pembayaran belum terhubung (konfigurasi server belum lengkap)". Online checkout requires a real auth session and tells demo users so. For Free, the modal correctly refuses top-up and explains the once-only 100-credit policy (Amendment v1.2). After a simulated top-up it shows "Simulasi top-up dicatat… Bukan pembayaran nyata."
- **Verdict: Mostly truthful today; structurally risky at activation.** Today's text is honest on both paths. The structural problem: both paths live in one modal and act on two different balances, while every balance display in the app reads only the simulation one. The day the gateway is configured, "Bayar Online" will take real money and the visible balance will not move (grant lands in the server ledger), while "Simulasikan Top-up" will still mint free local credits next to it. Note also the modal offers the Phase-1 top-up (Rp5,000 → 3,600) as *the* offer; its final pricing is undecided (register D8).
- **Required future change:** at activation, the modal must become single-path (server checkout only in the paid build; simulation button confined to demo mode), and post-payment UX must poll/read the server order + balance rather than the simulation. Until then, no change: the current dual presentation is the honest description of a dormant gateway.

### 3.6 Estimate badge — `src/ai-credits/components/CreditEstimateBadge.tsx`

- **Data source:** local draft configuration (`config.ts` `TARIFFS`) or local token estimation (`tokenMetering.ts`), depending on caller. The server estimate endpoint is never consulted.
- **Rendered content:** "Estimasi: {range}" + a small "simulasi" tag; tooltip: "Estimasi simulasi frontend — bukan pengukuran biaya backend."
- **Verdict: Truthful as an estimate label; incomplete as a tariff disclosure.** It never presents a range as a fixed price, which is correct. It does not disclose that the underlying tariffs are uncalibrated drafts and that provider tariffs are entirely `NULL`/`UNKNOWN` server-side — "simulasi" is doing all of that work in one word. In Chat AI the badge's range is actually a single reservation estimate rendered as min = max (see 3.8), so the "range" framing there is nominal.
- **Required future change:** when tariffs are verified (register: Provider tariff verification), the badge should distinguish "estimate (draft tariff)" from "estimate (verified tariff)"; final-cost display must come from settlement, not from this badge's math.

### 3.7 Low-balance notice — `src/ai-credits/components/CreditLowBalanceNotice.tsx`

- **Data source:** simulation. Threshold is a hardcoded constant (`LOW_BALANCE_THRESHOLD = 500`, `config.ts`).
- **Rendered content:** "Saldo kredit AI rendah ({total} kredit, simulasi). Fitur AI mungkin memerlukan top-up." + Top-up button (opens 3.5).
- **Verdict: Truthful.** Visible simulation qualifier in the sentence itself. Note the threshold is a UX constant, not a policy: at 500 it fires for a Free user who has spent half their lifetime grant and for a Business user with 30,000-credit periods alike.
- **Required future change:** on activation, drive from server available balance (net of reservations), not the simulation total.

### 3.8 Chat AI — `src/ai-tools/ezrab-ai/view.tsx`

- **Data source:** simulation throughout: header `CreditBalance compact` (3.1), `CreditEstimateBadge` fed by `estimateReservationCredits` (token estimate over conversation text + a 1,000-token output allowance, `tokenMetering.ts`), debit via `mockConsume` gated by `chatCreditDebit.ts`.
- **What it gets right (code evidence):** local/deterministic intents and navigation commands are explicitly **not charged** (comments and routing at view.tsx:697-710: local intent "tidak memanggil AI → tanpa biaya"); the debit fires **only** when the send outcome is strictly `success === true` (`debitChatCreditOnSuccess`), so gateway failures, timeouts, and invalid responses do not reduce the balance (regression-tested, `src/test/chatCreditDebit.test.ts`); the charged amount is token-metered from the actual sent/received text, and the per-message label "⚡ {n} kredit (simulasi)" renders **only if** the debit actually recorded (`charged` flag).
- **Where it misleads or is incomplete:**
  - The pre-send gate is advisory, not a gate: on insufficient simulated balance it opens a dialog that names the estimate and balance as simulation values — and offers **"Tetap kirim" (Send anyway)**, which proceeds without any debit ever being collectible. A user learns that the balance is decorative.
  - The "final" per-message number is still an estimate: tokens are estimated from text (±4 chars/token), output weight ×3 is an interim constant standing in for unverified provider price ratios. The message label says "(simulasi)" but not "estimated tokens"; the ledger description does carry "±… token … (estimasi simulasi)".
  - FAST vs ADVANCED are not tariff-differentiated in the debit (same metering formula); the draft tariff table distinguishes them, the actual charge does not.
  - Failure is silent in credit terms: not charging on failure is correct, but no "you were not charged" signal exists; the user cannot distinguish "free because it failed" from "free because it is a deterministic operation".
- **Verdict: Mostly truthful** — the most carefully engineered debit path in the simulation, undermined by the bypassable gate and the compact header pill (3.1).
- **Required future change:** server reserve → execute → settle at the AI transport layer (Phase 1 §3.8 item 4), with the dialog becoming a real insufficient-balance stop (or an explicit owner-decided free-continuation policy), and per-message display sourced from the settled operation.

### 3.9 DED AI — `src/ai-tools/ded-ai-estimate/DedAiInputView.tsx`, `view.tsx`, `DedAiResultView.tsx`

*(Audited read-only; DED files are owned by a parallel program and were not modified.)*

- **Data source:** simulation. Header `CreditBalance compact showTopUp={false}`; shell header chip `creditText = "Kredit AI: {total}"` (`view.tsx:748`) with **no simulation qualifier**; estimate from the flat draft tariff selected by a **user-chosen** complexity category (simple/medium/complex = 500/650/800, `config.ts` `TARIFFS`).
- **Debit behaviour (code evidence):** `handleStart` calls `consume('ded-ai', dedTarget, …)` **before** the analysis runs and **ignores its boolean result**. Consequences, all visible-behaviour facts: (a) insufficient balance does not stop or even mark the run — the panel itself says, when balance < estimate, "Saldo simulasi … di bawah estimasi. Anda tetap bisa lanjut setelah menyetujui, atau top-up dulu."; (b) the charge is the same for 1 file or many files, and for Full-AI vs database policy modes; (c) if the analysis then fails, the pre-debit is never released and no UI mentions it; (d) the entitlement gate, by contrast, *is* effective — Free plan is hard-blocked by `planAllowsAiFeature` with the locked-message text.
- **Result surface:** `DedAiResultView.tsx:317-325` shows a banner "DED AI · kategori {category} — {credits} kredit" with a "simulasi" chip. The number shown is the pre-run flat target, presented in the results context where a user will read it as the cost of the completed analysis; there is no actual-usage figure to compare it with.
- **Verdict: Misleading risk.** The surface performs a paid gate (estimate, approval checkbox, balance check, top-up offer) while the debit is unenforced and unrefundable-on-failure. It is the clearest case of UI implying a billing discipline the code does not implement.
- **Required future change:** the flat-vs-token question is an open owner decision (register: "DED flat reserve vs token settlement", `PENDING_OWNER`; Phase 1 recommendation: flat retained only as a maximum reservation estimate, token-metered settlement as the basis). Whatever is decided, the debit result must gate or explicitly waive, and failure must release. No change is made by this audit.

### 3.10 AI Document — `src/ai-tools/document-ai/components/DocAnalyzer.tsx`, `components/DocCreator.tsx`, `view.tsx`

- **Data source:** simulation. Analyzer header `CreditBalance compact showTopUp={false}`; shell chip `creditText = "Kredit AI: {total}"` (`view.tsx:353`), no simulation qualifier; estimate badge from draft tariffs (`ai-document/simple` 50–100, `complex` 100–250 by tab category).
- **Debit behaviour (code evidence):** analysis modes debit **after** success, at the tariff **maximum** (`consume('ai-document', docEstimate.max, …)`, `DocAnalyzer.tsx:179`), and the result is ignored — a failed debit (insufficient balance) leaves the delivered analysis on screen with no notice. The **Q&A mode (`askQuestion`) contains no `consume` call at all**: it is a full provider-backed AI interaction that is never debited, never estimated, and never labelled free. `DocCreator.tsx` (create / revise / enhance / translate flows) reads the balance **only** for the plan-entitlement gate (`planAllowsAiFeature`) and performs **no debit of any kind**. The entitlement gate itself is effective (Free and Starter are locked out of AI Document per `plans.ts`).
- **Verdict: Misleading risk (by inconsistency).** Three sibling modes in one product present three different billing realities — charged-at-max, never charged, gate-only — under one identical balance display. A user cannot form a correct model of what costs credits.
- **Required future change:** charge decisions must come from one authoritative feature-billing matrix enforced at the transport layer (the dormant `api/_lib/featureBillingMatrix.js` already classifies these as `AI_METERED / NOT_WIRED`); per-mode estimate → settle, with Q&A and document creation either metered or explicitly labelled free by owner decision. No change made by this audit.

### 3.11 Settings — Paket & Billing tab — `src/components/settings/UnifiedSettingsView.tsx:171-185,1812-1850`

- **Data source:** simulation balance + canonical plan definitions (`getPlanDefinition(CREDIT_PLAN_TO_PLAN_ID[plan])` from `plans.ts` — so the plan facts shown are the canonical price/allowance, not simulation-invented).
- **Rendered content:** heading "Paket Saat Ini (Simulasi)"; body: "Saldo kredit AI saat ini: {total} kredit (simulasi). Billing belum aktif — belum ada langganan berbayar yang terverifikasi; paket di atas adalah paket pada simulasi kredit frontend EZRAB."; a badge reads "Mode Simulasi — Bukan Langganan Aktif". The search index entry for the tab itself is described as "…status langganan (simulasi)".
- **Verdict: Truthful — the model the other surfaces should converge to.** It names the data source, the activation state, and the absence of any verified paid subscription in one place.
- **Required future change:** on activation this tab becomes the natural home for server subscription state (the `/api/credits/subscription` endpoint exists and is currently never called); until then, none.

### 3.12 Landing pricing — `src/components/landing/exact/ExactPricing.tsx`, `PricingBlocks.tsx`, `pricingMatrix.ts`

- **Data source:** canonical hardcoded configuration (`plans.ts`) for prices, project limits, and credit allowances; presentation-only additions hardcoded in the components (strikethrough "original" prices and discount badges in `ExactPricing.tsx`; feature lists in `PricingBlocks.tsx`); policy prose in `pricingMatrix.ts` `BILLING_TRANSPARENCY_POINTS`.
- **Rendered content (public site):** four plan cards with monthly/annual prices, "HEMAT n%" badges, per-period AI credit allowances, and a comparison matrix. The transparency points state, in present/future-definite terms: subscription credits renew only after successful payment; eligible leftover subscription credits roll over for up to 30 days; **top-up credits never expire and are not lost when a plan changes or a subscription ends**; upgrades are instant with prorated pricing; downgrades take effect next period. The matrix's top plan is displayed as **"Advanced"** (`PLAN_DISPLAY_NAME.business = 'Advanced'`, following Spec v1.0) while the app everywhere else calls the same plan **"Business"** (register: naming decision, `PENDING_OWNER`).
- **Where it misleads:**
  - None of the billing machinery behind these promises is live: checkout is dormant, `AUTH_ENABLED = false`, no migration has been executed, and the site operates under Status A (showcase only). The pricing surfaces carry no "billing not yet active" qualifier comparable to the in-app surfaces.
  - Several stated policies are **undecided, not merely unimplemented**: the fate of balances at account closure (D1), subscription refunds (D2), and credit transfers (D4) are `PENDING_LEGAL_REVIEW`; "top-up never expires" is a consumer-facing commitment being made ahead of those reviews. The 30-day rollover echoes the locked forfeiture rule (D3, `PERIOD_END_30`) but presents a fuller commercial policy than any single locked decision supports.
  - The comparison matrix's AHSP rows follow Spec v1.0 (Starter receives all AHSP categories) while the enforced code grants Starter CIPTA_KARYA only — the file header documents this divergence openly, but the rendered matrix a customer reads promises the Spec version (register: Starter AHSP entitlement scope, `PENDING_OWNER`).
  - The strikethrough anchors (Rp125,000 / Rp180,000) exist only in the presentation file (Section 2.3); discount percentages are computed from them on a public price display.
- **Verdict: Misleading risk (external/public).** Internally the numbers match the locked plan table; externally the page presents a purchasable, policy-complete offer that does not yet exist as a service.
- **Required future change:** an owner-level decision on what the public pricing page may promise while Status A stands (at minimum: an activation-state qualifier, and removal or owner-ratification of policy promises that are still pending legal/owner decisions). This is a policy fix, not a code fix, and is recorded here without any change being made.

### 3.13 Feature-shell credit chips — `src/components/feature-shell/FeaturePageShell.tsx`, `FeatureFullscreenShell.tsx`

- **Data source:** whatever the caller passes as `creditText`; both current callers (DED, Document) pass the simulation total. The prop's own doc comment is candid: "HANYA dari sumber data nyata aplikasi (saldo simulasi)" — only from the app's real data source (the simulation balance).
- **Rendered content:** a chip reading `Kredit AI: {total}` (with a zap icon in `FeaturePageShell`). No simulation qualifier, no plan, no affordance.
- **Verdict: Misleading risk (small surface, total qualifier loss).** This is the one place where even the word "simulasi" — present almost everywhere else in some form — is dropped entirely, in the header of the two heaviest AI tools.
- **Required future change:** the chip contract should require a source qualifier (simulation vs server) rather than a bare string; on activation it should render available-net-of-reserved from the server.

### 3.14 Game Space — `src/game-space/GameSpaceOverlay.tsx:269`, `catalog.ts`

- **Data source:** none (no credits involved).
- **Rendered content:** "tidak memakai AI credits" in the overlay; the catalog copy states games are free, local, "tanpa AI credits dan tanpa kuota".
- **Verdict: Truthful — the exemplar for deterministic/free labelling.** It proves the product already has a pattern for telling users an operation is free; that pattern is simply not applied to the deterministic *work* operations (volume calculation, RAB arithmetic, AHSP lookup, exports), which carry no credit labelling of any kind.
- **Required future change:** none for Game Space. The pattern should be extended (see Section 4, "free deterministic operations").

### 3.15 Surfaces counted but not separately sectioned

- `CreditUsageSummary.tsx` — simulation ledger aggregation; heading explicitly "(simulasi)". **Truthful.**
- `CreditUsageHistory.tsx` — simulation ledger table; every row's status renders as "Simulasi" (the mock only ever writes `status: 'simulated'`). **Truthful** as a simulation history; note it can never show a failed, pending, or reversed entry, because the mock never creates one — the table's Status column implies a richer lifecycle than the data has.
- `DedAiResultView.tsx` credit banner — covered in 3.9.
- Legacy `server/` prototype (flat 1-credit deduction from hardcoded sample subscription data, Phase 1 §2.1) — not reachable from the shipped UI; recorded here only so its existence is never mistaken for a backend. **Not a UI surface.**

---

## 4. Concept coverage: what the UI can and cannot say

The server domain model (gen-2: `credit_usage_operations`, `credit_batches`, `credit_batch_ledger`) has a full lifecycle. The UI's vocabulary covers a fraction of it:

| Concept | Server reality | UI today | Gap |
|---|---|---|---|
| **Available balance** | Derived projection of batches (`remaining − reserved`), per account/workspace | One `total` = subscription + top-up + bonus from localStorage, per **browser** (not per account, not per workspace) | The number's *scope* is wrong, not just its source: two browsers, two "accounts"; one workspace's members each see a private balance |
| **Reserved** | `RESERVED` operations with per-batch allocations; TTL; stuck-reservation detection in reconciliation | **No surface.** `ReservationStatus` exists in `types.ts` as an unused contract; Chat's "reservation estimate" is a pre-check number, not a reservation | Users will meet reservations for the first time at activation, with no UI pattern ready |
| **Consumed** | `SETTLED` operations with usage evidence + tariff version | Ledger negative entries (simulation), per-feature summary, Chat per-message label | Present, but amounts are estimates/flat targets labelled as usage |
| **Expired** | Batch `expiresAt`; subscription forfeiture `PERIOD_END_30` (locked, D3); expiration ledger kind; sweep RPC drafted | **No surface.** `mockGetBalance` hardcodes `validUntil: null`; no expiry date, no expired bucket, no warning. Credit Page footnote admits validity is "belum ditentukan" | A user cannot learn from the UI that subscription credits can expire at all — while the landing page simultaneously promises top-up credits *never* expire (3.12) |
| **Estimated vs final cost** | Estimate (reservation) → settle on actual usage evidence; overage parks in `REQUIRES_REVIEW` | Chat: estimate badge + post-hoc text-estimated charge, both estimates; DED/Doc: estimate **is** the charge (flat max/target) | No surface ever shows "estimated X, final Y"; the distinction the settlement model is built on is invisible |
| **Pending review** | `credit_settlement_reviews` queue; `resolveReview` restricted to `billing_admin`; overage never auto-charged (locked) | **No surface.** `LedgerStatus` includes `'pending'`, but the mock never writes it; there is no user-visible "under review" state and no admin surface (by Status A design) | An overage at activation would be invisible to the user whose operation is parked |
| **Failed operations** | Failure of EZRAB's own execution → reservation released in full (locked rule); provider cost is an operational loss, not a user charge | Chat: correctly not debited, but silently; Doc analysis: correctly not debited (debit is inside the success branch), silently; **DED: debited before execution, never released on failure**; Q&A/Creator/Magic: never debited at all | Only Chat implements the locked rule, and even there the user gets no "not charged" confirmation |
| **Free deterministic operations** | `featureBillingMatrix.js` classifies 11 operation types `DETERMINISTIC_FREE` (volume calc, RAB arithmetic, AHSP lookup, local price resolution, recalculation, plain PDF/Excel export, opening/editing projects…) — dormant, not enforced in UI | Chat local intents: explicitly uncharged (good). Everything else deterministic: **no label at all** — neither "free" nor an estimate badge. Game Space labels itself free (3.14) | A user cannot distinguish "this costs nothing by policy" from "this costs credits but nobody wired the meter" — and for the bypassed AI surfaces (Section 5) the second is true |
| **Unknown tariffs** | All provider tariffs `NULL` / `UNKNOWN` in `provider_tariff_versions`; output weight ×3 is an interim stand-in; margin policy parameters all `null` and refuse to compute | Draft tariffs flagged `isCalibratedDraft` in code and "draft kalibrasi" in the Credit Page footnote; estimate badges say only "simulasi" | No surface has an "unknown / unverified tariff" state; numbers derived from unknown tariffs render with the same confidence as any other number |
| **Billing service unavailable (503)** | `balance`/`usage` return 503 `CREDITS_NOT_CONFIGURED`; billing actions return 503 `BILLING_NOT_CONFIGURED` until env + migrations exist | Credit Page usage section: honest unavailable state (3.4). Top-Up Modal online section: honest not-configured states (3.5). **All balance surfaces: no 503 state exists**, because they never call the server — unavailability is masked by the simulation continuing to render | The primary balance UX cannot represent "billing is down/not configured"; at activation this becomes an outage-communication problem, not just a wiring problem |

---

## 5. The invisible surfaces: AI features with no credit UI at all

Phase 1 §2.5 established, and this audit re-verified by searching for `useCreditSimulation` / `mockConsume` consumers, that metering is attached per-surface by hand rather than at the shared AI transport (`providerClient.ts` → `POST /api/ai/tools/execute`). The following consume the same paid provider gateway as Chat AI but present **no balance, no estimate, no gate, and no debit**:

| Surface | Credit UI present | Note |
|---|---|---|
| Magic AI / Co-Assistant (chatbox + FullView, `src/components/copilot/`) | **None** — no import of the credit simulation anywhere in `src/components/copilot/` | Same gateway and product family as Chat AI; Free plan passes ungated |
| Magic AI RAB (multi-call DED pipeline) | **None** | The heaviest AI workflow in the product (read / synthesise / inventory / estimate) |
| AI Document — Create / Revise / Enhance / Translate (`DocCreator.tsx`) | Gate only (plan entitlement); no estimate, no debit | See 3.10 |
| AI Document — Q&A mode (`DocAnalyzer.tsx` `askQuestion`) | Balance pill is visible in the header, but the mode itself never debits | The pill's presence makes the absence of a charge *less* visible, not more |
| Secondary AI surfaces (receipt scan, AI market-price search, RAB review, drawing reader) | **None** | Same per-surface metering pattern gap (Phase 1 §2.5) |

**Truthfulness consequence:** absence of UI is itself a claim. Users reasonably read an unmetered surface as a free surface. When billing activates and these surfaces begin reserving/settling (the Phase 1 plan closes the bypass at the transport layer, not per surface), the change will feel like a new charge on previously "free" features unless the activation also introduces explicit metering communication there. The dormant `featureBillingMatrix.js` already marks each of these `AI_METERED` with `integrationStatus: NOT_WIRED` — the honest internal record exists; the user-facing one does not.

---

## 6. Master per-surface table

| # | Surface | Data source | Truthful? | Risk | Required future change |
|---|---|---|---|---|---|
| 1 | TopBar `CreditBalance` widget | localStorage simulation | No (rendered text unlabelled; "simulasi" only in tooltip) | **High** — global header; reads as real account balance in every screenshot | Read server balance at activation; visible simulation qualifier until then |
| 2 | Sidebar billing box | localStorage simulation | Mostly (visible "(simulasi)") | Medium — **Business mislabelled "Gratis"** (`Sidebar.tsx:1329`); styling gap for Business | Fix plan label/style map for all plans; server-source at activation |
| 3 | Mobile menu plan note | localStorage simulation (plan only) | Mostly (note labelled; chip not) | Low–Medium | Qualifier on the chip; server subscription state at activation |
| 4 | Credit Page (balance/ledger/summary) | localStorage simulation | Yes (header + sublabels) | Medium — hosts plan-switch/Reset minting controls; hero card mimics real balance | Demo-gate the minting controls in any paid build; server balance + ledger reads at activation |
| 5 | Credit Page usage-meter section | **Server** (`/api/credits/usage`) | Yes (honest 503/empty states) | Low — structurally always empty until meter adapter is persistent | Persistent usage adapter at activation (Phase 1 §3.8 item 3) |
| 6 | Top-Up Modal — simulation path | localStorage simulation (`mockTopUp`) | Yes (banner + result text) | Medium — instant local "success" beside a real payment path | Confine to demo mode at activation |
| 7 | Top-Up Modal — online path | **Server** (checkout → Midtrans; grant via webhook) | Yes (not-connected states honest; grant attribution correct) | **High at activation** — paid grant lands in a balance no widget reads; webhook statically blocked by middleware until exemption granted | Webhook exemption + post-payment server-balance read; single-path modal in paid build |
| 8 | `CreditEstimateBadge` | Local draft tariffs / local token estimate | Mostly (labelled estimate + simulasi; draft-tariff nature undisclosed) | Medium | Distinguish draft vs verified tariff once provider tariffs are verified |
| 9 | `CreditLowBalanceNotice` | localStorage simulation | Yes | Low — threshold is a UX constant, not policy | Drive from server available-net-of-reserved at activation |
| 10 | `CreditUsageSummary` | localStorage simulation ledger | Yes (heading "(simulasi)") | Low | Server ledger at activation |
| 11 | `CreditUsageHistory` | localStorage simulation ledger | Yes (all rows "Simulasi") | Low — Status column implies lifecycle states the mock never produces | Server ledger with real statuses (incl. pending/failed/reversed) at activation |
| 12 | Chat AI (gate, debit, per-message label) | localStorage simulation; token-estimated metering | Mostly (debit-on-success only; labels present) | Medium — gate bypassable via "Tetap kirim"; FAST/ADVANCED undifferentiated; failure silence | Server reserve/settle at transport; real insufficient-balance behaviour per owner policy |
| 13 | DED AI input + result | localStorage simulation; flat draft tariff | **No** (debit result ignored; pre-debit never released; result banner presents flat target as the run's cost) | **High** — performs a paid gate that does not gate | Owner decision on flat-reserve vs token-settlement; enforce debit result; release on failure |
| 14 | Feature-shell credit chips (DED + Document headers) | localStorage simulation total | **No** (no qualifier at all) | Medium–High — qualifier loss in the heaviest tools' headers | Chip contract requires source qualifier; server available balance at activation |
| 15 | AI Document Analyzer (analysis modes) | localStorage simulation; flat draft max | Mostly (badge labelled; debit at max, result ignored) | Medium — estimate and charge conflated; failed debit silent | Estimate → settle per mode; surface debit failure |
| 16 | AI Document Q&A mode | None (no debit) under a visible balance pill | **No** (unmetered AI presented beside a balance) | Medium | Meter it or label it free by owner decision (via billing matrix) |
| 17 | AI Document Creator modes | Gate only (plan entitlement); no debit | **No** (same as above) | Medium | Same as 16 |
| 18 | Settings — Paket & Billing tab | localStorage simulation + canonical `plans.ts` | Yes (exemplary labelling) | Low | Become the server subscription surface at activation (`/api/credits/subscription` exists, uncalled) |
| 19 | Landing pricing + comparison matrix | Canonical hardcoded config (`plans.ts`) + presentation-only hardcoded anchors/prose | **No** (presents live commercial terms + undecided policies as standing promises; no activation qualifier) | **High (public)** — customer-facing offer under Status A showcase; AHSP rows promise Spec scope vs code; top plan shown as "Advanced" vs app "Business" | Owner decision on permissible public promises under Status A; ratify or remove pending-policy prose and unverified anchors |
| 20 | Magic AI / Co-Assistant; Magic RAB; secondary AI surfaces | None (no credit UI) | **No** (absence implies free) | Medium–High — real provider cost, zero user signal; activation will feel like a new charge | Transport-level metering + communication at activation (Phase 1 §3.8 item 4) |
| 21 | Game Space | None needed | Yes (explicitly "tanpa AI credits") | None | None — use as the pattern for free-operation labelling |

**Counts for the record:** of the 19 user-facing credit-bearing rows above (excluding #20's absent UI and #21's non-credit surface), **15 read the localStorage simulation, 1 is hybrid simulation + server (Top-Up Modal, counted once in row 6/7 as one component with two paths), 1 section reads the server (row 5), and 1 reads canonical hardcoded configuration (row 19). No surface reads a server-side balance.**

---

## 7. The three worlds: where the simulation belongs and where it must never be authority

The audit's central structural recommendation is that three modes — currently blended into one UI — be kept explicitly separate. This section defines the separation; it changes nothing by itself.

### World 1 — Showcase / demo simulation (current production reality)

- **Definition:** Status A public showcase and demo mode. No auth (`AUTH_ENABLED = false`), no verified subscription, no server billing. The localStorage simulation is the *intended* experience: it demonstrates balance, gating, top-up, and history interactions so the product can be evaluated.
- **Where the simulation is required / legitimate:** demo plan switching and Reset (Credit Page), simulated top-up, simulated debits in Chat/DED/Document, the demo entitlement gates derived from canonical `plans.ts`. Removing it here would remove the only billing experience the showcase has.
- **Conditions for legitimacy:** every surface that renders a simulation number must say so in rendered text (the Settings tab and Credit Page already meet this bar; the TopBar pill and feature-shell chips do not); landing/public surfaces must not convert simulation-era policy drafts into customer promises; demo controls (plan switch, Reset) must be recognisably demo controls.
- **Hard boundary:** in this world the simulation must never be described — in UI copy, sales material, or support answers — as an account balance, a purchase, or an entitlement. It is per-browser, resettable, and user-editable by design.

### World 2 — Local development testing

- **Definition:** developer and test use of the same machinery: `mockAdapter` state seeding, `mockReset`, plan switching to exercise entitlement gates, the in-memory billing store and ledger test suites, sandbox Midtrans flows.
- **Where the simulation is required / legitimate:** unit/integration tests (the credit suites exercise the real `mockAdapter`), UI development without a backend, regression harnesses. The simulation's determinism is an asset here.
- **Hard boundary:** test/demo state must never be promotable into a billing fact — no migration path may import a localStorage balance into the server ledger as a grant. (The gen-1 → gen-2 reconciliation migration, when written, concerns *server* gen-1 data only; see register row on reconciliation, `BLOCKED_TECHNICAL`.) Demo-minted credits have no monetary meaning and must acquire none retroactively.

### World 3 — Future authenticated server-side billing (dormant)

- **Definition:** the gen-2 system as designed: authenticated workspace ↔ billing account, batch ledger as the single financial source of truth, Phase 5.1 allocation order, reserve → execute → settle/release with usage evidence, manual overage review, Midtrans grants via verified webhook, `grantFreeOnce` at account creation.
- **Authority rule:** in this world the server ledger is the *only* authority. The frontend renders server state (available / reserved / consumed / expired, operation statuses including pending-review and failed-with-release) and never computes a balance, a debit, or a final cost locally. Local computation survives only as clearly-labelled *estimates* pending settlement.
- **What must never happen:** the simulation and the server ledger must never be co-authoritative — no build may show simulation numbers in surfaces that also accept real payment (the Top-Up Modal's dual path, Section 3.5, is the concrete form of this hazard); the simulation must never be the fallback when the server returns 503 (the honest response to `NOT_CONFIGURED` is an unavailable state, as the usage-meter section already demonstrates); entitlement gates must be enforced server-side at the AI transport, not by a client plan flag.
- **Transition:** the ordered activation sequence (migration grant → webhook exemption → env → endpoint re-pointing → transport wiring → sandbox E2E) is recorded in the owner decision register; the simulation's retirement is its own decision there (`PENDING_OWNER`), and the simulation's consumption-order alignment (D7) is a prerequisite decision if the simulation remains visible during any transition window.

---

## 8. Worst misrepresentation risks (ranked)

1. **Public pricing promises (3.12).** A prospective customer can read prices, credit allowances, rollover, prorata, and "top-up never expires" as the terms of a service that cannot currently be bought, on a site whose governing status is showcase-only — with three of the underlying policies still pending legal review.
2. **The unlabelled global balance pill (3.1).** The most-seen credit element in the product renders a user-editable localStorage number as an account balance; its only simulation disclosure is a hover tooltip.
3. **DED's non-gate (3.9).** An approval checkbox, an estimate, and a top-up offer perform a payment discipline that the code explicitly waives ("Anda tetap bisa lanjut"), while failed runs keep the pre-debit. Both directions mislead: users believe they were charged correctly; the ledger says otherwise.
4. **Activation-day top-up split-brain (3.5).** Real payment → invisible server grant; simulated payment → instant visible grant. The first real paying user is the most likely person in the system to conclude their payment vanished or to pay twice.
5. **Silent unmetered AI (Section 5).** The heaviest AI workflows carry no credit signal at all; every day of showcase use trains the expectation that they are free.
6. **Business shown as "Gratis" (3.2).** A small bug with outsized screenshot potential: the highest tier labelled as the free tier in the primary navigation.
7. **Missing lifecycle vocabulary (Section 4).** No reserved / expired / pending-review / unknown-tariff / unavailable states exist in the UI. At activation these will arrive as unplanned UX under time pressure — the exact conditions under which misleading copy gets written.

---

## 9. Audit boundaries

- This audit **changed no code**. It did not remove, gate, or relabel the simulation; Sections 3 and 7 record *required future changes* for owner-gated work, they do not enact them.
- DED files (`src/ai-tools/ded-ai-estimate/**`, `src/ded-rab-v2/**`) were read for evidence only, in deference to a parallel program editing them.
- No build, typecheck, test run, SQL execution, environment change, or deployment was performed for this audit. Server behaviours are stated from handler code, not from live calls; live database/migration state remains `UNKNOWN` exactly as Phase 1 recorded.
- Companion document: `docs/product/UNIFIED_CREDITS_OWNER_DECISIONS.md` — the consolidated owner decision register (Phase G), whose rows D7, D8, and the simulation-retirement, tariff-verification, DED-settlement, AHSP-scope, and naming decisions correspond to the "required future changes" above.
