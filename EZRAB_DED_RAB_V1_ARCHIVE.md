# EZRAB DED → RAB V1 FORENSIC ARCHIVE & DECOMMISSION REPORT
**Version:** 1.0 (Archival & Decommissioning)  
**Date:** 2026-10-01  
**Scope:** Forensic inventory of all legacy and transitional DED → RAB orchestration, services, prompts, and schemas before rebuilding V2.0 from First Principles.

---

## 1. Overview & Decommissioning Rationale

The previous DED → RAB implementations (Phase 10 legacy pipeline and early transitional v1 orchestration) suffered from fundamental conceptual issues:
1. **Premature RAB Generation**: Attempting to generate RAB rows directly from isolated page Vision calls without first completely understanding the full drawing set.
2. **Missing Work Items**: Skipping unstated but structurally and architecturally required works, or omitting items on non-denah pages.
3. **Missing / Fabricated Quantities**: Defaulting missing dimensions or quantities to `1` or `0`, or silently dropping unmeasured items.
4. **Keyword-Only AHSP Matching & Unit Mismatch**: Selecting AHSP solely based on text overlap (e.g. matching volume `m³` to linear `m'` or matching structural sloof to practical lintel).
5. **False "READY" Status**: Prematurely marking incomplete items as ready before resolving cross-page dimensions.

Per directive:
- **Shared EZRAB infrastructure is PRESERVED** (SafeDecimalEngine, Official AHSP Repository PUPR 2026, National Cost Database, Price Resolver, Price Engine, Spreadsheet Engine, Auth, Projects, Chatbox).
- **All DED-specific orchestration is DECOMMISSIONED** and rebuilt cleanly under a First-Principles Document Understanding architecture.

---

## 2. Forensic Inventory of Legacy DED → RAB Files

### A. Old Orchestration & Services (To Be Decommissioned / Replaced)
| File Path | Description | Action |
|---|---|---|
| `src/services/dedToRabPipelineService.ts` | Phase 10 2,000+ line monolithic legacy service with hardcoded stages and heuristic mappings | **DECOMMISSIONED** |
| `src/services/dedEvidenceStore.ts` | Legacy in-memory evidence store for Phase 10 | **DECOMMISSIONED** |
| `src/services/dedWorkItemStore.ts` | Legacy work item store for Phase 10 | **DECOMMISSIONED** |
| `src/services/dedQtoCalculationEngine.ts` | Legacy QTO calculation engine with fallback assumptions | **DECOMMISSIONED** |
| `src/services/dedAhspMatchingEngine.ts` | Legacy keyword matcher with synthetic AI-CUSTOM fallbacks | **DECOMMISSIONED** |
| `src/domain/ded/dedPipelineTypes.ts` | Legacy Phase 10 pipeline type definitions | **ARCHIVED / SUPERSEDED** |
| `src/ded-rab-v2/pipeline/dedRabPipeline.ts` | Transitional v1 master orchestrator | **REBUILT (V2.0 First Principles)** |
| `src/ded-rab-v2/ai/dedAnalysisService.ts` | Transitional multi-pass AI caller | **REBUILT (Page-by-Page + Synthesis)** |
| `src/ded-rab-v2/ai/dedVisionReader.ts` | Single/two-pass vision prompt script | **REBUILT (Observation Model)** |
| `src/ded-rab-v2/interpretation/dedInterpreter.ts` | Direct work item extractor | **REBUILT (Raw Extraction & Inventory)** |
| `src/ded-rab-v2/interpretation/constructionCompletenessEngine.ts` | Transitional heuristic completeness engine | **SUPERSEDED by Inventory Completeness** |
| `src/ded-rab-v2/interpretation/evidenceResolver.ts` | Basic cross-page dimension linker | **REBUILT (Cross-Page Correlation)** |

