# EZRAB — TINJAUAN KESIAPAN PHASE A (PHASE A READINESS REVIEW)
**Dokumen:** `docs/interactive-rab-wizard/09-phase-a-readiness-review.md`  
**Modul:** Interactive Automatic RAB Wizard (Scope: Phase A — Rumah Tinggal)  
**Tanggal:** 2026-09-15  

---

## 1. FITUR YANG BENAR-BENAR SUDAH TERSEDIA (SOURCE CODE AKTUAL)
Berdasarkan audit langsung pada codebase:
1. **Mathematical Calculation Engine (`src/engine/constructionCalculators/` & `server/services/calculationService.ts`):**
   - Perhitungan volume dan koefisien AHSP untuk pekerjaan pondasi batu kali, sloof beton, kolom, balok, dinding bata ringan/merah, plesteran, acian, lantai keramik/granit, plafon gypsum, dan rangka atap baja ringan sudah tersedia dan teruji presisi.
2. **Deterministic Rekalkulasi & PPN 11%:**
   - `CalculationService.calculateSubtotal`, overhead, profit, dan pajak PPN 11% beroperasi dengan `SafeDecimalEngine` (zero floating drift).
3. **Multi-Tenant Isolation Guard & Auth Middleware (`server/middleware/`):**
   - Validasi `workspace_id` dan otentikasi role `ESTIMATOR`, `PROJECT_MANAGER`, `ADMIN` aktif fail-closed.
4. **Tool Registry & Confirmation Gate (`server/tools/toolRegistry.ts`):**
   - Mekanisme 2-step confirmation untuk mutasi RAB (`add_rab_item`, `update_rab_item`) sudah berjalan.
5. **Chatbox CoAssistant (`src/components/copilot/EzrabCoAssistantChatbox.tsx`):**
   - UI chat bubble, auto-scroll, thinking state, dan proposal action confirmation telah aktif.

---

## 2. FITUR YANG HANYA BERUPA DESAIN / DOKUMENTASI (BELUM TERKODE)
1. **Intent `AUTOMATIC_RAB_START`:**
   - Belum didaftarkan di `intentClassifier.ts`. Saat ini input "Buatkan RAB Rumah" masih masuk ke `GENERATE_TEMPLATE_RAB` atau `PROJECT_QUERY`.
2. **Wizard Session State Machine (`server/services/wizardStateMachine.ts`):**
   - Belum ada modul state machine backend untuk mengelola `wizard_session_id`, `currentStep`, dan `collectedParameters`.
3. **Template Resolver untuk Rumah Tinggal (`server/services/templateResolver.ts`):**
   - Belum ada resolver schema yang menghubungkan `HOUSE-T36-1FL`, `HOUSE-T45-1FL`, `HOUSE-T70-1FL`, `HOUSE-T36-2FL` ke modul kalkulator.
4. **Backend REST Endpoints (`server/api/wizardRoutes.ts`):**
   - Endpoint `/api/assistant/wizard/start`, `answer`, `back`, `cancel`, `preview`, `confirm` belum ada.
5. **Interactive Choice & Question Renderer UI (`src/components/copilot/AssistantWizardRenderer.tsx`):**
   - Frontend CoAssistant belum memiliki komponen render kartu pilihan interaktif (`AssistantChoice`) dan form parameter stepper.

---

## 3. FILE SOURCE YANG RELEVAN
- `server/orchestrator/intentClassifier.ts` (Klasifikasi intent wizard)
- `server/orchestrator/aiOrchestrator.ts` (Inisiasi wizard session & short-circuit)
- `server/database/dbAdapter.ts` (Penyimpanan state session wizard di memory/db)
- `server/services/calculationService.ts` (Kalkulasi deterministik RAB)
- `server/index.ts` (Routing HTTP gateway)
- `src/components/copilot/EzrabCoAssistantChatbox.tsx` (Tampilan UI chatbox)
- `src/services/coAssistantService.ts` & `src/services/aiApiClient.ts` (Client API)

---

## 4. GAP ANTARA DESAIN DAN IMPLEMENTASI
- **Gap 1:** CoAssistant saat ini hanya mengembalikan `string content` atau `actionProposal`. Diperlukan perpanjangan tipe response agar mendukung `wizardResponse` (`AssistantWizardResponse`).
- **Gap 2:** Belum ada pencegahan eksekusi prematur jika parameter rumah (luas, lantai, pondasi, atap) belum dipilih user.

---

