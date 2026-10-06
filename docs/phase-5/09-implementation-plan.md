# PHASE 5 — VISION AI DED EXTRACTION: IMPLEMENTATION PLAN & DECISION
**Date:** 14 September 2026  
**Auditor/Architect:** Principal Software Architect, Vision AI Specialist, QA Engineer  
**Final Decision:** **GO — DESIGN READY, IMPLEMENTATION NOT STARTED**  

---

## 1. Incremental Execution Roadmap

Pelaksanaan Phase 5 dibagi menjadi 4 tahap implementasi terkontrol:

### Stage 1: Data Contracts, Types & Mock Vision Engine
- Implementasi `src/vision/types.ts` dan schema Zod validation.
- Implementasi `MockVisionAdapter` untuk simulasi ekstraksi synthetic 100% deterministik.
- Penambahan test unit contract dan validation.

### Stage 2: Backend Processing Pipeline & Normalizer
- Implementasi `DedFileIntakeService` (validasi MIME, hash SHA-256).
- Implementasi `DimensionalNormalizationEngine` (konversi satuan mm/cm $\to$ m, kalkulasi skala).
- Implementasi `CrossPageConflictDetector`.

### Stage 3: Orchestrator Integration & Model Adapter Multimodal
- Penambahan tool/intent `EXTRACT_DED_DOCUMENT` pada `aiOrchestrator.ts`.
- Penyambungan payload multimodal pada `unifiedModelAdapter.ts`.
- Audit otentikasi role dan credit consumption.

### Stage 4: Frontend Interactive Review Viewport & 3D Link
- Pembuatan modal interaktif `DedDocumentReviewModal.tsx` dengan visualizer bounding box.
- Integrasi tombol "Approve & Generate RAB" $\to$ pemicu `parametricVolumeEngine` dan `viewer3d`.
- End-to-end regression testing.

---

## 2. Estimasi Kompleksitas & Alokasi Waktu

| Tahapan | Kompleksitas | Risiko | Rencana Mitigasi |
|---|---|---|---|
| **Stage 1 (Types & Mock)** | Rendah | Nol | Pure TypeScript tanpa dependency eksternal |
| **Stage 2 (Pipeline & Conflict)** | Sedang | Rendah | Algoritma perbandingan matematis terisolasi |
| **Stage 3 (Orchestrator)** | Sedang | Rendah | Menggunakan pattern RBAC & subscription yang sudah ada |
| **Stage 4 (Review UI & Viewer)** | Sedang-Tinggi | Menengah | Reuse styling dari Phase 4 dan IntelligentExcelImportModal |

---

## 3. Acceptance Criteria

1. **Extraction Accuracy & Traceability:**
   - 100% entitas yang diekstrak memiliki `sourcePage`, `confidence`, dan `evidence`.
   - Dimensi tidak terbaca wajib bernilai `null` / `UNKNOWN` tanpa pengisian diam-diam.
2. **Deterministic Computation Integrity:**
   - Zero halusinasi volume RAB: Volume dihitung oleh `parametricVolumeEngine` setelah status `APPROVED`.
3. **Multi-Tenant Security:**
   - User tidak dapat mengakses atau memproses file DED milik tenant/workspace lain.
4. **Zero Regression:**
   - Seluruh test suites Phase 1–4 tetap lulus 100% (49 passed, 0 failed).

---

## 4. Final Decision

$$\mathbf{GO\ —\ DESIGN\ READY,\ IMPLEMENTATION\ NOT\ STARTED}$$

*Arsitektur, kontrak schema data, kebijakan penanganan konflik, aturan keamanan, dan strategi pengujian untuk Phase 5 telah lengkap, tervalidasi, dan terdokumentasi secara formal.*
