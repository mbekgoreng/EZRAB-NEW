# AI Provider Tariff Readiness Audit (Phase 2, Phase E)

| Field | Value |
|---|---|
| Status | **AUDIT ONLY — dormant. No price was written into code; no tariff registry was updated.** |
| Date / retrieval date | 2026-11-10 (all web sources retrieved 2026-11-09 22:44–22:45 UTC) |
| Repo / branch | `ezrab-unified`, `integrasi/unified-ui-engine`, HEAD `99de8927d3bdb0bc6e2befbcb22e290f64971896` |
| Companion document | `docs/architecture/UNIFIED_AI_BILLING_INTEGRATION.md` (Phases D + H) |

> **Fence statement.** This audit produced documentation only. No code, registry,
> environment variable, or Supabase setting was changed; nothing was activated.
> Prices appear in this document **only** where they were read on an official
> provider page during this audit, tied to that page's URL and the retrieval date.
> Figures that exist inside EZRAB's own codebase are reported separately and are
> labeled **Unverified estimate** wherever they appear — they are operational
> guesses recorded by the codebase itself, not prices.

---

## 1. Method, and the one distinction that decides most rows

**Sources.** Only official provider documentation/pricing pages were used for
verification: Google (Gemini Developer API pricing), DeepSeek API docs, OpenAI
developer pricing, Anthropic (Claude) pricing docs, Inception docs, MiniMax platform
pricing. Third-party roundups were used, at most, to *locate* an official page —
never as a source of numbers. Where an official page could not be retrieved or did
not list the model, the row is **Unknown**. Availability checks (e.g. a provider's
`GET /models` response) verify that a model *exists*, never what it *costs*; the
codebase comments that record "verified 2026-09-23 via GET /models" are availability
evidence only.

**The gateway distinction.** An upstream list price is EZRAB's actual cost **only**
where EZRAB calls that provider directly with its own keys (Google Gemini native;
Inception on the server path). Most EZRAB traffic, however, reaches models through
**gateways** — Crown (`crown.ai.id`), AtmoRouter (`atmorouter.dev`), ZyRouter
(`api.zyrouter.com`), River (`api.river.ai`), Dahl (`inference.dahl.global`), Atria
(`api.atria-asi.ai`), VLEEE (`api.vleee.net`) — whose per-model tariffs are **not
published** on any official page retrievable in this audit. For those rows the
underlying model's list price may be Verified official while **EZRAB's cost on that
route remains Unknown**. Gateway SKUs (e.g. `ali/…`, `ag/…`, `cx/…`, `cb/…`,
`cbcn/…`) are the gateway's own product names; a similarly-named upstream model does
not make the SKU's price known.

**Internal registries today.** Both server tariff registries agree with this audit's
pessimism: `api/_lib/tariffRegistry.js` (version `2026-11-02.1`) and
`api/_lib/providerTariffs.js` (`TARIFF_VERSION '2026-10-18.1'`) seed exactly three
models — `gemini-3.5-flash-lite`, `geminiflash-3.8`, `Atria-Dawn-Preview` — all with
`null` prices, `configured: false`, `source: null`, status UNKNOWN, and
`DEFAULT_FX.usdToIdr = null`. The only numeric prices anywhere in the codebase are
the **client-side estimates** in `src/services/aiProviderRegistry.ts`, whose own
header admits: *"Prices below are operational estimates — refresh via
updateModelPricing(), never treat as permanent."*

## 2. Summary counts

44 inventory rows (distinct route + model-ID pairs as referenced in `api/`, `src/`,
and `server/`):

| Status | Count | Meaning |
|---|---:|---|
| Verified official — route EZRAB pays directly | 6 | The price is EZRAB's actual rate basis (one row carries a flagged billing-route assumption) |
| Verified official — underlying model's list price; **EZRAB route cost Unknown** | 15 | An official price exists, but EZRAB buys through an unpublished-tariff gateway |
| Unverified estimate | 10 | A figure exists only in EZRAB's client registry; no official source confirms it |
| Unknown | 11 | No official price retrieved; includes gateway SKUs, legacy defaults, local models, and the per-search API |
| Zero provider cost by construction | 2 | EZRAB's internal deterministic provider and the mock provider |
| **Total** | **44** | |

