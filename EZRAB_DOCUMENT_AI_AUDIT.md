# EZRAB — AUDIT DOKUMEN AI & DOKUMEN PROYEK (PHASE A)

**Dokumen**: `EZRAB_DOCUMENT_AI_AUDIT.md`  
**Status**: COMPLETE (Read-Only Audit & Baseline Verification)  
**Tanggal**: 2026-09-26  
**Target Transformasi**: Modul Dokumen AI & Dokumen Proyek → **EZRAB PROJECT COPILOT**  

---

## 1. EXECUTIVE SUMMARY & BASELINE RESULTS

Audit menyeluruh telah dilaksanakan pada seluruh lapisan repository EZRAB (Routing, App Layout, Document Engine, Project Data, Context, AI Services, Exporters, dan Test Suites). 

### 1.1 Hasil Verifikasi Baseline (Sebelum Perubahan Kode)
1. **TypeScript Typecheck (`npx tsc --noEmit`)**:
   - Status: **0 Type Errors (PASSED)**
2. **Comprehensive Test Suite (`npm run test:all`)**:
   - `test:core`: PASSED
   - `test:calculator`: PASSED
   - `test:parity`: PASSED (23 Exact Pass)
   - `test:phase4`: PASSED
   - `test:phase5`: PASSED (167 Passed)
   - `test:phase6`: PASSED
   - `test:civil`: PASSED (97 Civil Calculators)
   - `test:ui`: PASSED
   - `test:phase4_1`: PASSED (59 Passed)
   - `test:phase4_3`: PASSED (Source Integration)
   - `test:phase4_4`: PASSED
   - `test:phase5_1`: PASSED (Completeness & Requirement Engine)
   - `test:phase5_2`: PASSED (Authoring UX)
   - `test:phase5_3`: PASSED (Project Documents UX)
   - `test:phase5_4`: PASSED (Export Quality)
   - `test:phase5_4_1`: PASSED (Artifact Verification: 53 Passed)
   - `test:phase5_5`: PASSED (Job Context & Template: 91 Passed)
   - **Total Overall**: **100% Tests Passed**
3. **Dedicated Dokumen AI Test (`npx tsx src/test/dokumenAiModule.test.ts`)**:
   - Status: 13 PASSED, 1 FAILED (Quick Action 5: "Buatkan metode pelaksanaan pekerjaan berdasarkan RAB dan Schedule" terbentur evaluasi parser tenaga kerja `isLaborQuery` pada `p.includes('pekerja')` yang menangkap substring kata `pekerjaan`).

---

## 2. EXISTING ARCHITECTURE MAPPING

Alur pemrosesan data existing dari view hingga storage layer:

```text
Page / Route (/app/magic-ai?mode=dokumen-ai & /app/tender-documents)
  ↓
Component Layer
  ├── WorkspaceView (Root Workspace Router)
  ├── MagicAiSuperView (Monolith AI Super View - 218 KB)
  │     ├── Mode: 'chat'
  │     ├── Mode: 'ded-rab'
  │     └── Mode: 'dokumen-ai'
  ├── EzrabCoAssistantChatbox (Floating Co-Assistant Launcher)
  ├── EzrabAiAssistantFullView (Dead code / duplicate full view - 113 KB)
  ├── TenderDocumentsView (Dokumen Proyek Workspace - 48 KB)
  └── DocumentWorkspace (Detail Editor, Preview & Export - 88 KB)
        ├── CanonicalEditorPanel
        ├── TemplateSelectorPanel
        └── ProjectSourceDrawerModal
  ↓
State & Context Layer
  ├── ProjectContext (Project, WorkItems, QTO, RAB, Schedule, Kurva S)
  ├── aiProjectContext (buildReadOnlyProjectContext)
  ├── aiContextService (buildFullAIContext)
  └── aiDocumentIntelligence (buildAiDocumentContext, planProjectDocuments)
  ↓
Service & Engine Layer
  ├── coAssistantService (Central Co-Assistant orchestration)
  ├── aiApiClient (HTTP client with retry & fallbacks)
  ├── aiProviderEngine (Multi-provider, routing, mock/heuristic fallbacks)
  ├── Document Engine:
  │     ├── registry.ts (19 Canonical Document Definitions)
  │     ├── repository.ts (LocalDocumentRepository with localStorage)
  │     ├── requirementEngine.ts (Core/Conditional/Recommended evaluation)
  │     ├── completenessEngine.ts (Field & Dependency completeness scores)
  │     ├── templateEngine.ts (Variable resolution, Terbilang, formatRupiah)
  │     ├── validationEngine.ts (Validation gates before export)
  │     ├── consistencyEngine.ts (Cross-document consistency rules)
  │     ├── sourceChangeDetector.ts (Fingerprint hash & revision protection)
  │     ├── canonicalDocument.ts (Block-based document structure)
  │     ├── exportService.ts & packageExporter.ts (PDF, DOCX, XLSX, ZIP)
  │     └── integrations/ (ahsp, boq, rab, schedule, kurva-s, personnel, equipment, jsa, rkk)
  └── project-data/ (ProjectScopedEntity, ProjectDataRepository for personnel, equipment, jsa, rkk, ahsp)
  ↓
Persistence Layer
  ├── localStorage ('ezrab_documents_<projectId>', 'ezrab:project:<projectId>:<domain>')
  └── Supabase (Optional sync layer)
```

