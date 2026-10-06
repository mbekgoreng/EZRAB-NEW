# EZRAB DED→RAB Vision Modes Verification v1

Date: 2026-09-30

## Scope

Unified FAST/ADVANCED DED Vision behavior:

```text
DED → Vision reading → evidence → canonical work → specification → QTO
    → AHSP → EZRAB components/resources → price engine → SafeDecimal → RAB
```

FAST and ADVANCED use different reading depth/model selection but the same downstream deterministic pipeline.

## Implemented changes

### Model selection

`src/ded-rab-v2/config/dedModeConfig.ts`

- FAST: `gemini-3.5-flash-lite`, display label `Gemini 3.5 Flash Lite`.
- ADVANCED: `gemini-3.8-flash`, display label `Gemini Flash 3.8`.
- Provider/model selection is explicit and mode is not silently changed.
- Both configs retain the same deterministic price/QTO downstream contract.

### Shared output and diagnostics

`src/ded-rab-v2/types.ts`

- Added shared `DedVisionOutputContract` shape for page extraction.
- Existing `RawPageAnalysisPass2` remains the shared intermediate contract.

`src/ded-rab-v2/pipeline/dedRabPipeline.ts`

- Pipeline output now includes `modelLabel`, `sourceHash`, `resultHash`, and `executedAt`.
- Both modes still use the same interpreter, canonical grouping, QTO, AHSP matcher, price resolver, validation gate, and spreadsheet sync.

### No-synthetic fallback

`src/ded-rab-v2/ai/dedVisionReader.ts`

- Text fallback parses only explicitly labelled dimensions.
- Removed synthetic width/height defaults from fallback candidates.
- Removed image-presence-only synthetic work creation.
- Nominal pipe diameter is not treated as length/quantity.

### Cache invalidation

`src/ded-rab-v2/ai/dedPageCache.ts`

- Prompt/cache version bumped to `v3.0.0-unified-ded-vision-no-synthetic-fallback`.

### Sample fixture execution

`src/ded-rab-v2/ingestion/documentIngestionService.ts`

- Added a text-fixture ingestion seam that preserves native text and routes it through the same Vision reader/interpreter/downstream pipeline.
- This avoids mislabelling UI sample text as a binary PDF.

## Verification results

### PASS

- `npx tsx src/test/ded3ModePipeline.test.ts`: **8/8 PASS**.
- `npm run test:ded-rab`: **PASS** — 20/20, 24/24, 15/15, canonical A–G PASS.
- `npm run test:core-ai`: **70/70 PASS**.
- `npm run test:phaseC`: **71/71 PASS**.
- `npm run build`: **PASS** — TypeScript stage completed and Vite completed (`built in 56.98s`).
- `npx tsx src/test/dedRabCanonicalEvidenceRegression.test.ts`: **A–G PASS**.

The standalone background `npx tsc --noEmit` wrapper did not emit its exit marker before the shell session detached. The production `npm run build` command executes `tsc && vite build` and reached Vite successfully, which proves the TypeScript stage passed in the build.

### Live provider limitation

The Vision integration test attempted FAST provider execution and received:

```text
HTTP 401 on zyrouter
No API key configured for provider 'zyrouter'
```

Therefore external Gemini execution is **NOT LIVE-VERIFIED** in this environment. The test still verified fail-closed handling and no-synthetic fallback behavior. No fake provider response, quantity, AHSP, coefficient, or price was injected.

### Localhost limitation

`http://localhost:3000` is served by the existing Vite dev server. The route loads, but a fresh end-to-end external AI run cannot be considered verified while the configured provider returns 401. The earlier live browser run showed the application shell with zero rendered DED items after the invalid sample path; the sample ingestion path and cache version have since been corrected, but fresh live AI output requires valid provider credentials/configuration.

## Price-source finding

The canonical matcher can produce `A.3.2.1.2` for Pondasi Batu Kali, but the current official runtime catalog does not contain that exact code in `getAHSPDatabase()`/`ALL_OFFICIAL_AHSP_ITEMS`; the resolver correctly returns `PRICE_NOT_FOUND`. This is intentionally fail-closed and was not replaced with a fabricated price. A valid authoritative AHSP/resource record must be present before a live unit price can be claimed.

## Final status

**CODE / CONTRACT / REGRESSION / BUILD: PASS**

**LIVE EXTERNAL MODEL EXECUTION: NOT VERIFIED (ZYROUTER 401)**

**LIVE UI RESULT: NOT VERIFIED**

No claim is made that a live localhost RAB row, price, or amount was produced while the AI provider is unavailable.