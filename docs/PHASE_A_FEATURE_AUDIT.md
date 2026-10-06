# EZRAB — PHASE A FEATURE & FUNCTION AUDIT

## 1. Routing & Navigation Mapping

### Global Routes
*   **Dashboard** (`/app/dashboard`)
*   **Proyek** (`/app/projects`)
*   **RAB & Estimasi** (`/app/estimate`)
*   **EZRAB Magic AI** (`/app/magic-ai`)
*   **Volume Calculation / QTO-VC** (`/app/volume-calculation`)
*   **Template RAB** (`/app/template-rab`)
*   **AHSP** (`/app/ahsp`)
*   **QTO** (`/app/qto`)
*   **Manajemen Proyek** (`/app/management`)
*   **Laporan** (`/app/reports`)
*   **Dokumen Tender** (`/app/tender-documents`)
*   **Keuangan Proyek** (`/app/finance`)
*   **Resources** (`/app/resources`) -> Material, Upah, Alat, Harga Proyek, Suppliers
*   **Pengaturan & Preferensi** (`/app/settings`, `/app/account/preferences`)
*   **Enterprise & Subscription** (`/app/enterprise`, `/app/subscription`)

### Project-Scoped Routes (`/app/projects/:projectId/...`)
*   **Manajemen Proyek** (`dashboard`)
*   **RAB & Estimasi / Daftar Pekerjaan** (`estimate`, `estimate?view=work-items`)
*   **QTO / Volume Calculation** (`qto`, `qto?view=calculator`)
*   **AHSP** (`ahsp`)
*   **Resources** (`resources`) -> Material, Upah, Alat, Suppliers
*   **Jadwal / Schedule** (`schedule`)
*   **Kurva S** (`curve-s`)
*   **Laporan** (`reports/rab`, `reports/boq`, `reports/recap`, `reports/ahsp`)
*   **Keuangan Proyek** (`finance`)
*   **Pengaturan Proyek** (`settings`)
*   **EZRAB AI Copilot** (`ai` atau `ai-assistant`)

---

## 2. Document Engine Domain Mapping
Terdapat **19 Dokumen Inti** dalam `src/document-engine/registry.ts` yang berfungsi sebagai System of Record (SoR):

### A. Administration (Administrasi)
1.  **Surat Penawaran Tender** (TDR-ADM-001)
2.  **Formulir Data Kualifikasi** (TDR-ADM-002)
3.  **Pakta Integritas** (TDR-ADM-003)
4.  **Surat Pernyataan Sedia Personil** (TDR-ADM-004)
5.  **Surat Pernyataan Kompetensi** (TDR-ADM-005)
6.  **Surat Pernyataan Kesanggupan** (TDR-ADM-006)

### B. Technical (Teknis)
7.  **Metode Pelaksanaan** (TDR-TEC-001)
8.  **Daftar Alat & Personil** (TDR-TEC-002)
9.  **Quality Plan** (TDR-TEC-003)

### C. Commercial (Komersial)
10. **BOQ (Bill of Quantities)** (TDR-COM-001)
11. **RAB (Rencana Anggaran Biaya)** (TDR-COM-002)
12. **AHSP** (TDR-COM-003)
13. **Rekapitulasi Pekerjaan** (TDR-COM-004)
14. **Bobot Pekerjaan** (TDR-COM-005)

### D. Schedule (Penjadwalan)
15. **Time Schedule** (TDR-SCH-001)
16. **Kurva-S** (TDR-SCH-002)

### E. HSE (Keselamatan, Kesehatan Kerja & Lingkungan)
17. **RKK** (TDR-HSE-001)
18. **IBPR** (TDR-HSE-002)
19. **JSA** (TDR-HSE-003)

---

## 3. Deep Domain Audit (16 Domains)