---

## 3. EXISTING FEATURES AUDIT TABLE

| Feature | Existing? | Location | Working? | Duplicate? | Reusable? | Catatan Audit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Document Registry (19 Docs)** | Ya | `src/document-engine/registry.ts` | Ya (100%) | Tidak | **Sangat Reusable** | Menampung 19 definisi dokumen resmi (offer-letter, boq, rab, ahsp, schedule, curve-s, rkk, jsa, dll.). |
| **Requirement Engine** | Ya | `src/document-engine/requirementEngine.ts` | Ya (100%) | Tidak | **Sangat Reusable** | Mengevaluasi status ketergantungan dokumen terhadap sumber RAB, Schedule, Kurva-S, HSE. |
| **Completeness Engine** | Ya | `src/document-engine/completenessEngine.ts` | Ya (100%) | Ya (parsial) | **Sangat Reusable** | Menghitung persentase kelengkapan field USER dan dependensi sumber data. |
| **Template Engine** | Ya | `src/document-engine/templateEngine.ts` | Ya (100%) | Tidak | **Sangat Reusable** | Mensubstitusi variabel `{{project.*}}`, `{{rab.*}}`, format rupiah, dan teks terbilang bahasa Indonesia. |
| **Document Repository** | Ya | `src/document-engine/repository.ts` | Ya (100%) | Tidak | **Sangat Reusable** | Mendukung isolasi ketat `projectId`, riwayat revisi (R0, R1, R2), dan mutasi aman. |
| **Integrasi Sumber Proyek** | Ya | `src/document-engine/integrations/` | Ya (100%) | Tidak | **Sangat Reusable** | 10 adapter pemetaan untuk project, rab, boq, ahsp, schedule, kurva-s, personnel, equipment, jsa, rkk. |
| **Project Data Repository** | Ya | `src/project-data/repository.ts` | Ya (100%) | Tidak | **Sangat Reusable** | Menyimpan entity terisolasi per project: personnel, equipment, jsa, rkk. |
| **Dokumen Proyek Workspace** | Ya | `src/components/document/TenderDocumentsView.tsx` | Ya | Tidak | **Sangat Reusable** | Dashboard manajemen dokumen proyek, filter status, dan inisiasi dokumen. |
| **Document Editor & Preview** | Ya | `src/components/document/DocumentWorkspace.tsx` | Ya | Tidak | **Sangat Reusable** | Editor kanonikal per dokumen, ganti KOP, deteksi perubahan sumber, audit konsistensi. |
| **Export Engine (PDF/DOCX/XLSX/ZIP)**| Ya | `src/document-engine/exportService.ts`, `packageExporter.ts` | Ya | Tidak | **Sangat Reusable** | Validasi export gate, watermarking draft, penamaan terstandar. |
| **Dokumen AI Interface** | Ya | `src/components/magic-ai/MagicAiSuperView.tsx` (mode `dokumen-ai`) | Parsial | **Duplikasi** | **Refactor Target** | Menyatukan chat, wizard, dan source check namun monolitik (218 KB) dan terpisah dari flow Copilot utama. |
| **Copilot Floating Chatbox** | Ya | `src/components/copilot/EzrabCoAssistantChatbox.tsx` | Ya | Tidak | **Sangat Reusable** | Widget mengambang di pojok kanan bawah yang aktif di seluruh menu workspace. |
| **Full Assistant View** | Ya | `src/components/copilot/EzrabAiAssistantFullView.tsx` | Parsial | **Duplikasi** | **Dead Code (Hapus/Arsipkan)** | Komponen 113 KB yang di-import di WorkspaceView tapi tidak pernah dirender di route mana pun. |
| **AI Action Engine** | Parsial | `aiApiClient.ts` (`ActionProposal`), `aiProviderEngine.ts` | Parsial | Tersebar | **Upgrade Target** | Mekanisme proposal ada, namun belum mengorkestrasi multi-dokumen package, checklist konfirmasi interaktif, dan feedback loop yang seragam. |

