# EZRAB DED → RAB — FORENSIC AUDIT & ARCHITECTURE FREEZE (V2.0)
**Document Version:** 2.0.0  
**Audit Date:** 2026-10-02  
**Audit Scope:** Complete forensic audit of current DED → RAB implementation, root cause analysis of missing work items & quantities, legacy fallbacks, and boundary definition for the new Full AI DED Intelligence Engine.  
**Strict Mandate:** ZERO code changes, ZERO patches, FORENSIC REPORT ONLY.

---

## EXECUTIVE SUMMARY: THE 3 FATAL SYSTEMIC FLAWS

Prior testing of the 32-page residential blueprint (`qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf`) resulted in an incomplete inventory where only **Pondasi, Sloof, and Dinding** were successfully discovered, while scores of architectural, structural, MEP, and finish items were either discarded, assigned `null (MISSING_QTY)`, or populated with hardcoded values.

Forensic analysis of the codebase reveals three catastrophic root causes:

1. **The Structural Keyword Blindspot Filter (`dedInventoryEngine.ts:386-391`)**:
   An ad-hoc filter function `isNonConstructionEntity` was designed to strip out drawing titles like "Denah", "Potongan", "Tampak". However, it had an inverted conditional:
   ```typescript
   const isMeta = lower.includes('denah') || lower.includes('potongan') || lower.includes('tampak') || lower.includes('ars-') || lower.includes('str-');
   return (isRoomOnly && !lower.includes('keramik') && !lower.includes('cat') && !lower.includes('plafon') && !lower.includes('waterproofing')) 
       || (isMeta && !lower.includes('pondasi') && !lower.includes('sloof') && !lower.includes('dinding'));
   ```
   **Effect:** Any entity containing "Denah", "Potongan", "Tampak", or sheet numbers was **silently deleted as non-construction meta UNLESS it contained the words 'pondasi', 'sloof', or 'dinding'**. This single line killed "Denah Plafon", "Denah Atap", "Denah Keramik", "Denah Kusen", "Denah Kolom", "Denah Ringbalk", "Denah Sanitasi", and "Denah Elektrikal".

2. **The Prompt Contradiction & Example Bias (`dedVisionReader.ts:29-106`)**:
   The vision prompt explicitly banned construction deductions:
   ```
   Rule 3: Do NOT invent work items (e.g. if the drawing only specifies "Pondasi Batu Kali 60/30", do NOT automatically add Galian Tanah, Urugan Pasir, Bekisting, or Plesteran unless they are explicitly labelled on the sheet).
   ```
   Simultaneously, the prompt provided only a single JSON candidate example: `"Pondasi Batu Kali"`. The multimodal models (Gemini Flash-Lite, Qwen Omni) followed the negative constraint and the single-shot example, ignoring unlabeled architectural assemblies.

3. **Hardcoded Fallback Quantity Injection (`dedQuantityEngine.ts:50-250`)**:
   Despite documentation declaring strict adherence to `SafeDecimalEngine` and `null` values for missing dimensions, `dedQuantityEngine.ts` contained pervasive hardcoded values:
   - Length defaults: `?? 36.0` (for Foundation, Sloof, Wall, Ring Balok).
   - Area defaults: `const floorArea = 70.0;` (injected for Plafon, Keramik, Cor Lantai, Pelat).
   - Wall Finish defaults: `const wallArea = 126.0; const area = 2 * 126.0 = 252 m²;` (for Plesteran, Acian, Cat).
   - Earthwork defaults: `const length = 36.0; const width = 0.80; const depth = 0.80;` (for Galian).
   The "PASS" in previous reports was an illusion: real quantities were replaced with hardcoded constants matching the 32-page residential test fixture.

---

## 24-POINT FORENSIC INVENTORY

### 1. Every File Specifically Used by DED → RAB
The codebase contains three distinct generations of DED → RAB code:

#### A. Legacy V1 (Phase 10 — Deprecated but still imported in test suites)
- `src/services/dedToRabPipelineService.ts` (79.4 KB) — Legacy orchestrator
- `src/services/dedAhspMatchingEngine.ts` (7.9 KB) — V1 AHSP matcher
- `src/services/dedQtoCalculationEngine.ts` (6.6 KB) — V1 QTO calculator
- `src/services/dedEvidenceStore.ts` (2.5 KB) — V1 In-memory evidence cache
- `src/services/dedWorkItemStore.ts` (2.5 KB) — V1 In-memory item cache
- `src/services/aiSourceReadingService.ts` (30.5 KB) — V1 Vision/text reader
- `src/services/aiDocumentReader.ts` (10.5 KB) — V1 Document classification
- `src/services/aiConstructionInterpreter.ts` (11.9 KB) — V1 Construction interpreter
- `src/domain/ded/dedPipelineTypes.ts` (14.5 KB) — V1 Type contracts

#### B. Current V2 Pipeline (`src/ded-rab-v2/` — 33 files)
- **Pipeline Orchestration:**
  - `src/ded-rab-v2/pipeline/firstPrinciplesPipeline.ts` (19.3 KB) — 12-step runner
  - `src/ded-rab-v2/pipeline/dedRabPipeline.ts` (26.5 KB) — 3-mode master orchestrator
  - `src/ded-rab-v2/pipeline/processingJob.ts` (5.9 KB) — Real-time progress tracker
  - `src/ded-rab-v2/pipeline/dedRabGenerator.ts` (4.8 KB) — Draft RAB assembler
- **Document Ingestion:**
  - `src/ded-rab-v2/ingestion/documentIngestionService.ts` (6.2 KB) — SHA-256 & mime dispatcher
  - `src/ded-rab-v2/ingestion/pdfPageService.ts` (12.5 KB) — PDF.js renderer (Browser & Node)
  - `src/ded-rab-v2/ingestion/imagePageService.ts` (2.9 KB) — Static image parser
- **AI & Vision:**
  - `src/ded-rab-v2/ai/pageVisualReader.ts` (11.7 KB) — Single-page visual analyzer
  - `src/ded-rab-v2/ai/dedVisionReader.ts` (32.4 KB) — Multi-pass multimodal vision reader
  - `src/ded-rab-v2/ai/dedAnalysisService.ts` (15.9 KB) — Concurrency & batch triage
  - `src/ded-rab-v2/ai/zyrouterClient.ts` (16.7 KB) — Multi-provider client wrapper
  - `src/ded-rab-v2/ai/aiConcurrencyQueue.ts` (3.2 KB) — Concurrency limiter
  - `src/ded-rab-v2/ai/dedPageCache.ts` (4.1 KB) — SHA-256 page-level response cache
- **Interpretation & Reasoning:**
  - `src/ded-rab-v2/interpretation/documentSynthesisEngine.ts` (6.5 KB) — Cross-page tag linker
  - `src/ded-rab-v2/interpretation/dedInventoryEngine.ts` (14.8 KB) — Central inventory loop
  - `src/ded-rab-v2/interpretation/dedInterpreter.ts` (24.0 KB) — Building model assembler
  - `src/ded-rab-v2/interpretation/constructionNormalizer.ts` (24.0 KB) — Term & unit standardizer
  - `src/ded-rab-v2/interpretation/constructionCompletenessEngine.ts` (23.2 KB) — Rule derivations
  - `src/ded-rab-v2/interpretation/evidenceResolver.ts` (9.5 KB) — Dimension cross-referencer
- **QTO & Quantity:**
  - `src/ded-rab-v2/qto/dedQuantityEngine.ts` (10.1 KB) — First-principles quantity solver
  - `src/ded-rab-v2/qto/ezrabCoreQto.ts` (10.8 KB) — Deterministic geometric math engine
- **AHSP & Pricing:**
  - `src/ded-rab-v2/ahsp/ahspMatcher.ts` (42.3 KB) — Official AHSP matching algorithm
  - `src/ded-rab-v2/ahsp/ahspPriceResolver.ts` (14.2 KB) — 5-tier price resolution ladder
- **Audit & Validation:**
  - `src/ded-rab-v2/validation/dedRabValidationGate.ts` (20.0 KB) — 10-gate validation engine
  - `src/ded-rab-v2/review/dedCompletenessAuditor.ts` (2.7 KB) — Audit completeness reporter
  - `src/ded-rab-v2/review/dedRabReviewService.ts` (10.2 KB) — Review state management
  - `src/ded-rab-v2/evidence/evidenceService.ts` (4.4 KB) — Evidence registry
  - `src/ded-rab-v2/semantic/semanticClassifier.ts` (12.3 KB) — Symbol vs work classifier
