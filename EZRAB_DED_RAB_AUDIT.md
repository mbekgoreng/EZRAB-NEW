# EZRAB DED → RAB Comprehensive Architecture Audit & Forensic Report

**Target Environment:** `http://localhost:3000`  
**Target Route:** `/app/projects/:projectId/ai?mode=ded-rab` (e.g. `/app/projects/PRJ-RUMAH-2LT-01/ai?mode=ded-rab`)  
**Standard:** AHSP PUPR 2026 + Deterministic QTO + Multi-Tier Price Engine + WBS Spreadsheet RAB  
**Date:** 2026-09-30  
**Status:** AUDITED & REMEDIATED  

---

## 1. Executive Summary & Root-Cause Diagnosis

When running DED → RAB on `localhost:3000`, historical legacy behaviors produced an unstructured flat list containing non-work drawing items (such as room labels `Kamar Utama`, `KM/WC` and raw drawing tags `P1`, `J1`, `BV1`, `Keramik 40x40`) alongside legitimate work items (`Pondasi Batu Kali`). Many rows exhibited empty quantities, QTO showing 0, missing AHSP matches, unresolved prices with `"-"` unit price, and synthetic `AI-CUSTOM` AHSP codes.

The root cause was traced to 4 foundational architectural flaws:
1. **Lack of Semantic Entity Separation:** Raw OCR tokens were converted directly into work items without a filtering classification pass separating `ROOM_LABEL`, `REFERENCE`, and `CONSTRUCTION_WORK`.
2. **Permissive Fallback & Synthetic AHSP:** When catalog lookup failed, older heuristics generated synthetic fallback codes (`AI-CUSTOM-XXXX`) with arbitrary pricing ratios.
3. **Implicit Defaults:** Missing dimensions were defaulted to 0 or 1, and missing prices were displayed as `"-"` without flagging missing resource components.
4. **Permissive RAB Commit Gate:** The "Apply ke RAB" button permitted unverified items to enter the active project RAB.

---

## 2. Phase 0: Forensic Answers to the 15 Specific Execution Path Questions

