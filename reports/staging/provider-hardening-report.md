# EZRAB AI CORE — PROVIDER HARDENING & STAGING READINESS REPORT

**Timestamp Evaluasi:** 2026-09-15 12:47:00 (WIB)  
**Versi Sistem:** EZRAB AI Core v2.0.0  
**Environment Target:** Staging Validation (Local Runtime)  
**Security Policy:** Zero Secret Exposure & Multi-Tenant Strict Isolation  

---

## 1. PROVIDER MATRIX

Hasil validasi koneksi dan generasi aktual terhadap seluruh provider yang terdaftar dalam arsitektur:

| Provider | Key Tersedia | Endpoint Valid | Model Valid | Live Generation | Status |
|---|:---:|:---:|:---:|:---:|---|
| **Google Gemini** | **YES** | **PASS** (`v1beta/models`) | **PASS** (`gemini-3.6-flash`, `gemini-3.5-flash-lite`) | **PASS** (`Pong` / `EZRAB_ACTIVE`) | **LOCAL_RUNTIME_VERIFIED (PRIMARY)** |
| **Groq Cloud** | **YES** | **PASS** (`openai/v1/models`) | **PASS** (`qwen/qwen3.8-27b`) | **PASS** (`EZRAB_ACTIVE`, 480ms) | **LOCAL_RUNTIME_VERIFIED (FALLBACK 1)** |
| **Mistral AI** | **YES** | **PASS** (`v1/models`) | **PASS** (`mistral-small-latest`) | **FAIL** (HTTP 429 Quota Exceeded) | **OPTIONAL_PROVIDER_FAILED / RATE_LIMITED** |
| **Ollama Local** | **N/A** (Local) | **PASS** (`127.0.0.1:11434`) | **PASS** (`qwen3:8b`, `qwen2.5vl:7b`) | **PASS** (Local CPU Inference OK) | **LOCAL_RUNTIME_VERIFIED (LOCAL FALLBACK)** |
| **DeepSeek API** | **YES** | **FAIL** (HTTP 401) | **FAIL** | **FAIL** | **DISABLED / OPTIONAL_PROVIDER_FAILED** |
| **MockProvider** | **N/A** (Code) | **N/A** (Offline) | **N/A** (Deterministic) | **PASS** (100% Deterministic) | **AUTOMATED_VERIFIED (ZERO-DOWNTIME)** |

---

## 2. MODEL MATRIX

Pemeriksaan model terdaftar vs model yang benar-benar dapat dipanggil dan menghasilkan output:

| Provider | Configured Model | Verified Available Models | Verified Generation Model | Model Status |
|---|---|---|---|---|
| **Gemini** | `gemini-2.5-flash` *(Deprecated)* | `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.5-flash`, `gemini-3.1-flash-lite` | `gemini-3.6-flash` & `gemini-3.5-flash-lite` | `gemini-2.5-flash` = **INVALID_MODEL**; Target = **LOCAL_RUNTIME_VERIFIED** |
| **Groq** | `llama-3.3-70b-versatile` *(Not assigned)* | `qwen/qwen3.8-27b`, `groq/compound-mini`, `allam-2-7b` | `qwen/qwen3.8-27b` | `llama-3.3-70b` = **INVALID_MODEL**; `qwen3.8-27b` = **LOCAL_RUNTIME_VERIFIED** |
| **Mistral** | `mistral-small-latest` | `mistral-small-latest`, `mistral-large-latest` | *None (Blocked by HTTP 429)* | **RATE_LIMITED** |
| **Ollama** | `qwen2.5:7b-instruct-q4_K_M` | `qwen3:8b`, `qwen2.5vl:7b` | `qwen3:8b` | **LOCAL_RUNTIME_VERIFIED** |
| **DeepSeek** | `deepseek-chat` | *Endpoint Unauthorized (401)* | *None* | **DISABLED** |

---

## 3. PRIMARY & FALLBACK RUNTIME FLOW

Alur orkestrasi runtime berjenjang:
```text
[Incoming User Chat Request]
           │
           ▼
[Google Gemini 3.6 Flash / 3.5 Flash Lite] ──(HTTP 503/429/Timeout)──► [Groq Cloud (qwen/qwen3.8-27b)]
                                                                               │
                                                                   (Quota / Outage)
                                                                               │
                                                                               ▼
[MockProvider (Deterministic Offline)] ◄──(Daemon Offline)── [Ollama Local (qwen3:8b)]
```