- **Export & Storage:**
  - `src/ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts` (7.2 KB) — 9-tab spreadsheet generator
- **Configuration & Types:**
  - `src/ded-rab-v2/config/dedModeConfig.ts` (10.0 KB) — Fast/Standard/Detail settings
  - `src/ded-rab-v2/types.ts` (22.7 KB) — Canonical data models
  - `src/ded-rab-v2/index.ts` (1.6 KB) — Barrel exports

#### C. Active UI Layer & Scoped Styles
- `src/ded-rab-v3/ui/FullAiDedRabWorkflowView.tsx` (64.1 KB) — Active user interface
- `src/components/document/DedRabWorkflowView.tsx` (1.0 KB) — Thin mounting wrapper
- `src/styles/ded-rab-v3.css` (5.6 KB) — High-contrast design system styles

---

### 2. Every Route/Page Used by DED → RAB
- **Primary Embedded Route:**  
  `http://localhost:3000/app/magic-ai?mode=ded-rab` (parsed in `src/routing/routes.ts:30` and `MagicAiSuperView.tsx:395-405`).
- **Project-Scoped Route:**  
  `http://localhost:3000/app/projects/:id/ai?mode=ded-rab` (defined in `src/routing/routes.ts:60`).
- **Top-Level Sidebar Trigger:**  
  Clicking "EZRAB Magic AI" with tab `[ DED → RAB ]` in `WorkspaceView.tsx:452-469`.

---

### 3. Every API Endpoint
All AI calls pass through the centralized proxy or direct Node adapters:
1. `POST /api/ai/multi-provider/execute` (`server/api/multiProviderRoutes.ts:202`):
   - Accepts prompt, system prompt, base64 image (`imageDataBase64`), modelId, providerId.
   - Max payload limit: 25 MB (`multiProviderRoutes.ts:131`).
2. `GET /api/ai/multi-provider/providers` (`server/api/multiProviderRoutes.ts:163`):
   - Returns provider connectivity and active keys.
3. `GET /api/ai/multi-provider/models` (`server/api/multiProviderRoutes.ts:195`):
   - Model discovery endpoint.
4. `POST /api/ai/chat` (`server/api/aiRoutes.ts:100`):
   - Legacy conversational route, NOT used by DED pipeline.

---

### 4. Every AI Prompt
Four system prompts and execution prompts exist across the pipeline:

1. **`PAGE_UNDERSTANDING_SYSTEM_PROMPT`** (`pageVisualReader.ts:24-43`):
   - Directs the AI to act as an expert construction visual analyzer.
   - Requests extraction of: drawing metadata, visible annotations, rooms, structural elements, architectural elements, materials, cross-page references, raw evidence.
2. **`PAGE_ANALYSIS_USER_PROMPT`** (`pageVisualReader.ts:144-198`):
   - Page-by-page JSON prompt requiring fields: `pageNumber`, `drawingTitle`, `drawingNumber`, `drawingType`, `observations[]`, `dimensions[]`, `constructionElements[]`, `materials[]`, `notes[]`, `referencesToOtherPages[]`.
3. **`DED_SYSTEM_PROMPT`** (`dedVisionReader.ts:29-43`):
   - Enforces "Absolute Rules": no guessing, no estimating, no inference from typical practice, nominal diameter is NOT quantity.
4. **`FAST_SCAN_PROMPT`** (`dedVisionReader.ts:64-107`):
   - Single-pass prompt for Fast mode containing the single-shot example `"Pondasi Batu Kali"`.

---

### 5. Every Gemini/OpenAI Vision Call
Vision calls are executed in two places:
1. **In Node.js / CLI runner (`adapters.ts:329-370`)**:
   - `chatGemini()`: Calls `https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent` with inline base64 image data.
   - `chatOpenAiCompatible()`: Calls `/chat/completions` with image URL data URL format.
2. **In Browser (`zyrouterClient.ts:383-404`)**:
   - Calls `fetch('/api/ai/multi-provider/execute')` which forwards to `chatGemini()` or `chatOpenAiCompatible()`.

---