### Q1: Jalur eksekusi saat ini mulai dari mana? (nama file, baris kode, fungsi entry point)
- **UI Entry Point:** [WorkspaceView.tsx](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/components/layout/WorkspaceView.tsx#L452-L469)
  - Evaluates `activeMenu === 'magic-ai'` and passes `initialMode={route.mode}` (`'ded-rab'`) to `MagicAiSuperView.tsx`.
- **SuperView Container:** [MagicAiSuperView.tsx](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/components/document/MagicAiSuperView.tsx#L5126-L5132)
  - When `magicMode === 'ded-rab'`, renders `<DedRabWorkflowView>`.
- **Interactive Component:** [DedRabWorkflowView.tsx](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/components/document/DedRabWorkflowView.tsx#L692-L733)
  - Function: `handleStartAnalysis()`
- **Pipeline Orchestrator Entry Point:** [dedRabPipeline.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/pipeline/dedRabPipeline.ts#L126-L176)
  - Method: `DedRabPipeline.getInstance().execute(input: ExecutePipelineInput)`

### Q2: AI model apa yang dipanggil saat user upload DED? (nama provider, model, prompt file/location)
- **Provider & Model:**
  - Fast Mode: `gemini-2.0-flash-lite` via `zyrouterClient.ts` / Google Gemini API.
  - Standard Mode: `qwen-2.5-vl-72b-instruct` / `qwen-vl-plus` via VLEEE router.
  - Detail Mode: `gemini-2.5-flash` with multi-pass cross-page reasoning.
- **Config Resolver:** [dedModeConfig.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/config/dedModeConfig.ts#L30-L75)
- **Prompt Files:**
  - Pass 1 (Screening): [dedVisionReader.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/dedVisionReader.ts#L70-L115) (`DED_SYSTEM_PROMPT_PASS1`)
  - Pass 2 (Extraction): [dedVisionReader.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/dedVisionReader.ts#L120-L210) (`DED_EXTRACTION_PROMPT_PASS2`)

### Q3: Vision/OCR extraction dilakukan oleh service mana?
- **Page Rendering:** [pdfPageService.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ingestion/pdfPageService.ts) and [imagePageService.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ingestion/imagePageService.ts) render rasterized canvas data (PNG data URL) with SHA-256 caching.
- **Multimodal Client:** [zyrouterClient.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/zyrouterClient.ts) (`zyrouterClient.chat(payload)`).
- **Vision Reader:** [dedVisionReader.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/dedVisionReader.ts) (`extractPagePass1`, `extractPagePass2`).

### Q4: DED parsing dan fact extraction dilakukan oleh service mana?
- **Parser:** [dedVisionReader.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/dedVisionReader.ts#L460-L535) (`parsePass2Response`).
- **Semantic Classification:** [semanticClassifier.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/semantic/semanticClassifier.ts#L219-L335)
  - Classifies extracted raw text into `ROOM_LABEL`, `DOOR_REFERENCE`, `WINDOW_REFERENCE`, `STRUCTURAL_REFERENCE`, `SYMBOL`, or `CONSTRUCTION_WORK`.
- **DED Interpreter:** [dedInterpreter.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/interpretation/dedInterpreter.ts#L45-L120) (`interpretWithBuildingModel`).

### Q5: QTO calculation dilakukan oleh service mana?
- **Service:** [ezrabCoreQto.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/qto/ezrabCoreQto.ts#L30-L150) (`EzrabCoreQto.calculateQuantity(item)`).
- **Arithmetic Engine:** [SafeDecimalEngine.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/safeDecimalEngine.ts)
- **Supported Geometries:** `RECTANGULAR` ($L \times W \times H$), `TRAPEZOIDAL` ($\frac{W_1 + W_2}{2} \times H \times L$), `CYLINDRICAL` ($\pi \times r^2 \times H$), `LINEAR` ($L$), `COUNT` ($N$). Missing parameters strictly return `quantity: null` and `status: MISSING_DATA` (never 0).

### Q6: AHSP matching dilakukan oleh service mana?
- **Service:** [ahspMatcher.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ahsp/ahspMatcher.ts#L35-L140) (`ahspMatcher.matchWorkItem(item, companyCatalog)`).
- **Matching Pipeline:** Exact Code Match → Specification Match → Indonesian Construction Vocabulary Match → Regional PUPR Match.
- **Fail-Closed Rule:** If no match is found in official databases, matchType is set to `'NOT_FOUND'`. Synthetic fallback codes are strictly barred.

### Q7: AHSP dataset diambil dari mana? (tabel/file/memory?)
- **Master Dataset:** [masterRegistry.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/data/nationalCostDatabase/masterRegistry.ts) (`ALL_OFFICIAL_AHSP_ITEMS`), compiled from:
  - `data/ahsp2026/validated/ahsp_2026_master.json` (5,801 official PUPR 2026 items).
  - [ahsp2026Canonical.generated.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts).
  - Supabase table: `public.rab_items` and `public.rab_item_components` for persisted project items.

### Q8: Price engine dipanggil di mana? (tabel/file/fungsi?)
- **Resolver Service:** [ahspPriceResolver.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ahsp/ahspPriceResolver.ts#L40-L120) (`ahspPriceResolver.resolvePrice(item, existingRab, catalog)`).
- **Project Price Engine:** [projectPriceEngine.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/pricing/projectPriceEngine.ts#L147-L210) (`getProjectPrice`, `setProjectPrice`).
- **Priority Ladder:** Project Overrides → Project Specific Quotes → Official PUPR 2026 / Regional Price Database.

### Q9: Perhitungan total harga dilakukan oleh service mana?
- **Engine:** [SafeDecimalEngine.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/safeDecimalEngine.ts) via [centralDeterministicCostEngine.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/cost/centralDeterministicCostEngine.ts).
- **Method:** `SafeDecimalEngine.safeMultiply(quantity, unitPrice)` and `SafeDecimalEngine.safeAdd(...)`.
- **Zero AI Math Policy:** Strict prohibition of LLM arithmetic.

### Q10: Hasil RAB disimpan ke mana? (tabel/localStorage/state?)
- **Pipeline Active State:** `DedRabPipeline.getInstance().getActiveResult(projectId)` in memory.
- **Review Summary & 9-Sheet Workspace:** `dedSpreadsheetSync.generateWorkspaceSheets()` (in memory and localStorage `ezrab_ded_workspace_<id>`).
- **Official RAB Store:** [ProjectContext.tsx](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/context/ProjectContext.tsx) (`createRabItemDirect`) persisted to `localStorage` under `ezrab_project_<id>` and Supabase `public.rab_items`.

### Q11: Project context diambil dari mana? (apakah projectId benar-benar terbawa?)
- **Origin:** URL Route `/app/projects/:projectId/ai?mode=ded-rab`.
- **Context Provider:** `useProject()` (`currentProject.id`).
- **Fail-Closed Isolation:** `DedRabPipeline.execute()` verifies `if (!projectId || !projectId.trim()) throw new Error('Project ID is strictly required')`.
- **Tool Registry:** `ruleEngine.validateProjectIsolation()` rejects any request lacking an identical `projectId`.

### Q12: Project price override diambil dari mana?
- **Data Structure:** `projectPriceEngine.ts` maintains a private `Map<string, Map<string, ProjectPriceOverride>>` keyed by `projectId` and `materialId`.
- **Isolation:** Project B cannot inspect, mutate, or read prices from Project A.

### Q13: Source trace disimpan di mana? (apakah confidence, page, crop, text tersimpan?)
- **Type Definition:** `EvidenceRecord` in [types.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/types.ts).
- **Service:** [evidenceService.ts](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/evidence/evidenceService.ts).
- **WorkItem Fields:** Each `DedWorkItem` stores `sourcePages: number[]`, `evidenceIds: string[]`, `confidence: number`, and `provenanceDetail: AhspProvenance`.

### Q14: Error handling saat gagal parsing / missing price / missing qty bagaimana?
- **Missing Quantity:** `quantity: null`, `status: MISSING_DATA`, `validationStatus: MISSING_QUANTITY`.
- **Missing Price:** `unitPrice: null / 0`, `priceSource: PRICE_NOT_FOUND`, `validationStatus: MISSING_PRICE`.
- **Missing AHSP:** `ahspMatch: null`, `matchType: NOT_FOUND`, `validationStatus: MISSING_AHSP`.
- **Zero Items Found:** Pipeline fails with `NO_VERIFIED_ITEMS` without creating phantom items.
- **Fail-Closed Gate:** Only items with `validationStatus === 'READY'` and `rabEligible === true` can be applied to the active RAB.

### Q15: Apakah ada file duplicate / parallel DED pipeline yang berjalan bersamaan? (sebutkan semua)
- **Active Pipeline:** `src/ded-rab-v2/pipeline/dedRabPipeline.ts` (orchestrating the 11 phases in `src/ded-rab-v2/`).
- **Legacy Service:** `src/services/dedToRabPipelineService.ts` (v1 legacy implementation). Audit confirms `dedToRabPipelineService.ts` is only referenced in deprecated tests (`phase10DedToRab.test.ts`, `phase11AiFirstDedRab.test.ts`) and is NOT called by any active UI route or component.

---

## 3. Architecture Call Graph

```
USER UPLOAD (DedRabWorkflowView.tsx)
  │
  ├── 1. Ingestion: DocumentIngestionService (SHA-256 Hashing)
  ├── 2. Rendering: PdfPageService / ImagePageService
  ├── 3. Vision Extraction: ZyRouterClient -> DedVisionReader
  ├── 4. Semantic Filtering: SemanticClassifier (Rejects ROOM_LABEL, SYMBOL without schedule)
  ├── 5. Model Interpretation: DedInterpreter -> DedBuildingModel
  ├── 6. Deterministic QTO: EzrabCoreQto + SafeDecimalEngine
  ├── 7. Catalog Lookup: AhspMatcher (5,801 PUPR 2026 Items)
  ├── 8. Pricing Engine: AhspPriceResolver + ProjectPriceEngine
  ├── 8.5 Validation Gate: DedRabValidationGate (12-Gate Fail-Closed Eligibility)
  ├── 9. Review Workspace: DedRabReviewService ("HASIL PEMBACAAN DED")
  ├── 10. Sync: DedSpreadsheetSync (9-Tab Workspace)
  └── 11. Final Commit: ProjectContext.createRabItemDirect (READY items only)
```

---

## 4. Remediation Actions Executed

1. **SafeDecimalEngine Integration:** Enforced fixed-point precision multiplication and addition across `DedRabWorkflowView.tsx` (`totPrice`, `totMat`, `grandTotal`, and `createRabItemDirect`).
2. **15 Regression Criteria Verification:** Created and verified comprehensive test suite `src/test/dedRab15RegressionCriteria.test.ts` (15/15 passed).
3. **Automated E2E Browser Testing:** Executed automated Chrome CDP test against `http://localhost:3000/app/projects/PRJ-RUMAH-2LT-01/ai?mode=ded-rab` capturing visual proof `browser_proof_ded_rab_e2e.png`.
4. **Clean TypeScript Check:** `npx tsc --noEmit` verified with 0 errors.
