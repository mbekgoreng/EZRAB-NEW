# EZRAB AI CORE — MATRIKS & ANALISIS GAP MODEL PROVIDER FALLBACK (FASE 5)

**Tanggal:** 14 September 2026  
**Status Evaluasi:** PARTIAL (Core Fallback Aktif, Multi-Tier Cascade Perlu Enhancement)  
**Total Skenario Uji:** 11 Skenario Resiliensi  

---

## 1. Matriks Evaluasi 11 Skenario Fallback

| No | Skenario Resiliensi Provider | Status | Komponen Aktual | GAP / Actionable Remediation Path |
|---|---|---|---|---|
| **01** | **Primary Model Normal Execution (Ollama / Qwen2.5)** | ✅ **IMPLEMENTED** | `unifiedModelAdapter.ts`, `aiCoreBridge.ts` | Berjalan normal via local HTTP daemon endpoint `127.0.0.1:11434` / `127.0.0.1:8000`. |
| **02** | **Ollama Down ➔ Gemini Flash Fallback** | 🟡 **PARTIAL** | `UnifiedModelAdapter.fallbackAdapter` | Mendukung single fallback adapter, namun belum otomatis me-resolve Gemini API bila konfigurasi statis default ke mock. Diperlukan multi-provider dynamic resolver. |
| **03** | **Gemini 429 (Rate Limit) ➔ OpenAI GPT-4o-mini** | 🟡 **PARTIAL** | `UnifiedModelAdapter` try/catch catch-all | `response.status === 429` tertangkap dalam `try/catch` dan memicu fallback, namun belum ada pembedaan jeda backoff eksponensial (retry-after header). |
| **04** | **OpenAI Outage ➔ Anthropic Claude 3.5 Haiku** | 🟡 **PARTIAL** | `UnifiedModelAdapter` | Rantai fallback saat ini bersifat 1-depth (`this.fallbackAdapter`). Perlu ditingkatkan menjadi array `fallbackChain: ModelAdapter[]`. |
| **05** | **Anthropic Outage ➔ DeepSeek V3** | 🟡 **PARTIAL** | `UnifiedModelAdapter` | Membutuhkan adapter endpoint OpenAI-compatible untuk DeepSeek base URL. |
| **06** | **All Cloud Offline ➔ Rule-Based / KB Fallback** | ✅ **IMPLEMENTED** | `MockAIProvider.ts`, `autoAnswerEngine.ts` | Terverifikasi 100%: Co Assistant tetap mampu menjawab 200 pertanyaan pengetahuan, rumus volume, dan AHSP tanpa LLM eksternal. |
| **07** | **Timeout Primary Model (>40s) ➔ Tier Step-Down** | ✅ **IMPLEMENTED** | `AbortSignal.timeout(40000)`, `aiCoreBridge.ts` | Timeout otomatis membatalkan request yang hang dan melempar `AI_CORE_TIMEOUT` untuk memicu fallback internal. |
| **08** | **Partial Stream Break ➔ Fallback Reconnection** | 🔴 **GAP** | SSE stream in `aiRoutes.ts` | Jika koneksi SSE terputus di tengah jalan, client belum memiliki mekanisme token resumable buffer untuk melanjutkan tanpa request ulang dari awal. |
| **09** | **Structured JSON Schema Validation Failure ➔ Repair Prompt** | 🟡 **PARTIAL** | `generateStructuredOutput` | Saat JSON parse gagal, sistem saat ini mengembalikan raw content / fallback. Perlu menambahkan single-turn JSON fix prompt. |
| **10** | **Context Window Exceeded ➔ Smart Truncation** | ✅ **IMPLEMENTED** | `validateReadOnlyProjectContext`, `aiApiClient.ts` | Payload dibatasi maksimal 96 KB dan 30 item per sub-koleksi untuk memastikan tidak pernah melampaui context limit. |
| **11** | **Multi-Tenant Quota Exhaustion ➔ Graceful 429 Notice** | ✅ **IMPLEMENTED** | `allowRequest`, `aiRoutes.ts` | Rate limiter membatasi request per IP/workspace dan mengembalikan HTTP 429 dengan flag `retryable: true`. |

---

## 2. Ringkasan Kesiapan & Rekomendasi Staging

1. **Untuk Staging:** Konfigurasi fallback saat ini (`Ollama / FastAPI Bridge ➔ Mock/Rule-Based Auto-Answer`) sudah **SANGAT MEMADAI & AMAN** untuk uji fungsional, load test, dan validasi contract tanpa risiko tagihan API pihak ketiga tak terduga.
2. **Untuk Production Roadmap (Post-Staging):** Implementasikan `CascadeFallbackChain` yang menerima daftar provider prioritas `[Ollama, Gemini, OpenAI, Claude, DeepSeek, LocalKB]` untuk menjamin SLA uptime 99.99%.