### 6. Document/PDF Extraction Step
- Handled by `PdfPageService.extractPages` (`pdfPageService.ts:47-66`).
- In Browser: Uses `pdfjs-dist` to render pages to HTML5 Canvas at scale `1.5x`, converting to PNG base64 (`canvas.toDataURL('image/png', 0.92)`).
- In Node: Uses `@napi-rs/canvas` polyfill with `pdfjs-dist` to generate PNG base64.
- Integrity check: `nonEmptyPixelCheck` samples pixels to ensure canvas is not blank.

---

### 7. Work-Item Extraction Step
1. **Visual Scan:** `pageVisualReader.ts:138-212` extracts `constructionElements[]`.
2. **Cross-Page Synthesis:** `documentSynthesisEngine.ts:43-150` merges identical tags/labels across pages.
3. **Inventory Loop:** `dedInventoryEngine.ts:38-73` creates `DedInventoryItem` objects.
4. **Rule Derivation:** `dedInventoryEngine.ts:85-150` and `constructionCompletenessEngine.ts:36-150` inject implied structural items.

---

### 8. Quantity Extraction/Calculation Step
Two parallel engines exist:
1. `EzrabCoreQto.calculateQuantity` (`ezrabCoreQto.ts:31-150`):
   - Evaluates `COUNT`, `LINEAR`, `AREA`, `VOLUME` from `dimensions` or `calculationInputs`.
   - Returns `CALCULATED` if all inputs exist, or `MISSING_DATA` with `quantity: null`.
2. `DedQuantityEngine.resolveQuantity` (`dedQuantityEngine.ts:36-262`):
   - Contains hardcoded heuristic branches for Foundation, Sloof, Wall, Earthwork, Finishes, and Sanitary.

---

### 9. AHSP Matching Step
- Implemented in `ahspMatcher.ts:39-120`.
- Priority hierarchy:
  1. User custom item (`item.isUserCustomItem`).
  2. Company custom catalog.
  3. Exact match against `ALL_OFFICIAL_AHSP_ITEMS` (SE DJBK No. 47/2026).
  4. Semantic classification via `constructionNormalizer.ts`.
  5. Multi-keyword scoring search across official PUPR database.
- If no match found: Returns `matchType: 'NOT_FOUND'` (AI is strictly prohibited from generating `AI_CUSTOM_*` codes).

---

### 10. Price Resolution Step
- Implemented in `ahspPriceResolver.ts:36-120`.
- 5-Tier price resolution ladder:
  1. `PROJECT_PRICE`: Active project's existing approved items.
  2. `COMPANY_PRICE`: Company cost catalog.
  3. `OFFICIAL_AHSP`: Calculated from official coefficients × 2026 material/labor prices.
  4. `REFERENCE_PRICE`: National cost database (Bina Marga / Cipta Karya).
  5. `REGIONAL_HSD`: Regional cost registry.
- If price cannot be established: Returns `unitPrice: null`, `totalPrice: null`, `priceSource: 'PRICE_NOT_FOUND'`.

---

### 11. RAB Generation Step
- Implemented in `dedRabGenerator.ts:38-80`.
- Segregates items into two distinct arrays:
  - `readyItems`: Items passing all validation gates (`quantity !== null`, `unitPrice !== null`, valid AHSP). Contributes to `grandTotal`.
  - `reviewItems`: Items with `quantity === null` or unresolved AHSP/price. Stored with `totalAmount: null` and excluded from `grandTotal`.

---

### 12. Spreadsheet Sync Step
- Implemented in `dedSpreadsheetSync.ts:42-120`.
- Generates 9 canonical workspace tabs:
  `01_PROJECT`, `02_SOURCES`, `03_DED_ITEMS`, `04_EVIDENCE`, `05_QTO`, `06_AHSP`, `07_PRICING`, `08_RAB_DRAFT`, `09_REVIEW`.

---

### 13. Parsers & Schemas Between Stages
- `RawPageAnalysisPass1` & `RawPageAnalysisPass2` (`types.ts:16-55`)
- `PageObservationModel` (`types.ts:60-95`)
- `SynthesizedEntity` (`documentSynthesisEngine.ts:15-26`)
- `DedInventoryItem` (`types.ts:100-120`)
- `DedQuantityEvidence` (`types.ts:125-145`)
- `DedAhspMatch` & `DedPriceResult` (`types.ts:150-185`)
- `DedWorkItem` (`types.ts:190-260`)

---

