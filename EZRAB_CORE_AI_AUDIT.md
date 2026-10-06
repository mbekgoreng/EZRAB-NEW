# EZRAB CORE AI — MASTER SYSTEM & CAPABILITIES AUDIT
## Comprehensive Architectural Audit Across All AI Services & Engines

**Date:** 2026-09-30  
**Target:** `http://localhost:3000`  
**Auditor:** Antigravity AI Engine Architect  
**Status:** Audit Complete — Phase 1 & 2 Completed

---

## 1. Executive Summary

EZRAB contains rich, high-grade domain engines (e.g. `SafeDecimalEngine`, `priceResolver`, `CostDatabaseEngine`, `NationalCostDatabase`, `ahspMatcher`, `ezrabCoreQto`, `centralDeterministicCostEngine`, `LocalDocumentRepository`, `ProjectFinanceRepository`). However, the AI orchestration landscape previously suffered from fragmentation:
1. **Multiple AI Gateways / Routers:** `aiProviderRouter.ts`, `aiProviderEngine.ts`, `aiApiClient.ts`, and `coAssistantService.ts` handled AI requests independently with varying levels of tool routing and prompt structures.
2. **Fragmented UI Calling Points:**
   - `MagicAiSuperView.tsx` called `defaultAiProvider.chat()` directly.
   - `EzrabCoAssistantChatbox.tsx` called `coAssistantService.sendMessage()`.
   - `DedRabWorkflowView.tsx` invoked `dedAnalysisService` and `dedInterpreter` in isolation.
3. **Incomplete Tool Registry:** `AIToolRegistry` contained 9 basic tools (`getProjectContext`, `getRabTotal`, `getRabGroup`, `calculateQuantity`, `resolvePrice`, `searchAHSP`, `getFinanceSummary`, `getDocumentStatus`, `proposeAddRabItem`), but lacked standardized contracts for DED tools (`read_ded_document`, `extract_ded_facts`, `classify_ded_objects`), full QTO tools (`calculate_volume`, `calculate_area`), comprehensive AHSP tools (`validate_ahsp`, `get_ahsp_components`), Price tools (`update_project_price`, `resolve_project_price`), and Report/Export tools.
4. **Lack of Explicit Multi-Step Agent Loop:** The previous copilot in `aiOrchestrator.ts` performed single-pass pattern matching and single-tool execution rather than a recursive, plan-driven agent loop (`UNDERSTAND` $\rightarrow$ `PLAN` $\rightarrow$ `SELECT TOOL` $\rightarrow$ `ACT` $\rightarrow$ `OBSERVE` $\rightarrow$ `VALIDATE` $\rightarrow$ `DECIDE` $\rightarrow$ `SELF REVIEW` $\rightarrow$ `FINALIZE`).
5. **Absence of Unified Rule Engine & Stratified Knowledge Repository:** Safety rules were scattered across validation gates and regex checks rather than governed by a centralized Rule Engine.

---

## 2. Layer-by-Layer Inventory & Audit

### A. Model Gateway
- **Existing Files:** `src/services/aiProviderRegistry.ts`, `src/services/aiProviderRouter.ts`, `src/services/aiCostRouter.ts`, `src/services/aiProviderEngine.ts`.
- **Status:** **REAL & ROBUST**.
- **Capabilities:** Supports Gemini (5 keys), Atria (15 keys), InceptionLabs (15 keys), zrouter. Supports Text, Vision, PDF, Structured Output, OCR, Drawing, and Reasoning.
- **Action Required:** Retain and reuse `aiProviderRouter` as the canonical model gateway. Provide an `AIModelProvider` abstraction interface so the Core Orchestrator remains model-agnostic.

### B. Project Context
- **Existing Files:** `src/services/unifiedProjectContext.ts`, `src/services/aiProjectContext.ts`.
- **Status:** **EXCELLENT**.
- **Capabilities:** `buildUnifiedProjectContext` enforces strict project isolation (`ProjectIsolationError`), tenant boundary validation, and lazy-loaded domain context (`project`, `rab`, `ded`, `boq`, `ahsp`, `schedule`, `documents`).
- **Action Required:** Ensure EZRAB Core AI injects verified server-side project context for every task.