---

## 4. EXISTING ROUTES AUDIT TABLE

| Route | Purpose | Component | Status | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| `/app/dashboard` | Main global dashboard | `DashboardOverview` (di WorkspaceView) | Active | Navigasi ringkasan proyek & metrik utama |
| `/app/projects` | Daftar proyek | `ProjectsView` | Active | Manajemen daftar proyek |
| `/app/projects/:id` | Project specific command center | `ManajemenProyekView` | Active | Terisolasi per `projectId` |
| `/app/tender-documents` | Dokumen Proyek Global | `TenderDocumentsView` | Active | Workspace pengelolaan dokumen tender |
| `/app/projects/:id/reports` | Laporan Proyek | `LaporanView` | Active | BOQ, RAB, AHSP, Rekap |
| `/app/magic-ai` | Global AI Super View | `MagicAiSuperView` | Active | Query parameter `?mode=chat\|ded-rab\|dokumen-ai` |
| `/app/projects/:id/ai` | Project-scoped AI | `MagicAiSuperView` | Active | AI dengan konteks proyek aktif |
| `/app/ai-assistant` | Alias AI Assistant | `MagicAiSuperView` | Active | Mengarah ke component yang sama dengan magic-ai |

---

## 5. EXISTING AI IMPLEMENTATION TABLE

| AI Feature | Implementation | Used By | Status | Temuan / Catatan |
| :--- | :--- | :--- | :--- | :--- |
| **aiProviderEngine** | Heuristik konstruksi, multi-model router, fallback provider | `coAssistantService`, `MagicAiSuperView` | Working | Sangat kaya data teknik konstruksi, namun memiliki konflik precedence regex (`pekerja` vs `pekerjaan`). |
| **aiApiClient** | Client API standar dengan `NormalizedAiResponse`, `ActionProposal` | `coAssistantService`, Chatbox | Working | Standar kontrak aman, ada sanitize data kredensial. |
| **coAssistantService** | Service orkestrasi chat & action proposal | `EzrabCoAssistantChatbox`, Quick Actions | Working | Mendukung user session isolation dan deteksi proyek aktif. Belum memanggil Document Engine secara dinamis saat diminta membuat paket dokumen. |
| **aiContextService** | `buildFullAIContext` (RAB summary, Kurva S, Schedule, Report) | `EzrabAiAssistantFullView`, `coAssistantService` | Working | Membaca summary proyek, namun belum mengikutsertakan registry & kelengkapan dokumen. |
| **aiProjectContext** | `buildReadOnlyProjectContext` (RAB items, work items, QTO, schedule) | `aiApiClient` | Working | Read-only context terproteksi untuk mencegah halusinasi. |
| **aiDocumentIntelligence** | `buildAiDocumentContext`, `planProjectDocuments`, `reviewDocumentConsistency` | `dokumenAiModule.test.ts`, `MagicAiSuperView` | Working | Fungsi sudah ada dan valid, namun belum terintegrasi secara seamless ke dalam `coAssistantService`. |

---

## 6. EXISTING DOCUMENT ENGINE MODULES

| Module | Purpose | Dependency | Status |
| :--- | :--- | :--- | :--- |
| `src/document-engine/registry.ts` | Single Source of Truth untuk 19 Definisi Dokumen Konstruksi | `types.ts` | **Production Ready** |
| `src/document-engine/types.ts` | Tipe data kanonikal: `DocumentRecord`, `DocumentDefinition`, dll. | - | **Production Ready** |
| `src/document-engine/requirementEngine.ts` | Evaluasi aturan dokumen (CORE, RECOMMENDED, CONDITIONAL) | `registry.ts`, `types.ts` | **Production Ready** |
| `src/document-engine/completenessEngine.ts`| Perhitungan skor kelengkapan (field & dependency) | `templateEngine.ts`, `types.ts` | **Production Ready** |
| `src/document-engine/templateEngine.ts` | Resolusi variabel, formatting Rupiah, Terbilang IDR | `types.ts` | **Production Ready** |
| `src/document-engine/repository.ts` | LocalDocumentRepository dengan isolasi `projectId` | `types.ts` | **Production Ready** |
| `src/document-engine/validationEngine.ts` | Validasi gate integritas sebelum export | `types.ts` | **Production Ready** |
| `src/document-engine/consistencyEngine.ts`| Cross-document rule consistency audit | `types.ts` | **Production Ready** |
| `src/document-engine/sourceChangeDetector.ts`| Hash fingerprinting sumber data untuk mendeteksi perubahan | `types.ts` | **Production Ready** |
| `src/document-engine/exportService.ts` | Pipeline export ke PDF, DOCX, XLSX | `pdfGenerator`, `docxGenerator`, `xlsxGenerator` | **Production Ready** |
| `src/document-engine/packageExporter.ts` | Batch export multi-dokumen menjadi ZIP terkompresi | `jszip`, `exportService` | **Production Ready** |
| `src/document-engine/integrations/*` | 10 modul pemetaan dari data proyek ke dokumen | `types.ts`, `project-data` | **Production Ready** |