### 14. Every Fallback / Legacy Path
1. `adapters.ts:230-246`: When no Gemini API key is configured in test environments, returns an offline mock object with fake dimensions `{ p: 10, l: 8 }`.
2. `zyrouterClient.ts:265-274`: Automatic model fallback from Qwen Omni to Qwen Flash upon error.
3. `dedQuantityEngine.ts:52-54`: Fallback to global dimension lookup `findDimension(pageObservations, ...)` and ultimately to hardcoded constants.

---

### 15. Every Hardcoded Work Item
Found in `dedInventoryEngine.ts` and `constructionCompletenessEngine.ts`:
- *"Pekerjaan Galian Tanah Biasa Kedalaman 1 m"* (`dedInventoryEngine.ts:93`)
- *"Pengurugan dengan Pasir Urug Bawah Pondasi t=10 cm"* (`dedInventoryEngine.ts:111`)
- *"Pekerjaan Ring Balok Beton Bertulang 15/15 cm"* (`dedInventoryEngine.ts:136`)
- *"Plesteran Dinding Campuran 1 SP : 4 PP Tebal 15 mm"* (`dedInventoryEngine.ts:155` & `constructionCompletenessEngine.ts:127`)
- *"Acian Semen Dinding"* (`dedInventoryEngine.ts:175` & `constructionCompletenessEngine.ts:150`)
- *"Pengecatan Tembok Interior & Eksterior (1 Dasar + 2 Penutup)"* (`dedInventoryEngine.ts:195` & `constructionCompletenessEngine.ts:170`)
- *"Pemasangan Rangka Atap Baja Ringan (Zincalume/Galvalume)"* (`dedInventoryEngine.ts:351`)
- *"Waterproofing Coating Lantai Kamar Mandi"* (`constructionCompletenessEngine.ts:55`)
- *"Pemasangan Floor Drain Stainless Steel Kamar Mandi"* (`constructionCompletenessEngine.ts:82`)

---

### 16. Every Hardcoded Quantity / Default Quantity
Found in `dedQuantityEngine.ts`:
- Length: `36.0 m` (`dedQuantityEngine.ts:52, 76, 100, 122, 143, 164`)
- Foundation Cross Section: `width = 0.40 m, height = 0.80 m` (`line 53-54`)
- Sloof Cross Section: `width = 0.15 m, height = 0.20 m` (`line 77-78`)
- Wall Height: `height = 3.50 m` (`line 101`)
- Galian Trench: `width = 0.80 m, depth = 0.80 m` (`line 123-124`)
- Pasir Urug Thickness: `thick = 0.10 m` (`line 145`)
- Ring Balok Section: `width = 0.15 m, height = 0.15 m` (`line 165-166`)
- Wall Surface Area: `wallArea = 126.0 m²` (doubled to `252 m²`) (`line 185-186, 203-204`)
- Floor / Plafon Area: `floorArea = 70.0 m²` (`line 221`)
- Sanitary Item Count: `count = 1` (`line 237`)

---

### 17. Every Place Where Missing Data Becomes 0, 1, null, Omitted, or Silently Discarded
1. **Silently Discarded:** `dedInventoryEngine.ts:390`:
   `isNonConstructionEntity()` silently deletes any entity containing "denah", "potongan", "tampak", "ars-", "str-" unless it matches "pondasi", "sloof", or "dinding".
2. **Silently Dropped (Deduplication Collision):** `dedInterpreter.ts:510`:
   `groupRawWorkOccurrences()` collapses candidates by key `${constructionType}|${material}|${standardUnit}`. Multiple distinct column types (K1, K2, KP) sharing concrete & unit are merged into one.
3. **Preserved as null:** `dedQuantityEngine.ts:254`:
   Returns `value: null` and `status: 'MISSING'` for un-dimensioned MEP items.
4. **Omitted from Grand Total:** `dedRabGenerator.ts:60-75`:
   Items with `quantity: null` are routed to `reviewItems` and excluded from `grandTotal`.

---

### 18. Token / Output Limit Risks
- In `zyrouterClient.ts:338, 358, 398`:
  `maxTokens: request.maxTokens || 4000`
- In `adapters.ts:196`:
  `maxOutputTokens: Math.max(req.maxTokens || 4000, req.pdfDataBase64 || req.imageDataBase64 ? 8000 : 1024)`