**Headline:** 21 of 44 rows have an officially verified price *somewhere*, but only
**6** are prices for a route EZRAB actually pays directly — and the gateway chains
that carry most production traffic (companion document, §2.4) are priced on **zero**
of their routes. Tariff readiness for cost-based settlement is therefore **not
ready**, which is consistent with — and independently confirms — the Phase 1 decision
to keep all registry prices `null` rather than fill them with estimates.

---

## 3. Model inventory

All prices are **USD per 1M tokens** (input / cached input / output), Paid/Standard
tier unless noted, retrieved **2026-11-10**. "—" means the official source does not
offer that component or it was not captured. Registry estimates, where they exist,
are noted in the Status column as codebase figures — **not** official prices.

### 3.1 Google Gemini — called directly (native API and OpenAI-compatible endpoint)

Official source for all rows: Gemini Developer API pricing,
`https://aistudio.google.com/docs/pricing` (official pricing page, retrieved 2026-11-10).

| # | Model ID (as referenced) | Referenced in | Input | Cached | Output | Status |
|---|---|---|---:|---:|---:|---|
| 1 | `gemini-3.5-flash-lite` | `aiGateway.js` (`FAST_MODEL`), tariff registries, `server/config/aiConfig.ts` | 0.30 | 0.03 (+ $1.00/1M/hr cache storage) | 2.50 | **Verified official** — direct route |
| 2 | `gemini-3.8-flash` | `aiGateway.js` (`GEMINI_OAI_MODEL`, via Google's OpenAI-compatible endpoint) | 0.75 → **1.50 from 2027-01-01** | 0.075 → 0.15 | 3.75 → **7.50 from 2027-01-01** | **Verified official** — with a flagged assumption: EZRAB reaches this model through Google's own OpenAI-compatible endpoint, so native Gemini billing is assumed, not confirmed from an invoice |
| 3 | `gemini-2.5-flash` | Client registry; server config | 0.30 (audio input 1.00) | 0.03 | 2.50 | **Verified official** — model marked **deprecated** on the official page: from 2026-12-01 requests auto-route to `gemini-3.5-flash-lite` and bill at Flash-Lite rates |
| 4 | `gemini-2.5-pro` | Client registry; routing roles in server config | 1.25 (prompts ≤200k) / 2.50 (>200k) | 0.125 / 0.25 | 10.00 / 15.00 | **Verified official** — also **deprecated**: from 2026-12-01 requests auto-route to `gemini-3.8-flash` at 3.8 Flash rates |
| 5 | `gemini-2.0-flash` | `server/config/aiConfig.ts:159` (legacy default) | — | — | — | **Unknown** — not confirmed on the retrieved official page; historical/legacy reference only |
| 6 | `gemini-1.5-pro` | `server/config/aiConfig.ts:160, 238` (legacy defaults) | — | — | — | **Unknown** — same as above |

### 3.2 ZyRouter / zrouter gateway (`api.zyrouter.com`)

No official per-model tariff for this gateway was retrievable. Underlying list prices
below are official; **EZRAB's cost on this route is Unknown** for every row.

| # | Model ID | Referenced in | Underlying official price (in / cached / out) | Official source | Status |
|---|---|---|---|---|---|
| 7 | `geminiflash-3.8` | `aiGateway.js` (`ADVANCED_MODEL`), tariff registries, `aiModelRegistry.ts` | — (gateway SKU; underlying model identity not officially documented) | — | **Unknown** |
| 8 | `gpt-6-luna` | Client registry; `server/config/aiConfig.ts` (zyrouter/zrouter defaults) | 0.10 / 0.01 / 0.50 | OpenAI, §3.5 source | Verified official (underlying) / route Unknown. Registry estimate (0.50 / 2.00) overstates the list price ~5×/4× |
| 9 | `claude-haiku-4-5` | Client registry | 1.00 / 0.10 (cache read) / 5.00 | Anthropic, §3.6 source | Verified official (underlying) / route Unknown. Registry estimate 0.80 / 4.00 |
| 10 | `claude-sonnet-5` | Client registry | 2.00 / 0.20 (cache read) / 10.00 | Anthropic, §3.6 source | Verified official (underlying, **partially derived**: the page's model table gives cache-read 0.20 and Batch 1.00 / 5.00, and states Batch = 50% discount, so Standard = 2.00 / 10.00 by the page's own rule; the Standard input/output cells did not extract cleanly) / route Unknown. Registry estimate 3.00 / 15.00 |
| 11 | `claude-opus-5` | Client registry | 5.00 / 0.50 (cache read) / 25.00 | Anthropic, §3.6 source | Verified official (underlying) / route Unknown. Registry estimate (15.00 / 75.00) overstates 3× |
| 12 | `gpt-5.6-luna` | Client registry | — | — | **Unverified estimate** (registry 0.50 / 2.00; not captured on the retrieved OpenAI page) |
| 13 | `gpt-5.6-terra` | Client registry | — | — | **Unverified estimate** (registry 1.00 / 4.00) |
| 14 | `gpt-5.6-sol` | Client registry | 4.00 / 0.40 / 20.00 (promotional until 2026-11-30) | OpenAI, §3.5 source | Verified official (underlying) / route Unknown. Registry estimate (1.50 / 6.00) understates |
| 15 | `gpt-5.5` | Client registry | — | — | **Unverified estimate** (registry 2.00 / 8.00; not captured in this pass) |
| 16 | `gpt-6-astra` | Client registry; server config "frontier" default | 10.00 / 1.00 / 50.00 | OpenAI, §3.5 source | Verified official (underlying) / route Unknown. Registry estimate (5.00 / 25.00) understates 2× |

### 3.3 Crown gateway (`crown.ai.id`)

No official per-model tariff for this gateway was retrievable. Crown is now the
**head of the chat/advanced/fast chains** (see §5), which makes this gap the most
consequential one in the inventory.

| # | Model ID | Referenced in | Price evidence | Status |
|---|---|---|---|---|
| 17 | `MiniMaxAI/MiniMax-M2.7` | `aiGateway.js` (`CROWN_CHAT_MODEL`); `api/ai/multi-provider/providers.js` | MiniMax's current official price list (`https://platform.minimax.io/docs/pricing/overview`, retrieved 2026-11-10) lists only MiniMax-M3.1-Flash and MiniMax-M3 — **M2.7 does not appear** | **Unknown** (not on the current official price list; Crown's own tariff unpublished) |
| 18 | `deepseek-ai/DeepSeek-V4-Flash-0731` | `aiGateway.js` (`CROWN_CHAT_FALLBACK_MODEL`, `DAHL_MODEL` — Crown and Dahl routes) | Underlying: DeepSeek official `deepseek-flash` (= V4.1-Flash-1017): cache-hit input 0.003 off-peak / 0.006 peak; cache-miss input 0.15 / 0.30; output 0.60 / 1.20 — `https://api-docs.deepseek.com/quick_start/pricing/`, retrieved 2026-11-10 | Verified official (underlying) / route Unknown (gateway SKU, never called at `api.deepseek.com`) |

