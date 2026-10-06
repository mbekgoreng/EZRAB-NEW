# PHASE 5 — VISION AI DED EXTRACTION: PRE-IMPLEMENTATION AUDIT
**Date:** 14 September 2026  
**Auditor:** Principal AI Software Architect, Vision AI Specialist, Construction Estimator, QA & Security Engineer  
**Status:** **AUDIT COMPLETE — READY FOR ARCHITECTURE REVIEW**  

---

## 1. Audit Objective & Non-Negotiable Rules

Tujuan utama audit ini adalah mengevaluasi kesiapan arsitektur sistem EZRAB untuk mengimplementasikan **Phase 5: Vision AI DED (Detail Engineering Design) Extraction**.

### Core Safety Invariants
1. **Zero Hallucinated RAB:** Vision AI / LLM **TIDAK BOLEH** menjadi sumber final volume RAB, harga satuan, AHSP, atau total biaya proyek. LLM hanya bertugas membaca, menginterpretasi visual dokumen gambar teknik/DED, dan mengusulkan parameter terstruktur.
2. **Deterministic Computation Boundary:** Perhitungan volume dan RAB final wajib dieksekusi oleh `parametricVolumeEngine` (Phase 2–3) setelah parameter disetujui (Human-in-the-loop).
3. **No Silent Defaults:** Dimensi yang tidak terbaca atau buram wajib ditandai `UNKNOWN` / `null`, bukan diisi nilai asumsi secara diam-diam.
4. **Mandatory Provenance & Confidence:** Setiap entitas hasil ekstraksi wajib memiliki `confidence score`, nomor halaman referensi (`sourcePage`), koordinat bounding box visual, dan extraction method.
5. **Conflict Explicit Handling:** Jika terdapat perbedaan dimensi antara denah arsitektur, gambar potongan, tampak, dan detail penulangan struktur, sistem wajib menetapkan status `CONFLICT` dan meminta verifikasi pengguna.

---

## 2. Audit Arsitektur EZRAB Saat Ini

Berdasarkan inspeksi aktual source code:

| Komponen | File Aktual | Status Saat Ini | Rencana Reuse / Gap untuk Phase 5 | Risiko |
|---|---|---|---|---|
| **File Intake & Excel Import** | `src/components/import/IntelligentExcelImportModal.tsx` | Production UI | Reuse modal layout & progress bar. **GAP:** Belum mendukung render visualizer canvas PDF DED per halaman. | Menengah |
| **Model Adapter & Multimodal** | `server/providers/unifiedModelAdapter.ts`, `server/providers/modelAdapter.ts` | Production Engine | Sudah memiliki routing multimodal & `supportsVision` detection. **GAP:** Perlu parser payload vision base64/image buffer terstandarisasi. | Rendah |
| **AI Orchestrator** | `server/orchestrator/aiOrchestrator.ts` | Production Core | Mengelola intent classification, vocabulary mapping, dan context routing. **GAP:** Perlu intent handler baru `EXTRACT_DED_DOCUMENT`. | Rendah |
| **Durable Context & Auth** | `server/services/officialProjectContext.ts`, `server/auth/` | Production Auth | Verifikasi kepemilikan workspace & project role (Estimator, SuperAdmin). 100% reusable. | Nol |
| **Subscription & Quota** | `server/middleware/subscriptionCheck.ts` | Production Guard | Enforce credit consumption per ekstraksi halaman DED. 100% reusable. | Nol |
| **Master Building Templates** | `src/data/buildingTemplates/masterTemplateRegistry.ts` | Phase 2 Core | Menampung 7 Master Building Templates. 100% reusable sebagai target parameter matching. | Nol |
| **Parametric Volume Engine** | `src/engine/parametricVolumeEngine/parametricVolumeEngine.ts` | Phase 3 Core | Menghitung volume, quantity, dan trace formula dari parameter tervalidasi. 100% reusable. | Nol |
| **3D Parametric Viewer** | `src/viewer3d/` | Phase 4 Core | Menampilkan model 3D hasil ekstraksi parameter yang telah berstatus `APPROVED`. 100% reusable. | Nol |
| **Audit Logging & Security** | `server/services/extendedDataServices.ts` | Production DB | Menyimpan immutable audit trail per aksi write dan ekstraksi. 100% reusable. | Nol |

---

## 3. Identifikasi Gap & Kebutuhan Baru

1. **PDF Rendering to Images (Page-by-Page):** Kebanyakan model Vision AI (Ollama LLaVA, OpenAI Vision) bekerja paling optimal pada input citra raster (PNG/JPEG). Dibutuhkan headless PDF rasterizer engine (e.g. `pdfjs-dist` atau canvas renderer) untuk mengonversi dokumen DED multi-halaman menjadi resolusi tinggi.
2. **Drawing Classifier (Denah vs Potongan vs Detail):** Engine klasifikasi jenis gambar teknik otomatis untuk menentukan strategi ekstraksi parameter (misal: Denah mengekstrak dimensi ruang, Potongan mengekstrak elevasi lantai dan tinggi dinding, Detail mengekstrak dimensi penampang sloof/kolom).
3. **Cross-Page Dimensional Harmonizer & Conflict Detector:** Algoritma pembanding dimensi lintas halaman untuk mendeteksi inkonsistensi sebelum diserahkan ke pengguna.
4. **Interactive Human Review Canvas Component:** Antarmuka UI yang menyorot area dokumen DED (bounding box) dan menampilkan nilai yang diekstrak secara berdampingan untuk diverifikasi/diedit pengguna.

---

## 4. Kesimpulan Audit Awal

Arsitektur fondasi EZRAB (Phase 1–4) berada dalam kondisi sangat kokoh, modular, dan bersih untuk diintegrasikan dengan pipeline Vision AI. Pemisahan antara layer persepsi visual (Vision AI/LLM) dan layer komputasi biaya deterministik (`parametricVolumeEngine`) menjamin integritas estimasi RAB tanpa risiko halusinasi.
