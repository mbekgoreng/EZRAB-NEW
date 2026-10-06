# EZRAB AI CORE — System Architecture Specification (Fase 1)

> **Status:** APPROVED & ACTIVE  
> **Versi:** 1.0.0  
> **Target Sistem:** EZRAB AI Core (Pusat Kecerdasan RAB & Estimasi Konstruksi)

---

## 1. Ringkasan Arsitektur

EZRAB AI Core dirancang dengan pendekatan **Modular, Multi-Layered, Fail-Closed, dan Grounded Architecture**. Sistem ini memisahkan secara tegas antara **kemampuan penalaran bahasa alami (LLM)** dengan **kebenaran data deterministik (Calculation Engine & Live Database)**.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             FRONTEND CLIENT (SPA)                                │
│    [Copilot Chatbox]   [Spreadsheet RAB]   [Magic AI Modal]   [Preview Dialog]   │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ HTTPS / SSE Stream (Bearer JWT)
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY & SECURITY GUARD                            │
│  - Session & Token Validator (Supabase Auth)                                     │
│  - Multi-Tenant Isolation Guard (Workspace & Project Boundary)                   │
│  - Prompt Injection & Secret Leakage Inspection                                  │
│  - Rate Limiter & Idempotency Filter                                             │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ Verified Context
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            AI ORCHESTRATOR PIPELINE                              │
│                                                                                  │
│   ┌─────────────────────┐    ┌──────────────────────┐    ┌────────────────────┐  │
│   │  Vocabulary Engine  │───>│    Intent Engine     │───>│   Rules & Policy   │  │
│   │ (Civil Terms & Typo)│    │(Multi-Layer Detect)  │    │      Engine        │  │
│   └─────────────────────┘    └──────────────────────┘    └─────────┬──────────┘  │
│                                                                    │ Decision    │
│           ┌────────────────────────────────────────────────────────┴────────┐    │
│           ▼                                 ▼                               ▼    │
│   ┌───────────────┐                 ┌───────────────┐               ┌──────────┐ │
│   │  Hybrid RAG   │                 │   Live Data   │               │   Tool   │ │
│   │ (FTS + Vector)│                 │ Access Layer  │               │ Registry │ │
│   └───────┬───────┘                 └───────┬───────┘               └────┬─────┘ │
│           │ Retrieved                       │ Official Snapshot          │       │
│           └────────────────────────┬────────┴────────────────────────────┘       │
│                                    ▼                                             │
│                       ┌─────────────────────────┐                                │
│                       │     Context Builder     │                                │
│                       │(Token Budget & Redacted)│                                │
│                       └────────────┬────────────┘                                │
│                                    ▼                                             │
│                       ┌─────────────────────────┐                                │
│                       │   Unified Model Adapter │                                │
│                       │ (Ollama/OpenAI/Fallback)│                                │
│                       └────────────┬────────────┘                                │
│                                    ▼ Draft Output                                │
│                       ┌─────────────────────────┐                                │
│                       │    Answer Validator     │                                │
│                       │(Grounding & Fact Check) │                                │
│                       └────────────┬────────────┘                                │
│                                    ▼ Verified Output                             │
│                       ┌─────────────────────────┐                                │
│                       │ Structured Observability│                                │
│                       │ & Safe Audit Logging    │                                │
│                       └─────────────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Rincian Komponen dan Tanggung Jawab

| Komponen | Tanggung Jawab Utama |
|---|---|
| **1. Model Adapter** | Abstraksi komunikasi LLM (Ollama, OpenAI, OpenRouter, Local vLLM, Vision, Embeddings) dengan capability detection dan dynamic fallback. |
| **2. Security Guard** | Mencegah prompt injection, percobaan eskalasi peran, manipulasi query SQL, serta kebocoran token/kredensial. |
| **3. Vocabulary Engine** | Kamus cerdas istilah teknik sipil, konstruksi SNI/AHSP PUPR, singkatan, penanganan typo berbasis Levenshtein distance, dan sinonim bahasa Indonesia. |
| **4. Intent Engine** | Klasifikasi multi-layer (Rule-based, keyword, vocabulary, fuzzy, dan semantic) untuk 35+ intensi. Short-circuit langsung untuk sapaan dan small-talk. |
| **5. Rules & Policy Engine** | Penegak integritas sistem: Live DB = sumber data dinamis, Knowledge Base = sumber dokumentasi, LLM bukan sumber kebenaran angka. |
| **6. Hybrid RAG Engine** | Multi-tier retrieval (Exact Hash O(1), Token Inverted Index dengan IDF, Typo-tolerant Fuzzy, dan PostgreSQL Full-Text/Vector search). |
| **7. Live Data Access Layer** | Service layer aman berizin ketat untuk membaca status proyek, rekap RAB, Kurva S, dan histori progres langsung dari database. |
| **8. Tool Registry & Execution** | Registrasi 97 tools backend dengan schema input/output tervalidasi, RBAC permissions, dan classification risk level. |
| **9. Two-Stage Function Calling** | Interseptor dua tahap: Tahap 1 = Preview tindakan & estimasi dampak biaya; Tahap 2 = Konfirmasi eksplisit dari user sebelum eksekusi mutasi. |
| **10. Context Builder** | Penyusun prompt terstruktur dengan pembatasan token budget, data minimization, dan redaksi informasi sensitif. |
| **11. Calculation Engine Bridge** | Jembatan deterministik ke `DecimalEngine` dan `CalculationService` untuk kalkulasi volume, koefisien, subtotal, overhead, dan PPN. |
| **12. Answer Validator** | Verifikator grounding jawaban untuk memastikan respons sesuai fakta konteks, tidak mengarang angka, dan tidak mengklaim tool berhasil jika gagal. |
| **13. Credit & Subscription Guard** | Pemeriksa saldo kredit AI dan entitlement paket Pro/Trial dari backend sebelum pemrosesan fitur AI berbayar. |
| **14. Knowledge Ingestion Pipeline** | Pipeline import, normalisasi, chunking, dedup, dan indexing dokumen (PDF, XLSX, CSV, JSONL, DOCX, DED). |
| **15. Evaluation Engine** | Automated testing framework untuk benchmarking akurasi intent, groundedness, recall, latency, dan token efficiency. |
| **16. Observability & Logging** | Structured logging untuk tracing request, metrik latensi, dan jejak audit tanpa mencatat data rahasia/pembayaran. |
| **17. Admin Knowledge Management** | Antarmuka administrasi untuk kurasi dataset, lifecycle status (Draft, Review, Approved, Published), dan re-indexing. |