## 5. DEPENDENCY YANG BELUM TERSEDIA
- **Nihil (Semua dependency inti sudah terinstall):** React, Lucide Icons, Node.js HTTP Server, TypeScript, dan SafeDecimalEngine sudah tersedia di repositori.

---

## 6. RISIKO TERHADAP FITUR RAB LAMA
- **Risiko:** Perubahan pada `aiOrchestrator.ts` atau `intentClassifier.ts` dapat mempengaruhi intent chat standar (greetings, tanya Kurva S, cari AHSP).
- **Mitigasi:** Intent `AUTOMATIC_RAB_START` dibuat spesifik hanya untuk frasa inisiasi RAB baru ("buatkan rab...", "hitung rab..."). Seluruh 28 skenario test eksisting wajib diuji ulang (regression test).

---

## 7. DAFTAR FILE YANG AKAN DIBUAT / DIUBAH (PHASE A ONLY)
### File Baru:
1. `server/services/templateResolver.ts` (Katalog template Rumah T36, T45, T70, T36 2Lt)
2. `server/services/wizardStateMachine.ts` (Pengelola sesi & validasi parameter step)
3. `server/api/wizardRoutes.ts` (API Gateway `/api/assistant/wizard/*`)
4. `src/components/copilot/AssistantWizardRenderer.tsx` (Komponen visual card pilihan & form)
5. `server/test/interactiveRabWizard.test.ts` (Automated Acceptance Test Suite)

### File yang Diubah:
1. `server/orchestrator/intentClassifier.ts` (Menambahkan `AUTOMATIC_RAB_START`)
2. `server/orchestrator/aiOrchestrator.ts` (Routing ke wizard state machine)
3. `server/index.ts` (Mendaftarkan `handleWizardApiRequest`)
4. `src/services/aiApiClient.ts` & `src/services/coAssistantService.ts` (Mendukung tipe wizard response)
5. `src/components/copilot/EzrabCoAssistantChatbox.tsx` (Merender `AssistantWizardRenderer`)

---

## 8. RENCANA IMPLEMENTASI BERTAHAP (VERTICAL SLICE T36)
1. **Langkah 1 (Backend Core):** Buat `templateResolver.ts` untuk Rumah (`HOUSE-T36-1FL`, `HOUSE-T45-1FL`, `HOUSE-T70-1FL`, `HOUSE-T36-2FL`, `CUSTOM_HOUSE`) dengan data item pekerjaan lengkap untuk Type 36 (Pondasi Batu Kali, Sloof 15/20, Kolom Praktis 15/15, Ringbalk, Dinding Bata Ringan, Plafon Gypsum, Atap Baja Ringan + Genteng Metal, Lantai Keramik 40x40, Sanitair).
2. **Langkah 2 (State Machine & API):** Buat `wizardStateMachine.ts` dan `wizardRoutes.ts`.
3. **Langkah 3 (Intent & Orchestrator Hook):** Tambahkan `AUTOMATIC_RAB_START` ke `intentClassifier.ts` dan `aiOrchestrator.ts`.
4. **Langkah 4 (Frontend UI):** Buat `AssistantWizardRenderer.tsx` dan integrasikan ke `EzrabCoAssistantChatbox.tsx`.
5. **Langkah 5 (Automated Test & Verification):** Buat dan jalankan test suite unit, integrasi, dan regression test.

---

## 9. DAFTAR TEST YANG HARUS DIBUAT
1. **Unit Test:** `intentClassifier` mendeteksi "Buatkan RAB Rumah" sebagai `AUTOMATIC_RAB_START`.
2. **API Test:** `POST /api/assistant/wizard/start` mengembalikan 5 pilihan tipe rumah.
3. **State Machine Test:** Pemilihan `HOUSE-T36-1FL` mengubah step ke `BASIC_PARAMETER_COLLECTION` dan meminta luas bangunan, lantai, pondasi, dsb.
4. **Calculation Gating Test:** Memastikan `CalculationService` TIDAK dijalankan sebelum parameter lengkap dan user belum menekan tombol hitung.
5. **Confirmation Gating Test:** Memastikan database/spreadsheet TIDAK mengalami mutasi sebelum `confirm` dipanggil.
6. **Regression Test:** Menjalankan 28 verification test eksisting.

---

## 10. KEPUTUSAN KESIAPAN (DECISION)
**STATUS: `READY WITH CONDITIONS`**  
- **Kondisi:** Implementasi dibatasi secara ketat pada **Vertical Slice Rumah Type 36** dan katalog template Rumah (Phase A). Seluruh kalkulasi wajib deterministik tanpa angka halusinasi LLM.