---

## 7. DUPLICATE SYSTEMS IDENTIFIED

1. **Duplicate AI Context Builders**:
   - `src/services/aiContextService.ts` (`buildFullAIContext`): Membaca Project, RAB, Kurva-S, Schedule, Laporan.
   - `src/services/aiProjectContext.ts` (`buildReadOnlyProjectContext`): Membaca Project, RAB, WorkItems, QTO, Schedule.
   - `src/services/aiDocumentIntelligence.ts` (`buildAiDocumentContext`): Membaca Project, RAB, Schedule, Documents.
   - *Masalah*: AI membaca subset data yang berbeda tergantung dari mana dipanggil.
   - *Solusi Konsolidasi*: Bentuk satu **Unified Project Context Engine** yang menyediakan data proyek, DED/QTO, RAB, BOQ, AHSP, Schedule, Kurva S, Resources, dan Documents secara terpadu tanpa duplikasi logic.
2. **Duplicate AI Assistants / Views**:
   - `src/components/magic-ai/MagicAiSuperView.tsx` (218 KB) vs `src/components/copilot/EzrabAiAssistantFullView.tsx` (113 KB).
   - `EzrabAiAssistantFullView` di-import pada `WorkspaceView.tsx` (baris 54) namun **tidak pernah digunakan** (dead code).
3. **Duplicate Chat Handlers for Document Requests**:
   - Di `coAssistantService.ts`, permintaan "buatkan dokumen tender" menghasilkan respons teks statis (markdown panduan), sedangkan di `MagicAiSuperView.tsx` mode `dokumen-ai`, permintaan tersebut memicu pembuatan draft dokumen di repository. Keduanya harus disatukan dalam **AI Action Engine**.

---

## 8. BROKEN / INCOMPLETE FEATURES & BUGS IDENTIFIED

1. **Greedy Substring Matching Bug di `aiProviderEngine.ts`**:
   - Pada baris 412: `p.includes('pekerja')` mencocokkan kata `pekerjaan` (seperti "metode pelaksanaan pekerjaan" atau "item pekerjaan").
   - Akibatnya: Permintaan dokumen teknis seperti "Buatkan metode pelaksanaan pekerjaan berdasarkan RAB dan Schedule" secara keliru ditangani oleh sub-engine pencarian upah tenaga kerja, menyebabkan kegagalan uji `Quick Action 5` pada `dokumenAiModule.test.ts`.
2. **Dokumen AI Terisolasi dari Floating Co-Assistant**:
   - Pengguna yang bertanya di widget floating Copilot ("Buatkan dokumen penawaran untuk proyek ini") hanya menerima balasan teks panduan biasa, bukan proposal action yang dapat langsung di-approve untuk membuat `DocumentRecord`.
3. **Workflow Selector Belum Hadir di Pintu Masuk Pembuatan Dokumen**:
   - Di `TenderDocumentsView.tsx`, tombol pembuatan dokumen saat ini langsung menampilkan modal wizard pemilihan dokumen tanpa opsi pemilihan Workflow terarah (Tender Proyek, Penawaran Kontraktor, PBG / Perizinan, Custom) seperti yang dituntut spesifikasi produk.
4. **Action Proposal Membutuhkan Feedback Loop yang Konsisten**:
   - Sistem proposal yang ada belum menampilkan perbedaan tegas antara **INFORMATION** (tanpa approval), **SUGGESTION** (rekomendasi tanpa mutasi), dan **ACTION** (perubahan data dengan preview dan tombol "Setujui & Terapkan").
5. **AI Activity Log Belum Ada**:
   - Belum ada timeline audit log aktivitas AI (misal: "21:04 AI menganalisis proyek", "21:05 Terdeteksi 3 field belum lengkap", "21:06 Draft Surat Penawaran dibuat").

---

## 9. RECOMMENDED ARCHITECTURE: EZRAB PROJECT COPILOT

