# EZRAB — DED → RAB RESET FORENSIC AUDIT REPORT
**Version:** 1.0  
**Mode:** AI-First  
**Scope:** ONLY DED → RAB  
**Baseline Status:** PRE-RESET FORENSIC & MAPPING  
**Generated At:** 2026-10-01  

---

## 1. Executive Summary
Laporan forensik ini dibuat sebagai langkah wajib sebelum melakukan reset total dan pembangunan ulang (clean reset & rebuild) alur **DED → RAB AI** pada EZRAB.

Semua modul inti di luar alur DED → RAB (Database AHSP 2026, Database Material/Resource Nasional, SafeDecimalEngine, Price Engine umum, Spreadsheet RAB, Export Excel/PDF, Authentication, Supabase, QTO Calculators, Project Management) **DIJAMIN UTUH DAN TIDAK DISENTUH**.

---

## 2. Production Entry Point
Alur pengguna saat ini beroperasi melalui alur:
1. **Routing Entry:**
   - URL: `/magic-ai?mode=ded-rab` dan `/projects/:projectId/ai?mode=ded-rab` di [`src/routing/routes.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/routing/routes.ts)
2. **Top-level Container UI:**
   - [`src/components/magic-ai/MagicAiSuperView.tsx`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/components/magic-ai/MagicAiSuperView.tsx)
3. **Dedicated DED Workflow View:**
   - [`src/components/document/DedRabWorkflowView.tsx`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/components/document/DedRabWorkflowView.tsx)
4. **Pipeline Orchestration Engine:**
   - [`src/ded-rab-v2/pipeline/dedRabPipeline.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/pipeline/dedRabPipeline.ts) (Metode `dedRabPipeline.execute(...)`)

---

## 3. Seluruh File Terkait DED → RAB

