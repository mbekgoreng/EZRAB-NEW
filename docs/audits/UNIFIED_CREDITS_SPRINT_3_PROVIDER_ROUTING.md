# UNIFIED CREDITS — SPRINT 3 PROVIDER ROUTING & TARIFF INTEGRITY

Status key: **VERIFIED FACT** · **NOT RUNTIME VERIFIED** · **PENDING OWNER DECISION**.
Date: 2026-11-10 · HEAD `99de892` (unchanged). This audit changed **zero** files.

## 1. Headline result

**Delta vs Phase 2: NIL for routing and tariffs.** All routing-relevant files are
byte-identical to HEAD (`aiGateway.js`, `aiProviderRegistry.ts`,
`api/ai/tools/execute.js`, `tariffRegistry.js`). The Phase 2 counts stand:
44 route/model rows = **6 verified paid-direct, 15 verified list price with UNKNOWN
EZRAB route cost, 10 unverified estimates, 11 unknown, 2 zero by construction.**
No margin was calculated (forbidden and impossible: gateway tariffs unpublished,
usage not persisted, margin parameters `null`).

## 2. Product → chain mapping (VERIFIED FACT)

`api/ai/tools/execute.js:22-24` (`productIdToMode`), unchanged:

| productId | Gateway mode |
|---|---|
| `EZRAB_AI` (Chat AI / Co-Assistant) | `chat` (default) / `advanced` (deep mode) |
| `DED_AI_DETAIL` | `advanced` |
| `DED_AI_FAST`, `DOKUMEN_AI`, others | `fast` |
| Media attached (image/PDF) | `vision` |

The second transport, `POST /api/ai/multi-provider/execute`, is a thin wrapper over
the same `handleAiRequest` — same chains, no productId mapping. No other active
provider path exists under `api/`. Crown is skipped entirely when an image/PDF is
attached (no vision support, `aiGateway.js:449-452`). Chain limits: max 2 attempts
per provider after failure, 100 s chain budget, 55 s per-attempt timeout.

## 3. Active chains (VERIFIED FACT — `api/_lib/aiGateway.js:449-516`)

- **chat** (no media): Crown `MiniMaxAI/MiniMax-M2.7` → Crown
  `deepseek-ai/DeepSeek-V4-Flash-0731` → Gemini native `gemini-3.5-flash-lite` →
  AtmoRouter `ag/gemini-3.8-flash-high` → AtmoRouter `cx/gpt-6-luna` → ZyRouter
  `geminiflash-3.8` → Dahl `deepseek-ai/DeepSeek-V4-Flash-0731` → River
  `deepseek-ai/DeepSeek-V4.1-Flash` → River
  `nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4` → Gemini-OAI
  `gemini-3.8-flash` → Atria `Atria-Dawn-Preview` (first key only).
- **advanced**: Crown pair → Gemini native → Atmo advanced pair → ZyRouter (stops;
  no Dahl/River/Atria tail).
- **fast**: Crown pair → Gemini native → River vision → Atmo
  `atmo/deepseek-v4.1-flash` → Atmo `ali/deepseek-v4.1-flash` → ZyRouter → Dahl →
  River vision (again) → River text → Gemini-OAI → Atria.
- **vision**: Gemini native → River vision (images only) → Atmo vision
  (`ag/gemini-3.8-flash-high`) → ZyRouter; PDFs require Gemini (explicit error when
  no Gemini key exists).

## 4. Tariff table (USD per 1M tokens: input / cached-input / output)

Sources: official provider pages as captured in Phase 2 §3 (2026-11-10); MiniMax
re-fetched from the official pricing page this sprint (see §5.3).