---

## 3. Boundary & Alur Keamanan

### A. Security Boundary
1. **Frontend Boundary**: Frontend hanya bertindak sebagai presentation layer. Frontend tidak pernah memegang API key privat, tidak menentukan status paket Pro sendiri, dan tidak mengirim data kredensial mentah.
2. **Session Boundary**: Identitas `userId`, `role`, dan `workspaceId` **wajib** diderivasi dari Bearer JWT via `supabase.auth.getUser()`. Data dari header klien tidak dipercayai.
3. **Multi-Tenant Boundary**: Setiap query dan tool execution wajib memvalidasi bahwa `projectId` terdaftar dalam `workspaceId` milik pengguna yang sedang login.
4. **Tool Execution Boundary**: Tool tidak pernah mengeksekusi raw SQL dari model. Semua parameter divalidasi dengan type-safe schema. Operasi tulis membutuhkan konfirmasi user interaktif.

### B. Database Boundary
1. Database PostgreSQL dilindungi oleh **Row Level Security (RLS)**.
2. Interaksi dari server backend menggunakan koneksi berparameter untuk mencegah SQL Injection.
3. Seluruh tabel baru (`ai_knowledge_documents`, `ai_knowledge_entries`, `ai_answer_logs`, `ai_answer_feedback`) memiliki index performa tinggi dan kebijakan audit.

### C. Model Provider Boundary
1. Prompt dikirim ke provider LLM hanya memuat konteks yang relevan (*data minimization*).
2. Jawaban dari LLM diperlakukan sebagai **untrusted text draft** yang wajib melewati `AnswerValidator` sebelum ditampilkan ke user.

---

## 4. Failure Handling & Fallback Strategy

```
[User Request]
       │
       ▼
[Primary Model: Ollama / Local Qwen] ──(Timeout / Error)──> [Secondary Provider: OpenAI / OpenRouter]
       │                                                                  │
       │ (Success)                                                        │ (Error)
       ▼                                                                  ▼
[Generate Response]                                         [Graceful AutoAnswer / KB Fallback]
```

1. **Local Model Offline / Timeout**:
   - Jika Ollama/Qwen lokal tidak merespons dalam 35 detik, sistem otomatis melakukan fallback ke Cloud Provider (OpenAI / OpenRouter) jika diaktifkan.
   - Jika cloud provider juga tidak tersedia, sistem fallback ke `AutoAnswerEngine` in-memory dataset 9.999 Q&A offline tanpa downtime.
2. **Confidence Rendah (< 0.65)**:
   - Sistem tidak memberikan jawaban spekulatif.
   - Sistem mengembalikan respons ramah dengan opsi topik bantuan yang relevan dan meminta pengguna memberikan detail lebih spesifik.
3. **Aksi Tool Gagal**:
   - Model tidak boleh mengklaim operasi berhasil jika backend mengembalikan status gagal.
   - Sistem mengembalikan error deskriptif dalam bahasa Indonesia yang mudah dipahami pengguna.

---

## 5. Scalability & Retention Strategy

1. **In-Memory Inverted Index**:
   - Pencarian teks untuk 9.999 Q&A berjalan in-memory dengan waktu pencarian < 1 milidetik.
2. **Database Indexing**:
   - GIN index untuk full-text search bahasa Indonesia pada kolom `normalized_question`.
   - Index multi-kolom pada `(workspace_id, project_id, created_at)` untuk performa query audit logs dan riwayat chat.
3. **Log Retention**:
   - Log percakapan dan metrik AI dibersihkan secara berkala sesuai kebijakan retensi data (90 hari untuk log debug, permanen untuk audit finansial).