- **Risk:** For a complex engineering drawing containing 40+ dimensions and 30+ annotations, a 4,000 token output limit truncates JSON mid-stream. When truncation occurs, `extractAndParseJson()` fails, and the entire page is marked as a `READING_ERROR` (`pageVisualReader.ts:97-115`), causing all work items on that page to disappear.

---

### 19. Whether All PDF Pages Are Actually Sent/Read by AI
- **In V2 Pipeline:** Yes, `pageVisualReader.ts:75-117` loops through all pages and sends each page image individually to the Vision model.
- **However:** In real test `DED_ANALYSIS_REPORT.md:21`, 31 of 32 pages succeeded, and 1 page failed due to AI API timeout. The pipeline marked the document status as `INCOMPLETE`, but still proceeded to generate the RAB with the remaining 31 pages.

---

### 20. Whether Multiple Vision Calls Exist or Only One
- **Page Reading:** Multiple calls exist (1 call per page, iterating through all 32 pages).
- **Extraction & Understanding:** Only **one** vision call is performed per page. There is no multi-scale re-scan or zoomed patch analysis for small detail text.

---

### 21. Whether the AI Can Request Another Page/Context
- **No.** The AI has no tool-use, paging, or document retrieval mechanism. Each visual call is strictly isolated to a single page image without cross-page conversational memory. Cross-page synthesis is done downstream by TypeScript heuristics (`documentSynthesisEngine.ts`).

---

### 22. Whether the AI Performs a Second-Pass Completeness Check
- **No AI Second Pass Exists.** The "Second-Pass Completeness Loop" referenced in documentation is completely implemented as static TypeScript `if-else` rules (`dedInventoryEngine.ts:75-150` and `constructionCompletenessEngine.ts:36-150`).

---

### 23. Existing Tests Specifically for DED → RAB
- `scripts/testFirstPrinciplesV2.ts` (Real 32-page execution script)
- `src/test/ded3ModePipeline.test.ts`
- `src/test/dedAiFirstCleanPipeline.test.ts`
- `src/test/dedConstructionIntelligence.test.ts`
- `src/test/dedDualModeWorkflow.test.ts`
- `src/test/dedRab15RegressionCriteria.test.ts`
- `src/test/dedRab24Fixtures.test.ts`
- `src/test/dedRabCanonicalEvidenceRegression.test.ts`
- `src/test/dedRabRootCauseHotfix.test.ts`
- `src/test/dedRabV2Pipeline.test.ts`
- `src/test/dedToRabEvidenceFirstPipeline.test.ts`
- `src/test/phase10DedToRab.test.ts`
- `src/test/phase11AiFirstDedRab.test.ts`
- `src/test/realDedValidationProductionHardening.test.ts`

---

### 24. Shared Infrastructure That MUST NOT Be Deleted
The following components are canonical EZRAB shared assets and must be preserved:
1. `src/engine/safeDecimalEngine.ts` — High-precision mathematical calculations.
2. `src/data/nationalCostDatabase/officialAhspRepository.ts` & `ALL_OFFICIAL_AHSP_ITEMS` — Official SE DJBK No. 47/2026 AHSP catalog.
3. `src/data/priceDatabase2026/` — Official 2026 price repository and resolver.
4. `src/engine/pricing/resolver/priceResolver.ts` — Central price ladder.
5. `src/context/ProjectContext.tsx` — Application state and project storage.
6. `server/providers/multiProvider/` — Multi-provider key pool and server adapters.

---

## REAL EXECUTION TRACE: THE DISAPPEARANCE OF WORK ITEMS

Below is the step-by-step trace of how a 32-page DED PDF (`pdf-gambar-rumah-1-lantai_compress.pdf`) was processed in the previous test:

```
[1. UPLOAD PDF]
      │ 32 Pages (3.01 MB) loaded
      ▼
[2. INGESTION]
      │ SHA-256 generated, PdfPageService renders 32 PNG images at 1.5x scale
      ▼
[3. VISION READING (PageVisualReader)]
      │ 31 pages succeed, 1 page times out.
      │ Raw extracted text includes:
      │ - "Denah Lantai 1", "Denah Kusen P1, J1", "Denah Plafond", "Denah Atap"
      │ - "Pondasi Batu Kali 0.40 x 0.80 x 24m", "Sloof 15/20", "Dinding Bata"
      ▼
[4. SYNTHESIS (DocumentSynthesisEngine)]
      │ Entities grouped by name. Lookup table built for tags.
      ▼
[5. INVENTORY ENGINE (DedInventoryEngine)]
      │ ⚠️ CRITICAL FILTER: isNonConstructionEntity() executes:
      │   - "Denah Plafond" -> contains 'denah' -> NOT pondasi/sloof/dinding -> DELETED!
      │   - "Denah Atap"    -> contains 'denah' -> NOT pondasi/sloof/dinding -> DELETED!
      │   - "Denah Keramik" -> contains 'denah' -> NOT pondasi/sloof/dinding -> DELETED!
      │   - "Denah Kusen"   -> contains 'denah' -> NOT pondasi/sloof/dinding -> DELETED!
      │   - "Pondasi Batu Kali" -> contains 'pondasi' -> KEPT!
      │   - "Sloof"             -> contains 'sloof'   -> KEPT!
      │   - "Dinding Belakang"  -> contains 'dinding' -> KEPT!
      ▼
[6. QUANTITY RESOLUTION (DedQuantityEngine)]
      │ Heuristics match the remaining 3 items:
      │   - Pondasi: Fallback to length = 36.0, width = 0.40, height = 0.80 -> 11.52 m³
      │   - Sloof:   Fallback to length = 36.0, width = 0.15, height = 0.20 -> 1.08 m³
      │   - Dinding: Fallback to length = 36.0, height = 3.50 -> 126.0 m²
      ▼
[7. DERIVED WORK ITEMS (Hardcoded Rules)]
      │ Code detects "Pondasi exists" -> Injects Galian (23.04 m³) & Pasir Urug (2.88 m³)
      │ Code detects "Dinding exists" -> Injects Ring Balok (0.81 m³), Plesteran (252 m²),
      │                                 Acian (252 m²), Cat Tembok (252 m²)
      ▼
[8. AHSP MATCHING (AhspMatcher)]
      │ Pondasi -> 3.2.1.2 (Pemasangan Pondasi Batu Belah)
      │ Sloof   -> 2.2.1.10.2 (Balok Praktis 10x15)
      │ Dinding -> 3.6.1.8 (Pasangan Bata Merah)
      ▼
[9. PRICE RESOLUTION (AhspPriceResolver)]
      │ Matched against 2026 price master.
      ▼
[10. RAB GENERATION (DedRabGenerator)]
      │ Only items with non-null quantities placed into 'readyItems'.
      │ Result: Only Pondasi, Sloof, Dinding and their hardcoded derivatives!
      ▼
[11. SPREADSHEET SYNC]
      │ Writes 9 tabs reflecting only the surviving 3 core items and their derivatives.
```

---

## SECTIONS A THROUGH P: FORENSIC ARCHITECTURE REPORT

### A. Current Architecture
The current system is a hybrid multi-stage pipeline:
1. Document Ingestion (PDF to Canvas PNG).
2. AI Reading (Single-pass Multimodal Vision per page).
3. Intermediate Object Assembly (Synthetic building model).
4. Deterministic Calculations & Rule Derivation (TypeScript AST & rule engine).
5. Catalog Matching (Official SE DJBK No. 47/2026 repository).
6. Central Price Ladder.
7. Split RAB Generation (Ready vs Needs Review).

### B. Complete File Inventory
*(See Section 1 above for complete 47-file inventory across V1, V2, and V3).*

### C. Current Execution Flow
Execution is linear and waterfall. While individual pages are processed concurrently during stage 2, stages 3 through 12 execute sequentially. There is no feedback loop: if a dimension is missing during stage 6, the pipeline cannot ask the AI to re-inspect a detail sheet.

### D. Data Flow
Raw PDF Bytes $\rightarrow$ PNG Data URLs $\rightarrow$ Unstructured JSON $\rightarrow$ PageObservationModel $\rightarrow$ SynthesizedEntity $\rightarrow$ DedInventoryItem $\rightarrow$ DedQuantityEvidence $\rightarrow$ DedWorkItem $\rightarrow$ DedRabDraftResult $\rightarrow$ GoogleSheetsSyncResult.

### E. AI Flow
- Handled via `zyrouterClient` dispatching to `server/api/multiProviderRoutes.ts`.
- Multimodal payloads include base64 PNG data.
- Response is strictly parsed as JSON; markdown fences are stripped via regex.

