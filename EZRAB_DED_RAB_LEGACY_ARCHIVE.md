# EZRAB DED → RAB LEGACY ARCHIVE & DECOMMISSION RECORD (V1 & V2)

**Generated:** 2026-10-01  
**Status:** TOTAL DECOMMISSION (REPLACED BY EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0)  
**Directive:** STOP PATCHING. Do NOT use legacy keyword pipelines, synthetic defaults, or hardcoded fallbacks. Exactly ONE active AI reasoning engine.

---

## 1. Executive Summary of Decommission

The previous DED → RAB pipelines (V1 in `src/services/dedToRabPipelineService.ts` and V2 in `src/ded-rab-v2/`) suffered from systematic architectural flaws:
1. **Premature RAB Generation:** Generated tabular rows before documents were fully read or understood.
2. **Missing Quantities & Work Items:** Relying on simplistic regex/keyword matching or single-pass extraction led to 80%+ missing items and 0 or null quantities.
3. **Synthetic / Guessed Defaults:** Defaulting missing values to 0, 1, or guesses instead of iterative cross-page re-inspection.
4. **AHSP Mismatches & Fabricated Codes:** Using custom fabricated codes (e.g. `AI-CUSTOM-xxx`) or matching incompatible items (e.g. balok praktis for sloof 15x20) without unit compatibility checks.
5. **Unit Safety Violations:** Silently pairing mismatched units (e.g., m³ × Rp/m') resulting in catastrophic order-of-magnitude pricing errors.
6. **False READY States:** Claiming items were "READY" when they lacked evidence or had unverified calculations.

All legacy DED-RAB orchestration code is hereby decommissioned and quarantined.

---

## 2. Decommissioned Files & Services

### A. V1 Orchestration Pipeline
| File Path | Description | Decommission Rationale |
|---|---|---|
| `src/services/dedToRabPipelineService.ts` | Monolithic V1 pipeline service | Hardcoded deterministic regex, synthetic `AI-CUSTOM` codes, fragile state machine |

### B. V2 Orchestration Pipeline (`src/ded-rab-v2/`)
| File Path | Component | Decommission Rationale |
|---|---|---|
| `src/ded-rab-v2/pipeline/dedRabPipeline.ts` | Multi-stage pipeline coordinator | Procedural linear flow with shallow passes; failed to cross-reference sheets |
| `src/ded-rab-v2/pipeline/firstPrinciplesPipeline.ts` | 12-step runner script | Fragile step-by-step runner without self-correcting feedback loops |
| `src/ded-rab-v2/pipeline/dedRabGenerator.ts` | RAB table generator | Premature assembly of rows before AHSP & QTO validation |
| `src/ded-rab-v2/interpretation/constructionCompletenessEngine.ts` | Completeness scorer | Hardcoded heuristic gates without semantic cross-page reasoning |
| `src/ded-rab-v2/interpretation/constructionNormalizer.ts` | Text & element normalizer | Keyword replacement dictionaries that masked missing data |
| `src/ded-rab-v2/interpretation/dedInterpreter.ts` | Vision & text interpreter | Fragmented per-page interpretation without unified document memory |
| `src/ded-rab-v2/interpretation/dedInventoryEngine.ts` | Work inventory creator | Heuristic inventory generator that produced incomplete work lists |
| `src/ded-rab-v2/interpretation/documentSynthesisEngine.ts` | Synthesis engine | Shallow merge of page observations without iterative missing-data loops |
| `src/ded-rab-v2/interpretation/evidenceResolver.ts` | Evidence mapper | Loose ID matching without cryptographic proof or page bounds verification |
| `src/ded-rab-v2/qto/dedQuantityEngine.ts` | Quantity takeoff engine | Blind formula application leading to unit collisions |
| `src/ded-rab-v2/qto/ezrabCoreQto.ts` | Core QTO bridge | Rigid bindings that defaulted missing dimensions |
| `src/ded-rab-v2/ahsp/ahspMatcher.ts` | AHSP candidate matcher | Loose keyword search permitting incompatible dimensions & units |
| `src/ded-rab-v2/ahsp/ahspPriceResolver.ts` | Price resolver bridge | Overwrote official prices with unverified estimates |
| `src/ded-rab-v2/validation/dedRabValidationGate.ts` | Gate validator | Soft validation allowing false READY states |
| `src/ded-rab-v2/review/dedCompletenessAuditor.ts` | Review auditor | Surface-level metric checks |
| `src/ded-rab-v2/review/dedRabReviewService.ts` | Review coordinator | Shallow audit without self-critique |
| `src/ded-rab-v2/ai/dedAnalysisService.ts` | AI analysis service wrapper | Rigid prompt templates without iterative discovery |
| `src/ded-rab-v2/ai/dedVisionReader.ts` | Vision reader | Single-pass image reader with brittle prompt parsing |
| `src/ded-rab-v2/ai/pageVisualReader.ts` | Per-page visual reader | Single-image OCR without document context |
| `src/ded-rab-v2/semantic/semanticClassifier.ts` | Semantic classifier | Naive classification trees |
| `src/ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts` | Spreadsheet sync | Exported premature drafts to Google Sheets |

---

## 3. Decommissioned Prompts & Schemas

1. **V1 Regex Extraction Patterns:** Removed mm/cm/m regex tokenizers that caused unit inflation.
2. **V1 Synthetic AHSP Generator:** Eliminated `AI-CUSTOM-001` prompt templates.
3. **V2 Single-Pass Prompts:** Decommissioned shallow JSON schemas in `dedAnalysisService.ts` and `dedVisionReader.ts` that forced models to emit 3-5 items per page without cross-page awareness.
4. **Permissive Validation Schemas:** Removed loose validation schemas that tolerated missing evidence fields.

---

## 4. Decommissioned Tests & Verification Scripts

The following tests and verification scripts tested the deprecated V1 / V2 pipelines and are superseded by the V3 Full AI test suite:
- `src/test/phase10DedToRab.test.ts` (V1 unit tests)
- `src/test/phase11AiFirstDedRab.test.ts` (V1 AI tests)
- `src/test/dedRabV2Pipeline.test.ts` (V2 pipeline test)
- `src/test/dedRabRootCauseHotfix.test.ts` (V2 hotfix test)
- `src/test/dedRab24Fixtures.test.ts` (V2 fixture tests)
- `src/test/dedRab15RegressionCriteria.test.ts` (V2 criteria test)
- `src/test/dedRabCanonicalEvidenceRegression.test.ts` (V2 regression)
- `src/test/dedDualModeWorkflow.test.ts` (V2 dual mode test)
- `src/test/dedAiFirstCleanPipeline.test.ts` (V2 clean pipeline test)
- `src/test/dedConstructionIntelligence.test.ts` (V2 intelligence test)
- `src/test/ded3ModePipeline.test.ts` (V2 3-mode test)
- `scripts/testFirstPrinciplesV2.ts` (V2 runner script)
- `scripts/testRealDedV2Pipeline.ts` (V2 acceptance script)
- `scripts/testRealDedAcceptanceReport.ts` (V2 report generator)

---

## 5. Preserved Shared Infrastructure (Organs Kept Intact)

The following core modules are **NOT** decommissioned and provide the foundational shared organs for the new V3 Engine:
1. **Official AHSP 2026 Database:**
   - `src/data/nationalCostDatabase/officialAhspRepository.ts` (Official single source of truth, 2026 canonical dataset).
   - `src/data/nationalCostDatabase/masterRegistry.ts`
   - `src/data/nationalCostDatabase/types.ts`
2. **authoritative Price Resolution Engine:**
   - `src/engine/pricing/resolver/priceResolver.ts` (5-tier priority: PROJECT > USER > REGIONAL > OFFICIAL > EXTERNAL).
   - `src/engine/pricing/projectPriceEngine.ts`
   - `src/engine/pricing/repository/priceRepository.ts`
3. **Multi-Provider AI Adapters & Key Pool:**
   - `server/providers/multiProvider/adapters.ts` (chatGemini, chatOpenAiCompatible).
   - `server/providers/multiProvider/keyPool.ts` (Rotational key pooling, budget tracking, cooldowns).
   - `server/config/loadServerEnv.ts`
4. **PDF Ingestion & Rendering Infrastructure:**
   - `src/ded-rab-v2/ingestion/pdfPageService.ts` (High-resolution page extraction, canvas rendering in browser & Node).
   - `src/ded-rab-v2/ingestion/imagePageService.ts`
5. **Mathematical Precision & Units:**
   - `src/engine/safeDecimalEngine.ts` (Decimal.js arithmetic to avoid IEEE-754 floating point errors).

---

## 6. Target Single Active Architecture: V3.0

There is now **EXACTLY ONE ACTIVE PIPELINE**:
**`src/ded-rab-v3/` — EZRAB FULL AI DED INTELLIGENCE ENGINE**

No hidden fallback. No legacy fallback. No duplicate AI pipeline.