### 3.4 AtmoRouter gateway (`atmorouter.dev`)

No official per-model tariff retrievable for any Atmo SKU.

| # | Model ID | Referenced in | Price evidence | Status |
|---|---|---|---|---|
| 19 | `atmo/deepseek-v4.1-flash` | `aiGateway.js` (`ATMO_CHAT_MODEL`) | Underlying DeepSeek `deepseek-flash` list price as row 18 | Verified official (underlying) / route Unknown |
| 20 | `ali/deepseek-v4.1-flash` | `aiGateway.js` (`ATMO_CHAT_FALLBACK_MODEL`); also a VLEEE registry SKU | Underlying as row 18. Registry estimate 0.14 / 0.28 | Verified official (underlying) / route Unknown |
| 21 | `ag/gemini-3.8-flash-high` | `aiGateway.js` (`ATMO_ADVANCED_MODEL`, also the Atmo vision model); VLEEE registry SKU | Gateway SKU; "-high" variant has no native Google equivalent on the official pricing page | **Unknown** |
| 22 | `cx/gpt-6-luna` | `aiGateway.js` (`ATMO_ADVANCED_FALLBACK_MODEL`) | Underlying `gpt-6-luna` as row 8 | Verified official (underlying) / route Unknown |

### 3.5 River gateway (`api.river.ai`) and OpenAI direct references