| Model / route | Actual billing entity | Official list tariff | EZRAB route-cost status |
|---|---|---|---|
| `gemini-3.5-flash-lite` — Gemini native, direct | Google (EZRAB's own key) | 0.30 / 0.03 (+ $1.00/1M/h cache storage) / 2.50 | **Verified — paid direct** |
| `gemini-3.8-flash` — Google OpenAI-compatible endpoint | Google (native billing assumed — not invoice-confirmed) | 0.75→1.50 (2027-01-01) / 0.075→0.15 / 3.75→7.50 | Verified, route assumption flagged |
| `mercury-2` / `mercury-2.5` — Inception direct, **`server/` path only** (not in `aiGateway` chains) | Inception | 0.25/0.025/0.75 ; 0.20/0.02/0.75 | Verified — paid direct (dormant path) |
| `gemini-2.5-flash` / `gemini-2.5-pro` — client registry + `server/` config only | Google | 0.30/0.03/2.50 ; 1.25–2.50/0.125–0.25/10–15 | Verified but **deprecated** (auto-route per 2026-12-01); not in active chains |
| `MiniMaxAI/MiniMax-M2.7` — **Crown** (head of chat/advanced/fast) | Crown (`crown.ai.id`) | **Absent from MiniMax's current official price list** (§5.3) | **UNKNOWN** — Crown tariffs unpublished |
| `deepseek-ai/DeepSeek-V4-Flash-0731` — Crown & Dahl | Crown / Dahl | DeepSeek list `deepseek-flash`: miss 0.15–0.30 / hit 0.003–0.006 / out 0.60–1.20 (peak/off-peak) | List verified; **route cost UNKNOWN** |
| `atmo/deepseek-v4.1-flash`, `ali/deepseek-v4.1-flash` — AtmoRouter | AtmoRouter | DeepSeek list as above | **Route cost UNKNOWN** |
| `ag/gemini-3.8-flash-high` — AtmoRouter (advanced + vision) | AtmoRouter | Gateway SKU; no native counterpart on Google's page | **UNKNOWN (full)** |
| `cx/gpt-6-luna` — AtmoRouter | AtmoRouter | OpenAI list `gpt-6-luna`: 0.10/0.01/0.50 | List verified; **route cost UNKNOWN** |
| `geminiflash-3.8` — ZyRouter | ZyRouter | Gateway SKU; model identity not officially documented | **UNKNOWN (full)** |
| `deepseek-ai/DeepSeek-V4.1-Flash` — River | River | DeepSeek list as above | **Route cost UNKNOWN** |
| `nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4` — River | River | No official per-token NVIDIA price | **UNKNOWN (full)** |
| `Atria-Dawn-Preview` — Atria (last tail) | Atria | No public price list | **UNKNOWN** (client-registry estimate 0.15/0.60 unverified) |
| Serper (market search, `api/market/search.js`) — per search, not per token | Serper | Official page not retrievable in Phase 2 | **UNKNOWN**. Note: a code comment in `api/_lib/marketSearch/serperProvider.js:13` claims "2,500 free queries, then $1/1,000 (Serper, as of 2026)" — an **unverified in-code claim**; do not cite it as a tariff |
| Local models `qwen3:8b`, `hermes-3-llama-3.1-8b`; internal `ezrab-deterministic-v1`; mock | Self-hosted / internal | — | Infrastructure cost only (UNKNOWN as a tariff) / zero by construction |

The server tariff registry remains correctly pessimistic: `tariffRegistry.js` +
`providerTariffs.js` seed only 3 models (`gemini-3.5-flash-lite`,
`geminiflash-3.8`, `Atria-Dawn-Preview`), all prices `null`, `configured: false`,
`source: null`, `DEFAULT_FX.usdToIdr = null`. The gateway meter is still a no-op
(`aiGateway.js:764-765`, `createUsageMeter(null)`).

## 5. The four Phase 2 claims re-verified

1. **Crown's position: UNCHANGED — head of chain.** Owner comment dated 2026-10-25
   (`aiGateway.js:50-57`); `crownTextAttempts` pushed first in chat (`:479`),
   advanced (`:470`), and fast (`:503`). Consequence stands: the head of the
   production chain is a gateway with unpublished tariffs.
2. **Client registry deviation ≈17×: CONFIRMED, exact figures unchanged.**
   `src/services/aiProviderRegistry.ts` is unchanged vs HEAD. Worst case remains
   `gemini-3.5-flash-lite`: registry **0.0375 / 0.15** vs official **0.30 / 2.50**
   = underestimates of **8× / ≈16.7×**. Deviations in both directions persist:
   `mercury-2.5` 0.50/2.50 vs 0.20/0.75 (≈2.5×/3.3× over); `gpt-6-luna` 0.50/2.00
   vs 0.10/0.50 (≈5×/4× over); `claude-opus-5` 15/75 vs 5/25 (3× over);
   `gpt-6-astra` 5/25 vs 10/50 (2× under); `gemini-3.8-flash` registry output 3.00
   matches neither official 3.75 nor 7.50.
3. **MiniMax-M2.7 on MiniMax's current official price list: STILL ABSENT.**
   Re-fetched `https://platform.minimax.io/docs/pricing/overview` (official;
   crawled 2026-11-09 23:02 UTC): the LLM section lists only `MiniMax-M3.1-Flash`
   ($0.15 / cache-read $0.015 / $0.60) and `MiniMax-M3` (≤512k: $0.30/$0.06/$1.20
   Standard; >512k: $0.60/$0.12/$2.40; Priority 1.5×). M2.7 is not listed → the
   Phase 2 "Unknown" classification is confirmed. *(Unverified signal, explicitly
   not used as fact: third-party summaries describe M2.7 as deprecated/retired —
   not an official source. Worth an owner confirmation to MiniMax/Crown as a
   head-of-chain continuity risk.)*
4. **Cached-input prices in the client registry: STILL ENTIRELY ABSENT.** The
   client model type has only `inputCostPerMillion`/`outputCostPerMillion`; grep
   for `cached` in `aiProviderRegistry.ts`/`aiModelRegistry.ts` = 0 hits. The
   server registry has a `cachedInputPer1M` field, always `null`.

Additional drift note: `api/ai/engine-status.js:40` still labels every mode
`gemini-3.5-flash-lite (Gemini)`, and its `providers` object does not even include
Crown/Atmo — the status surface lags the real chain further behind. The client
`aiModelRegistry.ts` remains non-authoritative (stale River/ZyRouter defaults).

## 6. Explicit UNKNOWN list

Crown tariffs (both models) · AtmoRouter tariffs (all SKUs) · ZyRouter tariff ·
River tariffs (both models) · Dahl tariff · Atria tariff · VLEEE tariffs (all
registry SKUs) · `gemini-2.0-flash`, `gemini-1.5-pro`, `gpt-4o`, `gpt-5.4-mini` ·
Serper per-search price · local-model infrastructure cost · `usdToIdr` FX rate ·
all margin-formula parameters (`creditValueIdr`, `costMultiplierMilli`,
`targetGrossMarginBps`, `fxIdrPerUsd` remain `null` by owner lock).

**PENDING OWNER DECISION / PENDING PROVIDER VERIFICATION:** no route cost may be
replaced by an estimate; v1.1 interim metering remains in force; no gross margin
may be claimed until route costs are verified and the owner approves the margin
parameters.