### 3.1 Project Management
*   **Route & UI**: `/app/projects`, `/app/projects/:projectId`, `ProjectsView`, `ManajemenProyekView`.
*   **Workflow**: Create Project (Manual / Template / DED / Magic AI) → Select → Edit metadata → Switch context.
*   **Persistence**: `localStorage` (`ezrab_prod_projects`, `ezrab_prod_active_project_id`).
*   **Project Isolation**: PASS. Data project A (RAB, QTO, Dokumen, Finance, Schedule) tidak bocor ke Project B. `currentProject` tidak melakukan fallback ke `projects[0]` jika `projectId` tidak cocok.
*   **Status**: **PASS**

### 3.2 Dashboard
*   **Route & UI**: `/app/dashboard`, `EzrabAiDashboardView`.
*   **Metrics**: Total Proyek, Total RAB, Proyek Berjalan, Proyek Selesai, Quick Kickoff Pathways, Aktivitas Terakhir.
*   **Calculation**: Dihitung dinamis dari state aktual `projects.reduce` dan `projectRabItems.reduce`, tanpa mock hardcoded.
*   **Status**: **PASS**

### 3.3 Template RAB
*   **Route & UI**: `/app/template-rab`, `TemplateRabCatalogView`.
*   **Engine**: `RabTemplateService` (`src/services/rabTemplateService.ts`).
*   **Multi-Sector Catalog**: Terinventarisasi 18 tipe Rumah Tinggal, 5 Jalan & Transportasi, 3 Perkerasan Paving, 4 SDA & Irigasi, 3 Gedung, 2 Bangunan Tinggi, 2 Hotel, 2 Fasilitas Kesehatan, 2 Fasilitas Pendidikan, 3 Industri & Gudang, 3 Utilitas, 2 Landscape, 2 MEP, 2 Renovasi.
*   **Reusability & Determinism**: Mengubah parameter (luas bangunan 36 m² ke 72 m²) mengubah volume item dan total estimasi secara deterministik tanpa float drift (`SafeDecimalEngine`).
*   **Verification**: Teruji via `rabTemplateExpansion.test.ts` (11/11 test group PASS).
*   **Status**: **PASS**

### 3.4 Volume Calculator
*   **Route & UI**: `/app/volume-calculation`, `/app/qto-vc`, `QtoCalculatorView`.
*   **Engine**: `CoreCalculatorRegistry` (19 legacy calculators, 30 residential calculators, 39 road calculators, 97 civil expansion calculators).
*   **Verification**: Calculator library telah terinventarisasi dan critical calculator suites yang diuji PASS (Core tests 74/74, Residential 167/167, Road 266/266, Boundary tests); full per-calculator E2E verification dapat dilakukan sebagai QA expansion bila diperlukan.
*   **Edge Cases**: Division by zero memunculkan `NumericValidationError`, negative value ditolak jika tidak diizinkan, sanitasi input terjaga.
*   **Apply to RAB**: Terhubung ke `executeCalculationAndSave` dan `QtoAdapter` yang berstatus `CALCULATED` dengan `projectId` authoritatif.
*   **Status**: **PASS (Evidence-based for critical suites)**

### 3.5 Material & Harga
*   **Route & UI**: `/app/resources`, `MaterialDatabaseView`, `PriceProvenanceModal`, `PriceResolutionDrawer`.
*   **Repository & Engine**: `PriceRepository`, `ProjectPriceEngine`, `PriceResolver`.
*   **Hierarchy Resolusi Aktual**:
    1. Locked Revision (`revisionId`)
    2. Project Override (`setProjectOverride`, active, project-scoped)
    3. Project Price (`setProjectPrice`, active quotation, valid until)
    4. Expired fallback ke Database Referensi
    5. Master Reference (Official HSD 2026 / PUPR SE DJBK / Indonesian Prices)
    6. Manual Input
    7. Fail-Closed / `PRICE_NOT_FOUND`
*   **Status**: **PASS**