OpenAI official source: `https://developers.openai.com/api/docs/pricing` (retrieved
2026-11-10; the retrieved portion covered the flagship and several specialty
sections — models not present in that portion are marked not captured rather than
guessed).

| # | Model ID | Referenced in | Price evidence | Status |
|---|---|---|---|---|
| 23 | `deepseek-ai/DeepSeek-V4.1-Flash` | `aiGateway.js` (`RIVER_VISION_MODEL`); `aiModelRegistry.ts` defaults for `DED_AI_FAST` and `DOKUMEN_AI` | Underlying DeepSeek `deepseek-flash` list price as row 18 | Verified official (underlying) / route Unknown |
| 24 | `nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4` | `aiGateway.js` (`RIVER_TEXT_MODEL`); `aiModelRegistry.ts` default for `EZRAB_AI` | No official per-token price exists: NVIDIA distributes Nemotron via free prototyping endpoints / per-GPU AI Enterprise licensing; partner endpoints set their own rates | **Unknown** |
| 25 | `gpt-4o` | `server/providers/openaiProvider.ts` default; `server/.../modelRouter.ts` fallback | Not in the retrieved portion of the official OpenAI page | **Unknown** (in this pass) |
| 26 | `gpt-5.4-mini` | `server/config/aiConfig.ts:236` ("cheap" default) | Not captured from an official page in this pass | **Unknown** |

### 3.6 Atria gateway (`api.atria-asi.ai`) and Anthropic direct references

Anthropic official source: `https://platform.claude.com/docs/en/about-claude/pricing`
(retrieved 2026-11-10; USD per MTok; cache-read is the last pricing column).

| # | Model ID | Referenced in | Price evidence | Status |
|---|---|---|---|---|
| 27 | `Atria-Dawn-Preview` | `aiGateway.js` (`ATRIA_MODEL`); both tariff registries (price `null`, UNKNOWN) | No public official price list for Atria was found. Client registry carries an estimate (0.15 / 0.60) | **Unverified estimate** (server registries correctly keep it `null`/UNKNOWN) |

### 3.7 Inception — called directly on the server path

Official source: `https://docs.inceptionlabs.ai/get-started/models` (retrieved
2026-11-10; page updated 2026-10-21).

| # | Model ID | Referenced in | Input | Cached | Output | Status |
|---|---|---|---:|---:|---:|---|
| 28 | `mercury-2` | Client registry; server adapters | 0.25 | 0.025 | 0.75 | **Verified official** — registry output estimate (1.00) overstates the official 0.75 |
| 29 | `mercury-2.5` | Client registry; `server/config/aiConfig.ts` ("balanced" default) | 0.20 | 0.02 | 0.75 | **Verified official** — registry estimate (0.50 / 2.50) overstates the official price ~2.5×/3.3×; see §4. Per Inception's docs, Mercury 2 / 2.5 are closed to new users, with existing access until 2026-11-15 — a continuity risk for the server path, independent of price |

### 3.8 VLEEE gateway (`api.vleee.net`) SKUs (client registry + server default)

No official per-model tariff retrievable for this gateway; all rows are its SKUs.