### B. Shared Infrastructure (STRICTLY PRESERVED & REUSED)
| File Path | Component | Status |
|---|---|---|
| `src/engine/safeDecimalEngine.ts` | SafeDecimalEngine (Zero floating point errors) | **PRESERVED** |
| `src/data/nationalCostDatabase/officialAhspRepository.ts` | Official PUPR 2026 AHSP Repository (Single source of truth) | **PRESERVED** |
| `src/data/nationalCostDatabase/masterRegistry.ts` | Canonical AHSP registry (SDA, Bina Marga, Cipta Karya, SMKK) | **PRESERVED** |
| `src/data/priceDatabase2026/resolver.ts` | Central 2026 Price Ladder Resolver | **PRESERVED** |
| `src/services/aiPriceSearchService.ts` | External Real-Time AI Price Discovery Engine | **PRESERVED** |
| `server/providers/multiProvider/adapters.ts` | Multi-Provider Server Key Pool (Gemini, ZyRouter, Local AI) | **PRESERVED** |
| `src/context/ProjectContext.tsx` | Project & Workspace State Management | **PRESERVED** |
| `src/types/index.ts` | Core RABItem, Project, AHSPItem type models | **PRESERVED** |

### C. Old Routes & UI Views
| File Path | Description | Integration Note |
|---|---|---|
| `src/routing/routes.ts` | `/magic-ai?mode=ded-rab` route | Points exclusively to new V2.0 workflow |
| `src/components/document/DedRabWorkflowView.tsx` | UI Workflow View | Updated to reflect the 12-Step Pipeline |
| `src/ded-rab-v2/review/DedRabV2ReviewView.tsx` | Interactive Review Workspace | Connected to new V2.0 inventory & audit |

### D. Old Schemas & Prompts Archived
- Legacy single-pass prompt: Prompted model to return ready RAB rows in one prompt, causing hallucinated codes and dropped rooms.
- Old synthetic fallback schema: `AI-CUSTOM-XXXX` schema that bypassed official PUPR 2026 catalogs.
- Old heuristic units: Automatically assuming `m³` equals `m'` without structural verification.

---

## 3. The 12-Step First-Principles Pipeline Architecture

The new V2.0 architecture strictly enforces the 12 linear steps without skipping:

```
[STEP 1] DOCUMENT INGESTION
   ↓ (PDF/scanned/image -> pagesExpected, page images, OCR, page metadata)
[STEP 2] PAGE-BY-PAGE VISUAL READING
   ↓ (Track pagesExpected vs pagesProcessed. Every single page must be visually read)
[STEP 3] DOCUMENT UNDERSTANDING
   ↓ (Structured PageObservationModel: text, dimensions, rooms, elements, schedules, notes)
[STEP 4] RAW DED EXTRACTION
   ↓ (Document Synthesis: Combine multi-page observations, cross-page references)
[STEP 5] DED INVENTORY
   ↓ (Comprehensive raw inventory: "WHAT EXISTS IN THE DED?" - No AHSP, no price, no fake 0)
[STEP 6] QUANTITY RESOLUTION
   ↓ (Formula, inputs, units, evidence. If unestablished -> NULL & status: MISSING)
[STEP 7] DED COMPLETENESS AUDIT
   ↓ (DED Completeness Report: Pages processed, items found, quantity resolved/missing)
[STEP 8] AHSP MATCHING
   ↓ (Match work type, method, spec, material, dimensions, unit against PUPR 2026 DB)
[STEP 9] PRICE RESOLUTION
   ↓ (Project -> User -> Regional -> Official -> External Search. Zero fake price)
[STEP 10] RAB GENERATION
   ↓ (READY items with total price + NEEDS REVIEW items visible with missing qty)
[STEP 11] FINAL VALIDATION
   ↓ (10 Gate Validation before approval)
[STEP 12] SPREADSHEET SYNC
   ↓ (Synchronize to 9-tab Workspace with 100% provenance)
```

---

## 4. Archival Status
- Legacy orchestration files marked as deprecated and removed from active execution paths.
- Active pipeline completely governed by `src/ded-rab-v2/` First Principles Engine.