### A. DED V2 Modular Pipeline (`src/ded-rab-v2/`)
| File Path | Fungsi Saat Ini | Status Rencana |
|---|---|---|
| [`src/ded-rab-v2/types.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/types.ts) | Definisi tipe data DED, Canonical Work Item, Evidence, Geometri | **Dipertahankan & Diperkuat** (Canonical schema) |
| [`src/ded-rab-v2/index.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/index.ts) | Export barrel untuk modul DED V2 | **Dipertahankan & Diupdate** |
| [`src/ded-rab-v2/ai/dedVisionReader.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/dedVisionReader.ts) | AI Multimodal Vision & OCR Reader | **Refactor ke Clean AI-First Master Prompt** |
| [`src/ded-rab-v2/ai/dedAnalysisService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/dedAnalysisService.ts) | Multi-pass analysis & Page batching orchestrator | **Dipertahankan & Dikalibrasi AI-First** |
| [`src/ded-rab-v2/ai/zyrouterClient.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/zyrouterClient.ts) | Multi-provider client (Gemini / VLEEE / ZyRouter) | **Dipertahankan** |
| [`src/ded-rab-v2/ai/dedPageCache.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/dedPageCache.ts) | Ingestion SHA-256 caching | **Dipertahankan** |
| [`src/ded-rab-v2/ai/aiConcurrencyQueue.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ai/aiConcurrencyQueue.ts) | Queue concurrency limit untuk request AI vision | **Dipertahankan** |
| [`src/ded-rab-v2/config/dedModeConfig.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/config/dedModeConfig.ts) | Konfigurasi Model & Reasoning level (FAST / STANDARD / DETAIL) | **Dipertahankan** |
| [`src/ded-rab-v2/ingestion/documentIngestionService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ingestion/documentIngestionService.ts) | Ingestion PDF & Image, hashing SHA-256 | **Dipertahankan** |
| [`src/ded-rab-v2/ingestion/pdfPageService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ingestion/pdfPageService.ts) | PDF rendering ke Canvas/Image (PDF.js) | **Dipertahankan** |
| [`src/ded-rab-v2/ingestion/imagePageService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ingestion/imagePageService.ts) | Image metadata & pixel validator | **Dipertahankan** |
| [`src/ded-rab-v2/evidence/evidenceService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/evidence/evidenceService.ts) | Penyimpanan & retrieval evidence visual/tekstual per item | **Dipertahankan** |
| [`src/ded-rab-v2/interpretation/dedInterpreter.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/interpretation/dedInterpreter.ts) | Membangun DedBuildingModel & Canonical Work Items | **Refactor ke AI Reasoning Baseline** |
| [`src/ded-rab-v2/interpretation/constructionNormalizer.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/interpretation/constructionNormalizer.ts) | Normalisasi terminologi & spesifikasi konstruksi | **Dipertahankan** |
| [`src/ded-rab-v2/interpretation/constructionCompletenessEngine.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/interpretation/constructionCompletenessEngine.ts) | Derivasi kelengkapan konstruksi | **Refactor agar tidak mengarang item** |
| [`src/ded-rab-v2/interpretation/evidenceResolver.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/interpretation/evidenceResolver.ts) | Resolusi korelasi lintas halaman | **Dipertahankan** |
| [`src/ded-rab-v2/qto/ezrabCoreQto.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/qto/ezrabCoreQto.ts) | Perhitungan volume matematis deterministik SafeDecimalEngine | **Dipertahankan (Rule: Tanpa default volume 1)** |
| [`src/ded-rab-v2/ahsp/ahspMatcher.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ahsp/ahspMatcher.ts) | Pencocokan pekerjaan dengan AHSP resmi PUPR 2026 | **Refactor: Zero AI-Custom & Fail-Closed** |
| [`src/ded-rab-v2/ahsp/ahspPriceResolver.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/ahsp/ahspPriceResolver.ts) | Resolusi harga 5 tier termasuk External Price Search | **Diperkuat: Support External Price Evidence** |
| [`src/ded-rab-v2/semantic/semanticClassifier.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/semantic/semanticClassifier.ts) | Klasifikasi fakta arsitektural/struktural/ruang | **Dipertahankan** |
| [`src/ded-rab-v2/validation/dedRabValidationGate.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/validation/dedRabValidationGate.ts) | 12 Gerbang validasi kualitas DED → RAB | **Dipertahankan & Disesuaikan Fail-Closed** |
| [`src/ded-rab-v2/review/dedRabReviewService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/review/dedRabReviewService.ts) | Rekapitulasi metrik review dan coverage | **Dipertahankan** |
| [`src/ded-rab-v2/review/DedRabV2ReviewView.tsx`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/review/DedRabV2ReviewView.tsx) | UI Review interaktif hasil DED sebelum apply ke RAB | **Dipertahankan** |
| [`src/ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts) | Penulisan data ke Spreadsheet RAB 9 Tab | **Dipertahankan** |
| [`src/ded-rab-v2/pipeline/dedRabPipeline.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/pipeline/dedRabPipeline.ts) | Master Orchestrator | **Refactor ke Alur Bersih AI-First** |

---