### 3.6 AHSP
*   **Route & UI**: `/app/ahsp`, `AhspExplorerView`.
*   **Engine**: `ahspCalculationEngine`, `ALL_OFFICIAL_AHSP_ITEMS` (PUPR 2026).
*   **Dual DB Check**: Tidak ada engine/database AHSP kedua. Semua query menggunakan referensi AHSP nasional tunggal.
*   **Komponen**: Koefisien tenaga kerja (upah), bahan (material), dan peralatan (sewa alat) terdistribusi akurat.
*   **Status**: **PASS**

### 3.7 RAB
*   **Route & UI**: `/app/estimate`, `/app/projects/:projectId/estimate`, `RabEstimasiView`.
*   **End-to-End Workflow**:
    Create Project → Input Item / Apply Template → Volume x Unit Price → Subtotal per WBS Category → Direct Cost → Overhead (5%) → Profit (5%) → Subtotal Sebelum Pajak → PPN (11%) → Grand Total.
*   **Data Integrity**: Tidak ada pembagian nol, tidak ada NaN, item tersimpan debounced ke `ezrab_prod_rab_items` terisolasi per `projectId`.
*   **Status**: **PASS**

### 3.8 DED → RAB
*   **Route & UI**: `/app/magic-ai?mode=ded-rab`, `DedAnalysisWorkspace`, `DedReviewModal`.
*   **Pipeline**: Ingest (SHA-256) → Render Page → Multi-Pass AI Analysis → Canonical Elements → Deterministic QTO → AHSP Matcher → Central Price Resolver → Review Summary → Explicit User Approval Gate → Official RAB Mutation.
*   **Zero Items Bug Check**: Jika 0 item terverifikasi diekstrak, pipeline secara jujur memanggil `jobTracker.fail('ANALYSIS FAILED / NO VERIFIED ITEMS')` dengan `success: false`. Tidak menyuntikkan item dummy palsu.
*   **Status**: **PASS**

### 3.9 Schedule
*   **Route & UI**: `/app/projects/:projectId/schedule`, `ManajemenProyekView`.
*   **Engine**: `UnifiedProjectEngine.recalculateScheduleAndKurvaS`.
*   **Integrasi**: Terhubung dengan durasi proyek dan task WBS.
*   **Status**: **PASS**

### 3.10 Kurva-S
*   **Route & UI**: `/app/projects/:projectId/curve-s`, `EstimatorKurvaSView`.
*   **Engine**: `kurvaSEngine.ts` (`generateKurvaSData`).
*   **Distribusi**: Bobot kumulatif rencana dihitung mingguan dari durasi task dan subtotal RAB hingga mencapai tepat 100.00% pada minggu akhir.
*   **Status**: **PASS**

### 3.11 Dokumen Proyek
*   **Route & UI**: `/app/tender-documents`, `TenderDocumentsView`, `DocumentWorkspace`.
*   **Engine & System of Record**:
    *   19 definisi dokumen resmi di `src/document-engine/registry.ts`.
    *   Persistence terisolasi per project via `LocalDocumentRepository(projectId)`.
    *   `completenessEngine`: mengecek kelengkapan variabel wajib sebelum ekspor.
    *   `sourceChangeDetector`: melacak `sourceHash` dari data proyek.
*   **Verification**: Teruji via `phase5_3ProjectDocumentsUx.test.ts` (28/28 PASS).
*   **Status**: **PASS**

### 3.12 Project Finance
*   **Route & UI**: `/app/finance`, `ProjectFinanceView`.
*   **Repository**: `ProjectFinanceRepository(projectId)` (`src/domain/finance/repository.ts`).
*   **Sumber Angka**: Kontrak Proyek, Real RAB, Termin, Invoice, Pembayaran Aktual, dan Biaya Pengeluaran. Tidak ada mock data atau halusinasi AI.
*   **P1 Finding**: `saveTermin` sebelumnya berisiko crash jika `termin.name` bernilai undefined saat `.trim()` dipanggil. Telah diperbaiki dengan fallback yang aman dan fleksibilitas alias `title`.
*   **Status**: **PASS (FIXED & TESTED)**