| # | Model ID | Referenced in | Price evidence | Status |
|---|---|---|---|---|
| 30 | `ali/qwen3.8-omni-flash` | Client registry | Registry estimate 0.15 / 0.60; Alibaba's official Model Studio pricing for these inference SKUs was not retrieved (search surfaced training/deployment billing only) | **Unverified estimate** |
| 31 | `ag/gemini-3.7-flash-high` | Client registry | Registry estimate 0.15 / 0.60; no native Google model of this ID appears on the official pricing page | **Unverified estimate** |
| 32 | `ali/qwen3.8-flash` | Client registry | Registry estimate 0.10 / 0.40 | **Unverified estimate** |
| 33 | `ali/kimi-k2.7-code` | Client registry | Registry estimate 0.30 / 1.20; Moonshot official pricing not retrieved; gateway SKU regardless | **Unverified estimate** |
| 34 | `ali/deepseek-v4-flash-0731` | Client registry | Registry estimate 0.14 / 0.28; underlying DeepSeek list price as row 18 | Verified official (underlying) / route Unknown |
| 35 | `ag/gemini-pro-agent` | Client registry | Registry estimate 1.25 / 5.00; no native equivalent verified | **Unverified estimate** |
| 36 | `ag/claude-sonnet-4-6` | Client registry | Underlying `claude-sonnet-4-6`: 3.00 / 0.30 (cache read) / 15.00 (Anthropic, §3.6) | Verified official (underlying) / route Unknown. Registry estimate (3.00 / 15.00) happens to match the underlying list price — coincidence, not verification of the route |
| 37 | `ag/claude-opus-4-6-thinking` | Client registry | Underlying `claude-opus-4-6`: 5.00 / 0.50 (cache read) / 25.00 (Anthropic, §3.6); the "-thinking" SKU suffix is not a distinct Anthropic price | Verified official (underlying) / route Unknown |
| 38 | `cb/gpt-5.5` | Client registry | Registry estimate 3.00 / 12.00; underlying `gpt-5.5` not captured in this pass | **Unverified estimate** |
| 39 | `cbcn/deepseek-v4.1-flash` | `server/config/aiConfig.ts:225` (external default) | Underlying DeepSeek list price as row 18 | Verified official (underlying) / route Unknown |

### 3.9 Local / self-hosted and internal providers

| # | Model / provider | Referenced in | Status |
|---|---|---|---|
| 40 | `hermes-3-llama-3.1-8b` (local, Ollama-style) | `server/config/aiConfig.ts`; `server/providers/localAIProvider.ts`, `hermesProvider.ts` | **Unknown** as a tariff — self-hosted inference has infrastructure cost only, no per-token price; any cost accounting needs an infra-cost decision, not a tariff |
| 41 | `qwen3:8b` (Ollama local default) | `server/config/aiConfig.ts:137` | **Unknown** — same as row 40 |
| 42 | `ezrab-core-deterministic-v1` / `ezrab-deterministic-v1` (EZRAB Core) | `server/providers/ezrabCoreProvider.ts`; client registry (`ezrab_core`) | **Zero provider cost by construction** — deterministic local computation; correctly priced 0 in the registry |
| 43 | `mock-deterministic` (mock provider) | `server/providers/mockProvider.ts` | **Zero provider cost by construction** — test double |

### 3.10 Non-token paid API

| # | Service | Referenced in | Status |
|---|---|---|---|
| 44 | Serper (Google Search API) — billed **per search credit**, prepaid packs, not per token | `api/market/search.js`; `api/_lib/marketSearch/serperProvider.js` | **Unknown** — Serper's official pricing page was not retrieved in this audit (the official homepage fetch returned no pricing section, and third-party summaries of its per-1,000-search pack prices were deliberately **not** copied as verified). Needs its own non-token cost-evidence type (companion document, row 38) |


---

## 4. Where the codebase's own estimates disagree with official prices

`src/services/aiProviderRegistry.ts` is used for Node-path cost routing
(`aiCostRouter`) and client-side cost display. Where this audit could compare its
estimates against an official page, the estimates were wrong in **both directions** —
which is worse than a consistent bias, because no correction factor can fix them:

| Model | Registry estimate (in / out, USD per 1M) | Official (in / out) | Direction |
|---|---|---|---|
| `mercury-2.5` (Inception) | 0.50 / 2.50 | **0.20 / 0.75** | Overstates ~2.5× / ~3.3× |
| `mercury-2` (Inception) | 0.25 / 1.00 | **0.25 / 0.75** | Output overstates |
| `gpt-6-luna` (OpenAI list) | 0.50 / 2.00 | **0.10 / 0.50** | Overstates ~5× / 4× |
| `claude-opus-5` (Anthropic list) | 15.00 / 75.00 | **5.00 / 25.00** | Overstates 3× |
| `gemini-3.5-flash-lite` (Google) | 0.0375 / 0.15 | **0.30 / 2.50** | **Understates ~8× / ~17×** — the highest-risk error in the registry, because this is the gateway's fast-chain Gemini model and the registry figure would make its cost look negligible |
| `gpt-6-astra` (OpenAI list) | 5.00 / 25.00 | **10.00 / 50.00** | Understates 2× |
| `gpt-5.6-sol` (OpenAI list) | 1.50 / 6.00 | **4.00 / 20.00** (promo to 2026-11-30) | Understates |
| `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.8-flash` (Google) | 0.30 / 2.50; 1.25 / 10.00; 0.50 / 3.00 | 0.30 / 2.50; 1.25 / 10.00; 0.75→1.50 / 3.75→7.50 | Input/output coincide for the first two (cached prices absent from the registry entirely); 3.8 Flash's registry output (3.00) matches neither the current (3.75) nor the announced (7.50) official output price |