### C. Knowledge Repository
- **Existing Files:** `src/data/knowledgeBaseData.ts`, `src/data/houseTypeCatalog.ts`, `src/data/buildingTemplates/masterTemplateRegistry.ts`.
- **Status:** **PARTIAL / INFORMAL**.
- **Findings:** Contains humor datasets (200 questions) and informal topic answers, but lacks strict categorization (`OFFICIAL`, `SYSTEM`, `DOMAIN`, `PROJECT`, `USER`).
- **Action Required:** Create `src/services/ai/core/knowledgeRepository.ts` to formalize the 5 knowledge tiers and guarantee that generative knowledge is never confused with official AHSP standards.

### D. Construction Vocabulary & Synonyms
- **Existing Files:** `src/ded-rab-v2/semantic/semanticClassifier.ts` (room lists & symbols), `src/ded-rab-v2/interpretation/constructionNormalizer.ts`.
- **Status:** **PARTIAL**.
- **Findings:** Semantic classification exists for DED elements, but there is no centralized Indonesian construction vocabulary service handling synonym normalization (`pondasi batu kali` = `pasangan batu kali`), abbreviations (`KP` = `Kolom Praktis`), local terms, and unit aliases.
- **Action Required:** Create `src/services/ai/core/constructionVocabulary.ts` to serve all retrieval and intent normalization needs without overriding official database validation.

### E. Intent Engine
- **Existing Files:** Ad-hoc regex checks inside `aiOrchestrator.ts`, `coAssistantService.ts`, and `quickActionService.ts`.
- **Status:** **FRAGMENTED**.
- **Findings:** Intent detection was duplicated across multiple UI components using brittle regexes.
- **Action Required:** Create `src/services/ai/core/intentEngine.ts` with typed intents (`CREATE_RAB_FROM_DED`, `CALCULATE_QTO`, `SEARCH_AHSP`, `SEARCH_RESOURCE_PRICE`, `UPDATE_PROJECT_PRICE`, `CREATE_RAB_FROM_QTO`, `AUDIT_RAB`, `EXPLAIN_PRICE_STATUS`, `EXPLAIN_AHSP_MATCH`, `APPLY_TO_RAB`, etc.).

### F. Planning Engine
- **Existing Files:** None (tasks were executed in a single shot).
- **Status:** **MISSING**.
- **Action Required:** Implement `src/services/ai/core/planningEngine.ts` to generate formal, step-by-step execution plans (`PlanStep[]`) that support dynamic updating based on tool observations.

### G. Rule Engine
- **Existing Files:** `src/ded-rab-v2/validation/dedRabValidationGate.ts` (for DED items).
- **Status:** **SPECIALIZED / INCOMPLETE**.
- **Findings:** Validation rules were only applied at DED item import, not across the entire Core AI lifecycle.
- **Action Required:** Build `src/services/ai/core/ruleEngine.ts` enforcing the Golden Rules (AI cannot invent AHSP, AI cannot invent prices, AI cannot invent quantities, official AHSP requires database validation, version matching, fail-closed mutations, unknown $\neq$ 0).

### H. RAG Engine
- **Existing Files:** Keyword search in `knowledgeBaseData.ts` and `aiApiClient.ts`.
- **Status:** **BASIC**.
- **Action Required:** Implement `src/services/ai/core/ragEngine.ts` providing structured semantic retrieval of technical specifications and methodology while preventing RAG from ever supplying official AHSP coefficients or prices.