Untuk mencapai visi **EZRAB PROJECT COPILOT** tanpa perombakan destruktif, arsitektur yang direkomendasikan adalah:

```text
                        EZRAB AI
                     PROJECT COPILOT
                 (Unified Intelligence)
                           │
                           ▼
               UNIFIED PROJECT CONTEXT
         (Project + DED/QTO + RAB + Schedule +
          Kurva-S + Personnel + Equipment +
          JSA + RKK + AHSP + Document Records)
                           │
                           ▼
                    AI ACTION ENGINE
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   [INFORMATION]     [SUGGESTION]        [ACTION]
   Read-only Stats   Rekomendasi        Requires
   (No Approval)    Data Kurang       User Approval
                           │                 │
                           │                 ▼
                           │        PREVIEW & CONFIRMATION
                           │                 │
                           │                 ▼
                           └────────► DOCUMENT ENGINE
                                  (System of Record)
                                       │
                         ┌─────────────┼─────────────┐
                         ▼             ▼             ▼
                      Registry     Templates      Records
                         │             │             │
                         └─────────────┼─────────────┘
                                       ▼
                             DOKUMEN PROYEK
                               (Workspace)
                                       │
                                       ▼
                                 EXPORT ENGINE
                            (PDF / DOCX / XLSX / ZIP)
```

---

## 10. MIGRATION RISKS & MITIGATION PLAN

| Risiko | Tingkat Risiko | Mitigasi Ketat |
| :--- | :--- | :--- |
| **Regresi Test Existing** | Tinggi | Seluruh 18 sub-suite test (`test:all`) harus tetap 100% PASS setiap selesai satu iterasi. Jangan menghapus test yang sudah ada. |
| **Kerusakan Data Dokumen Tersimpan** | Tinggi | Struktur kanonikal `DocumentRecord` dan format key localStorage `ezrab_documents_<projectId>` dipertahankan 100%. Tidak ada perubahan schema yang memutus kompatibilitas. |
| **Kebocoran Data Antar Proyek** | Kritis | Seluruh pembacaan konteks AI, pembuatan draft, dan repository operations mewajibkan validasi `projectId`. |
| **Mutasi Data Sepihak oleh AI** | Kritis | AI beroperasi dengan aturan: **AI Thinks → AI Suggests → User Reviews → User Approves → System Applies**. Tidak ada perubahan otomatis pada RAB/BOQ/Schedule/Dokumen tanpa konfirmasi pengguna. |

---

## 11. PHASED IMPLEMENTATION PLAN

* **PHASE A — AUDIT ONLY**: (Selesai pada dokumen ini)
* **PHASE B — ARCHITECTURE & UNIFIED PROJECT CONTEXT**:
  - Bangun `UnifiedProjectContext` yang menggabungkan seluruh domain (Project, RAB, BOQ, AHSP, Schedule, Kurva S, Resources, JSA, RKK, Documents).
  - Pastikan satu context bersama untuk floating Copilot dan Dokumen AI.
* **PHASE C — AI ACTION ENGINE & REGEX RESOLUTION**:
  - Perbaiki greedy regex matching di `aiProviderEngine.ts` sehingga query teknis konstruksi tidak terinterupsi parser upah/alat.
  - Implementasikan `AI Action Engine` dengan pemisahan tegas: INFORMATION, SUGGESTION, dan ACTION (dengan User Confirmation Gate).
  - Hubungkan floating Copilot `coAssistantService` ke AI Action Engine untuk pembuatan dokumen proyek.
* **PHASE D — AI DOCUMENT WORKFLOW & PACKAGE BUILDER**:
  - Integrasikan Workflow Selector (Tender Proyek, Penawaran Kontraktor, PBG/Perizinan, Custom).
  - Implementasikan AI Document Package Builder (Analisis Proyek → Rekomendasi Dokumen → Deteksi Data Lengkap/Kurang → Persetujuan → Generate Draft).
  - Tambahkan AI Activity Log.
* **PHASE E — UI/UX POLISH**:
  - Pemisahan jelas: AI sebagai Intelligence Layer, Dokumen Proyek sebagai Workspace Pengelolaan.
  - Tampilkan status kelengkapan, peringatan missing data, dan tombol aksi terpadu.
* **PHASE F — PRODUCTION QA & VALIDATION**:
  - Jalankan `npm run test:all`, `npx tsx src/test/dokumenAiModule.test.ts`, `npx tsc --noEmit`, dan verifikasi build.
* **PHASE G — FINAL CLEANUP & REPORT**:
  - Hapus import dead code (`EzrabAiAssistantFullView`), verifikasi zero regression, dan buat laporan akhir.