Two structural observations:

- **No cached-input prices exist anywhere in the client registry** (the field is
  absent), although every verified official page prices cached input separately and
  the v1.1 metering policy weights cached tokens (×1). Any cost model built on the
  registry silently treats cached input as full-price input or as free, depending on
  the code path.
- The registry's own header already disclaims these figures ("operational estimates
  … never treat as permanent"). This audit confirms the disclaimer is warranted and
  recommends the figures be treated as **display-only placeholders** until replaced
  by sourced tariffs under an owner grant. No figure was changed in this phase.

## 5. Routing-change verdict (vs. the Phase 1 audit)

**Verdict: YES — model routing changed since the Phase 1 audit's description**
(Phase 1 report §2.5), in two material ways, both visible in `api/_lib/aiGateway.js`:

1. **Crown was inserted at the head of the chains.** Phase 1 §2.5 described the chat
   path as headed by Gemini `gemini-3.5-flash-lite` with a tail of
   Atmo/ZyRouter/River. The current gateway (comments dated 2026-10-25, owner order)
   attempts **Crown first** — `MiniMaxAI/MiniMax-M2.7`, then Crown's
   `deepseek-ai/DeepSeek-V4-Flash-0731` — for the chat, advanced, and fast chains
   whenever no image/PDF is attached (Crown is skipped for media because it does not
   support vision). Gemini native now runs *after* the Crown pair.
2. **The fast chain gained the full chat tail** (comment dated 2026-10-27): after
   ZyRouter it now continues to Dahl → River vision → River text → Gemini-OAI →
   Atria, matching the chat chain's tail instead of ending early.

What did **not** change: the `productId` → mode mapping in
`api/ai/tools/execute.js` (server-side model determination), the vision chain's
overall shape (Gemini native → River vision → Atmo vision → ZyRouter), and the
client registry's role — `src/ai-tools/aiModelRegistry.ts` still describes the older
river/zyrouter targets and remains **non-authoritative** for the browser path. The
status surface also did not keep up: `api/ai/engine-status.js` still labels every
mode `gemini-3.5-flash-lite (Gemini)`.

**Billing consequence:** the head of the production chains is now a gateway (Crown)
whose tariff is unpublished and whose head model (row 17) does not appear on its
maker's current official price list. The share of production traffic with an
unknowable unit cost therefore **increased** since Phase 1, even though the set of
models with verified *underlying* list prices also grew.

## 6. Margin statement (explicit)

**No measured gross margin can be claimed for EZRAB's AI features at this time.**

The reasons are conjunctive — any one of them would suffice:

1. **Route tariffs are unknown.** 15 of 44 inventory rows are billed through gateways
   with no published per-model tariff, including the head of the production chains;
   11 rows are fully Unknown and 10 rest on unverified codebase estimates.
2. **Usage evidence is not persisted.** The gateway meter runs with a `null` adapter
   (companion document, §2.4), so EZRAB has no server-side record of actual tokens
   consumed per operation to divide revenue by, even where a price exists.
3. **The commercial parameters are null by design.** The margin formula in
   `api/_lib/pricingPolicy.js` remains `PENDING_OWNER_DECISION` with
   `creditValueIdr`, `costMultiplierMilli`, `targetGrossMarginBps`, and
   `fxIdrPerUsd` all `null`; `evaluateMarginPrice` returns `PENDING_CONFIGURATION`
   and never a number. `providerTariffs.js` likewise keeps `DEFAULT_FX.usdToIdr = null`.