### I. Live Database Context
- **Existing Files:** `CostDatabaseEngine` (`src/data/nationalCostDatabase/masterRegistry.ts`), `priceResolver` (`src/engine/pricing/resolver/priceResolver.ts`), `SafeDecimalEngine` (`src/engine/safeDecimalEngine.ts`), `ProjectFinanceRepository`, `LocalDocumentRepository`.
- **Status:** **AUTHORITATIVE & LIVE**.
- **Findings:** All 5,801 official PUPR 2026 AHSP analyses, regional pricing, and SafeDecimal arithmetic are ready for direct consumption.

### J. Tool Registry
- **Existing Files:** `src/services/ai/tools/aiToolRegistry.ts` (9 tools).
- **Status:** **SOLID BASE, NEEDS EXPANSION**.
- **Findings:** The architecture (3-tier permissions, validation schema, provenance) is clean, but requires expansion to cover all 10 tool categories requested in Section 15.
- **Action Required:** Expand `aiToolRegistry.ts` to register all standard tools across Project, DED, QTO, AHSP, Resource, Price, RAB, Calculation, Report, and Export.

### K. Function Calling & Tool Contract
- **Existing Files:** `src/services/ai/tools/aiToolTypes.ts`.
- **Status:** **EXCELLENT**.
- **Action Required:** Retain `AIToolDefinition`, `AIToolSchema`, `AIToolExecutionContext`, and `AIToolExecutionResponse`.

### L. Agent Loop
- **Existing Files:** Single-pass execution in `aiOrchestrator.ts`.
- **Status:** **NEEDS ELEVATION**.
- **Action Required:** Implement `src/services/ai/core/agentLoop.ts` supporting recursive multi-step execution, observation handling, replanning, and loop guard limits (`maxSteps`, `maxRetries`, `timeout`, `toolBudget`).

### M. Task State & Memory
- **Existing Files:** `src/services/ai/conversation/unifiedConversationStore.ts` (conversation messages only).
- **Status:** **CONVERSATION ONLY**.
- **Findings:** Stores chat messages but does not maintain structured multi-step task state (`ded_analyzed`, `qto_completed`, `accepted_candidates`, `rejected_candidates`).
- **Action Required:** Implement `src/services/ai/core/taskState.ts` for task lifecycle and decision memory.

### N. Self-Review & Automated Audit
- **Existing Files:** `src/ded-rab-v2/validation/dedRabValidationGate.ts`.
- **Status:** **DED-ONLY**.
- **Action Required:** Build `src/services/ai/core/selfReviewEngine.ts` to audit complete RAB estimates (missing AHSP, missing QTO, missing prices, duplicates, version mismatches, arithmetic consistency) with self-correcting retry logic.

### O. AI Evaluation Suite
- **Existing Files:** `src/test/phaseC_copilotOrchestration.test.ts` (Phase C copilot tests).
- **Status:** **EXCELLENT PRECEDENT**.
- **Action Required:** Create `src/test/ezrabCoreAiEvaluation.test.ts` implementing all 15 Golden Tasks mandated in Section 42.

---

## 3. Consolidation & Deprecation Strategy

| Component | Current State | Target Core AI Role | Action |
| :--- | :--- | :--- | :--- |
| `aiOrchestrator.ts` | Phase C Copilot Orchestrator | Base for `EZRAB Core AI` | Elevate into Master Core AI Orchestrator |
| `coAssistantService.ts` | Standalone chat service | Legacy wrapper | Route through Core AI |
| `MagicAiSuperView.tsx` | Calls `defaultAiProvider` directly | UI frontend | Route user queries through Core AI |
| `DedRabWorkflowView.tsx` | Calls `dedAnalysisService` directly | UI frontend | Trigger Core AI DED tools |
| `aiToolRegistry.ts` | 9 tools | 25+ Canonical Tools | Expand to complete 10 tool groups |

---

## 4. Conclusion & Next Implementation Steps

The foundation of EZRAB is strong. The refactor will unify all existing capabilities under `src/services/ai/core/` and expand `aiToolRegistry.ts` so that **EZRAB CORE AI becomes the single central brain** while deterministic engines remain the sole source of truth for math, AHSP codes, prices, and quantities.