### B. Legacy Pipeline Files (`src/services/`)
File-file lama berikut merupakan peninggalan Phase 10 monolitik yang sudah deprecated dan sering memicu fallback/hardcoded mapping:
- [`src/services/dedToRabPipelineService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/services/dedToRabPipelineService.ts) (79KB) — **Refactor/Purge Fallback:** Hapus semua fake `AI-CUSTOM-XXXX` code generator dan fallback quantity 1.
- [`src/services/dedAhspMatchingEngine.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/services/dedAhspMatchingEngine.ts) — **Deprecated:** Digantikan oleh `src/ded-rab-v2/ahsp/ahspMatcher.ts`.
- [`src/services/dedQtoCalculationEngine.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/services/dedQtoCalculationEngine.ts) — **Deprecated:** Digantikan oleh `src/ded-rab-v2/qto/ezrabCoreQto.ts`.
- [`src/services/dedEvidenceStore.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/services/dedEvidenceStore.ts) — **Deprecated:** Digantikan oleh `src/ded-rab-v2/evidence/evidenceService.ts`.
- [`src/services/dedWorkItemStore.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/services/dedWorkItemStore.ts) — **Deprecated:** Digantikan oleh state storage DED V2.

---

## 4. Dependencies & Master Sources of Truth

| Domain | Source of Truth di EZRAB | Keterangan |
|---|---|---|
| **Official AHSP** | [`src/data/nationalCostDatabase/masterRegistry.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/data/nationalCostDatabase/masterRegistry.ts) | Master Katalog AHSP PUPR 2026 (Cipta Karya, Bina Marga, SDA). Tidak boleh di-bypass. |
| **Material / Resource** | [`src/domain/material/materialDatabaseService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/domain/material/materialDatabaseService.ts) & [`src/data/priceDatabase2026/resolver.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/data/priceDatabase2026/resolver.ts) | Master database material & harga regional 2026. |
| **Price Engine** | [`src/engine/pricing/resolver/priceResolver.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/pricing/resolver/priceResolver.ts) & [`src/services/aiPriceSearchService.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/services/aiPriceSearchService.ts) | Hirarki 5 level harga: Project → User → Regional → Official Database → External Price Search. |
| **Calculation Engine** | [`src/engine/safeDecimalEngine.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/safeDecimalEngine.ts) | Arithmetic akurat tanpa floating-point roundoff error. |
| **AI Providers** | ZyRouter / VLEEE / Google Gemini (via Backend Proxy `/api/ai/multi-provider/execute`) | Multi-provider AI router terkonfigurasi. |
| **Spreadsheet Sync** | [`src/ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts) | Menghasilkan baris RAB berstruktur (No, Kode AHSP, Uraian, Satuan, Volume, Harga, Jumlah, Status). |

---

## 5. Dependency Graph
```mermaid
graph TD
    Upload[User Upload DED PDF/Image] --> Ingest[Document Ingestion & SHA-256]
    Ingest --> Render[PDF/Image Page Rendering]
    Render --> AIReader[EZRAB DED->RAB AI Agent]
    
    subgraph "Reasoning Layer (AI-First)"
        AIReader --> DocRead[Read All Pages, Schedules, Details]
        DocRead --> CrossPage[Cross-Page Context Aggregation]
        DocRead --> Identify[Identify All Real Work Items]
        Identify --> Canonical[Construct Canonical Work Items]
    end
    
    subgraph "EZRAB Deterministic Tools & Sources of Truth"
        Canonical --> QTO[QTO Engine / Dimension Calculator]
        Canonical --> AHSPMatch[AHSP Database Search (PUPR 2026)]
        AHSPMatch --> AHSPDetail[Decompose Resources / Components]
        AHSPDetail --> PriceEngine[Price Engine Ladder]
        PriceEngine -->|If not in EZRAB| ExtSearch[External Price Search with Source Evidence]
        QTO --> SafeCalc[SafeDecimalEngine Calculation]
        PriceEngine --> SafeCalc
    end
    
    SafeCalc --> ValidationGate[12 Strict Validation Gates]
    ValidationGate --> Review[DED Analysis Summary / Review Workspace]
    Review -->|User Confirm| Spreadsheet[Spreadsheet RAB EZRAB]
```

---

## 6. Forensic Conclusion & Stop-Check
- **Scope Verification:** Perubahan DED → RAB terisolasi di `src/ded-rab-v2/`, tool registry DED, dan interface viewer DED di UI.
- **Modul di Luar DED:** Tidak ada modul lain yang dirusak atau terganggu.
- **Rekomendasi Eksekusi:** Lanjutkan ke pembuatan dokumen Arsitektur (`EZRAB_DED_RAB_AI_ARCHITECTURE.md`), Master System Prompt (`EZRAB_DED_RAB_AI_PROMPT.md`), lalu implementasi clean AI-first pipeline dan eksekusi tes verifikasi DED nyata.