### 3.13 AI Chat
*   **Route & UI**: `MagicAiSuperView` (fullscreen) & `EzrabCoAssistantChatbox` (floating launcher).
*   **Single-Mascot Rule**: Floating launcher disembunyikan saat pengguna berada di halaman Magic AI untuk mencegah tabrakan UI.
*   **Action Proposal Gate**: AI tidak dapat langsung memutasi RAB/dokumen tanpa `ActionProposal` yang disetujui pengguna (Rule 18-20).
*   **Classification Regex**: Tidak ditemukan benturan regex `pekerja` vs `pekerjaan` di normalizer (`dedAhspMatchingEngine` hanya me-replace `pekerjaan`, membiarkan kata `pekerja` pada upah tenaga kerja tetap utuh).
*   **Status**: **PASS**

### 3.14 Google Sheets
*   **Engine**: `spreadsheetSyncEngine`, `dedSpreadsheetSync`.
*   **Format**: Sinkronisasi 9 sheet teknis dengan struktur sel terstandarisasi.
*   **Status**: **PASS**

### 3.15 Export
*   **Engine**: `excelExportEngine.ts` (ExcelJS), PDF & DOCX generator.
*   **Quality Test**: 60/60 lulus pada `phase5_4ExportQuality.test.ts`. Formula aktif (`=SUM`, `=vol*rate`), pagination halaman panjang, sanitasi karakter nama berkas, manifest ZIP.
*   **Status**: **PASS**

### 3.16 Settings / Subscription / Entitlement
*   **Route & UI**: `/app/settings`, `/app/subscription`, `UnifiedSettingsView`, `PricingSection`.
*   **User Management**: `ClientUserManagementService` dengan pembagian peran (SUPER_ADMIN, ESTIMATOR, VIEWER).
*   **Status**: **PASS**

---

## 4. Audit Findings Summary

| ID | Domain | Feature | File | Current Behavior | Expected Behavior | Severity | Fix Status |
|---|---|---|---|---|---|---|---|
| F-01 | Finance | `saveTermin` undefined name | `src/domain/finance/repository.ts` | Crash `Cannot read properties of undefined (reading 'trim')` jika `termin.name` tidak terisi | Fallback aman ke `(termin.name \|\| termin.title \|\| '').trim() \|\| default` + type-safe optional fields | P1 | **FIXED & VERIFIED** |
| F-02 | CoAssistant vs SuperView | Session Asynchrony | `src/components/copilot/EzrabCoAssistantChatbox.tsx` | Sesi percakapan floating chatbox terpisah dari sesi fullscreen Magic AI | Sinkronisasi riwayat pesan antar-mode | P3 | **Scheduled for Phase C** (Unified Orchestration) |

---

## 5. Verification Matrix
*   **TypeScript Compiler (`npx tsc --noEmit`)**: **PASS (0 Errors)**
*   **Core Calculator Tests (`npm test`)**: **PASS (74/74 Tests)**
*   **Phase B Unified Context Tests (`npm run test:phaseB`)**: **PASS (18/18 Tests)**
*   **Phase A Deep Domain Audit Tests (`src/test/phaseA_deepDomainAudit.test.ts`)**: **PASS (13/13 Tests)**
*   **Phase 5.4 Export Quality Tests**: **PASS (60/60 Tests)**
*   **Phase 6 Road Calculator Tests**: **PASS (266/266 Tests)**
*   **Universal Template RAB Tests**: **PASS (11/11 Test Groups)**
*   **Project Documents UX Tests**: **PASS (28/28 Tests)**
*   **Project Finance Verification Tests**: **PASS (9/9 Tests)**

---
**Status Audit**: `DEEP DOMAIN AUDIT COMPLETED`. P1 Fix implemented & regression-tested. Bukti audit terverifikasi via test suite.
