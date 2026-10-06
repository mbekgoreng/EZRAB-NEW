# EZRAB — AUDIT KONDISI AKTUAL (CURRENT STATE AUDIT)
**Dokumen:** `docs/interactive-rab-wizard/00-current-state-audit.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. LATAR BELAKANG & TUJUAN AUDIT
Audit ini memetakan kondisi eksisting arsitektur CoAssistant EZRAB saat menerima perintah umum seperti:
- *"Buatkan RAB Rumah"*
- *"Buat RAB Gedung"*
- *"Buatkan RAB Jalan"*
- *"Buatkan RAB Bangunan Air"*

Tujuan audit adalah memastikan kesiapan fondasi backend, state machine, template engine, dan UI copilot untuk beralih ke pola **Interactive Conversational Wizard** tanpa menghasilkan estimasi sembarangan secara prematur.

---

## 2. TEMUAN KONDISI EKSISTING

### A. Intent Classifier (`server/orchestrator/intentClassifier.ts`)
- **Kondisi:** Saat ini memiliki intent `GENERATE_TEMPLATE_RAB`, `RAB_QUERY`, `PROJECT_QUERY`.
- **Kekurangan:** Belum memiliki intent terisolasi `AUTOMATIC_RAB_START` yang secara tegas memicu conversational wizard state machine. Permintaan umum cenderung langsung menghasilkan jawaban naratif statis atau memicu `get_rab_summary` secara prematur.

### B. AI Orchestrator (`server/orchestrator/aiOrchestrator.ts`)
- **Kondisi:** Menangani small talk, auto-answers, dan memanggil `ProviderFactory.getProvider()`.
- **Kekurangan:** Belum menyimpan session state machine wizard di backend (`wizard_session_id`, `current_step`, `selected_category`, `collected_parameters`).

### C. Construction Calculator Registry (`src/engine/constructionCalculators/`)
- **Kondisi:** Tersedia 40+ modul kalkulator spesifik di `registry.ts` dan `masterJsonSpec.ts` (misal: Pondasi Batu Kali, Sloof Beton, Kolom, Dinding Bata, Atap Baja Ringan, Paving Block, dsb).
- **Kekuatan:** Formula matematis deterministik dan mapping koefisien AHSP PUPR 2026 sudah siap digunakan.

### D. Frontend Copilot (`src/components/copilot/EzrabCoAssistantChatbox.tsx`)
- **Kondisi:** Chatbox mendukung rendering teks markdown, thinking step SSE, dan confirmation proposals.
- **Kekurangan:** Belum mendukung rendering komponen interaktif UI-agnostic: selectable category cards, quick-reply chips, stepper progress, dan dynamic parameter forms.

---

## 3. KESIMPULAN AUDIT & KESIAPAN FONDASI
Fondasi kalkulasi dan otomasi matematis telah **100% siap** di layer engine. Yang dibutuhkan adalah:
1. Penambahan Intent `AUTOMATIC_RAB_START`.
2. Backend Wizard State Machine & API Endpoints (`/api/assistant/wizard/*`).
3. Template Resolver & Parameter Schema Matrix.
4. UI Interactive Assistant Choice & Question Renderer pada CoAssistant.