4. **Revenue per operation is not yet real.** All charging users experience is the
   localStorage simulation; there is no activated billing from which realized revenue
   could be measured.

Any margin figure produced today would be an estimate built on estimates. The
correct statement is the one above; a measured margin becomes claimable only after
(a) gateway tariffs are obtained from the gateways themselves (contract/invoice, not
a web page), (b) usage evidence is persisted per operation, and (c) the owner sets
the four commercial parameters.

## 7. Risks and observations

- **Hardcoded credential-shaped fallback (existence only).** The external-provider
  configuration block in `server/config/aiConfig.ts` (~line 224) contains a
  hardcoded fallback value shaped like an API key, used when the environment
  variable is unset. The value is **not** reproduced here. Recommendation, for a
  separate owner-granted task: remove the fallback, and rotate the credential at the
  provider if it was ever live. This audit changed nothing.
- **Deprecation cliffs change the cost basis automatically.** Google's official page
  states that from 2026-12-01, `gemini-2.5-flash` requests bill at
  `gemini-3.5-flash-lite` rates and `gemini-2.5-pro` requests bill at
  `gemini-3.8-flash` rates; `gemini-3.8-flash` itself steps up (input 0.75 → 1.50,
  output 3.75 → 7.50) on 2027-01-01. Any tariff table adopted before those dates
  must carry effective dates, or it will silently go stale.
- **Promotional pricing.** `gpt-5.6-sol`'s verified OpenAI price is promotional
  until 2026-11-30; the post-promo price was not captured in this pass and must not
  be assumed to be the promo price.
- **Time-of-day pricing.** DeepSeek's official prices halve off-peak (peak windows
  01:00–04:00 and 06:00–10:00 UTC, Mon–Fri excl. Chinese holidays). Even on a direct
  route, a single static tariff row would misprice by 2× half the day; gateway
  pass-through of this structure is unknown.
- **Mercury continuity.** Inception's docs close Mercury 2 / 2.5 to new users with
  existing access until 2026-11-15 (§3.7). The server path's "balanced" default
  (`mercury-2.5`) may stop working on that date regardless of price.
- **Tariff registry normalization gap.** `tariffRegistry.normalizeProviderUsage`
  implements only `gemini` and `generic` usage adapters; responses from the other
  gateways normalize to all-null tokens. Even after tariffs are sourced, usage
  evidence for those routes will land operations in `REQUIRES_REVIEW` until per-
  provider usage adapters exist (companion document, §5.2).

## 8. What "tariff ready" would require (checklist, no action taken)

1. Written per-model tariffs (or invoice history) from each gateway actually used —
   Crown, AtmoRouter, ZyRouter, River, Dahl, Atria, VLEEE — since no official public
   page publishes them.
2. Confirmation of the billing route for `gemini-3.8-flash` via Google's
   OpenAI-compatible endpoint (row 2's flagged assumption).
3. Effective-dated entries for the Google deprecation/price-step dates
   (2026-12-01, 2027-01-01) and the end of the `gpt-5.6-sol` promotion (2026-11-30).
4. An owner-set `fxIdrPerUsd` and the remaining margin-formula parameters — until
   then, USD tariffs cannot be converted into credit economics, and no FX rate has
   been invented for this document.
5. Serper's official per-search pricing, retrieved from Serper directly, plus the
   non-token cost-evidence decision (companion document, row 38).
6. Replacement of the client registry's estimates with sourced values, or its formal
   demotion to display-only, so `aiCostRouter` never routes on guessed costs.

## 9. Fence confirmation

This audit and its companion design document were the only artifacts produced.
Verified by `git status` at completion: the only new files are the two documents;
the pre-existing dirty tree is unchanged. No commit, push, merge, deploy, SQL
execution, environment/Supabase change, `middleware.ts` edit, `AUTH_ENABLED` change,
or billing/Midtrans activation occurred. No price, tariff, credit value, margin, or
FX rate was invented: every number in §3 was read on the cited official page on
2026-11-10, and every codebase figure is labeled an unverified estimate with its
source file named.