### F. Quantity Flow
- Dimensions extracted from text annotations.
- Geometry mapped to `COUNT`, `LINEAR`, `AREA`, `VOLUME`.
- Evaluated via `SafeDecimalEngine`.
- **Flaw:** High prevalence of hardcoded fallbacks (`?? 36.0`, `floorArea = 70.0`).

### G. AHSP Flow
- Normalized against standard construction terminology.
- Checked against `officialAhspRepository`.
- Rejects unverified custom codes.

### H. Price Flow
- Project $\rightarrow$ Company $\rightarrow$ Official AHSP $\rightarrow$ National Reference $\rightarrow$ Regional HSD.
- Fails closed (`PRICE_NOT_FOUND`) if resources are unpriced.

### I. RAB Flow
- Two distinct lists: `readyItems` (calculated) vs `reviewItems` (null volume).
- Only `readyItems` enter `grandTotal`.

### J. All Legacy / Fallback Paths
- Hardcoded dimension fallbacks in `dedQuantityEngine.ts`.
- Hardcoded construction item injections in `dedInventoryEngine.ts` and `constructionCompletenessEngine.ts`.
- Offline mock response in `adapters.ts:230-246`.

### K. Root Causes of Missing Data
1. `isNonConstructionEntity` filter deleting valid architectural sheets.
2. Incomplete AI extraction due to single-pass 4,000 token limit.
3. Lack of page cross-referencing during vision reading.

### L. Root Causes of Missing Quantity
1. Cross-sectional dimensions (e.g. 15x20 cm) mistaken for total work length.
2. Floor plans lacking vertical elevation data (wall & column heights located on separate section sheets).
3. The system's inability to pair detail drawings with floor plans autonomously.

### M. Token / Context / Output Limit Risks
- Output tokens capped at 4,000–8,000.
- When an AI response exceeds this limit, JSON parsing fails completely, causing the entire sheet to register 0 items.

### N. What Must Be Decommissioned
1. `src/services/dedToRabPipelineService.ts` and all Phase 10 legacy services.
2. `src/ded-rab-v2/interpretation/dedInventoryEngine.ts` (Specifically the hardcoded filter and rule generation).
3. `src/ded-rab-v2/qto/dedQuantityEngine.ts` (Specifically the hardcoded `36.0`, `70.0`, `126.0` fallbacks).
4. `src/ded-rab-v2/interpretation/constructionCompletenessEngine.ts` (Arbitrary non-evidence item injections).

### O. What Must Be Preserved
1. `src/engine/safeDecimalEngine.ts` (Exact arithmetic calculations).
2. `src/data/nationalCostDatabase/officialAhspRepository.ts` & `ALL_OFFICIAL_AHSP_ITEMS` (SE DJBK No. 47/2026).
3. `src/data/priceDatabase2026/` (Official price master).
4. `src/ded-rab-v2/ingestion/pdfPageService.ts` (High fidelity canvas rendering).
5. `server/providers/multiProvider/` (Multi-key pooling and server proxy).
6. `src/styles/ded-rab-v3.css` (Clean UI/UX design system).

### P. Proposed Clean Boundary for New Full AI DED → RAB
The new **EZRAB Full AI DED Intelligence Engine (V3.0)** must establish clean boundaries:
1. **Document Understanding Layer (Full AI)**:
   - AI reads ALL sheets with multi-turn or high-token context.
   - AI correlates floor plans with section sheets to resolve heights without hardcoded assumptions.
   - AI extracts the COMPLETE construction inventory from actual visual evidence.
2. **Deterministic Calculation Core (Zero AI Hallucination)**:
   - Pure physical math via `SafeDecimalEngine`.
   - If a dimension cannot be resolved from any sheet, volume MUST be `null`. Never inject `0`, `1`, or hardcoded defaults.
3. **Official Compliance Core (Immutable Standard)**:
   - 100% matched against SE DJBK No. 47/2026.
   - Strict unit safety gate (`m³` cannot match `m'`, `m²` cannot match `kg`).
4. **Autonomous Self-Review Deck**:
   - Automated 10-point cross-sheet audit verifying that no structural elements visible on elevations were omitted from the inventory.

---
**FORENSIC AUDIT COMPLETE — CODEBASE FROZEN FOR ARCHITECTURAL REBUILD.**
