# PHASE 5 — VISION AI DED EXTRACTION: ARCHITECTURE DESIGN
**Date:** 14 September 2026  
**Status:** **APPROVED DESIGN ARTIFACT**  

---

## 1. High-Level Architectural Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                      EZRAB CLIENT APPLICATION                                     |
|  +---------------------------+   +-------------------------------+   +-------------------------+  |
|  | DED Document Upload Modal |-->| Interactive Review Viewport   |-->| 3D Parametric Viewer    |  |
|  | (PDF, DWG-Raster, PNG/JPG)|   | (Side-by-side Evidence & BBox)|   | (Phase 4 Visualization) |  |
|  +---------------------------+   +-------------------------------+   +-------------------------+  |
+-------------------------------------------------|-------------------------------------------------+
                                                  | Multi-Part Form Data / Base64 Payload
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      BACKEND PIPELINE (PHASE 5)                                   |
|                                                                                                   |
|  [Stage 1: File Intake & Validation]                                                              |
|   - MIME Type verification, Magic byte inspection, 50MB file size limits                          |
|   - SHA-256 Idempotency hash computation                                                          |
|                                                                                                   |
|  [Stage 2: PDF Page Rasterizer & Preprocessing]                                                   |
|   - Multi-page PDF splitting -> High-Res PNG (300 DPI)                                            |
|   - Grayscale conversion, contrast stretching, deskewing & rotation alignment                     |
|                                                                                                   |
|  [Stage 3: Vision Model Analysis & OCR Extraction]                                                |
|   - Multimodal prompt to Vision Adapter (LLaVA / Qwen-VL / GPT-4o / Mock)                         |
|   - Structured JSON Schema enforcement (Denah, Tampak, Potongan, Detail)                          |
|                                                                                                   |
|  [Stage 4: Post-Processing & Normalization]                                                       |
|   - Unit normalization (mm, cm, inch -> standard METER)                                           |
|   - Scale factor multiplier parsing (1:100, 1:50, 1:200)                                          |
|                                                                                                   |
|  [Stage 5: Cross-Page Reconciliation & Conflict Detection]                                        |
|   - Footprint reconciliation (Denah vs Potongan)                                                  |
|   - Column grid consistency check                                                                 |
|   - Flag CONFLICT on discrepancy > 2% without silent resolution                                   |
|                                                                                                   |
|  [Stage 6: Human Review & Parameter Approval Gate]                                                |
|   - Status: NEEDS_REVIEW -> User verifies & edits values -> Status: APPROVED                      |
+-------------------------------------------------|-------------------------------------------------+
                                                  | Approved Parameters Record
                                                  v
+---------------------------------------------------------------------------------------------------+
|                            DETERMINISTIC ENGINES (PHASE 2, 3, & 4)                                |
|                                                                                                   |
|  +-------------------------------+   +------------------------------+   +----------------------+  |
|  | Master Building Template      |-->| Parametric Volume Engine     |-->| RAB Draft Generation |  |
|  | (Template Matching by Type)   |   | (Official AHSP Quantities)   |   | (Review Required)    |  |
|  +-------------------------------+   +------------------------------+   +----------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Pipeline Stages & Strict Error Contracts

### Stage 1: File Intake & Validation
- **Input:** Raw File Buffer, MIME type, `workspaceId`, `projectId`.
- **Validation:** File size $\le 50\text{MB}$, allowed types (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`).
- **Error Contract:** `INVALID_FILE_TYPE`, `FILE_SIZE_EXCEEDED`, `UNAUTHORIZED_WORKSPACE`.

### Stage 2: Page Rasterization & Preprocessing
- **Input:** Validated PDF file.
- **Output:** Array of Page Images (`pageIndex`, `imageBuffer`, `resolutionDpi`).
- **Error Contract:** `PDF_DECRYPTION_PASSWORD_REQUIRED`, `PDF_CORRUPTED_STREAM`.

### Stage 3: Vision Model Analysis
- **Input:** Preprocessed Page Image + Categorized Extraction Prompt.
- **Output:** Raw Structured JSON matching `DedExtractionResultSchema`.
- **Error Contract:** `VISION_PROVIDER_TIMEOUT`, `VISION_PROVIDER_UNAVAILABLE`, `RATE_LIMIT_EXCEEDED`.

### Stage 4: Normalization & Scale Parsing
- **Input:** Raw Extracted Entities.
- **Output:** Normalized Entities with standard SI units (meters, $m^2$, $m^3$).
- **Rules:** If unit is unspecified and numbers $> 100$, detect as millimeters ($mm$).

### Stage 5: Conflict Detection
- **Input:** All extracted entities across all pages in the document.
- **Output:** Set of `ConflictRecord` containing conflicting values, affected pages, and discrepancy percentage.

### Stage 6: Human Review Gate
- **Status Progression:** `EXTRACTED` $\to$ `NORMALIZED` $\to$ `VALIDATED` $\to$ `NEEDS_REVIEW` $\to$ `APPROVED` / `REJECTED`.
- **Invariant:** No RAB generation or 3D geometry modification is allowed until `status === 'APPROVED'`.