- **Fail-Fast Policy:** Setiap provider layer dibatasi timeout 6.000ms - 40.000ms.
- **No Infinite Retries:** Kegagalan HTTP 401 atau 429 langsung meneruskan eksekusi ke provider layer berikutnya tanpa retry loop.
- **Safe Fallback:** Jika seluruh koneksi eksternal terputus, `MockAIProvider` menjamin respon deterministik zero-downtime.

---

## 4. ANALISIS MISTRAL HTTP 429

- **Status:** `OPTIONAL_PROVIDER_FAILED / RATE_LIMITED`
- **Kategori:** Provider Quota Limit (Free Tier Exceeded / Rate Limit). Handshake endpoint `https://api.mistral.ai/v1/models` berstatus HTTP 200 (kredensial valid), namun pemanggilan `chat/completions` ditolak dengan kode `1300` (Rate limit exceeded).
- **Mitigasi:** Gateway tidak melakukan retry berulang ke Mistral dan langsung mengalihkan rute fallback ke Groq atau Ollama Local.

---

## 5. ANALISIS DEEPSEEK HTTP 401

- **Status:** `DISABLED / OPTIONAL_PROVIDER_FAILED`
- **Kategori:** `INVALID_CREDENTIAL`
- **Detail:** Endpoint `https://api.deepseek.com/models` mengembalikan HTTP 401 `Authentication Fails`.
- **Mitigasi:** Provider dinonaktifkan secara aman dalam adapter chain tanpa mengganggu alur failover utama. Secret tidak dicetak dalam log.

---

## 6. STATUS FASTAPI AI CORE

- **Status:** `OPTIONAL_OFFLINE`
- **Port 8000:** Offline (Connection Refused).
- **Gateway Bridge:** Node Gateway (`/api/ai/chat`) mendeteksi `bridgeError` secara otomatis dan melakukan fallback mulus ke internal `aiOrchestrator`.
- **Dampak:** Nol dampak operasional terhadap fungsionalitas chat, kalkulasi RAB, kurva S, dan tool registry karena orkestrator Node internal berjalan penuh.
- **Rekomendasi:** Jalankan `uvicorn main:app --port 8000` di sub-direktori `EZRAB-LOCAL-AI` hanya jika modul Python RAG spesifik dibutuhkan.

---

## 7. STATUS NODE_ENV & PEMISAHAN ENVIRONMENT

- **Current Runtime:** `NODE_ENV=development`
- **Staging Requirement:** `NODE_ENV=staging`
- **Isolasi Database & Secret:** Database production dan secret production strictly **TIDAK DIGUNAKAN**.
- **Physical Staging Status:** `BLOCKED` (Menunggu runner staging terdedikasi dengan file `.env.staging` terisolasi).

---

## 8. BACKEND CHATBOT TEST (LIVE VERIFICATION)

Pengujian end-to-end melalui endpoint resmi `POST http://127.0.0.1:3000/api/ai/chat`:

| Skenario Uji | Endpoint | HTTP Status | Latensi | Respon Non-Empty | Status |
|---|---|:---:|:---:|:---:|---|
| **1. Greeting** | `/api/ai/chat` | **200 OK** | 71 ms | PASS (Konteks terformat rapi) | **LOCAL_RUNTIME_VERIFIED** |
| **2. Domain (RAB)** | `/api/ai/chat` | **200 OK** | 17 ms | PASS (Definisi RAB & komponen akurat) | **LOCAL_RUNTIME_VERIFIED** |
| **3. Kurva S** | `/api/ai/chat` | **200 OK** | 9 ms | PASS (Definisi Kurva S & time schedule akurat) | **LOCAL_RUNTIME_VERIFIED** |
| **4. Read-only Tool / RAB** | `/api/ai/chat` | **200 OK** | 8 ms | PASS (Intensi & ringkasan terproses) | **LOCAL_RUNTIME_VERIFIED** |
| **5. Cross-Tenant Request** | `/api/ai/chat` | **404 Blocked** | 12 ms | PASS (`PROJECT_NOT_FOUND` Fail-Closed) | **LOCAL_RUNTIME_VERIFIED** |

---

## 9. TENANT ISOLATION TEST

- **Pengujian:** Akses proyek `PRJ-TROPIS-MODERN-01` milik `ws-default-ezrab` oleh tenant `ws-tenant-beta`.
- **Hasil:** Permintaan ditolak dengan status HTTP 404 (`PROJECT_NOT_FOUND`).
- **Verifikasi:** Tidak ada data proyek, item pekerjaan, atau konteks sensitif yang bocor antar tenant.
- **Status:** **AUTOMATED_VERIFIED** & **LOCAL_RUNTIME_VERIFIED**.

---

## 10. SECRET EXPOSURE AUDIT

Pemeriksaan keamanan kode dan bundle terhadap kebocoran secret:
- **Frontend Source (`src/`):** Bebas dari API key, token database, atau private credentials.
- **Frontend Build (`dist/`):** 0 pola secret API key (`AIzaSy...`, `sk-...`, `gsk_...`) ditemukan pada bundle Javascript.
- **Environment Prefix (`VITE_*`):** Hanya variabel publik (`VITE_APP_TITLE`, `VITE_API_BASE_URL`) yang diekspos.
- **Repository Safety (`.gitignore`):** File `.env`, `.env.*` (kecuali `.example`), file key/cert, dan virtual environment diabaikan secara ketat.
- **Status:** **STATIC_VERIFIED** (PASS — Zero Leakage).

---

## 11. AUTOMATED TESTS

Eksekusi perintah resmi pengujian dan build:
- `npm test`: **PASS** (28/28 verification test scenarios passed 100%).
- `npx tsc --noEmit`: **PASS** (0 TypeScript type errors).
- `npm run build`: **PASS** (Vite production bundle built successfully in 20.30s).
- **Status:** **AUTOMATED_VERIFIED**.

---

## 12. BLOCKERS

1. **Physical Staging Server:** Runner fisik staging belum diprovision; validasi saat ini berjalan di local staging rehearsal runtime (`BLOCKED`).
2. **Dedicated Staging Database:** Perlu provisioning isolated Supabase staging database instance sebelum Actual Staging Deployment (`BLOCKED`).

---

## 13. RISIKO

- **Google Gemini Model Drift:** Google AI Studio secara berkala mendepresiasi seri model preview/lama (misal: `gemini-2.5-flash` menjadi `gemini-3.6-flash`). Diperlukan pemantauan model slug berkala.
- **Mistral Quota Exceeded:** Mistral API saat ini mengalami rate limiting (HTTP 429) dan harus tetap berada di layer sekunder/non-prioritas.

---

## 14. REKOMENDASI TINDAKAN

1. Gunakan **`gemini-3.6-flash`** sebagai model default Gemini dan **`qwen/qwen3.8-27b`** untuk Groq fallback.
2. Pertahankan `MockAIProvider` sebagai pengaman terakhir (fail-closed zero-downtime).
3. Buat file `.env.staging` pada physical runner staging saat infrastruktur staging siap.

---

## 15. RELEASE DECISION

| Komponen | Status Evaluasi | Keputusan |
|---|---|---|
| **AI Provider & Failover** | **LOCAL_RUNTIME_VERIFIED** | **READY_TO_EXECUTE** |
| **Backend Chatbot & Tools** | **LOCAL_RUNTIME_VERIFIED** | **READY_TO_EXECUTE** |
| **Tenant Isolation & Security** | **STATIC_VERIFIED & AUTOMATED_VERIFIED** | **READY_TO_EXECUTE** |
| **Physical Staging Environment** | **NOT_VERIFIED / BLOCKED** | **HOLD (Menunggu Runner)** |
| **Manual Pilot UAT** | **READY_TO_EXECUTE** | **READY_TO_EXECUTE** |
| **Production Deployment** | **NO_GO** | **STRICTLY PROHIBITED** |

**KEPUTUSAN AKHIR:**  
- **AI Provider:** `LOCAL_RUNTIME_VERIFIED`  
- **Physical Staging:** `NOT_VERIFIED / BLOCKED`  
- **Manual UAT:** `READY_TO_EXECUTE`  
- **Production:** `NO_GO`  
